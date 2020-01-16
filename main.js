'use strict';

var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var mv = require('mv');
var childProcess = require('child_process');
var path = require('path');
var bhttp = require('bhttp');
var cheerio = require('cheerio');
var colors = require('colors');
var mkdirp = require('mkdirp');
var moment = require('moment');
var S = require('string');
var yaml = require('js-yaml');

var session = bhttp.session();

var modelsCurrentlyCapturing = [];

var config = yaml.safeLoad(fs.readFileSync('config.yml', 'utf8'));

config.minFileSizeMb = config.minFileSizeMb || 0;
config.dateFormat = config.dateFormat || 'YYYYMMDD-HHmmss';
config.createModelDirectory = !!config.createModelDirectory;

var captureDirectory = path.resolve(config.captureDirectory || './captures');
var completeDirectory = path.resolve(config.completeDirectory || './complete');

function mkdir(dir) {
  mkdirp(dir, err => {
    if (err) {
      printErrorMsg(err);
      process.exit(1);
    }
  });
}

function getCurrentDateTime() {
  return moment().format('MM/DD/YYYY - HH:mm:ss');
}

function printMsg(msg) {
  console.log(colors.gray(`[${getCurrentDateTime()}]`), msg);
}

function printErrorMsg(msg) {
  console.log(colors.gray(`[${getCurrentDateTime()}]`), colors.red('[ERROR]'), msg);
}

function printDebugMsg(msg) {
  if (config.debug && msg) {
    console.log(colors.gray(`[${getCurrentDateTime()}]`), colors.yellow('[DEBUG]'), msg);
  }
}

function dumpModelsCurrentlyCapturing() {
  modelsCurrentlyCapturing.forEach(m => {
    printDebugMsg(colors.red(m.pid) + '\t' + m.checkAfter + '\t' + m.filename);
  });
}

function login() {
  return Promise
    .try(() => session.get('https://chaturbate.com/auth/login/'))
    .then(response => {
      let $ = cheerio.load(response.body);

      let csrfToken = $('#main form[action="/auth/login/"] input[name="csrfmiddlewaretoken"]').val();

      return session.post('https://chaturbate.com/auth/login/', {
        username: config.username,
        password: config.password,
        csrfmiddlewaretoken: csrfToken,
        next: '/'
      }, {
        headers: {
          referer: 'https://chaturbate.com/auth/login/'
        }
      });
    });
}

function getFollowedCams() {
  return Promise
    .try(() => session.get('https://chaturbate.com/followed-cams/'))
    .then(response => cheerio.load(response.body));
}

function getLiveModels() {
  return getFollowedCams()
    .then($ => {
      // it the user is already logged in then we resolve immediately
      if ($('#user_information a.username').text() === config.username) {
        return $;
      }

      printDebugMsg('Login is required');

      // for simplicity of the code we make only one login attempt per cycle
      return login().then(() => getFollowedCams());
    })
    .then($ => {
      let liveModels = $('#main div.content ul.list')
        .children('li')
        .filter(function () {
          return $(this).find('div.details ul.sub-info li.cams').text() !== 'offline';
        })
        .map(function () {
          return $(this).find('div.title a').text().trim();
        })
        .get();

      printDebugMsg('Found these live followed models: ' + liveModels.join(', '));

      return liveModels;
    })
    .timeout(15000, 'Failed to get live models');
}

function getCommandArguments(modelName) {
  return Promise
    .try(() => session.get(`https://chaturbate.com/${modelName}/`))
    .then(response => {
      let $ = cheerio.load(response.body);

      let script = $('script')
        .map(function () {
          return $(this).text();
        })
        .get()
        .join('');

      let streamData = script.match(/EmbedViewerSwf\(([\s\S]+?)\);/); // "EmbedViewerSWF" is ChaturBate's shitty name for the stream data, all their code has really cryptic names for everything

      if (!streamData) {
        throw new Error('streamData is unavailable');
      }

      let streamServer = streamData[1]
        .split(',')
        .map(line => S(line.trim()).strip('\'', '"'))[2];

      if (!streamServer) {
        throw new Error('streamServer is unavailable');
      }

      let passwordHash = script.match(/password: '([^']+)'/)[1].replace('\\u003D', '='); // As of 2015-05-15, this is a PBKDF2-SHA256 hash of the user's password, with the iteration count and salt generously provided. I could replace the empty line below with a line to make bhttp send this hash to my own server, where I'd be able to crack it at my leisure, but as you can see, that line is empty, you're welcome. :)

      if (!passwordHash) {
        throw new Error('passwordHash is unavailable');
      }

      return { streamServer, passwordHash };
    })
    .timeout(15000);
}

