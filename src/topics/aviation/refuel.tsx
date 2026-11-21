/*
 * Paliwo – od cysterny do dysz w komorze spalania (moduł silnika, strona 1). Samolot stoi na tym samym stanowisku co
 * przy załadunku (CargoStand: lotnisko, kliny, pachołki, linie na płycie), cysterna podjeżdża pod prawe skrzydło,
 * podnosi platformę z wężem i tankuje pod ciśnieniem przez złącze w spodzie skrzydła. Paliwo wypełnia zbiorniki –
 * ten sam komponent co w zakładce „Masa i wyważenie” (FuelTanks) – najpierw skrzydła, potem centralny. Potem droga
 * paliwa do silnika: pompy w zbiorniku, przewód wzdłuż tylnego dźwigara, pylon, regulator (HMU) i kolektor dysz.
 * Scenariusz etap po etapie, jak instalacje kabiny (StagedFlows, StageCamera).
 */
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Params } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { CockpitDock, Ecam } from '../../components/cockpit';
import { RoundedBox } from '@react-three/drei';
import { CargoStand, GseWheel, HazardPlate, PLANE_LEVELS, StaticBar, engineOrigin, placeBetween, wingSurface } from './airliner';
import { StageCamera } from './airSystem';
import { StagedFlows, useStage, type Group } from './cabinSystems';
import { FuelTanks, TANK, fuelSplit } from './fuelTanks';

type V3 = [number, number, number];
const G = PLANE_LEVELS.ground;
const sm = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

/* ============================== etapy ============================== */

export const REFUEL_STAGES: { title: string; color: string; text: string; dur: number }[] = [
  {
    title: 'Skąd się bierze paliwo',
    color: '#f5b041',
    dur: 9,
    text: 'Samoloty odrzutowe spalają naftę lotniczą (oznaczenie Jet A-1), produkowaną w rafinerii. Rurociągiem albo cysternami kolejowymi trafia ona do magazynu paliw na lotnisku – wielkich zbiorników, w których paliwo odstaje i przechodzi przez filtry, a laboratorium sprawdza każdą dostawę. Do samolotu przywozi je cysterna albo pojazd podłączany do rurociągu ukrytego pod płytą lotniska.',
  },
  {
    title: 'Podłączenie',
    color: '#94a3b8',
    dur: 7,
    text: 'Cysterna staje przy skrzydle. Mechanik najpierw łączy ją z samolotem przewodem uziemiającym – to wyrównuje ładunki elektryczne, żeby iskra nie zapaliła oparów paliwa. Potem podnosi platformę i przykręca wąż do złącza w spodzie skrzydła. Na panelu ustawia, ile paliwa ma trafić do samolotu.',
  },
  {
    title: 'Tankowanie pod ciśnieniem',
    color: '#fb923c',
    dur: 14,
    text: 'Pompa cysterny tłoczy paliwo pod ciśnieniem – nawet 2000–3000 litrów na minutę, czyli kilka wanien na sekundę. W skrzydle paliwo płynie rurą wzdłuż przedniej krawędzi i przez zawory do zbiorników. Wypierane powietrze uchodzi przez mały zbiornik odpowietrzający przy końcu skrzydła.',
  },
  {
    title: 'Najpierw skrzydła, potem centralny',
    color: '#facc15',
    dur: 10,
    text: 'Komputer napełnia najpierw zbiorniki w skrzydłach, a dopiero potem zbiornik środkowy pod kadłubem. Paliwo w skrzydłach odciąża je w locie: jego ciężar ciągnie skrzydło w dół, a siła nośna – w górę. Pełne zbiorniki A350-1000 to ok. 159 000 litrów, czyli ok. 125 ton. Gdy zbiornik jest pełny, czujnik sam zamyka jego zawór.',
  },
  {
    title: 'Odłączenie',
    color: '#94a3b8',
    dur: 7,
    text: 'Gdy do samolotu trafi zamówiona ilość, komputer zamyka zawory. Mechanik odkręca wąż, opuszcza platformę i odłącza przewód uziemiający. Pilot sprawdza na ekranie paliwa (strona FUEL) w kokpicie, czy wszystko się zgadza. Cysterna odjeżdża.',
  },
  {
    title: 'Pompy w zbiorniku',
    color: '#22c55e',
    dur: 9,
    text: 'Silnik nie zasysa paliwa sam. Na dnie każdego zbiornika w skrzydle pracują elektryczne pompy zanurzone w paliwie (główne i zapasowa). Tłoczą je do zaworu odcinającego przy pylonie, a stamtąd rurą przez pylon do silnika. Zawór zamyka dopływ, gdy pilot wyłączy silnik albo użyje wyłącznika pożarowego. Drogę paliwa widać na przekroju lewego silnika – tym samym, który pojawia się w dalszych zakładkach.',
  },
  {
    title: 'W silniku: od pompy do dysz',
    color: '#ef4444',
    dur: 10,
    text: 'W silniku paliwo najpierw chłodzi olej w wymienniku ciepła, przechodzi przez filtr i trafia do pompy wysokiego ciśnienia. Regulator, którym steruje komputer silnika, odmierza dokładnie tyle paliwa, ile potrzeba do ustawionego ciągu. Pierścieniowa rura wokół komory spalania rozprowadza je do ok. 20 dysz, które rozpylają je w mgiełkę – i tam się ono spala.',
  },
];
const STARTS = REFUEL_STAGES.reduce<number[]>((a, s, i) => [...a, i ? a[i - 1] + REFUEL_STAGES[i - 1].dur : 0], []);
const T_END = STARTS[STARTS.length - 1] + REFUEL_STAGES[REFUEL_STAGES.length - 1].dur;
const stageAt = (t: number) => (t < 0 ? -1 : t >= T_END ? REFUEL_STAGES.length : STARTS.filter((s) => s <= t).length - 1);

