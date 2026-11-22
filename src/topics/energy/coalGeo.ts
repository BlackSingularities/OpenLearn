/*
 * Elektrownia węglowa – geometria bez Reacta: plan terenu (kotłownia, maszynownia, chłodnia, komin, skład węgla,
 * oczyszczanie spalin, rozdzielnia), wymiary urządzeń i parametry pracy bloku.
 *
 * Wzór: nowoczesny blok na parametry nadkrytyczne o mocy ok. 900 MW, opalany węglem kamiennym (jak bloki
 * w Opolu czy Jaworznie). Jednostki: metry (scena w skali 0,25, jak elektrownia wiatrowa), oś y w górę.
 */
import { fbm, hash2, rng } from './windGeo';

export type V3 = [number, number, number];
export const DEG = Math.PI / 180;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
export const sm = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export { fbm, hash2, rng };

/** Scena w metrach, przeskalowana do wspólnego układu (jak elektrownia wiatrowa). */
export const FRAME = { position: [0, 0, 0] as V3, scale: 0.25 };

/* ================= parametry bloku ================= */

export const UNIT = {
  /** Moc elektryczna brutto (MW). */
  P: 900,
  /** Sprawność netto (część energii węgla zamieniona na prąd oddany do sieci). */
  eta: 0.455,
  /** Potrzeby własne (pompy, młyny, wentylatory) – część mocy brutto. */
  own: 0.06,
  /** Wartość opałowa węgla kamiennego (MJ/kg). */
  lhv: 22,
  /** Para świeża: temperatura (°C) i ciśnienie (MPa). */
  steamT: 600,
  steamP: 28.5,
  /** Para wtórnie przegrzana. */
  rhT: 620,
  rhP: 5.5,
  /** Skraplacz: ciśnienie (kPa) i temperatura (°C). */
  condP: 5,
  condT: 33,
  /** Przepływ pary świeżej przy pełnej mocy (t/h). */
  steamFlow: 2450,
  /** Obroty turbiny i generatora (obr/min) i częstotliwość sieci (Hz). */
  rpm: 3000,
  hz: 50,
  /** Emisja CO₂ (t na MWh prądu). */
  co2: 0.79,
};

/** Stan pracy przy obciążeniu k (0,4…1 mocy): przepływy na godzinę. */
export function load(k: number) {
  const P = UNIT.P * k;
  // przy niższym obciążeniu sprawność trochę spada
  const eta = UNIT.eta - 0.035 * (1 - k) * 1.6;
  const fuelMW = (P * (1 - UNIT.own)) / eta;
  const coal = (fuelMW / UNIT.lhv) * 3.6; // t/h
  return {
    P,
    eta,
    fuelMW,
    coal,
    steam: UNIT.steamFlow * (0.08 + 0.92 * k),
    co2: P * UNIT.co2,
    ash: coal * 0.14,
    gypsum: coal * 0.045,
    /** ciepło oddane w chłodni (MW) */
    cool: fuelMW * 0.47,
    /** woda odparowana w chłodni (m³/h) */
    evap: ((fuelMW * 0.47) / 2.26) * 3.6,
  };
}

/* ================= plan terenu ================= */

/** Kotłownia: obrys budynku (x, z) i wysokość dachu. */
export const BH = { x0: -30, x1: 30, z0: -28, z1: 28, h: 118 };
/** Bunkrownia z młynami – dobudówka kotłowni od strony −z. */
export const BUNK = { x0: -30, x1: 30, z0: -46, z1: -28, h: 72 };
/** Kocioł wieżowy: komora paleniskowa (przekrój kwadratowy) od leja na dole do wylotu spalin u góry. */
export const BOIL = { half: 11, y0: 4, hop: 14, y1: 104 };
/** Poziomy palników (narożne – kula ognia wiruje w środku komory). */
export const BURNER_Y = [22, 27, 32, 37];
/** Pęczki rur nad paleniskiem: [nazwa, dół, góra, kolor]. */
export const BANKS: [string, number, number, string][] = [
  ['przegrzewacz końcowy', 58, 66, '#d24a2c'],
  ['przegrzewacz wtórny', 68, 76, '#e07a2c'],
  ['przegrzewacz wstępny', 78, 86, '#d9963a'],
  ['podgrzewacz wody', 88, 98, '#4c86c8'],
];
/** Młyny węglowe (x) pod bunkrami. */
export const MILLS = [-22, -13, -4, 5, 14, 23];
export const MILL_Z = -37;

