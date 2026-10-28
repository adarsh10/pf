import * as THREE from 'three';
import { Track, HALF_WIDTH } from './track.js';
import { buildWorld } from './world.js';
import { Car, SPEC } from './car.js';
import { Cockpit } from './cockpit.js';
import { buildCarBody } from './carbody.js';
import { Hud, formatTime } from './hud.js';
import { EngineAudio } from './audio.js';
import { Field } from './opponents.js';
import { Commentary, LANGUAGES } from './commentary.js';
import { Broll } from './broll.js';
import { Rain } from './weather.js';
import { TEAMS, ENTRIES, opponentsFor } from './teams.js';

/* ================================================================== */
/* Setup                                                               */
/* ================================================================== */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// Golden hour is a bright scene; the old night-race exposure crushed it.
renderer.toneMappingExposure = 1.28;

const scene = new THREE.Scene();
const track = new Track();
const world = buildWorld(scene, track);

// The seat the player is in. Overwritten as soon as a driver is picked.
let entry = ENTRIES[0];

const car = new Car(track);
const cockpit = new Cockpit(entry);

const rig = new THREE.Group();          // follows the car, holds cockpit + body
scene.add(rig);
rig.add(cockpit.group);
cockpit.group.position.set(0, 0.98, 0.22);

let body = buildCarBody(entry);
rig.add(body);
body.visible = false;

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 4000);
scene.add(camera);

const hud = new Hud(track);
const hudEl = document.getElementById('hud');
const audio = new EngineAudio();
const commentary = new Commentary();
const broll = new Broll(camera, track, rig);
const rain = new Rain(scene, camera, world, renderer);

// Broadcast-style ducking: the engine drops back whenever a commentator talks.
commentary.onSpeaking = (on) => audio.duck(on);

/* Race setup: nine AI cars, three laps, player starting from the back row. */
const RACE_LAPS = 3;
// How far off the centreline the car may sit before it counts as off track.
const TRACK_LIMIT = HALF_WIDTH + 2.6;
const GRID_ROWS = 12;                        // metres between grid rows
const POLE_DISTANCE = track.length - 55;     // pole sits just behind the line
const PLAYER_START = POLE_DISTANCE - 5 * GRID_ROWS;
const field = new Field(scene, track, car, RACE_LAPS);
let raceLap = -1;                            // becomes 0 on the first crossing
let raceOver = false;
let raceTime = 0;

/** Puts the player in a given seat: repaints the car and reshuffles the grid. */
function chooseDriver(code) {
  entry = ENTRIES.find((e) => e.code === code) || ENTRIES[0];
  cockpit.setTeam(entry);
  rig.remove(body);
  body = buildCarBody(entry);
  body.visible = false;
  rig.add(body);

  const roster = opponentsFor(entry.code, 9);
  field.setRoster(roster);
  field.setPlayerEntry(entry);
  commentary.setDriver(entry);
}

/* ---- live rear-view mirrors ---------------------------------- */
const MIRROR_W = 256, MIRROR_H = 110;
const mirrorTargets = [
  new THREE.WebGLRenderTarget(MIRROR_W, MIRROR_H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }),
  new THREE.WebGLRenderTarget(MIRROR_W, MIRROR_H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }),
];
const mirrorCam = new THREE.PerspectiveCamera(58, MIRROR_W / MIRROR_H, 0.3, 1200);
mirrorTargets.forEach((t) => { t.texture.colorSpace = THREE.SRGBColorSpace; });
cockpit.mirrors.forEach((m, i) => {
  m.material.map = mirrorTargets[i].texture;
  m.material.color.set(0xffffff);
  m.material.needsUpdate = true;
});
let mirrorTick = 0;

