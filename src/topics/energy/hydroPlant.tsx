/*
 * Elektrownia wodna – modele 3D: dolina z lasem, zbiornik górny i dolny, zapora ciężka z galeriami, wlotami
 * z kratami i przelewem z zamknięciami segmentowymi, niecka wypadowa, elektrownia u stopy zapory (hala maszyn
 * z suwnicą, cztery hydrozespoły: rurociąg, spirala, kierownica, wirnik Francisa, rura ssawna, wał, generator),
 * transformatory, rozdzielnia i linia, jaz zbiornika dolnego z przepławką dla ryb, zapory innych rodzajów.
 *
 * Przekrój: wszystkie materiały modelu dzielą jedną listę płaszczyzn przycinania (CLIP). W trybie przekroju jest
 * w niej płaszczyzna przez oś hydrozespołu CUT_X – znika wszystko po stronie −x, a w płaszczyźnie cięcia stoją
 * płaskie „przekroje” (betonu, skały i wody), żeby bryły nie wyglądały na puste.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BAYS,
  CREST,
  CUT_X,
  DAM,
  DOWN,
  FRAME,
  GALLERIES,
  GEN,
  LEVEL,
  PEN,
  PEN_R,
  PH,
  PYLONS,
  SPILL,
  SWY,
  TAIL,
  TRAFO_Z,
  TU,
  UNITS,
  WEIR_Y,
  WEIR_Z,
  cz,
  fbm,
  groundH,
  mix,
  offsetLine,
  rng,
  sm,
  zFace,
  type V3,
} from './hydroGeo';

/* ================= przycinanie i materiały ================= */

/** Wspólna lista płaszczyzn przycinania wszystkich materiałów modelu (pusta albo z płaszczyzną przekroju). */
export const CLIP: THREE.Plane[] = [];
/** Płaszczyzna w układzie świata – model stoi w skali FRAME.scale, więc i położenie cięcia trzeba przeskalować. */
export const CUT_PLANE = new THREE.Plane(new THREE.Vector3(1, 0, 0), -CUT_X * FRAME.scale);
export function setCut(on: boolean) {
  CLIP.length = 0;
  if (on) CLIP.push(CUT_PLANE);
}

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, clippingPlanes: CLIP, ...o });

function windowTex() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9d3c4';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#5d7f99';
  g.fillRect(8, 14, 48, 30);
  g.fillStyle = '#c9c2b2';
  for (const x of [22, 38]) g.fillRect(x, 14, 3, 30);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rackTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d2329';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#6f7a84';
  for (let i = 0; i < 64; i += 6) g.fillRect(i, 0, 2, 64);
  for (const y of [0, 31, 62]) g.fillRect(0, y, 64, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Kreskowanie przekroju betonu (jak na rysunku technicznym). */
function hatchTex(base: string, line: string, step = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = line;
  g.lineWidth = 2;
  for (let i = -64; i < 128; i += step) {
    g.beginPath();
    g.moveTo(i, 64);
    g.lineTo(i + 64, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.12, 0.12);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let HM: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  return {
    dam: std('#cfcac0', { roughness: 0.9 }),
    damDark: std('#a8a397', { roughness: 0.95 }),
    concrete: std('#bdb8ad', { roughness: 0.95, side: THREE.DoubleSide }),
    hall: std('#ffffff', { map: windowTex(), roughness: 0.7, side: THREE.DoubleSide }),
    roof: std('#6d737b', { roughness: 0.8, side: THREE.DoubleSide }),
    floor: std('#9a968e', { roughness: 0.9 }),
    steel: std('#8e98a2', { metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
    steelDark: std('#4b545e', { metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }),
    lining: std('#7b858f', { metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }),
    rack: std('#ffffff', { map: rackTex(), metalness: 0.4, roughness: 0.5 }),
    gate: std('#3f6f9e', { metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
    spiral: std('#2f6f8f', { metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide }),
    vane: std('#d6a23a', { metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }),
    runner: std('#d3d8de', { metalness: 0.45, roughness: 0.35, side: THREE.DoubleSide }),
    shaft: std('#d7dbe0', { metalness: 0.9, roughness: 0.2 }),
    stator: std('#4c5a68', { metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide }),
    coil: std('#c8773a', { metalness: 0.7, roughness: 0.35 }),
    pole: std('#b5432e', { metalness: 0.4, roughness: 0.45 }),
    genCase: std('#3a6ea8', { metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide }),
    yellow: std('#f2c230', { roughness: 0.5 }),
    orange: std('#e0782c', { roughness: 0.5 }),
    red: std('#c8382d', { roughness: 0.5 }),
    white: std('#f1f1ec', { roughness: 0.6 }),
    trafo: std('#6f7a6a', { roughness: 0.6 }),
    cable: std('#1d2126', { roughness: 0.8 }),
    rail: std('#5a5f66', { metalness: 0.5, roughness: 0.5 }),
    glass: std('#9fd0f0', { transparent: true, opacity: 0.4, roughness: 0.1 }),
    road: std('#55575a', { roughness: 0.95 }),
    pine: std('#2f4a2a', { roughness: 1, flatShading: true }),
    leaf: std('#4a6a32', { roughness: 1, flatShading: true }),
    trunk: std('#6b4a30', { roughness: 1 }),
    rock: std('#8a8378', { roughness: 1, flatShading: true }),
    clay: std('#a0764e', { roughness: 1 }),
    riprap: std('#8f8a80', { roughness: 1, flatShading: true }),
    lake: new THREE.MeshStandardMaterial({ color: '#2e6b8f', transparent: true, opacity: 0.86, roughness: 0.1, metalness: 0.15, clippingPlanes: CLIP, side: THREE.DoubleSide }),
    river: new THREE.MeshStandardMaterial({ color: '#3a7c96', transparent: true, opacity: 0.85, roughness: 0.12, metalness: 0.1, clippingPlanes: CLIP, side: THREE.DoubleSide }),
    waterIn: new THREE.MeshStandardMaterial({ color: '#3a86c4', transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false, clippingPlanes: CLIP, side: THREE.DoubleSide }),
    // przekroje (bez przycinania – stoją w płaszczyźnie cięcia)
    capDam: new THREE.MeshStandardMaterial({ map: hatchTex('#dcd6ca', '#bdb5a5'), roughness: 0.9, side: THREE.DoubleSide }),
    capRock: new THREE.MeshStandardMaterial({ map: hatchTex('#8d7f6c', '#7a6d5b', 10), roughness: 1, side: THREE.DoubleSide }),
    capWater: new THREE.MeshStandardMaterial({ color: '#3a7fbf', transparent: true, opacity: 0.72, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    capDark: new THREE.MeshStandardMaterial({ color: '#1d232a', roughness: 1, side: THREE.DoubleSide }),
    capClay: new THREE.MeshStandardMaterial({ color: '#9b7048', roughness: 1, side: THREE.DoubleSide }),
    capFill: new THREE.MeshStandardMaterial({ map: hatchTex('#b9ad94', '#9d9079', 12), roughness: 1, side: THREE.DoubleSide }),
  };
}
export const HMAT = () => (HM ??= makeMats());

/* ================= pomocnicze ================= */

export function Box({ p, s, m, r }: { p: V3; s: V3; m: THREE.Material; r?: V3 }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}
export function CylY({ p, r, h, m, seg = 32, r2, open = false }: { p: V3; r: number; h: number; m: THREE.Material; seg?: number; r2?: number; open?: boolean }) {
  return (
    <mesh position={[p[0], p[1] + h / 2, p[2]]} material={m}>
      <cylinderGeometry args={[r2 ?? r, r, h, seg, 1, open]} />
    </mesh>
  );
}
export function Pipe({ pts, r, m, seg = 10 }: { pts: V3[]; r: number; m: THREE.Material; seg?: number }) {
  const geo = useMemo(() => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i - 1]), new THREE.Vector3(...pts[i])));
    return new THREE.TubeGeometry(path, pts.length * 8, r, seg, false);
  }, [pts, r, seg]);
  return <mesh geometry={geo} material={m} />;
}
export function Beam({ a, b, w, h = w, m }: { a: V3; b: V3; w: number; h?: number; m: THREE.Material }) {
  const { pos, q, len } = useMemo(() => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
    return { pos: A.clone().add(B).multiplyScalar(0.5), q, len: d.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={q} material={m}>
      <boxGeometry args={[len, h, w]} />
    </mesh>
  );
}

/** Kształt z punktów (z, y) – po obrocie o 90° wokół osi y leży w płaszczyźnie x = const. */
const shapeOf = (pts: [number, number][], holes: [number, number][][] = []) => {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(-z, y))));
  return s;
};
/** Bryła o przekroju (z, y) wyciągnięta wzdłuż osi x od x0 do x1. */
function Extrude({ pts, x0, x1, m }: { pts: [number, number][]; x0: number; x1: number; m: THREE.Material }) {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: x1 - x0, bevelEnabled: false, steps: 1 });
    g.computeVertexNormals();
    return g;
  }, [pts, x0, x1]);
  return <mesh geometry={geo} material={m} position={[x0, 0, 0]} rotation={[0, Math.PI / 2, 0]} />;
}
/** Płaski przekrój w płaszczyźnie x (punkty (z, y)). */
function Cap({ pts, holes, x, m }: { pts: [number, number][]; holes?: [number, number][][]; x: number; m: THREE.Material }) {
  const geo = useMemo(() => new THREE.ShapeGeometry(shapeOf(pts, holes ?? []), 4), [pts, holes]);
  return <mesh geometry={geo} material={m} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]} />;
}

