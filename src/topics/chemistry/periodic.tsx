import { useState } from 'react';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';
import { C, VIEW, num } from '../../lib/mathkit';

type Cat = 'alk' | 'ziem' | 'przej' | 'metal' | 'pol' | 'niem' | 'halo' | 'szl';
interface Elem {
  Z: number;
  sym: string;
  name: string;
  mass: number;
  en: number | null;
  r: number;
  ie: number;
  cat: Cat;
  group: number;
  period: number;
}

// Z, symbol, nazwa, masa, elektroujemność (Pauling), promień atomowy [pm], 1. energia jonizacji [kJ/mol]
const RAW: [string, string, number, number | null, number, number][] = [
  ['H', 'wodór', 1.008, 2.2, 53, 1312], ['He', 'hel', 4.003, null, 31, 2372],
  ['Li', 'lit', 6.94, 0.98, 167, 520], ['Be', 'beryl', 9.012, 1.57, 112, 900], ['B', 'bor', 10.81, 2.04, 87, 801], ['C', 'węgiel', 12.011, 2.55, 67, 1086], ['N', 'azot', 14.007, 3.04, 56, 1402], ['O', 'tlen', 15.999, 3.44, 48, 1314], ['F', 'fluor', 18.998, 3.98, 42, 1681], ['Ne', 'neon', 20.18, null, 38, 2081],
  ['Na', 'sód', 22.99, 0.93, 190, 496], ['Mg', 'magnez', 24.305, 1.31, 145, 738], ['Al', 'glin', 26.98, 1.61, 118, 578], ['Si', 'krzem', 28.085, 1.9, 111, 787], ['P', 'fosfor', 30.97, 2.19, 98, 1012], ['S', 'siarka', 32.06, 2.58, 88, 1000], ['Cl', 'chlor', 35.45, 3.16, 79, 1251], ['Ar', 'argon', 39.95, null, 71, 1521],
  ['K', 'potas', 39.1, 0.82, 243, 419], ['Ca', 'wapń', 40.08, 1.0, 194, 590], ['Sc', 'skand', 44.96, 1.36, 184, 633], ['Ti', 'tytan', 47.87, 1.54, 176, 659], ['V', 'wanad', 50.94, 1.63, 171, 651], ['Cr', 'chrom', 52.0, 1.66, 166, 653], ['Mn', 'mangan', 54.94, 1.55, 161, 717], ['Fe', 'żelazo', 55.85, 1.83, 156, 762], ['Co', 'kobalt', 58.93, 1.88, 152, 760], ['Ni', 'nikiel', 58.69, 1.91, 149, 737], ['Cu', 'miedź', 63.55, 1.9, 145, 745], ['Zn', 'cynk', 65.38, 1.65, 142, 906], ['Ga', 'gal', 69.72, 1.81, 136, 579], ['Ge', 'german', 72.63, 2.01, 125, 762], ['As', 'arsen', 74.92, 2.18, 114, 947], ['Se', 'selen', 78.97, 2.55, 103, 941], ['Br', 'brom', 79.9, 2.96, 94, 1140], ['Kr', 'krypton', 83.8, 3.0, 88, 1351],
  ['Rb', 'rubid', 85.47, 0.82, 265, 403], ['Sr', 'stront', 87.62, 0.95, 219, 550], ['Y', 'itr', 88.91, 1.22, 212, 600], ['Zr', 'cyrkon', 91.22, 1.33, 206, 640], ['Nb', 'niob', 92.91, 1.6, 198, 652], ['Mo', 'molibden', 95.95, 2.16, 190, 684], ['Tc', 'technet', 98, 1.9, 183, 702], ['Ru', 'ruten', 101.07, 2.2, 178, 710], ['Rh', 'rod', 102.91, 2.28, 173, 720], ['Pd', 'pallad', 106.42, 2.2, 169, 804], ['Ag', 'srebro', 107.87, 1.93, 165, 731], ['Cd', 'kadm', 112.41, 1.69, 161, 868], ['In', 'ind', 114.82, 1.78, 156, 558], ['Sn', 'cyna', 118.71, 1.96, 145, 709], ['Sb', 'antymon', 121.76, 2.05, 133, 834], ['Te', 'tellur', 127.6, 2.1, 123, 869], ['I', 'jod', 126.9, 2.66, 115, 1008], ['Xe', 'ksenon', 131.29, 2.6, 108, 1170],
];

