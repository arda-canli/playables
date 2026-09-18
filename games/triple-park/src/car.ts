// A toy car built entirely from primitives: no model files, a few KB of geometry shared by every car.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarSpec, ColorId } from './logic';
import { CAR_COLORS } from './layout';

interface CarGeo {
  paint: THREE.BufferGeometry;
  dark: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  lights: THREE.BufferGeometry;
  eyeWhite: THREE.BufferGeometry;
  pupil: THREE.BufferGeometry;
  tarp: THREE.BufferGeometry;
  pick: THREE.BufferGeometry;
  decal: THREE.BufferGeometry;
}

interface CarMats {
  paint: Map<ColorId, THREE.MeshStandardMaterial>;
  dark: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  lights: THREE.MeshStandardMaterial;
  eyeWhite: THREE.MeshStandardMaterial;
  pupil: THREE.MeshBasicMaterial;
  tarp: THREE.MeshStandardMaterial;
  pick: THREE.MeshBasicMaterial;
}

let GEO: CarGeo | null = null;
let MATS: CarMats | null = null;

function at(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const out = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
  return out;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

const EYE_Y = 0.93;
const EYE_Z = 0.27;
const EYE_X = 0.2;
const EYE_R = 0.17;

function buildGeo(): CarGeo {
  const rb = (w: number, h: number, d: number, r: number, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
  const wheel = new THREE.CylinderGeometry(0.2, 0.2, 0.16, 14);
  const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.17, 10);
  const H = Math.PI / 2;
  const wheelPos: [number, number][] = [
    [-0.44, 0.46],
    [0.44, 0.46],
    [-0.44, -0.48],
    [0.44, -0.48],
  ];

  return {
    // Body shell, cabin and a slightly raised bonnet.
    paint: merge([
      at(rb(0.98, 0.42, 1.52, 0.17, 4), 0, 0.43, 0),
      at(rb(0.84, 0.42, 0.86, 0.17, 4), 0, 0.8, -0.12),
      at(rb(0.7, 0.1, 0.46, 0.05), 0, 0.64, 0.47),
      // wing mirrors
      at(rb(0.16, 0.1, 0.12, 0.04), -0.5, 0.72, 0.2),
      at(rb(0.16, 0.1, 0.12, 0.04), 0.5, 0.72, 0.2),
    ]),
    dark: merge([...wheelPos.map(([x, z]) => at(wheel, x, 0.2, z, 0, 0, H)), at(rb(0.34, 0.07, 0.05, 0.025), 0, 0.37, 0.76)]),
    trim: merge([...wheelPos.map(([x, z]) => at(hub, x, 0.2, z, 0, 0, H)), at(rb(0.92, 0.11, 0.1, 0.05), 0, 0.27, 0.74), at(rb(0.92, 0.11, 0.1, 0.05), 0, 0.27, -0.74)]),
    glass: merge([
      at(rb(0.66, 0.2, 0.06, 0.03), 0, 0.76, 0.3),
      at(rb(0.06, 0.2, 0.5, 0.03), -0.4, 0.82, -0.12),
      at(rb(0.06, 0.2, 0.5, 0.03), 0.4, 0.82, -0.12),
      at(rb(0.6, 0.2, 0.06, 0.03), 0, 0.82, -0.53),
      // sunroof, so the car still reads as a car from above
      at(rb(0.52, 0.04, 0.4, 0.02), 0, 1.0, -0.2),
    ]),
    lights: merge([at(new THREE.SphereGeometry(0.095, 12, 8).scale(1, 1, 0.5), -0.33, 0.47, 0.75), at(new THREE.SphereGeometry(0.095, 12, 8).scale(1, 1, 0.5), 0.33, 0.47, 0.75)]),
    eyeWhite: new THREE.SphereGeometry(EYE_R, 18, 14),
    pupil: new THREE.SphereGeometry(0.085, 12, 10).scale(1, 1, 0.45),
    tarp: at(rb(1.1, 0.86, 1.64, 0.26, 4), 0, 0.5, 0),
    pick: at(new THREE.BoxGeometry(1.2, 1.2, 1.8), 0, 0.6, 0),
    decal: new THREE.PlaneGeometry(0.72, 0.72),
  };
}

function questionTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '600 118px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 16;
  g.strokeStyle = '#ffffff';
  g.strokeText('?', 64, 70);
  g.fillStyle = '#7a52d6';
  g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let decalMat: THREE.MeshBasicMaterial | null = null;

export function initCarAssets(): void {
  if (GEO) return;
  GEO = buildGeo();
  const paint = new Map<ColorId, THREE.MeshStandardMaterial>();
  (Object.keys(CAR_COLORS) as ColorId[]).forEach((id) => paint.set(id, new THREE.MeshStandardMaterial({ color: CAR_COLORS[id], roughness: 0.28, metalness: 0.05, envMapIntensity: 0.9 })));
  MATS = {
    paint,
    dark: new THREE.MeshStandardMaterial({ color: 0x252a36, roughness: 0.75 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xe9edf5, roughness: 0.35, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1d2b45, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.4 }),
    lights: new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.55, roughness: 0.2 }),
    eyeWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, emissive: 0xffffff, emissiveIntensity: 0.12 }),
    pupil: new THREE.MeshBasicMaterial({ color: 0x14161f }),
    tarp: new THREE.MeshStandardMaterial({ color: 0xf6ecd6, roughness: 0.95, transparent: true }),
    pick: new THREE.MeshBasicMaterial({ visible: false }),
  };
  decalMat = new THREE.MeshBasicMaterial({ map: questionTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}

export type CarState = 'lane' | 'driving' | 'parked' | 'leaving';

export class Car {
  readonly group = new THREE.Group();
  /** Everything visible hangs off this, so squash and bounce never fight with world position. */
  readonly body = new THREE.Group();
  readonly pick: THREE.Mesh;
  state: CarState = 'lane';
  row = 0;
  matchGroup: MatchGroup | null = null;

  private inner = new THREE.Group();
  private paintMesh: THREE.Mesh;
  private eyes = new THREE.Group();
  private pivots: THREE.Object3D[] = [];
  private tarp: THREE.Group | null = null;
  private tarpMat: THREE.MeshStandardMaterial | null = null;
  private blinkIn: number;
  private blinkT = 0;
  private lookX = 0;
  private lookY = 0;
  private lookTX = 0;
  private lookTY = 0;
  private saccadeIn: number;
  private phase = Math.random() * 10;
  /** 0..1, set by the game when the holder is nearly full. */
  worry = 0;

  constructor(readonly spec: CarSpec) {
    const G = GEO!;
    const M = MATS!;
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = false) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast;
      m.receiveShadow = false;
      return m;
    };
    this.paintMesh = mesh(G.paint, M.paint.get(spec.color ?? 'red')!, true);
    this.inner.add(this.paintMesh, mesh(G.dark, M.dark, true), mesh(G.trim, M.trim), mesh(G.glass, M.glass), mesh(G.lights, M.lights));

    this.eyes.position.set(0, EYE_Y, EYE_Z);
    for (const sx of [-1, 1]) {
      const white = mesh(G.eyeWhite, M.eyeWhite);
      white.position.x = sx * EYE_X;
      // The pivot's +z is the gaze. Resting gaze points up and forward, straight at the camera.
      const pivot = new THREE.Object3D();
      pivot.position.x = sx * EYE_X;
      const pupil = mesh(G.pupil, M.pupil);
      pupil.position.z = EYE_R - 0.012;
      pivot.add(pupil);
      this.pivots.push(pivot);
      this.eyes.add(white, pivot);
    }
    this.inner.add(this.eyes);
    this.body.add(this.inner);

    if (spec.mystery) {
      this.tarp = new THREE.Group();
      this.tarpMat = M.tarp.clone();
      const cover = mesh(G.tarp, this.tarpMat, true);
      const top = mesh(G.decal, decalMat!);
      top.rotation.x = -Math.PI / 2;
      top.position.set(0, 0.94, -0.05);
      const frontDecal = mesh(G.decal, decalMat!);
      frontDecal.position.set(0, 0.5, 0.825);
      frontDecal.scale.setScalar(0.8);
      this.tarp.add(cover, top, frontDecal);
      this.body.add(this.tarp);
      this.inner.visible = false;
    }

    this.pick = mesh(G.pick, M.pick);
    this.pick.userData.car = this;
    this.group.add(this.body, this.pick);

    this.blinkIn = 1 + Math.random() * 4;
    this.saccadeIn = 0.5 + Math.random() * 2;
  }

  get covered(): boolean {
    return !!this.tarp;
  }

  get color(): ColorId | null {
    return this.spec.color;
  }

  /** Swaps the tarp for the real car. Returns once the cover is gone. */
  uncover(onProgress: (run: (v: number) => void) => Promise<void>): Promise<void> {
    if (!this.tarp || !this.spec.color) return Promise.resolve();
    const tarp = this.tarp;
    const mat = this.tarpMat!;
    this.tarp = null;
    this.paintMesh.material = MATS!.paint.get(this.spec.color)!;
    this.inner.visible = true;
    return onProgress((v) => {
      tarp.scale.setScalar(1 + v * 0.45);
      tarp.position.y = v * 0.5;
      mat.opacity = 1 - v;
      this.inner.scale.setScalar(0.55 + 0.45 * v);
    }).then(() => {
      this.body.remove(tarp);
      mat.dispose();
    });
  }

  /** Gaze target in eye space, each roughly -1..1. */
  lookAt(x: number, y: number): void {
    this.lookTX = x;
    this.lookTY = y;
    this.saccadeIn = 1.2 + Math.random() * 2;
  }

  update(dt: number, time: number): void {
    // Blinking
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.13;
      this.blinkIn = 1.6 + Math.random() * 4;
    }
    let lid = 1;
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      lid = 0.12 + 0.88 * Math.abs(this.blinkT / 0.13 - 0.5) * 2;
    }
    const wide = 1 + this.worry * 0.22;
    this.eyes.scale.set(wide, lid * wide, wide);

    // Idle eye movement
    this.saccadeIn -= dt;
    if (this.saccadeIn <= 0) {
      this.lookTX = (Math.random() * 2 - 1) * 0.7;
      this.lookTY = (Math.random() * 2 - 1) * 0.35;
      this.saccadeIn = 0.8 + Math.random() * 2.2;
    }
    const k = 1 - Math.exp(-14 * dt);
    this.lookX += (this.lookTX - this.lookX) * k;
    this.lookY += (this.lookTY - this.lookY) * k;
    const jitter = this.worry > 0.5 ? Math.sin(time * 40 + this.phase) * 0.12 * this.worry : 0;
    for (const p of this.pivots) {
      p.rotation.set(-0.85 - this.lookY * 0.35, this.lookX * 0.55 + jitter, 0, 'YXZ');
      p.children[0].scale.setScalar(1 - this.worry * 0.3);
    }

    // Breathing while waiting, trembling when the holder is nearly full
    if (this.state === 'lane' || this.state === 'parked') {
      const breathe = Math.sin(time * 2.6 + this.phase) * 0.012;
      this.inner.position.y = breathe;
      this.inner.rotation.z = this.worry > 0.5 && this.state === 'parked' ? Math.sin(time * 38 + this.phase) * 0.018 * this.worry : 0;
    }
  }
}

export interface MatchGroup {
  cars: Car[];
  arrived: number;
  ready: Promise<void>;
  markReady: () => void;
}
