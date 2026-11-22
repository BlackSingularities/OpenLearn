/*
 * Elektrownia wiatrowa – modele pomocnicze zakładek: fundament w przekroju gruntu, fundamenty morskie,
 * stacja elektroenergetyczna z linią wysokiego napięcia, magazyn energii, płynąca energia,
 * powiększony profil łopaty z siłami, wycinek łopaty z warstwami, maszt pomiarowy, porcja powietrza.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { Arrow3D } from '../../lib/three';
import { DEG, FARM, HUB, R, SUBSTATION, T, chordAt, clamp, groundH, mix, rng, sectionPt, shear, twistAt, type V3 } from './windGeo';
import { MAT } from './windTurbine';
import { ROAD_MAIN } from './windWorld';

function Box({ p, s, m, r }: { p: V3; s: V3; m: THREE.Material; r?: V3 }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}
/** Pręt (walec) między dwoma punktami. */
export function Rod({ a, b, r, m }: { a: V3; b: V3; r: number; m: THREE.Material }) {
  const { mid, q, len } = useMemo(() => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    return { mid: A.clone().add(B).multiplyScalar(0.5), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), len: d.length() };
  }, [a[0], a[1], a[2], b[0], b[1], b[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <mesh position={mid} quaternion={q} material={m}>
      <cylinderGeometry args={[r, r, len, 8]} />
    </mesh>
  );
}

/** Wiele prętów w jednej siatce (kratownice). */
export function Rods({ list, r, m }: { list: [V3, V3][]; r: number; m: THREE.Material }) {
  const mesh = useMemo(() => {
    const g = new THREE.CylinderGeometry(r, r, 1, 6);
    const im = new THREE.InstancedMesh(g, m, list.length);
    const o = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    list.forEach(([a, b], i) => {
      const A = new THREE.Vector3(...a);
      const B = new THREE.Vector3(...b);
      const d = B.clone().sub(A);
      o.position.copy(A).add(B).multiplyScalar(0.5);
      o.quaternion.setFromUnitVectors(up, d.clone().normalize());
      o.scale.set(1, d.length(), 1);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [list, r, m]);
  return <primitive object={mesh} />;
}

/* ================= fundament ================= */

export const PIT_R = 24;
const PIT_D = 6.5;
/** Zarys przekroju fundamentu (r, y): płyta, stożek, cokół. */
const FOUND: [number, number][] = [
  [0, -3.2],
  [12, -3.2],
  [12, -2.0],
  [3.7, -0.85],
  [3.4, 0.35],
  [0, 0.35],
];

function soilTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const layers: [number, string][] = [
    [0, '#5b4632'],
    [0.07, '#8a6c48'],
    [0.32, '#b08f5f'],
    [0.55, '#9a8467'],
    [0.78, '#7d7466'],
    [1, '#7d7466'],
  ];
  for (let i = 0; i < layers.length - 1; i++) {
    g.fillStyle = layers[i][1];
    g.fillRect(0, layers[i][0] * 256, 512, (layers[i + 1][0] - layers[i][0]) * 256 + 1);
  }
  const r = rng(4);
  for (let i = 0; i < 1800; i++) {
    const y = r() * 256;
    g.fillStyle = `rgba(${r() < 0.5 ? '40,30,20' : '230,215,190'},${0.08 + r() * 0.12})`;
    const s = 1 + r() * (y > 160 ? 4 : 2);
    g.fillRect(r() * 512, y, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
let SOIL: THREE.Texture | null = null;

/**
 * Wykop w przekroju: połowa gruntu od strony widza zdjęta, widać fundament płytowy z betonu zbrojonego, kosz
 * kotwiący ze śrubami i warstwy gruntu. Powierzchnia wokół – drobna siatka przykrywająca otwór w terenie.
 */
export function FoundationPit() {
  const soil = useMemo(() => (SOIL ??= soilTexture()), []);
  const geo = useMemo(() => {
    // płaszczyzna przekroju gruntu (z = 0), z wyciętym miejscem na fundament (rysowany osobno)
    const face = new THREE.PlaneGeometry(PIT_R * 2, PIT_D, 1, 1);
    face.translate(0, -PIT_D / 2, 0);
    const wall = new THREE.CylinderGeometry(PIT_R, PIT_R, PIT_D, 48, 1, true, -Math.PI / 2, Math.PI);
    wall.translate(0, -PIT_D / 2, 0);
    const uv = wall.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 3);
    const floor = new THREE.CircleGeometry(PIT_R, 48, 0, Math.PI);
    floor.rotateX(Math.PI / 2);
    floor.translate(0, -PIT_D, 0);
    // fundament: bryła obrotowa (tylna połowa) i przekrój
    const pts = FOUND.map(([r, y]) => new THREE.Vector2(r, y));
    const solid = new THREE.LatheGeometry(pts, 64, Math.PI / 2, Math.PI);
    const sh = new THREE.Shape();
    const inner = FOUND.slice(1, -1);
    const prof: [number, number][] = [...inner, ...inner.slice().reverse().map(([r, y]) => [-r, y] as [number, number])];
    prof.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const cap = new THREE.ShapeGeometry(sh);
    cap.translate(0, 0, 0.03);
    // powierzchnia gruntu wokół: krąg z otworem od strony widza
    const ringG = new THREE.RingGeometry(PIT_R, 95, 64, 6);
    ringG.rotateX(-Math.PI / 2);
    const back = new THREE.CircleGeometry(PIT_R, 48, 0, Math.PI);
    back.rotateX(-Math.PI / 2);
    return { face, wall, floor, solid, cap, ringG, back };
  }, []);
  const ground = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7f9a55', roughness: 1 }), []);
  const soilM = useMemo(() => new THREE.MeshStandardMaterial({ map: soil, roughness: 1, side: THREE.DoubleSide }), [soil]);
  const soilBack = useMemo(() => new THREE.MeshStandardMaterial({ map: soil, roughness: 1, side: THREE.BackSide }), [soil]);
  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.95, side: THREE.DoubleSide }), []);
  // śruby kotwiące: dwa pierścienie wokół kołnierza wieży
  const bolts = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.035, 0.035, 3.6, 5);
    const n = 2 * 64;
    const im = new THREE.InstancedMesh(g, MAT.steel, n);
    const o = new THREE.Object3D();
    let k = 0;
    for (const rr of [2.0, 2.5])
      for (let i = 0; i < 64; i++) {
        const a = Math.PI / 2 + (Math.PI * (i + 0.5)) / 64;
        o.position.set(rr * Math.sin(a), -1.4, rr * Math.cos(a));
        o.updateMatrix();
        im.setMatrixAt(k++, o.matrix);
      }
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, []);
  // zbrojenie w przekroju: siatki przy spodzie i górze płyty, strzemiona
  const rebar = useMemo(() => {
    const lines: V3[][] = [];
    for (const y of [-3.05, -2.95]) lines.push([[-11.9, y, 0.06], [11.9, y, 0.06]]);
    for (const sg of [-1, 1]) {
      lines.push([[sg * 11.9, -2.12, 0.06], [sg * 3.75, -0.98, 0.06]]);
      lines.push([[sg * 11.9, -2.24, 0.06], [sg * 3.75, -1.1, 0.06]]);
    }
    for (let x = -11.5; x <= 11.6; x += 0.8) {
      const top = Math.abs(x) < 3.6 ? -0.9 : mix(-2.1, -0.95, clamp((12 - Math.abs(x)) / 8.3));
      lines.push([[x, -3.05, 0.06], [x, top, 0.06]]);
    }
    for (const sg of [-1, 1]) for (const x of [2.9, 3.2]) lines.push([[sg * x, -3.0, 0.06], [sg * x, 0.2, 0.06]]);
    return lines;
  }, []);
  return (
    <group>
      <mesh geometry={geo.ringG} material={ground} position={[0, 0.04, 0]} />
      <mesh geometry={geo.back} material={ground} position={[0, 0.04, 0]} />
      <mesh geometry={geo.face} material={soilM} />
      <mesh geometry={geo.wall} material={soilBack} />
      <mesh geometry={geo.floor} material={soilM} />
      <mesh geometry={geo.solid} material={concrete} />
      <mesh geometry={geo.cap}>
        <meshStandardMaterial color="#c9c6be" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* chudy beton pod płytą */}
      <Box p={[0, -3.3, -6]} s={[25, 0.2, 12]} m={MAT.concrete} />
      <primitive object={bolts} />
      {[2.0, 2.5].flatMap((x) => [x, -x]).map((x, i) => (
        <Box key={i} p={[x, -1.4, 0.07]} s={[0.07, 3.6, 0.02]} m={MAT.steel} />
      ))}
      <mesh position={[0, -3.1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.steelDark}>
        <torusGeometry args={[2.25, 0.12, 6, 48, Math.PI]} />
      </mesh>
      {rebar.map((l, i) => (
        <Line key={i} points={l} color="#8b4a2b" lineWidth={1.6} />
      ))}
    </group>
  );
}

