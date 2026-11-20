import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox, InfoPortal } from '../../lib/plot';
import { Lights } from '../../lib/three';
import { Html, Line } from '@react-three/drei';
import { useTicker } from '../../lib/useCanvasLoop';
import { C, Curve, Pt, Seg, VIEW, num, usePlot } from '../../lib/mathkit';
import { useSpeed } from '../../components/ui';

/* ---------- Krok 1: cząsteczki w trzech stanach skupienia (3D) ---------- */
const SIDE = 5; // 5 × 5 × 5 = 125 cząsteczek
const N = SIDE ** 3;
const RAD = 0.17;
const BOX = new THREE.Vector3(4.4, 3.6, 3.2);
const GAP = 0.42; // odstęp w sieci krystalicznej

type Phase = 'solid' | 'liquid' | 'gas';
const phaseOf = (T: number): Phase => (T < 0 ? 'solid' : T < 100 ? 'liquid' : 'gas');
const PHASE_LABEL: Record<Phase, string> = { solid: 'ciało stałe (lód)', liquid: 'ciecz (woda)', gas: 'gaz (para wodna)' };
const PHASE_COLOR: Record<Phase, string> = { solid: '#7dd3fc', liquid: '#3b82f6', gas: '#e2e8f0' };

function gauss() {
  return Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random());
}

