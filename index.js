'use strict';
var Modulator = require("./modulate.js");
var murmurhash3_32_gc = require("./murmurhash3_gc.js");
var SparkMD5 = require("./spark-md5.js");

var ModulationController = function(params) {

    if (!params)
        params = new Object();

    this.canvas = params.canvas || undefined;
    this.endCallback = params.endCallback || undefined;
    this.lbr = params.lbr || false;
    this.version = params.version || 2;
    this.repeat = params.repeat || 3;
    this.format = params.format || "wav";
    this.format = this.format.toLowerCase();

    this.isSending = false;
    this.playing = false;
    this.playCount = 0;
    this.rate = 44100;
    this.pcmData = null;

    this.PROT_VERSION_1 = 0x01; // Protocol v1
    this.PROT_VERSION_2 = 0x02; // Protocol v2 (different striping pattern)

    this.CONTROL_PACKET = 0x01;
    this.DATA_PACKET = 0x02;

    this.modulator = new Modulator({
        rate: this.rate,
        lbr: this.lbr
    }); // the modulator object contains our window's audio context

    /* Preamble sent before every audio packet */
    this.preamble = [0x00, 0x00, 0x00, 0x00, 0xaa, 0x55, 0x42];

    /* Stop bits, sent to pad the end of transmission */
    this.stop_bytes = [0xff];
}

