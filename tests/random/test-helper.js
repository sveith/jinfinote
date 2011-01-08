var initial_buffer, final_buffer, user_vectors, state, users, requests;
var failed;

function test_initial_buffer(segments) {
	initial_buffer = new Buffer(segments);
	user_vectors = {};
	state = new State(initial_buffer);
	failed = false;
	users = new Array();
	requests = {};
}

function test_request(user, timestring, operation) {
	if(failed) return;
	
	if(user_vectors[user] == undefined) {
		user_vectors[user] = new Vector();
		requests[user] = new Array();
		users.push(user);
	}
	
	user_vectors[user] = user_vectors[user].add(new Vector(timestring));
	
	requests[user].push(new DoRequest(user, user_vectors[user], operation));
	
	user_vectors[user] = user_vectors[user].incr(user);
}

function test_undo_request(user, timestring) {
	if(failed) return;
	
	user_vectors[user] = user_vectors[user].add(new Vector(timestring));
	
	requests[user].push(new UndoRequest(user, user_vectors[user]));

	user_vectors[user] = user_vectors[user].incr(user);
}

function test_redo_request(user, timestring) {
	if(failed) return;
	
	user_vectors[user] = user_vectors[user].add(new Vector(timestring));
	
	requests[user].push(new RedoRequest(user, user_vectors[user]));
	
	user_vectors[user] = user_vectors[user].incr(user);
}

function test_final_buffer(segments) {
	final_buffer = new Buffer(segments);
	
	while(true)
	{
		if(users.length == 0)
			break;
		
		var user_index = Math.floor(users.length * Math.random());
		var user = users[user_index];
		
		var request = requests[user][0];
		
		if(!request.vector.causallyBefore(state.vector))
			continue;
		
		requests[user].splice(0, 1);
		
		if(requests[user].length == 0)
		{
			users.splice(user_index, 1);
			delete requests[user];
		}
		
		if(request instanceof DoRequest)
		{
			if(request.operation instanceof Operations.Insert)
			{
				var opstring = "Insert";
				var opdesc = '<tt>' + request.operation.text.segments[0].text
					+ '</tt> at position ' + request.operation.position;
			}
			if(request.operation instanceof Operations.Delete)
			{
				var opstring = "Delete";
				var opdesc = request.operation.getLength()
					+ ' characters at position ' + request.operation.position;
			}
		} else if(request instanceof UndoRequest) {
			var opstring = "Undo";
			var opdesc = "";
		} else if(request instanceof RedoRequest) {
			var opstring = "Redo";
			var opdesc = "";
		}
		
		document.write('<div class="' + opstring.toLowerCase() +
		' request user-' + user + '"><h2>' + opstring + '</h2> ' + opdesc + 
		'<p>Issued by user ' + user + ' at ' + request.vector.toHTML() + 
		'</p></div>');
		
		try {
			state.execute(request);
		} catch (e) {
			return test_failed(e);
		}
		
		document.write('<div class="block"><h2>Intermediate result</h2>' + 
		state.buffer.toHTML() + ' at state ' + state.vector.toHTML() + 
		'</div>');
	}
	
	if(final_buffer.getLength() != state.buffer.getLength())
		return test_failed();
	
	for(segmentIndex in final_buffer.segments)
	{
		var s1 = final_buffer.segments[segmentIndex];
		var s2 = state.buffer.segments[segmentIndex];
		
		if(!s2 || s1.user != s2.user || s1.text != s2.text)
			return test_failed();
	}

	test_successful();
}

function test_successful() {
	document.getElementsByTagName("h1")[0].className += " success";
	
	if(parent && parent.frames && parent.frames[0])
		parent.frames[0].test_successful(document.location.href);
}

function test_failed(error) {
	failed = true;
	
	if(error) {
		_log('<span class="error">' + (error.message ? error.message : error)
		+ (error.lineNumber ? " at line " + error.lineNumber : "")
		+ (error.fileName ? " in " + error.fileName : "") + '</span>');
	}
	
	document.getElementsByTagName("h1")[0].className += " failure";
	document.write('<div class="block result failure"><h2>Test failed</h2>' +
		'</div>');
	
	if(parent && parent.frames && parent.frames[0])
		parent.frames[0].test_failed(document.location.href);
}

function _log(text) {
	document.write('<div class="script-output">' + text + '</div>');
}
