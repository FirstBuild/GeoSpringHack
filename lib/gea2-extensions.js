/*
 * Copyright (c) 2013 - General Electric - Confidential - All Rights Reserved
 * 
 * Author: Christopher Baker <christopher.baker2@ge.com>
 *  
 */

var fs = require("fs");

exports.find = function(directory, file_prefix, callback) {
    fs.readdir(directory, function(error, files) {
        for (var i = 0; i < files.length; i++) {
            if (files[i].substr(0, file_prefix.length) == file_prefix) {
                callback(require(directory + files[i]));
            }
        }
    });
};
