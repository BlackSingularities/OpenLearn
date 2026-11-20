import { useEffect, useRef } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { useCanvasLoop, useTicker } from '../../lib/useCanvasLoop';
import { C, num } from '../../lib/mathkit';
import { useSpeed } from '../../components/ui';

const G = 9.81;

function energyBars(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, total: number, parts: { v: number; color: string; label: string }[]) {
  const bw = 34;
  parts.forEach((p, i) => {
    const hh = (Math.max(0, p.v) / total) * h;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x + i * (bw + 12), y, bw, h);
    ctx.fillStyle = p.color;
    ctx.fillRect(x + i * (bw + 12), y + h - hh, bw, hh);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '600 12px Geist, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.label, x + i * (bw + 12) + bw / 2, y + h + 16);
    ctx.textAlign = 'left';
  });
}

/* ---------- Krok 1: kolejka górska ---------- */
const track = (x: number) => 0.6 + 6 * Math.exp(-((x + 12) ** 2) / 10) + 3.2 * Math.exp(-((x - 0.5) ** 2) / 3) + 2 * Math.exp(-((x - 6) ** 2) / 2.5) + 6 * Math.exp(-((x - 12.5) ** 2) / 6);
const slope = (x: number) => (track(x + 1e-3) - track(x - 1e-3)) / 2e-3;

function CoasterScene({ params }: SceneProps) {
  const sp = useSpeed();
  const x0 = Number(params.start);
  const mu = Number(params.mu);
  const m = 1;
  const st = useRef({ x: x0, v: 0, heat: 0, t: 0 });
  useEffect(() => {
    st.current = { x: x0, v: 0, heat: 0, t: 0 };
  }, [x0, mu]);
  useTicker(120);
  const h0 = track(x0);
  const E = m * G * h0;
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    // ruch wzdłuż toru: przyspieszenie styczne = −g sin θ − μ g cos θ · sgn(v)
    const sub = 8;
    for (let i = 0; i < sub; i++) {
      const d = (dt * 0.9) / sub;
      const th = Math.atan(slope(s.x));
      const a = -G * Math.sin(th) - (Math.abs(s.v) > 1e-3 ? Math.sign(s.v) * mu * G * Math.cos(th) : 0);
      const vNew = s.v + a * d;
      if (mu > 0 && Math.abs(s.v) > 1e-3 && Math.sign(vNew) !== Math.sign(s.v)) s.v = 0;
      else s.v = vNew;
      const ds = s.v * d;
      const dxLen = Math.cos(th) * ds;
      s.heat += mu * G * Math.cos(th) * Math.abs(ds) * m;
      s.x += dxLen;
      if (s.x < -11.5) {
        s.x = -11.5;
        s.v = Math.abs(s.v);
      }
      if (s.x > 11.5) {
        s.x = 11.5;
        s.v = -Math.abs(s.v);
      }
    }
    s.t += dt;
    if (s.t > 25) Object.assign(s, { x: x0, v: 0, heat: 0, t: 0 });
    const left = 20;
    const right = w - 170;
    const X = (x: number) => left + ((x + 12) / 24) * (right - left);
    const sc = (right - left) / 24;
    const Y = (y: number) => h - 40 - y * sc;
    // linia energii początkowej
    ctx.strokeStyle = 'rgba(255,209,102,0.5)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(left, Y(h0));
    ctx.lineTo(right, Y(h0));
    ctx.stroke();
    ctx.setLineDash([]);
    // tor
    ctx.beginPath();
    ctx.moveTo(X(-12), h);
    for (let x = -12; x <= 12; x += 0.05) ctx.lineTo(X(x), Y(track(x)));
    ctx.lineTo(X(12), h);
    ctx.closePath();
    ctx.fillStyle = '#1f2638';
    ctx.fill();
    ctx.strokeStyle = '#8090b0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = -12; x <= 12; x += 0.05) ctx.lineTo(X(x), Y(track(x)));
    ctx.stroke();
    ctx.lineWidth = 1;
    // wagonik
    const th = Math.atan(slope(s.x));
    const px = X(s.x) - Math.sin(th) * 12;
    const py = Y(track(s.x)) - Math.cos(th) * 12;
    ctx.fillStyle = C.main;
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fill();
    // słupki energii
    const Ep = m * G * track(s.x);
    const Ek = (m * s.v * s.v) / 2;
    energyBars(ctx, w - 150, 30, h - 90, E * 1.05, [
      { v: Ep, color: C.second, label: 'Ep' },
      { v: Ek, color: C.main, label: 'Ek' },
      { v: s.heat, color: C.third, label: 'Q' },
    ]);
  });
  const s = st.current;
  const Ep = m * G * track(s.x);
  const Ek = (m * s.v * s.v) / 2;
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div style={{ color: C.second, fontWeight: 600 }}>Ep = mgh = {num(Ep, 1)} J (h = {num(track(s.x), 2)} m)</div>
        <div style={{ color: C.main, fontWeight: 600 }}>Ek = mv²/2 = {num(Ek, 1)} J (v = {sp.fmt(Math.abs(s.v), 2)})</div>
        {mu > 0 && <div style={{ color: C.third, fontWeight: 600 }}>ciepło Q = {num(s.heat, 1)} J</div>}
        <div>
          suma: {num(Ep + Ek + s.heat, 1)} J = energia początkowa {num(E, 1)} J
        </div>
        <div className="muted-line">masa wagonika 1 kg, tarcie μ = {num(mu, 2)}</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Krok 2: pętla ---------- */
