/*
 * Moduł radaru pogodowego A350-1000: antena pod owiewką w nosie, wiązka przemiatająca przed samolotem, obraz echa
 * na ND (radarNd.tsx) i miniatura burzy w scenie 3D – wszystko z tej samej pogody (radarWx.ts).
 *
 * Zakładki: budowa (strona główna, owiewka otwarta, klikane podpisy), wiązka i przemiatanie, kolory echa, pochylenie
 * anteny i profil pionowy, turbulencje, uskok wiatru przy podejściu (PWS) i omijanie burzy.
 *
 * Skala burzy w 3D jest skrócona: odległości w milach morskich zamienione na metry sceny (zwykle 4 m na NM), wysokość
 * – w stopach (1,2 m na 1000 ft), więc burza 30 NM przed samolotem stoi ok. 120 m przed nosem. Kształt wiązki
 * i to, gdzie trafia w chmurę, liczone są w tej samej skali – widać dokładnie to, co rysuje ND.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Params, Step } from '../../lib/types';
import { InfoPortal, fmt } from '../../lib/plot';
import { useSceneHidden } from '../../lib/topicNav';
import { AIRBUS, CockpitDock, PanelBox, Pfd, Pushbutton, ThrustLevers, cockpitFont } from '../../components/cockpit';
import { RADOME_X, fuselageSection } from './airliner';
import type { DirectPose } from './wingLab';
import { WxNd, type RadarView } from './radarNd';
import { BEAM_HALF, FT_NM, FZL, WX_LEVELS, beamCenter, beamHalf, fbm, fieldDbz, levelOf, sampleRadar, scenarioCells, type AcState, type RadarOpts, type Scenario, type WxCell } from './radarWx';

type V3 = [number, number, number];
export type RadarMode = 'home' | 'scan' | 'colors' | 'tilt' | 'turb' | 'pws' | 'avoid';
const DEG = Math.PI / 180;

/* ======================= geometria nosa ======================= */

const FUS_N = 2.2;
/** Punkt na kadłubie (jak w modelu samolotu): kąt θ od grzbietu ku lewej burcie, inset – do środka. */
function fp(x: number, th: number, inset = 0): V3 {
  const { yc, h, w } = fuselageSection(x);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [x, yc + Math.max(0.01, h - inset) * Math.sign(c) * Math.pow(Math.abs(c), 2 / FUS_N), Math.max(0.01, w - inset) * Math.sign(s) * Math.pow(Math.abs(s), 2 / FUS_N)];
}
/** Szpic owiewki (x). */
const TIP_X = -36.9;
/** Zawias owiewki: u góry styku z kadłubem – owiewka otwiera się do góry. */
const HINGE: V3 = [RADOME_X, fp(RADOME_X, 0)[1], 0];
/** Kąt otwarcia owiewki (rad). */
const OPEN_ANG = 95 * DEG;
/** Antena: środek płyty (oś obrotu w poziomie leży 0,3 m za płytą, na wsporniku przy grodzi), promień płyty. */
const ANT_Y = fuselageSection(RADOME_X - 0.5).yc;
const ANT_PIVOT: V3 = [RADOME_X - 0.23, ANT_Y, 0];
const ANT_ARM = 0.3;
const ANT_R = 0.38;
/** Środek płyty anteny w układzie samolotu (przy kącie 0) – stąd w scenie wychodzi wiązka. */
export const ANT_CENTER: V3 = [ANT_PIVOT[0] - ANT_ARM, ANT_Y, 0];