function renderMirrors() {
  const fwd = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  rig.visible = false;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    mirrorCam.position.copy(car.position)
      .addScaledVector(right, side * 0.74)
      .addScaledVector(fwd, -0.1)
      .setY(car.position.y + 0.96);
    const look = mirrorCam.position.clone()
      .addScaledVector(fwd, -26)
      .addScaledVector(right, side * 9)
      .setY(car.position.y + 1.3);
    mirrorCam.up.set(0, 1, 0);
    mirrorCam.lookAt(look);
    renderer.setRenderTarget(mirrorTargets[i]);
    renderer.render(scene, mirrorCam);
  }
  renderer.setRenderTarget(null);
  rig.visible = true;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ================================================================== */
/* Input                                                               */
/* ================================================================== */

const keys = new Set();
const input = { throttle: 0, brake: 0, steer: 0, ers: false, shiftUp: false, shiftDown: false };
let steerSmooth = 0;

addEventListener('keydown', (e) => {
  if (e.repeat) { e.preventDefault(); return; }
  keys.add(e.code);
  audio.start();
  handleKeyPress(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const CAMERAS = ['Cockpit', 'Helmet', 'T-Cam', 'Chase', 'TV'];
let cameraMode = 0;

function handleKeyPress(code) {
  // Any of the obvious "get on with it" keys cuts the pre-race montage short.
  if (broll.active) {
    if (['Space', 'Enter', 'Escape', 'KeyS'].includes(code)) broll.skip();
    return;
  }
  switch (code) {
    case 'KeyC':
      cameraMode = (cameraMode + 1) % CAMERAS.length;
      hud.flash(`Camera: ${CAMERAS[cameraMode]}`, 1200, '#7ad7ff');
      break;
    case 'KeyR':
      resetToTrack();
      break;
    case 'KeyG':
      car.autoGearbox = !car.autoGearbox;
      hud.flash(car.autoGearbox ? 'Gearbox: AUTO' : 'Gearbox: MANUAL', 1400, '#ffe066');
      break;
    case 'KeyM':
      audio.setEnabled(!audio.enabled);
      hud.flash(audio.enabled ? 'Sound on' : 'Sound off', 1000, '#7ad7ff');
      break;
    case 'KeyV':
      commentary.setEnabled(!commentary.enabled);
      hud.flash(commentary.enabled ? 'Commentary on' : 'Commentary off', 1200, '#7ad7ff');
      break;
    case 'KeyN':
      setRain(!rain.active);
      break;
    case 'KeyH':
      document.getElementById('hud').classList.toggle('hidden');
      break;
    case 'ShiftLeft': case 'ShiftRight': case 'KeyE':
      input.shiftUp = true;
      break;
    case 'ControlLeft': case 'ControlRight': case 'KeyQ':
      input.shiftDown = true;
      break;
    case 'Escape':
      paused = !paused;
      document.getElementById('pauseScreen').classList.toggle('hidden', !paused);
      break;
  }
}

function readInput(dt) {
  const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;

  let steerRaw = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) steerRaw -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) steerRaw += 1;

  let thr = (keys.has('KeyW') || keys.has('ArrowUp')) ? 1 : 0;
  let brk = (keys.has('KeyS') || keys.has('ArrowDown')) ? 1 : 0;

  if (gp) {
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.06) steerRaw = ax;
    const rt = gp.buttons[7]?.value ?? 0;
    const lt = gp.buttons[6]?.value ?? 0;
    if (rt > 0.02) thr = rt;
    if (lt > 0.02) brk = lt;
    if (gp.buttons[0]?.pressed) input.shiftUp = true;
    if (gp.buttons[1]?.pressed) input.shiftDown = true;
    if (gp.buttons[2]?.pressed) car.drs = car.drsAvailable;
  }

  // Speed-sensitive steering rate keeps the car stable at high speed
  const rate = 3.4 + 4.0 / (1 + car.speed / 18);
  steerSmooth += (steerRaw - steerSmooth) * Math.min(1, dt * rate * 2.2);
  if (steerRaw === 0) steerSmooth *= Math.max(0, 1 - dt * 6);

  input.steer = THREE.MathUtils.clamp(steerSmooth, -1, 1);
  input.throttle = started ? thr : 0;
  input.brake = started ? brk : (brk || 0);
  input.ers = keys.has('KeyX') || (gp?.buttons[5]?.pressed ?? false);

  if (keys.has('Space')) {
    if (car.drsAvailable && car.brake < 0.05) car.drs = true;
  }
}

