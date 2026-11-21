/*
 * Moduł podwozia A350-1000: sterowanie ruchem podwozia w zakładkach (amortyzator, chowanie, hamowanie, skręt),
 * ramki informacji, wyświetlacze kokpitu i okręgi zakrętu. Ten sam samolot co w przeglądzie – podwozie jest
 * sterowane wspólnym stanem GearDrive (bez przerysowywania sceny co klatkę).
 */
import { useContext, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Params, Step } from '../../lib/types';
import { InfoPortal, fmt } from '../../lib/plot';
import { useSpeed } from '../../components/ui';
import { AutoBrakeKnob, CockpitDock, ControlStack, Ecam, GearLever, Nd, Pfd, SpeedBrakeLever, ThrustLevers, Tiller } from '../../components/cockpit';
import { CASCADE_BAND } from './engineModel';
import { ENG_K, GEAR_STROKE, MAIN_WHEEL_INDEX, MLG, NOSE_X, engineOrigin, newGearDrive, wingSurface, type GearDrive } from './airliner';
import { EngineStreams, FollowPlane, PathStreaks, SpoilerFlow, type DirectPose, type PoseState } from './wingLab';
import { LANDING, landingAir, landingGround, landingPhase } from './landing';
import { NightCtx, RWY, RunwayModel, runwayNdMap, runwayNdSymbol, type NdLine } from './runway';

/** landing – sama wspólna animacja lądowania (bez ramek podwozia), np. w zakładce spojlerów „po przyziemieniu”. */
export type GearMode = 'shock' | 'retract' | 'brakes' | 'steer' | 'landing';
type V3 = [number, number, number];

/* ======================= amortyzator olejowo-gazowy ======================= */

/** Gaz w amortyzatorze: sprężanie politropowe (n ≈ 1,3), długość słupa gazu 0,6 m, ciśnienie wstępne 22 bar. */
const GAS = { n: 1.3, col: 0.6, p0: 22, max: 0.55 };
/** Obciążenie na postoju względem ciśnienia wstępnego (ciężar samolotu / siła gazu przy pełnym wysunięciu). */
const STATIC_RATIO = Math.pow(1 / (1 - GEAR_STROKE / GAS.col), GAS.n);
/** Skok amortyzatora (m) przy obciążeniu L (1 = ciężar samolotu na postoju) i ciśnienie gazu (bar). */
export function shockState(L: number) {
  const r = Math.max(0, L) * STATIC_RATIO;
  const s = r <= 1 ? 0 : Math.min(GAS.max, GAS.col * (1 - Math.pow(r, -1 / GAS.n)));
  return { s, p: GAS.p0 * Math.pow(1 / (1 - s / GAS.col), GAS.n) };
}
/** Obciążenie przy przyziemieniu w chwili u (s) po zetknięciu: szybki skok, tłumione wahania, postój. */
const landLoad = (u: number) => 1 - Math.exp(-2 * u) * (Math.cos(5.5 * u) - 0.7 * Math.sin(5.5 * u));

/* ======================= hamulce ======================= */

/**
 * Ustawienia autobrake od najsłabszego do najmocniejszego i wybierane przez nie opóźnienie (m/s²) – wartości
 * przybliżone. Tablica (a nie obiekt), bo klucze „2” i „3” obiekt ustawiłby przed „LO”.
 */
const AUTOBRAKE_LIST: { id: string; name: string; a: number }[] = [
  { id: 'LO', name: 'LO', a: 1.7 },
  { id: '2', name: '2', a: 2.2 },
  { id: '3', name: '3', a: 3.0 },
  { id: 'HI', name: 'HI', a: 3.8 },
];
const AUTOBRAKE: Record<string, { name: string; a: number }> = Object.fromEntries(AUTOBRAKE_LIST.map((x) => [x.id, x]));
/** Opóźnienie w pierwszej sekundzie po przyziemieniu (koła się rozkręcają, wysuwają się spojlery). */
const A_TOUCH = 0.6;
/** Przewidywany dobieg do zatrzymania przy opóźnieniu a: droga (m) i czas (s). */
const rollout = (a: number) => {
  const v1 = V_TD - A_TOUCH;
  return { d: V_TD - A_TOUCH / 2 + (v1 * v1) / (2 * a), t: 1 + v1 / a };
};
const V_TD = LANDING.vTD; // prędkość przyziemienia (m/s ≈ 134 kt) – ze wspólnego przebiegu lądowania
const MASS = 220000; // masa do lądowania (kg)
/** Ciepło właściwe pakietu tarcz węglowych jednego koła (J/K): ok. 110 kg × 1,1 kJ/(kg·K). */
const BRAKE_HC = 110 * 1100;

/* ======================= sterowanie ======================= */

/** Rozstaw osi: od koła przedniego do środka wózków głównych (m). */
const WHEELBASE = MLG.x - NOSE_X;
const TIP: V3 = [9.8, 0, 32.4]; // końcówka skrzydła (położenie przybliżone)
/**
 * Środek zakrętu leży na przedłużeniu osi, które nie skręcają: przednia i środkowa oś wózka (tylna skręca),
 * czyli ok. 0,75 m przed środkiem wózka.
 */
const TURN_X = MLG.x - 0.75;
/** Promienie zakrętu przy skręcie koła przedniego δ: środek obrotu (odległość od osi kadłuba), ślad koła przedniego, końcówka skrzydła. */
export function turnRadii(deltaDeg: number) {
  const d = (Math.abs(deltaDeg) * Math.PI) / 180;
  if (d < 0.02) return null;
  const wb = TURN_X - NOSE_X;
  const rc = wb / Math.tan(d);
  return { rc, nose: Math.hypot(wb, rc), tip: Math.hypot(TIP[0] - TURN_X, rc + TIP[2]) };
}
/** Skręt tylnej osi wózków (rad) dla skrętu koła przedniego (°): w przeciwną stronę, dopiero przy ciasnych zakrętach. */
const rearOf = (deltaDeg: number) => -Math.sign(deltaDeg) * Math.min(1, Math.max(0, (Math.abs(deltaDeg) - 15) / 40)) * ((8 * Math.PI) / 180);

/**
 * Sprawdzenie „czy się zmieści”: zawracanie o 180° na końcu pasa przy skręcie koła przedniego ustawionym suwakiem.
 * Samolot jedzie jak rower: koło przednie toczy się w kierunku, w który jest skręcone, a wózki główne (nieskrętne osie)
 * ciągną się za nim – samolot obraca się wokół środka zakrętu na przedłużeniu linii wózków. Start zawsze w najlepszym
 * miejscu: przy krawędzi pasa po przeciwnej stronie niż skręt (z zapasem 4,5 m) i tak blisko końca pasa, jak pozwala
 * łuk koła przedniego. Gdy któreś koło zjedzie na trawę, samolot staje i widać, w którym miejscu.
 */
type Tracks = { nose: V3[]; mainL: V3[]; mainR: V3[]; tipL: V3[]; tipR: V3[] };
/** ready – postój, pilot kręci tillerem; drive – zawracanie; off – koło na trawie; done – zawrócony. */
type GameSt = 'ready' | 'drive' | 'off' | 'done';
type SteerGame = {
  st: GameSt;
  lvl: string;
  /** Skręt koła przedniego z suwaka (°, dodatnie – w lewo). */
  til: number;
  /** Czas w obecnym stanie (s, czas animacji). */
  tp: number;
  /** Położenie punktu odniesienia (TURN_X na osi kadłuba) na płycie (m) i odchylenie (rad, dodatnie – w lewo). */
  x: number;
  z: number;
  yaw: number;
  /** Prędkość koła przedniego (m/s), skręt koła zadany tillerem i rzeczywisty (°, dodatnie – w lewo), czy jedzie. */
  v: number;
  cmd: number;
  deg: number;
  go: boolean;
  /** Najmniejszy zapas koła od krawędzi w czasie zawracania (m). */
  minM: number;
  /** Bieżący najmniejszy zapas i koło, którego dotyczy. */
  m: number;
  mName: string;
  acc: number;
  tracks: Tracks;
  /** Koło, które zjechało z nawierzchni (miejsce na płycie). */
  hit: { x: number; z: number; name: string } | null;
};
/** Skręt z suwaka: ±10…70° (bliżej zera samolot praktycznie nie zawraca). */
const tillerOf = (v: unknown) => {
  const d = Math.max(-70, Math.min(70, Number(v ?? 70)));
  return Math.abs(d) < 10 ? (d < 0 ? -10 : 10) : d;
};
const newGame = (lvlId: string, til: number): SteerGame => {
  const lvl = levelOf(lvlId);
  const s = til >= 0 ? 1 : -1;
  const tr = turnRadii(til)!;
  const sp = uTurnSpan(til);
  return {
    st: 'ready',
    lvl: lvlId,
    til,
    tp: 0,
    // nos zatacza łuk o promieniu tr.nose wokół środka zakrętu – start tak, by łuk kończył się 4,5 m przed końcem pasa
    x: PAD_END + EDGE_CLR + TYRE_HALF + tr.nose + 1,
    // z zatoczką (skręt w jej stronę): zewnętrzne koła wózka 4,5 m od krawędzi po stronie przeciwnej do skrętu;
    // bez niej ślad kół wyśrodkowany na pasie – taki sam zapas z obu stron
    z: lvl.pad > 0 && s > 0 ? -(lvl.W / 2 - EDGE_CLR - TYRE_HALF - MAIN_OUT) : -s * ((sp.zMax + sp.zMin) / 2),
    yaw: 0,
    v: 0,
    cmd: til,
    deg: 0,
    go: false,
    minM: Infinity,
    m: Infinity,
    mName: '',
    acc: 0,
    tracks: { nose: [], mainL: [], mainR: [], tipL: [], tipR: [] },
    hit: null,
  };
};
/** Kurs 0–359°. */
const wrapDeg = (d: number) => ((d % 360) + 360) % 360;
/** Prędkość kołowania przy zawracaniu (koło przednie, m/s – ok. 5 kt) i przyspieszenie czasu animacji. */
const TURN_V = 2.6;
const TURN_K = 3;
/** Zewnętrzne koło wózka (z, m), połowa szerokości opony i wymagany zapas od krawędzi nawierzchni (ICAO, kod E). */
const MAIN_OUT = MLG.z + 0.63;
const TYRE_HALF = 0.25;
const EDGE_CLR = 4.5;
/** Punkty samolotu, których ślad rysujemy: koło przednie, zewnętrzne koła obu wózków i końcówki skrzydeł. */
const TRACK_PTS: Record<keyof Tracks, [number, number]> = { nose: [NOSE_X, 0], mainL: [MLG.x, MAIN_OUT], mainR: [MLG.x, -MAIN_OUT], tipL: [TIP[0], TIP[2]], tipR: [TIP[0], -TIP[2]] };
/** Koła sprawdzane na krawędzi nawierzchni: przednie i skrajne koła obu wózków (przednia i tylna oś). */
const CHECK_PTS: { p: [number, number]; name: string }[] = [
  { p: [NOSE_X, 0], name: 'koło przednie' },
  ...[-1.5, 1.5].flatMap((dx) => [
    { p: [MLG.x + dx, MAIN_OUT] as [number, number], name: 'lewy wózek' },
    { p: [MLG.x + dx, -MAIN_OUT] as [number, number], name: 'prawy wózek' },
  ]),
];
/** Poziom płyty (jak RW_Y niżej – tu potrzebny wcześniej) i koniec pasa (09L) przed nosem przy zawracaniu (x). */
const PAD_Y = -6.13;
const PAD_END = -52;
/** Punkt samolotu (x, z w układzie samolotu) na płycie, przy obecnej pozie. */
const gameWorld = (g: SteerGame, x: number, z: number): [number, number] => {
  const dx = x - TURN_X;
  const c = Math.cos(g.yaw);
  const s = Math.sin(g.yaw);
  return [g.x + dx * c + z * s, g.z - dx * s + z * c];
};
const gameWorld3 = (g: SteerGame, x: number, z: number): V3 => {
  const [wx, wz] = gameWorld(g, x, z);
  return [wx, PAD_Y + 0.03, wz];
};

