/*
 * Zakładki aerodynamiki skrzydła na prawdziwym modelu samolotu.
 *
 * Wszystkie zakładki korzystają z tej samej sceny całego samolotu (stageKey „airliner”), więc między nimi nic się
 * nie przeładowuje: samolot płynnie „wycina się” do metrowego plastra skrzydła (profil, opływ, ciśnienie,
 * przeciągnięcie, klapy) albo leci w całości (siła nośna, wiry, zakręt). Kąt natarcia to pochylenie całego
 * samolotu względem poziomego napływu, a klapy i sloty to prawdziwa mechanizacja tego skrzydła.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Control, Params, Step } from '../../lib/types';
import { InfoPortal, fmt } from '../../lib/plot';
import { CockpitDock, ControlStack, Ecam, FlapLever, Nd, Pfd, SpeedBrakeLever, ThrustLevers } from '../../components/cockpit';
import { TrailMesh, Trails } from '../../lib/streaks';
import { useSpeedFmt } from '../../components/ui';
import { Arrow3D } from '../../lib/three';
import { useSceneHidden } from '../../lib/topicNav';
import { gammaKutta, isaRho, liftCoef, makeAirfoil, surfaceCp, velocity, type Airfoil } from './wingFlow';
import { MiniPlane, SLICE, WING_PIECE, W_TIP_Z, engineOrigin, mechPivots, sectionPieces, stationShift, wingSectionAt, wingSurface, wingTipPos, type Mech } from './airliner';

type V3 = [number, number, number];
const DEG = Math.PI / 180;
const G0 = 9.81;

/* ======================= dane samolotu i plastra ======================= */

/** Airbus A350-1000: powierzchnia skrzydeł, masa startowa i do lądowania, typowy przelot (M 0,85 na 11 km). */
const PLANE = { S: 464.3, mtow: 319000, mlw: 236000, v: 905, h: 11000, cl: 0.5, b: 64.75 };
const SEC = wingSectionAt(SLICE.r);
const P = new THREE.Vector3(...SEC.pivot);
/** Profil Żukowskiego zbliżony do przekroju skrzydła – na nim liczony jest opływ. */
const AF = makeAirfoil(0.1, 0.06);
const FK = SEC.c / AF.chord;
const FMID = (AF.xLE + AF.xTE) / 2;
/** Płaszczyzna rysowania opływu – środek plastra. */
const ZF = SLICE.r;

const toWorld = (x: number, y: number, a: number) => ({ x: x * Math.cos(a) + y * Math.sin(a), y: -x * Math.sin(a) + y * Math.cos(a) });
const toFoil = (x: number, y: number, a: number) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
/** Prędkość przepływu w układzie „świata” (napływ poziomy, profil zadarty o α). */
function worldVel(x: number, y: number, af: Airfoil, a: number, G: number) {
  const p = toFoil(x, y, a);
  const v = velocity({ re: p.x, im: p.y }, af, a, G);
  const w = toWorld(v.u, v.v, a);
  return { u: w.x, v: w.y, inside: v.inside };
}
/** Punkt z układu profilu (świat profilu) na scenę samolotu, w płaszczyźnie plastra. */
const toScene = (x: number, y: number, z = ZF): V3 => [P.x + (x - FMID) * FK, P.y + y * FK, z];

/* ======================= tryby zakładek ======================= */

export type LabMode = 'profile' | 'flow' | 'pressure' | 'stall' | 'flaps' | 'spoiler' | 'lift' | 'vortex' | 'turn';

/** Zakładka spojlerów: do czego w danej chwili służą (wychylenie w radianach, lotki, klapy, przechylenie). */
const SPOILER_USE: Record<string, { name: string; spoiler: number; aileron: number; bank: number; flaps: boolean }> = {
  air: { name: 'hamulce aerodynamiczne (w locie)', spoiler: 0.5, aileron: 0, bank: 0, flaps: false },
  ground: { name: 'gaszenie siły nośnej (po przyziemieniu)', spoiler: 0.87, aileron: 0, bank: 0, flaps: true },
  roll: { name: 'pomoc lotkom (przechylanie)', spoiler: 0, aileron: 0.3, bank: -18, flaps: false },
};
export const spoilerUseOf = (params: Params) => SPOILER_USE[String(params.use ?? 'air')] ?? SPOILER_USE.air;
const SLICE_MODES: LabMode[] = ['profile', 'flow', 'pressure', 'stall', 'flaps'];
export const isSliceMode = (m: unknown): m is LabMode => SLICE_MODES.includes(m as LabMode);

const CONFIGS: Record<string, { name: string; flap: number; fowler: number; slat: number; dCL: number; aCrit: number; note: string }> = {
  clean: { name: 'gładkie (przelot)', flap: 0, fowler: 0, slat: 0, dCL: 0, aCrit: 15.5, note: 'Najmniejszy opór – konfiguracja przelotowa.' },
  takeoff: { name: 'start', flap: 10, fowler: 0.45, slat: 1, dCL: 0.45, aCrit: 17.5, note: 'Klapy trochę wysunięte, sloty wysunięte: więcej siły nośnej przy niewielkim wzroście oporu – samolot szybciej się odrywa, a wciąż dobrze się wznosi.' },
  approach: { name: 'podejście', flap: 20, fowler: 0.75, slat: 1, dCL: 0.85, aCrit: 16, note: 'Wolniejszy lot przy podejściu do lądowania.' },
  landing: { name: 'lądowanie', flap: 32, fowler: 1, slat: 1, dCL: 1.35, aCrit: 14.5, note: 'Maksymalna siła nośna i duży opór – samolot leci wolno i stromo podchodzi do pasa, a opór pomaga hamować.' },
};

/** Wyświetlacz ECAM w zakładce klap: tryb ciągu i oznaczenie konfiguracji, jak w kokpicie A350. */
const FLAP_ECAM: Record<string, { conf: string; thr: [string, number] }> = {
  clean: { conf: '0', thr: ['CLB', 90] },
  takeoff: { conf: '1+F', thr: ['FLEX', 85] },
  approach: { conf: '3', thr: ['SPEED', 48] },
  landing: { conf: 'FULL', thr: ['SPEED', 42] },
};

const ALPHA_CRIT = 15.5;
function clGeneric(a: number, dCL: number, aCrit: number) {
  const a1 = aCrit - 3.5;
  const lin = (x: number) => 0.105 * (x + 2) + dCL;
  if (a <= a1) return lin(a);
  const top = lin(a1) + 0.11;
  if (a <= aCrit) {
    const k = (a - a1) / (aCrit - a1);
    return lin(a1) + 0.11 * (1 - (1 - k) * (1 - k));
  }
  return Math.max(top * 0.5, top - 0.09 * (a - aCrit) - 0.004 * (a - aCrit) ** 2);
}
const clOf = (a: number) => clGeneric(a, 0, ALPHA_CRIT);
const cdOf = (a: number) => 0.007 + 0.00011 * a * a + (a > ALPHA_CRIT - 2 ? 0.012 * Math.pow(a - (ALPHA_CRIT - 2), 1.4) : 0);

/** Wartości siły nośnej w zakładce „wzór” (wspólne dla sceny i pozy samolotu). */
function liftState(params: Params) {
  const v = Number(params.v ?? PLANE.v) / 3.6;
  const h = Number(params.h ?? PLANE.h);
  const cl = Number(params.cl ?? PLANE.cl);
  const m = (PLANE.mtow * Number(params.mass ?? 75)) / 100;
  const rho = isaRho(h);
  const q = 0.5 * rho * v * v;
  const L = q * PLANE.S * cl;
  const W = m * G0;
  return { v, h, cl, m, rho, q, L, W, ratio: L / W, vReq: Math.sqrt((2 * W) / (rho * PLANE.S * cl)) };
}

/** Pozycja samolotu w danej zakładce: oś obrotu, pochylenie (α), przechylenie, uniesienie, wycinek, klapy. */
export function labPose(mode: LabMode | null, params: Params) {
  const wide = { z0: -60, z1: 60, amp: 0 };
  if (!mode) return { pivot: [0, 0, 0] as V3, alpha: 0, bank: 0, lift: 0, clip: wide, mech: undefined as Mech | undefined, flight: false };
  const slice = isSliceMode(mode);
  const def: Record<string, number> = { profile: 5, flow: 6, pressure: 6, stall: 5 };
  const alpha = mode === 'flaps' ? 3 : slice ? Number(params.alpha ?? def[mode]) : mode === 'lift' ? 2.5 : 0;
  const cfg = CONFIGS[String(params.cfg ?? 'clean')];
  const su = mode === 'spoiler' ? spoilerUseOf(params) : null;
  const mech: Mech | undefined = mode === 'flaps' ? { flap: cfg.flap, fowler: cfg.fowler, slat: cfg.slat } : su?.flaps ? { flap: 32, fowler: 1, slat: 1 } : { flap: 0, fowler: 0, slat: 0 };
  let lift = 0;
  if (mode === 'lift') lift = Math.max(-1, Math.min(1, (liftState(params).ratio - 1) * 3)) * 3;
  return {
    pivot: slice ? (SEC.pivot as V3) : ([2, 0, 0] as V3),
    alpha,
    bank: mode === 'turn' ? -Number(params.bank ?? 30) : su ? su.bank : 0,
    spoiler: su ? su.spoiler : 0,
    aileron: su ? su.aileron : 0,
    lift,
    // przy klapach szerszy wycinek – slot, klapa i spojlery widać jako bryły
    // „większy wycinek”: ścianka cięcia zostaje w tym samym miejscu, a skrzydło sięga aż do kadłuba
    // „większy wycinek” = ten sam kawałek skrzydła wokół silnika co w zbliżeniu konstrukcji (bez nowego cięcia)
    clip: slice ? (params.wide ? WING_PIECE : mode === 'flaps' ? FLAP_CLIP : { z0: SLICE.z0, z1: SLICE.z1, amp: 0 }) : mode === 'vortex' && params.winglets === false ? { z0: -W_TIP_Z - 0.1, z1: W_TIP_Z + 0.1, amp: 0 } : wide,
    mech,
    flight: true,
  };
}

/** Bieżąca (płynnie dojeżdżająca) poza samolotu – współdzielona przez samolot i nakładki. */
/** Wychylenia sterów (rad), wynikające z manewru: lotki (dodatnie = przechylanie w prawo), ster wysokości, ster kierunku. */
export type Surfaces = { aileron: number; elevator: number; rudder: number; spoiler: number };
/** shift – przesunięcie całego samolotu po płycie (m), np. kołowanie przy zawracaniu na pasie; oś obrotu jedzie razem z nim. */
export type PoseState = { pivot: THREE.Vector3; shift: THREE.Vector3; alpha: number; bank: number; yaw: number; lift: number; bankRate: number; alphaRate: number; surf: Surfaces };
export const newPose = (): PoseState => ({ pivot: new THREE.Vector3(), shift: new THREE.Vector3(), alpha: 0, bank: 0, yaw: 0, lift: 0, bankRate: 0, alphaRate: 0, surf: { aileron: 0, elevator: 0, rudder: 0, spoiler: 0 } });
/**
 * Poza zadawana wprost przez scenę (zakładki sterowania: symulacja ruchu samolotu co klatkę). Gdy `active`,
 * driver pozy nie wygładza kątów, tylko je przepisuje (oś obrotu i uniesienie nadal dojeżdżają płynnie).
 */
/** snap – oś obrotu ustawiana od razu, bez płynnego dojazdu (np. zawracanie wokół środka zakrętu). */
export type DirectPose = { active: boolean; pivot: V3; alpha: number; bank: number; yaw: number; lift: number; surf: Surfaces; snap?: boolean; shift?: V3 };
export const newDirectPose = (): DirectPose => ({ active: false, pivot: [0, 0, 0], alpha: 0, bank: 0, yaw: 0, lift: 0, surf: { aileron: 0, elevator: 0, rudder: 0, spoiler: 0 } });

/** Wycinek w zakładce o klapach (szerszy niż przy profilu). */
const FLAP_CLIP = { z0: SLICE.z0, z1: SLICE.z1, amp: 0 };

/** Płynny dojazd pozy do celu (czas z zegara przeglądarki, więc działa też przy pauzie animacji). */
export function usePoseDriver(pose: PoseState, target: { pivot: V3; alpha: number; bank: number; lift: number; spoiler?: number; aileron?: number }, direct?: DirectPose) {
  const t = useRef(target);
  t.current = target;
  const last = useRef(0);
  useFrame(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - (last.current || now)) / 1000);
    last.current = now;
    const k = 1 - Math.exp(-dt * 2.6);
    if (direct?.active) {
      // zakładki sterowania: kąty i stery z symulacji sceny, oś obrotu i uniesienie – płynnie
      const sh = direct.shift ?? [0, 0, 0];
      if (direct.snap) {
        pose.pivot.set(direct.pivot[0], direct.pivot[1], direct.pivot[2]);
        pose.shift.set(sh[0], sh[1], sh[2]);
      } else {
        pose.shift.x += (sh[0] - pose.shift.x) * k;
        pose.shift.y += (sh[1] - pose.shift.y) * k;
        pose.shift.z += (sh[2] - pose.shift.z) * k;
        pose.pivot.x += (direct.pivot[0] - pose.pivot.x) * k;
        pose.pivot.y += (direct.pivot[1] - pose.pivot.y) * k;
        pose.pivot.z += (direct.pivot[2] - pose.pivot.z) * k;
      }
      pose.lift += (direct.lift - pose.lift) * Math.min(1, k * 4);
      pose.alpha = direct.alpha;
      pose.bank = direct.bank;
      pose.yaw = direct.yaw;
      pose.bankRate = 0;
      pose.alphaRate = 0;
      Object.assign(pose.surf, direct.surf);
      return;
    }
    // po wyjściu z zakładki sterowania odchylenie i przesunięcie wracają płynnie do zera
    pose.yaw += (0 - pose.yaw) * k;
    pose.shift.multiplyScalar(1 - k);
    pose.pivot.x += (t.current.pivot[0] - pose.pivot.x) * k;
    pose.pivot.y += (t.current.pivot[1] - pose.pivot.y) * k;
    pose.pivot.z += (t.current.pivot[2] - pose.pivot.z) * k;
    pose.lift += (t.current.lift - pose.lift) * k;
    // przechylanie jak w prawdziwym samolocie: prędkość przechylania ograniczona (ok. 15°/s), narasta i zanika
    // płynnie; lotki wychylają się proporcjonalnie do prędkości przechylania i wracają do zera po manewrze
    const rateTo = (cur: number, rate: number, target: number, maxRate: number, acc: number, gain: number) => {
      const want = Math.max(-maxRate, Math.min(maxRate, (target - cur) * gain));
      const r = rate + Math.max(-acc * dt, Math.min(acc * dt, want - rate));
      return [cur + r * dt, r];
    };
    [pose.bank, pose.bankRate] = rateTo(pose.bank, pose.bankRate, t.current.bank, 15, 22, 1.6);
    [pose.alpha, pose.alphaRate] = rateTo(pose.alpha, pose.alphaRate, t.current.alpha, 4, 8, 1.8);
    // przechylanie w prawo = malejące pose.bank (prawe skrzydło w dół)
    const rollRight = -pose.bankRate / 15;
    const n = 1 / Math.cos(Math.min(1.3, Math.abs(pose.bank) * DEG));
    const s = pose.surf;
    // lotki: z prędkości przechylania plus stałe wychylenie zadane w zakładce (spojlery wspomagające lotki)
    s.aileron = 0.32 * rollRight + (t.current.aileron ?? 0);
    // spojlery wysuwają się i chowają płynnie (siłowniki hydrauliczne)
    s.spoiler += ((t.current.spoiler ?? 0) - s.spoiler) * (1 - Math.exp(-dt * 3));
    s.rudder = 0.06 * rollRight;
    // ster wysokości: przy podnoszeniu nosa i przy obciążeniu w zakręcie (trzeba lekko ściągnąć drążek)
    s.elevator = 0.22 * (pose.alphaRate / 4) + 0.1 * (n - 1);
  });
}

