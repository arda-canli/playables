// Camera rig: frames the play area for any aspect ratio, and moves between named poses.
import * as THREE from 'three';
import { HOLDER, LOT, TRUCK_Z } from './layout';
import { ease, tween } from '@kit/tween';

export interface Pose {
  tx: number;
  tz: number;
  pitch: number;
  dist: number;
}

const PITCH_PORTRAIT = 0.92; // radians above the ground plane
const PITCH_LANDSCAPE = 0.72; // flatter, so the lot fills a short, wide screen
const FIT_POINTS: [number, number, number][] = [
  [HOLDER.x0 - 0.15, 0, HOLDER.z1 + 0.1],
  [HOLDER.x1 + 0.15, 0, HOLDER.z1 + 0.1],
  [HOLDER.x0 - 0.15, 1.0, HOLDER.z0],
  [HOLDER.x1 + 0.15, 1.0, HOLDER.z0],
  [LOT.x0 - 0.4, 1.3, LOT.z0 - 1.2],
  [LOT.x1 + 0.4, 1.3, LOT.z0 - 1.2],
  [-3.2, 0, TRUCK_Z + 1.0],
  [3.2, 0, TRUCK_Z + 1.0],
];

// In landscape the hedge and the far side of the truck lane may run off screen: the lot matters more.
const FIT_POINTS_WIDE: [number, number, number][] = [
  [HOLDER.x0, 0, HOLDER.z1],
  [HOLDER.x1, 0, HOLDER.z1],
  [LOT.x0, 1.0, LOT.z0 + 0.4],
  [LOT.x1, 1.0, LOT.z0 + 0.4],
  [0, 0, TRUCK_Z + 0.75],
];

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
  pose: Pose = { tx: 0, tz: 0, pitch: PITCH_PORTRAIT, dist: 30 };
  private play: Pose = { ...this.pose };
  private mode: 'play' | 'reveal' = 'play';
  private shakeAmt = 0;
  private w = 1;
  private h = 1;
  private v = new THREE.Vector3();
  private time = 0;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.play = this.fit();
    this.pose = this.mode === 'play' ? { ...this.play } : this.revealPose();
    this.apply(0);
  }

  /** Finds the closest camera that keeps every FIT_POINT inside the HUD-safe rectangle. */
  private fit(): Pose {
    const portrait = this.h >= this.w;
    // Fractions of the screen reserved for the HUD (top) and the CTA (bottom).
    const safe = portrait ? { l: 0.025, r: 0.025, t: 0.17, b: 0.125 } : { l: 0.02, r: 0.02, t: 0.13, b: 0.015 };
    const x0 = -1 + 2 * safe.l;
    const x1 = 1 - 2 * safe.r;
    const y0 = -1 + 2 * safe.b;
    const y1 = 1 - 2 * safe.t;
    const pose: Pose = { tx: 0, tz: 0.6, pitch: portrait ? PITCH_PORTRAIT : PITCH_LANDSCAPE, dist: 30 };
    const points = portrait ? FIT_POINTS : FIT_POINTS_WIDE;
    const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    const measure = () => {
      this.place(pose, 0);
      bounds.minX = bounds.minY = Infinity;
      bounds.maxX = bounds.maxY = -Infinity;
      for (const p of points) {
        this.v.set(p[0], p[1], p[2]).project(this.camera);
        bounds.minX = Math.min(bounds.minX, this.v.x);
        bounds.maxX = Math.max(bounds.maxX, this.v.x);
        bounds.minY = Math.min(bounds.minY, this.v.y);
        bounds.maxY = Math.max(bounds.maxY, this.v.y);
      }
    };
    for (let pass = 0; pass < 6; pass++) {
      let lo = 6;
      let hi = 120;
      for (let i = 0; i < 22; i++) {
        pose.dist = (lo + hi) / 2;
        measure();
        const fits = bounds.maxX - bounds.minX <= x1 - x0 && bounds.maxY - bounds.minY <= y1 - y0;
        if (fits) hi = pose.dist;
        else lo = pose.dist;
      }
      pose.dist = hi;
      measure();
      // Slide the target along z until the content is centred in the safe rectangle.
      const off = (bounds.minY + bounds.maxY) / 2 - (y0 + y1) / 2;
      if (Math.abs(off) < 0.004) break;
      pose.tz -= (off * pose.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / Math.sin(pose.pitch);
    }
    return pose;
  }

  private revealPose(): Pose {
    const portrait = this.h >= this.w;
    return { tx: 0, tz: portrait ? -9 : -7, pitch: portrait ? 0.62 : 0.5, dist: this.play.dist * (portrait ? 1.05 : 0.95) };
  }

  private place(p: Pose, shake: number): void {
    const cam = this.camera;
    cam.position.set(p.tx, Math.sin(p.pitch) * p.dist, p.tz + Math.cos(p.pitch) * p.dist);
    cam.lookAt(p.tx, 0, p.tz);
    if (shake > 0) {
      cam.position.x += Math.sin(this.time * 61) * shake;
      cam.position.y += Math.cos(this.time * 53) * shake * 0.7;
    }
    cam.updateMatrixWorld();
  }

  private apply(dt: number): void {
    this.time += dt;
    this.shakeAmt *= Math.exp(-7 * dt);
    this.place(this.pose, this.shakeAmt > 0.002 ? this.shakeAmt : 0);
  }

  update(dt: number): void {
    this.apply(dt);
  }

  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /** A little push-in, used on each truck for punch. */
  punch(): void {
    const base = this.play.dist;
    void tween({ dur: 0.35, ease: ease.yoyo, update: (v) => this.mode === 'play' && (this.pose.dist = base * (1 - 0.018 * v)) });
  }

  toReveal(dur: number): Promise<void> {
    this.mode = 'reveal';
    const from = { ...this.pose };
    return tween({
      dur,
      ease: ease.inOutCubic,
      update: (v) => {
        const to = this.revealPose();
        this.pose.tx = from.tx + (to.tx - from.tx) * v;
        this.pose.tz = from.tz + (to.tz - from.tz) * v;
        this.pose.pitch = from.pitch + (to.pitch - from.pitch) * v;
        this.pose.dist = from.dist + (to.dist - from.dist) * v;
      },
    });
  }

  /** Slow drift behind the end card so the scene stays alive. */
  drift(dt: number): void {
    if (this.mode === 'reveal') this.pose.tz -= dt * 0.35;
  }

  toScreen(world: THREE.Vector3, out: { x: number; y: number }): void {
    this.v.copy(world).project(this.camera);
    out.x = (this.v.x * 0.5 + 0.5) * this.w;
    out.y = (-this.v.y * 0.5 + 0.5) * this.h;
  }
}
