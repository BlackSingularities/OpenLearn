/*
 * Komputer osobisty – wnętrze obudowy w układzie lokalnym komputera (patrz pcGeo): obudowa z szybą, zasilacz
 * pod osłoną, dysk HDD, płyta główna ze wszystkimi złączami, procesor z chłodzeniem wieżowym, pamięci RAM,
 * dysk M.2, karta graficzna, wentylatory i kable. `explode()` (0…1) rozsuwa części w widoku rozłożonym.
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ATX24,
  BIOS,
  CASE,
  CHIPSET,
  CMOS,
  CODEC,
  COOLER,
  DIMM,
  DIMMS,
  EPS,
  FANS_FRONT,
  FAN_REAR,
  GPU,
  HDD,
  M2,
  MB,
  MBZ,
  PCIE,
  PSU,
  SATA,
  SHROUD,
  SOCKET,
  rng,
  type V3,
} from './pcGeo';
import { Box, Bundle, Cyl, Fan, MAT, Tube, chipTex } from './pcMats';

const TEX = new Map<string, THREE.Material>();
/** Materiał z napisem (tekstura z cache). */
export function labelMat(key: string, lines: string[], bg?: string, fg?: string) {
  let m = TEX.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: chipTex(lines, bg, fg), roughness: 0.5 });
    TEX.set(key, m);
  }
  return m;
}

/** Grupa przesuwana w widoku rozłożonym o wektor `off` · explode(). */
export function Ex({ off, explode, children }: { off: V3; explode: () => number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const e = explode();
    if (g.current) g.current.position.set(off[0] * e, off[1] * e, off[2] * e);
  });
  return <group ref={g}>{children}</group>;
}

/* ================= obudowa ================= */

export function CaseShell({ glass, top = true }: { glass: boolean; top?: boolean }) {
  const n = MAT();
  const { x0, x1, y1, z1, wall: w } = CASE;
  const L = x1 - x0;
  return (
    <group>
      {/* ściana za płytą główną, dno, tył */}
      <Box p={[0, y1 / 2, -w / 2]} s={[L, y1, w]} m={n.case} />
      <Box p={[0, w / 2, z1 / 2]} s={[L, w, z1]} m={n.case} />
      <Box p={[x0 - w / 2, y1 / 2, z1 / 2]} s={[w, y1, z1 + w]} m={n.case} />
      {/* góra z filtrem siatkowym i przyciskami */}
      {top && (
        <group>
          <Box p={[0, y1 + w / 2, z1 / 2]} s={[L, w, z1 + w]} m={n.case} />
          <Box p={[-3, y1 + w + 0.02, z1 / 2]} s={[30, 0.05, 15]} m={n.frontMesh} />
          <Cyl p={[19.5, y1 + w + 0.2, z1 / 2]} r={0.7} h={0.4} m={n.plasticGrey} />
          <Cyl p={[19.5, y1 + w + 0.41, z1 / 2]} r={0.25} h={0.05} m={n.ledWhite} />
          {[5, 8.5].map((z) => (
            <Box key={z} p={[19.5, y1 + w + 0.05, z]} s={[0.6, 0.1, 1.3]} m={n.blue} />
          ))}
          <Box p={[19.5, y1 + w + 0.05, 14]} s={[0.4, 0.1, 0.9]} m={n.slot} />
          <Cyl p={[19.5, y1 + w + 0.05, 17]} r={0.3} h={0.1} m={n.slot} />
        </group>
      )}
      {/* przód: panel z siatką */}
      <Box p={[x1 + w / 2, y1 / 2, z1 / 2]} s={[w, y1 + w, z1 + w]} m={n.case} />
      <Box p={[x1 + w + 0.05, y1 / 2 + 0.5, z1 / 2]} s={[0.1, y1 - 3, z1 - 3]} m={n.frontMesh} />
      {/* nóżki */}
      {[x0 + 4, x1 - 4].map((x) =>
        [3, z1 - 3].map((z) => <Cyl key={`${x}${z}`} p={[x, -0.6, z]} r={1.4} h={1.2} m={n.rubber} />),
      )}
      {/* tył: zaślepki slotów, kratka wentylatora */}
      {Array.from({ length: 7 }, (_, i) => (
        <Box key={i} p={[x0 - w - 0.05, 22.6 - i * 2.03, 6]} s={[0.1, 1.5, 9]} m={i < 3 ? n.slot : n.steelDark} />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <Box key={i} p={[x0 - w - 0.05, FAN_REAR.y - 5 + i * 1.25, FAN_REAR.z]} s={[0.1, 0.25, 11]} m={n.steelDark} />
      ))}
      {/* szyba boczna z czarną ramką */}
      {glass && (
        <group>
          <Box p={[0, y1 / 2, z1 + 0.25]} s={[L, y1, 0.4]} m={n.glass} />
          {[
            [0, y1 - 0.9, L, 1.8],
            [0, 0.9, L, 1.8],
          ].map(([x, y, sx, sy], i) => (
            <Box key={i} p={[x, y, z1 + 0.47]} s={[sx, sy, 0.03]} m={n.plastic} />
          ))}
          {[x0 + 0.9, x1 - 0.9].map((x) => (
            <Box key={x} p={[x, y1 / 2, z1 + 0.47]} s={[1.8, y1, 0.03]} m={n.plastic} />
          ))}
        </group>
      )}
    </group>
  );
}

/** Osłona zasilacza (przegroda) z otworem na kable i kratką. */
export function Shroud() {
  const n = MAT();
  const { x0, x1, y } = SHROUD;
  return (
    <group>
      <Box p={[(x0 + x1) / 2, y, CASE.z1 / 2]} s={[x1 - x0, 0.3, CASE.z1]} m={n.caseIn} />
      <Box p={[x1, y / 2, CASE.z1 / 2]} s={[0.3, y, CASE.z1]} m={n.caseIn} />
      <Box p={[-12, y + 0.16, CASE.z1 - 6]} s={[9, 0.02, 5]} m={n.frontMesh} />
      {/* przepust kablowy z gumową osłoną */}
      <Box p={[-1.5, y + 0.17, 3]} s={[4, 0.04, 2.4]} m={n.rubber} />
    </group>
  );
}

/* ================= zasilacz i dysk ================= */

