import { useRef } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox, InfoPortal } from '../../lib/plot';
import { arrow, useCanvasLoop, useTicker } from '../../lib/useCanvasLoop';
import { Board, C, Curve, Pt, Seg, num, usePlot } from '../../lib/mathkit';
import { useSpeed } from '../../components/ui';

const T = 8; // czas jednego przebiegu animacji [s]

/** Mały wykres na canvasie: oś czasu 0..T, wartości od lo do hi, rysowany do chwili t. */
function miniGraph(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: (t: number) => number, lo: number, hi: number, t: number, color: string, label: string) {
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  const span = hi - lo || 1;
  const Y = (v: number) => y + h - 10 - ((v - lo) / span) * (h - 30);
  const X = (s: number) => x + 10 + (s / T) * (w - 20);
  if (lo < 0 && hi > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(x + 10, Y(0));
    ctx.lineTo(x + w - 10, Y(0));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const s = (i / 80) * T;
    if (i) ctx.lineTo(X(s), Y(f(s)));
    else ctx.moveTo(X(s), Y(f(s)));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const n = Math.max(1, Math.round((t / T) * 80));
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * t;
    if (i) ctx.lineTo(X(s), Y(f(s)));
    else ctx.moveTo(X(s), Y(f(s)));
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(X(t), Y(f(t)), 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '600 13px Geist, sans-serif';
  ctx.fillText(label, x + 12, y + 18);
}

/* ---------- Krok 1: trzy wykresy ruchu ---------- */
function MotionScene({ params }: SceneProps) {
  const sp = useSpeed();
  const v0 = Number(params.v0);
  const a = Number(params.a);
  const play = Boolean(params.play);
  const st = useRef({ t: 0 });
  useTicker(120);
  const x = (t: number) => v0 * t + (a * t * t) / 2;
  const v = (t: number) => v0 + a * t;
  const xs = Array.from({ length: 81 }, (_, i) => x((i / 80) * T));
  const xLo = Math.min(0, ...xs);
  const xHi = Math.max(1, ...xs);
  const vs = [v(0), v(T)];
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    if (play) s.t = (s.t + dt) % (T + 1.2);
    const t = Math.min(T, s.t);
    // droga
    const roadY = h * 0.26;
    const pad = 40;
    const X = (p: number) => pad + ((p - xLo) / (xHi - xLo)) * (w - 2 * pad);
    ctx.fillStyle = '#1b2030';
    ctx.fillRect(0, roadY - 4, w, 34);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([16, 14]);
    ctx.beginPath();
    ctx.moveTo(0, roadY + 13);
    ctx.lineTo(w, roadY + 13);
    ctx.stroke();
    ctx.setLineDash([]);
    // ślady co 1 s
    for (let k = 0; k <= Math.floor(t); k++) {
      ctx.fillStyle = 'rgba(255,209,102,0.55)';
      ctx.beginPath();
      ctx.arc(X(x(k)), roadY + 40, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px Geist, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`${k}s`, X(x(k)) - 6, roadY + 58);
    }
    // samochód
    const cx = X(x(t));
    ctx.fillStyle = C.main;
    ctx.beginPath();
    ctx.roundRect(cx - 22, roadY - 18, 44, 18, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cx - 12, roadY - 30, 24, 14, 5);
    ctx.fill();
    ctx.fillStyle = '#0b0d12';
    ctx.beginPath();
    ctx.arc(cx - 12, roadY + 1, 6, 0, Math.PI * 2);
    ctx.arc(cx + 12, roadY + 1, 6, 0, Math.PI * 2);
    ctx.fill();
    const vv = v(t);
    if (Math.abs(vv) > 0.05) arrow(ctx, cx, roadY - 42, cx + vv * 6, roadY - 42, C.second, 3);
    if (Math.abs(a) > 0.01) arrow(ctx, cx, roadY - 56, cx + a * 14, roadY - 56, C.third, 3);
    // wykresy
    const gy = h * 0.42;
    const gh = h - gy - 12;
    const gw = (w - 40) / 3;
    miniGraph(ctx, 10, gy, gw, gh, x, xLo, xHi, t, C.main, 'x(t) – położenie');
    miniGraph(ctx, 20 + gw, gy, gw, gh, v, Math.min(0, ...vs) - 1, Math.max(0, ...vs) + 1, t, C.second, 'v(t) – prędkość');
    miniGraph(ctx, 30 + 2 * gw, gy, gw, gh, () => a, Math.min(0, a) - 1, Math.max(0, a) + 1, t, C.third, 'a(t) – przyspieszenie');
  });
  const t = Math.min(T, st.current.t);
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div>t = {num(t, 1)} s</div>
        <div style={{ color: C.main, fontWeight: 600 }}>x = v₀t + at²/2 = {num(x(t), 1)} m</div>
        <div style={{ color: C.second, fontWeight: 600 }}>v = v₀ + at = {sp.fmt(v(t), 1)}</div>
        <div style={{ color: C.third, fontWeight: 600 }}>a = {num(a, 1)} m/s² (stałe)</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Krok 2: droga = pole pod wykresem v(t) ---------- */
function AreaScene({ params }: SceneProps) {
  const v0 = Number(params.v0);
  const a = Number(params.a);
  const t = Number(params.t);
  const v = (s: number) => v0 + a * s;
  const vmax = Math.max(4, v(0), v(10)) + 2;
  const vmin = Math.min(-2, v(10) - 1);
  const p = usePlot({ x: 60, y: 25, w: 798, h: 495, xMin: -0.5, xMax: 10.5, yMin: vmin, yMax: vmax });
  const s = v0 * t + (a * t * t) / 2;
  const rect = v0 * t;
  return (
    <Board p={p} step={1} xLabel="t [s]" yLabel="v [m/s]">
      <path d={p.area(() => v0, 0, t)} fill={C.second} opacity={0.22} />
      <path
        d={`M${p.sx(0)},${p.sy(v0)} L${p.sx(t)},${p.sy(v(t))} L${p.sx(t)},${p.sy(v0)} Z`}
        fill={C.third}
        opacity={0.35}
      />
      <Curve p={p} f={v} color={C.main} width={4} from={0} to={10} />
      <Seg p={p} a={[t, 0]} b={[t, v(t)]} color={C.third} width={2} dash="5 5" />
      <Pt p={p} x={t} y={v(t)} color={C.main} />
      <InfoBox
        lines={[
          { text: `v(t) = ${num(v0)} + ${num(a)}·t`, color: C.main },
          { text: `prostokąt: v₀·t = ${num(rect)} m`, color: C.second },
          { text: `trójkąt: at²/2 = ${num((a * t * t) / 2)} m`, color: C.third },
          { text: `przemieszczenie s = ${num(s)} m`, color: '#fff' },
          { text: a < 0 && v(t) < 0 ? 'pole pod osią liczymy ze znakiem minus – ciało zawraca' : '' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: rzut pionowy ze stroboskopem ---------- */
const GRAV: Record<string, number> = { ziemia: 9.81, ksiezyc: 1.62, mars: 3.71, jowisz: 24.8 };
function VerticalScene({ params }: SceneProps) {
  const sp = useSpeed();
  const v0 = Number(params.v0);
  const h0 = Number(params.h0);
  const g = GRAV[String(params.g)] ?? 9.81;
  const strobe = Boolean(params.strobe);
  const st = useRef({ t: 0 });
  useTicker(120);
  const y = (t: number) => h0 + v0 * t - (g * t * t) / 2;
  const tEnd = (v0 + Math.sqrt(v0 * v0 + 2 * g * h0)) / g;
  const hMax = h0 + (v0 * v0) / (2 * g);
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    s.t += dt;
    const cycle = tEnd + 1.2;
    if (s.t > cycle) s.t = 0;
    const t = Math.min(tEnd, s.t);
    const top = 30;
    const bottom = h - 40;
    const Y = (m: number) => bottom - (m / (hMax * 1.08)) * (bottom - top);
    const cx = w * 0.35;
    // podziałka
    ctx.font = '11px Geist, sans-serif';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const step = hMax > 60 ? 20 : hMax > 25 ? 10 : hMax > 10 ? 5 : 2;
    for (let m = 0; m <= hMax * 1.08; m += step) {
      ctx.beginPath();
      ctx.moveTo(40, Y(m));
      ctx.lineTo(w - 20, Y(m));
      ctx.stroke();
      ctx.fillText(`${m} m`, 6, Y(m) + 4);
    }
    ctx.fillStyle = '#2a3348';
    ctx.fillRect(0, bottom, w, 40);
    ctx.fillStyle = '#3a4560';
    ctx.fillRect(cx - 40, Y(h0), 26, bottom - Y(h0));
    ctx.strokeStyle = 'rgba(255,209,102,0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(40, Y(hMax));
    ctx.lineTo(w - 20, Y(hMax));
    ctx.stroke();
    ctx.setLineDash([]);
    if (strobe) {
      for (let k = 0; k * 0.2 <= t; k++) {
        const tk = k * 0.2;
        const up = v0 - g * tk > 0;
        ctx.fillStyle = up ? 'rgba(79,195,255,0.4)' : 'rgba(255,107,139,0.4)';
        ctx.beginPath();
        ctx.arc(cx + (up ? -14 : 14) + 20, Y(y(tk)), 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const vy = v0 - g * t;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx + 20, Y(y(t)), 11, 0, Math.PI * 2);
    ctx.fill();
    if (Math.abs(vy) > 0.2) arrow(ctx, cx + 48, Y(y(t)), cx + 48, Y(y(t)) - vy * 4, vy > 0 ? C.second : C.main, 3);
    arrow(ctx, cx - 8, Y(y(t)), cx - 8, Y(y(t)) + 28, C.third, 3);
    // wykres v(t)
    const gx = w * 0.58;
    const gw = w - gx - 16;
    const gy = top;
    const gh = Math.min(220, h * 0.45);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 10);
    ctx.fill();
    const vlo = v0 - g * tEnd;
    const VY = (vv: number) => gy + 14 + ((Math.max(v0, 1) - vv) / (Math.max(v0, 1) - vlo)) * (gh - 28);
    const TX = (tt: number) => gx + 10 + (tt / tEnd) * (gw - 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(gx + 10, VY(0));
    ctx.lineTo(gx + gw - 10, VY(0));
    ctx.stroke();
    ctx.strokeStyle = C.second;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(TX(0), VY(v0));
    ctx.lineTo(TX(t), VY(v0 - g * t));
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '600 12px Geist, sans-serif';
    ctx.fillText('v(t) – prosta o nachyleniu −g', gx + 12, gy + gh - 8);
  });
  const t = Math.min(tEnd, st.current.t);
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div>
          t = {num(t, 2)} s · wysokość {num(Math.max(0, y(t)), 1)} m
        </div>
        <div style={{ color: v0 - g * t > 0 ? C.second : C.main, fontWeight: 600 }}>v = v₀ − gt = {sp.fmt(v0 - g * t, 1)}</div>
        <div style={{ color: C.third }}>przyspieszenie zawsze g = {num(g, 2)} m/s² w dół</div>
        <div>
          szczyt po {num(v0 / g, 2)} s na wysokości {num(hMax, 1)} m
        </div>
        <div className="muted-line">upadek po {num(tEnd, 2)} s</div>
      </InfoPortal>
    </>
  );
}

export const kinematics: Topic = {
  id: 'kinematyka',
  title: 'Kinematyka: opis ruchu',
  subject: 'fizyka',
  summary: 'Samochód i trzy wykresy x(t), v(t), a(t) rysowane na żywo, droga jako pole pod wykresem prędkości i rzut pionowy w stroboskopie.',
  accent: '#8b5cf6',
  glyph: 'v',
  steps: [
    {
      title: 'Położenie, prędkość, przyspieszenie',
      kind: '2d',
      scene: MotionScene,
      controls: [
        { type: 'slider', key: 'v0', label: 'Prędkość początkowa v₀', min: -5, max: 15, step: 0.5, default: 2, unit: 'm/s' },
        { type: 'slider', key: 'a', label: 'Przyspieszenie a', min: -4, max: 4, step: 0.1, default: 1.5, unit: 'm/s²' },
        { type: 'toggle', key: 'play', label: 'Odtwarzaj', default: true },
      ],
      body: (
        <>
          <div className="formula">x = v₀t + at²/2      v = v₀ + at</div>
          <p>
            Ten sam ruch opisują trzy wykresy. Przy stałym przyspieszeniu <strong>a(t)</strong> jest poziomą linią,{' '}
            <strong>v(t)</strong> – prostą, a <strong>x(t)</strong> – parabolą.
          </p>
          <p>
            Żółte kropki pod samochodem to jego położenia co sekundę: przy rozpędzaniu odstępy rosną. Ustaw a = 0 –
            kropki są równo rozłożone, to ruch jednostajny.
          </p>
          <p>Ujemne przyspieszenie przy dodatniej prędkości oznacza hamowanie. Gdy v spadnie poniżej zera, auto cofa.</p>
        </>
      ),
    },
    {
      title: 'Droga jako pole pod wykresem',
      kind: '2d',
      scene: AreaScene,
      controls: [
        { type: 'slider', key: 'v0', label: 'v₀', min: 0, max: 10, step: 0.5, default: 3, unit: 'm/s' },
        { type: 'slider', key: 'a', label: 'a', min: -2, max: 2, step: 0.1, default: 0.8, unit: 'm/s²' },
        { type: 'slider', key: 't', label: 'Czas t', min: 0, max: 10, step: 0.1, default: 6, unit: 's' },
      ],
      body: (
        <>
          <div className="formula">s = v₀t + at²/2 = pole pod wykresem v(t)</div>
          <p>
            Przy stałej prędkości droga to v · t – <strong>pole prostokąta</strong>. Gdy prędkość rośnie, dochodzi{' '}
            <strong>trójkąt</strong> o podstawie t i wysokości at, czyli polu at²/2.
          </p>
          <p>
            Tak właśnie powstaje wzór na drogę w ruchu jednostajnie przyspieszonym. Ta sama zasada działa dla każdego
            wykresu prędkości – w matematyce nazywa się to całką.
          </p>
        </>
      ),
    },
    {
      title: 'Rzut pionowy i spadek swobodny',
      kind: '2d',
      scene: VerticalScene,
      controls: [
        { type: 'slider', key: 'v0', label: 'Prędkość w górę v₀', min: 0, max: 25, step: 0.5, default: 12, unit: 'm/s' },
        { type: 'slider', key: 'h0', label: 'Wysokość startu', min: 0, max: 30, step: 1, default: 5, unit: 'm' },
        {
          type: 'select',
          key: 'g',
          label: 'Miejsce',
          default: 'ziemia',
          options: [
            { value: 'ziemia', label: 'Ziemia' },
            { value: 'ksiezyc', label: 'Księżyc' },
            { value: 'mars', label: 'Mars' },
            { value: 'jowisz', label: 'Jowisz' },
          ],
        },
        { type: 'toggle', key: 'strobe', label: 'Stroboskop (co 0,2 s)', default: true },
      ],
      body: (
        <>
          <p>
            Rzucona w górę piłka cały czas ma <strong>to samo przyspieszenie g w dół</strong> – także w najwyższym
            punkcie, gdzie na chwilę się zatrzymuje.
          </p>
          <p>
            Zdjęcia stroboskopowe pokazują, że w górę piłka zwalnia (kropki gęstnieją), a w dół przyspiesza. Prędkość
            maleje liniowo: wykres v(t) to prosta przecinająca zero w szczycie.
          </p>
          <p>Ustaw v₀ = 0 – dostaniesz spadek swobodny. Na Księżycu ten sam rzut trwa ponad 6 razy dłużej.</p>
        </>
      ),
    },
  ],
};