/* ================= przekroje zapory ================= */

/** Profil zapory (bez otworów). */
export const DAM_PROFILE: [number, number][] = [
  [0, CREST],
  [DAM.crestW, CREST],
  [DAM.crestW, DAM.faceTop],
  [zFace(DAM.base), DAM.base],
  [0, DAM.base],
];
/** Profil przęsła przelewu: próg o łagodnym kształcie, dalej spadek po ścianie zapory. */
const SPILL_PROFILE: [number, number][] = [
  [0, SPILL.crest - 1.2],
  [1.5, SPILL.crest],
  [4, SPILL.crest + 0.2],
  [7, SPILL.crest - 0.6],
  [10, SPILL.crest - 2.2],
  [14, SPILL.crest - 5],
  [zFace(SPILL.crest - 12), SPILL.crest - 12],
  [zFace(DAM.base), DAM.base],
  [0, DAM.base],
];

/** Ściana boczna koryta przelewu: od progu po ścianie zapory do końca niecki wypadowej. */
const SPILL_WALL: [number, number][] = [
  [6, SPILL.crest + 6],
  [zFace(9) + 3, 9],
  [PH.z1, 9],
  [PH.z1, -5],
  [zFace(-5), -5],
  [zFace(SPILL.crest - 10), SPILL.crest - 10],
  [6, SPILL.crest - 2],
];

/** Zapora w przekroju przez oś hydrozespołu: górna i dolna część betonu wokół rurociągu, galerie. */
function damCapPieces() {
  const top = offsetLine(PEN, PEN_R);
  const bot = offsetLine(PEN, -PEN_R);
  // rurociąg wychodzi ze ściany zapory przy stopie – ucinamy łamane na wysokości przecięcia ze ścianą
  const clipTo = (line: [number, number][]) => {
    const out: [number, number][] = [];
    for (const p of line) {
      if (p[0] < 0) continue;
      if (p[0] > zFace(p[1])) {
        out.push([zFace(p[1]), p[1]]);
        break;
      }
      out.push(p);
    }
    return out;
  };
  const t = clipTo(top);
  const b = clipTo(bot);
  const yTop0 = mix(top[0][1], top[1][1], (0 - top[0][0]) / (top[1][0] - top[0][0]));
  const yBot0 = mix(bot[0][1], bot[1][1], (0 - bot[0][0]) / (bot[1][0] - bot[0][0]));
  const upper: [number, number][] = [[0, CREST], [DAM.crestW, CREST], [DAM.crestW, DAM.faceTop], ...[...t].reverse(), [0, yTop0]];
  const lower: [number, number][] = [[0, yBot0], ...b, [zFace(DAM.base), DAM.base], [0, DAM.base]];
  const gal = GALLERIES.map(([z, y, w, h]) => [
    [z, y],
    [z + w, y],
    [z + w, y + h - w / 2],
    [z + w / 2, y + h],
    [z, y + h - w / 2],
  ] as [number, number][]);
  const inUpper = gal.filter((g) => g[0][1] > 30);
  const inLower = gal.filter((g) => g[0][1] <= 30);
  return { upper, lower, inUpper, inLower };
}

