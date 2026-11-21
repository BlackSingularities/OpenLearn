/*
 * Moduł „Od lądowania do lądowania” – jeden ciągły cykl pracy samolotu na wspólnych modelach (samolot, lotnisko,
 * pojazdy obsługi), bez pożyczania zakładek innych modułów.
 *
 * Cała historia to jedna oś czasu: wjazd na stanowisko po lądowaniu, postój i obsługa naziemna (kliny, zasilanie,
 * rękawy, rozładunek, catering, woda i toalety, tankowanie, obchód, załadunek i wsiadanie), przygotowanie do odlotu,
 * wypychanie z rozruchem silników, kołowanie, start, lot, podejście, lądowanie i zjazd z pasa – dokładnie tam, gdzie
 * cykl się zaczął. Każda zakładka to odcinek tej osi: rusza sama, a jej stan końcowy jest stanem początkowym następnej.
 *
 * Układy współrzędnych:
 * – lotnisko (runway.tsx): u – wzdłuż pasa od progu 27R, v – w lewo od osi pasa (m); model w układzie x = −u, z = v,
 * – samolot stoi zawsze w środku sceny (nos w −x, lewa burta +z); porusza się świat (MovingWorld) – kamera jedzie
 *   razem z samolotem,
 * – stanowisko (rękawy, pojazdy, ludzie) budowane jest w układzie samolotu zaparkowanego przy terminalu i ustawione
 *   na lotnisku w miejscu stanowiska – gdy samolot stoi, oba układy się pokrywają.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { PartModule, SceneProps, Step } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { useSceneHidden } from '../../lib/topicNav';
import { AIRBUS, CockpitDock, Ecam, Nd, Pfd } from '../../components/cockpit';
import { speedInText, useSpeed, useSpeedUnit } from '../../components/ui';
import {
  Airliner,
  CARGO_DOORS,
  CARGO_TEND,
  CargoDoor,
  CargoLoader,
  ChockPair,
  DollyTrains,
  FLOOR,
  FUS_LIVE,
  GseWheel,
  HazardPlate,
  MLG,
  NOSE_X,
  PAX_DOOR,
  PLANE_LEVELS,
  SafetyCone,
  StaticBar,
  engineOrigin,
  fusPt,
  fusTheta,
  newExtLights,
  newGearDrive,
  placeBetween,
  type Mech,
} from './airliner';
import { A1_U, AirportModel, EXIT, GATE, TWY_V } from './runway';
import { StageCamera } from './airSystem';
import { GpuCart, EXT_SOCKET } from './electrics';
import { FuelTruck, REFUEL_LAY } from './refuel';
import { CLOSED, PaxDoor, type DS } from './doors';
import { fuelSplit, TANK } from './fuelTanks';

type V3 = [number, number, number];
type P2 = [number, number];
const G = PLANE_LEVELS.ground;
const DEG = Math.PI / 180;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Płynne przejście 0 → 1 między chwilami a i b. */
const ramp = (t: number, a: number, b: number) => sm((t - a) / (b - a));
/** Wartość „włączona” między a i b (z płynnym wejściem i wyjściem w czasie e). */
const span = (t: number, a: number, b: number, e = 1.5) => ramp(t, a, a + e) * (1 - ramp(t, b - e, b));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/* ======================= trasy po lotnisku ======================= */

/** Stanowisko A1 przy terminalu (wspólny model lotniska): nos w stronę terminalu (−v). */
const GATE_PSI = -Math.PI / 2;

type Sample = { u: number; v: number; psi: number; s: number; k: number };
type Route = { S: Sample[]; L: number };
/** Trasa z punktów i promieni łuków w narożnikach (próbki co 1 m: położenie, kurs, krzywizna). */
function makeRoute(pts: P2[], radii: number[]): Route {
  const S: Sample[] = [];
  let s = 0;
  const push = (u: number, v: number, psi: number, k: number) => {
    if (S.length) {
      const p = S[S.length - 1];
      s += Math.hypot(u - p.u, v - p.v);
    }
    S.push({ u, v, psi, s, k });
  };
  let cur: P2 = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const d0 = norm([b[0] - a[0], b[1] - a[1]]);
    const psi0 = Math.atan2(d0[1], d0[0]);
    let end: P2 = b;
    let arc: null | { c: P2; r: number; a0: number; da: number; to: P2 } = null;
    if (c) {
      const d1 = norm([c[0] - b[0], c[1] - b[1]]);
      const turn = Math.atan2(d0[0] * d1[1] - d0[1] * d1[0], d0[0] * d1[0] + d0[1] * d1[1]);
      const r = radii[i - 1] ?? 30;
      const tl = r * Math.tan(Math.abs(turn) / 2);
      end = [b[0] - d0[0] * tl, b[1] - d0[1] * tl];
      const nrm: P2 = turn > 0 ? [-d0[1], d0[0]] : [d0[1], -d0[0]];
      const cc: P2 = [end[0] + nrm[0] * r, end[1] + nrm[1] * r];
      arc = { c: cc, r, a0: Math.atan2(end[1] - cc[1], end[0] - cc[0]), da: turn, to: [b[0] + d1[0] * tl, b[1] + d1[1] * tl] };
    }
    const len = Math.hypot(end[0] - cur[0], end[1] - cur[1]);
    const n = Math.max(1, Math.round(len));
    for (let j = S.length ? 1 : 0; j <= n; j++) push(cur[0] + ((end[0] - cur[0]) * j) / n, cur[1] + ((end[1] - cur[1]) * j) / n, psi0, 0);
    if (arc) {
      const n2 = Math.max(2, Math.round(Math.abs(arc.da) * arc.r));
      for (let j = 1; j <= n2; j++) {
        const an = arc.a0 + (arc.da * j) / n2;
        push(arc.c[0] + Math.cos(an) * arc.r, arc.c[1] + Math.sin(an) * arc.r, psi0 + (arc.da * j) / n2, Math.sign(arc.da) / arc.r);
      }
      cur = [S[S.length - 1].u, S[S.length - 1].v];
    } else cur = end;
  }
  return { S, L: s };
}
function norm(d: P2): P2 {
  const l = Math.hypot(d[0], d[1]) || 1;
  return [d[0] / l, d[1] / l];
}
function at(r: Route, s: number) {
  const S = r.S;
  if (s <= 0) return S[0];
  if (s >= r.L) return S[S.length - 1];
  let lo = 0;
  let hi = S.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (S[m].s < s) lo = m;
    else hi = m;
  }
  const a = S[lo];
  const b = S[hi];
  const k = (s - a.s) / (b.s - a.s || 1);
  let dpsi = b.psi - a.psi;
  dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi));
  return { u: lerp(a.u, b.u, k), v: lerp(a.v, b.v, k), psi: a.psi + dpsi * k, s, k: b.k };
}
const sOf = (r: Route, pred: (q: Sample) => boolean) => r.S.find(pred)?.s ?? r.L;

/**
 * Przejazd po trasie od s0 do s1: prędkość ograniczona na łukach (przyspieszenie boczne), przyspieszanie i hamowanie
 * z ograniczonym przyspieszeniem, prędkość początkowa i końcowa zadane. Zwraca czas przejazdu i drogę w chwili t.
 */
function drive(r: Route, s0: number, s1: number, o: { vmax: number; v0?: number; v1?: number; acc?: number; dec?: number; lat?: number; vlim?: (s: number) => number }) {
  const n = Math.max(2, Math.ceil(s1 - s0));
  const ds = (s1 - s0) / n;
  const acc = o.acc ?? 0.6;
  const dec = o.dec ?? 0.8;
  const lat = o.lat ?? 0.7;
  const v: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + i * ds;
    const k = Math.abs(at(r, s).k);
    let lim = Math.min(o.vmax, k > 1e-4 ? Math.sqrt(lat / k) : o.vmax);
    if (o.vlim) lim = Math.min(lim, o.vlim(s));
    v.push(lim);
  }
  v[0] = Math.min(v[0], o.v0 ?? 0);
  v[n] = Math.min(v[n], o.v1 ?? 0);
  for (let i = 1; i <= n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * acc * ds));
  for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * dec * ds));
  const tt: number[] = [0];
  for (let i = 1; i <= n; i++) tt.push(tt[i - 1] + ds / Math.max(0.25, (v[i - 1] + v[i]) / 2));
  const T = tt[n];
  return {
    T,
    s(t: number) {
      if (t <= 0) return s0;
      if (t >= T) return s1;
      let lo = 0;
      let hi = n;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (tt[m] < t) lo = m;
        else hi = m;
      }
      return s0 + (lo + (t - tt[lo]) / (tt[hi] - tt[lo] || 1)) * ds;
    },
    v(t: number) {
      if (t <= 0 || t >= T) return t <= 0 ? v[0] : v[n];
      let lo = 0;
      let hi = n;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (tt[m] < t) lo = m;
        else hi = m;
      }
      return v[lo];
    },
  };
}

/** Lądowanie i wjazd: pas od miejsca przyziemienia, szybki zjazd w prawo, droga równoległa, linia wjazdu na stanowisko. */
const R_IN = makeRoute(
  [
    [300, 0],
    [EXIT.u + EXIT.R, 0],
    [EXIT.u + EXIT.R, TWY_V],
    [GATE.u, TWY_V],
    [GATE.u, GATE.v],
  ],
  [EXIT.R, 32, 34],
);
const S_TD = 450 - 300;
/** Samolot opuścił pas (cały za linią krawędzi drogi startowej). */
const S_VAC = sOf(R_IN, (q) => q.v < -58);
/** Początek skrętu z drogi równoległej w linię wjazdu na stanowisko (łuk przed linią wjazdu). */
const S_TURN_IN = sOf(R_IN, (q) => q.v <= TWY_V + 0.5 && q.u < GATE.u + 45);
/** Wypychanie: tyłem od terminalu na drogę kołowania, z obrotem nosem w stronę progu pasa. */
const R_PUSH = makeRoute(
  [
    [GATE.u, GATE.v],
    [GATE.u, TWY_V],
    [GATE.u + 60, TWY_V],
  ],
  [40],
);
const S_PUSH_END = sOf(R_PUSH, (q) => q.u > GATE.u + 42);
/** Kołowanie do pasa: droga równoległa, łącznik A1, punkt oczekiwania i ustawienie na osi pasa. */
const R_TAXI = makeRoute(
  [
    [GATE.u + 42, TWY_V],
    [A1_U, TWY_V],
    [A1_U, 0],
    [600, 0],
  ],
  [40, 36],
);
const S_HOLD = sOf(R_TAXI, (q) => q.u < A1_U + 1 && q.v > -78);
const S_LINE = sOf(R_TAXI, (q) => q.v > -0.4 && q.u > A1_U + 50);

/* ---------- przebiegi ruchu (liczone raz) ---------- */

/** Dobieg po przyziemieniu: hamowanie (autobrake LO i odwracacze) do prędkości zjazdu, zjazd z pasa. */
const RUN_ROLL = drive(R_IN, S_TD, S_VAC + 20, { vmax: 70, v0: 69, v1: 9, acc: 0.3, dec: 1.7, lat: 1.6, vlim: (s) => Math.max(14, Math.sqrt(Math.max(0, 69 * 69 - 2 * 1.75 * (s - S_TD)))) });
/** Kołowanie od zjazdu na stanowisko: drogą równoległą, na końcu powoli wzdłuż linii wjazdu (prowadzi wskaźnik dokowania). */
const RUN_IN = drive(R_IN, S_VAC + 20, R_IN.L, { vmax: 9, v0: 9, v1: 0, acc: 0.5, dec: 0.5, lat: 0.9, vlim: (s) => 0.5 + 0.05 * (R_IN.L - s) });
const RUN_PUSH = drive(R_PUSH, 0, S_PUSH_END, { vmax: 1.6, v0: 0, v1: 0, acc: 0.15, dec: 0.2, lat: 0.25 });
const RUN_HOLD = drive(R_TAXI, 0, S_HOLD, { vmax: 10, acc: 0.5, dec: 0.6, lat: 0.8 });
const RUN_LINE = drive(R_TAXI, S_HOLD, S_LINE, { vmax: 6, acc: 0.4, dec: 0.5, lat: 0.8 });

/* ======================= stan cyklu ======================= */

/** Drzwi pasażerskie: 0–3 lewe (1L–4L), 4–7 prawe (1R–4R). */
type DoorSt = DS[];
export type CycSt = {
  // poza samolotu na lotnisku
  u: number;
  v: number;
  psi: number;
  h: number;
  pitch: number;
  bank: number;
  /** Droga przetoczona przez koła (m) i skręt koła przedniego (rad). */
  roll: number;
  steer: number;
  gearUp: number;
  n1: number;
  rev: number;
  mech: Mech;
  spoiler: number;
  surf: { aileron: number; elevator: number; rudder: number };
  lights: { nav: boolean; logo: boolean; beacon: boolean; strobe: boolean; land: boolean; taxi: boolean; to: boolean; turnoff: boolean; wing: boolean };
  doors: DoorSt;
  /** Rękawy 1L i 2L: 0 – przy terminalu, 1 – przy drzwiach. */
  bridge: [number, number];
  chocks: number;
  cones: number;
  gpu: number;
  gpuPlug: boolean;
  /** Załadunek: czas scenariusza ładowni (jak w module kadłuba) albo null – brak podnośników. */
  cargoT: number | null;
  /** Rozładunek (kontenery z ładowni na wózki), a nie załadunek. */
  unload: boolean;
  catering: [number, number];
  lav: number;
  water: number;
  fuelTruck: number;
  fuelPlat: number;
  fob: number;
  walk: number | null;
  tug: number;
  towbar: boolean;
  bypassPin: boolean;
  pax: number;
  apu: boolean;
  /** Ludzie na płycie: [x, z, kolor] w układzie stanowiska. */
  crew: [number, number, string][];
  /** Zegar (minuty od przylotu na stanowisko) i opis tego, co się dzieje. */
  clock: number;
  text: string;
  /** Ekran ECAM w doku i wyświetlacze lotu. */
  ecam: 'DOOR' | 'FUEL' | 'ENG' | 'WHEEL' | 'CRUISE' | 'APU' | null;
  flight: boolean;
  ias: number;
  vs: number;
  altFt: number;
  /** Indeks ujęcia kamery w zakładce. */
  view: number;
};

