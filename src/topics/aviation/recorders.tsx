/*
 * Moduł „Czarne skrzynki”: rejestratory lotu A350. Rejestrator danych (FDR) i rejestrator rozmów w kokpicie (CVR)
 * stoją w tylnej części kadłuba, przed tylną grodzią ciśnieniową, nad sufitem kabiny. Dane płyną od czujników do
 * komputerów, dalej do jednostki zbierającej dane w przedziale awioniki pod kokpitem, a stamtąd przewodem do ogona;
 * dźwięk – z mikrofonów w kokpicie. W samolocie rejestratory są pokazane prześwietlone przez poszycie (jak szafy
 * awioniki w module elektryki). Budowę i próby wytrzymałości pokazuje rejestrator wyjęty z samolotu, na stole
 * obok ogona. Panel w rogu: zapis danych, ścieżki dźwięku, przekrój modułu pamięci, karta prób, poszukiwania.
 * Scenariusze – etap po etapie, jak w innych modułach (zegar, „Rozpocznij”, przelot kamery).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Params } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { AIRBUS, CockpitDock, PanelBox, Pushbutton, cockpitFont } from '../../components/cockpit';
import { CONTROL_PTS, FUS_PART_INFO, Lbl, PLANE_LEVELS, engineOrigin, fusPt } from './airliner';
import { StageCamera, XRay } from './airSystem';
import { useStage } from './cabinSystems';
import { PathStreaks } from './wingLab';

type V3 = [number, number, number];
const G = PLANE_LEVELS.ground;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sm = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

export type RecMode = 'home' | 'data' | 'voice' | 'build' | 'tests' | 'search';

/* ============================== układ (współrzędne samolotu) ============================== */

/** Rejestrator danych i rejestrator rozmów – nad sufitem kabiny, tuż przed tylną grodzią ciśnieniową. */
export const FDR_P: V3 = [22.55, 1.42, 0.2];
export const CVR_P: V3 = [23.3, 1.42, 0.2];
/** Nadajnik awaryjny ELT w grzbiecie kadłuba i jego antena na poszyciu. */
const ELT_X = 20.3;
const ELT_ANT: V3 = fusPt(ELT_X, 0);
export const ELT_P: V3 = [ELT_X, ELT_ANT[1] - 0.32, 0];
/** Jednostka zbierająca dane – w przedziale awioniki pod kokpitem. */
export const DAU_P: V3 = [-28.3, -2.0, 0.55];
/** Mikrofon kokpitu na panelu nad głowami pilotów. */
export const MIC_P: V3 = [-33.35, 0.92, 0];
const E = engineOrigin();
const PITOT: V3 = FUS_PART_INFO.pitot.pos;
const STATIC: V3 = FUS_PART_INFO.statics.pos;
const AIL = CONTROL_PTS.aileron;
const ELEV = CONTROL_PTS.elevator;
const RUD = CONTROL_PTS.rudder;

/** Przewód od jednostki zbierającej dane pod podłogą kabiny do ogona, w górę burty do półki rejestratorów. */
const aftRun = (end: V3): V3[] => [DAU_P, [-26.5, -1.45, 0.9], [18.5, -1.45, 0.9], [21.2, 0.2, 1.1], [21.9, 1.3, 0.6], end];
const PATHS = {
  pitot: [PITOT, [-33.5, -1.8, 0.9], [-29.6, -2.0, 0.6], DAU_P] as V3[],
  static: [STATIC, [-30.2, -2.0, 0.6], DAU_P] as V3[],
  engine: [E, [E[0] + 1.2, E[1] + 1.6, E[2]], [-4, -1.4, 2.2], [-24, -1.9, 0.6], DAU_P] as V3[],
  aileron: [AIL, [AIL[0] - 5, AIL[1] - 0.3, AIL[2] * 0.55], [-2, -1.3, 2.6], [-24, -1.9, 0.6], DAU_P] as V3[],
  elevator: [ELEV, [28, 0.9, 0.4], [19, -1.45, 0.8], [-24, -1.9, 0.6], DAU_P] as V3[],
  rudder: [RUD, [29, 1.6, 0.2], [19.2, -1.4, 0.7], [-24, -1.85, 0.5], DAU_P] as V3[],
  fdr: aftRun(FDR_P),
  cvr: aftRun(CVR_P),
  mic: [MIC_P, [-32.6, 0.4, 0.7], [-30.2, -1.2, 0.7], DAU_P] as V3[],
};
const SENSORS: V3[] = [PITOT, STATIC, E, AIL, ELEV, RUD];

/** Stół obok ogona (lewa burta), na którym leży wyjęty rejestrator; blat na wysokości ok. 0,86 m. */
const TABLE: V3 = [22.8, G, 5.4];
const TOP = G + 0.86;
/** Miejsce rejestratora na stole (zakładka budowy) i modułu pamięci (zakładka prób). */
const BENCH: V3 = [TABLE[0] - 0.15, TOP, TABLE[2]];
const TEST: V3 = [TABLE[0] + 0.05, TOP, TABLE[2]];

/* ============================== etapy scenariuszy ============================== */

type Stage = { title: string; color: string; dur: number; text: string };

