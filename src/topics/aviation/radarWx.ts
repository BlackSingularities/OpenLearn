/*
 * Pogoda dla radaru pogodowego: komórki opadów (chmury burzowe, deszcz, mikroburst) i to, co z nich „widzi” radar.
 * Jedno źródło dla ekranu ND, profilu pionowego (VD) i miniatury burzy w scenie 3D – wszystko zgadza się ze sobą.
 *
 * Układ świata: mile morskie (NM), X – w prawo od początkowego kursu, Y – do przodu (początkowy kurs), wysokość h
 * w stopach nad poziomem morza (teren płaski, 0 ft). Odbiciowość w dBZ – jak w meteorologii: im większe i liczniejsze
 * krople, tym silniejsze echo. Wartości i kształty są przybliżone, ale proporcje (wysokość burz, poziom zamarzania,
 * szerokość wiązki) odpowiadają rzeczywistości.
 */

/** Komórka opadów: środek (NM), promień rdzenia (NM), szczytowa odbiciowość (dBZ), wierzchołek (ft). */
export type WxCell = {
  x: number;
  y: number;
  r: number;
  peak: number;
  top: number;
  /** Turbulencja w rdzeniu (silne prądy pionowe – radar dopplerowski widzi rozrzut prędkości kropel). */
  turb?: boolean;
  /** Grad: mokry grad odbija mocno także powyżej poziomu zamarzania. */
  hail?: boolean;
  /** Mikroburst – gwałtowny prąd zstępujący przy ziemi (uskok wiatru). */
  ws?: boolean;
  /** Ziarno szumu – każda komórka ma inny, „poszarpany” brzeg. */
  seed: number;
};

/** Poziom zamarzania (ft): poniżej krople wody (silne echo), powyżej lód i śnieg (echo kilka razy słabsze). */
export const FZL = 16000;
/** Połowa szerokości wiązki (°) – antena ok. 76 cm, fala 3,2 cm (pasmo X, ok. 9,3 GHz): wiązka ok. 3,5°. */
export const BEAM_HALF = 1.75;
/** Stopy na milę morską. */
export const FT_NM = 6076;
/** Okno wysokości trybu AUTO (ft): echo na drodze samolotu – pełne kolory, poniżej – kreskowane. */
export const PATH_BAND = 4000;

/* ======================= szum (poszarpane brzegi chmur) ======================= */