/* ================================================================== */
/* Timing                                                              */
/* ================================================================== */

const SPLIT_COUNT = 240;
const timing = {
  lap: 1,
  current: 0,
  last: null,
  best: null,
  delta: null,
  sectors: [null, null, null],
  sectorState: ['', '', ''],
  bestSectors: [null, null, null],
  splits: new Float64Array(SPLIT_COUNT).fill(NaN),
  bestSplits: null,
  sectorStart: 0,
  currentSector: 0,
  validLap: true,
  offTrackTime: 0,
  armed: false,          // stays false until the car first crosses the line
};

let prevFraction = 0;
let started = false;
let paused = false;
let lightsStage = -1;
let lightsTimer = 0;

function beginLap() {
  timing.current = 0;
  timing.splits.fill(NaN);
  timing.sectorStart = 0;
  timing.currentSector = 0;
  timing.sectors = [null, null, null];
  timing.sectorState = ['', '', ''];
  timing.validLap = true;
  timing.offTrackTime = 0;
  timing.lap++;
}

function completeLap() {
  raceLap++;
  if (!timing.armed) {
    // Crossing the line for the first time simply starts lap 1.
    timing.armed = true;
    timing.lap = 0;
    beginLap();
    hud.flash(`LAP 1 of ${RACE_LAPS} — GO`, 1200, '#33ff88');
    return;
  }
  if (raceLap >= RACE_LAPS && !raceOver) {
    raceOver = true;
    started = false;
    const st = field.playerStanding();
    hud.flash(`CHEQUERED FLAG — P${st.position} of ${st.total}`, 6000, '#ffe066');
    commentary.finished(st.position, st.total);
  }
  const time = timing.current;
  timing.last = time;
  const isBest = timing.best == null || time < timing.best;
  if (timing.validLap && isBest) {
    timing.best = time;
    timing.bestSplits = timing.splits.slice();
    hud.flash(`PERSONAL BEST  ${formatTime(time)}`, 2600, '#a78bfa');
  } else if (!timing.validLap) {
    hud.flash(`LAP DELETED — track limits  ${formatTime(time)}`, 2600, '#ff6b6b');
  } else {
    hud.flash(`LAP ${timing.lap}  ${formatTime(time)}`, 2200, '#ffe066');
  }
  beginLap();
}

function updateTiming(dt, fraction) {
  if (!started) return;
  timing.current += dt * 1000;

  const idx = Math.min(SPLIT_COUNT - 1, Math.floor(fraction * SPLIT_COUNT));
  if (isNaN(timing.splits[idx])) timing.splits[idx] = timing.current;

  if (timing.bestSplits && !isNaN(timing.bestSplits[idx])) {
    timing.delta = timing.current - timing.bestSplits[idx];
  }

  // sectors
  const sec = track.sectorOf(fraction);
  if (sec !== timing.currentSector && (sec === (timing.currentSector + 1) % 3)) {
    const s = timing.currentSector;
    const t = timing.current - timing.sectorStart;
    timing.sectors[s] = t;
    if (timing.bestSectors[s] == null || t < timing.bestSectors[s]) {
      timing.bestSectors[s] = t;
      timing.sectorState[s] = 'purple';
    } else {
      timing.sectorState[s] = t < timing.bestSectors[s] * 1.005 ? 'green' : 'yellow';
    }
    timing.sectorStart = timing.current;
    timing.currentSector = sec;
  }

  // track limits — the kerbs run about 1.6 m past the white line, so only a
  // genuine excursion beyond them counts
  if (Math.abs(car.locate.lateral) > TRACK_LIMIT) {
    timing.offTrackTime += dt;
    if (timing.offTrackTime > 0.35 && timing.validLap) {
      timing.validLap = false;
      hud.flash('TRACK LIMITS — lap invalidated', 1600, '#ff8c42');
    }
  } else {
    timing.offTrackTime = Math.max(0, timing.offTrackTime - dt * 0.5);
  }

  // lap crossing
  if (prevFraction > 0.85 && fraction < 0.15) {
    const s = 2;
    timing.sectors[s] = timing.current - timing.sectorStart;
    if (timing.bestSectors[s] == null || timing.sectors[s] < timing.bestSectors[s]) {
      timing.bestSectors[s] = timing.sectors[s];
    }
    completeLap();
  }
  prevFraction = fraction;
}

