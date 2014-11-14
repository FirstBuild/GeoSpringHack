/*
 * Copyright (c) 2013 - General Electric - Confidential - All Rights Reserved
 * 
 * Author: Christopher Baker <christopher.baker2@ge.com>
 *  
 */

var gea = require("../lib/gea2.js");

const GEA_ADDRESS = 0xbb;
const APP_VERSION = [0, 0, 0, 0];

const GEOSPRING_MODE_HYBRID = 0x00;
const GEOSPRING_MODE_STANDARD_ELECTRIC = 0x01;
const GEOSPRING_MODE_EHEAT = 0x02;
const GEOSPRING_MODE_HIGH_DEMAND = 0x03;
const GEOSPRING_MODE_VACATION = 0x04;
const GEOSPRING_MODE_RESULT_SUCCESS = 0x00;
const GEOSPRING_MODE_RESULT_UNAVAILABLE = 0x01;
const GEOSPRING_MODE_RESULT_INVALID = 0x02;

gea.bind(GEA_ADDRESS, APP_VERSION, function(bus) {
    bus.once("geospring", function(hwh) {
        console.log("geospring", hwh.version);

        //read the temperature setting
        hwh.readTempSetting(function(err, data){
            if(err) return console.error("error reading temp data:", err);
            console.log("temp (set):", data);
        });

        //read the current temp
        hwh.readTempCurrent(function(err, data){
            if(err) return console.error("error reading temp data:", err);
            console.log("temp (current):", data);
        });
       
        //change the temp
        //0x8C = 140
        //0x82 = 130
        hwh.writeTankTempSetting( 0x8C, function(err){
            if(err) return console.error("error writing set temp:", err);
            console.log("tank temp set");
        });

        //change the mode
        hwh.writeModeActual( GEOSPRING_MODE_HYBRID, function(err){
            if(err) return console.error("error writing mode:", err);
            console.log("tank mode set");
        });

        //read the modified set temp
        hwh.readTempSetting(function(err, data){
            if(err) return console.error("error reading temp data:", err);
            console.log("temp (set - NEW):", data);
        });

        setInterval(function(){
			hwh.readKwhData(function(err, data){
				if(err) return console.error("error reading kwh data:", err);
				
				console.log("kwh data:", data);
			});
		}, 5000);
    }); 
});