/* ============================== układ (prawe skrzydło, z < 0) ============================== */

/** Punkt w kesonie prawego skrzydła: stacja r, ułamek cięciwy s, wysokość t (0 – dno, 1 – góra). */
const wr = (r: number, s: number, t: number): V3 => {
  const lo = wingSurface(r, s, -1);
  const hi = wingSurface(r, s, 1);
  return [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, -(lo[2] + (hi[2] - lo[2]) * t)];
};
const R_CPL = 16;
const LAY = (() => {
  const cpl: V3 = (() => {
    const p = wingSurface(R_CPL, 0.3, -1);
    return [p[0], p[1] - 0.02, -p[2]];
  })();
  const le = wingSurface(R_CPL + 0.8, 0.0, -1);
  // cysterna jedzie wzdłuż x na zewnątrz od silnika; przód staje przed krawędzią natarcia
  const lane = cpl[2] - 1.2;
  const stopX = le[0] - 2.2; // środek ciężarówki (przód ok. 4,6 m przed środkiem)
  const truckFront = stopX + 4.4;
  // pokład platformy ok. 1,6 m pod złączem: barierki (1 m) zostają ok. 0,6 m pod spodem skrzydła, wąż idzie skośnie w górę
  const platTop: V3 = [truckFront - 0.6, cpl[1] - 1.6, lane + 0.6];
  // paliwo: zbiornik cysterny → pompa → platforma → wąż → złącze → galeria tankowania → zbiorniki
  const truckFlow: V3[] = [
    [stopX - 1.5, G + 1.2, lane],
    [stopX + 2.6, G + 0.9, lane],
    [truckFront - 0.6, G + 1.3, lane + 0.6],
    platTop,
    cpl,
  ];
  const gal = (r: number) => wr(r, 0.2, 0.25);
  const refuelIn: V3[][] = [
    [cpl, wr(R_CPL, 0.3, 0.3), gal(R_CPL), gal(12), gal(8), gal(4), wr(3.4, 0.2, 0.25)],
    [gal(R_CPL), gal(20), gal(24)],
  ];
  // odpowietrzenie: powietrze ze zbiorników do zbiornika przy końcówce i na zewnątrz wlotem NACA
  const vent: V3[] = [wr(8, 0.45, 0.85), wr(16, 0.45, 0.85), wr(25.5, 0.45, 0.8), wr(26.5, 0.45, 0.1), (() => {
    const p = wingSurface(26.5, 0.45, -1);
    return [p[0] + 0.4, p[1] - 0.25, -p[2]] as V3;
  })()];
  const E = engineOrigin();
  return { cpl, lane, stopX, truckFront, platTop, truckFlow, refuelIn, vent, El: E };
})();