function resetToTrack() {
  const d = car.locate.distance;
  car.reset(d);
  car.tyreWear = Math.max(0, car.tyreWear - 0.05);
  timing.validLap = false;
  hud.flash('Car reset', 1200, '#7ad7ff');
}

/* ================================================================== */
/* Start lights                                                        */
/* ================================================================== */

const lightsEl = document.getElementById('startLights');
const lightBulbs = [];
for (let i = 0; i < 5; i++) {
  const col = document.createElement('div');
  col.className = 'lcol';
  const a = document.createElement('span');
  const b = document.createElement('span');
  col.append(a, b);
  lightsEl.appendChild(col);
  lightBulbs.push(b);
}

function beginStartSequence() {
  lightsStage = -1;
  lightsTimer = 0;
  started = false;
  car.reset(PLAYER_START);
  prevFraction = track.fraction(PLAYER_START);
  raceLap = -1;
  raceOver = false;
  raceTime = 0;
  field.formGrid(POLE_DISTANCE);
  timing.armed = false;
  timing.lap = 0;
  beginLap();
  timing.current = 0;
  commentary.lastPosition = null;
  commentary.lastLap = -99;

  // Put the rig on the grid before the montage runs, so the closing hero shot
  // frames the car where it will actually start from.
  rig.position.copy(car.position);
  rig.rotation.set(0, car.yaw + Math.PI, 0);
  rig.updateMatrixWorld(true);

  hudEl.classList.add('hidden');
  brollTime = 0;
  broll.play(entry, armLights);
  commentary.intro();
}

/** Hand over from the B-roll to the countdown. */
function armLights() {
  hudEl.classList.remove('hidden');
  lightsStage = 0;
  lightsTimer = 0;
  lightsEl.classList.remove('hidden');
  commentary.gridFormed(entry, 10);
}

function updateLights(dt) {
  if (lightsStage < 0) return;
  lightsTimer += dt;
  if (lightsStage < 5) {
    if (lightsTimer > 0.85) {
      lightBulbs[lightsStage].classList.add('on');
      lightsStage++;
      lightsTimer = 0;
    }
  } else if (lightsStage === 5) {
    if (lightsTimer > 1.1 + Math.random() * 0.9) {
      lightBulbs.forEach((b) => b.classList.remove('on'));
      lightsEl.classList.add('hidden');
      lightsStage = -1;
      started = true;
      timing.current = 0;
      timing.splits.fill(NaN);
      timing.sectorStart = 0;
      hud.flash('LIGHTS OUT — GO!', 1600, '#33ff88');
      commentary.lightsOut();
    }
  }
}

/* ================================================================== */
/* Cameras                                                             */
/* ================================================================== */

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let shake = 0;

