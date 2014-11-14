/*
 * Copyright (c) 2013 - General Electric - Confidential - All Rights Reserved
 *
 * Author: Christopher Baker <christopher.baker2@ge.com>
 *
 */

const ERD_MODEL_NUMBER = 0x0001;
const ERD_SERIAL_NUMBER = 0x0002;
const ERD_KWH_DATA = 0x0010

const ERD_SET_MODE = 0x4000;
const ERD_TANK_CURRENT_TEMP = 0x4002;
const ERD_TANK_SET_TEMP = 0x4003;
const ERD_ACTUAL_MODE = 0x4006;


const GEOSPRING_MODEL_NUMBER_COMMAND = 0xc5;
const GEOSPRING_SERIAL_NUMBER_COMMAND = 0xc6;
const GEOSPRING_STATUS_QUERY_COMMAND = 0xde10;
const GEOSPRING_KWH_DATA_COMMAND = 0xde12;
const GEOSPRING_MODE_COMMAND = 0xdf14;
const GEOSPRING_WRITE_SETPOINT_COMMAND = 0xa5;
const GEOSPRING_RESET_ENERGY_COMMAND = 0xdf07;

const GEOSPRING_MODE_HYBRID = 0x00;
const GEOSPRING_MODE_STANDARD_ELECTRIC = 0x01;
const GEOSPRING_MODE_EHEAT = 0x02;
const GEOSPRING_MODE_HIGH_DEMAND = 0x03;
const GEOSPRING_MODE_VACATION = 0x04;
const GEOSPRING_MODE_RESULT_SUCCESS = 0x00;
const GEOSPRING_MODE_RESULT_UNAVAILABLE = 0x01;
const GEOSPRING_MODE_RESULT_INVALID = 0x02;

function GeoSpring(bus, address, version) {
	this.bus = bus;
	this.address = address;
	this.version = version;
}

GeoSpring.prototype.readModelNumber = function(callback) {
	this.read(ERD_MODEL_NUMBER, function(err, data) {
		callback(err, data === undefined ? null : data.join(""));
	});
}

GeoSpring.prototype.readSerialNumber = function(callback) {
	this.read(ERD_SERIAL_NUMBER, function(err, data) {
		callback(err, data === undefined ? null : data.join(""));
	});
}

function bytesToEnergy(data) {
	var out = {
		power_W: (data[0] << 8 | data[1]),
		energy_Ws: (data[2] << 8 * 3 | data[3] << 8 * 2 | data[4] << 8 | data[5]),
		time_S: (data[6] << 8 | data[7])
	}
	return out;
}

GeoSpring.prototype.readKwhData = function(callback) {
	var self = this;
	
	// console.log("kwh read -- entering")

	this.read(ERD_KWH_DATA, function(err, data) {
		
		// console.log("kwh read -- first read:")

		if (err) return callback(err);

		var out = bytesToEnergy(data);
		
		// console.log(out);

		var k = 0;
		function resetAndReturn() {
			k++;
			if(k > 5) return callback("retry count (5) exceeded");
				
			
			// console.log("kwh read -- reset and return")
			self.bus.send({
				destination: self.address,
				command: GEOSPRING_RESET_ENERGY_COMMAND,
				data: []
			}, function(err, msg) {
				
				// console.log("kwh read -- post reset")
				self.read(ERD_KWH_DATA, function(err, data) {
					
					// console.log("kwh read -- post reset read:")
					
					if (!err) {
						var xx = bytesToEnergy(data);
						// console.log(xx);
						if (xx.time_S < out.time_S) {
							callback(null, out);
						} else {
							out = xx;
							resetAndReturn();
						}
					} else {
						// console.error(err);
						resetAndReturn();
					}

				});
			});

		}
		resetAndReturn();
	});
}

GeoSpring.prototype.readModeSetting = function(callback) {
	this.read(ERD_SET_MODE, callback);
}

GeoSpring.prototype.writeModeActual = function(data, callback) {
    this.write(ERD_ACTUAL_MODE, data, callback);
}