export function Psu({ spin }: { spin: () => number }) {
  const n = MAT();
  const sticker = useMemo(() => labelMat('psu', ['750 W', '80 PLUS GOLD'], '#1b1c20', '#e8c45a'), []);
  const { x0, x1, y0, y1, z0, z1 } = PSU;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  return (
    <group>
      <Box p={[cx, cy, cz]} s={[x1 - x0, y1 - y0, z1 - z0]} m={n.psu} />
      <Box p={[cx, cy, z1 + 0.02]} s={[8, 4, 0.02]} m={sticker} />
      {/* wentylator w dnie (zasysa powietrze od spodu) */}
      <Fan p={[cx, y0 - 0.2, cz]} d={12} axis="y" spin={spin} frame={false} />
      {/* tył: gniazdo sieciowe, włącznik, kratka */}
      <Box p={[x0 - 0.05, 6.5, 6]} s={[0.1, 2.4, 3]} m={n.plastic} />
      {[-0.6, 0, 0.6].map((dz) => (
        <Box key={dz} p={[x0 - 0.12, 6.6, 6 + dz]} s={[0.08, 0.7, 0.25]} m={n.steel} />
      ))}
      <Box p={[x0 - 0.1, 6.5, 9]} s={[0.15, 1.6, 1]} m={n.red} />
      {Array.from({ length: 6 }, (_, i) => (
        <Box key={i} p={[x0 - 0.06, 2 + i * 1.1, 14]} s={[0.05, 0.6, 5.5]} m={n.slot} />
      ))}
      {/* modułowe gniazda kabli z przodu */}
      {[5, 7.5, 10, 12.5, 15].map((z) => (
        <Box key={z} p={[x1 + 0.1, 5, z]} s={[0.2, 1.2, 2]} m={n.slot} />
      ))}
    </group>
  );
}

/** Dysk twardy 3,5″: obudowa z naklejką, złącza SATA z tyłu. */
export function Hdd({ lid = true }: { lid?: boolean }) {
  const n = MAT();
  const sticker = useMemo(() => labelMat('hdd', ['8 TB', '7200 RPM'], '#d7dbe0', '#2b2f35'), []);
  const { x0, x1, y0, y1, z0, z1 } = HDD;
  return (
    <group>
      {lid ? (
        <>
          <Box p={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} s={[x1 - x0, y1 - y0, z1 - z0]} m={n.hdd} />
          <Box p={[(x0 + x1) / 2 + 1, y1 + 0.01, (z0 + z1) / 2]} s={[9, 0.02, 7]} m={sticker} />
        </>
      ) : (
        <>
          {/* odlewana wanna z aluminium: dno i ścianki */}
          <Box p={[(x0 + x1) / 2, y0 + 0.25, (z0 + z1) / 2]} s={[x1 - x0, 0.5, z1 - z0]} m={n.hdd} />
          {[z0 + 0.2, z1 - 0.2].map((z) => (
            <Box key={z} p={[(x0 + x1) / 2, (y0 + y1) / 2, z]} s={[x1 - x0, y1 - y0, 0.4]} m={n.hdd} />
          ))}
          {[x0 + 0.2, x1 - 0.2].map((x) => (
            <Box key={x} p={[x, (y0 + y1) / 2, (z0 + z1) / 2]} s={[0.4, y1 - y0, z1 - z0]} m={n.hdd} />
          ))}
        </>
      )}
      <Box p={[x0 - 0.1, 1.8, 7]} s={[0.2, 0.6, 2.2]} m={n.slot} />
      <Box p={[x0 - 0.1, 1.8, 10.5]} s={[0.2, 0.6, 1.4]} m={n.slot} />
    </group>
  );
}

/* ================= pamięć RAM i dysk M.2 ================= */

/** Mleczny pasek podświetlenia z tęczowym gradientem, który powoli przesuwa się wzdłuż modułu. */
let RGB: THREE.MeshBasicMaterial | null = null;
function rgbMat() {
  if (RGB) return RGB;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 256, 0);
  ['#ff3d6e', '#ffb43d', '#4dff8a', '#3dc8ff', '#a63dff', '#ff3d6e'].forEach((col, i, arr) => gr.addColorStop(i / (arr.length - 1), col));
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI / 2;
  RGB = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  return RGB;
}
/** Przesuwa gradient podświetlenia (wywoływane co klatkę ze sceny). */
export function tickRgb(dt: number) {
  if (RGB?.map) RGB.map.offset.x = (RGB.map.offset.x + dt * 0.15) % 1;
}

/**
 * Moduł RAM DDR5: laminat z kośćmi pamięci po obu stronach, złocone styki, radiator. Układ lokalny: długość wzdłuż
 * y (13,3 cm), wysokość wzdłuż z, grubość wzdłuż x. Punkt (0,0,0) – środek dolnej krawędzi styków.
 */
export function RamStick({ heatspreader = true }: { heatspreader?: boolean }) {
  const n = MAT();
  const chip = useMemo(() => labelMat('dram', ['DDR5'], '#16181b', '#80868f'), []);
  const label = useMemo(() => labelMat('ram', ['32 GB', 'DDR5-6000'], '#25282d', '#f2f2f2'), []);
  return (
    <group>
      <Box p={[0, 0, 1.55]} s={[0.12, 13.3, 3.1]} m={n.greenBoard} />
      {/* złocone styki: 2 × 144 */}
      {[-1, 1].map((s) => (
        <Box key={s} p={[s * 0.065, 0, 0.35]} s={[0.01, 13, 0.6]} m={n.gold} />
      ))}
      <Box p={[0, 0.9, 0.2]} s={[0.14, 0.2, 0.4]} m={n.slot} />
      {/* kości DRAM: po 4 na stronę */}
      {[-1, 1].map((s) =>
        [-4.6, -1.6, 1.8, 4.8].map((y) => <Box key={`${s}${y}`} p={[s * 0.12, y, 1.8]} s={[0.1, 1.1, 1.3]} m={chip} />),
      )}
      <Box p={[0.12, 0, 2.7]} s={[0.08, 0.6, 0.5]} m={n.chip} />
      {heatspreader &&
        [-1, 1].map((s) => (
          <group key={s}>
            <Box p={[s * 0.32, 0, 2.3]} s={[0.1, 13.4, 3.4]} m={n.aluDark} />
            <Box p={[s * 0.38, 0, 2.4]} s={[0.02, 5, 1.2]} m={label} />
          </group>
        ))}
      {heatspreader && <Box p={[0, 0, 4.05]} s={[0.74, 13.4, 0.2]} m={n.aluDark} />}
      {heatspreader && <Box p={[0, 0, 4.3]} s={[0.5, 13, 0.3]} m={rgbMat()} />}
    </group>
  );
}

