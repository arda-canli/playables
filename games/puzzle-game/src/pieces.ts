// Every piece on the table, drawn as instanced meshes that copy their physics bodies each frame.
// Jars, lids, columns, planks, trims and gold blocks: six draw calls however big the level gets.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALF, JAR_COLORS, type Kind, type V3 } from './level';
import type { Piece } from './sim';
import { canvasTexture, crown, placed, PURPLE } from './world';

const JH = HALF.jar[1];

function jarGeometry(): { body: THREE.BufferGeometry; lid: THREE.BufferGeometry } {
  // A squat jam jar: rounded shoulders and a short neck. The lid sits on the neck.
  const pts = [
    [0, -JH], [0.2, -JH], [0.25, -JH + 0.03], [0.27, -JH + 0.1], [0.275, 0.02], [0.265, 0.1], [0.23, 0.15], [0.205, 0.17], [0.205, JH - 0.08], [0, JH - 0.08],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry(pts, 28);
  const lid = new THREE.CylinderGeometry(0.235, 0.235, 0.1, 28);
  lid.translate(0, JH - 0.05, 0);
  return { body, lid };
}

function columnGeometry(): THREE.BufferGeometry {
  const h = HALF.column[1];
  const shaft = new THREE.CylinderGeometry(0.15, 0.17, h * 2 - 0.2, 14);
  const cap = new RoundedBoxGeometry(0.36, 0.1, 0.36, 2, 0.03);
  return mergeGeometries([shaft.toNonIndexed(), placed(cap, 0, -h + 0.05, 0), placed(cap, 0, h - 0.05, 0)], false)!;
}

/** Instance index of every piece within its kind's mesh. */
interface Slot {
  meshes: THREE.InstancedMesh[];
  index: number;
}

export class Pieces {
  readonly group = new THREE.Group();
  private slots = new Map<number, Slot>();
  private meshes: THREE.InstancedMesh[] = [];
  /** Per-piece extra scale for squash, pops and the "these are left" pulse. */
  private pop = new Map<number, { t: number; dying: boolean }>();
  private highlight = new Set<number>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private col = new THREE.Color();
  readonly mats: { jar: THREE.MeshStandardMaterial; gold: THREE.MeshStandardMaterial; lid: THREE.MeshStandardMaterial };
  readonly geos: { jar: THREE.BufferGeometry; lid: THREE.BufferGeometry; gold: THREE.BufferGeometry };

  constructor(private pieces: Piece[]) {
    const jar = jarGeometry();
    const lidTex = canvasTexture(128, 16, (g) => {
      // Candy stripes, diagonal, like a sweet-shop lid.
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 128, 16);
      g.fillStyle = '#ff2f4a';
      for (let x = -16; x < 140; x += 16) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 8, 0);
        g.lineTo(x + 16, 16);
        g.lineTo(x + 8, 16);
        g.fill();
      }
    });
    const goldTex = canvasTexture(128, 128, (g) => {
      const r = g.createLinearGradient(0, 0, 128, 128);
      r.addColorStop(0, '#ffe27a');
      r.addColorStop(1, '#f2a91a');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(160, 90, 0, 0.55)';
      g.lineWidth = 6;
      g.strokeRect(10, 10, 108, 108);
      crown(g, 64, 66, 62, '#e8960c', '#ffe9a0');
    });
    this.mats = {
      jar: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.05 }),
      lid: new THREE.MeshStandardMaterial({ map: lidTex, roughness: 0.3 }),
      gold: new THREE.MeshStandardMaterial({ map: goldTex, roughness: 0.3, metalness: 0.6 }),
    };
    this.geos = { jar: jar.body, lid: jar.lid, gold: new RoundedBoxGeometry(HALF.gold[0] * 2, HALF.gold[1] * 2, HALF.gold[2] * 2, 2, 0.05) };
    const ph = HALF.plank;
    const plank = new RoundedBoxGeometry(ph[0] * 2, ph[1] * 2, ph[2] * 2, 2, 0.05);
    const trim = mergeGeometries(
      [-1, 1].map((side) => placed(new RoundedBoxGeometry(ph[0] * 2 + 0.04, 0.07, 0.07, 1, 0.02), 0, -ph[1] + 0.035, side * (ph[2] - 0.02))),
      false,
    )!;

    const count = (k: Kind) => pieces.filter((p) => p.kind === k).length;
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      im.castShadow = im.receiveShadow = true;
      im.frustumCulled = false;
      this.meshes.push(im);
      this.group.add(im);
      return im;
    };
    const byKind: Record<Kind, THREE.InstancedMesh[]> = {
      jar: [make(jar.body, this.mats.jar, count('jar')), make(jar.lid, this.mats.lid, count('jar'))],
      column: [make(columnGeometry(), new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.45 }), count('column'))],
      plank: [make(plank, new THREE.MeshStandardMaterial({ color: PURPLE, roughness: 0.35 }), count('plank')), make(trim, new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: 0.3, metalness: 0.7 }), count('plank'))],
      gold: [make(this.geos.gold, this.mats.gold, count('gold'))],
    };
    const next: Record<Kind, number> = { jar: 0, column: 0, plank: 0, gold: 0 };
    for (const p of pieces) {
      const slot = { meshes: byKind[p.kind], index: next[p.kind]++ };
      this.slots.set(p.id, slot);
      if (p.color) slot.meshes[0].setColorAt(slot.index, this.col.setHex(JAR_COLORS[p.color]));
    }
    for (const im of this.meshes) if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.sync(0);
  }

  /** A quick swell before the jar disappears, so the burst reads as the jar's own. */
  burst(p: Piece): void {
    this.pop.set(p.id, { t: 0, dying: true });
    this.highlight.delete(p.id);
  }

  /** Spotlights what is left at the near miss. */
  markLeft(ids: number[]): void {
    this.highlight = new Set(ids);
  }

  sync(dt: number, time = 0): void {
    for (const piece of this.pieces) {
      const slot = this.slots.get(piece.id)!;
      const pop = this.pop.get(piece.id);
      let k = 1;
      if (pop) {
        pop.t += dt;
        if (pop.dying) k = pop.t < 0.07 ? 1 + pop.t * 3.5 : 0;
      } else if (!piece.alive) k = 0;
      if (this.highlight.has(piece.id)) k *= 1 + 0.09 * Math.max(0, Math.sin(time * 9));
      const b = piece.body;
      this.p.set(b.position.x, b.position.y, b.position.z);
      this.q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      this.s.setScalar(k);
      this.m.compose(this.p, this.q, this.s);
      for (const im of slot.meshes) im.setMatrixAt(slot.index, this.m);
    }
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }

  /** Screen-side helper: the world position of a piece. */
  where(p: Piece, out: THREE.Vector3): THREE.Vector3 {
    return out.set(p.body.position.x, p.body.position.y, p.body.position.z);
  }
}