function LoopScene({ params }: SceneProps) {
  const H = Number(params.h);
  const r = Number(params.r);
  const st = useRef({ phase: 0 as 0 | 1 | 2 | 3, s: 0, phi: 0, p: [0, 0], v: [0, 0], t: 0, detach: NaN, done: '' });
  const L = Math.hypot(6, H);
  const sinT = H / L;
  const v0 = Math.sqrt(2 * G * H);
  const reset = () => {
    st.current = { phase: 0, s: 0, phi: 0, p: [-6, H], v: [0, 0], t: 0, detach: NaN, done: '' };
  };
  useEffect(reset, [H, r]);
  useTicker(150);
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    const d = dt * 0.8;
    s.t += dt;
    if (s.phase === 0) {
      // zjazd z równi
      s.s += Math.sqrt(2 * G * sinT * s.s + 1e-4) * d;
      if (s.s >= L) {
        s.phase = 1;
        s.phi = 0;
      }
      const f = Math.min(1, s.s / L);
      s.p = [-6 + 6 * f, H * (1 - f)];
    } else if (s.phase === 1) {
      const v2 = v0 * v0 - 2 * G * r * (1 - Math.cos(s.phi));
      const N = v2 / r + G * Math.cos(s.phi);
      if (v2 <= 0 || N < 0) {
        // oderwanie: ruch po paraboli
        const speed = Math.sqrt(Math.max(0, v2));
        s.v = [Math.cos(s.phi) * speed, Math.sin(s.phi) * speed];
        s.phase = 2;
        s.detach = s.phi;
      } else {
        s.phi += (Math.sqrt(v2) / r) * d;
        s.p = [2 + r * Math.sin(s.phi), r - r * Math.cos(s.phi)];
        if (s.phi >= 2 * Math.PI) {
          s.phase = 3;
          s.done = 'ok';
        }
      }
    } else if (s.phase === 2) {
      s.v[1] -= G * d;
      s.p = [s.p[0] + s.v[0] * d, s.p[1] + s.v[1] * d];
      if (s.p[1] < 0) {
        s.p[1] = 0;
        s.phase = 3;
        s.done = 'fall';
      }
    } else {
      s.p = [s.p[0] + (s.done === 'ok' ? v0 * d : 0), s.p[1]];
    }
    if (s.t > 7) reset();
    const scale = Math.min(w / 16, (h - 60) / Math.max(H + 1, 2 * r + 1.5));
    const X = (x: number) => w * 0.45 + x * scale;
    const Y = (y: number) => h - 30 - y * scale;
    ctx.strokeStyle = 'rgba(255,209,102,0.5)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, Y(H));
    ctx.lineTo(w, Y(H));
    ctx.moveTo(0, Y(2.5 * r));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = C.good;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(0, Y(2.5 * r));
    ctx.lineTo(w, Y(2.5 * r));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#8090b0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(X(-6), Y(H));
    ctx.lineTo(X(0), Y(0));
    ctx.lineTo(X(2), Y(0));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(2), Y(r), r * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(2), Y(0));
    ctx.lineTo(w, Y(0));
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = s.phase === 2 || s.done === 'fall' ? C.bad : C.main;
    ctx.beginPath();
    ctx.arc(X(s.p[0]), Y(s.p[1]), 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '600 12px Geist, sans-serif';
    ctx.fillText('h min = 2,5 r', 10, Y(2.5 * r) - 6);
  });
  const ok = H >= 2.5 * r - 1e-9;
  const vTop2 = v0 * v0 - 4 * G * r;
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div>
          start z h = {num(H, 1)} m, pętla r = {num(r, 1)} m
        </div>
        <div style={{ color: C.third }}>w szczycie potrzeba v² ≥ g·r = {num(G * r, 1)} m²/s²</div>
        <div style={{ color: ok ? C.good : C.bad, fontWeight: 600 }}>
          {vTop2 > 0 ? `w szczycie v² = ${num(vTop2, 1)} m²/s²` : 'nie dojedzie do szczytu'} → {ok ? 'przejedzie pętlę' : 'oderwie się od toru'}
        </div>
        <div className="muted-line">warunek: h ≥ 2,5 r = {num(2.5 * r, 2)} m</div>
      </InfoPortal>
    </>
  );
}

