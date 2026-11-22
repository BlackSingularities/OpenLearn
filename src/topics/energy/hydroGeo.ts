/*
 * Elektrownia wodna – geometria bez Reacta: dolina górskiej rzeki, zapora ciężka z przelewem, elektrownia u stopy
 * zapory (cztery hydrozespoły z turbinami Francisa), zbiornik górny, zbiornik dolny za jazem, rozdzielnia,
 * drogi przepływów i parametry pracy.
 *
 * Wzór: zapora i elektrownia szczytowo-pompowa w Solinie (zapora ok. 82 m, cztery hydrozespoły, ok. 200 MW,
 * zbiornik dolny w Myczkowcach). Jednostki: metry, oś y w górę; rzeka płynie z −z (zbiornik) do +z (dolina).
 * Scena w skali 0,25 jak pozostałe elektrownie.
 */
import { fbm, rng } from './windGeo';

export type V3 = [number, number, number];
export { fbm, rng };
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
export const sm = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const FRAME = { position: [0, 0, 0] as V3, scale: 0.25 };

/* ================= poziomy wody i parametry ================= */

/** Normalny poziom wody w zbiorniku, korona zapory, woda pod elektrownią (zbiornik dolny) i poniżej jazu. */
export const LEVEL = 76;
export const CREST = 82;
export const TAIL = 6;
export const DOWN = 1.5;
export const RHO = 1000;
export const G = 9.81;

export const UNIT = {
  /** Liczba hydrozespołów i moc jednego (MW). */
  n: 4,
  P1: 50,
  /** Przepływ przez jedną turbinę przy pełnej mocy (m³/s). */
  Q1: 80,
  /** Sprawność hydrozespołu (turbina z generatorem). */
  eta: 0.91,
  /** Obroty (obr/min) i liczba biegunów generatora: 60 · 50 Hz · 2 / 250 = 24. */
  rpm: 250,
  poles: 24,
  /** Zbiornik: powierzchnia (km²) i pojemność (mln m³). */
  area: 22,
  volume: 470,
};
/** Moc (MW) przy spadzie h (m) i przepływie q (m³/s). */
export const powerOf = (h: number, q: number, eta = UNIT.eta) => (RHO * G * q * Math.max(0, h) * eta) / 1e6;

/* ================= dolina ================= */

/** Oś doliny: poniżej i powyżej zapory rzeka meandruje. */
export const cz = (z: number) => (z > 250 ? 60 * Math.sin((z - 250) / 300) * sm(250, 450, z) : z < -300 ? 80 * Math.sin((z + 300) / 400) * sm(-300, -520, z) : 0);
/** Połowa szerokości płaskiego dna doliny. */
const floorHalf = (z: number) => (z < -50 ? 70 + 110 * sm(-50, -520, z) : z > 120 ? 70 + 25 * sm(120, 260, z) : 70);

/** Jaz zbiornika dolnego (w dół rzeki). */
export const WEIR_Z = 760;
export const WEIR_Y = 7;
/** Rozdzielnia na terasie lewego brzegu. */
export const SWY = { x0: -170, x1: -110, z0: 150, z1: 240, y: 9 };

export function groundH(x: number, z: number) {
  const xp = Math.abs(x - cz(z));
  const w = floorHalf(z);
  const hills = 150 * sm(w, w + 330, xp) + 45 * fbm(x / 260 + 3, z / 260 - 1) * sm(w, w + 200, xp);
  // poniżej elektrowni: koryto rzeki i terasy po bokach; za jazem koryto jest niżej
  let bed = 0;
  if (z > 112) bed = mix(z > WEIR_Z + 6 ? -1.5 : 0, 9, sm(40, 54, xp) * sm(112, 150, z));
  // zbiornik górny płytszy pod koniec, rzeka wpływa z gór
  if (z < -950) bed += (-950 - z) * 0.24;
  // dalekie góry dookoła (Bieszczady): grzbiety wyrastają za krawędzią doliny
  const far = 340 * sm(1100, 1950, Math.hypot(x, z - 100)) * (0.45 + 0.55 * fbm(x / 420 + 7, z / 420 - 3));
  let h = Math.max(hills, bed) + far;
  // wykop pod elektrownią: teren nie może przechodzić przez jej część podwodną (widać to w przekroju)
  if (x > -69 && x < 9 && z > 58 && z < 112) return -16;
  const dx = Math.max(SWY.x0 - x, 0, x - SWY.x1);
  const dz = Math.max(SWY.z0 - z, 0, z - SWY.z1);
  h = mix(h, SWY.y, 1 - sm(0, 30, Math.hypot(dx, dz)));
  return h;
}

/* ================= zapora ================= */

