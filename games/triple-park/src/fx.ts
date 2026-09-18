// Pooled, instanced particles: confetti, dust puffs and sparkles. Three draw calls in total.
import * as THREE from 'three';
import { CONFETTI } from './layout';

interface P {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

class Pool {
  readonly mesh: THREE.InstancedMesh;
  readonly items: P[] = [];
  private cursor = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, private gravity: number, private drag: number, private shape: (p: P, t: number) => number, private billboard = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.items.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, max: 1, size: 1 });
      this.mesh.setMatrixAt(i, zero);
    }
  }

  spawn(): { p: P; i: number } {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.items.length;
    const p = this.items[i];
    p.alive = true;
    p.life = 0;
    return { p, i };
  }

  update(dt: number, camQ: THREE.Quaternion): void {
    let dirty = false;
    this.items.forEach((p, i) => {
      if (!p.alive) return;
      dirty = true;
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1 || p.pos.y < -0.2) {
        p.alive = false;
        this.s.set(0, 0, 0);
      } else {
        p.vel.y -= this.gravity * dt;
        p.vel.multiplyScalar(Math.exp(-this.drag * dt));
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        const k = this.shape(p, t) * p.size;
        this.s.set(k, k, k);
      }
      if (this.billboard) this.q.copy(camQ).multiply(TMPQ.setFromEuler(TMPE.set(0, 0, p.rot.z)));
      else this.q.setFromEuler(p.rot);
      this.m.compose(p.pos, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const TMPQ = new THREE.Quaternion();
const TMPE = new THREE.Euler();

function starShape(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 0.16 : 0.5;
    const a = (i / 8) * Math.PI * 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(s);
}

export class Fx {
  private confetti: Pool;
  private puffs: Pool;
  private stars: Pool;
  private col = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.confetti = new Pool(new THREE.PlaneGeometry(0.16, 0.26), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 260, 9, 1.1, (_p, t) => (t > 0.8 ? (1 - t) / 0.2 : 1));
    this.puffs = new Pool(new THREE.SphereGeometry(0.5, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 }), 70, -0.6, 2.5, (_p, t) => Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.9 + 0.1 * (1 - t));
    this.stars = new Pool(starShape(), new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide, depthWrite: false }), 60, 0, 3, (_p, t) => Math.sin(t * Math.PI), true);
    scene.add(this.confetti.mesh, this.puffs.mesh, this.stars.mesh);
  }

  burstConfetti(at: THREE.Vector3, n: number, power = 1): void {
    for (let k = 0; k < n; k++) {
      const { p, i } = this.confetti.spawn();
      p.pos.copy(at);
      const a = Math.random() * Math.PI * 2;
      const up = 5 + Math.random() * 5;
      const out = 1.5 + Math.random() * 3.5;
      p.vel.set(Math.cos(a) * out * power, up * power, Math.sin(a) * out * power);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      p.max = 1.5 + Math.random() * 0.9;
      p.size = 0.8 + Math.random() * 0.7;
      this.col.setHex(CONFETTI[(Math.random() * CONFETTI.length) | 0]);
      this.confetti.mesh.setColorAt(i, this.col);
    }
    if (this.confetti.mesh.instanceColor) this.confetti.mesh.instanceColor.needsUpdate = true;
  }

  puff(at: THREE.Vector3, n = 1, spread = 0.2, size = 0.4): void {
    for (let k = 0; k < n; k++) {
      const { p } = this.puffs.spawn();
      p.pos.set(at.x + (Math.random() - 0.5) * spread, 0.12 + Math.random() * 0.1, at.z + (Math.random() - 0.5) * spread);
      p.vel.set((Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2);
      p.spin.set(0, 0, 0);
      p.max = 0.45 + Math.random() * 0.25;
      p.size = size * (0.7 + Math.random() * 0.6);
    }
  }

  sparkle(at: THREE.Vector3, n = 8, radius = 0.9): void {
    for (let k = 0; k < n; k++) {
      const { p } = this.stars.spawn();
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
      p.pos.set(at.x, at.y + 0.6, at.z);
      p.vel.set(Math.cos(a) * radius * 3.2, 1.2 + Math.random() * 2, Math.sin(a) * radius * 3.2);
      p.rot.set(0, 0, Math.random() * 3);
      p.spin.set(0, 0, (Math.random() - 0.5) * 8);
      p.max = 0.5 + Math.random() * 0.25;
      p.size = 0.5 + Math.random() * 0.5;
    }
  }

  update(dt: number, camQ: THREE.Quaternion): void {
    this.confetti.update(dt, camQ);
    this.puffs.update(dt, camQ);
    this.stars.update(dt, camQ);
  }
}