/** Siatka (x, θ) poszycia owiewki – zewnętrzna (inset 0) albo wewnętrzna (inset > 0). */
function radomeGeo(inset: number) {
  const xs = Array.from({ length: 19 }, (_, i) => TIP_X + (RADOME_X - TIP_X) * Math.pow(i / 18, 1.25));
  const ths = Array.from({ length: 49 }, (_, j) => -Math.PI + (j / 48) * Math.PI * 2);
  const pos: number[] = [];
  const idx: number[] = [];
  xs.forEach((x) => ths.forEach((th) => pos.push(...fp(x, th, inset))));
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ths.length - 1; j++) {
      const a = i * ths.length + j;
      const b = a + ths.length;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Płaska przegroda dopasowana do przekroju kadłuba w x (gródź ciśnieniowa). */
function bulkheadGeo(x: number) {
  const ring: V3[] = Array.from({ length: 49 }, (_, i) => fp(x, -Math.PI + (i / 48) * Math.PI * 2, 0.02));
  const pos: number[] = [x, fuselageSection(x).yc, 0];
  ring.forEach((p) => pos.push(...p));
  const idx: number[] = [];
  for (let i = 1; i < ring.length; i++) idx.push(0, i, i + 1 > ring.length - 1 ? 1 : i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Tekstura płaskiej anteny szczelinowej: rzędy szczelin falowodów na jasnej płycie. */
let slotTex: THREE.CanvasTexture | null = null;
function getSlotTex() {
  if (slotTex) return slotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#d6cdb6';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#5b5446';
  for (let row = 0; row < 26; row++)
    for (let col = 0; col < 22; col++) {
      const px = 12 + col * 10.5 + (row % 2) * 4;
      const py = 10 + row * 9.4;
      x.fillRect(px, py, 6, 2.2);
    }
  // ciemniejszy brzeg płyty
  const g = x.createRadialGradient(128, 128, 100, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(60,55,45,0.6)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  slotTex = new THREE.CanvasTexture(c);
  slotTex.colorSpace = THREE.SRGBColorSpace;
  return slotTex;
}
/** Miękki kłąb chmury (tekstura wspólna). */
let puffTex: THREE.CanvasTexture | null = null;
function getPuffTex() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

/* ======================= ustawienia zakładek ======================= */

/** Skala miniatury: metry sceny na milę morską (poziomo) i na stopę (pionowo). */
type Scale = { K: number; KV: number };
const SCALE: Scale = { K: 4, KV: 0.0012 };
const SCALE_PWS: Scale = { K: 26, KV: 0.026 };

export type RadarConf = {
  scenario: Scenario;
  opts: RadarOpts;
  range: number;
  alt: number;
  moving: boolean;
  vd: boolean;
  scale: Scale;
};
export function radarConf(mode: RadarMode, params: Params): RadarConf {
  const num = (k: string, d: number) => (params[k] === undefined ? d : Number(params[k]));
  const base = { auto: true, tilt: -1.5, gcs: true, turb: false };
  switch (mode) {
    case 'scan':
      return {
        scenario: 'line',
        opts: { cells: [], ...base, auto: false, tilt: num('tilt', -1.5) },
        range: num('range', 80),
        alt: 35000,
        moving: false,
        vd: false,
        scale: SCALE,
      };
    case 'colors':
      return {
        scenario: (String(params.storm ?? 'cb') as Scenario) || 'cb',
        opts: { cells: [], ...base },
        range: 80,
        alt: 35000,
        moving: false,
        vd: true,
        scale: SCALE,
      };
    case 'tilt':
      return {
        scenario: 'line',
        opts: {
          cells: [],
          ...base,
          auto: params.auto === true,
          tilt: num('tilt', -3),
          gcs: params.gcs === true,
        },
        range: 80,
        alt: num('fl', 350) * 100,
        moving: false,
        vd: true,
        scale: SCALE,
      };
    case 'turb':
      return {
        scenario: 'line',
        opts: { cells: [], ...base, turb: params.wxt !== false },
        range: 80,
        alt: 35000,
        moving: false,
        vd: false,
        scale: SCALE,
      };
    case 'pws':
      return {
        scenario: 'pws',
        opts: { cells: [], ...base, turb: true },
        range: 10,
        alt: 1800,
        moving: true,
        vd: false,
        scale: SCALE_PWS,
      };
    case 'avoid':
      return {
        scenario: 'avoid',
        opts: { cells: [], ...base, turb: true },
        range: 80,
        alt: 35000,
        moving: true,
        vd: true,
        scale: SCALE,
      };
    default:
      return {
        scenario: 'line',
        opts: { cells: [], ...base },
        range: 80,
        alt: 35000,
        moving: false,
        vd: false,
        scale: SCALE,
      };
  }
}

/* ======================= symulacja ======================= */

export type RadarSim = RadarView & {
  /** Kierunek przemiatania (+1 – w prawo) i bieżące pochylenie anteny (°). */
  dir: number;
  tiltNow: number;
  /** Otwarcie owiewki 0…1. */
  open: number;
  /** Lot (omijanie burzy, podejście): czas sceny, pochylenie i przechylenie samolotu (°), prędkość (kt), opadanie (ft/min). */
  t: number;
  pitch: number;
  bank: number;
  gs: number;
  vs: number;
  phase: string;
  /** PWS: 0 – brak, 1 – ostrzeżenie (bursztynowe), 2 – alarm (czerwony); reakcyjny alarm uskoku (bez PWS); odejście na drugi krąg. */
  ws: 0 | 1 | 2;
  wsReact: boolean;
  ga: boolean;
  /** Omijanie burzy: zadany kurs (°, względem trasy), czy samolot zboczył z trasy. */
  hdgT: number;
  off: boolean;
  key: string;
  /** Środek przedniej powierzchni płyty anteny w scenie (z kołysaniem samolotu i przemiataniem) – stąd wychodzi wiązka. */
  antPos: THREE.Vector3;
};
/** Stan początkowy radaru (antena na wprost) – także dla radaru wbudowanego w samolot poza modułem radaru. */
export const newRadarSim = (): RadarSim => ({
  ac: { X: 0, Y: 0, hdg: 0, alt: 35000 },
  az: 0,
  dir: 1,
  tiltNow: -1.5,
  open: 1,
  antPos: new THREE.Vector3(...ANT_CENTER),
  t: 0,
  pitch: 2.5,
  bank: 0,
  gs: 480,
  vs: 0,
  phase: '',
  ws: 0,
  wsReact: false,
  ga: false,
  hdgT: 0,
  off: false,
  key: '',
});

/** Mikroburst w scenariuszu PWS (Y w NM) i prędkość podejścia (kt). */
const MB_Y = 4.2;
const V_APP = 140;
/** Przyspieszenie czasu w scenach lotu: omijanie burzy (ok. 30 s zamiast 12 min) i podejście. */
const K_AVOID = 22;
const K_PWS = 7;

/** Wspólny stan radaru dla modelu, miniatury i ekranu; w zakładkach lotu ustawia też pozę samolotu. */
export function useRadarDriver(mode: RadarMode | null, params: Params, direct?: DirectPose) {
  const sim = useRef<RadarSim>(newRadarSim());
  useFrame((_, dtRaw) => {
    if (!mode) return;
    const dt = Math.min(0.05, dtRaw);
    const s = sim.current;
    const conf = radarConf(mode, params);
    const key = `${mode}|${conf.scenario}|${params.side ?? ''}|${params.pwsOn ?? ''}`;
    if (key !== s.key) {
      Object.assign(s, newRadarSim(), { key, open: s.open, az: s.az, dir: s.dir });
      s.ac.alt = conf.alt;
    }
    if (mode !== 'pws' && mode !== 'avoid') s.ac.alt = conf.alt;
    // owiewka: otwarta na ziemi (strona główna), zamknięta w locie
    const openT = mode === 'home' && params.open !== false ? 1 : 0;
    s.open += Math.sign(openT - s.open) * Math.min(Math.abs(openT - s.open), dt * 0.6);
    // przemiatanie: ±80°, ok. 45°/s (na ziemi wolniej – tylko pokaz ruchu anteny)
    s.az += s.dir * (mode === 'home' ? 22 : 45) * dt;
    if (Math.abs(s.az) > 80) {
      s.az = Math.sign(s.az) * 80;
      s.dir = -s.dir;
      // AUTO: antena co przemiatanie zmienia pochylenie (dwie wiązki – nisko i wysoko) i składa obraz 3D
      if (conf.opts.auto) s.tiltNow = s.tiltNow > -1.5 ? -3.2 : -0.4;
    }
    if (!conf.opts.auto) s.tiltNow = conf.opts.tilt;
    s.t += dt;
    if (mode === 'avoid') stepAvoid(s, dt, params.side === 'down' ? 1 : -1);
    if (mode === 'pws') stepPws(s, dt, params.pwsOn !== false);
    if (direct && mode !== 'home') {
      // w locie samolot lekko się kołysze (drobne podmuchy), przy burzy – mocniej
      const bump = mode === 'turb' || mode === 'avoid' ? 1.6 : 1;
      const wob = (Math.sin(s.t * 0.9) * 0.7 + Math.sin(s.t * 2.3 + 1) * 0.35) * bump;
      const nod = (Math.sin(s.t * 1.3 + 2) * 0.25 + Math.sin(s.t * 3.1) * 0.1) * bump;
      Object.assign(direct, {
        snap: false,
        pivot: [-6, 0, 0] as V3,
        shift: [0, 0, 0] as V3,
        lift: 0,
        bank: -s.bank + wob,
        yaw: 0,
        alpha: s.pitch + nod,
      });
      Object.assign(direct.surf, {
        aileron: 0,
        elevator: 0,
        rudder: 0,
        spoiler: 0,
      });
    }
  });
  return sim;
}

/** Omijanie burzy: zboczenie 45° (pod wiatr – w lewo, side = −1), lot równoległy, powrót na trasę. */
function stepAvoid(s: RadarSim, dt: number, side: number) {
  const ds = dt * K_AVOID;
  const v = 480 / 3600; // NM/s
  const storm = { x: 0, y: 45, r: 6 };
  const off = side * 26; // ok. 20 NM od brzegu silnego echa
  const a = s.ac;
  if (a.Y < 12) {
    s.hdgT = 0;
    s.phase = 'lot po trasie – burza na radarze ok. ' + fmt(storm.y - a.Y - storm.r, 0) + ' NM przed samolotem';
  } else if (Math.abs(a.X) < Math.abs(off) - 0.5 && a.Y < storm.y + storm.r + 8) {
    s.hdgT = side * 45;
    s.phase = `zboczenie z trasy – kurs ${side < 0 ? 'w lewo, pod wiatr' : 'w prawo, z wiatrem'}`;
  } else if (a.Y < storm.y + storm.r + 10) {
    s.hdgT = 0;
    s.phase = `obok burzy – ok. ${fmt(Math.abs(a.X - storm.x) - storm.r, 0)} NM od jej brzegu`;
  } else if (Math.abs(a.X) > 0.6) {
    s.hdgT = -Math.sign(a.X) * 45;
    s.phase = 'powrót na trasę';
  } else {
    s.hdgT = 0;
    s.phase = 'znów na trasie';
  }
  const err = s.hdgT - a.hdg;
  // zakręt ok. 3°/s w czasie samolotu, przechylenie do 25°
  a.hdg += Math.sign(err) * Math.min(Math.abs(err), 3 * ds);
  s.bank += ((Math.abs(err) > 0.5 ? Math.sign(err) * 25 : 0) - s.bank) * Math.min(1, dt * 2.5);
  a.X += Math.sin(a.hdg * DEG) * v * ds;
  a.Y += Math.cos(a.hdg * DEG) * v * ds;
  s.off = Math.abs(a.X) > 0.6;
  s.gs = 480;
  s.pitch = 2.5;
  if (a.Y > 95) Object.assign(a, { X: 0, Y: 0, hdg: 0 });
}

/** Podejście przez mikroburst: ścieżka 3°, ostrzeżenia PWS (3 NM, 1,5 NM) albo – bez PWS – reakcyjny alarm w uskoku. */
function stepPws(s: RadarSim, dt: number, pwsOn: boolean) {
  const ds = dt * K_PWS;
  const a = s.ac;
  const v = V_APP / 3600;
  const dist = MB_Y - a.Y;
  if (!s.ga) {
    // ścieżka 3° (ok. 318 ft na NM); w strefie prądu zstępującego samolot dodatkowo „spada”
    const sink = Math.max(0, 1 - Math.abs(dist) / 0.9);
    a.alt = Math.max(150, a.alt - (318 * v + sink * 25) * ds);
    s.vs = -(318 * v * 60 + sink * 1500);
    s.pitch = 2.5 - sink * 2;
    s.gs = V_APP - sink * 25;
    s.ws = 0;
    if (pwsOn && a.alt < 1500 && dist > 0) s.ws = dist < 1.5 ? 2 : dist < 3 ? 1 : 0;
    if (s.ws === 2) {
      s.ga = true;
      s.phase = 'W/S AHEAD – odejście na drugi krąg (TOGA)';
    } else if (s.ws === 1) s.phase = 'W/S AHEAD (ostrzeżenie) – uskok wiatru przed samolotem';
    else s.phase = pwsOn ? 'podejście po ścieżce 3°' : 'podejście po ścieżce 3° – PWS wyłączony';
    if (!pwsOn && sink > 0.35) {
      s.wsReact = true;
      s.ga = true;
      s.phase = 'WINDSHEAR – samolot już w uskoku, odejście z małej wysokości';
    }
  } else {
    // odejście: TOGA, pochylenie ok. 15°, wznoszenie
    s.pitch += (15 - s.pitch) * Math.min(1, dt * 1.5);
    const sink = Math.max(0, 1 - Math.abs(dist) / 0.9);
    const climb = 2500 - sink * 2200;
    a.alt += (climb / 60) * ds;
    s.vs = climb;
    s.gs = V_APP - sink * 20;
  }
  a.Y += v * ds;
  s.bank = 0;
  if (a.Y > MB_Y + 2.2)
    Object.assign(s, {
      ga: false,
      ws: 0,
      wsReact: false,
      ac: { X: 0, Y: 0, hdg: 0, alt: 1800 },
    });
}

/* ======================= model w nosie ======================= */

/** Owiewka, gródź, antena z napędem, nadajnik-odbiornik i anteny ILS – w układzie samolotu. */
/**
 * Radar w nosie (układ samolotu). `section` – do przekroju kadłuba: bez owiewki i grodzi (rysuje je kadłub), tylko
 * antena, napędy i nadajniki. `detail` – poziom szczegółów: bez niego (kamera daleko) bez anten ILS, falowodu i żeberek.
 */
export function RadarModel({ mode, sim, section = false, detail = true }: { mode: RadarMode; sim: MutableRefObject<RadarSim>; section?: boolean; detail?: boolean }) {
  const g = useMemo(() => {
    const outer = radomeGeo(0);
    const inner = radomeGeo(0.035);
    const wall = bulkheadGeo(RADOME_X + 0.015);
    // paski odgromowe: od szpica ku tyłowi, segmentowane (tu jako linie przerywane)
    const strips = [-2.4, -1.25, 0, 1.25, 2.4].map((th) =>
      Array.from({ length: 16 }, (_, i) => {
        const x = TIP_X + 0.12 + (RADOME_X - 0.08 - TIP_X - 0.12) * (i / 15);
        return fp(x, th, -0.006);
      }),
    );
    // usztywnienia grodzi: pionowe i poziome belki
    const ribs: V3[][] = [-0.9, -0.3, 0.3, 0.9].map((z) => [
      [RADOME_X + 0.01, fp(RADOME_X, 0)[1] - 0.15, z],
      [RADOME_X + 0.01, fp(RADOME_X, Math.PI)[1] + 0.15, z],
    ]);
    return { outer, inner, wall, strips, ribs };
  }, []);
  const hinge = useRef<THREE.Group>(null);
  const az = useRef<THREE.Group>(null);
  const el = useRef<THREE.Group>(null);
  const face = useRef<THREE.Group>(null);
  const outerMat = useRef<THREE.MeshStandardMaterial>(null);
  const flight = mode !== 'home';
  useFrame(() => {
    const s = sim.current;
    if (hinge.current) hinge.current.rotation.z = -OPEN_ANG * s.open;
    if (az.current) az.current.rotation.y = -s.az * DEG;
    // antena stabilizowana: pochylenie względem horyzontu, więc względem samolotu odejmuje się pochylenie samolotu
    if (el.current) el.current.rotation.z = -(s.tiltNow - s.pitch) * DEG;
    // położenie płyty w scenie (samolot się kołysze, płyta obraca się na ramieniu) – dla wiązki
    if (face.current) {
      face.current.updateWorldMatrix(true, false);
      face.current.getWorldPosition(s.antPos);
    }
  });
  const slot = getSlotTex();
  return (
    <group>
      {/* przednia gródź ciśnieniowa (podkład antykorozyjny) z usztywnieniami */}
      {!section && (
        <mesh geometry={g.wall}>
          <meshStandardMaterial color="#a9a66a" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
      {!section && detail && g.ribs.map((r, i) => (
        <Line key={i} points={r} color="#8b874f" lineWidth={3} />
      ))}
      {/* owiewka na zawiasie u góry: na ziemi otwarta, w locie zamknięta i półprzezroczysta (żeby było widać antenę) */}
      {!section && <group ref={hinge} position={HINGE}>
        <group position={[-HINGE[0], -HINGE[1], -HINGE[2]]}>
          <mesh geometry={g.outer}>
            <meshStandardMaterial ref={outerMat} color="#eef1f4" roughness={0.45} transparent={flight} opacity={flight ? 0.16 : 1} depthWrite={!flight} side={THREE.FrontSide} />
          </mesh>
          {!flight && (
            <mesh geometry={g.inner}>
              <meshStandardMaterial color="#d8cfae" roughness={0.9} side={THREE.BackSide} />
            </mesh>
          )}
          {g.strips.map((p, i) => (
            <Line key={i} points={p} color="#4a5058" lineWidth={2.2} dashed dashSize={0.07} gapSize={0.03} transparent opacity={flight ? 0.35 : 1} />
          ))}
        </group>
      </group>}
      {/* wspornik anteny na grodzi i silnik obrotu w poziomie */}
      <mesh position={[RADOME_X - 0.11, ANT_Y, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.17, 0.2, 0.22, 24]} />
        <meshStandardMaterial color="#3a3f45" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[RADOME_X - 0.13, ANT_Y - 0.28, 0.12]}>
        <boxGeometry args={[0.18, 0.2, 0.2]} />
        <meshStandardMaterial color="#2d3238" metalness={0.4} roughness={0.6} />
      </mesh>
      <group ref={az} position={ANT_PIVOT}>
        {/* jarzmo: oś pionowa i ramiona trzymające płytę */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.5, 16]} />
          <meshStandardMaterial color="#4b5158" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[-0.12, 0, 0]}>
          <boxGeometry args={[0.24, 0.1, 0.1]} />
          <meshStandardMaterial color="#565c63" metalness={0.5} roughness={0.5} />
        </mesh>
        <group ref={el} position={[-ANT_ARM + 0.08, 0, 0]}>
          {/* silnik pochylenia (tilt) i obrotowe złącze falowodu */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.34, 16]} />
            <meshStandardMaterial color="#2f343a" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0.04, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.09, 20]} />
            <meshStandardMaterial color="#1f2328" metalness={0.5} roughness={0.5} />
          </mesh>
          {/* płyta anteny: tył z falowodami (ciemny), przód ze szczelinami */}
          <mesh position={[-0.06, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[ANT_R, ANT_R, 0.06, 48]} />
            <meshStandardMaterial color="#8d887a" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[-0.091, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[ANT_R * 0.985, 48]} />
            <meshStandardMaterial map={slot} roughness={0.7} />
          </mesh>
          <group ref={face} position={[-0.092, 0, 0]} />
        </group>
      </group>
      {/* nadajnik-odbiornik (dwa, SYS 1 i SYS 2) pod anteną na grodzi i falowód do anteny */}
      {[-0.42, 0.42].map((z) => (
        <group key={z}>
          <mesh position={[RADOME_X - 0.16, ANT_Y - 0.72, z]}>
            <boxGeometry args={[0.3, 0.3, 0.36]} />
            <meshStandardMaterial color="#25292e" metalness={0.3} roughness={0.7} />
          </mesh>
          {[-0.1, 0, 0.1].map((dy) => (
            <mesh key={dy} position={[RADOME_X - 0.315, ANT_Y - 0.72 + dy, z]}>
              <boxGeometry args={[0.012, 0.03, 0.3]} />
              <meshStandardMaterial color="#555c64" />
            </mesh>
          ))}
        </group>
      ))}
      {detail && <><Line
        points={[
          [RADOME_X - 0.16, ANT_Y - 0.57, -0.42],
          [RADOME_X - 0.16, ANT_Y - 0.4, -0.2],
          [RADOME_X - 0.12, ANT_Y - 0.28, 0.0],
        ]}
        color="#b08a3e"
        lineWidth={5}
      />
      {/* anteny ILS: kurs (poziomy dipol u góry) i ścieżka schodzenia (pod spodem) */}
      <mesh position={[RADOME_X - 0.1, fp(RADOME_X, 0)[1] - 0.45, 0]}>
        <boxGeometry args={[0.04, 0.05, 1.2]} />
        <meshStandardMaterial color="#c9ccd0" metalness={0.4} roughness={0.4} />
      </mesh>
      {[-0.35, 0.35].map((z) => (
        <mesh key={z} position={[RADOME_X - 0.2, fp(RADOME_X, 0)[1] - 0.45, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
          <meshStandardMaterial color="#c9ccd0" />
        </mesh>
      ))}
      <mesh position={[RADOME_X - 0.12, fp(RADOME_X, Math.PI)[1] + 0.35, 0]}>
        <boxGeometry args={[0.06, 0.06, 0.8]} />
        <meshStandardMaterial color="#c9ccd0" metalness={0.4} roughness={0.4} />
      </mesh>
      </>}
    </group>
  );
}

/* ======================= miniatura pogody i wiązka ======================= */

/** Pseudolosowe liczby z ziarnem (ta sama chmura przy każdym renderze). */
function rng(seed: number) {
  let s = Math.floor(seed * 1000) + 12345;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Kłęby chmur z komórek: wieża do wierzchołka, przy burzach kowadło znoszone wiatrem w prawo (+X). */
function cloudPuffs(cells: WxCell[], sc: Scale, maxTop: number) {
  const out: { p: V3; s: number; c: string; o: number }[] = [];
  cells.forEach((c) => {
    const r = rng(c.seed);
    const top = Math.min(c.top, maxTop);
    const base = Math.min(3500, top * 0.4);
    const n = Math.min(140, Math.round(26 + c.r * 9));
    for (let i = 0; i < n; i++) {
      const anvil = c.top > 30000 && top === c.top && i < n * 0.22;
      const h = anvil ? top - r() * 5000 : base + Math.pow(r(), 0.85) * (top - base);
      const narrow = anvil ? 2.1 : 1 - 0.35 * ((h - base) / (top - base));
      const rr = Math.sqrt(r()) * c.r * narrow;
      const a = r() * Math.PI * 2;
      const X = c.x + rr * Math.cos(a) + (anvil ? c.r * 1.1 : 0);
      const Y = c.y + rr * Math.sin(a);
      const shade = 0.62 + 0.35 * ((h - base) / Math.max(1, top - base));
      const g = Math.round(255 * shade);
      out.push({
        p: [-Y * sc.K, h * sc.KV, -X * sc.K],
        s: Math.max(3, c.r * sc.K * (anvil ? 0.9 : 0.75)),
        c: `rgb(${g},${g + 3 > 255 ? 255 : g + 3},${Math.min(255, g + 8)})`,
        o: anvil ? 0.28 : 0.36,
      });
    }
  });
  return out;
}

/**
 * Świat radaru w scenie: chmury, ziemia, trasa i echa, w układzie świata (NM) przeliczonym na scenę. Grupa zewnętrzna
 * obraca świat o kurs samolotu i opuszcza go o wysokość lotu, wewnętrzna przesuwa o położenie samolotu – samolot stoi
 * w miejscu, a świat płynie pod nim.
 */
function RadarWorld({ sim, conf, cells }: { sim: MutableRefObject<RadarSim>; conf: RadarConf; cells: WxCell[] }) {
  const sc = conf.scale;
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const pwsMode = conf.scenario === 'pws';
  const puffs = useMemo(() => cloudPuffs(cells, sc, pwsMode ? 7000 : 60000), [cells, sc, pwsMode]);
  // echa: punkty w miejscach, gdzie wiązka trafia w opad (zanikają po kilku sekundach)
  const N = 18000;
  const echo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3).fill(0), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3).fill(0), 3));
    return { geo, next: 0 };
  }, []);
  useEffect(() => () => echo.geo.dispose(), [echo]);
  // mikroburst: cząstki powietrza – w dół rdzeniem, potem na boki przy ziemi
  const MB = 260;
  const mb = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MB * 3), 3));
    const st = Array.from({ length: MB }, (_, i) => ({
      u: (i / MB) * 1.0,
      a: (i * 2.399) % (Math.PI * 2),
      r0: 0.15 + ((i * 7) % 10) / 30,
    }));
    return { geo, st };
  }, []);
  useEffect(() => () => mb.geo.dispose(), [mb]);
  /**
   * Krople deszczu i grad w chmurach – to właśnie je „widzi” radar. Każda kropla spada w rdzeniu swojej komórki:
   * poniżej poziomu zamarzania – woda (niebieskawa), wyżej – lód i śnieg (białe), w burzach z gradem – większe ziarna.
   */
  const rain = useMemo(() => {
    const st: { X: number; Y: number; h: number; v: number; top: number; hail: boolean }[] = [];
    cells.forEach((c) => {
      const r = rng(c.seed + 0.37);
      const top = Math.min(c.top * 0.92, pwsMode ? 7000 : 60000);
      const n = Math.round(Math.min(700, 160 + c.r * 55) * (pwsMode ? 1.6 : 1));
      for (let i = 0; i < n; i++) {
        const rr = Math.sqrt(r()) * c.r * 0.95;
        const a = r() * Math.PI * 2;
        const hail = Boolean(c.hail) && r() < 0.18;
        st.push({ X: c.x + rr * Math.cos(a), Y: c.y + rr * Math.sin(a), h: r() * top, v: (hail ? 900 : 450) * (0.7 + 0.6 * r()), top, hail });
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(st.length * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(st.length * 3), 3));
    return { geo, st };
  }, [cells, pwsMode]);
  useEffect(() => () => rain.geo.dispose(), [rain]);
  // chmury „kłębią się”: kłęby powoli pęcznieją i dryfują
  const puffRefs = useRef<(THREE.Sprite | null)[]>([]);
  const grid = useRef<THREE.Group>(null);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const s = sim.current;
    const a = s.ac;
    if (outer.current) {
      outer.current.position.set(ANT_CENTER[0], ANT_CENTER[1] - a.alt * sc.KV, 0);
      outer.current.rotation.y = a.hdg * DEG;
    }
    if (inner.current) inner.current.position.set(a.Y * sc.K, 0, a.X * sc.K);
    // echa wzdłuż bieżącej wiązki
    const pos = echo.geo.attributes.position as THREE.BufferAttribute;
    const col = echo.geo.attributes.color as THREE.BufferAttribute;
    // próbki w całej objętości wiązki (losowo w jej przekroju): echo tam, gdzie wiązka trafia w krople
    const maxR = Math.min(conf.range, pwsMode ? 10 : 70);
    const steps = 110;
    for (let k = 1; k <= steps; k++) {
      for (let m = 0; m < 2; m++) {
        const R = ((k - Math.random()) / steps) * maxR;
        const az = (a.hdg + s.az + (Math.random() * 2 - 1) * BEAM_HALF) * DEG;
        const h = beamCenter(a.alt, R, s.tiltNow) + (Math.random() * 2 - 1) * beamHalf(R);
        const X = a.X + R * Math.sin(az);
        const Y = a.Y + R * Math.cos(az);
        let c: readonly number[] | null = null;
        let hh = h;
        if (h < 0) {
          // wiązka w ziemi: odbicie od terenu (chyba że radar je tłumi)
          if (conf.opts.gcs || conf.opts.auto) continue;
          if (26 + 20 * fbm(X * 0.9 + 40, Y * 0.9 - 17) < 30) continue;
          c = [190, 130, 80];
          hh = 0;
        } else {
          const lv = levelOf(fieldDbz(cells, X, Y, h).v);
          if (!lv) continue;
          c = lv.color;
        }
        const i = echo.next;
        echo.next = (echo.next + 1) % N;
        pos.setXYZ(i, -Y * sc.K, Math.max(0.2, hh * sc.KV), -X * sc.K);
        col.setXYZ(i, c[0] / 255, c[1] / 255, c[2] / 255);
      }
    }
    // zanikanie
    const fade = 1 - dt * 0.35;
    const arr = col.array as Float32Array;
    for (let i = 0; i < arr.length; i++) arr[i] *= fade;
    pos.needsUpdate = true;
    col.needsUpdate = true;
    // krople spadają; po dojściu do ziemi wracają na górę rdzenia
    const rp = rain.geo.attributes.position as THREE.BufferAttribute;
    const rc = rain.geo.attributes.color as THREE.BufferAttribute;
    rain.st.forEach((q, i) => {
      q.h -= q.v * dt * (pwsMode ? 1 : 6);
      if (q.h < 0) q.h = q.top * (0.6 + 0.4 * Math.random());
      rp.setXYZ(i, -q.Y * sc.K, q.h * sc.KV, -q.X * sc.K);
      if (q.hail) rc.setXYZ(i, 0.95, 0.95, 0.85);
      else if (q.h > FZL) rc.setXYZ(i, 0.85, 0.92, 1);
      else rc.setXYZ(i, 0.45, 0.72, 1);
    });
    rp.needsUpdate = true;
    rc.needsUpdate = true;
    // kłębienie chmur
    const t = s.t;
    puffRefs.current.forEach((sp, i) => {
      const q = puffs[i];
      if (!sp || !q) return;
      const k = 1 + 0.07 * Math.sin(t * 0.5 + i * 1.7);
      sp.scale.set(q.s * k, q.s * 0.8 * k, 1);
      sp.position.set(q.p[0] + Math.sin(t * 0.21 + i) * 0.6, q.p[1] + Math.sin(t * 0.33 + i * 0.7) * 0.3, q.p[2]);
    });
    // samolot leci: teren przesuwa się pod nim (w scenach, w których świat stoi razem z samolotem)
    if (grid.current && !conf.moving) {
      const cell = 10 * sc.K;
      grid.current.position.x = ((t * 14) % cell) - 40 * sc.K;
    }
    // mikroburst
    if (pwsMode) {
      const p = mb.geo.attributes.position as THREE.BufferAttribute;
      mb.st.forEach((q, i) => {
        q.u = (q.u + dt * 0.18) % 1;
        // 0…0,55 – w dół rdzeniem, potem rozpływ przy ziemi
        let rr: number;
        let h: number;
        if (q.u < 0.55) {
          rr = q.r0 * 0.6;
          h = 3200 * (1 - q.u / 0.55);
        } else {
          const w = (q.u - 0.55) / 0.45;
          rr = q.r0 * 0.6 + w * 1.6;
          h = 250 + 500 * Math.sin(w * Math.PI) * 0.6;
        }
        p.setXYZ(i, -(MB_Y + rr * Math.sin(q.a)) * sc.K, h * sc.KV, -(rr * Math.cos(q.a)) * sc.K);
      });
      p.needsUpdate = true;
    }
  });
  const tex = getPuffTex();
  const groundSize = pwsMode ? 1400 : 1600;
  return (
    <group ref={outer}>
      <group ref={inner}>
        <group ref={grid} position={[-(pwsMode ? 4 : 40) * sc.K, 0, 0]}>
        {/* ziemia (płaski teren) z siatką co 10 NM (przy podejściu co 1 NM) */}
        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[groundSize, groundSize]} />
          <meshStandardMaterial color={pwsMode ? '#26332a' : '#1a242e'} roughness={1} />
        </mesh>
        <gridHelper args={[groundSize, Math.round(groundSize / ((pwsMode ? 1 : 10) * sc.K)), '#33424f', '#2a3642']} position={[0, 0, 0]} />
        </group>
        {pwsMode && (
          // pas startowy przed mikroburstem (szerokość powiększona, żeby był widoczny)
          <mesh position={[-(5.66 + 0.81) * sc.K, 0.05, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} raycast={() => null}>
            <planeGeometry args={[3, 1.62 * sc.K]} />
            <meshStandardMaterial color="#4a4f55" />
          </mesh>
        )}
        {conf.scenario === 'avoid' && (
          <Line
            points={[
              [10 * sc.K, 35000 * sc.KV, 0],
              [-110 * sc.K, 35000 * sc.KV, 0],
            ]}
            color="#3ee36b"
            lineWidth={1.5}
            dashed
            dashSize={4}
            gapSize={3}
          />
        )}
        {puffs.map((q, i) => (
          <sprite key={i} ref={(el) => (puffRefs.current[i] = el)} position={q.p} scale={[q.s, q.s * 0.8, 1]} raycast={() => null}>
            <spriteMaterial map={tex} color={q.c} transparent opacity={q.o} depthWrite={false} />
          </sprite>
        ))}
        <points geometry={rain.geo} raycast={() => null}>
          <pointsMaterial size={pwsMode ? 0.9 : 0.55} vertexColors transparent opacity={0.85} depthWrite={false} sizeAttenuation />
        </points>
        <points geometry={echo.geo} raycast={() => null}>
          <pointsMaterial size={pwsMode ? 2.4 : 1.7} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
        </points>
        {pwsMode && (
          <points geometry={mb.geo} raycast={() => null}>
            <pointsMaterial size={1.6} color="#9fe8ff" transparent opacity={0.8} depthWrite={false} sizeAttenuation />
          </points>
        )}
      </group>
    </group>
  );
}

