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
          {/* śruby pokrywy i otwór wyrównujący ciśnienie */}
          {[
            [x0 + 0.5, z0 + 0.5],
            [x1 - 0.5, z0 + 0.5],
            [x0 + 0.5, z1 - 0.5],
            [x1 - 0.5, z1 - 0.5],
            [(x0 + x1) / 2 - 3, z0 + 0.5],
            [(x0 + x1) / 2 - 3, z1 - 0.5],
          ].map(([x, z], i) => (
            <Cyl key={i} p={[x, y1 + 0.03, z]} r={0.18} h={0.05} m={n.steelDark} seg={8} />
          ))}
          <Cyl p={[x0 + 3, y1 + 0.02, (z0 + z1) / 2]} r={0.35} h={0.03} m={n.chip} seg={16} />
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
 * Płaska ściana w płaszczyźnie y–z (szerokość wzdłuż y, wysokość wzdłuż z), zwrócona w +x albo −x – do tekstur
 * na bokach modułu RAM (napis czyta się poprawnie z obu stron).
 */
function SidePlane({ p, w, h, m, dir }: { p: V3; w: number; h: number; m: THREE.Material; dir: 1 | -1 }) {
  const q = useMemo(() => {
    const mtx = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, dir, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(dir, 0, 0));
    return new THREE.Quaternion().setFromRotationMatrix(mtx);
  }, [dir]);
  return (
    <mesh position={p} quaternion={q} material={m}>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}

/** Laminat modułu RAM: zielony, ze ścieżkami, nadrukiem i 144 złoconymi stykami z wycięciem (klucz). */
const ramPcbMat = () =>
  texMat(
    'rampcb',
    1330,
    310,
    (g, W, H) => {
      g.fillStyle = '#1b5a37';
      g.fillRect(0, 0, W, H);
      const r = rng(61);
      g.strokeStyle = 'rgba(140,210,150,0.35)';
      g.lineWidth = 1.5;
      for (let k = 0; k < 120; k++) {
        const x = r() * W;
        const y = 60 + r() * 170;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 20 + r() * 40);
        g.lineTo(x + (r() - 0.5) * 40, 262);
        g.stroke();
      }
      g.fillStyle = 'rgba(240,240,230,0.85)';
      g.font = 'bold 18px sans-serif';
      g.fillText('DDR5  32GB  1Rx8  PC5-48000', 40, 34);
      g.fillText('PMIC', 640, 34);
      // złocone styki z wycięciem kluczującym (poza środkiem – modułu nie da się włożyć odwrotnie)
      g.fillStyle = '#d8b04a';
      for (let k = 0; k < 144; k++) {
        const x = 18 + k * 8.9;
        if (x > 575 && x < 605) continue;
        g.fillRect(x, 262, 5.5, 46);
      }
      g.fillStyle = '#0f1a14';
      g.fillRect(578, 255, 24, 55);
    },
    { roughness: 0.5, metalness: 0.15 },
  );
/** Kość DRAM z oznaczeniem. */
const dramChipMat = () =>
  texMat(
    'dramchip',
    160,
    140,
    (g, W, H) => {
      g.fillStyle = '#1d1f23';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#9aa1aa';
      g.font = 'bold 20px monospace';
      ['D5 16Gb', 'X8 6000', '2347 KR'].forEach((l, k) => g.fillText(l, 12, 36 + k * 34));
      g.beginPath();
      g.arc(16, H - 14, 5, 0, Math.PI * 2);
      g.fill();
    },
    { roughness: 0.45 },
  );