/**
 * Pasy do sprawdzenia: szerokość pasa i zatoczka do zawracania (turn pad) po lewej stronie końca pasa – pas poszerzony
 * o `pad` m na długości PAD_LEN, potem zwężenie do szerokości pasa.
 */
export const STEER_LEVELS = [
  { id: '60', name: 'Pas 60 m', W: 60, pad: 0 },
  { id: 'pad', name: 'Pas 45 m z zatoczką', W: 45, pad: 20 },
  { id: '45', name: 'Pas 45 m', W: 45, pad: 0 },
] as const;
type SteerLevel = (typeof STEER_LEVELS)[number];
const levelOf = (id: string): SteerLevel => STEER_LEVELS.find((l) => l.id === id) ?? STEER_LEVELS[0];
const PAD_LEN = 70;
const PAD_TAPER = 45;
/** Obrys nawierzchni (x, z) – zamknięty wielokąt: prawa krawędź, koniec pasa, lewa krawędź (z zatoczką). */
function pavement(lvl: SteerLevel): [number, number][] {
  const h = lvl.W / 2;
  const far = PAD_END + RWY.L;
  const left: [number, number][] = lvl.pad > 0 ? [[PAD_END, h + lvl.pad], [PAD_END + PAD_LEN, h + lvl.pad], [PAD_END + PAD_LEN + PAD_TAPER, h]] : [[PAD_END, h]];
  return [[far, -h], [PAD_END, -h], ...left, [far, h]];
}
/** Odległość punktu od krawędzi nawierzchni (m): dodatnia – na nawierzchni, ujemna – na trawie. */
function edgeDist(poly: [number, number][], x: number, z: number) {
  let inside = false;
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const ex = xj - xi;
    const ez = zj - zi;
    const t = Math.max(0, Math.min(1, ((x - xi) * ex + (z - zi) * ez) / (ex * ex + ez * ez)));
    d = Math.min(d, Math.hypot(x - xi - t * ex, z - zi - t * ez));
  }
  return inside ? d : -d;
}
/** Linia przesunięta do środka nawierzchni o d (bez zamykającego, dalekiego odcinka) – granica zapasu od krawędzi. */
function insetLine(poly: [number, number][], d: number): [number, number][] {
  const nrm = (a: [number, number], b: [number, number]): [number, number] => {
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const l = Math.hypot(ex, ez);
    return [ez / l, -ex / l];
  };
  return poly.map((p, i) => {
    const n0 = i > 0 ? nrm(poly[i - 1], p) : null;
    const n1 = i < poly.length - 1 ? nrm(p, poly[i + 1]) : null;
    if (!n0 || !n1) {
      const n = (n0 ?? n1)!;
      return [p[0] + n[0] * d, p[1] + n[1] * d];
    }
    const mx = n0[0] + n1[0];
    const mz = n0[1] + n1[1];
    const ml = Math.hypot(mx, mz);
    const c = (mx / ml) * n0[0] + (mz / ml) * n0[1];
    return [p[0] + (mx / ml) * (d / c), p[1] + (mz / ml) * (d / c)];
  });
}
/** Jeden krok zawracania (ds – czas animacji): postój i skręt tillera, jazda po łuku, postój na końcu, od nowa. */
function stepGame(g: SteerGame, ds: number) {
  g.tp += ds;
  if (g.st === 'ready' && Math.abs(g.deg - g.cmd) < 0.1 && g.tp > 3) Object.assign(g, { st: 'drive', go: true, tp: 0 });
  if (g.st === 'off' || g.st === 'done') g.go = false;
  // koło przednie skręca za tillerem ok. 20°/s (po pierwszej sekundzie postoju)
  if (g.tp > 1 || g.st !== 'ready') g.deg += Math.sign(g.cmd - g.deg) * Math.min(Math.abs(g.cmd - g.deg), 20 * ds);
  const vT = g.go ? TURN_V : 0;
  g.v += Math.sign(vT - g.v) * Math.min(Math.abs(vT - g.v), (vT > g.v ? 0.6 : 1.5) * ds);
  const d = g.deg * DEG;
  // ruch „rowerowy”: punkt odniesienia jedzie wzdłuż kadłuba z v·cos δ, samolot obraca się z v·sin δ / rozstaw osi
  const vr = g.v * Math.cos(d);
  g.yaw += ((g.v * Math.sin(d)) / (TURN_X - NOSE_X)) * ds;
  g.x += -Math.cos(g.yaw) * vr * ds;
  g.z += Math.sin(g.yaw) * vr * ds;
  const poly = pavement(levelOf(g.lvl));
  let m = Infinity;
  let worst = CHECK_PTS[0];
  for (const c of CHECK_PTS) {
    const [wx, wz] = gameWorld(g, c.p[0], c.p[1]);
    const e = edgeDist(poly, wx, wz) - TYRE_HALF;
    if (e < m) {
      m = e;
      worst = c;
    }
  }
  g.m = m;
  g.mName = worst.name;
  if (g.st === 'off' || g.st === 'done') {
    if (g.tp > 6) Object.assign(g, newGame(g.lvl, g.til));
    return;
  }
  if (g.st !== 'drive') return;
  g.minM = Math.min(g.minM, m);
  g.acc += ds;
  if (g.v > 0.05 && g.acc > 0.2) {
    g.acc = 0;
    (Object.keys(TRACK_PTS) as (keyof Tracks)[]).forEach((k) => g.tracks[k].push(gameWorld3(g, TRACK_PTS[k][0], TRACK_PTS[k][1])));
  }
  if (m < 0) {
    const [hx, hz] = gameWorld(g, worst.p[0], worst.p[1]);
    Object.assign(g, { hit: { x: hx, z: hz, name: worst.name }, st: 'off', v: 0, tp: 0 });
  } else if (Math.cos(g.yaw) < Math.cos(178 * DEG)) Object.assign(g, { st: 'done', tp: 0 });
}
/**
 * Wynik z góry (bez animacji): cały zawrót przy skręcie z suwaka – najmniejszy zapas koła od krawędzi, które koło
 * i ile brakuje. Ten sam ruch co w animacji, krok co 0,4 m.
 */
function checkTurn(lvlId: string, til: number) {
  const g = newGame(lvlId, til);
  g.deg = til;
  const poly = pavement(levelOf(lvlId));
  const d = til * DEG;
  let minM = Infinity;
  let name = '';
  for (let i = 0; i < 4000 && Math.cos(g.yaw) > Math.cos(178 * DEG); i++) {
    for (const c of CHECK_PTS) {
      const [wx, wz] = gameWorld(g, c.p[0], c.p[1]);
      const e = edgeDist(poly, wx, wz) - TYRE_HALF;
      if (e < minM) {
        minM = e;
        name = c.name;
      }
    }
    const step = 0.4;
    g.yaw += (step * Math.sin(d)) / (TURN_X - NOSE_X);
    g.x += -Math.cos(g.yaw) * step * Math.cos(d);
    g.z += Math.sin(g.yaw) * step * Math.cos(d);
  }
  return { minM, name };
}
/** Przewidywany tor punktu samolotu przy skręcie z suwaka – od obecnego położenia do zawrócenia. */
function predictTrack(g: SteerGame, pt: [number, number]): V3[] {
  const s: SteerGame = { ...g };
  const d = s.til * DEG;
  const out: V3[] = [gameWorld3(s, pt[0], pt[1])];
  const step = 1.5;
  for (let i = 0; i < 400 && Math.cos(s.yaw) > Math.cos(178 * DEG); i++) {
    s.yaw += (step * Math.sin(d)) / (TURN_X - NOSE_X);
    s.x += -Math.cos(s.yaw) * step * Math.cos(d);
    s.z += Math.sin(s.yaw) * step * Math.cos(d);
    out.push(gameWorld3(s, pt[0], pt[1]));
  }
  return out;
}
/**
 * Ile miejsca w poprzek pasa zajmują koła przy zawracaniu o 180° kątem δ: skrajne położenia (z) – prawe zewnętrzne
 * koło na początku i najdalszy punkt śladu koła przedniego albo lewego wózka po drugiej stronie.
 */
export function uTurnSpan(deltaDeg: number) {
  const tr = turnRadii(deltaDeg)!;
  const zMin = -MAIN_OUT - TYRE_HALF;
  const zMax = Math.max(tr.rc + tr.nose, 2 * tr.rc + MAIN_OUT) + TYRE_HALF;
  return { ...tr, zMin, zMax, need: zMax - zMin + 2 * EDGE_CLR };
}

/* ======================= napęd podwozia ======================= */

/** Bieżące wartości zakładek; a – opóźnienie w tej chwili, stop – czas postoju po zatrzymaniu (s). */
/** Zakładka chowania: po „Rozpocznij” załoga daje dźwignię na UP, a po schowaniu (ok. 9 s) i chwili lotu – na DOWN. */
const GEAR_UP_AT = 2;
const GEAR_DOWN_AT = 16;
const gearLeverUp = (run: boolean, t: number) => run && t >= GEAR_UP_AT && t < GEAR_DOWN_AT;

type Live = {
  L: number;
  s: number;
  p: number;
  v: number;
  dist: number;
  temp: number[];
  r: number;
  t: number;
  a: number;
  stop: number;
  n1: number;
  rev: number;
  deg: number;
  /** Lądowanie: czas od przyziemienia kół głównych (s, ujemny przed nim), wysokość kół nad pasem (m), opadanie (m/s), pochylenie (°). */
  u: number;
  h: number;
  sink: number;
  pitch: number;
  /** Jak nisko pod samolotem jest pas (m) – pas i dym przesuwają się o tyle w dół. */
  lift: number;
  /** Czy trwa animacja lądowania (a nie postój ustawiany suwakiem). */
  landing: boolean;
  /** Prędkość obwodowa kół głównych i przednich (m/s) – rozkręcają się po zetknięciu z pasem. */
  spinV: number;
  noseV: number;
  /** Każde z 12 kół głównych osobno (kolejność MAIN_WHEEL_INDEX): prędkość obwodowa (m/s) i chwila zetknięcia z pasem (u, −1 – jeszcze w powietrzu). */
  wV: number[];
  wTouch: number[];
  /** Wychylenie spojlerów (rad) – do opływu i ECAM. */
  spl: number;
  /** Przechylenie samolotu przy przyziemieniu (°, dodatnie – lewe skrzydło w dół). */
  bank: number;
  /** Chwila (u) wysunięcia spojlerów naziemnych – obie golenie główne na pasie (−1 – jeszcze nie) i udział hamowania autobrake 0…1. */
  splU: number;
  brakeK: number;
  /** Zawracanie na pasie (sprawdzenie, czy się zmieści). */
  game: SteerGame;
};
const DEG = Math.PI / 180;
const sm01 = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
/** Skok amortyzatora przedniego (m). */
const NOSE_STROKE = GEAR_STROKE * 0.6;
/** Punkt obrotu samolotu przy lądowaniu: styk kół głównych z pasem. */
const RW_PIVOT: [number, number, number] = [1.3, -6.13, 0];
/**
 * Koła główne w kolejności MAIN_WHEEL_INDEX: strona (si), odległość osi od przegubu wózka wzdłuż samolotu (dx, przednia
 * ujemna) i położenie w poprzek (z, lewe dodatnie).
 */