/**
 * Grupa podążająca za samolotem: obrót o α (nosem w górę) i przechylenie wokół bieżącej osi, plus uniesienie.
 * W niej siedzi samolot i nakładki narysowane w jego układzie (np. cięciwa, strumienie przez szczeliny).
 */
export function FollowPlane({ pose, children }: { pose: PoseState; children: ReactNode }) {
  const outer = useRef<THREE.Group>(null);
  const rot = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!outer.current || !rot.current || !inner.current) return;
    outer.current.position.set(pose.pivot.x + pose.shift.x, pose.pivot.y + pose.lift + pose.shift.y, pose.pivot.z + pose.shift.z);
    // kolejność: odchylenie (wokół pionu samolotu), pochylenie, przechylenie
    rot.current.rotation.set(pose.bank * DEG, pose.yaw * DEG, -pose.alpha * DEG, 'XZY');
    inner.current.position.set(-pose.pivot.x, -pose.pivot.y, -pose.pivot.z);
  });
  return (
    <group ref={outer}>
      <group ref={rot}>
        <group ref={inner}>{children}</group>
      </group>
    </group>
  );
}

/* ======================= drobne elementy ======================= */

export function Tag({ pos, color = '#e2e8f0', children }: { pos: V3; color?: string; children: ReactNode }) {
  if (useSceneHidden()) return null;
  return (
    <Html position={pos} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
      <span className="engine-label" style={{ color, whiteSpace: 'nowrap' }}>
        {children}
      </span>
    </Html>
  );
}

/** Nakładka pojawia się dopiero, gdy kamera i wycinek prawie dojadą – bez wyskakiwania w trakcie przelotu. */
export function useReady(key: string, ms = 900) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const t = window.setTimeout(() => setReady(true), ms);
    return () => window.clearTimeout(t);
  }, [key, ms]);
  return ready;
}

/** Mały wykres w ramce informacji (SVG). */
function MiniChart({ curves, xr, yr, marks = [], xl, yl, shade }: { curves: { f: (x: number) => number; color: string; w?: number; dash?: string }[]; xr: [number, number]; yr: [number, number]; marks?: { x: number; y: number; color: string }[]; xl: string; yl: ReactNode; shade?: [number, number] }) {
  const W = 260;
  const H = 120;
  const X = (x: number) => ((x - xr[0]) / (xr[1] - xr[0])) * W;
  const Y = (y: number) => H - ((y - yr[0]) / (yr[1] - yr[0])) * H;
  return (
    <svg viewBox={`-6 -14 ${W + 12} ${H + 30}`} style={{ width: '100%', maxWidth: 300, display: 'block' }}>
      <text x="0" y="-4" fontSize="10" fill="rgba(255,255,255,0.7)">
        {yl}
      </text>
      {shade && <rect x={X(shade[0])} y={0} width={X(shade[1]) - X(shade[0])} height={H} fill="rgba(248,113,113,0.1)" />}
      <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="rgba(255,255,255,0.3)" />
      <line x1={X(0)} x2={X(0)} y1={0} y2={H} stroke="rgba(255,255,255,0.15)" />
      {curves.map((c, i) => (
        <path
          key={i}
          d={Array.from({ length: 90 }, (_, k) => xr[0] + ((xr[1] - xr[0]) * k) / 89)
            .map((x, k) => `${k ? 'L' : 'M'}${X(x).toFixed(1)},${Y(Math.max(yr[0], Math.min(yr[1], c.f(x)))).toFixed(1)}`)
            .join(' ')}
          fill="none"
          stroke={c.color}
          strokeWidth={c.w ?? 2}
          strokeDasharray={c.dash}
        />
      ))}
      {marks.map((m, i) => (
        <circle key={i} cx={X(m.x)} cy={Y(m.y)} r="4" fill={m.color} />
      ))}
      <text x={W} y={H + 13} fontSize="10" fill="rgba(255,255,255,0.5)" textAnchor="end">
        {xl}
      </text>
    </svg>
  );
}


/**
 * Opływ smugami – ten sam system co przepływ w silniku i smugi wzdłuż torów (wspólne wstęgi z lib/streaks):
 * cząstki poruszają się w obliczonym opływie profilu (napływ poziomy, α), a każda ciągnie za sobą wstęgę z jasną
 * głową i zanikającym ogonem, która wygina się razem z powietrzem wokół profilu.
 */
function StreakFlow({ alpha, count = 300, color = '#9bd7ff', wide = false }: { alpha: number; count?: number; color?: string; wide?: boolean }) {
  const G = gammaKutta(AF, alpha);
  const xMin = -3.4;
  const xMax = 4.6;
  const yMax = 1.9;
  // przy większym wycinku smugi płyną na całej jego szerokości i trochę poza nią;
  // przy cienkim plastrze – pasem szerszym niż plaster, z obu jego stron
  const zRange: [number, number] = wide ? [WING_PIECE.z0 - 1.5, WING_PIECE.z1 + 1.5] : [SLICE.z0 - 0.9, SLICE.z1 + 0.9];
  const spawn = () => {
    const z = zRange[0] + Math.random() * (zRange[1] - zRange[0]);
    return { x: xMin - Math.random() * 0.4, y: (Math.random() * 2 - 1) * yMax, z, sh: stationShift(z, SLICE.r) };
  };
  const st = useMemo(() => Array.from({ length: count }, () => ({ ...spawn(), x: xMin + Math.random() * (xMax - xMin) })), [count, wide]); // eslint-disable-line react-hooks/exhaustive-deps
  const mesh = useRef<TrailMesh>(null);
  const col = useMemo(() => new THREE.Color(color), [color]);
  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(0.05, dtRaw) * 1.2;
    st.forEach((p, pi) => {
      const v1 = worldVel(p.x, p.y, AF, alpha, G);
      let dead = v1.inside;
      if (!dead) {
        const v2 = worldVel(p.x + v1.u * dt * 0.5, p.y + v1.v * dt * 0.5, AF, alpha, G);
        dead = v2.inside;
        if (!dead) {
          const sp = Math.hypot(v2.u, v2.v);
          const cap = sp > 3.5 ? 3.5 / sp : 1;
          p.x += v2.u * dt * cap;
          p.y += v2.v * dt * cap;
        }
      }
      if (dead || p.x > xMax + 0.6) Object.assign(p, spawn());
      // brzegi pola: smuga gaśnie przy wejściu i wyjściu
      const edge = Math.max(0, Math.min(1, (p.x - xMin) / 0.5, (xMax + 0.6 - p.x) / 0.8));
      // przekrój na stacji z smugi: przesunięty wg skosu i wzniosu, cięciwa w skali
      const w0 = toScene(p.x, p.y, p.z);
      const w: V3 = wide ? [P.x + p.sh.dx + (w0[0] - P.x) * p.sh.k, P.y + p.sh.dy + (w0[1] - P.y) * p.sh.k, p.z] : w0;
      m.push(pi, w[0], w[1], w[2], 0.084, edge * 0.95);
      m.setColor(pi, col.r, col.g, col.b);
    });
  });
  return <Trails ref={mesh} count={count} opacity={1} length={18} />;
}

/**
 * Smugi wzdłuż zadanych torów (ten sam system co przepływ w silniku i opływ profilu – wspólne wstęgi z lib/streaks):
 * cząstki płyną po torach z lokalną prędkością, a każda zostawia wstęgę z jasną głową i zanikającym ogonem, która
 * wygina się razem z torem. Tory w układzie grupy, w której leży komponent.
 */
export function PathStreaks({ paths, speeds, count = 160, color = '#9bd7ff', speed = 6, trail = 2.4, width = 0.07, opacity = 0.95 }: { paths: V3[][]; speeds?: number[][]; count?: number; color?: string; speed?: number; trail?: number; width?: number; opacity?: number }) {
  const RES = 120;
  const mesh = useRef<TrailMesh>(null);
  // tory przepróbkowane do równych odcinków (szybkie położenie po długości łuku)
  const prep = useMemo(
    () =>
      paths
        .filter((p) => p.length > 1)
        .map((p, pi) => {
          const cum = [0];
          for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]));
          const L = cum[cum.length - 1] || 1;
          const pts = new Float32Array(RES * 3);
          const spd = new Float32Array(RES);
          let j = 0;
          for (let k = 0; k < RES; k++) {
            const sv = (k / (RES - 1)) * L;
            while (j < p.length - 2 && cum[j + 1] < sv) j++;
            const u = (sv - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
            for (let d = 0; d < 3; d++) pts[k * 3 + d] = p[j][d] + (p[j + 1][d] - p[j][d]) * u;
            const vv = speeds?.[pi];
            spd[k] = vv ? vv[j] + (vv[Math.min(j + 1, vv.length - 1)] - vv[j]) * u : 1;
          }
          return { pts, spd, L };
        }),
    [paths, speeds],
  );
  const st = useMemo(() => Array.from({ length: count }, (_, i) => ({ p: i % Math.max(1, prep.length), s: Math.random() })), [count, prep.length]);
  const col = useMemo(() => new THREE.Color(color), [color]);
  const pos = useMemo(() => new THREE.Vector3(), []);
  // długość ogona w klatkach: tyle, ile cząstka przebywa drogi `trail` przy prędkości `speed` (ok. 60 klatek/s)
  const len = Math.max(6, Math.min(28, Math.round((trail / Math.max(0.1, speed)) * 60)));
  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!prep.length || !m) return;
    const dt = Math.min(0.05, dtRaw);
    const at = (q: (typeof prep)[number], sv: number, out: THREE.Vector3) => {
      const fr = Math.max(0, Math.min(1, sv)) * (RES - 1);
      const i = Math.min(RES - 2, Math.floor(fr));
      const u = fr - i;
      out.set(q.pts[i * 3] + (q.pts[i * 3 + 3] - q.pts[i * 3]) * u, q.pts[i * 3 + 1] + (q.pts[i * 3 + 4] - q.pts[i * 3 + 1]) * u, q.pts[i * 3 + 2] + (q.pts[i * 3 + 5] - q.pts[i * 3 + 2]) * u);
      return q.spd[i] + (q.spd[i + 1] - q.spd[i]) * u;
    };
    st.forEach((p, pi) => {
      const v = at(prep[p.p % prep.length], p.s, pos);
      p.s += (v * speed * dt) / prep[p.p % prep.length].L;
      if (p.s > 1) {
        p.s = 0;
        p.p = Math.floor(Math.random() * prep.length);
      }
      at(prep[p.p % prep.length], p.s, pos);
      // wejście i wyjście z toru: smuga łagodnie się pojawia i gaśnie
      const edge = Math.max(0, Math.min(1, p.s / 0.06, (1 - p.s) / 0.08));
      m.push(pi, pos.x, pos.y, pos.z, width, edge);
      m.setColor(pi, col.r, col.g, col.b);
    });
  });
  return <Trails ref={mesh} count={count} opacity={opacity} length={len} />;
}

/**
 * Pełne przekroje części skrzydła na ściankach plastra przy wysuniętej mechanizacji: stała część, slot i klapa.
 * Slot i klapa obracają się wokół tych samych osi i w tym samym tempie co w modelu.
 */
function MechCaps({ pose, cfg }: { pose: PoseState; cfg: { flap: number; slat: number } }) {
  const g = useMemo(() => {
    const pc = sectionPieces(SLICE.r);
    const shape = (pts: [number, number][]) => {
      const s = new THREE.Shape();
      pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      s.closePath();
      return new THREE.ShapeGeometry(s, 1);
    };
    return { main: shape(pc.main), slat: shape(pc.slat), flap: shape(pc.flap), pv: mechPivots(SLICE.r) };
  }, []);
  useEffect(() => () => [g.main, g.slat, g.flap].forEach((x) => x.dispose()), [g]);
  const slatR = useRef<(THREE.Group | null)[]>([]);
  const flapR = useRef<(THREE.Group | null)[]>([]);
  const cur = useRef({ s: 0, f: 0 });
  const last = useRef(0);
  useFrame(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - (last.current || now)) / 1000);
    last.current = now;
    const k = 1 - Math.exp(-dt * 2.4);
    cur.current.s += (cfg.slat - cur.current.s) * k;
    cur.current.f += (cfg.flap - cur.current.f) * k;
    slatR.current.forEach((o) => o && (o.rotation.z = 0.26 * cur.current.s));
    flapR.current.forEach((o) => o && (o.rotation.z = -cur.current.f * DEG));
  });
  const mat = <meshStandardMaterial color="#aab3bd" roughness={0.7} metalness={0.05} side={THREE.DoubleSide} />;
  return (
    <FollowPlane pose={pose}>
      {[SLICE.z0 + 0.002, SLICE.z1 - 0.002].map((z, i) => (
        <group key={z} position={[0, 0, z]}>
          <mesh geometry={g.main} raycast={() => null}>{mat}</mesh>
          <group position={[g.pv.slat[0], g.pv.slat[1], 0]}>
            <group ref={(o) => (slatR.current[i] = o)}>
              <mesh geometry={g.slat} position={[-g.pv.slat[0], -g.pv.slat[1], 0]} raycast={() => null}>{mat}</mesh>
            </group>
          </group>
          <group position={[g.pv.flap[0], g.pv.flap[1], 0]}>
            <group ref={(o) => (flapR.current[i] = o)}>
              <mesh geometry={g.flap} position={[-g.pv.flap[0], -g.pv.flap[1], 0]} raycast={() => null}>{mat}</mesh>
            </group>
          </group>
        </group>
      ))}
    </FollowPlane>
  );
}

/** Linie prądu opływu profilu (w układzie profilu) przeliczone na tory w scenie; z – płaszczyzna rysowania. */
function streamPaths(af: Airfoil, alpha: number, ys: number[], zs: number[], G = gammaKutta(af, alpha)) {
  const paths: V3[][] = [];
  const speeds: number[][] = [];
  ys.forEach((y0, i) => {
    const p = { x: -3.6, y: y0 };
    const pts: V3[] = [];
    const sv: number[] = [];
    for (let k = 0; k < 600; k++) {
      const v = worldVel(p.x, p.y, af, alpha, G);
      if (v.inside) break;
      const sp = Math.hypot(v.u, v.v) || 1;
      if (k % 3 === 0) {
        pts.push(toScene(p.x, p.y, zs[i % zs.length]));
        sv.push(Math.min(2.6, sp));
      }
      p.x += (v.u / sp) * 0.035;
      p.y += (v.v / sp) * 0.035;
      if (p.x > 4.8) break;
    }
    if (pts.length > 4) {
      paths.push(pts);
      speeds.push(sv);
    }
  });
  return { paths, speeds };
}
/** Płaszczyzny rysowania smug: pas szerszy niż wycinek, z obu jego stron. */
const ZS = (z0: number, z1: number) => [z1 + 0.08, z0 - 0.08, z1 + 0.35, z0 - 0.35, z1 + 0.65, z0 - 0.65];

