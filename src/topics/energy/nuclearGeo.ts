/*
 * Elektrownia jądrowa – geometria bez Reacta: plan terenu nad morzem (budynek osłonowy reaktora, budynek
 * pomocniczy z basenem wypalonego paliwa, maszynownia, ujęcie i zrzut wody morskiej, magazyn suchy, rozdzielnia),
 * wymiary urządzeń obiegu pierwotnego i parametry pracy bloku.
 *
 * Wzór: blok z reaktorem wodnym ciśnieniowym typu AP1000 (taki wybrano dla pierwszej polskiej elektrowni jądrowej
 * na Pomorzu). Jednostki: metry, oś y w górę; scena w skali 0,25 jak pozostałe elektrownie. Maszynownia,
 * turbozespół i rozdzielnia stoją w tych samych miejscach co w elektrowni węglowej (te same modele).
 */
import { fbm, rng, type V3 } from './coalGeo';
import { AX } from './coalGeo';

export { fbm, rng, type V3 };
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
export const sm = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const FRAME = { position: [0, 0, 0] as V3, scale: 0.25 };

/* ================= parametry bloku ================= */

export const UNIT = {
  /** Moc cieplna reaktora (MW). */
  Pth: 3415,
  /** Moc elektryczna brutto (MW). */
  P: 1150,
  eta: 0.335,
  /** Obieg pierwotny: ciśnienie (MPa), temperatura wody na wlocie i wylocie reaktora (°C). */
  p1: 15.5,
  tCold: 281,
  tHot: 321,
  /** Przepływ wody w obiegu pierwotnym (t/s). */
  flow1: 14.3,
  /** Para: ciśnienie (MPa) i temperatura (°C) za wytwornicami. */
  p2: 5.8,
  t2: 273,
  /** Obroty turbiny (obr/min) – połowa obrotów turbiny węglowej, generator ma cztery bieguny. */
  rpm: 1500,
  /** Rdzeń: kasety paliwowe, pręty w kasecie, wysokość czynna (m), masa uranu (t). */
  assemblies: 157,
  rodsPer: 264,
  coreH: 4.27,
  uranium: 75,
};

/** Ciepło powyłączeniowe: część mocy cieplnej t sekund po wyłączeniu reaktora (wzór Way–Wigner, przybliżenie). */
export const decayHeat = (t: number) => (t <= 0 ? 1 : 0.066 * (Math.pow(Math.max(t, 1), -0.2) - Math.pow(Math.max(t, 1) + 4e7, -0.2)));

/* ================= budynek reaktora ================= */

/** Budynek osłonowy (beton) i stalowa obudowa bezpieczeństwa w środku. */
export const SHIELD = { r: 22.5, t: 0.9, h: 62, roofTop: 74, tankY0: 66, tankY1: 76, tankR: 13, stackTop: 84 };
export const CV = { r: 19.8, h: 50, domeH: 16 };
/** Zbiornik reaktora: środek osi, promień, dół i góra części walcowej. */
export const RPV = { r: 2.2, y0: 9.5, y1: 18.5, nozY: 16.4 };
/** Rdzeń w zbiorniku. */
export const CORE = { r: 1.7, y0: 10.6, y1: 10.6 + 4.27, pitch: 0.215 };
/** Wytwornice pary (dwie, po obu stronach reaktora w osi x). */
export const SG = { x: 10, rLow: 2.1, rUp: 2.9, y0: 15, yMid: 29, y1: 37 };
/** Stabilizator ciśnienia. */
export const PZR = { x: 0, z: -11, r: 1.3, y0: 18, y1: 33 };
/** Pompy obiegu pierwotnego: pod wytwornicami, po dwie na każdą. */
export const RCP_DZ = 1.5;
/** Pomost przeładunkowy (strop nad reaktorem) i suwnica obrotowa. */
export const DECK_Y = 34;
export const CRANE_Y = 52;