export const energy: Topic = {
  id: 'energia-mechaniczna',
  title: 'Energia mechaniczna',
  subject: 'fizyka',
  summary: 'Kolejka górska z przelewającą się energią potencjalną i kinetyczną, tarcie zamieniające ją w ciepło i pętla, której nie da się przejechać bez zapasu wysokości.',
  accent: '#9b5de5',
  glyph: 'E',
  steps: [
    {
      title: 'Kolejka górska',
      kind: '2d',
      scene: CoasterScene,
      controls: [
        { type: 'slider', key: 'start', label: 'Punkt startu', min: -11, max: -7, step: 0.1, default: -10 },
        { type: 'slider', key: 'mu', label: 'Tarcie μ', min: 0, max: 0.15, step: 0.005, default: 0, decimals: 3 },
      ],
      body: (
        <>
          <div className="formula">Ep + Ek = mgh + mv²/2 = const</div>
          <p>
            Bez tarcia energia tylko <strong>zmienia postać</strong>: na górce przeważa potencjalna (niebieska), w
            dolinie – kinetyczna (różowa). Suma się nie zmienia, więc wagonik nigdy nie wjedzie wyżej niż żółta linia
            startu.
          </p>
          <p>
            Dodaj tarcie: pojawia się żółty słupek <strong>Q – ciepło</strong>. Energia nie znika, tylko przechodzi w
            energię wewnętrzną toru i kół. Wagonik wjeżdża coraz niżej, aż utknie w dolinie.
          </p>
        </>
      ),
    },
    {
      title: 'Pętla śmierci',
      kind: '2d',
      scene: LoopScene,
      controls: [
        { type: 'slider', key: 'h', label: 'Wysokość startu h', min: 1, max: 9, step: 0.1, default: 4 },
        { type: 'slider', key: 'r', label: 'Promień pętli r', min: 0.8, max: 2.5, step: 0.05, default: 1.8 },
      ],
      body: (
        <>
          <div className="formula">h ≥ 2,5 · r</div>
          <p>
            Żeby nie spaść w najwyższym punkcie pętli, wagonik musi mieć tam prędkość, przy której sam ciężar wystarcza
            jako siła dośrodkowa: <strong>v² ≥ g·r</strong>.
          </p>
          <p>
            Z zasady zachowania energii: mgh = mg·2r + mv²/2. Podstawiając v² = gr, dostajemy h = 2,5 r – nie 2r, jak
            podpowiada intuicja. Zmniejsz wysokość poniżej zielonej linii i zobacz, gdzie wagonik się odrywa.
          </p>
        </>
      ),
    },
  ],
};
