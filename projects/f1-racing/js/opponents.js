import * as THREE from 'three';
import { HALF_WIDTH } from './track.js';
import { buildCarBody } from './carbody.js';
import { opponentsFor } from './teams.js';

/**
 * The rest of the grid.
 *
 * The opponents are not physics cars — running ten full vehicle models would
 * cost more than it is worth and would make them spin off on their own. They
 * are driven along a pre-computed racing line at a pre-computed speed profile,
 * which is how a real driver-in-the-loop simulator handles traffic: the line
 * and the speed are correct, and the interesting behaviour (defending,
 * slipstreaming, making mistakes) is layered on top.
 */

const GRID_SIZE = 9;

/** Grip the AI is willing to use laterally, in g. Below the player's limit. */
const AI_LAT_G = 1.62;
/** Longitudinal limits, m/s^2. */
const AI_BRAKE = 34;
const AI_ACCEL = 14;
/** Cars run this far inside the white line at the very edge. */
const LINE_MARGIN = 1.8;
/** Half the width of a car, for side-by-side spacing. */
const CAR_HALF = 1.05;

/**
 * Relaxes a lateral offset profile toward the shortest path around the lap.
 * The shortest path clips every apex and runs wide on the exits, which is a
 * very close stand-in for a real racing line and — unlike a hand-tuned
 * heuristic — it is guaranteed to stay on the road.
 */
function solveRacingLine(track) {
  const n = track.sampleCount;
  const limit = HALF_WIDTH - LINE_MARGIN;
  const lat = new Float32Array(n);
  const next = new Float32Array(n);

  for (let pass = 0; pass < 400; pass++) {
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      const pa = track.points[a], pb = track.points[b];
      const ra = track.rights[a], rb = track.rights[b];
      // midpoint of the neighbours, in world space
      const mx = (pa.x + ra.x * lat[a] + pb.x + rb.x * lat[b]) / 2;
      const mz = (pa.z + ra.z * lat[a] + pb.z + rb.z * lat[b]) / 2;
      // project it back onto this sample's lateral axis
      const p = track.points[i], r = track.rights[i];
      const proj = (mx - p.x) * r.x + (mz - p.z) * r.z;
      next[i] = THREE.MathUtils.clamp(lat[i] + (proj - lat[i]) * 0.45, -limit, limit);
    }
    lat.set(next);
  }
  return lat;
}

/** Curvature of the racing line itself, sample by sample. */
function lineCurvature(track, lat) {
  const n = track.sampleCount;
  const pos = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = track.points[i], r = track.rights[i];
    pos[i * 2] = p.x + r.x * lat[i];
    pos[i * 2 + 1] = p.z + r.z * lat[i];
  }

  const curv = new Float32Array(n);
  const S = 4;                                  // samples either side
  for (let i = 0; i < n; i++) {
    const a = (i - S + n) % n, b = (i + S) % n;
    const ax = pos[a * 2], az = pos[a * 2 + 1];
    const bx = pos[i * 2], bz = pos[i * 2 + 1];
    const cx = pos[b * 2], cz = pos[b * 2 + 1];
    // Menger curvature: 4 * triangle area / product of the three side lengths
    const area = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
    const l1 = Math.hypot(bx - ax, bz - az);
    const l2 = Math.hypot(cx - bx, cz - bz);
    const l3 = Math.hypot(cx - ax, cz - az);
    const denom = l1 * l2 * l3;
    curv[i] = denom > 1e-6 ? (4 * area) / denom : 0;
  }
  return curv;
}

/**
 * Forward/backward pass over the lap producing the fastest speed that respects
 * grip in the corners, braking into them and traction out of them. This is the
 * same algorithm a lap-time simulation uses.
 */
