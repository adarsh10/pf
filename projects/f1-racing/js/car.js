import * as THREE from 'three';
import { HALF_WIDTH } from './track.js';

const G = 9.81;
const RHO = 1.225;

/** 2026-spec-ish hybrid F1 car parameters. */
export const SPEC = {
  mass: 798 + 100,          // kerb weight + fuel load (kg)
  wheelbase: 3.6,
  cda: 1.18,                // drag area, low-drag Buddh setup for the straights
  drsCdaGain: -0.28,        // drag reduction when the flap is open
  cla: 4.35,                // downforce area
  muPeak: 1.78,             // slick tyre peak friction
  enginePower: 620e3,       // ICE, watts
  ersPower: 160e3,          // MGU-K deployment, watts
  ersCapacity: 4.0e6,       // joules of usable battery
  ersHarvestRate: 220e3,    // regen under braking, watts
  brakeForceMax: 42000,     // N (limited further by grip)
  idleRpm: 4200,
  maxRpm: 15000,
  shiftRpm: 14500,
  downshiftRpm: 9600,
  wheelRadius: 0.36,
  // Total drive ratios: engine rpm = wheel rpm x ratio.
  gears: [null, 15.6, 13.1, 11.2, 9.8, 8.6, 7.6, 6.8, 6.1],
};

function torqueFactor(rpm) {
  const r = THREE.MathUtils.clamp(rpm / SPEC.maxRpm, 0, 1);
  // Broad turbo-hybrid curve: strong midrange, tapering at the limiter.
  if (r < 0.28) return 0.35 + r * 1.6;
  if (r < 0.72) return 0.80 + (r - 0.28) * 0.52;
  return Math.max(0.35, 1.03 - (r - 0.72) * 1.55);
}

export class Car {
  constructor(track) {
    this.track = track;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector2();      // world XZ
    this.yaw = 0;
    this.yawRate = 0;
    this.gear = 1;
    this.rpm = SPEC.idleRpm;
    this.throttle = 0;
    this.brake = 0;
    this.steer = 0;
    this.drs = false;
    this.drsAvailable = false;
    this.ers = SPEC.ersCapacity;
    this.ersDeploy = false;
    this.slip = 0;
    this.lateralG = 0;
    this.longG = 0;
    this.offTrack = false;
    this.wallHit = 0;
    this.autoGearbox = true;
    // Scaled down by the weather. 1 = a dry track.
    this.weatherGrip = 1;
    this.tyreTemp = 90;
    this.tyreWear = 0;
    this.fuel = 100;
    this.hintIndex = -1;
    this.locate = { distance: 0, lateral: 0, index: 0, height: 0 };
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.suspension = 0;
    this.kerbShake = 0;
    this.reversing = false;
    this.reverseSpeed = 0;
    this.reverseTimer = 0;
    this.reset(0);
  }

  reset(distance = 0) {
    const s = this.track.sampleAt(distance);
    this.position.copy(s.point);
    this.position.y = s.point.y;
    this.yaw = Math.atan2(s.tangent.x, s.tangent.z);
    this.velocity.set(0, 0);
    this.yawRate = 0;
    this.gear = 1;
    this.rpm = SPEC.idleRpm;
    this.ers = SPEC.ersCapacity;
    this.slip = 0;
    this.wallHit = 0;
    this.reversing = false;
    this.reverseSpeed = 0;
    this.reverseTimer = 0;
    this.hintIndex = s.index;
  }

  get speed() { return this.velocity.length(); }
  get speedKph() { return this.speed * 3.6; }