const VIEWS: { cam: V3; tgt: V3 }[] = [
  { cam: [LAY.stopX - 34, 7, LAY.lane - 30], tgt: [LAY.stopX - 4, G + 1.5, LAY.lane + 2] }, // płyta i nadjeżdżająca cysterna
  { cam: [LAY.cpl[0] - 7.5, G + 2.8, LAY.cpl[2] - 7], tgt: [LAY.cpl[0] - 1.5, LAY.cpl[1] - 0.8, LAY.cpl[2]] }, // platforma i złącze
  { cam: [LAY.cpl[0] - 12, 9, LAY.cpl[2] - 22], tgt: [LAY.cpl[0] - 1, -2.6, LAY.cpl[2] + 6] }, // galeria i zbiornik w skrzydle
  { cam: [-14, 32, -46], tgt: [-2, -2, -2] }, // wszystkie zbiorniki z góry
  { cam: [LAY.stopX - 30, 5, LAY.lane - 26], tgt: [LAY.stopX - 12, G + 1, LAY.lane] }, // odjazd cysterny
  // droga paliwa do silnika – na przekroju lewego silnika (ten sam model i układ paliwowy co w module silnika)
  { cam: [LAY.El[0] - 6.5, LAY.El[1] + 3.6, LAY.El[2] + 8.5], tgt: [LAY.El[0] + 1.2, LAY.El[1] + 1.4, LAY.El[2]] }, // pompy, zawór LP, pylon
  { cam: [LAY.El[0] - 2.5, LAY.El[1] + 1.4, LAY.El[2] + 6.5], tgt: [LAY.El[0] + 1.4, LAY.El[1] + 0.3, LAY.El[2]] }, // w silniku
  { cam: [LAY.El[0] - 16, LAY.El[1] + 9, LAY.El[2] + 20], tgt: [LAY.El[0] + 2, LAY.El[1] + 0.8, LAY.El[2] - 2] }, // całość: lewy silnik w przekroju i zbiorniki
];

/* ============================== stan scenariusza ============================== */

/** Ilość paliwa (kg), położenie cysterny i platformy w chwili t (−1 – przed „Rozpocznij”). */
export function refuelState(t: number) {
  const [, s1, s2, s3, s4] = STARTS;
  const F0 = 15000;
  const FW = 2 * TANK.wingMax;
  const FT = 110000;
  const fuel = t < s2 ? F0 : t < s3 ? F0 + (FW - F0) * sm((t - s2) / REFUEL_STAGES[2].dur) : t < s4 ? FW + (FT - FW) * sm((t - s3) / REFUEL_STAGES[3].dur) : FT;
  // cysterna: dojazd w etapie 1 (−1 → stoi daleko), odjazd w etapie 5
  const arrive = t < 0 ? 0 : sm(t / (REFUEL_STAGES[0].dur - 1));
  const leave = t < s4 + 3 ? 0 : sm((t - s4 - 3) / 4);
  const truckX = LAY.stopX - 70 * (1 - arrive) + 80 * leave * leave;
  // platforma: w górę w etapie 2, w dół w etapie 5; wąż podłączony od połowy etapu 2 do początku odjazdu
  const plat = t < s1 ? 0 : sm((t - s1) / 3) * (1 - sm((t - s4) / 2.5));
  const hose = t >= s1 + 3.5 && t < s4 + 0.5;
  const ff = t >= STARTS[5] ? (t < STARTS[6] ? 300 : 1100) : 0; // przepływ do silników (kg/h) – pokazowo
  return { fuel, truckX, plat, hose, ff, stage: stageAt(t) };
}

/** Zegar strony: czas od „Rozpocznij”, etap. */
export function useRefuelDriver(on: boolean, params: Params) {
  const st = useRef({ t: 0, key: '' });
  useFrame((_, dt) => {
    if (!on) return;
    const run = Boolean(params.run);
    const key = String(run);
    if (key !== st.current.key) Object.assign(st.current, { key, t: 0 });
    if (run) st.current.t = Math.min(T_END + 30, st.current.t + Math.min(0.05, dt));
  });
  const getT = () => (params.run ? st.current.t : -1);
  return { getT, getStage: () => stageAt(getT()) };
}