/** Część podwodna elektrowni w przekroju: beton nad i pod drogą wody (spirala, wirnik, rura ssawna). */
const SUB_UPPER: [number, number][] = [
  [PH.z0, PH.floor],
  [PH.z0, 2.4],
  [76, 2.4],
  [77.5, 2.6],
  [77.5, PH.floor - 0.6],
  [86.5, PH.floor - 0.6],
  [86.5, 2.6],
  [89.5, 2.6],
  [89.5, -2.4],
  [84.6, -2],
  [85.5, -5.5],
  [90, -6.2],
  [PH.z1, -6.2],
  [PH.z1, PH.floor],
];
const SUB_LOWER: [number, number][] = [
  [PH.z0, -2.4],
  [76, -2.4],
  [79.6, -1.5],
  [79, -6],
  [83, -12],
  [PH.z1, -12],
  [PH.z1, PH.base],
  [PH.z0, PH.base],
];

/** Przekrój terenu (skała) i wody w płaszczyźnie cięcia. */
function groundCap(x: number, plant: boolean): [number, number][] {
  const pts: [number, number][] = [];
  for (let z = -1300; z <= 1300; z += 8) {
    let y = groundH(x, z);
    if (plant && z >= 0 && z <= PH.z1) y = z < PH.z0 ? DAM.base : PH.base;
    if (!plant && z > -195 && z < 220) y = Math.min(y, DAM.base);
    pts.push([z, y]);
  }
  pts.push([1300, -70], [-1300, -70]);
  return pts;
}

/**
 * Wszystkie przekroje w płaszczyźnie cięcia: zapora (z galeriami i otworem rurociągu), część podwodna elektrowni,
 * skała i woda. `level()` – poziom wody w zbiorniku (przekrój wody rośnie razem z nim). `kind` – rodzaj zapory.
 */
export function SectionCaps({ level, kind = 'ciezka' }: { level: () => number; kind?: string }) {
  const n = HMAT();
  const x = CUT_X - 0.02;
  const dam = useMemo(damCapPieces, []);
  const ground = useMemo(() => groundCap(CUT_X, kind === 'ciezka'), [kind]);
  const lake = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!lake.current) return;
    const L = level();
    lake.current.scale.y = L + 70;
    lake.current.position.y = (L - 70) / 2;
  });
  return (
    <group>
      {kind === 'ciezka' && (
        <>
          <Cap pts={dam.upper} holes={dam.inUpper} x={x} m={n.capDam} />
          <Cap pts={dam.lower} holes={dam.inLower} x={x} m={n.capDam} />
          {/* galerie widziane w głąb – ciemne tunele */}
          {GALLERIES.map(([z, y, w, h], i) => (
            <Box key={i} p={[x + 0.4, y + h / 2, z + w / 2]} s={[0.1, h, w]} m={n.capDark} />
          ))}
          <Cap pts={SUB_UPPER} x={x - 0.01} m={n.capDam} />
          <Cap pts={SUB_LOWER} x={x - 0.01} m={n.capDam} />
          {/* ściana betonu za przekrojem (w połowie drogi do sąsiedniego hydrozespołu) */}
          <Cap pts={[[PH.z0, PH.floor - 0.6], [PH.z0, PH.base], [PH.z1, PH.base], [PH.z1, PH.floor - 0.6]]} x={CUT_X + 9} m={n.capDam} />
        </>
      )}
      {kind === 'ziemna' && <EmbankmentCap x={x} />}
      <Cap pts={ground} x={x - 0.03} m={n.capRock} />
      <mesh ref={lake} position={[x + 0.01, 0, -650]} rotation={[0, Math.PI / 2, 0]} material={n.capWater}>
        <planeGeometry args={[1300, 1]} />
      </mesh>
      <mesh position={[x + 0.01, (TAIL - 70) / 2, (PH.z1 + WEIR_Z) / 2]} rotation={[0, Math.PI / 2, 0]} material={n.capWater}>
        <planeGeometry args={[WEIR_Z - PH.z1, TAIL + 70]} />
      </mesh>
    </group>
  );
}

/* ================= teren ================= */

function groundColor(x: number, z: number, y: number, slope: number, c: THREE.Color) {
  const f = fbm(x / 90 + 5, z / 90 - 2);
  if (y < 9.5 && z > 100 && Math.abs(x - cz(z)) < 56) return c.set('#9a917f').lerp(new THREE.Color('#b5ab92'), f);
  if (z < 0 && y < LEVEL + 1.5) return c.set('#8d8470');
  if (slope > 0.75) return c.set('#7d776c').lerp(new THREE.Color('#9a9386'), f);
  return c.set('#4f6b3a').lerp(new THREE.Color('#6f8a4c'), f * 0.8).lerp(new THREE.Color('#4a5f36'), sm(120, 190, y) * 0.5);
}

/** Teren doliny: zbocza z lasem, skały na stromych miejscach, koryto rzeki. */
export function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(2600, 2600, 260, 260);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)) - 0.05);
    g.computeVertexNormals();
    const nrm = g.getAttribute('normal');
    const col: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      groundColor(p.getX(i), p.getZ(i), p.getY(i), 1 - nrm.getY(i), c);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, clippingPlanes: CLIP }), []);
  return (
    <group>
      <mesh geometry={geo} material={mat} />
      {/* dalekie góry za krawędzią terenu */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 150, 0]}>
        <ringGeometry args={[1290, 6000, 48, 1]} />
        <meshStandardMaterial color="#56703f" roughness={1} />
      </mesh>
    </group>
  );
}

