'use strict';

var Puid = require('puid'),
	uuid = require('node-uuid'),
	async = require('async'),
	extend = require('node.extend');

var puid = new Puid();
var puidShort = new Puid(true);	

var DIRECTORY_SEPARATOR = '/';	

function keyToDirs(key, dirLength, dirCount) {
	if(!fileName) {
		throw new Error('fileName is undefined');
	}

	var minSize = dirLength*dirCount;
	if(fileName.length<minSize) {
		return null;
	}

	var chunks = fileName.match(new RegExp('.{1,' + dirLength + '}', 'g'));
	var dirs = chunks.slice(0, dirCount);	

	return dirs.join(DIRECTORY_SEPARATOR);
}	

var Storage = module.exports = function (options) {
	this.options = options = options || {};

	options.types = options.types || [];
	options.attachment = options.attachment || {};
	options.keyGenerator = options.keyGenerator || Storage.generateUniqueKey;

	if(typeof options.keySecured === 'undefined') {
		options.keySecured = true;
	}

	this.transformations = options.transformations || [];
};

Storage.prototype.getExts = function() {
	return this.options.exts || [];
};

Storage.prototype.save = function(attachment, callback) {
  throw new Error('You need to implement save method')
};

Storage.prototype.remove = function(metadata, callback) {
  throw new Error('You need to implement remove method')
};

Storage.prototype.transform = function(attachment, callback) {
	var tasks = [],
		metadata = {};

	this.transformations.forEach(function(transformation) {
		tasks.push(function(callback) {
			transformation.process(attachment, function(err, meta) {
				if(err) {
					return callback(err);
				}

				extend(metadata, meta);
			});
		});
	});

	async.series(tasks, function(err) {
		if(err) {
			return callback(err);
		}

		callback(null, metadata);
	});
};

Storage.prototype.prepareSchema = function(schema, path) {
	schema.path(path, {
		_id   : false
	});

	/*
	for(var i=0; i< this.transformations.length; i++) {
		var transformation = this.transformations[i];
		if(transformation.updateSchema) {
			transformation.updateSchema(schema); 
		}
	}*/
};

Storage.prototype.generateKey = function(attachment, callback) {
	if(attachment.key) {
		return callback(null, attachment.key);
	}

	if(this.options.keyGenerator) {
		return this.options.keyGenerator(attachment, callback);
	}

	this.generateUniqueKey(attachment, callback);
};

Storage.generateKey = function(secured, cb) {
	var key = secured
		? puid.generate() + '-' + uuid.v4()
		: puidShort.generate();

	//reverse key
	key = key.split('').reverse().join('');

	cb(null, key);
}

Storage.prototype.generateUniqueKey = function(attachment, cb) {
	var options = this.options;

	Storage.generateKey(options.keySecured, function(err, key) {
		if(err) {
			return cb(err);
		}

		if(options.keyPath && options.keyPath.length) {
			key = keyPath + DIRECTORY_SEPARATOR + key;
		} else if(options.dirLength && options.dirCount) {
			var dirs = keyToDirs(key, options.dirLength, options.dirCount);
			if(dirs && dirs.length) {
				key = dirs + DIRECTORY_SEPARATOR + key;
			}
		}

		cb(null, key);
	});
};

Storage.prototype.validate = function(attachment, callback) {
	var options = this.options;

	if(options.types && options.types.length) {
		if(!attachment.type) {
			return callback(new Error('Type of file is undefined'));
		}

		if(options.types.indexOf(attachment.type) === -1) {
			return callback(new Error('Current type is not allowed'));	
		}
	}

	if(options.maxSize && attachment.size>options.maxSize) {
		return callback(new Error('File size is bigger then maxSize'));		
	}

	if(options.minSize && attachment.size<options.minSize) {
		return callback(new Error('File size is grether then minSize'));		
	}

	callback();
};