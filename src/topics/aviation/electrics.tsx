/*
 * Moduł „Elektryka”: skąd samolot bierze prąd i jak go rozdziela. Źródła: generatory na silnikach (po dwa na
 * silnik), generator APU, zasilanie z płyty (GPU przez gniazdo pod nosem), akumulatory i awaryjna turbina RAT
 * w owiewce. Prąd płynie przewodami do centrów rozdziału w przedziale awioniki pod kokpitem, a stamtąd szynami
 * AC i DC do odbiorników. Schemat w ramce działa jak strona ELEC na ECAM: zielone – zasilone.
 * Wspólne części: stanowisko na płycie (CargoStand), koła i pasy pojazdów, strugi (PathStreaks, XRay), przelot
 * kamery (StageCamera), podpisy (Lbl). Scenariusze – etap po etapie, jak w innych modułach.
 */
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Params } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { CockpitDock, Ecam } from '../../components/cockpit';
import { CargoStand, ENG_K, GseWheel, HazardPlate, Lbl, PLANE_LEVELS, StaticBar, engineOrigin, fairBottom, fusBottom, placeBetween } from './airliner';
import { StageCamera, XRay } from './airSystem';
import { useStage } from './cabinSystems';
import { ACC_TH, accP } from './engineModel';
import { PathStreaks } from './wingLab';

type V3 = [number, number, number];
const G = PLANE_LEVELS.ground;
const sm = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

export type ElecMode = 'home' | 'gpu' | 'apu' | 'eng' | 'dist' | 'rat';

/* ============================== układ (współrzędne samolotu) ============================== */

const E = engineOrigin();
/** Generator na skrzynce napędów silnika (to samo miejsce co w modelu silnika); side: 1 – lewy, −1 – prawy. */
const genAt = (side: number, dx = 0): V3 => {
  const a = accP(380 + dx, 1.04, ACC_TH - 0.13);
  return [E[0] + a[0] * ENG_K, E[1] + a[1] * ENG_K, side * (E[2] + a[2] * ENG_K)];
};
const EBAY: V3 = [-28.6, -2.15, 0];
const EXT: V3 = (() => {
  const x = -30.4;
  const z = -0.55;
  return [x, fusBottom(x, z, 0.01), z];
})();
const RAT_X = -9.2;
const RAT_Z = -1.35;
const RAT_HINGE: V3 = [RAT_X, fairBottom(RAT_X, RAT_Z, 0.0) + 0.06, RAT_Z];
const RAT_L = 1.45;
/** Koniec ramienia RAT (generator i śmigło) przy wysunięciu a (0 – schowany do tyłu, 1 – pionowo w dół). */
const ratTip = (a: number): V3 => {
  const ang = (Math.PI / 2) * a;
  return [RAT_HINGE[0] + RAT_L * Math.cos(ang), RAT_HINGE[1] - RAT_L * Math.sin(ang), RAT_HINGE[2]];
};
const APU_GEN: V3 = [32.6, 1.05, 0];
const GPU_POS: V3 = [-33.5, G, -4.6];

/** Przewody zasilające (od źródła do centrów rozdziału w przedziale awioniki). */
const feeder = (side: number): V3[] => {
  const g = genAt(side);
  return [g, [g[0] + 0.4, g[1] + 0.7, g[2]], [E[0] + 1.4, E[1] + 1.7, side * E[2]], [-4, -1.35, side * 2.2], [-12, -1.9, side * 0.7], [-24, -1.95, side * 0.4], [EBAY[0] + 0.4, EBAY[1] + 0.2, side * 0.25]];
};
const P = {
  gen1: feeder(1),
  gen2: feeder(-1),
  apu: [APU_GEN, [28, 0.2, 0.3], [20, -1.75, 0.35], [-12, -1.95, 0.2], [-24, -2.0, 0.15], [EBAY[0] + 0.4, EBAY[1] + 0.1, 0.1]] as V3[],
  ext: [EXT, [EXT[0], EXT[1] + 0.35, EXT[2]], [EBAY[0] - 0.3, EBAY[1] - 0.2, -0.3], EBAY] as V3[],
  rat: [ratTip(1), [RAT_X + 0.05, RAT_HINGE[1] + 0.1, RAT_Z], [-12, -2.1, -0.6], [-24, -2.05, -0.3], [EBAY[0] + 0.4, EBAY[1], -0.1]] as V3[],
  // rozdział: kokpit, kabina (wzdłuż sufitu), kuchnie, pompy paliwa w skrzydłach, podgrzewane szyby
  cockpit: [EBAY, [-29.5, -0.6, 0], [-31.2, 0.5, 0]] as V3[],
  cabin: [EBAY, [-27, -0.4, 0.6], [-26, 1.9, 0.6], [16, 1.9, 0.6]] as V3[],
  galley: [EBAY, [-26, -1.8, -0.4], [7.4, -1.8, -0.4], [8.6, -0.2, -0.95]] as V3[],
  fuel: [EBAY, [-24, -2.1, 0.5], [-6, -1.8, 1.2], [-4, -1.5, 4.5], [0, -1.4, 9.5]] as V3[],
  ess: [EBAY, [-28.8, -1.2, 0.2], [-30.5, 0.2, 0.3]] as V3[],
};

