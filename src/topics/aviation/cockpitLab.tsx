/*
 * Moduł „Kokpit” – osobna scena 3D wnętrza kokpitu A350 (nie samolot z zewnątrz).
 *
 * Fotele, panel główny z sześcioma ekranami, osłona przeciwsłoneczna z panelem autopilota (FCU), panel górny,
 * pulpit środkowy z dźwigniami, boczne drążki, pedały i okna, za którymi widać niebo i ziemię. Ekrany w 3D pokazują
 * prawdziwy obraz PFD, ND i ECAM (te same komponenty co w doku kokpitu) – komponent rysuje się w ukrytym korzeniu
 * Reacta, a jego SVG trafia na kanwę tekstury. Tak samo powstają lica paneli (FCU, panel górny, pulpit).
 *
 * Każda zakładka ma własny scenariusz (start, zakręt, podejście, pożar silnika, przygotowanie kokpitu…), który
 * przestawia przełączniki i dźwignie sam – użytkownik naciska tylko „Rozpocznij”.
 */
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { PartModule, SceneProps, Step } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { speedInText, useSpeed } from '../../components/ui';
import { useSceneHidden } from '../../lib/topicNav';
import { AIRBUS, CockpitDock, Ecam, EngStartPanel, FlapLever, GearLever, Nd, PanelBox, Pfd, Pushbutton, Sidestick, SpeedBrakeLever, ThrustLevers, cockpitFont, type EcamPage } from '../../components/cockpit';

type V3 = [number, number, number];
/** Skala modelu: kokpit budowany w metrach, w scenie powiększony (kamera stoi blisko ekranów). */
const K = 3;
const w3 = (x: number, y: number, z: number): V3 => [x * K, y * K, z * K];

/* ======================= stan kokpitu ======================= */

type Conf = '0' | '1' | '1+F' | '2' | '3' | 'FULL';
type Fma = [string, string, string, string, string];
type Warn = { title: string; color?: string; lines: string[]; master?: boolean } | null;
export type CkMode = 'home' | 'screens' | 'pfd' | 'nd' | 'ecam' | 'stick' | 'fcu' | 'overhead' | 'pedestal';

type CkState = {
  pitch: number;
  bank: number;
  ias: number;
  mach?: number;
  tas: number;
  alt: number;
  altSel?: number;
  vs: number;
  hdg: number;
  fma: Fma;
  ground: boolean;
  stick: [number, number];
  pedals: number;
  lever: [number, number];
  athr: boolean;
  conf: Conf;
  spd: { pos: number; armed: boolean };
  gear: { lever: 'up' | 'down'; state: 'down' | 'transit' | 'up' };
  n1: [number, number];
  n3: [number, number];
  egt: [number, number];
  ff: [number, number];
  engMode: 'CRANK' | 'NORM' | 'IGN/START';
  masters: [boolean, boolean];
  fire: [boolean, boolean];
  firePb: [boolean, boolean];
  agent: [boolean, boolean];
  fcu: { spd: number | null; hdg: number | null; alt: number; vs: number | null; ap1: boolean; ap2: boolean; athr: boolean; loc: boolean; appr: boolean };
  /** Przyciski i przełączniki panelu górnego (włączone / wyłączone). */
  oh: Record<string, boolean>;
  /** 0 – samolot bez prądu (ekrany czarne), 0,5 – tylko akumulatory, 1 – pełne zasilanie. */
  power: number;
  warning: Warn;
  memo: [string, string][];
  page: EcamPage;
  ndRange: number;
  target: string;
  wind: [number, number];
  /** Przełącznik, który załoga właśnie przestawia (podświetlony w doku i na panelu w 3D). */
  act: string | null;
  /** Co robi załoga – podpis w ramce. */
  crew: string;
  masterWarn: boolean;
};

const OH_FLIGHT: Record<string, boolean> = {
  BAT1: true, BAT2: true, EXT: false, EXT_AV: false, APU_GEN: true, GEN: true, APU_MASTER: false, APU_START: false, APU_AVAIL: false, APU_BLEED: false,
  PACK1: true, PACK2: true, ENG_BLEED: true, PUMPS: true, ADIRS1: true, ADIRS2: true, ADIRS3: true, NAV: true, BEACON: true, STROBE: true, LAND: false,
  NOSE: false, BELTS: false, NOSMOKE: true, ENG_AI: false, WING_AI: false,
};
const OH_COLD: Record<string, boolean> = Object.fromEntries(Object.keys(OH_FLIGHT).map((k) => [k, false]));

const CRUISE: CkState = {
  pitch: 2.5,
  bank: 0,
  ias: 275,
  mach: 0.85,
  tas: 488,
  alt: 37000,
  altSel: 37000,
  vs: 0,
  hdg: 95,
  fma: ['SPEED', 'ALT CRZ', 'NAV', '', 'AP1\n1FD2\nA/THR'],
  ground: false,
  stick: [0, 0],
  pedals: 0,
  lever: [1, 1],
  athr: true,
  conf: '0',
  spd: { pos: 0, armed: false },
  gear: { lever: 'up', state: 'up' },
  n1: [86, 86],
  n3: [93, 93],
  egt: [682, 688],
  ff: [3150, 3120],
  engMode: 'NORM',
  masters: [true, true],
  fire: [false, false],
  firePb: [false, false],
  agent: [false, false],
  fcu: { spd: null, hdg: null, alt: 37000, vs: null, ap1: true, ap2: false, athr: true, loc: false, appr: false },
  oh: OH_FLIGHT,
  power: 1,
  warning: null,
  memo: [],
  page: 'CRUISE',
  ndRange: 80,
  target: 'ABUDO',
  wind: [280, 60],
  act: null,
  crew: '',
  masterWarn: false,
};
/** Samolot na początku pasa, silniki pracują na biegu jałowym. */
const LINEUP: CkState = {
  ...CRUISE,
  pitch: 0,
  ias: 0,
  mach: undefined,
  tas: 0,
  alt: 0,
  altSel: 5000,
  hdg: 113,
  fma: ['', 'SRS', 'RWY', '', '1FD2\nA/THR'],
  ground: true,
  lever: [0, 0],
  athr: false,
  conf: '1+F',
  spd: { pos: 0, armed: true },
  gear: { lever: 'down', state: 'down' },
  n1: [20, 20],
  n3: [68, 68],
  egt: [470, 462],
  ff: [310, 305],
  fcu: { spd: null, hdg: null, alt: 5000, vs: null, ap1: false, ap2: false, athr: true, loc: false, appr: false },
  oh: { ...OH_FLIGHT, NAV: true, STROBE: true, LAND: true, NOSE: true, BELTS: true },
  page: 'ENG',
  ndRange: 10,
  target: 'RW29',
  wind: [290, 8],
};
/** Silniki wyłączone, APU pracuje (przed uruchomieniem silników). */
const ENG_OFF: CkState = {
  ...LINEUP,
  fma: ['', '', '', '', '1FD2'],
  n1: [0, 0],
  n3: [0, 0],
  egt: [22, 22],
  ff: [0, 0],
  masters: [false, false],
  conf: '0',
  spd: { pos: 0, armed: false },
  oh: { ...OH_FLIGHT, APU_MASTER: true, APU_AVAIL: true, APU_BLEED: true, PACK1: false, PACK2: false, GEN: false, LAND: false, NOSE: false, STROBE: false, BELTS: true },
  memo: [['APU AVAIL', AIRBUS.green], ['APU BLEED', AIRBUS.green]],
};
/** Samolot zimny i ciemny – bez prądu. */
const COLD: CkState = {
  ...ENG_OFF,
  fma: ['', '', '', '', ''],
  oh: { ...OH_COLD, EXT_AV: true },
  power: 0,
  memo: [],
  page: 'ELEC',
  fcu: { spd: null, hdg: null, alt: 100, vs: null, ap1: false, ap2: false, athr: false, loc: false, appr: false },
};

/* ---------- pomocnicze: krzywe czasu ---------- */