function solveSpeedProfile(track, curv) {
  const n = track.sampleCount;
  const ds = track.sampleSpacing;
  const v = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const r = curv[i] > 1e-6 ? 1 / curv[i] : 1e6;
    v[i] = Math.min(92, Math.sqrt(AI_LAT_G * 9.81 * r));   // 92 m/s ~ 331 km/h
  }

  // Two laps' worth of passes so the limits propagate across the start line.
  for (let pass = 0; pass < 2; pass++) {
    for (let k = n - 1; k >= 0; k--) {            // braking, walking backwards
      const j = (k + 1) % n;
      const cap = Math.sqrt(v[j] * v[j] + 2 * AI_BRAKE * ds);
      if (v[k] > cap) v[k] = cap;
    }
    for (let k = 0; k < n; k++) {                 // traction, walking forwards
      const j = (k - 1 + n) % n;
      const cap = Math.sqrt(v[j] * v[j] + 2 * AI_ACCEL * ds);
      if (v[k] > cap) v[k] = cap;
    }
  }
  return v;
}

class Opponent {
  constructor(spec, index, track, line, speeds) {
    this.spec = spec;
    this.code = spec.code;
    this.team = spec.teamName || spec.team;
    this.name = spec.name || spec.code;
    this.index = index;
    this.track = track;
    this.line = line;
    this.speeds = speeds;

    this.distance = 0;
    this.lap = 0;
    this.speed = 0;
    this.lateral = 0;
    this.targetLateral = 0;
    this.yaw = 0;

    // Each driver has a slightly different natural pace and a slow wander in
    // form over the lap, so the field spreads out the way a real one does.
    // Real pace values sit within a couple of percent of each other, which is
    // far too tight for a three-lap sprint, so the spread is stretched out.
    this.pace = 1 - (1 - spec.pace) * 6;
    this.phase = Math.random() * Math.PI * 2;

    this.mesh = buildCarBody(spec);
    this.mesh.visible = false;
    this._wheelAngle = 0;
  }

  get totalDistance() { return this.lap * this.track.length + this.distance; }

  placeOnGrid(distance, side) {
    this.distance = distance;
    // Everyone is still on the approach to the line, so lap 0 has not started.
    this.lap = -1;
    this.speed = 0;
    this.lateral = side * 3.0;
    this.targetLateral = this.lateral;
    this.mesh.visible = true;
    this._syncMesh();
  }

  /** Reference speed for a point on the lap, including this driver's pace. */
  _reference(distance, t) {
    const s = this.track.sampleAt(distance);
    const form = 1 + Math.sin(t * 0.21 + this.phase) * 0.012;
    return this.speeds[s.index] * this.pace * form;
  }

