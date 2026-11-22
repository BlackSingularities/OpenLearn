/*
 * Komputer osobisty – materiały, tekstury rysowane w canvasie i małe klocki do budowania modeli
 * (prostopadłościan, walec w dowolnej osi, rura po punktach, wentylator).
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rng, type V3 } from './pcGeo';

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Laminat płyty głównej: czarna maska z ledwo widocznymi ścieżkami i polami lutowniczymi. */
function boardTex(base: string, trace: string, seed: number) {
  return canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 512, 512);
      const r = rng(seed);
      g.strokeStyle = trace;
      g.lineWidth = 1.4;
      for (let i = 0; i < 140; i++) {
        let x = r() * 512;
        let y = r() * 512;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          const horiz = r() < 0.5;
          const d = (r() - 0.5) * 160;
          if (horiz) x += d;
          else y += d;
          // odcinki pod kątem 45° jak na prawdziwych płytkach
          if (r() < 0.4) {
            x += 12;
            y += 12;
          }
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(210,190,120,0.55)';
      for (let i = 0; i < 260; i++) g.fillRect(r() * 512, r() * 512, 2, 2);
    },
    true,
  );
}

/** Napis na obudowie układu scalonego. */
export function chipTex(lines: string[], bg = '#1a1c20', fg = '#9aa0a8') {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = fg;
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center';
    lines.forEach((l, i) => g.fillText(l, 128, 128 - ((lines.length - 1) * 36) / 2 + i * 36 + 10));
    g.beginPath();
    g.arc(26, 230, 9, 0, Math.PI * 2);
    g.fill();
  });
}

/** Siatka kreskowania przekroju. */
function hatchTex(bg: string, line: string) {
  return canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, 64, 64);
      g.strokeStyle = line;
      g.lineWidth = 3;
      for (let k = -64; k < 128; k += 12) {
        g.beginPath();
        g.moveTo(k, 64);
        g.lineTo(k + 64, 0);
        g.stroke();
      }
    },
    true,
  );
}

/** Słoje drewna blatu. */
function woodTex() {
  return canvasTex(
    512,
    256,
    (g) => {
      g.fillStyle = '#b48a5e';
      g.fillRect(0, 0, 512, 256);
      const r = rng(5);
      for (let i = 0; i < 90; i++) {
        const y = r() * 256;
        g.strokeStyle = `rgba(${90 + r() * 40},${60 + r() * 20},${30},${0.15 + r() * 0.2})`;
        g.lineWidth = 1 + r() * 3;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 70 + i) * 4);
        g.stroke();
      }
    },
    true,
  );
}

/** Deski podłogi. */
function floorTex() {
  return canvasTex(
    512,
    512,
    (g) => {
      const r = rng(9);
      for (let i = 0; i < 8; i++) {
        const c = 120 + r() * 30;
        g.fillStyle = `rgb(${c},${c * 0.78},${c * 0.55})`;
        g.fillRect(0, i * 64, 512, 64);
        g.fillStyle = 'rgba(40,25,10,0.5)';
        g.fillRect(0, i * 64, 512, 2);
        const cut = r() * 512;
        g.fillRect(cut, i * 64, 2, 64);
      }
    },
    true,
  );
}

/** Siatka otworów (panel przedni, osłona zasilacza). */
function meshTex() {
  return canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = '#26292e';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#0b0c0e';
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.beginPath();
        g.arc(8 + x * 16 + (y % 2) * 8, 8 + y * 16, 5, 0, Math.PI * 2);
        g.fill();
      }
    },
    true,
  );
}