/* ================= fundamenty morskie ================= */

export type OffKind = 'monopile' | 'jacket' | 'floating';
/** Wysokość podstawy wieży nad wodą (na elemencie przejściowym). */
export const OFF_BASE = 20;
export const offDepth = (k: OffKind) => (k === 'floating' ? 110 : 35);

function Railing({ r, y, n = 32 }: { r: number; y: number; n?: number }) {
  const posts = useMemo(() => Array.from({ length: n }, (_, i) => (i * 2 * Math.PI) / n), [n]);
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 1.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.yellow}>
        <torusGeometry args={[r, 0.04, 4, 64]} />
      </mesh>
      {posts.map((a, i) => (
        <mesh key={i} position={[r * Math.cos(a), 0.55, r * Math.sin(a)]} material={MAT.yellow}>
          <cylinderGeometry args={[0.03, 0.03, 1.1, 4]} />
        </mesh>
      ))}
    </group>
  );
}

/** Element przejściowy (żółty) z pomostem i przystanią dla łodzi serwisowej. */
function TransitionPiece({ y0, r }: { y0: number; r: number }) {
  return (
    <group>
      <mesh position={[0, (y0 + OFF_BASE) / 2, 0]} material={MAT.yellow}>
        <cylinderGeometry args={[r, r, OFF_BASE - y0, 48]} />
      </mesh>
      <mesh position={[0, OFF_BASE - 0.2, 0]} material={MAT.grate}>
        <cylinderGeometry args={[r + 2.6, r + 2.6, 0.25, 48]} />
      </mesh>
      <Railing r={r + 2.5} y={OFF_BASE} />
      {/* przystań: drabina i odbojnice */}
      <group position={[r + 0.6, 0, 0]}>
        {[-0.7, 0.7].map((z) => (
          <mesh key={z} position={[0.4, (y0 - 4 + OFF_BASE) / 2, z]} material={MAT.yellow}>
            <cylinderGeometry args={[0.18, 0.18, OFF_BASE - y0 + 4, 10]} />
          </mesh>
        ))}
        {Array.from({ length: 18 }, (_, i) => (
          <Box key={i} p={[0.4, y0 - 3 + i * 1.3, 0]} s={[0.05, 0.05, 1.4]} m={MAT.yellow} />
        ))}
      </group>
    </group>
  );
}