const sm = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Wartość z kolejnych punktów [czas, wartość] – płynne przejścia. */
function kf(t: number, keys: [number, number][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t <= t1) return v0 + (v1 - v0) * sm((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
}
/** Ostatnie zdarzenie, którego czas już minął. */
function ev<T>(t: number, list: [number, T][], def: T): T {
  let v = def;
  for (const [tt, x] of list) if (t >= tt) v = x;
  return v;
}
/** Przełącznik przestawiany w tej chwili (podświetlenie trwa 2,5 s od zdarzenia). */
function actAt(t: number, list: [number, string][]): string | null {
  for (let i = list.length - 1; i >= 0; i--) if (t >= list[i][0]) return t < list[i][0] + 2.5 ? list[i][1] : null;
  return null;
}
const toward = (v: number, tgt: number, d: number) => (Math.abs(tgt - v) <= d ? tgt : v + Math.sign(tgt - v) * d);

/* ======================= scenariusze ======================= */

type Sim = { t: number; mode: CkMode; scn: string; run: boolean; st: CkState; dist: number; end: number };
/** Wynik kroku scenariusza: zmiany stanu. `fly` – wysokość i kurs liczone z prędkości pionowej i przechylenia. */
type Sc = Partial<CkState> & { fly?: boolean; end?: number };

/** Uruchamianie silników na ziemi (najpierw prawy, potem lewy) – 26 s. */
function engStart(t: number): Sc {
  const one = (t0: number) => ({
    n3: kf(t, [[t0, 0], [t0 + 4, 24], [t0 + 9, 52], [t0 + 14, 68]]),
    n1: kf(t, [[t0 + 2, 0], [t0 + 7, 6], [t0 + 14, 20]]),
    egt: kf(t, [[t0 + 4.5, 22], [t0 + 7, 520], [t0 + 9, 640], [t0 + 14, 470]]),
    ff: t < t0 + 4.5 ? 0 : kf(t, [[t0 + 4.5, 180], [t0 + 9, 420], [t0 + 14, 310]]),
  });
  const e2 = one(4);
  const e1 = one(14);
  return {
    engMode: t >= 2 && t < 26 ? 'IGN/START' : 'NORM',
    masters: [t >= 14, t >= 4],
    n1: [e1.n1, e2.n1],
    n3: [e1.n3, e2.n3],
    egt: [e1.egt, e2.egt],
    ff: [e1.ff, e2.ff],
    oh: { ...ENG_OFF.oh, GEN: t > 26, PACK1: t > 26, PACK2: t > 26 },
    memo: t < 26 ? [['APU AVAIL', AIRBUS.green], ['APU BLEED', AIRBUS.green]] : [['APU AVAIL', AIRBUS.green]],
    act: actAt(t, [[2, 'ENG MODE'], [4, 'MASTER 2'], [14, 'MASTER 1'], [26, 'ENG MODE']]),
    crew: ev(t, [
      [0, 'Silniki stoją. Prąd i sprężone powietrze daje APU – mały silnik w ogonie.'],
      [2, 'Przełącznik trybu na IGN/START – silniki są gotowe do rozruchu.'],
      [4, 'MASTER 2 w górę: powietrze z APU kręci prawym silnikiem.'],
      [8.5, 'Przy ok. 25% obrotów do komory trafia paliwo i zapala się płomień – rośnie temperatura spalin (EGT).'],
      [14, 'Prawy silnik pracuje na biegu jałowym. MASTER 1 – teraz lewy.'],
      [26, 'Oba silniki pracują. Przełącznik trybu wraca na NORM.'],
    ], ''),
  };
}

/** Start z początku pasa (t = 0: samolot ustawiony na pasie, silniki na biegu jałowym). */
function takeoff(t: number): Sc {
  const air = t >= 31.5;
  const lev = kf(t, [[2, 0], [3.5, 1.5], [44, 1.5], [45.5, 1]]);
  const n1 = kf(t, [[2.5, 20], [8, 88], [44, 88], [47, 82]]);
  return {
    ground: !air,
    lever: [lev, lev],
    athr: t >= 3.5,
    ias: kf(t, [[3, 0], [15, 80], [27, 145], [30, 152], [36, 160], [50, 175], [70, 250]]),
    pitch: kf(t, [[29, 0], [33.5, 15], [44, 15], [50, 12], [70, 9]]),
    vs: air ? kf(t, [[31.5, 0], [36, 2400], [44, 2400], [50, 2000]]) : 0,
    n1: [n1, n1 + 0.4],
    n3: [kf(t, [[2.5, 68], [8, 95], [44, 95], [47, 92]]), kf(t, [[2.5, 68], [8, 95], [44, 95], [47, 92]])],
    egt: [kf(t, [[2.5, 470], [9, 840], [44, 850], [48, 760]]), kf(t, [[2.5, 462], [9, 832], [44, 845], [48, 755]])],
    ff: [kf(t, [[2.5, 310], [8, 7200], [44, 7200], [47, 5600]]), kf(t, [[2.5, 305], [8, 7150], [44, 7150], [47, 5550]])],
    stick: [0, kf(t, [[28.5, 0], [29.5, 0.55], [32, 0.45], [34, 0.1], [35, 0]])],
    gear: t < 34 ? { lever: 'down', state: 'down' } : t < 42 ? { lever: 'up', state: 'transit' } : { lever: 'up', state: 'up' },
    conf: t < 52 ? '1+F' : t < 60 ? '1' : '0',
    spd: { pos: 0, armed: t < 42 },
    fma: [
      t < 3.5 ? '' : t < 44 ? 'MAN\nFLX +50' : 'THR CLB',
      t < 44 ? 'SRS' : 'CLB',
      t < 35 ? 'RWY' : 'NAV',
      '',
      t < 46 ? '1FD2\nA/THR' : 'AP1\n1FD2\nA/THR',
    ],
    fcu: { ...LINEUP.fcu, ap1: t >= 46 },
    ndRange: t < 40 ? 10 : 20,
    fly: air,
    act: actAt(t, [[2, 'THR'], [29, 'STICK'], [34, 'GEAR'], [44, 'THR'], [46, 'AP1'], [52, 'FLAPS'], [60, 'FLAPS']]),
    crew: ev(t, [
      [0, 'Samolot stoi na początku pasa. Klapy ustawione do startu (1+F).'],
      [2, 'Kapitan przesuwa dźwignie ciągu do położenia FLX – mocy startowej.'],
      [6, 'Silniki się rozkręcają, samolot przyspiesza po pasie.'],
      [15, '„Sto węzłów” (185 km/h) – piloci sprawdzają, czy oba wskaźniki prędkości pokazują to samo.'],
      [27, '„V1” – od tej chwili start trzeba dokończyć, nawet gdyby zepsuł się silnik.'],
      [29, '„Rotate” – pilot ciągnie drążek do siebie, nos się unosi.'],
      [31.5, 'Koła odrywają się od pasa – samolot leci.'],
      [34, '„Positive climb” – wznoszenie potwierdzone, drugi pilot chowa podwozie.'],
      [44, 'Ok. 450 m nad lotniskiem: dźwignie do CL – silniki przechodzą na moc wznoszenia.'],
      [46, 'Kapitan włącza autopilota (AP1).'],
      [52, 'Samolot przyspiesza, więc klapy chowa się stopniowo – najpierw do 1…'],
      [60, '…a potem całkiem (0). Samolot dalej się wznosi.'],
    ], ''),
    end: 75,
  };
}

/** Lądowanie z ok. 300 m (1000 stóp), z autopilotem aż do przyziemienia. */
function approach(t: number, s: Sim): Sc {
  const st = s.st;
  const ra = st.alt;
  const gnd = st.ground || (t > 2 && ra <= 0.5);
  if (gnd && !st.ground) s.st.alt = 0;
  const tdT = gnd ? (s as Sim & { td?: number }).td ?? ((s as Sim & { td?: number }).td = t) : null;
  const sinceTd = tdT === null ? 0 : t - tdT;
  const lev = gnd ? (sinceTd < 1.5 ? 0 : sinceTd < 14 ? -1 : 0) : ra < 22 ? 0 : 1;
  const ias = gnd ? Math.max(20, 132 - sinceTd * 4.2) : ra < 30 ? 134 : 140;
  const vs = gnd ? 0 : ra > 40 ? -720 : -180 - ra * 6;
  return {
    ground: gnd,
    ias,
    pitch: gnd ? Math.max(0, 4.5 - sinceTd * 1.2) : ra > 45 ? 2.6 : 2.6 + (45 - ra) * 0.06,
    vs,
    lever: [lev, lev],
    n1: gnd && sinceTd > 1.5 && sinceTd < 14 ? [70, 70] : ra < 22 || gnd ? [21, 21] : [48, 48],
    egt: [520, 525],
    ff: gnd ? [320, 320] : [1500, 1500],
    conf: 'FULL',
    gear: { lever: 'down', state: 'down' },
    spd: { pos: gnd && sinceTd > 0.5 ? 1 : 0, armed: true },
    fma: [
      gnd ? '' : ra < 22 ? 'RETARD' : 'SPEED',
      gnd ? 'ROLL OUT' : ra < 45 ? 'FLARE' : ra < 400 ? 'LAND' : 'G/S',
      gnd || ra < 400 ? '' : 'LOC',
      'CAT 3\nDUAL',
      gnd && sinceTd > 6 ? '1FD2' : 'AP1+2\n1FD2\nA/THR',
    ],
    fcu: { spd: null, hdg: null, alt: 5000, vs: null, ap1: !(gnd && sinceTd > 6), ap2: !(gnd && sinceTd > 6), athr: true, loc: true, appr: true },
    oh: { ...OH_FLIGHT, LAND: true, NOSE: true, BELTS: true },
    ndRange: 10,
    target: 'RW29',
    wind: [290, 12],
    hdg: 293,
    fly: !gnd,
    act: gnd ? (sinceTd < 2 ? 'THR' : null) : ra < 22 && ra > 10 ? 'THR' : null,
    crew: gnd
      ? sinceTd < 1.5
        ? 'Przyziemienie! Wysuwają się hamulce aerodynamiczne (spojlery) – samolot „siada” na kołach.'
        : sinceTd < 14
          ? 'Pilot pociąga dźwignie do odwracaczy ciągu – silniki pchają powietrze do przodu i hamują samolot.'
          : 'Ok. 130 km/h: odwracacze wyłączone, dalej hamują już tylko koła.'
      : ra > 520
        ? 'Autopilot prowadzi samolot po wiązce radiowej ILS: kurs na oś pasa (LOC) i ścieżka zniżania (G/S).'
        : ra > 120
          ? 'Poniżej 120 m autopilot przechodzi w tryb lądowania (LAND) – od teraz nie da się już zmienić ustawień.'
          : ra > 45
            ? '„Hundred above… Minimum” – pilot widzi pas i decyduje: lądujemy.'
            : ra > 22
              ? 'Ok. 12 m nad pasem: wyrównanie (FLARE). Nos lekko się unosi, opadanie zwalnia.'
              : '„Retard, retard” – komputer przypomina, by cofnąć dźwignie ciągu na bieg jałowy.',
    end: (tdT ?? 999) + 26,
  };
}

/** Zakręt w przelocie: 25° przechylenia aż do kursu 135°, potem wyprowadzenie. */
function cruiseTurn(t: number, s: Sim, dt: number): Sc {
  const want = t > 3 && s.st.hdg < 132 && !(s as Sim & { done?: boolean }).done ? 25 : 0;
  if (t > 3 && s.st.hdg >= 132) (s as Sim & { done?: boolean }).done = true;
  const bank = toward(s.st.bank, want, 5 * dt);
  return {
    bank,
    pitch: 2.5 + Math.abs(bank) * 0.03,
    fma: ['SPEED', 'ALT CRZ', t > 3 ? 'HDG' : 'NAV', '', 'AP1\n1FD2\nA/THR'],
    fcu: { ...CRUISE.fcu, hdg: t > 2 ? 135 : null },
    fly: true,
    act: actAt(t, [[2, 'HDG']]),
    crew: ev(t, [
      [0, 'Lot prosty na wysokości ok. 11 300 m. Autopilot trzyma kurs i wysokość.'],
      [2, 'Pilot wybiera na panelu autopilota nowy kurs: 135°.'],
      [4, 'Samolot przechyla się o 25°. Na PFD horyzont się pochyla, a taśma kursu przesuwa się w lewo.'],
      [30, 'Kurs prawie osiągnięty – samolot wyprowadza z przechylenia.'],
    ], ''),
    end: 55,
  };
}

/** Sterowanie bocznym drążkiem (bez autopilota): przechylanie, wznoszenie i ochrona przed zbyt dużym przechyleniem. */
function stickDemo(t: number, s: Sim, dt: number): Sc {
  const st = s.st;
  let x = 0;
  let y = 0;
  if (t >= 2 && t < 5) x = 0.6;
  if (t >= 12 && t < 22 && st.bank > 1) x = -0.6;
  if (t >= 17 && t < 19) y = 0.45;
  if (t >= 24 && t < 30 && ((s as Sim & { fpa?: number }).fpa ?? 0) > 0.2) y = -0.4;
  if (t >= 30 && t < 38) x = -1;
  if (t >= 44 && t < 60 && st.bank < -1) x = 0.6;
  // normal law: drążek w bok zadaje prędkość przechylania (do 15°/s); puszczony – przechylenie zostaje
  // (do 33°; dalej samolot sam wraca do 33°); twarda granica 67°
  let bank = st.bank + x * 15 * dt;
  if (x === 0 && Math.abs(bank) > 33) bank = toward(bank, Math.sign(bank) * 33, 4 * dt);
  bank = Math.max(-67, Math.min(67, bank));
  if (x === 0 && Math.abs(bank) < 0.6 && t > 12) bank = 0;
  // drążek do siebie / od siebie: zmiana kąta toru lotu; puszczony – kąt zostaje (trzymany osobno, bo pochylenie
  // na ekranie zawiera jeszcze poprawkę na przechylenie)
  const m = s as Sim & { fpa?: number };
  let fpa = (m.fpa ?? 0) + y * 2.2 * dt;
  fpa = Math.max(-17, Math.min(27, fpa));
  if (y === 0 && t > 24 && t < 32 && Math.abs(fpa) < 0.12) fpa = 0;
  m.fpa = fpa;
  const pitch = 2.5 + fpa;
  const vs = fpa * 860;
  return {
    stick: [x, y],
    bank,
    pitch: pitch + Math.abs(bank) * 0.02,
    vs,
    fma: ['SPEED', vs > 300 ? 'V/S' : 'ALT', 'HDG', '', '1FD2\nA/THR'],
    fcu: { ...CRUISE.fcu, ap1: false, hdg: 95, alt: 37000 },
    fly: true,
    act: x !== 0 || y !== 0 ? 'STICK' : null,
    crew: ev(t, [
      [0, 'Autopilot jest wyłączony – samolotem steruje pilot bocznym drążkiem.'],
      [2, 'Drążek w prawo: samolot przechyla się w prawo.'],
      [5, 'Pilot puszcza drążek. Samolot sam trzyma przechylenie – i skręca.'],
      [12, 'Drążek w lewo, aż skrzydła będą poziomo.'],
      [17, 'Drążek do siebie: nos idzie w górę, samolot zaczyna się wznosić.'],
      [19, 'Drążek puszczony – samolot trzyma nowy kąt wznoszenia, nie trzeba go „dociskać”.'],
      [24, 'Drążek od siebie: powrót do lotu poziomego.'],
      [30, 'Drążek do oporu w lewo i trzymany: przechylenie rośnie, ale komputery zatrzymują je na 67°.'],
      [38, 'Drążek puszczony: samolot sam wraca do 33° – największego przechylenia, które utrzymuje bez pilota.'],
      [44, 'Pilot wyprowadza samolot do lotu prostego.'],
    ], ''),
    end: 60,
  };
}

/** Panel autopilota: AP1, nowa wysokość (wznoszenie), nowy kurs (zakręt) i nowa prędkość. */
function fcuDemo(t: number, s: Sim, dt: number): Sc {
  const st = s.st;
  const x = s as Sim & { climb?: boolean; lvl?: boolean; turned?: boolean };
  const altWin = Math.round(kf(t, [[5, 32000], [8, 34000]]) / 100) * 100;
  if (t >= 9 && !x.climb) x.climb = true;
  if (x.climb && st.alt >= 33980) x.lvl = true;
  const capt = x.climb && !x.lvl && st.alt > 33400;
  const vsT = x.lvl ? 0 : x.climb ? (capt ? Math.max(200, (34000 - st.alt) * 2.2) : 2500) : 0;
  const vs = toward(st.vs, vsT, 900 * dt);
  if (x.lvl && Math.abs(34000 - st.alt) < 40) st.alt = toward(st.alt, 34000, 60 * dt);
  const hdgSel = Math.round(kf(t, [[13, 95], [16, 140]]));
  const turning = t >= 17 && !x.turned;
  if (turning && st.hdg >= 137) x.turned = true;
  const bank = toward(st.bank, turning ? 25 : 0, 5 * dt);
  const spdSel = t >= 40 ? Math.round(kf(t, [[40, 275], [42, 260]])) : null;
  const ias = t >= 43 ? toward(st.ias, 260, 1.2 * dt) : st.ias;
  return {
    vs,
    bank,
    ias,
    mach: ias / 323,
    pitch: 2.5 + vs / 860 + Math.abs(bank) * 0.03,
    fma: [
      x.climb && !x.lvl && !capt ? 'THR CLB' : 'SPEED',
      x.lvl ? 'ALT' : capt ? 'ALT*' : x.climb ? 'OP CLB' : 'ALT',
      t >= 17 ? 'HDG' : 'NAV',
      '',
      t >= 2 ? 'AP1\n1FD2\nA/THR' : '1FD2\nA/THR',
    ],
    lever: [1, 1],
    fcu: { spd: spdSel, hdg: t >= 13 ? hdgSel : null, alt: altWin, vs: null, ap1: t >= 2, ap2: false, athr: true, loc: false, appr: false },
    altSel: altWin,
    fly: true,
    act: actAt(t, [[2, 'AP1'], [5, 'ALT'], [9, 'ALT'], [13, 'HDG'], [17, 'HDG'], [40, 'SPD']]),
    crew: ev(t, [
      [0, 'Samolot leci na ok. 9750 m (32 000 stóp). Steruje pilot, autopilot jest wyłączony.'],
      [2, 'Pilot wciska AP1 – samolotem steruje teraz autopilot.'],
      [5, 'Pokrętło wysokości: nowa wysokość 34 000 stóp (ok. 10 400 m).'],
      [9, 'Pilot pociąga pokrętło – autopilot zaczyna wznoszenie (OP CLB), silniki dostają moc wznoszenia.'],
      [13, 'Pokrętło kursu: 140°.'],
      [17, 'Pociągnięcie pokrętła kursu – samolot skręca na nowy kurs (HDG).'],
      [40, 'Pokrętło prędkości: 260 węzłów (ok. 480 km/h). Autociąg zmniejsza moc, samolot zwalnia.'],
    ], ''),
    end: 62,
  };
}

/** Pożar silnika 1 w przelocie: alarm ECAM i procedura (wykonane polecenia znikają z listy). */
function engineFire(t: number): Sc {
  const fire = t >= 3 && t < 19;
  const idle = t >= 6;
  const off = t >= 9;
  const push = t >= 12;
  const disch = t >= 15;
  const lines = [
    !idle && '-THR LEVER 1 ........IDLE',
    !off && '-ENG MASTER 1 ........OFF',
    !push && '-ENG 1 FIRE P/B .....PUSH',
    !disch && '-AGENT 1 ...........DISCH',
  ].filter(Boolean) as string[];
  const spool = (v0: number, v1: number) => (off ? kf(t, [[9, v0], [16, v1]]) : v0);
  return {
    lever: [idle ? kf(t, [[6, 1], [7, 0]]) : 1, 1],
    n1: [spool(86, 8), 86],
    n3: [spool(93, 12), 93],
    egt: [off ? kf(t, [[9, 682], [18, 260]]) : 682, 688],
    ff: [off ? 0 : idle ? 900 : 3150, 3120],
    masters: [!off, true],
    fire: [fire, false],
    firePb: [push, false],
    agent: [disch, false],
    masterWarn: fire,
    warning: t >= 3 ? (lines.length && t < 19 ? { title: 'ENG 1 FIRE', color: AIRBUS.red, master: fire, lines } : null) : null,
    memo: t >= 19 ? [['ENG 1 SHUT DOWN', AIRBUS.amber]] : [],
    page: 'ENG',
    act: actAt(t, [[6, 'THR'], [9, 'MASTER 1'], [12, 'FIRE 1'], [15, 'AGENT 1']]),
    crew: ev(t, [
      [0, 'Spokojny przelot na wysokości ok. 11 300 m.'],
      [3, 'Czujniki wykrywają ogień w gondoli silnika 1. Dzwonek, czerwona lampka MASTER WARN i alarm na ECAM.'],
      [6, 'Piloci wykonują listę z ekranu: najpierw dźwignia ciągu 1 na bieg jałowy.'],
      [9, 'ENG MASTER 1 na OFF – odcięte paliwo, silnik się zatrzymuje.'],
      [12, 'Przycisk ENG 1 FIRE wciśnięty: zamknięte zawory paliwa, powietrza i płynu hydraulicznego, gaśnica gotowa.'],
      [15, 'AGENT 1 – butla wypuszcza środek gaśniczy do gondoli.'],
      [19, 'Ogień zgaszony. Samolot leci dalej na jednym silniku do najbliższego lotniska.'],
    ], ''),
    end: 26,
  };
}

/** Przygotowanie kokpitu od zera: akumulatory, zasilanie z lotniska, APU, ADIRS, światła i napisy. */
function preflight(t: number): Sc {
  const on = (k: string, at: number) => ({ [k]: t >= at });
  const apuStart = t >= 11;
  const avail = t >= 22;
  return {
    power: t < 1 ? 0 : t < 5 ? 0.5 : 1,
    oh: {
      ...OH_COLD,
      ...on('BAT1', 1),
      ...on('BAT2', 2.5),
      EXT_AV: true,
      ...on('EXT', 5),
      ...on('APU_MASTER', 8),
      APU_START: apuStart && !avail,
      APU_AVAIL: avail,
      APU_GEN: t >= 5,
      ...on('APU_BLEED', 24),
      ...on('ADIRS1', 26),
      ...on('ADIRS2', 27),
      ...on('ADIRS3', 28),
      ...on('NAV', 30),
      ...on('BELTS', 32),
      NOSMOKE: t >= 32,
      ...on('BEACON', 34),
      PUMPS: t >= 5,
    },
    memo: [...(avail ? ([['APU AVAIL', AIRBUS.green]] as [string, string][]) : []), ...(t >= 24 ? ([['APU BLEED', AIRBUS.green]] as [string, string][]) : [])],
    page: 'ELEC',
    fma: t >= 5 ? ['', '', '', '', '1FD2'] : ['', '', '', '', ''],
    act: actAt(t, [[1, 'BAT1'], [2.5, 'BAT2'], [5, 'EXT'], [8, 'APU_MASTER'], [11, 'APU_START'], [24, 'APU_BLEED'], [26, 'ADIRS1'], [27, 'ADIRS2'], [28, 'ADIRS3'], [30, 'NAV'], [32, 'BELTS'], [34, 'BEACON']]),
    crew: ev(t, [
      [0, 'Samolot stał w nocy na postoju – „zimny i ciemny”: bez prądu, ekrany czarne.'],
      [1, 'BAT 1 i BAT 2: akumulatory zasilają najważniejsze urządzenia. Zapala się część ekranów.'],
      [5, 'EXT PWR: prąd z wózka z agregatem na lotnisku (GPU) – teraz działa cały kokpit.'],
      [8, 'APU MASTER SW, a po chwili START: rusza mały silnik w ogonie.'],
      [22, 'Na przycisku START zapala się AVAIL – APU jest gotowe.'],
      [24, 'APU BLEED: sprężone powietrze z APU do klimatyzacji kabiny.'],
      [26, 'Trzy pokrętła ADIRS na NAV: komputery położenia samolotu zaczynają ustalać, gdzie jest północ i gdzie stoimy.'],
      [30, 'Światła pozycyjne i logo, napisy „zapiąć pasy” i „nie palić”, a przed uruchomieniem silników – czerwona migająca lampa BEACON.'],
    ], ''),
    end: 40,
  };
}

/** Pulpit środkowy: rozruch silników, przygotowanie do startu i start. */
function pedestalDemo(t: number): Sc {
  if (t < 26) return { ...engStart(t), end: 106 };
  if (t < 32) {
    const tt = t - 26;
    return {
      ...engStart(26),
      engMode: 'NORM',
      conf: tt >= 2 ? '1+F' : '0',
      spd: { pos: 0, armed: tt >= 4 },
      oh: { ...LINEUP.oh },
      act: actAt(tt, [[0, 'ENG MODE'], [2, 'FLAPS'], [4, 'SPD BRK']]),
      crew: ev(tt, [
        [0, 'Przełącznik trybu z powrotem na NORM.'],
        [2, 'Dźwignia klap na 1+F – klapy i sloty wysuwają się do startu.'],
        [4, 'Dźwignia hamulców aerodynamicznych uzbrojona – po przerwanym starcie wysuną się same.'],
      ], ''),
      end: 106,
    };
  }
  return { ...takeoff(t - 32), end: 106 };
}

function scriptOf(s: Sim, dt: number): Sc {
  const t = s.t;
  switch (s.mode) {
    case 'pfd':
      return s.scn === 'turn' ? cruiseTurn(t, s, dt) : s.scn === 'approach' ? approach(t, s) : takeoff(t);
    case 'nd': {
      const c = cruiseTurn(Math.max(0, t - 10), s, dt);
      return {
        ...c,
        ndRange: ev(t, [[0, 80], [4, 160], [8, 40]], 80),
        target: s.st.hdg > 120 ? 'BAMSU' : 'ABUDO',
        act: t < 10 ? actAt(t, [[4, 'RANGE'], [8, 'RANGE']]) : c.act,
        crew:
          t < 4
            ? 'Mapa w zasięgu 80 mil morskich (ok. 150 km). Zielona linia to zaplanowana trasa, trójkąt na dole – nasz samolot.'
            : t < 8
              ? 'Pokrętło zasięgu na 160 NM – widać dalej, ale mniej szczegółów.'
              : t < 12
                ? 'Zasięg 40 NM – zbliżenie na najbliższy odcinek trasy.'
                : (c.crew ?? ''),
        end: 60,
      };
    }
    case 'ecam':
      return s.scn === 'fire' ? engineFire(t) : { ...engStart(t), end: 34 };
    case 'stick':
      return stickDemo(t, s, dt);
    case 'fcu':
      return fcuDemo(t, s, dt);
    case 'overhead':
      return preflight(t);
    case 'pedestal':
      return pedestalDemo(t);
    default:
      return {};
  }
}

/** Stan początkowy zakładki (przed „Rozpocznij”). */
function baseOf(mode: CkMode, scn: string): CkState {
  if (mode === 'pfd') return scn === 'turn' ? CRUISE : scn === 'approach' ? { ...CRUISE, alt: 1000, ground: false, hdg: 293, ias: 140, mach: undefined, tas: 145, conf: 'FULL', gear: { lever: 'down', state: 'down' } } : LINEUP;
  if (mode === 'ecam') return scn === 'fire' ? CRUISE : ENG_OFF;
  if (mode === 'stick') return { ...CRUISE, fma: ['SPEED', 'ALT', 'HDG', '', '1FD2\nA/THR'] };
  if (mode === 'fcu') return { ...CRUISE, alt: 32000, altSel: 32000, ias: 275, fma: ['SPEED', 'ALT', 'NAV', '', '1FD2\nA/THR'] };
  if (mode === 'overhead') return COLD;
  if (mode === 'pedestal') return ENG_OFF;
  return CRUISE;
}

function newSim(mode: CkMode, scn: string): Sim {
  const s: Sim = { t: 0, mode, scn, run: false, st: baseOf(mode, scn), dist: 0, end: 60 };
  s.st = { ...s.st, ...stripSc(scriptOf(s, 0)) };
  return s;
}
const stripSc = (x: Sc): Partial<CkState> => {
  const { fly: _f, end: _e, ...rest } = x;
  void _f;
  void _e;
  return rest;
};

function stepSim(s: Sim, dt: number) {
  if (!s.run) return;
  if (s.t > s.end + 6) return; // scenariusz skończony – stan zostaje
  s.t += dt;
  const x = scriptOf(s, dt);
  if (x.end !== undefined) s.end = x.end;
  const st = (s.st = { ...s.st, ...stripSc(x) });
  if (st.ground) st.alt = 0;
  if (x.fly) {
    st.alt = Math.max(0, st.alt + (st.vs * dt) / 60);
    const tas = st.alt > 20000 ? 488 : st.ias * (1 + st.alt / 60000);
    st.tas = tas;
    if (Math.abs(st.bank) > 0.2 && tas > 60) st.hdg = (((st.hdg + ((1091 * Math.tan((st.bank * Math.PI) / 180)) / tas) * dt) % 360) + 360) % 360;
  } else st.tas = st.ias;
  if (st.alt > 26000 && st.mach === undefined) st.mach = 0.85;
  s.dist += st.ias * 0.5144 * dt;
}

/* ======================= tekstury z SVG ======================= */

type CanvasTex = { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; w: number; h: number };
function makeCanvasTex(w: number, h: number): CanvasTex {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { c, ctx, tex, w, h };
}
function useCanvasTex(w: number, h: number) {
  const t = useMemo(() => makeCanvasTex(w, h), [w, h]);
  useEffect(() => () => t.tex.dispose(), [t]);
  return t;
}

/** Cel malowania: kanwa i (opcjonalnie) wycinek SVG – np. górna część ECAM na ekran EWD. */
type PaintTarget = { tex: CanvasTex; view?: (vb: { w: number; h: number }) => [number, number, number, number]; bg?: string };

/**
 * Maluje komponent SVG na kanwach tekstur: komponent renderuje się w ukrytym korzeniu Reacta, jego SVG zamienia się
 * w obrazek, a obrazek – w teksturę. Bez `keyOf` – odświeżanie co `period` s (ekrany), z `keyOf` – tylko po zmianie
 * klucza (panele).
 */
function SvgPainter({ render, targets, keyOf, period = 0.15 }: { render: () => ReactElement | null; targets: PaintTarget[]; keyOf?: () => string; period?: number }) {
  const host = useRef<{ div: HTMLDivElement; root: Root; busy: number; last: string; acc: number } | null>(null);
  useEffect(() => {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;opacity:0;';
    div.setAttribute('aria-hidden', 'true');
    document.body.appendChild(div);
    const root = createRoot(div);
    host.current = { div, root, busy: 0, last: '', acc: 1e9 };
    return () => {
      host.current = null;
      setTimeout(() => {
        root.unmount();
        div.remove();
      });
    };
  }, []);
  useFrame((_, dt) => {
    const h = host.current;
    if (!h || h.busy > 0) return;
    h.acc += dt;
    let key = '';
    if (keyOf) {
      key = keyOf();
      if (key === h.last || h.acc < 0.05) return;
    } else if (h.acc < period) return;
    h.acc = 0;
    h.last = key;
    const el = render();
    if (!el) {
      for (const tg of targets) {
        tg.tex.ctx.fillStyle = '#030405';
        tg.tex.ctx.fillRect(0, 0, tg.tex.w, tg.tex.h);
        tg.tex.tex.needsUpdate = true;
      }
      return;
    }
    flushSync(() => h.root.render(el));
    const svg = h.div.querySelector('svg');
    if (!svg) return;
    const vb0 = svg.viewBox.baseVal;
    const vb = { w: vb0?.width || svg.clientWidth || 360, h: vb0?.height || svg.clientHeight || 330 };
    for (const tg of targets) {
      const v = tg.view ? tg.view(vb) : [0, 0, vb.w, vb.h];
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('viewBox', v.join(' '));
      clone.setAttribute('width', String(tg.tex.w));
      clone.setAttribute('height', String(tg.tex.h));
      clone.setAttribute('preserveAspectRatio', 'xMidYMin meet');
      // styl (tło, zaokrąglenie) – zbędny na teksturze; czcionka ekranu zostaje jako atrybut
      const font = svg.style.fontFamily;
      clone.removeAttribute('style');
      if (font) clone.setAttribute('font-family', font);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const xml = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      h.busy++;
      img.onload = () => {
        const { ctx, w, h: hh } = tg.tex;
        ctx.fillStyle = tg.bg ?? '#05070a';
        ctx.fillRect(0, 0, w, hh);
        ctx.drawImage(img, 0, 0, w, hh);
        // SVG rysuje też to, co wystaje poza viewBox – zamalowujemy obszar poza wycinkiem (wyrównanym do góry, na środku)
        const k = Math.min(w / v[2], hh / v[3]);
        const cw = v[2] * k;
        const ch = v[3] * k;
        ctx.fillStyle = tg.bg ?? '#05070a';
        if (ch < hh - 0.5) ctx.fillRect(0, ch, w, hh - ch);
        if (cw < w - 0.5) {
          ctx.fillRect(0, 0, (w - cw) / 2, hh);
          ctx.fillRect((w + cw) / 2, 0, (w - cw) / 2, hh);
        }
        tg.tex.tex.needsUpdate = true;
        h.busy--;
      };
      img.onerror = () => {
        h.busy--;
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    }
  });
  return null;
}

/* ======================= lica paneli (SVG) ======================= */

const PANEL = '#5d6670';
const LEG = '#f2f4f6';
const LIT_OFF = '#2c3138';
const ACT = '#38d6ee';

/** Przycisk Airbusa na licu panelu: kwadrat z dwiema lampkami i podpisem. */
function pbSvg(key: string, x: number, y: number, label: string, top: [string, string, boolean] | null, bot: [string, string, boolean] | null, act: boolean, size = 54) {
  const lamp = (l: [string, string, boolean] | null, yy: number) =>
    l ? (
      <text x={x + size / 2} y={yy} fill={l[2] ? l[1] : LIT_OFF} fontSize={l[0].length > 5 ? 10 : 12.5} fontWeight={700} textAnchor="middle" fontFamily={cockpitFont}>
        {l[0]}
      </text>
    ) : null;
  return (
    <g key={key}>
      {act && <rect x={x - 5} y={y - 5} width={size + 10} height={size + 10} rx={7} fill="none" stroke={ACT} strokeWidth={4} />}
      <rect x={x} y={y} width={size} height={size} rx={4} fill="#1c2025" stroke="#0d0f12" strokeWidth={2} />
      <line x1={x + 6} x2={x + size - 6} y1={y + size / 2} y2={y + size / 2} stroke="#30353c" strokeWidth={1.5} />
      {lamp(top, y + size / 2 - 8)}
      {lamp(bot, y + size - 9)}
      <text x={x + size / 2} y={y + size + 15} fill={LEG} fontSize={11} fontWeight={700} textAnchor="middle" fontFamily={cockpitFont}>
        {label}
      </text>
    </g>
  );
}
/** Przełącznik dźwigienkowy (światła, napisy) – położenie w górę (ON) albo w dół (OFF). */
function toggleSvg(key: string, x: number, y: number, label: string, on: boolean, act: boolean, labels: [string, string] = ['ON', 'OFF']) {
  return (
    <g key={key} fontFamily={cockpitFont}>
      {act && <rect x={x - 28} y={y - 32} width={56} height={92} rx={7} fill="none" stroke={ACT} strokeWidth={4} />}
      <text x={x} y={y - 18} fill={LEG} fontSize={9.5} textAnchor="middle">
        {labels[0]}
      </text>
      <rect x={x - 9} y={y - 12} width={18} height={36} rx={4} fill="#1c2025" />
      <rect x={x - 5} y={on ? y - 9 : y + 9} width={10} height={14} rx={3} fill="#c9ced4" />
      <text x={x} y={y + 38} fill={LEG} fontSize={9.5} textAnchor="middle">
        {labels[1]}
      </text>
      <text x={x} y={y + 54} fill={LEG} fontSize={11} fontWeight={700} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}
function sectionSvg(key: string, x: number, y: number, w: number, h: number, title: string) {
  return (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="none" stroke="#e6e9ec" strokeOpacity={0.55} strokeWidth={2} />
      <rect x={x + w / 2 - title.length * 5 - 8} y={y - 9} width={title.length * 10 + 16} height={18} fill={PANEL} />
      <text x={x + w / 2} y={y + 5} fill={LEG} fontSize={13} fontWeight={700} textAnchor="middle" fontFamily={cockpitFont} letterSpacing="0.12em">
        {title}
      </text>
    </g>
  );
}

/** Panel górny (widok od dołu: góra rysunku – tył kokpitu, dół – przy przedniej szybie). */
function OverheadSvg({ st }: { st: CkState }) {
  const o = st.oh;
  const p = st.power > 0;
  const L = (on: boolean) => p && on;
  const a = (k: string) => st.act === k;
  const engRun = (i: number) => st.n3[i] > 60;
  const knob = (key: string, x: number, y: number, label: string, on: boolean) => (
    <g key={key} fontFamily={cockpitFont}>
      {a(key) && <circle cx={x} cy={y} r={40} fill="none" stroke={ACT} strokeWidth={4} />}
      <text x={x - 26} y={y - 22} fill={LEG} fontSize={9} textAnchor="middle">
        OFF
      </text>
      <text x={x} y={y - 31} fill={LEG} fontSize={9} textAnchor="middle">
        NAV
      </text>
      <text x={x + 27} y={y - 22} fill={LEG} fontSize={9} textAnchor="middle">
        ATT
      </text>
      <circle cx={x} cy={y} r={20} fill="#16191d" stroke="#0a0b0d" strokeWidth={2} />
      <rect x={x - 3.5} y={y - 19} width={7} height={22} rx={2} fill="#d9dde2" transform={`rotate(${on ? 0 : -50} ${x} ${y})`} />
      <text x={x} y={y + 38} fill={LEG} fontSize={11} fontWeight={700} textAnchor="middle">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 1000 920" width={1000} height={920}>
      <rect x={0} y={0} width={1000} height={920} fill={PANEL} />
      {/* rząd 1: ADIRS i elektryka */}
      {sectionSvg('s-adirs', 20, 25, 300, 185, 'ADIRS')}
      {knob('ADIRS1', 75, 120, 'IR 1', o.ADIRS1)}
      {knob('ADIRS2', 170, 120, 'IR 2', o.ADIRS2)}
      {knob('ADIRS3', 265, 120, 'IR 3', o.ADIRS3)}
      {sectionSvg('s-elec', 340, 25, 640, 185, 'ELEC')}
      {pbSvg('BAT1', 365, 70, 'BAT 1', ['FAULT', AIRBUS.amber, false], ['OFF', LEG, L(true) && !o.BAT1 && st.power > 0], a('BAT1'))}
      {pbSvg('BAT2', 440, 70, 'BAT 2', ['FAULT', AIRBUS.amber, false], ['OFF', LEG, L(true) && !o.BAT2 && st.power > 0], a('BAT2'))}
      {pbSvg('EXT', 535, 70, 'EXT PWR', ['AVAIL', AIRBUS.green, L(o.EXT_AV && !o.EXT)], ['ON', AIRBUS.cyan, L(o.EXT)], a('EXT'))}
      {pbSvg('APU_GEN', 630, 70, 'APU GEN', ['FAULT', AIRBUS.amber, false], ['OFF', LEG, L(!o.APU_GEN)], false)}
      {['1A', '1B', '2A', '2B'].map((g, i) =>
        pbSvg('GEN' + g, 715 + i * 66, 70, 'GEN ' + g, ['FAULT', AIRBUS.amber, L(!engRun(i < 2 ? 0 : 1))], ['OFF', LEG, false], false, 50),
      )}
      {/* rząd 2: gaszenie silników, APU, powietrze */}
      {sectionSvg('s-fire', 20, 245, 300, 185, 'ENG FIRE')}
      {[0, 1].map((i) => (
        <g key={'f' + i}>
          {(a(`FIRE ${i + 1}`) || a(`AGENT ${i + 1}`)) && <rect x={42 + i * 145} y={268} width={120} height={150} rx={8} fill="none" stroke={ACT} strokeWidth={4} />}
          <rect x={52 + i * 145} y={278} width={100} height={46} rx={6} fill={st.fire[i] && p ? '#ff3b30' : '#6b1a16'} stroke="#2b0806" strokeWidth={3} />
          <text x={102 + i * 145} y={307} fill={st.fire[i] && p ? '#fff' : '#d8a3a0'} fontSize={14} fontWeight={700} textAnchor="middle" fontFamily={cockpitFont}>
            {st.firePb[i] ? 'PUSHED' : `ENG ${i + 1}`}
          </text>
          {pbSvg('AG' + i, 75 + i * 145, 340, `AGENT ${i + 1}`, ['SQUIB', LEG, L(st.firePb[i] && !st.agent[i])], ['DISCH', AIRBUS.amber, L(st.agent[i])], false, 50)}
        </g>
      ))}
      {sectionSvg('s-apu', 340, 245, 240, 185, 'APU')}
      {pbSvg('APU_FIRE', 355, 290, 'FIRE', ['FIRE', AIRBUS.red, false], null, false, 50)}
      {pbSvg('APU_MASTER', 430, 290, 'MASTER SW', ['FAULT', AIRBUS.amber, false], ['ON', AIRBUS.cyan, L(o.APU_MASTER)], a('APU_MASTER'), 50)}
      {pbSvg('APU_START', 510, 290, 'START', ['AVAIL', AIRBUS.green, L(o.APU_AVAIL)], ['ON', AIRBUS.cyan, L(o.APU_START)], a('APU_START'), 50)}
      {sectionSvg('s-air', 600, 245, 380, 185, 'AIR')}
      {pbSvg('PACK1', 615, 290, 'PACK 1', ['FAULT', AIRBUS.amber, false], ['OFF', LEG, L(!o.PACK1)], a('PACK1'), 50)}
      {pbSvg('ENGB1', 685, 290, 'ENG 1 BLEED', ['FAULT', AIRBUS.amber, false], ['OFF', LEG, L(!o.ENG_BLEED)], false, 50)}
      {pbSvg('APU_BLEED', 765, 290, 'APU BLEED', ['FAULT', AIRBUS.amber, false], ['ON', AIRBUS.cyan, L(o.APU_BLEED)], a('APU_BLEED'), 50)}
      {pbSvg('ENGB2', 845, 290, 'ENG 2 BLEED', ['FAULT', AIRBUS.amber, false], ['OFF', LEG, L(!o.ENG_BLEED)], false, 50)}
      {pbSvg('PACK2', 915, 290, 'PACK 2', ['FAULT', AIRBUS.amber, false], ['OFF', LEG, L(!o.PACK2)], a('PACK2'), 50)}
      {/* rząd 3: paliwo i ochrona przed oblodzeniem */}
      {sectionSvg('s-fuel', 20, 465, 560, 165, 'FUEL')}
      {['L 1', 'L 2', 'CTR L', 'CTR R', 'R 1', 'R 2'].map((n, i) => pbSvg('P' + i, 45 + i * 90, 500, 'PUMP ' + n, ['FAULT', AIRBUS.amber, false], ['OFF', LEG, L(!o.PUMPS)], false, 50))}
      {sectionSvg('s-ice', 600, 465, 380, 165, 'ANTI ICE')}
      {pbSvg('WAI', 630, 500, 'WING', ['FAULT', AIRBUS.amber, false], ['ON', AIRBUS.cyan, L(o.WING_AI)], false, 50)}
      {pbSvg('EAI1', 730, 500, 'ENG 1', ['FAULT', AIRBUS.amber, false], ['ON', AIRBUS.cyan, L(o.ENG_AI)], false, 50)}
      {pbSvg('EAI2', 830, 500, 'ENG 2', ['FAULT', AIRBUS.amber, false], ['ON', AIRBUS.cyan, L(o.ENG_AI)], false, 50)}
      {/* rząd 4 (przy szybie): światła zewnętrzne i napisy */}
      {sectionSvg('s-ext', 20, 665, 640, 235, 'EXT LT')}
      {toggleSvg('STROBE', 75, 745, 'STROBE', o.STROBE, a('STROBE'))}
      {toggleSvg('BEACON', 150, 745, 'BEACON', o.BEACON, a('BEACON'))}
      {toggleSvg('WING', 225, 745, 'WING', false, false)}
      {toggleSvg('NAV', 300, 745, 'NAV & LOGO', o.NAV, a('NAV'))}
      {toggleSvg('RWY', 395, 745, 'RWY TURN OFF', o.NOSE, false)}
      {toggleSvg('LAND', 490, 745, 'LAND', o.LAND, a('LAND'))}
      {toggleSvg('NOSE', 585, 745, 'NOSE', o.NOSE, a('NOSE'), ['T.O', 'OFF'])}
      {sectionSvg('s-signs', 680, 665, 300, 235, 'SIGNS')}
      {toggleSvg('BELTS', 750, 745, 'SEAT BELTS', o.BELTS, a('BELTS'))}
      {toggleSvg('NOSMOKE', 850, 745, 'NO SMOKING', o.NOSMOKE, false)}
      {toggleSvg('EMER', 935, 745, 'EMER EXIT', true, false, ['ARM', 'OFF'])}
    </svg>
  );
}

/** Panel autopilota FCU na osłonie przeciwsłonecznej: prędkość, kurs, przyciski AP, wysokość, prędkość pionowa. */
function FcuSvg({ st, width = 800 }: { st: CkState; width?: number }) {
  const f = st.fcu;
  const p = st.power > 0.6;
  const a = (k: string) => st.act === k;
  const ORANGE = '#ffb347';
  const win = (x: number, w: number, txt: string, dot: boolean) => (
    <g>
      <rect x={x} y={30} width={w} height={34} rx={3} fill="#0b0c0e" />
      {p && (
        <text x={x + w / 2} y={56} fill={ORANGE} fontSize={24} fontWeight={700} textAnchor="middle" fontFamily={cockpitFont} letterSpacing="0.08em">
          {txt}
        </text>
      )}
      {p && dot && <circle cx={x + w - 10} cy={47} r={4.5} fill={ORANGE} />}
    </g>
  );
  const knobAt = (k: string, cx: number) => (
    <g>
      {a(k) && <circle cx={cx} cy={84} r={21} fill="none" stroke={ACT} strokeWidth={3.5} />}
      <circle cx={cx} cy={84} r={15} fill="#16191d" stroke="#0a0b0d" strokeWidth={2} />
      <circle cx={cx} cy={84} r={6} fill="#30363d" />
    </g>
  );
  const btn = (k: string, x: number, y: number, label: string, on: boolean) => (
    <g key={k}>
      {a(k) && <rect x={x - 4} y={y - 4} width={56} height={36} rx={5} fill="none" stroke={ACT} strokeWidth={3.5} />}
      <rect x={x} y={y} width={48} height={28} rx={3} fill="#1c2025" stroke="#0d0f12" />
      <rect x={x + 12} y={y + 5} width={24} height={4} rx={1} fill={p && on ? AIRBUS.green : LIT_OFF} />
      <text x={x + 24} y={y + 22} fill={LEG} fontSize={10} fontWeight={700} textAnchor="middle" fontFamily={cockpitFont}>
        {label}
      </text>
    </g>
  );
  const lab = (x: number, t: string) => (
    <text x={x} y={20} fill={LEG} fontSize={12} fontWeight={700} textAnchor="middle" fontFamily={cockpitFont} letterSpacing="0.1em">
      {t}
    </text>
  );
  const hdgTxt = f.hdg === null ? '---' : String(Math.round(f.hdg)).padStart(3, '0');
  const spdTxt = f.spd === null ? '---' : String(Math.round(f.spd));
  return (
    <svg viewBox="0 0 800 110" width={width} height={(width * 110) / 800}>
      <rect x={0} y={0} width={800} height={110} rx={6} fill={PANEL} />
      {lab(75, 'SPD  MACH')}
      {win(25, 100, spdTxt, f.spd === null)}
      {knobAt('SPD', 75)}
      {lab(230, 'HDG  TRK')}
      {win(180, 100, hdgTxt, f.hdg === null)}
      {knobAt('HDG', 230)}
      {btn('AP1', 330, 12, 'AP1', f.ap1)}
      {btn('AP2', 390, 12, 'AP2', f.ap2)}
      {btn('ATHR', 450, 12, 'A/THR', f.athr)}
      {btn('LOC', 330, 66, 'LOC', f.loc)}
      {btn('EXPED', 390, 66, 'EXPED', false)}
      {btn('APPR', 450, 66, 'APPR', f.appr)}
      {lab(600, 'ALT')}
      {win(540, 120, String(f.alt).padStart(5, '0'), true)}
      {knobAt('ALT', 600)}
      {lab(730, 'V/S  FPA')}
      {win(690, 80, f.vs === null ? '-----' : (f.vs >= 0 ? '+' : '') + String(f.vs).padStart(4, '0'), false)}
      {knobAt('VS', 730)}
    </svg>
  );
}

/** Panel EFIS (wybór trybu i zasięgu mapy ND, ciśnienie odniesienia). */
function EfisSvg({ st }: { st: CkState }) {
  const p = st.power > 0.6;
  return (
    <svg viewBox="0 0 320 90" width={320} height={90}>
      <rect x={0} y={0} width={320} height={90} rx={6} fill={PANEL} />
      <rect x={14} y={14} width={78} height={28} rx={3} fill="#0b0c0e" />
      {p && (
        <text x={53} y={35} fill="#ffb347" fontSize={17} fontWeight={700} textAnchor="middle" fontFamily={cockpitFont}>
          {st.alt > 18000 ? 'STD' : '1013'}
        </text>
      )}
      <circle cx={53} cy={66} r={13} fill="#16191d" />
      <text x={150} y={22} fill={LEG} fontSize={10} fontWeight={700} textAnchor="middle" fontFamily={cockpitFont}>
        ND MODE
      </text>
      <circle cx={150} cy={52} r={18} fill="#16191d" />
      <rect x={147} y={36} width={6} height={16} rx={2} fill="#d9dde2" transform="rotate(30 150 52)" />
      <text x={250} y={22} fill={LEG} fontSize={10} fontWeight={700} textAnchor="middle" fontFamily={cockpitFont}>
        RANGE
      </text>
      {st.act === 'RANGE' && <circle cx={250} cy={52} r={26} fill="none" stroke={ACT} strokeWidth={3.5} />}
      <circle cx={250} cy={52} r={18} fill="#16191d" />
      <rect x={247} y={36} width={6} height={16} rx={2} fill="#d9dde2" transform={`rotate(${[10, 20, 40, 80, 160, 320].indexOf(st.ndRange) * 30 - 75} 250 52)`} />
      <text x={250} y={86} fill={LEG} fontSize={11} textAnchor="middle" fontFamily={cockpitFont}>
        {st.ndRange} NM
      </text>
    </svg>
  );
}

/** Wierzch pulpitu środkowego (góra rysunku – przód kokpitu). */
function PedestalSvg({ st }: { st: CkState }) {
  const p = st.power > 0;
  const a = (k: string) => st.act === k;
  const modes = ['CRANK', 'NORM', 'IGN/START'] as const;
  const mi = modes.indexOf(st.engMode);
  const T = (x: number, y: number, t: string, s = 13, c = LEG, anchor: 'start' | 'middle' | 'end' = 'middle') => (
    <text x={x} y={y} fill={c} fontSize={s} fontWeight={700} textAnchor={anchor} fontFamily={cockpitFont}>
      {t}
    </text>
  );
  const kccu = (x: number) => (
    <g>
      <rect x={x} y={790} width={240} height={300} rx={10} fill="#3d444c" stroke="#262b30" strokeWidth={3} />
      {Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 10 }, (_, c) => <rect key={r * 10 + c} x={x + 12 + c * 22} y={810 + r * 26} width={18} height={20} rx={3} fill="#1b1f24" />),
      )}
      <rect x={x + 12} y={918} width={216} height={70} rx={6} fill="#1b1f24" />
      <circle cx={x + 120} cy={1040} r={30} fill="#111418" stroke="#4b5560" strokeWidth={3} />
      <circle cx={x + 114} cy={1034} r={9} fill="#3a4450" />
      {T(x + 120, 1084, 'KCCU', 11)}
    </g>
  );
  return (
    <svg viewBox="0 0 560 1160" width={560} height={1160}>
      <rect x={0} y={0} width={560} height={1160} fill={PANEL} />
      {/* kwadrant dźwigni ciągu */}
      <rect x={180} y={170} width={200} height={340} rx={14} fill="#7d9bb3" />
      {[230, 330].map((x) => (
        <rect key={x} x={x - 9} y={190} width={18} height={300} rx={8} fill="#1b1f24" />
      ))}
      {(
        [
          ['TOGA', 205],
          ['FLX MCT', 265],
          ['CL', 320],
          ['0', 400],
          ['REV', 465],
        ] as [string, number][]
      ).map(([t, y]) => (
        <g key={t}>
          <line x1={190} x2={208} y1={y} y2={y} stroke={LEG} strokeWidth={2} />
          <line x1={352} x2={370} y1={y} y2={y} stroke={LEG} strokeWidth={2} />
          {T(280, y + 5, t, 12)}
        </g>
      ))}
      {a('THR') && <rect x={172} y={162} width={216} height={356} rx={18} fill="none" stroke={ACT} strokeWidth={5} />}
      {/* hamulce aerodynamiczne (lewa strona) i klapy (prawa) */}
      <rect x={90} y={200} width={16} height={260} rx={7} fill="#1b1f24" />
      {T(98, 186, 'SPEED BRAKE', 11)}
      {(
        [
          ['RET', 220],
          ['1/2', 330],
          ['FULL', 440],
        ] as [string, number][]
      ).map(([t, y]) => (
        <g key={t}>{T(72, y + 4, t, 11, LEG, 'end')}</g>
      ))}
      {a('SPD BRK') && <rect x={30} y={170} width={110} height={300} rx={12} fill="none" stroke={ACT} strokeWidth={5} />}
      <rect x={454} y={200} width={16} height={260} rx={7} fill="#1b1f24" />
      {T(462, 186, 'FLAPS', 12)}
      {(
        [
          ['0', 215],
          ['1', 268],
          ['2', 321],
          ['3', 374],
          ['FULL', 440],
        ] as [string, number][]
      ).map(([t, y]) => (
        <g key={t}>{T(490, y + 4, t, 11, LEG, 'start')}</g>
      ))}
      {a('FLAPS') && <rect x={425} y={170} width={115} height={300} rx={12} fill="none" stroke={ACT} strokeWidth={5} />}
      {/* rozruch silników */}
      <rect x={150} y={535} width={260} height={210} rx={10} fill="none" stroke="#e6e9ec" strokeOpacity={0.55} strokeWidth={2} />
      {T(280, 556, 'ENG', 13)}
      {[0, 1].map((i) => (
        <g key={i}>
          {a(`MASTER ${i + 1}`) && <rect x={190 + i * 110} y={565} width={70} height={110} rx={8} fill="none" stroke={ACT} strokeWidth={5} />}
          {T(225 + i * 110, 582, `MASTER ${i + 1}`, 10)}
          <rect x={205 + i * 110} y={590} width={40} height={20} rx={3} fill="#1c2025" />
          {T(225 + i * 110, 605, 'FIRE', 10, p && st.fire[i] ? AIRBUS.red : LIT_OFF)}
          <rect x={205 + i * 110} y={645} width={40} height={20} rx={3} fill="#1c2025" />
          {T(225 + i * 110, 660, 'FAULT', 10, LIT_OFF)}
          {T(225 + i * 110, 690, st.masters[i] ? 'ON' : 'OFF', 10)}
        </g>
      ))}
      {a('ENG MODE') && <circle cx={280} cy={712} r={34} fill="none" stroke={ACT} strokeWidth={5} />}
      <circle cx={280} cy={712} r={20} fill="#16191d" />
      <rect x={276} y={692} width={8} height={22} rx={2} fill="#d9dde2" transform={`rotate(${(mi - 1) * 55} 280 712)`} />
      {T(232, 700, 'CRANK', 9, LEG, 'end')}
      {T(280, 685, 'NORM', 9)}
      {T(330, 700, 'IGN/START', 9, LEG, 'start')}
      {/* hamulec postojowy */}
      <circle cx={480} cy={640} r={24} fill="#16191d" stroke="#0a0b0d" strokeWidth={2} />
      {T(480, 685, 'PARK BRK', 11)}
      {T(480, 704, st.ground && st.ias < 1 && st.lever[0] < 0.5 ? 'ON' : 'OFF', 10)}
      {kccu(20)}
      {kccu(300)}
    </svg>
  );
}

/** Zapasowy wskaźnik (ISIS): mały sztuczny horyzont, prędkość i wysokość. */
function IsisSvg({ st }: { st: CkState }) {
  const pitchPx = st.pitch * 3;
  return (
    <svg viewBox="0 0 200 200" width={200} height={200}>
      <defs>
        <clipPath id="isis">
          <rect x={40} y={20} width={120} height={160} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={200} height={200} fill="#05070a" />
      <g clipPath="url(#isis)">
        <g transform={`rotate(${-st.bank} 100 100) translate(0 ${pitchPx})`}>
          <rect x={-100} y={-200} width={400} height={300} fill={AIRBUS.sky} />
          <rect x={-100} y={100} width={400} height={300} fill={AIRBUS.ground} />
          <line x1={-100} x2={300} y1={100} y2={100} stroke="#fff" strokeWidth={2} />
        </g>
      </g>
      <path d="M70 100 H92 M108 100 H130" stroke={AIRBUS.yellow} strokeWidth={5} />
      <text x={20} y={105} fill="#fff" fontSize={15} textAnchor="middle" fontFamily={cockpitFont}>
        {Math.round(st.ias)}
      </text>
      <text x={182} y={105} fill="#fff" fontSize={12} textAnchor="middle" fontFamily={cockpitFont}>
        {Math.round(st.alt / 100)}
      </text>
    </svg>
  );
}

/** OIT – ekran z dokumentacją i dziennikiem lotu (po bokach kokpitu). */
function OitSvg() {
  const rows = ['FLIGHT OPS', 'eLogbook', 'Charts', 'Checklists', 'Performance', 'Weather'];
  return (
    <svg viewBox="0 0 300 390" width={300} height={390}>
      <rect x={0} y={0} width={300} height={390} fill="#0d1420" />
      <rect x={0} y={0} width={300} height={44} fill="#1d3557" />
      <text x={16} y={29} fill="#fff" fontSize={17} fontWeight={700} fontFamily={cockpitFont}>
        OIT
      </text>
      {rows.map((r, i) => (
        <g key={r}>
          <rect x={14} y={60 + i * 52} width={272} height={42} rx={5} fill={i === 3 ? '#2a4a7a' : '#16223a'} />
          <text x={28} y={87 + i * 52} fill="#dbe6f5" fontSize={15} fontFamily={cockpitFont}>
            {r}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ======================= model 3D ======================= */

function Bx({ p, s, c, r, rough = 0.7, metal = 0.05, emit }: { p: V3; s: V3; c: string; r?: V3; rough?: number; metal?: number; emit?: string }) {
  return (
    <mesh position={p} rotation={r}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={rough} metalness={metal} emissive={emit ?? '#000'} emissiveIntensity={emit ? 1.2 : 0} />
    </mesh>
  );
}
/** Płaski czworokąt z czterech punktów (szyby i osłony boczne). */
function Quad({ pts, c, opacity = 1, side = THREE.DoubleSide }: { pts: V3[]; c: string; opacity?: number; side?: THREE.Side }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const [a, b, cc, d] = pts;
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...cc, ...a, ...cc, ...d], 3));
    g.computeVertexNormals();
    return g;
  }, [pts]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={c} side={side} transparent={opacity < 1} opacity={opacity} roughness={opacity < 1 ? 0.05 : 0.75} depthWrite={opacity >= 1} />
    </mesh>
  );
}

const C_LINING = '#d3d7dc';
const C_PANEL = '#5d6670';
const C_DARK = '#25292e';
const C_SEAT = '#2a2f37';

/** Ekran: ramka i obraz z tekstury (bez zasilania – czarny). */
function Screen({ w, h, tex, on, p, glow }: { w: number; h: number; tex: CanvasTex; on: () => boolean; p: V3; glow?: () => boolean }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const frame = useRef<THREE.Group>(null);
  useFrame(() => {
    const m = mat.current;
    if (m) {
      const lit = on();
      if ((m.map !== null) !== lit) {
        m.map = lit ? tex.tex : null;
        m.color.set(lit ? '#ffffff' : '#050607');
        m.needsUpdate = true;
      }
    }
    if (frame.current) frame.current.visible = glow ? glow() : false;
  });
  const t = 0.008;
  return (
    <group position={p}>
      <Bx p={[0, 0, -0.008]} s={[w + 0.035, h + 0.035, 0.02]} c="#15181c" rough={0.5} />
      <mesh position={[0, 0, 0.0035]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial ref={mat} toneMapped={false} />
      </mesh>
      {/* podświetlenie ekranu omawianego w zakładce: obwódka dookoła */}
      <group ref={frame} visible={false}>
        {(
          [
            [0, h / 2 + 0.024, w + 0.07, t],
            [0, -h / 2 - 0.024, w + 0.07, t],
            [w / 2 + 0.031, 0, t, h + 0.056],
            [-w / 2 - 0.031, 0, t, h + 0.056],
          ] as [number, number, number, number][]
        ).map(([x, y, ww, hh], i) => (
          <mesh key={i} position={[x, y, 0.006]}>
            <planeGeometry args={[ww, hh]} />
            <meshBasicMaterial color={ACT} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
/** Lico panelu z tekstury (oświetlone jak reszta wnętrza). */
function Face({ w, h, tex, p, r }: { w: number; h: number; tex: CanvasTex; p: V3; r?: V3 }) {
  return (
    <mesh position={p} rotation={r}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex.tex} roughness={0.75} metalness={0.05} />
    </mesh>
  );
}

/** Fotel pilota. */
function Seat({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0.42]}>
      <Bx p={[0, 0.2, 0]} s={[0.22, 0.4, 0.3]} c="#3a4048" />
      <Bx p={[0, 0.46, 0.02]} s={[0.52, 0.12, 0.52]} c={C_SEAT} rough={0.85} />
      <Bx p={[0, 0.88, 0.27]} s={[0.5, 0.76, 0.12]} c={C_SEAT} r={[-0.16, 0, 0]} rough={0.85} />
      <Bx p={[0, 1.34, 0.36]} s={[0.3, 0.2, 0.1]} c={C_SEAT} r={[-0.16, 0, 0]} rough={0.85} />
      {[-1, 1].map((k) => (
        <Bx key={k} p={[k * 0.3, 0.66, 0.06]} s={[0.07, 0.06, 0.42]} c="#3a4048" />
      ))}
      {/* szelki */}
      {[-0.09, 0.09].map((dx) => (
        <Bx key={dx} p={[dx, 0.92, 0.2]} s={[0.04, 0.6, 0.012]} c="#4b5563" r={[-0.16, 0, 0]} />
      ))}
    </group>
  );
}

/** Boczny drążek z podstawą na pulpicie bocznym; `get` – wychylenie [w bok, do siebie]. */
function SideStick({ x, get }: { x: number; get: () => [number, number] }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const [sx, sy] = get();
    if (g.current) {
      g.current.rotation.z += (-sx * 0.32 - g.current.rotation.z) * 0.3;
      g.current.rotation.x += (sy * 0.3 - g.current.rotation.x) * 0.3;
    }
  });
  return (
    <group position={[x, 0.66, 0.05]}>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.025, 24]} />
        <meshStandardMaterial color="#1c1f23" roughness={0.9} />
      </mesh>
      <group ref={g}>
        <mesh position={[0, 0.045, 0]}>
          <sphereGeometry args={[0.04, 16, 12]} />
          <meshStandardMaterial color="#121417" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.022, 0.017, 0.15, 16]} />
          <meshStandardMaterial color="#1d2024" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.2, -0.005]} scale={[1, 1.25, 1.15]}>
          <sphereGeometry args={[0.028, 16, 12]} />
          <meshStandardMaterial color="#1d2024" roughness={0.6} />
        </mesh>
        <mesh position={[x < 0 ? 0.012 : -0.012, 0.225, -0.012]}>
          <sphereGeometry args={[0.009, 12, 8]} />
          <meshStandardMaterial color="#d92c22" roughness={0.4} />
        </mesh>
      </group>
      {/* podłokietnik */}
      <Bx p={[0, 0.02, 0.27]} s={[0.12, 0.05, 0.3]} c="#2b3038" rough={0.9} />
    </group>
  );
}

