'use strict';

var	util = require("util"),
	Storage = require("./storage"),
	fs = require('fs'),
	fse = require('fs-extra');

var File = module.exports = function (options) {
	Storage.call(this, options);

	if(!options.path) {
		throw new Error('There is not path for file storage');
	}
};

util.inherits(File, Storage);

File.prototype.save = function(attachment, callback) {
	var _this = this,
		options = this.options;

	var newPath = options.path + '/' + attachment.key;
	var metadata = {
		size: attachment.size,
		key: attachment.key,
		type: attachment.type
	};

	if(options.copy) {
		fse.copy(attachment.path, newPath, function (err) {
			if(err) {
				return callback(err);
			}

			callback(null, metadata);
		});

		return;
	}

	fse.move(attachment.path, newPath, { mkdirp: true }, function (err) {
		if(err) {
			return callback(err);
		}

		callback(null, metadata);
	});
};

File.prototype.remove = function(metadata, callback) {
	var options = this.options;

	if(!metadata.key) {
		return callback(new Error('Key is undefined'));
	}

	var path = options.path + '/' + metadata.key;
	fs.unlink(path, function (err) {
  		if (err) {
  			return callback(err);
  		}

  		callback(null, true);
	});
};

File.prototype.prepareSchema = function(schema, path) {
	var storage = this; 

	schema.path(path, {
		_id  : false,
		key  : { type: String, required: true },
		size : { type: Number, required: true },
		type : { type: String, required: true }
	});
};