/** Dysk SSD M.2 2280: laminat, kontroler, dwie kości NAND, kość DRAM, złocone styki. Długość wzdłuż x, szerokość y. */
export function M2Ssd() {
  const n = MAT();
  const ctrl = useMemo(() => labelMat('ctrl', ['CONTROLLER'], '#1c1e22', '#9ba1a9'), []);
  const nand = useMemo(() => labelMat('nand', ['NAND', '1 TB'], '#16181b', '#9ba1a9'), []);
  return (
    <group>
      <Box p={[0, 0, 0.04]} s={[8, 2.2, 0.08]} m={n.board} />
      <Box p={[-3.85, 0, 0.04]} s={[0.3, 2.2, 0.085]} m={n.gold} />
      <Box p={[-2.6, 0, 0.17]} s={[1.3, 1.3, 0.18]} m={ctrl} />
      <Box p={[-1.1, 0, 0.13]} s={[0.8, 1, 0.1]} m={n.chip} />
      {[0.7, 2.6].map((x) => (
        <Box key={x} p={[x, 0, 0.17]} s={[1.5, 1.6, 0.16]} m={nand} />
      ))}
      <Cyl p={[3.9, 0, 0.1]} r={0.25} h={0.1} m={n.gold} axis="z" />
    </group>
  );
}

/* ================= procesor i chłodzenie ================= */

/** Procesor w obudowie LGA: laminat z kondensatorami, metalowa osłona (IHS) z napisem. */
export function CpuPackage() {
  const n = MAT();
  const top = useMemo(() => labelMat('cpu', ['CORE i7', '14700K'], '#c9cdd2', '#40454c'), []);
  const w = 3.75;
  const h = 4.5;
  return (
    <group>
      <Box p={[0, 0, 0.06]} s={[w, h, 0.12]} m={n.greenBoard} />
      <Box p={[0, 0, 0.27]} s={[3.2, 3.9, 0.3]} m={n.nickel} />
      <Box p={[0, 0, 0.425]} s={[2.4, 2.4, 0.01]} m={top} />
      {/* wycięcia osłony i kondensatory przy krawędzi */}
      {[-1, 1].map((s) => (
        <Box key={s} p={[s * 1.7, 0, 0.18]} s={[0.25, 1.2, 0.1]} m={n.greenBoard} />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <Box key={i} p={[-1.55 + (i % 5) * 0.75, i < 5 ? -2.05 : 2.05, 0.14]} s={[0.12, 0.08, 0.05]} m={n.solder} />
      ))}
    </group>
  );
}

/** Gniazdo LGA1700: plastikowa podstawa, metalowa ramka dociskowa i dźwignia. `open` – podniesiona ramka. */
export function Socket({ open = false }: { open?: boolean }) {
  const n = MAT();
  return (
    <group>
      <Box p={[0, 0, 0.17]} s={[5.4, 6.4, 0.34]} m={n.slot} />
      {!open &&
        [
          [0, 3, 5.6, 0.5],
          [0, -3, 5.6, 0.5],
          [2.6, 0, 0.45, 6],
          [-2.6, 0, 0.45, 6],
        ].map(([x, y, sx, sy], i) => <Box key={i} p={[x, y, 0.38]} s={[sx, sy, 0.08]} m={n.steel} />)}
      {/* dźwignia */}
      <Box p={[3.1, -0.2, 0.42]} s={[0.12, 6.2, 0.12]} m={n.steel} />
      <Box p={[3.1, 3.05, 0.42]} s={[0.6, 0.12, 0.12]} m={n.steel} />
      {/* pola styków (1700 sprężynek) */}
      <Box p={[0, 0, 0.345]} s={[3.6, 4.3, 0.01]} m={n.gold} />
    </group>
  );
}

/**
 * Chłodzenie wieżowe: miedziana podstawa, 4 rurki cieplne w kształcie litery U, pakiet 42 aluminiowych żeber
 * i wentylator 12 cm z przodu. Układ: środek podstawy na (0,0,0), wieża rośnie w +z, powietrze płynie w −x.
 */
export function TowerCooler({ spin, fins = true }: { spin: () => number; fins?: boolean }) {
  const n = MAT();
  const { w, d, h } = COOLER;
  const finZ = useMemo(() => Array.from({ length: 42 }, (_, i) => 3.6 + (i * (h - 3.8)) / 41), [h]);
  const pipes = [-1.8, -0.6, 0.6, 1.8];
  return (
    <group>
      <Box p={[0, 0, 0.3]} s={[4, 4, 0.6]} m={n.copper} />
      <Box p={[0, 0, 0.9]} s={[4.4, 4.2, 0.6]} m={n.nickel} />
      {pipes.map((y, i) => (
        <Tube
          key={y}
          pts={[
            [-1.7 - (i % 2) * 0.5, y, h + 0.2],
            [-1.7 - (i % 2) * 0.5, y, 2.4],
            [-1.2, y, 0.75],
            [1.2, y, 0.75],
            [1.7 + (i % 2) * 0.5, y, 2.4],
            [1.7 + (i % 2) * 0.5, y, h + 0.2],
          ]}
          r={0.3}
          m={n.copper}
          seg={10}
        />
      ))}
      {fins &&
        finZ.map((z) => (
          <Box key={z} p={[0, 0, z]} s={[d, w, 0.05]} m={n.alu} />
        ))}
      <Box p={[0, 0, h + 0.15]} s={[d + 0.1, w + 0.1, 0.3]} m={n.aluDark} />
      <Fan p={[d / 2 + 1.4, 0, 3.6 + (h - 3.6) / 2]} d={12} axis="x" spin={spin} />
    </group>
  );
}

/* ================= płyta główna ================= */

/**
 * Laminat płyty głównej narysowany w skali: czarna maska, wiązki ścieżek (procesor → pamięć, procesor → slot PCIe,
 * procesor → chipset), białe nadruki – obrysy złączy i ich nazwy, jak na prawdziwej płycie.
 */
