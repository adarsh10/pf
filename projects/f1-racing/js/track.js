import * as THREE from 'three';

/**
 * Buddh International Circuit (Greater Noida, India).
 *
 * The circuit is described as a closed polygon of junctions with a circular
 * fillet arc dropped into each one. Every straight is a real straight and every
 * corner is a true circular arc of the radius written below, so the tight
 * infield really is second- and third-gear stuff while the long banked right at
 * Turns 10-11 stays flat.
 *
 * Laying it out this way means the lap closes by construction — there is no
 * fudge factor — and the shape on the minimap is the shape drawn here. The
 * junction coordinates come from `tools/solve-layout.mjs`, which takes a
 * per-corner "turn this many degrees, then run this far" plan and solves it for
 * closure.
 *
 * Coordinates are metres in map space: +x east, +y north. The lap runs
 * clockwise and is overwhelmingly right-handed, which matches Buddh.
 *
 * `elev` is metres above the start/finish datum. Buddh is built into a natural
 * rise: the track climbs steadily out of Turn 1 to a blind crest at Turn 3,
 * then falls away all the way down the back straight into the Turn 4 braking
 * zone, which is the biggest stop on the lap.
 */
const LAYOUT = [
  // --- Turns 1-3: the climb away from the pit straight to the blind crest ---
  { at: [0, 0], radius: 110, name: 'Turn 1', elev: 2 },
  { at: [51, -252], radius: 55, name: 'Turn 2', elev: 8 },
  { at: [166, -368], radius: 65, name: 'Turn 3', elev: 14, drsAfter: true },

  // --- The 1.1 km back straight, dropping downhill into the heaviest stop ---
  { at: [-816, -941], radius: 40, name: 'Turn 4', elev: 1 },

  // --- Infield esses ---
  { at: [-1026, -769], radius: 60, name: 'Turn 5', elev: 0 },
  { at: [-1398, -764], radius: 45, name: 'Turn 6', elev: 1 },
  { at: [-1478, -636], radius: 50, name: 'Turn 7', elev: 3 },
  { at: [-1818, -595], radius: 40, name: 'Turn 8', elev: 4 },
  { at: [-1842, -491], radius: 70, name: 'Turn 9', elev: 5 },

  // --- Turns 10-11: the long banked double-apex right, taken in one arc ---
  { at: [-2075, -305], radius: 150, name: 'Turn 10', elev: 6 },
  { at: [-2021, -56], radius: 170, name: 'Turn 11', elev: 6 },

  // --- The final complex back onto the pit straight ---
  { at: [-1794, -6], radius: 55, name: 'Turn 12', elev: 5 },
  { at: [-1624, -112], radius: 60, name: 'Turn 13', elev: 4 },
  { at: [-1514, -33], radius: 50, name: 'Turn 14', elev: 3 },
  { at: [-1380, -74], radius: 45, name: 'Turn 15', elev: 2 },
  { at: [-1233, 0], radius: 90, name: 'Turn 16', elev: 1, drsAfter: true },
];

export const ROAD_WIDTH = 16;       // metres, permanent-circuit width
export const HALF_WIDTH = ROAD_WIDTH / 2;

/**
 * Uniform scale on the junction coordinates, tuned so the filleted lap comes
 * out at the real 5.125 km. Corner radii are deliberately left unscaled so
 * they stay exactly the values written in LAYOUT.
 */
const LAYOUT_SCALE = 0.969;

/** Sector split points (lap fraction). */
export const SECTORS = [0, 0.26, 0.67];

/** Spacing of the generated centreline samples, in metres. */
const SAMPLE_SPACING = 2;

/** How far along the pit straight the start/finish line sits, from Turn 16. */
const START_OFFSET = 380;

/** A corner tighter than this is called out by name; the rest are flat kinks. */
const NAMED_RADIUS = 220;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len2 = (v) => Math.hypot(v[0], v[1]);
const norm = (v) => { const l = len2(v) || 1; return [v[0] / l, v[1] / l]; };

/**
 * Fits a circular arc of the requested radius into every junction and returns
 * the resulting centreline, the arc-length span of each corner and each
 * straight, and the radius actually achieved.
 *
 * If a junction is too tight for its radius — the tangent lengths would eat
 * more than the edge between two corners can give — the radius is reduced to
 * whatever fits, so the geometry always stays valid.
 */
