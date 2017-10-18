'use strict';

const gulp = require('gulp');
const zip = require('gulp-zip');
const forceDeploy = require('gulp-jsforce-deploy');

gulp.task(
	'build',
	[],
	() => {
		return gulp.src('./src/**')
			.pipe(zip('mle_v2_cfg.resource'))
			.pipe(gulp.dest('dist/pkg/staticresources'));
	}
);

gulp.task(
	'deploy',
	['build'],
	() => {
		return gulp.src('./dist/pkg/**', { base: './dist'})
			.pipe(zip('pkg.zip'))
			.pipe(forceDeploy({
				username: process.env.DEPLOY_USERNAME,
				password: process.env.DEPLOY_PASSWORD,
				loginUrl: process.env.DEPLOY_LOGIN_URL || 'https://test.salesforce.com'
			}));
	}
);

gulp.task('default', ['deploy']);