/** Narzut kamienny wokół pala (chroni dno przed rozmyciem). */
function Scour({ r, depth }: { r: number; depth: number }) {
  const mesh = useMemo(() => {
    const g = new THREE.DodecahedronGeometry(0.7, 0);
    const n = 260;
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: '#7a7670', roughness: 1 }), n);
    const o = new THREE.Object3D();
    const rr = rng(8);
    for (let i = 0; i < n; i++) {
      const a = rr() * Math.PI * 2;
      const d = r + 0.5 + Math.sqrt(rr()) * 12;
      o.position.set(Math.cos(a) * d, -depth + 0.4 + rr() * 0.6 * (1 - (d - r) / 13), Math.sin(a) * d);
      o.rotation.set(rr() * 3, rr() * 3, 0);
      o.scale.setScalar(0.6 + rr() * 0.9);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [r, depth]);
  return <primitive object={mesh} />;
}

export function OffshoreBase({ kind }: { kind: OffKind }) {
  const depth = offDepth(kind);
  const jacket = useMemo(() => {
    if (kind !== 'jacket') return [] as [V3, V3][];
    const list: [V3, V3][] = [];
    const yb = -depth;
    const yt = 14;
    const hb = 12;
    const ht = 6;
    const leg = (i: number, y: number): V3 => {
      const k = (y - yb) / (yt - yb);
      const h = mix(hb, ht, k);
      const sx = i === 0 || i === 3 ? 1 : -1;
      const sz = i < 2 ? 1 : -1;
      return [sx * h, y, sz * h];
    };
    const levels = [yb, yb + 13, yb + 25, yb + 36, 2, yt];
    for (let i = 0; i < 4; i++) list.push([leg(i, yb), leg(i, yt)]);
    for (let l = 0; l < levels.length - 1; l++)
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        list.push([leg(i, levels[l]), leg(j, levels[l + 1])]);
        list.push([leg(j, levels[l]), leg(i, levels[l + 1])]);
        list.push([leg(i, levels[l + 1]), leg(j, levels[l + 1])]);
      }
    return list;
  }, [kind, depth]);
  if (kind === 'monopile')
    return (
      <group>
        <mesh position={[0, (-depth + 8) / 2, 0]} material={MAT.steelDark}>
          <cylinderGeometry args={[4, 4, depth + 8, 48]} />
        </mesh>
        <TransitionPiece y0={6} r={4.1} />
        <Scour r={4} depth={depth} />
      </group>
    );
  if (kind === 'jacket')
    return (
      <group>
        <Rods list={jacket} r={0.6} m={MAT.yellow} />
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[(i === 0 || i === 3 ? 1 : -1) * 12, -depth - 1, (i < 2 ? 1 : -1) * 12]} material={MAT.steelDark}>
            <cylinderGeometry args={[1.0, 1.0, 3, 12]} />
          </mesh>
        ))}
        <Box p={[0, 15, 0]} s={[14, 2, 14]} m={MAT.yellow} />
        <mesh position={[0, 17.5, 0]} material={MAT.yellow}>
          <cylinderGeometry args={[3.2, 3.6, 5, 32]} />
        </mesh>
        <mesh position={[0, OFF_BASE - 0.2, 0]} material={MAT.grate}>
          <cylinderGeometry args={[6, 6, 0.25, 32]} />
        </mesh>
        <Railing r={5.9} y={OFF_BASE} />
      </group>
    );
  // pływająca: trzy kolumny połączone pontonami, liny kotwiczne do dna
  const cols: V3[] = [0, 1, 2].map((i) => {
    const a = (i * 2 * Math.PI) / 3;
    return [Math.cos(a) * 42, 0, Math.sin(a) * 42];
  });
  return (
    <group>
      {cols.map((c, i) => (
        <group key={i} position={c}>
          <mesh position={[0, -6, 0]} material={MAT.yellow}>
            <cylinderGeometry args={[6, 6, 30, 32]} />
          </mesh>
          <mesh position={[0, -19, 0]} material={MAT.steelDark}>
            <cylinderGeometry args={[9, 9, 4, 32]} />
          </mesh>
        </group>
      ))}
      {cols.map((c, i) => {
        const d = cols[(i + 1) % 3];
        return <Rod key={i} a={[c[0], -18, c[2]]} b={[d[0], -18, d[2]]} r={2.2} m={MAT.yellow} />;
      })}
      {cols.map((c, i) => (
        <Rod key={`r${i}`} a={[c[0], -18, c[2]]} b={[0, -18, 0]} r={1.8} m={MAT.yellow} />
      ))}
      {cols.map((c, i) => (
        <Rod key={`u${i}`} a={[c[0] * 0.85, 8, c[2] * 0.85]} b={[0, 14, 0]} r={1.0} m={MAT.yellow} />
      ))}
      <mesh position={[0, -2, 0]} material={MAT.yellow}>
        <cylinderGeometry args={[4.2, 4.6, 44, 32]} />
      </mesh>
      <mesh position={[0, OFF_BASE - 0.2, 0]} material={MAT.grate}>
        <cylinderGeometry args={[6.5, 6.5, 0.25, 32]} />
      </mesh>
      <Railing r={6.4} y={OFF_BASE} />
      {/* liny kotwiczne: krzywa łańcuchowa do kotwic na dnie */}
      {cols.map((c, i) => {
        const a = Math.atan2(c[2], c[0]);
        const pts: V3[] = [];
        for (let k = 0; k <= 30; k++) {
          const u = k / 30;
          const dist = 42 + u * 520;
          const y = -18 + (-depth + 18) * Math.pow(u, 0.55);
          pts.push([Math.cos(a) * dist, Math.max(-depth + 0.3, y), Math.sin(a) * dist]);
        }
        return <Line key={`m${i}`} points={pts} color="#2a2a2a" lineWidth={2.2} />;
      })}
    </group>
  );
}

