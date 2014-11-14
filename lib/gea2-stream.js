/*
 * Copyright (c) 2013 - General Electric - Confidential - All Rights Reserved
 * 
 * Author: Christopher Baker <christopher.baker2@ge.com>
 *  
 */

exports.BIG_ENDIAN = 1;
exports.LITTLE_ENDIAN = 2;

exports.reader = function(data, endianess) {
    var buffer = new Buffer(data);
    var endian = endianess || exports.LITTLE_ENDIAN;
    var index = 0;

    function terminate(ascii) {		
		var index = ascii.indexOf("\0");

		if (index < 0) {
			return ascii;
		}

		return ascii.substr(0, index);
	}
    
    this.readBytes = function(count) {
        var bytes = [];
        
        for (var i = 0; i < count; i++) {
            bytes.push(buffer[index++]);
        }
        
        return bytes;
    };
    
    this.readAscii = function(count) {
        var buffer = new Buffer(this.readBytes(count));
        var result = terminate(buffer.toString("ascii"));
        delete buffer;
        
        return result;
    };
    
    this.readHex = function(count) {
        var buffer = new Buffer(this.readBytes(count));
        var result = buffer.toString("hex");
        delete buffer;
        
        return result;
    };
    
    this.readUInt8 = function() {
        return buffer.readUInt8(index++);
    };
    
    this.readInt8 = function() {
        return buffer.readInt8(index++);
    };
    
    this.readUInt16 = function() {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.readUInt16BE(index)
            : buffer.readUInt16LE(index);
            
        index += 2;
        return value;
    };
    
    this.readInt16 = function() {    
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.readInt16BE(index)
            : buffer.readInt16LE(index);
            
        index += 2;
        return value;
    };
    
    this.readUInt32 = function() {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.readUInt32BE(index)
            : buffer.readUInt32LE(index);
            
        index += 4;
        return value;
    };
    
    this.readInt32 = function() {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.readInt32BE(index)
            : buffer.readInt32LE(index);
            
        index += 4;
        return value;
    };
    
    this.readUInt64 = function() {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.readUInt64BE(index)
            : buffer.readUInt64LE(index);
            
        index += 8;
        return value;
    };
    
    this.readInt64 = function() {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.readInt64BE(index)
            : buffer.readInt64LE(index);
            
        index += 8;
        return value;
    };
};

exports.writer = function(size, endianess) {
    var buffer = new Buffer(size);
    var endian = endianess || exports.LITTLE_ENDIAN;
    var index = 0;
    
    this.toArray = function() {
        var array = [];
        
        for (var i = 0; i < index; i++) {
            array.push(buffer[i]);
        }
        
        return array;
    };
    
    this.writeBytes = function(value) {        
        for (var i = 0; i < value.length; i++) {
            buffer[index++] = value[i];
        }
    };
    
    this.writeAscii = function(value) {
        var buffer = new Buffer(value, "ascii");
        this.writeBytes(buffer);
        delete buffer;
    };
    
    this.writeAscii = function(value) {
        var buffer = new Buffer(value, "hex");
        this.writeBytes(buffer);
        delete buffer;
    };
    
    this.writeUInt8 = function(value) {
        buffer.writeUInt8(value, index++);
    };
    
    this.writeInt8 = function(value) {
        buffer.writeInt8(value, index++);
    };
    
    this.writeUInt16 = function(value) {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.writeUInt16BE(value, index)
            : buffer.writeUInt16LE(value, index);
            
        index += 2;
    };
    
    this.writeInt16 = function(value) {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.writeInt16BE(value, index)
            : buffer.writeInt16LE(value, index);
            
        index += 2;
    };
    
    this.writeUInt32 = function(value) {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.writeUInt32BE(value, index)
            : buffer.writeUInt32LE(value, index);
            
        index += 4;
    };
    
    this.writeInt32 = function(value) {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.writeInt32BE(value, index)
            : buffer.writeInt32LE(value, index);
            
        index += 4;
    };
    
    this.writeUInt64 = function(value) {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.writeUInt64BE(value, index)
            : buffer.writeUInt64LE(value, index);
            
        index += 8;
    };
    
    this.writeInt64 = function(value) {
        var value = (endian == exports.BIG_ENDIAN)
            ? buffer.writeInt64BE(value, index)
            : buffer.writeInt64LE(value, index);
            
        index += 8;
    };
};

exports.sizeOf = function(type, data) {
    if (type.substr(0, 4).toLowerCase() == "uint") {
        return parseInt(type.substr(4)) / 8;
    }
    else if (type.substr(0, 3).toLowerCase() == "int") {
        return parseInt(type.substr(3)) / 8;
    }
    else if (type.toLowerCase() == "hex") {
        return data.length / 2;
    }
    
    return data.length;
};

function typeName(type) {
    if (type.substr(0, 4).toLowerCase() == "uint") {
        return "UInt" + type.substr(4);
    }
    
    return type.substr(0, 1).toUpperCase() + type.substr(1);;
};

function Serializer(type, endianess) {
    this.serialize = function(data) {
        var writer = new exports.writer(exports.sizeOf(type, data), endianess);
        writer["write" + type](data);
        var result = writer.toArray();
        delete writer;
        return result;
    };
    
    this.deserialize = function(data) {
        var reader = new exports.reader(data, endianess);
        var result = reader["read" + type](data.length);
        delete reader;
        return result;
    };
}

exports.serializer = function(type, endianess) {
    if (type) {
        return new Serializer(typeName(type), endianess);
    }
    else {
        return {
            serialize:   function(data) { return data; },
            deserialize: function(data) { return data; }
        };
    }
};