/** Woda: zbiornik górny (poziom `level()`), zbiornik dolny pod elektrownią, rzeka za jazem. */
export function Waters({ level, hideLake = false, noPlant = false }: { level: () => number; hideLake?: boolean; noPlant?: boolean }) {
  const n = HMAT();
  const lake = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (lake.current) lake.current.position.y = level() + 0.05 * Math.sin(clock.elapsedTime * 0.7);
  });
  return (
    <group>
      {!hideLake && (
        <mesh ref={lake} rotation={[-Math.PI / 2, 0, 0]} position={[0, LEVEL, -650]} material={n.lake}>
          <planeGeometry args={[2600, 1300]} />
        </mesh>
      )}
      {/* zbiornik dolny: poniżej elektrowni i przelewu aż do jazu */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TAIL, (PH.z1 + WEIR_Z) / 2]} material={n.river}>
        <planeGeometry args={[2600, WEIR_Z - PH.z1]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(PH.x1 + 1300) / 2, TAIL, (PH.z0 + PH.z1) / 2]} material={n.river}>
        <planeGeometry args={[1300 - PH.x1, PH.z1 - PH.z0]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(PH.x0 - 1300) / 2, TAIL, (PH.z0 + PH.z1) / 2]} material={n.river}>
        <planeGeometry args={[1300 + PH.x0, PH.z1 - PH.z0]} />
      </mesh>
      {/* bez elektrowni (inne rodzaje zapór) woda wypełnia też miejsce po budynku */}
      {noPlant && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(PH.x0 + PH.x1) / 2, TAIL, (PH.z0 + PH.z1) / 2]} material={n.river}>
          <planeGeometry args={[PH.x1 - PH.x0, PH.z1 - PH.z0]} />
        </mesh>
      )}
      {/* rzeka za jazem */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, DOWN, (WEIR_Z + 1300) / 2]} material={n.river}>
        <planeGeometry args={[2600, 1300 - WEIR_Z]} />
      </mesh>
    </group>
  );
}

/** Las na zboczach: świerki i buki (nie w wodzie, nie na drogach). */
export function Forest() {
  const n = HMAT();
  const { crowns, trunks, leaves } = useMemo(() => {
    const r = rng(23);
    const pine: V3[] = [];
    const leaf: V3[] = [];
    let guard = 0;
    while (pine.length + leaf.length < 2600 && guard++ < 40000) {
      const x = r() * 2500 - 1250;
      const z = r() * 2500 - 1250;
      const y = groundH(x, z);
      if (y < LEVEL + 3 && z < 30) continue;
      if (y < 11) continue;
      if (Math.abs(x) < 110 && z > -40 && z < 150) continue;
      if (x > SWY.x0 - 30 && x < SWY.x1 + 30 && z > SWY.z0 - 30 && z < SWY.z1 + 30) continue;
      if (fbm(x / 170 + 9, z / 170) < 0.4) continue;
      (y > 120 || r() < 0.55 ? pine : leaf).push([x, y, z]);
    }
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(3.4, 11, 7), n.pine, pine.length);
    const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(4.2, 0), n.leaf, leaf.length);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 8, 5), n.trunk, pine.length + leaf.length);
    const o = new THREE.Object3D();
    let k = 0;
    pine.forEach(([x, y, z], i) => {
      const s = 0.8 + r() * 0.6;
      o.position.set(x, y + 4 * s, z);
      o.scale.setScalar(s);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      trunks.setMatrixAt(k++, o.matrix);
      o.position.set(x, y + 12 * s, z);
      o.updateMatrix();
      crowns.setMatrixAt(i, o.matrix);
    });
    leaf.forEach(([x, y, z], i) => {
      const s = 0.8 + r() * 0.6;
      o.position.set(x, y + 4 * s, z);
      o.scale.setScalar(s);
      o.updateMatrix();
      trunks.setMatrixAt(k++, o.matrix);
      o.position.set(x, y + 10 * s, z);
      o.scale.set(s, s * 1.15, s);
      o.rotation.set(r(), r(), 0);
      o.updateMatrix();
      leaves.setMatrixAt(i, o.matrix);
      o.rotation.set(0, 0, 0);
    });
    return { crowns, trunks, leaves };
  }, [n]);
  return (
    <>
      <primitive object={crowns} />
      <primitive object={leaves} />
      <primitive object={trunks} />
    </>
  );
}

/* ================= zapora ================= */

/** Zamknięcie segmentowe przęsła przelewu: zakrzywiona płyta na ramionach obracających się wokół czopów w filarach. */
function SegmentGate({ x0, x1, open }: { x0: number; x1: number; open: () => number }) {
  const n = HMAT();
  const ref = useRef<THREE.Group>(null);
  const T: [number, number] = [12, 75];
  const R = 11;
  const skin = useMemo(() => {
    const list: { z: number; y: number; a: number }[] = [];
    const N = 7;
    for (let i = 0; i < N; i++) {
      const th = -0.47 + ((i + 0.5) / N) * 0.97;
      list.push({ z: -R * Math.cos(th), y: R * Math.sin(th), a: th });
    }
    return list;
  }, []);
  useFrame(() => {
    if (ref.current) ref.current.rotation.x = open() * 0.62;
  });
  const w = x1 - x0;
  return (
    <group ref={ref} position={[(x0 + x1) / 2, T[1], T[0]]}>
      {skin.map((s, i) => (
        <mesh key={i} position={[0, s.y, s.z]} rotation={[-s.a, 0, 0]} material={n.gate}>
          <boxGeometry args={[w - 0.2, 1.62, 0.35]} />
        </mesh>
      ))}
      {[-1, 1].map((k) => (
        <group key={k}>
          <Beam a={[k * (w / 2 - 0.6), 0, 0]} b={[k * (w / 2 - 0.6), R * Math.sin(-0.4), -R * Math.cos(-0.4)]} w={0.5} m={n.gate} />
          <Beam a={[k * (w / 2 - 0.6), 0, 0]} b={[k * (w / 2 - 0.6), R * Math.sin(0.42), -R * Math.cos(0.42)]} w={0.5} m={n.gate} />
        </group>
      ))}
    </group>
  );
}