/**
 * Level 2, shown only as a teaser: a wall of gold blocks with a heart of jam jars set into it.
 * It never gets physics; it only has to drop in and look formidable.
 */
export class Teaser {
  readonly group = new THREE.Group();
  private cells: { gold: boolean; x: number; y: number; delay: number }[] = [];
  private jars: THREE.InstancedMesh;
  private lids: THREE.InstancedMesh;
  private golds: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  t = -1;

  constructor(pieces: Pieces, at: V3) {
    const heart = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'];
    const size = HALF.gold[0] * 2 + 0.02;
    heart.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const y = (heart.length - 1 - r) * size + size / 2;
        this.cells.push({ gold: ch === '.', x: (c - (row.length - 1) / 2) * size, y, delay: (heart.length - 1 - r) * 0.07 + Math.abs(c - 4) * 0.025 });
      });
    });
    const nGold = this.cells.filter((c) => c.gold).length;
    const nJar = this.cells.length - nGold;
    this.golds = new THREE.InstancedMesh(pieces.geos.gold, pieces.mats.gold, nGold);
    this.jars = new THREE.InstancedMesh(pieces.geos.jar, pieces.mats.jar, nJar);
    this.lids = new THREE.InstancedMesh(pieces.geos.lid, pieces.mats.lid, nJar);
    const red = new THREE.Color(JAR_COLORS.red);
    for (let i = 0; i < nJar; i++) this.jars.setColorAt(i, red);
    for (const im of [this.golds, this.jars, this.lids]) {
      im.castShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.group.position.set(at[0], at[1], at[2]);
    this.group.visible = false;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.group.visible = true;
    this.t += dt;
    let g = 0;
    let j = 0;
    for (const c of this.cells) {
      // Each block falls from the sky with a small bounce, bottom rows first.
      const k = Math.min(1, Math.max(0, (this.t - c.delay) / 0.45));
      const drop = k < 1 ? (1 - k) * (1 - k) * 9 - Math.sin(k * Math.PI) * 0.12 : 0;
      this.v.set(c.x, c.y + drop, 0);
      this.s.setScalar(k > 0 ? 1 : 0);
      this.m.compose(this.v, this.q, this.s);
      if (c.gold) this.golds.setMatrixAt(g++, this.m);
      else {
        this.jars.setMatrixAt(j, this.m);
        this.lids.setMatrixAt(j++, this.m);
      }
    }
    this.golds.instanceMatrix.needsUpdate = this.jars.instanceMatrix.needsUpdate = this.lids.instanceMatrix.needsUpdate = true;
  }

  get done(): boolean {
    return this.t > 1.6;
  }
}
