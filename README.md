Chibitronics Love-to-Code Audio Modulator
=========================================


Usage
-----

First, get some data.  The usual way to do this is via some base64 encoded data that came back as a JSON result.  Convert it into a Uint8Array:

    var data = atob(results.output);
    var dataU8 = new Uint8Array(data.length);
    for (var i = 0; i < data.length; i++) {
        dataU8[i] = data[i];
    }

Next, initialize a modulation controller.  If you want to be able to visualize the output waveform, give it a canvas to work with.

If you want a more resiliant "low bitrate" mode, specify "true" to lbr:

    var ModulationController = require('chibitronics-ltc-modulate');
    modController = new ModulationController({
        canvas: getCanvas(),
        lbr: lbrEnable,
        endCallback: function () {
            getWaveFooter().style.display = 'none';
        }
    });

Finally, transcode the audio into an audio tag.  You probably want the audioFormat to be 'wav'.  If you're using a preproduction device, you'll need to set modulationVersion=1.  Otherwise, version 2 is preferred as it is more robust:

    var audioFormat = 'wav';
    var modulationVersion = 2;
    modController.transcodeToAudioTag(dataU8,
        getAudioElement(),
        audioFormat,
        lbrEnable,
        modulationVersion);


Unblocking Audio
----------------

Many devices "block" audio, and can only allow playback when called from a touch or click event.  A quick way around this is to play some silence, which will make audio available to you in the future:

    var audioTag = getAudioElement();
    if (useMP3) {
        audioTag.src = 'data:audio/mp3;base64,' +
            'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2Z' +
            'jU2LjM2LjEwMAAAAAAAAAAAAAAA//OEAA' +
            'AAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8' +
            'AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDA' +
            'wMDAwMDAwMDV1dXV1dXV1dXV1dXV1dXV1' +
            'dXV1dXV1dXV6urq6urq6urq6urq6urq6u' +
            'rq6urq6urq6v/////////////////////' +
            '///////////8AAAAATGF2YzU2LjQxAAAA' +
            'AAAAAAAAAAAAJAAAAAAAAAAAASDs90hvA' +
            'AAAAAAAAAAAAAAAAAAA//MUZAAAAAGkAA' +
            'AAAAAAA0gAAAAATEFN//MUZAMAAAGkAAA' +
            'AAAAAA0gAAAAARTMu//MUZAYAAAGkAAAA' +
            'AAAAA0gAAAAAOTku//MUZAkAAAGkAAAAA' +
            'AAAA0gAAAAANVVV';
    }
    else {
        audioTag.src = 'data:audio/wav;base64,' +
            'UklGRigAAABXQVZFZm10IBIAAAABAAEAR' +
            'KwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    }
    audioTag.play();

    if (modController) {
        modController.stop();
    }

Internet Explorer Support
-------------------------
If you want to use this with Internet Explorer, you'll need to use MP3 encoding rather than WAV encoding.  Use Lamejs, which is a complete MP3 encoding solution written entirely in Javascript.

Because Lamejs is LGPL, it cannot be compiled into this module.  Load it sparately.

Also note that you'll need to polyfill Math.log10 on IE11.

Load lame.min.js on your server, and then do something like this:

    document.write("<script language='javascript' type='text/javascript' src='js/lame.min.js'></script>");
    Math.log10 = function (x) { return Math.log(x) / Math.LN10; };

Finally, specify 'mp3' as the audioFormat.