/** Radiator modułu: grafitowe aluminium z frezowanymi liniami i naklejką. */
const ramSpreaderMat = () =>
  texMat(
    'ramhs',
    1340,
    340,
    (g, W, H) => {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#3a3f47');
      bg.addColorStop(1, '#23272d');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      const r = rng(8);
      for (let k = 0; k < 400; k++) {
        g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`;
        g.fillRect(0, r() * H, W, 1);
      }
      g.strokeStyle = 'rgba(200,206,214,0.6)';
      g.lineWidth = 3;
      for (const x of [380, 420, 920, 960]) {
        g.beginPath();
        g.moveTo(x, 40);
        g.lineTo(x + 80, H - 30);
        g.stroke();
      }
      g.fillStyle = '#c9ced5';
      g.fillRect(480, 120, 380, 110);
      g.fillStyle = '#1d2025';
      g.font = 'bold 44px sans-serif';
      g.textAlign = 'center';
      g.fillText('DDR5-6000', 670, 172);
      g.font = '28px sans-serif';
      g.fillText('32 GB  ·  CL30', 670, 212);
    },
    { metalness: 0.55, roughness: 0.4 },
  );

/**
 * Moduł RAM DDR5: laminat ze ścieżkami i 288 złoconymi stykami, 8 kości DRAM, układ zasilania PMIC i układ SPD,
 * radiator z naklejką i pasek podświetlenia. Układ lokalny: długość wzdłuż y (13,3 cm), wysokość wzdłuż z,
 * grubość wzdłuż x. Punkt (0,0,0) – środek dolnej krawędzi styków. `heatspreader={false}` – goły laminat.
 */
export function RamStick({ heatspreader = true }: { heatspreader?: boolean }) {
  const n = MAT();
  const pcb = ramPcbMat();
  return (
    <group>
      <Box p={[0, 0, 1.55]} s={[0.12, 13.3, 3.1]} m={n.greenBoard} />
      {[1, -1].map((d) => (
        <SidePlane key={d} p={[d * 0.061, 0, 1.55]} w={13.3} h={3.1} m={pcb} dir={d as 1 | -1} />
      ))}
      {/* 8 kości DRAM (po jednej stronie), PMIC i SPD na środku */}
      {[-5.6, -4.1, -2.6, -1.1, 1.3, 2.8, 4.3, 5.8].map((y) => (
        <group key={y}>
          <Box p={[0.12, y, 1.75]} s={[0.12, 1.15, 1.0]} m={n.chip} />
          <SidePlane p={[0.181, y, 1.75]} w={1.15} h={1.0} m={dramChipMat()} dir={1} />
        </group>
      ))}
      <Box p={[0.11, 0.1, 2.55]} s={[0.1, 0.5, 0.5]} m={n.chip} />
      <Box p={[0.1, 0.1, 1.25]} s={[0.08, 0.3, 0.25]} m={n.chipGrey} />
      {Array.from({ length: 18 }, (_, i) => (
        <Box key={i} p={[0.09, -6 + i * 0.7, 0.95]} s={[0.05, 0.18, 0.09]} m={n.solder} />
      ))}
      {heatspreader && (
        <group>
          {[1, -1].map((d) => (
            <group key={d}>
              <Box p={[d * 0.32, 0, 2.3]} s={[0.1, 13.4, 3.4]} m={n.aluDark} />
              <SidePlane p={[d * 0.372, 0, 2.3]} w={13.4} h={3.4} m={ramSpreaderMat()} dir={d as 1 | -1} />
            </group>
          ))}
          <Box p={[0, 0, 4.05]} s={[0.74, 13.4, 0.2]} m={n.aluDark} />
          <Box p={[0, 0, 4.3]} s={[0.5, 13, 0.3]} m={rgbMat()} />
        </group>
      )}
    </group>
  );
}

/** Laminat dysku M.2: czarny, ze ścieżkami, nadrukiem i stykami z wycięciem „klucz M”. */
const ssdPcbMat = () =>
  texMat(
    'ssdpcb',
    800,
    220,
    (g, W, H) => {
      g.fillStyle = '#121417';
      g.fillRect(0, 0, W, H);
      const r = rng(71);
      g.strokeStyle = 'rgba(80,90,104,0.9)';
      g.lineWidth = 1.4;
      // wiązki: złącze → kontroler, kontroler → kości NAND (4 kanały)
      for (let k = 0; k < 10; k++) {
        g.beginPath();
        g.moveTo(40, 40 + k * 14);
        g.lineTo(80, 50 + k * 12);
        g.stroke();
      }
      for (let ch = 0; ch < 4; ch++)
        for (let k = 0; k < 5; k++) {
          const y = 30 + ch * 42 + k * 5;
          g.beginPath();
          g.moveTo(205, y);
          g.lineTo(380 + (ch % 2) * 190, y);
          g.stroke();
        }
      g.fillStyle = 'rgba(210,190,110,0.8)';
      for (let k = 0; k < 120; k++) g.fillRect(r() * W, r() * H, 5, 3);
      // styki z kluczem M (wycięcie bliżej prawej krawędzi złącza)
      g.fillStyle = '#d8b04a';
      for (let k = 0; k < 30; k++) {
        const y = 8 + k * 7;
        if (y > 150 && y < 172) continue;
        g.fillRect(0, y, 28, 4.5);
      }
      g.fillStyle = '#e8eaee';
      g.font = 'bold 14px sans-serif';
      g.fillText('M.2 2280  NVMe  PCIe 4.0 x4', 360, 210);
      // półkole na śrubę
      g.fillStyle = '#d8b04a';
      g.beginPath();
      g.arc(W, H / 2, 16, 0, Math.PI * 2);
      g.fill();
    },
    { roughness: 0.5 },
  );
const ssdChip = (key: string, lines: string[], bg = '#1b1d21') =>
  texMat(
    key,
    200,
    200,
    (g, W, H) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#a7aeb7';
      g.font = 'bold 24px monospace';
      lines.forEach((l, k) => g.fillText(l, 14, 50 + k * 36));
      g.beginPath();
      g.arc(18, H - 18, 6, 0, Math.PI * 2);
      g.fill();
    },
    { roughness: 0.45 },
  );

/**
 * Dysk SSD M.2 2280: laminat ze stykami (klucz M), kontroler, kość DRAM, dwie kości 3D NAND, układ zasilania
 * i półokrągłe wycięcie na śrubę. Długość wzdłuż x (8 cm), szerokość wzdłuż y, grubość wzdłuż z.
 */
export const SSD_PARTS = { ctrl: -2.5, dram: -1.0, nand: [0.75, 2.75] as number[], pmic: 3.85 };
export function M2Ssd() {
  const n = MAT();
  const top = useMemo(() => ssdPcbMat(), []);
  return (
    <group>
      <Box p={[0, 0, 0.04]} s={[8, 2.2, 0.08]} m={n.boardEdge} />
      <mesh position={[0, 0, 0.081]} material={top}>
        <planeGeometry args={[8, 2.2]} />
      </mesh>
      <group position={[SSD_PARTS.ctrl, 0, 0.17]}>
        <Box p={[0, 0, 0]} s={[1.3, 1.3, 0.18]} m={n.chip} />
        <mesh position={[0, 0, 0.091]} material={ssdChip('ssdctrl', ['NVMe', 'CTRL', '8ch'], '#22252a')}>
          <planeGeometry args={[1.3, 1.3]} />
        </mesh>
        <Box p={[0, 0, 0.1]} s={[0.9, 0.9, 0.02]} m={n.nickel} />
      </group>
      <group position={[SSD_PARTS.dram, 0, 0.14]}>
        <Box p={[0, 0, 0]} s={[0.8, 1.0, 0.12]} m={n.chip} />
        <mesh position={[0, 0, 0.061]} material={ssdChip('ssddram', ['LPDDR4', '1GB'])}>
          <planeGeometry args={[0.8, 1.0]} />
        </mesh>
      </group>
      {SSD_PARTS.nand.map((x) => (
        <group key={x} position={[x, 0, 0.17]}>
          <Box p={[0, 0, 0]} s={[1.5, 1.6, 0.16]} m={n.chip} />
          <mesh position={[0, 0, 0.081]} material={ssdChip('ssdnand', ['3D NAND', '176L TLC', '1 TB'])}>
            <planeGeometry args={[1.5, 1.6]} />
          </mesh>
        </group>
      ))}
      <Box p={[SSD_PARTS.pmic - 0.3, 0.55, 0.13]} s={[0.45, 0.45, 0.1]} m={n.chip} />
      {Array.from({ length: 12 }, (_, i) => (
        <Box key={i} p={[-1.7 + (i % 6) * 0.3, i < 6 ? 0.85 : -0.85, 0.11]} s={[0.12, 0.07, 0.06]} m={n.solder} />
      ))}
    </group>
  );
}

/* ================= procesor i chłodzenie ================= */

/** Kształt zaokrąglonego prostokąta w×h (środek w 0,0), opcjonalnie z prostokątnymi wycięciami w krótszych bokach. */
function roundRect(w: number, h: number, r: number, notch?: { w: number; d: number }) {
  const s = new THREE.Shape();
  const x = w / 2;
  const y = h / 2;
  s.moveTo(-x + r, -y);
  if (notch) {
    s.lineTo(-notch.w / 2, -y);
    s.lineTo(-notch.w / 2, -y + notch.d);
    s.lineTo(notch.w / 2, -y + notch.d);
    s.lineTo(notch.w / 2, -y);
  }
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  if (notch) {
    s.lineTo(notch.w / 2, y);
    s.lineTo(notch.w / 2, y - notch.d);
    s.lineTo(-notch.w / 2, y - notch.d);
    s.lineTo(-notch.w / 2, y);
  }
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}
const SLAB = new Map<string, THREE.BufferGeometry>();
/** Płytka o kształcie `shape` i grubości t, od z = 0 do t (płaszczyzna x–y). Z cache po kluczu. */
function slabGeo(key: string, make: () => THREE.Shape | THREE.Shape[], t: number) {
  const hit = SLAB.get(key);
  if (hit) return hit;
  const g = new THREE.ExtrudeGeometry(make(), { depth: t, bevelEnabled: false, curveSegments: 10 });
  // ściany boczne bez tekstury – UV góry rozciągamy na cały kształt
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(k) - bb.min.y) / (bb.max.y - bb.min.y));
  g.computeVertexNormals();
  SLAB.set(key, g);
  return g;
}

const CPU_TEX = new Map<string, THREE.Material>();
function texMat(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, o: THREE.MeshStandardMaterialParameters = {}) {
  let m = CPU_TEX.get(key);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  m = new THREE.MeshStandardMaterial({ map: t, ...o });
  CPU_TEX.set(key, m);
  return m;
}

/** Osłona IHS: szczotkowany nikiel z wypalonym laserem napisem, kodem 2D i trójkątem w rogu. */
const ihsMat = () =>
  texMat(
    'ihs',
    512,
    606,
    (g, W, H) => {
      const bg = g.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#d9dde2');
      bg.addColorStop(0.5, '#c4c9cf');
      bg.addColorStop(1, '#d3d7dc');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      const r = rng(5);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,96,104'},${0.05 + r() * 0.08})`;
        g.fillRect(0, r() * H, W, 1);
      }
      g.fillStyle = '#5a6068';
      g.textAlign = 'left';
      g.font = 'bold 64px sans-serif';
      g.fillText('intel.', 60, 150);
      g.font = 'bold 42px sans-serif';
      g.fillText('CORE i7', 60, 225);
      g.font = '30px monospace';
      ['i7-14700K', 'SRN3X 3.40GHZ', 'X337M519', '(e3)'].forEach((l, k) => g.fillText(l, 60, 300 + k * 44));
      // kod 2D
      for (let y = 0; y < 14; y++)
        for (let x = 0; x < 14; x++) if (x === 0 || y === 13 || r() < 0.45) g.fillRect(360 + x * 8, 430 + y * 8, 8, 8);
      g.beginPath();
      g.moveTo(24, 24);
      g.lineTo(70, 24);
      g.lineTo(24, 70);
      g.fill();
    },
    { metalness: 0.75, roughness: 0.28 },
  );