/* ============================== stan źródeł i szyn ============================== */

type Src = { g1: boolean; g2: boolean; apu: boolean; ext: boolean; rat: boolean; bat: boolean; g1f?: boolean; g2f?: boolean; shed?: boolean };
type Stage = { title: string; color: string; dur: number; text: string };

export const ELEC_STAGES: Record<Exclude<ElecMode, 'home'>, Stage[]> = {
  gpu: [
    { title: 'Samolot bez zasilania', color: '#64748b', dur: 4, text: 'Rano samolot stoi zimny i ciemny: nigdzie nie ma prądu, ekrany są zgaszone. Pierwsze, co robi mechanik, to włączenie akumulatorów.' },
    { title: 'Akumulatory', color: '#38bdf8', dur: 5, text: 'Cztery akumulatory pod kokpitem zasilają tylko najważniejsze urządzenia (przez szyny awaryjne ESS): oświetlenie awaryjne, część ekranów, radio. Starczą najwyżej na kilkadziesiąt minut, więc trzeba szybko podłączyć prawdziwe źródło prądu.' },
    { title: 'Podłączenie GPU', color: '#facc15', dur: 5, text: 'Pod nos podjeżdża wózek z agregatem prądotwórczym (GPU). Mechanik wkłada grubą wtyczkę do gniazda w spodzie kadłuba. A350 ma podwójne gniazdo, bo potrzebuje dużo prądu – tyle, co kilkadziesiąt domów.' },
    { title: 'Zasilanie z płyty', color: '#22c55e', dur: 5, text: 'Pilot wciska w kokpicie przycisk zasilania zewnętrznego (EXT PWR). Prąd z wózka trafia na główne szyny prądu przemiennego AC 1 i AC 2. Przez prostowniki zasilone zostają też szyny prądu stałego DC, a akumulatory zaczynają się ładować.' },
    { title: 'Odbiorniki na ziemi', color: '#a78bfa', dur: 6, text: 'Teraz działa wszystko: światła i wentylacja w kabinie, ekrany i komputery w kokpicie, kuchnie, pompy paliwa przy tankowaniu. Głośne i drogie w użyciu APU może zostać wyłączone.' },
  ],
  apu: [
    { title: 'Rozruch APU', color: '#f59e0b', dur: 5, text: 'Zanim samolot odjedzie od rękawu, piloci uruchamiają APU – mały silnik turbinowy w ogonie. Jego rozrusznik zasila osobny akumulator.' },
    { title: 'Generator APU', color: '#22c55e', dur: 5, text: 'APU napędza swoje generatory. Gdy rozpędzi się do pełnych obrotów, jego prąd przejmuje główne szyny – bez nawet chwilowej przerwy.' },
    { title: 'GPU odłączone', color: '#94a3b8', dur: 5, text: 'Mechanik wyjmuje wtyczkę i odjeżdża wózkiem. Samolot nie potrzebuje już niczego z lotniska: APU daje prąd i sprężone powietrze do klimatyzacji i uruchamiania silników.' },
  ],
  eng: [
    { title: 'Rozruch silników', color: '#f59e0b', dur: 6, text: 'Silniki rozkręca sprężone powietrze z APU. Prąd nadal daje APU.' },
    { title: 'Generatory silników', color: '#22c55e', dur: 6, text: 'Każdy silnik napędza przez skrzynkę kół zębatych dwa generatory. Gdy silniki pracują równo, generatory włączają się do sieci: dwa z lewego silnika zasilają szynę AC 1, dwa z prawego – AC 2.' },
    { title: 'APU wyłączone', color: '#94a3b8', dur: 5, text: 'Cztery generatory silników z zapasem pokrywają całe zapotrzebowanie samolotu. APU zostaje wyłączone – w locie jest tylko zapasowym źródłem prądu.' },
  ],
  dist: [
    { title: 'Szyny AC', color: '#22c55e', dur: 6, text: 'Prąd z generatorów trafia do szaf rozdzielczych pod kokpitem. Główne szyny prądu przemiennego AC 1 i AC 2 zasilają duże urządzenia: kuchnie, wentylatory, elektryczne pompy hydrauliczne, ogrzewanie szyb, pompy paliwa.' },
    { title: 'Prostowniki i szyny DC', color: '#38bdf8', dur: 6, text: 'Prostowniki zamieniają prąd przemienny na stały – taki jak z akumulatora – dla szyn DC 1 i DC 2. Z nich zasilane są komputery, radia, oświetlenie i zawory. Akumulatory są podłączone do szyn DC i przez cały czas się doładowują.' },
    { title: 'Szyny awaryjne ESS', color: '#ef4444', dur: 6, text: 'Najważniejsze urządzenia – ekrany kapitana, sterowanie samolotem, radio, oświetlenie awaryjne – są podłączone do szyn awaryjnych ESS. Te szyny można zasilić niemal z każdego źródła: z dowolnego generatora, z akumulatorów i z turbiny RAT.' },
    { title: 'Utrata generatora', color: '#f59e0b', dur: 7, text: 'Gdy jeden generator się zepsuje, piloci widzą komunikat na ECAM, a sieć sama się przełącza: drugi generator tego silnika przejmuje jego szynę. Jeśli brakuje mocy, komputery wyłączają mniej ważne urządzenia, np. część kuchni i ekrany z filmami.' },
  ],
  rat: [
    { title: 'Lot normalny', color: '#22c55e', dur: 4, text: 'Przelot: cztery generatory silników zasilają wszystkie szyny.' },
    { title: 'Utrata obu silników', color: '#ef4444', dur: 4, text: 'Bardzo rzadka sytuacja: oba silniki gasną, np. po przelocie przez chmurę pyłu wulkanicznego albo po zderzeniu ze stadem ptaków. Generatory przestają się kręcić i główne szyny tracą prąd.' },
    { title: 'Akumulatory przejmują ESS', color: '#38bdf8', dur: 4, text: 'W ułamku sekundy akumulatory zasilają szyny awaryjne. Ekrany kapitana i komputery sterowania działają dalej – ale akumulatory starczą tylko na krótko.' },
    { title: 'RAT się wysuwa', color: '#facc15', dur: 5, text: 'Spod kadłuba automatycznie wysuwa się RAT – mała turbina wiatrowa z dwułopatowym śmigłem. Pilot może ją też wysunąć przyciskiem w kokpicie.' },
    { title: 'RAT zasila szyny ESS', color: '#a3e635', dur: 6, text: 'Pęd powietrza kręci śmigłem, a ono – awaryjnym generatorem. RAT daje prąd dla szyn awaryjnych i napędza pompę hydrauliczną. Wystarcza to, żeby sterować samolotem, mieć ekrany i radio.' },
    { title: 'Szybowanie i lądowanie', color: '#a78bfa', dur: 6, text: 'A350 bez silników szybuje jak szybowiec: z każdego kilometra wysokości przelatuje ok. 15–20 km. Piloci próbują ponownie uruchomić silniki i APU, a samolot kieruje się na najbliższe lotnisko. RAT pracuje aż do zatrzymania na ziemi.' },
  ],
};
const total = (m: Exclude<ElecMode, 'home'>) => ELEC_STAGES[m].reduce((a, s) => a + s.dur, 0);
const stStart = (m: Exclude<ElecMode, 'home'>, i: number) => ELEC_STAGES[m].slice(0, i).reduce((a, s) => a + s.dur, 0);
export function elecStageAt(mode: ElecMode, t: number) {
  if (mode === 'home' || t < 0) return -1;
  let a = 0;
  const st = ELEC_STAGES[mode];
  for (let i = 0; i < st.length; i++) {
    if (t < a + st[i].dur) return i;
    a += st[i].dur;
  }
  return st.length;
}