/* ================= stacja elektroenergetyczna, linie ================= */

/** Stacja transformatorowa (GPZ): ogrodzenie, dwa transformatory, bramki z izolatorami, budynek. */
export function Substation() {
  const [x, , z] = SUBSTATION;
  const y = groundH(x, z);
  return (
    <group position={[x, y, z]}>
      {/* ogrodzenie */}
      {(
        [
          [0, -35, 90, 0],
          [0, 35, 90, 0],
          [-45, 0, 70, 1],
          [45, 0, 70, 1],
        ] as [number, number, number, number][]
      ).map(([px, pz, l, rot], i) => (
        <Box key={i} p={[px, 1.1, pz]} s={rot ? [0.15, 2.2, l] : [l, 2.2, 0.15]} m={MAT.grate} />
      ))}
      {[-14, 14].map((dx) => (
        <group key={dx} position={[dx, 0, 4]}>
          <Box p={[0, 3.2, 0]} s={[9, 6.4, 6]} m={MAT.transformer} />
          {[-3.3, -1.1, 1.1, 3.3].map((zz) => (
            <Box key={zz} p={[0, 3, 3.6]} s={[7.5, 5, 0.25]} m={MAT.transformer} />
          ))}
          {[-2.5, 0, 2.5].map((bx) => (
            <mesh key={bx} position={[bx, 8.2, -1]} material={MAT.cabinet}>
              <cylinderGeometry args={[0.25, 0.4, 3.6, 10]} />
            </mesh>
          ))}
          <mesh position={[0, 7.3, 2.4]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steel}>
            <cylinderGeometry args={[1.0, 1.0, 5, 16]} />
          </mesh>
        </group>
      ))}
      {/* bramki */}
      {[-24, 0, 24].map((bx) => (
        <Box key={bx} p={[bx, 8, -10]} s={[0.6, 16, 0.6]} m={MAT.steel} />
      ))}
      <Box p={[0, 16, -10]} s={[50, 0.8, 0.8]} m={MAT.steel} />
      {[-18, -6, 6, 18].map((ix) => (
        <mesh key={ix} position={[ix, 14.5, -10]} material={MAT.cabinet}>
          <cylinderGeometry args={[0.2, 0.2, 2.6, 8]} />
        </mesh>
      ))}
      <Box p={[-30, 2.5, 22]} s={[18, 5, 9]} m={MAT.cabinet} />
      <Box p={[-30, 5.1, 22]} s={[18.4, 0.3, 9.4]} m={MAT.steelDark} />
    </group>
  );
}

/** Słupy linii 110 kV: od stacji w dal; zwraca punkty słupów (do energii). */
export const PYLONS: V3[] = (() => {
  const out: V3[] = [];
  const [sx, , sz] = SUBSTATION;
  for (let i = 0; i < 9; i++) {
    const x = sx + 60 + i * 300;
    const z = sz + 40 + i * 140;
    out.push([x, groundH(x, z), z]);
  }
  return out;
})();
const PYLON_H = 42;
const ARMS: [number, number][] = [
  [PYLON_H - 14, 8],
  [PYLON_H - 8, 6],
  [PYLON_H - 2, 4.5],
];
function pylonRods() {
  const list: [V3, V3][] = [];
  const w = (y: number) => mix(4, 0.9, y / PYLON_H);
  const c = (y: number, i: number): V3 => [(i & 1 ? 1 : -1) * w(y), y, (i & 2 ? 1 : -1) * w(y)];
  for (let i = 0; i < 4; i++) list.push([c(0, i), c(PYLON_H, i)]);
  const lv = [0, 6, 12, 18, 24, 30, 36, PYLON_H];
  for (let l = 0; l < lv.length - 1; l++) {
    const ord = [0, 1, 3, 2];
    for (let s = 0; s < 4; s++) {
      const a = ord[s];
      const b = ord[(s + 1) % 4];
      list.push([c(lv[l], a), c(lv[l + 1], b)]);
      list.push([c(lv[l + 1], a), c(lv[l + 1], b)]);
    }
  }
  for (const [y, half] of ARMS) {
    list.push([[-half, y, 0], [half, y, 0]]);
    list.push([[-half, y, 0], [-w(y), y - 2.5, 0]]);
    list.push([[half, y, 0], [w(y), y - 2.5, 0]]);
  }
  list.push([[0, PYLON_H, 0], [0, PYLON_H + 3, 0]]);
  return list;
}

