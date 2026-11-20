/*
 * ECAM w stylu Airbusa A350 (SVG, niezależny od sceny 3D): u góry EWD – tryb ciągu, dwa wskaźniki THR/N1 i dwa EGT,
 * pod nim wybrana strona SD (ENG, WHEEL, F/CTL, FUEL, CRUISE), na dole stały pasek: TAT/SAT/ISA, czas lotu i zegar, masa,
 * środek ciężkości i paliwo. Tak jak w samolocie: jasne kolory na czarnym tle, liczby zielone, opisy białe/błękitne.
 */
import type { ReactNode } from 'react';
import { AIRBUS, cockpitFont } from './common';

export type EcamPage = 'ENG' | 'WHEEL' | 'FCTL' | 'CRUISE' | 'FUEL';
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
  wheel?: { brakeT: number[]; tyre: number[]; steer?: boolean; parkBrk?: boolean; gear?: 'down' | 'transit' | 'up' };
  /** Strona F/CTL: wychylenia (°) 7 spojlerów na skrzydło (od kadłuba), lotek, steru wysokości i kierunku, trymer. */
  fctl?: { spL: number[]; spR: number[]; ailL: number; ailR: number; elev: number; rudder: number; pitchTrim: number; slat?: number; flap?: number; conf?: string };
  /** Strona FUEL: ilość paliwa (kg) w zbiornikach lewym, centralnym i prawym, ich pojemności i paliwo zużyte przez silniki. */
  fuel?: { l: number; c: number; r: number; lMax: number; cMax: number; rMax: number; fu?: Pair };
  /** Strona CRUISE: przepływ i zużycie paliwa, ciśnienie w kabinie, temperatury stref. */
  cruise?: { ff: Pair; fu: Pair; deltaP: number; cabAlt: number; cabVs: number; ldgElev?: number; temps?: [number, number, number] };
  /** Dolny pasek. */
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
  const bogie = (x0: number, first: number) =>
    [0, 1, 2].map((row) =>
      [0, 1].map((col) => {
        const i = first + row * 2 + col;
        const x = x0 + col * 64;
        const y = SEP + 92 + row * 52;
        const hot = (wheel.brakeT[i] ?? 0) > 300;
        return (
          <g key={i}>
            <T x={x + 14} y={y - 8} c={hot ? AIRBUS.amber : AIRBUS.green} s={12} a="middle">
              {f0(wheel.brakeT[i] ?? 0)}
            </T>
            <rect x={x + 4} y={y - 4} width={20} height={26} rx={3} fill="none" stroke={AIRBUS.green} strokeWidth={1.4} />
            <T x={x + 14} y={y + 13} s={10} a="middle">
              {i + 1}
            </T>
            <T x={x + 14} y={y + 33} c={AIRBUS.green} s={11} a="middle">
              {f0(wheel.tyre[i] ?? 0)}
            </T>
          </g>
        );
      }),
    );
  return (
    <g>
      <rect x={10} y={SEP + 8} width={62} height={18} fill="none" stroke={AIRBUS.cyan} strokeWidth={1} />
      <T x={41} y={SEP + 21} c={AIRBUS.cyan} s={11} a="middle">
        WHEEL
      </T>
      {/* koło przednie i sterowanie */}
      <rect x={170} y={SEP + 18} width={20} height={24} rx={3} fill="none" stroke={AIRBUS.green} strokeWidth={1.4} />
      <T x={180} y={SEP + 56} c={wheel.steer === false ? AIRBUS.amber : AIRBUS.green} s={10} a="middle">
        N/W STEER
      </T>
      <T x={180} y={SEP + 128} c={AIRBUS.cyan} s={10} a="middle">
        °C
      </T>
      <T x={180} y={SEP + 180} c={AIRBUS.cyan} s={10} a="middle">
        PSI
      </T>
      {bogie(30, 0)}
      {bogie(222, 6)}
      {/* wskaźniki podwozia: para trójkątów nad każdą goleń (dwa niezależne układy czujników) */}
      {wheel.gear && wheel.gear !== 'up' &&
        (
          [
            [180, SEP + 6],
            [94, SEP + 60],
            [286, SEP + 60],
          ] as const
        ).map(([cx, cy]) =>
          [-1, 1].map((k) => {
            const x = cx + k * 9;
            const c = wheel.gear === 'down' ? AIRBUS.green : AIRBUS.red;
            return <path key={`${cx}${k}`} d={`M${x - 7},${cy} h14 l-7,11 z`} fill={wheel.gear === 'down' ? c : 'none'} stroke={c} strokeWidth={1.4} />;
          }),
        )}
      <T x={180} y={SEP + 244} c={wheel.parkBrk ? AIRBUS.green : AIRBUS.white} s={11} a="middle">
        {wheel.parkBrk ? 'PARK BRK ON' : 'A-SKID'}
      </T>
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
  const GREY = '#8a929b';
  const GREEN = AIRBUS.green;
  const cx = 180;
  // ---- usterzenie ----
  const finTop = SEP + 52;
  const htpY = SEP + 122;
  const rudY = SEP + 70;
  const rudX = Math.max(-1, Math.min(1, f.rudder / 30)) * 30;
  const elevBar = (x: number) => {
    const y0 = htpY - 26;
    const y1 = htpY + 26;
    const ym = htpY + Math.max(-1, Math.min(1, f.elev / 25)) * 24;
    return (
      <g key={x}>
        <rect x={x - 4} y={y0} width={8} height={y1 - y0} fill={GREY} />
        <rect x={x - 4} y={Math.min(htpY, ym)} width={8} height={Math.max(1.5, Math.abs(ym - htpY))} fill={GREEN} />
        <line x1={x - 6} x2={x + 6} y1={htpY} y2={htpY} stroke={GREEN} strokeWidth={1.2} />
      </g>
    );
  };
  // ---- skrzydła od tyłu: nasada nisko, końcówki wyżej (wznios) ----
  const rootY = SEP + 222;
  const tipY = SEP + 206;
  const wingY = (x: number) => {
    const d = Math.abs(x - cx);
    return d < 26 ? rootY + 4 : rootY - ((d - 26) / (cx - 26 - 22)) * (rootY - tipY);
  };
  const ail = (x: number, deg: number) => {
    const yw = wingY(x);
    const yd = yw + Math.max(-1, Math.min(1, deg / 25)) * 22;
    return (
      <g key={x}>
        <rect x={x - 3.5} y={yw - 24} width={7} height={48} fill={GREY} />
        <rect x={x - 3.5} y={Math.min(yw, yd)} width={7} height={Math.max(1.5, Math.abs(yd - yw))} fill={GREEN} />
        <line x1={x - 5} x2={x + 5} y1={yw} y2={yw} stroke={GREEN} strokeWidth={1} />
      </g>
    );
  };
  // spojlery: od kadłuba na zewnątrz – dwa wewnętrzne (przed klapą wewnętrzną) i pięć zewnętrznych
  const spX = [30, 40, 66, 76, 86, 96, 106];
  const spoiler = (x: number, deg: number) => {
    const yw = wingY(x);
    const h = 5 + Math.min(1, Math.max(0, deg) / 50) * 26;
    return (
      <g key={x}>
        <rect x={x - 3.5} y={yw - h} width={7} height={h} fill={GREY} />
        <line x1={x - 4.5} x2={x + 4.5} y1={yw - h} y2={yw - h} stroke={GREEN} strokeWidth={2} />
      </g>
    );
  };
  return (
    <g>
      <T x={14} y={SEP + 22} s={13} w={700}>
        F/CTL
      </T>
      <line x1={14} x2={56} y1={SEP + 26} y2={SEP + 26} stroke={AIRBUS.white} strokeWidth={1} />
      {/* klapy i sloty (konfiguracja) */}
      {f.conf !== undefined && (
        <g>
          <T x={250} y={SEP + 22} c={AIRBUS.cyan} s={10}>
            S
          </T>
          <rect x={260} y={SEP + 14} width={30} height={9} fill="none" stroke={AIRBUS.white} strokeWidth={1} />
          <rect x={260} y={SEP + 14} width={30 * (f.slat ?? 0)} height={9} fill={GREEN} />
          <rect x={294} y={SEP + 14} width={30} height={9} fill="none" stroke={AIRBUS.white} strokeWidth={1} />
          <rect x={294} y={SEP + 14} width={30 * (f.flap ?? 0)} height={9} fill={GREEN} />
          <T x={332} y={SEP + 22} c={AIRBUS.cyan} s={10}>
            F
          </T>
          <T x={292} y={SEP + 36} c={GREEN} s={11} a="middle">
            {f.conf}
          </T>
        </g>
      )}
      {/* statecznik pionowy i belka steru kierunku */}
      <T x={cx - 36} y={SEP + 46} s={9} a="end">
        RUDDER
      </T>
      <T x={cx - 36} y={SEP + 56} s={9} a="end">
        TRIM
      </T>
      <T x={cx + 34} y={SEP + 52} c={AIRBUS.cyan} s={11}>
        {/* trymer steru kierunku (w tych scenach nietrymowany); położenie steru pokazuje wskaźnik na belce */}
        L 0.0°
      </T>
      <path d={`M${cx - 3},${htpY} L${cx},${finTop} L${cx + 3},${htpY} Z`} fill={GREY} />
      <rect x={cx - 30} y={rudY - 5} width={60} height={10} fill={GREY} />
      <path d={`M${cx - 33},${rudY - 7} h-3 v14 h3 M${cx + 33},${rudY - 7} h3 v14 h-3`} fill="none" stroke={GREEN} strokeWidth={1.4} />
      <line x1={cx + rudX} x2={cx + rudX} y1={rudY - 8} y2={rudY + 8} stroke={GREEN} strokeWidth={2.4} />
      {/* statecznik poziomy ze sterami wysokości */}
      <line x1={cx - 62} x2={cx + 62} y1={htpY} y2={htpY} stroke={GREY} strokeWidth={2.5} />
      <circle cx={cx} cy={htpY} r={10} fill="#3a4047" />
      {elevBar(cx - 62)}
      {elevBar(cx + 62)}
      {/* trymer statecznika poziomego */}
      <line x1={cx} x2={cx} y1={htpY + 6} y2={htpY + 52} stroke={AIRBUS.white} strokeWidth={1.2} />
      <line x1={cx - 6} x2={cx + 6} y1={htpY + 8} y2={htpY + 8} stroke={AIRBUS.white} strokeWidth={1.2} />
      <line x1={cx - 6} x2={cx + 6} y1={htpY + 52} y2={htpY + 52} stroke={AIRBUS.white} strokeWidth={1.2} />
      <path d={`M${cx - 12},${htpY + 30 - Math.max(-4, Math.min(13.5, f.pitchTrim)) * 1.5 - 5} l8,5 l-8,5 z`} fill="none" stroke={GREEN} strokeWidth={1.3} />
      <T x={cx + 10} y={htpY + 22} s={9}>
        PITCH
      </T>
      <T x={cx + 10} y={htpY + 32} s={9}>
        TRIM
      </T>
      <T x={cx + 10} y={htpY + 46} c={GREEN} s={11}>
        {f1(Math.abs(f.pitchTrim))}°{f.pitchTrim >= 0 ? 'UP' : 'DN'}
      </T>
      {/* skrzydła od tyłu, silniki pod nimi */}
      <path d={`M22,${tipY} L${cx - 26},${rootY} Q${cx},${rootY + 14} ${cx + 26},${rootY} L338,${tipY}`} fill="none" stroke={GREY} strokeWidth={3} />
      {[cx - 79, cx + 79].map((x) => (
        <circle key={x} cx={x} cy={wingY(x) + 11} r={7} fill="none" stroke={GREY} strokeWidth={2} />
      ))}
      {f.spL.map((d, i) => spoiler(cx - 26 - spX[i], d))}
      {f.spR.map((d, i) => spoiler(cx + 26 + spX[i], d))}
      {ail(24, f.ailL)}
      {ail(34, f.ailL)}
      {ail(326, f.ailR)}
      {ail(336, f.ailR)}
    </g>
  );
}

