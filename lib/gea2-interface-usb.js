/*
 * Copyright (c) 2013 - General Electric - Confidential - All Rights Reserved
 * 
 * Author: Christopher Baker <christopher.baker2@ge.com>
 *  
 */

var hid = require("node-hid");
var events = require("events");
var util = require("util");
var stream = require("./gea2-stream.js");

const GEA2_HID_VENDOR_ID = 1240;
const GEA2_HID_PRODUCT_ID = 64752;
const GEA2_HID_COMMAND_VERSION = 0x05;
const GEA2_HID_COMMAND_ADDRESS_LIST = 0x01;
const GEA2_HID_COMMAND_DATA = 0x02;
const GEA2_HID_COMMAND_STATUS_VALID = 0x00;
const GEA2_HID_RETRY_COUNT = 5;
const GEA2_HID_RAND_MAX = 0xFFFF;
const GEA2_FRAME_SIZE = 8;

function Gea2Bus(source_address, hid) {
    var self = this;
    
    function get_message_id() {
        return Math.floor(Math.random() * GEA2_HID_RAND_MAX);
    }

    function send_packet(data) {
        var writer = new stream.writer(data.length + 5);
        writer.writeUInt16(get_message_id());
        writer.writeUInt8(0);
        writer.writeUInt8(1);
        writer.writeUInt8(data.length);
        writer.writeBytes(data);
    
        hid.write(writer.toArray());
        delete writer;
    }
    
    function packet_received(packet) {
        var reader = new stream.reader(packet);
        var type = reader.readUInt8();
            
        if (type == GEA2_HID_COMMAND_DATA) {
            var status = reader.readUInt8();
                
            if (status == GEA2_HID_COMMAND_STATUS_VALID) {
                var length = reader.readUInt8();
                var destination = reader.readUInt8();
                var ignored = reader.readUInt8();
                var source = reader.readUInt8();
                var command = reader.readUInt8();
                var data = reader.readBytes(packet.length - 7);
                
                self.emit("message", {
                    command: command,
                    source: source,
                    destination: destination,
                    data: data
                });
            }
        }
        
        delete reader;
    }
    
    function receive_packet() {
        hid.read(function (error, data) {
            if (error) {
                // silent error and retry
            }
            else {
                var reader = new stream.reader(data);
                var message_id = reader.readUInt16();
                var packet_index = reader.readUInt8();
                var packet_count = reader.readUInt8();
                var packet = reader.readBytes(reader.readUInt8());
                
                packet_received(packet);
                delete reader;
            }
                
            receive_packet();
        });
    }
    
    this.send = function(message) {        
        var writer = new stream.writer(message.data.length + 19, stream.BIG_ENDIAN);
        writer.writeUInt8(GEA2_HID_COMMAND_DATA);
        writer.writeUInt32(get_message_id());
        writer.writeUInt8(GEA2_HID_RETRY_COUNT);
        writer.writeUInt8(message.data.length + 4);
        writer.writeUInt8(message.destination);
        writer.writeUInt8(GEA2_FRAME_SIZE + message.data.length);
        writer.writeUInt8(message.source);
        writer.writeUInt8(message.command);
        writer.writeBytes(message.data);
        
        send_packet(writer.toArray());
        delete writer;
    };
    
    send_packet([GEA2_HID_COMMAND_ADDRESS_LIST, 0x01, source_address]);
    receive_packet();
}

util.inherits(Gea2Bus, events.EventEmitter);

exports.bind = function(source_address, callback) {
    var devices = hid.devices(GEA2_HID_VENDOR_ID, GEA2_HID_PRODUCT_ID);

    for (var i = 0; i < devices.length; i++) {
        callback(new Gea2Bus(source_address, new hid.HID(devices[i].path)));
    }
};
