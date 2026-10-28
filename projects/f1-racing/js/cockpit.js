import * as THREE from 'three';

const TEAM = {
  primary: 0xc8102e,
  secondary: 0x14161c,
  accent: 0xf2f2f2,
};
function roundedRingShape(outer, inner, flatTop) {
  const shape = new THREE.Shape();
  const seg = 48;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    let x = Math.cos(a) * outer;
    let y = Math.sin(a) * outer;
    if (flatTop && y > outer * 0.42) y = outer * 0.42;
    if (y < -outer * 0.72) y = -outer * 0.72;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  for (let i = seg; i >= 0; i--) {
    const a = (i / seg) * Math.PI * 2;
    let x = Math.cos(a) * inner;
    let y = Math.sin(a) * inner * 0.85;
    if (y > inner * 0.2) y = inner * 0.2;
    i === seg ? hole.moveTo(x, y) : hole.lineTo(x, y);
  }
  shape.holes.push(hole);
  return shape;
}

/**
 * Builds the driver-eye cockpit: chassis surround, halo, mirrors, front
 * tyres/suspension and a fully instrumented steering wheel.
 */
export class Cockpit {
  constructor(entry = TEAM) {
    this.group = new THREE.Group();
    this.wheelGroup = new THREE.Group();
    this.leds = [];
    this.liveryMats = [];
    this.accentMats = [];
    this._buildChassis();
    this._buildHalo();
    this._buildMirrors();
    this._buildWheel();
    this._buildFrontEnd();
    this._displayClock = 0;
    this.setTeam(entry);
  }

  /** Repaints the visible bodywork when the driver picks a team. */
  setTeam(entry) {
    if (!entry) return;
    this.entry = entry;
    for (const m of this.liveryMats) m.color.setHex(entry.primary);
    for (const m of this.accentMats) m.color.setHex(entry.accent);
  }

