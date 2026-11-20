import type { Control, SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { Board, C, Curve, Pt, Seg, num, squareFrame, usePlot } from '../../lib/mathkit';

const F = squareFrame(0, 0.5, 8);

const BASES: Record<string, { f: (x: number) => number; name: string; key: [number, number] }> = {
  sq: { f: (x) => x * x, name: 'x²', key: [0, 0] },
  abs: { f: (x) => Math.abs(x), name: '|x|', key: [0, 0] },
  sqrt: { f: (x) => (x < 0 ? NaN : Math.sqrt(x)), name: '√x', key: [0, 0] },
  inv: { f: (x) => 1 / x, name: '1/x', key: [1, 1] },
  sin: { f: (x) => Math.sin(x), name: 'sin x', key: [0, 0] },
  cube: { f: (x) => (x * x * x) / 4, name: 'x³/4', key: [0, 0] },
};

const baseControl: Control = {
  type: 'select',
  key: 'base',
  label: 'Funkcja f',
  default: 'sq',
  options: Object.entries(BASES).map(([value, b]) => ({ value, label: b.name })),
};

const inner = (p: number) => (Math.abs(p) < 1e-9 ? 'x' : p > 0 ? `x − ${num(p)}` : `x + ${num(-p)}`);
const outer = (q: number) => (Math.abs(q) < 1e-9 ? '' : q > 0 ? ` + ${num(q)}` : ` − ${num(-q)}`);

/* ---------- Krok 1: przesunięcie o wektor ---------- */
function ShiftScene({ params }: SceneProps) {
  const B = BASES[String(params.base)] ?? BASES.sq;
  const pp = Number(params.p);
  const q = Number(params.q);
  const p = usePlot(F);
  const g = (x: number) => B.f(x - pp) + q;
  const [kx, ky] = B.key;
  return (
    <Board p={p}>
      <Curve p={p} f={B.f} color={C.ghost} width={2.5} dash="6 6" />
      <Curve p={p} f={g} color={C.main} width={4} />
      {(Math.abs(pp) > 0.05 || Math.abs(q) > 0.05) && <Seg p={p} a={[kx, ky]} b={[kx + pp, ky + q]} color={C.third} width={3} arrow />}
      <Pt p={p} x={kx} y={ky} color={C.ghost} r={4} />
      <Pt p={p} x={kx + pp} y={ky + q} color={C.third} />
      <InfoBox
        lines={[
          { text: `f(x) = ${B.name}`, color: 'rgba(255,255,255,0.6)' },
          { text: `g(x) = f(${inner(pp)})${outer(q)}`, color: C.main },
          { text: `wektor przesunięcia u = [${num(pp)}; ${num(q)}]`, color: C.third },
          { text: pp !== 0 ? `w nawiasie „${pp > 0 ? '−' : '+'}” → przesunięcie w ${pp > 0 ? 'prawo' : 'lewo'}` : '' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: symetrie ---------- */
const SYM: Record<string, { name: string; t: (f: (x: number) => number) => (x: number) => number; axis: 'x' | 'y' | 'o' | 'none'; note: string }> = {
  negY: { name: '−f(x)', t: (f) => (x) => -f(x), axis: 'x', note: 'symetria względem osi x' },
  negX: { name: 'f(−x)', t: (f) => (x) => f(-x), axis: 'y', note: 'symetria względem osi y' },
  both: { name: '−f(−x)', t: (f) => (x) => -f(-x), axis: 'o', note: 'symetria względem początku układu' },
  absOut: { name: '|f(x)|', t: (f) => (x) => Math.abs(f(x)), axis: 'x', note: 'część pod osią x odbija się do góry' },
  absIn: { name: 'f(|x|)', t: (f) => (x) => f(Math.abs(x)), axis: 'y', note: 'prawa połowa odbija się na lewo' },
};

function SymmetryScene({ params }: SceneProps) {
  const B = BASES[String(params.base)] ?? BASES.cube;
  const S = SYM[String(params.sym)] ?? SYM.negY;
  const s = Number(params.s);
  const p = usePlot(F);
  const target = S.t(B.f);
  const mix = (x: number) => {
    const a = B.f(x);
    const b = target(x);
    if (!Number.isFinite(a)) return s > 0.98 ? b : NaN;
    if (!Number.isFinite(b)) return s < 0.02 ? a : NaN;
    return a + (b - a) * s;
  };
  const f = p.frame;
  return (
    <Board p={p}>
      {S.axis === 'x' && <Seg p={p} a={[f.xMin, 0]} b={[f.xMax, 0]} color={C.second} width={3} dash="2 6" />}
      {S.axis === 'y' && <Seg p={p} a={[0, f.yMin]} b={[0, f.yMax]} color={C.second} width={3} dash="2 6" />}
      {S.axis === 'o' && <circle cx={p.sx(0)} cy={p.sy(0)} r="10" fill="none" stroke={C.second} strokeWidth="3" />}
      <Curve p={p} f={B.f} color={C.ghost} width={2.5} dash="6 6" />
      <Curve p={p} f={mix} color={C.main} width={4} />
      <InfoBox
        lines={[
          { text: `f(x) = ${B.name}`, color: 'rgba(255,255,255,0.6)' },
          { text: `g(x) = ${S.name}`, color: C.main },
          { text: S.note, color: C.second },
          { text: s < 1 ? `przekształcenie w ${Math.round(s * 100)}%` : '' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: rozciąganie ---------- */
function ScaleScene({ params }: SceneProps) {
  const B = BASES[String(params.base)] ?? BASES.sin;
  const k = Number(params.k);
  const m = Number(params.m);
  const p = usePlot(F);
  const g = (x: number) => k * B.f(m * x);
  return (
    <Board p={p}>
      <Curve p={p} f={B.f} color={C.ghost} width={2.5} dash="6 6" />
      <Curve p={p} f={g} color={C.main} width={4} />
      <InfoBox
        lines={[
          { text: `f(x) = ${B.name}`, color: 'rgba(255,255,255,0.6)' },
          { text: `g(x) = ${num(k)} · f(${num(m)}x)`, color: C.main },
          { text: `k = ${num(k)}: ${Math.abs(k) > 1 ? 'rozciąga' : Math.abs(k) < 1 ? 'ściska' : 'nie zmienia'} wykres w pionie${k < 0 ? ' i odbija go' : ''}`, color: C.third },
          { text: `m = ${num(m)}: ${Math.abs(m) > 1 ? `ściska w poziomie ${num(Math.abs(m))} razy` : Math.abs(m) < 1 ? `rozciąga w poziomie ${num(1 / Math.abs(m))} razy` : 'bez zmian w poziomie'}`, color: C.second },
          { text: B.name === 'sin x' ? `okres: 2π/|m| ≈ ${num((2 * Math.PI) / Math.abs(m || 1))}` : '' },
        ]}
      />
    </Board>
  );
}

export const transformations: Topic = {
  id: 'przeksztalcenia-wykresow',
  title: 'Przekształcenia wykresów',
  subject: 'matematyka',
  summary: 'Przesunięcia o wektor, symetrie, wartość bezwzględna i rozciąganie – jeden wzór, sześć funkcji, płynne przejścia.',
  accent: '#ff5d8f',
  glyph: '⇢',
  steps: [
    {
      title: 'Przesunięcie o wektor',
      kind: '2d',
      scene: ShiftScene,
      controls: [
        baseControl,
        { type: 'slider', key: 'p', label: 'p (poziomo)', min: -5, max: 5, step: 0.1, default: 2 },
        { type: 'slider', key: 'q', label: 'q (pionowo)', min: -4, max: 4, step: 0.1, default: -1.5 },
      ],
      body: (
        <>
          <div className="formula">g(x) = f(x − p) + q,   u = [p; q]</div>
          <p>
            Każdy punkt wykresu przesuwa się o ten sam <strong>wektor [p; q]</strong> – żółta strzałka pokazuje, dokąd
            trafia punkt charakterystyczny.
          </p>
          <p>
            Pułapka: zmiana <strong>wewnątrz nawiasu</strong> działa „na odwrót”. f(x − 2) przesuwa wykres w prawo, bo
            wartość, którą f miała w 0, teraz pojawia się dopiero w x = 2.
          </p>
          <p>Wypróbuj różne funkcje f – zasada jest zawsze ta sama.</p>
        </>
      ),
    },
    {
      title: 'Symetrie i wartość bezwzględna',
      kind: '2d',
      scene: SymmetryScene,
      controls: [
        { ...baseControl, default: 'cube' } as Control,
        {
          type: 'select',
          key: 'sym',
          label: 'Przekształcenie',
          default: 'absOut',
          options: Object.entries(SYM).map(([value, s]) => ({ value, label: s.name })),
        },
        { type: 'slider', key: 's', label: 'Przejście', min: 0, max: 1, step: 0.01, default: 1, decimals: 2 },
      ],
      body: (
        <>
          <p>
            Minus <strong>przed f</strong> zmienia znak wartości – wykres odbija się względem osi x. Minus{' '}
            <strong>przy x</strong> zamienia strony – odbicie względem osi y.
          </p>
          <p>
            <strong>|f(x)|</strong> zostawia część nad osią i odbija w górę to, co było pod nią.{' '}
            <strong>f(|x|)</strong> wyrzuca lewą połowę i zastępuje ją lustrzanym odbiciem prawej.
          </p>
          <p>Suwak „Przejście” pozwala obejrzeć, jak wykres przechodzi z jednej postaci w drugą.</p>
        </>
      ),
    },
    {
      title: 'Rozciąganie i ściskanie',
      kind: '2d',
      scene: ScaleScene,
      controls: [
        { ...baseControl, default: 'sin' } as Control,
        { type: 'slider', key: 'k', label: 'k (pionowo)', min: -3, max: 3, step: 0.1, default: 2 },
        { type: 'slider', key: 'm', label: 'm (poziomo)', min: 0.2, max: 3, step: 0.1, default: 0.5 },
      ],
      body: (
        <>
          <div className="formula">g(x) = k · f(m · x)</div>
          <p>
            Mnożnik <strong>k na zewnątrz</strong> mnoży wszystkie wartości: wykres rośnie lub maleje w pionie, a dla k
            &lt; 0 dodatkowo się odbija.
          </p>
          <p>
            Mnożnik <strong>m w środku</strong> działa odwrotnie niż intuicja: m = 2 ściska wykres dwa razy w poziomie.
            Najlepiej widać to na sinusie – zmienia się okres.
          </p>
        </>
      ),
    },
  ],
};