/** Wiązka radaru: stożek o szerokości ok. 3,5° (w skali miniatury), obracany za anteną. */
function Beam({ sim, conf }: { sim: MutableRefObject<RadarSim>; conf: RadarConf }) {
  const sc = conf.scale;
  const L = Math.min(conf.range, conf.scenario === 'pws' ? 10 : 70) * sc.K;
  // pionowo miniatura jest rozciągnięta (KV·FT_NM / K) – wiązka też
  const vk = (sc.KV * FT_NM) / sc.K;
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(1, 1, 32, 1, true);
    g.translate(0, -0.5, 0);
    g.rotateZ(-Math.PI / 2);
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const yaw = useRef<THREE.Group>(null);
  const pitch = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = sim.current;
    // wiązka wychodzi ze środka płyty anteny – tej w nosie, razem z kołysaniem samolotu i obrotem płyty na ramieniu
    if (root.current) root.current.position.copy(s.antPos);
    if (yaw.current) yaw.current.rotation.y = -s.az * DEG;
    if (pitch.current) pitch.current.rotation.z = -Math.atan(Math.tan(s.tiltNow * DEG) * vk);
  });
  const rh = L * Math.tan(BEAM_HALF * DEG);
  return (
    <group ref={root} position={ANT_CENTER}>
      <group ref={yaw}>
        <group ref={pitch}>
          <mesh geometry={geo} scale={[L, rh * vk, rh]} raycast={() => null}>
            <meshBasicMaterial color="#a7f3d0" transparent opacity={0.13} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
          <Line
            points={[
              [0, 0, 0],
              [-L, 0, 0],
            ]}
            color="#6ee7b7"
            lineWidth={1}
            transparent
            opacity={0.6}
          />
        </group>
      </group>
    </group>
  );
}

