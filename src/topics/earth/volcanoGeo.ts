/*
 * Wulkan – geometria bez Reacta: kształty dziesięciu rodzajów wulkanów (wysokość terenu w punkcie), budowa
 * geologiczna w przekroju (kolor skały w punkcie płaszczyzny z = 0) i kanały magmy (komora, komin, żyły).
 *
 * Jednostki: 1 jednostka w poziomie ≈ 100 m. W pionie wulkany są wyższe niż w naturze (ok. 2–3 razy) –
 * jak na rysunkach w podręcznikach, żeby było widać kształt. Prawdziwe liczby podajemy w tekstach.
 */

export type VType = 'strato' | 'shield' | 'cinder' | 'dome' | 'caldera' | 'super' | 'fissure' | 'maar' | 'sub' | 'tuya';
export type RGB = [number, number, number];

/* ================= szum ================= */

function hash(i: number, j: number) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
/** Szum wartości 0…1, gładki. */
export function vnoise(x: number, z: number) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j);
  const b = hash(i + 1, j);
  const c = hash(i, j + 1);
  const d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Szum fraktalny −1…1. */
export function fbm(x: number, z: number, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    s += a * (vnoise(x * f + o * 17.3, z * f - o * 9.1) * 2 - 1);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const sm = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const hex = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const mixC = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/* ================= kształty ================= */

/** Poziom terenu wokół wulkanu (dno morza dla wulkanu podmorskiego). */
export const baseLevel = (t: VType) => (t === 'sub' ? -28 : 0);
/** Poziom morza / jezior. */
export const SEA = 0;
/** Najniższy punkt przekroju. */
export const DEPTH = -50;
/** Promień terenu modelowanego (dalej – płaska równina). */
export const R_TERRAIN = 120;

const strCore = (r: number) => 24 * Math.pow(Math.max(0, 1 - r / 48), 1.85);
const STR_RC = 2.8;
/** Stożek pasożytniczy stratowulkanu (na zboczu, tuż za płaszczyzną przekroju). */
export const PARASITE: [number, number] = [16.5, -2.5];
const calCore = (r: number) => 22 * Math.pow(Math.max(0, 1 - r / 54), 1.8);
export const CAL_R = 17;
/** Młody stożek w jeziorze kaldery (jak Wizard Island w Crater Lake). */
export const CAL_CONE: [number, number] = [5, -1];
const cone = (dx: number, dz: number, h: number, r: number) => h * Math.max(0, 1 - Math.hypot(dx, dz) / r) ** 1.4;
/** Stożki rozprysku wzdłuż szczeliny (szczelina biegnie wzdłuż osi z). */
export const FISSURE_CONES = [-24, -11, 2, 15];
export const FISSURE_L = 34;

/** Wysokość skały (bez lodu i wody) w punkcie (x, z) dla danego rodzaju wulkanu. */
export function rockH(t: VType, x: number, z: number): number {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const plain = 0.9 * fbm(x * 0.025 + 3, z * 0.025 - 7) * sm(30, 70, r) + 0.18 * fbm(x * 0.15, z * 0.15);
  switch (t) {
    case 'strato': {
      const rim = strCore(STR_RC);
      let h = r < STR_RC ? rim - 3.4 * (1 - (r / STR_RC) ** 2) : strCore(r);
      // żleby i grzbiety na zboczach, wyraźniejsze w połowie wysokości
      const core = strCore(r);
      h += core * 0.05 * Math.sin(th * 13 + 2.2 * fbm(x * 0.05, z * 0.05)) * sm(4, 14, r);
      h += 0.55 * fbm(x * 0.09, z * 0.09) * sm(2, 10, r);
      h += cone(x - PARASITE[0], z - PARASITE[1], 4.2, 4.5);
      // kraterek na szczycie stożka pasożytniczego
      const dp = Math.hypot(x - PARASITE[0], z - PARASITE[1]);
      if (dp < 1.1) h -= 0.9 * (1 - (dp / 1.1) ** 2);
      return h + plain;
    }
    case 'shield': {
      const core = 12 * Math.pow(Math.max(0, 1 - Math.pow(r / 96, 1.4)), 1.25);
      // kaldera szczytowa z płaskim dnem i stromymi ścianami
      let h = core - 1.7 * (1 - sm(6.2, 7.6, r));
      // strefy ryftowe – dwa łagodne grzbiety rozchodzące się od szczytu
      for (const a of [-0.55, 2.35]) {
        const along = x * Math.cos(a) + z * Math.sin(a);
        const perp = -x * Math.sin(a) + z * Math.cos(a);
        if (along > 0) h += 0.9 * Math.exp(-((perp / 3) ** 2)) * sm(8, 16, along) * sm(80, 40, along);
      }
      // krater – zapadlisko na zboczu
      const dp = Math.hypot(x + 18, z + 10);
      if (dp < 3.2) h -= 1.4 * (1 - (dp / 3.2) ** 2);
      h += 0.3 * fbm(x * 0.07, z * 0.07);
      return h + plain * 0.6;
    }
    case 'cinder': {
      const rt = 2.9;
      const rb = 12;
      // nachylenie ok. 33° – stała, prosta linia zbocza
      let h = r < rt ? 7.5 : 7.5 * clamp((rb - r) / (rb - rt)) ** 1.05;
      if (r < rt + 0.4) h -= 3.4 * Math.max(0, 1 - (r / (rt + 0.4)) ** 2);
      h += 0.12 * fbm(x * 0.6, z * 0.6) * sm(3, 6, r);
      return h + plain;
    }
    case 'dome': {
      let h = 6 * Math.pow(Math.max(0, 1 - (r / 8) ** 2), 0.5);
      h += 1.3 * sm(14, 7, r); // piarg u podnóża
      h += 0.65 * fbm(x * 0.45, z * 0.45) * sm(9, 3, r);
      // iglica – zastygły czop lawy wyciśnięty ponad kopułę
      h += 2.4 * Math.exp(-(((x - 1.2) / 1) ** 2) - ((z + 0.8) / 1.2) ** 2);
      return h + plain;
    }
    case 'caldera': {
      const floor = 1.2;
      let h = mix(floor, calCore(r), sm(CAL_R - 1.2, CAL_R + 1.6, r));
      h += calCore(r) * 0.04 * Math.sin(th * 11 + 2 * fbm(x * 0.05, z * 0.05)) * sm(CAL_R + 2, CAL_R + 10, r);
      h += cone(x - CAL_CONE[0], z - CAL_CONE[1], 8.2, 4.2);
      const dc = Math.hypot(x - CAL_CONE[0], z - CAL_CONE[1]);
      if (dc < 0.9) h -= 0.8 * (1 - (dc / 0.9) ** 2);
      h += 0.4 * fbm(x * 0.08, z * 0.08) * sm(CAL_R, CAL_R + 6, r);
      return h + plain;
    }
    case 'super': {
      const e = Math.hypot(x / 58, z / 40);
      let h = 3.6 * sm(110, 80, r) - 2.3 * (1 - sm(0.92, 1.06, e));
      h += 1.6 * Math.exp(-(((x + 22) / 9) ** 2) - ((z + 12) / 7) ** 2);
      h += 1.4 * Math.exp(-(((x - 20) / 8) ** 2) - ((z - 6) / 6) ** 2);
      h += 0.35 * fbm(x * 0.06, z * 0.06);
      return h + plain * 0.5;
    }
    case 'fissure': {
      const along = sm(FISSURE_L, FISSURE_L - 6, Math.abs(z));
      let h = 1.2 + 0.25 * fbm(x * 0.05, z * 0.05);
      h += 1.6 * Math.exp(-((x / 1.7) ** 2)) * along;
      h -= 1.1 * Math.exp(-((x / 0.45) ** 2)) * along;
      for (const zc of FISSURE_CONES) {
        const d = Math.hypot(x, z - zc);
        h += 2.4 * Math.exp(-(d * d) / 6);
        if (d < 0.9) h -= 1.2 * (1 - (d / 0.9) ** 2);
      }
      return h + plain * 0.4;
    }
    case 'maar': {
      let h = 0.6 + 2.6 * Math.exp(-(((r - 11) / 3.2) ** 2));
      if (r < 10.5) h -= 5.6 * Math.pow(1 - (r / 10.5) ** 2, 0.7);
      h += 0.2 * fbm(x * 0.1, z * 0.1);
      return h + plain;
    }
    case 'sub': {
      let h = -28 + 35 * Math.pow(Math.max(0, 1 - r / 56), 1.45);
      if (r < 3.6) h -= 2.6 * (1 - (r / 3.6) ** 2);
      h += 0.5 * fbm(x * 0.07, z * 0.07);
      return h + plain * 0.5;
    }
    case 'tuya': {
      // góra stołowa: strome boki z hialoklastytu i płaska pokrywa lawy, na szczycie mały stożek
      let h = 15 * sm(23, 16.5, r) + 2.4 * Math.exp(-((r / 4.5) ** 2));
      h += 0.35 * fbm(x * 0.12, z * 0.12) * sm(2, 15, r);
      return h + plain;
    }
  }
}

/** Powierzchnia lodu (wulkan pod lodowcem); −∞ – brak lodu. `melt` – kocioł wytopiony w lodzie nad otworem. */
export function iceH(t: VType, x: number, z: number, melt = 0): number {
  if (t !== 'tuya') return -Infinity;
  const r = Math.hypot(x, z);
  if (r > 66) return -Infinity;
  return 20.5 * Math.sqrt(1 - (r / 66) ** 2) - 7 * melt * Math.exp(-((r / 9) ** 2)) + 0.25 * fbm(x * 0.08, z * 0.08);
}

/** Jeziora i morze: [x, z, promień, poziom]. */
export function lakesOf(t: VType): { x: number; z: number; r: number; y: number }[] {
  if (t === 'caldera') return [{ x: 0, z: 0, r: CAL_R + 0.5, y: 5 }];
  if (t === 'maar') return [{ x: 0, z: 0, r: 9.6, y: -2.6 }];
  if (t === 'super') return [{ x: 30, z: -16, r: 10, y: 1.55 }];
  return [];
}
export const hasSea = (t: VType) => t === 'sub';

/** Poziom wody w punkcie (−∞ – sucho). */
export function waterH(t: VType, x: number, z: number): number {
  if (hasSea(t)) return SEA;
  for (const l of lakesOf(t)) if (Math.hypot(x - l.x, z - l.z) < l.r) return l.y;
  return -Infinity;
}

/* ================= kanały magmy ================= */

export interface Plumbing {
  /** Komora magmowa (elipsa w przekroju). */
  chamber: { cx: number; cy: number; ax: number; ay: number };
  /** Komin: od komory (y0) do dna krateru (y1), oś x, połowa szerokości w. */
  conduit: { x: number; w: number; y0: number; y1: number };
  /** Dawne żyły (dajki) i sille: odcinki [x0, y0, x1, y1, połowa grubości]. */
  dikes: [number, number, number, number, number][];
  sills: [number, number, number, number, number][];
  /** Otwory erupcyjne w 3D (dno krateru). */
  vents: [number, number, number][];
}

export function plumbingOf(t: VType): Plumbing {
  const top = (x: number, z: number) => rockH(t, x, z);
  switch (t) {
    case 'strato':
      return {
        chamber: { cx: 0, cy: -24, ax: 9.5, ay: 5 },
        conduit: { x: 0, w: 0.85, y0: -19.5, y1: top(0, 0) },
        dikes: [[5, -20, PARASITE[0], top(PARASITE[0], 0) - 0.5, 0.35]],
        sills: [[-15, -7, -4, -6.2, 0.45]],
        vents: [[0, top(0, 0), 0]],
      };
    case 'shield':
      return {
        chamber: { cx: 0, cy: -12, ax: 15, ay: 3.6 },
        conduit: { x: 0, w: 1.0, y0: -8.6, y1: top(0, 0) },
        dikes: [[3, -9, 26, top(26, 0) - 0.3, 0.3], [-4, -9, -30, top(-30, 0) - 0.3, 0.3]],
        sills: [],
        vents: [[0, top(0, 0), 0]],
      };
    case 'cinder':
      return {
        chamber: { cx: 0, cy: -42, ax: 7, ay: 3 },
        conduit: { x: 0, w: 0.55, y0: -39, y1: top(0, 0) },
        dikes: [],
        sills: [],
        vents: [[0, top(0, 0), 0]],
      };
    case 'dome':
      return {
        chamber: { cx: 0, cy: -22, ax: 7, ay: 4 },
        conduit: { x: 0, w: 1.1, y0: -18, y1: 3.5 },
        dikes: [],
        sills: [],
        vents: [[0, top(0, 0), 0]],
      };
    case 'caldera':
      return {
        chamber: { cx: 0, cy: -16, ax: 14, ay: 4.5 },
        conduit: { x: CAL_CONE[0], w: 0.6, y0: -11.5, y1: top(CAL_CONE[0], 0) - 0.4 },
        dikes: [],
        sills: [[-13, -4, -6, -3.6, 0.35]],
        vents: [[CAL_CONE[0], top(CAL_CONE[0], CAL_CONE[1]), CAL_CONE[1]]],
      };
    case 'super':
      return {
        chamber: { cx: 0, cy: -20, ax: 50, ay: 6.5 },
        conduit: { x: 0, w: 0, y0: -14, y1: -14 },
        dikes: [],
        sills: [],
        vents: [[0, top(0, 0), 0]],
      };
    case 'fissure':
      return {
        chamber: { cx: 0, cy: -34, ax: 18, ay: 4 },
        conduit: { x: 0, w: 0.45, y0: -30, y1: top(0, 2) },
        dikes: [[-9, -32, -9.5, 0.4, 0.25], [11, -32, 12, 0.6, 0.25]],
        sills: [],
        vents: FISSURE_CONES.map((zc) => [0, top(0, zc), zc] as [number, number, number]),
      };
    case 'maar':
      return {
        chamber: { cx: 0, cy: -44, ax: 6, ay: 2.5 },
        conduit: { x: 0, w: 0.45, y0: -41.5, y1: -30 },
        dikes: [],
        sills: [],
        vents: [[0, top(0, 0), 0]],
      };
    case 'sub':
      return {
        chamber: { cx: 0, cy: -44, ax: 9, ay: 3.5 },
        conduit: { x: 0, w: 0.8, y0: -40.5, y1: top(0, 0) },
        dikes: [],
        sills: [],
        vents: [[0, top(0, 0), 0]],
      };
    case 'tuya':
      return {
        chamber: { cx: 0, cy: -24, ax: 8, ay: 4 },
        conduit: { x: 0, w: 0.8, y0: -20, y1: top(0, 0) },
        dikes: [],
        sills: [],
        vents: [[0, top(0, 0), 0]],
      };
  }
}

/* ================= kolory ================= */

const C = {
  grass: hex('#6b7a3c'),
  grass2: hex('#8a8c4c'),
  forest: hex('#3f5a33'),
  soil: hex('#7d6b58'),
  rock: hex('#8a8580'),
  snow: hex('#f2f5f8'),
  crater: hex('#5b3a30'),
  sulfur: hex('#d9c443'),
  basalt: hex('#353437'),
  basaltOld: hex('#5e5049'),
  scoria: hex('#3e2a26'),
  dacite: hex('#8e8580'),
  ice: hex('#e9f3f9'),
  iceBlue: hex('#b9d8ec'),
  sea: hex('#3a4a58'),
  sand: hex('#2f2b2b'),
  moss: hex('#6f7d52'),
  spatter: hex('#6a2e22'),
  water: hex('#3d7fbf'),
  magma: hex('#ff8a1f'),
  magmaHot: hex('#ffd04a'),
  magmaEdge: hex('#d9480f'),
  hotRock: hex('#8a3a1a'),
  plug: hex('#4a2a22'),
  intrusion: hex('#5b2d24'),
};

/** Kolor powierzchni terenu. */
export function surfColor(t: VType, x: number, z: number, y: number, slope: number, rock: number, ice: number): RGB {
  const r = Math.hypot(x, z);
  const n = fbm(x * 0.07 + 11, z * 0.07 - 5);
  const n2 = vnoise(x * 0.9, z * 0.9);
  const lawn = mixC(C.grass, C.grass2, sm(-0.3, 0.4, n));
  let c: RGB = lawn;
  const steep = sm(0.55, 1.1, slope);
  switch (t) {
    case 'strato': {
      c = mixC(lawn, C.forest, sm(0.1, 0.5, n) * (1 - sm(4, 9, y)));
      c = mixC(c, C.soil, sm(3, 9, y + 2 * n));
      c = mixC(c, C.rock, sm(10, 16, y + 2 * n));
      c = mixC(c, C.snow, sm(17.2, 18.6, y + 2.5 * n + 0.8 * Math.sin(Math.atan2(z, x) * 13)));
      if (r < STR_RC + 0.5) c = mixC(C.crater, C.sulfur, sm(0.72, 0.9, n2) * 0.8);
      if (Math.hypot(x - PARASITE[0], z - PARASITE[1]) < 3.2) c = mixC(c, C.scoria, 0.8);
      break;
    }
    case 'shield': {
      c = mixC(C.basaltOld, C.basalt, sm(-0.2, 0.3, n));
      c = mixC(c, lawn, sm(3, 1, y) * 0.8);
      if (r < 7.3) c = mixC(C.basalt, C.crater, sm(0.6, 0.9, n2) * 0.5);
      break;
    }
    case 'cinder': {
      c = mixC(lawn, C.sand, sm(20, 13, r));
      c = mixC(c, C.scoria, sm(12.5, 10, r));
      if (r < 3.4) c = mixC(C.scoria, C.crater, 0.5);
      break;
    }
    case 'dome': {
      c = mixC(lawn, mixC(C.dacite, shade(C.dacite, 0.62), sm(0.55, 0.8, n2)), sm(15, 8, r));
      break;
    }
    case 'caldera': {
      c = mixC(lawn, C.forest, sm(0.0, 0.5, n) * (1 - sm(5, 10, y)));
      c = mixC(c, C.soil, sm(6, 11, y + 2 * n));
      if (r < CAL_R + 1.8) c = mixC(hex('#8a6f5c'), hex('#6f5848'), 0.5 + 0.5 * Math.sin(y * 2.4));
      if (Math.hypot(x - CAL_CONE[0], z - CAL_CONE[1]) < 4.2) c = C.scoria;
      break;
    }
    case 'super': {
      c = mixC(C.forest, C.grass2, sm(-0.1, 0.4, n));
      // gorące źródła: niebieski środek, żółto-pomarańczowe obrzeża z bakterii (jak Grand Prismatic Spring)
      for (const [hx, hz, hr] of HOT_SPRINGS) {
        const d = Math.hypot(x - hx, z - hz) / hr;
        if (d < 1.9) {
          const ring = d < 0.55 ? hex('#2f8fd0') : d < 0.85 ? hex('#e8d060') : d < 1.3 ? hex('#e07a2a') : hex('#e8e2d0');
          c = mixC(c, ring, sm(1.9, 1.5, d));
        }
      }
      break;
    }
    case 'fissure': {
      c = mixC(C.moss, hex('#4e5a40'), sm(-0.2, 0.4, n));
      const fresh = Math.exp(-((x / 9) ** 2)) * sm(FISSURE_L + 4, FISSURE_L - 4, Math.abs(z));
      c = mixC(c, C.basalt, sm(0.25, 0.6, fresh + 0.2 * n));
      if (Math.abs(x) < 2.2 && Math.abs(z) < FISSURE_L) c = mixC(c, C.spatter, 0.6);
      break;
    }
    case 'maar': {
      c = mixC(lawn, C.forest, sm(0.1, 0.5, n));
      c = mixC(c, hex('#8a7a55'), Math.exp(-(((r - 11) / 2.4) ** 2)) * 0.55);
      break;
    }
    case 'sub': {
      const deep = sm(-2, -14, y);
      c = mixC(C.sand, mixC(C.sea, hex('#2e3640'), sm(0, 1, n2)), deep);
      if (y > -0.4 && y < 0.6) c = hex('#3a3434');
      if (r < 4.2 && y > 0) c = C.crater;
      break;
    }
    case 'tuya': {
      if (ice >= rock) c = mixC(C.ice, C.iceBlue, sm(0.6, 0.85, n2) * 0.7);
      else c = mixC(hex('#4a4442'), C.snow, sm(0.2, 0.6, n) * 0.5);
      return c;
    }
  }
  // strome ściany – naga skała
  if (t !== 'sub') c = mixC(c, shade(C.rock, 0.85), steep * 0.55);
  return c;
}

/** Gorące źródła superwulkanu: [x, z, promień]. */
export const HOT_SPRINGS: [number, number, number][] = [
  [-8, -20, 1.6],
  [12, -26, 1.1],
  [-30, -4, 1.3],
  [24, -6, 0.9],
  [4, -12, 0.8],
];

/** Kolor skały w przekroju (płaszczyzna z = 0) w punkcie (x, y). `melt` – kocioł w lodzie. */
export function geoColor(t: VType, x: number, y: number, pl: Plumbing, rock: number, ice: number, water: number): RGB {
  const n = fbm(x * 0.3, y * 0.3);
  // woda i lód nad skałą
  if (y > rock) {
    if (ice > rock && y <= ice) return mixC(C.ice, C.iceBlue, 0.5 + 0.5 * Math.sin(y * 3 + n * 2));
    if (y <= water) return mixC(C.water, hex('#2d6aa6'), sm(water, water - 20, y));
    return C.water;
  }
  // magma: komora z gorącą otoczką, komin, żyły
  const ch = pl.chamber;
  const q = ((x - ch.cx) / ch.ax) ** 2 + ((y - ch.cy) / ch.ay) ** 2;
  if (q < 1) return mixC(C.magmaHot, C.magmaEdge, sm(0.1, 1, q + 0.15 * n));
  const cd = pl.conduit;
  if (cd.w > 0 && y > cd.y0 - 1 && y < cd.y1 && Math.abs(x - cd.x) < cd.w) return C.plug;
  for (const [x0, y0, x1, y1, w] of pl.dikes) if (segDist(x, y, x0, y0, x1, y1) < w) return C.intrusion;
  for (const [x0, y0, x1, y1, w] of pl.sills) if (segDist(x, y, x0, y0, x1, y1) < w * (1 + 0.6 * Math.sin(((x - x0) / (x1 - x0)) * Math.PI))) return C.intrusion;
  let c = layerColor(t, x, y, rock, n);
  if (q < 2.2) c = mixC(C.hotRock, c, sm(1, 2.2, q + 0.2 * n));
  return c;
}

function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const u = clamp(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - x0 - u * dx, py - y0 - u * dy);
}