/** Pełny przekrój na ściankach cięcia plastra – żeby było widać kształt profilu, a nie puste wnętrze. */
function SectionCap({ pose, wide = false }: { pose: PoseState; wide?: boolean }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    const pts = [...SEC.up, ...[...SEC.lo].reverse().slice(1, -1)];
    pts.forEach((p, i) => (i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1])));
    shape.closePath();
    return new THREE.ShapeGeometry(shape, 1);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <FollowPlane pose={pose}>
      {(wide ? [SLICE.z1 - 0.002] : [SLICE.z0 + 0.002, SLICE.z1 - 0.002]).map((z) => (
        <mesh key={z} geometry={geo} position={[0, 0, z]} raycast={() => null}>
          <meshStandardMaterial color="#aab3bd" roughness={0.7} metalness={0.05} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </FollowPlane>
  );
}

/* ======================= 1. budowa profilu ======================= */

function ProfileOverlay({ params, pose }: { params: Params; pose: PoseState }) {
  const alpha = Number(params.alpha ?? 5);
  const labels = Boolean(params.labels ?? true);
  const z = SLICE.z1 + 0.04;
  const geo = useMemo(() => {
    const at = (p: V3): V3 => [p[0], p[1], z];
    const camber = SEC.up.map((u, i) => at([(u[0] + SEC.lo[i][0]) / 2, (u[1] + SEC.lo[i][1]) / 2, 0]));
    let iT = 0;
    SEC.up.forEach((u, i) => {
      if (u[1] - SEC.lo[i][1] > SEC.up[iT][1] - SEC.lo[iT][1]) iT = i;
    });
    const t = (SEC.up[iT][1] - SEC.lo[iT][1]) / SEC.c;
    return { camber, tTop: at(SEC.up[iT]), tBot: at(SEC.lo[iT]), t, le: at(SEC.le), te: at(SEC.te) };
  }, [z]);
  // kąt natarcia: łuk w układzie świata, od poziomu do cięciwy
  const R = 3.4;
  const arc = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const a = (-alpha * DEG * i) / 23;
    return [P.x + R * Math.cos(a), P.y + R * Math.sin(a), z] as V3;
  }), [alpha, z]);
  return (
    <>
      {!params.wide && <StreakFlow alpha={alpha * DEG} count={240} />}
      <Line points={[[P.x - 2, P.y, z], [P.x + 7.5, P.y, z]]} color="#7dd3fc" lineWidth={1.2} dashed dashSize={0.3} gapSize={0.25} />
      {Math.abs(alpha) > 0.4 && <Line points={arc} color="#fb923c" lineWidth={2.5} />}
      {labels && (
        <Tag pos={[P.x + R + 1.6, P.y - (R * Math.sin(alpha * DEG)) / 2, z]} color="#fb923c">
          α = {fmt(alpha, 0)}°
        </Tag>
      )}
      <FollowPlane pose={pose}>
        <Line points={[geo.le, geo.te]} color="#facc15" lineWidth={2} dashed dashSize={0.35} gapSize={0.22} />
        <Line points={geo.camber} color="#c084fc" lineWidth={2} />
        <Line points={[geo.tTop, geo.tBot]} color="#4ade80" lineWidth={2.5} />
        <mesh position={geo.le}>
          <sphereGeometry args={[0.13, 14, 10]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
        <mesh position={geo.te}>
          <sphereGeometry args={[0.13, 14, 10]} />
          <meshBasicMaterial color="#f472b6" />
        </mesh>
        {labels && (
          <>
            <Tag pos={[geo.le[0] - 0.4, geo.le[1] - 1.0, z]} color="#38bdf8">
              krawędź natarcia
            </Tag>
            <Tag pos={[geo.te[0] + 0.6, geo.te[1] - 0.9, z]} color="#f472b6">
              krawędź spływu
            </Tag>
            <Tag pos={[(geo.le[0] + geo.te[0]) / 2 + 1.5, (geo.le[1] + geo.te[1]) / 2 - 1.2, z]} color="#facc15">
              cięciwa c = {fmt(SEC.c, 1)} m
            </Tag>
            <Tag pos={[geo.tTop[0], geo.tTop[1] + 1.0, z]} color="#4ade80">
              grubość {fmt(geo.t * 100, 0)}% c
            </Tag>
            <Tag pos={[geo.camber[40][0] + 1.2, geo.camber[40][1] + 1.6, z]} color="#c084fc">
              linia szkieletowa
            </Tag>
          </>
        )}
      </FollowPlane>
      <InfoPortal>
        <div style={{ fontWeight: 700 }}>Przekrój prawdziwego skrzydła</div>
        <div>
          Cienki plaster lewego skrzydła, {fmt(SLICE.r, 1)} m od osi kadłuba. Cięciwa ma tu {fmt(SEC.c, 1)} m, grubość ok. {fmt(geo.t * 100, 0)}% cięciwy. To profil <b>nadkrytyczny</b>: płaski z wierzchu, z wybrzuszonym spodem przy krawędzi spływu – opóźnia powstawanie fali uderzeniowej przy prędkości bliskiej dźwięku.
        </div>
        <div style={{ opacity: 0.75 }}>Kąt natarcia α to kąt między cięciwą a napływem powietrza – tu cały samolot unosi nos, a powietrze płynie poziomo.</div>
      </InfoPortal>
    </>
  );
}

/* ======================= 2. opływ ======================= */

type Pcl = { x: number; y: number; trail: number[] };

function FlowOverlay({ params }: { params: Params }) {
  const alpha = Number(params.alpha ?? 6) * DEG;
  const view = String(params.view ?? 'smugi');
  const pressure = Boolean(params.pressure ?? true);
  const G = gammaKutta(AF, alpha);
  const xMin = -3.4;
  const xMax = 4.6;
  const yMax = 2.0;
  // pole ciśnienia za plastrem (tekstura)
  const tex = useMemo(() => {
    const gw = 200;
    const gh = Math.round((gw * 2 * yMax) / (xMax - xMin));
    const c = document.createElement('canvas');
    c.width = gw;
    c.height = gh;
    const x2 = c.getContext('2d')!;
    const img = x2.createImageData(gw, gh);
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        const x = xMin + ((i + 0.5) / gw) * (xMax - xMin);
        const y = yMax - ((j + 0.5) / gh) * 2 * yMax;
        const v = worldVel(x, y, AF, alpha, G);
        const o = (j * gw + i) * 4;
        if (v.inside) continue;
        const cp = 1 - (v.u * v.u + v.v * v.v);
        // brzegi gasną, żeby pole nie kończyło się ostrą krawędzią
        const edge = Math.min(1, i / 18, (gw - i) / 18, j / 12, (gh - j) / 12);
        if (cp < 0) {
          const a = Math.min(1, -cp / 1.6);
          img.data.set([40, 120, 255, Math.round(a * 190 * edge)], o);
        } else {
          const a = Math.min(1, cp / 0.9);
          img.data.set([255, 90, 60, Math.round(a * 190 * edge)], o);
        }
      }
    x2.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [alpha, G]);
  useEffect(() => () => tex.dispose(), [tex]);
  // smugi albo linie czasu: jedna geometria odcinków aktualizowana co klatkę
  const N = 230;
  const TR = 12;
  const MAXV = N * (TR - 1) * 2;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXV * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, [MAXV]);
  useEffect(() => () => geo.dispose(), [geo]);
  const st = useRef<{ ps: Pcl[]; lines: { pts: { x: number; y: number; dead: boolean }[]; hue: number }[]; last: number }>({ ps: [], lines: [], last: -10 });
  useEffect(() => {
    st.current = { ps: [], lines: [], last: -10 };
  }, [view, alpha]);
  const step = (p: { x: number; y: number }, d: number) => {
    const v1 = worldVel(p.x, p.y, AF, alpha, G);
    if (v1.inside) return true;
    const v2 = worldVel(p.x + v1.u * d * 0.5, p.y + v1.v * d * 0.5, AF, alpha, G);
    if (v2.inside) return true;
    const sp = Math.hypot(v2.u, v2.v);
    const cap = sp > 3.5 ? 3.5 / sp : 1;
    p.x += v2.u * d * cap;
    p.y += v2.v * d * cap;
    return false;
  };
  const matA = useRef<THREE.LineBasicMaterial>(null);
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw) * 1.4;
    const s = st.current;
    if (view === 'smugi') {
      // smugi rysuje StreakFlow (jak przepływ w silniku)
      geo.setDrawRange(0, 0);
      return;
    }
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    let n = 0;
    const put = (x: number, y: number) => {
      const w = toScene(x, y, ZF);
      arr[n * 3] = w[0];
      arr[n * 3 + 1] = w[1];
      arr[n * 3 + 2] = w[2];
      n++;
    };
    if (view === 'smugi') {
      while (s.ps.length < N) s.ps.push({ x: xMin + Math.random() * (xMax - xMin), y: (Math.random() * 2 - 1) * yMax, trail: [] });
      for (const p of s.ps) {
        let dead = false;
        for (let k = 0; k < 2 && !dead; k++) dead = step(p, dt / 2);
        if (dead || p.x > xMax) {
          p.x = xMin - Math.random() * 0.4;
          p.y = (Math.random() * 2 - 1) * yMax;
          p.trail = [];
          continue;
        }
        p.trail.push(p.x, p.y);
        if (p.trail.length > TR * 2) p.trail.splice(0, 2);
        for (let i = 2; i < p.trail.length && n < MAXV - 2; i += 2) {
          put(p.trail[i - 2], p.trail[i - 1]);
          put(p.trail[i], p.trail[i + 1]);
        }
      }
      if (matA.current) matA.current.color.set('#e2f0ff');
    } else {
      const t = clock.elapsedTime;
      if (t - s.last > 1.7) {
        s.last = t;
        s.lines.push({ pts: Array.from({ length: 60 }, (_, i) => ({ x: xMin + 0.2, y: yMax * (1 - (2 * (i + 0.5)) / 60) * 0.95, dead: false })), hue: s.lines.length % 2 });
        if (s.lines.length > 7) s.lines.shift();
      }
      for (const L of s.lines) {
        for (const p of L.pts) for (let k = 0; k < 3 && !p.dead; k++) p.dead = step(p, dt / 3);
        for (let i = 1; i < L.pts.length && n < MAXV - 2; i++) {
          const a = L.pts[i - 1];
          const b = L.pts[i];
          if (a.dead || b.dead || Math.hypot(a.x - b.x, a.y - b.y) > 0.6) continue;
          put(a.x, a.y);
          put(b.x, b.y);
        }
      }
      s.lines = s.lines.filter((L) => L.pts.some((p) => !p.dead && p.x < xMax));
      if (matA.current) matA.current.color.set('#facc15');
    }
    pos.needsUpdate = true;
    geo.setDrawRange(0, n);
    geo.computeBoundingSphere();
  });
  const CL = liftCoef(AF, alpha);
  const W = (xMax - xMin) * FK;
  const H = 2 * yMax * FK;
  const cx = toScene((xMin + xMax) / 2, 0, SLICE.z0 - 0.12);
  return (
    <>
      {pressure && (
        <mesh position={cx} raycast={() => null}>
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial map={tex} transparent depthWrite={false} />
        </mesh>
      )}
      {view === 'smugi' && !params.wide && <StreakFlow alpha={alpha} count={300} />}
      <lineSegments geometry={geo} raycast={() => null}>
        <lineBasicMaterial ref={matA} color="#e2f0ff" transparent opacity={view === 'smugi' ? 0.6 : 0.95} depthWrite={false} />
      </lineSegments>
      {CL > 0.02 && <Arrow3D from={[P.x - 0.5, P.y + 1.2, ZF]} vec={[0, CL * 2.6, 0]} color="#4ade80" radius={0.12} />}
      {CL > 0.02 && (
        <Tag pos={[P.x + 1.1, P.y + 1.6 + CL * 2.6, ZF]} color="#4ade80">
          siła nośna
        </Tag>
      )}
      <InfoPortal>
        <div>
          C<sub>L</sub> = {fmt(CL, 2)} (teoria przepływu potencjalnego)
        </div>
        {pressure && (
          <div>
            <span style={{ color: '#60a5fa' }}>niebieski</span> – ciśnienie niższe od otoczenia, <span style={{ color: '#f87171' }}>czerwony</span> – wyższe
          </div>
        )}
        {view === 'czas' && <div style={{ opacity: 0.8 }}>Linie czasu: punkty wypuszczone razem. Górne docierają do krawędzi spływu wcześniej niż dolne – nie spotykają się ponownie!</div>}
      </InfoPortal>
    </>
  );
}

/* ======================= 3. rozkład ciśnienia ======================= */

function PressureOverlay({ params }: { params: Params }) {
  const alpha = Number(params.alpha ?? 6) * DEG;
  const pts = useMemo(() => surfaceCp(AF, alpha, 160), [alpha]);
  const CL = liftCoef(AF, alpha);
  const arrows = useMemo(() => {
    const out: { from: V3; vec: V3; color: string }[] = [];
    for (let i = 3; i < pts.length - 3; i += 5) {
      const a = toWorld(pts[i - 1].x, pts[i - 1].y, alpha);
      const b = toWorld(pts[i + 1].x, pts[i + 1].y, alpha);
      const c = toWorld(pts[i].x, pts[i].y, alpha);
      let nx = b.y - a.y;
      let ny = -(b.x - a.x);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const cp = Math.max(-3, Math.min(1, pts[i].cp));
      const L = Math.abs(cp) * 0.5;
      const base = toScene(c.x, c.y, SLICE.z1 + 0.06);
      if (cp < 0) out.push({ from: base, vec: [nx * L * FK, ny * L * FK, 0], color: '#60a5fa' });
      else {
        const tip = toScene(c.x + nx * L, c.y + ny * L, SLICE.z1 + 0.06);
        out.push({ from: tip, vec: [-nx * L * FK, -ny * L * FK, 0], color: '#f87171' });
      }
    }
    return out;
  }, [pts, alpha]);
  let iLE = 0;
  pts.forEach((p, i) => {
    if (p.x < pts[iLE].x) iLE = i;
  });
  const upper = pts.slice(0, iLE + 1);
  const lower = pts.slice(iLE);
  const interp = (arr: typeof pts) => (u: number) => {
    const x = AF.xLE + u * AF.chord;
    let best = arr[0];
    for (const p of arr) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    return Math.min(3, -best.cp);
  };
  const qc = toWorld(AF.xLE + AF.chord * 0.25 , 0, alpha);
  return (
    <>
      {!params.wide && <StreakFlow alpha={alpha} count={120} color="#5f8fb5" />}
      {arrows.map((a, i) => (
        <Arrow3D key={i} from={a.from} vec={a.vec} color={a.color} radius={0.045} />
      ))}
      {CL > 0.02 && <Arrow3D from={toScene(qc.x, qc.y + 0.3, SLICE.z1 + 0.1)} vec={[0, CL * 2.6, 0]} color="#4ade80" radius={0.14} />}
      {CL > 0.02 && (
        <Tag pos={toScene(qc.x + 0.6, qc.y + 0.6 + (CL * 2.6) / FK, SLICE.z1 + 0.1)} color="#4ade80">
          wypadkowa siła nośna
        </Tag>
      )}
      <InfoPortal>
        <div>
          C<sub>L</sub> = {fmt(CL, 2)}
        </div>
        <MiniChart
          curves={[
            { f: interp(upper), color: '#60a5fa' },
            { f: interp(lower), color: '#f87171' },
          ]}
          xr={[0, 1]}
          yr={[-1, 3]}
          xl="od krawędzi natarcia → do spływu"
          yl={<>−C<tspan baselineShift="sub">p</tspan>: <tspan fill="#60a5fa">góra</tspan>, <tspan fill="#f87171">dół</tspan></>}
        />
        <div>Pole między krzywymi = siła nośna. Górna powierzchnia „ciągnie” (podciśnienie) mocniej, niż dolna „pcha”.</div>
      </InfoPortal>
    </>
  );
}

