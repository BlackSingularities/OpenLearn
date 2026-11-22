/*
 * Elektrownia wiatrowa – wymiary, fizyka i geometria wspólna dla wszystkich zakładek.
 *
 * Model to typowa współczesna turbina lądowa o mocy 4,5 MW: wirnik o średnicy ok. 150 m, piasta na wysokości
 * ok. 120 m, stalowa wieża rurowa. Wszystkie wymiary w metrach; scena jest wpisana w układ tematu w skali 1 : 4
 * (FRAME), żeby kamera mogła objąć zarówno całą farmę, jak i wnętrze gondoli.
 *
 * Układ osi: y – w górę, x – w stronę, z której wieje wiatr (wirnik patrzy w +x), z – w bok. Wirnik obraca się
 * zgodnie ze wskazówkami zegara, gdy patrzy się na niego od strony wiatru – jak w prawdziwych turbinach.
 */
import * as THREE from 'three';

export type V3 = [number, number, number];

/** Umieszczenie sceny w układzie tematu: 1 m = 0,25 jednostki. */
export const FRAME = { position: [0, 0, 0] as V3, scale: 0.25 };

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
export const sm = (a: number, b: number, v: number) => {
  const k = clamp((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};
export const DEG = Math.PI / 180;

/* ================= wymiary turbiny ================= */

export const T = {
  /** Wysokość wieży (do łożyska obrotu gondoli). */
  towerH: 117.5,
  towerRb: 2.25,
  towerRt: 1.55,
  /** Wysokości kołnierzy łączących segmenty wieży. */
  flanges: [0, 21, 44, 68, 93, 117.5],
  /** Środek piasty przed osią wieży. */
  hubX: 7.4,
  /** Oś wału nad szczytem wieży (przy osi wieży). */
  shaftY: 2.45,
  /** Pochylenie wału (wirnik zadarty, żeby łopaty nie uderzyły w wieżę). */
  tilt: 5 * DEG,
  /** Odchylenie łopat od płaszczyzny wirnika pod wiatr (stożek). */
  cone: 4 * DEG,
  bladeL: 73.5,
  /** Odległość kołnierza łopaty od osi wirnika. */
  rootR: 2.1,
  rootD: 3.4,
  ratedRpm: 10.5,
  minRpm: 5,
  ratedP: 4.5,
  cutIn: 3,
  cutOut: 25,
};
/** Promień wirnika. */
export const R = T.rootR + T.bladeL;
export const AREA = Math.PI * R * R;
export const RHO = 1.225;
/** Środek piasty (w układzie turbiny, przy odchyleniu gondoli 0). */
export const HUB: V3 = [T.hubX, T.towerH + T.shaftY + T.hubX * Math.tan(T.tilt), 0];
export const HUB_Y = HUB[1];

/** Promień wieży na wysokości y. */
export const towerR = (y: number) => mix(T.towerRb, T.towerRt, clamp(y / T.towerH));

/* ================= praca turbiny ================= */

export type OpState = 'calm' | 'part' | 'full' | 'storm';
export interface OpPoint {
  /** Obroty wirnika (obr/min). */
  rpm: number;
  /** Kąt ustawienia łopat (°). */
  pitch: number;
  /** Moc elektryczna (MW). */
  P: number;
  /** Moc niesiona przez wiatr przez pole wirnika (MW). */
  Pwind: number;
  state: OpState;
}

/** Moc wiatru przepływającego przez pole zakreślane przez wirnik (MW). */
export const windPower = (v: number) => (0.5 * RHO * AREA * v ** 3) / 1e6;

/**
 * Punkt pracy przy danej prędkości wiatru: poniżej 3 m/s turbina czeka, do ok. 10 m/s łapie, ile się da (łopaty
 * ustawione płasko, obroty rosną z wiatrem), powyżej – trzyma moc znamionową, obracając łopaty; od 25 m/s
 * łopaty ustawiają się w chorągiewkę i wirnik ledwie się kręci.
 */
export function opPoint(v: number): OpPoint {
  const Pwind = windPower(v);
  if (v < T.cutIn) return { rpm: mix(0.4, 1.6, v / T.cutIn), pitch: 45, P: 0, Pwind, state: 'calm' };
  if (v > T.cutOut) return { rpm: 0.5, pitch: 88, P: 0, Pwind, state: 'storm' };
  // część mocy, którą zabiera wirnik i zamienia na prąd (współczynnik ok. 0,45 – granica Betza to 0,593)
  const Pp = Pwind * 0.45 * sm(T.cutIn - 0.5, T.cutIn + 1.5, v);
  const P = Math.pow(Math.pow(Pp, -6) + Math.pow(T.ratedP, -6), -1 / 6);
  const rpm = clamp((8.5 * v) / R * (60 / (2 * Math.PI)), T.minRpm, T.ratedRpm);
  const vr = 10.2;
  const pitch = v <= vr ? 0 : 24 * Math.pow((v - vr) / (T.cutOut - vr), 0.72);
  return { rpm, pitch, P, Pwind, state: v <= vr ? 'part' : 'full' };
}

/** Prędkość wiatru na wysokości y, gdy na wysokości piasty wieje vHub (wiatr słabnie przy ziemi). */
export const shear = (vHub: number, y: number) => vHub * Math.pow(Math.max(1, y) / HUB_Y, 0.16);

/* ================= profil łopaty ================= */

/** Cięciwa łopaty w odległości s od kołnierza (m). */
export function chordAt(s: number) {
  const L = T.bladeL;
  if (s < 13) return mix(T.rootD, 4.35, sm(1.5, 13, s));
  const k = (s - 13) / (L - 13);
  const c = mix(4.35, 0.9, Math.pow(k, 0.85));
  // zaokrąglona końcówka
  const tip = s > L - 2.2 ? Math.sqrt(clamp(1 - ((s - (L - 2.2)) / 2.2) ** 2)) : 1;
  return Math.max(0.05, c * mix(0.25, 1, tip));
}
/** Względna grubość profilu (grubość / cięciwa). */
export function thickAt(s: number) {
  if (s < 2.5) return 1;
  if (s < 13) return mix(1, 0.4, sm(2.5, 13, s));
  return mix(0.4, 0.18, Math.pow((s - 13) / (T.bladeL - 13), 0.55));
}
/** Skręcenie łopaty (°): przy nasadzie profil ustawiony bardziej pod wiatr, na końcu prawie płasko. */
export function twistAt(s: number) {
  if (s < 13) return 13.5;
  return 13.5 * Math.pow(1 - (s - 13) / (T.bladeL - 13), 1.9);
}
/** Wygięcie łopaty pod wiatr (m) – pod naporem wiatru prostuje się i nie uderza w wieżę. */
export const prebendAt = (s: number) => 3.2 * Math.pow(clamp((s - 20) / (T.bladeL - 20)), 2.2);
/** Udział koła (nasada) w kształcie przekroju: 1 – rura, 0 – profil lotniczy. */
const roundAt = (s: number) => 1 - sm(1.5, 11, s);

/**
 * Profil lotniczy w punkcie u ∈ [0, 1): u = 0 – krawędź spływu, u = 0,5 – krawędź natarcia; górna połowa (u < 0,5)
 * to strona ssąca. Zwraca [położenie wzdłuż cięciwy 0…1, grubość względem cięciwy].
 */
export function airfoil(u: number, t: number): [number, number] {
  const a = 2 * Math.PI * u;
  const x = (1 + Math.cos(a)) / 2;
  const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  // ugięcie szkieletowej (strzałka 3% na 40% cięciwy)
  const m = 0.03;
  const p = 0.4;
  const yc = x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x);
  return [x, u < 0.5 ? yc + yt : yc - yt];
}

/** Punkt przekroju łopaty w jej układzie (bez skręcenia): [x – wzdłuż osi wirnika, z – w płaszczyźnie wirnika]. */
export function sectionPt(s: number, u: number): [number, number] {
  const c = chordAt(s);
  const k = roundAt(s);
  const [ax, ay] = airfoil(u, thickAt(s));
  const a = 2 * Math.PI * u;
  const cx = 0.5 + 0.5 * Math.cos(a);
  const cy = 0.5 * Math.sin(a);
  const pa = mix(0.35, 0.5, k);
  const xc = mix(ax, cx, k);
  const yc = mix(ay, cy, k);
  // krawędź natarcia w stronę ruchu (−z), strona ssąca z wiatrem (−x)
  return [-yc * c, (xc - pa) * c];
}

/** Punkt łopaty w układzie łopaty: y – wzdłuż łopaty od osi wirnika, skręcenie i wygięcie uwzględnione. */
export function bladePt(s: number, u: number, out: THREE.Vector3) {
  const [x0, z0] = sectionPt(s, u);
  const th = twistAt(s) * DEG;
  const x = x0 * Math.cos(th) - z0 * Math.sin(th);
  const z = x0 * Math.sin(th) + z0 * Math.cos(th);
  return out.set(x + prebendAt(s), T.rootR + s, z);
}

/** Pasy ostrzegawcze dla lotnictwa na końcu łopaty (czerwony – biały – czerwony, po 6 m). */
export const isRedBand = (s: number) => {
  const d = T.bladeL - s;
  return d < 6 || (d >= 12 && d < 18);
};

const RED_BAND = new THREE.Color('#c8372d');
const BLADE_WHITE = new THREE.Color('#f1f3f4');

/**
 * Siatka łopaty: przekroje od nasady po końcówkę (gęściej przy nasadzie i na końcu), pasy ostrzegawcze w kolorach
 * wierzchołków i zamknięta końcówka. `lod` – liczba przekrojów i punktów na obwodzie dla turbin w oddali.
 */
export function bladeGeometry(lod: 'high' | 'low' = 'high') {
  const NS = lod === 'high' ? 90 : 26;
  const NU = lod === 'high' ? 64 : 18;
  const ss: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const k = i / NS;
    ss.push(T.bladeL * (0.5 - 0.5 * Math.cos(Math.PI * Math.pow(k, 0.9))));
  }
  // dokładne granice pasów, żeby kolor zmieniał się ostro
  if (lod === 'high') for (const d of [6, 12, 18]) ss.push(T.bladeL - d - 0.01, T.bladeL - d + 0.01);
  ss.sort((a, b) => a - b);
  const pos: number[] = [];
  const col: number[] = [];
  const v = new THREE.Vector3();
  for (const s of ss) {
    const c = isRedBand(s) ? RED_BAND : BLADE_WHITE;
    for (let j = 0; j < NU; j++) {
      // gęściej przy krawędzi natarcia (u = 0,5) i spływu
      const u = j / NU;
      bladePt(s, u, v);
      pos.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
    }
  }
  const n = ss.length;
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < NU; j++) {
      const a = i * NU + j;
      const b = i * NU + ((j + 1) % NU);
      const c = a + NU;
      const d = b + NU;
      idx.push(a, c, b, b, c, d);
    }
  // zamknięcie końcówki
  const tipC = new THREE.Vector3();
  bladePt(T.bladeL, 0.25, tipC);
  const tc = pos.length / 3;
  const last = (n - 1) * NU;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let j = 0; j < NU; j++) {
    cx += pos[(last + j) * 3];
    cy += pos[(last + j) * 3 + 1];
    cz += pos[(last + j) * 3 + 2];
  }
  pos.push(cx / NU, cy / NU + 0.05, cz / NU);
  col.push(RED_BAND.r, RED_BAND.g, RED_BAND.b);
  for (let j = 0; j < NU; j++) idx.push(last + j, tc, last + ((j + 1) % NU));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Ząbki na krawędzi spływu przy końcu łopaty (jak u sowy) – rozbijają wiry i wyciszają szum.
 * Cienkie trójkąty w płaszczyźnie cięciwy.
 */
