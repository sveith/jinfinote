#!/usr/bin/python
# -*- coding: utf-8 -*-

PORT = 8080

try:
	import json
except ImportError:
	import simplejson as json

import urllib

from binascii import hexlify
from random import getrandbits
from struct import pack

from twisted.web import server, resource, static, error
from twisted.internet import reactor
from websocket import WebSocketSite, WebSocketHandler

class TransportHandler(WebSocketHandler):
	def __init__(self, transport):
		WebSocketHandler.__init__(self, transport)

		self.uid = None
		self.session = None
	
	def frameReceived(self, frame):
		# Decode JSON data contained in the frame, which is an array of commands.
		commands = json.loads(unicode(frame, "utf8"))		
		
		# Each command is a tuple of a command name and an array containing its arguments.
		for command, args in commands:
			if command == "join_session":
				# The client has to issue this command before any further commands will be
				# processed. It associates this connection with the given session.

				session_name = args[0]

				if session_name in SessionDispatcherResource.sessions:
					SessionDispatcherResource.sessions[session_name].userJoined(self)
				else:
					print self, "trying to join unknown session", session_name
			
			# Pass the command on for further processing in the session itself.
			if self.session is not None:
				self.session.commandReceived(self, command, args)
	
	def postCommand(self, command, args=[]):
		self.transport.write(json.dumps([[command, args]]))
	
	def connectionLost(self, reason):
		if self.session is not None:
			self.session.userDisconnected(self)

class SessionDispatcherResource(resource.Resource):
	"""Creates and returns sessions as needed."""
	sessions = {}
	
	def getChild(self, path, request):
		if path:
			if not path in self.sessions and path.isalnum():
				# The given session does not exist yet, but has a valid name
				self.sessions[path] = SessionResource(path)
			
			if path in self.sessions:
				# The requested session exists
				return self.sessions[path]
		
		# The path is invalid
		return resource.NoResource()

class SessionResource(resource.Resource):
	"""Functionality for an individual session"""
	template = open("template.html", "rt").read()
	
	def __init__(self, path):
		self.path = path

		self.current_uid = 1
		self.log = []
		self.peers = {}
	
	def render(self, request):
		# The template has a placeholder for this session's name, which we fill in
		# before rendering it to the browser.
		return self.template % {"path": urllib.quote(self.path)}

	def userJoined(self, transport):
		# A new user has joined this session, so we assign it the next free user ID.
		transport.session = self
		transport.uid = self.current_uid
		self.current_uid += 1

		self.peers[transport.uid] = transport

		# Tell the client what its new user ID is.
		transport.postCommand("assign_uid", [transport.uid,])
	
	def userDisconnected(self, transport):
		if transport.uid in self.peers:
			# The client has disconnected - remove it from our list of peers.
			del self.peers[transport.uid]
	
	def commandReceived(self, transport, command, args):
		print "%s\tUser %s\t%s\t%s" % (self.path, transport.uid, command.ljust(12), "\t".join(unicode(arg) for arg in (args or [])))

		if command == "sync":
			# The client wants to obtain the current state of the document.
			transport.postCommand("sync_begin")
			
			# Replay the log.
			for lcommand, largs in self.log:
				transport.postCommand(lcommand, largs)
			
			transport.postCommand("sync_end")
		elif command in ("insert", "delete", "undo"):
			# The client has issued an insert, delete or undo command.
			# Insert the command into the log and broadcast it to all peers.
			self.log.append([command, args])
			self.broadcastCommand(command, args)
	
	def broadcastCommand(self, command, args=[]):
		for peer in self.peers:
			self.peers[peer].postCommand(command, args)

class RootResource(resource.Resource):
	def getChild(self, name, request):
		if name == '':
			return self
		return resource.Resource.getChild(self, name, request)

	def render(self, request):
		# This is called when accessing the root URL without a session name.
		# Create a new random session name and redirect to it.

		sessionName = hexlify(pack("<L", getrandbits(47)))
		request.redirect("/session/" + sessionName)
		request.finish()
		
		return server.NOT_DONE_YET

if __name__ == "__main__":
	root = RootResource()

	# Mount the directories containing our static files
	staticDir = static.File("./static/")
	staticDir.putChild("algorithm", static.File("../algorithm/"))
	staticDir.directoryListing = lambda: error.ForbiddenResource()
	root.putChild("static", staticDir)

	# Create a resource that spawns new sessions as they are accessed
	root.putChild("session", SessionDispatcherResource())
	
	# Create a transport endpoint that can be accessed using a WebSocket
	site = WebSocketSite(root)
	site.addHandler("/transport", TransportHandler)
	
	# Start listening
	listener = reactor.listenTCP(PORT, site)

	print "EXPERIMENTAL SERVER - Do not use in production environments!"
	print "Read the README file before using this."
	print

	listeningHost = listener.getHost()
	print "Listening for HTTP connections on %s:%s" % (listeningHost.host, listeningHost.port)
	print
	
	reactor.run()
