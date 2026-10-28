import * as THREE from 'three';
import { HALF_WIDTH } from './track.js';

/* ------------------------------------------------------------------ */
/* Procedural textures                                                  */
/* ------------------------------------------------------------------ */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function asphaltTexture() {
  const [c, g] = makeCanvas(512, 512);
  // Lighter than a night-race road: at sunset the surface catches a lot of
  // low sun, and a near-black road reads as a hole in the scene.
  g.fillStyle = '#43464e';
  g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // patch seams / repairs typical of a street circuit
  g.globalAlpha = 0.16;
  for (let i = 0; i < 26; i++) {
    g.fillStyle = Math.random() > 0.5 ? '#5a5e68' : '#2e3138';
    const x = Math.random() * 512, y = Math.random() * 512;
    g.fillRect(x, y, 20 + Math.random() * 180, 6 + Math.random() * 30);
  }
  // rubbered-in racing line down the middle of the tile
  g.globalAlpha = 0.22;
  g.fillStyle = '#1e2026';
  g.fillRect(150, 0, 210, 512);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function kerbTexture() {
  const [c, g] = makeCanvas(64, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#e8e8e8' : '#d2222c';
    g.fillRect(0, i * 32, 64, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wallTexture() {
  const [c, g] = makeCanvas(512, 128);
  g.fillStyle = '#c9ccd2';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#9aa0a8';
  g.fillRect(0, 96, 512, 32);
  const banners = [
    ['#ff9933', '#0b1c3a', 'INDIA'],
    ['#0b3d2e', '#ffffff', 'BUDDH'],
    ['#c8102e', '#ffffff', 'GRAND PRIX'],
    ['#1a1a1a', '#00d4ff', 'GREATER NOIDA'],
  ];
  for (let i = 0; i < 4; i++) {
    const [bg, fg, text] = banners[i];
    g.fillStyle = bg;
    g.fillRect(i * 128 + 6, 14, 116, 66);
    g.fillStyle = fg;
    g.font = 'bold 16px Arial';
    g.textAlign = 'center';
    g.fillText(text, i * 128 + 64, 54);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture() {
  const [c, g] = makeCanvas(128, 256);
  g.fillStyle = '#0a0d14';
  g.fillRect(0, 0, 128, 256);
  const warm = ['#ffd9a0', '#ffe9c4', '#bcd6ff', '#8fb7ff', '#fff2d0'];
  for (let y = 4; y < 252; y += 10) {
    for (let x = 5; x < 124; x += 9) {
      if (Math.random() < 0.42) {
        g.fillStyle = warm[(Math.random() * warm.length) | 0];
        g.globalAlpha = 0.5 + Math.random() * 0.5;
        g.fillRect(x, y, 5, 6);
      }
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function startLineTexture() {
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#1a1a1a';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 0) g.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/* World                                                                */
/* ------------------------------------------------------------------ */

// Sun low in the west, a few degrees above the skyline: the whole scene is
// keyed off this one direction so the sky, the shadows and the warm rim on
// the buildings all agree with each other.
const SUN_DIR = new THREE.Vector3(-0.86, 0.115, -0.50).normalize();

export function buildWorld(scene, track) {
  scene.fog = new THREE.Fog(0xc79068, 520, 3200);

  const box = new THREE.Box3().setFromPoints(track.points);
  const centre = new THREE.Vector3(
    (box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2);

  addSky(scene, centre);
  const lights = addLighting(scene, track);
  addGround(scene, track);
  const roadMat = addRoad(scene, track);
  addTrackMarkings(scene, track);
  addKerbs(scene, track);
  addWalls(scene, track);
  addFloodlights(scene, track);
  const crowd = addGrandstands(scene, track);
  addCity(scene, track);
  addLandmarks(scene, track);

  return {
    roadMat,
    update(t) { crowd.update(t); },
    /** Dim the whole rig at once, for weather. 1 = the clear-sky sunset. */
    setLightScale(k) {
      for (const l of lights) l.intensity = l.userData.baseIntensity * k;
    },
  };
}

/** Gradient sky dome with the sun burned into it. */
function addSky(scene, centre) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x1b3f7a) },
      midColor: { value: new THREE.Color(0x7f7fae) },
      horizonColor: { value: new THREE.Color(0xffa257) },
      groundColor: { value: new THREE.Color(0x2a2028) },
      sunColor: { value: new THREE.Color(0xffd7a0) },
      sunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, horizonColor, groundColor, sunColor, sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.30, h));
        col = mix(col, topColor, smoothstep(0.24, 0.80, h));
        col = mix(groundColor, col, smoothstep(-0.14, 0.015, h));

        // Warm the sky towards the sun's azimuth, then add the disc itself.
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 5.0) * 0.42;
        col += sunColor * pow(s, 600.0) * 3.0;

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 40, 24), mat);
  sky.position.copy(centre);
  sky.renderOrder = -1;
  scene.add(sky);
}

function addLighting(scene, track) {
  // Golden hour: a strong warm key raking across the circuit, a cool sky fill
  // from the opposite side, and a high ambient floor so the walled-in parts of
  // the lap never fall into a black pit.
  const hemi = new THREE.HemisphereLight(0xffc389, 0x53412f, 1.55);
  const amb = new THREE.AmbientLight(0xfff0dc, 0.62);
  scene.add(hemi, amb);

  const sun = new THREE.DirectionalLight(0xffb673, 2.65);
  sun.position.copy(SUN_DIR).multiplyScalar(1400);
  scene.add(sun);

  // Second, slightly higher warm light so surfaces facing away from the sun
  // still pick up the sky glow rather than going flat.
  const bounce = new THREE.DirectionalLight(0xffd9b0, 0.75);
  bounce.position.set(-600, 500, 600);
  scene.add(bounce);

  const fill = new THREE.DirectionalLight(0x9dc0ff, 0.85);
  fill.position.set(700, 620, 420);
  scene.add(fill);

  const all = [hemi, amb, sun, bounce, fill];
  for (const l of all) l.userData.baseIntensity = l.intensity;
  return all;
}

function addGround(scene, track) {
  const box = new THREE.Box3().setFromPoints(track.points);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;

  // Buddh sits on the dry Yamuna floodplain, so the run-off and the land
  // beyond it are parched grass and dust rather than city block.
  const g = new THREE.PlaneGeometry(6000, 6000);
  const m = new THREE.MeshStandardMaterial({ color: 0x6d6244, roughness: 1 });
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, -3.5, cz);
  scene.add(mesh);

  // Mown grass verge hugging the circuit, a shade greener than the plain.
  const verge = new THREE.Mesh(
    ribbon(track, -HALF_WIDTH - 46, HALF_WIDTH + 46, -0.35, 40),
    new THREE.MeshStandardMaterial({ color: 0x5f6b3c, roughness: 1 })
  );
  scene.add(verge);

  // The infield balancing lake, tucked inside the Turn 10-11 sweep.
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(150, 40),
    new THREE.MeshStandardMaterial({
      color: 0x27414f, roughness: 0.3, metalness: 0.1,
      emissive: 0xc4632c, emissiveIntensity: 0.07,
    })
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(cx - 620, -1.2, cz - 120);
  scene.add(lake);
}

function ribbon(track, innerOffset, outerOffset, yLift, repeatV) {
  const n = track.sampleCount;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const p = track.points[k];
    const r = track.rights[k];
    const d = track.distances[k];
    pos.push(
      p.x + r.x * innerOffset, p.y + yLift, p.z + r.z * innerOffset,
      p.x + r.x * outerOffset, p.y + yLift, p.z + r.z * outerOffset
    );
    const v = (i === n ? track.length : d) / repeatV;
    uv.push(0, v, 1, v);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    // Wound so the upward face is the front face; the other way round the
    // tarmac was rendered from behind and came out unlit and black.
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  // Every ribbon is a flat, horizontal surface. computeVertexNormals() derives
  // downward-facing normals from this winding, which left the tarmac unlit and
  // pitch black, so the normals are set explicitly instead.
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geo;
}

function addRoad(scene, track) {
  const tex = asphaltTexture();
  tex.repeat.set(3, 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.02 });
  const road = new THREE.Mesh(ribbon(track, -HALF_WIDTH, HALF_WIDTH, 0.02, 12), mat);
  road.renderOrder = 0;
  scene.add(road);

  // Tarmac apron / runoff strip either side, slightly darker
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x2e3036, roughness: 1 });
  const left = new THREE.Mesh(ribbon(track, -HALF_WIDTH - 7, -HALF_WIDTH, 0.0, 12), apronMat);
  const right = new THREE.Mesh(ribbon(track, HALF_WIDTH, HALF_WIDTH + 7, 0.0, 12), apronMat);
  scene.add(left, right);
  return mat;
}

