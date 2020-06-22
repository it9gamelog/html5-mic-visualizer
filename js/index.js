window.onload = function () {
    "use strict";

    var hashCode = s => s.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
    var pathChecksum = hashCode(document.location.pathname);
    const SESSION_DEVICE_ID = `html5-mic-visualizer:${pathChecksum}:device-id`;

    var paths = document.getElementsByTagName('path');
    var visualizer = document.getElementById('visualizer');
    var monitorSingleton = null;

    document.onmousedown = (evt) => {
        if (monitorSingleton)
        {
            monitorSingleton.stop();
            monitorSingleton = null;
        }
        sessionStorage.removeItem(SESSION_DEVICE_ID);
        init();
    }

    class SoundMonitor
    {
        stream;
        visualizer;
        binCount;
        minDecibels;
        maxDecibels;
        minFreq;
        maxFreq;

        analyser;
        frequencyArray;
        isStart;
        paths;
        binSize;

        constructor(stream, visualizer, binCount, minDecibels, maxDecibels, minFreq, maxFreq)
        {
            this.stream = stream;
            this.visualizer = visualizer;
            this.binCount = binCount == null ? 128 : binCount;
            this.minDecibels = minDecibels == null ? -72 : minDecibels;
            this.maxDecibels = maxDecibels == null ? -10 : maxDecibels;
            this.minFreq = minFreq == null ? 0 : minFreq;
            this.maxFreq = maxFreq == null ? 8000 : maxFreq;
        }

        start()
        {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            var audioContent = new AudioContext();
            var audioStream = audioContent.createMediaStreamSource(this.stream);
            this.analyser = audioContent.createAnalyser();
            this.analyser.fftSize = 4096; // Hardcoded
            this.analyser.minDecibels = this.minDecibels;
            this.analyser.maxDecibels = this.maxDecibels;
            audioStream.connect(this.analyser);

            // console.log(audioContent.sampleRate);

            var bufferLength = this.analyser.frequencyBinCount;
            this.binSize = audioContent.sampleRate / bufferLength / 2;
            this.frequencyArray = new Uint8Array(bufferLength);
            this.visualizer.setAttribute('viewBox', `0 0 ${this.binCount} 255`);
    
            var mask = visualizer.getElementById('mask');
            this._clearMask();
            for (var i = 0 ; i < this.binCount; i++) {
                var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                // path.setAttribute('stroke-dasharray', '4,1');
                this.paths.push(path);
                mask.appendChild(path);
            }
            this.isStart = true;
            this._draw();
        }

        stop()
        {
            this.isStart = false;
            this._clearMask();
        }

        _clearMask()
        {
            var mask = this.visualizer.getElementById('mask');
            while (mask.firstChild) mask.removeChild(mask.lastChild);
            this.paths = [];
        }

        _draw()
        {
            if (this.isStart) requestAnimationFrame(() => this._draw());
            this.analyser.getByteFrequencyData(this.frequencyArray);
            var adjustedLength;
            var c = 0;
            var freqStep = (this.maxFreq-this.minFreq) / this.binCount;
            for (var f = this.minFreq, c = 0;
                 f <= this.maxFreq, c < this.binCount; 
                 f += freqStep, c++) {
                var s = Math.min(Math.floor(f / this.binSize), this.frequencyArray.length - 1);
                var e = Math.min(Math.floor((f + freqStep) / this.binSize), this.frequencyArray.length);
                var sum = 0;
                for (var i = s; i < e; i++)
                    sum += this.frequencyArray[i];
                adjustedLength = sum / Math.max(e - s, 1);
                this.paths[c].setAttribute('d', `M ${c+0.5},255 v -${adjustedLength}`);
            }
        }
    }

    function htmlToElements(html)
    {
        var template = document.createElement('template');
        template.innerHTML = html;
        return template.content.childNodes;
    }

    async function launchMonitor(deviceId)
    {
        sessionStorage.setItem(SESSION_DEVICE_ID, deviceId);

        document.getElementById("prompt-container").style.display = 'none';
        var stream = await navigator.mediaDevices.getUserMedia({audio: { deviceId: { exact: deviceId }}});
        // The parameters is visually optimized for human voice
        monitorSingleton = new SoundMonitor(stream, visualizer, 32, -84, -40, 64, 2400);
        monitorSingleton.start();
    }

    document.getElementById("prompt-permission").onclick = () => { init(); };

    async function init()
    {
        await navigator.mediaDevices.getUserMedia({audio:true})

        document.getElementById("prompt-container").style.display = '';
        document.getElementById("prompt-permission").style.display = 'none';
        document.getElementById("prompt-select-device").style.display = '';

        var devices = await navigator.mediaDevices.enumerateDevices();
        var container = document.getElementById("prompt-select-device");
        while (container.firstChild) {
            if (!container.lastChild.value) break;
            container.removeChild(container.lastChild);
        }
        var previousDevice = sessionStorage.getItem(SESSION_DEVICE_ID);

        container.onchange = (evt) => {
            if (container.value)
                launchMonitor(container.value);
        };
        for (const d of devices)
        {
            if (d.kind != "audioinput") continue;
            if (previousDevice != null && d.deviceId == previousDevice) {
                launchMonitor(d.deviceId);
                break;
            }
            var button = htmlToElements(`<option value="${d.deviceId}">${d.label}</option>`)[0];
            container.appendChild(button);
        }
    }

    init();
};