const METALLOIDS = ['B', 'Si', 'Ge', 'As', 'Sb', 'Te'];
const NONMETALS = ['H', 'C', 'N', 'O', 'P', 'S', 'Se'];
const HALOGENS = ['F', 'Cl', 'Br', 'I'];
const NOBLE = ['He', 'Ne', 'Ar', 'Kr', 'Xe'];

export const ELEMS: Elem[] = RAW.map(([sym, name, mass, en, r, ie], i) => {
  const Z = i + 1;
  const period = Z <= 2 ? 1 : Z <= 10 ? 2 : Z <= 18 ? 3 : Z <= 36 ? 4 : 5;
  const start = [0, 1, 3, 11, 19, 37][period];
  const k = Z - start; // pozycja w okresie
  let group: number;
  if (period === 1) group = Z === 1 ? 1 : 18;
  else if (period <= 3) group = k < 2 ? k + 1 : k + 11;
  else group = k + 1;
  let cat: Cat;
  if (NOBLE.includes(sym)) cat = 'szl';
  else if (HALOGENS.includes(sym)) cat = 'halo';
  else if (NONMETALS.includes(sym)) cat = 'niem';
  else if (METALLOIDS.includes(sym)) cat = 'pol';
  else if (group === 1) cat = 'alk';
  else if (group === 2) cat = 'ziem';
  else if (group >= 3 && group <= 12) cat = 'przej';
  else cat = 'metal';
  return { Z, sym, name, mass, en, r, ie, cat, group, period };
});

const CAT: Record<Cat, { name: string; color: string }> = {
  alk: { name: 'metale alkaliczne', color: '#f87171' },
  ziem: { name: 'metale ziem alkalicznych', color: '#fb923c' },
  przej: { name: 'metale przejściowe', color: '#facc15' },
  metal: { name: 'pozostałe metale', color: '#a3e635' },
  pol: { name: 'półmetale', color: '#2dd4bf' },
  niem: { name: 'niemetale', color: '#60a5fa' },
  halo: { name: 'fluorowce', color: '#a78bfa' },
  szl: { name: 'gazy szlachetne', color: '#f472b6' },
};

const PROPS: Record<string, { name: string; get: (e: Elem) => number | null; unit: string; trend: string }> = {
  en: { name: 'elektroujemność', get: (e) => e.en, unit: '', trend: 'rośnie w prawo i w górę – najwyższa ma fluor (3,98)' },
  r: { name: 'promień atomowy', get: (e) => e.r, unit: ' pm', trend: 'rośnie w dół grupy (więcej powłok) i maleje w prawo okresu (większy ładunek jądra)' },
  ie: { name: 'energia jonizacji', get: (e) => e.ie, unit: ' kJ/mol', trend: 'odwrotnie niż promień: najłatwiej oderwać elektron metalom alkalicznym' },
  mass: { name: 'masa atomowa', get: (e) => e.mass, unit: ' u', trend: 'rośnie prawie zawsze razem z Z' },
};

