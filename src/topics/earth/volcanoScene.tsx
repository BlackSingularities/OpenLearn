/*
 * Wulkan – wspólna scena 3D wszystkich zakładek tematu: teren (dziesięć rodzajów wulkanów, płynne przejścia między
 * nimi), przekrój (pół wulkanu zdjęte – widać komorę magmową, komin i warstwy), woda i lód, erupcje, gablota
 * z próbkami skał, makieta płyt tektonicznych, przyrządy do obserwacji i życie przy wulkanie.
 */
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Params, SceneProps } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { useModuleHome, useTopicNav } from '../../lib/topicNav';
import { PauseContext } from '../../lib/useAnimationClock';
import { Lbl } from '../aviation/airliner';
import {
  CAL_CONE,
  DEPTH,
  FISSURE_CONES,
  FISSURE_L,
  PARASITE,
  R_TERRAIN,
  baseLevel,
  clamp,
  fbm,
  geoColor,
  hasSea,
  hex,
  iceH,
  lakesOf,
  mix,
  plumbingOf,
  rockH,
  sm,
  surfColor,
  waterH,
  type Plumbing,
  type VType,
} from './volcanoGeo';
import { Flow, Puffs, Rocks, rnd, upCone, type FlowKind, type PuffSys, type RockSys, type V3 } from './volcanoFx';
import { AshPlane, Instruments, LifeFeatures, Samples, Tectonics, VeiCube, Village, MON_STATIONS } from './volcanoExtras';

/* ================= parametry ================= */

const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
export type Mode = string;

/** Kształt terenu w danej chwili: przejście między rodzajami (a → b, postęp k) i odkształcenia. */
interface Shape {
  a: VType;
  b: VType;
  k: number;
  /** Wytopienie lodu nad otworem (wulkan pod lodowcem). */
  melt: number;
  /** Wypiętrzenie szczytu przez napływającą magmę (przesadzone). */
  infl: number;
  /** Wzrost stratowulkanu (0 – zaczątek, 1 – dziś). */
  grow: number;
  /** Numer wersji – zmienia się przy każdej zmianie kształtu. */
  ver: number;
}
const ease = (k: number) => k * k * (3 - 2 * k);

function rockOf(s: Shape, t: VType, x: number, z: number) {
  let h = rockH(t, x, z);
  if (s.grow < 1 && t === 'strato') {
    const b = baseLevel(t);
    const r = Math.hypot(x, z);
    h = b + (h - b) * s.grow * sm(48 * Math.sqrt(s.grow) + 4, 48 * Math.sqrt(s.grow) - 4, r) + 0.9 * fbm(x * 0.025 + 3, z * 0.025 - 7) * sm(30, 70, r);
  }
  if (s.infl) h += s.infl * 2.2 * Math.exp(-((Math.hypot(x, z) / 20) ** 2));
  return h;
}
/** Wysokość skały w kształcie przejściowym. */
const rockS = (s: Shape, x: number, z: number) => (s.k >= 1 ? rockOf(s, s.b, x, z) : mix(rockOf(s, s.a, x, z), rockOf(s, s.b, x, z), ease(s.k)));
const iceS = (s: Shape, x: number, z: number) => (s.k >= 1 ? iceH(s.b, x, z, s.melt) : mix(iceH(s.a, x, z, s.melt), iceH(s.b, x, z, s.melt), ease(s.k)));
/** Powierzchnia: skała albo lód (co wyżej). */
const topS = (s: Shape, x: number, z: number) => {
  const r = rockS(s, x, z);
  const i = iceS(s, x, z);
  return Number.isFinite(i) && i > r ? i : r;
};
const curType = (s: Shape) => (s.k > 0.5 ? s.b : s.a);
/** Kolory wierzchołków three.js są liniowe – przeliczenie z sRGB. */
const lin = (c: number) => Math.pow(c, 2.2);

/* ================= niebo i podstawa ================= */

function Sky({ night = false }: { night?: boolean }) {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(430, 32, 16);
    const p = g.getAttribute('position');
    const col: number[] = [];
    const top = new THREE.Color(night ? '#0b1020' : '#5f8fc4');
    const hor = new THREE.Color(night ? '#2a2236' : '#d8e4ee');
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 430;
      c.copy(hor).lerp(top, clamp(y * 1.6));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [night]);
  return (
    <mesh geometry={geo} renderOrder={-10}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

/** Płaszczyzna przekroju: zostaje połowa z ≤ 0. */
const CUT_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const NO_PLANES: THREE.Plane[] = [];

/* ================= teren ================= */

const NR = 120;
const NT = 200;
/** Promienie siatki – gęściej przy szczycie. */
const RS = Array.from({ length: NR + 1 }, (_, i) => R_TERRAIN * Math.pow(i / NR, 1.55));

function Terrain({ shape, cut }: { shape: React.MutableRefObject<Shape>; cut: boolean }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 1 + NR * NT;
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const idx: number[] = [];
    for (let j = 0; j < NT; j++) idx.push(0, 1 + ((j + 1) % NT), 1 + j);
    for (let i = 1; i < NR; i++)
      for (let j = 0; j < NT; j++) {
        const a = 1 + (i - 1) * NT + j;
        const b = 1 + (i - 1) * NT + ((j + 1) % NT);
        const c = a + NT;
        const d = b + NT;
        idx.push(a, b, c, b, d, c);
      }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R_TERRAIN * 1.2);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false }), []);
  useEffect(() => {
    mat.clippingPlanes = cut ? [CUT_PLANE] : NO_PLANES;
    mat.needsUpdate = true;
  }, [mat, cut]);
  const seen = useRef({ ver: -1, colorType: '' as string, melt: -1 });
  useFrame(() => {
    const s = shape.current;
    if (seen.current.ver === s.ver) return;
    seen.current.ver = s.ver;
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, 0, topS(s, 0, 0), 0);
    for (let i = 1; i <= NR; i++)
      for (let j = 0; j < NT; j++) {
        const th = (j / NT) * Math.PI * 2;
        const x = RS[i] * Math.cos(th);
        const z = RS[i] * Math.sin(th);
        p.setXYZ(1 + (i - 1) * NT + j, x, topS(s, x, z), z);
      }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    const ct = curType(s);
    const colorKey = `${ct}|${s.grow < 1 ? Math.round(s.grow * 20) : 'g'}|${Math.round(s.infl * 10)}`;
    if (seen.current.colorType === colorKey && Math.abs(seen.current.melt - s.melt) < 0.05) return;
    seen.current.colorType = colorKey;
    seen.current.melt = s.melt;
    const c = geo.getAttribute('color') as THREE.BufferAttribute;
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v);
      const y = p.getY(v);
      const z = p.getZ(v);
      const slope = Math.sqrt(Math.max(0, 1 - nrm.getY(v) ** 2)) / Math.max(0.05, nrm.getY(v));
      const col = surfColor(ct, x, z, y, slope, rockOf(s, ct, x, z), iceH(ct, x, z, s.melt));
      c.setXYZ(v, lin(col[0]), lin(col[1]), lin(col[2]));
    }
    c.needsUpdate = true;
  });
  return <mesh geometry={geo} material={mat} />;
}

