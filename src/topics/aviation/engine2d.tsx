/**
 * Wspólna geometria przekroju dwuwałowego turbowentylatora (widok z boku, oś silnika poziomo).
 * Jednostki: współrzędne SVG w polu 1000 × 440, oś silnika na y = Y0, promień rośnie w górę.
 * Rysujemy górną połowę i odbijamy ją lustrzanie – silnik jest osiowo-symetryczny.
 */
import { useMemo, type ReactNode } from 'react';

export const W = 1000;
export const H = 440;
export const Y0 = 220;

type Table = [number, number][];

/** Interpolacja liniowa w tabeli [x, wartość]. */
export function lerpTable(t: Table, x: number): number {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1];
      const [x1, y1] = t[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return t[t.length - 1][1];
}

/* ---------- Ścianki (promienie w funkcji x) ---------- */
export const NAC_OUT: Table = [[50, 172], [70, 184], [140, 192], [300, 186], [450, 168], [540, 150]];
export const NAC_IN: Table = [[50, 166], [80, 162], [130, 167], [175, 168], [230, 160], [400, 146], [540, 132]];
/** Zewnętrzna ścianka osłony rdzenia (wewnętrzna ścianka kanału obejściowego). */
export const COWL_OUT: Table = [[196, 80], [210, 88], [270, 102], [430, 100], [560, 88], [700, 66], [740, 62]];
/** Ścianki kanału rdzenia: zewnętrzna i piasta. */
export const CORE_OUT: Table = [[196, 78], [265, 76], [285, 73], [440, 50], [450, 66], [540, 66], [550, 56], [590, 58], [690, 74], [760, 60]];
export const CORE_IN: Table = [[150, 34], [196, 40], [265, 44], [285, 46], [440, 40], [450, 30], [540, 30], [550, 36], [690, 34], [760, 30], [820, 0]];
/** Kołpak wentylatora. */
export const SPINNER: Table = [[78, 0], [100, 20], [130, 30], [150, 34]];

export const r = {
  nacOut: (x: number) => lerpTable(NAC_OUT, x),
  nacIn: (x: number) => lerpTable(NAC_IN, x),
  cowlOut: (x: number) => lerpTable(COWL_OUT, x),
  coreOut: (x: number) => lerpTable(CORE_OUT, x),
  coreIn: (x: number) => lerpTable(CORE_IN, x),
};

/* ---------- Podzespoły ---------- */
export interface Part {
  id: string;
  name: string;
  x0: number;
  x1: number;
  color: string;
  /** Promień środka etykiety. */
  ly: number;
  desc: string;
}

export const PARTS: Part[] = [
  { id: 'wlot', name: 'wlot', x0: 50, x1: 138, color: '#7dd3fc', ly: 120, desc: 'Przednia część osłony silnika. Gładko prowadzi powietrze do wentylatora i spowalnia je. W locie powietrze samo „wbija się” we wlot z dużą prędkością, więc ściska się już tutaj, zanim dotrze do wentylatora.' },
  { id: 'fan', name: 'wentylator', x0: 140, x1: 162, color: '#38bdf8', ly: 175, desc: 'Wielkie łopaty z przodu silnika (2–3,5 m średnicy) zasysają całe powietrze. Ok. 90% omija środek silnika i daje większość ciągu – reszta wpada do środka, do sprężarek.' },
  { id: 'bypass', name: 'kanał obejściowy', x0: 200, x1: 540, color: '#60a5fa', ly: 132, desc: 'Kanał wokół środka silnika. Płynie nim chłodne powietrze z wentylatora, które nie bierze udziału w spalaniu. Na końcu wylatuje z dużą prędkością do tyłu i pcha samolot.' },
  { id: 'lpc', name: 'sprężarka NP', x0: 205, x1: 265, color: '#a3e635', ly: 60, desc: 'Sprężarka niskiego ciśnienia (NP): kilka rzędów łopatek tuż za wentylatorem, na tym samym wale. Wstępnie ściska powietrze, zanim trafi ono do sprężarki wysokiego ciśnienia.' },
  { id: 'hpc', name: 'sprężarka WP', x0: 280, x1: 440, color: '#facc15', ly: 60, desc: 'Sprężarka wysokiego ciśnienia (WP): ok. 9–10 rzędów łopatek, które kręcą się bardzo szybko. Ściska powietrze 30–50 razy mocniej niż na wlocie – przy tym rozgrzewa się ono do ok. 600 °C.' },
  { id: 'comb', name: 'komora spalania', x0: 450, x1: 540, color: '#fb923c', ly: 48, desc: 'Tu paliwo spala się w ściśniętym powietrzu. Temperatura skacze do 1500–1700 °C – więcej, niż wytrzymałby metal łopatek turbiny bez chłodzenia.' },
  { id: 'hpt', name: 'turbina WP', x0: 548, x1: 585, color: '#f87171', ly: 46, desc: 'Turbina wysokiego ciśnienia (WP): pierwsza za komorą spalania, w najgorętszym miejscu silnika. Gorące gazy kręcą nią, a ona napędza sprężarkę WP. Jej łopatki są chłodzone powietrzem od środka i pokryte ceramiczną warstwą, która chroni je przed żarem.' },
  { id: 'lpt', name: 'turbina NP', x0: 595, x1: 685, color: '#c084fc', ly: 66, desc: 'Turbina niskiego ciśnienia (NP): 4–7 rzędów łopatek za turbiną WP. Odbiera gazom resztę energii i przez wał biegnący środkiem silnika napędza wentylator z przodu.' },
  { id: 'nozzle', name: 'dysza', x0: 690, x1: 820, color: '#f472b6', ly: 50, desc: 'Wylot gorących spalin. Zwęża się, więc gazy przyspieszają i wylatują szybko do tyłu. Stożek w środku wygładza strumień.' },
];

