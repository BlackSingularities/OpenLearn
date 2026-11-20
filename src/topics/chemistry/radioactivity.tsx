import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { useAnimationClock } from '../../lib/useAnimationClock';
import { Board, C, Curve, Pt, Seg, VIEW, num, usePlot } from '../../lib/mathkit';

const SYM: Record<number, string> = { 81: 'Tl', 82: 'Pb', 83: 'Bi', 84: 'Po', 85: 'At', 86: 'Rn', 87: 'Fr', 88: 'Ra', 89: 'Ac', 90: 'Th', 91: 'Pa', 92: 'U', 6: 'C', 7: 'N', 5: 'B', 19: 'K', 18: 'Ar', 20: 'Ca', 27: 'Co', 28: 'Ni' };
const sup = (n: number) => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);

/* ---------- Krok 1: rodzaje promieniowania ---------- */
const DECAYS: Record<string, { name: string; color: string; Z: number; A: number; dZ: number; dA: number; particle: string; stop: number; note: string }> = {
  alfa: { name: 'rozpad α', color: '#f87171', Z: 92, A: 238, dZ: -2, dA: -4, particle: '⁴₂He', stop: 0, note: 'jądro helu: ciężkie, zatrzyma je kartka papieru' },
  beta: { name: 'rozpad β⁻', color: '#4fc3ff', Z: 6, A: 14, dZ: 1, dA: 0, particle: '⁰₋₁e', stop: 1, note: 'neutron → proton + elektron; zatrzyma je kilka mm aluminium' },
  betaplus: { name: 'rozpad β⁺', color: '#4ade80', Z: 19, A: 40, dZ: -1, dA: 0, particle: '⁰₊₁e', stop: 1, note: 'proton → neutron + pozyton (antycząstka elektronu)' },
  gamma: { name: 'promieniowanie γ', color: '#c084fc', Z: 27, A: 60, dZ: 0, dA: 0, particle: 'γ', stop: 2, note: 'foton o dużej energii: osłabia go dopiero gruba warstwa ołowiu lub betonu' },
};
function TypesScene({ params }: SceneProps) {
  const D = DECAYS[String(params.type)] ?? DECAYS.alfa;
  const t = useAnimationClock(true, 1);
  const Z2 = D.Z + D.dZ;
  const A2 = D.A + D.dA;
  const barriers = [
    { x: 420, w: 10, name: 'papier', color: '#f5f5f4' },
    { x: 560, w: 24, name: 'aluminium', color: '#94a3b8' },
    { x: 720, w: 54, name: 'ołów', color: '#475569' },
  ];
  const stopX = D.stop === 2 ? 900 : barriers[D.stop].x;
  return (
    <svg viewBox={VIEW}>
      {/* źródło */}
      <circle cx="140" cy="290" r="46" fill="#334155" />
      {Array.from({ length: 14 }, (_, i) => (
        <circle key={i} cx={140 + 20 * Math.cos(i * 2.4) * Math.sqrt(i / 14)} cy={290 + 20 * Math.sin(i * 2.4) * Math.sqrt(i / 14)} r="7" fill={i % 2 ? '#ef4444' : '#94a3b8'} />
      ))}
      {barriers.map((b) => (
        <g key={b.name}>
          <rect x={b.x} y="170" width={b.w} height="240" rx="3" fill={b.color} opacity="0.85" />
          <text x={b.x + b.w / 2} y="436" fill={C.text} fontFamily="Geist" fontSize="13" textAnchor="middle">
            {b.name}
          </text>
        </g>
      ))}
      {Array.from({ length: 7 }, (_, k) => {
        const y = 230 + k * 20;
        const travel = ((t * 260 + k * 90) % 760) + 190;
        const x = Math.min(travel, stopX - (D.stop === 2 ? 0 : 4));
        const blocked = travel >= stopX && D.stop !== 2;
        if (blocked && travel > stopX + 60) return null;
        return D.particle === 'γ' ? (
          <path key={k} d={`M${x - 26},${y} ${Array.from({ length: 8 }, (_, i) => `L${x - 26 + i * 4},${y + (i % 2 ? -5 : 5)}`).join(' ')}`} fill="none" stroke={D.color} strokeWidth="2.5" opacity={travel > 720 ? 0.45 : 1} />
        ) : (
          <circle key={k} cx={x} cy={y} r={D.name === 'rozpad α' ? 8 : 4.5} fill={D.color} opacity={blocked ? 0.4 : 1} />
        );
      })}
      <InfoBox
        lines={[
          { text: D.name, color: D.color },
          { text: `${sup(D.A)}${SYM[D.Z]} → ${sup(A2)}${SYM[Z2]} + ${D.particle}`, color: '#fff' },
          { text: `liczba masowa ${D.dA ? D.dA : 'bez zmian'}, liczba atomowa ${D.dZ > 0 ? '+1' : D.dZ < 0 ? D.dZ : 'bez zmian'}` },
          { text: D.note, color: C.third },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 2: szereg uranowo-radowy ---------- */
const CHAIN: [number, number, 'α' | 'β' | null, string][] = [
  [92, 238, 'α', '4,5 mld lat'],
  [90, 234, 'β', '24 dni'],
  [91, 234, 'β', '1,2 min'],
  [92, 234, 'α', '245 tys. lat'],
  [90, 230, 'α', '75 tys. lat'],
  [88, 226, 'α', '1600 lat'],
  [86, 222, 'α', '3,8 dnia'],
  [84, 218, 'α', '3,1 min'],
  [82, 214, 'β', '27 min'],
  [83, 214, 'β', '20 min'],
  [84, 214, 'α', '0,16 ms'],
  [82, 210, 'β', '22 lata'],
  [83, 210, 'β', '5 dni'],
  [84, 210, 'α', '138 dni'],
  [82, 206, null, 'trwały'],
];
function ChainScene({ params }: SceneProps) {
  const step = Math.min(CHAIN.length - 1, Number(params.step));
  const p = usePlot({ x: 70, y: 30, w: 790, h: 480, xMin: 122.5, xMax: 147.5, yMin: 80.5, yMax: 93.5 });
  const [Z, A, kind, half] = CHAIN[step];
  return (
    <Board p={p} axes={false}>
      {Array.from({ length: 26 }, (_, i) => 123 + i).map((N) => (
        <line key={N} x1={p.sx(N)} x2={p.sx(N)} y1={p.sy(93.5)} y2={p.sy(80.5)} stroke="rgba(255,255,255,0.05)" />
      ))}
      {Array.from({ length: 13 }, (_, i) => 81 + i).map((z) => (
        <g key={z}>
          <line x1={p.sx(122.5)} x2={p.sx(147.5)} y1={p.sy(z)} y2={p.sy(z)} stroke="rgba(255,255,255,0.05)" />
          <text x={p.sx(122.5) - 8} y={p.sy(z) + 4} fill={C.text} fontFamily="Geist" fontSize="11" textAnchor="end">
            {SYM[z] ?? z} {z}
          </text>
        </g>
      ))}
      {CHAIN.slice(0, step + 1).map(([z, a, k], i) => {
        const N = a - z;
        const next = CHAIN[i + 1];
        return (
          <g key={i}>
            {i < step && next && <Seg p={p} a={[N, z]} b={[next[1] - next[0], next[0]]} color={k === 'α' ? '#f87171' : '#4fc3ff'} width={3} arrow />}
            <rect x={p.sx(N) - 14} y={p.sy(z) - 14} width="28" height="28" rx="5" fill={i === step ? C.third : 'rgba(255,255,255,0.18)'} />
          </g>
        );
      })}
      <Pt p={p} x={A - Z} y={Z} color={C.third} r={4} />
      <text x={p.sx(135)} y={530} fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="middle">
        liczba neutronów N →
      </text>
      <InfoBox
        lines={[
          { text: `${sup(A)}${SYM[Z]} (Z = ${Z}, N = ${A - Z})`, color: C.third },
          { text: kind ? `następny krok: rozpad ${kind} (czas połowicznego rozpadu ${half})` : 'ołów-206 – izotop trwały, koniec szeregu', color: kind === 'α' ? '#f87171' : kind ? '#4fc3ff' : C.good },
          { text: 'α: dwa pola w lewo i w dół (−2 p, −2 n), β⁻: ukośnie (n → p)' },
          { text: `wykonano ${step} z 14 rozpadów: 8 × α i 6 × β` },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: datowanie radiowęglowe ---------- */
function CarbonScene({ params }: SceneProps) {
  const left = Number(params.left) / 100;
  const T = 5730;
  const age = T * Math.log2(1 / left);
  const p = usePlot({ x: 80, y: 30, w: 780, h: 470, xMin: 0, xMax: 40000, yMin: 0, yMax: 105 });
  return (
    <Board p={p} axes={false}>
      <Seg p={p} a={[0, 0]} b={[40000, 0]} color={C.axis} width={1.5} />
      <Seg p={p} a={[0, 0]} b={[0, 105]} color={C.axis} width={1.5} />
      {[1, 2, 3, 4, 5, 6].map((k) => (
        <g key={k}>
          <Seg p={p} a={[k * T, 0]} b={[k * T, 100 / 2 ** k]} color="rgba(255,255,255,0.15)" dash="4 5" />
          <text x={p.sx(k * T)} y={p.sy(0) + 18} fill={C.text} fontFamily="Geist" fontSize="11" textAnchor="middle">
            {(k * T).toLocaleString('pl-PL')}
          </text>
        </g>
      ))}
      {[25, 50, 75, 100].map((v) => (
        <text key={v} x={p.sx(0) - 8} y={p.sy(v) + 4} fill={C.text} fontFamily="Geist" fontSize="11" textAnchor="end">
          {v}%
        </text>
      ))}
      <Curve p={p} f={(t) => 100 * Math.pow(0.5, t / T)} color={C.good} width={4} from={0} to={40000} />
      {age <= 40000 && (
        <>
          <Seg p={p} a={[0, left * 100]} b={[age, left * 100]} color={C.third} dash="5 5" />
          <Seg p={p} a={[age, 0]} b={[age, left * 100]} color={C.third} dash="5 5" />
          <Pt p={p} x={age} y={left * 100} color={C.third} />
        </>
      )}
      <InfoBox
        lines={[
          { text: '¹⁴C → ¹⁴N + β⁻,  T½ = 5730 lat', color: C.good },
          { text: `zostało ${num(left * 100, 1)}% początkowego ¹⁴C` },
          { text: `wiek ≈ T½ · log₂(1 / ${num(left, 3)}) = ${Math.round(age).toLocaleString('pl-PL')} lat`, color: C.third },
          { text: 'metoda działa do ok. 50 tys. lat – potem ¹⁴C jest za mało' },
        ]}
      />
    </Board>
  );
}

export const radioactivity: Topic = {
  id: 'promieniotworczosc',
  title: 'Promieniotwórczość',
  subject: 'chemia',
  summary: 'Rozpady α, β i promieniowanie γ z ich przenikliwością, szereg uranowy krok po kroku na mapie nuklidów i datowanie radiowęglowe.',
  accent: '#22d3ee',
  glyph: '☢',
  steps: [
    {
      title: 'Rodzaje promieniowania',
      kind: '2d',
      scene: TypesScene,
      controls: [
        {
          type: 'select',
          key: 'type',
          label: 'Rozpad',
          default: 'alfa',
          options: [
            { value: 'alfa', label: 'α' },
            { value: 'beta', label: 'β⁻' },
            { value: 'betaplus', label: 'β⁺' },
            { value: 'gamma', label: 'γ' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Niestabilne jądra same przemieniają się w inne, wyrzucając cząstki. W każdym rozpadzie zachowana jest suma
            liczb masowych i suma ładunków – stąd zapis reakcji jądrowych.
          </p>
          <ul>
            <li>
              <strong>α</strong> – jądro helu: A maleje o 4, Z o 2,
            </li>
            <li>
              <strong>β⁻</strong> – neutron zmienia się w proton: Z rośnie o 1,
            </li>
            <li>
              <strong>γ</strong> – sam foton, jądro tylko pozbywa się nadmiaru energii.
            </li>
          </ul>
          <p>Im lżejsza i mniej naładowana cząstka, tym głębiej wnika w materię.</p>
        </>
      ),
    },
    {
      title: 'Szereg promieniotwórczy uranu',
      kind: '2d',
      scene: ChainScene,
      controls: [{ type: 'slider', key: 'step', label: 'Krok szeregu', min: 0, max: 14, step: 1, default: 3 }],
      body: (
        <>
          <p>
            Uran-238 nie zamienia się od razu w coś trwałego. Przechodzi przez <strong>14 rozpadów</strong> – raz α, raz β
            – aż do trwałego ołowiu-206. Na mapie nuklidów (protony w pionie, neutrony w poziomie) α to skok o dwa pola
            w lewo i w dół, β⁻ – ukos w górę.
          </p>
          <p>
            Po drodze powstaje radon-222 – gaz, który wydobywa się z gleby i jest główną przyczyną naturalnej dawki
            promieniowania. Czasy połowicznego rozpadu wahają się od ułamków milisekundy do miliardów lat.
          </p>
        </>
      ),
    },
    {
      title: 'Datowanie radiowęglowe',
      kind: '2d',
      scene: CarbonScene,
      controls: [{ type: 'slider', key: 'left', label: 'Pozostały ¹⁴C', min: 2, max: 100, step: 0.5, default: 30, unit: '%' }],
      body: (
        <>
          <div className="formula">N = N₀ · (½)^(t / T½)   →   t = T½ · log₂(N₀ / N)</div>
          <p>
            Żywe organizmy cały czas pobierają węgiel z otoczenia, więc mają w sobie stałą ilość ¹⁴C. Po śmierci wymiana
            ustaje, a ¹⁴C powoli się rozpada.
          </p>
          <p>
            Mierząc, ile <strong>pozostało</strong>, można policzyć, ile lat minęło. Połowa – 5730 lat, jedna czwarta –
            11 460 lat. Tak datuje się kości, drewno i tkaniny z wykopalisk.
          </p>
        </>
      ),
    },
  ],
};
