// Pooled, instanced particles: jam droplets that land as stains, glass shards, sparks, smoke, confetti and flashes.
import * as THREE from 'three';
import { TABLE_HALF, TABLE_Y, TZ, type V3 } from './level';
import { canvasTexture } from './world';

const CONFETTI = [0xff3b4f, 0xffc928, 0x2f8bff, 0x9b4dff, 0x3ddc6b, 0xff5fb8, 0xffffff];

interface P {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: number;
}

type Shape = (p: P, t: number) => number;

class Pool {
  readonly mesh: THREE.InstancedMesh;
  readonly items: P[] = [];
  private cursor = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private dirtyColor = false;
  /** Called when a particle touches the table or the grass. Return true to kill it. */
  onLand: ((p: P, onTable: boolean) => boolean) | null = null;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, private gravity: number, private drag: number, private shape: Shape, private billboard = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.items.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, max: 1, size: 1, color: 0xffffff });
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, this.c.setHex(0xffffff));
    }
  }

  spawn(color?: number): P {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.items.length;
    const p = this.items[i];
    p.alive = true;
    p.life = 0;
    p.rot.set(0, 0, 0);
    p.spin.set(0, 0, 0);
    if (color !== undefined && color !== p.color) {
      p.color = color;
      this.mesh.setColorAt(i, this.c.setHex(color));
      this.dirtyColor = true;
    }
    return p;
  }

  update(dt: number, camQ: THREE.Quaternion): void {
    let dirty = false;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      if (!p.alive) continue;
      dirty = true;
      p.life += dt;
      const t = p.life / p.max;
      let dead = t >= 1;
      if (!dead) {
        p.vel.y -= this.gravity * dt;
        p.vel.multiplyScalar(Math.exp(-this.drag * dt));
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        if (this.onLand) {
          const onTable = Math.abs(p.pos.x) < TABLE_HALF.x && Math.abs(p.pos.z - TZ) < TABLE_HALF.z && p.pos.y < TABLE_Y && p.pos.y > TABLE_Y - 0.4;
          if ((onTable || p.pos.y < 0.02) && p.vel.y < 0) dead = this.onLand(p, onTable);
        }
      }
      if (dead) {
        p.alive = false;
        this.s.set(0, 0, 0);
      } else {
        const k = this.shape(p, t) * p.size;
        this.s.set(k, k, k);
      }
      if (this.billboard) this.q.copy(camQ);
      else this.q.setFromEuler(p.rot);
      this.m.compose(p.pos, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
    if (this.dirtyColor && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this.dirtyColor = false;
    }
  }
}

function star(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 0.17 : 0.5;
    const a = (i / 8) * Math.PI * 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(s);
}