const MAIN_WHEELS = [1, -1].flatMap((sz, si) => [-1.5, 0, 1.5].flatMap((dx) => [0.63, -0.63].map((dz) => ({ si, dx, z: sz * (MLG.z + dz) }))));
/** Przechylenie przy przyziemieniu (°, lewe skrzydło niżej) – prawy wózek jest wtedy o BANK_GAP (m) wyżej od lewego. */
const BANK_TD = 0.6;
const BANK_GAP = 2 * MLG.z * Math.sin(BANK_TD * (Math.PI / 180));
/** Jak szybko wózek kładzie się na pasie po zetknięciu przedniej osi (rad/s – z prędkości opadania ok. 0,9 m/s na 3 m belki). */
const BOGIE_RATE = 0.4;

/** Stan podwozia dla wybranej zakładki; zwraca napęd dla modelu i bieżące wartości do ramek. */
export type GearLive = Live;
export function useGearDriver(mode: GearMode | null, params: Params, direct?: DirectPose) {
  const drive = useMemo(newGearDrive, []);
  const live = useRef<Live>({ L: 1, s: GEAR_STROKE, p: 0, v: 0, dist: 0, temp: Array(12).fill(30), r: 0, t: 0, a: 0, stop: 0, n1: 21, rev: 0, deg: 0, u: 0, h: 0, sink: 0, pitch: 0, lift: 0, landing: false, spinV: 0, noseV: 0, wV: Array(12).fill(0), wTouch: Array(12).fill(-1), spl: 0, bank: 0, game: newGame('60', 70), splU: -1, brakeK: 0 });
  /** Stan silników dla modelu (ten sam obiekt co klatkę – silnik sam go odczytuje). */
  const power = useMemo(() => ({ n1: 21, rev: 0 }), []);
  /** Wychylenia powierzchni sterowych dla modelu skrzydła (spojlery w czasie dobiegu). */
  const surf = useMemo(() => ({ aileron: 0, elevator: 0, rudder: 0, spoiler: 0 }), []);
  const prev = useRef<string>('');
  /**
   * Początek animacji lądowania (powtórka w pętli, wejście do zakładki, zmiana ustawień): stan z podejścia ustawiony
   * od razu – odwracacze zamknięte, spojlery schowane, ciąg z podejścia, koła nieruchome, wózek pochylony – zamiast
   * dojeżdżać do niego przez kilka sekund z końca poprzedniego dobiegu.
   */
  const resetLanding = (lv: Live) => {
    lv.t = 0;
    lv.dist = 0;
    lv.stop = 0;
    lv.v = LANDING.vApp;
    lv.rev = 0;
    lv.n1 = LANDING.n1App;
    lv.spinV = 0;
    lv.noseV = 0;
    lv.wV = Array(12).fill(0);
    lv.wTouch = Array(12).fill(-1);
    lv.splU = -1;
    lv.brakeK = 0;
    lv.spl = 0;
    lv.a = 0;
    power.rev = 0;
    power.n1 = LANDING.n1App;
    surf.spoiler = 0;
    drive.noseSpin = 0;
    drive.bogie = 0.19;
    drive.bogieLR = [0.19, 0.19];
    drive.wheelSpin = Array(12).fill(0);
  };
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const k = 1 - Math.exp(-dt * 3);
    const lv = live.current;
    const key = `${mode}|${params.land}|${params.run}|${params.ab}`;
    if (key !== prev.current) {
      prev.current = key;
      lv.t = 0;
      if (mode === 'brakes') {
        lv.v = V_TD;
        lv.dist = 0;
      }
      const landingNow = (mode === 'shock' && params.land !== false) || (mode === 'brakes' && params.run !== false) || mode === 'landing';
      if (landingNow) resetLanding(lv);
    }
    lv.t += dt;
    const landing = (mode === 'shock' && params.land !== false) || (mode === 'brakes' && params.run !== false) || mode === 'landing';
    lv.landing = landing;
    // poza lądowaniem samolot stoi poziomo (zakładki amortyzatora i hamulców sterują pozą samolotu)
    if (direct && (mode === 'shock' || mode === 'brakes' || mode === 'landing')) {
      Object.assign(direct, { snap: false, pivot: RW_PIVOT, shift: [0, 0, 0] as V3, lift: 0, bank: 0, yaw: 0, alpha: landing ? lv.pitch : 0 });
      Object.assign(direct.surf, { aileron: 0, elevator: 0, rudder: 0, spoiler: 0 });
    }
    if (landing) {
      /*
       * Wspólny przebieg lądowania (landing.ts): podejście, wyrównanie, przyziemienie kół głównych, spojlery,
       * odwracacze, autobrake, derotacja i przyziemienie koła przedniego. Samolot stoi w miejscu i obraca się wokół
       * styku kół głównych, a pas podnosi się pod nim i przesuwa z jego prędkością.
       */
      const ab = AUTOBRAKE[String(params.ab ?? '3')] ?? AUTOBRAKE['3'];
      const u = lv.t - LANDING.tTD;
      lv.u = u;
      let pitch = 0;
      let L = 0;
      let noseK = 0;
      let n1T: number = LANDING.n1Idle;
      let revT = 0;
      let splT = 0;
      if (u < 0) {
        const air = landingAir(lv.t);
        lv.v = air.v;
        lv.a = 0;
        lv.h = air.h;
        lv.sink = air.sink;
        pitch = air.pitch;
        n1T = air.n1;
        // koła w powietrzu nie kręcą się (po schowaniu i wypuszczeniu hamulce je zatrzymały)
        lv.noseV = 0;
      } else {
        const g = landingGround(u);
        /*
         * Spojlery naziemne (uzbrojone): wysuwają się w pełni, gdy obie golenie główne są ugięte; gdy tylko jedna,
         * a pilot wybrał już ciąg wsteczny – częściowo. Sygnał ich wysunięcia uruchamia autobrake.
         */
        const leftDown = lv.wTouch.slice(0, 6).some((x) => x >= 0);
        const rightDown = lv.wTouch.slice(6).some((x) => x >= 0);
        if (leftDown && rightDown && lv.splU < 0) lv.splU = u;
        const spU = lv.splU >= 0 ? lv.splU : 1e9;
        // po wysunięciu spojlerów środek siły nośnej przesuwa się i nos lekko się podrywa (ok. 0,4°), zanim pilot
        // zacznie go opuszczać
        const bump = u > spU ? 0.4 * Math.sin(Math.min(1, (u - spU) / 1.2) * Math.PI) : 0;
        pitch = g.pitch + bump * (1 - g.nose);
        noseK = g.nose;
        lv.h = 0;
        lv.sink = 0;
        // opóźnienie: opór powietrza (maleje z prędkością) i odwracacze, a od włączenia autobrake – zadane opóźnienie
        const aAero = LANDING.aAero * (0.4 + 0.6 * (lv.v / V_TD) ** 2);
        // autobrake zaczyna hamować na sygnał wysunięcia spojlerów naziemnych (z niewielkim opóźnieniem)
        const brakeK = lv.splU >= 0 ? sm01((u - lv.splU - LANDING.brakeAt) / LANDING.brakeRamp) : 0;
        lv.brakeK = brakeK;
        const a = lv.v <= 0 ? 0 : aAero + (Math.max(aAero, ab.a) - aAero) * brakeK;
        lv.a = a;
        const vPrev = lv.v;
        lv.v = Math.max(0, lv.v - a * dt);
        // energię pochłaniają hamulce – poza częścią od oporu, spojlerów i odwracaczy
        const brakeShare = a > 0 ? Math.max(0, (a - aAero) / a) : 0;
        const dE = 0.5 * MASS * (vPrev * vPrev - lv.v * lv.v) * brakeShare;
        lv.temp = lv.temp.map((T, i) => T + (dE / 12 / BRAKE_HC) * (0.92 + 0.16 * ((i * 7) % 5) / 4));
        // koła przednie rozkręcają się dopiero, gdy koło przednie dotknie pasa (główne – niżej, każde osobno)
        if (noseK > 0.05) lv.noseV += (lv.v - lv.noseV) * Math.min(1, dt / 0.04);
        drive.noseSpin = (drive.noseSpin ?? 0) + lv.noseV * dt;
        L = landLoad(u);
        // spojlery naziemne do ok. 50°, chowane przy prędkości kołowania. Odwracacze: pilot wybiera ciąg wsteczny zaraz
        // po przyziemieniu kół głównych (nie czeka na koło przednie) – najpierw REV IDLE; silniki rozpędzają się do
        // MAX REV dopiero, gdy odwracacz jest w pełni otwarty (zielone REV); poniżej ok. 70 kt – znów REV IDLE,
        // przy prędkości kołowania odwracacze się zamykają
        revT = g.rev && lv.v > 8 ? 1 : 0;
        splT = lv.v <= 8 ? 0 : leftDown && rightDown ? 0.87 : (leftDown || rightDown) && revT ? 0.87 * 0.3 : 0;
        n1T = revT && lv.rev > 0.98 && lv.v > 36 ? 70 : LANDING.n1Idle;
      }
      lv.pitch = pitch;
      lv.dist += lv.v * dt;
      // stygnięcie hamulców (przyspieszone)
      lv.temp = lv.temp.map((T) => (Number.isFinite(T) ? T - (T - 30) * dt * 0.02 : 30));
      // amortyzatory: główne z obciążenia, przednie – gdy koło przednie przejmuje ciężar pod koniec derotacji
      const st = shockState(L);
      lv.L = L;
      lv.s = st.s;
      lv.p = st.p;
      const ext = GEAR_STROKE - st.s;
      // wózek pochylony w powietrzu (przednia oś niżej) – przy pochyleniu samolotu jego przednie koła dotykają pasa
      // pierwsze; pas obniżamy tak, żeby najniższe koło stało na nim (wózek prostuje się, gdy amortyzator się ugina)
      /*
       * Wózek: w powietrzu pochylony (przednia oś ok. 11° niżej względem goleni). Po zetknięciu przedniej osi z pasem
       * kładzie się płasko na pasie w ok. 0,15 s – względem samolotu jest wtedy pochylony o kąt pochylenia samolotu –
       * i dalej podąża za nim przy opuszczaniu nosa. Pas obniżamy tak, żeby najniższa oś stała na nim.
       */
      /*
       * Każdy wózek osobno: dopóki jego przednia oś nie dotknie pasa, wisi pochylony; potem obraca się wokół przegubu,
       * aż położy się płasko (samolot dalej opada, ok. 0,25 s), i dalej podąża za opuszczaniem nosa. Środkowa i tylna oś
       * dotykają pasa dopiero wtedy.
       */
      const bog: [number, number] = drive.bogieLR ? [...drive.bogieLR] : [0.19, 0.19];
      for (let si = 0; si < 2; si++) {
        const frontDown = lv.wTouch[MAIN_WHEEL_INDEX(si, 0, true)] >= 0 || lv.wTouch[MAIN_WHEEL_INDEX(si, 0, false)] >= 0;
        if (u < 0 || !frontDown) bog[si] = 0.19;
        else bog[si] += Math.sign(pitch * DEG - bog[si]) * Math.min(Math.abs(pitch * DEG - bog[si]), dt * BOGIE_RATE);
      }
      drive.bogieLR = bog;
      drive.bogie = bog[0];
      /*
       * Wysokość każdego koła nad pasem: lekkie przechylenie (lewe skrzydło niżej, jak przy bocznym wietrze) i
       * pochylenie wózka. Pas obniżamy tak, żeby najniższe koło było na wysokości lv.h (0 po przyziemieniu).
       */
      // przechylenie wynika z tego, ile prawemu wózkowi brakuje do pasa: po przyziemieniu lewego opada on dalej
      // z prędkością opadania, aż jego najniższe koło stanie na pasie (wtedy oba wózki stoją, a resztę wyrównują osie)
      const lowAx = (si: number) => Math.min(...[-1.5, 0, 1.5].map((dx) => dx * Math.sin(bog[si] - pitch * DEG)));
      const gapR = u < 0 ? BANK_GAP : Math.max(0, BANK_GAP - LANDING.sinkTD * u);
      const sb = Math.max(0, (gapR + lowAx(0) - lowAx(1)) / (2 * MLG.z));
      lv.bank = Math.asin(sb) / DEG;
      const rel = MAIN_WHEELS.map((w) => -w.z * sb + w.dx * Math.sin(bog[w.si] - pitch * DEG));
      const low = Math.min(...rel);
      drive.extend = ext;
      drive.lift = lv.h + ext - low;
      // koło zaczyna się kręcić dopiero, gdy samo dotknie pasa – rozkręca się od zera do prędkości samolotu w ok. 0,12 s
      // (stąd dym z opon); potem toczy się dalej, nawet gdy na chwilę odskoczy o kilka milimetrów
      const spin = drive.wheelSpin ?? (drive.wheelSpin = Array(12).fill(0));
      MAIN_WHEELS.forEach((w, k) => {
        if (u >= 0 && lv.wTouch[k] < 0 && lv.h + rel[k] - low < 0.012) lv.wTouch[k] = u;
        if (lv.wTouch[k] < 0) {
          lv.wV[k] = 0;
          return;
        }
        lv.wV[k] += (lv.v - lv.wV[k]) * Math.min(1, dt / 0.04);
        spin[k] += lv.wV[k] * dt;
      });
      lv.spinV = Math.max(...lv.wV);
      drive.spin = spin[0];
      drive.lights = true;
      drive.nose = NOSE_STROKE * (1 - noseK);
      drive.retract = 0;
      drive.steer += (0 - drive.steer) * k;
      drive.rear += (0 - drive.rear) * k;
      drive.heat = Math.max(0, Math.min(1, (Math.max(...lv.temp) - 150) / 450));
      lv.lift = drive.lift;
      surf.spoiler += Math.sign(splT - surf.spoiler) * Math.min(Math.abs(splT - surf.spoiler), dt * 1.0);
      lv.spl = surf.spoiler;
      // odwracacz otwiera się ok. 1,5 s
      lv.rev += Math.sign(revT - lv.rev) * Math.min(Math.abs(revT - lv.rev), dt * 0.65);
      lv.n1 += (n1T - lv.n1) * Math.min(1, dt * 0.9);
      power.n1 = lv.n1;
      power.rev = lv.rev;
      if (direct) {
        direct.alpha = pitch;
        direct.bank = lv.bank;
      }
      // powtórka: amortyzator – kilka sekund po przyziemieniu koła przedniego, hamulce – 4 s po zatrzymaniu
      lv.stop = u > 0 && lv.v === 0 ? lv.stop + dt : 0;
      if ((mode === 'shock' && u > 10) || lv.stop > 4) {
        resetLanding(lv);
      }
      return;
    }
    lv.u = 0;
    lv.h = 0;
    lv.sink = 0;
    lv.pitch = 0;
    drive.nose = undefined;
    drive.bogie = undefined;
    drive.bogieLR = undefined;
    drive.wheelSpin = undefined;
    lv.bank = 0;
    drive.noseSpin = undefined;
    // reflektory na goleni przedniej: przy kołowaniu i zawracaniu na pasie świecą
    drive.lights = mode === 'steer';
    // silniki: domyślnie bieg jałowy na ziemi, w zakładce chowania – ciąg wznoszenia
    const n1T = mode === 'retract' ? 88 : 21;
    const revT = 0;
    lv.rev += Math.sign(revT - lv.rev) * Math.min(Math.abs(revT - lv.rev), dt * 0.9);
    surf.spoiler += Math.sign(0 - surf.spoiler) * Math.min(Math.abs(surf.spoiler), dt * 1.4);
    lv.n1 += (n1T - lv.n1) * Math.min(1, dt * 0.7);
    power.n1 = lv.n1;
    power.rev = lv.rev;
    // domyślnie: postój, koła prosto, hamulce stygną
    let extend = 0;
    let lift = 0;
    let retract = 0;
    let steer = 0;
    let rear = 0;
    if (mode === 'shock') {
      // bez animacji: obciążenie z suwaka, samolot stoi na płycie (zmiana płynna)
      const L = Number(params.load ?? 100) / 100;
      const st = shockState(L);
      lv.L = L;
      lv.s = st.s;
      lv.p = st.p;
      extend = GEAR_STROKE - st.s;
      drive.extend += (extend - drive.extend) * k;
      drive.lift = drive.extend;
      drive.retract = 0;
      lv.lift = drive.lift;
    } else if (mode === 'retract') {
      // ok. 9 s na pełne schowanie albo wypuszczenie, jak w samolocie; dźwignię przestawia załoga (scenariusz)
      const target = gearLeverUp(Boolean(params.run), lv.t) ? 1 : 0;
      lv.r += Math.sign(target - lv.r) * Math.min(Math.abs(target - lv.r), dt / 9);
      drive.retract = lv.r;
      drive.extend = GEAR_STROKE;
      drive.lift = 0;
    } else if (mode === 'brakes') {
      // bez dobiegu: samolot stoi, hamulce stygną
      lv.v = 0;
      lv.a = 0;
      lv.lift = 0;
      lv.temp = lv.temp.map((T) => (Number.isFinite(T) ? T - (T - 30) * dt * 0.02 : 30));
      drive.heat = Math.max(0, Math.min(1, (Math.max(...lv.temp) - 150) / 450));
      drive.extend += (0 - drive.extend) * k;
      drive.lift = drive.extend;
      drive.retract = 0;
      return;
    } else if (mode === 'steer') {
      // zawracanie na pasie ze skrętem z suwaka: samolot kołuje po płycie, w kółko
      const lvl = String(params.lvl ?? '60');
      const til = tillerOf(params.tiller);
      // zmiana pasa – od nowa; zmiana skrętu – samolot jedzie dalej, koło przednie skręca na nowy kąt
      if (!lv.game || lv.game.lvl !== lvl) lv.game = newGame(lvl, til);
      const g = lv.game;
      if (g.til !== til) Object.assign(g, { til, cmd: til });
      const ds = dt * TURN_K;
      stepGame(g, ds);
      drive.spin += g.v * Math.cos(g.deg * DEG) * ds;
      drive.noseSpin = (drive.noseSpin ?? 0) + g.v * ds;
      lv.deg = g.deg;
      steer = g.deg * DEG;
      rear = rearOf(g.deg);
      if (direct) {
        // oś obrotu w punkcie odniesienia, samolot przesunięty po płycie – bez płynnego dojazdu
        Object.assign(direct, { snap: true, pivot: [TURN_X, PAD_Y, 0] as V3, shift: [g.x - TURN_X, 0, g.z] as V3, lift: 0, bank: 0, yaw: (g.yaw * 180) / Math.PI, alpha: 0 });
        Object.assign(direct.surf, { aileron: 0, elevator: 0, rudder: 0, spoiler: 0 });
      }
    }
    if (mode !== 'shock' && mode !== 'retract') {
      drive.extend += (extend - drive.extend) * k;
      drive.lift += (lift - drive.lift) * k;
      drive.retract += (retract - drive.retract) * k;
    }
    drive.steer += (steer - drive.steer) * k;
    drive.rear += (rear - drive.rear) * k;
    drive.heat += (0 - drive.heat) * k * 0.2;
  });
  return { drive, live, power, surf };
}