/** Laminat procesora: zielony, z drobnymi ścieżkami i złotym trójkątem. */
const subMat = () =>
  texMat(
    'cpusub',
    256,
    308,
    (g, W, H) => {
      g.fillStyle = '#1f6a3a';
      g.fillRect(0, 0, W, H);
      const r = rng(17);
      g.strokeStyle = 'rgba(120,200,120,0.35)';
      for (let i = 0; i < 60; i++) {
        g.beginPath();
        const x = r() * W;
        const y = r() * H;
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 60);
        g.stroke();
      }
      g.fillStyle = '#e2b84a';
      g.beginPath();
      g.moveTo(6, H - 6);
      g.lineTo(26, H - 6);
      g.lineTo(6, H - 26);
      g.fill();
    },
    { roughness: 0.5 },
  );
/** Spód procesora: 1700 złotych pól stykowych. */
const padMat = () =>
  texMat(
    'cpupad',
    256,
    308,
    (g, W, H) => {
      g.fillStyle = '#1d5a33';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#e4bb4c';
      for (let y = 6; y < H - 4; y += 6.5) for (let x = 6; x < W - 4; x += 6.5) if (!(x > 90 && x < 166 && y > 110 && y < 198)) g.fillRect(x, y, 3.6, 3.6);
    },
    { metalness: 0.6, roughness: 0.35 },
  );
