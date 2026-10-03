// The royal cannon, its cannonballs and the dotted aim line. Built from lathes, tori and canvas textures.
import * as THREE from 'three';
import { BALL_R, GRAVITY } from './level';
import { canvasTexture, crown, GOLD, PURPLE } from './world';


function ballTexture(base: string, zig: string, star: string): THREE.CanvasTexture {
  return canvasTexture(256, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 128);
    // A zig-zag band round the equator, and a star on each side.
    g.fillStyle = zig;
    g.beginPath();
    g.moveTo(0, 52);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, x % 32 ? 44 : 60);
    for (let x = 256; x >= 0; x -= 16) g.lineTo(x, x % 32 ? 76 : 92);
    g.closePath();
    g.fill();
    for (const cx of [64, 192]) {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 9 : 22;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(cx + Math.cos(a) * r, 22 + Math.sin(a) * r * 0.7);
      }
      g.closePath();
      g.fillStyle = star;
      g.fill();
    }
  });
}

export class Cannon {
  readonly root = new THREE.Group();
  /** Turns left and right. */
  private yaw = new THREE.Group();
  /** Tilts up and down; the barrel lives here. */
  private pitch = new THREE.Group();
  private barrel = new THREE.Group();
  private glowMat = new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  private glow: THREE.Mesh;
  private recoil = 0;
  private aimYaw = 0;
  private aimPitch = 0.2;
  private v = new THREE.Vector3();
  /** 0..1, the "giant ball is loaded" glow. */
  charge = 0;

  constructor() {
    const red = new THREE.MeshStandardMaterial({ color: 0xe8202f, roughness: 0.18, metalness: 0.1, side: THREE.DoubleSide });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2d5bff, roughness: 0.25, metalness: 0.1 });
    const gold = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.25, metalness: 0.8 });
    const purple = new THREE.MeshStandardMaterial({ color: PURPLE, roughness: 0.3 });

    // Ring platform, like the turntable the real cannon sits on.
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 0.3, 40), purple);
    deck.position.y = -0.82;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.12, 10, 48), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.67;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 8, 40), gold);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = -0.66;
    this.root.add(deck, ring, inner);

    // Carriage: two fat blue wheels with gold hubs.
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 28), blue);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.74, -0.22, 0.3);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 18), gold);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      hub.position.x += side * 0.03;
      this.yaw.add(wheel, hub);
    }

    // The barrel points down -z. A lathe gives it the bulging breech and the flared muzzle.
    // Profile runs from inside the bore, over the lip, back along the outside to the breech.
    const prof = [[0.3, -1.2], [0.36, -1.4], [0.5, -1.42], [0.56, -1.38], [0.52, -1.3], [0.42, -1.25], [0.44, -1.1], [0.5, -0.4], [0.56, 0.2], [0.55, 0.5], [0.42, 0.72], [0, 0.75]]
      .map(([r, z]) => new THREE.Vector2(r, z));
    const lathe = new THREE.LatheGeometry(prof, 36);
    // Lathe "y" becomes z, so the muzzle (y = -1.4) ends up pointing down -z.
    lathe.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(lathe, red);
    const bore = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshBasicMaterial({ color: 0x2a0b12 }));
    bore.position.z = -1.39;
    bore.rotation.y = Math.PI;
    const bands: [number, number, THREE.Material, number][] = [
      [0.15, 0.57, blue, 0.09],
      [-0.25, 0.53, gold, 0.06],
      [-1.0, 0.46, blue, 0.07],
      [-1.36, 0.55, gold, 0.07],
    ];
    for (const [z, r, mat, tube] of bands) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 36), mat);
      t.position.z = z;
      this.barrel.add(t);
    }
    // Crown emblem on top of the barrel.
    const emblemTex = canvasTexture(64, 64, (g) => crown(g, 32, 34, 50, '#ffc23a', '#a55f00'));
    const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: emblemTex, transparent: true, metalness: 0.6, roughness: 0.3 }));
    emblem.position.set(0, 0.585, -0.45);
    emblem.rotation.x = -Math.PI / 2 + 0.07;
    // Breech knob
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), gold);
    knob.position.z = 0.85;
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 14), this.glowMat);
    this.glow.position.z = -1.45;
    this.barrel.add(body, bore, emblem, knob, this.glow);
    this.barrel.position.z = 0.15;
    this.pitch.add(this.barrel);
    this.yaw.add(this.pitch);
    this.root.add(this.yaw);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== this.glow) o.castShadow = true;
    });
  }

  /** Points the barrel at a world position. */
  aim(target: THREE.Vector3): void {
    this.root.updateMatrixWorld();
    this.v.copy(target);
    this.root.worldToLocal(this.v);
    this.aimYaw = Math.atan2(-this.v.x, -this.v.z);
    this.aimPitch = Math.atan2(this.v.y, Math.hypot(this.v.x, this.v.z));
  }

  kick(big = false): void {
    this.recoil = big ? 1.6 : 1;
  }

  /** Where a ball appears: the mouth of the barrel, in world space. */
  muzzle(out: THREE.Vector3): THREE.Vector3 {
    this.barrel.updateWorldMatrix(true, false);
    return out.set(0, 0, -1.5).applyMatrix4(this.barrel.matrixWorld);
  }

  update(dt: number, time: number): void {
    const k = 1 - Math.exp(-18 * dt);
    this.yaw.rotation.y += (this.aimYaw - this.yaw.rotation.y) * k;
    this.pitch.rotation.x += (Math.min(0.5, Math.max(-0.1, this.aimPitch)) - this.pitch.rotation.x) * k;
    this.recoil *= Math.exp(-7 * dt);
    // Recoil: slide back and squash, then spring forward.
    this.barrel.position.z = 0.15 + this.recoil * 0.45;
    const sq = this.recoil * 0.12;
    this.barrel.scale.set(1 + sq, 1 + sq, 1 - sq * 1.5);
    this.glowMat.opacity = this.charge * (0.55 + 0.25 * Math.sin(time * 10));
    this.glow.scale.setScalar(1 + this.charge * 0.25 * Math.sin(time * 7));
  }
}

