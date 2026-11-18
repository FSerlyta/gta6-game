// All sound is synthesized with WebAudio — no audio files, no network. The context
// is created lazily on the first user gesture; every call before that is a no-op,
// so headless screenshot runs stay silent and error-free.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds = 0.5) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, seconds, type = 'sine', volume = 0.2, slideTo = null) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds + 0.02);
  }

  return {
    ensure,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    click() {
      blip(660, 0.06, 'square', 0.08);
    },
    pickup() {
      blip(880, 0.09, 'sine', 0.18);
      setTimeout(() => blip(1318, 0.12, 'sine', 0.16), 70);
    },
    cash() {
      blip(1046, 0.08, 'triangle', 0.2);
      setTimeout(() => blip(1568, 0.14, 'triangle', 0.18), 80);
    },
    punch() {
      if (!ensure()) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.12);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      src.connect(filter).connect(gain).connect(master);
      src.start();
    },
    shot() {
      if (!ensure()) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.18);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.45, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      src.connect(filter).connect(gain).connect(master);
      src.start();
      blip(180, 0.1, 'square', 0.2, 60);
    },
    crash() {
      if (!ensure()) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.35);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      src.connect(filter).connect(gain).connect(master);
      src.start();
    },
    /** Continuous engine hum; call every frame with speed 0..1 (0 silences it). */
    engine(speed) {
      if (!ensure()) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc2 = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineOsc2.type = 'square';
        engineOsc.frequency.value = 55;
        engineOsc2.frequency.value = 28;
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        engineOsc2.connect(filter);
        filter.connect(engineGain).connect(master);
        engineOsc.start();
        engineOsc2.start();
      }
      const target = speed > 0.02 ? 0.05 + speed * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speed * 140, ctx.currentTime, 0.1);
      engineOsc2.frequency.setTargetAtTime(28 + speed * 70, ctx.currentTime, 0.1);
    },
    /** Two-tone police siren; call with true while any police car chases. */
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenLfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 800;
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 0.55;
        lfoGain.gain.value = 160;
        sirenGain.gain.value = 0.045;
        sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
        sirenLfo.start();
      } else if (!on && sirenOsc) {
        const osc = sirenOsc;
        const lfo = sirenLfo;
        const gain = sirenGain;
        sirenOsc = null;
        sirenLfo = null;
        sirenGain = null;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        setTimeout(() => {
          try {
            osc.stop();
            lfo.stop();
          } catch { /* already stopped */ }
        }, 400);
      }
    },
    /** A laid-back bass-and-hat loop that starts on the title screen. */
    startMusic() {
      if (!ensure() || musicTimer) return;
      const bass = [55, 0, 65.4, 0, 49, 0, 58.3, 73.4];
      musicTimer = setInterval(() => {
        if (muted) {
          musicStep += 1;
          return;
        }
        const note = bass[musicStep % bass.length];
        if (note) blip(note, 0.32, 'triangle', 0.11);
        if (musicStep % 2 === 0) {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuffer(0.04);
          const filter = ctx.createBiquadFilter();
          filter.type = 'highpass';
          filter.frequency.value = 6000;
          const gain = ctx.createGain();
          gain.gain.value = 0.03;
          src.connect(filter).connect(gain).connect(master);
          src.start();
        }
        musicStep += 1;
      }, 290);
    },
    stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };
}
