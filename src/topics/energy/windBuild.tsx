/*
 * Elektrownia wiatrowa – montaż turbiny. Na placu leżą segmenty wieży (na drewnianych podkładach), gondola na
 * ramie transportowej, piasta na stojaku i trzy łopaty. Duży dźwig gąsienicowy z wysięgnikiem kratowym i
 * zawiesiem pomocniczym (superlift) podnosi kolejne elementy; segmenty wieży stawia do pionu razem z małym
 * dźwigiem samojezdnym, który trzyma dolny koniec. Gondola wisi na trawersie, łopata w chwytaku, a liny
 * prowadzące z ziemi trzymają ją przed obracaniem się na wietrze. Po każdym elemencie – skręcanie kołnierza.
 * Między łopatami wirnik obraca się o 120°, żeby kolejne gniazdo stanęło poziomo.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HUB, T, bladePt, clamp, mix, towerR, type V3 } from './windGeo';
import { BladeMesh, MAT, Nacelle, Rotor, TowerSection, type TurbineState } from './windTurbine';
import { Rods } from './windExtras';

/** Tempo animacji (scenariusz trwa ok. 80 s). */
const SPEED = 1.6;

/** Podstawa dużego dźwigu i małego dźwigu pomocniczego. */
export const CRANE_AT: V3 = [28, 0, -14];
const TAIL_AT: V3 = [86, 0, -50];
const C = new THREE.Vector3(...CRANE_AT);

const UP = new THREE.Vector3(0, 1, 0);
const qAx = (x: number, y: number, z: number, a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), a);
const ss = (k: number) => k * k * (3 - 2 * k);

/** Kąt wirnika, przy którym gniazdo łopaty i jest poziomo, w stronę +z (z dala od dźwigu). */
const slotAngle = (i: number) => Math.PI / 2 - (i * 2 * Math.PI) / 3;
/** Ustawienie łopaty w gnieździe poziomym (pochylenie wału · obrót do +z · stożek). */
const BLADE_Q = qAx(0, 0, 1, T.tilt).multiply(qAx(1, 0, 0, Math.PI / 2)).multiply(qAx(0, 0, 1, -T.cone));
/** Kierunek „w górę” łopaty w gnieździe, w jej układzie (oś z łopaty patrzy wtedy w dół). */
const UPZ = -1;
/** Środek ciężkości łopaty (od osi wirnika, wzdłuż łopaty) – tu chwyta chwytak. */
const BLADE_COG = T.rootR + 24;

/** Obrys przekroju łopaty w miejscu chwytaka (do ustawienia szczęk). */
const YOKE = (() => {
  const v = new THREE.Vector3();
  let x0 = 0;
  let x1 = 0;
  let z0 = 0;
  for (let i = 0; i <= 40; i++) {
    bladePt(BLADE_COG - T.rootR, i / 40, v);
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    z0 = Math.min(z0, v.z);
  }
  return { x0: x0 - 0.35, x1: x1 + 0.35, top: -z0 + 0.6 };
})();

type Ph = 'travel' | 'rig' | 'upend' | 'free' | 'lift' | 'swing' | 'lower' | 'insert' | 'bolt';
type Kind = 'sec' | 'nac' | 'hub' | 'blade';
interface Part {
  id: string;
  kind: Kind;
  n: number;
  /** Punkt elementu, który niesie hak (układ elementu). */
  anchor: THREE.Vector3;
  /** Wysokość haka nad punktem nośnym. */
  hookH: number;
  /** Zawiesia: [skąd (null – hak), dokąd] w układzie elementu. */
  slings: [V3 | null, V3][];
  pickA: THREE.Vector3;
  pickQ: THREE.Quaternion;
  finA: THREE.Vector3;
  finQ: THREE.Quaternion;
  /** Przesunięcie przed ostatnim dosunięciem (piasta na wał, łopata do łożyska). */
  pre: THREE.Vector3;
  /** Wysokość przelotu punktu nośnego. */
  fly: number;
  /** Długość segmentu wieży (tylko segmenty). */
  L: number;
  phases: [Ph, number][];
}

/* ---------- plan placu ---------- */

const SEC_TOP_X = 40;
const secZ = (i: number) => -34 - 8 * i;
const secR = (i: number) => towerR(T.flanges[i]);
const secH0 = (i: number) => secR(i) + 0.55;
const NAC_AT: V3 = [-8, 0.9, -40];
const HUB_AT: V3 = [14, 0, -44];
const HUB_STAND = 0.9;
const BLADE_ROOT_X = -8;
const bladeZ = (i: number) => 24 + 8 * i;
const BLADE_Y = 2.9;
const BLADE_PICK_Q = qAx(0, 1, 0, -Math.PI / 2).multiply(BLADE_Q.clone());