/** Maszynownia: obrys i wysokość; oś turbozespołu na wysokości AX. */
export const TH = { x0: -150, x1: -42, z0: -24, z1: 24, h: 46 };
export const AX = 15;
/** Turbozespół wzdłuż osi x: [nazwa, środek x, długość, promień obudowy]. */
export const TURB: { id: string; name: string; x: number; len: number; r: number; color: string }[] = [
  { id: 'hp', name: 'część wysokoprężna', x: -56, len: 8, r: 2.6, color: '#9aa4ae' },
  { id: 'ip', name: 'część średnioprężna', x: -69, len: 11, r: 3.4, color: '#9aa4ae' },
  { id: 'lp1', name: 'część niskoprężna 1', x: -86, len: 13, r: 5.2, color: '#9aa4ae' },
  { id: 'lp2', name: 'część niskoprężna 2', x: -103, len: 13, r: 5.2, color: '#9aa4ae' },
  { id: 'gen', name: 'generator', x: -123, len: 15, r: 3.1, color: '#2f62a3' },
  { id: 'exc', name: 'wzbudnica', x: -136, len: 5, r: 1.6, color: '#2f62a3' },
];
/** Odgazowywacz (zbiornik wody zasilającej) między maszynownią a kotłownią. */
export const DEAER: V3 = [-36, 34, 6];

/** Chłodnia kominowa: środek i profil (promień od wysokości). */
export const CT = { x: -95, z: -215, h: 180, rBase: 70, rThroat: 41, yThroat: 140, rTop: 44, yShell: 11 };
export function ctR(y: number) {
  const { rBase, rThroat, yThroat, rTop, h, yShell } = CT;
  if (y <= yThroat) {
    // hiperboloida: r² = a² + (b·Δy)²
    const dy = yThroat - y;
    const D = yThroat - yShell;
    const b2 = (rBase * rBase - rThroat * rThroat) / (D * D);
    return Math.sqrt(rThroat * rThroat + b2 * dy * dy);
  }
  const dy = y - yThroat;
  const D = h - yThroat;
  const b2 = (rTop * rTop - rThroat * rThroat) / (D * D);
  return Math.sqrt(rThroat * rThroat + b2 * dy * dy);
}

/** Droga spalin za kotłem: DeNOx, podgrzewacz powietrza, elektrofiltr, wentylator, odsiarczanie, komin. */
export const SCR: V3 = [44, 52, 0];
export const AH: V3 = [44, 24, 0];
export const ESP = { x0: 64, x1: 112, z0: -22, z1: 22, h: 30 };
export const FGD: V3 = [145, 0, 0];
export const FGD_R = 11;
export const FGD_H = 48;
export const STACK: V3 = [192, 0, 0];
export const STACK_H = 180;

/** Skład węgla: zwały wzdłuż osi x, zwałowarka na torze między nimi, rozładunek wagonów i tor kolejowy. */
export const YARD = { x0: 130, x1: 360, z0: 70, z1: 205 };
export const PILES: { z: number; w: number; h: number }[] = [
  { z: 98, w: 42, h: 14 },
  { z: 176, w: 42, h: 16 },
];
export const STACKER_Z = 137;
export const RAIL_Z = 232;
export const UNLOAD: V3 = [150, 0, RAIL_Z];
/** Kruszarnia – stąd taśmociąg biegnie skośną galerią do bunkrowni. */
export const CRUSH: V3 = [100, 0, 70];

