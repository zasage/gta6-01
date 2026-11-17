// All sound is synthesized with WebAudio — no audio files, no network.
// The engine hum follows the car's speed, sirens wail while wanted, and the
// little jingles mark mission beats. Everything is guarded so the game still
// runs with sound off or before the first user gesture.
export function createAudio() {
  const audio = {
    ctx: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenLfo: null,
    musicTimer: 0,
    musicStep: 0,
    enabled: true,
  };

  function ensure() {
    if (audio.ctx || !audio.enabled) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { audio.enabled = false; return; }
      audio.ctx = new Ctx();
      // Engine: a low sawtooth whose pitch follows speed.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 50;
      const engineFilter = audio.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(engineFilter);
      engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.ctx.destination);
      audio.engineOsc.start();
      // Siren: a triangle wailing between two tones.
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'triangle';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenLfo = audio.ctx.createOscillator();
      audio.sirenLfo.type = 'sine';
      audio.sirenLfo.frequency.value = 0.9;
      const lfoGain = audio.ctx.createGain();
      lfoGain.gain.value = 260;
      audio.sirenLfo.connect(lfoGain);
      lfoGain.connect(audio.sirenOsc.frequency);
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.ctx.destination);
      audio.sirenOsc.start();
      audio.sirenLfo.start();
    } catch {
      audio.enabled = false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!audio.ctx || audio.muted) return;
    try {
      const t = audio.ctx.currentTime;
      const osc = audio.ctx.createOscillator();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const gain = audio.ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(audio.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* sound is never worth a crash */ }
  }

  function noise(dur, vol, filterFreq) {
    if (!audio.ctx || audio.muted) return;
    try {
      const t = audio.ctx.currentTime;
      const len = Math.max(1, Math.floor(audio.ctx.sampleRate * dur));
      const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audio.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = audio.ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.ctx.destination);
      src.start(t);
    } catch { /* sound is never worth a crash */ }
  }

  const BASSLINE = [55, 0, 55, 65.4, 55, 0, 82.4, 73.4]; // A1 C2 E2 D2, golden-hour cruise
  function musicStep(dt, driving) {
    if (!audio.ctx || audio.muted) return;
    audio.musicTimer -= dt;
    if (audio.musicTimer > 0) return;
    audio.musicTimer = driving ? 0.21 : 0.34;
    const freq = BASSLINE[audio.musicStep % BASSLINE.length];
    audio.musicStep += 1;
    if (freq > 0) blip(freq, 0.22, 'triangle', 0.05);
    if (audio.musicStep % 4 === 1) blip(220, 0.08, 'sine', 0.03);
  }

  return {
    unlock() { ensure(); if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {}); },
    setMuted(m) {
      audio.muted = m;
      if (audio.ctx) {
        if (audio.engineGain) audio.engineGain.gain.value = 0;
        if (audio.sirenGain) audio.sirenGain.gain.value = 0;
      }
    },
    engine(speedRatio, driving) {
      if (!audio.ctx || audio.muted) return;
      const target = driving ? 0.05 + speedRatio * 0.06 : 0;
      audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.08);
      audio.engineOsc.frequency.setTargetAtTime(48 + speedRatio * 130, audio.ctx.currentTime, 0.08);
    },
    siren(wanted) {
      if (!audio.ctx || audio.muted) return;
      const target = wanted >= 2 ? 0.035 : wanted === 1 ? 0.018 : 0;
      audio.sirenGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.3);
    },
    update(dt, driving, wanted) { musicStep(dt, driving); this.siren(wanted); },
    gunshot() { noise(0.14, 0.3, 2400); },
    crash(strength) { noise(0.2, Math.min(0.4, 0.1 + strength * 0.2), 500); },
    pickup() { blip(660, 0.09, 'sine', 0.14); blip(990, 0.12, 'sine', 0.12); },
    coin() { blip(880, 0.07, 'sine', 0.1, 1320); },
    denied() { blip(140, 0.16, 'square', 0.1, 90); },
    missionStart() { blip(392, 0.12, 'square', 0.1); setTimeout(() => blip(523, 0.14, 'square', 0.1), 120); },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'square', 0.11), i * 110));
    },
    busted() { blip(220, 0.5, 'sawtooth', 0.12, 110); },
  };
}