function buildGeometry(step) {
  const n = LAYOUT.length;
  const V = LAYOUT.map((v) => [v.at[0] * LAYOUT_SCALE, v.at[1] * LAYOUT_SCALE]);

  // First pass: work out the tangent length each corner needs.
  const corner = LAYOUT.map((v, i) => {
    const here = V[i];
    const prev = V[(i - 1 + n) % n];
    const next = V[(i + 1) % n];
    const inDir = norm(sub(here, prev));
    const outDir = norm(sub(next, here));
    const crossZ = inDir[0] * outDir[1] - inDir[1] * outDir[0];
    const dot = inDir[0] * outDir[0] + inDir[1] * outDir[1];
    const turn = Math.atan2(crossZ, dot);           // + is a left-hand corner
    const half = Math.abs(turn) / 2;
    return {
      inDir, outDir, turn,
      radius: v.radius,
      tangent: half < 1e-4 ? 0 : v.radius * Math.tan(half),
      edgeIn: len2(sub(here, prev)),
    };
  });

  // Second pass: shrink any radius whose tangents overrun the adjoining edge.
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const edge = corner[j].edgeIn;
      const need = corner[i].tangent + corner[j].tangent;
      const room = edge - 6;                        // keep 6 m of real straight
      if (need <= room) continue;
      const k = room / need;
      for (const c of [corner[i], corner[j]]) {
        c.tangent *= k;
        const half = Math.abs(c.turn) / 2;
        c.radius = half < 1e-4 ? c.radius : c.tangent / Math.tan(half);
      }
      changed = true;
    }
    if (!changed) break;
  }

  // Third pass: emit the path. Each junction contributes the straight that
  // leads into it followed by its arc.
  const pts = [];
  const spans = [];                                 // { kind, from, to, at }
  let travelled = 0;

  const arcStart = (i) => {
    const c = corner[i], p = V[i];
    return [p[0] - c.inDir[0] * c.tangent, p[1] - c.inDir[1] * c.tangent];
  };
  const arcEnd = (i) => {
    const c = corner[i], p = V[i];
    return [p[0] + c.outDir[0] * c.tangent, p[1] + c.outDir[1] * c.tangent];
  };

  for (let i = 0; i < n; i++) {
    const from = arcEnd((i - 1 + n) % n);
    const to = arcStart(i);
    const seg = sub(to, from);
    const sLen = len2(seg);

    // straight
    if (sLen > 1e-6) {
      const steps = Math.max(1, Math.round(sLen / step));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        pts.push([from[0] + seg[0] * t, from[1] + seg[1] * t]);
      }
      spans.push({ kind: 'straight', at: (i - 1 + n) % n, from: travelled, to: travelled + sLen });
      travelled += sLen;
    }

    // arc
    const c = corner[i];
    if (c.tangent > 1e-6) {
      const sign = Math.sign(c.turn);
      const sweep = Math.abs(c.turn);
      const nx = -c.inDir[1] * sign, ny = c.inDir[0] * sign;   // toward the inside
      const cx = to[0] + nx * c.radius, cy = to[1] + ny * c.radius;
      const vx = -nx * c.radius, vy = -ny * c.radius;
      const aLen = c.radius * sweep;
      const steps = Math.max(2, Math.round(aLen / step));
      for (let k = 0; k < steps; k++) {
        const t = sign * sweep * (k / steps);
        const ct = Math.cos(t), st = Math.sin(t);
        pts.push([cx + vx * ct - vy * st, cy + vx * st + vy * ct]);
      }
      spans.push({ kind: 'corner', at: i, from: travelled, to: travelled + aLen });
      travelled += aLen;
    }
  }

  return { pts, spans, corner, total: travelled };
}

export const TRACK_LENGTH = Math.round(buildGeometry(40).total);

export class Track {
  constructor() {
    const geo = buildGeometry(1);
    this.length = geo.total;

    this._buildSamples(geo);
    this._buildElevation(geo);
    this._buildSpatialIndex();
    this._analyse(geo);
  }