let MB_MAT: THREE.MeshStandardMaterial | null = null;
function mbMat() {
  if (MB_MAT) return MB_MAT;
  const W = 1024;
  const H = Math.round((W * (MB.y1 - MB.y0)) / (MB.x1 - MB.x0));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const k = W / (MB.x1 - MB.x0);
  const u = (x: number) => (x - MB.x0) * k;
  const v = (y: number) => (MB.y1 - y) * k;
  g.fillStyle = '#131518';
  g.fillRect(0, 0, W, H);
  // wiązki ścieżek: kilkanaście równoległych linii z załamaniami
  const bundle = (pts: [number, number][], n: number, gap: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = 1.3;
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * gap;
      g.beginPath();
      pts.forEach(([x, y], j) => {
        const px = u(x);
        const py = v(y) + o;
        if (j) g.lineTo(px, py);
        else g.moveTo(px, py);
      });
      g.stroke();
    }
  };
  const tr = 'rgba(78,88,100,0.9)';
  bundle([[SOCKET.x + 2.6, SOCKET.y + 1.2], [-4.5, SOCKET.y + 1.2], [-3.4, 35.5], [DIMMS[3] + 0.4, 35.5]], 14, 2.2, tr);
  bundle([[SOCKET.x + 2.6, SOCKET.y - 1.4], [-4.5, SOCKET.y - 1.4], [-3.4, 29.6], [DIMMS[3] + 0.4, 29.6]], 14, 2.2, tr);
  bundle([[SOCKET.x - 1, SOCKET.y - 3.4], [SOCKET.x - 1, 27.6], [-14.5, 24.2], [-14.5, PCIE.y + 0.5]], 16, 2.4, tr);
  bundle([[SOCKET.x + 1.6, SOCKET.y - 3.4], [SOCKET.x + 1.6, 26], [-4.2, 22.6], [CHIPSET.x, CHIPSET.y + 2.3]], 8, 2.2, tr);
  bundle([[CHIPSET.x + 2.4, CHIPSET.y], [SATA.x - 0.8, SATA.y]], 8, 2.2, tr);
  bundle([[CHIPSET.x - 2.4, CHIPSET.y - 0.6], [-12, 16.8], [CODEC.x + 1, CODEC.y]], 6, 2.2, tr);
  bundle([[-15, 30], [-20.5, 30]], 10, 2.4, tr);
  // pola lutownicze drobnych elementów (rezystory, kondensatory)
  const r = rng(91);
  g.fillStyle = 'rgba(200,180,110,0.75)';
  for (let i = 0; i < 260; i++) {
    const x = MB.x0 + r() * (MB.x1 - MB.x0);
    const y = MB.y0 + r() * (MB.y1 - MB.y0);
    g.fillRect(u(x), v(y), 4, 2);
    g.fillRect(u(x) + 7, v(y), 4, 2);
  }
  // nadruki: obrysy i nazwy
  g.strokeStyle = '#e8eaee';
  g.fillStyle = '#e8eaee';
  g.lineWidth = 2;
  const box = (x: number, y: number, w: number, h: number) => g.strokeRect(u(x - w / 2), v(y + h / 2), w * k, h * k);
  const txt = (str: string, x: number, y: number, size = 16, rot = 0) => {
    g.save();
    g.translate(u(x), v(y));
    g.rotate(rot);
    g.font = `bold ${size}px sans-serif`;
    g.textAlign = 'center';
    g.fillText(str, 0, size / 3);
    g.restore();
  };
  box(SOCKET.x, SOCKET.y, 6, 7);
  txt('LGA1700', SOCKET.x, SOCKET.y - 3.95, 15);
  DIMMS.forEach((x, i) => txt(['DDR5_A1', 'DDR5_A2', 'DDR5_B1', 'DDR5_B2'][i], x, DIMM.y0 - 1.3, 11, -Math.PI / 2));
  txt('PCIE_1  x16', -15, PCIE.y - 0.95, 15);
  txt('PCIE_2', -18.2, 19.95, 13);
  txt('PCIE_3', -15, 16.3, 13);
  txt('M2_1', M2.x0 - 1.3, M2.y + 1.6, 14);
  txt('ATX_PWR', ATX24.x - 1.1, ATX24.y, 13, -Math.PI / 2);
  txt('CPU_PWR1', EPS.x + 0.9, EPS.y - 0.9, 13);
  txt('SATA', SATA.x - 1, SATA.y + 2.4, 13);
  txt('BAT1', CMOS.x, CMOS.y + 1.5, 13);
  txt('BIOS', BIOS.x, BIOS.y + 0.6, 12);
  txt('AUDIO', CODEC.x, CODEC.y + 1, 13);
  txt('CPU_FAN', -12, 44.75, 12);
  txt('SYS_FAN1', -2, 44.75, 12);
  txt('JFP1', -8, 15.05, 12);
  txt('USB3_F', 1.3, 24.2, 12, -Math.PI / 2);
  txt('Z790 GAMING', -2, 21.6, 22);
  // granica części dźwiękowej (odizolowana)
  g.setLineDash([8, 6]);
  g.strokeRect(u(-21.3), v(19), 5.3 * k, 4.8 * k);
  g.setLineDash([]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  MB_MAT = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.1 });
  return MB_MAT;
}

function Caps({ list, r = 0.3, h = 0.8 }: { list: [number, number][]; r?: number; h?: number }) {
  const n = MAT();
  return (
    <group>
      {list.map(([x, y], i) => (
        <group key={i}>
          <Cyl p={[x, y, MBZ + h / 2]} r={r} h={h} m={n.capacitor} axis="z" seg={14} />
          <Cyl p={[x, y, MBZ + h + 0.01]} r={r * 0.92} h={0.02} m={n.capTop} axis="z" seg={14} />
        </group>
      ))}
    </group>
  );
}

/** Złącze (gniazdo) z otworami: czarny klocek z rzędami styków. */
function Header({ p, s, m }: { p: V3; s: V3; m?: THREE.Material }) {
  const n = MAT();
  return <Box p={[p[0], p[1], MBZ + s[2] / 2]} s={s} m={m ?? n.slot} />;
}