/* ======================= panel WXR i PFD z ostrzeżeniem ======================= */

/** Pokrętło panelu (widok z góry): położenia wokół, wskaźnik na wybranym. */
function Knob({ label, pos, sel, size = 54 }: { label: string; pos: string[]; sel: number; size?: number }) {
  const n = pos.length;
  const ang = (k: number) => (n === 1 ? 0 : -60 + (120 * k) / (n - 1));
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <svg width={size} height={size * 0.9} viewBox="-30 -27 60 54" role="img" aria-label={`${label}: ${pos[sel]}`}>
        {pos.map((p, k) => {
          const t = ((ang(k) - 90) * Math.PI) / 180;
          return (
            <text key={p} x={Math.cos(t) * 21} y={Math.sin(t) * 21 + 2.5} fontSize={6} fill={k === sel ? AIRBUS.cyan : '#f2f4f6'} textAnchor="middle" fontWeight={k === sel ? 700 : 400}>
              {p}
            </text>
          );
        })}
        <circle cx={0} cy={4} r={10} fill="#c9ced4" stroke="#6b737c" />
        <g transform={`translate(0 4) rotate(${ang(sel)})`}>
          <rect x={-2.6} y={-11} width={5.2} height={22} rx={2} fill="#eef0f2" stroke="#7d858e" strokeWidth={0.6} />
          <line x1={0} y1={-10} x2={0} y2={2} stroke="#3b4148" strokeWidth={1.2} />
        </g>
      </svg>
      <div style={{ fontSize: 7.5, color: '#f2f4f6', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  );
}
/** Panel radaru na pulpicie (WXR): system, tryb, pochylenie (AUTO / ręczne), PWS. Tylko pokazuje ustawienia zakładki. */
function WxrPanel({ conf, pwsOn }: { conf: RadarConf; pwsOn: boolean }) {
  const mode = conf.opts.turb ? 1 : 0;
  return (
    <div style={{ pointerEvents: 'none' }}>
      <PanelBox title="WXR">
        <Knob label="SYS" pos={['OFF', '1', '2']} sel={1} />
        <Knob label="MODE" pos={['WX', 'WX+T', 'TURB', 'MAP']} sel={mode} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            fontFamily: cockpitFont,
          }}
        >
          <div
            style={{
              width: 44,
              padding: '3px 0',
              background: '#14171b',
              border: '1px solid #3a4048',
              borderRadius: 3,
              textAlign: 'center',
              fontSize: 9,
              fontWeight: 700,
              color: AIRBUS.cyan,
            }}
          >
            {conf.opts.auto ? 'AUTO' : `${conf.opts.tilt > 0 ? '+' : ''}${conf.opts.tilt.toFixed(1)}°`}
          </div>
          <div style={{ fontSize: 7.5, color: '#f2f4f6' }}>TILT</div>
        </div>
        <Pushbutton
          label="PWS"
          bottom={{
            text: pwsOn ? 'AUTO' : 'OFF',
            color: pwsOn ? AIRBUS.cyan : '#f2f4f6',
            on: true,
          }}
          size={38}
        />
      </PanelBox>
    </div>
  );
}

