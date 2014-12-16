'use strict';

var	util = require("util"),
	Storage = require("./storage"),
	knox = require('knox'),
	crypto = require("crypto");

var S3 = module.exports = function (options) {
	options = options || {};
	options.directExpiration = options.directExpiration || 60*60*1000;
	options.acl = options.acl || 'public-read';
	options.region = options.region || 'us-standard';
	options.types = options.types || [];
	options.successActionStatus = options.successActionStatus || '201';

	Storage.call(this, options);

	if(!options.key || !options.secret || !options.bucket) {
		throw new Error('Key, secret or bucket is undefined');
	}

	this._client = knox.createClient({
	    key: options.key,
	    secret: options.secret,
	    bucket: options.bucket,
	    region: options.region
	});
};

util.inherits(S3, Storage);

S3.prototype.save = function(attachment, callback) {
	var options = this.options;

	var metadata = {
		size: attachment.size,
		key: attachment.key,
		type: attachment.type
	};

	this._client.putFile(attachment.path, attachment.key, {
		'x-amz-acl': attachment.acl || options.acl
	}, function(err, message) {
		if(err) {
			return callback(err);
		}

		callback(null, metadata);
	});
};

S3.prototype.remove = function(metadata, callback) {
	var options = this.options;

	if(!metadata.key) {
		return callback(new Error('Key is undefined'));
	}

	this._client.deleteFile(metadata.key, function(err, message) {
		if(err) {
			return callback(err);
		}

		callback(null, true);
	});
};

S3.prototype.prepareSchema = function(schema, path) {
	var storage = this; 

	schema.path(path, {
		_id  : false,
		key  : { type: String, required: true },
		size : { type: Number, required: true },
		type : { type: String, required: true }
	});

	schema.virtual(path + '.url').get(function() {
		var key = this.get(path + '.key'); 
		return 'https://s3.amazonaws.com/' + storage.options.bucket + '/' + key;
	});
};

S3.prototype.validateDirectUploadPolicy = function(data, callback) {
	var options = this.options;

	if(!data || !data.policy || !data.signature ) {
		return callback(new Error('Data are inconsistent'));
	}

	var signature = crypto
	  	.createHmac("sha1", options.secret)
	    .update(data.policy)
	    .digest("base64");

	if(signature !== data.signature) {
		return callback(new Error('Signature is not same'));
	}

	try {
		var policyJSON = (new Buffer(data.policy, 'base64')).toString('utf8');
		var policy = JSON.parse(policyJSON);
	} catch(e) {
		return callback(e);
	}

	callback(null, policy);
};

S3.prototype.validateDirectUploadPolicyKey = function(data, callback) {
	this.validateDirectUploadPolicy(data, function(err, policy) {
		if(err) {
			return callback(err);
		}

		if(!policy || !policy.conditions) {
			return callback(new Error('Conditions is undefined'));
		}

		var conditions = policy.conditions;
		for(var i=0; i<conditions.length; i++) {
			var condition = conditions[i];
			if(!condition || !condition.key) {
				continue;
			}

			return callback(null, condition.key);
		}

		callback(new Error('Key is not defined'));
	});
};

S3.prototype.getHeader = function(key, callback) {
	this._client.headFile(key, function(err, res) {
		if(err) {
			return callback(err);
		}

		if(res.statusCode< 200 || res.statusCode >299) {
			return callback(new Error('Status code is ' + res.statusCode));
		}

		if(!res.headers) {
			return callback(new Error('Headers are undefined'));
		}

		callback(null, res.headers);
	});
};

S3.prototype.saveByDirectUpload = function(data, callback) {
	var _this = this;

	this.validateDirectUploadPolicyKey(data, function(err, key) {
        if(err) {
            return callback(err);
        }

        _this.getHeader(key, function(err, headers) {
        	if(err) {
            	return callback(err);
        	}

            if(!headers['content-type'] || !headers['content-length']) {
                return callback(new Error('Content type or length is not defined in S3 header'));
            }

            var metadata = {
            	key: key,
            	size: headers['content-length'],
            	type: headers['content-type']
            };

            callback(null, metadata);
        });
    });
};

S3.prototype.getDirectUpload = function(attachment, callback) {
	var options = this.options;

	this.generateKey(attachment, function(err, key) {
		if(err) {
			return callback(err);
		}

		var conditions = [
			{"bucket": options.bucket},
			{"acl": options.acl},
			{"success_action_status": options.successActionStatus},
			{"key": key}
	    ];

	    if(options.contentTypeStartsWith) {
	    	conditions.push([
	    		'starts-with', '$Content-Type', options.contentTypeStartsWith
	    	]);
	    }

	    if(options.minSize || options.maxSize) {
	    	conditions.push([
	    		"content-length-range", options.minSize || 0, options.maxSize || 5*1024*1024
	    	]);
	    }

		var s3Policy = {
			"expiration": new Date(Date.now() + options.directExpiration), 
			"conditions": conditions
	  	};

		// stringify and encode the policy
		var s3PolicyBase64 = new Buffer(JSON.stringify(s3Policy), 'utf-8').toString("base64");

		// sign the base64 encoded policy
	  	var signature = crypto
	  		.createHmac("sha1", options.secret)
	    	.update(s3PolicyBase64)
	    	.digest("base64");

		var url = 'https://s3.amazonaws.com/' + options.bucket;
	    var data = {
	    	key            : key,
	    	acl            : options.acl,
	    	url            : url,
	    	AWSAccessKeyId : options.key,
			policy         : s3PolicyBase64,
	    	signature      : signature,
	    	successActionStatus: options.successActionStatus,

	    	maxSize        : options.maxSize,
	    	minSize        : options.minSize,
	    	types          : options.types,

	    	minWidth       : options.minWidth,
	    	minHeight      : options.minHeight

		};

		callback(null, data);
	});
};