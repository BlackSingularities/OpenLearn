import { useEffect, useRef } from 'react';
import type { Control, SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { useCanvasLoop } from '../../lib/useCanvasLoop';

interface Charge {
  x: number; // 0..1 szerokości
  y: number; // 0..1 wysokości
  q: number;
}

function config(name: string): Charge[] {
  switch (name) {
    case 'minus':
      return [{ x: 0.5, y: 0.5, q: -1 }];
    case 'dipole':
      return [
        { x: 0.35, y: 0.5, q: 1 },
        { x: 0.65, y: 0.5, q: -1 },
      ];
    case 'twoplus':
      return [
        { x: 0.35, y: 0.5, q: 1 },
        { x: 0.65, y: 0.5, q: 1 },
      ];
    case 'unequal':
      return [
        { x: 0.38, y: 0.5, q: 2 },
        { x: 0.66, y: 0.5, q: -1 },
      ];
    case 'capacitor': {
      const out: Charge[] = [];
      for (let i = 0; i < 14; i++) {
        const y = 0.22 + (i / 13) * 0.56;
        out.push({ x: 0.36, y, q: 0.3 }, { x: 0.64, y, q: -0.3 });
      }
      return out;
    }
    default:
      return [{ x: 0.5, y: 0.5, q: 1 }];
  }
}

function fieldAt(ch: { x: number; y: number; q: number }[], x: number, y: number) {
  let ex = 0;
  let ey = 0;
  let v = 0;
  for (const c of ch) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r2 = dx * dx + dy * dy + 1e-3;
    const r = Math.sqrt(r2);
    ex += (c.q * dx) / (r2 * r);
    ey += (c.q * dy) / (r2 * r);
    v += c.q / r;
  }
  return { ex, ey, v };
}

