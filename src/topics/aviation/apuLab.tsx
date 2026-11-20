/*
 * Moduł APU (Auxiliary Power Unit) A350-1000: mała turbina gazowa (Honeywell HGT1700) w stożku ogonowym, za grodzią
 * ogniową. Wspólna symulacja dla wszystkich zakładek: klapa wlotu, rozruch rozrusznikiem-prądnicą, zapłon, obroty N,
 * EGT, olej i paliwo, prądnica i upust powietrza, chłodzenie przed wyłączeniem, samoczynne wyłączenie przy usterce
 * i gaszenie pożaru. Pilot steruje przyciskami panelu górnego, a stan widać na stronie APU w ECAM i na modelu 3D.
 *
 * Wartości są typowe, ale przybliżone (dokładne granice podaje dokumentacja samolotu). Czas symulacji płynie trzy razy
 * szybciej niż w samolocie – rozruch trwa ok. 50 s, a tu ok. 17 s.
 */
import { useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Params, Step } from '../../lib/types';
import { InfoPortal, Sparkline } from '../../lib/plot';
import { useSceneHidden } from '../../lib/topicNav';
import { AIRBUS, CockpitDock, Ecam, PanelBox, Pushbutton as Pb } from '../../components/cockpit';
import { fuselageSection } from './airliner';
import { PathStreaks } from './wingLab';

type V3 = [number, number, number];

export type ApuMode = 'home' | 'start' | 'flow' | 'loads' | 'stop';
export type ApuFault = 'fire' | 'overspeed' | 'oil' | 'egt';

/** Ile razy szybciej płynie czas symulacji niż w samolocie. */
const TIME_K = 3;
/** Moc prądnicy APU na ziemi (kVA). */
const GEN_KVA = 150;
/** Temperatura otoczenia (°C) i ciśnienie (bar) – lotnisko na poziomie morza, dzień standardowy. */
const T_AMB = 15;
const P_AMB = 1.013;

/* ======================= symulacja ======================= */

export type ApuSim = {
  /** Przyciski panelu górnego. */
  master: boolean;
  startReq: boolean;
  bleedSw: boolean;
  genSw: boolean;
  packs: [boolean, boolean];
  /** Pozostały czas zapotrzebowania na powietrze do rozruchu silnika (s, czas samolotu). */
  engStart: number;
  /** Obciążenie elektryczne sieci samolotu (kVA). */
  elecLoad: number;
  /** Stan maszyny. */
  flap: number;
  n: number;
  egt: number;
  oilP: number;
  ff: number;
  fuelUsed: number;
  fuelOn: boolean;
  starter: boolean;
  ign: boolean;
  availT: number;
  avail: boolean;
  /** Chłodzenie przed wyłączeniem (s pozostało) i czas od ostatniego poboru powietrza (s). */
  cool: number;
  sinceBleed: number;
  /** Zawór upustowy 0…1 (otwiera się płynnie). */
  valve: number;
  /** Usterki i ochrona. */
  fault: ApuFault | null;
  autoShut: string | null;
  masterFault: boolean;
  fire: boolean;
  fireT: number;
  firePb: boolean;
  agent: 'armed' | 'disch' | null;
  agentT: number;
  /** Czas symulacji (s, czas samolotu) i historia do wykresów (próbki co 0,5 s). */
  t: number;
  hist: { n: number[]; egt: number[] };
  histAcc: number;
  /** Kąt wirnika do animacji (rad). */
  rot: number;
  /** Opis fazy do podpisów. */
  phase: string;
};

const newSim = (): ApuSim => ({
  master: false,
  startReq: false,
  bleedSw: false,
  genSw: true,
  packs: [false, false],
  engStart: 0,
  elecLoad: 60,
  flap: 0,
  n: 0,
  egt: T_AMB,
  oilP: 0,
  ff: 0,
  fuelUsed: 0,
  fuelOn: false,
  starter: false,
  ign: false,
  availT: 0,
  avail: false,
  cool: 0,
  sinceBleed: 999,
  valve: 0,
  fault: null,
  autoShut: null,
  masterFault: false,
  fire: false,
  fireT: 0,
  firePb: false,
  agent: null,
  agentT: 0,
  t: 0,
  hist: { n: [], egt: [] },
  histAcc: 0,
  rot: 0,
  phase: 'APU wyłączone',
});

/** APU zimne (wyłączone) albo pracujące, gotowe do pracy (AVAIL) – stan na początku zakładki. */
function presetSim(s: ApuSim, running: boolean, bleed = false) {
  Object.assign(s, newSim(), { elecLoad: s.elecLoad });
  if (running) Object.assign(s, { master: true, flap: 1, n: 100, egt: 420, oilP: 55, ff: 140, fuelOn: true, availT: 5, avail: true, bleedSw: bleed, valve: bleed ? 1 : 0, sinceBleed: bleed ? 0 : 999 });
}

/** Udział poboru powietrza 0…1: pakiety klimatyzacji i rozruch silnika (tylko przy otwartym zaworze). */
const bleedDemand = (s: ApuSim) => s.valve * Math.min(1, (s.packs[0] ? 0.32 : 0) + (s.packs[1] ? 0.32 : 0) + (s.engStart > 0 ? 0.6 : 0));
const genOn = (s: ApuSim) => s.avail && s.genSw && !s.fire;
const elecFrac = (s: ApuSim) => (genOn(s) ? Math.min(1, s.elecLoad / GEN_KVA) : 0);
/** Granica EGT: przy rozruchu wyższa (krótkotrwale), w pracy niższa. */
export const egtLimit = (s: ApuSim) => (s.avail ? 760 : 1000);

/** Samoczynne wyłączenie przez sterownik APU (ECB): odcięcie paliwa, lampka FAULT w MASTER SW. */
function shutDown(s: ApuSim, why: string) {
  s.fuelOn = false;
  s.starter = false;
  s.ign = false;
  s.startReq = false;
  s.avail = false;
  s.availT = 0;
  s.cool = 0;
  s.autoShut = why;
  s.masterFault = true;
}

