var initial_buffer, final_buffer, user_vectors, state;
var failed;

function test_initial_buffer(segments) {
	initial_buffer = new Buffer(segments);
	user_vectors = new Object();
	state = new State(initial_buffer);
	failed = false;
}

function test_request(user, timestring, operation) {
	if(failed) return;
	
	if(user_vectors[user] == undefined)
		user_vectors[user] = new Vector();
	
	user_vectors[user] = user_vectors[user].add(new Vector(timestring));
	
	test_execute_request(new DoRequest(user, user_vectors[user], operation));
}

function test_undo_request(user, timestring) {
	if(failed) return;
	user_vectors[user] = user_vectors[user].add(new Vector(timestring));
	
	test_execute_request(new UndoRequest(user, user_vectors[user]));
}

function test_redo_request(user, timestring) {
	if(failed) return;
	user_vectors[user] = user_vectors[user].add(new Vector(timestring));
	
	test_execute_request(new RedoRequest(user, user_vectors[user]));
}

function test_execute_request(request)
{
	try {
		state.execute(request);
	} catch (e) {
		return test_failed(e);
	}
	
	document.write('<div class="block"><h2>Intermediate result</h2>' + 
		state.buffer.toHTML() + ' at state ' + state.vector.toHTML() +
		'</div>');
	user_vectors[request.user] =
		user_vectors[request.user].incr(request.user);
}

function test_final_buffer(segments) {
	if(failed) return;
	final_buffer = new Buffer(segments);
	
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

function _log(text) {
	document.write('<div class="script-output">' + text + '</div>');
}

function test_successful() {
	document.getElementsByTagName("h1")[0].className += " success";
	document.write('<div class="block result success"><h2>Test completed ' +
		'successfully</h2></div>');
	
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