/*
 * Elektrownia wiatrowa – model turbiny: wieża (z wnętrzem w przekroju), gondola (z wnętrzem: wał, łożysko,
 * przekładnia planetarna z zazębionymi kołami, hamulec, generator, przekształtnik, transformator, chłodnica,
 * układ obrotu gondoli), piasta z układem ustawiania łopat i trzy łopaty z profilem lotniczym.
 *
 * Stan ruchu (kąt wirnika, ustawienie łopat, obrót gondoli, hamulec) trzyma obiekt TurbineState, który scena
 * zmienia w każdej klatce – model tylko go odczytuje, bez przerysowywania Reacta.
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DEG, HUB, T, bladeGeometry, serrationGeometry, towerR, type V3 } from './windGeo';

/* ================= stan ================= */

export interface TurbineState {
  /** Obrót gondoli wokół osi wieży (rad). */
  yaw: number;
  /** Ustawienie łopat (°). */
  pitch: number;
  /** Kąt wirnika (rad, maleje – obrót zgodny ze wskazówkami zegara od strony wiatru). */
  angle: number;
  /** Docisk hamulca 0…1. */
  brake: number;
  /** Bolec blokady wirnika 0…1. */
  lock: number;
  /** Światła ostrzegawcze włączone. */
  light: boolean;
}
export const newState = (yaw = 0): TurbineState => ({ yaw, pitch: 0, angle: Math.random() * 6, brake: 0, lock: 0, light: false });

/** Przełożenia przekładni: dwa stopnie planetarne i stopień walcowy (razem 1 : 90). */
export const GEAR = {
  s1: { Ns: 12, Np: 18, Nr: 48, m: 0.05, face: 0.36 },
  s2: { Ns: 12, Np: 15, Nr: 42, m: 0.04, face: 0.28 },
  par: { Ng: 36, Npin: 9, m: 0.04, face: 0.3 },
};
export const RATIO = (1 + GEAR.s1.Nr / GEAR.s1.Ns) * (1 + GEAR.s2.Nr / GEAR.s2.Ns) * (GEAR.par.Ng / GEAR.par.Npin);

/* ================= materiały ================= */

const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o });
export const MAT = {
  paint: std('#eef1f3', { roughness: 0.42 }),
  paintIn: std('#a9b1b8', { side: THREE.BackSide, roughness: 0.8 }),
  paintDs: std('#eef1f3', { roughness: 0.45, side: THREE.DoubleSide }),
  blade: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.02 }),
  bladeDs: new THREE.MeshStandardMaterial({ color: '#e9ecee', roughness: 0.5, side: THREE.DoubleSide }),
  steel: std('#9aa4ad', { metalness: 0.75, roughness: 0.32 }),
  steelDark: std('#59636e', { metalness: 0.55, roughness: 0.45 }),
  cast: std('#4d5a66', { metalness: 0.4, roughness: 0.6 }),
  gearbox: std('#3f6f7e', { metalness: 0.35, roughness: 0.5 }),
  gearboxCut: std('#3f6f7e', { metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide }),
  generator: std('#2f62a3', { metalness: 0.3, roughness: 0.45 }),
  generatorCut: std('#2f62a3', { metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide }),
  copper: std('#c8773a', { metalness: 0.7, roughness: 0.35 }),
  lamination: std('#3a3f46', { metalness: 0.5, roughness: 0.5 }),
  motor: std('#e08a2c', { roughness: 0.5 }),
  cabinet: std('#d3d8dc', { roughness: 0.6 }),
  cabinetLine: std('#8b949c'),
  transformer: std('#4a5159', { roughness: 0.6 }),
  floor: std('#6d747b', { metalness: 0.4, roughness: 0.7 }),
  rubber: std('#24282d', { roughness: 0.9 }),
  concrete: std('#b9b6ae', { roughness: 0.95 }),
  yellow: std('#f2c230', { roughness: 0.5 }),
  red: std('#d0392f', { roughness: 0.5 }),
  magnetN: std('#c94a3f', { metalness: 0.4, roughness: 0.4 }),
  magnetS: std('#3f72c9', { metalness: 0.4, roughness: 0.4 }),
  glass: std('#9fd0f0', { transparent: true, opacity: 0.35, roughness: 0.1 }),
  cable: std('#1d2126', { roughness: 0.8 }),
  grate: std('#7d858c', { metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide }),
};

/* ================= pomocnicze ================= */

function Box({ p, s, m, r }: { p: V3; s: V3; m: THREE.Material; r?: V3 }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}
/** Walec o osi x (od x0 do x1). */
function CylX({ x0, x1, r, y = 0, z = 0, m, seg = 40, r2 }: { x0: number; x1: number; r: number; y?: number; z?: number; m: THREE.Material; seg?: number; r2?: number }) {
  return (
    <mesh position={[(x0 + x1) / 2, y, z]} rotation={[0, 0, -Math.PI / 2]} material={m}>
      <cylinderGeometry args={[r2 ?? r, r, Math.abs(x1 - x0), seg]} />
    </mesh>
  );
}

