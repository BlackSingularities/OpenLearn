import { useMemo } from 'react';
import { Edges } from '@react-three/drei';
import type { SceneProps, Topic } from '../../lib/types';
import { Axes, InfoBox, InfoPortal, makePlot } from '../../lib/plot';
import { Lights } from '../../lib/three';
import { Band, Board, C, Curve, Label, Poly, Pt, VIEW, num, usePlot } from '../../lib/mathkit';

/* ---------- Krok 1: znak pochodnej a monotoniczność ---------- */
const FUNCS: Record<string, { f: (x: number) => number; d: (x: number) => number; name: string; dname: string }> = {
  cubic: { f: (x) => (x ** 3 - 9 * x) / 4, d: (x) => (3 * x * x - 9) / 4, name: '(x³ − 9x)/4', dname: '(3x² − 9)/4' },
  quartic: { f: (x) => (x ** 4 - 8 * x * x) / 8 + 1, d: (x) => (4 * x ** 3 - 16 * x) / 8, name: '(x⁴ − 8x²)/8 + 1', dname: '(x³ − 4x)/2' },
  flat: { f: (x) => x ** 3 / 6, d: (x) => x * x / 2, name: 'x³/6', dname: 'x²/2' },
};

function MonotonicScene({ params }: SceneProps) {
  const F = FUNCS[String(params.fn)] ?? FUNCS.cubic;
  const x0 = Number(params.x);
  const top = makePlot({ x: 42, y: 20, w: 816, h: 300, xMin: -4.5, xMax: 4.5, yMin: -4, yMax: 4 });
  const bot = makePlot({ x: 42, y: 345, w: 816, h: 195, xMin: -4.5, xMax: 4.5, yMin: -4, yMax: 4 });
  // przedziały znaku pochodnej
  const pts: number[] = [];
  let prev = F.d(-4.5);
  for (let x = -4.5; x <= 4.5; x += 0.005) {
    const v = F.d(x);
    if ((v > 0) !== (prev > 0) && Math.abs(v - prev) > 1e-9) pts.push(x);
    prev = v;
  }
  const edges = [-4.5, ...pts, 4.5];
  const slope = F.d(x0);
  const y0 = F.f(x0);
  const extrema = pts.filter((x) => {
    const l = F.d(x - 0.05);
    const r = F.d(x + 0.05);
    return (l > 0) !== (r > 0);
  });
  return (
    <svg viewBox={VIEW}>
      <defs>
        <clipPath id="clip-top">
          <rect x={42} y={20} width={816} height={300} />
        </clipPath>
        <clipPath id="clip-bot">
          <rect x={42} y={345} width={816} height={195} />
        </clipPath>
      </defs>
      <rect x={42} y={20} width={816} height={300} fill="rgba(255,255,255,0.02)" rx="6" />
      <rect x={42} y={345} width={816} height={195} fill="rgba(255,255,255,0.02)" rx="6" />
      <g clipPath="url(#clip-top)">
        <Axes p={top} labels={false} />
        {edges.slice(0, -1).map((a, i) => {
          const b = edges[i + 1];
          const up = F.d((a + b) / 2) > 0;
          return <path key={i} d={top.path(F.f, a, b)} fill="none" stroke={up ? C.good : C.bad} strokeWidth="4.5" strokeLinecap="round" />;
        })}
        <line x1={top.sx(x0 - 1.5)} y1={top.sy(y0 - slope * 1.5)} x2={top.sx(x0 + 1.5)} y2={top.sy(y0 + slope * 1.5)} stroke={C.third} strokeWidth="2.5" />
        {extrema.map((x) => (
          <circle key={x} cx={top.sx(x)} cy={top.sy(F.f(x))} r="7" fill="#0b0d12" stroke="#fff" strokeWidth="3" />
        ))}
        <circle cx={top.sx(x0)} cy={top.sy(y0)} r="7" fill={C.third} />
      </g>
      <g clipPath="url(#clip-bot)">
        <Axes p={bot} labels={false} yLabel="f′" />
        {edges.slice(0, -1).map((a, i) => {
          const b = edges[i + 1];
          const up = F.d((a + b) / 2) > 0;
          return <path key={i} d={bot.area(F.d, a, b)} fill={up ? C.good : C.bad} opacity="0.22" />;
        })}
        <path d={bot.path(F.d)} fill="none" stroke={C.second} strokeWidth="3" />
        <line x1={bot.sx(x0)} x2={bot.sx(x0)} y1={bot.sy(0)} y2={bot.sy(slope)} stroke={C.third} strokeWidth="3" />
        <circle cx={bot.sx(x0)} cy={bot.sy(slope)} r="6" fill={C.third} />
      </g>
      <line x1={top.sx(x0)} x2={top.sx(x0)} y1={20} y2={540} stroke={C.third} strokeOpacity="0.35" strokeDasharray="3 5" />
      <InfoBox
        lines={[
          { text: `f(x) = ${F.name}`, color: '#fff' },
          { text: `f′(x) = ${F.dname}`, color: C.second },
          { text: `f′(${num(x0)}) = ${num(slope)} → ${slope > 0.01 ? 'f rośnie' : slope < -0.01 ? 'f maleje' : 'styczna pozioma'}`, color: C.third },
          { text: extrema.length ? `ekstrema w x = ${extrema.map((x) => num(x)).join('; ')}` : 'brak ekstremów: f′ nie zmienia znaku', color: C.good },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 2: puszka o najmniejszej powierzchni (3D) ---------- */
function CanScene({ params }: SceneProps) {
  const V = Number(params.V);
  const r = Number(params.r);
  const h = V / (Math.PI * r * r);
  const P = (x: number) => 2 * Math.PI * x * x + (2 * V) / x;
  const rOpt = Math.cbrt(V / (2 * Math.PI));
  const scale = 0.85;
  const graph = useMemo(() => {
    const xs = Array.from({ length: 80 }, (_, i) => 0.4 + (i / 79) * 2.4);
    return xs.map((x) => [x, P(x)] as const);
  }, [V]);
  const maxP = Math.max(...graph.map((g) => g[1]));
  const minP = P(rOpt);
  const gx = (x: number) => ((x - 0.4) / 2.4) * 240;
  const gy = (y: number) => 70 - ((y - minP * 0.9) / (Math.min(maxP, minP * 3) - minP * 0.9)) * 66;
  return (
    <group>
      <Lights />
      <mesh position={[0, (h * scale) / 2, 0]}>
        <cylinderGeometry args={[r * scale, r * scale, h * scale, 64, 1]} />
        <meshStandardMaterial color="#c9ced8" metalness={0.75} roughness={0.28} />
        <Edges color="#ffffff" threshold={20} />
      </mesh>
      <mesh position={[0, h * scale + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * scale * 0.82, r * scale * 0.97, 64]} />
        <meshStandardMaterial color="#ff6b8b" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.5, 64]} />
        <meshStandardMaterial color="#1a1f2e" transparent opacity={0.6} />
      </mesh>
      <InfoPortal>
        <div>
          V = {num(V)} (stała), r = {num(r)}, h = {num(h)}
        </div>
        <div style={{ color: '#ff6b8b', fontWeight: 600 }}>P(r) = 2πr² + 2V/r = {num(P(r))}</div>
        <div style={{ color: '#4ade80' }}>
          minimum dla r = ∛(V/2π) ≈ {num(rOpt)}, wtedy h = 2r
        </div>
        <svg viewBox="0 0 240 74" style={{ width: '100%', maxWidth: 260, display: 'block', marginTop: 6 }}>
          <polyline points={graph.filter((g) => g[1] < minP * 3).map(([x, y]) => `${gx(x)},${gy(y)}`).join(' ')} fill="none" stroke="#ff6b8b" strokeWidth="2" />
          <line x1={gx(rOpt)} x2={gx(rOpt)} y1="0" y2="74" stroke="#4ade80" strokeDasharray="3 3" />
          {P(r) < minP * 3 && <circle cx={gx(r)} cy={gy(P(r))} r="4.5" fill="#ffd166" />}
        </svg>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 3: największy prostokąt pod parabolą ---------- */
function RectScene({ params }: SceneProps) {
  const x = Number(params.x);
  const p = usePlot({ x: 42, y: 25, w: 520, h: 510, xMin: -3.6, xMax: 3.6, yMin: -0.6, yMax: 10 });
  const f = (t: number) => 9 - t * t;
  const A = (t: number) => 2 * t * f(t);
  const xOpt = Math.sqrt(3);
  const q = makePlot({ x: 610, y: 120, w: 250, h: 300, xMin: 0, xMax: 3, yMin: 0, yMax: 22 });
  return (
    <Board p={p} labels={false}>
      <Poly p={p} pts={[[-x, 0], [x, 0], [x, f(x)], [-x, f(x)]]} color={C.third} fill={C.third} fillOpacity={0.25} width={3} />
      <Curve p={p} f={f} color={C.main} width={4} />
      <Pt p={p} x={x} y={f(x)} color={C.third} />
      <Label p={p} x={0} y={f(x) / 2} dy={6} color={C.third} size={18}>
        P = {num(A(x))}
      </Label>
      <rect x={610} y={120} width={250} height={300} fill="rgba(255,255,255,0.03)" rx="8" />
      <path d={q.path(A, 0, 3)} fill="none" stroke={C.third} strokeWidth="3" />
      <line x1={q.sx(xOpt)} x2={q.sx(xOpt)} y1={120} y2={420} stroke={C.good} strokeDasharray="4 4" />
      <circle cx={q.sx(x)} cy={q.sy(A(x))} r="6" fill={C.third} />
      <text x={735} y={445} fill={C.text} fontFamily="Geist" fontSize="13" textAnchor="middle">
        P(x) = 2x(9 − x²)
      </text>
      <Band p={p} from={-x} to={x} color={C.third} h={6} />
      <InfoBox
        lines={[
          { text: 'y = 9 − x²', color: C.main },
          { text: `szerokość 2x = ${num(2 * x)}, wysokość 9 − x² = ${num(f(x))}` },
          { text: `P(x) = 18x − 2x³ = ${num(A(x))}`, color: C.third },
          { text: `P′(x) = 18 − 6x² = 0 → x = √3 ≈ ${num(xOpt)}, P max = ${num(A(xOpt))}`, color: C.good },
        ]}
      />
    </Board>
  );
}

export const optimization: Topic = {
  id: 'zastosowania-pochodnej',
  title: 'Zastosowania pochodnej',
  subject: 'matematyka',
  summary: 'Znak pochodnej a monotoniczność i ekstrema, puszka o najmniejszej powierzchni w 3D i największy prostokąt pod parabolą.',
  accent: '#e04e6b',
  glyph: 'f′',
  steps: [
    {
      title: 'Monotoniczność i ekstrema',
      kind: '2d',
      scene: MonotonicScene,
      controls: [
        {
          type: 'select',
          key: 'fn',
          label: 'Funkcja',
          default: 'cubic',
          options: [
            { value: 'cubic', label: 'sześcienna' },
            { value: 'quartic', label: 'czwartego stopnia' },
            { value: 'flat', label: 'x³/6' },
          ],
        },
        { type: 'slider', key: 'x', label: 'Punkt x', min: -4, max: 4, step: 0.05, default: -1 },
      ],
      body: (
        <>
          <p>
            Pochodna to nachylenie stycznej. Gdzie <strong>f′ &gt; 0</strong> (zielone tło na dolnym wykresie), funkcja
            rośnie; gdzie <strong>f′ &lt; 0</strong> (czerwone) – maleje.
          </p>
          <p>
            Ekstremum leży tam, gdzie pochodna <strong>zmienia znak</strong>. Samo f′ = 0 nie wystarcza: dla x³/6
            pochodna dotyka zera w x = 0, ale znaku nie zmienia – to punkt przegięcia, nie ekstremum.
          </p>
        </>
      ),
    },
    {
      title: 'Puszka z najmniejszej ilości blachy',
      kind: '3d',
      scene: CanScene,
      camera: [3.6, 2.8, 4.6],
      target: [0, 0.9, 0],
      controls: [
        { type: 'slider', key: 'V', label: 'Objętość V', min: 2, max: 10, step: 0.5, default: 5 },
        { type: 'slider', key: 'r', label: 'Promień r', min: 0.45, max: 2.6, step: 0.01, default: 1.6 },
      ],
      body: (
        <>
          <div className="formula">P(r) = 2πr² + 2V / r</div>
          <p>
            Puszka ma mieścić stałą objętość V. Chcemy zużyć <strong>jak najmniej blachy</strong>. Wąska puszka ma
            wielką ścianę boczną, płaska – ogromne denka. Gdzieś pomiędzy jest minimum.
          </p>
          <p>
            Z h = V/(πr²) pole zależy tylko od r. Pochodna P′(r) = 4πr − 2V/r² zeruje się dla r = ∛(V/2π) – wtedy{' '}
            <strong>wysokość równa się średnicy</strong>. Znajdź to położenie suwakiem.
          </p>
        </>
      ),
    },
    {
      title: 'Największy prostokąt',
      kind: '2d',
      scene: RectScene,
      controls: [{ type: 'slider', key: 'x', label: 'Połowa szerokości x', min: 0.1, max: 2.95, step: 0.01, default: 0.8 }],
      body: (
        <>
          <p>
            Prostokąt stoi na osi x, a jego górne wierzchołki leżą na paraboli y = 9 − x². Jakie wymiary dają{' '}
            <strong>największe pole</strong>?
          </p>
          <p>
            Pole P(x) = 2x(9 − x²) zapisujemy jako funkcję jednej zmiennej, liczymy pochodną i szukamy, gdzie się zeruje.
            Wykres P(x) po prawej pokazuje, że maksimum wypada dla x = √3.
          </p>
          <p>Schemat jest zawsze ten sam: zmienna → funkcja → pochodna → zmiana znaku → odpowiedź.</p>
        </>
      ),
    },
  ],
};