/** Kasety paliwowe w rdzeniu: położenia (x, z) w siatce 17×17 przyciętej do koła. */
export const ASSEMBLIES: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = -8; i <= 8; i++)
    for (let j = -8; j <= 8; j++) {
      const x = i * CORE.pitch;
      const z = j * CORE.pitch;
      if (Math.hypot(x, z) < CORE.r - 0.1) out.push([x, z]);
    }
  return out.slice(0, UNIT.assemblies);
})();
/** Czy kaseta ma wiązkę prętów sterujących (co druga w szachownicę). */
export const hasRod = (k: number) => {
  const [x, z] = ASSEMBLIES[k];
  const i = Math.round(x / CORE.pitch);
  const j = Math.round(z / CORE.pitch);
  return (i + j) % 2 === 0 && (i % 2 === 0);
};

/* ================= pozostałe budynki ================= */

/** Budynek pomocniczy z basenem wypalonego paliwa (obok budynku reaktora, od strony +x). */
export const AUX = { x0: 24, x1: 66, z0: -26, z1: 26, h: 34 };
export const POOL = { x0: 36, x1: 48, z0: -14, z1: 0, y0: 1, y1: 13 };
/** Kanał przeładunkowy: z reaktora do basenu (tunel z wózkiem). */
export const TRANSFER_Y = 6;
/** Maszynownia (te same wymiary co w elektrowni węglowej). */
export const TH = { x0: -150, x1: -42, z0: -24, z1: 24, h: 46 };
export { AX };
/** Budynki agregatów prądotwórczych (diesli) i magazyn suchy pojemników z paliwem. */
export const DIESEL: V3[] = [
  [40, 0, 52],
  [62, 0, 52],
];
export const CASKS = { x0: 120, x1: 186, z0: 30, z1: 84 };
/** Brzeg morza: plaża od z = BEACH do SEA_Z, dalej morze. */
export const BEACH = -250;
export const SEA_Z = -300;
/** Pompownia wody morskiej i głowice ujęcia oraz zrzutu daleko w morzu. */
export const PUMP: V3 = [-90, 0, -110];
export const INTAKE: V3 = [-160, -8, -900];
export const OUTFALL: V3 = [60, -8, -760];
/** Rozdzielnia i linia (jak w elektrowni węglowej). */
export const SWYARD = { x0: -290, x1: -200, z0: -60, z1: 70 };

/** Teren: płasko w obrębie elektrowni, wydmy przy plaży, pod wodą dno opada. */
export function groundH(x: number, z: number) {
  if (z < SEA_Z) return -2 - Math.min(14, (SEA_Z - z) * 0.02);
  const dune = z < BEACH + 40 && z > SEA_Z ? 0 : z < BEACH + 120 ? 6 * Math.exp(-(((z - (BEACH + 80)) / 26) ** 2)) * (0.7 + 0.6 * fbm(x / 80, 3)) : 0;
  const beach = z < BEACH + 40 ? -1.6 * clamp((BEACH + 40 - z) / 90) : 0;
  const hills = (fbm(x / 500 + 2, z / 500) - 0.5) * 14 * sm(500, 1100, Math.hypot(x, z - 200));
  return dune + beach + hills;
}
export const inPlant = (x: number, z: number) => x > -320 && x < 220 && z > -140 && z < 120;

/* ================= przepływy ================= */