/** Zapora ciężka: dwie części pełne, przelew z filarami, zamknięciami i mostem, wloty do rurociągów, korona z drogą. */
export function Dam({ gate }: { gate: () => number }) {
  const n = HMAT();
  return (
    <group>
      <Extrude pts={DAM_PROFILE} x0={DAM.x0} x1={SPILL.x0} m={n.dam} />
      <Extrude pts={DAM_PROFILE} x0={SPILL.x1} x1={DAM.x1} m={n.dam} />
      <Extrude pts={SPILL_PROFILE} x0={SPILL.x0} x1={SPILL.x1} m={n.damDark} />
      {/* filary przelewu, most na koronie, mechanizmy zamknięć */}
      {[SPILL.x0, ...BAYS.map((b) => b[1])].map((x) => (
        <group key={x}>
          <Box p={[x + SPILL.pier / 2, (SPILL.crest - 8 + CREST) / 2, 4]} s={[SPILL.pier, CREST - SPILL.crest + 8, 24]} m={n.dam} />
          <Box p={[x + SPILL.pier / 2, CREST + 2.2, 11]} s={[SPILL.pier + 0.4, 4.4, 3.6]} m={n.white} />
        </group>
      ))}
      {/* most drogowy przed zamknięciami (od strony wody) – podniesione zamknięcia mieszczą się za nim */}
      <Box p={[(SPILL.x0 + SPILL.x1) / 2, CREST - 0.6, -4]} s={[SPILL.x1 - SPILL.x0, 1.2, 8]} m={n.dam} />
      <Box p={[(SPILL.x0 + SPILL.x1) / 2, CREST + 0.05, -4]} s={[SPILL.x1 - SPILL.x0, 0.1, 6]} m={n.road} />
      {[-7.6, -0.4].map((z) => (
        <Box key={z} p={[(SPILL.x0 + SPILL.x1) / 2, CREST + 0.6, z]} s={[SPILL.x1 - SPILL.x0, 1.2, 0.25]} m={n.white} />
      ))}
      {BAYS.map(([a, b]) => (
        <SegmentGate key={a} x0={a} x1={b} open={gate} />
      ))}
      {/* ściany boczne koryta przelewu i niecka wypadowa u stopy */}
      {[SPILL.x0 - 1.6, SPILL.x1].map((x) => (
        <Extrude key={x} pts={SPILL_WALL} x0={x} x1={x + 1.6} m={n.dam} />
      ))}
      <Box p={[(SPILL.x0 + SPILL.x1) / 2, -4.5, (zFace(0) + PH.z1) / 2]} s={[SPILL.x1 - SPILL.x0, 1, PH.z1 - zFace(0)]} m={n.damDark} />
      <Box p={[(SPILL.x0 + SPILL.x1) / 2, -2.5, PH.z1 - 2]} s={[SPILL.x1 - SPILL.x0, 3.5, 2.5]} m={n.dam} />
      {/* wloty do rurociągów: kraty na ścianie od strony wody i szczeliny zamknięć awaryjnych */}
      {UNITS.map((u) => (
        <group key={u}>
          <Box p={[u, 42, -3.5]} s={[10, 18, 7]} m={n.dam} />
          <mesh position={[u, 42, -7.06]} rotation={[0, Math.PI, 0]} material={n.rack}>
            <planeGeometry args={[8.4, 14]} />
          </mesh>
          <Box p={[u, (51 + CREST) / 2, -1.2]} s={[7, CREST - 51, 1.4]} m={n.damDark} />
          <Box p={[u, CREST + 1.5, 4]} s={[8, 3, 5]} m={n.white} />
        </group>
      ))}
      {/* korona: droga, balustrady, latarnie */}
      {[
        [DAM.x0, SPILL.x0],
        [SPILL.x1, DAM.x1],
      ].map(([a, b]) => (
        <group key={a}>
          <Box p={[(a + b) / 2, CREST + 0.05, DAM.crestW / 2]} s={[b - a, 0.1, DAM.crestW - 2]} m={n.road} />
          {[0.4, DAM.crestW - 0.4].map((z) => (
            <Box key={z} p={[(a + b) / 2, CREST + 0.6, z]} s={[b - a, 1.2, 0.25]} m={n.white} />
          ))}
        </group>
      ))}
      {Array.from({ length: 16 }, (_, i) => -300 + i * 40).filter((x) => x < SPILL.x0 - 3 || x > SPILL.x1 + 3).map((x) => (
        <group key={x}>
          <CylY p={[x, CREST, 0.6]} r={0.15} h={6} m={n.steelDark} seg={6} />
          <Box p={[x, CREST + 6, 1.3]} s={[0.4, 0.3, 1.6]} m={n.steelDark} />
        </group>
      ))}
      {/* budynek sterowni zamknięć na koronie */}
      <Box p={[82, CREST + 4, 5]} s={[14, 8, 10]} m={n.hall} />
      <Box p={[82, CREST + 8.3, 5]} s={[15, 0.6, 11]} m={n.roof} />
    </group>
  );
}

/** Rurociąg hydrozespołu (wewnątrz zapory) – rysowany tylko dla przekroju (z bliska widać wnętrze). */
export function Penstock({ u }: { u: number }) {
  const n = HMAT();
  const pts = useMemo(() => PEN.map(([z, y]) => [u, y, z] as V3), [u]);
  return <Pipe pts={pts} r={PEN_R} m={n.lining} seg={24} />;
}

/* ================= hydrozespół ================= */

/** Spirala: rura zwijająca się wokół kierownicy, coraz cieńsza (odcinki torusa). */
export function Spiral({ cover = true }: { cover?: boolean }) {
  const n = HMAT();
  const segs = useMemo(
    () =>
      Array.from({ length: 11 }, (_, k) => {
        const r = 2.4 * Math.sqrt(1 - k / 12);
        return { r, R: TU.rVane + 0.7 + r, a0: (k / 11) * Math.PI * 1.85 };
      }),
    [],
  );
  return (
    <group>
      {segs.map((s, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, s.a0]} material={n.spiral}>
          <torusGeometry args={[s.R, s.r, 12, 10, (Math.PI * 1.85) / 11 + 0.02]} />
        </mesh>
      ))}
      {/* pierścień kierownicy (górny i dolny) */}
      {(cover ? [-0.85, 0.85] : [-0.85]).map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={n.steel}>
          <ringGeometry args={[TU.rRun + 0.2, TU.rVane + 0.9, 48]} />
        </mesh>
      ))}
    </group>
  );
}

