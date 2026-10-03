// Camera rig: frames the pedestal for any aspect ratio, keeps the cannon in the lower part of the screen,
// and owns shake, punch-in and the pull-back for the level 2 teaser.
import * as THREE from 'three';
import { ease, tween } from '@kit/tween';
import { TABLE_HALF, TABLE_Y, TZ } from './level';

interface Pose {
  ty: number;
  pitch: number;
  dist: number;
}

const FOV = 36;
// What must always be in shot: the whole table with the tallest tower, and the dirt circle under it.
const FIT: [number, number, number][] = [
  [-TABLE_HALF.x - 0.3, 0.3, TZ + 1.4],
  [TABLE_HALF.x + 0.3, 0.3, TZ + 1.4],
  [-TABLE_HALF.x - 0.3, TABLE_Y + 3.4, TZ],
  [TABLE_HALF.x + 0.3, TABLE_Y + 3.4, TZ],
];
// Level 2 is a taller wall; the teaser pulls back to show all of it.
const FIT_TEASER: [number, number, number][] = [
  [-TABLE_HALF.x - 0.6, 0.3, TZ + 1.4],
  [TABLE_HALF.x + 0.6, 0.3, TZ + 1.4],
  [-TABLE_HALF.x - 0.6, TABLE_Y + 5.2, TZ],
  [TABLE_HALF.x + 0.6, TABLE_Y + 5.2, TZ],
];

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.3, 500);
  private pose: Pose = { ty: 3, pitch: 0.1, dist: 20 };
  private play: Pose = { ...this.pose };
  private teaser: Pose = { ...this.pose };
  private mode: 'play' | 'teaser' = 'play';
  private blend = 0;
  private shakeAmt = 0;
  private punchAmt = 0;
  private w = 1;
  private h = 1;
  private time = 0;
  private v = new THREE.Vector3();
  portrait = true;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.portrait = h >= w;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.play = this.fit(FIT);
    this.teaser = this.fit(FIT_TEASER);
    this.apply();
  }

  /** The closest camera that keeps every FIT point inside the HUD-safe rectangle, centred in it. */
  private fit(points: [number, number, number][]): Pose {
    // Fractions of the screen kept clear: the HUD on top, the cannon and the button at the bottom.
    const safe = this.portrait ? { x: 0.03, t: 0.19, b: 0.34 } : { x: 0.17, t: 0.2, b: 0.26 };
    const x0 = -1 + 2 * safe.x;
    const x1 = 1 - 2 * safe.x;
    const y0 = -1 + 2 * safe.b;
    const y1 = 1 - 2 * safe.t;
    // Low and nearly level, as if crouching behind the cannon: the pedestal looks tall, the lawn foreshortens away.
    const pose: Pose = { ty: TABLE_Y + 1, pitch: this.portrait ? 0.045 : 0.035, dist: 20 };
    const b = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    const measure = () => {
      this.place(pose);
      b.minX = b.minY = Infinity;
      b.maxX = b.maxY = -Infinity;
      for (const p of points) {
        this.v.set(p[0], p[1], p[2]).project(this.camera);
        b.minX = Math.min(b.minX, this.v.x);
        b.maxX = Math.max(b.maxX, this.v.x);
        b.minY = Math.min(b.minY, this.v.y);
        b.maxY = Math.max(b.maxY, this.v.y);
      }
    };
    for (let pass = 0; pass < 6; pass++) {
      let lo = 4;
      let hi = 120;
      for (let i = 0; i < 24; i++) {
        pose.dist = (lo + hi) / 2;
        measure();
        if (b.maxX - b.minX <= x1 - x0 && b.maxY - b.minY <= y1 - y0) hi = pose.dist;
        else lo = pose.dist;
      }
      pose.dist = hi;
      measure();
      const off = (b.minY + b.maxY) / 2 - (y0 + y1) / 2;
      if (Math.abs(off) < 0.003) break;
      pose.ty += off * pose.dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    }
    return pose;
  }

  private place(p: Pose): void {
    const cam = this.camera;
    cam.position.set(0, p.ty + Math.sin(p.pitch) * p.dist, TZ + Math.cos(p.pitch) * p.dist);
    cam.lookAt(0, p.ty, TZ);
    cam.updateMatrixWorld();
  }

  private apply(): void {
    const a = this.play;
    const b = this.teaser;
    const k = this.blend;
    this.pose.ty = a.ty + (b.ty - a.ty) * k;
    this.pose.pitch = a.pitch + (b.pitch - a.pitch) * k;
    this.pose.dist = (a.dist + (b.dist - a.dist) * k) * (1 - 0.035 * this.punchAmt);
    this.place(this.pose);
    if (this.shakeAmt > 0.002) {
      const cam = this.camera;
      cam.position.x += Math.sin(this.time * 63) * this.shakeAmt;
      cam.position.y += Math.cos(this.time * 51) * this.shakeAmt * 0.7;
      cam.updateMatrixWorld();
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.shakeAmt *= Math.exp(-8 * dt);
    this.apply();
  }

  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /** A short push-in on big hits. */
  punch(): void {
    void tween({ dur: 0.4, ease: ease.yoyo, update: (v) => (this.punchAmt = v) });
  }

  toTeaser(dur: number): Promise<void> {
    this.mode = 'teaser';
    return tween({ dur, ease: ease.inOutCubic, update: (v) => (this.blend = v) });
  }

  get inTeaser(): boolean {
    return this.mode === 'teaser';
  }

  /**
   * Where the cannon sits: a fixed spot in the lower part of the screen, a few metres in front of the lens.
   * It follows the camera, so it is always big and always in the same place whatever the aspect ratio.
   */
  cannonAnchor(out: THREE.Vector3): THREE.Vector3 {
    this.place(this.play);
    const ndcY = this.portrait ? -0.66 : -0.56;
    const dir = this.v.set(0, ndcY, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    out.copy(this.camera.position).addScaledVector(dir, this.portrait ? 10 : 9);
    this.apply();
    return out;
  }

  toScreen(world: THREE.Vector3, out: { x: number; y: number }): void {
    this.v.copy(world).project(this.camera);
    out.x = (this.v.x * 0.5 + 0.5) * this.w;
    out.y = (-this.v.y * 0.5 + 0.5) * this.h;
  }

  /** Screen point to the vertical plane through the structure (z = zPlane). */
  toPlane(x: number, y: number, zPlane: number, out: THREE.Vector3): boolean {
    this.v.set((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1, 0.5).unproject(this.camera);
    const dir = this.v.sub(this.camera.position).normalize();
    if (Math.abs(dir.z) < 1e-4) return false;
    const t = (zPlane - this.camera.position.z) / dir.z;
    if (t <= 0) return false;
    out.copy(this.camera.position).addScaledVector(dir, t);
    return true;
  }
}