/** Pole sprężynek w gnieździe. */
const pinMat = () =>
  texMat(
    'pins',
    256,
    308,
    (g, W, H) => {
      g.fillStyle = '#141518';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#c9a24a';
      for (let y = 5; y < H - 3; y += 6.5) for (let x = 5; x < W - 3; x += 6.5) if (!(x > 90 && x < 166 && y > 110 && y < 198)) g.fillRect(x, y, 2.4, 3.2);
    },
    { metalness: 0.5, roughness: 0.4 },
  );

/**
 * Procesor w obudowie LGA (z = 0 – spód laminatu): zielony laminat z polami stykowymi pod spodem, kondensatory
 * w wycięciach osłony, osłona IHS z niklowanej miedzi: niższy kołnierz z wycięciami i wyższy płaskowyż z napisem.
 */
export function CpuPackage() {
  const n = MAT();
  const w = 3.75;
  const h = 4.5;
  const flange = slabGeo('ihsF', () => roundRect(3.35, 4.1, 0.2, { w: 1.5, d: 0.32 }), 0.12);
  const plate = slabGeo('ihsP', () => roundRect(3.0, 3.56, 0.25), 0.22);
  return (
    <group>
      <Box p={[0, 0, 0.06]} s={[w, h, 0.12]} m={subMat()} />
      <mesh position={[0, 0, -0.001]} rotation={[Math.PI, 0, 0]} material={padMat()}>
        <planeGeometry args={[w - 0.05, h - 0.05]} />
      </mesh>
      <mesh geometry={flange} position={[0, 0, 0.12]} material={n.nickel} />
      <mesh geometry={plate} position={[0, 0, 0.24]} material={ihsMat()} />
      {/* kondensatory w wycięciach osłony (po obu krótszych bokach) */}
      {[-1, 1].map((sy) =>
        Array.from({ length: 12 }, (_, i) => (
          <Box key={`${sy}${i}`} p={[-0.62 + (i % 6) * 0.25, sy * (1.9 + Math.floor(i / 6) * 0.14), 0.15]} s={[0.12, 0.07, 0.06]} m={i % 3 ? n.solder : n.chipGrey} />
        )),
      )}
      {/* rzędy kondensatorów na dłuższych brzegach laminatu */}
      {[-1, 1].map((sx) =>
        Array.from({ length: 10 }, (_, i) => <Box key={`x${sx}${i}`} p={[sx * 1.78, -1.7 + i * 0.38, 0.14]} s={[0.07, 0.12, 0.05]} m={n.solder} />),
      )}
    </group>
  );
}