  forwardVec() { return new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw)); }

  update(dt, input) {
    const spec = SPEC;
    this.throttle = input.throttle;
    this.brake = input.brake;

    // ---------- track position ----------
    const loc = this.track.locate(this.position.x, this.position.z, this.hintIndex);
    this.hintIndex = loc.index;
    this.locate = loc;
    const fraction = this.track.fraction(loc.distance);

    // ---------- surface ----------
    const absLat = Math.abs(loc.lateral);
    const onKerb = absLat > HALF_WIDTH - 0.4 && absLat < HALF_WIDTH + 1.8;
    this.offTrack = absLat > HALF_WIDTH + 0.4;
    let surfaceMu = 1.0;
    if (this.offTrack) surfaceMu = absLat > HALF_WIDTH + 2.2 ? 0.62 : 0.82;
    surfaceMu *= this.weatherGrip;
    this.kerbShake = onKerb ? Math.min(1, this.speed / 40) : this.kerbShake * 0.85;

    // ---------- steering ----------
    const speed = Math.max(this.speed, 0.001);
    const speedFactor = 1 / (1 + Math.pow(speed / 22, 1.35));
    const maxSteer = 0.30 * (0.22 + 0.78 * speedFactor);
    const steerTarget = input.steer * maxSteer;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 12);

    // ---------- aero ----------
    const drsOpen = this.drs && this.drsAvailable && this.throttle > 0.2;
    const cda = spec.cda + (drsOpen ? spec.drsCdaGain : 0);
    const q = 0.5 * RHO * speed * speed;
    const drag = q * cda;
    const downforce = q * spec.cla * (drsOpen ? 0.82 : 1);

    // ---------- grip ----------
    const tyreFactor = THREE.MathUtils.clamp(
      1 - Math.abs(this.tyreTemp - 100) / 220 - this.tyreWear * 0.18, 0.62, 1);
    const mu = spec.muPeak * surfaceMu * tyreFactor * (onKerb ? 0.9 : 1);
    const normalLoad = spec.mass * G + downforce;
    const maxAccelLat = (mu * normalLoad) / spec.mass;

    // ---------- gearbox ----------
    this._updateGearbox(dt, input, speed);

    // ---------- power ----------
    const wheelRpm = (speed / (2 * Math.PI * spec.wheelRadius)) * 60;
    this.rpm = THREE.MathUtils.clamp(
      Math.max(wheelRpm * spec.gears[this.gear], spec.idleRpm),
      spec.idleRpm, spec.maxRpm);

    let power = spec.enginePower * torqueFactor(this.rpm) * this.throttle;
    this.ersDeploy = false;
    if (input.ers && this.ers > 0 && this.throttle > 0.5 && speed > 10) {
      power += spec.ersPower;
      this.ers = Math.max(0, this.ers - spec.ersPower * dt);
      this.ersDeploy = true;
    }
    if (this.rpm >= spec.maxRpm - 60) power *= 0.25;   // rev limiter

    let driveForce = this.throttle > 0 ? power / Math.max(speed, 8) : 0;
    const tractionLimit = mu * (normalLoad * 0.58);     // rear-axle share
    const wheelSpin = driveForce > tractionLimit;
    if (wheelSpin) driveForce = tractionLimit;

    // ---------- braking ----------
    let brakeForce = 0;
    if (this.brake > 0) {
      const maxBrake = mu * normalLoad * 0.98;
      brakeForce = Math.min(spec.brakeForceMax * this.brake * 1.6, maxBrake * this.brake);
      // harvest
      this.ers = Math.min(spec.ersCapacity, this.ers + spec.ersHarvestRate * this.brake * dt);
    }

    const engineBraking = this.throttle < 0.05 && speed > 2 ? 2400 : 0;
    const rolling = 260 + speed * 12;

    // ---------- reverse creep (hold the brake at a standstill to back out of a wall) ----------
    const crawling = speed < 1.2 || this.reversing;
    this.reverseTimer = (this.brake > 0.4 && this.throttle < 0.05 && crawling)
      ? this.reverseTimer + dt : 0;
    if (this.reverseTimer > 0.5) {
      this.reversing = true;
      this.reverseSpeed = Math.min(5.5, this.reverseSpeed + 5 * dt);
    } else if (this.reversing) {
      this.reverseSpeed = Math.max(0, this.reverseSpeed - 14 * dt);
      if (this.reverseSpeed <= 0) this.reversing = false;
    }

    // ---------- longitudinal integration ----------
    const netLong = driveForce - drag - brakeForce - engineBraking - (speed > 0.3 ? rolling : 0);
    let newSpeed = speed + (netLong / spec.mass) * dt;
    if (newSpeed < 0) newSpeed = 0;
    if (this.brake > 0 && newSpeed < 0.6) newSpeed = 0;
    this.longG = ((newSpeed - speed) / dt) / G;

    // ---------- yaw dynamics ----------
    // keep a sliver of steering authority when crawling so the car is never pinned to a wall
    const steerSpeed = Math.max(newSpeed, this.throttle > 0.1 ? 3 : 0);
    // Heading is measured so that forward = (sin yaw, cos yaw) with +Y up, which
    // makes the right-hand vector -d(forward)/d(yaw): increasing yaw steers left.
    // Negate here so a positive steer input (right key, right stick) turns right.
    const desiredYawRate = -(steerSpeed * Math.tan(this.steer)) / spec.wheelbase;
    const maxYawRate = maxAccelLat / Math.max(newSpeed, 4);
    let yawRate = THREE.MathUtils.clamp(desiredYawRate, -maxYawRate, maxYawRate);

    // power oversteer: excess torque rotates the car a touch more
    if (wheelSpin && newSpeed > 6 && newSpeed < 65) {
      yawRate -= Math.sign(this.steer || 0.0001) * Math.min(0.32, this.throttle * 0.30) *
                 THREE.MathUtils.clamp(1 - newSpeed / 65, 0, 1);
    }
    // locking the brakes kills rotation
    if (this.brake > 0.85 && newSpeed > 8) yawRate *= 0.55;

    const understeer = THREE.MathUtils.clamp(
      (Math.abs(desiredYawRate) - Math.abs(yawRate)) / Math.max(Math.abs(desiredYawRate), 0.001), 0, 1);
    this.slip = Math.max(understeer, wheelSpin && newSpeed < 60 ? 0.6 : 0);

    this.yawRate += (yawRate - this.yawRate) * Math.min(1, dt * 9);
    this.yaw += this.yawRate * dt;

    this.lateralG = (this.yawRate * newSpeed) / G;

    // ---------- velocity ----------
    const fwd = this.forwardVec();
    const velDir = this.speed > 0.4
      ? this.velocity.clone().normalize()
      : fwd.clone();
    const align = THREE.MathUtils.clamp(dt * (7 + mu * 5), 0, 1);
    velDir.lerp(fwd, align).normalize();
    this.velocity.copy(velDir.multiplyScalar(newSpeed));

    if (this.reversing) {
      const back = this.forwardVec().multiplyScalar(-this.reverseSpeed);
      // Backing up, the front wheels drag the nose the opposite way.
      this.yaw += this.steer * this.reverseSpeed * dt * 0.55;
      this.velocity.copy(back);
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.y * dt;

    // ---------- ride height follows the road ----------
    const targetY = loc.height;
    this.position.y += (targetY - this.position.y) * Math.min(1, dt * 8);

    // ---------- walls ----------
    this._collide(loc);

    // ---------- chassis attitude ----------
    const rollTarget = THREE.MathUtils.clamp(-this.lateralG * 0.022, -0.07, 0.07);
    this.bodyRoll += (rollTarget - this.bodyRoll) * Math.min(1, dt * 8);
    const pitchTarget = THREE.MathUtils.clamp(this.longG * 0.018, -0.06, 0.05);
    this.bodyPitch += (pitchTarget - this.bodyPitch) * Math.min(1, dt * 7);

    // ---------- consumables ----------
    const load = Math.min(1, (Math.abs(this.lateralG) / 4) + this.slip * 0.6);
    this.tyreTemp += (86 + load * 28 - this.tyreTemp) * Math.min(1, dt * 0.12);
    this.tyreWear = Math.min(1, this.tyreWear + load * dt * 0.0016);
    this.fuel = Math.max(0, this.fuel - this.throttle * dt * 0.06);

    this.drsAvailable = this.track.inDrsZone(fraction);
    if (!this.drsAvailable || this.brake > 0.05) this.drs = false;

    return fraction;
  }

  _updateGearbox(dt, input, speed) {
    this.shiftCooldown = Math.max(0, (this.shiftCooldown || 0) - dt);
    if (this.autoGearbox) {
      if (this.shiftCooldown === 0) {
        if (this.rpm > SPEC.shiftRpm && this.gear < 8) { this.gear++; this.shiftCooldown = 0.14; }
        else if (this.rpm < SPEC.downshiftRpm && this.gear > 1) { this.gear--; this.shiftCooldown = 0.18; }
      }
    } else {
      if (input.shiftUp && this.gear < 8 && this.shiftCooldown === 0) { this.gear++; this.shiftCooldown = 0.09; }
      if (input.shiftDown && this.gear > 1 && this.shiftCooldown === 0) { this.gear--; this.shiftCooldown = 0.12; }
    }
  }

  _collide(loc) {
    const limit = HALF_WIDTH + 7.0;
    const lat = loc.lateral;
    if (Math.abs(lat) <= limit) return;

    const s = this.track.sampleAt(loc.distance);
    const over = Math.abs(lat) - limit;
    const sign = Math.sign(lat);

    // push the car back onto the racing surface (with a sliver of clearance so it
    // does not re-trigger every substep and weld itself to the barrier)
    this.position.x -= s.right.x * sign * (over + 0.05);
    this.position.z -= s.right.z * sign * (over + 0.05);

    // reflect and scrub velocity
    const rightV = new THREE.Vector2(s.right.x, s.right.z);
    const vn = this.velocity.dot(rightV);
    if (vn * sign > 0) {
      this.velocity.addScaledVector(rightV, -vn * 1.15);
      this.wallHit = Math.min(1, Math.abs(vn) / 14);
    }
    // only a meaningful impact scrubs speed — grazing at walking pace must not pin the car
    const sp = this.velocity.length();
    if (sp > 6) {
      this.velocity.multiplyScalar(0.86);
      this.yawRate *= 0.4;
      this.tyreWear = Math.min(1, this.tyreWear + 0.01);
    }
  }
}
