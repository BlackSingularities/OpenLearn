import { useEffect, useRef } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { arrow, useCanvasLoop, useTicker } from '../../lib/useCanvasLoop';
import { C, num } from '../../lib/mathkit';
import { useSpeed } from '../../components/ui';

function bars(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, title: string, items: { label: string; v: number; color: string }[], scale: number) {
  ctx.font = '600 12px Geist, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(title, x, y);
  const mid = x + w / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(mid, y + 6);
  ctx.lineTo(mid, y + 8 + items.length * 20);
  ctx.stroke();
  items.forEach((it, i) => {
    const len = Math.max(-w / 2, Math.min(w / 2, it.v * scale));
    ctx.fillStyle = it.color;
    ctx.fillRect(len >= 0 ? mid : mid + len, y + 10 + i * 20, Math.abs(len), 14);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px Geist, sans-serif';
    ctx.fillText(it.label, x, y + 21 + i * 20);
  });
}

/* ---------- Krok 1: zderzenie centralne ---------- */
function Collision1D({ params }: SceneProps) {
  const sp = useSpeed();
  const m1 = Number(params.m1);
  const m2 = Number(params.m2);
  const u1 = Number(params.v1);
  const u2 = Number(params.v2);
  const e = Number(params.e);
  const P = m1 * u1 + m2 * u2;
  const w1 = (P + m2 * e * (u2 - u1)) / (m1 + m2);
  const w2 = (P + m1 * e * (u1 - u2)) / (m1 + m2);
  const E0 = (m1 * u1 * u1 + m2 * u2 * u2) / 2;
  const E1 = (m1 * w1 * w1 + m2 * w2 * w2) / 2;
  const st = useRef({ x1: -3, x2: 3, v1: u1, v2: u2, hit: false, t: 0 });
  useEffect(() => {
    st.current = { x1: -3, x2: 3, v1: u1, v2: u2, hit: false, t: 0 };
  }, [m1, m2, u1, u2, e]);
  useTicker(150);
  const size = (m: number) => 0.35 + Math.cbrt(m) * 0.3;
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    s.t += dt;
    const sp = 0.5;
    s.x1 += s.v1 * dt * sp;
    s.x2 += s.v2 * dt * sp;
    if (!s.hit && s.x2 - s.x1 <= (size(m1) + size(m2)) / 2) {
      s.hit = true;
      s.v1 = w1;
      s.v2 = w2;
    }
    if (s.t > 9 || (s.hit && (Math.abs(s.x1) > 7.5 || Math.abs(s.x2) > 7.5)) || (!s.hit && s.t > 7)) {
      Object.assign(s, { x1: -3, x2: 3, v1: u1, v2: u2, hit: false, t: 0 });
    }
    const scale = w / 15;
    const X = (x: number) => w / 2 + x * scale;
    const ty = h * 0.42;
    ctx.fillStyle = '#2a3348';
    ctx.fillRect(0, ty, w, 8);
    const cart = (x: number, m: number, color: string, v: number, label: string) => {
      const sz = size(m) * scale;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(X(x) - sz / 2, ty - sz, sz, sz, 6);
      ctx.fill();
      ctx.fillStyle = '#0b0d12';
      ctx.font = '700 13px Geist, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, X(x), ty - sz / 2 + 5);
      ctx.textAlign = 'left';
      if (Math.abs(v) > 0.05) arrow(ctx, X(x), ty - sz - 14, X(x) + v * 14, ty - sz - 14, color, 3);
    };
    cart(s.x1, m1, C.main, s.v1, `${num(m1)} kg`);
    cart(s.x2, m2, C.second, s.v2, `${num(m2)} kg`);
    const bw = Math.min(260, w / 2 - 30);
    const pScale = (bw / 2) / Math.max(1, Math.abs(m1 * u1), Math.abs(m2 * u2), Math.abs(P), Math.abs(m1 * w1), Math.abs(m2 * w2));
    bars(ctx, 20, h * 0.58, bw, 'pęd przed', [
      { label: 'p₁', v: m1 * u1, color: C.main },
      { label: 'p₂', v: m2 * u2, color: C.second },
      { label: 'razem', v: P, color: C.third },
    ], pScale);
    bars(ctx, w - bw - 20, h * 0.58, bw, 'pęd po', [
      { label: "p₁'", v: m1 * w1, color: C.main },
      { label: "p₂'", v: m2 * w2, color: C.second },
      { label: 'razem', v: m1 * w1 + m2 * w2, color: C.third },
    ], pScale);
  });
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div style={{ color: C.third, fontWeight: 600 }}>pęd całkowity: {num(P, 2)} kg·m/s – przed i po</div>
        <div>
          po zderzeniu: v₁' = {sp.fmt(w1, 2)}, v₂' = {sp.fmt(w2, 2)}
        </div>
        <div style={{ color: e === 1 ? C.good : C.main }}>
          energia kinetyczna: {num(E0, 1)} J → {num(E1, 1)} J {E0 - E1 > 0.05 ? `(strata ${Math.round(((E0 - E1) / E0) * 100)}% na ciepło i odkształcenie)` : '(zachowana)'}
        </div>
        <div className="muted-line">{e === 1 ? 'zderzenie sprężyste' : e === 0 ? 'zderzenie niesprężyste – wózki się sklejają' : `częściowo sprężyste, e = ${num(e, 2)}`}</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Krok 2: zderzenie bil ---------- */