export function serrationGeometry() {
  const pos: number[] = [];
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const L = T.bladeL;
  for (let s = L - 22; s < L - 2.4; s += 0.7) {
    const s1 = s + 0.6;
    bladePt(s, 0, v);
    bladePt(s1, 0, w);
    // kierunek „za krawędź spływu” w płaszczyźnie cięciwy (z skręceniem)
    const th = twistAt(s + 0.3) * DEG;
    const len = 0.12 * chordAt(s) + 0.1;
    const dx = -Math.sin(th) * len;
    const dz = Math.cos(th) * len;
    const mx = (v.x + w.x) / 2 + dx;
    const my = (v.y + w.y) / 2;
    const mz = (v.z + w.z) / 2 + dz;
    pos.push(v.x, v.y, v.z, w.x, w.y, w.z, mx, my, mz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Zarys przekroju łopaty (zamknięta pętla punktów w układzie łopaty) – do rysowania skręcenia. */
export function sectionLoop(s: number, n = 72): V3[] {
  const v = new THREE.Vector3();
  const pts: V3[] = [];
  for (let j = 0; j <= n; j++) {
    bladePt(s, (j % n) / n, v);
    pts.push([v.x, v.y, v.z]);
  }
  return pts;
}

/* ================= teren ================= */

/** Hash 2D → 0…1. */
export function hash2(i: number, j: number) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  return mix(mix(hash2(i, j), hash2(i + 1, j), ux), mix(hash2(i, j + 1), hash2(i + 1, j + 1), ux), uz);
}
export const fbm = (x: number, z: number) => vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 7, z * 2.1 - 3) * 0.3 + vnoise(x * 4.3 - 11, z * 4.3 + 5) * 0.15;

/** Turbiny farmy: położenia (m). Pierwsza – turbina, którą oglądamy z bliska. */
export const FARM: [number, number][] = [
  [0, 0],
  [-60, -520],
  [40, 530],
  [-640, -250],
  [-580, 300],
  [-1180, -520],
  [-1240, 40],
  [-1150, 560],
  [620, -330],
];
/** Stacja elektroenergetyczna (GPZ), do której płynie prąd z farmy. */
export const SUBSTATION: V3 = [700, 0, 520];
/** Wieś. */
export const VILLAGE: V3 = [420, 0, -760];

/** Wysokość terenu: płasko przy turbinach, łagodne pagórki dalej (nizina, jak w Polsce). */
export function groundH(x: number, z: number) {
  const r = Math.hypot(x + 300, z);
  const hills = (fbm(x / 520 + 3.1, z / 520 - 1.7) - 0.5) * 34 + (fbm(x / 160, z / 160) - 0.5) * 4;
  return hills * sm(500, 1400, r);
}

/** Losowy generator z ziarnem (powtarzalny). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
