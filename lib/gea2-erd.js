/*
 * Copyright (c) 2013 - General Electric - Confidential - All Rights Reserved
 * 
 * Author: Christopher Baker <christopher.baker2@ge.com>
 *  
 */

var events = require("events");
var util = require("util");
var gea = require("./gea2-interface.js");
var stream = require("./gea2-stream.js");

const GEA2_COMMAND_ERD_READ = 0xf0;
const GEA2_COMMAND_ERD_WRITE = 0xf1;
const GEA2_COMMAND_ERD_SUBSCRIBE = 0xf2;
const GEA2_COMMAND_ERD_PUBLISH = 0xf5;
const GEA2_ERD_TIMEOUT = 500;

/**
 * This class is provided as a convenience mechanism.
 * When a ERD read event is emitted, an instance of this class is provided.
 * This instance provides methods for responding with an error or with data.
 *
 * erd - the ERD requesting to be read.
 * responder - the object that manages errors and successes for all ERDs.
 *
 */
function ErdReadResponder(erd, responder) {
    this.error = function() {
        responder.error(erd);
    };
    
    this.success = function(data) {
        responder.success(erd, data);
    };
}

/**
 * This class aggregates responses into a single GEA2 packet before sending.
 * The GEA2 protocol allows for a client to request a read of multiple ERDs
 * in a single GEA2 command.
 * Rather than expose this complexity in the API, each ERD is separated into
 * a single ERD request object, and responses are aggregated before being sent.
 *
 * count - the number of ERDs being requested.
 * bus - the instance of the GEA2 bus.
 * request - the GEA2 message that requested the ERDs.
 *
 */
function ReadResponder(count, bus, request) {
    var successes = [];
    var errors = 0;
    
    function SendIfComplete() {
        if (successes.length + errors == count) {
            var length = 1;
            
            successes.forEach(function (item) {
                length += 3 + item.data.length;
            });
        
            var writer = new stream.writer(length, stream.BIG_ENDIAN);
            writer.writeUInt8(successes.length);
            
            successes.forEach(function (item) {
                writer.writeUInt16(item.erd);
                writer.writeUInt8(item.data.length);
                writer.writeBytes(item.data);
            });
        
            bus.send({
                destination: request.source,
                command: request.command,
                data: writer.toArray()
            });
            
            delete writer;
        }
    }
    
    this.error = function(erd) {
        errors++;
        SendIfComplete();
    };
    
    this.success = function(erd, data) {
        successes.push({ erd: erd, data: data });
        SendIfComplete();
    };
}

/**
 * This class is provided as a convenience mechanism.
 * When a ERD write event is emitted, an instance of this class is provided.
 * This instance provides methods for responding with an error or success.
 *
 * erd - the ERD requesting to be written.
 * responder - the object that manages errors and successes for all ERDs.
 *
 */
function ErdWriteResponder(erd, responder) {
    this.error = function() {
        responder.error(erd);
    };
    
    this.success = function() {
        responder.success(erd);
    };
}

/**
 * This class aggregates responses into a single GEA2 packet before sending.
 * The GEA2 protocol allows for a client to request a write for multiple ERDs
 * in a single GEA2 command.
 * Rather than expose this complexity in the API, each ERD is separated into
 * a single ERD request object, and responses are aggregated before being sent.
 *
 * count - the number of ERDs being requested.
 * bus - the instance of the GEA2 bus.
 * request - the GEA2 message that requested the ERDs.
 *
 */
function WriteResponder(count, bus, request) {
    var successes = [];
    var errors = 0;
    
    function SendIfComplete() {
        if (successes.length + errors == count) {
            var length = 1 + 2 * successes.length;
        
            var writer = new stream.writer(length, stream.BIG_ENDIAN);
            writer.writeUInt8(successes.length);
            
            successes.forEach(function (erd) {
                writer.writeUInt16(erd);
            });
        
            bus.send({
                destination: request.source,
                command: request.command,
                data: writer.toArray()
            });
            
            delete writer;
        }
    }
    
    this.error = function(erd) {
        errors++;
        SendIfComplete();
    };
    
    this.success = function(erd) {
        successes.push(erd);
        SendIfComplete();
    };
}

/**
 * This class aggregates responses into a single GEA2 packet before sending.
 * The GEA2 protocol allows for a client to subscribe to multiple ERDs
 * in a single GEA2 command.
 * Rather than expose this complexity in the API, each ERD is separated into
 * a single ERD object, and responses are aggregated before being sent.
 *
 * count - the number of ERDs being requested.
 * bus - the instance of the GEA2 bus.
 * request - the GEA2 message that requested the ERDs.
 *
 */
function SubscribeResponder(count, bus, request) {
    var successes = 0;
    var errors = 0;
    
    function SendIfComplete() {
        if (successes + errors == count) {
            bus.send({
                destination: request.source,
                command: request.command,
                data: [ successes ]
            });
        }
    }
    
    this.error = function() {
        errors++;
        SendIfComplete();
    };
    
    this.success = function(data) {
        successes++;
        SendIfComplete();
    };
}