function step(s: ApuSim, dtReal: number) {
  const ds = dtReal * TIME_K;
  s.t += ds;
  // klapa wlotu: otwiera się po włączeniu MASTER SW (ok. 20 s), zamyka po zatrzymaniu wirnika
  const flapT = s.master || s.n > 7 ? 1 : 0;
  s.flap += Math.sign(flapT - s.flap) * Math.min(Math.abs(flapT - s.flap), ds / 20);
  // START: dopiero przy otwartej klapie; rozrusznik (prądnica w trybie silnika) kręci wirnikiem do ok. 55% N
  if (s.startReq && s.master && s.flap >= 1 && !s.fuelOn && !s.masterFault && !s.fire && s.n < 55) s.starter = true;
  if (s.starter && (s.n >= 55 || !s.master)) s.starter = false;
  // zapłon i paliwo od ok. 7% N
  if (s.starter && s.n >= 7 && !s.fuelOn) s.fuelOn = true;
  s.ign = s.fuelOn && s.n < 55 && !s.avail;
  // wyłączenie: MASTER SW OFF – jeśli w ostatniej minucie brano powietrze, najpierw ok. 60 s chłodzenia na biegu jałowym
  if (!s.master && s.fuelOn) {
    if (s.avail && s.sinceBleed < 60 && s.cool <= 0 && s.n > 90 && !s.autoShut) s.cool = 60;
    if (s.cool > 0) {
      s.cool -= ds;
      if (s.cool <= 0) s.fuelOn = false;
    } else s.fuelOn = false;
  }
  if (!s.master) {
    s.startReq = false;
    s.avail = false;
    s.availT = 0;
  }
  // obroty: rozruch rozrusznikiem, potem turbina sama przyspiesza; regulator trzyma 100%; po odcięciu paliwa wybieg
  let dn: number;
  if (s.fuelOn) {
    const target = s.fault === 'overspeed' && s.avail ? 112 : 100;
    dn = s.n < 95 && !s.avail ? 1.25 + 0.012 * s.n + (s.starter ? 0.5 : 0) : (target - s.n) / (s.fault === 'overspeed' ? 4 : 1.6);
  } else if (s.starter) dn = 2.4;
  else dn = -(s.n / 11 + (s.n > 0.1 ? 0.3 : 0));
  s.n = Math.max(0, s.n + dn * ds);
  // AVAIL: N powyżej 95% przez 2 s
  if (s.fuelOn && s.master && s.n > 95) s.availT += ds;
  else if (!s.fuelOn) s.availT = 0;
  if (!s.avail && s.availT > 2 && s.master) {
    s.avail = true;
    s.startReq = false;
  }
  // zawór upustowy: tylko przy AVAIL i włączonym APU BLEED; otwiera się w ok. 2 s
  const vT = s.bleedSw && s.avail && s.cool <= 0 && !s.fire ? 1 : 0;
  s.valve += Math.sign(vT - s.valve) * Math.min(Math.abs(vT - s.valve), ds / 2);
  s.sinceBleed = s.valve > 0.05 && bleedDemand(s) > 0.01 ? 0 : s.sinceBleed + ds;
  if (s.engStart > 0) s.engStart = Math.max(0, s.engStart - ds);
  // EGT: szczyt przy rozruchu (ok. 800 °C przy 40–50% N), w pracy zależnie od obciążenia prądnicy i poboru powietrza
  const bd = bleedDemand(s);
  let egtT = T_AMB;
  if (s.fuelOn) {
    if (!s.avail) {
      const k = Math.max(0, Math.min(1, (s.n - 7) / 80));
      egtT = 100 + 560 * Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.1)), 0.8) + 300 * k;
    } else egtT = 380 + 110 * elecFrac(s) + 190 * bd;
    if (s.fault === 'egt' && s.avail) egtT += 520;
  }
  const tau = s.fuelOn ? 1.6 : 22;
  s.egt += (egtT - s.egt) * Math.min(1, ds / tau);
  // olej: ciśnienie z obrotów pompy; usterka – spada do zera
  const oilT = s.fault === 'oil' ? 4 : 55 * Math.pow(s.n / 100, 1.4);
  s.oilP += (oilT - s.oilP) * Math.min(1, ds / (s.fault === 'oil' ? 3 : 1));
  // paliwo (kg/h)
  s.ff = s.fuelOn ? (s.avail ? 110 + 95 * elecFrac(s) + 140 * bd : 55 + 0.9 * s.n) : 0;
  s.fuelUsed += (s.ff * ds) / 3600;
  // ochrona: samoczynne wyłączenie
  if (s.fuelOn && !s.autoShut) {
    if (s.n > 107) shutDown(s, 'NADOBROTY POWYŻEJ 107%');
    else if (s.egt > egtLimit(s) + 15) shutDown(s, 'PRZEGRZANIE – EGT PONAD GRANICĘ');
    else if (s.avail && s.oilP < 20) shutDown(s, 'NISKIE CIŚNIENIE OLEJU');
  }
  // pożar: na ziemi APU wyłącza się samo, a po ok. 3 s butla gaśnicza wyładowuje się automatycznie
  if (s.fire) {
    s.fireT += ds;
    if (s.fuelOn) shutDown(s, 'POŻAR APU');
    if (s.agent === null) s.agent = 'armed';
    if (s.agent === 'armed' && s.fireT > 3) s.agent = 'disch';
  }
  if (s.agent === 'disch') {
    s.agentT += ds;
    if (s.agentT > 2.5) s.fire = false;
  }
  // historia do wykresów
  s.histAcc += ds;
  if (s.histAcc > 0.5) {
    s.histAcc = 0;
    s.hist.n.push(s.n);
    s.hist.egt.push(s.egt);
    if (s.hist.n.length > 120) {
      s.hist.n.shift();
      s.hist.egt.shift();
    }
  }
  // obrót wirnika na modelu (pokazowo – prawdziwe ok. 40 000 obr./min byłyby tylko rozmazaniem)
  s.rot += (s.n / 100) * 26 * dtReal;
  s.phase = phaseOf(s);
}

function phaseOf(s: ApuSim): string {
  if (s.fire) return s.agent === 'disch' ? 'pożar – butla gaśnicza wyładowana' : 'POŻAR APU – samoczynne wyłączenie';
  if (s.autoShut && s.n > 1) return `samoczynne wyłączenie: ${s.autoShut.toLowerCase()}`;
  if (s.cool > 0) return `chłodzenie przed wyłączeniem – jeszcze ${Math.ceil(s.cool)} s`;
  if (s.masterFault) return `wyłączone przez sterownik (${s.autoShut?.toLowerCase() ?? 'usterka'}) – wyłącz MASTER SW`;
  if (s.starter && !s.fuelOn) return 'rozrusznik kręci wirnikiem (przed zapłonem)';
  if (!s.fuelOn && s.n > 1) return 'wybieg – wirnik zwalnia';
  if (s.avail) return 'APU pracuje (AVAIL)';
  if (s.fuelOn) return s.n < 55 ? 'zapłon – rozrusznik i spalanie razem' : 'turbina sama przyspiesza do 100%';
  if (s.master && s.flap < 1) return 'otwiera się klapa wlotu';
  if (s.master) return s.startReq ? 'czekanie na klapę' : 'gotowe do rozruchu – naciśnij START';
  if (s.autoShut) return `wyłączone: ${s.autoShut.toLowerCase()}`;
  return s.flap > 0.01 ? 'zamyka się klapa wlotu' : 'APU wyłączone';
}

/**
 * Stan APU dla wybranej zakładki: przy wejściu do zakładki (i przy zmianie usterki) – stan początkowy,
 * potem co klatkę symulacja. Przyciski panelu górnego zmieniają stan bezpośrednio.
 */
export function useApuDriver(mode: ApuMode | null, params: Params) {
  const sim = useRef<ApuSim>(newSim());
  const prev = useRef('');
  useFrame((_, dtRaw) => {
    if (!mode) return;
    const s = sim.current;
    const dt = Math.min(0.05, dtRaw);
    const key = `${mode}|${mode === 'stop' ? `${params.fault}|${params.trig}` : ''}`;
    if (key !== prev.current) {
      prev.current = key;
      if (mode === 'start') presetSim(s, false);
      else if (mode === 'stop') {
        presetSim(s, true, true);
        s.packs = [true, true];
        if (params.trig) {
          const f = String(params.fault ?? 'fire') as ApuFault;
          s.fault = f;
          if (f === 'fire') s.fire = true;
        }
      } else if (mode === 'loads') {
        presetSim(s, true, false);
      } else presetSim(s, true, false);
    }
    s.elecLoad = Number(params.load ?? 60);
    step(s, dt);
  });
  return sim;
}

/* ======================= geometria ======================= */

const FUS_N = 2.2;
/** Punkt na kadłubie (jak w modelu samolotu): kąt θ od grzbietu ku lewej burcie, inset – do środka. */
function fp(x: number, th: number, inset = 0): V3 {
  const { yc, h, w } = fuselageSection(x);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [x, yc + Math.max(0.01, h - inset) * Math.sign(c) * Math.pow(Math.abs(c), 2 / FUS_N), Math.max(0.01, w - inset) * Math.sign(s) * Math.pow(Math.abs(s), 2 / FUS_N)];
}

/** Oś APU (y) i położenia elementów wzdłuż osi (x, układ samolotu). */
const AY = 1.08;
const X = {
  wall: 32.75,
  gen0: 32.92,
  gen1: 33.3,
  gb0: 33.28,
  gb1: 33.48,
  lc0: 33.48,
  lc1: 33.76,
  pl0: 33.76,
  pl1: 33.96,
  pc0: 33.96,
  pc1: 34.22,
  cb0: 34.22,
  cb1: 34.58,
  tb0: 34.58,
  tb1: 34.86,
  exh: 36.1,
  tip: 37.05,
};
/** Klapa wlotu: na spodzie stożka po lewej stronie, poniżej zdjętej pokrywy. */
const FLAP = { x0: 33.62, x1: 34.02, th0: 2.22, th1: 2.62 };
const FLAP_HINGE_TH = (FLAP.th0 + FLAP.th1) / 2;