/** PFD przy podejściu z napisem ostrzeżenia o uskoku wiatru (W/S AHEAD – PWS, WINDSHEAR – alarm reakcyjny). */
function PwsPfd({ sim }: { sim: MutableRefObject<RadarSim> }) {
  const s = sim.current;
  const a = s.ac;
  const fma: [string, string, string, string, string] = s.ga ? ['MAN TOGA', 'SRS', 'GA TRK', '', 'AP1\n1FD2\nA/THR'] : ['SPEED', 'G/S', 'LOC', 'CAT 3\nDUAL\nDH 50', 'AP1+2\n1FD2\nA/THR'];
  const msg = s.wsReact ? { t: 'WINDSHEAR', c: AIRBUS.red } : s.ws === 2 ? { t: 'W/S AHEAD', c: AIRBUS.red } : s.ws === 1 ? { t: 'W/S AHEAD', c: AIRBUS.amber } : null;
  return (
    <div style={{ position: 'relative' }}>
      <Pfd pitch={s.pitch} bank={0} ias={s.gs} iasTarget={V_APP} alt={a.alt} ra={a.alt} vs={s.vs} heading={84} track={84} baro={1013} fd={null} fma={fma} />
      {msg && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '17%',
            textAlign: 'center',
            fontFamily: cockpitFont,
            fontWeight: 700,
            fontSize: 13,
            color: msg.c,
            textShadow: '0 0 4px #000, 0 0 2px #000',
            pointerEvents: 'none',
          }}
        >
          {msg.t}
        </div>
      )}
    </div>
  );
}
(PwsPfd as unknown as { cockpitSlot: string }).cockpitSlot = 'pfd';

