import { useMemo } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { Board, C, Curve, Pt, Seg, VIEW, num, usePlot } from '../../lib/mathkit';

// rozpuszczalność [g / 100 g wody] co 10 °C (0–100 °C)
const SOL: Record<string, { name: string; f: string; color: string; data: number[] }> = {
  kno3: { name: 'azotan(V) potasu', f: 'KNO₃', color: '#f472b6', data: [13, 21, 32, 46, 64, 85, 110, 138, 169, 202, 246] },
  nacl: { name: 'chlorek sodu', f: 'NaCl', color: '#e5e7eb', data: [35.7, 35.8, 36, 36.3, 36.6, 37, 37.3, 37.8, 38.4, 39, 39.8] },
  nh4cl: { name: 'chlorek amonu', f: 'NH₄Cl', color: '#a3e635', data: [29.4, 33.3, 37.2, 41.4, 45.8, 50.4, 55.2, 60.2, 65.6, 71.3, 77.3] },
  cuso4: { name: 'siarczan(VI) miedzi(II)', f: 'CuSO₄', color: '#38bdf8', data: [14.3, 17.4, 20.7, 25, 28.5, 33.3, 40, 47, 55, 64, 75.4] },
};
const solAt = (key: string, T: number) => {
  const d = SOL[key].data;
  const i = Math.min(9, Math.floor(T / 10));
  const f = (T - i * 10) / 10;
  return d[i] + (d[i + 1] - d[i]) * f;
};