/** A grid slot: painted outline plus the position number. */
function gridBoxTexture(number) {
  const [c, g] = makeCanvas(128, 256);
  g.clearRect(0, 0, 128, 256);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 9;
  // Open at the front, like a real grid box.
  g.beginPath();
  g.moveTo(12, 10); g.lineTo(12, 246); g.lineTo(116, 246); g.lineTo(116, 10);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 74px "Arial Black", Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(number), 64, 76);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Lays a flat quad on the road at `distance`, offset `lateral` metres across. */
function layOnTrack(scene, track, distance, lateral, width, length, material) {
  const s = track.sampleAt(distance);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
  mesh.position.copy(s.point)
    .addScaledVector(s.right, lateral)
    .setY(s.point.y + 0.07);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -Math.atan2(s.tangent.x, s.tangent.z);
  scene.add(mesh);
  return mesh;
}

function addTrackMarkings(scene, track) {
  // Sitting the lines slightly inboard of the tarmac edge keeps them fully on
  // the asphalt, where they read as paint rather than as a seam between two
  // surfaces.
  const white = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.55, metalness: 0.0, emissive: 0x333333,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const EDGE = 0.34;                       // painted line width
  const INSET = 0.10;                      // gap from the tarmac edge
  scene.add(new THREE.Mesh(
    ribbon(track, -HALF_WIDTH + INSET, -HALF_WIDTH + INSET + EDGE, 0.06, 12), white));
  scene.add(new THREE.Mesh(
    ribbon(track, HALF_WIDTH - INSET - EDGE, HALF_WIDTH - INSET, 0.06, 12), white));

  // Start / finish line
  const s = track.sampleAt(0);
  const lineMat = new THREE.MeshStandardMaterial({
    map: startLineTexture(), roughness: 0.6, emissive: 0x222222,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, 1.2), lineMat);
  line.position.copy(s.point).setY(s.point.y + 0.075);
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = -Math.atan2(s.tangent.x, s.tangent.z);
  scene.add(line);

  // Twenty staggered grid slots stretching back down the pit straight
  const boxMat = (n) => new THREE.MeshBasicMaterial({
    map: gridBoxTexture(n), transparent: true, depthWrite: false,
  });
  for (let i = 0; i < 20; i++) {
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    const d = track.length - 22 - row * 12;
    layOnTrack(scene, track, d, side * 3.4, 2.6, 5.2, boxMat(i + 1));
  }

  // DRS activation line: a dashed band painted across the road where the flap
  // is allowed to open.
  const dashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false,
  });
  for (const [startFraction] of track.drsZones) {
    const d = startFraction * track.length;
    for (let k = -3; k <= 3; k++) {
      layOnTrack(scene, track, d, k * 1.9, 1.1, 0.35, dashMat);
    }
  }

  // Braking-distance boards on the approach to every genuinely slow corner,
  // taken from the circuit's own corner table rather than hard-coded.
  const boardMats = {
    100: boardTexture('100', '#0b62d6'),
    50: boardTexture('50', '#d61d1d'),
  };
  const heavy = track.corners.filter((c) => c.radius < 80);
  for (const c of heavy) {
    for (const d of [100, 50]) {
      const smp = track.sampleAt(c.from - d);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), boardMats[d]);
      board.position.copy(smp.point)
        .addScaledVector(smp.right, c.left ? HALF_WIDTH + 3.2 : -HALF_WIDTH - 3.2)
        .setY(smp.point.y + 1.6);
      board.rotation.y = Math.atan2(smp.tangent.x, smp.tangent.z) + Math.PI;
      scene.add(board);
    }
  }
}

