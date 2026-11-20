import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import type { Plot } from '../../lib/plot';
import { AngleArc, Board, C, Label, Param, Poly, Pt, RightMark, Seg, num, squareFrame, usePlot } from '../../lib/mathkit';

type P = [number, number];
const R = 3.2;
const D2R = Math.PI / 180;
const on = (deg: number): P => [R * Math.cos(deg * D2R), R * Math.sin(deg * D2R)];

/** Kąt wewnętrzny przy V między ramionami do X i Y: łuk + wartość w stopniach. */
function Corner({ p, V, X, Y, color, r = 0.7, label = true }: { p: Plot; V: P; X: P; Y: P; color: string; r?: number; label?: boolean }) {
  const ax = Math.atan2(X[1] - V[1], X[0] - V[0]);
  const ay = Math.atan2(Y[1] - V[1], Y[0] - V[0]);
  let span = ay - ax;
  while (span < 0) span += 2 * Math.PI;
  const [a0, a1] = span <= Math.PI ? [ax, ay] : [ay, ax];
  const deg = Math.min(span, 2 * Math.PI - span) / D2R;
  const mid = a0 + (Math.min(span, 2 * Math.PI - span)) / 2;
  return (
    <g>
      <AngleArc p={p} v={V} a0={a0} a1={a1} r={r} color={color} />
      {label && (
        <Label p={p} x={V[0] + Math.cos(mid) * (r + 0.55)} y={V[1] + Math.sin(mid) * (r + 0.55)} dy={5} color={color} size={15}>
          {num(deg, 0)}°
        </Label>
      )}
    </g>
  );
}

function Circle({ p }: { p: Plot }) {
  return <Param p={p} fx={(t) => R * Math.cos(t)} fy={(t) => R * Math.sin(t)} t0={0} t1={2 * Math.PI} color="rgba(255,255,255,0.55)" width={2} />;
}

const frame = squareFrame(0, 0, 6.2);