/** Warstwy skał: podłoże i budowla wulkanu. */
function layerColor(t: VType, x: number, y: number, rock: number, n: number): RGB {
  const base = baseLevel(t);
  const edifice = y > base + 0.2 * Math.sin(x * 0.2);
  if (!edifice) {
    if (t === 'sub' || (t === 'tuya' && false)) {
      // skorupa oceaniczna: lawy poduszkowe na dnie, niżej skała gabro
      if (y > base - 10) return pillow(x, y);
      return mixC(hex('#2c2f35'), hex('#3a3d44'), sm(-0.3, 0.3, n));
    }
    // skały osadowe (poziome warstwy), głębiej – krystaliczne podłoże
    const yy = y + 0.9 * Math.sin(x * 0.05) + 0.4 * n;
    if (yy < base - 24) return mixC(hex('#6e5f63'), hex('#857077'), sm(-0.2, 0.4, fbm(x * 0.15, y * 0.15)));
    const band = Math.floor((base - yy) / 3.2);
    const pal = ['#8b7355', '#a08a6a', '#76664f', '#9a8466', '#6f6050'];
    return hex(pal[((band % pal.length) + pal.length) % pal.length]);
  }
  const d = rock - y;
  switch (t) {
    case 'strato': {
      const band = Math.floor(d / 1.5 + 0.35 * n);
      return band % 3 === 0 ? hex('#9a7b55') : band % 3 === 1 ? hex('#4b4a50') : hex('#6b5a4e');
    }
    case 'shield': {
      const f = d / 0.75 + 0.2 * n;
      const frac = f - Math.floor(f);
      return frac < 0.12 ? hex('#5a3b32') : Math.floor(f) % 2 ? hex('#3a3a3f') : hex('#2e2e33');
    }
    case 'cinder':
      return mixC(C.scoria, hex('#5a3a30'), sm(0.5, 0.9, vnoise(x * 3, y * 3)));
    case 'dome': {
      const rr = Math.hypot(x, y - 1);
      return Math.floor(rr / 0.8 + 0.3 * n) % 2 ? C.dacite : hex('#7d7570');
    }
    case 'caldera': {
      if (Math.abs(x) < CAL_R - 1 && y < 1.4) return mixC(hex('#6d6258'), hex('#8c7c6a'), sm(0.4, 0.8, vnoise(x * 1.6, y * 1.6)));
      const band = Math.floor(d / 1.5 + 0.35 * n);
      return band % 3 === 0 ? hex('#9a7b55') : band % 3 === 1 ? hex('#4b4a50') : hex('#6b5a4e');
    }
    case 'super': {
      const band = Math.floor(y / 1.3 + 0.3 * n);
      return band % 2 ? hex('#b59f86') : hex('#a38c72');
    }
    case 'fissure': {
      const f = y / 0.9 + 0.15 * n;
      const frac = f - Math.floor(f);
      return frac < 0.14 ? hex('#5a3b32') : Math.floor(f) % 2 ? hex('#3a3a3f') : hex('#2f2f34');
    }
    case 'maar': {
      const band = Math.floor(d / 0.55);
      return band % 2 ? hex('#8e7a5c') : hex('#a4906c');
    }
    case 'sub': {
      if (y < -17) return pillow(x, y);
      if (y < 0.2) return Math.floor(y / 2.2 + 0.3 * n) % 2 ? hex('#a58a4a') : hex('#8a7440');
      return hex('#3a3438');
    }
    case 'tuya': {
      if (y < 4.5) return pillow(x, y);
      if (y < 13) return Math.floor(y / 2 + 0.3 * n) % 2 ? hex('#a58a4a') : hex('#8a7440');
      return Math.floor(d / 0.8) % 2 ? hex('#3a3a3f') : hex('#2e2e33');
    }
  }
}

