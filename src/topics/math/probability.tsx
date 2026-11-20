import { useEffect, useRef } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox, InfoPortal } from '../../lib/plot';
import { useCanvasLoop, useTicker } from '../../lib/useCanvasLoop';
import { C, VIEW, num } from '../../lib/mathkit';

/* ---------- Krok 1: prawo wielkich liczb ---------- */
const EXPERIMENTS: Record<string, { name: string; p: number; trial: () => boolean; label: string }> = {
  coin: { name: 'rzut monetą – orzeł', p: 0.5, trial: () => Math.random() < 0.5, label: '½' },
  six: { name: 'rzut kostką – szóstka', p: 1 / 6, trial: () => Math.floor(Math.random() * 6) === 5, label: '⅙' },
  seven: {
    name: 'dwie kostki – suma 7',
    p: 1 / 6,
    trial: () => Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + 2 === 7,
    label: '⅙',
  },
  double: { name: 'dwie monety – dwa orły', p: 0.25, trial: () => Math.random() < 0.5 && Math.random() < 0.5, label: '¼' },
};

function LawScene({ params }: SceneProps) {
  const exp = EXPERIMENTS[String(params.exp)] ?? EXPERIMENTS.coin;
  const speed = Number(params.speed);
  const st = useRef({ n: 0, hits: 0, hist: [] as number[], acc: 0, last: false });
  useEffect(() => {
    st.current = { n: 0, hits: 0, hist: [], acc: 0, last: false };
  }, [exp, params.run]);
  useTicker(150);
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    if (s.n < 5000) {
      s.acc += dt * speed;
      while (s.acc >= 1 && s.n < 5000) {
        s.acc -= 1;
        s.n++;
        s.last = exp.trial();
        if (s.last) s.hits++;
        s.hist.push(s.hits / s.n);
      }
    }
    const pad = 46;
    const gw = w - pad - 16;
    const gh = h - 70;
    const top = 24;
    const maxN = Math.max(50, s.n);
    const X = (i: number) => pad + (Math.log(i + 1) / Math.log(maxN + 1)) * gw;
    const Y = (v: number) => top + (1 - v) * gh;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.font = '12px Geist, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let v = 0; v <= 1.001; v += 0.25) {
      ctx.beginPath();
      ctx.moveTo(pad, Y(v));
      ctx.lineTo(pad + gw, Y(v));
      ctx.stroke();
      ctx.fillText(num(v), 8, Y(v) + 4);
    }
    [1, 10, 100, 1000, 5000].forEach((k) => {
      if (k > maxN) return;
      ctx.fillText(String(k), X(k - 1) - 6, top + gh + 18);
    });
    ctx.strokeStyle = C.good;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, Y(exp.p));
    ctx.lineTo(pad + gw, Y(exp.p));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = C.main;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    s.hist.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.stroke();
    if (s.n) {
      ctx.fillStyle = s.last ? C.good : C.main;
      ctx.beginPath();
      ctx.arc(X(s.n - 1), Y(s.hits / s.n), 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('liczba prób (skala logarytmiczna)', pad + gw / 2 - 90, h - 8);
  });
  const s = st.current;
  const freq = s.n ? s.hits / s.n : 0;
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div style={{ color: C.main, fontWeight: 600 }}>{exp.name}</div>
        <div>
          próby: {s.n} · sukcesy: {s.hits}
        </div>
        <div style={{ color: C.main }}>częstość: {num(freq, 4)}</div>
        <div style={{ color: C.good }}>
          prawdopodobieństwo: {exp.label} = {num(exp.p, 4)}
        </div>
        <div className="muted-line">odchylenie: {num(Math.abs(freq - exp.p), 4)}</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Krok 2: deska Galtona ---------- */