/**
 * Gniazdo LGA1700 (z = 0 – wierzch płyty): plastikowa podstawa z polem sprężynek, stalowa rama na czterech
 * śrubach, płyta dociskowa z oknem (opiera się na kołnierzu osłony procesora) i wygięta dźwignia z hakiem.
 * `open` – płyta podniesiona na zawiasie, widać sprężynki.
 */
export function Socket({ open = false }: { open?: boolean }) {
  const n = MAT();
  const frame = slabGeo(
    'ilmFrame',
    () => {
      const s = roundRect(6.4, 7.4, 0.35);
      s.holes.push(new THREE.Path(roundRect(5.0, 6.0, 0.2).getPoints(8)));
      return s;
    },
    0.12,
  );
  const plateGeo = slabGeo(
    'ilmPlate',
    () => {
      const s = roundRect(4.5, 5.3, 0.3);
      s.holes.push(new THREE.Path(roundRect(3.1, 3.7, 0.25).getPoints(8)));
      return s;
    },
    0.07,
  );
  return (
    <group>
      <Box p={[0, 0, 0.17]} s={[5.0, 6.0, 0.34]} m={n.slot} />
      <mesh position={[0, 0, 0.345]} material={pinMat()}>
        <planeGeometry args={[3.7, 4.4]} />
      </mesh>
      <mesh geometry={frame} position={[0, 0, 0]} material={n.steel} />
      {[-1, 1].map((sx) =>
        [-1, 1].map((sy) => (
          <group key={`${sx}${sy}`}>
            <Cyl p={[sx * 2.85, sy * 3.35, 0.2]} r={0.22} h={0.2} m={n.steelDark} axis="z" seg={12} />
            <Cyl p={[sx * 2.85, sy * 3.35, 0.31]} r={0.08} h={0.03} m={n.slot} axis="z" seg={6} />
          </group>
        )),
      )}
      {/* płyta dociskowa: zawias przy górnej krawędzi, język z przodu pod hakiem dźwigni */}
      <group position={[0, 2.65, 0.59]} rotation={[open ? -1.6 : 0, 0, 0]}>
        <mesh geometry={plateGeo} position={[0, -2.65, 0]} material={n.steel} />
        <Box p={[0, -5.45, 0.04]} s={[1.2, 0.5, 0.07]} m={n.steel} />
        {[-1.6, 1.6].map((x) => (
          <Box key={x} p={[x, 0.05, -0.15]} s={[0.6, 0.3, 0.35]} m={n.steel} />
        ))}
      </group>
      {/* dźwignia: pręt wzdłuż boku, wygięty uchwyt i hak dociskający język płyty */}
      <Tube
        pts={[
          [3.0, 3.2, 0.3],
          [3.0, -2.9, 0.3],
          [3.0, -3.3, 0.45],
          [3.6, -3.45, 0.5],
        ]}
        r={0.07}
        m={n.steel}
        seg={8}
        smooth={false}
      />
      <Box p={[3.75, -3.45, 0.5]} s={[0.5, 0.35, 0.2]} m={n.plastic} />
      <Tube
        pts={[
          [3.0, -2.1, 0.3],
          [1.4, -2.85, 0.68],
          [0.7, -2.85, 0.68],
        ]}
        r={0.06}
        m={n.steel}
        seg={6}
        smooth={false}
      />
    </group>
  );
}

/**
 * Chłodzenie wieżowe: miedziana podstawa z niklowaną płytą, belka montażowa ze sprężynującymi śrubami, 4 rurki
 * cieplne w kształcie litery U, pakiet 42 aluminiowych żeber z pokrywą i wentylator 12 cm na klipsach.
 * Układ: środek podstawy na (0,0,0), wieża rośnie w +z, powietrze płynie w −x.
 */
