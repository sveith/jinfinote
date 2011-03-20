var dmp = new diff_match_patch();

if (window.console == undefined) {
	// Stubs for browsers that don't provide the "console" object
	console = {};
	console.debug = console.info = console.warn = function(){};
	console.error = function(message) { alert(message); };
}

function CollaborativeEditor(ctl, url, session_id) {
	if (window.WebSocket == undefined) {
		console.error("WebSocket support is required.");
		return;
	};
	
	if (lineSeparator_local == undefined)
	{
		// Check which line separator this browser uses
		var testArea = document.createElement("textarea");
		testArea.value = lineSeparator_network;
		lineSeparator_local = testArea.value;
		lineRegex_local = new RegExp(lineSeparator_local, "g");
	}
	
	var ce = this;
	ce._localUser = 0;
	ce._initialized = false;
	ce._state = new State();
	ce._session_id = session_id;
	
	function invokeUpdateHandler() { ce._handleUpdates(); }
	
	ce._ctl = ctl;
	ce._ctl.addEventListener("change", invokeUpdateHandler);
	ce._ctl.addEventListener("paste", invokeUpdateHandler);
	ce._ctl.addEventListener("textInput", invokeUpdateHandler);
	ce._ctl.addEventListener("keyup", invokeUpdateHandler);

	ce._ctl.addEventListener("keydown", function(event) {
		if (event.ctrlKey && event.keyCode == 90) {
			// Catch CTRL+Z, perform our own undo
			ce._undo();

			event.preventDefault();
			return false;
		}

		if (event.ctrlKey && event.keyCode == 89) {
			// Catch CTRL+Y
			// TODO: redo

			event.preventDefault();
			return false;
		}
		
		ce._handleUpdates();
	});
	
	// Disable drag and drop - there doesn't seem to be a reliable way of detecting such changes
	ce._ctl.addEventListener("dragover", function(event) { event.preventDefault(); return false; });
	
	ce._ctl.readonly = "readonly";
	
	ce._prevValue = ce._ctl.value;
	
	console.debug("Opening WebSocket URL", url);
	ce._socket = new WebSocket(url);
	ce._socket.onopen = function(event) { ce._onSocketOpen(event); };
	ce._socket.onclose = ce._socket.onerror = function(event) { ce._onSocketConnectionLost(); };
	ce._socket.onmessage = function(event) { ce._onSocketMessage(event); }
	
	return true;
}

// Post a command and arguments to the server.

CollaborativeEditor.prototype._postCommand = function(command, args) {
	console.debug("<--", command, args);
	var jsonData = JSON.stringify([[command, args], ]);
	this._socket.send(jsonData);
};

// Check if changes have been made to the input control.

CollaborativeEditor.prototype._handleUpdates = function() {
	// Don't process updates while we're not done with synchronization yet.
	if (!this._initialized) return false;
	
	// Call Diff-Match-Patch to obtain a list of differences.
	var diffs = dmp.diff_main(lineSeparator_toNetwork(this._prevValue), lineSeparator_toNetwork(this._ctl.value));
	
	var offset = 0;
	for (var diffIndex in diffs) {
		var diffData = diffs[diffIndex];
		var diffType = diffData[0];
		var diffText = diffData[1];

		if (diffType == 1) {
			// Text has been inserted. Create an insert request out of the change.
			
			var buffer = new Buffer([new Segment(this._localUser, diffText)]);
			var operation = new Operations.Insert(offset, buffer);
			var request = new DoRequest(this._localUser, this._state.vector, operation);
			
			// Post the request to the server.
			this._postCommand("insert", [this._localUser, request.vector.toString(), offset, diffText]);
			
			// Execute the request locally to update the internal buffer.
			this._state.execute(request);
			
			offset += diffText.length;
		} else if (diffType == -1) {
			// Text has been removed.
			
			var buffer = this._state.buffer.slice(offset, offset + diffText.length);
			var operation = new Operations.Delete(offset, buffer);
			var request = new DoRequest(this._localUser, this._state.vector, operation);
			
			this._postCommand("delete", [this._localUser, request.vector.toString(), offset, diffText.length]);
			this._state.execute(request);
		} else {
			offset += diffText.length;
		}
	}
	
	this._prevValue = this._ctl.value;
	$("#buffer").html(this._state.buffer.toHTML());
};

CollaborativeEditor.prototype._undo = function() {
	// Generate an undo request
	var request = new UndoRequest(this._localUser, this._state.vector);

	// Check whether the undo request is valid, i.e. there is a request to be
	// undone at all.
	if (this._state.canExecute(request)) {
		// Post the undo request to the other peers
		this._postCommand("undo", [this._localUser, request.vector.toString()]);

		// Execute the undo request, then update the control to reflect the changes
		var executedRequest = this._state.execute(request);
		this._updateControl(executedRequest);
	}
};