/** Gałąź gorąca (z reaktora do wytwornicy) i zimna (z pompy do reaktora) – dla wytwornicy po stronie sg (±1). */
export const hotLeg = (sg: number): V3[] => [
  [sg * RPV.r, RPV.nozY, 0],
  [sg * (SG.x - 1.4), RPV.nozY, 0],
  [sg * SG.x, SG.y0 - 1, 0],
  [sg * SG.x, SG.yMid - 2, 0],
];
export const coldLeg = (sg: number, dz: number): V3[] => [
  [sg * SG.x, SG.yMid - 2, dz * 0.5],
  [sg * SG.x, SG.y0 - 1.5, dz],
  [sg * (SG.x - 0.4), SG.y0 - 5.4, dz],
  [sg * (SG.x - 2.5), RPV.nozY - 1, dz],
  [sg * (RPV.r + 0.2), RPV.nozY - 1, dz * 0.7],
  [sg * 0.6, RPV.y0 + 1, dz * 0.3],
  [0, CORE.y0 - 0.3, 0],
  [0, CORE.y1 + 0.4, 0],
  [sg * RPV.r, RPV.nozY, 0],
];
/** Para z wytwornic: z kopuły wytwornicy przez ścianę obudowy do maszynowni i części WP turbiny. */
export const P_STEAM: V3[] = [
  [-SG.x, SG.y1, 0],
  [-SG.x, SG.y1 + 4, 0],
  [-17, SG.y1 + 4, 4],
  [-24, 30, 6],
  [-36, 30, 6],
  [-50, 22, 4],
  [-56, AX + 2.6, 0],
];
export const P_STEAM2: V3[] = [
  [SG.x, SG.y1, 0],
  [SG.x, SG.y1 + 4, 0],
  [6, SG.y1 + 6, -14],
  [-17, SG.y1 + 4, -6],
  [-24, 30, -6],
  [-36, 30, -6],
  [-50, 22, -4],
  [-56, AX + 2.6, 0],
];
/** Przelotnia: para z części WP przez osuszacz-przegrzewacz do trzech części NP. */
export const P_CROSS: V3[] = [
  [-60, AX + 2.6, 0],
  [-60, AX + 9, 0],
  [-69, AX + 9, 0],
  [-69, AX + 3.4, 0],
  [-69, AX + 9, 0],
  [-86, AX + 9, 0],
  [-86, AX + 5.2, 0],
  [-86, AX + 9, 0],
  [-103, AX + 9, 0],
  [-103, AX + 5.2, 0],
];
/** Woda zasilająca: ze skraplacza przez pompy z powrotem do wytwornic. */
export const P_FEED: V3[] = [
  [-94, 3, 10],
  [-70, 3, 14],
  [-46, 3, 14],
  [-30, 8, 14],
  [-21, 20, 10],
  [-14, 24, 6],
  [-SG.x, SG.yMid, 0],
];
/** Woda morska: z ujęcia daleko w morzu tunelem do pompowni, przez skraplacz i z powrotem do zrzutu. */
export const P_SEA_IN: V3[] = [
  [INTAKE[0], 0.8, INTAKE[2]],
  [INTAKE[0], 0.8, -400],
  [PUMP[0] - 6, 1.2, PUMP[2] - 30],
  [PUMP[0] - 6, 1.2, PUMP[2]],
  [-90, 1, -40],
  [-94, 2, -6],
];
export const P_SEA_OUT: V3[] = [
  [-84, 2, -6],
  [-80, 1, -40],
  [-60, 1.2, -90],
  [-20, 1.2, -200],
  [OUTFALL[0], 0.8, -420],
  [OUTFALL[0], 0.8, OUTFALL[2]],
];
/** Prąd: z generatora do transformatora, rozdzielni i linii (jak w elektrowni węglowej). */
export { P_POWER } from './coalGeo';

/** Kaseta przenoszona przy wymianie paliwa: z rdzenia nad kanał, tunelem do basenu i w dół do stojaka. */
export const P_REFUEL: V3[] = [
  [0.65, CORE.y0 + 2.1, 0.43],
  [0.65, DECK_Y - 2, 0.43],
  [12, DECK_Y - 2, -4],
  [14, TRANSFER_Y + 2, -4],
  [POOL.x0 - 2, TRANSFER_Y + 2, -4],
  [POOL.x0 + 3, POOL.y1 + 1, -7],
  [POOL.x0 + 7, POOL.y1 + 1, -7],
  [POOL.x0 + 7, POOL.y0 + 3, -7],
];

/** Emisje CO₂ w całym cyklu życia (g na kWh, mediany IPCC). */
export const CO2_LIFE: [string, number, string][] = [
  ['węgiel', 820, '#57534e'],
  ['gaz ziemny', 490, '#a8a29e'],
  ['słońce (farmy)', 48, '#facc15'],
  ['atom', 12, '#38bdf8'],
  ['wiatr (ląd)', 11, '#2dd4bf'],
];