function makeParts(): Part[] {
  const out: Part[] = [];
  const I = new THREE.Quaternion();
  for (let i = 0; i < 5; i++) {
    const y0 = T.flanges[i];
    const y1 = T.flanges[i + 1];
    const L = y1 - y0;
    const rt = towerR(y1);
    const a50 = 50 * (Math.PI / 180);
    out.push({
      id: `sec${i}`,
      kind: 'sec',
      n: i,
      anchor: new THREE.Vector3(0, L / 2, 0),
      hookH: 4.5,
      slings: [
        [null, [rt * Math.cos(a50), L / 2, rt * Math.sin(a50)]],
        [null, [rt * Math.cos(a50), L / 2, -rt * Math.sin(a50)]],
      ],
      pickA: new THREE.Vector3(SEC_TOP_X, secH0(i), secZ(i)),
      pickQ: qAx(0, 0, 1, Math.PI / 2),
      finA: new THREE.Vector3(0, y1, 0),
      finQ: I.clone(),
      pre: new THREE.Vector3(),
      fly: y1 + 5,
      L,
      phases: [
        ['travel', i === 0 ? 1.2 : 2.2],
        ['rig', 0.6],
        ['upend', 3.0],
        ['free', 0.5],
        ['lift', 1.8],
        ['swing', 2.4],
        ['lower', 1.8],
        ['bolt', 1.0],
      ],
    });
  }
  // gondola na trawersie
  const roof = 4.45;
  const beamY = roof + 3.4;
  out.push({
    id: 'nac',
    kind: 'nac',
    n: 0,
    anchor: new THREE.Vector3(-2, roof, 0),
    hookH: 9.5,
    slings: [
      [null, [-6.5, beamY, 0]],
      [null, [2.5, beamY, 0]],
      [[-6.5, beamY, 0], [-6.5, roof, 1.35]],
      [[-6.5, beamY, 0], [-6.5, roof, -1.35]],
      [[2.5, beamY, 0], [2.5, roof, 1.35]],
      [[2.5, beamY, 0], [2.5, roof, -1.35]],
    ],
    pickA: new THREE.Vector3(NAC_AT[0] - 2, NAC_AT[1] + roof, NAC_AT[2]),
    pickQ: I.clone(),
    finA: new THREE.Vector3(-2, T.towerH + roof, 0),
    finQ: I.clone(),
    pre: new THREE.Vector3(),
    fly: T.towerH + roof + 6,
    L: 0,
    phases: [
      ['travel', 3.0],
      ['rig', 0.8],
      ['lift', 2.6],
      ['swing', 2.8],
      ['lower', 2.0],
      ['bolt', 1.2],
    ],
  });
  // piasta z kołpakiem
  out.push({
    id: 'hub',
    kind: 'hub',
    n: 0,
    anchor: new THREE.Vector3(0, 0, 0),
    hookH: 7,
    slings: [
      [null, [0, 1.9, 0.9]],
      [null, [0, 1.9, -0.9]],
    ],
    pickA: new THREE.Vector3(HUB_AT[0], HUB_STAND + 1.95, HUB_AT[2]),
    pickQ: qAx(0, 1, 0, Math.PI / 2).multiply(qAx(0, 0, 1, -T.tilt)),
    finA: new THREE.Vector3(...HUB),
    finQ: I.clone(),
    pre: new THREE.Vector3(4.5, 4.5 * Math.tan(T.tilt), 0),
    fly: HUB[1] + 6,
    L: 0,
    phases: [
      ['travel', 2.6],
      ['rig', 0.6],
      ['lift', 2.2],
      ['swing', 2.4],
      ['lower', 1.4],
      ['insert', 1.6],
      ['bolt', 1.0],
    ],
  });
  // łopaty w chwytaku
  const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(BLADE_Q);
  for (let i = 0; i < 3; i++) {
    const anchor = new THREE.Vector3(0, BLADE_COG, 0);
    const rootW = new THREE.Vector3(BLADE_ROOT_X, BLADE_Y, bladeZ(i));
    const origin = rootW.clone().sub(new THREE.Vector3(0, T.rootR, 0).applyQuaternion(BLADE_PICK_Q));
    const top = YOKE.top + 0.4;
    out.push({
      id: `blade${i}`,
      kind: 'blade',
      n: i,
      anchor,
      hookH: 8,
      slings: [
        [null, [0, BLADE_COG - 4, UPZ * top]],
        [null, [0, BLADE_COG + 4, UPZ * top]],
      ],
      pickA: origin.clone().add(anchor.clone().applyQuaternion(BLADE_PICK_Q)),
      pickQ: BLADE_PICK_Q.clone(),
      finA: new THREE.Vector3(...HUB).add(anchor.clone().applyQuaternion(BLADE_Q)),
      finQ: BLADE_Q.clone(),
      pre: dir.clone().multiplyScalar(4.5),
      fly: HUB[1] + 8,
      L: 0,
      phases: [
        ['travel', i === 0 ? 3.2 : 3.6],
        ['rig', 0.9],
        ['lift', 2.4],
        ['swing', 3.4],
        ['lower', 1.4],
        ['insert', 1.8],
        ['bolt', 1.1],
      ],
    });
  }
  return out;
}

interface Sched {
  p: Part;
  ph: { n: Ph; a: number; b: number }[];
  t0: number;
  t1: number;
}
const SCHED: Sched[] = (() => {
  let t = 1;
  return makeParts().map((p) => {
    const t0 = t;
    const ph = p.phases.map(([n, d]) => {
      const r = { n, a: t, b: t + d };
      t += d;
      return r;
    });
    return { p, ph, t0, t1: t };
  });
})();
const T_END = SCHED[SCHED.length - 1].t1;
/** Czas całego montażu (s, w czasie sceny). */
export const BUILD_T = (T_END + 2) / SPEED;

/* ---------- etapy dla panelu ---------- */

export const BUILD_STAGES = ['Wieża – 5 segmentów', 'Gondola', 'Piasta z kołpakiem', 'Łopaty – 3 sztuki', 'Podłączenie i próby'];

const STAGE_OF: Record<Kind, number> = { sec: 0, nac: 1, hub: 2, blade: 3 };

