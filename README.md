Chibitronics Love-to-Code Audio Modulator
=========================================

A software modulator to turn code into audio for the Love-to-Code Chibi Chip.

Usage
-----

First, get some data.  The usual way to do this is via some base64 encoded data that came back as a JSON result.  Convert it into a Uint8Array:

    var data = atob(results.output);
    var dataU8 = new Uint8Array(data.length);
    for (var i = 0; i < data.length; i++) {
        dataU8[i] = data.charCodeAt(i);
    }

Next, initialize a modulation controller.  If you want to be able to visualize the output waveform, give it a canvas to work with.

You can also specify the output audio format for the audio tag.  Currently-supported values are 'wav' and 'mp3'.

If you want a more resiliant "low bitrate" mode, specify "true" to lbr.

    var ModulationController = require('chibitronics-ltc-modulate');
    var modController = new ModulationController({
        canvas: getCanvas(),
        lbr: lbrEnable,
        format: 'wav',
        endCallback: function () {
            getWaveFooter().style.display = 'none';
        }
    });

Finally, transcode the audio into an audio tag:

    modController.transcodeToAudioTag(dataU8, document.getElementById('audio_tag'));

Parameters
-----------

Most parameters are arguments to the ModulationController object.  All are optional.

* **lbr** *boolean* true for low-bitrate mode, false for high-bitrate mode.  Defaults to high bitrate.  Useful for noisy situations.
* **format** *string* What format to render the output as.  Defaults to 'wav'.  If lamejs is present, 'mp3' is also an option.
* **loops** *number* The number of iterations of the song to play.  Useful because there is no error correction on the device, aside from playing the file again.  Defaults to 3 plays.
* **canvas** *canvas element* Pass an HTML canvas element to the modulator, so that it can draw the waveform onto it.
* **endCallback** *function* A function to call after all loops have finished and the wave has played completely.
* **version** *number* Version of the modulation encoding to use.  Version 1 was used on preproduction units.  Version 2 is much more reliable.  Defaults to version 2.

Unblocking Audio
----------------

Many devices "block" audio, and can only allow playback when called from a touch or click event.  A quick way around this is to play some silence, which will make audio available to you in the future:

    var audioTag = document.getElementById('audio_tag');
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

    document.write('<script language="javascript" type="text/javascript" src="js/lame.min.js"></script>');
    Math.log10 = function (x) { return Math.log(x) / Math.LN10; };

Finally, specify 'mp3' as the format.
