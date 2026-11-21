/*
 * ECAM w stylu Airbusa A350 (SVG, niezależny od sceny 3D): u góry EWD – tryb ciągu, dwa wskaźniki THR/N1 i dwa EGT,
 * pod nim wybrana strona SD (ENG, WHEEL, F/CTL, FUEL, CRUISE, APU, DOOR, ELEC), na dole stały pasek: TAT/SAT/ISA, czas lotu i zegar, masa,
 * środek ciężkości i paliwo. Tak jak w samolocie: jasne kolory na czarnym tle, liczby zielone, opisy białe/błękitne.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useCockpitPref } from '../ui';
import { AIRBUS, cockpitFont } from './common';

export type EcamPage = 'ENG' | 'WHEEL' | 'FCTL' | 'CRUISE' | 'FUEL' | 'APU' | 'DOOR' | 'ELEC';
type Pair = [number, number];

export interface EcamEngine {
  /** Przepływ paliwa (kg/h). */
  ff: number;
  /** Obroty wałów pośredniego i wysokiego ciśnienia (%) – Trent XWB ma trzy wały: N1, N2, N3. */
  n2: number;
  n3: number;
  oilQ: number;
  oilT: number;
  oilP: number;
  /** Drgania na wałach N1, N2, N3. */
  vib: [number, number, number];
  /** Temperatura gondoli (°C). */
  nac?: number;
}

export interface EcamProps {
  /** Tryb ciągu i jego granica (%), np. ['CLB', 98]. */
  thrMode?: [string, number] | null;
  /** Ciąg (% maksymalnego) obu silników – bez podania liczony z N1 (bieg jałowy: N1 ≈ 20%, THR ≈ 2,6%). */
  thr?: Pair;
  /** N1 (%) obu silników i EGT (°C). */
  n1: Pair;
  /** Odwracacz ciągu obu silników 0…1: na wskaźniku N1 napis REV – bursztynowy w czasie ruchu, zielony po pełnym otwarciu. */
  rev?: Pair;
  egt: Pair;
  /** Czerwona granica EGT. */
  egtLimit?: number;
  /** Komunikaty pod wskaźnikami (np. ostrzeżenia, lista do startu): [tekst, kolor]. */
  memo?: [string, string][];
  /**
   * Alarm ECAM z procedurą: czerwony (lub bursztynowy) tytuł, pod nim niebieskie polecenia do wykonania –
   * wykonane znikają. `master` – migający napis MASTER WARN. Pasek wsuwa się między EWD a stronę SD.
   */
  warning?: { title: string; color?: string; lines: string[]; master?: boolean } | null;
  page?: EcamPage | null;
  eng?: [EcamEngine, EcamEngine];
  /** Strona WHEEL: temperatury hamulców i ciśnienia opon (po 12 kół, A350-1000: dwa wózki po 6), skręt kołem przednim. */
  /**
   * Strona WHEEL: temperatury hamulców i ciśnienia opon (po 12 kół, A350-1000: dwa wózki po 6), skręt kołem
   * przednim, hamulec postojowy; gear – wskaźniki podwozia: zielone trójkąty (wypuszczone i zablokowane),
   * czerwone (w ruchu), brak (schowane i zablokowane).
   */
  wheel?: { brakeT: number[]; tyre: number[]; steer?: boolean; parkBrk?: boolean; gear?: 'down' | 'transit' | 'up'; /** Ciśnienie w akumulatorach hamulców Y i G (×1000 PSI). */ accu?: Pair };
  /** Strona F/CTL: wychylenia (°) 7 spojlerów na skrzydło (od kadłuba), lotek, steru wysokości i kierunku, trymer. */
  fctl?: { spL: number[]; spR: number[]; ailL: number; ailR: number; elev: number; rudder: number; pitchTrim: number; slat?: number; flap?: number; conf?: string };
  /** Strona FUEL: ilość paliwa (kg) w zbiornikach lewym, centralnym i prawym, ich pojemności i paliwo zużyte przez silniki. */
  fuel?: {
    l: number;
    c: number;
    r: number;
    lMax: number;
    cMax: number;
    rMax: number;
    /** Paliwo zużyte przez silniki 1 i 2 (kg). */
    fu?: Pair;
    /** Paliwo na starcie bloku (kg) – do bilansu (FOB + FU) − BLOCK; bez podania bilans = 0. */
    block?: number;
    /** Pompy włączone (zielone przewody) – bez podania tak. */
    pumps?: boolean;
    /** Temperatura paliwa w zbiornikach skrzydłowych (°C). */
    temps?: Pair;
    /** Przepływ paliwa do wszystkich silników (kg/min). */
    allFf?: number;
  };
  /** Strona CRUISE: przepływ i zużycie paliwa, ciśnienie w kabinie, temperatury stref. */
  cruise?: { ff: Pair; fu: Pair; deltaP: number; cabAlt: number; cabVs: number; ldgElev?: number; temps?: [number, number, number] };
  /**
   * Strona APU: obroty N (%), EGT (°C) z czerwoną granicą, prądnica (włączona, obciążenie %, napięcie, częstotliwość),
   * upust powietrza (zawór, ciśnienie PSI), klapa wlotu, AVAIL i ostrzeżenia (niski poziom oleju, niskie ciśnienie paliwa).
   */
  apu?: {
    n: number;
    egt: number;
    egtLimit: number;
    avail: boolean;
    flapOpen: boolean;
    gen: { on: boolean; load: number; v: number; hz: number };
    bleed: { open: boolean; psi: number };
    fuelUsed?: number;
    lowOil?: boolean;
    fault?: string | null;
  };
  /** Strona DOOR: drzwi pasażerskie (1L…4L, potem 1R…4R) otwarte i uzbrojone; ładownie [przednia, tylna, bagaż luzem]. */
  door?: { open: boolean[]; armed: boolean[]; cargo: boolean[] };
  /** Strona ELEC: generatory 1A, 1B, 2A, 2B (i ich awarie), APU GEN, EXT, RAT, akumulatory, szyny, odciążenie kuchni. */
  elec?: { gen: boolean[]; genFault?: boolean[]; apu: boolean; ext: boolean; rat: boolean; bat: boolean; bus: { ac1: boolean; ac2: boolean; acEss: boolean; dc1: boolean; dc2: boolean; dcEss: boolean }; shed?: boolean };
  /** Dolny pasek. */
  /** time – ignorowany: zegar zawsze pokazuje bieżący czas. */
  footer?: { tat: number; sat: number; isa: number; flt?: string; time?: string; gw?: number; gwcg?: number; fob?: number };
  width?: number;
}

/**
 * Ciąg w % maksymalnego z obrotów wentylatora N1 – jak na wskaźniku THR w A350: na biegu jałowym (N1 ok. 20%)
 * ok. 2,6%, przy rozkręcaniu silnika proporcjonalnie mniej, przy N1 = 100% – 100%.
 */
export const thrFromN1 = (n1: number) => (n1 <= 0 ? 0 : n1 < 20 ? (2.6 * n1) / 20 : Math.min(100, 2.6 + 97.4 * Math.pow((n1 - 20) / 80, 1.6)));

const W = 360;
const H = 480;
const SEP = 168; // granica EWD / SD
const FOOT = 420; // początek dolnego paska

const T = ({ x, y, c = AIRBUS.white, s = 11, a = 'start', w = 400, children }: { x: number; y: number; c?: string; s?: number; a?: 'start' | 'middle' | 'end'; w?: number; children: ReactNode }) => (
  <text x={x} y={y} fill={c} fontSize={s} textAnchor={a} fontWeight={w}>
    {children}
  </text>
);
const f0 = (v: number) => Math.round(v).toString();
const f1 = (v: number) => v.toFixed(1);

