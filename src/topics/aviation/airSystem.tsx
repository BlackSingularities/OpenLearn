/*
 * Klimatyzacja i ciśnienie w kabinie (moduł kadłuba, zakładka „Ciśnienie w kabinie”): urządzenia, kanały i strugi
 * powietrza w lewej połowie samolotu – od silnika, przez pakiety i mieszalnik, nawiew do stref, kabinę, aż po zawór
 * wylotowy. Scenariusz po „Rozpocznij” przechodzi etap po etapie: bieżący etap świeci i ma strzałki kierunku.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AIR_ZONES, ENG_K, FUS_LIVE, cabinAirLayout } from './airliner';
import { ax, S } from './engineModel';
import { CORE_OUT, lerpTable } from './engine2d';
import { PathStreaks } from './wingLab';

type V3 = [number, number, number];

/** Etapy drogi powietrza (kolejność scenariusza). */
export const AIR_STAGES = [
  {
    title: 'Upust z silnika',
    color: '#ff5a1f',
    text: 'Powietrze do kabiny pochodzi ze sprężarki silnika (silnik jest pokazany w przekroju). Pierścieniowe kanały zbierają je z jednego z dwóch miejsc: zwykle ze środka sprężarki (ok. 300 °C), a gdy silnik pracuje słabo i ciśnienie jest tam za niskie – z jej końca (do ok. 500 °C). Zawory ograniczają ciśnienie. W pylonie gorące powietrze przechodzi przez chłodnicę, którą owiewa zimne powietrze z wentylatora, i ochładza się do ok. 200 °C. Dalej rura biegnie wzdłuż przedniej krawędzi skrzydła do kadłuba.',
  },
  {
    title: 'Pakiety klimatyzacji',
    color: '#e2e8f0',
    text: 'Pod kadłubem, w osłonie między skrzydłami, pracują dwa urządzenia klimatyzacyjne – tzw. pakiety. Gorące powietrze oddaje ciepło w chłodnicach, przez które płynie powietrze z zewnątrz. Potem rozpręża się w małej turbinie, a rozprężający się gaz mocno się ochładza – tak samo jak spray, który robi się zimny, gdy się go używa. Z pakietu wychodzi osuszone powietrze o temperaturze kilku stopni.',
  },
  {
    title: 'Mieszalnik i recyrkulacja',
    color: '#a78bfa',
    text: 'Pod podłogą stoi mieszalnik. Zimne, świeże powietrze z pakietów miesza się tu mniej więcej pół na pół z powietrzem z kabiny, które przeszło przez filtry HEPA – takie jak w szpitalach, zatrzymujące m.in. bakterie i wirusy. Dzięki temu pakiety mogą brać z silników mniej powietrza, a samolot spala mniej paliwa.',
  },
  {
    title: 'Nawiew i temperatura w strefach',
    color: '#22d3ee',
    text: 'Z mieszalnika powietrze płynie rurami w bokach kadłuba w górę, do głównego kanału nad sufitem. Kabina jest podzielona na strefy i w każdej można ustawić inną temperaturę. Pakiety dają powietrze dla najchłodniejszej strefy, a do pozostałych zawory dodają odrobinę gorącego powietrza prosto z silnika – tyle, żeby było tak ciepło, jak ustawiła załoga.',
  },
  {
    title: 'Kabina',
    color: '#e0f2fe',
    text: 'Nawiewy nad schowkami wdmuchują powietrze, które opada wzdłuż ścian, płynie obok pasażerów i uchodzi kratkami przy podłodze. Powietrze płynie w poprzek kabiny, a nie wzdłuż niej, więc mniej przenosi się między rzędami. Całe powietrze w kabinie wymienia się co 2–3 minuty.',
  },
  {
    title: 'Zawór wylotowy i ciśnienie',
    color: '#94a3b8',
    text: 'Spod podłogi część powietrza wraca do mieszalnika, a reszta płynie do zaworu wylotowego w spodzie kadłuba za skrzydłem. Automat przymyka go albo otwiera. Do kabiny przez cały czas wpływa mniej więcej tyle samo powietrza, więc im bardziej zawór jest przymknięty, tym wyższe ciśnienie w środku. W przelocie na wysokości ok. 12 km w kabinie jest ciśnienie jak na ok. 1800 m. Zawory bezpieczeństwa nie pozwalają, żeby różnica ciśnień była za duża.',
  },
];

