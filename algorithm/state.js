/*
Copyright (c) 2009-2011 Simon Veith <simon@jinfinote.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/**
 * @class Stores state vectors.
 * @param [value] Pre-initialize the vector with existing values. This can be
 * a Vector object, a generic Object with numeric properties, or a string of
 * the form "1:2;3:4;5:6".
 */
function Vector(value) {
	if(typeof(value) == "object")
	{
		for(var user in value) {
			if(user.match(Vector.user_regex) && value[user] > 0)
				this[user] = value[user];
		}
	} else if (typeof(value) == "string") {
		var match = Vector.timestring_regex.exec(value);
		while (match != null) {
			this[match[1]] = parseInt(match[2]);
			match = Vector.timestring_regex.exec(value);
		}
	}
}

/** @ignore
 *  @static */
Vector.user_regex = /\d+/;
/** @ignore
 *  @static */
Vector.timestring_regex = /(\d+):(\d+)/g;

/** Helper function to easily iterate over all users in this vector.
 *  @param {function} callback Callback function which is called with the user
 *  and the value of each component. If this callback function returns false,
 *  iteration is stopped at that point and false is returned.
 *  @type Boolean
 *  @returns True if the callback function has never returned false; returns
 *  False otherwise.
 */
Vector.prototype.eachUser = function(callback) {
	for(var user in this) {
		if(user.match(Vector.user_regex)) {
			if(callback(parseInt(user), this[user]) == false)
				return false;
		}
	}
	
	return true;
};

/** Returns this vector as a string of the form "1:2;3:4;5:6"
 *  @type String
 */
Vector.prototype.toString = function() {
	var components = new Array();
	
	this.eachUser(function(u, v) {
		if(v > 0)
			components.push(u + ":" + v);
	});
	
	components.sort();
	
	return components.join(";");
};

Vector.prototype.toHTML = Vector.prototype.toString;

/** Returns the sum of two vectors.
 *  @param {Vector} other
 */ 
Vector.prototype.add = function(other) {
	var result = new Vector(this);
	
	other.eachUser(function(u, v) {
		result[u] = result.get(u) + v;
	});
	
	return result;
};

/** Returns a copy of this vector. */
Vector.prototype.copy = function() {
	return new Vector(this);
};

/** Returns a specific component of this vector, or 0 if it is not defined.
 *  @param {Number} user Index of the component to be returned
 */
Vector.prototype.get = function(user) {
	if(this[user] != undefined)
		return this[user];
	else
		return 0;
};

/** Calculates whether this vector is smaller than or equal to another vector.
 *  This means that all components of this vector are less than or equal to
 *  their corresponding components in the other vector.
 *  @param {Vector} other The vector to compare to
 *  @type Boolean
 */
Vector.prototype.causallyBefore = function(other) {
	return this.eachUser(function(u, v) {
		return v <= other.get(u);
	});
};

/** Determines whether this vector is equal to another vector. This is true if
 *  all components of this vector are present in the other vector and match
 *  their values, and vice-versa.
 *  @param {Vector} other The vector to compare to
 *  @type Boolean
 */
Vector.prototype.equals = function(other) {
	var eq1 = this.eachUser(function(u, v) {
		return other.get(u) == v;
	});
	
	var self = this;
	var eq2 = other.eachUser(function(u, v) {
		return self.get(u) == v;
	});
	
	return eq1 && eq2;
};

/** Returns a new vector with a specific component increased by a given
 *  amount.
 *  @param {Number} user Component to increase
 *  @param {Number} [by] Amount by which to increase the component (default 1)
 *  @type Vector
 */
Vector.prototype.incr = function(user, by) {
	var result = new Vector(this);
	
	if(by == undefined)
		by = 1;
	
	result[user] = result.get(user) + by;
	
	return result;
}

/** Calculates the least common successor of two vectors.
 *  @param {Vector} v1
 *  @param {Vector} v2
 *  @type Vector
 */
Vector.leastCommonSuccessor = function(v1, v2) {
	var result = v1.copy();
	
	v2.eachUser(function(u, v) {
		var val1 = v1.get(u);
		var val2 = v2.get(u);
		
		if(val1 < val2)
			result[u] = val2;
		//else
		//	result[u] = val1; // This is already the case since we copied v1
	});
	
	return result;
};

/** Instantiates a new state object.
 *  @class Stores and manipulates the state of a document by keeping track of
 *  its state vector, content and history of executed requests.
 *  @param {Buffer} [buffer] Pre-initialize the buffer
 *  @param {Vector} [vector] Set the initial state vector
 */
function State(buffer, vector) {
	if(buffer instanceof Buffer)
		this.buffer = buffer.copy();
	else
		this.buffer = new Buffer();
	
	this.vector = new Vector(vector);
	this.request_queue = new Array();
	this.log = new Array();
	this.cache = {};
}