/** Linia wysokiego napięcia: słupy kratowe i przewody zwisające po krzywej łańcuchowej. */
export function PowerLine() {
  const rods = useMemo(() => pylonRods(), []);
  const wires = useMemo(() => {
    const out: V3[][] = [];
    const [sx, sy, sz] = SUBSTATION;
    const start: V3 = [sx + 20, sy + 15, sz - 10];
    const pts = [start, ...PYLONS];
    const ang = Math.atan2(140, 300);
    for (const [y, half] of [...ARMS, [PYLON_H + 3, 0] as [number, number]])
      for (const sg of half ? [-1, 1] : [0]) {
        const line: V3[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const off = (p: V3, first: boolean): V3 => (first && i === 0 ? [p[0], p[1], p[2]] : [p[0] - Math.sin(ang) * sg * half, p[1] + y - 1.5, p[2] + Math.cos(ang) * sg * half]);
          const A = off(a, true);
          const B = off(b, false);
          for (let k = 0; k <= 10; k++) {
            const u = k / 10;
            const sag = 4 * 7 * u * (1 - u);
            line.push([mix(A[0], B[0], u), mix(A[1], B[1], u) - sag, mix(A[2], B[2], u)]);
          }
        }
        out.push(line);
      }
    return out;
  }, []);
  const ang = Math.atan2(140, 300);
  return (
    <group>
      {PYLONS.map((p, i) => (
        <group key={i} position={p} rotation={[0, -ang + Math.PI / 2, 0]}>
          <Rods list={rods} r={0.14} m={MAT.steel} />
        </group>
      ))}
      {wires.map((w, i) => (
        <Line key={i} points={w} color="#3a3f45" lineWidth={1.2} />
      ))}
    </group>
  );
}

/** Trasa kabla od turbiny do stacji: wzdłuż drogi dojazdowej i głównej. */
export function cableRoute(i: number): V3[] {
  const [x, z] = FARM[i];
  const rz = (xx: number) => {
    for (let k = 0; k < ROAD_MAIN.length - 1; k++) {
      const [x0, z0] = ROAD_MAIN[k];
      const [x1, z1] = ROAD_MAIN[k + 1];
      if (xx >= x0 && xx <= x1) return mix(z0, z1, (xx - x0) / (x1 - x0));
    }
    return 0;
  };
  const pts: [number, number][] = [
    [x, z],
    [x + 18, z],
    [x + 18, rz(x + 18) - 4],
  ];
  const [sx, , sz] = SUBSTATION;
  const xs = ROAD_MAIN.map(([a]) => a).filter((a) => a > x + 18 && a < sx);
  for (const a of xs) pts.push([a, rz(a) - 4]);
  pts.push([sx - 50, rz(sx - 50) - 4], [sx - 50, sz], [sx - 30, sz]);
  return pts.map(([a, b]) => [a, groundH(a, b) + 1.2, b]);
}

/**
 * Płynąca energia: świecące kulki przesuwające się wzdłuż łamanej. `rate` – mnożnik prędkości (np. moc turbiny).
 */
export function EnergyFlow({ path, count = 40, speed = 30, size = 2.5, color = '#ffd34d', rate }: { path: V3[]; count?: number; speed?: number; size?: number; color?: string; rate?: () => number }) {
  const { cum, total } = useMemo(() => {
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]));
    return { cum, total: cum[cum.length - 1] };
  }, [path]);
  const mesh = useMemo(() => new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }), count), [count, color]);
  const off = useRef(0);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    const k = rate ? rate() : 1;
    off.current = (off.current + Math.min(dt, 0.05) * speed * k) % total;
    for (let i = 0; i < count; i++) {
      const d = (off.current + (i * total) / count) % total;
      let j = 1;
      while (j < cum.length - 1 && cum[j] < d) j++;
      const u = (d - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]);
      const a = path[j - 1];
      const b = path[j];
      o.position.set(mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u));
      o.scale.setScalar(size * (k > 0.02 ? 1 : 0.001));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

/** Magazyn energii: kontenery z akumulatorami przy stacji. */
export const BATTERY: V3 = [SUBSTATION[0] - 20, groundH(SUBSTATION[0] - 20, SUBSTATION[2] + 70), SUBSTATION[2] + 70];
export function BatteryStorage() {
  return (
    <group position={BATTERY}>
      {Array.from({ length: 8 }, (_, i) => (
        <group key={i} position={[(i % 4) * 15 - 22, 0, Math.floor(i / 4) * 9]}>
          <Box p={[0, 1.45, 0]} s={[12.2, 2.9, 2.45]} m={MAT.cabinet} />
          {[-4, -1.3, 1.3, 4].map((dx) => (
            <Box key={dx} p={[dx, 1.45, 1.24]} s={[0.05, 2.5, 0.02]} m={MAT.cabinetLine} />
          ))}
          <Box p={[3.5, 3.1, 0]} s={[2, 0.4, 1.6]} m={MAT.steelDark} />
        </group>
      ))}
    </group>
  );
}

/* ================= profil łopaty z siłami ================= */