/** Odświeża ramkę kilka razy na sekundę (wartości z napędu zmieniają się co klatkę). */
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

/* ======================= nakładki zakładek ======================= */

/**
 * Spód lewego skrzydła nad punktem (x, z > 0): wysokość (m) albo null, gdy punkt nie leży pod płatem. W konfiguracji do
 * lądowania sloty wysunięte do przodu i w dół, klapy do tyłu – płat jest dłuższy niż sam keson.
 */
function wingUnderside(x: number, z: number): number | null {
  if (z < 3.1 || z > 30) return null;
  const le = wingSurface(z, 0, -1)[0];
  const te = wingSurface(z, 1, -1)[0];
  const s = (x - le) / (te - le);
  if (s < -0.12 || s > 1.15) return null;
  const y = wingSurface(z, Math.max(0, Math.min(1, s)), -1)[1];
  // slot przed krawędzią natarcia opada o ok. 0,3 m
  return y - 0.3 * Math.max(0, Math.min(1, 1 - s / 0.12));
}

/**
 * Strumienie odwracaczy ciągu: powietrze z kanału obejściowego wylatuje przez kaskady na boki i do przodu
 * (tory w układzie samolotu, oba silniki). Kaskad nie ma pod pylonem – górny wycinek gondoli jest zamknięty, żeby
 * strumień nie bił w skrzydło. Strugi skierowane skośnie w górę dochodzą do spodu skrzydła, rozpływają się pod nim
 * na boki i dopiero przed krawędzią natarcia znów unoszą się; strugi skierowane w dół rozlewają się nad pasem.
 * Tory są osobną funkcją, żeby dało się je sprawdzić bez sceny.
 */
export function reverserPaths(sides: number[]) {
  const e = engineOrigin();
  const out: [number, number, number][][] = [];
  // kaskady w układzie samolotu: pas na zewnętrznej ściance gondoli, odsłonięty przez odsuniętą osłonę
  const cx0 = e[0] + CASCADE_BAND.x0 * ENG_K;
  const cx1 = e[0] + CASCADE_BAND.x1 * ENG_K;
  const r0 = CASCADE_BAND.r * ENG_K;
  const n = 18;
  for (const side of sides)
    for (let k = 0; k < n; k++) {
      const ph = ((k + 0.5) / n) * Math.PI * 2;
      // ph = 0 – góra gondoli (pylon): tam kaskady są zaślepione
      if (Math.cos(ph) > 0.86) continue;
      const pts: [number, number, number][] = [];
      let up = 0; // ile struga została zepchnięta w dół przez skrzydło (m, ≤ 0)
      let gr = 0; // ile uniesiona nad pasem (m, ≥ 0)
      let spread = 0; // przesunięcie wzdłuż rozpiętości (m)
      // struga wychodzi z kaskad (w różnych miejscach pasa) skośnie na zewnątrz i do przodu – tak kierują ją łopatki
      const xs = cx0 + (cx1 - cx0) * (0.2 + 0.3 * (k % 3));
      for (let i = 0; i <= 28; i++) {
        const u = i / 28;
        const r = r0 + 3.2 * u;
        const x = xs - 2.4 * u - 4.6 * u * u;
        const y0 = e[1] + Math.cos(ph) * r;
        const zl = e[2] + Math.sin(ph) * r; // w układzie lewego skrzydła
        const wy = wingUnderside(x, zl + spread);
        if (wy !== null) up = Math.min(up, wy - 0.3 - y0);
        else up *= 0.84;
        gr = Math.max(gr * 0.9, RW_Y + 0.35 - (y0 + up));
        // zepchnięta struga rozpływa się wzdłuż rozpiętości – w tę stronę, w którą już leciała
        spread = (-up + gr) * 0.7 * Math.sign(Math.sin(ph) || 1);
        pts.push([x, y0 + up + gr, side * (zl + spread)]);
      }
      out.push(pts);
    }
  return out;
}

