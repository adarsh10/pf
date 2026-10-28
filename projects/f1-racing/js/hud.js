import * as THREE from 'three';

export function formatTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const neg = ms < 0;
  ms = Math.abs(ms);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor(ms % 1000);
  return `${neg ? '-' : ''}${m}:${String(s).padStart(2, '0')}.${String(t).padStart(3, '0')}`;
}

export function formatDelta(ms) {
  if (ms == null || !isFinite(ms)) return '--.---';
  const sign = ms >= 0 ? '+' : '-';
  const a = Math.abs(ms) / 1000;
  return `${sign}${a.toFixed(3)}`;
}

export class Hud {
  constructor(track) {
    this.track = track;
    this.el = {
      speed: document.getElementById('speed'),
      gear: document.getElementById('gear'),
      rpmBar: document.getElementById('rpmFill'),
      revLights: document.getElementById('revLights'),
      lapTime: document.getElementById('lapTime'),
      bestTime: document.getElementById('bestTime'),
      lastTime: document.getElementById('lastTime'),
      lapNum: document.getElementById('lapNum'),
      racePos: document.getElementById('racePos'),
      gapAhead: document.getElementById('gapAhead'),
      gapAheadCode: document.getElementById('gapAheadCode'),
      gapBehind: document.getElementById('gapBehind'),
      gapBehindCode: document.getElementById('gapBehindCode'),
      delta: document.getElementById('delta'),
      sector: document.getElementById('sectorTimes'),
      drs: document.getElementById('drsLight'),
      ers: document.getElementById('ersFill'),
      ersPct: document.getElementById('ersPct'),
      throttleBar: document.getElementById('throttleFill'),
      brakeBar: document.getElementById('brakeFill'),
      steerNeedle: document.getElementById('steerNeedle'),
      cornerName: document.getElementById('cornerName'),
      flash: document.getElementById('flashMsg'),
      tyre: document.getElementById('tyreTemp'),
      fuel: document.getElementById('fuelVal'),
      gforce: document.getElementById('gforce'),
      gdot: document.getElementById('gdot'),
      camName: document.getElementById('camName'),
    };

    // rev light strip
    for (let i = 0; i < 15; i++) {
      const d = document.createElement('i');
      d.className = i < 5 ? 'rl green' : i < 10 ? 'rl red' : 'rl blue';
      this.el.revLights.appendChild(d);
    }
    this.rl = [...this.el.revLights.children];

    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this._prepMap();
    this.flashUntil = 0;

    this.gauge = document.getElementById('gaugeCanvas');
    this.gaugeCtx = this.gauge.getContext('2d');
    // The needles chase the real values so they sweep instead of snapping,
    // which is what makes a dial read as a dial.
    this.needleRpm = 0;
    this.needleSpeed = 0;
    this._prepGauges();
  }

  /**
   * The dial faces never change, so the bezel, the tick marks and the numbers
   * are drawn once into an offscreen canvas and blitted every frame. Only the
   * needles and the digital readouts are redrawn.
   */
  _prepGauges() {
    const w = this.gauge.width, h = this.gauge.height;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const g = off.getContext('2d');

    this.dials = [
      { cx: w * 0.255, cy: h * 0.50, r: h * 0.43, max: 15, redline: 12, step: 3, label: 'RPM ×1000' },
      { cx: w * 0.745, cy: h * 0.50, r: h * 0.43, max: 360, redline: null, step: 60, label: 'KM/H' },
    ];

    // Needles sweep from 7 o'clock round to 5 o'clock.
    this.A0 = Math.PI * 0.75;
    this.A1 = Math.PI * 2.25;

    for (const d of this.dials) {
      const { cx, cy, r } = d;

      // Face
      const grad = g.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
      grad.addColorStop(0, 'rgba(30,36,48,0.92)');
      grad.addColorStop(1, 'rgba(8,11,17,0.95)');
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.stroke();

      // Redline band
      if (d.redline != null) {
        g.beginPath();
        g.arc(cx, cy, r * 0.86,
          this.A0 + (this.A1 - this.A0) * (d.redline / d.max), this.A1);
        g.lineWidth = r * 0.10;
        g.strokeStyle = 'rgba(255,43,43,0.55)';
        g.stroke();
      }

      // Ticks and numbers
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const minors = d.max / d.step * 2;
      for (let i = 0; i <= minors; i++) {
        const frac = i / minors;
        const a = this.A0 + (this.A1 - this.A0) * frac;
        const major = i % 2 === 0;
        const from = r * (major ? 0.70 : 0.78);
        const to = r * 0.90;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * from, cy + Math.sin(a) * from);
        g.lineTo(cx + Math.cos(a) * to, cy + Math.sin(a) * to);
        g.lineWidth = major ? 2.4 : 1.1;
        const hot = d.redline != null && frac * d.max >= d.redline;
        g.strokeStyle = hot ? '#ff6b6b' : 'rgba(255,255,255,0.62)';
        g.stroke();
        if (major) {
          g.fillStyle = hot ? '#ff8f8f' : 'rgba(255,255,255,0.78)';
          g.font = `600 ${Math.round(r * 0.19)}px 'SF Mono', Consolas, monospace`;
          g.fillText(String(Math.round(frac * d.max)),
            cx + Math.cos(a) * r * 0.56, cy + Math.sin(a) * r * 0.56);
        }
      }

      // The unit label sits high, inside the ring of numbers. The bottom of
      // the face is left clear for the digital readout, which is why the sweep
      // stops at 5 o'clock.
      g.fillStyle = 'rgba(255,255,255,0.42)';
      g.font = `600 ${Math.round(r * 0.14)}px system-ui, sans-serif`;
      g.fillText(d.label, cx, cy - r * 0.34);
    }