/** Dźwignia na pulpicie: obraca się wokół osi poprzecznej; `get` – kąt (rad, + do tyłu). */
function Lever({ p, len, get, knob, color = '#1d2024', knobColor = '#d9dde2' }: { p: V3; len: number; get: () => number; knob: V3; color?: string; knobColor?: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.x += (get() - g.current.rotation.x) * 0.2;
  });
  return (
    <group position={p} ref={g}>
      <Bx p={[0, len / 2, 0]} s={[0.018, len, 0.018]} c={color} rough={0.5} metal={0.3} />
      <Bx p={[0, len, 0]} s={knob} c={knobColor} rough={0.4} metal={0.2} />
    </group>
  );
}

/** Lampka na osłonie (MASTER WARN / MASTER CAUT) – miga, gdy `get` zwraca true. */
function Annunciator({ p, color, get, label }: { p: V3; color: string; get: () => boolean; label: CanvasTex }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const m = mat.current;
    if (!m) return;
    const on = get() && Math.sin(clock.elapsedTime * 7) > -0.3;
    m.emissiveIntensity = on ? 2.4 : 0.05;
  });
  return (
    <group position={p}>
      <mesh>
        <boxGeometry args={[0.07, 0.045, 0.012]} />
        <meshStandardMaterial ref={mat} color="#2a1210" emissive={color} emissiveIntensity={0.05} map={label.tex} />
      </mesh>
    </group>
  );
}