/** Źródła, GPU, RAT i silniki w chwili t (−1 – przed „Rozpocznij”). */
export function elecState(mode: ElecMode, t: number) {
  const s = elecStageAt(mode, t);
  const at = (i: number) => (mode === 'home' ? 0 : stStart(mode as Exclude<ElecMode, 'home'>, i));
  let src: Src = { g1: false, g2: false, apu: false, ext: false, rat: false, bat: false };
  let gpu = 0; // 0 – brak wózka, 1 – stoi i kabel w gnieździe
  let rat = 0; // wysunięcie RAT
  let ratSpin = 0;
  let n1 = 0;
  let apuOn = false;
  let flight = false;
  if (mode === 'home') {
    src = { g1: false, g2: false, apu: false, ext: true, rat: false, bat: true };
    gpu = 1;
  } else if (mode === 'gpu') {
    const bat = s >= 1;
    gpu = t < 0 ? 0 : sm((t - at(2)) / 3);
    src = { g1: false, g2: false, apu: false, ext: s >= 3, rat: false, bat };
  } else if (mode === 'apu') {
    apuOn = t >= 0;
    gpu = t < 0 ? 1 : 1 - sm((t - at(2) - 1) / 3);
    src = { g1: false, g2: false, apu: s >= 1, ext: s < 1 || t < 0 ? true : s < 2, rat: false, bat: true };
  } else if (mode === 'eng') {
    apuOn = s < 2 || t < 0;
    n1 = t < 0 ? 0 : 21 * sm(t / 5);
    src = { g1: s >= 1, g2: s >= 1, apu: s < 1 || t < 0, ext: false, rat: false, bat: true };
  } else if (mode === 'dist') {
    flight = true;
    n1 = 85;
    const lost = s === 3;
    src = { g1: true, g2: true, apu: false, ext: false, rat: false, bat: true, g2f: lost, shed: lost };
  } else {
    flight = true;
    const out = t >= at(1);
    n1 = out ? 85 - 74 * sm((t - at(1)) / 3) : 85;
    rat = t < 0 ? 0 : sm((t - at(3)) / 2.2);
    ratSpin = rat > 0.6 ? sm((t - at(3) - 1.5) / 2) : 0;
    src = { g1: !out, g2: !out, apu: false, ext: false, rat: s >= 4, bat: true, g1f: out, g2f: out };
  }
  // szyny: AC 1/2 z generatorów, APU albo z płyty (połączenie szyn), AC ESS także z RAT, DC przez prostowniki
  // po utracie jednego generatora szynę przejmuje inne źródło przez połączenie szyn – AC 1 i AC 2 są zasilone,
  // gdy działa którekolwiek główne źródło
  const any = (src.g1 && !src.g1f) || (src.g2 && !src.g2f) || src.apu || src.ext;
  const ac1 = any;
  const ac2 = any;
  const acEss = ac1 || ac2 || src.rat || src.bat;
  const dc1 = ac1;
  const dc2 = ac2;
  const dcEss = dc1 || dc2 || src.rat || src.bat;
  return { src, bus: { ac1, ac2, acEss, dc1, dc2, dcEss }, gpu, rat, ratSpin, n1, apuOn, flight, stage: s };
}

