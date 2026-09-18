// The flatbed that carries a matched set away. Built facing +x, the direction it drives.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const BED_Y = 0.62;
/** Where the three cars sit, relative to the truck origin (bed centre). */
export const BED_SLOTS = [-1.12, 0, 1.12];

export class Truck {
  readonly group = new THREE.Group();
  /** Child group so the chassis can dip and rock without moving the truck. */
  readonly chassis = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private mats: THREE.Material[];

  constructor() {
    const cabMat = new THREE.MeshStandardMaterial({ color: 0xff5a4f, roughness: 0.28, metalness: 0.05 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xfafbff, roughness: 0.35 });
    const beacon = new THREE.MeshStandardMaterial({ color: 0xffb300, emissive: 0xff9500, emissiveIntensity: 0.9, roughness: 0.3 });
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x4b556d, roughness: 0.7 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1d2b45, roughness: 0.08, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x252a36, roughness: 0.75 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xe9edf5, roughness: 0.35, metalness: 0.3 });
    const light = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.6 });

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.chassis) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // Bed: deck, side rails, painted bay dividers
    add(new RoundedBoxGeometry(3.6, 0.2, 1.86, 2, 0.06), bedMat, 0, BED_Y - 0.1, 0);
    add(new RoundedBoxGeometry(3.6, 0.12, 0.1, 2, 0.04), railMat, 0, BED_Y + 0.05, 0.9);
    add(new RoundedBoxGeometry(3.6, 0.12, 0.1, 2, 0.04), railMat, 0, BED_Y + 0.05, -0.9);
    for (const x of [-0.56, 0.56]) add(new THREE.BoxGeometry(0.05, 0.012, 1.6), trim, x, BED_Y + 0.006, 0).castShadow = false;
    add(new RoundedBoxGeometry(3.7, 0.22, 1.3, 2, 0.06), dark, -0.05, 0.36, 0);

    // Cab
    add(new RoundedBoxGeometry(1.35, 1.2, 1.8, 4, 0.22), cabMat, 2.5, 0.95, 0);
    add(new RoundedBoxGeometry(1.37, 0.22, 1.82, 3, 0.08), accent, 2.5, 0.52, 0);
    add(new RoundedBoxGeometry(0.06, 0.46, 1.4, 2, 0.03), glass, 3.16, 1.15, 0);
    add(new RoundedBoxGeometry(0.86, 0.5, 0.06, 2, 0.03), glass, 2.55, 1.2, 0.89);
    add(new RoundedBoxGeometry(0.86, 0.5, 0.06, 2, 0.03), glass, 2.55, 1.2, -0.89);
    // White roof panel, sun visor and a beacon so the cab reads clearly from above
    add(new RoundedBoxGeometry(1.1, 0.08, 1.5, 2, 0.04), accent, 2.45, 1.56, 0);
    add(new RoundedBoxGeometry(0.2, 0.06, 1.5, 2, 0.03), glass, 3.12, 1.5, 0);
    add(new RoundedBoxGeometry(0.22, 0.14, 0.6, 2, 0.06), beacon, 2.45, 1.66, 0).castShadow = false;
    add(new RoundedBoxGeometry(0.14, 0.16, 1.7, 2, 0.05), trim, 3.17, 0.34, 0);
    for (const z of [-0.6, 0.6]) add(new THREE.SphereGeometry(0.11, 12, 8), light, 3.17, 0.62, z).castShadow = false;
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), trim, 1.95, 1.75, -0.7);

    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.24, 16).rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.26, 10).rotateX(Math.PI / 2);
    for (const x of [2.45, -0.55, -1.35]) {
      for (const z of [-0.82, 0.82]) {
        const w = add(wheelGeo, dark, x, 0.3, z, this.group);
        add(hubGeo, trim, 0, 0, 0, w).castShadow = false;
        this.wheels.push(w);
      }
    }
    this.group.add(this.chassis);
    this.mats = [cabMat, accent, bedMat, railMat, glass, dark, trim, light, beacon];
  }

  /** Call with the distance moved this frame so the wheels actually turn. */
  roll(dx: number): void {
    for (const w of this.wheels) w.rotation.z -= dx / 0.3;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.mats.forEach((m) => m.dispose());
  }
}