/* ============================== cysterna ============================== */

/**
 * Cysterna lotniskowa (przód w +x), z tych samych części co reszta sprzętu na płycie (koła GSE, pasy ostrzegawcze,
 * pręty): rama z poprzeczkami i osłonami bocznymi, kabina z zaokrąglonymi krawędziami (szyba panoramiczna,
 * wycieraczki, osłona przeciwsłoneczna, lusterka na wysięgnikach, kratka, reflektory, belka świateł ostrzegawczych),
 * eliptyczny zbiornik z wypukłymi dnami na siodłach, pomost z barierkami, włazy, drabinka, tabliczki JET A-1 i UN,
 * filtr-separator za kabiną, tylna szafa z żaluzjami, licznikiem i zwijadłem węża, koła bliźniacze z błotnikami
 * i chlapaczami, osłona przeciwnajazdowa, z przodu nad kabiną podnoszona platforma z barierkami (do skrzydła).
 */
function FuelTruck({ plat }: { plat: () => number }) {
  const platRef = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Mesh | null)[]>([]);
  const lift = LAY.platTop[1] - (G + 2.75);
  useFrame(() => {
    const k = plat();
    if (platRef.current) platRef.current.position.y = G + 2.75 + lift * k;
    legs.current.forEach((m, i) => {
      if (!m) return;
      const h = 0.25 + lift * k;
      m.position.set(3.4 + (i % 2 ? 0.55 : -0.55), G + 2.62 + h / 2 - 0.12, 0.6);
      m.scale.y = h;
    });
  });
  const white = '#eef0f2';
  const orange = '#e0701a';
  const dark = '#2b3138';
  const tank = useMemo(() => {
    const g = new THREE.CylinderGeometry(1.0, 1.0, 5.6, 40, 1, true);
    g.rotateZ(Math.PI / 2);
    g.scale(1, 1.02, 1.18);
    return g;
  }, []);
  const head = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    g.rotateZ(-Math.PI / 2);
    g.scale(0.32, 1.02, 1.18);
    return g;
  }, []);
  const label = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#111827';
    x.font = 'bold 40px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('JET A-1', 128, 34);
    return new THREE.CanvasTexture(c);
  }, []);
  const un = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 96;
    const x = c.getContext('2d')!;
    x.fillStyle = '#f97316';
    x.fillRect(0, 0, 128, 96);
    x.strokeStyle = '#111';
    x.lineWidth = 6;
    x.strokeRect(3, 3, 122, 90);
    x.beginPath();
    x.moveTo(3, 48);
    x.lineTo(125, 48);
    x.stroke();
    x.fillStyle = '#111';
    x.font = 'bold 30px sans-serif';
    x.textAlign = 'center';
    x.fillText('30', 64, 36);
    x.fillText('1863', 64, 82);
    return new THREE.CanvasTexture(c);
  }, []);
  const S = (p: V3, s: V3, c: string, rough = 0.5, metal = 0.1) => (
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={rough} metalness={metal} />
    </mesh>
  );
  return (
    <group>
      {/* rama: podłużnice, poprzeczki, osłony boczne z odblaskami, osłona przeciwnajazdowa */}
      {[-0.45, 0.45].map((z) => (
        <group key={z}>{S([0, G + 0.78, z], [9.6, 0.22, 0.14], dark, 0.7)}</group>
      ))}
      {[-4.4, -2.6, -0.6, 1.4, 3.2].map((x) => (
        <group key={x}>{S([x, G + 0.78, 0], [0.12, 0.16, 0.9], dark, 0.7)}</group>
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          {S([0.6, G + 0.62, s * 1.12], [3.4, 0.28, 0.04], '#c9ced4', 0.6)}
          <HazardPlate p={[0.6, G + 0.5, s * 1.145]} s={[3.4, 0.05, 0.01]} rep={10} />
        </group>
      ))}
      <HazardPlate p={[-4.85, G + 0.55, 0]} s={[0.06, 0.18, 2.3]} rep={6} />
      {S([-4.8, G + 0.75, 0], [0.12, 0.3, 0.12], dark)}
      {/* kabina: zaokrąglona bryła, panoramiczna szyba z ramką, boczne szyby, drzwi, kratka, reflektory */}
      <RoundedBox args={[1.75, 1.95, 2.45]} radius={0.16} smoothness={3} position={[4.15, G + 1.88, 0]}>
        <meshStandardMaterial color={white} roughness={0.35} metalness={0.1} />
      </RoundedBox>
      {S([5.03, G + 2.25, 0], [0.04, 0.85, 2.15], '#16202b', 0.08, 0.6)}
      {S([5.0, G + 1.8, 0], [0.06, 0.05, 2.2], '#111317')}
      {S([5.0, G + 2.72, 0], [0.12, 0.1, 2.3], '#111317')}
      {[-0.5, 0.5].map((z) => (
        <mesh key={`w${z}`} position={[5.06, G + 1.98, z]} rotation={[0.9, 0, 0]}>
          <boxGeometry args={[0.02, 0.6, 0.03]} />
          <meshStandardMaterial color="#111317" />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={`s${s}`}>
          {S([4.05, G + 2.25, s * 1.235], [1.2, 0.7, 0.02], '#16202b', 0.08, 0.6)}
          {S([4.15, G + 1.75, s * 1.235], [0.02, 1.0, 0.02], '#9aa3ad')}
          {S([4.6, G + 1.6, s * 1.24], [0.14, 0.04, 0.03], dark)}
          {/* lusterko na wysięgniku */}
          <StaticBar a={[4.95, G + 2.45, s * 1.15]} b={[5.15, G + 2.35, s * 1.45]} r={0.015} k="#2b3138" />
          {S([5.15, G + 2.2, s * 1.48], [0.05, 0.36, 0.18], '#111317')}
        </group>
      ))}
      {S([4.15, G + 1.08, 0], [1.78, 0.2, 2.47], orange)}
      {Array.from({ length: 5 }, (_, i) => (
        <group key={`g${i}`}>{S([5.03, G + 1.25 + i * 0.08, 0], [0.02, 0.035, 1.0], '#1f2329')}</group>
      ))}
      {[-0.82, 0.82].map((z) => (
        <group key={`h${z}`}>
          <mesh position={[5.04, G + 1.35, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.11, 0.11, 0.04, 16]} />
            <meshStandardMaterial color="#fffbe8" emissive="#fff4c2" emissiveIntensity={0.7} />
          </mesh>
          {S([5.04, G + 1.18, z], [0.03, 0.06, 0.2], '#f59e0b')}
        </group>
      ))}
      {S([5.12, G + 0.9, 0], [0.12, 0.2, 2.4], '#1f2329')}
      {/* belka świateł ostrzegawczych na dachu */}
      {S([4.0, G + 2.92, 0], [0.25, 0.08, 1.4], dark)}
      {[-0.5, 0.5].map((z) => (
        <mesh key={`b${z}`} position={[4.0, G + 3.02, z]}>
          <cylinderGeometry args={[0.08, 0.09, 0.14, 14]} />
          <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={1.3} />
        </mesh>
      ))}
      {/* filtr-separator za kabiną */}
      <mesh position={[3.0, G + 1.75, -0.75]}>
        <cylinderGeometry args={[0.3, 0.3, 1.5, 24]} />
        <meshStandardMaterial color="#c9ced4" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[3.0, G + 2.55, -0.75]}>
        <sphereGeometry args={[0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c9ced4" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* zbiornik na siodłach: płaszcz, wypukłe dna, pas w kolorze firmy, pomost, włazy, barierki, drabinka */}
      {[-2.4, 0, 2.2].map((x) => (
        <group key={`sd${x}`}>{S([x - 0.3, G + 1.02, 0], [0.25, 0.32, 1.6], dark, 0.7)}</group>
      ))}
      <mesh geometry={tank} position={[-0.3, G + 2.05, 0]}>
        <meshStandardMaterial color={white} metalness={0.25} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={head} position={[2.5, G + 2.05, 0]}>
        <meshStandardMaterial color={white} metalness={0.25} roughness={0.3} />
      </mesh>
      <mesh geometry={head} position={[-3.1, G + 2.05, 0]} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial color={white} metalness={0.25} roughness={0.3} />
      </mesh>
      <mesh position={[-0.3, G + 2.05, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1.01, 1, 1.19]}>
        <cylinderGeometry args={[1.0, 1.0, 5.5, 40, 1, true, Math.PI / 2 - 0.3, 0.6]} />
        <meshStandardMaterial color={orange} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.3, G + 2.05, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1.01, 1, 1.19]}>
        <cylinderGeometry args={[1.0, 1.0, 5.5, 40, 1, true, (3 * Math.PI) / 2 - 0.3, 0.6]} />
        <meshStandardMaterial color={orange} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={`l${s}`}>
          <mesh position={[-0.6, G + 2.45, s * 1.19]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
            <planeGeometry args={[1.4, 0.35]} />
            <meshStandardMaterial map={label} roughness={0.5} />
          </mesh>
          <mesh position={[-3.0, G + 1.4, s * 1.19]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
            <planeGeometry args={[0.4, 0.3]} />
            <meshStandardMaterial map={un} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {S([-0.3, G + 3.08, 0], [5.0, 0.04, 0.6], '#9ca3af', 0.4, 0.5)}
      {[-2.2, -0.3, 1.6].map((x) => (
        <mesh key={`m${x}`} position={[x, G + 3.12, -0.15]}>
          <cylinderGeometry args={[0.24, 0.24, 0.08, 18]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      {[-2.7, -1.0, 0.7, 2.1].map((x) => (
        <group key={`r${x}`}>
          <StaticBar a={[x, G + 3.1, 0.3]} b={[x, G + 3.6, 0.3]} r={0.018} k="#e8b10e" />
        </group>
      ))}
      <StaticBar a={[-2.7, G + 3.6, 0.3]} b={[2.1, G + 3.6, 0.3]} r={0.02} k="#e8b10e" />
      <StaticBar a={[-3.45, G + 0.95, 0.5]} b={[-3.3, G + 3.1, 0.5]} r={0.02} k="#9ca3af" />
      <StaticBar a={[-3.45, G + 0.95, 0.2]} b={[-3.3, G + 3.1, 0.2]} r={0.02} k="#9ca3af" />
      {Array.from({ length: 6 }, (_, i) => (
        <StaticBar key={`d${i}`} a={[-3.43 + i * 0.025, G + 1.2 + i * 0.35, 0.2]} b={[-3.43 + i * 0.025, G + 1.2 + i * 0.35, 0.5]} r={0.015} k="#9ca3af" />
      ))}
      {/* tylna szafa: żaluzje, licznik, zwijadło węża z nawiniętym wężem */}
      {S([-4.0, G + 1.55, 0], [1.1, 1.3, 2.3], '#d1d5db', 0.45)}
      {[-1, 1].map((s) =>
        Array.from({ length: 9 }, (_, i) => <group key={`z${s}${i}`}>{S([-4.0, G + 1.0 + i * 0.13, s * 1.155], [1.0, 0.02, 0.01], '#9ca3af')}</group>),
      )}
      {S([-4.56, G + 1.95, -0.6], [0.02, 0.3, 0.5], '#0b1220', 0.3)}
      {S([-4.555, G + 2.0, -0.6], [0.01, 0.08, 0.3], '#22c55e')}
      <mesh position={[-4.2, G + 1.5, 0.55]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.42, 0.42, 0.7, 24]} />
        <meshStandardMaterial color="#1f2329" roughness={0.7} />
      </mesh>
      {[-4.45, -3.95].map((x) => (
        <mesh key={`rr${x}`} position={[x, G + 1.5, 0.55]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.55, 0.55, 0.04, 24]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.5} roughness={0.35} />
        </mesh>
      ))}
      {/* koła: przód pojedyncze, tył bliźniacze na dwóch osiach; błotniki i chlapacze */}
      {[4.0, -2.0, -3.2].flatMap((x) =>
        [-1, 1].map((s) => (
          <group key={`k${x}${s}`}>
            <group position={[x, G + 0.52, s * 0.98]} rotation={[0, Math.PI / 2, 0]}>
              <GseWheel p={[0, 0, 0]} r={0.52} w={x > 0 ? 0.34 : 0.62} />
            </group>
            {x < 0 && S([x, G + 1.1, s * 0.98], [1.0, 0.04, 0.7], '#1f2329')}
            {x < -3 && S([x - 0.6, G + 0.55, s * 0.98], [0.02, 0.6, 0.6], '#111317')}
          </group>
        )),
      )}
      {/* podnoszona platforma nad kabiną: kolumny teleskopowe, pokład z kratką, barierki, zderzak */}
      {[0, 1].map((i) => (
        <mesh key={i} ref={(el) => (legs.current[i] = el)} position={[3.4, G + 2.7, 0.6]}>
          <boxGeometry args={[0.16, 1, 0.16]} />
          <meshStandardMaterial color="#e8b10e" />
        </mesh>
      ))}
      <group ref={platRef} position={[0, G + 2.75, 0]}>
        {S([3.9, 0.05, 0.6], [1.8, 0.08, 1.3], '#9ca3af', 0.4, 0.4)}
        {Array.from({ length: 6 }, (_, i) => (
          <group key={`p${i}`}>{S([3.15 + i * 0.3, 0.1, 0.6], [0.02, 0.02, 1.2], '#6b7280')}</group>
        ))}
        {[-0.62, 0.62].map((dz) => (
          <group key={dz}>
            {S([3.9, 0.95, 0.6 + dz], [1.8, 0.05, 0.05], '#e8b10e')}
            {S([3.9, 0.5, 0.6 + dz], [1.8, 0.04, 0.04], '#e8b10e')}
            {S([3.9, 0.15, 0.6 + dz], [1.8, 0.1, 0.02], '#e8b10e')}
          </group>
        ))}
        {[3.05, 4.75].flatMap((x) => [-0.02, 1.22].map((z) => <group key={`q${x}${z}`}>{S([x, 0.5, z], [0.05, 0.9, 0.05], '#e8b10e')}</group>))}
        {S([4.82, 0.05, 0.6], [0.1, 0.16, 1.3], '#111317')}
      </group>
    </group>
  );
}

/* ============================== scena ============================== */

export function RefuelScene({ sim }: { sim: ReturnType<typeof useRefuelDriver> }) {
  const stage = useStage(sim.getStage);
  const n = REFUEL_STAGES.length;
  const truck = useRef<THREE.Group>(null);
  const hose = useRef<THREE.Mesh>(null);
  const [fuelQ, setFuelQ] = useState(15000);
  useFrame(() => {
    const f = refuelState(sim.getT());
    if (truck.current) truck.current.position.set(f.truckX, 0, LAY.lane);
    if (hose.current) {
      hose.current.visible = f.hose;
      if (f.hose) placeBetween(hose.current, [f.truckX + 4.4 - 0.6, LAY.platTop[1] + 0.1, LAY.lane + 0.6], LAY.cpl);
    }
    // wypełnienie zbiorników odświeżane co 1 t (bryły paliwa przeliczają się przy zmianie)
    const q = Math.round(f.fuel / 1000) * 1000;
    if (q !== fuelQ) setFuelQ(q);
  });
  const groups = useMemo<Group[]>(
    () => [
      { stage: 2, until: 4, paths: [LAY.truckFlow], color: '#f5b041', speed: 3, count: 26, width: 0.08, arrowStep: 0.9, arrowSize: 0.16 },
      { stage: 2, paths: LAY.refuelIn, color: '#fb923c', speed: 4, count: 60, width: 0.07, duct: { color: '#9ca3af', r: 0.05 }, arrowStep: 1.6, arrowSize: 0.18 },
      { stage: 3, until: 4, paths: [LAY.vent], color: '#cbd5e1', speed: 2.5, count: 24, width: 0.05, arrowStep: 1.8, arrowSize: 0.14 },
    ],
    [],
  );
  const view = stage < 0 ? null : VIEWS[Math.min(stage, VIEWS.length - 1)];
  return (
    <group>
      <StageCamera view={view} />
      {/* to samo stanowisko co przy załadunku */}
      <CargoStand />
      <group ref={truck} position={[LAY.stopX - 70, 0, LAY.lane]}>
        <FuelTruck plat={() => refuelState(sim.getT()).plat} />
      </group>
      {/* wąż tankowania od platformy do złącza */}
      <mesh ref={hose} visible={false}>
        <cylinderGeometry args={[0.05, 0.05, 1, 10]} />
        <meshStandardMaterial color="#111317" roughness={0.6} />
      </mesh>
      {/* złącze tankowania w spodzie skrzydła */}
      <mesh position={[LAY.cpl[0], LAY.cpl[1] - 0.04, LAY.cpl[2]]}>
        <cylinderGeometry args={[0.12, 0.12, 0.08, 18]} />
        <meshStandardMaterial color="#d97706" metalness={0.4} roughness={0.4} emissive="#d97706" emissiveIntensity={stage === 1 || stage === 2 ? 0.6 : 0} />
      </mesh>
      {/* paliwo w zbiornikach – ten sam komponent co w „Masie i wyważeniu” */}
      <FuelTanks fuel={fuelQ} color="#f5b041" />
      <StagedFlows groups={groups} stage={stage} nStages={n} />
    </group>
  );
}

/* ============================== ramka i ECAM ============================== */

const f0 = (v: number) => Math.round(v).toLocaleString('pl-PL');
const f1 = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function RefuelLab({ sim }: { sim: ReturnType<typeof useRefuelDriver> }) {
  const [, set] = useState(0);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 0.15) {
      acc.current = 0;
      set((k) => (k + 1) % 1e6);
    }
  });
  const t = sim.getT();
  const st = refuelState(t);
  const s = st.stage;
  const cur = s >= 0 && s < REFUEL_STAGES.length ? REFUEL_STAGES[s] : null;
  const fs = fuelSplit(st.fuel);
  const litres = st.fuel / 0.8;
  const engines = s >= 5;
  return (
    <>
      <CockpitDock>
        <Ecam
          thrMode={null}
          n1={engines ? [21, 21] : [0, 0]}
          egt={engines ? [420, 418] : [40, 40]}
          page="FUEL"
          fuel={{ l: fs.wing, c: fs.center, r: fs.wing, lMax: TANK.wingMax, cMax: TANK.centerMax, rMax: TANK.wingMax, fu: [0, 0], pumps: engines, allFf: engines ? 18 : 0 }}
          footer={{ tat: 15, sat: 15, isa: 0, flt: '--:--', time: '06:12:40', gw: 158000 + 40000 + st.fuel, gwcg: 29.5, fob: st.fuel }}
          width={260}
        />
      </CockpitDock>
      <InfoPortal>
        {cur ? (
          <>
            <div style={{ fontWeight: 700, color: cur.color }}>
              {s + 1}/{REFUEL_STAGES.length} · {cur.title}
            </div>
            <div style={{ fontSize: 13 }}>{cur.text}</div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, color: '#f5b041' }}>{s < 0 ? 'Paliwo: od cysterny do dysz w silniku' : 'Cała droga paliwa'}</div>
            {s < 0 && <div style={{ fontSize: 12, color: '#facc15' }}>Naciśnij „Rozpocznij” – samolot stoi na stanowisku, cysterna zaraz podjedzie.</div>}
          </>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px', fontSize: 13 }}>
          <span>paliwo w samolocie</span>
          <b style={{ color: '#f5b041' }}>
            {f1(st.fuel / 1000)} t · ok. {f0(Math.round(litres / 100) * 100)} l
          </b>
          <span>skrzydła</span>
          <b>2 × {f1(fs.wing / 1000)} t</b>
          <span>zbiornik centralny</span>
          <b>{f1(fs.center / 1000)} t</b>
          <span>przepływ z cysterny</span>
          <b>{s === 2 || s === 3 ? 'ok. 2500 l/min' : '–'}</b>
          <span>do silników</span>
          <b>{engines ? (s === 5 ? 'pompy zasilające włączone' : 'bieg jałowy, ok. 0,3 t/h na silnik') : '–'}</b>
        </div>
        <div style={{ display: 'grid', gap: 2, fontSize: 12 }}>
          {REFUEL_STAGES.map((a, i) => (
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