/* ======================= 5. przeciągnięcie ======================= */

function StallOverlay({ params, wide = false }: { params: Params; wide?: boolean }) {
  const aDeg = Number(params.alpha ?? 5);
  const alpha = aDeg * DEG;
  const sep = Math.max(0, Math.min(1, (aDeg - (ALPHA_CRIT - 4)) / 9));
  const stalled = aDeg > ALPHA_CRIT;
  const aCalc = Math.min(alpha, ALPHA_CRIT * DEG);
  const G = gammaKutta(AF, aCalc) * (stalled ? 0.75 : 1);
  const teW = toWorld(AF.xTE, 0, alpha);
  const leW = toWorld(AF.xLE, 0, alpha);
  const sx = teW.x + (leW.x - teW.x) * sep * 0.85;
  const sy = teW.y + (leW.y - teW.y) * sep * 0.85 + 0.25 * sep + 0.12;
  const bubbleH = 0.25 + sep * 1.4;
  const lines = useMemo(() => {
    const ys = [-1.8, -1.3, -0.85, -0.45, -0.1, 0.25, 0.55, 0.85, 1.2, 1.6, 2.0];
    return ys.map((y0) => {
      const p = { x: -3.6, y: y0 };
      const raw: [number, number][] = [];
      for (let i = 0; i < 500; i++) {
        const v = worldVel(p.x, p.y, AF, aCalc, G);
        if (v.inside) break;
        const sp = Math.hypot(v.u, v.v) || 1;
        p.x += (v.u / sp) * 0.04;
        p.y += (v.v / sp) * 0.04;
        raw.push([p.x, p.y]);
        if (p.x > 4.4) break;
      }
      const out: [number, number][] = [];
      let detached = false;
      const top = sy + bubbleH;
      for (const [x, y] of raw) {
        if (sep > 0.05 && y0 > -0.1 && x > sx && (detached || (y < top && y > sy - 0.6))) detached = true;
        if (detached) {
          const last = out[out.length - 1] ?? [x, y];
          const floor = top - (x - sx) * 0.12;
          out.push([x, Math.max(y, last[1] + (Math.max(floor, y) - last[1]) * 0.12)]);
        } else out.push([x, y]);
      }
      return out.filter((_, i) => i % 3 === 0).map(([x, y]) => toScene(x, y, ZS(SLICE.z0, SLICE.z1)[ys.indexOf(y0) % 6]));
    });
  }, [aCalc, G, sep, sx, sy, bubbleH]);
  // w strefie oderwania powietrze zwalnia – smugi tam krótsze i wolniejsze
  const lineSpeeds = useMemo(() => lines.map((pts) => pts.map((p) => (sep > 0.05 && p[0] > toScene(sx, 0)[0] && p[1] < toScene(0, sy + bubbleH + 0.3)[1] ? 0.45 : 1.1))), [lines, sep, sx, sy, bubbleH]);
  const eddy = useRef<THREE.Group>(null);
  const ring = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const a = (i / 21) * Math.PI * 1.6;
    return [Math.cos(a), Math.sin(a), 0] as V3;
  }), []);
  const nE = sep > 0.05 ? Math.round(2 + sep * 5) : 0;
  // większy wycinek: te same linie (z oderwaniem) powtórzone na stacjach wzdłuż całego wycinka i trochę poza nim,
  // przesunięte wg skosu i wzniosu skrzydła, ze skalą cięciwy (przesunięcie obrócone o α)
  const wideLines = useMemo(() => {
    if (!wide) return null;
    const out: V3[][] = [];
    const sp: number[][] = [];
    const c = Math.cos(alpha);
    const s = Math.sin(alpha);
    for (let k = 0; k < 9; k++) {
      const z = WING_PIECE.z0 - 1.2 + ((WING_PIECE.z1 - WING_PIECE.z0 + 2.4) * k) / 8;
      const sh = stationShift(z, SLICE.r);
      const dx = sh.dx * c + sh.dy * s;
      const dy = -sh.dx * s + sh.dy * c;
      lines.forEach((pts, i) => {
        if (i % 2 !== k % 2) return;
        out.push(pts.map(([X, Y]) => [P.x + dx + (X - P.x) * sh.k, P.y + dy + (Y - P.y) * sh.k, z] as V3));
        sp.push(lineSpeeds[i]);
      });
    }
    return { out, sp };
  }, [wide, lines, lineSpeeds, alpha]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    eddy.current?.children.forEach((c, i) => {
      const u = (i + ((t * 0.5) % 1)) / Math.max(1, nE);
      const ex = sx + u * (4.2 - sx);
      const ey = sy + bubbleH * 0.5 * Math.min(1, u * 3) - u * 0.3;
      const r = (0.15 + 0.35 * sep * Math.min(1, u * 2)) * FK;
      const w = toScene(ex, ey, SLICE.z1 + 0.08);
      c.position.set(w[0], w[1], w[2]);
      c.scale.setScalar(r);
      c.rotation.z = -t * 4.5 - i * 0.7;
    });
  });
  return (
    <>
      {wideLines ? <PathStreaks paths={wideLines.out} speeds={wideLines.sp} count={520} speed={7} trail={2.2} /> : <PathStreaks paths={lines} speeds={lineSpeeds} count={170} speed={7} trail={2.2} />}
      <MaybeFace on={wide} alpha={aDeg}>
        <group ref={eddy}>
          {Array.from({ length: nE }, (_, i) => (
            <Line key={i} points={ring} color="#fb923c" lineWidth={2} transparent opacity={0.75} />
          ))}
        </group>
        {stalled && (
          <Tag pos={[P.x, P.y - 6, ZF]} color="#f87171">
            <b style={{ fontSize: 16 }}>PRZECIĄGNIĘCIE</b>
          </Tag>
        )}
      </MaybeFace>
      <InfoPortal>
        <div>
          α = {aDeg}° · C<sub>L</sub> = {fmt(clOf(aDeg), 2)} · C<sub>D</sub> = {fmt(cdOf(aDeg), 3)} · doskonałość {fmt(clOf(aDeg) / cdOf(aDeg), 0)}
        </div>
        <MiniChart
          curves={[
            { f: clOf, color: '#4ade80', w: 2.5 },
            { f: (a) => cdOf(a) * 5, color: '#fb923c', dash: '6 4' },
          ]}
          xr={[-6, 22]}
          yr={[-0.4, 1.7]}
          shade={[ALPHA_CRIT, 22]}
          marks={[
            { x: aDeg, y: clOf(aDeg), color: '#4ade80' },
            { x: aDeg, y: cdOf(aDeg) * 5, color: '#fb923c' },
          ]}
          xl="kąt natarcia α (°)"
          yl={<><tspan fill="#4ade80">C_L</tspan> i <tspan fill="#fb923c">5 × C_D</tspan>; czerwone tło – za α krytycznym</>}
        />
      </InfoPortal>
    </>
  );
}

/* ======================= 6. klapy i sloty ======================= */

function FlapsOverlay({ params, pose, wide = false }: { params: Params; pose: PoseState; wide?: boolean }) {
  const cfg = CONFIGS[String(params.cfg ?? 'clean')];
  const sf = useSpeedFmt();
  const zf = FLAP_CLIP.z1;
  // opływ całego profilu: im bardziej wysunięta mechanizacja, tym większe wygięcie i mocniejsze odchylenie w dół
  const outer = useMemo(() => {
    const af = makeAirfoil(0.1, 0.06 + 0.075 * (cfg.dCL / 1.35));
    const ys = Array.from({ length: 16 }, (_, i) => -1.9 + (3.9 * i) / 15);
    return streamPaths(af, 3 * DEG, ys, ZS(FLAP_CLIP.z0, zf));
  }, [cfg.dCL, zf]);
  // strumienie przez szczeliny (w układzie samolotu – poruszają się razem z nim), po położeniu wysuniętych części
  const jets = useMemo(() => {
    const pv = mechPivots(SLICE.r);
    const rot = (p: V3, c: V3, a: number): V3 => {
      const dx = p[0] - c[0];
      const dy = p[1] - c[1];
      return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a), p[2]];
    };
    const at = (s: number, side: 1 | -1): V3 => {
      const arr = side > 0 ? SEC.up : SEC.lo;
      const i = Math.round((Math.acos(1 - 2 * Math.min(1, Math.max(0, s))) / Math.PI) * 60);
      return arr[Math.max(0, Math.min(60, i))];
    };
    const off = (p: V3, dx: number, dy: number, z: number): V3 => [p[0] + dx, p[1] + dy, z];
    const lerp = (a: V3, b: V3, t: number, z: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z];
    const out: V3[][] = [];
    // warstwa smug z obu stron plastra (6 torów), każdy minimalnie przesunięty – czyta się jak cienki strumień
    const zs = [zf + 0.06, FLAP_CLIP.z0 - 0.06, zf + 0.2, FLAP_CLIP.z0 - 0.2, zf + 0.36, FLAP_CLIP.z0 - 0.36];
    const LANES = 6;
    if (cfg.slat > 0) {
      // slot: obrót nosem w dół wokół osi pod skrzydłem (ten sam kąt co w modelu)
      const sa = 0.26 * cfg.slat;
      // powietrze nadpływa od przodu i z dołu (spod krawędzi natarcia), przechodzi przez szczelinę między tylną
      // krawędzią wysuniętego slotu a noskiem skrzydła i wychodzi wzdłuż górnej powierzchni do tyłu
      const slatTE = rot(at(0.11, 1), pv.slat, sa);
      const slatLow = rot(at(0.05, -1), pv.slat, sa);
      const gap = lerp(slatTE, at(0.09, -1), 0.5, 0);
      // punkt spiętrzenia tuż pod i przed noskiem wysuniętego slotu
      const slatNose = rot(SEC.le, pv.slat, sa);
      for (let k = 0; k < LANES; k++) {
        const z = zs[k];
        const d = (k % 3) * 0.035;
        const curve = new THREE.CatmullRomCurve3(
          [
            off(slatNose, -1.1, -0.42 - d, z),
            off(slatNose, -0.15, -0.2 - d * 0.6, z),
            off(slatLow, 0.05, -0.1 - d * 0.4, z),
            [gap[0], gap[1] - d * 0.2, z] as V3,
            off(at(0.2, 1), 0, 0.05 + d * 0.5, z),
            off(at(0.45, 1), 0, 0.09 + d, z),
            off(at(0.75, 1), 0, 0.14 + d * 1.4, z),
          ].map((p) => new THREE.Vector3(...p)),
          false,
          'centripetal',
        );
        out.push(curve.getPoints(60).map((v) => [v.x, v.y, v.z] as V3));
      }
    }
    if (cfg.flap > 0) {
      const fa = -cfg.flap * DEG;
      const mainTE = at(0.775, 1);
      const flapNose = rot(at(0.79, -1), pv.flap, fa);
      const flapTE = rot(SEC.te, pv.flap, fa);
      const flapMid = lerp(flapNose, flapTE, 0.45, 0);
      for (let k = 0; k < LANES; k++) {
        const z = zs[k];
        const d = (k % 3) * 0.03;
        const curve = new THREE.CatmullRomCurve3(
          // tuż pod spodem skrzydła do tyłu, przy szczelinie w górę między krawędzią spływu skrzydła a noskiem klapy,
          // potem przylega do górnej powierzchni klapy i schodzi za nią w dół
          [
            off(at(0.5, -1), 0, -0.16 - d, z),
            off(at(0.7, -1), 0, -0.12 - d * 0.6, z),
            lerp(mainTE, flapNose, 0.5, z),
            off(flapMid, 0, 0.1 + d * 0.5, z),
            off(flapTE, 0.25, 0.06 + d, z),
            off(flapTE, 2.0, -0.7 - cfg.flap * 0.022 + d, z),
          ].map((p) => new THREE.Vector3(...p)),
          false,
          'centripetal',
        );
        out.push(curve.getPoints(60).map((v) => [v.x, v.y, v.z] as V3));
      }
    }
    // w szczelinie powietrze przyspiesza (smugi dłuższe i szybsze), dalej wzdłuż powierzchni nieco zwalnia
    const speeds = out.map((p) => p.map((_, i) => {
      const t = i / (p.length - 1);
      return 0.9 + 0.9 * Math.exp(-((t - 0.45) ** 2) / 0.02) + 0.3 * t;
    }));
    const cove: V3[][] = [];
    const wake: V3[][] = [];
    if (cfg.slat > 0) {
      const sa = 0.26 * cfg.slat;
      const sTE = rot(at(0.11, 1), pv.slat, sa);
      const sLow = rot(at(0.05, -1), pv.slat, sa);
      // wir w zatoce slotu: powietrze krąży w jego wklęsłym tyle (warstwa ścinania od dolnej krawędzi slotu)
      const c = lerp(sLow, sTE, 0.5, 0);
      for (const z of [zf + 0.06, FLAP_CLIP.z0 - 0.06, zf + 0.25]) {
        cove.push(Array.from({ length: 73 }, (_, i) => {
          const t = (i / 72) * Math.PI * 6;
          return [c[0] + 0.06 + 0.15 * Math.cos(t), c[1] + 0.02 + 0.1 * Math.sin(t), z] as V3;
        }));
      }
      // ślad za slotem płynie nad skrzydłem osobno – nie miesza się z warstwą przy powierzchni
      for (const z of [zf + 0.1, FLAP_CLIP.z0 - 0.1]) wake.push([sTE, off(at(0.3, 1), 0, 0.28, z), off(at(0.6, 1), 0, 0.42, z), off(at(0.95, 1), 0, 0.55, z), off(SEC.te, 2, 0.3, z)].map((p) => [p[0], p[1], z] as V3));
    }
    if (cfg.flap > 0) {
      const mTE = at(0.775, 1);
      const fTE = rot(SEC.te, pv.flap, -cfg.flap * DEG);
      for (const z of [zf + 0.1, FLAP_CLIP.z0 - 0.1]) wake.push([off(mTE, 0, 0.04, z), off(lerp(mTE, fTE, 0.5, z), 0, 0.3, z), off(fTE, 0.3, 0.3, z), off(fTE, 2.2, -0.25 - cfg.flap * 0.01, z)]);
    }
    return { paths: out, speeds, cove, wake };
  }, [cfg.slat, cfg.flap, zf]);
  // większy wycinek: opływ i strumienie powtórzone na stacjach wzdłuż całego wycinka (wg skosu, wzniosu i cięciwy);
  // strumień przez szczelinę tylko tam, gdzie na danej stacji jest slot / klapa
  const spread = useMemo(() => {
    if (!wide) return null;
    const a = 3 * DEG;
    const st = Array.from({ length: 8 }, (_, k) => WING_PIECE.z0 - 1 + ((WING_PIECE.z1 - WING_PIECE.z0 + 2) * k) / 7);
    const map = (pts: V3[], z: number, rotA: number) => {
      const sh = stationShift(z, SLICE.r);
      const dx = sh.dx * Math.cos(rotA) + sh.dy * Math.sin(rotA);
      const dy = -sh.dx * Math.sin(rotA) + sh.dy * Math.cos(rotA);
      return pts.map(([X, Y, Z]) => [P.x + dx + (X - P.x) * sh.k, P.y + dy + (Y - P.y) * sh.k, z + (Z - zf) * 0.3] as V3);
    };
    const op: V3[][] = [];
    const os: number[][] = [];
    st.forEach((z, k) =>
      outer.paths.forEach((p, i) => {
        if (i % 2 !== k % 2) return;
        op.push(map(p, z, a));
        os.push(outer.speeds[i]);
      }),
    );
    const jp: V3[][] = [];
    const slatAt = (z: number) => z > 11.9 && z < 29.8;
    const flapAt = (z: number) => (z > 3.4 && z < 10.25) || (z > 11 && z < 21.6);
    st.forEach((z) =>
      jets.paths.forEach((p, i) => {
        const isSlat = cfg.slat > 0 && i < 6;
        if (isSlat ? !slatAt(z) : !flapAt(z)) return;
        jp.push(map(p, z, 0));
      }),
    );
    return { op, os, jp };
  }, [wide, outer, jets, cfg.slat, zf]);
  const clCfg = (c: (typeof CONFIGS)[string], a: number) => clGeneric(a, c.dCL, c.aCrit);
  const clmax = (c: (typeof CONFIGS)[string]) => Math.max(...Array.from({ length: 200 }, (_, i) => clCfg(c, -6 + i * 0.14)));
  const vs = Math.sqrt((2 * PLANE.mlw * G0) / (1.225 * PLANE.S * clmax(cfg)));
  return (
    <>
      {!wide && <MechCaps pose={pose} cfg={{ flap: cfg.flap, slat: cfg.slat }} />}
      {spread ? <PathStreaks paths={spread.op} speeds={spread.os} count={560} speed={7} trail={2.4} /> : <PathStreaks paths={outer.paths} speeds={outer.speeds} count={200} speed={7} trail={2.4} />}
      <FollowPlane pose={pose}>
        {spread ? spread.jp.length > 0 && <PathStreaks paths={spread.jp} count={260} color="#facc15" speed={10} trail={1.6} width={0.055} /> : jets.paths.length > 0 && <PathStreaks paths={jets.paths} speeds={jets.speeds} count={110} color="#facc15" speed={8} trail={1.4} width={0.055} />}
        {!spread && jets.cove.length > 0 && <PathStreaks paths={jets.cove} count={24} color="#fb923c" speed={1.6} trail={0.35} width={0.035} opacity={0.8} />}
        {!spread && jets.wake.length > 0 && <PathStreaks paths={jets.wake} count={40} color="#e5e7eb" speed={8} trail={1.4} width={0.035} opacity={0.55} />}
        <MaybeFace on={wide} alpha={0}>
        {cfg.slat > 0 && (
          <Tag pos={[SEC.le[0] - 0.8, SEC.le[1] - 1.8, zf]} color="#7dd3fc">
            slot – wysunięty
          </Tag>
        )}
        {cfg.flap > 0 && (
          <Tag pos={[SEC.te[0] + 0.8, SEC.te[1] - 2.4, zf]} color="#fca5a5">
            klapa – {cfg.flap}°
          </Tag>
        )}
        </MaybeFace>
      </FollowPlane>
      <CockpitDock>
        {/* dźwignia klap i dźwignie ciągu przestawiają się same razem z wybraną konfiguracją */}
        <ControlStack>
          <FlapLever conf={FLAP_ECAM[String(params.cfg ?? 'clean')].conf as '0' | '1+F' | '3' | 'FULL'} />
          <ThrustLevers pos={FLAP_ECAM[String(params.cfg ?? 'clean')].thr[0] === 'FLEX' ? [1.5, 1.5] : [1, 1]} athr={FLAP_ECAM[String(params.cfg ?? 'clean')].thr[0] !== 'FLEX'} size={90} />
        </ControlStack>
        <Ecam
          thrMode={FLAP_ECAM[String(params.cfg ?? 'clean')].thr}
          n1={[FLAP_ECAM[String(params.cfg ?? 'clean')].thr[1] * 0.95, FLAP_ECAM[String(params.cfg ?? 'clean')].thr[1] * 0.95]}
          egt={[520 + 4 * FLAP_ECAM[String(params.cfg ?? 'clean')].thr[1], 520 + 4 * FLAP_ECAM[String(params.cfg ?? 'clean')].thr[1]]}
          page="FCTL"
          fctl={{ spL: Array(7).fill(0), spR: Array(7).fill(0), ailL: 0, ailR: 0, elev: 0, rudder: 0, pitchTrim: 2.2, slat: cfg.slat, flap: cfg.flap / 32, conf: FLAP_ECAM[String(params.cfg ?? 'clean')].conf }}
          footer={{ tat: 14, sat: 12, isa: -3, flt: '01:12', time: '14:46:54', gw: 245000, gwcg: 26.5, fob: 21000 }}
          width={260}
        />
      </CockpitDock>
      <InfoPortal>
        <div style={{ fontWeight: 700 }}>{cfg.name}</div>
        <MiniChart
          curves={Object.values(CONFIGS).map((c) => ({ f: (a: number) => clCfg(c, a), color: c === cfg ? '#4ade80' : 'rgba(255,255,255,0.25)', w: c === cfg ? 2.5 : 1.2 }))}
          xr={[-6, 22]}
          yr={[-0.4, 3.1]}
          xl="kąt natarcia α (°)"
          yl={<>C<tspan baselineShift="sub">L</tspan>(α) dla wszystkich konfiguracji (zielona – wybrana)</>}
        />
        <div>
          C<sub>L max</sub> ≈ {fmt(clmax(cfg), 2)} · prędkość przeciągnięcia przy {fmt(PLANE.mlw / 1000, 0)} t ≈ <b>{sf(vs)}</b>
        </div>
        <div style={{ opacity: 0.8 }}>{cfg.note}</div>
      </InfoPortal>
    </>
  );
}

