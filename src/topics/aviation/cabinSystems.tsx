/*
 * Instalacje kabiny w module „Kadłub i kabina”, w tym samym stylu co obieg powietrza (airSystem.tsx): scenariusz po
 * „Rozpocznij” przechodzi etap po etapie, kamera przelatuje do etapu, bieżący etap świeci i ma strzałki kierunku.
 * – Woda i toalety: napełnianie, zbiorniki pod ciśnieniem powietrza, rozprowadzenie, podgrzewacze i szara woda
 *   (podgrzewane maszty odpływowe), toalety podciśnieniowe, zbiorniki ścieków i obsługa na ziemi.
 * – Pożar w ładowni: tlący się kontener, czujniki dymu, odcięcie wentylacji, wyładowanie środka gaśniczego i
 *   utrzymanie stężenia, lądowanie na najbliższym lotnisku.
 * Układ rur i urządzeń – cabinSystemsLayout() (airliner.tsx), w tych samych miejscach co model kabiny.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CARGO_SLOTS, cabinSystemsLayout } from './airliner';
import { Arrows, Box, CylX, CylY, Duct, StageCamera, XRay, arrowsAlong } from './airSystem';
import { PathStreaks } from './wingLab';

type V3 = [number, number, number];
type Stage = { title: string; color: string; text: string };
export type Group = { stage: number; paths: V3[][]; color: string; speed: number; count: number; width: number; duct?: { color: string; r: number }; arrowStep: number; arrowSize: number; until?: number };

/** Czas jednego etapu scenariusza (s) – wspólny dla obu zakładek. */
export const SYS_STAGE_T = 8;

/* ============================== woda i toalety ============================== */

export const WATER_STAGES: Stage[] = [
  {
    title: 'Napełnianie na ziemi',
    color: '#60a5fa',
    text: 'Przed lotem pod przód samolotu podjeżdża cysterna z wodą pitną i podłącza wąż do panelu w spodzie kadłuba. Woda płynie do dwóch zbiorników pod podłogą (razem ok. 1100 litrów). Na krótkie loty nalewa się mniej – każdy litr to dodatkowy ciężar, a więc więcej spalonego paliwa.',
  },
  {
    title: 'Zbiorniki pod ciśnieniem',
    color: '#a5b4fc',
    text: 'W samolocie nie ma pompy do wody. Nad wodą w zbiornikach jest sprężone powietrze i to ono wypycha wodę do rur – tak jak w syfonie do wody gazowanej. Rury są owinięte izolacją, a miejscami podgrzewane, żeby woda nie zamarzła.',
  },
  {
    title: 'Do kuchni i umywalek',
    color: '#38bdf8',
    text: 'Główna rura biegnie pod podłogą wzdłuż całej kabiny. Przy każdych drzwiach odchodzą od niej rurki w górę – do kuchni (kawa, herbata, piekarniki) i do umywalek w toaletach. Wodę z kranu w samolocie lepiej zostawić do mycia rąk – do picia podaje się wodę z butelek.',
  },
  {
    title: 'Podgrzewacz i szara woda',
    color: '#f59e0b',
    text: 'Pod każdą umywalką mały podgrzewacz daje ciepłą wodę. Zużyta woda z umywalek i zlewów (tzw. szara woda) nie wraca do zbiornika – spływa rurą do masztu pod kadłubem. Maszt jest podgrzewany, więc woda nie zamarza, tylko rozpyla się w powietrzu z dala od samolotu.',
  },
  {
    title: 'Toaleta podciśnieniowa',
    color: '#a16207',
    text: 'Po naciśnięciu przycisku na chwilę otwiera się zawór pod muszlą. Zbiornik ścieków jest połączony z powietrzem na zewnątrz, gdzie w locie ciśnienie jest kilka razy niższe niż w kabinie. Ta różnica zasysa zawartość z prędkością ponad 100 km/h. Spłukanie zużywa tylko ok. 0,2 litra wody (w domowej toalecie 6–9 litrów). Głośny „syk” to właśnie zasysane powietrze.',
  },
  {
    title: 'Zbiorniki ścieków i obsługa',
    color: '#78716c',
    text: 'Ścieki trafiają do zbiorników z tyłu samolotu. Na ziemi i nisko (poniżej ok. 5 km), gdy różnica ciśnień jest za mała, pracuje dodatkowa pompa, która wytwarza podciśnienie. Po locie zbiorniki opróżnia na ziemi specjalny pojazd przez zawór z tyłu kadłuba – nigdy w powietrzu.',
  },
];

