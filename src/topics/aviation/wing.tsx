import { useMemo, useRef, type ReactNode } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { useAnimationClock } from '../../lib/useAnimationClock';
import { useCanvasLoop, arrow } from '../../lib/useCanvasLoop';
import { InfoPortal, fmt } from '../../lib/plot';
import { useSpeed } from '../../components/ui';
import { gammaKutta, isaRho, liftCoef, makeAirfoil, naca, outline, surfaceCp, velocity, type Airfoil } from './wingFlow';
import { WingVortexScene } from './wing3d';

const DEG = Math.PI / 180;
const G0 = 9.81;
const W = 1000;
const H = 460;

/* ======================= wspólne: obrót układu profilu ======================= */

/** Z układu profilu (przepływ pod kątem α) do układu „świata” (przepływ poziomy, profil zadarty nosem w górę). */
const toWorld = (x: number, y: number, a: number) => ({ x: x * Math.cos(a) + y * Math.sin(a), y: -x * Math.sin(a) + y * Math.cos(a) });
const toFoil = (x: number, y: number, a: number) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

function worldVel(x: number, y: number, af: Airfoil, a: number, G: number) {
  const p = toFoil(x, y, a);
  const v = velocity({ re: p.x, im: p.y }, af, a, G);
  const w = toWorld(v.u, v.v, a);
  return { u: w.x, v: w.y, inside: v.inside };
}

/* ======================= Krok 1: budowa profilu ======================= */

const PROFILES: Record<string, { name: string; m: number; p: number; t: number; note: string }> = {
  '0012': { name: 'NACA 0012 (symetryczny)', m: 0, p: 0.4, t: 0.12, note: 'Symetryczny – górna i dolna powierzchnia są lustrzanym odbiciem. Przy α = 0 nie daje siły nośnej. Stosowany w usterzeniach i samolotach akrobacyjnych (lata tak samo „na plecach”).' },
  '2412': { name: 'NACA 2412 (lekko wygięty)', m: 0.02, p: 0.4, t: 0.12, note: 'Wygięcie 2% cięciwy w 40% jej długości, grubość 12%. Daje siłę nośną nawet przy α = 0. Klasyczny profil m.in. Cessny 172.' },
  '4412': { name: 'NACA 4412 (mocno wygięty)', m: 0.04, p: 0.4, t: 0.12, note: 'Większe wygięcie = większa siła nośna przy małych kątach, ale też większy opór i moment pochylający. Dobry dla wolnych samolotów.' },
  '6409': { name: 'NACA 6409 (cienki, bardzo wygięty)', m: 0.06, p: 0.4, t: 0.09, note: 'Cienki i mocno wygięty – jak skrzydło szybowca modelarskiego czy ptaka. Dużo siły nośnej przy małej prędkości.' },
};

function ProfileScene({ params }: SceneProps) {
  const pr = PROFILES[String(params.profile ?? '2412')];
  const alpha = Number(params.alpha ?? 5) * DEG;
  const labels = Boolean(params.labels ?? true);
  const t = useAnimationClock(true);
  const sh = useMemo(() => naca(pr.m, pr.p, pr.t), [pr]);
  const S = 640;
  const ox = 200;
  const oy = 230;
  // obrót wokół 25% cięciwy, nosem do góry
  const P = (x: number, y: number) => {
    const dx = x - 0.25;
    const rx = dx * Math.cos(alpha) + y * Math.sin(alpha);
    const ry = -dx * Math.sin(alpha) + y * Math.cos(alpha);
    return [ox + (0.25 + rx) * S, oy - ry * S] as const;
  };
  const poly = [...sh.up, ...[...sh.lo].reverse()].map(([x, y]) => P(x, y).join(',')).join(' ');
  const camber = sh.camber.map(([x, y]) => P(x, y).join(',')).join(' ');
  const le = P(0, 0);
  const te = P(1, 0);
  // położenie maks. grubości i maks. wygięcia
  let iT = 0;
  sh.up.forEach((u, i) => {
    if (u[1] - sh.lo[i][1] > sh.up[iT][1] - sh.lo[iT][1]) iT = i;
  });
  const tTop = P(sh.up[iT][0], sh.up[iT][1]);
  const tBot = P(sh.lo[iT][0], sh.lo[iT][1]);
  const iC = sh.camber.reduce((b, c, i) => (c[1] > sh.camber[b][1] ? i : b), 0);
  const cA = P(sh.camber[iC][0], 0);
  const cB = P(sh.camber[iC][0], sh.camber[iC][1]);
  // wiatr względny – poziome strzałki płynące w prawo
  const winds = [70, 130, 330, 390].map((y, i) => {
    const x = ((t * 120 + i * 200) % 260) + 0;
    return <line key={i} x1={x} y1={y} x2={x + 60} y2={y} stroke="#7dd3fc" strokeWidth="2.5" opacity="0.6" markerEnd="url(#pfA)" />;
  });
  const arcR = 120;
  return (
    <svg viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <marker id="pfA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#7dd3fc" />
        </marker>
      </defs>
      {winds}
      <text x="10" y="40" fill="#7dd3fc" fontSize="14">
        wiatr względny (kierunek lotu jest przeciwny)
      </text>
      <polygon points={poly} fill="rgba(226,232,240,0.12)" stroke="#e2e8f0" strokeWidth="2.5" />
      {labels && (
        <g fontSize="14" fontWeight="600">
          {/* cięciwa */}
          <line x1={le[0]} y1={le[1]} x2={te[0]} y2={te[1]} stroke="#facc15" strokeWidth="2" strokeDasharray="8 5" />
          <text x={(le[0] + te[0]) / 2 + 40} y={(le[1] + te[1]) / 2 + 52} fill="#facc15">
            cięciwa c
          </text>
          {/* linia szkieletowa */}
          {pr.m > 0 && <polyline points={camber} fill="none" stroke="#c084fc" strokeWidth="2" />}
          {pr.m > 0 && (
            <>
              <line x1={cA[0]} y1={cA[1]} x2={cB[0]} y2={cB[1]} stroke="#c084fc" strokeWidth="2" />
              <text x={cB[0] + 8} y={cB[1] - 50} fill="#c084fc">
                linia szkieletowa · wygięcie {fmt(pr.m * 100, 0)}% c
              </text>
            </>
          )}
          {/* grubość */}
          <line x1={tTop[0]} y1={tTop[1]} x2={tBot[0]} y2={tBot[1]} stroke="#4ade80" strokeWidth="2" />
          <text x={tTop[0] - 30} y={tTop[1] - 16} fill="#4ade80">
            grubość {fmt(pr.t * 100, 0)}% c
          </text>
          {/* krawędzie */}
          <circle cx={le[0]} cy={le[1]} r="6" fill="#38bdf8" />
          <text x={le[0] - 20} y={le[1] + 38} fill="#38bdf8" textAnchor="middle">
            krawędź natarcia
          </text>
          <circle cx={te[0]} cy={te[1]} r="6" fill="#f472b6" />
          <text x={te[0] + 10} y={te[1] + 34} fill="#f472b6">
            krawędź spływu
          </text>
          {/* kąt natarcia */}
          <line x1={P(0.25, 0)[0]} y1={P(0.25, 0)[1]} x2={P(0.25, 0)[0] + 300} y2={P(0.25, 0)[1]} stroke="#7dd3fc" strokeWidth="1.5" strokeDasharray="4 4" />
          <path
            d={`M${P(0.25, 0)[0] + arcR},${P(0.25, 0)[1]} A${arcR},${arcR} 0 0 ${alpha > 0 ? 0 : 1} ${P(0.25, 0)[0] + arcR * Math.cos(alpha)},${P(0.25, 0)[1] - arcR * Math.sin(alpha)}`}
            fill="none"
            stroke="#fb923c"
            strokeWidth="3"
          />
          <text x={P(0.25, 0)[0] + arcR + 12} y={P(0.25, 0)[1] - (arcR * Math.sin(alpha)) / 2 + 5} fill="#fb923c">
            α = {fmt(alpha / DEG, 0)}°
          </text>
        </g>
      )}
      <InfoPortal>
        <div style={{ fontWeight: 700 }}>{pr.name}</div>
        <div>{pr.note}</div>
        <div style={{ opacity: 0.75 }}>Kąt natarcia α to kąt między cięciwą a kierunkiem napływu powietrza – nie kąt nachylenia samolotu do ziemi.</div>
      </InfoPortal>
    </svg>
  );
}

