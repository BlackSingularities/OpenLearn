import { useEffect, useRef } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox, InfoPortal } from '../../lib/plot';
import { useAnimationClock } from '../../lib/useAnimationClock';
import { useCanvasLoop } from '../../lib/useCanvasLoop';
import { C, VIEW, num } from '../../lib/mathkit';

const HC = 1240; // eV·nm

/** Przybliżony kolor światła o długości fali λ [nm]; poza zakresem widzialnym – szarości. */
export function waveColor(l: number): string {
  if (l < 380) return '#c4b5fd';
  if (l > 750) return '#7f1d1d';
  const stops: [number, [number, number, number]][] = [
    [380, [120, 0, 200]],
    [440, [60, 60, 255]],
    [490, [0, 200, 255]],
    [510, [0, 255, 100]],
    [580, [255, 240, 0]],
    [645, [255, 60, 0]],
    [750, [180, 0, 0]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (l >= a && l <= b) {
      const t = (l - a) / (b - a);
      const c = ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return '#fff';
}

/* ---------- Krok 1: efekt fotoelektryczny ---------- */
const METALS: Record<string, { name: string; W: number; color: string }> = {
  cez: { name: 'cez', W: 2.1, color: '#d4b483' },
  sod: { name: 'sód', W: 2.3, color: '#cbd5e1' },
  cynk: { name: 'cynk', W: 4.3, color: '#94a3b8' },
  platyna: { name: 'platyna', W: 5.6, color: '#e5e7eb' },
};
function PhotoScene({ params }: SceneProps) {
  const lambda = Number(params.lambda);
  const I = Number(params.I);
  const M = METALS[String(params.metal)] ?? METALS.sod;
  const E = HC / lambda;
  const Ek = E - M.W;
  const st = useRef({ photons: [] as { x: number; y: number }[], electrons: [] as { x: number; y: number; vx: number; vy: number }[], acc: 0 });
  useEffect(() => {
    st.current.photons = [];
    st.current.electrons = [];
  }, [lambda, M]);
  const col = waveColor(lambda);
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    const plateX = w * 0.55;
    s.acc += dt * I * 1.2;
    while (s.acc > 1) {
      s.acc -= 1;
      s.photons.push({ x: 60, y: h * 0.25 + Math.random() * h * 0.5 });
    }
    // lampa
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(4, h / 2 - 34, 52, 68, 8);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.06 + I * 0.008;
    ctx.beginPath();
    ctx.moveTo(56, h / 2 - 26);
    ctx.lineTo(plateX, h * 0.22);
    ctx.lineTo(plateX, h * 0.78);
    ctx.lineTo(56, h / 2 + 26);
    ctx.fill();
    ctx.globalAlpha = 1;
    // płytka
    ctx.fillStyle = M.color;
    ctx.fillRect(plateX, h * 0.18, 16, h * 0.64);
    s.photons = s.photons.filter((p) => {
      p.x += 420 * dt;
      const yy = p.y;
      if (p.x >= plateX) {
        if (Ek > 0) s.electrons.push({ x: plateX + 16, y: yy, vx: 40 + Math.sqrt(Ek) * 90 * (0.6 + Math.random() * 0.4), vy: (Math.random() - 0.5) * 60 * Math.sqrt(Ek) });
        return false;
      }
      // foton jako krótki pakiet falowy
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const xx = p.x - 16 + k * 2;
        const amp = 5 * Math.sin((k / 16) * Math.PI);
        const yv = yy + amp * Math.sin((k * 2 * Math.PI * 400) / lambda / 4);
        if (k) ctx.lineTo(xx, yv);
        else ctx.moveTo(xx, yv);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      return true;
    });
    s.electrons = s.electrons.filter((e) => {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      ctx.fillStyle = C.second;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      return e.x < w + 10 && e.y > -10 && e.y < h + 10;
    });
  });
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div style={{ color: col === '#c4b5fd' ? '#c4b5fd' : col, fontWeight: 600 }}>
          λ = {lambda} nm → energia fotonu E = hc/λ = {num(E, 2)} eV {lambda < 380 ? '(nadfiolet)' : lambda > 750 ? '(podczerwień)' : ''}
        </div>
        <div>
          praca wyjścia ({M.name}): W = {num(M.W, 1)} eV, próg λ = {num(HC / M.W, 0)} nm
        </div>
        <div style={{ color: Ek > 0 ? C.good : C.bad, fontWeight: 600 }}>
          {Ek > 0 ? `elektrony wylatują z Ek max = E − W = ${num(Ek, 2)} eV` : 'E < W – żaden elektron nie wylatuje, nawet przy silnym świetle'}
        </div>
        <div className="muted-line">natężenie zmienia liczbę fotonów, nie ich energię</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Krok 2: model Bohra i widmo wodoru ---------- */
const SERIES: Record<number, string> = { 1: 'Lymana (nadfiolet)', 2: 'Balmera (widzialna)', 3: 'Paschena (podczerwień)', 4: 'Bracketta', 5: 'Pfunda' };
function BohrScene({ params }: SceneProps) {
  const up = Number(params.up);
  const low = Math.min(Number(params.low), up - 1);
  const t = useAnimationClock(true, 1);
  const En = (n: number) => -13.6 / (n * n);
  const dE = En(up) - En(low);
  const lambda = HC / dE;
  const col = waveColor(lambda);
  const phase = t % 3; // 0–1: elektron na wyższej orbicie, 1–1,4: skok, potem foton
  const rr = (n: number) => 22 + n * n * 9;
  const cx = 230;
  const cy = 290;
  const curN = phase < 1 ? up : phase < 1.4 ? up + (low - up) * ((phase - 1) / 0.4) : low;
  const ang = t * 2.2;
  const ex = cx + rr(curN) * Math.cos(ang);
  const ey = cy + rr(curN) * Math.sin(ang);
  // diagram poziomów
  const LX = 500;
  const LW = 340;
  const yOf = (E: number) => 70 + (1 - Math.pow(-E / 13.6, 0.45)) * 380;
  const spectrum = [3, 4, 5, 6, 7].map((n) => HC / (En(n) - En(2)));
  return (
    <svg viewBox={VIEW}>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <circle key={n} cx={cx} cy={cy} r={rr(n)} fill="none" stroke={n === up || n === low ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)'} strokeWidth="1.5" strokeDasharray={n === up || n === low ? undefined : '3 5'} />
      ))}
      <circle cx={cx} cy={cy} r="9" fill={C.main} />
      <circle cx={ex} cy={ey} r="6" fill={C.second} />
      {phase > 1.4 && (
        <g transform={`translate(${cx + rr(low) + (phase - 1.4) * 160} ${cy - 40 - (phase - 1.4) * 60})`}>
          <path d={Array.from({ length: 21 }, (_, k) => `${k ? 'L' : 'M'}${k * 2.5},${Math.sin(k * 0.9) * 6}`).join(' ')} fill="none" stroke={col} strokeWidth="3" />
        </g>
      )}
      {/* poziomy energetyczne */}
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <g key={n}>
          <line x1={LX} x2={LX + LW} y1={yOf(En(n))} y2={yOf(En(n))} stroke={n === up || n === low ? '#fff' : 'rgba(255,255,255,0.3)'} strokeWidth={n === up || n === low ? 2.5 : 1.5} />
          <text x={LX - 8} y={yOf(En(n)) + 4} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="end">
            n={n}
          </text>
          <text x={LX + LW + 6} y={yOf(En(n)) + 4} fill={C.text} fontFamily="Geist" fontSize="11">
            {num(En(n), 2)} eV
          </text>
        </g>
      ))}
      <line x1={LX + LW / 2} x2={LX + LW / 2} y1={yOf(En(up))} y2={yOf(En(low)) - 6} stroke={col} strokeWidth="4" markerEnd="url(#bohr-arr)" />
      <defs>
        <marker id="bohr-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={col} />
        </marker>
      </defs>
      {/* widmo Balmera */}
      <defs>
        <linearGradient id="vis" x1="0" x2="1">
          {[380, 440, 490, 510, 580, 645, 750].map((l) => (
            <stop key={l} offset={(l - 380) / 370} stopColor={waveColor(l)} stopOpacity="0.18" />
          ))}
        </linearGradient>
      </defs>
      <rect x={LX} y={500} width={LW} height="30" fill="url(#vis)" rx="4" />
      {spectrum.map((l, i) => (l >= 380 && l <= 750 ? <rect key={i} x={LX + ((l - 380) / 370) * LW - 1.5} y={500} width="3" height="30" fill={waveColor(l)} /> : null))}
      {lambda >= 380 && lambda <= 750 && <rect x={LX + ((lambda - 380) / 370) * LW - 3} y={494} width="6" height="42" fill="none" stroke="#fff" strokeWidth="2" />}
      <text x={LX} y={548} fill={C.text} fontFamily="Geist" fontSize="11">
        380 nm
      </text>
      <text x={LX + LW} y={548} fill={C.text} fontFamily="Geist" fontSize="11" textAnchor="end">
        750 nm
      </text>
      <InfoBox
        lines={[
          { text: `Eₙ = −13,6 eV / n²` },
          { text: `przejście ${up} → ${low}: ΔE = ${num(dE, 2)} eV`, color: C.third },
          { text: `λ = hc / ΔE = ${num(lambda, 0)} nm`, color: lambda >= 380 && lambda <= 750 ? col : '#c4b5fd' },
          { text: `seria ${SERIES[low] ?? ''}` },
        ]}
      />
    </svg>
  );
}