function ParticlesScene({ params }: SceneProps) {
  const sp = useSpeed();
  const T = Number(params.T);
  const phase = phaseOf(T);
  useTicker(300);

  const homes = useMemo(() => {
    const out: THREE.Vector3[] = [];
    const off = ((SIDE - 1) * GAP) / 2;
    for (let i = 0; i < SIDE; i++)
      for (let j = 0; j < SIDE; j++)
        for (let k = 0; k < SIDE; k++) out.push(new THREE.Vector3(i * GAP - off, -BOX.y / 2 + RAD + 0.02 + j * GAP, k * GAP - off));
    return out;
  }, []);
  const st = useRef({
    p: homes.map((h) => h.clone()),
    v: homes.map(() => new THREE.Vector3()),
  });
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(BOX.x, BOX.y, BOX.z)), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.033);
    const { p, v } = st.current;
    const half = BOX.clone().multiplyScalar(0.5).subScalar(RAD);
    const Tk = T + 273;
    // średnia prędkość cząsteczek w jednostkach sceny – rośnie jak √T
    const speed = phase === 'gas' ? 1.6 * Math.sqrt(Tk / 373) : 0.55 * Math.sqrt(Tk / 273);

    if (phase === 'solid') {
      // drgania wokół węzłów sieci – amplituda rośnie z temperaturą
      const amp = 0.012 + 0.05 * (Tk / 273);
      for (let i = 0; i < N; i++) {
        tmp.copy(homes[i]).sub(p[i]);
        v[i].addScaledVector(tmp, 160 * dt);
        v[i].x += gauss() * amp * 9;
        v[i].y += gauss() * amp * 9;
        v[i].z += gauss() * amp * 9;
        v[i].multiplyScalar(0.86);
        p[i].addScaledVector(v[i], dt);
      }
    } else {
      // odpychanie z bliska (cząsteczki się nie przenikają) + w cieczy przyciąganie najbliższych sąsiadów
      const d0 = 2 * RAD * 1.15;
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
          tmp.subVectors(p[i], p[j]);
          const d = tmp.length();
          if (d < 1e-4) continue;
          let f = 0;
          if (d < d0) f = (d0 - d) * 60;
          else if (phase === 'liquid' && d < d0 * 1.6) f = -(d - d0) * 6;
          if (f !== 0) {
            tmp.multiplyScalar((f * dt) / d);
            v[i].add(tmp);
            v[j].sub(tmp);
          }
        }
      let sum = 0;
      for (let i = 0; i < N; i++) {
        if (phase === 'liquid') v[i].y -= 4 * dt; // ciecz zbiera się na dnie naczynia
        v[i].x += gauss() * 0.15;
        v[i].y += gauss() * 0.15;
        v[i].z += gauss() * 0.15;
        sum += v[i].lengthSq();
      }
      // termostat: średnia energia kinetyczna odpowiada temperaturze
      const k = Math.pow(speed / (Math.sqrt(sum / N) || 1), 0.15);
      for (let i = 0; i < N; i++) {
        v[i].multiplyScalar(k);
        p[i].addScaledVector(v[i], dt);
        (['x', 'y', 'z'] as const).forEach((ax) => {
          if (p[i][ax] < -half[ax]) {
            p[i][ax] = -half[ax];
            v[i][ax] = Math.abs(v[i][ax]);
          }
          if (p[i][ax] > half[ax]) {
            p[i][ax] = half[ax];
            v[i][ax] = -Math.abs(v[i][ax]);
          }
        });
      }
    }
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < N; i++) {
      dummy.position.copy(p[i]);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  const desc: Record<Phase, string[]> = {
    solid: ['cząsteczki ułożone regularnie w sieci', 'tylko drgają wokół stałych położeń', 'stały kształt i stała objętość'],
    liquid: ['cząsteczki blisko siebie, ale bez porządku', 'przesuwają się względem siebie', 'kształt naczynia, stała objętość'],
    gas: ['cząsteczki daleko od siebie', 'poruszają się szybko po liniach prostych', 'wypełniają całe naczynie – brak kształtu i stałej objętości'],
  };
  const vRms = Math.sqrt((3 * 8.314 * (T + 273)) / 0.018);
  return (
    <group>
      <Lights />
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.3} />
      </lineSegments>
      <instancedMesh ref={mesh} args={[undefined, undefined, N]}>
        <sphereGeometry args={[RAD, 14, 14]} />
        <meshStandardMaterial color={PHASE_COLOR[phase]} roughness={0.35} />
      </instancedMesh>
      <InfoPortal>
        <div style={{ color: PHASE_COLOR[phase], fontWeight: 600, fontSize: 16 }}>
          {num(T, 0)} °C – {PHASE_LABEL[phase]}
        </div>
        {desc[phase].map((d) => (
          <div key={d}>• {d}</div>
        ))}
        <div style={{ color: C.third }}>średnia prędkość cząsteczki H₂O: ok. {sp.fmt(vRms)}</div>
        <div className="muted-line">przy 1013 hPa woda topnieje w 0 °C i wrze w 100 °C</div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 2: krzywa ogrzewania wody ---------- */
const C_ICE = 2.1; // kJ/(kg·K)
const C_WATER = 4.19;
const C_STEAM = 2.0;
const L_F = 334; // kJ/kg
const L_V = 2260;
const T0 = -30;
const T1 = 130;

/** Granice etapów ogrzewania dla masy m [kg]: zwraca skumulowane ciepło na końcu każdego etapu. */
function stages(m: number) {
  const q1 = m * C_ICE * (0 - T0);
  const q2 = q1 + m * L_F;
  const q3 = q2 + m * C_WATER * 100;
  const q4 = q3 + m * L_V;
  const q5 = q4 + m * C_STEAM * (T1 - 100);
  return [q1, q2, q3, q4, q5];
}
function tempAt(Q: number, m: number) {
  const [q1, q2, q3, q4] = stages(m);
  if (Q <= q1) return T0 + Q / (m * C_ICE);
  if (Q <= q2) return 0;
  if (Q <= q3) return (Q - q2) / (m * C_WATER);
  if (Q <= q4) return 100;
  return 100 + (Q - q4) / (m * C_STEAM);
}

/* ---------- Krok 3: diagram fazowy ---------- */
interface Sub {
  name: string;
  /** punkt potrójny */
  Tt: number;
  pt: number;
  /** punkt krytyczny */
  Tc: number;
  pc: number;
  /** ciepło sublimacji [J/mol] */
  Ls: number;
  /** nachylenie linii topnienia dT/dp [K/Pa] */
  melt: number;
  /** punkt pośredni krzywej parowania [°C, Pa] */
  mid: [number, number];
  Tmin: number;
  Tmax: number;
}
const SUBS: Record<string, Sub> = {
  h2o: { name: 'woda H₂O', Tt: 0.01, pt: 611.7, Tc: 374, pc: 22.06e6, Ls: 51000, melt: -7.4e-8, mid: [100, 101325], Tmin: -100, Tmax: 400 },
  co2: { name: 'dwutlenek węgla CO₂', Tt: -56.6, pt: 518e3, Tc: 31, pc: 7.38e6, Ls: 26000, melt: 2.0e-7, mid: [0, 3.49e6], Tmin: -100, Tmax: 400 },
};
const K = (t: number) => t + 273.15;
const P_MIN = 1;
const P_MAX = 1e8;
const ATM = 101325;

function curves(s: Sub) {
  // krzywa parowania: ln p liniowo względem 1/T między punktem potrójnym, punktem pośrednim i krytycznym
  const pts: [number, number][] = [[s.Tt, s.pt], s.mid, [s.Tc, s.pc]].map(([t, p]) => [1 / K(t), Math.log(p)]);
  const lnVap = (t: number) => {
    const x = 1 / K(t);
    const [a, b] = x >= pts[1][0] ? [pts[0], pts[1]] : [pts[1], pts[2]];
    return a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
  };
  const vap = (t: number) => Math.exp(lnVap(t));
  const sub = (t: number) => s.pt * Math.exp(-(s.Ls / 8.314) * (1 / K(t) - 1 / K(s.Tt)));
  const meltT = (p: number) => s.Tt + s.melt * (p - s.pt);
  /** temperatura wrzenia pod ciśnieniem p (odwrócenie krzywej parowania) */
  const boil = (p: number) => {
    const y = Math.log(p);
    const [a, b] = y <= pts[1][1] ? [pts[0], pts[1]] : [pts[1], pts[2]];
    return 1 / (a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) - 273.15;
  };
  return { vap, sub, meltT, boil };
}

function stateAt(s: Sub, t: number, p: number) {
  const c = curves(s);
  if (t > s.Tc && p > s.pc) return 'płyn nadkrytyczny';
  if (p < s.pt) return p > c.sub(t) ? 'ciało stałe' : 'gaz';
  if (t < c.meltT(p)) return 'ciało stałe';
  if (t <= s.Tc && p > c.vap(t)) return 'ciecz';
  if (t > s.Tc) return 'gaz';
  return 'gaz';
}
const STATE_COLOR: Record<string, string> = { 'ciało stałe': '#7dd3fc', ciecz: '#3b82f6', gaz: '#e2e8f0', 'płyn nadkrytyczny': '#c084fc' };

/* ---------- Krok 3 (3D): diagram fazowy jako tablica w przestrzeni ---------- */
const DW = 8; // szerokość tablicy (oś temperatury)
const DH = 5; // wysokość tablicy (oś log p)
const STATE_RGB: Record<string, [number, number, number]> = {
  'ciało stałe': [125, 211, 252],
  ciecz: [59, 130, 246],
  gaz: [148, 163, 184],
  'płyn nadkrytyczny': [192, 132, 252],
};

/** Gromadka cząsteczek pokazująca zachowanie w danym stanie. */
function StateCluster({ state }: { state: string }) {
  const n = 27;
  const homes = useMemo(() => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) out.push(new THREE.Vector3((i - 1) * 0.2, (j - 1) * 0.2, (k - 1) * 0.2));
    return out;
  }, []);
  const st = useRef({ p: homes.map((h) => h.clone()), v: homes.map(() => new THREE.Vector3()) });
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.033);
    const { p, v } = st.current;
    const cfg =
      state === 'ciało stałe'
        ? { spring: 120, half: 0.5, speed: 0.25, cohesion: 0 }
        : state === 'ciecz'
          ? { spring: 0, half: 0.5, speed: 0.35, cohesion: 3 }
          : state === 'gaz'
            ? { spring: 0, half: 0.75, speed: 1.4, cohesion: 0 }
            : { spring: 0, half: 0.55, speed: 0.8, cohesion: 0.6 };
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (cfg.spring) {
        tmp.copy(homes[i]).sub(p[i]);
        v[i].addScaledVector(tmp, cfg.spring * dt);
        v[i].multiplyScalar(0.9);
      }
      if (cfg.cohesion) v[i].addScaledVector(p[i], -cfg.cohesion * dt);
      v[i].x += gauss() * 0.08;
      v[i].y += gauss() * 0.08;
      v[i].z += gauss() * 0.08;
      sum += v[i].lengthSq();
    }
    const k = cfg.spring ? 1 : Math.pow(cfg.speed / (Math.sqrt(sum / n) || 1), 0.2);
    for (let i = 0; i < n; i++) {
      v[i].multiplyScalar(k);
      p[i].addScaledVector(v[i], dt);
      (['x', 'y', 'z'] as const).forEach((ax) => {
        if (Math.abs(p[i][ax]) > cfg.half) {
          p[i][ax] = Math.sign(p[i][ax]) * cfg.half;
          v[i][ax] *= -1;
        }
      });
      dummy.position.copy(p[i]);
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(i, dummy.matrix);
    }
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n]}>
      <sphereGeometry args={[0.07, 14, 14]} />
      <meshStandardMaterial color={STATE_COLOR[state]} emissive={STATE_COLOR[state]} emissiveIntensity={0.35} roughness={0.3} />
    </instancedMesh>
  );
}