  _buildChassis() {
    const carbon = new THREE.MeshStandardMaterial({
      color: 0x121418, roughness: 0.42, metalness: 0.55,
    });
    const livery = new THREE.MeshStandardMaterial({
      color: TEAM.primary, roughness: 0.35, metalness: 0.3,
    });
    this.liveryMats.push(livery);

    // Cockpit side walls
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 1.5), carbon);
      wall.position.set(side * 0.42, -0.28, -0.35);
      wall.rotation.z = side * 0.1;
      this.group.add(wall);

      const top = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 1.4), livery);
      top.position.set(side * 0.44, -0.03, -0.4);
      top.rotation.z = side * 0.16;
      this.group.add(top);
    }

    // Dash bulkhead ahead of the driver — kept low so it never blocks the apex
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.13, 0.30), carbon);
    dash.position.set(0, -0.45, -1.00);
    dash.rotation.x = 0.14;
    this.group.add(dash);

    // Nose tapering away toward the front wing
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.085, 2.7, 12), livery);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.54, -2.5);
    this.group.add(nose);

    const noseTip = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.055, 1.0, 10), carbon);
    noseTip.rotation.x = Math.PI / 2;
    noseTip.position.set(0, -0.56, -4.25);
    this.group.add(noseTip);

    // Front wing edges just visible at the bottom of the frame
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.5, metalness: 0.4 });
    for (const side of [-1, 1]) {
      const ep = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.9), wingMat);
      ep.position.set(side * 0.94, -0.68, -4.6);
      this.group.add(ep);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.03, 0.55), wingMat);
    wing.position.set(0, -0.80, -4.65);
    wing.rotation.x = 0.08;
    this.group.add(wing);
  }

  _buildHalo() {
    const haloMat = new THREE.MeshStandardMaterial({
      color: 0x0a0b0e, roughness: 0.35, metalness: 0.75,
    });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.46, -0.05, 0.30),
      new THREE.Vector3(-0.52, 0.20, -0.25),
      new THREE.Vector3(-0.40, 0.30, -0.78),
      new THREE.Vector3(0.00, 0.32, -1.00),
      new THREE.Vector3(0.40, 0.30, -0.78),
      new THREE.Vector3(0.52, 0.20, -0.25),
      new THREE.Vector3(0.46, -0.05, 0.30),
    ]);
    const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.024, 8, false), haloMat);
    this.group.add(halo);

    // Central pillar: the real thing is a ~40 mm blade, thin enough that the
    // driver's brain edits it out. Keep it slim so it never masks an apex.
    // Slim enough to sit in the driver's eyeline without blotting out the
    // apex, as the real halo strut does.
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.015, 0.60, 8), haloMat);
    strut.position.set(0, 0.02, -0.99);
    strut.rotation.x = 0.1;
    this.group.add(strut);

    // Onboard camera pods either side of the airbox line
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 0.16),
        new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4 })
      );
      pod.position.set(side * 0.30, 0.31, -0.80);
      this.group.add(pod);
    }
  }

  _buildMirrors() {
    const armMat = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.5, metalness: 0.5 });
    const glassMat = () => new THREE.MeshBasicMaterial({ color: 0x2a3a52 });
    this.mirrors = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.03), armMat);
      arm.position.set(side * 0.62, -0.02, -0.12);
      this.group.add(arm);

      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.10, 0.05), armMat);
      housing.position.set(side * 0.74, -0.01, -0.12);
      housing.rotation.y = side * 0.30;
      this.group.add(housing);

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.075), glassMat());
      glass.position.set(side * 0.735, -0.01, -0.094);
      glass.rotation.y = side * 0.30 + Math.PI;
      this.group.add(glass);
      this.mirrors.push(glass);
    }
  }

  _buildWheel() {
    const wheel = this.wheelGroup;
    wheel.position.set(0, -0.27, -0.44);
    wheel.rotation.x = -0.55;
    this.group.add(wheel);

    const rimMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.55, metalness: 0.35 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.95 });

    const shape = roundedRingShape(0.135, 0.088, true);
    const rim = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.026, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 24 }),
      rimMat
    );
    rim.position.z = -0.013;
    wheel.add(rim);

    // Grips
    for (const side of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.085, 4, 8), gripMat);
      grip.position.set(side * 0.115, -0.028, 0.018);
      grip.rotation.z = side * 0.20;
      wheel.add(grip);
    }

    // Central face
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.115, 0.018), rimMat);
    face.position.set(0, -0.006, 0.006);
    wheel.add(face);

    // Rev LED strip
    const ledColors = [0x00ff66, 0x00ff66, 0x00ff66, 0x00ff66, 0x00ff66,
                       0xff2200, 0xff2200, 0xff2200, 0xff2200, 0xff2200,
                       0x3355ff, 0x3355ff, 0x3355ff, 0xff00ff, 0xff00ff];
    for (let i = 0; i < 15; i++) {
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.0085, 0.011, 0.004),
        new THREE.MeshBasicMaterial({ color: ledColors[i] })
      );
      led.position.set(-0.0665 + i * 0.0095, 0.049, 0.017);
      led.userData.color = new THREE.Color(ledColors[i]);
      led.material.color.setRGB(0.05, 0.05, 0.05);
      wheel.add(led);
      this.leds.push(led);
    }

    // Display screen
    const [canvas, ctx] = [document.createElement('canvas'), null];
    canvas.width = 512; canvas.height = 320;
    this.dashCanvas = canvas;
    this.dashCtx = canvas.getContext('2d');
    this.dashTexture = new THREE.CanvasTexture(canvas);
    this.dashTexture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.135, 0.084),
      new THREE.MeshBasicMaterial({ map: this.dashTexture })
    );
    screen.position.set(0, -0.005, 0.016);
    wheel.add(screen);

    // Rotary dials and buttons
    const dialMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.6, metalness: 0.4 });
    for (const [x, y, c] of [[-0.095, -0.045, 0xffcc00], [0.095, -0.045, 0x00aaff],
                             [-0.095, 0.028, 0xff3333], [0.095, 0.028, 0x22cc55]]) {
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.012, 12), dialMat);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(x, y, 0.016);
      wheel.add(dial);
      const cap = new THREE.Mesh(
        new THREE.CircleGeometry(0.0085, 12),
        new THREE.MeshBasicMaterial({ color: c })
      );
      cap.position.set(x, y, 0.023);
      wheel.add(cap);
    }
    const btnColors = [0xff2222, 0x22ff88, 0x2288ff, 0xffdd22, 0xff8822, 0xffffff];
    for (let i = 0; i < 6; i++) {
      const btn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8),
        new THREE.MeshBasicMaterial({ color: btnColors[i] })
      );
      btn.rotation.x = Math.PI / 2;
      btn.position.set(-0.028 + (i % 3) * 0.028, -0.050 + Math.floor(i / 3) * -0.0, 0.016);
      btn.position.x = -0.028 + (i % 3) * 0.028;
      btn.position.y = i < 3 ? -0.050 : 0.043;
      wheel.add(btn);
    }
    this.drsButton = wheel.children[wheel.children.length - 6];

    // Shift paddles behind the wheel
    const paddleMat = new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.5, metalness: 0.5 });
    this.paddles = [];
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, 0.035), paddleMat);
      p.position.set(side * 0.088, -0.012, -0.036);
      p.rotation.z = side * 0.25;
      wheel.add(p);
      this.paddles.push(p);
    }
  }

  _buildFrontEnd() {
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.95 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x33373f, roughness: 0.4, metalness: 0.8 });
    const armMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.45, metalness: 0.6 });

    this.frontWheels = [];
    for (const side of [-1, 1]) {
      const hub = new THREE.Group();
      hub.position.set(side * 0.92, -0.62, -1.55);
      this.group.add(hub);

      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.31, 22), tyreMat);
      tyre.rotation.z = Math.PI / 2;
      hub.add(tyre);

      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 18), rimMat);
      rim.rotation.z = Math.PI / 2;
      hub.add(rim);

      // Soft-compound sidewall band
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.335, 0.012, 6, 26),
        new THREE.MeshBasicMaterial({ color: 0xd4232c })
      );
      band.rotation.y = Math.PI / 2;
      band.position.x = side * -0.155;
      hub.add(band);

      // Aero wheel cover in the team's contrast colour
      const coverMat = new THREE.MeshStandardMaterial({
        color: TEAM.accent, roughness: 0.3, metalness: 0.55, side: THREE.DoubleSide,
      });
      this.accentMats.push(coverMat);
      const cover = new THREE.Mesh(new THREE.CircleGeometry(0.235, 22), coverMat);
      cover.rotation.y = Math.PI / 2;
      cover.position.x = side * -0.158;
      hub.add(cover);

      this.frontWheels.push(hub);

      // Wishbones running back to the chassis
      for (const [dy, dz] of [[0.10, 0.30], [-0.10, 0.26]]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.62, 6), armMat);
        arm.position.set(side * 0.60, -0.62 + dy, -1.55 + dz);
        arm.rotation.z = Math.PI / 2;
        arm.rotation.y = side * 0.42;
        this.group.add(arm);
      }
    }
  }

  /** Refresh the wheel-mounted display. */
  updateDisplay(state) {
    const g = this.dashCtx;
    const W = 512, H = 320;
    g.fillStyle = '#050608';
    g.fillRect(0, 0, W, H);

    // rev bar
    const revFrac = THREE.MathUtils.clamp(
      (state.rpm - 4000) / (state.maxRpm - 4000), 0, 1);
    for (let i = 0; i < 24; i++) {
      const on = i / 24 < revFrac;
      const hue = i < 14 ? '#0f0' : i < 20 ? '#f22' : '#c0f';
      g.fillStyle = on ? hue : '#161a20';
      g.fillRect(14 + i * 20, 12, 15, 22);
    }

    // gear
    g.fillStyle = '#ffffff';
    g.font = 'bold 150px "Arial Black", Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(state.gear, W / 2, 150);

    // speed
    g.font = 'bold 46px Arial';
    g.fillStyle = '#00e5ff';
    g.textAlign = 'left';
    g.fillText(String(Math.round(state.kph)), 16, 150);
    g.font = 'bold 20px Arial';
    g.fillStyle = '#77889a';
    g.fillText('KM/H', 18, 186);

    // lap time
    g.textAlign = 'right';
    g.font = 'bold 34px "Courier New", monospace';
    g.fillStyle = '#ffe066';
    g.fillText(state.lapTime, W - 16, 140);
    g.font = 'bold 18px Arial';
    g.fillStyle = '#77889a';
    g.fillText(`LAP ${state.lap}`, W - 16, 176);

    // ERS bar
    g.fillStyle = '#161a20';
    g.fillRect(14, 224, 220, 26);
    g.fillStyle = state.ersDeploy ? '#00ff9d' : '#0a9d6a';
    g.fillRect(14, 224, 220 * state.ers, 26);
    g.fillStyle = '#ffffff';
    g.font = 'bold 16px Arial';
    g.textAlign = 'left';
    g.fillText('ERS', 20, 238);

    // DRS
    g.fillStyle = state.drs ? '#00ff66' : (state.drsAvailable ? '#3a5f2a' : '#161a20');
    g.fillRect(268, 224, 108, 26);
    g.fillStyle = state.drs ? '#000' : '#8a99aa';
    g.textAlign = 'center';
    g.fillText('DRS', 322, 238);

    // fuel / tyre
    g.fillStyle = '#161a20';
    g.fillRect(392, 224, 106, 26);
    g.fillStyle = '#ffaa33';
    g.fillText(`${state.fuel.toFixed(1)} kg`, 445, 238);

    g.textAlign = 'left';
    g.font = 'bold 15px Arial';
    g.fillStyle = '#8a99aa';
    g.fillText(`TYRE ${Math.round(state.tyreTemp)}°C`, 16, 274);
    g.fillStyle = state.delta <= 0 ? '#33ff88' : '#ff5555';
    g.textAlign = 'right';
    g.fillText(state.deltaText, W - 16, 274);

    g.strokeStyle = '#1d232c';
    g.lineWidth = 4;
    g.strokeRect(2, 2, W - 4, H - 4);

    this.dashTexture.needsUpdate = true;
  }

  update(dt, car, state) {
    // Steering wheel rotation (roughly 120° of lock either way)
    const rot = -car.steer / 0.30 * 2.1;
    this.wheelGroup.rotation.z += (rot - this.wheelGroup.rotation.z) * Math.min(1, dt * 18);

    // Front wheels steer and spin. Rotating the hub's local -Z forward by a
    // positive angle about +Y swings it to -X, which is the driver's left, so
    // the sign is flipped to make a positive (right) steer point right.
    const steerAngle = -car.steer / 0.30 * 0.42;
    for (const hub of this.frontWheels) {
      hub.rotation.y += (steerAngle - hub.rotation.y) * Math.min(1, dt * 16);
      hub.children[0].rotation.x -= car.speed * dt * 2.4;
    }

    // Rev LEDs
    const frac = THREE.MathUtils.clamp((car.rpm - 6000) / (15000 - 6000), 0, 1);
    const lit = Math.floor(frac * 15);
    const flash = car.rpm > 14700 && Math.floor(performance.now() / 60) % 2 === 0;
    for (let i = 0; i < 15; i++) {
      const on = flash || i < lit;
      const c = this.leds[i].userData.color;
      this.leds[i].material.color.setRGB(
        on ? c.r : 0.04, on ? c.g : 0.04, on ? c.b : 0.05);
    }

    this._displayClock += dt;
    if (this._displayClock > 0.05) {
      this._displayClock = 0;
      this.updateDisplay(state);
    }
  }
}


/* The external car body lives in carbody.js, re-exported here so existing
   imports keep working. */
export { buildCarBody } from './carbody.js';