/** Łuk wskaźnika: wartość 0…max na kąt (stopnie, 0 = w prawo, rośnie zgodnie z ruchem wskazówek). */
function arcPt(cx: number, cy: number, r: number, deg: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
}
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = arcPt(cx, cy, r, a0);
  const [x1, y1] = arcPt(cx, cy, r, a1);
  return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`;
}

/** Wskaźnik THR/N1: łuk 0–10 (×10%), zielona wskazówka N1, niebieska kreska celu ciągu, okienko THR. */
function ThrDial({ cx, cy, thr, n1, rev = 0 }: { cx: number; cy: number; thr: number; n1: number; rev?: number }) {
  const r = 38;
  const A0 = 150;
  const A1 = 360;
  const ang = (v: number) => A0 + ((A1 - A0) * Math.max(0, Math.min(110, v))) / 110;
  const [nx, ny] = arcPt(cx, cy, r - 4, ang(n1));
  const [tx0, ty0] = arcPt(cx, cy, r - 3, ang(thr));
  const [tx1, ty1] = arcPt(cx, cy, r + 6, ang(thr));
  return (
    <g>
      <path d={arcPath(cx, cy, r, A0, ang(100))} fill="none" stroke={AIRBUS.white} strokeWidth={2} />
      <path d={arcPath(cx, cy, r, ang(100), A1)} fill="none" stroke={AIRBUS.red} strokeWidth={3} />
      {[0, 50, 100].map((v) => {
        const [a, b] = arcPt(cx, cy, r, ang(v));
        const [c, d] = arcPt(cx, cy, r - 7, ang(v));
        const [lx, ly] = arcPt(cx, cy, r - 15, ang(v));
        return (
          <g key={v}>
            <line x1={a} y1={b} x2={c} y2={d} stroke={AIRBUS.white} strokeWidth={1.6} />
            <T x={lx} y={ly + 4} s={10} a="middle">
              {v / 10}
            </T>
          </g>
        );
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={AIRBUS.green} strokeWidth={2.4} strokeLinecap="round" />
      <line x1={tx0} y1={ty0} x2={tx1} y2={ty1} stroke={AIRBUS.cyan} strokeWidth={2.4} />
      {rev > 0.01 && (
        <g>
          <rect x={cx - 19} y={cy - 27} width={38} height={16} fill={AIRBUS.bg} stroke={rev >= 0.99 ? AIRBUS.green : AIRBUS.amber} strokeWidth={1.2} />
          <T x={cx} y={cy - 14.5} c={rev >= 0.99 ? AIRBUS.green : AIRBUS.amber} s={12} a="middle" w={700}>
            REV
          </T>
        </g>
      )}
      <rect x={cx + 2} y={cy + 4} width={40} height={17} fill="none" stroke={AIRBUS.white} strokeWidth={1} />
      <T x={cx + 39} y={cy + 17} c={AIRBUS.green} s={13} a="end">
        {f1(thr)}
      </T>
    </g>
  );
}

/** Mały wskaźnik EGT z okienkiem wartości i czerwoną granicą. */
function EgtDial({ cx, cy, v, limit }: { cx: number; cy: number; v: number; limit: number }) {
  const r = 24;
  const A0 = 180;
  const A1 = 330;
  const max = limit * 1.12;
  const ang = (x: number) => A0 + ((A1 - A0) * Math.max(0, Math.min(max, x))) / max;
  const [nx, ny] = arcPt(cx, cy, r - 3, ang(v));
  const hot = v > limit;
  return (
    <g>
      <path d={arcPath(cx, cy, r, A0, ang(limit))} fill="none" stroke={AIRBUS.white} strokeWidth={1.8} />
      <path d={arcPath(cx, cy, r, ang(limit), A1)} fill="none" stroke={AIRBUS.red} strokeWidth={3} />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={hot ? AIRBUS.red : AIRBUS.green} strokeWidth={2.2} strokeLinecap="round" />
      <rect x={cx - 18} y={cy + 6} width={36} height={17} fill="none" stroke={AIRBUS.white} strokeWidth={1} />
      <T x={cx} y={cy + 19} c={hot ? AIRBUS.red : AIRBUS.green} s={13} a="middle">
        {f0(v)}
      </T>
    </g>
  );
}

/**
 * Strona APU (jak w Airbusie): u góry prądnica APU (obciążenie, napięcie, częstotliwość) i upust powietrza (ciśnienie,
 * zawór – kreska w osi przewodu: otwarty, w poprzek: zamknięty), pośrodku napis AVAIL, niżej wskaźniki N i EGT,
 * na dole stan klapy wlotu i ostrzeżenia.
 */
function PageApu({ a }: { a: NonNullable<EcamProps['apu']> }) {
  const y0 = SEP;
  const dial = (cx: number, cy: number, v: number, max: number, red: number, label: string, unit: string, txt: string) => {
    const r = 32;
    const A0 = 160;
    const A1 = 380;
    const ang = (x: number) => A0 + ((A1 - A0) * Math.max(0, Math.min(max, x))) / max;
    const [nx, ny] = arcPt(cx, cy, r - 4, ang(v));
    const hot = v >= red;
    const ticks = label === 'N' ? [0, 50, 100] : [0, 500, 1000];
    return (
      <g>
        <path d={arcPath(cx, cy, r, A0, ang(red))} fill="none" stroke={AIRBUS.white} strokeWidth={2} />
        <path d={arcPath(cx, cy, r, ang(red), A1)} fill="none" stroke={AIRBUS.red} strokeWidth={3.2} />
        {ticks.map((t) => {
          const [p, q] = arcPt(cx, cy, r, ang(t));
          const [p2, q2] = arcPt(cx, cy, r - 6, ang(t));
          const [lx, ly] = arcPt(cx, cy, r - 14, ang(t));
          return (
            <g key={t}>
              <line x1={p} y1={q} x2={p2} y2={q2} stroke={AIRBUS.white} strokeWidth={1.4} />
              <T x={lx} y={ly + 3} s={8} a="middle">
                {label === 'N' ? t / 10 : t / 100}
              </T>
            </g>
          );
        })}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={hot ? AIRBUS.red : AIRBUS.green} strokeWidth={2.4} strokeLinecap="round" />
        <T x={cx - 52} y={cy - 18} s={12}>
          {label}
        </T>
        <T x={cx - 52} y={cy - 6} c={AIRBUS.cyan} s={9}>
          {unit}
        </T>
        <rect x={cx + 4} y={cy + 6} width={44} height={17} fill="none" stroke={AIRBUS.white} strokeWidth={1} />
        <T x={cx + 45} y={cy + 19} c={hot ? AIRBUS.red : AIRBUS.green} s={13} a="end">
          {txt}
        </T>
      </g>
    );
  };
  const g = a.gen;
  const genCol = g.on ? AIRBUS.green : AIRBUS.white;
  return (
    <g>
      <T x={180} y={y0 + 16} s={13} a="middle" w={700}>
        APU
      </T>
      {/* prądnica */}
      <rect x={20} y={y0 + 24} width={112} height={62} fill="none" stroke={g.on ? AIRBUS.white : AIRBUS.amber} strokeWidth={1.2} />
      <T x={76} y={y0 + 38} c={g.on ? AIRBUS.white : AIRBUS.amber} s={11} a="middle">
        APU GEN
      </T>
      {(
        [
          [g.on ? f0(g.load) : 'XX', '%'],
          [g.on ? f0(g.v) : 'XX', 'V'],
          [g.on ? f0(g.hz) : 'XX', 'HZ'],
        ] as const
      ).map(([v, u], i) => (
        <g key={u}>
          <T x={98} y={y0 + 54 + i * 13} c={genCol} s={12} a="end">
            {v}
          </T>
          <T x={104} y={y0 + 54 + i * 13} c={AIRBUS.cyan} s={9}>
            {u}
          </T>
        </g>
      ))}
      {/* upust powietrza */}
      <T x={262} y={y0 + 38} s={11} a="middle">
        APU BLEED
      </T>
      <rect x={232} y={y0 + 44} width={60} height={18} fill="none" stroke={AIRBUS.white} strokeWidth={1} />
      <T x={276} y={y0 + 57} c={AIRBUS.green} s={12} a="end">
        {a.n > 5 ? f0(a.bleed.psi) : 'XX'}
      </T>
      <T x={280} y={y0 + 57} c={AIRBUS.cyan} s={9}>
        PSI
      </T>
      <line x1={262} x2={262} y1={y0 + 62} y2={y0 + 74} stroke={AIRBUS.green} strokeWidth={1.6} />
      <circle cx={262} cy={y0 + 84} r={10} fill="none" stroke={AIRBUS.green} strokeWidth={1.6} />
      <line x1={a.bleed.open ? 262 : 252} x2={a.bleed.open ? 262 : 272} y1={a.bleed.open ? y0 + 74 : y0 + 84} y2={a.bleed.open ? y0 + 94 : y0 + 84} stroke={AIRBUS.green} strokeWidth={1.8} />
      {a.bleed.open && <line x1={262} x2={262} y1={y0 + 94} y2={y0 + 104} stroke={AIRBUS.green} strokeWidth={1.6} />}
      {a.avail && (
        <T x={180} y={y0 + 66} c={AIRBUS.green} s={14} a="middle" w={700}>
          AVAIL
        </T>
      )}
      {dial(96, y0 + 140, a.n, 120, 107, 'N', '%', a.n > 0.5 ? f0(a.n) : 'XX')}
      {dial(96, y0 + 206, a.egt, 1200, a.egtLimit, 'EGT', '°C', a.n > 0.5 || a.egt > 40 ? f0(a.egt) : 'XX')}
      <T x={206} y={y0 + 140} s={10}>
        FLAP
      </T>
      <T x={250} y={y0 + 140} c={AIRBUS.green} s={11}>
        {a.flapOpen ? 'OPEN' : 'CLOSED'}
      </T>
      {a.fuelUsed !== undefined && (
        <g>
          <T x={206} y={y0 + 160} s={10}>
            FUEL USED
          </T>
          <T x={326} y={y0 + 174} c={AIRBUS.green} s={12} a="end">
            {f0(a.fuelUsed)}
          </T>
          <T x={330} y={y0 + 174} c={AIRBUS.cyan} s={9}>
            KG
          </T>
        </g>
      )}
      {a.lowOil && (
        <T x={206} y={y0 + 196} c={AIRBUS.amber} s={11}>
          LOW OIL PR
        </T>
      )}
      {a.fault && (
        <T x={206} y={y0 + 214} c={AIRBUS.amber} s={11}>
          {a.fault}
        </T>
      )}
    </g>
  );
}

/** Strona ENG: paliwo, obroty N2/N3, olej, drgania, temperatura gondoli. */
function PageEng({ eng }: { eng: [EcamEngine, EcamEngine] }) {
  const [L, R] = eng;
  const row = (y: number, label: string, unit: string, a: string, b: string, warnA = false, warnB = false) => (
    <g key={label + y}>
      <T x={92} y={y} c={warnA ? AIRBUS.amber : AIRBUS.green} s={14} a="end">
        {a}
      </T>
      <line x1={110} x2={128} y1={y - 4} y2={y - 4} stroke={AIRBUS.white} strokeWidth={1} />
      <T x={180} y={y - 2} s={11} a="middle">
        {label}
      </T>
      {unit && (
        <T x={180} y={y + 10} c={AIRBUS.cyan} s={9} a="middle">
          {unit}
        </T>
      )}
      <line x1={232} x2={250} y1={y - 4} y2={y - 4} stroke={AIRBUS.white} strokeWidth={1} />
      <T x={300} y={y} c={warnB ? AIRBUS.amber : AIRBUS.green} s={14} a="end">
        {b}
      </T>
    </g>
  );
  return (
    <g>
      {row(SEP + 34, 'FF', 'KG/H', f0(L.ff), f0(R.ff))}
      {row(SEP + 62, 'N2', '%', f1(L.n2), f1(R.n2))}
      {row(SEP + 86, 'N3', '%', f1(L.n3), f1(R.n3))}
      {row(SEP + 118, 'OIL', 'QT', f1(L.oilQ), f1(R.oilQ), L.oilQ < 4, R.oilQ < 4)}
      {row(SEP + 142, '°C', '', f0(L.oilT), f0(R.oilT), L.oilT > 155, R.oilT > 155)}
      {row(SEP + 166, 'PSI', '', f0(L.oilP), f0(R.oilP), L.oilP < 13, R.oilP < 13)}
      <T x={180} y={SEP + 192} s={11} a="middle">
        VIB
      </T>
      {(['N1', 'N2', 'N3'] as const).map((k, i) => (
        <g key={k}>
          <T x={92} y={SEP + 208 + i * 14} c={L.vib[i] > 4 ? AIRBUS.amber : AIRBUS.green} s={12} a="end">
            {f1(L.vib[i])}
          </T>
          <T x={180} y={SEP + 208 + i * 14} s={10} a="middle">
            {k}
          </T>
          <T x={300} y={SEP + 208 + i * 14} c={R.vib[i] > 4 ? AIRBUS.amber : AIRBUS.green} s={12} a="end">
            {f1(R.vib[i])}
          </T>
        </g>
      ))}
    </g>
  );
}

/** Strona WHEEL: dwa wózki podwozia głównego po 6 kół – temperatury hamulców i ciśnienia opon, koło przednie. */
function PageWheel({ wheel }: { wheel: NonNullable<EcamProps['wheel']> }) {
  const y0 = SEP;
  const G = AIRBUS.green;
  const W = AIRBUS.white;
  const C = AIRBUS.cyan;
  const gearC = wheel.gear === 'transit' ? AIRBUS.red : G;
  const showGear = wheel.gear !== 'up';
  /** Wskaźnik goleni: trójkąt (zielony – wypuszczona i zablokowana, czerwony – w ruchu) i drzwi wnęki nad nim. */
  const gearSym = (cx: number, cy: number, k: string) => (
    <g key={k}>
      <path d={`M${cx - 18},${cy - 8} h36`} stroke={W} strokeWidth={1.4} />
      <path d={`M${cx - 12},${cy - 12} v8 M${cx + 12},${cy - 12} v8`} stroke={W} strokeWidth={1.4} />
      {showGear && (
        <g>
          <path d={`M${cx - 11},${cy - 2} h22 l-11,14 z`} fill={wheel.gear === 'down' ? gearC : 'none'} stroke={gearC} strokeWidth={1.4} />
          {wheel.gear === 'down' && [-6, 0, 6].map((d) => <line key={d} x1={cx + d - 2} x2={cx + d + 2} y1={cy} y2={cy + 6} stroke="#0b2d14" strokeWidth={1} />)}
        </g>
      )}
    </g>
  );
  const axY = [y0 + 104, y0 + 142, y0 + 180];
  /** Wózek z trzema osiami (A350-1000): belka, osie, po dwa koła; przy każdym kole temperatura hamulca i ciśnienie w oponie. */
  const bogie = (cx: number, first: number, side: -1 | 1) => (
    <g key={cx}>
      <line x1={cx} x2={cx} y1={axY[0] - 8} y2={axY[2] + 8} stroke={G} strokeWidth={2} />
      {axY.map((y, row) => (
        <g key={row}>
          <line x1={cx - 22} x2={cx + 22} y1={y} y2={y} stroke={G} strokeWidth={1.6} />
          {[-1, 1].map((d, col) => {
            // numer koła: zewnętrzne pierwsze (po lewej stronie samolotu lewe, po prawej – prawe)
            const outer = d === side;
            const i = first + row * 2 + (outer ? 0 : 1);
            const x = cx + d * 22;
            const t = wheel.brakeT[i] ?? 0;
            const hot = t > 300;
            const tx = x + d * 12;
            return (
              <g key={col}>
                <rect x={x - 6} y={y - 9} width={12} height={18} rx={3} fill="#05070a" stroke={G} strokeWidth={1.4} />
                <T x={x} y={y + 3.5} s={8} a="middle">
                  {i + 1}
                </T>
                <T x={tx} y={y - 1} c={hot ? AIRBUS.amber : G} s={11} a={d < 0 ? 'end' : 'start'}>
                  {f0(t)}
                </T>
                <T x={tx} y={y + 11} c={G} s={9} a={d < 0 ? 'end' : 'start'}>
                  {f0(wheel.tyre[i] ?? 0)}
                </T>
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
  const accu = wheel.accu ?? [3.5, 3.5];
  /** Wskaźnik ciśnienia w akumulatorze hamulców (×1000 PSI, 0–5). */
  const accuDial = (cy: number, v: number, label: string) => {
    const cx = 300;
    const r = 22;
    const A0 = 200;
    const A1 = 340;
    const ang = (x: number) => A0 + ((A1 - A0) * Math.max(0, Math.min(5, x))) / 5;
    const [nx, ny] = arcPt(cx, cy, r - 3, ang(v));
    return (
      <g>
        <path d={arcPath(cx, cy, r, A0, A1)} fill="none" stroke={W} strokeWidth={1.4} />
        <path d={arcPath(cx, cy, r, ang(3), A1)} fill="none" stroke={G} strokeWidth={3} />
        <path d={arcPath(cx, cy, r, A0, ang(1))} fill="none" stroke={AIRBUS.amber} strokeWidth={3} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={G} strokeWidth={2.2} strokeLinecap="round" />
        <T x={cx - r - 6} y={cy + 4} s={9} a="end">
          0
        </T>
        <T x={cx + r + 6} y={cy + 4} s={9}>
          5
        </T>
        <T x={cx} y={cy + 14} s={9} a="middle">
          {label}
        </T>
        <T x={cx} y={cy - r - 3} c={G} s={9} a="middle">
          {v.toFixed(1)}
        </T>
      </g>
    );
  };
  const brkMode = (y: number, label: string) => (
    <g>
      <T x={300} y={y} s={9} a="middle">
        {label}
      </T>
      <rect x={246} y={y + 4} width={34} height={13} fill="none" stroke={G} strokeWidth={1.2} />
      <T x={263} y={y + 14} c={G} s={9} a="middle">
        NORM
      </T>
      <T x={300} y={y + 14} s={9} a="middle">
        ALTN
      </T>
      <T x={336} y={y + 14} s={9} a="middle">
        EMER
      </T>
    </g>
  );
  return (
    <g>
      <rect x={8} y={y0 + 6} width={56} height={18} fill="none" stroke={C} strokeWidth={1.2} />
      <T x={36} y={y0 + 19} s={12} a="middle" w={700}>
        WHEEL
      </T>
      {/* golenie: przednia i dwie główne */}
      {gearSym(120, y0 + 30, 'n')}
      <T x={120} y={y0 + 58} c={wheel.steer === false ? AIRBUS.amber : G} s={9} a="middle">
        N/W STEER
      </T>
      {gearSym(56, y0 + 74, 'l')}
      {gearSym(184, y0 + 74, 'r')}
      {/* wózki: lewy (koła 1–6) i prawy (7–12) */}
      {bogie(56, 0, -1)}
      {bogie(184, 6, 1)}
      <T x={120} y={axY[0] + 3} c={C} s={9} a="middle">
        °C
      </T>
      <T x={120} y={axY[2] + 3} c={C} s={9} a="middle">
        PSI
      </T>
      <T x={120} y={y0 + 214} c={wheel.parkBrk ? G : W} s={10} a="middle">
        {wheel.parkBrk ? 'PARK BRK ON' : 'A-SKID'}
      </T>
      {/* sterowanie hamulcami i kołem przednim, tryby hamowania i akumulatory */}
      <line x1={240} x2={240} y1={y0 + 8} y2={y0 + 244} stroke={W} strokeWidth={1} />
      <T x={248} y={y0 + 20} s={9}>
        BRK CTL
      </T>
      <T x={248} y={y0 + 36} s={9}>
        STEER CTL
      </T>
      {[0, 1].map((k) => (
        <g key={k}>
          <rect x={318 + k * 16} y={y0 + 11} width={12} height={12} fill="none" stroke={G} strokeWidth={1} />
          <T x={324 + k * 16} y={y0 + 20.5} c={G} s={9} a="middle">
            {k + 1}
          </T>
          <rect x={318 + k * 16} y={y0 + 27} width={12} height={12} fill="none" stroke={G} strokeWidth={1} />
          <T x={324 + k * 16} y={y0 + 36.5} c={G} s={9} a="middle">
            {k + 1}
          </T>
        </g>
      ))}
      {brkMode(y0 + 56, 'Y BRK MODE')}
      {accuDial(y0 + 108, accu[0], 'Y ACCU')}
      {accuDial(y0 + 162, accu[1], 'G ACCU')}
      {brkMode(y0 + 196, 'G BRK MODE')}
    </g>
  );
}

/**
 * Strona F/CTL jak w A350: samolot widziany od tyłu. U góry statecznik pionowy z belką steru kierunku (wskaźnik
 * położenia i trymer) i statecznik poziomy ze słupkami sterów wysokości, pod nim skala trymera statecznika (PITCH
 * TRIM). Na dole skrzydła ze wzniosem i silnikami: na końcówkach po dwie lotki (szare słupki, zielone wypełnienie
 * od położenia neutralnego w górę albo w dół), na skrzydle po siedem spojlerów (słupek rośnie z wychyleniem,
 * na szczycie zielony znacznik). Klapy i sloty – mały wskaźnik w prawym górnym rogu.
 */
function PageFctl({ f }: { f: NonNullable<EcamProps['fctl']> }) {
  const GREEN = AIRBUS.green;
  const WHITE = AIRBUS.white;
  const cx = 180;
  const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
  /**
   * Pionowa skala z zielonym trójkątnym wskaźnikiem (jak na ECAM Airbusa): kreski na końcach i w zerze, wskaźnik
   * po stronie `side` (−1 – po lewej, 1 – po prawej). val – wychylenie (°, dodatnie w dół), max – pełny zakres.
   */
  const vscale = (x: number, yc: number, h: number, val: number, max: number, side: -1 | 1, hyd: string, key: string) => {
    const y = yc + clamp1(val / max) * (h / 2);
    const tx = x + side * 4;
    return (
      <g key={key}>
        <line x1={x} x2={x} y1={yc - h / 2} y2={yc + h / 2} stroke={WHITE} strokeWidth={1.2} />
        {[-1, -0.5, 0, 0.5, 1].map((k) => (
          <line key={k} x1={x} x2={x - side * (k === 0 ? 7 : 4)} y1={yc + (k * h) / 2} y2={yc + (k * h) / 2} stroke={WHITE} strokeWidth={k === 0 ? 1.4 : 1} />
        ))}
        <path d={`M${tx},${y} l${side * 9},-5 v10 z`} fill={GREEN} />
        <T x={x - side * 3} y={yc + h / 2 + 12} c={GREEN} s={8} a="middle">
          {hyd}
        </T>
      </g>
    );
  };
  // ---- skrzydła od tyłu (wznios), spojlery 1–7 od kadłuba, lotki na końcach ----
  const rootY = SEP + 92;
  const tipY = SEP + 76;
  const wingY = (x: number) => {
    const d = Math.abs(x - cx);
    return d < 24 ? rootY : rootY - ((d - 24) / (cx - 24 - 30)) * (rootY - tipY);
  };
  const spX = [34, 46, 70, 82, 94, 106, 118];
  const spoiler = (x: number, deg: number, n: number) => {
    const yw = wingY(x);
    const up = Math.max(0, deg);
    const len = Math.min(1, up / 45) * 22;
    return (
      <g key={`${x}`}>
        {len < 1.5 ? (
          <line x1={x - 4} x2={x + 4} y1={yw - 3} y2={yw - 3} stroke={GREEN} strokeWidth={2} />
        ) : (
          <g>
            <line x1={x} x2={x} y1={yw - 3} y2={yw - 3 - len} stroke={GREEN} strokeWidth={2} />
            <path d={`M${x - 4},${yw - 3 - len + 5} L${x},${yw - 3 - len} L${x + 4},${yw - 3 - len + 5}`} fill="none" stroke={GREEN} strokeWidth={1.6} />
          </g>
        )}
        <T x={x} y={yw + 11} c={WHITE} s={8} a="middle">
          {n}
        </T>
      </g>
    );
  };
  const speedBrake = f.spL.every((v) => v > 2) && f.spR.every((v) => v > 2);
  // ---- usterzenie ----
  const elevY = SEP + 180;
  const rudCy = SEP + 160;
  const rudR = 34;
  const rudA = clamp1(f.rudder / 30) * 50; // ° na łuku
  const ra = ((90 + rudA) * Math.PI) / 180;
  return (
    <g>
      <T x={14} y={SEP + 22} s={13} w={700}>
        F/CTL
      </T>
      <line x1={14} x2={56} y1={SEP + 26} y2={SEP + 26} stroke={WHITE} strokeWidth={1} />
      {speedBrake && (
        <T x={cx} y={SEP + 22} c={GREEN} s={11} a="middle" w={700}>
          SPD BRK
        </T>
      )}
      {/* klapy i sloty (konfiguracja) */}
      {f.conf !== undefined && (
        <g>
          <T x={250} y={SEP + 22} c={AIRBUS.cyan} s={10}>
            S
          </T>
          <rect x={260} y={SEP + 14} width={30} height={9} fill="none" stroke={WHITE} strokeWidth={1} />
          <rect x={260} y={SEP + 14} width={30 * (f.slat ?? 0)} height={9} fill={GREEN} />
          <rect x={294} y={SEP + 14} width={30} height={9} fill="none" stroke={WHITE} strokeWidth={1} />
          <rect x={294} y={SEP + 14} width={30 * (f.flap ?? 0)} height={9} fill={GREEN} />
          <T x={332} y={SEP + 22} c={AIRBUS.cyan} s={10}>
            F
          </T>
          <T x={292} y={SEP + 36} c={GREEN} s={11} a="middle">
            {f.conf}
          </T>
        </g>
      )}
      {/* skrzydła i spojlery */}
      <path d={`M30,${tipY} L${cx - 24},${rootY} Q${cx},${rootY + 10} ${cx + 24},${rootY} L330,${tipY}`} fill="none" stroke={WHITE} strokeWidth={1.4} />
      {f.spL.map((d, i) => spoiler(cx - 24 - spX[i] + 22, d, i + 1))}
      {f.spR.map((d, i) => spoiler(cx + 24 + spX[i] - 22, d, i + 1))}
      <T x={cx} y={rootY - 14} s={9} a="middle">
        SPLR
      </T>
      {/* lotki: po dwie na skrzydło (wewnętrzna i zewnętrzna), wskaźnik – wychylenie w dół rośnie w dół skali */}
      <T x={24} y={tipY - 34} s={9} a="middle">
        L AIL
      </T>
      <T x={336} y={tipY - 34} s={9} a="middle">
        R AIL
      </T>
      {vscale(18, tipY + 10, 54, f.ailL, 25, 1, 'G', 'al1')}
      {vscale(42, tipY + 14, 46, f.ailL, 25, 1, 'Y', 'al2')}
      {vscale(318, tipY + 14, 46, f.ailR, 25, -1, 'G', 'ar2')}
      {vscale(342, tipY + 10, 54, f.ailR, 25, -1, 'Y', 'ar1')}
      {/* stery wysokości */}
      <T x={76} y={elevY - 40} s={9} a="middle">
        L ELEV
      </T>
      <T x={284} y={elevY - 40} s={9} a="middle">
        R ELEV
      </T>
      {vscale(76, elevY, 58, f.elev, 25, 1, 'G Y', 'el')}
      {vscale(284, elevY, 58, f.elev, 25, -1, 'G Y', 'er')}
      {/* ster kierunku: łuk z zielonym wskaźnikiem od osi */}
      <T x={cx} y={rudCy - 9} s={9} a="middle">
        RUD
      </T>
      <path d={arcPath(cx, rudCy, rudR, 90 - 52, 90 + 52)} fill="none" stroke={WHITE} strokeWidth={1.3} />
      {[-50, -25, 0, 25, 50].map((a) => {
        const [x0, y0] = arcPt(cx, rudCy, rudR, 90 + a);
        const [x1, y1] = arcPt(cx, rudCy, rudR + (a === 0 ? 7 : 4), 90 + a);
        return <line key={a} x1={x0} y1={y0} x2={x1} y2={y1} stroke={WHITE} strokeWidth={a === 0 ? 1.4 : 1} />;
      })}
      <line x1={cx} y1={rudCy} x2={cx + Math.cos(ra) * (rudR - 3)} y2={rudCy + Math.sin(ra) * (rudR - 3)} stroke={GREEN} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={cx} cy={rudCy} r={4} fill="#3a4047" stroke={WHITE} strokeWidth={1} />
      <T x={cx} y={rudCy + rudR + 12} c={GREEN} s={8} a="middle">
        G B Y
      </T>
      <T x={cx - 44} y={rudCy - 4} s={8} a="end">
        RUD TRIM
      </T>
      <T x={cx - 44} y={rudCy + 8} c={AIRBUS.cyan} s={10} a="end">
        L 0.0°
      </T>
      {/* trymer statecznika poziomego */}
      <T x={cx + 44} y={rudCy - 4} s={8}>
        PITCH TRIM
      </T>
      <T x={cx + 44} y={rudCy + 8} c={GREEN} s={11}>
        {f1(Math.abs(f.pitchTrim))}° {f.pitchTrim >= 0 ? 'UP' : 'DN'}
      </T>
    </g>
  );
}

/**
 * Strona FUEL: rzut z góry z trzema zbiornikami A350 (lewy i prawy w skrzydłach, centralny w centropłacie).
 * Każdy zbiornik ma ilość w kg i pasek wypełnienia, pod spodem zasilanie silników, u góry paliwo zużyte (F.USED),
 * na dole całe paliwo na pokładzie (FOB).
 */
function PageFuel({ f }: { f: NonNullable<EcamProps['fuel']> }) {
  const y0 = SEP;
  const G = AIRBUS.green;
  const W = AIRBUS.white;
  const C = AIRBUS.cyan;
  const fu: Pair = f.fu ?? [0, 0];
  const fob = f.l + f.c + f.r;
  const block = f.block ?? fob + fu[0] + fu[1];
  const diff = fob + fu[0] + fu[1] - block;
  const pumps = f.pumps ?? true;
  const temps = f.temps ?? [15, 15];
  const lineC = pumps ? G : AIRBUS.amber;
  // obrys skrzydeł w rzucie od przodu: zbiornik lewy, centralny (pod kadłubem) i prawy
  const base = y0 + 206;
  const tipTop = y0 + 154;
  const rootTop = y0 + 122;
  const ctrTop = y0 + 116;
  const xL = 128;
  const xR = 232;
  const engX: [number, number] = [96, 264];
  const engY = y0 + 76;
  // pompa: kreska wzdłuż przewodu – pracuje, w poprzek – wyłączona (pompy pustego zbiornika centralnego wyłączają się same)
  const pump = (x: number, y: number, k: string, on = pumps) => (
    <g key={k}>
      <rect x={x - 6} y={y - 6} width={12} height={12} fill="none" stroke={on ? G : W} strokeWidth={1.4} />
      {on ? <line x1={x} x2={x} y1={y - 6} y2={y + 6} stroke={G} strokeWidth={1.4} /> : <line x1={x - 6} x2={x + 6} y1={y} y2={y} stroke={W} strokeWidth={1.4} />}
    </g>
  );
  const ctrOn = pumps && f.c > 50;
  const engine = (x: number, n: number) => (
    <g key={n}>
      <defs>
        <linearGradient id={`eng${n}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d949b" />
          <stop offset="0.45" stopColor="#e3e6e9" />
          <stop offset="1" stopColor="#7d848b" />
        </linearGradient>
      </defs>
      <rect x={x - 13} y={engY - 20} width={26} height={36} rx={9} fill={`url(#eng${n})`} />
      <circle cx={x} cy={engY - 4} r={7} fill="none" stroke={G} strokeWidth={1.6} />
      <path d={`M${x - 4},${engY - 2} L${x},${engY - 8} L${x + 4},${engY - 2}`} fill="none" stroke={G} strokeWidth={1.4} />
      <T x={x - 18} y={engY - 4} s={11} a="end" w={700}>
        {n}
      </T>
      <T x={x} y={y0 + 34} s={10} a="middle">
        FU
      </T>
      <T x={x} y={y0 + 47} c={G} s={13} a="middle">
        {f0(fu[n - 1])}
      </T>
    </g>
  );
  // zawór przelewowy (crossfeed): kreska wzdłuż przewodu – otwarty, w poprzek – zamknięty
  const xfeed = (x: number, open: boolean, k: string) => (
    <g key={k}>
      <circle cx={x} cy={y0 + 92} r={8} fill="none" stroke={G} strokeWidth={1.4} />
      <line x1={open ? x - 8 : x} x2={open ? x + 8 : x} y1={open ? y0 + 92 : y0 + 84} y2={open ? y0 + 92 : y0 + 100} stroke={G} strokeWidth={1.6} />
    </g>
  );
  return (
    <g>
      {/* tytuł strony w ramce i bilans paliwa */}
      <rect x={10} y={y0 + 8} width={52} height={20} fill="none" stroke={C} strokeWidth={1.2} />
      <T x={36} y={y0 + 23} s={14} a="middle" w={700}>
        FUEL
      </T>
      <T x={206} y={y0 + 21} s={10} a="middle">
        (FOB + FU) − BLOCK =
      </T>
      <T x={326} y={y0 + 21} c={Math.abs(diff) > 1000 ? AIRBUS.amber : G} s={12} a="end">
        {f0(diff)}
      </T>
      <T x={330} y={y0 + 21} c={C} s={8}>
        KG
      </T>
      {/* zużyte paliwo: każdy silnik i razem */}
      {engine(engX[0], 1)}
      {engine(engX[1], 2)}
      <T x={180} y={y0 + 40} s={10} a="middle">
        FU
      </T>
      <T x={180} y={y0 + 51} s={10} a="middle">
        TOTAL
      </T>
      <T x={180} y={y0 + 64} c={G} s={13} a="middle">
        {f0(fu[0] + fu[1])}
      </T>
      <T x={180} y={y0 + 74} c={C} s={8} a="middle">
        KG
      </T>
      {/* przewody zasilania: pompy zbiornika skrzydłowego → silnik; pompy zbiornika centralnego → oba przewody */}
      <path
        d={`M117,${base - 52} V${y0 + 108} H${engX[0]} V${engY + 16} M243,${base - 52} V${y0 + 108} H${engX[1]} V${engY + 16}${ctrOn ? ` M${xL + 30},${base - 46} V${y0 + 108} H117 M${xR - 30},${base - 46} V${y0 + 108} H243` : ''}`}
        fill="none"
        stroke={lineC}
        strokeWidth={1.4}
      />
      {xfeed(162, false, 'x1')}
      {xfeed(198, false, 'x2')}
      {/* obrys skrzydeł i zbiorników */}
      <path d={`M22,${base} L22,${tipTop} L${xL},${rootTop} L${xL + 6},${ctrTop} L${xR - 6},${ctrTop} L${xR},${rootTop} L338,${tipTop} L338,${base} Z`} fill="none" stroke={W} strokeWidth={1.4} />
      <line x1={xL} x2={xL} y1={rootTop} y2={base} stroke={W} strokeWidth={1.2} />
      <line x1={xR} x2={xR} y1={rootTop} y2={base} stroke={W} strokeWidth={1.2} />
      {/* pompy */}
      {pump(110, base - 46, 'pl1')}
      {pump(124, base - 46, 'pl2')}
      {pump(xL + 30, base - 40, 'pc1', ctrOn)}
      {pump(xR - 30, base - 40, 'pc2', ctrOn)}
      {pump(236, base - 46, 'pr1')}
      {pump(250, base - 46, 'pr2')}
      {/* ilości (kg) */}
      <T x={76} y={base - 14} c={G} s={14} a="middle">
        {f0(f.l)}
      </T>
      <T x={180} y={base - 14} c={G} s={14} a="middle">
        {f0(f.c)}
      </T>
      <T x={284} y={base - 14} c={G} s={14} a="middle">
        {f0(f.r)}
      </T>
      {/* temperatury paliwa w zbiornikach skrzydłowych */}
      <T x={30} y={base - 18} c={G} s={10}>
        {f0(temps[0])}
      </T>
      <T x={28} y={base - 6} c={C} s={8}>
        °C
      </T>
      <T x={330} y={base - 18} c={G} s={10} a="end">
        {f0(temps[1])}
      </T>
      <T x={332} y={base - 6} c={C} s={8} a="end">
        °C
      </T>
      {/* przepływ paliwa do wszystkich silników */}
      <T x={14} y={y0 + 228} s={10}>
        ALL ENG FF
      </T>
      <T x={14} y={y0 + 242} c={G} s={12}>
        {f0(f.allFf ?? 0)}
        <tspan fill={C} fontSize={8}>
          {' '}
          KG/MIN
        </tspan>
      </T>
    </g>
  );
}

