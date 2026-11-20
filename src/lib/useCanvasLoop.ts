import { useEffect, useRef, useState } from 'react';

export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number, t: number) => void;

/**
 * Pętla animacji dla scen rysowanych na <canvas>. Dba o rozmiar (ResizeObserver),
 * ostrość na ekranach HiDPI i stały rytm requestAnimationFrame.
 * Funkcja rysująca może się zmieniać przy każdym renderze – pętla zawsze woła najnowszą.
 */
export function useCanvasLoop(draw: DrawFn) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      t += dt;
      if (w > 0 && h > 0) {
        ctx.clearRect(0, 0, w, h);
        drawRef.current(ctx, w, h, dt, t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return canvasRef;
}

/** Strzałka (wektor) na canvasie. */
export function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 2.5, head = 9) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return;
  const hh = Math.min(head, len * 0.5);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(a) * hh * 0.7, y2 - Math.sin(a) * hh * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a - 0.4) * hh, y2 - Math.sin(a - 0.4) * hh);
  ctx.lineTo(x2 - Math.cos(a + 0.4) * hh, y2 - Math.sin(a + 0.4) * hh);
  ctx.closePath();
  ctx.fill();
}

/** Prosty wykres przebiegu czasowego (przewijany) w prostokącie. */
export function timeSeries(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  series: { data: number[]; color: string; label?: string }[],
  range: number,
  title?: string,
) {
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  for (const s of series) {
    const n = s.data.length;
    if (n < 2) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    s.data.forEach((v, i) => {
      const px = x + (i / (n - 1)) * w;
      const py = y + h / 2 - (v / range) * (h / 2 - 6);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  ctx.font = '600 12px Geist, sans-serif';
  let lx = x + 10;
  if (title) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(title, lx, y + 16);
    lx += ctx.measureText(title).width + 14;
  }
  for (const s of series) {
    if (!s.label) continue;
    ctx.fillStyle = s.color;
    ctx.fillText(s.label, lx, y + 16);
    lx += ctx.measureText(s.label).width + 14;
  }
}

/** Wymusza przerysowanie komponentu co `ms` milisekund (do odświeżania liczb w ramce InfoBox). */
export function useTicker(ms = 150) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
