/**
 * Synthesised 1.6 litre V6 turbo-hybrid soundtrack.
 *
 * What makes a modern F1 car sound like an F1 car rather than a junior single
 * seater is not the pitch — it is the timbre:
 *
 *  - the exhaust is a narrow *pulse train*, not a sawtooth, so the spectrum is
 *    dense and buzzy right up to the top of the audible range;
 *  - three banks of *fixed* formant resonances sit on top of it, which is what
 *    gives the engine its vocal, screaming quality as the pitch sweeps past
 *    them. A single moving lowpass (what a naive synth does) sounds like a
 *    vacuum cleaner, which is exactly the "artificial Formula 3" problem;
 *  - the two cylinder banks are never perfectly in phase, so the note beats
 *    slightly. Three detuned oscillators reproduce that;
 *  - a hard-edged waveshaper adds the intermodulation rasp of a real exhaust;
 *  - the turbo sits well above the engine note and only spools with load, and
 *    dumps through the wastegate on a lift;
 *  - the MGU-K adds a pure electric whine whenever ERS is deploying.
 *
 * Nothing here is sampled — it is all generated at runtime.
 */

/** Firing events per revolution for a four-stroke V6: six cylinders / two revs. */
const FIRING_ORDER = 3;

/** Fixed exhaust resonances, in Hz. These do not move with engine speed. */
const FORMANTS = [
  { freq: 780, q: 3.2, gain: 9 },
  { freq: 1650, q: 4.0, gain: 11 },
  { freq: 3100, q: 5.0, gain: 8 },
  { freq: 5200, q: 6.0, gain: 5 },
];

/** Slight detune between the oscillator layers, in cents. */
const DETUNE = [0, -11, 14];

/**
 * Master level for the whole engine. Deliberately well below unity: the
 * commentary rides on the browser's speech synthesiser, which is capped at
 * volume 1, so the only way to keep the commentators audible over a V6 at
 * fifteen thousand revs is to keep the V6 down.
 */
const LEVEL = 0.16;

/** How far the engine drops while a commentator is talking. */
const DUCK = 0.3;

export class EngineAudio {
  constructor() {
    this.ready = false;
    this.enabled = true;
    this.ducked = false;
    this._lastThrottle = 0;
    this._lastRpm = 0;
    this._running = 0;
  }

  start() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(this.master);
    this.bus = comp;

    this._noiseBuffer = this._makeNoise(ctx);
    this._buildEngine(ctx);
    this._buildTurbo(ctx);
    this._buildElectric(ctx);
    this._buildNoiseLayers(ctx);
    this._buildRain(ctx);

