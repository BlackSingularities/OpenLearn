import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { Band, Board, C, Curve, Label, Pt, num, squareFrame, usePlot } from '../../lib/mathkit';

const F = squareFrame(0, 0, 7);

type Root = { x: number; k: number };

/** Wielomian w postaci iloczynowej, przeskalowany tak, żeby mieścił się w kadrze. */
function build(roots: Root[], sign: number) {
  const raw = (x: number) => roots.reduce((acc, r) => acc * Math.pow(x - r.x, r.k), sign);
  let max = 0;
  for (let x = -6.5; x <= 6.5; x += 0.05) max = Math.max(max, Math.abs(raw(x)));
  const xs = roots.map((r) => r.x);
  let local = 0;
  for (let x = Math.min(...xs) - 0.5; x <= Math.max(...xs) + 0.5; x += 0.02) local = Math.max(local, Math.abs(raw(x)));
  const scale = 3.2 / Math.max(local, 1e-6);
  return { f: (x: number) => raw(x) * scale, scale, max };
}

const factor = (r: Root) => {
  const inside = Math.abs(r.x) < 1e-9 ? 'x' : r.x > 0 ? `(x − ${num(r.x)})` : `(x + ${num(-r.x)})`;
  return r.k > 1 ? `${inside}${'⁰¹²³⁴⁵'[r.k]}` : inside;
};

function rootsFrom(params: SceneProps['params']): Root[] {
  return [
    { x: Number(params.x1), k: Number(params.k1) },
    { x: Number(params.x2), k: 1 },
    { x: Number(params.x3), k: 1 },
  ];
}