    this.gaugeBg = off;
  }

  drawGauges(car, dt) {
    const g = this.gaugeCtx;
    const w = this.gauge.width, h = this.gauge.height;

    // Chase, with a hard cap so a big frame cannot overshoot past the target.
    const k = Math.min(1, dt * 12);
    this.needleRpm += (car.rpm - this.needleRpm) * k;
    this.needleSpeed += (car.speedKph - this.needleSpeed) * k;

    g.clearRect(0, 0, w, h);
    g.drawImage(this.gaugeBg, 0, 0);

    const values = [this.needleRpm / 1000, this.needleSpeed];
    for (let i = 0; i < 2; i++) {
      const d = this.dials[i];
      const frac = THREE.MathUtils.clamp(values[i] / d.max, 0, 1);
      const a = this.A0 + (this.A1 - this.A0) * frac;
      const hot = d.redline != null && values[i] >= d.redline;
      const col = hot ? '#ff3b3b' : '#00e5ff';

      g.save();
      g.translate(d.cx, d.cy);
      g.rotate(a);
      g.beginPath();
      g.moveTo(-d.r * 0.14, 0);
      g.lineTo(d.r * 0.88, d.r * 0.028);
      g.lineTo(d.r * 0.88, -d.r * 0.028);
      g.closePath();
      g.fillStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 10;
      g.fill();
      g.restore();

      // Hub
      g.beginPath();
      g.arc(d.cx, d.cy, d.r * 0.10, 0, Math.PI * 2);
      g.fillStyle = '#12161f';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(255,255,255,0.30)';
      g.stroke();

      // Digital readout, in the gap the needle sweep leaves at the bottom.
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = hot ? '#ff8f8f' : '#e8edf6';
      g.font = `700 ${Math.round(d.r * 0.26)}px 'SF Mono', Consolas, monospace`;
      g.fillText(
        i === 0 ? String(Math.round(car.rpm)) : String(Math.round(car.speedKph)),
        d.cx, d.cy + d.r * 0.50);
    }
  }

  _prepMap() {
    const pts = this.track.points;
    const box = new THREE.Box3().setFromPoints(pts);
    const w = box.max.x - box.min.x;
    const h = box.max.z - box.min.z;
    const size = this.map.width;
    const pad = 14;
    const s = Math.min((size - pad * 2) / w, (size - pad * 2) / h);
    this.mapScale = s;
    this.mapOx = pad + (size - pad * 2 - w * s) / 2 - box.min.x * s;
    this.mapOy = pad + (size - pad * 2 - h * s) / 2 - box.min.z * s;

    // Pre-render the static circuit outline
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const g = off.getContext('2d');
    g.lineJoin = g.lineCap = 'round';

    const path = (lw, color) => {
      g.beginPath();
      for (let i = 0; i <= pts.length; i++) {
        const p = pts[i % pts.length];
        const x = p.x * s + this.mapOx, y = p.z * s + this.mapOy;
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.lineWidth = lw; g.strokeStyle = color; g.stroke();
    };
    path(7, 'rgba(255,255,255,0.14)');
    path(4, '#7d8798');

    // DRS zones highlighted
    g.lineWidth = 4.5;
    g.strokeStyle = '#00e676';
    const n = pts.length;
    const si = this.track.startIndex;
    for (const [a, b] of this.track.drsZones) {
      g.beginPath();
      const from = (si + Math.floor(a * n)) % n;
      const to = (si + Math.floor(b * n)) % n;
      let i = from;
      let guard = 0;
      while (guard++ < n) {
        const p = pts[i % n];
        const x = p.x * s + this.mapOx, y = p.z * s + this.mapOy;
        guard === 1 ? g.moveTo(x, y) : g.lineTo(x, y);
        if (i % n === to) break;
        i++;
      }
      g.stroke();
    }

    // start/finish tick
    const p0 = pts[si], p1 = pts[(si + 6) % n];
    const dx = p1.x - p0.x, dz = p1.z - p0.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    g.beginPath();
    g.moveTo((p0.x + nx * 22) * s + this.mapOx, (p0.z + nz * 22) * s + this.mapOy);
    g.lineTo((p0.x - nx * 22) * s + this.mapOx, (p0.z - nz * 22) * s + this.mapOy);
    g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.stroke();

    this.mapBg = off;
  }

  flash(text, ms = 1600, color = '#ffe066') {
    this.el.flash.textContent = text;
    this.el.flash.style.color = color;
    this.el.flash.classList.add('show');
    this.flashUntil = performance.now() + ms;
  }

  update(car, timing, state, dt) {
    const e = this.el;
    e.speed.textContent = Math.round(car.speedKph);
    e.gear.textContent = car.reversing ? 'R' : car.gear;

    const revFrac = THREE.MathUtils.clamp((car.rpm - 4000) / (15000 - 4000), 0, 1);
    e.rpmBar.style.width = `${revFrac * 100}%`;
    const lit = Math.floor(THREE.MathUtils.clamp((car.rpm - 6000) / 9000, 0, 1) * 15);
    const blink = car.rpm > 14700 && Math.floor(performance.now() / 60) % 2 === 0;
    for (let i = 0; i < 15; i++) this.rl[i].classList.toggle('on', blink || i < lit);

    e.lapTime.textContent = formatTime(timing.current);
    e.bestTime.textContent = formatTime(timing.best);
    e.lastTime.textContent = formatTime(timing.last);
    e.lapNum.textContent = timing.lap;

    const st = state.standing;
    if (st) {
      e.racePos.textContent = `${st.position}/${st.total}`;
      e.gapAheadCode.textContent = st.ahead ? st.ahead.code : '---';
      e.gapAhead.textContent = st.ahead ? `-${st.ahead.gap.toFixed(1)}` : '--.-';
      e.gapBehindCode.textContent = st.behind ? st.behind.code : '---';
      e.gapBehind.textContent = st.behind ? `+${st.behind.gap.toFixed(1)}` : '--.-';
    }

    if (timing.delta == null) {
      e.delta.textContent = '--.---';
      e.delta.className = 'delta';
    } else {
      e.delta.textContent = formatDelta(timing.delta);
      e.delta.className = 'delta ' + (timing.delta <= 0 ? 'good' : 'bad');
    }

    for (let i = 0; i < 3; i++) {
      const cell = this.sectorCell(i);
      cell.textContent = timing.sectors[i] != null ? formatTime(timing.sectors[i]).replace(/^0:/, '') : '--.---';
      cell.className = 'sec ' + (timing.sectorState[i] || '');
    }

    e.drs.className = 'drs' + (car.drs ? ' active' : car.drsAvailable ? ' ready' : '');
    e.drs.textContent = car.drs ? 'DRS OPEN' : car.drsAvailable ? 'DRS READY' : 'DRS';

    const ersPct = car.ers / 4.0e6;
    e.ers.style.width = `${ersPct * 100}%`;
    e.ers.classList.toggle('deploy', car.ersDeploy);
    e.ersPct.textContent = `${Math.round(ersPct * 100)}%`;

    e.throttleBar.style.height = `${car.throttle * 100}%`;
    e.brakeBar.style.height = `${car.brake * 100}%`;
    e.steerNeedle.style.transform = `rotate(${(car.steer / 0.30) * 55}deg)`;

    e.tyre.textContent = `${Math.round(car.tyreTemp)}°C`;
    e.tyre.style.color = car.tyreTemp > 118 ? '#ff5555' : car.tyreTemp < 78 ? '#66aaff' : '#7dffa0';
    e.fuel.textContent = `${car.fuel.toFixed(1)} kg`;

    e.gforce.textContent = `${Math.abs(car.lateralG).toFixed(1)}g`;
    const gx = THREE.MathUtils.clamp(car.lateralG / 5, -1, 1) * 26;
    const gy = THREE.MathUtils.clamp(-car.longG / 5, -1, 1) * 26;
    e.gdot.style.transform = `translate(${gx}px, ${gy}px)`;

    const corner = this.track.cornerNameAt(state.fraction);
    e.cornerName.textContent = corner || '';

    e.camName.textContent = state.cameraName;

    if (this.flashUntil && performance.now() > this.flashUntil) {
      this.el.flash.classList.remove('show');
      this.flashUntil = 0;
    }

    this.drawGauges(car, dt);
    this.drawMap(car);
  }

  sectorCell(i) {
    if (!this._cells) this._cells = [...this.el.sector.querySelectorAll('.sec')];
    return this._cells[i];
  }

  drawMap(car) {
    const g = this.mapCtx;
    g.clearRect(0, 0, this.map.width, this.map.height);
    g.drawImage(this.mapBg, 0, 0);
    const x = car.position.x * this.mapScale + this.mapOx;
    const y = car.position.z * this.mapScale + this.mapOy;
    g.save();
    g.translate(x, y);
    g.rotate(-car.yaw + Math.PI);
    g.fillStyle = '#ff2b3d';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.2, 5);
    g.lineTo(-4.2, 5);
    g.closePath();
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 1.2;
    g.stroke();
    g.restore();
  }
}