/** Kształt półpierścienia (lub pełnego pierścienia) w płaszczyźnie xy – do wycinków obudów i generatorów. */
function annulusShape(r1: number, r2: number, half: boolean) {
  const s = new THREE.Shape();
  if (!half) {
    s.absarc(0, 0, r2, 0, Math.PI * 2, false);
    const h = new THREE.Path();
    h.absarc(0, 0, r1, 0, Math.PI * 2, true);
    s.holes.push(h);
    return s;
  }
  // połowa x > 0 (w układzie przekładni to strona dalsza od widza)
  s.absarc(0, 0, r2, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(0, r1);
  s.absarc(0, 0, r1, Math.PI / 2, -Math.PI / 2, true);
  s.lineTo(0, -r2);
  return s;
}
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<G extends THREE.BufferGeometry>(key: string, make: () => G): G {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g as G;
}
/** Rura (pół)pierścieniowa o osi z, długości d (środek w z = 0). */
function tubeGeo(r1: number, r2: number, d: number, half: boolean, seg = 48) {
  return cached(`tube|${r1}|${r2}|${d}|${half}|${seg}`, () => {
    const g = new THREE.ExtrudeGeometry(annulusShape(r1, r2, half), { depth: d, bevelEnabled: false, curveSegments: seg });
    g.translate(0, 0, -d / 2);
    return g;
  });
}

/* ================= koła zębate ================= */

/** Zarys koła zębatego (zewnętrznego) o N zębach i module m, z otworem na wał. */
function gearShape(N: number, m: number, bore: number) {
  const r = (N * m) / 2;
  const ra = r + m;
  const rf = r - 1.25 * m;
  const p = (2 * Math.PI) / N;
  const s = new THREE.Shape();
  for (let k = 0; k < N; k++) {
    const a = k * p;
    const pts: [number, number][] = [
      [rf, a - 0.3 * p],
      [ra, a - 0.15 * p],
      [ra, a + 0.15 * p],
      [rf, a + 0.3 * p],
    ];
    pts.forEach(([rr, aa], i) => {
      const x = rr * Math.cos(aa);
      const y = rr * Math.sin(aa);
      if (k === 0 && i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    });
  }
  s.closePath();
  if (bore > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, bore, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  return s;
}
/** Zarys wieńca o zębach wewnętrznych; `half` – tylko połowa x > 0 (wycinek). */
function ringShape(N: number, m: number, ro: number, half: boolean, phase = 0) {
  const r = (N * m) / 2;
  const tip = r - m;
  const root = r + 1.25 * m;
  const p = (2 * Math.PI) / N;
  const teeth: [number, number][] = [];
  for (let k = 0; k < N; k++) {
    const a = k * p + phase;
    for (const [rr, aa] of [
      [root, a - 0.3 * p],
      [tip, a - 0.15 * p],
      [tip, a + 0.15 * p],
      [root, a + 0.3 * p],
    ] as [number, number][])
      teeth.push([rr * Math.cos(aa), rr * Math.sin(aa)]);
  }
  const s = new THREE.Shape();
  if (!half) {
    s.absarc(0, 0, ro, 0, Math.PI * 2, false);
    const h = new THREE.Path();
    teeth.forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y)));
    h.closePath();
    s.holes.push(h);
    return s;
  }
  // połowa: łuk zewnętrzny od −90° do 90°, potem zęby wstecz (tylko x ≥ 0)
  s.absarc(0, 0, ro, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(0, root);
  const inner = teeth.filter(([x]) => x >= -1e-6);
  inner.sort((a, b) => Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]));
  inner.forEach(([x, y]) => s.lineTo(x, y));
  s.lineTo(0, -root);
  s.lineTo(0, -ro);
  return s;
}
function extrude(shape: THREE.Shape, depth: number, seg = 10) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: seg });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Faza zębów: tak ustawia kąt startowy koła B, żeby jego wręby trafiały w zęby koła A (styk w kierunku psi od A). */
const phaseOf = (ang: number, N: number) => {
  const p = (2 * Math.PI) / N;
  return (((ang / p) % 1) + 1) % 1;
};
function meshExternal(thA: number, NA: number, psi: number, NB: number) {
  const fA = phaseOf(psi - thA, NA);
  return psi + Math.PI - (0.5 - fA) * ((2 * Math.PI) / NB);
}

interface PlanetSet {
  /** kąty początkowe planet */
  planet0: number[];
  ring0: number;
}
function planetPhases(Ns: number, Np: number, Nr: number): PlanetSet {
  const planet0: number[] = [];
  for (let i = 0; i < 3; i++) planet0.push(meshExternal(0, Ns, (i * 2 * Math.PI) / 3, Np));
  // wieniec: wrąb naprzeciw zęba planety 0 w kierunku 0
  const fP = phaseOf(0 - planet0[0], Np);
  const ring0 = 0 - (fP - 0.5) * ((2 * Math.PI) / Nr);
  return { planet0, ring0 };
}

/** Stopień planetarny: słoneczne, trzy satelity w jarzmie, nieruchomy wieniec. Kąty z jarzma (carrier). */
function PlanetStage({ st, z, carrier, sun, cut }: { st: typeof GEAR.s1; z: number; carrier: () => number; sun: () => number; cut: boolean }) {
  const { Ns, Np, Nr, m, face } = st;
  const rs = (Ns * m) / 2;
  const rp = (Np * m) / 2;
  const a = rs + rp;
  const ph = useMemo(() => planetPhases(Ns, Np, Nr), [Ns, Np, Nr]);
  const geo = useMemo(
    () => ({
      sun: cached(`sun${Ns}${m}`, () => extrude(gearShape(Ns, m, rs * 0.35), face)),
      planet: cached(`pl${Np}${m}`, () => extrude(gearShape(Np, m, rp * 0.3), face * 0.96)),
      ring: cached(`ring${Nr}${m}${cut}`, () => extrude(ringShape(Nr, m, (Nr * m) / 2 + 2.6 * m, cut, ph.ring0), face, 40)),
      plate: cached(`plate${a}`, () => {
        const s = new THREE.Shape();
        s.absarc(0, 0, a + rp * 0.25, 0, Math.PI * 2, false);
        for (let i = 0; i < 3; i++) {
          const h = new THREE.Path();
          const ang = (i * 2 * Math.PI) / 3 + Math.PI / 3;
          h.absarc(a * 0.75 * Math.cos(ang), a * 0.75 * Math.sin(ang), rp * 0.45, 0, Math.PI * 2, true);
          s.holes.push(h);
        }
        const c = new THREE.Path();
        c.absarc(0, 0, rs * 0.6, 0, Math.PI * 2, true);
        s.holes.push(c);
        return extrude(s, 0.06, 24);
      }),
    }),
    [Ns, Np, Nr, m, face, rs, rp, a, cut, ph],
  );
  const carrierRef = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.Mesh>(null);
  const planets = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const c = carrier();
    if (carrierRef.current) carrierRef.current.rotation.z = c;
    if (sunRef.current) sunRef.current.rotation.z = sun();
    // obrót satelity w jarzmie: −ωc·Nr/Np
    planets.current.forEach((p, i) => {
      if (p) p.rotation.z = ph.planet0[i] - c * (Nr / Np);
    });
  });
  return (
    <group position={[0, 0, z]}>
      <mesh geometry={geo.ring} material={MAT.steelDark} />
      <mesh ref={sunRef} geometry={geo.sun} material={MAT.steel} />
      <group ref={carrierRef}>
        {[0, 1, 2].map((i) => {
          const ang = (i * 2 * Math.PI) / 3;
          return <mesh key={i} ref={(r) => (planets.current[i] = r)} geometry={geo.planet} material={MAT.copper} position={[a * Math.cos(ang), a * Math.sin(ang), 0]} />;
        })}
        <mesh geometry={geo.plate} material={MAT.cast} position={[0, 0, face / 2 + 0.06]} />
        <mesh geometry={geo.plate} material={MAT.cast} position={[0, 0, -face / 2 - 0.06]} />
      </group>
    </group>
  );
}

