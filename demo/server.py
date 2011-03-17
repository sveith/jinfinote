#!/usr/bin/python
# -*- coding: utf-8 -*-

try:
	import json
except ImportError:
	import simplejson as json

from twisted.web import server, resource, static
from twisted.internet import reactor
from websocket import WebSocketSite, WebSocketHandler

class TransportHandler(WebSocketHandler):
	current_uid = 1
	log = []
	peers = {}
	
	def frameReceived(self, frame):
		# Decode JSON data contained in the frame, which is an array of commands.
		commands = json.loads(unicode(frame, "utf8"))
		
		# Each command is a tuple of a command name and an array containing its arguments.
		for command, args in commands:
			print "User %s\t%s\t%s" % (getattr(self, "uid", "-"), command.ljust(12), "\t".join(unicode(arg) for arg in (args or [])))

			if command == "request_uid":
				# The client wants to join the document and requests an user ID.
				self.uid = TransportHandler.current_uid
				self.peers[self.uid] = self
				self.postCommand("assign_uid", [self.uid,])
				TransportHandler.current_uid += 1
			elif command == "sync":
				# The client wants to obtain the current state of the document.
				self.postCommand("sync_begin")
				
				# Replay the log.
				for lcommand, largs in self.log:
					self.postCommand(lcommand, largs)
				
				self.postCommand("sync_end")
			elif command in ("insert", "delete", "undo"):
				# The client has issued an insert, delete or undo command.
				# Insert the command into the log and broadcast it to all peers.
				self.log.append([command, args])
				self.broadcastCommand(command, args)
	
	def broadcastCommand(self, command, args=[]):
		for peer in self.peers:
			self.peers[peer].postCommand(command, args)
	
	def postCommand(self, command, args=[]):
		self.transport.write(json.dumps([[command, args]]))
	
	def connectionLost(self, reason):
		uid = getattr(self, "uid", None)
		if uid in self.peers:
			# Remove this client from our list of peers.
			del self.peers[uid]

if __name__ == "__main__":
	# Mount the directories containing our static files
	root = static.File("./static/")
	root.putChild("algorithm", static.File("../algorithm/"))
	
	# Create a transport endpoint that can be accessed using a WebSocket
	site = WebSocketSite(root)
	site.addHandler("/transport", TransportHandler)
	
	# Start listening
	listener = reactor.listenTCP(8080, site)
	reactor.run()