const ALL_CLOSED = (): DoorSt => Array.from({ length: 8 }, () => ({ ...CLOSED }));
const armed = (): DS => ({ ...CLOSED, lever: 1, girt: 1, ind: true });
const LT_OFF = { nav: false, logo: false, beacon: false, strobe: false, land: false, taxi: false, to: false, turnoff: false, wing: false };
const MECH0: Mech = { flap: 0, fowler: 0, slat: 0 };
const MECH_TO: Mech = { flap: 10, fowler: 0.45, slat: 1 };
const MECH_LDG: Mech = { flap: 32, fowler: 1, slat: 1 };
const lerpMech = (a: Mech, b: Mech, k: number): Mech => ({ flap: lerp(a.flap, b.flap, k), fowler: lerp(a.fowler, b.fowler, k), slat: lerp(a.slat, b.slat, k) });

/** Samolot zaparkowany przy terminalu (wspólna baza zakładek obsługi naziemnej). */
function parked(): CycSt {
  return {
    u: GATE.u,
    v: GATE.v,
    psi: GATE_PSI,
    h: 0,
    pitch: 0,
    bank: 0,
    roll: 0,
    steer: 0,
    gearUp: 0,
    n1: 0,
    rev: 0,
    mech: MECH0,
    spoiler: 0,
    surf: { aileron: 0, elevator: 0, rudder: 0 },
    lights: { ...LT_OFF, nav: true, logo: true },
    doors: ALL_CLOSED(),
    bridge: [0, 0],
    chocks: 1,
    cones: 1,
    gpu: 1,
    gpuPlug: true,
    cargoT: null,
    unload: false,
    catering: [0, 0],
    lav: 0,
    water: 0,
    fuelTruck: 0,
    fuelPlat: 0,
    fob: 9800,
    walk: null,
    tug: 0,
    towbar: false,
    bypassPin: false,
    pax: 0,
    apu: false,
    crew: [],
    clock: 0,
    text: '',
    ecam: 'DOOR',
    flight: false,
    ias: 0,
    vs: 0,
    altFt: 0,
    view: 0,
  };
}

/** Ustawienie samolotu na trasie (do przodu albo tyłem – wypychanie). */
function onRoute(st: CycSt, r: Route, s: number, back = false) {
  const q = at(r, s);
  st.u = q.u;
  st.v = q.v;
  st.psi = q.psi + (back ? Math.PI : 0);
  // skręt koła przedniego z krzywizny toru (rozstaw osi ok. 32 m); tyłem – w drugą stronę
  st.steer = Math.atan(32 * q.k) * (back ? -1 : 1);
  st.roll = s * (back ? -1 : 1);
}

/* ---------- zakładki: odcinki osi czasu ---------- */

type Ev = [number, string];
type Seg = { id: string; title: string; dur: number; clock: [number, number]; events: Ev[]; views: { cam: V3; tgt: V3 }[]; viewAt: [number, number][]; at: (t: number) => CycSt };
/** Ujęcia zakładek pisane „ciasno” – kamera odsunięta od celu (samolot ma 74 m długości i 65 m rozpiętości). */
const far = (v: { cam: V3; tgt: V3 }, gate = false, k = 1.65): { cam: V3; tgt: V3 } => {
  const cam: V3 = [v.tgt[0] + (v.cam[0] - v.tgt[0]) * k, v.tgt[1] + (v.cam[1] - v.tgt[1]) * k, v.tgt[2] + (v.cam[2] - v.tgt[2]) * k];
  // przy stanowisku kamera zostaje przed fasadą terminalu (ok. 48 m przed samolotem)
  if (gate && cam[0] < -44) {
    const k2 = (-44 - v.tgt[0]) / (cam[0] - v.tgt[0]);
    return { cam: [-44, v.tgt[1] + (cam[1] - v.tgt[1]) * k2 + 6, v.tgt[2] + (cam[2] - v.tgt[2]) * Math.max(k2, 1)], tgt: v.tgt };
  }
  return { cam, tgt: v.tgt };
};
const GATE_SEGS = new Set(['arrive', 'secure', 'bridge', 'unload', 'service', 'fuel', 'walk', 'load', 'ready', 'push']);
const viewOf = (list: [number, number][], t: number) => {
  let v = 0;
  for (const [tt, i] of list) if (t >= tt) v = i;
  return v;
};

/* ----- 1. wjazd na stanowisko ----- */
const IN_T = RUN_IN.T;
const SEG_ARRIVE: Seg = {
  id: 'arrive',
  title: 'Wjazd na stanowisko',
  dur: IN_T + 4,
  clock: [-4, 0],
  events: [
    [0, 'Samolot zjechał z pasa. Kontroler ruchu naziemnego podaje trasę: drogą kołowania równoległą do pasa do stanowiska przy terminalu.'],
    [6, 'Kołowanie z prędkością ok. 30 km/h na jednym lub dwóch silnikach. Światła kołowania i zjazdowe świecą, stroboskopy są wyłączone.'],
    [IN_T * 0.55, 'Skręt w linię wjazdu. Żółta linia na płycie prowadzi przednie koło dokładnie na miejsce postoju. Na skręcie gasną światła zjazdowe, a zaraz potem światło kołowania – żeby nie oślepiać obsługi.'],
    [IN_T * 0.75, 'Na ścianie terminalu świeci tablica dokowania: pokazuje odległość do zatrzymania i czy samolot jest na osi. Kapitan jedzie bardzo wolno.'],
    [IN_T, '„STOP” na tablicy – kapitan zatrzymuje samolot i włącza hamulec postojowy.'],
  ],
  views: [
    { cam: [32, 14, 30], tgt: [-6, -3, 0] },
    { cam: [-62, 18, 38], tgt: [-20, -3, 4] },
    { cam: [-36, 4, 36], tgt: [-24, -2, 0] },
  ],
  viewAt: [
    [0, 0],
    [IN_T * 0.5, 1],
    [IN_T * 0.78, 2],
  ],
  at(t) {
    const st = parked();
    const s = RUN_IN.s(t);
    onRoute(st, R_IN, s);
    const vNow = RUN_IN.v(t);
    st.n1 = t < IN_T ? 21 + (vNow < 1.5 ? 0 : 1.5) : Math.max(0, 21 - (t - IN_T) * 6);
    // przy skręcie w stronę stanowiska gasną światła zjazdowe, chwilę później światło kołowania – żeby nie oślepiać
    // obsługi naziemnej i nie zasłaniać pilotowi tablicy dokowania
    st.lights = { ...LT_OFF, nav: true, logo: true, beacon: true, taxi: s < S_TURN_IN + 30, turnoff: s < S_TURN_IN };
    st.mech = MECH0;
    st.chocks = 0;
    st.cones = 0;
    st.gpu = 0;
    st.gpuPlug = false;
    st.ecam = 'WHEEL';
    st.ias = vNow * 1.944;
    st.clock = -4 + (4 * t) / (IN_T + 4);
    st.crew = t > IN_T * 0.7 ? [[-44, -9, '#f97316']] : [];
    return st;
  },
};

/* ----- 2. wyłączenie silników, kliny, zasilanie ----- */
const SEG_SECURE: Seg = {
  id: 'secure',
  title: 'Silniki, kliny i zasilanie',
  dur: 38,
  clock: [0, 3],
  events: [
    [0, 'Hamulec postojowy włączony. Zanim silniki zgasną, prąd daje APU albo – częściej – zasilanie z rękawu lub agregatu.'],
    [3, 'ENG MASTER 1 i 2 na OFF: silniki zwalniają i stają. Gaśnie czerwona migająca lampa BEACON – znak dla obsługi, że można podejść do samolotu.'],
    [12, 'Mechanik podkłada kliny pod koło przednie i koła główne. Dopiero wtedy wolno zwolnić hamulec postojowy (gorące hamulce szybciej stygną).'],
    [19, 'Pachołki ostrzegawcze przy końcówkach skrzydeł, silnikach i ogonie wyznaczają strefę, w którą pojazdy nie mogą wjechać.'],
    [24, 'Pod nos podjeżdża agregat prądotwórczy (GPU). Mechanik wkłada wtyczkę do gniazda w spodzie kadłuba, a pilot wciska EXT PWR.'],
    [33, 'Samolot jest zabezpieczony i zasilany z ziemi. Załoga odpina pasy, a obsługa naziemna może zaczynać pracę.'],
  ],
  views: [
    { cam: [-58, 9, 30], tgt: [-14, -3, 0] },
    { cam: [-44, -3.2, 9], tgt: [-28, -5.2, 0] },
    { cam: [-48, 4, -14], tgt: [-34, -4.6, -2] },
  ],
  viewAt: [
    [0, 0],
    [10, 1],
    [22, 2],
  ],
  at(t) {
    const st = parked();
    st.n1 = 21 * (1 - ramp(t, 3, 11));
    st.lights = { ...LT_OFF, nav: true, logo: true, beacon: t < 9 };
    st.chocks = ramp(t, 12, 17);
    st.cones = ramp(t, 19, 23);
    st.gpu = ramp(t, 24, 31);
    st.gpuPlug = t > 31.5;
    st.ecam = 'DOOR';
    st.clock = (3 * t) / 38;
    st.crew = [
      [lerp(-48, NOSE_X - 2, ramp(t, 9, 12)), lerp(-14, -1.8, ramp(t, 9, 12)), '#f97316'],
      [lerp(-30, MLG.x - 3, ramp(t, 13, 16)), lerp(-26, -MLG.z - 2, ramp(t, 13, 16)), '#facc15'],
    ];
    return st;
  },
};

/** Stany wspólne dla kolejnych zakładek obsługi (to, co już się stało, zostaje). */
const DISEMBARK_T = 44;
/* ----- 3. rękawy i wysiadanie ----- */
const SEG_BRIDGE: Seg = {
  id: 'bridge',
  title: 'Rękawy i wysiadanie',
  dur: DISEMBARK_T,
  clock: [3, 22],
  events: [
    [0, '„Cabin crew, disarm doors and cross-check”. Personel przestawia dźwignie wszystkich drzwi na DISARMED – zjeżdżalnie nie wystrzelą przy otwarciu – i sprawdza nawzajem.'],
    [5, 'Operator rękawa prowadzi go do drzwi 1L: rękaw wydłuża się, skręca i podnosi do wysokości progu (ok. 5 m nad płytą).'],
    [13, 'Drugi rękaw jedzie do drzwi 2L. Na końcu każdego rękawa jest kabina z miechem, który przylega do kadłuba i chroni przed deszczem.'],
    [21, 'Obsługa puka w drzwi – znak, że rękaw jest na miejscu. Personel otwiera drzwi 1L i 2L.'],
    [26, 'Pasażerowie wysiadają dwoma rękawami naraz. Przy ok. 350 osobach trwa to kilkanaście minut.'],
    [40, 'Ostatni pasażer wyszedł. Personel sprawdza, czy nikt nie został w kabinie.'],
  ],
  views: [
    { cam: [-14, 16, 44], tgt: [-30, -1, 10] },
    { cam: [-12, 6, 24], tgt: [-26, -0.5, 4] },
  ],
  viewAt: [
    [0, 0],
    [20, 1],
  ],
  at(t) {
    const st = parked();
    const dis = 1 - ramp(t, 0.5, 3.5);
    st.doors = ALL_CLOSED().map(() => ({ ...CLOSED, lever: dis, girt: dis, ind: dis > 0.95 }));
    st.bridge = [ramp(t, 5, 13), ramp(t, 12, 20)];
    st.doors[0] = { ...st.doors[0], handle: ramp(t, 21, 22), u: ramp(t, 22, 26) };
    st.doors[1] = { ...st.doors[1], handle: ramp(t, 22, 23), u: ramp(t, 23, 27) };
    st.pax = Math.round(352 * (1 - ramp(t, 26, 40)));
    st.clock = 3 + (19 * t) / DISEMBARK_T;
    st.crew = [[NOSE_X - 2, -1.8, '#f97316']];
    return st;
  },
};
/** Drzwi przy rękawach otwarte, reszta rozbrojona i zamknięta. */
const doorsTurn = (): DoorSt => {
  const d = ALL_CLOSED();
  d[0] = { ...CLOSED, u: 1, handle: 1 };
  d[1] = { ...CLOSED, u: 1, handle: 1 };
  return d;
};
const turnBase = (): CycSt => ({ ...parked(), bridge: [1, 1], doors: doorsTurn() });

/* ----- 4. rozładunek ładowni ----- */
const UNLOAD_T = CARGO_TEND + 6;
const SEG_UNLOAD: Seg = {
  id: 'unload',
  title: 'Rozładunek ładowni',
  dur: UNLOAD_T,
  clock: [6, 30],
  events: [
    [0, 'Bagaż i ładunek są w kontenerach (oznaczonych LD3). Pod drzwi przedniej i tylnej ładowni (po prawej burcie) podjeżdżają podnośniki.'],
    [4, 'Drzwi ładowni otwierają się do góry. Kontenery jadą po rolkach w podłodze ładowni do drzwi i dalej na most podnośnika.'],
    [12, 'Tylna platforma podnośnika zjeżdża z każdym kontenerem na wysokość wózka. Ciągnik odwozi pociągi wózków z bagażem do sortowni.'],
    [UNLOAD_T - 8, 'Ładownie są puste. Obsługa sprawdza, czy w środku nic nie zostało i czy nie ma uszkodzeń.'],
  ],
  views: [
    { cam: [-14, 6, -34], tgt: [-6, -3.5, -6] },
    { cam: [-28, 1.5, -18], tgt: [-18, -3.4, -5] },
  ],
  viewAt: [
    [0, 0],
    [9, 1],
  ],
  at(t) {
    const st = turnBase();
    // rozładunek: puste pociągi podjeżdżają, kontenery wyjeżdżają z ładowni na podnośnik i na kolejne wózki
    st.cargoT = Math.max(0, t - 1);
    st.unload = true;
    st.pax = 0;
    st.clock = 6 + (24 * t) / UNLOAD_T;
    return st;
  },
};

