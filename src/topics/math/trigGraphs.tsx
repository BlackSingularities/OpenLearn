import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import type { Plot } from '../../lib/plot';
import { Band, Board, C, Curve, Label, Pt, Seg, num, squareFrame, usePlot } from '../../lib/mathkit';

const PI = Math.PI;
const F = squareFrame(0, 0, 7.2);

const piLabel = (k: number) => {
  // k – wielokrotność π/2
  if (k === 0) return '0';
  const s = k < 0 ? '−' : '';
  const a = Math.abs(k);
  if (a % 2 === 0) return `${s}${a / 2 === 1 ? '' : a / 2}π`;
  return `${s}${a === 1 ? '' : a}π/2`;
};

/** Podziałka w wielokrotnościach π/2 na osi x. */
function PiTicks({ p }: { p: Plot }) {
  const ks = [-4, -3, -2, -1, 1, 2, 3, 4];
  return (
    <g>
      {ks.map((k) => (
        <g key={k}>
          <line x1={p.sx((k * PI) / 2)} x2={p.sx((k * PI) / 2)} y1={p.sy(0) - 5} y2={p.sy(0) + 5} stroke={C.axis} strokeWidth="1.5" />
          <Label p={p} x={(k * PI) / 2} y={0} dy={-10} size={13} color={C.text} weight={500}>
            {piLabel(k)}
          </Label>
        </g>
      ))}
      {[-2, -1, 1, 2].map((y) => (
        <Label key={`y${y}`} p={p} x={0} y={y} dx={-8} dy={5} anchor="end" size={13} color={C.text} weight={500}>
          {y < 0 ? `−${-y}` : y}
        </Label>
      ))}
    </g>
  );
}

