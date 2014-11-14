/*
 * Copyright (c) 2013 - General Electric - Confidential - All Rights Reserved
 * 
 * Author: Christopher Baker <christopher.baker2@ge.com>
 *  
 */

var events = require("events");
var util = require("util");
var extensions = require("./gea2-extensions.js");
var stream = require("./gea2-stream.js");

const GEA2_INTERFACE_DIRECTORY = __dirname + "/";
const GEA2_INTERFACE_FILE_PREFIX = "gea2-interface-";
const GEA2_BROADCAST_ADDRESS = 0xff;
const GEA2_DEFAULT_RESPONSE_TIMEOUT = 500;

function AbstractGeaBus(source_address, bus) {
    var self = this;

    bus.on("message", function(message) {
        self.emit("message", message);
    });
    
    function expand(message) {
        var expanded = message;
        
        if (expanded.data == undefined) expanded.data = [];
        if (expanded.source == undefined) expanded.source = source_address;
        if (expanded.destination == undefined) expanded.destination = GEA2_BROADCAST_ADDRESS;
        
        return expanded;
    }
    
    this.wait = function(message, callback, timeout) {
        if (message == undefined) message = { };
        if (callback == undefined) callback = function () { };
        if (timeout == undefined) timeout = GEA2_DEFAULT_RESPONSE_TIMEOUT;
        
        var timer = setTimeout(function() {
            timer = null;
            callback(new Error("The timeout has been reached while waiting for the message"));
        }, timeout);
        
        function isMatch(response) {
			if(response.source == message.source && response.command == message.command){
				
				if(message.b2){
					if(message.b2 == response.data[0]){
						var b2 = response.data.shift();
						response.command = (response.command << 8) | b2;
						return true;
					}else{
						return false;
					}
				}else{
					return true;
				}
			}
            return false;
        }
        
        function onMessage(response) {
            if (timer) {
                if (isMatch(response)) {
                    clearTimeout(timer);
                    callback(null, response);
                }
                else {
                    bus.once("message", onMessage);
                }
            }
        }
        
        bus.once("message", onMessage);
    };
    
    this.send = function(message, callback, timeout) {
        if (callback == undefined) callback = function () { };
        
        message = expand(message);
		var twobyte = false;
		if ((message.command >> 8)) {
			var cmd = message.command >> 8;
			var dd = message.command & 0xff;
			message.command = cmd;
			message.data.unshift(dd);
			twobyte = true;
		}
        
        try {
            bus.send(message);
            
            this.wait({
                source: message.destination,
                command: message.command,
				b2 : ((twobyte) ? message.data[0] : null)
            }, callback, timeout);
        }
        catch (e) {
            callback(e);
        }
    };
}

util.inherits(AbstractGeaBus, events.EventEmitter);

exports.bind = function(source_address, callback) {
    extensions.find(GEA2_INTERFACE_DIRECTORY, GEA2_INTERFACE_FILE_PREFIX, function(interface) {
        interface.bind(source_address, function(bus) {
            callback(new AbstractGeaBus(source_address, bus));
        });
    });
};
