var should = require('should'),
	mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	storagePlugin = require('../index'),
	FileStorage = require('../storages/file'),
	S3Storage = require('../storages/s3');

describe('docPathToSchemaPath', function() {
	var docPathToSchemaPath = storagePlugin.docPathToSchemaPath;
	it('should be able to convert', function() {
		docPathToSchemaPath('image').should.equal('image');
		docPathToSchemaPath('image.0').should.equal('image');
		docPathToSchemaPath('part.0.file').should.equal('part.file');
		docPathToSchemaPath('part.0.file.2').should.equal('part.file');
		docPathToSchemaPath('part.0.file.2.text').should.equal('part.file.text');
		docPathToSchemaPath('part.0asd.file.2bs.text').should.equal('part.0asd.file.2bs.text');
	});
});	

describe('Model', function() {
	var Model = null;
	var docInstance = null;
	var password = require('./password');

	it('should be able to connect', function(done) {
		mongoose.connect('mongodb://localhost/mongoose-storage-test');
		done();
	});

	it('should be able to create model', function(done) {
		var storage = new FileStorage({
			copy: true,
			securedFileName: true,
			path: __dirname + '/stored'
		});

		var storageS3 = new S3Storage({
			securedFileName: true,
			bucket: password.s3.bucket,
			key: password.s3.key,
			secret: password.s3.secret
		});

		var schema = new Schema({
			name      : { type: String },  
			preview   : { type: {}, storage: storage },
			previewS3 : { type: {}, storage: storageS3 },
			images  : { type: [{}], storage: storage },
			sub     : {
				file: { type: {}, storage: storage }
			},
			parts   : [{
				file: { type: {}, storage: storage }
			}]
		});

		schema.plugin(storagePlugin, {});

		Model = mongoose.model('Storage', schema);

		done();
	});

	it('should be able to create document', function(done) {
		Model.create({
			name: 'test',
			parts: [{}, {}]
		}, function(err, doc) {
			if(err) {
				return done(err);
			}

			docInstance = doc;
			done();
		});
	});	

	it('should be able to assign file', function(done) {
		docInstance.attach('preview', {
			path: __dirname + '/preview.jpg'
		}, function(err, doc, metadata) {
			if(err) {
				return done(err);
			}

			var preview = doc.get('preview');

			preview.should.have.properties('key', 'type', 'size');
			preview.type.should.equal('image/jpeg');
			preview.size.should.equal(217518);

			done();
		});	
	});

	it('should be able to remove file', function(done) {
		docInstance.detach('preview', function(err, doc) {
			if(err) {
				return done(err);
			}

			var preview = doc.get('preview');
			should(preview).equal(void 0);

			done();
		});	
	});

	it('should be able to assign file into empty array', function(done) {
		docInstance.attach('images', {
			path: __dirname + '/preview.jpg'
		}, function(err, doc, metadata) {
			if(err) {
				return done(err);
			}

			var images = doc.get('images');
			images.should.have.length(1);

			var image = images[0];

			image.should.have.properties('key', 'type', 'size');
			image.type.should.equal('image/jpeg');
			image.size.should.equal(217518);

			done();
		});
	});

	it('should be able to assign file into filled array', function(done) {
		docInstance.attach('images', {
			path: __dirname + '/preview.jpg'
		}, function(err, doc, metadata) {
			if(err) {
				return done(err);
			}

			var images = doc.get('images');
			images.should.have.length(2);

			var image = images[1];

			image.should.have.properties('key', 'type', 'size');
			image.type.should.equal('image/jpeg');
			image.size.should.equal(217518);

			done();
		});
	
	});	

	it('should be able to remove file from array', function(done) {
		docInstance.detach('images.0', function(err, doc) {
			if(err) {
				return done(err);
			}

			var images = doc.get('images');
			images.should.have.length(1);

			done();
		});	
	});	

	it('should be able to remove file from array', function(done) {
		docInstance.detach('images.0', function(err, doc) {
			if(err) {
				return done(err);
			}

			var images = doc.get('images');
			images.should.have.length(0);

			done();
		});	
	});		

	it('should be able to assign file to sub field', function(done) {
		docInstance.attach('sub.file', {
			path: __dirname + '/preview.jpg'
		}, function(err, doc, metadata) {
			if(err) {
				return done(err);
			}

			var preview = doc.get('sub.file');

			preview.should.have.properties('key', 'type', 'size');
			preview.type.should.equal('image/jpeg');
			preview.size.should.equal(217518);

			done();
		});
	
	});	

	it('should be able to remove file from subdocument', function(done) {
		docInstance.detach('sub.file', function(err, doc) {
			if(err) {
				return done(err);
			}

			var preview = doc.get('sub.file');
			should(preview).equal(void 0);

			done();
		});	
	});

	it('should be able to assign file into empty array of subdocuments', function(done) {
		docInstance.attach('parts.0.file', {
			path: __dirname + '/preview.jpg'
		}, function(err, doc, metadata) {
			if(err) {
				return done(err);
			}

			var parts = doc.get('parts');
			parts.should.have.length(2);

			var image = parts[0].file;

			image.should.have.properties('key', 'type', 'size');
			image.type.should.equal('image/jpeg');
			image.size.should.equal(217518);

			done();
		});	
	});

	it('should be able to remove file from array of subdocuments', function(done) {
		docInstance.detach('parts.0.file', function(err, doc) {
			if(err) {
				return done(err);
			}

			var preview = doc.get('parts.0.file');
			should(preview).equal(void 0);

			done();
		});	
	});

	it('should be able to assign file to S3', function(done) {
		docInstance.attach('previewS3', {
			path: __dirname + '/preview.jpg'
		}, function(err, doc, metadata) {
			if(err) {
				return done(err);
			}

			var preview = doc.get('previewS3');
			var url = doc.get('previewS3.url');

			preview.should.have.properties('key', 'type', 'size');
			preview.type.should.equal('image/jpeg');
			preview.size.should.equal(217518);

			done();
		});	
	});

	it('should be able to remove file from S3', function(done) {
		docInstance.detach('previewS3', function(err, doc) {
			if(err) {
				return done(err);
			}

			var preview = doc.get('previewS3');
			should(preview).equal(void 0);

			done();
		});	
	});

	after(function(done) {
		done();
	});
});