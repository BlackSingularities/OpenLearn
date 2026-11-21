/*
 * Moduł świateł zewnętrznych A350-1000: pozycyjne (NAV) z sektorami świecenia, antykolizyjne (beacony i strobo),
 * reflektory lądowania, kołowania, startu i zjazdu z pasa, oświetlenie skrzydła (WING) i logo – wszystko nocą,
 * z panelem EXT LT z panelu górnego, który pokazuje, jak załoga ustawia światła w danej chwili.
 *
 * Lampy są w modelu samolotu (airliner.tsx); moduł podaje im stan przełączników przez ExtLights. Reflektory,
 * beacony i strobo są w scenie prawdziwymi źródłami światła – oświetlają poszycie, pas i drogi kołowania.
 *
 * Zakładki: strona główna (wszystko zapalone, klikane podpisy), światła pozycyjne, antykolizyjne, reflektory
 * lądowania (podejście nocą), kołowanie i zjazd z pasa, oświetlenie skrzydła (oblodzenie), logo i kolejność
 * włączania w czasie lotu. Odległości w scenach podejścia i kołowania są skrócone (opisane w ramce).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Params, Step } from '../../lib/types';
import { InfoPortal, fmt } from '../../lib/plot';
import { useSceneHidden } from '../../lib/topicNav';
import { AIRBUS, CockpitDock, cockpitFont } from '../../components/cockpit';
import { EXT_LIGHT_POS, GEAR_STROKE, PLANE_LEVELS, blinkLevel, newExtLights, newGearDrive, wingSurface, type ExtLights, type GearDrive } from './airliner';
import type { DirectPose } from './wingLab';
import { AirportModel, EXIT, GLIDE_DEG, GlowDots, PAPI_U, STAND, getGlowTex } from './runway';
import { gearRunwayU, type GearLive } from './gearLab';
import { LANDING, landingPhase } from './landing';

type V3 = [number, number, number];
export type LightsMode = 'home' | 'nav' | 'anti' | 'land' | 'taxi' | 'wing' | 'logo' | 'seq';
const DEG = Math.PI / 180;
const GROUND = PLANE_LEVELS.ground;

/* ======================= przełączniki EXT LT ======================= */

type Strobe = 'ON' | 'AUTO' | 'OFF';
type Nose = 'T.O' | 'TAXI' | 'OFF';
/** Przełączniki panelu EXT LT (panel górny A350). */
export type ExtSw = { strobe: Strobe; beacon: boolean; wing: boolean; navLogo: boolean; turnoff: boolean; land: boolean; nose: Nose };
const SW_OFF: ExtSw = { strobe: 'OFF', beacon: false, wing: false, navLogo: false, turnoff: false, land: false, nose: 'OFF' };
/** Ustawienie przełączników w zakładce (w części zakładek przestawiają się dalej same – jak u załogi). */
const PRESET: Record<LightsMode, Partial<ExtSw>> = {
  home: { strobe: 'ON', beacon: true, wing: true, navLogo: true, turnoff: true, land: true, nose: 'T.O' },
  nav: { navLogo: true },
  anti: { navLogo: true, beacon: true, strobe: 'AUTO' },
  land: { navLogo: true, beacon: true, strobe: 'ON', land: true, nose: 'T.O' },
  taxi: { navLogo: true, beacon: true, strobe: 'AUTO', nose: 'TAXI', turnoff: true },
  wing: { navLogo: true, beacon: true, strobe: 'ON', wing: true },
  logo: { navLogo: true, beacon: false },
  seq: { navLogo: true },
};

/* ======================= kolejność świateł w czasie lotu ======================= */

type SeqPhase = { name: string; desc: string; dur: number; ground: boolean; gear: 0 | 1; pitch: number; n1: number; flaps: boolean; sw: Partial<ExtSw> };
const BASE: Partial<ExtSw> = { navLogo: true, beacon: true };
export const SEQ: SeqPhase[] = [
  { name: 'Postój przy stanowisku', desc: 'Samolot ma prąd, więc świecą światła pozycyjne i logo (przełącznik NAV & LOGO) – nawet gdy stoi pusty na płycie. Silniki nie pracują, czerwony beacon jest zgaszony.', dur: 4.5, ground: true, gear: 0, pitch: 0, n1: 0, flaps: false, sw: { navLogo: true } },
  { name: 'Wypychanie i rozruch silników', desc: 'Tuż przed wypchnięciem i uruchomieniem silników pilot zapala czerwony BEACON. To znak dla obsługi na płycie: silniki zaraz ruszą – nie podchodzić.', dur: 5, ground: true, gear: 0, pitch: 0, n1: 20, flaps: false, sw: { ...BASE } },
  { name: 'Kołowanie', desc: 'Reflektor kołowania na przedniej goleni (NOSE w położeniu TAXI) oświetla drogę przed samolotem, a reflektory boczne (RWY TURN OFF) – pobocza i zakręty.', dur: 5, ground: true, gear: 0, pitch: 0, n1: 24, flaps: true, sw: { ...BASE, nose: 'TAXI', turnoff: true } },
  { name: 'Wjazd na pas startowy', desc: 'Pilot zapala stroboskopy (STROBE), reflektory lądowania (LAND) i reflektor startowy (NOSE T.O). Samolot na pasie musi być widoczny z daleka – także dla pilotów samolotu, który podchodzi do lądowania na ten sam pas.', dur: 5, ground: true, gear: 0, pitch: 0, n1: 30, flaps: true, sw: { ...BASE, strobe: 'ON', land: true, nose: 'T.O', turnoff: true } },
  { name: 'Start i wznoszenie', desc: 'Po schowaniu podwozia reflektory na goleni są we wnęce i gasną same. Pilot wyłącza też ich przełączniki (NOSE i RWY TURN OFF).', dur: 5.5, ground: false, gear: 1, pitch: 12, n1: 92, flaps: true, sw: { ...BASE, strobe: 'ON', land: true } },
  { name: 'Powyżej 3 km', desc: 'Pilot gasi reflektory lądowania (LAND). Logo gaśnie samo, gdy klapy są schowane. Beacon, stroboskopy i światła pozycyjne świecą przez cały lot.', dur: 5, ground: false, gear: 1, pitch: 5, n1: 88, flaps: false, sw: { ...BASE, strobe: 'ON' } },
  { name: 'Przelot nocą w chmurach', desc: 'Gdy grozi oblodzenie, pilot na chwilę zapala reflektor skrzydła (WING) i patrzy przez okno, czy na przedniej krawędzi skrzydła i na wlocie silnika nie narasta lód.', dur: 5, ground: false, gear: 1, pitch: 2.5, n1: 85, flaps: false, sw: { ...BASE, strobe: 'ON', wing: true } },
  { name: 'Zniżanie poniżej 3 km', desc: 'Reflektory lądowania (LAND) znów świecą: samolot jest lepiej widoczny, a ptaki szybciej go zauważają.', dur: 5, ground: false, gear: 1, pitch: 0.5, n1: 40, flaps: false, sw: { ...BASE, strobe: 'ON', land: true } },
  { name: 'Podejście i lądowanie', desc: 'Klapy i podwozie są wypuszczone. Reflektory na przedniej goleni (NOSE T.O) razem z reflektorami lądowania oświetlają pas przed przyziemieniem.', dur: 5.5, ground: false, gear: 0, pitch: 3, n1: 45, flaps: true, sw: { ...BASE, strobe: 'ON', land: true, nose: 'T.O' } },
  { name: 'Zjazd z pasa', desc: 'Stroboskopy w położeniu AUTO gasną same, gdy koła dotkną ziemi. Pilot gasi reflektory lądowania, a zapala reflektor kołowania i reflektory boczne – oświetlają zakręt na drogę kołowania.', dur: 5, ground: true, gear: 0, pitch: 0, n1: 24, flaps: true, sw: { ...BASE, strobe: 'AUTO', nose: 'TAXI', turnoff: true } },
  { name: 'Na stanowisku', desc: 'Przed stanowiskiem pilot gasi reflektor na goleni, żeby nie oślepiać obsługi. Beacon gaśnie dopiero po wyłączeniu silników – to znak, że można podejść do samolotu.', dur: 5, ground: true, gear: 0, pitch: 0, n1: 0, flaps: false, sw: { navLogo: true } },
];

/* ======================= symulacja ======================= */

export type LightsSim = {
  sw: ExtSw;
  /** Stan lamp wynikający z przełączników (podawany modelowi samolotu). */
  ext: ExtLights;
  /** Strona główna: wybrana grupa świateł świeci sama (null – wszystkie według przełączników). */
  solo: keyof ExtLights | null;
  key: string;
  t: number;
  clock: number;
  ground: boolean;
  flaps: boolean;
  gear: GearDrive;
  n1: number;
  pitch: number;
  yaw: number;
  /** Ruch w świecie (podejście, kołowanie): położenie (m), kurs (rad, 0 – wzdłuż −x), wysokość nad pasem, prędkość. */
  X: number;
  Z: number;
  psi: number;
  h: number;
  v: number;
  /** Kołowanie: przejechana droga (m). */
  dist: number;
  /** Kolejność świateł: bieżąca faza i czas w niej. */
  seq: number;
  seqT: number;
  /** Światła pozycyjne: kierunek, z którego patrzy kamera (° od nosa, + w lewo). */
  obsAz: number;
  /** PAPI: liczba białych świateł (0–4). */
  papi: number;
  /** Światła pozycyjne: wybrany tor przelotu. */
  navKey: string;
  /** Przesunięcie terenu pod samolotem w locie (m). */
  scrollX: number;
  scrollZ: number;
  /** Zmiana przełączników (do przerysowania panelu). */
  rev: number;
};
// moduł świateł działa nocą: lampy zapalają też prawdziwe źródła światła w scenie
const newExt = (): ExtLights => newExtLights(true);
const newSim = (): LightsSim => ({
  sw: { ...SW_OFF },
  ext: newExt(),
  solo: null,
  key: '',
  t: 0,
  clock: 0,
  ground: true,
  flaps: false,
  gear: newGearDrive(),
  n1: 0,
  pitch: 0,
  yaw: 0,
  X: 0,
  Z: 0,
  psi: 0,
  h: 0,
  v: 0,
  dist: 0,
  seq: 0,
  seqT: 0,
  obsAz: 0,
  papi: 2,
  scrollX: 0,
  scrollZ: 0,
  rev: 0,
  navKey: '',
});

