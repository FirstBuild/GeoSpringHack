/*
 * Copyright (c) 2013 - General Electric - Confidential - All Rights Reserved
 * 
 * Author: Christopher Baker <christopher.baker2@ge.com>
 *  
 */

var events = require("events");
var util = require("util");
var fs = require("fs");
var extensions = require("./gea2-extensions.js");
var gea = require("./gea2-erd.js");

const VERSION_COMMAND = 0x01;
const GEA2_BROADCAST_ADDRESS = 0xff;
const GEA2_APPLIANCE_DIRECTORY = __dirname + "/";
const GEA2_APPLIANCE_FILE_PREFIX = "gea2-appliance-";

/**
 * This class wraps the gea bus provided when bound with
 * a new bus that automatically sends a broadcast version request
 * and responds with the application version.
 *
 * version - the application version.
 * bus - the instance of the GEA2 bus to wrap.
 *
 */
function Gea2Bus(version, bus) {
    var self = this;
    
    bus.on("message", function(message) {    
        if (message.command == VERSION_COMMAND) {        
            if (message.data.length == 0) {
                bus.send({
                    destination: message.source,
                    command: message.command,
                    data: version
                });
           
                if (message.destination == GEA2_BROADCAST_ADDRESS) {
                    bus.send({
                        destination: message.source,
                        command: VERSION_COMMAND
                    });
                }
            }
            else {
                self.emit("version", message);
            }
        }
        else {
            self.emit("message", message);
        }
    });
    
    bus.on("read", function(request, response) {
        self.emit("read", request, response);
    });
    
    bus.on("write", function(request, response) {
        self.emit("write", request, response);
    });
    
    bus.on("subscribe", function(request, response) {
        self.emit("subscribe", request, response);
    });
    
    bus.on("publish", function(message) {
        self.emit("publish", message);
    });
    
    this.wait  = bus.wait;
    this.send  = bus.send;
    this.read  = bus.read;
    this.write = bus.write;
    this.publish  = bus.publish;
    this.subscribe  = bus.subscribe;
    this.createErd = bus.createErd;
    
    this.discover = function() {
        bus.send({ command: VERSION_COMMAND });
    };
}

util.inherits(Gea2Bus, events.EventEmitter);

/**
 * This function is called to bind an entity to the GEA2 bus.
 * The callback is called when the binding is complete.
 * The callback should be called once per GEA2 bus interface.
 *
 * source_address - the board address to bind to.
 * version - the software application version.
 * callback - the function to call when the bus is bound.
 *
 */
exports.bind = function(source_address, version, callback) {
    gea.bind(source_address, function(bus) {
        var appliance_bus = new Gea2Bus(version, bus);
        
        extensions.find(GEA2_APPLIANCE_DIRECTORY, GEA2_APPLIANCE_FILE_PREFIX, function(appliance) {
            appliance.discover(appliance_bus);
        });
        
        callback(appliance_bus);
        appliance_bus.discover();
    });
};