/**
 * Przekładnia (w układzie przekładni: oś z wzdłuż wału, z rośnie w stronę wirnika). `cut` – obudowa i wieńce
 * przecięte, widać zazębione koła. Kąt wirnika = kąt jarzma pierwszego stopnia.
 */
function GearTrain({ angle, cut }: { angle: () => number; cut: boolean }) {
  const { s1, s2, par } = GEAR;
  const k1 = 1 + s1.Nr / s1.Ns;
  const k2 = 1 + s2.Nr / s2.Ns;
  const rG = (par.Ng * par.m) / 2;
  const rPin = (par.Npin * par.m) / 2;
  const dist = rG + rPin;
  const pin0 = useMemo(() => meshExternal(0, par.Ng, Math.PI / 2, par.Npin), [par.Ng, par.Npin]);
  const geo = useMemo(
    () => ({
      big: cached('bigG', () => extrude(gearShape(par.Ng, par.m, 0.12), par.face, 12)),
      pin: cached('pinG', () => extrude(gearShape(par.Npin, par.m, 0.05), par.face * 1.1, 12)),
    }),
    [par.Ng, par.Npin, par.m, par.face],
  );
  const bigRef = useRef<THREE.Mesh>(null);
  const pinRef = useRef<THREE.Group>(null);
  const shaftRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const c = angle();
    const g = c * k1 * k2;
    if (bigRef.current) bigRef.current.rotation.z = g;
    if (pinRef.current) pinRef.current.rotation.z = pin0 - g * (par.Ng / par.Npin);
    if (shaftRef.current) shaftRef.current.rotation.z = c * k1;
  });
  return (
    <group>
      <PlanetStage st={s1} z={0.25} carrier={angle} sun={() => angle() * k1} cut={cut} />
      <PlanetStage st={s2} z={-0.95} carrier={() => angle() * k1} sun={() => angle() * k1 * k2} cut={cut} />
      {/* wały pośrednie */}
      <mesh ref={shaftRef} position={[0, 0, -0.35]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steel}>
        <cylinderGeometry args={[0.1, 0.1, 0.9, 16]} />
      </mesh>
      <mesh position={[0, 0, -1.55]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steel}>
        <cylinderGeometry args={[0.085, 0.085, 0.9, 16]} />
      </mesh>
      <mesh ref={bigRef} geometry={geo.big} material={MAT.steel} position={[0, 0, -2.0]} />
      <group ref={pinRef} position={[0, dist, -2.0]}>
        <mesh geometry={geo.pin} material={MAT.copper} />
      </group>
      {/* wał szybkoobrotowy */}
      <mesh position={[0, dist, -2.55]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steel}>
        <cylinderGeometry args={[0.07, 0.07, 1.2, 14]} />
      </mesh>
    </group>
  );
}

/* ================= gondola ================= */

const SHELL = {
  gear: { xb: -9.2, xf: 4.7 },
  direct: { xb: -6.4, xf: 3.3 },
};
const HALF_W = 2.1;
const HALF_H = 2.15;
const SHELL_YC = 2.3;
/** Wysokość osi wału nad szczytem wieży (układ gondoli). */
export const shaftLine = (x: number) => T.shaftY + x * Math.tan(T.tilt);