/** Łopatki kierownicy – obracają się, otwierając i zamykając drogę wody do wirnika (`open()` 0…1). */
export function GuideVanes({ open }: { open: () => number }) {
  const n = HMAT();
  const N = 20;
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const k = open();
    refs.current.forEach((m, i) => {
      if (!m) return;
      const a = (i / N) * Math.PI * 2;
      // zamknięte: łopatki leżą stycznie i zachodzą na siebie; otwarte: obrócone o ok. 40°
      m.rotation.y = -a + Math.PI / 2 - 0.08 - k * 0.7;
    });
  });
  return (
    <group>
      {Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2;
        return (
          <mesh key={i} ref={(m) => (refs.current[i] = m)} position={[Math.cos(a) * TU.rVane, 0, -Math.sin(a) * TU.rVane]} material={n.vane}>
            <boxGeometry args={[1.15, 1.6, 0.12]} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Wirnik Francisa: wieniec górny, pierścień dolny i zakrzywione łopatki. */
export function FrancisRunner({ scale = 1 }: { scale?: number }) {
  const n = HMAT();
  const blades = useMemo(() => Array.from({ length: 13 }, (_, i) => (i / 13) * Math.PI * 2), []);
  return (
    <group scale={scale}>
      <mesh position={[0, 0.75, 0]} material={n.runner}>
        <cylinderGeometry args={[0.7, TU.rRun, 0.5, 40]} />
      </mesh>
      <mesh position={[0, -0.9, 0]} material={n.runner}>
        <cylinderGeometry args={[TU.rRun - 0.05, TU.rRun - 0.35, 0.9, 40, 1, true]} />
      </mesh>
      {blades.map((a) => (
        <group key={a} rotation={[0, a, 0]}>
          <mesh position={[1.35, -0.1, 0]} rotation={[0.55, 0.35, -0.25]} material={n.runner}>
            <boxGeometry args={[1.5, 1.5, 0.09]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.6, 0]} material={n.runner}>
        <coneGeometry args={[0.6, 1.6, 20]} />
      </mesh>
    </group>
  );
}

/** Generator: stojan z uzwojeniem (miedź), wirnik z 24 biegunami, krzyżaki, obudowa. `cut` – widać wnętrze. */
function Generator({ spinRef, cut }: { spinRef: React.RefObject<THREE.Group>; cut: boolean }) {
  const n = HMAT();
  const poles = useMemo(() => Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2), []);
  return (
    <group>
      {/* stojan: rdzeń z blach i uzwojenie */}
      <CylY p={[0, GEN.y0, 0]} r={GEN.r} h={GEN.y1 - GEN.y0} m={n.stator} seg={48} open />
      <CylY p={[0, GEN.y0, 0]} r={GEN.rIn + 0.15} h={GEN.y1 - GEN.y0} m={n.coil} seg={48} open />
      <mesh position={[0, GEN.y1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={n.stator}>
        <ringGeometry args={[GEN.rIn + 0.15, GEN.r, 48]} />
      </mesh>
      <mesh position={[0, GEN.y0, 0]} rotation={[Math.PI / 2, 0, 0]} material={n.stator}>
        <ringGeometry args={[GEN.rIn + 0.15, GEN.r, 48]} />
      </mesh>
      {/* wirnik z biegunami */}
      <group ref={spinRef}>
        <CylY p={[0, GEN.y0 + 0.2, 0]} r={GEN.rIn - 0.9} h={GEN.y1 - GEN.y0 - 0.4} m={n.steelDark} seg={32} />
        {poles.map((a) => (
          <mesh key={a} position={[Math.cos(a) * (GEN.rIn - 0.5), (GEN.y0 + GEN.y1) / 2, Math.sin(a) * (GEN.rIn - 0.5)]} rotation={[0, -a, 0]} material={n.pole}>
            <boxGeometry args={[0.7, GEN.y1 - GEN.y0 - 0.6, 0.95]} />
          </mesh>
        ))}
        {/* znacznik obrotu na wale */}
        <Box p={[0.62, GEN.y1 + 2.2, 0]} s={[0.25, 0.8, 0.25]} m={n.yellow} />
      </group>
      {/* krzyżak górny i obudowa (ścianka na podłodze hali) */}
      {[0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => (
        <Box key={a} p={[0, GEN.y1 + 0.5, 0]} s={[2 * GEN.r + 1, 0.6, 0.7]} r={[0, a, 0]} m={n.steelDark} />
      ))}
      {!cut && (
        <>
          <CylY p={[0, PH.floor, 0]} r={GEN.r + 0.7} h={GEN.y1 + 1 - PH.floor} m={n.genCase} seg={48} />
          <mesh position={[0, GEN.y1 + 1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={n.yellow}>
            <ringGeometry args={[GEN.r - 0.4, GEN.r + 0.7, 48]} />
          </mesh>
          <CylY p={[0, GEN.y1 + 1, 0]} r={2.2} h={1.4} m={n.genCase} seg={32} />
        </>
      )}
    </group>
  );
}

/**
 * Hydrozespół o osi x = u: spirala, kierownica, wirnik, rura ssawna, wał i generator. `spin()` – kąt obrotu wału,
 * `open()` – otwarcie kierownicy. `detail` – pełne wnętrze (dla hydrozespołu w przekroju); pozostałe – tylko generator.
 */
export function HydroUnit({ u, spin, open, detail, cut }: { u: number; spin: () => number; open: () => number; detail: boolean; cut: boolean }) {
  const n = HMAT();
  const runner = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const shaft = useRef<THREE.Group>(null);
  useFrame(() => {
    const a = spin();
    if (runner.current) runner.current.rotation.y = a;
    if (rotor.current) rotor.current.rotation.y = a;
    if (shaft.current) shaft.current.rotation.y = a;
  });
  const draft = useMemo<V3[]>(
    () => [
      [0, -6, 0.6],
      [0, -8.6, 3],
      [0, -9, 12],
      [0, -9, PH.z1 - TU.z],
    ],
    [],
  );
  return (
    <group position={[u, TU.y, TU.z]}>
      {detail && (
        <>
          <Spiral />
          <GuideVanes open={open} />
          <group ref={runner}>
            <FrancisRunner />
          </group>
          {/* rura ssawna: stożek pod wirnikiem i kolano do wylotu pod wodą */}
          <mesh position={[0, -3.6, 0]} material={n.lining}>
            <cylinderGeometry args={[TU.rRun - 0.3, 2.8, 4.8, 32, 1, true]} />
          </mesh>
          <Pipe pts={draft} r={2.9} m={n.lining} seg={20} />
          <group ref={shaft}>
            <CylY p={[0, 0.9, 0]} r={0.55} h={GEN.y1 + 2.5} m={n.shaft} seg={20} />
            <Box p={[0.6, 5, 0]} s={[0.2, 1.2, 0.2]} m={n.yellow} />
          </group>
          {/* łożysko prowadzące turbiny i pokrywa */}
          <CylY p={[0, 1.1, 0]} r={TU.rVane + 0.4} h={0.5} m={n.steel} seg={40} />
          <CylY p={[0, 1.6, 0]} r={1.3} h={1.4} m={n.steelDark} seg={24} />
        </>
      )}
      <group position={[0, -TU.y, -TU.z]}>
        <group position={[0, 0, TU.z]}>
          <Generator spinRef={rotor} cut={cut && detail} />
        </group>
      </group>
    </group>
  );
}

/* ================= elektrownia ================= */

/**
 * Budynek elektrowni: część podwodna z betonu, hala maszyn z oknami, dach, suwnica. `open` – zdjęty dach i ściana
 * od strony doliny, `cut` – przy przekroju część podwodna kończy się w połowie drogi do sąsiedniego hydrozespołu.
 */
export function Powerhouse({ open, cut }: { open: boolean; cut: boolean }) {
  const n = HMAT();
  const subX0 = cut ? CUT_X + 9 : PH.x0;
  const W = PH.x1 - PH.x0;
  const cx = (PH.x0 + PH.x1) / 2;
  const hz = (PH.z0 + PH.hallZ1) / 2;
  const H = PH.roof - PH.floor;
  return (
    <group>
      {/* część podwodna i pomost za halą */}
      <Box p={[(subX0 + PH.x1) / 2, (PH.base + PH.floor) / 2, (PH.z0 + PH.z1) / 2]} s={[PH.x1 - subX0, PH.floor - PH.base, PH.z1 - PH.z0]} m={n.concrete} />
      {cut && <Box p={[(PH.x0 + CUT_X + 9) / 2, PH.floor - 0.3, (PH.z0 + PH.z1) / 2]} s={[CUT_X + 9 - PH.x0, 0.6, PH.z1 - PH.z0]} m={n.floor} />}
      {/* hala maszyn */}
      <Box p={[cx, PH.floor + H / 2, PH.z0 + 0.3]} s={[W, H, 0.6]} m={n.hall} />
      {!open && <Box p={[cx, PH.floor + H / 2, PH.hallZ1]} s={[W, H, 0.6]} m={n.hall} />}
      {[PH.x0, PH.x1].map((x) => (
        <Box key={x} p={[x, PH.floor + H / 2, hz]} s={[0.6, H, PH.hallZ1 - PH.z0]} m={n.hall} />
      ))}
      {!open && <Box p={[cx, PH.roof + 0.4, hz]} s={[W + 1, 0.8, PH.hallZ1 - PH.z0 + 1]} m={n.roof} />}
      <Box p={[cx, PH.floor + 0.05, hz]} s={[W, 0.1, PH.hallZ1 - PH.z0]} m={n.floor} />
      {/* tory i suwnica */}
      {[PH.z0 + 1.4, PH.hallZ1 - 1.4].map((z) => (
        <Box key={z} p={[cx, PH.roof - 4, z]} s={[W, 0.8, 0.8]} m={n.rail} />
      ))}
      <Box p={[-11, PH.roof - 3, hz]} s={[2.2, 1.6, PH.hallZ1 - PH.z0 - 2]} m={n.yellow} />
      <Box p={[-11, PH.roof - 4.4, hz - 4]} s={[3, 1.4, 3]} m={n.orange} />
      {/* sterownia przy końcu hali */}
      <Box p={[PH.x1 - 5, PH.floor + 4, hz]} s={[8, 8, 18]} m={n.white} />
      <Box p={[PH.x1 - 9.05, PH.floor + 5, hz]} s={[0.1, 3, 14]} m={n.glass} />
      {/* transformatory blokowe na pomoście i bramka linii */}
      {UNITS.map((u) => (
        <group key={u} position={[u, PH.floor, TRAFO_Z]}>
          <Box p={[0, 3, 0]} s={[6, 6, 5]} m={n.trafo} />
          <Box p={[0, 3, 3.6]} s={[5, 5, 2]} m={n.steelDark} />
          {[-1.8, 0, 1.8].map((x) => (
            <CylY key={x} p={[x, 6, -1]} r={0.3} h={3} m={n.white} />
          ))}
        </group>
      ))}
      {[-64, -56].map((x) => (
        <Box key={x} p={[x, PH.floor + 10, TRAFO_Z + 2]} s={[0.8, 20, 0.8]} m={n.steel} />
      ))}
      <Box p={[-60, PH.floor + 19.6, TRAFO_Z + 2]} s={[9, 0.8, 0.8]} m={n.steel} />
    </group>
  );
}

/* ================= sieć ================= */

function Pylon({ p }: { p: V3 }) {
  const n = HMAT();
  const h = 36;
  return (
    <group position={p}>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([x, z], i) => (
        <Beam key={i} a={[x * 4, 0, z * 4]} b={[x * 0.8, h, z * 0.8]} w={0.35} m={n.steel} />
      ))}
      {[18, 26, 34].map((y, i) => (
        <Box key={y} p={[0, y, 0]} s={[0.8, 0.5, 18 - i * 3]} m={n.steel} />
      ))}
    </group>
  );
}

/** Rozdzielnia na terasie, linia od elektrowni i linia 220 kV na zachód. */
export function Switchyard() {
  const n = HMAT();
  const wires = useMemo(() => {
    const pts: V3[] = [[-60, PH.floor + 19, TRAFO_Z + 2], [SWY.x1 - 6, SWY.y + 18, SWY.z0 + 14], [SWY.x0 + 8, SWY.y + 18, SWY.z0 + 40], ...PYLONS.map((p) => [p[0], p[1] + 30, p[2]] as V3)];
    return [-4, 0, 4].map((dz) => {
      const line: V3[] = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          line.push([mix(a[0], b[0], t), mix(a[1], b[1], t) - 14 * t * (1 - t), mix(a[2], b[2], t) + dz]);
        }
      }
      return line;
    });
  }, []);
  return (
    <group>
      <Box p={[(SWY.x0 + SWY.x1) / 2, SWY.y + 0.05, (SWY.z0 + SWY.z1) / 2]} s={[SWY.x1 - SWY.x0, 0.2, SWY.z1 - SWY.z0]} m={n.floor} />
      {[SWY.z0 + 14, SWY.z0 + 40, SWY.z1 - 14].map((z) => (
        <group key={z}>
          {[SWY.x0 + 8, SWY.x1 - 6].map((x) => (
            <Box key={x} p={[x, SWY.y + 10, z]} s={[0.8, 20, 0.8]} m={n.steel} />
          ))}
          <Box p={[(SWY.x0 + SWY.x1) / 2, SWY.y + 19.6, z]} s={[SWY.x1 - SWY.x0 - 12, 0.8, 0.8]} m={n.steel} />
        </group>
      ))}
      {Array.from({ length: 5 }, (_, i) =>
        [-8, 0, 8].map((dx) => <CylY key={`${i}${dx}`} p={[(SWY.x0 + SWY.x1) / 2 + dx, SWY.y, SWY.z0 + 22 + i * 14]} r={0.4} h={6} m={n.white} />),
      )}
      <Box p={[SWY.x0 + 10, SWY.y + 3, SWY.z1 - 6]} s={[14, 6, 8]} m={n.white} />
      {PYLONS.map((p, i) => (
        <Pylon key={i} p={p} />
      ))}
      {wires.map((w, i) => (
        <Pipe key={i} pts={w} r={0.12} m={n.cable} seg={5} />
      ))}
    </group>
  );
}

/* ================= jaz zbiornika dolnego i przepławka ================= */

/** Przepławka: schodki basenów przy brzegu – ryby przepływają z jednego do drugiego pod prąd. */
export const FISH = Array.from({ length: 9 }, (_, i) => {
  const z = WEIR_Z - 34 + i * 9;
  return { z, y: mix(TAIL - 0.6, DOWN - 0.2, i / 8), x: cz(z) - 37 };
});
export function Weir() {
  const n = HMAT();
  const x = cz(WEIR_Z);
  return (
    <group>
      <Box p={[x, (WEIR_Y - 4) / 2, WEIR_Z]} s={[118, WEIR_Y + 4, 8]} m={n.dam} />
      <Extrude pts={[[WEIR_Z + 4, WEIR_Y], [WEIR_Z + 14, -1.5], [WEIR_Z + 4, -1.5]]} x0={x - 59} x1={x + 49} m={n.damDark} />
      {/* most na jazie */}
      <Box p={[x, WEIR_Y + 4, WEIR_Z]} s={[124, 0.8, 6]} m={n.dam} />
      {[-40, -10, 20, 48].map((dx) => (
        <Box key={dx} p={[x + dx, WEIR_Y + 2, WEIR_Z]} s={[2, 4, 7]} m={n.dam} />
      ))}
      {/* przepławka – kaskada basenów przy lewym brzegu */}
      {FISH.map((f, i) => (
        <group key={i} position={[f.x, f.y, f.z]}>
          <Box p={[0, -1, 0]} s={[8, 0.6, 9]} m={n.concrete} />
          <Box p={[-4, 0.2, 0]} s={[0.5, 3, 9]} m={n.concrete} />
          <Box p={[4, 0.2, 0]} s={[0.5, 3, 9]} m={n.concrete} />
          <Box p={[1.4, 0.2, 4.5]} s={[5.2, 3, 0.4]} m={n.concrete} />
          <mesh position={[0, 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]} material={n.river}>
            <planeGeometry args={[7.5, 8.6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ================= inne rodzaje zapór ================= */

/** Zapora łukowa: cienka, wygięta w stronę wody – napór przenosi na skalne zbocza doliny. */
export function ArchDam() {
  const n = HMAT();
  const Rc = 330;
  const geo = useMemo(() => {
    const t = (y: number) => 5 + 17 * (1 - (y - DAM.base) / (CREST - DAM.base));
    const pts: THREE.Vector2[] = [];
    for (let y = DAM.base; y <= CREST + 0.01; y += 4) pts.push(new THREE.Vector2(Rc - t(y), y));
    pts.push(new THREE.Vector2(Rc - 5, CREST), new THREE.Vector2(Rc, CREST), new THREE.Vector2(Rc, DAM.base), new THREE.Vector2(Rc - t(DAM.base), DAM.base));
    return new THREE.LatheGeometry(pts, 80, Math.PI - 1.05, 2.1);
  }, []);
  return <mesh geometry={geo} material={n.concrete} position={[0, 0, Rc]} />;
}
/** Zapora ziemna: nasyp z kamieni i ziemi o łagodnych skarpach, w środku uszczelnienie z gliny. */
export const EMB: [number, number][] = [
  [-190, DAM.base],
  [-2, CREST + 2],
  [10, CREST + 2],
  [215, DAM.base],
];
export const EMB_CORE: [number, number][] = [
  [-40, DAM.base],
  [0, CREST],
  [8, CREST],
  [48, DAM.base],
];
export function Embankment() {
  const n = HMAT();
  return (
    <group>
      <Extrude pts={EMB} x0={DAM.x0} x1={DAM.x1} m={n.riprap} />
      <Box p={[0, CREST + 2.1, 4]} s={[DAM.x1 - DAM.x0, 0.2, 10]} m={n.road} />
    </group>
  );
}
function EmbankmentCap({ x }: { x: number }) {
  const n = HMAT();
  return (
    <group>
      <Cap pts={EMB} x={x} m={n.capFill} />
      <Cap pts={EMB_CORE} x={x - 0.02} m={n.capClay} />
    </group>
  );
}

/** Pomocnicze do śledzenia rozmiarów (przekrój zapory ciężkiej w punktach) – dla wykresu siły. */
export const damArea = () => {
  let a = 0;
  const p = DAM_PROFILE;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};
