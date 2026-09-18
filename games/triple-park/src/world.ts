// Scenery, lighting, the painted holder bays, and the giant "level 2" lot revealed at the end.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CAPACITY, CAR_COLORS, HOLDER, HOLDER_Z, LANE_X, LOT, ROAD, ROW_STEP, SLOT_STEP, slotX } from './layout';
import { ease, tween } from '@kit/tween';

const SKY = 0xa6e3ff;

export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  /** Colour of the painted holder outline. The game pushes it towards red under tension. */
  readonly holderLine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  readonly holderFill = new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: 0.95 });
  private backdrop = new THREE.Group();
  private bigLot = new THREE.Group();
  private bigBodies!: THREE.InstancedMesh;
  private bigCabins!: THREE.InstancedMesh;
  private bigRows: { z: number; idx: number[] }[] = [];
  private bigPos: THREE.Vector3[] = [];

  constructor(renderer: THREE.WebGLRenderer, lowPower: boolean) {
    const scene = this.scene;
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 70, 170);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.4;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8fcf7c, 1.05));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.1);
    sun.position.set(-7, 14, 8);
    sun.castShadow = true;
    const size = lowPower ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3.5;
    this.sun = sun;
    this.setShadowBounds(11, 11);
    scene.add(sun, sun.target);

    this.buildGround();
    this.buildLot();
    this.buildHolder();
    this.buildBackdrop();
    this.buildBigLot();
  }

  private setShadowBounds(halfX: number, halfZ: number, cz = 0): void {
    const cam = this.sun.shadow.camera;
    cam.left = -halfX;
    cam.right = halfX;
    cam.top = halfZ;
    cam.bottom = -halfZ;
    cam.near = 1;
    cam.far = 80;
    cam.updateProjectionMatrix();
    this.sun.target.position.set(0, 0, cz);
    this.sun.position.set(-7, 14, 8 + cz);
  }

  private flat(w: number, d: number, color: number, x: number, y: number, z: number, rough = 0.95): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: rough }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  private buildGround(): void {
    // Mown-lawn stripes: one tiny canvas texture, repeated.
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 4;
    const g = c.getContext('2d')!;
    g.fillStyle = '#7fd163';
    g.fillRect(0, 0, 64, 4);
    g.fillStyle = '#74c95a';
    g.fillRect(0, 0, 32, 4);
    const lawn = new THREE.CanvasTexture(c);
    lawn.colorSpace = THREE.SRGBColorSpace;
    lawn.wrapS = lawn.wrapT = THREE.RepeatWrapping;
    lawn.repeat.set(110, 1);
    lawn.anisotropy = 8;
    const grass = this.flat(600, 600, 0xffffff, 0, 0, 0);
    (grass.material as THREE.MeshStandardMaterial).map = lawn;
    grass.rotation.z = 0.5;
    // Road with the holder on it, then a pavement and a dashed centre line for the truck lane.
    const roadZ = (ROAD.z0 + ROAD.z1) / 2;
    this.flat(600, ROAD.z1 - ROAD.z0, 0x4a5370, 0, 0.01, roadZ);
    this.flat(600, 0.9, 0xece6d8, 0, 0.012, ROAD.z1 + 0.45);
    this.flat(600, 0.14, 0xd9d2c0, 0, 0.014, ROAD.z1 + 0.07);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    const dash = new THREE.PlaneGeometry(0.9, 0.09);
    for (let x = -40; x <= 40; x += 2.1) {
      const d = new THREE.Mesh(dash, dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.016, 4.95);
      this.scene.add(d);
    }
  }

  private buildLot(): void {
    const w = LOT.x1 - LOT.x0;
    const d = LOT.z1 - LOT.z0;
    const cz = (LOT.z0 + LOT.z1) / 2;
    this.flat(w, d, 0x5a6690, 0, 0.015, cz);

    // Lane lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    const half = (LANE_X[1] - LANE_X[0]) / 2;
    for (let i = 0; i <= LANE_X.length; i++) {
      const x = i === LANE_X.length ? LANE_X[i - 1] + half : LANE_X[i] - half;
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.07, d - 0.5), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, 0.02, cz + 0.1);
      this.scene.add(l);
    }

    // Kerb on three sides
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.8 });
    const kerb = (kw: number, kd: number, x: number, z: number) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(kw, 0.22, kd, 2, 0.08), kerbMat);
      m.position.set(x, 0.11, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    kerb(0.3, d + 0.3, LOT.x0 - 0.15, cz);
    kerb(0.3, d + 0.3, LOT.x1 + 0.15, cz);
    kerb(w + 0.6, 0.3, 0, LOT.z0 - 0.15);

    // Cones fill the two short lanes so the lot reads as full
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    for (const lane of [1, 3]) {
      for (const dx of [-0.26, 0.26]) {
        const g = new THREE.Group();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 14), coneMat);
        cone.position.y = 0.29;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.135, 0.1, 14), baseMat);
        band.position.y = 0.24;
        const base = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.06, 0.4, 2, 0.03), coneMat);
        base.position.y = 0.03;
        g.add(cone, band, base);
        g.traverse((o) => (o.castShadow = true));
        g.position.set(LANE_X[lane] + dx, 0.015, -2 * ROW_STEP + (dx > 0 ? 0.18 : -0.12));
        this.scene.add(g);
      }
    }
  }

  private buildHolder(): void {
    const w = HOLDER.x1 - HOLDER.x0;
    const d = HOLDER.z1 - HOLDER.z0;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.holderFill);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(0, 0.018, HOLDER_Z);
    fill.receiveShadow = true;
    this.scene.add(fill);

    const t = 0.085;
    const bar = (bw: number, bd: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), this.holderLine);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.024, z);
      this.scene.add(m);
    };
    bar(w + t, t, 0, HOLDER.z0);
    bar(w + t, t, 0, HOLDER.z1);
    bar(t, d, HOLDER.x0, HOLDER_Z);
    bar(t, d, HOLDER.x1, HOLDER_Z);
    for (let i = 1; i < CAPACITY; i++) bar(t * 0.7, d * 0.62, slotX(i) - SLOT_STEP / 2, HOLDER_Z + d * 0.19);
  }

  private tree(x: number, z: number, s: number, parent: THREE.Object3D): void {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.3, 8), TRUNK);
    trunk.position.y = 0.65;
    g.add(trunk);
    const blobs: [number, number, number, number][] = [
      [0, 1.75, 0, 0.95],
      [0.55, 1.45, 0.15, 0.62],
      [-0.5, 1.5, -0.1, 0.66],
      [0.05, 2.3, -0.05, 0.6],
    ];
    blobs.forEach(([bx, by, bz, r], i) => {
      const b = new THREE.Mesh(LEAF_GEO, i % 2 ? LEAF_B : LEAF_A);
      b.position.set(bx, by, bz);
      b.scale.setScalar(r);
      g.add(b);
    });
    g.traverse((o) => (o.castShadow = true));
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    g.rotation.y = x * 1.7 + z;
    parent.add(g);
  }

  private bush(x: number, z: number, s: number, parent: THREE.Object3D): void {
    const b = new THREE.Mesh(LEAF_GEO, LEAF_A);
    b.position.set(x, 0.28 * s, z);
    b.scale.set(0.7 * s, 0.5 * s, 0.6 * s);
    b.castShadow = true;
    parent.add(b);
  }

  private buildBackdrop(): void {
    const bd = this.backdrop;
    // Hedge along the back of the lot
    const hedge = new THREE.Mesh(new RoundedBoxGeometry(LOT.x1 - LOT.x0 + 0.7, 0.95, 0.85, 3, 0.3), LEAF_B);
    hedge.position.set(0, 0.47, LOT.z0 - 0.85);
    hedge.castShadow = true;
    hedge.receiveShadow = true;
    bd.add(hedge);
    for (let i = 0; i < 9; i++) this.bush(LOT.x0 + 0.3 + i * 0.85, LOT.z0 - 0.75 + (i % 2) * 0.2, 1.1 + (i % 3) * 0.18, bd);

    // Parking sign
    const sign = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.1, 8), new THREE.MeshStandardMaterial({ color: 0xdfe4ee, roughness: 0.4, metalness: 0.4 }));
    pole.position.y = 1.05;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2a7bff';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffffff';
    g.font = '600 104px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('P', 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const blue = new THREE.MeshStandardMaterial({ color: 0x2a7bff, roughness: 0.5 });
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    const plate = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.95, 0.1, 2, 0.05), [blue, blue, blue, blue, face, blue]);
    plate.position.y = 2.25;
    plate.rotation.x = -0.35;
    sign.add(pole, plate);
    sign.traverse((o) => (o.castShadow = true));
    sign.position.set(LOT.x0 - 0.75, 0, LOT.z0 - 0.2);
    bd.add(sign);

    const trees: [number, number, number][] = [
      [-2.6, -7.6, 1.15], [0.4, -8.3, 1.35], [3.1, -7.4, 1.05], [-5.6, -6.2, 1.2], [5.9, -6.6, 1.25], [-1.2, -10.6, 1.3], [2.2, -11.2, 1.2],
      [-4.3, -9.8, 1.1], [4.9, -10.1, 1.3], [-7.4, -9.2, 1.3], [7.8, -9.0, 1.15],
    ];
    trees.forEach(([x, z, s]) => this.tree(x, z, s, bd));
    this.scene.add(bd);

    // Side scenery that stays for the whole ad (it frames the view in landscape)
    const side = new THREE.Group();
    const sideTrees: [number, number, number][] = [
      [-6.3, -2.4, 1.2], [6.5, -1.6, 1.3], [-8.6, -4.5, 1.1], [8.9, -4.2, 1.2], [-6.0, 9.6, 1.1], [6.4, 9.9, 1.25], [-11, 1, 1.3], [11.3, 0.4, 1.2],
      [-12.5, 10.5, 1.2], [12.2, 10.2, 1.1], [-1.5, 10.4, 1.0], [2.4, 11, 1.15], [-15, -5, 1.3], [15, -6, 1.3], [-9.5, 12.5, 1.2], [9, 13, 1.3],
    ];
    sideTrees.forEach(([x, z, s]) => this.tree(x, z, s, side));
    const bushes: [number, number, number][] = [
      [-4.6, -3.6, 1.2], [-4.9, -0.9, 0.9], [4.7, -2.8, 1.1], [4.9, 0.1, 0.85], [-4.4, 9.0, 1], [-2.2, 9.3, 0.8], [3.5, 9.1, 1.1], [5.2, 9.5, 0.9], [0.6, 9.4, 0.9],
    ];
    bushes.forEach(([x, z, s]) => this.bush(x, z, s, side));
    const petals = [0xffffff, 0xffd84d, 0xff8fc7];
    const petalMats = petals.map((color) => new THREE.MeshBasicMaterial({ color }));
    for (let i = 0; i < 46; i++) {
      const f = new THREE.Mesh(FLOWER_GEO, petalMats[i % 3]);
      const left = i % 2 === 0;
      const front = i % 5 === 0;
      const rx = ((i * 7919) % 100) / 100;
      const rz = ((i * 104729) % 100) / 100;
      f.position.set(front ? -7 + rx * 14 : (left ? -1 : 1) * (4.4 + rx * 5.5), 0.06, front ? 8.7 + rz * 3 : -5 + rz * 5.6);
      side.add(f);
    }
    this.scene.add(side);
  }

  /** A field of cars stretching to the horizon. Hidden until the player wins. */
  private buildBigLot(): void {
    const lanes = 13;
    const rows = 26;
    const step = LANE_X[1] - LANE_X[0];
    const z0 = LOT.z0 - 1.6;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(lanes * step + 1, rows * ROW_STEP + 1.5), new THREE.MeshStandardMaterial({ color: 0x5a6690, roughness: 0.95 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.013, z0 - (rows * ROW_STEP) / 2 + 0.4);
    pad.receiveShadow = true;
    this.bigLot.add(pad);

    const count = lanes * rows;
    const body = new RoundedBoxGeometry(0.98, 0.5, 1.52, 2, 0.17).translate(0, 0.4, 0);
    const cabin = new RoundedBoxGeometry(0.84, 0.42, 0.86, 2, 0.17).translate(0, 0.8, -0.12);
    this.bigBodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 }), count);
    this.bigCabins = new THREE.InstancedMesh(cabin, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 }), count);
    this.bigBodies.castShadow = true;
    const palette = [CAR_COLORS.red, CAR_COLORS.yellow, CAR_COLORS.green, CAR_COLORS.blue, CAR_COLORS.purple, CAR_COLORS.orange];
    const col = new THREE.Color();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      const row = { z: z0 - r * ROW_STEP, idx: [] as number[] };
      for (let l = 0; l < lanes; l++) {
        // Runs of three same-coloured cars down each lane, so the field reads as "more of this game"
        col.setHex(palette[(l * 5 + Math.floor((r + l) / 3) * 2) % palette.length]);
        this.bigBodies.setColorAt(i, col);
        this.bigCabins.setColorAt(i, col);
        this.bigBodies.setMatrixAt(i, zero);
        this.bigCabins.setMatrixAt(i, zero);
        this.bigPos.push(new THREE.Vector3((l - (lanes - 1) / 2) * step, 0, row.z));
        row.idx.push(i++);
      }
      this.bigRows.push(row);
    }
    this.bigBodies.frustumCulled = false;
    this.bigCabins.frustumCulled = false;
    this.bigLot.add(this.bigBodies, this.bigCabins);
    this.bigLot.visible = false;
    this.scene.add(this.bigLot);
  }

  /** The hedge drops away and a far bigger lot rolls out behind it, row by row. */
  async revealBigLot(): Promise<void> {
    this.bigLot.visible = true;
    this.setShadowBounds(16, 30, -16);
    this.sun.shadow.radius = 5;
    void tween({ dur: 0.45, ease: ease.inBack, update: (v) => this.backdrop.scale.set(1, Math.max(0.001, 1 - v), 1) }).then(() => (this.backdrop.visible = false));

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const total = 1.5;
    await tween({
      dur: total + 0.35,
      ease: ease.linear,
      update: (_v, t) => {
        const now = t * (total + 0.35);
        this.bigRows.forEach((row, r) => {
          const local = (now - (r / this.bigRows.length) * total) / 0.35;
          if (local <= 0 || local > 1.2) return;
          const k = ease.outBack(Math.min(1, local));
          for (const i of row.idx) {
            s.set(k, k, k);
            m.compose(this.bigPos[i], q, s);
            this.bigBodies.setMatrixAt(i, m);
            this.bigCabins.setMatrixAt(i, m);
          }
        });
        this.bigBodies.instanceMatrix.needsUpdate = true;
        this.bigCabins.instanceMatrix.needsUpdate = true;
      },
    });
  }
}

const TRUNK = new THREE.MeshStandardMaterial({ color: 0x9b6a3c, roughness: 0.9 });
const LEAF_A = new THREE.MeshStandardMaterial({ color: 0x3fb950, roughness: 0.85 });
const LEAF_B = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.85 });
const LEAF_GEO = new THREE.IcosahedronGeometry(1, 2);
const FLOWER_GEO = new THREE.SphereGeometry(0.09, 8, 6);