/** Napis lampki (MASTER WARN / CAUT) jako tekstura. */
function labelTex(text: string, color: string) {
  const t = makeCanvasTex(128, 80);
  t.ctx.fillStyle = '#1a1c1f';
  t.ctx.fillRect(0, 0, 128, 80);
  t.ctx.fillStyle = color;
  t.ctx.font = 'bold 24px Consolas, monospace';
  t.ctx.textAlign = 'center';
  text.split('\n').forEach((l, i) => t.ctx.fillText(l, 64, 34 + i * 28));
  t.tex.needsUpdate = true;
  return t;
}

/* ---------- otoczenie za oknami: niebo, ziemia, pas ---------- */

function skyGeo() {
  const g = new THREE.SphereGeometry(420, 48, 24);
  const pos = g.getAttribute('position');
  const col: number[] = [];
  const zen = new THREE.Color('#2f6fc0');
  const hor = new THREE.Color('#d7e6f3');
  const low = new THREE.Color('#9aaab8');
  const deep = new THREE.Color('#566472');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 420;
    if (y >= 0) c.copy(hor).lerp(zen, Math.pow(y, 0.55));
    else c.copy(low).lerp(deep, Math.pow(-y, 0.6));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function groundTex() {
  const t = makeCanvasTex(512, 512);
  const { ctx } = t;
  const cols = ['#6f7d4f', '#7c8a58', '#8a8f5c', '#66784a', '#93955f', '#75844f'];
  for (let i = 0; i < 64; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect((i % 8) * 64, Math.floor(i / 8) * 64, 64, 64);
  }
  ctx.strokeStyle = 'rgba(60,60,45,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 512);
    ctx.moveTo(0, i * 64);
    ctx.lineTo(512, i * 64);
    ctx.stroke();
  }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
  t.tex.repeat.set(30, 30);
  t.tex.needsUpdate = true;
  return t;
}
function runwayTex() {
  const t = makeCanvasTex(128, 512);
  const { ctx } = t;
  ctx.fillStyle = '#3c3f43';
  ctx.fillRect(0, 0, 128, 512);
  ctx.fillStyle = '#e9ecef';
  ctx.fillRect(6, 0, 4, 512);
  ctx.fillRect(118, 0, 4, 512);
  ctx.fillRect(61, 40, 6, 180);
  ctx.fillRect(61, 296, 6, 180);
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
  t.tex.repeat.set(1, 60);
  t.tex.needsUpdate = true;
  return t;
}

