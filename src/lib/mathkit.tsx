import { useId, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Axes, C, fmt, makePlot, type Frame, type Plot } from './plot';

/** Wspólne pole rysunku scen matematycznych 2D. */
export const VIEW = '0 0 900 560';
export const FULL: Omit<Frame, 'xMin' | 'xMax' | 'yMin' | 'yMax'> = { x: 42, y: 25, w: 816, h: 510 };

/** Ramka z zakresem dobranym do proporcji 816 × 510 (jednostki na osiach mają tę samą długość). */
export function squareFrame(cx: number, cy: number, halfW: number): Frame {
  const halfH = (halfW * FULL.h) / FULL.w;
  return { ...FULL, xMin: cx - halfW, xMax: cx + halfW, yMin: cy - halfH, yMax: cy + halfH };
}

export function usePlot(frame: Frame) {
  return makePlot(frame);
}

/** Płótno SVG z osiami. */
export function Board({ p, children, step = 1, axes = true, labels = true, xLabel, yLabel }: { p: Plot; children: ReactNode; step?: number; axes?: boolean; labels?: boolean; xLabel?: string; yLabel?: string }) {
  const clip = `clip-${useId().replace(/:/g, '')}`;
  const f = p.frame;
  return (
    <svg viewBox={VIEW}>
      <defs>
        <clipPath id={clip}>
          <rect x={f.x} y={f.y} width={f.w} height={f.h} />
        </clipPath>
        {[C.main, C.second, C.third, C.good, C.bad, '#ffffff', '#c084fc'].map((c) => (
          <marker key={c} id={`ah-${c.replace('#', '')}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
      </defs>
      <g clipPath={`url(#${clip})`}>
        {axes && <Axes p={p} step={step} labels={labels} xLabel={xLabel} yLabel={yLabel} />}
        {children}
      </g>
    </svg>
  );
}

/** Znacznik grotu strzałki w danym kolorze (musi być jednym z kolorów zdefiniowanych w <Board>). */
export const head = (color: string) => `url(#ah-${color.replace('#', '')})`;

/** Wykres funkcji; `draw` – animacja rysowania przy pierwszym pojawieniu się. */
export function Curve({
  p,
  f,
  color = C.main,
  width = 3.5,
  dash,
  from,
  to,
  draw = false,
  opacity = 1,
  n = 300,
}: {
  p: Plot;
  f: (x: number) => number;
  color?: string;
  width?: number;
  dash?: string;
  from?: number;
  to?: number;
  draw?: boolean;
  opacity?: number;
  n?: number;
}) {
  const d = p.path(f, from, to, n);
  if (draw)
    return (
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        opacity={opacity}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: 'easeInOut' }}
      />
    );
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" opacity={opacity} />;
}

/** Krzywa parametryczna w układzie wykresu. */
export function Param({ p, fx, fy, t0, t1, color = C.main, width = 3, n = 240, dash, fill = 'none', fillOpacity }: { p: Plot; fx: (t: number) => number; fy: (t: number) => number; t0: number; t1: number; color?: string; width?: number; n?: number; dash?: string; fill?: string; fillOpacity?: number }) {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    d += `${i ? 'L' : 'M'}${p.sx(fx(t)).toFixed(2)},${p.sy(fy(t)).toFixed(2)}`;
  }
  return <path d={d} fill={fill} fillOpacity={fillOpacity} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round" />;
}

/** Odcinek w jednostkach wykresu. */
export function Seg({ p, a, b, color = C.ghost, width = 2, dash, arrow }: { p: Plot; a: [number, number]; b: [number, number]; color?: string; width?: number; dash?: string; arrow?: boolean }) {
  return <line x1={p.sx(a[0])} y1={p.sy(a[1])} x2={p.sx(b[0])} y2={p.sy(b[1])} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" markerEnd={arrow ? head(color) : undefined} />;
}

/** Wielokąt w jednostkach wykresu. */
export function Poly({ p, pts, color = C.main, fill = 'none', fillOpacity = 0.2, width = 2.5, dash }: { p: Plot; pts: [number, number][]; color?: string; fill?: string; fillOpacity?: number; width?: number; dash?: string }) {
  return (
    <polygon
      points={pts.map(([x, y]) => `${p.sx(x).toFixed(2)},${p.sy(y).toFixed(2)}`).join(' ')}
      fill={fill}
      fillOpacity={fillOpacity}
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dash}
      strokeLinejoin="round"
    />
  );
}

/** Napis w jednostkach wykresu. */
export function Label({ p, x, y, children, color = C.text, size = 15, anchor = 'middle', dx = 0, dy = 0, weight = 600, italic }: { p: Plot; x: number; y: number; children: ReactNode; color?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; dx?: number; dy?: number; weight?: number; italic?: boolean }) {
  return (
    <text x={p.sx(x) + dx} y={p.sy(y) + dy} fill={color} fontFamily="Geist" fontSize={size} fontWeight={weight} textAnchor={anchor} fontStyle={italic ? 'italic' : undefined} paintOrder="stroke" stroke="#0b0d12" strokeWidth="4" strokeLinejoin="round">
      {children}
    </text>
  );
}

/** Punkt w jednostkach wykresu (bez etykiety – etykiety najlepiej w ramce). */
export function Pt({ p, x, y, color = C.third, r = 6, label, dx = 10, dy = -10 }: { p: Plot; x: number; y: number; color?: string; r?: number; label?: ReactNode; dx?: number; dy?: number }) {
  return (
    <g>
      <circle cx={p.sx(x)} cy={p.sy(y)} r={r + 6} fill={color} opacity={0.18} />
      <circle cx={p.sx(x)} cy={p.sy(y)} r={r} fill={color} stroke="#0b0d12" strokeWidth="2" />
      {label && (
        <Label p={p} x={x} y={y} dx={dx} dy={dy} color={color} anchor={dx < 0 ? 'end' : 'start'}>
          {label}
        </Label>
      )}
    </g>
  );
}

/** Łuk kąta o wierzchołku v, od kierunku a0 do a1 (radiany, przeciwnie do wskazówek zegara w układzie matematycznym). */
export function AngleArc({ p, v, a0, a1, r = 0.6, color = C.third, fill = true }: { p: Plot; v: [number, number]; a0: number; a1: number; r?: number; color?: string; fill?: boolean }) {
  let span = a1 - a0;
  while (span < 0) span += Math.PI * 2;
  const n = 32;
  let d = fill ? `M${p.sx(v[0])},${p.sy(v[1])}` : '';
  for (let i = 0; i <= n; i++) {
    const t = a0 + (span * i) / n;
    d += `${!fill && i === 0 ? 'M' : 'L'}${p.sx(v[0] + Math.cos(t) * r).toFixed(2)},${p.sy(v[1] + Math.sin(t) * r).toFixed(2)}`;
  }
  if (fill) d += 'Z';
  return <path d={d} fill={fill ? color : 'none'} fillOpacity={0.22} stroke={color} strokeWidth="2" />;
}

/** Znacznik kąta prostego. */
export function RightMark({ p, v, a, s = 0.35, color = C.ghost }: { p: Plot; v: [number, number]; a: number; s?: number; color?: string }) {
  const u = [Math.cos(a), Math.sin(a)];
  const w = [Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2)];
  const pts: [number, number][] = [
    [v[0] + u[0] * s, v[1] + u[1] * s],
    [v[0] + (u[0] + w[0]) * s, v[1] + (u[1] + w[1]) * s],
    [v[0] + w[0] * s, v[1] + w[1] * s],
  ];
  return <polyline points={pts.map(([x, y]) => `${p.sx(x)},${p.sy(y)}`).join(' ')} fill="none" stroke={color} strokeWidth="1.8" />;
}