/** Bieżący etap i opis tego, co się dzieje (t – czas sceny od „Rozpocznij”). */
export function buildStatus(t0: number): { stage: number; text: string } {
  const t = t0 * SPEED;
  if (t < SCHED[0].t0) return { stage: 0, text: 'Plac montażowy gotowy – części czekają na podkładach' };
  if (t >= T_END) return { stage: 4, text: 'Turbina zmontowana – zostało podłączenie kabli i próby' };
  const s = SCHED.find((x) => t < x.t1)!;
  const f = s.ph.find((x) => t < x.b)!.n;
  const p = s.p;
  const stage = STAGE_OF[p.kind];
  if (p.kind === 'sec') {
    const k = `segment ${p.n + 1} z 5`;
    if (f === 'travel' || f === 'rig') return { stage, text: `Montażyści zaczepiają zawiesia – ${k}` };
    if (f === 'upend' || f === 'free') return { stage, text: `Dwa dźwigi stawiają do pionu ${k} – mały trzyma dolny koniec` };
    if (f === 'bolt') return { stage, text: `Skręcanie kołnierza – ok. 120 śrub (${k})` };
    return { stage, text: `${k[0].toUpperCase()}${k.slice(1)} jedzie na wieżę – lina z ziemi nie daje mu się obracać` };
  }
  if (p.kind === 'nac') {
    if (f === 'travel' || f === 'rig') return { stage, text: 'Gondola (ok. 120 t) zawieszona na trawersie' };
    if (f === 'bolt') return { stage, text: 'Skręcanie gondoli z łożyskiem na szczycie wieży' };
    return { stage, text: 'Gondola wędruje na wysokość 118 m' };
  }
  if (p.kind === 'hub') {
    if (f === 'travel' || f === 'rig') return { stage, text: 'Piasta z kołpakiem (ok. 50 t) na zawiesiach' };
    if (f === 'insert') return { stage, text: 'Piasta nasuwa się na wał gondoli' };
    if (f === 'bolt') return { stage, text: 'Skręcanie piasty z wałem' };
    return { stage, text: 'Piasta w drodze na szczyt' };
  }
  const k = `łopata ${p.n + 1} z 3`;
  if (f === 'travel') return { stage, text: p.n > 0 ? 'Wirnik obraca się o 120° – następne gniazdo staje poziomo' : `Chwytak jedzie po pierwszą łopatę` };
  if (f === 'rig') return { stage, text: `Chwytak obejmuje ${k.replace('łopata', 'łopatę')} w środku ciężkości` };
  if (f === 'insert') return { stage, text: `Śruby nasady wchodzą w łożysko łopaty – ${k}` };
  if (f === 'bolt') return { stage, text: `Skręcanie – ${k}` };
  return { stage, text: `${k[0].toUpperCase()}${k.slice(1)} w górę – dwie liny z ziemi prowadzą ją na wietrze` };
}

/* ---------- położenie elementu w czasie ---------- */

const polar = (p: THREE.Vector3): [number, number] => [Math.atan2(-(p.z - C.z), p.x - C.x), Math.hypot(p.x - C.x, p.z - C.z)];
function unwrap(a: number, ref: number) {
  while (a - ref > Math.PI) a -= 2 * Math.PI;
  while (a - ref < -Math.PI) a += 2 * Math.PI;
  return a;
}
/** Przejście wokół dźwigu (obrót nadwozia i zmiana wysięgu), wysokość liniowo. */
function polarMix(A: THREE.Vector3, B: THREE.Vector3, k: number, out: THREE.Vector3) {
  const [a0, r0] = polar(A);
  const [a1, r1] = polar(B);
  const a = mix(a0, unwrap(a1, a0), k);
  const r = mix(r0, r1, k);
  return out.set(C.x + Math.cos(a) * r, mix(A.y, B.y, k), C.z - Math.sin(a) * r);
}

interface Pose {
  a: THREE.Vector3;
  q: THREE.Quaternion;
  ph: Ph | 'wait' | 'done';
  k: number;
}
const I_Q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

function poseAt(s: Sched, t: number, out: Pose) {
  const p = s.p;
  if (t < s.t0) {
    out.a.copy(p.pickA);
    out.q.copy(p.pickQ);
    out.ph = 'wait';
    out.k = 0;
    return out;
  }
  if (t >= s.t1) {
    out.a.copy(p.finA);
    out.q.copy(p.finQ);
    out.ph = 'done';
    out.k = 1;
    return out;
  }
  const f = s.ph.find((x) => t < x.b)!;
  const k = clamp((t - f.a) / (f.b - f.a));
  const e = ss(k);
  out.ph = f.n;
  out.k = k;
  const sec = p.kind === 'sec';
  // punkt startu przelotu: segment już w pionie, reszta prosto z placu
  const start = sec ? _v.set(p.pickA.x, p.pickA.y + p.L, p.pickA.z) : _v.copy(p.pickA);
  const startQ = sec ? I_Q : p.pickQ;
  switch (f.n) {
    case 'travel':
    case 'rig':
      out.a.copy(p.pickA);
      out.q.copy(p.pickQ);
      break;
    case 'upend': {
      // górny koniec idzie pionowo w górę, dolny sunie po ziemi do niego (trzyma go mały dźwig)
      const th = e * (Math.PI / 2);
      out.q.setFromAxisAngle(_w.set(0, 0, 1), Math.PI / 2 - th);
      out.a.set(p.pickA.x, p.pickA.y + p.L * Math.sin(th), p.pickA.z);
      break;
    }
    case 'free':
      out.a.copy(start);
      out.q.copy(startQ);
      break;
    case 'lift':
      out.a.copy(start).lerp(_w.set(start.x, p.fly, start.z), e);
      out.q.copy(startQ);
      break;
    case 'swing': {
      const A = _w.set(start.x, p.fly, start.z).clone();
      const B = new THREE.Vector3(p.finA.x + p.pre.x, p.fly, p.finA.z + p.pre.z);
      polarMix(A, B, e, out.a);
      out.q.copy(startQ).slerp(p.finQ, e);
      break;
    }
    case 'lower': {
      const A = _w.set(p.finA.x + p.pre.x, p.fly, p.finA.z + p.pre.z);
      out.a.copy(A).lerp(_v.copy(p.finA).add(p.pre), e);
      out.q.copy(p.finQ);
      break;
    }
    case 'insert':
      out.a.copy(p.finA).add(p.pre).lerp(p.finA, e);
      out.q.copy(p.finQ);
      break;
    case 'bolt':
      out.a.copy(p.finA);
      out.q.copy(p.finQ);
      break;
  }
  return out;
}

/** Hak nad punktem nośnym. */
const hookOf = (p: Part, a: THREE.Vector3, out: THREE.Vector3) => out.set(a.x, a.y + p.hookH, a.z);

/* ---------- linie (liny, zawiesia) ---------- */