const hash = (i: number, j: number) => {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
function vnoise(x: number, y: number) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j);
  const b = hash(i + 1, j);
  const c = hash(i, j + 1);
  const d = hash(i + 1, j + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** Szum fraktalny −1…1. */
export function fbm(x: number, y: number) {
  return (vnoise(x, y) * 0.55 + vnoise(x * 2.13 + 5.2, y * 2.13 + 3.1) * 0.3 + vnoise(x * 4.37 + 11.7, y * 4.37 + 7.3) * 0.15) * 2 - 1;
}

/* ======================= odbiciowość ======================= */

/** Odbiciowość jednej komórki w punkcie (dBZ, −99 – brak echa) i jej „odległość” od środka (d² w promieniach). */
export function cellDbz(c: WxCell, X: number, Y: number, h: number) {
  const n = fbm(X * 0.42 + c.seed, Y * 0.42 - c.seed);
  const d2 = (((X - c.x) ** 2 + (Y - c.y) ** 2) / (c.r * c.r)) * (1 + 0.45 * n);
  if (d2 > 4.5 || h > c.top + 800) return { v: -99, d2 };
  let v = c.peak - 22 * d2 + 5 * n;
  // wierzchołek: echo szybko zanika
  if (h > c.top) v -= (h - c.top) / 40;
  // powyżej poziomu zamarzania lód odbija słabiej (grad – mniej)
  if (h > FZL) {
    const k = Math.min(1, (h - FZL) / Math.max(2000, c.top - FZL));
    v -= c.hail ? 2 + 6 * k ** 1.6 : 4 + 11 * k ** 1.6;
  }
  return { v, d2 };
}
/** Najsilniejsze echo wszystkich komórek w punkcie: dBZ, indeks komórki. */
export function fieldDbz(cells: WxCell[], X: number, Y: number, h: number) {
  let v = -99;
  let ci = -1;
  let d2 = 9;
  cells.forEach((c, i) => {
    const r = cellDbz(c, X, Y, h);
    if (r.v > v) {
      v = r.v;
      ci = i;
      d2 = r.d2;
    }
  });
  return { v, ci, d2 };
}

/** Kolor echa na ND (jak w Airbusie): zielony, żółty, czerwony, magenta. null – brak echa (< 20 dBZ). */
export const WX_LEVELS = [
  { min: 50, color: [255, 79, 216], css: '#ff4fd8', name: 'magenta', rain: 'ponad 50 mm/h – ulewa z gradem' },
  { min: 40, color: [255, 42, 31], css: '#ff2a1f', name: 'czerwony', rain: '12–50 mm/h – bardzo silny opad' },
  { min: 30, color: [243, 226, 58], css: '#f3e23a', name: 'żółty', rain: '4–12 mm/h – silny opad' },
  { min: 20, color: [25, 195, 58], css: '#19c33a', name: 'zielony', rain: '1–4 mm/h – umiarkowany opad' },
] as const;
export function levelOf(dbz: number) {
  return WX_LEVELS.find((l) => dbz >= l.min) ?? null;
}

/** Położenie samolotu w świecie: X, Y (NM), kurs względem początkowego (°, w prawo dodatni), wysokość (ft). */
export type AcState = { X: number; Y: number; hdg: number; alt: number };
/** Punkt w odległości R (NM) i pod kątem az (°, w prawo dodatni) od samolotu – w układzie świata. */
export function worldAt(ac: AcState, R: number, az: number): [number, number] {
  const a = ((ac.hdg + az) * Math.PI) / 180;
  return [ac.X + R * Math.sin(a), ac.Y + R * Math.cos(a)];
}
/** Wysokość środka wiązki (ft) w odległości R przy pochyleniu anteny tilt (°) – z krzywizną Ziemi (ok. 0,66·R² ft). */
export const beamCenter = (alt: number, R: number, tilt: number) => alt + R * FT_NM * Math.tan((tilt * Math.PI) / 180) - 0.66 * R * R;
/** Połowa grubości wiązki w odległości R (ft). */
export const beamHalf = (R: number) => R * FT_NM * Math.tan((BEAM_HALF * Math.PI) / 180);

/** Ustawienia radaru dla jednego „spojrzenia”. */
export type RadarOpts = {
  cells: WxCell[];
  /** AUTO – nowoczesny radar z pamięcią 3D: echo w oknie ±4000 ft wokół drogi samolotu, bez odbić od ziemi. */
  auto: boolean;
  /** Pochylenie anteny w trybie ręcznym (°). */
  tilt: number;
  /** Tłumienie odbić od ziemi (w trybie ręcznym). */
  gcs: boolean;
  /** Tryb WX+T: turbulencje (magenta) do 40 NM. */
  turb: boolean;
};
/** Wynik próbki: dBZ, czy to echo „pod drogą” (kreskowane), czy turbulencja, czy odbicie od ziemi, wysokość echa. */
export type Echo = { v: number; below: boolean; turb: boolean; ground: boolean; h: number };

/** Co widzi radar w odległości R i pod kątem az. */
export function sampleRadar(o: RadarOpts, ac: AcState, R: number, az: number): Echo {
  const [X, Y] = worldAt(ac, R, az);
  const out: Echo = { v: -99, below: false, turb: false, ground: false, h: 0 };
  let ci = -1;
  let d2 = 9;
  if (o.auto) {
    // okno wokół drogi samolotu (z uwzględnieniem krzywizny – radar „pamięta” całą objętość, nie jedną wiązkę)
    for (let k = -2; k <= 2; k++) {
      const h = ac.alt + (k * PATH_BAND) / 2;
      if (h < 0) continue;
      const r = fieldDbz(o.cells, X, Y, h);
      if (r.v > out.v) Object.assign(out, { v: r.v, h }), (ci = r.ci), (d2 = r.d2);
    }
    if (out.v < 20) {
      // echo poniżej drogi (np. niższe chmury) – pokazane kreskowaniem
      for (const f of [0.2, 0.45, 0.7]) {
        const h = (ac.alt - PATH_BAND) * f;
        if (h < 500) continue;
        const r = fieldDbz(o.cells, X, Y, h);
        if (r.v >= 20 && r.v > out.v) Object.assign(out, { v: r.v, below: true, h }), (ci = r.ci), (d2 = r.d2);
      }
    }
  } else {
    // tryb ręczny: jedna wiązka o szerokości ok. 3,5° – widzi tylko to, co przecina
    const hc = beamCenter(ac.alt, R, o.tilt);
    const hw = beamHalf(R);
    for (let k = -2; k <= 2; k++) {
      const h = hc + (k * hw) / 2;
      if (h < 0) continue;
      const r = fieldDbz(o.cells, X, Y, h);
      if (r.v > out.v) Object.assign(out, { v: r.v, h }), (ci = r.ci), (d2 = r.d2);
    }
    // wiązka zahacza o ziemię: odbicia od terenu (miasta, góry, brzegi – nierówne plamy)
    const low = hc - hw;
    if (low < 0) {
      const f = Math.min(1, -low / (2 * hw));
      const g = 26 + 20 * fbm(X * 0.9 + 40, Y * 0.9 - 17) - (1 - f) * 14 - (o.gcs ? 30 : 0);
      if (g > out.v) Object.assign(out, { v: g, ground: true, h: 0 });
    }
  }
  if (o.turb && R <= 40 && ci >= 0 && o.cells[ci].turb && out.v >= 20 && !out.ground && d2 < 0.75) out.turb = true;
  return out;
}

/* ======================= scenariusze ======================= */

/** Gdzie jest burza – scenariusze zakładek. */
export type Scenario = 'line' | 'cb' | 'rain' | 'squall' | 'avoid' | 'pws';
export function scenarioCells(s: Scenario): WxCell[] {
  switch (s) {
    case 'cb':
      // pojedynczy cumulonimbus z gradem: rdzeń do ok. 45 000 ft
      return [
        { x: -2, y: 30, r: 6.5, peak: 58, top: 45000, hail: true, turb: true, seed: 1.3 },
        { x: 5, y: 37, r: 3, peak: 38, top: 30000, seed: 7.1 },
      ];
    case 'rain':
      // rozległy deszcz warstwowy: słabe echo, niskie chmury (Nimbostratus)
      return [
        { x: 0, y: 32, r: 15, peak: 34, top: 18000, seed: 2.2 },
        { x: -12, y: 20, r: 8, peak: 29, top: 15000, seed: 9.4 },
        { x: 14, y: 44, r: 7, peak: 31, top: 16000, seed: 4.8 },
      ];
    case 'squall':
      // linia szkwału: komórki w rzędzie, w poprzek trasy
      return [-30, -18, -7, 4, 15, 27].map((x, i) => ({ x, y: 34 + (i % 2) * 4, r: 4 + (i % 3), peak: 44 + ((i * 5) % 12), top: 36000 + ((i * 3000) % 9000), hail: i % 2 === 0, turb: i % 2 === 0, seed: 3 + i * 1.7 }));
    case 'avoid':
      // duża burza na trasie i mniejsze komórki z prawej (wiatr wieje z lewej – kowadło znosi w prawo)
      return [
        { x: 0, y: 45, r: 6, peak: 56, top: 43000, hail: true, turb: true, seed: 5.5 },
        { x: 9, y: 52, r: 4, peak: 42, top: 34000, turb: true, seed: 8.2 },
        { x: 15, y: 66, r: 3, peak: 37, top: 30000, seed: 1.9 },
      ];
    case 'pws':
      // mikroburst przy podejściu: zwarta, silna komórka nad ścieżką i rozmyty deszcz wokół
      return [
        { x: 0, y: 4.2, r: 0.75, peak: 49, top: 20000, ws: true, seed: 6.6 },
        { x: 0.5, y: 4.7, r: 1.7, peak: 31, top: 18000, seed: 2.9 },
      ];
    default:
      // kilka komórek przed samolotem: silna burza z lewej, słabsze z prawej, niższe chmury pod drogą
      return [
        { x: -12, y: 28, r: 7, peak: 56, top: 44000, turb: true, hail: true, seed: 1.1 },
        { x: 8, y: 38, r: 5.5, peak: 49, top: 41000, turb: true, seed: 4.4 },
        { x: 19, y: 20, r: 4, peak: 40, top: 26000, seed: 7.7 },
        { x: -2, y: 58, r: 8, peak: 50, top: 42000, turb: true, seed: 2.5 },
        { x: -27, y: 47, r: 5, peak: 38, top: 23000, seed: 9.9 },
        { x: 24, y: 55, r: 6, peak: 43, top: 38000, seed: 6.2 },
        { x: -6, y: 12, r: 3, peak: 31, top: 15000, seed: 8.8 },
      ];
  }
}
