/*
 * Router Wi-Fi – bryły: mieszkanie z meblami (widok z przyciętymi ścianami), router z całym wnętrzem
 * (zdejmowana pokrywa, widok rozłożony), modem światłowodowy, urządzenia, fale i mapa zasięgu na podłodze.
 */
import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Box, Cyl, MAT, Tube, chipTex } from './pcMats';
import { CONSOLE, FIBER_SOCKET, FLAT, LAPTOP, MICROWAVE, ONT, PHONE, ROUTER, SIDEBOARD, SPEAKER, TV, WALLS, WALL_H, rssi, rssiColor, type V3, type WallKind } from './routerGeo';

/* ================= materiały ================= */

const std = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
function texOf(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function makeR() {
  const parquet = texOf(
    256,
    256,
    (g) => {
      const r = Math.random;
      for (let y = 0; y < 8; y++)
        for (let x = -1; x < 2; x++) {
          const v = 150 + r() * 40;
          g.fillStyle = `rgb(${v},${v * 0.72},${v * 0.48})`;
          g.fillRect(x * 128 + (y % 2) * 64, y * 32, 128, 32);
          g.strokeStyle = 'rgba(60,40,20,0.35)';
          g.strokeRect(x * 128 + (y % 2) * 64, y * 32, 128, 32);
        }
    },
    true,
  );
  parquet.repeat.set(4, 4);
  const tiles = texOf(
    128,
    128,
    (g) => {
      g.fillStyle = '#dfe5e8';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#aab4ba';
      g.lineWidth = 2;
      for (let i = 0; i <= 128; i += 32) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 128);
        g.moveTo(0, i);
        g.lineTo(128, i);
        g.stroke();
      }
    },
    true,
  );
  tiles.repeat.set(4, 6);
  const vents = texOf(256, 160, (g) => {
    g.fillStyle = '#1c1e22';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#0a0b0d';
    for (let r = 0; r < 6; r++) for (let k = 0; k < 9; k++) g.fillRect(40 + k * 20, 30 + r * 18, 12, 6);
    g.fillStyle = '#9aa3ad';
    g.font = 'bold 18px sans-serif';
    g.fillText('AX3000', 186, 150);
  });
  return {
    floor: std('#ffffff', { map: parquet, roughness: 0.6 }),
    tiles: std('#ffffff', { map: tiles, roughness: 0.4 }),
    kitchenFloor: std('#c9c4bb', { roughness: 0.6 }),
    ground: std('#3b4d3a', { roughness: 1 }),
    concrete: std('#d9d4cb', { roughness: 0.9 }),
    drywall: std('#f3f2ee', { roughness: 0.9 }),
    brick: std('#b8664a', { roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#bcd7ea', transparent: true, opacity: 0.35, roughness: 0.05 }),
    wallTop: std('#5d6168', { roughness: 0.8 }),
    wood: std('#a07650', { roughness: 0.6 }),
    woodLight: std('#d2b48c', { roughness: 0.6 }),
    white: std('#f2f2ee', { roughness: 0.5 }),
    fabric: std('#4b6584', { roughness: 0.95 }),
    fabricLight: std('#c8ced6', { roughness: 0.95 }),
    rug: std('#b7a487', { roughness: 1 }),
    black: std('#1c1e22', { roughness: 0.45 }),
    shell: std('#24272c', { roughness: 0.4, metalness: 0.1 }),
    shellTop: std('#ffffff', { map: vents, roughness: 0.45 }),
    pcb: std('#1c4a7a', { roughness: 0.55 }),
    screen: new THREE.MeshBasicMaterial({ color: '#1e293b', toneMapped: false }),
    screenOn: new THREE.MeshBasicMaterial({ color: '#7dd3fc', toneMapped: false }),
    plant: std('#3f8f4a', { roughness: 0.9 }),
    fiber: std('#2fb35a', { roughness: 0.5 }),
    ethYellow: std('#e5b52a', { roughness: 0.5 }),
    ethBlue: std('#2f6fd6', { roughness: 0.5 }),
    water: std('#8ecae6', { roughness: 0.1 }),
  };
}
let RM_: ReturnType<typeof makeR> | null = null;
export const RM = () => (RM_ ??= makeR());

/* ================= mieszkanie ================= */

function WallSeg({ a, b, t, kind }: { a: [number, number]; b: [number, number]; t: number; kind: WallKind }) {
  const r = RM();
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const m = kind === 'concrete' ? r.concrete : kind === 'brick' ? r.brick : kind === 'glass' ? r.glass : r.drywall;
  const h = kind === 'glass' ? WALL_H - 10 : WALL_H;
  return (
    <group position={[(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2]} rotation={[0, -ang, 0]}>
      <Box p={[0, h / 2, 0]} s={[len + (kind === 'glass' ? 0 : t), h, t]} m={m} />
      {kind !== 'glass' && <Box p={[0, h + 0.5, 0]} s={[len + t, 1, t + 0.2]} m={r.wallTop} />}
      {kind === 'glass' && <Box p={[0, h + 3, 0]} s={[len, 6, t + 4]} m={r.white} />}
    </group>
  );
}

function Sofa({ p, rot = 0 }: { p: V3; rot?: number }) {
  const r = RM();
  return (
    <group position={p} rotation={[0, rot, 0]}>
      <Box p={[0, 22, 0]} s={[200, 24, 90]} m={r.fabric} />
      <Box p={[0, 50, -38]} s={[200, 50, 16]} m={r.fabric} />
      <Box p={[-96, 34, 0]} s={[16, 44, 90]} m={r.fabric} />
      <Box p={[96, 34, 0]} s={[16, 44, 90]} m={r.fabric} />
      {[-45, 45].map((x) => (
        <Box key={x} p={[x, 38, 4]} s={[86, 12, 76]} m={r.fabricLight} />
      ))}
    </group>
  );
}

/** Mieszkanie: podłogi, ściany, meble i niewielki trawnik dookoła. */
export function Apartment() {
  const r = RM();
  const n = MAT();
  return (
    <group>
      <Box p={[0, -6, 0]} s={[1100, 10, 900]} m={r.ground} />
      <Box p={[-170, -0.5, 0]} s={[460, 1, 600]} m={r.floor} />
      <Box p={[230, -0.5, -130]} s={[340, 1, 340]} m={r.floor} />
      <Box p={[135, -0.5, 170]} s={[150, 1, 260]} m={r.kitchenFloor} />
      <Box p={[305, -0.5, 170]} s={[190, 1, 260]} m={r.tiles} />
      {WALLS.map((w, i) => (
        <WallSeg key={i} {...w} />
      ))}
      {/* salon: dywan, kanapa, stolik, telewizor na szafce, konsola, roślina */}
      <Box p={[-250, 0.6, 15]} s={[200, 1, 230]} m={r.rug} />
      <Sofa p={[-160, 0, 15]} rot={-Math.PI / 2} />
      <Box p={[-270, 22, 15]} s={[55, 4, 100]} m={r.woodLight} />
      {[-292, -248].map((x) => [-28, 58].map((z) => <Box key={`${x}${z}`} p={[x, 10, z]} s={[4, 20, 4]} m={r.black} />))}
      <Box p={[-372, 22, 0]} s={[40, 44, 170]} m={r.wood} />
      <Box p={[-384, 95, 0]} s={[5, 70, 122]} m={r.black} />
      <mesh position={[TV[0] + 1, TV[1], TV[2]]} rotation={[0, Math.PI / 2, 0]} material={r.screen}>
        <planeGeometry args={[116, 64]} />
      </mesh>
      <Box p={[CONSOLE[0], CONSOLE[1] - 4, CONSOLE[2]]} s={[26, 7, 30]} m={r.white} />
      <Cyl p={[-370, 18, 120]} r={16} r2={12} h={36} m={r.white} />
      <mesh position={[-370, 62, 120]} scale={[1, 1.3, 1]} material={r.plant}>
        <sphereGeometry args={[26, 12, 10]} />
      </mesh>
      {/* komoda z routerem i modemem */}
      <Box p={[SIDEBOARD.x, SIDEBOARD.h / 2, SIDEBOARD.z]} s={[SIDEBOARD.w, SIDEBOARD.h, SIDEBOARD.d]} m={r.white} />
      <Box p={[SIDEBOARD.x, SIDEBOARD.h / 2, SIDEBOARD.z + SIDEBOARD.d / 2 + 0.3]} s={[0.6, SIDEBOARD.h - 8, 0.4]} m={r.wallTop} />
      {/* gniazdo światłowodu na ścianie */}
      <Box p={[FIBER_SOCKET[0], FIBER_SOCKET[1], FIBER_SOCKET[2] + 1]} s={[10, 12, 3]} m={r.white} />
      {/* sypialnia: łóżko, szafka, biurko z laptopem, krzesło */}
      <Box p={[300, 22, -120]} s={[160, 30, 200]} m={r.wood} />
      <Box p={[300, 42, -110]} s={[150, 14, 180]} m={r.fabricLight} />
      <Box p={[300, 60, -218]} s={[160, 60, 8]} m={r.wood} />
      <Box p={[375, 26, -40]} s={[40, 52, 36]} m={r.woodLight} />
      <Box p={[320, 72, -270]} s={[120, 4, 55]} m={r.woodLight} />
      {[265, 375].map((x) => (
        <Box key={x} p={[x, 36, -270]} s={[4, 70, 50]} m={r.woodLight} />
      ))}
      <Box p={[320, 45, -225]} s={[44, 6, 42]} m={r.black} />
      <Box p={[320, 72, -205]} s={[44, 50, 5]} m={r.black} />
      {/* kuchnia: blat z szafkami, mikrofalówka, głośnik; łazienka: wanna, umywalka */}
      <Box p={[135, 45, 275]} s={[140, 90, 50]} m={r.white} />
      <Box p={[135, 91, 275]} s={[144, 3, 54]} m={r.woodLight} />
      <Box p={[MICROWAVE[0], MICROWAVE[1] + 13, MICROWAVE[2]]} s={[46, 26, 34]} m={n.steel} />
      <Box p={[MICROWAVE[0] - 4, MICROWAVE[1] + 13, MICROWAVE[2] - 17.2]} s={[30, 18, 0.6]} m={r.black} />
      <Box p={[305, 28, 255]} s={[170, 56, 75]} m={r.white} />
      <Box p={[305, 50, 255]} s={[155, 10, 62]} m={r.water} />
      <Box p={[385, 42, 90]} s={[25, 84, 50]} m={r.white} />
    </group>
  );
}

/* ================= router ================= */

/** Położenia diod z przodu: zasilanie, internet, 2,4 GHz, 5 GHz, LAN, WPS. */
const LEDS = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
/** Porty z tyłu: WAN (niebieski) i 4 × LAN (żółte). */
export const PORTS_X = [-9.5, -7.3, -5.1, -2.9, -0.7];
/** Anteny: dwie z lewej, dwie z prawej. */
export const ANTS: [number, number][] = [
  [-13.4, -3.5],
  [-13.4, 3.5],
  [13.4, -3.5],
  [13.4, 3.5],
];

function fins(n: number, w: number, h: number, d: number, m: THREE.Material, gap: number) {
  return Array.from({ length: n }, (_, i) => <Box key={i} p={[(i - (n - 1) / 2) * gap, h / 2, 0]} s={[w, h, d]} m={m} />);
}

/**
 * Router (w cm, środek podstawy w 0,0,0, tył w z = −8): podstawa, płytka drukowana z procesorem pod radiatorem,
 * pamięciami, dwoma układami radiowymi pod ekranami, wzmacniaczami przy antenach, gniazdami sieci, zasilaniem
 * i diodami. `cover` – pokrywa założona; `ex()` – 0…1 rozsunięcie warstw.
 */
export function Router({ cover = true, ex, shields = true, blink = true }: { cover?: boolean; ex?: () => number; shields?: boolean; blink?: boolean }) {
  const r = RM();
  const n = MAT();
  const gTop = useRef<THREE.Group>(null);
  const gHs = useRef<THREE.Group>(null);
  const gSh = useRef<THREE.Group>(null);
  const gPcb = useRef<THREE.Group>(null);
  const gAntL = useRef<THREE.Group>(null);
  const gAntR = useRef<THREE.Group>(null);
  const led = useMemo(() => LEDS.map(() => new THREE.MeshBasicMaterial({ color: '#4ade80', toneMapped: false })), []);
  const socMat = useMemo(() => std('#ffffff', { map: chipTex(['SoC', '4 × 1,7 GHz']) }), []);
  const ramMat = useMemo(() => std('#ffffff', { map: chipTex(['DDR4', '512 MB']) }), []);
  const flashMat = useMemo(() => std('#ffffff', { map: chipTex(['NAND', '128 MB']) }), []);
  const swMat = useMemo(() => std('#ffffff', { map: chipTex(['SWITCH', '5 × 1G']) }), []);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    const e = ex ? ex() : 0;
    if (gTop.current) gTop.current.position.y = e * 16;
    if (gHs.current) gHs.current.position.y = e * 10;
    if (gSh.current) gSh.current.position.y = e * 6;
    if (gPcb.current) gPcb.current.position.y = e * 2.5;
    if (gAntL.current) gAntL.current.position.x = -e * 10;
    if (gAntR.current) gAntR.current.position.x = e * 10;
    if (blink)
      led.forEach((m, i) => {
        const on = i === 0 || Math.sin(t.current * (7 + i * 3.1) + i) > -0.2 || i === 1;
        m.color.set(on ? (i === 1 ? '#7dd3fc' : '#4ade80') : '#14361f');
      });
  });
  const pcbY = 1.0;
  const top = pcbY + 0.08;
  return (
    <group>
      {/* podstawa z nóżkami i otworami wentylacyjnymi */}
      <Box p={[0, 0.5, 0]} s={[26, 1, 16]} m={r.shell} />
      {[-11, 11].map((x) => [-6, 6].map((z) => <Cyl key={`${x}${z}`} p={[x, -0.15, z]} r={0.9} h={0.3} m={n.rubber} />))}
      {/* płytka i wszystko na niej */}
      <group ref={gPcb}>
        <Box p={[0, pcbY, 0]} s={[25, 0.16, 15]} m={r.pcb} />
        {/* gniazda RJ-45: WAN i 4 × LAN, transformatory sieciowe, układ przełącznika */}
        {PORTS_X.map((x, i) => (
          <group key={x} position={[x, top, -7]}>
            <Box p={[0, 0.7, 0.6]} s={[1.9, 1.4, 1.9]} m={n.nickel} />
            <Box p={[0, 0.65, -0.32]} s={[1.3, 1.0, 0.05]} m={n.slot} />
            <Box p={[0, 1.42, -0.2]} s={[1.9, 0.08, 0.4]} m={i ? r.ethYellow : r.ethBlue} />
          </group>
        ))}
        {[-8.4, -6.2, -4.0, -1.8].map((x) => (
          <Box key={x} p={[x, top + 0.25, -4.6]} s={[1.6, 0.5, 1.0]} m={n.chip} />
        ))}
        <mesh position={[-5, top + 0.1, -2.4]} material={swMat}>
          <boxGeometry args={[1.8, 0.2, 1.8]} />
        </mesh>
        {/* zasilanie: gniazdo 12 V, dławik, kondensatory, przycisk */}
        <Cyl p={[4, top + 0.6, -6.9]} r={0.6} h={1.8} m={n.slot} axis="z" />
        <Box p={[4, top + 0.6, -6.3]} s={[1.6, 1.4, 1.6]} m={n.chip} />
        <Box p={[6.2, top + 0.4, -5]} s={[1.2, 0.8, 1.2]} m={n.choke} />
        {[7.8, 8.8].map((x) => (
          <Cyl key={x} p={[x, top + 0.55, -5]} r={0.4} h={1.1} m={n.capacitor} />
        ))}
        <Box p={[7.2, top + 0.35, -7.2]} s={[0.8, 0.7, 0.6]} m={n.slot} />
        {/* procesor (SoC), pamięci, kwarc */}
        <mesh position={[0, top + 0.12, 1.5]} material={socMat}>
          <boxGeometry args={[2.4, 0.24, 2.4]} />
        </mesh>
        <mesh position={[3.8, top + 0.08, 1.2]} material={ramMat}>
          <boxGeometry args={[1.6, 0.16, 1.0]} />
        </mesh>
        <mesh position={[3.8, top + 0.08, 3.4]} material={flashMat}>
          <boxGeometry args={[1.2, 0.14, 0.9]} />
        </mesh>
        <Box p={[-2.2, top + 0.1, 3.6]} s={[0.6, 0.2, 0.35]} m={n.nickel} />
        {/* układy radiowe (pod ekranami), wzmacniacze przy antenach i kabelki do anten */}
        <Box p={[-8, top + 0.1, 2.4]} s={[2.0, 0.2, 2.0]} m={n.chip} />
        <Box p={[8, top + 0.1, 2.4]} s={[2.2, 0.2, 2.2]} m={n.chip} />
        {ANTS.map(([x, z]) => (
          <group key={`${x}${z}`}>
            <Box p={[x * 0.8, top + 0.08, z * 1.25]} s={[0.8, 0.16, 0.8]} m={n.chipGrey} />
            <Cyl p={[x * 0.88, top + 0.15, z * 1.25]} r={0.25} h={0.3} m={n.gold} />
            <Tube
              pts={[
                [x * 0.88, top + 0.3, z * 1.25],
                [x * 0.94, top + 1.0, z * 1.1],
                [x * 0.985, top + 1.2, z],
              ]}
              r={0.08}
              m={n.cable}
            />
          </group>
        ))}
        {/* diody z przodu */}
        {LEDS.map((x, i) => (
          <mesh key={x} position={[x, top + 0.15, 7.1]} material={led[i]}>
            <boxGeometry args={[0.5, 0.3, 0.4]} />
          </mesh>
        ))}
      </group>
      {/* ekrany układów radiowych */}
      {shields && (
        <group ref={gSh}>
          <Box p={[-8, top + 0.32, 2.4]} s={[5.6, 0.5, 4.6]} m={n.nickel} />
          <Box p={[8, top + 0.32, 2.4]} s={[5.6, 0.5, 4.6]} m={n.nickel} />
        </group>
      )}
      {/* radiator procesora */}
      <group ref={gHs} position={[0, 0, 0]}>
        <group position={[0, top + 0.24, 1.5]}>
          <Box p={[0, 0.15, 0]} s={[5, 0.3, 5]} m={n.alu} />
          <group position={[0, 0.3, 0]}>{fins(9, 0.22, 1.0, 5, n.alu, 0.58)}</group>
        </group>
      </group>
      {/* pokrywa z wentylacją */}
      {cover && (
        <group ref={gTop}>
          <Box p={[0, 2.85, 0]} s={[26, 3.3, 16]} m={r.shell} />
          <mesh position={[0, 4.51, 0]} rotation={[-Math.PI / 2, 0, 0]} material={r.shellTop}>
            <planeGeometry args={[25.4, 15.4]} />
          </mesh>
          {LEDS.map((x, i) => (
            <mesh key={x} position={[x, 2.6, 8.02]} material={led[i]}>
              <planeGeometry args={[0.6, 0.35]} />
            </mesh>
          ))}
          {/* wycięcia na gniazda z tyłu */}
          <Box p={[-5.1, 2.0, -8.02]} s={[11.4, 1.6, 0.1]} m={n.slot} />
        </group>
      )}
      {/* anteny na zawiasach po bokach */}
      {[
        [gAntL, -1],
        [gAntR, 1],
      ].map(([ref, s]) => (
        <group key={s as number} ref={ref as RefObject<THREE.Group>}>
          {ANTS.filter(([x]) => Math.sign(x) === s).map(([x, z]) => (
            <group key={z} position={[x, 2.4, z]}>
              <Cyl p={[0, 0, 0]} r={0.8} h={1.6} m={r.shell} axis="x" />
              <mesh position={[0.6 * (s as number), 8.5, 0]} material={r.shell}>
                <boxGeometry args={[0.9, 16, 2.2]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Modem światłowodowy (ONT): biała skrzynka z zieloną wtyczką światłowodu. */
export function Ont() {
  const r = RM();
  const n = MAT();
  return (
    <group position={ONT}>
      <Box p={[0, 7, 0]} s={[4, 14, 16]} m={r.white} />
      <Box p={[0, 0.5, 0]} s={[8, 1, 12]} m={r.white} />
      {[10, 8, 6].map((y) => (
        <Box key={y} p={[2.05, y, 6]} s={[0.1, 0.4, 0.6]} m={n.ledGreen} />
      ))}
      <Box p={[0, 3, -8.1]} s={[1.2, 1.2, 0.6]} m={r.fiber} />
    </group>
  );
}

/** Kable: Ethernet router–modem i światłowód modem–gniazdo w ścianie. */
export function Cables() {
  const r = RM();
  return (
    <group>
      <Tube
        pts={[
          [ROUTER[0] - 5.1, ROUTER[1] + 1.8, ROUTER[2] - 8],
          [ROUTER[0] - 8, ROUTER[1] + 0.5, ROUTER[2] - 14],
          [ONT[0] + 10, ONT[1] + 0.5, ONT[2] - 12],
          [ONT[0], ONT[1] + 4, ONT[2] - 9],
        ]}
        r={0.35}
        m={r.ethBlue}
      />
      <Tube
        pts={[
          [ONT[0], ONT[1] + 3, ONT[2] - 8.5],
          [ONT[0] - 6, ONT[1] - 2, ONT[2] - 13],
          [FIBER_SOCKET[0] + 3, FIBER_SOCKET[1] + 8, FIBER_SOCKET[2] + 4],
          [FIBER_SOCKET[0], FIBER_SOCKET[1] - 2, FIBER_SOCKET[2] + 3],
        ]}
        r={0.25}
        m={r.fiber}
      />
    </group>
  );
}

/* ================= urządzenia ================= */

const PAGE = new Map<string, THREE.MeshBasicMaterial>();
/** Ekran telefonu: pusty albo z wczytaną stroną. */
function phoneScreen(page: boolean) {
  const k = page ? 'p' : 'e';
  if (PAGE.has(k)) return PAGE.get(k)!;
  const tex = texOf(128, 256, (g) => {
    g.fillStyle = page ? '#f8fafc' : '#0f172a';
    g.fillRect(0, 0, 128, 256);
    if (page) {
      g.fillStyle = '#0d9488';
      g.fillRect(0, 0, 128, 34);
      g.fillStyle = '#fff';
      g.font = 'bold 15px sans-serif';
      g.fillText('Pogoda', 10, 23);
      g.fillStyle = '#fbbf24';
      g.beginPath();
      g.arc(40, 80, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0f172a';
      g.font = 'bold 28px sans-serif';
      g.fillText('21°C', 70, 92);
      g.fillStyle = '#94a3b8';
      for (let i = 0; i < 6; i++) g.fillRect(10, 130 + i * 18, 60 + ((i * 37) % 48), 8);
    } else {
      g.fillStyle = '#334155';
      g.font = '14px sans-serif';
      g.fillText('Wczytuję…', 30, 130);
    }
  });
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  PAGE.set(k, m);
  return m;
}

/** Urządzenia: telefon na kanapie, laptop na biurku, telewizor, konsola, głośnik w kuchni. */
export function Devices({ page = true }: { page?: boolean }) {
  const r = RM();
  return (
    <group>
      <group position={PHONE} rotation={[-0.35, 0.3, 0]}>
        <Box p={[0, 0, 0]} s={[7.4, 0.8, 15]} m={r.black} />
        <mesh position={[0, 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]} material={phoneScreen(page)}>
          <planeGeometry args={[6.8, 14.2]} />
        </mesh>
      </group>
      <group position={LAPTOP}>
        <Box p={[0, 0.8, 0]} s={[34, 1.6, 23]} m={MAT().aluDark} />
        <group position={[0, 1.6, -11.5]} rotation={[-0.25, 0, 0]}>
          <Box p={[0, 11, -0.5]} s={[34, 22, 1]} m={MAT().aluDark} />
          <mesh position={[0, 11, 0.02]} material={r.screenOn}>
            <planeGeometry args={[31, 19]} />
          </mesh>
        </group>
      </group>
      <group position={SPEAKER}>
        <Cyl p={[0, 9, 0]} r={5} h={18} m={r.fabricLight} />
        <Cyl p={[0, 18.2, 0]} r={4.6} h={0.4} m={MAT().ledGreen} />
      </group>
    </group>
  );
}

/* ================= fale i zasięg ================= */

/** Rozchodzące się pierścienie fali wokół nadajnika (w płaszczyźnie poziomej i jako czasze). */
export function Waves({ p, color = '#7dd3fc', reach = 520, count = 4, speed = 160 }: { p: V3; color?: string; reach?: number; count?: number; speed?: number }) {
  const ring = useRef<THREE.Group>(null);
  const mats = useMemo(() => Array.from({ length: count }, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })), [count, color]);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    ring.current?.children.forEach((c, i) => {
      const k = ((t.current * speed) / reach + i / count) % 1;
      const s = 8 + k * reach;
      c.scale.set(s, s, s);
      mats[i].opacity = 0.26 * (1 - k) ** 1.5;
    });
  });
  return (
    <group ref={ring} position={p}>
      {mats.map((m, i) => (
        <mesh key={i} material={m}>
          <sphereGeometry args={[1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ))}
    </group>
  );
}

/** Mapa zasięgu na podłodze: najsilniejszy sygnał z nadajników `tx` w każdym punkcie mieszkania. */
export function Heatmap({ tx, band, microwave = false }: { tx: V3[]; band: 0 | 1; microwave?: boolean }) {
  const key = JSON.stringify([tx, band, microwave]);
  const mat = useMemo(() => {
    const W = 200;
    const H = 150;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, H);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const x = FLAT.x0 + ((i + 0.5) / W) * (FLAT.x1 - FLAT.x0);
        const z = FLAT.z0 + ((j + 0.5) / H) * (FLAT.z1 - FLAT.z0);
        const db = Math.max(...tx.map((p) => rssi(p, x, z, band, microwave)));
        const [rr, gg, bb] = rssiColor(db);
        const o = (j * W + i) * 4;
        img.data[o] = rr;
        img.data[o + 1] = gg;
        img.data[o + 2] = bb;
        img.data[o + 3] = 200;
      }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <mesh position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <planeGeometry args={[FLAT.x1 - FLAT.x0, FLAT.z1 - FLAT.z0]} />
    </mesh>
  );
}

/** Węzeł sieci mesh: mały biały walec z diodą. */
export function MeshNode({ p }: { p: V3 }) {
  const r = RM();
  return (
    <group position={p}>
      <Cyl p={[0, 7, 0]} r={5.5} r2={4.5} h={14} m={r.white} />
      <Cyl p={[0, 14.1, 0]} r={2} h={0.3} m={MAT().ledWhite} />
    </group>
  );
}