export const REC_STAGES: Record<Exclude<RecMode, 'home'>, Stage[]> = {
  data: [
    { title: 'Czujniki mierzą', color: '#38bdf8', dur: 6, text: 'Przez cały lot setki czujników mierzą, co robi samolot. Rurki Pitota mierzą prędkość, otworki w poszyciu – ciśnienie powietrza, z którego wylicza się wysokość. Czujniki w silnikach mierzą obroty i temperaturę, a czujniki przy sterach – ich wychylenie. Wyniki trafiają do komputerów samolotu.' },
    { title: 'Zbieranie danych', color: '#a78bfa', dur: 6, text: 'Komputery przesyłają dane siecią do jednostki zbierającej dane w przedziale awioniki pod kokpitem. Ta wybiera, co trzeba zapisać, i układa wszystko w jeden równy strumień: kilka tysięcy parametrów, wiele z nich kilka razy na sekundę.' },
    { title: 'Przewodem do ogona', color: '#f59e0b', dur: 5, text: 'Strumień danych biegnie przewodem pod podłogą kabiny aż do ogona, do rejestratora danych lotu – w skrócie FDR (z ang. Flight Data Recorder).' },
    { title: 'Zapis w pamięci', color: '#f97316', dur: 7, text: 'Rejestrator zapisuje wszystko w pamięci podobnej do tej w pendrivie, schowanej w pancernym module. Ekran w rogu pokazuje kilka zapisywanych wartości: wysokość, prędkość, przechylenie i obroty silników.' },
    { title: '25 godzin w pętli', color: '#ef4444', dur: 7, text: 'Pamięć mieści co najmniej 25 ostatnich godzin lotu. Gdy się zapełni, najstarszy zapis jest zastępowany najnowszym – jak w kamerze samochodowej. Linie lotnicze na co dzień kopiują te dane i sprawdzają, czy loty przebiegają bezpiecznie, zanim cokolwiek złego się stanie.' },
  ],
  voice: [
    { title: 'Mikrofony w kokpicie', color: '#38bdf8', dur: 6, text: 'Rejestrator rozmów w kokpicie – w skrócie CVR (z ang. Cockpit Voice Recorder) – nagrywa cztery ścieżki. Trzy to słuchawki z mikrofonem: kapitana, pierwszego oficera i trzeciego członka załogi. Czwarta to mikrofon na panelu nad głowami pilotów, który zbiera wszystkie dźwięki w kokpicie.' },
    { title: 'Co słychać na nagraniu', color: '#a78bfa', dur: 7, text: 'Na nagraniu są rozmowy pilotów między sobą i przez radio z kontrolą ruchu lotniczego, komunikaty do pasażerów, a także dźwięki: alarmy, kliknięcia przełączników, szum silników. Badacze wypadków potrafią z nich wiele odczytać – na przykład obroty silników po wysokości ich dźwięku.' },
    { title: 'Przewodem do ogona', color: '#f59e0b', dur: 5, text: 'Dźwięk biegnie przewodem do drugiego rejestratora w ogonie. Stoi on tuż obok rejestratora danych.' },
    { title: '25 godzin nagrania', color: '#f97316', dur: 6, text: 'Nowe samoloty nagrywają co najmniej 25 ostatnich godzin. Starsze nagrywały tylko 2 godziny, więc przy długim locie nagranie z początku kłopotów mogło już zostać nadpisane. Gdy pamięć się zapełni, najstarsze nagranie jest nadpisywane najnowszym.' },
    { title: 'Kasowanie i prywatność', color: '#22c55e', dur: 8, text: 'Po zakończonym locie piloci mogą skasować nagranie przyciskiem CVR ERASE na panelu nad głową. Przycisk działa tylko na ziemi, przy zaciągniętym hamulcu postojowym – w locie nie da się niczego usunąć. Nagrań wolno używać tylko do badania wypadków i incydentów, a nie do oceniania pilotów.' },
  ],
  build: [
    { title: 'Rejestrator na stole', color: '#38bdf8', dur: 6, text: 'Mechanik wyjął rejestrator danych z półki w ogonie. Rejestrator stoi na podstawie, z której łatwo go odpiąć i wymienić. Jest mniej więcej wielkości pudełka na buty i waży ok. 5 kg.' },
    { title: 'Obudowa i elektronika', color: '#a78bfa', dur: 6, text: 'Pod pokrywą jest zwykła elektronika: zasilacz i płytki, które odbierają dane i przygotowują je do zapisu. Ta część może się zniszczyć w wypadku i nic się nie stanie, bo zapisu w niej nie ma.' },
    { title: 'Moduł pamięci', color: '#f97316', dur: 6, text: 'Najważniejsza część to pancerny walec z przodu – moduł pamięci odporny na zniszczenie. Tylko on musi przetrwać katastrofę i to jego badacze szukają wśród szczątków.' },
    { title: 'Warstwy ochrony', color: '#ef4444', dur: 9, text: 'W module są kolejne warstwy, jak w matrioszce. Pancerz ze stali albo tytanu chroni przed uderzeniem i zgnieceniem. Pod nim jest izolacja i blok, który w pożarze pochłania ciepło – zwykle z parafiny, która się topi i nie przepuszcza żaru dalej. W samym środku leży mała płytka z kośćmi pamięci.' },
    { title: 'Nadajnik podwodny', color: '#38bdf8', dur: 6, text: 'Z przodu przykręcony jest mały walec – nadajnik podwodny. Gdy znajdzie się w wodzie, sam się włącza i co sekundę wysyła krótki sygnał dźwiękowy, przez co najmniej 90 dni.' },
    { title: 'Pomarańczowe, nie czarne', color: '#f59e0b', dur: 6, text: '„Czarne skrzynki” nigdy nie były czarne. Maluje się je na jaskrawy pomarańczowy kolor i okleja paskami odblaskowymi, żeby łatwo je znaleźć wśród szczątków. Na boku jest napis po angielsku i po francusku: „rejestrator lotu – nie otwierać”.' },
  ],
  tests: [
    { title: 'Uderzenie', color: '#ef4444', dur: 6, text: 'Moduł pamięci wystrzeliwuje się w stalową ścianę. Przez kilka tysięcznych sekundy działa na niego przeciążenie 3400 g, czyli siła 3400 razy większa od jego ciężaru.' },
    { title: 'Przebicie', color: '#f59e0b', dur: 6, text: 'Na moduł spada z wysokości 3 m ciężar 227 kg zakończony stalowym kolcem. Pancerz nie może pęknąć.' },
    { title: 'Zgniatanie', color: '#eab308', dur: 6, text: 'Prasa ściska moduł z siłą ok. 22 kN – jakby leżały na nim ponad 2 tony – przez 5 minut, po kolei z każdej strony.' },
    { title: 'Pożar', color: '#f97316', dur: 8, text: 'Moduł leży przez godzinę w płomieniach o temperaturze 1100 °C – tak gorąco pali się paliwo lotnicze. W drugiej próbie spędza 10 godzin w 260 °C, jak w tlącym się pożarze wśród szczątków.' },
    { title: 'Głębia oceanu', color: '#38bdf8', dur: 7, text: 'Moduł spędza 30 dni w zbiorniku pod takim ciśnieniem, jakie panuje 6000 m pod wodą. Inne egzemplarze moczy się w wodzie morskiej, paliwie i płynach z samolotu.' },
    { title: 'Dane ocalały', color: '#22c55e', dur: 6, text: 'Po próbach badacze otwierają moduł i odczytują pamięć. Zapis musi być kompletny. Dopiero gdy dany typ rejestratora przejdzie wszystkie próby, może być montowany w samolotach.' },
  ],
  search: [
    { title: 'Śledzenie w locie', color: '#38bdf8', dur: 7, text: 'Samolot przez cały lot nadaje swoją pozycję – widzą go kontrolerzy ruchu lotniczego i sieć odbiorników na ziemi. Nowe samoloty, takie jak A350, mają też nadajnik, który w razie niebezpieczeństwa – na przykład gdy samolot nagle traci wysokość – sam zaczyna wysyłać pozycję przez satelity, jeszcze w powietrzu.' },
    { title: 'Sygnał do satelitów', color: '#a78bfa', dur: 7, text: 'Przy uderzeniu włącza się nadajnik awaryjny ELT w ogonie. Przez antenę na grzbiecie samolotu wysyła sygnał radiowy na częstotliwości 406 MHz. Odbierają go satelity międzynarodowego systemu ratowniczego COSPAS-SARSAT i przekazują położenie służbom ratunkowym.' },
    { title: 'Sygnał spod wody', color: '#f97316', dur: 8, text: 'Fale radiowe nie przechodzą przez wodę, więc po upadku do morza ELT niewiele pomoże. Wtedy włączają się nadajniki na rejestratorach: co sekundę wysyłają krótki pisk o częstotliwości 37,5 kHz – za wysokiej, żeby usłyszał go człowiek. Słychać go z odległości 2–3 km. Nowe samoloty latające nad oceanami mają też nadajnik o niższym tonie, przykręcony do kadłuba, słyszalny z dużo większej odległości.' },
    { title: 'Nasłuch ze statku', color: '#22c55e', dur: 7, text: 'Statki ciągną pod wodą czułe mikrofony – hydrofony – i pływają tam i z powrotem po obszarze poszukiwań. Gdy usłyszą pisk, wiedzą, gdzie szukać. Nadajnik działa przez co najmniej 90 dni.' },
    { title: 'Wydobycie', color: '#eab308', dur: 7, text: 'Podwodny robot sterowany ze statku schodzi na dno, odnajduje pomarańczowy rejestrator i wynosi go na powierzchnię.' },
    { title: 'Odczyt w laboratorium', color: '#f59e0b', dur: 8, text: 'W laboratorium komisji badania wypadków specjaliści wyjmują płytkę z pamięcią, czyszczą ją i podłączają do czytnika. Z danych odtwarzają lot sekunda po sekundzie, a z nagrania – rozmowy w kokpicie. Tak ustala się przyczynę wypadku, a potem zmienia przepisy i procedury, żeby się nie powtórzył.' },
  ],
};

const total = (m: Exclude<RecMode, 'home'>) => REC_STAGES[m].reduce((a, s) => a + s.dur, 0);
const stStart = (m: Exclude<RecMode, 'home'>, i: number) => REC_STAGES[m].slice(0, i).reduce((a, s) => a + s.dur, 0);
export function recStageAt(mode: RecMode, t: number) {
  if (mode === 'home' || t < 0) return -1;
  let a = 0;
  const st = REC_STAGES[mode];
  for (let i = 0; i < st.length; i++) {
    if (t < a + st[i].dur) return i;
    a += st[i].dur;
  }
  return st.length;
}
/** Postęp wewnątrz etapu i (0…1); przed etapem 0, po nim 1. */
function inStage(mode: Exclude<RecMode, 'home'>, t: number, i: number) {
  if (t < 0) return 0;
  return clamp01((t - stStart(mode, i)) / REC_STAGES[mode][i].dur);
}
/** Czy dany tryb to lot (podwozie schowane, bez płyty lotniska). */
export const recFlight = (mode: RecMode | null) => mode === 'data' || mode === 'voice' || mode === 'search';

/** Stan sceny w chwili t (−1 – przed „Rozpocznij”). */
export function recState(mode: RecMode, t: number) {
  const s = recStageAt(mode, t);
  const done = (i: number) => s > i || s >= (mode === 'home' ? 0 : REC_STAGES[mode].length);
  const p = (i: number) => (mode === 'home' ? 0 : inStage(mode, t, i));
  const out = {
    stage: s,
    sensors: false,
    toDau: false,
    toFdr: false,
    mic: false,
    toCvr: false,
    fdrGlow: 0,
    cvrGlow: 0,
    elt: 0, // 1 – sygnał śledzenia w locie, 2 – sygnał ELT do satelitów
    ping: false,
    // rejestrator na stole
    bench: 0, // pojawienie się na stole
    lid: 0,
    csmu: 0, // wyróżnienie modułu pamięci
    explode: 0,
    ulb: 0,
    turn: 0,
    // próby
    test: -1,
    testP: 0,
    soot: 0,
  };
  if (mode === 'home') {
    out.fdrGlow = 0.6;
    out.cvrGlow = 0.6;
    return out;
  }
  if (mode === 'data') {
    out.sensors = s >= 0;
    out.toDau = s >= 1;
    out.toFdr = s >= 2;
    out.fdrGlow = s >= 3 ? 1 : s >= 2 ? 0.6 : 0.3;
    out.cvrGlow = 0.25;
  } else if (mode === 'voice') {
    out.mic = s >= 0;
    out.toCvr = s >= 2;
    out.cvrGlow = s >= 3 ? 1 : s >= 2 ? 0.6 : 0.3;
    out.fdrGlow = 0.25;
  } else if (mode === 'search') {
    out.elt = s === 0 ? 1 : s === 1 ? 2 : 0;
    out.ping = s >= 2 && s <= 4;
    out.fdrGlow = s >= 2 ? 0.8 : 0.4;
    out.cvrGlow = s >= 2 ? 0.8 : 0.4;
  } else if (mode === 'build') {
    out.fdrGlow = s < 0 || s === 0 ? 0.9 * (1 - sm(p(0) * 2 - 0.6)) : 0;
    out.cvrGlow = 0.25;
    out.bench = t < 0 ? 0 : sm((t - 1.2) / 2.5);
    out.lid = s === 1 ? sm(p(1) * 3) : s === 2 ? 1 - sm(p(2) * 3) : 0;
    out.csmu = s === 2 || s === 3 ? 1 : 0;
    out.explode = s === 3 ? sm((p(3) - 0.1) * 2.2) : s === 4 ? 1 - sm(p(4) * 3) : 0;
    out.ulb = s === 4 ? 1 : 0;
    out.turn = s === 5 || done(5) ? sm(p(5) * 1.4) : 0;
  } else if (mode === 'tests') {
    out.test = s < 0 ? -1 : Math.min(s, 5);
    out.testP = s >= 0 && s < 6 ? p(s) : 1;
    out.soot = s === 3 ? sm(p(3) * 1.3) : s > 3 ? 1 : 0;
    out.explode = s >= 5 ? sm((p(5) - 0.15) * 2.5) : 0;
  }
  return out;
}
export type RecState = ReturnType<typeof recState>;

