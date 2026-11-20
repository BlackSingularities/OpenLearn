import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { Board, C, Label, Poly, Seg, num, squareFrame, usePlot, AngleArc } from '../../lib/mathkit';

type P = [number, number];
const D2R = Math.PI / 180;
const MEDIA: Record<string, { name: string; n: number; color: string }> = {
  powietrze: { name: 'powietrze', n: 1.0, color: 'transparent' },
  woda: { name: 'woda', n: 1.33, color: '#3b82f6' },
  szklo: { name: 'szkło', n: 1.5, color: '#94a3b8' },
  diament: { name: 'diament', n: 2.42, color: '#e0f2fe' },
};
const LIGHT = '#fde68a';

/* ---------- Krok 1: załamanie i całkowite wewnętrzne odbicie ---------- */
function RefractionScene({ params }: SceneProps) {
  const m1 = MEDIA[String(params.m1)] ?? MEDIA.powietrze;
  const m2 = MEDIA[String(params.m2)] ?? MEDIA.woda;
  const a1 = Number(params.angle) * D2R;
  const p = usePlot(squareFrame(0, 0, 6));
  const L = 7;
  const sin2 = (m1.n / m2.n) * Math.sin(a1);
  const tir = sin2 > 1;
  const a2 = tir ? NaN : Math.asin(sin2);
  const crit = m1.n > m2.n ? Math.asin(m2.n / m1.n) / D2R : NaN;
  // promień pada z góry z lewej (ośrodek 1 na górze)
  const inc: P = [-Math.sin(a1) * L, Math.cos(a1) * L];
  const refl: P = [Math.sin(a1) * L, Math.cos(a1) * L];
  const refr: P = tir ? [0, 0] : [Math.sin(a2) * L, -Math.cos(a2) * L];
  // przybliżony współczynnik odbicia (Schlick)
  const r0 = ((m1.n - m2.n) / (m1.n + m2.n)) ** 2;
  const R = tir ? 1 : r0 + (1 - r0) * Math.pow(1 - Math.cos(a1), 5);
  const f = p.frame;
  return (
    <Board p={p} axes={false}>
      {m1.color !== 'transparent' && <rect x={f.x} y={f.y} width={f.w} height={p.sy(0) - f.y} fill={m1.color} opacity={0.18} />}
      {m2.color !== 'transparent' && <rect x={f.x} y={p.sy(0)} width={f.w} height={f.y + f.h - p.sy(0)} fill={m2.color} opacity={0.18} />}
      <Seg p={p} a={[f.xMin, 0]} b={[f.xMax, 0]} color="rgba(255,255,255,0.6)" width={2} />
      <Seg p={p} a={[0, -5]} b={[0, 5]} color={C.ghost} width={1.5} dash="6 6" />
      <Seg p={p} a={inc} b={[0, 0]} color={LIGHT} width={5} arrow />
      <Seg p={p} a={[0, 0]} b={refl} color={LIGHT} width={1 + R * 5} />
      {!tir && <Seg p={p} a={[0, 0]} b={refr} color={LIGHT} width={1 + (1 - R) * 5} />}
      <AngleArc p={p} v={[0, 0]} a0={Math.PI / 2} a1={Math.PI / 2 + a1} r={1.3} color={C.third} />
      {!tir && <AngleArc p={p} v={[0, 0]} a0={-Math.PI / 2} a1={-Math.PI / 2 + a2} r={1.3} color={C.good} />}
      <Label p={p} x={-5.6} y={3.2} anchor="start" color="#fff" size={16}>
        {m1.name} (n = {num(m1.n, 2)})
      </Label>
      <Label p={p} x={-5.6} y={-3.4} anchor="start" color="#fff" size={16}>
        {m2.name} (n = {num(m2.n, 2)})
      </Label>
      <InfoBox
        lines={[
          { text: 'n₁ · sin α = n₂ · sin β', color: '#fff' },
          { text: `α = ${num(a1 / D2R, 1)}°`, color: C.third },
          { text: tir ? 'całkowite wewnętrzne odbicie – brak promienia załamanego' : `β = ${num(a2 / D2R, 1)}°`, color: tir ? C.bad : C.good },
          { text: Number.isFinite(crit) ? `kąt graniczny: ${num(crit, 1)}°` : 'światło wchodzi do gęstszego ośrodka – załamuje się do normalnej' },
          { text: `odbija się ok. ${Math.round(R * 100)}% światła` },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: soczewki ---------- */
function LensScene({ params }: SceneProps) {
  const conv = String(params.type) !== 'div';
  const F = conv ? Number(params.f) : -Number(params.f);
  const x = Number(params.x); // odległość przedmiotu (dodatnia, po lewej)
  const h = 1.6;
  const p = usePlot(squareFrame(0, 0, 9));
  const y = (F * x) / (x - F); // 1/f = 1/x + 1/y
  const mag = -y / x;
  const hi = mag * h;
  const fr = p.frame;
  const O: P = [-x, h];
  const far = (a: P, b: P, toX: number): P => {
    const t = (toX - a[0]) / (b[0] - a[0]);
    return [toX, a[1] + (b[1] - a[1]) * t];
  };
  const real = Number.isFinite(y) && y > 0;
  const atInf = !Number.isFinite(y) || Math.abs(x - F) < 0.02;
  // promienie
  const r1a: P = [0, h]; // równoległy → przez ognisko F' (lub od F po lewej dla rozpraszającej)
  const r1dir: P = conv ? [F, 0] : [-Math.abs(F), 0];
  const r1end = conv ? far(r1a, r1dir, fr.xMax) : far(r1dir, r1a, fr.xMax);
  const r2end = far(O, [0, 0], fr.xMax);
  const lensH = 4.2;
  return (
    <Board p={p} axes={false}>
      <Seg p={p} a={[fr.xMin, 0]} b={[fr.xMax, 0]} color={C.ghost} width={1.5} />
      {/* soczewka */}
      <path
        d={
          conv
            ? `M${p.sx(0)},${p.sy(lensH)} Q${p.sx(0.7)},${p.sy(0)} ${p.sx(0)},${p.sy(-lensH)} Q${p.sx(-0.7)},${p.sy(0)} ${p.sx(0)},${p.sy(lensH)}`
            : `M${p.sx(-0.45)},${p.sy(lensH)} L${p.sx(0.45)},${p.sy(lensH)} Q${p.sx(0.05)},${p.sy(0)} ${p.sx(0.45)},${p.sy(-lensH)} L${p.sx(-0.45)},${p.sy(-lensH)} Q${p.sx(-0.05)},${p.sy(0)} ${p.sx(-0.45)},${p.sy(lensH)}`
        }
        fill="#93c5fd"
        opacity="0.3"
        stroke="#93c5fd"
        strokeWidth="2"
      />
      {[Math.abs(F), -Math.abs(F), 2 * Math.abs(F), -2 * Math.abs(F)].map((fx, i) => (
        <g key={i}>
          <circle cx={p.sx(fx)} cy={p.sy(0)} r={i < 2 ? 5 : 3.5} fill={i < 2 ? C.third : C.ghost} />
          <Label p={p} x={fx} y={0} dy={22} color={i < 2 ? C.third : C.text} size={14}>
            {i === 0 ? "F'" : i === 1 ? 'F' : i === 2 ? "2F'" : '2F'}
          </Label>
        </g>
      ))}
      {/* przedmiot */}
      <Seg p={p} a={[-x, 0]} b={O} color={C.good} width={5} arrow />
      {/* promienie */}
      <Seg p={p} a={O} b={r1a} color={LIGHT} width={2.5} />
      <Seg p={p} a={r1a} b={r1end} color={LIGHT} width={2.5} />
      <Seg p={p} a={O} b={r2end} color="#fdba74" width={2.5} />
      {!real && !atInf && (
        <>
          <Seg p={p} a={r1a} b={conv ? far(r1dir, r1a, fr.xMin) : r1dir} color={LIGHT} width={1.5} dash="5 6" />
          <Seg p={p} a={[0, 0]} b={far(O, [0, 0], fr.xMin)} color="#fdba74" width={1.5} dash="5 6" />
        </>
      )}
      {!atInf && Math.abs(y) < 30 && <Seg p={p} a={[y, 0]} b={[y, hi]} color={C.main} width={5} dash={real ? undefined : '6 5'} arrow />}
      <InfoBox
        lines={[
          { text: '1/f = 1/x + 1/y', color: '#fff' },
          { text: `f = ${num(F, 1)}, x = ${num(x, 1)}` },
          atInf
            ? { text: 'przedmiot w ognisku – promienie wychodzą równolegle, obrazu brak', color: C.bad }
            : { text: `y = ${num(y, 2)} → obraz ${real ? 'rzeczywisty' : 'pozorny'}`, color: C.main },
          { text: atInf ? '' : `powiększenie p = |y/x| = ${num(Math.abs(mag), 2)}, obraz ${mag < 0 ? 'odwrócony' : 'prosty'}, ${Math.abs(mag) > 1 ? 'powiększony' : 'pomniejszony'}`, color: C.main },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: rozszczepienie w pryzmacie ---------- */
const SPECTRUM = [
  { name: 'czerwone', color: '#ef4444', n: 1.5 },
  { name: 'pomarańczowe', color: '#f97316', n: 1.51 },
  { name: 'żółte', color: '#facc15', n: 1.52 },
  { name: 'zielone', color: '#22c55e', n: 1.535 },
  { name: 'niebieskie', color: '#3b82f6', n: 1.55 },
  { name: 'fioletowe', color: '#a855f7', n: 1.57 },
];
function PrismScene({ params }: SceneProps) {
  const inc = Number(params.angle) * D2R;
  const spread = Number(params.spread);
  const p = usePlot(squareFrame(0, 0.5, 7));
  const A: P = [0, 3.4];
  const Bp: P = [-3.2, -2.2];
  const Cp: P = [3.2, -2.2];
  const hit: P = [-1.6, 0.6]; // punkt na lewej ściance
  const edge1 = [A[0] - Bp[0], A[1] - Bp[1]];
  const len1 = Math.hypot(edge1[0], edge1[1]);
  const n1: P = [-edge1[1] / len1, edge1[0] / len1]; // normalna zewnętrzna lewej ścianki
  const normalAng = Math.atan2(n1[1], n1[0]);
  // kierunek padania: kąt inc od normalnej wewnętrznej, promień nadbiega z lewej, lekko od dołu
  const inAng = normalAng + Math.PI + inc;
  const dirIn: P = [Math.cos(inAng), Math.sin(inAng)];
  const start: P = [hit[0] - dirIn[0] * 6, hit[1] - dirIn[1] * 6];
  const refract = (d: P, n: P, n1i: number, n2i: number): P | null => {
    // n – normalna skierowana przeciwnie do d
    const cosi = -(d[0] * n[0] + d[1] * n[1]);
    const r = n1i / n2i;
    const k = 1 - r * r * (1 - cosi * cosi);
    if (k < 0) return null;
    const t = r * cosi - Math.sqrt(k);
    return [r * d[0] + t * n[0], r * d[1] + t * n[1]];
  };
  const rightEdge: [P, P] = [A, Cp];
  const intersect = (o: P, d: P, [a, b]: [P, P]): P | null => {
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den;
    const u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
    return t > 0 && u >= 0 && u <= 1 ? [o[0] + d[0] * t, o[1] + d[1] * t] : null;
  };
  const e2 = [Cp[0] - A[0], Cp[1] - A[1]];
  const l2 = Math.hypot(e2[0], e2[1]);
  const n2in: P = [e2[1] / l2, -e2[0] / l2]; // normalna prawej ścianki skierowana do wnętrza pryzmatu
  const rays = SPECTRUM.map((c) => {
    const nn = 1.5 + (c.n - 1.5) * spread;
    const d1 = refract(dirIn, n1, 1, nn);
    if (!d1) return null;
    const exit = intersect(hit, d1, rightEdge);
    if (!exit) return null;
    const d2 = refract(d1, n2in, nn, 1);
    return { c, d1, exit, d2 };
  });
  return (
    <Board p={p} axes={false}>
      <Poly p={p} pts={[A, Bp, Cp]} color="#cbd5e1" fill="#cbd5e1" fillOpacity={0.12} width={2} />
      <Seg p={p} a={start} b={hit} color="#ffffff" width={5} />
      {rays.map((r, i) =>
        r ? (
          <g key={i}>
            <Seg p={p} a={hit} b={r.exit} color={r.c.color} width={2} />
            {r.d2 ? <Seg p={p} a={r.exit} b={[r.exit[0] + r.d2[0] * 9, r.exit[1] + r.d2[1] * 9]} color={r.c.color} width={4} /> : null}
          </g>
        ) : null,
      )}
      <InfoBox
        lines={[
          { text: 'współczynnik załamania zależy od barwy (dyspersja)', color: '#fff' },
          { text: 'fiolet załamuje się najmocniej, czerwień najsłabiej', color: '#c084fc' },
          { text: spread > 1 ? `różnice n powiększone ${num(spread, 1)}× dla czytelności` : 'rzeczywiste różnice n dla szkła' },
          { text: rays.some((r) => !r || !r.d2) ? 'część barw ulega całkowitemu wewnętrznemu odbiciu – zwiększ kąt padania' : '', color: C.bad },
        ]}
      />
    </Board>
  );
}

export const optics: Topic = {
  id: 'optyka',
  title: 'Optyka geometryczna',
  subject: 'fizyka',
  summary: 'Załamanie światła i całkowite wewnętrzne odbicie, konstrukcja obrazu w soczewce skupiającej i rozpraszającej oraz tęcza z pryzmatu.',
  accent: '#e879f9',
  glyph: '◭',
  steps: [
    {
      title: 'Załamanie światła',
      kind: '2d',
      scene: RefractionScene,
      controls: [
        {
          type: 'select',
          key: 'm1',
          label: 'Ośrodek 1 (górny)',
          default: 'powietrze',
          options: Object.entries(MEDIA).map(([value, m]) => ({ value, label: m.name })),
        },
        {
          type: 'select',
          key: 'm2',
          label: 'Ośrodek 2 (dolny)',
          default: 'woda',
          options: Object.entries(MEDIA).map(([value, m]) => ({ value, label: m.name })),
        },
        { type: 'slider', key: 'angle', label: 'Kąt padania α', min: 0, max: 89, step: 0.5, default: 40, unit: '°' },
      ],
      body: (
        <>
          <div className="formula">n₁ · sin α = n₂ · sin β</div>
          <p>
            Na granicy ośrodków światło zmienia prędkość i <strong>skręca</strong>. Wchodząc do gęstszego optycznie
            ośrodka (większe n), zbliża się do normalnej (przerywana linia).
          </p>
          <p>
            Ustaw szkło na górze i powietrze na dole, a potem zwiększaj kąt. Przy kącie granicznym promień załamany biegnie
            wzdłuż granicy, a dalej znika – zachodzi <strong>całkowite wewnętrzne odbicie</strong>. Na tym działają
            światłowody i blask diamentu.
          </p>
        </>
      ),
    },
    {
      title: 'Obraz w soczewce',
      kind: '2d',
      scene: LensScene,
      controls: [
        {
          type: 'select',
          key: 'type',
          label: 'Soczewka',
          default: 'conv',
          options: [
            { value: 'conv', label: 'skupiająca' },
            { value: 'div', label: 'rozpraszająca' },
          ],
        },
        { type: 'slider', key: 'f', label: 'Ogniskowa f', min: 1.5, max: 4, step: 0.1, default: 2.5 },
        { type: 'slider', key: 'x', label: 'Odległość przedmiotu x', min: 0.6, max: 8.5, step: 0.05, default: 6 },
      ],
      body: (
        <>
          <div className="formula">1/f = 1/x + 1/y      p = |y| / x</div>
          <p>
            Obraz konstruujemy dwoma promieniami: <strong>równoległy</strong> do osi po przejściu biegnie przez ognisko,
            a promień przez <strong>środek soczewki</strong> nie zmienia kierunku. Obraz leży tam, gdzie się przecinają.
          </p>
          <ul>
            <li>x &gt; 2f – obraz rzeczywisty, odwrócony, pomniejszony (aparat fotograficzny),</li>
            <li>f &lt; x &lt; 2f – rzeczywisty, odwrócony, powiększony (projektor),</li>
            <li>x &lt; f – pozorny, prosty, powiększony (lupa).</li>
          </ul>
          <p>Soczewka rozpraszająca zawsze daje obraz pozorny, prosty i pomniejszony.</p>
        </>
      ),
    },
    {
      title: 'Rozszczepienie światła',
      kind: '2d',
      scene: PrismScene,
      controls: [
        { type: 'slider', key: 'angle', label: 'Kąt padania', min: 30, max: 75, step: 1, default: 55, unit: '°' },
        { type: 'slider', key: 'spread', label: 'Wzmocnienie dyspersji', min: 1, max: 3, step: 0.25, default: 2.5 },
      ],
      body: (
        <>
          <p>
            Światło białe to mieszanina barw. Współczynnik załamania szkła jest nieco <strong>większy dla fioletu</strong>{' '}
            niż dla czerwieni, więc każda barwa skręca o trochę inny kąt i wiązka rozszczepia się w widmo.
          </p>
          <p>
            Prawdziwe różnice są małe (n od ok. 1,51 do 1,53), dlatego suwak pozwala je powiększyć. Tak samo krople
            deszczu rozszczepiają światło słoneczne w tęczę.
          </p>
        </>
      ),
    },
  ],
};
