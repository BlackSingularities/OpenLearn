import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Prosty „konstruktor” cząsteczek: podajemy szkielet z atomów ciężkich (C, O, N…) i rzędy wiązań,
 * a geometria (kąty wg VSEPR) i brakujące atomy wodoru dopełniają się same.
 */

export type El = 'H' | 'C' | 'O' | 'N' | 'Cl' | 'S';
export interface MAtom {
  el: El;
  pos: THREE.Vector3;
}
export interface MBond {
  a: number;
  b: number;
  order: 1 | 2 | 3;
}
export interface Mol {
  atoms: MAtom[];
  bonds: MBond[];
}

const VALENCE: Record<El, number> = { H: 1, C: 4, O: 2, N: 3, Cl: 1, S: 2 };
/** Liczba obszarów orbitalnych (wiązania + wolne pary) przy hybrydyzacji sp3. */
const DOMAINS_SP3: Record<El, number> = { H: 1, C: 4, O: 4, N: 4, Cl: 4, S: 4 };

export const ELEMENT_COLOR: Record<El, string> = { H: '#e5e7eb', C: '#4b5563', O: '#ef4444', N: '#3b82f6', Cl: '#22c55e', S: '#facc15' };
export const ELEMENT_RADIUS: Record<El, number> = { H: 0.22, C: 0.34, O: 0.33, N: 0.33, Cl: 0.4, S: 0.42 };

function bondLength(a: El, b: El, order: number) {
  const pair = [a, b].sort().join('');
  if (pair.includes('H')) return pair === 'CH' ? 0.98 : 0.88;
  const base = pair === 'CC' ? 1.38 : pair.includes('Cl') ? 1.55 : 1.3;
  return base * (order === 1 ? 1 : order === 2 ? 0.87 : 0.78);
}

const TET = Math.acos(-1 / 3); // 109,47°