/** Stains stay where the jam landed for the rest of the ad. Oldest ones are recycled. */
class Stains {
  readonly mesh: THREE.InstancedMesh;
  private cursor = 0;
  private grow: { i: number; t: number; size: number; pos: THREE.Vector3; rot: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(count: number) {
    const tex = canvasTexture(64, 64, (g) => {
      // A blobby splat: a disc with a few satellite drops, soft at the edge.
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(32, 32, 19, 0, Math.PI * 2);
      g.fill();
      for (const [x, y, r] of [[52, 30, 6], [14, 40, 5], [36, 54, 4], [24, 12, 4], [48, 50, 3]]) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, this.c.setHex(0xffffff));
    }
  }

  add(x: number, y: number, z: number, color: number, size: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.mesh.count;
    this.mesh.setColorAt(i, this.c.setHex(color).multiplyScalar(0.85));
    this.mesh.instanceColor!.needsUpdate = true;
    this.grow.push({ i, t: 0, size, pos: new THREE.Vector3(x, y, z), rot: Math.random() * Math.PI * 2 });
  }

  update(dt: number): void {
    if (!this.grow.length) return;
    for (const g of this.grow) {
      g.t = Math.min(1, g.t + dt / 0.18);
      const k = g.size * (1 - Math.pow(1 - g.t, 3));
      this.q.setFromEuler(this.e.set(0, g.rot, 0));
      this.m.compose(g.pos, this.q, this.s.set(k, 1, k));
      this.mesh.setMatrixAt(g.i, this.m);
    }
    this.grow = this.grow.filter((g) => g.t < 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Additive glow sprites: muzzle flash and impact flash. */
class Flashes {
  readonly group = new THREE.Group();
  private items: { s: THREE.Sprite; t: number; max: number; size: number }[] = [];

  constructor(n: number) {
    const tex = canvasTexture(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.25, 'rgba(255,240,170,0.9)');
      r.addColorStop(0.6, 'rgba(255,170,60,0.25)');
      r.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    });
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      s.renderOrder = 10;
      this.items.push({ s, t: 1, max: 1, size: 1 });
      this.group.add(s);
    }
  }

  fire(at: THREE.Vector3, size: number, max = 0.22, color = 0xffffff): void {
    const it = this.items.find((i) => i.t >= i.max) ?? this.items[0];
    it.t = 0;
    it.max = max;
    it.size = size;
    it.s.position.copy(at);
    (it.s.material as THREE.SpriteMaterial).color.setHex(color);
    it.s.visible = true;
  }

  update(dt: number): void {
    for (const it of this.items) {
      if (it.t >= it.max) continue;
      it.t += dt;
      const k = Math.min(1, it.t / it.max);
      it.s.scale.setScalar(it.size * (0.5 + k * 0.9));
      (it.s.material as THREE.SpriteMaterial).opacity = 1 - k * k;
      if (k >= 1) it.s.visible = false;
    }
  }
}

export class Fx {
  private drops: Pool;
  private shards: Pool;
  private sparks: Pool;
  private smoke: Pool;
  private confetti: Pool;
  private stains = new Stains(90);
  private flashes = new Flashes(8);
  private v = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.drops = new Pool(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.2 }), 320, 17, 0.4, (_p, t) => (t > 0.85 ? (1 - t) / 0.15 : 1));
    this.drops.onLand = (p, onTable) => {
      if (Math.random() < 0.55) this.stains.add(p.pos.x, onTable ? TABLE_Y + 0.004 : 0.02, p.pos.z, p.color, 0.18 + p.size * 1.6);
      return true;
    };
    this.shards = new Pool(new THREE.TetrahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }), 160, 16, 0.6, (_p, t) => (t > 0.75 ? (1 - t) / 0.25 : 1));
    this.sparks = new Pool(star(), new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }), 90, 4, 3, (_p, t) => Math.sin(t * Math.PI), true);
    this.smoke = new Pool(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.3, depthWrite: false }), 120, -0.8, 2.6, (_p, t) => Math.sin(Math.min(1, t * 1.2) * Math.PI) * 0.9 + 0.1 * (1 - t));
    this.confetti = new Pool(new THREE.PlaneGeometry(0.16, 0.26), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 260, 8, 1.1, (_p, t) => (t > 0.8 ? (1 - t) / 0.2 : 1));
    scene.add(this.drops.mesh, this.shards.mesh, this.sparks.mesh, this.smoke.mesh, this.confetti.mesh, this.stains.mesh, this.flashes.group);
    this.shards.mesh.castShadow = this.drops.mesh.castShadow = true;
  }

  /** A jar bursts: a flash, jam flying everywhere, glass shards, the lid spinning off. */
  jar(at: V3, color: number, power = 1): void {
    this.v.set(at[0], at[1], at[2]);
    this.flashes.fire(this.v, 1.5 * power, 0.18);
    for (let i = 0; i < 22; i++) {
      const p = this.drops.spawn(color);
      p.pos.set(at[0] + (Math.random() - 0.5) * 0.25, at[1] + (Math.random() - 0.3) * 0.3, at[2] + (Math.random() - 0.5) * 0.25);
      const a = Math.random() * Math.PI * 2;
      const out = (1.5 + Math.random() * 4.5) * power;
      p.vel.set(Math.cos(a) * out, (2 + Math.random() * 6) * power, Math.sin(a) * out * 0.7 + 0.8);
      p.max = 1.6;
      p.size = 0.06 + Math.random() * 0.12;
    }
    const glass = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45).getHex();
    for (let i = 0; i < 9; i++) {
      const p = this.shards.spawn(glass);
      p.pos.set(at[0], at[1], at[2]);
      p.vel.set((Math.random() - 0.5) * 7, 2 + Math.random() * 5, (Math.random() - 0.3) * 5);
      p.spin.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22);
      p.max = 0.9 + Math.random() * 0.5;
      p.size = 0.08 + Math.random() * 0.1;
    }
    for (let i = 0; i < 2; i++) this.puff(at, 0.35, 0.35);
  }

  /** The cannonball's first hit: sparks and a bright flash. */
  impact(at: V3, big = false): void {
    this.v.set(at[0], at[1], at[2]);
    this.flashes.fire(this.v, big ? 6 : 2.6, big ? 0.4 : 0.24, 0xfff4c0);
    for (let i = 0; i < (big ? 34 : 14); i++) {
      const p = this.sparks.spawn();
      p.pos.copy(this.v);
      const a = Math.random() * Math.PI * 2;
      const r = (big ? 9 : 5) * (0.4 + Math.random() * 0.8);
      p.vel.set(Math.cos(a) * r, Math.sin(a) * r * 0.8 + 2, (Math.random() - 0.5) * 3);
      p.max = 0.35 + Math.random() * 0.3;
      p.size = big ? 0.6 : 0.35 + Math.random() * 0.25;
    }
  }

  muzzle(at: THREE.Vector3, dir: THREE.Vector3, big = false): void {
    this.flashes.fire(at, big ? 4 : 2.2, 0.16, 0xffe9a8);
    for (let i = 0; i < (big ? 10 : 6); i++) {
      const p = this.smoke.spawn();
      p.pos.copy(at);
      const s = 2 + Math.random() * 3;
      p.vel.set(dir.x * s + (Math.random() - 0.5) * 2, dir.y * s + Math.random() * 1.5, dir.z * s + (Math.random() - 0.5) * 2);
      p.max = 0.5 + Math.random() * 0.4;
      p.size = (big ? 0.9 : 0.55) * (0.6 + Math.random() * 0.6);
    }
  }

  /** Little smoke puff, for the ball's trail and for heavy things landing. */
  puff(at: V3 | THREE.Vector3, size = 0.3, spread = 0.1): void {
    const p = this.smoke.spawn();
    const [x, y, z] = Array.isArray(at) ? at : [at.x, at.y, at.z];
    p.pos.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread);
    p.vel.set((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6);
    p.max = 0.35 + Math.random() * 0.2;
    p.size = size * (0.7 + Math.random() * 0.6);
  }

  sparkle(at: THREE.Vector3, n = 8, radius = 1): void {
    for (let k = 0; k < n; k++) {
      const p = this.sparks.spawn();
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
      p.pos.copy(at);
      p.vel.set(Math.cos(a) * radius * 3, 1 + Math.random() * 2.5, Math.sin(a) * radius * 1.5);
      p.max = 0.5 + Math.random() * 0.3;
      p.size = 0.3 + Math.random() * 0.3;
    }
  }

  burstConfetti(at: THREE.Vector3, n: number, power = 1): void {
    for (let k = 0; k < n; k++) {
      const p = this.confetti.spawn(CONFETTI[(Math.random() * CONFETTI.length) | 0]);
      p.pos.copy(at);
      const a = Math.random() * Math.PI * 2;
      const up = 6 + Math.random() * 6;
      const out = 1.5 + Math.random() * 4;
      p.vel.set(Math.cos(a) * out * power, up * power, Math.sin(a) * out * power);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      p.max = 1.8 + Math.random() * 1;
      p.size = 1 + Math.random() * 0.8;
    }
  }

  /** Jam stains from smashes that happened "before" the ad began: part of the head start. */
  preStain(x: number, z: number, color: number): void {
    this.stains.add(x, TABLE_Y + 0.004, z, color, 0.5 + Math.random() * 0.35);
  }

  update(dt: number, camQ: THREE.Quaternion): void {
    this.drops.update(dt, camQ);
    this.shards.update(dt, camQ);
    this.sparks.update(dt, camQ);
    this.smoke.update(dt, camQ);
    this.confetti.update(dt, camQ);
    this.stains.update(dt);
    this.flashes.update(dt);
  }
}
