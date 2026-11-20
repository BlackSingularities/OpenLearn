import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { C, VIEW, num } from '../../lib/mathkit';

const X0 = 70;
const W = 780;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;

/** Wykres kropkowy: wartości jako stosy kropek nad osią. */
function DotPlot({ values, min, max, y, color, unit = '' }: { values: number[]; min: number; max: number; y: number; color: string; unit?: string }) {
  const sx = (v: number) => X0 + ((v - min) / (max - min)) * W;
  const stacks = new Map<number, number>();
  const ticks = 6;
  return (
    <g>
      <line x1={X0} x2={X0 + W} y1={y} y2={y} stroke={C.axis} strokeWidth="1.5" />
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = min + ((max - min) * i) / ticks;
        return (
          <text key={i} x={sx(v)} y={y + 22} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="middle">
            {num(v, 0)}
            {unit}
          </text>
        );
      })}
      {values.map((v, i) => {
        const key = Math.round(sx(v) / 14);
        const n = stacks.get(key) ?? 0;
        stacks.set(key, n + 1);
        return <circle key={i} cx={sx(v)} cy={y - 12 - n * 20} r="8.5" fill={color} stroke="#0b0d12" strokeWidth="2" />;
      })}
    </g>
  );
}

/* ---------- Krok 1: średnia, mediana, dominanta ---------- */
const SETS: Record<string, { name: string; values: number[]; min: number; max: number; unit: string; outlierMax: number }> = {
  pensje: { name: 'pensje w firmie (tys. zł)', values: [4.5, 5, 5, 5.5, 6, 6, 6, 7, 8], min: 0, max: 30, unit: '', outlierMax: 30 },
  oceny: { name: 'oceny z kartkówki', values: [2, 3, 3, 4, 4, 4, 4, 5, 5], min: 1, max: 6, unit: '', outlierMax: 6 },
  czas: { name: 'czas dojazdu (min)', values: [10, 12, 15, 15, 18, 20, 22, 25, 30], min: 0, max: 120, unit: '', outlierMax: 120 },
};
function CenterScene({ params }: SceneProps) {
  const S = SETS[String(params.set)] ?? SETS.pensje;
  const out = Number(params.out);
  const extra = S.min + (S.outlierMax - S.min) * out;
  const values = [...S.values, extra];
  const mu = mean(values);
  const me = median(values);
  const counts = new Map<number, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const top = Math.max(...counts.values());
  const modes = [...counts.entries()].filter(([, c]) => c === top && top > 1).map(([v]) => v);
  const sx = (v: number) => X0 + ((v - S.min) / (S.max - S.min)) * W;
  const Y = 380;
  return (
    <svg viewBox={VIEW}>
      {/* belka na podparciu w średniej */}
      <rect x={X0 - 10} y={Y + 2} width={W + 20} height={6} rx="3" fill="rgba(255,255,255,0.25)" />
      <path d={`M${sx(mu)},${Y + 10} l-18,34 h36 z`} fill={C.main} />
      <line x1={sx(me)} x2={sx(me)} y1={110} y2={Y + 50} stroke={C.second} strokeWidth="3" strokeDasharray="7 5" />
      <DotPlot values={values} min={S.min} max={S.max} y={Y} color="rgba(255,255,255,0.85)" />
      <circle cx={sx(extra)} cy={Y - 12} r="11" fill="none" stroke={C.third} strokeWidth="3" />
      <text x={sx(mu)} y={Y + 70} fill={C.main} fontFamily="Geist" fontSize="15" fontWeight="700" textAnchor="middle">
        średnia
      </text>
      <text x={sx(me)} y={100} fill={C.second} fontFamily="Geist" fontSize="15" fontWeight="700" textAnchor="middle">
        mediana
      </text>
      <InfoBox
        lines={[
          { text: S.name },
          { text: `średnia x̄ = ${num(mu)} – punkt równowagi belki`, color: C.main },
          { text: `mediana = ${num(me)} – środek uporządkowanych danych`, color: C.second },
          { text: modes.length ? `dominanta = ${modes.map((m) => num(m)).join('; ')}` : 'dominanty brak (każda wartość raz)', color: C.good },
          { text: `żółta kropka – wartość odstająca: ${num(extra)}`, color: C.third },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 2: odchylenie standardowe ---------- */
const Z = [-1.6, -1.1, -0.7, -0.4, -0.1, 0.15, 0.4, 0.75, 1.2, 1.4];
function SpreadScene({ params }: SceneProps) {
  const m = Number(params.m);
  const s = Number(params.s);
  const showSq = Boolean(params.sq);
  const values = Z.map((z) => +(m + z * s).toFixed(1));
  const mu = mean(values);
  const variance = mean(values.map((v) => (v - mu) ** 2));
  const sigma = Math.sqrt(variance);
  const min = 0;
  const max = 20;
  const sx = (v: number) => X0 + ((v - min) / (max - min)) * W;
  const unit = W / (max - min);
  return (
    <svg viewBox={VIEW}>
      <rect x={sx(mu - sigma)} y={60} width={2 * sigma * unit} height={440} fill={C.good} opacity="0.1" />
      <line x1={sx(mu)} x2={sx(mu)} y1={50} y2={500} stroke={C.main} strokeWidth="3" />
      {values.map((v, i) => {
        const y = 80 + i * 40;
        const d = v - mu;
        return (
          <g key={i}>
            {showSq && <rect x={Math.min(sx(v), sx(mu))} y={y - Math.abs(d) * unit * 0.25} width={Math.abs(d) * unit} height={Math.abs(d) * unit * 0.25} fill={C.third} opacity="0.25" />}
            <line x1={sx(mu)} x2={sx(v)} y1={y} y2={y} stroke={d >= 0 ? C.second : C.third} strokeWidth="3" />
            <circle cx={sx(v)} cy={y} r="8" fill="#fff" stroke="#0b0d12" strokeWidth="2" />
          </g>
        );
      })}
      <line x1={X0} x2={X0 + W} y1={510} y2={510} stroke={C.axis} strokeWidth="1.5" />
      {[0, 5, 10, 15, 20].map((v) => (
        <text key={v} x={sx(v)} y={530} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="middle">
          {v}
        </text>
      ))}
      <InfoBox
        lines={[
          { text: `x̄ = ${num(mu)}`, color: C.main },
          { text: `wariancja σ² = średnia kwadratów odchyleń = ${num(variance)}`, color: C.third },
          { text: `odchylenie standardowe σ = √σ² = ${num(sigma)}`, color: C.good },
          { text: `w przedziale x̄ ± σ leży ${values.filter((v) => Math.abs(v - mu) <= sigma + 1e-9).length} z ${values.length} wyników`, color: C.good },
        ]}
      />
    </svg>
  );
}

export const statistics: Topic = {
  id: 'statystyka',
  title: 'Statystyka opisowa',
  subject: 'matematyka',
  summary: 'Średnia jako punkt równowagi, mediana odporna na wartości odstające i odchylenie standardowe jako miara rozrzutu.',
  accent: '#f3606f',
  glyph: 'x̄',
  steps: [
    {
      title: 'Średnia, mediana, dominanta',
      kind: '2d',
      scene: CenterScene,
      controls: [
        {
          type: 'select',
          key: 'set',
          label: 'Dane',
          default: 'pensje',
          options: [
            { value: 'pensje', label: 'pensje' },
            { value: 'oceny', label: 'oceny' },
            { value: 'czas', label: 'dojazd' },
          ],
        },
        { type: 'slider', key: 'out', label: 'Wartość odstająca', min: 0, max: 1, step: 0.01, default: 0.85, decimals: 2 },
      ],
      body: (
        <>
          <div className="formula">x̄ = (x₁ + x₂ + … + xₙ) / n</div>
          <p>
            <strong>Średnia</strong> to punkt, w którym belka z kropkami byłaby w równowadze. Jedna bardzo duża wartość
            (pensja prezesa) przeciąga ją mocno w swoją stronę.
          </p>
          <p>
            <strong>Mediana</strong> to wartość środkowa po uporządkowaniu – połowa danych jest mniejsza, połowa
            większa. Przesuń wartość odstającą: mediana prawie się nie rusza. Dlatego GUS podaje też medianę
            wynagrodzeń.
          </p>
          <p>
            <strong>Dominanta</strong> to wartość najczęstsza.
          </p>
        </>
      ),
    },
    {
      title: 'Odchylenie standardowe',
      kind: '2d',
      scene: SpreadScene,
      controls: [
        { type: 'slider', key: 'm', label: 'Położenie danych', min: 6, max: 14, step: 0.1, default: 10 },
        { type: 'slider', key: 's', label: 'Rozrzut', min: 0.3, max: 5, step: 0.1, default: 2.5 },
        { type: 'toggle', key: 'sq', label: 'Pokaż kwadraty odchyleń', default: false },
      ],
      body: (
        <>
          <div className="formula">σ = √[ ((x₁ − x̄)² + … + (xₙ − x̄)²) / n ]</div>
          <p>
            Dwie klasy mogą mieć tę samą średnią, a zupełnie inne wyniki: jedna równa, druga z samymi skrajnościami.{' '}
            <strong>Odchylenie standardowe</strong> mierzy, jak daleko typowo leżą dane od średniej.
          </p>
          <p>
            Odchylenia w lewo i w prawo by się znosiły, dlatego najpierw je podnosimy do kwadratu (żółte pola), liczymy
            średnią – to wariancja – i na koniec pierwiastkujemy, żeby wrócić do jednostek danych.
          </p>
        </>
      ),
    },
  ],
};