function Billiard({ params }: SceneProps) {
  const b = Number(params.b);
  const speed = Number(params.v);
  const R = 0.5;
  const st = useRef({ p1: [-5, b * 2 * R], v1: [speed, 0], p2: [0, 0], v2: [0, 0], hit: false, t: 0, after: [[0, 0], [0, 0]] as number[][] });
  const reset = () => {
    st.current = { p1: [-5, b * 2 * R], v1: [speed, 0], p2: [0, 0], v2: [0, 0], hit: false, t: 0, after: [[0, 0], [0, 0]] };
  };
  useEffect(reset, [b, speed]);
  useTicker(200);
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    s.t += dt;
    for (const [p, v] of [[s.p1, s.v1], [s.p2, s.v2]]) {
      p[0] += v[0] * dt * 0.6;
      p[1] += v[1] * dt * 0.6;
    }
    const dx = s.p2[0] - s.p1[0];
    const dy = s.p2[1] - s.p1[1];
    const dist = Math.hypot(dx, dy);
    if (!s.hit && dist <= 2 * R) {
      s.hit = true;
      const nx = dx / dist;
      const ny = dy / dist;
      const rel = (s.v1[0] - s.v2[0]) * nx + (s.v1[1] - s.v2[1]) * ny;
      s.v1 = [s.v1[0] - rel * nx, s.v1[1] - rel * ny];
      s.v2 = [s.v2[0] + rel * nx, s.v2[1] + rel * ny];
      s.after = [[...s.v1], [...s.v2]];
    }
    if (s.t > 8) reset();
    const scale = Math.min(w / 14, h / 9);
    const X = (x: number) => w * 0.42 + x * scale;
    const Y = (y: number) => h / 2 - y * scale;
    ctx.fillStyle = '#0f5132';
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.roundRect(10, 10, w * 0.84 - 20, h - 20, 18);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(X(-7), Y(b * 2 * R));
    ctx.lineTo(X(0), Y(b * 2 * R));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [p, col] of [[s.p1, '#ffffff'], [s.p2, C.third]] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(X(p[0]), Y(p[1]), R * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    // trójkąt pędów
    if (s.hit) {
      const ox = w * 0.86;
      const oy = h * 0.7;
      const k = 22;
      const [a1, a2] = s.after;
      arrow(ctx, ox, oy, ox + speed * k, oy, C.main, 3);
      arrow(ctx, ox, oy, ox + a1[0] * k, oy - a1[1] * k, '#fff', 2.5);
      arrow(ctx, ox + a1[0] * k, oy - a1[1] * k, ox + speed * k, oy, C.third, 2.5);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '600 11px Geist, sans-serif';
      ctx.fillText('p = p₁\' + p₂\'', ox - 10, oy + 22);
    }
  });
  const [a1, a2] = st.current.after;
  const ang = st.current.hit ? (Math.acos(Math.max(-1, Math.min(1, (a1[0] * a2[0] + a1[1] * a2[1]) / ((Math.hypot(a1[0], a1[1]) * Math.hypot(a2[0], a2[1])) || 1)))) * 180) / Math.PI : NaN;
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div>bile o równych masach, zderzenie sprężyste</div>
        <div style={{ color: C.third }}>parametr zderzenia b = {num(b, 2)} średnicy</div>
        <div style={{ color: C.good, fontWeight: 600 }}>
          {Number.isFinite(ang) && Math.hypot(a1[0], a1[1]) > 0.05 ? `kąt między torami po zderzeniu: ${num(ang, 1)}°` : b < 0.02 ? 'zderzenie centralne: biała staje, żółta przejmuje cały pęd' : 'czekam na zderzenie…'}
        </div>
        <div className="muted-line">wektory pędów tworzą trójkąt (po prawej)</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Krok 3: odrzut ---------- */