type Group = { stage: number; paths: V3[][]; color: string; speed: number; count: number; width: number; duct?: { color: string; r: number }; arrowStep: number; arrowSize: number };

/** Strzałki kierunku wzdłuż toru: położenia i obroty stożków co `step` metrów. */
export function arrowsAlong(path: V3[], step: number) {
  const out: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  let carry = step * 0.5;
  for (let i = 0; i < path.length - 1; i++) {
    const a = new THREE.Vector3(...path[i]);
    const b = new THREE.Vector3(...path[i + 1]);
    const seg = b.clone().sub(a);
    const L = seg.length();
    if (L < 1e-4) continue;
    const dir = seg.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    for (let d = carry; d < L; d += step) {
      const p = a.clone().addScaledVector(dir, d);
      out.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
    }
    carry = (carry - L) % step;
    if (carry < 0) carry += step;
  }
  return out;
}

export function Arrows({ mats, size, color }: { mats: THREE.Matrix4[]; size: number; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.5, 1, 12);
    return g;
  }, []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const sc = new THREE.Matrix4().makeScale(size * 0.7, size, size * 0.7);
    mats.forEach((mt, i) => m.setMatrixAt(i, mt.clone().multiply(sc)));
    m.instanceMatrix.needsUpdate = true;
  }, [mats, size]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (!mats.length) return null;
  return (
    <instancedMesh ref={ref} args={[geo, undefined, mats.length]} frustumCulled={false} raycast={() => null}>
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
}

export function Duct({ path, r, color }: { path: V3[]; r: number; color: string }) {
  const geo = useMemo(() => {
    const c = new THREE.CatmullRomCurve3(
      path.map((p) => new THREE.Vector3(...p)),
      false,
      'centripetal',
    );
    return new THREE.TubeGeometry(c, Math.max(24, path.length * 14), r, 10, false);
  }, [path, r]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} raycast={() => null}>
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.4} />
    </mesh>
  );
}

/** Materiał urządzenia: podświetlony kolorem etapu, gdy to etap bieżący. */
export const Mat = ({ color, glow, metal = 0.5 }: { color: string; glow?: string; metal?: number }) => (
  <meshStandardMaterial color={color} metalness={metal} roughness={0.42} emissive={glow ?? '#000000'} emissiveIntensity={glow ? 0.55 : 0} />
);
export const Box = ({ p, s, color, rot, glow }: { p: V3; s: V3; color: string; rot?: V3; glow?: string }) => (
  <mesh position={p} rotation={rot} raycast={() => null}>
    <boxGeometry args={s} />
    <Mat color={color} glow={glow} />
  </mesh>
);
export const CylX = ({ p, r, l, color, glow, r2 }: { p: V3; r: number; l: number; color: string; glow?: string; r2?: number }) => (
  <mesh position={p} rotation={[0, 0, Math.PI / 2]} raycast={() => null}>
    <cylinderGeometry args={[r2 ?? r, r, l, 28]} />
    <Mat color={color} glow={glow} />
  </mesh>
);
export const CylY = ({ p, r, l, color, glow }: { p: V3; r: number; l: number; color: string; glow?: string }) => (
  <mesh position={p} raycast={() => null}>
    <cylinderGeometry args={[r, r, l, 28]} />
    <Mat color={color} glow={glow} />
  </mesh>
);
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Chłodnica wstępna w pylonie: wymiennik krzyżowy z żebrami i zawór regulujący chłodzenie powietrzem z wentylatora. */
function Precooler({ p, glow }: { p: V3; glow?: string }) {
  return (
    <group position={p}>
      <Box p={[0, 0, 0]} s={[0.62, 0.3, 0.46]} color="#a8a29e" glow={glow} />
      {Array.from({ length: 9 }, (_, i) => (
        <Box key={i} p={[-0.27 + i * 0.068, 0, 0.24]} s={[0.025, 0.28, 0.02]} color="#78716c" />
      ))}
      <CylX p={[0.42, 0.02, 0]} r={0.08} l={0.22} color="#57534e" />
      <Box p={[0.42, 0.14, 0]} s={[0.1, 0.1, 0.1]} color="#1f2937" />
    </group>
  );
}