/* ======================= podpisy części (strona główna) ======================= */

/** Punkt owiewki po otwarciu o kąt a (rad) wokół zawiasu. */
const onRadome = (p: V3, open: number): V3 => {
  const t = -OPEN_ANG * open;
  const dx = p[0] - HINGE[0];
  const dy = p[1] - HINGE[1];
  return [HINGE[0] + dx * Math.cos(t) - dy * Math.sin(t), HINGE[1] + dx * Math.sin(t) + dy * Math.cos(t), p[2]];
};

export const RADAR_PARTS: Record<string, { name: string; desc: string; color: string; pos: (open: number) => V3 }> = {
  radome: {
    name: 'owiewka radaru (radom)',
    color: '#e2e8f0',
    desc: 'Osłona nosa z tworzywa wzmacnianego włóknem szklanym, które przepuszcza fale radaru prawie bez strat. Jej grubość jest dobrana tak, żeby nie osłabiała i nie zaginała wiązki – dlatego nie wolno jej malować farbą z drobinkami metalu, a po każdej naprawie sprawdza się, czy przepuszcza fale. Otwiera się do góry na zawiasach.',
    pos: (o) => onRadome(fp(-36.05, 1.2, -0.05), o),
  },
  strips: {
    name: 'paski odgromowe',
    color: '#94a3b8',
    desc: 'Nos najczęściej przyjmuje uderzenie pioruna. Paski z metalowych segmentów na zewnątrz owiewki odprowadzają prąd do kadłuba, zanim przebije kompozyt i uszkodzi antenę. Są dzielone na drobne kawałki, więc prawie nie zasłaniają wiązki.',
    pos: (o) => onRadome(fp(-36.45, -1.25, -0.05), o),
  },
  hinge: {
    name: 'zawiasy i zatrzaski',
    color: '#cbd5e1',
    desc: 'Owiewka wisi na zawiasach u góry i trzyma się zatrzaskami u dołu. Mechanik otwiera ją do góry, żeby sprawdzić radar i anteny systemu lądowania. Radar nie może wtedy nadawać – jego fale z bliska są groźne dla ludzi i mogą zapalić opary paliwa.',
    pos: () => [HINGE[0] - 0.05, HINGE[1] + 0.12, 0.75],
  },
  antenna: {
    name: 'płaska antena szczelinowa',
    color: '#facc15',
    desc: 'Płyta o średnicy ok. 76 cm z setkami wąskich szczelin. Fale ze wszystkich szczelin sumują się w wąską wiązkę – ok. 3,5°, jak światło latarki. Ta sama antena wysyła impuls i chwilę później odbiera jego echo od kropel deszczu.',
    pos: () => [ANT_CENTER[0] - 0.12, ANT_Y + ANT_R + 0.12, 0.25],
  },
  drive: {
    name: 'napęd i stabilizacja anteny',
    color: '#7dd3fc',
    desc: 'Dwa silniki obracają antenę: w poziomie (przemiatanie ±80° przed samolotem) i w pionie (pochylenie). Antena jest stabilizowana jak gimbal w kamerze: gdy samolot pochyla się albo przechyla, antena odchyla się w przeciwną stronę, a wiązka zostaje w tym samym położeniu względem horyzontu.',
    pos: () => [ANT_PIVOT[0] + 0.02, ANT_Y + 0.36, 0.48],
  },
  rt: {
    name: 'nadajnik-odbiornik (SYS 1 i 2)',
    color: '#fb923c',
    desc: 'Wytwarza krótkie impulsy fal radiowych (o długości ok. 3 cm) i odbiera ich echo. Z czasu powrotu liczy odległość, z siły echa – jak mocno pada, a ze zmiany częstotliwości echa – jak szybko poruszają się krople (to zdradza turbulencje i uskok wiatru). Są dwa, drugi jest zapasowy.',
    pos: () => [RADOME_X - 0.2, ANT_Y - 1.0, -0.35],
  },
  ils: {
    name: 'anteny ILS',
    color: '#a7f3d0',
    desc: 'Pod osłoną są też anteny systemu ILS, który prowadzi samolot do lądowania: jedna łapie sygnał wskazujący oś pasa, druga – właściwy kąt schodzenia. Odbierają sygnały nadajników przy pasie i prowadzą samolot przy podejściu.',
    pos: () => [RADOME_X - 0.15, fp(RADOME_X, 0)[1] - 0.3, -0.75],
  },
  bulkhead: {
    name: 'przednia gródź ciśnieniowa',
    color: '#d9d48a',
    desc: 'Szczelna ściana – za nią zaczyna się kokpit, w którym utrzymuje się ciśnienie. W nosie przed nią panuje takie ciśnienie i temperatura jak na zewnątrz, więc w locie ściana wytrzymuje ogromny nacisk powietrza z kabiny.',
    pos: () => [RADOME_X + 0.02, ANT_Y + 0.55, -1.0],
  },
};

function Tag({ pos, color, children, onClick, active = false }: { pos: V3; color: string; children: ReactNode; onClick?: () => void; active?: boolean }) {
  if (useSceneHidden()) return null;
  return (
    <group position={pos}>
      <Html center zIndexRange={[6, 0]} style={{ pointerEvents: onClick ? 'auto' : 'none' }}>
        <span
          className={['engine-label', onClick ? 'part-name' : '', active ? 'on' : ''].filter(Boolean).join(' ')}
          style={{
            color,
            whiteSpace: 'nowrap',
            cursor: onClick ? 'pointer' : undefined,
            pointerEvents: onClick ? 'auto' : 'none',
          }}
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

/* ======================= nakładka zakładek ======================= */

function useTicker(hz = 6) {
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

/** Punkty trasy przed samolotem (świat, NM) – na ND jak plan lotu z FMS. */
const WPTS = [
  { name: 'ABNEKUL', X: 0, Y: 18 },
  { name: 'ABLOG', X: 0, Y: 47 },
  { name: 'VALBO', X: 0, Y: 82 },
  { name: 'KERAS', X: 0, Y: 120 },
];

/** Legenda kolorów echa (dBZ i natężenie opadu). */
function Legend() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto 1fr',
        gap: '2px 8px',
        fontSize: 12,
        alignItems: 'center',
      }}
    >
      {[...WX_LEVELS].reverse().map((l) => [
        <span key={`${l.name}s`} style={{ width: 14, height: 10, borderRadius: 2, background: l.css }} />,
        <b key={`${l.name}d`}>≥ {l.min} dBZ</b>,
        <span key={`${l.name}r`} style={{ opacity: 0.85 }}>
          {l.rain}
        </span>,
      ])}
    </div>
  );
}