function Recoil({ params }: SceneProps) {
  const m1 = Number(params.m1);
  const m2 = Number(params.m2);
  const E = Number(params.E);
  // energia sprężyny dzieli się tak, by m₁v₁ = m₂v₂
  const v2 = Math.sqrt((2 * E * m1) / (m2 * (m1 + m2)));
  const v1 = (m2 * v2) / m1;
  const st = useRef({ t: 0 });
  useTicker(200);
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    s.t = (s.t + dt) % 5;
    const go = Math.max(0, s.t - 1);
    const scale = w / 16;
    const X = (x: number) => w / 2 + x * scale;
    const ty = h * 0.55;
    ctx.fillStyle = '#2a3348';
    ctx.fillRect(0, ty, w, 8);
    const sz = (m: number) => (0.45 + Math.cbrt(m) * 0.35) * scale;
    const x1 = -sz(m1) / scale / 2 - 0.15 - v1 * go * 0.6;
    const x2 = sz(m2) / scale / 2 + 0.15 + v2 * go * 0.6;
    // sprężyna (ściśnięta przed startem)
    if (s.t < 1) {
      ctx.strokeStyle = C.good;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const a = X(x1) + sz(m1) / 2;
      const bb = X(x2) - sz(m2) / 2;
      for (let i = 0; i <= 10; i++) ctx.lineTo(a + ((bb - a) * i) / 10, ty - 20 + (i % 2 ? -8 : 8) * (i > 0 && i < 10 ? 1 : 0));
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    for (const [x, m, col, v] of [[x1, m1, C.main, -v1], [x2, m2, C.second, v2]] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(X(x) - sz(m) / 2, ty - sz(m), sz(m), sz(m), 6);
      ctx.fill();
      if (go > 0) arrow(ctx, X(x), ty - sz(m) - 16, X(x) + v * 18, ty - sz(m) - 16, col, 3);
    }
  });
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div>pęd przed: 0 (oba wózki w spoczynku)</div>
        <div style={{ color: C.main, fontWeight: 600 }}>
          m₁v₁ = {num(m1)} · {num(v1, 2)} = {num(m1 * v1, 2)} kg·m/s w lewo
        </div>
        <div style={{ color: C.second, fontWeight: 600 }}>
          m₂v₂ = {num(m2)} · {num(v2, 2)} = {num(m2 * v2, 2)} kg·m/s w prawo
        </div>
        <div style={{ color: C.third }}>v₁ / v₂ = m₂ / m₁ = {num(m2 / m1, 2)}</div>
      </InfoPortal>
    </>
  );
}