function heat(t: number) {
  // od granatu przez fiolet do żółci
  const a = [40, 60, 140];
  const b = [236, 72, 153];
  const c = [253, 224, 71];
  const [p, q, u] = t < 0.5 ? [a, b, t * 2] : [b, c, (t - 0.5) * 2];
  return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * u)).join(',')})`;
}

/* ---------- Krok 1: tablica ---------- */
function TableScene({ params }: SceneProps) {
  const prop = String(params.prop);
  const [sel, setSel] = useState(11);
  const P = PROPS[prop];
  const vals = ELEMS.map((e) => (P ? P.get(e) : null)).filter((v): v is number => v !== null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const cw = 47;
  const ch = 62;
  const x0 = 26;
  const y0 = 165; // miejsce na ramkę z danymi u góry
  const e = ELEMS[sel - 1];
  return (
    <svg viewBox={VIEW}>
      {ELEMS.map((el) => {
        const x = x0 + (el.group - 1) * cw;
        const y = y0 + (el.period - 1) * ch;
        const v = P ? P.get(el) : null;
        const fill = P ? (v === null ? 'rgba(255,255,255,0.08)' : heat((v - lo) / (hi - lo))) : CAT[el.cat].color;
        const on = el.Z === sel;
        return (
          <g key={el.Z} onClick={() => setSel(el.Z)} style={{ cursor: 'pointer' }}>
            <rect x={x + 2} y={y + 2} width={cw - 4} height={ch - 4} rx="6" fill={fill} opacity={P ? 0.92 : 0.8} stroke={on ? '#fff' : 'none'} strokeWidth="3" />
            <text x={x + 6} y={y + 15} fill="#0b0d12" fontFamily="Geist" fontSize="9" fontWeight="600">
              {el.Z}
            </text>
            <text x={x + cw / 2} y={y + 38} fill="#0b0d12" fontFamily="Geist" fontSize="17" fontWeight="800" textAnchor="middle">
              {el.sym}
            </text>
            {P && v !== null && (
              <text x={x + cw / 2} y={y + 53} fill="#0b0d12" fontFamily="Geist" fontSize="8.5" textAnchor="middle">
                {prop === 'mass' ? num(v, 1) : prop === 'en' ? num(v, 2) : Math.round(v)}
              </text>
            )}
          </g>
        );
      })}
      {Array.from({ length: 18 }, (_, g) => (
        <text key={g} x={x0 + g * cw + cw / 2} y={y0 - 8} fill={C.text} fontFamily="Geist" fontSize="11" textAnchor="middle">
          {g + 1}
        </text>
      ))}
      {!P && (
        <g>
          {Object.values(CAT).map((c, i) => (
            <g key={c.name} transform={`translate(${x0 + (i % 4) * 210} ${y0 + 5 * ch + 18 + Math.floor(i / 4) * 22})`}>
              <rect width="14" height="14" rx="3" fill={c.color} />
              <text x="20" y="12" fill={C.text} fontFamily="Geist" fontSize="13">
                {c.name}
              </text>
            </g>
          ))}
        </g>
      )}
      {P && (
        <g transform={`translate(${x0} ${y0 + 5 * ch + 18})`}>
          {Array.from({ length: 40 }, (_, i) => (
            <rect key={i} x={i * 9} y="0" width="9" height="14" fill={heat(i / 39)} />
          ))}
          <text x="0" y="32" fill={C.text} fontFamily="Geist" fontSize="12">
            {prop === 'en' ? num(lo, 2) : Math.round(lo)}
          </text>
          <text x="360" y="32" fill={C.text} fontFamily="Geist" fontSize="12" textAnchor="end">
            {prop === 'en' ? num(hi, 2) : Math.round(hi)}
            {P.unit}
          </text>
        </g>
      )}
      <InfoBox
        lines={[
          { text: `${e.sym} – ${e.name}, Z = ${e.Z}`, color: CAT[e.cat].color },
          { text: `grupa ${e.group}, okres ${e.period} · ${CAT[e.cat].name}` },
          { text: `masa ${num(e.mass, 2)} u · promień ${e.r} pm` },
          { text: `elektroujemność ${e.en === null ? 'brak' : num(e.en, 2)} · energia jonizacji ${e.ie} kJ/mol` },
          { text: P ? P.trend : 'kliknij pierwiastek, żeby zobaczyć jego dane', color: C.third },
        ]}
      />
    </svg>
  );
}

/* ---------- Krok 2: trendy ---------- */
function TrendScene({ params }: SceneProps) {
  const P = PROPS[String(params.prop)] ?? PROPS.ie;
  const X0 = 70;
  const W = 790;
  const T = 60;
  const B = 500;
  const vals = ELEMS.map((e) => P.get(e));
  const nums = vals.filter((v): v is number => v !== null);
  const hi = Math.max(...nums) * 1.08;
  const sx = (Z: number) => X0 + ((Z - 1) / 53) * W;
  const sy = (v: number) => B - (v / hi) * (B - T);
  const pts = ELEMS.filter((e) => P.get(e) !== null);
  return (
    <svg viewBox={VIEW}>
      {[2.5, 10.5, 18.5, 36.5].map((z, i) => (
        <g key={z}>
          <line x1={sx(z)} x2={sx(z)} y1={T - 20} y2={B} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 5" />
          <text x={sx(z) + 4} y={T - 24} fill={C.text} fontFamily="Geist" fontSize="11">
            okres {i + 2}
          </text>
        </g>
      ))}
      <line x1={X0} x2={X0 + W} y1={B} y2={B} stroke={C.axis} strokeWidth="1.5" />
      <polyline points={pts.map((e) => `${sx(e.Z)},${sy(P.get(e) as number)}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
      {pts.map((e) => (
        <g key={e.Z}>
          <circle cx={sx(e.Z)} cy={sy(P.get(e) as number)} r={e.cat === 'alk' || e.cat === 'szl' || e.cat === 'halo' ? 7 : 4.5} fill={CAT[e.cat].color} />
          {(e.cat === 'alk' || e.cat === 'szl') && (
            <text x={sx(e.Z)} y={sy(P.get(e) as number) - 12} fill={CAT[e.cat].color} fontFamily="Geist" fontSize="12" fontWeight="700" textAnchor="middle">
              {e.sym}
            </text>
          )}
        </g>
      ))}
      <text x={X0 + W / 2} y={B + 30} fill={C.text} fontFamily="Geist" fontSize="13" textAnchor="middle">
        liczba atomowa Z →
      </text>
      <InfoBox
        lines={[
          { text: `${P.name} dla Z = 1–54`, color: '#fff' },
          { text: P.trend, color: C.third },
          { text: 'czerwone – metale alkaliczne, różowe – gazy szlachetne, fioletowe – fluorowce' },
          { text: 'wykres „piłokształtny” – każdy okres powtarza ten sam wzór: to jest okresowość' },
        ]}
      />
    </svg>
  );
}

