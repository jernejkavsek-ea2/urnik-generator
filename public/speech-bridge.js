/*
 * Speech bridge za Urnik generator
 * ---------------------------------
 * Aplikacija kliče window.speechSynthesis in window.SpeechRecognition.
 * Ta skripta ju (če je na strežniku nastavljen ElevenLabs, Google ali Azure) preusmeri na
 * /api/tts in /api/stt, ki tečeta na Vercelu:
 *   - govor: naraven slovenski glas
 *   - prepoznava: snemanje v brskalniku -> WAV 16 kHz -> strežnik (sl-SI)
 * Če strežnik ni nastavljen, ostane vse kot prej (vgrajeni glas brskalnika).
 */
(function () {
  'use strict';

  var native = {
    synth: window.speechSynthesis || null,
    SR: window.SpeechRecognition || window.webkitSpeechRecognition || null,
  };
  var cfg = { tts: false, stt: false, preferNativeStt: false };
  var isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  var ready = fetch('/api/speech-status', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (j) { cfg.tts = !!j.tts; cfg.stt = !!j.stt; cfg.preferNativeStt = !!j.preferNativeStt; })
    .catch(function () {});

  /* ---------- GOVOR (TTS) ---------- */

  // En sam <audio> element, ki ga "odklenemo" ob prvem kliku – tako
  // predvajanje deluje tudi na iPhonu/Safariju, kjer je autoplay omejen.
  var SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
  var audio = new Audio();
  audio.preload = 'auto';
  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try { audio.src = SILENT; var p = audio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  });

  var seq = 0, speaking = false;

  function fire(u, name) { try { if (u && typeof u['on' + name] === 'function') u['on' + name]({ type: name, utterance: u }); } catch (e) {} }
  function stopAudio() {
    speaking = false;
    try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {}
  }

  // Glas brskalnika uporabimo samo, če je slovenski – sicer bi slovensko besedilo bral angleški glas.
  function nativeSl(u) {
    if (!native.synth) return false;
    try {
      var v = native.synth.getVoices().filter(function (x) { return /^sl/i.test(x.lang); });
      if (!v.length) return false;
      u.voice = v.find(function (x) { return /natural|online/i.test(x.name); }) || v[0];
      native.synth.speak(u); return true;
    } catch (e) { return false; }
  }

  // Pretakanje: <audio> dobi URL in začne igrati, ko pride prvi del zvoka.
  // Brskalnik ponovljene stavke vzame iz predpomnilnika (takoj).
  function speakRemote(u, id, attempt) {
    attempt = attempt || 0;
    var text = String((u && u.text) || '').trim();
    if (!text) return;
    var rate = u && typeof u.rate === 'number' ? u.rate : 1;
    var url = '/api/tts?r=' + rate.toFixed(2) + '&t=' + encodeURIComponent(text) + (attempt ? '&a=' + attempt : '');
    var done = false;
    function fail() {
      if (done || id !== seq) return;
      done = true; speaking = false;
      if (attempt < 1) { setTimeout(function () { if (id === seq) speakRemote(u, id, attempt + 1); }, 600); return; }
      if (!nativeSl(u)) fire(u, 'end');
    }
    speaking = true;
    audio.onplaying = function () { if (id === seq) fire(u, 'start'); };
    audio.onended = function () { if (id === seq) { done = true; speaking = false; fire(u, 'end'); } };
    audio.onerror = function () { if (id === seq) fail(); };
    audio.src = url;
    var p = audio.play();
    if (p && p.catch) p.catch(function (err) {
      if (err && err.name === 'AbortError') return;
      if (err && err.name === 'NotAllowedError') {
        // brskalnik še ne dovoli zvoka (ni bilo klika) – predvajamo ob prvem kliku
        var go = function () { window.removeEventListener('pointerdown', go, true); if (id === seq) audio.play().catch(function () {}); };
        window.addEventListener('pointerdown', go, true);
        return;
      }
      fail();
    });
  }

  var synthShim = {
    get speaking() { return speaking || !!(native.synth && native.synth.speaking); },
    get pending() { return false; },
    get paused() { return audio.paused && speaking; },
    onvoiceschanged: null,
    speak: function (u) {
      var id = ++seq;
      ready.then(function () {
        if (id !== seq) return;
        if (cfg.tts) speakRemote(u, id, 0);
        else if (!nativeSl(u) && native.synth) native.synth.speak(u);
      });
    },
    cancel: function () {
      seq++;
      stopAudio();
      if (native.synth) try { native.synth.cancel(); } catch (e) {}
    },
    pause: function () { try { audio.pause(); } catch (e) {} if (native.synth) native.synth.pause(); },
    resume: function () { if (speaking) audio.play().catch(function () {}); if (native.synth) native.synth.resume(); },
    getVoices: function () { return native.synth ? native.synth.getVoices() : []; },
    addEventListener: function () {}, removeEventListener: function () {},
  };
  try { Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: function () { return synthShim; } }); } catch (e) {}
  if (!window.SpeechSynthesisUtterance) {
    window.SpeechSynthesisUtterance = function (t) { this.text = t || ''; this.lang = 'sl-SI'; this.rate = 1; };
  }

  /* ---------- PREPOZNAVA GOVORA (STT) ---------- */

  function mkEvent(text, isFinal) {
    var alt = { transcript: text, confidence: 0.9 };
    var res = [alt]; res.isFinal = isFinal; res.item = function (i) { return res[i]; };
    var results = [res]; results.item = function (i) { return results[i]; };
    return { type: 'result', resultIndex: 0, results: results };
  }

  function encodeWav(chunks, inRate, outRate) {
    var len = 0; chunks.forEach(function (c) { len += c.length; });
    var all = new Float32Array(len), o = 0;
    chunks.forEach(function (c) { all.set(c, o); o += c.length; });
    var ratio = inRate / outRate, n = Math.floor(all.length / ratio);
    var buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(p, s) { for (var i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, outRate, true); v.setUint32(28, outRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var a = Math.floor(i * ratio), b = Math.min(all.length, Math.floor((i + 1) * ratio)), sum = 0;
      for (var k = a; k < b; k++) sum += all[k];
      var s = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  function BridgeRecognition() {
    this.lang = 'sl-SI';
    this.interimResults = false;
    this.continuous = false;
    this.maxAlternatives = 1;
    this.onresult = this.onerror = this.onend = this.onstart = null;
    this._rec = null; this._native = null; this._done = false; this._aborted = false;
  }
  BridgeRecognition.prototype._emit = function (name, ev) {
    try { if (typeof this['on' + name] === 'function') this['on' + name](ev || { type: name }); } catch (e) { setTimeout(function () { throw e; }); }
  };
  BridgeRecognition.prototype._finish = function () {
    if (this._done) return; this._done = true; this._emit('end');
  };
  BridgeRecognition.prototype.start = function () {
    var self = this;
    ready.then(function () {
      if (self._aborted) return self._finish();
      // Prepoznava brskalnika: če strežnik ni nastavljen ali če strežnik tako želi (Chrome/Edge; Safari ne zna slovensko)
      var useNative = !cfg.stt || (cfg.preferNativeStt && native.SR && !isSafari);
      if (useNative) {
        if (!native.SR) { self._emit('error', { error: 'service-not-allowed' }); return self._finish(); }
        var n = new native.SR();
        n.lang = self.lang; n.interimResults = self.interimResults; n.maxAlternatives = self.maxAlternatives; n.continuous = self.continuous;
        n.onresult = function (e) { self._emit('result', e); };
        n.onerror = function (e) { self._emit('error', e); };
        n.onstart = function (e) { self._emit('start', e); };
        n.onend = function () { self._finish(); };
        self._native = n;
        try { n.start(); } catch (e) { self._emit('error', { error: 'aborted' }); self._finish(); }
        return;
      }
      self._record();
    });
  };
  BridgeRecognition.prototype._record = function () {
    var self = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      self._emit('error', { error: 'audio-capture' }); return self._finish();
    }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (stream) {
        if (self._aborted) { stream.getTracks().forEach(function (t) { t.stop(); }); return self._finish(); }
        var AC = window.AudioContext || window.webkitAudioContext;
        var ac = new AC();
        var src = ac.createMediaStreamSource(stream);
        var proc = ac.createScriptProcessor(4096, 1, 1);
        var rec = { stream: stream, ac: ac, proc: proc, src: src, chunks: [], heard: false, rate: ac.sampleRate };
        var t0 = Date.now(), lastVoice = 0, noise = 0.004, calib = 0;
        proc.onaudioprocess = function (e) {
          if (self._rec !== rec) return;
          var d = e.inputBuffer.getChannelData(0);
          rec.chunks.push(new Float32Array(d));
          var sum = 0; for (var i = 0; i < d.length; i++) sum += d[i] * d[i];
          var rms = Math.sqrt(sum / d.length), now = Date.now();
          if (calib < 4) { noise = Math.max(noise, rms); calib++; return; } // ~350 ms za šum okolja
          if (rms > Math.max(0.012, noise * 2.5)) { rec.heard = true; lastVoice = now; }
          if (rec.heard && now - lastVoice > 1300) self.stop();       // tišina po govoru
          else if (!rec.heard && now - t0 > 7000) self.stop();        // nič ni bilo slišati
          else if (now - t0 > 30000) self.stop();                     // največ 30 s
        };
        src.connect(proc); proc.connect(ac.destination);
        self._rec = rec;
        self._emit('start');
        if (self.interimResults) self._emit('result', mkEvent('Poslušam …', false));
      })
      .catch(function (err) {
        var name = err && err.name;
        self._emit('error', { error: name === 'NotAllowedError' || name === 'SecurityError' ? 'not-allowed' : 'audio-capture' });
        self._finish();
      });
  };
  BridgeRecognition.prototype._teardown = function () {
    var rec = this._rec; this._rec = null;
    if (!rec) return null;
    try { rec.proc.disconnect(); rec.src.disconnect(); } catch (e) {}
    try { rec.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { rec.ac.close(); } catch (e) {}
    return rec;
  };
  BridgeRecognition.prototype.stop = function () {
    var self = this;
    if (self._native) { try { self._native.stop(); } catch (e) {} return; }
    var rec = self._teardown();
    if (!rec) { self._aborted = true; return; }
    if (!rec.heard) { self._emit('error', { error: 'no-speech' }); return self._finish(); }
    if (self.interimResults) self._emit('result', mkEvent('Prepoznavam …', false));
    var wav = encodeWav(rec.chunks, rec.rate, 16000);
    fetch('/api/stt?lang=' + encodeURIComponent(self.lang || 'sl-SI'), {
      method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav,
    })
      .then(function (r) { if (!r.ok) throw new Error('stt ' + r.status); return r.json(); })
      .then(function (j) {
        var text = (j && j.text ? String(j.text) : '').trim().replace(/[.!?]+$/, '');
        if (text) self._emit('result', mkEvent(text, true));
        else self._emit('error', { error: 'no-speech' });
      })
      .catch(function () { self._emit('error', { error: 'network' }); })
      .then(function () { self._finish(); });
  };
  BridgeRecognition.prototype.abort = function () {
    this._aborted = true;
    if (this._native) { try { this._native.abort(); } catch (e) {} return; }
    if (this._teardown()) this._finish();
  };
  BridgeRecognition.prototype.addEventListener = function () {};
  BridgeRecognition.prototype.removeEventListener = function () {};

  /* ---------- PAMETNI POGOVOR (AI) ---------- */
  // Aplikacija pokliče window.urnikAI, ko ukaza ne razume. Vrne {command, answer, chips} ali null.
  window.urnikAI = function (text, ctx, history) {
    return fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, ctx: ctx, history: history }),
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  };

  window.SpeechRecognition = BridgeRecognition;
  window.webkitSpeechRecognition = BridgeRecognition;
})();