/**
 * Zapora ciężka w przekroju (z, y): ściana od strony wody pionowa w z = 0, korona szerokości 10 m na wysokości
 * 82 m, ściana od strony doliny pochyła (0,76 : 1) aż do stopy w z ≈ 66 m, fundament w skale do y = −6.
 */
export const DAM = { x0: -340, x1: 340, crestW: 10, faceTop: 74, base: -6 };
export const zFace = (y: number) => DAM.crestW + (DAM.faceTop - y) * (56 / 74);
/** Przelew: trzy przęsła z zamknięciami segmentowymi między filarami, próg przelewu niżej niż korona. */
export const SPILL = { x0: 16, x1: 62, crest: 70, bay: 12, pier: 2.5 };
export const BAYS: [number, number][] = [0, 1, 2].map((i) => [SPILL.x0 + SPILL.pier + i * (SPILL.bay + SPILL.pier), SPILL.x0 + SPILL.pier + i * (SPILL.bay + SPILL.pier) + SPILL.bay]);
/** Galerie kontrolne w zaporze (z, y, szerokość, wysokość). */
export const GALLERIES: [number, number, number, number][] = [
  [3.5, 5, 3, 3.5],
  [3.5, 56, 2.5, 3],
  [28, 3, 2.5, 3],
];

/* ================= elektrownia ================= */

/** Hydrozespoły (x osi). Ten, przez który prowadzimy przekrój, to UNITS[CUT]. */
export const UNITS = [-57, -39, -21, -3];
export const CUT = 2;
export const CUT_X = UNITS[CUT];
/** Budynek elektrowni u stopy zapory: część podwodna (beton) i hala maszyn. */
export const PH = { x0: -67, x1: 7, z0: 60, z1: 112, hallZ1: 96, floor: 8, roof: 28, base: -16 };
/** Turbina: oś pionowa w z = 82, środek kierownicy na y = 0; generator nad nią. */
export const TU = { z: 82, y: 0, rRun: 2.2, rVane: 3.3, rSpiral: 4.4 };
export const GEN = { y0: 10, y1: 14, r: 6, rIn: 4.6 };
/** Rurociąg derywacyjny w zaporze (z, y): od wlotu z kratami do spirali turbiny. */
export const PEN_R = 2.4;
export const PEN: [number, number][] = [
  [-8, 42],
  [6, 42],
  [50, 4],
  [57, 0],
  [74, 0],
];
/** Transformatory na pomoście za halą. */
export const TRAFO_Z = 104;

/** Słupy linii 220 kV z rozdzielni na zachód, na zboczu. */
export const PYLONS: V3[] = [
  [-260, 0, 200],
  [-380, 0, 150],
  [-500, 0, 120],
  [-640, 0, 110],
  [-780, 0, 120],
].map(([x, , z]) => [x, groundH(x, z), z] as V3);

/* ================= drogi przepływów ================= */

/** Woda przez hydrozespół o osi x = u: ze zbiornika przez kraty, rurociąg, spiralę, wirnik i rurę ssawną do rzeki. */
export const unitPath = (u: number, dx = 0): V3[] => [
  [u + dx, 26, -90],
  [u + dx, 40, -20],
  [u + dx, 42, -6],
  [u + dx, 42, 6],
  [u + dx, 4, 50],
  [u + dx, 0, 57],
  [u + dx, 0, 76],
  [u + dx, -0.5, 82],
  [u + dx, -4, 82.6],
  [u + dx, -8.5, 85],
  [u + dx, -9, 94],
  [u + dx, -8, 112],
  [u + dx, 2, 136],
  [u + dx, 3.5, 210],
];
/** Rzeka w dół doliny: od elektrowni przez zbiornik dolny i jaz dalej. */
export const riverPath = (off: number): V3[] => {
  const pts: V3[] = [];
  for (let z = 120; z <= 1260; z += 40) {
    const y = z < WEIR_Z - 4 ? TAIL - 0.4 : z < WEIR_Z + 12 ? mix(WEIR_Y + 0.4, DOWN - 0.2, sm(WEIR_Z - 4, WEIR_Z + 12, z)) : DOWN - 0.2;
    pts.push([cz(z) + off, y, z]);
  }
  return pts;
};
/** Dopływ rzeki do zbiornika z gór. */
export const inflowPath = (off: number): V3[] => {
  const pts: V3[] = [];
  for (let z = -1300; z <= -950; z += 25) pts.push([cz(z) + off, Math.max(LEVEL - 0.3, groundH(cz(z) + off, z) + 0.6), z]);
  return pts;
};
/** Prąd: z generatora hydrozespołu przez transformator, linią do rozdzielni i dalej linią na zachód. */
export const P_POWER: V3[] = [
  [CUT_X, GEN.y1, TU.z],
  [CUT_X, GEN.y1, TRAFO_Z - 4],
  [CUT_X - 10, 14, TRAFO_Z],
  [-60, 26, TRAFO_Z + 2],
  [SWY.x1 - 6, SWY.y + 18, SWY.z0 + 14],
  [SWY.x0 + 8, SWY.y + 18, SWY.z0 + 40],
  ...PYLONS.map((p) => [p[0], p[1] + 30, p[2]] as V3),
];