function perpendicular(a: THREE.Vector3) {
  const ref = Math.abs(a.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  return a.clone().cross(ref).normalize();
}

export class MolBuilder {
  atoms: MAtom[] = [];
  bonds: MBond[] = [];

  neighbors(i: number) {
    return this.bonds.filter((b) => b.a === i || b.b === i).map((b) => ({ j: b.a === i ? b.b : b.a, order: b.order }));
  }
  /** Liczba obszarów elektronowych atomu i na podstawie jego wiązań wielokrotnych. */
  domains(i: number) {
    const n = this.neighbors(i);
    const multi = n.reduce((s, x) => s + (x.order - 1), 0);
    return DOMAINS_SP3[this.atoms[i].el] - multi;
  }
  private dirs(i: number) {
    return this.neighbors(i).map(({ j }) => this.atoms[j].pos.clone().sub(this.atoms[i].pos).normalize());
  }
  private clearance(p: THREE.Vector3, skip: number) {
    let m = Infinity;
    this.atoms.forEach((a, k) => {
      if (k !== skip) m = Math.min(m, a.pos.distanceTo(p));
    });
    return m;
  }
  /** Wolne kierunki wiązań atomu i (wszystkie brakujące naraz). */
  freeDirections(i: number, count: number, D = this.domains(i)): THREE.Vector3[] {
    const ds = this.dirs(i);
    const at = this.atoms[i];
    if (ds.length === 0) {
      const t = [
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(1, -1, -1),
        new THREE.Vector3(-1, 1, -1),
        new THREE.Vector3(-1, -1, 1),
      ].map((v) => v.normalize());
      if (D === 3) return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.5, 0.866, 0), new THREE.Vector3(-0.5, -0.866, 0)].slice(0, count);
      if (D === 2) return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)].slice(0, count);
      return t.slice(0, count);
    }
    if (D === 2) return [ds[0].clone().negate()].slice(0, count);
    if (D === 3) {
      if (ds.length >= 2) return [ds[0].clone().add(ds[1]).negate().normalize()].slice(0, count);
      const a = ds[0];
      // płaszczyzna wiązania podwójnego: bierzemy ją od sąsiada, jeśli ma innych sąsiadów
      const [{ j }] = this.neighbors(i);
      const other = this.neighbors(j).find((x) => x.j !== i);
      let u = other ? this.atoms[other.j].pos.clone().sub(this.atoms[j].pos) : perpendicular(a);
      u = u.sub(a.clone().multiplyScalar(u.dot(a))).normalize();
      if (u.lengthSq() < 1e-6) u = perpendicular(a);
      const c = Math.cos((120 * Math.PI) / 180);
      const s = Math.sin((120 * Math.PI) / 180);
      return [a.clone().multiplyScalar(c).addScaledVector(u, s), a.clone().multiplyScalar(c).addScaledVector(u, -s)].slice(0, count);
    }
    // D === 4 (sp3)
    if (ds.length >= 3) return [ds[0].clone().add(ds[1]).add(ds[2]).negate().normalize()].slice(0, count);
    if (ds.length === 2) {
      const m = ds[0].clone().add(ds[1]).negate().normalize();
      const n = ds[0].clone().cross(ds[1]).normalize();
      const half = TET / 2;
      const cands = [m.clone().multiplyScalar(Math.cos(half)).addScaledVector(n, Math.sin(half)), m.clone().multiplyScalar(Math.cos(half)).addScaledVector(n, -Math.sin(half))];
      cands.sort((p, q) => this.clearance(at.pos.clone().add(q), i) - this.clearance(at.pos.clone().add(p), i));
      return cands.slice(0, count);
    }
    // jeden sąsiad: trzy kierunki na stożku – obracamy tak, by były jak najdalej od innych atomów
    const a = ds[0];
    const u0 = perpendicular(a);
    const w0 = a.clone().cross(u0).normalize();
    let best: THREE.Vector3[] = [];
    let bestScore = -Infinity;
    for (let k = 0; k < 24; k++) {
      const phi = (k / 24) * Math.PI * 2;
      const set = [0, 1, 2].map((m) => {
        const ang = phi + (m * 2 * Math.PI) / 3;
        return a
          .clone()
          .multiplyScalar(Math.cos(TET))
          .addScaledVector(u0, Math.sin(TET) * Math.cos(ang))
          .addScaledVector(w0, Math.sin(TET) * Math.sin(ang));
      });
      const score = Math.min(...set.map((d) => this.clearance(at.pos.clone().addScaledVector(d, 1.3), i)));
      if (score > bestScore + 1e-6) {
        bestScore = score;
        best = set;
      }
    }
    const sorted = [...best].sort((p, q) => this.clearance(at.pos.clone().addScaledVector(q, 1.3), i) - this.clearance(at.pos.clone().addScaledVector(p, 1.3), i));
    return sorted.slice(0, count);
  }

  /** Dodaje atom; parent – indeks atomu, do którego się przyłącza, order – rząd wiązania. */
  add(el: El, parent?: number, order: 1 | 2 | 3 = 1): number {
    const idx = this.atoms.length;
    if (parent === undefined) {
      this.atoms.push({ el, pos: new THREE.Vector3() });
      return idx;
    }
    // rząd nowego wiązania zmienia geometrię rodzica (np. wiązanie podwójne → sp2)
    const multi = this.neighbors(parent).reduce((sum, x) => sum + (x.order - 1), 0);
    const D = DOMAINS_SP3[this.atoms[parent].el] - multi - (order - 1);
    const dir = this.freeDirections(parent, 1, D)[0] ?? new THREE.Vector3(1, 0, 0);
    const pos = this.atoms[parent].pos.clone().addScaledVector(dir, bondLength(this.atoms[parent].el, el, order));
    this.atoms.push({ el, pos });
    this.bonds.push({ a: parent, b: idx, order });
    return idx;
  }

  /** Dopełnia wszystkie wartościowości atomami wodoru. */
  fillH(): Mol {
    const heavy = this.atoms.length;
    for (let i = 0; i < heavy; i++) {
      const used = this.neighbors(i).reduce((s, x) => s + x.order, 0);
      const need = VALENCE[this.atoms[i].el] - used;
      if (need <= 0) continue;
      const dirs = this.freeDirections(i, need);
      for (const d of dirs) {
        const k = this.atoms.length;
        this.atoms.push({ el: 'H', pos: this.atoms[i].pos.clone().addScaledVector(d, bondLength(this.atoms[i].el, 'H', 1)) });
        this.bonds.push({ a: i, b: k, order: 1 });
      }
    }
    // wyśrodkowanie
    const c = this.atoms.reduce((acc, a) => acc.add(a.pos), new THREE.Vector3()).multiplyScalar(1 / this.atoms.length);
    this.atoms.forEach((a) => a.pos.sub(c));
    return { atoms: this.atoms, bonds: this.bonds };
  }
}