/**
 * Wiatr względny wokół całego samolotu w locie – te same smugi co wszędzie: płyną od nosa do ogona,
 * przed skrzydłem lekko unoszą się, a za nim schodzą w dół (tym mocniej, im większe C_L).
 */
export function AmbientWind({ cl = 0.5, count = 240, opacity = 0.8, speed = 40 }: { cl?: number; count?: number; opacity?: number; speed?: number }) {
  const paths = useMemo(() => {
    const out: V3[][] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 70; k++) {
      const y0 = -12 + rnd() * 24;
      const z0 = -40 + rnd() * 80;
      const nearWing = Math.max(0, 1 - Math.abs(y0) / 9) * (Math.abs(z0) < 33 ? 1 : 0.25);
      const pts: V3[] = [];
      for (let i = 0; i <= 40; i++) {
        const x = -60 + (130 * i) / 40;
        // upwash przed skrzydłem, downwash za nim (kąt odchylenia rośnie z C_L)
        const dy = nearWing * cl * (x < 0 ? 0.8 * Math.exp(x / 12) : 0.8 - (x / 70) * 5);
        pts.push([x, y0 + dy, z0]);
      }
      out.push(pts);
    }
    return out;
  }, [cl]);
  return <PathStreaks paths={paths} count={count} color="#9bd7ff" speed={speed} trail={8} width={0.2} opacity={opacity} />;
}

/**
 * Pracujący silnik zmienia przepływ: przed wlotem powietrze zbiega się i przyspiesza, za dyszą wylatuje szybki,
 * rozszerzający się strumień. Tory w układzie samolotu (sides: 1 – lewy silnik, −1 – prawy).
 */
export function EngineStreams({ sides = [1, -1], width = 0.12, opacity = 0.75 }: { sides?: number[]; width?: number; opacity?: number }) {
  const e = engineOrigin();
  const inlet = e[0] - 3.4;
  const nozzle = e[0] + 3.9;
  const { paths, speeds } = useMemo(() => {
    const ps: V3[][] = [];
    const sv: number[][] = [];
    for (const side of sides)
      for (let k = 0; k < 14; k++) {
        const ph = (k / 14) * Math.PI * 2;
        const rf = 0.55 + (k % 2) * 0.4;
        const pts: V3[] = [];
        const sp: number[] = [];
        for (let i = 0; i <= 50; i++) {
          const x = inlet - 26 + (i / 50) * 72;
          // promień strugi: szeroki lejek przed wlotem → wlot → dysza → rozszerzanie za silnikiem
          const r = x < inlet ? 1.25 + 2.4 * Math.min(1, (inlet - x) / 22) ** 0.7 : x < nozzle ? 1.25 - 0.25 * ((x - inlet) / (nozzle - inlet)) : 1.0 + 0.045 * (x - nozzle);
          pts.push([x, e[1] + Math.cos(ph) * r * rf, side * e[2] + Math.sin(ph) * r * rf]);
          sp.push(x < inlet ? 1 + 0.5 * (1 - Math.min(1, (inlet - x) / 22)) : x < nozzle ? 1.6 : 2.6 - Math.min(1, (x - nozzle) / 40));
        }
        ps.push(pts);
        sv.push(sp);
      }
    return { paths: ps, speeds: sv };
  }, [sides, inlet, nozzle, e]); // eslint-disable-line react-hooks/exhaustive-deps
  return <PathStreaks paths={paths} speeds={speeds} count={140 * sides.length} color="#c7e6ff" speed={22} trail={4.5} width={width} opacity={opacity} />;
}

/* ======================= 4. wzór na siłę nośną ======================= */

function LiftOverlay({ params, pose }: { params: Params; pose: PoseState }) {
  const s = liftState(params);
  const sf = useSpeedFmt();
  const sc = 9;
  const Lh = Math.min(22, s.ratio * sc);
  const ok = Math.abs(s.ratio - 1) < 0.03;
  // atmosfera wzorcowa: temperatura, ciśnienie na wysokości lotu i w kabinie (kabina najwyżej ok. 6000 ft)
  const sat = Math.max(-56.5, 15 - 0.0065 * s.h);
  const tat = sat + (s.v * s.v) / 2010;
  const pAt = (h: number) => 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588);
  const cabAltM = Math.min(s.h, 1830);
  const deltaP = (pAt(cabAltM) - pAt(s.h)) / 6895;
  const ff = 2690 * (s.m / 230000) * Math.pow(s.v / 250, 1.2);
  return (
    <>
      <CockpitDock>
        <Pfd pitch={2.5} bank={0} ias={s.v * 1.944 * Math.sqrt(s.rho / 1.225)} mach={s.v / 295} track={0} alt={s.h * 3.281} altSel={Math.round((s.h * 3.281) / 1000) * 1000} vs={(s.ratio - 1) * 6000} heading={0} fma={['SPEED', 'ALT CRZ', 'NAV', '', 'AP1\n1FD2\nA/THR']} width={260} />
        <Ecam
          thrMode={['CLB', 98]}
          thr={[83.6, 83.6]}
          n1={[82.9, 82.9]}
          egt={[747, 743]}
          page="CRUISE"
          cruise={{ ff: [ff, ff], fu: [10840, 10840], deltaP, cabAlt: cabAltM * 3.281, cabVs: 0, temps: [21, 22, 22] }}
          footer={{ tat, sat, isa: sat - Math.max(-56.5, 15 - 0.0065 * s.h), flt: '03:16', time: '14:31:11', gw: s.m, gwcg: 30.6, fob: Math.max(4000, s.m - 175000) }}
          width={260}
        />
      </CockpitDock>
      <AmbientWind cl={s.cl} />
      <FollowPlane pose={pose}>
        <EngineStreams />
        <Arrow3D from={[2, 3.4, 0]} vec={[0, Lh, 0]} color="#4ade80" radius={0.32} />
        <Arrow3D from={[2, -3.6, 0]} vec={[0, -sc, 0]} color="#f87171" radius={0.32} />
        <Tag pos={[2, 4.6 + Lh, 0]} color="#4ade80">
          L = {fmt(s.L / 1000, 0)} kN
        </Tag>
        <Tag pos={[2, -5 - sc, 0]} color="#f87171">
          Q = {fmt(s.W / 1000, 0)} kN
        </Tag>
      </FollowPlane>
      <InfoPortal>
        <div style={{ fontSize: 17, fontWeight: 700 }}>
          L = ½ · ρ · v² · S · C<sub>L</sub>
        </div>
        <div>
          ρ = {fmt(s.rho, 3)} kg/m³ (wys. {fmt(s.h, 0)} m) · v = {sf(s.v)} · S = {PLANE.S} m² · C<sub>L</sub> = {fmt(s.cl, 2)}
        </div>
        <div style={{ color: ok ? '#4ade80' : s.ratio > 1 ? '#facc15' : '#f87171', fontWeight: 700 }}>{ok ? 'lot poziomy: L ≈ Q' : s.ratio > 1 ? 'L > Q – samolot się wznosi' : 'L < Q – samolot opada'}</div>
        <div style={{ opacity: 0.8 }}>
          masa {fmt(s.m / 1000, 0)} t · do lotu poziomego potrzeba v = {sf(s.vReq)} · q = ½ρv² = {fmt(s.q / 1000, 1)} kPa
        </div>
      </InfoPortal>
    </>
  );
}

/* ======================= 7. wiry brzegowe ======================= */

/**
 * Wiry brzegowe na prawdziwym samolocie:
 * – nad skrzydłem powietrze płynie lekko ku kadłubowi, pod nim ku końcówce (to różnica ciśnień je napędza);
 * – na końcówce przelewa się z dołu na górę i zwija w wir; z całej krawędzi spływu schodzi warstwa wirowa,
 *   która za samolotem zwija się w dwa wiry o rozstawie ok. π/4 rozpiętości;
 * – wiry opadają (prędkość w = Γ / (2π·b₀)) i odchylają strumień za skrzydłem w dół;
 * – lokalna siła nośna jest odchylona do tyłu o kąt odchylenia strumienia ε – jej pozioma część to opór indukowany.
 */