/** Przekrój, na którym pokazujemy siły (odległość od osi wirnika). */
export const LIFT_R = 55;
const LIFT_K = 6;

/**
 * Powiększony przekrój łopaty z siłami. Łopata 0 jest ustawiona poziomo w stronę widza (+z), więc jej przekrój
 * leży w płaszczyźnie x–y: wiatr wieje z +x, łopata porusza się w górę (+y).
 */
export function AirfoilForces({ V, rpm, pitch, at }: { V: number; rpm: number; pitch: number; at: V3 }) {
  const s = LIFT_R - T.rootR;
  const shape = useMemo(() => {
    const sh = new THREE.Shape();
    const th = (twistAt(s) + pitch) * DEG;
    for (let j = 0; j <= 80; j++) {
      const [x0, z0] = sectionPt(s, (j % 80) / 80);
      const x = x0 * Math.cos(th) - z0 * Math.sin(th);
      const z = x0 * Math.sin(th) + z0 * Math.cos(th);
      // układ łopaty → płaszczyzna rysunku: x → x, z (natarcie w −z) → −y
      const px = x * LIFT_K;
      const py = -z * LIFT_K;
      if (j === 0) sh.moveTo(px, py);
      else sh.lineTo(px, py);
    }
    return sh;
  }, [s, pitch]);
  const geo = useMemo(() => new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false, curveSegments: 4 }), [shape]);
  const u = (rpm * 2 * Math.PI * LIFT_R) / 60;
  const W = Math.hypot(V, u);
  const sc = 0.16;
  const wd: [number, number] = W > 0.01 ? [-V / W, -u / W] : [-1, 0];
  // siła nośna prostopadła do wiatru względnego, z przodu (+y) i z wiatrem (−x)
  const ld: [number, number] = [-u / Math.max(0.01, W), V / Math.max(0.01, W)];
  const L = clamp(W / 90) * 11;
  const D = L * 0.08;
  const Fx = ld[0] * L + wd[0] * D;
  const Fy = ld[1] * L + wd[1] * D;
  const zz = 1.2;
  const chord = chordAt(s) * LIFT_K;
  return (
    <group position={at}>
      <mesh geometry={geo} position={[0, 0, -0.4]}>
        <meshStandardMaterial color="#eef1f3" roughness={0.4} />
      </mesh>
      {/* cięciwa */}
      <Line points={[[Math.sin((twistAt(s) + pitch) * DEG) * chord * 0.35, Math.cos((twistAt(s) + pitch) * DEG) * chord * 0.35, zz], [-Math.sin((twistAt(s) + pitch) * DEG) * chord * 0.65, -Math.cos((twistAt(s) + pitch) * DEG) * chord * 0.65, zz]]} color="#8a94a0" lineWidth={1.4} dashed dashSize={0.6} gapSize={0.4} />
      {/* wiatr */}
      <Arrow3D from={[16 + V * sc, 9, zz]} vec={[-V * sc * 1.6, 0, 0]} color="#38bdf8" radius={0.22} />
      {/* ruch łopaty → wiatr od ruchu */}
      <Arrow3D from={[0, -6, zz]} vec={[0, u * sc * 0.75, 0]} color="#4ade80" radius={0.22} />
      {/* wiatr względny – napływa na krawędź natarcia */}
      <Arrow3D from={[-wd[0] * 16, -wd[1] * 16, zz]} vec={[wd[0] * 9, wd[1] * 9, 0]} color="#f8fafc" radius={0.26} />
      {/* siła nośna i opór */}
      <Arrow3D from={[0, 0, zz + 0.2]} vec={[ld[0] * L, ld[1] * L, 0]} color="#fb923c" radius={0.3} />
      <Arrow3D from={[0, 0, zz + 0.2]} vec={[wd[0] * D * 3, wd[1] * D * 3, 0]} color="#f87171" radius={0.18} />
      {/* składowe: napęd (w kierunku ruchu) i nacisk (z wiatrem) */}
      <Arrow3D from={[0, 0, zz + 0.4]} vec={[0, Fy, 0]} color="#facc15" radius={0.22} />
      <Arrow3D from={[0, 0, zz + 0.4]} vec={[Fx, 0, 0]} color="#a78bfa" radius={0.18} />
    </group>
  );
}

/* ================= wycinek łopaty ================= */

/** Wycinek łopaty od s0 do s1 (leży na stojakach) z przekrojem warstw na końcu. */
export const SEG = { s0: 15.5, s1: 22.5 };