/**
 * This class provides a queueing mechanism for requests.
 * Because the GEA2 protocol does not contain request identifiers, there is
 * not a way to link requests with responses.
 * To ensure proper linking, requests are queued and delivered one at a time.
 * Only once a response is received will the next request be delivered.
 *
 * bus - the GEA2 bus to use to deliver messages.
 *
 */
function QueuedBus(bus) {
    var queue = [];
    var timer = null;

    function onTimeout() {
        if (queue.length > 0) {
            var callback = queue.splice(0, 1)[0].callback;
                
            if (callback) {
                callback(new Error("The timeout has been reached while waiting for the erd response"));
            }
            
            if (queue.length > 0) {
                onNextMessage();
            }
        }
    }

    function onNextMessage() {
        bus.send(queue[0].message);
        timer = setTimeout(onTimeout, GEA2_ERD_TIMEOUT);
    }
    
    this.callback = function() {
        clearTimeout(timer);
        
        if (queue.length > 0) {
            var callback = queue.splice(0, 1)[0].callback;
            
            if (queue.length > 0) {
                onNextMessage();
            }
            
            return callback;
        }
    };
    
    this.send = function(message, callback) {
        queue.push({ message: message, callback: callback });
        
        if (queue.length == 1) {
            onNextMessage();
        }
    };
}

/**
 * This class provides functions for reading, writing, publishing, and
 * subscribing to a single ERD. This abstraction layer is provided to
 * simplify ERD control. Without this, the user would have to send raw
 * GEA2 commands and add the ERD frames.
 *
 * bus - the GEA2 bus.
 * address - the destination address to send messages to.
 * erd - the ERD to control.
 * serializer - the class used to (de)serialize byte arrays into objects.
 *
 */
function ErdObject(bus, address, erd, serializer) {
    var self = this;
    
    this.read = function(callback) {
        var request = {
            destination: address,
            erd: erd
        };
    
        bus.read(request, function(error, response) {
            if (callback) {
                if (error) {
                    callback(error);
                }
                else if (response.length == 0) {
                    callback(new Error("The read response returned no data"));
                }
                else {
                    callback(error, serializer.deserialize(response[0].data));
                }
            }
        });
    };
    
    this.write = function(data, callback) {
        var request = {
            destination: address,
            erd: erd,
            data: serializer.serialize(data)
        };
    
        bus.write(request, function(error, count) {
            if (callback) {
                if (error) {
                    callback(error);
                }
                else {
                    callback(error, count > 0);
                }
            }
        });
    };
    
    this.subscribe = function(callback) {
        var request = {
            destination: address,
            erd: erd
        };
    
        bus.subscribe(request, function(error, count) {
            if (callback) {
                if (error) {
                    callback(error);
                }
                else if (count == 0) {
                    callback(new Error("Subscription request was rejected"));
                }
                else {
                    bus.on("publish", function(message) {
                        if (message.erd == erd) {
                            callback(error, serializer.deserialize(message.data));
                        }
                    });
                }
            }
        });
    };
}

util.inherits(ErdObject, events.EventEmitter);

/**
 * This class wraps the gea bus provided when bound with a new bus that
 * provides additional functions for manipulating ERDs. The ERD requests are
 * queued and new events are emitted. Other than 'message' which is still
 * provided, the following events are emitted: 'read', 'write', 'publish', and
 * 'subscribe'.
 *
 * bus - the instance of the GEA2 bus to wrap.
 *
 */
