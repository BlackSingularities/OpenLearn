/*
 * Router Wi-Fi – wspólne wymiary (cm): mieszkanie, ściany z materiałami, położenie routera i urządzeń,
 * drogi pakietów, pracownie i prosty model zasięgu (tłumienie w powietrzu i w ścianach).
 */
export type V3 = [number, number, number];

/** Model w cm, na scenie w skali 0,15. */
export const FRAME = { position: [0, 0, 0] as V3, scale: 0.15 };

/** Mieszkanie: x −400…400, z −300…300, ściany przycięte na wysokości WALL_H (widok „domku dla lalek”). */
export const FLAT = { x0: -400, x1: 400, z0: -300, z1: 300 };
export const WALL_H = 115;

export type WallKind = 'concrete' | 'brick' | 'drywall' | 'glass';
export interface Wall {
  a: [number, number];
  b: [number, number];
  t: number;
  kind: WallKind;
}
/** Ściany (odcinki w planie x–z). Drzwi to przerwy między odcinkami. */
export const WALLS: Wall[] = [
  // zewnętrzne – żelbet
  { a: [-400, -300], b: [400, -300], t: 24, kind: 'concrete' },
  { a: [-400, 300], b: [-150, 300], t: 24, kind: 'concrete' },
  { a: [-30, 300], b: [400, 300], t: 24, kind: 'concrete' },
  { a: [-400, -300], b: [-400, 300], t: 24, kind: 'concrete' },
  { a: [400, -300], b: [400, 300], t: 24, kind: 'concrete' },
  // okno balkonowe w salonie
  { a: [-150, 300], b: [-30, 300], t: 8, kind: 'glass' },
  // salon | sypialnia i kuchnia – ściana nośna z drzwiami do sypialni i przejściem do kuchni
  { a: [60, -300], b: [60, -150], t: 18, kind: 'concrete' },
  { a: [60, -60], b: [60, 120], t: 18, kind: 'concrete' },
  { a: [60, 220], b: [60, 300], t: 18, kind: 'concrete' },
  // sypialnia | kuchnia i łazienka – ścianka g-k z drzwiami do łazienki
  { a: [60, 40], b: [280, 40], t: 12, kind: 'drywall' },
  { a: [350, 40], b: [400, 40], t: 12, kind: 'drywall' },
  // kuchnia | łazienka – cegła
  { a: [210, 40], b: [210, 300], t: 14, kind: 'brick' },
];
/** Tłumienie ściany (dB) dla pasm 2,4 / 5 GHz. */
export const WALL_DB: Record<WallKind, [number, number]> = {
  concrete: [11, 17],
  brick: [6, 10],
  drywall: [3, 5],
  glass: [2, 4],
};

/** Router na komodzie w salonie, przy gnieździe światłowodu. */
export const SIDEBOARD = { x: -60, z: -268, w: 120, d: 40, h: 72 };
export const ROUTER: V3 = [-40, SIDEBOARD.h, -270];
export const ONT: V3 = [-92, SIDEBOARD.h, -272];
export const FIBER_SOCKET: V3 = [-120, 40, -287];
/** Drugie miejsce routera (do porównania): na regale pośrodku mieszkania. */
export const ROUTER_MID: V3 = [28, 100, 0];
/** Węzły sieci mesh. */
export const MESH_NODES: V3[] = [
  [375, 55, -40],
  [180, 92, 282],
];

/** Urządzenia w mieszkaniu. */
export const PHONE: V3 = [-178, 46, 40];
export const LAPTOP: V3 = [320, 76, -255];
export const TV: V3 = [-382, 95, 0];
export const SPEAKER: V3 = [140, 92, 284];
export const MICROWAVE: V3 = [95, 92, 280];
export const CONSOLE: V3 = [-372, 52, -40];

/* ================= drogi pakietów ================= */