function updateCamera(dt) {
  const fwd = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, fwd).negate();

  const speedFov = 46 + THREE.MathUtils.clamp(car.speed / 95, 0, 1) * 13 +
                   (car.drs ? 3 : 0);
  const mode = CAMERAS[cameraMode];

  cockpit.group.visible = mode === 'Cockpit' || mode === 'Helmet';
  body.visible = mode === 'Chase' || mode === 'TV' || mode === 'T-Cam';

  if (mode === 'Cockpit' || mode === 'Helmet') {
    camera.fov += (speedFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();

    const eye = mode === 'Helmet'
      ? new THREE.Vector3(0, 0.05, -0.10)
      : new THREE.Vector3(0, 0, 0);
    camera.position.copy(rig.localToWorld(
      cockpit.group.position.clone().add(eye)));

    // driver looks slightly into the corner, eyeline a touch below the horizon
    // so the top of the steering wheel and its display stay in frame
    const lookAhead = fwd.clone().multiplyScalar(40)
      .addScaledVector(right, car.steer * 8 + car.yawRate * 7)
      .add(new THREE.Vector3(0, -3.6, 0));
    camLook.copy(camera.position).add(lookAhead);
    camera.up.set(0, 1, 0);
    camera.lookAt(camLook);
    camera.rotateZ(-car.bodyRoll * 1.1);
    camera.rotateX(car.bodyPitch * 0.6);
  } else if (mode === 'T-Cam') {
    camera.fov += (54 - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
    camPos.copy(car.position).addScaledVector(fwd, -0.15).add(new THREE.Vector3(0, 1.35, 0));
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(camPos.clone().addScaledVector(fwd, 40).add(new THREE.Vector3(0, -3, 0)));
  } else if (mode === 'Chase') {
    camera.fov += (62 - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
    const target = car.position.clone()
      .addScaledVector(fwd, -8.5 - car.speed * 0.02)
      .add(new THREE.Vector3(0, 3.0, 0));
    // carry the camera along at the car's velocity first, otherwise a plain lerp
    // leaves it tens of metres adrift at 300 km/h
    camera.position.x += car.velocity.x * dt;
    camera.position.z += car.velocity.y * dt;
    camera.position.lerp(target, Math.min(1, dt * 6));
    camera.up.set(0, 1, 0);
    camera.lookAt(car.position.clone().addScaledVector(fwd, 12).add(new THREE.Vector3(0, 0.6, 0)));
  } else {
    // Trackside TV camera: sits on the outside of the circuit ahead of the car
    camera.fov += (34 - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
    const s = track.sampleAt(car.locate.distance + 70);
    // curvature > 0 is a left-hander, so the outside of the corner is to the right
    const side = Math.sign(track.curvature[s.index]) || 1;
    camPos.copy(s.point).addScaledVector(s.right, side * 34).setY(s.point.y + 11);
    camera.position.lerp(camPos, Math.min(1, dt * 2.5));
    camera.up.set(0, 1, 0);
    camera.lookAt(car.position.clone().setY(car.position.y + 0.5));
  }

  // Vibration: engine idle, speed, kerbs and impacts
  shake = Math.max(shake * Math.pow(0.02, dt), car.wallHit);
  car.wallHit *= Math.pow(0.05, dt);
  if (mode === 'Cockpit' || mode === 'Helmet' || mode === 'T-Cam') {
    const t = performance.now() / 1000;
    const base = 0.0016 + car.speed * 0.000045;
    const kerb = car.kerbShake * 0.02;
    const amp = base + kerb + shake * 0.16 + car.slip * 0.004;
    camera.position.x += Math.sin(t * 47.3) * amp;
    camera.position.y += Math.sin(t * 61.7) * amp * 1.4 + Math.sin(t * 121) * base * 0.6;
    camera.position.z += Math.cos(t * 53.1) * amp;
    camera.rotateZ(Math.sin(t * 39) * amp * 0.6);
  }
}

/* ================================================================== */
/* Loop                                                                */
/* ================================================================== */

/** Switch the weather. Drives the visuals, the rain bed and the grip. */
function setRain(on) {
  rain.setActive(on);
  car.weatherGrip = rain.grip;
  audio.setRain(on);
  hud.flash(on ? 'Rain — track is wet' : 'Rain stopped', 1600, on ? '#7ad7ff' : '#ffe066');
}

const PHYS_DT = 1 / 120;
let accumulator = 0;
let lastTime = performance.now();
let fraction = 0;
let lastGear = 1;
let wheelAngle = 0;
let brollTime = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.25) dt = 0.25;
  if (paused) { renderer.render(scene, camera); return; }

  // Pre-race montage: nobody is driving, so the sim is held still and only the
  // montage camera and the crowd animate.
  if (broll.active) {
    brollTime += dt;
    cockpit.group.visible = false;
    body.visible = true;
    world.update(brollTime);
    broll.update(dt);
    rain.update(dt);
    audio.update(car, dt);
    renderer.render(scene, camera);
    return;
  }

  readInput(dt);
  updateLights(dt);

  accumulator += dt;
  let guard = 0;
  while (accumulator >= PHYS_DT && guard++ < 8) {
    fraction = car.update(PHYS_DT, input);
    updateTiming(PHYS_DT, fraction);
    accumulator -= PHYS_DT;
  }
  input.shiftUp = false;
  input.shiftDown = false;

  // The AI runs on the frame clock: it is kinematic, so it does not need the
  // fixed physics step the player's car does.
  raceTime += dt;
  // Before the player's first crossing everyone is still on the approach to
  // the line, so the lap counter is -1 and race distances are negative.
  const playerTotal = raceLap * track.length + car.locate.distance;
  field.update(dt, raceTime, started && !raceOver, playerTotal);
  const standing = field.playerStanding();
  world.update(raceTime);

  commentary.update(dt, {
    racing: started && !raceOver,
    standing,
    raceLap,
    totalLaps: RACE_LAPS,
    offTrack: Math.abs(car.locate.lateral) > TRACK_LIMIT,
    wallHit: car.wallHit,
    drsAvailable: car.drsAvailable,
    cornerName: track.cornerNameAt(fraction),
  });

  if (car.gear > lastGear) audio.shift();
  lastGear = car.gear;

  // Sync the visual rig with the physics state
  rig.position.copy(car.position);
  rig.rotation.set(0, car.yaw + Math.PI, 0);
  rig.rotation.z = car.bodyRoll;
  rig.rotation.x = car.bodyPitch;

  // External body: rolling wheels, steered fronts and a DRS flap that opens.
  if (body.visible) {
    wheelAngle -= (car.speed * dt) / 0.36;
    const wheels = body.userData.wheels;
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].userData.spin.rotation.x = wheelAngle;
      // The two front wheels steer; -1 matches the cockpit's hub convention.
      if (i < 2) wheels[i].rotation.y = -car.steer / 0.30 * 0.42;
    }
    const flap = body.userData.drsFlap;
    const wanted = car.drs ? -0.06 : -0.62;
    flap.rotation.x += (wanted - flap.rotation.x) * Math.min(1, dt * 8);
  }

  cockpit.update(dt, car, {
    rpm: car.rpm,
    maxRpm: SPEC.maxRpm,
    gear: car.reversing ? 'R' : car.gear,
    kph: car.speedKph,
    lapTime: formatTime(timing.current).slice(0, 8),
    lap: Math.max(1, timing.lap),
    ers: car.ers / SPEC.ersCapacity,
    ersDeploy: car.ersDeploy,
    drs: car.drs,
    drsAvailable: car.drsAvailable,
    fuel: car.fuel,
    tyreTemp: car.tyreTemp,
    delta: timing.delta ?? 0,
    deltaText: timing.delta == null ? '--.---'
      : `${timing.delta >= 0 ? '+' : '-'}${(Math.abs(timing.delta) / 1000).toFixed(3)}`,
  });

  updateCamera(dt);
  rain.update(dt);
  audio.update(car, dt);
  hud.update(car, timing, { fraction, cameraName: CAMERAS[cameraMode], standing }, dt);

  const cockpitView = cameraMode === 0 || cameraMode === 1;
  if (cockpitView && (mirrorTick++ & 1) === 0) renderMirrors();

  renderer.render(scene, camera);
}