/** Transformatory blokowe i rozdzielnia 400 kV. */
export const TRAFO: V3 = [-160, 0, 34];
export const SWYARD = { x0: -290, x1: -200, z0: -60, z1: 70 };
/** Słupy linii 400 kV (od rozdzielni na zachód). */
export const PYLONS: V3[] = [-330, -470, -610, -750, -890].map((x, i) => [x, 0, -10 + i * 25] as V3);

/** Rzeka (woda uzupełniająca dla chłodni) – pas wzdłuż osi x. */
export const RIVER_Z = -470;
export const RIVER_W = 46;

/** Teren wokół: płaski w obrębie elektrowni, łagodne pagórki dalej. */
export function groundH(x: number, z: number) {
  const r = Math.hypot(x + 20, z);
  const hills = (fbm(x / 600 + 1.3, z / 600 - 2.1) - 0.5) * 30;
  return hills * sm(560, 1300, r) - (Math.abs(z - RIVER_Z) < RIVER_W / 2 + 10 ? 2 * sm(RIVER_W / 2 + 10, RIVER_W / 2 - 4, Math.abs(z - RIVER_Z)) : 0);
}

/** Obszar elektrowni (beton, drogi) – bez drzew. */
export const inPlant = (x: number, z: number) => x > -320 && x < 380 && z > -300 && z < 260;

/* ================= drogi przepływów (do kulek w ruchu) ================= */

/** Para świeża: z wylotu przegrzewacza na dachu kotła przez estakadę do części wysokoprężnej. */
export const P_STEAM: V3[] = [
  [-6, 106, 4],
  [-6, 112, 4],
  [-36, 112, 4],
  [-36, 30, 4],
  [-50, 22, 4],
  [-56, AX + 2.6, 0],
];
/** Para wtórna: z wylotu części WP z powrotem do kotła i do części SP. */
export const P_REHEAT_COLD: V3[] = [
  [-56, AX + 2.6, -2],
  [-50, 24, -6],
  [-38, 26, -6],
  [-38, 108, -6],
  [-8, 108, -6],
  [-8, 80, -6],
];
export const P_REHEAT_HOT: V3[] = [
  [6, 80, -6],
  [6, 110, -6],
  [-40, 110, -8],
  [-40, 28, -8],
  [-62, 24, -6],
  [-69, AX + 3.4, -2],
];
/** Przelotnia: para z części SP do dwóch części NP. */
export const P_CROSS: V3[] = [
  [-72, AX + 3.4, 0],
  [-72, AX + 9, 0],
  [-86, AX + 9, 0],
  [-86, AX + 5.2, 0],
  [-86, AX + 9, 0],
  [-103, AX + 9, 0],
  [-103, AX + 5.2, 0],
];
/** Skropliny i woda zasilająca: ze skraplacza przez pompy do odgazowywacza, potem do kotła. */
export const P_FEED: V3[] = [
  [-94, 3, 10],
  [-76, 3, 14],
  [-50, 3, 14],
  [-40, 14, 10],
  [DEAER[0], DEAER[1], DEAER[2]],
  [-34, 8, 14],
  [-16, 4, 14],
  [-8, 2, 8],
  [0, 3, 0],
];
/** Woda chłodząca: ze skraplacza do chłodni i z powrotem (rurociągi przy ziemi). */
export const P_COOL_OUT: V3[] = [
  [-90, 2, -10],
  [-90, 2, -60],
  [-95, 2, -140],
  [-95, 8, -150],
  [-95, 13, -175],
];
export const P_COOL_IN: V3[] = [
  [-80, 1, -160],
  [-80, 1, -140],
  [-84, 1, -60],
  [-84, 2, -10],
];
/** Spaliny: z góry kotła przez DeNOx, podgrzewacz powietrza, elektrofiltr, odsiarczanie do komina. */
export const P_FLUE: V3[] = [
  [0, 104, 0],
  [0, 116, 0],
  [36, 116, 0],
  [44, 104, 0],
  [SCR[0], SCR[1], 0],
  [AH[0], AH[1], 0],
  [ESP.x0, 16, 0],
  [ESP.x1, 16, 0],
  [124, 10, 0],
  [FGD[0], 10, 0],
  [FGD[0], FGD_H - 4, 0],
  [STACK[0] - 18, FGD_H - 4, 0],
  [STACK[0], 30, 0],
  [STACK[0], STACK_H, 0],
];
/** Węgiel: z wagonów przez rozładunek, skład i kruszarnię skośną galerią do bunkrów nad młynami. */
export const P_COAL: V3[] = [
  [UNLOAD[0], 3, RAIL_Z - 4],
  [UNLOAD[0], 3, YARD.z1 + 6],
  [UNLOAD[0], 3, STACKER_Z],
  [CRUSH[0] + 6, 3, STACKER_Z],
  [CRUSH[0], 10, CRUSH[2]],
  [CRUSH[0], 22, CRUSH[2]],
  [40, 74, BUNK.z0 + 6],
  [-24, 74, BUNK.z0 + 6],
];
/** Prąd: z generatora do transformatora blokowego, do rozdzielni i linią 400 kV. */
export const P_POWER: V3[] = [
  [-130, AX, 10],
  [-150, 8, 24],
  [TRAFO[0], 10, TRAFO[2]],
  [-190, 22, 34],
  [SWYARD.x0 + 20, 22, 20],
  [PYLONS[0][0], 46, PYLONS[0][2]],
  [PYLONS[1][0], 46, PYLONS[1][2]],
  [PYLONS[2][0], 46, PYLONS[2][2]],
  [PYLONS[3][0], 46, PYLONS[3][2]],
  [PYLONS[4][0], 46, PYLONS[4][2]],
];