/** Strona CRUISE: paliwo, ciśnienie w kabinie, klimatyzacja. */
function PageCruise({ c }: { c: NonNullable<EcamProps['cruise']> }) {
  const temps = c.temps ?? [21, 22, 22];
  return (
    <g>
      <T x={14} y={SEP + 22} s={13} w={700}>
        CRUISE
      </T>
      <T x={14} y={SEP + 44} s={11}>
        FUEL
      </T>
      {(
        [
          [SEP + 66, 'FF', 'KG/H', c.ff],
          [SEP + 92, 'FU', 'KG', c.fu],
        ] as const
      ).map(([y, l, u, v]) => (
        <g key={l}>
          <T x={110} y={y} c={AIRBUS.green} s={14} a="end">
            {f0(v[0])}
          </T>
          <T x={180} y={y - 2} s={11} a="middle">
            {l}
          </T>
          <T x={180} y={y + 9} c={AIRBUS.cyan} s={8} a="middle">
            {u}
          </T>
          <T x={290} y={y} c={AIRBUS.green} s={14} a="end">
            {f0(v[1])}
          </T>
        </g>
      ))}
      <T x={14} y={SEP + 126} s={11}>
        CAB PRESS
      </T>
      <T x={210} y={SEP + 126} s={10}>
        LDG ELEVN
      </T>
      <T x={346} y={SEP + 126} c={AIRBUS.green} s={12} a="end">
        {f0(c.ldgElev ?? 0)} FT
      </T>
      <T x={14} y={SEP + 146} s={10}>
        DELTA P
      </T>
      <T x={150} y={SEP + 146} s={10} a="middle">
        AUTO CAB ALT
      </T>
      <T x={290} y={SEP + 146} s={10} a="middle">
        AUTO CAB V/S
      </T>
      <T x={14} y={SEP + 166} c={AIRBUS.green} s={13}>
        {f1(c.deltaP)} PSI
      </T>
      <T x={150} y={SEP + 166} c={AIRBUS.green} s={13} a="middle">
        {f0(c.cabAlt)} FT
      </T>
      <T x={290} y={SEP + 166} c={AIRBUS.green} s={13} a="middle">
        {f0(c.cabVs)} FT/MIN
      </T>
      <T x={14} y={SEP + 196} s={11}>
        COND
      </T>
      {/* kabina w trzech strefach */}
      <path d={`M60,${SEP + 236} q-6,-22 16,-26 h250 v26 z`} fill="none" stroke={AIRBUS.white} strokeWidth={1.4} />
      <line x1={140} x2={140} y1={SEP + 210} y2={SEP + 236} stroke={AIRBUS.white} strokeWidth={1} />
      <line x1={236} x2={236} y1={SEP + 210} y2={SEP + 236} stroke={AIRBUS.white} strokeWidth={1} />
      {temps.map((t, i) => (
        <T key={i} x={[100, 188, 280][i]} y={SEP + 229} c={AIRBUS.green} s={12} a="middle">
          {f0(t)}
        </T>
      ))}
    </g>
  );
}