  update(dt, t, field) {
    const track = this.track;

    // --- longitudinal: chase the reference speed, but look ahead so the car
    // brakes for the corner rather than arriving at it too fast ---
    let target = this._reference(this.distance, t);
    const look = Math.max(30, this.speed * 1.5);
    for (let d = 10; d <= look; d += 10) {
      const ahead = this._reference(this.distance + d, t);
      // v^2 = u^2 + 2as, solved for the entry speed this braking point allows
      const allowed = Math.sqrt(ahead * ahead + 2 * AI_BRAKE * d);
      if (allowed < target) target = allowed;
    }

    // --- traffic ---
    const ahead = field.carAhead(this);
    if (ahead) {
      if (ahead.gap < 26) {
        // In the slipstream: less drag, so more straight-line speed.
        target *= 1 + (1 - ahead.gap / 26) * 0.045;
      }
      // Only back off for a car actually occupying this piece of road.
      const overlapping = Math.abs(ahead.lateral - this.lateral) < 2 * CAR_HALF;
      const safe = 7 + this.speed * 0.18;
      if (overlapping && ahead.gap < safe) {
        target = Math.min(target, ahead.speed * (0.35 + 0.65 * (ahead.gap / safe)));
      }
    }

    // Rate-limit the speed change so a big delta cannot teleport the car, and
    // let the quicker drivers get off the line marginally better.
    const delta = target - this.speed;
    const step = (delta > 0 ? AI_ACCEL * this.pace : AI_BRAKE) * dt;
    this.speed += THREE.MathUtils.clamp(delta, -step, step);
    if (this.speed < 0) this.speed = 0;

    // --- lateral: the racing line, plus a move off it to pass or defend ---
    const here = track.sampleAt(this.distance);
    let want = this.line[here.index];

    if (ahead && ahead.gap < 45 && this.speed > 15) {
      // Pull out to the side with more room and commit to the move.
      const room = ahead.lateral > 0 ? -1 : 1;
      const urge = THREE.MathUtils.clamp(1 - ahead.gap / 45, 0, 1);
      want += room * urge * (HALF_WIDTH - LINE_MARGIN - Math.abs(want)) * 0.9;
    }

    const behind = field.carBehind(this);
    if (behind && behind.gap < 18 && this.speed > 20) {
      // Defend by covering the inside line into the next corner.
      const curv = track.curvature[here.index];
      if (Math.abs(curv) > 0.004) want -= Math.sign(curv) * 1.4;
    }

    this.targetLateral = THREE.MathUtils.clamp(
      want, -(HALF_WIDTH - LINE_MARGIN), HALF_WIDTH - LINE_MARGIN);

    // Cars cannot change line instantly, and less so at speed. About 2 m/s of
    // lateral movement at low speed, tailing off as the aero load builds.
    const rate = 2.4 / (1 + this.speed / 55);
    this.lateral += THREE.MathUtils.clamp(
      this.targetLateral - this.lateral, -rate * dt, rate * dt);

    // Side by side: give way rather than occupy the same piece of road. The
    // tie-break is by grid index so the pair always separates instead of both
    // cars pushing the same way.
    const beside = field.carBeside(this);
    if (beside) {
      const diff = this.lateral - beside.lateral;
      const push = Math.abs(diff) > 0.05
        ? Math.sign(diff)
        : (this.index < (beside.car ? beside.car.index : 99) ? -1 : 1);
      this.lateral = THREE.MathUtils.clamp(
        this.lateral + push * dt * 3.0, -(HALF_WIDTH - 0.6), HALF_WIDTH - 0.6);
    }

    // --- integrate ---
    this.distance += this.speed * dt;
    if (this.distance >= track.length) {
      this.distance -= track.length;
      this.lap++;
    }

    // Rolling wheels: without this the cars look like they are being dragged.
    this._wheelAngle -= (this.speed * dt) / 0.36;
    for (const w of this.mesh.userData.wheels) w.userData.spin.rotation.x = this._wheelAngle;

    this._syncMesh();
  }

  _syncMesh() {
    const s = this.track.sampleAt(this.distance);
    const p = this.mesh.position;
    p.set(
      s.point.x + s.right.x * this.lateral,
      s.point.y,
      s.point.z + s.right.z * this.lateral,
    );
    // The body points along the track, leaning into the corner a little.
    const yaw = Math.atan2(s.tangent.x, s.tangent.z) + Math.PI;
    this.yaw = yaw;
    this.mesh.rotation.set(0, yaw, 0);
    const curv = this.track.curvature[s.index];
    this.mesh.rotation.z = THREE.MathUtils.clamp(curv * this.speed * this.speed * 0.0009, -0.09, 0.09);
  }
}

export class Field {
  /**
   * @param {Track} track
   * @param {Car} player  the human car, so it takes part in the standings
   * @param {number} laps race distance
   */
  constructor(scene, track, player, laps = 3) {
    this.scene = scene;
    this.track = track;
    this.player = player;
    this.laps = laps;
    this.finished = false;

    this.line = solveRacingLine(track);
    this.curv = lineCurvature(track, this.line);
    this.speeds = solveSpeedProfile(track, this.curv);

    this.cars = [];
    this.order = [];
    this.playerEntry = { code: 'YOU', team: 'You', isPlayer: true, position: 1, gapAhead: 0, gapBehind: 0 };
    this.setRoster(opponentsFor(null, GRID_SIZE));
  }