/* ============================== zegar ============================== */

export function useRecDriver(mode: RecMode | null, params: Params) {
  const st = useRef({ t: 0, key: '' });
  const power = useRef({ n1: 0, rev: 0 });
  const getT = () => (mode && mode !== 'home' && params.run ? st.current.t : -1);
  useFrame((_, dt) => {
    if (!mode) return;
    const run = Boolean(params.run);
    const key = `${mode}|${run}`;
    if (key !== st.current.key) Object.assign(st.current, { key, t: 0 });
    if (run && mode !== 'home') st.current.t = Math.min(total(mode) + 60, st.current.t + Math.min(0.05, dt));
    power.current.n1 = recFlight(mode) ? 84 : 0;
  });
  return { getT, getStage: () => (mode ? recStageAt(mode, getT()) : -1), mode, state: () => recState(mode ?? 'home', getT()), power: power.current };
}
export type RecSim = ReturnType<typeof useRecDriver>;

/* ============================== materiały ============================== */

const ORANGE = '#f26a1b';
const xMat = (color: string, opacity: number) => <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />;

/** Napis na boku rejestratora (po angielsku i po francusku), jak na prawdziwych rejestratorach. */
let placardTex: THREE.CanvasTexture | null = null;
function getPlacard() {
  if (placardTex) return placardTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f26a1b';
  x.fillRect(0, 0, 512, 160);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 512, 14);
  x.fillRect(0, 146, 512, 14);
  x.fillStyle = '#111111';
  x.textAlign = 'center';
  x.font = 'bold 40px Arial, sans-serif';
  x.fillText('FLIGHT RECORDER', 256, 56);
  x.font = 'bold 30px Arial, sans-serif';
  x.fillText('DO NOT OPEN', 256, 90);
  x.font = 'bold 22px Arial, sans-serif';
  x.fillText('ENREGISTREUR DE VOL · NE PAS OUVRIR', 256, 128);
  placardTex = new THREE.CanvasTexture(c);
  placardTex.colorSpace = THREE.SRGBColorSpace;
  placardTex.anisotropy = 4;
  return placardTex;
}

/* ============================== rejestrator w samolocie (prześwietlony) ============================== */

/** Rejestrator w samolocie: uproszczona bryła na półce, prześwietlona przez poszycie, z poświatą. */
function XRecorder({ pos, glow }: { pos: V3; glow: () => number }) {
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const halo = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const g = glow();
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4);
    mats.current.forEach((m, i) => m && (m.opacity = i === 0 ? 0.25 + 0.65 * g : 0.35 + 0.55 * g));
    if (halo.current) {
      halo.current.visible = g > 0.05;
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.06 * g + 0.06 * g * pulse;
      halo.current.scale.setScalar(1 + 0.15 * pulse * g);
    }
  });
  return (
    <group position={pos} scale={1.5}>
      {/* półka (rejestrator powiększony 1,5 raza, żeby był widoczny z daleka) */}
      <mesh position={[0, -0.09, 0]} renderOrder={21}>
        <boxGeometry args={[0.62, 0.02, 0.3]} />
        <meshBasicMaterial ref={(m) => (mats.current[0] = m)} color="#94a3b8" transparent opacity={0.4} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[-0.08, -0.025, 0]} renderOrder={22}>
        <boxGeometry args={[0.26, 0.11, 0.125]} />
        <meshBasicMaterial ref={(m) => (mats.current[1] = m)} color={ORANGE} transparent opacity={0.7} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0.13, -0.01, 0]} rotation={[0, 0, Math.PI / 2]} renderOrder={22}>
        <cylinderGeometry args={[0.06, 0.06, 0.17, 18]} />
        <meshBasicMaterial ref={(m) => (mats.current[2] = m)} color={ORANGE} transparent opacity={0.7} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0.26, -0.01, 0]} rotation={[0, 0, Math.PI / 2]} renderOrder={22}>
        <cylinderGeometry args={[0.018, 0.018, 0.09, 10]} />
        <meshBasicMaterial ref={(m) => (mats.current[3] = m)} color="#e5e7eb" transparent opacity={0.7} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={halo} renderOrder={20}>
        <sphereGeometry args={[0.26, 20, 14]} />
        <meshBasicMaterial color="#fb923c" transparent opacity={0.15} depthTest={false} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/** Pozostałe elementy prześwietlone: jednostka zbierająca dane, mikrofon kokpitu, ELT z anteną, przewody. */
function XParts({ home }: { home: boolean }) {
  const tube = useMemo(() => {
    const mk = (pts: V3[]) => {
      const cp = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 1; i < pts.length; i++) cp.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i - 1]), new THREE.Vector3(...pts[i])));
      return new THREE.TubeGeometry(cp, 120, 0.025, 6, false);
    };
    return [mk(PATHS.fdr), mk(PATHS.cvr), mk(PATHS.mic)];
  }, []);
  return (
    <group>
      <mesh position={DAU_P} renderOrder={21}>
        <boxGeometry args={[0.5, 0.3, 0.35]} />
        {xMat('#a78bfa', 0.75)}
      </mesh>
      <mesh position={MIC_P} renderOrder={21}>
        <sphereGeometry args={[0.07, 14, 10]} />
        {xMat('#38bdf8', 0.9)}
      </mesh>
      <mesh position={ELT_P} renderOrder={21}>
        <boxGeometry args={[0.3, 0.12, 0.16]} />
        {xMat('#eab308', 0.85)}
      </mesh>
      {/* antena ELT – płetwa na grzbiecie (na zewnątrz, zwykła bryła) */}
      <mesh position={[ELT_ANT[0], ELT_ANT[1] + 0.1, 0]}>
        <boxGeometry args={[0.22, 0.2, 0.025]} />
        <meshStandardMaterial color="#d6dbe0" roughness={0.45} />
      </mesh>
      {home &&
        tube.map((g, i) => (
          <mesh key={i} geometry={g} renderOrder={19}>
            {xMat(i === 2 ? '#38bdf8' : '#7dd3fc', 0.28)}
          </mesh>
        ))}
    </group>
  );
}

/** Strugi danych (kropki płynące przewodem). */
function Flow({ paths, color, on, speed = 4, count = 30, width = 0.07 }: { paths: V3[][]; color: string; on: boolean; speed?: number; count?: number; width?: number }) {
  if (!on) return null;
  return (
    <XRay on>
      <PathStreaks paths={paths} count={count} color={color} speed={speed} trail={0.7} width={width} opacity={0.95} />
    </XRay>
  );
}