/** Bieżący czas (GG:MM:SS), odświeżany co sekundę – zegar w dolnym pasku ECAM zawsze chodzi. */
/**
 * Strona DOOR: obrys kadłuba z góry (nos u góry), drzwi pasażerskie 1L…4L i 1R…4R, drzwi ładowni (prawa burta)
 * i luk bagażu luzem. Zamknięte – zielone, otwarte – bursztynowe z opisem; uzbrojona zjeżdżalnia – napis SLIDE.
 */
function PageDoor({ d }: { d: NonNullable<EcamProps['door']> }) {
  const y0 = SEP;
  const cx = 180;
  const top = y0 + 30;
  const bot = y0 + 238;
  const hw = 30;
  const ys = [y0 + 62, y0 + 104, y0 + 172, y0 + 218];
  const door = (i: number, side: 1 | -1) => {
    const k = side > 0 ? i : 4 + i;
    const open = d.open[k];
    const armed = d.armed[k];
    const name = `${i + 1}${side > 0 ? 'L' : 'R'}`;
    const x = side > 0 ? cx - hw - 12 : cx + hw + 2;
    const col = open ? AIRBUS.amber : AIRBUS.green;
    return (
      <g key={name}>
        <rect x={x} y={ys[i] - 9} width={10} height={18} fill={open ? AIRBUS.amber : 'none'} stroke={col} strokeWidth={1.6} />
        <T x={side > 0 ? x - 6 : x + 16} y={ys[i] + 4} c={open ? AIRBUS.amber : AIRBUS.white} s={10} a={side > 0 ? 'end' : 'start'}>
          {name}
        </T>
        {armed && (
          <T x={side > 0 ? x - 30 : x + 40} y={ys[i] + 4} c={AIRBUS.green} s={9} a={side > 0 ? 'end' : 'start'}>
            SLIDE
          </T>
        )}
        {open && (
          <T x={side > 0 ? x - 30 : x + 40} y={ys[i] + 4} c={AIRBUS.amber} s={9} a={side > 0 ? 'end' : 'start'}>
            {armed ? 'SLIDE' : 'OPEN'}
          </T>
        )}
      </g>
    );
  };
  const cargo = (y: number, open: boolean, label: string, h = 16) => (
    <g key={label}>
      <rect x={cx + hw + 2} y={y - h / 2} width={10} height={h} fill={open ? AIRBUS.amber : 'none'} stroke={open ? AIRBUS.amber : AIRBUS.green} strokeWidth={1.6} />
      <T x={cx + hw + 16} y={y + 4} c={open ? AIRBUS.amber : AIRBUS.white} s={9}>
        {label}
      </T>
    </g>
  );
  return (
    <g>
      <T x={cx} y={y0 + 16} s={13} a="middle" w={700}>
        DOOR
      </T>
      {/* obrys kadłuba: nos, burty, stożek ogonowy */}
      <path d={`M ${cx - hw} ${top + 30} Q ${cx - hw} ${top} ${cx} ${top - 6} Q ${cx + hw} ${top} ${cx + hw} ${top + 30} L ${cx + hw} ${bot - 20} L ${cx + 8} ${bot + 8} L ${cx - 8} ${bot + 8} L ${cx - hw} ${bot - 20} Z`} fill="none" stroke={AIRBUS.white} strokeWidth={1.4} />
      {/* skrzydła (krótkie zaznaczenie) */}
      <line x1={cx - hw} y1={y0 + 128} x2={cx - hw - 40} y2={y0 + 150} stroke={AIRBUS.white} strokeWidth={1} opacity={0.5} />
      <line x1={cx + hw} y1={y0 + 128} x2={cx + hw + 40} y2={y0 + 150} stroke={AIRBUS.white} strokeWidth={1} opacity={0.5} />
      {[0, 1, 2, 3].map((i) => door(i, 1))}
      {[0, 1, 2, 3].map((i) => door(i, -1))}
      {cargo(y0 + 84, d.cargo[0], 'FWD CARGO', 20)}
      {cargo(y0 + 194, d.cargo[1], 'AFT CARGO', 20)}
      {cargo(y0 + 232, d.cargo[2] ?? false, 'BULK', 10)}
      <T x={14} y={y0 + 244} c={AIRBUS.cyan} s={9}>
        {d.open.some(Boolean) || d.cargo.some(Boolean) ? 'DOORS OPEN' : 'ALL DOORS CLOSED'}
      </T>
    </g>
  );
}