/** Lampy według przełączników (z logiką automatyczną jak w Airbusie). */
function applyExt(s: LightsSim) {
  const sw = s.sw;
  const e = s.ext;
  const gearDown = s.gear.retract < 0.5;
  e.nav = sw.navLogo;
  // logo: z przełącznikiem NAV & LOGO, ale tylko na ziemi albo przy wysuniętych klapach
  e.logo = sw.navLogo && (s.ground || s.flaps);
  e.beacon = sw.beacon;
  // STROBE AUTO: błyska, gdy podwozie główne nie jest ściśnięte (samolot w powietrzu)
  e.strobe = sw.strobe === 'ON' || (sw.strobe === 'AUTO' && !s.ground);
  e.land = sw.land;
  // reflektory na goleni przedniej: T.O. zapala oba (kołowania i startu); po schowaniu podwozia gasną
  e.taxi = sw.nose !== 'OFF' && gearDown;
  e.to = sw.nose === 'T.O' && gearDown;
  e.turnoff = sw.turnoff && gearDown;
  e.wing = sw.wing;
  if (s.solo) {
    const only = s.solo;
    (Object.keys(e) as (keyof ExtLights)[]).forEach((k) => (e[k] = k === only || (only === 'taxi' && k === 'to')));
  }
}

/* ---------- światła pozycyjne: przelot obok obserwatora ---------- */
/**
 * Obserwator (kamera) siedzi w kabinie drugiego samolotu w x = −160 m i patrzy w stronę +x. Nasz samolot przelatuje
 * przed nim po jednym z torów: yaw – kurs (° wokół pionu; 0 – nos w −x, czyli prosto na obserwatora), start (x, z),
 * kierunek ruchu, wysokość względem obserwatora i długość odcinka. Ruch zwolniony (ok. 38 m/s).
 */
const NAV_PATHS: Record<string, { yaw: number; x0: number; z0: number; dx: number; dz: number; y: number; len: number }> = {
  head: { yaw: 0, x0: 330, z0: 0, dx: -1, dz: 0, y: 26, len: 430 },
  left: { yaw: -90, x0: 20, z0: 280, dx: 0, dz: -1, y: 10, len: 560 },
  right: { yaw: 90, x0: 20, z0: -280, dx: 0, dz: 1, y: 10, len: 560 },
  away: { yaw: 180, x0: -95, z0: 24, dx: 1, dz: 0, y: 10, len: 470 },
};
const NAV_V = 38;
export const NAV_OBS: V3 = [-160, 6, 0];

/* ---------- kołowanie i zjazd z pasa ---------- */
/** Zjazd z pasa: prosto po osi pasa, łuk w prawo (R = 50 m) na drogę kołowania, potem prosto. */
const TX = { x0: 90, xTurn: -140, R: EXIT.R, zEnd: -330 };
const TX_ARC = (Math.PI / 2) * TX.R;
const TX_L1 = TX.x0 - TX.xTurn;
const TX_LEN = TX_L1 + TX_ARC + (-TX.R - TX.zEnd);
/** Położenie i kurs na drodze zjazdu po przejechaniu d metrów. */
function taxiAt(d: number): { x: number; z: number; psi: number; turn: number } {
  if (d < TX_L1) return { x: TX.x0 - d, z: 0, psi: 0, turn: 0 };
  if (d < TX_L1 + TX_ARC) {
    const th = (d - TX_L1) / TX.R;
    return { x: TX.xTurn - TX.R * Math.sin(th), z: -TX.R + TX.R * Math.cos(th), psi: -th, turn: 1 };
  }
  const e = d - TX_L1 - TX_ARC;
  return { x: TX.xTurn - TX.R, z: -TX.R - e, psi: -Math.PI / 2, turn: 0 };
}
function stepTaxi(s: LightsSim, dt: number) {
  const k = 1.5; // czas przyspieszony
  const d = s.dist;
  // zwalnianie przed zjazdem: z ok. 16 m/s do 9 m/s
  const vT = d < TX_L1 - 60 ? 16 : 9;
  s.v += Math.sign(vT - s.v) * Math.min(Math.abs(vT - s.v), 2.2 * dt * k);
  s.dist += s.v * dt * k;
  if (s.dist > TX_LEN) Object.assign(s, { dist: 0, v: 16 });
  const p = taxiAt(s.dist);
  Object.assign(s, { X: p.x, Z: p.z, psi: p.psi, h: 0, ground: true, pitch: 0 });
  // skręt koła przedniego: rozstaw osi ok. 30 m, łuk 50 m
  const steerT = p.turn ? -Math.atan(30 / TX.R) : 0;
  s.gear.steer += (steerT - s.gear.steer) * Math.min(1, dt * 3);
  s.gear.spin += s.v * dt * k;
  s.gear.noseSpin = s.gear.spin;
  Object.assign(s.gear, { retract: 0, extend: 0, lift: 0 });
}

