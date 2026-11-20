import { useEffect, useRef } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { useAnimationClock } from '../../lib/useAnimationClock';
import { C, VIEW, num } from '../../lib/mathkit';

const METALS: Record<string, { name: string; ion: string; E: number; color: string; sol: string; salt: string }> = {
  Mg: { name: 'magnez', ion: 'Mg²⁺', E: -2.37, color: '#e2e8f0', sol: 'rgba(255,255,255,0.08)', salt: 'MgSO₄' },
  Zn: { name: 'cynk', ion: 'Zn²⁺', E: -0.76, color: '#a1a1aa', sol: 'rgba(255,255,255,0.08)', salt: 'ZnSO₄' },
  Fe: { name: 'żelazo', ion: 'Fe²⁺', E: -0.44, color: '#71717a', sol: 'rgba(163,230,53,0.18)', salt: 'FeSO₄' },
  Cu: { name: 'miedź', ion: 'Cu²⁺', E: 0.34, color: '#c2703d', sol: 'rgba(56,189,248,0.45)', salt: 'CuSO₄' },
  Ag: { name: 'srebro', ion: 'Ag⁺', E: 0.8, color: '#e5e7eb', sol: 'rgba(255,255,255,0.08)', salt: 'AgNO₃' },
};

/* ---------- Krok 1: szereg aktywności ---------- */
function SeriesScene({ params }: SceneProps) {
  const metal = METALS[String(params.metal)] ?? METALS.Zn;
  const ionKey = String(params.ion);
  const ion = METALS[ionKey] ?? METALS.Cu;
  const reacts = metal.E < ion.E && metal !== ion;
  const st = useRef({ t: 0 });
  const time = useAnimationClock(true, 1);
  useEffect(() => {
    st.current.t = time;
  }, [params.metal, params.ion]); // eslint-disable-line react-hooks/exhaustive-deps
  const progress = reacts ? Math.min(1, (time - st.current.t) / 6) : 0;
  const order = Object.entries(METALS).sort((a, b) => a[1].E - b[1].E);
  return (
    <svg viewBox={VIEW}>
      {/* zlewka */}
      <path d="M190 160 L190 470 Q190 490 210 490 L430 490 Q450 490 450 470 L450 160" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" />
      <rect x="193" y="230" width="254" height="257" fill={ion.sol} />
      <rect x="193" y="230" width="254" height="257" fill="rgba(255,255,255,0.05)" opacity={progress} />
      {/* blaszka */}
      <rect x="295" y="120" width="50" height="320" rx="4" fill={metal.color} />
      {reacts &&
        Array.from({ length: 40 }, (_, i) => {
          const y = 240 + ((i * 37) % 190);
          const side = i % 2 ? 345 : 285;
          return i / 40 < progress ? <circle key={i} cx={side + ((i * 13) % 10) - 5 + (i % 2 ? 4 : 6)} cy={y} r={5 + (i % 3)} fill={ion.color} /> : null;
        })}
      <text x="320" y="520" fill={C.text} fontFamily="Geist" fontSize="14" textAnchor="middle">
        {metal.name} w roztworze {ion.salt}
      </text>
      {/* szereg */}
      {order.map(([k, m], i) => (
        <g key={k}>
          <rect x={560 + i * 62} y="200" width="54" height="54" rx="10" fill={k === String(params.metal) ? C.third : k === ionKey ? C.second : 'rgba(255,255,255,0.08)'} />
          <text x={587 + i * 62} y="234" fill={k === String(params.metal) || k === ionKey ? '#0b0d12' : '#fff'} fontFamily="Geist" fontSize="18" fontWeight="700" textAnchor="middle">
            {k}
          </text>
          <text x={587 + i * 62} y="276" fill={C.text} fontFamily="Geist" fontSize="11" textAnchor="middle">
            {num(m.E, 2)} V
          </text>
        </g>
      ))}
      <text x="560" y="186" fill={C.text} fontFamily="Geist" fontSize="12">
        aktywniejsze (łatwiej oddają elektrony) →
      </text>
      <text x="560" y="310" fill={C.text} fontFamily="Geist" fontSize="12">
        ← szlachetniejsze
      </text>
      <InfoBox
        lines={[
          reacts
            ? { text: `${k(metal)} + ${ion.ion} → ${metal.ion} + ${k(ion)}`, color: C.good }
            : { text: metal === ion ? 'metal we własnym roztworze – nic się nie dzieje' : 'brak reakcji', color: C.bad },
          { text: reacts ? `${metal.name} jest aktywniejszy – wypiera ${ion.name} z roztworu` : `${metal.name} jest mniej aktywny niż ${ion.name}` },
          { text: reacts ? 'na blaszce osadza się metal z roztworu' : 'metal szlachetniejszy nie wypiera aktywniejszego' , color: C.third },
        ]}
      />
    </svg>
  );
}
const k = (m: (typeof METALS)[string]) => Object.keys(METALS).find((key) => METALS[key] === m) ?? '';