/** Dobowe zapotrzebowanie na moc w kraju (zima, dzień roboczy): godzina → część szczytu. */
export function demandAt(h: number) {
  const morning = Math.exp(-(((h - 8.5) / 2.6) ** 2)) * 0.22;
  const evening = Math.exp(-(((h - 18.5) / 2.2) ** 2)) * 0.3;
  const night = 0.62 + 0.06 * Math.cos(((h - 3) / 24) * Math.PI * 2);
  return Math.min(1, night + morning + evening);
}
/** Produkcja słoneczna (część mocy zainstalowanej) – zimą krótko i słabo. */
export const solarAt = (h: number) => Math.max(0, Math.sin(((h - 7.5) / 9) * Math.PI)) * 0.35;

/** Udział węgla (kamiennego i brunatnego) w produkcji prądu w Polsce, w procentach. */
export const COAL_SHARE: [number, number][] = [
  [1990, 97],
  [1995, 96],
  [2000, 95],
  [2005, 92],
  [2010, 88],
  [2015, 81],
  [2018, 78],
  [2020, 70],
  [2022, 70],
  [2023, 61],
  [2024, 57],
];

/** Powietrze do spalania: wentylator przy ziemi → podgrzewacz powietrza → skrzynie powietrza przy palnikach. */
export const P_AIR: V3[] = [
  [62, 2, 26],
  [52, 4, 18],
  [AH[0] + 2, AH[1] - 10, 7],
  [AH[0] + 2, AH[1] + 5, 7],
  [30, 30, -4],
  [BOIL.half + 1.6, 30, -4],
];
/** Pył węglowy: z odsiewacza młyna przez pyłoprzewód do palnika na ścianie kotła. */
export const pfPath = (x: number): V3[] => [
  [x, 12.5, MILL_Z],
  [x, 16, MILL_Z + 6],
  [x * 0.5, 22 + ((x + 22) / 45) * 15, -BOIL.half - 1.4],
];
/** Popiół lotny: z lejów elektrofiltru rurociągiem do silosów. */
export const P_ASH: V3[] = [
  [ESP.x0 + 18, 1.5, -11],
  [ESP.x0 + 18, 1.5, -30],
  [109, 1.5, -40],
  [109, 26, -48],
];
/** Gips: z dołu absorbera taśmą do magazynu. */
export const P_GYPS: V3[] = [
  [FGD[0] + 8, 2, 9],
  [FGD[0] + 10, 2, 28],
  [FGD[0] + 14, 8, 40],
];