/** Część obrotowa wokół osi APU (profil [x, r]) z wyciętym klinem od strony kamery (lewa burta, nieco z góry). */
function casingGeo(profile: [number, number][], cut = 1.7) {
  const x0 = profile[0][0];
  const pts = profile.map(([x, r]) => new THREE.Vector2(r, x - x0));
  const phiC = -0.58;
  const g = new THREE.LatheGeometry(pts, 48, cut > 0 ? phiC + cut / 2 : 0, Math.PI * 2 - cut);
  g.rotateZ(-Math.PI / 2);
  g.translate(x0, AY, 0);
  return g;
}
function tubeGeo(pts: V3[], r: number, seg = 40) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(c, seg, r, 14, false);
}

/** Wirnik: tarcza z łopatkami (sprężarka promieniowa albo turbina osiowa), obraca się wokół osi x. */
function Rotor({ x, r, w, blades, kind, sim, color }: { x: number; r: number; w: number; blades: number; kind: 'radial' | 'axial'; sim: MutableRefObject<ApuSim>; color: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.x = sim.current.rot;
  });
  return (
    <group ref={g} position={[x, AY, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[kind === 'radial' ? r * 0.55 : r * 0.45, kind === 'radial' ? r * 0.95 : r * 0.5, w, 32]} />
        <meshStandardMaterial color={color} metalness={0.75} roughness={0.3} />
      </mesh>
      {Array.from({ length: blades }, (_, i) => {
        const a = (i / blades) * Math.PI * 2;
        const rr = kind === 'radial' ? r * 0.72 : r * 0.72;
        return (
          <mesh key={i} position={[0, Math.cos(a) * rr, Math.sin(a) * rr]} rotation={[a, kind === 'axial' ? 0.5 : 0.25, 0]}>
            <boxGeometry args={[w * (kind === 'radial' ? 0.95 : 0.7), kind === 'radial' ? r * 0.55 : r * 0.5, 0.012]} />
            <meshStandardMaterial color={color} metalness={0.8} roughness={0.25} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Mały efekt cząstek: płomienie pożaru albo chmura środka gaśniczego w przedziale APU. */
function Puffs({ sim, kind }: { sim: MutableRefObject<ApuSim>; kind: 'fire' | 'agent' }) {
  const N = 26;
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const st = useMemo(() => Array.from({ length: N }, (_, i) => ({ age: (i / N) * 1.2, x: 0, y: 0, z: 0 })), []);
  const light = useRef<THREE.PointLight>(null);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const s = sim.current;
    const on = kind === 'fire' ? s.fire : s.agent === 'disch' && s.agentT < 6;
    if (light.current) light.current.intensity = on && kind === 'fire' ? 6 + 4 * Math.random() : 0;
    st.forEach((p, i) => {
      const sp = sprites.current[i];
      if (!sp) return;
      p.age += dt * (kind === 'fire' ? 1.6 : 0.7);
      if (p.age > 1.2) {
        p.age = 0;
        p.x = X.cb0 + Math.random() * (X.tb1 - X.cb0);
        p.y = AY - 0.35 + Math.random() * 0.25;
        p.z = (Math.random() - 0.5) * 0.6;
      }
      sp.visible = on;
      if (!on) return;
      const u = p.age / 1.2;
      sp.position.set(p.x, p.y + u * (kind === 'fire' ? 0.6 : 0.3), p.z);
      const sc = kind === 'fire' ? 0.18 + 0.25 * u : 0.25 + 0.7 * u;
      sp.scale.set(sc, sc, 1);
      (sp.material as THREE.SpriteMaterial).opacity = (kind === 'fire' ? 0.9 : 0.55) * (1 - u);
    });
  });
  return (
    <group>
      <pointLight ref={light} position={[34.4, AY - 0.1, 0.2]} color="#ff7a1a" distance={4} intensity={0} />
      {st.map((_, i) => (
        <sprite key={i} ref={(el) => (sprites.current[i] = el)} visible={false}>
          <spriteMaterial color={kind === 'fire' ? (i % 3 ? '#ff7a1a' : '#ffd23a') : '#e8eef4'} transparent depthWrite={false} opacity={0} blending={kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending} />
        </sprite>
      ))}
    </group>
  );
}

/**
 * Model APU w stożku ogonowym (układ samolotu): gródź ogniowa, rozrusznik-prądnica na skrzynce napędów, sprężarka
 * obciążeniowa (powietrze dla samolotu), wlot z klapą, sprężarka i turbina napędowa z komorą spalania, kanał wylotowy
 * z tłumikiem, przewód upustowy z zaworem, zbiornik oleju i butla gaśnicza. Obudowy są przecięte od strony kamery.
 */
export function ApuModel({ sim, mode }: { sim: MutableRefObject<ApuSim>; mode: ApuMode }) {
  const g = useMemo(() => {
    // gródź ogniowa: płyta dopasowana do przekroju stożka
    const ring: V3[] = Array.from({ length: 49 }, (_, i) => fp(X.wall, -Math.PI + (i / 48) * Math.PI * 2, 0.03));
    const sec = fuselageSection(X.wall);
    const pos: number[] = [X.wall, sec.yc, 0];
    ring.forEach((p) => pos.push(...p));
    const idx: number[] = [];
    for (let i = 1; i < ring.length; i++) idx.push(0, i, i + 1 > ring.length - 1 ? 1 : i + 1);
    const wall = new THREE.BufferGeometry();
    wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wall.setIndex(idx);
    wall.computeVertexNormals();
    // wyściółka przedziału: wewnętrzna strona stożka poza zdjętą pokrywą (ciemna, żeby było widać wnętrze)
    const lin: number[] = [];
    const li: number[] = [];
    const xs = Array.from({ length: 9 }, (_, i) => X.wall + ((X.exh - 0.1 - X.wall) * i) / 8);
    const ths = Array.from({ length: 33 }, (_, j) => 2.1 + ((Math.PI * 2 - 2.1 + 0.25) * j) / 32);
    xs.forEach((x) => ths.forEach((th) => lin.push(...fp(x, th, 0.05))));
    for (let i = 0; i < xs.length - 1; i++)
      for (let j = 0; j < ths.length - 1; j++) {
        const a = i * ths.length + j;
        const b = a + ths.length;
        li.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const liner = new THREE.BufferGeometry();
    liner.setAttribute('position', new THREE.Float32BufferAttribute(lin, 3));
    liner.setIndex(li);
    liner.computeVertexNormals();
    // klapa wlotu: płat poszycia z zawiasem na tylnej krawędzi
    const fl: number[] = [];
    const fi: number[] = [];
    const fx = [0, 1, 2, 3, 4].map((i) => FLAP.x0 + ((FLAP.x1 - FLAP.x0) * i) / 4);
    const ft = [0, 1, 2, 3, 4, 5].map((j) => FLAP.th0 + ((FLAP.th1 - FLAP.th0) * j) / 5);
    const hinge = fp(FLAP.x1, FLAP_HINGE_TH, -0.004);
    fx.forEach((x) => ft.forEach((th) => {
      const p = fp(x, th, -0.006);
      fl.push(p[0] - hinge[0], p[1] - hinge[1], p[2] - hinge[2]);
    }));
    for (let i = 0; i < fx.length - 1; i++)
      for (let j = 0; j < ft.length - 1; j++) {
        const a = i * ft.length + j;
        const b = a + ft.length;
        fi.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const flap = new THREE.BufferGeometry();
    flap.setAttribute('position', new THREE.Float32BufferAttribute(fl, 3));
    flap.setIndex(fi);
    flap.computeVertexNormals();
    const flapMid = fp((FLAP.x0 + FLAP.x1) / 2, FLAP_HINGE_TH, 0.02);
    // obudowy (przecięte)
    const lcCase = casingGeo([[X.lc0, 0.2], [X.lc0 + 0.06, 0.3], [X.lc0 + 0.16, 0.37], [X.lc1, 0.36], [X.lc1, 0.22]]);
    const plCase = casingGeo([[X.pl0, 0.36], [X.pl0 + 0.1, 0.4], [X.pl1, 0.37]]);
    const pcCase = casingGeo([[X.pc0, 0.3], [X.pc0 + 0.1, 0.38], [X.pc1, 0.39]]);
    const cbCase = casingGeo([[X.cb0, 0.4], [X.cb0 + 0.15, 0.42], [X.cb1, 0.4], [X.cb1, 0.33]]);
    const liner2 = casingGeo([[X.cb0 + 0.04, 0.28], [X.cb0 + 0.14, 0.34], [X.cb1 - 0.06, 0.33], [X.cb1 - 0.02, 0.27]], 1.2);
    const tbCase = casingGeo([[X.tb0, 0.33], [X.tb0 + 0.12, 0.31], [X.tb1, 0.29]]);
    const gen = casingGeo([[X.gen0, 0.08], [X.gen0 + 0.03, 0.17], [X.gen1 - 0.03, 0.18], [X.gen1, 0.15]], 0);
    // kanał wylotowy z tłumikiem (eżektor wciąga powietrze chłodzące przedział) do wylotu w końcu stożka
    const exh = tubeGeo([[X.tb1 - 0.02, AY, 0], [35.3, AY + 0.03, 0], [35.8, AY + 0.08, 0], [X.exh + 0.2, 1.2, 0]], 0.2);
    const silencer = tubeGeo([[35.05, AY + 0.02, 0], [35.6, AY + 0.06, 0]], 0.26, 10);
    // wlot: od klapy do komory wlotowej między sprężarkami
    const inlet = tubeGeo([flapMid, [33.82, 0.62, 0.32], [(X.pl0 + X.pl1) / 2, AY - 0.3, 0.1]], 0.11);
    // przewód upustowy: od spirali sprężarki obciążeniowej przez zawór i gródź do przodu
    const bleed = tubeGeo([[X.lc0 + 0.14, AY + 0.36, 0], [X.lc0 + 0.1, AY + 0.55, 0], [33.0, AY + 0.62, 0], [32.0, AY + 0.7, 0], [30.6, AY + 0.82, 0]], 0.075);
    return { wall, liner, flap, hinge, lcCase, plCase, pcCase, cbCase, liner2, tbCase, gen, exh, silencer, inlet, bleed };
  }, []);
  useMemo(() => () => Object.values(g).forEach((v) => (v as THREE.BufferGeometry).dispose?.()), [g]);
  const flapG = useRef<THREE.Group>(null);
  const valveG = useRef<THREE.Mesh>(null);
  const flame = useRef<THREE.MeshStandardMaterial>(null);
  const genMat = useRef<THREE.MeshStandardMaterial>(null);
  const hinge = g.hinge;
  // oś zawiasu klapy: wzdłuż obwodu (prostopadle do osi kadłuba i do normalnej)
  const hingeAxis = useMemo(() => {
    const a = fp(FLAP.x1, FLAP.th0);
    const b = fp(FLAP.x1, FLAP.th1);
    return new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  }, []);
  useFrame(() => {
    const s = sim.current;
    if (flapG.current) flapG.current.quaternion.setFromAxisAngle(hingeAxis, -s.flap * 0.62); // przednia krawędź wychyla się na zewnątrz (czerpak)
    if (valveG.current) valveG.current.rotation.z = (1 - s.valve) * (Math.PI / 2);
    if (flame.current) {
      const hot = s.fuelOn ? Math.min(1, s.egt / 900) : Math.max(0, (s.egt - 80) / 1200);
      flame.current.emissiveIntensity = 0.2 + 3.2 * hot * (0.9 + 0.1 * Math.random());
    }
    if (genMat.current) genMat.current.emissiveIntensity = genOn(s) ? 0.5 + 0.5 * elecFrac(s) : s.starter ? 0.35 : 0;
  });
  const M = (color: string, metal = 0.6, rough = 0.4) => <meshStandardMaterial color={color} metalness={metal} roughness={rough} side={THREE.DoubleSide} />;
  return (
    <group>
      <mesh geometry={g.liner}>{M('#2a2f37', 0.2, 0.8)}</mesh>
      <mesh geometry={g.wall}>{M('#8b8f94', 0.7, 0.35)}</mesh>
      <group ref={flapG} position={hinge}>
        <mesh geometry={g.flap}>{M('#e9edf1', 0.1, 0.35)}</mesh>
      </group>
      {/* rozrusznik-prądnica i skrzynka napędów */}
      <mesh geometry={g.gen}>
        <meshStandardMaterial ref={genMat} color="#5d6b7a" metalness={0.5} roughness={0.4} emissive="#ffd23a" emissiveIntensity={0} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[(X.gb0 + X.gb1) / 2, AY - 0.12, 0]}>
        <boxGeometry args={[X.gb1 - X.gb0, 0.62, 0.46]} />
        {M('#7a7f86')}
      </mesh>
      {/* zbiornik oleju i chłodnica na skrzynce napędów */}
      <mesh position={[X.gb0 + 0.02, AY - 0.36, 0.3]}>
        <boxGeometry args={[0.26, 0.2, 0.14]} />
        {M('#a07a2c', 0.4, 0.5)}
      </mesh>
      <mesh geometry={g.lcCase}>{M('#9aa3ad')}</mesh>
      <mesh geometry={g.plCase}>{M('#7f8790')}</mesh>
      <mesh geometry={g.pcCase}>{M('#aab2bb')}</mesh>
      <mesh geometry={g.cbCase}>{M('#b9a07a', 0.7, 0.35)}</mesh>
      <mesh geometry={g.liner2}>
        <meshStandardMaterial ref={flame} color="#3b2a1a" emissive="#ff6a00" emissiveIntensity={0.2} metalness={0.4} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.tbCase}>{M('#8d7a66', 0.7, 0.35)}</mesh>
      <mesh geometry={g.exh}>{M('#6c6560', 0.6, 0.45)}</mesh>
      <mesh geometry={g.silencer}>{M('#77706a', 0.5, 0.5)}</mesh>
      <mesh geometry={g.inlet}>{M('#c4cbd2', 0.4, 0.45)}</mesh>
      <mesh geometry={g.bleed}>{M('#c7ccd1', 0.7, 0.3)}</mesh>
      {/* zawór upustowy (przepustnica) na przewodzie */}
      <group position={[33.18, AY + 0.6, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 0.12, 20]} />
          {M('#3f73b8', 0.3, 0.5)}
        </mesh>
        <mesh ref={valveG}>
          <boxGeometry args={[0.02, 0.15, 0.15]} />
          {M('#f2f4f6', 0.3, 0.4)}
        </mesh>
      </group>
      {/* wał i wirniki: sprężarka obciążeniowa, dwie sprężarki napędowe, dwa stopnie turbiny */}
      <mesh position={[(X.lc0 + X.tb1) / 2, AY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, X.tb1 - X.lc0, 12]} />
        {M('#d7dce1', 0.85, 0.2)}
      </mesh>
      <Rotor x={X.lc0 + 0.14} r={0.3} w={0.12} blades={14} kind="radial" sim={sim} color="#c9d2db" />
      <Rotor x={X.pc0 + 0.07} r={0.3} w={0.1} blades={13} kind="radial" sim={sim} color="#d6dce2" />
      <Rotor x={X.pc0 + 0.19} r={0.31} w={0.09} blades={13} kind="radial" sim={sim} color="#d6dce2" />
      <Rotor x={X.tb0 + 0.08} r={0.26} w={0.06} blades={24} kind="axial" sim={sim} color="#c8a46a" />
      <Rotor x={X.tb0 + 0.19} r={0.25} w={0.06} blades={24} kind="axial" sim={sim} color="#c8a46a" />
      {/* butla gaśnicza przed grodzią i przewód wyładowczy */}
      <mesh position={[32.35, 1.55, -0.25]}>
        <sphereGeometry args={[0.15, 20, 14]} />
        {M('#c0392b', 0.3, 0.45)}
      </mesh>
      <mesh geometry={useMemo(() => tubeGeo([[32.35, 1.55, -0.1], [32.6, 1.6, 0], [X.wall + 0.15, 1.62, 0.05]], 0.025, 12), [])}>{M('#b5382b', 0.3, 0.5)}</mesh>
      {/* czujnik pożaru: pętla wokół przedziału */}
      <mesh geometry={useMemo(() => tubeGeo([[X.wall + 0.1, AY + 0.48, -0.3], [33.8, AY + 0.52, -0.42], [34.6, AY + 0.45, -0.38], [34.9, AY - 0.35, -0.3], [33.9, AY - 0.42, -0.35], [X.wall + 0.1, AY - 0.4, -0.3]], 0.012, 60), [])}>{M('#e04b3a', 0.2, 0.5)}</mesh>
      <Puffs sim={sim} kind="fire" />
      <Puffs sim={sim} kind="agent" />
      {mode !== 'loads' && <ApuFlowViz sim={sim} detailed={mode === 'flow'} />}
    </group>
  );
}

/* ======================= przepływ ======================= */

/** Tory smug: wlot przez klapę, sprężarki, komora spalania, turbina, wylot; osobno – powietrze do przewodu upustowego. */
function flowPaths() {
  const flapMid = fp((FLAP.x0 + FLAP.x1) / 2, FLAP_HINGE_TH, -0.02);
  const n = fp((FLAP.x0 + FLAP.x1) / 2, FLAP_HINGE_TH, -0.8);
  const cold: V3[][] = [];
  const warm: V3[][] = [];
  const hot: V3[][] = [];
  const exhaust: V3[][] = [];
  const bleed: V3[][] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const r = 0.17;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const o = (k - 2.5) * 0.04;
    cold.push([
      [n[0] - 0.9, n[1] - 0.3 + o, n[2] + 0.3],
      [n[0] - 0.2, n[1] + o * 0.5, n[2]],
      [flapMid[0], flapMid[1] + o * 0.3, flapMid[2]],
      [33.82, 0.62, 0.32],
      [(X.pl0 + X.pl1) / 2, AY - 0.3, 0.1],
      [(X.pl0 + X.pl1) / 2, AY + ca * 0.3, sa * 0.3],
      [X.pc0 + 0.02, AY + ca * r, sa * r],
    ]);
    warm.push([
      [X.pc0 + 0.02, AY + ca * r, sa * r],
      [X.pc1 - 0.04, AY + ca * 0.34, sa * 0.34],
      [X.cb0 + 0.08, AY + ca * 0.35, sa * 0.35],
    ]);
    hot.push([
      [X.cb0 + 0.08, AY + ca * 0.35, sa * 0.35],
      [X.cb1 - 0.12, AY + ca * 0.31, sa * 0.31],
      [X.tb0 + 0.02, AY + ca * 0.22, sa * 0.22],
      [X.tb1, AY + ca * 0.18, sa * 0.18],
    ]);
    exhaust.push([
      [X.tb1, AY + ca * 0.16, sa * 0.16],
      [35.5, AY + 0.05 + ca * 0.13, sa * 0.13],
      [X.exh + 0.2, 1.2 + ca * 0.12, sa * 0.12],
      [X.tip + 0.6, 1.24 + ca * 0.2, sa * 0.2],
      [X.tip + 5, 1.4 + ca * 0.9, sa * 0.9],
    ]);
    // sprężarka obciążeniowa: z komory wlotowej do przodu, do spirali i przewodu upustowego
    bleed.push([
      [(X.pl0 + X.pl1) / 2, AY + ca * 0.25, sa * 0.25],
      [X.lc1 - 0.04, AY + ca * 0.18, sa * 0.18],
      [X.lc0 + 0.14, AY + ca * 0.33, sa * 0.33],
      [X.lc0 + 0.12, AY + 0.45, 0],
      [33.0, AY + 0.62, 0],
      [30.6, AY + 0.82, 0],
    ]);
  }
  return { cold, warm, hot, exhaust, bleed };
}

/** Smugi przepływu przez APU – gęstość i prędkość zależą od obrotów, przewód upustowy tylko przy otwartym zaworze. */
function ApuFlowViz({ sim, detailed }: { sim: MutableRefObject<ApuSim>; detailed: boolean }) {
  const P = useMemo(flowPaths, []);
  // poziomy obrotów i zaworu odświeżane rzadko (smugi przebudowują się przy zmianie liczby)
  const [lv, setLv] = useState({ n: 0, v: 0 });
  useFrame(() => {
    const s = sim.current;
    const n = s.n > 8 ? Math.round(s.n / 20) : 0;
    const v = s.valve > 0.5 ? 1 : 0;
    if (n !== lv.n || v !== lv.v) setLv({ n, v });
  });
  if (lv.n === 0) return null;
  const k = lv.n / 5;
  const sp = 0.6 + 1.6 * k;
  const w = detailed ? 0.022 : 0.016;
  return (
    <group>
      <PathStreaks paths={P.cold} count={Math.round(36 * k)} color="#7cc7ff" speed={sp} trail={0.35} width={w} opacity={0.85} />
      <PathStreaks paths={P.warm} count={Math.round(18 * k)} color="#ffd36b" speed={sp * 1.2} trail={0.25} width={w} opacity={0.9} />
      <PathStreaks paths={P.hot} count={Math.round(22 * k)} color="#ff5a1f" speed={sp * 1.6} trail={0.3} width={w} opacity={0.95} />
      <PathStreaks paths={P.exhaust} count={Math.round(40 * k)} color="#ffb08a" speed={sp * 2.4} trail={0.8} width={w * 1.4} opacity={0.6} />
      {lv.v > 0 && <PathStreaks paths={P.bleed} count={Math.round(30 * k)} color="#38d6ee" speed={sp * 1.3} trail={0.4} width={w} opacity={0.9} />}
    </group>
  );
}

/**
 * Powietrze i prąd z APU dla całego samolotu (zakładka obciążeń): przewód upustowy biegnie przez kadłub do pakietów
 * klimatyzacji w owiewce i przez skrzydło do rozrusznika silnika; kabel prądnicy – do głównej rozdzielni pod kokpitem.
 */
function ApuNetworks({ sim }: { sim: MutableRefObject<ApuSim> }) {
  const paths = useMemo(() => {
    const trunk: V3[] = [[33.0, AY + 0.62, 0], [28, 1.9, 0], [16, 2.2, 0], [6, 2.0, 0], [0, -1.2, 0], [-3, -2.6, 0]];
    const pack = (sz: number): V3[] => [...trunk, [-5, -2.9, 0.6 * sz], [-8, -3.0, 1.1 * sz]];
    const eng: V3[] = [...trunk.slice(0, 5), [-1.0, -1.6, 2.0], [-3.2, -1.3, 7.5], [-4.6, -1.4, 10.4], [-5.2, -2.3, 10.6]];
    const elec: V3[] = [[X.gen0, AY - 0.1, 0.1], [31, 0.8, 0.2], [20, -0.9, 0.6], [0, -1.6, 0.6], [-20, -1.5, 0.6], [-29, -1.6, 0.4]];
    return { packL: [pack(1)], packR: [pack(-1)], eng: [eng], elec: [elec] };
  }, []);
  const [st, setSt] = useState({ v: 0, p1: false, p2: false, e: false, g: false });
  useFrame(() => {
    const s = sim.current;
    const v = s.valve > 0.5 ? 1 : 0;
    const p1 = v > 0 && s.packs[0];
    const p2 = v > 0 && s.packs[1];
    const e = v > 0 && s.engStart > 0;
    const g = genOn(s);
    if (v !== st.v || p1 !== st.p1 || p2 !== st.p2 || e !== st.e || g !== st.g) setSt({ v, p1, p2, e, g });
  });
  return (
    <group>
      {st.p1 && <PathStreaks paths={paths.packL} count={60} color="#38d6ee" speed={9} trail={1.6} width={0.09} opacity={0.9} />}
      {st.p2 && <PathStreaks paths={paths.packR} count={60} color="#38d6ee" speed={9} trail={1.6} width={0.09} opacity={0.9} />}
      {st.e && <PathStreaks paths={paths.eng} count={70} color="#7df0ff" speed={12} trail={1.8} width={0.11} opacity={0.95} />}
      {st.g && <PathStreaks paths={paths.elec} count={80} color="#ffd23a" speed={16} trail={1.2} width={0.07} opacity={0.95} />}
    </group>
  );
}

/* ======================= stacje: ciśnienie i temperatura ======================= */

/** Ciśnienie (bar) i temperatura (°C) w stacjach APU z bieżących obrotów i obciążenia (przybliżenie cyklu Braytona). */
export function apuStations(s: ApuSim) {
  const nn = s.n / 100;
  const pr = 1 + 3.2 * nn * nn; // spręż sekcji napędowej przy 100%: ok. 4,2
  const T1K = T_AMB + 273.15;
  const T2K = T1K * (1 + (Math.pow(pr, 0.2857) - 1) / 0.8);
  const prL = 1 + 2.4 * nn * nn; // sprężarka obciążeniowa: ok. 3,4
  const TLK = T1K * (1 + (Math.pow(prL, 0.2857) - 1) / 0.78);
  const T4 = s.egt;
  // przed turbiną: EGT plus spadek temperatury na turbinie (praca na sprężarki i prądnicę)
  const T3 = s.fuelOn || s.egt > 100 ? T4 + (T2K - T1K) * 1.08 + 110 * elecFrac(s) + 140 * bleedDemand(s) + (s.avail ? 60 : 0) : T4;
  return [
    { id: 'in', name: 'wlot', p: P_AMB - 0.03 * nn, T: T_AMB },
    { id: 'pc', name: 'za sprężarką napędową', p: P_AMB * pr, T: T2K - 273.15 },
    { id: 'cb', name: 'przed turbiną', p: P_AMB * pr * 0.95, T: T3 },
    { id: 'ex', name: 'wylot (EGT)', p: P_AMB + 0.03 * nn, T: T4 },
    { id: 'lc', name: 'powietrze do samolotu', p: P_AMB * prL, T: TLK - 273.15 },
  ];
}
const STATION_POS: Record<string, V3> = {
  in: [33.84, 0.36, 0.62],
  pc: [X.pc1 - 0.05, AY + 0.62, 0.35],
  cb: [X.cb1 - 0.05, AY - 0.62, 0.45],
  ex: [35.8, AY + 0.55, 0.4],
  lc: [33.05, AY + 0.95, 0.15],
};

/* ======================= podpisy części ======================= */

export const APU_PARTS: Record<string, { name: string; desc: string; pos: V3 }> = {
  wall: { name: 'gródź ogniowa', desc: 'Tytanowa przegroda oddziela przedział APU od reszty kadłuba. Gdyby w przedziale wybuchł pożar, gródź zatrzyma ogień, a gasi go butla gaśnicza po drugiej stronie.', pos: [X.wall, 0.42, 0.75] },
  gen: { name: 'rozrusznik-prądnica', desc: 'Jedno urządzenie o dwóch rolach. Przy rozruchu jest silnikiem elektrycznym zasilanym z akumulatorów i kręci wirnikiem APU. Gdy APU pracuje, staje się prądnicą: daje 115 V prądu przemiennego o częstotliwości 400 Hz i mocy do 150 kVA na ziemi.', pos: [X.gen0 + 0.1, AY + 0.38, 0.3] },
  gb: { name: 'skrzynka napędów', desc: 'Przekładnia zębata zmniejsza obroty wału (ok. 40 000 obr./min) do obrotów prądnicy i napędza pompy oleju i paliwa. Na niej wisi zbiornik oleju smarującego łożyska.', pos: [X.gb0 + 0.05, AY - 0.62, 0.42] },
  lc: { name: 'sprężarka obciążeniowa', desc: 'Osobna sprężarka promieniowa na tym samym wale. Spręża powietrze tylko dla samolotu – do pakietów klimatyzacji i rozruchu silników – więc pobór powietrza nie zakłóca przepływu przez komorę spalania. Ilość powietrza ustawiają łopatki kierujące na jej wlocie.', pos: [X.lc0 + 0.12, AY + 0.55, 0.42] },
  inlet: { name: 'wlot z klapą', desc: 'Powietrze wpada przez otwór w spodzie stożka ogonowego. Klapa otwiera się po włączeniu MASTER SW (ok. 20 s) i zamyka po zatrzymaniu wirnika, żeby w locie nie było zbędnego oporu.', pos: [33.86, 0.25, 0.75] },
  pc: { name: 'sprężarka napędowa', desc: 'Dwa stopnie promieniowe sprężają powietrze ok. 4 razy przed komorą spalania. Ta część APU działa jak każdy silnik turbinowy – sprężarka, spalanie, turbina.', pos: [X.pc0 + 0.1, AY + 0.58, 0.3] },
  cb: { name: 'komora spalania', desc: 'Pierścieniowa komora z wtryskiwaczami paliwa i świecami zapłonowymi. Zapłon następuje przy ok. 7% obrotów; od tej chwili spalanie rozgrzewa gazy do ok. 1000 °C.', pos: [X.cb0 + 0.18, AY - 0.6, 0.38] },
  tb: { name: 'turbina', desc: 'Dwa stopnie osiowe zamieniają energię gorących gazów na obroty wału, który napędza obie sprężarki i prądnicę. Za turbiną mierzy się EGT – najważniejszą temperaturę APU.', pos: [X.tb0 + 0.14, AY + 0.5, 0.25] },
  exh: { name: 'wylot z tłumikiem', desc: 'Kanał wylotowy prowadzi spaliny do otworu w końcu stożka ogonowego. Tłumik zmniejsza hałas na płycie lotniska, a strumień spalin zasysa przy okazji powietrze chłodzące przedział i chłodnicę oleju.', pos: [35.6, AY + 0.42, 0.15] },
  bleed: { name: 'zawór upustowy', desc: 'Przepustnica na przewodzie z sprężarki obciążeniowej. Otwiera się po włączeniu APU BLEED, gdy APU jest gotowe (AVAIL). Przewód biegnie do przodu, do instalacji pneumatycznej samolotu.', pos: [33.3, AY + 0.86, 0.25] },
  fire: { name: 'butla gaśnicza i czujnik pożaru', desc: 'Pętla czujnika biegnie wokół przedziału. Przy pożarze na ziemi APU wyłącza się samo, a butla wyładowuje środek gaśniczy po ok. 3 s. W locie robi to pilot przyciskami APU FIRE i AGENT.', pos: [32.3, 2.32, -0.25] },
};
const PART_COLOR: Record<string, string> = {
  wall: '#cbd5e1',
  gen: '#ffd23a',
  gb: '#cbd5e1',
  lc: '#38d6ee',
  inlet: '#7cc7ff',
  pc: '#9be37b',
  cb: '#ff8a3d',
  tb: '#ffb86b',
  exh: '#ffb86b',
  bleed: '#38d6ee',
  fire: '#ff6b5b',
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

/* ======================= panel górny ======================= */

/** Fragment panelu górnego: APU (pożar, gaśnica, MASTER SW, START) oraz powietrze i prąd (APU BLEED, APU GEN, pakiety, rozruch silnika). */
function Overhead({ sim, mode }: { sim: MutableRefObject<ApuSim>; mode: ApuMode }) {
  const s = sim.current;
  const [, force] = useState(0);
  const act = (f: () => void) => () => {
    f();
    force((n) => n + 1);
  };
  const showAir = mode === 'loads' || mode === 'stop' || mode === 'start';
  return (
    <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }} onPointerDown={(e) => e.stopPropagation()}>
      <PanelBox title="APU">
          <Pb
            label="APU FIRE"
            guard
            top={{ text: 'FIRE', color: AIRBUS.red, on: s.fire }}
            bottom={{ text: 'PUSH', color: '#f2f4f6', on: s.firePb }}
            onPress={act(() => {
              s.firePb = true;
              if (s.fuelOn) shutDown(s, s.fire ? 'POŻAR APU' : 'PRZYCISK APU FIRE');
              if (s.agent === null) s.agent = 'armed';
            })}
          />
          <Pb
            label="AGENT"
            top={{ text: 'SQUIB', color: '#f2f4f6', on: s.agent === 'armed' && s.firePb }}
            bottom={{ text: 'DISCH', color: AIRBUS.amber, on: s.agent === 'disch' }}
            disabled={!s.firePb && !s.fire}
            onPress={act(() => {
              if (s.agent === 'armed') s.agent = 'disch';
            })}
          />
          <Pb
            label="MASTER SW"
            top={{ text: 'FAULT', color: AIRBUS.amber, on: s.masterFault }}
            bottom={{ text: 'ON', color: AIRBUS.cyan, on: s.master }}
            onPress={act(() => {
              s.master = !s.master;
              // wyłączenie i ponowne włączenie kasuje lampkę FAULT
              if (!s.master) s.masterFault = false;
              if (s.master) s.autoShut = s.fire ? s.autoShut : null;
            })}
          />
          <Pb
            label="START"
            top={{ text: 'AVAIL', color: AIRBUS.green, on: s.avail }}
            bottom={{ text: 'ON', color: AIRBUS.cyan, on: s.startReq }}
            disabled={!s.master}
            onPress={act(() => {
              if (s.master && !s.avail && !s.fuelOn) s.startReq = true;
            })}
          />
      </PanelBox>
      {showAir && (
        <PanelBox title="AIR · ELEC">
            <Pb label="APU BLEED" top={{ text: 'FAULT', color: AIRBUS.amber, on: false }} bottom={{ text: 'ON', color: AIRBUS.cyan, on: s.bleedSw }} onPress={act(() => (s.bleedSw = !s.bleedSw))} />
            <Pb label="APU GEN" top={{ text: 'FAULT', color: AIRBUS.amber, on: s.avail && !s.genSw }} bottom={{ text: 'OFF', color: '#f2f4f6', on: !s.genSw }} onPress={act(() => (s.genSw = !s.genSw))} />
            {mode === 'loads' && (
              <>
                <Pb label="PACK 1" bottom={{ text: 'OFF', color: '#f2f4f6', on: !s.packs[0] }} onPress={act(() => (s.packs = [!s.packs[0], s.packs[1]]))} />
                <Pb label="PACK 2" bottom={{ text: 'OFF', color: '#f2f4f6', on: !s.packs[1] }} onPress={act(() => (s.packs = [s.packs[0], !s.packs[1]]))} />
                <Pb
                  label="ENG 1 START"
                  bottom={{ text: 'ON', color: AIRBUS.cyan, on: s.engStart > 0 }}
                  disabled={s.valve < 0.5}
                  onPress={act(() => {
                    if (s.valve >= 0.5) s.engStart = 40;
                  })}
                />
              </>
            )}
        </PanelBox>
      )}
    </div>
  );
}

/* ======================= nakładka zakładek ======================= */

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

/** Ostrzeżenie ECAM z procedurą – zależnie od stanu (wykonane polecenia znikają). */
function warningOf(s: ApuSim) {
  if (s.fire || (s.autoShut === 'POŻAR APU' && s.agent !== 'disch')) {
    const lines: string[] = [];
    if (!s.firePb) lines.push('-APU FIRE P/B ........ PUSH');
    if (s.agent !== 'disch') lines.push('-AGENT ............. DISCH');
    if (s.master) lines.push('-MASTER SW ........... OFF');
    return { title: 'APU FIRE', color: AIRBUS.red, master: s.fire, lines };
  }
  if (s.autoShut && s.masterFault) return { title: 'APU AUTO SHUT DOWN', color: AIRBUS.amber, lines: s.master ? ['-MASTER SW ........... OFF'] : [] };
  return null;
}

/** Ramka z wykresem N i EGT (ostatnie ok. 60 s czasu samolotu). */
function History({ s }: { s: ApuSim }) {
  if (s.hist.n.length < 2) return null;
  return <Sparkline title="N (%) i EGT (°C / 10) – ostatnia minuta" series={[{ data: s.hist.n, color: '#3ee36b', label: 'N' }, { data: s.hist.egt.map((v) => v / 10), color: '#ff8a3d', label: 'EGT/10' }]} min={0} max={110} height={64} />;
}

const f0 = (v: number) => Math.round(v).toLocaleString('pl-PL');
const f1 = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ApuLab({ mode, sim }: { mode: ApuMode; sim: MutableRefObject<ApuSim> }) {
  useTicker();
  const s = sim.current;
  const [sel, setSel] = useState<string | null>(null);
  const st = apuStations(s);
  const bd = bleedDemand(s);
  const ecam = (
    <Ecam
      thrMode={null}
      n1={[0, 0]}
      egt={[T_AMB, T_AMB]}
      memo={[...(s.avail ? ([['APU AVAIL', AIRBUS.green]] as [string, string][]) : []), ...(s.valve > 0.5 ? ([['APU BLEED', AIRBUS.green]] as [string, string][]) : [])]}
      warning={warningOf(s)}
      page="APU"
      apu={{
        n: s.n,
        egt: s.egt,
        egtLimit: egtLimit(s),
        avail: s.avail,
        flapOpen: s.flap > 0.98,
        gen: { on: genOn(s), load: (elecFrac(s) * 100), v: genOn(s) ? 115 : 0, hz: genOn(s) ? 400 * (s.n / 100) : 0 },
        bleed: { open: s.valve > 0.5, psi: s.valve > 0.05 ? (44 - 10 * bd) * s.valve : 0 },
        fuelUsed: s.fuelUsed,
        lowOil: s.n > 50 && s.oilP < 25,
        fault: s.autoShut && !s.fire ? 'AUTO SHUTDOWN' : null,
      }}
      footer={{ tat: T_AMB, sat: T_AMB, isa: 0, flt: '00:00', time: '05:42:10', gw: 236400, gwcg: 29.1, fob: 21500 }}
      width={238}
    />
  );
  const showOverhead = mode !== 'home' && mode !== 'flow';
  return (
    <>
      <CockpitDock>
        {showOverhead && <Overhead sim={sim} mode={mode} />}
        {ecam}
      </CockpitDock>
      {mode === 'loads' && <ApuNetworks sim={sim} />}
      {mode === 'home' &&
        Object.entries(APU_PARTS).map(([id, p]) => (
          <Tag key={id} pos={p.pos} color={PART_COLOR[id]} active={sel === id} onClick={() => setSel(sel === id ? null : id)}>
            {p.name}
          </Tag>
        ))}
      {mode === 'flow' &&
        st.map((q) => (
          <Tag key={q.id} pos={STATION_POS[q.id]} color={q.id === 'lc' ? '#38d6ee' : q.T > 500 ? '#ff8a3d' : q.T > 100 ? '#ffd36b' : '#7cc7ff'}>
            <b>{q.name}</b>
            <br />
            {f2(q.p)} bar · {f0(q.T)} °C
          </Tag>
        ))}
      <InfoPortal>
        {mode === 'home' && (
          <>
            {sel ? (
              <>
                <div style={{ fontWeight: 700, color: PART_COLOR[sel] }}>{APU_PARTS[sel].name}</div>
                <div>{APU_PARTS[sel].desc}</div>
              </>
            ) : (
              <div>Kliknij podpis części APU, żeby przeczytać, do czego służy. Obudowy są przecięte – widać obracające się wirniki i rozżarzoną komorę spalania.</div>
            )}
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              N {f0(s.n)}% · EGT {f0(s.egt)} °C · paliwo {f0(s.ff)} kg/h
            </div>
          </>
        )}
        {mode !== 'home' && (
          <>
            <div style={{ fontWeight: 700, color: s.fire ? '#ff6b5b' : s.avail ? '#3ee36b' : '#ffd36b' }}>{s.phase}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px', fontSize: 13 }}>
              <span>obroty N</span>
              <b>{f1(s.n)} %</b>
              <span>EGT</span>
              <b style={{ color: s.egt > egtLimit(s) ? '#ff6b5b' : undefined }}>
                {f0(s.egt)} °C <span style={{ opacity: 0.6, fontWeight: 400 }}>(granica {f0(egtLimit(s))})</span>
              </b>
              <span>paliwo</span>
              <b>{f0(s.ff)} kg/h</b>
              <span>ciśnienie oleju</span>
              <b style={{ color: s.n > 50 && s.oilP < 25 ? '#ffb000' : undefined }}>{f0(s.oilP)} PSI</b>
              <span>klapa wlotu</span>
              <b>{f0(s.flap * 100)} %</b>
              {(mode === 'loads' || mode === 'stop' || mode === 'start') && (
                <>
                  <span>prądnica</span>
                  <b>{genOn(s) ? `${f0(s.elecLoad)} kVA z ${GEN_KVA} (${f0(elecFrac(s) * 100)} %)` : 'wyłączona'}</b>
                  <span>powietrze</span>
                  <b>{s.valve > 0.5 ? `zawór otwarty · pobór ${f0(bd * 100)} %` : 'zawór zamknięty'}</b>
                </>
              )}
              {s.engStart > 0 && (
                <>
                  <span>rozruch silnika 1</span>
                  <b>jeszcze {Math.ceil(s.engStart)} s</b>
                </>
              )}
            </div>
            {mode === 'flow' && <div style={{ fontSize: 12, opacity: 0.85 }}>Spręż sekcji napędowej: {f1(st[1].p / P_AMB)} · sprężarki obciążeniowej: {f1(st[4].p / P_AMB)}. Ciśnienia bezwzględne.</div>}
            <History s={s} />
            <div style={{ fontSize: 11, opacity: 0.6 }}>Czas płynie {TIME_K} razy szybciej niż w samolocie. Wartości przybliżone.</div>
          </>
        )}
      </InfoPortal>
    </>
  );
}

/* ======================= zakładki ======================= */

/** Numery zakładek na modelu – przy części, o której jest zakładka. */
export const APU_SPOTS: V3[] = [
  [33.9, 2.1, 0.6], // budowa
  [33.86, 0.2, 0.9], // rozruch – klapa wlotu
  [34.4, 1.85, 0.6], // przepływ – komora
  [33.1, 2.05, 0.4], // prąd i powietrze – zawór upustowy
  [32.35, 2.1, -0.1], // wyłączanie i pożar – butla
];

/** Zakładki modułu APU (po stronie głównej): rozruch, przepływ, prąd i powietrze, wyłączanie i zabezpieczenia. */
export function makeApuSteps(plane: (s: Omit<Step, 'kind' | 'scene' | 'stageKey'>) => Step): Step[] {
  return [
    plane({
      title: 'Rozruch APU',
      spot: APU_SPOTS[1],
      camera: [39.2, 0.9, 7.4],
      target: [34.4, 1.0, 0.2],
      preset: { focus: 'apu', apu: 'start' },
      body: (
        <>
          <p>
            Samolot stoi na płycie bez zasilania z lotniska. Uruchom APU przyciskami <b>panelu górnego</b> (lewy dolny róg): najpierw <b>MASTER SW</b> – sterownik APU włącza pompę paliwa i otwiera <b>klapę wlotu</b> (ok. 20 s). Potem <b>START</b> – rozrusznik-prądnica, zasilany z akumulatorów, zaczyna kręcić wirnikiem.
          </p>
          <p>
            Przy ok. <b>7% obrotów</b> świece dają iskrę i zaczyna się wtrysk paliwa – na stronie APU w ECAM rośnie <b>EGT</b>. Przy rozruchu temperatura na chwilę skacze wysoko (ok. 800 °C), bo powietrza jest jeszcze mało. Od ok. <b>55%</b> rozrusznik się odłącza, a turbina sama przyspiesza do 100%.
          </p>
          <p>
            Gdy obroty przekroczą <b>95%</b>, na przycisku START zapala się zielone <b>AVAIL</b>: APU jest gotowe do zasilania samolotu. Cały rozruch trwa w samolocie ok. minuty.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Przepływ przez APU',
      spot: APU_SPOTS[2],
      camera: [37.3, 2.6, 4.6],
      target: [34.2, 1.0, 0.1],
      preset: { focus: 'apu', apu: 'flow' },
      body: (
        <>
          <p>
            APU to mały silnik turbinowy, ale nie daje ciągu – cała moc idzie na wał. Powietrze wpada przez <b>klapę wlotu</b> do komory między sprężarkami i rozdziela się na dwie drogi.
          </p>
          <p>
            <b>Sekcja napędowa</b> (żółte i czerwone smugi): dwie sprężarki promieniowe sprężają powietrze ok. 4 razy, w <b>komorze spalania</b> dochodzi paliwo, a gorące gazy kręcą <b>turbiną</b> i wylatują przez tłumik w końcu stożka. <b>Sprężarka obciążeniowa</b> (błękitne smugi) spręża osobny strumień – to powietrze dla samolotu.
          </p>
          <p>Liczby przy stacjach to ciśnienie bezwzględne i temperatura w tej chwili. Za sprężarką powietrze jest gorące już od samego sprężania, a najgoręcej jest przed turbiną.</p>
        </>
      ),
    }),
    plane({
      title: 'Prąd i powietrze dla samolotu',
      spot: APU_SPOTS[3],
      camera: [46, 26, 40],
      target: [10, -0.5, 2],
      preset: { focus: 'apu', apu: 'loads' },
      controls: [{ type: 'slider', key: 'load', label: 'Pobór prądu w samolocie', min: 0, max: 150, step: 5, default: 60, unit: 'kVA' }],
      body: (
        <>
          <p>
            APU pracuje (AVAIL). Jego <b>prądnica</b> daje 115 V, 400 Hz – do 150 kVA. Żółte smugi to prąd płynący do głównej rozdzielni pod kokpitem. Suwakiem zmieniasz pobór: kuchnie, oświetlenie, wyświetlacze, pompy.
          </p>
          <p>
            Włącz <b>APU BLEED</b>, a potem <b>PACK 1</b> i <b>PACK 2</b>: powietrze z sprężarki obciążeniowej (błękitne smugi) płynie przez kadłub do pakietów klimatyzacji w owiewce. Przycisk <b>ENG 1 START</b> kieruje je do rozrusznika lewego silnika – to największy pobór.
          </p>
          <p>Obserwuj, jak każde obciążenie podnosi <b>EGT</b> i zużycie paliwa: regulator trzyma stałe obroty, więc pracę ponad bieg jałowy daje tylko więcej paliwa.</p>
        </>
      ),
    }),
    plane({
      title: 'Wyłączanie i zabezpieczenia',
      spot: APU_SPOTS[4],
      camera: [39.5, 2.2, 7.2],
      target: [34.0, 1.1, 0.1],
      preset: { focus: 'apu', apu: 'stop' },
      controls: [
        {
          type: 'select',
          key: 'fault',
          label: 'Usterka',
          default: 'fire',
          options: [
            { value: 'fire', label: 'pożar w przedziale APU' },
            { value: 'overspeed', label: 'nadobroty (awaria regulatora)' },
            { value: 'oil', label: 'utrata ciśnienia oleju' },
            { value: 'egt', label: 'przegrzanie (EGT)' },
          ],
        },
        { type: 'button', key: 'trig', label: 'Wywołaj usterkę', labelOn: 'Usuń usterkę', default: false },
      ],
      body: (
        <>
          <p>
            APU pracuje i zasila klimatyzację. Wyłącz je przyciskiem <b>MASTER SW</b>: AVAIL gaśnie, ale jeśli w ostatniej minucie brano powietrze, APU jeszcze ok. <b>60 s</b> pracuje bez obciążenia, żeby się wychłodzić. Dopiero potem sterownik odcina paliwo, wirnik zwalnia, a klapa wlotu się zamyka.
          </p>
          <p>
            Sterownik APU pilnuje go cały czas i przy <b>nadobrotach</b>, <b>przegrzaniu</b> albo <b>utracie ciśnienia oleju</b> sam je wyłącza – na przycisku MASTER SW zapala się FAULT. Przy <b>pożarze</b> na ziemi APU wyłącza się samo, a butla gaśnicza wyładowuje się po ok. 3 s. W locie pilot robi to ręcznie: wciska <b>APU FIRE</b>, a potem <b>AGENT</b>.
          </p>
          <p>Wybierz usterkę i ją wywołaj. Śledź, co dzieje się na ECAM, na przyciskach i w przedziale APU.</p>
        </>
      ),
    }),
  ];
}