function PhaseScene3D({ params }: SceneProps) {
  const key = String(params.s);
  const s = SUBS[key] ?? SUBS.h2o;
  const t = Number(params.t);
  const lp = Number(params.lp);
  const pr = 10 ** lp;
  const c = curves(s);
  const L = (x: number) => Math.log10(Math.max(1e-30, x));
  const X = (tt: number) => ((tt - s.Tmin) / (s.Tmax - s.Tmin) - 0.5) * DW;
  const Y = (l: number) => (l / 8 - 0.5) * DH;
  const state = stateAt(s, t, pr);

  // obszary stanów jako tekstura liczona punkt po punkcie
  const tex = useMemo(() => {
    const w = 200;
    const h = 125;
    const data = new Uint8Array(w * h * 4);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const tt = s.Tmin + ((i + 0.5) / w) * (s.Tmax - s.Tmin);
        const l = ((j + 0.5) / h) * 8;
        const rgb = STATE_RGB[stateAt(s, tt, 10 ** l)];
        const o = (j * w + i) * 4;
        data[o] = rgb[0];
        data[o + 1] = rgb[1];
        data[o + 2] = rgb[2];
        data[o + 3] = 255;
      }
    const tx = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tx.magFilter = THREE.LinearFilter;
    tx.needsUpdate = true;
    return tx;
  }, [s]);

  const subStart = Math.max(s.Tmin, 1 / (1 / K(s.Tt) + Math.log(s.pt / P_MIN) / (s.Ls / 8.314)) - 273.15);
  const line = (f: (x: number) => number, a: number, b: number) =>
    Array.from({ length: 80 }, (_, i) => {
      const x = a + ((b - a) * i) / 79;
      return [X(x), Y(f(x)), 0.02] as [number, number, number];
    });
  const melt = Array.from({ length: 40 }, (_, i) => {
    const l = L(s.pt) + ((8 - L(s.pt)) * i) / 39;
    return [X(c.meltT(10 ** l)), Y(l), 0.02] as [number, number, number];
  });
  const fmtP = (x: number) => (x >= 1e6 ? `${num(x / 1e6, 2)} MPa` : x >= 1e3 ? `${num(x / 1e3, 1)} kPa` : `${num(x, 0)} Pa`);
  const tSubAtm = 1 / (1 / K(s.Tt) - Math.log(ATM / s.pt) / (s.Ls / 8.314)) - 273.15;
  const mx = X(t);
  const my = Y(lp);
  const lbl = (txt: string, pos: [number, number, number], col: string, size = 13) => (
    <Html key={txt} position={pos} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{ color: col, fontFamily: 'Geist', fontSize: size, fontWeight: 700, whiteSpace: 'nowrap', textShadow: '0 1px 4px #000' }}>{txt}</div>
    </Html>
  );
  const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸'];
  return (
    <group rotation={[-0.35, 0, 0]}>
      <Lights />
      <mesh position={[0, 0, -0.06]}>
        <boxGeometry args={[DW + 0.3, DH + 0.3, 0.1]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>
      <mesh>
        <planeGeometry args={[DW, DH]} />
        <meshBasicMaterial map={tex} transparent opacity={0.28} />
      </mesh>
      {[0, 2, 4, 6, 8].map((e) => (
        <group key={e}>
          <Line points={[[-DW / 2, Y(e), 0.01], [DW / 2, Y(e), 0.01]]} color="#ffffff" transparent opacity={0.08} lineWidth={1} />
          {lbl(`10${SUP[e]} Pa`, [-DW / 2 - 0.55, Y(e), 0], 'rgba(255,255,255,0.6)', 11)}
        </group>
      ))}
      {[-100, 0, 100, 200, 300, 400].map((x) => lbl(`${x} °C`, [X(x), -DH / 2 - 0.3, 0], 'rgba(255,255,255,0.6)', 11))}
      <Line points={[[-DW / 2, Y(L(ATM)), 0.02], [DW / 2, Y(L(ATM)), 0.02]]} color="#ffd166" dashed dashSize={0.15} gapSize={0.1} lineWidth={1.5} />
      {lbl('1013 hPa', [DW / 2 + 0.5, Y(L(ATM)), 0], '#ffd166', 11)}
      <Line points={line((x) => L(c.sub(x)), subStart, s.Tt)} color="#7dd3fc" lineWidth={3} />
      <Line points={line((x) => L(c.vap(x)), s.Tt, s.Tc)} color="#3b82f6" lineWidth={3} />
      <Line points={melt} color="#a78bfa" lineWidth={3} />
      <mesh position={[X(s.Tt), Y(L(s.pt)), 0.05]}>
        <sphereGeometry args={[0.09, 20, 20]} />
        <meshStandardMaterial color={C.good} emissive={C.good} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[X(s.Tc), Y(L(s.pc)), 0.05]}>
        <sphereGeometry args={[0.09, 20, 20]} />
        <meshStandardMaterial color="#c084fc" emissive="#c084fc" emissiveIntensity={0.5} />
      </mesh>
      {lbl('CIAŁO STAŁE', [X(s.Tmin) + 0.75, Y(7.4), 0.05], '#7dd3fc', 12)}
      {lbl('CIECZ', [X(s.Tt + (s.Tc - s.Tt) * 0.45), Y(7.3), 0.05], '#93c5fd')}
      {lbl('GAZ', [X(s.Tt + (s.Tmax - s.Tt) * 0.55), Y(1.2), 0.05], '#e2e8f0')}
      {lbl('nadkrytyczny', [X(s.Tc + (s.Tmax - s.Tc) * 0.5), Y(7.7), 0.05], '#c084fc', 12)}
      {/* wybrany punkt: pinezka i gromadka cząsteczek nad tablicą */}
      <mesh position={[mx, my, 0.05]}>
        <sphereGeometry args={[0.11, 20, 20]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
      </mesh>
      <Line points={[[mx, my, 0.05], [mx, my, 0.75]]} color={STATE_COLOR[state]} lineWidth={1.5} />
      <group position={[mx, my, 1.25]}>
        <StateCluster state={state} />
      </group>
      <InfoBox
        lines={[
          { text: `${s.name}: ${num(t, 1)} °C, ${fmtP(pr)}`, color: '#fff' },
          { text: `stan: ${state}`, color: STATE_COLOR[state] },
          { text: `punkt potrójny: ${num(s.Tt, 2)} °C, ${fmtP(s.pt)}`, color: C.good },
          { text: `punkt krytyczny: ${num(s.Tc, 0)} °C, ${fmtP(s.pc)}`, color: '#c084fc' },
          {
            text:
              s.pt > ATM
                ? `pod ciśnieniem 1013 hPa sublimuje w ${num(tSubAtm, 1)} °C – nie ma cieczy („suchy lód”)`
                : `pod ciśnieniem 1013 hPa wrze w ok. ${num(c.boil(ATM), 0)} °C`,
            color: C.third,
          },
        ]}
      />
    </group>
  );
}