function offsetLoop(s: number, d: number, n = 120): [number, number][] {
  const th = twistAt(s) * DEG;
  const P: [number, number][] = [];
  for (let j = 0; j < n; j++) {
    const [x0, z0] = sectionPt(s, j / n);
    P.push([x0 * Math.cos(th) - z0 * Math.sin(th), x0 * Math.sin(th) + z0 * Math.cos(th)]);
  }
  if (!d) return P;
  let cx = 0;
  let cz = 0;
  for (const [x, z] of P) {
    cx += x;
    cz += z;
  }
  cx /= n;
  cz /= n;
  return P.map(([x, z], j) => {
    const [ax, az] = P[(j + n - 1) % n];
    const [bx, bz] = P[(j + 1) % n];
    let nx = bz - az;
    let nz = -(bx - ax);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if (nx * (x - cx) + nz * (z - cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    return [x - nx * d, z - nz * d];
  });
}
/** Wstęga między dwoma przesunięciami konturu dla punktów j0…j1 (indeksy obwodu). */
function bandShape(s: number, d0: number, d1: number, j0: number, j1: number, n = 120) {
  const A = offsetLoop(s, d0, n);
  const B = offsetLoop(s, d1, n);
  const sh = new THREE.Shape();
  const idx: number[] = [];
  for (let j = j0; j <= j1; j++) idx.push(((j % n) + n) % n);
  idx.forEach((j, k) => (k ? sh.lineTo(A[j][0], A[j][1]) : sh.moveTo(A[j][0], A[j][1])));
  idx
    .slice()
    .reverse()
    .forEach((j) => sh.lineTo(B[j][0], B[j][1]));
  sh.closePath();
  return sh;
}

export function BladeSegment({ at }: { at: V3 }) {
  const geo = useMemo(() => {
    const { s0, s1 } = SEG;
    const NU = 120;
    const NS = 14;
    const build = (d: number) => {
      const pos: number[] = [];
      for (let i = 0; i <= NS; i++) {
        const s = mix(s0, s1, i / NS);
        for (const [x, z] of offsetLoop(s, d, NU)) pos.push(x, T.rootR + s, z);
      }
      const idx: number[] = [];
      for (let i = 0; i < NS; i++)
        for (let j = 0; j < NU; j++) {
          const a = i * NU + j;
          const b = i * NU + ((j + 1) % NU);
          idx.push(a, a + NU, b, b, a + NU, b + NU);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const outer = build(0);
    const inner = build(0.11);
    // przekrój na końcu s1: warstwy (przesunięcia są pogrubione ok. 3×, żeby było je widać)
    const n = NU;
    const s = s1;
    const toCap = (sh: THREE.Shape, lift: number) => {
      const g = new THREE.ShapeGeometry(sh);
      g.rotateX(Math.PI / 2);
      g.translate(0, T.rootR + s + lift, 0);
      return g;
    };
    const ring = new THREE.Shape(offsetLoop(s, 0, n).map(([x, z]) => new THREE.Vector2(x, z)));
    ring.holes.push(new THREE.Path(offsetLoop(s, 0.11, n).map(([x, z]) => new THREE.Vector2(x, z))));
    // indeksy: górna (ssąca) połowa 0…n/2 od spływu do natarcia; dźwigar na 22–48% cięciwy
    const P0 = offsetLoop(s, 0, n);
    const xs = P0.map((_, j) => {
      const a = (2 * Math.PI * j) / n;
      return (1 + Math.cos(a)) / 2;
    });
    const range = (lo: number, hi: number, upper: boolean) => {
      const js: number[] = [];
      for (let j = 0; j < n; j++) if (xs[j] >= lo && xs[j] <= hi && (j < n / 2) === upper) js.push(j);
      return [Math.min(...js), Math.max(...js)];
    };
    const capU = range(0.22, 0.48, true);
    const capL = range(0.22, 0.48, false);
    const coreU1 = range(0.05, 0.22, true);
    const coreU2 = range(0.48, 0.9, true);
    const coreL1 = range(0.05, 0.22, false);
    const coreL2 = range(0.48, 0.9, false);
    const caps = [capU, capL].map(([a, b]) => toCap(bandShape(s, 0.012, 0.1, a, b, n), 0.012));
    const cores = [coreU1, coreU2, coreL1, coreL2].map(([a, b]) => toCap(bandShape(s, 0.03, 0.085, a, b, n), 0.008));
    // środniki: łączą wewnętrzne powierzchnie górnej i dolnej półki dźwigara
    const Pi = offsetLoop(s, 0.1, n);
    const webAt = (x: number) => {
      let ju = 0;
      let jl = 0;
      let du = 9;
      let dl = 9;
      for (let j = 0; j < n; j++) {
        const d = Math.abs(xs[j] - x);
        if (j < n / 2 && d < du) {
          du = d;
          ju = j;
        }
        if (j >= n / 2 && d < dl) {
          dl = d;
          jl = j;
        }
      }
      const [ux, uz] = Pi[ju];
      const [lx, lz] = Pi[jl];
      const dx = lx - ux;
      const dz = lz - uz;
      const l = Math.hypot(dx, dz);
      const px = (-dz / l) * 0.06;
      const pz = (dx / l) * 0.06;
      const sh = new THREE.Shape([new THREE.Vector2(ux - px, uz - pz), new THREE.Vector2(ux + px, uz + pz), new THREE.Vector2(lx + px, lz + pz), new THREE.Vector2(lx - px, lz - pz)]);
      return toCap(sh, 0.01);
    };
    const webs = [webAt(0.25), webAt(0.45)];
    return { outer, inner, ring: toCap(ring, 0.004), caps, cores, webs };
  }, []);
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ece6d3', roughness: 0.6, side: THREE.DoubleSide }), []);
  const balsa = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d8b064', roughness: 0.8, side: THREE.DoubleSide }), []);
  const carbon = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.4, side: THREE.DoubleSide }), []);
  const innerM = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9c0a4', roughness: 0.8, side: THREE.BackSide }), []);
  const mid = T.rootR + (SEG.s0 + SEG.s1) / 2;
  return (
    <group position={at}>
      {/* łopata leży: oś łopaty → x, strona ssąca do góry */}
      <group rotation={[0, 0, -Math.PI / 2]} position={[-mid, 0, 0]}>
        <mesh geometry={geo.outer} material={MAT.paint} />
        <mesh geometry={geo.inner} material={innerM} />
        <mesh geometry={geo.ring} material={glass} />
        {geo.cores.map((g, i) => (
          <mesh key={i} geometry={g} material={balsa} />
        ))}
        {geo.caps.map((g, i) => (
          <mesh key={i} geometry={g} material={carbon} />
        ))}
        {geo.webs.map((g, i) => (
          <mesh key={i} geometry={g} material={balsa} />
        ))}
      </group>
      {/* stojaki */}
      {[-2.2, 2.2].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Box p={[0, -1.1, 0]} s={[0.4, 1.4, 4.6]} m={MAT.yellow} />
          <Box p={[0, -1.85, 0]} s={[1.6, 0.15, 5.2]} m={MAT.steelDark} />
        </group>
      ))}
    </group>
  );
}