/** Poszycie gondoli: zaokrąglony prostopadłościan zwężający się ku piaście; połowa przednia, tylna albo całość. */
function shellGeometry(drive: 'gear' | 'direct', part: 'front' | 'back' | 'full') {
  return cached(`shell|${drive}|${part}`, () => {
    const { xb, xf } = SHELL[drive];
    const NX = 44;
    const NT = part === 'full' ? 64 : 33;
    const t0 = part === 'back' ? Math.PI / 2 : -Math.PI / 2;
    const span = part === 'full' ? Math.PI * 2 : Math.PI;
    const n = 5;
    const pos: number[] = [];
    // przekroje: gęsto w zaokrągleniu tyłu, dalej co ok. 0,35 m
    const xs: number[] = [];
    for (let i = 0; i <= 10; i++) xs.push(xb + 0.9 * (1 - Math.cos((i / 10) * (Math.PI / 2))));
    for (let i = 1; i <= NX - 10; i++) xs.push(xb + 0.9 + ((xf - xb - 0.9) * i) / (NX - 10));
    for (let i = 0; i <= NX; i++) {
      const x = xs[i];
      // zaokrąglony tył
      const back = x < xb + 0.9 ? Math.sqrt(Math.max(0, 1 - ((xb + 0.9 - x) / 0.9) ** 2)) : 1;
      const f = Math.max(0, (x - (xf - 2.4)) / 2.4);
      const fe = f * f * (3 - 2 * f);
      const w = HALF_W * (1 - 0.3 * fe) * Math.max(0.04, back);
      const h = HALF_H * (1 - 0.3 * fe) * Math.max(0.04, Math.pow(back, 0.8));
      const yc = SHELL_YC + (shaftLine(xf) - SHELL_YC) * fe;
      for (let j = 0; j < NT; j++) {
        const th = t0 + (span * j) / (part === 'full' ? NT : NT - 1);
        const c = Math.cos(th);
        const s = Math.sin(th);
        const z = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
        const y = yc + h * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
        pos.push(x, y, z);
      }
    }
    const idx: number[] = [];
    const wrap = part === 'full';
    for (let i = 0; i < NX; i++)
      for (let j = 0; j < (wrap ? NT : NT - 1); j++) {
        const a = i * NT + j;
        const b = i * NT + ((j + 1) % NT);
        const c = a + NT;
        const d = b + NT;
        idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

/** Chłodnica na dachu: rama i lamele. */
function Radiator({ x0, x1 }: { x0: number; x1: number }) {
  const fins = useMemo(() => {
    const n = 22;
    return Array.from({ length: n }, (_, i) => x0 + 0.15 + ((x1 - x0 - 0.3) * i) / (n - 1));
  }, [x0, x1]);
  const top = SHELL_YC + HALF_H;
  return (
    <group>
      {fins.map((x, i) => (
        <Box key={i} p={[x, top + 0.75, 0]} s={[0.03, 1.1, 3.1]} m={MAT.cabinetLine} />
      ))}
      <Box p={[(x0 + x1) / 2, top + 1.33, 0]} s={[x1 - x0, 0.08, 3.3]} m={MAT.paint} />
      {[-1.6, 1.6].map((z) => (
        <Box key={z} p={[(x0 + x1) / 2, top + 0.7, z]} s={[x1 - x0, 1.3, 0.1]} m={MAT.paint} />
      ))}
    </group>
  );
}

/** Maszt z czujnikami wiatru i lampą ostrzegawczą na dachu. */
function SensorMast({ x, st, night }: { x: number; st: TurbineState; night: boolean }) {
  const top = SHELL_YC + HALF_H;
  const vane = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (vane.current) vane.current.rotation.y = Math.sin(clock.elapsedTime * 0.7) * 0.08;
    // lampa błyska: 1 s świeci, 0,5 s przerwy (jak światła przeszkodowe)
    const on = st.light && clock.elapsedTime % 1.5 < 1;
    if (lamp.current) lamp.current.emissiveIntensity = on ? (night ? 4 : 1.5) : 0.05;
    if (halo.current) halo.current.visible = on && night;
  });
  return (
    <group position={[x, top, 0]}>
      <mesh position={[0, 1.1, 0]} material={MAT.steel}>
        <cylinderGeometry args={[0.05, 0.06, 2.2, 10]} />
      </mesh>
      <Box p={[0, 2.2, 0]} s={[0.12, 0.05, 1.8]} m={MAT.steel} />
      {/* anemometr ultradźwiękowy: trzy ramiona z przetwornikami */}
      <group position={[0, 2.25, 0.85]}>
        <mesh position={[0, 0.25, 0]} material={MAT.steelDark}>
          <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
        </mesh>
        {[0, 1, 2].map((i) => {
          const a = (i * 2 * Math.PI) / 3;
          return (
            <group key={i} rotation={[0, a, 0]}>
              <Box p={[0.14, 0.5, 0]} s={[0.28, 0.025, 0.025]} m={MAT.steelDark} />
              <mesh position={[0.28, 0.42, 0]} material={MAT.cabinet}>
                <cylinderGeometry args={[0.035, 0.035, 0.12, 8]} />
              </mesh>
            </group>
          );
        })}
      </group>
      {/* wiatrowskaz */}
      <group ref={vane} position={[0, 2.25, -0.85]}>
        <mesh position={[0, 0.2, 0]} material={MAT.steelDark}>
          <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
        </mesh>
        <Box p={[-0.3, 0.4, 0]} s={[0.6, 0.02, 0.02]} m={MAT.steelDark} />
        <Box p={[-0.55, 0.4, 0]} s={[0.22, 0.2, 0.012]} m={MAT.steelDark} />
      </group>
      {/* lampa przeszkodowa */}
      <mesh position={[0, 2.45, 0]}>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshStandardMaterial ref={lamp} color="#ff2a1a" emissive="#ff2a1a" emissiveIntensity={0.05} toneMapped={false} />
      </mesh>
      <mesh ref={halo} position={[0, 2.45, 0]} visible={false}>
        <sphereGeometry args={[1.4, 14, 10]} />
        <meshBasicMaterial color="#ff3a20" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Wnętrze gondoli z przekładnią. */
function GearNacelleInside({ st, gearCut, genCut, genOnly }: { st: TurbineState; gearCut: boolean; genCut: boolean; genOnly?: boolean }) {
  const hs = (GEAR.par.Ng * GEAR.par.m) / 2 + (GEAR.par.Npin * GEAR.par.m) / 2;
  const angle = () => st.angle;
  const hsAngle = () => st.angle * RATIO;
  const disc = useRef<THREE.Group>(null);
  const caliper = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const a = hsAngle();
    if (disc.current) disc.current.rotation.x = a;
    if (caliper.current) caliper.current.emissiveIntensity = st.brake * 0.8;
  });
  const geo = useMemo(
    () => ({
      gb1: tubeGeo(1.35, 1.45, 1.5, gearCut),
      gb2: tubeGeo(0.95, 1.03, 1.0, gearCut),
      genHouse: tubeGeo(0.78, 0.86, 2.5, genCut),
      stator: tubeGeo(0.56, 0.75, 2.0, genCut),
    }),
    [gearCut, genCut],
  );
  return (
    <group>
      {/* rama tylna i podłoga */}
      {!genOnly && (
        <>
          {[-1.3, 1.3].map((z) => (
            <Box key={z} p={[-5.3, 0.45, z]} s={[7.8, 0.3, 0.25]} m={MAT.steelDark} />
          ))}
          <Box p={[-5.3, 0.62, 0]} s={[7.8, 0.04, 3.4]} m={MAT.grate} />
          {/* łoże główne (odlew) */}
          <Box p={[1.4, 0.95, 0]} s={[5.4, 1.3, 2.3]} m={MAT.cast} />
          <Box p={[3.6, 1.65, 0]} s={[1.3, 0.6, 1.9]} m={MAT.cast} />
          {/* układ obrotu gondoli: łożysko z wieńcem zębatym i silniki */}
          <mesh position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steel}>
            <torusGeometry args={[1.48, 0.13, 10, 64]} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => {
            const a = ((i + 0.5) * Math.PI) / 3;
            return (
              <group key={i} position={[1.12 * Math.cos(a), 0, 1.12 * Math.sin(a)]}>
                <mesh position={[0, 0.85, 0]} material={MAT.motor}>
                  <cylinderGeometry args={[0.2, 0.2, 0.7, 16]} />
                </mesh>
                <mesh position={[0, 0.25, 0]} material={MAT.steelDark}>
                  <cylinderGeometry args={[0.15, 0.15, 0.6, 14]} />
                </mesh>
              </group>
            );
          })}
          {/* szafy przekształtnika */}
          <Box p={[-6.2, 1.65, -1.45]} s={[3.6, 2.0, 0.6]} m={MAT.cabinet} />
          {[-7.6, -6.7, -5.8, -4.9].map((x) => (
            <Box key={x} p={[x, 1.65, -1.14]} s={[0.03, 1.8, 0.02]} m={MAT.cabinetLine} />
          ))}
          {/* transformator */}
          <group position={[-7.95, 0, 0.75]}>
            <Box p={[0, 1.6, 0]} s={[1.6, 1.9, 1.4]} m={MAT.transformer} />
            {[-0.6, -0.3, 0, 0.3, 0.6].map((x) => (
              <Box key={x} p={[x, 1.6, 0.74]} s={[0.06, 1.6, 0.1]} m={MAT.transformer} />
            ))}
            {[-0.45, 0, 0.45].map((x) => (
              <mesh key={x} position={[x, 2.75, 0]} material={MAT.cabinet}>
                <cylinderGeometry args={[0.07, 0.09, 0.4, 10]} />
              </mesh>
            ))}
          </group>
          {/* szafa sterownika */}
          <Box p={[-2.6, 1.55, 1.5]} s={[1.1, 1.8, 0.55]} m={MAT.cabinet} />
          <Box p={[-2.6, 1.55, 1.23]} s={[0.02, 1.6, 0.02]} m={MAT.cabinetLine} />
          {/* suwnica serwisowa */}
          <Box p={[-5.2, 4.05, 0]} s={[7.6, 0.18, 0.14]} m={MAT.yellow} />
          <Box p={[-4.0, 3.85, 0]} s={[0.5, 0.3, 0.4]} m={MAT.yellow} />
        </>
      )}
      {/* układ napędowy (pochylony razem z wałem) */}
      <group position={[0, T.shaftY, 0]} rotation={[0, 0, T.tilt]}>
        {!genOnly && (
          <>
            <CylX x0={0.8} x1={5.25} r={0.42} m={MAT.steel} />
            <CylX x0={5.0} x1={5.25} r={0.95} m={MAT.steel} />
            {/* obudowa łożyska głównego */}
            <CylX x0={3.0} x1={4.2} r={0.85} m={MAT.cast} />
            {/* przekładnia */}
            <group position={[0.2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <mesh geometry={geo.gb1} material={gearCut ? MAT.gearboxCut : MAT.gearbox} position={[0, 0, 0.25]} />
              <mesh geometry={geo.gb2} material={gearCut ? MAT.gearboxCut : MAT.gearbox} position={[0, 0, -0.95]} />
              {!gearCut && (
                <>
                  <mesh position={[0, 0, 1.0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.gearbox}>
                    <cylinderGeometry args={[1.4, 1.4, 0.05, 48]} />
                  </mesh>
                  <mesh position={[0, 0, -1.45]} rotation={[Math.PI / 2, 0, 0]} material={MAT.gearbox}>
                    <cylinderGeometry args={[1.03, 1.03, 0.05, 40]} />
                  </mesh>
                </>
              )}
              {/* ramiona reakcyjne */}
              <Box p={[0, -0.2, 0.25]} s={[3.6, 0.4, 0.5]} m={MAT.gearbox} />
              {gearCut && <GearTrain angle={angle} cut />}
            </group>
            {/* obudowa stopnia walcowego */}
            <group position={[-1.95, 0, 0]}>
              {gearCut ? (
                <>
                  <Box p={[0, 0.5, -0.98]} s={[1.0, 2.9, 0.06]} m={MAT.gearboxCut} />
                  <Box p={[0, 1.94, -0.5]} s={[1.0, 0.06, 1.0]} m={MAT.gearboxCut} />
                  <Box p={[0, -0.94, -0.5]} s={[1.0, 0.06, 1.0]} m={MAT.gearboxCut} />
                </>
              ) : (
                <Box p={[0, 0.5, 0]} s={[1.0, 2.9, 2.0]} m={MAT.gearbox} />
              )}
            </group>
            {/* hamulec: tarcza i zacisk */}
            <group ref={disc} position={[-2.75, hs, 0]}>
              <mesh rotation={[0, 0, -Math.PI / 2]} material={MAT.steel}>
                <cylinderGeometry args={[0.55, 0.55, 0.06, 40]} />
              </mesh>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Box key={i} p={[0, 0.38 * Math.cos(i), 0.38 * Math.sin(i)]} s={[0.07, 0.05, 0.05]} m={MAT.steelDark} />
              ))}
            </group>
            <mesh position={[-2.75, hs + 0.52, 0]}>
              <boxGeometry args={[0.3, 0.26, 0.36]} />
              <meshStandardMaterial ref={caliper} color="#c0392b" emissive="#ff3b1f" emissiveIntensity={0} roughness={0.5} />
            </mesh>
            {/* sprzęgło */}
            <CylX x0={-3.65} x1={-2.85} r={0.09} y={hs} m={MAT.steel} />
            {[-3.0, -3.5].map((x) => (
              <CylX key={x} x0={x - 0.04} x1={x + 0.04} r={0.28} y={hs} m={MAT.steelDark} />
            ))}
            {!gearCut && <CylX x0={-2.95} x1={-1.4} r={0.08} y={hs} m={MAT.steel} />}
          </>
        )}
        {/* generator */}
        <group position={[-4.9, hs, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh geometry={geo.genHouse} material={genCut ? MAT.generatorCut : MAT.generator} />
          {!genCut && (
            <>
              <mesh position={[0, 0, 1.25]} rotation={[Math.PI / 2, 0, 0]} material={MAT.generator}>
                <cylinderGeometry args={[0.86, 0.86, 0.04, 40]} />
              </mesh>
              <mesh position={[0, 0, -1.25]} rotation={[Math.PI / 2, 0, 0]} material={MAT.generator}>
                <cylinderGeometry args={[0.86, 0.86, 0.04, 40]} />
              </mesh>
              {/* żebra chłodzące */}
              {Array.from({ length: 9 }, (_, i) => (
                <mesh key={i} position={[0, 0, -1.0 + i * 0.25]} rotation={[Math.PI / 2, 0, 0]} material={MAT.generator}>
                  <torusGeometry args={[0.87, 0.025, 6, 40]} />
                </mesh>
              ))}
            </>
          )}
          {genCut && <GeneratorInside angle={hsAngle} stator={geo.stator} />}
          {/* łapy */}
          <Box p={[0, -0.85, 0]} s={[1.5, 0.5, 2.2]} m={MAT.steelDark} />
        </group>
        {/* wirnik generatora – grupa obracana wokół osi x (dla wycinka; przy pełnej obudowie niewidoczny) */}
      </group>
    </group>
  );
}

/** Wnętrze generatora: stojan z uzwojeniami miedzianymi, wirujący wirnik z biegunami. Układ: oś z. */
function GeneratorInside({ angle, stator }: { angle: () => number; stator: THREE.BufferGeometry }) {
  const slots = useMemo(() => Array.from({ length: 18 }, (_, i) => -Math.PI / 2 + (Math.PI * (i + 0.5)) / 18), []);
  const poles = useMemo(() => Array.from({ length: 6 }, (_, i) => (i * Math.PI) / 3), []);
  const inner = useRef<THREE.Group>(null);
  useFrame(() => {
    if (inner.current) inner.current.rotation.z = angle();
  });
  return (
    <group>
      <mesh geometry={stator} material={MAT.lamination} />
      {/* żłobki z miedzią */}
      {slots.map((a, i) => (
        <Box key={i} p={[0.575 * Math.cos(a), 0.575 * Math.sin(a), 0]} r={[0, 0, a]} s={[0.05, 0.07, 2.04]} m={MAT.copper} />
      ))}
      {/* połówki czół uzwojeń */}
      {[-1.06, 1.06].map((z) => (
        <mesh key={z} position={[0, 0, z]} rotation={[0, 0, -Math.PI / 2]} material={MAT.copper}>
          <torusGeometry args={[0.64, 0.07, 8, 24, Math.PI]} />
        </mesh>
      ))}
      <group ref={inner}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={MAT.lamination}>
          <cylinderGeometry args={[0.5, 0.5, 1.9, 36]} />
        </mesh>
        {poles.map((a, i) => (
          <Box key={i} p={[0.5 * Math.cos(a), 0.5 * Math.sin(a), 0]} r={[0, 0, a]} s={[0.05, 0.36, 1.8]} m={i % 2 ? MAT.magnetS : MAT.magnetN} />
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={MAT.steel}>
          <cylinderGeometry args={[0.1, 0.1, 2.9, 14]} />
        </mesh>
      </group>
    </group>
  );
}

/** Wnętrze gondoli turbiny bez przekładni (generator pierścieniowy przy piaście). */
function DirectNacelleInside() {
  return (
    <group>
      {[-1.3, 1.3].map((z) => (
        <Box key={z} p={[-3.4, 0.45, z]} s={[5.6, 0.3, 0.25]} m={MAT.steelDark} />
      ))}
      <Box p={[-3.4, 0.62, 0]} s={[5.6, 0.04, 3.4]} m={MAT.grate} />
      <Box p={[1.2, 1.2, 0]} s={[3.4, 1.8, 2.3]} m={MAT.cast} />
      <mesh position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steel}>
        <torusGeometry args={[1.48, 0.13, 10, 64]} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => {
        const a = ((i + 0.5) * Math.PI) / 3;
        return (
          <mesh key={i} position={[1.12 * Math.cos(a), 0.85, 1.12 * Math.sin(a)]} material={MAT.motor}>
            <cylinderGeometry args={[0.2, 0.2, 0.7, 16]} />
          </mesh>
        );
      })}
      <Box p={[-3.8, 1.65, -1.45]} s={[3.6, 2.0, 0.6]} m={MAT.cabinet} />
      <group position={[-5.2, 0, 0.75]}>
        <Box p={[0, 1.6, 0]} s={[1.6, 1.9, 1.4]} m={MAT.transformer} />
      </group>
      <Box p={[-1.6, 1.55, 1.5]} s={[1.1, 1.8, 0.55]} m={MAT.cabinet} />
      <group position={[0, T.shaftY, 0]} rotation={[0, 0, T.tilt]}>
        {/* nieruchomy czop, na którym obraca się piasta z wirnikiem generatora */}
        <CylX x0={1.5} x1={5.4} r={0.7} r2={0.9} m={MAT.cast} />
      </group>
    </group>
  );
}

/** Generator pierścieniowy (bez przekładni): stojan z cewkami i wirnik z magnesami stałymi, obracany z piastą. */
function RingGenerator({ st, cut }: { st: TurbineState; cut: boolean }) {
  const rotor = useRef<THREE.Group>(null);
  useFrame(() => {
    if (rotor.current) rotor.current.rotation.z = st.angle;
  });
  const geo = useMemo(
    () => ({
      house: tubeGeo(3.22, 3.36, 2.1, cut, 72),
      stator: tubeGeo(2.35, 2.92, 1.6, cut, 72),
      face: cached(`rgface${cut}`, () => extrude(annulusShape(0.9, 3.36, cut), 0.08, 72)),
    }),
    [cut],
  );
  const magnets = useMemo(() => Array.from({ length: 72 }, (_, i) => (i * 2 * Math.PI) / 72), []);
  const coils = useMemo(() => Array.from({ length: 36 }, (_, i) => -Math.PI / 2 + (Math.PI * (i + 0.5)) / 36), []);
  return (
    <group position={[4.35, shaftLine(4.35), 0]} rotation={[0, 0, T.tilt]}>
      <group rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={geo.house} material={cut ? MAT.paintDs : MAT.paint} />
        <mesh geometry={geo.face} material={cut ? MAT.paintDs : MAT.paint} position={[0, 0, -1.05]} />
        <mesh geometry={geo.stator} material={MAT.lamination} />
        {cut &&
          coils.map((a, i) => (
            <Box key={i} p={[2.9 * Math.cos(a), 2.9 * Math.sin(a), 0]} r={[0, 0, a]} s={[0.1, 0.16, 1.72]} m={MAT.copper} />
          ))}
        <group ref={rotor}>
          {magnets.map((a, i) =>
            cut || i % 6 === 0 ? <Box key={i} p={[3.08 * Math.cos(a), 3.08 * Math.sin(a), 0]} r={[0, 0, a]} s={[0.1, 0.22, 1.5]} m={i % 2 ? MAT.magnetS : MAT.magnetN} /> : null,
          )}
          <mesh geometry={geo.face} material={MAT.steelDark} position={[0, 0, 0.98]} />
        </group>
      </group>
    </group>
  );
}

/* ================= piasta i łopaty ================= */

const SPINNER_BACK = -2.2;
function spinnerGeometry(seg: number) {
  return cached(`spinner${seg}`, () => {
    const pts: THREE.Vector2[] = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const r = 2.75 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.3)));
      pts.push(new THREE.Vector2(Math.max(0.001, r), SPINNER_BACK + t * 5.7));
    }
    const g = new THREE.LatheGeometry(pts, seg);
    g.rotateZ(-Math.PI / 2);
    return g;
  });
}

