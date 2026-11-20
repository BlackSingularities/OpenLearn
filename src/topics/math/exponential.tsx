import { useMemo } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox, Sparkline, InfoPortal } from '../../lib/plot';
import { useAnimationClock } from '../../lib/useAnimationClock';
import { Board, C, Curve, Pt, Seg, VIEW, num, squareFrame, usePlot } from '../../lib/mathkit';

/* ---------- Krok 1: funkcja wykładnicza ---------- */
function ExpScene({ params }: SceneProps) {
  const a = Number(params.a);
  const p = usePlot(squareFrame(0, 3, 6));
  const f = (x: number) => Math.pow(a, x);
  return (
    <Board p={p}>
      <Curve p={p} f={(x) => Math.pow(2, x)} color={C.ghost} width={1.5} dash="5 6" />
      <Curve p={p} f={(x) => Math.pow(0.5, x)} color={C.ghost} width={1.5} dash="5 6" />
      <Seg p={p} a={[-6, 0.02]} b={[6, 0.02]} color={C.second} width={3} dash="2 7" />
      <Curve p={p} f={f} color={C.main} width={4} />
      <Seg p={p} a={[1, 0]} b={[1, a]} color={C.third} dash="4 5" />
      <Pt p={p} x={0} y={1} color={C.second} />
      <Pt p={p} x={1} y={a} color={C.third} />
      <InfoBox
        lines={[
          { text: `f(x) = ${num(a)}ˣ`, color: C.main },
          { text: 'zawsze przechodzi przez (0; 1), bo a⁰ = 1', color: C.second },
          { text: `f(1) = a = ${num(a)}`, color: C.third },
          { text: a > 1 ? 'a > 1 → funkcja rosnąca' : a < 1 ? '0 < a < 1 → funkcja malejąca' : 'a = 1 → funkcja stała' },
          { text: 'asymptota pozioma y = 0, zbiór wartości (0; +∞)' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: logarytm jako funkcja odwrotna ---------- */
function LogScene({ params }: SceneProps) {
  const a = Number(params.a);
  const t = Number(params.t);
  const p = usePlot(squareFrame(1.5, 1.5, 6));
  const f = (x: number) => Math.pow(a, x);
  const g = (x: number) => (x <= 0 ? NaN : Math.log(x) / Math.log(a));
  const y = f(t);
  return (
    <Board p={p}>
      <Curve p={p} f={(x) => x} color={C.ghost} width={1.5} dash="5 6" />
      <Curve p={p} f={f} color={C.main} width={3.5} />
      <Curve p={p} f={g} color={C.second} width={3.5} from={0.001} />
      <Seg p={p} a={[t, y]} b={[y, t]} color={C.third} width={2} dash="3 5" />
      <Pt p={p} x={t} y={y} color={C.main} />
      <Pt p={p} x={y} y={t} color={C.second} />
      <InfoBox
        lines={[
          { text: `f(x) = ${num(a)}ˣ`, color: C.main },
          { text: `g(x) = log${sub(a)} x`, color: C.second },
          { text: `${num(a)}^${num(t)} = ${num(y)}   ⇔   log${sub(a)} ${num(y)} = ${num(t)}`, color: C.third },
          { text: 'wykresy są symetryczne względem prostej y = x' },
        ]}
      />
    </Board>
  );
}
const sub = (a: number) =>
  num(a, 1)
    .split('')
    .map((ch) => '₀₁₂₃₄₅₆₇₈₉'[Number(ch)] ?? (ch === ',' ? '‚' : ch))
    .join('');

/* ---------- Krok 3: procent składany ---------- */
function InterestScene({ params }: SceneProps) {
  const r = Number(params.r) / 100;
  const years = Number(params.n);
  const k = Number(params.k);
  const K0 = 1000;
  const compound = Array.from({ length: years + 1 }, (_, i) => K0 * Math.pow(1 + r / k, k * i));
  const simple = Array.from({ length: years + 1 }, (_, i) => K0 * (1 + r * i));
  const max = Math.max(...compound) * 1.08;
  const X0 = 80;
  const Y0 = 510;
  const W = 790;
  const H = 460;
  const bw = W / (years + 1);
  const sy = (v: number) => Y0 - (v / max) * H;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((q) => Math.round((max * q) / 100) * 100);
  return (
    <svg viewBox={VIEW}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={X0} x2={X0 + W} y1={sy(v)} y2={sy(v)} stroke="rgba(255,255,255,0.07)" />
          <text x={X0 - 10} y={sy(v) + 4} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="end">
            {v.toLocaleString('pl-PL')}
          </text>
        </g>
      ))}
      {compound.map((v, i) => (
        <g key={i}>
          <rect x={X0 + i * bw + bw * 0.12} y={sy(v)} width={bw * 0.38} height={Y0 - sy(v)} rx="3" fill={C.main} />
          <rect x={X0 + i * bw + bw * 0.52} y={sy(simple[i])} width={bw * 0.38} height={Y0 - sy(simple[i])} rx="3" fill={C.second} opacity="0.75" />
          {(years <= 15 || i % 5 === 0) && (
            <text x={X0 + i * bw + bw / 2} y={Y0 + 18} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="middle">
              {i}
            </text>
          )}
        </g>
      ))}
      <line x1={X0} x2={X0 + W} y1={Y0} y2={Y0} stroke={C.axis} strokeWidth="1.5" />
      <InfoBox
        lines={[
          { text: `Kₙ = K₀ · (1 + r/k)^(k·n)`, color: C.main },
          { text: `po ${years} latach: ${Math.round(compound[years]).toLocaleString('pl-PL')} zł (składany)`, color: C.main },
          { text: `po ${years} latach: ${Math.round(simple[years]).toLocaleString('pl-PL')} zł (prosty)`, color: C.second },
          { text: `podwojenie po ok. ${num(Math.log(2) / (k * Math.log(1 + r / k)), 1)} roku` },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 4: rozpad połowiczny ---------- */
const N = 400;
function DecayScene({ params }: SceneProps) {
  const half = Number(params.half);
  const playing = Boolean(params.play);
  const time = useAnimationClock(playing, 1);
  const life = useMemo(() => {
    // deterministyczne „losowanie” czasu życia: t = −T½ · log₂(u)
    let s = 7;
    return Array.from({ length: N }, () => {
      s = (s * 16807) % 2147483647;
      return -Math.log2(s / 2147483647);
    });
  }, []);
  const cycle = half * 6;
  const t = time % cycle;
  const alive = life.filter((l) => l * half > t).length;
  const cols = 25;
  const series = useMemo(() => Array.from({ length: 60 }, (_, i) => N * Math.pow(0.5, (i / 59) * 6)), []);
  const p = usePlot({ x: 520, y: 70, w: 340, h: 380, xMin: 0, xMax: 6, yMin: 0, yMax: 1 });
  return (
    <svg viewBox={VIEW}>
      {life.map((l, i) => {
        const on = l * half > t;
        return <circle key={i} cx={50 + (i % cols) * 17} cy={80 + Math.floor(i / cols) * 24} r="6" fill={on ? C.good : 'rgba(255,255,255,0.08)'} style={{ transition: 'fill 0.3s' }} />;
      })}
      <rect x={p.sx(0)} y={p.sy(1)} width={340} height={380} fill="rgba(255,255,255,0.03)" rx="8" />
      <path d={p.path((x) => Math.pow(0.5, x), 0, 6)} fill="none" stroke={C.main} strokeWidth="3" />
      {[1, 2, 3, 4, 5].map((k) => (
        <g key={k}>
          <line x1={p.sx(k)} x2={p.sx(k)} y1={p.sy(0)} y2={p.sy(Math.pow(0.5, k))} stroke={C.ghost} strokeDasharray="3 5" />
          <text x={p.sx(k)} y={p.sy(0) + 18} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="middle">
            {k}T
          </text>
        </g>
      ))}
      <circle cx={p.sx(t / half)} cy={p.sy(alive / N)} r="7" fill={C.good} stroke="#0b0d12" strokeWidth="2" />
      <InfoPortal>
        <div style={{ color: C.good, fontWeight: 600 }}>
          zostało {alive} z {N} jąder
        </div>
        <div>czas: {num(t, 1)} s = {num(t / half, 2)} T½</div>
        <div style={{ color: C.main }}>wzór: N = N₀ · (½)^(t/T½) = {Math.round(N * Math.pow(0.5, t / half))}</div>
        <Sparkline series={[{ data: series, color: C.main }]} min={0} max={N} title="model" height={40} />
      </InfoPortal>
    </svg>
  );
}

export const exponential: Topic = {
  id: 'funkcja-wykladnicza',
  title: 'Funkcja wykładnicza i logarytm',
  subject: 'matematyka',
  summary: 'aˣ i logₐx jako lustrzane odbicia, procent składany na słupkach i rozpad promieniotwórczy na żywo.',
  accent: '#ef4f6b',
  glyph: 'eˣ',
  steps: [
    {
      title: 'Funkcja wykładnicza',
      kind: '2d',
      scene: ExpScene,
      controls: [{ type: 'slider', key: 'a', label: 'Podstawa a', min: 0.2, max: 4, step: 0.05, default: 2 }],
      body: (
        <>
          <div className="formula">f(x) = aˣ,   a &gt; 0, a ≠ 1</div>
          <p>
            Zmienna jest w <strong>wykładniku</strong>. Każdy krok o 1 w prawo mnoży wartość przez a – dlatego dla a &gt;
            1 wykres najpierw ledwie rośnie, a potem wystrzela w górę.
          </p>
          <p>
            Wszystkie te funkcje przechodzą przez <strong>(0; 1)</strong> i nigdy nie dotykają osi x – prosta y = 0 jest
            asymptotą. Gdy 0 &lt; a &lt; 1, funkcja maleje: (½)ˣ to lustrzane odbicie 2ˣ względem osi y.
          </p>
        </>
      ),
    },
    {
      title: 'Logarytm – odwrotność potęgi',
      kind: '2d',
      scene: LogScene,
      controls: [
        { type: 'slider', key: 'a', label: 'Podstawa a', min: 1.2, max: 4, step: 0.05, default: 2 },
        { type: 'slider', key: 't', label: 'Punkt x', min: -2, max: 2.5, step: 0.05, default: 1.5 },
      ],
      body: (
        <>
          <div className="formula">logₐ b = c  ⇔  aᶜ = b</div>
          <p>
            Logarytm odpowiada na pytanie: <strong>do jakiej potęgi</strong> podnieść a, żeby dostać b? To działanie
            odwrotne do potęgowania – zamienia rolami x i y.
          </p>
          <p>
            Dlatego wykres logₐx to odbicie aˣ względem prostej y = x. Przesuń punkt: różowy (t; aᵗ) i niebieski (aᵗ; t)
            zawsze leżą symetrycznie. Dziedzina logarytmu to (0; +∞), a oś y jest jego asymptotą.
          </p>
        </>
      ),
    },
    {
      title: 'Procent składany',
      kind: '2d',
      scene: InterestScene,
      controls: [
        { type: 'slider', key: 'r', label: 'Oprocentowanie roczne', min: 1, max: 20, step: 0.5, default: 8, unit: '%' },
        { type: 'slider', key: 'n', label: 'Liczba lat', min: 5, max: 40, step: 1, default: 20 },
        {
          type: 'select',
          key: 'k',
          label: 'Kapitalizacja',
          default: '1',
          options: [
            { value: '1', label: 'roczna' },
            { value: '4', label: 'kwartalna' },
            { value: '12', label: 'miesięczna' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Wpłacamy 1000 zł. Przy <strong>procencie prostym</strong> (niebieskie słupki) co roku dostajemy te same
            odsetki – wzrost liniowy.
          </p>
          <p>
            Przy <strong>procencie składanym</strong> (różowe) odsetki doliczają się do kapitału i same zarabiają.
            Kapitał rośnie jak ciąg geometryczny, czyli wykładniczo – różnica po latach staje się ogromna.
          </p>
          <p>Częstsza kapitalizacja daje odrobinę więcej, ale prawdziwą różnicę robi czas.</p>
        </>
      ),
    },
    {
      title: 'Rozpad połowiczny',
      kind: '2d',
      scene: DecayScene,
      controls: [
        { type: 'slider', key: 'half', label: 'Czas połowicznego rozpadu', min: 1, max: 5, step: 0.5, default: 2, unit: 's' },
        { type: 'toggle', key: 'play', label: 'Odtwarzaj', default: true },
      ],
      body: (
        <>
          <div className="formula">N(t) = N₀ · (½)^(t / T½)</div>
          <p>
            Każde jądro rozpada się <strong>losowo</strong>, ale po czasie T½ zostaje mniej więcej połowa, po 2T½ –
            ćwierć, po 3T½ – jedna ósma.
          </p>
          <p>
            To funkcja wykładnicza o podstawie ½. Kropki po lewej to pojedyncze jądra, wykres po prawej – model. Im
            więcej jąder, tym lepiej losowość zgadza się ze wzorem.
          </p>
        </>
      ),
    },
  ],
};
