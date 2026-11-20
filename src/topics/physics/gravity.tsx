import { useEffect, useRef } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox, InfoPortal } from '../../lib/plot';
import { useCanvasLoop, useTicker } from '../../lib/useCanvasLoop';
import { Board, C, Curve, Pt, Seg, num, usePlot } from '../../lib/mathkit';
import { useSpeed } from '../../components/ui';

const GM = 398600; // km³/s²
const RE = 6371; // km

/* ---------- Krok 1: armata Newtona ---------- */
function CannonScene({ params }: SceneProps) {
  const sp = useSpeed();
  const v0 = Number(params.v);
  const speedUp = Number(params.speed);
  const st = useRef({ x: 0, y: RE + 400, vx: v0, vy: 0, trail: [] as [number, number][], t: 0, end: '', wait: 0 });
  const reset = () => {
    st.current = { x: 0, y: RE + 400, vx: v0, vy: 0, trail: [], t: 0, end: '', wait: 0 };
  };
  useEffect(reset, [v0]);
  useTicker(200);
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    const sub = 40;
    const step = (dt * speedUp * 60) / sub; // sekundy symulacji
    for (let i = 0; i < sub && !s.end; i++) {
      const r = Math.hypot(s.x, s.y);
      const a = -GM / (r * r * r);
      s.vx += a * s.x * step;
      s.vy += a * s.y * step;
      s.x += s.vx * step;
      s.y += s.vy * step;
      s.t += step;
      const rr = Math.hypot(s.x, s.y);
      if (rr < RE) s.end = 'ląduje';
      if (rr > RE * 9) s.end = 'ucieka';
    }
    if (s.trail.length === 0 || Math.hypot(s.x - s.trail[s.trail.length - 1][0], s.y - s.trail[s.trail.length - 1][1]) > 120) s.trail.push([s.x, s.y]);
    if (s.trail.length > 1500) s.trail.shift();
    const scale = Math.min(w, h) / (RE * 4.2);
    const cx = w / 2;
    const cy = h / 2 + h * 0.08;
    const X = (x: number) => cx + x * scale;
    const Y = (y: number) => cy - y * scale;
    // Ziemia
    const grad = ctx.createRadialGradient(cx - RE * scale * 0.3, cy - RE * scale * 0.3, RE * scale * 0.1, cx, cy, RE * scale);
    grad.addColorStop(0, '#3b82f6');
    grad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, RE * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(147,197,253,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, RE * scale + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    // góra z armatą
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(X(-700), Y(RE - 50));
    ctx.lineTo(X(0), Y(RE + 400));
    ctx.lineTo(X(700), Y(RE - 50));
    ctx.fill();
    // ślad
    ctx.strokeStyle = C.third;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.trail.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.lineTo(X(s.x), Y(s.y));
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = C.main;
    ctx.beginPath();
    ctx.arc(X(s.x), Y(s.y), 6, 0, Math.PI * 2);
    ctx.fill();
    if (s.end) {
      // po zakończeniu chwila przerwy i restart
      s.wait += dt;
      if (s.wait > 2) reset();
    }
    // pełne okrążenie – restart po dwóch obiegach
    if (s.t > 2 * 2 * Math.PI * Math.sqrt(((RE + 400) ** 3) / GM) * 1.6 && !s.end) reset();
  });
  const v1 = Math.sqrt(GM / (RE + 400));
  const v2 = Math.sqrt((2 * GM) / (RE + 400));
  const kind = v0 < v1 - 0.05 ? 'spada na Ziemię' : v0 < v1 + 0.05 ? 'orbita kołowa' : v0 < v2 ? 'orbita eliptyczna' : 'ucieka z pola grawitacyjnego Ziemi';
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div>
          start z wysokości 400 km, v = {sp.fmt(v0 * 1000)}
        </div>
        <div style={{ color: C.third, fontWeight: 600 }}>tor: {kind}</div>
        <div style={{ color: C.second }}>I prędkość kosmiczna (tu): √(GM/r) = {sp.fmt(v1 * 1000)}</div>
        <div style={{ color: C.main }}>II prędkość kosmiczna (tu): √(2GM/r) = {sp.fmt(v2 * 1000)}</div>
        <div className="muted-line">czas przyspieszony, opór powietrza pominięty</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Krok 2: natężenie pola grawitacyjnego ---------- */