/**
 * Strona FUEL: rzut z góry z trzema zbiornikami A350 (lewy i prawy w skrzydłach, centralny w centropłacie).
 * Każdy zbiornik ma ilość w kg i pasek wypełnienia, pod spodem zasilanie silników, u góry paliwo zużyte (F.USED),
 * na dole całe paliwo na pokładzie (FOB).
 */
function PageFuel({ f }: { f: NonNullable<EcamProps['fuel']> }) {
  const top = SEP + 92;
  const bot = SEP + 150;
  // zbiorniki: [x0, x1, kg, pojemność, opis]
  const tanks: [number, number, number, number, string][] = [
    [34, 146, f.l, f.lMax, 'L'],
    [150, 210, f.c, f.cMax, 'CTR'],
    [214, 326, f.r, f.rMax, 'R'],
  ];
  const fob = f.l + f.c + f.r;
  return (
    <g>
      <T x={14} y={SEP + 22} s={13} w={700}>
        FUEL
      </T>
      <T x={180} y={SEP + 22} s={10} a="middle">
        F.USED
      </T>
      <T x={180} y={SEP + 33} c={AIRBUS.cyan} s={8} a="middle">
        KG
      </T>
      <T x={128} y={SEP + 30} c={AIRBUS.green} s={13} a="end">
        {f0(f.fu?.[0] ?? 0)}
      </T>
      <T x={232} y={SEP + 30} c={AIRBUS.green} s={13}>
        {f0(f.fu?.[1] ?? 0)}
      </T>
      {/* kadłub i obrys skrzydeł */}
      <path d={`M150,${SEP + 50} v148 M210,${SEP + 50} v148`} stroke={AIRBUS.white} strokeWidth={1.2} />
      <path d={`M150,${top - 6} L24,${top + 26} L24,${bot + 22} L150,${bot + 4} M210,${top - 6} L336,${top + 26} L336,${bot + 22} L210,${bot + 4}`} fill="none" stroke={AIRBUS.white} strokeWidth={1.4} />
      {tanks.map(([x0, x1, kg, max, lab]) => {
        const k = max > 0 ? Math.max(0, Math.min(1, kg / max)) : 0;
        const h = bot - top;
        return (
          <g key={lab}>
            <rect x={x0} y={top} width={x1 - x0} height={h} fill="none" stroke={AIRBUS.white} strokeWidth={1} />
            {k > 0 && <rect x={x0 + 1.5} y={bot - (h - 3) * k - 1.5} width={x1 - x0 - 3} height={(h - 3) * k} fill={AIRBUS.green} opacity={0.22} />}
            <T x={(x0 + x1) / 2} y={top + 24} c={AIRBUS.green} s={14} a="middle">
              {f0(kg)}
            </T>
            <T x={(x0 + x1) / 2} y={top + 40} c={AIRBUS.cyan} s={8} a="middle">
              {lab === 'CTR' ? 'CTR TK' : `${lab} TK`} KG
            </T>
          </g>
        );
      })}
      {/* zasilanie silników: przewody od zbiorników skrzydłowych do silników 1 i 2 */}
      {(
        [
          [96, '1'],
          [264, '2'],
        ] as const
      ).map(([x, n]) => (
        <g key={n}>
          <line x1={x} x2={x} y1={bot} y2={bot + 34} stroke={AIRBUS.green} strokeWidth={2} />
          <rect x={x - 12} y={bot + 34} width={24} height={22} rx={3} fill="none" stroke={AIRBUS.white} strokeWidth={1.2} />
          <T x={x} y={bot + 50} s={12} a="middle">
            {n}
          </T>
        </g>
      ))}
      {/* całe paliwo na pokładzie */}
      <rect x={128} y={bot + 40} width={104} height={34} fill="none" stroke={AIRBUS.white} strokeWidth={1.2} />
      <T x={140} y={bot + 54} s={10}>
        FOB
      </T>
      <T x={222} y={bot + 68} c={AIRBUS.green} s={14} a="end">
        {f0(fob)}
      </T>
      <T x={140} y={bot + 68} c={AIRBUS.cyan} s={8}>
        KG
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

export function Ecam({ thrMode = ['CLB', 98], thr: thrIn, n1, rev, egt, egtLimit = 1000, memo, warning, page = 'ENG', eng, wheel, fctl, fuel, cruise, footer, width = 300 }: EcamProps) {
  const ft = footer ?? { tat: -36, sat: -66, isa: -3 };
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
        {ft.time ?? '12:00:00'}
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