/** Wspólny stan świateł dla modelu, otoczenia i panelu; w zakładkach z lotem ustawia też pozę samolotu. */
export function useLightsDriver(mode: LightsMode | null, params: Params, direct?: DirectPose, gearLive?: MutableRefObject<GearLive>) {
  const sim = useRef<LightsSim>(newSim());
  const [, bump] = useState(0);
  useFrame((state, dtRaw) => {
    if (!mode) return;
    const dt = Math.min(0.05, dtRaw);
    const s = sim.current;
    s.clock = state.clock.elapsedTime;
    if (s.key !== mode) {
      const fresh = newSim();
      fresh.sw = { ...SW_OFF, ...PRESET[mode] };
      fresh.key = mode;
      fresh.rev = s.rev + 1;
      if (mode === 'taxi') Object.assign(fresh, { v: 16 });
      // te same obiekty ext i gear zostają (model samolotu dostał je przy renderze) – zmienia się tylko ich zawartość
      const { ext, gear } = s;
      Object.assign(s, fresh, { ext: Object.assign(ext, fresh.ext), gear: Object.assign(gear, fresh.gear) });
    }
    s.t += dt;
    const was = s.ground;
    const air = (n1 = 85) => {
      s.ground = false;
      s.n1 = n1;
      Object.assign(s.gear, { retract: 1, extend: GEAR_STROKE, lift: 0, steer: 0 });
    };
    const parked = (n1: number) => {
      s.ground = true;
      s.n1 = n1;
      Object.assign(s.gear, { retract: 0, extend: 0, lift: 0, steer: 0 });
    };
    if (mode === 'home') {
      parked(22);
      s.flaps = true;
    } else if (mode === 'logo') {
      parked(0);
    } else if (mode === 'nav') {
      air();
      const view = String(params.view ?? 'left');
      const path = NAV_PATHS[view];
      if (s.navKey !== view) {
        s.navKey = view;
        s.dist = 0;
      }
      if (path) {
        s.dist += NAV_V * dt;
        if (s.dist > path.len) s.dist = 0;
        Object.assign(s, { yaw: path.yaw, X: path.x0 + path.dx * s.dist, Z: path.z0 + path.dz * s.dist, h: path.y });
      } else Object.assign(s, { yaw: 0, X: 0, Z: 0, h: 0 });
      // kierunek od samolotu do kamery w układzie samolotu: ° od nosa, + w stronę lewego skrzydła
      const c = state.camera.position;
      const vx = c.x - (s.X - 6);
      const vz = c.z - s.Z;
      const ps = s.yaw * DEG;
      const lx = vx * Math.cos(ps) - vz * Math.sin(ps);
      const lz = vx * Math.sin(ps) + vz * Math.cos(ps);
      s.obsAz = Math.atan2(lz, -lx) / DEG;
    } else if (mode === 'anti') {
      if (params.air === false) parked(22);
      else air();
    } else if (mode === 'land') {
      // pełne lądowanie z zakładek podwozia (ten sam przebieg co w dzień): na ziemi od przyziemienia kół głównych
      const lv = gearLive?.current;
      s.ground = lv ? lv.u >= 0 : false;
      s.flaps = true;
      s.n1 = lv?.n1 ?? LANDING.n1App;
      s.gear.retract = 0;
    } else if (mode === 'taxi') {
      s.n1 = 24;
      s.flaps = true;
      stepTaxi(s, dt);
    } else if (mode === 'wing') {
      air(84);
    } else if (mode === 'seq') {
      s.seqT += dt;
      let ph = SEQ[s.seq];
      if (s.seqT > ph.dur) {
        s.seq = (s.seq + 1) % SEQ.length;
        s.seqT = 0;
        ph = SEQ[s.seq];
        s.sw = { ...SW_OFF, ...ph.sw };
        s.rev++;
      }
      if (s.t < dt * 1.5) s.sw = { ...SW_OFF, ...ph.sw };
      s.ground = ph.ground;
      s.flaps = ph.flaps;
      s.n1 += (ph.n1 - s.n1) * Math.min(1, dt * 1.5);
      s.pitch += (ph.pitch - s.pitch) * Math.min(1, dt * 1.2);
      const g = s.gear;
      g.retract += Math.sign(ph.gear - g.retract) * Math.min(Math.abs(ph.gear - g.retract), dt * 0.45);
      g.extend += Math.sign((ph.ground ? 0 : GEAR_STROKE) - g.extend) * Math.min(Math.abs((ph.ground ? 0 : GEAR_STROKE) - g.extend), dt * 0.8);
      g.steer = 0;
    }
    // teren pod samolotem w locie przesuwa się do tyłu (samolot leci nosem w stronę −x)
    if (!s.ground && mode !== 'nav') {
      const v = 70;
      s.scrollX += Math.cos(s.yaw * DEG) * v * dt;
      s.scrollZ -= Math.sin(s.yaw * DEG) * v * dt;
    }
    /*
     * Przełączniki przestawiają się same – jak u załogi w danej chwili (panel tylko to pokazuje):
     * lądowanie – po zwolnieniu do prędkości kołowania LAND OFF, NOSE TAXI, RWY TURN OFF ON; kołowanie – RWY TURN OFF
     * gaśnie po zjechaniu z pasa; skrzydło – WING włączany na kilka sekund (sprawdzenie oblodzenia); logo – NAV & LOGO
     * na chwilę wyłączone, żeby było widać różnicę.
     */
    const setSw = (sw: Partial<ExtSw>) => {
      const next: ExtSw = { ...SW_OFF, ...PRESET[mode], ...sw };
      const k = Object.keys(next) as (keyof ExtSw)[];
      if (k.some((x) => next[x] !== s.sw[x])) {
        s.sw = next;
        s.rev++;
      }
    };
    if (mode === 'land') {
      const lv = gearLive?.current;
      setSw(lv && lv.u > 0 && lv.v < 15 ? { land: false, nose: 'TAXI', turnoff: true, strobe: 'AUTO' } : {});
    } else if (mode === 'taxi') setSw({ turnoff: s.dist < TX_L1 + TX_ARC + 25 });
    else if (mode === 'wing') setSw({ wing: s.t % 10 > 3 });
    else if (mode === 'logo') setSw({ navLogo: s.t % 9 > 2.5 });
    applyExt(s);
    if (s.ground !== was) bump((n) => n + 1);
    // lądowanie ustawia pozę samo (animacja podwozia)
    if (direct && mode !== 'home' && mode !== 'logo' && mode !== 'land') {
      const flying = !s.ground;
      const wob = flying ? Math.sin(s.t * 0.9) * 0.7 + Math.sin(s.t * 2.3 + 1) * 0.3 : 0;
      const nod = flying ? Math.sin(s.t * 1.3 + 2) * 0.25 + Math.sin(s.t * 3.1) * 0.1 : 0;
      Object.assign(direct, {
        // światła pozycyjne: samolot przelatuje przed obserwatorem (położenie ustawiane od razu)
        snap: mode === 'nav',
        pivot: [-6, 0, 0] as V3,
        shift: (mode === 'nav' ? [s.X, s.h, s.Z] : [0, 0, 0]) as V3,
        lift: 0,
        bank: wob,
        yaw: mode === 'nav' ? s.yaw : 0,
        alpha: (mode === 'nav' || mode === 'anti' || mode === 'wing' ? 2.5 : s.pitch) + nod,
      });
      Object.assign(direct.surf, { aileron: 0, elevator: 0, rudder: 0, spoiler: 0 });
    }
  });
  return sim;
}

/** Czy scena świateł jest w locie (samolot bez ziemi pod sobą) – do wyboru fazy samolotu. */
export const lightsAirborne = (s: LightsSim) => !s.ground;

/* ======================= tekstury i drobne elementy ======================= */

const getDot = getGlowTex;
const Dots = GlowDots;
const rgb = (hex: string) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
/* ======================= otoczenie nocą ======================= */

/** Nocne niebo z gwiazdami – kopuła jedzie razem z kamerą, więc nigdy się z niej nie wylatuje. */
function NightSky() {
  const grp = useRef<THREE.Group>(null);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#02040b');
    g.addColorStop(0.4, '#071022');
    g.addColorStop(0.49, '#16223a');
    g.addColorStop(0.52, '#080b12');
    g.addColorStop(1, '#030405');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const stars = useMemo(() => {
    const r = rng(11);
    const pts: number[] = [];
    const cols: number[] = [];
    for (let i = 0; i < 1500; i++) {
      const u = r() * 2 * Math.PI;
      const y = 0.06 + 0.94 * Math.pow(r(), 0.8);
      const k = Math.sqrt(1 - y * y);
      pts.push(Math.cos(u) * k * 380, y * 380, Math.sin(u) * k * 380);
      const b = 0.25 + 0.75 * Math.pow(r(), 3);
      const warm = r();
      cols.push(b * (warm > 0.8 ? 1 : 0.85), b * 0.9, b * (warm < 0.2 ? 1 : 0.85));
    }
    return { pts, cols };
  }, []);
  useFrame(({ camera }) => grp.current?.position.copy(camera.position));
  return (
    <group ref={grp}>
      <mesh renderOrder={-10} raycast={() => null}>
        <sphereGeometry args={[400, 32, 16]} />
        <meshBasicMaterial map={tex} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <Dots pts={stars.pts} colors={stars.cols} size={2.2} atten={false} renderOrder={-9} />
    </group>
  );
}

/** Światła miast i dróg daleko pod samolotem w locie – przesuwają się do tyłu, gdy samolot leci. */
const CITY_T = 700;
function CityBelow({ sim, show }: { sim: MutableRefObject<LightsSim>; show: () => boolean }) {
  const grp = useRef<THREE.Group>(null);
  const tile = useMemo(() => {
    const r = rng(5);
    const pts: number[] = [];
    const cols: number[] = [];
    const sodium = rgb('#ffae42');
    const white = rgb('#fff0d0');
    const blue = rgb('#a8d4ff');
    const put = (x: number, z: number, c: number[]) => {
      pts.push(((x + CITY_T * 1.5) % CITY_T) - CITY_T / 2, 0, ((z + CITY_T * 1.5) % CITY_T) - CITY_T / 2);
      cols.push(...c);
    };
    for (let k = 0; k < 26; k++) {
      const cx = r() * CITY_T;
      const cz = r() * CITY_T;
      const n = 40 + Math.floor(r() * 240);
      const sg = 10 + r() * 34;
      for (let i = 0; i < n; i++) {
        const a = r() * 2 * Math.PI;
        const d = sg * Math.sqrt(-2 * Math.log(Math.max(1e-6, r())));
        const q = r();
        put(cx + Math.cos(a) * d, cz + Math.sin(a) * d, q < 0.6 ? sodium : q < 0.95 ? white : blue);
      }
    }
    // drogi między miastami: rzędy latarni
    for (let k = 0; k < 9; k++) {
      const x0 = r() * CITY_T;
      const z0 = r() * CITY_T;
      const a = r() * Math.PI;
      for (let i = 0; i < 70; i++) put(x0 + Math.cos(a) * i * 9, z0 + Math.sin(a) * i * 9, sodium);
    }
    return { pts, cols };
  }, []);
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    g.visible = show();
    const s = sim.current;
    const w = (v: number) => (((v % CITY_T) + CITY_T) % CITY_T) - CITY_T / 2;
    g.position.set(w(s.scrollX), -230, w(s.scrollZ));
  });
  return (
    <group ref={grp}>
      {[-1, 0, 1].flatMap((i) =>
        [-1, 0, 1].map((j) => (
          <group key={i * 3 + j} position={[i * CITY_T, 0, j * CITY_T]}>
            <Dots pts={tile.pts} colors={tile.cols} size={2.4} opacity={0.9} />
          </group>
        )),
      )}
    </group>
  );
}

/** Płyta postojowa: wspólne lotnisko (runway.tsx) ustawione tak, że stanowisko jest pod samolotem. */
function Apron({ show }: { show: () => boolean }) {
  const grp = useRef<THREE.Group>(null);
  useFrame(() => {
    if (grp.current) grp.current.visible = show();
  });
  return (
    <group ref={grp}>
      <group position={[STAND.u, GROUND, -STAND.v]}>
        <AirportModel />
      </group>
    </group>
  );
}