/* ================= maszt pomiarowy ================= */

export const MAST: V3 = [60, 0, 110];
export const MAST_LEVELS = [10, 40, 80, 120, 160];

/** Maszt z wiatromierzami na kilku wysokościach i strzałkami prędkości (wiatr słabnie przy ziemi). */
export function MetMast({ V }: { V: number }) {
  const rods = useMemo(() => {
    const list: [V3, V3][] = [];
    const w = 0.9;
    const c = (y: number, i: number): V3 => [Math.cos((i * 2 * Math.PI) / 3) * w, y, Math.sin((i * 2 * Math.PI) / 3) * w];
    for (let i = 0; i < 3; i++) list.push([c(0, i), c(162, i)]);
    for (let y = 0; y < 162; y += 3) for (let i = 0; i < 3; i++) list.push([c(y, i), c(y + 3, (i + 1) % 3)]);
    return list;
  }, []);
  const cups = useRef<(THREE.Group | null)[]>([]);
  useFrame((_, dt) => {
    MAST_LEVELS.forEach((h, i) => {
      const g = cups.current[i];
      if (g) g.rotation.y += shear(V, h) * dt * 0.9;
    });
  });
  const sc = 2.2;
  const tips: V3[] = [];
  for (let h = 4; h <= 165; h += 4) tips.push([MAST[0] + 6 - shear(V, h) * sc, h, MAST[2]]);
  return (
    <group>
      <group position={MAST}>
        <Rods list={rods} r={0.05} m={MAT.steel} />
        {MAST_LEVELS.map((h, i) => (
          <group key={h} position={[0, h, 0]}>
            <Box p={[3, 0, 0]} s={[6, 0.08, 0.08]} m={MAT.steel} />
            <group ref={(r) => (cups.current[i] = r)} position={[6, 0.5, 0]}>
              {[0, 1, 2].map((k) => {
                const a = (k * 2 * Math.PI) / 3;
                return (
                  <group key={k} rotation={[0, a, 0]}>
                    <Box p={[0.35, 0, 0]} s={[0.7, 0.03, 0.03]} m={MAT.steelDark} />
                    <mesh position={[0.7, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.steelDark}>
                      <sphereGeometry args={[0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    </mesh>
                  </group>
                );
              })}
            </group>
          </group>
        ))}
      </group>
      {MAST_LEVELS.map((h) => (
        <Arrow3D key={h} from={[MAST[0] + 6, h, MAST[2]]} vec={[-shear(V, h) * sc, 0, 0]} color="#38bdf8" radius={0.7} />
      ))}
      <Line points={tips} color="#38bdf8" lineWidth={2} dashed dashSize={3} gapSize={2} />
    </group>
  );
}

/* ================= porcja powietrza ================= */

/** Walec powietrza, które w ciągu 1 s przepływa przez pole wirnika: grubość = prędkość wiatru × 1 s. */
export function AirSlab({ V, hubY }: { V: number; hubY: number }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current = (t.current + Math.min(dt, 0.05)) % 3;
    const g = ref.current;
    if (!g) return;
    // podjeżdża z wiatrem z prędkością wiatru i przechodzi przez wirnik
    const x = HUB[0] + V * (2 - t.current);
    g.position.set(x, hubY, 0);
    g.scale.set(Math.max(0.3, V), 1, 1);
  });
  return (
    <group ref={ref}>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.5, 0, 0]} renderOrder={4}>
        <cylinderGeometry args={[R, R, 1, 72, 1]} />
        <meshStandardMaterial color="#7cc4ff" transparent opacity={0.28} depthWrite={false} roughness={0.3} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.5, 0, 0]}>
        <cylinderGeometry args={[R + 0.05, R + 0.05, 1.002, 72, 1, true]} />
        <meshBasicMaterial color="#2f8fe0" wireframe transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

/** Pole zakreślane przez wirnik (półprzezroczysty krąg). */
export function SweptDisc({ yaw = 0 }: { yaw?: number }) {
  return (
    <group position={[0, T.towerH, 0]} rotation={[0, yaw, 0]}>
      <group position={[HUB[0] + 1.2, HUB[1] - T.towerH, 0]} rotation={[0, 0, T.tilt]}>
        <mesh rotation={[0, Math.PI / 2, 0]} renderOrder={4}>
          <ringGeometry args={[3, R, 96, 1]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <ringGeometry args={[R - 0.5, R, 96, 1]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
