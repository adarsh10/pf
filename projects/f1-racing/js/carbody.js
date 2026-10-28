import * as THREE from 'three';

/**
 * A modern ground-effect Formula 1 car, built from lofted cross-sections
 * rather than a pile of boxes.
 *
 * The silhouette is what makes a car read as real: a narrow nose that swells
 * into the monocoque, undercut sidepods, an engine cover that tapers to a
 * shark fin, and wheels at the right track and wheelbase. Real dimensions are
 * used throughout — 5.6 m long, 2.0 m wide, 3.6 m wheelbase, 720 mm tyres.
 */

const WHEELBASE = 3.6;
const FRONT_AXLE = -WHEELBASE / 2;
const REAR_AXLE = WHEELBASE / 2;
const FRONT_TRACK = 1.60;
const REAR_TRACK = 1.42;
const TYRE_R = 0.36;
const FRONT_TYRE_W = 0.305;
const REAR_TYRE_W = 0.405;

/* ------------------------------------------------------------------ */
/* Lofting                                                             */
/* ------------------------------------------------------------------ */

/**
 * One cross-section of the body: a superellipse, so the same helper can make
 * anything from a near-circular nose (`squareness` ~1) to the slab-sided
 * floor of a sidepod (`squareness` ~4).
 */
function section(st, n) {
  const { z, xc = 0, halfW, yBot, yTop, sq = 2.4 } = st;
  const cy = (yTop + yBot) / 2;
  const ry = (yTop - yBot) / 2;
  const p = 2 / sq;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    out.push(
      xc + Math.sign(c) * Math.pow(Math.abs(c), p) * halfW,
      cy + Math.sign(s) * Math.pow(Math.abs(s), p) * ry,
      z
    );
  }
  return out;
}

/** Skins a list of stations into a closed tube, capped at both ends. */
function loft(stations, n = 20) {
  const pos = [];
  const idx = [];
  for (const st of stations) pos.push(...section(st, n));

  for (let s = 0; s < stations.length - 1; s++) {
    const a = s * n, b = (s + 1) * n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(a + i, b + i, a + j, a + j, b + i, b + j);
    }
  }
  // Caps: a centre vertex fanned out to the first and last rings.
  const first = stations[0], last = stations[stations.length - 1];
  const capA = pos.length / 3;
  pos.push(first.xc || 0, (first.yTop + first.yBot) / 2, first.z);
  for (let i = 0; i < n; i++) idx.push(capA, (i + 1) % n, i);
  const capB = pos.length / 3;
  const base = (stations.length - 1) * n;
  pos.push(last.xc || 0, (last.yTop + last.yBot) / 2, last.z);
  for (let i = 0; i < n; i++) idx.push(capB, base + i, base + (i + 1) % n);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Mirrors a set of stations to the other side of the car. */
function mirrored(stations) {
  return stations.map((s) => ({ ...s, xc: -(s.xc || 0) }));
}

/* ------------------------------------------------------------------ */
/* Decals                                                              */
/* ------------------------------------------------------------------ */

function hex(c) {
  return '#' + c.toString(16).padStart(6, '0');
}

/** Race number + driver code, painted on a transparent canvas. */
function numberTexture(entry) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = hex(entry.accent);
  g.strokeStyle = 'rgba(0,0,0,0.65)';
  g.lineWidth = 6;
  g.font = 'bold 150px "Arial Black", Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.strokeText(String(entry.number), 128, 110);
  g.fillText(String(entry.number), 128, 110);
  g.font = 'bold 52px Arial';
  g.strokeText(entry.code, 128, 210);
  g.fillText(entry.code, 128, 210);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/* Wheels                                                              */
/* ------------------------------------------------------------------ */

const TREAD = new THREE.MeshStandardMaterial({ color: 0x121215, roughness: 0.96, metalness: 0.02 });
const RIM_MAT = new THREE.MeshStandardMaterial({ color: 0x2f3239, roughness: 0.35, metalness: 0.85 });
const CARBON = new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.42, metalness: 0.55 });
const SIDEWALL = new THREE.MeshBasicMaterial({ color: 0xd9232c });

