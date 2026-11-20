import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { Board, C, Curve, Poly, Pt, Seg, num, squareFrame, usePlot } from '../../lib/mathkit';

/* ---------- Krok 1: proporcjonalność odwrotna ---------- */
function InverseScene({ params }: SceneProps) {
  const a = Number(params.a);
  const x = Number(params.x);
  const p = usePlot(squareFrame(3.5, 2.5, 4.5));
  const y = a / x;
  return (
    <Board p={p}>
      {[1, 2, 4, 8].map((k) => (
        <Curve key={k} p={p} f={(t) => k / t} from={0.05} color={C.ghost} width={1.2} dash="4 6" />
      ))}
      <Poly p={p} pts={[[0, 0], [x, 0], [x, y], [0, y]]} color={C.third} fill={C.third} fillOpacity={0.18} />
      <Curve p={p} f={(t) => a / t} from={0.05} color={C.main} width={4} />
      <Pt p={p} x={x} y={y} color={C.main} />
      <InfoBox
        lines={[
          { text: `y = ${num(a)} / x`, color: C.main },
          { text: `x = ${num(x)}, y = ${num(y)}` },
          { text: `pole prostokąta: x · y = ${num(x * y)} = a`, color: C.third },
          { text: 'x rośnie 2 razy → y maleje 2 razy' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: funkcja homograficzna ---------- */
function HomographicScene({ params }: SceneProps) {
  const a = Number(params.a);
  const pp = Number(params.p);
  const q = Number(params.q);
  const p = usePlot(squareFrame(0, 0, 8));
  const f = (x: number) => a / (x - pp) + q;
  const fr = p.frame;
  const x0 = Math.abs(q) > 1e-9 ? pp - a / q : NaN;
  return (
    <Board p={p}>
      <Curve p={p} f={(x) => a / x} color={C.ghost} width={1.5} dash="5 6" />
      <Seg p={p} a={[pp, fr.yMin]} b={[pp, fr.yMax]} color={C.second} width={2.5} dash="8 6" />
      <Seg p={p} a={[fr.xMin, q]} b={[fr.xMax, q]} color={C.second} width={2.5} dash="8 6" />
      <Curve p={p} f={f} color={C.main} width={4} n={600} />
      <Pt p={p} x={pp} y={q} color={C.second} r={5} />
      {Number.isFinite(x0) && Math.abs(x0) < 8 && <Pt p={p} x={x0} y={0} color={C.good} />}
      {Math.abs(pp) > 0.05 && Math.abs(f(0)) < 5 && <Pt p={p} x={0} y={f(0)} color={C.third} />}
      <InfoBox
        lines={[
          { text: `f(x) = ${num(a)} / (x ${pp >= 0 ? '−' : '+'} ${num(Math.abs(pp))}) ${q >= 0 ? '+' : '−'} ${num(Math.abs(q))}`, color: C.main },
          { text: `asymptoty: x = ${num(pp)} i y = ${num(q)}`, color: C.second },
          { text: `dziedzina: ℝ \\ {${num(pp)}},  zbiór wartości: ℝ \\ {${num(q)}}` },
          { text: Number.isFinite(x0) ? `miejsce zerowe: x = ${num(x0)}` : 'brak miejsc zerowych', color: C.good },
          { text: a > 0 ? 'a > 0: gałęzie w I i III ćwiartce (względem asymptot), malejąca w przedziałach' : 'a < 0: gałęzie w II i IV ćwiartce, rosnąca w przedziałach' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: równanie wymierne graficznie ---------- */
function EquationScene({ params }: SceneProps) {
  const m = Number(params.m);
  const b = Number(params.b);
  const p = usePlot(squareFrame(0, 0, 8));
  const f = (x: number) => 4 / x;
  const g = (x: number) => m * x + b;
  // 4/x = mx + b  →  m x² + b x − 4 = 0
  let sols: number[] = [];
  if (Math.abs(m) < 1e-9) sols = Math.abs(b) > 1e-9 ? [4 / b] : [];
  else {
    const D = b * b + 16 * m;
    if (D >= 0) sols = [(-b - Math.sqrt(D)) / (2 * m), (-b + Math.sqrt(D)) / (2 * m)].filter((x, i, arr) => i === 0 || Math.abs(x - arr[0]) > 1e-6);
  }
  sols = sols.filter((x) => Math.abs(x) > 1e-9);
  return (
    <Board p={p}>
      <Curve p={p} f={f} color={C.main} width={4} n={600} />
      <Curve p={p} f={g} color={C.second} width={3.5} />
      {sols.map((x) => (
        <g key={x}>
          <Seg p={p} a={[x, 0]} b={[x, f(x)]} color={C.third} dash="4 5" />
          <Pt p={p} x={x} y={f(x)} color={C.third} r={7} />
        </g>
      ))}
      <InfoBox
        lines={[
          { text: '4 / x = ' + `${num(m)}x ${b >= 0 ? '+' : '−'} ${num(Math.abs(b))}`, color: C.main },
          { text: `po pomnożeniu przez x: ${num(m)}x² ${b >= 0 ? '+' : '−'} ${num(Math.abs(b))}x − 4 = 0  (x ≠ 0)` },
          { text: sols.length ? `rozwiązania: ${sols.map((x) => `x = ${num(x)}`).join(', ')}` : 'brak rozwiązań – wykresy się nie przecinają', color: C.third },
        ]}
      />
    </Board>
  );
}

export const rational: Topic = {
  id: 'funkcja-wymierna',
  title: 'Funkcja wymierna i hiperbola',
  subject: 'matematyka',
  summary: 'Proporcjonalność odwrotna jako prostokąty o stałym polu, asymptoty funkcji homograficznej i równania wymierne na wykresie.',
  accent: '#f25f7a',
  glyph: '1/x',
  steps: [
    {
      title: 'Proporcjonalność odwrotna',
      kind: '2d',
      scene: InverseScene,
      controls: [
        { type: 'slider', key: 'a', label: 'Współczynnik a', min: 0.5, max: 8, step: 0.1, default: 4 },
        { type: 'slider', key: 'x', label: 'x', min: 0.4, max: 7.5, step: 0.05, default: 2 },
      ],
      body: (
        <>
          <div className="formula">y = a / x   ⇔   x · y = a</div>
          <p>
            Wielkości są <strong>odwrotnie proporcjonalne</strong>, gdy ich iloczyn jest stały: dwa razy więcej robotników
            – dwa razy krócej trwa praca.
          </p>
          <p>
            Przesuwaj punkt po wykresie: żółty prostokąt zmienia kształt, ale jego <strong>pole zawsze wynosi a</strong>.
            Wykres to hiperbola, która zbliża się do osi, ale nigdy ich nie dotyka.
          </p>
        </>
      ),
    },
    {
      title: 'Funkcja homograficzna i asymptoty',
      kind: '2d',
      scene: HomographicScene,
      controls: [
        { type: 'slider', key: 'a', label: 'a', min: -6, max: 6, step: 0.1, default: 3 },
        { type: 'slider', key: 'p', label: 'p (asymptota pionowa)', min: -5, max: 5, step: 0.1, default: 2 },
        { type: 'slider', key: 'q', label: 'q (asymptota pozioma)', min: -4, max: 4, step: 0.1, default: -1 },
      ],
      body: (
        <>
          <div className="formula">f(x) = a / (x − p) + q</div>
          <p>
            To hiperbola y = a/x przesunięta o wektor [p; q]. Razem z nią przesuwają się{' '}
            <strong>asymptoty</strong>: pionowa x = p (tam funkcja nie istnieje) i pozioma y = q (tej wartości funkcja
            nigdy nie przyjmuje).
          </p>
          <p>
            Każdy ułamek (ax + b)/(cx + d) da się sprowadzić do tej postaci, wydzielając całości – wtedy od razu widać
            asymptoty, dziedzinę i zbiór wartości.
          </p>
        </>
      ),
    },
    {
      title: 'Równanie wymierne na wykresie',
      kind: '2d',
      scene: EquationScene,
      controls: [
        { type: 'slider', key: 'm', label: 'Nachylenie prostej', min: -2, max: 2, step: 0.05, default: -0.5 },
        { type: 'slider', key: 'b', label: 'Wyraz wolny prostej', min: -6, max: 6, step: 0.1, default: 3 },
      ],
      body: (
        <>
          <p>
            Równanie 4/x = mx + b rozwiązujemy, mnożąc obie strony przez x – pamiętając o <strong>założeniu x ≠ 0</strong>.
            Wychodzi równanie kwadratowe.
          </p>
          <p>
            Na wykresie rozwiązania to <strong>punkty przecięcia</strong> hiperboli z prostą. Przesuń prostą tak, żeby
            była styczna – wtedy Δ = 0 i jest jedno rozwiązanie.
          </p>
        </>
      ),
    },
  ],
};