const WATER_VIEWS: { cam: V3; tgt: V3 }[] = [
  { cam: [-20.5, -6.8, -6.5], tgt: [-24.4, -2.7, -0.3] }, // panel napełniania – od dołu
  { cam: [-21.0, -1.0, -5.2], tgt: [-25, -2.0, 0.1] }, // zbiorniki pod podłogą
  { cam: [-12, 3.2, -13.5], tgt: [-6, -0.6, 1.0] }, // magistrala i odgałęzienia
  { cam: [-13.2, 0.6, -5.2], tgt: [-17.8, -0.9, 1.2] }, // umywalka przy drzwiach 2 i maszt
  { cam: [6.5, 1.6, -8.5], tgt: [10.5, -1.0, 1.0] }, // toaleta przy drzwiach 3 i rura do zbiorników
  { cam: [20, -5.2, -6.5], tgt: [16, -2.0, 0.3] }, // zbiorniki ścieków, generator, panel obsługi
  { cam: [-6, 12, -27], tgt: [-3, -1.2, 1] }, // cała instalacja
];

/* ============================== pożar w ładowni ============================== */

export const FIRE_STAGES: Stage[] = [
  {
    title: 'Zarzewie',
    color: '#f97316',
    text: 'W jednym z kontenerów w przedniej ładowni zaczyna się tlić bagaż – np. uszkodzona bateria w walizce. Ładownia jest zamknięta i nikt jej nie widzi, a w samolocie przy pożarze liczą się minuty. Dlatego ładownie mają własną, samoczynną ochronę.',
  },
  {
    title: 'Wykrycie dymu',
    color: '#ef4444',
    text: 'W suficie ładowni są czujniki dymu – wentylatory przepuszczają przez nie próbki powietrza. Gdy dwa niezależne czujniki wyczują dym, w kokpicie zapala się czerwona lampka alarmu, rozlega się dzwonek, a ekran ECAM pokazuje komunikat o dymie w ładowni i listę czynności.',
  },
  {
    title: 'Odcięcie wentylacji',
    color: '#94a3b8',
    text: 'Zawory odcinają wentylację ładowni, a wentylator i ogrzewanie się wyłączają. Ładownia staje się szczelna: ogień nie dostaje świeżego tlenu, a dym nie przedostaje się do kabiny. Ściany ładowni są ognioodporne i wytrzymują płomień.',
  },
  {
    title: 'Wyładowanie gaśnicze',
    color: '#e2e8f0',
    text: 'Pilot naciska przycisk i pierwsza butla w ułamku sekundy wyrzuca gaz gaśniczy przez dysze w suficie. Gaz wypełnia całą ładownię i przerywa spalanie. W takim stężeniu nie szkodzi ludziom i nie zostawia osadu.',
  },
  {
    title: 'Utrzymanie stężenia',
    color: '#a5b4fc',
    text: 'Gaz powoli ucieka z ładowni, a tlący się bagaż mógłby znowu się zapalić. Dlatego druga butla dopuszcza gaz małym strumieniem przez wiele godzin. Od tego zapasu zależy, jak daleko od lotniska samolot może latać, np. nad oceanem.',
  },
  {
    title: 'Lądowanie na najbliższym lotnisku',
    color: '#22c55e',
    text: 'Gaz tłumi pożar, ale go całkiem nie gasi. Dlatego załoga od razu leci na najbliższe odpowiednie lotnisko. Po lądowaniu samolot zatrzymuje się na pasie, a ładownię otwiera dopiero straż pożarna z kamerą termowizyjną – świeże powietrze mogłoby na nowo rozpalić ogień.',
  },
];