function buildWheel(width, coverColour) {
  const g = new THREE.Group();
  // Everything that turns with the tyre hangs off `spin`, so the outer group
  // is free to carry steering angle without the two rotations fighting.
  const spin = new THREE.Group();
  g.add(spin);

  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(TYRE_R, TYRE_R, width, 28), TREAD);
  tyre.rotation.z = Math.PI / 2;
  spin.add(tyre);

  // 18" rim sitting inside the sidewall
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, width + 0.006, 22), RIM_MAT);
  rim.rotation.z = Math.PI / 2;
  spin.add(rim);

  // Aero wheel cover, the flat disc that hides the brake assembly
  const cover = new THREE.Mesh(
    new THREE.CircleGeometry(0.238, 24),
    new THREE.MeshStandardMaterial({ color: coverColour, roughness: 0.3, metalness: 0.5, side: THREE.DoubleSide })
  );
  cover.rotation.y = Math.PI / 2;
  cover.position.x = width / 2 + 0.004;
  spin.add(cover);

  // Spokes, so the wheel visibly rotates instead of looking like a static disc
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.3, metalness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.20, 0.035), spokeMat);
    spoke.position.set(width / 2 + 0.008, Math.sin(a) * 0.11, Math.cos(a) * 0.11);
    spoke.rotation.x = -a;
    spin.add(spoke);
  }

  // Soft-compound sidewall band with a single marker block on it
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.318, 0.011, 6, 30), SIDEWALL);
  band.rotation.y = Math.PI / 2;
  band.position.x = width / 2 - 0.02;
  spin.add(band);

  g.userData.spin = spin;
  return g;
}

/* ------------------------------------------------------------------ */
/* Wings                                                               */
/* ------------------------------------------------------------------ */