/**
 * Strona ELEC: źródła (generatory silników 1A/1B/2A/2B, APU GEN, EXT, RAT, akumulatory) i szyny AC 1/2, AC ESS,
 * DC 1/2, DC ESS. Zasilone – zielone, awaria – bursztynowe FAULT, wyłączone – białe; linie zielone, gdy płynie prąd.
 */
function PageElec({ e }: { e: NonNullable<EcamProps['elec']> }) {
  const y0 = SEP;
  const box = (x: number, y: number, w: number, label: string, on: boolean, fault = false, sub?: string) => (
    <g key={label + x}>
      <rect x={x} y={y} width={w} height={sub ? 28 : 18} fill="none" stroke={fault ? AIRBUS.amber : on ? AIRBUS.green : AIRBUS.white} strokeWidth={1.3} />
      <T x={x + w / 2} y={y + 13} c={fault ? AIRBUS.amber : on ? AIRBUS.green : AIRBUS.white} s={10} a="middle">
        {label}
      </T>
      {sub && (
        <T x={x + w / 2} y={y + 24} c={fault ? AIRBUS.amber : AIRBUS.green} s={8} a="middle">
          {fault ? 'FAULT' : on ? sub : 'OFF'}
        </T>
      )}
    </g>
  );
  const ln = (x1: number, y1: number, x2: number, y2: number, on: boolean) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? AIRBUS.green : AIRBUS.white} strokeWidth={on ? 2 : 0.8} opacity={on ? 1 : 0.5} />;
  const g = e.gen;
  const f = e.genFault ?? [false, false, false, false];
  const B = e.bus;
  const Y1 = y0 + 26; // źródła
  const Y2 = y0 + 96; // szyny AC
  const Y3 = y0 + 150; // AC ESS / BAT
  const Y4 = y0 + 204; // szyny DC
  const on1 = (g[0] || g[1]) && B.ac1;
  const on2 = (g[2] || g[3]) && B.ac2;
  return (
    <g>
      <T x={180} y={y0 + 16} s={13} a="middle" w={700}>
        ELEC
      </T>
      {box(6, Y1, 40, 'GEN 1A', g[0] && !f[0], f[0], '115V')}
      {box(50, Y1, 40, 'GEN 1B', g[1] && !f[1], f[1], '115V')}
      {box(100, Y1, 46, 'APU GEN', e.apu, false, '115V')}
      {box(150, Y1, 40, 'EXT', e.ext, false, 'AVAIL')}
      {box(194, Y1, 44, 'EMER', e.rat, false, 'RAT')}
      {box(270, Y1, 40, 'GEN 2A', g[2] && !f[2], f[2], '115V')}
      {box(314, Y1, 40, 'GEN 2B', g[3] && !f[3], f[3], '115V')}
      {/* źródła → szyny AC (połączenie szyn dla APU i EXT) */}
      {ln(26, Y1 + 28, 26, Y2, g[0] && !f[0] && B.ac1)}
      {ln(70, Y1 + 28, 70, Y2, g[1] && !f[1] && B.ac1)}
      {ln(290, Y1 + 28, 290, Y2, g[2] && !f[2] && B.ac2)}
      {ln(334, Y1 + 28, 334, Y2, g[3] && !f[3] && B.ac2)}
      {ln(123, Y1 + 28, 123, Y2 - 14, e.apu)}
      {ln(170, Y1 + 28, 170, Y2 - 14, e.ext)}
      {ln(90, Y2 - 14, 270, Y2 - 14, (e.apu || e.ext) && !on1 && !on2)}
      {ln(90, Y2 - 14, 90, Y2, (e.apu || e.ext) && B.ac1 && !on1)}
      {ln(270, Y2 - 14, 270, Y2, (e.apu || e.ext) && B.ac2 && !on2)}
      {box(6, Y2, 110, 'AC 1', B.ac1)}
      {box(244, Y2, 110, 'AC 2', B.ac2)}
      {/* RAT i akumulatory → szyny ESS */}
      {ln(216, Y1 + 28, 216, Y3, e.rat)}
      {box(130, Y3, 100, 'AC ESS', B.acEss)}
      {ln(116, Y2 + 9, 130, Y3 + 9, B.ac1 && B.acEss)}
      {box(256, Y3, 98, `BAT ${e.bat ? '28V' : 'OFF'}`, e.bat)}
      {ln(256, Y3 + 9, 230, Y3 + 9, e.bat && !B.ac1 && !B.ac2)}
      {ln(61, Y2 + 18, 61, Y4, B.dc1)}
      {ln(299, Y2 + 18, 299, Y4, B.dc2)}
      <T x={70} y={(Y2 + Y4) / 2 + 4} c={AIRBUS.white} s={8}>
        TRU 1
      </T>
      <T x={290} y={(Y2 + Y4) / 2 + 4} c={AIRBUS.white} s={8} a="end">
        TRU 2
      </T>
      {box(6, Y4, 110, 'DC 1', B.dc1)}
      {box(130, Y4, 100, 'DC ESS', B.dcEss)}
      {box(244, Y4, 110, 'DC 2', B.dc2)}
      {ln(180, Y3 + 18, 180, Y4, B.dcEss)}
      {e.shed && (
        <T x={180} y={y0 + 244} c={AIRBUS.amber} s={10} a="middle">
          GALLEY SHED
        </T>
      )}
    </g>
  );
}