/* ----- 5. catering, sprzątanie, woda i toalety ----- */
const SEG_SERVICE: Seg = {
  id: 'service',
  title: 'Catering, woda i toalety',
  dur: 50,
  clock: [22, 45],
  events: [
    [0, 'Przez rękawy wchodzi ekipa sprzątająca: czyści kabinę, zmienia zagłówki, sprawdza kieszenie foteli i schowki.'],
    [3, 'Do drzwi 1R i 4R (prawa burta) podjeżdżają samochody cateringowe. Ich skrzynia unosi się na nożycach do progu drzwi.'],
    [14, 'Personel otwiera drzwi od strony cateringu. Wózki z jedzeniem i napojami wymienia się całymi – zużyte zjeżdżają na dół, pełne wjeżdżają do kuchni.'],
    [24, 'Pod tylną część kadłuba podjeżdża wóz do opróżniania toalet. Wąż podłącza się do zaworu w spodzie kadłuba, ścieki spływają do zbiornika wozu.'],
    [30, 'Wóz z wodą pitną napełnia zbiorniki wody (ok. 1100 l) przez zawór z przodu kadłuba. Wody tankuje się tyle, ile potrzeba na lot.'],
    [42, 'Catering skończony – drzwi 1R i 4R zamknięte, skrzynie zjeżdżają, samochody odjeżdżają.'],
  ],
  views: [
    { cam: [-46, 9, -40], tgt: [-6, -2, -6] },
    { cam: [6, 2, -26], tgt: [14, -1, -4] },
    { cam: [-40, 4, -24], tgt: [-24, -3, -3] },
    { cam: [-46, 9, -40], tgt: [-6, -2, -6] },
  ],
  viewAt: [
    [0, 0],
    [12, 1],
    [24, 2],
    [40, 3],
  ],
  at(t) {
    const st = turnBase();
    st.catering = [span(t, 3, 48, 9), span(t, 5, 47, 9)];
    // drzwi 1R (indeks 4) i 4R (7) otwarte, gdy skrzynia stoi przy progu
    const o = span(t, 14, 42, 3);
    st.doors[4] = { ...CLOSED, u: o, handle: o > 0 ? 1 : 0 };
    st.doors[7] = { ...CLOSED, u: o, handle: o > 0 ? 1 : 0 };
    st.lav = span(t, 22, 40, 5);
    st.water = span(t, 28, 46, 5);
    st.clock = 22 + (23 * t) / 50;
    st.crew = [
      [24, -5, '#f97316'],
      [-30, -6, '#facc15'],
    ];
    return st;
  },
};

/* ----- 6. tankowanie ----- */
const FOB0 = 9800;
const FOB1 = 64200;
const SEG_FUEL: Seg = {
  id: 'fuel',
  title: 'Tankowanie',
  dur: 46,
  clock: [25, 50],
  events: [
    [0, 'Ilość paliwa na lot policzono z planu lotu: trasa, wiatr, lotnisko zapasowe i zapas. Do lotu trzeba dotankować ok. 54 t.'],
    [3, 'Pod prawe skrzydło podjeżdża dystrybutor paliwa. Paliwo płynie z podziemnej sieci rurociągów lotniska, a wóz tylko je pompuje i mierzy.'],
    [12, 'Platforma wozu unosi się pod skrzydło. Tankowiec łączy przewód uziemiający, a potem wąż ze złączem w spodzie skrzydła.'],
    [17, 'Tankowanie: ok. 2,5 t paliwa na minutę. Komputer paliwowy sam rozdziela paliwo do zbiorników – najpierw skrzydłowe, potem środkowy.'],
    [37, 'Zatankowane. Pilot sprawdza w kokpicie ilość paliwa na ECAM i podpisuje kwit z ilością. Wąż odłączony, platforma w dół.'],
  ],
  views: [
    { cam: [-30, 8, -46], tgt: [-6, -3, -14] },
    { cam: [REFUEL_LAY.cpl[0] - 9, G + 3.5, REFUEL_LAY.cpl[2] - 8], tgt: [REFUEL_LAY.cpl[0] - 1, REFUEL_LAY.cpl[1] - 1.2, REFUEL_LAY.cpl[2]] },
    { cam: [-30, 8, -46], tgt: [-6, -3, -14] },
  ],
  viewAt: [
    [0, 0],
    [11, 1],
    [37, 2],
  ],
  at(t) {
    const st = turnBase();
    st.fuelTruck = span(t, 3, 46, 8);
    st.fuelPlat = span(t, 12, 40, 3);
    st.fob = lerp(FOB0, FOB1, ramp(t, 17, 37));
    st.ecam = 'FUEL';
    st.clock = 25 + (25 * t) / 46;
    st.crew = [[REFUEL_LAY.stopX - 2, REFUEL_LAY.lane - 2.5, '#facc15']];
    return st;
  },
};

/* ----- 7. obchód samolotu ----- */
/** Trasa obchodu (układ stanowiska): od nosa wzdłuż lewej burty, ogon, prawa burta i z powrotem do nosa. */
const ENG = engineOrigin();
const ENG_POS = ENG;
const WALK: { p: P2; note: string }[] = [
  { p: [NOSE_X - 4, 0], note: 'nos: osłona radaru, czujniki ciśnienia (rurki Pitota) i czujniki kąta natarcia – czyste, nieuszkodzone' },
  { p: [NOSE_X - 0.5, 2.2], note: 'podwozie przednie: opony, ugięcie amortyzatora, brak wycieków płynu' },
  { p: [ENG[0] - 4, ENG[2] + 0.5], note: 'silnik 1: łopaty wentylatora bez wgnieceń (np. po ptakach), wlot czysty, brak wycieków oleju' },
  { p: [4, 26], note: 'lewe skrzydło: końcówka, światła, klapy i lotki – bez uszkodzeń' },
  { p: [MLG.x + 3, MLG.z + 2.5], note: 'podwozie główne: zużycie opon, hamulce (wskaźniki zużycia), brak wycieków' },
  { p: [33, 4], note: 'ogon: stery, APU, światła ogona' },
  { p: [MLG.x + 3, -MLG.z - 2.5], note: 'prawe podwozie główne' },
  { p: [4, -26], note: 'prawe skrzydło' },
  { p: [ENG[0] - 4, -ENG[2] - 0.5], note: 'silnik 2' },
  { p: [NOSE_X - 4, 0], note: 'koniec obchodu – wszystko w porządku' },
];
const WALK_SEG = (() => {
  const d = [0];
  for (let i = 1; i < WALK.length; i++) d.push(d[i - 1] + Math.hypot(WALK[i].p[0] - WALK[i - 1].p[0], WALK[i].p[1] - WALK[i - 1].p[1]));
  return d;
})();
const WALK_LEN = WALK_SEG[WALK_SEG.length - 1];
/** Chwila dojścia do punktu i (pilot idzie ok. 4,5 m/s w czasie animacji i przystaje na 2,5 s). */
const walkT = (i: number) => WALK_SEG[i] / 4.5 + i * 2.5;
const WALK_T = walkT(WALK.length - 1) + 2;
function walkPos(t: number): { p: P2; i: number; yaw: number } {
  for (let i = 0; i < WALK.length - 1; i++) {
    const t0 = walkT(i) + 2.5;
    const t1 = walkT(i + 1);
    if (t < t0) return { p: WALK[i].p, i, yaw: 0 };
    if (t < t1) {
      const k = (t - t0) / (t1 - t0);
      const a = WALK[i].p;
      const b = WALK[i + 1].p;
      return { p: [lerp(a[0], b[0], k), lerp(a[1], b[1], k)], i, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) };
    }
  }
  return { p: WALK[WALK.length - 1].p, i: WALK.length - 1, yaw: 0 };
}
const SEG_WALK: Seg = {
  id: 'walk',
  title: 'Obchód samolotu',
  dur: WALK_T,
  clock: [40, 50],
  events: WALK.map((w, i) => [walkT(i), `Pierwszy oficer obchodzi samolot – ${w.note}.`] as Ev),
  views: [
    { cam: [-62, 12, 24], tgt: [-26, -3, 4] },
    { cam: [-14, 10, 52], tgt: [4, -3, 14] },
    { cam: [56, 12, 18], tgt: [24, -2, 0] },
    { cam: [-14, 10, -52], tgt: [4, -3, -14] },
    { cam: [-62, 12, -24], tgt: [-26, -3, -4] },
  ],
  viewAt: [
    [0, 0],
    [walkT(3) - 3, 1],
    [walkT(5) - 3, 2],
    [walkT(7) - 3, 3],
    [walkT(9) - 3, 4],
  ],
  at(t) {
    const st = turnBase();
    st.fob = FOB1;
    st.walk = t;
    st.clock = 40 + (10 * t) / WALK_T;
    return st;
  },
};

/* ----- 8. załadunek i wsiadanie ----- */
const LOAD_T = CARGO_TEND + 4;
const SEG_LOAD: Seg = {
  id: 'load',
  title: 'Załadunek i wsiadanie',
  dur: LOAD_T,
  clock: [45, 80],
  events: [
    [0, 'Kontenery z bagażem nowych pasażerów przyjeżdżają z sortowni. Kolejność i miejsce każdego kontenera wyznacza plan załadunku – od niego zależy wyważenie samolotu.'],
    [4, 'Kontenery wjeżdżają na podnośnik, potem do ładowni, gdzie jadą po rolkach na swoje miejsce i są blokowane zamkami w podłodze.'],
    [10, '„Boarding”: pasażerowie wchodzą dwoma rękawami. Najpierw osoby potrzebujące pomocy i rodziny z dziećmi, potem klasa biznes, potem kolejne strefy.'],
    [LOAD_T - 8, 'Ostatni kontener zablokowany, drzwi ładowni zamknięte. Personel liczy pasażerów i porównuje z listą – 352 osoby.'],
  ],
  views: [
    { cam: [-14, 6, -34], tgt: [-6, -3.5, -6] },
    { cam: [-46, 6, 30], tgt: [-24, -1, 4] },
    { cam: [-14, 6, -34], tgt: [-6, -3.5, -6] },
  ],
  viewAt: [
    [0, 0],
    [10, 1],
    [LOAD_T - 12, 2],
  ],
  at(t) {
    const st = turnBase();
    st.fob = FOB1;
    st.cargoT = t;
    st.pax = Math.round(352 * ramp(t, 10, LOAD_T - 8));
    st.clock = 45 + (35 * t) / LOAD_T;
    return st;
  },
};

/* ----- 9. przygotowanie do odlotu ----- */
const SEG_READY: Seg = {
  id: 'ready',
  title: 'Gotowość do odlotu',
  dur: 44,
  clock: [80, 88],
  events: [
    [0, 'Piloci uruchamiają APU – mały silnik w ogonie przejmie zasilanie i da sprężone powietrze do rozruchu silników.'],
    [5, 'Agregat zostaje odłączony i odjeżdża. Podnośniki i wózki odjechały wcześniej.'],
    [10, 'Drzwi pasażerskie zamknięte. Rękawy odjeżdżają do terminalu.'],
    [19, '„Cabin crew, arm doors and cross-check” – drzwi uzbrojone: od tej chwili otwarcie drzwi wyrzuci zjeżdżalnię.'],
    [23, 'Podjeżdża holownik. Mechanik łączy dyszel z kołem przednim i wkłada bolec wyłączający sterowanie koła (żeby pilot nie skręcał w trakcie pchania).'],
    [32, 'Kliny zabrane, pachołki zebrane. Pilot prosi o zgodę na wypchnięcie i uruchomienie silników.'],
    [38, 'Zgoda jest. Kapitan włącza czerwoną lampę BEACON – od teraz nikt nie podchodzi do samolotu bez połączenia z kokpitem.'],
  ],
  views: [
    { cam: [-62, 14, 30], tgt: [-22, -2, 2] },
    { cam: [-48, 0, 12], tgt: [-36, -4.6, 0] },
    { cam: [-70, 16, -18], tgt: [-24, -3, 0] },
  ],
  viewAt: [
    [0, 0],
    [22, 1],
    [32, 2],
  ],
  at(t) {
    const st = turnBase();
    st.fob = FOB1;
    st.pax = 352;
    st.apu = t > 1;
    st.gpu = 1 - ramp(t, 5, 11);
    st.gpuPlug = t < 5;
    const c = 1 - ramp(t, 10, 13);
    st.doors[0] = { ...CLOSED, u: c, handle: c > 0.02 ? 1 : 0 };
    st.doors[1] = { ...CLOSED, u: c, handle: c > 0.02 ? 1 : 0 };
    st.bridge = [1 - ramp(t, 13, 20), 1 - ramp(t, 12, 19)];
    const arm = ramp(t, 19, 22);
    st.doors = st.doors.map((d) => ({ ...d, lever: arm, girt: arm, ind: arm > 0.95 }));
    st.tug = ramp(t, 23, 30);
    st.towbar = t > 29;
    st.bypassPin = t > 30;
    st.chocks = 1 - ramp(t, 32, 34);
    st.cones = 1 - ramp(t, 33, 37);
    st.lights = { ...LT_OFF, nav: true, logo: true, beacon: t > 38 };
    st.ecam = 'APU';
    st.clock = 80 + (8 * t) / 44;
    st.crew = [[NOSE_X - 7, -3.5, '#f97316']];
    return st;
  },
};