function FieldScene({ params }: SceneProps) {
  const cfg = String(params.config ?? 'plus');
  const showPot = Boolean(params.potential);
  const showVec = Boolean(params.vectors);
  const showTest = Boolean(params.test);

  const state = useRef({
    cfg: '',
    charges: [] as Charge[],
    dirty: true,
    lines: [] as [number, number][][],
    pot: null as HTMLCanvasElement | null,
    w: 0,
    h: 0,
    drag: -1,
    test: null as null | { x: number; y: number; vx: number; vy: number; trail: [number, number][] },
  });
  if (state.current.cfg !== cfg) {
    state.current.cfg = cfg;
    state.current.charges = config(cfg);
    state.current.dirty = true;
    state.current.test = null;
  }

  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const st = state.current;
    if (st.w !== w || st.h !== h) {
      st.w = w;
      st.h = h;
      st.dirty = true;
    }
    // ładunki w pikselach; siła w jednostkach umownych (q / r² z r w pikselach × 10⁴)
    const K = 9000;
    const px = st.charges.map((c) => ({ x: c.x * w, y: c.y * h, q: c.q * K }));

    if (st.dirty) {
      st.dirty = false;
      // linie pola startują z ładunków dodatnich (albo ujemnych, gdy nie ma dodatnich)
      const anyPos = px.some((c) => c.q > 0);
      const sources = px.filter((c) => (anyPos ? c.q > 0 : c.q < 0));
      const dir = anyPos ? 1 : -1;
      const lines: [number, number][][] = [];
      for (const s of sources) {
        const n = Math.max(3, Math.round((Math.abs(s.q) / K) * 14));
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + 0.2;
          let x = s.x + Math.cos(a) * 12;
          let y = s.y + Math.sin(a) * 12;
          const line: [number, number][] = [[x, y]];
          for (let i = 0; i < 1500; i++) {
            const f = fieldAt(px, x, y);
            const m = Math.hypot(f.ex, f.ey);
            if (m < 1e-9) break;
            x += (dir * f.ex * 3) / m;
            y += (dir * f.ey * 3) / m;
            line.push([x, y]);
            if (x < -40 || y < -40 || x > w + 40 || y > h + 40) break;
            if (px.some((c) => Math.sign(c.q) !== dir && Math.hypot(c.x - x, c.y - y) < 10)) break;
          }
          lines.push(line);
        }
      }
      st.lines = lines;
      // mapa potencjału (niska rozdzielczość, potem skalowana)
      const cw = Math.max(1, Math.ceil(w / 5));
      const chh = Math.max(1, Math.ceil(h / 5));
      const off = st.pot ?? document.createElement('canvas');
      off.width = cw;
      off.height = chh;
      const octx = off.getContext('2d')!;
      const img = octx.createImageData(cw, chh);
      for (let j = 0; j < chh; j++) {
        for (let i = 0; i < cw; i++) {
          const { v } = fieldAt(px, i * 5, j * 5);
          const t = Math.tanh(v / (K * 0.012));
          const o = (j * cw + i) * 4;
          if (t > 0) {
            img.data[o] = 255;
            img.data[o + 1] = 90;
            img.data[o + 2] = 110;
          } else {
            img.data[o] = 70;
            img.data[o + 1] = 150;
            img.data[o + 2] = 255;
          }
          // linie ekwipotencjalne jako jaśniejsze pasma
          const band = Math.abs(Math.sin(v / (K * 0.004)));
          img.data[o + 3] = Math.min(255, Math.abs(t) * 120 + (band < 0.08 ? 70 : 0));
        }
      }
      octx.putImageData(img, 0, 0);
      st.pot = off;
    }

    if (showPot && st.pot) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(st.pot, 0, 0, w, h);
    }

    // linie pola
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    for (const line of st.lines) {
      ctx.beginPath();
      line.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      // grot w 1/3 długości
      const i = Math.floor(line.length / 3);
      if (line.length > 12) {
        const [x1, y1] = line[i];
        const [x2, y2] = line[i + 2];
        const a = Math.atan2(y2 - y1, x2 - x1);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - Math.cos(a - 0.45) * 9, y2 - Math.sin(a - 0.45) * 9);
        ctx.lineTo(x2 - Math.cos(a + 0.45) * 9, y2 - Math.sin(a + 0.45) * 9);
        ctx.closePath();
        ctx.fill();
      }
    }

    // siatka wektorów natężenia
    if (showVec) {
      const g = 38;
      for (let y = g / 2; y < h; y += g) {
        for (let x = g / 2; x < w; x += g) {
          const f = fieldAt(px, x, y);
          const m = Math.hypot(f.ex, f.ey);
          if (m < 1e-6) continue;
          const len = Math.min(16, 3 + Math.log10(1 + m * 50) * 7);
          const ux = f.ex / m;
          const uy = f.ey / m;
          const alpha = Math.min(1, 0.25 + Math.log10(1 + m * 50) * 0.35);
          ctx.strokeStyle = `rgba(255,209,102,${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x - ux * len * 0.5, y - uy * len * 0.5);
          ctx.lineTo(x + ux * len * 0.5, y + uy * len * 0.5);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,209,102,${alpha})`;
          ctx.beginPath();
          ctx.arc(x + ux * len * 0.5, y + uy * len * 0.5, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ładunek próbny (dodatni) porusza się zgodnie z polem
    if (showTest) {
      if (!st.test) {
        const s = px.find((c) => c.q > 0) ?? px[0];
        const a = Math.random() * Math.PI * 2;
        st.test = { x: s.x + Math.cos(a) * 26, y: s.y + Math.sin(a) * 26, vx: 0, vy: 0, trail: [] };
      }
      const tst = st.test;
      for (let i = 0; i < 4; i++) {
        const f = fieldAt(px, tst.x, tst.y);
        tst.vx += f.ex * 40 * (dt / 4);
        tst.vy += f.ey * 40 * (dt / 4);
        tst.vx *= 0.995;
        tst.vy *= 0.995;
        tst.x += tst.vx * (dt / 4);
        tst.y += tst.vy * (dt / 4);
      }
      tst.trail.push([tst.x, tst.y]);
      if (tst.trail.length > 120) tst.trail.shift();
      const hit = px.some((c) => c.q < 0 && Math.hypot(c.x - tst.x, c.y - tst.y) < 12);
      if (hit || tst.x < -20 || tst.y < -20 || tst.x > w + 20 || tst.y > h + 20) st.test = null;
      ctx.strokeStyle = 'rgba(74,222,128,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      tst.trail.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(tst.x, tst.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // ładunki
    for (const c of px) {
      const pos = c.q > 0;
      const r = Math.abs(c.q) / K < 0.5 ? 7 : 15 + Math.abs(c.q / K) * 3;
      const g = ctx.createRadialGradient(c.x - r / 3, c.y - r / 3, 1, c.x, c.y, r);
      g.addColorStop(0, pos ? '#ffc2cc' : '#bfe0ff');
      g.addColorStop(1, pos ? '#ef4444' : '#3b82f6');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (r > 10) {
        ctx.fillStyle = '#fff';
        ctx.font = '700 18px Geist, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(pos ? '+' : '−', c.x, c.y + 6);
        ctx.textAlign = 'left';
      }
    }
  });

  // przeciąganie ładunków
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const st = state.current;
    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r };
    };
    const down = (e: PointerEvent) => {
      const p = toLocal(e);
      let best = -1;
      let bd = 30;
      st.charges.forEach((c, i) => {
        const d = Math.hypot((c.x - p.x) * p.r.width, (c.y - p.y) * p.r.height);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0) {
        st.drag = best;
        canvas.setPointerCapture(e.pointerId);
      }
    };
    const move = (e: PointerEvent) => {
      if (st.drag < 0) return;
      const p = toLocal(e);
      const dx = Math.min(0.97, Math.max(0.03, p.x)) - st.charges[st.drag].x;
      const dy = Math.min(0.97, Math.max(0.03, p.y)) - st.charges[st.drag].y;
      // w kondensatorze przesuwamy całą okładkę
      const group = st.cfg === 'capacitor' ? st.charges.filter((c) => Math.sign(c.q) === Math.sign(st.charges[st.drag].q)) : [st.charges[st.drag]];
      group.forEach((c) => {
        c.x += dx;
        if (st.cfg !== 'capacitor') c.y += dy;
      });
      st.dirty = true;
    };
    const up = () => {
      st.drag = -1;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, [ref]);

  return (
    <>
      <canvas ref={ref} className="scene-canvas" style={{ cursor: 'grab' }} />
      <InfoBox
        lines={[
          { text: 'Przeciągnij ładunek, aby go przesunąć', color: '#ffd166' },
          ...(showPot ? [{ text: 'czerwone: V > 0 · niebieskie: V < 0' }] : []),
          ...(showTest ? [{ text: 'zielony: dodatni ładunek próbny', color: '#4ade80' }] : []),
        ]}
      />
    </>
  );
}

const toggles: Control[] = [
  { type: 'toggle', key: 'potential', label: 'Mapa potencjału', default: false },
  { type: 'toggle', key: 'vectors', label: 'Wektory natężenia', default: false },
  { type: 'toggle', key: 'test', label: 'Ładunek próbny', default: true },
];

export const efield: Topic = {
  id: 'pole-elektryczne',
  title: 'Pole elektryczne',
  subject: 'fizyka',
  summary: 'Linie pola, natężenie i potencjał wokół ładunków, które możesz przeciągać palcem lub myszą.',
  accent: '#eab308',
  glyph: '⚡',
  steps: [
    {
      title: 'Pole ładunku punktowego',
      kind: '2d',
      scene: FieldScene,
      controls: [
        { type: 'select', key: 'config', label: 'Ładunek', default: 'plus', options: [{ value: 'plus', label: 'dodatni' }, { value: 'minus', label: 'ujemny' }] },
        ...toggles,
      ],
      body: (
        <>
          <p>
            Wokół ładunku istnieje <strong>pole elektryczne</strong> – każdy inny ładunek odczuje w nim siłę. Linie pola
            pokazują kierunek siły działającej na <strong>dodatni</strong> ładunek próbny.
          </p>
          <p>
            Linie wychodzą z ładunków dodatnich i wchodzą do ujemnych. Ich zagęszczenie odpowiada natężeniu pola, które maleje
            z kwadratem odległości:
          </p>
          <div className="formula">E = k·q / r²</div>
          <p>Włącz wektory natężenia i porównaj ich długość blisko i daleko od ładunku.</p>
        </>
      ),
    },
    {
      title: 'Dwa ładunki: dipol i odpychanie',
      kind: '2d',
      scene: FieldScene,
      controls: [
        {
          type: 'select',
          key: 'config',
          label: 'Układ',
          default: 'dipole',
          options: [
            { value: 'dipole', label: '+ i −' },
            { value: 'twoplus', label: '+ i +' },
            { value: 'unequal', label: '+2 i −1' },
          ],
        },
        ...toggles,
      ],
      body: (
        <>
          <p>
            Pole kilku ładunków to <strong>suma wektorowa</strong> pól każdego z nich (zasada superpozycji).
          </p>
          <p>
            W <strong>dipolu</strong> (+ i −) linie łączą oba ładunki. Dla dwóch ładunków jednoimiennych linie „odpychają
            się” i między ładunkami powstaje punkt, w którym natężenie jest zerowe.
          </p>
          <p>
            Przeciągnij ładunki i obserwuj, jak zmienia się cały obraz. Mapa potencjału pokazuje „górki” (V &gt; 0) i
            „dołki” (V &lt; 0) – ładunek dodatni stacza się z górki do dołka.
          </p>
        </>
      ),
    },
    {
      title: 'Kondensator płaski – pole jednorodne',
      kind: '2d',
      scene: FieldScene,
      controls: [
        { type: 'toggle', key: 'potential', label: 'Mapa potencjału', default: true },
        { type: 'toggle', key: 'vectors', label: 'Wektory natężenia', default: true },
        { type: 'toggle', key: 'test', label: 'Ładunek próbny', default: true },
      ],
      preset: { config: 'capacitor' },
      body: (
        <>
          <p>
            Dwie równoległe, przeciwnie naładowane okładki tworzą <strong>kondensator płaski</strong>. Między nimi linie pola
            są równoległe i równo rozmieszczone – to <strong>pole jednorodne</strong>: wszędzie to samo natężenie.
          </p>
          <div className="formula">E = U / d</div>
          <p>
            Potencjał zmienia się liniowo od okładki do okładki. Przy krawędziach pole „wybrzusza się” na zewnątrz – to tak
            zwany efekt brzegowy.
          </p>
          <p>Przesuń okładkę: im mniejsza odległość d przy tym samym napięciu, tym silniejsze pole.</p>
        </>
      ),
    },
  ],
};
