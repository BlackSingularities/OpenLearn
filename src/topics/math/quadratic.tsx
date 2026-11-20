import { motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';
import { Axes, C, Dot, InfoBox, fmt, makePlot } from '../../lib/plot';

const FRAME = { x: 42, y: 25, w: 816, h: 510, xMin: -8, xMax: 8, yMin: -5, yMax: 5 };
const VIEW = '0 0 900 560';

/** „+ 3x”, „− 2”, pomija zera. */
function term(v: number, suffix: string, first = false): string {
  if (Math.abs(v) < 1e-9) return '';
  const sign = v < 0 ? '−' : first ? '' : '+';
  const abs = Math.abs(v);
  const num = suffix && Math.abs(abs - 1) < 1e-9 ? '' : fmt(abs, abs % 1 === 0 ? 0 : 2);
  return `${first ? sign : ` ${sign} `}${num}${suffix}`;
}

function general(a: number, b: number, c: number) {
  return `f(x) = ${term(a, 'x²', true)}${term(b, 'x')}${term(c, '')}` || 'f(x) = 0';
}

/* ---------- Krok 1: współczynnik a ---------- */
function CoefAScene({ params }: SceneProps) {
  const a = Number(params.a ?? 1);
  const p = makePlot(FRAME);
  const ghosts = [-2, -1, -0.5, 0.5, 1, 2];
  return (
    <svg viewBox={VIEW}>
      <Axes p={p} />
      {ghosts.map((g) => (
        <path key={g} d={p.path((x) => g * x * x)} fill="none" stroke={C.ghost} strokeWidth="1.2" strokeDasharray="4 5" />
      ))}
      <motion.path
        d={p.path((x) => a * x * x)}
        fill="none"
        stroke={C.main}
        strokeWidth="4"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
      />
      <Dot x={p.sx(0)} y={p.sy(0)} color={C.third} label="W(0, 0)" />
      <InfoBox
        x={60}
        y={40}
        w={250}
        lines={[
          { text: `f(x) = ${fmt(a, 2)}x²`, color: C.main },
          { text: a > 0 ? 'ramiona skierowane w górę' : a < 0 ? 'ramiona skierowane w dół' : 'a = 0 → to nie parabola!' },
          { text: Math.abs(a) > 1 ? 'parabola węższa niż y = x²' : Math.abs(a) < 1 && a !== 0 ? 'parabola szersza niż y = x²' : '|a| = 1' },
          { text: a > 0 ? 'wartość najmniejsza: 0' : a < 0 ? 'wartość największa: 0' : '' },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 2: postać kanoniczna ---------- */
function CanonicalScene({ params }: SceneProps) {
  const a = Number(params.a ?? 1);
  const pp = Number(params.p ?? 2);
  const q = Number(params.q ?? -1);
  const p = makePlot(FRAME);
  const f = (x: number) => a * (x - pp) ** 2 + q;
  return (
    <svg viewBox={VIEW}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={C.third} />
        </marker>
      </defs>
      <Axes p={p} />
      <path d={p.path((x) => a * x * x)} fill="none" stroke={C.ghost} strokeWidth="2" strokeDasharray="6 6" />
      <line x1={p.sx(pp)} x2={p.sx(pp)} y1={FRAME.y} y2={FRAME.y + FRAME.h} stroke={C.second} strokeDasharray="3 6" />
      <text x={p.sx(pp) + 6} y={FRAME.y + 16} fill={C.second} fontFamily="Geist" fontSize="13">
        oś symetrii x = {fmt(pp, 1)}
      </text>
      {(Math.abs(pp) > 0.05 || Math.abs(q) > 0.05) && (
        <line x1={p.sx(0)} y1={p.sy(0)} x2={p.sx(pp)} y2={p.sy(q)} stroke={C.third} strokeWidth="2.5" markerEnd="url(#arr)" />
      )}
      <path d={p.path(f)} fill="none" stroke={C.main} strokeWidth="4" />
      <Dot x={p.sx(pp)} y={p.sy(q)} color={C.third} label={`W(${fmt(pp, 1)}; ${fmt(q, 1)})`} />
      <InfoBox
        x={60}
        y={40}
        w={290}
        lines={[
          { text: `f(x) = ${fmt(a, 1)}(x ${pp >= 0 ? '−' : '+'} ${fmt(Math.abs(pp), 1)})² ${q >= 0 ? '+' : '−'} ${fmt(Math.abs(q), 1)}`, color: C.main },
          { text: `przesunięcie o wektor [${fmt(pp, 1)}; ${fmt(q, 1)}]`, color: C.third },
          { text: `zbiór wartości: ${a > 0 ? `⟨${fmt(q, 1)}; +∞)` : `(−∞; ${fmt(q, 1)}⟩`}` },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 3: postać ogólna, delta ---------- */
function DeltaScene({ params }: SceneProps) {
  // a = 0 to już funkcja liniowa – omijamy zero, żeby wzory na wierzchołek miały sens
  const raw = Number(params.a ?? 1);
  const a = Math.abs(raw) < 0.05 ? (raw < 0 ? -0.05 : 0.05) : raw;
  const b = Number(params.b ?? -2);
  const c = Number(params.c ?? -3);
  const p = makePlot(FRAME);
  const f = (x: number) => a * x * x + b * x + c;
  const delta = b * b - 4 * a * c;
  const pv = -b / (2 * a);
  const qv = -delta / (4 * a);
  const roots = delta > 1e-9 ? [(-b - Math.sqrt(delta)) / (2 * a), (-b + Math.sqrt(delta)) / (2 * a)].sort((u, v) => u - v) : Math.abs(delta) <= 1e-9 ? [pv] : [];
  const dColor = delta > 1e-9 ? C.good : Math.abs(delta) <= 1e-9 ? C.third : C.bad;

  return (
    <svg viewBox={VIEW}>
      <Axes p={p} />
      <path d={p.path(f)} fill="none" stroke={C.main} strokeWidth="4" />
      <line x1={p.sx(pv)} x2={p.sx(pv)} y1={FRAME.y} y2={FRAME.y + FRAME.h} stroke={C.second} strokeDasharray="3 6" />
      <Dot x={p.sx(pv)} y={p.sy(qv)} color={C.third} label={`W(${fmt(pv)}; ${fmt(qv)})`} />
      {roots.map((r, i) => (
        <motion.g key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ originX: `${p.sx(r)}px`, originY: `${p.sy(0)}px` }}>
          <Dot x={p.sx(r)} y={p.sy(0)} color={C.good} label={roots.length === 1 ? `x₀ = ${fmt(r)}` : `x${i === 0 ? '₁' : '₂'} = ${fmt(r)}`} dx={i === 0 && roots.length > 1 ? -10 : 10} dy={22} />
        </motion.g>
      ))}
      <Dot x={p.sx(0)} y={p.sy(c)} color={C.second} r={4} label={`(0; ${fmt(c, 1)})`} dx={-10} />
      <InfoBox
        x={60}
        y={40}
        w={300}
        lines={[
          { text: general(a, b, c), color: C.main },
          { text: `Δ = b² − 4ac = ${fmt(delta)}`, color: dColor },
          {
            text:
              delta > 1e-9 ? 'Δ > 0 → dwa miejsca zerowe' : Math.abs(delta) <= 1e-9 ? 'Δ = 0 → jedno miejsce zerowe' : 'Δ < 0 → brak miejsc zerowych',
          },
          { text: `p = −b/2a = ${fmt(pv)},  q = −Δ/4a = ${fmt(qv)}` },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 4: postać iloczynowa i nierówności ---------- */
function InequalityScene({ params }: SceneProps) {
  const a = Number(params.a ?? 1);
  const x1 = Math.min(Number(params.x1 ?? -2), Number(params.x2 ?? 3));
  const x2 = Math.max(Number(params.x1 ?? -2), Number(params.x2 ?? 3));
  const sign = String(params.sign ?? '>');
  const p = makePlot(FRAME);
  const f = (x: number) => a * (x - x1) * (x - x2);
  const wantPositive = sign === '>';
  // Rozwiązaniem jest „środek” albo „zewnętrze” przedziału [x1, x2] zależnie od znaku a i nierówności
  const inside = (a > 0) !== wantPositive;
  const segs: [number, number][] = inside ? [[x1, x2]] : [[FRAME.xMin, x1], [x2, FRAME.xMax]];
  const solution = inside
    ? `x ∈ (${fmt(x1, 1)}; ${fmt(x2, 1)})`
    : `x ∈ (−∞; ${fmt(x1, 1)}) ∪ (${fmt(x2, 1)}; +∞)`;

  return (
    <svg viewBox={VIEW}>
      <Axes p={p} />
      {segs.map(([u, v], i) => (
        <path key={i} d={p.area(f, u, v)} fill={C.good} opacity="0.18" />
      ))}
      <path d={p.path(f)} fill="none" stroke={C.main} strokeWidth="4" />
      {segs.map(([u, v], i) => (
        <line key={`s${i}`} x1={p.sx(u)} x2={p.sx(v)} y1={p.sy(0)} y2={p.sy(0)} stroke={C.good} strokeWidth="7" strokeLinecap="round" opacity="0.9" />
      ))}
      <Dot x={p.sx(x1)} y={p.sy(0)} color="#fff" r={6} label={`x₁ = ${fmt(x1, 1)}`} dx={-10} dy={24} />
      <Dot x={p.sx(x2)} y={p.sy(0)} color="#fff" r={6} label={`x₂ = ${fmt(x2, 1)}`} dx={10} dy={24} />
      <InfoBox
        x={60}
        y={40}
        w={330}
        lines={[
          { text: `f(x) = ${fmt(a, 1)}(x ${x1 >= 0 ? '−' : '+'} ${fmt(Math.abs(x1), 1)})(x ${x2 >= 0 ? '−' : '+'} ${fmt(Math.abs(x2), 1)})`, color: C.main },
          { text: `nierówność: f(x) ${sign} 0` },
          { text: solution, color: C.good },
        ]}
      />
    </svg>
  );
}

export const quadratic: Topic = {
  id: 'funkcja-kwadratowa',
  title: 'Funkcja kwadratowa od podstaw',
  subject: 'matematyka',
  summary: 'Współczynniki, postać kanoniczna, delta i nierówności – każdy wzór widać na wykresie.',
  accent: '#ff6b8b',
  glyph: '∪',
  steps: [
    {
      title: 'Parabola y = ax²',
      kind: '2d',
      scene: CoefAScene,
      controls: [{ type: 'slider', key: 'a', label: 'Współczynnik a', min: -3, max: 3, step: 0.05, default: 1 }],
      body: (
        <>
          <p>
            Wykresem funkcji kwadratowej jest <strong>parabola</strong>. Najprostsza ma wzór f(x) = ax², a jej
            wierzchołek leży w początku układu.
          </p>
          <p>
            Znak <strong>a</strong> decyduje o kierunku ramion: dla a &gt; 0 w górę, dla a &lt; 0 w dół. Wartość{' '}
            <strong>|a|</strong> decyduje o „rozwarciu” – im większa, tym parabola węższa.
          </p>
          <p>Przerywane linie to wykresy dla a = ±½, ±1, ±2. Ustaw a = 0 i zobacz, co się stanie.</p>
        </>
      ),
    },
    {
      title: 'Postać kanoniczna',
      kind: '2d',
      scene: CanonicalScene,
      controls: [
        { type: 'slider', key: 'a', label: 'a', min: -3, max: 3, step: 0.1, default: 1 },
        { type: 'slider', key: 'p', label: 'p (przesunięcie poziome)', min: -5, max: 5, step: 0.1, default: 2 },
        { type: 'slider', key: 'q', label: 'q (przesunięcie pionowe)', min: -4, max: 4, step: 0.1, default: -1 },
      ],
      body: (
        <>
          <div className="formula">f(x) = a(x − p)² + q</div>
          <p>
            Wykres powstaje z paraboli y = ax² przez <strong>przesunięcie o wektor [p; q]</strong>. Wierzchołek ląduje
            w punkcie <strong>W(p; q)</strong>, a prosta x = p jest osią symetrii.
          </p>
          <p>
            Uwaga na znak: w nawiasie jest <em>minus</em> p. Wzór f(x) = (x + 3)² oznacza przesunięcie w{' '}
            <strong>lewo</strong>, bo p = −3.
          </p>
          <p>Z postaci kanonicznej od razu odczytasz zbiór wartości i przedziały monotoniczności.</p>
        </>
      ),
    },
    {
      title: 'Postać ogólna i wyróżnik Δ',
      kind: '2d',
      scene: DeltaScene,
      controls: [
        { type: 'slider', key: 'a', label: 'a', min: -2, max: 2, step: 0.05, default: 1 },
        { type: 'slider', key: 'b', label: 'b', min: -6, max: 6, step: 0.1, default: -2 },
        { type: 'slider', key: 'c', label: 'c', min: -5, max: 5, step: 0.1, default: -3 },
      ],
      body: (
        <>
          <div className="formula">f(x) = ax² + bx + c,  Δ = b² − 4ac</div>
          <p>
            <strong>Wyróżnik Δ</strong> mówi, ile razy parabola przecina oś x. Przesuwaj c w górę i obserwuj, jak
            dwa miejsca zerowe zbliżają się, łączą (Δ = 0) i znikają (Δ &lt; 0).
          </p>
          <div className="formula">x₁,₂ = (−b ∓ √Δ) / 2a</div>
          <p>
            Współrzędne wierzchołka: <strong>p = −b/2a</strong>, <strong>q = −Δ/4a</strong>. Współczynnik c to
            punkt przecięcia z osią y.
          </p>
        </>
      ),
    },
    {
      title: 'Postać iloczynowa i nierówności',
      kind: '2d',
      scene: InequalityScene,
      controls: [
        { type: 'slider', key: 'a', label: 'a', min: -2, max: 2, step: 0.1, default: 0.5 },
        { type: 'slider', key: 'x1', label: 'x₁', min: -7, max: 7, step: 0.1, default: -2 },
        { type: 'slider', key: 'x2', label: 'x₂', min: -7, max: 7, step: 0.1, default: 3 },
        {
          type: 'select',
          key: 'sign',
          label: 'Nierówność',
          default: '>',
          options: [
            { value: '>', label: 'f(x) > 0' },
            { value: '<', label: 'f(x) < 0' },
          ],
        },
      ],
      body: (
        <>
          <div className="formula">f(x) = a(x − x₁)(x − x₂)</div>
          <p>
            Gdy znamy miejsca zerowe, nierówność kwadratową rozwiązujemy <strong>szkicem paraboli</strong>: patrzymy,
            gdzie wykres jest nad osią x (f &gt; 0), a gdzie pod nią (f &lt; 0).
          </p>
          <p>
            Dla a &gt; 0 funkcja jest ujemna <em>między</em> pierwiastkami, a dodatnia <em>na zewnątrz</em>. Dla a &lt; 0
            – odwrotnie. Zmień znak a i sprawdź, jak zmienia się zielony zbiór rozwiązań.
          </p>
        </>
      ),
    },
  ],
};
