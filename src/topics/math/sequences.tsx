import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { useAnimationClock } from '../../lib/useAnimationClock';
import { C, VIEW, num } from '../../lib/mathkit';

const X0 = 70;
const W = 800;
const TOP = 40;
const BOTTOM = 520;

/** Prosty wykres słupkowy wyrazów ciągu (oś y dopasowana do danych). */
function Bars({ values, color, highlight, extra }: { values: number[]; color: string; highlight?: number; extra?: React.ReactNode }) {
  const max = Math.max(1, ...values.map(Math.abs));
  const hasNeg = values.some((v) => v < 0);
  const zero = hasNeg ? (TOP + BOTTOM) / 2 : BOTTOM;
  const scale = (hasNeg ? (BOTTOM - TOP) / 2 : BOTTOM - TOP) / (max * 1.08);
  const bw = W / values.length;
  return (
    <g>
      <line x1={X0} x2={X0 + W} y1={zero} y2={zero} stroke={C.axis} strokeWidth="1.5" />
      {values.map((v, i) => {
        const h = v * scale;
        return (
          <g key={i}>
            <rect x={X0 + i * bw + bw * 0.15} y={h >= 0 ? zero - h : zero} width={bw * 0.7} height={Math.abs(h)} rx="4" fill={color} opacity={highlight === undefined || i < highlight ? 0.9 : 0.25} />
            {values.length <= 16 && (
              <text x={X0 + i * bw + bw / 2} y={zero + (v >= 0 ? 18 : -8)} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="middle">
                {i + 1}
              </text>
            )}
          </g>
        );
      })}
      {extra}
    </g>
  );
}