function boardTexture(text, colour) {
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = colour;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff';
  g.lineWidth = 6;
  g.strokeStyle = '#ffffff';
  g.strokeRect(6, 6, 116, 116);
  g.font = 'bold 68px "Arial Black", Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map: t, emissive: 0x444444, emissiveMap: t, side: THREE.DoubleSide, roughness: 0.7,
  });
}

function addKerbs(scene, track) {
  const n = track.sampleCount;
  const tex = kerbTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.6,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });

  const active = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (Math.abs(track.curvature[i]) > 0.006) active[i] = 1;
  // widen each run so kerbs start before the apex and trail out
  const grown = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!active[i]) continue;
    for (let k = -12; k <= 16; k++) grown[(i + k + n) % n] = 1;
  }

  const pos = [], uv = [], idx = [];
  let vcount = 0;
  let i = 0;
  while (i < n) {
    if (!grown[i]) { i++; continue; }
    let j = i;
    while (j < n && grown[j]) j++;
    const sign = Math.sign(track.curvature[(i + ((j - i) >> 1)) % n]) || 1;
    // curvature > 0 means turning left => the inside kerb is on the left,
    // and `rights` points to the driver's right, so the inside is negative
    const inner = sign > 0 ? -HALF_WIDTH : HALF_WIDTH;
    const outer = sign > 0 ? -HALF_WIDTH - 1.6 : HALF_WIDTH + 1.6;
    const start = vcount;
    for (let k = i; k <= j && k < n; k++) {
      const p = track.points[k];
      const r = track.rights[k];
      const v = track.distances[k] / 2;
      pos.push(p.x + r.x * inner, p.y + 0.03, p.z + r.z * inner);
      pos.push(p.x + r.x * outer, p.y + 0.13, p.z + r.z * outer);
      uv.push(0, v, 1, v);
      vcount += 2;
    }
    const segs = (vcount - start) / 2 - 1;
    for (let k = 0; k < segs; k++) {
      const a = start + k * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    i = j;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, mat));
}

