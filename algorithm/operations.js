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

/** @namespace
 */
Operations = {};

/** Instantiates a new NoOp operation object.
 *  @class An operation that does nothing.
 */
Operations.NoOp = function() {};

Operations.NoOp.prototype.requiresCID = false;

Operations.NoOp.prototype.toString = function() { return "NoOp()"; };

Operations.NoOp.prototype.toHTML = Operations.NoOp.prototype.toString;

/** Applies this NoOp operation to a buffer. This does nothing, per
 *  definition. */
Operations.NoOp.prototype.apply = function(buffer) {};

/** Transforms this NoOp operation against another operation. This returns a
 *  new NoOp operation.
 *  @type Operations.NoOp
 */
Operations.NoOp.prototype.transform = function(other) { 
	return new Operations.NoOp();
};

/** Mirrors this NoOp operation. This returns a new NoOp operation.
 *  @type Operations.NoOp
 */
Operations.NoOp.prototype.mirror = function() {
	return new Operations.NoOp();
};

/** Instantiates a new Insert operation object.
 *  @class An operation that inserts a Buffer at a certain offset.
 *  @param {Number} position The offset at which the text is to be inserted.
 *  @param {Buffer} text The Buffer to insert.
 */
Operations.Insert = function(position, text) {
	this.position = position;
	this.text = text.copy();
};

Operations.Insert.prototype.requiresCID = true;

Operations.Insert.prototype.toString = function() {
	return "Insert(" + this.position + ", " + this.text + ")";
};

Operations.Insert.prototype.toHTML = function() {
	return "Insert(" + this.position + ", " + this.text.toHTML() + ")";
};

/** Applies the insert operation to the given Buffer.
 *  @param {Buffer} buffer The buffer in which the insert operation is to be
 *  performed.
 */
Operations.Insert.prototype.apply = function(buffer) {
	buffer.splice(this.position, 0, this.text);
};

/** Computes the concurrency ID against another Insert operation.
 *  @param {Operations.Insert} other
 *  @returns The operation that is to be transformed.
 *  @type Operations.Insert
 */
Operations.Insert.prototype.cid = function(other) {
	if(this.position < other.position)
		return other;
	if(this.position > other.position)
		return this;
};

/** Returns the total length of data to be inserted by this insert operation,
 *  in characters.
 *  @type Number
 */
Operations.Insert.prototype.getLength = function() {
	return this.text.getLength();
};

/** Transforms this Insert operation against another operation, returning the
 *  resulting operation as a new object.
 *  @param {Operation} other The operation to transform against.
 *  @param {Operation} [cid] The cid to take into account in the case of
 *  conflicts.
 *  @type Operation
 */
Operations.Insert.prototype.transform = function(other, cid) {
	if(other instanceof Operations.NoOp)
		return new Operations.Insert(this.position, this.text);
	
	if(other instanceof Operations.Split) {
		// We transform against the first component of the split operation
		// first.
		var transformFirst = this.transform(other.first,
			(cid == this ? this : other.first));
		
		// The second part of the split operation is transformed against its
		// first part.
		var newSecond = other.second.transform(other.first);
		
		var transformSecond = transformFirst.transform(newSecond,
			(cid == this ? transformFirst : newSecond));
		
		return transformSecond;
	}
	
	var pos1 = this.position;
	var str1 = this.text;
	var pos2 = other.position;
	
	if(other instanceof Operations.Insert) {
		var str2 = other.text;
		
		if(pos1 < pos2 || (pos1 == pos2 && cid == other))
			return new Operations.Insert(pos1, str1);
		if(pos1 > pos2 || (pos1 == pos2 && cid == this))
			return new Operations.Insert(pos1 + str2.getLength(), str1);
	} else if(other instanceof Operations.Delete) {
		var len2 = other.getLength();
		
		if(pos1 >= pos2 + len2)
			return new Operations.Insert(pos1 - len2, str1);
		if(pos1 < pos2)
			return new Operations.Insert(pos1, str1);
		if(pos1 >= pos2 && pos1 < pos2 + len2)
			return new Operations.Insert(pos2, str1);
	}
};

/** Returns the inversion of this Insert operation.
 *  @type Operations.Delete
 */
Operations.Insert.prototype.mirror = function() {
	return new Operations.Delete(this.position, this.text.copy());
};