const PLANETS: Record<string, { name: string; R: number; g: number }> = {
  ziemia: { name: 'Ziemia', R: 6371, g: 9.81 },
  ksiezyc: { name: 'Księżyc', R: 1737, g: 1.62 },
  mars: { name: 'Mars', R: 3390, g: 3.71 },
  jowisz: { name: 'Jowisz', R: 69911, g: 24.8 },
};
function FieldScene({ params }: SceneProps) {
  const P = PLANETS[String(params.planet)] ?? PLANETS.ziemia;
  const hR = Number(params.h); // wysokość w promieniach planety
  const p = usePlot({ x: 70, y: 25, w: 788, h: 495, xMin: 0, xMax: 6, yMin: 0, yMax: Math.ceil(P.g * 1.15) });
  const g = (r: number) => (r < 1 ? P.g * r : P.g / (r * r));
  const r = 1 + hR;
  const gh = g(r);
  return (
    <Board p={p} step={1} labels xLabel="r / R" yLabel="g [m/s²]">
      <rect x={p.sx(0)} y={p.sy(p.frame.yMax)} width={p.sx(1) - p.sx(0)} height={p.frame.h} fill="#3b82f6" opacity="0.12" />
      <Curve p={p} f={g} color={C.second} width={4} n={500} />
      <Curve p={p} f={(x) => (x > 0.3 ? P.g / (x * x) : NaN)} from={0.3} to={1} color={C.ghost} width={1.5} dash="5 6" />
      <Seg p={p} a={[r, 0]} b={[r, gh]} color={C.third} dash="5 5" />
      <Seg p={p} a={[0, gh]} b={[r, gh]} color={C.third} dash="5 5" />
      <Pt p={p} x={r} y={gh} color={C.third} />
      {P.name === 'Ziemia' && <Pt p={p} x={1 + 408 / 6371} y={g(1 + 408 / 6371)} color={C.good} r={5} />}
      <InfoBox
        lines={[
          { text: `${P.name}: R = ${P.R.toLocaleString('pl-PL')} km, g₀ = ${num(P.g, 2)} m/s²`, color: C.second },
          { text: `g(r) = g₀ · (R / r)²` },
          { text: `wysokość ${num(hR * P.R, 0)} km → g = ${num(gh, 2)} m/s² (${Math.round((gh / P.g) * 100)}% g₀)`, color: C.third },
          { text: P.name === 'Ziemia' ? 'zielony punkt – ISS (408 km): g ≈ 8,7 m/s², a astronauci są w nieważkości!' : '', color: C.good },
          { text: 'wewnątrz planety (jednorodnej) g maleje liniowo do zera' },
        ]}
      />
    </Board>
  );
}

export const gravity: Topic = {
  id: 'grawitacja',
  title: 'Grawitacja i prędkości kosmiczne',
  subject: 'fizyka',
  summary: 'Armata Newtona: od spadku przez orbitę kołową i eliptyczną do ucieczki z Ziemi, oraz natężenie pola grawitacyjnego malejące jak 1/r².',
  accent: '#6366f1',
  glyph: '♁',
  steps: [
    {
      title: 'Armata Newtona',
      kind: '2d',
      scene: CannonScene,
      controls: [
        { type: 'slider', key: 'v', label: 'Prędkość wystrzału', min: 3, max: 12, step: 0.1, default: 7.7, unit: 'km/s' },
        { type: 'slider', key: 'speed', label: 'Przyspieszenie czasu', min: 5, max: 60, step: 1, default: 30 },
      ],
      body: (
        <>
          <div className="formula">v₁ = √(GM/r)      v₂ = √(2GM/r) = √2 · v₁</div>
          <p>
            Newton wyobraził sobie armatę na bardzo wysokiej górze. Im szybciej wystrzelony pocisk, tym dalej spada. Przy
            pewnej prędkości Ziemia <strong>zakrzywia się pod nim tak samo szybko, jak on spada</strong> – pocisk krąży
            po orbicie.
          </p>
          <p>
            To <strong>pierwsza prędkość kosmiczna</strong> (ok. 7,7 km/s na wysokości 400 km). Szybciej – orbita
            wydłuża się w elipsę. Przy drugiej prędkości kosmicznej pocisk ucieka na zawsze.
          </p>
          <p>Satelita na orbicie cały czas spada – tylko ciągle „chybia” Ziemię.</p>
        </>
      ),
    },
    {
      title: 'Natężenie pola grawitacyjnego',
      kind: '2d',
      scene: FieldScene,
      controls: [
        {
          type: 'select',
          key: 'planet',
          label: 'Ciało niebieskie',
          default: 'ziemia',
          options: Object.entries(PLANETS).map(([value, pl]) => ({ value, label: pl.name })),
        },
        { type: 'slider', key: 'h', label: 'Wysokość nad powierzchnią (w promieniach R)', min: 0, max: 5, step: 0.02, default: 1, decimals: 2 },
      ],
      body: (
        <>
          <div className="formula">F = G·M·m / r²      g = G·M / r²</div>
          <p>
            Natężenie pola grawitacyjnego maleje z <strong>kwadratem odległości od środka</strong> planety. Na
            wysokości równej promieniowi Ziemi (r = 2R) g spada do jednej czwartej.
          </p>
          <p>
            Na wysokości stacji kosmicznej grawitacja jest prawie tak silna jak na powierzchni. Astronauci nie są „poza
            grawitacją” – <strong>razem ze stacją swobodnie spadają</strong>, i to jest źródło nieważkości.
          </p>
        </>
      ),
    },
  ],
};