/* ================= powódź ================= */

/**
 * Wezbranie: dopływ do zbiornika (m³/s) w funkcji czasu (h). Zbiornik przyjmuje część wody, zamknięcia przelewu
 * otwierają się, gdy woda przekroczy poziom normalny – odpływ jest dużo mniejszy niż szczyt dopływu.
 */
export const qIn = (h: number) => 120 + 2300 * Math.exp(-(((h - 18) / 7) ** 2)) + 600 * Math.exp(-(((h - 30) / 6) ** 2));
export const FLOOD_H = 60;
export interface FloodPoint {
  h: number;
  qin: number;
  qout: number;
  level: number;
  gate: number;
}
export const FLOOD: FloodPoint[] = (() => {
  const out: FloodPoint[] = [];
  let level = LEVEL - 1;
  let gate = 0;
  const A = UNIT.area * 1e6;
  const dt = 0.1;
  for (let h = 0; h <= FLOOD_H + 1e-6; h += dt) {
    const qi = qIn(h);
    // zamknięcia przelewu otwierają się powoli, gdy woda przekracza poziom normalny; turbiny pracują pełną mocą
    const want = clamp((level - (LEVEL - 0.2)) / 2.6);
    gate += clamp(want - gate, -0.02, 0.02) * (dt / 0.1);
    const qs = gate * 1400 * Math.sqrt(clamp((level - SPILL.crest) / (LEVEL - SPILL.crest), 0, 2));
    const qo = UNIT.n * UNIT.Q1 + qs;
    level += ((qi - qo) * dt * 3600) / A;
    out.push({ h, qin: qi, qout: qo, level, gate });
  }
  return out;
})();
export const floodAt = (h: number) => FLOOD[Math.round(clamp(h, 0, FLOOD_H) / 0.1)];

/* ================= doba szczytowo-pompowa ================= */

/** Zapotrzebowanie na moc w kraju w ciągu doby (0…1). */
export function demandAt(h: number) {
  const morning = Math.exp(-(((h - 8.5) / 2.6) ** 2)) * 0.22;
  const evening = Math.exp(-(((h - 18.5) / 2.2) ** 2)) * 0.3;
  const night = 0.62 + 0.06 * Math.cos(((h - 3) / 24) * Math.PI * 2);
  return Math.min(1, night + morning + evening);
}
/** Praca hydrozespołów w ciągu doby: −1 pompowanie (noc, w południe przy dużej produkcji ze słońca), +1 praca turbinowa. */
export function pumpModeAt(h: number) {
  if (h < 5) return -1;
  if (h < 6) return 0;
  if (h < 10) return 1;
  if (h < 11) return 0;
  if (h < 14) return -0.6;
  if (h < 16) return 0;
  if (h < 21.5) return 1;
  if (h < 23) return 0;
  return -1;
}

/* ================= udział energetyki wodnej ================= */

export const HYDRO_SHARE: [string, number, string][] = [
  ['Norwegia', 88, '#38bdf8'],
  ['Austria', 60, '#60a5fa'],
  ['świat', 14, '#a5b4fc'],
  ['Niemcy', 4, '#94a3b8'],
  ['Polska', 2, '#f87171'],
];
export const PL_PLANTS: [string, number, string][] = [
  ['Żarnowiec (pompowa)', 716, '#22d3ee'],
  ['Porąbka-Żar (pompowa)', 500, '#22d3ee'],
  ['Solina (pompowa)', 200, '#22d3ee'],
  ['Włocławek (przepływowa)', 160, '#4ade80'],
];

/** Pomocnicza: odsunięcie łamanej (z, y) o d w bok (normalne w punktach, z ucięciem ostrych kątów). */
export function offsetLine(pts: [number, number][], d: number): [number, number][] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const n1 = i > 0 ? norm(a, p) : norm(p, b);
    const n2 = i < pts.length - 1 ? norm(p, b) : norm(a, p);
    let nx = n1[0] + n2[0];
    let ny = n1[1] + n2[1];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const cos = nx * n1[0] + ny * n1[1];
    const k = d / Math.max(0.5, cos);
    return [p[0] + nx * k, p[1] + ny * k];
  });
}
function norm(a: [number, number], b: [number, number]): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
}

export const RANDOM = rng;