GeoSpring.prototype.readModeActual = function(callback) {
	this.read(ERD_ACTUAL_MODE, callback);
}

GeoSpring.prototype.readTempCurrent = function(callback) {
	this.read(ERD_TANK_CURRENT_TEMP, callback);
}

GeoSpring.prototype.readTempSetting = function(callback) {
	this.read(ERD_TANK_SET_TEMP, callback);
}
GeoSpring.prototype.writeTankTempSetting = function(data, callback) {
    this.write(ERD_TANK_SET_TEMP, data, callback);
}

GeoSpring.prototype.createResponder = function(erd, callback) {
	callback = callback || function() {};
	switch (erd) {
		case ERD_MODEL_NUMBER:
			return {
				command: GEOSPRING_MODEL_NUMBER_COMMAND,
				callback: function(err, msg) {
					callback(err, msg === undefined ? null : msg.data);
				}
			}
			break;
		case ERD_SERIAL_NUMBER:
			return {
				command: GEOSPRING_SERIAL_NUMBER_COMMAND,
				callback: function(err, msg) {
					callback(err, msg === undefined ? null : msg.data);
				}
			}
			break;
		case ERD_KWH_DATA:
			return {
				command: GEOSPRING_KWH_DATA_COMMAND,
				callback: function(err, msg) {
					callback(err, msg === undefined ? null : msg.data);
				}
			}
			break;
		case ERD_SET_MODE:
			return {
				command: GEOSPRING_STATUS_QUERY_COMMAND,
				callback: function(err, msg) {
					callback(err, msg === undefined ? null : msg.data[0]);
				}
			};
			break;
		case ERD_TANK_CURRENT_TEMP:
			return {
				command: GEOSPRING_STATUS_QUERY_COMMAND,
				callback: function(err, msg) {
					callback(err, msg === undefined ? null : msg.data[2]);
				}
			}
			break;
		case ERD_TANK_SET_TEMP:
			return {
				command: GEOSPRING_STATUS_QUERY_COMMAND,
				callback: function(err, msg) {
					callback(err, msg === undefined ? null : msg.data[3]);
				}
			}
			break;
	}
};

GeoSpring.prototype.read = function(erd, callback) {
	var responder = this.createResponder(erd, callback);

	if (responder) {
		var message = {
			destination: this.address,
			command: responder.command
		};

		this.bus.send(message, responder.callback);
	} else {
		callback("not a supported erd");
	}
};

GeoSpring.prototype.write = function(erd, data, callback) {
	var self = this;
	switch (erd) {
		case ERD_TANK_SET_TEMP:
			this.bus.send({
				destination: this.address,
				command: GEOSPRING_WRITE_SETPOINT_COMMAND,
				data: [data]
			});
			var cnt = 0;

			function checkit() {
				if (cnt > 5) {
					callback("timeout on write");
				} else {
					self.read(0x4003, function(err, temp) {
						if (temp == data) {
							callback(null);
						} else {
							setTimeout(checkit, 100);
						}
					});
				}
				cnt++;
			}
			checkit();
			break;
		case ERD_ACTUAL_MODE:
			this.bus.send({
				destination: this.address,
				command: GEOSPRING_MODE_COMMAND,
				data: [data, 0x00, 80]
			}, function(err, msg) {
				if (err) {
					callback(err);
				} else {
					if (msg.data[0] == 0) {
						callback(null)
					} else {
						callback(msg.data[0]);
					}
				}
			});
			break;
		default:
			callback("not supported");
	}
};

GeoSpring.prototype.send = function(command, data, callback) {
	this.bus.send({
		destination: this.address,
		command: command,
		data: data
	}, callback);
};

exports.discover = function(bus) {

	bus.on("version", function(message) {

		var geospring = new GeoSpring(bus, message.source, message.data.join("."))

		bus.send({
			destination: message.source,
			command: GEOSPRING_STATUS_QUERY_COMMAND,
		}, function(error, message) {
			if (!error) {
				bus.emit("geospring", geospring);
			}
		});
	});
};