/**
 * Pakiet klimatyzacji: wlot powietrza z zewnątrz z klapką, dwa wymienniki ciepła (pierwotny i główny), maszyna
 * chłodząca na jednym wale (wentylator, sprężarka, turbina), oddzielacz wody i zawór regulujący przepływ.
 */
function Pack({ p, glow }: { p: V3; glow?: string }) {
  return (
    <group position={p}>
      <Box p={[0, -0.32, 0]} s={[2.7, 0.05, 1.1]} color="#475569" />
      {/* kanał powietrza z zewnątrz pod wymiennikami */}
      <Box p={[-0.6, -0.22, 0]} s={[1.6, 0.16, 0.9]} color="#94a3b8" />
      {/* wymienniki ciepła: dwa bloki z żebrami */}
      {[-1.05, -0.45].map((x, i) => (
        <group key={i} position={[x, 0.05, 0]}>
          <Box p={[0, 0, 0]} s={[0.5, 0.48, 0.92]} color="#64748b" glow={glow} />
          {Array.from({ length: 7 }, (_, k) => (
            <Box key={k} p={[0, -0.18 + k * 0.06, 0.47]} s={[0.46, 0.018, 0.01]} color="#334155" />
          ))}
        </group>
      ))}
      {/* maszyna chłodząca (ACM): wentylator, sprężarka, turbina na wspólnym wale */}
      <CylX p={[0.45, 0.06, 0]} r={0.27} r2={0.2} l={0.36} color="#cbd5e1" glow={glow} />
      <CylX p={[0.78, 0.06, 0]} r={0.24} l={0.3} color="#e2e8f0" glow={glow} />
      <CylX p={[1.05, 0.06, 0]} r={0.2} r2={0.26} l={0.26} color="#cbd5e1" glow={glow} />
      <CylX p={[0.75, 0.06, 0]} r={0.04} l={1.0} color="#64748b" />
      {/* oddzielacz wody i zawór przepływu */}
      <CylY p={[1.0, 0.12, 0.38]} r={0.13} l={0.5} color="#e2e8f0" glow={glow} />
      <CylY p={[-1.35, 0.15, -0.3]} r={0.1} l={0.16} color="#57534e" />
      <Box p={[-1.35, 0.3, -0.3]} s={[0.12, 0.12, 0.12]} color="#1f2937" />
    </group>
  );
}