/** Slot PCIe wzdłuż x od x0 do x1 na wysokości y. `steel` – wzmocniony metalem. */
function PcieSlot({ y, x0, x1, steel = false, m }: { y: number; x0: number; x1: number; steel?: boolean; m?: THREE.Material }) {
  const n = MAT();
  return (
    <group>
      <Box p={[(x0 + x1) / 2, y, MBZ + 0.55]} s={[x1 - x0, 0.75, 1.1]} m={m ?? n.slot} />
      {steel && <Box p={[(x0 + x1) / 2, y, MBZ + 0.56]} s={[x1 - x0 + 0.1, 0.8, 1.05]} m={n.steel} />}
      <Box p={[(x0 + x1) / 2, y, MBZ + 1.11]} s={[x1 - x0 - 0.2, 0.18, 0.02]} m={n.rubber} />
      <Box p={[x1 + 0.3, y, MBZ + 0.6]} s={[0.6, 0.8, 1.2]} m={m ?? n.slot} />
    </group>
  );
}

export function Motherboard({ ram = true, cpu = true, m2 = true }: { ram?: boolean; cpu?: boolean; m2?: boolean }) {
  const n = MAT();
  const chipset = useMemo(() => labelMat('chipset', ['Z790'], '#2a2d32', '#c7ccd3'), []);
  const bios = useMemo(() => labelMat('bios', ['BIOS'], '#141518', '#9aa0a8'), []);
  const codec = useMemo(() => labelMat('codec', ['AUDIO'], '#2a2d32', '#c7ccd3'), []);
  const brand = useMemo(() => labelMat('brand', ['GAMING'], '#2b2f35', '#e0e4ea'), []);
  const { x0, x1, y0, y1, z, th } = MB;
  const holes: [number, number][] = [
    [x0 + 0.6, y1 - 0.6],
    [x0 + 0.6, 30],
    [x0 + 0.6, y0 + 1.2],
    [-8, y1 - 0.6],
    [-8, y0 + 1.2],
    [x1 - 0.6, y1 - 0.6],
    [x1 - 0.6, 30],
    [x1 - 0.6, y0 + 1.2],
    [-8, 30],
  ];
  const chokesL = Array.from({ length: 8 }, (_, i) => 28.4 + i * 1.45);
  const chokesT = Array.from({ length: 6 }, (_, i) => -12.6 + i * 1.45);
  const caps = useMemo<[number, number][]>(() => {
    const r = rng(12);
    const list: [number, number][] = [];
    for (let i = 0; i < 8; i++) list.push([-11.8, 28.4 + i * 1.45 + (r() - 0.5) * 0.2]);
    for (let i = 0; i < 4; i++) list.push([-4.6 + i * 0.75, 16]);
    return list;
  }, []);
  return (
    <group>
      {/* laminat i kołki dystansowe */}
      <Box p={[(x0 + x1) / 2, (y0 + y1) / 2, z + th / 2]} s={[x1 - x0, y1 - y0, th]} m={mbMat()} />
      {holes.map(([x, y], i) => (
        <group key={i}>
          <Cyl p={[x, y, z / 2]} r={0.3} h={z} m={n.gold} axis="z" seg={6} />
          <Cyl p={[x, y, MBZ + 0.02]} r={0.35} h={0.04} m={n.solder} axis="z" seg={12} />
        </group>
      ))}
      {/* gniazdo procesora i procesor */}
      <group position={[SOCKET.x, SOCKET.y, MBZ]}>
        <Socket />
        {cpu && (
          <group position={[0, 0, 0.35]}>
            <CpuPackage />
          </group>
        )}
      </group>
      {/* sekcja zasilania procesora (VRM): dławiki, tranzystory pod radiatorami, kondensatory */}
      {chokesL.map((y) => (
        <Box key={y} p={[-13.3, y, MBZ + 0.35]} s={[0.95, 0.95, 0.7]} m={n.choke} />
      ))}
      {chokesT.map((x) => (
        <Box key={x} p={[x, 40.7, MBZ + 0.35]} s={[0.95, 0.95, 0.7]} m={n.choke} />
      ))}
      <Caps list={caps} r={0.25} h={0.7} />
      <group>
        <Box p={[-15.4, 34, MBZ + 1.5]} s={[2, 12.5, 3]} m={n.heatsink} />
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i} p={[-15.4 + (i - 2.5) * 0.34, 34, MBZ + 3.05]} s={[0.12, 12.5, 0.2]} m={n.aluDark} />
        ))}
        <Box p={[-8.8, 42.6, MBZ + 1.3]} s={[11, 1.9, 2.6]} m={n.heatsink} />
        <Box p={[-8.8, 42.6, MBZ + 2.62]} s={[4, 1, 0.02]} m={brand} />
      </group>
      {/* osłona tylnych złączy */}
      <Box p={[-19.6, 37.2, MBZ + 1.9]} s={[3.6, 14, 3.8]} m={n.plastic} />
      <Box p={[-17.75, 37.2, MBZ + 1.9]} s={[0.05, 9, 0.4]} m={n.ledWhite} />
      {/* złącza zasilania */}
      <Header p={[EPS.x, EPS.y, 0]} s={[1.7, 0.85, 1.2]} />
      <Header p={[EPS.x + 2, EPS.y, 0]} s={[0.85, 0.85, 1.2]} />
      <Header p={[ATX24.x, ATX24.y, 0]} s={[0.85, 5.4, 1.3]} />
      {/* sloty pamięci z zatrzaskami i moduły RAM w kanałach A2 i B2 */}
      {DIMMS.map((x, i) => (
        <group key={x}>
          <Box p={[x, (DIMM.y0 + DIMM.y1) / 2, MBZ + 0.4]} s={[0.7, DIMM.y1 - DIMM.y0 + 0.6, 0.8]} m={i % 2 ? n.slot : n.slotGrey} />
          {[DIMM.y0 - 0.45, DIMM.y1 + 0.45].map((y) => (
            <Box key={y} p={[x, y, MBZ + 0.75]} s={[0.7, 0.5, 1.4]} m={n.plasticGrey} />
          ))}
          {ram && i % 2 === 1 && (
            <group position={[x, (DIMM.y0 + DIMM.y1) / 2, MBZ + 0.2]}>
              <RamStick />
            </group>
          )}
        </group>
      ))}
      {/* sloty PCIe */}
      <PcieSlot y={PCIE.y} x0={PCIE.x0} x1={PCIE.x1} steel />
      <PcieSlot y={18.8} x0={-19.5} x1={-17} />
      <PcieSlot y={15.3} x0={PCIE.x0} x1={PCIE.x1} m={n.slotGrey} />
      {/* złącze M.2 z dyskiem i radiatorem */}
      <group>
        {m2 && (
          <group position={[(M2.x0 + M2.x1) / 2, M2.y, MBZ + 0.35]}>
            <M2Ssd />
          </group>
        )}
        <Box p={[M2.x0 - 0.3, M2.y, MBZ + 0.3]} s={[0.6, 2.4, 0.6]} m={n.slot} />
        <Box p={[(M2.x0 + M2.x1) / 2 + 0.2, M2.y, MBZ + 0.9]} s={[8.4, 2.5, 0.5]} m={n.heatsink} />
        {Array.from({ length: 5 }, (_, i) => (
          <Box key={i} p={[M2.x0 + 1 + i * 1.6, M2.y, MBZ + 1.16]} s={[0.15, 2.5, 0.05]} m={n.aluDark} />
        ))}
      </group>
      {/* chipset z radiatorem */}
      <Box p={[CHIPSET.x, CHIPSET.y, MBZ + 0.15]} s={[2.4, 2.4, 0.3]} m={n.chip} />
      <Box p={[CHIPSET.x, CHIPSET.y, MBZ + 0.6]} s={[4.4, 4, 0.6]} m={n.heatsink} />
      <Box p={[CHIPSET.x, CHIPSET.y, MBZ + 0.91]} s={[2.6, 1.2, 0.02]} m={chipset} />
      {/* SATA, USB z przodu, złącza wentylatorów i panelu przedniego */}
      {[0, 1, 2, 3].map((i) => (
        <Box key={i} p={[SATA.x, SATA.y - 1.6 + i * 0.95, MBZ + 0.35]} s={[1.1, 0.75, 0.6]} m={n.slot} />
      ))}
      <Header p={[2.3, 24.2, 0]} s={[0.9, 2.2, 0.9]} m={n.blue} />
      <Header p={[2.3, 21.6, 0]} s={[0.7, 1.4, 0.9]} />
      <Header p={[-8, 14.5, 0]} s={[1.6, 0.6, 0.8]} />
      <Header p={[-3, 14.5, 0]} s={[1.2, 0.6, 0.8]} />
      {[
        [-12, 44],
        [-2, 44],
        [2.3, 36],
        [-14.5, 14.5],
      ].map(([x, y], i) => (
        <Header key={i} p={[x, y, 0]} s={[0.9, 0.5, 0.7]} m={n.white} />
      ))}
      {/* bateria podtrzymująca ustawienia (CR2032) i kość BIOS */}
      <Cyl p={[CMOS.x, CMOS.y, MBZ + 0.17]} r={1.05} h={0.34} m={n.slot} axis="z" seg={28} />
      <Cyl p={[CMOS.x, CMOS.y, MBZ + 0.36]} r={1} h={0.06} m={n.battery} axis="z" seg={28} />
      <Box p={[BIOS.x, BIOS.y, MBZ + 0.08]} s={[0.8, 0.5, 0.16]} m={bios} />
      {/* układ dźwiękowy: kodek, złote kondensatory, oddzielona ścieżka */}
      <Box p={[CODEC.x, CODEC.y, MBZ + 0.1]} s={[1, 1, 0.2]} m={codec} />
      {[
        [-17.5, 15.4],
        [-16.6, 15.4],
        [-17.5, 17.6],
      ].map(([x, y], i) => (
        <group key={i}>
          <Cyl p={[x, y, MBZ + 0.4]} r={0.3} h={0.8} m={n.gold} axis="z" seg={14} />
        </group>
      ))}
      <Box p={[-16.2, 16.5, MBZ + 0.005]} s={[0.05, 4.5, 0.01]} m={n.ledWhite} />
      {/* tylne złącza wystające przez obudowę */}
      <RearIo />
    </group>
  );
}

