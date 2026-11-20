import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { useAnimationClock } from '../../lib/useAnimationClock';
import { AngleArc, Board, C, Label, Poly, RightMark, Seg, num, squareFrame, usePlot } from '../../lib/mathkit';

type P = [number, number];
const add = (p: P, d: P): P => [p[0] + d[0], p[1] + d[1]];

/* ---------- Krok 1: dowód przez przestawienie ---------- */
function ProofScene({ params }: SceneProps) {
  const a = Number(params.a);
  const b = Number(params.b);
  const play = Boolean(params.play);
  const time = useAnimationClock(play, 0.6);
  const t = play ? (1 - Math.cos(time)) / 2 : Number(params.t);
  const S = a + b;
  const p = usePlot(squareFrame(S / 2, S / 2, S * 0.85));
  const tris: { pts: P[]; move: P; color: string }[] = [
    { pts: [[0, 0], [a, 0], [0, b]], move: [0, a], color: '#7b61ff' },
    { pts: [[a, 0], [S, 0], [S, a]], move: [0, 0], color: '#2b8cf0' },
    { pts: [[S, a], [S, S], [b, S]], move: [-b, 0], color: '#1fa36a' },
    { pts: [[b, S], [0, S], [0, b]], move: [a, -b], color: '#e38a1f' },
  ];
  const c = Math.hypot(a, b);
  return (
    <Board p={p} axes={false}>
      <Poly p={p} pts={[[0, 0], [S, 0], [S, S], [0, S]]} color="rgba(255,255,255,0.5)" width={2} />
      {/* c² w środku (pierwsze ułożenie) */}
      <g opacity={1 - t}>
        <Poly p={p} pts={[[a, 0], [S, a], [b, S], [0, b]]} color={C.main} fill={C.main} fillOpacity={0.3} width={3} />
        <Label p={p} x={S / 2} y={S / 2} dy={8} size={30} color={C.main}>
          c²
        </Label>
      </g>
      {/* a² i b² (drugie ułożenie) */}
      <g opacity={t}>
        <Poly p={p} pts={[[0, 0], [a, 0], [a, a], [0, a]]} color={C.third} fill={C.third} fillOpacity={0.3} width={3} />
        <Poly p={p} pts={[[a, a], [S, a], [S, S], [a, S]]} color={C.second} fill={C.second} fillOpacity={0.3} width={3} />
        <Label p={p} x={a / 2} y={a / 2} dy={8} size={26} color={C.third}>
          a²
        </Label>
        <Label p={p} x={a + b / 2} y={a + b / 2} dy={8} size={26} color={C.second}>
          b²
        </Label>
      </g>
      {tris.map((tr, i) => (
        <Poly key={i} p={p} pts={tr.pts.map((q) => add(q, [tr.move[0] * t, tr.move[1] * t]))} color={tr.color} fill={tr.color} fillOpacity={0.75} width={2} />
      ))}
      <InfoBox
        lines={[
          { text: `a = ${num(a)}, b = ${num(b)}, c = ${num(c)}` },
          { text: `duży kwadrat: (a + b)² = ${num(S * S)}`, color: 'rgba(255,255,255,0.7)' },
          { text: `4 trójkąty: 4 · ab/2 = ${num(2 * a * b)}` },
          { text: `wolne miejsce: c² = ${num(c * c)}`, color: C.main },
          { text: `wolne miejsce: a² + b² = ${num(a * a)} + ${num(b * b)} = ${num(a * a + b * b)}`, color: C.second },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: funkcje trygonometryczne kąta ostrego ---------- */
function RatioScene({ params }: SceneProps) {
  const deg = Number(params.alpha);
  const c = Number(params.c);
  const al = (deg * Math.PI) / 180;
  const a = c * Math.sin(al);
  const b = c * Math.cos(al);
  const p = usePlot(squareFrame(4, 3, 6));
  const A: P = [0, 0];
  const B: P = [b, 0];
  const Cp: P = [b, a];
  return (
    <Board p={p} axes={false}>
      <Poly p={p} pts={[A, B, Cp]} color="rgba(255,255,255,0.35)" fill="#ffffff" fillOpacity={0.04} width={1} />
      <Seg p={p} a={A} b={B} color={C.second} width={5} />
      <Seg p={p} a={B} b={Cp} color={C.third} width={5} />
      <Seg p={p} a={A} b={Cp} color={C.main} width={5} />
      <AngleArc p={p} v={A} a0={0} a1={al} r={1.1} color={C.good} />
      <RightMark p={p} v={B} a={Math.PI / 2} s={0.4} color="rgba(255,255,255,0.6)" />
      <Label p={p} x={1.5 * Math.cos(al / 2)} y={1.5 * Math.sin(al / 2)} dy={6} color={C.good} size={18}>
        α
      </Label>
      <Label p={p} x={b / 2} y={0} dy={26} color={C.second} size={17}>
        b (przyprostokątna przy α)
      </Label>
      <Label p={p} x={b} y={a / 2} dx={12} anchor="start" color={C.third} size={17}>
        a (naprzeciw α)
      </Label>
      <Label p={p} x={b / 2} y={a / 2} dx={-14} dy={-8} anchor="end" color={C.main} size={17}>
        c
      </Label>
      <InfoBox
        lines={[
          { text: `α = ${num(deg, 0)}°,  c = ${num(c)}` },
          { text: `sin α = a / c = ${num(a)} / ${num(c)} = ${num(Math.sin(al), 3)}`, color: C.third },
          { text: `cos α = b / c = ${num(b)} / ${num(c)} = ${num(Math.cos(al), 3)}`, color: C.second },
          { text: `tg α = a / b = ${deg >= 89.5 ? 'nie istnieje' : num(Math.tan(al), 3)}`, color: C.good },
          { text: 'zmień c – stosunki się nie zmieniają' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: twierdzenie cosinusów ---------- */
function CosineScene({ params }: SceneProps) {
  const a = Number(params.a);
  const b = Number(params.b);
  const deg = Number(params.gamma);
  const g = (deg * Math.PI) / 180;
  const Cp: P = [0, 0];
  const B: P = [a, 0];
  const A: P = [b * Math.cos(g), b * Math.sin(g)];
  const c2 = a * a + b * b - 2 * a * b * Math.cos(g);
  const c = Math.sqrt(c2);
  const xs = [0, a, A[0]];
  const p = usePlot(squareFrame((Math.min(...xs) + Math.max(...xs)) / 2, A[1] / 2, Math.max(4.5, (Math.max(...xs) - Math.min(...xs)) * 0.75)));
  const proj = b * Math.cos(g);
  return (
    <Board p={p} axes={false}>
      <Seg p={p} a={[Math.min(0, proj) - 0.3, 0]} b={[Math.max(a, proj) + 0.3, 0]} color={C.ghost} width={1} dash="3 6" />
      <Seg p={p} a={A} b={[proj, 0]} color={C.ghost} width={1.5} dash="4 5" />
      <Poly p={p} pts={[Cp, B, A]} color="rgba(255,255,255,0.35)" fill="#fff" fillOpacity={0.04} width={1} />
      <Seg p={p} a={Cp} b={B} color={C.second} width={5} />
      <Seg p={p} a={Cp} b={A} color={C.third} width={5} />
      <Seg p={p} a={A} b={B} color={C.main} width={5} />
      <AngleArc p={p} v={Cp} a0={0} a1={g} r={0.8} color={C.good} />
      <Label p={p} x={a / 2} y={0} dy={24} color={C.second} size={18}>
        a
      </Label>
      <Label p={p} x={A[0] / 2} y={A[1] / 2} dx={-14} anchor="end" color={C.third} size={18}>
        b
      </Label>
      <Label p={p} x={(A[0] + a) / 2} y={A[1] / 2} dx={14} anchor="start" color={C.main} size={18}>
        c
      </Label>
      <InfoBox
        lines={[
          { text: 'c² = a² + b² − 2ab · cos γ', color: C.main },
          { text: `c² = ${num(a * a)} + ${num(b * b)} − 2·${num(a)}·${num(b)}·${num(Math.cos(g), 3)} = ${num(c2)}` },
          { text: `c = ${num(c)}`, color: C.main },
          {
            text: Math.abs(deg - 90) < 0.5 ? 'γ = 90°: cos γ = 0 → zwykłe twierdzenie Pitagorasa' : deg < 90 ? 'γ ostry: c² < a² + b²' : 'γ rozwarty: c² > a² + b²',
            color: C.good,
          },
        ]}
      />
    </Board>
  );
}

export const pythagoras: Topic = {
  id: 'pitagoras-trygonometria',
  title: 'Pitagoras i trygonometria trójkąta',
  subject: 'matematyka',
  summary: 'Dowód twierdzenia Pitagorasa przez przestawienie czterech trójkątów, sinus i cosinus kąta ostrego oraz twierdzenie cosinusów.',
  accent: '#fb6f5c',
  glyph: 'a²',
  steps: [
    {
      title: 'Dowód bez słów',
      kind: '2d',
      scene: ProofScene,
      controls: [
        { type: 'slider', key: 'a', label: 'a', min: 1, max: 5, step: 0.1, default: 3 },
        { type: 'slider', key: 'b', label: 'b', min: 1, max: 5, step: 0.1, default: 4 },
        { type: 'slider', key: 't', label: 'Przestawienie', min: 0, max: 1, step: 0.01, default: 0, decimals: 2 },
        { type: 'toggle', key: 'play', label: 'Animuj', default: true },
      ],
      body: (
        <>
          <div className="formula">a² + b² = c²</div>
          <p>
            W kwadracie o boku a + b leżą cztery jednakowe trójkąty prostokątne. W pierwszym ułożeniu wolne miejsce to{' '}
            <strong>kwadrat o boku c</strong>.
          </p>
          <p>
            Przesuwamy trójkąty – niczego nie obracamy ani nie zmieniamy. Teraz wolne miejsce to{' '}
            <strong>dwa kwadraty: a² i b²</strong>. Duży kwadrat i trójkąty są te same, więc wolne pola też muszą być
            równe.
          </p>
          <p>Wyłącz animację i przesuń suwak „Przestawienie” ręcznie.</p>
        </>
      ),
    },
    {
      title: 'Sinus, cosinus i tangens kąta ostrego',
      kind: '2d',
      scene: RatioScene,
      controls: [
        { type: 'slider', key: 'alpha', label: 'Kąt α', min: 5, max: 85, step: 1, default: 35, unit: '°' },
        { type: 'slider', key: 'c', label: 'Przeciwprostokątna c', min: 2, max: 9, step: 0.1, default: 7 },
      ],
      body: (
        <>
          <div className="formula">sin α = a/c   cos α = b/c   tg α = a/b</div>
          <p>
            W trójkącie prostokątnym kąt ostry wyznacza <strong>proporcje boków</strong>. Powiększ trójkąt suwakiem c –
            wszystkie boki rosną, ale ich stosunki zostają te same. To dlatego sin 30° ma zawsze tę samą wartość.
          </p>
          <p>
            Zwiększając α, zobaczysz, że sinus rośnie, a cosinus maleje. Zawsze zachodzi{' '}
            <strong>sin²α + cos²α = 1</strong> – to twierdzenie Pitagorasa podzielone przez c².
          </p>
        </>
      ),
    },
    {
      title: 'Twierdzenie cosinusów',
      kind: '2d',
      scene: CosineScene,
      controls: [
        { type: 'slider', key: 'a', label: 'a', min: 2, max: 7, step: 0.1, default: 5 },
        { type: 'slider', key: 'b', label: 'b', min: 2, max: 7, step: 0.1, default: 4 },
        { type: 'slider', key: 'gamma', label: 'Kąt γ', min: 10, max: 170, step: 1, default: 60, unit: '°' },
      ],
      body: (
        <>
          <div className="formula">c² = a² + b² − 2ab · cos γ</div>
          <p>
            Twierdzenie Pitagorasa działa tylko dla kąta prostego. <strong>Twierdzenie cosinusów</strong> uogólnia je
            na każdy trójkąt: poprawka −2ab·cos γ mówi, o ile c² różni się od a² + b².
          </p>
          <p>
            Dla kąta ostrego cos γ &gt; 0 i bok c jest krótszy niż „pitagorejski”. Dla rozwartego – dłuższy. Ustaw
            γ = 90° i sprawdź, że poprawka znika.
          </p>
        </>
      ),
    },
  ],
};
