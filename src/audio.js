export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.nextNote = 0;
    this.step = 0;
  }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.22;
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass"; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    const waveF = ctx.createBiquadFilter(); waveF.type = "lowpass"; waveF.frequency.value = 380;
    this.waveGain = ctx.createGain(); this.waveGain.gain.value = 0.05;
    src.connect(waveF).connect(this.waveGain).connect(this.master);
    src.start();
    this.nextNote = ctx.currentTime + 0.1;
  }
  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }
  tone(freq, dur = 0.25, type = "triangle", vol = 0.2, when = 0, bus = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  pickup(n) { this.tone(880 + (n % 5) * 60, 0.18, "sine", 0.18); this.tone(1320 + (n % 5) * 80, 0.22, "sine", 0.12, 0.06); }
  bell() { [523, 1046, 1568, 2093].forEach((f, k) => this.tone(f, 1.8 - k * 0.3, "sine", 0.16 / (k + 1))); }
  bump() {
    if (!this.ctx) return;
    this.tone(90, 0.3, "sine", 0.5); this.tone(140, 0.15, "square", 0.08);
  }
  boost() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.4);
    g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.55);
  }
  fanfare() { [523, 659, 784, 1046].forEach((f, k) => this.tone(f, 0.5, "triangle", 0.2, k * 0.14)); }
  update(speed, playing) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(playing ? Math.min(0.12, speed * 0.006) : 0.0, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 50, t, 0.2);
    if (!this.musicOn) return;
    // Light tarantella-like mandolin loop in A minor / C major
    const prog = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]];
    const melody = [76, 74, 72, 71, 72, 74, 76, 79, 77, 76, 74, 72, 71, 72, 74, 71];
    const beat = 60 / 138 / 2;
    while (this.nextNote < t + 0.2) {
      const bar = Math.floor(this.step / 12) % prog.length;
      const chord = prog[bar];
      const k = this.step % 12;
      const when = this.nextNote - t;
      const f = (m) => 440 * Math.pow(2, (m - 69) / 12);
      if (k % 3 === 0) this.tone(f(chord[0] - 12), 0.35, "triangle", 0.35, when, this.musicBus);
      else this.tone(f(chord[k % 3]), 0.16, "triangle", 0.16, when, this.musicBus);
      if (k % 3 === 0 && playing) {
        const m = melody[(Math.floor(this.step / 3)) % melody.length];
        this.tone(f(m), 0.22, "sine", 0.14, when, this.musicBus);
        this.tone(f(m), 0.2, "sine", 0.1, when + beat / 2, this.musicBus);
      }
      this.nextNote += beat;
      this.step++;
    }
  }
}