/* ----- 10. wypychanie i rozruch silników ----- */
const PUSH_T = RUN_PUSH.T;
const START2 = 8;
const START1 = START2 + 26;
const DISC = PUSH_T + 4;
const SEG_PUSH: Seg = {
  id: 'push',
  title: 'Wypychanie i rozruch silników',
  dur: DISC + 22,
  clock: [88, 96],
  events: [
    [0, '„Brakes released” – kapitan zwalnia hamulec postojowy. Holownik pcha samolot tyłem od terminalu, mechanik idzie obok i rozmawia z kokpitem przez słuchawki.'],
    [START2, 'W czasie wypychania piloci uruchamiają silnik 2: powietrze z APU kręci nim, przy ok. 25% obrotów zapala się paliwo.'],
    [PUSH_T * 0.45, 'Holownik skręca, a samolot obraca się ogonem w bok – na koniec ma stać nosem wzdłuż drogi kołowania.'],
    [START1, 'Silnik 2 pracuje na biegu jałowym. Teraz rozruch silnika 1.'],
    [PUSH_T, '„Set parking brake” – samolot stoi. Mechanik odłącza dyszel i wyjmuje bolec – pokazuje go pilotom: koło przednie znów da się skręcać.'],
    [DISC + 4, 'Holownik odjeżdża. Mechanik odchodzi na bok i macha – samolot może kołować.'],
  ],
  views: [
    { cam: [-74, 22, 36], tgt: [-26, -3, 0] },
    { cam: [-56, 12, -42], tgt: [-20, -3, -4] },
    { cam: [-74, 10, 10], tgt: [-36, -4, 0] },
  ],
  viewAt: [
    [0, 0],
    [PUSH_T * 0.4, 1],
    [PUSH_T - 2, 2],
  ],
  at(t) {
    const st = parked();
    st.fob = FOB1;
    st.pax = 352;
    st.apu = true;
    st.chocks = 0;
    st.cones = 0;
    st.gpu = 0;
    st.gpuPlug = false;
    st.doors = ALL_CLOSED().map(() => armed());
    const s = RUN_PUSH.s(t);
    onRoute(st, R_PUSH, s, true);
    // dwa silniki pracują razem w modelu – rozruch pokazany jako narastające obroty
    st.n1 = 21 * ramp(t, START2 + 6, START2 + 20);
    st.tug = 1;
    st.towbar = t < PUSH_T + 2;
    st.bypassPin = t < PUSH_T + 3;
    st.lights = { ...LT_OFF, nav: true, logo: true, beacon: true };
    st.ecam = 'ENG';
    st.clock = 88 + (8 * t) / (DISC + 22);
    st.crew = [[NOSE_X - 6, t < PUSH_T + 4 ? -5 : lerp(-5, -18, ramp(t, DISC + 4, DISC + 10)), '#f97316']];
    return st;
  },
};
/** Ostatnia chwila wypychania (holownik odjechał) – początek kołowania. */
const pushEnd = () => SEG_PUSH.at(SEG_PUSH.dur);

/* ----- 11. kołowanie ----- */
const HOLD_T = RUN_HOLD.T;
const WAIT = 7;
const LINE_T = HOLD_T + WAIT + RUN_LINE.T;
const SEG_TAXI: Seg = {
  id: 'taxi',
  title: 'Kołowanie do pasa',
  dur: LINE_T + 3,
  clock: [96, 106],
  events: [
    [0, 'Zgoda na kołowanie do pasa 27R. Światło kołowania włączone, samolot rusza – kapitan steruje kołem przednim małym kółkiem (tiller).'],
    [6, 'W czasie kołowania pierwszy oficer ustawia klapy do startu (1+F) – sloty i klapy wysuwają się.'],
    [16, 'Sprawdzenie sterów: drążek do oporu w każdą stronę, pedały w lewo i w prawo – pilot patrzy na ekran, czy lotki, spojlery i stery chodzą swobodnie.'],
    [HOLD_T - 6, 'Samolot zatrzymuje się przed punktem oczekiwania – czerwone światła i podwójna linia przed pasem. Bez zgody nie wolno jej przekroczyć.'],
    [HOLD_T + WAIT - 1, '„Line up and wait”, a zaraz potem zgoda na start. Stroboskopy i reflektory włączone – samolot wjeżdża na pas i ustawia się na osi.'],
  ],
  views: [
    { cam: [34, 14, 34], tgt: [-6, -3, 0] },
    { cam: [-24, 4, 34], tgt: [6, -2, 14] },
    { cam: [-66, 16, 30], tgt: [-26, -3, 0] },
    { cam: [38, 6, 24], tgt: [-10, -3, 0] },
  ],
  viewAt: [
    [0, 0],
    [14, 1],
    [HOLD_T - 10, 2],
    [HOLD_T + WAIT, 3],
  ],
  at(t) {
    const st = pushEnd();
    st.tug = 0;
    st.towbar = false;
    st.bypassPin = false;
    st.crew = [];
    let s: number;
    if (t < HOLD_T) s = RUN_HOLD.s(t);
    else if (t < HOLD_T + WAIT) s = S_HOLD;
    else s = RUN_LINE.s(t - HOLD_T - WAIT);
    onRoute(st, R_TAXI, s);
    st.roll += 200;
    const moving = t < HOLD_T ? RUN_HOLD.v(t) : t > HOLD_T + WAIT ? RUN_LINE.v(t - HOLD_T - WAIT) : 0;
    st.n1 = 21 + (moving > 0.2 && moving < 4 ? 3 : 0);
    st.mech = lerpMech(MECH0, MECH_TO, ramp(t, 6, 12));
    // sprawdzenie sterów: lotki w obie strony, ster wysokości, ster kierunku
    st.surf = {
      aileron: span(t, 16, 19, 1) * 1 - span(t, 19, 22, 1),
      elevator: span(t, 22, 25, 1) * -1 + span(t, 25, 28, 1),
      rudder: span(t, 28, 31, 1) - span(t, 31, 34, 1),
    };
    st.spoiler = span(t, 16, 19, 1);
    const lined = t > HOLD_T + WAIT - 1;
    st.lights = { ...LT_OFF, nav: true, logo: true, beacon: true, taxi: !lined, turnoff: t < HOLD_T, strobe: lined, land: lined, to: lined };
    st.ecam = 'WHEEL';
    st.ias = moving * 1.944;
    st.clock = 96 + (10 * t) / (LINE_T + 3);
    return st;
  },
};

/* ----- 12. start ----- */
/** Rozbieg: przyspieszenie ok. 2 m/s², VR 150 kt (77 m/s), oderwanie ok. 3 s po rotacji. */
const TO_A = 2.0;
const T_THR = 3;
const T_VR = T_THR + 77 / TO_A;
const T_LOF = T_VR + 3.2;
const S_LINE_U = at(R_TAXI, S_LINE).u;
const toDist = (t: number) => (t < T_THR ? 0 : 0.5 * TO_A * (t - T_THR) ** 2);
const toSpeed = (t: number) => (t < T_THR ? 0 : Math.min(85, TO_A * (t - T_THR)));
const SEG_TAKEOFF: Seg = {
  id: 'takeoff',
  title: 'Start',
  dur: T_LOF + 18,
  clock: [106, 108],
  events: [
    [0, 'Samolot stoi na osi pasa 27R. Kapitan przesuwa dźwignie ciągu do położenia FLX – silniki rozpędzają się do mocy startowej.'],
    [T_THR + 8, '„Hundred knots” – 185 km/h. Piloci sprawdzają, czy oba wskaźniki prędkości pokazują to samo.'],
    [T_VR - 3, '„V1” – od tej chwili start trzeba dokończyć, nawet gdyby zepsuł się silnik.'],
    [T_VR, '„Rotate” – pilot ciągnie drążek do siebie, nos się unosi do ok. 15°.'],
    [T_LOF, 'Samolot odrywa się od pasa przy ok. 300 km/h.'],
    [T_LOF + 3, '„Positive climb, gear up” – podwozie chowa się w niecałe 10 s, drzwi wnęk zamykają się.'],
  ],
  views: [
    { cam: [-30, 4, 24], tgt: [-8, -2, 0] },
    { cam: [48, 6, 30], tgt: [0, -2, 0] },
    { cam: [16, -10, 38], tgt: [0, -3, 0] },
  ],
  viewAt: [
    [0, 0],
    [T_THR + 10, 1],
    [T_LOF + 1, 2],
  ],
  at(t) {
    const st = SEG_TAXI.at(SEG_TAXI.dur);
    const d = toDist(t);
    st.u = S_LINE_U + d + (t > T_LOF ? 0 : 0);
    st.v = 0;
    st.psi = 0;
    st.steer = 0;
    st.roll = 2000 + d;
    const air = t > T_LOF;
    const ta = t - T_LOF;
    st.pitch = t < T_VR ? 0 : Math.min(15, (t - T_VR) * 3.2);
    st.h = air ? 0.5 * 1.6 * Math.min(ta, 6) ** 2 * 0.6 + Math.max(0, ta - 6) * 10.5 : 0;
    st.gearUp = ramp(t, T_LOF + 3.5, T_LOF + 12);
    st.n1 = 21 + 67 * ramp(t, 0.5, T_THR + 3);
    st.mech = MECH_TO;
    st.lights = { ...LT_OFF, nav: true, logo: true, beacon: true, strobe: true, land: true, to: t < T_LOF + 6, taxi: false };
    st.ecam = 'ENG';
    st.flight = air;
    st.ias = toSpeed(t) * 1.944 + (air ? ta * 0.8 : 0);
    st.vs = air ? Math.min(2400, ta * 400) : 0;
    st.altFt = st.h * 3.281;
    st.clock = 106 + (2 * t) / (T_LOF + 18);
    return st;
  },
};
const takeoffEnd = () => SEG_TAKEOFF.at(SEG_TAKEOFF.dur);

/* ----- 13. lot ----- */
const FLY_T = 56;
/** Profil lotu w przyspieszeniu: wznoszenie, przelot, zniżanie (wysokość w stopach). */
const flyAlt = (t: number) => (t < 14 ? lerp(1500, 37000, sm(t / 14)) : t < 34 ? 37000 : lerp(37000, 2200, sm((t - 34) / 18)));
const SEG_FLY: Seg = {
  id: 'fly',
  title: 'Wznoszenie, przelot i zniżanie',
  dur: FLY_T,
  clock: [108, 108 + 7 * 60],
  events: [
    [0, 'Ok. 450 m nad lotniskiem dźwignie ciągu idą do CL, autociąg zmniejsza moc do wznoszenia. Samolot przyspiesza, klapy chowane są stopniowo do 0.'],
    [5, 'Autopilot prowadzi samolot po trasie z planu lotu. Wznoszenie na wysokość przelotu trwa ok. 20–25 minut.'],
    [14, 'Przelot na ok. 11 km (FL370) z prędkością ok. 0,85 Macha (ok. 900 km/h względem powietrza). Piloci pilnują paliwa, pogody i łączności.'],
    [34, 'Ok. 200 km przed lotniskiem zaczyna się zniżanie: silniki prawie na biegu jałowym, samolot „szybuje” w dół.'],
    [46, 'Podejście: klapy wysuwane stopniowo, ok. 600 m nad ziemią podwozie w dół, potem klapy FULL i reflektory lądowania.'],
  ],
  views: [
    { cam: [44, 10, 46], tgt: [0, -1, 0] },
    { cam: [-60, 14, 32], tgt: [0, 0, 0] },
    { cam: [30, 6, -50], tgt: [0, -1, 0] },
  ],
  viewAt: [
    [0, 0],
    [14, 1],
    [36, 2],
  ],
  at(t) {
    const st = takeoffEnd();
    st.h = 600;
    st.u = 1e6;
    st.flight = true;
    st.gearUp = 1 - ramp(t, 46, 52);
    st.mech = t < 30 ? lerpMech(MECH_TO, MECH0, ramp(t, 1, 6)) : lerpMech(MECH0, MECH_LDG, ramp(t, 44, 54));
    st.pitch = t < 14 ? 7 : t < 34 ? 2.4 : t < 46 ? 0.5 : 2.5;
    st.n1 = t < 14 ? 84 : t < 34 ? 82 : t < 46 ? 30 : 48;
    st.altFt = flyAlt(t);
    st.vs = t < 14 ? 2200 : t < 34 ? 0 : -1900;
    st.ias = t < 14 ? lerp(180, 290, ramp(t, 0, 8)) : t < 34 ? 270 : t < 46 ? 290 : lerp(290, 140, ramp(t, 44, 54));
    const hi = st.altFt > 10000;
    st.lights = { ...LT_OFF, nav: true, logo: !hi, beacon: true, strobe: true, land: !hi, to: false };
    st.ecam = 'CRUISE';
    st.clock = 108 + 7 * 60 * (t / FLY_T);
    return st;
  },
};

/* ----- 14. podejście i lądowanie ----- */
const APP_U0 = 450 - 183 / Math.tan(3 * DEG);
const APP_V = 72;
const T_FLARE = (420 - 9 / Math.tan(3 * DEG) - APP_U0) / APP_V;
const T_TD = T_FLARE + 6;
const SEG_LAND: Seg = {
  id: 'land',
  title: 'Podejście i lądowanie',
  dur: T_TD + 7,
  clock: [528, 531],
  events: [
    [0, 'Samolot na prostej do pasa 27R, ok. 180 m nad ziemią. Autopilot leci po wiązce ILS: kurs na oś pasa i ścieżka zniżania 3°. Podwozie wypuszczone, klapy FULL.'],
    [T_FLARE - 10, 'Ok. 60 m – „Minimum”. Piloci widzą pas, decyzja: lądujemy.'],
    [T_FLARE, 'Ok. 9 m nad pasem – wyrównanie (flare): nos lekko w górę, opadanie zwalnia. „Retard” – dźwignie ciągu na bieg jałowy.'],
    [T_TD, 'Przyziemienie! Spojlery wysuwają się same, włącza się autobrake, a pilot wybiera ciąg wsteczny.'],
  ],
  views: [
    { cam: [34, 4, 44], tgt: [0, -2, 0] },
    { cam: [-60, -3, 22], tgt: [0, -3, 0] },
    { cam: [26, -3.5, 26], tgt: [-4, -4, 0] },
  ],
  viewAt: [
    [0, 0],
    [T_FLARE - 14, 1],
    [T_FLARE - 2, 2],
  ],
  at(t) {
    const st = SEG_FLY.at(FLY_T);
    st.flight = t < T_TD;
    st.gearUp = 0;
    st.mech = MECH_LDG;
    const gs = t < T_FLARE ? APP_V : APP_V - (t - T_FLARE) * 0.5;
    const u = t < T_FLARE ? APP_U0 + APP_V * t : APP_U0 + APP_V * T_FLARE + (APP_V - 0.25 * (t - T_FLARE)) * (t - T_FLARE);
    st.u = t < T_TD ? u : 450 + RUN_ROLL.s(t - T_TD) - S_TD;
    st.v = 0;
    st.psi = 0;
    const hGlide = Math.max(0, (420 - st.u) * Math.tan(3 * DEG));
    st.h = t < T_FLARE ? hGlide : t < T_TD ? 9 * (1 - sm((t - T_FLARE) / 6)) : 0;
    st.pitch = t < T_FLARE ? 2.5 : t < T_TD ? lerp(2.5, 5.5, ramp(t, T_FLARE, T_TD - 1)) : Math.max(0, 5.5 - (t - T_TD - 1) * 1.3);
    st.n1 = t < T_FLARE + 1 ? 48 : t < T_TD + 1 ? 21 : t < T_TD + 3 ? 21 + 49 * ramp(t, T_TD + 1, T_TD + 3) : 70;
    st.rev = ramp(t, T_TD + 0.6, T_TD + 2.2);
    st.spoiler = ramp(t, T_TD + 0.2, T_TD + 1.2);
    st.roll = 5000 + (t > T_TD ? RUN_ROLL.s(t - T_TD) : 0);
    st.lights = { ...LT_OFF, nav: true, logo: true, beacon: true, strobe: true, land: true, to: true };
    st.ecam = 'WHEEL';
    st.ias = (t < T_TD ? gs : RUN_ROLL.v(t - T_TD)) * 1.944;
    st.vs = t < T_FLARE ? -720 : t < T_TD ? -180 : 0;
    st.altFt = st.h * 3.281;
    st.clock = 528 + (3 * t) / (T_TD + 7);
    return st;
  },
};