/** Lawa poduszkowa w przekroju: okrągłe „poduszki” z ciemnym wnętrzem i jaśniejszą, szklistą skórką. */
function pillow(x: number, y: number): RGB {
  const sx = x / 1.6;
  const sy = y / 1.0;
  const i = Math.floor(sx + (Math.floor(sy) % 2) * 0.5);
  const j = Math.floor(sy);
  const fx = sx + (Math.floor(sy) % 2) * 0.5 - i - 0.5;
  const fy = sy - j - 0.5;
  const d = Math.hypot(fx, fy * 1.1);
  return d > 0.42 ? hex('#5a5040') : mixC(hex('#2f3238'), hex('#3e424a'), d * 2);
}

/* ================= pomocnicze ================= */

/** Powierzchnia (skała, lód albo woda – co wyżej). */
export function topH(t: VType, x: number, z: number, melt = 0) {
  return Math.max(rockH(t, x, z), iceH(t, x, z, melt));
}

/** Droga lawy (albo lahary) w dół zbocza od punktu startowego – ścieżka po największym spadku z bezwładnością. */
export function downhill(h: (x: number, z: number) => number, x0: number, z0: number, dir: number, maxLen = 60, step = 0.5): [number, number, number][] {
  const pts: [number, number, number][] = [];
  let x = x0;
  let z = z0;
  let vx = Math.cos(dir);
  let vz = Math.sin(dir);
  for (let i = 0; i < maxLen / step; i++) {
    const y = h(x, z);
    pts.push([x, y, z]);
    const e = 0.3;
    const gx = (h(x + e, z) - h(x - e, z)) / (2 * e);
    const gz = (h(x, z + e) - h(x, z - e)) / (2 * e);
    const g = Math.hypot(gx, gz);
    // na płaskim terenie lawa płynie dalej prosto (bezwładność), na stromym – w dół zbocza
    const w = clamp(g * 1.5, 0, 0.18);
    if (g > 1e-4) {
      vx = vx * (1 - w) - (gx / g) * w;
      vz = vz * (1 - w) - (gz / g) * w;
    }
    const l = Math.hypot(vx, vz) || 1;
    vx /= l;
    vz /= l;
    x += vx * step;
    z += vz * step;
    if (Math.hypot(x, z) > R_TERRAIN - 5) break;
  }
  return pts;
}
