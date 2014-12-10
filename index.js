'use strict';

var async = require('async'),
	extend = require('node.extend'),
	fs = require('fs'),
	mime = require('mime-types'),
	_ = require('lodash'),
	path = require('path'),
	Storage = require('./storages/storage'),
	S3 = require('./storages/s3'),
	File = require('./storages/file');

function isInt(value) {
	return /^[0-9]+$/.test(value);
}	

function docPathToSchemaPath(path) {
	var schemaPath = null;

	var parts = path.split('.');
	for(var i=0; i<parts.length; i++) {
		var part = parts[i];

		if(isInt(part)) {
			continue;
		}

		schemaPath = schemaPath 
			? schemaPath + '.' + part
			: part;
	}

	return schemaPath;
}

function canAttach(docPath) {
	var path = docPathToSchemaPath(docPath);
	var	fieldOptions = this.getFieldOptions(path);

	return !!fieldOptions;
}

function attach(docPath, attachment, save, callback) {
	var path = docPathToSchemaPath(docPath);
	var	fieldOptions = this.getFieldOptions(path);

	var storage = fieldOptions.storage;
	var isArray = fieldOptions.isArray;
	var doc = this;

	if(typeof save === 'function') {
		callback = save;
		save = false;
	}

	attachment = attachment || {};
	attachment.doc = this;

	var metadata = {};

    async.waterfall([
		//check existance of file
		function(callback) {
			 fs.exists(attachment.path, function(exists) {
			 	if(!exists) {
			 		return callback(new Error('File does not exists'));
			 	}

        		callback();
      		})
		}, 
		//generate key
		function(callback) {
			storage.generateKey(attachment, function(err, key) {
				if(err) {
    				return callback(err);
    			}

    			attachment.key = key;
    			callback();
			});
		}, 		
		//compute type and validate
		function(callback) {
			if(!attachment.type) {
				var path = attachment.originalFilename || attachment.path;
				attachment.type = mime.lookup(path) || null;
			}
		
			callback();
		}, 
		//compute size
		function(callback) {
			if(typeof attachment.size !== 'undefined') {
				return callback();
			}

			fs.stat(attachment.path, function(err, stats) {
				if(err) {
					return callback(err);
				}

				attachment.size = stats.size;
				callback();
	        });
		}, 
		//validate 
		function(callback) {
			storage.validate(attachment, callback);
		}, 
		//use all transformations
    	function(callback) {
    		storage.transform(attachment, function(err, tranformationsMetadata) {
    			if(err) {
    				return callback(err);
    			}

    			metadata = extend(metadata, tranformationsMetadata);
    			callback();
    		});
    	}, 
    	//save to storage
    	function(callback) {
    		storage.save(attachment, function(err, saveMetadata) {
    			if(err) {
    				return callback(err);
    			}

    			metadata = extend(metadata, saveMetadata);
    			callback();
    		});
    	},
    	//we will remove current item if exists
    	function(callback) {
    		var current = doc.get(docPath);
    		//TODO: replace with detach
    		if(!isArray && current) {
    			return storage.remove(current, function(err) {
    				callback(err);
    			});
    		}

    		callback();
    	},
    	//set a mongo field
    	function(callback) {
    		if(isArray) {
        		var current = doc.get(docPath) || [];

        		current.push(metadata);
        		doc.set(docPath, current);
        	} else {
        		doc.set(docPath, metadata);
        	}

        	callback();
    	},
    	function(callback) {
    		console.log(metadata);

    		if(!save) {
    			return callback(null, doc, metadata);
    		}

    		doc.save(function(err, doc) {
    			if(err) {
    				return callback(err);	
    			}

    			callback(null, doc, metadata); 
    		});
    	}
    ], callback);
}

function detach(docPath, callback) {
	var path = docPathToSchemaPath(docPath);
	var	fieldOptions = this.getFieldOptions(path);

	var storage = fieldOptions.storage;
	
	var doc = this;

	var current = doc.get(docPath);
	if(!current) {
		return callback(null, true);	
	}

	storage.remove(current, function(err) {
		if(err) {
			return callback(err);
		}

		if(!fieldOptions.isArray) {
			doc.set(docPath, void 0);
			return callback(null, doc);
		}

		//remove item from array
		var parts = docPath.split('.');
		var position = parseInt(parts.pop(), 10);

		var arrayDocPath = parts.join('.');
		var currentArray = doc.get(arrayDocPath);

		currentArray.splice(position, 1);
		doc.set(arrayDocPath, currentArray);

		callback(null, doc);
	});
}

function detachAll(callback, obj, parentPath) {
	var tasks = [];
	var _this = this;

	var obj = obj || this.toJSON();

	Object.keys(obj).forEach(function(key) {
		var currentPath = parentPath 
			? parentPath + '.' + key
			: key;

		var value = obj[key];
		var isObject = _.isObject(value);
		var isArray = _.isArray(value);

		if(!isObject && !isArray) {
			return;
		}

		var canAttach = _this.canAttach(currentPath);
		if(canAttach) {
			tasks.push(function(callback) {
				_this.detach(currentPath, callback);
			});
			return;	
		}


		if(isObject) {
			tasks.push(function(callback) {
				_this.detachAll(callback, value, currentPath);
			});
			return;
		} 
/*
		if(isArray) {
			tasks.push(function(callback) {
				_this.detachAll(callback, value, currentPath);
			});
		}*/	
	});
}

var storagePlugin = module.exports = function (schema, options, fields, parentPath) {
	options = options || {};

	var fields = fields || {};

	schema.eachPath(function(path, config) {
		var currentPath = parentPath ? parentPath + '.' + path : path;

		if(config.schema) {
			storagePlugin(config.schema, options, fields, currentPath);
			return;
		}

		if (!config.options.storage) {
			return;
		}

		var storage = config.options.storage;
		delete config.options.storage;

		var field = fields[currentPath] = {
			isArray: Array.isArray(config.options.type),
			path: currentPath,
			storage: storage
		};

		storage.prepareSchema(schema, path);
	});

	schema.pre('remove', function(next) {
		if(options.detachAllOnRemove) {
			return this.detachAll(next);
		} 

		next();
	});

	schema.methods.getStorage = function(path) {
		if(!path || !fields[path]) {
			return null;
		}

		return fields[path].storage;
	};

	schema.methods.getFieldOptions = function(path) {
		if(!path || !fields[path]) {
			return null;
		}

		return fields[path];
	};

	schema.methods.attach = attach;
	schema.methods.detach = detach;
	schema.methods.detachAll = detachAll;
	schema.methods.canAttach = canAttach;
	return schema;
};

storagePlugin.docPathToSchemaPath = docPathToSchemaPath;
storagePlugin.Storage = {
	Storage: Storage,
	S3: S3,
	File: File
};