function VortexOverlay({ params }: { params: Params }) {
  const cl = Number(params.cl ?? 1.2);
  const sf = useSpeedFmt();
  const winglets = Boolean(params.winglets ?? true);
  const follower = Boolean(params.follower ?? true);
  // fizyka (lot poziomy, masa ok. 220 t; przy dużym C_L – nisko i wolno, przy małym – przelot na 11 km)
  const m = 220000;
  const W = m * G0;
  const approach = cl >= 0.9;
  const rho = isaRho(approach ? 500 : 11000);
  const V = Math.sqrt((2 * W) / (rho * PLANE.S * cl));
  const AR = (PLANE.b * PLANE.b) / PLANE.S;
  const e = winglets ? 0.86 : 0.8;
  const cdi = (cl * cl) / (Math.PI * e * AR);
  const eps = cl / (Math.PI * e * AR);
  const cd0 = approach ? 0.03 : 0.016;
  const b0 = (Math.PI / 4) * PLANE.b;
  const G = W / (rho * V * b0);
  const sink = G / (2 * Math.PI * b0);
  // końcówka: szczyt wingletu albo (bez wingletów) koniec płata
  const tip = wingTipPos(winglets);
  const vis = 0.5 + cl * 0.8;
  const { surfUp, surfLo, spill, cores, sheet, down } = useMemo(() => {
    const sides = [1, -1];
    const surfUp: V3[][] = [];
    const surfLo: V3[][] = [];
    for (const sd of sides)
      for (const r of [6, 10, 14, 18, 22, 26]) {
        const drift = 0.9 * cl * Math.pow(r / 30, 2);
        surfUp.push(Array.from({ length: 16 }, (_, i) => {
          const s = i / 15;
          const p = wingSurface(r - drift * s, Math.min(1, s), 1, 0.14);
          return [p[0] + (s > 0.98 ? 0.6 : 0), p[1], sd * p[2]] as V3;
        }));
        surfLo.push(Array.from({ length: 16 }, (_, i) => {
          const s = i / 15;
          const p = wingSurface(Math.min(W_TIP_Z, r + drift * s), Math.min(1, s), -1, 0.14);
          return [p[0], p[1], sd * p[2]] as V3;
        }));
      }
    // przelewanie się wokół końcówki: z dołu na górę, coraz dalej do tyłu
    const spill: V3[][] = [];
    for (const sd of sides)
      for (let k = 0; k < 5; k++)
        spill.push(Array.from({ length: 30 }, (_, i) => {
          const t = i / 29;
          const a = -Math.PI / 2 - t * Math.PI * 1.3;
          const r = 0.7 + 0.25 * k;
          return [tip[0] - 2.5 + t * 6 + k * 1.2, tip[1] + Math.sin(a) * r, sd * (tip[2] + Math.cos(a) * r * 0.9)] as V3;
        }));
    // rdzenie wirów: spirale z końcówki, wir dryfuje do rozstawu b₀ i opada
    const zc = (x: number) => tip[2] + (b0 / 2 - tip[2]) * (1 - Math.exp(-(x - tip[0]) / 60));
    const yc = (x: number) => tip[1] - ((x - tip[0]) * sink * 6) / V - 0.04 * (x - tip[0]) * cl;
    const cores: V3[][] = [];
    for (const sd of sides)
      for (let k = 0; k < 8; k++) {
        const ph = (k / 8) * Math.PI * 2;
        const r0 = 0.35 + (k % 3) * 0.3;
        cores.push(Array.from({ length: 220 }, (_, i) => {
          const u = i / 219;
          const x = tip[0] + 2 + u * 260;
          const ang = ph + sd * u * 60 * vis * (winglets ? 0.85 : 1.15);
          const rr = (0.25 + Math.min(1, u * 3) * 2.2) * r0 * (winglets ? 1.25 : 0.85);
          return [x, yc(x) + Math.sin(ang) * rr, sd * zc(x) + Math.cos(ang) * rr] as V3;
        }));
      }
    // warstwa wirowa z krawędzi spływu: dryfuje na zewnątrz i zawija się wokół rdzenia
    const sheet: V3[][] = [];
    for (const sd of sides)
      for (const r of [9, 13, 17, 21, 25, 28.5]) {
        const p0 = wingSurface(r, 1, 1, 0);
        const ph = r * 0.7;
        sheet.push(Array.from({ length: 90 }, (_, i) => {
          const u = i / 89;
          const x = p0[0] + u * 120;
          const k = 1 - Math.exp(-u * 4);
          const R = (1 - k) * Math.abs(p0[2] - zc(x)) + 0.6 + 1.6 * k;
          const ang = ph + sd * Math.pow(k, 1.4) * 9;
          return [x, (1 - k) * p0[1] + k * yc(x) + Math.sin(ang) * R * k, sd * ((1 - k) * p0[2] + k * zc(x)) + Math.cos(ang) * R * k * sd] as V3;
        }));
      }
    // odchylenie strumienia między wirami
    const down: V3[][] = Array.from({ length: 10 }, (_, k) => {
      const z = -20 + (40 * k) / 9;
      return Array.from({ length: 30 }, (_, i) => {
        const u = i / 29;
        return [8 + u * 90, 1.2 - u * u * 7 * cl, z] as V3;
      });
    });
    return { surfUp, surfLo, spill, cores, sheet, down };
  }, [cl, winglets, tip, b0, sink, V, vis]);
  // samolot w śladzie: lekko się kołysze, gdy wpada w wir
  const fol = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!fol.current) return;
    const t = clock.elapsedTime;
    fol.current.rotation.x = Math.sin(t * 1.3) * 0.12 * vis;
    fol.current.position.y = -6 + Math.sin(t * 0.7) * 0.6;
  });
  // siła nośna na stacji skrzydła: odchylona do tyłu o ε (na rysunku ×5, żeby było widać)
  const st = wingSurface(18, 0.35, 1, 0.3);
  const Llen = 7;
  const tilt = eps * 5;
  return (
    <>
      <AmbientWind cl={cl * 0.6} count={120} opacity={0.4} />
      <EngineStreams />
      <PathStreaks paths={surfUp} count={110} color="#9bd7ff" speed={22} trail={3} width={0.1} />
      <PathStreaks paths={surfLo} count={110} color="#fca5a5" speed={22} trail={3} width={0.1} />
      <PathStreaks paths={spill} count={70} color="#fde68a" speed={12} trail={2} width={0.09} />
      <PathStreaks paths={cores} count={300} color="#e6f2ff" speed={40} trail={8} width={0.2} />
      <PathStreaks paths={sheet} count={180} color="#cbd5e1" speed={30} trail={6} width={0.12} opacity={0.6} />
      <PathStreaks paths={down} count={90} color="#60a5fa" speed={26} trail={6} width={0.18} />
      {/* siła nośna odchylona do tyłu: pionowa część niesie samolot, pozioma to opór indukowany */}
      <Arrow3D from={st} vec={[Math.sin(tilt) * Llen, Math.cos(tilt) * Llen, 0]} color="#4ade80" radius={0.16} />
      <Arrow3D from={st} vec={[Math.sin(tilt) * Llen, 0, 0]} color="#fb923c" radius={0.12} />
      <Tag pos={[st[0] - 1, st[1] + Llen + 1, st[2]]} color="#4ade80">
        siła nośna (odchylona o ε)
      </Tag>
      <Tag pos={[st[0] + Math.sin(tilt) * Llen + 2.5, st[1] - 0.8, st[2]]} color="#fb923c">
        opór indukowany
      </Tag>
      <Tag pos={[tip[0] + 30, tip[1] + 5, tip[2]]} color="#e2e8f0">
        wir brzegowy
      </Tag>
      <Tag pos={[tip[0] + 2, tip[1] + 2.4, tip[2] + 1]} color="#fde68a">
        przelewanie z dołu na górę
      </Tag>
      <Tag pos={[wingSurface(14, 0.5, 1, 1.2)[0], wingSurface(14, 0.5, 1, 1.2)[1], 14]} color="#9bd7ff">
        nad skrzydłem – ku kadłubowi
      </Tag>
      <Tag pos={[wingSurface(20, 0.5, -1, -1.4)[0], wingSurface(20, 0.5, -1, -1.4)[1], 20]} color="#fca5a5">
        pod skrzydłem – ku końcówce
      </Tag>
      <Tag pos={[70, -8, 0]} color="#60a5fa">
        odchylenie strumienia w dół
      </Tag>
      <Tag pos={[110, -4, b0 / 2]} color="#cbd5e1">
        warstwa wirowa zwija się w wir
      </Tag>
      {follower && (
        <group position={[250, -6, 6]}>
          <group ref={fol}>
            <MiniPlane scale={0.32} />
          </group>
          <Tag pos={[0, 6, 0]} color="#facc15">
            następny samolot – min. 4–6 NM (nie w skali)
          </Tag>
        </group>
      )}
      <InfoPortal>
        <div style={{ fontWeight: 700 }}>{approach ? 'podejście do lądowania' : 'przelot'} · v ≈ {sf(V)} · masa 220 t</div>
        <div>
          cyrkulacja wiru Γ ≈ <b>{fmt(G, 0)} m²/s</b> · rozstaw wirów b₀ = π/4·b ≈ {fmt(b0, 1)} m · wiry opadają ok. <b>{sf(sink, 1)}</b>
        </div>
        <div>
          odchylenie strumienia ε ≈ {fmt((eps * 180) / Math.PI, 1)}° · C<sub>Di</sub> = C<sub>L</sub>²/(π·e·λ) = <b>{fmt(cdi, 4)}</b> (λ = {fmt(AR, 1)}, e = {e}) · ok. {fmt((cdi / (cdi + cd0)) * 100, 0)}% całego oporu
        </div>
        <div style={{ opacity: 0.8 }}>
          {winglets ? 'Winglety rozpraszają wir i zmniejszają opór indukowany o kilka procent.' : 'Bez wingletów wir jest bardziej skupiony, a opór indukowany większy.'} A350-1000 należy do kategorii turbulencji <b>Heavy</b> (RECAT-EU: „Upper Heavy”) – za nim kontrolerzy zachowują odstęp 4–6 NM, zależnie od wielkości kolejnego samolotu.
        </div>
      </InfoPortal>
    </>
  );
}

/* ======================= 8. zakręt ======================= */

function TurnOverlay({ params, pose }: { params: Params; pose: PoseState }) {
  const phiDeg = Number(params.bank ?? 30);
  const phi = phiDeg * DEG;
  const v = Number(params.v ?? 450) / 3.6;
  const n = 1 / Math.cos(phi);
  const r = (v * v) / (G0 * Math.tan(Math.max(phi, 0.001)));
  const T360 = (2 * Math.PI * r) / v;
  const omega = phi < 0.01 ? 0 : ((v / r) * 180) / Math.PI; // °/s
  // prędkość przeciągnięcia: gładkie skrzydło, 220 t, poziom morza (C_L max ≈ 1,5), w zakręcie rośnie √n razy
  const vs1 = Math.sqrt((2 * 220000 * G0) / (1.225 * PLANE.S * 1.5));
  const vsT = vs1 * Math.sqrt(n);
  const margin = v / vsT;
  const sc = 9;
  const Lv = n * sc;
  const sf = useSpeedFmt();
  // kurs na wyświetlaczach obraca się z prawdziwą prędkością zakrętu (odświeżanie ok. 25 razy na sekundę)
  const hRef = useRef(66);
  const tAcc = useRef(0);
  const [hdg, setHdg] = useState(66);
  useFrame((_, dt) => {
    const d = Math.min(0.05, dt);
    hRef.current = (hRef.current + d * omega + 360) % 360;
    tAcc.current += d;
    if (tAcc.current > 0.04) {
      tAcc.current = 0;
      setHdg(hRef.current);
    }
  });
  const ktas = v * 1.944;
  // łuk kąta przechylenia φ: od pionu do kierunku siły nośnej
  const arc = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const a = (-phi * i) / 23;
    return [2, 3.4 + 7 * Math.cos(a), 7 * Math.sin(a)] as V3;
  }), [phi]);
  const status =
    phiDeg <= 25 ? { c: '#4ade80', t: 'typowy zakręt samolotu pasażerskiego (autopilot przechyla do 25°)' } : phiDeg <= 33 ? { c: '#facc15', t: 'zakręt ostrzejszy niż zwykle – granica normalnej pracy (33°)' } : phiDeg <= 67 ? { c: '#fb923c', t: 'ochrona przechylenia: powyżej 33° samolot sam wraca do 33°, jeśli pilot puści drążek' } : { c: '#f87171', t: 'ponad granicą 67° – system sterowania na to nie pozwoli (n ≈ 2,5)' };
  return (
    <>
      <AmbientWind cl={0.5 * n} count={180} opacity={0.6} />
      <FollowPlane pose={pose}>
        <EngineStreams />
        <Arrow3D from={[2, 3.4, 0]} vec={[0, Lv, 0]} color="#4ade80" radius={0.32} />
        <Tag pos={[2, 4.8 + Lv, 0]} color="#4ade80">
          siła nośna L = {fmt(n, 2)} Q
        </Tag>
        {/* ciężar pozorny: w zakręcie skoordynowanym „w dół” to zawsze w stronę podłogi – n razy większy */}
        <Arrow3D from={[-14, -3.6, 0]} vec={[0, -n * sc * 0.55, 0]} color="#c084fc" radius={0.22} />
        <Tag pos={[-14, -5 - n * sc * 0.55, 0]} color="#c084fc">
          ciężar pozorny w kabinie: {fmt(n, 2)} g
        </Tag>
      </FollowPlane>
      {phi > 0.01 && <Line points={arc} color="#fb923c" lineWidth={2.5} />}
      {phi > 0.01 && (
        <Tag pos={[2, 3.4 + 8.6 * Math.cos(phi / 2), -8.6 * Math.sin(phi / 2)]} color="#fb923c">
          φ = {phiDeg}°
        </Tag>
      )}
      <Line points={[[2, 3.4, 0], [2, 3.4 + Lv + 2, 0]]} color="rgba(255,255,255,0.35)" lineWidth={1} dashed dashSize={0.5} gapSize={0.4} />
      <Arrow3D from={[2, 0, 0]} vec={[0, Lv * Math.cos(phi) + 3.4, 0]} color="#38bdf8" radius={0.16} />
      <Tag pos={[2, Lv * Math.cos(phi) + 4.6, 3]} color="#38bdf8">
        pionowa: L·cos φ = Q
      </Tag>
      <Arrow3D from={[2, 0, 0]} vec={[0, 0, -(Lv + 3.4) * Math.sin(phi)]} color="#facc15" radius={0.16} />
      <Tag pos={[2, -1.4, -(Lv + 3.4) * Math.sin(phi) - 1.5]} color="#facc15">
        dośrodkowa: L·sin φ
      </Tag>
      <Arrow3D from={[2, -3.6, 0]} vec={[0, -sc, 0]} color="#f87171" radius={0.32} />
      <Tag pos={[2, -14, 2.5]} color="#f87171">
        ciężar Q
      </Tag>
      {/* wyświetlacze kokpitu: PFD (przechylenie, prędkość, kurs) i ND (przewidywany tor, promień i prędkość zakrętu) */}
      <CockpitDock>
            <Pfd
              pitch={2.5}
              bank={phiDeg}
              ias={ktas}
              iasTarget={ktas}
              mach={v / 328}
              // prędkość przeciągnięcia w tym zakręcie: czerwony pas od dołu taśmy, nad nim ochrona kąta natarcia i VLS
              vAlphaMax={vsT * 1.944}
              vAlphaProt={vsT * 1.944 * 1.06}
              vls={vsT * 1.944 * 1.23}
              vmax={340}
              track={hdg}
              alt={10000}
              altSel={10000}
              vs={0}
              heading={hdg}
              fma={['SPEED', 'ALT', 'HDG', '', 'AP1\n1FD2\nA/THR']}
              width={260}
            />
            <Nd heading={hdg} gs={ktas} tas={ktas} wind={[0, 0]} turnRadiusNm={phi < 0.01 ? 0 : r / 1852} width={260} />
      </CockpitDock>
      <InfoPortal>
        <div>
          współczynnik obciążenia <b>n = 1 / cos φ = {fmt(n, 2)}</b> – skrzydła niosą {fmt(n, 2)}× ciężar samolotu
        </div>
        <div>
          promień zakrętu r = v²/(g·tg φ) = <b>{phi < 0.01 ? '–' : `${fmt(r, 0)} m`}</b> · prędkość kątowa {fmt(omega, 1)}°/s · pełny okrąg w {phi < 0.01 ? '–' : `${fmt(T360 / 60, 1)} min`}
        </div>
        <div>
          prędkość przeciągnięcia w zakręcie: {sf(vs1)} × √n = <b>{sf(vsT)}</b> (lecimy {sf(v)})
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', margin: '2px 0' }}>
          <div style={{ width: `${Math.min(100, (vsT / v) * 100)}%`, height: '100%', background: margin < 1.15 ? '#f87171' : margin < 1.3 ? '#facc15' : '#4ade80' }} />
        </div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {margin < 1 ? 'Za wolno – w tym zakręcie skrzydło przeciągnie!' : margin < 1.3 ? 'Mały zapas nad prędkością przeciągnięcia (zwykle wymaga się ≥ 1,3×).' : `Zapas prędkości: ${fmt(margin, 2)}× prędkości przeciągnięcia.`}
        </div>
        <div style={{ color: status.c }}>{status.t}</div>
      </InfoPortal>
    </>
  );
}