/* ============================== wózek GPU ============================== */

/** Wózek zasilania z płyty (przód w +x): rama z dyszlem, agregat w obudowie z kratkami, panel, bęben z kablem. */
function GpuCart() {
  const y = '#e8b10e';
  return (
    <group>
      <mesh position={[0, G + 0.45, 0]}>
        <boxGeometry args={[2.4, 0.12, 1.3]} />
        <meshStandardMaterial color="#2b3138" roughness={0.7} />
      </mesh>
      <RoundedBox args={[1.9, 1.05, 1.2]} radius={0.08} smoothness={3} position={[-0.1, G + 1.05, 0]}>
        <meshStandardMaterial color={y} roughness={0.45} />
      </RoundedBox>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-0.7 + i * 0.2, G + 1.1, 0.605]}>
          <boxGeometry args={[0.1, 0.55, 0.01]} />
          <meshStandardMaterial color="#1f2329" />
        </mesh>
      ))}
      <mesh position={[0.86, G + 1.15, 0]}>
        <boxGeometry args={[0.02, 0.4, 0.6]} />
        <meshStandardMaterial color="#0b1220" emissive="#22c55e" emissiveIntensity={0.25} />
      </mesh>
      <HazardPlate p={[1.2, G + 0.45, 0]} s={[0.04, 0.12, 1.3]} rep={4} />
      <mesh position={[-1.0, G + 0.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.5, 20]} />
        <meshStandardMaterial color="#1f2329" roughness={0.7} />
      </mesh>
      <StaticBar a={[1.2, G + 0.4, 0]} b={[2.1, G + 0.3, 0]} r={0.03} k="#9ca3af" />
      {[-0.8, 0.8].flatMap((x) => [-0.62, 0.62].map((z) => (
        <group key={`${x}${z}`} position={[x, G + 0.25, z]} rotation={[0, Math.PI / 2, 0]}>
          <GseWheel p={[0, 0, 0]} r={0.25} w={0.16} />
        </group>
      )))}
    </group>
  );
}

/* ============================== RAT ============================== */