/* ---------- Ścieżki SVG ---------- */
function band(outer: (x: number) => number, inner: (x: number) => number, x0: number, x1: number, n = 40) {
  const xs = Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);
  const top = xs.map((x) => `${x.toFixed(1)},${(Y0 - outer(x)).toFixed(1)}`);
  const bot = xs.reverse().map((x) => `${x.toFixed(1)},${(Y0 - inner(x)).toFixed(1)}`);
  return `M${top.join(' L')} L${bot.join(' L')} Z`;
}

/** Rysuje dzieci dwa razy: normalnie i odbite względem osi silnika. */
export function Mirror({ children }: { children: ReactNode }) {
  return (
    <>
      <g>{children}</g>
      <g transform={`translate(0 ${2 * Y0}) scale(1 -1)`}>{children}</g>
    </>
  );
}

/* ---------- Strumienie cząstek ---------- */

/** Prędkość osiowa w rdzeniu (umowna, do animacji) i temperatura [°C]. */
const CORE_V: Table = [[0, 1.4], [140, 1.1], [200, 1], [280, 0.9], [440, 0.7], [450, 0.45], [540, 0.6], [560, 1.3], [690, 1.4], [800, 2.2], [1000, 2.4]];
const BYP_V: Table = [[0, 1.4], [140, 1.1], [200, 1], [540, 1.5], [1000, 1.7]];
export const CORE_T: Table = [[0, 15], [150, 50], [265, 120], [440, 600], [470, 1100], [540, 1600], [585, 1050], [685, 650], [820, 600], [1000, 400]];

/** Tabela odwrotna: faza 0..1 → x, tak aby cząstki zwalniały i przyspieszały zgodnie z prędkością. */
function phaseTable(v: Table, x0: number, x1: number) {
  const n = 400;
  const xs: number[] = [];
  const ts: number[] = [0];
  for (let i = 0; i <= n; i++) xs.push(x0 + ((x1 - x0) * i) / n);
  for (let i = 1; i <= n; i++) ts.push(ts[i - 1] + (xs[i] - xs[i - 1]) / lerpTable(v, (xs[i] + xs[i - 1]) / 2));
  const T = ts[n];
  return { at: (u: number) => {
    const target = u * T;
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (ts[m] < target) lo = m;
      else hi = m;
    }
    return xs[lo] + ((xs[hi] - xs[lo]) * (target - ts[lo])) / Math.max(1e-9, ts[hi] - ts[lo]);
  }, total: T };
}

const CORE_PHASE = phaseTable(CORE_V, -20, 1000);
const BYP_PHASE = phaseTable(BYP_V, -20, 1000);