/* ======================= nakładka zakładki ======================= */

/** Nakładka danej zakładki (w układzie sceny samolotu), pokazywana po dojechaniu kamery. */
export function WingLab({ mode, params, pose }: { mode: LabMode; params: Params; pose: PoseState }) {
  const ready = useReady(mode);
  if (!ready) return null;
  // przekrój na ściankach cięcia – tylko przy gładkim skrzydle (przy wysuniętych klapach kształt się zmienia)
  const cap = ['profile', 'flow', 'pressure', 'stall'].includes(mode) && !params.wide ? <SectionCap pose={pose} /> : null;
  const wide = isSliceMode(mode) && Boolean(params.wide);
  if (!wide)
    return (
      <>
        {cap}
        <LabBody mode={mode} params={params} pose={pose} />
      </>
    );
  // większy wycinek: smugi na całej jego szerokości, a opisy, strzałki i linie na zewnętrznej ściance wycinka
  const a = labPose(mode, params).alpha;
  const streak = mode === 'profile' || mode === 'pressure' || (mode === 'flow' && String(params.view ?? 'smugi') === 'smugi');
  // przeciągnięcie samo rozkłada smugi na szerokość wycinka (linie z oderwaniem), a wiry i napis – na ściance
  const eng = (
    <FollowPlane pose={pose}>
      <EngineStreams sides={[1]} />
    </FollowPlane>
  );
  if (mode === 'stall')
    return (
      <>
        {eng}
        <StallOverlay params={params} wide />
      </>
    );
  if (mode === 'flaps')
    return (
      <>
        {eng}
        <FlapsOverlay params={params} pose={pose} wide />
      </>
    );
  return (
    <>
      {eng}
      {streak && <StreakFlow alpha={a * DEG} count={560} wide color={mode === 'pressure' ? '#5f8fb5' : '#9bd7ff'} />}
      <FaceShift alpha={a}>
        <LabBody mode={mode} params={params} pose={pose} />
      </FaceShift>
    </>
  );
}

/** FaceShift tylko wtedy, gdy włączony jest większy wycinek. */
function MaybeFace({ on, alpha, children }: { on: boolean; alpha: number; children: ReactNode }) {
  return on ? <FaceShift alpha={alpha}>{children}</FaceShift> : <>{children}</>;
}

/**
 * Przenosi nakładkę narysowaną przy przekroju plastra (stacja SLICE.r) na zewnętrzną ściankę większego wycinka:
 * przesunięcie wg skosu i wzniosu, skala cięciwy, obrót przesunięcia o bieżące α (bo samolot jest pochylony).
 */
function FaceShift({ alpha, children }: { alpha: number; children: ReactNode }) {
  const zFace = WING_PIECE.z1 + 0.25;
  const sh = stationShift(zFace, SLICE.r);
  const c = Math.cos(alpha * DEG);
  const s = Math.sin(alpha * DEG);
  const dx = sh.dx * c + sh.dy * s;
  const dy = -sh.dx * s + sh.dy * c;
  return (
    <group position={[P.x + dx - sh.k * P.x, P.y + dy - sh.k * P.y, zFace - ZF]} scale={[sh.k, sh.k, 1]}>
      {children}
    </group>
  );
}

function LabBody({ mode, params, pose }: { mode: LabMode; params: Params; pose: PoseState }) {
  switch (mode) {
    case 'profile':
      return <ProfileOverlay params={params} pose={pose} />;
    case 'flow':
      return <FlowOverlay params={params} />;
    case 'pressure':
      return <PressureOverlay params={params} />;
    case 'stall':
      return <StallOverlay params={params} />;
    case 'flaps':
      return <FlapsOverlay params={params} pose={pose} />;
    case 'spoiler':
      return <SpoilerOverlay params={params} pose={pose} />;
    case 'lift':
      return <LiftOverlay params={params} pose={pose} />;
    case 'vortex':
      return <VortexOverlay params={params} />;
    case 'turn':
      return <TurnOverlay params={params} pose={pose} />;
  }
}

/**
 * Opływ wokół spojlerów (układ samolotu, rysować w FollowPlane): przy schowanych płytach powietrze przylega do
 * górnej powierzchni i schodzi za skrzydłem w dół, przy uniesionych odrywa się na krawędzi płyty i płynie wyżej,
 * a za płytą kręcą się zawirowania. dep – wychylenie spojlerów (rad) na lewym (1) i prawym (−1) skrzydle;
 * speedK – mnożnik prędkości smug (np. maleje na dobiegu). Używany w zakładce spojlerów i we wspólnym lądowaniu.
 */