/** A thin cambered aerofoil, extruded across the car. */
function aerofoil(span, chord, thickness) {
  const shape = new THREE.Shape();
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const camber = Math.sin(t * Math.PI) * thickness;
    shape[i === 0 ? 'moveTo' : 'lineTo'](-chord / 2 + t * chord, camber * 0.5 - t * chord * 0.18);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const camber = Math.sin(t * Math.PI) * thickness;
    shape.lineTo(-chord / 2 + t * chord, -camber * 0.5 - t * chord * 0.18);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: span, bevelEnabled: false, curveSegments: 4 });
  geo.translate(0, 0, -span / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/* ------------------------------------------------------------------ */
/* The car                                                             */
/* ------------------------------------------------------------------ */

/**
 * Builds an external car body. `entry` is a row from `js/teams.js`; passing a
 * plain colour still works for quick tests.
 */
export function buildCarBody(entry) {
  if (typeof entry === 'number') entry = { primary: entry, secondary: 0x14161c, accent: 0xf2f2f2, number: 0, code: '' };
  const e = entry || { primary: 0xc8102e, secondary: 0x14161c, accent: 0xf2f2f2, number: 0, code: '' };

  const g = new THREE.Group();
  const livery = new THREE.MeshStandardMaterial({ color: e.primary, roughness: 0.28, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: e.secondary, roughness: 0.4, metalness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: e.accent, roughness: 0.3, metalness: 0.4 });

  /* ---- monocoque, nose and engine cover ------------------------- */
  const tub = loft([
    { z: -2.62, halfW: 0.055, yBot: 0.20, yTop: 0.28, sq: 1.4 },   // nose tip
    { z: -2.30, halfW: 0.090, yBot: 0.19, yTop: 0.34, sq: 1.6 },
    { z: -1.95, halfW: 0.125, yBot: 0.18, yTop: 0.42, sq: 1.8 },
    { z: -1.55, halfW: 0.175, yBot: 0.16, yTop: 0.50, sq: 2.0 },
    { z: -1.10, halfW: 0.245, yBot: 0.14, yTop: 0.58, sq: 2.2 },
    { z: -0.70, halfW: 0.315, yBot: 0.12, yTop: 0.66, sq: 2.4 },
    { z: -0.30, halfW: 0.360, yBot: 0.11, yTop: 0.72, sq: 2.6 },   // cockpit
    { z:  0.10, halfW: 0.385, yBot: 0.11, yTop: 0.74, sq: 2.8 },
    { z:  0.45, halfW: 0.375, yBot: 0.11, yTop: 0.92, sq: 2.6 },   // airbox
    { z:  0.95, halfW: 0.330, yBot: 0.12, yTop: 0.94, sq: 2.4 },
    { z:  1.45, halfW: 0.265, yBot: 0.14, yTop: 0.86, sq: 2.2 },
    { z:  1.95, halfW: 0.185, yBot: 0.17, yTop: 0.70, sq: 2.0 },
    { z:  2.35, halfW: 0.110, yBot: 0.20, yTop: 0.54, sq: 1.8 },   // gearbox
  ]);
  g.add(new THREE.Mesh(tub, livery));

  /* ---- sidepods -------------------------------------------------- */
  const podStations = [
    { z: -0.42, xc: 0.44, halfW: 0.055, yBot: 0.30, yTop: 0.62, sq: 3.0 },  // inlet
    { z: -0.10, xc: 0.56, halfW: 0.175, yBot: 0.22, yTop: 0.66, sq: 3.2 },
    { z:  0.35, xc: 0.60, halfW: 0.215, yBot: 0.18, yTop: 0.64, sq: 3.4 },
    { z:  0.85, xc: 0.57, halfW: 0.205, yBot: 0.16, yTop: 0.58, sq: 3.4 },
    { z:  1.35, xc: 0.48, halfW: 0.155, yBot: 0.16, yTop: 0.46, sq: 3.2 },
    { z:  1.80, xc: 0.36, halfW: 0.090, yBot: 0.18, yTop: 0.36, sq: 2.8 },
    { z:  2.10, xc: 0.26, halfW: 0.040, yBot: 0.20, yTop: 0.30, sq: 2.4 },
  ];
  g.add(new THREE.Mesh(loft(podStations, 16), livery));
  g.add(new THREE.Mesh(loft(mirrored(podStations), 16), livery));

  /* ---- floor and diffuser ---------------------------------------- */
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.035, 3.5), dark);
  floor.position.set(0, 0.075, 0.35);
  g.add(floor);
  for (const side of [-1, 1]) {
    // Floor edge fence, the vertical lip that seals the ground effect tunnel
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 2.6), dark);
    fence.position.set(side * 0.71, 0.12, 0.3);
    g.add(fence);
  }
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.30, 0.55), dark);
  diffuser.position.set(0, 0.20, 2.16);
  diffuser.rotation.x = -0.30;
  g.add(diffuser);

  /* ---- front wing ------------------------------------------------ */
  const fwZ = -2.72;
  const elements = [
    [0.30, 0.055, 0.09, -0.05],
    [0.26, 0.135, 0.10, -0.14],
    [0.22, 0.215, 0.11, -0.24],
    [0.18, 0.300, 0.12, -0.36],
  ];
  for (const [chord, y, th, rot] of elements) {
    const w = new THREE.Mesh(aerofoil(1.90, chord, th), rot < -0.2 ? accent : dark);
    w.position.set(0, y, fwZ + chord * 0.4);
    w.rotation.x = rot;
    g.add(w);
  }
  for (const side of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.34, 0.60), dark);
    ep.position.set(side * 0.95, 0.20, fwZ + 0.06);
    g.add(ep);
    // The upturned outer tip that pushes air around the front tyre
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.30), accent);
    tip.position.set(side * 0.95, 0.42, fwZ + 0.18);
    tip.rotation.z = side * 0.35;
    g.add(tip);
  }
  // Nose pylons joining the wing to the nose tip
  for (const side of [-1, 1]) {
    const py = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.34), dark);
    py.position.set(side * 0.10, 0.16, fwZ + 0.22);
    g.add(py);
  }

  /* ---- barge boards / sidepod inlet vanes ------------------------ */
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.22 - i * 0.03, 0.42), dark);
      v.position.set(side * (0.50 + i * 0.09), 0.28 + i * 0.05, -0.85 + i * 0.06);
      v.rotation.y = side * 0.16;
      g.add(v);
    }
  }

  /* ---- rear wing -------------------------------------------------- */
  const rwZ = 2.58;
  const mainPlane = new THREE.Mesh(aerofoil(1.05, 0.34, 0.10), dark);
  mainPlane.position.set(0, 0.86, rwZ);
  mainPlane.rotation.x = -0.22;
  g.add(mainPlane);

  const flap = new THREE.Mesh(aerofoil(1.05, 0.24, 0.08), accent);
  flap.position.set(0, 1.02, rwZ + 0.05);
  flap.rotation.x = -0.62;                       // closed; DRS rotates this flat
  g.add(flap);

  for (const side of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.46, 0.62), livery);
    ep.position.set(side * 0.53, 0.94, rwZ + 0.02);
    g.add(ep);
    // Swan-neck supports, mounted to the top of the main plane
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.10), dark);
    neck.position.set(side * 0.13, 0.72, rwZ + 0.10);
    g.add(neck);
  }
  // Beam wing under the main element
  const beam = new THREE.Mesh(aerofoil(0.90, 0.20, 0.06), dark);
  beam.position.set(0, 0.52, rwZ + 0.02);
  beam.rotation.x = -0.18;
  g.add(beam);

  /* ---- engine cover fin, airbox and roll hoop -------------------- */
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.30, 1.35), livery);
  fin.position.set(0, 0.86, 1.35);
  g.add(fin);

  const airboxLip = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.16, 14, 1, true), dark);
  airboxLip.position.set(0, 0.86, 0.30);
  airboxLip.rotation.x = Math.PI / 2 - 0.15;
  g.add(airboxLip);

  const rollHoop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.24, 10), dark);
  rollHoop.position.set(0, 0.92, 0.32);
  g.add(rollHoop);

  // T-cam on the roll hoop, carrying the race number
  const camPod = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.24), accent);
  camPod.position.set(0, 1.06, 0.30);
  g.add(camPod);

  /* ---- halo ------------------------------------------------------- */
  const haloMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.3, metalness: 0.8 });
  const haloCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.36, 0.68, 0.20),
    new THREE.Vector3(-0.40, 0.86, -0.10),
    new THREE.Vector3(-0.30, 0.94, -0.52),
    new THREE.Vector3(0.00, 0.96, -0.72),
    new THREE.Vector3(0.30, 0.94, -0.52),
    new THREE.Vector3(0.40, 0.86, -0.10),
    new THREE.Vector3(0.36, 0.68, 0.20),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(haloCurve, 40, 0.026, 8, false), haloMat));
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.22, 8), haloMat);
  strut.position.set(0, 0.86, -0.72);
  g.add(strut);

  /* ---- driver ----------------------------------------------------- */
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 18, 14),
    new THREE.MeshStandardMaterial({ color: e.accent, roughness: 0.22, metalness: 0.2 })
  );
  helmet.position.set(0, 0.80, -0.30);
  helmet.scale.set(1, 1.06, 1.12);
  g.add(helmet);
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.137, 18, 14, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.40, Math.PI * 0.24),
    new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.1, metalness: 0.9 })
  );
  visor.position.copy(helmet.position);
  visor.scale.copy(helmet.scale);
  g.add(visor);
  // Shoulders / headrest surround
  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.16), dark);
  headrest.position.set(0, 0.74, -0.06);
  g.add(headrest);

  /* ---- mirrors ---------------------------------------------------- */
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.03), dark);
    arm.position.set(side * 0.44, 0.66, -0.40);
    g.add(arm);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.05), dark);
    pod.position.set(side * 0.53, 0.66, -0.40);
    g.add(pod);
  }

  /* ---- wheels and suspension -------------------------------------- */
  const wheels = [];
  const layout = [
    [-FRONT_TRACK / 2, FRONT_AXLE, FRONT_TYRE_W],
    [FRONT_TRACK / 2, FRONT_AXLE, FRONT_TYRE_W],
    [-REAR_TRACK / 2, REAR_AXLE, REAR_TYRE_W],
    [REAR_TRACK / 2, REAR_AXLE, REAR_TYRE_W],
  ];
  for (const [x, z, w] of layout) {
    const wheel = buildWheel(w, e.secondary);
    wheel.position.set(x, TYRE_R, z);
    g.add(wheel);
    wheels.push(wheel);

    // Wishbones: two arms per corner running inboard to the chassis
    const side = Math.sign(x);
    const inboard = z < 0 ? 0.20 : 0.26;
    for (const [dy, dz] of [[0.10, 0.24], [-0.10, -0.20]]) {
      const len = Math.abs(x) - inboard;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 6), CARBON);
      arm.position.set(x - side * len / 2, TYRE_R + dy, z + dz * 0.4);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = side * (dz > 0 ? 0.34 : -0.30);
      g.add(arm);
    }
  }

  /* ---- rain light -------------------------------------------------- */
  const rain = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.09, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xff1414 })
  );
  rain.position.set(0, 0.44, 2.34);
  g.add(rain);

  /* ---- number decals ------------------------------------------------ */
  if (e.number) {
    const tex = numberTexture(e);
    const decalMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.40), decalMat);
      d.position.set(side * 0.30, 0.50, -1.45);
      d.rotation.y = side * Math.PI / 2;
      g.add(d);
    }
    const nose = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.30), decalMat);
    nose.position.set(0, 0.50, 0.42);
    g.add(nose);
  }

  g.userData.wheels = wheels;
  g.userData.drsFlap = flap;
  g.userData.entry = e;
  return g;
}

export { WHEELBASE, TYRE_R };
