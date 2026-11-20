import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Kolory wspólne dla scen matematycznych. */
export const C = {
  axis: 'rgba(255,255,255,0.55)',
  grid: 'rgba(255,255,255,0.07)',
  text: 'rgba(255,255,255,0.6)',
  main: '#ff6b8b',
  second: '#4fc3ff',
  third: '#ffd166',
  good: '#4ade80',
  bad: '#f87171',
  ghost: 'rgba(255,255,255,0.22)',
};

export interface Frame {
  /** Obszar w pikselach (współrzędne SVG). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Zakres matematyczny. */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function makePlot(f: Frame) {
  const sx = (x: number) => f.x + ((x - f.xMin) / (f.xMax - f.xMin)) * f.w;
  const sy = (y: number) => f.y + f.h - ((y - f.yMin) / (f.yMax - f.yMin)) * f.h;
  /** Ścieżka SVG wykresu funkcji; przerywa linię poza zakresem y (np. asymptoty). */
  const path = (fn: (x: number) => number, from = f.xMin, to = f.xMax, n = 300) => {
    let d = '';
    let pen = false;
    const pad = (f.yMax - f.yMin) * 2;
    let prev = NaN;
    for (let i = 0; i <= n; i++) {
      const x = from + ((to - from) * i) / n;
      const y = fn(x);
      if (!Number.isFinite(y) || y > f.yMax + pad || y < f.yMin - pad) {
        pen = false;
        continue;
      }
      // skok przez asymptotę pionową – nie łączymy punktów
      if (pen && Math.abs(y - prev) > (f.yMax - f.yMin) * 0.9 && Math.sign(y) !== Math.sign(prev)) pen = false;
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`;
      pen = true;
      prev = y;
    }
    return d;
  };
  /** Obszar między wykresem a osią x (do zaznaczania rozwiązań nierówności). */
  const area = (fn: (x: number) => number, from: number, to: number, n = 120) => {
    let d = `M${sx(from)},${sy(0)}`;
    for (let i = 0; i <= n; i++) {
      const x = from + ((to - from) * i) / n;
      const y = Math.max(f.yMin, Math.min(f.yMax, fn(x)));
      d += `L${sx(x).toFixed(2)},${sy(y).toFixed(2)}`;
    }
    return `${d}L${sx(to)},${sy(0)}Z`;
  };
  return { sx, sy, path, area, frame: f };
}

export type Plot = ReturnType<typeof makePlot>;

/** Siatka i osie z podziałką. */
export function Axes({ p, step = 1, labels = true, xLabel = 'x', yLabel = 'y' }: { p: Plot; step?: number; labels?: boolean; xLabel?: string; yLabel?: string }) {
  const { frame: f, sx, sy } = p;
  const xs: number[] = [];
  for (let x = Math.ceil(f.xMin / step) * step; x <= f.xMax; x += step) xs.push(+x.toFixed(6));
  const ys: number[] = [];
  for (let y = Math.ceil(f.yMin / step) * step; y <= f.yMax; y += step) ys.push(+y.toFixed(6));
  const x0 = Math.max(f.xMin, Math.min(f.xMax, 0));
  const y0 = Math.max(f.yMin, Math.min(f.yMax, 0));
  const labelEvery = Math.max(1, Math.round((f.xMax - f.xMin) / step / 16));
  return (
    <g fontFamily="Geist" fontSize="11" className="axes">
      {xs.map((x) => (
        <line key={`gx${x}`} x1={sx(x)} x2={sx(x)} y1={f.y} y2={f.y + f.h} stroke={C.grid} />
      ))}
      {ys.map((y) => (
        <line key={`gy${y}`} x1={f.x} x2={f.x + f.w} y1={sy(y)} y2={sy(y)} stroke={C.grid} />
      ))}
      <line x1={f.x} x2={f.x + f.w} y1={sy(y0)} y2={sy(y0)} stroke={C.axis} strokeWidth="1.5" />
      <line x1={sx(x0)} x2={sx(x0)} y1={f.y} y2={f.y + f.h} stroke={C.axis} strokeWidth="1.5" />
      <text x={f.x + f.w - 4} y={sy(y0) - 6} fill={C.text} textAnchor="end" fontStyle="italic" fontSize="13">
        {xLabel}
      </text>
      <text x={sx(x0) + 6} y={f.y + 12} fill={C.text} fontStyle="italic" fontSize="13">
        {yLabel}
      </text>
      {labels &&
        xs
          .filter((x, i) => x !== 0 && i % labelEvery === 0)
          .map((x) => (
            <text key={`lx${x}`} x={sx(x)} y={sy(y0) + 15} fill={C.text} textAnchor="middle">
              {String(x).replace('.', ',').replace('-', '−')}
            </text>
          ))}
      {labels &&
        ys
          .filter((y, i) => y !== 0 && i % labelEvery === 0)
          .map((y) => (
            <text key={`ly${y}`} x={sx(x0) - 6} y={sy(y) + 4} fill={C.text} textAnchor="end">
              {String(y).replace('.', ',').replace('-', '−')}
            </text>
          ))}
    </g>
  );
}

/** Punkt z etykietą. */
export function Dot({ x, y, color, label, dx = 8, dy = -10, r = 6 }: { x: number; y: number; color: string; label?: ReactNode; dx?: number; dy?: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 6} fill={color} opacity={0.18} />
      <circle cx={x} cy={y} r={r} fill={color} stroke="#10131c" strokeWidth="2" />
      {label && (
        <text x={x + dx} y={y + dy} fill={color} fontFamily="Geist" fontWeight="600" fontSize="14" textAnchor={dx < 0 ? 'end' : 'start'}>
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * Magazyn treści ramki informacyjnej. W scenach 3D (wewnątrz <Canvas> działa renderer Three.js)
 * nie da się zrobić portalu do HTML-a, więc treść trafia tutaj, a wyświetla ją <InfoDisplay> poza Canvasem.
 */
export function createInfoStore() {
  let node: ReactNode = null;
  const listeners = new Set<() => void>();
  return {
    get: () => node,
    set: (n: ReactNode) => {
      node = n;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
export type InfoStore = ReturnType<typeof createInfoStore>;

export function InfoDisplay({ store }: { store: InfoStore }) {
  const node = useSyncExternalStore(store.subscribe, store.get);
  return <>{node}</>;
}

/** Cel ramek: element HTML (sceny 2D, portal) albo magazyn (sceny 3D). */
export const InfoSlot = createContext<{ el?: HTMLElement | null; store?: InfoStore } | null>(null);

function useInfo(node: ReactNode) {
  const ctx = useContext(InfoSlot);
  useEffect(() => {
    if (ctx?.store) ctx.store.set(node);
  });
  useEffect(() => () => ctx?.store?.set(null), [ctx]);
  if (ctx?.el && !ctx.store) return createPortal(node, ctx.el);
  return null;
}

/**
 * Ramka z wartościami / wzorami. Renderuje się jako HTML poza rysunkiem, dzięki czemu tekst ma czytelny
 * rozmiar także na telefonie. Parametry x, y, w zostały dla zgodności – położeniem steruje CSS.
 */
export function InfoBox({ lines }: { x?: number; y?: number; w?: number; lines: { text: string; color?: string }[] }) {
  return useInfo(
    <div className="info-box">
      {lines
        .filter((l) => l.text)
        .map((l, i) => (
          <div key={i} style={l.color ? { color: l.color, fontWeight: 600 } : undefined}>
            {l.text}
          </div>
        ))}
    </div>,
  );
}

/** Dowolna treść HTML w ramce informacyjnej sceny (np. mini-wykres, skala). */
export function InfoPortal({ children }: { children: ReactNode }) {
  return useInfo(<div className="info-box">{children}</div>);
}

/** Mały wykres liniowy w SVG (do ramek informacyjnych). */
export function Sparkline({
  series,
  height = 70,
  min,
  max,
  title,
}: {
  series: { data: number[]; color: string; label?: string }[];
  height?: number;
  min?: number;
  max?: number;
  title?: string;
}) {
  const W = 260;
  const all = series.flatMap((s) => s.data);
  const lo = min ?? Math.min(...all, 0);
  const hi = max ?? Math.max(...all, 1);
  const span = hi - lo || 1;
  return (
    <div className="spark">
      <div className="spark-legend">
        {title && <span className="spark-title">{title}</span>}
        {series.map((s) => s.label && <span key={s.label} style={{ color: s.color }}>{s.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        {lo < 0 && hi > 0 && <line x1="0" x2={W} y1={height - ((0 - lo) / span) * height} y2={height - ((0 - lo) / span) * height} stroke="rgba(255,255,255,0.2)" />}
        {series.map((s) => (
          <polyline
            key={s.color}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            points={s.data.map((v, i) => `${(i / Math.max(1, s.data.length - 1)) * W},${height - ((v - lo) / span) * height}`).join(' ')}
          />
        ))}
      </svg>
    </div>
  );
}

export const fmt = (v: number, d = 2) => {
  const r = Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v;
  return r.toFixed(d).replace('.', ',').replace('-', '−');
};