export function TowerCooler({ spin, fins = true }: { spin: () => number; fins?: boolean }) {
  const n = MAT();
  const { w, d, h } = COOLER;
  const finZ = useMemo(() => Array.from({ length: 42 }, (_, i) => 3.6 + (i * (h - 3.8)) / 41), [h]);
  const pipes = [-1.8, -0.6, 0.6, 1.8];
  const cap = useMemo(() => labelMat('coolcap', ['FROZN 620'], '#1d2025', '#d7dbe0'), []);
  return (
    <group>
      <Box p={[0, 0, 0.3]} s={[4, 4, 0.6]} m={n.copper} />
      <Box p={[0, 0, 0.9]} s={[4.4, 4.2, 0.6]} m={n.nickel} />
      {/* belka montażowa ze śrubami na sprężynach */}
      <Box p={[0, 0, 1.35]} s={[7.6, 1.1, 0.18]} m={n.steelDark} />
      {[-3.4, 3.4].map((x) => (
        <group key={x}>
          <Cyl p={[x, 0, 1.75]} r={0.28} h={0.6} m={n.steel} axis="z" seg={12} />
          <mesh position={[x, 0, 1.1]} rotation={[Math.PI / 2, 0, 0]} material={n.steel}>
            <torusGeometry args={[0.32, 0.04, 6, 16]} />
          </mesh>
        </group>
      ))}
      {pipes.map((y, i) => (
        <group key={y}>
          <Tube
            pts={[
              [-1.7 - (i % 2) * 0.5, y, h + 0.2],
              [-1.7 - (i % 2) * 0.5, y, 2.4],
              [-1.2, y, 0.75],
              [1.2, y, 0.75],
              [1.7 + (i % 2) * 0.5, y, 2.4],
              [1.7 + (i % 2) * 0.5, y, h + 0.2],
            ]}
            r={0.3}
            m={n.nickel}
            seg={12}
          />
          {[-1, 1].map((sx) => (
            <Cyl key={sx} p={[sx * (1.7 + (i % 2) * 0.5), y, h + 0.45]} r={0.31} h={0.3} m={n.steel} axis="z" seg={12} />
          ))}
        </group>
      ))}
      {fins &&
        finZ.map((z) => (
          <Box key={z} p={[0, 0, z]} s={[d, w, 0.05]} m={n.alu} />
        ))}
      {/* pokrywa z logo */}
      <Box p={[0, 0, h + 0.3]} s={[d + 0.2, w + 0.2, 0.35]} m={n.plastic} />
      <Box p={[0, 0, h + 0.49]} s={[d - 1, 6, 0.02]} m={cap} r={[0, 0, Math.PI / 2]} />
      {/* wentylator na drucianych klipsach */}
      <Fan p={[d / 2 + 1.4, 0, 3.6 + (h - 3.6) / 2]} d={12} axis="x" spin={spin} />
      {[3.6 + 0.6, h - 0.4].map((z) => (
        <Tube
          key={z}
          pts={[
            [d / 2 + 2.5, -5.7, z],
            [d / 2 + 0.1, -6.3, z],
            [d / 2 + 0.1, 6.3, z],
            [d / 2 + 2.5, 5.7, z],
          ]}
          r={0.05}
          m={n.steel}
          seg={5}
          smooth={false}
        />
      ))}
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

/** Koniec krótkiego laminatu karty (dalej radiator jest przewiewny – powietrze przechodzi na wylot). */
export const GPU_PCB_END = GPU.x1 - 10;
/** Złącze zasilania 16-pin na górnej krawędzi laminatu. */
export const GPU_PWR_X = GPU_PCB_END - 3;

/** Bok osłony karty widoczny przez szybę: grafitowe płaszczyzny, srebrne listwy, napis. */
const gpuSideMat = () =>
  texMat(
    'gpuside',
    1024,
    176,
    (g, W, H) => {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#2c3036');
      bg.addColorStop(0.5, '#1b1e22');
      bg.addColorStop(1, '#25292e');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      // ukośne płaszczyzny
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let x = -200; x < W; x += 170) {
        g.beginPath();
        g.moveTo(x, H);
        g.lineTo(x + 90, 0);
        g.lineTo(x + 150, 0);
        g.lineTo(x + 60, H);
        g.fill();
      }
      g.fillStyle = '#aab2bc';
      g.fillRect(0, 18, W, 4);
      g.fillRect(W * 0.38, H - 22, W * 0.62, 4);
      g.fillStyle = '#eef1f4';
      g.font = 'bold 58px sans-serif';
      g.textAlign = 'left';
      g.fillText('GEFORCE RTX', 70, 112);
      g.fillStyle = '#76b900';
      g.fillRect(70, 128, 400, 6);
    },
    { metalness: 0.5, roughness: 0.4 },
  );

/**
 * Karta graficzna (układ komputera, leży poziomo pod slotem PCIe, wentylatorami w dół). `part`:
 * `all` – cała karta; `cooler` – sam radiator z komorą parową, rurkami i śledziem; `pcb` – laminat z układami
 * i złączami; `back` – tylna płytka; `shroud` – osłona z wentylatorami (do widoku rozłożonego).
 */
export function Gpu({ spin, part = 'all' }: { spin: () => number; part?: 'all' | 'cooler' | 'pcb' | 'back' | 'shroud' }) {
  const n = MAT();
  const logo = useMemo(() => labelMat('gpu', ['GEFORCE RTX'], '#2a2e34', '#e6e9ed'), []);
  const hub = useMemo(() => labelMat('gpuhub', ['RTX'], '#15171a', '#76b900'), []);
  const { x0, x1, y, z0, z1, cool } = GPU;
  const L = x1 - x0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const fins = useMemo(() => Array.from({ length: 74 }, (_, i) => x0 + 1.2 + (i * (L - 2.4)) / 73), [x0, L]);
  const fanX = [x0 + 6.3, cx + 0.4, x1 - 5.2];
  const shroudGeo = useMemo(() => {
    const sh = new THREE.Shape();
    sh.moveTo(x0, z0);
    sh.lineTo(x1, z0);
    sh.lineTo(x1, z1);
    sh.lineTo(x0, z1);
    sh.closePath();
    for (const x of fanX) {
      const h = new THREE.Path();
      h.absarc(x, cz, 4.5, 0, Math.PI * 2, true);
      sh.holes.push(h);
    }
    return new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false, curveSegments: 40 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const show = (k: string) => part === 'all' || part === k;
  const pipeZ = [4.2, 6.2, 8.2, 10.2, 12.2];
  return (
    <group>
      {show('pcb') && (
        <group>
          {/* krótki laminat ze złączem krawędziowym */}
          <Box p={[(x0 + GPU_PCB_END) / 2, y - 0.08, cz]} s={[GPU_PCB_END - x0, 0.16, z1 - z0]} m={n.board} />
          <Box p={[(PCIE.x0 + PCIE.x1) / 2, y - 0.08, z0 - 0.5]} s={[PCIE.x1 - PCIE.x0 - 0.4, 0.16, 1]} m={n.board} />
          <Box p={[(PCIE.x0 + PCIE.x1) / 2, y - 0.08, z0 - 0.75]} s={[PCIE.x1 - PCIE.x0 - 0.4, 0.17, 0.5]} m={n.gold} />
          {/* złącze zasilania 16-pin */}
          <Box p={[GPU_PWR_X, y - 0.55, z1 - 0.3]} s={[2.1, 0.9, 1.1]} m={n.slot} />
          {part === 'pcb' && <GpuChips />}
        </group>
      )}
      {show('back') && (
        <group>
          {/* tylna płytka z przewiewnym wycięciem nad końcem radiatora */}
          <Box p={[(x0 + x1 - 9) / 2, y + 0.2, cz]} s={[L - 9, 0.3, z1 - z0]} m={n.aluDark} />
          <Box p={[x1 - 1, y + 0.2, cz]} s={[2, 0.3, z1 - z0]} m={n.aluDark} />
          {[z0 + 0.6, z1 - 0.6].map((z) => (
            <Box key={z} p={[x1 - 5.5, y + 0.2, z]} s={[7, 0.3, 1.2]} m={n.aluDark} />
          ))}
          <Box p={[cx - 4, y + 0.36, cz]} s={[9, 0.02, 2.6]} m={logo} />
          {Array.from({ length: 8 }, (_, i) => (
            <Cyl key={i} p={[-14 + (i % 4) * 4.5, y + 0.37, i < 4 ? 4 : 11]} r={0.15} h={0.04} m={n.steel} seg={8} />
          ))}
        </group>
      )}
      {show('cooler') && (
        <group>
          {/* komora parowa pod układem GPU */}
          <Box p={[-7, y - 0.6, cz]} s={[6.5, 0.3, 6.5]} m={n.copper} />
          {fins.map((x) => (
            <Box key={x} p={[x, y - 0.75 - (cool - 1.5) / 2, cz]} s={[0.05, cool - 1.5, z1 - z0 - 0.4]} m={n.alu} />
          ))}
          {/* rurki cieplne: wzdłuż karty, zawracają przy końcu (widać kolana z boku) */}
          {pipeZ.map((z, k) => (
            <Tube
              key={z}
              pts={[
                [-12 + k, y - 0.95, z],
                [x1 - 2.6, y - 0.95, z],
                [x1 - 1.4, y - 1.9, z],
                [x1 - 2.6, y - 2.9, z],
                [x0 + 4 + k * 2, y - 2.9, z],
              ]}
              r={0.3}
              m={n.nickel}
              seg={10}
            />
          ))}
          {/* śledź z otworami wentylacyjnymi i złączami monitora */}
          <Box p={[x0 - 0.1, y - 2.8, 6.5]} s={[0.15, 6.2, 12]} m={n.steel} />
          <Box p={[x0 - 0.1, y + 0.6, 6.5]} s={[0.8, 0.15, 12]} m={n.steel} />
          {[3, 5.4, 7.8].map((z) => (
            <Box key={z} p={[x0 - 0.3, y - 1.3, z]} s={[0.3, 0.6, 1.8]} m={n.slot} />
          ))}
          <Box p={[x0 - 0.3, y - 1.3, 10.2]} s={[0.3, 0.6, 1.5]} m={n.slot} />
          {Array.from({ length: 18 }, (_, i) => (
            <Cyl key={i} p={[x0 - 0.19, y - 3.3 - (i % 2) * 1.1, 1.6 + Math.floor(i / 2) * 1.25]} r={0.38} h={0.05} m={n.slot} axis="x" seg={6} />
          ))}
        </group>
      )}
      {show('shroud') && (
        <group>
          <mesh geometry={shroudGeo} position={[0, y - cool + 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} material={n.plastic} />
          {fanX.map((x) => (
            <group key={x}>
              <Fan p={[x, y - cool + 0.75, cz]} d={8.8} axis="y" spin={spin} frame={false} blades={11} />
              <mesh position={[x, y - cool + 0.04, cz]} rotation={[Math.PI / 2, 0, 0]} material={n.steel}>
                <ringGeometry args={[4.5, 4.85, 48]} />
              </mesh>
              <mesh position={[x, y - cool - 0.2, cz]} rotation={[Math.PI / 2, 0, 0]} material={hub}>
                <circleGeometry args={[1.1, 24]} />
              </mesh>
            </group>
          ))}
          {/* bok osłony z napisem i podświetleniem, czoło z kratką */}
          <mesh position={[cx, y - cool / 2 - 0.05, z1 + 0.06]} material={gpuSideMat()}>
            <planeGeometry args={[L, cool - 0.5]} />
          </mesh>
          <Box p={[cx, y - cool / 2 - 0.05, z1 - 0.06]} s={[L, cool - 0.5, 0.12]} m={n.plastic} />
          <Box p={[cx - 4, y - cool + 0.7, z1 + 0.08]} s={[L - 10, 0.12, 0.03]} m={n.ledGreen} />
          <Box p={[cx, y - cool / 2 - 0.05, z0 + 0.06]} s={[L, cool - 0.5, 0.12]} m={n.plastic} />
          <Box p={[x1 + 0.06, y - cool / 2 - 0.05, cz]} s={[0.12, cool - 0.5, z1 - z0]} m={n.plastic} />
          {Array.from({ length: 6 }, (_, i) => (
            <Box key={i} p={[x1 + 0.14, y - cool + 1 + i * 0.7, cz]} s={[0.04, 0.3, z1 - z0 - 2]} m={n.slot} />
          ))}
        </group>
      )}
    </group>
  );
}

/**
 * Laminat karty od strony radiatora: układ GPU na własnym laminacie z błyszczącym krzemem, sześć kości
 * GDDR6X dookoła, sekcja zasilania (dławiki, tranzystory, kondensatory) i drobne elementy.
 */
export function GpuChips() {
  const n = MAT();
  const vram = useMemo(() => labelMat('vram', ['GDDR6X'], '#34373d', '#d0d4da'), []);
  const { y } = GPU;
  const cx = -7;
  const cz = 7.5;
  const mem: [number, number][] = [
    [-3.6, -1.6],
    [-3.6, 1.6],
    [3.6, -1.6],
    [3.6, 1.6],
    [-1.4, -3.7],
    [1.4, -3.7],
  ];
  return (
    <group>
      {/* układ GPU: laminat, krzem, ramka usztywniająca */}
      <Box p={[cx, y - 0.2, cz]} s={[4.4, 0.1, 4.4]} m={n.greenBoard} />
      <Box p={[cx, y - 0.3, cz]} s={[2.5, 0.1, 2.1]} m={n.dieShine} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box p={[cx + s * 1.95, y - 0.29, cz]} s={[0.25, 0.08, 4.1]} m={n.steel} />
          <Box p={[cx, y - 0.29, cz + s * 1.95]} s={[4.1, 0.08, 0.25]} m={n.steel} />
        </group>
      ))}
      {mem.map(([dx, dz], i) => (
        <Box key={i} p={[cx + dx, y - 0.23, cz + dz]} s={[1.4, 0.12, 1.2]} m={vram} />
      ))}
      {/* sekcja zasilania: dławiki w rzędzie, tranzystory, kondensatory polimerowe */}
      {Array.from({ length: 11 }, (_, i) => (
        <group key={i}>
          <Box p={[-1.6 + (i % 1) + i * 0.0, y - 0.45, 3.2 + i * 0.85]} s={[0.75, 0.6, 0.75]} m={n.choke} />
          <Box p={[-2.6, y - 0.25, 3.2 + i * 0.85]} s={[0.5, 0.2, 0.5]} m={n.chip} />
        </group>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <Cyl key={i} p={[-0.4 + (i % 2) * 0.7, y - 0.45, 4 + Math.floor(i / 2) * 2]} r={0.28} h={0.6} m={n.capacitor} seg={12} />
      ))}
      {Array.from({ length: 40 }, (_, i) => (
        <Box key={i} p={[-15 + (i % 10) * 0.8, y - 0.2, 3.5 + Math.floor(i / 10) * 2.6]} s={[0.2, 0.08, 0.12]} m={n.solder} />
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
      [GPU_PWR_X, GPU.y - 0.55, GPU.z1 + 1.8],
      [GPU_PWR_X, GPU.y - 0.55, GPU.z1 + 0.3],
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
          <group position={[SOCKET.x, SOCKET.y, MBZ + 0.82]}>
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