/** Tylny panel złączy płyty głównej (widoczny z tyłu obudowy). */
function RearIo() {
  const n = MAT();
  const x = CASE.x0 - CASE.wall - 0.15;
  return (
    <group>
      <Box p={[CASE.x0 - CASE.wall - 0.05, 38, 3]} s={[0.1, 13.4, 4.4]} m={n.steelDark} />
      {/* USB (niebieskie i czerwone), sieć, HDMI, DisplayPort, audio, antena */}
      {[33, 35, 40.5, 42.5].map((y, i) => (
        <group key={y}>
          {[2.2, 3.8].map((z) => (
            <Box key={z} p={[x, y, z]} s={[0.3, 0.6, 1.3]} m={i === 3 ? n.red : n.blue} />
          ))}
        </group>
      ))}
      <Box p={[x, 37.6, 3]} s={[0.4, 1.5, 1.6]} m={n.steel} />
      <Box p={[x - 0.05, 37.6, 3]} s={[0.35, 1.2, 1.3]} m={n.slot} />
      <Box p={[x, 31.4, 2.4]} s={[0.3, 0.6, 1.5]} m={n.slot} />
      <Box p={[x, 31.4, 4.1]} s={[0.3, 0.6, 1.1]} m={n.slot} />
      {[
        [44, 2.2, n.green],
        [44, 3.5, n.blue],
        [44, 4.7, n.white],
      ].map(([y, z, m], i) => (
        <Cyl key={i} p={[x, y as number, z as number]} r={0.35} h={0.3} m={m as THREE.Material} axis="x" seg={12} />
      ))}
      {[2, 4.3].map((z) => (
        <Cyl key={z} p={[x - 0.2, 29.7, z]} r={0.3} h={0.6} m={n.gold} axis="x" seg={8} />
      ))}
    </group>
  );
}

/* ================= karta graficzna ================= */

/**
 * Karta graficzna (układ komputera, leży poziomo pod slotem PCIe): laminat z układem GPU i pamięciami, tylna
 * płytka, radiator z żebrami i rurkami, osłona z trzema wentylatorami skierowanymi w dół, śledź ze złączami.
 */