/* ---------- Krok 1: ciąg arytmetyczny i suma Gaussa ---------- */
function ArithmeticScene({ params }: SceneProps) {
  const a1 = Number(params.a1);
  const r = Number(params.r);
  const n = Number(params.n);
  const gauss = Boolean(params.gauss);
  const vals = Array.from({ length: n }, (_, i) => a1 + i * r);
  const an = vals[n - 1];
  const sum = ((a1 + an) / 2) * n;
  const allPos = vals.every((v) => v > 0);
  if (gauss && allPos) {
    // schodki + odwrócona kopia = prostokąt n × (a₁ + aₙ)
    const max = a1 + an;
    const bw = W / n;
    const sc = (BOTTOM - TOP) / (max * 1.05);
    return (
      <svg viewBox={VIEW}>
        {vals.map((v, i) => (
          <g key={i}>
            <rect x={X0 + i * bw + 2} y={BOTTOM - v * sc} width={bw - 4} height={v * sc} rx="3" fill={C.main} />
            <rect x={X0 + i * bw + 2} y={BOTTOM - max * sc} width={bw - 4} height={vals[n - 1 - i] * sc - 2} rx="3" fill={C.second} opacity="0.75" />
          </g>
        ))}
        <rect x={X0} y={BOTTOM - max * sc} width={W} height={max * sc} fill="none" stroke={C.third} strokeWidth="3" rx="4" />
        <InfoBox
          lines={[
            { text: `różowe + niebieskie = prostokąt ${n} × (${num(a1)} + ${num(an)})`, color: C.third },
            { text: `2Sₙ = n(a₁ + aₙ)  →  Sₙ = ${num(sum)}`, color: C.main },
          ]}
        />
      </svg>
    );
  }
  return (
    <svg viewBox={VIEW}>
      <Bars values={vals} color={C.main} />
      <InfoBox
        lines={[
          { text: `aₙ = a₁ + (n − 1)r = ${num(a1)} + (n − 1)·${num(r)}`, color: C.main },
          { text: `a${n} = ${num(an)}` },
          { text: `każdy słupek różni się od poprzedniego o r = ${num(r)}`, color: C.third },
          { text: `Sₙ = (a₁ + aₙ)/2 · n = ${num(sum)}`, color: C.second },
          { text: gauss && !allPos ? 'układanka Gaussa – tylko dla wyrazów dodatnich' : '' },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 2: ciąg geometryczny ---------- */
function GeometricScene({ params }: SceneProps) {
  const a1 = Number(params.a1);
  const q = Number(params.q);
  const n = Number(params.n);
  const vals = Array.from({ length: n }, (_, i) => a1 * Math.pow(q, i));
  const sum = Math.abs(q - 1) < 1e-9 ? a1 * n : (a1 * (1 - Math.pow(q, n))) / (1 - q);
  return (
    <svg viewBox={VIEW}>
      <Bars values={vals} color={C.second} />
      <InfoBox
        lines={[
          { text: `aₙ = a₁ · qⁿ⁻¹ = ${num(a1)} · ${num(q)}ⁿ⁻¹`, color: C.second },
          { text: `a${n} = ${num(vals[n - 1], 3)}` },
          { text: `każdy słupek to poprzedni razy q = ${num(q)}`, color: C.third },
          { text: q < 0 ? 'q < 0 → znaki na przemian' : Math.abs(q) < 1 ? '|q| < 1 → wyrazy maleją do 0' : q > 1 ? 'q > 1 → wzrost wykładniczy' : 'q = 1 → ciąg stały' },
          { text: `Sₙ = a₁(1 − qⁿ)/(1 − q) = ${num(sum, 3)}`, color: C.main },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 3: szereg geometryczny ---------- */
function SeriesScene({ params }: SceneProps) {
  const q = Number(params.q);
  const play = Boolean(params.play);
  const t = useAnimationClock(play, 1.2);
  const shown = play ? 1 + (Math.floor(t) % 14) : 14;
  // kwadrat 1 × 1 dzielony na kawałki o polach (1 − q)·qᵏ – razem 1 = a₁/(1 − q) dla a₁ = 1 − q
  const size = 440;
  const x0 = 60;
  const y0 = 60;
  const pieces: { x: number; y: number; w: number; h: number }[] = [];
  let x = x0;
  let y = y0;
  let w = size;
  let h = size;
  for (let k = 0; k < 14; k++) {
    if (k % 2 === 0) {
      const cut = w * (1 - q);
      pieces.push({ x, y, w: cut, h });
      x += cut;
      w -= cut;
    } else {
      const cut = h * (1 - q);
      pieces.push({ x, y, w, h: cut });
      y += cut;
      h -= cut;
    }
  }
  const partial = (1 - Math.pow(q, shown));
  const colors = ['#ff6b8b', '#4fc3ff', '#ffd166', '#4ade80', '#c084fc'];
  return (
    <svg viewBox={VIEW}>
      <rect x={x0} y={y0} width={size} height={size} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
      {pieces.slice(0, shown).map((pc, i) => (
        <rect key={i} x={pc.x} y={pc.y} width={pc.w} height={pc.h} fill={colors[i % colors.length]} opacity={0.85} stroke="#0b0d12" strokeWidth="1.5" />
      ))}
      {/* oś sum częściowych */}
      <line x1={590} x2={590} y1={y0} y2={y0 + size} stroke={C.axis} strokeWidth="1.5" />
      <line x1={580} x2={860} y1={y0} y2={y0} stroke={C.good} strokeDasharray="5 5" strokeWidth="2" />
      {Array.from({ length: shown }, (_, k) => {
        const s = 1 - Math.pow(q, k + 1);
        return <circle key={k} cx={610 + k * 18} cy={y0 + size - s * size} r="6" fill={colors[k % colors.length]} />;
      })}
      <text x={860} y={y0 - 10} fill={C.good} fontFamily="Geist" fontSize="14" textAnchor="end" fontWeight="600">
        S = 1
      </text>
      <InfoBox
        lines={[
          { text: `a₁ = ${num(1 - q)}, q = ${num(q)}` },
          { text: `S${shown} = ${num(partial, 4)}`, color: C.main },
          { text: `S = a₁ / (1 − q) = ${num(1 - q)} / ${num(1 - q)} = 1`, color: C.good },
          { text: 'kawałki nigdy nie wyjdą poza kwadrat – suma dąży do 1' },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 4: granica ciągu ---------- */
const LIMITS: Record<string, { f: (n: number) => number; g: number; name: string }> = {
  frac: { f: (n) => (2 * n + 3) / (n + 1), g: 2, name: '(2n + 3)/(n + 1)' },
  alt: { f: (n) => 1 + Math.pow(-1, n) / n, g: 1, name: '1 + (−1)ⁿ/n' },
  sqrt: { f: (n) => Math.sqrt(n * n + n) - n, g: 0.5, name: '√(n² + n) − n' },
  e: { f: (n) => Math.pow(1 + 1 / n, n), g: Math.E, name: '(1 + 1/n)ⁿ' },
};
function LimitScene({ params }: SceneProps) {
  const L = LIMITS[String(params.seq)] ?? LIMITS.frac;
  const eps = Number(params.eps);
  const N = 40;
  const vals = Array.from({ length: N }, (_, i) => L.f(i + 1));
  const lo = Math.min(...vals, L.g - eps) - 0.1;
  const hi = Math.max(...vals, L.g + eps) + 0.1;
  const sy = (v: number) => BOTTOM - ((v - lo) / (hi - lo)) * (BOTTOM - TOP);
  const sx = (n: number) => X0 + ((n - 0.5) / N) * W;
  let first = 1;
  for (let n = N; n >= 1; n--) if (Math.abs(vals[n - 1] - L.g) >= eps) {
    first = n + 1;
    break;
  }
  return (
    <svg viewBox={VIEW}>
      <rect x={X0} y={sy(L.g + eps)} width={W} height={sy(L.g - eps) - sy(L.g + eps)} fill={C.good} opacity="0.13" />
      <line x1={X0} x2={X0 + W} y1={sy(L.g)} y2={sy(L.g)} stroke={C.good} strokeWidth="2" strokeDasharray="6 5" />
      {first <= N && <line x1={sx(first) - 9} x2={sx(first) - 9} y1={TOP} y2={BOTTOM} stroke={C.third} strokeWidth="2" />}
      {vals.map((v, i) => (
        <circle key={i} cx={sx(i + 1)} cy={sy(v)} r="5.5" fill={i + 1 >= first ? C.good : C.main} />
      ))}
      <InfoBox
        lines={[
          { text: `aₙ = ${L.name}`, color: C.main },
          { text: `granica g = ${num(L.g, 4)}`, color: C.good },
          { text: `pas ε = ${num(eps, 3)}: od wyrazu n = ${first} wszystkie są w pasie`, color: C.third },
          { text: 'im węższy pas, tym dalej trzeba sięgnąć – ale zawsze się da' },
        ]}
      />
    </svg>
  );
}

export const sequences: Topic = {
  id: 'ciagi',
  title: 'Ciągi liczbowe',
  subject: 'matematyka',
  summary: 'Ciąg arytmetyczny i układanka Gaussa, ciąg geometryczny, nieskończona suma, która mieści się w kwadracie, i granica ciągu z pasem ε.',
  accent: '#ff6f61',
  glyph: 'aₙ',
  steps: [
    {
      title: 'Ciąg arytmetyczny',
      kind: '2d',
      scene: ArithmeticScene,
      controls: [
        { type: 'slider', key: 'a1', label: 'a₁', min: -5, max: 8, step: 0.5, default: 2 },
        { type: 'slider', key: 'r', label: 'Różnica r', min: -2, max: 3, step: 0.25, default: 1 },
        { type: 'slider', key: 'n', label: 'Liczba wyrazów n', min: 3, max: 20, step: 1, default: 10 },
        { type: 'toggle', key: 'gauss', label: 'Układanka Gaussa', default: false },
      ],
      body: (
        <>
          <div className="formula">aₙ = a₁ + (n − 1)r      Sₙ = (a₁ + aₙ)/2 · n</div>
          <p>
            W ciągu <strong>arytmetycznym</strong> każdy wyraz powstaje przez dodanie tej samej liczby r. Słupki tworzą
            równe schodki – to punkty leżące na prostej.
          </p>
          <p>
            Włącz <strong>układankę Gaussa</strong>: dokładamy ten sam ciąg odwrócony do góry nogami. Razem tworzą
            prostokąt n × (a₁ + aₙ), więc suma to połowa jego pola. Tak podobno mały Gauss w kilka sekund dodał liczby
            od 1 do 100.
          </p>
        </>
      ),
    },
    {
      title: 'Ciąg geometryczny',
      kind: '2d',
      scene: GeometricScene,
      controls: [
        { type: 'slider', key: 'a1', label: 'a₁', min: -4, max: 6, step: 0.5, default: 1 },
        { type: 'slider', key: 'q', label: 'Iloraz q', min: -1.6, max: 1.6, step: 0.05, default: 1.3 },
        { type: 'slider', key: 'n', label: 'Liczba wyrazów n', min: 3, max: 20, step: 1, default: 12 },
      ],
      body: (
        <>
          <div className="formula">aₙ = a₁ · qⁿ⁻¹      Sₙ = a₁(1 − qⁿ)/(1 − q)</div>
          <p>
            W ciągu <strong>geometrycznym</strong> każdy wyraz to poprzedni pomnożony przez q. Dla q &gt; 1 słupki
            rosną coraz szybciej – tak rośnie kapitał na lokacie albo liczba bakterii.
          </p>
          <p>Dla ujemnego q znaki skaczą na przemian, a dla |q| &lt; 1 wyrazy maleją do zera.</p>
        </>
      ),
    },
    {
      title: 'Nieskończona suma',
      kind: '2d',
      scene: SeriesScene,
      controls: [
        { type: 'slider', key: 'q', label: 'Iloraz q', min: 0.3, max: 0.8, step: 0.05, default: 0.5 },
        { type: 'toggle', key: 'play', label: 'Dokładaj kawałki', default: true },
      ],
      body: (
        <>
          <div className="formula">S = a₁ / (1 − q),   |q| &lt; 1</div>
          <p>
            Czy można dodać nieskończenie wiele liczb i dostać wynik skończony? Tak – jeśli wyrazy maleją
            geometrycznie. Każdy kolejny kawałek zabiera część tego, co zostało z kwadratu.
          </p>
          <p>
            Kawałków jest nieskończenie wiele, ale wszystkie mieszczą się w kwadracie o polu 1. Sumy częściowe (kropki
            po prawej) zbliżają się do zielonej linii, nigdy jej nie przekraczając.
          </p>
        </>
      ),
    },
    {
      title: 'Granica ciągu',
      kind: '2d',
      scene: LimitScene,
      controls: [
        {
          type: 'select',
          key: 'seq',
          label: 'Ciąg',
          default: 'frac',
          options: [
            { value: 'frac', label: '(2n+3)/(n+1)' },
            { value: 'alt', label: '1 + (−1)ⁿ/n' },
            { value: 'sqrt', label: '√(n²+n) − n' },
            { value: 'e', label: '(1 + 1/n)ⁿ' },
          ],
        },
        { type: 'slider', key: 'eps', label: 'Szerokość pasa ε', min: 0.02, max: 0.6, step: 0.01, default: 0.2, decimals: 2 },
      ],
      body: (
        <>
          <div className="formula">lim aₙ = g  ⇔  dla każdego ε &gt; 0 prawie wszystkie wyrazy leżą w (g − ε; g + ε)</div>
          <p>
            „Prawie wszystkie” znaczy: wszystkie <strong>od pewnego miejsca</strong>. Zwężaj zielony pas – żółta linia
            przesuwa się w prawo, ale zawsze istnieje.
          </p>
          <p>
            Ostatni ciąg zbliża się do liczby <strong>e ≈ 2,718</strong> – podstawy logarytmu naturalnego. Zbiega bardzo
            powoli: zobacz, ile wyrazów zostaje poza wąskim pasem.
          </p>
        </>
      ),
    },
  ],
};