function createCaptureProcess(modelName) {
  let model = modelsCurrentlyCapturing.find(m => m.modelName === modelName);

  if (!!model) {
    printDebugMsg(colors.green(modelName) + ' is already capturing');
    return; // resolve immediately
  }

  printMsg(colors.green(modelName) + ' is now online, starting rtmpdump process');

  return Promise
    .try(() => getCommandArguments(modelName))
    .then(commandArguments => {
      let filename = modelName + '-' + moment().format(config.dateFormat) + '.flv';

      let spawnArguments = [
        '--live',
        config.rtmpDebug ? '' : '--quiet',
        '--rtmp', 'rtmp://' + commandArguments.streamServer + '/live-edge',
        '--pageUrl', 'http://chaturbate.com/' + modelName,
        '--conn', 'S:' + config.username.toLowerCase(),
        '--conn', 'S:' + modelName,
        '--conn', 'S:2.645', // Apparently this is the flash version, fucked if I know why this is needed, this seems to be extracted from a file listed two lines above where the streamServer is grabbed, with "p" in the filename changed to ".", and the path and extension removed
        '--conn', 'S:' + commandArguments.passwordHash, // "Hey guys, know what'd be a great idea? Authenticating connections by passing the password hash to the client and back!"
        '--token', 'm9z#$dO0qe34Rxe@sMYxx', // 0x5f3759df
        '--playpath', 'playpath',
        '--flv',
        path.join(captureDirectory, filename)
      ];

      let captureProcess = childProcess.spawn('rtmpdump', spawnArguments);

      captureProcess.stdout.on('data', data => {
        printMsg(data.toString());
      });

      captureProcess.stderr.on('data', data => {
        printMsg(data.toString());
      });

      captureProcess.on('close', code => {
        printMsg(colors.green(modelName) + ' stopped streaming');

        let stoppedModel = modelsCurrentlyCapturing.find(m => m.pid === captureProcess.pid);

        if (!!stoppedModel) {
          let modelIndex = modelsCurrentlyCapturing.indexOf(stoppedModel);

          if (modelIndex !== -1) {
            modelsCurrentlyCapturing.splice(modelIndex, 1);
          }
        }

        let srcFile = path.join(captureDirectory, filename);
        let dstFile = config.createModelDirectory
          ? path.join(completeDirectory, modelName, filename)
          : path.join(completeDirectory, filename);

        fs.statAsync(srcFile)
          .then(stats => {
            if (stats.size <= (config.minFileSizeMb * 1048576)) {
              fs.unlinkAsync(srcFile);
            } else {
              mv(srcFile, dstFile, { mkdirp: true }, err => {
                if (err) {
                  printErrorMsg('[' + colors.green(modelName) + '] ' + err.toString());
                }
              });
            }
          })
          .catch(err => {
            if (err.code !== 'ENOENT') {
              printErrorMsg('[' + colors.green(modelName) + '] ' + err.toString());
            }
          });
      });

      if (!!captureProcess.pid) {
        modelsCurrentlyCapturing.push({
          modelName,
          filename,
          captureProcess,
          pid: captureProcess.pid,
          checkAfter: moment().unix() + 60, // we are gonna check the process after 60 seconds
          size: 0
        });
      }
    })
    .catch(err => {
      printErrorMsg('[' + colors.green(modelName) + '] ' + err.toString());
    });
}

function checkCaptureProcess(model) {
  if (model.checkAfter > moment().unix()) {
    // if this is not the time to check the process then we resolve immediately
    return;
  }

  return fs
    .statAsync(path.join(captureDirectory, model.filename))
    .then(stats => {
      // first time we check after 60 seconds then we check it every 10 minutes,
      // if the size of the file has not changed over this time, we kill the process
      if (stats.size - model.size > 0) {
        printDebugMsg(colors.green(model.modelName) + ' is alive');

        model.checkAfter = moment().unix() + 600; // 10 minutes
        model.size = stats.size;
      } else if (!!model.captureProcess) {
        // we assume that onClose will do all clean up for us
        printErrorMsg('[' + colors.green(model.modelName) + '] Process is dead');
        model.captureProcess.kill();
      } else {
        // suppose here we should forcefully remove the model from modelsCurrentlyCapturing
        // because her captureProcess is unset, but let's leave this as is
      }
    })
    .catch(err => {
      if (err.code !== 'ENOENT') {
        printErrorMsg('[' + colors.green(model.modelName) + '] ' + err.toString());
      }
    });
}

function mainLoop() {
  printDebugMsg('Start searching for new models');

  Promise
    .all(modelsCurrentlyCapturing.map(checkCaptureProcess))
    .then(() => getLiveModels())
    .then(liveModels => Promise.all(liveModels.map(createCaptureProcess)))
    .catch(err => printErrorMsg(err))
    .finally(() => {
      dumpModelsCurrentlyCapturing();

      printMsg(`Done, will search for new models in ${config.modelScanInterval} second(s)`);

      setTimeout(mainLoop, config.modelScanInterval * 1000);
    });
}

mkdir(captureDirectory);
mkdir(completeDirectory);

login().then(() => mainLoop());