/** Kolor temperatury: niebieski → żółty → pomarańczowy → czerwony. */
export function tempColor(t: number) {
  const stops: [number, [number, number, number]][] = [
    [15, [125, 211, 252]],
    [300, [190, 242, 100]],
    [600, [250, 204, 21]],
    [1100, [251, 146, 60]],
    [1600, [239, 68, 68]],
  ];
  let c = stops[stops.length - 1][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const k = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      c = stops[i - 1][1].map((a, j) => Math.round(a + (stops[i][1][j] - a) * Math.max(0, k))) as [number, number, number];
      break;
    }
  }
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function hash(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Promień cząstki rdzenia przy położeniu x i „torze” f ∈ (0, 1). */
function coreR(x: number, f: number) {
  if (x < 196) return 40 + f * 36;
  if (x > 760) return Math.max(2, (r.coreIn(Math.min(x, 820)) + f * (60 - r.coreIn(Math.min(x, 820)))) * (x > 820 ? 1 + (x - 820) / 900 : 1));
  const a = r.coreIn(x) + 2;
  const b = r.coreOut(x) - 2;
  return a + f * (b - a);
}
function bypR(x: number, f: number) {
  if (x < 140) return 84 + f * 76;
  if (x < 200) return 80 + f * 84;
  if (x <= 540) {
    const a = r.cowlOut(x) + 3;
    const b = r.nacIn(x) - 3;
    return a + f * (b - a);
  }
  const a = r.cowlOut(Math.min(x, 740)) + 3;
  const b = 128 + (x - 540) * 0.04;
  return a + f * (b - a);
}

export interface Particle {
  x: number;
  y: number;
  c: string;
  core: boolean;
}

/** Cząstki w chwili t. `speed` skaluje tempo (np. od dźwigni ciągu). */
export function useParticles(t: number, speed: number, nCore = 46, nByp = 70, showCore = true, showBypass = true): Particle[] {
  const seeds = useMemo(
    () => ({
      core: Array.from({ length: nCore }, (_, i) => ({ f: 0.1 + 0.8 * hash(i), ph: hash(i + 500), up: i % 2 === 0 })),
      byp: Array.from({ length: nByp }, (_, i) => ({ f: 0.08 + 0.84 * hash(i + 1000), ph: hash(i + 1500), up: i % 2 === 0 })),
    }),
    [nCore, nByp],
  );
  const out: Particle[] = [];
  const k = (t * speed * 0.9) / CORE_PHASE.total * 300;
  if (showCore)
    for (const s of seeds.core) {
      const x = CORE_PHASE.at((s.ph + k) % 1);
      const rr = coreR(x, s.f);
      out.push({ x, y: s.up ? Y0 - rr : Y0 + rr, c: tempColor(lerpTable(CORE_T, x)), core: true });
    }
  const kb = (t * speed * 0.9) / BYP_PHASE.total * 300;
  if (showBypass)
    for (const s of seeds.byp) {
      const x = BYP_PHASE.at((s.ph + kb) % 1);
      const rr = bypR(x, s.f);
      out.push({ x, y: s.up ? Y0 - rr : Y0 + rr, c: '#7dd3fc', core: false });
    }
  return out;
}

/* ---------- Przekrój silnika ---------- */

export function EngineSection({
  t,
  n1 = 1,
  n2 = 1,
  highlight,
  labels = false,
  dim = false,
  children,
}: {
  t: number;
  /** Prędkości obrotowe wałów (umowne, 0..1). */
  n1?: number;
  n2?: number;
  highlight?: string;
  labels?: boolean;
  dim?: boolean;
  children?: ReactNode;
}) {
  const hl = (id: string) => (highlight === undefined || highlight === id ? 1 : 0.25);
  // „Przesuw” łopat – rysujemy łopaty jako kreski, które przesuwają się wzdłuż promienia, imitując obrót.
  const spin = (speed: number, i: number) => ((t * speed * 3 + i * 0.37) % 1 + 1) % 1;
  const rotorRows = (x0: number, x1: number, n: number, speed: number, rotorColor: string, statorColor: string, opacity: number) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / (n * 2);
      const rotor = i % 2 === 0;
      const a = r.coreIn(x) + 1;
      const b = r.coreOut(x) - 1;
      const ph = spin(speed, i);
      return (
        <g key={`${x0}-${i}`} opacity={opacity}>
          <line x1={x} x2={x} y1={Y0 - a} y2={Y0 - b} stroke={rotor ? rotorColor : statorColor} strokeWidth={rotor ? 3.2 : 2.2} strokeLinecap="round" />
          {rotor && <circle cx={x} cy={Y0 - (a + (b - a) * ph)} r="2.2" fill="#fff" opacity="0.7" />}
        </g>
      );
    });

  const fanPh = spin(n1 * 0.8, 0);
  return (
    <g opacity={dim ? 0.5 : 1}>
      <Mirror>
        {/* gondola */}
        <path d={band(r.nacOut, r.nacIn, 50, 540)} fill="#334155" stroke="#94a3b8" strokeWidth="1.2" opacity={hl('wlot') > 0.5 || hl('bypass') > 0.5 || hl('fan') > 0.5 ? 1 : 0.4} />
        {/* osłona rdzenia */}
        <path d={band(r.cowlOut, r.coreOut, 196, 740)} fill="#1e293b" stroke="#64748b" strokeWidth="1" />
        {/* piasta, wał i stożek wylotowy */}
        <path d={band(r.coreIn, () => 0, 150, 820)} fill="#0f172a" stroke="#475569" strokeWidth="1" />
        <path d={band((x) => lerpTable(SPINNER, x), () => 0, 78, 150)} fill="#cbd5e1" stroke="#e2e8f0" strokeWidth="1" />
        {/* wentylator */}
        <g opacity={hl('fan')}>
          <rect x={144} y={Y0 - 166} width={14} height={166 - 34} rx="5" fill="#38bdf8" opacity="0.85" />
          <circle cx={151} cy={Y0 - (36 + 128 * fanPh)} r="3" fill="#fff" opacity="0.8" />
          <rect x={170} y={Y0 - 166} width={5} height={166 - 86} rx="2" fill="#94a3b8" opacity="0.8" />
        </g>
        {/* sprężarki i turbiny */}
        {rotorRows(205, 265, 3, n1, '#a3e635', '#64748b', hl('lpc'))}
        {rotorRows(282, 438, 9, n2, '#facc15', '#64748b', hl('hpc'))}
        {rotorRows(550, 584, 1, n2, '#f87171', '#64748b', hl('hpt'))}
        {rotorRows(596, 684, 4, n1, '#c084fc', '#64748b', hl('lpt'))}
        {/* komora spalania – płomieniówka i wtryskiwacz */}
        <g opacity={hl('comb')}>
          <path d={`M458,${Y0 - 40} Q470,${Y0 - 62} 500,${Y0 - 61} L536,${Y0 - 58} L536,${Y0 - 38} L500,${Y0 - 35} Q470,${Y0 - 34} 458,${Y0 - 40} Z`} fill="rgba(251,146,60,0.18)" stroke="#fb923c" strokeWidth="1.5" />
          <circle cx={460} cy={Y0 - 48} r="3.5" fill="#fde68a" />
        </g>
        {/* wały: NP (niebieski) i WP (czerwony) */}
        <line x1={150} x2={700} y1={Y0 - 8} y2={Y0 - 8} stroke="#38bdf8" strokeWidth="3" opacity="0.7" />
        <line x1={280} x2={585} y1={Y0 - 16} y2={Y0 - 16} stroke="#f87171" strokeWidth="3" opacity="0.7" />
      </Mirror>
      {children}
      {labels &&
        PARTS.map((p, i) => {
          // podpisy na przemian wyżej i niżej, żeby się nie nakładały
          const ty = Y0 + 192 + (i % 3) * 15;
          const cx = (p.x0 + p.x1) / 2;
          return (
            <g key={p.id} opacity={highlight === undefined || highlight === p.id ? 1 : 0.35}>
              <line x1={cx} x2={cx} y1={Y0 + p.ly} y2={ty - 12} stroke={p.color} strokeWidth="1" strokeDasharray="2 3" />
              <text x={cx} y={ty} fontSize="13" textAnchor="middle" fill={p.color} fontWeight="600">
                {p.name}
              </text>
            </g>
          );
        })}
    </g>
  );
}