/** Wzór sumaryczny, np. C₂H₆O. */
export function formula(m: Mol) {
  const count: Record<string, number> = {};
  m.atoms.forEach((a) => (count[a.el] = (count[a.el] ?? 0) + 1));
  const order = ['C', 'H', ...Object.keys(count).filter((k) => k !== 'C' && k !== 'H').sort()];
  const sub = (n: number) => (n === 1 ? '' : String(n).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]));
  return order
    .filter((k) => count[k])
    .map((k) => `${k}${sub(count[k])}`)
    .join('');
}

function BondMesh({ a, b, order, offsetDir }: { a: THREE.Vector3; b: THREE.Vector3; order: number; offsetDir: THREE.Vector3 }) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const offs = order === 1 ? [0] : order === 2 ? [-0.5, 0.5] : [-1, 0, 1];
  const r = order === 1 ? 0.075 : 0.05;
  return (
    <>
      {offs.map((o, k) => (
        <mesh key={k} position={mid.clone().addScaledVector(offsetDir, o * 0.13)} quaternion={quat}>
          <cylinderGeometry args={[r, r, len, 12]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.4} />
        </mesh>
      ))}
    </>
  );
}

/** Model kulkowo-pręcikowy (albo czaszowy) cząsteczki zbudowanej przez MolBuilder. */
export function MoleculeModel({ mol, labels = true, spacefill = false, highlight }: { mol: Mol; labels?: boolean; spacefill?: boolean; highlight?: number[] }) {
  const offsets = useMemo(
    () =>
      mol.bonds.map((bd) => {
        const a = mol.atoms[bd.a].pos;
        const b = mol.atoms[bd.b].pos;
        const axis = b.clone().sub(a).normalize();
        const other = mol.bonds.find((x) => x !== bd && (x.a === bd.a || x.b === bd.a || x.a === bd.b || x.b === bd.b));
        let ref = other ? mol.atoms[other.a === bd.a || other.a === bd.b ? other.b : other.a].pos.clone().sub(a) : perpendicular(axis);
        ref = ref.sub(axis.clone().multiplyScalar(ref.dot(axis)));
        if (ref.lengthSq() < 1e-6) ref = perpendicular(axis);
        return ref.normalize();
      }),
    [mol],
  );
  return (
    <group>
      {!spacefill && mol.bonds.map((bd, i) => <BondMesh key={i} a={mol.atoms[bd.a].pos} b={mol.atoms[bd.b].pos} order={bd.order} offsetDir={offsets[i]} />)}
      {mol.atoms.map((a, i) => {
        const hl = highlight?.includes(i);
        return (
          <mesh key={i} position={a.pos}>
            <sphereGeometry args={[ELEMENT_RADIUS[a.el] * (spacefill ? 2.6 : 1) * (hl ? 1.15 : 1), 28, 28]} />
            <meshStandardMaterial color={ELEMENT_COLOR[a.el]} roughness={0.35} emissive={hl ? '#ffd166' : '#000000'} emissiveIntensity={hl ? 0.45 : 0} />
            {labels && a.el !== 'H' && !spacefill && (
              <Html center zIndexRange={[10, 0]}>
                <div className={`atom-symbol ${a.el === 'C' ? '' : 'dark'}`}>{a.el}</div>
              </Html>
            )}
          </mesh>
        );
      })}
    </group>
  );
}