/* ---------- Krok 1: pierwiastki i krotność ---------- */
function RootsScene({ params }: SceneProps) {
  const roots = rootsFrom(params);
  const sign = params.neg ? -1 : 1;
  const { f } = build(roots, sign);
  const p = usePlot(F);
  const deg = roots.reduce((n, r) => n + r.k, 0);
  return (
    <Board p={p}>
      <Curve p={p} f={f} color={C.main} width={4} />
      {roots.map((r, i) => (
        <Pt key={i} p={p} x={r.x} y={0} color={r.k === 1 ? C.second : r.k === 2 ? C.third : C.good} r={r.k === 1 ? 6 : 8} />
      ))}
      <InfoBox
        lines={[
          { text: `W(x) = ${sign < 0 ? '−' : ''}a·${roots.map(factor).join('')}`, color: C.main },
          { text: `stopień ${deg}, współczynnik przy x^${deg} ${sign > 0 ? 'dodatni' : 'ujemny'}` },
          { text: `x₁ = ${num(roots[0].x)} – krotność ${roots[0].k}: ${roots[0].k % 2 === 0 ? 'wykres odbija się od osi' : roots[0].k === 3 ? 'przecina, spłaszczając się' : 'przecina oś'}`, color: roots[0].k === 1 ? C.second : roots[0].k === 2 ? C.third : C.good },
          { text: `x₂ = ${num(roots[1].x)}, x₃ = ${num(roots[2].x)} – pierwiastki jednokrotne`, color: C.second },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: nierówność – „wężyk” ---------- */
function SnakeScene({ params }: SceneProps) {
  const roots = rootsFrom(params);
  const sign = params.neg ? -1 : 1;
  const gt = String(params.sign) === '>';
  const { f } = build(roots, sign);
  const p = usePlot(F);
  const xs = [...new Set(roots.map((r) => +r.x.toFixed(4)))].sort((a, b) => a - b);
  const edges = [-99, ...xs, 99];
  const intervals = edges.slice(0, -1).map((a, i) => {
    const b = edges[i + 1];
    const mid = a === -99 ? b - 1 : b === 99 ? a + 1 : (a + b) / 2;
    const v = f(mid);
    return { a, b, mid, pos: v > 0, ok: gt ? v > 0 : v < 0 };
  });
  const sol = intervals
    .filter((iv) => iv.ok)
    .map((iv) => `(${iv.a === -99 ? '−∞' : num(iv.a)}; ${iv.b === 99 ? '+∞' : num(iv.b)})`)
    .join(' ∪ ');
  return (
    <Board p={p}>
      {intervals.map((iv, i) =>
        iv.ok ? <path key={i} d={p.area(f, Math.max(iv.a, -9), Math.min(iv.b, 9))} fill={C.good} opacity={0.16} /> : null,
      )}
      <Curve p={p} f={f} color={C.main} width={4} />
      {intervals.map((iv, i) => (
        <g key={`b${i}`}>
          {iv.ok && <Band p={p} from={iv.a} to={iv.b} color={C.good} h={10} />}
          {Math.abs(iv.mid) < 6.5 && (
            <Label p={p} x={Math.max(-6.3, Math.min(6.3, iv.mid))} y={0} dy={iv.pos ? -16 : 30} color={iv.pos ? C.good : C.bad} size={20}>
              {iv.pos ? '+' : '−'}
            </Label>
          )}
        </g>
      ))}
      {xs.map((x) => (
        <circle key={x} cx={p.sx(x)} cy={p.sy(0)} r="7" fill="#0b0d12" stroke={C.third} strokeWidth="3" />
      ))}
      <InfoBox
        lines={[
          { text: `W(x) ${gt ? '>' : '<'} 0`, color: C.main },
          { text: `x ∈ ${sol || '∅'}`, color: C.good },
          { text: roots[0].k % 2 === 0 ? `przy x₁ = ${num(roots[0].x)} znak się NIE zmienia (krotność parzysta)` : 'przy każdym pierwiastku znak się zmienia', color: C.third },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: stopień i końce wykresu ---------- */
const SHAPES: Record<number, number[]> = {
  1: [0.5],
  2: [-2, 2.5],
  3: [-3, 0.5, 3.5],
  4: [-3.5, -1, 1.5, 4],
  5: [-4, -2, 0, 2, 4],
  6: [-4.5, -3, -1, 0.5, 2.5, 4.5],
};
function DegreeScene({ params }: SceneProps) {
  const n = Number(params.n);
  const sign = params.neg ? -1 : 1;
  const roots = (SHAPES[n] ?? SHAPES[3]).map((x) => ({ x, k: 1 }));
  const { f } = build(roots, sign);
  const p = usePlot(F);
  const left = (n % 2 === 0 ? 1 : -1) * sign;
  return (
    <Board p={p}>
      <Curve p={p} f={(x) => sign * Math.pow(x / 2.2, n)} color={C.ghost} width={2} dash="5 6" />
      <Curve key={n} p={p} f={f} color={C.main} width={4} draw />
      <InfoBox
        lines={[
          { text: `stopień n = ${n}, a${'ₙ'} ${sign > 0 ? '> 0' : '< 0'}`, color: C.main },
          { text: `lewy koniec: ${left > 0 ? 'w górę ↖' : 'w dół ↙'},  prawy koniec: ${sign > 0 ? 'w górę ↗' : 'w dół ↘'}`, color: C.third },
          { text: `co najwyżej ${n} miejsc zerowych i ${n - 1} „zakrętów”` },
          { text: n % 2 ? 'stopień nieparzysty → zawsze co najmniej jedno miejsce zerowe' : '' , color: C.second },
        ]}
      />
    </Board>
  );
}

const rootControls = [
  { type: 'slider' as const, key: 'x1', label: 'x₁', min: -5, max: 5, step: 0.1, default: -2 },
  {
    type: 'select' as const,
    key: 'k1',
    label: 'Krotność x₁',
    default: '2',
    options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
    ],
  },
  { type: 'slider' as const, key: 'x2', label: 'x₂', min: -5, max: 5, step: 0.1, default: 1 },
  { type: 'slider' as const, key: 'x3', label: 'x₃', min: -5, max: 5, step: 0.1, default: 3.5 },
  { type: 'toggle' as const, key: 'neg', label: 'Ujemny współczynnik a', default: false },
];

export const polynomials: Topic = {
  id: 'wielomiany',
  title: 'Wielomiany',
  subject: 'matematyka',
  summary: 'Pierwiastki i ich krotność, metoda „wężyka” w nierównościach i to, jak stopień decyduje o końcach wykresu.',
  accent: '#e8475f',
  glyph: 'xⁿ',
  steps: [
    {
      title: 'Pierwiastki i krotność',
      kind: '2d',
      scene: RootsScene,
      controls: rootControls,
      body: (
        <>
          <div className="formula">W(x) = a(x − x₁)ᵏ(x − x₂)(x − x₃)</div>
          <p>
            Z <strong>postaci iloczynowej</strong> od razu widać miejsca zerowe: każdy nawias zeruje się w swoim
            pierwiastku.
          </p>
          <p>
            <strong>Krotność</strong> to wykładnik przy nawiasie. Pierwiastek jednokrotny – wykres przecina oś.
            Dwukrotny – wykres tylko dotyka osi i zawraca. Trzykrotny – przecina, ale spłaszcza się jak x³.
          </p>
          <p>Zmień krotność x₁ i zobacz, co dzieje się z wykresem w tym punkcie.</p>
        </>
      ),
    },
    {
      title: 'Nierówności – metoda „wężyka”',
      kind: '2d',
      scene: SnakeScene,
      controls: [
        ...rootControls,
        {
          type: 'select',
          key: 'sign',
          label: 'Nierówność',
          default: '>',
          options: [
            { value: '>', label: 'W(x) > 0' },
            { value: '<', label: 'W(x) < 0' },
          ],
        },
      ],
      body: (
        <>
          <p>Żeby rozwiązać W(x) &gt; 0, nie trzeba liczyć wartości – wystarczy szkic:</p>
          <ol>
            <li>zaznacz pierwiastki na osi,</li>
            <li>zacznij z prawej strony: nad osią, jeśli a &gt; 0, pod osią, jeśli a &lt; 0,</li>
            <li>przy pierwiastku nieparzystej krotności przejdź na drugą stronę, przy parzystej – odbij się.</li>
          </ol>
          <p>Znaki + i − nad osią pokazują, gdzie wielomian jest dodatni. Zielony pasek to rozwiązanie.</p>
        </>
      ),
    },
    {
      title: 'Stopień i końce wykresu',
      kind: '2d',
      scene: DegreeScene,
      controls: [
        { type: 'slider', key: 'n', label: 'Stopień n', min: 1, max: 6, step: 1, default: 3 },
        { type: 'toggle', key: 'neg', label: 'Ujemny współczynnik przy xⁿ', default: false },
      ],
      body: (
        <>
          <p>
            Daleko od początku układu liczy się tylko <strong>najwyższa potęga</strong>: wykres zachowuje się jak axⁿ
            (przerywana linia).
          </p>
          <ul>
            <li>stopień parzysty – oba końce w tę samą stronę,</li>
            <li>stopień nieparzysty – końce w przeciwne strony, więc wykres musi przeciąć oś x.</li>
          </ul>
          <p>Wielomian stopnia n ma najwyżej n miejsc zerowych i najwyżej n − 1 ekstremów.</p>
        </>
      ),
    },
  ],
};