/** Równina wokół (bez przekroju) albo dno morza; dalej – mgła. */
function Plain({ shape, cut }: { shape: React.MutableRefObject<Shape>; cut: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = shape.current;
    if (ref.current) ref.current.position.y = mix(baseLevel(s.a), baseLevel(s.b), ease(s.k)) - 0.6;
  });
  if (cut) return null;
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[R_TERRAIN - 2, 620, 64, 1]} />
      <meshStandardMaterial color="#6b7a45" roughness={1} />
    </mesh>
  );
}

/** Woda: morze (wulkan podmorski) i jeziora w kraterach. */
function Water({ type, cut, settled }: { type: VType; cut: boolean; settled: boolean }) {
  const planes = cut ? [CUT_PLANE] : NO_PLANES;
  if (!settled) return null;
  return (
    <>
      {hasSea(type) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={2}>
          <circleGeometry args={[cut ? R_TERRAIN : 620, 96]} />
          <meshStandardMaterial color="#2f6fa8" transparent opacity={0.62} roughness={0.15} metalness={0.1} clippingPlanes={planes} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {lakesOf(type).map((l, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[l.x, l.y, l.z]} renderOrder={2}>
          <circleGeometry args={[l.r, 72]} />
          <meshStandardMaterial color={type === 'caldera' ? '#1f5f9e' : type === 'maar' ? '#3a6f6a' : '#4a8fb8'} transparent opacity={0.78} roughness={0.12} clippingPlanes={planes} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

/* ================= przekrój ================= */

const CAP_NX = 380;
const CAP_NY = 120;

/** Ściana przekroju w płaszczyźnie z = 0 oraz półkolista ściana bloku (jak makieta w muzeum). */
function Section({ shape }: { shape: React.MutableRefObject<Shape> }) {
  const { cap, skirt, floor } = useMemo(() => {
    const mk = (nx: number) => {
      const g = new THREE.BufferGeometry();
      const n = (nx + 1) * (CAP_NY + 1);
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      const idx: number[] = [];
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < CAP_NY; j++) {
          const a = i * (CAP_NY + 1) + j;
          idx.push(a, a + CAP_NY + 1, a + 1, a + 1, a + CAP_NY + 1, a + CAP_NY + 2);
        }
      g.setIndex(idx);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
      return g;
    };
    return { cap: mk(CAP_NX), skirt: mk(160), floor: new THREE.CircleGeometry(R_TERRAIN, 80, Math.PI, Math.PI) };
  }, []);
  const seen = useRef({ ver: -1, key: '' });
  useFrame(() => {
    const s = shape.current;
    if (seen.current.ver === s.ver) return;
    seen.current.ver = s.ver;
    const ct = curType(s);
    const pl = plumbingOf(ct);
    const key = `${ct}|${s.grow < 1 ? Math.round(s.grow * 12) : 'g'}|${Math.round(s.melt * 10)}|${Math.round(s.infl * 6)}`;
    const recolor = key !== seen.current.key;
    seen.current.key = key;
    // ściana przekroju
    const fill = (g: THREE.BufferGeometry, nx: number, at: (u: number) => [number, number]) => {
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      const c = g.getAttribute('color') as THREE.BufferAttribute;
      for (let i = 0; i <= nx; i++) {
        const [x, z] = at(i / nx);
        const rock = rockS(s, x, z);
        const ice = iceS(s, x, z);
        const water = waterH(ct, x, z);
        const top = Math.max(rock, Number.isFinite(ice) ? ice : -1e9, water);
        for (let j = 0; j <= CAP_NY; j++) {
          // gęściej przy powierzchni (tam są cienkie warstwy)
          const f = 1 - Math.pow(1 - j / CAP_NY, 1.5);
          const y = DEPTH + (top - DEPTH) * f;
          const v = i * (CAP_NY + 1) + j;
          p.setXYZ(v, x, y, z);
          if (recolor) {
            const col = geoColor(ct, x, y, pl, rock, ice, water);
            c.setXYZ(v, lin(col[0]), lin(col[1]), lin(col[2]));
          }
        }
      }
      p.needsUpdate = true;
      if (recolor) c.needsUpdate = true;
    };
    fill(cap, CAP_NX, (u) => [(u * 2 - 1) * (R_TERRAIN - 0.5), 0.02]);
    fill(skirt, 160, (u) => {
      const th = Math.PI + u * Math.PI;
      return [(R_TERRAIN - 0.3) * Math.cos(th), (R_TERRAIN - 0.3) * Math.sin(th)];
    });
  });
  return (
    <>
      <mesh geometry={cap}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={skirt}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={1} />
      </mesh>
      <mesh geometry={floor} rotation={[Math.PI / 2, 0, 0]} position={[0, DEPTH, 0]}>
        <meshStandardMaterial color="#2a2522" side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

/* ================= magma w przekroju ================= */

interface MagmaState {
  /** Poziom magmy w kominie 0…1. */
  level: number;
  /** Prędkość wznoszenia magmy (jedn./s). */
  speed: number;
  /** Lepkość 0 (płynny bazalt) … 1 (gęsty ryolit). */
  visc: number;
  /** Jasność komory (pulsuje przy dopływie magmy). */
  glow: number;
  /** Rozwój nowej żyły 0…1 (zakładka o żyłach). */
  dike: number;
}

type Bubble = { x: number; y: number; r: number; vy: number; alive: boolean; frag: boolean };

/** Magma w kominie, pęcherzyki gazu (rosną przy wznoszeniu), poświata komory i nowa żyła. */
function MagmaOverlay({ pl, st, onBurst, dikePath }: { pl: Plumbing; st: React.MutableRefObject<MagmaState>; onBurst?: (n: number) => void; dikePath?: [number, number][] }) {
  const col = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const dike = useRef<THREE.Mesh>(null);
  const inst = useRef<THREE.InstancedMesh>(null);
  const bubbles = useMemo<Bubble[]>(() => [], []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const acc = useRef(0);
  const cd = pl.conduit;
  const dikeGeo = useMemo(() => {
    if (!dikePath) return null;
    const pos: number[] = [];
    const idx: number[] = [];
    dikePath.forEach(([x, y], i) => {
      pos.push(x - 0.35, y, 0.06, x + 0.35, y, 0.06);
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }, [dikePath]);
  useFrame((state, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const s = st.current;
    const top = cd.y0 + (cd.y1 - cd.y0) * s.level;
    if (col.current) {
      col.current.visible = cd.w > 0 && s.level > 0.01;
      col.current.position.set(cd.x, (cd.y0 + top) / 2, 0.05);
      col.current.scale.set(cd.w * 2, Math.max(0.01, top - cd.y0), 1);
    }
    if (glow.current) {
      const t = state.clock.elapsedTime;
      (glow.current.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.14 * s.glow * (0.6 + 0.4 * Math.sin(t * 2.2));
    }
    if (dike.current && dikeGeo) {
      const n = dikeGeo.getIndex()!.count;
      dikeGeo.setDrawRange(0, Math.floor((n / 6) * clamp(s.dike)) * 6);
      dike.current.visible = s.dike > 0.01;
    }
    // pęcherzyki: rodzą się w komorze i u dołu komina; w płynnej magmie uciekają szybko, w gęstej – płyną z magmą
    if (cd.w > 0 && s.level > 0.05) {
      acc.current += dt * (6 + 10 * s.speed);
      while (acc.current > 1) {
        acc.current--;
        bubbles.push({ x: cd.x + rnd(-0.8, 0.8) * cd.w, y: cd.y0 + rnd(0, 2), r: 0.06, vy: 0, alive: true, frag: false });
        if (bubbles.length > 260) bubbles.shift();
      }
    }
    const I = inst.current;
    if (!I) return;
    let k = 0;
    let burst = 0;
    const fragY = top - 2.5 - 3 * s.visc;
    for (const b of bubbles) {
      if (!b.alive) continue;
      // wypór pęcherzyka hamowany lepkością + ruch samej magmy
      const rise = (1.2 - s.visc) * 6 * b.r + s.speed * 1.2 + 0.25;
      b.y += rise * dt;
      // spadek ciśnienia ku górze – pęcherzyk rośnie
      const depth = Math.max(0.5, top - b.y);
      b.r = Math.min(cd.w * 0.9, 0.06 + 0.9 / Math.sqrt(depth + 1) * (0.4 + 0.6 * s.visc + 0.2));
      if (b.y > top) {
        b.alive = false;
        burst++;
        continue;
      }
      // gęsta magma: na pewnej głębokości pęcherzyki rozrywają magmę na strzępy (fragmentacja)
      if (s.visc > 0.6 && s.speed > 0.4 && b.y > fragY) {
        b.alive = false;
        burst += 2;
        continue;
      }
      m4.makeScale(b.r, b.r, 1);
      m4.setPosition(b.x + Math.sin(b.y * 3 + b.r * 40) * 0.08, b.y, 0.08);
      I.setMatrixAt(k++, m4);
    }
    while (bubbles.length && !bubbles[0].alive) bubbles.shift();
    I.count = k;
    I.instanceMatrix.needsUpdate = true;
    if (burst) onBurst?.(burst);
  });
  const ch = pl.chamber;
  return (
    <>
      <mesh ref={col} renderOrder={3}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ff7a1a" toneMapped={false} />
      </mesh>
      <mesh ref={glow} position={[ch.cx, ch.cy, 0.07]} scale={[ch.ax * 1.25, ch.ay * 1.35, 1]} renderOrder={3}>
        <circleGeometry args={[1, 64]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {dikeGeo && (
        <mesh ref={dike} geometry={dikeGeo} renderOrder={3}>
          <meshBasicMaterial color="#ff8a1f" toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <instancedMesh ref={inst} args={[undefined, undefined, 300]} frustumCulled={false} renderOrder={4}>
        <circleGeometry args={[1, 14]} />
        <meshBasicMaterial color="#fff2c8" transparent opacity={0.85} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

/** Ogniska trzęsień ziemi w przekroju: błyskające kółka (`spots()` – bieżące ogniska [x, y, siła]). */
function Quakes({ spots }: { spots: () => [number, number, number][] }) {
  const inst = useRef<THREE.InstancedMesh>(null);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const I = inst.current;
    if (!I) return;
    const q = spots();
    q.forEach(([x, y, k], i) => {
      m4.makeScale(0.25 + 0.6 * k, 0.25 + 0.6 * k, 1);
      m4.setPosition(x, y, 0.09);
      I.setMatrixAt(i, m4);
    });
    I.count = q.length;
    I.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, 200]} frustumCulled={false} renderOrder={4}>
      <ringGeometry args={[0.55, 1, 20]} />
      <meshBasicMaterial color="#ffe14a" toneMapped={false} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/* ================= błyskawice wulkaniczne ================= */

function Lightning({ on, center, size }: { on: boolean; center: V3; size: V3 }) {
  const [bolt, setBolt] = useState<V3[] | null>(null);
  const light = useRef<THREE.PointLight>(null);
  const next = useRef(0.5);
  const life = useRef(0);
  useFrame((_, dt) => {
    if (!on) return;
    next.current -= dt;
    if (life.current > 0) {
      life.current -= dt;
      if (life.current <= 0) setBolt(null);
    }
    if (light.current) light.current.intensity = life.current > 0 ? 900 * (0.5 + Math.random()) : 0;
    if (next.current <= 0) {
      next.current = rnd(0.4, 1.8);
      const a: V3 = [center[0] + rnd(-1, 1) * size[0], center[1] + rnd(0, 1) * size[1], center[2] + rnd(-1, 1) * size[2]];
      const pts: V3[] = [a];
      const n = 9;
      const dx = rnd(-1, 1) * size[0] * 0.8;
      const dy = -rnd(0.4, 1) * size[1];
      for (let i = 1; i <= n; i++) {
        const f = i / n;
        pts.push([a[0] + dx * f + rnd(-1.2, 1.2), a[1] + dy * f + rnd(-0.6, 0.6), a[2] + rnd(-1.2, 1.2)]);
      }
      setBolt(pts);
      life.current = 0.14;
      if (light.current) light.current.position.set(...a);
    }
  });
  if (!on) return null;
  return (
    <>
      <pointLight ref={light} color="#cfe0ff" intensity={0} distance={120} decay={1.2} />
      {bolt && <Line points={bolt} color="#eef4ff" lineWidth={2.6} toneMapped={false} />}
    </>
  );
}

/* ================= erupcje ================= */

export type Erupt = 'none' | 'degas' | 'hawaii' | 'strombo' | 'vulcan' | 'pelee' | 'plinian' | 'surtsey' | 'fissure' | 'phreatic' | 'glacier' | 'dome' | 'pdc' | 'lahar';

const ASH: V3 = [0.46, 0.44, 0.42];
const ASH_D: V3 = [0.3, 0.28, 0.27];
const ASH_L: V3 = [0.64, 0.61, 0.57];
const STEAM: V3 = [0.93, 0.94, 0.96];
const GASB: V3 = [0.78, 0.82, 0.9];
const mixV = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

interface EruptCtx {
  puffs: React.MutableRefObject<PuffSys | null>;
  rocks: React.MutableRefObject<RockSys | null>;
  vents: V3[];
  ground: (x: number, z: number) => number;
  /** Czas od startu scenariusza (−1 – bez scenariusza, erupcja trwa stale). */
  t: number;
  dt: number;
  acc: Record<string, number>;
  /** Siła 0…1 (np. skala VEI). */
  power: number;
  ceiling: number;
}

const every = (c: EruptCtx, key: string, rate: number, f: () => void) => {
  c.acc[key] = (c.acc[key] ?? 0) + rate * c.dt;
  let n = 0;
  while (c.acc[key] >= 1 && n++ < 200) {
    c.acc[key]--;
    f();
  }
};
/** Wybuch co `period` sekund (z losowym rozrzutem). */
const burst = (c: EruptCtx, key: string, period: number, f: () => void) => {
  c.acc[key] = (c.acc[key] ?? rnd(0, period)) - c.dt;
  if (c.acc[key] <= 0) {
    c.acc[key] = period * rnd(0.7, 1.3);
    f();
  }
};
const jitter = (v: V3, r: number): V3 => [v[0] + rnd(-r, r), v[1], v[2] + rnd(-r, r)];

function stepEruption(style: Erupt, c: EruptCtx) {
  const P = c.puffs.current;
  const R = c.rocks.current;
  if (!P || !R) return;
  const v = c.vents[0];
  const degas = (rate = 3, col: V3 = STEAM, a = 0.5) =>
    every(c, 'steam', rate, () => {
      const q = c.vents[Math.floor(Math.random() * c.vents.length)];
      P.emit({ p: jitter([q[0], q[1] + 0.6, q[2]], 1), v: [0, 2.6, 0], size: 1.2, grow: 1.1, life: 9, color: col, alpha: a, lift: 0.5 });
    });
  switch (style) {
    case 'none':
      return;
    case 'degas':
      degas(3.2);
      return;
    case 'hawaii': {
      every(c, 'drops', 75, () => R.emit({ p: jitter([v[0], v[1] + 0.3, v[2]], 0.5), v: upCone(rnd(11, 18), 0.16), size: rnd(0.2, 0.45), shape: 2, heat: 1, cool: 0.16, drag: 0.03 }));
      degas(2.5, GASB, 0.4);
      return;
    }
    case 'fissure': {
      every(c, 'drops', 150, () => {
        // kurtyna ognia: fontanny wzdłuż całej szczeliny, najwyższe przy stożkach
        const zc = FISSURE_CONES[Math.floor(Math.random() * FISSURE_CONES.length)];
        const z = Math.random() < 0.55 ? zc + rnd(-1.5, 1.5) : rnd(-FISSURE_L + 4, FISSURE_L - 4);
        const near = FISSURE_CONES.some((q) => Math.abs(q - z) < 2);
        R.emit({ p: [rnd(-0.3, 0.3), c.ground(0, z) + 0.2, z], v: upCone(near ? rnd(8, 13) : rnd(4, 8), 0.14), size: rnd(0.14, 0.32), shape: 2, heat: 1, cool: 0.17, drag: 0.03 });
      });
      every(c, 'gas', 3, () => P.emit({ p: [rnd(-1, 1), c.ground(0, 0) + 2, rnd(-25, 25)], v: [0, 2.4, 0], size: 1.6, grow: 1.4, life: 9, color: GASB, alpha: 0.38, lift: 0.5 }));
      return;
    }
    case 'strombo': {
      burst(c, 'b', 3, () => {
        for (let i = 0; i < 38; i++) {
          const s = rnd(0.12, 0.62);
          R.emit({ p: jitter([v[0], v[1] + 0.4, v[2]], 0.4), v: upCone(rnd(11, 20), 0.5), size: s, shape: s > 0.42 ? 1 : 0, heat: 1, cool: rnd(0.1, 0.16), drag: 0.02 });
        }
        for (let i = 0; i < 7; i++) P.emit({ p: jitter([v[0], v[1] + 1, v[2]], 0.8), v: upCone(rnd(4, 8), 0.3), size: 1.4, grow: 1.5, life: 7, color: ASH, alpha: 0.75, lift: 0.4 });
      });
      degas(1.2);
      return;
    }
    case 'vulcan': {
      burst(c, 'b', 7, () => {
        for (let i = 0; i < 80; i++) P.emit({ p: jitter([v[0], v[1] + 1, v[2]], 1.2), v: upCone(rnd(8, 18), 0.32), size: rnd(1.4, 2.8), grow: 2.1, life: 13, color: mixV(ASH_D, ASH, Math.random()), alpha: 0.88, lift: 0.5 });
        for (let i = 0; i < 26; i++) {
          const s = rnd(0.25, 0.9);
          R.emit({ p: jitter([v[0], v[1] + 0.5, v[2]], 0.6), v: upCone(rnd(13, 24), 0.62), size: s, shape: 0, heat: rnd(0.1, 0.7), cool: 0.1, color: [0.38, 0.36, 0.35] });
        }
      });
      degas(1.5, ASH_L, 0.4);
      return;
    }
    case 'plinian': {
      const pw = 0.4 + 0.6 * c.power;
      const collapse = c.t > 22;
      const rate = collapse ? 18 : 42 * pw;
      every(c, 'col', rate, () => P.emit({ p: jitter([v[0], v[1] + 1, v[2]], 1.3), v: [rnd(-1.5, 1.5), rnd(24, 34) * pw, rnd(-1.5, 1.5)], size: 2.6, grow: 2.4, life: 16, color: mixV(ASH, ASH_L, Math.random()), alpha: 0.78, lift: 1.6 }));
      every(c, 'pumice', 26 * pw, () => R.emit({ p: [rnd(-14, 26), c.ceiling - rnd(2, 10), rnd(-16, 10)], v: [rnd(1, 3), -2, 0], size: rnd(0.1, 0.24), shape: 0, heat: 0, color: [0.8, 0.77, 0.7], drag: 0.5, life: 14 }));
      if (collapse) pdcPulse(c, 30, 10);
      return;
    }
    case 'pdc': {
      // przepływ piroklastyczny ze szczytu (scenariusz: zapadnięcie kolumny / kopuły)
      if (c.t < 0) {
        burst(c, 'pdc', 14, () => (c.acc.pdcOn = 4));
      } else if (c.t > 1 && c.t < 14) c.acc.pdcOn = 1;
      else c.acc.pdcOn = 0;
      if ((c.acc.pdcOn ?? 0) > 0) {
        if (c.t < 0) c.acc.pdcOn -= c.dt;
        pdcPulse(c, 40, 13);
      }
      degas(1.2, ASH_L, 0.5);
      return;
    }
    case 'pelee':
    case 'dome': {
      // kopuła lawowa rośnie: co chwilę odrywają się z niej żarzące się bloki; przy erupcji pelejskiej – lawina żaru
      burst(c, 'rf', style === 'pelee' ? 2.2 : 3.5, () => {
        for (let i = 0; i < 6; i++) {
          const a = rnd(-2.6, -0.5);
          R.emit({ p: [Math.cos(a) * 5, c.ground(Math.cos(a) * 5, Math.sin(a) * 5) + 0.6, Math.sin(a) * 5], v: [Math.cos(a) * rnd(3, 6), rnd(1, 3), Math.sin(a) * rnd(3, 6)], size: rnd(0.25, 0.6), heat: rnd(0.6, 0.95), cool: 0.12 });
        }
      });
      if (style === 'pelee')
        burst(c, 'nuee', 9, () => {
          for (let i = 0; i < 70; i++) {
            const a = rnd(-2.2, -0.9);
            const r0 = rnd(3, 6);
            P.emit({ p: [Math.cos(a) * r0, c.ground(Math.cos(a) * r0, Math.sin(a) * r0) + 1, Math.sin(a) * r0], v: [Math.cos(a) * rnd(6, 14), 0, Math.sin(a) * rnd(6, 14)], size: rnd(1.4, 2.6), grow: 1.6, life: rnd(7, 11), color: mixV(ASH_D, ASH, Math.random()), alpha: 0.9, kind: 1, lift: 0.25 });
          }
        });
      degas(2, STEAM, 0.45);
      return;
    }
    case 'surtsey': {
      burst(c, 'b', 1.7, () => {
        // „kogucie ogony”: strugi czarnej tefry wyrzucane przez wodę wdzierającą się do krateru
        for (let j = 0; j < 4; j++) {
          const lean = upCone(rnd(3, 7), 1.2);
          for (let i = 0; i < 9; i++) R.emit({ p: jitter([v[0], 0.3, v[2]], 0.6), v: [lean[0] + rnd(-1, 1), rnd(12, 20), lean[2] + rnd(-1, 1)], size: rnd(0.12, 0.3), heat: 0.35, cool: 0.4, color: [0.12, 0.12, 0.13], drag: 0.06 });
          for (let i = 0; i < 4; i++) P.emit({ p: jitter([v[0], 0.8, v[2]], 0.5), v: [lean[0] * 1.4, rnd(10, 15), lean[2] * 1.4], size: 0.9, grow: 1.1, life: 4, color: [0.14, 0.14, 0.15], alpha: 0.85, lift: -2 });
        }
      });
      every(c, 'steam', 9, () => P.emit({ p: jitter([v[0], 1.5, v[2]], 2), v: [0, rnd(5, 9), 0], size: 2.6, grow: 2.4, life: 11, color: mixV(STEAM, ASH_L, Math.random() * 0.3), alpha: 0.7, lift: 1.8 }));
      return;
    }
    case 'phreatic': {
      const go = c.t >= 0 ? c.t > 1 && !c.acc.done : false;
      const fire = () => {
        for (let i = 0; i < 90; i++) P.emit({ p: jitter([v[0], v[1] + 0.8, v[2]], 1.4), v: upCone(rnd(7, 16), 0.55), size: rnd(1.4, 2.4), grow: 2, life: 12, color: mixV(STEAM, ASH_L, Math.random() * 0.7), alpha: 0.85, lift: 0.9 });
        for (let i = 0; i < 34; i++) R.emit({ p: jitter([v[0], v[1] + 0.4, v[2]], 0.8), v: upCone(rnd(10, 20), 0.65), size: rnd(0.2, 0.7), heat: 0, color: [0.55, 0.5, 0.45] });
      };
      if (c.t < 0) burst(c, 'b', 11, fire);
      else if (go) {
        c.acc.done = 1;
        fire();
      }
      degas(1.6);
      return;
    }
    case 'glacier': {
      every(c, 'col', 22, () => P.emit({ p: jitter([v[0], v[1] + 2, v[2]], 2.5), v: [0, rnd(10, 16), 0], size: 2.4, grow: 2.3, life: 14, color: mixV(STEAM, ASH, Math.random() * 0.6), alpha: 0.75, lift: 1.6 }));
      return;
    }
    case 'lahar':
      degas(2.2, ASH_L, 0.5);
      return;
  }
}

/** Przepływ piroklastyczny: kłęby spływające po zboczach (kind 1). */
function pdcPulse(c: EruptCtx, rate: number, speed: number) {
  const P = c.puffs.current;
  if (!P) return;
  const v = c.vents[0];
  every(c, 'pdc', rate, () => {
    const a = rnd(-2.9, -0.25);
    const r0 = rnd(1, 4);
    const x = v[0] + Math.cos(a) * r0;
    const z = v[2] + Math.sin(a) * r0;
    P.emit({ p: [x, c.ground(x, z) + 1, z], v: [Math.cos(a) * rnd(0.6, 1) * speed, 0, Math.sin(a) * rnd(0.6, 1) * speed], size: rnd(1.6, 2.8), grow: 1.7, life: rnd(8, 12), color: mixV(ASH, ASH_L, Math.random()), alpha: 0.9, kind: 1, lift: 0.2 });
  });
}

/* ================= opisy części ================= */

export interface PartInfo {
  name: string;
  desc: string;
  pos: V3;
  /** Moduł, do którego prowadzi podpis w widoku całości. */
  link?: string;
}

/** Części widoczne w przekroju stratowulkanu (strona główna modułu „Wnętrze”). */
export function insideParts(): Record<string, PartInfo> {
  const pl = plumbingOf('strato');
  const top = rockH('strato', 0, 0);
  return {
    crater: { name: 'krater', desc: 'Lejowate zagłębienie na szczycie, w którym kończy się komin. Tędy wydostają się gazy, popiół i lawa. Kratery mają zwykle od kilkudziesięciu metrów do ok. 1 km średnicy.', pos: [0, top + 2.5, -1] },
    conduit: { name: 'komin wulkaniczny', desc: 'Kanał, którym magma wędruje z komory do krateru. Między erupcjami zatyka go zastygła magma – czop. Gdy pod czopem zbierze się dość gazu, czop zostaje wyrzucony w powietrze.', pos: [1.6, 4, 0.2] },
    chamber: { name: 'komora magmowa', desc: 'Podziemny „magazyn” stopionej skały, zwykle 2–10 km pod powierzchnią. To nie pusta jaskinia z jeziorem lawy – raczej gąbka z gorących kryształów przesiąknięta magmą. Gdy z głębi napływa nowa magma, komora rośnie, a ciśnienie w niej się zwiększa.', pos: [pl.chamber.ax * 0.6, pl.chamber.cy + 1, 0.2] },
    layers: { name: 'warstwy lawy i popiołu', desc: 'Stratowulkan („wulkan warstwowy”) rośnie przez tysiące lat. Każda erupcja dokłada warstwę: raz zastygłą lawę (ciemne pasy), raz popiół i okruchy skał (jasne pasy).', pos: [-12, 9, 0.2] },
    dike: { name: 'żyła (dajka)', desc: 'Magma nie zawsze płynie kominem. Potrafi rozsadzić skałę i wcisnąć się w pionową szczelinę. Zastygła w niej tworzy płaską „ścianę” skały – żyłę. Gdy żyła dotrze do powierzchni, na zboczu powstaje nowy, mały stożek.', pos: [10.5, -4, 0.2] },
    parasite: { name: 'stożek pasożytniczy', desc: 'Mały wulkan na zboczu dużego, zasilany żyłą odchodzącą od głównego komina. Etna ma ich ponad 300.', pos: [PARASITE[0], rockH('strato', PARASITE[0], PARASITE[1]) + 2, PARASITE[1]] },
    sill: { name: 'sill (żyła pokładowa)', desc: 'Magma wciśnięta poziomo między warstwy skał. Zastygła tworzy płaski pokład skały magmowej, czasem długi na wiele kilometrów.', pos: [-10, -5, 0.2] },
    rock: { name: 'skały podłoża', desc: 'Warstwy skał, na których stoi wulkan – często osadowych, starszych niż sam wulkan o miliony lat. Magma przebija się przez nie, nagrzewa je i czasem częściowo topi.', pos: [-30, -16, 0.2] },
    plume: { name: 'pióropusz gazów', desc: 'Nawet uśpiony wulkan „dymi”: z krateru ulatnia się para wodna, dwutlenek węgla i związki siarki. Zmiany w ilości i składzie tych gazów zdradzają, co dzieje się z magmą w głębi.', pos: [3, top + 14, -2] },
  };
}

/** Podpisy w widoku całości – prowadzą do modułów. */
export function homeLinks(): Record<string, PartInfo> {
  const top = rockH('strato', 0, 0);
  return {
    types: { name: 'rodzaje wulkanów', desc: '', pos: [-19, rockH('strato', -19, -8) + 2, -8], link: 'rodzaje' },
    erupt: { name: 'erupcje', desc: '', pos: [2, top + 12, -2], link: 'erupcje' },
    products: { name: 'co wyrzuca wulkan', desc: '', pos: [8, top + 5, -3], link: 'produkty' },
    inside: { name: 'wnętrze i magma', desc: '', pos: [6, -22, 0.3], link: 'wnetrze' },
    tec: { name: 'skąd się biorą wulkany', desc: '', pos: [-38, -40, 0.3], link: 'tektonika' },
    mon: { name: 'obserwacja wulkanu', desc: '', pos: [MON_STATIONS[0][0], rockH('strato', MON_STATIONS[0][0], MON_STATIONS[0][1]) + 3, MON_STATIONS[0][1]], link: 'obserwacja' },
    life: { name: 'życie przy wulkanie', desc: '', pos: [36, 4, -24], link: 'zycie' },
  };
}

/* ================= scena ================= */

/** Tryby zakładek, w których scena pokazuje przekrój. */
export interface VolcanoView {
  type: VType;
  cut: boolean;
  erupt: Erupt;
}

export function VolcanoScene({ params }: SceneProps) {
  const type = str(params.type, 'strato') as VType;
  const mode = str(params.mode, 'home');
  const cut = Boolean(params.cut ?? true);
  const run = Boolean(params.run);
  const silica = num(params.silica, 50);
  const vei = num(params.vei, 4);
  const wind = num(params.wind, 6);
  const flowKind = str(params.lava, 'pahoehoe') as FlowKind;
  // erupcja: z ustawień zakładki; w zakładce o lepkości – z zawartości krzemionki; w zakładce VEI – z siły
  let erupt = str(params.erupt, 'degas') as Erupt;
  if (mode === 'in-gas') erupt = silica < 52 ? 'hawaii' : silica < 58 ? 'strombo' : silica < 65 ? 'vulcan' : 'plinian';
  if (mode === 'vei') erupt = vei <= 0 ? 'hawaii' : vei === 1 ? 'strombo' : vei <= 3 ? 'vulcan' : 'plinian';
  // erupcje „na przycisk”: bez „Rozpocznij” wulkan tylko lekko dymi
  const scenario = ['pdc', 'lahar', 'in-dike', 'in-growth', 'mon-alert', 'mon-swell', 'mon-quake', 'glacier', 'tour-erupt'].includes(mode) || erupt === 'glacier';
  const nav = useTopicNav();
  const home = useModuleHome();
  const paused = useContext(PauseContext);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  /* kształt: przejście między rodzajami */
  const shape = useRef<Shape>({ a: type, b: type, k: 1, melt: 0, infl: 0, grow: 1, ver: 0 });
  const [settled, setSettled] = useState(true);
  useEffect(() => {
    const s = shape.current;
    if (s.b !== type) {
      s.a = s.k > 0.5 ? s.b : s.a;
      s.b = type;
      s.k = 0;
      s.ver++;
      setSettled(false);
    }
  }, [type]);
  const ground = useMemo(() => {
    const s = shape.current;
    return (x: number, z: number) => Math.max(topS(s, x, z), waterH(type, x, z));
  }, [type]);
  const groundRock = useMemo(() => {
    const s = shape.current;
    return (x: number, z: number) => topS(s, x, z);
  }, [type]);
  const pl = useMemo(() => plumbingOf(type), [type]);
  // w przekroju odłamki spadające na zdjętą połowę lecą dalej w dół (tam nie ma terenu)
  const groundRocks = useMemo(() => (cut ? (x: number, z: number) => (z > 0.3 ? DEPTH - 20 : ground(x, z)) : ground), [cut, ground]);

  /* stan magmy, czas scenariusza */
  const mag = useRef<MagmaState>({ level: 0.55, speed: 0.2, visc: 0.5, glow: 0.4, dike: 0 });
  const tRun = useRef(-1);
  const clock = useRef(0);
  const acc = useRef<Record<string, number>>({});
  const puffs = useRef<PuffSys | null>(null);
  const rocks = useRef<RockSys | null>(null);
  const quakes = useRef<[number, number, number][]>([]);
  const [front, setFront] = useState(0);
  const frontRef = useRef(0);
  const [phase, setPhase] = useState('');
  useEffect(() => {
    tRun.current = run ? 0 : -1;
    acc.current = {};
    puffs.current?.clear();
    rocks.current?.clear();
    frontRef.current = 0;
    setFront(0);
    const s = shape.current;
    s.melt = erupt === 'glacier' && !run && mode !== 'glacier' ? 0.8 : 0;
    s.infl = 0;
    s.grow = mode === 'in-growth' && run ? 0.05 : 1;
    s.ver++;
    mag.current.dike = 0;
  }, [run, mode, type, erupt]);

  // jęzory lawy płyną w erupcjach wylewnych i w zakładkach o lawie
  const lavaFlows = settled && (erupt === 'hawaii' || erupt === 'fissure' || mode === 'pr-lava');
  const laharFlows = settled && mode === 'pdc' ? false : settled && (mode === 'lahar' || mode === 'pr-lahar');
  const flood = settled && type === 'tuya' && erupt === 'glacier';

  useFrame((_, dt0) => {
    const dt = paused ? 0 : Math.min(dt0, 0.05);
    clock.current += dt;
    const s = shape.current;
    if (s.k < 1) {
      s.k = Math.min(1, s.k + dt / 1.8);
      s.ver++;
      if (s.k >= 1) setSettled(true);
    }
    if (tRun.current >= 0) tRun.current += dt;
    const t = tRun.current;
    const m = mag.current;
    // magma: lepkość z krzemionki (zakładka o gazie) albo z rodzaju wulkanu
    const viscOf: Partial<Record<VType, number>> = { shield: 0.1, fissure: 0.08, cinder: 0.3, strato: 0.6, dome: 0.9, caldera: 0.7, super: 0.95, sub: 0.15, tuya: 0.2, maar: 0.3 };
    const targetVisc = mode === 'in-gas' ? clamp((silica - 45) / 30) : viscOf[type] ?? 0.5;
    const active = erupt !== 'none' && erupt !== 'degas' && erupt !== 'pdc' && erupt !== 'lahar' && (!scenario || t > 0);
    m.visc += (targetVisc - m.visc) * Math.min(1, dt * 2);
    let lvl = active ? 1 : 0.55;
    let spd = active ? 0.9 : 0.15;
    let ph = '';
    // scenariusze
    if (mode === 'tour-erupt' || mode === 'mon-alert') {
      // przebudzenie wulkanu: trzęsienia, wypiętrzenie, gazy, wreszcie erupcja
      const T = t < 0 ? 0 : t;
      s.infl = t < 0 ? 0 : clamp(T / 14) * (T > 24 ? Math.max(0.3, 1 - (T - 24) / 10) : 1);
      s.ver++;
      lvl = t < 0 ? 0.55 : mix(0.55, 1, clamp((T - 4) / 18));
      spd = t < 0 ? 0.15 : mix(0.15, 1, clamp((T - 4) / 18));
      ph = t < 0 ? '' : T < 8 ? 'Magma napływa do komory – pierwsze trzęsienia ziemi' : T < 16 ? 'Magma wciska się w komin – wstrząsy coraz płycej, wulkan puchnie' : T < 22 ? 'Więcej gazów z krateru, małe wybuchy pary' : 'Erupcja!';
    }
    if (mode === 'mon-swell' || mode === 'mon-quake') {
      const T = Math.max(0, t);
      s.infl = t < 0 ? 0 : clamp(T / 16) * 1.3;
      s.ver++;
      lvl = t < 0 ? 0.55 : mix(0.55, 0.95, clamp(T / 18));
      spd = t < 0 ? 0.15 : 0.4;
    }
    if (mode === 'in-dike') {
      m.dike = t < 0 ? 0 : clamp(t / 9);
      ph = t < 0 ? '' : m.dike < 1 ? 'Magma rozsadza skałę i wciska się w szczelinę' : 'Żyła dotarła do powierzchni – erupcja na zboczu';
    }
    if (mode === 'in-growth') {
      if (t >= 0) {
        s.grow = clamp(0.05 + (t / 24) * 0.95, 0.05, 1);
        s.ver++;
        ph = `ok. ${Math.round(s.grow * 100) * 1000} lat od pierwszej erupcji`;
      }
    }
    if (erupt === 'glacier' && t >= 0) {
      s.melt = clamp(t / 12);
      s.ver++;
      ph = t < 4 ? 'Erupcja pod lodem – lód topnieje od spodu' : s.melt < 1 ? 'Nad otworem zapada się lód – powstaje kocioł' : 'Woda z roztopionego lodu wylewa się spod lodowca';
    }
    if (mode === 'pdc' && t >= 0) ph = t < 1 ? '' : t < 14 ? 'Kolumna zapada się – chmura żaru pędzi po zboczach' : 'Przepływ wytraca prędkość i osiada';
    if (mode === 'lahar' && t >= 0) ph = t < 3 ? 'Gorący popiół i lawa topią śnieg na szczycie' : 'Lahar – rzeka błota i kamieni – pędzi dolinami';
    if (mode === 'phreatic' && t >= 0) ph = t < 1 ? 'Woda w szczelinach styka się z gorącą skałą…' : 'Wybuch pary wodnej wyrzuca stare skały';
    m.level += (lvl - m.level) * Math.min(1, dt * 1.5);
    m.speed += (spd - m.speed) * Math.min(1, dt * 1.5);
    m.glow = 0.3 + 0.7 * m.speed;
    if (ph !== phase) setPhase(ph);
    // trzęsienia ziemi w przekroju
    const q = quakes.current;
    for (const e of q) e[2] -= dt * 1.4;
    while (q.length && q[0][2] <= 0) q.shift();
    const qRate = mode === 'mon-quake' || mode === 'tour-erupt' || mode === 'mon-alert' ? (t < 0 ? 0.4 : 1.5 + 4 * clamp(t / 16)) : mode === 'in-dike' && t >= 0 && m.dike < 1 ? 5 : 0;
    acc.current.q = (acc.current.q ?? 0) + qRate * dt;
    while (acc.current.q > 1) {
      acc.current.q--;
      if (mode === 'in-dike') {
        const tip = dikeTip(m.dike);
        q.push([tip[0] + rnd(-1, 1), tip[1] + rnd(-1, 1), 1]);
      } else {
        // ogniska płycieją, gdy magma wznosi się kominem
        const lift = t < 0 ? 0 : clamp(t / 18);
        const y = mix(pl.chamber.cy + rnd(-3, 5), rnd(pl.chamber.cy + 6, rockH(type, 0, 0) - 4), lift * Math.random());
        q.push([rnd(-6, 6), y, rnd(0.4, 1)]);
      }
    }
    // erupcja
    const veiP = clamp((vei - 3) / 5);
    const ceiling = mode === 'vei' ? 40 + veiP * 60 : erupt === 'plinian' ? 88 : 70;
    const style = scenario && t < 0 && !['pdc', 'phreatic', 'lahar'].includes(erupt) ? 'degas' : mode === 'in-dike' ? (m.dike >= 1 ? 'degas' : 'degas') : erupt;
    const vents: V3[] = mode === 'in-dike' && m.dike >= 1 ? [[PARASITE[0], rockH('strato', PARASITE[0], PARASITE[1]), PARASITE[1]]] : pl.vents;
    if (settled || style === 'degas') {
      const ctx: EruptCtx = { puffs, rocks, vents, ground, t: scenario ? t : -1, dt, acc: acc.current, power: mode === 'vei' ? veiP : 1, ceiling };
      if (mode === 'tour-erupt' && t > 22) stepEruption(t < 30 ? 'vulcan' : 'plinian', { ...ctx, t: -1 });
      else if (mode === 'mon-alert' && t > 22) stepEruption('vulcan', { ...ctx, t: -1 });
      else stepEruption(style, ctx);
      if (mode === 'in-dike' && m.dike >= 1) stepEruption('hawaii', { ...ctx, vents, t: -1 });
    }
    // czoło spływów
    if (lavaFlows || laharFlows || flood) {
      const speed = laharFlows ? 6 : flood ? 5 : flowKind === 'aa' ? 2.2 : flowKind === 'block' ? 0.9 : 2.8;
      const go = laharFlows ? t > 3 : flood ? s.melt >= 1 : true;
      if (go) frontRef.current = Math.min(90, frontRef.current + speed * dt);
    }
  });

  const dikePath = useMemo(() => (mode === 'in-dike' ? DIKE_PATH : undefined), [mode]);
  // podpisy części
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [mode]);
  const parts = mode === 'in-home' ? insideParts() : null;
  const links = mode === 'home' && home ? homeLinks() : null;
  const veiInfo = VEI_TABLE[Math.max(0, Math.min(8, vei))];

  // widok z bliska bez przekroju: wyrzucone bomby lądują też po stronie zdjętej
  const night = mode === 'pr-lightning';
  return (
    <>
      <Sky night={night} />
      <fog attach="fog" args={[night ? '#1a1826' : '#cdd9e4', cut ? 260 : 170, 560]} />
      {night ? (
        <>
          <ambientLight intensity={0.25} color="#8a90b8" />
          <hemisphereLight args={['#3a4060', '#100c0a', 0.4]} />
        </>
      ) : (
        <>
          <ambientLight intensity={0.5} />
          <hemisphereLight args={['#dfe9f5', '#4a4030', 0.55]} />
          <directionalLight position={[-60, 90, 70]} intensity={1.7} />
          <directionalLight position={[50, 20, -40]} intensity={0.35} color="#ffd9b0" />
        </>
      )}
      <Terrain shape={shape} cut={cut} />
      <Plain shape={shape} cut={cut} />
      <Water type={type} cut={cut} settled={settled} />
      {cut && <Section shape={shape} />}
      {cut && settled && <MagmaOverlay pl={pl} st={mag} dikePath={dikePath} />}
      {cut && <Quakes spots={() => quakes.current} />}
      <Puffs sys={puffs} ground={groundRock} wind={() => [wind, 0, -wind * 0.25]} ceiling={mode === 'vei' ? 40 + clamp((vei - 3) / 5) * 60 : erupt === 'plinian' ? 88 : 70} />
      <Rocks sys={rocks} ground={groundRocks} />
      <Lightning on={(erupt === 'plinian' || mode === 'pr-lightning') && settled && (!scenario || tRun.current > 0)} center={[3, 40, -3]} size={[7, 26, 5]} />
      {lavaFlows &&
        lavaStarts(type).map(([x, z, d], i) => (
          <Flow key={`${type}-${flowKind}-${i}`} start={[x, z]} dir={d} width={type === 'fissure' ? 2.6 : flowKind === 'block' ? 2.4 : 1.6} len={type === 'fissure' ? 50 : 70} kind={mode === 'pr-lava' ? flowKind : 'pahoehoe'} front={() => frontRef.current} ground={groundRock} cut={cut} lift={flowKind === 'block' ? 0.5 : 0.14} />
        ))}
      {laharFlows &&
        [
          [-3, -8, -1.9],
          [6, -9, -1.2],
        ].map(([x, z, d], i) => <Flow key={`lahar-${i}`} start={[x, z]} dir={d} width={1.8} len={80} kind="lahar" front={() => frontRef.current} ground={groundRock} cut={cut} lift={0.2} />)}
      {flood && <Flow start={[0, -63]} dir={-Math.PI / 2} width={4} len={50} kind="flood" front={() => frontRef.current} ground={groundRock} cut={cut} lift={0.2} />}
      {(mode === 'lahar' || mode === 'pr-lahar' || mode === 'mon-alert') && <Village />}
      {mode.startsWith('mon') && <Instruments mode={mode} shape={() => shape.current.infl} />}
      {mode === 'mon-ash' && <AshPlane />}
      {mode === 'vei' && <VeiCube vei={vei} />}
      {mode.startsWith('life') && <LifeFeatures mode={mode} />}
      {(mode.startsWith('pr-sample') || mode === 'pr-home') && <Samples interactive={mode === 'pr-home' && home} />}
      {mode.startsWith('tec') && <Tectonics mode={mode} />}
      {mode === 'pr-gas' && <GasPool />}

      {parts &&
        home &&
        Object.entries(parts).map(([id, p]) => (
          <Lbl key={id} pos={p.pos} active={sel === id} onClick={() => setSel(sel === id ? null : id)}>
            {p.name}
          </Lbl>
        ))}
      {links &&
        Object.entries(links).map(([id, p]) => (
          <Lbl key={id} pos={p.pos} link onClick={() => p.link && nav?.openModule(p.link)}>
            {p.name}
          </Lbl>
        ))}
      {mode === 'in-home' && (
        <InfoPortal>
          {sel && parts ? (
            <>
              <div style={{ fontWeight: 700, color: '#ffb35c' }}>{parts[sel].name}</div>
              <div>{parts[sel].desc}</div>
            </>
          ) : (
            <div>Kliknij podpis, żeby przeczytać, czym jest ta część wulkanu.</div>
          )}
        </InfoPortal>
      )}
      {phase && (
        <InfoPortal>
          <div style={{ fontWeight: 700, color: '#ffb35c' }}>{phase}</div>
        </InfoPortal>
      )}
      {mode === 'in-gas' && (
        <InfoPortal>
          <div style={{ fontWeight: 700 }}>Krzemionka w magmie: {silica}%</div>
          <div style={{ fontSize: 13 }}>
            {silica < 52 ? 'Bazalt – rzadki jak ciepły miód. Gaz łatwo ucieka, lawa wylewa się spokojnie.' : silica < 58 ? 'Andezyt bazaltowy – gęstszy. Duże pęcherze gazu pękają w kraterze co kilka sekund.' : silica < 65 ? 'Andezyt – gęsty jak zimny miód. Gaz gromadzi się pod czopem i wyrywa go wybuchem.' : 'Dacyt i ryolit – gęste jak pasta do zębów. Gaz nie ma ujścia i rozrywa magmę na popiół.'}
          </div>
        </InfoPortal>
      )}
      {mode === 'vei' && (
        <InfoPortal>
          <div style={{ fontWeight: 700, color: '#ffb35c' }}>VEI {vei}: {veiInfo.name}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px', fontSize: 13 }}>
            <span>wyrzucony materiał</span>
            <b>{veiInfo.vol}</b>
            <span>wysokość kolumny</span>
            <b>{veiInfo.col}</b>
            <span>jak często na Ziemi</span>
            <b>{veiInfo.freq}</b>
            <span>przykład</span>
            <b>{veiInfo.ex}</b>
          </div>
        </InfoPortal>
      )}
    </>
  );
}

/** Skala VEI: nazwa, objętość, kolumna, częstość, przykład. */
export const VEI_TABLE = [
  { name: 'wylewna', vol: '< 10 000 m³', col: '< 100 m', freq: 'stale', ex: 'Kīlauea (Hawaje)' },
  { name: 'słaba', vol: '> 10 000 m³', col: '100 m – 1 km', freq: 'codziennie', ex: 'Stromboli' },
  { name: 'umiarkowana', vol: '> 1 mln m³', col: '1–5 km', freq: 'co tydzień', ex: 'Etna, wiele erupcji' },
  { name: 'średnia', vol: '> 10 mln m³', col: '3–15 km', freq: 'kilka razy w roku', ex: 'Nevado del Ruiz 1985' },
  { name: 'duża', vol: '> 0,1 km³', col: '10–25 km', freq: 'co ok. 10 lat', ex: 'Eyjafjallajökull 2010' },
  { name: 'bardzo duża', vol: '> 1 km³', col: '> 25 km', freq: 'co ok. 50 lat', ex: 'Mount St. Helens 1980' },
  { name: 'kolosalna', vol: '> 10 km³', col: '> 25 km', freq: 'co ok. 100 lat', ex: 'Pinatubo 1991, Krakatau 1883' },
  { name: 'olbrzymia', vol: '> 100 km³', col: '> 25 km', freq: 'co ok. 1000 lat', ex: 'Tambora 1815' },
  { name: 'megakolosalna (superwulkan)', vol: '> 1000 km³', col: '> 25 km', freq: 'co kilkadziesiąt tys. lat', ex: 'Yellowstone 640 tys. lat temu, Toba 74 tys. lat temu' },
];

/** Początki jęzorów lawy: [x, z, kierunek] – w tylnej połowie, żeby było je widać za przekrojem. */
function lavaStarts(t: VType): [number, number, number][] {
  if (t === 'fissure')
    return [
      [1.5, -20, 0],
      [-1.5, -8, Math.PI],
      [1.5, 4, 0.2],
      [-1.5, 16, Math.PI - 0.2],
    ];
  if (t === 'shield')
    return [
      [4, -6, -0.9],
      [-5, -5, -2.2],
      [0.5, -7.5, -1.55],
    ];
  return [
    [2, -2.5, -1.2],
    [-2, -2.5, -2.0],
  ];
}

/** Droga nowej żyły w przekroju (zakładka o żyłach): od komory skośnie do stożka na zboczu. */
const DIKE_PATH: [number, number][] = Array.from({ length: 40 }, (_, i) => {
  const f = i / 39;
  const x = mix(6, PARASITE[0], f) + Math.sin(f * 9) * 0.6;
  const y = mix(-21, rockH('strato', PARASITE[0], 0) - 0.3, f);
  return [x, y];
});
const dikeTip = (k: number): [number, number] => DIKE_PATH[Math.min(DIKE_PATH.length - 1, Math.floor(k * (DIKE_PATH.length - 1)))];

/** Dwutlenek węgla zbierający się w zagłębieniu u podnóża – niewidzialny, tu zaznaczony fioletem. */
function GasPool() {
  const ref = useRef<THREE.Mesh>(null);
  const x = -30;
  const z = -22;
  useFrame((st) => {
    if (ref.current) (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.28 + 0.06 * Math.sin(st.clock.elapsedTime * 1.3);
  });
  return (
    <>
      <mesh ref={ref} position={[x, rockH('strato', x, z) + 0.5, z]} scale={[9, 0.9, 6]}>
        <sphereGeometry args={[1, 32, 12]} />
        <meshBasicMaterial color="#9b6bd6" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <Lbl pos={[x, rockH('strato', x, z) + 3, z]} color="#d7c2ff">
        CO₂ – cięższy od powietrza
      </Lbl>
    </>
  );
}

export const CALDERA_CONE = CAL_CONE;