function ReverserStreams({ sides = [1, -1] }: { sides?: number[] }) {
  const paths = useMemo(() => reverserPaths(sides), [sides]);
  return <PathStreaks paths={paths} count={90 * sides.length} color="#c7e6ff" speed={14} trail={3} width={0.07} opacity={0.65} />;
}

/**
 * Opływ samolotu przy lądowaniu: cienkie smugi (kamery w tych zakładkach są blisko podwozia, więc grube smugi
 * zamieniałyby się w białe pasy), tylko nad pasem; przy skrzydle lekki upwash przed nim i downwash za nim.
 */
function LandingWind({ speed }: { speed: number }) {
  // tory przechodzące blisko kamery (kilka metrów) pomijamy – z bliska smuga zamienia się w szeroki biały pas
  const cam = useThree((st) => st.camera.position);
  const cy = Math.round(cam.y);
  const cz = Math.round(cam.z);
  const paths = useMemo(() => {
    const out: [number, number, number][][] = [];
    let seed = 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 46; k++) {
      const y0 = -5.2 + rnd() * 15;
      const z0 = -38 + rnd() * 76;
      if (Math.hypot(y0 - cy, z0 - cz) < 7) continue;
      const near = Math.max(0, 1 - Math.abs(y0 + 1) / 7) * (Math.abs(z0) < 33 ? 1 : 0.2);
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 30; i++) {
        const x = -70 + (140 * i) / 30;
        const dy = near * 0.9 * (x < 0 ? 0.7 * Math.exp(x / 12) : 0.7 - (x / 70) * 3.5);
        pts.push([x, Math.max(-5.6, y0 + dy), z0]);
      }
      out.push(pts);
    }
    return out;
  }, [cy, cz]);
  return <PathStreaks paths={paths} count={110} color="#9bd7ff" speed={speed} trail={4} width={0.08} opacity={0.35} />;
}

/** Opływ przy lądowaniu: smugi powietrza z prędkością samolotu i strumienie silników (wlot i wylot albo odwracacze). */
function LandingFlow({ live, pose }: { live: MutableRefObject<Live>; pose: PoseState }) {
  const lv = live.current;
  const v = lv.v;
  // strumienie silnika, przy którym stoi kamera, pomijamy (z bliska zasłaniałyby kadr)
  const cam = useThree((st) => st.camera.position);
  const e = engineOrigin();
  const sides = useMemo(() => [1, -1].filter((sg) => Math.hypot(cam.z - sg * e[2], cam.y - e[1], (cam.x - e[0]) * 0.3) > 9), [Math.round(cam.x), Math.round(cam.y), Math.round(cam.z)]); // eslint-disable-line react-hooks/exhaustive-deps
  // opływ spojlerów: ścieżki przeliczane tylko przy zmianie stanu (schowane / uniesione), żeby smugi nie skakały
  const dep = lv.spl > 0.4 ? 0.87 : 0;
  const depRec = useMemo(() => ({ 1: dep, [-1]: dep }) as Record<number, number>, [dep]);
  return (
    <FollowPlane pose={pose}>
      {v > 3 && <LandingWind speed={Math.max(6, v * 0.55)} />}
      {v > 3 && <SpoilerFlow dep={depRec} speedK={v / 70} />}
      {sides.length > 0 && (lv.rev > 0.35 ? <ReverserStreams sides={sides} /> : <EngineStreams sides={sides} width={0.06} opacity={0.6} />)}
    </FollowPlane>
  );
}

