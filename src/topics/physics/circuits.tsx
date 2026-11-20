import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { useAnimationClock } from '../../lib/useAnimationClock';
import { C, VIEW, num } from '../../lib/mathkit';

type P = [number, number];

/** Punkt na łamanej w odległości d od początku (łamana zamknięta, jeśli closed). */
function along(pts: P[], d: number, closed = true): P {
  const segs: [P, P, number][] = [];
  const list = closed ? [...pts, pts[0]] : pts;
  let total = 0;
  for (let i = 0; i < list.length - 1; i++) {
    const len = Math.hypot(list[i + 1][0] - list[i][0], list[i + 1][1] - list[i][1]);
    segs.push([list[i], list[i + 1], len]);
    total += len;
  }
  let r = ((d % total) + total) % total;
  for (const [a, b, len] of segs) {
    if (r <= len) return [a[0] + ((b[0] - a[0]) * r) / len, a[1] + ((b[1] - a[1]) * r) / len];
    r -= len;
  }
  return list[0];
}
const length = (pts: P[], closed = true) => {
  const list = closed ? [...pts, pts[0]] : pts;
  let t = 0;
  for (let i = 0; i < list.length - 1; i++) t += Math.hypot(list[i + 1][0] - list[i][0], list[i + 1][1] - list[i][1]);
  return t;
};

function Electrons({ path, offset, count, closed = true, color = '#4fc3ff' }: { path: P[]; offset: number; count: number; closed?: boolean; color?: string }) {
  const L = length(path, closed);
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const [x, y] = along(path, offset + (i * L) / count, closed);
        return <circle key={i} cx={x} cy={y} r="4.5" fill={color} />;
      })}
    </g>
  );
}

function Battery({ x, y, U }: { x: number; y: number; U: number }) {
  return (
    <g>
      <rect x={x - 26} y={y - 34} width="52" height="68" fill="#0b0d12" />
      <line x1={x - 22} x2={x + 22} y1={y - 8} y2={y - 8} stroke="#fff" strokeWidth="4" />
      <line x1={x - 12} x2={x + 12} y1={y + 8} y2={y + 8} stroke="#fff" strokeWidth="8" />
      <text x={x + 34} y={y + 5} fill={C.third} fontFamily="Geist" fontSize="16" fontWeight="700">
        {num(U, 1)} V
      </text>
      <text x={x - 34} y={y - 2} fill="#fff" fontFamily="Geist" fontSize="15" textAnchor="end">
        +
      </text>
    </g>
  );
}