/** Migające punkty przy czujnikach (etap „Czujniki mierzą”). */
function SensorBlips({ on }: { on: () => boolean }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const v = on();
    refs.current.forEach((m, i) => {
      if (!m) return;
      m.visible = v;
      const k = (clock.elapsedTime * 1.6 + i * 0.37) % 1;
      m.scale.setScalar(0.3 + 1.2 * k);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
    });
  });
  return (
    <>
      {SENSORS.map((p, i) => (
        <mesh key={i} ref={(m) => (refs.current[i] = m)} position={p} renderOrder={22} visible={false}>
          <sphereGeometry args={[0.8, 16, 12]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} depthTest={false} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </>
  );
}

/** Rozchodzące się fale: ELT w górę (pierścienie), nadajniki podwodne – kule wokół rejestratorów. */
function Waves({ get }: { get: () => RecState }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const pings = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const s = get();
    const t = clock.elapsedTime;
    rings.current.forEach((m, i) => {
      if (!m) return;
      m.visible = s.elt > 0;
      const k = (t * 0.6 + i / 4) % 1;
      m.position.set(ELT_ANT[0], ELT_ANT[1] + 0.3 + k * 9, 0);
      m.scale.setScalar(0.4 + k * 6);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.75 * (1 - k);
      mat.color.set(s.elt === 2 ? '#a78bfa' : '#38bdf8');
    });
    pings.current.forEach((m, i) => {
      if (!m) return;
      m.visible = s.ping;
      // pisk co sekundę: krótki impuls rozchodzi się kulą
      const k = (t + (i % 2) * 0.5) % 1;
      m.scale.setScalar(0.2 + k * 2.6);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k);
    });
  });
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(m) => (rings.current[i] = m)} rotation={[Math.PI / 2, 0, 0]} renderOrder={23} visible={false}>
          <torusGeometry args={[1, 0.035, 8, 48]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {[FDR_P, CVR_P].map((p, i) => (
        <mesh key={i} ref={(m) => (pings.current[i] = m)} position={[p[0] + 0.25, p[1], p[2]]} renderOrder={23} visible={false}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial color="#fb923c" wireframe transparent opacity={0.4} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/* ============================== rejestrator na stole (pełny model) ============================== */

/**
 * Moduł pamięci odporny na zniszczenie (walec): pancerz w kolorze pomarańczowym z paskami odblaskowymi i warstwy
 * w środku, które przy „rozkładaniu” wysuwają się z przodu jak w lunecie: izolacja, blok termiczny, płytka pamięci.
 * Oś walca – x; przód (+x) – nadajnik podwodny.
 */
function Csmu({ get, ulb = true }: { get: () => { explode: number; soot: number; ulb: number; csmu: number }; ulb?: boolean }) {
  const ins = useRef<THREE.Group>(null);
  const blk = useRef<THREE.Group>(null);
  const brd = useRef<THREE.Group>(null);
  const cap = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.Group>(null);
  const armor = useRef<THREE.MeshStandardMaterial>(null);
  const ulbMat = useRef<THREE.MeshStandardMaterial>(null);
  const memMat = useRef<THREE.MeshStandardMaterial>(null);
  const orange = useMemo(() => new THREE.Color(ORANGE), []);
  const sootC = useMemo(() => new THREE.Color('#3a2a22'), []);
  useFrame(({ clock }) => {
    const s = get();
    const e = s.explode;
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 6);
    if (cap.current) cap.current.position.set(0.085 + 0.09 * sm(e * 3), 0.07 * sm(e * 3), 0);
    if (beacon.current) beacon.current.position.set(0.13 + 0.16 * sm(e * 3), 0.13 * sm(e * 3), 0);
    if (ins.current) ins.current.position.x = 0.21 * sm(e * 2.2 - 0.3);
    if (blk.current) blk.current.position.x = 0.36 * sm(e * 2.2 - 0.6);
    if (brd.current) brd.current.position.x = 0.5 * sm(e * 2.2 - 0.9);
    if (armor.current) {
      armor.current.color.copy(orange).lerp(sootC, 0.8 * s.soot);
      armor.current.emissive.set(s.csmu > 0 ? '#f97316' : '#000000');
      armor.current.emissiveIntensity = 0.25 * s.csmu * pulse;
    }
    if (ulbMat.current) {
      ulbMat.current.emissive.set(s.ulb > 0 ? '#38bdf8' : '#000000');
      ulbMat.current.emissiveIntensity = s.ulb * (0.3 + 0.7 * pulse);
    }
    if (memMat.current) memMat.current.emissiveIntensity = e > 0.8 ? 0.35 + 0.3 * pulse : 0.05;
  });
  return (
    <group>
      {/* pancerz */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.17, 32, 1, true]} />
        <meshStandardMaterial ref={armor} color={ORANGE} roughness={0.55} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>
      {/* tył zamknięty */}
      <mesh position={[-0.085, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <circleGeometry args={[0.06, 32]} />
        <meshStandardMaterial color="#c4561a" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* paski odblaskowe */}
      {[-0.045, 0.045].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.0612, 0.0612, 0.014, 32, 1, true]} />
          <meshStandardMaterial color="#f4f6f8" roughness={0.25} metalness={0.2} emissive="#ffffff" emissiveIntensity={0.08} />
        </mesh>
      ))}
      {/* pokrywa przednia (odkręcana) */}
      <group ref={cap} position={[0.085, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.062, 0.062, 0.012, 32]} />
          <meshStandardMaterial color="#d85d18" roughness={0.5} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} position={[0.007, 0.048 * Math.cos((i * Math.PI) / 3), 0.048 * Math.sin((i * Math.PI) / 3)]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.005, 0.005, 0.006, 8]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
      </group>
      {/* nadajnik podwodny: walec z czujnikiem wody na końcu */}
      {ulb && (
        <group ref={beacon} position={[0.13, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.017, 0.017, 0.085, 16]} />
            <meshStandardMaterial ref={ulbMat} color="#d9dde2" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0.046, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.009, 0.013, 0.012, 12]} />
            <meshStandardMaterial color="#1f2937" roughness={0.5} />
          </mesh>
          <mesh position={[-0.032, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.021, 0.021, 0.008, 16]} />
            <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.35} />
          </mesh>
        </group>
      )}
      {/* izolacja */}
      <group ref={ins}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.049, 0.049, 0.15, 28]} />
          <meshStandardMaterial color="#efe6cf" roughness={0.9} />
        </mesh>
      </group>
      {/* blok termiczny */}
      <group ref={blk}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.037, 0.037, 0.125, 24]} />
          <meshStandardMaterial color="#b9a27a" roughness={0.7} />
        </mesh>
      </group>
      {/* płytka pamięci z kośćmi */}
      <group ref={brd}>
        <mesh>
          <boxGeometry args={[0.1, 0.004, 0.045]} />
          <meshStandardMaterial ref={memMat} color="#15803d" roughness={0.6} emissive="#22c55e" emissiveIntensity={0.05} />
        </mesh>
        {[-0.03, -0.01, 0.01, 0.03].map((x) => (
          <mesh key={x} position={[x, 0.004, 0]}>
            <boxGeometry args={[0.014, 0.003, 0.022]} />
            <meshStandardMaterial color="#111827" roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[-0.052, 0, 0]}>
          <boxGeometry args={[0.006, 0.006, 0.03]} />
          <meshStandardMaterial color="#d4a017" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/** Pełny rejestrator danych: podstawa, obudowa z elektroniką (pokrywa podnosi się), moduł pamięci i nadajnik. */
function BenchRecorder({ get }: { get: () => RecState }) {
  const root = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const boards = useRef<THREE.Group>(null);
  const boardMats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame(({ clock }) => {
    const s = get();
    if (root.current) {
      root.current.visible = s.bench > 0.01;
      root.current.position.set(BENCH[0], TOP + 0.4 * (1 - s.bench), BENCH[2]);
      root.current.rotation.y = s.turn * Math.PI * 0.85;
      root.current.scale.setScalar(0.4 + 0.6 * s.bench);
    }
    if (lid.current) {
      lid.current.position.y = 0.112 + 0.12 * s.lid;
      lid.current.rotation.z = 0.5 * s.lid;
    }
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 6);
    boardMats.current.forEach((m) => m && (m.emissiveIntensity = s.lid > 0.5 ? 0.15 + 0.25 * pulse : 0));
    if (boards.current) boards.current.visible = s.lid > 0.02;
  });
  const tex = getPlacard();
  const csmuGet = () => {
    const s = get();
    return { explode: s.explode, soot: 0, ulb: s.ulb, csmu: s.csmu };
  };
  const wall = '#e9661c';
  return (
    <group ref={root} visible={false}>
      {/* podstawa z zamkami */}
      <mesh position={[0, 0.008, 0]}>
        <boxGeometry args={[0.5, 0.016, 0.16]} />
        <meshStandardMaterial color="#3b4148" metalness={0.4} roughness={0.5} />
      </mesh>
      {[-0.06, 0.06].map((z) => (
        <mesh key={z} position={[-0.245, 0.04, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.03, 12]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* obudowa elektroniki: dno i ścianki (od tyłu x −0,22 do 0,05) */}
      <group position={[-0.085, 0, 0]}>
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.27, 0.008, 0.125]} />
          <meshStandardMaterial color={wall} roughness={0.55} />
        </mesh>
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[0, 0.066, sd * 0.0585]}>
            <boxGeometry args={[0.27, 0.092, 0.008]} />
            <meshStandardMaterial color={wall} roughness={0.55} />
          </mesh>
        ))}
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * 0.131, 0.066, 0]}>
            <boxGeometry args={[0.008, 0.092, 0.125]} />
            <meshStandardMaterial color={wall} roughness={0.55} />
          </mesh>
        ))}
        {/* napis na lewej burcie (+z) */}
        <mesh position={[0.005, 0.066, 0.0631]}>
          <planeGeometry args={[0.22, 0.07]} />
          <meshStandardMaterial map={tex} roughness={0.5} />
        </mesh>
        {/* żeberka chłodzące na tylnej ściance i złącze */}
        <mesh position={[-0.145, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.028, 0.028, 0.03, 20]} />
          <meshStandardMaterial color="#2b3036" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* płytki elektroniki (widoczne po zdjęciu pokrywy) */}
        <group ref={boards} visible={false}>
          {[-0.032, 0, 0.032].map((z, i) => (
            <group key={z} position={[0, 0.065, z]}>
              <mesh>
                <boxGeometry args={[0.24, 0.075, 0.003]} />
                <meshStandardMaterial ref={(m) => (boardMats.current[i] = m)} color="#166534" roughness={0.6} emissive="#a78bfa" emissiveIntensity={0} />
              </mesh>
              {[-0.08, -0.02, 0.05].map((x) => (
                <mesh key={x} position={[x, 0.005, 0.004]}>
                  <boxGeometry args={[0.03, 0.02, 0.004]} />
                  <meshStandardMaterial color="#111827" roughness={0.4} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
        {/* pokrywa z uchwytem – podnosi się i odchyla */}
        <group ref={lid} position={[0, 0.112, 0]}>
          <mesh>
            <boxGeometry args={[0.272, 0.008, 0.127]} />
            <meshStandardMaterial color={wall} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.002, 0]}>
            <boxGeometry args={[0.272, 0.009, 0.02]} />
            <meshStandardMaterial color="#f4f6f8" roughness={0.3} emissive="#ffffff" emissiveIntensity={0.06} />
          </mesh>
          <mesh position={[-0.03, 0.022, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.035, 0.006, 8, 20, Math.PI]} />
            <meshStandardMaterial color="#1f2329" roughness={0.5} />
          </mesh>
        </group>
      </group>
      {/* siodło i moduł pamięci z przodu */}
      <mesh position={[0.13, 0.03, 0]}>
        <boxGeometry args={[0.15, 0.03, 0.1]} />
        <meshStandardMaterial color="#4b5563" metalness={0.4} roughness={0.5} />
      </mesh>
      <group position={[0.135, 0.105, 0]}>
        <Csmu get={csmuGet} />
      </group>
    </group>
  );
}

/** Stół warsztatowy obok ogona: blat z matą, nogi. */
function Table() {
  return (
    <group position={[TABLE[0], 0, TABLE[2]]}>
      <mesh position={[0, TOP - 0.02, 0]}>
        <boxGeometry args={[1.5, 0.04, 0.8]} />
        <meshStandardMaterial color="#6b7280" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, TOP + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.3, 0.62]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.9} />
      </mesh>
      {[-0.68, 0.68].flatMap((x) =>
        [-0.34, 0.34].map((z) => (
          <mesh key={`${x}${z}`} position={[x, (G + TOP) / 2, z]}>
            <boxGeometry args={[0.05, TOP - G - 0.04, 0.05]} />
            <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
          </mesh>
        )),
      )}
    </group>
  );
}

/* ============================== próby wytrzymałości ============================== */