/* ----- 15. dobieg i zjazd z pasa ----- */
const ROLL_T0 = 7;
const SEG_ROLL: Seg = {
  id: 'roll',
  title: 'Dobieg i zjazd z pasa',
  dur: RUN_ROLL.T - ROLL_T0,
  clock: [531, 532],
  events: [
    [0, 'Odwracacze ciągu i hamulce (autobrake) wytracają prędkość. Koło przednie już na pasie.'],
    [8, '„70 knots” – ok. 130 km/h: pilot zmniejsza ciąg wsteczny do biegu jałowego i chowa odwracacze.'],
    [16, 'Samolot zwalnia do prędkości zjazdu. Zjazd szybki (łagodny łuk) pozwala opuścić pas, zanim samolot się zatrzyma.'],
    [RUN_ROLL.T - ROLL_T0 - 9, 'Samolot zjeżdża z pasa. Spojlery schowane, klapy chowane, stroboskopy i reflektory lądowania gasną, włączają się światła kołowania.'],
    [RUN_ROLL.T - ROLL_T0 - 3, 'Pas jest wolny – cykl się zamyka. Samolot kołuje na stanowisko, a wszystko zaczyna się od nowa.'],
  ],
  views: [
    { cam: [30, 6, 34], tgt: [-6, -3, 0] },
    { cam: [-46, 18, -34], tgt: [-14, -3, -4] },
  ],
  viewAt: [
    [0, 0],
    [RUN_ROLL.T - ROLL_T0 - 12, 1],
  ],
  at(t) {
    const st = SEG_LAND.at(SEG_LAND.dur);
    const tt = t + ROLL_T0;
    const s = RUN_ROLL.s(tt);
    onRoute(st, R_IN, s);
    st.roll = 5000 + s;
    st.h = 0;
    st.pitch = 0;
    st.flight = false;
    st.rev = 1 - ramp(t, 8, 11);
    st.n1 = t < 8 ? 70 : 21;
    const vac = s > S_VAC - 40;
    st.spoiler = 1 - ramp(t, RUN_ROLL.T - ROLL_T0 - 10, RUN_ROLL.T - ROLL_T0 - 7);
    st.mech = lerpMech(MECH_LDG, MECH0, ramp(t, RUN_ROLL.T - ROLL_T0 - 9, RUN_ROLL.T - ROLL_T0 - 2));
    st.lights = { ...LT_OFF, nav: true, logo: true, beacon: true, strobe: !vac, land: !vac, to: !vac, taxi: vac, turnoff: true };
    st.ecam = 'WHEEL';
    st.ias = RUN_ROLL.v(tt) * 1.944;
    st.altFt = 0;
    st.vs = 0;
    st.clock = 531 + t / 30;
    return st;
  },
};

export const SEGS: Seg[] = [SEG_ARRIVE, SEG_SECURE, SEG_BRIDGE, SEG_UNLOAD, SEG_SERVICE, SEG_FUEL, SEG_WALK, SEG_LOAD, SEG_READY, SEG_PUSH, SEG_TAXI, SEG_TAKEOFF, SEG_FLY, SEG_LAND, SEG_ROLL];
/** Początki odcinków na wspólnej osi czasu i długość całego cyklu (s). */
const SEG_T0 = SEGS.reduce<number[]>((a, _, i) => [...a, i ? a[i - 1] + SEGS[i - 1].dur : 0], []);
const TOTAL = SEG_T0[SEGS.length - 1] + SEGS[SEGS.length - 1].dur;
/** Odcinek i czas w nim z czasu cyklu (cykl się zapętla: po zjeździe z pasa – znowu wjazd na stanowisko). */
function segAt(T: number): { i: number; t: number } {
  const x = ((T % TOTAL) + TOTAL) % TOTAL;
  for (let i = SEGS.length - 1; i >= 0; i--) if (x >= SEG_T0[i]) return { i, t: Math.min(SEGS[i].dur, x - SEG_T0[i]) };
  return { i: 0, t: 0 };
}

/* ---------- dymki: przy miejscu, w którym dzieje się opisywana rzecz ---------- */

/**
 * Punkt dymka: w układzie samolotu albo stanowiska (gate – rzeczy stojące na płycie), stały albo ruchomy, oraz ujęcie
 * kamery na to miejsce: kierunek od punktu do kamery (układ samolotu) i odległość. dir === 'out' – kamera od strony
 * zewnętrznej (od osi samolotu na zewnątrz), np. przy pilocie na obchodzie.
 */
type Anchor = { p: V3 | ((st: CycSt) => V3); gate?: boolean; dir: V3 | 'out'; d: number };
const sillUp = (i: number, side = 1): V3 => {
  const x = PAX_DOOR.xs[i];
  const q = fusPt(x, fusTheta(x, FLOOR + 1.6), 0.4);
  return [q[0], q[1] + 0.6, q[2] * side];
};
const ANCH: Record<string, Anchor> = {
  cockpit: { p: [-35.2, 2.2, 1.2], dir: [-1, 0.4, 0.55], d: 24 },
  beacon: { p: [-6, 3.6, 0], dir: [0.35, 0.75, 0.6], d: 55 },
  nose: { p: [NOSE_X - 1.5, G + 2.4, 0], dir: [-0.75, 0.25, 0.6], d: 17 },
  lead: { p: [NOSE_X - 9, G + 0.8, 0], dir: [-0.2, 0.75, 0.65], d: 42 },
  board: { p: [-47.6, G + 12.4, 0], gate: true, dir: [1, 0.25, 0.45], d: 38 },
  cones: { p: [ENG_POS[0] - 3.2, G + 1.4, -ENG_POS[2]], gate: true, dir: [-0.45, 0.7, -0.6], d: 42 },
  gpu: { p: [-33.5, G + 2.4, -4.6], gate: true, dir: [-0.6, 0.45, -0.75], d: 16 },
  mlg: { p: [MLG.x, G + 2.6, -MLG.z - 1], dir: [0.15, 0.2, -1], d: 17 },
  door1L: { p: sillUp(0), dir: [0.15, 0.3, 1], d: 22 },
  door2L: { p: sillUp(1), dir: [0.35, 0.35, 1], d: 24 },
  cargoF: { p: [CARGO_DOORS[0], -1.2, -4.2], dir: [0.25, 0.35, -1], d: 26 },
  cargoA: { p: [CARGO_DOORS[1], -1.4, -4.2], dir: [-0.25, 0.35, -1], d: 26 },
  cat1R: { p: sillUp(0, -1), dir: [-0.25, 0.25, -1], d: 24 },
  cat4R: { p: sillUp(3, -1), dir: [0.3, 0.25, -1], d: 24 },
  lav: { p: [26, G + 3.2, -7], gate: true, dir: [0.5, 0.3, -1], d: 20 },
  water: { p: [-22, G + 3.2, -7], gate: true, dir: [-0.5, 0.3, -1], d: 20 },
  fuel: { p: [REFUEL_LAY.cpl[0], REFUEL_LAY.cpl[1] + 0.6, REFUEL_LAY.cpl[2]], gate: true, dir: [-0.75, 0.25, -0.8], d: 17 },
  walker: { p: (st) => { const w = walkPos(st.walk ?? 0); return [w.p[0], G + 2.4, w.p[1]]; }, gate: true, dir: 'out', d: 15 },
  apu: { p: [34.5, 1.6, 0], dir: [0.85, 0.35, 0.55], d: 24 },
  tug: { p: [NOSE_X - 9, G + 3, 0], dir: [-0.8, 0.45, -0.55], d: 30 },
  engL: { p: [ENG_POS[0] - 1, ENG_POS[1] + 2, ENG_POS[2]], dir: [-0.75, 0.25, 0.75], d: 19 },
  engR: { p: [ENG_POS[0] - 1, ENG_POS[1] + 2, -ENG_POS[2]], dir: [-0.75, 0.25, -0.75], d: 19 },
  flaps: { p: [9, 0.4, 14], dir: [0.75, 0.55, 0.55], d: 24 },
  wing: { p: [6, 0.6, 24], dir: [0.3, 0.65, 0.9], d: 40 },
  plane: { p: [-14, 5, 0], dir: [0.6, 0.3, 0.8], d: 95 },
};
/** Punkt dymka każdego zdarzenia (w kolejności zdarzeń odcinka). */
const ANCHORS: Record<string, string[]> = {
  arrive: ['cockpit', 'nose', 'lead', 'board', 'cockpit'],
  secure: ['cockpit', 'beacon', 'nose', 'cones', 'gpu', 'cockpit'],
  bridge: ['door1L', 'door1L', 'door2L', 'door1L', 'door2L', 'door1L'],
  unload: ['cargoF', 'cargoF', 'cargoA', 'cargoA'],
  service: ['door1L', 'cat1R', 'cat4R', 'lav', 'water', 'cat1R'],
  fuel: ['cockpit', 'fuel', 'fuel', 'fuel', 'cockpit'],
  walk: WALK.map(() => 'walker'),
  load: ['cargoF', 'cargoA', 'door2L', 'door1L'],
  ready: ['apu', 'gpu', 'door1L', 'door2L', 'tug', 'nose', 'beacon'],
  push: ['tug', 'engR', 'tug', 'engL', 'nose', 'tug'],
  taxi: ['nose', 'flaps', 'wing', 'nose', 'cockpit'],
  takeoff: ['engL', 'cockpit', 'cockpit', 'nose', 'mlg', 'mlg'],
  fly: ['engL', 'plane', 'plane', 'engL', 'mlg'],
  land: ['cockpit', 'cockpit', 'nose', 'mlg'],
  roll: ['engL', 'engL', 'mlg', 'flaps', 'plane'],
};
/** Punkt stanowiska (układ samolotu zaparkowanego) w układzie samolotu w jego bieżącym położeniu na lotnisku. */
function gateToPlane(p: V3, st: CycSt): V3 {
  // stanowisko → lotnisko (x = −u, z = v) → układ samolotu (przesunięcie i obrót o kurs)
  const c = Math.cos(GATE_PSI);
  const sn = Math.sin(GATE_PSI);
  const X = -GATE.u + c * p[0] + sn * p[2];
  const Z = GATE.v - sn * p[0] + c * p[2];
  const dx = X + st.u;
  const dz = Z - st.v;
  const c2 = Math.cos(-st.psi);
  const s2 = Math.sin(-st.psi);
  return [c2 * dx + s2 * dz, p[1] - st.h, -s2 * dx + c2 * dz];
}
/** Położenie punktu dymka w układzie samolotu. */
function anchorPos(a: Anchor, st: CycSt): V3 {
  const p = typeof a.p === 'function' ? a.p(st) : a.p;
  return a.gate ? gateToPlane(p, st) : p;
}
/** Ujęcie kamery na zdarzenie: z kierunku i odległości punktu; przy stanowisku – przed fasadą terminalu i nad płytą. */
function anchorView(a: Anchor, st: CycSt): { cam: V3; tgt: V3 } {
  const t = anchorPos(a, st);
  let d: V3;
  if (a.dir === 'out') {
    const l = Math.hypot(t[0] * 0.4, t[2]) || 1;
    d = [(t[0] * 0.4) / l, 0.55, t[2] / l];
  } else d = a.dir;
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  const cam: V3 = [t[0] + (d[0] / l) * a.d, Math.max(G + 1.5 - st.h, t[1] + (d[1] / l) * a.d), t[2] + (d[2] / l) * a.d];
  const parked = st.h === 0 && Math.hypot(st.u - GATE.u, st.v - GATE.v) < 80;
  if (parked && cam[0] < -43) cam[0] = -43;
  return { cam, tgt: t };
}

/** Bieżące zdarzenie odcinka: tekst i punkt dymka. */
function eventAt(i: number, t: number): { k: number; text: string; a: Anchor } {
  const list = SEGS[i].events;
  let k = 0;
  list.forEach(([tt], j) => {
    if (t >= tt) k = j;
  });
  const key = ANCHORS[SEGS[i].id]?.[k] ?? 'plane';
  return { k, text: list[k]?.[1] ?? '', a: ANCH[key] ?? ANCH.plane };
}
/* ======================= sterowanie modelem ======================= */

/** Wspólny stan (obiekty zmieniane co klatkę, czytane przez model samolotu). */
function useLive() {
  return useMemo(
    () => ({
      st: parked(),
      gear: newGearDrive(),
      power: { n1: 0, rev: 0 },
      mech: { ...MECH0 },
      surf: { aileron: 0, elevator: 0, rudder: 0, spoiler: 0 },
      ext: newExtLights(false),
    }),
    [],
  );
}
type Live = ReturnType<typeof useLive>;

function applyLive(L: Live, st: CycSt) {
  L.st = st;
  const g = L.gear;
  g.retract = st.gearUp;
  g.extend = st.h > 0 ? Math.min(0.46, st.h * 1.2) : 0;
  g.steer = st.steer;
  g.spin = st.roll;
  g.noseSpin = st.roll;
  g.lift = 0;
  g.lights = st.lights.taxi || st.lights.to;
  L.power.n1 = st.n1;
  L.power.rev = st.rev;
  Object.assign(L.mech, st.mech);
  L.surf.aileron = st.surf.aileron;
  L.surf.elevator = st.surf.elevator;
  L.surf.rudder = st.surf.rudder;
  L.surf.spoiler = st.spoiler;
  Object.assign(L.ext, st.lights);
}

/* ======================= świat: lotnisko i stanowisko ======================= */

/** Układ stanowiska (samolot zaparkowany) w układzie lotniska (x = −u, z = v). */
function GateFrame({ children }: { children: ReactNode }) {
  return (
    <group position={[-GATE.u, 0, GATE.v]} rotation={[0, GATE_PSI, 0]}>
      {children}
    </group>
  );
}