let M: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const mesh = meshTex();
  mesh.repeat.set(10, 18);
  const wood = woodTex();
  wood.repeat.set(2, 1);
  const floor = floorTex();
  floor.repeat.set(6, 6);
  const board = boardTex('#16181b', 'rgba(70,78,88,0.55)', 3);
  board.repeat.set(1, 1);
  const gboard = boardTex('#1f5a35', 'rgba(140,190,120,0.55)', 4);
  return {
    case: std('#1d2024', { metalness: 0.4, roughness: 0.45 }),
    caseIn: std('#2a2e33', { metalness: 0.3, roughness: 0.6, side: THREE.DoubleSide }),
    frontMesh: std('#ffffff', { map: mesh, roughness: 0.8 }),
    glass: new THREE.MeshBasicMaterial({ color: '#b9cde0', transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
    board: std('#ffffff', { map: board, roughness: 0.55 }),
    greenBoard: std('#ffffff', { map: gboard, roughness: 0.55 }),
    boardEdge: std('#0f1012', { roughness: 0.6 }),
    chip: std('#17191c', { roughness: 0.45 }),
    chipGrey: std('#3a3d42', { roughness: 0.45 }),
    die: std('#2b2350', { metalness: 0.7, roughness: 0.25 }),
    dieShine: std('#6a5fb0', { metalness: 0.9, roughness: 0.15 }),
    silicon: std('#6f7588', { metalness: 0.6, roughness: 0.3 }),
    alu: std('#b8bec6', { metalness: 0.8, roughness: 0.3 }),
    aluDark: std('#4b5058', { metalness: 0.7, roughness: 0.35 }),
    heatsink: std('#2b2f35', { metalness: 0.6, roughness: 0.4 }),
    copper: std('#c8773a', { metalness: 0.85, roughness: 0.3 }),
    nickel: std('#cfd3d8', { metalness: 0.9, roughness: 0.22 }),
    gold: std('#d9b04a', { metalness: 0.9, roughness: 0.25 }),
    solder: std('#c9ccd0', { metalness: 0.8, roughness: 0.3 }),
    plastic: std('#202226', { roughness: 0.55 }),
    plasticGrey: std('#5c6068', { roughness: 0.55 }),
    plasticWhite: std('#e9e9e4', { roughness: 0.5 }),
    beige: std('#d8ccb0', { roughness: 0.65 }),
    beigeDark: std('#b5a988', { roughness: 0.7 }),
    slot: std('#141518', { roughness: 0.5 }),
    slotGrey: std('#8a8f96', { roughness: 0.5 }),
    cable: std('#15161a', { roughness: 0.8 }),
    cableRed: std('#c0392b', { roughness: 0.6 }),
    cableYellow: std('#e5b52a', { roughness: 0.6 }),
    sleeve: std('#2b2d31', { roughness: 0.9 }),
    fanBlade: std('#2a2d32', { roughness: 0.5, side: THREE.DoubleSide }),
    fanFrame: std('#1a1c1f', { roughness: 0.6 }),
    rubber: std('#0d0e10', { roughness: 0.95 }),
    capacitor: std('#2f3d5c', { metalness: 0.4, roughness: 0.4 }),
    capTop: std('#c0c4ca', { metalness: 0.8, roughness: 0.3 }),
    choke: std('#303236', { metalness: 0.3, roughness: 0.6 }),
    ferrite: std('#3b3b3b', { roughness: 0.8 }),
    battery: std('#d9dde2', { metalness: 0.95, roughness: 0.2 }),
    psu: std('#151619', { metalness: 0.5, roughness: 0.45 }),
    hdd: std('#a9aeb5', { metalness: 0.8, roughness: 0.35 }),
    platter: std('#e6e9ee', { metalness: 1, roughness: 0.08 }),
    wood: std('#ffffff', { map: wood, roughness: 0.65 }),
    floor: std('#ffffff', { map: floor, roughness: 0.7 }),
    wall: std('#e9e5dc', { roughness: 0.95 }),
    wallDark: std('#c9c3b6', { roughness: 0.95 }),
    steel: std('#8c939c', { metalness: 0.7, roughness: 0.35 }),
    steelDark: std('#3c4148', { metalness: 0.6, roughness: 0.45 }),
    keycap: std('#2a2c30', { roughness: 0.6 }),
    keycapLight: std('#d9d9d4', { roughness: 0.6 }),
    screenOff: std('#0a0b0d', { roughness: 0.15, metalness: 0.2 }),
    red: std('#d33a2c', { roughness: 0.5 }),
    blue: std('#2f6fd6', { roughness: 0.5 }),
    green: std('#2fa35a', { roughness: 0.5 }),
    yellow: std('#f2c230', { roughness: 0.5 }),
    orange: std('#e67e22', { roughness: 0.5 }),
    purple: std('#8e5bd6', { roughness: 0.5 }),
    white: std('#f3f3ef', { roughness: 0.6 }),
    tubeGlass: new THREE.MeshPhysicalMaterial({ color: '#d7e3ea', transparent: true, opacity: 0.28, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
    glow: new THREE.MeshBasicMaterial({ color: '#ff9a3c', toneMapped: false }),
    glowBlue: new THREE.MeshBasicMaterial({ color: '#7cc7ff', toneMapped: false }),
    ledWhite: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    ledGreen: new THREE.MeshBasicMaterial({ color: '#4ade80', toneMapped: false }),
    ledRed: new THREE.MeshBasicMaterial({ color: '#ff4d4d', toneMapped: false }),
    // przekroje
    cutAlu: std('#ffffff', { map: hatchTex('#d5dae0', '#aab1ba') }),
    cutCopper: std('#ffffff', { map: hatchTex('#e3a06a', '#c47b42') }),
    cutBoard: std('#ffffff', { map: hatchTex('#6f8a56', '#56703f') }),
    cutPlastic: std('#ffffff', { map: hatchTex('#5a5e66', '#43464d') }),
    cutSilicon: std('#ffffff', { map: hatchTex('#8a86b8', '#6c6899') }),
    pedestal: std('#262b33', { roughness: 0.8 }),
    pedestalTop: std('#323844', { roughness: 0.7 }),
  };
}
export const MAT = () => (M ??= makeMats());
export type Mats = ReturnType<typeof makeMats>;

/* ================= klocki ================= */

export function Box({ p, s, m, r }: { p: V3; s: V3; m: THREE.Material; r?: V3 }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}
/** Walec o osi `axis` (x, y albo z), środek w `p`. */
export function Cyl({ p, r, h, m, axis = 'y', seg = 24, r2, open = false, theta }: { p: V3; r: number; h: number; m: THREE.Material; axis?: 'x' | 'y' | 'z'; seg?: number; r2?: number; open?: boolean; theta?: [number, number] }) {
  const rot: V3 = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={p} rotation={rot} material={m}>
      <cylinderGeometry args={[r2 ?? r, r, h, seg, 1, open, theta?.[0] ?? 0, theta?.[1] ?? Math.PI * 2]} />
    </mesh>
  );
}
/** Rura (kabel, rurka cieplna) po punktach – gładka krzywa. */
export function Tube({ pts, r, m, seg = 8, smooth = true }: { pts: V3[]; r: number; m: THREE.Material; seg?: number; smooth?: boolean }) {
  const geo = useMemo(() => {
    const v = pts.map((p) => new THREE.Vector3(...p));
    const curve = smooth ? new THREE.CatmullRomCurve3(v, false, 'centripetal') : new THREE.CurvePath<THREE.Vector3>();
    if (!smooth) for (let i = 1; i < v.length; i++) (curve as THREE.CurvePath<THREE.Vector3>).add(new THREE.LineCurve3(v[i - 1], v[i]));
    return new THREE.TubeGeometry(curve as THREE.Curve<THREE.Vector3>, Math.max(16, pts.length * 10), r, seg, false);
  }, [pts, r, seg, smooth]);
  return <mesh geometry={geo} material={m} />;
}

/** Wiązka kabli: kilka równoległych żył obok siebie (np. kabel ATX 24-pin w oplocie). */
export function Bundle({ pts, n, r, m, spread = 0.3, axis = 'z' }: { pts: V3[]; n: number; r: number; m: THREE.Material; spread?: number; axis?: 'x' | 'y' | 'z' }) {
  const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const lines = useMemo(
    () =>
      Array.from({ length: n }, (_, i) =>
        pts.map((p) => {
          const q = [...p] as V3;
          q[k] += (i - (n - 1) / 2) * spread;
          return q;
        }),
      ),
    [pts, n, spread, k],
  );
  return (
    <group>
      {lines.map((l, i) => (
        <Tube key={i} pts={l} r={r} m={m} seg={6} />
      ))}
    </group>
  );
}

/** Łopatka wentylatora: wygięta płytka (wycinek pierścienia skręcony wzdłuż promienia). */
const BLADE = new Map<string, THREE.BufferGeometry>();
function bladeGeo(r0: number, r1: number, sweep: number, pitch: number) {
  const key = [r0, r1, sweep, pitch].join(':');
  const hit = BLADE.get(key);
  if (hit) return hit;
  const S = 6;
  const T = 8;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= S; i++)
    for (let j = 0; j <= T; j++) {
      const r = r0 + ((r1 - r0) * i) / S;
      const a = (j / T - 0.5) * sweep + (i / S) * 0.35;
      const y = (j / T - 0.5) * pitch;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      if (i && j) {
        const o = i * (T + 1) + j;
        idx.push(o - T - 2, o - 1, o, o - T - 2, o, o - T - 1);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  BLADE.set(key, g);
  return g;
}

/**
 * Wentylator o średnicy `d` (cm), oś wzdłuż `axis`. `spin()` – prędkość obrotu (obr/s na ekranie), `frame` – kwadratowa
 * ramka. Łopatki się kręcą.
 */
export function Fan({ p, d, axis = 'x', spin, frame = true, blades = 7, m }: { p: V3; d: number; axis?: 'x' | 'y' | 'z'; spin: () => number; frame?: boolean; blades?: number; m?: Mats }) {
  const n = m ?? MAT();
  const rot = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rot.current) rot.current.rotation.y += Math.min(dt, 0.05) * spin() * Math.PI * 2;
  });
  const R = d / 2 - 0.4;
  const geo = bladeGeo(R * 0.36, R, (Math.PI * 2) / blades * 0.75, d * 0.12);
  const orient: V3 = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  const t = d * 0.21;
  return (
    <group position={p} rotation={orient}>
      {frame && (
        <>
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => <Box key={`${sx}${sz}`} p={[(sx * d) / 2 - (sx * 0.5), 0, (sz * d) / 2 - sz * 0.5]} s={[1, t, 1]} m={n.fanFrame} />),
          )}
          <mesh material={n.fanFrame}>
            <cylinderGeometry args={[d / 2, d / 2, t, 40, 1, true]} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} p={[0, -t / 2 + 0.2, 0]} s={[d * 0.98, 0.35, 0.5]} r={[0, (i * Math.PI) / 2 + Math.PI / 4, 0]} m={n.fanFrame} />
          ))}
        </>
      )}
      <group ref={rot}>
        <mesh material={n.fanFrame}>
          <cylinderGeometry args={[R * 0.36, R * 0.36, t * 0.8, 24]} />
        </mesh>
        <mesh position={[0, t * 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]} material={n.plasticGrey}>
          <circleGeometry args={[R * 0.3, 24]} />
        </mesh>
        {Array.from({ length: blades }, (_, i) => (
          <mesh key={i} geometry={geo} rotation={[0, (i / blades) * Math.PI * 2, 0]} material={n.fanBlade} />
        ))}
      </group>
    </group>
  );
}

/** Podest pracowni: okrągła platforma z jasną krawędzią. */
export function Pedestal({ p, r = 70 }: { p: V3; r?: number }) {
  const n = MAT();
  return (
    <group position={p}>
      <mesh position={[0, 4, 0]} material={n.pedestal}>
        <cylinderGeometry args={[r, r + 4, 8, 64]} />
      </mesh>
      <mesh position={[0, 8.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={n.pedestalTop}>
        <circleGeometry args={[r, 64]} />
      </mesh>
      <mesh position={[0, 8.1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={n.glowBlue}>
        <ringGeometry args={[r - 1.2, r - 0.6, 64]} />
      </mesh>
    </group>
  );
}