function addWalls(scene, track) {
  const n = track.sampleCount;
  const tex = wallTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
  const fenceMat = new THREE.MeshBasicMaterial({
    color: 0x8a93a5, wireframe: true, transparent: true, opacity: 0.22,
  });

  for (const side of [-1, 1]) {
    const off = side * (HALF_WIDTH + 7.2);
    const pos = [], uv = [], idx = [];
    const fpos = [], fidx = [];
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const p = track.points[k];
      const r = track.rights[k];
      const x = p.x + r.x * off, z = p.z + r.z * off;
      pos.push(x, p.y, z, x, p.y + 1.35, z);
      const u = track.distances[k] / 24;
      uv.push(u, 0, u, 1);
      fpos.push(x, p.y + 1.35, z, x, p.y + 4.6, z);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
      fidx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, mat));

    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
    fgeo.setIndex(fidx);
    scene.add(new THREE.Mesh(fgeo, fenceMat));
  }
}

function addFloodlights(scene, track) {
  const n = track.sampleCount;
  const stride = 26;                       // ~52 m spacing
  const count = Math.floor(n / stride) * 2;

  const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 9, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.7, metalness: 0.4 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, count);

  const lampGeo = new THREE.BoxGeometry(2.6, 0.35, 0.9);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xf4f4f4, emissive: 0xfff4d8, emissiveIntensity: 1.4, roughness: 0.3,
  });
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, count);

  const glowGeo = new THREE.SphereGeometry(1.5, 8, 6);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff0cf, transparent: true, opacity: 0.05 });
  const glows = new THREE.InstancedMesh(glowGeo, glowMat, count);

  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let i = 0; i < n; i += stride) {
    for (const side of [-1, 1]) {
      if (idx >= count) break;
      const p = track.points[i];
      const r = track.rights[i];
      const off = side * (HALF_WIDTH + 9.5);
      const x = p.x + r.x * off, z = p.z + r.z * off;
      const yaw = Math.atan2(r.x * side, r.z * side);

      dummy.position.set(x, p.y + 4.5, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(x, p.y + 9.1, z);
      dummy.rotation.set(0.35, yaw, 0);
      dummy.updateMatrix();
      lamps.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(x, p.y + 9.1, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 0.5, 1);
      dummy.updateMatrix();
      dummy.scale.set(1, 1, 1);
      glows.setMatrixAt(idx, dummy.matrix);
      idx++;
    }
  }
  scene.add(poles, lamps, glows);

  // Floodlights on the circuit itself, warming the road as the sun drops
  for (let i = 0; i < n; i += Math.floor(n / 20)) {
    const p = track.points[i];
    const l = new THREE.PointLight(0xffe0b0, 420, 150, 2);
    l.position.set(p.x, p.y + 9, p.z);
    scene.add(l);
  }
}