const ANT: V3 = [ROUTER[0], ROUTER[1] + 14, ROUTER[2]];
/** Łuk w powietrzu między dwoma punktami. */
export function arc(a: V3, b: V3, h = 60, n = 16): V3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(Math.PI * t) * h, a[2] + (b[2] - a[2]) * t] as V3;
  });
}
export const PATH_AIR_UP = arc([PHONE[0], PHONE[1] + 8, PHONE[2]], ANT, 70);
export const PATH_AIR_DOWN = [...PATH_AIR_UP].reverse();
export const PATH_ETH: V3[] = [
  [ROUTER[0] - 6, ROUTER[1] + 2, ROUTER[2] - 7],
  [ROUTER[0] - 20, ROUTER[1] + 0.6, ROUTER[2] - 12],
  [ONT[0] + 8, ONT[1] + 0.6, ONT[2] - 6],
  [ONT[0] + 5, ONT[1] + 2, ONT[2] - 4],
];
export const PATH_FIBER: V3[] = [
  [ONT[0] - 5, ONT[1] + 2, ONT[2] - 4],
  [ONT[0] - 14, ONT[1] - 4, ONT[2] - 10],
  [FIBER_SOCKET[0] + 4, FIBER_SOCKET[1] + 4, FIBER_SOCKET[2] + 2],
  [FIBER_SOCKET[0], FIBER_SOCKET[1], FIBER_SOCKET[2] - 6],
  [FIBER_SOCKET[0], FIBER_SOCKET[1], -340],
  [FIBER_SOCKET[0], 5, -420],
  [FIBER_SOCKET[0], 5, -700],
];

/* ================= pracownie ================= */

const LX = (i: number): V3 => [1400 + i * 700, 0, 0];
export const LAB = {
  eth: LX(0),
  wave: LX(1),
  dipole: LX(2),
  walls: LX(3),
  spectrum: LX(4),
  packet: LX(5),
  qam: LX(6),
  ofdma: LX(7),
  chain: LX(8),
  fiber: LX(9),
  crypt: LX(10),
};
/** Wysokość środka eksponatu nad podłogą podestu. */
export const LAB_Y = 110;

/* ================= zasięg ================= */

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const sm = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function crosses(p: [number, number], q: [number, number], a: [number, number], b: [number, number]) {
  const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d;
  const u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d;
  return t > 0 && t < 1 && u >= 0 && u <= 1;
}

/**
 * Siła sygnału (dBm) w punkcie (x, z) od nadajnika w `tx`: moc 20 dBm, tłumienie w wolnej przestrzeni rosnące
 * z odległością (w mieszkaniu wykładnik 2,8) i stała strata na każdej przeciętej ścianie.
 */
export function rssi(tx: V3, x: number, z: number, band: 0 | 1, microwave = false) {
  const d = Math.max(0.5, Math.hypot(x - tx[0], z - tx[2]) / 100);
  let db = 20 - (band ? 47 : 40) - 28 * Math.log10(d);
  for (const w of WALLS) if (crosses([tx[0], tx[2]], [x, z], w.a, w.b)) db -= WALL_DB[w.kind][band];
  if (microwave && band === 0) db -= 12 * Math.exp(-((Math.hypot(x - MICROWAVE[0], z - MICROWAVE[2]) / 220) ** 2));
  return db;
}
/** Kolor siły sygnału: zielony (świetny) → żółty → pomarańczowy → czerwony (brak). */
export function rssiColor(db: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [-45, [34, 197, 94]],
    [-60, [132, 204, 22]],
    [-68, [250, 204, 21]],
    [-76, [249, 115, 22]],
    [-84, [220, 38, 38]],
    [-95, [90, 20, 30]],
  ];
  if (db >= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++)
    if (db >= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const t = (db - b) / (a - b);
      return [0, 1, 2].map((k) => Math.round(cb[k] + (ca[k] - cb[k]) * t)) as [number, number, number];
    }
  return stops[stops.length - 1][1];
}
export const rssiWord = (db: number) => (db > -55 ? 'świetny' : db > -65 ? 'dobry' : db > -72 ? 'wystarczy do filmów' : db > -80 ? 'słaby' : 'brak zasięgu');
/** Przybliżona prędkość w danym miejscu (Mb/s) przy Wi-Fi 6, pasmo 2,4 / 5 GHz. */
export const speedAt = (db: number, band: 0 | 1) => {
  const max = band ? 1200 : 300;
  return Math.round(max * clamp((db + 85) / 35, 0, 1) ** 1.4);
};

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
