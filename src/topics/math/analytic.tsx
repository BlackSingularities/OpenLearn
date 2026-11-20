import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { Board, C, Curve, Param, Poly, Pt, RightMark, Seg, num, squareFrame, usePlot } from '../../lib/mathkit';

type P = [number, number];

/* ---------- Krok 1: wektory ---------- */
function VectorScene({ params }: SceneProps) {
  const u: P = [Number(params.ux), Number(params.uy)];
  const v: P = [Number(params.vx), Number(params.vy)];
  const op = String(params.op);
  const p = usePlot(squareFrame(1.5, 1, 7));
  const sum: P = [u[0] + v[0], u[1] + v[1]];
  const diff: P = [u[0] - v[0], u[1] - v[1]];
  const k = Number(params.k);
  const len = (w: P) => Math.hypot(w[0], w[1]);
  const dot = u[0] * v[0] + u[1] * v[1];
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot / (len(u) * len(v) || 1)))) * 180) / Math.PI;
  return (
    <Board p={p}>
      {op === 'sum' && (
        <>
          <Poly p={p} pts={[[0, 0], u, sum, v]} color={C.ghost} fill="#fff" fillOpacity={0.04} width={1.5} dash="5 5" />
          <Seg p={p} a={u} b={sum} color={C.second} width={2} dash="5 5" arrow />
          <Seg p={p} a={[0, 0]} b={sum} color={C.third} width={4} arrow />
        </>
      )}
      {op === 'diff' && (
        <>
          <Seg p={p} a={v} b={u} color={C.third} width={4} arrow />
          <Seg p={p} a={[0, 0]} b={diff} color={C.third} width={2} dash="5 5" arrow />
        </>
      )}
      {op === 'scale' && <Seg p={p} a={[0, 0]} b={[u[0] * k, u[1] * k]} color={C.third} width={4} arrow />}
      <Seg p={p} a={[0, 0]} b={u} color={C.main} width={4} arrow />
      {op !== 'scale' && <Seg p={p} a={[0, 0]} b={v} color={C.second} width={4} arrow />}
      <InfoBox
        lines={[
          { text: `u = [${num(u[0])}; ${num(u[1])}],  |u| = ${num(len(u))}`, color: C.main },
          op !== 'scale' ? { text: `v = [${num(v[0])}; ${num(v[1])}],  |v| = ${num(len(v))}`, color: C.second } : { text: '' },
          op === 'sum'
            ? { text: `u + v = [${num(sum[0])}; ${num(sum[1])}]`, color: C.third }
            : op === 'diff'
              ? { text: `u − v = [${num(diff[0])}; ${num(diff[1])}] (od końca v do końca u)`, color: C.third }
              : { text: `${num(k)} · u = [${num(k * u[0])}; ${num(k * u[1])}],  długość ×${num(Math.abs(k))}`, color: C.third },
          op !== 'scale' ? { text: `iloczyn skalarny u·v = ${num(dot)}, kąt ≈ ${num(angle, 1)}°${Math.abs(dot) < 0.05 ? ' – prostopadłe!' : ''}` } : { text: k < 0 ? 'k < 0 – zwrot przeciwny' : '' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: odległość punktu od prostej ---------- */
function DistanceScene({ params }: SceneProps) {
  const A = Number(params.A);
  const B = Number(params.B);
  const Cc = Number(params.C);
  const P0: P = [Number(params.px), Number(params.py)];
  const p = usePlot(squareFrame(0, 0, 8));
  const norm = Math.hypot(A, B) || 1;
  const val = A * P0[0] + B * P0[1] + Cc;
  const d = Math.abs(val) / norm;
  const foot: P = [P0[0] - (A * val) / (norm * norm), P0[1] - (B * val) / (norm * norm)];
  const fr = p.frame;
  const lineSeg = (): [P, P] => {
    if (Math.abs(B) > 1e-6) return [[fr.xMin, (-Cc - A * fr.xMin) / B], [fr.xMax, (-Cc - A * fr.xMax) / B]];
    return [[-Cc / A, fr.yMin], [-Cc / A, fr.yMax]];
  };
  const [L1, L2] = lineSeg();
  return (
    <Board p={p}>
      <Seg p={p} a={L1} b={L2} color={C.main} width={4} />
      <Seg p={p} a={P0} b={foot} color={C.third} width={3} dash="6 5" />
      <RightMark p={p} v={foot} a={Math.atan2(P0[1] - foot[1], P0[0] - foot[0])} s={0.4} color={C.third} />
      <Seg p={p} a={foot} b={[foot[0] + (A / norm) * 1.5, foot[1] + (B / norm) * 1.5]} color={C.second} width={2.5} arrow />
      <Pt p={p} x={P0[0]} y={P0[1]} color={C.third} />
      <Pt p={p} x={foot[0]} y={foot[1]} color={C.good} r={5} />
      <InfoBox
        lines={[
          { text: `l: ${num(A)}x ${B >= 0 ? '+' : '−'} ${num(Math.abs(B))}y ${Cc >= 0 ? '+' : '−'} ${num(Math.abs(Cc))} = 0`, color: C.main },
          { text: `P = (${num(P0[0])}; ${num(P0[1])})`, color: C.third },
          { text: `d = |Ax₀ + By₀ + C| / √(A² + B²) = ${num(Math.abs(val))} / ${num(norm)} = ${num(d)}`, color: C.third },
          { text: `wektor normalny [A; B] = [${num(A)}; ${num(B)}] jest prostopadły do prostej`, color: C.second },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: okrąg i prosta ---------- */
function CircleLineScene({ params }: SceneProps) {
  const a = Number(params.a);
  const b = Number(params.b);
  const r = Number(params.r);
  const m = Number(params.m);
  const k = Number(params.k);
  const p = usePlot(squareFrame(0, 0, 8));
  // odległość środka od prostej mx − y + k = 0
  const d = Math.abs(m * a - b + k) / Math.hypot(m, 1);
  // przecięcia: (x−a)² + (mx + k − b)² = r²
  const A2 = 1 + m * m;
  const B2 = -2 * a + 2 * m * (k - b);
  const C2 = a * a + (k - b) ** 2 - r * r;
  const D = B2 * B2 - 4 * A2 * C2;
  const xs = D < 0 ? [] : D < 1e-6 ? [-B2 / (2 * A2)] : [(-B2 - Math.sqrt(D)) / (2 * A2), (-B2 + Math.sqrt(D)) / (2 * A2)];
  const kind = Math.abs(d - r) < 0.04 ? 'styczna' : d < r ? 'sieczna' : 'rozłączna';
  const foot: P = (() => {
    const val = m * a - b + k;
    const n2 = m * m + 1;
    return [a - (m * val) / n2, b + val / n2];
  })();
  return (
    <Board p={p}>
      <Param p={p} fx={(t) => a + r * Math.cos(t)} fy={(t) => b + r * Math.sin(t)} t0={0} t1={2 * Math.PI} color={C.second} width={4} fill={C.second} fillOpacity={0.08} />
      <Curve p={p} f={(x) => m * x + k} color={C.main} width={4} />
      <Seg p={p} a={[a, b]} b={foot} color={C.third} width={2.5} dash="5 5" />
      <Pt p={p} x={a} y={b} color={C.second} r={5} />
      {xs.map((x) => (
        <Pt key={x} p={p} x={x} y={m * x + k} color={C.good} />
      ))}
      <InfoBox
        lines={[
          { text: `(x ${a >= 0 ? '−' : '+'} ${num(Math.abs(a))})² + (y ${b >= 0 ? '−' : '+'} ${num(Math.abs(b))})² = ${num(r * r)}`, color: C.second },
          { text: `y = ${num(m)}x ${k >= 0 ? '+' : '−'} ${num(Math.abs(k))}`, color: C.main },
          { text: `odległość środka od prostej d = ${num(d)},  r = ${num(r)}`, color: C.third },
          { text: `prosta ${kind}: ${kind === 'sieczna' ? 'd < r, dwa punkty wspólne' : kind === 'styczna' ? 'd = r, jeden punkt wspólny' : 'd > r, brak punktów wspólnych'}`, color: kind === 'rozłączna' ? C.bad : C.good },
        ]}
      />
    </Board>
  );
}

export const analytic: Topic = {
  id: 'geometria-analityczna',
  title: 'Geometria analityczna',
  subject: 'matematyka',
  summary: 'Wektory i działania na nich, odległość punktu od prostej oraz wzajemne położenie okręgu i prostej w układzie współrzędnych.',
  accent: '#f76d6d',
  glyph: '⃗',
  steps: [
    {
      title: 'Wektory w układzie współrzędnych',
      kind: '2d',
      scene: VectorScene,
      controls: [
        {
          type: 'select',
          key: 'op',
          label: 'Działanie',
          default: 'sum',
          options: [
            { value: 'sum', label: 'u + v' },
            { value: 'diff', label: 'u − v' },
            { value: 'scale', label: 'k · u' },
          ],
        },
        { type: 'slider', key: 'ux', label: 'uₓ', min: -5, max: 5, step: 0.5, default: 4 },
        { type: 'slider', key: 'uy', label: 'u_y', min: -4, max: 4, step: 0.5, default: 1 },
        { type: 'slider', key: 'vx', label: 'vₓ', min: -5, max: 5, step: 0.5, default: 1 },
        { type: 'slider', key: 'vy', label: 'v_y', min: -4, max: 4, step: 0.5, default: 3 },
        { type: 'slider', key: 'k', label: 'k', min: -2, max: 2.5, step: 0.1, default: 1.5 },
      ],
      body: (
        <>
          <div className="formula">u + v = [uₓ + vₓ; u_y + v_y]    |u| = √(uₓ² + u_y²)</div>
          <p>
            Wektor to <strong>przesunięcie</strong>: ile w prawo i ile w górę. Wektory dodajemy, doklejając jeden na
            koniec drugiego – albo po przekątnej równoległoboku.
          </p>
          <p>
            Iloczyn skalarny u·v = uₓvₓ + u_yv_y mówi o kącie między wektorami. Gdy wynosi 0, wektory są{' '}
            <strong>prostopadłe</strong> – spróbuj ustawić u = [4; 1] i v = [−1; 4].
          </p>
        </>
      ),
    },
    {
      title: 'Odległość punktu od prostej',
      kind: '2d',
      scene: DistanceScene,
      controls: [
        { type: 'slider', key: 'A', label: 'A', min: -3, max: 3, step: 0.1, default: 1 },
        { type: 'slider', key: 'B', label: 'B', min: -3, max: 3, step: 0.1, default: 2 },
        { type: 'slider', key: 'C', label: 'C', min: -6, max: 6, step: 0.1, default: -2 },
        { type: 'slider', key: 'px', label: 'x₀', min: -7, max: 7, step: 0.1, default: 3 },
        { type: 'slider', key: 'py', label: 'y₀', min: -4, max: 4, step: 0.1, default: 3 },
      ],
      body: (
        <>
          <div className="formula">d = |Ax₀ + By₀ + C| / √(A² + B²)</div>
          <p>
            Prosta w <strong>postaci ogólnej</strong> Ax + By + C = 0 ukrywa wektor normalny [A; B] – prostopadły do
            prostej (niebieska strzałka).
          </p>
          <p>
            Odległość to długość odcinka prostopadłego, czyli najkrótsza droga z punktu do prostej. Podstawiając punkt do
            lewej strony równania, dostajemy „jak bardzo” nie spełnia on równania; dzielenie przez długość wektora
            normalnego zamienia to na prawdziwą odległość.
          </p>
        </>
      ),
    },
    {
      title: 'Okrąg i prosta',
      kind: '2d',
      scene: CircleLineScene,
      controls: [
        { type: 'slider', key: 'a', label: 'Środek: a', min: -4, max: 4, step: 0.1, default: 1 },
        { type: 'slider', key: 'b', label: 'Środek: b', min: -3, max: 3, step: 0.1, default: 0.5 },
        { type: 'slider', key: 'r', label: 'Promień r', min: 0.5, max: 4, step: 0.05, default: 2.5 },
        { type: 'slider', key: 'm', label: 'Nachylenie prostej', min: -3, max: 3, step: 0.05, default: 0.5 },
        { type: 'slider', key: 'k', label: 'Wyraz wolny prostej', min: -6, max: 6, step: 0.05, default: 2.5 },
      ],
      body: (
        <>
          <div className="formula">(x − a)² + (y − b)² = r²</div>
          <p>
            Okrąg to zbiór punktów odległych o r od środka (a; b) – równanie to po prostu twierdzenie Pitagorasa.
          </p>
          <p>
            O tym, czy prosta jest <strong>sieczną, styczną czy rozłączną</strong>, decyduje porównanie odległości
            środka od prostej z promieniem. Przesuń prostą tak, żeby stała się styczna: d = r i punkty przecięcia
            zlewają się w jeden.
          </p>
        </>
      ),
    },
  ],
};
