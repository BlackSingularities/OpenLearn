import { createContext, useContext, useEffect, useRef, useState } from 'react';

/** Globalna pauza sceny (przycisk w pasku stanu) – zatrzymuje wszystkie zegary animacji. */
export const PauseContext = createContext(false);

/**
 * Zegar animacji scen. Zwraca czas w sekundach, który płynie tylko gdy `playing` jest true
 * i scena nie jest wstrzymana w pasku stanu.
 */
export function useAnimationClock(playing: boolean, speed = 1): number {
  const [time, setTime] = useState(0);
  const last = useRef<number | null>(null);
  const paused = useContext(PauseContext);
  const run = playing && !paused;

  useEffect(() => {
    if (!run) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current !== null) {
        const dt = Math.min((now - last.current) / 1000, 0.1);
        setTime((t) => t + dt * speed);
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, speed]);

  return time;
}

export function formatNumber(v: number, decimals = 2): string {
  return v.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