const FIRE_VIEWS: { cam: V3; tgt: V3 }[] = [
  { cam: [-14.2, -1.4, -4.6], tgt: [-17, -2.0, 0.6] }, // płonący kontener
  { cam: [-14.5, -0.9, -4.4], tgt: [-17, -1.75, 0] }, // czujniki w suficie
  { cam: [-17.5, -0.2, -6.0], tgt: [-17, -1.8, 1.0] }, // wentylacja i zawory
  { cam: [-5.5, -0.6, -6.5], tgt: [-12, -1.9, 0.8] }, // butle i rury do dysz
  { cam: [-14.5, -0.8, -5.5], tgt: [-17, -2.0, 0.5] }, // ładownia wypełniona środkiem
  { cam: [-32, 8, -30], tgt: [-8, -1, 0] }, // cały samolot – lądowanie
  { cam: [-26, 6, -18], tgt: [-12, -1.8, 0.5] }, // cała instalacja
];

/* ============================== wspólne ============================== */

/** Rury, strugi i strzałki etapów (bieżący etap jasny i „na wierzchu”, wcześniejsze przygaszone, późniejsze ukryte). */
export function StagedFlows({ groups, stage, nStages }: { groups: Group[]; stage: number; nStages: number }) {
  const arrows = useMemo(() => groups.map((g) => g.paths.flatMap((p) => arrowsAlong(p, g.arrowStep))), [groups]);
  const all = stage < 0;
  return (
    <>
      {groups.map((g, gi) => g.duct && g.paths.map((p, pi) => <Duct key={`d${gi}-${pi}`} path={p} r={g.duct!.r} color={g.duct!.color} />))}
      {groups.map((g, gi) => {
        const on = (all || stage >= g.stage) && (g.until === undefined || stage < g.until || stage >= nStages);
        if (!on) return null;
        const cur = !all && stage === g.stage;
        const op = all ? 0.35 : cur ? 0.95 : 0.45;
        return (
          <XRay key={`s${gi}-${all ? 'a' : cur ? 'c' : 'd'}`} on={cur}>
            <PathStreaks paths={g.paths} count={cur ? Math.round(g.count * 1.5) : g.count} color={g.color} speed={g.speed} trail={0.7} width={cur ? g.width * 1.4 : g.width} opacity={op} />
            {(cur || stage >= nStages) && <Arrows mats={arrows[gi]} size={cur ? g.arrowSize * 1.3 : g.arrowSize} color={g.color} />}
          </XRay>
        );
      })}
    </>
  );
}

/** Bieżący etap czytany co klatkę – przerysowanie tylko przy zmianie etapu. */
export function useStage(getStage: () => number) {
  const [stage, setStage] = useState(-1);
  useFrame(() => {
    const st = getStage();
    if (st !== stage) setStage(st);
  });
  return stage;
}

/** Miękka plamka do dymu i mgły. */
let puffTex: THREE.CanvasTexture | null = null;
function getPuffTex() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