/* ---------- Krok 2 (3D): krzywa ogrzewania na tablicy ---------- */
function HeatingScene3D({ params }: SceneProps) {
  const m = Number(params.m);
  const Qmax = stages(m)[4];
  const st = stages(m);
  const Q = (Number(params.q) / 100) * Qmax;
  const T = tempAt(Q, m);
  const W = 7;
  const H = 4.4;
  const X = (q: number) => (q / Qmax - 0.5) * W;
  const Y = (t: number) => ((t + 40) / 180 - 0.5) * H;
  let ice = 0, water = 0, steam = 0, stage = '';
  if (Q <= st[0]) { ice = 1; stage = 'ogrzewanie lodu: Q = m·c_lodu·ΔT'; }
  else if (Q <= st[1]) { const f = (Q - st[0]) / (st[1] - st[0]); ice = 1 - f; water = f; stage = 'topnienie: Q = m·L_t, temperatura stoi'; }
  else if (Q <= st[2]) { water = 1; stage = 'ogrzewanie wody: Q = m·c_wody·ΔT'; }
  else if (Q <= st[3]) { const f = (Q - st[2]) / (st[3] - st[2]); water = 1 - f; steam = f; stage = 'wrzenie: Q = m·L_w, temperatura stoi'; }
  else { steam = 1; stage = 'ogrzewanie pary: Q = m·c_pary·ΔT'; }
  const pts = (a: number, b: number) =>
    Array.from({ length: 120 }, (_, i) => {
      const q = a + ((b - a) * i) / 119;
      return [X(q), Y(tempAt(q, m)), 0.03] as [number, number, number];
    });
  const lbl = (txt: string, pos: [number, number, number], col: string, size = 11) => (
    <Html key={txt + pos.join()} position={pos} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{ color: col, fontFamily: 'Geist', fontSize: size, fontWeight: 700, whiteSpace: 'nowrap', textShadow: '0 1px 4px #000' }}>{txt}</div>
    </Html>
  );
  const bands: [number, number, string][] = [
    [0, st[0], '#7dd3fc'],
    [st[0], st[1], '#a78bfa'],
    [st[1], st[2], '#3b82f6'],
    [st[2], st[3], '#f472b6'],
    [st[3], st[4], '#e2e8f0'],
  ];
  const clusters: [string, number, string][] = [
    ['ciało stałe', ice, 'lód'],
    ['ciecz', water, 'woda'],
    ['gaz', steam, 'para'],
  ];
  return (
    <group>
      <Lights />
      <group position={[-0.7, 0, 0]} rotation={[-0.3, 0.2, 0]}>
        <mesh position={[0, 0, -0.06]}>
          <boxGeometry args={[W + 0.3, H + 0.3, 0.1]} />
          <meshStandardMaterial color="#0f172a" roughness={0.8} />
        </mesh>
        {bands.map(([a, b, col], i) => (
          <mesh key={i} position={[(X(a) + X(b)) / 2, 0, 0.005]}>
            <planeGeometry args={[Math.max(0.001, X(b) - X(a)), H]} />
            <meshBasicMaterial color={col} transparent opacity={0.07} />
          </mesh>
        ))}
        {[-40, 0, 50, 100, 140].map((t) => (
          <group key={t}>
            <Line points={[[-W / 2, Y(t), 0.01], [W / 2, Y(t), 0.01]]} color={t === 0 || t === 100 ? '#ffd166' : '#ffffff'} transparent opacity={t === 0 || t === 100 ? 0.35 : 0.08} lineWidth={1} />
            {lbl(`${t} °C`, [-W / 2 - 0.45, Y(t), 0], 'rgba(255,255,255,0.6)')}
          </group>
        ))}
        {lbl('topnienie', [(X(st[0]) + X(st[1])) / 2, Y(0) + 0.25, 0.05], '#a78bfa')}
        {lbl('wrzenie', [(X(st[2]) + X(st[3])) / 2, Y(100) + 0.25, 0.05], '#f472b6')}
        {lbl('dostarczone ciepło Q →', [0, -H / 2 - 0.3, 0], 'rgba(255,255,255,0.6)')}
        <Line points={pts(0, Qmax)} color="#ffffff" transparent opacity={0.3} lineWidth={2} />
        {Q > 0 && <Line points={pts(0, Q)} color={C.main} lineWidth={4} />}
        <mesh position={[X(Q), Y(T), 0.08]}>
          <sphereGeometry args={[0.11, 20, 20]} />
          <meshStandardMaterial color={C.third} emissive={C.third} emissiveIntensity={0.6} />
        </mesh>
      </group>
      {/* gromadki cząsteczek: ich wielkość odpowiada udziałowi każdego stanu */}
      {clusters.map(([state, f, name], i) => (
        <group key={state} position={[4.2, 1.6 - i * 1.6, 0.5]}>
          <group scale={0.25 + 0.75 * f} visible={f > 0.001}>
            <StateCluster state={state} />
          </group>
          {lbl(`${name}: ${num(f * m * 1000, 0)} g`, [0, -0.85, 0], STATE_COLOR[state], 11)}
        </group>
      ))}
      <InfoBox
        lines={[
          { text: `${num(m, 1)} kg lodu o temp. ${T0} °C, dostarczono ${num(Q, 0)} kJ`, color: '#fff' },
          { text: `temperatura: ${num(T, 1)} °C`, color: C.third },
          { text: stage, color: C.main },
          { text: `ciepło topnienia ${L_F} kJ/kg, ciepło parowania ${L_V} kJ/kg` },
        ]}
      />
    </group>
  );
}

