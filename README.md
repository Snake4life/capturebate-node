capturebate-node
==========

capturebate-node lets you follow and archive your favorite models' shows on chaturbate.com

Requirements
==========
[RTMPDump(ksv)](https://github.com/BurntSushi/rtmpdump-ksv) used to capture the streams.

[Node.js](https://nodejs.org/download/) used to run capturebate-node, hence the name.

[ffmpeg](https://www.ffmpeg.org/download.html) compiled with support for `libmp3lame` & `libspeex` audio for converting the output files.

Setup
===========

Install requirements, run `npm install` in the same folder as main.js is.

Get a [chaturbate account](https://chaturbate.com/accounts/register/), once you're signed up put your credentials in the `config.yml` file and - if needed - adjust the other options.

Be mindful when capturing many streams at once to have plenty of space on disk and the bandwidth available or you'll end up dropping a lot of frames and the files will be useless.

Before you can start capturing streams you first need to [follow](https://i.imgur.com/o9QyAVC.png) the models you want on the site, once you've done this you're ready to start capturebate-node by running `node main.js`

Running & Output
===========

To start capturing streams you need to run `node main.js` I reccomend you do this in [screen](https://www.gnu.org/software/screen/) as that'll keep running if you lose connection to the machine or otherwise close your shell.

Standard output should look something this when recording streams:

	[2015-05-16T00:19:02] capturebate-node started
	[2015-05-16T00:19:08] eeeveee is now online, starting rtmpdump process

Converting
===========

There is a simple script to convert `.flv` files. Just edit `convert.yml` file and set proper values for `srcDirectory` (should be the same with `completeDirectory`) and `dstDirectory`, and run `node convert.js` in separate console window.

> Note for Windows users: You should copy `ffmpeg.exe` file into the same directory as `main.js` is.