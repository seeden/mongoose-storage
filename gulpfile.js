var gulp = require('gulp');
var mocha = require('gulp-mocha');


gulp.task('test', function () {
    return gulp.src('./tests/**/*.js', {
    	read: false
    })
    .pipe(mocha({
    	timeout: 20000
    }));
});

gulp.doneCallback = function (err) {
  process.exit(err ? 1 : 0);
};