/* ---------- Krok 2: ogniwo galwaniczne ---------- */
function CellScene({ params }: SceneProps) {
  const a = METALS[String(params.a)] ?? METALS.Zn;
  const b = METALS[String(params.b)] ?? METALS.Cu;
  const anode = a.E <= b.E ? a : b;
  const cathode = a.E <= b.E ? b : a;
  const emf = cathode.E - anode.E;
  const t = useAnimationClock(true, 1);
  const leftIsAnode = anode === a;
  // ścieżka przewodu: od lewej elektrody w górę, przez woltomierz, do prawej
  const path: [number, number][] = [
    [230, 200],
    [230, 90],
    [670, 90],
    [670, 200],
  ];
  const segLen = [110, 440, 110];
  const total = segLen.reduce((s, v) => s + v, 0);
  const at = (d: number): [number, number] => {
    let r = ((d % total) + total) % total;
    for (let i = 0; i < 3; i++) {
      if (r <= segLen[i]) {
        const [x1, y1] = path[i];
        const [x2, y2] = path[i + 1];
        return [x1 + ((x2 - x1) * r) / segLen[i], y1 + ((y2 - y1) * r) / segLen[i]];
      }
      r -= segLen[i];
    }
    return path[3];
  };
  const dir = leftIsAnode ? 1 : -1;
  const speed = 60 + emf * 60;
  return (
    <svg viewBox={VIEW}>
      {/* naczynia */}
      {[[110, a], [550, b]].map(([x, m], i) => {
        const met = m as (typeof METALS)[string];
        const xx = x as number;
        return (
          <g key={i}>
            <path d={`M${xx} 230 L${xx} 470 Q${xx} 490 ${xx + 20} 490 L${xx + 220} 490 Q${xx + 240} 490 ${xx + 240} 470 L${xx + 240} 230`} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" />
            <rect x={xx + 3} y="280" width="234" height="207" fill={met.sol} />
            <rect x={xx + 95} y="200" width="50" height="250" rx="4" fill={met.color} />
            <text x={xx + 120} y="520" fill={C.text} fontFamily="Geist" fontSize="13" textAnchor="middle">
              {k(met)} | {met.salt}
            </text>
            <text x={xx + 120} y="190" fill={met === anode ? C.main : C.good} fontFamily="Geist" fontSize="14" fontWeight="700" textAnchor="middle">
              {met === anode ? 'anoda (−) utlenianie' : 'katoda (+) redukcja'}
            </text>
          </g>
        );
      })}
      {/* klucz elektrolityczny */}
      <path d="M300 330 L300 260 Q300 240 320 240 L580 240 Q600 240 600 260 L600 330" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="24" strokeLinecap="round" />
      <text x="450" y="232" fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="middle">
        klucz elektrolityczny (KNO₃)
      </text>
      {/* przewód i woltomierz */}
      <polyline points={path.map((p) => p.join(',')).join(' ')} fill="none" stroke="#94a3b8" strokeWidth="4" />
      <circle cx="450" cy="90" r="38" fill="#0b0d12" stroke="#fff" strokeWidth="3" />
      <text x="450" y="98" fill={C.third} fontFamily="Geist" fontSize="20" fontWeight="700" textAnchor="middle">
        {num(emf, 2)} V
      </text>
      {Array.from({ length: 12 }, (_, i) => {
        const [x, y] = at(dir * t * speed + (i * total) / 12);
        if (Math.abs(x - 450) < 40 && y < 130) return null;
        return <circle key={i} cx={x} cy={y} r="5" fill="#4fc3ff" />;
      })}
      <InfoBox
        lines={[
          { text: `SEM = E°katody − E°anody = ${num(cathode.E, 2)} − (${num(anode.E, 2)}) = ${num(emf, 2)} V`, color: C.third },
          { text: `anoda: ${k(anode)} → ${anode.ion} + ne⁻`, color: C.main },
          { text: `katoda: ${cathode.ion} + ne⁻ → ${k(cathode)}`, color: C.good },
          { text: 'elektrony (niebieskie) płyną przewodem od anody do katody' },
        ]}
      />
    </svg>
  );
}