export function Gpu({ spin, shroud = true }: { spin: () => number; shroud?: boolean }) {
  const n = MAT();
  const logo = useMemo(() => labelMat('gpu', ['GEFORCE RTX'], '#1d1f23', '#7ee08a'), []);
  const { x0, x1, y, z0, z1, cool } = GPU;
  const L = x1 - x0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const fins = useMemo(() => Array.from({ length: 70 }, (_, i) => x0 + 1.5 + (i * (L - 3)) / 69), [x0, L]);
  const fanX = [x0 + 6.3, cx + 0.4, x1 - 5.2];
  // osłona: płyta z trzema okrągłymi otworami na wentylatory (kształt w płaszczyźnie x–z)
  const shroudGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(x0, z0);
    s.lineTo(x1, z0);
    s.lineTo(x1, z1);
    s.lineTo(x0, z1);
    s.closePath();
    for (const x of fanX) {
      const h = new THREE.Path();
      h.absarc(x, (z0 + z1) / 2, 4.5, 0, Math.PI * 2, true);
      s.holes.push(h);
    }
    return new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false, curveSegments: 32 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <group>
      {/* laminat ze złączem krawędziowym */}
      <Box p={[cx, y - 0.08, cz]} s={[L, 0.16, z1 - z0]} m={n.board} />
      <Box p={[(PCIE.x0 + PCIE.x1) / 2, y - 0.08, z0 - 0.5]} s={[PCIE.x1 - PCIE.x0 - 0.4, 0.16, 1]} m={n.board} />
      <Box p={[(PCIE.x0 + PCIE.x1) / 2, y - 0.08, z0 - 0.75]} s={[PCIE.x1 - PCIE.x0 - 0.4, 0.17, 0.5]} m={n.gold} />
      {/* tylna płytka */}
      <Box p={[cx, y + 0.2, cz]} s={[L, 0.3, z1 - z0]} m={n.aluDark} />
      <Box p={[cx + 6, y + 0.36, cz]} s={[8, 0.02, 2.5]} m={logo} />
      {/* radiator: żebra i rurki cieplne */}
      {fins.map((x) => (
        <Box key={x} p={[x, y - 0.4 - (cool - 1.2) / 2, cz]} s={[0.05, cool - 1.2, z1 - z0 - 0.6]} m={n.alu} />
      ))}
      {[4.5, 6.5, 8.5, 10.5].map((z) => (
        <Cyl key={z} p={[cx, y - 1.3, z]} r={0.3} h={L - 1.5} m={n.copper} axis="x" seg={10} />
      ))}
      {/* osłona i wentylatory */}
      {shroud && (
        <group>
          <mesh geometry={shroudGeo} position={[0, y - cool + 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} material={n.plastic} />
          {fanX.map((x) => (
            <Fan key={x} p={[x, y - cool + 0.75, cz]} d={8.8} axis="y" spin={spin} frame={false} blades={11} />
          ))}
          <Box p={[cx, y - cool + 0.2, z1 - 0.1]} s={[L, cool - 0.4, 0.25]} m={n.plastic} />
          <Box p={[cx, y - cool + 1.4, z1 + 0.02]} s={[L - 4, 0.15, 0.05]} m={n.ledGreen} />
        </group>
      )}
      {/* złącze zasilania 16-pin na górnej krawędzi */}
      <Box p={[x1 - 9, y - 0.6, z1 + 0.25]} s={[2, 0.9, 0.5]} m={n.slot} />
      {/* śledź ze złączami monitora */}
      <Box p={[x0 - 0.1, y - 2.8, 6.5]} s={[0.15, 6.2, 12]} m={n.steel} />
      {[3, 5.4, 7.8].map((z) => (
        <Box key={z} p={[x0 - 0.3, y - 1.3, z]} s={[0.3, 0.6, 1.8]} m={n.slot} />
      ))}
      <Box p={[x0 - 0.3, y - 1.3, 10.2]} s={[0.3, 0.6, 1.5]} m={n.slot} />
      {Array.from({ length: 8 }, (_, i) => (
        <Box key={i} p={[x0 - 0.2, y - 3.6, 2 + i * 1.3]} s={[0.1, 2.2, 0.7]} m={n.slot} />
      ))}
    </group>
  );
}

/** Układ GPU z pamięciami na odsłoniętym laminacie (widok z dołu, bez radiatora). */
export function GpuChips() {
  const n = MAT();
  const vram = useMemo(() => labelMat('vram', ['GDDR6X'], '#16181b', '#9ba1a9'), []);
  const gpu = useMemo(() => labelMat('gpudie', ['AD104'], '#3a3550', '#c7c3e6'), []);
  const { y } = GPU;
  const cx = -7;
  const cz = 7.5;
  return (
    <group>
      <Box p={[cx, y - 0.2, cz]} s={[4.2, 0.08, 4.2]} m={n.greenBoard} />
      <Box p={[cx, y - 0.3, cz]} s={[2.6, 0.12, 2.6]} m={gpu} />
      {[
        [-3.4, 0],
        [3.4, 0],
        [0, -3.4],
        [0, 3.4],
        [-3.4, 2.6],
        [3.4, 2.6],
      ].map(([dx, dz], i) => (
        <Box key={i} p={[cx + dx, y - 0.22, cz + dz]} s={[1.4, 0.1, 1.2]} m={vram} />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <Box key={i} p={[2 + (i % 5) * 1.3, y - 0.45, 4 + Math.floor(i / 5) * 1.4]} s={[1, 0.6, 1]} m={n.choke} />
      ))}
    </group>
  );
}

/* ================= kable ================= */