/** Niebo i ziemia za oknami – obracają się zgodnie z pochyleniem i przechyleniem samolotu. */
function Outside({ sim }: { sim: MutableRefObject<Sim> }) {
  const env = useRef<THREE.Group>(null);
  const ground = useRef<THREE.Group>(null);
  const sky = useMemo(skyGeo, []);
  const gt = useMemo(groundTex, []);
  const rt = useMemo(runwayTex, []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);
  useFrame(() => {
    const st = sim.current.st;
    const d2r = Math.PI / 180;
    // samolot: pochylenie (nos w górę – obrót wokół x) i przechylenie (w prawo – prawe skrzydło w dół)
    e.set(st.pitch * d2r, 0, -st.bank * d2r, 'YXZ');
    q.setFromEuler(e).invert();
    if (env.current) env.current.quaternion.copy(q);
    if (ground.current) {
      // oczy pilota ok. 6 m nad ziemią; wysokość lotu w skali sceny (ziemia znika w mgle już przy kilkuset metrach)
      ground.current.position.y = -(6 + st.alt * 0.3048) * K;
      const dist = sim.current.dist;
      ground.current.position.z = (dist * K) % (512 * K * 0.25);
      rt.tex.offset.y = -((dist / 25) % 1);
      ground.current.visible = st.alt < 2500;
    }
  });
  return (
    <group position={w3(0, 1.15, 0.3)}>
      <group ref={env}>
        <mesh geometry={sky}>
          <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
        </mesh>
        <group ref={ground}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[900, 48]} />
            <meshStandardMaterial map={gt.tex} roughness={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -1500]}>
            <planeGeometry args={[45 * K * 0.33, 3600]} />
            <meshStandardMaterial map={rt.tex} roughness={0.95} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Wnętrze kokpitu. Wszystkie wymiary w metrach (oś −z – do przodu, x – w prawo, podłoga y = 0). */