class Segs {
  obj: THREE.LineSegments;
  private arr: Float32Array;
  private n = 0;
  constructor(
    private max: number,
    color: string,
  ) {
    this.arr = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.arr, 3));
    this.obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
    this.obj.frustumCulled = false;
  }
  begin() {
    this.n = 0;
  }
  add(a: THREE.Vector3, b: THREE.Vector3) {
    if (this.n >= this.max) return;
    this.arr.set([a.x, a.y, a.z, b.x, b.y, b.z], this.n * 6);
    this.n++;
  }
  end() {
    this.obj.geometry.setDrawRange(0, this.n * 2);
    (this.obj.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

/* ---------- materiały placu ---------- */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const M = {
  gravel: std('#c2baa4', { roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  gravelDark: std('#a9a18b', { roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
  wood: std('#8a6440', { roughness: 0.9 }),
  mat: std('#6e5235', { roughness: 0.95 }),
  red: std('#cf3b2c', { roughness: 0.5 }),
  white: std('#f1f1ee', { roughness: 0.6 }),
  blue: std('#2f5d8a', { roughness: 0.6 }),
  vest: std('#ff7a1a', { roughness: 0.7 }),
  pants: std('#2b3440'),
  skin: std('#d9a882'),
  tire: std('#1c1f23', { roughness: 0.95 }),
  ring: new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false }),
};

function Box({ p, s, m, r }: { p: V3; s: V3; m: THREE.Material; r?: V3 }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}

/** Kratownica wzdłuż +y (długość len, szerokość od w0 do w1). */
function lattice(len: number, w0: number, w1: number, n: number): [V3, V3][] {
  const list: [V3, V3][] = [];
  const corner = (k: number, c: number): V3 => {
    const w = mix(w0, w1, k);
    return [(c & 1 ? 1 : -1) * w, k * len, (c & 2 ? 1 : -1) * w];
  };
  for (let c = 0; c < 4; c++) list.push([corner(0, c), corner(1, c)]);
  const order = [0, 1, 3, 2];
  for (let i = 0; i < n; i++) {
    const k0 = i / n;
    const k1 = (i + 1) / n;
    for (let s = 0; s < 4; s++) {
      const a = order[s];
      const b = order[(s + 1) % 4];
      list.push([corner(k0, a), corner(k1, b)]);
      list.push([corner(k1, a), corner(k1, b)]);
    }
  }
  return list;
}

/* ---------- duży dźwig gąsienicowy ---------- */

const BOOM_L = 166;
const PIV = new THREE.Vector3(3.4, 5.8, 0);
/** Szczyt masztu derrick (w układzie nadwozia). */
const MAST_TOP = new THREE.Vector3(-15, 44, 0);
const MAST_FOOT = new THREE.Vector3(-1.5, 5.8, 0);
const TRAY: V3 = [-21, 2.2, 0];

function MainCrane({ hook }: { hook: React.MutableRefObject<THREE.Vector3> }) {
  const boomRods = useMemo(() => lattice(BOOM_L, 1.7, 0.9, 46), []);
  const mastLen = MAST_TOP.distanceTo(MAST_FOOT);
  const mastRods = useMemo(() => lattice(mastLen, 1.1, 0.7, 12), [mastLen]);
  const mastQ = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, MAST_TOP.clone().sub(MAST_FOOT).normalize()), []);
  const upper = useRef<THREE.Group>(null);
  const boom = useRef<THREE.Group>(null);
  const block = useRef<THREE.Group>(null);
  const local = useMemo(() => new Segs(8, '#2a2f35'), []);
  const ropes = useMemo(() => new Segs(4, '#2a2f35'), []);
  const v = useMemo(() => ({ tip: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), side: new THREE.Vector3() }), []);
  useFrame(() => {
    const h = hook.current;
    const dx = h.x - C.x;
    const dz = h.z - C.z;
    const slew = Math.atan2(-dz, dx);
    const reach = Math.max(16, Math.hypot(dx, dz));
    const luff = Math.acos(clamp((reach - PIV.x) / BOOM_L, 0.05, 0.99));
    if (upper.current) upper.current.rotation.y = slew;
    if (boom.current) boom.current.rotation.z = -(Math.PI / 2 - luff);
    const tx = PIV.x + BOOM_L * Math.cos(luff);
    const ty = PIV.y + BOOM_L * Math.sin(luff);
    // odciągi w układzie nadwozia
    local.begin();
    for (const z of [-0.8, 0.8]) {
      local.add(v.a.set(MAST_TOP.x, MAST_TOP.y, z), v.b.set(tx - 0.5, ty + 0.6, z));
      local.add(v.a.set(MAST_TOP.x, MAST_TOP.y, z), v.b.set(TRAY[0], TRAY[1] + 1.4, z * 2.5));
    }
    local.end();
    // liny nośne od głowicy do zblocza
    v.tip.set(C.x + Math.cos(slew) * tx, ty, C.z - Math.sin(slew) * tx);
    v.side.set(Math.sin(slew), 0, Math.cos(slew)).multiplyScalar(0.35);
    ropes.begin();
    for (const s of [-1, 1]) ropes.add(v.a.copy(v.tip).addScaledVector(v.side, s), v.b.copy(h).addScaledVector(v.side, s).setY(h.y + 3.3));
    ropes.end();
    if (block.current) {
      block.current.position.copy(h);
      block.current.rotation.y = slew;
    }
  });
  return (
    <group>
      <group position={CRANE_AT}>
        {/* maty drewniane pod gąsienicami */}
        {Array.from({ length: 11 }, (_, i) => (
          <Box key={i} p={[-7.5 + i * 1.5, 0.14, 0]} s={[1.3, 0.28, 13]} m={M.mat} />
        ))}
        {/* gąsienice */}
        {[-4.3, 4.3].map((z) => (
          <group key={z}>
            <Box p={[0, 1.4, z]} s={[12.6, 2.2, 1.9]} m={MAT.rubber} />
            <Box p={[0, 1.5, z + Math.sign(z) * 1.0]} s={[10.4, 1.2, 0.2]} m={MAT.yellow} />
            {[-5.3, 5.3].map((x) => (
              <mesh key={x} position={[x, 1.4, z]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steelDark}>
                <cylinderGeometry args={[1.05, 1.05, 2.0, 16]} />
              </mesh>
            ))}
          </group>
        ))}
        <Box p={[0, 2.5, 0]} s={[6.4, 1.4, 7]} m={MAT.steelDark} />
        <mesh position={[0, 3.4, 0]} material={MAT.steel}>
          <cylinderGeometry args={[2.8, 2.8, 0.5, 32]} />
        </mesh>
        <group ref={upper}>
          {/* nadwozie: rama, kabina, maszynownia, przeciwwaga */}
          <Box p={[-1.8, 4.3, 0]} s={[12, 1.2, 5.6]} m={MAT.yellow} />
          <Box p={[-4.5, 6.0, -1.2]} s={[5, 2.2, 3]} m={MAT.yellow} />
          <Box p={[3.9, 5.6, 2.4]} s={[2.4, 2.4, 1.5]} m={MAT.yellow} />
          <Box p={[5.15, 5.9, 2.4]} s={[0.1, 1.6, 1.3]} m={MAT.glass} />
          {Array.from({ length: 5 }, (_, i) => (
            <Box key={i} p={[-8.6, 5.3 + i * 0.95, 0]} s={[2.6, 0.85, 6]} m={MAT.steelDark} />
          ))}
          {/* maszt derrick */}
          <group position={MAST_FOOT} quaternion={mastQ}>
            <Rods list={mastRods} r={0.13} m={MAT.yellow} />
          </group>
          {/* wózek przeciwwagi superlift */}
          <Box p={TRAY} s={[5, 2.8, 8]} m={MAT.steelDark} />
          <Box p={[TRAY[0], 0.5, 0]} s={[5.4, 1.0, 8.4]} m={MAT.rubber} />
          <primitive object={local.obj} />
          {/* wysięgnik */}
          <group ref={boom} position={PIV}>
            <Rods list={boomRods} r={0.17} m={MAT.yellow} />
            <Box p={[0, BOOM_L + 0.6, 0]} s={[2.6, 2.2, 2.4]} m={MAT.yellow} />
            {[-0.5, 0.5].map((z) => (
              <mesh key={z} position={[0.9, BOOM_L + 0.8, z]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steel}>
                <cylinderGeometry args={[1.0, 1.0, 0.25, 20]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
      <primitive object={ropes.obj} />
      {/* zblocze z hakiem */}
      <group ref={block}>
        <Box p={[0, 3.3, 0]} s={[1.2, 2.4, 1.8]} m={MAT.yellow} />
        {[-0.35, 0.35].map((z) => (
          <mesh key={z} position={[0, 4.1, z]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steel}>
            <cylinderGeometry args={[0.75, 0.75, 0.2, 18]} />
          </mesh>
        ))}
        <mesh position={[0, 1.4, 0]} material={MAT.steelDark}>
          <cylinderGeometry args={[0.18, 0.18, 1.6, 8]} />
        </mesh>
        <mesh position={[0, 0.35, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.steelDark}>
          <torusGeometry args={[0.4, 0.13, 8, 14, Math.PI * 1.5]} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- mały dźwig samojezdny (pomocniczy) ---------- */

const TP = new THREE.Vector3(1.4, 2.2, 0);
const TB_SEG = 12;

function TailCrane({ hook }: { hook: React.MutableRefObject<THREE.Vector3> }) {
  const upper = useRef<THREE.Group>(null);
  const boom = useRef<THREE.Group>(null);
  const segs = useRef<(THREE.Mesh | null)[]>([]);
  const block = useRef<THREE.Group>(null);
  const rope = useMemo(() => new Segs(2, '#2a2f35'), []);
  const v = useMemo(() => ({ tip: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() }), []);
  const base = 3.4;
  useFrame(() => {
    const h = hook.current;
    const dx = h.x - TAIL_AT[0];
    const dz = h.z - TAIL_AT[2];
    const slew = Math.atan2(-dz, dx);
    const d = Math.max(4, Math.hypot(dx, dz) - TP.x);
    const up = h.y + 6 - (base + TP.y);
    const L = clamp(Math.hypot(d, up), TB_SEG + 1, 62);
    const ang = Math.atan2(up, d);
    if (upper.current) upper.current.rotation.y = slew;
    if (boom.current) boom.current.rotation.z = ang;
    segs.current.forEach((m, i) => {
      if (m) m.position.x = (i * (L - TB_SEG)) / 3 + TB_SEG / 2;
    });
    const tx = TP.x + L * Math.cos(ang);
    const ty = base + TP.y + L * Math.sin(ang);
    v.tip.set(TAIL_AT[0] + Math.cos(slew) * tx, ty, TAIL_AT[2] - Math.sin(slew) * tx);
    rope.begin();
    rope.add(v.a.copy(v.tip), v.b.copy(h).setY(h.y + 1.6));
    rope.end();
    if (block.current) block.current.position.copy(h);
  });
  return (
    <group>
      <group position={TAIL_AT}>
        {/* podwozie wzdłuż z: kabina kierowcy, osie, podpory */}
        <group rotation={[0, Math.PI / 2, 0]}>
          <Box p={[0, 1.9, 0]} s={[15, 1.4, 2.8]} m={M.red} />
          <Box p={[7.9, 2.2, 0.6]} s={[1.6, 2.0, 1.4]} m={M.red} />
          <Box p={[8.6, 2.5, 0.6]} s={[0.1, 1.2, 1.2]} m={MAT.glass} />
          {[-5.5, -3.8, -2.1, 3.4, 5.1].map((x) =>
            [-1.25, 1.25].map((z) => (
              <mesh key={`${x}${z}`} position={[x, 0.7, z]} rotation={[Math.PI / 2, 0, 0]} material={M.tire}>
                <cylinderGeometry args={[0.7, 0.7, 0.6, 16]} />
              </mesh>
            )),
          )}
          {[-6.2, 6.2].map((x) =>
            [-1, 1].map((s) => (
              <group key={`${x}${s}`}>
                <Box p={[x, 1.4, s * 2.9]} s={[0.5, 0.5, 3.2]} m={M.red} />
                <Box p={[x, 0.6, s * 4.4]} s={[0.35, 1.2, 0.35]} m={MAT.steelDark} />
                <Box p={[x, 0.08, s * 4.4]} s={[1.4, 0.16, 1.4]} m={M.mat} />
              </group>
            )),
          )}
        </group>
        <group ref={upper} position={[0, base, 0]}>
          <Box p={[-1.0, 0.5, 0]} s={[6, 1.1, 2.6]} m={M.red} />
          <Box p={[-3.6, 1.4, 0]} s={[1.6, 1.4, 2.6]} m={MAT.steelDark} />
          <Box p={[1.2, 1.4, 1.0]} s={[1.6, 1.6, 0.9]} m={M.red} />
          <group ref={boom} position={TP}>
            {[0, 1, 2, 3].map((i) => (
              <mesh key={i} ref={(m) => (segs.current[i] = m)} material={i % 2 ? MAT.yellow : M.white}>
                <boxGeometry args={[TB_SEG, 1.5 - i * 0.22, 1.1 - i * 0.16]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
      <primitive object={rope.obj} />
      <group ref={block}>
        <Box p={[0, 1.6, 0]} s={[0.6, 1.2, 0.8]} m={MAT.yellow} />
        <mesh position={[0, 0.3, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.steelDark}>
          <torusGeometry args={[0.28, 0.09, 8, 12, Math.PI * 1.5]} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- ludzie, plac ---------- */

function Worker() {
  return (
    <group>
      <Box p={[0, 0.45, 0]} s={[0.38, 0.9, 0.26]} m={M.pants} />
      <Box p={[0, 1.22, 0]} s={[0.46, 0.66, 0.3]} m={M.vest} />
      <mesh position={[0, 1.7, 0]} material={M.skin}>
        <sphereGeometry args={[0.13, 10, 8]} />
      </mesh>
      <mesh position={[0, 1.76, 0]} material={M.white}>
        <sphereGeometry args={[0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  );
}

/** Utwardzone place pod części (prostokąty x0, z0, x1, z1). */
const YARD: [number, number, number, number, boolean][] = [
  [32, -74, 96, -26, false],
  [-26, -52, 22, -28, false],
  [-90, 16, 2, 48, false],
  [8, -32, 52, 6, true],
];

function Yard() {
  return (
    <group>
      {YARD.map(([x0, z0, x1, z1, dark], i) => (
        <mesh key={i} position={[(x0 + x1) / 2, 0.04, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={dark ? M.gravelDark : M.gravel}>
          <planeGeometry args={[x1 - x0, z1 - z0]} />
        </mesh>
      ))}
      {/* podkłady pod segmentami wieży */}
      {[0, 1, 2, 3, 4].map((i) => {
        const L = T.flanges[i + 1] - T.flanges[i];
        const h0 = secH0(i);
        return [SEC_TOP_X + 2.5, SEC_TOP_X + L - 2.5].map((x, j) => {
          const r = towerR(T.flanges[i] + (j ? 2.5 : L - 2.5));
          const h = Math.max(0.3, h0 - r);
          return <Box key={`${i}${j}`} p={[x, h / 2, secZ(i)]} s={[1.4, h, 3.6]} m={M.wood} />;
        })
      })}
      {/* rama transportowa gondoli */}
      {[-1.6, 1.6].map((z) => (
        <Box key={z} p={[NAC_AT[0] - 2.2, 0.45, NAC_AT[2] + z]} s={[11, 0.9, 0.7]} m={MAT.steelDark} />
      ))}
      {/* stojak piasty */}
      <Box p={[HUB_AT[0], HUB_STAND / 2, HUB_AT[2]]} s={[3.2, HUB_STAND, 3.2]} m={MAT.steelDark} />
      {/* stojaki łopat: przy nasadzie i podpora pod końcem */}
      {[0, 1, 2].map((i) => (
        <group key={i}>
          <Box p={[BLADE_ROOT_X - 0.6, 0.6, bladeZ(i)]} s={[1.0, 1.2, 4]} m={MAT.steelDark} />
          <Box p={[BLADE_ROOT_X - 46, (BLADE_Y - 0.9) / 2, bladeZ(i)]} s={[1.2, BLADE_Y - 0.9, 3]} m={M.wood} />
        </group>
      ))}
      {/* kontenery biurowe i ciężarówka z naczepą */}
      {[0, 1].map((i) => (
        <group key={i} position={[46, 0, 14 + i * 3]}>
          <Box p={[0, 1.35, 0]} s={[6, 2.7, 2.5]} m={M.white} />
          <Box p={[0, 2.75, 0]} s={[6.1, 0.12, 2.6]} m={M.blue} />
          <Box p={[3.01, 1.5, 0.5]} s={[0.05, 1.0, 0.8]} m={MAT.glass} />
        </group>
      ))}
      <group position={[18, 0, 30]}>
        <Box p={[0, 1.9, 0]} s={[2.6, 2.6, 2.4]} m={MAT.cabinet} />
        <Box p={[0, 2.4, 1.21]} s={[2.2, 1.0, 0.05]} m={MAT.glass} />
        <Box p={[0, 0.95, -9]} s={[2.4, 0.5, 15]} m={MAT.steelDark} />
        {[-1.1, 1.1].map((x) =>
          [0.4, -12, -13.4].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 0.5, z]} rotation={[0, 0, Math.PI / 2]} material={M.tire}>
              <cylinderGeometry args={[0.5, 0.5, 0.45, 14]} />
            </mesh>
          )),
        )}
      </group>
    </group>
  );
}

/* ---------- scena montażu ---------- */

/** Robotnicy stojący na stałe (u stóp wieży, na placu). */
const STATIC_WORKERS: [number, number, number][] = [
  [4, 0, 4.5],
  [-3.5, 0, 4],
  [36, 0, -30],
  [12, 0, -40],
  [-4, 0, 21],
];

export function BuildSite({ time, st }: { time: () => number; st: TurbineState }) {
  const rotorSt = useMemo<TurbineState>(() => ({ ...st, angle: slotAngle(0), pitch: 0 }), [st]);
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const extras = useRef<Record<string, THREE.Object3D | null>>({});
  const mounted = useRef<(THREE.Group | null)[]>([]);
  const flyBlade = useRef<(THREE.Group | null)[]>([]);
  const hookM = useRef(new THREE.Vector3(...SCHED[0].p.pickA.toArray()).add(new THREE.Vector3(0, 18, 0)));
  const hookT = useRef(new THREE.Vector3(TAIL_AT[0] - 10, 12, TAIL_AT[2]));
  const slings = useMemo(() => new Segs(16, '#e4572e'), []);
  const tags = useMemo(() => new Segs(4, '#f2b632'), []);
  const ring = useRef<THREE.Mesh>(null);
  const taggers = useRef<(THREE.Group | null)[]>([]);
  const tmp = useMemo(
    () => ({
      pose: { a: new THREE.Vector3(), q: new THREE.Quaternion(), ph: 'wait' as Pose['ph'], k: 0 },
      prevHook: new THREE.Vector3(),
      nextHook: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      pos: new THREE.Vector3(),
    }),
    [],
  );
  const TAIL_REST = useMemo(() => new THREE.Vector3(TAIL_AT[0] - 12, 14, TAIL_AT[2]), []);

  useFrame(() => {
    const t = time() * SPEED;
    const P = tmp.pose;
    // obrót wirnika do gniazda kolejnej łopaty (w czasie dojazdu chwytaka)
    let rot = slotAngle(0);
    for (const s of SCHED) {
      if (s.p.kind !== 'blade' || s.p.n === 0) continue;
      const tr = s.ph[0];
      rot = mix(rot, slotAngle(s.p.n), ss(clamp((t - tr.a) / (tr.b - tr.a))));
    }
    rotorSt.angle = rot;

    const cur = SCHED.find((s) => t < s.t1) ?? null;
    slings.begin();
    tags.begin();
    let ringOn = false;
    let tailSet = false;
    const tagGround: THREE.Vector3[] = [];

    for (let si = 0; si < SCHED.length; si++) {
      const s = SCHED[si];
      const p = s.p;
      const g = groups.current[p.id];
      poseAt(s, t, P);
      // położenie elementu: punkt nośny minus obrócony punkt nośny w układzie elementu
      tmp.pos.copy(p.anchor).applyQuaternion(P.q);
      tmp.pos.subVectors(P.a, tmp.pos);
      if (g) {
        g.position.copy(tmp.pos);
        g.quaternion.copy(P.q);
      }
      const active = s === cur && P.ph !== 'wait' && P.ph !== 'travel';
      const ex = extras.current[p.id];
      if (ex) ex.visible = active;
      if (p.kind === 'blade') {
        const done = t >= s.t1;
        const fb = flyBlade.current[p.n];
        if (fb) fb.visible = !done;
        const mb = mounted.current[p.n];
        if (mb) {
          mb.visible = done;
          mb.rotation.x = rotorSt.angle + (p.n * 2 * Math.PI) / 3;
        }
      }
      if (s !== cur) continue;

      // hak dużego dźwigu
      if (P.ph === 'travel') {
        const prev = SCHED[si - 1];
        if (prev) hookOf(prev.p, prev.p.finA, tmp.prevHook).y += 2;
        else tmp.prevHook.copy(p.pickA).add(UP.clone().multiplyScalar(18));
        hookOf(p, p.pickA, tmp.nextHook);
        const e = ss(P.k);
        polarMix(tmp.prevHook, tmp.nextHook, e, hookM.current);
        hookM.current.y += Math.sin(Math.PI * P.k) * 6;
      } else {
        hookOf(p, P.a, hookM.current);
      }

      // zawiesia
      if (active) {
        for (const [from, to] of p.slings) {
          const A = from ? tmp.a.set(...from).applyQuaternion(P.q).add(tmp.pos) : tmp.a.copy(hookM.current);
          tmp.b.set(...to).applyQuaternion(P.q).add(tmp.pos);
          slings.add(A, tmp.b);
        }
      }

      // segment wieży: dolny koniec, mały dźwig, lina prowadząca
      if (p.kind === 'sec') {
        const rb = secR(p.n);
        const bottom = tmp.c.set(0, -p.L / 2, 0).applyQuaternion(P.q).add(tmp.pos);
        const tailHook = (out: THREE.Vector3) => out.copy(bottom).add(new THREE.Vector3(0, rb + 3.4, 0));
        if (P.ph === 'travel') {
          tailHook(tmp.b);
          hookT.current.copy(TAIL_REST).lerp(tmp.b, ss(P.k));
          tailSet = true;
        } else if (P.ph === 'rig' || P.ph === 'upend') {
          tailHook(hookT.current);
          tailSet = true;
          for (const zs of [-1, 1]) {
            tmp.b.set(rb * 0.9, -p.L / 2 + 0.3, zs * rb * 0.45).applyQuaternion(P.q).add(tmp.pos);
            slings.add(hookT.current, tmp.b);
          }
        } else if (P.ph === 'free') {
          tailHook(tmp.b);
          hookT.current.copy(tmp.b).lerp(TAIL_REST, ss(P.k));
          tailSet = true;
        }
        if (P.ph === 'lift' || P.ph === 'swing' || P.ph === 'lower') {
          tagGround.push(groundFor(bottom, tmp.b));
          tags.add(bottom, tagGround[tagGround.length - 1]);
        }
        if (P.ph === 'bolt') ringAt(ring.current, tmp.a.set(0, T.flanges[p.n] + 0.1, 0), UP, towerR(T.flanges[p.n]) + 0.15, P.k);
        ringOn ||= P.ph === 'bolt';
      }
      if (p.kind === 'nac') {
        if (P.ph === 'lift' || P.ph === 'swing' || P.ph === 'lower') {
          tmp.c.set(-9.4, 1.5, 0).applyQuaternion(P.q).add(tmp.pos);
          tagGround.push(groundFor(tmp.c, tmp.b));
          tags.add(tmp.c, tagGround[tagGround.length - 1]);
        }
        if (P.ph === 'bolt') ringAt(ring.current, tmp.a.set(0, T.towerH + 0.1, 0), UP, T.towerRt + 0.25, P.k);
        ringOn ||= P.ph === 'bolt';
      }
      if (p.kind === 'hub' && P.ph === 'bolt') {
        const ax = tmp.b.set(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), T.tilt);
        ringAt(ring.current, tmp.a.copy(p.finA).addScaledVector(ax, -1.6), ax, 1.45, P.k);
        ringOn = true;
      }
      if (p.kind === 'blade') {
        if (P.ph === 'lift' || P.ph === 'swing' || P.ph === 'lower' || P.ph === 'insert') {
          for (const sy of [T.rootR + 3, T.rootR + 52]) {
            const X = new THREE.Vector3(0, sy, 0).applyQuaternion(P.q).add(tmp.pos);
            const G = groundFor(X, new THREE.Vector3());
            tagGround.push(G);
            tags.add(X, G);
          }
        }
        if (P.ph === 'bolt') {
          const dir = tmp.b.set(0, 1, 0).applyQuaternion(P.q);
          ringAt(ring.current, tmp.a.copy(new THREE.Vector3(...HUB)).addScaledVector(dir, T.rootR + 0.1), dir.clone(), T.rootD / 2 + 0.15, P.k);
          ringOn = true;
        }
      }
    }
    if (!cur) {
      // koniec: hak podnosi się i odjeżdża nad plac
      const last = SCHED[SCHED.length - 1].p;
      hookOf(last, last.finA, tmp.prevHook);
      const k = ss(clamp((t - T_END) / 2));
      hookM.current.copy(tmp.prevHook).add(tmp.c.set(0, 12 * k, 0));
    }
    if (t < SCHED[0].t0) hookM.current.copy(SCHED[0].p.pickA).add(tmp.c.set(0, 18, 0));
    if (!tailSet) hookT.current.copy(TAIL_REST);
    slings.end();
    tags.end();
    if (ring.current) ring.current.visible = ringOn;
    // robotnicy przy linach prowadzących
    taggers.current.forEach((w, i) => {
      if (!w) return;
      const G = tagGround[i];
      w.visible = Boolean(G);
      if (G) {
        w.position.copy(G);
        w.lookAt(tmp.c.set(C.x, 0, C.z));
      }
    });
  });

  const reg = (id: string) => (g: THREE.Group | null) => {
    groups.current[id] = g;
  };
  const regEx = (id: string) => (g: THREE.Object3D | null) => {
    extras.current[id] = g;
  };
  const roof = 4.45;
  const yokeX = (YOKE.x0 + YOKE.x1) / 2;
  const yokeW = YOKE.x1 - YOKE.x0;
  return (
    <group>
      <Yard />
      <MainCrane hook={hookM} />
      <TailCrane hook={hookT} />
      {/* segmenty wieży */}
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} ref={reg(`sec${i}`)}>
          <group position={[0, -(T.flanges[i] + T.flanges[i + 1]) / 2, 0]}>
            <TowerSection i={i} />
          </group>
        </group>
      ))}
      {/* gondola z trawersem */}
      <group ref={reg('nac')}>
        <Nacelle st={st} noRotor />
        <group ref={regEx('nac')}>
          <Box p={[-2, roof + 3.4, 0]} s={[10, 0.55, 0.55]} m={MAT.yellow} />
        </group>
      </group>
      {/* piasta */}
      <group ref={reg('hub')}>
        <group rotation={[0, 0, T.tilt]}>
          <Rotor st={rotorSt} lod="high" blades={0} />
        </group>
      </group>
      {/* łopaty: w locie (z chwytakiem) i po zamocowaniu (obracają się z wirnikiem) */}
      {[0, 1, 2].map((i) => (
        <group key={i}>
          <group ref={reg(`blade${i}`)}>
            <group ref={(g) => (flyBlade.current[i] = g)}>
              <BladeMesh />
              <group ref={regEx(`blade${i}`)} position={[0, BLADE_COG, 0]}>
                <Box p={[yokeX, 0, UPZ * (YOKE.top + 0.2)]} s={[1.0, 9, 0.7]} m={MAT.yellow} />
                {[-3.2, 3.2].map((y) => (
                  <group key={y}>
                    <Box p={[yokeX, y, UPZ * (YOKE.top + 0.2)]} s={[yokeW + 1.4, 0.8, 0.6]} m={MAT.yellow} />
                    {[YOKE.x0 - 0.3, YOKE.x1 + 0.3].map((x) => (
                      <Box key={x} p={[x, y, UPZ * (YOKE.top - 1.6)]} s={[0.4, 1.4, 3.6]} m={MAT.yellow} />
                    ))}
                  </group>
                ))}
              </group>
            </group>
          </group>
          <group position={HUB} rotation={[0, 0, T.tilt]}>
            <group ref={(g) => (mounted.current[i] = g)} visible={false}>
              <group rotation={[0, 0, -T.cone]}>
                <BladeMesh />
              </group>
            </group>
          </group>
        </group>
      ))}
      <primitive object={slings.obj} />
      <primitive object={tags.obj} />
      {/* skręcanie kołnierza – pulsujący pierścień */}
      <mesh ref={ring} material={M.ring} visible={false} renderOrder={5}>
        <torusGeometry args={[1, 0.06, 8, 64]} />
      </mesh>
      {STATIC_WORKERS.map((p, i) => (
        <group key={i} position={p} rotation={[0, i * 1.3, 0]}>
          <Worker />
        </group>
      ))}
      {[0, 1].map((i) => (
        <group key={i} ref={(g) => (taggers.current[i] = g)} visible={false}>
          <Worker />
        </group>
      ))}
      {/* cokół fundamentu */}
      <mesh position={[0, 0.15, 0]} material={MAT.concrete}>
        <cylinderGeometry args={[3.3, 3.5, 0.6, 48]} />
      </mesh>
    </group>
  );
}

/** Miejsce na ziemi, gdzie stoi montażysta z liną prowadzącą (z dala od dźwigu). */
function groundFor(X: THREE.Vector3, out: THREE.Vector3) {
  const dx = X.x - C.x;
  const dz = X.z - C.z;
  const d = Math.hypot(dx, dz) || 1;
  const far = 18 + X.y * 0.12;
  return out.set(X.x + (dx / d) * far, 0, X.z + (dz / d) * far).clone();
}

/** Pierścień w płaszczyźnie prostopadłej do osi `axis`, pulsuje w czasie skręcania. */
function ringAt(m: THREE.Mesh | null, at: THREE.Vector3, axis: THREE.Vector3, r: number, k: number) {
  if (!m) return;
  m.position.copy(at);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().normalize());
  const s = r * (1 + 0.05 * Math.sin(k * Math.PI * 6));
  m.scale.set(s, s, s * 2);
  (m.material as THREE.MeshBasicMaterial).opacity = 0.95 * Math.sin(Math.PI * clamp(k * 1.1));
}