export function Cables() {
  const n = MAT();
  // 24-pin: z zasilacza przez przepust w osłonie, płasko przy ścianie obok płyty, do złącza z boku
  const p24 = useMemo<V3[]>(
    () => [
      [-7.2, 5, 9],
      [-3.5, 8, 4],
      [-1.5, 10.6, 2.2],
      [4.3, 13.5, 1.4],
      [4.3, 27, 1.4],
      [ATX24.x + 1.6, ATX24.y, 1.6],
      [ATX24.x + 0.5, ATX24.y, MBZ + 0.65],
    ],
    [],
  );
  const eps = useMemo<V3[]>(
    () => [
      [-7.2, 6.5, 6],
      [-12, 10, 2.2],
      [-21.2, 14, 1.9],
      [-21.2, 44, 1.9],
      [EPS.x, 45.6, MBZ + 1.5],
      [EPS.x, EPS.y, MBZ + 1.3],
    ],
    [],
  );
  // 16-pin karty: z przepustu przy przodzie osłony w górę do złącza na górnej krawędzi karty
  const pcie = useMemo<V3[]>(
    () => [
      [-7.2, 7.5, 15],
      [-1, 10.7, 16],
      [2, 14, 16.5],
      [GPU.x1 - 9, GPU.y - 0.6, GPU.z1 + 1.6],
      [GPU.x1 - 9, GPU.y - 0.6, GPU.z1 + 0.5],
    ],
    [],
  );
  const sata = useMemo<V3[]>(
    () => [
      [-7.2, 4, 5],
      [1, 3, 5.5],
      [HDD.x0 - 0.3, 1.8, 7],
    ],
    [],
  );
  return (
    <group>
      <Bundle pts={p24} n={12} r={0.16} m={n.sleeve} spread={0.34} axis="y" />
      <Bundle pts={eps} n={4} r={0.15} m={n.sleeve} spread={0.32} axis="z" />
      <Bundle pts={pcie} n={6} r={0.15} m={n.sleeve} spread={0.32} axis="x" />
      <Tube pts={sata} r={0.25} m={n.cable} />
      <Tube
        pts={[
          [SATA.x + 0.6, SATA.y, MBZ + 0.4],
          [4, 15, 4],
          [3, 8, 6],
          [HDD.x0 - 0.3, 1.8, 10.5],
        ]}
        r={0.12}
        m={n.cableRed}
      />
    </group>
  );
}

/* ================= cały komputer ================= */

/** Wentylatory obudowy: trzy z przodu (wlot), jeden z tyłu (wylot). */
export function CaseFans({ spin }: { spin: () => number }) {
  return (
    <group>
      {FANS_FRONT.map((y) => (
        <Fan key={y} p={[CASE.x1 - 1.6, y, CASE.z1 / 2]} d={12} axis="x" spin={spin} />
      ))}
      <Fan p={[CASE.x0 + 1.6, FAN_REAR.y, FAN_REAR.z]} d={12} axis="x" spin={spin} />
    </group>
  );
}

/** Pierścień podświetlenia wentylatorów z przodu (dekoracja). */
export function FanRings() {
  const n = MAT();
  return (
    <group>
      {FANS_FRONT.map((y) => (
        <mesh key={y} position={[CASE.x1 - 0.1, y, CASE.z1 / 2]} rotation={[0, Math.PI / 2, 0]} material={n.glowBlue}>
          <ringGeometry args={[5.5, 5.8, 48]} />
        </mesh>
      ))}
    </group>
  );
}

export interface PcOpts {
  glass: boolean;
  cooler: boolean;
  cables: boolean;
  gpu: boolean;
  explode: () => number;
  spin: () => number;
}

/**
 * Cały komputer w układzie lokalnym. Części są w grupach `Ex`, które w widoku rozłożonym odsuwają się
 * w kierunkach, w jakich wyjmuje się je przy składaniu.
 */
export function Computer({ glass, cooler, cables, gpu, explode, spin }: PcOpts) {
  return (
    <group>
      <CaseShell glass={false} />
      <Ex off={[0, 58, 26]} explode={explode}>
        {glass && <CaseShellGlass />}
      </Ex>
      <Shroud />
      <Ex off={[-42, 0, 0]} explode={explode}>
        <Psu spin={spin} />
      </Ex>
      <Ex off={[0, -1, 34]} explode={explode}>
        <Hdd />
      </Ex>
      <Ex off={[0, 0, 6]} explode={explode}>
        <MotherboardRest />
      </Ex>
      <Ex off={[0, 0, 26]} explode={explode}>
        <group position={[SOCKET.x, SOCKET.y, MBZ + 0.35]}>
          <CpuPackage />
        </group>
      </Ex>
      <Ex off={[0, 0, 22]} explode={explode}>
        {DIMMS.filter((_, i) => i % 2).map((x) => (
          <group key={x} position={[x, (DIMM.y0 + DIMM.y1) / 2, MBZ + 0.2]}>
            <RamStick />
          </group>
        ))}
      </Ex>
      <Ex off={[0, 0, 15]} explode={explode}>
        <group position={[(M2.x0 + M2.x1) / 2, M2.y, MBZ + 0.35]}>
          <M2Ssd />
        </group>
      </Ex>
      {cooler && (
        <Ex off={[0, 4, 40]} explode={explode}>
          <group position={[SOCKET.x, SOCKET.y, MBZ + 0.78]}>
            <TowerCooler spin={spin} />
          </group>
        </Ex>
      )}
      {gpu && (
        <Ex off={[0, -6, 32]} explode={explode}>
          <Gpu spin={spin} />
        </Ex>
      )}
      <Ex off={[24, 0, 26]} explode={explode}>
        <group>
          {FANS_FRONT.map((y) => (
            <Fan key={y} p={[CASE.x1 - 1.6, y, CASE.z1 / 2]} d={12} axis="x" spin={spin} />
          ))}
          <FanRings />
        </group>
      </Ex>
      <Ex off={[-26, 0, 0]} explode={explode}>
        <Fan p={[CASE.x0 + 1.6, FAN_REAR.y, FAN_REAR.z]} d={12} axis="x" spin={spin} />
      </Ex>
      {cables && <CablesFade explode={explode} />}
    </group>
  );
}

/** Płyta główna bez części wyjmowanych osobno (procesora, RAM, M.2) – one mają własne grupy. */
function MotherboardRest() {
  return <Motherboard ram={false} cpu={false} m2={false} />;
}
function CaseShellGlass() {
  const n = MAT();
  const { x0, x1, y1, z1 } = CASE;
  const L = x1 - x0;
  return (
    <group>
      <Box p={[0, y1 / 2, z1 + 0.25]} s={[L, y1, 0.4]} m={n.glass} />
      {[y1 - 0.9, 0.9].map((y) => (
        <Box key={y} p={[0, y, z1 + 0.47]} s={[L, 1.8, 0.03]} m={n.plastic} />
      ))}
      {[x0 + 0.9, x1 - 0.9].map((x) => (
        <Box key={x} p={[x, y1 / 2, z1 + 0.47]} s={[1.8, y1, 0.03]} m={n.plastic} />
      ))}
    </group>
  );
}
/** Kable znikają, gdy komputer się rozsuwa (nie rozciągają się między częściami). */
function CablesFade({ explode }: { explode: () => number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.visible = explode() < 0.04;
  });
  return (
    <group ref={g}>
      <Cables />
    </group>
  );
}