/** Ruchomy świat: lotnisko przesunięte i obrócone tak, że samolot stoi w środku sceny. */
function MovingWorld({ live, children }: { live: Live; children: ReactNode }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  useFrame(() => {
    const st = live.st;
    const far = st.u > 1e5;
    if (outer.current) {
      outer.current.rotation.y = -st.psi;
      outer.current.visible = !far && st.h < 900;
    }
    if (inner.current) inner.current.position.set(st.u, -st.h, -st.v);
  });
  return (
    <group ref={outer}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

/* ---------- tablica dokowania (VDGS) ---------- */
function DockingBoard({ live }: { live: Live }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, t, last: '' };
  }, []);
  useFrame(() => {
    const st = live.st;
    const d = Math.hypot(st.u - GATE.u, st.v - GATE.v);
    const near = d < 60 && st.h === 0;
    const key = near ? (d < 0.4 ? 'STOP' : `${Math.ceil(d)}`) : 'A350';
    if (key === tex.last) return;
    tex.last = key;
    const x = tex.c.getContext('2d')!;
    x.fillStyle = '#05070a';
    x.fillRect(0, 0, 256, 160);
    x.textAlign = 'center';
    x.fillStyle = key === 'STOP' ? '#ff3b30' : '#ffb000';
    x.font = 'bold 54px Consolas, monospace';
    x.fillText(key === 'STOP' ? 'STOP' : key === 'A350' ? 'A350' : `${key} m`, 128, 80);
    x.font = 'bold 26px Consolas, monospace';
    x.fillStyle = '#ffb000';
    x.fillText(key === 'A350' ? '-1000' : key === 'STOP' ? 'OK' : '▼', 128, 130);
    tex.t.needsUpdate = true;
  });
  return (
    <mesh position={[-GATE.u, G + 11, -319.7]} raycast={() => null}>
      <planeGeometry args={[3.2, 2]} />
      <meshBasicMaterial map={tex.t} toneMapped={false} />
    </mesh>
  );
}

/* ======================= pojazdy i urządzenia (układ stanowiska) ======================= */

const doorSill = (i: number): V3 => {
  const x = PAX_DOOR.xs[i];
  return fusPt(x, fusTheta(x, FLOOR + 0.02), 0);
};
/** Rękaw: rotunda przy terminalu, teleskopowy tunel, kabina z miechem przy drzwiach. */
const BRIDGE_ROT: V3[] = [
  [-44.5, G + 5.2, 9],
  [-44.5, G + 5.2, 21],
];
/** Ustawia grupę tunelu między punktami a i b: środek, obrót wzdłuż odcinka (oś z grupy), długość jako skala dziecka. */
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
function spanGroup(g: THREE.Group, body: THREE.Group, a: V3, b: V3) {
  tmpA.set(...a);
  tmpB.set(...b);
  g.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
  g.lookAt(tmpB);
  body.scale.z = tmpA.distanceTo(tmpB);
}
/** Segment tunelu rękawu: blaszana rura z żebrami, pasem okien po obu bokach i dachem (długość 1 – skalowana). */
function TunnelBody({ w, h, color }: { w: number; h: number; color: string }) {
  return (
    <>
      <mesh>
        <boxGeometry args={[w, h, 1]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.35} />
      </mesh>
      {[1, -1].map((sd) => (
        <mesh key={sd} position={[(sd * w) / 2 + sd * 0.005, 0.25, 0]}>
          <boxGeometry args={[0.01, h * 0.32, 0.96]} />
          <meshStandardMaterial color="#2d4256" roughness={0.1} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, h / 2 + 0.04, 0]}>
        <boxGeometry args={[w * 0.92, 0.08, 1]} />
        <meshStandardMaterial color="#8f979f" roughness={0.6} />
      </mesh>
    </>
  );
}
/**
 * Rękaw (most pasażerski): rotunda na słupie przy terminalu, dwa teleskopowe segmenty tunelu (zewnętrzny nasuwa się
 * na wewnętrzny), wózek jezdny z kołami na podporze z siłownikami wysokości i kabina operatora z przeszkleniem
 * i miechem, który przylega do kadłuba przy drzwiach.
 */
function JetBridge({ i, get }: { i: number; get: () => number }) {
  const sill = useMemo(() => doorSill(i), [i]);
  const dock: V3 = [sill[0], sill[1] - 0.15, sill[2] + 2.0];
  const park: V3 = [BRIDGE_ROT[i][0] + 8, G + 4.6, BRIDGE_ROT[i][2] + 7 + i * 3];
  const R = BRIDGE_ROT[i];
  const segA = useRef<THREE.Group>(null);
  const segAb = useRef<THREE.Group>(null);
  const segB = useRef<THREE.Group>(null);
  const segBb = useRef<THREE.Group>(null);
  const cab = useRef<THREE.Group>(null);
  const leg = useRef<THREE.Group>(null);
  const legCol = useRef<THREE.Mesh>(null);
  const bel = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = sm(get());
    const c = lerp3(park, dock, k);
    const root: V3 = [R[0] + 2.2, R[1] + 1.3, R[2]];
    const back: V3 = [c[0] - 0.1, c[1] + 1.3, c[2] + 2.6];
    const midA = lerp3(root, back, 0.56);
    if (segA.current && segAb.current) spanGroup(segA.current, segAb.current, root, midA);
    if (segB.current && segBb.current) spanGroup(segB.current, segBb.current, lerp3(root, back, 0.42), back);
    if (cab.current) {
      cab.current.position.set(c[0], c[1], c[2]);
      cab.current.rotation.y = lerp(0.55, 0, k);
    }
    // podpora z wózkiem jezdnym pod zewnętrznym segmentem
    const lp = lerp3(midA, back, 0.55);
    if (leg.current) {
      leg.current.position.set(lp[0], G, lp[2]);
      leg.current.rotation.y = Math.atan2(back[0] - root[0], back[2] - root[2]);
    }
    if (legCol.current) {
      const hgt = lp[1] - 1.4 - G - 0.9;
      legCol.current.scale.y = hgt;
      legCol.current.position.y = 0.9 + hgt / 2;
    }
    if (bel.current) bel.current.scale.z = 0.35 + 0.65 * clamp01((k - 0.88) * 9);
  });
  const C = '#c3c9cf';
  return (
    <group>
      {/* rotunda: okrągła, z dachem i oknami, na słupie */}
      <mesh position={[R[0], R[1] + 1.3, R[2]]}>
        <cylinderGeometry args={[2.4, 2.4, 3.2, 28]} />
        <meshStandardMaterial color={C} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[R[0], R[1] + 1.55, R[2]]}>
        <cylinderGeometry args={[2.42, 2.42, 1, 28, 1, true]} />
        <meshStandardMaterial color="#2d4256" roughness={0.1} metalness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[R[0], R[1] + 3.0, R[2]]}>
        <cylinderGeometry args={[2.7, 2.7, 0.25, 28]} />
        <meshStandardMaterial color="#8f979f" />
      </mesh>
      <mesh position={[R[0], (G + R[1]) / 2, R[2]]}>
        <cylinderGeometry args={[0.55, 0.7, R[1] - G, 14]} />
        <meshStandardMaterial color="#6b7280" roughness={0.7} />
      </mesh>
      {/* tunel: segment wewnętrzny (węższy) i zewnętrzny */}
      <group ref={segA}>
        <group ref={segAb}>
          <TunnelBody w={2.8} h={2.7} color={C} />
        </group>
      </group>
      <group ref={segB}>
        <group ref={segBb}>
          <TunnelBody w={3.1} h={3.0} color="#d0d6dc" />
        </group>
      </group>
      {/* podpora z siłownikami i wózek jezdny */}
      <group ref={leg}>
        <mesh ref={legCol}>
          <boxGeometry args={[0.45, 1, 0.45]} />
          <meshStandardMaterial color="#5b636c" metalness={0.4} />
        </mesh>
        {[-0.5, 0.5].map((dx) => (
          <mesh key={dx} position={[dx, 2.4, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 3.2, 8]} />
            <meshStandardMaterial color="#d1d5db" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[3.8, 0.45, 1.1]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
        <HazardPlate p={[0, 0.55, 0.56]} s={[3.8, 0.3, 0.02]} rep={8} />
        {[-1.5, 1.5].map((dx) => (
          <GseWheel key={dx} p={[dx, 0.5, 0]} r={0.5} w={0.4} />
        ))}
      </group>
      {/* kabina rękawu: przeszklona z boków, z miechem od strony kadłuba i daszkiem */}
      <group ref={cab}>
        <mesh position={[0, 1.3, 0.9]}>
          <boxGeometry args={[3.6, 2.8, 3.4]} />
          <meshStandardMaterial color="#dde2e7" roughness={0.45} />
        </mesh>
        {[1, -1].map((sd) => (
          <mesh key={sd} position={[sd * 1.81, 1.6, 0.9]} rotation={[0, sd * (Math.PI / 2), 0]}>
            <planeGeometry args={[2.8, 1.1]} />
            <meshStandardMaterial color="#2d4256" roughness={0.1} metalness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 2.85, 0.5]}>
          <boxGeometry args={[3.9, 0.18, 4]} />
          <meshStandardMaterial color="#8f979f" />
        </mesh>
        {/* miech: kilka fałd, przy dokowaniu wysuwa się do kadłuba */}
        <group ref={bel} position={[0, 1.25, -0.8]}>
          {[0, 1, 2, 3].map((f) => (
            <mesh key={f} position={[0, 0, -0.18 * f]}>
              <boxGeometry args={[2.9 - f * 0.05, 2.6 - f * 0.05, 0.16]} />
              <meshStandardMaterial color={f % 2 ? '#2a2f35' : '#1b1f24'} roughness={0.95} />
            </mesh>
          ))}
        </group>
        <HazardPlate p={[0, -0.05, -0.75]} s={[3.4, 0.14, 0.05]} rep={7} />
      </group>
    </group>
  );
}

/** Holownik do wypychania (bez dyszla: niski, szeroki, kabina z boku) i dyszel do koła przedniego. */
function PushTug({ get, bar }: { get: () => { k: number; steer: number }; bar: () => boolean }) {
  const grp = useRef<THREE.Group>(null);
  const towbar = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const { k, steer } = get();
    const g = grp.current;
    if (!g) return;
    g.visible = k > 0.001;
    // położenie przy kole przednim: z daleka (podjazd) do dyszla przypiętego do koła; skręt holownika jak koła
    const hook: V3 = [NOSE_X - 0.9, G + 0.5, 0];
    const len = 6.5;
    const tx = hook[0] - Math.cos(steer) * (len + 3.6);
    const tz = hook[2] + Math.sin(steer) * (len + 3.6);
    const far: V3 = [NOSE_X - 46, 0, -22];
    const e = sm(k);
    g.position.set(lerp(far[0], tx, e), 0, lerp(far[2], tz, e));
    g.rotation.y = lerp(0.9, -steer, e);
    if (towbar.current) {
      towbar.current.visible = bar();
      if (bar()) placeBetween(towbar.current, [tx + Math.cos(steer) * 3.6, G + 0.55, tz - Math.sin(steer) * 3.6], hook);
    }
  });
  const yel = '#f4c20d';
  return (
    <>
      <group ref={grp} visible={false}>
        <mesh position={[0, G + 0.85, 0]}>
          <boxGeometry args={[7.2, 1.1, 3.6]} />
          <meshStandardMaterial color={yel} roughness={0.5} />
        </mesh>
        <mesh position={[-1.6, G + 1.75, 1.15]}>
          <boxGeometry args={[1.6, 0.9, 1.1]} />
          <meshStandardMaterial color="#1f2937" roughness={0.3} metalness={0.3} />
        </mesh>
        <HazardPlate p={[3.62, G + 0.75, 0]} s={[0.05, 0.4, 3.4]} rep={6} />
        {[-2.4, 2.4].flatMap((x) => [-1.6, 1.6].map((z) => <GseWheel key={`${x}${z}`} p={[x, G + 0.55, z]} r={0.55} w={0.45} />))}
        <mesh position={[0, G + 1.55, -1.2]}>
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.2} />
        </mesh>
      </group>
      <mesh ref={towbar} visible={false}>
        <cylinderGeometry args={[0.09, 0.09, 1, 10]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.5} roughness={0.4} />
      </mesh>
    </>
  );
}

