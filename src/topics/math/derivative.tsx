import { useMemo } from 'react';
import type { Control, SceneProps, Topic } from '../../lib/types';
import { Axes, C, Dot, InfoBox, fmt, makePlot } from '../../lib/plot';
import { useAnimationClock } from '../../lib/useAnimationClock';

interface Fn {
  label: string;
  f: (x: number) => number;
  df: (x: number) => number;
  dfLabel: string;
}

const FUNCS: Record<string, Fn> = {
  cubic: {
    label: 'f(x) = x³/6 − x',
    f: (x) => x ** 3 / 6 - x,
    df: (x) => x ** 2 / 2 - 1,
    dfLabel: "f'(x) = x²/2 − 1",
  },
  sin: {
    label: 'f(x) = 2 sin x',
    f: (x) => 2 * Math.sin(x),
    df: (x) => 2 * Math.cos(x),
    dfLabel: "f'(x) = 2 cos x",
  },
  quad: {
    label: 'f(x) = x²/4 − 2',
    f: (x) => x * x / 4 - 2,
    df: (x) => x / 2,
    dfLabel: "f'(x) = x/2",
  },
};

const fnControl: Control = {
  type: 'select',
  key: 'fn',
  label: 'Funkcja',
  default: 'cubic',
  options: [
    { value: 'cubic', label: 'x³/6 − x' },
    { value: 'sin', label: '2 sin x' },
    { value: 'quad', label: 'x²/4 − 2' },
  ],
};

const VIEW = '0 0 900 560';
const FULL = { x: 42, y: 25, w: 816, h: 510, xMin: -6, xMax: 6, yMin: -3.75, yMax: 3.75 };

/** Prosta przez punkt (x0, y0) o nachyleniu m, przycięta do ramki. */
function lineThrough(p: ReturnType<typeof makePlot>, x0: number, y0: number, m: number) {
  const { xMin, xMax } = p.frame;
  return { x1: p.sx(xMin), y1: p.sy(y0 + m * (xMin - x0)), x2: p.sx(xMax), y2: p.sy(y0 + m * (xMax - x0)) };
}

/* ---------- Kroki 1–2: sieczna → styczna ---------- */
function SecantScene({ params }: SceneProps) {
  const fn = FUNCS[String(params.fn ?? 'cubic')];
  const x0 = Number(params.x0 ?? 1);
  const auto = Boolean(params.auto);
  const t = useAnimationClock(auto, 1);
  // w trybie automatycznym h maleje do zera i zaczyna od nowa
  const h = auto ? Math.max(0.001, 3 * Math.pow(1 - ((t / 5) % 1), 2)) : Number(params.h ?? 2);
  const showTangent = Boolean(params.tangent);
  const p = makePlot(FULL);

  const y0 = fn.f(x0);
  const x1 = x0 + h;
  const y1 = fn.f(x1);
  const slope = (y1 - y0) / h;
  const exact = fn.df(x0);
  const sec = lineThrough(p, x0, y0, slope);
  const tan = lineThrough(p, x0, y0, exact);

  return (
    <svg viewBox={VIEW}>
      <defs>
        <clipPath id="clipFull">
          <rect x={FULL.x} y={FULL.y} width={FULL.w} height={FULL.h} />
        </clipPath>
      </defs>
      <Axes p={p} />
      <g clipPath="url(#clipFull)">
        <path d={p.path(fn.f)} fill="none" stroke={C.main} strokeWidth="4" />
        {showTangent && <line {...tan} stroke={C.good} strokeWidth="2" strokeDasharray="8 6" />}
        <line {...sec} stroke={C.second} strokeWidth="2.5" />
        {/* trójkąt różnicowy */}
        <path d={`M${p.sx(x0)},${p.sy(y0)} L${p.sx(x1)},${p.sy(y0)} L${p.sx(x1)},${p.sy(y1)}`} fill="none" stroke={C.third} strokeWidth="2" />
      </g>
      <text x={(p.sx(x0) + p.sx(x1)) / 2} y={p.sy(y0) + (y1 > y0 ? 20 : -10)} fill={C.third} fontFamily="Geist" fontSize="14" textAnchor="middle">
        Δx = h
      </text>
      <text x={p.sx(x1) + 8} y={(p.sy(y0) + p.sy(y1)) / 2} fill={C.third} fontFamily="Geist" fontSize="14">
        Δy
      </text>
      <Dot x={p.sx(x0)} y={p.sy(y0)} color="#fff" label="A" dx={-14} dy={-12} />
      <Dot x={p.sx(x1)} y={p.sy(y1)} color={C.second} label="B" />
      <InfoBox
        x={60}
        y={40}
        w={320}
        lines={[
          { text: fn.label, color: C.main },
          { text: `h = ${fmt(h, 3)}` },
          { text: `Δy/Δx = ${fmt(slope, 4)}  (sieczna AB)`, color: C.second },
          ...(showTangent ? [{ text: `f'(${fmt(x0, 1)}) = ${fmt(exact, 4)}  (styczna)`, color: C.good }] : []),
        ]}
      />
    </svg>
  );
}