/** Ruchomy świat: obrót o kurs samolotu i przesunięcie o jego położenie (samolot stoi w środku sceny). */
function MovingWorld({ sim, children }: { sim: MutableRefObject<LightsSim>; children: ReactNode }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = sim.current;
    if (outer.current) outer.current.rotation.y = -s.psi;
    if (inner.current) inner.current.position.set(-s.X, -s.h, -s.Z);
  });
  return (
    <group ref={outer}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

/** Zjazd z pasa na drogę kołowania – to samo lotnisko, przesunięte tak, że łuk zjazdu zaczyna się w x = TX.xTurn. */
function TaxiWorld({ sim }: { sim: MutableRefObject<LightsSim> }) {
  return (
    <MovingWorld sim={sim}>
      <group position={[TX.xTurn + EXIT.u, GROUND, 0]}>
        <AirportModel />
      </group>
    </MovingWorld>
  );
}

/* ======================= przy samolocie (układ samolotu) ======================= */

const P = EXT_LIGHT_POS;
const mirror = (p: V3): V3 => [p[0], p[1], -p[2]];

/**
 * Sektory świecenia świateł pozycyjnych w płaszczyźnie poziomej: czerwone na lewym skrzydle od nosa 110° w lewo,
 * zielone na prawym 110° w prawo, białe 140° do tyłu (z obu końcówek skrzydeł). Kąt a od nosa (+ w lewo).
 */
function Fan({ c, a0, a1, color, r = 24 }: { c: V3; a0: number; a1: number; color: string; r?: number }) {
  const edge = (a: number): V3 => [c[0] - Math.cos(a * DEG) * r, c[1], c[2] + Math.sin(a * DEG) * r];
  const arc = Array.from({ length: 33 }, (_, i) => edge(a0 + ((a1 - a0) * i) / 32));
  return (
    <group>
      <mesh position={c} rotation-x={Math.PI / 2} raycast={() => null}>
        <circleGeometry args={[r, 48, Math.PI - a1 * DEG, (a1 - a0) * DEG]} />
        <meshBasicMaterial color={color} transparent opacity={0.13} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <Line points={[edge(a0), c, edge(a1)]} color={color} lineWidth={1.4} transparent opacity={0.7} />
      <Line points={arc} color={color} lineWidth={1} transparent opacity={0.45} dashed dashSize={1.2} gapSize={0.8} />
    </group>
  );
}

/** Śnieg w chmurze: płatki lecą obok skrzydła i błyszczą tylko w wiązkach reflektorów (skrzydła i lądowania). */
function Snow({ sim }: { sim: MutableRefObject<LightsSim> }) {
  const N = 1600;
  const box = { x0: -34, x1: 34, y0: -7, y1: 10, z0: -4, z1: 40 };
  const geo = useMemo(() => {
    const r = rng(3);
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([box.x0 + r() * (box.x1 - box.x0), box.y0 + r() * (box.y1 - box.y0), box.z0 + r() * (box.z1 - box.z0)], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cones = useMemo(() => {
    const n = (v: V3) => new THREE.Vector3(...v).normalize();
    return [
      { lt: 'wing' as const, p: new THREE.Vector3(...P.scan), d: n([0.64, -0.09, 0.76]), cos: Math.cos(0.42), k: 1 },
      { lt: 'land' as const, p: new THREE.Vector3(...P.land), d: n([-1, -0.07, 0.07]), cos: Math.cos(0.17), k: 1.3 },
      { lt: 'land' as const, p: new THREE.Vector3(...mirror(P.land)), d: n([-1, -0.07, -0.07]), cos: Math.cos(0.17), k: 1.3 },
    ];
  }, []);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const ext = sim.current.ext;
    for (let i = 0; i < N; i++) {
      // opływ: płatki lecą wzdłuż +x (samolot leci w −x), lekko w dół
      let x = pos.getX(i) + 62 * dt;
      let y = pos.getY(i) - 1.5 * dt;
      if (x > box.x1) x -= box.x1 - box.x0;
      if (y < box.y0) y += box.y1 - box.y0;
      pos.setXYZ(i, x, y, pos.getZ(i));
      let b = 0.035;
      for (const c of cones) {
        if (!ext[c.lt]) continue;
        v.set(x, y, pos.getZ(i)).sub(c.p);
        const L = v.length();
        if (L < 0.5) continue;
        const ca = v.dot(c.d) / L;
        if (ca > c.cos) b = Math.max(b, c.k * Math.min(1, (ca - c.cos) / (1 - c.cos) * 3) * Math.max(0.25, 1 - L / 60));
      }
      col.setXYZ(i, b, b, b * 1.05);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <points geometry={geo} raycast={() => null}>
      <pointsMaterial map={getDot()} vertexColors size={0.22} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

/** Lód na krawędzi natarcia lewego skrzydła: nierówny, biały nalot – widać go dopiero w świetle reflektora skrzydła. */
function Ice() {
  const geo = useMemo(() => {
    const r = rng(9);
    const rs = Array.from({ length: 90 }, (_, i) => 4.2 + (i / 89) * 19);
    const noise = rs.map(() => 0.08 + r() * 0.1);
    const ring = [0.03, 0.012, 0, -0.012, -0.03];
    const pos: number[] = [];
    const idx: number[] = [];
    rs.forEach((rr, j) => {
      const le = wingSurface(rr, 0, 1);
      const back = wingSurface(rr, 0.08, 1);
      const d = new THREE.Vector3(le[0] - back[0], le[1] - back[1], le[2] - back[2]).normalize();
      const th = noise[j] * (0.7 + 0.3 * Math.sin(rr * 3.1));
      ring.forEach((sv) => {
        const s0 = Math.abs(sv);
        const p = wingSurface(rr, s0, sv >= 0 ? 1 : -1);
        const w = s0 === 0 ? 1 : s0 < 0.02 ? 0.65 : 0;
        const up = sv > 0 ? th * 0.35 * w : sv < 0 ? -th * 0.35 * w : 0;
        pos.push(p[0] + d.x * th * w, p[1] + d.y * th * w + up, p[2] + d.z * th * w);
      });
      if (j > 0) {
        const a = (j - 1) * ring.length;
        const b = j * ring.length;
        for (let k = 0; k < ring.length - 1; k++) idx.push(a + k, b + k, b + k + 1, a + k, b + k + 1, a + k + 1);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo} raycast={() => null}>
      <meshStandardMaterial color="#bcd9f5" roughness={0.25} metalness={0.1} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Elementy w układzie samolotu (jadą z nim): sektory świateł pozycyjnych, śnieg i lód przy skrzydle. */
export function LightsModel({ mode, sim, params }: { mode: LightsMode; sim: MutableRefObject<LightsSim>; params: Params }) {
  if (mode === 'nav' && params.view === 'sectors') {
    // podpis w połowie sektora, ok. 2/3 promienia od lampy
    const at = (c: V3, a: number, r: number): V3 => [c[0] - Math.cos(a * DEG) * r, c[1] + 0.5, c[2] + Math.sin(a * DEG) * r];
    return (
      <group>
        <Fan c={P.navL} a0={0} a1={110} color="#ff3b2f" r={30} />
        <Fan c={mirror(P.navL)} a0={-110} a1={0} color="#22e06b" r={30} />
        <Fan c={P.navTail} a0={110} a1={180} color="#f2f4f6" r={24} />
        <Fan c={mirror(P.navTail)} a0={180} a1={250} color="#f2f4f6" r={24} />
        <Tag pos={at(P.navL, 55, 20)} color="#ff8a80">
          czerwone · 110°
        </Tag>
        <Tag pos={at(mirror(P.navL), -55, 20)} color="#7ef0a6">
          zielone · 110°
        </Tag>
        <Tag pos={[P.navTail[0] + 20, P.navTail[1] + 0.5, 0]} color="#f2f4f6">
          białe · 140° do tyłu
        </Tag>
        <Tag pos={[P.navL[0] - 32, P.navL[1] + 0.5, 0]} color="#94a3b8">
          kierunek lotu ↑
        </Tag>
      </group>
    );
  }
  if (mode === 'wing')
    return (
      <>
        {params.snow !== false && <Snow sim={sim} />}
        {params.ice !== false && <Ice />}
      </>
    );
  return null;
}

/* ======================= panel EXT LT ======================= */

/**
 * Przełącznik dźwigienkowy Airbusa (tylko wskaźnik stanu): sześciokątna nakrętka, dźwignia w górę, w dół albo – w
 * środkowym położeniu – skierowana prosto na patrzącego (widać tylko jej główkę). Położenia opisane z prawej; bieżące
 * pogrubione, pozostałe przygaszone.
 */
function ToggleSw({ title, pos, sel }: { title: string; pos: string[]; sel: number }) {
  const n = pos.length;
  const cy = 30;
  const ys = n === 2 ? [10, 50] : [10, 30, 50];
  const id = useMemo(() => `k${Math.random().toString(36).slice(2, 8)}`, []);
  const mid = n === 3 && sel === 1;
  const up = sel === 0;
  const tipY = up ? 9 : 51;
  // sześciokąt nakrętki
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(15 + Math.cos(a) * 8.6).toFixed(2)},${(cy + Math.sin(a) * 8.6).toFixed(2)}`;
  }).join(' ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 50 }}>
      <div style={{ fontSize: 7.5, lineHeight: 1.1, fontWeight: 700, color: '#f2f4f6', textAlign: 'center', height: 18, display: 'flex', alignItems: 'flex-end', whiteSpace: 'pre-line', letterSpacing: '0.04em' }}>{title}</div>
      <svg width={50} height={60} viewBox="0 0 50 60" role="img" aria-label={`${title.replace('\n', ' ')}: ${pos[sel]}`}>
        <defs>
          <linearGradient id={`${id}l`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#8d949c" />
            <stop offset="0.45" stopColor="#f4f6f8" />
            <stop offset="1" stopColor="#7a828b" />
          </linearGradient>
          <radialGradient id={`${id}b`} cx="0.38" cy="0.32" r="0.75">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.55" stopColor="#c9ced4" />
            <stop offset="1" stopColor="#6b737c" />
          </radialGradient>
        </defs>
        {/* kreski położeń między dźwignią a napisami */}
        {ys.map((y, i) => (
          <line key={i} x1={24.5} x2={27.5} y1={y} y2={y} stroke="#cfd4da" strokeOpacity={i === sel ? 0.9 : 0.35} strokeWidth={0.8} />
        ))}
        {/* nakrętka i tulejka */}
        <polygon points={hex} fill="#2b3036" stroke="#8a929b" strokeWidth={0.7} />
        <circle cx={15} cy={cy} r={5.4} fill="#4a5058" stroke="#1b1f24" strokeWidth={0.6} />
        {mid ? (
          // dźwignia na wprost: tylko główka
          <>
            <circle cx={15.6} cy={cy + 0.8} r={4.6} fill="#000" opacity={0.35} />
            <circle cx={15} cy={cy} r={4.3} fill={`url(#${id}b)`} stroke="#4b5158" strokeWidth={0.5} />
          </>
        ) : (
          <>
            {/* cień dźwigni na panelu */}
            <path d={up ? `M14.2 ${cy} L16.6 ${cy} L17.6 ${tipY + 2} L13.8 ${tipY + 2} Z` : `M14.2 ${cy} L16.6 ${cy} L17.6 ${tipY - 2} L13.8 ${tipY - 2} Z`} fill="#000" opacity={0.3} />
            {/* trzon zwężający się ku nakrętce */}
            <path d={up ? `M13.6 ${cy} L16.4 ${cy} L17.1 ${tipY + 3} L12.9 ${tipY + 3} Z` : `M13.6 ${cy} L16.4 ${cy} L17.1 ${tipY - 3} L12.9 ${tipY - 3} Z`} fill={`url(#${id}l)`} stroke="#5d646c" strokeWidth={0.4} />
            <ellipse cx={15} cy={tipY} rx={3.6} ry={3.1} fill={`url(#${id}b)`} stroke="#4b5158" strokeWidth={0.5} />
          </>
        )}
        {pos.map((p, i) => (
          <text key={p} x={29.5} y={ys[i] + 2.7} fontSize={7.5} fontWeight={i === sel ? 700 : 400} fill={i === sel ? '#ffffff' : '#a9b1ba'} letterSpacing="0.03em">
            {p}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Panel EXT LT z panelu górnego – tylko pokazuje stan przełączników (przestawiają się same, jak u załogi). */
function ExtLtPanel({ sim }: { sim: MutableRefObject<LightsSim> }) {
  const s = sim.current.sw;
  const onOff = (v: boolean) => (v ? 0 : 1);
  const screw = (st: CSSProperties) => <span style={{ position: 'absolute', width: 5, height: 5, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #c9ced4, #4b5158)', ...st }} />;
  return (
    <div style={{ position: 'relative', pointerEvents: 'none', background: 'linear-gradient(#5f6872, #4d555e)', borderRadius: 5, padding: '6px 10px 5px', boxShadow: '0 4px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)', fontFamily: cockpitFont }}>
      {screw({ left: 4, top: 4 })}
      {screw({ right: 4, top: 4 })}
      {screw({ left: 4, bottom: 4 })}
      {screw({ right: 4, bottom: 4 })}
      {/* nagłówek jak na panelu Airbusa: napis przerywający białą linię */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 6px 2px' }}>
        <span style={{ flex: 1, height: 1, background: 'rgba(242,244,246,0.6)' }} />
        <span style={{ fontSize: 9, color: '#f2f4f6', fontWeight: 700, letterSpacing: '0.14em' }}>EXT LT</span>
        <span style={{ flex: 1, height: 1, background: 'rgba(242,244,246,0.6)' }} />
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        <ToggleSw title="STROBE" pos={['ON', 'AUTO', 'OFF']} sel={['ON', 'AUTO', 'OFF'].indexOf(s.strobe)} />
        <ToggleSw title="BEACON" pos={['ON', 'OFF']} sel={onOff(s.beacon)} />
        <ToggleSw title="WING" pos={['ON', 'OFF']} sel={onOff(s.wing)} />
        <ToggleSw title={'NAV &\nLOGO'} pos={['ON', 'OFF']} sel={onOff(s.navLogo)} />
        <ToggleSw title={'RWY\nTURN OFF'} pos={['ON', 'OFF']} sel={onOff(s.turnoff)} />
        <ToggleSw title="LAND" pos={['ON', 'OFF']} sel={onOff(s.land)} />
        <ToggleSw title="NOSE" pos={['T.O', 'TAXI', 'OFF']} sel={['T.O', 'TAXI', 'OFF'].indexOf(s.nose)} />
      </div>
    </div>
  );
}

/** Panel EXT LT jako osobny element – do doku innej sceny (np. lądowania z zakładek podwozia); odświeża się sam. */
export function LightsPanel({ sim }: { sim: MutableRefObject<LightsSim> }) {
  // panel jest w Html (osobne drzewo Reacta, bez pętli sceny) – sprawdza zmiany przełączników kilka razy na sekundę
  const [, set] = useState(0);
  const last = useRef(-1);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (sim.current.rev !== last.current) {
        last.current = sim.current.rev;
        set((n) => (n + 1) % 1e6);
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [sim]);
  return <ExtLtPanel sim={sim} />;
}

/* ======================= podpisy i nakładka ======================= */

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

/** Światła na stronie głównej: nazwa, opis, przełącznik i lampa, która świeci sama po kliknięciu. */
export const LIGHT_PARTS: Record<string, { name: string; color: string; lt: keyof ExtLights; sw: string; pos: V3; desc: string }> = {
  nav: {
    name: 'światła pozycyjne',
    color: '#fca5a5',
    lt: 'nav',
    sw: 'NAV & LOGO',
    pos: [P.navL[0] - 1.5, P.navL[1] + 1.2, P.navL[2] + 1.2],
    desc: 'Czerwone na końcówce lewego skrzydła, zielone na prawym – każde świeci od nosa 110° w swoją stronę. Po kolorach widać nocą, w którą stronę leci inny samolot. Świecą zawsze, gdy samolot ma zasilanie.',
  },
  navTail: {
    name: 'białe światła pozycyjne (tylne)',
    color: '#e2e8f0',
    lt: 'nav',
    sw: 'NAV & LOGO',
    pos: [P.navTail[0] + 2.2, P.navTail[1] + 1, P.navTail[2] - 0.5],
    desc: 'Z tyłu końcówek skrzydeł. Świecą do tyłu w sektorze 140° – kto widzi tylko białe światło, ma samolot przed sobą, oddalający się od niego.',
  },
  strobe: {
    name: 'strobo na końcówkach',
    color: '#f8fafc',
    lt: 'strobe',
    sw: 'STROBE',
    pos: [P.strobe[0] - 2.5, P.strobe[1] - 1.2, P.strobe[2] - 1.5],
    desc: 'Bardzo jasne, białe, podwójne błyski co ok. 1,1 s, widoczne z kilkunastu kilometrów. Świecą na pasie i przez cały lot. W położeniu AUTO zapalają się same, gdy podwozie główne nie dotyka ziemi.',
  },
  tailStrobe: {
    name: 'strobo w ogonie',
    color: '#f8fafc',
    lt: 'strobe',
    sw: 'STROBE',
    pos: [P.tailStrobe[0] + 1.6, P.tailStrobe[1] + 2.6, 0],
    desc: 'Pojedynczy biały błysk w stożku ogonowym, zgrany z błyskami na skrzydłach – razem widać samolot z każdej strony.',
  },
  beacon: {
    name: 'beacon górny',
    color: '#fca5a5',
    lt: 'beacon',
    sw: 'BEACON',
    pos: [P.beaconTop[0], P.beaconTop[1] + 1.5, 0],
    desc: 'Czerwone, migające światło ostrzegawcze na grzbiecie. Pilot włącza je tuż przed wypchnięciem i rozruchem silników, a wyłącza po ich zatrzymaniu – to sygnał dla obsługi: silniki pracują, nie podchodzić.',
  },
  beaconB: {
    name: 'beacon dolny',
    color: '#fca5a5',
    lt: 'beacon',
    sw: 'BEACON',
    pos: [P.beaconBottom[0] + 4, P.beaconBottom[1] - 2.6, 2.4],
    desc: 'Drugi beacon pod kadłubem, błyska razem z górnym – widać go z dołu i z boku, z płyty i z wieży.',
  },
  land: {
    name: 'reflektory lądowania',
    color: '#fde68a',
    lt: 'land',
    sw: 'LAND',
    pos: [P.land[0] - 1.5, P.land[1] - 1.4, P.land[2] + 2.2],
    desc: 'Dwa mocne reflektory w przedniej krawędzi skrzydeł, przy kadłubie, pod przezroczystą osłoną. Oświetlają pas przy starcie i lądowaniu, a w powietrzu poniżej ok. 3 km sprawiają, że samolot jest dobrze widoczny – także dla ptaków.',
  },
  taxi: {
    name: 'reflektory kołowania i startu',
    color: '#fde68a',
    lt: 'taxi',
    sw: 'NOSE',
    pos: [P.taxi[0] - 1.6, P.taxi[1] - 0.9, 1.4],
    desc: 'Na goleni przedniej: kołowania (szeroka wiązka, NOSE TAXI) i startu (wąska, daleka, NOSE T.O. zapala oba). Chowają się z podwoziem, więc po starcie gasną same.',
  },
  turnoff: {
    name: 'reflektory zjazdu z pasa',
    color: '#fde68a',
    lt: 'turnoff',
    sw: 'RWY TURN OFF',
    pos: [P.turnoff[0] - 1, P.turnoff[1] + 1.1, 2.4],
    desc: 'Też na goleni przedniej, skierowane ukośnie w lewo i w prawo. Oświetlają zakręt i pobocza, gdy samolot zjeżdża z pasa albo skręca na drodze kołowania.',
  },
  wing: {
    name: 'reflektor skrzydła',
    color: '#93c5fd',
    lt: 'wing',
    sw: 'WING',
    pos: [P.scan[0] + 0.5, P.scan[1] + 1.4, P.scan[2] + 0.6],
    desc: 'Na boku kadłuba przed skrzydłem. Oświetla przednią krawędź skrzydła i wlot silnika, żeby nocą sprawdzić, czy nie narasta lód. Włącza się go na chwilę, gdy trzeba.',
  },
  logo: {
    name: 'światła logo',
    color: '#c4b5fd',
    lt: 'logo',
    sw: 'NAV & LOGO',
    pos: [P.logo[0] + 2.5, P.logo[1] - 0.6, P.logo[2] + 3.4],
    desc: 'W statecznikach poziomych, świecą w górę na statecznik pionowy z logo linii. Działają z NAV & LOGO, ale tylko na ziemi albo przy wysuniętych klapach – przy starcie i lądowaniu samolot jest lepiej widoczny.',
  },
};

/** Przebiegi błysków (2,2 s) z bieżącą chwilą – beacon i strobo. */
function FlashTimeline({ sim }: { sim: MutableRefObject<LightsSim> }) {
  const [, set] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      set((n) => (n + 1) % 1e6);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const s = sim.current;
  const W = 2.2;
  const t0 = Math.floor(s.clock / W) * W;
  const rows: { name: string; b: 'beacon' | 'strobe' | 'strobe1'; on: boolean; color: string }[] = [
    { name: 'beacon (czerwony)', b: 'beacon', on: s.ext.beacon, color: '#ff5a4a' },
    { name: 'strobo – skrzydła', b: 'strobe', on: s.ext.strobe, color: '#f2f4f6' },
    { name: 'strobo – ogon', b: 'strobe1', on: s.ext.strobe, color: '#f2f4f6' },
  ];
  const X0 = 96;
  const WX = 196;
  return (
    <svg width="100%" viewBox="0 0 300 78" style={{ display: 'block' }}>
      {rows.map((r, j) => {
        const y = 8 + j * 24;
        let d = '';
        for (let i = 0; i <= 330; i++) {
          const u = (i / 330) * W;
          const l = blinkLevel(r.b, t0 + u);
          d += `${i ? 'L' : 'M'}${(X0 + (u / W) * WX).toFixed(1)} ${(y + 16 - l * 14).toFixed(1)}`;
        }
        return (
          <g key={r.name} opacity={r.on ? 1 : 0.3}>
            <text x={0} y={y + 13} fontSize={9.5} fill="currentColor">
              {r.name}
            </text>
            <line x1={X0} x2={X0 + WX} y1={y + 16} y2={y + 16} stroke="currentColor" strokeOpacity={0.25} />
            <path d={d} fill="none" stroke={r.color} strokeWidth={1.4} />
          </g>
        );
      })}
      <line x1={X0 + ((s.clock - t0) / W) * WX} x2={X0 + ((s.clock - t0) / W) * WX} y1={4} y2={76} stroke="#facc15" strokeWidth={1.2} />
      {[0, 1, 2].map((k) => (
        <text key={k} x={X0 + (k / W) * WX} y={78} fontSize={7.5} fill="currentColor" opacity={0.6} textAnchor="middle">
          {k} s
        </text>
      ))}
    </svg>
  );
}

/** Dok kokpitu zaczepiony zawsze przed kamerą (Html chowa się, gdy jego punkt jest za kamerą). */
function FrontAnchor({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!g.current) return;
    camera.getWorldDirection(v);
    v.multiplyScalar(12).add(camera.position);
    g.current.parent?.worldToLocal(v);
    g.current.position.copy(v);
  });
  return <group ref={g}>{children}</group>;
}

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
  return () => set((n) => (n + 1) % 1e6);
}

/**
 * Mapka z góry: obserwator na dole (patrzy w górę mapy), nasz samolot z sektorami świateł pozycyjnych i linia wzroku.
 * Widać, w który sektor patrzy obserwator – i dlaczego widzi akurat ten kolor.
 */
function NavMap({ sim }: { sim: MutableRefObject<LightsSim> }) {
  const [, set] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      set((n) => (n + 1) % 1e6);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const s = sim.current;
  const W = 260;
  const H = 190;
  const k = 0.24; // px na metr
  // świat: x – przed obserwatorem (w górę mapy), z – w prawo
  const map = (x: number, z: number): [number, number] => [W / 2 + z * k, H - 14 - (x - NAV_OBS[0]) * k];
  const [px, py] = map(s.X - 6, s.Z);
  const [ox, oy] = map(NAV_OBS[0], NAV_OBS[2]);
  // kurs na mapie: nos w świecie (−cos ψ, sin ψ) → na mapie (sin ψ, cos ψ) (y w dół)
  const ps = s.yaw * DEG;
  const rot = (Math.atan2(Math.sin(ps), -Math.cos(ps)) * 180) / Math.PI;
  const R = 38;
  // wycinek sektora w układzie samolotu (nos w górę, lewe skrzydło w lewo): kąty od nosa, + w lewo
  const wedge = (a0: number, a1: number) => {
    const pt = (a: number) => `${(-Math.sin(a * DEG) * R).toFixed(1)} ${(-Math.cos(a * DEG) * R).toFixed(1)}`;
    return `M0 0 L${pt(a0)} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 0 ${pt(a1)} Z`;
  };
  const seen = seenFrom(s.obsAz);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: 'rgba(5,8,14,0.6)', borderRadius: 6 }}>
      <line x1={ox} y1={oy} x2={px} y2={py} stroke="#facc15" strokeWidth={1.2} strokeDasharray="4 3" />
      <g transform={`translate(${px} ${py}) rotate(${rot})`}>
        <path d={wedge(0, 110)} fill="#ff3b2f" fillOpacity={seen.red ? 0.55 : 0.18} stroke="#ff3b2f" strokeWidth={0.8} />
        <path d={wedge(-110, 0)} fill="#22e06b" fillOpacity={seen.green ? 0.55 : 0.18} stroke="#22e06b" strokeWidth={0.8} />
        <path d={wedge(110, 250)} fill="#f2f4f6" fillOpacity={seen.white ? 0.5 : 0.12} stroke="#f2f4f6" strokeWidth={0.8} />
        {/* sylwetka samolotu nosem w górę */}
        <path d="M0 -11 L1.6 -6 L1.6 -1 L10 3 L10 5 L1.6 3 L1.2 8 L4 10 L4 11 L0 10 L-4 11 L-4 10 L-1.2 8 L-1.6 3 L-10 5 L-10 3 L-1.6 -1 L-1.6 -6 Z" fill="#e2e8f0" />
      </g>
      <path d={`M${ox} ${oy - 7} L${ox + 5} ${oy + 4} L${ox - 5} ${oy + 4} Z`} fill="#facc15" />
      <text x={ox + 8} y={oy + 4} fontSize={9} fill="#facc15">
        ty
      </text>
    </svg>
  );
}

/** Co widać z miejsca obserwatora (kąt od nosa samolotu, + w lewo). */
function seenFrom(a: number) {
  const red = a > -4 && a < 114;
  const green = a < 4 && a > -114;
  const white = Math.abs(a) > 106;
  const what = [red && 'czerwone', green && 'zielone', white && 'białe'].filter(Boolean).join(' i ');
  const meaning =
    red && green
      ? 'samolot leci prosto na ciebie!'
      : red && white
        ? 'widzisz lewy bok od tyłu – samolot oddala się w lewo'
        : green && white
          ? 'widzisz prawy bok od tyłu – samolot oddala się w prawo'
          : red
            ? 'widzisz lewy bok – samolot przecina twoją drogę z prawej na lewo'
            : green
              ? 'widzisz prawy bok – samolot przecina twoją drogę z lewej na prawo'
              : 'samolot oddala się od ciebie';
  return { red, green, white, what, meaning };
}

const SWITCH_TXT = (sw: ExtSw) => [`STROBE ${sw.strobe}`, `BEACON ${sw.beacon ? 'ON' : 'OFF'}`, `NOSE ${sw.nose}`, `LAND ${sw.land ? 'ON' : 'OFF'}`].join(' · ');

/** Otoczenie, panel EXT LT, podpisy i ramka informacji – zależnie od zakładki. */
export function LightsLab({ mode, sim, params, gear }: { mode: LightsMode; sim: MutableRefObject<LightsSim>; params: Params; gear?: MutableRefObject<GearLive> }) {
  const refresh = useTicker();
  const [sel, setSel] = useState<string | null>(null);
  const s = sim.current;
  useEffect(() => {
    sim.current.solo = mode === 'home' && sel ? LIGHT_PARTS[sel].lt : null;
  }, [mode, sel, sim]);
  useEffect(() => () => void (sim.current.solo = null), [sim]);
  const groundScene = mode === 'home' || mode === 'logo' || mode === 'anti' || mode === 'seq';
  const flightScene = mode === 'nav' || mode === 'anti' || mode === 'wing' || mode === 'seq';
  const seen = seenFrom(s.obsAz);
  const ph = SEQ[s.seq];
  return (
    <>
      <NightSky />
      {/* w chmurze (śnieg przy skrzydle) ziemi nie widać */}
      {flightScene && !(mode === 'wing' && params.snow !== false) && <CityBelow sim={sim} show={() => !sim.current.ground} />}
      {groundScene && <Apron show={() => sim.current.ground} />}
      {mode === 'taxi' && <TaxiWorld sim={sim} />}
      {/* przy lądowaniu panel jest w doku animacji lądowania (obok dźwigni ciągu i autobrake) */}
      {mode !== 'land' && (
        <FrontAnchor>
          <CockpitDock>
            <ExtLtPanel sim={sim} />
          </CockpitDock>
        </FrontAnchor>
      )}
      {mode === 'home' &&
        Object.entries(LIGHT_PARTS).map(([id, p]) => (
          <Tag key={id} pos={p.pos} color={p.color} active={sel === id} onClick={() => setSel(sel === id ? null : id)}>
            {p.name}
          </Tag>
        ))}
      <InfoPortal>
        {mode === 'home' &&
          (sel ? (
            <>
              <div style={{ fontWeight: 700, color: LIGHT_PARTS[sel].color }}>{LIGHT_PARTS[sel].name}</div>
              <div>{LIGHT_PARTS[sel].desc}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                przełącznik: <b>{LIGHT_PARTS[sel].sw}</b> · teraz świeci tylko ta grupa świateł – kliknij podpis jeszcze raz, żeby wrócić
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700 }}>Światła zewnętrzne nocą</div>
              <div>Samolot stoi gotowy do startu, wszystkie światła są zapalone. Kliknij podpis światła – zostanie zapalone tylko ono, z opisem. Panel EXT LT w lewym dolnym rogu pokazuje położenie przełączników.</div>
            </>
          ))}
        {mode === 'nav' && (
          <>
            <div style={{ fontWeight: 700 }}>{params.view === 'sectors' ? 'Sektory świateł pozycyjnych (widok z góry)' : `Widzisz: ${s.ext.nav ? seen.what || '–' : 'nic – włącz NAV & LOGO'}`}</div>
            {params.view !== 'sectors' && s.ext.nav && seen.what && <div>{seen.meaning}</div>}
            <NavMap sim={sim} />
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {params.view === 'sectors'
                ? 'Obróć kamerę myszą: z każdego kierunku widać inny zestaw świateł.'
                : `Patrzysz z kabiny drugiego samolotu. Kierunek do ciebie: ${fmt(Math.abs(s.obsAz), 0)}° od nosa ${s.obsAz > 1 ? 'w lewo' : s.obsAz < -1 ? 'w prawo' : ''}. Ruch zwolniony.`}
            </div>
          </>
        )}
        {mode === 'anti' && (
          <>
            <div style={{ fontWeight: 700 }}>{s.ground ? 'Na ziemi – STROBE AUTO nie błyska' : 'W powietrzu – STROBE AUTO błyska'}</div>
            <FlashTimeline sim={sim} />
            <div style={{ fontSize: 12, opacity: 0.8 }}>Błyski oświetlają też samolot – czerwony beacon barwi kadłub, strobo rozjaśnia końcówki skrzydeł i ogon.</div>
          </>
        )}
        {mode === 'land' &&
          gear &&
          (() => {
            const lv = gear.current;
            // PAPI: kąt, pod jakim pilot widzi lampy (te same progi co lampy przy pasie)
            const ang = (Math.atan2(lv.h + 2, PAPI_U - gearRunwayU(lv)) * 180) / Math.PI;
            const white = [0, 1, 2, 3].filter((i) => ang > GLIDE_DEG + 0.5 - i / 3).length;
            return (
              <>
                <div style={{ fontWeight: 700 }}>{landingPhase(lv.t, lv.v)}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1px 12px', fontSize: 13 }}>
                  <span>prędkość</span>
                  <b>{fmt(lv.v * 1.944, 0)} kt</b>
                  <span>koła nad pasem</span>
                  <b>{lv.u < 0 ? `${fmt(lv.h * 3.281, 0)} ft` : 'na pasie'}</b>
                  {lv.u < 0 && (
                    <>
                      <span>PAPI</span>
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {[3, 2, 1, 0].map((i) => (
                          <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < white ? '#fff3e0' : '#ff3b30', boxShadow: '0 0 4px rgba(255,255,255,0.4)' }} />
                        ))}
                        <span style={{ fontSize: 12, opacity: 0.8 }}>{white === 2 ? 'na ścieżce' : white > 2 ? 'nieco wysoko' : 'nieco nisko'}</span>
                      </span>
                    </>
                  )}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>To samo lądowanie co w zakładkach o podwoziu, tylko nocą. Gdy samolot zwolni do prędkości kołowania, załoga gasi reflektory lądowania (LAND), a zapala reflektor kołowania (NOSE TAXI) i reflektory boczne (RWY TURN OFF) – patrz na panel.</div>
              </>
            );
          })()}
        {mode === 'taxi' && (
          <>
            <div style={{ fontWeight: 700 }}>{s.dist < TX_L1 - 10 ? 'dobieg po pasie – zwalnianie przed zjazdem' : s.dist < TX_L1 + TX_ARC ? 'zjazd z pasa – skręt w prawo' : 'na drodze kołowania'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1px 12px', fontSize: 13 }}>
              <span>prędkość</span>
              <b>{fmt(s.v * 1.944, 0)} kt</b>
              <span>skręt koła przedniego</span>
              <b>{fmt(Math.abs(s.gear.steer) / DEG, 0)}°</b>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Zielone światła prowadzą osią drogi kołowania, niebieskie wyznaczają jej krawędzie, białe – krawędzie i oś pasa.</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Czas ok. 1,5× szybszy.</div>
          </>
        )}
        {mode === 'wing' && (
          <>
            <div style={{ fontWeight: 700 }}>{s.ext.wing ? 'WING ON – krawędź natarcia i gondola oświetlone' : 'WING OFF – skrzydła prawie nie widać'}</div>
            <div style={{ fontSize: 13 }}>{params.ice !== false ? 'Na przedniej krawędzi skrzydła narasta biały, nierówny lód – załoga włącza ogrzewanie skrzydeł (WING ANTI ICE).' : 'Przednia krawędź skrzydła jest czysta – lodu nie ma.'}</div>
            {params.snow !== false && <div style={{ fontSize: 12, opacity: 0.8 }}>Płatki śniegu błyszczą tylko tam, gdzie trafia wiązka reflektora – widać, dokąd świeci.</div>}
          </>
        )}
        {mode === 'logo' && (
          <>
            <div style={{ fontWeight: 700 }}>{s.ext.logo ? 'Logo oświetlone' : 'Logo w ciemności – włącz NAV & LOGO'}</div>
            <div style={{ fontSize: 13 }}>Na postoju i przy starcie oraz lądowaniu (klapy wysunięte) logo świeci samo, gdy NAV & LOGO jest ON. W przelocie, z klapami schowanymi, gaśnie.</div>
          </>
        )}
        {mode === 'seq' && (
          <>
            <div style={{ fontWeight: 700, color: '#facc15' }}>
              {s.seq + 1}/{SEQ.length}. {ph.name}
            </div>
            <div>{ph.desc}</div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }}>
              <div style={{ height: 4, borderRadius: 2, width: `${Math.min(100, (s.seqT / ph.dur) * 100)}%`, background: '#facc15' }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {SEQ.map((p, i) => (
                <span key={p.name} style={{ fontSize: 10.5, padding: '1px 5px', borderRadius: 4, background: i === s.seq ? 'rgba(250,204,21,0.25)' : 'rgba(255,255,255,0.07)', opacity: i === s.seq ? 1 : 0.7 }}>
                  {i + 1}. {p.name}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>{SWITCH_TXT(s.sw)}</div>
          </>
        )}
      </InfoPortal>
    </>
  );
}

/* ======================= zakładki ======================= */

/** Numery zakładek na modelu – przy świetle, o którym jest zakładka. */
export const LIGHTS_SPOTS: V3[] = [
  [-33.2, 2.9, 1.9], // strona główna – kabina pilotów (panel EXT LT)
  [P.navL[0] - 0.6, P.navL[1] + 0.7, P.navL[2] - 0.6], // pozycyjne
  [P.beaconTop[0] + 1.2, P.beaconTop[1] + 0.6, 0.6], // antykolizyjne
  [P.land[0] - 0.8, P.land[1] + 0.2, P.land[2] + 0.9], // lądowanie
  [P.taxi[0] - 0.6, P.taxi[1] + 0.3, -1.2], // kołowanie
  [P.scan[0] - 0.6, P.scan[1] + 0.6, P.scan[2] + 0.3], // skrzydło
  [P.logo[0] + 0.5, P.logo[1] + 0.6, P.logo[2] - 0.6], // logo
  [-31.5, 3.4, -1.5], // kolejność w locie
];

export function makeLightsSteps(plane: (s: Omit<Step, 'kind' | 'scene' | 'stageKey'>) => Step): Step[] {
  return [
    plane({
      title: 'Światła pozycyjne (NAV)',
      spot: LIGHTS_SPOTS[1],
      // widok z kabiny drugiego samolotu; sektory – z góry nad samolotem
      camera: [NAV_OBS[0], NAV_OBS[1], NAV_OBS[2]],
      target: [40, 9, 0],
      view: (p) => (p.view === 'sectors' ? { camera: [-30, 64, 50], target: [2, -2, 0] } : undefined),
      preset: { focus: 'lights', lights: 'nav' },
      controls: [
        {
          type: 'select',
          key: 'view',
          label: 'Samolot przed tobą',
          default: 'left',
          options: [
            { value: 'left', label: 'przecina drogę z prawej na lewo' },
            { value: 'right', label: 'przecina drogę z lewej na prawo' },
            { value: 'head', label: 'leci prosto na ciebie' },
            { value: 'away', label: 'oddala się od ciebie' },
            { value: 'sectors', label: 'sektory świateł – widok z góry' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Nocą z samolotu widać tylko jego światła. Żeby pilot innego samolotu wiedział, w którą stronę lecimy, <b>światła pozycyjne</b> świecą tylko w wyznaczonych kierunkach (sektorach): <b>czerwone</b> na końcu lewego skrzydła – od nosa 110° w lewo, <b>zielone</b> na prawym – 110° w prawo, a <b>białe</b> z tyłu – 140° do tyłu. Sektory prawie na siebie nie zachodzą.
          </p>
          <p>
            Patrzysz z kokpitu innego samolotu, nocą. Nasz samolot przelatuje przed tobą – widać tylko jego światła. Widzisz <b>czerwone</b>? To jego lewy bok – leci z prawej na lewo. <b>Zielone</b> – prawy bok, leci z lewej na prawo. <b>Czerwone i zielone naraz</b> – leci prosto na ciebie. <b>Tylko białe</b> – oddala się. Mapka w ramce pokazuje z góry, w który sektor patrzysz. Tak samo oznakowane są statki.
          </p>
          <p>Światła pozycyjne włącza przełącznik <b>NAV & LOGO</b>. Są zapalone zawsze, gdy samolot ma prąd – także na postoju.</p>
        </>
      ),
    }),
    plane({
      title: 'Beacon i strobo',
      spot: LIGHTS_SPOTS[2],
      camera: [-26, 24, 60],
      target: [2, -1, 0],
      preset: { focus: 'lights', lights: 'anti' },
      controls: [{ type: 'toggle', key: 'air', label: 'Samolot w powietrzu', default: true }],
      body: (
        <>
          <p>
            Światła ostrzegawcze błyskają, bo błysk przyciąga wzrok dużo lepiej niż stałe światło. Czerwone <b>beacony</b> na grzbiecie i pod brzuchem błyskają mniej więcej raz na sekundę. Piloci zapalają je tuż przed wypchnięciem i uruchomieniem silników. Dla ludzi na płycie to znak: silniki pracują albo zaraz ruszą – trzymaj się z daleka.
          </p>
          <p>
            Białe <b>stroboskopy</b> na końcach skrzydeł błyskają podwójnie, a na ogonie – pojedynczo. Są tak jasne, że na ziemi oślepiałyby innych, więc świecą dopiero na pasie startowym i w powietrzu. W położeniu <b>AUTO</b> zapalają się same, gdy koła oderwą się od ziemi – wyłącz „Samolot w powietrzu” i zobacz. W chmurach piloci czasem je gaszą, bo odbite błyski męczą oczy.
          </p>
          <p>Wykres w ramce pokazuje rytm błysków. Ustawienie przełączników STROBE i BEACON widać na panelu świateł w rogu ekranu.</p>
        </>
      ),
    }),
    plane({
      title: 'Reflektory lądowania',
      spot: LIGHTS_SPOTS[3],
      camera: [46, 9, 36],
      target: [-60, -9, 0],
      preset: { focus: 'lights', lights: 'land', gear: 'landing' },
      controls: [
        {
          type: 'select',
          key: 'ab',
          label: 'Autobrake',
          default: '3',
          options: [
            { value: 'LO', label: 'LO' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: 'HI', label: 'HI' },
          ],
        },
      ],
      body: (
        <>
          <p>
            To samo lądowanie co w zakładkach o podwoziu – wyrównanie, przyziemienie, spojlery, odwracacze ciągu i hamowanie – tylko nocą. Dwa <b>reflektory lądowania</b> w przedniej krawędzi skrzydeł przy kadłubie i reflektory na przedniej goleni oświetlają pas przed samolotem. Im niżej samolot, tym jaśniejsza plama światła na pasie. Gdy samolot zwolni do prędkości kołowania, załoga gasi reflektory lądowania i zapala światła kołowania – panel świateł w rogu przestawia się sam.
          </p>
          <p>
            Do pasa prowadzą <b>światła podejścia</b> – „biegnący” błysk wskazuje, gdzie zaczyna się pas. Zielone światła oznaczają <b>początek pasa</b>, białe – jego krawędzie i środek. Z lewej świecą cztery lampy <b>PAPI</b>, które mówią pilotowi, czy schodzi pod właściwym kątem: dwie białe i dwie czerwone – dobrze; więcej białych – za wysoko; więcej czerwonych – za nisko.
          </p>
          <p>
            Reflektory lądowania zapala się przy starcie i przy zniżaniu poniżej ok. 3 km: wtedy samolot lepiej widzą inni piloci – i ptaki. We mgle bywa odwrotnie: odbite światło oślepia, więc pilot może je zgasić.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Kołowanie i zjazd z pasa',
      spot: LIGHTS_SPOTS[4],
      camera: [46, 26, 52],
      target: [-45, -6, -10],
      preset: { focus: 'lights', lights: 'taxi' },
      body: (
        <>
          <p>
            Po wylądowaniu samolot zwalnia i skręca z pasa na drogę kołowania. Na przedniej goleni świeci <b>reflektor kołowania</b> – szeroka wiązka przed samolotem – a dwa <b>reflektory zjazdu z pasa</b> oświetlają ukośnie boki zakrętu, tam, gdzie samolot zaraz skręci.
          </p>
          <p>
            Przed startem pilot włącza jeszcze wąski, daleko sięgający <b>reflektor startowy</b>. Wszystkie reflektory na goleni chowają się razem z podwoziem, więc po starcie gasną same. Przed stanowiskiem pilot je wyłącza, żeby nie oślepiać obsługi naziemnej.
          </p>
          <p>Gdy samolot zjedzie z pasa, załoga gasi reflektory zjazdu – zobacz, jak znika światło po bokach.</p>
        </>
      ),
    }),
    plane({
      title: 'Oświetlenie skrzydła',
      spot: LIGHTS_SPOTS[5],
      camera: [-13, 1.8, 5.2],
      target: [0, -1.6, 13],
      preset: { focus: 'lights', lights: 'wing' },
      controls: [
        { type: 'toggle', key: 'ice', label: 'Lód na krawędzi natarcia', default: true },
        { type: 'toggle', key: 'snow', label: 'Lot w chmurze ze śniegiem', default: true },
      ],
      body: (
        <>
          <p>
            Patrzymy przez okno kabiny na lewe skrzydło – nocą, w chmurze. Na boku kadłuba przed skrzydłem jest <b>reflektor skrzydła</b>. Oświetla <b>przednią krawędź skrzydła</b> i <b>wlot silnika</b> – miejsca, na których lód osadza się najpierw.
          </p>
          <p>
            Załoga zapala go na chwilę, żeby sprawdzić, czy na skrzydle jest lód i czy działa ogrzewanie przeciw oblodzeniu. Tutaj reflektor zapala się co kilka sekund – gdy gaśnie, skrzydła prawie nie widać i lód łatwo przegapić. Płatki śniegu błyszczą tylko w świetle reflektorów – widać, dokąd one świecą.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Światła logo',
      spot: LIGHTS_SPOTS[6],
      camera: [54, 5, 34],
      target: [25, 4, 0],
      preset: { focus: 'lights', lights: 'logo' },
      body: (
        <>
          <p>
            Na górze poziomych „skrzydełek” ogona, przy kadłubie, są <b>światła logo</b>. Świecą w górę i oświetlają pionowy statecznik z logo linii lotniczej. To nie tylko reklama: jasno oświetlony ogon dobrze widać z wieży i z innych samolotów na lotnisku.
          </p>
          <p>
            Włącza je ten sam przełącznik co światła pozycyjne – <b>NAV & LOGO</b>. W Airbusach logo świeci jednak tylko na ziemi albo przy wysuniętych klapach, czyli przy starcie i lądowaniu. Co kilka sekund przełącznik na chwilę gaśnie – zobacz, jak ogon znika w ciemności.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Kiedy które światła',
      spot: LIGHTS_SPOTS[7],
      camera: [-40, 14, 50],
      target: [0, -1, 0],
      preset: { focus: 'lights', lights: 'seq' },
      body: (
        <>
          <p>
            Cały lot w jednej minucie: od postoju przy terminalu, przez wypchnięcie, kołowanie, start, przelot i lądowanie, z powrotem na stanowisko. Przełączniki na panelu świateł przestawiają się same, tak jak robi to załoga, a w ramce jest opis każdej fazy.
          </p>
          <p>
            Zasada jest prosta: <b>beacon</b> – gdy silniki pracują; <b>stroboskopy</b> i <b>reflektory lądowania</b> – na pasie i nisko (poniżej ok. 3 km); <b>reflektory na goleni</b> – na ziemi; <b>pozycyjne</b> – zawsze, gdy jest prąd.
          </p>
        </>
      ),
    }),
  ];
}