function Resistor({ x, y, R, vertical = false, label }: { x: number; y: number; R: number; vertical?: boolean; label?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${vertical ? 90 : 0})`}>
      <rect x="-40" y="-14" width="80" height="28" rx="4" fill="#1b2030" stroke={C.main} strokeWidth="3" />
      <text x="0" y="5" fill={C.main} fontFamily="Geist" fontSize="14" fontWeight="700" textAnchor="middle" transform={vertical ? 'rotate(-90)' : undefined}>
        {label ?? `${num(R, 0)} Ω`}
      </text>
    </g>
  );
}

function Bulb({ x, y, power }: { x: number; y: number; power: number }) {
  const glow = Math.min(1, power / 20);
  return (
    <g>
      <circle cx={x} cy={y} r={30 + glow * 40} fill="#ffd166" opacity={glow * 0.25} />
      <circle cx={x} cy={y} r="24" fill={`rgba(255,209,102,${0.15 + glow * 0.85})`} stroke="#fff" strokeWidth="2.5" />
      <path d={`M${x - 10},${y + 4} q5,-14 10,0 q5,14 10,0`} fill="none" stroke="#0b0d12" strokeWidth="2" />
    </g>
  );
}

/* ---------- Krok 1: prawo Ohma ---------- */
function OhmScene({ params }: SceneProps) {
  const U = Number(params.U);
  const R = Number(params.R);
  const I = U / R;
  const t = useAnimationClock(true, 1);
  const loop: P[] = [
    [120, 120],
    [520, 120],
    [520, 420],
    [120, 420],
  ];
  // elektrony płyną od „−” do „+” (przeciwnie do umownego kierunku prądu)
  const offset = -t * I * 180;
  const PW = U * I;
  // wykres I(U)
  const gx = 610;
  const gy = 120;
  const gw = 250;
  const gh = 300;
  const X = (u: number) => gx + (u / 24) * gw;
  const Y = (i: number) => gy + gh - (i / 2.4) * gh;
  return (
    <svg viewBox={VIEW}>
      <polyline points={[...loop, loop[0]].map((p) => p.join(',')).join(' ')} fill="none" stroke="#64748b" strokeWidth="5" strokeLinejoin="round" />
      <Electrons path={loop} offset={offset} count={22} />
      <Battery x={120} y={270} U={U} />
      <Resistor x={320} y={120} R={R} />
      <Bulb x={520} y={270} power={PW} />
      <path d="M400,96 h60" stroke={C.third} strokeWidth="3" markerEnd="url(#ohm-arr)" />
      <defs>
        <marker id="ohm-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={C.third} />
        </marker>
      </defs>
      <text x="400" y="84" fill={C.third} fontFamily="Geist" fontSize="13">
        umowny kierunek prądu
      </text>
      <rect x={gx} y={gy} width={gw} height={gh} fill="rgba(255,255,255,0.03)" rx="8" />
      <line x1={X(0)} y1={Y(0)} x2={X(24)} y2={Y(Math.min(2.4, 24 / R))} stroke={C.main} strokeWidth="3" />
      <circle cx={X(U)} cy={Y(I)} r="7" fill={C.third} />
      <text x={gx + gw / 2} y={gy + gh + 24} fill={C.text} fontFamily="Geist" fontSize="13" textAnchor="middle">
        U [V] →
      </text>
      <text x={gx - 8} y={gy + 12} fill={C.text} fontFamily="Geist" fontSize="13" textAnchor="end">
        I
      </text>
      <InfoBox
        lines={[
          { text: `I = U / R = ${num(U, 1)} V / ${num(R, 0)} Ω = ${num(I, 3)} A`, color: C.second },
          { text: `moc P = U·I = ${num(PW, 2)} W`, color: C.third },
          { text: 'wykres I(U) to prosta – nachylenie 1/R', color: C.main },
          { text: 'niebieskie kropki – elektrony (płyną od − do +)' },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 2: połączenia szeregowe i równoległe ---------- */
function NetworkScene({ params }: SceneProps) {
  const U = Number(params.U);
  const R1 = Number(params.R1);
  const R2 = Number(params.R2);
  const par = String(params.mode) === 'par';
  const t = useAnimationClock(true, 1);
  const Rz = par ? (R1 * R2) / (R1 + R2) : R1 + R2;
  const I = U / Rz;
  const I1 = par ? U / R1 : I;
  const I2 = par ? U / R2 : I;
  const U1 = par ? U : I * R1;
  const U2 = par ? U : I * R2;
  const k = 160;
  return (
    <svg viewBox={VIEW}>
      {!par ? (
        <>
          <polyline points="140,110 760,110 760,450 140,450 140,110" fill="none" stroke="#64748b" strokeWidth="5" strokeLinejoin="round" />
          <Electrons path={[[140, 110], [760, 110], [760, 450], [140, 450]]} offset={-t * I * k} count={26} />
          <Resistor x={360} y={110} R={R1} label={`R₁ = ${num(R1, 0)} Ω`} />
          <Resistor x={600} y={110} R={R2} label={`R₂ = ${num(R2, 0)} Ω`} />
          <Bulb x={360} y={60} power={I * I * R1} />
          <Bulb x={600} y={60} power={I * I * R2} />
          <Battery x={140} y={280} U={U} />
        </>
      ) : (
        <>
          <polyline points="140,450 140,110 400,110" fill="none" stroke="#64748b" strokeWidth="5" />
          <polyline points="140,450 400,450" fill="none" stroke="#64748b" strokeWidth="5" />
          <polyline points="400,110 760,110 760,450 400,450 400,110" fill="none" stroke="#64748b" strokeWidth="5" />
          <polyline points="400,280 760,280" fill="none" stroke="#64748b" strokeWidth="5" />
          <line x1="400" y1="110" x2="400" y2="450" stroke="#64748b" strokeWidth="5" />
          <Electrons path={[[140, 450], [140, 110], [400, 110]]} offset={-t * I * k} count={10} closed={false} />
          <Electrons path={[[400, 450], [140, 450]]} offset={-t * I * k} count={5} closed={false} />
          <Electrons path={[[400, 110], [760, 110], [760, 280], [400, 280]].reverse() as P[]} offset={t * I1 * k} count={14} closed={false} color={C.second} />
          <Electrons path={[[400, 280], [760, 280], [760, 450], [400, 450]].reverse() as P[]} offset={t * I2 * k} count={14} closed={false} color="#93c5fd" />
          <Resistor x={580} y={110} R={R1} label={`R₁ = ${num(R1, 0)} Ω`} />
          <Resistor x={580} y={280} R={R2} label={`R₂ = ${num(R2, 0)} Ω`} />
          <Bulb x={580} y={60} power={U1 * I1} />
          <Bulb x={580} y={360} power={U2 * I2} />
          <Battery x={140} y={280} U={U} />
        </>
      )}
      <InfoBox
        lines={[
          { text: par ? `1/Rz = 1/R₁ + 1/R₂ → Rz = ${num(Rz, 1)} Ω` : `Rz = R₁ + R₂ = ${num(Rz, 0)} Ω`, color: C.main },
          { text: `prąd z baterii I = ${num(I, 3)} A`, color: C.second },
          { text: par ? `I₁ = ${num(I1, 3)} A, I₂ = ${num(I2, 3)} A (I = I₁ + I₂)` : `ten sam prąd płynie przez R₁ i R₂`, color: C.second },
          { text: par ? `napięcie na obu opornikach: ${num(U, 1)} V` : `U₁ = ${num(U1, 2)} V, U₂ = ${num(U2, 2)} V (U = U₁ + U₂)`, color: C.third },
        ]}
      />
    </svg>
  );
}

export const circuits: Topic = {
  id: 'prad-elektryczny',
  title: 'Prąd elektryczny i obwody',
  subject: 'fizyka',
  summary: 'Prawo Ohma z płynącymi elektronami i świecącą żarówką oraz połączenia szeregowe i równoległe – gdzie dzieli się prąd, a gdzie napięcie.',
  accent: '#facc15',
  glyph: 'Ω',
  steps: [
    {
      title: 'Prawo Ohma',
      kind: '2d',
      scene: OhmScene,
      controls: [
        { type: 'slider', key: 'U', label: 'Napięcie U', min: 0, max: 24, step: 0.5, default: 12, unit: 'V' },
        { type: 'slider', key: 'R', label: 'Opór R', min: 10, max: 200, step: 5, default: 40, unit: 'Ω' },
      ],
      body: (
        <>
          <div className="formula">I = U / R      P = U · I</div>
          <p>
            Napięcie to „ciśnienie”, które pcha ładunki, opór – przeszkoda na ich drodze. Natężenie prądu mówi, ile
            ładunku przepływa w sekundę: dwa razy większe napięcie, dwa razy szybciej płynące elektrony.
          </p>
          <p>
            Uwaga na kierunek: umownie prąd płynie od + do −, ale elektrony (ujemne) wędrują w przeciwną stronę.
            Żarówka świeci tym jaśniej, im większa moc P = U·I.
          </p>
        </>
      ),
    },
    {
      title: 'Szeregowo i równolegle',
      kind: '2d',
      scene: NetworkScene,
      controls: [
        {
          type: 'select',
          key: 'mode',
          label: 'Połączenie',
          default: 'ser',
          options: [
            { value: 'ser', label: 'szeregowe' },
            { value: 'par', label: 'równoległe' },
          ],
        },
        { type: 'slider', key: 'U', label: 'Napięcie U', min: 1, max: 24, step: 0.5, default: 12, unit: 'V' },
        { type: 'slider', key: 'R1', label: 'R₁', min: 10, max: 200, step: 5, default: 40, unit: 'Ω' },
        { type: 'slider', key: 'R2', label: 'R₂', min: 10, max: 200, step: 5, default: 80, unit: 'Ω' },
      ],
      body: (
        <>
          <p>
            <strong>Szeregowo</strong>: jedna droga, więc przez oba oporniki płynie ten sam prąd, a napięcie baterii
            dzieli się między nie. Opory się sumują – żarówki świecą słabiej.
          </p>
          <p>
            <strong>Równolegle</strong>: prąd rozdziela się na gałęzie, ale każdy opornik dostaje pełne napięcie
            baterii. Opór zastępczy jest mniejszy od najmniejszego z oporów – dlatego domowe gniazdka łączy się
            równolegle.
          </p>
        </>
      ),
    },
  ],
};