    this.ready = true;
    this._applyLevel(0.4);
  }

  /** Current target level, accounting for mute and commentary ducking. */
  _applyLevel(ramp = 0.15) {
    if (!this.ready) return;
    const level = this.enabled ? (this.ducked ? LEVEL * DUCK : LEVEL) : 0;
    this.master.gain.setTargetAtTime(level, this.ctx.currentTime, ramp);
  }

  /**
   * Pull the engine down while a commentator is speaking. Real broadcasts do
   * exactly this — the speech synthesiser is capped at volume 1, so the only
   * way to make the commentary louder is to get out of its way.
   */
  duck(on) {
    if (this.ducked === on) return;
    this.ducked = on;
    this._applyLevel(on ? 0.08 : 0.35);
  }

  _makeNoise(ctx) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _loopNoise(ctx) {
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    src.start();
    return src;
  }

  /**
   * Exhaust pulse train -> waveshaper -> formant bank -> tract lowpass.
   */
  _buildEngine(ctx) {
    // A narrow pulse: harmonics fall off slowly, so the note stays bright and
    // aggressive all the way up. Alternating sign spreads the phase so the
    // peaks do not stack into a click.
    const N = 48;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let k = 1; k < N; k++) {
      const amp = Math.pow(k, -0.62) * Math.exp(-k / 34);
      real[k] = amp * Math.cos(k * 1.7);
      imag[k] = amp * Math.sin(k * 1.7);
    }
    const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.55;

    // Sub-octave layer for the chest-thump of the crank order.
    this.sub = ctx.createOscillator();
    this.sub.type = 'triangle';
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.22;
    this.sub.connect(this.subGain);
    this.subGain.connect(this.engineGain);
    this.sub.start();

    this.layers = DETUNE.map((cents, i) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.3;
      o.connect(g);
      g.connect(this.engineGain);
      o.start();
      return { o, g, base: i === 0 ? 0.5 : 0.3 };
    });

    // Asymmetric soft clip: adds even harmonics and the metallic edge.
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.6) * 0.82 + Math.tanh(x * 7) * 0.18;
    }
    shaper.curve = curve;
    shaper.oversample = '4x';
    this.shaper = shaper;

    this.drive = ctx.createGain();
    this.drive.gain.value = 1.0;
    this.engineGain.connect(this.drive);
    this.drive.connect(shaper);

    // Formant bank in parallel with the dry signal, so the resonances colour
    // the note without swallowing it.
    this.formants = FORMANTS.map((f) => {
      const b = ctx.createBiquadFilter();
      b.type = 'peaking';
      b.frequency.value = f.freq;
      b.Q.value = f.q;
      b.gain.value = f.gain;
      return b;
    });
    let node = shaper;
    for (const f of this.formants) { node.connect(f); node = f; }

    // Overall brightness: closes on a trailing throttle, opens under power.
    this.tract = ctx.createBiquadFilter();
    this.tract.type = 'lowpass';
    this.tract.frequency.value = 4000;
    this.tract.Q.value = 0.9;
    node.connect(this.tract);

    // A little high-shelf sparkle keeps the top end from sounding dull.
    this.air = ctx.createBiquadFilter();
    this.air.type = 'highshelf';
    this.air.frequency.value = 4500;
    this.air.gain.value = 4;
    this.tract.connect(this.air);

    // Running gate. A synthesised engine held at idle is a pure, unchanging
    // tone, and a pure unchanging tone reads to the ear as a hum rather than a
    // motor — so the whole exhaust bed is muted until the car is actually
    // doing something. See `update`.
    this.engineOut = ctx.createGain();
    this.engineOut.gain.value = 0;
    this.air.connect(this.engineOut);
    this.engineOut.connect(this.bus);
  }

  /** Compressor whistle plus a wastegate dump on every lift. */
  _buildTurbo(ctx) {
    this.turbo = ctx.createOscillator();
    this.turbo.type = 'sawtooth';
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 9;
    this.turboFilter = bp;
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turbo.connect(bp);
    bp.connect(this.turboGain);
    this.turboGain.connect(this.bus);
    this.turbo.start();

    // Wastegate: filtered noise, opened briefly when the driver lifts.
    this.gate = this._loopNoise(ctx);
    const gf = ctx.createBiquadFilter();
    gf.type = 'bandpass';
    gf.frequency.value = 2600;
    gf.Q.value = 1.1;
    this.gateGain = ctx.createGain();
    this.gateGain.gain.value = 0;
    this.gate.connect(gf);
    gf.connect(this.gateGain);
    this.gateGain.connect(this.bus);
  }

  /** MGU-K: a clean electric whine that only appears under deployment. */
  _buildElectric(ctx) {
    this.mgu = ctx.createOscillator();
    this.mgu.type = 'triangle';
    this.mguGain = ctx.createGain();
    this.mguGain.gain.value = 0;
    this.mgu.connect(this.mguGain);
    this.mguGain.connect(this.bus);
    this.mgu.start();
  }

  _buildNoiseLayers(ctx) {
    // Wind over the halo.
    this.wind = this._loopNoise(ctx);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 480;
    this.windFilter.Q.value = 0.55;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.bus);

    // Tyre scrub.
    this.scrub = this._loopNoise(ctx);
    this.scrubFilter = ctx.createBiquadFilter();
    this.scrubFilter.type = 'bandpass';
    this.scrubFilter.frequency.value = 2400;
    this.scrubFilter.Q.value = 4.5;
    this.scrubGain = ctx.createGain();
    this.scrubGain.gain.value = 0;
    this.scrub.connect(this.scrubFilter);
    this.scrubFilter.connect(this.scrubGain);
    this.scrubGain.connect(this.bus);

    // Overrun crackle: short bursts of hard-filtered noise on the exhaust.
    this.crackle = this._loopNoise(ctx);
    const cf = ctx.createBiquadFilter();
    cf.type = 'bandpass';
    cf.frequency.value = 1400;
    cf.Q.value = 0.8;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    this.crackle.connect(cf);
    cf.connect(this.crackleGain);
    this.crackleGain.connect(this.bus);
  }

  /**
   * Rain: broadband hiss for the downpour with a low rumble under it. Sits on
   * the master rather than the bus, so it is not ducked away under commentary
   * and not squashed by the engine compressor.
   */
  _buildRain(ctx) {
    this.rain = this._loopNoise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rain.connect(hp);
    hp.connect(lp);
    lp.connect(this.rainGain);
    this.rainGain.connect(this.master);
  }

  /** Fade the rain bed in or out. */
  setRain(on) {
    if (!this.ready) return;
    this.rainGain.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.7);
  }

  setEnabled(on) {
    this.enabled = on;
    this._applyLevel();
  }

  /** Fired on an upshift: the ignition cut punches a hole in the note. */
  shift() {
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    const g = this.engineGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.12, t);
    g.linearRampToValueAtTime(0.55, t + 0.075);
    this._burst(this.crackleGain, 0.30, 0.09, t);
  }

  /** Schedules a short envelope on a gain node. */
  _burst(node, peak, decay, t) {
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(peak, t);
    node.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    node.gain.setValueAtTime(0, t + decay);
  }

  update(car, dt) {
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    const rpm = car.rpm;
    const load = car.throttle;
    const v = car.speed;

    // Is the car running at all? Off the throttle and stationary it goes
    // silent, because a held synthetic note is a hum, not an engine. Coming on
    // is fast so a launch is not clipped; going off is slower so the note dies
    // away rather than being cut.
    const running = Math.min(1, Math.max(load * 1.8, v / 3));
    this.engineOut.gain.setTargetAtTime(
      running, t, running > this._running ? 0.02 : 0.09);
    this._running = running;

    // Engine order. Glide fast enough to track a downshift without zippering.
    const f0 = (rpm / 60) * FIRING_ORDER;
    for (const l of this.layers) {
      l.o.frequency.setTargetAtTime(f0, t, 0.012);
      l.g.gain.setTargetAtTime(l.base * (0.4 + load * 0.6), t, 0.04);
    }
    this.sub.frequency.setTargetAtTime(f0 * 0.5, t, 0.012);
    // No floor on the sub: a standing low triangle is the most hum-like thing
    // in the whole rig, so it only exists under power.
    this.subGain.gain.setTargetAtTime(load * 0.22, t, 0.05);

    // Under power the exhaust is driven harder into the shaper, which is what
    // turns the note from a hum into a scream.
    this.drive.gain.setTargetAtTime(0.8 + load * 1.9, t, 0.05);

    // The formants shift only slightly, and far less than the note does.
    this.formants.forEach((b, i) => {
      b.gain.setTargetAtTime(FORMANTS[i].gain * (0.45 + load * 0.75), t, 0.08);
    });
    this.tract.frequency.setTargetAtTime(2200 + load * 6500 + rpm * 0.22, t, 0.05);

    // Turbo tracks shaft speed, which lags the engine and needs load to spool.
    // Nothing at zero load: an idling turbo whistle is another standing tone.
    this.turboFilter.frequency.setTargetAtTime(3400 + rpm * 0.62, t, 0.09);
    this.turbo.frequency.setTargetAtTime(160 + rpm * 0.09, t, 0.09);
    this.turboGain.gain.setTargetAtTime(load * 0.06 * Math.min(1, rpm / 9000), t, 0.14);

    // Wastegate dump and overrun crackle when the driver comes off the throttle.
    const lifted = this._lastThrottle > 0.55 && load < 0.15;
    if (lifted && rpm > 7000) {
      this._burst(this.gateGain, 0.16, 0.22, t);
      this._burst(this.crackleGain, 0.20 * Math.min(1, rpm / 12000), 0.35, t);
    }

    // MGU-K whine: high, pure, and only while deploying.
    this.mgu.frequency.setTargetAtTime(2400 + v * 22, t, 0.1);
    this.mguGain.gain.setTargetAtTime(car.ersDeploy ? 0.035 : 0, t, 0.12);

    this.windGain.gain.setTargetAtTime(Math.min(0.16, (v / 90) * 0.16), t, 0.1);
    this.windFilter.frequency.setTargetAtTime(300 + v * 9, t, 0.1);

    const scrubAmt = Math.min(0.28, car.slip * 0.32 * Math.min(1, v / 15)) +
                     (car.offTrack ? Math.min(0.12, v / 80) : 0);
    this.scrubGain.gain.setTargetAtTime(scrubAmt, t, 0.05);
    this.scrubFilter.frequency.setTargetAtTime(1600 + car.slip * 2200, t, 0.06);

    this._lastThrottle = load;
    this._lastRpm = rpm;
  }
}
