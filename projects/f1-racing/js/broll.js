import * as THREE from 'three';

/**
 * Pre-race B-roll: a short broadcast-style montage of the circuit that plays
 * between the driver picking a seat and the start lights coming on.
 *
 * Every shot is a pair of camera keyframes described in track-relative terms
 * (distance round the lap, metres to the right of the centreline, metres up),
 * so the montage follows the layout wherever the circuit geometry moves. The
 * camera eases between the two keyframes and the look-at target eases with it,
 * which is what gives the slow, deliberate drift of a real trackside camera.
 */

const EASE = {
  // Slow in, slow out — the default for a camera on a dolly or a crane.
  smooth: (t) => t * t * (3 - 2 * t),
  // Already moving at the cut, decelerating — for helicopter tracking shots.
  out: (t) => 1 - Math.pow(1 - t, 2.2),
  // Constant rate, used where the motion has to feel mechanical.
  linear: (t) => t,
};

export class Broll {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} track
   * @param {THREE.Object3D} carRig  the player's car, for the closing hero shot
   */
  constructor(camera, track, carRig) {
    this.camera = camera;
    this.track = track;
    this.carRig = carRig;
    this.active = false;
    this.shots = [];
    this.shot = 0;
    this.time = 0;
    this.onDone = null;

    this.el = document.getElementById('broll');
    this.titleEl = this.el.querySelector('.btitle');
    this.subEl = this.el.querySelector('.bsub');

    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  /** Mid-corner distance of the numbered turn, or null if it has no entry. */
  _corner(n) {
    const c = this.track.corners.find((x) => x.index === n);
    if (!c) return null;
    const L = this.track.length;
    return (c.from + ((L + c.to - c.from) % L) / 2) % L;
  }

  /**
   * World point `across` metres right of the centreline and `up` metres above
   * the road surface, at `dist` metres round the lap.
   */
  _at(dist, across, up) {
    const L = this.track.length;
    const s = this.track.sampleAt(((dist % L) + L) % L);
    return new THREE.Vector3(
      s.point.x + s.right.x * across,
      s.point.y + up,
      s.point.z + s.right.z * across
    );
  }

  /** Build the montage. Called fresh each time so it picks up the new driver. */
  _compose(entry) {
    const L = this.track.length;
    const t1 = this._corner(1) ?? L * 0.14;
    const t3 = this._corner(3) ?? L * 0.21;
    const t4 = this._corner(4) ?? L * 0.43;
    const t10 = this._corner(10) ?? L * 0.71;
    const t11 = this._corner(11) ?? L * 0.75;
    const grid = L - 90;

    // Each shot eases from `from` to `to` while the look-at target eases from
    // `lookFrom` to `lookTo`.
    this.shots = [
      // 1. Establishing crane, high above the pit straight, sinking towards
      //    the grid as the circuit name comes up.
      {
        from: this._at(grid - 210, -30, 175),
        to: this._at(grid - 150, -18, 62),
        lookFrom: this._at(grid + 40, 0, 0),
        lookTo: this._at(grid + 10, 0, 1),
        dur: 5.4, ease: EASE.smooth, fov: 48,
        title: 'BUDDH INTERNATIONAL CIRCUIT',
        sub: 'GREATER NOIDA · INDIA',
      },
      // 2. Low and tight on the outside of Turn 1, craning up to reveal the
      //    climb away from the corner.
      {
        from: this._at(t1 - 60, 26, 1.2),
        to: this._at(t1 - 20, 32, 9),
        lookFrom: this._at(t1 + 40, 0, 1),
        lookTo: this._at(t1 + 190, 0, 3),
        dur: 4.6, ease: EASE.smooth, fov: 40,
        title: 'TURN 1',
        sub: 'THE CLIMB OUT OF THE PIT STRAIGHT',
      },
      // 3. Sitting below the Turn 3 crest looking back up at it — the blind
      //    horizon is the whole point of the shot.
      {
        from: this._at(t3 + 150, 24, 3.5),
        to: this._at(t3 + 95, 20, 3.0),
        lookFrom: this._at(t3 - 10, 0, 2),
        lookTo: this._at(t3 + 5, 0, 1.5),
        dur: 4.2, ease: EASE.linear, fov: 26,
        title: 'TURN 3',
        sub: 'BLIND OVER THE CREST · HIGHEST POINT ON THE LAP',
      },
      // 4. Helicopter running down the back straight into the Turn 4 stop.
      {
        from: this._at(t4 - 950, 0, 90),
        to: this._at(t4 - 380, 0, 44),
        lookFrom: this._at(t4 - 620, 0, 0),
        lookTo: this._at(t4 + 30, 0, 0),
        dur: 5.0, ease: EASE.out, fov: 44,
        title: 'THE BACK STRAIGHT',
        sub: '1.1 KM DOWNHILL INTO THE HEAVIEST BRAKING ZONE',
      },
      // 5. Wide arc across the long banked double-apex right.
      {
        from: this._at(t10 - 40, -150, 70),
        to: this._at(t11 + 40, -120, 40),
        lookFrom: this._at(t10 + 30, 0, 0),
        lookTo: this._at(t11, 0, 0),
        dur: 4.8, ease: EASE.smooth, fov: 42,
        title: 'TURNS 10 & 11',
        sub: 'THE LONG BANKED DOUBLE APEX',
      },
      // 6. Hero shot: low and close on the player's car, drifting round it.
      {
        car: true,
        from: new THREE.Vector3(-7.5, 0.85, -5.5),
        to: new THREE.Vector3(2.5, 1.9, -9.5),
        lookFrom: new THREE.Vector3(0, 0.55, 0.5),
        lookTo: new THREE.Vector3(0, 0.55, 0.5),
        dur: 4.6, ease: EASE.smooth, fov: 38,
        title: `${entry.first.toUpperCase()} ${entry.last.toUpperCase()}`,
        sub: `${entry.teamName.toUpperCase()} · CAR ${entry.number}`,
      },
    ];
  }

  /** Start the montage. `onDone` fires when it finishes or is skipped. */
  play(entry, onDone) {
    this._compose(entry);
    this.onDone = onDone;
    this.shot = 0;
    this.time = 0;
    this.active = true;
    this.el.classList.remove('hidden');
    this._caption();
  }

  skip() {
    if (!this.active) return;
    this.active = false;
    this.el.classList.add('hidden');
    const done = this.onDone;
    this.onDone = null;
    if (done) done();
  }

  _caption() {
    const s = this.shots[this.shot];
    this.titleEl.textContent = s.title;
    this.subEl.textContent = s.sub;
    // Retrigger the fade-in by taking the element out of the animation and
    // forcing a reflow before putting it back.
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
  }

  update(dt) {
    if (!this.active) return;
    const s = this.shots[this.shot];
    this.time += dt;

    const raw = THREE.MathUtils.clamp(this.time / s.dur, 0, 1);
    const k = s.ease(raw);

    if (s.car) {
      // Offsets are in the car's own frame, so the hero shot works wherever on
      // the grid the driver happens to be lined up.
      this._a.copy(s.from).applyQuaternion(this.carRig.quaternion).add(this.carRig.position);
      this._b.copy(s.to).applyQuaternion(this.carRig.quaternion).add(this.carRig.position);
      this._pos.lerpVectors(this._a, this._b, k);
      this._a.copy(s.lookFrom).applyQuaternion(this.carRig.quaternion).add(this.carRig.position);
      this._b.copy(s.lookTo).applyQuaternion(this.carRig.quaternion).add(this.carRig.position);
      this._look.lerpVectors(this._a, this._b, k);
    } else {
      this._pos.lerpVectors(s.from, s.to, k);
      this._look.lerpVectors(s.lookFrom, s.lookTo, k);
    }

    this.camera.fov += (s.fov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this._pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._look);

    if (raw >= 1) {
      this.shot++;
      this.time = 0;
      if (this.shot >= this.shots.length) this.skip();
      else this._caption();
    }
  }
}