/* ======================= Krok 2: opływ (canvas) ======================= */

interface Pcl {
  x: number;
  y: number;
  trail: number[];
}

function FlowScene({ params }: SceneProps) {
  const alpha = Number(params.alpha ?? 6) * DEG;
  const camber = Number(params.camber ?? 0.08);
  const view = String(params.view ?? 'smugi');
  const pressure = Boolean(params.pressure ?? true);
  const af = useMemo(() => makeAirfoil(0.1, camber), [camber]);
  const G = gammaKutta(af, alpha);
  const st = useRef<{ ps: Pcl[]; lines: { pts: { x: number; y: number; dead: boolean }[]; hue: number }[]; lastEmit: number; bgKey: string; bg: HTMLCanvasElement | null }>({ ps: [], lines: [], lastEmit: -10, bgKey: '', bg: null });
  const outl = useMemo(() => outline(af, 140).map((p) => toWorld(p.x, p.y, alpha)), [af, alpha]);

  const ref = useCanvasLoop((ctx, w, h, dt, t) => {
    const s = st.current;
    const k = Math.min(w / 11, h / 6.2);
    const cx = w * 0.46;
    const cy = h * 0.5;
    const X = (x: number) => cx + x * k;
    const Y = (y: number) => cy - y * k;
    const xMin = -cx / k;
    const xMax = (w - cx) / k;
    const yMax = cy / k;

    // tło – pole ciśnienia (Cp), liczone raz dla danego kąta i rozmiaru
    const key = `${alpha}|${camber}|${w}|${h}`;
    if (pressure) {
      if (s.bgKey !== key || !s.bg) {
        const gw = 180;
        const gh = Math.round((gw * h) / w);
        const off = document.createElement('canvas');
        off.width = gw;
        off.height = gh;
        const c2 = off.getContext('2d')!;
        const img = c2.createImageData(gw, gh);
        for (let j = 0; j < gh; j++)
          for (let i = 0; i < gw; i++) {
            const x = xMin + ((i + 0.5) / gw) * (xMax - xMin);
            const y = yMax - ((j + 0.5) / gh) * 2 * yMax;
            const v = worldVel(x, y, af, alpha, G);
            const o = (j * gw + i) * 4;
            if (v.inside) {
              img.data[o + 3] = 0;
              continue;
            }
            const cp = 1 - (v.u * v.u + v.v * v.v);
            if (cp < 0) {
              const a = Math.min(1, -cp / 1.6);
              img.data[o] = 40;
              img.data[o + 1] = 120;
              img.data[o + 2] = 255;
              img.data[o + 3] = Math.round(a * 170);
            } else {
              const a = Math.min(1, cp / 0.9);
              img.data[o] = 255;
              img.data[o + 1] = 90;
              img.data[o + 2] = 60;
              img.data[o + 3] = Math.round(a * 170);
            }
          }
        c2.putImageData(img, 0, 0);
        s.bg = off;
        s.bgKey = key;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(s.bg!, 0, 0, w, h);
    }

    const step = (p: { x: number; y: number }, d: number) => {
      const v1 = worldVel(p.x, p.y, af, alpha, G);
      if (v1.inside) return true;
      const mx = p.x + v1.u * d * 0.5;
      const my = p.y + v1.v * d * 0.5;
      const v2 = worldVel(mx, my, af, alpha, G);
      if (v2.inside) return true;
      const sp = Math.hypot(v2.u, v2.v);
      const cap = sp > 3.5 ? 3.5 / sp : 1;
      p.x += v2.u * d * cap;
      p.y += v2.v * d * cap;
      return false;
    };
    const speed = 1.5;

    if (view === 'smugi') {
      const N = 260;
      while (s.ps.length < N) s.ps.push({ x: xMin + Math.random() * (xMax - xMin), y: (Math.random() * 2 - 1) * yMax, trail: [] });
      ctx.lineCap = 'round';
      for (const p of s.ps) {
        for (let k2 = 0; k2 < 2; k2++) {
          const dead = step(p, (dt * speed) / 2);
          if (dead || p.x > xMax + 0.2) {
            p.x = xMin - Math.random() * 0.5;
            p.y = (Math.random() * 2 - 1) * yMax;
            p.trail = [];
            break;
          }
        }
        p.trail.push(p.x, p.y);
        if (p.trail.length > 28) p.trail.splice(0, 2);
        ctx.beginPath();
        for (let i = 0; i < p.trail.length; i += 2) {
          if (i === 0) ctx.moveTo(X(p.trail[i]), Y(p.trail[i + 1]));
          else ctx.lineTo(X(p.trail[i]), Y(p.trail[i + 1]));
        }
        ctx.strokeStyle = 'rgba(226,240,255,0.55)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    } else {
      // linie czasu: pionowy rząd cząstek wypuszczanych jednocześnie
      if (t - s.lastEmit > 1.6) {
        s.lastEmit = t;
        const n = 70;
        s.lines.push({ pts: Array.from({ length: n }, (_, i) => ({ x: xMin + 0.3, y: yMax * (1 - (2 * (i + 0.5)) / n) * 0.95, dead: false })), hue: s.lines.length % 2 });
        if (s.lines.length > 8) s.lines.shift();
      }
      for (const L of s.lines) {
        for (const p of L.pts) if (!p.dead) for (let k2 = 0; k2 < 3; k2++) if (!p.dead) p.dead = step(p, (dt * speed) / 3);
        ctx.strokeStyle = L.hue ? 'rgba(250,204,21,0.9)' : 'rgba(125,211,252,0.9)';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let pen = false;
        L.pts.forEach((p, i) => {
          if (p.dead) {
            pen = false;
            return;
          }
          const prev = L.pts[i - 1];
          if (pen && prev && !prev.dead && Math.hypot(p.x - prev.x, p.y - prev.y) < 0.6) ctx.lineTo(X(p.x), Y(p.y));
          else ctx.moveTo(X(p.x), Y(p.y));
          pen = true;
        });
        ctx.stroke();
      }
      s.lines = s.lines.filter((L) => L.pts.some((p) => !p.dead && p.x < xMax));
    }

    // profil
    ctx.beginPath();
    outl.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();
    // siła nośna – prostopadle do napływu
    const CL = liftCoef(af, alpha);
    if (CL > 0.02) arrow(ctx, X(0), Y(0.3), X(0), Y(0.3 + CL * 1.1), '#4ade80', 4, 14);
    ctx.font = '600 14px Geist, sans-serif';
    ctx.fillStyle = '#4ade80';
    if (CL > 0.02) ctx.fillText('siła nośna', X(0) + 10, Y(0.4 + CL * 1.1));
  });

  const CL = liftCoef(af, alpha);
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div>
          C<sub>L</sub> = {fmt(CL, 2)} (teoria przepływu potencjalnego)
        </div>
        {pressure && (
          <div>
            <span style={{ color: '#60a5fa' }}>niebieski</span> – ciśnienie niższe od otoczenia, <span style={{ color: '#f87171' }}>czerwony</span> – wyższe
          </div>
        )}
        {view === 'czas' && <div style={{ opacity: 0.8 }}>Linie czasu: punkty wypuszczone razem. Górne docierają do krawędzi spływu wcześniej niż dolne – nie spotykają się ponownie!</div>}
      </InfoPortal>
    </>
  );
}

/* ======================= Krok 3: rozkład ciśnienia ======================= */

function PressureScene({ params }: SceneProps) {
  const alpha = Number(params.alpha ?? 6) * DEG;
  const camber = Number(params.camber ?? 0.06);
  const af = useMemo(() => makeAirfoil(0.1, camber), [camber]);
  const pts = useMemo(() => surfaceCp(af, alpha, 160), [af, alpha]);
  const CL = liftCoef(af, alpha);
  const k = 120;
  const ox = 330;
  const oy = 190;
  const mid = (af.xLE + af.xTE) / 2;
  const P = (x: number, y: number) => {
    const p = toWorld(x - mid, y, alpha);
    return [ox + p.x * k, oy - p.y * k] as const;
  };
  let iLE = 0;
  pts.forEach((p, i) => {
    if (p.x < pts[iLE].x) iLE = i;
  });
  const arrows: ReactNode[] = [];
  for (let i = 3; i < pts.length - 3; i += 5) {
    const a = pts[i - 1];
    const b = pts[i + 1];
    let nx = b.y - a.y;
    let ny = -(b.x - a.x);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const cp = Math.max(-3, Math.min(1, pts[i].cp));
    const L = Math.abs(cp) * 0.35;
    const base = P(pts[i].x, pts[i].y);
    const tip = P(pts[i].x + nx * L, pts[i].y + ny * L);
    if (cp < 0) arrows.push(<line key={i} x1={base[0]} y1={base[1]} x2={tip[0]} y2={tip[1]} stroke="#60a5fa" strokeWidth="2" markerEnd="url(#cpB)" />);
    else arrows.push(<line key={i} x1={tip[0]} y1={tip[1]} x2={base[0]} y2={base[1]} stroke="#f87171" strokeWidth="2" markerEnd="url(#cpR)" />);
  }
  const poly = pts.map((p) => P(p.x, p.y).join(',')).join(' ');
  // wykres −Cp(x/c)
  const gx = 640;
  const gw = 330;
  const gy = 60;
  const gh = 300;
  const GX = (x: number) => gx + ((x - af.xLE) / af.chord) * gw;
  const GY = (mcp: number) => gy + gh * 0.75 - (mcp / 4) * gh;
  const upper = pts.slice(0, iLE + 1);
  const lower = pts.slice(iLE);
  const line = (arr: typeof pts) => arr.map((p, i) => `${i ? 'L' : 'M'}${GX(p.x).toFixed(1)},${GY(Math.min(3, -p.cp)).toFixed(1)}`).join(' ');
  const lc = P(af.xLE + af.chord * 0.25, 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`}>
      <defs>
        {[
          ['cpB', '#60a5fa'],
          ['cpR', '#f87171'],
          ['cpG', '#4ade80'],
        ].map(([id, c]) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
      </defs>
      {arrows}
      <polygon points={poly} fill="#cbd5e1" />
      <line x1={lc[0]} y1={lc[1]} x2={lc[0]} y2={lc[1] - CL * 120} stroke="#4ade80" strokeWidth="6" markerEnd="url(#cpG)" />
      <text x={lc[0] + 10} y={lc[1] - CL * 120} fill="#4ade80" fontSize="15" fontWeight="700">
        wypadkowa siła nośna
      </text>
      <g>
        <rect x={gx - 10} y={gy - 30} width={gw + 20} height={gh + 70} rx="12" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" />
        <line x1={gx} x2={gx + gw} y1={GY(0)} y2={GY(0)} stroke="rgba(255,255,255,0.35)" />
        {[-1, 1, 2, 3].map((v) => (
          <g key={v}>
            <line x1={gx} x2={gx + gw} y1={GY(v)} y2={GY(v)} stroke="rgba(255,255,255,0.07)" />
            <text x={gx - 4} y={GY(v) + 4} fill="rgba(255,255,255,0.5)" fontSize="11" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <path d={line(upper)} fill="none" stroke="#60a5fa" strokeWidth="2.5" />
        <path d={line(lower)} fill="none" stroke="#f87171" strokeWidth="2.5" />
        <text x={gx} y={gy - 12} fill="rgba(255,255,255,0.7)" fontSize="13">
          −C<tspan baselineShift="sub">p</tspan> wzdłuż cięciwy (oś skierowana „w górę” = podciśnienie)
        </text>
        <text x={gx + gw} y={GY(0) + 34} fill="rgba(255,255,255,0.5)" fontSize="12" textAnchor="end">
          od krawędzi natarcia → do krawędzi spływu
        </text>
        <text x={gx + 8} y={gy + 14} fill="#60a5fa" fontSize="12">
          górna powierzchnia
        </text>
        <text x={gx + 8} y={gy + 30} fill="#f87171" fontSize="12">
          dolna powierzchnia
        </text>
      </g>
      <InfoPortal>
        <div>
          C<sub>L</sub> = {fmt(CL, 2)}
        </div>
        <div>Pole między krzywymi = siła nośna. Górna powierzchnia „ciągnie” (podciśnienie) mocniej, niż dolna „pcha”.</div>
        <div style={{ opacity: 0.75 }}>Cp = (p − p∞) / (½ρv²). Cp = 1 w punkcie spiętrzenia, ujemne – podciśnienie.</div>
      </InfoPortal>
    </svg>
  );
}

/* ======================= Krok 4: wzór na siłę nośną ======================= */

const PLANES: Record<string, { name: string; S: number; mtow: number; v: number; h: number; cl: number }> = {
  cessna: { name: 'Cessna 172', S: 16.2, mtow: 1111, v: 200, h: 1500, cl: 0.45 },
  a320: { name: 'Airbus A320', S: 122.6, mtow: 78000, v: 830, h: 11000, cl: 0.55 },
  b747: { name: 'Boeing 747-400', S: 525, mtow: 396900, v: 900, h: 10500, cl: 0.55 },
};

function LiftEqScene({ params }: SceneProps) {
  const sp = useSpeed();
  const pl = PLANES[String(params.plane ?? 'a320')];
  const v = Number(params.v ?? pl.v) / 3.6;
  const h = Number(params.h ?? pl.h);
  const cl = Number(params.cl ?? pl.cl);
  const mPct = Number(params.mass ?? 85) / 100;
  const t = useAnimationClock(true);
  const rho = isaRho(h);
  const q = 0.5 * rho * v * v;
  const L = q * pl.S * cl;
  const Wt = pl.mtow * mPct * G0;
  const ratio = L / Wt;
  const vReq = Math.sqrt((2 * Wt) / (rho * pl.S * cl));
  const drift = Math.max(-1, Math.min(1, (ratio - 1) * 3));
  const y = 230 - drift * 40 + Math.sin(t * 1.5) * 3;
  const sc = 110;
  return (
    <svg viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <marker id="leG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#4ade80" />
        </marker>
        <marker id="leR" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#f87171" />
        </marker>
      </defs>
      {/* sylwetka samolotu z boku */}
      <g transform={`translate(420 ${y})`}>
        <path d="M-180,0 Q-170,-22 -120,-24 L150,-20 Q190,-16 200,0 Q190,14 150,16 L-120,20 Q-170,20 -180,0 Z" fill="#cbd5e1" />
        <path d="M-150,-20 L-175,-80 L-140,-80 L-100,-22 Z" fill="#94a3b8" />
        <path d="M-20,4 L40,4 L60,26 L-10,26 Z" fill="#64748b" />
        <line x1="10" y1="-10" x2="10" y2={-10 - Math.min(170, ratio * sc)} stroke="#4ade80" strokeWidth="7" markerEnd="url(#leG)" />
        <text x="22" y={-20 - Math.min(170, ratio * sc)} fill="#4ade80" fontSize="16" fontWeight="700">
          L = {fmt(L / 1000, 0)} kN
        </text>
        <line x1="10" y1="20" x2="10" y2={20 + sc} stroke="#f87171" strokeWidth="7" markerEnd="url(#leR)" />
        <text x="22" y={20 + sc} fill="#f87171" fontSize="16" fontWeight="700">
          Q = {fmt(Wt / 1000, 0)} kN
        </text>
      </g>
      <g transform="translate(650 60)" fontSize="15" fill="#e2e8f0">
        <text y="0" fontSize="22" fontWeight="700">
          L = ½ · ρ · v² · S · C<tspan baselineShift="sub" fontSize="14">L</tspan>
        </text>
        <text y="36">ρ = {fmt(rho, 3)} kg/m³ (wys. {fmt(h, 0)} m)</text>
        <text y="60">v = {sp.fmt(v)}</text>
        <text y="84">S = {fmt(pl.S, 1)} m²</text>
        <text y="108">C<tspan baselineShift="sub" fontSize="11">L</tspan> = {fmt(cl, 2)}</text>
        <text y="140" fill={Math.abs(ratio - 1) < 0.03 ? '#4ade80' : ratio > 1 ? '#facc15' : '#f87171'} fontWeight="700">
          {Math.abs(ratio - 1) < 0.03 ? 'lot poziomy: L ≈ Q' : ratio > 1 ? `L > Q – samolot się wznosi` : `L < Q – samolot opada`}
        </text>
        <text y="166" fill="rgba(255,255,255,0.7)">
          do lotu poziomego potrzeba v = {sp.fmt(vReq)}
        </text>
      </g>
      <InfoPortal>
        <div style={{ fontWeight: 700 }}>{pl.name}</div>
        <div>
          masa {fmt((pl.mtow * mPct) / 1000, 1)} t · ciśnienie dynamiczne q = ½ρv² = {fmt(q / 1000, 1)} kPa
        </div>
        <div style={{ opacity: 0.75 }}>Siła nośna rośnie z kwadratem prędkości: 2× szybciej = 4× więcej siły nośnej.</div>
      </InfoPortal>
    </svg>
  );
}

/* ======================= Krok 5: kąt natarcia i przeciągnięcie ======================= */

const ALPHA_CRIT = 15.5;
/** Przybliżona charakterystyka C_L(α): część liniowa, zaokrąglenie przy maksimum i spadek po przeciągnięciu. */
function clGeneric(a: number, dCL: number, aCrit: number) {
  const a1 = aCrit - 3.5;
  const lin = (x: number) => 0.105 * (x + 2) + dCL;
  if (a <= a1) return lin(a);
  const top = lin(a1) + 0.11;
  if (a <= aCrit) {
    const k = (a - a1) / (aCrit - a1);
    return lin(a1) + 0.11 * (1 - (1 - k) * (1 - k));
  }
  return Math.max(top * 0.5, top - 0.09 * (a - aCrit) - 0.004 * (a - aCrit) ** 2);
}
const clOf = (a: number) => clGeneric(a, 0, ALPHA_CRIT);
const cdOf = (a: number) => 0.007 + 0.00011 * a * a + (a > ALPHA_CRIT - 2 ? 0.012 * Math.pow(a - (ALPHA_CRIT - 2), 1.4) : 0);

function StallScene({ params }: SceneProps) {
  const aDeg = Number(params.alpha ?? 5);
  const t = useAnimationClock(true);
  const alpha = aDeg * DEG;
  const af = useMemo(() => makeAirfoil(0.1, 0.05), []);
  // Separacja: od krawędzi spływu (≈ α_kr − 4°) do krawędzi natarcia (α_kr + 5°)
  const sep = Math.max(0, Math.min(1, (aDeg - (ALPHA_CRIT - 4)) / 9)); // 0 – brak, 1 – cała górna powierzchnia
  const stalled = aDeg > ALPHA_CRIT;
  const k = 62;
  const ox = 250;
  const oy = 240;
  const aCalc = Math.min(alpha, ALPHA_CRIT * DEG);
  const G = gammaKutta(af, aCalc) * (stalled ? 0.75 : 1);
  const mid = (af.xLE + af.xTE) / 2;
  const lines = useMemo(() => {
    const ys = [-2.4, -1.8, -1.25, -0.8, -0.4, 0.05, 0.4, 0.75, 1.15, 1.6, 2.1, 2.6];
    return ys.map((y0) => {
      const p = { x: -4.2, y: y0 };
      const pts: [number, number][] = [];
      for (let i = 0; i < 500; i++) {
        const v = worldVel(p.x, p.y, af, aCalc, G);
        if (v.inside) break;
        const sp = Math.hypot(v.u, v.v) || 1;
        p.x += (v.u / sp) * 0.04;
        p.y += (v.v / sp) * 0.04;
        pts.push([p.x, p.y]);
        if (p.x > 4.2) break;
      }
      return { y0, pts };
    });
  }, [af, aCalc, G, mid]);
  const outl = useMemo(() => outline(af, 120).map((p) => toWorld(p.x, p.y, alpha)), [af, alpha]);
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => oy - y * k;
  // punkt oderwania na górnej powierzchni (od krawędzi spływu w stronę natarcia)
  const teW = toWorld(af.xTE, 0, alpha);
  const leW = toWorld(af.xLE, 0, alpha);
  const sx = teW.x + (leW.x - teW.x) * sep * 0.85;
  const sy = teW.y + (leW.y - teW.y) * sep * 0.85 + 0.25 * sep + 0.12;
  const bubbleH = 0.25 + sep * 1.4;
  const eddies = sep > 0.05
    ? Array.from({ length: Math.round(2 + sep * 5) }, (_, i) => {
        const u = (i + ((t * 0.5) % 1)) / Math.round(2 + sep * 5);
        const ex = sx + u * (4 - sx);
        const ey = sy + bubbleH * 0.5 * Math.min(1, u * 3) - u * 0.3;
        const r = 0.15 + 0.35 * sep * Math.min(1, u * 2);
        return (
          <g key={i} transform={`translate(${X(ex)} ${Y(ey)}) rotate(${t * 260 + i * 40})`} opacity={0.7 * (1 - u * 0.6)}>
            <path d={`M${r * k},0 A${r * k},${r * k} 0 1 1 ${-r * k * 0.7},${r * k * 0.7}`} fill="none" stroke="#fb923c" strokeWidth="2" />
          </g>
        );
      })
    : [];
  // wykres CL(α), CD(α)
  const gx = 610;
  const gw = 350;
  const gy = 50;
  const gh = 320;
  const GX = (a: number) => gx + ((a + 6) / 28) * gw;
  const GY = (c: number) => gy + gh - ((c + 0.4) / 2.1) * gh;
  const curve = (f: (a: number) => number, scale = 1) => Array.from({ length: 120 }, (_, i) => -6 + (i / 119) * 28).map((a, i) => `${i ? 'L' : 'M'}${GX(a).toFixed(1)},${GY(f(a) * scale).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`}>
      {lines.map(({ y0, pts }) => {
        // nad punktem oderwania górne linie odchodzą od profilu
        const out: [number, number][] = [];
        let detached = false;
        const top = sy + bubbleH;
        for (const [x, y] of pts) {
          if (sep > 0.05 && y0 > -0.1 && x > sx && (detached || (y < top && y > sy - 0.6))) detached = true;
          if (detached) {
            // linia odrywa się od profilu i omija obszar oderwania (strefę wirów)
            const last = out[out.length - 1] ?? [x, y];
            const floor = top - (x - sx) * 0.12;
            out.push([x, Math.max(y, last[1] + (Math.max(floor, y) - last[1]) * 0.12)]);
          } else out.push([x, y]);
        }
        return <polyline key={y0} points={out.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')} fill="none" stroke="#7dd3fc" strokeWidth="1.8" opacity="0.75" />;
      })}
      {eddies}
      <polygon points={outl.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} fill="#cbd5e1" />
      {stalled && (
        <text x={X(0)} y={Y(-2.6)} fill="#f87171" fontSize="20" fontWeight="800" textAnchor="middle">
          PRZECIĄGNIĘCIE
        </text>
      )}
      <g>
        <rect x={gx - 10} y={gy - 30} width={gw + 20} height={gh + 70} rx="12" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" />
        <line x1={gx} x2={gx + gw} y1={GY(0)} y2={GY(0)} stroke="rgba(255,255,255,0.35)" />
        <line x1={GX(0)} x2={GX(0)} y1={gy} y2={gy + gh} stroke="rgba(255,255,255,0.2)" />
        <rect x={GX(ALPHA_CRIT)} y={gy} width={GX(22) - GX(ALPHA_CRIT)} height={gh} fill="rgba(248,113,113,0.08)" />
        <path d={curve(clOf)} fill="none" stroke="#4ade80" strokeWidth="3" />
        <path d={curve(cdOf, 5)} fill="none" stroke="#fb923c" strokeWidth="2.5" strokeDasharray="7 5" />
        <circle cx={GX(aDeg)} cy={GY(clOf(aDeg))} r="7" fill="#4ade80" />
        <circle cx={GX(aDeg)} cy={GY(cdOf(aDeg) * 5)} r="5" fill="#fb923c" />
        {[-5, 0, 5, 10, 15, 20].map((a) => (
          <text key={a} x={GX(a)} y={gy + gh + 18} fill="rgba(255,255,255,0.5)" fontSize="11" textAnchor="middle">
            {a}°
          </text>
        ))}
        <text x={gx} y={gy - 12} fill="rgba(255,255,255,0.75)" fontSize="13">
          <tspan fill="#4ade80">siła nośna C</tspan><tspan fill="#4ade80" baselineShift="sub" fontSize="10">L</tspan> i <tspan fill="#fb923c">opór 5 × C</tspan><tspan fill="#fb923c" baselineShift="sub" fontSize="10">D</tspan> w funkcji kąta natarcia α
        </text>
        <text x={GX(ALPHA_CRIT) + 4} y={gy + 16} fill="#f87171" fontSize="11">
          α krytyczny
        </text>
      </g>
      <InfoPortal>
        <div>
          α = {aDeg}° · C<sub>L</sub> = {fmt(clOf(aDeg), 2)} · C<sub>D</sub> = {fmt(cdOf(aDeg), 3)}
        </div>
        <div>doskonałość C<sub>L</sub>/C<sub>D</sub> = {fmt(clOf(aDeg) / cdOf(aDeg), 0)}</div>
        <div style={{ opacity: 0.75 }}>Charakterystyka przybliżona dla typowego profilu (np. NACA 2412).</div>
      </InfoPortal>
    </svg>
  );
}

/* ======================= Krok 6: klapy i sloty ======================= */

const CONFIGS: Record<string, { name: string; flap: number; fowler: number; slat: number; dCL: number; aCrit: number; note: string }> = {
  clean: { name: 'gładkie (przelot)', flap: 0, fowler: 0, slat: 0, dCL: 0, aCrit: 15.5, note: 'Najmniejszy opór – konfiguracja przelotowa.' },
  takeoff: { name: 'start (klapy 10°, sloty)', flap: 10, fowler: 0.06, slat: 1, dCL: 0.45, aCrit: 17.5, note: 'Umiarkowane wychylenie: więcej siły nośnej przy niewielkim wzroście oporu – samolot szybciej się odrywa, ale wciąż dobrze się wznosi.' },
  approach: { name: 'podejście (klapy 20°)', flap: 20, fowler: 0.1, slat: 1, dCL: 0.85, aCrit: 16, note: 'Wolniejszy lot przy podejściu do lądowania.' },
  landing: { name: 'lądowanie (klapy 35°)', flap: 35, fowler: 0.13, slat: 1, dCL: 1.35, aCrit: 14.5, note: 'Maksymalna siła nośna i duży opór – samolot leci wolno i stromo podchodzi do pasa, a opór pomaga hamować.' },
};

function FlapsScene({ params }: SceneProps) {
  const sp = useSpeed();
  const cfg = CONFIGS[String(params.cfg ?? 'clean')];
  const t = useAnimationClock(true);
  const sh = useMemo(() => naca(0.02, 0.4, 0.12, 120), []);
  const S = 520;
  const ox = 90;
  const oy = 200;
  const pieceFrom = (x0: number, x1: number) => {
    const up = sh.up.filter(([x]) => x >= x0 && x <= x1);
    const lo = sh.lo.filter(([x]) => x >= x0 && x <= x1);
    return [...up, ...lo.reverse()];
  };
  const tf = (pts: [number, number][], dx: number, dy: number, rot: number, px: number, py: number) =>
    pts
      .map(([x, y]) => {
        const rx = px + (x - px) * Math.cos(rot) + (y - py) * Math.sin(rot);
        const ry = py - (x - px) * Math.sin(rot) + (y - py) * Math.cos(rot);
        return `${(ox + (rx + dx) * S).toFixed(1)},${(oy - (ry + dy) * S).toFixed(1)}`;
      })
      .join(' ');
  const flapRot = cfg.flap * DEG;
  const slatRot = -cfg.slat * 18 * DEG;
  const main = pieceFrom(cfg.slat ? 0.1 : 0, 0.72);
  const flap = pieceFrom(0.72, 1);
  const slat = pieceFrom(0, 0.12);
  // strumień przez szczeliny
  const jets: ReactNode[] = [];
  if (cfg.slat) {
    for (let i = 0; i < 6; i++) {
      const u = (i / 6 + t * 0.6) % 1;
      const x = ox + (0.02 + u * 0.32) * S;
      const y = oy - (-0.03 + Math.sin(Math.min(1, u * 2) * Math.PI * 0.5) * 0.1) * S;
      jets.push(<circle key={`s${i}`} cx={x} cy={y} r="3.5" fill="#facc15" opacity={1 - u} />);
    }
  }
  if (cfg.flap) {
    for (let i = 0; i < 6; i++) {
      const u = (i / 6 + t * 0.6) % 1;
      const x = ox + (0.68 + cfg.fowler * 0.45 + u * 0.3) * S;
      const y = oy - (-0.06 + u * 0.05 - u * u * Math.sin(cfg.flap * DEG) * 0.3) * S;
      jets.push(<circle key={`f${i}`} cx={x} cy={y} r="3.5" fill="#facc15" opacity={1 - u} />);
    }
  }
  // krzywe CL(α) dla wszystkich konfiguracji
  const gx = 600;
  const gw = 360;
  const gy = 50;
  const gh = 300;
  const GX = (a: number) => gx + ((a + 6) / 28) * gw;
  const GY = (c: number) => gy + gh - ((c + 0.4) / 3.5) * gh;
  const clCfg = (c: (typeof CONFIGS)[string], a: number) => clGeneric(a, c.dCL, c.aCrit);
  const m = 64000;
  const clmax = (c: (typeof CONFIGS)[string]) => Math.max(...Array.from({ length: 200 }, (_, i) => clCfg(c, -6 + i * 0.14)));
  const vs = Math.sqrt((2 * m * G0) / (1.225 * 122.6 * clmax(cfg)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`}>
      <polygon points={tf(main, 0, 0, 0, 0, 0)} fill="#cbd5e1" />
      <polygon points={tf(flap, cfg.fowler * 0.45, -0.012 - cfg.fowler * 0.12, flapRot, 0.72, 0)} fill={cfg.flap ? '#facc15' : '#cbd5e1'} opacity={cfg.flap ? 0.9 : 1} />
      {cfg.slat ? <polygon points={tf(slat, -0.03, -0.022, slatRot, 0.12, 0.03)} fill="#38bdf8" /> : <polygon points={tf(slat, 0, 0, 0, 0, 0)} fill="#cbd5e1" />}
      {jets}
      <g fontSize="14" fontWeight="600">
        {cfg.slat ? (
          <text x={ox - 40} y={oy + 70} fill="#38bdf8">
            slot (skrzela) – wysunięty
          </text>
        ) : null}
        {cfg.flap ? (
          <text x={ox + 0.75 * S} y={oy + 110} fill="#facc15">
            klapa Fowlera – wysunięta i wychylona o {cfg.flap}°
          </text>
        ) : null}
      </g>
      <g>
        <rect x={gx - 10} y={gy - 30} width={gw + 20} height={gh + 70} rx="12" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" />
        <line x1={gx} x2={gx + gw} y1={GY(0)} y2={GY(0)} stroke="rgba(255,255,255,0.35)" />
        {Object.entries(CONFIGS).map(([id, c]) => (
          <path
            key={id}
            d={Array.from({ length: 100 }, (_, i) => -6 + (i / 99) * 28).map((a, i) => `${i ? 'L' : 'M'}${GX(a).toFixed(1)},${GY(clCfg(c, a)).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={c === cfg ? '#4ade80' : 'rgba(255,255,255,0.25)'}
            strokeWidth={c === cfg ? 3 : 1.5}
          />
        ))}
        {[-5, 0, 5, 10, 15, 20].map((a) => (
          <text key={a} x={GX(a)} y={gy + gh + 18} fill="rgba(255,255,255,0.5)" fontSize="11" textAnchor="middle">
            {a}°
          </text>
        ))}
        <text x={gx} y={gy - 12} fill="rgba(255,255,255,0.75)" fontSize="13">
          C<tspan baselineShift="sub" fontSize="10">L</tspan>(α) dla wszystkich konfiguracji (zielona – wybrana)
        </text>
      </g>
      <InfoPortal>
        <div style={{ fontWeight: 700 }}>{cfg.name}</div>
        <div>
          C<sub>L max</sub> ≈ {fmt(clmax(cfg), 2)} · prędkość przeciągnięcia A320 (64 t, poziom morza) ≈ <b>{sp.fmt(vs)}</b>
        </div>
        <div style={{ opacity: 0.8 }}>{cfg.note}</div>
      </InfoPortal>
    </svg>
  );
}

/* ======================= Krok 8: zakręt i współczynnik obciążenia ======================= */

function TurnScene({ params }: SceneProps) {
  const phi = Number(params.bank ?? 30) * DEG;
  const v = Number(params.v ?? 400) / 3.6;
  const t = useAnimationClock(true);
  const n = 1 / Math.cos(phi);
  const r = (v * v) / (G0 * Math.tan(Math.max(phi, 0.001)));
  const T360 = (2 * Math.PI * r) / v;
  const cx = 300;
  const cy = 230;
  const Lp = 110 * n;
  return (
    <svg viewBox={`0 0 ${W} ${H}`}>
      <defs>
        {[
          ['tG', '#4ade80'],
          ['tR', '#f87171'],
          ['tY', '#facc15'],
          ['tB', '#38bdf8'],
        ].map(([id, c]) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
      </defs>
      <line x1="40" y1={cy + 150} x2="560" y2={cy + 150} stroke="rgba(255,255,255,0.15)" />
      <text x="40" y={cy + 172} fill="rgba(255,255,255,0.5)" fontSize="12">
        horyzont – widok samolotu od przodu
      </text>
      <g transform={`translate(${cx} ${cy}) rotate(${-phi / DEG})`}>
        <rect x="-220" y="-6" width="440" height="12" rx="6" fill="#cbd5e1" />
        <circle cx="0" cy="0" r="26" fill="#94a3b8" />
        <rect x="-4" y="-60" width="8" height="40" fill="#94a3b8" />
        <line x1="0" y1="-28" x2="0" y2={-28 - Lp} stroke="#4ade80" strokeWidth="7" markerEnd="url(#tG)" />
        <text x="10" y={-40 - Lp} fill="#4ade80" fontSize="16" fontWeight="700">
          L = {fmt(n, 2)} Q
        </text>
      </g>
      {/* składowe */}
      <line x1={cx} y1={cy} x2={cx} y2={cy - Lp * Math.cos(phi) - 28} stroke="#38bdf8" strokeWidth="3" strokeDasharray="6 4" markerEnd="url(#tB)" />
      <line x1={cx} y1={cy} x2={cx - (Lp + 28) * Math.sin(phi)} y2={cy} stroke="#facc15" strokeWidth="3" strokeDasharray="6 4" markerEnd="url(#tY)" />
      <text x={cx - (Lp + 28) * Math.sin(phi) - 6} y={cy + 24} fill="#facc15" fontSize="13" textAnchor="middle">
        siła dośrodkowa
      </text>
      <line x1={cx} y1={cy + 30} x2={cx} y2={cy + 140} stroke="#f87171" strokeWidth="7" markerEnd="url(#tR)" />
      <text x={cx + 12} y={cy + 130} fill="#f87171" fontSize="16" fontWeight="700">
        Q
      </text>
      {/* widok z góry: okrąg zakrętu */}
      <g transform="translate(790 230)">
        <circle cx="0" cy="0" r="130" fill="none" stroke="rgba(255,255,255,0.18)" strokeDasharray="5 6" />
        <g transform={`rotate(${((t / Math.max(4, Math.min(T360, 120))) * 360 * 4) % 360})`}>
          <path d="M130,-14 L138,0 L130,14 L122,0 Z M118,0 L142,0" stroke="#cbd5e1" strokeWidth="3" fill="#cbd5e1" />
        </g>
        <text x="0" y="5" fill="rgba(255,255,255,0.7)" fontSize="14" textAnchor="middle">
          r = {r > 99999 ? '∞' : `${fmt(r / 1000, 2)} km`}
        </text>
        <text x="0" y="160" fill="rgba(255,255,255,0.5)" fontSize="12" textAnchor="middle">
          widok z góry
        </text>
      </g>
      <InfoPortal>
        <div>
          współczynnik obciążenia <b>n = 1 / cos φ = {fmt(n, 2)}</b>
        </div>
        <div>prędkość przeciągnięcia rośnie √n razy: +{fmt((Math.sqrt(n) - 1) * 100, 0)}%</div>
        <div>
          promień zakrętu {r > 99999 ? '–' : `${fmt(r, 0)} m`}, pełny okrąg w {phi < 0.01 ? '–' : `${fmt(T360, 0)} s`}
        </div>
        <div style={{ opacity: 0.75 }}>Samoloty pasażerskie przechylają się zwykle do 25–30°; przy 60° n = 2 – pasażerowie czują się dwa razy ciężsi.</div>
      </InfoPortal>
    </svg>
  );
}

/* ======================= Temat ======================= */

export const wing: Topic = {
  id: 'skrzydlo-sila-nosna',
  title: 'Skrzydło i siła nośna',
  subject: 'lotnictwo',
  summary: 'Profil skrzydła, opływ liczony na żywo, rozkład ciśnienia, wzór na siłę nośną, przeciągnięcie, klapy i sloty, wiry brzegowe w 3D i siły w zakręcie.',
  accent: '#38bdf8',
  glyph: '⌒',
  steps: [
    {
      title: 'Budowa profilu',
      kind: '2d',
      scene: ProfileScene,
      controls: [
        {
          type: 'select',
          key: 'profile',
          label: 'Profil',
          default: '2412',
          options: Object.entries(PROFILES).map(([value, p]) => ({ value, label: p.name })),
        },
        { type: 'slider', key: 'alpha', label: 'Kąt natarcia α', min: -5, max: 20, step: 1, default: 5, unit: '°' },
        { type: 'toggle', key: 'labels', label: 'Opisy', default: true },
      ],
      body: (
        <>
          <p>
            Przekrój skrzydła nazywamy <strong>profilem</strong>. Ma zaokrągloną <strong>krawędź natarcia</strong>, ostrą{' '}
            <strong>krawędź spływu</strong>, a odcinek między nimi to <strong>cięciwa</strong>.
          </p>
          <p>
            Profil zwykle jest <strong>wygięty</strong> – jego linia szkieletowa (w połowie grubości) jest łukiem, a nie
            prostą. Wygięcie i grubość decydują o tym, ile siły nośnej i oporu daje skrzydło. Cyfry w nazwach NACA kodują
            właśnie te wymiary.
          </p>
          <p>
            Najważniejszy parametr lotu to <strong>kąt natarcia α</strong> – kąt między cięciwą a napływającym powietrzem.
            Pilot zmienia go sterem wysokości, a wraz z nim siłę nośną.
          </p>
        </>
      ),
    },
    {
      title: 'Opływ skrzydła',
      kind: '2d',
      scene: FlowScene,
      controls: [
        { type: 'slider', key: 'alpha', label: 'Kąt natarcia α', min: -6, max: 14, step: 0.5, default: 6, unit: '°' },
        { type: 'slider', key: 'camber', label: 'Wygięcie profilu', min: 0, max: 0.15, step: 0.01, default: 0.08, decimals: 2 },
        {
          type: 'select',
          key: 'view',
          label: 'Wizualizacja',
          default: 'smugi',
          options: [
            { value: 'smugi', label: 'smugi (tory cząstek)' },
            { value: 'czas', label: 'linie czasu' },
          ],
        },
        { type: 'toggle', key: 'pressure', label: 'Pole ciśnienia', default: true },
      ],
      body: (
        <>
          <p>
            To nie jest rysunek, tylko <strong>obliczony przepływ</strong> wokół profilu (model przepływu potencjalnego dla
            profilu Żukowskiego). Powietrze nad skrzydłem przyspiesza i ciśnienie spada (niebieskie), a pod nim lekko
            zwalnia i ciśnienie rośnie (czerwone).
          </p>
          <p>
            Wybierz <strong>linie czasu</strong>: cząstki wypuszczone jednocześnie przelatują nad skrzydłem{' '}
            <strong>szybciej</strong> i nie spotykają się z dolnymi za krawędzią spływu. Popularne wyjaśnienie o „równym
            czasie przelotu” jest więc mitem.
          </p>
          <p>
            Zauważ też, że za skrzydłem cały strumień jest skierowany <strong>w dół</strong>. Skrzydło odchyla masę
            powietrza w dół, więc powietrze pcha skrzydło w górę (III zasada dynamiki). Różnica ciśnień i odchylenie
            strumienia to dwa opisy tego samego zjawiska, a nie dwie konkurencyjne teorie.
          </p>
        </>
      ),
    },
    {
      title: 'Rozkład ciśnienia',
      kind: '2d',
      scene: PressureScene,
      controls: [
        { type: 'slider', key: 'alpha', label: 'Kąt natarcia α', min: -6, max: 14, step: 0.5, default: 6, unit: '°' },
        { type: 'slider', key: 'camber', label: 'Wygięcie profilu', min: 0, max: 0.15, step: 0.01, default: 0.06, decimals: 2 },
      ],
      body: (
        <>
          <p>
            Strzałki pokazują ciśnienie na każdym fragmencie powierzchni: <span style={{ color: '#60a5fa' }}>niebieskie</span>{' '}
            „ciągną” na zewnątrz (podciśnienie), <span style={{ color: '#f87171' }}>czerwone</span> naciskają (nadciśnienie).
          </p>
          <p>
            Największe podciśnienie powstaje tuż za krawędzią natarcia na górnej powierzchni – to ona daje większość siły
            nośnej. Na wykresie po prawej pole między krzywą górną a dolną jest proporcjonalne do C<sub>L</sub>.
          </p>
          <p>
            Zwiększ kąt natarcia: szczyt podciśnienia rośnie i przesuwa się do przodu. Za nim powietrze musi „wspinać się”
            pod rosnące ciśnienie – stąd bierze się przeciągnięcie, które zobaczysz w kolejnych krokach.
          </p>
        </>
      ),
    },
    {
      title: 'Wzór na siłę nośną',
      kind: '2d',
      scene: LiftEqScene,
      controls: [
        {
          type: 'select',
          key: 'plane',
          label: 'Samolot',
          default: 'a320',
          options: Object.entries(PLANES).map(([value, p]) => ({ value, label: p.name })),
        },
        { type: 'slider', key: 'v', label: 'Prędkość', min: 80, max: 950, step: 5, default: 830, unit: 'km/h' },
        { type: 'slider', key: 'h', label: 'Wysokość', min: 0, max: 12000, step: 100, default: 11000, unit: 'm' },
        { type: 'slider', key: 'cl', label: 'Współczynnik C_L', min: 0.1, max: 1.6, step: 0.01, default: 0.55, decimals: 2 },
        { type: 'slider', key: 'mass', label: 'Masa (% maks.)', min: 50, max: 100, step: 1, default: 85, unit: '%' },
      ],
      body: (
        <>
          <p>
            <strong>L = ½ · ρ · v² · S · C<sub>L</sub></strong>. Siła nośna zależy od gęstości powietrza ρ, kwadratu
            prędkości, powierzchni skrzydeł S i współczynnika C<sub>L</sub>, w którym ukryty jest profil i kąt natarcia.
          </p>
          <p>
            W locie poziomym siła nośna równoważy ciężar Q, a ciąg silników – opór. Zmień wysokość: wyżej powietrze jest
            rzadsze, więc żeby utrzymać się w powietrzu, trzeba lecieć szybciej albo zwiększyć C<sub>L</sub> (kąt natarcia).
          </p>
          <p>
            Dlatego samolot pasażerski na 11 km leci ok. 830 km/h, a przy lądowaniu – ok. 250 km/h: gęstsze powietrze,
            mniejsza masa (spalone paliwo) i wysunięte klapy pozwalają zwolnić.
          </p>
        </>
      ),
    },
    {
      title: 'Kąt natarcia i przeciągnięcie',
      kind: '2d',
      scene: StallScene,
      controls: [{ type: 'slider', key: 'alpha', label: 'Kąt natarcia α', min: -4, max: 22, step: 0.5, default: 5, unit: '°' }],
      body: (
        <>
          <p>
            Na początku siła nośna rośnie liniowo z kątem natarcia (ok. 0,1 C<sub>L</sub> na stopień). Ale powietrze nad
            skrzydłem musi płynąć „pod górkę” – z obszaru niskiego ciśnienia do wyższego przy krawędzi spływu.
          </p>
          <p>
            Przy dużym α warstwa przyścienna traci energię i <strong>odrywa się</strong> od powierzchni – najpierw przy
            krawędzi spływu, potem coraz bliżej natarcia. Za skrzydłem powstaje burzliwy ślad wirowy.
          </p>
          <p>
            Po przekroczeniu <strong>krytycznego kąta natarcia</strong> (ok. 15–16°) siła nośna gwałtownie spada, a opór
            rośnie: to <strong>przeciągnięcie</strong>. Ważne: zależy ono od kąta natarcia, a nie od prędkości – samolot
            może przeciągnąć przy każdej prędkości, jeśli pilot zbyt mocno ściągnie wolant.
          </p>
        </>
      ),
    },
    {
      title: 'Klapy i sloty',
      kind: '2d',
      scene: FlapsScene,
      controls: [
        {
          type: 'select',
          key: 'cfg',
          label: 'Konfiguracja',
          default: 'clean',
          options: Object.entries(CONFIGS).map(([value, c]) => ({ value, label: c.name })),
        },
      ],
      body: (
        <>
          <p>
            Przy starcie i lądowaniu samolot musi lecieć wolno, a skrzydło zaprojektowane do szybkiego przelotu daje wtedy
            za mało siły nośnej. Rozwiązaniem są <strong>urządzenia hipernośne</strong>.
          </p>
          <p>
            <strong>Klapy</strong> (np. typu Fowlera) wysuwają się do tyłu i w dół: zwiększają powierzchnię i wygięcie
            profilu, więc cała krzywa C<sub>L</sub> przesuwa się w górę. <strong>Sloty</strong> na krawędzi natarcia
            tworzą szczelinę, przez którą szybki strumień (żółte kropki) zasila górną powierzchnię i opóźnia oderwanie.
          </p>
          <p>
            Przełączaj konfiguracje i patrz na prędkość przeciągnięcia A320: w konfiguracji do lądowania jest o kilkadziesiąt
            węzłów niższa niż przy gładkim skrzydle. Wartości są przybliżone.
          </p>
        </>
      ),
    },
    {
      title: 'Wiry brzegowe i opór indukowany',
      kind: '3d',
      scene: WingVortexScene,
      camera: [-6, 4.5, 9],
      target: [2, 0, 0],
      controls: [
        { type: 'slider', key: 'ar', label: 'Wydłużenie skrzydła', min: 4, max: 14, step: 0.5, default: 8 },
        { type: 'slider', key: 'cl', label: 'Współczynnik C_L', min: 0.2, max: 1.4, step: 0.05, default: 0.8, decimals: 2 },
        { type: 'toggle', key: 'winglets', label: 'Winglety', default: false },
      ],
      body: (
        <>
          <p>
            Pod skrzydłem ciśnienie jest wyższe niż nad nim, więc na końcach skrzydeł powietrze <strong>przelewa się</strong>{' '}
            z dołu na górę. Ruch do przodu zamienia to przelewanie w dwa <strong>wiry brzegowe</strong>, ciągnące się
            kilometrami za samolotem.
          </p>
          <p>
            Wiry kierują powietrze za skrzydłem w dół (<strong>odchylenie strumienia</strong>, niebieskie kropki), przez co
            siła nośna przechyla się lekko do tyłu. Ta „przechylona” część to <strong>opór indukowany</strong>: C
            <sub>Di</sub> = C<sub>L</sub>² / (π·e·λ). Największy jest przy dużym C<sub>L</sub>, czyli przy powolnym locie.
          </p>
          <p>
            Zwiększ <strong>wydłużenie</strong> λ (stosunek rozpiętości do średniej cięciwy) – długie, smukłe skrzydła
            szybowców mają mały opór indukowany. <strong>Winglety</strong> działają podobnie jak dodatkowa rozpiętość.
          </p>
        </>
      ),
    },
    {
      title: 'Siły w zakręcie',
      kind: '2d',
      scene: TurnScene,
      controls: [
        { type: 'slider', key: 'bank', label: 'Przechylenie φ', min: 0, max: 75, step: 1, default: 30, unit: '°' },
        { type: 'slider', key: 'v', label: 'Prędkość', min: 150, max: 900, step: 10, default: 400, unit: 'km/h' },
      ],
      body: (
        <>
          <p>
            Samolot nie skręca sterem kierunku jak statek – <strong>przechyla się</strong>. Siła nośna, prostopadła do
            skrzydeł, przechyla się razem z nim i jej pozioma składowa staje się siłą dośrodkową.
          </p>
          <p>
            Pionowa składowa musi nadal równoważyć ciężar, więc całkowita siła nośna musi wzrosnąć:{' '}
            <strong>n = 1 / cos φ</strong>. Przy 60° skrzydła niosą dwa razy więcej niż w locie prostym, a prędkość
            przeciągnięcia rośnie o ok. 41%.
          </p>
          <p>Większa prędkość przy tym samym przechyleniu oznacza szerszy zakręt (r = v² / (g · tg φ)).</p>
        </>
      ),
    },
  ],
};