/** Instantiates a new Delete operation object.
 *  Delete operations can be reversible or not, depending on how they are
 *  constructed. Delete operations constructed with a Buffer object know which
 *  text they are removing from the buffer and can therefore be mirrored,
 *  whereas Delete operations knowing only the amount of characters to be
 *  removed are non-reversible.
 *  @class An operation that removes a range of characters in the target
 *  buffer.
 *  @param {Number} position The offset of the first character to remove.
 *  @param what The data to be removed. This can be either a numeric value
 *  or a Buffer object.
 */
Operations.Delete = function(position, what, recon) {
	this.position = position;
	
	if(what instanceof Buffer)
		this.what = what.copy();
	else
		this.what = what;
	
	if(recon)
		this.recon = recon;
	else
		this.recon = new Recon();
};

Operations.Delete.prototype.requiresCID = false;

Operations.Delete.prototype.toString = function() {
	return "Delete(" + this.position + ", " + this.what + ")";
};

Operations.Delete.prototype.toHTML = function() {
	return "Delete(" + this.position + ", " + 
		(this.what instanceof Buffer ? this.what.toHTML() : this.what) + ")";
};

/** Determines whether this Delete operation is reversible.
 *  @type Boolean
 */
Operations.Delete.prototype.isReversible = function() {
	return (this.what instanceof Buffer);
};

/** Applies this Delete operation to a buffer.
 *  @param {Buffer} buffer The buffer to which the operation is to be applied.
 */
Operations.Delete.prototype.apply = function(buffer) {
	buffer.splice(this.position, this.getLength());
};

Operations.Delete.prototype.cid = function(other) {};

/** Returns the number of characters that this Delete operation removes.
 *  @type Number
 */
Operations.Delete.prototype.getLength = function() {
	if(this.isReversible())
		return this.what.getLength();
	else
		return this.what;
};

/** Splits this Delete operation into two Delete operations at the given
 *  offset. The resulting Split operation will consist of two Delete
 *  operations which, when combined, affect the same range of text as the
 *  original Delete operation.
 *  @param {Number} at Offset at which to split the Delete operation.
 *  @type Operations.Split
 */
Operations.Delete.prototype.split = function(at) {
	if(this.isReversible())
	{
		// This is a reversible Delete operation. No need to to any
		// processing for recon data.
		return new Operations.Split(
			new Operations.Delete(this.position, this.what.slice(0, at)),
			new Operations.Delete(this.position + at, this.what.slice(at))
		);
	} else {
		// This is a non-reversible Delete operation that might carry recon
		// data. We need to split that data accordingly between the two new
		// components.
		var recon1 = new Recon();
		var recon2 = new Recon();
		
		for(index in this.recon.segments)
		{
			if(this.recon.segments[index].offset < at)
				recon1.segments.push(this.recon.segments[index]);
			else
				recon2.segments.push(
					new ReconSegment(this.recon.segments[index].offset - at,
						this.recon.segments[index].buffer)
				);
		}
		
		return new Operations.Split(
			new Operations.Delete(this.position, at, recon1),
			new Operations.Delete(this.position + at, this.what - at, recon2)
		);
	}
};

/** Returns the range of text in a buffer that this Delete or Split-Delete
 *  operation removes.
 *  @param operation A Split-Delete or Delete operation
 *  @param {Buffer} buffer
 *  @type Buffer
 */
Operations.Delete.getAffectedString = function(operation, buffer) {
	if(operation instanceof Operations.Split)
	{
		// The other operation is a Split operation. We call this function
		// again recursively for each component.
		var part1 = Operations.Delete.getAffectedString(operation.first,
			buffer);
		var part2 = Operations.Delete.getAffectedString(operation.second,
			buffer);
		
		part2.splice(0, 0, part1);
		return part2;
	} else if (operation instanceof Operations.Delete) {
		// In the process of determining the affected string, we also
		// have to take into account the data that has been "transformed away"
		// from the Delete operation and which is stored in the Recon object.
		
		var reconBuffer = buffer.slice(operation.position, operation.position
			+ operation.getLength());
		
		operation.recon.restore(reconBuffer);

		return reconBuffer;
	}
};

/** Makes this Delete operation reversible, given a transformed version of 
 *  this operation in a buffer matching its state. If this Delete operation is
 *  already reversible, this function simply returns a copy of it.
 *  @param {Operations.Delete} transformed A transformed version of this
 *  operation.
 *  @param {State} state The state in which the transformed operation could be
 *  applied.
 */