/** Model, miniatura burzy, wiązka, ekrany i ramka informacji – zależnie od zakładki. */
export function RadarLab({ mode, sim, params }: { mode: RadarMode; sim: MutableRefObject<RadarSim>; params: Params }) {
  useTicker();
  const [sel, setSel] = useState<string | null>(null);
  const base = radarConf(mode, params);
  const cells = useMemo(() => scenarioCells(base.scenario), [base.scenario]);
  const conf: RadarConf = { ...base, opts: { ...base.opts, cells } };
  const s = sim.current;
  const pwsOn = params.pwsOn !== false;
  const flight = mode !== 'home';
  // najbliższe silne echo (≥ 40 dBZ) przed samolotem
  const near = cells
    .filter((c) => c.peak >= 40)
    .map((c) => Math.hypot(c.x - s.ac.X, c.y - s.ac.Y) - c.r)
    .reduce((m, d) => Math.min(m, d), Infinity);
  const wsAt: [number, number] | null = mode === 'pws' && s.ws > 0 ? [0, MB_Y - s.ac.Y] : null;
  return (
    <>
      {flight && <RadarWorld sim={sim} conf={conf} cells={cells} />}
      {flight && <Beam sim={sim} conf={conf} />}
      {flight && (
        <>
          <CockpitDock>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {mode === 'pws' && <ThrustLevers pos={s.ga ? [2, 2] : [1, 1]} athr={!s.ga} size={86} />}
              <WxrPanel conf={conf} pwsOn={pwsOn} />
            </div>
            {mode === 'pws' && <PwsPfd sim={sim} />}
            <WxNd
              view={sim}
              opts={conf.opts}
              range={conf.range}
              vd={conf.vd}
              moving={conf.moving}
              gs={mode === 'pws' ? s.gs : 480}
              tas={mode === 'pws' ? s.gs : 470}
              wind={mode === 'pws' ? [250, 18] : [270, 45]}
              target={mode === 'pws' ? 'ILS27R' : 'ABLOG'}
              ws={wsAt}
              route={
                mode === 'pws'
                  ? [
                      [0, -10],
                      [0, 5.66],
                    ]
                  : [
                      [0, -20],
                      [0, 140],
                    ]
              }
              offRoute={s.off}
              wpts={mode === 'pws' ? [{ name: 'RW27R', X: 0, Y: 5.66 }] : WPTS}
              mora={mode === 'pws' ? 24 : 29}
              vor={mode === 'pws' ? [['BUK', 6], ['BKT', 21]] : [['BUK', 38], ['BKT', 41]]}
            />
          </CockpitDock>
        </>
      )}
      {mode === 'home' &&
        Object.entries(RADAR_PARTS).map(([id, p]) => (
          <Tag key={id} pos={p.pos(s.open)} color={p.color} active={sel === id} onClick={() => setSel(sel === id ? null : id)}>
            {p.name}
          </Tag>
        ))}
      <InfoPortal>
        {mode === 'home' &&
          (sel ? (
            <>
              <div style={{ fontWeight: 700, color: RADAR_PARTS[sel].color }}>{RADAR_PARTS[sel].name}</div>
              <div>{RADAR_PARTS[sel].desc}</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700 }}>Radar pogodowy pod owiewką w nosie</div>
              <div>Kliknij podpis części, żeby przeczytać, do czego służy. Antena porusza się tu tylko na pokaz – na ziemi radar zwykle nie nadaje.</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>pasmo X ok. 9,3 GHz · wiązka ok. 3,5° · zasięg do 320 NM · przemiatanie ±80°</div>
            </>
          ))}
        {flight && (
          <>
            {(mode === 'avoid' || mode === 'pws') && (
              <div
                style={{
                  fontWeight: 700,
                  color: s.ws === 2 || s.wsReact ? '#ff6b5b' : s.ws === 1 ? '#ffb000' : '#facc15',
                }}
              >
                {s.phase}
              </div>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto auto',
                gap: '1px 12px',
                fontSize: 13,
              }}
            >
              <span>tryb</span>
              <b>
                {conf.opts.turb ? 'WX+T' : 'WX'} · {conf.opts.auto ? 'AUTO (obraz 3D)' : `pochylenie ręczne ${conf.opts.tilt > 0 ? '+' : ''}${fmt(conf.opts.tilt, 1)}°`}
              </b>
              <span>zasięg ND</span>
              <b>{conf.range} NM</b>
              <span>wysokość</span>
              <b>{mode === 'pws' ? `${fmt(s.ac.alt, 0)} ft nad pasem` : `FL${Math.round(s.ac.alt / 100)}`}</b>
              {mode !== 'pws' && Number.isFinite(near) && (
                <>
                  <span>silne echo (≥ 40 dBZ)</span>
                  <b>{near <= 0 ? 'samolot w burzy!' : `${fmt(near, 0)} NM od samolotu`}</b>
                </>
              )}
              {!conf.opts.auto && (
                <>
                  <span>wiązka w 40 NM</span>
                  <b>
                    od {fmt(Math.max(0, (s.ac.alt + 40 * FT_NM * Math.tan(((conf.opts.tilt - BEAM_HALF) * Math.PI) / 180) - 0.66 * 1600) / 1000), 1)} do{' '}
                    {fmt((s.ac.alt + 40 * FT_NM * Math.tan(((conf.opts.tilt + BEAM_HALF) * Math.PI) / 180) - 0.66 * 1600) / 1000, 1)} tys. ft
                  </b>
                </>
              )}
            </div>
            {(mode === 'colors' || mode === 'scan') && <Legend />}
            {mode === 'turb' && <div style={{ fontSize: 13 }}>Magenta w odległości do 40 NM – turbulencja wykryta z rozrzutu prędkości kropel (efekt Dopplera). Dalej radar jej nie ocenia.</div>}
            {mode === 'avoid' && (
              <div style={{ fontSize: 13 }}>
                Wiatr wieje z lewej (270°/45 kt), więc kowadło burzy i grad są znoszone w prawo. Bezpieczniej omijać burzę <b>pod wiatr</b> – z lewej.
              </div>
            )}
            <div style={{ fontSize: 11, opacity: 0.6 }}>
              Burza w scenie 3D w skróconej skali ({conf.scale.K} m na NM, pionowo rozciągnięta). Kolorowe punkty – echo w miejscu, w które trafia wiązka.
              {mode === 'avoid' ? ` Czas ok. ${K_AVOID}× szybszy.` : mode === 'pws' ? ` Czas ok. ${K_PWS}× szybszy.` : ''}
            </div>
          </>
        )}
      </InfoPortal>
    </>
  );
}

/* ======================= zakładki ======================= */

/** Numery zakładek na modelu – przy części nosa, o której jest zakładka (owiewka otwarta). */
export const RADAR_SPOTS: V3[] = [
  [RADOME_X + 0.05, fp(RADOME_X, 0)[1] - 0.2, 1.0], // budowa – gródź u góry
  [ANT_CENTER[0] - 0.15, ANT_Y + 0.1, 0.55], // wiązka – płyta anteny
  [-36.1, -1.2, 1.1], // kolory – przed anteną
  [ANT_PIVOT[0], ANT_Y - 0.3, 0.6], // pochylenie – napęd
  [-35.9, -0.6, -0.9], // turbulencje
  [RADOME_X - 0.15, fp(RADOME_X, Math.PI)[1] + 0.5, 0.7], // uskok wiatru – antena ścieżki pod spodem
  [-36.4, -0.3, 0.2], // omijanie burzy
];

/** Ujęcie kamery w locie: za samolotem, nad lewym skrzydłem, z widokiem na burzę przed nosem. */
const FLIGHT_CAM: { camera: V3; target: V3 } = {
  camera: [40, 52, 82],
  target: [-85, -10, 0],
};