  /** Resample the generated path to a uniform ~2 m spacing. */
  _buildSamples(geo) {
    const src = geo.pts;
    const m = src.length;

    const cum = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) {
      const a = src[i], b = src[(i + 1) % m];
      cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const total = cum[m];

    const n = Math.round(total / SAMPLE_SPACING);
    this.sampleCount = n;
    this.sampleSpacing = total / n;
    this.length = total;
    this.startIndex = Math.round(START_OFFSET / this.sampleSpacing) % n;

    this.points = new Array(n);
    let cursor = 0;
    for (let i = 0; i < n; i++) {
      const target = i * this.sampleSpacing;
      while (cursor < m - 1 && cum[cursor + 1] < target) cursor++;
      const span = cum[cursor + 1] - cum[cursor];
      const t = span > 1e-9 ? (target - cum[cursor]) / span : 0;
      const a = src[cursor], b = src[(cursor + 1) % m];
      // map space (x east, y north) becomes world space (x east, z south)
      this.points[i] = new THREE.Vector3(
        a[0] + (b[0] - a[0]) * t,
        0,
        -(a[1] + (b[1] - a[1]) * t),
      );
    }

    this.tangents = new Array(n);
    this.rights = new Array(n);
    this.distances = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const prev = this.points[(i - 1 + n) % n];
      const next = this.points[(i + 1) % n];
      const t = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
      this.tangents[i] = t;
      // True right-hand normal: forward cross up.
      this.rights[i] = new THREE.Vector3(-t.z, 0, t.x);
      this.distances[i] = ((i - this.startIndex + n) % n) * this.sampleSpacing;
    }