export const periodic: Topic = {
  id: 'uklad-okresowy',
  title: 'Układ okresowy i jego trendy',
  subject: 'chemia',
  summary: 'Interaktywna tablica 54 pierwiastków z mapą elektroujemności, promieni i energii jonizacji oraz wykres okresowości właściwości.',
  accent: '#60a5fa',
  glyph: '▦',
  steps: [
    {
      title: 'Mapa układu okresowego',
      kind: '2d',
      scene: TableScene,
      controls: [
        {
          type: 'select',
          key: 'prop',
          label: 'Pokaż',
          default: 'cat',
          options: [
            { value: 'cat', label: 'rodzaje' },
            { value: 'en', label: 'elektroujemność' },
            { value: 'r', label: 'promień' },
            { value: 'ie', label: 'energia jonizacji' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Pierwiastki ułożone są według <strong>liczby atomowej</strong>. Numer okresu to liczba powłok elektronowych,
            a w grupach głównych numer grupy mówi o liczbie elektronów walencyjnych – dlatego pierwiastki z jednej grupy
            reagują podobnie.
          </p>
          <p>
            Przełącz widok na elektroujemność, promień lub energię jonizacji: kolory układają się w wyraźne pasy.
            Kliknij dowolny pierwiastek, żeby zobaczyć jego dane.
          </p>
        </>
      ),
    },
    {
      title: 'Okresowość właściwości',
      kind: '2d',
      scene: TrendScene,
      controls: [
        {
          type: 'select',
          key: 'prop',
          label: 'Właściwość',
          default: 'ie',
          options: [
            { value: 'ie', label: 'energia jonizacji' },
            { value: 'r', label: 'promień' },
            { value: 'en', label: 'elektroujemność' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Na wykresie od Z widać <strong>okresowość</strong>: w każdym okresie energia jonizacji rośnie od metalu
            alkalicznego do gazu szlachetnego, a potem gwałtownie spada – zaczyna się nowa powłoka.
          </p>
          <p>
            Promień zmienia się odwrotnie. W okresie rośnie ładunek jądra, które mocniej przyciąga elektrony tej samej
            powłoki, więc atom się kurczy. W nowym okresie dochodzi powłoka i atom „puchnie”.
          </p>
        </>
      ),
    },
  ],
};