const metalOpts = Object.entries(METALS).map(([value, m]) => ({ value, label: `${value} (${m.name})` }));

export const electrochem: Topic = {
  id: 'elektrochemia',
  title: 'Redoks i ogniwa',
  subject: 'chemia',
  summary: 'Szereg aktywności metali – kiedy metal wypiera inny z roztworu soli – i ogniwo galwaniczne z płynącymi elektronami i siłą elektromotoryczną.',
  accent: '#eab308',
  glyph: 'e⁻',
  steps: [
    {
      title: 'Szereg aktywności metali',
      kind: '2d',
      scene: SeriesScene,
      controls: [
        { type: 'select', key: 'metal', label: 'Blaszka z metalu', default: 'Zn', options: metalOpts.map((o) => ({ ...o, label: o.value })) },
        { type: 'select', key: 'ion', label: 'Roztwór soli', default: 'Cu', options: Object.entries(METALS).map(([value, m]) => ({ value, label: m.salt })) },
      ],
      body: (
        <>
          <p>
            Metal <strong>aktywniejszy</strong> (o niższym potencjale standardowym) oddaje elektrony jonom metalu
            szlachetniejszego. Cynk w roztworze siarczanu miedzi pokrywa się czerwonawą miedzią, a niebieski roztwór
            blednie.
          </p>
          <p>
            To reakcja <strong>redoks</strong>: cynk się utlenia (oddaje elektrony), jony miedzi się redukują
            (przyjmują). Odwrotnie – miedź w roztworze cynku – nic się nie dzieje. Sprawdź srebro w roztworze miedzi i
            miedź w roztworze srebra.
          </p>
        </>
      ),
    },
    {
      title: 'Ogniwo galwaniczne',
      kind: '2d',
      scene: CellScene,
      controls: [
        { type: 'select', key: 'a', label: 'Lewa elektroda', default: 'Zn', options: metalOpts.map((o) => ({ ...o, label: o.value })) },
        { type: 'select', key: 'b', label: 'Prawa elektroda', default: 'Cu', options: metalOpts.map((o) => ({ ...o, label: o.value })) },
      ],
      body: (
        <>
          <div className="formula">SEM = E°katody − E°anody</div>
          <p>
            Jeśli rozdzielić utlenianie i redukcję do dwóch naczyń i połączyć je przewodem, elektrony popłyną przez
            przewód – to <strong>ogniwo</strong>. Klucz elektrolityczny zamyka obwód, przepuszczając jony.
          </p>
          <p>
            Anodą jest metal aktywniejszy, katodą – szlachetniejszy. Im dalej od siebie leżą w szeregu, tym większe
            napięcie: ogniwo Daniella (Zn–Cu) daje 1,10 V, a magnez ze srebrem ponad 3 V.
          </p>
        </>
      ),
    },
  ],
};