Operations.Delete.prototype.makeReversible = function(transformed, state) {
	if(this.what instanceof Buffer)
		return new Operations.Delete(this.position, this.what);
	else {
		return new Operations.Delete(this.position, 
			Operations.Delete.getAffectedString(transformed, state.buffer)
		);
	}
};

/** Merges a Delete operation with another one. The resulting Delete operation
 *  removes the same range of text as the two separate Delete operations would
 *  when executed sequentially.
 *  @param {Operations.Delete} other
 *  @type Operations.Delete
 */
Operations.Delete.prototype.merge = function(other) {
	if(this.isReversible()) {
		if(!other.isReversible())
			throw "Cannot merge reversible operations with non-reversible ones";
		
		var newBuffer = this.what.copy();
		newBuffer.splice(newBuffer.getLength(), 0, other.what);
		return new Operations.Delete(this.position, newBuffer);
	} else {
		var newLength = this.getLength() + other.getLength();
		return new Operations.Delete(this.position, newLength);
	}
};

/** Transforms this Delete operation against another operation.
 *  @param {Operation} other
 *  @param {Operation} [cid]
 */
Operations.Delete.prototype.transform = function(other, cid) {
	if(other instanceof Operations.NoOp)
		return new Operations.Delete(this.position, this.what, this.recon);
	
	if(other instanceof Operations.Split) {
		// We transform against the first component of the split operation
		// first.
		var transformFirst = this.transform(other.first,
			(cid == this ? this : other.first));
		
		// The second part of the split operation is transformed against its
		// first part.
		var newSecond = other.second.transform(other.first);
		
		var transformSecond = transformFirst.transform(newSecond,
			(cid == this ? transformFirst : newSecond));
		
		return transformSecond;
	}
	
	var pos1 = this.position;
	var len1 = this.getLength();
	
	var pos2 = other.position;
	var len2 = other.getLength();
	
	if(other instanceof Operations.Insert)
	{
		if(pos2 >= pos1 + len1)
			return new Operations.Delete(pos1, this.what, this.recon);
		if(pos2 <= pos1)
			return new Operations.Delete(pos1 + len2, this.what, this.recon);
		if(pos2 > pos1 && pos2 < pos1 + len1)
		{
			var result = this.split(pos2 - pos1);
			result.second.position += len2;
			return result;
		}
	} else if(other instanceof Operations.Delete) {
		if(pos1 + len1 <= pos2)
			return new Operations.Delete(pos1, this.what, this.recon);
		if(pos1 >= pos2 + len2)
			return new Operations.Delete(pos1 - len2, this.what, this.recon);
		if(pos2 <= pos1 && pos2 + len2 >= pos1 + len1) {
			/*     1XXXXX|
			 * 2-------------|
			 *
			 * This operation falls completely within the range of another,
			 * i.e. all data has already been removed. The resulting
			 * operation removes nothing.
			 */
			var newData = (this.isReversible() ? new Buffer() : 0);
			var newRecon = this.recon.update(0,
				other.what.slice(pos1 - pos2, pos1 - pos2 + len1) );
			return new Operations.Delete(pos2, newData, newRecon);
		}
		if(pos2 <= pos1 && pos2 + len2 < pos1 + len1)
		{
			/*     1XXXX----|
			 * 2--------|
			 * 
			 * The first part of this operation falls within the range of
			 * another.
			 */
			var result = this.split(pos2 + len2 - pos1);
			result.second.position = pos2;
			result.second.recon = this.recon.update(0,
				other.what.slice(pos1 - pos2) );
			return result.second;
		}
		if(pos2 > pos1 && pos2 + len2 >= pos1 + len1)
		{
			/* 1----XXXXX|
			 *     2--------|
			 *
			 * The second part of this operation falls within the range of
			 * another.
			 */
			var result = this.split(pos2 - pos1);
			result.first.recon = this.recon.update(result.first.getLength(), other.what.slice(0, pos1 + len1 - pos2) );
			return result.first;
		}
		if(pos2 > pos1 && pos2 + len2 < pos1 + len1)
		{
			/* 1-----XXXXXX---|
			 *      2------|
			 *
			 * Another operation falls completely within the range of this
			 * operation. We remove that part.
			 */
			
			// We split this operation two times: first at the beginning of
			// the second operation, then at the end of the second operation.
			var r1 = this.split(pos2 - pos1);
			var r2 = r1.second.split(len2);
			
			// The resulting Delete operation consists of the first and the
			// last part, which are merged back into a single operation.
			var result = r1.first.merge(r2.second);
			result.recon = this.recon.update(pos2 - pos1, other.what);
			return result;
		}
	}
};