CollaborativeEditor.prototype._updateControl = function(executedRequest) {
	// Update the control to account for the given request and (try to) make sure
	// the edit cursor is positioned correctly afterwards.

	if (this._initialized) {
		if (executedRequest.operation instanceof Operations.Insert) {
			// Backup cursor position
			var selectionStart = this._ctl.selectionStart;
			var selectionEnd = this._ctl.selectionEnd;
			
			this._updateFromBuffer();
			
			var textLength = executedRequest.operation.text.getLength();
			
			if (executedRequest.operation.position < selectionStart) {
				// Text was inserted before our selection, so we shift it entirely.
				selectionStart += textLength;
				selectionEnd += textLength;
			} else if (executedRequest.operation.position >= selectionStart && executedRequest.operation.position < selectionEnd) {
				// Text was inserted inside our selection, so we only adjust its end position.
				selectionEnd += textLength;
			}
			
			// Restore cursor position
			this._ctl.selectionStart = selectionStart;
			this._ctl.selectionEnd = selectionEnd;
		} else if (executedRequest.operation instanceof Operations.Delete) {
			// Backup cursor position
			var selectionStart = this._ctl.selectionStart;
			var selectionEnd = this._ctl.selectionEnd;
			
			this._updateFromBuffer();
			
			function processDeleteOperation(operation) {
				if (operation instanceof Operations.Split) {
					// Delete operations might have been split; we therefore need to process
					// them recursively.
					return processDeleteOperation(operation.first) + processDeleteOperation(operation.second);
				} else {
					var textLength = operation.getLength();
					
					if (operation.position < selectionStart) {
						// Text was removed before our selection.
						selectionStart -= textLength;
						selectionEnd -= textLength;
					} else if (operation.position >= selectionStart && operation.position < selectionEnd) {
						// Text was removed inside our selection.
						selectionEnd -= textLength;
					}
				}
			}
			
			processDeleteOperation(executedRequest.operation);
			
			// Restore cursor position
			this._ctl.selectionStart = selectionStart;
			this._ctl.selectionEnd = selectionEnd;
		}
	}
};

CollaborativeEditor.prototype._onSocketOpen = function(event) {
	// The WebSocket has been established - request an user ID from the server.
	console.debug("WebSocket opened, attempting to join session", this._session_id);
	this._postCommand("join_session", [this._session_id,]);
};

CollaborativeEditor.prototype._onSocketConnectionLost = function() {
	// We lost the connection to the server - lock the edit control to show this
	// and prevent further edits.
	console.warn("WebSocket connection lost, terminating");
	this._ctl.readonly = "readonly";
}

CollaborativeEditor.prototype._onSocketMessage = function(event) {
	// Process commands sent by the server.
	
	var jsonData = JSON.parse(event.data);
	
	for (var commandIndex in jsonData) {
		var command = jsonData[commandIndex][0];
		var args = jsonData[commandIndex][1];
		
		console.debug("-->", command, args);

		if (command == "assign_uid") {
			// The server has assigned us an user ID.
			this._localUser = parseInt(args[0]);
			console.debug("Assigned user ID:", this._localUser);
			this._synchronize();
		} else if (command == "sync_end") {
			// Synchronization is done. Update and unlock the edit control.
			console.debug("Synchronization completed");
			this._initialized = true;
			this._updateFromBuffer();
			this._unlockCtl();
		} else if (command == "insert") {
			if (args[0] != this._localUser) {
				// We have received an insert request from another user.
				
				var buffer = new Buffer([new Segment(args[0], args[3])]);
				var operation = new Operations.Insert(args[2], buffer);
				var request = new DoRequest(args[0], new Vector(args[1]), operation);
				
				var executedRequest = this._state.execute(request);
				this._updateControl(executedRequest);
			}
		} else if (command == "delete") {
			if (args[0] != this._localUser) {
				// We have received a delete request from another user.
				
				var operation = new Operations.Delete(args[2], args[3]);
				var request = new DoRequest(args[0], new Vector(args[1]), operation);
				
				var executedRequest = this._state.execute(request);
				this._updateControl(executedRequest);
			}
		} else if (command == "undo") {
			if (args[0] != this._localUser) {
				var request = new UndoRequest(args[0], new Vector(args[1]));
				
				var executedRequest = this._state.execute(request);
				this._updateControl(executedRequest);
			}
		}
	}
};

CollaborativeEditor.prototype._unlockCtl = function() {
	// Allow the input control to be edited.
	this._ctl.removeAttribute("readonly");
};

CollaborativeEditor.prototype._synchronize = function() {
	// Request to be synchronized, that is, obtain a copy of the request log.
	console.debug("Synchronizing document");
	this._postCommand("sync");
};

CollaborativeEditor.prototype._updateFromBuffer = function() {
	// Update the displayed text using the current buffer contents.
	
	this._prevValue = this._ctl.value = lineSeparator_fromNetwork(this._state.buffer.toString());
	$("#buffer").html(this._state.buffer.toHTML());
};

// Line separator conversion - some browsers use \n as line breaks, whereas
// some use \r\n (e.g. Opera)

var lineSeparator_network = "\n";
var lineSeparator_local;
var lineRegex_network = new RegExp(lineSeparator_network, "g");
var lineRegex_local;

function lineSeparator_fromNetwork(text) {
	if (lineSeparator_local == lineSeparator_network)
		return text;
	else
		return text.replace(lineRegex_network, lineSeparator_local);
}

function lineSeparator_toNetwork(text) {
	if (lineSeparator_local == lineSeparator_network)
		return text;
	else
		return text.replace(lineRegex_local, lineSeparator_network);
}