export function GearLab({ mode, params, live, pose, dockExtra }: { mode: GearMode; params: Params; live: MutableRefObject<Live>; pose?: PoseState; dockExtra?: ReactNode }) {
  useTicker();
  // nocą (moduł świateł) bez strug opływu – widać światła samolotu i lotniska
  const night = useContext(NightCtx);
  const sp = useSpeed();
  const lv = live.current;
  const temps = lv.temp.map((T) => Math.round(T));
  const wheel = (gear: 'down' | 'transit' | 'up') => ({ brakeT: temps, tyre: Array(12).fill(mode === 'retract' ? 205 : 212), gear, parkBrk: mode === 'steer' ? false : undefined });
  // lądowanie: PFD (pochylenie, prędkość, wysokość nad pasem, opadanie, tryby FMA) i strona WHEEL
  const abId = String(params.ab ?? '3');
  const ab = AUTOBRAKE[abId] ?? AUTOBRAKE['3'];
  const phase = landingPhase(lv.t, lv.v);
  const fma: [string, string, string, string, string] =
    lv.u < 0
      ? lv.t < LANDING.tFlare
        ? ['SPEED', 'LAND', '', 'CAT 3\nDUAL\nDH 50', '1FD2\nA/THR']
        : ['RETARD', 'FLARE', '', 'CAT 3\nDUAL\nDH 50', '1FD2\nA/THR']
      : ['', 'ROLL OUT', '', 'CAT 3\nDUAL', '1FD2'];
  /*
   * Kontrolki pulpitu przy lądowaniu – przestawiają się same, zgodnie z przebiegiem: dźwignie ciągu w CL (autothrottle)
   * aż do „RETARD” (bieg jałowy), po przyziemieniu w zakres odwracacza (MAX REV, poniżej ok. 70 kt – IDLE REV), po
   * schowaniu odwracaczy znowu IDLE; hamulce aerodynamiczne uzbrojone (ARMED) – spojlery wysuwają się same; autobrake
   * z wybranym ustawieniem, DECEL po osiągnięciu zadanego opóźnienia; podwozie wypuszczone.
   */
  // dźwignie: CL (autothrottle) do „RETARD”, potem IDLE; po przyziemieniu REV IDLE, MAX REV dopiero po zielonym REV,
  // poniżej ok. 70 kt znów REV IDLE, przy prędkości kołowania IDLE
  const revSel = lv.landing && lv.u > LANDING.revAt && lv.v > 8;
  const thrPos = !lv.landing ? 0 : lv.u < 0 && lv.t < LANDING.tTD - 2.2 ? 1 : revSel ? (lv.rev > 0.98 && lv.v > 36 ? -1 : -0.35) : 0;
  const thr = <ThrustLevers pos={[thrPos, thrPos]} athr={lv.landing && lv.u < 0 && lv.t < LANDING.tTD - 2.2} size={96} />;
  const abk = <AutoBrakeKnob sel={(ab.name === 'LO' ? 'LO' : ab.name) as '2' | '3' | 'HI' | 'LO'} active={lv.landing && lv.brakeK > 0.02 && lv.v > 0.5} decel={lv.landing && lv.u > 0 && lv.v > 0.5 && lv.a >= 0.8 * ab.a} />;
  // w zakładce amortyzatora tylko to, co dotyczy przyziemienia: ciąg i autobrake (bez dźwigni podwozia i hamulców aerodynamicznych)
  const controls =
    mode === 'shock' ? (
      <ControlStack>
        {thr}
        {abk}
      </ControlStack>
    ) : (
      <ControlStack>
        <div style={{ display: 'flex', gap: 6 }}>
          {thr}
          <SpeedBrakeLever pos={0} armed={!(lv.landing && lv.u > 0 && lv.v <= 8)} deployed={lv.spl / 0.87} size={96} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {abk}
          <GearLever lever="down" state="down" size={82} />
        </div>
      </ControlStack>
    );
  const landingDock = lv.landing ? (
    <CockpitDock>
      {controls}
      <Pfd pitch={lv.pitch} bank={-lv.bank} ias={lv.v * 1.944} iasTarget={LANDING.vApp * 1.944} alt={lv.h * 3.281} ra={lv.h * 3.281} vs={-lv.sink * 196.85} heading={RWY.hdg} track={RWY.hdg} baro={1013} fd={null} fma={fma} width={260} />
      <LandingNd lv={lv} />
      <Ecam thrMode={null} n1={[lv.n1, lv.n1]} rev={[lv.rev, lv.rev]} egt={[420 + 3.2 * lv.n1, 424 + 3.2 * lv.n1]} page="WHEEL" wheel={wheel('down')} memo={[[`AUTO BRK ${ab.name}`, '#3ee36b'], ...(lv.spl > 0.05 ? ([['GND SPLRS', '#3ee36b']] as [string, string][]) : [])]} footer={{ tat: 18, sat: 18, isa: 3, flt: '07:11', time: '20:33:34', gw: MASS, gwcg: 28.5, fob: 9800 }} width={260} />
    </CockpitDock>
  ) : null;
  const landingLine = lv.landing && (
    <div style={{ color: '#facc15' }}>
      <b>{phase}</b> · pochylenie {fmt(lv.pitch, 1)}° · {lv.u < 0 ? `koła ${fmt(lv.h, 1)} m nad pasem · opadanie ${fmt(lv.sink, 1)} m/s` : `od przyziemienia ${fmt(lv.u, 1)} s`} · {sp.fmt(lv.v)}
    </div>
  );
  if (mode === 'landing') {
    const spl = lv.spl * 57.3;
    return (
      <>
        <Runway live={live} />
        <TyreSmoke live={live} />
        {pose && !night && <LandingFlow live={live} pose={pose} />}
        <CockpitDock>
          {controls}
          {dockExtra}
          <Pfd pitch={lv.pitch} bank={-lv.bank} ias={lv.v * 1.944} iasTarget={LANDING.vApp * 1.944} alt={lv.h * 3.281} ra={lv.h * 3.281} vs={-lv.sink * 196.85} heading={RWY.hdg} track={RWY.hdg} baro={1013} fd={null} fma={fma} width={260} />
          <LandingNd lv={lv} />
          <Ecam
            thrMode={null}
            n1={[lv.n1, lv.n1]}
            rev={[lv.rev, lv.rev]}
            egt={[420 + 3.2 * lv.n1, 424 + 3.2 * lv.n1]}
            memo={lv.spl > 0.05 ? [['GND SPLRS', '#3ee36b']] : []}
            page="FCTL"
            fctl={{ spL: Array(7).fill(spl), spR: Array(7).fill(spl), ailL: 0, ailR: 0, elev: 0, rudder: 0, pitchTrim: 2.2, slat: 1, flap: 1, conf: 'FULL' }}
            footer={{ tat: 18, sat: 18, isa: 3, flt: '07:11', time: '20:33:34', gw: MASS, gwcg: 28.5, fob: 9800 }}
            width={260}
          />
        </CockpitDock>
      </>
    );
  }
  if (mode === 'shock') {
    const air = lv.L < 0.01;
    return (
      <>
        {lv.landing && (
          <>
            <Runway live={live} />
            <TyreSmoke live={live} />
            {pose && <LandingFlow live={live} pose={pose} />}
          </>
        )}
        {landingDock}
        <InfoPortal>
          <div style={{ fontWeight: 700 }}>Amortyzator olejowo-gazowy</div>
          {landingLine}
          <div>
            obciążenie goleni: <b>{fmt(lv.L * 100, 0)}%</b> ciężaru na postoju · skok tłoczyska <b>{fmt(lv.s * 100, 0)} cm</b> z {fmt(GAS.max * 100, 0)} cm · ciśnienie gazu <b>{fmt(lv.p, 0)} bar</b>
          </div>
          <div style={{ opacity: 0.8 }}>
            {air
              ? 'W powietrzu tłoczysko jest całkiem wysunięte, a wózek pochylony – przednia oś niżej, żeby przy przyziemieniu koła dotykały pasa po kolei.'
              : 'Gaz (azot) działa jak sprężyna: im bardziej ściśnięty, tym mocniej odpycha. Olej przetłaczany przez kalibrowane otwory hamuje ruch – zamienia energię uderzenia w ciepło, więc samolot nie odbija się od pasa.'}
          </div>
        </InfoPortal>
      </>
    );
  }
  if (mode === 'retract') {
    const gear = lv.r <= 0.001 ? 'down' : lv.r >= 0.999 ? 'up' : 'transit';
    const run = Boolean(params.run);
    const up = gearLeverUp(run, lv.t);
    const act = run && (Math.abs(lv.t - GEAR_UP_AT) < 1.2 || Math.abs(lv.t - GEAR_DOWN_AT) < 1.2);
    return (
      <>
        <CockpitDock>
          <ControlStack>
            <GearLever lever={up ? 'up' : 'down'} state={gear} act={act} />
            <ThrustLevers pos={[1, 1]} athr size={96} />
          </ControlStack>
          <Ecam thrMode={['CLB', 92]} n1={[88, 88]} egt={[742, 745]} page="WHEEL" wheel={wheel(gear)} footer={{ tat: 12, sat: 8, isa: 3, flt: '00:01', time: '14:22:05', gw: 310000, gwcg: 29.1, fob: 98000 }} width={260} />
        </CockpitDock>
        <InfoPortal>
          <div style={{ fontWeight: 700 }}>
            Podwozie: {gear === 'down' ? 'wypuszczone i zablokowane' : gear === 'up' ? 'schowane i zablokowane' : 'w ruchu'}
          </div>
          {run ? (
            <div style={{ fontSize: 12, color: '#22d3ee' }}>{lv.t < GEAR_UP_AT ? 'po starcie, dodatnie wznoszenie' : up ? 'załoga: dźwignia podwozia UP' : 'załoga: dźwignia podwozia DOWN (pokaz wypuszczania)'}</div>
          ) : (
            <div style={{ fontSize: 12, color: '#facc15' }}>Naciśnij „Rozpocznij”.</div>
          )}
          <div>
            Na stronie WHEEL: <span style={{ color: '#3ee36b' }}>zielone trójkąty</span> – wypuszczone i zablokowane, <span style={{ color: '#ff3b30' }}>czerwone</span> – w ruchu, brak – schowane. Po dwa trójkąty na goleń, bo położenie sprawdzają dwa niezależne układy czujników.
          </div>
        </InfoPortal>
      </>
    );
  }
  if (mode === 'brakes') {
    return (
      <>
        <Runway live={live} />
        <TyreSmoke live={live} />
        {lv.landing && pose && <LandingFlow live={live} pose={pose} />}
        {landingDock ?? (
          <CockpitDock>
            {controls}
            <Ecam thrMode={null} n1={[lv.n1, lv.n1]} rev={[lv.rev, lv.rev]} egt={[420 + 3.2 * lv.n1, 424 + 3.2 * lv.n1]} page="WHEEL" wheel={wheel('down')} memo={[[`AUTO BRK ${ab.name}`, '#3ee36b']]} footer={{ tat: 18, sat: 18, isa: 3, flt: '07:11', time: '20:33:34', gw: MASS, gwcg: 28.5, fob: 9800 }} width={260} />
          </CockpitDock>
        )}
        <InfoPortal>
          <div style={{ fontWeight: 700 }}>Lądowanie i dobieg z autobrake {ab.name}</div>
          {landingLine}
          <div>
            prędkość <b>{sp.fmt(lv.v)}</b> · opóźnienie <b>{fmt(lv.a, 1)} m/s²</b> · przejechane <b>{fmt(lv.dist, 0)} m</b> · najgorętszy hamulec <b>{fmt(Math.max(...lv.temp), 0)} °C</b>
            {lv.v === 0 && lv.dist > 0 ? ' · samolot stoi' : ''}
            {lv.u < 0 ? ' · jeszcze w powietrzu' : ''}
          </div>
          {/* porównanie ustawień: droga i czas dobiegu od przyziemienia (prędkość ze wspólnego przebiegu lądowania) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '2px 10px', fontSize: 12, alignItems: 'center' }}>
            {AUTOBRAKE_LIST.map((x) => {
              const r = rollout(x.a);
              const on = x.id === abId;
              const maxD = rollout(AUTOBRAKE_LIST[0].a).d;
              return [
                <b key={`${x.id}n`} style={{ color: on ? '#3ee36b' : undefined }}>
                  {x.name}
                </b>,
                <span key={`${x.id}b`} style={{ height: 6, borderRadius: 3, background: on ? '#3ee36b' : 'rgba(255,255,255,0.25)', width: `${(r.d / maxD) * 100}%` }} />,
                <span key={`${x.id}d`} style={{ textAlign: 'right', opacity: on ? 1 : 0.7 }}>
                  {fmt(r.d, 0)} m
                </span>,
                <span key={`${x.id}t`} style={{ textAlign: 'right', opacity: on ? 1 : 0.7 }}>
                  {fmt(r.t, 0)} s
                </span>,
              ];
            })}
          </div>
          <div style={{ opacity: 0.8 }}>
            Tuż po przyziemieniu unoszą się <b>spojlery</b> (gaszą siłę nośną – cały ciężar przechodzi na koła, więc hamulce działają skutecznie), a silniki otwierają <b>odwracacz ciągu</b>. Białe oznaczenia pasa przesuwają się z prędkością samolotu. Przy przyziemieniu z opon bucha dym – koła w ułamku sekundy rozkręcają się od zera do prędkości samolotu i ich guma się przypala. Przy mocnym hamowaniu (HI) pojawia się znowu, choć układ przeciwpoślizgowy nie pozwala kołom się zablokować. Wartości są przybliżone.
          </div>
        </InfoPortal>
      </>
    );
  }
  // sterowanie: sprawdzenie, czy samolot zmieści się przy zawracaniu
  return <SteerPlay params={params} live={live} />;
}

/**
 * Sprawdzenie zawracania: wynik z góry (czy się zmieści i z jakim zapasem), animacja zawrotu z suwaka, tiller i ND
 * w doku kokpitu.
 */
function SteerPlay({ params, live }: { params: Params; live: MutableRefObject<Live> }) {
  const lv = live.current;
  const lvl = levelOf(String(params.lvl ?? '60'));
  const til = tillerOf(params.tiller);
  const g = lv.game.lvl === lvl.id ? lv.game : (lv.game = newGame(lvl.id, til));
  const hint = params.hint !== false;
  const res = useMemo(() => checkTurn(lvl.id, til), [lvl.id, til]);
  const tr = turnRadii(til)!;
  const span = uTurnSpan(til);
  const fits = res.minM >= 0;
  const icao = res.minM >= EDGE_CLR;
  const turned = (Math.abs(g.yaw) * 180) / Math.PI;
  const dir = til > 0 ? 'w lewo' : 'w prawo';
  const phase =
    g.st === 'ready'
      ? 'postój przy krawędzi pasa – pilot obraca tillerem'
      : g.st === 'drive'
        ? `zawracanie – obrócony o ${fmt(turned, 0)}°`
        : g.st === 'off'
          ? `koło na trawie (${g.hit?.name ?? ''})`
          : 'zawrócony';
  const verdictColor = icao ? '#3ee36b' : fits ? '#facc15' : '#ff6b5b';
  const nd = padMap(lvl, g);
  return (
    <>
      <TaxiPad lvl={lvl} g={g} hint={hint} />
      <CockpitDock>
        <ControlStack>
          <Tiller deg={g.deg} />
          <ThrustLevers pos={[g.v > 0.05 ? 0.12 : 0, g.v > 0.05 ? 0.12 : 0]} size={80} />
        </ControlStack>
        {/* ND: mapa lotniska obraca się z kursem samolotu */}
        <Nd heading={wrapDeg(270 - (g.yaw * 180) / Math.PI)} gs={g.v * 1.944} tas={0} range={0.2} target={`RWY ${RWY.name}`} width={240} map={nd.lines} mapLabels={nd.labels} />
        <Ecam thrMode={null} n1={[21, 21]} egt={[460, 462]} page="WHEEL" wheel={{ brakeT: Array(12).fill(30), tyre: Array(12).fill(212), gear: 'down', parkBrk: false, steer: true }} footer={{ tat: 18, sat: 18, isa: 3, flt: '00:00', time: '05:40:12', gw: 316000, gwcg: 29.4, fob: 132000 }} width={240} />
      </CockpitDock>
      <InfoPortal>
        <div style={{ fontWeight: 700, color: verdictColor }}>
          {lvl.name}, skręt {fmt(Math.abs(til), 0)}° {dir}: {icao ? 'zmieści się z zapasem' : fits ? 'zmieści się, ale bez wymaganego zapasu' : `nie zmieści się – brakuje ${fmt(-res.minM, 1)} m`}
        </div>
        <div style={{ color: g.st === 'off' ? '#ff6b5b' : undefined }}>{phase}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1px 12px', fontSize: 13 }}>
          <span>skręt koła przedniego</span>
          <b>
            {fmt(Math.abs(g.deg), 0)}° {Math.abs(g.deg) > 0.5 ? dir : ''}
          </b>
          <span>tylne osie wózków</span>
          <b>{Math.abs(til) > 15 ? `${fmt((Math.abs(rearOf(til)) * 180) / Math.PI, 1)}° w przeciwną stronę` : 'prosto'}</b>
          <span>ślad koła przedniego</span>
          <b>R = {fmt(tr.nose, 1)} m</b>
          <span>końcówka skrzydła</span>
          <b>R = {fmt(tr.tip, 1)} m</b>
          <span>najmniejszy zapas koła</span>
          <b style={{ color: verdictColor }}>
            {fmt(res.minM, 1)} m · {res.name}
          </b>
        </div>
        <div style={{ fontSize: 13 }}>
          Koła zajmują w poprzek <b>{fmt(span.zMax - span.zMin, 1)} m</b>; z zapasem {fmt(EDGE_CLR, 1)} m od obu krawędzi potrzeba <b>{fmt(span.need, 1)} m</b> nawierzchni.
          {lvl.pad > 0 && til < 0 ? ' Zatoczka jest po lewej – przy skręcie w prawo nic nie daje.' : ''}
        </div>
        <div style={{ opacity: 0.8, fontSize: 12 }}>
          Start zawsze w najlepszym miejscu: po przeciwnej stronie niż skręt, tak żeby zapas był jak największy (przy zatoczce – {fmt(EDGE_CLR, 1)} m od prawej krawędzi). Ślady: <span style={{ color: '#facc15' }}>koło przednie</span>, <span style={{ color: '#e2e8f0' }}>zewnętrzne koła wózków</span>, <span style={{ color: '#f472b6' }}>końcówki skrzydeł</span> (mogą przejść nad trawą). Pomarańczowa linia – granica zapasu {fmt(EDGE_CLR, 1)} m (ICAO). Animacja ok. {TURN_K}× szybsza, geometria przybliżona.
        </div>
      </InfoPortal>
    </>
  );
}

/**
 * Mapa lotniska na ND (jak OANS w A350): pas i zatoczka w układzie samolotu. Punkt odniesienia – kokpit; obraca się
 * razem z kursem.
 */
function padMap(lvl: SteerLevel, g: SteerGame) {
  const NM = 1852;
  const [ax, az] = gameWorld(g, -33, 0);
  const f: [number, number] = [-Math.cos(g.yaw), Math.sin(g.yaw)]; // przód samolotu na płycie (x, z)
  const r: [number, number] = [-Math.sin(g.yaw), -Math.cos(g.yaw)]; // prawa strona
  const ac = (x: number, z: number): [number, number] => {
    const dx = x - ax;
    const dz = z - az;
    return [dx * r[0] + dz * r[1], dx * f[0] + dz * f[1]];
  };
  // pas: punkt (u, v) na płycie – koniec 09L (u = L) w x = PAD_END
  const rw = runwayNdMap(lvl.W, (u, v) => ac(PAD_END + RWY.L - u, v));
  const pad: NdLine[] = [];
  if (lvl.pad > 0) {
    const h = lvl.W / 2;
    const pts = [[PAD_END, h - 1], [PAD_END, h + lvl.pad], [PAD_END + PAD_LEN, h + lvl.pad], [PAD_END + PAD_LEN + PAD_TAPER, h - 1]].map(([x, z]) => {
      const [rr, ff] = ac(x, z);
      return [rr / NM, ff / NM] as [number, number];
    });
    pad.push({ pts, color: '#f2f4f6', width: 1.4, fill: '#3a3f46' });
  }
  return { lines: [...pad, ...rw.lines], labels: rw.labels };
}

/**
 * Pas startowy na płycie (nieruchomy – samolot kołuje po nim): asfalt o wybranej szerokości, zatoczka, linia
 * wymaganego zapasu od krawędzi, ślady kół, przewidywany tor, środek zakrętu i miejsce zjazdu z nawierzchni.
 */
function TaxiPad({ lvl, g, hint }: { lvl: SteerLevel; g: SteerGame; hint: boolean }) {
  const y = PAD_Y + 0.02;
  const poly = useMemo(() => pavement(lvl), [lvl]);
  // granica zapasu – tylko przy końcu pasa (dalej i tak prosto)
  const limit = useMemo(() => insetLine(poly, EDGE_CLR).map(([x, z]) => [Math.min(x, PAD_END + 400), y, z] as V3), [poly, y]);
  const padGeo = useMemo(() => {
    if (lvl.pad <= 0) return null;
    const h = lvl.W / 2;
    const s = new THREE.Shape();
    s.moveTo(PAD_END, -(h - 0.5));
    s.lineTo(PAD_END, -(h + lvl.pad));
    s.lineTo(PAD_END + PAD_LEN, -(h + lvl.pad));
    s.lineTo(PAD_END + PAD_LEN + PAD_TAPER, -(h - 0.5));
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, [lvl]);
  const padEdge = useMemo<V3[] | null>(() => {
    if (lvl.pad <= 0) return null;
    const h = lvl.W / 2;
    // linia krawędzi zatoczki ok. 0,6 m od skraju nawierzchni
    return insetLine([[PAD_END, h + lvl.pad], [PAD_END + PAD_LEN, h + lvl.pad], [PAD_END + PAD_LEN + PAD_TAPER, h]], 0.65).map(([x, z]) => [x, y + 0.01, z] as V3);
  }, [lvl, y]);
  const tr = g.tracks;
  // przewidywany tor (cały zawrót przy skręcie z suwaka) – przed ruszeniem i w czasie jazdy
  const live = g.st === 'ready' || g.st === 'drive';
  const predNose = hint && live ? predictTrack(g, [NOSE_X, 0]) : null;
  const predOut = hint && live ? predictTrack(g, [MLG.x, g.til > 0 ? -MAIN_OUT : MAIN_OUT]) : null;
  const predIn = hint && live ? predictTrack(g, [MLG.x, g.til > 0 ? MAIN_OUT : -MAIN_OUT]) : null;
  // środek zakrętu: na przedłużeniu linii nieskrętnych osi, po stronie skrętu
  const tr0 = turnRadii(g.deg);
  const center = hint && live && tr0 ? gameWorld3(g, TURN_X, Math.sign(g.deg) * tr0.rc) : null;
  return (
    <group>
      {/* ten sam pas co przy lądowaniu (oznakowanie ICAO); samolot zawraca na końcu 09L */}
      <group position={[PAD_END + RWY.L, PAD_Y, 0]}>
        <RunwayModel W={lvl.W} />
      </group>
      {padGeo && (
        <mesh geometry={padGeo} position={[0, PAD_Y - 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <meshStandardMaterial color="#2f3338" roughness={0.95} />
        </mesh>
      )}
      {padEdge && <Line points={padEdge} color="#d9dde2" lineWidth={2} />}
      <Line points={limit} color="#f59e0b" lineWidth={1.4} dashed dashSize={1.5} gapSize={1} />
      {center && (
        <group>
          <mesh position={center} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 0.8, 24]} />
            <meshBasicMaterial color="#e2e8f0" />
          </mesh>
          <Line points={[gameWorld3(g, TURN_X, 0), center]} color="#e2e8f0" lineWidth={1} dashed dashSize={0.6} gapSize={0.5} />
        </group>
      )}
      {predNose && <Line points={predNose} color="#facc15" lineWidth={1.5} dashed dashSize={1.2} gapSize={1} transparent opacity={0.7} />}
      {predOut && <Line points={predOut} color="#e2e8f0" lineWidth={1.5} dashed dashSize={1.2} gapSize={1} transparent opacity={0.6} />}
      {predIn && <Line points={predIn} color="#e2e8f0" lineWidth={1} dashed dashSize={1.2} gapSize={1} transparent opacity={0.35} />}
      {tr.nose.length > 1 && <Line points={tr.nose} color="#facc15" lineWidth={3} />}
      {tr.mainL.length > 1 && <Line points={tr.mainL} color="#e2e8f0" lineWidth={2.5} />}
      {tr.mainR.length > 1 && <Line points={tr.mainR} color="#e2e8f0" lineWidth={2.5} />}
      {tr.tipL.length > 1 && <Line points={tr.tipL} color="#f472b6" lineWidth={2} dashed dashSize={1.2} gapSize={0.8} />}
      {tr.tipR.length > 1 && <Line points={tr.tipR} color="#f472b6" lineWidth={2} dashed dashSize={1.2} gapSize={0.8} />}
      {g.hit && (
        <mesh position={[g.hit.x, y + 0.05, g.hit.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.4, 2.1, 32]} />
          <meshBasicMaterial color="#ff3b30" />
        </mesh>
      )}
    </group>
  );
}

/* ======================= dobieg: pas i dym z opon ======================= */

const RW_Y = -6.13; // poziom płyty (GROUND)
/**
 * Położenie kół głównych na pasie 27R (m od progu) na początku animacji lądowania: samolot przelatuje nad progiem
 * na ok. 15 m, a przyziemia przy znakach punktu celowania (ok. 400 m od progu).
 */
const S_START = -30;
/** Gdzie są teraz koła główne na pasie (m od progu 27R). */
const onRunway = (lv: Live) => S_START + lv.dist;
/** To samo dla innych scen (moduł świateł – PAPI w ramce). */
export const gearRunwayU = (lv: Live) => onRunway(lv);
/**
 * Pas startowy pod lądującym samolotem – wspólny model pasa (oznakowanie ICAO, ten sam co na ND). Samolot stoi
 * w miejscu, a pas przesuwa się pod nim o przebytą drogę i podnosi o wysokość samolotu.
 */
function Runway({ live }: { live: MutableRefObject<Live> }) {
  const grp = useRef<THREE.Group>(null);
  useFrame(() => {
    const lv = live.current;
    if (grp.current) grp.current.position.set(MLG.x + onRunway(lv), RW_Y - lv.lift, 0);
  });
  return (
    <group ref={grp}>
      {/* PAPI widzi pilot: kąt z wysokości nad pasem (koła + ok. 2 m) i odległości do lamp */}
      <RunwayModel W={45} eye={() => [onRunway(live.current), live.current.h + 2]} />
    </group>
  );
}

/** ND przy lądowaniu: ten sam pas jako symbol na ND (kurs 270°, punkt odniesienia – kokpit ok. 34 m przed kołami głównymi). */
function LandingNd({ lv }: { lv: Live }) {
  const s0 = onRunway(lv);
  // jak w prawdziwym ND: symbol pasa (biały obrys) z przedłużoną osią; zasięg 2 NM przy podejściu, 1 NM na dobiegu
  const range = lv.u < 0 ? 2 : 1;
  // obrys nie węższy niż ok. 4 px ekranu ND (łuk zasięgu ma 230 px)
  const minHalf = (4 * range * 1852) / 230;
  const map = runwayNdSymbol(45, (u, v) => [-v, u - s0 - 34.3], minHalf);
  return <Nd heading={RWY.hdg} gs={lv.v * 1.944} tas={lv.v * 1.944} range={range} target={`RWY ${RWY.name}`} map={map.lines} mapLabels={map.labels} />;
}
// w doku kokpitu to ekran ND (miejsce wyświetlaczy)
(LandingNd as unknown as { cockpitSlot: string }).cockpitSlot = 'nd';

/** Miękki, szary kłąb dymu (tekstura wspólna dla wszystkich obłoków). */
let smokeTex: THREE.CanvasTexture | null = null;
function getSmokeTex() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(230,234,238,0.95)');
  g.addColorStop(0.55, 'rgba(205,212,220,0.5)');
  g.addColorStop(1, 'rgba(190,195,200,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}
/** Punkty styku kół głównych z pasem (oba wózki, trzy osie, po dwa koła). */
const CONTACTS: V3[] = [1, -1].flatMap((sz) => [-1.5, 0, 1.5].flatMap((dx) => [0.63, -0.63].map((dz) => [MLG.x + dx, RW_Y + 0.25, sz * (MLG.z + dz)] as V3)));
/**
 * Dym z opon: duży kłąb przy przyziemieniu (koła rozkręcają się od zera w ułamku sekundy) i słabszy przy mocnym
 * hamowaniu. Obłoki zostają w tyle za samolotem (z prędkością pasa), unoszą się i rozpływają.
 */
function TyreSmoke({ live }: { live: MutableRefObject<Live> }) {
  const N = 220;
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const st = useMemo(() => Array.from({ length: N }, () => ({ age: 99, life: 2, x: 0, y: 0, z: 0, vz: 0, s0: 0.6, burst: false })), []);
  const acc = useRef(0);
  const next = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const lv = live.current;
    // koła, które przed chwilą dotknęły pasa (każde w swojej chwili) – z nich bucha dym
    const fresh = lv.landing && lv.v > 10 ? CONTACTS.map((_, k) => k).filter((k) => lv.wTouch[k] >= 0 && lv.u - lv.wTouch[k] < 0.5) : [];
    const touch = fresh.length > 0;
    // ile obłoków na sekundę: przyziemienie – dużo z każdego rozkręcanego koła, hamowanie – zależnie od siły (prawie nic przy LO)
    const rate = touch ? 30 * fresh.length : lv.landing && lv.u > 0 && lv.v > 4 ? Math.max(0, 22 * (lv.a - 1.6)) : 0;
    acc.current += rate * dt;
    while (acc.current >= 1) {
      acc.current -= 1;
      const p = st[next.current];
      next.current = (next.current + 1) % N;
      const c = CONTACTS[touch ? fresh[Math.floor(Math.random() * fresh.length)] : Math.floor(Math.random() * CONTACTS.length)];
      p.age = 0;
      p.life = touch ? 3.6 : 1.8;
      p.burst = touch;
      p.s0 = touch ? 1.3 : 0.7;
      p.x = c[0] + (Math.random() - 0.5) * 0.6;
      p.y = c[1];
      p.z = c[2] + (Math.random() - 0.5) * 0.7;
      // dym rozlewa się na boki przy samym pasie
      p.vz = (Math.random() - 0.5) * (touch ? 1.6 : 0.8);
    }
    st.forEach((p, i) => {
      const s = sprites.current[i];
      if (!s) return;
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) {
        s.visible = false;
        return;
      }
      // obłok zostaje w miejscu nad pasem, więc względem samolotu odpływa do tyłu (+x) z jego prędkością
      p.x += lv.v * 0.9 * dt;
      // gęsty dym trzyma się nisko nad pasem i powoli się unosi
      p.y += (p.burst ? 0.22 : 0.35) * dt;
      p.z += p.vz * dt;
      s.visible = true;
      s.position.set(p.x, p.y, p.z);
      const size = p.s0 + (p.burst ? 6.5 : 3.2) * Math.sqrt(u);
      s.scale.set(size, size, 1);
      (s.material as THREE.SpriteMaterial).opacity = (p.burst ? 0.85 : 0.5) * (1 - u) ** 1.3 * Math.min(1, u * 10);
    });
  });
  const grp = useRef<THREE.Group>(null);
  useFrame(() => {
    if (grp.current) grp.current.position.y = -live.current.lift;
  });
  return (
    <group ref={grp}>
      {st.map((_, i) => (
        <sprite key={i} ref={(s) => (sprites.current[i] = s)} visible={false} raycast={() => null}>
          <spriteMaterial map={getSmokeTex()} transparent depthWrite={false} opacity={0} color="#b7c2cc" />
        </sprite>
      ))}
    </group>
  );
}

/** Okręgi zakrętu na płycie: ślad koła przedniego i końcówki skrzydła (od strony zewnętrznej). */

/* ======================= zakładki modułu ======================= */

/** Numery zakładek na modelu: każdy przy tej części podwozia, której dotyczy zakładka (współrzędne samolotu). */
export const GEAR_SPOTS: V3[] = [
  [MLG.x, -1.2, MLG.z + 2.2], // strona główna (bez numeru)
  [MLG.x + 0.6, -3.5, MLG.z + 0.7], // amortyzator – goleń główna
  [MLG.x - 0.4, -2.2, MLG.z - 2.2], // chowanie – wnęka w owiewce
  [MLG.x - 1.5, -5.2, MLG.z + 1.2], // hamulce – koła wózka
  [NOSE_X - 0.4, -4.4, 0.8], // sterowanie – koło przednie
];

export function makeGearSteps(plane: (s: Omit<Step, 'kind' | 'scene' | 'stageKey'>) => Step): Step[] {
  return [
    plane({
      title: 'Amortyzator',
      spot: GEAR_SPOTS[1],
      // nisko z tyłu i z boku, poniżej wysuniętych klap: lewa goleń główna z amortyzatorem na środku kadru,
      // silnik (z przodu) nie wchodzi między kamerę a goleń
      camera: [10.5, -4.9, 13.5],
      target: [1.3, -4.3, 4.75],
      preset: { focus: 'gear', gear: 'shock' },
      controls: [
        { type: 'toggle', key: 'land', label: 'Lądowanie (animacja)', default: true },
        { type: 'slider', key: 'load', label: 'Obciążenie goleni', min: 0, max: 200, step: 5, default: 100, unit: '%' },
      ],
      body: (
        <>
          <p>
            W każdej goleni jest <b>amortyzator</b>: cylinder wypełniony sprężonym azotem i olejem. Gdy goleń przyjmuje ciężar, błyszczące <b>tłoczysko</b> wsuwa się w cylinder, gaz się ściska i odpycha coraz mocniej – działa jak sprężyna.
          </p>
          <p>
            Olej przeciska się przy tym przez małe otwory i stawia opór – zamienia energię uderzenia w ciepło. Dzięki temu samolot po przyziemieniu nie podskakuje, tylko łagodnie siada. <b>Nożyce</b> z przodu goleni pozwalają tłoczysku wsuwać się i wysuwać, ale nie obracać.
          </p>
          <p>
            Animacja pokazuje całe lądowanie. Samolot zniża się po pochylonej ścieżce z prędkością ok. 260 km/h. Ok. 9 m nad pasem pilot lekko podnosi nos (to <b>wyrównanie</b>), opadanie zwalnia do niecałego metra na sekundę i koła główne dotykają pasa. Zaraz potem podnoszą się spojlery, otwierają się odwracacze ciągu, a pilot łagodnie opuszcza nos, aż przednie koło dotknie pasa. To ten sam przebieg co w zakładce o hamulcach. Na ekranie lotu w rogu widać pochylenie, prędkość i wysokość nad pasem.
          </p>
          <p>Po wyłączeniu animacji suwak zmienia obciążenie: 0% – koła ledwo dotykają pasa (np. tuż przed oderwaniem), 100% – postój, 200% – twarde lądowanie.</p>
        </>
      ),
    }),
    plane({
      title: 'Chowanie i wypuszczanie',
      spot: GEAR_SPOTS[2],
      camera: [14, -11, 19],
      target: [-6, -3.4, 1.5],
      preset: { focus: 'gear', gear: 'retract' },
      controls: [{ type: 'button', key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false }],
      body: (
        <>
          <p>
            Naciśnij „Rozpocznij”. Po starcie pilot przestawia dźwignię podwozia na <b>UP</b> (w górę), a po schowaniu – dla pokazu – z powrotem na <b>DOWN</b> (w dół). Najpierw otwierają się drzwi wnęk. Potem siłowniki hydrauliczne składają boczne <b>ramiona</b> i obracają goleń: <b>główne</b> chowają się w bok, do wnęk w brzuchu samolotu, a <b>przednia</b> – do przodu, pod kokpit. Na końcu drzwi się zamykają, a zamki trzymają podwozie w schowanym położeniu.
          </p>
          <p>
            Przy chowaniu wózek z kołami pochyla się tak, żeby sześć kół zmieściło się we wnęce. Całość trwa kilkanaście sekund. Gdyby zawiodła hydraulika, podwozie można <b>wypuścić grawitacyjnie</b>: zamki się zwalnia, a goleń opada pod własnym ciężarem, popychana pędem powietrza.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Hamulce i autobrake',
      spot: GEAR_SPOTS[3],
      // z boku, nisko: wózek, pas przesuwający się pod samolotem i dym zostający za kołami
      camera: [-12, -3.6, 25],
      target: [-1.5, -5.0, 3],
      preset: { focus: 'gear', gear: 'brakes' },
      controls: [
        {
          type: 'select',
          key: 'ab',
          label: 'Autobrake',
          default: '3',
          options: AUTOBRAKE_LIST.map((x) => ({ value: x.id, label: x.name })),
        },
        { type: 'toggle', key: 'run', label: 'Lądowanie i dobieg (animacja)', default: true },
      ],
      body: (
        <>
          <p>
            Hamują tylko koła <b>główne</b> – wszystkie dwanaście. W każdym jest zestaw tarcz z <b>kompozytu węglowego</b>: lekkiego i odpornego na bardzo wysoką temperaturę. Hamowanie zamienia energię pędzącego samolotu w ciepło – tarcze nagrzewają się do kilkuset stopni i potem długo stygną.
          </p>
          <p>
            Przed lądowaniem pilot wybiera siłę <b>automatycznego hamowania</b> (autobrake): po przyziemieniu samolot sam hamuje równo, z wybraną siłą. A350 potrafi też hamować tak, żeby zatrzymać się akurat przy wybranym zjeździe z pasa (system BTV). Osobny układ pilnuje, żeby żadne koło się nie zablokowało – jak ABS w samochodzie.
          </p>
          <p>
            Animacja zaczyna się na podejściu – przyziemienie następuje w tej samej chwili co w zakładce o amortyzatorze. Hamulce ruszają razem ze spojlerami, ok. sekundę po przyziemieniu, a hamowanie narasta płynnie. Patrz na ekran kół (WHEEL): temperatury hamulców rosną, a tarcze w kołach zaczynają się żarzyć.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Sterowanie na ziemi',
      spot: GEAR_SPOTS[4],
      // wysoko z góry, z przodu po prawej: cały koniec pasa z zatoczką, samolot na starcie i ślady kół
      camera: [-76, 168, -58],
      target: [-4, -6, 6],
      preset: { focus: 'gear', gear: 'steer' },
      controls: [
        { type: 'slider', key: 'tiller', label: 'Skręt koła przedniego (tiller): ← prawo · lewo →', min: -70, max: 70, step: 1, default: 70, unit: '°' },
        {
          type: 'select',
          key: 'lvl',
          label: 'Pas',
          default: '60',
          options: STEER_LEVELS.map((l) => ({ value: l.id, label: l.name })),
        },
        { type: 'toggle', key: 'hint', label: 'Przewidywany tor', default: true },
      ],
      body: (
        <>
          <p>
            Na ziemi samolot skręca <b>przednim kołem</b>. Pilot obraca małą kierownicą z boku fotela – przednie koło skręca nawet o ok. 70°. Przy większej prędkości, np. na pasie startowym, wystarczają pedały, które skręcają koło tylko o kilka stopni.
          </p>
          <p>
            W A350-1000 w ciasnych zakrętach skręcają też <b>tylne osie podwozia głównego</b> – w przeciwną stronę. Opony mniej się wtedy ścierają, a koła nie szorują bokiem po nawierzchni.
          </p>
          <p>
            Samolot nie umie jechać do tyłu. Zawracając, obraca się wokół punktu leżącego na przedłużeniu nieskręcających osi podwozia głównego – nawet przy pełnym skręcie przednie koło zatacza łuk o promieniu ok. 33 m. Dlatego pilot najpierw podjeżdża pod przeciwną krawędź pasa, a dopiero potem skręca kierownicę do oporu.
          </p>
          <p>
            Ustaw suwakiem skręt koła (w lewo albo w prawo) i wybierz pas – od razu zobaczysz, czy samolot się zmieści, a animacja pokaże cały zawrót. Suwak działa też w czasie jazdy: samolot jedzie dalej, a przednie koło skręca na nowy kąt – możesz trochę pokołować. Przerywane linie to przewidywany tor kół, a pomarańczowa – wymagany przepisami zapas 4,5 m od krawędzi. Jeśli któreś koło zjedzie na trawę, samolot staje, a miejsce zaznacza czerwone kółko.
          </p>
          <p>A350-1000 potrzebuje do zawrócenia ok. 60 m nawierzchni. Na pasie szerokości 45 m musi więc użyć specjalnego poszerzenia – <b>zatoczki do zawracania</b> na końcu pasa.</p>
        </>
      ),
    }),
  ];
}