/* ---------- Krok 1: kąt wpisany i środkowy ---------- */
function InscribedScene({ params }: SceneProps) {
  const theta = Number(params.theta);
  const count = Number(params.count);
  const pos = Number(params.pos);
  const p = usePlot(frame);
  const aDeg = 270 - theta / 2;
  const bDeg = 270 + theta / 2;
  const A = on(aDeg);
  const B = on(bDeg);
  const O: P = [0, 0];
  const majorStart = bDeg;
  const majorSpan = 360 - theta;
  const points = Array.from({ length: count }, (_, i) => {
    const f = count === 1 ? pos : 0.12 + ((0.76 * i) / Math.max(1, count - 1) + pos * 0.3 - 0.15);
    return on(majorStart + majorSpan * Math.min(0.97, Math.max(0.03, f)));
  });
  return (
    <Board p={p} axes={false}>
      <Circle p={p} />
      <Param p={p} fx={(t) => R * Math.cos(t)} fy={(t) => R * Math.sin(t)} t0={aDeg * D2R} t1={bDeg * D2R} color={C.good} width={6} />
      <Seg p={p} a={O} b={A} color={C.second} width={3} />
      <Seg p={p} a={O} b={B} color={C.second} width={3} />
      <Corner p={p} V={O} X={A} Y={B} color={C.second} r={0.8} />
      {points.map((P0, i) => (
        <g key={i}>
          <Seg p={p} a={P0} b={A} color={C.main} width={2.5} />
          <Seg p={p} a={P0} b={B} color={C.main} width={2.5} />
          <Corner p={p} V={P0} X={A} Y={B} color={C.main} r={0.65} label={i === 0 || count <= 3} />
          <Pt p={p} x={P0[0]} y={P0[1]} color={C.main} r={5} />
        </g>
      ))}
      <Pt p={p} x={0} y={0} color={C.second} r={5} />
      <Pt p={p} x={A[0]} y={A[1]} color={C.good} r={5} />
      <Pt p={p} x={B[0]} y={B[1]} color={C.good} r={5} />
      <InfoBox
        lines={[
          { text: `kąt środkowy ∢AOB = ${num(theta, 0)}°`, color: C.second },
          { text: `kąt wpisany ∢APB = ${num(theta / 2, 1)}°`, color: C.main },
          { text: 'kąt wpisany = połowa kąta środkowego', color: C.good },
          { text: count > 1 ? 'wszystkie kąty oparte na tym samym łuku są równe' : '' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: twierdzenie Talesa ---------- */
function ThalesScene({ params }: SceneProps) {
  const pos = Number(params.pos);
  const p = usePlot(frame);
  const A = on(180);
  const B = on(0);
  const P0 = on(pos);
  const O: P = [0, 0];
  return (
    <Board p={p} axes={false}>
      <Circle p={p} />
      <Seg p={p} a={A} b={B} color={C.second} width={4} />
      <Seg p={p} a={O} b={P0} color={C.ghost} width={2} dash="4 5" />
      <Poly p={p} pts={[A, B, P0]} color={C.main} fill={C.main} fillOpacity={0.1} width={3} />
      <RightMark p={p} v={P0} a={Math.atan2(A[1] - P0[1], A[0] - P0[0])} s={0.45} color={C.third} />
      <Corner p={p} V={A} X={B} Y={P0} color={C.good} r={0.9} />
      <Corner p={p} V={B} X={A} Y={P0} color={C.good} r={0.9} />
      <Pt p={p} x={P0[0]} y={P0[1]} color={C.main} />
      <Pt p={p} x={0} y={0} color={C.second} r={5} />
      <InfoBox
        lines={[
          { text: 'AB – średnica okręgu', color: C.second },
          { text: '∢APB = 90°, gdziekolwiek leży P', color: C.third },
          { text: 'kąt środkowy to 180°, więc wpisany = 180° / 2' },
          { text: 'trójkąty AOP i BOP są równoramienne (OA = OP = OB)', color: 'rgba(255,255,255,0.6)' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: czworokąt wpisany ---------- */
function QuadScene({ params }: SceneProps) {
  const p = usePlot(frame);
  const angs = [Number(params.a), Number(params.b), Number(params.c), Number(params.d)];
  const sorted = [...angs].sort((x, y) => x - y);
  const [A, B, Cq, D] = sorted.map(on);
  const ang = (V: P, X: P, Y: P) => {
    const u = [X[0] - V[0], X[1] - V[1]];
    const w = [Y[0] - V[0], Y[1] - V[1]];
    return Math.acos((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]))) / D2R;
  };
  const alpha = ang(A, D, B);
  const gamma = ang(Cq, B, D);
  const beta = ang(B, A, Cq);
  const delta = ang(D, Cq, A);
  return (
    <Board p={p} axes={false}>
      <Circle p={p} />
      <Poly p={p} pts={[A, B, Cq, D]} color="rgba(255,255,255,0.7)" fill="#fff" fillOpacity={0.05} width={3} />
      <Corner p={p} V={A} X={D} Y={B} color={C.main} />
      <Corner p={p} V={Cq} X={B} Y={D} color={C.main} />
      <Corner p={p} V={B} X={A} Y={Cq} color={C.second} />
      <Corner p={p} V={D} X={Cq} Y={A} color={C.second} />
      {[A, B, Cq, D].map((q, i) => (
        <Pt key={i} p={p} x={q[0]} y={q[1]} color={i % 2 ? C.second : C.main} r={5} />
      ))}
      <InfoBox
        lines={[
          { text: `α + γ = ${num(alpha, 0)}° + ${num(gamma, 0)}° = ${num(alpha + gamma, 0)}°`, color: C.main },
          { text: `β + δ = ${num(beta, 0)}° + ${num(delta, 0)}° = ${num(beta + delta, 0)}°`, color: C.second },
          { text: 'przeciwległe kąty czworokąta wpisanego sumują się do 180°' },
        ]}
      />
    </Board>
  );
}

export const circleAngles: Topic = {
  id: 'katy-w-okregu',
  title: 'Kąty w okręgu',
  subject: 'matematyka',
  summary: 'Kąt wpisany i środkowy, twierdzenie Talesa i czworokąt wpisany – przesuwaj punkty po okręgu i patrz, co się nie zmienia.',
  accent: '#f0535b',
  glyph: '◔',
  steps: [
    {
      title: 'Kąt wpisany i środkowy',
      kind: '2d',
      scene: InscribedScene,
      controls: [
        { type: 'slider', key: 'theta', label: 'Kąt środkowy', min: 20, max: 300, step: 1, default: 110, unit: '°' },
        { type: 'slider', key: 'pos', label: 'Położenie P', min: 0, max: 1, step: 0.01, default: 0.5, decimals: 2 },
        { type: 'slider', key: 'count', label: 'Liczba kątów wpisanych', min: 1, max: 5, step: 1, default: 1 },
      ],
      body: (
        <>
          <div className="formula">∢APB = ½ · ∢AOB</div>
          <p>
            <strong>Kąt środkowy</strong> ma wierzchołek w środku okręgu, <strong>kąt wpisany</strong> – na okręgu. Jeśli
            oba opierają się na tym samym łuku (zielonym), kąt wpisany jest dokładnie dwa razy mniejszy.
          </p>
          <p>
            Przesuń punkt P – kąt się nie zmienia. Zwiększ liczbę kątów wpisanych: wszystkie oparte na tym samym łuku
            są równe.
          </p>
        </>
      ),
    },
    {
      title: 'Twierdzenie Talesa',
      kind: '2d',
      scene: ThalesScene,
      controls: [{ type: 'slider', key: 'pos', label: 'Położenie P', min: 8, max: 172, step: 1, default: 60, unit: '°' }],
      body: (
        <>
          <p>
            Jeśli AB jest <strong>średnicą</strong>, kąt środkowy ma 180°, więc każdy kąt wpisany oparty na niej ma 90°.
          </p>
          <p>
            Wniosek odwrotny jest równie przydatny: środek okręgu opisanego na trójkącie prostokątnym leży{' '}
            <strong>w połowie przeciwprostokątnej</strong>, a promień to połowa jej długości.
          </p>
          <p>Zielone kąty przy A i B zawsze sumują się do 90°.</p>
        </>
      ),
    },
    {
      title: 'Czworokąt wpisany w okrąg',
      kind: '2d',
      scene: QuadScene,
      controls: [
        { type: 'slider', key: 'a', label: 'Wierzchołek A', min: 0, max: 359, step: 1, default: 200, unit: '°' },
        { type: 'slider', key: 'b', label: 'Wierzchołek B', min: 0, max: 359, step: 1, default: 290, unit: '°' },
        { type: 'slider', key: 'c', label: 'Wierzchołek C', min: 0, max: 359, step: 1, default: 20, unit: '°' },
        { type: 'slider', key: 'd', label: 'Wierzchołek D', min: 0, max: 359, step: 1, default: 120, unit: '°' },
      ],
      body: (
        <>
          <div className="formula">α + γ = β + δ = 180°</div>
          <p>
            Kąty przy A i C opierają się na dwóch łukach, które razem tworzą cały okrąg (360°). Każdy kąt wpisany to
            połowa swojego łuku, więc razem dają <strong>180°</strong>.
          </p>
          <p>
            Działa to też w drugą stronę: czworokąt da się wpisać w okrąg tylko wtedy, gdy przeciwległe kąty sumują się
            do 180°. Dlatego w okrąg wpiszesz prostokąt, ale nie romb, który nie jest kwadratem.
          </p>
        </>
      ),
    },
  ],
};
