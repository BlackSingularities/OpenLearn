/*
 * Moduł podwozia A350-1000: sterowanie ruchem podwozia w zakładkach (amortyzator, chowanie, hamowanie, skręt),
 * ramki informacji, wyświetlacze kokpitu i okręgi zakrętu. Ten sam samolot co w przeglądzie – podwozie jest
 * sterowane wspólnym stanem GearDrive (bez przerysowywania sceny co klatkę).
 */
import { useMemo, useRef, useState, type MutableRefObject } from 'react';
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
 * Zawracanie o 180° na pasie (w lewo): koło przednie skręca o kąt z tillera, samolot obraca się wokół środka zakrętu
 * leżącego na linii wózków głównych. Fazy: 0 – postój na początku, 1 – pilot skręca tillerem, 2 – zawracanie,
 * 3 – koło wraca prosto i samolot stoi (potem od nowa).
 */
type TurnState = { ph: number; tp: number; yaw: number; cz: number; acc: number; tracks: { nose: V3[]; mainL: V3[]; mainR: V3[]; tip: V3[] } };
const newTurn = (): TurnState => ({ ph: 0, tp: 0, yaw: 0, cz: 0, acc: 0, tracks: { nose: [], mainL: [], mainR: [], tip: [] } });
/** Kurs 0–359°. */
const wrapDeg = (d: number) => ((d % 360) + 360) % 360;
/** Prędkość koła przedniego w zakręcie (m/s, ok. 5 kt) i przyspieszenie czasu animacji. */
const TURN_V = 2.6;
const TURN_K = 3;
/** Zewnętrzne koło wózka (z, m), połowa szerokości opony i wymagany zapas od krawędzi nawierzchni (ICAO, kod E). */
const MAIN_OUT = MLG.z + 0.63;
const TYRE_HALF = 0.25;
const EDGE_CLR = 4.5;
/** Punkty samolotu, których ślad rysujemy: koło przednie, zewnętrzne koła obu wózków i końcówka prawego skrzydła. */
const TRACK_PTS: Record<'nose' | 'mainL' | 'mainR' | 'tip', [number, number]> = { nose: [NOSE_X, 0], mainL: [MLG.x, MAIN_OUT], mainR: [MLG.x, -MAIN_OUT], tip: [TIP[0], -TIP[2]] };
/** Poziom płyty (jak RW_Y niżej – tu potrzebny wcześniej). */
const PAD_Y = -6.13;
/** Punkt samolotu (x, z) po obrocie o odchylenie yaw (rad) wokół środka zakrętu (TURN_X, cz) – na płycie. */
const turnWorld = (x: number, z: number, cz: number, yaw: number): V3 => {
  const dx = x - TURN_X;
  const dz = z - cz;
  return [TURN_X + dx * Math.cos(yaw) + dz * Math.sin(yaw), PAD_Y + 0.03, cz - dx * Math.sin(yaw) + dz * Math.cos(yaw)];
};
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
  /** Zawracanie na pasie: faza, czas w fazie (s), odchylenie samolotu, środek zakrętu (z, m) i ślady kół. */
  turn: TurnState;
};
const DEG = Math.PI / 180;
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
export function useGearDriver(mode: GearMode | null, params: Params, direct?: DirectPose) {
  const drive = useMemo(newGearDrive, []);
  const live = useRef<Live>({ L: 1, s: GEAR_STROKE, p: 0, v: 0, dist: 0, temp: Array(12).fill(30), r: 0, t: 0, a: 0, stop: 0, n1: 21, rev: 0, deg: 0, u: 0, h: 0, sink: 0, pitch: 0, lift: 0, landing: false, spinV: 0, noseV: 0, wV: Array(12).fill(0), wTouch: Array(12).fill(-1), spl: 0, bank: 0, turn: newTurn() });
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
      Object.assign(direct, { pivot: RW_PIVOT, lift: 0, bank: 0, yaw: 0, alpha: landing ? lv.pitch : 0 });
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
        // po wysunięciu spojlerów środek siły nośnej przesuwa się i nos lekko się podrywa (ok. 0,4°), zanim pilot
        // zacznie go opuszczać
        const bump = u > LANDING.spoilerAt ? 0.4 * Math.sin(Math.min(1, (u - LANDING.spoilerAt) / 1.2) * Math.PI) : 0;
        pitch = g.pitch + bump * (1 - g.nose);
        noseK = g.nose;
        lv.h = 0;
        lv.sink = 0;
        // opóźnienie: opór powietrza (maleje z prędkością) i odwracacze, a od włączenia autobrake – zadane opóźnienie
        const aAero = LANDING.aAero * (0.4 + 0.6 * (lv.v / V_TD) ** 2);
        const a = lv.v <= 0 ? 0 : aAero + (Math.max(aAero, ab.a) - aAero) * g.brake;
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
        // spojlery naziemne do ok. 50°, chowane przy prędkości kołowania; odwracacze: pełny ciąg wsteczny do ok. 70 kt,
        // potem bieg jałowy, zamknięte przy prędkości kołowania
        splT = g.spoiler && lv.v > 8 ? 0.87 : 0;
        revT = g.rev && lv.v > 8 ? 1 : 0;
        n1T = revT && lv.v > 36 ? 70 : LANDING.n1Idle;
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
      surf.spoiler += Math.sign(splT - surf.spoiler) * Math.min(Math.abs(splT - surf.spoiler), dt * 1.4);
      lv.spl = surf.spoiler;
      lv.rev += Math.sign(revT - lv.rev) * Math.min(Math.abs(revT - lv.rev), dt * 0.9);
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
    drive.lights = false;
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
      // ok. 9 s na pełne schowanie albo wypuszczenie, jak w samolocie
      const target = params.up ? 1 : 0;
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
      // zawracanie o 180° na pasie, w kółko: tiller → zakręt wokół środka na linii wózków → koło prosto → od nowa
      const tiller = Math.max(20, Math.min(70, Number(params.tiller ?? 70)));
      const T = lv.turn ?? (lv.turn = newTurn());
      const ds = dt * TURN_K;
      T.tp += ds;
      let deg = lv.deg;
      if (T.ph === 0) {
        deg += (0 - deg) * Math.min(1, ds * 3);
        T.yaw = 0;
        T.cz = turnRadii(tiller)!.rc;
        if (T.tp > 2) Object.assign(T, { ph: 1, tp: 0, tracks: { nose: [], mainL: [], mainR: [], tip: [] } });
      } else if (T.ph === 1) {
        // tiller: koło przednie skręca ok. 20°/s
        deg = Math.min(tiller, deg + 20 * ds);
        if (deg >= tiller) Object.assign(T, { ph: 2, tp: 0 });
      } else if (T.ph === 2) {
        deg = tiller;
        const tr = turnRadii(deg)!;
        const w = TURN_V / tr.nose;
        T.yaw = Math.min(Math.PI, T.yaw + w * ds);
        drive.spin += w * tr.rc * ds;
        drive.noseSpin = (drive.noseSpin ?? 0) + TURN_V * ds;
        T.acc += ds;
        if (T.acc > 0.25 || T.yaw >= Math.PI) {
          T.acc = 0;
          (Object.keys(TRACK_PTS) as (keyof typeof TRACK_PTS)[]).forEach((k) => T.tracks[k].push(turnWorld(TRACK_PTS[k][0], TRACK_PTS[k][1], T.cz, T.yaw)));
        }
        if (T.yaw >= Math.PI) Object.assign(T, { ph: 3, tp: 0 });
      } else {
        deg += (0 - deg) * Math.min(1, ds * 1.5);
        if (T.tp > 7) Object.assign(T, { ph: 0, tp: 0, yaw: 0 });
      }
      lv.deg = deg;
      steer = (deg * Math.PI) / 180;
      rear = rearOf(deg);
      if (direct) {
        Object.assign(direct, { pivot: [TURN_X, PAD_Y, T.cz] as V3, lift: 0, bank: 0, yaw: (T.yaw * 180) / Math.PI, alpha: 0 });
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

export function GearLab({ mode, params, live, pose }: { mode: GearMode; params: Params; live: MutableRefObject<Live>; pose?: PoseState }) {
  useTicker();
  const sp = useSpeed();
  const lv = live.current;
  const temps = lv.temp.map((T) => Math.round(T));
  const wheel = (gear: 'down' | 'transit' | 'up') => ({ brakeT: temps, tyre: Array(12).fill(mode === 'retract' ? 205 : 212), gear, parkBrk: mode === 'steer' ? false : undefined });
  // lądowanie: PFD (pochylenie, prędkość, wysokość nad pasem, opadanie, tryby FMA) i strona WHEEL
  const abId = String(params.ab ?? '3');
  const ab = AUTOBRAKE[abId] ?? AUTOBRAKE['3'];
  const phase = landingPhase(lv.t, lv.v);
  const fma: [string, string, string, string, string] =
    lv.u < 0 ? (lv.t < LANDING.tFlare ? ['SPEED', 'LAND', '', '', '1FD2\nA/THR'] : ['RETARD', 'FLARE', '', '', '1FD2\nA/THR']) : ['', 'ROLL OUT', '', '', '1FD2'];
  /*
   * Kontrolki pulpitu przy lądowaniu – przestawiają się same, zgodnie z przebiegiem: dźwignie ciągu w CL (autothrottle)
   * aż do „RETARD” (bieg jałowy), po przyziemieniu w zakres odwracacza (MAX REV, poniżej ok. 70 kt – IDLE REV), po
   * schowaniu odwracaczy znowu IDLE; hamulce aerodynamiczne uzbrojone (ARMED) – spojlery wysuwają się same; autobrake
   * z wybranym ustawieniem, DECEL po osiągnięciu zadanego opóźnienia; podwozie wypuszczone.
   */
  const thrPos = !lv.landing ? 0 : lv.u < 0 && lv.t < LANDING.tTD - 2.2 ? 1 : lv.rev > 0.02 ? -lv.rev * (lv.v > 36 ? 1 : 0.35) : 0;
  const controls = (
    <ControlStack>
      <div style={{ display: 'flex', gap: 6 }}>
        <ThrustLevers pos={[thrPos, thrPos]} athr={lv.landing && lv.u < 0 && lv.t < LANDING.tTD - 2.2} size={96} />
        <SpeedBrakeLever pos={0} armed={!(lv.landing && lv.u > 0 && lv.v <= 8)} deployed={lv.spl / 0.87} size={96} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <AutoBrakeKnob sel={(ab.name === 'LO' ? 'LO' : ab.name) as '2' | '3' | 'HI' | 'LO'} active={lv.landing && lv.u > LANDING.brakeAt && lv.v > 0.5} decel={lv.landing && lv.u > 0 && lv.v > 0.5 && lv.a >= 0.8 * ab.a} />
        <GearLever lever="down" state="down" size={82} />
      </div>
    </ControlStack>
  );
  const landingDock = lv.landing ? (
    <CockpitDock>
      {controls}
      <Pfd pitch={lv.pitch} bank={-lv.bank} ias={lv.v * 1.944} iasTarget={LANDING.vApp * 1.944} alt={lv.h * 3.281} ra={lv.h * 3.281} vs={-lv.sink * 196.85} heading={0} track={0} baro={1013} fd={null} fma={fma} width={260} />
      <Ecam thrMode={null} n1={[lv.n1, lv.n1]} rev={[lv.rev, lv.rev]} egt={[420 + 3.2 * lv.n1, 424 + 3.2 * lv.n1]} page="WHEEL" wheel={wheel('down')} memo={[[`AUTO BRK ${ab.name}`, '#3ee36b'], ...(lv.u > LANDING.spoilerAt ? ([['GND SPLRS', '#3ee36b']] as [string, string][]) : [])]} footer={{ tat: 18, sat: 18, isa: 3, flt: '07:11', time: '20:33:34', gw: MASS, gwcg: 28.5, fob: 9800 }} width={260} />
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
        {pose && <LandingFlow live={live} pose={pose} />}
        <CockpitDock>
          {controls}
          <Pfd pitch={lv.pitch} bank={-lv.bank} ias={lv.v * 1.944} iasTarget={LANDING.vApp * 1.944} alt={lv.h * 3.281} ra={lv.h * 3.281} vs={-lv.sink * 196.85} heading={0} track={0} baro={1013} fd={null} fma={fma} width={260} />
          <Ecam
            thrMode={null}
            n1={[lv.n1, lv.n1]}
            rev={[lv.rev, lv.rev]}
            egt={[420 + 3.2 * lv.n1, 424 + 3.2 * lv.n1]}
            memo={lv.u > LANDING.spoilerAt ? [['GND SPLRS', '#3ee36b']] : []}
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
    return (
      <>
        <CockpitDock>
          <ControlStack>
            <GearLever lever={params.up ? 'up' : 'down'} state={gear} />
            <ThrustLevers pos={[1, 1]} athr size={96} />
          </ControlStack>
          <Ecam thrMode={['CLB', 92]} n1={[88, 88]} egt={[742, 745]} page="WHEEL" wheel={wheel(gear)} footer={{ tat: 12, sat: 8, isa: 3, flt: '00:01', time: '14:22:05', gw: 310000, gwcg: 29.1, fob: 98000 }} width={260} />
        </CockpitDock>
        <InfoPortal>
          <div style={{ fontWeight: 700 }}>
            Podwozie: {gear === 'down' ? 'wypuszczone i zablokowane' : gear === 'up' ? 'schowane i zablokowane' : 'w ruchu'}
          </div>
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
  // sterowanie: zawracanie na pasie – ślady kół, pas o wybranej szerokości i wymagany zapas od krawędzi
  const deg = lv.deg;
  const tiller = Math.max(20, Math.min(70, Number(params.tiller ?? 70)));
  const span = uTurnSpan(tiller);
  const rwW = Number(params.rw ?? 45);
  const right = span.zMin - EDGE_CLR;
  const left = right + rwW;
  const margin = left - span.zMax;
  const fits = margin >= EDGE_CLR;
  const T = lv.turn ?? (lv.turn = newTurn());
  const turnPhase = T.ph === 0 ? 'postój przy krawędzi pasa – koło przednie prosto' : T.ph === 1 ? 'pilot obraca tillerem – koło przednie skręca' : T.ph === 2 ? `zawracanie – obrócony o ${fmt((T.yaw * 180) / Math.PI, 0)}°` : 'po zawróceniu – koło wraca prosto';
  return (
    <>
      <TurnPad right={right} left={left} limit={left - EDGE_CLR} fits={fits} turn={T} cz={T.cz} showCenter={T.ph > 0} />
      <CockpitDock>
        <ControlStack>
          <Tiller deg={deg} />
          <ThrustLevers pos={[T.ph === 2 ? 0.12 : 0, T.ph === 2 ? 0.12 : 0]} size={80} />
        </ControlStack>
        {/* ND: kurs obraca się w czasie zawracania, zielony łuk – przewidywany tor przy obecnym skręcie koła (w lewo) */}
        <Nd heading={wrapDeg(270 - (T.yaw * 180) / Math.PI)} gs={T.ph === 2 ? TURN_V * 1.944 : 0} tas={0} turnRadiusNm={Math.abs(deg) > 1 ? -(turnRadii(deg)?.rc ?? 0) / 1852 : 0} range={0.1} target="RWY 27R" width={240} />
        <Ecam thrMode={null} n1={[21, 21]} egt={[460, 462]} page="WHEEL" wheel={{ ...wheel('down'), steer: true }} footer={{ tat: 18, sat: 18, isa: 3, flt: '00:00', time: '05:40:12', gw: 316000, gwcg: 29.4, fob: 132000 }} width={240} />
      </CockpitDock>
      <InfoPortal>
        <div style={{ fontWeight: 700 }}>{turnPhase}</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1px 12px', fontSize: 13 }}>
            <span>skręt koła przedniego</span>
            <b>{fmt(Math.abs(deg), 0)}°</b>
            <span>tylne osie wózków</span>
            <b>{Math.abs(deg) > 15 ? `${fmt((Math.abs(rearOf(deg)) * 180) / Math.PI, 1)}° w przeciwną stronę` : 'prosto'}</b>
            <span>środek zakrętu</span>
            <b>{fmt(span.rc, 1)} m od osi kadłuba</b>
            <span>ślad koła przedniego</span>
            <b>R = {fmt(span.nose, 1)} m</b>
            <span>końcówka skrzydła</span>
            <b>R = {fmt(span.tip, 1)} m</b>
          </div>
        </div>
        <div style={{ fontSize: 13 }}>
          Koła zajmują w poprzek pasa <b>{fmt(span.zMax - span.zMin, 1)} m</b>; z zapasem {fmt(EDGE_CLR, 1)} m od obu krawędzi potrzeba <b>{fmt(span.need, 1)} m</b>. Pas {rwW} m:{' '}
          <b style={{ color: fits ? '#3ee36b' : '#ff6b5b' }}>{fits ? `wystarczy (zapas po lewej ${fmt(margin, 1)} m)` : `za wąski – brakuje ${fmt(EDGE_CLR - margin, 1)} m zapasu`}</b>
        </div>
        <div style={{ opacity: 0.8, fontSize: 12 }}>
          Ślady: <span style={{ color: '#facc15' }}>koło przednie</span>, <span style={{ color: '#e2e8f0' }}>zewnętrzne koła wózków</span>, <span style={{ color: '#f472b6' }}>końcówka prawego skrzydła</span> (może wystawać poza pas). Przerywana linia – granica zapasu {fmt(EDGE_CLR, 1)} m od lewej krawędzi. Animacja ok. {TURN_K}× szybsza, geometria przybliżona.
        </div>
      </InfoPortal>
    </>
  );
}

/**
 * Pas startowy na płycie (nieruchomy – samolot obraca się nad nim): asfalt o wybranej szerokości, krawędzie, oś,
 * linia wymaganego zapasu od lewej krawędzi, środek zakrętu i ślady kół zapisane w czasie zawracania.
 */
function TurnPad({ right, left, limit, fits, turn, cz, showCenter }: { right: number; left: number; limit: number; fits: boolean; turn: TurnState; cz: number; showCenter: boolean }) {
  const y = PAD_Y + 0.01;
  // pas ciągnie się za samolotem; koniec pasa – kawałek przed nosem (zawraca się na samym końcu)
  const x0 = -52;
  const x1 = 170;
  const mid = (left + right) / 2;
  const tr = turn.tracks;
  const dashes = useMemo(() => Array.from({ length: 7 }, (_, i) => x0 + 12 + i * 30), [x0]);
  return (
    <group>
      <mesh position={[(x0 + x1) / 2, y - 0.02, mid]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[x1 - x0, left - right]} />
        <meshStandardMaterial color="#2c3036" roughness={0.95} />
      </mesh>
      {[right + 0.5, left - 0.5].map((z) => (
        <Line key={z} points={[[x0, y, z], [x1, y, z]]} color="#f2f4f6" lineWidth={2.5} />
      ))}
      {/* koniec pasa przed nosem samolotu */}
      <Line points={[[x0, y, right], [x0, y, left]]} color="#f2f4f6" lineWidth={2.5} />
      {dashes.map((x) => (
        <Line key={x} points={[[x, y, mid], [x + 18, y, mid]]} color="#e5e7eb" lineWidth={1.6} />
      ))}
      <Line points={[[x0, y, limit], [x1, y, limit]]} color={fits ? '#22c55e' : '#f59e0b'} lineWidth={1.4} dashed dashSize={1.5} gapSize={1} />
      {showCenter && (
        <group>
          <mesh position={[TURN_X, y + 0.02, cz]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 0.8, 24]} />
            <meshBasicMaterial color="#e2e8f0" />
          </mesh>
          <Line points={[[TURN_X, y, 0], [TURN_X, y, cz]]} color="#e2e8f0" lineWidth={1} dashed dashSize={0.6} gapSize={0.5} />
        </group>
      )}
      {tr.nose.length > 1 && <Line points={tr.nose} color="#facc15" lineWidth={3} />}
      {tr.mainL.length > 1 && <Line points={tr.mainL} color="#e2e8f0" lineWidth={2.5} />}
      {tr.mainR.length > 1 && <Line points={tr.mainR} color="#e2e8f0" lineWidth={2.5} />}
      {tr.tip.length > 1 && <Line points={tr.tip} color="#f472b6" lineWidth={2} dashed dashSize={1.2} gapSize={0.8} />}
    </group>
  );
}

/* ======================= dobieg: pas i dym z opon ======================= */

const RW_Y = -6.13; // poziom płyty (GROUND)
const RW_L = 700; // długość pokazanego odcinka pasa (m)
/**
 * Pas startowy pod samolotem: szary asfalt, ciągłe krawędzie, przerywana oś (30 m kreski co 50 m) i światła
 * krawędziowe co 60 m. Kreski i światła przesuwają się do tyłu z prędkością samolotu – widać, jak zwalnia i staje.
 */
function Runway({ live }: { live: MutableRefObject<Live> }) {
  const grp = useRef<THREE.Group>(null);
  const dash = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const N_D = Math.ceil(RW_L / 50);
  const N_L = Math.ceil(RW_L / 60);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const d = live.current.dist;
    if (grp.current) grp.current.position.y = -live.current.lift;
    if (dash.current) {
      for (let i = 0; i < N_D; i++) {
        o.position.set(-RW_L / 2 + ((i * 50 + d) % RW_L), RW_Y + 0.004, 0);
        o.scale.set(30, 1, 0.9);
        o.updateMatrix();
        dash.current.setMatrixAt(i, o.matrix);
      }
      dash.current.instanceMatrix.needsUpdate = true;
    }
    if (lights.current) {
      for (let i = 0; i < N_L * 2; i++) {
        const k = i % N_L;
        o.position.set(-RW_L / 2 + ((k * 60 + d) % RW_L), RW_Y + 0.25, i < N_L ? 23 : -23);
        o.scale.set(0.18, 0.5, 0.18);
        o.updateMatrix();
        lights.current.setMatrixAt(i, o.matrix);
      }
      lights.current.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group ref={grp}>
      <mesh position={[0, RW_Y - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[RW_L, 45]} />
        <meshStandardMaterial color="#2b2e33" roughness={0.95} />
      </mesh>
      {[21.5, -21.5].map((z) => (
        <mesh key={z} position={[0, RW_Y - 0.01, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[RW_L, 0.9]} />
          <meshBasicMaterial color="#d9dde2" />
        </mesh>
      ))}
      <instancedMesh ref={dash} args={[undefined, undefined, N_D]} raycast={() => null} frustumCulled={false}>
        <boxGeometry args={[1, 0.01, 1]} />
        <meshBasicMaterial color="#e5e7eb" />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, undefined, N_L * 2]} raycast={() => null} frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
        <meshBasicMaterial color="#fff3c4" />
      </instancedMesh>
    </group>
  );
}

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
      camera: [9, 3, 12], // TMPCAM
      target: [1.5, -1.5, 4], // TMPTGT
      preset: { focus: 'gear', gear: 'shock' },
      controls: [
        { type: 'toggle', key: 'land', label: 'Lądowanie (animacja)', default: true },
        { type: 'slider', key: 'load', label: 'Obciążenie goleni', min: 0, max: 200, step: 5, default: 100, unit: '%' },
      ],
      body: (
        <>
          <p>
            Każda goleń ma <b>amortyzator olejowo-gazowy</b>: w cylindrze jest azot pod ciśnieniem i olej. Przy obciążeniu chromowane <b>tłoczysko</b> wsuwa się w cylinder, gaz się spręża i odpycha coraz mocniej – działa jak sprężyna.
          </p>
          <p>
            Olej przepływa przy tym przez małe, kalibrowane otwory i stawia opór – zamienia energię uderzenia w ciepło. Dzięki temu po przyziemieniu samolot nie podskakuje, tylko łagodnie siada. <b>Nożyce</b> z przodu goleni pozwalają tłoczysku przesuwać się, ale nie obracać.
          </p>
          <p>
            Włączona animacja pokazuje całe lądowanie: podejście po ścieżce 3° (ok. 140 kt, nos ok. 2,5° w górę), <b>wyrównanie</b> od ok. 9 m – nos podnosi się do ok. 5,5°, a opadanie maleje do ok. 0,9 m/s – i przyziemienie kół głównych. Zaraz potem wysuwają się spojlery, otwierają odwracacze ciągu, a pilot łagodnie opuszcza nos, aż koło przednie dotknie pasa. To ten sam przebieg co w zakładce o hamulcach. Na PFD widać pochylenie, prędkość i wysokość nad pasem.
          </p>
          <p>Po wyłączeniu animacji suwak zmienia obciążenie: 0% – koła ledwo dotykają pasa (np. przy oderwaniu), 100% – postój, 200% – twarde lądowanie.</p>
        </>
      ),
    }),
    plane({
      title: 'Chowanie i wypuszczanie',
      spot: GEAR_SPOTS[2],
      camera: [14, -11, 19],
      target: [-6, -3.4, 1.5],
      preset: { focus: 'gear', gear: 'retract' },
      controls: [{ type: 'button', key: 'up', label: 'Schowaj podwozie', labelOn: 'Wypuść podwozie', default: false }],
      body: (
        <>
          <p>
            Po starcie pilot przestawia dźwignię podwozia na <b>UP</b>. Najpierw otwierają się drzwi wnęk, potem hydrauliczne siłowniki składają <b>zastrzały</b> i obracają goleń: <b>główne</b> chowają się w bok, do wnęk w kadłubie pod centropłatem, a <b>przednie</b> do przodu, pod kokpit. Na końcu drzwi się zamykają i podwozie zostaje zatrzaśnięte w zamkach.
          </p>
          <p>
            Przy chowaniu wózek pochyla się tak, żeby sześć kół zmieściło się we wnęce. Całość trwa kilka–kilkanaście sekund. Gdyby zawiodła hydraulika, podwozie można <b>wypuścić grawitacyjnie</b>: otwiera się zamki, a goleń opada pod własnym ciężarem i pędem powietrza.
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
            Hamują tylko koła <b>główne</b> – wszystkie dwanaście. W każdym jest pakiet tarcz z <b>kompozytu węglowego</b>: lekki i odporny na bardzo wysoką temperaturę. Hamowanie zamienia energię ruchu samolotu w ciepło – tarcze nagrzewają się do kilkuset stopni i potem długo stygną.
          </p>
          <p>
            Przed lądowaniem pilot wybiera <b>autobrake</b>: po przyziemieniu system sam hamuje ze stałym, wybranym opóźnieniem (LO, 2, 3, HI). A350 ma też tryb <b>BTV</b> (Brake To Vacate), który dobiera hamowanie tak, by zjechać z pasa w wybranym miejscu. Układ <b>przeciwpoślizgowy</b> pilnuje, żeby żadne koło się nie zablokowało.
          </p>
          <p>
            Animacja zaczyna się na podejściu – przyziemienie wypada w tej samej chwili co w zakładce o amortyzatorze. Autobrake rusza razem ze spojlerami naziemnymi, ok. 1 s po przyziemieniu, a opóźnienie narasta płynnie. Patrz na stronę WHEEL: temperatury hamulców rosną w czasie dobiegu, a tarcze w kołach zaczynają się żarzyć.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Sterowanie na ziemi',
      spot: GEAR_SPOTS[4],
      // z góry, z przodu po prawej: cały zakręt na pasie i ślady kół
      camera: [-62, 78, -48],
      target: [-6, -6, 16],
      preset: { focus: 'gear', gear: 'steer' },
      controls: [
        { type: 'slider', key: 'tiller', label: 'Skręt koła przedniego (tiller)', min: 20, max: 70, step: 1, default: 70, unit: '°' },
        {
          type: 'select',
          key: 'rw',
          label: 'Szerokość pasa',
          default: '45',
          options: [
            { value: '45', label: '45 m' },
            { value: '60', label: '60 m' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Na ziemi samolot skręca <b>kołem przednim</b>. Pilot obraca małym kołem sterowym (tillerem) z boku fotela – koło przednie skręca do ok. 70°. Przy większych prędkościach, np. na pasie, wystarczają pedały steru kierunku, które skręcają je tylko o kilka stopni.
          </p>
          <p>
            W wersji -1000 przy ciasnych zakrętach skręcają też <b>tylne osie wózków głównych</b> – w przeciwną stronę. Opony mniej się wtedy ścierają, a wózki nie „szorują” bokiem po płycie.
          </p>
          <p>
            Samolot zawraca o 180° na końcu pasa: pilot obraca tillerem, a samolot kręci się wokół <b>środka zakrętu</b> na linii nieskrętnych osi wózków. Na asfalcie zostają ślady kół: <b>koła przedniego</b> (najszerszy łuk) i wózków, a różowy łuk to <b>końcówka skrzydła</b>. Kurs i przewidywany tor widać na ND.
          </p>
          <p>Zmieniaj kąt tillera i szerokość pasa: przy pełnym skręcie A350-1000 potrzebuje ok. 60 m nawierzchni – na pasie szerokości 45 m musi zawracać na specjalnej zatoczce (turn pad).</p>
        </>
      ),
    }),
  ];
}
