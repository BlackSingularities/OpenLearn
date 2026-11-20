import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { AngleArc, Band, Board, C, Curve, Pt, RightMark, Seg, num, squareFrame, term, usePlot } from '../../lib/mathkit';

const F = squareFrame(0, 0, 8);

const eq = (a: number, b: number, name = 'y') => {
  const s = `${term(a, 'x', true)}${term(b, '', Math.abs(a) < 1e-9)}`;
  return `${name} = ${s || '0'}`;
};

/* ---------- Krok 1: współczynniki ---------- */
function CoefScene({ params }: SceneProps) {
  const a = Number(params.a);
  const b = Number(params.b);
  const p = usePlot(F);
  const f = (x: number) => a * x + b;
  const x0 = Math.abs(a) > 1e-9 ? -b / a : NaN;
  const base = Number.isFinite(x0) && Math.abs(x0) < 6 ? x0 : 0;
  const alpha = Math.atan(a);
  return (
    <Board p={p}>
      <Curve p={p} f={(x) => a * x} color={C.ghost} width={1.5} dash="5 6" />
      <Curve p={p} f={f} color={C.main} width={4} />
      {/* trójkąt nachylenia: krok o 1 w prawo, a w górę */}
      <Seg p={p} a={[base, f(base)]} b={[base + 1, f(base)]} color={C.second} width={3} />
      <Seg p={p} a={[base + 1, f(base)]} b={[base + 1, f(base + 1)]} color={C.third} width={3} />
      {Number.isFinite(x0) && Math.abs(x0) < 8 && (
        <>
          <AngleArc p={p} v={[x0, 0]} a0={0} a1={alpha >= 0 ? alpha : Math.PI + alpha} r={0.9} color={C.good} />
          <Pt p={p} x={x0} y={0} color={C.good} />
        </>
      )}
      <Pt p={p} x={0} y={b} color={C.second} />
      <InfoBox
        lines={[
          { text: eq(a, b), color: C.main },
          { text: `a = ${num(a)} – o tyle rośnie y, gdy x rośnie o 1`, color: C.third },
          { text: `b = ${num(b)} – przecięcie z osią y: (0; ${num(b)})`, color: C.second },
          { text: Number.isFinite(x0) ? `miejsce zerowe x₀ = −b/a = ${num(x0)}` : b === 0 ? 'każdy x jest miejscem zerowym' : 'brak miejsc zerowych (prosta pozioma)', color: C.good },
          { text: `tg α = a  →  α ≈ ${num(((alpha >= 0 ? alpha : Math.PI + alpha) * 180) / Math.PI, 1)}°` },
          { text: a > 0 ? 'funkcja rosnąca' : a < 0 ? 'funkcja malejąca' : 'funkcja stała' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: równoległe i prostopadłe ---------- */
function RelationScene({ params }: SceneProps) {
  const a = Number(params.a);
  const b = Number(params.b);
  const b2 = Number(params.b2);
  const rel = String(params.rel);
  const p = usePlot(F);
  const perp = rel === 'perp';
  const a2 = perp ? (Math.abs(a) < 1e-9 ? NaN : -1 / a) : a;
  const ix = perp && Number.isFinite(a2) ? (b2 - b) / (a - a2) : NaN;
  const iy = a * ix + b;
  return (
    <Board p={p}>
      <Curve p={p} f={(x) => a * x + b} color={C.main} width={4} />
      {Number.isFinite(a2) ? <Curve p={p} f={(x) => a2 * x + b2} color={C.second} width={4} /> : <Seg p={p} a={[b2, -6]} b={[b2, 6]} color={C.second} width={4} />}
      {!perp && <Seg p={p} a={[0, b]} b={[0, b2]} color={C.third} width={2} dash="4 5" arrow />}
      {perp && Number.isFinite(ix) && (
        <>
          <RightMark p={p} v={[ix, iy]} a={Math.atan(a)} s={0.45} color={C.third} />
          <Pt p={p} x={ix} y={iy} color={C.third} />
        </>
      )}
      {perp && !Number.isFinite(a2) && <RightMark p={p} v={[b2, b]} a={0} s={0.45} color={C.third} />}
      <InfoBox
        lines={[
          { text: eq(a, b, 'k: y'), color: C.main },
          { text: Number.isFinite(a2) ? eq(a2, b2, 'l: y') : `l: x = ${num(b2)}`, color: C.second },
          perp
            ? { text: Number.isFinite(a2) ? `a₁ · a₂ = ${num(a)} · ${num(a2)} = −1` : 'a₁ = 0 → prostopadła jest pionowa', color: C.third }
            : { text: `a₁ = a₂ = ${num(a)}, różnią się tylko b`, color: C.third },
          { text: perp ? (Number.isFinite(ix) ? `punkt przecięcia (${num(ix)}; ${num(iy)})` : '') : b === b2 ? 'b₁ = b₂ → proste się pokrywają' : 'brak punktów wspólnych' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: układ równań ---------- */
function SystemScene({ params }: SceneProps) {
  const a1 = Number(params.a1);
  const b1 = Number(params.b1);
  const a2 = Number(params.a2);
  const b2 = Number(params.b2);
  const p = usePlot(F);
  const same = Math.abs(a1 - a2) < 1e-9;
  const x = same ? NaN : (b2 - b1) / (a1 - a2);
  const y = a1 * x + b1;
  const kind = !same ? 'oznaczony' : Math.abs(b1 - b2) < 1e-9 ? 'nieoznaczony' : 'sprzeczny';
  return (
    <Board p={p}>
      <Curve p={p} f={(t) => a1 * t + b1} color={C.main} width={4} />
      <Curve p={p} f={(t) => a2 * t + b2} color={C.second} width={kind === 'nieoznaczony' ? 8 : 4} opacity={kind === 'nieoznaczony' ? 0.6 : 1} />
      {kind === 'oznaczony' && Math.abs(x) < 9 && Math.abs(y) < 6 && (
        <>
          <Seg p={p} a={[x, 0]} b={[x, y]} color={C.third} dash="4 5" />
          <Seg p={p} a={[0, y]} b={[x, y]} color={C.third} dash="4 5" />
          <Pt p={p} x={x} y={y} color={C.third} r={7} />
        </>
      )}
      <InfoBox
        lines={[
          { text: eq(a1, b1), color: C.main },
          { text: eq(a2, b2), color: C.second },
          { text: `układ ${kind}`, color: kind === 'sprzeczny' ? C.bad : C.good },
          {
            text:
              kind === 'oznaczony'
                ? `jedno rozwiązanie: x = ${num(x)}, y = ${num(y)}`
                : kind === 'sprzeczny'
                  ? 'proste równoległe – zero rozwiązań'
                  : 'proste pokrywają się – nieskończenie wiele rozwiązań',
          },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 4: nierówność ---------- */
function InequalityScene({ params }: SceneProps) {
  const a = Number(params.a);
  const b = Number(params.b);
  const sign = String(params.sign);
  const p = usePlot(F);
  const f = (x: number) => a * x + b;
  const x0 = Math.abs(a) > 1e-9 ? -b / a : NaN;
  const gt = sign === '>';
  let from = -99;
  let to = 99;
  let text = '';
  if (Number.isFinite(x0)) {
    const right = (a > 0) === gt;
    if (right) from = x0;
    else to = x0;
    text = right ? `x ∈ (${num(x0)}; +∞)` : `x ∈ (−∞; ${num(x0)})`;
  } else {
    const ok = gt ? b > 0 : b < 0;
    if (!ok) to = from;
    text = ok ? 'x ∈ ℝ' : 'brak rozwiązań';
  }
  return (
    <Board p={p}>
      <path d={p.area(f, Math.max(-12, from), Math.min(12, to))} fill={C.good} opacity={0.18} />
      <Curve p={p} f={f} color={C.main} width={4} />
      <Band p={p} from={from} to={to} color={C.good} h={10} />
      {Number.isFinite(x0) && Math.abs(x0) < 8 && <circle cx={p.sx(x0)} cy={p.sy(0)} r="8" fill="#0b0d12" stroke={C.good} strokeWidth="3" />}
      <InfoBox
        lines={[
          { text: `${term(a, 'x', true)}${term(b, '', Math.abs(a) < 1e-9)} ${gt ? '>' : '<'} 0`, color: C.main },
          { text: Number.isFinite(x0) ? `miejsce zerowe x₀ = ${num(x0)} (kółko puste – nierówność ostra)` : '' },
          { text: a < 0 ? 'a < 0: dzieląc przez a, odwracamy znak nierówności!' : '' , color: C.third },
          { text, color: C.good },
        ]}
      />
    </Board>
  );
}

export const linear: Topic = {
  id: 'funkcja-liniowa',
  title: 'Funkcja liniowa',
  subject: 'matematyka',
  summary: 'Nachylenie i wyraz wolny, proste równoległe i prostopadłe, układy równań i nierówności – wszystko na jednym wykresie.',
  accent: '#f97362',
  glyph: '╱',
  steps: [
    {
      title: 'Współczynnik kierunkowy i wyraz wolny',
      kind: '2d',
      scene: CoefScene,
      controls: [
        { type: 'slider', key: 'a', label: 'a (kierunkowy)', min: -4, max: 4, step: 0.1, default: 0.5 },
        { type: 'slider', key: 'b', label: 'b (wyraz wolny)', min: -5, max: 5, step: 0.1, default: 1 },
      ],
      body: (
        <>
          <div className="formula">f(x) = ax + b</div>
          <p>
            <strong>Współczynnik a</strong> mówi, o ile zmienia się y, gdy x rośnie o 1 – pokazuje to żółto-niebieski
            schodek. Jednocześnie a = tg α, gdzie α to kąt między prostą a osią x.
          </p>
          <p>
            <strong>Wyraz wolny b</strong> przesuwa prostą w górę lub w dół: to miejsce, w którym wykres przecina oś y.
            Przerywana prosta y = ax pokazuje tę samą prostą bez przesunięcia.
          </p>
          <p>Ustaw a = 0 – funkcja staje się stała, a jej wykres poziomy.</p>
        </>
      ),
    },
    {
      title: 'Proste równoległe i prostopadłe',
      kind: '2d',
      scene: RelationScene,
      controls: [
        {
          type: 'select',
          key: 'rel',
          label: 'Druga prosta',
          default: 'perp',
          options: [
            { value: 'par', label: 'równoległa' },
            { value: 'perp', label: 'prostopadła' },
          ],
        },
        { type: 'slider', key: 'a', label: 'a₁', min: -3, max: 3, step: 0.1, default: 1.5 },
        { type: 'slider', key: 'b', label: 'b₁', min: -4, max: 4, step: 0.1, default: 0 },
        { type: 'slider', key: 'b2', label: 'b₂', min: -4, max: 4, step: 0.1, default: 2 },
      ],
      body: (
        <>
          <div className="formula">k ∥ l ⇔ a₁ = a₂        k ⊥ l ⇔ a₁ · a₂ = −1</div>
          <p>
            Proste <strong>równoległe</strong> mają ten sam współczynnik kierunkowy – mają to samo nachylenie i różnią
            się tylko przesunięciem b.
          </p>
          <p>
            Proste <strong>prostopadłe</strong> mają współczynniki o iloczynie −1, czyli a₂ = −1/a₁: odwrotność ze
            zmienionym znakiem. Im bardziej stroma pierwsza, tym bardziej płaska druga.
          </p>
        </>
      ),
    },
    {
      title: 'Układ dwóch równań',
      kind: '2d',
      scene: SystemScene,
      controls: [
        { type: 'slider', key: 'a1', label: 'a₁', min: -3, max: 3, step: 0.1, default: 1 },
        { type: 'slider', key: 'b1', label: 'b₁', min: -4, max: 4, step: 0.1, default: -1 },
        { type: 'slider', key: 'a2', label: 'a₂', min: -3, max: 3, step: 0.1, default: -0.5 },
        { type: 'slider', key: 'b2', label: 'b₂', min: -4, max: 4, step: 0.1, default: 2 },
      ],
      body: (
        <>
          <p>
            Każde równanie liniowe z dwiema niewiadomymi to prosta. Rozwiązanie układu to <strong>punkt wspólny</strong>{' '}
            obu prostych – jego współrzędne spełniają oba równania naraz.
          </p>
          <ul>
            <li>różne nachylenia → jeden punkt: układ oznaczony,</li>
            <li>to samo nachylenie, inne b → proste równoległe: układ sprzeczny,</li>
            <li>te same a i b → jedna prosta: układ nieoznaczony.</li>
          </ul>
          <p>Ustaw a₂ = a₁ i porównaj wyniki dla różnych b₂.</p>
        </>
      ),
    },
    {
      title: 'Nierówność liniowa',
      kind: '2d',
      scene: InequalityScene,
      controls: [
        { type: 'slider', key: 'a', label: 'a', min: -3, max: 3, step: 0.1, default: -1.5 },
        { type: 'slider', key: 'b', label: 'b', min: -5, max: 5, step: 0.1, default: 3 },
        {
          type: 'select',
          key: 'sign',
          label: 'Znak',
          default: '>',
          options: [
            { value: '>', label: 'ax + b > 0' },
            { value: '<', label: 'ax + b < 0' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Nierówność ax + b &gt; 0 pyta: <strong>dla jakich x wykres leży nad osią x</strong>? Granicą jest miejsce
            zerowe, a zielony pasek na osi to zbiór rozwiązań.
          </p>
          <p>
            Rozwiązując rachunkiem, dzielimy przez a. Gdy a &lt; 0, znak nierówności się odwraca – na wykresie widać,
            dlaczego: prosta maleje, więc jest dodatnia na lewo od miejsca zerowego.
          </p>
        </>
      ),
    },
  ],
};