export function makeRadarSteps(plane: (s: Omit<Step, 'kind' | 'scene' | 'stageKey'>) => Step): Step[] {
  return [
    plane({
      title: 'Wiązka i przemiatanie',
      spot: RADAR_SPOTS[1],
      camera: [6, 26, 46],
      target: [-70, -8, -4],
      preset: { focus: 'radar', radar: 'scan' },
      controls: [
        {
          type: 'slider',
          key: 'tilt',
          label: 'Pochylenie anteny (tilt)',
          min: -10,
          max: 10,
          step: 0.5,
          default: -1.5,
          unit: '°',
        },
        {
          type: 'select',
          key: 'range',
          label: 'Zasięg ND',
          default: '80',
          options: [
            { value: '40', label: '40 NM' },
            { value: '80', label: '80 NM' },
            { value: '160', label: '160 NM' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Lecimy na wysokości ok. 10,5 km, a przed nami jest kilka burz. Osłona radaru jest tu półprzezroczysta. Antena co ok. 4 sekundy <b>przemiata</b> przestrzeń przed samolotem – 80° w lewo i 80° w prawo – a z jej płyty wychodzi wąska <b>wiązka</b> fal radiowych, jak snop latarki.
          </p>
          <p>
            Radar wysyła krótki impuls fal i nasłuchuje, czy wróci echo. Z <b>czasu powrotu</b> liczy, jak daleko jest chmura, a z <b>siły echa</b> – ile jest w niej wody. Kolorowe punkty w scenie to miejsca, z których wróciło echo.
          </p>
          <p>Na ekranie nawigacyjnym (ND) obraz zmienia się tylko tam, gdzie właśnie przeszła wiązka. Zmień pochylenie albo zasięg i zobacz, jak nowy obraz „domalowuje się” za anteną.</p>
        </>
      ),
    }),
    plane({
      title: 'Kolory na ekranie',
      spot: RADAR_SPOTS[2],
      ...FLIGHT_CAM,
      preset: { focus: 'radar', radar: 'colors' },
      controls: [
        {
          type: 'select',
          key: 'storm',
          label: 'Pogoda przed samolotem',
          default: 'cb',
          options: [
            { value: 'cb', label: 'burza (cumulonimbus z gradem)' },
            { value: 'squall', label: 'linia szkwału' },
            { value: 'rain', label: 'rozległy deszcz' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Im większe krople i im więcej ich w powietrzu, tym mocniejsze echo. Ekran zamienia jego siłę na kolory: <b>zielony</b> – umiarkowany deszcz, <b>żółty</b> – silny, <b>czerwony</b> – bardzo silny, <b>fioletowy</b> – ulewa, zwykle z gradem. Przez czerwone i fioletowe obszary się nie przelatuje.
          </p>
          <p>
            Radar widzi <b>wodę</b>, a nie samą chmurę. Krople wody odbijają fale kilka razy mocniej niż lód, więc wysoko, gdzie woda zamarza, ta sama burza wygląda słabiej. Suchy grad i śnieg dają słabe echo, a turbulencji w czystym powietrzu radar nie widzi wcale.
          </p>
          <p>
            Pod mapą jest <b>przekrój pionowy</b>: pogoda wzdłuż trasy, od ziemi do ok. 14 km. Porównaj wysoką burzę z płaskim, rozległym deszczem.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Pochylenie anteny i profil pionowy',
      spot: RADAR_SPOTS[3],
      ...FLIGHT_CAM,
      preset: { focus: 'radar', radar: 'tilt' },
      controls: [
        {
          type: 'toggle',
          key: 'auto',
          label: 'Tryb AUTO (radar z pamięcią 3D)',
          default: false,
        },
        {
          type: 'slider',
          key: 'tilt',
          label: 'Pochylenie anteny (tilt)',
          min: -10,
          max: 10,
          step: 0.5,
          default: -3,
          unit: '°',
        },
        {
          type: 'slider',
          key: 'fl',
          label: 'Poziom lotu',
          min: 100,
          max: 410,
          step: 10,
          default: 350,
          unit: 'FL',
        },
        {
          type: 'toggle',
          key: 'gcs',
          label: 'Tłumienie odbić od ziemi',
          default: false,
        },
      ],
      body: (
        <>
          <p>
            Wiązka rozszerza się z odległością jak światło latarki: 75 km przed samolotem ma już ok. 4,5 km grubości. Kiedyś piloci ustawiali jej pochylenie pokrętłem. Za wysoko – wiązka przechodzi nad mokrą częścią burzy, przez lód, i burza wygląda niegroźnie. Za nisko – trafia w ziemię i ekran zalewają <b>odbicia od terenu</b>.
          </p>
          <p>
            Na przekroju pionowym niebieskie linie to wiązka (jej środek i krawędzie). Zmieniaj pochylenie i wysokość lotu i patrz, jak zmienia się obraz. Do tego dochodzi <b>krzywizna Ziemi</b>: 150 km dalej ziemia „opada” o ok. 1,2 km.
          </p>
          <p>
            Radar w A350 robi to sam, w trybie <b>AUTO</b>: przemiata przestrzeń pod kilkoma kątami, zapamiętuje pogodę w trzech wymiarach i usuwa odbicia od ziemi. Pełnymi kolorami pokazuje chmury na wysokości samolotu, a te niżej – kreskowaniem.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Turbulencje (WX+T)',
      spot: RADAR_SPOTS[4],
      ...FLIGHT_CAM,
      preset: { focus: 'radar', radar: 'turb' },
      controls: [
        {
          type: 'toggle',
          key: 'wxt',
          label: 'Tryb WX+T (turbulencje)',
          default: true,
        },
      ],
      body: (
        <>
          <p>
            Radar mierzy nie tylko siłę echa, ale też to, jak szybko krople lecą w stronę anteny albo od niej (tak jak policyjny radar mierzy prędkość auta). W spokojnym deszczu wszystkie krople dryfują razem. W burzy, gdzie powietrze gwałtownie wznosi się i opada, ich prędkości bardzo się różnią.
          </p>
          <p>
            Duże różnice prędkości to <b>turbulencja</b>. W trybie WX+T ekran maluje ją na <b>fioletowo</b>, ale tylko do ok. 75 km – dalej echo jest za słabe do pomiaru. Radar widzi turbulencję tylko tam, gdzie pada. W czystym, bezchmurnym powietrzu nie ma kropel, więc nie ma czego mierzyć.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Uskok wiatru przy podejściu',
      spot: RADAR_SPOTS[5],
      camera: [60, 45, 115],
      target: [-100, -25, -10],
      preset: { focus: 'radar', radar: 'pws' },
      controls: [
        {
          type: 'toggle',
          key: 'pwsOn',
          label: 'PWS – wykrywanie uskoku wiatru',
          default: true,
        },
      ],
      body: (
        <>
          <p>
            Pod burzą może powstać gwałtowny prąd powietrza w dół (<b>mikroburst</b>): powietrze uderza w ziemię i rozlewa się na boki. Samolot podchodzący do lądowania najpierw dostaje wiatr w nos i przybywa mu prędkości. Zaraz potem wpada w prąd w dół i wiatr w ogon – i traci prędkość i wysokość tuż nad ziemią. To bardzo groźne.
          </p>
          <p>
            Poniżej ok. 450 m radar sam zaczyna szukać przed samolotem takiego układu wiatru. Ostrzeżenie <b>W/S AHEAD</b> („uskok przed nami”) na ekranie lotu jest pomarańczowe ok. 5 km przed uskokiem, a czerwone – z komunikatem głosowym „GO AROUND, WINDSHEAR AHEAD” – bliżej. Pilot przerywa lądowanie: pełny ciąg, nos w górę i odlot na drugie okrążenie.
          </p>
          <p>
            Wyłącz ostrzeganie radarowe: samolot wleci w uskok i dopiero tam alarm <b>WINDSHEAR</b> z czujników samolotu każe przerwać lądowanie – dużo niżej i w trudniejszej sytuacji.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Omijanie burzy',
      spot: RADAR_SPOTS[6],
      camera: [40, 70, 110],
      target: [-120, -20, -10],
      preset: { focus: 'radar', radar: 'avoid' },
      controls: [
        {
          type: 'select',
          key: 'side',
          label: 'Strona obejścia',
          default: 'up',
          options: [
            { value: 'up', label: 'pod wiatr (w lewo) – zalecana' },
            { value: 'down', label: 'z wiatrem (w prawo)' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Na trasie stoi burza. Piloci widzą ją na radarze z daleka i proszą kontrolerów o zgodę na <b>zboczenie z trasy</b>: skręcają o 45°, żeby minąć silne echo o ok. <b>40 km</b> – tyle zaleca się na dużej wysokości od czerwonych i fioletowych obszarów. Trasa na ekranie zmienia się wtedy w przerywaną linię.
          </p>
          <p>
            Burzę omija się <b>od strony, z której wieje wiatr</b>: wiatr znosi z burzy grad i jej płaski wierzch (tzw. kowadło), a pod nim, nawet daleko od burzy, może sypać grad i mocno trząść. Nigdy nie leci się nad burzą – rośnie szybciej, niż samolot się wznosi – ani pod nią.
          </p>
          <p>Po minięciu burzy samolot wraca na trasę. Wybierz stronę obejścia i porównaj, jak blisko samolot przelatuje obok mniejszych chmur po prawej.</p>
        </>
      ),
    }),
  ];
}