/** RAT w owiewce: klapa, ramię wysuwane do pionu, gondola generatora i dwułopatowe śmigło (obraca się z pędu powietrza). */
function Rat({ get }: { get: () => { rat: number; ratSpin: number } }) {
  const arm = useRef<THREE.Mesh>(null);
  const tip = useRef<THREE.Group>(null);
  const prop = useRef<THREE.Group>(null);
  const door = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const s = get();
    const p = ratTip(s.rat);
    if (arm.current) {
      arm.current.visible = s.rat > 0.02;
      placeBetween(arm.current, RAT_HINGE, p);
    }
    if (tip.current) {
      tip.current.visible = s.rat > 0.02;
      tip.current.position.set(...p);
    }
    if (prop.current) prop.current.rotation.x += dt * (2 + 38 * s.ratSpin) * (s.rat > 0.6 ? 1 : 0);
    if (door.current) door.current.rotation.x = -1.3 * sm(s.rat * 3);
  });
  return (
    <group>
      {/* klapa w owiewce (zawias wzdłuż zewnętrznej krawędzi) */}
      <group position={[RAT_X + 0.6, RAT_HINGE[1] - 0.06, RAT_Z - 0.35]}>
        <group ref={door}>
          <mesh position={[0, -0.01, 0.35]}>
            <boxGeometry args={[1.7, 0.02, 0.7]} />
            <meshStandardMaterial color="#d7dce2" roughness={0.4} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </group>
      <mesh ref={arm} visible={false}>
        <boxGeometry args={[0.1, 1, 0.18]} />
        <meshStandardMaterial color="#9aa3ad" metalness={0.5} roughness={0.35} />
      </mesh>
      <group ref={tip} visible={false}>
        {/* gondola generatora z kołpakiem, śmigło z przodu */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.13, 0.42, 6, 16]} />
          <meshStandardMaterial color="#b9c0c8" metalness={0.4} roughness={0.35} />
        </mesh>
        <group ref={prop} position={[-0.38, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.1, 0.22, 16]} />
            <meshStandardMaterial color="#e5e7eb" metalness={0.3} roughness={0.3} />
          </mesh>
          {[0, Math.PI].map((a) => (
            <group key={a} rotation={[a, 0, 0]} position={[0.02, 0, 0]}>
              <mesh position={[0, 0.42, 0]} rotation={[0.35, 0, 0]}>
                <boxGeometry args={[0.04, 0.78, 0.13]} />
                <meshStandardMaterial color="#1f2329" roughness={0.5} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

/* ============================== skrzynki w przedziale awioniki ============================== */

const xray = (c: string, o: number) => <meshBasicMaterial color={c} transparent opacity={o} depthTest={false} depthWrite={false} toneMapped={false} />;
function Ebay({ lit }: { lit: () => boolean }) {
  const glow = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  useFrame(({ clock }) => {
    const on = lit();
    glow.current.forEach((m) => m && (m.opacity = on ? 0.55 + 0.15 * Math.sin(clock.elapsedTime * 3) : 0.2));
  });
  // centra rozdziału (dwie szafy) i cztery akumulatory, prześwietlone przez poszycie
  const boxes: { p: V3; s: V3; c: string }[] = [
    { p: [EBAY[0] - 0.4, EBAY[1] + 0.1, 0.45], s: [0.7, 0.6, 0.5], c: '#22c55e' },
    { p: [EBAY[0] - 0.4, EBAY[1] + 0.1, -0.45], s: [0.7, 0.6, 0.5], c: '#22c55e' },
    ...[-0.45, -0.15, 0.15, 0.45].map((z) => ({ p: [EBAY[0] + 0.55, EBAY[1] - 0.1, z] as V3, s: [0.28, 0.24, 0.24] as V3, c: '#38bdf8' })),
  ];
  return (
    <group>
      {boxes.map((b, i) => (
        <mesh key={i} position={b.p} renderOrder={21}>
          <boxGeometry args={b.s} />
          <meshBasicMaterial ref={(m) => (glow.current[i] = m)} color={b.c} transparent opacity={0.2} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={EXT} renderOrder={21}>
        <boxGeometry args={[0.32, 0.06, 0.24]} />
        {xray('#facc15', 0.8)}
      </mesh>
    </group>
  );
}

/* ============================== podpisy (strona główna) ============================== */

export const ELEC_GROUPS = [
  { id: 'src', name: 'źródła prądu', color: '#a3e635' },
  { id: 'dist', name: 'rozdział', color: '#7dd3fc' },
  { id: 'use', name: 'odbiorniki', color: '#fde68a' },
];
export const ELEC_PART_INFO: Record<string, { name: string; group: string; pos: V3; sub?: boolean; desc: string }> = {
  gen: { name: 'generatory na silniku (2 × ok. 100 kVA)', group: 'src', pos: [genAt(-1)[0], genAt(-1)[1] - 0.35, genAt(-1)[2] - 0.6], desc: 'Każdy silnik napędza przez skrzynkę kół zębatych dwa generatory. Częstotliwość ich prądu zmienia się z obrotami silnika – urządzenia w samolocie są do tego przystosowane, a dzięki temu generator nie potrzebuje skomplikowanej przekładni.' },
  apu: { name: 'generator APU', group: 'src', pos: [APU_GEN[0], APU_GEN[1] + 0.7, -0.6], desc: 'APU w ogonie napędza swój generator. Na ziemi zasila samolot, gdy nie ma wózka GPU, a w locie jest zapasowym źródłem prądu.' },
  ext: { name: 'gniazdo zasilania z płyty', group: 'src', pos: [EXT[0], EXT[1] - 0.3, EXT[2] - 0.3], desc: 'Podwójne gniazdo w spodzie kadłuba pod nosem. Na postoju wkłada się tu wtyczkę z wózka z agregatem (GPU) albo z instalacji przy rękawie – to najtańsze i najcichsze źródło prądu na ziemi.' },
  gpu: { name: 'wózek zasilania (GPU)', group: 'src', pos: [GPU_POS[0], G + 1.9, GPU_POS[2]], desc: 'Lotniskowy agregat prądotwórczy: silnik diesla z generatorem, na wózku z dyszlem. Gruby kabel prowadzi prąd do gniazda pod nosem samolotu.' },
  bat: { name: 'akumulatory litowo-jonowe', group: 'src', pos: [EBAY[0] + 0.55, EBAY[1] - 0.45, -0.7], sub: true, desc: 'Cztery akumulatory pod kokpitem: dwa główne, awaryjny i osobny do uruchamiania APU. Zasilają samolot, gdy „budzi się” rano, kręcą rozrusznikiem APU i podtrzymują najważniejsze urządzenia, gdy zawiodą wszystkie generatory. Są w ognioodpornych obudowach.' },
  rat: { name: 'RAT – turbina awaryjna', group: 'src', pos: [RAT_X, RAT_HINGE[1] - 0.45, RAT_Z - 0.6], desc: 'RAT (z ang. Ram Air Turbine) to mała turbina wiatrowa schowana pod kadłubem. Wysuwa się sama, gdy samolot straci prąd ze wszystkich generatorów. Pęd powietrza kręci jej śmigłem, a ono – awaryjnym generatorem i pompą hydrauliczną. Przy przeglądach sprawdza się, czy wysuwa się poprawnie.' },
  ebay: { name: 'centra rozdziału (przedział awioniki)', group: 'dist', pos: [EBAY[0] - 0.4, EBAY[1] + 0.75, -0.9], desc: 'Pod podłogą kokpitu stoją szafy rozdzielcze i komputery sterujące siecią elektryczną. Decydują, które źródło zasila którą szynę, i same przełączają zasilanie przy awarii.' },
  feeders: { name: 'przewody zasilające', group: 'dist', pos: [-12, -1.6, -1.6], sub: true, desc: 'Grube przewody biegną od generatorów przez pylony, wzdłuż skrzydeł i pod podłogą kabiny do szaf rozdzielczych. Kadłub A350 jest z kompozytu, który słabo przewodzi prąd, więc w kadłubie biegnie osobna sieć przewodów powrotnych i siatka chroniąca przed piorunami.' },
  buses: { name: 'szyny AC, DC i ESS', group: 'dist', pos: [EBAY[0] - 0.4, EBAY[1] - 0.6, 0.9], sub: true, desc: 'Szyny to główne linie zasilające. Szyny AC (prąd przemienny) zasilają duże urządzenia, szyny DC (prąd stały, jak z akumulatora) – elektronikę. Najważniejsze urządzenia są na szynach awaryjnych ESS, które można zasilić niemal z każdego źródła – nawet z akumulatorów i z turbiny RAT.' },
  galley: { name: 'kuchnie i kabina', group: 'use', pos: [8.6, 0.6, -1.4], sub: true, desc: 'Kuchnie (piekarniki, ekspresy, chłodziarki), oświetlenie kabiny i rozrywka pokładowa to największe odbiorniki w kabinie. Przy niedoborze mocy wyłączają się jako pierwsze.' },
  windshield: { name: 'podgrzewane szyby i czujniki', group: 'use', pos: [-31.4, 0.9, -1.6], sub: true, desc: 'Szyby kokpitu i czujniki prędkości i kąta natarcia są ogrzewane prądem – lód na nich byłby groźny. W A350 na prąd działają też zapasowe pompy hydrauliczne i część siłowników sterów.' },
};

function ElecLabels({ sel, onSelect }: { sel: string | null; onSelect: (id: string | null) => void }) {
  const col = (g: string) => ELEC_GROUPS.find((x) => x.id === g)?.color ?? '#e2e8f0';
  return (
    <>
      {Object.entries(ELEC_PART_INFO).map(([id, p]) => {
        const on = sel === id;
        return (
          <Lbl key={id} pos={p.pos} sub={p.sub} color={on ? '#ffffff' : col(p.group)} active={on} onClick={() => onSelect(on ? null : id)}>
            {p.name}
          </Lbl>
        );
      })}
    </>
  );
}

/* ============================== kamera, zegar, scena ============================== */

const VIEWS: Record<Exclude<ElecMode, 'home'>, { cam: V3; tgt: V3 }[]> = {
  gpu: [
    { cam: [-44, 2, -22], tgt: [-28, -3, -1] },
    { cam: [-25.5, -3.2, -6.5], tgt: [-28.6, -2.2, 0] },
    { cam: [-38, -3.5, -12], tgt: [-31.5, -4.8, -2.5] },
    { cam: [-24, -3, -9], tgt: [-28.5, -2.4, -0.5] },
    { cam: [-48, 10, -34], tgt: [-12, -1.5, 0] },
    { cam: [-48, 10, -34], tgt: [-12, -1.5, 0] },
  ],
  apu: [
    { cam: [44, 4, -18], tgt: [32, 0.8, 0] },
    { cam: [12, 5, -22], tgt: [5, -1.5, 0] },
    { cam: [-40, -2, -16], tgt: [-31.5, -4.5, -2.5] },
    { cam: [-10, 22, -48], tgt: [0, -1, 0] },
  ],
  eng: [
    { cam: [E[0] - 9, E[1] + 2, -E[2] - 10], tgt: [E[0] + 1, E[1], -E[2]] },
    { cam: [E[0] - 2, E[1] - 1.5, -E[2] - 5.5], tgt: [genAt(-1)[0], genAt(-1)[1], genAt(-1)[2]] },
    { cam: [-14, 14, -40], tgt: [-6, -1.5, 0] },
    { cam: [-14, 14, -40], tgt: [-6, -1.5, 0] },
  ],
  dist: [
    { cam: [-22, 1, -9], tgt: [-28.6, -2.1, 0] },
    { cam: [-24, -2.5, -6], tgt: [-28.6, -2.2, 0] },
    { cam: [-26, 0.5, -6.5], tgt: [-30, -0.6, 0] },
    { cam: [-4, 14, -34], tgt: [-6, -1.2, 0] },
    { cam: [-4, 14, -34], tgt: [-6, -1.2, 0] },
  ],
  rat: [
    { cam: [-20, 6, -36], tgt: [-6, -1, 0] },
    { cam: [E[0] - 8, E[1] + 1, -E[2] - 9], tgt: [E[0] + 1, E[1], -E[2]] },
    { cam: [-24, -1, -7], tgt: [-28.6, -2.2, 0] },
    { cam: [RAT_X + 4.5, RAT_HINGE[1] - 1.2, RAT_Z - 5], tgt: [RAT_X + 0.4, RAT_HINGE[1] - 0.6, RAT_Z] },
    { cam: [RAT_X - 2.4, RAT_HINGE[1] - 1.9, RAT_Z - 2.4], tgt: [RAT_X + 0.2, RAT_HINGE[1] - 1.25, RAT_Z] },
    { cam: [-30, -6, -28], tgt: [-8, -3, 0] },
    { cam: [-30, -6, -28], tgt: [-8, -3, 0] },
  ],
};

export function useElecDriver(mode: ElecMode | null, params: Params) {
  const st = useRef({ t: 0, key: '' });
  // obroty silników dla modelu samolotu – obiekt zmieniany co klatkę (silnik czyta go w swojej pętli)
  const power = useRef({ n1: 0, rev: 0 });
  const getT = () => (mode && mode !== 'home' && params.run ? st.current.t : -1);
  useFrame((_, dt) => {
    if (!mode) return;
    const run = Boolean(params.run);
    const key = `${mode}|${run}`;
    if (key !== st.current.key) Object.assign(st.current, { key, t: 0 });
    if (run && mode !== 'home') st.current.t = Math.min(total(mode) + 30, st.current.t + Math.min(0.05, dt));
    power.current.n1 = elecState(mode, getT()).n1;
  });
  return { getT, getStage: () => (mode ? elecStageAt(mode, getT()) : -1), mode, state: () => elecState(mode ?? 'home', getT()), power: power.current };
}

/** Strugi prądu: przewód świeci i ma płynące kropki, gdy dane źródło (albo rozdział) jest aktywne. */
function Flow({ path, color, on, speed = 3, count = 30 }: { path: V3[]; color: string; on: boolean; speed?: number; count?: number }) {
  if (!on) return null;
  return (
    <XRay on>
      <PathStreaks paths={[path]} count={count} color={color} speed={speed} trail={0.6} width={0.06} opacity={0.9} />
    </XRay>
  );
}

export function ElecScene({ sim, sel, onSelect }: { sim: ReturnType<typeof useElecDriver>; sel: string | null; onSelect: (id: string | null) => void }) {
  const mode = sim.mode!;
  const stage = useStage(sim.getStage);
  // migawka stanu do strug (przerysowanie przy zmianie etapu; źródła zmieniają się na granicach etapów)
  const s = useMemo(() => sim.state(), [stage, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = mode === 'home' || stage < 0 ? null : VIEWS[mode][Math.min(stage, VIEWS[mode].length - 1)];
  const cart = useRef<THREE.Group>(null);
  const cable = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const st = sim.state();
    // wózek dojeżdża (gpu) albo odjeżdża (apu); kabel tylko, gdy wózek stoi przy samolocie
    const k = st.gpu;
    if (cart.current) {
      cart.current.visible = k > 0.01;
      cart.current.position.set(GPU_POS[0] - 18 * (1 - k), 0, GPU_POS[2] - 6 * (1 - k));
    }
    if (cable.current) {
      cable.current.visible = k > 0.98;
      placeBetween(cable.current, [GPU_POS[0] + 0.9, G + 1.3, GPU_POS[2] + 0.4], [EXT[0], EXT[1] - 0.05, EXT[2]]);
    }
  });
  const ground = !s.flight;
  const busOn = s.bus.ac1 || s.bus.ac2;
  return (
    <group>
      {mode !== 'home' && <StageCamera view={view} />}
      {ground && <CargoStand />}
      <group ref={cart}>
        <GpuCart />
      </group>
      <mesh ref={cable} visible={false}>
        <cylinderGeometry args={[0.035, 0.035, 1, 10]} />
        <meshStandardMaterial color="#111317" roughness={0.6} />
      </mesh>
      <Rat get={() => sim.state()} />
      <Ebay lit={() => sim.state().bus.dcEss} />
      {/* przewody od źródeł */}
      <Flow path={P.gen1} color="#a3e635" on={s.src.g1 && !s.src.g1f} />
      <Flow path={P.gen2} color="#a3e635" on={s.src.g2 && !s.src.g2f} />
      <Flow path={P.apu} color="#f59e0b" on={s.src.apu} />
      <Flow path={P.ext} color="#facc15" on={s.src.ext} speed={2} count={16} />
      <Flow path={P.rat} color="#ef4444" on={s.src.rat} speed={2} count={20} />
      {/* rozdział do odbiorników */}
      <Flow path={P.cockpit} color="#38bdf8" on={s.bus.dcEss} speed={1.5} count={10} />
      <Flow path={P.ess} color="#ef4444" on={s.bus.acEss && !busOn} speed={1.5} count={10} />
      <Flow path={P.cabin} color="#7dd3fc" on={busOn} speed={3} count={50} />
      <Flow path={P.galley} color="#fde68a" on={busOn && !s.src.shed} speed={3} count={30} />
      <Flow path={P.fuel} color="#7dd3fc" on={busOn} speed={3} count={30} />
      {mode === 'home' && <ElecLabels sel={sel} onSelect={onSelect} />}
    </group>
  );
}

/* ============================== ECAM ELEC i ramka ============================== */

/** Strona ELEC na ECAM ze stanu sieci (te same źródła i szyny co w scenie). */
export function ElecEcam({ st }: { st: ReturnType<typeof elecState> }) {
  const S = st.src;
  const n1 = st.n1;
  return (
    <Ecam
      thrMode={null}
      n1={[n1, n1]}
      egt={n1 > 1 ? [380 + 4 * n1, 384 + 4 * n1] : [30, 30]}
      page="ELEC"
      elec={{
        gen: [S.g1, S.g1, S.g2, S.g2],
        // utrata jednego generatora (szyny) – tylko GEN 2A; utrata silników – wszystkie cztery
        genFault: S.shed ? [false, false, true, false] : [Boolean(S.g1f), Boolean(S.g1f), Boolean(S.g2f), Boolean(S.g2f)],
        apu: S.apu,
        ext: S.ext,
        rat: S.rat,
        bat: S.bat,
        bus: st.bus,
        shed: S.shed,
      }}
      footer={{ tat: st.flight ? -30 : 15, sat: st.flight ? -56 : 15, isa: 0, flt: st.flight ? '05:12' : '--:--', gw: 290000, gwcg: 29.5, fob: 72000 }}
      width={260}
    />
  );
}

/** Dla doku kokpitu: to ekran ECAM (stoi pod PFD i ND, nie wśród przełączników). */
(ElecEcam as unknown as { cockpitSlot: string }).cockpitSlot = 'ecam';

export function ElecLab({ sim, sel }: { sim: ReturnType<typeof useElecDriver>; sel: string | null }) {
  const [, set] = useState(0);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 0.2) {
      acc.current = 0;
      set((k) => (k + 1) % 1e6);
    }
  });
  const mode = sim.mode!;
  const st = sim.state();
  if (mode === 'home') {
    const info = sel ? ELEC_PART_INFO[sel] : null;
    const g = info ? ELEC_GROUPS.find((x) => x.id === info.group) : undefined;
    return (
      <>
      <CockpitDock>
        <ElecEcam st={st} />
      </CockpitDock>
      <InfoPortal>
        {info ? (
          <>
            <div style={{ fontWeight: 700, color: g?.color }}>{info.name}</div>
            {g && <div style={{ fontSize: 12, opacity: 0.7 }}>{g.name}</div>}
            <div>{info.desc}</div>
          </>
        ) : (
          <div>Samolot stoi na płycie zasilany z GPU. Kliknij podpis, aby przeczytać o źródłach prądu, jego rozdziale i odbiornikach. Na ECAM (w rogu) strona ELEC pokazuje źródła i szyny jak w kokpicie: zielone – zasilone.</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
          {ELEC_GROUPS.map((gr) => (
            <span key={gr.id} style={{ color: gr.color }}>
              {gr.name}
            </span>
          ))}
        </div>
      </InfoPortal>
      </>
    );
  }
  const stages = ELEC_STAGES[mode];
  const s = sim.getStage();
  const cur = s >= 0 && s < stages.length ? stages[s] : null;
  return (
    <>
    <CockpitDock>
      <ElecEcam st={st} />
    </CockpitDock>
    <InfoPortal>
      {cur ? (
        <>
          <div style={{ fontWeight: 700, color: cur.color }}>
            {s + 1}/{stages.length} · {cur.title}
          </div>
          <div style={{ fontSize: 13 }}>{cur.text}</div>
        </>
      ) : (
        <div style={{ fontWeight: 700, color: '#7dd3fc' }}>{s < 0 ? 'Naciśnij „Rozpocznij”' : 'Koniec – możesz obrócić widok'}</div>
      )}
      <div style={{ display: 'grid', gap: 2, fontSize: 12 }}>
        {stages.map((a, i) => (
          <div key={a.title} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: s < 0 || i <= s ? 1 : 0.4, fontWeight: i === s ? 700 : 400 }}>
            <span style={{ width: 9, height: 9, borderRadius: 9, background: a.color, flex: 'none' }} />
            {i + 1}. {a.title}
          </div>
        ))}
      </div>
    </InfoPortal>
    </>
  );
}