  /**
   * Replaces the field with a new set of drivers. Called once the player picks
   * a seat, so nobody ends up racing against themselves.
   */
  setRoster(entries) {
    for (const c of this.cars) {
      this.scene.remove(c.mesh);
      c.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    this.roster = entries;
    this.cars = entries.map((spec, i) => new Opponent(spec, i, this.track, this.line, this.speeds));
    for (const c of this.cars) this.scene.add(c.mesh);
    this.order = [];
  }

  /** Sets the player's own code so the timing tower reads correctly. */
  setPlayerEntry(entry) {
    this.playerEntry.code = entry.code;
    this.playerEntry.team = entry.teamName;
    this.playerEntry.name = entry.name;
  }

  /**
   * Lines the field up on the grid. The player starts at the back, which is
   * the only arrangement that makes a three-lap race interesting.
   */
  formGrid(startDistance) {
    const ROW = 12;     // metres between rows
    this.cars.forEach((c, i) => {
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      let d = startDistance - row * ROW;
      if (d < 0) d += this.track.length;
      c.placeOnGrid(d, side);
    });
    this.finished = false;
    this._rebuildOrder(0);
  }

  /** Everything on track, ordered by race distance covered. */
  _rebuildOrder(playerTotal) {
    const entries = this.cars.map((c) => ({
      car: c, code: c.code, team: c.team, total: c.totalDistance,
      distance: c.distance, lateral: c.lateral, speed: c.speed, isPlayer: false,
    }));
    const pe = this.playerEntry;
    pe.total = playerTotal;
    pe.distance = this.player.locate.distance;
    pe.lateral = this.player.locate.lateral;
    pe.speed = this.player.speed;
    entries.push(pe);

    entries.sort((a, b) => b.total - a.total);
    entries.forEach((e, i) => { e.position = i + 1; });
    this.order = entries;
  }

  /** Nearest car in front of `me` on the road, wrapping across the line. */
  carAhead(me) {
    return this._nearest(me, 1);
  }

  carBehind(me) {
    return this._nearest(me, -1);
  }

  _nearest(me, dir) {
    const L = this.track.length;
    let best = null;
    for (const e of this.order) {
      if (e.car === me) continue;
      let gap = (e.distance - me.distance) * dir;
      if (gap < 0) gap += L;
      // A car within a couple of metres is alongside, not in front: treating it
      // as the car ahead would make two cars on the same row each wait for the
      // other and the whole grid would never move.
      if (gap < 3 || gap > L / 2) continue;
      if (!best || gap < best.gap) {
        best = { gap, lateral: e.lateral, speed: e.speed, entry: e };
      }
    }
    return best;
  }

  /** A car alongside, within a car length, that needs room. */
  carBeside(me) {
    const L = this.track.length;
    for (const e of this.order) {
      if (e.car === me) continue;
      let gap = e.distance - me.distance;
      if (gap > L / 2) gap -= L;
      if (gap < -L / 2) gap += L;
      if (Math.abs(gap) > 5) continue;
      if (Math.abs(e.lateral - me.lateral) < 2 * CAR_HALF) return e;
    }
    return null;
  }

  update(dt, t, racing, playerTotal) {
    this._rebuildOrder(playerTotal);
    if (!racing) {
      // Held on the grid: keep the meshes where they are but let the engines idle.
      for (const c of this.cars) c._syncMesh();
      return;
    }
    for (const c of this.cars) c.update(dt, t, this);
    this._rebuildOrder(playerTotal);
  }

  /** Position, and the gaps to the cars either side of the player, in seconds. */
  playerStanding() {
    const pe = this.playerEntry;
    const i = this.order.indexOf(pe);
    const ref = Math.max(this.player.speed, 12);
    const ahead = this.order[i - 1];
    const behind = this.order[i + 1];
    return {
      position: pe.position,
      total: this.order.length,
      ahead: ahead ? { code: ahead.code, gap: (ahead.total - pe.total) / ref } : null,
      behind: behind ? { code: behind.code, gap: (pe.total - behind.total) / ref } : null,
    };
  }
}