/** Chmura punktów (dym, środek gaśniczy) w prostopadłościanie albo wokół punktu; gęstość ustawia `density()` co klatkę. */
export function Cloud({ n, box, around, color, size, density, drift = 0.15, seed = 3 }: { n: number; box?: { x0: number; x1: number; y0: number; y1: number; z: number }; around?: { p: V3; r: number; up: number }; color: string; size: number; density: () => number; drift?: number; seed?: number }) {
  const geo = useMemo(() => {
    let k = seed;
    const r = () => {
      k = (k * 16807) % 2147483647;
      return (k - 1) / 2147483646;
    };
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
      if (box) pts.push(box.x0 + r() * (box.x1 - box.x0), box.y0 + r() * (box.y1 - box.y0), (r() * 2 - 1) * box.z);
      else if (around) {
        const a = r() * Math.PI * 2;
        const rr = Math.sqrt(r()) * around.r;
        pts.push(around.p[0] + Math.cos(a) * rr, around.p[1] + r() * around.up, around.p[2] + Math.sin(a) * rr);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [n, box, around, seed]);
  useEffect(() => () => geo.dispose(), [geo]);
  const ref = useRef<THREE.Points>(null);
  const mat = useRef<THREE.PointsMaterial>(null);
  useFrame(({ clock }) => {
    const d = density();
    if (mat.current) mat.current.opacity = Math.min(0.9, d);
    if (ref.current) {
      ref.current.visible = d > 0.01;
      ref.current.position.y = drift * Math.sin(clock.elapsedTime * 0.4 + seed);
      ref.current.position.x = drift * Math.sin(clock.elapsedTime * 0.27 + seed * 2);
    }
  });
  return (
    <points ref={ref} geometry={geo} visible={false} frustumCulled={false}>
      <pointsMaterial ref={mat} map={getPuffTex()} size={size} sizeAttenuation transparent depthWrite={false} opacity={0} color={color} />
    </points>
  );
}

/* ============================== woda i toalety – scena ============================== */

export function WaterSystem({ getStage }: { getStage: () => number }) {
  const L = useMemo(() => cabinSystemsLayout(), []);
  const stage = useStage(getStage);
  const n = WATER_STAGES.length;
  const groups = useMemo<Group[]>(
    () => [
      { stage: 0, paths: [L.fill], color: '#60a5fa', speed: 1.5, count: 14, width: 0.06, duct: { color: '#1e3a8a', r: 0.04 }, arrowStep: 0.4, arrowSize: 0.12 },
      { stage: 1, paths: L.air, color: '#c7d2fe', speed: 1.2, count: 14, width: 0.04, duct: { color: '#94a3b8', r: 0.025 }, arrowStep: 0.35, arrowSize: 0.1 },
      { stage: 2, paths: [L.trunk], color: '#38bdf8', speed: 3, count: 60, width: 0.06, arrowStep: 2.2, arrowSize: 0.2 },
      { stage: 2, paths: L.branches, color: '#38bdf8', speed: 1.4, count: 30, width: 0.05, arrowStep: 0.5, arrowSize: 0.12 },
      { stage: 3, paths: L.grey, color: '#cbd5e1', speed: 1.6, count: 40, width: 0.05, duct: { color: '#64748b', r: 0.03 }, arrowStep: 1.2, arrowSize: 0.13 },
      { stage: 3, paths: L.greyOut, color: '#e2e8f0', speed: 2.5, count: 16, width: 0.06, arrowStep: 0.6, arrowSize: 0.12 },
      { stage: 4, paths: L.vacuum, color: '#a16207', speed: 6, count: 50, width: 0.07, arrowStep: 1.4, arrowSize: 0.16 },
      { stage: 5, paths: [L.vent], color: '#cbd5e1', speed: 2.5, count: 18, width: 0.05, duct: { color: '#57534e', r: 0.035 }, arrowStep: 0.6, arrowSize: 0.12 },
      { stage: 5, paths: [L.drain], color: '#78716c', speed: 1.2, count: 14, width: 0.06, duct: { color: '#44403c', r: 0.045 }, arrowStep: 0.5, arrowSize: 0.12 },
    ],
    [L],
  );
  const glow = (st: number) => (stage === st ? WATER_STAGES[st].color : undefined);
  const view = stage < 0 ? null : WATER_VIEWS[Math.min(stage, WATER_VIEWS.length - 1)];
  return (
    <group>
      <StageCamera view={view} />
      {/* panele obsługi w spodzie kadłuba: woda (przód), ścieki (tył) */}
      <Box p={[L.fillPanel[0], L.fillPanel[1] - 0.02, L.fillPanel[2]]} s={[0.4, 0.04, 0.3]} color="#1e40af" glow={glow(0)} />
      <Box p={[L.wastePanel[0], L.wastePanel[1] - 0.02, L.wastePanel[2]]} s={[0.4, 0.04, 0.3]} color="#57534e" glow={glow(5)} />
      {/* sprężarka powietrza zbiorników */}
      <Box p={L.compressor} s={[0.32, 0.22, 0.24]} color="#64748b" glow={glow(1)} />
      {/* podgrzewacze pod umywalkami */}
      {L.heaters.map((p, i) => (
        <Box key={i} p={p} s={[0.18, 0.2, 0.16]} color="#e5e7eb" glow={glow(3)} />
      ))}
      {/* zawory spłukiwania pod muszlami */}
      {L.lavs.map((l, i) => (
        <CylY key={i} p={[l.bowl[0], l.bowl[1] - 0.3, l.bowl[2]]} r={0.07} l={0.12} color="#9ca3af" glow={glow(4)} />
      ))}
      {/* generator podciśnienia przy zbiornikach ścieków */}
      <CylX p={L.vacGen} r={0.16} l={0.42} color="#78716c" glow={glow(5)} />
      <StagedFlows groups={groups} stage={stage} nStages={n} />
    </group>
  );
}

/* ============================== pożar w ładowni – scena ============================== */

/** Etap i postęp scenariusza pożaru w chwili t (−1 – przed „Rozpocznij”). */
export function fireState(t: number) {
  const T = SYS_STAGE_T;
  const sm = (x: number) => {
    const u = Math.max(0, Math.min(1, x));
    return u * u * (3 - 2 * u);
  };
  if (t < 0) return { smoke: 0, plume: 0, glow: 0, halon: 0, detect: false, isolated: false, agent1: false, agent2: false, conc: 0 };
  const dis = 3 * T + 1; // chwila wyładowania (etap 4)
  const plume = sm(t / 3) * (t < dis ? 1 : 0.25 + 0.75 * (1 - sm((t - dis) / 4)));
  const smoke = sm((t - 2) / (2 * T)) * (t < dis ? 1 : 0.2 + 0.8 * (1 - sm((t - dis) / 6)));
  const glow = sm(t / 2) * (t < dis ? 1 : 0.15 + 0.85 * (1 - sm((t - dis) / 2.5)));
  const halon = t < dis ? 0 : sm((t - dis) / 1.2) * (t < dis + 6 ? 1 : 0.8);
  const conc = t < dis ? 0 : t < dis + 1.2 ? 5.5 * sm((t - dis) / 1.2) : Math.max(3.4, 5.5 - (t - dis - 1.2) * 0.25);
  return { smoke, plume, glow, halon, detect: t >= T, isolated: t >= 2 * T + 1, agent1: t >= dis, agent2: t >= 4 * T, conc };
}

export function FireSystem({ getStage, getT }: { getStage: () => number; getT: () => number }) {
  const L = useMemo(() => cabinSystemsLayout(), []);
  const stage = useStage(getStage);
  const n = FIRE_STAGES.length;
  // płonący kontener: przednia ładownia, lewy pas (widać go w przekroju), w środku ładowni
  const slot = useMemo(() => CARGO_SLOTS.filter((s) => s.hold === 0 && s.z > 0).reduce((a, b) => (Math.abs(b.x + 17) < Math.abs(a.x + 17) ? b : a)), []);
  const fireP: V3 = [slot.x, -2.42 + 0.55, slot.z];
  const groups = useMemo<Group[]>(
    () => [
      // wentylacja ładowni działa do odcięcia (etap 3)
      { stage: 0, until: 2, paths: [L.ventIn, L.ventOut], color: '#94a3b8', speed: 1.2, count: 16, width: 0.05, duct: { color: '#94a3b8', r: 0.06 }, arrowStep: 0.45, arrowSize: 0.12 },
      { stage: 3, paths: [L.agentF], color: '#f8fafc', speed: 9, count: 60, width: 0.07, duct: { color: '#b91c1c', r: 0.035 }, arrowStep: 1.4, arrowSize: 0.16 },
      { stage: 4, paths: [L.agentA], color: '#c7d2fe', speed: 2.5, count: 30, width: 0.05, duct: { color: '#b91c1c', r: 0.035 }, arrowStep: 1.8, arrowSize: 0.14 },
    ],
    [L],
  );
  const view = stage < 0 ? null : FIRE_VIEWS[Math.min(stage, FIRE_VIEWS.length - 1)];
  const glowBox = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const det = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const valves = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const bottle = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame(({ clock }) => {
    const f = fireState(getT());
    const fl = 0.75 + 0.25 * Math.sin(clock.elapsedTime * 13) * Math.sin(clock.elapsedTime * 7.3);
    if (glowBox.current) {
      glowBox.current.opacity = 0.55 * f.glow;
      glowBox.current.emissiveIntensity = 2.2 * f.glow * fl;
    }
    if (light.current) light.current.intensity = 6 * f.glow * fl;
    const blink = Math.sin(clock.elapsedTime * 8) > 0;
    det.current.forEach((m) => {
      if (!m) return;
      m.emissive.set(f.detect ? '#ef4444' : '#16a34a');
      m.emissiveIntensity = f.detect ? (blink ? 2 : 0.3) : 0.6;
    });
    valves.current.forEach((m) => {
      if (!m) return;
      m.emissive.set(f.isolated ? '#ef4444' : '#22c55e');
      m.emissiveIntensity = 0.8;
    });
    bottle.current.forEach((m, i) => {
      if (!m) return;
      const used = i === 0 ? f.agent1 : f.agent2;
      m.emissiveIntensity = used ? 0.6 + 0.4 * (blink ? 1 : 0) : 0;
    });
  });
  const tt = () => fireState(getT());
  return (
    <group>
      <StageCamera view={view} />
      {/* żarzący się kontener: poświata i światło z wnętrza */}
      <mesh position={fireP}>
        <boxGeometry args={[1.62, 1.14, 1.6]} />
        <meshStandardMaterial ref={glowBox} color="#ff6a1a" emissive="#ff4d00" emissiveIntensity={0} transparent opacity={0} depthWrite={false} />
      </mesh>
      <pointLight ref={light} position={[fireP[0], fireP[1] + 0.2, fireP[2]]} color="#ff7a1a" intensity={0} distance={6} decay={2} />
      {/* dym: smuga nad kontenerem i dym w całej ładowni */}
      <Cloud n={160} around={{ p: [fireP[0], fireP[1] + 0.45, fireP[2]], r: 0.9, up: 0.7 }} color="#2f3338" size={0.9} density={() => 0.8 * tt().plume} drift={0.08} seed={11} />
      <Cloud n={700} box={L.hold} color="#4b5058" size={1.1} density={() => 0.55 * tt().smoke} seed={5} />
      {/* środek gaśniczy: biała mgła w całej ładowni */}
      <Cloud n={900} box={L.hold} color="#eef2f7" size={1.2} density={() => 0.5 * tt().halon} seed={9} />
      {/* czujniki dymu w suficie */}
      {L.detectorsF.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.3, 0.06, 0.3]} />
          <meshStandardMaterial ref={(m) => (det.current[i] = m)} color="#e5e7eb" emissive="#16a34a" emissiveIntensity={0.6} />
        </mesh>
      ))}
      {/* zawory odcinające wentylację */}
      {L.isoValves.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.22, 0.18, 0.22]} />
          <meshStandardMaterial ref={(m) => (valves.current[i] = m)} color="#475569" emissive="#22c55e" emissiveIntensity={0.8} />
        </mesh>
      ))}
      {/* butle gaśnicze (wyładowanie szybkie i dozowane) z głowicami */}
      {L.bottles.map((p, i) => (
        <group key={i} position={p}>
          <mesh>
            <sphereGeometry args={[0.2, 20, 14]} />
            <meshStandardMaterial ref={(m) => (bottle.current[i] = m)} color="#b91c1c" emissive="#ffffff" emissiveIntensity={0} metalness={0.4} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 0.1, 12]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* dysze w suficie ładowni */}
      {[...L.nozzlesF, ...L.nozzlesA].map((p, i) => (
        <mesh key={i} position={p} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.06, 0.1, 10]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      <StagedFlows groups={groups} stage={stage} nStages={n} />
    </group>
  );
}