    // Signed curvature from heading change over arc length; positive = left.
    const rawCurv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = this.tangents[(i - 2 + n) % n];
      const b = this.tangents[(i + 2) % n];
      let d = Math.atan2(b.x, b.z) - Math.atan2(a.x, a.z);
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      rawCurv[i] = -d / (4 * this.sampleSpacing);
    }

    // Smooth so corner entries and exits read as transitions, not steps.
    const smooth = new Float32Array(n);
    const W = 5;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -W; k <= W; k++) s += rawCurv[(i + k + n) % n];
      smooth[i] = s / (2 * W + 1);
    }
    this.curvature = smooth;
  }

  /**
   * Buddh is cut into a natural rise, so elevation is a real part of the lap
   * rather than decoration. Each junction carries a height; this walks the
   * generated path, finds the arc-length position of every junction, and joins
   * them with smoothstep ramps so crests and dips are drivable rather than
   * kinked.
   */
  _buildElevation(geo) {
    const n = this.sampleCount;
    const L = this.length;

    // Where each junction sits along the generated path. A corner span is the
    // arc itself, so its midpoint is the apex.
    const nodes = [];
    for (const s of geo.spans) {
      if (s.kind !== 'corner') continue;
      nodes.push({ at: (s.from + s.to) / 2, y: LAYOUT[s.at].elev });
    }
    nodes.sort((a, b) => a.at - b.at);

    // Wrap-around guards so interpolation near distance 0 has a node behind it.
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const ring = [{ at: last.at - L, y: last.y }, ...nodes, { at: first.at + L, y: first.y }];

    let k = 0;
    for (let i = 0; i < n; i++) {
      const raw = i * this.sampleSpacing;          // distance in generated order
      while (k < ring.length - 2 && ring[k + 1].at <= raw) k++;
      const a = ring[k];
      const b = ring[k + 1];
      const span = Math.max(b.at - a.at, 1e-6);
      const t = THREE.MathUtils.clamp((raw - a.at) / span, 0, 1);
      const s = t * t * (3 - 2 * t);               // smoothstep
      // A little surface roll on top, so the car is never on a dead-flat plane.
      const f = raw / L;
      const roll = Math.sin(f * Math.PI * 6) * 0.14 + Math.sin(f * Math.PI * 11 + 1.3) * 0.09;
      this.points[i].y = 1.6 + a.y + (b.y - a.y) * s + roll;
    }
  }

  /** The corner table and DRS zones fall straight out of the layout. */
  _analyse(geo) {
    this.turnCount = LAYOUT.length;
    this.corners = [];

    for (const s of geo.spans) {
      if (s.kind !== 'corner') continue;
      const v = LAYOUT[s.at];
      const c = geo.corner[s.at];
      if (c.radius > NAMED_RADIUS) continue;      // a flat kink, not a corner
      const from = this.lapDistance(s.from);
      const to = this.lapDistance(s.to);
      this.corners.push({
        index: s.at + 1,
        name: /^Turn /.test(v.name) ? v.name : `${v.name} (T${s.at + 1})`,
        from,
        to,
        t: this.fraction(from + (this.length + to - from) % this.length / 2),
        radius: c.radius,
        left: c.turn > 0,
      });
    }

    // DRS: the flagged straights, opening 40 m in and closing at the braking
    // point of the corner they feed.
    this.drsZones = geo.spans
      .filter((s) => s.kind === 'straight' && LAYOUT[s.at].drsAfter && s.to - s.from > 120)
      .map((s) => [
        this.fraction(this.lapDistance(s.from + 40)),
        this.fraction(this.lapDistance(s.to - 15)),
      ]);
  }

  /** Convert a distance in generated order into a distance from the line. */
  lapDistance(raw) {
    const off = this.startIndex * this.sampleSpacing;
    let d = (raw - off) % this.length;
    if (d < 0) d += this.length;
    return d;
  }

  /** Uniform grid bucketing so nearest-sample lookups stay O(1). */
  _buildSpatialIndex() {
    const box = new THREE.Box3().setFromPoints(this.points);
    this.gridMin = new THREE.Vector2(box.min.x - 60, box.min.z - 60);
    this.gridSize = 40;
    this.gridW = Math.ceil((box.max.x - box.min.x + 120) / this.gridSize);
    this.gridH = Math.ceil((box.max.z - box.min.z + 120) / this.gridSize);
    this.grid = new Map();

    for (let i = 0; i < this.sampleCount; i++) {
      const p = this.points[i];
      const cx = Math.floor((p.x - this.gridMin.x) / this.gridSize);
      const cy = Math.floor((p.z - this.gridMin.y) / this.gridSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = (cx + dx) * 100000 + (cy + dy);
          let bucket = this.grid.get(key);
          if (!bucket) this.grid.set(key, (bucket = []));
          bucket.push(i);
        }
      }
    }
  }

  /**
   * Locate a world position relative to the centreline.
   * Returns { index, distance (from the line), lateral (+ = right of centre) }.
   */
  locate(x, z, hint = -1) {
    let best = -1;
    let bestD2 = Infinity;

    if (hint >= 0) {
      // Fast path: search a window around the previous result.
      const n = this.sampleCount;
      for (let k = -24; k <= 24; k++) {
        const i = (hint + k + n) % n;
        const p = this.points[i];
        const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
      if (bestD2 < 900) return this._refine(x, z, best);
    }

    const cx = Math.floor((x - this.gridMin.x) / this.gridSize);
    const cy = Math.floor((z - this.gridMin.y) / this.gridSize);
    const bucket = this.grid.get(cx * 100000 + cy);
    if (bucket) {
      for (const i of bucket) {
        const p = this.points[i];
        const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
    }
    if (best < 0) {
      for (let i = 0; i < this.sampleCount; i += 4) {
        const p = this.points[i];
        const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
    }
    return this._refine(x, z, best);
  }

  _refine(x, z, i) {
    const p = this.points[i];
    const t = this.tangents[i];
    const r = this.rights[i];
    const dx = x - p.x, dz = z - p.z;
    const along = dx * t.x + dz * t.z;
    const lateral = dx * r.x + dz * r.z;
    let distance = this.distances[i] + along;
    if (distance < 0) distance += this.length;
    if (distance >= this.length) distance -= this.length;
    return { index: i, distance, lateral, height: p.y };
  }

  /** Sample the centreline at a distance measured from the start line. */
  sampleAt(distance) {
    const n = this.sampleCount;
    let d = distance % this.length;
    if (d < 0) d += this.length;
    const i = (this.startIndex + Math.floor(d / this.sampleSpacing)) % n;
    return { index: i, point: this.points[i], tangent: this.tangents[i], right: this.rights[i] };
  }

  /** Lap fraction 0..1 for a distance from the line. */
  fraction(distance) {
    const f = (distance / this.length) % 1;
    return f < 0 ? f + 1 : f;
  }

  /** Signed curvature at a distance from the line; positive turns left. */
  curvatureAt(distance) {
    return this.curvature[this.sampleAt(distance).index];
  }

  cornerNameAt(fraction) {
    let best = null;
    let bestD = 0.028;
    for (const c of this.corners) {
      let d = Math.abs(c.t - fraction);
      d = Math.min(d, 1 - d);
      if (d < bestD) { bestD = d; best = c.name; }
    }
    return best;
  }

  inDrsZone(fraction) {
    for (const [a, b] of this.drsZones) {
      if (a < b) { if (fraction >= a && fraction <= b) return true; }
      else if (fraction >= a || fraction <= b) return true;
    }
    return false;
  }

  sectorOf(fraction) {
    if (fraction < SECTORS[1]) return 0;
    if (fraction < SECTORS[2]) return 1;
    return 2;
  }
}