export function SpoilerFlow({ dep, speedK = 1 }: { dep: Record<number, number>; speedK?: number }) {
  const flow = useMemo(() => {
    const smooth: V3[][] = [];
    const broken: V3[][] = [];
    const eddies: V3[][] = [];
    const lower: V3[][] = [];
    for (const sd of [1, -1]) {
      const d = dep[sd];
      for (const r of [5, 8, 11.6, 14, 16.5, 19, 21]) {
        const c = wingSurface(r, 1, 1)[0] - wingSurface(r, 0, 1)[0];
        // wysokość krawędzi uniesionego spojlera nad poszyciem (płyta ok. 0,13 cięciwy)
        const H = 0.13 * c * Math.sin(d);
        const pt = (s: number, dy: number): V3 => {
          const p = wingSurface(r, Math.min(1, s), 1, dy);
          return [p[0] + Math.max(0, s - 1) * c, p[1], sd * p[2]];
        };
        lower.push(Array.from({ length: 18 }, (_, i) => {
          const s = (i / 17) * 1.35;
          const p = wingSurface(r, Math.min(1, s), -1, 0.12);
          return [p[0] + Math.max(0, s - 1) * c, p[1] - Math.max(0, s - 1) * 0.6, sd * p[2]] as V3;
        }));
        if (d < 0.05) {
          // gładki opływ: przylega do górnej powierzchni i schodzi za skrzydłem w dół
          smooth.push(Array.from({ length: 22 }, (_, i) => {
            const s = (i / 21) * 1.4;
            const p = pt(s, 0.12);
            return [p[0], p[1] - Math.max(0, s - 1) * 0.9, p[2]] as V3;
          }));
          continue;
        }
        // przed spojlerem przylega, na jego krawędzi odrywa się i płynie wyżej, prawie bez odchylenia w dół
        smooth.push(Array.from({ length: 12 }, (_, i) => pt((i / 11) * 0.63, 0.12)));
        broken.push(Array.from({ length: 24 }, (_, i) => {
          const s = 0.63 + (i / 23) * 0.85;
          const k = Math.min(1, (s - 0.63) / 0.13);
          const lift = 0.12 + (H + 0.08) * Math.sin((k * Math.PI) / 2) + Math.max(0, s - 0.76) * 0.25 * H;
          return pt(s, lift);
        }));
        // martwa strefa za spojlerem: zawirowania nad klapą
        for (const k of [0, 1]) {
          const cx = 0.8 + 0.07 * k;
          const R = Math.max(0.06, H * (0.42 - 0.1 * k));
          const ctr = pt(cx, 0.1 + R);
          eddies.push(Array.from({ length: 26 }, (_, i) => {
            const a = (i / 25) * Math.PI * 2;
            return [ctr[0] - Math.cos(a) * R * 1.4, ctr[1] + Math.sin(a) * R, ctr[2]] as V3;
          }));
        }
      }
    }
    return { smooth, broken, eddies, lower };
  }, [dep[1], dep[-1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = Math.max(0.12, speedK);
  return (
    <>
      <PathStreaks paths={flow.smooth} count={160} color="#9bd7ff" speed={22 * k} trail={3} width={0.1} />
      {flow.broken.length > 0 && <PathStreaks paths={flow.broken} count={150} color="#e5e7eb" speed={18 * k} trail={3} width={0.1} opacity={0.8} />}
      {flow.eddies.length > 0 && <PathStreaks paths={flow.eddies} count={90} color="#fb923c" speed={4 * k} trail={0.8} width={0.07} />}
      <PathStreaks paths={flow.lower} count={120} color="#fca5a5" speed={22 * k} trail={3} width={0.1} opacity={0.7} />
    </>
  );
}

/** Ramka zakładki spojlerów: co robią w wybranym zastosowaniu (wartości przybliżone). */
function SpoilerOverlay({ params, pose }: { params: Params; pose: PoseState }) {
  const use = String(params.use ?? 'air');
  const su = spoilerUseOf(params);
  // wychylenie spojlerów na lewym (+z) i prawym (−z) skrzydle – jak w modelu: przy przechylaniu w prawo
  // unoszą się na prawym skrzydle, razem z podniesioną lotką
  const dep = { 1: su.spoiler + Math.max(0, -su.aileron) * 1.6, [-1]: su.spoiler + Math.max(0, su.aileron) * 1.6 } as Record<number, number>;
  // „po przyziemieniu” to wspólna animacja lądowania (podwozie, pas, opływ, PFD i ECAM rysuje scena lądowania)
  const landing = use === 'ground';
  return (
    <>
    {!landing && <EngineStreams />}
    {!landing && (
    <CockpitDock>
      {/* w locie pilot wychyla spojlery dźwignią hamulców aerodynamicznych; przy przechylaniu działają same (z lotkami) */}
      <ControlStack>
        <SpeedBrakeLever pos={use === 'air' ? su.spoiler / 0.87 : 0} deployed={Math.max(dep[1], dep[-1]) / 0.87} />
        <ThrustLevers pos={use === 'roll' ? [1, 1] : [0, 0]} athr={use === 'roll'} size={90} />
      </ControlStack>
      <Ecam
        thrMode={use === 'roll' ? ['CLB', 90] : null}
        n1={use === 'roll' ? [79, 79] : [21, 21]}
        egt={use === 'roll' ? [700, 700] : [430, 432]}
        page="FCTL"
        fctl={{
          spL: Array(7).fill(dep[1] * 57.3),
          spR: Array(7).fill(dep[-1] * 57.3),
          ailL: su.aileron * 57.3,
          ailR: -su.aileron * 57.3,
          elev: 0,
          rudder: 0,
          pitchTrim: 2.2,
          ...(use === 'ground' ? { slat: 1, flap: 1, conf: 'FULL' } : {}),
        }}
        footer={{ tat: use === 'ground' ? 18 : -10, sat: use === 'ground' ? 18 : -22, isa: 3, flt: use === 'ground' ? '07:11' : '06:52', time: '20:33:34', gw: 194000, gwcg: 28.5, fob: 55400 }}
        width={260}
      />
    </CockpitDock>
    )}
    {!landing && (
      <FollowPlane pose={pose}>
        <SpoilerFlow dep={dep} />
      </FollowPlane>
    )}
    <InfoPortal>
      <div style={{ fontWeight: 700 }}>Spojlery: {su.name}</div>
      {use === 'air' && (
        <div>
          Wszystkie płyty na górze skrzydła unoszą się o ok. 30°. Zaburzają opływ górnej powierzchni: siła nośna trochę spada, a <b>opór wyraźnie rośnie</b>. Samolot może szybciej zwolnić albo zejść stromiej bez nabierania prędkości.
        </div>
      )}
      {use === 'ground' && (
        <div>
          Tuż po przyziemieniu (koła podwozia głównego dotykają pasa, ciąg na biegu jałowym) płyty odchylają się do ok. 50°. <b>Gaszą siłę nośną</b>: cały ciężar przechodzi na koła, więc hamulce kół działają skutecznie, a samolot nie odbija się od pasa. Klapy zostają w konfiguracji do lądowania. Animacja to wspólne lądowanie z modułu podwozia: podejście, przyziemienie, spojlery, odwracacze i dobieg – na ECAM (F/CTL) widać, kiedy płyty się unoszą, a na dobiegu przy prędkości kołowania chowają.
        </div>
      )}
      {use === 'roll' && (
        <div>
          Przy przechylaniu w prawo lewa lotka idzie w dół, a prawa w górę. Na prawym skrzydle unoszą się też spojlery: zmniejszają tam siłę nośną i <b>pomagają lotkom</b>, a przy okazji równoważą opór, który ciągnąłby nos w złą stronę.
        </div>
      )}
      <div style={{ opacity: 0.75 }}>
        <span style={{ color: '#9bd7ff' }}>Niebieskie</span> smugi – powietrze przylega do skrzydła i schodzi w dół (siła nośna). <span style={{ color: '#e5e7eb' }}>Białe</span> – za uniesionym spojlerem strumień odrywa się i płynie wyżej, prawie bez odchylenia w dół. <span style={{ color: '#fb923c' }}>Pomarańczowe</span> – zawirowania w martwej strefie za płytą (opór). <span style={{ color: '#fca5a5' }}>Różowe</span> – spód skrzydła.
      </div>
      <div style={{ opacity: 0.75 }}>Spojlerami steruje komputer sterowania lotem – pilot ustawia dźwignię hamulców aerodynamicznych albo uzbraja ich automatyczne wysunięcie przy lądowaniu.</div>
    </InfoPortal>
    </>
  );
}

/* ======================= zakładki ======================= */

/** Kamera dla zakładek na plastrze skrzydła: z boku (od końca skrzydła), lekko z góry. */
const SLICE_CAM: V3 = [P.x + 2.2, P.y + 1.2, P.z + 19];
const SLICE_TARGET: V3 = [P.x + 1.5, P.y + 0.3, P.z];

/** Zakładki aerodynamiki skrzydła – `plane` tworzy krok sceny całego samolotu (wspólny stageKey). */
export function makeWingLabSteps(plane: (s: Omit<Step, 'kind' | 'scene' | 'stageKey'>) => Step): Step[] {
  const WIDE: Control = {
    type: 'select',
    key: 'dim',
    label: 'Widok',
    default: '2d',
    options: [
      { value: '2d', label: '2D – przekrój' },
      { value: '3d', label: '3D – kawałek skrzydła' },
    ],
  };
  // w 3D kamera odsuwa się i podnosi, żeby było widać kawałek skrzydła wokół silnika
  const wideView = (p: Params) => (p.dim === '3d' ? { camera: [P.x - 12, P.y + 13, P.z + 30] as V3, target: [P.x + 1, P.y - 0.8, P.z - 2.5] as V3 } : undefined);
  const lab = (mode: LabMode, s: Omit<Step, 'kind' | 'scene' | 'stageKey' | 'preset'>) =>
    plane({ ...s, preset: { lab: mode }, ...(isSliceMode(mode) ? { controls: [...(s.controls ?? []), WIDE], view: wideView } : {}) });
  return [
    lab('profile', {
      title: 'Budowa profilu',
      camera: SLICE_CAM,
      target: SLICE_TARGET,
      controls: [
        { type: 'slider', key: 'alpha', label: 'Kąt natarcia α', min: -5, max: 20, step: 1, default: 5, unit: '°' },
        { type: 'toggle', key: 'labels', label: 'Opisy', default: true },
      ],
      body: (
        <>
          <p>
            Samolot „wyciął się” do cienkiego plasterka lewego skrzydła – patrzymy na jego <strong>profil</strong>, czyli przekrój. Przód profilu – <strong>krawędź natarcia</strong> – jest zaokrąglony, a tył – <strong>krawędź spływu</strong> – ostry. Prosty odcinek od przodu do tyłu to <strong>cięciwa</strong>.
          </p>
          <p>
            Profil jest lekko <strong>wygięty</strong>, jak łuk. Od wygięcia i grubości zależy, jak mocno skrzydło niesie samolot i ile stawia oporu. Skrzydła odrzutowców pasażerskich mają profil spłaszczony z wierzchu, z wybrzuszeniem od spodu przy tylnej krawędzi – dobry do lotu z prędkością bliską prędkości dźwięku.
          </p>
          <p>
            Najważniejszy kąt w lotnictwie to <strong>kąt natarcia α</strong> – kąt między cięciwą a kierunkiem, z którego napływa powietrze. Przesuń suwak: samolot unosi nos, a powietrze dalej płynie poziomo – kąt natarcia rośnie.
          </p>
        </>
      ),
    }),
    lab('flow', {
      title: 'Opływ skrzydła',
      camera: SLICE_CAM,
      target: SLICE_TARGET,
      controls: [
        { type: 'slider', key: 'alpha', label: 'Kąt natarcia α', min: -6, max: 14, step: 0.5, default: 6, unit: '°' },
        {
          type: 'select',
          key: 'view',
          label: 'Wizualizacja',
          default: 'smugi',
          options: [
            { value: 'smugi', label: 'smugi (tory cząstek)' },
            { value: 'czas', label: 'linie czasu' },
          ],
        },
        { type: 'toggle', key: 'pressure', label: 'Pole ciśnienia', default: true },
      ],
      body: (
        <>
          <p>
            Wokół plasterka skrzydła płynie powietrze – jego ruch jest tu obliczony z modelu fizycznego. Nad skrzydłem powietrze przyspiesza i jego ciśnienie spada (kolor niebieski), a pod skrzydłem lekko zwalnia i ciśnienie rośnie (czerwony). Ta różnica ciśnień pcha skrzydło w górę.
          </p>
          <p>
            Wybierz <strong>linie czasu</strong>: drobinki powietrza wypuszczone w tej samej chwili przelatują nad skrzydłem <strong>szybciej</strong> niż pod nim i za skrzydłem już się nie spotykają. Popularne wyjaśnienie, że „górą i dołem powietrze musi dolecieć w tym samym czasie”, jest więc mitem.
          </p>
          <p>
            Za skrzydłem cały strumień powietrza jest skierowany <strong>w dół</strong>. Skrzydło spycha masę powietrza w dół, więc powietrze pcha skrzydło w górę – jak przy odrzucie. Różnica ciśnień i spychanie powietrza w dół to dwa opisy tego samego zjawiska.
          </p>
        </>
      ),
    }),
    lab('pressure', {
      title: 'Rozkład ciśnienia',
      camera: SLICE_CAM,
      target: SLICE_TARGET,
      controls: [{ type: 'slider', key: 'alpha', label: 'Kąt natarcia α', min: -6, max: 14, step: 0.5, default: 6, unit: '°' }],
      body: (
        <>
          <p>
            Strzałki pokazują ciśnienie na każdym kawałku powierzchni skrzydła: <span style={{ color: '#60a5fa' }}>niebieskie</span> „ciągną” na zewnątrz (podciśnienie), <span style={{ color: '#f87171' }}>czerwone</span> naciskają (nadciśnienie).
          </p>
          <p>
            Najsilniejsze podciśnienie jest na górze skrzydła, tuż za przednią krawędzią – to ono daje większość siły nośnej. Skrzydło jest więc bardziej „zasysane” w górę z wierzchu niż pchane od spodu. Na wykresie w ramce pole między krzywą górną i dolną odpowiada sile nośnej.
          </p>
          <p>Zwiększ kąt natarcia: podciśnienie z przodu rośnie. Za nim powietrze musi „wspinać się pod górkę” – w stronę coraz wyższego ciśnienia przy tylnej krawędzi. Z tego bierze się przeciągnięcie (zobacz dalej).</p>
        </>
      ),
    }),
    lab('lift', {
      title: 'Wzór na siłę nośną',
      camera: [-14, 6, 82],
      target: [2, 0, 0],
      controls: [
        { type: 'slider', key: 'v', label: 'Prędkość', min: 200, max: 950, step: 5, default: 905, unit: 'km/h' },
        { type: 'slider', key: 'h', label: 'Wysokość', min: 0, max: 13000, step: 100, default: 11000, unit: 'm' },
        { type: 'slider', key: 'cl', label: 'Współczynnik C_L', min: 0.1, max: 1.6, step: 0.01, default: 0.5, decimals: 2 },
        { type: 'slider', key: 'mass', label: 'Masa (% maks.)', min: 50, max: 100, step: 1, default: 75, unit: '%' },
      ],
      body: (
        <>
          <p>
            <strong>L = ½ · ρ · v² · S · C<sub>L</sub></strong>. Siła nośna (L) rośnie z gęstością powietrza (ρ), z <em>kwadratem</em> prędkości (v – dwa razy szybciej to cztery razy więcej siły), z powierzchnią skrzydeł (S – w A350-1000 to {PLANE.S} m²) i ze współczynnikiem C<sub>L</sub>. W nim kryje się kształt profilu i kąt natarcia.
          </p>
          <p>
            W locie poziomym siła nośna równoważy ciężar samolotu (Q). Zmień wysokość: wyżej powietrze jest rzadsze, więc żeby utrzymać się w powietrzu, trzeba lecieć szybciej albo zwiększyć kąt natarcia. Gdy siła nośna jest większa od ciężaru, samolot się wznosi, a gdy mniejsza – opada.
          </p>
          <p>Dlatego A350-1000 na wysokości 11 km leci ok. 905 km/h, a przy lądowaniu tylko ok. 270 km/h: przy ziemi powietrze jest gęstsze, samolot jest lżejszy o spalone paliwo, a wysunięte klapy powiększają skrzydło.</p>
        </>
      ),
    }),
    lab('stall', {
      title: 'Kąt natarcia i przeciągnięcie',
      camera: SLICE_CAM,
      target: SLICE_TARGET,
      controls: [{ type: 'slider', key: 'alpha', label: 'Kąt natarcia α', min: -4, max: 22, step: 0.5, default: 5, unit: '°' }],
      body: (
        <>
          <p>
            Im większy kąt natarcia, tym większa siła nośna – na początku rośnie równo, stopień po stopniu. Ale powietrze nad skrzydłem musi płynąć „pod górkę”: od niskiego ciśnienia z przodu do wyższego przy tylnej krawędzi.
          </p>
          <p>
            Przy dużym kącie natarcia cienka warstwa powietrza tuż przy skrzydle traci rozpęd i <strong>odrywa się</strong> od powierzchni – najpierw przy tylnej krawędzi, potem coraz bliżej przodu. Za skrzydłem powstają wiry.
          </p>
          <p>
            Po przekroczeniu <strong>kąta krytycznego</strong> (ok. 15–16°) siła nośna gwałtownie spada, a opór rośnie – to <strong>przeciągnięcie</strong>. Ważne: zależy ono od kąta natarcia, a nie od prędkości. Samolot może przeciągnąć przy każdej prędkości, jeśli kąt będzie za duży – dlatego komputery w nowoczesnych samolotach na to nie pozwalają.
          </p>
        </>
      ),
    }),
    lab('flaps', {
      title: 'Klapy i sloty',
      camera: [P.x + 1.4, P.y + 1.4, P.z + 20],
      target: [P.x + 1.2, P.y - 0.6, P.z],
      controls: [
        {
          type: 'select',
          key: 'cfg',
          label: 'Konfiguracja',
          default: 'clean',
          options: Object.entries(CONFIGS).map(([value, c]) => ({ value, label: c.name })),
        },
      ],
      body: (
        <>
          <p>
            Przy starcie i lądowaniu samolot musi lecieć wolno, a skrzydło zaprojektowane do szybkiego przelotu daje wtedy za mało siły nośnej. Na to są wysuwane <strong>klapy i sloty</strong> – tu porusza się prawdziwy mechanizm tego skrzydła.
          </p>
          <p>
            <strong>Klapa</strong> wychodzi do tyłu i w dół: skrzydło robi się większe i bardziej wygięte, a spojlery lekko opadają i domykają szczelinę. <strong>Slot</strong> na przedniej krawędzi wysuwa się do przodu i w dół, otwierając wąską szczelinę. Płynie przez nią szybki strumień powietrza spod skrzydła (żółte smugi), który pomaga powietrzu „trzymać się” górnej powierzchni. Niebieskie smugi pokazują, jak cały strumień coraz mocniej skręca w dół.
          </p>
          <p>Przełączaj ustawienia i patrz na prędkość przeciągnięcia: przy lądowaniu jest o kilkadziesiąt km/h niższa niż przy schowanych klapach. Wartości są przybliżone.</p>
        </>
      ),
    }),
    lab('spoiler', {
      title: 'Spojlery',
      // z tyłu i z góry: oba skrzydła naraz – widać płyty spojlerów i opływ za nimi (przy przechylaniu – asymetrię)
      camera: [40, 32, 14],
      target: [3, -2, 14],
      controls: [
        {
          type: 'select',
          key: 'use',
          label: 'Zastosowanie',
          default: 'air',
          options: [
            { value: 'air', label: 'hamulce w locie' },
            { value: 'ground', label: 'po przyziemieniu' },
            { value: 'roll', label: 'pomoc lotkom' },
          ],
        },
      ],
      body: (
        <>
          <p>
            <strong>Spojlery</strong> to płyty na górze skrzydła, tuż przed klapami. Schowane są gładką częścią skrzydła. Podniesione psują przepływ powietrza za sobą: <strong>zmniejszają siłę nośną</strong> i <strong>zwiększają opór</strong> – odwrotnie niż klapy.
          </p>
          <p>
            Mają trzy zadania. W locie działają jak <strong>hamulce</strong>. Po przyziemieniu <strong>„gaszą” siłę nośną</strong>, żeby koła mocno docisnęły pas i hamulce działały skutecznie. A przy przechylaniu <strong>pomagają lotkom</strong> – podnoszą się tylko na skrzydle, które ma opaść.
          </p>
          <p>Przełączaj zastosowania i patrz, które płyty się podnoszą i jak wysoko. Wychylenia są przybliżone.</p>
        </>
      ),
    }),
    lab('vortex', {
      title: 'Wiry brzegowe i opór indukowany',
      camera: [112, 30, 82],
      target: [34, -2, 0],
      // ujęcia: z tyłu, z boku, z góry albo z bliska na końcówkę skrzydła
      view: (p) =>
        ({
          bok: { camera: [60, 6, 150] as V3, target: [70, -4, 0] as V3 },
          gora: { camera: [70, 160, 8] as V3, target: [70, 0, 0] as V3 },
          koncowka: { camera: [-4, 9, 52] as V3, target: [10, 0, 29] as V3 },
        })[String(p.cam ?? 'tyl')],
      controls: [
        { type: 'slider', key: 'cl', label: 'Współczynnik C_L', min: 0.3, max: 1.6, step: 0.05, default: 1.2, decimals: 2 },
        { type: 'toggle', key: 'winglets', label: 'Winglety', default: true },
        { type: 'toggle', key: 'follower', label: 'Samolot w śladzie', default: true },
        {
          type: 'select',
          key: 'cam',
          label: 'Ujęcie',
          default: 'tyl',
          options: [
            { value: 'tyl', label: 'z tyłu' },
            { value: 'bok', label: 'z boku' },
            { value: 'gora', label: 'z góry' },
            { value: 'koncowka', label: 'końcówka skrzydła' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Pod skrzydłem ciśnienie jest wyższe niż nad nim. Dlatego pod skrzydłem powietrze ucieka lekko <strong>w stronę końca skrzydła</strong> (różowe smugi), a nad nim – <strong>w stronę kadłuba</strong> (niebieskie). Na samym końcu skrzydła powietrze przelewa się z dołu na górę (żółte) i zaczyna się kręcić.
          </p>
          <p>
            Za samolotem ten ruch zwija się w dwa wielkie <strong>wiry</strong>, po jednym za każdym skrzydłem. Między nimi powietrze opada w dół (niebieskie smugi), a po ich zewnętrznej stronie – unosi się.
          </p>
          <p>
            Bo powietrze za skrzydłem opada, siła nośna jest lekko pochylona do tyłu – i część jej hamuje samolot. To tzw. <strong>opór indukowany</strong> – cena za to, że skrzydło niesie samolot. Jest tym większy, im wolniej samolot leci, więc przy podejściu do lądowania to nawet ponad połowa całego oporu. Inżynierowie liczą go wzorem C<sub>Di</sub> = C<sub>L</sub>² / (π·e·λ): długie, smukłe skrzydła (duże λ) mają go mniej.
          </p>
          <p>
            Wiry za dużym samolotem są bardzo silne: opadają ok. 2 m/s, utrzymują się 2–3 minuty i znosi je wiatr. Mniejszy samolot, który w nie wleci, może zostać gwałtownie przechylony – dlatego za ciężkimi samolotami kontrolerzy zachowują odstęp kilku mil morskich (ok. 7–11 km). <strong>Winglety</strong> na końcach skrzydeł osłabiają wir i zmniejszają opór o kilka procent – wyłącz je i porównaj liczby.
          </p>
        </>
      ),
    }),
    lab('turn', {
      title: 'Siły w zakręcie',
      camera: [86, 4, 0],
      target: [2, -7, 0],
      controls: [
        { type: 'slider', key: 'bank', label: 'Przechylenie φ', min: 0, max: 70, step: 1, default: 30, unit: '°' },
        { type: 'slider', key: 'v', label: 'Prędkość', min: 250, max: 950, step: 10, default: 450, unit: 'km/h' },
      ],
      body: (
        <>
          <p>
            Samolot nie skręca sterem kierunku jak łódka – <strong>przechyla się</strong>, jak rowerzysta na zakręcie. Siła nośna jest prostopadła do skrzydeł, więc przechyla się razem z samolotem. Jej <strong>pionowa</strong> część dalej niesie samolot, a <strong>pozioma</strong> ciągnie go w bok i zakrzywia jego tor. Ster kierunku tylko pilnuje, żeby samolot nie „ślizgał się” na bok.
          </p>
          <p>
            Pionowa część musi dalej równoważyć ciężar, więc cała siła nośna musi wzrosnąć: <strong>n = 1 / cos φ</strong> (φ – kąt przechylenia). Pilot albo autopilot lekko ciągnie drążek i zwiększa kąt natarcia. Przy przechyleniu 30° skrzydła niosą 1,15 ciężaru samolotu, przy 60° – dwa razy więcej.
          </p>
          <p>
            Pasażerowie prawie tego nie zauważają: w dobrze wykonanym zakręcie wszystko jest dociskane prosto do podłogi, tylko mocniej – herbata w kubku się nie przechyla, ale przy 60° każdy czułby się dwa razy cięższy.
          </p>
          <p>
            W zakręcie rośnie też prędkość przeciągnięcia, a promień zakrętu to r = v² / (g · tg φ): im szybciej, tym szerszy łuk. Samoloty pasażerskie przechylają się zwykle najwyżej o 25°. W A350 komputery same cofają przechylenie do 33°, gdy pilot puści drążek, i nie pozwalają przekroczyć 67°. Na ekranach w kokpicie widać przechylenie, zmieniający się kurs i przewidywany tor zakrętu, a czerwony pas na skali prędkości to prędkość przeciągnięcia w tym zakręcie.
          </p>
        </>
      ),
    }),
  ];
}
