// The fairy-tale backdrop and the royal pedestal. Everything is built from primitives and canvas textures: no files.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TABLE_HALF, TABLE_THICK, TABLE_Y, TZ } from './level';

export const GOLD = 0xffc23a;
export const PURPLE = 0x6a2bd6;
const HORIZON = 0xcdeeff;

export function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Moves a geometry into place, so many parts can be merged into one draw call. */
export function placed(g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
  return (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  /** The table top's material: it flushes gold when the level is cleared. */
  readonly tableMat = new THREE.MeshStandardMaterial({ color: PURPLE, roughness: 0.32, metalness: 0.1 });
  readonly goldMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.28, metalness: 0.75 });
  private clouds: THREE.Group[] = [];
  private flag!: THREE.Mesh;
  private flagBase!: Float32Array;

  constructor(renderer: THREE.WebGLRenderer, lowPower: boolean) {
    const scene = this.scene;
    scene.background = canvasTexture(4, 256, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#2f86ec');
      grad.addColorStop(0.55, '#7cc3ff');
      grad.addColorStop(1, '#d9f3ff');
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 256);
    });
    scene.fog = new THREE.Fog(HORIZON, 60, 190);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x7dbf5a, 1.15));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    sun.position.set(-7, 16, TZ + 10);
    sun.target.position.set(0, TABLE_Y, TZ);
    sun.castShadow = true;
    const size = lowPower ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    const sc = sun.shadow.camera;
    sc.left = -7;
    sc.right = 7;
    sc.top = 7;
    sc.bottom = -5;
    sc.near = 2;
    sc.far = 50;
    sc.updateProjectionMatrix();
    this.sun = sun;
    scene.add(sun, sun.target);

    this.buildGround();
    this.buildPedestal();
    this.buildHills();
    this.buildCastle();
    this.buildTrees();
    this.buildClouds();
    this.buildBanner();
  }

  private buildGround(): void {
    // Mown stripes: one tiny canvas, repeated.
    const lawn = canvasTexture(64, 4, (g) => {
      g.fillStyle = '#74cc4f';
      g.fillRect(0, 0, 64, 4);
      g.fillStyle = '#69c245';
      g.fillRect(0, 0, 32, 4);
    });
    lawn.wrapS = lawn.wrapT = THREE.RepeatWrapping;
    lawn.repeat.set(70, 1);
    lawn.anisotropy = 8;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ map: lawn, roughness: 0.95 }));
    grass.rotation.x = -Math.PI / 2;
    grass.rotation.z = 0.35;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // The worn dirt circle the pedestal stands in.
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(4.3, 48), new THREE.MeshStandardMaterial({ color: 0xd8b27a, roughness: 1 }));
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(0, 0.012, TZ);
    dirt.scale.set(1.25, 0.8, 1);
    dirt.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 48), new THREE.MeshStandardMaterial({ color: 0x9fcf63, roughness: 1 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(0, 0.014, TZ);
    rim.scale.set(1.25, 0.8, 1);
    this.scene.add(dirt, rim);

    const rockMat = new THREE.MeshStandardMaterial({ color: 0xb7bccb, roughness: 0.85, flatShading: true });
    const rocks: THREE.BufferGeometry[] = [];
    const rock = new THREE.DodecahedronGeometry(0.5, 0);
    for (const [x, z, s] of [[-6.4, TZ + 2.5, 1.1], [-5.6, TZ + 3.2, 0.6], [6.8, TZ + 1.4, 1.3], [7.6, TZ + 2.3, 0.7], [-8.5, TZ - 3, 1.6], [9, TZ - 4, 1.4]]) rocks.push(placed(rock, x, s * 0.25, z, s * 1.3, s * 0.8, s, x));
    const r = new THREE.Mesh(merged(rocks), rockMat);
    r.castShadow = r.receiveShadow = true;
    this.scene.add(r);
  }

  private buildPedestal(): void {
    // A turned gold stand: flared foot, slim stem, a capital that spreads under the table.
    const profile = [
      [0, 0], [1.25, 0], [1.25, 0.16], [1.0, 0.26], [0.62, 0.38], [0.42, 0.62], [0.36, 1.0],
      [0.36, 1.35], [0.48, 1.48], [0.4, 1.56], [0.62, 1.72], [0.95, 1.86], [0.95, TABLE_Y - TABLE_THICK], [0, TABLE_Y - TABLE_THICK],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const stand = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), this.goldMat);
    stand.position.set(0, 0, TZ);
    stand.castShadow = stand.receiveShadow = true;
    this.scene.add(stand);
    // Purple bands on the stem, like the royal colours on the cannon.
    const bandMat = new THREE.MeshStandardMaterial({ color: PURPLE, roughness: 0.35 });
    for (const y of [0.85, 1.25]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.06, 10, 32), bandMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, y, TZ);
      this.scene.add(band);
    }

    const top = new THREE.Mesh(new RoundedBoxGeometry(TABLE_HALF.x * 2, TABLE_THICK, TABLE_HALF.z * 2, 3, 0.1), this.tableMat);
    top.position.set(0, TABLE_Y - TABLE_THICK / 2, TZ);
    top.castShadow = top.receiveShadow = true;
    const trim = new THREE.Mesh(new RoundedBoxGeometry(TABLE_HALF.x * 2 + 0.24, 0.13, TABLE_HALF.z * 2 + 0.24, 3, 0.06), this.goldMat);
    trim.position.set(0, TABLE_Y - TABLE_THICK - 0.02, TZ);
    trim.castShadow = true;
    this.scene.add(top, trim);
  }

  private buildHills(): void {
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 });
    const hill = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const near: THREE.BufferGeometry[] = [];
    for (const [x, z, sx, sy] of [[-34, -70, 30, 7], [10, -78, 34, 6], [44, -66, 26, 8], [-6, -96, 40, 9]]) near.push(placed(hill, x, 0, z, sx, sy, 16));
    this.scene.add(new THREE.Mesh(merged(near), mat(0x86d260)));

    // Snowy peaks far away, softened by the fog.
    const peak = new THREE.ConeGeometry(1, 1, 7);
    const rockParts: THREE.BufferGeometry[] = [];
    const snowParts: THREE.BufferGeometry[] = [];
    for (const [x, z, r, h] of [[-58, -150, 26, 36], [-22, -165, 30, 46], [18, -158, 24, 34], [52, -150, 28, 40], [86, -170, 30, 44], [-92, -170, 30, 40]]) {
      rockParts.push(placed(peak, x, h / 2, z, r, h, r, x));
      snowParts.push(placed(peak, x, h - h * 0.17, z, r * 0.34 + 0.4, h * 0.34 + 0.2, r * 0.34 + 0.4, x));
    }
    // Faceted, so the light picks out a lit side and a shaded side on each peak.
    const rock = new THREE.MeshStandardMaterial({ color: 0x9db8e6, roughness: 1, flatShading: true });
    const snow = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    this.scene.add(new THREE.Mesh(merged(rockParts), rock), new THREE.Mesh(merged(snowParts), snow));
  }

  private buildCastle(): void {
    const wall = new THREE.MeshStandardMaterial({ color: 0xf3e7d3, roughness: 0.8 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x8a46f0, roughness: 0.45 });
    const g = new THREE.Group();
    const walls: THREE.BufferGeometry[] = [];
    const roofs: THREE.BufferGeometry[] = [];
    const tips: THREE.BufferGeometry[] = [];
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 18);
    const cone = new THREE.ConeGeometry(1, 1, 18);
    const ball = new THREE.SphereGeometry(1, 10, 8);
    walls.push(placed(box, 0, 3, 0, 12, 6, 5));
    for (let i = -5; i <= 5; i += 2) walls.push(placed(box, i, 6.4, 2.3, 0.9, 0.8, 0.5));
    const tower = (x: number, z: number, r: number, h: number) => {
      walls.push(placed(cyl, x, h / 2, z, r, h, r));
      roofs.push(placed(cone, x, h + r * 1.1, z, r * 1.3, r * 2.4, r * 1.3));
      tips.push(placed(ball, x, h + r * 2.4, z, 0.35, 0.35, 0.35));
    };
    tower(-6.5, 1, 1.6, 9);
    tower(6.5, 1, 1.6, 9);
    tower(0, -1, 2.2, 13);
    tower(-3, -2, 1.1, 10.5);
    tower(3.2, -2, 1.1, 10);
    g.add(new THREE.Mesh(merged(walls), wall), new THREE.Mesh(merged(roofs), roof), new THREE.Mesh(merged(tips), this.goldMat));
    g.position.set(-9, 0, -82);
    g.rotation.y = 0.18;
    this.scene.add(g);
  }

  private buildTrees(): void {
    const leaf = new THREE.MeshStandardMaterial({ color: 0x52b83a, roughness: 0.75 });
    const leafLight = new THREE.MeshStandardMaterial({ color: 0x7fd650, roughness: 0.75 });
    const bark = new THREE.MeshStandardMaterial({ color: 0x8b5a33, roughness: 0.9 });
    const crowns: THREE.BufferGeometry[] = [];
    const highlights: THREE.BufferGeometry[] = [];
    const trunks: THREE.BufferGeometry[] = [];
    const s = new THREE.SphereGeometry(1, 16, 12);
    const t = new THREE.CylinderGeometry(0.22, 0.32, 1, 8);
    const spots: [number, number, number][] = [
      [-9.5, -9, 1.3], [-11.5, -16, 1.6], [-8.6, -24, 1.2], [-15, -30, 1.9], [-7.5, -38, 1.5], [-20, -44, 2.2],
      [9.2, -8, 1.2], [12, -17, 1.7], [8.8, -26, 1.3], [16, -33, 2], [7.4, -41, 1.4], [22, -48, 2.3],
      [-28, -58, 2.6], [30, -60, 2.8], [2, -52, 1.8],
    ];
    for (const [x, z, k] of spots) {
      trunks.push(placed(t, x, k * 0.9, z, k, k * 1.8, k));
      crowns.push(placed(s, x, k * 2.6, z, k * 1.35, k * 1.2, k * 1.35));
      crowns.push(placed(s, x - k * 0.7, k * 2.1, z + 0.3, k * 0.85, k * 0.8, k * 0.85));
      highlights.push(placed(s, x + k * 0.35, k * 3.1, z + k * 0.5, k * 0.7, k * 0.6, k * 0.7));
    }
    const a = new THREE.Mesh(merged(crowns), leaf);
    const b = new THREE.Mesh(merged(highlights), leafLight);
    const c = new THREE.Mesh(merged(trunks), bark);
    a.castShadow = c.castShadow = true;
    this.scene.add(a, b, c);
  }

  private buildClouds(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.38 });
    const s = new THREE.SphereGeometry(1, 16, 12);
    const puffs: [number, number, number, number][] = [[0, 0, 0, 3], [3, -0.6, 0.4, 2.3], [-3.2, -0.8, 0.2, 2.2], [1.4, 1.4, -0.4, 2.2], [-1.6, 1, 0, 1.8]];
    for (const [x, y, z, k] of [[-26, 30, -110, 1.6], [18, 36, -120, 2], [44, 24, -100, 1.3], [-48, 22, -95, 1.4], [0, 44, -140, 2.4]]) {
      const geo = merged(puffs.map(([px, py, pz, r]) => placed(s, px, py, pz, r, r * 0.85, r)));
      const cloud = new THREE.Group();
      cloud.add(new THREE.Mesh(geo, mat));
      cloud.position.set(x, y, z);
      cloud.scale.setScalar(k);
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  private buildBanner(): void {
    // A royal banner on a gold pole, to the left of the pedestal. It waves.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 8), this.goldMat);
    pole.position.set(-6.3, 3, TZ - 1.5);
    pole.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), this.goldMat);
    knob.position.set(-6.3, 6.05, TZ - 1.5);
    const tex = canvasTexture(64, 128, (g) => {
      g.fillStyle = '#7a34e0';
      g.fillRect(0, 0, 64, 128);
      g.fillStyle = '#ffc23a';
      g.fillRect(0, 0, 64, 8);
      crown(g, 32, 62, 34);
    });
    const geo = new THREE.PlaneGeometry(1.3, 2.5, 8, 4);
    this.flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 }));
    this.flag.position.set(-6.3 + 0.67, 4.6, TZ - 1.5);
    this.flagBase = Float32Array.from(geo.attributes.position.array as Float32Array);
    this.scene.add(pole, knob, this.flag);
  }

  update(time: number): void {
    this.clouds.forEach((c, i) => (c.position.x += Math.sin(time * 0.05 + i) * 0.004 + 0.006));
    // Flag ripple: a travelling wave that grows towards the free edge.
    const pos = this.flag.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = this.flagBase[i] + 0.65;
      arr[i + 2] = Math.sin(time * 4 - x * 3.2) * 0.14 * x;
    }
    pos.needsUpdate = true;
  }
}

/** A little five-point crown, used on the banner, the gold blocks and the cannon. */
export function crown(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, fill = '#ffc23a', stroke?: string): void {
  const h = w * 0.62;
  g.beginPath();
  g.moveTo(cx - w / 2, cy + h / 2);
  g.lineTo(cx - w / 2, cy - h / 2 + h * 0.15);
  g.lineTo(cx - w / 4, cy);
  g.lineTo(cx, cy - h / 2);
  g.lineTo(cx + w / 4, cy);
  g.lineTo(cx + w / 2, cy - h / 2 + h * 0.15);
  g.lineTo(cx + w / 2, cy + h / 2);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = w * 0.07;
    g.strokeStyle = stroke;
    g.stroke();
  }
}