const CockpitModel = memo(function CockpitModel({ sim }: { sim: MutableRefObject<Sim> }) {
  const S = () => sim.current.st;
  // tekstury ekranów i paneli
  const pfdT = useCanvasTex(720, 660);
  const ndT = useCanvasTex(720, 660);
  const ewdT = useCanvasTex(720, 480);
  const sdT = useCanvasTex(720, 480);
  const ohT = useCanvasTex(1000, 920);
  const fcuT = useCanvasTex(1200, 165);
  const efisT = useCanvasTex(480, 135);
  const pedT = useCanvasTex(560, 1160);
  const isisT = useCanvasTex(200, 200);
  const oitT = useCanvasTex(300, 390);
  const warnT = useMemo(() => labelTex('MASTER\nWARN', '#ff6b5b'), []);
  const cautT = useMemo(() => labelTex('MASTER\nCAUT', '#ffb347'), []);
  const hl = (id: string) => () => highlightOf(sim.current) === id;
  const st0 = S();
  void st0;
  const pfdEl = () => {
    const s = S();
    return <Pfd pitch={s.pitch} bank={s.bank} ias={s.ias} iasTarget={s.fcu.spd ?? undefined} mach={s.mach} alt={s.alt} altSel={s.altSel ?? s.fcu.alt} vs={s.vs} heading={s.hdg} track={s.hdg} fma={s.fma} ra={s.alt < 2500 ? s.alt : undefined} vls={s.ground ? undefined : s.conf === 'FULL' ? 132 : 210} vmax={s.conf === '0' ? 340 : s.conf === 'FULL' ? 186 : 230} width={720} />;
  };
  const ndEl = () => {
    const s = S();
    return <Nd heading={s.hdg} gs={s.ground ? s.ias : s.tas - 20} tas={s.tas} wind={s.wind} range={s.ndRange} target={s.target} turnRadiusNm={Math.abs(s.bank) > 3 ? (s.tas * s.tas) / (68625 * Math.tan((s.bank * Math.PI) / 180)) : 0} width={720} />;
  };
  const ecamEl = () => <EcamFor st={S()} width={720} />;
  const SEP = 168;
  const band = (h: number) => Math.max(0, h - 480);
  return (
    <group scale={K}>
      <SvgPainter render={() => (S().power > 0 ? pfdEl() : null)} targets={[{ tex: pfdT }]} />
      <SvgPainter render={() => (S().power > 0.6 ? ndEl() : null)} targets={[{ tex: ndT }]} />
      <SvgPainter
        render={() => (S().power > 0 ? ecamEl() : null)}
        targets={[
          // górny ekran: tylko część nad granicą EWD / SD (reszta – czarne tło pod spodem)
          { tex: ewdT, view: (vb) => [0, 0, 360, SEP + band(vb.h)] },
          { tex: sdT, view: (vb) => [0, SEP + band(vb.h), 360, 312] },
        ]}
      />
      <SvgPainter render={() => <OverheadSvg st={S()} />} targets={[{ tex: ohT, bg: PANEL }]} keyOf={() => ohKey(S())} />
      <SvgPainter render={() => <FcuSvg st={S()} />} targets={[{ tex: fcuT, bg: PANEL }]} keyOf={() => fcuKey(S())} />
      <SvgPainter render={() => <EfisSvg st={S()} />} targets={[{ tex: efisT, bg: PANEL }]} keyOf={() => `${S().ndRange}|${S().act}|${S().power > 0.6}|${S().alt > 18000}`} />
      <SvgPainter render={() => <PedestalSvg st={S()} />} targets={[{ tex: pedT, bg: PANEL }]} keyOf={() => pedKey(S())} />
      <SvgPainter render={() => (S().power > 0 ? <IsisSvg st={S()} /> : null)} targets={[{ tex: isisT }]} keyOf={() => { const s = S(); return `${Math.round(s.pitch * 2)}|${Math.round(s.bank)}|${Math.round(s.ias)}|${Math.round(s.alt / 100)}|${s.power > 0}`; }} />
      <SvgPainter render={() => (S().power > 0.6 ? <OitSvg /> : null)} targets={[{ tex: oitT }]} keyOf={() => String(S().power > 0.6)} />

      {/* podłoga, ściany, sufit */}
      <Bx p={[0, -0.02, 0]} s={[2.9, 0.04, 2.6]} c="#3a3f46" rough={0.95} />
      {[-1, 1].map((k) => (
        <group key={k}>
          <Bx p={[k * 1.44, 0.5, 0.15]} s={[0.04, 1.0, 2.1]} c={C_LINING} />
          <Bx p={[k * 1.44, 1.78, 0.35]} s={[0.04, 0.42, 1.7]} c={C_LINING} />
          <Bx p={[k * 1.44, 1.27, 0.86]} s={[0.04, 0.6, 0.68]} c={C_LINING} />
          {/* słupki okien bocznych */}
          <Bx p={[k * 1.43, 1.27, -0.2]} s={[0.05, 0.6, 0.07]} c={C_DARK} />
          <Bx p={[k * 1.43, 1.27, 0.52]} s={[0.05, 0.6, 0.07]} c={C_DARK} />
          <Bx p={[k * 1.43, 1.0, 0.15]} s={[0.06, 0.05, 1.5]} c={C_DARK} />
          <Bx p={[k * 1.43, 1.56, 0.15]} s={[0.06, 0.05, 1.5]} c={C_DARK} />
          {/* okno boczne */}
          <Quad pts={[[k * 1.44, 1.02, -0.82], [k * 1.44, 1.54, -0.56], [k * 1.44, 1.54, 0.5], [k * 1.44, 1.02, 0.5]]} c="#bcd7ee" opacity={0.12} />
          {/* skośne okno przednie boczne i osłona pod nim */}
          <Quad pts={[[k * 0.84, 1.06, -1.1], [k * 0.84, 1.54, -0.525], [k * 1.42, 1.55, -0.56], [k * 1.42, 1.02, -0.85]]} c="#bcd7ee" opacity={0.12} />
          <Quad pts={[[k * 0.84, 1.06, -1.1], [k * 1.42, 1.02, -0.85], [k * 1.42, 0.0, -0.85], [k * 1.3, 0.0, -1.1]]} c={C_LINING} />
          <Bx p={[k * 1.13, 1.3, -0.84]} s={[0.05, 0.62, 0.05]} c={C_DARK} r={[0.6, k * 0.42, 0]} />
          <Bx p={[k * 0.84, 1.3, -0.81]} s={[0.05, 0.75, 0.05]} c={C_DARK} r={[0.87, 0, 0]} />
        </group>
      ))}
      {/* przednia szyba: dwie tafle i słupek środkowy */}
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * 0.42, 1.3, -0.81]} rotation={[0.87, 0, 0]}>
          <planeGeometry args={[0.84, 0.75]} />
          <meshStandardMaterial color="#bcd7ee" transparent opacity={0.1} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      <Bx p={[0, 1.3, -0.81]} s={[0.05, 0.75, 0.04]} c={C_DARK} r={[0.87, 0, 0]} />
      <Bx p={[0, 1.55, -0.53]} s={[1.7, 0.05, 0.06]} c={C_DARK} />
      {/* nadproże nad szybą, sufit i tylna ściana z drzwiami */}
      <Bx p={[0, 1.76, -0.52]} s={[2.88, 0.4, 0.04]} c={C_LINING} />
      <Bx p={[0, 2.0, 0.35]} s={[2.9, 0.04, 1.75]} c={C_LINING} />
      <Bx p={[0, 1.0, 1.22]} s={[2.9, 2.0, 0.04]} c={C_LINING} />
      <Bx p={[0.45, 0.95, 1.195]} s={[0.7, 1.85, 0.02]} c="#8d949c" />
      <Bx p={[0.2, 0.95, 1.18]} s={[0.04, 0.12, 0.03]} c="#d1d5db" metal={0.6} />

      {/* osłona przeciwsłoneczna (glareshield) z FCU, panelami EFIS i lampkami ostrzegawczymi */}
      <Bx p={[0, 1.06, -0.95]} s={[2.6, 0.1, 0.34]} c={C_DARK} rough={0.95} />
      <Face w={0.8} h={0.11} tex={fcuT} p={[0, 1.06, -0.777]} />
      {[-1, 1].map((k) => (
        <group key={k}>
          <Face w={0.3} h={0.085} tex={efisT} p={[k * 0.66, 1.06, -0.777]} />
          <Annunciator p={[k * 0.98, 1.075, -0.775]} color="#ff3b30" get={() => S().masterWarn} label={warnT} />
          <Annunciator p={[k * 0.98, 1.03, -0.775]} color="#ffb000" get={() => false} label={cautT} />
        </group>
      ))}

      {/* panel główny z ekranami (lekko odchylony do tyłu) */}
      <group position={[0, 0.8, -0.9]} rotation={[-0.17, 0, 0]}>
        <Bx p={[0, -0.03, -0.03]} s={[2.5, 0.54, 0.06]} c={C_PANEL} />
        <Screen w={0.33} h={0.3} tex={pfdT} p={[-0.86, 0.04, 0.003]} on={() => S().power > 0} glow={hl('pfd')} />
        <Screen w={0.33} h={0.3} tex={ndT} p={[-0.5, 0.04, 0.003]} on={() => S().power > 0.6} glow={hl('nd')} />
        <Screen w={0.33} h={0.22} tex={ewdT} p={[0, 0.08, 0.003]} on={() => S().power > 0} glow={hl('ewd')} />
        <Screen w={0.33} h={0.22} tex={sdT} p={[0, -0.15, 0.003]} on={() => S().power > 0.6} glow={hl('sd')} />
        <Screen w={0.33} h={0.3} tex={ndT} p={[0.5, 0.04, 0.003]} on={() => S().power > 0.6} glow={hl('nd')} />
        <Screen w={0.33} h={0.3} tex={pfdT} p={[0.86, 0.04, 0.003]} on={() => S().power > 0.6} glow={hl('pfd')} />
        {[-1, 1].map((k) => (
          <Screen key={k} w={0.19} h={0.25} tex={oitT} p={[k * 1.135, 0.02, 0.003]} on={() => S().power > 0.6} glow={hl('oit')} />
        ))}
        <Screen w={0.1} h={0.1} tex={isisT} p={[-0.25, 0.12, 0.003]} on={() => S().power > 0} glow={hl('isis')} />
        {/* dźwignia podwozia (z prawej strony dolnego ECAM) i pokrętło autobrake (z lewej) */}
        <GearLever3D get={() => S().gear.lever} />
        <mesh position={[-0.25, -0.15, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.03, 20]} />
          <meshStandardMaterial color="#16191d" />
        </mesh>
        {/* zegar */}
        <Bx p={[0.25, 0.12, 0.005]} s={[0.09, 0.09, 0.012]} c="#101215" />
      </group>
      {/* panel pod ekranami (do kolan) */}
      <Bx p={[0, 0.3, -0.98]} s={[2.5, 0.6, 0.08]} c={C_PANEL} />

      {/* pulpit środkowy */}
      <Bx p={[0, 0.355, -0.2]} s={[0.56, 0.71, 1.16]} c={C_PANEL} />
      <Face w={0.56} h={1.16} tex={pedT} p={[0, 0.711, -0.2]} r={[-Math.PI / 2, 0, 0]} />
      {/* dźwignie ciągu: 0 – bieg jałowy, 1 – CL, 1,5 – FLX, 2 – TOGA, < 0 – odwracacz */}
      {[0, 1].map((i) => (
        <Lever key={i} p={[i ? 0.05 : -0.05, 0.71, -0.4]} len={0.17} knob={[0.05, 0.03, 0.04]} knobColor="#2c3138" get={() => 0.35 - ((Math.max(-1, Math.min(2, S().lever[i])) + 1) / 3) * 0.95} />
      ))}
      {/* dźwignia klap (prawa) i hamulców aerodynamicznych (lewa) */}
      <Lever p={[0.18, 0.71, -0.42]} len={0.12} knob={[0.05, 0.025, 0.035]} get={() => -0.45 + ['0', '1', '1+F', '2', '3', 'FULL'].indexOf(S().conf) * 0.15} />
      <Lever p={[-0.18, 0.71, -0.42]} len={0.12} knob={[0.04, 0.025, 0.03]} knobColor="#e7e9ec" get={() => -0.4 + S().spd.pos * 0.7 - (S().spd.armed ? 0.05 : 0)} />
      {/* przełączniki ENG MASTER */}
      {[0, 1].map((i) => (
        <Lever key={'m' + i} p={[i ? 0.055 : -0.055, 0.71, -0.15]} len={0.04} knob={[0.025, 0.02, 0.025]} color="#9aa1a9" knobColor="#cfd3d8" get={() => (S().masters[i] ? -0.5 : 0.5)} />
      ))}

      {/* pulpity boczne z drążkami i kółkami sterowania na ziemi (tiller) */}
      {[-1, 1].map((k) => (
        <group key={k}>
          <Bx p={[k * 1.2, 0.33, -0.1]} s={[0.42, 0.66, 1.3]} c={C_PANEL} />
          <Bx p={[k * 1.2, 0.665, -0.1]} s={[0.42, 0.01, 1.3]} c="#59626c" />
          <SideStick x={k * 1.2} get={() => (k < 0 ? S().stick : [0, 0])} />
          <mesh position={[k * 1.2, 0.69, -0.35]}>
            <torusGeometry args={[0.055, 0.012, 10, 28]} />
            <meshStandardMaterial color="#1d2024" />
          </mesh>
          <mesh position={[k * 1.2, 0.68, -0.35]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.055, 0.012, 10, 28]} />
            <meshStandardMaterial color="#1d2024" />
          </mesh>
          {/* pedały steru kierunku */}
          {[-1, 1].map((j) => (
            <Pedal key={j} p={[k * 0.55 + j * 0.13, 0.16, -0.78]} get={() => (k < 0 ? S().pedals * j * -0.05 : 0)} />
          ))}
          <Seat x={k * 0.55} />
        </group>
      ))}

      {/* panel górny */}
      <group position={[0, 1.93, 0.0]} rotation={[Math.PI / 2 - 0.17, 0, 0]}>
        {/* lico patrzy w dół (lokalne +z), płyta panelu jest nad nim */}
        <Bx p={[0, 0, -0.032]} s={[1.04, 0.96, 0.06]} c={C_PANEL} />
        <Face w={1.0} h={0.92} tex={ohT} p={[0, 0, 0.0]} r={[0, 0, 0]} />
      </group>

      {/* oświetlenie wnętrza */}
      <pointLight position={[0, 1.85, 0.4]} intensity={0.6} distance={4} decay={2} color="#fff3e0" />
    </group>
  );
});

function Pedal({ p, get }: { p: V3; get: () => number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.position.z = p[2] + get();
  });
  return (
    <group ref={g} position={p}>
      <Bx p={[0, 0, 0]} s={[0.1, 0.2, 0.025]} c="#2b3038" r={[-0.35, 0, 0]} />
    </group>
  );
}

