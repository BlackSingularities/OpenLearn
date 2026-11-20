import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { Board, C, Curve, Pt, Seg, VIEW, num, usePlot } from '../../lib/mathkit';

/** Barwa wskaźnika uniwersalnego dla danego pH. */
export function universal(pH: number) {
  const stops: [number, [number, number, number]][] = [
    [0, [220, 38, 38]],
    [3, [249, 115, 22]],
    [5, [250, 204, 21]],
    [7, [74, 222, 128]],
    [9, [45, 212, 191]],
    [11, [59, 130, 246]],
    [14, [124, 58, 237]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (pH >= a && pH <= b) {
      const t = (pH - a) / (b - a);
      return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * t)).join(',')})`;
    }
  }
  return 'rgb(124,58,237)';
}

const SUBSTANCES: [string, number][] = [
  ['kwas solny 1 mol/dm³', 0],
  ['sok żołądkowy', 1.5],
  ['sok z cytryny', 2.4],
  ['napój typu cola', 2.5],
  ['ocet', 2.9],
  ['kawa', 5],
  ['mleko', 6.5],
  ['woda destylowana', 7],
  ['krew', 7.4],
  ['woda morska', 8.1],
  ['soda oczyszczona', 8.3],
  ['mydło', 10],
  ['woda amoniakalna', 11.6],
  ['wybielacz', 12.5],
  ['NaOH 1 mol/dm³', 14],
];

/* ---------- Krok 1: skala pH ---------- */
function ScaleScene({ params }: SceneProps) {
  const idx = Number(params.s);
  const [name, pH] = SUBSTANCES[idx];
  const H = Math.pow(10, -pH);
  const OH = Math.pow(10, pH - 14);
  const X0 = 60;
  const W = 780;
  const sx = (v: number) => X0 + (v / 14) * W;
  return (
    <svg viewBox={VIEW}>
      {Array.from({ length: 140 }, (_, i) => (
        <rect key={i} x={sx(i / 10)} y="250" width={W / 140 + 0.5} height="46" fill={universal(i / 10)} />
      ))}
      {Array.from({ length: 15 }, (_, v) => (
        <text key={v} x={sx(v)} y="318" fill={C.text} fontFamily="Geist" fontSize="13" textAnchor="middle">
          {v}
        </text>
      ))}
      {SUBSTANCES.map(([n, v], i) => (
        <line key={n} x1={sx(v)} x2={sx(v)} y1={i === idx ? 222 : 240} y2="250" stroke={i === idx ? '#fff' : 'rgba(255,255,255,0.35)'} strokeWidth={i === idx ? 3 : 1.5} />
      ))}
      <path d={`M${sx(pH)},248 l-10,-22 h20 z`} fill="#fff" />
      <text x={sx(pH)} y="210" fill="#fff" fontFamily="Geist" fontSize="16" fontWeight="700" textAnchor={pH < 2 ? 'start' : pH > 12 ? 'end' : 'middle'}>
        {name}
      </text>
      <text x={sx(3)} y="365" fill={C.text} fontFamily="Geist" fontSize="14" textAnchor="middle">
        kwasowe
      </text>
      <text x={sx(7)} y="365" fill={C.text} fontFamily="Geist" fontSize="14" textAnchor="middle">
        obojętne
      </text>
      <text x={sx(11)} y="365" fill={C.text} fontFamily="Geist" fontSize="14" textAnchor="middle">
        zasadowe
      </text>
      {/* stężenia jonów na skali logarytmicznej */}
      <rect x={sx(0)} y="400" width={(W * (14 - pH)) / 14} height="20" rx="4" fill="#f87171" />
      <rect x={sx(0)} y="440" width={(W * pH) / 14} height="20" rx="4" fill="#60a5fa" />
      <text x={sx(0)} y="394" fill="#f87171" fontFamily="Geist" fontSize="13">
        [H⁺] = 10^−{num(pH, 1)} mol/dm³ (długość ∝ log)
      </text>
      <text x={sx(0)} y="480" fill="#60a5fa" fontFamily="Geist" fontSize="13">
        [OH⁻] = 10^−{num(14 - pH, 1)} mol/dm³
      </text>
      <InfoBox
        lines={[
          { text: 'pH = −log [H⁺]', color: '#fff' },
          { text: `${name}: pH ≈ ${num(pH, 1)}`, color: universal(pH) },
          { text: `[H⁺] = ${H.toExponential(1).replace('.', ',')} mol/dm³` },
          { text: `[OH⁻] = ${OH.toExponential(1).replace('.', ',')} mol/dm³` },
          { text: 'o 1 w dół skali – 10 razy więcej jonów H⁺', color: C.third },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 2: miareczkowanie ---------- */
const INDICATORS: Record<string, { name: string; lo: number; hi: number; a: string; b: string }> = {
  fenol: { name: 'fenoloftaleina', lo: 8.2, hi: 10, a: 'rgba(255,255,255,0.08)', b: '#ec4899' },
  oranz: { name: 'oranż metylowy', lo: 3.1, hi: 4.4, a: '#ef4444', b: '#facc15' },
  bromo: { name: 'błękit bromotymolowy', lo: 6, hi: 7.6, a: '#facc15', b: '#2563eb' },
};
function mix(a: string, b: string, t: number) {
  const parse = (s: string) => (s.startsWith('#') ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)).concat(1) : (s.match(/[\d.]+/g) ?? ['0', '0', '0', '1']).map(Number));
  const A = parse(a);
  const B = parse(b);
  return `rgba(${[0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t)).join(',')},${(A[3] ?? 1) + ((B[3] ?? 1) - (A[3] ?? 1)) * t})`;
}

function pHat(V: number, weak: boolean) {
  const ca = 0.1;
  const Va = 0.025;
  const na = ca * Va;
  const nb = (0.1 * V) / 1000;
  const Vt = Va + V / 1000;
  if (!weak) {
    if (nb < na - 1e-9) return -Math.log10((na - nb) / Vt);
    if (Math.abs(nb - na) < 1e-9) return 7;
    return 14 + Math.log10((nb - na) / Vt);
  }
  const Ka = 1.8e-5;
  if (nb < 1e-9) return -Math.log10(Math.sqrt(Ka * ca));
  if (nb < na - 1e-9) return Math.max(-Math.log10(Math.sqrt(Ka * ca)), -Math.log10(Ka) + Math.log10(nb / (na - nb)));
  if (Math.abs(nb - na) < 1e-9) return 14 + Math.log10(Math.sqrt((1e-14 / Ka) * (na / Vt)));
  return 14 + Math.log10((nb - na) / Vt);
}

function TitrationScene({ params }: SceneProps) {
  const V = Number(params.V);
  const weak = String(params.acid) === 'weak';
  const I = INDICATORS[String(params.ind)] ?? INDICATORS.fenol;
  const pH = pHat(V, weak);
  const t = Math.max(0, Math.min(1, (pH - I.lo) / (I.hi - I.lo)));
  const color = mix(I.a, I.b, t);
  const p = usePlot({ x: 360, y: 30, w: 500, h: 470, xMin: 0, xMax: 50, yMin: 0, yMax: 14 });
  return (
    <svg viewBox={VIEW}>
      {/* biureta i kolba */}
      <rect x="140" y="20" width="22" height="220" rx="4" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.5)" />
      <rect x="142" y={22 + (V / 50) * 216} width="18" height={216 - (V / 50) * 216} fill="#93c5fd" opacity="0.6" />
      <path d="M151 240 v28" stroke="rgba(255,255,255,0.5)" strokeWidth="3" />
      <path d="M120 300 L120 360 L60 470 Q55 485 72 485 L230 485 Q247 485 242 470 L182 360 L182 300" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" />
      <path d="M86 420 L216 420 L242 470 Q247 485 230 485 L72 485 Q55 485 60 470 Z" fill={color} />
      <text x="151" y="520" fill={C.text} fontFamily="Geist" fontSize="13" textAnchor="middle">
        {weak ? 'CH₃COOH' : 'HCl'} 0,1 mol/dm³, 25 cm³
      </text>
      <g>
        {[0, 10, 20, 30, 40, 50].map((v) => (
          <text key={v} x={p.sx(v)} y={p.sy(0) + 18} fill={C.text} fontFamily="Geist" fontSize="11" textAnchor="middle">
            {v}
          </text>
        ))}
        {[0, 2, 4, 6, 8, 10, 12, 14].map((v) => (
          <g key={v}>
            <line x1={p.sx(0)} x2={p.sx(50)} y1={p.sy(v)} y2={p.sy(v)} stroke="rgba(255,255,255,0.06)" />
            <text x={p.sx(0) - 6} y={p.sy(v) + 4} fill={C.text} fontFamily="Geist" fontSize="11" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <rect x={p.sx(0)} y={p.sy(I.hi)} width={500} height={p.sy(I.lo) - p.sy(I.hi)} fill={I.b} opacity="0.12" />
        <path d={p.path((v) => pHat(v, weak), 0, 50, 400)} fill="none" stroke={C.main} strokeWidth="3" />
        <Seg p={p} a={[25, 0]} b={[25, 14]} color="rgba(255,255,255,0.25)" dash="4 5" />
        <circle cx={p.sx(V)} cy={p.sy(pH)} r="7" fill={C.third} />
        <text x={p.sx(25)} y={p.sy(14) + 14} fill={C.text} fontFamily="Geist" fontSize="11" textAnchor="middle">
          punkt równoważnikowy
        </text>
      </g>
      <InfoBox
        lines={[
          { text: `dodano ${num(V, 1)} cm³ NaOH 0,1 mol/dm³`, color: '#93c5fd' },
          { text: `pH = ${num(pH, 2)}`, color: C.third },
          { text: `${I.name}: zmiana barwy przy pH ${num(I.lo, 1)}–${num(I.hi, 1)}` },
          { text: weak ? 'słaby kwas: w punkcie równoważnikowym pH > 7 (octan hydrolizuje)' : 'mocny kwas + mocna zasada: punkt równoważnikowy przy pH = 7', color: C.good },
        ]}
      />
    </svg>
  );
}

export const acidbase: Topic = {
  id: 'kwasy-zasady-ph',
  title: 'Kwasy, zasady i pH',
  subject: 'chemia',
  summary: 'Logarytmiczna skala pH z codziennymi substancjami i barwami wskaźnika oraz miareczkowanie mocnego i słabego kwasu z krzywą i wskaźnikami.',
  accent: '#f43f5e',
  glyph: 'pH',
  steps: [
    {
      title: 'Skala pH',
      kind: '2d',
      scene: ScaleScene,
      controls: [{ type: 'slider', key: 's', label: 'Substancja', min: 0, max: SUBSTANCES.length - 1, step: 1, default: 4 }],
      body: (
        <>
          <div className="formula">pH = −log[H⁺]      pH + pOH = 14</div>
          <p>
            pH mierzy stężenie jonów wodorowych. Skala jest <strong>logarytmiczna</strong>: sok z cytryny (pH 2,4) ma
            w sobie około 10 000 razy więcej jonów H⁺ niż kawa (pH 5).
          </p>
          <p>
            W roztworze obojętnym [H⁺] = [OH⁻] = 10⁻⁷ mol/dm³. Gdy jednych przybywa, drugich ubywa – ich iloczyn jest
            stały. Przesuwaj suwak po substancjach z życia codziennego i obserwuj barwę wskaźnika uniwersalnego.
          </p>
        </>
      ),
    },
    {
      title: 'Miareczkowanie',
      kind: '2d',
      scene: TitrationScene,
      controls: [
        {
          type: 'select',
          key: 'acid',
          label: 'Kwas w kolbie',
          default: 'strong',
          options: [
            { value: 'strong', label: 'HCl (mocny)' },
            { value: 'weak', label: 'CH₃COOH (słaby)' },
          ],
        },
        {
          type: 'select',
          key: 'ind',
          label: 'Wskaźnik',
          default: 'fenol',
          options: [
            { value: 'fenol', label: 'fenoloftaleina' },
            { value: 'oranz', label: 'oranż metylowy' },
            { value: 'bromo', label: 'błękit bromotymolowy' },
          ],
        },
        { type: 'slider', key: 'V', label: 'Dodana zasada', min: 0, max: 50, step: 0.1, default: 20, unit: 'cm³' },
      ],
      body: (
        <>
          <p>
            Do kwasu o nieznanym stężeniu dodajemy z biurety zasadę o znanym stężeniu. Na początku pH zmienia się
            powoli, a przy <strong>punkcie równoważnikowym</strong> skacze o kilka jednostek po dodaniu jednej kropli.
          </p>
          <p>
            Wskaźnik zmienia barwę w swoim przedziale pH (pasek na wykresie). Dla mocnego kwasu wystarczy każdy, którego
            przedział leży na pionowym odcinku krzywej. Dla słabego kwasu oranż metylowy zmieni barwę o wiele za wcześnie
            – trzeba użyć fenoloftaleiny.
          </p>
        </>
      ),
    },
  ],
};