/* ================================================================== */
/* Boot                                                                */
/* ================================================================== */

/* ---- driver / team selection ---------------------------------- */
const driverScreen = document.getElementById('driverScreen');
const teamGrid = document.getElementById('teamGrid');
const goBtn = document.getElementById('goBtn');
let pickedCode = null;

function hex(c) {
  return '#' + c.toString(16).padStart(6, '0');
}

/** Relative luminance, used to pick readable text over a livery colour. */
function luminance(c) {
  return (((c >> 16) & 255) * 0.2126 + ((c >> 8) & 255) * 0.7152 + (c & 255) * 0.0722) / 255;
}

for (const team of TEAMS) {
  const card = document.createElement('div');
  card.className = 'teamcard';
  card.style.setProperty('--team', hex(team.primary));
  card.style.setProperty('--accentcol', hex(team.accent));
  card.style.setProperty('--label', luminance(team.primary) > 0.6 ? '#101216' : '#ffffff');
  // A very dark accent (Sauber's black) would be unreadable as small text, so
  // the number falls back to the team's main colour.
  card.style.setProperty('--numcol',
    luminance(team.accent) < 0.25 ? hex(team.primary) : hex(team.accent));

  const name = document.createElement('div');
  name.className = 'tname';
  name.textContent = team.short.toUpperCase();
  card.appendChild(name);

  for (const d of team.drivers) {
    const btn = document.createElement('button');
    btn.className = 'drivopt';
    btn.dataset.code = d.code;
    btn.innerHTML =
      `<span class="dcode">${d.code}</span>` +
      `<span class="dname">${d.first} ${d.last}</span>` +
      `<span class="dnum">#${d.number}</span>`;
    btn.addEventListener('click', () => {
      teamGrid.querySelectorAll('.drivopt.sel').forEach((n) => n.classList.remove('sel'));
      btn.classList.add('sel');
      pickedCode = d.code;
      goBtn.disabled = false;
    });
    card.appendChild(btn);
  }
  teamGrid.appendChild(card);
}

