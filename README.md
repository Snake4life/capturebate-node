capturebate-node
==========

capturebate-node lets you follow and archive your favorite models' shows on chaturbate.com

Requirements
==========
(Debian 7, minimum)

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

Encoding
===========

Once you've captured some streams you're going to need to convert the audio to have them play nice in most media players. This is where ffmpeg comes in, there is no need to convert the video so this doesn't take too long. To convert individual files do `ffmpeg -i input.flv -vcodec copy -acodec libmp3lame output.mp4` this will convert the speex audio to mp3 and change the container to mp4 (stream is h264)

If you want to batch convert your captured streams run `find ./ -name '*.flv' -execdir mkdir converted_bates \;; for file in *.flv; do ffmpeg -i "$file" -vcodec copy -acodec libmp3lame "converted_bates/${file%.flv}.mp4"; done` from the directory you capture to.

If you don't want to do any conversion you can install the [speex audio codec](http://speex.org/downloads/) which is a huge pain in the ass to get working correctly under linux/VLC.