export const states: Topic = {
  id: 'stany-skupienia',
  title: 'Stany skupienia i przemiany fazowe',
  subject: 'chemia',
  summary: 'Cząsteczki lodu, wody i pary w 3D, krzywa ogrzewania z ciepłem topnienia i parowania oraz diagram fazowy wody i CO₂.',
  accent: '#0ea5e9',
  glyph: '❄',
  steps: [
    {
      title: 'Ciało stałe, ciecz i gaz',
      kind: '3d',
      scene: ParticlesScene,
      camera: [0, 2.5, 8.5],
      controls: [{ type: 'slider', key: 'T', label: 'Temperatura', min: -60, max: 200, step: 1, default: -20, unit: '°C' }],
      body: (
        <>
          <p>
            Wszystkie trzy stany to te same cząsteczki H₂O. Różnią się tylko tym, <strong>jak szybko się poruszają</strong>{' '}
            i jak silnie są ze sobą związane. Temperatura to miara średniej energii kinetycznej cząsteczek.
          </p>
          <p>
            W <strong>lodzie</strong> cząsteczki tkwią w sieci i tylko drgają. W <strong>wodzie</strong> wciąż się
            przyciągają, ale mogą się przesuwać – dlatego ciecz płynie i przyjmuje kształt naczynia. W{' '}
            <strong>parze</strong> odległości są ogromne, a cząsteczki wypełniają całe naczynie. Przesuń suwak przez 0 °C
            i 100 °C.
          </p>
        </>
      ),
    },
    {
      title: 'Krzywa ogrzewania',
      kind: '3d',
      scene: HeatingScene3D,
      camera: [0.3, -0.5, 12],
      controls: [
        { type: 'slider', key: 'q', label: 'Dostarczone ciepło', min: 0, max: 100, step: 0.5, default: 30, unit: '%' },
        { type: 'slider', key: 'm', label: 'Masa lodu', min: 0.1, max: 2, step: 0.1, default: 1, unit: 'kg' },
      ],
      body: (
        <>
          <div className="formula">Q = m·c·ΔT      Q = m·L</div>
          <p>
            Podgrzewamy lód o temperaturze −30 °C. Dopóki substancja jest w jednym stanie, temperatura rośnie. W czasie{' '}
            <strong>topnienia</strong> i <strong>wrzenia</strong> wykres jest płaski: ciepło idzie na rozrywanie
            oddziaływań między cząsteczkami, a nie na przyspieszanie ich ruchu.
          </p>
          <p>
            Zauważ, że odparowanie wody wymaga prawie 7 razy więcej energii niż stopienie lodu – przy parowaniu
            cząsteczki muszą zostać całkowicie od siebie oddzielone.
          </p>
        </>
      ),
    },
    {
      title: 'Diagram fazowy',
      kind: '3d',
      scene: PhaseScene3D,
      camera: [0, -1.5, 11],
      controls: [
        {
          type: 'select',
          key: 's',
          label: 'Substancja',
          default: 'h2o',
          options: Object.entries(SUBS).map(([value, s]) => ({ value, label: s.name })),
        },
        { type: 'slider', key: 't', label: 'Temperatura', min: -100, max: 400, step: 1, default: 20, unit: '°C' },
        { type: 'slider', key: 'lp', label: 'Ciśnienie – log₁₀(p / Pa)', min: 0, max: 8, step: 0.05, default: 5, decimals: 2 },
      ],
      body: (
        <>
          <p>
            Diagram fazowy pokazuje, w jakim stanie jest substancja przy danej temperaturze i ciśnieniu. Linie to warunki,
            w których dwa stany współistnieją. W <strong>punkcie potrójnym</strong> współistnieją wszystkie trzy, a za{' '}
            <strong>punktem krytycznym</strong> ciecz i gaz przestają się różnić.
          </p>
          <p>
            Woda jest wyjątkowa: linia topnienia lekko się przechyla w lewo, więc pod większym ciśnieniem lód topnieje w
            niższej temperaturze. Punkt potrójny CO₂ leży powyżej ciśnienia atmosferycznego, dlatego suchy lód nie
            topnieje, tylko <strong>sublimuje</strong>. Wysokie góry to niższe ciśnienie – woda wrze tam poniżej 100 °C.
          </p>
        </>
      ),
    },
  ],
};