const STAND_LENGTH = 64;              // along the track
const STAND_DEPTH = 22;               // stepping back away from the track
const STAND_FRONT = HALF_WIDTH + 10;  // front row sits clear of the barriers

/**
 * True if a grandstand footprint at this point touches nothing but empty
 * ground. The infield loop runs back past itself in places, so a stand beside
 * one straight can land on top of another part of the lap — without this test
 * the seating tiers end up crossing the road as a flight of steps.
 */
function standIsClear(track, s, side) {
  for (let a = -3; a <= 3; a++) {
    for (let b = 0; b <= 3; b++) {
      const u = (a / 3) * (STAND_LENGTH / 2);
      const v = side * (STAND_FRONT + (b / 3) * STAND_DEPTH);
      const x = s.point.x + s.tangent.x * u + s.right.x * v;
      const z = s.point.z + s.tangent.z * u + s.right.z * v;
      if (Math.abs(track.locate(x, z).lateral) < STAND_FRONT - 2) return false;
    }
  }
  return true;
}

// Shirt colours for the crowd: mostly neutral, with enough team colour dotted
// through to read as a race crowd rather than a stadium of office workers.
const SHIRTS = [
  0xd8d8dc, 0xb8bcc4, 0x8f96a2, 0xe0e2e6, 0xa8adb6,
  0xd41f2c, 0xe8002d, 0xff8000, 0x00d7b6, 0x14275e,
  0x1a9e6f, 0xffc906, 0x2b4bd6, 0x00e701, 0x64c4ff,
  0x2a2f38, 0x50566a, 0xf0c8a0, 0xc0785a, 0x704838,
];
const SKIN = [0xf1c9a5, 0xe0ac82, 0xc68863, 0x8d5524, 0xffdbac, 0x6b4423];

function addGrandstands(scene, track) {
  // Buddh's seating is concentrated along the pit straight and either side of
  // the long back straight, with banks of terracing around the infield.
  // Anything that fails the clearance test is dropped.
  const spots = [
    [0.930, -1], [0.975, -1], [0.020, -1], [0.065, -1],   // main grandstand
    [0.150, 1],                                           // inside Turn 1-2
    [0.235, -1], [0.300, 1], [0.370, -1],                 // the back straight
    [0.445, -1],                                          // Turn 4 braking zone
    [0.560, 1],                                           // infield esses
    [0.690, -1], [0.740, 1],                              // Turn 10-11 sweep
    [0.860, -1],                                          // final complex
  ];
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.8, metalness: 0.3 });

  const TIERS = 9;
  const RISE = 1.15;
  const RUN = STAND_DEPTH / TIERS;
  const PER_TIER = 30;                    // spectators across one row

  // Every spectator in the circuit goes into one instanced draw call, so the
  // crowd costs the same as a single mesh no matter how many stands survive
  // the clearance test.
  const seats = [];

  for (const [f, side] of spots) {
    const s = track.sampleAt(f * track.length);
    if (!standIsClear(track, s, side)) continue;

    const g = new THREE.Group();
    g.position.copy(s.point);
    // Local +Z runs along the track, local +X points to the driver's left, so
    // the tiers are long in Z and step back in -side * X.
    g.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);

    for (let r = 0; r < TIERS; r++) {
      const back = -side * (STAND_FRONT + r * RUN);
      const tier = new THREE.Mesh(new THREE.BoxGeometry(RUN + 0.2, 1.2, STAND_LENGTH), seatMat);
      tier.position.set(back, 1 + r * RISE, 0);
      g.add(tier);

      // Record a seat every so often along the row. A few are left empty so
      // the stand does not look like a solid painted block.
      for (let k = 0; k < PER_TIER; k++) {
        if (Math.random() < 0.12) continue;
        const z = -STAND_LENGTH / 2 + 1.2 + (k / (PER_TIER - 1)) * (STAND_LENGTH - 2.4);
        seats.push({
          group: g,
          x: back + side * (0.15 + Math.random() * 0.3),
          y: 1.6 + r * RISE,
          z: z + (Math.random() - 0.5) * 0.5,
          yaw: side > 0 ? Math.PI / 2 : -Math.PI / 2,
        });
      }
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(STAND_DEPTH + 4, 0.6, STAND_LENGTH + 4), roofMat);
    roof.position.set(-side * (STAND_FRONT + STAND_DEPTH / 2), 14.5, 0);
    g.add(roof);
    for (const pz of [-STAND_LENGTH / 2 + 3, STAND_LENGTH / 2 - 3]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1, 15, 1), roofMat);
      col.position.set(-side * (STAND_FRONT + STAND_DEPTH), 7, pz);
      g.add(col);
    }
    scene.add(g);
    g.updateMatrixWorld(true);
  }

  return buildCrowd(scene, seats);
}