/* ---------- Kroki 3–4: wykres pochodnej i monotoniczność ---------- */
const TOP = { x: 42, y: 15, w: 816, h: 300, xMin: -4.5, xMax: 4.5, yMin: -3.3, yMax: 3.3 };
const BOTTOM = { x: 42, y: 340, w: 816, h: 205, xMin: -4.5, xMax: 4.5, yMin: -2.2, yMax: 2.2 };

function DerivativeGraphScene({ params }: SceneProps) {
  const fn = FUNCS[String(params.fn ?? 'cubic')];
  const auto = Boolean(params.auto);
  const mono = Boolean(params.mono);
  const t = useAnimationClock(auto, 1);
  const x0 = auto ? -4.5 + ((t * 1.2) % 9) : Number(params.x0 ?? 0);
  const top = makePlot(TOP);
  const bot = makePlot(BOTTOM);

  const y0 = fn.f(x0);
  const m = fn.df(x0);
  const tan = lineThrough(top, x0, y0, m);

  // miejsca zerowe pochodnej (ekstrema) – szukamy zmian znaku
  const extrema = useMemo(() => {
    const out: { x: number; kind: 'max' | 'min' }[] = [];
    const n = 2400;
    for (let i = 0; i < n; i++) {
      const a = -4.5 + (9 * i) / n;
      const b = a + 9 / n;
      const da = fn.df(a);
      const db = fn.df(b);
      if (da * db < 0) out.push({ x: (a + b) / 2, kind: da > 0 ? 'max' : 'min' });
    }
    return out;
  }, [fn]);

  // odcinki monotoniczności
  const segments = useMemo(() => {
    const cuts = [-4.5, ...extrema.map((e) => e.x), 4.5];
    return cuts.slice(0, -1).map((a, i) => ({ a, b: cuts[i + 1], up: fn.df((a + cuts[i + 1]) / 2) > 0 }));
  }, [extrema, fn]);

  return (
    <svg viewBox={VIEW}>
      <defs>
        <clipPath id="clipTop">
          <rect x={TOP.x} y={TOP.y} width={TOP.w} height={TOP.h} />
        </clipPath>
        <clipPath id="clipBottom">
          <rect x={BOTTOM.x} y={BOTTOM.y} width={BOTTOM.w} height={BOTTOM.h} />
        </clipPath>
      </defs>
      <rect x={TOP.x} y={TOP.y} width={TOP.w} height={TOP.h} rx="10" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.12)" />
      <rect x={BOTTOM.x} y={BOTTOM.y} width={BOTTOM.w} height={BOTTOM.h} rx="10" fill="rgba(79,195,255,0.04)" stroke="rgba(79,195,255,0.25)" />
      <Axes p={top} />
      <Axes p={bot} yLabel="f'" />
      <g clipPath="url(#clipTop)">
        {mono
          ? segments.map((s, i) => (
              <path key={i} d={top.path(fn.f, s.a, s.b, 120)} fill="none" stroke={s.up ? C.good : C.bad} strokeWidth="4.5" />
            ))
          : <path d={top.path(fn.f)} fill="none" stroke={C.main} strokeWidth="4" />}
        <line {...tan} stroke={C.second} strokeWidth="2.5" />
      </g>
      {/* wykres pochodnej rysowany do bieżącego x0 */}
      <g clipPath="url(#clipBottom)">
        <path d={bot.path(fn.df)} fill="none" stroke={C.ghost} strokeWidth="1.5" strokeDasharray="4 5" />
        <path d={bot.path(fn.df, -4.5, x0, 200)} fill="none" stroke={C.second} strokeWidth="3.5" />
      </g>
      <line x1={top.sx(x0)} x2={top.sx(x0)} y1={top.sy(y0)} y2={bot.sy(m)} stroke={C.third} strokeDasharray="4 6" opacity="0.7" />
      <Dot x={top.sx(x0)} y={top.sy(y0)} color="#fff" r={5} />
      <Dot x={bot.sx(x0)} y={bot.sy(m)} color={C.second} r={5} label={`f'(x) = ${fmt(m)}`} />
      {mono &&
        extrema.map((e) => (
          <g key={e.x}>
            <Dot x={top.sx(e.x)} y={top.sy(fn.f(e.x))} color={C.third} r={5} label={e.kind === 'max' ? 'maksimum' : 'minimum'} dy={e.kind === 'max' ? -14 : 24} />
            <Dot x={bot.sx(e.x)} y={bot.sy(0)} color={C.third} r={4} />
          </g>
        ))}
      <text x={TOP.x + 14} y={TOP.y + 24} fill={C.main} fontFamily="Geist" fontSize="15" fontWeight="600">
        {fn.label}
      </text>
      <text x={BOTTOM.x + 14} y={BOTTOM.y + 24} fill={C.second} fontFamily="Geist" fontSize="15" fontWeight="600">
        {fn.dfLabel}
      </text>
    </svg>
  );
}

