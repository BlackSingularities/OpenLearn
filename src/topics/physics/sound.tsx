import { useEffect, useRef } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { useCanvasLoop } from '../../lib/useCanvasLoop';
import { C, num } from '../../lib/mathkit';
import { useSpeed } from '../../components/ui';

/* ---------- Krok 1: fala poprzeczna i podłużna ---------- */
function WaveTypesScene({ params }: SceneProps) {
  const sp = useSpeed();
  const lambda = Number(params.lambda);
  const A = Number(params.A);
  const f = Number(params.f);
  const ref = useCanvasLoop((ctx, w, h, _dt, t) => {
    const k = (2 * Math.PI) / lambda;
    const om = 2 * Math.PI * f;
    const left = 30;
    const right = w - 20;
    const span = right - left;
    const X = (u: number) => left + u * span; // u ∈ [0,1] → 10 m
    const meters = 10;
    // poprzeczna
    const y1 = h * 0.27;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 13px Geist, sans-serif';
    ctx.fillText('fala poprzeczna – drgania ⊥ do kierunku rozchodzenia (lina, światło)', left, y1 - h * 0.17);
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = u * meters;
      const d = A * Math.sin(k * x - om * t);
      ctx.fillStyle = i === 20 ? C.third : C.second;
      ctx.beginPath();
      ctx.arc(X(u), y1 - d * 28, i === 20 ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // podłużna
    const y2 = h * 0.72;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('fala podłużna – drgania wzdłuż kierunku rozchodzenia (dźwięk)', left, y2 - h * 0.17);
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i <= 70; i++) {
        const u = i / 70;
        const x = u * meters;
        const d = A * 0.35 * Math.sin(k * x - om * t);
        const px = X(u) + (d / meters) * span;
        const py = y2 - 45 + r * 15 + ((i * 7 + r * 3) % 5) - 2;
        ctx.fillStyle = i === 35 && r === 3 ? C.third : 'rgba(255,107,139,0.85)';
        ctx.beginPath();
        ctx.arc(px, py, i === 35 && r === 3 ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // długość fali
    const lx = X(0.05);
    const lw = (lambda / meters) * span;
    ctx.strokeStyle = C.good;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, y1 + 70);
    ctx.lineTo(lx + lw, y1 + 70);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = C.good;
    ctx.fillText('λ', lx + lw / 2 - 4, y1 + 64);
  });
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div style={{ color: C.good, fontWeight: 600 }}>λ = {num(lambda, 1)} m, f = {num(f, 2)} Hz</div>
        <div style={{ color: C.third }}>v = λ · f = {sp.fmt(lambda * f, 2)}</div>
        <div className="muted-line">żółte cząstki drgają w miejscu – dalej wędruje tylko zaburzenie</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Krok 2: fala stojąca na strunie ---------- */
function StandingScene({ params }: SceneProps) {
  const sp = useSpeed();
  const n = Number(params.n);
  const parts = Boolean(params.parts);
  const L = 0.65; // m (struna gitary)
  const v = 420; // m/s
  const ref = useCanvasLoop((ctx, w, h, _dt, t) => {
    const left = 50;
    const right = w - 50;
    const mid = h / 2;
    const A = Math.min(110, h * 0.25);
    const om = 2.2;
    ctx.fillStyle = '#64748b';
    ctx.fillRect(left - 14, mid - 40, 14, 80);
    ctx.fillRect(right, mid - 40, 14, 80);
    const draw = (fn: (u: number) => number, color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i <= 300; i++) {
        const u = i / 300;
        const x = left + u * (right - left);
        const y = mid - fn(u) * A;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    };
    // obwiednia
    draw((u) => Math.sin(n * Math.PI * u), 'rgba(255,255,255,0.12)', 1.5);
    draw((u) => -Math.sin(n * Math.PI * u), 'rgba(255,255,255,0.12)', 1.5);
    if (parts) {
      draw((u) => 0.5 * Math.sin(n * Math.PI * u - om * t), 'rgba(79,195,255,0.6)', 2);
      draw((u) => 0.5 * Math.sin(n * Math.PI * u + om * t), 'rgba(255,209,102,0.6)', 2);
    }
    draw((u) => Math.sin(n * Math.PI * u) * Math.cos(om * t), C.main, 4);
    for (let k = 0; k <= n; k++) {
      const x = left + (k / n) * (right - left);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, mid, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let k = 0; k < n; k++) {
      const x = left + ((k + 0.5) / n) * (right - left);
      ctx.strokeStyle = C.good;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, mid - A - 10);
      ctx.lineTo(x, mid + A + 10);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
  const fn = (n * v) / (2 * L);
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div style={{ color: C.main, fontWeight: 600 }}>
          {n}. harmoniczna: λ = 2L / {n} = {num((2 * L) / n, 3)} m
        </div>
        <div style={{ color: C.third }}>f = n · v / 2L = {num(fn, 0)} Hz</div>
        <div>
          węzły (białe): {n + 1}, strzałki (zielone): {n}
        </div>
        <div className="muted-line">struna 65 cm, prędkość fali {sp.fmt(420)}</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Krok 3: efekt Dopplera ---------- */
function DopplerScene({ params }: SceneProps) {
  const sp = useSpeed();
  const M = Number(params.M); // prędkość źródła / prędkość dźwięku
  const f0 = 440;
  const st = useRef({ t: 0, waves: [] as { x: number; t0: number }[], last: 0 });
  useEffect(() => {
    st.current = { t: 0, waves: [], last: 0 };
  }, [M]);
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    const c = Math.min(w, h) * 0.18; // px/s – prędkość dźwięku
    s.t += dt;
    const span = w + 200;
    const travel = (M * c * s.t) % span;
    const sx = -100 + travel;
    if (travel < M * c * dt * 1.5) s.waves = [];
    if (s.t - s.last > 0.35) {
      s.waves.push({ x: sx, t0: s.t });
      s.last = s.t;
    }
    s.waves = s.waves.filter((wv) => (s.t - wv.t0) * c < w * 1.2);
    const cy = h / 2;
    for (const wv of s.waves) {
      const r = (s.t - wv.t0) * c;
      ctx.strokeStyle = `rgba(79,195,255,${Math.max(0.1, 0.8 - r / w)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wv.x, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.fillStyle = C.main;
    ctx.beginPath();
    ctx.arc(sx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    // obserwatorzy
    for (const [ox, label] of [[30, 'za źródłem'], [w - 30, 'przed źródłem']] as const) {
      ctx.fillStyle = C.third;
      ctx.beginPath();
      ctx.arc(ox, cy + 60, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '600 12px Geist, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, ox + (ox < w / 2 ? 30 : -30), cy + 88);
      ctx.textAlign = 'left';
    }
  });
  const ahead = M < 1 ? f0 / (1 - M) : Infinity;
  const behind = f0 / (1 + M);
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div>
          źródło 440 Hz, prędkość {sp.fmt(M * 340)} ({num(M, 2)} prędkości dźwięku)
        </div>
        <div style={{ color: C.good, fontWeight: 600 }}>przed źródłem: f = f₀ / (1 − v/c) = {Number.isFinite(ahead) ? `${num(ahead, 0)} Hz – wyżej` : '–'}</div>
        <div style={{ color: C.second, fontWeight: 600 }}>za źródłem: f = f₀ / (1 + v/c) = {num(behind, 0)} Hz – niżej</div>
        <div style={{ color: M >= 1 ? C.bad : 'rgba(255,255,255,0.6)' }}>{M >= 1 ? 'źródło szybsze od dźwięku – fale tworzą stożek Macha (huk)' : 'fale zagęszczają się przed źródłem'}</div>
      </InfoPortal>
    </>
  );
}

export const sound: Topic = {
  id: 'fale-dzwiek',
  title: 'Fale mechaniczne i dźwięk',
  subject: 'fizyka',
  summary: 'Fala poprzeczna i podłużna z drgającymi cząstkami, fale stojące na strunie gitary i efekt Dopplera aż po stożek Macha.',
  accent: '#d946ef',
  glyph: '♫',
  steps: [
    {
      title: 'Fala poprzeczna i podłużna',
      kind: '2d',
      scene: WaveTypesScene,
      controls: [
        { type: 'slider', key: 'lambda', label: 'Długość fali λ', min: 1, max: 6, step: 0.1, default: 3, unit: 'm' },
        { type: 'slider', key: 'f', label: 'Częstotliwość f', min: 0.1, max: 1.5, step: 0.05, default: 0.5, unit: 'Hz' },
        { type: 'slider', key: 'A', label: 'Amplituda', min: 0.2, max: 2, step: 0.1, default: 1.2 },
      ],
      body: (
        <>
          <div className="formula">v = λ · f</div>
          <p>
            Fala przenosi <strong>energię, a nie materię</strong>. Śledź żółtą cząstkę: tylko drga wokół swojego
            miejsca, a dalej biegnie samo zaburzenie.
          </p>
          <p>
            W fali <strong>poprzecznej</strong> cząstki drgają w poprzek, w <strong>podłużnej</strong> – wzdłuż kierunku
            rozchodzenia, tworząc zagęszczenia i rozrzedzenia. Dźwięk w powietrzu to fala podłużna.
          </p>
        </>
      ),
    },
    {
      title: 'Fala stojąca na strunie',
      kind: '2d',
      scene: StandingScene,
      controls: [
        { type: 'slider', key: 'n', label: 'Numer harmonicznej n', min: 1, max: 7, step: 1, default: 2 },
        { type: 'toggle', key: 'parts', label: 'Pokaż dwie fale biegnące', default: false },
      ],
      body: (
        <>
          <div className="formula">L = n · λ/2      fₙ = n · v / 2L</div>
          <p>
            Fala odbija się od zamocowanych końców i nakłada na siebie. Gdy na strunie mieści się całkowita liczba
            połówek długości fali, powstaje <strong>fala stojąca</strong>: węzły w ogóle się nie ruszają, a strzałki drgają
            najmocniej.
          </p>
          <p>
            Najniższa częstotliwość (n = 1) to ton podstawowy, wyższe to alikwoty – to one nadają gitarze i skrzypcom
            różną barwę dźwięku. Włącz dwie fale biegnące, żeby zobaczyć, z czego powstaje fala stojąca.
          </p>
        </>
      ),
    },
    {
      title: 'Efekt Dopplera',
      kind: '2d',
      scene: DopplerScene,
      controls: [{ type: 'slider', key: 'M', label: 'Prędkość źródła (ułamek prędkości dźwięku)', min: 0, max: 1.6, step: 0.02, default: 0.5, decimals: 2 }],
      body: (
        <>
          <div className="formula">f = f₀ · c / (c ∓ v)</div>
          <p>
            Poruszające się źródło „dogania” własne fale z przodu i oddala się od nich z tyłu. Przed nim grzbiety są
            gęściej – słyszymy <strong>wyższy dźwięk</strong>, za nim – niższy. Stąd zmiana tonu syreny przejeżdżającej
            karetki.
          </p>
          <p>
            Gdy źródło jest szybsze od dźwięku, fale nakładają się w <strong>stożek Macha</strong> – to grom
            dźwiękowy samolotu naddźwiękowego. Ten sam efekt dla światła pozwala mierzyć prędkość galaktyk.
          </p>
        </>
      ),
    },
  ],
};