export function ParticleDots({ ps, r: rad = 2.6 }: { ps: Particle[]; r?: number }) {
  return (
    <g>
      {ps.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={rad} fill={p.c} opacity={p.x < 0 || p.x > W ? 0 : 0.9} />
      ))}
    </g>
  );
}

/** Wartości „wzdłuż silnika” – przybliżone dla dużego turbowentylatora przy starcie (ISA, poziom morza). */
export const ALONG = {
  /** ciśnienie całkowite w rdzeniu [bar] */
  p: [[0, 1.0], [140, 1.0], [165, 1.5], [265, 2.6], [440, 42], [455, 41], [540, 40], [585, 10], [685, 1.6], [820, 1.0], [1000, 1.0]] as Table,
  /** ciśnienie w kanale obejściowym [bar] */
  pByp: [[0, 1.0], [140, 1.0], [165, 1.55], [540, 1.5], [620, 1.0], [1000, 1.0]] as Table,
  /** temperatura w rdzeniu [°C] */
  T: [[0, 15], [140, 15], [165, 55], [265, 120], [440, 600], [455, 620], [540, 1600], [585, 1050], [685, 650], [820, 600], [1000, 590]] as Table,
  /** temperatura w kanale obejściowym [°C] */
  TByp: [[0, 15], [140, 15], [165, 55], [1000, 55]] as Table,
  /** prędkość przepływu w rdzeniu [m/s] */
  v: [[0, 0], [60, 120], [140, 170], [265, 160], [440, 120], [455, 50], [540, 60], [560, 250], [585, 220], [685, 200], [820, 430], [1000, 430]] as Table,
  /** prędkość w kanale obejściowym [m/s] */
  vByp: [[0, 0], [60, 120], [140, 170], [200, 150], [540, 300], [1000, 300]] as Table,
};