/* ---------- Krok 1: parametry sinusoidy ---------- */
function SineScene({ params }: SceneProps) {
  const A = Number(params.A);
  const B = Number(params.B);
  const Cs = Number(params.C);
  const D = Number(params.D);
  const p = usePlot(F);
  const f = (x: number) => A * Math.sin(B * (x - Cs)) + D;
  const T = (2 * PI) / B;
  const x0 = Cs + T / 4; // pierwsze maksimum po przesunięciu
  return (
    <Board p={p} labels={false}>
      <PiTicks p={p} />
      <Curve p={p} f={Math.sin} color={C.ghost} width={2} dash="5 6" />
      <Seg p={p} a={[-8, D]} b={[8, D]} color={C.second} width={1.5} dash="3 6" />
      <Seg p={p} a={[-8, D + A]} b={[8, D + A]} color={C.ghost} width={1} dash="2 8" />
      <Seg p={p} a={[-8, D - A]} b={[8, D - A]} color={C.ghost} width={1} dash="2 8" />
      <Curve p={p} f={f} color={C.main} width={4} n={500} />
      {/* okres */}
      <Seg p={p} a={[Cs, D - Math.abs(A) - 0.5]} b={[Cs + T, D - Math.abs(A) - 0.5]} color={C.good} width={3} />
      <Seg p={p} a={[x0, D]} b={[x0, D + A]} color={C.third} width={3} arrow />
      <Pt p={p} x={Cs} y={D} color={C.second} r={5} />
      <InfoBox
        lines={[
          { text: `f(x) = ${num(A)} · sin(${num(B)}(x ${Cs >= 0 ? '−' : '+'} ${num(Math.abs(Cs))})) ${D >= 0 ? '+' : '−'} ${num(Math.abs(D))}`, color: C.main },
          { text: `amplituda |A| = ${num(Math.abs(A))}`, color: C.third },
          { text: `okres T = 2π / B ≈ ${num(T)}`, color: C.good },
          { text: `przesunięcie w poziomie o ${num(Cs)}, w pionie o ${num(D)}`, color: C.second },
          { text: `zbiór wartości: ⟨${num(D - Math.abs(A))}; ${num(D + Math.abs(A))}⟩` },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: sinus, cosinus, tangens ---------- */
function FamilyScene({ params }: SceneProps) {
  const which = String(params.f);
  const shift = Number(params.shift);
  const p = usePlot(F);
  const asym = [-3, -1, 1, 3].map((k) => (k * PI) / 2);
  return (
    <Board p={p} labels={false}>
      <PiTicks p={p} />
      {which === 'sincos' && (
        <>
          <Curve p={p} f={Math.cos} color={C.second} width={3} />
          <Curve p={p} f={(x) => Math.sin(x + shift)} color={C.main} width={4} />
          <Seg p={p} a={[-shift + PI / 2, 1.3]} b={[PI / 2, 1.3]} color={C.third} width={2.5} arrow />
        </>
      )}
      {which === 'tan' && (
        <>
          {asym.map((a) => (
            <Seg key={a} p={p} a={[a, -5]} b={[a, 5]} color={C.second} width={2} dash="6 6" />
          ))}
          <Curve p={p} f={Math.tan} color={C.main} width={4} n={900} />
          <Curve p={p} f={Math.sin} color={C.ghost} width={1.5} dash="4 6" />
          <Pt p={p} x={shift} y={Math.tan(shift)} color={C.third} />
        </>
      )}
      <InfoBox
        lines={
          which === 'sincos'
            ? [
                { text: `sin(x + ${num(shift)})`, color: C.main },
                { text: 'cos x', color: C.second },
                { text: Math.abs(shift - PI / 2) < 0.03 ? 'pokrywają się: cos x = sin(x + π/2)' : 'przesuń o π/2 ≈ 1,57', color: C.third },
                { text: 'okres obu funkcji: 2π, zbiór wartości ⟨−1; 1⟩' },
              ]
            : [
                { text: 'tg x = sin x / cos x', color: C.main },
                { text: 'asymptoty pionowe tam, gdzie cos x = 0: x = π/2 + kπ', color: C.second },
                { text: `tg(${num(shift)}) = ${Math.abs(Math.cos(shift)) < 0.02 ? 'nie istnieje' : num(Math.tan(shift))}`, color: C.third },
                { text: 'okres: π, zbiór wartości: ℝ' },
              ]
        }
      />
    </Board>
  );
}

/* ---------- Krok 3: równanie sin x = m ---------- */
function EquationScene({ params }: SceneProps) {
  const m = Number(params.m);
  const fn = String(params.f) === 'cos' ? Math.cos : Math.sin;
  const isCos = String(params.f) === 'cos';
  const p = usePlot(F);
  const sols: number[] = [];
  if (Math.abs(m) <= 1) {
    const base = isCos ? Math.acos(m) : Math.asin(m);
    for (let k = -3; k <= 3; k++) {
      const c = isCos ? [base + 2 * k * PI, -base + 2 * k * PI] : [base + 2 * k * PI, PI - base + 2 * k * PI];
      c.forEach((x) => {
        if (x >= -7 && x <= 7 && !sols.some((s) => Math.abs(s - x) < 1e-6)) sols.push(x);
      });
    }
  }
  const inMain = sols.filter((x) => x >= -1e-9 && x <= 2 * PI + 1e-9).sort((a, b) => a - b);
  const base = isCos ? Math.acos(Math.max(-1, Math.min(1, m))) : Math.asin(Math.max(-1, Math.min(1, m)));
  return (
    <Board p={p} labels={false}>
      <PiTicks p={p} />
      <Band p={p} from={0} to={2 * PI} color={C.second} h={4} y={-1.45} />
      <Curve p={p} f={fn} color={C.main} width={4} />
      <Seg p={p} a={[-8, m]} b={[8, m]} color={C.third} width={2.5} />
      {sols.map((x) => (
        <g key={x}>
          <Seg p={p} a={[x, 0]} b={[x, m]} color={C.good} dash="3 5" />
          <Pt p={p} x={x} y={m} color={x >= -1e-9 && x <= 2 * PI + 1e-9 ? C.good : C.ghost} r={6} />
        </g>
      ))}
      <InfoBox
        lines={[
          { text: `${isCos ? 'cos' : 'sin'} x = ${num(m)}`, color: C.third },
          Math.abs(m) > 1
            ? { text: `brak rozwiązań: |${isCos ? 'cos' : 'sin'} x| ≤ 1`, color: C.bad }
            : { text: `w ⟨0; 2π⟩: ${inMain.map((x) => `x ≈ ${num(x)}`).join(', ')}`, color: C.good },
          Math.abs(m) <= 1
            ? {
                text: isCos
                  ? `ogólnie: x = ±${num(base)} + 2kπ`
                  : `ogólnie: x = ${num(base)} + 2kπ  lub  x = ${num(PI - base)} + 2kπ`,
              }
            : { text: '' },
          { text: 'równanie ma nieskończenie wiele rozwiązań – powtarzają się co okres' },
        ]}
      />
    </Board>
  );
}

export const trigGraphs: Topic = {
  id: 'wykresy-trygonometryczne',
  title: 'Wykresy funkcji trygonometrycznych',
  subject: 'matematyka',
  summary: 'Amplituda, okres i przesunięcie sinusoidy, tangens z asymptotami i równania trygonometryczne odczytane z wykresu.',
  accent: '#ff7a8a',
  glyph: '∿',
  steps: [
    {
      title: 'Amplituda, okres, przesunięcie',
      kind: '2d',
      scene: SineScene,
      controls: [
        { type: 'slider', key: 'A', label: 'A (amplituda)', min: -3, max: 3, step: 0.1, default: 2 },
        { type: 'slider', key: 'B', label: 'B (częstość)', min: 0.3, max: 4, step: 0.05, default: 1 },
        { type: 'slider', key: 'C', label: 'C (przesunięcie)', min: -3.2, max: 3.2, step: 0.05, default: 0.8 },
        { type: 'slider', key: 'D', label: 'D (w pionie)', min: -2, max: 2, step: 0.1, default: 0 },
      ],
      body: (
        <>
          <div className="formula">f(x) = A · sin(B(x − C)) + D</div>
          <ul>
            <li>
              <strong>A</strong> – amplituda: jak wysoko sięgają grzbiety (żółta strzałka),
            </li>
            <li>
              <strong>B</strong> – ile drgań mieści się w 2π; okres T = 2π/B (zielony odcinek),
            </li>
            <li>
              <strong>C</strong> – przesunięcie w poziomie, <strong>D</strong> – w pionie (oś równowagi).
            </li>
          </ul>
          <p>Tak opisuje się drgania, fale dźwiękowe, prąd przemienny i długość dnia w ciągu roku.</p>
        </>
      ),
    },
    {
      title: 'Sinus, cosinus i tangens',
      kind: '2d',
      scene: FamilyScene,
      controls: [
        {
          type: 'select',
          key: 'f',
          label: 'Porównanie',
          default: 'sincos',
          options: [
            { value: 'sincos', label: 'sin i cos' },
            { value: 'tan', label: 'tangens' },
          ],
        },
        { type: 'slider', key: 'shift', label: 'Przesunięcie / punkt', min: -3, max: 3, step: 0.01, default: 0.6 },
      ],
      body: (
        <>
          <p>
            Cosinus to ten sam kształt co sinus, tylko <strong>przesunięty o π/2</strong> w lewo. Przesuń suwak do 1,57
            – wykresy się nałożą.
          </p>
          <p>
            Tangens to iloraz sin x / cos x. Tam, gdzie cosinus się zeruje, dzielimy przez zero – pojawiają się{' '}
            <strong>asymptoty pionowe</strong>. Okres tangensa jest dwa razy krótszy: π.
          </p>
        </>
      ),
    },
    {
      title: 'Równanie trygonometryczne',
      kind: '2d',
      scene: EquationScene,
      controls: [
        {
          type: 'select',
          key: 'f',
          label: 'Funkcja',
          default: 'sin',
          options: [
            { value: 'sin', label: 'sin x = m' },
            { value: 'cos', label: 'cos x = m' },
          ],
        },
        { type: 'slider', key: 'm', label: 'm', min: -1.4, max: 1.4, step: 0.01, default: 0.5 },
      ],
      body: (
        <>
          <p>
            Rozwiązania równania sin x = m to <strong>punkty przecięcia</strong> sinusoidy z poziomą prostą y = m.
          </p>
          <p>
            W jednym okresie ⟨0; 2π⟩ (niebieski pasek) są zwykle dwa rozwiązania – symetryczne względem grzbietu. Potem
            wszystko powtarza się co 2π, dlatego odpowiedź zapisujemy z „+ 2kπ”.
          </p>
          <p>Gdy |m| &gt; 1, prosta mija wykres – rozwiązań nie ma.</p>
        </>
      ),
    },
  ],
};