function useClock() {
  const fmt = () => new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const [t, setT] = useState(fmt);
  useEffect(() => {
    const id = window.setInterval(() => setT(fmt()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

export function Ecam({ thrMode = ['CLB', 98], thr: thrIn, n1, rev, egt, egtLimit = 1000, memo, warning, page = 'ENG', eng, wheel, fctl, fuel, cruise, apu, door, elec, footer, width = 300 }: EcamProps) {
  const ft = footer ?? { tat: -36, sat: -66, isa: -3 };
  const clock = useClock();
  const shown = useCockpitPref('screens');
  if (!shown) return null;
  // pasek alarmu: tytuł + polecenia (po 13 px), wsuwa się pod EWD i przesuwa resztę ekranu w dół
  const band = warning ? 26 + warning.lines.length * 13 : 0;
  const HH = H + band;
  const thr: Pair = thrIn ?? [thrFromN1(n1[0]), thrFromN1(n1[1])];
  return (
    <svg viewBox={`0 0 ${W} ${HH}`} width={width} height={(width * HH) / W} style={{ display: 'block', background: AIRBUS.bg, borderRadius: 6, fontFamily: cockpitFont }} role="img" aria-label="Wyświetlacz ECAM: parametry silników, alarmy i strona systemu">
      {/* ---- EWD: tryb ciągu, THR/N1, EGT ---- */}
      {thrMode && (
        <T x={180} y={20} c={AIRBUS.cyan} s={15} a="middle">
          {thrMode[0]} <tspan fill={AIRBUS.cyan}>{f1(thrMode[1])}%</tspan>
        </T>
      )}
      <T x={28} y={60} s={11}>
        EGT
      </T>
      <T x={28} y={73} c={AIRBUS.cyan} s={10}>
        °C
      </T>
      <T x={332} y={60} s={11} a="end">
        EGT
      </T>
      <T x={332} y={73} c={AIRBUS.cyan} s={10} a="end">
        °C
      </T>
      <EgtDial cx={44} cy={108} v={egt[0]} limit={egtLimit} />
      <EgtDial cx={316} cy={108} v={egt[1]} limit={egtLimit} />
      <ThrDial cx={128} cy={72} thr={thr[0]} n1={n1[0]} rev={rev?.[0]} />
      <ThrDial cx={232} cy={72} thr={thr[1]} n1={n1[1]} rev={rev?.[1]} />
      <T x={180} y={92} s={11} a="middle">
        THR
      </T>
      <T x={180} y={104} c={AIRBUS.cyan} s={10} a="middle">
        %
      </T>
      <T x={118} y={130} c={AIRBUS.green} s={14} a="end">
        {f1(n1[0])}
      </T>
      <T x={180} y={130} s={11} a="middle">
        – N1 –
      </T>
      <T x={180} y={142} c={AIRBUS.cyan} s={10} a="middle">
        %
      </T>
      <T x={242} y={130} c={AIRBUS.green} s={14}>
        {f1(n1[1])}
      </T>
      {memo?.slice(0, 2).map(([m, c], i) => (
        <T key={m} x={14} y={154 + i * 12} c={c} s={10} w={700}>
          {m}
        </T>
      ))}
      {warning && (
        <g>
          <line x1={8} x2={W - 8} y1={SEP} y2={SEP} stroke={AIRBUS.white} strokeWidth={1.4} />
          <T x={14} y={SEP + 18} c={warning.color ?? AIRBUS.red} s={13} w={700}>
            {warning.title}
          </T>
          {warning.master && (
            <g>
              <rect x={W - 104} y={SEP + 5} width={94} height={18} rx={2} fill={AIRBUS.red}>
                <animate attributeName="opacity" values="1;0.25;1" dur="0.9s" repeatCount="indefinite" />
              </rect>
              <T x={W - 57} y={SEP + 18} c="#ffffff" s={11} a="middle" w={700}>
                MASTER WARN
              </T>
            </g>
          )}
          {warning.lines.map((l, i) => (
            <text key={l + i} x={22} y={SEP + 34 + i * 13} fill={AIRBUS.cyan} fontSize={11} style={{ whiteSpace: 'pre' }}>
              {l}
            </text>
          ))}
        </g>
      )}
      <g transform={`translate(0 ${band})`}>
      <line x1={8} x2={W - 8} y1={SEP} y2={SEP} stroke={AIRBUS.white} strokeWidth={1.4} />
      {/* ---- strona SD ---- */}
      {page === 'ENG' && eng && <PageEng eng={eng} />}
      {page === 'WHEEL' && wheel && <PageWheel wheel={wheel} />}
      {page === 'FCTL' && fctl && <PageFctl f={fctl} />}
      {page === 'CRUISE' && cruise && <PageCruise c={cruise} />}
      {page === 'FUEL' && fuel && <PageFuel f={fuel} />}
      {page === 'APU' && apu && <PageApu a={apu} />}
      {page === 'DOOR' && door && <PageDoor d={door} />}
      {page === 'ELEC' && elec && <PageElec e={elec} />}
      {/* ---- dolny pasek ---- */}
      <g stroke={AIRBUS.white} strokeWidth={1} fill="none">
        <rect x={6} y={FOOT} width={112} height={54} />
        <rect x={122} y={FOOT} width={116} height={54} />
        <rect x={242} y={FOOT} width={112} height={54} />
      </g>
      {(
        [
          ['TAT', ft.tat],
          ['SAT', ft.sat],
          ['ISA', ft.isa],
        ] as const
      ).map(([l, v], i) => (
        <g key={l}>
          <T x={14} y={FOOT + 16 + i * 15} s={10}>
            {l}
          </T>
          <T x={84} y={FOOT + 16 + i * 15} c={AIRBUS.green} s={11} a="end">
            {v > 0 ? `+${f0(v)}` : f0(v)}
          </T>
          <T x={90} y={FOOT + 16 + i * 15} c={AIRBUS.cyan} s={9}>
            °C
          </T>
        </g>
      ))}
      <T x={150} y={FOOT + 18} s={10}>
        FLT
      </T>
      <T x={212} y={FOOT + 18} c={AIRBUS.green} s={11} a="end">
        {ft.flt ?? '00:00'}
      </T>
      <T x={180} y={FOOT + 42} c={AIRBUS.green} s={15} a="middle">
        {clock}
      </T>
      {(
        [
          ['GW', ft.gw, 'KG'],
          ['GWCG', ft.gwcg, '%'],
          ['FOB', ft.fob, 'KG'],
        ] as const
      ).map(([l, v, u], i) => (
        <g key={l}>
          <T x={248} y={FOOT + 16 + i * 15} s={10}>
            {l}
          </T>
          <T x={326} y={FOOT + 16 + i * 15} c={AIRBUS.green} s={11} a="end">
            {v === undefined ? '--' : l === 'GWCG' ? f1(v) : f0(v)}
          </T>
          <T x={330} y={FOOT + 16 + i * 15} c={AIRBUS.cyan} s={9}>
            {u}
          </T>
        </g>
      ))}
      </g>
    </svg>
  );
}