/** Mieszalnik: zbiornik z kopułą, króćce z pakietów i z recyrkulacji, wyloty do pionów nawiewu. */
function Mixer({ p, glow }: { p: V3; glow?: string }) {
  return (
    <group position={p}>
      <CylY p={[0, 0, 0]} r={0.38} l={0.5} color="#cbd5e1" glow={glow} />
      <mesh position={[0, 0.25, 0]} raycast={() => null}>
        <sphereGeometry args={[0.38, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Mat color="#cbd5e1" glow={glow} />
      </mesh>
      <mesh position={[0, -0.25, 0]} rotation={[Math.PI, 0, 0]} raycast={() => null}>
        <sphereGeometry args={[0.38, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Mat color="#cbd5e1" glow={glow} />
      </mesh>
      {/* obejmy łączące części zbiornika */}
      {[-0.14, 0.14].map((y) => (
        <CylY key={y} p={[0, y, 0]} r={0.395} l={0.03} color="#7b8a96" />
      ))}
    </group>
  );
}

/** Filtr HEPA (wkład harmonijkowy w ramie) i wentylator recyrkulacji z silnikiem. */
function FilterFan({ f, v, glow }: { f: V3; v: V3; glow?: string }) {
  return (
    <group>
      <group position={f}>
        <Box p={[0, 0, 0]} s={[0.3, 0.5, 0.38]} color="#e5e7eb" glow={glow} />
        {Array.from({ length: 8 }, (_, i) => (
          <Box key={i} p={[-0.155, -0.21 + i * 0.06, 0]} s={[0.01, 0.025, 0.34]} color="#94a3b8" />
        ))}
      </group>
      <group position={v}>
        <CylX p={[0, 0, 0]} r={0.2} l={0.3} color="#64748b" glow={glow} />
        <CylX p={[0.22, 0, 0]} r={0.12} l={0.18} color="#334155" />
      </group>
    </group>
  );
}

/** Zawór powietrza dogrzewającego (trim air): przepustnica z napędem elektrycznym. */
function TrimValve({ p, glow }: { p: V3; glow?: string }) {
  return (
    <group position={p}>
      <CylX p={[0, 0, 0]} r={0.06} l={0.18} color="#b08968" glow={glow} />
      <Box p={[0, 0.1, 0]} s={[0.1, 0.1, 0.1]} color="#ea580c" glow={glow} />
    </group>
  );
}

/**
 * Przelot kamery do ujęcia etapu (jak przy zmianie zakładki): cel i położenie przesuwają się płynnie, w połowie drogi
 * kamera lekko się oddala; złapanie modelu myszą przerywa przelot.
 */
export function StageCamera({ view }: { view: { cam: V3; tgt: V3 } | null }) {
  const camera = useThree((st) => st.camera);
  const controls = useThree((st) => st.controls) as unknown as (THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3; update: () => void }) | null;
  const fl = useRef<{ p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; t: number } | null>(null);
  const key = view ? `${view.cam.join()}|${view.tgt.join()}` : '';
  useEffect(() => {
    if (!view || !controls) return;
    fl.current = { p0: camera.position.clone(), p1: new THREE.Vector3(...view.cam), t0: controls.target.clone(), t1: new THREE.Vector3(...view.tgt), t: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controls]);
  useEffect(() => {
    if (!controls) return;
    const stop = () => (fl.current = null);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const f = fl.current;
    if (!f || !controls) return;
    f.t = Math.min(1, f.t + Math.min(1 / 30, dt) / 2.6);
    const u = f.t;
    const e = u * u * u * (u * (u * 6 - 15) + 10);
    controls.target.lerpVectors(f.t0, f.t1, e);
    tmp.lerpVectors(f.p0, f.p1, e);
    // łuk: w połowie drogi kamera odsuwa się od celu, żeby było widać, dokąd leci
    const out = tmp.clone().sub(controls.target);
    camera.position.copy(controls.target).addScaledVector(out, 1 + 0.25 * Math.sin(Math.PI * e));
    controls.update();
    if (u >= 1) fl.current = null;
  });
  return null;
}

/** Ujęcia etapów (kamera, cel) w układzie samolotu; ostatnie – cały obieg. */
export const STAGE_VIEWS: { cam: V3; tgt: V3 }[] = [
  { cam: [-15, 5, 21], tgt: [-3, -1.6, 6.5] }, // silnik, pylon, skrzydło – z zewnątrz, od lewej
  { cam: [-9.5, -7.5, -8.5], tgt: [-5, -3.6, 1.1] }, // pakiet w owiewce – od dołu, przez przekrój
  { cam: [-13.5, -1.6, -6.5], tgt: [-9.2, -2.0, 0.3] }, // mieszalnik i recyrkulacja pod podłogą
  { cam: [-1, 3.5, -15], tgt: [-6, 0.4, 1.6] }, // piony w burcie i kanał nad sufitem
  { cam: [1.5, 1.0, -6.5], tgt: [3, 0.1, 1.9] }, // kabina z bliska
  { cam: [12.5, -0.6, -7.5], tgt: [17.5, -1.9, 0] }, // zawór wylotowy
  { cam: [-15, 15, -24], tgt: [-6, -1.2, 3] }, // cały obieg
];

/** Rysowanie „na wierzchu” (przez skrzydło i poszycie) – strugi i strzałki bieżącego etapu, jak na prześwietleniu. */
export function XRay({ on, children }: { on: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      if (mat.depthTest === on) {
        mat.depthTest = !on;
        mat.needsUpdate = true;
      }
      m.renderOrder = on ? 20 : 0;
    });
  });
  return <group ref={ref}>{children}</group>;
}

/**
 * Układ klimatyzacji w scenie: `stage` – bieżący etap scenariusza (−1: przed „Rozpocznij”, wszystko przygaszone;
 * powyżej ostatniego – wszystko widać).
 */
export function AirSystem({ getStage }: { getStage: () => number }) {
  const L0 = useMemo(() => cabinAirLayout(), []);
  /**
   * Upust w silniku: kolektory za 4. i ostatnim stopniem sprężarki (te same co w modelu silnika), zawory IP (zwrotny)
   * i HP, połączenie, PRSOV, w górę pylonu do chłodnicy; osobno zimne powietrze z kanału wentylatora (zawór FAV).
   * Punkty w układzie samolotu – silnik stoi w engineAt() w skali ENG_K, oś wzdłuż x, góra obudowy w +y.
   */
  const ENG = useMemo(() => {
    const E = L0.engine;
    const top = (st: number, dr = 0): V3 => [E[0] + ax(st) * ENG_K, E[1] + ((lerpTable(CORE_OUT, st) + 6) * S + dr) * ENG_K, E[2]];
    const ip = top(345);
    const hp = top(442);
    const ipV = top(345, 0.25);
    const hpV = top(442, 0.25);
    const join: V3 = [(ipV[0] + hpV[0]) / 2, ipV[1] + 0.38, E[2]];
    const prsov: V3 = [join[0] + 0.25, join[1] + 0.25, E[2]];
    // powietrze z kanału wentylatora pobierane tuż pod chłodnicą (krótki pionowy kanał w pylonie)
    const P = L0.pylonTop;
    const fanAir: V3 = [P[0] - 0.35, E[1] + 1.05 * ENG_K, E[2] + 0.12];
    return { ip, hp, ipV, hpV, join, prsov, fanAir };
  }, [L0]);
  const L = useMemo(() => {
    const P = L0.pylonTop;
    // gorące powietrze upustu: od portów przez zawory do połączenia, PRSOV, chłodnica i dalej jak wcześniej (skrzydło)
    const bleed: V3[] = [ENG.join, ENG.prsov, [P[0] - 0.2, P[1] - 0.25, P[2]], P, ...L0.bleed.slice(3)];
    const ports: V3[][] = [
      [ENG.ip, ENG.ipV, ENG.join],
      [ENG.hp, ENG.hpV, ENG.join],
    ];
    // zimne powietrze z kanału wentylatora: przez zawór FAV do chłodnicy, potem bokiem pylonu na zewnątrz
    const fan: V3[] = [ENG.fanAir, [ENG.fanAir[0] + 0.1, P[1] - 0.35, P[2] + 0.12], [P[0] - 0.1, P[1], P[2] + 0.12]];
    // zużyte powietrze z wentylatora wylatuje kratką z boku pylonu (sama struga, bez rury)
    const fanOut: V3[] = [[P[0] - 0.1, P[1], P[2] + 0.12], [P[0] + 0.35, P[1] + 0.02, P[2] + 0.3], [P[0] + 1.0, P[1] - 0.1, P[2] + 0.75]];
    return { ...L0, bleed, ports, fan, fanOut };
  }, [L0, ENG]);
  // etap scenariusza czytany co klatkę (stan symulacji w refie) – przerysowanie tylko przy zmianie etapu
  const [stage, setStage] = useState(-1);
  useFrame(() => {
    const st = getStage();
    if (st !== stage) setStage(st);
  });
  const groups = useMemo<Group[]>(
    () => [
      { stage: 0, paths: [L.ports[0]], color: '#f59e0b', speed: 2, count: 14, width: 0.06, duct: { color: '#b08968', r: 0.05 }, arrowStep: 0.35, arrowSize: 0.14 },
      { stage: 0, paths: [L.ports[1]], color: '#ef4444', speed: 2, count: 14, width: 0.06, duct: { color: '#b08968', r: 0.05 }, arrowStep: 0.35, arrowSize: 0.14 },
      { stage: 0, paths: [L.fan], color: '#7cc7ff', speed: 2.5, count: 14, width: 0.06, duct: { color: '#c3ced6', r: 0.06 }, arrowStep: 0.3, arrowSize: 0.14 },
      { stage: 0, paths: [L.fanOut], color: '#7cc7ff', speed: 2.5, count: 10, width: 0.06, arrowStep: 0.45, arrowSize: 0.14 },
      { stage: 0, paths: [L.bleed], color: '#ff5a1f', speed: 5, count: 40, width: 0.09, duct: { color: '#b08968', r: 0.07 }, arrowStep: 1.6, arrowSize: 0.3 },
      { stage: 1, paths: [L.ram], color: '#e2e8f0', speed: 4, count: 24, width: 0.08, arrowStep: 1.2, arrowSize: 0.26 },
      { stage: 2, paths: [L.packOut], color: '#38bdf8', speed: 3, count: 26, width: 0.08, duct: { color: '#c3ced6', r: 0.09 }, arrowStep: 1.0, arrowSize: 0.26 },
      { stage: 2, paths: L.recirc, color: '#a78bfa', speed: 2.5, count: 30, width: 0.07, duct: { color: '#c3ced6', r: 0.08 }, arrowStep: 1.3, arrowSize: 0.24 },
      { stage: 3, paths: L.supply, color: '#22d3ee', speed: 3, count: 60, width: 0.07, duct: { color: '#c3ced6', r: 0.08 }, arrowStep: 1.8, arrowSize: 0.26 },
      { stage: 3, paths: L.duct, color: '#22d3ee', speed: 3, count: 60, width: 0.08, arrowStep: 2.6, arrowSize: 0.3 },
      { stage: 3, paths: L.trim, color: '#fb923c', speed: 4, count: 30, width: 0.05, duct: { color: '#b08968', r: 0.035 }, arrowStep: 2.6, arrowSize: 0.18 },
      { stage: 4, paths: L.cabin, color: '#e0f2fe', speed: 1.4, count: 150, width: 0.06, arrowStep: 1.5, arrowSize: 0.18 },
      { stage: 5, paths: L.exhaust, color: '#94a3b8', speed: 2.2, count: 50, width: 0.08, arrowStep: 2.4, arrowSize: 0.26 },
    ],
    [L],
  );
  const arrows = useMemo(() => groups.map((g) => g.paths.flatMap((p) => arrowsAlong(p, g.arrowStep))), [groups]);
  // zawór wylotowy: klapa obraca się zależnie od otwarcia (sterownik ciśnienia)
  const flap = useRef<THREE.Group>(null);
  useFrame(() => {
    if (flap.current) flap.current.rotation.z = (1 - FUS_LIVE.outflow) * 1.2;
  });
  const all = stage < 0;
  // urządzenia bieżącego etapu świecą jego kolorem
  const glow = (st: number) => (!all && stage === st ? AIR_STAGES[st].color : undefined);
  const E = L0.engine;
  const views = useMemo(() => [{ cam: [E[0] - 3.5, E[1] + 2.2, E[2] + 7.5] as V3, tgt: [E[0] + 1.6, E[1] + 0.6, E[2]] as V3 }, ...STAGE_VIEWS.slice(1)], [E]);
  const view = all ? null : views[Math.min(stage, views.length - 1)];
  return (
    <group>
      <StageCamera view={view} />
      {/* urządzenia: chłodnica w pylonie, pakiet, mieszalnik, filtry HEPA i wentylatory, zawory dogrzewania,
          zawór wylotowy */}
      <Precooler p={L.pylonTop} glow={glow(0)} />
      {/* zawory upustu w silniku: IP (zwrotny), HP, PRSOV, FAV (powietrze z wentylatora do chłodnicy) */}
      {[ENG.ipV, ENG.hpV, ENG.prsov, [ENG.fanAir[0] + 0.05, (ENG.fanAir[1] + L.pylonTop[1]) / 2, L.pylonTop[2] + 0.12] as V3].map((p, i) => (
        <TrimValve key={`ev${i}`} p={p} glow={glow(0)} />
      ))}
      <Pack p={L.PACK} glow={glow(1)} />
      <Mixer p={L.MIXER} glow={glow(2)} />
      {L.FILTERS.map((f, i) => (
        <FilterFan key={i} f={f} v={L.FANS[i]} glow={glow(2)} />
      ))}
      {L.trim.map((p, i) => (
        <TrimValve key={`t${i}`} p={add3(p[p.length - 1], [0, 0.02, 0])} glow={glow(3)} />
      ))}
      <group position={L.OUTFLOW}>
        <Box p={[0, 0, 0]} s={[0.62, 0.1, 0.64]} color="#475569" glow={glow(5)} />
        <Box p={[0, 0, 0]} s={[0.5, 0.11, 0.52]} color="#1f2937" />
        <Box p={[-0.42, 0.12, 0]} s={[0.16, 0.16, 0.2]} color="#1f2937" glow={glow(5)} />
        <group ref={flap} position={[0.25, -0.06, 0]}>
          <Box p={[-0.25, 0, 0]} s={[0.5, 0.03, 0.5]} color="#cbd5e1" />
        </group>
      </group>
      {/* kanały (rury) */}
      {groups.map((g, gi) => g.duct && g.paths.map((p, pi) => <Duct key={`d${gi}-${pi}`} path={p} r={g.duct!.r} color={g.duct!.color} />))}
      {/* strugi i strzałki: bieżący etap jasny, wcześniejsze przygaszone, późniejsze jeszcze niewidoczne */}
      {groups.map((g, gi) => {
        const on = all || stage >= g.stage;
        if (!on) return null;
        const cur = !all && stage === g.stage;
        const op = all ? 0.35 : cur ? 0.95 : 0.45;
        return (
          <XRay key={`s${gi}-${all ? 'a' : cur ? 'c' : 'd'}`} on={cur}>
            <PathStreaks paths={g.paths} count={cur ? Math.round(g.count * 1.5) : g.count} color={g.color} speed={g.speed} trail={0.9} width={cur ? g.width * 1.4 : g.width} opacity={op} />
            {(cur || stage >= AIR_STAGES.length) && <Arrows mats={arrows[gi]} size={cur ? g.arrowSize * 1.3 : g.arrowSize} color={g.color} />}
          </XRay>
        );
      })}
    </group>
  );
}

/** Wartości do ramki informacji (przelot na FL410, ok. 300 pasażerów). */
export function airValues() {
  const zones = AIR_ZONES.map((z, i) => ({ ...z, target: [22, 23.5, 22.5][i], trim: [8, 34, 18][i] }));
  return { bleedT: 200, bleedP: 40, packOut: 4, mix: 13, recirc: 50, zones, change: 2.5 };
}
