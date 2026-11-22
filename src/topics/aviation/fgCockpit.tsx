/*
 * Bryły kokpitu A350 z modelu do symulatora FlightGear (repozytorium A350XWB, autorzy: Sbyx, Jormappapa i inni).
 * Geometria została przeliczona skryptem do układu modelu kokpitu (metry; podłoga stanowiska y = 0, oczy pilotów
 * nad początkiem układu, −z – do przodu, +x – w prawo) i zapisana w public/models/a350-cockpit.{json,bin}:
 * pozycje (int16), barwy wierzchołków pobrane z tekstur (rgb8) i normalne (int8), z indeksami. Tekstur nie używamy.
 *
 * Z modelu usunięte są ściany, sufit i ramy szyb – tę rolę pełni poszycie samolotu (wykładzina z otworami szyb).
 * Panel górny jest obniżony o kilka centymetrów, żeby zmieścił się pod wykładziną naszego nosa. Ruchome części
 * (dźwignie ciągu, klap i hamulców aerodynamicznych, podwozia, boczne drążki i pedały) są osobnymi siatkami
 * z osiami obrotu, żeby scenariusze mogły nimi poruszać.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

type V3 = [number, number, number];
type PartMeta = { name: string; verts: number; pos: number; col: number; nrm: number; idx: number; count: number; pivot: V3 | null };
type DuMeta = { c: V3; x: V3; y: V3 };
type Meta = { parts: PartMeta[]; scale: number; du: Record<string, DuMeta> };
export type FgCockpitData = { geo: Record<string, THREE.BufferGeometry>; pivot: Record<string, V3 | null>; du: Record<string, THREE.Matrix4> };

let cache: FgCockpitData | null = null;
let pending: Promise<FgCockpitData> | null = null;

const srgbToLinear = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return t;
})();

function load(): Promise<FgCockpitData> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  const base = `${(import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./"}models/a350-cockpit`;
  pending = Promise.all([fetch(`${base}.json`).then((r) => r.json() as Promise<Meta>), fetch(`${base}.bin`).then((r) => r.arrayBuffer())]).then(([meta, buf]) => {
    const geo: Record<string, THREE.BufferGeometry> = {};
    const pivot: Record<string, V3 | null> = {};
    for (const p of meta.parts) {
      const q = new Int16Array(buf, p.pos, p.verts * 3);
      const pos = new Float32Array(p.verts * 3);
      for (let i = 0; i < pos.length; i++) pos[i] = q[i] * meta.scale;
      const c8 = new Uint8Array(buf, p.col, p.verts * 3);
      const col = new Float32Array(p.verts * 3);
      for (let i = 0; i < col.length; i++) col[i] = srgbToLinear[c8[i]];
      const n8 = new Int8Array(buf, p.nrm, p.verts * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(n8), 3, true));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf.slice(p.idx, p.idx + p.count * 4)), 1));
      // części ruchome: wierzchołki względem osi obrotu (grupa stoi w osi)
      if (p.pivot) g.translate(-p.pivot[0], -p.pivot[1], -p.pivot[2]);
      g.computeBoundingSphere();
      geo[p.name] = g;
      pivot[p.name] = p.pivot;
    }
    const du: Record<string, THREE.Matrix4> = {};
    for (const [k, d] of Object.entries(meta.du)) {
      const x = new THREE.Vector3(...d.x).normalize();
      const y = new THREE.Vector3(...d.y).normalize();
      const z = new THREE.Vector3().crossVectors(x, y).normalize();
      du[k] = new THREE.Matrix4().makeBasis(x, y, z).setPosition(...d.c);
    }
    cache = { geo, pivot, du };
    return cache;
  });
  return pending;
}

/** Dane modelu (null – jeszcze się wczytują). */
export function useFgCockpit(): FgCockpitData | null {
  const [d, setD] = useState<FgCockpitData | null>(cache);
  useEffect(() => {
    let live = true;
    if (!d) load().then((x) => live && setD(x));
    return () => {
      live = false;
    };
  }, [d]);
  return d;
}

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.06, side: THREE.DoubleSide });

/** Część obracana wokół swojej osi; `rot` – kąty [x, y, z] (rad), `shift` – przesunięcie (m), wygładzane. */
function Moving({ data, name, rot, shift }: { data: FgCockpitData; name: string; rot?: () => V3; shift?: () => V3 }) {
  const g = useRef<THREE.Group>(null);
  const piv = data.pivot[name] ?? [0, 0, 0];
  useFrame(() => {
    const o = g.current;
    if (!o) return;
    if (rot) {
      const [a, b, c] = rot();
      o.rotation.x += (a - o.rotation.x) * 0.2;
      o.rotation.y += (b - o.rotation.y) * 0.2;
      o.rotation.z += (c - o.rotation.z) * 0.2;
    }
    if (shift) {
      const [a, b, c] = shift();
      o.position.x += (piv[0] + a - o.position.x) * 0.2;
      o.position.y += (piv[1] + b - o.position.y) * 0.2;
      o.position.z += (piv[2] + c - o.position.z) * 0.2;
    }
  });
  return (
    <group ref={g} position={piv}>
      <mesh geometry={data.geo[name]} material={MAT} />
    </group>
  );
}

export type FgDrive = {
  /** Dźwignie ciągu: 0 – bieg jałowy, 1 – CL, 1,5 – FLX, 2 – TOGA, < 0 – odwracacz. */
  lever: () => [number, number];
  /** Klapy: numer położenia 0 (0) … 5 (FULL). */
  flap: () => number;
  /** Hamulce aerodynamiczne: 0 … 1. */
  spd: () => number;
  gear: () => 'up' | 'down';
  /** Drążek kapitana: [w bok, do siebie], −1 … 1. */
  stick: () => [number, number];
  /** Pedały: wychylenie steru kierunku −1 … 1. */
  pedals: () => number;
};

/** Całe wyposażenie kokpitu z modelu; `children` – ekrany itp. w ramkach (dostają macierze jednostek wyświetlaczy). */
export function FgCockpit({ data, drive, children }: { data: FgCockpitData; drive: FgDrive; children?: (du: Record<string, THREE.Matrix4>) => ReactNode }) {
  const thr = (i: 0 | 1) => (): V3 => {
    const l = Math.max(-1, Math.min(2, drive.lever()[i]));
    // do przodu (ujemny kąt) – więcej ciągu; odwracacz – do tyłu
    return [l >= 0 ? -l * 0.32 : -l * 0.18, 0, 0];
  };
  const stick = useMemo(() => () => {
    const [sx, sy] = drive.stick();
    return [sy * 0.3, 0, -sx * 0.32] as V3;
  }, [drive]);
  return (
    <group>
      <mesh geometry={data.geo.static} material={MAT} />
      <Moving data={data} name="thrL" rot={thr(0)} />
      <Moving data={data} name="thrR" rot={thr(1)} />
      <Moving data={data} name="flap" rot={() => [drive.flap() * 0.11, 0, 0]} />
      <Moving data={data} name="spd" rot={() => [drive.spd() * 0.55, 0, 0]} />
      <Moving data={data} name="gear" rot={() => [drive.gear() === 'up' ? -0.55 : 0, 0, 0]} />
      <Moving data={data} name="stickL" rot={stick} />
      <Moving data={data} name="stickR" />
      {/* pedały obu pilotów są połączone: lewy do przodu, prawy do tyłu */}
      <Moving data={data} name="pedL" shift={() => [0, 0, -drive.pedals() * 0.05]} />
      <Moving data={data} name="pedR" shift={() => [0, 0, drive.pedals() * 0.05]} />
      {children?.(data.du)}
    </group>
  );
}