interface Ball {
  path: number[];
  t: number;
}
function GaltonScene({ params }: SceneProps) {
  const rows = Number(params.rows);
  const prob = Number(params.p);
  const rate = Number(params.rate);
  const st = useRef({ balls: [] as Ball[], bins: [] as number[], acc: 0, total: 0 });
  useEffect(() => {
    st.current = { balls: [], bins: Array(rows + 1).fill(0), acc: 0, total: 0 };
  }, [rows, prob]);
  useTicker(200);
  const ref = useCanvasLoop((ctx, w, h, dt) => {
    const s = st.current;
    if (s.bins.length !== rows + 1) s.bins = Array(rows + 1).fill(0);
    s.acc += dt * rate;
    while (s.acc >= 1) {
      s.acc -= 1;
      s.balls.push({ path: Array.from({ length: rows }, () => (Math.random() < prob ? 1 : 0)), t: 0 });
    }
    const boardH = h * 0.55;
    const dx = Math.min((w - 40) / (rows + 1), 46);
    const dy = boardH / (rows + 1);
    const cx = w / 2;
    const top = 26;
    // kołki
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i <= r; i++) {
        ctx.beginPath();
        ctx.arc(cx + (i - r / 2) * dx, top + (r + 1) * dy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // przegródki
    const binTop = top + (rows + 1) * dy + 6;
    const binBottom = h - 24;
    const maxCount = Math.max(5, ...s.bins);
    // rozkład dwumianowy (oczekiwany kształt)
    const binom: number[] = [];
    let c = 1;
    for (let k = 0; k <= rows; k++) {
      binom.push(c * Math.pow(prob, k) * Math.pow(1 - prob, rows - k));
      c = (c * (rows - k)) / (k + 1);
    }
    const expected = binom.map((b) => b * s.total);
    const scaleMax = Math.max(maxCount, ...expected);
    for (let k = 0; k <= rows; k++) {
      const x = cx + (k - rows / 2) * dx;
      const hh = (s.bins[k] / scaleMax) * (binBottom - binTop);
      ctx.fillStyle = 'rgba(79,195,255,0.75)';
      ctx.fillRect(x - dx * 0.4, binBottom - hh, dx * 0.8, hh);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(x - dx / 2, binTop);
      ctx.lineTo(x - dx / 2, binBottom);
      ctx.stroke();
    }
    ctx.strokeStyle = C.main;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    expected.forEach((e, k) => {
      const x = cx + (k - rows / 2) * dx;
      const y = binBottom - (e / scaleMax) * (binBottom - binTop);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
    // kulki
    const speed = 2.6;
    s.balls = s.balls.filter((b) => {
      b.t += dt * speed;
      const step = Math.floor(b.t);
      if (step >= rows + 1) {
        s.bins[b.path.reduce((a, v) => a + v, 0)]++;
        s.total++;
        return false;
      }
      const frac = b.t - step;
      const before = b.path.slice(0, step).reduce((a, v) => a + v, 0);
      const x0 = cx + (before - step / 2) * dx;
      const next = step < rows ? before + b.path[step] : before;
      const x1 = step < rows ? cx + (next - (step + 1) / 2) * dx : x0;
      const x = x0 + (x1 - x0) * frac;
      const y = top + (step + frac) * dy + Math.sin(frac * Math.PI) * -6;
      ctx.fillStyle = C.third;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
  });
  const s = st.current;
  const mean = s.total ? s.bins.reduce((a, v, k) => a + v * k, 0) / s.total : 0;
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div>
          kulki w przegródkach: {s.total} · rzędy kołków n = {rows}
        </div>
        <div style={{ color: C.second }}>średnio w prawo: {num(mean)} razy</div>
        <div style={{ color: C.main }}>teoria: n · p = {num(rows * prob)}</div>
        <div className="muted-line">różowa linia – rozkład dwumianowy B(n, p)</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Krok 3: schemat Bernoulliego ---------- */
function binom(n: number, k: number) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
function BernoulliScene({ params }: SceneProps) {
  const n = Number(params.n);
  const p = Number(params.p);
  const k = Math.min(n, Number(params.k));
  const mode = String(params.mode);
  const probs = Array.from({ length: n + 1 }, (_, i) => binom(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i));
  const inSet = (i: number) => (mode === 'eq' ? i === k : mode === 'ge' ? i >= k : i <= k);
  const total = probs.reduce((a, v, i) => a + (inSet(i) ? v : 0), 0);
  const max = Math.max(...probs);
  const X0 = 60;
  const W = 800;
  const B = 500;
  const H = 440;
  const bw = W / (n + 1);
  return (
    <svg viewBox={VIEW}>
      <line x1={X0} x2={X0 + W} y1={B} y2={B} stroke={C.axis} strokeWidth="1.5" />
      {probs.map((v, i) => {
        const hh = (v / max) * H;
        return (
          <g key={i}>
            <rect x={X0 + i * bw + bw * 0.12} y={B - hh} width={bw * 0.76} height={hh} rx="3" fill={inSet(i) ? C.main : 'rgba(255,255,255,0.18)'} />
            {(n <= 20 || i % 5 === 0) && (
              <text x={X0 + i * bw + bw / 2} y={B + 18} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="middle">
                {i}
              </text>
            )}
          </g>
        );
      })}
      <line x1={X0 + (n * p + 0.5) * bw} x2={X0 + (n * p + 0.5) * bw} y1={B - H - 10} y2={B} stroke={C.good} strokeWidth="2" strokeDasharray="5 5" />
      <InfoBox
        lines={[
          { text: `P(X = k) = C(n, k) · pᵏ · (1 − p)ⁿ⁻ᵏ` },
          { text: `n = ${n}, p = ${num(p)}`, color: 'rgba(255,255,255,0.7)' },
          { text: `P(X ${mode === 'eq' ? '=' : mode === 'ge' ? '≥' : '≤'} ${k}) = ${num(total, 4)}`, color: C.main },
          { text: `wartość oczekiwana E = n·p = ${num(n * p)}`, color: C.good },
        ]}
      />
    </svg>
  );
}

export const probability: Topic = {
  id: 'prawdopodobienstwo',
  title: 'Prawdopodobieństwo',
  subject: 'matematyka',
  summary: 'Prawo wielkich liczb na tysiącach rzutów, deska Galtona, z której wyrasta krzywa dzwonowa, i schemat Bernoulliego.',
  accent: '#ff5a7a',
  glyph: '⚄',
  steps: [
    {
      title: 'Prawo wielkich liczb',
      kind: '2d',
      scene: LawScene,
      controls: [
        {
          type: 'select',
          key: 'exp',
          label: 'Doświadczenie',
          default: 'coin',
          options: [
            { value: 'coin', label: 'moneta' },
            { value: 'six', label: 'szóstka' },
            { value: 'seven', label: 'suma 7' },
            { value: 'double', label: 'dwa orły' },
          ],
        },
        { type: 'slider', key: 'speed', label: 'Prób na sekundę', min: 2, max: 400, step: 2, default: 40 },
        { type: 'toggle', key: 'run', label: 'Nowa seria (przełącz)', default: false },
      ],
      body: (
        <>
          <p>
            Prawdopodobieństwo nie mówi, co wypadnie w następnym rzucie. Mówi, jak zachowa się{' '}
            <strong>częstość w długiej serii</strong>.
          </p>
          <p>
            Na początku różowa linia skacze dziko – po 10 rzutach monetą 7 orłów to nic dziwnego. Im więcej prób, tym
            bliżej zielonej linii: to <strong>prawo wielkich liczb</strong>. Oś prób ma skalę logarytmiczną, żeby było
            widać i początek, i tysiące rzutów.
          </p>
          <p>Suma 7 na dwóch kostkach ma szansę ⅙: sprzyja jej 6 z 36 jednakowo możliwych par.</p>
        </>
      ),
    },
    {
      title: 'Deska Galtona',
      kind: '2d',
      scene: GaltonScene,
      controls: [
        { type: 'slider', key: 'rows', label: 'Rzędy kołków n', min: 4, max: 14, step: 1, default: 10 },
        { type: 'slider', key: 'p', label: 'Szansa skrętu w prawo p', min: 0.1, max: 0.9, step: 0.05, default: 0.5, decimals: 2 },
        { type: 'slider', key: 'rate', label: 'Kulek na sekundę', min: 2, max: 40, step: 1, default: 14 },
      ],
      body: (
        <>
          <p>
            Każda kulka na każdym kołku skręca w lewo albo w prawo. Przegródka, do której wpadnie, zależy tylko od{' '}
            <strong>liczby skrętów w prawo</strong>.
          </p>
          <p>
            Do skrajnych przegródek prowadzi jedna droga, do środkowych – bardzo wiele (to współczynniki Newtona z
            trójkąta Pascala). Dlatego kulki układają się w <strong>dzwon</strong>: rozkład dwumianowy, który przy dużym n
            przypomina rozkład normalny.
          </p>
        </>
      ),
    },
    {
      title: 'Schemat Bernoulliego',
      kind: '2d',
      scene: BernoulliScene,
      controls: [
        { type: 'slider', key: 'n', label: 'Liczba prób n', min: 1, max: 40, step: 1, default: 10 },
        { type: 'slider', key: 'p', label: 'Prawdopodobieństwo sukcesu p', min: 0.05, max: 0.95, step: 0.01, default: 0.3, decimals: 2 },
        {
          type: 'select',
          key: 'mode',
          label: 'Zdarzenie',
          default: 'ge',
          options: [
            { value: 'eq', label: 'X = k' },
            { value: 'ge', label: 'X ≥ k' },
            { value: 'le', label: 'X ≤ k' },
          ],
        },
        { type: 'slider', key: 'k', label: 'k', min: 0, max: 40, step: 1, default: 4 },
      ],
      body: (
        <>
          <div className="formula">P(X = k) = (n po k) · pᵏ · (1 − p)ⁿ⁻ᵏ</div>
          <p>
            n niezależnych prób, w każdej sukces z prawdopodobieństwem p. Pytamy o szansę dokładnie k sukcesów.
          </p>
          <p>
            Czynnik pᵏ(1 − p)ⁿ⁻ᵏ to szansa jednego konkretnego układu, a (n po k) liczy, ile jest takich układów. Słupki
            skupiają się wokół <strong>n · p</strong> (zielona linia). „Co najmniej k” to suma kilku słupków – czasem
            łatwiej policzyć zdarzenie przeciwne.
          </p>
        </>
      ),
    },
  ],
};