/** Zapis „+ 3x”, „− 2”; pomija zera. */
export function term(v: number, suffix: string, first = false, d = 2): string {
  if (Math.abs(v) < 1e-9) return '';
  const sign = v < 0 ? '−' : first ? '' : '+';
  const abs = Math.abs(v);
  const num = suffix && Math.abs(abs - 1) < 1e-9 ? '' : fmt(abs, Number.isInteger(+abs.toFixed(6)) ? 0 : d);
  return `${first ? sign : ` ${sign} `}${num}${suffix}`;
}

/** Liczba w zapisie polskim, bez zbędnych zer. */
export function num(v: number, d = 2): string {
  const r = +v.toFixed(d);
  return fmt(r, Number.isInteger(r) ? 0 : d);
}

/** Wewnętrzny przedział wartości – do kolorowania zbiorów rozwiązań na osi x. */
export function Band({ p, from, to, color = C.good, y = 0, h = 8 }: { p: Plot; from: number; to: number; color?: string; y?: number; h?: number }) {
  const f = p.frame;
  const a = Math.max(f.xMin, from);
  const b = Math.min(f.xMax, to);
  if (b <= a) return null;
  return <rect x={p.sx(a)} y={p.sy(y) - h / 2} width={p.sx(b) - p.sx(a)} height={h} rx={h / 2} fill={color} opacity={0.85} />;
}

export { C, fmt };