function GearLever3D({ get }: { get: () => 'up' | 'down' }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.position.y += ((get() === 'up' ? -0.1 : -0.2) - g.current.position.y) * 0.15;
  });
  return (
    <group>
      <Bx p={[0.25, -0.15, 0.003]} s={[0.05, 0.2, 0.01]} c="#1a1d21" />
      <group ref={g} position={[0.25, -0.2, 0.03]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.022, 0.022, 0.05, 20]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- klucze odświeżania paneli ---------- */

const ohKey = (s: CkState) => `${JSON.stringify(s.oh)}|${s.act}|${s.power}|${s.fire}|${s.firePb}|${s.agent}|${s.n3[0] > 60}|${s.n3[1] > 60}`;
const fcuKey = (s: CkState) => `${JSON.stringify(s.fcu)}|${s.act}|${s.power > 0.6}`;
const pedKey = (s: CkState) => `${s.engMode}|${s.masters}|${s.fire}|${s.act}|${s.power > 0}|${s.ground && s.ias < 1 && s.lever[0] < 0.5}`;

/** ECAM z danych stanu – ta sama wersja na ekranie w 3D i w doku. */
function EcamFor({ st, width = 238 }: { st: CkState; width?: number }) {
  const eng = (i: number) => ({ ff: st.ff[i], n2: st.n3[i] * 0.97, n3: st.n3[i], oilQ: 21, oilT: st.n3[i] > 10 ? 95 : 20, oilP: st.n3[i] > 10 ? 40 + st.n3[i] * 0.4 : 0, vib: [0.3, 0.4, 0.3] as [number, number, number] });
  const powered = st.power > 0.6;
  return (
    <Ecam
      thrMode={st.ground && st.lever[0] < 0.1 ? null : st.lever[0] > 1.25 ? ['FLX', 91] : ['CLB', 98]}
      n1={st.n1}
      egt={st.egt}
      rev={st.lever[0] < -0.1 ? [Math.min(1, -st.lever[0] * 1.5), Math.min(1, -st.lever[1] * 1.5)] : undefined}
      memo={st.memo}
      warning={st.warning}
      page={st.page}
      eng={[eng(0), eng(1)]}
      cruise={{ ff: st.ff, fu: [4210, 4180], deltaP: 8.3, cabAlt: 5900, cabVs: 0, temps: [22, 23, 22] }}
      elec={{
        gen: [st.n3[0] > 60, st.n3[0] > 60, st.n3[1] > 60, st.n3[1] > 60],
        apu: st.oh.APU_AVAIL && st.oh.APU_GEN,
        ext: st.oh.EXT,
        rat: false,
        bat: st.oh.BAT1 || st.oh.BAT2,
        bus: { ac1: powered, ac2: powered, acEss: powered, dc1: powered, dc2: powered, dcEss: st.power > 0 },
      }}
      footer={{ tat: st.ground ? 15 : -36, sat: st.ground ? 15 : -56, isa: 0, gw: 268400, gwcg: 28.6, fob: 64200 }}
      width={width}
    />
  );
}

// w doku ECAM stoi w miejscu wyświetlaczy (prawy górny róg), a nie przełączników
(EcamFor as unknown as { cockpitSlot: string }).cockpitSlot = 'ecam';

/* ======================= podpisy części (strona główna) ======================= */

type Part = { name: string; desc: string; pos: V3; color: string };
const PARTS: Record<string, Part> = {
  pfd: { name: 'PFD – główny ekran lotu', color: '#7cc7ff', pos: [-0.86, 1.02, -0.86], desc: 'Najważniejszy ekran pilota: sztuczny horyzont (położenie samolotu względem ziemi), prędkość, wysokość, prędkość wznoszenia i kurs. U góry – pasek trybów autopilota. Każdy pilot ma swój PFD tuż przed sobą.' },
  nd: { name: 'ND – ekran nawigacyjny', color: '#7cc7ff', pos: [-0.5, 1.02, -0.86], desc: 'Mapa widziana z góry: zaplanowana trasa, punkty nawigacyjne, wiatr, a na życzenie obraz radaru pogodowego i inne samoloty w pobliżu. Na ziemi pokazuje plan lotniska.' },
  ewd: { name: 'ECAM górny – silniki i alarmy', color: '#7cc7ff', pos: [0, 1.0, -0.86], desc: 'Ekran silników: ciąg, temperatura spalin, paliwo. Pod spodem pojawiają się ostrzeżenia razem z listą czynności do wykonania – wykonane znikają.' },
  sd: { name: 'ECAM dolny – systemy', color: '#7cc7ff', pos: [0, 0.6, -0.8], desc: 'Schematy systemów samolotu: elektryka, paliwo, hydraulika, drzwi, klimatyzacja, koła. Komputer sam pokazuje stronę, która w danej chwili jest najważniejsza.' },
  isis: { name: 'przyrządy zapasowe (ISIS)', color: '#9fb3c8', pos: [-0.25, 0.97, -0.85], desc: 'Mały, niezależny ekran z horyzontem, prędkością i wysokością. Działa nawet wtedy, gdy zgasną wszystkie duże ekrany.' },
  oit: { name: 'OIT – ekrany z dokumentacją', color: '#9fb3c8', pos: [-1.135, 0.98, -0.85], desc: 'Ekrany po bokach: elektroniczna dokumentacja, mapy lotnisk, listy kontrolne i obliczenia osiągów. Zastępują dawną teczkę pełną papierów.' },
  fcu: { name: 'FCU – panel autopilota', color: '#ffd36b', pos: [0, 1.17, -0.78], desc: 'Pokrętła i przyciski autopilota: prędkość, kurs, wysokość i prędkość pionowa, przyciski AP1, AP2 i A/THR (autociąg). Pociągnięcie pokrętła – pilot wybiera wartość sam, wciśnięcie – samolot leci według planu z komputera.' },
  efis: { name: 'panele EFIS', color: '#ffd36b', pos: [-0.66, 1.17, -0.78], desc: 'Po jednym dla każdego pilota: ustawienie ciśnienia odniesienia wysokościomierza, trybu i zasięgu mapy na ND oraz tego, co ma być na niej widoczne.' },
  warn: { name: 'MASTER WARN / CAUT', color: '#ff8a80', pos: [-0.98, 1.15, -0.78], desc: 'Duże lampki ostrzegawcze: czerwona (zagrożenie, działaj od razu) i bursztynowa (usterka, zajmij się nią). Pilot gasi je, wciskając lampkę – szczegóły są na ECAM.' },
  overhead: { name: 'panel górny', color: '#c4b5fd', pos: [0, 1.78, 0.05], desc: 'Przełączniki wszystkich systemów: prąd, paliwo, powietrze i klimatyzacja, ochrona przed oblodzeniem, gaszenie pożaru, światła zewnętrzne i napisy w kabinie. Zasada „ciemnego kokpitu”: gdy wszystko działa normalnie, lampki nie świecą.' },
  thrust: { name: 'dźwignie ciągu', color: '#86efac', pos: [0, 0.98, -0.44], desc: 'Dwie dźwignie z położeniami TOGA (pełna moc), FLX (moc startowa), CL (wznoszenie – tu pracuje autociąg) i IDLE (bieg jałowy). Za IDLE – odwracacze ciągu do hamowania po lądowaniu.' },
  flaps: { name: 'dźwignia klap', color: '#86efac', pos: [0.24, 0.9, -0.42], desc: 'Położenia 0, 1, 2, 3 i FULL. Im dalej, tym bardziej wysunięte klapy i sloty – skrzydło daje więcej siły nośnej przy małej prędkości (start, lądowanie).' },
  spdbrk: { name: 'hamulce aerodynamiczne', color: '#86efac', pos: [-0.24, 0.9, -0.42], desc: 'Dźwignia płyt na górze skrzydła (spojlerów). W locie pomaga szybciej zwolnić albo zejść niżej, a uzbrojona przed lądowaniem sama wysuwa płyty po przyziemieniu.' },
  eng: { name: 'rozruch silników', color: '#86efac', pos: [0, 0.82, -0.15], desc: 'Przełączniki ENG MASTER 1 i 2 (paliwo i zapłon dla każdego silnika) i przełącznik trybu: NORM, IGN/START (rozruch).' },
  kccu: { name: 'klawiatury z kulką (KCCU)', color: '#86efac', pos: [-0.14, 0.8, 0.2], desc: 'Klawiatura i kulka do przesuwania kursora po ekranach – piloci wpisują trasę, sprawdzają listy i zmieniają strony ECAM bez dotykania ekranów.' },
  stick: { name: 'boczny drążek', color: '#fca5a5', pos: [-1.2, 1.0, 0.05], desc: 'Zamiast wolantu – mały drążek z boku, jak joystick. Jego ruchy trafiają do komputerów, a te poruszają sterami (fly-by-wire). Czerwony przycisk wyłącza autopilota.' },
  tiller: { name: 'kółko sterowania na ziemi', color: '#fca5a5', pos: [-1.2, 0.82, -0.35], desc: 'Tiller – małe kółko do skręcania przednim kołem przy kołowaniu po lotnisku.' },
  pedals: { name: 'pedały', color: '#fca5a5', pos: [-0.55, 0.36, -0.75], desc: 'Pedały steru kierunku i hamulców kół. Wciśnięcie górnej części pedału hamuje koła po tej stronie.' },
  gear: { name: 'dźwignia podwozia', color: '#fca5a5', pos: [0.28, 0.66, -0.8], desc: 'W górę – podwozie się chowa, w dół – wypuszcza. Obok trzy lampki: zielone, gdy koła są wypuszczone i zablokowane.' },
  seats: { name: 'fotele pilotów', color: '#d1d5db', pos: [0.55, 1.5, 0.55], desc: 'Kapitan siedzi po lewej, pierwszy oficer po prawej. Fotele przesuwają się na szynach i mają pięciopunktowe pasy. Kokpit ma też trzeci i czwarty fotel – dla obserwatora i dodatkowego pilota.' },
};

function Tag({ pos, color, children, onClick, active = false }: { pos: V3; color: string; children: ReactNode; onClick?: () => void; active?: boolean }) {
  if (useSceneHidden()) return null;
  return (
    <group position={pos}>
      <Html center zIndexRange={[6, 0]} style={{ pointerEvents: onClick ? 'auto' : 'none' }}>
        <span
          className={['engine-label', onClick ? 'part-name' : '', active ? 'on' : ''].filter(Boolean).join(' ')}
          style={{ color, whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : undefined, pointerEvents: onClick ? 'auto' : 'none' }}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
        </span>
      </Html>
    </group>
  );
}

/* ======================= zakładka „Sześć ekranów” ======================= */

const SCREEN_TOUR: { id: string; name: string; text: string }[] = [
  { id: 'pfd', name: 'PFD – główny ekran lotu', text: 'Dwa skrajne ekrany, po jednym przed każdym pilotem. Pokazują wszystko, czego trzeba, by sterować samolotem: położenie względem horyzontu, prędkość, wysokość i kurs.' },
  { id: 'nd', name: 'ND – ekran nawigacyjny', text: 'Obok PFD – mapa: trasa, punkty nawigacyjne, wiatr, radar pogodowy. Każdy pilot może ustawić na swoim inny zasięg.' },
  { id: 'ewd', name: 'ECAM górny', text: 'Na środku, u góry: praca silników i ostrzeżenia z listą czynności. Obaj piloci widzą go tak samo.' },
  { id: 'sd', name: 'ECAM dolny', text: 'Pod nim: schematy systemów – teraz strona przelotu z paliwem, ciśnieniem w kabinie i temperaturą w strefach.' },
  { id: 'oit', name: 'OIT', text: 'Na skrajach: ekrany z dokumentacją, mapami lotnisk i listami kontrolnymi. Nie są potrzebne do samego pilotowania.' },
  { id: 'isis', name: 'przyrządy zapasowe', text: 'Mały ekran z horyzontem, prędkością i wysokością – na wypadek, gdyby zgasły wszystkie duże ekrany.' },
];
function highlightOf(s: Sim): string | null {
  if (s.mode === 'screens') {
    if (s.scn && s.scn !== 'auto') return s.scn;
    return SCREEN_TOUR[Math.floor((performance.now() / 1000 / 5) % SCREEN_TOUR.length)].id;
  }
  if (s.mode === 'pfd' || s.mode === 'stick') return 'pfd';
  if (s.mode === 'nd') return 'nd';
  if (s.mode === 'ecam') return 'ewd';
  return null;
}

/* ======================= nakładka: dok i ramka ======================= */

function useTicker(hz = 8) {
  const [, set] = useState(0);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 1 / hz) {
      acc.current = 0;
      set((n) => (n + 1) % 1e6);
    }
  });
}

const fi = (v: number) => Math.round(v).toLocaleString('pl-PL');
const meters = (ft: number) => fi(ft * 0.3048);

