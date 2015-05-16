// SN4T14 2015-05-13
// License: WTFPL
'use strict';
var Promise = require('bluebird');
var yaml = require('js-yaml');
var fs = require('fs');
var bhttp = require('bhttp');
var cheerio = require('cheerio');
var moment = require('moment');
var childProcess = require('child_process');
var mkdirp = require('mkdirp');
var S = require('string');
var errors = require('errors');

var config = yaml.safeLoad(fs.readFileSync('config.yml', 'utf8'));
config.captureDirectory = S(config.captureDirectory).stripRight('/').s; // Because people will inevitably be idiots and sometimes use a trailing slash and sometimes not

var session = bhttp.session();
var modelsCurrentlyCapturing = [];

errors.create({
	name: "ModelOfflineError",
	explanation: "Model appears offline, it's normal for this to happen occasionally, if this happens to models that you know are online, you should file an issue on GitHub."
});

mkdirp(config.captureDirectory, function(err) {
	if (err) {
		console.log(err);
	}
});

var getCurrentDateTime = function() {
	return moment().format("YYYY-MM-DDTHH:mm:ss"); // The only true way of writing out dates and times, ISO 8601
};

var getCommandArguments = function (modelName) {
	return Promise.try(function() {
		return session.get("https://chaturbate.com/" + modelName + "/");
	}).then(function (response) {
		var commandArguments = {
			modelName: modelName,
			username: config.username.toLowerCase(), // Username has to be in lowercase for authentication to work
			captureDirectory: config.captureDirectory,
			dateString: getCurrentDateTime()
		};

		var $ = cheerio.load(response.body);

		var scripts = $("script")
		.map(function(){
			return $(this).text();
		}).get().join("");

		var streamData = scripts.match(/EmbedViewerSwf\(([\s\S]+?)\);/); // "EmbedViewerSWF" is ChaturBate's shitty name for the stream data, all their code has really cryptic names for everything

		if (streamData != null) {
			commandArguments.streamServer = streamData
			[1]
			.split(",")
			.map(function (line) {
				return S(line.trim()).strip("'", '"').s;
			})
			[2];
		} else {
			throw new errors.ModelOfflineError();
		}

		commandArguments.passwordHash = scripts.match(/password: '([^']+)'/)[1].replace("\\u003D", "="); // As of 2015-05-15, this is a PBKDF2-SHA256 hash of the user's password, with the iteration count and salt generously provided. I could replace the empty line below with a line to make bhttp send this hash to my own server, where I'd be able to crack it at my leisure, but as you can see, that line is empty, you're welcome. :)

		return commandArguments;
	});
};

var capture = function (modelName) {
	Promise.try(function() {
		return getCommandArguments(modelName);
	}).then(function (commandArguments) {
		var spawnArguments = [
			"--live",
			"--quiet",
			"--rtmp",
			"rtmp://" + commandArguments.streamServer + "/live-edge",
			"--pageUrl",
			"http://chaturbate.com/" + commandArguments.modelName,
			"--conn",
			"S:" + commandArguments.username,
			"--conn",
			"S:" + commandArguments.modelName,
			"--conn",
			"S:2.645", // Apparently this is the flash version, fucked if I know why this is needed, this seems to be extracted from a file listed two lines above where the streamServer is grabbed, with "p" in the filename changed to ".", and the path and extension removed
			"--conn",
			"S:" + commandArguments.passwordHash, // "Hey guys, know what'd be a great idea? Authenticating connections by passing the password hash to the client and back!"
			"--token",
			"m9z#$dO0qe34Rxe@sMYxx", // 0x5f3759df
			"--playpath",
			"playpath",
			"--flv",
			"./" + commandArguments.captureDirectory + "/Chaturbate_" + commandArguments.dateString + "_" + commandArguments.modelName + ".flv"
		];

		var captureProcess = childProcess.spawn("rtmpdump", spawnArguments);

		captureProcess.on("close", function (code) {
			console.log("[" + getCurrentDateTime() + "]", commandArguments.modelName, "stopped streaming.");

			var modelIndex = modelsCurrentlyCapturing.indexOf(modelName);
			if(modelIndex !== -1) {
				modelsCurrentlyCapturing.splice(modelIndex, 1);
			}
		});

		captureProcess.stdout.on("data", function (data) {
			console.log("[" + getCurrentDateTime() + "]", data.toString());
		});

		captureProcess.stderr.on("data", function (data) {
			console.log("[" + getCurrentDateTime() + "]", data.toString());
		});
	}).catch(errors.ModelOfflineError, function (e) {
		console.log("[" + getCurrentDateTime() + "]", e.explanation);
	});
};

var getLiveModels = function() {
	return Promise.try(function() {
		return session.get("https://chaturbate.com/followed-cams/");
	}).then(function (response) {
		var $ = cheerio.load(response.body);

		return $("#main div.content ul.list").children("li")
		.filter(function(){
			return $(this).find("div.details ul.sub-info li.cams").text() != "offline";
		})
		.map(function(){
			return $(this).find("div.title a").text().trim();
		})
		.get();
	});
};

var chaturbateLogin = function() {
	return Promise.try(function() {
		return session.get("https://chaturbate.com/auth/login/");
	}).then(function (response) {
		var $ = cheerio.load(response.body);

		var csrfToken = $("#main form[action='/auth/login/'] input[name='csrfmiddlewaretoken']").val();

		return session.post("https://chaturbate.com/auth/login/", {username: config.username, password: config.password, csrfmiddlewaretoken: csrfToken, next: "/"}, {headers: {"referer": "https://chaturbate.com/auth/login/"}});
	});
};

var mainLoop = function() {
	Promise.try(function() {
		return chaturbateLogin();
	}).then(function (response) {
		return getLiveModels();
	}).then(function (liveModels) {
		liveModels.forEach(function (liveModel) {
			if (modelsCurrentlyCapturing.indexOf(liveModel) === -1) {
				console.log("[" + getCurrentDateTime() + "]", liveModel, "is now online, starting rtmpdump process");

				modelsCurrentlyCapturing.push(liveModel);
				capture(liveModel);
			}
		});

	}).then(function() {
		setTimeout(mainLoop, config.modelScanInterval);
	});
};

console.log("[" + getCurrentDateTime() + "]", "capturebate-node started"); // Lol lies this is the first thing it does that isn't a variable definition

mainLoop();