/**
 * Turns a list of seat positions into two instanced meshes — torsos and heads
 * — plus a scattering of camera flashes that fire at random.
 */
function buildCrowd(scene, seats) {
  const count = seats.length;
  const noop = { update() {} };
  if (!count) return noop;

  const bodyGeo = new THREE.CapsuleGeometry(0.19, 0.46, 3, 7);
  const headGeo = new THREE.SphereGeometry(0.125, 7, 5);
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const headMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });

  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
  const heads = new THREE.InstancedMesh(headGeo, headMat, count);
  bodies.frustumCulled = false;
  heads.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  const world = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const s = seats[i];
    const lean = (Math.random() - 0.5) * 0.18;
    const scale = 0.92 + Math.random() * 0.18;

    world.set(s.x, s.y, s.z);
    s.group.localToWorld(world);
    const yaw = s.group.rotation.y + s.yaw;

    dummy.position.copy(world);
    dummy.rotation.set(lean, yaw, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, colour.setHex(SHIRTS[(Math.random() * SHIRTS.length) | 0]));

    dummy.position.y += 0.46 * scale;
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, colour.setHex(SKIN[(Math.random() * SKIN.length) | 0]));
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(bodies, heads);

  /* ---- camera flashes ------------------------------------------- */
  // A pool of tiny additive quads parked at random seats. Each frame a few are
  // popped to full size for a moment, which is what actually sells a crowd at
  // a distance.
  const FLASHES = 140;
  const flashGeo = new THREE.PlaneGeometry(0.9, 0.9);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xfff6e0, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flashes = new THREE.InstancedMesh(flashGeo, flashMat, FLASHES);
  flashes.frustumCulled = false;
  flashes.renderOrder = 3;
  const spots = [];
  for (let i = 0; i < FLASHES; i++) {
    const s = seats[(Math.random() * count) | 0];
    world.set(s.x, s.y + 0.55, s.z);
    s.group.localToWorld(world);
    spots.push({ p: world.clone(), t: Math.random() * 4 });
    dummy.position.copy(world);
    dummy.scale.setScalar(0.0001);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    flashes.setMatrixAt(i, dummy.matrix);
  }
  scene.add(flashes);

  let clock = 0;
  return {
    update(t) {
      // Billboard the flashes and blink them on a per-instance timer.
      const dt = Math.max(0, Math.min(0.1, t - clock));
      clock = t;
      let dirty = false;
      for (let i = 0; i < FLASHES; i++) {
        const f = spots[i];
        f.t -= dt;
        if (f.t > 0) continue;
        f.t = 0.6 + Math.random() * 5.5;
        dummy.position.copy(f.p);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(Math.random() < 0.5 ? 0.0001 : 1);
        dummy.updateMatrix();
        flashes.setMatrixAt(i, dummy.matrix);
        dirty = true;
      }
      if (dirty) flashes.instanceMatrix.needsUpdate = true;
    },
  };
}

function addCity(scene, track) {
  const winTex = windowTexture();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  // The window texture is mostly dark, so using it as the diffuse map turned
  // every facade into a black silhouette. It now only drives the emissive
  // channel and the render colour is free to catch the sunset.
  const mat = new THREE.MeshStandardMaterial({
    color: 0xa8a08c, roughness: 0.55, metalness: 0.2,
    emissive: 0xffdca8, emissiveMap: winTex, emissiveIntensity: 0.7,
  });

  const box = new THREE.Box3().setFromPoints(track.points);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;

  // Buddh is out on open farmland, so this is the Greater Noida development on
  // the horizon rather than a skyline pressed up against the barriers: fewer
  // blocks, lower, and starting much further out.
  const COUNT = 150;
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;

  while (placed < COUNT && guard++ < 20000) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 1500 + Math.pow(Math.random(), 0.7) * 1600;
    const x = cx + Math.cos(ang) * rad;
    const z = cz + Math.sin(ang) * rad;

    const loc = track.locate(x, z);
    if (Math.abs(loc.lateral) < 120) continue;   // keep clear of the circuit

    const w = 16 + Math.random() * 30;
    const d = 16 + Math.random() * 30;
    const h = 14 + Math.pow(Math.random(), 2.0) * 70;

    dummy.position.set(x, h / 2 - 3.5, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(0, Math.random() * Math.PI, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed++, dummy.matrix);
  }
  mesh.count = placed;
  scene.add(mesh);

  // Rooftop aircraft-warning beacons
  const beaconGeo = new THREE.SphereGeometry(1.2, 6, 5);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const beacons = new THREE.InstancedMesh(beaconGeo, beaconMat, 40);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 40; i++) {
    mesh.getMatrixAt((i * 7) % placed, m);
    const p = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion();
    m.decompose(p, q, s);
    dummy.position.set(p.x, s.y - 1 + 1.5, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    beacons.setMatrixAt(i, dummy.matrix);
  }
  scene.add(beacons);
}