/** Przyciski panelu górnego używane w scenariuszu – w doku (tylko wskaźniki, przestawia je załoga). */
function OverheadDock({ st }: { st: CkState }) {
  const o = st.oh;
  const a = (k: string) => st.act === k;
  const p = st.power > 0;
  return (
    <div style={{ pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <PanelBox title="ELEC">
        <Pushbutton label="BAT 1" act={a('BAT1')} top={{ text: 'FAULT', color: AIRBUS.amber, on: false }} bottom={{ text: 'OFF', color: '#f2f4f6', on: p && !o.BAT1 }} />
        <Pushbutton label="BAT 2" act={a('BAT2')} top={{ text: 'FAULT', color: AIRBUS.amber, on: false }} bottom={{ text: 'OFF', color: '#f2f4f6', on: p && !o.BAT2 }} />
        <Pushbutton label="EXT PWR" act={a('EXT')} top={{ text: 'AVAIL', color: AIRBUS.green, on: p && o.EXT_AV && !o.EXT }} bottom={{ text: 'ON', color: AIRBUS.cyan, on: p && o.EXT }} />
      </PanelBox>
      <PanelBox title="APU · AIR">
        <Pushbutton label="MASTER SW" act={a('APU_MASTER')} top={{ text: 'FAULT', color: AIRBUS.amber, on: false }} bottom={{ text: 'ON', color: AIRBUS.cyan, on: p && o.APU_MASTER }} />
        <Pushbutton label="START" act={a('APU_START')} top={{ text: 'AVAIL', color: AIRBUS.green, on: p && o.APU_AVAIL }} bottom={{ text: 'ON', color: AIRBUS.cyan, on: p && o.APU_START }} />
        <Pushbutton label="APU BLEED" act={a('APU_BLEED')} top={{ text: 'FAULT', color: AIRBUS.amber, on: false }} bottom={{ text: 'ON', color: AIRBUS.cyan, on: p && o.APU_BLEED }} />
      </PanelBox>
    </div>
  );
}

function FireDock({ st }: { st: CkState }) {
  const a = (k: string) => st.act === k;
  return (
    <div style={{ pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <PanelBox title="ENG 1 FIRE">
        <Pushbutton label="ENG 1 FIRE" guard act={a('FIRE 1')} top={{ text: 'FIRE', color: AIRBUS.red, on: st.fire[0] }} bottom={{ text: 'PUSHED', color: '#f2f4f6', on: st.firePb[0] }} />
        <Pushbutton label="AGENT 1" act={a('AGENT 1')} top={{ text: 'SQUIB', color: '#f2f4f6', on: st.firePb[0] && !st.agent[0] }} bottom={{ text: 'DISCH', color: AIRBUS.amber, on: st.agent[0] }} />
      </PanelBox>
      <EngStartPanel mode={st.engMode} masters={st.masters} fires={st.fire} act={[st.act === 'MASTER 1', st.act === 'MASTER 2']} />
    </div>
  );
}

function CockpitOverlay({ sim, sel, setSel }: { sim: MutableRefObject<Sim>; sel: string | null; setSel: (s: string | null) => void }) {
  useTicker();
  // prędkości w ramce i w opisie czynności załogi – w jednostce z ustawień (ekrany kokpitu zostają w węzłach)
  const sp = useSpeed();
  const s = sim.current;
  const st = s.st;
  const mode = s.mode;
  const pfd = (
    <Pfd pitch={st.pitch} bank={st.bank} ias={st.ias} iasTarget={st.fcu.spd ?? undefined} mach={st.mach} alt={st.alt} altSel={st.altSel ?? st.fcu.alt} vs={st.vs} heading={st.hdg} track={st.hdg} fma={st.fma} ra={st.alt < 2500 ? st.alt : undefined} vls={st.ground ? undefined : st.conf === 'FULL' ? 132 : 210} vmax={st.conf === '0' ? 340 : st.conf === 'FULL' ? 186 : 230} />
  );
  const nd = <Nd heading={st.hdg} gs={st.ground ? st.ias : st.tas - 20} tas={st.tas} wind={st.wind} range={st.ndRange} target={st.target} turnRadiusNm={Math.abs(st.bank) > 3 ? (st.tas * st.tas) / (68625 * Math.tan((st.bank * Math.PI) / 180)) : 0} />;
  const ecam = <EcamFor st={st} />;
  const levers = <ThrustLevers pos={st.lever} athr={st.athr} />;
  const hl = highlightOf(s);
  const tour = mode === 'screens' ? SCREEN_TOUR.find((x) => x.id === hl) : undefined;
  const running = s.run;
  const scenario = mode !== 'home' && mode !== 'screens';
  return (
    <>
      {mode === 'screens' && tour && (
        <CockpitDock>
          {hl === 'pfd' ? pfd : hl === 'nd' ? nd : hl === 'ewd' || hl === 'sd' ? ecam : null}
        </CockpitDock>
      )}
      {mode === 'pfd' && (
        <CockpitDock>
          {pfd}
          <Sidestick x={st.stick[0]} y={st.stick[1]} pedals={st.pedals} />
          {levers}
        </CockpitDock>
      )}
      {mode === 'nd' && <CockpitDock>{nd}</CockpitDock>}
      {mode === 'ecam' && (
        <CockpitDock>
          {ecam}
          {s.scn === 'fire' ? <FireDock st={st} /> : <EngStartPanel mode={st.engMode} masters={st.masters} act={[st.act === 'MASTER 1', st.act === 'MASTER 2']} />}
          {s.scn === 'fire' && levers}
        </CockpitDock>
      )}
      {mode === 'stick' && (
        <CockpitDock>
          {pfd}
          <Sidestick x={st.stick[0]} y={st.stick[1]} pedals={st.pedals} />
        </CockpitDock>
      )}
      {mode === 'fcu' && (
        <CockpitDock>
          {pfd}
          <div style={{ pointerEvents: 'none', borderRadius: 6, overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,0.45)' }}>
            <FcuSvg st={st} width={420} />
          </div>
        </CockpitDock>
      )}
      {mode === 'overhead' && (
        <CockpitDock>
          {st.power > 0 && ecam}
          <OverheadDock st={st} />
        </CockpitDock>
      )}
      {mode === 'pedestal' && (
        <CockpitDock>
          {ecam}
          <EngStartPanel mode={st.engMode} masters={st.masters} act={[st.act === 'MASTER 1', st.act === 'MASTER 2']} />
          {levers}
          <FlapLever conf={st.conf} />
          <SpeedBrakeLever pos={st.spd.pos} armed={st.spd.armed} deployed={st.spd.pos} />
          <GearLever lever={st.gear.lever} state={st.gear.state} act={st.act === 'GEAR'} />
        </CockpitDock>
      )}
      {mode === 'home' &&
        Object.entries(PARTS).map(([id, p]) => (
          <Tag key={id} pos={w3(...p.pos)} color={p.color} active={sel === id} onClick={() => setSel(sel === id ? null : id)}>
            {p.name}
          </Tag>
        ))}
      {mode === 'screens' && tour && <Tag pos={w3(...PARTS[tour.id].pos)} color={ACT}>{tour.name}</Tag>}
      <InfoPortal>
        {mode === 'home' &&
          (sel ? (
            <>
              <div style={{ fontWeight: 700, color: PARTS[sel].color }}>{PARTS[sel].name}</div>
              <div>{PARTS[sel].desc}</div>
            </>
          ) : (
            <div>Kliknij podpis, żeby przeczytać, do czego służy ta część kokpitu. Obracaj widok myszą, kółkiem przybliżaj.</div>
          ))}
        {mode === 'screens' && tour && (
          <>
            <div style={{ fontWeight: 700, color: ACT }}>{tour.name}</div>
            <div>{tour.text}</div>
          </>
        )}
        {scenario && (
          <>
            {running ? (
              st.crew && <div style={{ fontSize: 13, color: AIRBUS.cyan }}>{speedInText(st.crew, sp.u)}</div>
            ) : (
              <div style={{ fontSize: 12, color: '#facc15' }}>{mode === 'pfd' || mode === 'ecam' ? 'Wybierz scenariusz i naciśnij „Rozpocznij”.' : 'Naciśnij „Rozpocznij”.'}</div>
            )}
            {mode === 'overhead' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px', fontSize: 13 }}>
                <span>zasilanie</span>
                <b>{st.power === 0 ? 'brak – kokpit ciemny' : st.oh.EXT ? 'z lotniska (GPU)' : 'akumulatory'}</b>
                <span>APU</span>
                <b>{st.oh.APU_AVAIL ? 'pracuje (AVAIL)' : st.oh.APU_START ? 'rozruch…' : st.oh.APU_MASTER ? 'przygotowanie' : 'wyłączone'}</b>
                <span>komputery położenia</span>
                <b>{[st.oh.ADIRS1, st.oh.ADIRS2, st.oh.ADIRS3].filter(Boolean).length} z 3 włączonych</b>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px', fontSize: 13 }}>
                <span>prędkość</span>
                <b>
                  {sp.fmt(st.ias * 0.5144)} <span style={{ opacity: 0.6, fontWeight: 400 }}>(na PFD: {fi(st.ias)} kt)</span>
                </b>
                <span>wysokość</span>
                <b>
                  {fi(st.alt)} ft <span style={{ opacity: 0.6, fontWeight: 400 }}>({meters(st.alt)} m)</span>
                </b>
                <span>wznoszenie</span>
                <b>
                  {fi(st.vs)} ft/min <span style={{ opacity: 0.6, fontWeight: 400 }}>({(st.vs * 0.00508).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} m/s)</span>
                </b>
                <span>kurs · przechylenie</span>
                <b>
                  {String(Math.round(st.hdg) % 360).padStart(3, '0')}° · {fi(Math.abs(st.bank))}° {st.bank > 0.5 ? 'w prawo' : st.bank < -0.5 ? 'w lewo' : ''}
                </b>
                {(mode === 'ecam' || mode === 'pedestal') && (
                  <>
                    <span>silniki (N1)</span>
                    <b>
                      {fi(st.n1[0])}% · {fi(st.n1[1])}%
                    </b>
                  </>
                )}
              </div>
            )}
            <div style={{ fontSize: 11, opacity: 0.6 }}>Scenariusz uproszczony: czasy i wartości są przybliżone.</div>
          </>
        )}
      </InfoPortal>
    </>
  );
}

/* ======================= scena ======================= */

function CockpitScene({ params }: SceneProps) {
  const mode = (typeof params.ck === 'string' ? params.ck : 'home') as CkMode;
  const scn = typeof params.scn === 'string' ? params.scn : '';
  const run = Boolean(params.run);
  const sim = useRef<Sim>(newSim(mode, scn));
  const [sel, setSel] = useState<string | null>(null);
  // zmiana zakładki albo scenariusza – stan od początku; „Rozpocznij” – scenariusz rusza
  const cur = sim.current;
  if (cur.mode !== mode || cur.scn !== scn || (cur.run && !run)) sim.current = newSim(mode, scn);
  sim.current.run = run;
  useFrame((_, dt) => stepSim(sim.current, Math.min(0.05, dt)));
  // kokpit jest ciasny: szeroki kąt widzenia (jak zdjęcie obiektywem szerokokątnym); po wyjściu – zwykły
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    const fov0 = camera.fov;
    camera.fov = 68;
    camera.updateProjectionMatrix();
    return () => {
      camera.fov = fov0;
      camera.updateProjectionMatrix();
    };
  }, [camera]);
  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#eaf3ff', '#4a5058', 0.9]} />
      <directionalLight position={[2, 14, -10]} intensity={1.6} color="#fff6e8" />
      <directionalLight position={[-4, 6, 8]} intensity={0.35} color="#c8d8ff" />
      <fog attach="fog" args={['#c9dbea', 140, 430]} />
      <Outside sim={sim} />
      <CockpitModel sim={sim} />
      <CockpitOverlay sim={sim} sel={mode === 'home' ? sel : null} setSel={setSel} />
    </>
  );
}

/* ======================= zakładki ======================= */

const RUN = { type: 'button' as const, key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false };
const ck = (s: Omit<Step, 'kind' | 'scene' | 'stageKey' | 'cameraInside' | 'camera' | 'target' | 'spot'> & { cam: V3; tgt: V3; spot: V3 }): Step => {
  const { cam, tgt, spot, ...rest } = s;
  return { kind: '3d', scene: CockpitScene, stageKey: 'cockpit', cameraInside: true, camera: w3(...cam), target: w3(...tgt), spot: w3(...spot), ...rest };
};

export const cockpitModule: PartModule = {
  id: 'kokpit',
  title: 'Kokpit',
  summary: 'Stanowisko pilotów od środka: sześć ekranów (PFD, ND, ECAM), boczny drążek, panel autopilota, panel górny i pulpit z dźwigniami – każdy w działaniu',
  steps: [
    ck({
      title: 'Kokpit A350',
      cam: [0, 1.62, 1.2],
      tgt: [0, 1.0, -0.7],
      spot: [0.55, 1.45, 0.62],
      preset: { ck: 'home' },
      body: (
        <>
          <p>
            Tak wygląda miejsce pracy pilotów Airbusa A350. Kapitan siedzi po lewej, pierwszy oficer po prawej. Przed nimi jest <b>panel główny</b> z sześcioma dużymi ekranami, nad ekranami – <b>osłona przeciwsłoneczna</b> z panelem autopilota, a nad głowami – <b>panel górny</b> z przełącznikami wszystkich systemów. Między fotelami stoi <b>pulpit środkowy</b> z dźwigniami ciągu, klapami i klawiaturami.
          </p>
          <p>
            Nie ma tu wolantów. Każdy pilot ma z boku mały <b>drążek</b>, jak joystick – jego ruchy trafiają do komputerów, a dopiero te poruszają sterami. To tzw. <b>fly-by-wire</b> (sterowanie „po drucie”).
          </p>
          <p>
            Kokpit jest zbudowany według zasady <b>„ciemnego kokpitu”</b>: gdy wszystko działa normalnie, lampki na przyciskach nie świecą. Zapalona lampka znaczy, że coś jest włączone nietypowo albo się zepsuło – od razu widać, gdzie patrzeć.
          </p>
          <p>Kliknij podpis, żeby przeczytać, do czego służy dana część. Numery prowadzą do kolejnych zakładek.</p>
        </>
      ),
    }),
    ck({
      title: 'Sześć ekranów',
      cam: [0, 1.25, 0.35],
      tgt: [0, 0.86, -0.9],
      spot: [0, 1.0, -0.84],
      preset: { ck: 'screens' },
      controls: [
        {
          type: 'select',
          key: 'scn',
          label: 'Ekran',
          default: 'auto',
          options: [
            { value: 'auto', label: 'po kolei (co 5 s)' },
            { value: 'pfd', label: 'PFD – główny ekran lotu' },
            { value: 'nd', label: 'ND – ekran nawigacyjny' },
            { value: 'ewd', label: 'ECAM górny' },
            { value: 'sd', label: 'ECAM dolny' },
            { value: 'oit', label: 'OIT – dokumentacja' },
            { value: 'isis', label: 'przyrządy zapasowe' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Dawniej kokpit był pełen okrągłych zegarów – w starszych samolotach kilkadziesiąt. Dziś wszystko jest na kilku dużych ekranach. W A350 przed pilotami jest ich sześć, w jednym rzędzie: <b>PFD</b> i <b>ND</b> przed kapitanem, dwa ekrany <b>ECAM</b> pośrodku (jeden nad drugim) oraz ND i PFD przed pierwszym oficerem.
          </p>
          <p>
            Układ jest symetryczny – każdy pilot ma przed sobą to samo i może sam prowadzić samolot. Ekrany na środku są wspólne. Gdy jeden ekran się zepsuje, jego obraz można przenieść na sąsiedni.
          </p>
          <p>Podświetlony ekran jest też powiększony w prawym górnym rogu. Pokazuje lot w przelocie na wysokości ok. 11 km.</p>
        </>
      ),
    }),
    ck({
      title: 'PFD – główny ekran lotu',
      cam: [-0.6, 1.2, -0.15],
      tgt: [-0.8, 0.9, -0.88],
      spot: [-0.86, 0.86, -0.84],
      preset: { ck: 'pfd' },
      controls: [
        {
          type: 'select',
          key: 'scn',
          label: 'Scenariusz',
          default: 'takeoff',
          options: [
            { value: 'takeoff', label: 'start z pasa' },
            { value: 'turn', label: 'zakręt w przelocie' },
            { value: 'approach', label: 'podejście i lądowanie' },
          ],
        },
        RUN,
      ],
      body: (
        <>
          <p>
            <b>PFD</b> (Primary Flight Display) to ekran, na który pilot patrzy najczęściej. Na środku jest <b>sztuczny horyzont</b>: niebieskie niebo i brązowa ziemia. Żółty znaczek pośrodku to samolot – gdy nos idzie w górę, horyzont schodzi w dół, a gdy samolot się przechyla, horyzont się pochyla.
          </p>
          <p>
            Po lewej jest pionowa taśma <b>prędkości</b> (w węzłach – 100 węzłów to ok. 185 km/h), po prawej – taśma <b>wysokości</b> (w stopach – 1000 stóp to ok. 300 m) i wskaźnik wznoszenia. Na dole – <b>kurs</b>, czyli kierunek lotu. U góry pasek <b>FMA</b> mówi, co w tej chwili robi autopilot i autociąg.
          </p>
          <p>Wybierz scenariusz i naciśnij „Rozpocznij”. Ten sam obraz jest na ekranie w kokpicie i powiększony w rogu. Za oknami widać, jak samolot się pochyla.</p>
        </>
      ),
    }),
    ck({
      title: 'ND – ekran nawigacyjny',
      cam: [-0.35, 1.2, -0.15],
      tgt: [-0.5, 0.9, -0.88],
      spot: [-0.5, 0.86, -0.84],
      preset: { ck: 'nd' },
      controls: [RUN],
      body: (
        <>
          <p>
            <b>ND</b> (Navigation Display) to mapa widziana z góry. Na dole ekranu jest symbol samolotu, a przed nim wycinek mapy: <b>zaplanowana trasa</b> (zielona), punkty, przez które przelatuje, i odległości. W rogach – prędkość względem ziemi i <b>wiatr</b> (strzałka i liczby: skąd wieje i jak mocno).
          </p>
          <p>
            Pokrętłem na panelu EFIS pilot zmienia <b>zasięg</b> mapy – od kilku do kilkuset mil morskich (1 mila morska to 1852 m). Na tym samym ekranie można włączyć obraz <b>radaru pogodowego</b> i inne samoloty w pobliżu. Na ziemi ND pokazuje plan lotniska: drogi kołowania i pasy.
          </p>
          <p>Naciśnij „Rozpocznij”: pilot zmienia zasięg mapy, a potem samolot skręca na nowy kurs – zobacz, jak obraca się mapa.</p>
        </>
      ),
    }),
    ck({
      title: 'ECAM – silniki i alarmy',
      cam: [0.05, 1.16, -0.12],
      tgt: [0, 0.76, -0.86],
      spot: [0.1, 0.7, -0.78],
      preset: { ck: 'ecam' },
      controls: [
        {
          type: 'select',
          key: 'scn',
          label: 'Scenariusz',
          default: 'start',
          options: [
            { value: 'start', label: 'uruchamianie silników' },
            { value: 'fire', label: 'pożar silnika w locie' },
          ],
        },
        RUN,
      ],
      body: (
        <>
          <p>
            <b>ECAM</b> to dwa ekrany pośrodku. Górny pokazuje <b>silniki</b>: ciąg (THR) i obroty wentylatora (N1), temperaturę spalin (EGT) i paliwo. Pod spodem pojawiają się komunikaty i <b>ostrzeżenia</b>. Dolny ekran pokazuje schematy <b>systemów</b> – silników, prądu, paliwa, drzwi i innych.
          </p>
          <p>
            Gdy coś się psuje, ECAM nie tylko mówi <i>co</i>, ale też <i>co zrobić</i>: pod czerwonym albo bursztynowym tytułem wyświetla niebieską listę czynności. Piloci wykonują je po kolei, a wykonane polecenia same znikają z listy. Przy poważnym zagrożeniu miga też czerwona lampka <b>MASTER WARN</b> na osłonie przed pilotami.
          </p>
          <p>Wybierz scenariusz i naciśnij „Rozpocznij”. Przestawiany przełącznik jest podświetlony – w rogu sceny i na panelu w kokpicie.</p>
        </>
      ),
    }),
    ck({
      title: 'Boczny drążek',
      cam: [-0.35, 1.38, 0.75],
      tgt: [-1.0, 0.85, -0.45],
      spot: [-1.2, 0.92, 0.05],
      preset: { ck: 'stick' },
      controls: [RUN],
      body: (
        <>
          <p>
            W Airbusie pilot steruje małym <b>drążkiem z boku</b> (sidestick) – kapitan lewą ręką, pierwszy oficer prawą. Drążek nie jest połączony ze sterami linkami. Mierzy tylko, jak bardzo pilot go wychylił, a <b>komputery sterowania</b> decydują, jak poruszyć sterami, żeby samolot zrobił to, czego chce pilot.
          </p>
          <p>
            Dzięki temu Airbus lata inaczej niż samochód. Wychylenie drążka w bok znaczy „przechylaj się”, a puszczony drążek – „zostań tak, jak jest”. Samolot sam trzyma przechylenie i kąt wznoszenia, bez stałego dociskania. Komputery pilnują też <b>granic</b>: nie pozwolą przechylić się bardziej niż o 67°, zadrzeć nosa za wysoko ani zwolnić tak, że skrzydło przestanie nieść.
          </p>
          <p>Naciśnij „Rozpocznij” i patrz na drążek w kokpicie, na drążek i PFD w rogu sceny oraz na horyzont za oknem.</p>
        </>
      ),
    }),
    ck({
      title: 'Panel autopilota (FCU)',
      cam: [0, 1.22, -0.1],
      tgt: [0, 1.02, -0.8],
      spot: [0.2, 1.17, -0.78],
      preset: { ck: 'fcu' },
      controls: [RUN],
      body: (
        <>
          <p>
            Na osłonie nad ekranami jest <b>FCU</b> (Flight Control Unit) – panel autopilota. Ma cztery okienka z pokrętłami: <b>prędkość</b>, <b>kurs</b>, <b>wysokość</b> i <b>prędkość pionową</b>. Pośrodku są przyciski <b>AP1</b> i <b>AP2</b> (dwa niezależne autopiloty) oraz <b>A/THR</b> – autociąg, który sam ustawia moc silników.
          </p>
          <p>
            Pokrętła działają na dwa sposoby. <b>Pociągnięte</b> – samolot leci według wartości, którą ustawił pilot (np. kurs 140°). <b>Wciśnięte</b> – według planu z komputera nawigacyjnego; wtedy w okienku są kreski i kropka. Na PFD pasek u góry (FMA) zawsze mówi, w którym trybie jest autopilot.
          </p>
          <p>Naciśnij „Rozpocznij”: pilot włącza autopilota, wybiera nową wysokość, nowy kurs, a na koniec nową prędkość.</p>
        </>
      ),
    }),
    ck({
      title: 'Panel górny',
      cam: [0, 1.12, 0.7],
      tgt: [0, 1.93, -0.1],
      spot: [0.3, 1.82, -0.25],
      preset: { ck: 'overhead' },
      controls: [RUN],
      body: (
        <>
          <p>
            Nad głowami pilotów jest <b>panel górny</b> z przełącznikami systemów, pogrupowanymi w bloki: <b>ELEC</b> (prąd), <b>APU</b>, <b>AIR</b> (powietrze i klimatyzacja), <b>FUEL</b> (pompy paliwa), <b>ANTI ICE</b> (ogrzewanie przeciw oblodzeniu), <b>ENG FIRE</b> (gaszenie silników), <b>EXT LT</b> (światła zewnętrzne) i <b>SIGNS</b> (napisy w kabinie).
          </p>
          <p>
            W locie piloci prawie go nie dotykają – większość systemów pracuje sama. Panel górny jest najważniejszy przed lotem, gdy kokpit „budzi się” do życia, i przy usterkach.
          </p>
          <p>Naciśnij „Rozpocznij”: samolot stoi „zimny i ciemny”, bez prądu. Zobacz, w jakiej kolejności piloci go uruchamiają i jak zapalają się ekrany.</p>
        </>
      ),
    }),
    ck({
      title: 'Pulpit środkowy',
      cam: [0.12, 1.5, 0.5],
      tgt: [0, 0.72, -0.35],
      spot: [0.05, 0.85, -0.3],
      preset: { ck: 'pedestal' },
      controls: [RUN],
      body: (
        <>
          <p>
            Między fotelami stoi <b>pulpit środkowy</b>. Na przodzie są dwie <b>dźwignie ciągu</b> – po jednej na silnik. W Airbusie dźwignie mają stałe położenia (zapadki): TOGA, FLX, CL i IDLE. W locie stoją zwykle w CL i się nie ruszają, bo moc ustawia autociąg.
          </p>
          <p>
            Po bokach dźwigni ciągu są dźwignie <b>klap</b> (z prawej) i <b>hamulców aerodynamicznych</b> (z lewej). Za nimi – przełączniki <b>ENG MASTER</b> do uruchamiania silników, a dalej dwie <b>klawiatury z kulką</b> (KCCU), którymi piloci obsługują ekrany.
          </p>
          <p>Naciśnij „Rozpocznij”: uruchomienie obu silników, ustawienie klap do startu, a potem start – z ruchem dźwigni, podwozia i klap.</p>
        </>
      ),
    }),
  ],
};