document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('startScreen').classList.add('hidden');
  driverScreen.classList.remove('hidden');
});

/* ---- commentary language ------------------------------------- */
const langPick = document.getElementById('langPick');
let pickedLang = LANGUAGES[0].id;

for (const lang of LANGUAGES) {
  const btn = document.createElement('button');
  btn.dataset.lang = lang.id;
  btn.innerHTML = `<span>${lang.label}</span><span class="lnote">${lang.note}</span>`;
  if (lang.id === pickedLang) btn.classList.add('sel');
  btn.addEventListener('click', () => {
    langPick.querySelectorAll('button.sel').forEach((n) => n.classList.remove('sel'));
    btn.classList.add('sel');
    pickedLang = lang.id;
  });
  langPick.appendChild(btn);
}

goBtn.addEventListener('click', () => {
  if (!pickedCode) return;
  driverScreen.classList.add('hidden');
  commentary.setLanguage(pickedLang);
  commentary.setEnabled(document.getElementById('commentaryToggle').checked);
  chooseDriver(pickedCode);
  audio.start();
  setRain(document.getElementById('rainToggle').checked);
  beginStartSequence();
});

document.getElementById('resumeBtn').addEventListener('click', () => {
  paused = false;
  document.getElementById('pauseScreen').classList.add('hidden');
});

document.getElementById('lapLen').textContent = (track.length / 1000).toFixed(3);
document.getElementById('turnCount').textContent = track.turnCount;
car.reset(PLAYER_START);
prevFraction = track.fraction(PLAYER_START);
field.formGrid(POLE_DISTANCE);

// Exposed for debugging / telemetry from the console.
window.f1 = {
  car, track, timing, input, field, commentary, broll, rain, renderer, camera, scene,
  chooseDriver, setRain,
  get started() { return started; },
};

requestAnimationFrame(frame);