/**
 * Buddh's own architecture: the pit building running down the inside of the
 * start/finish straight, capped by the race control tower, plus the big
 * cantilevered roof over the main grandstand opposite.
 */
function addLandmarks(scene, track) {
  const concrete = new THREE.MeshStandardMaterial({
    color: 0xb8b2a4, roughness: 0.75, metalness: 0.1,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x3c4a58, roughness: 0.18, metalness: 0.5,
    emissive: 0xffc27a, emissiveIntensity: 0.35,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x9aa0a8, roughness: 0.55, metalness: 0.45,
  });
  // Big roof planes catch the low sun and blow out to white, which reads as a
  // blank sheet from the air, so they get their own darker, matt material.
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x4e5560, roughness: 0.85, metalness: 0.25,
  });

  // Anchor everything to the start/finish line so it lines up with the grid
  // however the layout is scaled.
  const s = track.sampleAt(0);
  const place = (group, along, across, lift) => {
    group.position.set(
      s.point.x + s.tangent.x * along + s.right.x * across,
      lift,
      s.point.z + s.tangent.z * along + s.right.z * across
    );
    // Same convention as the grandstands: local +Z runs along the track.
    group.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
  };

  // --- Pit building: garages on the inside of the straight ---
  const pits = new THREE.Group();
  const garages = new THREE.Mesh(new THREE.BoxGeometry(26, 11, 380), concrete);
  garages.position.set(0, 5.5, 0);
  pits.add(garages);
  const band = new THREE.Mesh(new THREE.BoxGeometry(27, 3.2, 372), glass);
  band.position.set(0, 9.4, 0);
  pits.add(band);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(30, 0.8, 386), roofMat);
  roof.position.set(-1, 11.4, 0);
  pits.add(roof);
  // Garage bay divisions, so the roof is not one unbroken sheet from the air.
  for (let i = -8; i <= 8; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(30.4, 0.5, 1.1), steel);
    rib.position.set(-1, 11.9, i * 22);
    pits.add(rib);
  }

  // --- Race control tower above the middle of the pit lane ---
  const tower = new THREE.Mesh(new THREE.BoxGeometry(22, 34, 30), concrete);
  tower.position.set(0, 28, -40);
  pits.add(tower);
  const control = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 32), glass);
  control.position.set(0, 49, -40);
  pits.add(control);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 26, 6), steel);
  mast.position.set(0, 67, -40);
  pits.add(mast);
  place(pits, -30, 44, 0);
  scene.add(pits);

  // --- Main grandstand canopy, cantilevered out over the seating opposite ---
  // The tiers themselves come from addGrandstands; this is just the roof, so it
  // sits directly over that footprint (18 m to 40 m off the centreline).
  const stand = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(28, 1.0, 300), roofMat);
  deck.position.set(0, 15, 0);
  deck.rotation.z = 0.12;
  stand.add(deck);
  for (let i = -6; i <= 6; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(28.4, 0.6, 0.9), steel);
    rib.position.set(0, 15.6, i * 23);
    rib.rotation.z = 0.12;
    stand.add(rib);
  }
  for (const dz of [-130, -65, 0, 65, 130]) {
    for (const dx of [-12, 12]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 15, 8), steel);
      post.position.set(dx, 7.5, dz);
      stand.add(post);
    }
  }
  place(stand, -20, -30, 0);
  scene.add(stand);
}
