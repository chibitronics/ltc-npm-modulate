var FskEncoder = require("./afsk-encoder.js");

var Modulator = function(params) {

    if (!params)
        params = new Object();

    if ("rate" in params)
        this.rate = params.rate;
    if ("lbr" in params)
        this.lbr = params.lbr;
    else
        this.lbr = false;

    this.encoder = new FskEncoder(this.rate, this.lbr);

    // Create a "script node" that will actually generate audio samples.
    this.script_node = Modulator.prototype.script_node;

    // Start out in a not-playing state
    this.playing = false;
}

Modulator.prototype = {
    encoder: null, // FskEncoder object
    outputAudioBuffer: null, // AudioBuffer object
    uiCallback: null, // UI object for callback
    scriptNode: null, // Re-used script node object for audio generation
    can_stop: true, // Whether we can stop (usually we can)

    modulatePcm: function(data, type, useLBR) {
        // Re-create the encoder if LBR mode has changed.
        if ((useLBR !== undefined) && (this.lbr !== useLBR)) {
            this.lbr = useLBR;
            this.encoder = new FskEncoder(this.rate, this.lbr);
        }

        var bufLen = Math.ceil(data.length * 8 * this.encoder.samplesPerBit());
        var modulatedData = new Float32Array(bufLen);
        if (type === undefined) {
            type = 16;
        }

        this.encoder.modulate(data, modulatedData); // writes outputFloatArray in-place

        if (type === 16) {
            var pcmData = new Int16Array(modulatedData.length);
            for (var i = 0; i < modulatedData.length; i++) {
                // Map -1 .. 1 to -32767 .. 32768
                pcmData[i] = Math.round((modulatedData[i]) * 32767);
            }
            return pcmData;
        } else {
            var pcmData = new Uint8Array(new ArrayBuffer(modulatedData.length * 2));
            for (var i = 0; i < modulatedData.length; i++) {
                // Map -1 .. 1 to -32767 .. 32768
                var sample = Math.round((modulatedData[i]) * 32767);

                // Javascript doesn't really do two's compliment
                if (sample < 0)
                    sample = (0xffff - ~sample);

                pcmData[(i * 2) + 0] = Math.round(sample) & 0xff;
                pcmData[(i * 2) + 1] = Math.round(sample >> 8) & 0xff;
            }
            return pcmData;
        }
    }
}

// AMD exports
if (typeof module !== "undefined" && module.exports) {
    module.exports = Modulator;
}