/** Translates a request to the given state vector.
 *  @param {Request} request The request to translate
 *  @param {Vector} targetVector The target state vector
 *  @param {Boolean} [nocache] Set to true to bypass the translation cache.
 */
State.prototype.translate = function(request, targetVector, noCache) {	
	if(request instanceof DoRequest && request.vector.equals(targetVector)) {
		// If the request vector is not an undo/redo request and is already
		// at the desired state, simply return the original request since
		// there is nothing to do.
		return request.copy();
	}
	
	// Before we attempt to translate the request, we check whether it is
	// cached already.
	var cache_key = [request, targetVector].toString();
	if(this.cache != undefined && !noCache) {
		if(!this.cache[cache_key])
			this.cache[cache_key] = this.translate(request, targetVector, true);
		
		// FIXME: translated requests are not cleared from the cache, so this
		// might fill up considerably.
		return this.cache[cache_key];
	}
	
	if(request instanceof UndoRequest || request instanceof RedoRequest)
	{
		// If we're dealing with an undo or redo request, we first try to see
		// whether a late mirror is possible. For this, we retrieve the
		// associated request to this undo/redo and see whether it can be
		// translated and then mirrored to the desired state.
		var assocReq = request.associatedRequest(this.log);
		
		// The state we're trying to mirror at corresponds to the target
		// vector, except the component of the issuing user is changed to
		// match the one from the associated request.
		var mirrorAt = targetVector.copy();
		mirrorAt[request.user] = assocReq.vector.get(request.user);
		
		if(this.reachable(mirrorAt))
		{			
			var translated = this.translate(assocReq, mirrorAt);
			var mirrorBy = targetVector.get(request.user) -
				mirrorAt.get(request.user);
			
			var mirrored = translated.mirror(mirrorBy);
			return mirrored;
		}
		
		// If mirrorAt is not reachable, we need to mirror earlier and then
		// perform a translation afterwards, which is attempted next.
	}
	
	for(var _user in this.vector)
	{
		// We now iterate through all users to see how we can translate
		// the request to the desired state.
		
		if(!_user.match(Vector.user_regex))
			continue;
		
		var user = parseInt(_user);
		
		// The request's issuing user is left out since it is not possible
		// to transform or fold a request along its own user.
		if(user == request.user)
			continue;
		
		// We can only transform against requests that have been issued
		// between the translated request's vector and the target vector.
		if(targetVector.get(user) <= request.vector.get(user))
			continue;
		
		// Fetch the last request by this user that contributed to the
		// current state vector.
		var lastRequest = this.requestByUser(user, targetVector.get(user) - 1);
		
		if(lastRequest instanceof UndoRequest || lastRequest instanceof RedoRequest)
		{
			// When the last request was an undo/redo request, we can try to
			// "fold" over it. By just skipping the do/undo or undo/redo pair,
			// we pretend that nothing has changed and increase the state
			// vector.
			
			var foldBy = targetVector.get(user) -
				lastRequest.associatedRequest(this.log).vector.get(user);
			
			if(targetVector.get(user) >= foldBy)
			{
				var foldAt = targetVector.incr(user, -foldBy);
				
				// We need to make sure that the state we're trying to
				// fold at is reachable and that the request we're translating
				// was issued before it.
				
				if(this.reachable(foldAt) && request.vector.causallyBefore(foldAt))
				{
					var translated = this.translate(request, foldAt);
					var folded = translated.fold(user, foldBy);
					
					return folded;
				}
			}
		}
		
		// If folding and mirroring is not possible, we can transform this
		// request against other users' requests that have contributed to
		// the current state vector.
		
		var transformAt = targetVector.incr(user, -1);
		if(transformAt.get(user) >= 0 && this.reachable(transformAt))
		{
			var lastRequest = this.requestByUser(user, transformAt.get(user));
			
			var r1 = this.translate(request, transformAt);
			var r2 = this.translate(lastRequest, transformAt);
			
			var cid_req;
			
			if(r1.operation.requiresCID)
			{
				// For the Insert operation, we need to check whether it is
				// possible to determine which operation is to be transformed.
				var cid = r1.operation.cid(r2.operation);
			
				if(!cid)
				{
					// When two requests insert text at the same position,
					// the transformation result is undefined. We therefore
					// need to perform some tricks to decide which request
					// has to be transformed against which.
					
					// The first try is to transform both requests to a
					// common successor before the transformation vector.
					var lcs = Vector.leastCommonSuccessor(request.vector,
						lastRequest.vector);
					
					if(this.reachable(lcs))
					{
						var r1t = this.translate(request, lcs);
						var r2t = this.translate(lastRequest, lcs);
						
						// We try to determine the CID at this vector, which
						// hopefully yields a result.
						var cidt = r1t.operation.cid(r2t.operation);
						
						if(cidt == r1t.operation)
							cid = r1.operation;
						else if(cidt == r2t.operation)
							cid = r2.operation;
					}
					
					if(!cid) {
						// If we arrived here, we couldn't decide for a CID,
						// so we take the last resort: use the user ID of the
						// requests to decide which request is to be
						// transformed. This behavior is specified in the
						// Infinote protocol.
						
						if(r1.user < r2.user)
							cid = r1.operation;
						if(r1.user > r2.user)
							cid = r2.operation;
					}
				}
				
				if(cid == r1.operation)
					cid_req = r1;
				if(cid == r2.operation)
					cid_req = r2;
			}
			
			return r1.transform(r2, cid_req);
		}
	}
	
	throw "Could not find a translation path";
};

