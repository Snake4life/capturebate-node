'use strict';
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var S = require('string');
var yaml = require('js-yaml');
var colors = require('colors');
var childProcess = require('child_process');
var mkdirp = require('mkdirp');
var path = require('path');
var moment = require('moment');
var _ = require('underscore');

function getCurrentDateTime() {
  return moment().format('YYYY-MM-DDTHHmmss'); // The only true way of writing out dates and times, ISO 8601
};

function printMsg(msg) {
  console.log(colors.blue('[' + getCurrentDateTime() + ']'), msg);
}

function printErrorMsg(msg) {
  console.log(colors.blue('[' + getCurrentDateTime() + ']'), colors.red('[ERROR]'), msg);
}

function getTimestamp() {
  return Math.floor(new Date().getTime() / 1000);
}

var startTs;
var config = yaml.safeLoad(fs.readFileSync('convert.yml', 'utf8'));

config.srcDirectory = path.resolve(config.srcDirectory);
config.dstDirectory = path.resolve(config.dstDirectory);

mkdirp.sync(config.srcDirectory);
mkdirp.sync(config.dstDirectory);

function getFiles() {
  return fs
    .readdirAsync(config.srcDirectory)
    .then(function(files) {
      return _.filter(files, function(file) {
        return S(file).endsWith('.ts') || S(file).endsWith('.flv');
      });
    });
}

function convertFile(srcFile) {
  var dstFile;
  var srcFile;
  var spawnArguments;

  if (S(srcFile).endsWith('.ts')) {
    dstFile = S(srcFile).chompRight('ts').s + 'mp4';

    spawnArguments = [
      '-i',
      config.srcDirectory + '/' + srcFile,
      '-y',
      '-hide_banner',
      '-loglevel',
      'panic',
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-bsf:a',
      'aac_adtstoasc',
      '-copyts',
      config.srcDirectory + '/' + dstFile
    ];
  }

  if (S(srcFile).endsWith('.flv')) {
    dstFile = S(srcFile).chompRight('flv').s + 'mp4';

    spawnArguments = [
      '-i',
      config.srcDirectory + '/' + srcFile,
      '-y',
      '-hide_banner',
      '-loglevel',
      'panic',
      '-movflags',
      '+faststart',
      '-c:v',
      'copy',
      '-strict',
      '-2',
      '-q:a',
      '100',
      config.srcDirectory + '/' + dstFile
    ];
  }

  if (!dstFile) {
    printErrorMsg('Failed to convert ' + srcFile);

    return ;
  }

  printMsg('Converting ' + srcFile + ' into ' + dstFile);

  var convertProcess = childProcess.spawnSync('ffmpeg', spawnArguments);

  if (convertProcess.status != 0) {
    printErrorMsg('Failed to convert ' + srcFile);

    if (convertProcess.error) {
      printErrorMsg(convertProcess.error.toString());
    }

    return;
  }

  if (config.deleteAfter) {
    fs.unlink(config.srcDirectory + '/' + srcFile, function(err) {
      // do nothing, shit happens
    });
  } else {
    fs.rename(config.srcDirectory + '/' + srcFile, config.dstDirectory + '/' + srcFile, function(err) {
      if (err) {
        printErrorMsg(err.toString());
      }
    });
  }

  fs.rename(config.srcDirectory + '/' + dstFile, config.dstDirectory + '/' + dstFile, function(err) {
    if (err) {
      printErrorMsg(err.toString());
    }
  });
}

function mainLoop() {
  startTs = getTimestamp();

  Promise
    .try(function() {
      return getFiles();
    })
    .then(function(files) {
      if (files.length > 0) {
        printMsg(files.length + ' file(s) to convert');
        _.each(files, convertFile);
      } else {
        printMsg('No files found');
      }
    })
    .catch(function(err) {
      printErrorMsg(err);
    })
    .finally(function() {
      var seconds = startTs - getTimestamp() + config.dirScanInterval;

      if (seconds < 5) {
        seconds = 5;
      }

      printMsg('Done, will scan the folder in ' + seconds + ' second(s).');

      setTimeout(mainLoop, seconds * 1000);
    });
}

mainLoop();