ModulationController.prototype = {

    makeControlHeader: function() {
        return [this.version, this.CONTROL_PACKET, 0x00, 0x00];
    },

    makeDataHeader: function(blockNum) {
        return [this.version, this.DATA_PACKET, blockNum & 0xff, (blockNum >> 8) & 0xff];
    },

    getPcmData: function() {
        return this.pcmData;
    },

    transcode: function(array, lbr, version) {
        if (version === 1) {
            this.version = this.PROT_VERSION_1;
        } else if ((version === 2) || (version === undefined)) {
            this.version = this.PROT_VERSION_2;
        } else {
            throw "Unrecognized version: " + version;
        }

        var fileLen = array.length;
        var blocks = Math.ceil(fileLen / 256);
        var rawPcmData = [];

        var pcmPacket;

        // Additional padding to work around anti-pop hardware/software
        this.makeSilence(rawPcmData, 150);

        // Low-bitrate adds on a pilot tone
        if (lbr) {
            this.makeLowTone(rawPcmData, 500);
            this.makeSilence(rawPcmData, 100); // brief gap to actual data
        }

        pcmPacket = this.modulator.modulatePcm(this.makeCtlPacket(array.subarray(0, fileLen)), 16, this.lbr);
        for (var i = 0; i < pcmPacket.length; i++)
            rawPcmData.push(pcmPacket[i]);

        // Make silence here
        this.makeSilence(rawPcmData, 100);

        pcmPacket = this.modulator.modulatePcm(this.makeCtlPacket(array.subarray(0, fileLen)), 16, this.lbr);
        for (var i = 0; i < pcmPacket.length; i++)
            rawPcmData.push(pcmPacket[i]);

        // More silence
        this.makeSilence(rawPcmData, 500);

        for (var block = 0; block < blocks; block++) {
            var start = block * 256;
            var end = start + 256;
            if (end > fileLen)
                end = fileLen;
            pcmPacket = this.modulator.modulatePcm(this.makeDataPacket(array.subarray(start, end), block), 16, this.lbr);
            for (var i = 0; i < pcmPacket.length; i++)
                rawPcmData.push(pcmPacket[i]);

            // Inter-packet silence
            this.makeSilence(rawPcmData, 80);
        }

        // Additional padding to work around anti-pop hardware/software
        this.makeSilence(rawPcmData, 150);

        return rawPcmData;
    },

    transcodeToAudioTag: function(array, tag, audioType, lbr, version) {

        // Figure out which audio format to use, and fall back to a default format if unspecified.
        if (audioType !== undefined) {
            if (audioType.toLowerCase() === 'mp3') {
                audioType = 'mp3';
            } else if (audioType.toLowerCase() === 'wav') {
                audioType = 'wav';
            } else {
                console.warn("Unrecognized audio format: " + audioType);
            }
            audioType = undefined;
        }
        // Use a default audio format if a valid one is unavailable.
        if (audioType === undefined) {
            if (this.format === 'mp3') {
                audioType = 'mp3';
            } else if (this.format === 'wav') {
                audioType = 'wav';
            } else {
                throw "Unrecognized audio type";
            }
        }

        // If no lbr is specified, use the default
        if (lbr === undefined) {
            lbr = this.lbr;
        }

        // Use the default version, if unspecified.
        if (version === undefined) {
            version = this.version;
        }

        this.playCount = 0;
        this.tag = tag;

        if (!tag.paused) {
            tag.pause();
        }

        // Perform the transcode, which stores data in this.pcmData.
        var rawPcmData = this.transcode(array, lbr, version);

        tag.onended = function() {
            // Play again if we haven't hit the limit'
            this.playCount++;
            if (this.playCount < this.repeat) {
                tag.play();
            } else {
                this.tag.onended = undefined;
                if (this.endCallback)
                    this.endCallback();
            }
        }.bind(this);

        if (audioType === 'mp3') {
            this.transcodeMp3(rawPcmData, tag);
        } else if (audioType === 'wav') {
            this.transcodeWav(rawPcmData, tag);
        } else {
            throw "Unrecognized audio format: " + audioType;
        }
        this.pcmData = rawPcmData;

        tag.play();
    },

    getRawWavData: function(array, lbr, version) {
        var rawPcmData = this.transcode(array, lbr, version);
        return this.getWavArray(samples);
    },

    fillU16: function(arr, off, val) {
        arr[off + 0] = (val >> 0) & 0xff;
        arr[off + 1] = (val >> 8) & 0xff;
    },

    fillU32: function(arr, off, val) {
        arr[off + 0] = (val >> 0) & 0xff;
        arr[off + 1] = (val >> 8) & 0xff;
        arr[off + 2] = (val >> 16) & 0xff;
        arr[off + 3] = (val >> 24) & 0xff;
    },

    getWavArray: function(samples) {
        var numChannels = 1;
        var bitsPerSample = 16;
        var sampleRate = this.rate;

        var blockAlign = (numChannels * bitsPerSample) >> 3;
        var byteRate = blockAlign * sampleRate;
        var subChunk1Size = 16; // PCM definition size is 16
        var subChunk2Size = samples.length * (bitsPerSample >> 3);
        var chunkSize = 36 + subChunk2Size;
        var audioFormat = 1; // PCM audio format is defined as "1"

        // Pre-allocate the wav output data, plus 44-byte WAV header
        var wavData = new Uint8Array(samples.length * 2 + 44);

        // Fill in the header
        // Chunk ID 'RIFF'
        wavData[0] = 0x52; // 'R'
        wavData[1] = 0x49; // 'I'
        wavData[2] = 0x46; // 'F'
        wavData[3] = 0x46; // 'F'
        // Chunk size
        this.fillU32(wavData, 4, chunkSize);
        // Format 'WAVE'
        wavData[8] = 0x57; // 'W'
        wavData[9] = 0x41; // 'A'
        wavData[10] = 0x56; // 'V'
        wavData[11] = 0x45; // 'E'
        // Sub-chunk 1 ID 'fmt '
        wavData[12] = 0x66; // 'f'
        wavData[13] = 0x6d; // 'm'
        wavData[14] = 0x74; // 't'
        wavData[15] = 0x20; // ' '
        this.fillU32(wavData, 16, subChunk1Size);
        this.fillU16(wavData, 20, audioFormat);
        this.fillU16(wavData, 22, numChannels);
        this.fillU32(wavData, 24, sampleRate);
        this.fillU32(wavData, 28, byteRate);
        this.fillU16(wavData, 32, blockAlign);
        this.fillU16(wavData, 34, bitsPerSample);
        // Sub-chunk 2 ID 'data'
        wavData[36] = 0x64; // 'd'
        wavData[37] = 0x61; // 'a'
        wavData[38] = 0x74; // 't'
        wavData[39] = 0x61; // 'a'
        this.fillU32(wavData, 40, subChunk2Size);

        // Copy over the wav data
        for (var i = 0; i < samples.length; i++) {

            // Convert from 16-bit PCM to two's compliment 8-bit buffers'
            var sample = samples[i];

            // Javascript doesn't really do two's compliment
            if (sample < 0)
                sample = (0xffff - ~sample);

            wavData[i * 2 + 44] = Math.round(sample) & 0xff;
            wavData[i * 2 + 45] = Math.round(sample >> 8) & 0xff;
        }

        return wavData;
    },

    transcodeWav: function(samples, tag) {
        var wavArray = this.getWavArray(samples);
        var blob = new Blob([wavArray], { type: 'audio/wav' });
        if (this.url !== undefined) {
            (window.URL || window.webkitURL).reoveObjectURL(this.url);
        }
        this.url = (window.URL || window.webkitURL).createObjectURL(blob);
        tag.src = this.url;
    },

    transcodeMp3: function(samples, tag) {
        var mp3encoder = new lamejs.Mp3Encoder(1, 44100, 128); //mono 44.1khz encode to 128kbps
        var samples16 = new Int16Array(samples.length);

        for (var i = 0; i < samples.length; i++) {
            samples16[i] = samples[i];
        }

        // Taken from lamejs README.md
        var sampleBlockSize = 1152; //can be anything but make it a multiple of 576 to make encoders life easier
        var mp3Data = [];
        var mp3buf;
        for (var i = 0; i < samples16.length; i += sampleBlockSize) {
            var sampleChunk = samples16.subarray(i, i + sampleBlockSize);
            mp3buf = mp3encoder.encodeBuffer(sampleChunk);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }
        mp3buf = mp3encoder.flush(); //finish writing mp3

        if (mp3buf.length > 0) {
            mp3Data.push(new Int8Array(mp3buf));
        }

        var blob = new Blob(mp3Data, { type: 'audio/mpeg' });
        var url = window.URL.createObjectURL(blob);

        tag.src = url;
    },

    makeSilence: function(buffer, msecs) {
        var silenceLen = Math.ceil(this.rate / (1000.0 / msecs));
        for (var i = 0; i < silenceLen; i++)
            buffer.push(0);
    },

    makeLowTone: function(buffer, msecs) {
        var bufLen = Math.ceil(this.rate / (1000.0 / msecs));
        var omega_lo = (2 * Math.PI * 8666) / this.rate;
        var phase = 0;
        for (var i = 0; i < bufLen; i++) {
            buffer.push(Math.round(Math.cos(phase) * 32767));
            phase += omega_lo;
        }
    },

    makeUint32: function(num) {
        return [num & 0xff,
            (num >> 8) & 0xff,
            (num >> 16) & 0xff,
            (num >> 24) & 0xff
        ];
    },

    makeUint16: function(num) {
        return [num & 0xff,
            (num >> 8) & 0xff
        ];
    },

    /* Appends "src" to "dst", beginning at offset "offset".
     * Handy for populating data buffers.
     */
    appendData: function(dst, src, offset) {
        var i;
        for (i = 0; i < src.length; i++)
            dst[offset + i] = src[i];
        return i;
    },

    makeHash: function(data, hash) {
        return this.makeUint32(murmurhash3_32_gc(data, hash));
    },

    makeFooter: function(packet) {
        var hash = 0xdeadbeef;
        var data = new Array();
        var i;
        var j;

        // Join all argument arrays together into "data"
        for (i = 0; i < arguments.length; i++)
            for (j = 0; j < arguments[i].length; j++)
                data.push(arguments[i][j]);

        return this.makeHash(data, hash);
    },

    makePacket: function() {
        var len = 0;
        var i;
        for (i = 0; i < arguments.length; i++)
            len += arguments[i].length;

        var pkt = new Uint8Array(len);
        var offset = 0;

        for (i = 0; i < arguments.length; i++)
            offset += this.appendData(pkt, arguments[i], offset);

        return pkt;
    },

    makeCtlPacket: function(data) {
        // parameters from microcontroller spec. Probably a better way
        // to do this in javascript, but I don't know how (seems like "const" could be used, but not universal)
        var preamble = this.preamble;
        var header = this.makeControlHeader();
        var program_length = this.makeUint32(data.length);
        var program_hash = this.makeHash(data, 0x32d0babe); // 0x32d0babe by convention
        var program_guid_str = SparkMD5.hashBinary(String.fromCharCode.apply(null, data), false);
        var program_guid = [];
        var i;
        for (i = 0; i < program_guid_str.length - 1; i += 2)
            program_guid.push(parseInt(program_guid_str.substr(i, 2), 16));

        var footer = this.makeFooter(header, program_length, program_hash, program_guid);
        var stop = this.stop_bytes;

        return this.makePacket(preamble, header, program_length, program_hash, program_guid, footer, stop);
    },

    makeDataPacket: function(dataIn, blocknum) {
        var i;

        // now assemble the packet
        var preamble = this.preamble;
        var header = this.makeDataHeader(blocknum);

        // Ensure the "data" payload is 256 bytes long.
        var data = new Uint8Array(256);
        for (i = 0; i < data.length; i++) data[i] = 0xff; // data.fill(0xff)
        this.appendData(data, dataIn, 0);

        var footer = this.makeFooter(header, data);
        var stop = this.stop_bytes;

        // 256 byte payload, preamble, sector offset + 4 bytes hash + 1 byte stop
        var packetlen = preamble.length + header.length + data.length + footer.length + stop.length;

        // now stripe the buffer to ensure transitions for baud sync
        // don't stripe the premable or the hash
        if (this.version === this.PROT_VERSION_1) {
            for (i = 0; i < data.length; i++) {
                if ((i % 16) == 3)
                    data[i] ^= 0x55;
                else if ((i % 16) == 11)
                    data[i] ^= 0xaa;
            }
        } else if (this.version === this.PROT_VERSION_2) {
            for (i = 2; i < data.length + 4; i++) {
                if (i < 4) { // to include striping on the block number
                    if ((i % 3) == 0)
                        header[i] ^= 0x35;
                    else if ((i % 3) == 1)
                        header[i] ^= 0xac;
                    else if ((i % 3) == 2)
                        header[i] ^= 0x95;
                } else { // and striping on the data packet, but offset origin from block number
                    if ((i % 3) == 0)
                        data[i - 4] ^= 0x35;
                    else if ((i % 3) == 1)
                        data[i - 4] ^= 0xac;
                    else if ((i % 3) == 2)
                        data[i - 4] ^= 0x95;
                }
            }
        } else {
            throw "Unrecognized version: " + this.version;
        }
        return this.makePacket(preamble, header, data, footer, stop);
    },

    stop: function() {
        this.isSending = false;
    },

    isRunning: function() {
        return this.isSending;
    }
}

// AMD exports
if (typeof module !== "undefined" && module.exports) {
    module.exports = ModulationController;
}