export const derivative: Topic = {
  id: 'pochodna',
  title: 'Pochodna – nachylenie stycznej',
  subject: 'matematyka',
  summary: 'Od siecznej do stycznej: granica ilorazu różnicowego, wykres pochodnej i ekstrema.',
  accent: '#f97362',
  glyph: '∂',
  steps: [
    {
      title: 'Sieczna i iloraz różnicowy',
      kind: '2d',
      scene: SecantScene,
      preset: { auto: false, tangent: false },
      controls: [
        fnControl,
        { type: 'slider', key: 'x0', label: 'Punkt A: x₀', min: -4, max: 4, step: 0.1, default: 1 },
        { type: 'slider', key: 'h', label: 'Przyrost h', min: 0.05, max: 3, step: 0.01, default: 2 },
      ],
      body: (
        <>
          <p>
            Weźmy dwa punkty wykresu: A(x₀, f(x₀)) i B(x₀ + h, f(x₀ + h)). Prosta przez nie to{' '}
            <strong>sieczna</strong>.
          </p>
          <p>
            Jej nachylenie to <strong>iloraz różnicowy</strong> – średnie tempo zmiany funkcji na odcinku długości h:
          </p>
          <div className="formula">Δy / Δx = (f(x₀ + h) − f(x₀)) / h</div>
          <p>Żółty trójkąt pokazuje przyrosty Δx i Δy. Zmniejszaj h i obserwuj, jak sieczna się obraca.</p>
        </>
      ),
    },
    {
      title: 'Granica: od siecznej do stycznej',
      kind: '2d',
      scene: SecantScene,
      preset: { tangent: true },
      controls: [
        { type: 'toggle', key: 'auto', label: 'Animuj h → 0', default: true },
        fnControl,
        { type: 'slider', key: 'x0', label: 'Punkt A: x₀', min: -4, max: 4, step: 0.1, default: 1 },
        { type: 'slider', key: 'h', label: 'Przyrost h (gdy animacja wyłączona)', min: 0.01, max: 3, step: 0.01, default: 1 },
      ],
      body: (
        <>
          <p>
            Gdy h dąży do zera, punkt B „zjeżdża” do A, a sieczna dąży do położenia granicznego – <strong>stycznej</strong>{' '}
            (zielona przerywana).
          </p>
          <div className="formula">f'(x₀) = lim₍ₕ→₀₎ (f(x₀ + h) − f(x₀)) / h</div>
          <p>
            Ta granica to <strong>pochodna funkcji w punkcie x₀</strong>: chwilowe tempo zmiany, czyli współczynnik
            kierunkowy stycznej. W fizyce to np. prędkość chwilowa.
          </p>
          <p>Porównaj wartości w ramce – przy małym h iloraz różnicowy prawie równa się f'(x₀).</p>
        </>
      ),
    },
    {
      title: 'Pochodna jako funkcja',
      kind: '2d',
      scene: DerivativeGraphScene,
      preset: { mono: false },
      controls: [
        { type: 'toggle', key: 'auto', label: 'Przesuwaj punkt automatycznie', default: true },
        fnControl,
        { type: 'slider', key: 'x0', label: 'x (gdy animacja wyłączona)', min: -4.5, max: 4.5, step: 0.05, default: 0 },
      ],
      body: (
        <>
          <p>
            Przesuwajmy punkt styczności po całym wykresie i zapisujmy nachylenie stycznej na dolnym wykresie. Powstaje
            nowa funkcja – <strong>pochodna f'</strong>.
          </p>
          <p>
            Gdy styczna jest stroma i rośnie – f' jest duże i dodatnie. Gdy styczna jest pozioma – f' = 0. Gdy opada –
            f' &lt; 0.
          </p>
          <p>Przełącz funkcję na 2 sin x: pochodną okazuje się 2 cos x, czyli ta sama fala przesunięta o ćwierć okresu.</p>
        </>
      ),
    },
    {
      title: 'Monotoniczność i ekstrema',
      kind: '2d',
      scene: DerivativeGraphScene,
      preset: { mono: true },
      controls: [
        { type: 'toggle', key: 'auto', label: 'Przesuwaj punkt automatycznie', default: false },
        fnControl,
        { type: 'slider', key: 'x0', label: 'x', min: -4.5, max: 4.5, step: 0.05, default: -1.4 },
      ],
      body: (
        <>
          <p>Znak pochodnej mówi, jak zachowuje się funkcja:</p>
          <p>
            <strong>f' &gt; 0</strong> → f rośnie (zielone odcinki), <strong>f' &lt; 0</strong> → f maleje (czerwone).
          </p>
          <p>
            Tam, gdzie pochodna <strong>zmienia znak</strong>, funkcja ma <strong>ekstremum</strong>: z + na − to
            maksimum, z − na + minimum. To podstawa zadań optymalizacyjnych na maturze rozszerzonej.
          </p>
          <p>Uwaga: samo f'(x) = 0 nie wystarcza – dla f(x) = x³ pochodna zeruje się w 0, ale nie zmienia znaku.</p>
        </>
      ),
    },
  ],
};