/** The balls in flight, pooled. The giant one is the same mesh, scaled up and gilded. */
export class Balls {
  readonly group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private normal: THREE.MeshStandardMaterial;
  private giant: THREE.MeshStandardMaterial;

  constructor() {
    this.normal = new THREE.MeshStandardMaterial({ map: ballTexture('#ff2b3d', '#ffd23a', '#ffd23a'), roughness: 0.2, metalness: 0.05 });
    this.giant = new THREE.MeshStandardMaterial({ map: ballTexture('#ffc23a', '#ff2b3d', '#ffffff'), roughness: 0.22, metalness: 0.45, emissive: 0x553300, emissiveIntensity: 0.4 });
    const geo = new THREE.SphereGeometry(BALL_R, 28, 18);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(geo, this.normal);
      m.castShadow = true;
      m.visible = false;
      this.meshes.push(m);
      this.group.add(m);
    }
  }

  get(i: number, giant: boolean, scale: number): THREE.Mesh {
    const m = this.meshes[i % this.meshes.length];
    m.material = giant ? this.giant : this.normal;
    m.scale.setScalar(scale);
    m.visible = true;
    return m;
  }

  hide(i: number): void {
    this.meshes[i % this.meshes.length].visible = false;
  }
}

/** The dotted trajectory shown while the viewer holds a finger down. */
export class AimLine {
  readonly mesh: THREE.InstancedMesh;
  private n = 16;
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  visible = 0;

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }), this.n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** Same arc the simulation will fly, from the drawn muzzle to the target. Dots march along it. */
  set(from: THREE.Vector3, to: THREE.Vector3, time: number, speed: number): void {
    const d = from.distanceTo(to);
    const T = d / speed;
    for (let i = 0; i < this.n; i++) {
      const u = ((i + ((time * 2.2) % 1)) / this.n) * 0.92;
      const t = u * T;
      this.p.lerpVectors(from, to, u);
      // Same lift the physics adds: y(t) = vy*t - g t^2/2 with vy carrying g*T/2.
      this.p.y += (GRAVITY * T * t) / 2 - (GRAVITY * t * t) / 2;
      const fade = Math.min(1, u * 9) * this.visible;
      this.s.setScalar(fade * (1 - u * 0.45));
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  hide(): void {
    this.visible = 0;
    this.s.setScalar(0);
    this.m.compose(this.p, this.q, this.s);
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