export const momentum: Topic = {
  id: 'ped-zderzenia',
  title: 'Pęd i zderzenia',
  subject: 'fizyka',
  summary: 'Zderzenia sprężyste i niesprężyste wózków z bilansem pędu i energii, bile rozjeżdżające się pod kątem prostym i odrzut.',
  accent: '#6d5dfc',
  glyph: 'p',
  steps: [
    {
      title: 'Zderzenie dwóch wózków',
      kind: '2d',
      scene: Collision1D,
      controls: [
        { type: 'slider', key: 'm1', label: 'Masa m₁', min: 0.5, max: 5, step: 0.1, default: 2, unit: 'kg' },
        { type: 'slider', key: 'v1', label: 'Prędkość v₁', min: -2, max: 6, step: 0.1, default: 4, unit: 'm/s' },
        { type: 'slider', key: 'm2', label: 'Masa m₂', min: 0.5, max: 5, step: 0.1, default: 1, unit: 'kg' },
        { type: 'slider', key: 'v2', label: 'Prędkość v₂', min: -6, max: 2, step: 0.1, default: -1, unit: 'm/s' },
        { type: 'slider', key: 'e', label: 'Sprężystość e', min: 0, max: 1, step: 0.05, default: 1, decimals: 2 },
      ],
      body: (
        <>
          <div className="formula">m₁v₁ + m₂v₂ = m₁v₁' + m₂v₂'</div>
          <p>
            W każdym zderzeniu <strong>pęd całkowity jest zachowany</strong> – żółty słupek przed i po zderzeniu ma tę
            samą długość. Pędy pojedynczych wózków zmieniają się, ale jeden zyskuje tyle, ile traci drugi.
          </p>
          <p>
            Energia kinetyczna to inna sprawa. W zderzeniu <strong>sprężystym</strong> (e = 1) też jest zachowana. W{' '}
            <strong>niesprężystym</strong> (e = 0) wózki się sklejają i część energii zamienia się w ciepło.
          </p>
          <p>Ustaw równe masy i e = 1: wózki wymieniają się prędkościami.</p>
        </>
      ),
    },
    {
      title: 'Zderzenie bil',
      kind: '2d',
      scene: Billiard,
      controls: [
        { type: 'slider', key: 'b', label: 'Przesunięcie toru (parametr zderzenia)', min: 0, max: 0.95, step: 0.01, default: 0.45, decimals: 2 },
        { type: 'slider', key: 'v', label: 'Prędkość białej bili', min: 1, max: 5, step: 0.1, default: 3, unit: 'm/s' },
      ],
      body: (
        <>
          <p>
            Pęd jest <strong>wektorem</strong>, więc zachowuje się w każdym kierunku osobno. Biała bila uderza żółtą z
            boku – po zderzeniu obie odjeżdżają pod kątem.
          </p>
          <p>
            Przy równych masach i zderzeniu sprężystym tory po zderzeniu zawsze tworzą <strong>kąt prosty</strong>. Po
            prawej widać dlaczego: pędy po zderzeniu dodają się do pędu początkowego, a zachowanie energii wymusza
            twierdzenie Pitagorasa dla tego trójkąta. Bilardziści znają tę regułę jako „zasadę 90°”.
          </p>
        </>
      ),
    },
    {
      title: 'Odrzut',
      kind: '2d',
      scene: Recoil,
      controls: [
        { type: 'slider', key: 'm1', label: 'Masa m₁ (lewy wózek)', min: 0.5, max: 8, step: 0.1, default: 4, unit: 'kg' },
        { type: 'slider', key: 'm2', label: 'Masa m₂ (prawy wózek)', min: 0.5, max: 8, step: 0.1, default: 1, unit: 'kg' },
        { type: 'slider', key: 'E', label: 'Energia sprężyny', min: 2, max: 30, step: 1, default: 12, unit: 'J' },
      ],
      body: (
        <>
          <div className="formula">0 = m₁v₁ − m₂v₂   →   v₁ / v₂ = m₂ / m₁</div>
          <p>
            Dwa wózki stoją, między nimi ściśnięta sprężyna. Na początku pęd układu wynosi zero, więc po rozepchnięciu
            pędy muszą się <strong>znosić</strong>: lżejszy wózek odjeżdża szybciej.
          </p>
          <p>Na tej zasadzie działa odrzut armaty, napęd rakiety i odpychanie się od ściany basenu.</p>
        </>
      ),
    },
  ],
};