export const quantum: Topic = {
  id: 'fizyka-kwantowa',
  title: 'Fotony i atom',
  subject: 'fizyka',
  summary: 'Efekt fotoelektryczny z wybijanymi elektronami i progiem, którego nie przeskoczy żadne natężenie, oraz model Bohra z liniami widmowymi wodoru.',
  accent: '#f0abfc',
  glyph: 'hν',
  steps: [
    {
      title: 'Efekt fotoelektryczny',
      kind: '2d',
      scene: PhotoScene,
      controls: [
        { type: 'slider', key: 'lambda', label: 'Długość fali λ', min: 150, max: 750, step: 5, default: 450, unit: 'nm' },
        { type: 'slider', key: 'I', label: 'Natężenie światła', min: 1, max: 30, step: 1, default: 10 },
        {
          type: 'select',
          key: 'metal',
          label: 'Metal',
          default: 'sod',
          options: Object.entries(METALS).map(([value, m]) => ({ value, label: m.name })),
        },
      ],
      body: (
        <>
          <div className="formula">h·f = W + Ek max</div>
          <p>
            Światło składa się z porcji – <strong>fotonów</strong> o energii E = h·f. Jeden foton może wybić jeden
            elektron, ale tylko wtedy, gdy jego energia przekracza <strong>pracę wyjścia</strong> W metalu.
          </p>
          <p>
            Ustaw czerwone światło na cynku i podkręć natężenie do maksimum: nic. Więcej fotonów o za małej energii nie
            pomoże. Zmień na nadfiolet – elektrony lecą od razu. To doświadczenie dało Einsteinowi Nagrodę Nobla.
          </p>
        </>
      ),
    },
    {
      title: 'Model Bohra i widmo wodoru',
      kind: '2d',
      scene: BohrScene,
      controls: [
        { type: 'slider', key: 'up', label: 'Poziom początkowy', min: 2, max: 6, step: 1, default: 3 },
        { type: 'slider', key: 'low', label: 'Poziom końcowy', min: 1, max: 5, step: 1, default: 2 },
      ],
      body: (
        <>
          <div className="formula">Eₙ = −13,6 eV / n²      h·f = Eₘ − Eₙ</div>
          <p>
            W atomie wodoru elektron może mieć tylko <strong>określone energie</strong>. Przeskakując na niższy poziom,
            wysyła foton o energii równej różnicy poziomów – i dokładnie takiej barwie.
          </p>
          <p>
            Przejścia na poziom 2 (seria Balmera) dają cztery barwne linie widzialne: czerwoną, turkusową, niebieską i
            fioletową. Przejścia na poziom 1 to nadfiolet. Dzięki takim „odciskom palców” wiemy, z czego zbudowane są
            gwiazdy.
          </p>
        </>
      ),
    },
  ],
};
