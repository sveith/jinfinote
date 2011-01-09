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

/** Creates a new Segment instance given a user ID and a string.
 *  @param {Number} user User ID
 *  @param {String} text Text
 *  @class Stores a chunk of text together with the user it was written by.
 */
function Segment(user, text) {
	this.user = user;
	this.text = text;
}

Segment.prototype.toString = function() {
	return this.text;
};

Segment.prototype.toHTML = function() {
	var text = this.text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
	;
	
	return '<span class="segment user-' + this.user + '">' + text + '</span>';
};

/** Creates a copy of this segment.
 *  @returns {Segment} A copy of this segment.
 */
Segment.prototype.copy = function() {
	return new Segment(this.user, this.text)
};

/**
 * Creates a new Buffer instance from the given array of
 * segments.
 * @param {Array} [segments] The segments that this buffer should be
 * pre-filled with.
 * @class Holds multiple Segments and provides methods for modifying them at
 * a character level.
 */
function Buffer(segments) {
	this.segments = new Array();
	
	if(segments && segments.length)
	{
		for(var index in segments)
			this.segments.push(segments[index].copy());
	}
}

Buffer.prototype.toString = function() { return this.segments.join(""); };

Buffer.prototype.toHTML = function() {
	var result = '<span class="buffer">';
	for(var index = 0; index < this.segments.length; index++)
		result += this.segments[index].toHTML();
	result += '</span>';
	return result;
};

/** Creates a deep copy of this buffer.
 * @type Buffer
 */
Buffer.prototype.copy = function() {
	return this.slice(0);
};

/** Cleans up the buffer by removing empty segments and combining adjacent
 *  segments by the same user.
 */
Buffer.prototype.compact = function() {
	var segmentIndex = 0;
	while(segmentIndex < this.segments.length)
	{
		if(this.segments[segmentIndex].text.length == 0)
		{
			// This segment is empty, remove it.
			this.segments.splice(segmentIndex, 1);
			continue;
		} else if(segmentIndex < this.segments.length - 1 && 
			this.segments[segmentIndex].user == 
			this.segments[segmentIndex+1].user) {
			
			// Two consecutive segments are from the same user; merge them
			// into one.
			this.segments[segmentIndex].text +=
				this.segments[segmentIndex+1].text;
			
			this.segments.splice(segmentIndex+1, 1);
			continue;
		}
		
		segmentIndex += 1;
	}
};

/** Calculates the total number of characters contained in this buffer.
 * @returns Total character count in this buffer
 * @type Number
 */
Buffer.prototype.getLength = function() {
	var length = 0;
	for(var index = 0; index < this.segments.length; index++)
		length += this.segments[index].text.length;
	
	return length;
}

/** Extracts a deep copy of a range of characters in this buffer and returns
 *  it as a new Buffer object.
 *  @param {Number} begin Index of first character to return
 *  @param {Number} [end] Index of last character (exclusive). If not
 *  provided, defaults to the total length of the buffer.
 *  @returns New buffer containing the specified character range.
 *  @type Buffer
 */
Buffer.prototype.slice = function(begin, end) {
	var result = new Buffer();
	
	var segmentIndex = 0, segmentOffset = 0, sliceBegin = begin,
		sliceEnd = end;
	
	if(sliceEnd == undefined)
		sliceEnd = Number.MAX_VALUE;
	
	while(segmentIndex < this.segments.length && sliceEnd >= segmentOffset)
	{
		var segment = this.segments[segmentIndex];
		if(sliceBegin - segmentOffset < segment.text.length &&
			sliceEnd - segmentOffset > 0)
		{
			var newText = segment.text.slice(sliceBegin - segmentOffset,
				sliceEnd - segmentOffset);
			var newSegment = new Segment(segment.user, newText);
			result.segments.push(newSegment);
			
			sliceBegin += newText.length;
		}
		
		segmentOffset += segment.text.length;
		segmentIndex += 1;
	}
	
	result.compact();
	
	return result;
}

/**
 *  Like the Array "splice" method, this method allows for removing and
 *  inserting text in a buffer at a character level.
 *  @param {Number} index    The offset at which to begin inserting/removing
 *  @param {Number} [remove] Number of characters to remove
 *  @param {Buffer} [insert] Buffer to insert
 */
Buffer.prototype.splice = function(index, remove, insert) {
	if(index > this.getLength())
		throw "Buffer splice operation out of bounds";
	
	var segmentIndex = 0, segmentOffset = 0, spliceIndex = index,
		spliceCount = remove, spliceInsertOffset = undefined;
	while(segmentIndex < this.segments.length)
	{
		var segment = this.segments[segmentIndex];
		
		if(spliceIndex >= 0 && spliceIndex < segment.text.length)
		{
			// This segment is part of the region to splice.
			
			// Store the text that this splice operation removes to adjust the
			// splice offset correctly later on.
			var removedText = segment.text.slice(spliceIndex, spliceIndex +
				spliceCount);
			
			if(spliceIndex == 0) {
				// abcdefg
				// ^        We're splicing at the beginning of a segment
				
				if(spliceIndex + spliceCount < segment.text.length)
				{
					// abcdefg
					// ^---^    Remove a part at the beginning
					
					if(spliceInsertOffset == undefined)
						spliceInsertOffset = segmentIndex;
					
					segment.text = segment.text.slice(spliceIndex +
						spliceCount);
				} else {
					// abcdefg
					// ^-----^  Remove the entire segment
					
					if(spliceInsertOffset == undefined)
						spliceInsertOffset = segmentIndex;
					
					segment.text = "";
					this.segments.splice(segmentIndex, 1);
					segmentIndex -= 1;
				}
			} else {
				// abcdefg
				//   ^	    We're splicing inside a segment
			
				if(spliceInsertOffset == undefined)
					spliceInsertOffset = segmentIndex + 1;
				
				if(spliceIndex + spliceCount < segment.text.length)
				{
					// abcdefg
					//   ^--^   Remove a part in between
					
					// Note that if spliceCount == 0, this function only
					// splits the segment in two. This is necessary in case we
					// want to insert new segments later.
					
					var splicePost = new Segment(segment.user,
						segment.text.slice(spliceIndex + spliceCount));
					segment.text = segment.text.slice(0, spliceIndex);
					this.segments.splice(segmentIndex + 1, 0, splicePost);
				} else {
					// abcdefg
					//   ^---^  Remove a part at the end	
					
					segment.text = segment.text.slice(0, spliceIndex);
				}
			}
			
			spliceCount -= removedText.length;
		}
		
		if(spliceIndex < segment.text.length && spliceCount == 0)
		{
			// We have removed the specified amount of characters. No need to
			// continue this loop since nothing remains to be done.
			
			if(spliceInsertOffset == undefined)
				spliceInsertOffset = spliceIndex;
			
			break;
		}
		
		spliceIndex -= segment.text.length;
		
		segmentIndex += 1;
	}
	
	if(insert instanceof Buffer)
	{
		// If a buffer has been given, we insert copies of its segments at the
		// specified position.
		
		if(spliceInsertOffset == undefined)
			spliceInsertOffset = this.segments.length;
		
		for(var insertIndex = 0; insertIndex < insert.segments.length;
			insertIndex ++)
		{
			this.segments.splice(spliceInsertOffset + insertIndex, 0,
				insert.segments[insertIndex].copy());
		}
	}
	
	// Clean up since the splice operation might have fragmented some segments.
	this.compact();
}