/** Mirrors this Delete operation. Returns an operation which inserts the text
 *  that this Delete operation would remove. If this Delete operation is not
 *  reversible, the return value is undefined.
 *  @type Operations.Insert
 */
Operations.Delete.prototype.mirror = function() {
	if(this.isReversible())
		return new Operations.Insert(this.position, this.what.copy());
};

/** Instantiates a new Split operation object.
 *  @class An operation which wraps two different operations into a single
 *  object. This is necessary for example in order to transform a Delete
 *  operation against an Insert operation which falls into the range that is
 *  to be deleted.
 *  @param {Operation} first
 *  @param {Operation} second
 */
Operations.Split = function(first, second) {
	this.first = first;
	this.second = second;
};

Operations.Split.prototype.requiresCID = true;

Operations.Split.prototype.toString = function() {
	return "Split(" + this.first + ", " + this.second + ")";
};

Operations.Split.prototype.toHTML = function() {
	return "Split(" + this.first.toHTML() + ", " + this.second.toHTML() + ")";
};

/** Applies the two components of this split operation to the given buffer
 *  sequentially. The second component is implicitly transformed against the 
 *  first one in order to do so.
 *  @param {Buffer} buffer The buffer to which this operation is to be applied.
 */
Operations.Split.prototype.apply = function(buffer) {
	this.first.apply(buffer);
	var transformedSecond = this.second.transform(this.first);
	transformedSecond.apply(buffer);
};

Operations.Split.prototype.cid = function() {};

/** Transforms this Split operation against another operation. This is done
 *  by transforming both components individually.
 *  @param {Operation} other
 *  @param {Operation} [cid]
 */
Operations.Split.prototype.transform = function(other, cid) {
	if(cid == this || cid == other)
		return new Operations.Split(
			this.first.transform(other, (cid == this ? this.first : other)),
			this.second.transform(other, (cid == this ? this.second : other))
		);
	else
		return new Operations.Split(
			this.first.transform(other),
			this.second.transform(other)
		);
};

/** Mirrors this Split operation. This is done by transforming the second
 *  component against the first one, then mirroring both components
 *  individually.
 *  @type Operations.Split
 */
Operations.Split.prototype.mirror = function() {
	var newSecond = this.second.transform(this.first);
	return new Operations.Split(this.first.mirror(), newSecond.mirror());
};

/** Creates a new Recon object.
 *  @class The Recon class is a helper class which collects the parts of a
 *  Delete operation that are lost during transformation. This is used to
 *  reconstruct the text of a remote Delete operation that was issued in a
 *  previous state, and thus to make such a Delete operation reversible.
 *  @param {Recon} [recon] Pre-initialize the Recon object with data from
 *  another object.
 */
function Recon(recon) {
	if(recon)
		this.segments = recon.segments.slice(0);
	else
		this.segments = new Array();
}

Recon.prototype.toString = function() {
	return "Recon(" + this.segments + ")";
};

/** Creates a new Recon object with an additional piece of text to be restored
 *  later.
 *  @param {Number} offset
 *  @param {Buffer} buffer
 *  @type {Recon}
 */
Recon.prototype.update = function(offset, buffer) {
	var newRecon = new Recon(this);
	if(buffer instanceof Buffer)
		newRecon.segments.push(new ReconSegment(offset, buffer));
	return newRecon;
};

/** Restores the recon data in the given buffer.
 *  @param {Buffer} buffer
 */
Recon.prototype.restore = function(buffer) {
	for(var index in this.segments)
	{
		var segment = this.segments[index];
		buffer.splice(segment.offset, 0, segment.buffer);
	}
};

/** Instantiates a new ReconSegment object.
 *  @class ReconSegments store a range of text combined with the offset at
 *  which they are to be inserted upon restoration.
 *  @param {Number} offset
 *  @param {Buffer} buffer
 */
function ReconSegment(offset, buffer) {
	this.offset = offset;
	this.buffer = buffer.copy();
}

ReconSegment.prototype.toString = function() {
	return "(" + this.offset + ", " + this.buffer + ")";
};