/** Adds a request to the request queue.
 *  @param {Request} request The request to be queued.
 */
State.prototype.queue = function(request) {
	this.request_queue.push(request);
};

/** Checks whether a given request can be executed in the current state.
 *  @type Boolean
 */
State.prototype.canExecute = function(request) {
	if(request == undefined)
		return false;
	
	if(request instanceof UndoRequest || request instanceof RedoRequest) {
		return request.associatedRequest(this.log) != undefined;
	} else {
		return request.vector.causallyBefore(this.vector);
	}
};

/** Executes a request that is executable.
 *  @param {Request} [request] The request to be executed. If omitted, an
 *  executable request is picked from the request queue instead.
 *  @returns The request that has been executed, or undefined if no request
 *  has been executed.
 */
State.prototype.execute = function(request) {
	if(request == undefined)
	{
		// Pick an executable request from the queue.
		for(var index = 0; index < this.request_queue.length; index ++)
		{
			request = this.request_queue[index];
			if(this.canExecute(request))
			{
				this.request_queue.splice(index, 1);
				break;
			}
		}
	}
	
	if(!this.canExecute(request))
	{
		// Not executable yet - put it (back) in the queue.
		if(request != undefined)
			this.queue(request);
		
		return;
	}

	if(request.vector.get(request.user) < this.vector.get(request.user)) {
		// If the request has already been executed, skip it, but record it into the
		// log.
		// FIXME: this assumes the received request is already reversible
		this.log.push(request);
		return;
	}
	
	request = request.copy();
	
	if(request instanceof UndoRequest || request instanceof RedoRequest) {
		// For undo and redo requests, we change their vector to the vector
		// of the original request, but leave the issuing user's component
		// untouched.
		var assocReq = request.associatedRequest(this.log);
		var newVector = new Vector(assocReq.vector);
		newVector[request.user] = request.vector.get(request.user);
		request.vector = newVector;
	}
	
	var translated = this.translate(request, this.vector);
	
	if(request instanceof DoRequest && request.operation instanceof Operations.Delete) {
		// Since each request might have to be mirrored at some point, it
		// needs to be reversible. Delete requests are not reversible by
		// default, but we can make them reversible.
		this.log.push(request.makeReversible(translated, this));
	} else {
		this.log.push(request);
	}
	
	translated.execute(this);
	
	if(this.onexecute)
		this.onexecute(translated);
	
	return translated;
};

/** Executes all queued requests that are ready for execution. */
State.prototype.executeAll = function() {
	do {
		var executed = this.execute();
	} while(executed);
};

/** Determines whether a given state is reachable by translation.
 *  @param {Vector} vector
 *  @type Boolean
 */
State.prototype.reachable = function(vector) {
	var self = this;
	return this.vector.eachUser(function(u, v) {
		return self.reachableUser(vector, u);
	});
};

State.prototype.reachableUser = function(vector, user) {
	var n = vector.get(user);
	var firstRequest = this.firstRequestByUser(user);
	var firstRequestNumber = firstRequest ? firstRequest.vector.get(user) :
		this.vector.get(user);

	while(true) {
		if(n == firstRequestNumber)
			return true;
		
		var r = this.requestByUser(user, n - 1);
		
		if(r == undefined)
		{
			return false;
		}

		if(r instanceof DoRequest)
		{
			var w = r.vector;
			return w.incr(r.user).causallyBefore(vector);
		} else {
			var assocReq = r.associatedRequest(this.log);
			n = assocReq.vector.get(user);
		}
	}
};

/** Retrieve an user's request by its index.
 *  @param {Number} user
 *  @param {Number} index The number of the request to be returned
 */
State.prototype.requestByUser = function(user, getIndex) {
	for(var reqIndex in this.log)
	{
		var request = this.log[reqIndex];

		if(request.user == user && request.vector.get(user) == getIndex)
		{
			return request;
		}
	}
}

/** Retrieve the first request in the log that was issued by the given user.
 *  @param {Number} user
 */
State.prototype.firstRequestByUser = function(user) {
	var firstRequest;
	for(var reqIndex in this.log) {
		var request = this.log[reqIndex];

		if(request.user == user && (!firstRequest || firstRequest.vector.get(user) > request.vector.get(user) ))
		{
			firstRequest = request;
		}
	}

	return firstRequest;
}