function ErdBus(bus) {
    var self = this;
    var readBus = new QueuedBus(bus);
    var writeBus = new QueuedBus(bus);
    var subscribeBus = new QueuedBus(bus);
    var publishBus = new QueuedBus(bus);
    
    function OnReadResponse(messages) {
        var callback = readBus.callback();
        
        if (callback) {
            callback(null, messages);
        }
    }
    
    function OnWriteResponse(count) {
        var callback = writeBus.callback();
        
        if (callback) {
            callback(null, count);
        }
    }
    
    function OnSubscribeResponse(count) {
        var callback = subscribeBus.callback();
        
        if (callback) {
            callback(null, count);
        }
    }
    
    function OnPublishResponse() {
        var callback = publishBus.callback();
        
        if (callback) {
            callback(null);
        }
    }
    
    bus.on("message", function(message) {        
        if (message.command == GEA2_COMMAND_ERD_READ) {
            var reader = new stream.reader(message.data, stream.BIG_ENDIAN);
            var count = reader.readUInt8();

            if (message.data.length == count * 2 + 1) {
                var responder = new ReadResponder(count, bus, message);
           
                for (var i = 0; i < count; i++) {
                    var erd = reader.readUInt16();
           
                    self.emit("read", {
                        erd: erd,
                        source: message.source,
                        destination: message.destination
                    }, new ErdReadResponder(erd, responder));
                }
            }
            else {
                var messages = [];
           
                for (var i = 0; i < count; i++) {
                    var erd = reader.readUInt16();
                    var data = reader.readBytes(reader.readUInt8());
           
                    messages.push({
                        erd: erd,
                        data: data,
                        source: message.source,
                        destination: message.destination
                    });
                }
           
                OnReadResponse(messages);
            }
            
            delete reader;
        }
        else if (message.command == GEA2_COMMAND_ERD_WRITE) {        
            var reader = new stream.reader(message.data, stream.BIG_ENDIAN);
            var count = reader.readUInt8();

            /* special case for bad spec: wificat */
            if (message.data.length == 1) {
                OnWriteResponse(count);
            }
            else if (message.data.length == 1 + 2 * count) {
                OnWriteResponse(count);
            }
            else {
                var responder = new WriteResponder(count, bus, message);
           
                for (var i = 0; i < count; i++) {
                    var erd = reader.readUInt16();
                    var data = reader.readBytes(reader.readUInt8());
           
                    self.emit("write", {
                        erd: erd,
                        data: data,
                        source: message.source,
                        destination: message.destination
                    }, new ErdWriteResponder(erd, responder));
                }
            }
            
            delete reader;
        }
        else if (message.command == GEA2_COMMAND_ERD_SUBSCRIBE) {
            var reader = new stream.reader(message.data, stream.BIG_ENDIAN);
            var count = reader.readUInt8();
           
            if (message.data.length == 1) {
                OnSubscribeResponse(count);
            }
            else {
                var responder = new SubscribeResponder(count, bus, message);
           
                for (var i = 0; i < count; i++) {
                    var erd = reader.readUInt16();
                    var time = reader.readUInt8();
           
                    self.emit("subscribe", {
                        erd: erd,
                        source: message.source,
                        destination: message.destination
                    }, responder);
                }
            }
            
            delete reader;
        }
        else if (message.command == GEA2_COMMAND_ERD_PUBLISH) {
            var reader = new stream.reader(message.data, stream.BIG_ENDIAN);
           
            if (message.data.length == 0) {
                OnPublishResponse();
            }
            else {
                var count = reader.readUInt8();
           
                for (var i = 0; i < count; i++) {
                    var erd = reader.readUInt16();
                    var data = reader.readBytes(reader.readUInt8());
           
                    self.emit("publish", {
                        erd: erd,
                        data: data,
                        source: message.source,
                        destination: message.destination
                    });
                }
           
                bus.send({
                    destination: message.source,
                    command: message.command,
                    data: []
                });
            }
            
            delete reader;
        }
        
        self.emit("message", message);
    });
    
    this.read = function(message, callback) {
        message.erds = message.erds || [ message.erd ];
    
        var writer = new stream.writer(1 + 2 * message.erds.length, stream.BIG_ENDIAN);
        writer.writeUInt8(message.erds.length);
        
        message.erds.forEach(function(erd) {
            writer.writeUInt16(erd);
        });
    
        readBus.send({
            command: GEA2_COMMAND_ERD_READ,
            data: writer.toArray(),
            destination: message.destination
        }, callback);
        
        delete writer;
    };
    
    this.write = function(message, callback) {
        var writer = new stream.writer(4 + message.data.length, stream.BIG_ENDIAN);
        writer.writeUInt8(1);
        writer.writeUInt16(message.erd);
        writer.writeUInt8(message.data.length);
        writer.writeBytes(message.data);
    
        writeBus.send({
            command: GEA2_COMMAND_ERD_WRITE,
            data: writer.toArray(),
            destination: message.destination
        }, callback);
        
        delete writer;
    };
    
    this.publish = function(message, callback) {    
        var writer = new stream.writer(4 + message.data.length, stream.BIG_ENDIAN);
        writer.writeUInt8(1);
        writer.writeUInt16(message.erd);
        writer.writeUInt8(message.data.length);
        writer.writeBytes(message.data);
    
        publishBus.send({
            command: GEA2_COMMAND_ERD_PUBLISH,
            data: writer.toArray(),
            destination: message.destination
        }, callback);
        
        delete writer;
    };
    
    this.subscribe = function(message, callback) {
        message.erds = message.erds || [ message.erd ];
    
        var writer = new stream.writer(1 + 3 * message.erds.length, stream.BIG_ENDIAN);
        writer.writeUInt8(message.erds.length);
        
        message.erds.forEach(function(erd) {
            writer.writeUInt16(erd);
            writer.writeUInt8(0);
        });
    
        subscribeBus.send({
            command: GEA2_COMMAND_ERD_SUBSCRIBE,
            data: writer.toArray(),
            destination: message.destination
        }, callback);
        
        delete writer;
    };
    
    this.createErd = function(address, erd, serializer) {
        return new ErdObject(self, address, erd, serializer);
    };
    
    this.wait = bus.wait;
    this.send = bus.send;
}

util.inherits(ErdBus, events.EventEmitter);

/**
 * This function is called to bind an entity to the GEA2 bus.
 * The callback is called when the binding is complete.
 * The callback should be called once per GEA2 bus interface.
 *
 * source_address - the board address to bind to.
 * callback - the function to call when the bus is bound.
 *
 */
exports.bind = function(source_address, callback) {
    gea.bind(source_address, function(bus) {
        callback(new ErdBus(bus));
    });
};