/** Układ ustawiania łopat w piaście: łożysko łopaty i silnik z przekładnią. W układzie łopaty (y wzdłuż łopaty). */
function PitchDrive() {
  return (
    <group position={[0, T.rootR + 0.15, 0]}>
      <mesh material={MAT.steel}>
        <torusGeometry args={[1.62, 0.14, 10, 48]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={MAT.steelDark}>
        <cylinderGeometry args={[1.5, 1.5, 0.12, 40, 1, true]} />
      </mesh>
      <group position={[1.15, -0.75, 0.6]}>
        <mesh material={MAT.motor}>
          <cylinderGeometry args={[0.2, 0.2, 0.8, 16]} />
        </mesh>
        <mesh position={[0, 0.55, 0]} material={MAT.steelDark}>
          <cylinderGeometry args={[0.13, 0.13, 0.4, 12]} />
        </mesh>
      </group>
      {/* szafka z akumulatorami awaryjnymi */}
      <Box p={[-1.0, -0.8, -0.7]} s={[0.5, 0.6, 0.35]} m={MAT.cabinet} />
    </group>
  );
}

export interface RotorOpts {
  lod: 'high' | 'low';
  hubOpen?: boolean;
  /** Liczba widocznych łopat (montaż). */
  blades?: number;
  /** Łopaty zaznaczone (montaż – lecąca łopata nie jest przy piaście). */
  bladeHidden?: (i: number) => boolean;
}

/** Wirnik: kołpak, piasta, łopaty z ustawieniem kąta. W układzie piasty (oś x, środek piasty w 0). */
export function Rotor({ st, lod, hubOpen = false, blades = 3, bladeHidden }: RotorOpts & { st: TurbineState }) {
  const bladeGeo = useMemo(() => cached(`blade${lod}`, () => bladeGeometry(lod)), [lod]);
  const serr = useMemo(() => cached('serr', () => serrationGeometry()), []);
  const spin = useRef<THREE.Group>(null);
  const pitchRefs = useRef<(THREE.Group | null)[]>([]);
  const spinnerMat = useMemo(() => (hubOpen ? std('#eef1f3', { transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.3 }) : MAT.paint), [hubOpen]);
  useFrame(() => {
    if (spin.current) spin.current.rotation.x = st.angle;
    for (const g of pitchRefs.current) if (g) g.rotation.y = -st.pitch * DEG;
  });
  return (
    <group ref={spin}>
      <mesh geometry={spinnerGeometry(lod === 'high' ? 48 : 16)} material={spinnerMat} renderOrder={hubOpen ? 3 : 0} />
      {hubOpen && (
        <mesh material={MAT.cast}>
          <sphereGeometry args={[1.85, 28, 20]} />
        </mesh>
      )}
      {Array.from({ length: 3 }, (_, i) => (
        <group key={i} rotation={[(i * 2 * Math.PI) / 3, 0, 0]} visible={i < blades && !bladeHidden?.(i)}>
          {hubOpen && <PitchDrive />}
          <group rotation={[0, 0, -T.cone]}>
            <group ref={(r) => (pitchRefs.current[i] = r)}>
              <mesh geometry={bladeGeo} material={MAT.blade} />
              {lod === 'high' && <mesh geometry={serr} material={MAT.bladeDs} />}
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}

/** Pojedyncza łopata (do sceny montażu i transportu). */
export function BladeMesh({ lod = 'high' }: { lod?: 'high' | 'low' }) {
  const g = useMemo(() => cached(`blade${lod}`, () => bladeGeometry(lod)), [lod]);
  return <mesh geometry={g} material={MAT.blade} />;
}

/* ================= wieża ================= */

/** Segment wieży między kołnierzami i0 i i0+1; `half` – tylko tylna połowa (z < 0). */
export function TowerSection({ i, half = false, lod = 'high' }: { i: number; half?: boolean; lod?: 'high' | 'low' }) {
  const y0 = T.flanges[i];
  const y1 = T.flanges[i + 1];
  const seg = lod === 'high' ? 64 : 16;
  const g = useMemo(
    () => cached(`tw${i}${half}${seg}`, () => new THREE.CylinderGeometry(towerR(y1), towerR(y0), y1 - y0, seg, 1, true, half ? Math.PI / 2 : 0, half ? Math.PI : Math.PI * 2)),
    [i, half, seg, y0, y1],
  );
  return (
    <group position={[0, (y0 + y1) / 2, 0]}>
      <mesh geometry={g} material={MAT.paint} />
      {half && <mesh geometry={g} material={MAT.paintIn} />}
    </group>
  );
}

/** Drzwi wieży ze schodkami (od strony +x, lekko w stronę z < 0 – widoczne także w przekroju). */
const DOOR_A = (100 * Math.PI) / 180;
function TowerDoor() {
  const r = towerR(2.3);
  return (
    <group rotation={[0, DOOR_A, 0]}>
      <group position={[0, 0, r]}>
        <Box p={[0, 2.35, 0.05]} s={[1.15, 2.35, 0.14]} m={MAT.steelDark} />
        <Box p={[0, 1.15, 0.9]} s={[1.6, 0.08, 1.6]} m={MAT.grate} />
        {[0, 1, 2, 3].map((k) => (
          <Box key={k} p={[0, 0.2 + k * 0.24, 1.8 + (3 - k) * 0.28]} s={[1.2, 0.05, 0.3]} m={MAT.grate} />
        ))}
        {[-0.8, 0.8].map((x) => (
          <Box key={x} p={[x, 1.6, 1.3]} s={[0.04, 0.9, 2.4]} m={MAT.steel} />
        ))}
      </group>
    </group>
  );
}

/** Wnętrze wieży: podesty, drabina, winda, kable i rozdzielnia na dole. */
export function TowerInterior({ lift }: { lift: () => number }) {
  const cab = useRef<THREE.Group>(null);
  useFrame(() => {
    if (cab.current) cab.current.position.y = 1 + lift() * (T.towerH - 6);
  });
  const rungs = useMemo(() => {
    const out: number[] = [];
    for (let y = 1; y < T.towerH - 1; y += 0.9) out.push(y);
    return out;
  }, []);
  const rungGeo = useMemo(() => cached('rung', () => new THREE.BoxGeometry(0.5, 0.04, 0.04)), []);
  const rungMesh = useMemo(() => {
    const m = new THREE.InstancedMesh(rungGeo, MAT.steel, rungs.length);
    const o = new THREE.Object3D();
    rungs.forEach((y, i) => {
      o.position.set(0, y, -(towerR(y) - 0.35));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    return m;
  }, [rungs, rungGeo]);
  const railPts = (dx: number) => [new THREE.Vector3(dx, 0.5, -(towerR(0) - 0.35)), new THREE.Vector3(dx, T.towerH - 0.5, -(towerR(T.towerH) - 0.35))];
  const railGeo = (dx: number) => {
    const [a, b] = railPts(dx);
    const len = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return { len, mid, q };
  };
  const rails = [railGeo(-0.25), railGeo(0.25)];
  const liftA = (225 * Math.PI) / 180;
  return (
    <group>
      {/* podesty przy kołnierzach (połówki) */}
      {T.flanges.slice(1, -1).map((y) => (
        <group key={y} position={[0, y + 0.3, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} material={MAT.grate}>
            <circleGeometry args={[towerR(y) - 0.05, 40, 0, Math.PI]} />
          </mesh>
          {/* kołnierz ze śrubami */}
          <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.steelDark}>
            <torusGeometry args={[towerR(y) - 0.14, 0.12, 6, 48, Math.PI]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, T.towerH - 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.grate}>
        <circleGeometry args={[towerR(T.towerH) - 0.05, 40, 0, Math.PI]} />
      </mesh>
      {/* drabina z zabezpieczeniem przed upadkiem */}
      <primitive object={rungMesh} />
      {rails.map((r, i) => (
        <mesh key={i} position={r.mid} quaternion={r.q} material={MAT.steel}>
          <cylinderGeometry args={[0.03, 0.03, r.len, 6]} />
        </mesh>
      ))}
      {/* winda serwisowa na linach */}
      <group rotation={[0, liftA, 0]}>
        {[-0.3, 0.3].map((dx) => (
          <mesh key={dx} position={[dx, T.towerH / 2, 1.0]} material={MAT.steel}>
            <cylinderGeometry args={[0.012, 0.012, T.towerH, 4]} />
          </mesh>
        ))}
        <group ref={cab} position={[0, 1, 1.0]}>
          <Box p={[0, 1.1, 0]} s={[0.85, 2.2, 0.85]} m={MAT.yellow} />
          <Box p={[0, 1.2, 0.43]} s={[0.6, 1.4, 0.02]} m={MAT.glass} />
        </group>
      </group>
      {/* kable energetyczne: od gondoli w dół, z pętlą pod szczytem (pozwala gondoli obracać się) */}
      {[-0.25, 0, 0.25].map((dx, i) => (
        <group key={i}>
          <mesh position={[0.4 + dx, T.towerH / 2 - 6, -0.6]} material={MAT.cable}>
            <cylinderGeometry args={[0.05, 0.05, T.towerH - 14, 6]} />
          </mesh>
          <mesh position={[0.4 + dx, T.towerH - 9, -0.6]} rotation={[0, 0, Math.PI / 2]} material={MAT.cable}>
            <torusGeometry args={[0.9, 0.05, 6, 20, Math.PI]} />
          </mesh>
        </group>
      ))}
      {/* rozdzielnia średniego napięcia i szafy na dole */}
      <Box p={[-0.9, 1.6, -1.2]} s={[1.4, 2.2, 0.7]} m={MAT.cabinet} />
      <Box p={[0.8, 1.4, -1.5]} s={[1.0, 1.8, 0.6]} m={MAT.cabinet} />
      <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.floor}>
        <circleGeometry args={[towerR(0) - 0.05, 40, 0, Math.PI]} />
      </mesh>
    </group>
  );
}

/* ================= cała turbina ================= */

export interface TurbineProps {
  st: TurbineState;
  lod?: 'high' | 'low';
  /** Gondola otwarta (zdjęta przednia połowa poszycia) z wnętrzem. */
  open?: boolean;
  /** Wieża w przekroju z wnętrzem. */
  towerCut?: boolean;
  hubOpen?: boolean;
  gearCut?: boolean;
  genCut?: boolean;
  drive?: 'gear' | 'direct';
  night?: boolean;
  /** Bez wieży (scena montażu rysuje ją osobno). */
  noTower?: boolean;
  /** Bez cokołu fundamentu (np. na morzu). */
  noBase?: boolean;
  /** Ruch windy w przekroju wieży (0…1). */
  lift?: () => number;
  children?: ReactNode;
}

/** Turbina na swoim miejscu (podstawa wieży w 0). */
export function Turbine({ st, lod = 'high', open = false, towerCut = false, hubOpen = false, gearCut = false, genCut = false, drive = 'gear', night = false, noTower = false, noBase = false, lift, children }: TurbineProps) {
  const nac = useRef<THREE.Group>(null);
  useFrame(() => {
    if (nac.current) nac.current.rotation.y = st.yaw;
  });
  const high = lod === 'high';
  return (
    <group>
      {!noTower && (
        <>
          {T.flanges.slice(0, -1).map((_, i) => (
            <TowerSection key={i} i={i} half={towerCut} lod={lod} />
          ))}
          {high && <TowerDoor />}
          {!noBase && (
            <mesh position={[0, 0.15, 0]} material={MAT.concrete}>
              <cylinderGeometry args={[3.3, 3.5, 0.6, high ? 48 : 12]} />
            </mesh>
          )}
          {towerCut && <TowerInterior lift={lift ?? (() => 0.4)} />}
        </>
      )}
      <group ref={nac} position={[0, T.towerH, 0]}>
        <Nacelle st={st} lod={lod} open={open} hubOpen={hubOpen} gearCut={gearCut} genCut={genCut} drive={drive} night={night} />
      </group>
      {children}
    </group>
  );
}

/** Gondola z wirnikiem (w układzie gondoli: początek na szczycie wieży, x do przodu). */
export function Nacelle({ st, lod = 'high', open = false, hubOpen = false, gearCut = false, genCut = false, drive = 'gear', night = false, noRotor = false, rotor }: Omit<TurbineProps, 'towerCut' | 'noTower' | 'lift' | 'children' | 'noBase'> & { noRotor?: boolean; rotor?: RotorOpts }) {
  const high = lod === 'high';
  const sh = SHELL[drive];
  return (
    <group>
      {open ? (
        <>
          <mesh geometry={shellGeometry(drive, 'back')} material={MAT.paint} />
          <mesh geometry={shellGeometry(drive, 'back')} material={MAT.paintIn} />
        </>
      ) : (
        <mesh geometry={shellGeometry(drive, 'full')} material={MAT.paint} />
      )}
      {high && <Radiator x0={sh.xb + 0.4} x1={sh.xb + 3.2} />}
      <SensorMast x={sh.xb + 1.0} st={st} night={night} />
      {open && drive === 'gear' && <GearNacelleInside st={st} gearCut={gearCut} genCut={genCut} />}
      {open && drive === 'direct' && <DirectNacelleInside />}
      {drive === 'direct' && <RingGenerator st={st} cut={open} />}
      {/* przednia osłona (widoczna przez szczelinę za kołpakiem) */}
      <mesh position={[sh.xf, shaftLine(sh.xf), 0]} rotation={[0, 0, -Math.PI / 2 + T.tilt]} material={MAT.steelDark}>
        <cylinderGeometry args={[1.45, 1.45, 0.05, 32]} />
      </mesh>
      {!noRotor && (
        <group position={[HUB[0], HUB[1] - T.towerH, 0]} rotation={[0, 0, T.tilt]}>
          <Rotor st={st} lod={lod} hubOpen={hubOpen} {...rotor} />
        </group>
      )}
    </group>
  );
}

/** Punkt układu napędowego (oś x wzdłuż wału, początek na osi wieży na wysokości wału) → układ turbiny. */
export function drivePt(x: number, y = 0, z = 0): V3 {
  const c = Math.cos(T.tilt);
  const s = Math.sin(T.tilt);
  return [x * c - y * s, T.towerH + T.shaftY + x * s + y * c, z];
}
/** Wysokość wału szybkoobrotowego nad osią wału głównego. */
export const HS_OFFSET = (GEAR.par.Ng * GEAR.par.m) / 2 + (GEAR.par.Npin * GEAR.par.m) / 2;
