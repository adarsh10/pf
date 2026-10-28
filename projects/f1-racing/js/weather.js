import * as THREE from 'three';

/**
 * Rain.
 *
 * Drops are drawn as short line segments rather than points, because a point
 * sprite cannot be slanted and rain reads as rain almost entirely from the
 * streak angle. Everything lives in one `LineSegments` with a single draw call.
 *
 * The whole field is a box that rides along with the camera and wraps drops
 * around as they fall out of the bottom, so a few thousand segments cover an
 * unlimited circuit. Drop coordinates are stored *relative to the camera* and
 * the mesh itself is moved to the camera each frame. Keeping them in world
 * space instead means a wrap has to chase a camera that may have moved a long
 * way since the last frame, which is what leaves gaps and torn patches in the
 * field at racing speed.
 *
 * The class also does the scene dressing that has to come with rain — the
 * golden-hour lighting is toned down, the fog closes in, and the tarmac goes
 * glossy — and hands back the wet-grip factor the car physics uses.
 */

const COUNT = 9000;
const BOX = { w: 72, h: 46, d: 72 };        // metres, centred on the camera
const FALL = 62;                            // m/s downward
const WIND = new THREE.Vector3(-9, 0, -4);  // m/s lateral drift
const STREAK = 0.045;                       // seconds of travel drawn per drop
const MAX_STREAK = 9;                       // metres, so 300 km/h is not absurd

export class Rain {
  constructor(scene, camera, world, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.renderer = renderer;
    this.active = false;

    // Head and tail of every drop, packed as consecutive vertex pairs.
    this.pos = new Float32Array(COUNT * 2 * 3);
    this.origin = new THREE.Vector3();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    // The drops move every frame, so the bounding sphere would be recomputed
    // constantly; a fixed one big enough for the box skips that entirely.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);

    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0xdce6f2,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      fog: true,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);

    // Fall velocity in world terms, plus scratch for the camera's own motion.
    this.vel = new THREE.Vector3(WIND.x, -FALL, WIND.z);
    this.tail = new THREE.Vector3();
    this._camVel = new THREE.Vector3();
    this._lastCam = new THREE.Vector3();
    this._local = new THREE.Vector3();

    this._seed();
  }

  /** Scatter every drop uniformly through the box, in camera-local space. */
  _seed() {
    const p = this.pos;
    for (let i = 0; i < COUNT; i++) {
      const x = (Math.random() - 0.5) * BOX.w;
      const y = (Math.random() - 0.5) * BOX.h;
      const z = (Math.random() - 0.5) * BOX.d;
      const o = i * 6;
      p[o] = x; p[o + 1] = y; p[o + 2] = z;
      p[o + 3] = x; p[o + 4] = y; p[o + 5] = z;
    }
  }

  /**
   * Turn the weather on or off. Returns nothing — read `grip` for the physics
   * multiplier and `active` for the state.
   */
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.mesh.visible = on;
    // Start the relative-wind estimate from where the camera is now, or the
    // first frame reads the whole jump since the last shower as one impulse.
    this._lastCam.copy(this.camera.position);
    this.mesh.position.copy(this.camera.position);

    const fog = this.scene.fog;
    if (on) {
      this._dry = {
        fogColor: fog.color.getHex(),
        fogNear: fog.near,
        fogFar: fog.far,
        exposure: this.renderer.toneMappingExposure,
        roadRough: this.world.roadMat.roughness,
        roadMetal: this.world.roadMat.metalness,
      };
      // A warm sunset behind a storm front: grey the haze, close it in, and
      // pull the exposure down so the scene reads as overcast.
      fog.color.setHex(0x8a7b76);
      fog.near = 180;
      fog.far = 1500;
      this.renderer.toneMappingExposure = 0.94;
      // Standing water: a wet track is dark and sharply reflective.
      this.world.roadMat.roughness = 0.30;
      this.world.roadMat.metalness = 0.22;
      this.world.setLightScale?.(0.62);
    } else if (this._dry) {
      fog.color.setHex(this._dry.fogColor);
      fog.near = this._dry.fogNear;
      fog.far = this._dry.fogFar;
      this.renderer.toneMappingExposure = this._dry.exposure;
      this.world.roadMat.roughness = this._dry.roadRough;
      this.world.roadMat.metalness = this._dry.roadMetal;
      this.world.setLightScale?.(1);
    }
    this.world.roadMat.needsUpdate = true;
  }

  /** Grip multiplier for the car physics. */
  get grip() {
    return this.active ? 0.78 : 1;
  }

  update(dt) {
    if (!this.active) return;
    // A long frame would teleport every drop clean out of the box.
    const step = Math.min(Math.max(dt, 1e-4), 0.05);
    const c = this.camera.position;

    // The field rides the camera, so every drop coordinate stays small and the
    // wrap below is a plain local-space modulo that cannot drift.
    this._camVel.subVectors(c, this._lastCam).divideScalar(step);
    this._lastCam.copy(c);
    this.mesh.position.copy(c);

    // Relative wind. Standing still the drops fall; at three hundred an hour
    // they tear past almost horizontally, which is most of what sells rain
    // from inside a cockpit.
    const vx = this.vel.x - this._camVel.x;
    const vy = this.vel.y - this._camVel.y;
    const vz = this.vel.z - this._camVel.z;

    let tx = -vx * STREAK, ty = -vy * STREAK, tz = -vz * STREAK;
    const len = Math.hypot(tx, ty, tz);
    if (len > MAX_STREAK) {
      const k = MAX_STREAK / len;
      tx *= k; ty *= k; tz *= k;
    }

    const p = this.pos;
    const dx = vx * step, dy = vy * step, dz = vz * step;
    const halfW = BOX.w / 2, halfH = BOX.h / 2, halfD = BOX.d / 2;

    for (let i = 0; i < COUNT; i++) {
      const o = i * 6;
      let x = p[o] + dx;
      let y = p[o + 1] + dy;
      let z = p[o + 2] + dz;

      // Wrap on every axis. A drop can leave through any face now that the
      // camera's own motion is part of its velocity, and the box may be
      // crossed several times in one frame at speed, hence the loops.
      while (x < -halfW) x += BOX.w;
      while (x > halfW) x -= BOX.w;
      while (y < -halfH) y += BOX.h;
      while (y > halfH) y -= BOX.h;
      while (z < -halfD) z += BOX.d;
      while (z > halfD) z -= BOX.d;

      p[o] = x; p[o + 1] = y; p[o + 2] = z;
      p[o + 3] = x + tx;
      p[o + 4] = y + ty;
      p[o + 5] = z + tz;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}