/** Zlewka z cząstkami substancji rozpuszczonej i ewentualnym osadem. */
function Beaker({ x, y, w, h, fill, dissolved, sediment, color, liquid = 0.8 }: { x: number; y: number; w: number; h: number; fill: number; dissolved: number; sediment: number; color: string; liquid?: number }) {
  const pts = useMemo(() => {
    let s = 3;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    return Array.from({ length: 160 }, () => [rnd(), rnd()] as [number, number]);
  }, []);
  const top = y + h * (1 - liquid);
  return (
    <g>
      <rect x={x} y={top} width={w} height={y + h - top} fill={color} opacity={0.08 + fill * 0.35} />
      {pts.slice(0, dissolved).map(([u, v], i) => (
        <circle key={i} cx={x + 10 + u * (w - 20)} cy={top + 10 + v * (y + h - top - 20 - Math.min(40, sediment / 3))} r="3.5" fill={color} />
      ))}
      {sediment > 0 && (
        <path
          d={`M${x + 4},${y + h - 2} Q${x + w / 2},${y + h - 2 - Math.min(60, 8 + sediment / 2)} ${x + w - 4},${y + h - 2} Z`}
          fill={color}
          opacity="0.9"
        />
      )}
      <path d={`M${x - 6},${y - 10} L${x},${y} L${x},${y + h} Q${x},${y + h + 6} ${x + 6},${y + h + 6} L${x + w - 6},${y + h + 6} Q${x + w},${y + h + 6} ${x + w},${y + h} L${x + w},${y} L${x + w + 6},${y - 10}`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" />
    </g>
  );
}

/* ---------- Krok 1: stężenie procentowe ---------- */
function PercentScene({ params }: SceneProps) {
  const key = String(params.s);
  const S = SOL[key] ?? SOL.nacl;
  const ms = Number(params.ms);
  const mw = Number(params.mw);
  const maxDiss = (solAt(key, 20) * mw) / 100;
  const diss = Math.min(ms, maxDiss);
  const sed = ms - diss;
  const cp = (diss / (diss + mw)) * 100;
  const sat = ms >= maxDiss - 1e-9;
  return (
    <svg viewBox={VIEW}>
      <Beaker x={320} y={120} w={260} h={360} fill={diss / Math.max(1, maxDiss)} dissolved={Math.round((diss / 120) * 160)} sediment={sed} color={S.color} liquid={0.35 + Math.min(0.6, mw / 500)} />
      <text x="450" y="520" fill={C.text} fontFamily="Geist" fontSize="14" textAnchor="middle">
        {num(mw, 0)} g wody + {num(ms, 0)} g {S.f}, 20 °C
      </text>
      <InfoBox
        lines={[
          { text: 'Cp = mₛ / mᵣ · 100%,  mᵣ = mₛ + m_wody', color: '#fff' },
          { text: `rozpuściło się ${num(diss, 1)} g, Cp = ${num(cp, 1)}%`, color: C.main },
          { text: sat ? `roztwór nasycony – nadmiar ${num(sed, 1)} g opada na dno` : `można jeszcze rozpuścić ${num(maxDiss - ms, 1)} g`, color: sat ? C.third : C.good },
          { text: `rozpuszczalność w 20 °C: ${num(solAt(key, 20), 1)} g / 100 g wody` },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 2: krzywe rozpuszczalności ---------- */
function CurveScene({ params }: SceneProps) {
  const key = String(params.s);
  const S = SOL[key] ?? SOL.kno3;
  const T = Number(params.T);
  const m = Number(params.m);
  const p = usePlot({ x: 70, y: 25, w: 788, h: 480, xMin: 0, xMax: 100, yMin: 0, yMax: 260 });
  const s = solAt(key, T);
  const state = m < s - 0.5 ? 'nienasycony' : m <= s + 0.5 ? 'nasycony' : 'przesycony – wydziela się osad';
  return (
    <Board p={p} axes={false}>
      {[0, 20, 40, 60, 80, 100].map((t) => (
        <g key={t}>
          <Seg p={p} a={[t, 0]} b={[t, 260]} color="rgba(255,255,255,0.06)" />
          <text x={p.sx(t)} y={p.sy(0) + 18} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="middle">
            {t} °C
          </text>
        </g>
      ))}
      {[0, 50, 100, 150, 200, 250].map((v) => (
        <g key={v}>
          <Seg p={p} a={[0, v]} b={[100, v]} color="rgba(255,255,255,0.06)" />
          <text x={p.sx(0) - 8} y={p.sy(v) + 4} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {Object.entries(SOL).map(([k, v]) => (
        <Curve key={k} p={p} f={(t) => solAt(k, Math.max(0, Math.min(100, t)))} from={0} to={100} color={v.color} width={k === key ? 4.5 : 1.8} opacity={k === key ? 1 : 0.45} />
      ))}
      <Seg p={p} a={[T, 0]} b={[T, s]} color={C.third} dash="5 5" />
      <Pt p={p} x={T} y={m} color={m <= s + 0.5 ? C.good : C.bad} r={7} />
      <InfoBox
        lines={[
          { text: `${S.name} (${S.f})`, color: S.color },
          { text: `w ${T} °C rozpuszcza się ${num(s, 1)} g / 100 g wody`, color: C.third },
          { text: `${num(m, 0)} g na 100 g wody → roztwór ${state}`, color: m <= s + 0.5 ? C.good : C.bad },
          { text: m > s + 0.5 ? `nadmiar: ${num(m - s, 1)} g` : '' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: stężenie molowe i rozcieńczanie ---------- */
function DilutionScene({ params }: SceneProps) {
  const n = Number(params.n);
  const V0 = 0.25;
  const add = Number(params.add) / 1000;
  const V = V0 + add;
  const c = n / V;
  const c0 = n / V0;
  return (
    <svg viewBox={VIEW}>
      <Beaker x={140} y={150} w={220} h={330} fill={Math.min(1, c0 / 2)} dissolved={Math.round(n * 120)} sediment={0} color="#38bdf8" liquid={0.4} />
      <Beaker x={540} y={150} w={220} h={330} fill={Math.min(1, c / 2)} dissolved={Math.round(n * 120)} sediment={0} color="#38bdf8" liquid={0.4 * (V / V0) > 0.95 ? 0.95 : 0.4 * (V / V0)} />
      <text x="250" y="520" fill={C.text} fontFamily="Geist" fontSize="14" textAnchor="middle">
        przed: {num(V0 * 1000, 0)} cm³
      </text>
      <text x="650" y="520" fill={C.text} fontFamily="Geist" fontSize="14" textAnchor="middle">
        po dolaniu wody: {num(V * 1000, 0)} cm³
      </text>
      <text x="450" y="320" fill={C.third} fontFamily="Geist" fontSize="40" textAnchor="middle">
        →
      </text>
      <InfoBox
        lines={[
          { text: 'cₘ = n / V', color: '#fff' },
          { text: `przed: ${num(n, 3)} mol / ${num(V0, 3)} dm³ = ${num(c0, 3)} mol/dm³` },
          { text: `po: ${num(n, 3)} mol / ${num(V, 3)} dm³ = ${num(c, 3)} mol/dm³`, color: C.second },
          { text: 'liczba moli się nie zmienia: c₁V₁ = c₂V₂', color: C.third },
        ]}
      />
    </svg>
  );
}

export const solutions: Topic = {
  id: 'roztwory',
  title: 'Roztwory i rozpuszczalność',
  subject: 'chemia',
  summary: 'Stężenie procentowe i roztwór nasycony z osadem na dnie, krzywe rozpuszczalności czterech soli i rozcieńczanie roztworu.',
  accent: '#38bdf8',
  glyph: '⚗',
  steps: [
    {
      title: 'Stężenie procentowe',
      kind: '2d',
      scene: PercentScene,
      controls: [
        {
          type: 'select',
          key: 's',
          label: 'Substancja',
          default: 'nacl',
          options: Object.entries(SOL).map(([value, s]) => ({ value, label: s.f })),
        },
        { type: 'slider', key: 'ms', label: 'Masa substancji', min: 0, max: 120, step: 1, default: 25, unit: 'g' },
        { type: 'slider', key: 'mw', label: 'Masa wody', min: 50, max: 300, step: 5, default: 100, unit: 'g' },
      ],
      body: (
        <>
          <div className="formula">Cp = mₛ / (mₛ + m_wody) · 100%</div>
          <p>
            Stężenie procentowe mówi, ile gramów substancji jest w 100 g <strong>roztworu</strong> – nie wody! 25 g soli w
            100 g wody to roztwór 20-procentowy.
          </p>
          <p>
            Woda nie rozpuści dowolnej ilości substancji. Gdy przekroczysz <strong>rozpuszczalność</strong>, roztwór
            staje się nasycony, a nadmiar zostaje na dnie jako osad – stężenie już nie rośnie.
          </p>
        </>
      ),
    },
    {
      title: 'Krzywe rozpuszczalności',
      kind: '2d',
      scene: CurveScene,
      controls: [
        {
          type: 'select',
          key: 's',
          label: 'Substancja',
          default: 'kno3',
          options: Object.entries(SOL).map(([value, s]) => ({ value, label: s.f })),
        },
        { type: 'slider', key: 'T', label: 'Temperatura', min: 0, max: 100, step: 1, default: 40, unit: '°C' },
        { type: 'slider', key: 'm', label: 'Masa substancji na 100 g wody', min: 0, max: 250, step: 1, default: 80, unit: 'g' },
      ],
      body: (
        <>
          <p>
            Rozpuszczalność większości ciał stałych <strong>rośnie z temperaturą</strong>, ale bardzo różnie: KNO₃
            rozpuszcza się w gorącej wodzie kilkanaście razy lepiej niż w zimnej, a NaCl prawie wcale tego nie odczuwa.
          </p>
          <p>
            Punkt pod krzywą to roztwór nienasycony, na krzywej – nasycony, nad nią – osad. Ustaw 80 g KNO₃ w 60 °C, a
            potem schłodź do 20 °C: wykrystalizuje prawie 50 g soli. Na tym polega oczyszczanie przez krystalizację.
          </p>
        </>
      ),
    },
    {
      title: 'Stężenie molowe i rozcieńczanie',
      kind: '2d',
      scene: DilutionScene,
      controls: [
        { type: 'slider', key: 'n', label: 'Liczba moli substancji', min: 0.05, max: 1, step: 0.01, default: 0.5 },
        { type: 'slider', key: 'add', label: 'Dolana woda', min: 0, max: 400, step: 5, default: 250, unit: 'cm³' },
      ],
      body: (
        <>
          <div className="formula">cₘ = n / V      c₁ · V₁ = c₂ · V₂</div>
          <p>
            <strong>Stężenie molowe</strong> to liczba moli w 1 dm³ roztworu. Dolewając wodę, nie zmieniamy liczby
            cząstek – rozkładają się tylko w większej objętości, więc kolor blednie, a stężenie maleje.
          </p>
          <p>Dwa razy większa objętość to dwa razy mniejsze stężenie.</p>
        </>
      ),
    },
  ],
};