/** Płomienie: stożki ze świeceniem, migoczące (próba ogniowa). */
function Flames({ on }: { on: () => boolean }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const N = 14;
  useFrame(({ clock }) => {
    const v = on();
    const t = clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m) return;
      m.visible = v;
      const f = 0.75 + 0.35 * Math.sin(t * (9 + i) + i * 1.7) + 0.15 * Math.sin(t * 23 + i);
      m.scale.set(1, f, 1);
      m.position.y = 0.11 * f;
    });
  });
  return (
    <group>
      {Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2;
        const r = 0.06 + (i % 3) * 0.04;
        return (
          <mesh key={i} ref={(m) => (refs.current[i] = m)} position={[Math.cos(a) * r * 1.6, 0.1, Math.sin(a) * r]} visible={false}>
            <coneGeometry args={[0.035 + (i % 2) * 0.015, 0.24, 10]} />
            <meshBasicMaterial color={i % 2 ? '#fb923c' : '#facc15'} transparent opacity={0.7} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Stanowisko prób: moduł pamięci na stole i urządzenia każdej próby (pokazywane po kolei). */
function TestRig({ get }: { get: () => RecState }) {
  const root = useRef<THREE.Group>(null);
  const csmu = useRef<THREE.Group>(null);
  const wall = useRef<THREE.Mesh>(null);
  const shock = useRef<THREE.Mesh>(null);
  const pin = useRef<THREE.Group>(null);
  const press = useRef<THREE.Group>(null);
  const pressTop = useRef<THREE.Group>(null);
  const burner = useRef<THREE.Group>(null);
  const tank = useRef<THREE.Group>(null);
  const bubbles = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const s = get();
    const i = s.test;
    const p = s.testP;
    const t = clock.elapsedTime;
    if (root.current) root.current.visible = true;
    // uderzenie: moduł leci w ścianę i odbija się
    let cx = 0;
    let cy = 0.065;
    let shake = 0;
    if (i === 0) {
      const hit = 0.45;
      cx = p < hit ? -0.45 + 0.39 * Math.pow(p / hit, 2) : -0.06 - 0.12 * sm((p - hit) / 0.3);
      shake = p > hit && p < hit + 0.08 ? 1 : 0;
    }
    if (csmu.current) {
      csmu.current.position.set(TEST[0] + cx + shake * 0.004 * Math.sin(t * 90), TEST[1] + cy, TEST[2]);
      csmu.current.rotation.set(0, i === 2 && p > 0.5 ? Math.PI / 2 * sm((p - 0.5) * 4) : 0, 0);
    }
    if (wall.current) wall.current.visible = i === 0;
    if (shock.current) {
      const k = i === 0 ? clamp01((p - 0.45) / 0.25) : 1;
      shock.current.visible = i === 0 && k > 0 && k < 1;
      shock.current.scale.setScalar(0.05 + 0.35 * k);
      (shock.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
    }
    if (pin.current) {
      pin.current.visible = i === 1;
      const hit = 0.5;
      const y = p < hit ? 0.95 * (1 - Math.pow(p / hit, 2)) : 0.02 * Math.abs(Math.sin((p - hit) * 30)) * (1 - p);
      pin.current.position.set(TEST[0], TEST[1] + 0.13 + y, TEST[2]);
    }
    if (press.current) press.current.visible = i === 2;
    if (pressTop.current) pressTop.current.position.y = TEST[1] + 0.13 + 0.25 * (1 - sm(p * 3)) + (p > 0.45 && p < 0.55 ? 0.25 * sm((p - 0.45) * 20) : 0) - (p > 0.55 ? 0 : 0);
    if (burner.current) burner.current.visible = i === 3;
    if (tank.current) tank.current.visible = i === 4;
    bubbles.current.forEach((m, k) => {
      if (!m) return;
      m.visible = i === 4;
      const u = (t * 0.35 + k * 0.137) % 1;
      m.position.set(TEST[0] + 0.12 * Math.sin(k * 2.3), TEST[1] + 0.03 + u * 0.4, TEST[2] + 0.1 * Math.cos(k * 1.7));
    });
  });
  const csmuGet = () => {
    const s = get();
    return { explode: s.explode, soot: s.soot, ulb: 0, csmu: s.test === 5 ? 1 : 0 };
  };
  return (
    <group ref={root}>
      <group ref={csmu}>
        <Csmu get={csmuGet} ulb={false} />
      </group>
      {/* uderzenie: stalowa ściana, fala uderzenia */}
      <mesh ref={wall} position={[TEST[0] + 0.03, TEST[1] + 0.13, TEST[2]]} visible={false}>
        <boxGeometry args={[0.06, 0.26, 0.32]} />
        <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh ref={shock} position={[TEST[0] - 0.005, TEST[1] + 0.065, TEST[2]]} rotation={[0, Math.PI / 2, 0]} visible={false}>
        <ringGeometry args={[0.6, 1, 40]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0.8} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
      </mesh>
      {/* przebicie: ciężarek z kolcem */}
      <group ref={pin} visible={false}>
        <mesh position={[0, 0.03, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.012, 0.04, 12]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.3, 12]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.16, 24]} />
          <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
      {/* zgniatanie: płyty prasy na kolumnach */}
      <group ref={press} visible={false}>
        <mesh position={[TEST[0], TEST[1] + 0.008, TEST[2]]}>
          <boxGeometry args={[0.32, 0.016, 0.24]} />
          <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.35} />
        </mesh>
        {[-0.14, 0.14].flatMap((x) =>
          [-0.1, 0.1].map((z) => (
            <mesh key={`${x}${z}`} position={[TEST[0] + x, TEST[1] + 0.25, TEST[2] + z]}>
              <cylinderGeometry args={[0.008, 0.008, 0.5, 8]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.8} roughness={0.2} />
            </mesh>
          )),
        )}
        <group ref={pressTop} position={[TEST[0], TEST[1] + 0.3, TEST[2]]}>
          <mesh>
            <boxGeometry args={[0.32, 0.02, 0.24]} />
            <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.18, 16]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.25} />
          </mesh>
        </group>
      </group>
      {/* pożar: palnik i płomienie */}
      <group ref={burner} position={[TEST[0], TEST[1], TEST[2]]} visible={false}>
        <mesh position={[0, 0.006, 0]}>
          <boxGeometry args={[0.36, 0.012, 0.22]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
        <Flames on={() => get().test === 3} />
        <pointLight position={[0, 0.18, 0.1]} color="#fb923c" intensity={1.5} distance={1.5} />
      </group>
      {/* głębia: zbiornik ciśnieniowy z wodą */}
      <group ref={tank} position={[TEST[0], TEST[1], TEST[2]]} visible={false}>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.44, 32, 1, true]} />
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.22} roughness={0.1} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.445, 0]}>
          <cylinderGeometry args={[0.185, 0.185, 0.03, 32]} />
          <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.005, 0]}>
          <cylinderGeometry args={[0.185, 0.185, 0.01, 32]} />
          <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
      {Array.from({ length: 10 }, (_, k) => (
        <mesh key={k} ref={(m) => (bubbles.current[k] = m)} visible={false}>
          <sphereGeometry args={[0.008, 8, 6]} />
          <meshStandardMaterial color="#e0f2fe" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/* ============================== podpisy (strona główna) ============================== */

export const REC_GROUPS = [
  { id: 'rec', name: 'rejestratory', color: '#fb923c' },
  { id: 'src', name: 'skąd biorą się dane', color: '#7dd3fc' },
  { id: 'find', name: 'odnajdywanie', color: '#a3e635' },
];
export const REC_PART_INFO: Record<string, { name: string; group: string; pos: V3; sub?: boolean; desc: string }> = {
  fdr: { name: 'rejestrator danych lotu (FDR)', group: 'rec', pos: [FDR_P[0] - 0.45, FDR_P[1] + 0.5, 0.9], desc: 'Zapisuje kilka tysięcy parametrów lotu: wysokość, prędkość, kurs, położenie sterów, pracę silników, ustawienia autopilota i wiele innych – co najmniej 25 ostatnich godzin. Stoi w tylnej części kadłuba, bo przy wypadku ta część zwykle najmniej się niszczy.' },
  cvr: { name: 'rejestrator rozmów w kokpicie (CVR)', group: 'rec', pos: [CVR_P[0] + 0.55, CVR_P[1] - 0.38, 1.0], desc: 'Nagrywa dźwięk z kokpitu: rozmowy pilotów, łączność radiową, alarmy i odgłosy. Nowe samoloty nagrywają co najmniej 25 ostatnich godzin. Stoi obok rejestratora danych.' },
  ulb: { name: 'nadajniki podwodne', group: 'find', pos: [FDR_P[0] - 1.0, FDR_P[1] - 0.2, 1.0], sub: true, desc: 'Małe walce przykręcone z przodu obu rejestratorów. W wodzie same się włączają i przez co najmniej 90 dni co sekundę wysyłają pisk, który słychać w promieniu 2–3 km.' },
  elt: { name: 'nadajnik awaryjny ELT', group: 'find', pos: [ELT_X - 0.4, ELT_ANT[1] + 0.55, 0.3], desc: 'Nadajnik w grzbiecie kadłuba z anteną na zewnątrz. Włącza się sam przy silnym uderzeniu (albo przyciskiem w kokpicie) i wysyła przez satelity sygnał z położeniem samolotu do służb ratunkowych.' },
  dau: { name: 'jednostka zbierająca dane', group: 'src', pos: [DAU_P[0], DAU_P[1] - 0.6, 1.4], desc: 'Komputer w przedziale awioniki pod kokpitem. Zbiera dane z komputerów samolotu, wybiera te, które trzeba zapisać, i wysyła je do rejestratora danych. Ich kopię można też zgrać na ziemi do codziennych analiz bezpieczeństwa.' },
  mic: { name: 'mikrofon kokpitu', group: 'src', pos: [MIC_P[0] + 0.2, MIC_P[1] + 0.75, 0.5], sub: true, desc: 'Mikrofon na panelu nad głowami pilotów. Zbiera wszystkie dźwięki w kokpicie: rozmowy, alarmy, kliknięcia przełączników. Pozostałe trzy ścieżki rejestratora rozmów to mikrofony w słuchawkach załogi.' },
  sensors: { name: 'czujniki prędkości i wysokości', group: 'src', pos: [PITOT[0] + 0.6, PITOT[1] - 0.7, PITOT[2] + 0.4], sub: true, desc: 'Rurki Pitota, otworki ciśnienia statycznego i czujniki kąta natarcia na nosie samolotu. To z nich pochodzą zapisane prędkość i wysokość. Dane dają też czujniki w silnikach, przy sterach i w podwoziu.' },
  wiring: { name: 'przewody do rejestratorów', group: 'src', pos: [17, -1.0, 1.7], sub: true, desc: 'Dane i dźwięk biegną przewodami spod kokpitu, pod podłogą kabiny, aż do ogona. Rejestratory mają też własne zasilanie awaryjne, żeby nagrywały jeszcze przez kilka minut po utracie prądu w samolocie.' },
};

function RecLabels({ sel, onSelect }: { sel: string | null; onSelect: (id: string | null) => void }) {
  const col = (g: string) => REC_GROUPS.find((x) => x.id === g)?.color ?? '#e2e8f0';
  return (
    <>
      {Object.entries(REC_PART_INFO).map(([id, p]) => {
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

/* ============================== kamera i scena ============================== */

const BX = BENCH[0];
const BZ = BENCH[2];
const benchCam = (dx: number, dy: number, dz: number, tx = 0, ty = 0.1): { cam: V3; tgt: V3 } => ({ cam: [BX + dx, TOP + dy, BZ + dz], tgt: [BX + tx, TOP + ty, BZ] });
const testCam = (dx: number, dy: number, dz: number, ty = 0.1): { cam: V3; tgt: V3 } => ({ cam: [TEST[0] + 1.7 * dx, TOP + ty + 1.7 * (dy - ty), TEST[2] + 1.7 * dz], tgt: [TEST[0] - 0.05, TOP + ty, TEST[2]] });
const TAIL_CAM = { cam: [27.6, 2.8, 5.8] as V3, tgt: [22.9, 1.3, 0.2] as V3 };
const VIEWS: Record<Exclude<RecMode, 'home'>, { cam: V3; tgt: V3 }[]> = {
  data: [
    { cam: [-30, 12, 44], tgt: [-4, -1, 5] },
    { cam: [-22.5, 0.5, 8], tgt: [-28.3, -2.0, 0.4] },
    { cam: [8, 14, 40], tgt: [2, -0.5, 0] },
    TAIL_CAM,
    { cam: [30, 5, 12], tgt: [21, 0.8, 0] },
    { cam: [30, 5, 12], tgt: [21, 0.8, 0] },
  ],
  voice: [
    { cam: [-21.5, 4.6, 12.5], tgt: [-31.4, 0.2, 0] },
    { cam: [-19.5, 2.2, 13.5], tgt: [-30.0, 0.0, 0] },
    { cam: [6, 14, 40], tgt: [-4, -0.5, 0] },
    TAIL_CAM,
    { cam: [-19.5, 2.2, 13.5], tgt: [-30.0, 0.0, 0] },
    { cam: [-19.5, 2.2, 13.5], tgt: [-30.0, 0.0, 0] },
  ],
  build: [
    { cam: [BX + 3.4, TOP + 1.5, BZ + 5.0], tgt: [BX - 0.6, TOP + 1.3, BZ - 2.2] },
    benchCam(0.55, 0.55, 0.75, -0.08),
    benchCam(0.85, 0.35, 0.55, 0.12, 0.1),
    benchCam(0.55, 0.4, 0.75, 0.38, 0.12),
    benchCam(0.65, 0.25, 0.5, 0.25, 0.1),
    benchCam(-0.45, 0.45, 0.85, 0, 0.08),
    benchCam(-0.45, 0.45, 0.85, 0, 0.08),
  ],
  tests: [
    testCam(-0.25, 0.35, 0.75),
    testCam(0.35, 0.55, 0.8, 0.25),
    testCam(0.45, 0.4, 0.7, 0.15),
    testCam(0.4, 0.35, 0.7, 0.12),
    testCam(0.4, 0.4, 0.75, 0.2),
    testCam(0.55, 0.35, 0.6, 0.08),
    testCam(0.55, 0.35, 0.6, 0.08),
  ],
  search: [
    { cam: [4, 16, 42], tgt: [8, 0, 0] },
    { cam: [32, 9, 16], tgt: [20, 2.5, 0] },
    { cam: [27.5, 3.4, 7.5], tgt: [22.9, 1.4, 0.2] },
    { cam: [27.5, 3.4, 7.5], tgt: [22.9, 1.4, 0.2] },
    { cam: [27.5, 3.4, 7.5], tgt: [22.9, 1.4, 0.2] },
    { cam: [27.5, 3.4, 7.5], tgt: [22.9, 1.4, 0.2] },
    { cam: [27.5, 3.4, 7.5], tgt: [22.9, 1.4, 0.2] },
  ],
};

export function RecScene({ sim, sel, onSelect }: { sim: RecSim; sel: string | null; onSelect: (id: string | null) => void }) {
  const mode = sim.mode!;
  const stage = useStage(sim.getStage);
  const s = useMemo(() => sim.state(), [stage, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = mode === 'home' || stage < 0 ? null : VIEWS[mode][Math.min(stage, VIEWS[mode].length - 1)];
  const bench = mode === 'build' || mode === 'tests';
  return (
    <group>
      {mode !== 'home' && <StageCamera view={view} />}
      <XRecorder pos={FDR_P} glow={() => sim.state().fdrGlow} />
      <XRecorder pos={CVR_P} glow={() => sim.state().cvrGlow} />
      <XParts home={mode === 'home'} />
      <SensorBlips on={() => sim.state().sensors && sim.state().stage === 0} />
      <Flow paths={[PATHS.pitot, PATHS.static, PATHS.engine, PATHS.aileron, PATHS.elevator, PATHS.rudder]} color="#38bdf8" on={s.toDau || s.sensors} speed={5} count={90} />
      <Flow paths={[PATHS.fdr]} color="#f59e0b" on={s.toFdr} speed={6} count={60} width={0.08} />
      <Flow paths={[PATHS.mic]} color="#38bdf8" on={s.mic} speed={2} count={14} width={0.05} />
      <Flow paths={[PATHS.cvr]} color="#a78bfa" on={s.toCvr} speed={6} count={60} width={0.08} />
      {/* wyjmowanie rejestratora: droga z półki w ogonie na stół */}
      <Flow paths={[[FDR_P, [FDR_P[0] - 0.1, -1.6, 1.6], [BX - 0.1, TOP + 0.6, BZ - 0.4], [BX, TOP + 0.15, BZ]]]} color="#38bdf8" on={mode === 'build' && stage === 0} speed={1.4} count={10} width={0.05} />
      <Waves get={() => sim.state()} />
      {bench && <Table />}
      {mode === 'build' && <BenchRecorder get={() => sim.state()} />}
      {mode === 'tests' && <TestRig get={() => sim.state()} />}
      {mode === 'home' && <RecLabels sel={sel} onSelect={onSelect} />}
    </group>
  );
}

/* ============================== panele w rogu ============================== */

/** Odświeżanie panelu (panel jest w osobnym drzewie Html) – kilkanaście razy na sekundę. */
function useTick(fps = 20) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((n) => (n + 1) % 1e6), 1000 / fps);
    return () => window.clearInterval(id);
  }, [fps]);
}

function Screen({ title, children, w = 270 }: { title: string; children: ReactNode; w?: number }) {
  return (
    <div style={{ width: w, background: '#05080c', border: '1px solid #2a323c', borderRadius: 6, padding: '6px 8px 8px', fontFamily: cockpitFont, color: '#e5e7eb', boxShadow: '0 4px 14px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: AIRBUS.cyan, borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 3, marginBottom: 5 }}>{title}</div>
      {children}
    </div>
  );
}

/** Pętla zapisu: pasek 25 godzin, głowica zapisu i najstarszy zapis nadpisywany. */
function Loop({ k, color }: { k: number; color: string }) {
  const W = 250;
  const x = (k % 1) * W;
  return (
    <svg width={W} height={34} viewBox={`0 0 ${W} 34`} style={{ display: 'block', marginTop: 4 }}>
      <rect x={0} y={8} width={W} height={12} rx={3} fill="#1f2937" />
      <rect x={0} y={8} width={x} height={12} rx={3} fill={color} opacity={0.85} />
      <rect x={x} y={8} width={W - x} height={12} fill={color} opacity={0.35} />
      <rect x={x} y={8} width={Math.min(14, W - x)} height={12} fill="#ef4444" opacity={0.85} />
      <line x1={x} x2={x} y1={4} y2={24} stroke="#fff" strokeWidth={2} />
      <text x={2} y={32} fontSize={8} fill="#9ca3af">
        najnowszy zapis ←
      </text>
      <text x={W - 2} y={32} fontSize={8} fill="#9ca3af" textAnchor="end">
        25 h · najstarszy nadpisywany
      </text>
    </svg>
  );
}

/** Ekran zapisu FDR: przebiegi kilku parametrów (umowny lot w przelocie z zakrętem i lekką turbulencją). */
function DataScreen({ sim }: { sim: RecSim }) {
  useTick(20);
  const t = Math.max(0, sim.getT());
  const st = sim.getStage();
  const rec = st >= 3;
  const W = 250;
  const N = 60;
  const ch = [
    { name: 'WYSOKOŚĆ', unit: 'ft', c: '#22c55e', f: (u: number) => 37000 + 60 * Math.sin(u * 0.9) + 25 * Math.sin(u * 3.1), lo: 36800, hi: 37200, dp: 0 },
    { name: 'PRĘDKOŚĆ', unit: 'kt', c: '#38bdf8', f: (u: number) => 278 + 4 * Math.sin(u * 0.7) + 1.5 * Math.sin(u * 4.3), lo: 268, hi: 288, dp: 0 },
    { name: 'PRZECHYLENIE', unit: '°', c: '#f59e0b', f: (u: number) => 22 * Math.max(0, Math.sin(u * 0.35)) ** 0.6 + 1.5 * Math.sin(u * 2.7), lo: -10, hi: 30, dp: 1 },
    { name: 'N1 SILNIKÓW', unit: '%', c: '#a78bfa', f: (u: number) => 84 + 1.2 * Math.sin(u * 0.5) + 0.4 * Math.sin(u * 3.7), lo: 80, hi: 88, dp: 1 },
  ];
  return (
    <Screen title={`FDR · ZAPIS DANYCH ${rec ? '● REC' : ''}`}>
      {ch.map((c) => {
        const pts = Array.from({ length: N }, (_, i) => {
          const u = t - (N - 1 - i) * 0.1;
          const v = c.f(u);
          return `${(i / (N - 1)) * W},${26 - ((v - c.lo) / (c.hi - c.lo)) * 22}`;
        }).join(' ');
        return (
          <div key={c.name} style={{ marginBottom: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
              <span style={{ color: c.c }}>{c.name}</span>
              <span>
                {c.f(t).toFixed(c.dp)} {c.unit}
              </span>
            </div>
            <svg width={W} height={28} viewBox={`0 0 ${W} 28`} style={{ display: 'block', background: '#0b1118' }}>
              <polyline points={pts} fill="none" stroke={c.c} strokeWidth={1.4} opacity={rec ? 1 : 0.55} />
            </svg>
          </div>
        );
      })}
      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>…i kilka tysięcy innych parametrów</div>
      {st >= 4 && <Loop k={(t * 0.05) % 1} color="#f97316" />}
    </Screen>
  );
}
(DataScreen as unknown as { cockpitSlot: string }).cockpitSlot = 'ecam';

/** Ekran CVR: cztery ścieżki dźwięku (umowne „mowa” i szum). */
function VoiceScreen({ sim }: { sim: RecSim }) {
  useTick(20);
  const t = Math.max(0, sim.getT());
  const st = sim.getStage();
  const tracks = [
    { name: 'KAPITAN', c: '#38bdf8', talk: (u: number) => Math.sin(u * 0.9) > 0.3 },
    { name: 'PIERWSZY OFICER', c: '#22c55e', talk: (u: number) => Math.sin(u * 0.9 + 2.6) > 0.4 },
    { name: 'TRZECI CZŁONEK ZAŁOGI', c: '#a78bfa', talk: (u: number) => Math.sin(u * 0.37 + 1) > 0.85 },
    { name: 'MIKROFON KOKPITU', c: '#f59e0b', talk: () => true },
  ];
  const W = 250;
  const N = 70;
  const noise = (a: number) => {
    const x = Math.sin(a * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  return (
    <Screen title={`CVR · 4 ŚCIEŻKI ${st >= 2 ? '● REC' : ''}`}>
      {tracks.map((tr, k) => (
        <div key={tr.name} style={{ marginBottom: 3 }}>
          <div style={{ fontSize: 9, color: tr.c }}>{tr.name}</div>
          <svg width={W} height={20} viewBox={`0 0 ${W} 20`} style={{ display: 'block', background: '#0b1118' }}>
            {Array.from({ length: N }, (_, i) => {
              const u = t - (N - 1 - i) * 0.06;
              const step = Math.floor(u * 16);
              const base = k === 3 ? 0.18 + 0.12 * noise(step + 7) : 0.04;
              const a = tr.talk(u) ? 0.35 + 0.6 * noise(step * 3 + k) : base;
              const h = Math.max(1, a * 18);
              return <rect key={i} x={(i / N) * W} y={10 - h / 2} width={W / N - 1} height={h} fill={tr.c} opacity={0.85} />;
            })}
          </svg>
        </div>
      ))}
      {st >= 3 && <Loop k={(t * 0.05) % 1} color="#a78bfa" />}
    </Screen>
  );
}
(VoiceScreen as unknown as { cockpitSlot: string }).cockpitSlot = 'ecam';

/** Panel RCDR nad głową pilotów (pokazuje użycie w scenariuszu – nie do klikania). */
function RcdrPanel({ sim }: { sim: RecSim }) {
  useTick(10);
  const st = sim.getStage();
  const t = sim.getT();
  const press = st === 4 && t >= 0 && (t - stStart('voice', 4)) % 4 > 1.5 && (t - stStart('voice', 4)) % 4 < 2.3;
  return (
    <div style={{ pointerEvents: 'none' }}>
      <PanelBox title="RCDR">
        <Pushbutton label="GND CTL" bottom={{ text: 'ON', color: AIRBUS.cyan, on: false }} size={40} />
        <Pushbutton label="CVR ERASE" act={press} size={40} />
        <Pushbutton label="CVR TEST" size={40} />
      </PanelBox>
    </div>
  );
}

/** Rejestrator z boku i przekrój modułu pamięci – wyróżniona część, o której mówi bieżący etap. */
function BuildScreen({ sim }: { sim: RecSim }) {
  useTick(10);
  const st = sim.getStage();
  const hi = (ids: number[]) => ids.includes(st);
  const dim = (on: boolean) => (on ? 1 : 0.35);
  const layers = [
    { r: 46, c: ORANGE, name: 'pancerz (stal lub tytan)' },
    { r: 36, c: '#efe6cf', name: 'izolacja' },
    { r: 26, c: '#b9a27a', name: 'blok termiczny' },
  ];
  return (
    <Screen title="REJESTRATOR DANYCH · BUDOWA">
      <svg width={250} height={86} viewBox="0 0 250 86" style={{ display: 'block' }}>
        <rect x={6} y={74} width={238} height={6} fill="#4b5563" />
        <g opacity={dim(hi([0, 1, 5]))}>
          <rect x={14} y={30} width={120} height={44} fill={ORANGE} stroke={hi([1]) ? '#a78bfa' : 'none'} strokeWidth={3} />
          <text x={74} y={56} fontSize={9} fill="#111" textAnchor="middle" fontWeight={700}>
            elektronika
          </text>
        </g>
        <g opacity={dim(hi([0, 2, 3, 5]))}>
          <rect x={136} y={22} width={74} height={50} rx={10} fill={ORANGE} stroke={hi([2, 3]) ? '#fde68a' : 'none'} strokeWidth={3} />
          <rect x={150} y={22} width={6} height={50} fill="#f4f6f8" />
          <rect x={190} y={22} width={6} height={50} fill="#f4f6f8" />
          <text x={173} y={88} fontSize={8} fill="#e5e7eb" textAnchor="middle">
            moduł pamięci
          </text>
        </g>
        <g opacity={dim(hi([0, 4, 5]))}>
          <rect x={210} y={40} width={30} height={14} rx={4} fill="#d9dde2" stroke={hi([4]) ? AIRBUS.cyan : 'none'} strokeWidth={3} />
          <text x={225} y={16} fontSize={8} fill="#e5e7eb" textAnchor="middle">
            nadajnik
          </text>
        </g>
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, opacity: dim(hi([2, 3])) }}>
        <svg width={100} height={100} viewBox="-50 -50 100 100">
          {layers.map((l) => (
            <circle key={l.r} r={l.r} fill={l.c} />
          ))}
          <rect x={-14} y={-6} width={28} height={12} fill="#15803d" />
          {[-9, -3, 3, 9].map((x) => (
            <rect key={x} x={x - 2} y={-4} width={4} height={8} fill="#111827" />
          ))}
        </svg>
        <div style={{ fontSize: 9, display: 'grid', gap: 3 }}>
          {layers.map((l) => (
            <span key={l.r} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: l.c }} />
              {l.name}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 9, background: '#15803d' }} />
            płytka z pamięcią
          </span>
        </div>
      </div>
    </Screen>
  );
}
(BuildScreen as unknown as { cockpitSlot: string }).cockpitSlot = 'ecam';

const TEST_CARDS = [
  { name: 'Uderzenie', val: '3400 g' },
  { name: 'Przebicie', val: '227 kg z 3 m' },
  { name: 'Zgniatanie', val: '22 kN · 5 min' },
  { name: 'Pożar', val: '1100 °C · 60 min' },
  { name: 'Głębia', val: '6000 m · 30 dni' },
];
function TestsScreen({ sim }: { sim: RecSim }) {
  useTick(15);
  const s = sim.state();
  const i = s.test;
  return (
    <Screen title="PRÓBY MODUŁU PAMIĘCI">
      <div style={{ display: 'grid', gap: 4 }}>
        {TEST_CARDS.map((c, k) => {
          const done = i > k;
          const now = i === k;
          return (
            <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 6, fontSize: 10, opacity: i < 0 || done || now ? 1 : 0.4 }}>
              <span style={{ fontWeight: now ? 700 : 400 }}>
                {done ? '✓ ' : now ? '▶ ' : '· '}
                {c.name}
              </span>
              <span style={{ color: now ? '#fde68a' : '#9ca3af' }}>{c.val}</span>
              {now && (
                <div style={{ gridColumn: '1 / -1', height: 5, background: '#1f2937', borderRadius: 3 }}>
                  <div style={{ width: `${s.testP * 100}%`, height: 5, background: '#f59e0b', borderRadius: 3 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: i >= 5 ? '#22c55e' : '#9ca3af' }}>{i >= 5 ? 'PAMIĘĆ ODCZYTANA · ZAPIS KOMPLETNY ✓' : 'pamięć: sprawdzana po próbach'}</div>
    </Screen>
  );
}
(TestsScreen as unknown as { cockpitSlot: string }).cockpitSlot = 'ecam';

/** Poszukiwania: rysunek do każdego etapu (satelity, ELT, morze z dnem, statek, robot, laboratorium). */
function SearchScreen({ sim }: { sim: RecSim }) {
  useTick(20);
  const st = sim.getStage();
  const t = Math.max(0, sim.getT());
  const W = 250;
  const H = 150;
  const pulse = (period: number, phase = 0) => ((t + phase) % period) / period;
  const sea = st >= 2 && st <= 4;
  const ringsAt = (x: number, y: number, color: string, max: number, n = 3, period = 1) =>
    Array.from({ length: n }, (_, k) => {
      const u = pulse(period, (k * period) / n);
      return <circle key={k} cx={x} cy={y} r={4 + u * max} fill="none" stroke={color} strokeWidth={1.5} opacity={1 - u} />;
    });
  const sat = (x: number, y: number) => (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-4} y={-4} width={8} height={8} fill="#cbd5e1" />
      <rect x={-16} y={-2} width={10} height={4} fill="#38bdf8" />
      <rect x={6} y={-2} width={10} height={4} fill="#38bdf8" />
    </g>
  );
  const plane = (x: number, y: number, s = 1) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-14 0 L12 0 L16 -2 L12 2 L-14 2 Z" fill="#e5e7eb" />
      <path d="M-2 1 L-8 9 L-4 9 L4 1 Z" fill="#cbd5e1" />
      <path d="M-12 0 L-15 -6 L-12 -6 L-8 0 Z" fill="#cbd5e1" />
    </g>
  );
  let body: ReactNode = null;
  if (st <= 0) {
    body = (
      <>
        <circle cx={W / 2} cy={H + 120} r={170} fill="#0f2a44" />
        {sat(40, 22)}
        {sat(200, 30)}
        {plane(110 + 20 * Math.sin(t * 0.3), 80)}
        {ringsAt(110 + 20 * Math.sin(t * 0.3), 80, '#38bdf8', 26, 2, 1.5)}
        <line x1={110} y1={76} x2={40} y2={26} stroke="#38bdf8" strokeDasharray="3 3" opacity={pulse(1.5) < 0.5 ? 1 : 0.3} />
        <text x={8} y={H - 6} fontSize={9} fill="#9ca3af">
          pozycja co minutę przez satelity
        </text>
      </>
    );
  } else if (st === 1) {
    body = (
      <>
        <rect x={0} y={110} width={W} height={40} fill="#3f3a2e" />
        <path d="M70 110 L95 102 L118 108 L130 104 L150 110 Z" fill="#9ca3af" />
        {ringsAt(112, 102, '#a78bfa', 40, 3, 1.4)}
        {sat(190, 22)}
        <line x1={112} y1={100} x2={186} y2={26} stroke="#a78bfa" strokeDasharray="3 3" />
        <line x1={194} y1={28} x2={224} y2={104} stroke="#a78bfa" strokeDasharray="3 3" />
        <rect x={214} y={104} width={22} height={10} fill="#cbd5e1" />
        <text x={8} y={20} fontSize={9} fill="#c4b5fd">
          ELT · 406 MHz
        </text>
        <text x={W - 8} y={H - 6} fontSize={9} fill="#9ca3af" textAnchor="end">
          stacja ratownicza
        </text>
      </>
    );
  } else if (sea) {
    const shipX = st === 3 ? 30 + ((t * 18) % 190) : 150;
    const rov = st === 4 ? clamp01((t - stStart('search', 4)) / 5) : 0;
    const rovY = 30 + 90 * (rov < 0.6 ? rov / 0.6 : 1 - (rov - 0.6) / 0.4);
    body = (
      <>
        <rect x={0} y={0} width={W} height={26} fill="#0b1220" />
        <rect x={0} y={26} width={W} height={H - 26} fill="#0c3a5c" />
        <path d={`M0 ${H - 14} Q60 ${H - 24} 120 ${H - 16} T${W} ${H - 18} L${W} ${H} L0 ${H} Z`} fill="#4b3f2f" />
        <rect x={146} y={H - 24} width={14} height={7} rx={2} fill={ORANGE} />
        {st >= 2 && st <= 3 && ringsAt(153, H - 21, '#fb923c', 60, 3, 1)}
        <g transform={`translate(${shipX} 26)`}>
          <path d="M-18 -8 L18 -8 L13 0 L-13 0 Z" fill="#e5e7eb" />
          <rect x={-6} y={-15} width={10} height={7} fill="#cbd5e1" />
          {st === 3 && (
            <>
              <line x1={-14} y1={-2} x2={-44} y2={54} stroke="#9ca3af" strokeDasharray="2 2" />
              <rect x={-50} y={52} width={12} height={5} rx={2} fill="#22c55e" />
            </>
          )}
          {st === 4 && (
            <>
              <line x1={0} y1={0} x2={0} y2={rovY - 26} stroke="#9ca3af" />
              <rect x={-8} y={rovY - 26} width={16} height={10} rx={2} fill="#eab308" />
            </>
          )}
        </g>
        <text x={8} y={42} fontSize={9} fill="#fdba74">
          {st === 2 ? 'pisk co sekundę · 37,5 kHz · 90 dni' : st === 3 ? 'hydrofon nasłuchuje' : 'robot podwodny'}
        </text>
      </>
    );
  } else {
    const n = 40;
    const path = Array.from({ length: n }, (_, i) => `${20 + i * 5.2},${70 - 30 * Math.sin(i * 0.15) + 6 * Math.sin(i * 0.9)}`).join(' ');
    const k = Math.floor(pulse(6) * n);
    body = (
      <>
        <rect x={0} y={0} width={W} height={H} fill="#0b1118" />
        <rect x={14} y={104} width={60} height={30} rx={3} fill="#1f2937" />
        <rect x={26} y={112} width={36} height={8} fill="#15803d" />
        <line x1={74} y1={119} x2={110} y2={119} stroke="#9ca3af" />
        <rect x={110} y={100} width={120} height={40} rx={3} fill="#111827" stroke="#374151" />
        <text x={118} y={114} fontSize={8} fill="#22c55e">
          KPT: „…”
        </text>
        <text x={118} y={126} fontSize={8} fill="#38bdf8">
          FO: „…”
        </text>
        <polyline points={path} fill="none" stroke="#f59e0b" strokeWidth={1.6} />
        {plane(20 + k * 5.2, 70 - 30 * Math.sin(k * 0.15) + 6 * Math.sin(k * 0.9), 0.6)}
        <text x={8} y={16} fontSize={9} fill="#fcd34d">
          odtworzony lot i rozmowy
        </text>
      </>
    );
  }
  return (
    <Screen title="POSZUKIWANIA">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: '#0b1118', borderRadius: 3 }}>
        {body}
      </svg>
    </Screen>
  );
}
(SearchScreen as unknown as { cockpitSlot: string }).cockpitSlot = 'ecam';

/* ============================== nakładka (ramka informacji i dok) ============================== */

export function RecLab({ sim, sel }: { sim: RecSim; sel: string | null }) {
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
  if (mode === 'home') {
    const info = sel ? REC_PART_INFO[sel] : null;
    const g = info ? REC_GROUPS.find((x) => x.id === info.group) : undefined;
    return (
      <InfoPortal>
        {info ? (
          <>
            <div style={{ fontWeight: 700, color: g?.color }}>{info.name}</div>
            {g && <div style={{ fontSize: 12, opacity: 0.7 }}>{g.name}</div>}
            <div>{info.desc}</div>
          </>
        ) : (
          <div>Rejestratory i przewody są pokazane prześwietlone przez poszycie. Kliknij podpis, aby przeczytać, do czego służy dana część.</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
          {REC_GROUPS.map((gr) => (
            <span key={gr.id} style={{ color: gr.color }}>
              {gr.name}
            </span>
          ))}
        </div>
      </InfoPortal>
    );
  }
  const stages = REC_STAGES[mode];
  const s = sim.getStage();
  const cur = s >= 0 && s < stages.length ? stages[s] : null;
  const screen =
    mode === 'data' ? <DataScreen sim={sim} /> : mode === 'voice' ? <VoiceScreen sim={sim} /> : mode === 'build' ? <BuildScreen sim={sim} /> : mode === 'tests' ? <TestsScreen sim={sim} /> : <SearchScreen sim={sim} />;
  return (
    <>
      <CockpitDock>
        {screen}
        {mode === 'voice' && s >= 4 && <RcdrPanel sim={sim} />}
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

/** Numery zakładek na modelu (strona główna): każdy przy części, której dotyczy zakładka. */
export const REC_SPOTS: V3[] = [
  [FDR_P[0] + 0.35, FDR_P[1] + 1.15, 0.5], // strona główna
  [FDR_P[0] - 1.3, FDR_P[1] - 0.35, 1.7], // dane
  [CVR_P[0] + 1.1, CVR_P[1] - 0.45, 1.3], // rozmowy
  [FDR_P[0] - 0.5, FDR_P[1] - 1.35, 1.8], // budowa
  [CVR_P[0] + 0.55, CVR_P[1] - 1.55, 1.3], // próby
  [ELT_X - 1.0, ELT_ANT[1] + 0.15, 0.8], // poszukiwania
];