/** Samochód cateringowy: podwozie z kabiną, skrzynia na nożycach podnoszona do progu drzwi (po prawej burcie). */
function CateringTruck({ door, get }: { door: number; get: () => number }) {
  const sill = useMemo(() => {
    const p = doorSill(door);
    return [p[0], p[1], -p[2]] as V3;
  }, [door]);
  const grp = useRef<THREE.Group>(null);
  const box = useRef<THREE.Group>(null);
  const scis = useRef<(THREE.Mesh | null)[]>([]);
  const lift = sill[1] - (G + 1.6);
  useFrame(() => {
    const k = get();
    const g = grp.current;
    if (!g) return;
    g.visible = k > 0.001;
    // dojazd (pierwsza połowa), podnoszenie skrzyni (druga)
    const drv = sm(k * 2);
    const up = sm(k * 2 - 1);
    g.position.set(sill[0] - 1.4 + 0 * drv, 0, lerp(sill[2] - 40, sill[2] - 6.6, drv));
    if (box.current) box.current.position.y = G + 1.6 + lift * up + 1.3;
    scis.current.forEach((m, j) => {
      if (!m) return;
      const h = 0.2 + lift * up;
      m.position.y = G + 1.5 + h / 2;
      m.scale.y = h;
      m.rotation.z = (j % 2 ? 1 : -1) * 0.35 * (1 - up * 0.6);
    });
  });
  return (
    <group ref={grp} visible={false}>
      {/* podwozie i kabina kierowcy (od strony z dala od samolotu) */}
      <mesh position={[0, G + 0.9, -1.6]}>
        <boxGeometry args={[2.5, 0.4, 9]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[0, G + 1.9, -5.2]}>
        <boxGeometry args={[2.4, 1.9, 1.9]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.4} />
      </mesh>
      <mesh position={[0, G + 2.2, -6.16]}>
        <planeGeometry args={[2.1, 0.9]} />
        <meshStandardMaterial color="#1f2937" roughness={0.1} metalness={0.5} side={THREE.DoubleSide} />
      </mesh>
      {[-1.15, 1.15].flatMap((x) => [-5, 1.5].map((z) => <GseWheel key={`${x}${z}`} p={[x, G + 0.5, z]} r={0.5} w={0.35} />))}
      {/* nożyce */}
      {[0, 1].map((j) => (
        <mesh key={j} ref={(m) => (scis.current[j] = m)} position={[0, G + 1.6, 0.6 + (j ? 1.4 : -1.4)]}>
          <boxGeometry args={[0.14, 1, 0.14]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* skrzynia z mostkiem do drzwi */}
      <group ref={box}>
        <mesh position={[0, 0, 0.8]}>
          <boxGeometry args={[2.5, 2.6, 6.4]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.2, 0.81]}>
          <boxGeometry args={[2.52, 0.4, 6.42]} />
          <meshStandardMaterial color="#0ea5e9" roughness={0.5} />
        </mesh>
        <mesh position={[0, -1.25, 4.4]}>
          <boxGeometry args={[1.6, 0.1, 1.2]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
      </group>
    </group>
  );
}

/** Mały wóz serwisowy (toalety albo woda) z wężem do zaworu w spodzie kadłuba. */
function ServiceTruck({ get, stop, port, color, label }: { get: () => number; stop: V3; port: V3; color: string; label: string }) {
  const grp = useRef<THREE.Group>(null);
  const hose = useRef<THREE.Mesh>(null);
  void label;
  useFrame(() => {
    const k = get();
    const g = grp.current;
    if (!g) return;
    g.visible = k > 0.001;
    const e = sm(k * 1.6);
    g.position.set(stop[0] + (1 - e) * -30, 0, stop[2] - (1 - e) * 26);
    if (hose.current) {
      hose.current.visible = k > 0.75;
      if (k > 0.75) placeBetween(hose.current, [stop[0] + 1.8, G + 1.0, stop[2] + 0.6], port);
    }
  });
  return (
    <>
      <group ref={grp} visible={false}>
        <mesh position={[0, G + 0.75, 0]}>
          <boxGeometry args={[4.6, 0.3, 1.8]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
        <mesh position={[-1.6, G + 1.5, 0]}>
          <boxGeometry args={[1.4, 1.4, 1.75]} />
          <meshStandardMaterial color="#f3f4f6" />
        </mesh>
        <mesh position={[0.8, G + 1.45, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.75, 0.75, 2.8, 18]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
        </mesh>
        {[-1.6, 1.4].flatMap((x) => [-0.8, 0.8].map((z) => <GseWheel key={`${x}${z}`} p={[x, G + 0.38, z]} r={0.38} w={0.25} />))}
      </group>
      <mesh ref={hose} visible={false}>
        <cylinderGeometry args={[0.06, 0.06, 1, 8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </>
  );
}

/** Człowiek na płycie (kamizelka odblaskowa w kolorze). */
function Person({ p, color, yaw = 0, walking = false }: { p: P2; color: string; yaw?: number; walking?: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = walking ? Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.05 : 0;
  });
  return (
    <group position={[p[0], G, p[1]]} rotation={[0, yaw, 0]}>
      <group ref={g}>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.22, 0.9, 0.32]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0, 1.25, 0]}>
          <boxGeometry args={[0.28, 0.65, 0.46]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
        </mesh>
        <mesh position={[0, 1.72, 0]}>
          <sphereGeometry args={[0.13, 14, 10]} />
          <meshStandardMaterial color="#d7a77f" />
        </mesh>
      </group>
    </group>
  );
}

/** Pasażerowie w rękawie widoczni w otwartych drzwiach (idą do terminalu albo do samolotu). */
function PaxStream({ door, get }: { door: number; get: () => { n: number; dir: 1 | -1 } }) {
  const sill = useMemo(() => doorSill(door), [door]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const { n, dir } = get();
    refs.current.forEach((g, j) => {
      if (!g) return;
      g.visible = n > 0;
      const ph = ((clock.elapsedTime * 0.45 + j / 6) % 1) * (dir > 0 ? 1 : -1);
      const k = ((ph % 1) + 1) % 1;
      g.position.set(sill[0] + (j % 2 ? 0.3 : -0.3), sill[1] + 0.05, sill[2] - 1.5 + k * 4.5);
    });
  });
  return (
    <group>
      {Array.from({ length: 6 }, (_, j) => (
        <group key={j} ref={(el) => (refs.current[j] = el)} visible={false}>
          <mesh position={[0, 0.8, 0]}>
            <capsuleGeometry args={[0.17, 0.75, 4, 10]} />
            <meshStandardMaterial color={['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2'][j]} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.45, 0]}>
            <sphereGeometry args={[0.12, 12, 8]} />
            <meshStandardMaterial color="#e0b48a" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Kliny pod kołami (przednie i oba wózki) – pojawiają się po kolei. */
const chockSpan = (dx: number, r: number) => dx + Math.sqrt(r * r - (r - 0.2) * (r - 0.2)) + 0.03;
function Chocks({ get }: { get: () => number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.visible = get() > 0.5;
  });
  return (
    <group ref={g}>
      <ChockPair x={NOSE_X + 0.08} z={0} span={chockSpan(0, 0.53)} len={0.9} />
      {[1, -1].flatMap((side) => [-0.63, 0.63].map((dz) => <ChockPair key={`${side}${dz}`} x={MLG.x} z={side * MLG.z + dz} span={chockSpan(1.5, 0.7)} len={0.44} />))}
    </group>
  );
}
function Cones({ get }: { get: () => number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.visible = get() > 0.5;
  });
  const pts: P2[] = [
    [ENG[0] - 3.2, ENG[2]],
    [ENG[0] - 3.2, -ENG[2]],
    [8, 33],
    [8, -33],
    [36.5, 0],
    [NOSE_X - 8.5, 0],
  ];
  return (
    <group ref={g}>
      {pts.map(([x, z], i) => (
        <SafetyCone key={i} x={x} z={z} />
      ))}
    </group>
  );
}

/** GPU pod nosem z kablem do gniazda. */
function Gpu({ get, plug }: { get: () => number; plug: () => boolean }) {
  const g = useRef<THREE.Group>(null);
  const cable = useRef<THREE.Mesh>(null);
  const POS: V3 = [-33.5, 0, -4.6];
  useFrame(() => {
    const k = sm(get());
    if (g.current) {
      g.current.visible = k > 0.01;
      g.current.position.set(POS[0] - (1 - k) * 30, 0, POS[2] - (1 - k) * 18);
    }
    if (cable.current) {
      cable.current.visible = plug();
      if (plug()) placeBetween(cable.current, [POS[0] + 0.9, G + 1.3, POS[2] + 0.4], [EXT_SOCKET[0], EXT_SOCKET[1] - 0.05, EXT_SOCKET[2]]);
    }
  });
  return (
    <>
      <group ref={g}>
        <GpuCart />
      </group>
      <mesh ref={cable} visible={false}>
        <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
        <meshStandardMaterial color="#111317" roughness={0.6} />
      </mesh>
    </>
  );
}

/** Cysterna (dystrybutor paliwa) pod prawym skrzydłem z wężem do złącza. */
function Fuel({ get, plat }: { get: () => number; plat: () => number }) {
  const g = useRef<THREE.Group>(null);
  const hose = useRef<THREE.Mesh>(null);
  const L = REFUEL_LAY;
  useFrame(() => {
    const k = get();
    if (g.current) {
      g.current.visible = k > 0.01;
      g.current.position.set(L.stopX - (1 - sm(k * 1.5)) * 60, 0, L.lane);
    }
    if (hose.current) {
      const on = plat() > 0.95;
      hose.current.visible = on;
      if (on) placeBetween(hose.current, [L.truckFront - 0.6, L.platTop[1] + 0.1, L.lane + 0.6], L.cpl);
    }
  });
  return (
    <>
      <group ref={g} visible={false}>
        <FuelTruck plat={plat} />
      </group>
      <mesh ref={hose} visible={false}>
        <cylinderGeometry args={[0.05, 0.05, 1, 10]} />
        <meshStandardMaterial color="#111317" roughness={0.6} />
      </mesh>
    </>
  );
}

/** Pilot na obchodzie i podpis miejsca, które właśnie sprawdza. */
function Walker({ get }: { get: () => number | null }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = get();
    const gr = g.current;
    if (!gr) return;
    gr.visible = t !== null;
    if (t === null) return;
    const w = walkPos(t);
    gr.position.set(w.p[0], 0, w.p[1]);
    gr.rotation.y = w.yaw;
  });
  return (
    <group ref={g} visible={false}>
      <Person p={[0, 0]} color="#f8fafc" walking />
    </group>
  );
}

/** Obłoki pod samolotem w czasie lotu (przesuwają się do tyłu z prędkością lotu). */
function Clouds({ live }: { live: Live }) {
  const g = useRef<THREE.Group>(null);
  const puffs = useMemo(() => {
    let k = 7;
    const r = () => ((k = (k * 16807) % 2147483647) - 1) / 2147483646;
    return Array.from({ length: 70 }, () => ({ x: (r() - 0.5) * 900, z: (r() - 0.5) * 900, s: 14 + r() * 30, y: r() * 10 }));
  }, []);
  const off = useRef(0);
  useFrame((_, dt) => {
    const st = live.st;
    const gr = g.current;
    if (!gr) return;
    gr.visible = st.flight && st.u > 1e5;
    off.current = (off.current + dt * st.ias * 0.35) % 900;
    // pokład chmur ok. 2 km pod samolotem na przelocie; przy wznoszeniu i zniżaniu bliżej
    gr.position.set(off.current - 450, -40 - Math.min(160, st.altFt / 140), 0);
  });
  return (
    <group ref={g} visible={false}>
      {[0, 900].map((dx) => (
        <group key={dx} position={[dx - 450, 0, 0]}>
          {puffs.map((p, i) => (
            <mesh key={i} position={[p.x, p.y, p.z]} scale={[p.s, p.s * 0.35, p.s * 0.8]}>
              <sphereGeometry args={[1, 10, 8]} />
              <meshStandardMaterial color="#f5f7fa" roughness={1} transparent opacity={0.92} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Niebo wokół sceny (gradient) – na płycie i w locie. */
function Sky() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.position.copy(camera.position);
  });
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(440, 40, 20);
    const pos = g.getAttribute('position');
    const col: number[] = [];
    const zen = new THREE.Color('#3b7dd8');
    const hor = new THREE.Color('#d9e6f2');
    const low = new THREE.Color('#aab7c4');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 440;
      if (y >= 0) c.copy(hor).lerp(zen, Math.pow(y, 0.6));
      else c.copy(hor).lerp(low, Math.pow(-y, 0.5));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, []);
  return (
    <mesh ref={ref} geometry={geo} raycast={() => null} renderOrder={-1}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} depthTest={false} toneMapped={false} />
    </mesh>
  );
}

/* ======================= scena ======================= */

/** Pochylenie i przechylenie samolotu wokół kół głównych (rotacja przy starcie, wyrównanie przy lądowaniu). */
function PlanePose({ live, children }: { live: Live; children: ReactNode }) {
  const a = useRef<THREE.Group>(null);
  useFrame(() => {
    if (a.current) a.current.rotation.set(live.st.bank * DEG, 0, -live.st.pitch * DEG, 'XZY');
  });
  return (
    <group position={[MLG.x, G, 0]}>
      <group ref={a}>
        <group position={[-MLG.x, -G, 0]}>{children}</group>
      </group>
    </group>
  );
}

function CycleScene(_: SceneProps) {
  const live = useLive();
  // jeden zegar całego cyklu (pauza z paska stanu zatrzymuje zegar sceny, więc i tę animację)
  const clock = useRef({ T: 0 });
  const stOf = (T: number): { st: CycSt; i: number; t: number } => {
    const q = segAt(T);
    return { st: SEGS[q.i].at(q.t), i: q.i, t: q.t };
  };
  const [view, setView] = useState('0:0');
  const [, tick] = useState(0);
  const acc = useRef(0);
  const cur = useRef(stOf(0));
  applyLive(live, cur.current.st);
  useFrame((_, dt) => {
    clock.current.T = (clock.current.T + Math.min(0.05, dt)) % TOTAL;
    cur.current = stOf(clock.current.T);
    applyLive(live, cur.current.st);
    // ładownie: wspólny czas scenariusza (te same modele podnośników, wózków i kontenerów)
    FUS_LIVE.cargoT = cur.current.st.cargoT ?? 1e9;
    FUS_LIVE.cargoUnload = cur.current.st.unload;
    const v = `${cur.current.i}:${eventAt(cur.current.i, cur.current.t).k}`;
    if (v !== view) setView(v);
    acc.current += dt;
    if (acc.current > 0.2) {
      acc.current = 0;
      tick((n) => (n + 1) % 1e6);
    }
  });
  useEffect(
    () => () => {
      FUS_LIVE.cargoT = 1e9;
      FUS_LIVE.cargoUnload = false;
    },
    [],
  );
  const st = cur.current.st;
  const seg = SEGS[cur.current.i];
  const ev = eventAt(cur.current.i, cur.current.t);
  // ujęcie liczone raz na zdarzenie (przy ruchomym punkcie – w chwili zdarzenia), kamera dojeżdża do niego płynnie
  const evKey = `${cur.current.i}:${ev.k}`;
  const camView = useMemo(() => anchorView(ev.a, st), [evKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const cargoOn = st.cargoT !== null;
  const S = () => live.st;
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#eaf3ff', '#5b6470', 0.7]} />
      <directionalLight position={[-40, 70, 30]} intensity={1.5} color="#fff6e8" />
      <directionalLight position={[30, 20, -40]} intensity={0.35} color="#c8d8ff" />
      <fog attach="fog" args={['#d3e0ec', 220, 430]} />
      <Sky />
      <StageCamera view={camView} />
      <MovingWorld live={live}>
        <group position={[0, G - 0.03, 0]}>
          <AirportModel />
        </group>
        <DockingBoard live={live} />
        <GateFrame>
          {[0, 1].map((i) => (
            <JetBridge key={i} i={i} get={() => S().bridge[i]} />
          ))}
          <Chocks get={() => S().chocks} />
          <Cones get={() => S().cones} />
          <Gpu get={() => S().gpu} plug={() => S().gpuPlug} />
          <CateringTruck door={0} get={() => S().catering[0]} />
          <CateringTruck door={3} get={() => S().catering[1]} />
          <ServiceTruck get={() => S().lav} stop={[26, 0, -7]} port={[27.5, -3.4, -0.6]} color="#2563eb" label="toalety" />
          <ServiceTruck get={() => S().water} stop={[-22, 0, -7]} port={[-21, -3.8, -0.6]} color="#38bdf8" label="woda" />
          <Fuel get={() => S().fuelTruck} plat={() => S().fuelPlat} />
          <Walker get={() => S().walk} />
          {cargoOn &&
            CARGO_DOORS.map((xd, h) => (
              <group key={h}>
                <CargoDoor xd={xd} />
                <CargoLoader xd={xd} hold={h} />
                <DollyTrains hold={h} />
              </group>
            ))}
          {ev.a.gate && <Bubble key={`${cur.current.i}:${ev.k}`} anchor={ev.a} text={ev.text} live={live} />}
          {st.crew.map((c, i) => (
            <Person key={i} p={[c[0], c[1]]} color={c[2]} />
          ))}
        </GateFrame>
      </MovingWorld>
      {/* holownik i dyszel – przy samolocie (w czasie wypychania jadą razem z nim) */}
      <PushTug get={() => ({ k: S().tug, steer: S().steer })} bar={() => S().towbar} />
      <Clouds live={live} />
      <PlanePose live={live}>
        <Airliner
          focus={null}
          inFlight={st.flight}
          gear={live.gear}
          enginePower={live.power}
          mech={live.mech}
          surfaces={live.surf}
          extLights={live.ext}
          landingLights={st.lights.land}
          layers={{ ground: false }}
          interactive={false}
          links={false}
          partLabels={false}
          moduleLabels={false}
          doorsOpen
          fusView={cargoOn ? 'cargo' : undefined}
          animate={false}
          flow={false}
        />
        {[1, -1].map((side) =>
          PAX_DOOR.xs.map((_, i) => (
            <group key={`${side}${i}`} scale={[1, 1, side]}>
              <PaxDoor i={i} side={side} getState={() => S().doors[side > 0 ? i : 4 + i]} />
            </group>
          )),
        )}
        <PaxStream door={0} get={() => paxFlow(S(), 0)} />
        <PaxStream door={1} get={() => paxFlow(S(), 1)} />
      </PlanePose>
      {!ev.a.gate && <Bubble key={`${cur.current.i}:${ev.k}`} anchor={ev.a} text={ev.text} live={live} />}
      <CycleOverlay st={st} seg={seg} segIdx={cur.current.i} />
    </>
  );
}

/**
 * Dymek z opisem przy miejscu zdarzenia: jasna chmurka nad punktem, z „ogonkiem” wskazującym ten punkt. Pojawia się
 * płynnie przy każdym nowym zdarzeniu.
 */
function Bubble({ anchor, text, live }: { anchor: Anchor; text: string; live: Live }) {
  const g = useRef<THREE.Group>(null);
  const u = useSpeedUnit();
  const hidden = useSceneHidden();
  const tail = useRef<HTMLDivElement>(null);
  const fixed = typeof anchor.p === 'function' ? null : anchor.p;
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (g.current && typeof anchor.p === 'function') g.current.position.set(...anchor.p(live.st));
  });
  if (hidden || !text) return null;
  return (
    <group ref={g} position={fixed ?? [0, 0, 0]}>
      <Html
        zIndexRange={[7, 0]}
        style={{ pointerEvents: 'none' }}
        calculatePosition={(el, camera, size) => {
          // punkt na ekranie; dymek nad nim, ale zawsze w widocznej części sceny – z dala od krawędzi, od ekranów kokpitu
          // w prawym górnym rogu i od nazwy etapu w lewym dolnym; gdy punkt jest poza kadrem, dymek staje przy krawędzi
          v.setFromMatrixPosition(el.matrixWorld).project(camera);
          const behind = v.z > 1;
          let x = ((v.x + 1) / 2) * size.width;
          let y = ((1 - v.y) / 2) * size.height;
          if (behind) {
            x = size.width - x;
            y = size.height * 0.8;
          }
          const W2 = 150;
          const inView = !behind && x > 0 && x < size.width && y > 0 && y < size.height;
          const nx = Math.min(size.width - W2 - 16, Math.max(W2 + 16, x));
          let ny = Math.min(size.height - 70, Math.max(150, y));
          const dockL = size.width - 300;
          if (nx + W2 > dockL && ny < 380) ny = Math.max(ny, 380);
          if (tail.current) tail.current.style.visibility = inView && Math.abs(nx - x) < 4 && Math.abs(ny - y) < 4 ? 'visible' : 'hidden';
          return [nx, ny];
        }}
      >
        <div className="cycle-bubble" style={{ transform: 'translate(-50%, calc(-100% - 14px))', width: 'max-content', maxWidth: 280, animation: 'cycleBubbleIn 0.35s ease-out' }}>
          <div style={{ background: 'rgba(250,251,252,0.96)', color: '#16202b', borderRadius: 12, padding: '8px 11px', fontSize: 13, lineHeight: 1.35, boxShadow: '0 6px 20px rgba(0,0,0,0.28)', border: '1px solid rgba(15,23,42,0.12)' }}>
            {speedInText(text, u)}
          </div>
          <div ref={tail} style={{ width: 14, height: 14, background: 'rgba(250,251,252,0.96)', transform: 'rotate(45deg)', margin: '-8px auto 0', boxShadow: '3px 3px 6px rgba(0,0,0,0.12)' }} />
        </div>
      </Html>
    </group>
  );
}

/** Pasażerowie w drzwiach przy rękawie: przy wysiadaniu – na zewnątrz, przy wsiadaniu – do środka. */
function paxFlow(st: CycSt, door: number): { n: number; dir: 1 | -1 } {
  const open = st.doors[door].u > 0.95 && st.bridge[door] > 0.99;
  if (!open) return { n: 0, dir: 1 };
  const out = st.pax > 0 && st.pax < 352 && st.cargoT === null;
  const inn = st.cargoT !== null && st.pax > 0 && st.pax < 352;
  return { n: out || inn ? 1 : 0, dir: inn ? -1 : 1 };
}

/* ======================= ramka i ekrany ======================= */

const f0 = (v: number) => Math.round(v).toLocaleString('pl-PL');
/** Zegar lokalny: przylot na stanowisko o 9:40. */
const clockStr = (min: number) => {
  const m = Math.round(9 * 60 + 40 + min);
  const h = Math.floor(((m / 60) % 24) + 24) % 24;
  return `${h}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
};

function CycleEcam({ st }: { st: CycSt }) {
  const n1: [number, number] = [st.n1, st.n1];
  const egt: [number, number] = st.n1 > 5 ? [380 + st.n1 * 5, 384 + st.n1 * 5] : [30, 30];
  const fs = fuelSplit(st.fob);
  const footer = { tat: st.flight && st.altFt > 20000 ? -36 : 14, sat: st.flight && st.altFt > 20000 ? -56 : 14, isa: 0, gw: 205000 + st.fob + st.pax * 100, gwcg: 29.4, fob: st.fob };
  const memo: [string, string][] = st.apu ? [['APU AVAIL', AIRBUS.green]] : [];
  if (st.ecam === 'DOOR') {
    const open = st.doors.map((d) => d.u > 0.05);
    const cargoOpen = st.cargoT !== null && st.cargoT > 0.5 && st.cargoT < CARGO_TEND - 0.5;
    return <Ecam thrMode={null} n1={n1} egt={egt} memo={memo} page="DOOR" door={{ open, armed: st.doors.map((d) => d.ind), cargo: [cargoOpen, cargoOpen, false] }} footer={footer} width={250} />;
  }
  if (st.ecam === 'FUEL') return <Ecam thrMode={null} n1={n1} egt={egt} memo={memo} page="FUEL" fuel={{ l: fs.wing, c: fs.center, r: fs.wing, lMax: TANK.wingMax, cMax: TANK.centerMax, rMax: TANK.wingMax, fu: [0, 0] }} footer={footer} width={250} />;
  if (st.ecam === 'CRUISE') return <Ecam thrMode={['CLB', 92]} n1={n1} egt={egt} page="CRUISE" cruise={{ ff: [2400, 2400], fu: [9000, 9000], deltaP: 8.4, cabAlt: Math.min(6000, st.altFt * 0.17), cabVs: 0, ldgElev: 300, temps: [22, 23, 22] }} footer={footer} width={250} />;
  if (st.ecam === 'APU')
    return (
      <Ecam
        thrMode={null}
        n1={n1}
        egt={egt}
        memo={memo}
        page="APU"
        apu={{ n: st.apu ? 100 : 0, egt: st.apu ? 420 : 30, egtLimit: 760, avail: st.apu, flapOpen: st.apu, gen: { on: st.apu, load: st.apu ? 40 : 0, v: st.apu ? 115 : 0, hz: st.apu ? 400 : 0 }, bleed: { open: st.apu, psi: st.apu ? 38 : 0 } }}
        footer={footer}
        width={250}
      />
    );
  if (st.ecam === 'ENG') {
    const e = { ff: st.n1 > 5 ? 300 + st.n1 * 80 : 0, n2: st.n1 > 5 ? 60 + st.n1 * 0.38 : 0, n3: st.n1 > 5 ? 68 + st.n1 * 0.3 : 0, oilQ: 21, oilT: st.n1 > 5 ? 90 : 20, oilP: st.n1 > 5 ? 60 : 0, vib: [0.3, 0.4, 0.3] as [number, number, number] };
    return <Ecam thrMode={st.n1 > 60 ? ['FLX', 91] : null} n1={n1} egt={egt} memo={memo} page="ENG" eng={[e, e]} footer={footer} width={250} />;
  }
  return (
    <Ecam
      thrMode={null}
      n1={n1}
      egt={egt}
      rev={st.rev > 0.05 ? [st.rev, st.rev] : undefined}
      page="WHEEL"
      wheel={{ brakeT: Array.from({ length: 12 }, (_, i) => 120 + (i % 3) * 15), tyre: Array(12).fill(212), gear: st.gearUp > 0.98 ? 'up' : st.gearUp > 0.02 ? 'transit' : 'down', parkBrk: st.h === 0 && st.ias < 0.5, steer: !st.flight, accu: [3, 3] }}
      footer={footer}
      width={250}
    />
  );
}

// w doku ECAM stoi w miejscu wyświetlaczy (prawy górny róg)
(CycleEcam as unknown as { cockpitSlot: string }).cockpitSlot = 'ecam';

function CycleOverlay({ st, seg, segIdx }: { st: CycSt; seg: Seg; segIdx: number }) {
  const flying = st.flight || st.altFt > 1;
  const hdg = (((st.psi / DEG) % 360) + 360 + 90) % 360;
  // PFD, dopóki samolot się porusza (kołowanie, start, lot, lądowanie, dobieg) – do zatrzymania na stanowisku
  const moving = flying || st.ias > 0.3 || seg.id === 'arrive' || seg.id === 'takeoff';
  const hidden = useSceneHidden();
  return (
    <>
      <CockpitDock>
        {moving && <Pfd pitch={st.pitch} bank={st.bank} ias={st.ias} alt={st.altFt} vs={st.vs} heading={hdg} ra={st.altFt < 2500 ? st.altFt : undefined} fma={flying ? ['SPEED', st.vs > 300 ? 'CLB' : st.vs < -300 ? 'DES' : 'ALT CRZ', 'NAV', '', 'AP1\n1FD2\nA/THR'] : ['', '', '', '', '1FD2']} />}
        {seg.id === 'taxi' && <Nd heading={hdg} gs={st.ias} tas={st.ias} range={2} target="RW27R" />}
        {st.ecam && <CycleEcam st={st} />}
      </CockpitDock>
      {!hidden && (
        <Html calculatePosition={(_el, _cam, size) => [18, size.height - 58]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ transform: 'translateY(-100%)', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 700, color: '#f8fafc', background: 'rgba(15,23,42,0.62)', padding: '6px 12px', borderRadius: 8, letterSpacing: '0.01em' }}>
            {SEGS[segIdx].title}
          </div>
        </Html>
      )}
    </>
  );
}

/* ======================= zakładki modułu ======================= */

const P = ({ children }: { children: ReactNode }) => <p>{children}</p>;

export const cycleModule: PartModule = {
  id: 'cykl',
  title: 'Od lądowania do lądowania',
  summary: 'Jedna ciągła animacja pełnego cyklu pracy samolotu: wjazd na stanowisko, obsługa naziemna, wypychanie, kołowanie, start, lot, lądowanie i zjazd z pasa – z opisami w dymkach przy tym, co się właśnie dzieje',
  steps: [
    {
      title: 'Od lądowania do lądowania',
      kind: '3d',
      scene: CycleScene,
      stageKey: 'cycle',
      camera: far(SEGS[0].views[0]).cam,
      target: far(SEGS[0].views[0]).tgt,
      body: (
        <>
          <P>
            Samolot zarabia, tylko gdy lata, dlatego czas na ziemi między dwoma lotami – <b>obsługa naziemna</b> (ang. <i>turnaround</i>) – jest zaplanowany co do minuty. Dla A350 na trasie dalekiego zasięgu to zwykle ok. <b>1,5–2 godziny</b>, a wiele rzeczy dzieje się równocześnie: pasażerowie wysiadają, z ładowni wyjeżdża bagaż, a pod skrzydło podjeżdża paliwo.
          </P>
          <P>
            Animacja pokazuje jeden pełny cykl bez przerw: od chwili, gdy samolot zjechał z pasa po lądowaniu, przez obsługę przy terminalu, wypychanie, kołowanie, start i lot, aż do zjazdu z pasa po kolejnym lądowaniu. Potem zaczyna się od nowa. Dymki pojawiają się przy tym, co się właśnie dzieje – przy kołach, drzwiach, rękawie, cysternie, silnikach.
          </P>
          <P>
            Animację zatrzymasz przyciskiem „Wstrzymaj animację” (albo klawiszem P). Kamera sama podjeżdża do tego, o czym mówi dymek; widok możesz obracać i przybliżać myszą, a kamera wróci do swojej trasy przy następnym zdarzeniu. Nazwa etapu jest w lewym dolnym rogu, a ekrany kokpitu w prawym górnym: PFD, dopóki samolot jedzie albo leci, i ECAM ze stroną pasującą do tego, co się dzieje. Czas animacji jest skrócony.
          </P>
        </>
      ),
    },
  ],
};
