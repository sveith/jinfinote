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

/** Initializes a new DoRequest object.
 *  @class Represents a request made by an user at a certain time.
 *  @param {Number} user The user that issued the request
 *  @param {Vector} vector The time at which the request was issued
 *  @param {Operation} operation
 */
function DoRequest(user, vector, operation) {
	this.user = user;
	this.vector = vector;
	this.operation = operation;
}

DoRequest.prototype.toString = function() {
	return "DoRequest(" + 
		[this.user, this.vector, this.operation].join(", ") + ")";
};

DoRequest.prototype.toHTML = function() {
	return "DoRequest(" + 
		[this.user, this.vector.toHTML(), this.operation.toHTML()].join(", ")
		+ ")";
};

DoRequest.prototype.copy = function() {
	return new DoRequest(this.user, this.vector, this.operation);
};

/** Applies the request to a State.
 *  @param {State} state The state to which the request should be applied.
 */
DoRequest.prototype.execute = function(state) {
	this.operation.apply(state.buffer);
	
	state.vector = state.vector.incr(this.user, 1);
	
	return this;
};

/** Transforms this request against another request.
 *  @param {DoRequest} other
 *  @param {DoRequest} [cid] The concurrency ID of the two requests. This is
 *  the request that is to be transformed in case of conflicting operations.
 *  @type DoRequest
 */
DoRequest.prototype.transform = function(other, cid) {
	if(this.operation instanceof Operations.NoOp)
		var newOperation = new Operations.NoOp();
	else {
		var op_cid;
		if(cid == this)
			op_cid = this.operation;
		if(cid == other)
			op_cid = other.operation;
		
		var newOperation = this.operation.transform(other.operation, op_cid);
	}
	
	return new DoRequest(this.user, this.vector.incr(other.user),
		newOperation);
};

/** Mirrors the request. This inverts the operation and increases the issuer's
 *  component of the request time by the given amount.
 *  @param {Number} [amount] The amount by which the request time is
 *  increased. Defaults to 1.
 *  @type DoRequest
 */
DoRequest.prototype.mirror = function(amount) {
	if(typeof(amount) != "number")
		amount = 1;
	return new DoRequest(this.user, this.vector.incr(this.user, amount),
		this.operation.mirror());
};

/** Folds the request along another user's axis. This increases that user's
 *  component by the given amount, which must be a multiple of 2.
 *  @type DoRequest
 */
DoRequest.prototype.fold = function(user, amount) {
	if(amount % 2 == 1)
		throw "Fold amounts must be multiples of 2.";
	return new DoRequest(this.user, this.vector.incr(user, amount),
		this.operation);
};

/** Makes a request reversible, given a translated version of this request
 *  and a State object. This only applies to requests carrying a Delete
 *  operation; for all others, this does nothing.
 *  @param {DoRequest} translated This request translated to the given state
 *  @param {State} state The state which is used to make the request
 *  reversible.
 *  @type DoRequest
 */
DoRequest.prototype.makeReversible = function(translated, state) {
	var result = this.copy();
	
	if(this.operation instanceof Operations.Delete) {
		result.operation = this.operation.makeReversible(translated.operation,
			state);
	}
	
	return result;
};

/** Instantiates a new undo request.
 *  @class Represents an undo request made by an user at a certain time.
 *  @param {Number} user
 *  @param {Vector} vector The time at which the request was issued.
 */
function UndoRequest(user, vector) {
	this.user = user;
	this.vector = vector;
}

UndoRequest.prototype.toString = function() {
	return "UndoRequest(" + [this.user, this.vector].join(", ") + ")";
};

UndoRequest.prototype.toHTML = function() {
	return "UndoRequest(" + [this.user, this.vector.toHTML()].join(", ")
		+ ")";
};

UndoRequest.prototype.copy = function() {
	return new UndoRequest(this.user, this.vector);
};

/** Finds the corresponding DoRequest to this UndoRequest.
 *  @param {Array} log The log to search
 *  @type DoRequest
 */
UndoRequest.prototype.associatedRequest = function(log) {
	var sequence = 1;
	var index = _indexOf(log, this);
	
	if(index == -1)
		index = log.length - 1;
	
	for(; index >= 0; index--)
	{
		if(log[index] === this || log[index].user != this.user)
			continue;
		if(log[index].vector.get(this.user) > this.vector.get(this.user))
			continue;
		
		if(log[index] instanceof UndoRequest)
			sequence += 1;
		else
			sequence -= 1;
		
		if(sequence == 0)
			return log[index];
	}
};

/** Instantiates a new redo request.
 *  @class Represents an redo request made by an user at a certain time.
 *  @param {Number} user
 *  @param {Vector} vector The time at which the request was issued.
 */
function RedoRequest(user, vector) {
	this.user = user;
	this.vector = vector;
}

RedoRequest.prototype.toString = function() {
	return "RedoRequest(" + [this.user, this.vector].join(", ") + ")";
};

RedoRequest.prototype.toHTML = function() {
	return "RedoRequest(" + [this.user, this.vector.toHTML()].join(", ") + ")";
};

RedoRequest.prototype.copy = function() {
	return new RedoRequest(this.user, this.vector);
};

/** Finds the corresponding UndoRequest to this RedoRequest.
 *  @param {Array} log The log to search
 *  @type UndoRequest
 */
RedoRequest.prototype.associatedRequest = function(log) {
	var sequence = 1;
	var index = _indexOf(log, this);
	
	if(index == -1)
		index = log.length - 1;
	
	for(; index >= 0; index--)
	{
		if(log[index] === this || log[index].user != this.user)
			continue;
		if(log[index].vector.get(this.user) > this.vector.get(this.user))
			continue;
		
		if(log[index] instanceof RedoRequest)
			sequence += 1;
		else
			sequence -= 1;
		
		if(sequence == 0)
			return log[index];
	}
};

/** Helper function to provide an implementation of an Array's indexOf method.
 *  This is necessary for browsers that don't support JavaScript 1.6, such as
 *  Internet Explorer 6. It uses the browsers native implementation when
 *  available.
 *  @param {Array} array
 *  @param searchElement
 *  @param {Number} [fromIndex]
 */
function _indexOf(array, searchElement, fromIndex)
{
	if(array.indexOf)
		return array.indexOf(searchElement, fromIndex);
	else {
		if(typeof(fromIndex) != "number")
			fromIndex = 0;
		
		for(var index = 0; index < array.length; index ++)
		{
			if(array[index] === searchElement)
				return index;
		}
		
		return -1;
	}
}
