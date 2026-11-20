import { motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { C, VIEW, num } from '../../lib/mathkit';

const NA = 6.022e23;

function sci(v: number) {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  const supE = String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  return `${num(m, 2)} · 10${supE}`;
}

/* ---------- Krok 1: mol ---------- */
const SUBST: Record<string, { name: string; f: string; M: number; gas: boolean; particle: string }> = {
  woda: { name: 'woda', f: 'H₂O', M: 18.02, gas: false, particle: 'cząsteczek' },
  sol: { name: 'chlorek sodu', f: 'NaCl', M: 58.44, gas: false, particle: 'par jonów Na⁺Cl⁻' },
  co2: { name: 'tlenek węgla(IV)', f: 'CO₂', M: 44.01, gas: true, particle: 'cząsteczek' },
  tlen: { name: 'tlen', f: 'O₂', M: 32.0, gas: true, particle: 'cząsteczek' },
  glukoza: { name: 'glukoza', f: 'C₆H₁₂O₆', M: 180.16, gas: false, particle: 'cząsteczek' },
  zelazo: { name: 'żelazo', f: 'Fe', M: 55.85, gas: false, particle: 'atomów' },
};
function MoleScene({ params }: SceneProps) {
  const S = SUBST[String(params.s)] ?? SUBST.woda;
  const m = Number(params.m);
  const n = m / S.M;
  const N = n * NA;
  const V = n * 22.4;
  const node = (x: number, y: number, title: string, value: string, color: string) => (
    <g>
      <rect x={x - 110} y={y - 48} width="220" height="96" rx="16" fill="rgba(255,255,255,0.05)" stroke={color} strokeWidth="2.5" />
      <text x={x} y={y - 16} fill={color} fontFamily="Geist" fontSize="14" fontWeight="600" textAnchor="middle">
        {title}
      </text>
      <text x={x} y={y + 20} fill="#fff" fontFamily="Geist" fontSize="22" fontWeight="700" textAnchor="middle">
        {value}
      </text>
    </g>
  );
  const arrowLbl = (x1: number, y1: number, x2: number, y2: number, label: string) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" markerEnd="url(#mol-a)" markerStart="url(#mol-a)" />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 10} fill={C.third} fontFamily="Geist" fontSize="14" fontWeight="600" textAnchor="middle">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox={VIEW}>
      <defs>
        <marker id="mol-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,0.5)" />
        </marker>
      </defs>
      {node(450, 300, 'liczność n', `${num(n, 3)} mol`, C.main)}
      {node(160, 300, 'masa m', `${num(m, 1)} g`, C.second)}
      {node(740, 300, `liczba ${S.particle}`, sci(N), C.good)}
      {node(450, 480, 'objętość gazu (warunki normalne)', S.gas ? `${num(V, 2)} dm³` : 'nie dotyczy', S.gas ? '#c084fc' : 'rgba(255,255,255,0.3)')}
      {arrowLbl(272, 300, 336, 300, `÷ ${num(S.M, 2)}`)}
      {arrowLbl(564, 300, 628, 300, '× Nₐ')}
      {S.gas && arrowLbl(450, 350, 450, 428, '× 22,4')}
      <InfoBox
        lines={[
          { text: `${S.name} ${S.f}: M = ${num(S.M, 2)} g/mol`, color: C.second },
          { text: `n = m / M = ${num(m, 1)} / ${num(S.M, 2)} = ${num(n, 3)} mol`, color: C.main },
          { text: `N = n · Nₐ = ${sci(N)}`, color: C.good },
          { text: 'Nₐ = 6,022 · 10²³ – liczba Avogadra' },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 2: niedomiar i nadmiar ---------- */
type Sp = { f: string; atoms: string[] };
const REACT: Record<string, { name: string; a: Sp; na: number; b: Sp; nb: number; p: Sp[]; np: number[] }> = {
  woda: { name: '2H₂ + O₂ → 2H₂O', a: { f: 'H₂', atoms: ['H', 'H'] }, na: 2, b: { f: 'O₂', atoms: ['O', 'O'] }, nb: 1, p: [{ f: 'H₂O', atoms: ['O', 'H', 'H'] }], np: [2] },
  amoniak: { name: 'N₂ + 3H₂ → 2NH₃', a: { f: 'N₂', atoms: ['N', 'N'] }, na: 1, b: { f: 'H₂', atoms: ['H', 'H'] }, nb: 3, p: [{ f: 'NH₃', atoms: ['N', 'H', 'H', 'H'] }], np: [2] },
  metan: { name: 'CH₄ + 2O₂ → CO₂ + 2H₂O', a: { f: 'CH₄', atoms: ['C', 'H', 'H', 'H', 'H'] }, na: 1, b: { f: 'O₂', atoms: ['O', 'O'] }, nb: 2, p: [{ f: 'CO₂', atoms: ['C', 'O', 'O'] }, { f: 'H₂O', atoms: ['O', 'H', 'H'] }], np: [1, 2] },
};
const COL: Record<string, string> = { H: '#e5e7eb', O: '#ef4444', N: '#3b82f6', C: '#4b5563' };

function MoleculeIcon({ sp, x, y, faded }: { sp: Sp; x: number; y: number; faded?: boolean }) {
  return (
    <g opacity={faded ? 0.35 : 1}>
      {sp.atoms.map((el, i) => {
        const ang = i === 0 ? 0 : ((i - 1) / Math.max(1, sp.atoms.length - 1)) * Math.PI * 2;
        const r = i === 0 ? 0 : 14;
        const cx = sp.atoms.length === 2 ? x + (i ? 8 : -8) : x + r * Math.cos(ang);
        const cy = sp.atoms.length === 2 ? y : y + r * Math.sin(ang);
        return <circle key={i} cx={cx} cy={cy} r={el === 'H' ? 7 : 11} fill={COL[el]} stroke="#0b0d12" strokeWidth="1.5" />;
      })}
    </g>
  );
}

function grid(n: number, x0: number, y0: number, cols: number, dx = 46, dy = 44) {
  return Array.from({ length: n }, (_, i) => [x0 + (i % cols) * dx, y0 + Math.floor(i / cols) * dy] as [number, number]);
}

function LimitingScene({ params }: SceneProps) {
  const R = REACT[String(params.r)] ?? REACT.woda;
  const A = Number(params.A);
  const B = Number(params.B);
  const k = Math.min(Math.floor(A / R.na), Math.floor(B / R.nb));
  const leftA = A - k * R.na;
  const leftB = B - k * R.nb;
  const limiting = A / R.na < B / R.nb ? R.a.f : A / R.na > B / R.nb ? R.b.f : 'żaden (stosunek stechiometryczny)';
  const prods = R.p.flatMap((sp, i) => Array.from({ length: R.np[i] * k }, () => sp));
  return (
    <svg viewBox={VIEW}>
      <text x="210" y="168" fill={C.text} fontFamily="Geist" fontSize="15" fontWeight="600" textAnchor="middle">
        substraty
      </text>
      <text x="660" y="168" fill={C.text} fontFamily="Geist" fontSize="15" fontWeight="600" textAnchor="middle">
        po reakcji
      </text>
      <line x1="450" x2="450" y1="160" y2="540" stroke="rgba(255,255,255,0.12)" />
      {grid(A, 60, 200, 7).map(([x, y], i) => (
        <MoleculeIcon key={`a${i}`} sp={R.a} x={x} y={y} />
      ))}
      {grid(B, 60, 200 + Math.ceil(A / 7) * 44 + 20, 7).map(([x, y], i) => (
        <MoleculeIcon key={`b${i}`} sp={R.b} x={x} y={y} />
      ))}
      {grid(prods.length, 500, 200, 8).map(([x, y], i) => (
        <motion.g key={`p${i}-${prods.length}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
          <MoleculeIcon sp={prods[i]} x={x} y={y} />
        </motion.g>
      ))}
      {grid(leftA, 500, 200 + Math.ceil(prods.length / 8) * 44 + 24, 8).map(([x, y], i) => (
        <MoleculeIcon key={`la${i}`} sp={R.a} x={x} y={y} faded />
      ))}
      {grid(leftB, 500, 200 + Math.ceil(prods.length / 8) * 44 + 24 + Math.ceil(leftA / 8) * 44, 8).map(([x, y], i) => (
        <MoleculeIcon key={`lb${i}`} sp={R.b} x={x} y={y} faded />
      ))}
      <InfoBox
        lines={[
          { text: R.name, color: '#fff' },
          { text: `przereagowało ${k}× zestaw z równania`, color: C.good },
          { text: `w niedomiarze: ${limiting}`, color: C.main },
          { text: `pozostało (blade): ${leftA} ${R.a.f}, ${leftB} ${R.b.f}`, color: C.third },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 3: bilansowanie ---------- */
type Comp = Record<string, number>;
const EQS: Record<string, { lhs: [string, Comp][]; rhs: [string, Comp][]; answer: number[] }> = {
  woda: { lhs: [['H₂', { H: 2 }], ['O₂', { O: 2 }]], rhs: [['H₂O', { H: 2, O: 1 }]], answer: [2, 1, 2] },
  rdza: { lhs: [['Fe', { Fe: 1 }], ['O₂', { O: 2 }]], rhs: [['Fe₂O₃', { Fe: 2, O: 3 }]], answer: [4, 3, 2] },
  propan: { lhs: [['C₃H₈', { C: 3, H: 8 }], ['O₂', { O: 2 }]], rhs: [['CO₂', { C: 1, O: 2 }], ['H₂O', { H: 2, O: 1 }]], answer: [1, 5, 3, 4] },
  glin: { lhs: [['Al', { Al: 1 }], ['HCl', { H: 1, Cl: 1 }]], rhs: [['AlCl₃', { Al: 1, Cl: 3 }], ['H₂', { H: 2 }]], answer: [2, 6, 2, 3] },
  fotosynteza: { lhs: [['CO₂', { C: 1, O: 2 }], ['H₂O', { H: 2, O: 1 }]], rhs: [['C₆H₁₂O₆', { C: 6, H: 12, O: 6 }], ['O₂', { O: 2 }]], answer: [6, 6, 1, 6] },
};
function BalanceScene({ params }: SceneProps) {
  const E = EQS[String(params.eq)] ?? EQS.rdza;
  const species = [...E.lhs, ...E.rhs];
  const coef = species.map((_, i) => Number(params[`c${i}`] ?? 1));
  const els = [...new Set(species.flatMap(([, c]) => Object.keys(c)))];
  const count = (side: 'l' | 'r', el: string) =>
    (side === 'l' ? E.lhs : E.rhs).reduce((s, [, c], i) => s + (c[el] ?? 0) * coef[side === 'l' ? i : E.lhs.length + i], 0);
  const ok = els.every((el) => count('l', el) === count('r', el));
  const eqText =
    E.lhs.map(([f], i) => `${coef[i] > 1 ? coef[i] : ''}${f}`).join(' + ') +
    ' → ' +
    E.rhs.map(([f], i) => `${coef[E.lhs.length + i] > 1 ? coef[E.lhs.length + i] : ''}${f}`).join(' + ');
  const maxC = Math.max(...els.flatMap((el) => [count('l', el), count('r', el)]), 4);
  return (
    <svg viewBox={VIEW}>
      <text x="450" y="200" fill={ok ? C.good : '#fff'} fontFamily="Geist" fontSize="30" fontWeight="700" textAnchor="middle">
        {eqText}
      </text>
      {els.map((el, i) => {
        const y = 260 + i * 62;
        const l = count('l', el);
        const r = count('r', el);
        const w = 300 / maxC;
        return (
          <g key={el}>
            <text x="450" y={y + 22} fill="#fff" fontFamily="Geist" fontSize="18" fontWeight="700" textAnchor="middle">
              {el}
            </text>
            <rect x={420 - l * w} y={y} width={l * w} height="32" rx="6" fill={l === r ? C.good : C.second} opacity="0.85" />
            <rect x={480} y={y} width={r * w} height="32" rx="6" fill={l === r ? C.good : C.main} opacity="0.85" />
            <text x={410 - l * w} y={y + 22} fill={C.text} fontFamily="Geist" fontSize="15" textAnchor="end">
              {l}
            </text>
            <text x={490 + r * w} y={y + 22} fill={C.text} fontFamily="Geist" fontSize="15">
              {r}
            </text>
          </g>
        );
      })}
      <InfoBox
        lines={[
          { text: ok ? 'równanie zbilansowane!' : 'liczby atomów po obu stronach muszą być równe', color: ok ? C.good : C.third },
          { text: 'lewe słupki – substraty, prawe – produkty' },
          { text: ok && coef.slice(0, species.length).some((c, i) => c !== E.answer[i]) ? 'działa, ale współczynniki można skrócić' : '' },
          { text: species.length < 4 ? 'w tej reakcji są trzy związki – czwarty suwak nie jest potrzebny' : '' },
        ]}
      />
    </svg>
  );
}

const coefControls = [0, 1, 2, 3].map((i) => ({ type: 'slider' as const, key: `c${i}`, label: `Współczynnik ${i + 1}`, min: 1, max: 8, step: 1, default: 1 }));

export const stoichiometry: Topic = {
  id: 'mol-stechiometria',
  title: 'Mol i stechiometria',
  subject: 'chemia',
  summary: 'Przeliczanie masy na mole i cząsteczki, odczynnik w niedomiarze pokazany na żywych cząsteczkach i bilansowanie równań z licznikiem atomów.',
  accent: '#0ea5e9',
  glyph: 'n',
  steps: [
    {
      title: 'Mol – chemiczny tuzin',
      kind: '2d',
      scene: MoleScene,
      controls: [
        {
          type: 'select',
          key: 's',
          label: 'Substancja',
          default: 'woda',
          options: Object.entries(SUBST).map(([value, s]) => ({ value, label: s.f })),
        },
        { type: 'slider', key: 'm', label: 'Masa m', min: 1, max: 500, step: 1, default: 36, unit: 'g' },
      ],
      body: (
        <>
          <div className="formula">n = m / M      N = n · Nₐ      V = n · 22,4 dm³</div>
          <p>
            Atomów nie da się liczyć na sztuki, więc chemicy liczą je <strong>porcjami</strong>. Jeden mol to 6,022·10²³
            drobin – tyle, ile atomów jest w 12 g węgla-12.
          </p>
          <p>
            Masa molowa M (z układu okresowego) to most między gramami a molami: 18 g wody to 1 mol, czyli 6·10²³
            cząsteczek. Mol każdego gazu w warunkach normalnych zajmuje ok. 22,4 dm³.
          </p>
        </>
      ),
    },
    {
      title: 'Niedomiar i nadmiar',
      kind: '2d',
      scene: LimitingScene,
      controls: [
        {
          type: 'select',
          key: 'r',
          label: 'Reakcja',
          default: 'woda',
          options: [
            { value: 'woda', label: 'synteza wody' },
            { value: 'amoniak', label: 'synteza amoniaku' },
            { value: 'metan', label: 'spalanie metanu' },
          ],
        },
        { type: 'slider', key: 'A', label: 'Cząsteczki substratu 1', min: 0, max: 14, step: 1, default: 6 },
        { type: 'slider', key: 'B', label: 'Cząsteczki substratu 2', min: 0, max: 14, step: 1, default: 5 },
      ],
      body: (
        <>
          <p>
            Współczynniki w równaniu to <strong>przepis</strong>: na 2 cząsteczki wodoru potrzeba 1 cząsteczki tlenu.
            Reakcja biegnie tak długo, aż jednego z substratów zabraknie.
          </p>
          <p>
            Ten substrat to <strong>odczynnik w niedomiarze</strong> – on wyznacza ilość produktu. Drugi zostaje w
            nadmiarze (blade cząsteczki po prawej). Zmieniaj liczby cząsteczek i szukaj stosunku, przy którym nic nie
            zostaje.
          </p>
        </>
      ),
    },
    {
      title: 'Bilansowanie równań',
      kind: '2d',
      scene: BalanceScene,
      controls: [
        {
          type: 'select',
          key: 'eq',
          label: 'Reakcja',
          default: 'rdza',
          options: [
            { value: 'woda', label: 'woda' },
            { value: 'rdza', label: 'rdzewienie' },
            { value: 'propan', label: 'spalanie propanu' },
            { value: 'glin', label: 'glin + HCl' },
            { value: 'fotosynteza', label: 'fotosynteza' },
          ],
        },
        ...coefControls,
      ],
      body: (
        <>
          <p>
            Atomy w reakcji się nie tworzą i nie znikają, tylko zmieniają partnerów. Dlatego po obu stronach równania musi
            być <strong>tyle samo atomów każdego pierwiastka</strong>.
          </p>
          <p>
            Dobieraj współczynniki suwakami (od lewej: substraty, potem produkty). Słupki pokazują liczbę atomów każdego
            pierwiastka – gdy wszystkie zrobią się zielone, równanie jest zbilansowane. Wskazówka: zacznij od pierwiastka,
            który występuje w najmniejszej liczbie związków, a tlen zostaw na koniec.
          </p>
        </>
      ),
    },
  ],
};
