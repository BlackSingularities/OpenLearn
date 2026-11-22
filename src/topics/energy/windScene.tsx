/*
 * Elektrownia wiatrowa – wspólna scena 3D wszystkich zakładek tematu. Tryb zakładki (params.mode) decyduje,
 * co widać: turbina na polu wśród farmy, otwarta gondola, wieża w przekroju, fundament w wykopie, morze,
 * montaż dźwigiem, sieć energetyczna. Turbina pracuje według prawdziwej krzywej mocy: obroty, ustawienie łopat
 * i moc wynikają z prędkości wiatru.
 */
import { Fragment, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { useModuleHome, useTopicNav } from '../../lib/topicNav';
import { PauseContext } from '../../lib/useAnimationClock';
import { Lbl } from '../aviation/airliner';
import { DEG, FARM, HUB, HUB_Y, R, SUBSTATION, T, VILLAGE, clamp, groundH, mix, opPoint, sectionLoop, shear, sm, twistAt, windPower, type OpPoint, type V3 } from './windGeo';
import { HS_OFFSET, RATIO, Turbine, drivePt, newState, type TurbineState } from './windTurbine';
import { StreamTube, TipVortices, WindTrails, speedAt, worldToWind, type FieldTurbine, type Region, type WindField } from './windFx';
import { Clouds, Ground, Sea, Seabed, Sky, Stars, Trees, Village, type Weather } from './windWorld';
import {
  AirSlab,
  AirfoilForces,
  BATTERY,
  BatteryStorage,
  BladeSegment,
  EnergyFlow,
  FoundationPit,
  LIFT_R,
  MetMast,
  OFF_BASE,
  OffshoreBase,
  PIT_R,
  PYLONS,
  PowerLine,
  Substation,
  SweptDisc,
  cableRoute,
  offDepth,
  type OffKind,
} from './windExtras';
import { BUILD_STAGES, BuildSite, buildStatus } from './windBuild';

const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

/* ================= ustawienia trybów ================= */

type GroundKind = 'land' | 'pit' | 'sea';
interface Cfg {
  weather: Weather;
  V: number;
  trails: 'near' | 'farm' | 'none';
  open: boolean;
  towerCut: boolean;
  hubOpen: boolean;
  gearCut: boolean;
  genCut: boolean;
  drive: 'gear' | 'direct';
  /** spowolnienie ruchu wirnika (zbliżenia na przekładnię) */
  slow: number;
  ground: GroundKind;
  others: boolean;
  main: boolean;
  /** wirnik zatrzymany w tym położeniu (rad) */
  lock?: number;
  swept: boolean;
}
const BASE: Cfg = { weather: 'day', V: 9, trails: 'none', open: false, towerCut: false, hubOpen: false, gearCut: false, genCut: false, drive: 'gear', slow: 1, ground: 'land', others: true, main: true, swept: false };
const CFG: Record<string, Partial<Cfg>> = {
  home: { trails: 'near' },
  'wi-home': { trails: 'near', swept: true },
  'wi-shear': { trails: 'near' },
  'wi-power': { swept: true },
  'wi-betz': { trails: 'near' },
  'ro-home': { lock: 0 },
  'ro-lift': { lock: Math.PI / 2 },
  'ro-twist': { lock: Math.PI / 2 },
  'ro-tip': {},
  'ro-build': {},
  'na-home': { open: true },
  'na-gear': { open: true, gearCut: true, slow: 0.12 },
  'na-gen': { open: true, genCut: true, slow: 0.12 },
  'na-direct': { open: true, drive: 'direct' },
  'na-brake': { open: true },
  'ct-home': { open: true, hubOpen: true, lock: 0 },
  'ct-yaw': { trails: 'near' },
  'ct-pitch': { hubOpen: true },
  'ct-curve': { trails: 'near' },
  'ct-storm': { weather: 'storm', trails: 'near' },
  'to-home': { towerCut: true },
  'to-found': { ground: 'pit' },
  'to-off': { ground: 'sea', others: false },
  'to-build': { main: false },
  'gr-home': {},
  'gr-nacelle': { open: true, towerCut: true },
  'gr-line': {},
  'gr-balance': {},
  'fa-home': {},
  'fa-wake': { trails: 'farm' },
  'fa-off': { ground: 'sea' },
  'fa-night': { weather: 'night' },
};
/** Zakładki przeglądu („tour-xx”) wyglądają jak strony główne modułów, ale bez podpisów części. */
const cfgOf = (mode: string): Cfg => ({ ...BASE, ...(CFG[mode.startsWith('tour-') ? `${mode.slice(5)}-home` : mode] ?? {}) });

/* ================= części do kliknięcia ================= */

export interface PartInfo {
  name: string;
  desc: string;
  pos: V3;
  link?: string;
}
const TH = T.towerH;
/** Punkt łopaty k (wirnik zatrzymany w kącie a) w odległości r od osi. */
function bladeAt(a: number, k: number, r: number, off: V3 = [0, 0, 0]): V3 {
  const ang = a + (k * 2 * Math.PI) / 3;
  return [HUB[0] + r * Math.sin(T.cone) + off[0], HUB[1] + r * Math.cos(ang) + off[1], r * Math.sin(ang) + off[2]];
}

function homeParts(mode: string): Record<string, PartInfo> | null {
  switch (mode) {
    case 'wi-home':
      return {
        wind: { name: 'wiatr', desc: 'Poruszające się powietrze. Smugi pokazują, jak płynie: białe – z pełną prędkością, niebieskie – spowolnione przez wirnik. Przy ziemi wiatr jest słabszy, bo hamują go drzewa, budynki i nierówności terenu.', pos: [190, 135, 60] },
        disc: { name: 'pole zakreślane przez wirnik', desc: 'Koło, które zakreślają końce łopat – tu ma 150 m średnicy i ok. 17 700 m², tyle co dwa i pół boiska piłkarskiego. Im większe koło, tym więcej wiatru „łapie” turbina: dwa razy dłuższe łopaty to cztery razy więcej energii.', pos: [12, HUB_Y + 58, 46] },
        hub: { name: 'wysokość piasty', desc: 'Środek wirnika jest ok. 120 m nad ziemią – wyżej niż najwyższe drzewa i kościoły. Na tej wysokości wiatr jest silniejszy i równiejszy niż przy ziemi.', pos: [6, 62, 6] },
        wake: { name: 'ślad aerodynamiczny', desc: 'Za wirnikiem powietrze płynie wolniej i jest bardziej poburzone. Ślad ciągnie się na setki metrów, zanim wiatr z otoczenia go „rozmiesza” – dlatego turbiny na farmie stoją daleko od siebie.', pos: [-230, HUB_Y + 20, -30] },
        ground: { name: 'wiatr przy ziemi', desc: 'Kilka metrów nad polem wiatr jest wyraźnie słabszy i bardziej porywisty. Dlatego turbiny są tak wysokie – każde dodatkowe 10 m wieży to kilka procent więcej energii w roku.', pos: [140, 18, 70] },
      };
    case 'ro-home': {
      const a = 0;
      return {
        blade: { name: 'łopata', desc: 'Łopata ma 73,5 m – więcej niż rozpiętość skrzydeł dużego samolotu pasażerskiego – i waży ok. 25 t. Jest pusta w środku, zrobiona z włókna szklanego i węglowego sklejonego żywicą. Działa jak skrzydło: opływające ją powietrze wytwarza siłę, która obraca wirnik.', pos: bladeAt(a, 0, 38, [2, 0, 0]) },
        tip: { name: 'końcówka i pasy ostrzegawcze', desc: 'Czerwone pasy ostrzegają pilotów samolotów i śmigłowców. W końcówce kryją się też metalowe odgromniki – piorun trafia w nie, a kabel wewnątrz łopaty odprowadza prąd do ziemi. Koniec łopaty pędzi nawet z prędkością ok. 300 km/h.', pos: bladeAt(a, 0, 70, [3, 0, 0]) },
        lead: { name: 'krawędź natarcia', desc: 'Przednia, zaokrąglona krawędź łopaty – to nią łopata „tnie” powietrze. Deszcz, grad i owady przy prędkości setek km/h ścierają ją jak papier ścierny, dlatego pokrywa się ją specjalną taśmą ochronną.', pos: bladeAt(a, 1, 46, [2, 1.5, 0]) },
        trail: { name: 'krawędź spływu z ząbkami', desc: 'Tylna, ostra krawędź. Przy końcu łopaty ma ząbki – jak pióra sowy – które rozbijają wiry powietrza i ściszają szum turbiny o kilka decybeli.', pos: bladeAt(a, 2, 62, [2, -1.5, 0]) },
        root: { name: 'nasada łopaty', desc: 'Najgrubsza część łopaty, okrągła jak rura o średnicy 3,4 m. Ponad sto stalowych śrub mocuje ją do łożyska w piaście. Tu działają największe siły – cała łopata „wisi” na nasadzie.', pos: bladeAt(a, 2, 8, [1, 0, 0]) },
        spinner: { name: 'kołpak (owiewka piasty)', desc: 'Opływowa osłona z laminatu na piaście. Chroni przed deszczem i śniegiem żeliwną piastę i mechanizmy ustawiania łopat. W środku jest miejsce dla serwisanta.', pos: [HUB[0] + 4.2, HUB[1] + 2.8, 0] },
      };
    }
    case 'na-home':
      return {
        shaft: { name: 'wał główny', desc: 'Gruby stalowy wał (średnica ok. 0,8 m) przenosi obrót z piasty do przekładni. Kręci się powoli – ok. 10 razy na minutę – ale z ogromną siłą: moment obrotowy to ok. 4 mln niutonometrów, tysiące razy więcej niż w silniku samochodu.', pos: drivePt(2.6, 0.9, 0.9) },
        bearing: { name: 'łożysko główne', desc: 'Podtrzymuje wał i cały wirnik ważący ok. 100 t. Przenosi też nacisk wiatru na wirnik – siła odpowiada ciężarowi kilkudziesięciu samochodów.', pos: drivePt(3.6, 1.3, 1.1) },
        gear: { name: 'przekładnia', desc: 'Zamienia powolne obroty wału (ok. 10 obr/min) na szybkie (ok. 1000 obr/min), których potrzebuje generator – jak przerzutka w rowerze, tylko odwrotnie. Waży ok. 40 t i ma w środku kilkaset litrów oleju.', pos: drivePt(0.2, 1.9, 1.3) },
        brake: { name: 'hamulec tarczowy', desc: 'Tarcza na wale szybkoobrotowym i zacisk jak w samochodzie. Nie służy do zwykłego hamowania – wirnik zwalnia, gdy łopaty obrócą się w chorągiewkę. Hamulec tylko unieruchamia już zwolniony wirnik, np. na czas prac serwisowych.', pos: drivePt(-2.75, HS_OFFSET + 1.0, 0.5) },
        gen: { name: 'generator', desc: 'Zamienia ruch obrotowy na prąd elektryczny. Wirujące magnesy (elektromagnesy) przesuwają się obok miedzianych uzwojeń i wytwarzają w nich prąd – ta sama zasada co w dynamie rowerowym.', pos: drivePt(-4.9, HS_OFFSET + 1.1, 0.9) },
        conv: { name: 'przekształtnik', desc: 'Elektronika mocy, która dopasowuje prąd z generatora do sieci: ten sam kształt fal, częstotliwość 50 Hz i napięcie, niezależnie od tego, jak szybko kręci się wirnik.', pos: [-6.2, TH + 3.0, -1.4] },
        trafo: { name: 'transformator', desc: 'Podwyższa napięcie z ok. 700 V do 30 000 V. Przy wyższym napięciu ten sam przesył energii wymaga mniejszego prądu, więc w kablach traci się mniej energii na ciepło.', pos: [-7.95, TH + 3.2, 0.8] },
        cool: { name: 'chłodnica', desc: 'Przekładnia, generator i przekształtnik grzeją się – ok. 3–5% energii zamienia się w ciepło. Płyn chłodzący oddaje je powietrzu w chłodnicy na dachu.', pos: [-7.5, TH + 6.0, 0] },
        sens: { name: 'czujniki wiatru', desc: 'Anemometr ultradźwiękowy mierzy prędkość wiatru, mierząc czas biegu dźwięku między przetwornikami. Wiatrowskaz podaje kierunek. Na maszcie świeci też lampa ostrzegawcza dla samolotów.', pos: [-8.2, TH + 7.3, 0] },
        yaw: { name: 'układ obrotu gondoli', desc: 'Sześć silników z kołami zębatymi zazębia się z wielkim wieńcem na szczycie wieży i obraca całą gondolę z wirnikiem (ok. 250 t) w stronę wiatru.', pos: [1.6, TH + 0.6, 1.6] },
        crane: { name: 'suwnica serwisowa', desc: 'Mały dźwig pod dachem gondoli. Wciąga z ziemi narzędzia i części zamienne, np. silniki czy pompy, bez wzywania wielkiego dźwigu.', pos: [-4.0, TH + 4.4, 0.4] },
      };
    case 'ct-home':
      return {
        sens: { name: 'anemometr i wiatrowskaz', desc: 'Oczy turbiny. Sterownik co ułamek sekundy odczytuje prędkość i kierunek wiatru i na tej podstawie decyduje, jak ustawić gondolę i łopaty.', pos: [-8.2, TH + 7.3, 0] },
        ctrl: { name: 'sterownik', desc: 'Komputer turbiny. Pilnuje setek czujników – temperatur, drgań, obrotów, napięć – i sam podejmuje decyzje. Łączy się z centrum nadzoru, z którego operator może sprawdzić i zatrzymać każdą turbinę na farmie.', pos: [-2.6, TH + 2.7, 1.7] },
        yaw: { name: 'silniki obrotu gondoli', desc: 'Obracają gondolę pod wiatr – powoli, ok. pół stopnia na sekundę. Gdy gondola stoi, trzymają ją hamulce obrotu, żeby wiatr nią nie szarpał.', pos: [1.6, TH + 0.6, 1.6] },
        ring: { name: 'łożysko obrotu z wieńcem', desc: 'Wielkie łożysko kulkowe o średnicy ok. 3 m z zębami na obwodzie. Na nim „siedzi” cała gondola z wirnikiem.', pos: [-1.2, TH + 0.3, -1.6] },
        pitch: { name: 'napędy łopat', desc: 'W piaście, przy nasadzie każdej łopaty, jest silnik z przekładnią, który obraca łopatę wokół jej osi – to tzw. ustawianie kąta łopat. Akumulatory w piaście pozwalają ustawić łopaty w chorągiewkę nawet po zaniku prądu.', pos: [HUB[0] + 1.5, HUB[1] + 3.6, 1.8] },
        bearing: { name: 'łożysko łopaty', desc: 'Pierścień o średnicy ponad 3 m, na którym obraca się łopata. Musi wytrzymać siły, którymi wiatr szarpie łopatą, i działać przez 25 lat.', pos: [HUB[0] + 0.8, HUB[1] - 2.6, 2.8] },
      };
    case 'to-home':
      return {
        seg: { name: 'segmenty wieży', desc: 'Wieża ma 117 m i składa się z pięciu stalowych rur, zwężających się ku górze (od 4,5 do 3,1 m średnicy). Każdy segment przyjeżdża osobno na ciężarówce – szerszy nie zmieściłby się pod wiaduktami.', pos: [3.2, 56, 1.4] },
        flange: { name: 'kołnierz ze śrubami', desc: 'Segmenty łączy się kołnierzami: grubymi stalowymi pierścieniami skręcanymi setkami śrub. Serwisanci co jakiś czas sprawdzają kluczem dynamometrycznym, czy żadna się nie poluzowała.', pos: [-2.6, 44.5, -0.6] },
        platform: { name: 'podest', desc: 'Przy każdym kołnierzu jest podest – miejsce na odpoczynek przy wspinaczce i do pracy przy śrubach.', pos: [-1.6, 68.6, -1.2] },
        ladder: { name: 'drabina', desc: 'Drabina biegnie przez całą wysokość wieży. Serwisant wspina się przypięty do szyny, która w razie poślizgu blokuje upadek. Wejście na górę po drabinie zajmuje ok. 30–40 minut.', pos: [0.3, 30, -2.4] },
        lift: { name: 'winda serwisowa', desc: 'Mała winda dla dwóch osób jedzie na stalowych linach. Wjazd na górę trwa kilka minut – dużo szybciej i bezpieczniej niż wspinaczka.', pos: [-1.8, 86, -1.8] },
        cable: { name: 'kable energetyczne', desc: 'Grube kable prowadzą prąd z transformatora w gondoli na dół. Pod szczytem wieży zwisają luźno w pętli, żeby gondola mogła się obracać. Gdy po wielu obrotach w jedną stronę skręcą się za bardzo, sterownik odkręca gondolę z powrotem.', pos: [1.2, 100, -0.6] },
        door: { name: 'drzwi i schodki', desc: 'Jedyne wejście do turbiny. Za drzwiami jest rozdzielnia średniego napięcia, a z niej kabel biegnie pod ziemią do stacji elektroenergetycznej.', pos: [4.2, 4.6, -1.2] },
        switch: { name: 'rozdzielnia', desc: 'Szafy z wyłącznikami średniego napięcia. Pozwalają odłączyć turbinę od sieci, np. na czas naprawy.', pos: [-1.2, 3.2, -1.5] },
      };
    case 'gr-home':
      return {
        turb: { name: 'turbiny', desc: 'Dziewięć turbin po 4,5 MW – razem ok. 40 MW. W wietrzny dzień farma daje tyle prądu, ile zużywa kilkadziesiąt tysięcy domów.', pos: [-640, 175, -250] },
        cable: { name: 'kable podziemne', desc: 'Od każdej turbiny biegnie pod ziemią kabel średniego napięcia (30 kV), zwykle wzdłuż dróg dojazdowych. Kable z kilku turbin łączy się w jedną linię.', pos: [-250, 22, 230] },
        gpz: { name: 'stacja elektroenergetyczna (GPZ)', desc: 'Główny punkt zasilający: transformatory podwyższają napięcie z 30 kV do 110 kV, a wyłączniki chronią sieć przed awariami. Tu energia z farmy trafia do sieci.', pos: [SUBSTATION[0], 26, SUBSTATION[2]] },
        line: { name: 'linia 110 kV', desc: 'Napowietrzna linia wysokiego napięcia niesie energię dalej – do miast i zakładów. Przewody zwisają między słupami, a im cieplej, tym bardziej się wydłużają i zwisają niżej.', pos: [PYLONS[2][0], PYLONS[2][1] + 52, PYLONS[2][2]] },
        bat: { name: 'magazyn energii', desc: 'Kontenery z akumulatorami – takimi jak w samochodach elektrycznych, tylko tysiące razy więcej. Ładują się, gdy wieje mocno, a oddają energię, gdy wiatr słabnie albo gdy wszyscy naraz włączają czajniki.', pos: [BATTERY[0], 12, BATTERY[2]] },
        village: { name: 'wieś', desc: 'Prąd z farmy płynie siecią tam, gdzie akurat jest potrzebny. Najbliższe domy stoją co najmniej kilkaset metrów od turbin – tak wymagają przepisy, ze względu na hałas i bezpieczeństwo.', pos: [VILLAGE[0], 24, VILLAGE[2]] },
      };
    case 'fa-home':
      return {
        rows: { name: 'rzędy turbin', desc: 'Turbiny stoją w rzędach w poprzek najczęstszego wiatru (w Polsce – zachodniego). Odstęp w rzędzie to ok. 3–5 średnic wirnika, a między rzędami 5–9 średnic.', pos: [-600, 200, 30] },
        road: { name: 'drogi dojazdowe', desc: 'Utwardzone drogi szutrowe prowadzą do każdej turbiny. Muszą udźwignąć ciężarówki z 70-metrowymi łopatami i dźwig o masie kilkuset ton.', pos: [-560, 12, 160] },
        pad: { name: 'plac montażowy', desc: 'Utwardzony plac obok wieży. Podczas budowy stoi na nim dźwig, a później – samochody serwisu. Wokół turbiny dalej uprawia się pole: farma zajmuje tylko kilka procent swojego terenu.', pos: [20, 12, 40] },
        field: { name: 'pola uprawne', desc: 'Między turbinami rolnicy dalej sieją zboże i pasą krowy. Za dzierżawę ziemi pod turbinę dostają co roku czynsz, a gmina – podatek.', pos: [-300, 14, -260] },
        forest: { name: 'lasy', desc: 'Turbin nie stawia się w lasach i rezerwatach przyrody. Przed budową przez cały rok obserwuje się ptaki i nietoperze, żeby wybrać bezpieczne miejsce.', pos: [-900, 30, 740] },
      };
  }
  return null;
}

/** Podpisy w widoku całości – prowadzą do modułów. */
function homeLinks(): Record<string, PartInfo> {
  return {
    wind: { name: 'wiatr', desc: '', pos: [170, 150, 40], link: 'wiatr' },
    rotor: { name: 'wirnik i łopaty', desc: '', pos: [HUB[0] + 4, HUB[1] + 46, 40], link: 'wirnik' },
    nacelle: { name: 'gondola', desc: '', pos: [-3, TH + 7, 0], link: 'gondola' },
    control: { name: 'sterowanie', desc: '', pos: [HUB[0] + 8, HUB[1] - 3, 4], link: 'sterowanie' },
    tower: { name: 'wieża i fundament', desc: '', pos: [3, 50, 3], link: 'wieza' },
    grid: { name: 'od wiatru do gniazdka', desc: '', pos: [30, 8, 30], link: 'siec' },
    farm: { name: 'farma wiatrowa', desc: '', pos: [FARM[3][0], 190, FARM[3][1]], link: 'farma' },
  };
}

/* ================= wykresy w ramkach ================= */

function PowerCurve({ V, P }: { V: number; P: number }) {
  const W = 300;
  const H = 150;
  const x = (v: number) => 30 + (v / 30) * (W - 40);
  const y = (p: number) => H - 22 - (p / 6) * (H - 34);
  const curve: string[] = [];
  const wind: string[] = [];
  for (let v = 0; v <= 30; v += 0.25) {
    curve.push(`${curve.length ? 'L' : 'M'}${x(v).toFixed(1)},${y(opPoint(v).P).toFixed(1)}`);
    const pw = windPower(v) * 0.593;
    if (pw < 6) wind.push(`${wind.length ? 'L' : 'M'}${x(v).toFixed(1)},${y(pw).toFixed(1)}`);
  }
  return (
    <svg width={W} height={H} style={{ display: 'block', marginTop: 6 }}>
      <rect x={x(0)} y={10} width={x(T.cutIn) - x(0)} height={H - 32} fill="rgba(148,163,184,0.12)" />
      <rect x={x(T.cutOut)} y={10} width={x(30) - x(T.cutOut)} height={H - 32} fill="rgba(248,113,113,0.14)" />
      <line x1={x(0)} y1={y(0)} x2={x(30)} y2={y(0)} stroke="rgba(255,255,255,0.4)" />
      <line x1={x(0)} y1={y(0)} x2={x(0)} y2={10} stroke="rgba(255,255,255,0.4)" />
      {[0, 5, 10, 15, 20, 25, 30].map((v) => (
        <text key={v} x={x(v)} y={H - 8} fill="rgba(255,255,255,0.7)" fontSize="10" textAnchor="middle">
          {v}
        </text>
      ))}
      {[0, 2, 4, 6].map((p) => (
        <text key={p} x={x(0) - 5} y={y(p) + 3} fill="rgba(255,255,255,0.7)" fontSize="10" textAnchor="end">
          {p}
        </text>
      ))}
      <path d={wind.join('')} fill="none" stroke="#7dd3fc" strokeDasharray="3 3" strokeWidth="1.2" />
      <path d={curve.join('')} fill="none" stroke="#facc15" strokeWidth="2.2" />
      <circle cx={x(Math.min(30, V))} cy={y(P)} r="5" fill="#fb923c" stroke="#fff" strokeWidth="1.5" />
      <text x={W - 6} y={H - 22} fill="rgba(255,255,255,0.7)" fontSize="10" textAnchor="end">
        m/s
      </text>
      <text x={x(0) + 4} y={16} fill="rgba(255,255,255,0.7)" fontSize="10">
        MW
      </text>
    </svg>
  );
}

/** Przebiegi trzech faz prądu z generatora (aktualizowane bez Reacta). */
function ThreePhase({ angle }: { angle: () => number }) {
  const paths = useRef<(SVGPathElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const a = angle() * 3;
      paths.current.forEach((p, k) => {
        if (!p) return;
        const d: string[] = [];
        for (let i = 0; i <= 60; i++) {
          const x = (i / 60) * 280;
          const yv = 30 - 22 * Math.sin(-a + (i / 60) * Math.PI * 4 + (k * 2 * Math.PI) / 3);
          d.push(`${i ? 'L' : 'M'}${x.toFixed(1)},${yv.toFixed(1)}`);
        }
        p.setAttribute('d', d.join(''));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [angle]);
  return (
    <svg width={280} height={60} style={{ display: 'block', marginTop: 6 }}>
      <line x1={0} y1={30} x2={280} y2={30} stroke="rgba(255,255,255,0.25)" />
      {['#f87171', '#facc15', '#60a5fa'].map((c, k) => (
        <path key={k} ref={(r) => (paths.current[k] = r)} fill="none" stroke={c} strokeWidth="2" />
      ))}
    </svg>
  );
}

/** Doba farmy: zapotrzebowanie i produkcja (24 h w 36 s). */
const DAY_T = 36;
const demandAt = (h: number) => 0.55 + 0.18 * Math.exp(-(((h - 8) / 2.2) ** 2)) + 0.28 * Math.exp(-(((h - 19) / 2.6) ** 2)) - 0.18 * Math.exp(-(((h - 3.5) / 2.5) ** 2));
const dayWindAt = (h: number) => 6.5 + 4.2 * Math.sin(((h - 5) / 24) * Math.PI * 2) + 1.6 * Math.sin(h * 1.7) + 0.8 * Math.sin(h * 4.3);
function BalanceChart({ h }: { h: number }) {
  const W = 300;
  const Hh = 130;
  const x = (hh: number) => 26 + (hh / 24) * (W - 34);
  const y = (v: number) => Hh - 20 - v * (Hh - 34);
  const dem: string[] = [];
  const pro: string[] = [];
  for (let hh = 0; hh <= 24; hh += 0.25) {
    dem.push(`${dem.length ? 'L' : 'M'}${x(hh).toFixed(1)},${y(demandAt(hh)).toFixed(1)}`);
    pro.push(`${pro.length ? 'L' : 'M'}${x(hh).toFixed(1)},${y(opPoint(dayWindAt(hh)).P / T.ratedP).toFixed(1)}`);
  }
  return (
    <svg width={W} height={Hh} style={{ display: 'block', marginTop: 6 }}>
      <line x1={x(0)} y1={y(0)} x2={x(24)} y2={y(0)} stroke="rgba(255,255,255,0.4)" />
      {[0, 6, 12, 18, 24].map((hh) => (
        <text key={hh} x={x(hh)} y={Hh - 6} fill="rgba(255,255,255,0.7)" fontSize="10" textAnchor="middle">
          {hh}:00
        </text>
      ))}
      <path d={dem.join('')} fill="none" stroke="#f472b6" strokeWidth="2" />
      <path d={pro.join('')} fill="none" stroke="#facc15" strokeWidth="2" />
      <line x1={x(h)} y1={10} x2={x(h)} y2={y(0)} stroke="#fff" strokeOpacity="0.7" strokeDasharray="3 2" />
    </svg>
  );
}

/* ================= elementy sceny ================= */

/** Zarysy przekrojów łopaty 0 (wirnik zatrzymany, łopata poziomo w stronę widza) – widać skręcenie. */
function TwistOutlines({ pitch }: { pitch: number }) {
  const list = useMemo(() => [5, 13, 22, 32, 42, 52, 62, 71].map((s, i, a) => ({ s, pts: sectionLoop(s), col: new THREE.Color().setHSL(0.08 + (0.45 * i) / (a.length - 1), 0.85, 0.58) })), []);
  return (
    <group position={[HUB[0], HUB[1], 0]} rotation={[0, 0, T.tilt]}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <group rotation={[0, 0, -T.cone]}>
          <group rotation={[0, -pitch * DEG, 0]}>
            {list.map((l) => (
              <Line key={l.s} points={l.pts} color={l.col} lineWidth={3} />
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

/** Pierścień na łopacie 0 w miejscu przekroju z siłami. */
function LiftMarker({ pitch }: { pitch: number }) {
  const pts = useMemo(() => sectionLoop(LIFT_R - T.rootR), []);
  return (
    <group position={[HUB[0], HUB[1], 0]} rotation={[0, 0, T.tilt]}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <group rotation={[0, 0, -T.cone]}>
          <group rotation={[0, -pitch * DEG, 0]}>
            <Line points={pts} color="#fb923c" lineWidth={4} />
          </group>
        </group>
      </group>
    </group>
  );
}

const RINGS = [10, 25, 40, 55, R];
/** Okręgi prędkości w płaszczyźnie wirnika. */
function SpeedRings({ rpm }: { rpm: number }) {
  const circles = useMemo(
    () =>
      RINGS.map((r) => {
        const pts: V3[] = [];
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2;
          pts.push([0, Math.cos(a) * r, Math.sin(a) * r]);
        }
        return pts;
      }),
    [],
  );
  return (
    <group position={[HUB[0] + 2, HUB[1], 0]} rotation={[0, 0, T.tilt]}>
      {circles.map((c, i) => (
        <Line key={i} points={c} color={new THREE.Color().setHSL(0.55 - (i / RINGS.length) * 0.55, 0.9, 0.6)} lineWidth={2} transparent opacity={0.85} />
      ))}
      {RINGS.map((r, i) => (
        <Lbl key={r} pos={[0, r + 2.5, 0]} sub color={`hsl(${(0.55 - (i / RINGS.length) * 0.55) * 360}, 90%, 72%)`}>
          {Math.round((rpm * 2 * Math.PI * r * 3.6) / 60)} km/h
        </Lbl>
      ))}
    </group>
  );
}

/** Róża kierunków na ziemi i strzałka wiatru. */
function Compass({ dir }: { dir: number }) {
  const ring = useMemo(() => {
    const pts: V3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push([Math.cos(a) * 45, 0.4, Math.sin(a) * 45]);
    }
    return pts;
  }, []);
  // wiatr z kierunku dir: strzałka od nawietrznej do środka
  const c = Math.cos(dir);
  const s = Math.sin(dir);
  return (
    <group>
      <Line points={ring} color="#f8fafc" lineWidth={2} transparent opacity={0.7} />
      {(
        [
          ['N', [0, 0, -52]],
          ['E', [52, 0, 0]],
          ['S', [0, 0, 52]],
          ['W', [-52, 0, 0]],
        ] as [string, V3][]
      ).map(([t, p]) => (
        <Lbl key={t} pos={[p[0], 3, p[2]]} sub>
          {t}
        </Lbl>
      ))}
      <Line points={[[c * 95, 2, s * 95], [c * 50, 2, s * 50]]} color="#38bdf8" lineWidth={6} />
      <mesh position={[c * 47, 2, s * 47]} rotation={[0, -dir, -Math.PI / 2]}>
        <coneGeometry args={[4, 9, 12]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
    </group>
  );
}

/** Morska stacja transformatorowa na kratownicy. */
function OffshoreSubstation() {
  const [x, , z] = SUBSTATION;
  return (
    <group position={[x, 0, z]}>
      <OffshoreBase kind="jacket" />
      <mesh position={[0, 28, 0]}>
        <boxGeometry args={[30, 16, 24]} />
        <meshStandardMaterial color="#e8ebee" roughness={0.6} />
      </mesh>
      <mesh position={[0, 36.5, 0]}>
        <boxGeometry args={[31, 1, 25]} />
        <meshStandardMaterial color="#f2c230" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Statek serwisowy kołyszący się na falach. */
function ServiceBoat({ at }: { at: V3 }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    g.rotation.z = Math.sin(clock.elapsedTime * 1.3) * 0.05;
    g.rotation.x = Math.sin(clock.elapsedTime * 0.9) * 0.04;
    g.position.y = Math.sin(clock.elapsedTime * 1.1) * 0.3;
  });
  return (
    <group position={at}>
      <group ref={ref}>
        {[-3, 3].map((z) => (
          <mesh key={z} position={[0, 0.6, z]}>
            <boxGeometry args={[24, 2.2, 2.4]} />
            <meshStandardMaterial color="#f97316" roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[-1, 2.4, 0]}>
          <boxGeometry args={[18, 1.4, 8.4]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.6} />
        </mesh>
        <mesh position={[1, 4.4, 0]}>
          <boxGeometry args={[7, 2.6, 6]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

/* ================= scena ================= */

const PHASE_C = '#7cc7ff';
const PART_C = '#facc15';

interface Dyn {
  rpm: number;
  V: number;
  P: number;
}

export function WindScene({ params }: SceneProps) {
  const mode = str(params.mode, 'home');
  const cfg = cfgOf(mode);
  const run = Boolean(params.run);
  const windP = num(params.wind, cfg.V);
  const dirDeg = num(params.dir, 0);
  const dir = dirDeg * DEG;
  const offKind = str(params.found, 'monopile') as OffKind;
  const home = useModuleHome();
  const nav = useTopicNav();
  const paused = useContext(PauseContext);
  const night = cfg.weather === 'night';
  const sea = cfg.ground === 'sea';
  const baseY = sea ? OFF_BASE : 0;

  /* stan turbin */
  const main = useMemo(() => newState(), []);
  const others = useMemo(() => FARM.slice(1).map(() => newState()), []);
  const dyn = useRef<Dyn[]>(FARM.map(() => ({ rpm: 8, V: 9, P: 2 })));
  const tRun = useRef(-1);
  const clock = useRef(0);
  const [phase, setPhase] = useState('');
  const [live, setLive] = useState<{ V: number; op: OpPoint; h: number; farmP: number[] }>({ V: windP, op: opPoint(windP), h: 0, farmP: [] });
  const liveRef = useRef(live);
  useEffect(() => {
    tRun.current = run ? 0 : -1;
    main.brake = 0;
    main.lock = 0;
  }, [run, mode, main]);

  /** Prędkość wiatru w danej chwili (scenariusze zmieniają ją w czasie). */
  const windNow = (t: number) => {
    if (mode === 'ct-storm') {
      if (t < 0) return 9;
      return t < 26 ? mix(9, 29, sm(0, 24, t)) : t < 34 ? 29 + Math.sin(t * 2) * 0.8 : mix(29, 15, sm(34, 50, t));
    }
    if (mode === 'na-brake') return 12;
    if (mode === 'gr-balance') return dayWindAt(((clock.current % DAY_T) / DAY_T) * 24);
    return windP;
  };
  const stormStop = useRef(false);

  /* pole wiatru dla smug i śladów */
  const fieldRef = useRef<WindField>({ U: windP, dir: 0, turbines: [], displace: true, shear: true });
  const fieldTurbs = useMemo(() => {
    const list = cfg.trails === 'farm' ? FARM : FARM.slice(0, 1);
    return list.map(([x, z]) => ({ x, z }));
  }, [cfg.trails]);

  useFrame((_, dt0) => {
    const dt = paused ? 0 : Math.min(dt0, 0.05);
    clock.current += dt;
    if (tRun.current >= 0) tRun.current += dt;
    const t = tRun.current;
    const V = windNow(t);
    let ph = '';
    // turbina główna
    let op = opPoint(V);
    if (mode === 'ct-storm') {
      // wyłączenie przy 25 m/s, ponowny start dopiero poniżej 20 m/s (żeby nie włączać i wyłączać co chwilę)
      if (V > T.cutOut) stormStop.current = true;
      if (V < 20) stormStop.current = false;
      if (stormStop.current) op = { ...op, rpm: 0.6, pitch: 88, P: 0, state: 'storm' };
      ph = t < 0 ? '' : stormStop.current ? 'Wiatr ponad 25 m/s – łopaty w chorągiewce, turbina przeczekuje burzę' : V > 18 ? 'Bardzo silny wiatr – łopaty obracają się coraz bardziej, moc stała' : V > 10.5 ? 'Wiatr rośnie – turbina daje pełną moc, łopaty zaczynają się obracać' : 'Umiarkowany wiatr – łopaty ustawione płasko';
      if (t > 34 && !stormStop.current && V < 20) ph = 'Burza słabnie – turbina wraca do pracy';
    }
    if (mode === 'na-brake' && t >= 0) {
      const k = sm(1, 9, t);
      op = { ...op, pitch: mix(op.pitch, 88, k), rpm: mix(op.rpm, 0, sm(2, 12, t)), P: op.P * (1 - sm(1, 5, t)) };
      main.brake = sm(11, 12.5, t);
      main.lock = sm(13.5, 15, t);
      ph = t < 1 ? 'Polecenie: zatrzymaj turbinę' : t < 9 ? 'Łopaty obracają się w chorągiewkę – wiatr przestaje napędzać wirnik' : t < 11.5 ? 'Wirnik zwalnia sam, bez hamulca' : t < 13.5 ? 'Hamulec tarczowy unieruchamia wolno obracający się wał' : 'Bolec blokuje wirnik – można bezpiecznie pracować w piaście';
    }
    const d0 = dyn.current[0];
    d0.V = V;
    const kR = Math.min(1, dt * (mode === 'na-brake' ? 3 : 0.8));
    d0.rpm += (op.rpm - d0.rpm) * kR;
    d0.P = op.P;
    main.pitch += (op.pitch - main.pitch) * Math.min(1, dt * (mode === 'ct-pitch' ? 1.5 : 0.8));
    if (cfg.lock !== undefined) {
      main.angle = cfg.lock;
      main.pitch = mode === 'ro-lift' || mode === 'ro-twist' ? opPoint(windP).pitch : 0;
    } else if (!(mode === 'na-brake' && main.brake > 0.95)) main.angle -= ((d0.rpm * 2 * Math.PI) / 60) * dt * cfg.slow;
    // gondola pod wiatr (w zakładce o obrocie – powoli, jak w prawdziwej turbinie, tylko szybciej)
    const yawT = -dir;
    if (mode === 'ct-yaw' || mode === 'fa-wake') {
      const err = Math.atan2(Math.sin(yawT - main.yaw), Math.cos(yawT - main.yaw));
      main.yaw += clamp(err, -dt * 0.18, dt * 0.18);
    } else main.yaw = yawT;
    main.light = night;
    // pole wiatru
    const f = fieldRef.current;
    f.U = V;
    f.dir = dir;
    f.displace = cfg.trails === 'near';
    f.shear = cfg.trails !== 'farm';
    const ind = (o: OpPoint) => (o.state === 'calm' || o.state === 'storm' ? 0.02 : clamp((o.P / Math.max(0.01, o.Pwind)) / 0.45 * 0.3, 0.04, 0.31));
    f.turbines = fieldTurbs.map(({ x, z }, i): FieldTurbine => {
      const [s, l] = worldToWind(f, x, z);
      return { s, l, y: HUB_Y + baseY + groundH(x, z), r: R, a: i === 0 ? ind(op) : ind(opPoint(dyn.current[i]?.V ?? V)) };
    });
    // pozostałe turbiny: wiatr lokalny (w śladzie innych – słabszy)
    for (let i = 1; i < FARM.length; i++) {
      const s = others[i - 1];
      const d = dyn.current[i];
      const [x, z] = FARM[i];
      let v = V;
      if (cfg.trails === 'farm') {
        const [ss, ll] = worldToWind(f, x, z);
        const fx = { ...f, turbines: f.turbines.filter((_, j) => j !== i) };
        v = V * speedAt(fx, ss - 2, HUB_Y + groundH(x, z), ll);
      }
      d.V += (v - d.V) * Math.min(1, dt * 0.5);
      const o = opPoint(mode === 'gr-balance' ? V * (0.9 + 0.1 * Math.sin(i * 1.7)) : d.V);
      d.rpm += (o.rpm - d.rpm) * Math.min(1, dt * 0.6);
      d.P = o.P;
      s.pitch += (o.pitch - s.pitch) * Math.min(1, dt * 0.8);
      s.angle -= ((d.rpm * 2 * Math.PI) / 60) * dt;
      s.yaw = cfg.trails === 'farm' ? main.yaw : yawT;
      s.light = night;
    }
    if (ph !== phase && mode !== 'to-build') setPhase(ph);
    // wartości do ramki – kilka razy na sekundę
    const L = liveRef.current;
    const h = ((clock.current % DAY_T) / DAY_T) * 24;
    if (Math.abs(L.V - V) > 0.05 || Math.abs(L.op.pitch - main.pitch) > 0.3 || Math.abs(L.op.rpm - d0.rpm) > 0.05 || (mode === 'gr-balance' && Math.abs(L.h - h) > 0.15) || (mode === 'fa-wake' && Math.random() < 0.05)) {
      const next = { V, op: { ...op, pitch: main.pitch, rpm: d0.rpm }, h, farmP: dyn.current.map((d) => d.P) };
      liveRef.current = next;
      setLive(next);
    }
  });

  /* obszary smug */
  const region = useMemo<Region>(() => (cfg.trails === 'farm' ? { s0: -500, s1: 1900, y0: 70, y1: 190, l0: -800, l1: 800 } : { s0: -240, s1: 420, y0: 18, y1: 215, l0: -120, l1: 120 }), [cfg.trails]);

  /* podpisy części */
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [mode]);
  const parts = home ? homeParts(mode) : null;
  const links = mode === 'home' && home ? homeLinks() : null;

  /* ruch windy w wieży */
  const lift = () => 0.5 - 0.5 * Math.cos((clock.current / 40) * Math.PI * 2);

  /* przepływ energii */
  const routes = useMemo(() => FARM.map((_, i) => cableRoute(i)), []);
  const linePath = useMemo<V3[]>(() => [[SUBSTATION[0] + 20, SUBSTATION[1] + 15, SUBSTATION[2] - 10], ...PYLONS.map((p) => [p[0], p[1] + 34, p[2]] as V3)], []);
  const nacellePath = useMemo<V3[]>(
    () => [drivePt(-4.9, HS_OFFSET, 0), drivePt(-6.4, HS_OFFSET, -0.6), [-6.2, TH + 1.7, -1.3], [-7.6, TH + 1.7, 0.2], [-7.95, TH + 1.6, 0.75], [-3, TH + 0.8, 0.2], [0.4, TH - 1, -0.6], [0.4, 1.0, -0.6], [3, 0.6, -0.6]],
    [],
  );
  const gridMode = mode.startsWith('gr-') || mode === 'tour-gr';
  const flowRate = () => dyn.current[0].P / T.ratedP;

  const v = live.V;
  const op = live.op;
  const tipKmh = (op.rpm * 2 * Math.PI * R * 3.6) / 60;
  const inLift = mode === 'ro-lift';
  const uLift = (op.rpm * 2 * Math.PI * LIFT_R) / 60;
  const phi = Math.atan2(v, uLift) / DEG;
  const theta = twistAt(LIFT_R - T.rootR) + opPoint(windP).pitch;

  // ramka: treść zależna od trybu
  let info: ReactNode = null;
  const opRows = (rows: [string, string][]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', marginTop: 4 }}>
      {rows.map(([k, val]) => (
        <Fragment key={k}>
          <span style={{ opacity: 0.75 }}>{k}</span>
          <b>{val}</b>
        </Fragment>
      ))}
    </div>
  );
  const fmt = (x: number, d = 1) => x.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });
  const stateTxt = op.state === 'calm' ? 'za słaby wiatr – turbina czeka' : op.state === 'part' ? 'łapie, ile się da – łopaty płasko' : op.state === 'full' ? 'pełna moc – łopaty odwracają się od wiatru' : 'burza – łopaty w chorągiewce';
  if (mode === 'wi-power') {
    const m = 1.225 * Math.PI * R * R * v;
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Wiatr {fmt(v, 0)} m/s</div>
        {opRows([
          ['powietrze przez wirnik w 1 s', `${fmt(m / 1000, 0)} t`],
          ['moc niesiona przez wiatr', `${fmt(windPower(v), 1)} MW`],
          ['najwięcej, co da się odebrać (59%)', `${fmt(windPower(v) * 0.593, 1)} MW`],
          ['moc turbiny', `${fmt(opPoint(v).P, 2)} MW`],
        ])}
      </>
    );
  } else if (inLift) {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Przekrój łopaty 55 m od osi (powiększony 6×)</div>
        {opRows([
          ['wiatr', `${fmt(v, 0)} m/s`],
          ['prędkość łopaty w tym miejscu', `${fmt(uLift, 0)} m/s (${fmt(uLift * 3.6, 0)} km/h)`],
          ['kąt napływu powietrza', `${fmt(phi, 1)}°`],
          ['ustawienie profilu (skręcenie + łopata)', `${fmt(theta, 1)}°`],
          ['kąt natarcia', `${fmt(phi - theta, 1)}°`],
        ])}
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
          <span style={{ color: '#38bdf8' }}>■</span> wiatr <span style={{ color: '#4ade80' }}>■</span> ruch łopaty <span style={{ color: '#f8fafc' }}>■</span> wiatr względny <span style={{ color: '#fb923c' }}>■</span> siła nośna <span style={{ color: '#f87171' }}>■</span> opór <span style={{ color: '#facc15' }}>■</span> siła napędzająca <span style={{ color: '#a78bfa' }}>■</span> nacisk na wirnik
        </div>
      </>
    );
  } else if (mode === 'ro-tip') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Wiatr {fmt(v, 0)} m/s</div>
        {opRows([
          ['obroty wirnika', `${fmt(op.rpm, 1)} obr/min`],
          ['jeden obrót trwa', op.rpm > 0.3 ? `${fmt(60 / op.rpm, 1)} s` : '–'],
          ['prędkość końca łopaty', `${fmt(tipKmh, 0)} km/h`],
          ['koniec łopaty / wiatr', `${fmt(tipKmh / 3.6 / Math.max(0.1, v), 1)} razy szybciej`],
        ])}
      </>
    );
  } else if (mode === 'na-gear') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Przekładnia 1 : {Math.round(RATIO)} (ruch zwolniony 8×)</div>
        {opRows([
          ['wał wirnika', `${fmt(op.rpm, 1)} obr/min`],
          ['po 1. stopniu planetarnym', `${fmt(op.rpm * 5, 0)} obr/min`],
          ['po 2. stopniu planetarnym', `${fmt(op.rpm * 22.5, 0)} obr/min`],
          ['wał generatora', `${fmt(op.rpm * RATIO, 0)} obr/min`],
        ])}
      </>
    );
  } else if (mode === 'na-gen') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Prąd trójfazowy z generatora</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>Trzy uzwojenia, trzy przebiegi przesunięte o 1/3 okresu (ruch zwolniony 8×).</div>
        <ThreePhase angle={() => main.angle * RATIO} />
        {opRows([
          ['obroty generatora', `${fmt(op.rpm * RATIO, 0)} obr/min`],
          ['moc', `${fmt(op.P, 2)} MW`],
        ])}
      </>
    );
  } else if (mode === 'ct-pitch' || mode === 'ct-curve' || mode === 'ct-storm' || mode === 'na-brake') {
    info = (
      <>
        {phase && <div style={{ fontWeight: 700, color: PHASE_C }}>{phase}</div>}
        <div style={{ fontWeight: 700, color: PART_C }}>Wiatr {fmt(v, 1)} m/s – {stateTxt}</div>
        {opRows([
          ['obroty wirnika', `${fmt(op.rpm, 1)} obr/min`],
          ['kąt łopat', `${fmt(op.pitch, 0)}°`],
          ['moc', `${fmt(op.P, 2)} MW`],
        ])}
        {mode === 'ct-curve' && <PowerCurve V={v} P={op.P} />}
        {mode === 'ct-curve' && (
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            <span style={{ color: '#facc15' }}>–</span> moc turbiny <span style={{ color: '#7dd3fc' }}>- -</span> granica Betza (59% mocy wiatru)
          </div>
        )}
      </>
    );
  } else if (mode === 'ct-yaw') {
    const err = Math.atan2(Math.sin(-dir - main.yaw), Math.cos(-dir - main.yaw)) / DEG;
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Wiatr z kierunku {Math.round(((dirDeg % 360) + 360) % 360)}°</div>
        {opRows([['odchylenie gondoli od wiatru', `${fmt(Math.abs(err), 0)}°`]])}
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Ustawienie bokiem do wiatru o 20° kosztuje ok. 10% mocy.</div>
      </>
    );
  } else if (mode === 'gr-balance') {
    const prod = opPoint(v).P / T.ratedP;
    const dem = demandAt(live.h);
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>
          Godzina {Math.floor(live.h)}:{String(Math.floor((live.h % 1) * 60)).padStart(2, '0')} – wiatr {fmt(v, 1)} m/s
        </div>
        <div style={{ fontSize: 12 }}>
          {prod > dem ? 'Wiatru jest więcej, niż trzeba – nadmiar ładuje magazyn energii.' : 'Wiatru brakuje – lukę wypełniają magazyn, inne elektrownie i import.'}
        </div>
        <BalanceChart h={live.h} />
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          <span style={{ color: '#facc15' }}>–</span> produkcja farmy <span style={{ color: '#f472b6' }}>–</span> zużycie w okolicy (względnie)
        </div>
      </>
    );
  } else if (mode === 'fa-wake') {
    const ps = live.farmP;
    const sum = ps.reduce((a, b) => a + b, 0);
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Wiatr {fmt(v, 0)} m/s z kierunku {Math.round(((dirDeg % 360) + 360) % 360)}°</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 56, marginTop: 6 }}>
          {ps.map((p, i) => (
            <div key={i} title={`turbina ${i + 1}`} style={{ width: 22, height: `${(p / T.ratedP) * 100}%`, background: '#facc15', borderRadius: 3, minHeight: 2 }} />
          ))}
        </div>
        {opRows([
          ['moc farmy', `${fmt(sum, 1)} MW`],
          ['gdyby nie było śladów', `${fmt(opPoint(v).P * FARM.length, 1)} MW`],
          ['strata przez ślady', `${fmt(Math.max(0, 100 - (sum / Math.max(0.01, opPoint(v).P * FARM.length)) * 100), 0)}%`],
        ])}
      </>
    );
  } else if (mode === 'to-off') {
    const facts: Record<OffKind, [string, string][]> = {
      monopile: [
        ['głębokość morza', 'do ok. 40 m'],
        ['średnica pala', '8–10 m'],
        ['masa pala', 'ok. 1000–1500 t'],
        ['wbicie w dno', '30–40 m'],
      ],
      jacket: [
        ['głębokość morza', '30–60 m'],
        ['wysokość kratownicy', 'ok. 60 m'],
        ['masa', 'ok. 800–1200 t'],
        ['nogi', '4, przybite palami do dna'],
      ],
      floating: [
        ['głębokość morza', 'od 60 m do kilkuset'],
        ['zanurzenie', 'ok. 20 m'],
        ['kotwiczenie', '3 liny po kilkaset metrów'],
        ['zalety', 'można stawiać daleko od brzegu'],
      ],
    };
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>{offKind === 'monopile' ? 'Monopal' : offKind === 'jacket' ? 'Kratownica (jacket)' : 'Fundament pływający'}</div>
        {opRows(facts[offKind])}
      </>
    );
  } else if (mode === 'wi-shear') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Wiatr na różnych wysokościach</div>
        {opRows([10, 40, 80, 120, 160].map((hh) => [`${hh} m`, `${fmt(shear(v, hh), 1)} m/s – moc ×${fmt((shear(v, hh) / shear(v, 10)) ** 3, 1)}`]))}
      </>
    );
  } else if (mode === 'to-build') {
    const [stg, txt] = phase ? phase.split('|') : ['-1', ''];
    const n = run ? Number(stg) : -1;
    info = (
      <>
        <div style={{ fontWeight: 700, color: PHASE_C }}>{run ? txt || 'Montaż' : 'Części czekają na placu – naciśnij „Rozpocznij”'}</div>
        {BUILD_STAGES.map((s, i) => (
          <div key={i} style={{ opacity: i === n ? 1 : i < n ? 0.75 : 0.45, fontWeight: i === n ? 700 : 400 }}>
            {i < n ? '✓' : i === n ? '▸' : '·'} {s}
          </div>
        ))}
      </>
    );
  }

  // fazy montażu
  useFrame(() => {
    if (mode !== 'to-build') return;
    const t = tRun.current;
    let ph = '';
    if (t >= 0) {
      const b = buildStatus(t);
      ph = `${b.stage}|${b.text}`;
    }
    if (ph !== phase) setPhase(ph);
  });

  const partBox = parts ? (
    sel && parts[sel] ? (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>{parts[sel].name}</div>
        <div>{parts[sel].desc}</div>
      </>
    ) : (
      <div>Kliknij podpis na modelu, żeby przeczytać, co to jest.</div>
    )
  ) : null;

  const turbineY = (x: number, z: number) => (sea ? OFF_BASE : groundH(x, z));
  const showOthers = cfg.others && mode !== 'to-found';
  const hidden = (i: number) => sea && mode === 'to-off' && i > 0;

  return (
    <>
      <Sky weather={cfg.weather} />
      {cfg.weather !== 'night' && <Clouds weather={cfg.weather} />}
      {night && <Stars />}
      {night ? (
        <>
          <ambientLight intensity={0.18} color="#8a96c8" />
          <hemisphereLight args={['#334066', '#0a0a10', 0.35]} />
          <directionalLight position={[-300, 500, 200]} intensity={0.25} color="#9fb0ff" />
        </>
      ) : (
        <>
          <ambientLight intensity={cfg.weather === 'storm' ? 0.5 : 0.42} />
          <hemisphereLight args={[cfg.weather === 'storm' ? '#b8c0c8' : '#e3edf7', '#5a5a40', 0.6]} />
          <directionalLight position={[300, 520, 380]} intensity={cfg.weather === 'storm' ? 0.8 : 1.75} color="#fff6e8" />
          <directionalLight position={[-200, 120, -260]} intensity={0.3} color="#cfe0ff" />
        </>
      )}

      {/* ląd albo morze */}
      {!sea && (
        <>
          <Ground hole={cfg.ground === 'pit' ? 70 : 0} night={night} />
          <Trees night={night} />
          <Village night={night} />
          <Substation />
          <PowerLine />
          <BatteryStorage />
        </>
      )}
      {cfg.ground === 'pit' && <FoundationPit />}
      {sea && (
        <>
          <Sea opacity={mode === 'to-off' ? 0.55 : 0.85} night={night} />
          <Seabed depth={mode === 'to-off' ? offDepth(offKind) : 35} />
        </>
      )}

      {/* turbina główna */}
      {cfg.main && (
        <group position={[0, turbineY(0, 0), 0]}>
          {sea && mode === 'to-off' && (
            <group position={[0, -OFF_BASE, 0]}>
              <OffshoreBase kind={offKind} />
            </group>
          )}
          {sea && mode !== 'to-off' && (
            <group position={[0, -OFF_BASE, 0]}>
              <OffshoreBase kind="monopile" />
            </group>
          )}
          <Turbine st={main} open={cfg.open} towerCut={cfg.towerCut} hubOpen={cfg.hubOpen} gearCut={cfg.gearCut} genCut={cfg.genCut} drive={cfg.drive} night={night} noBase={cfg.ground === 'pit' || sea} lift={lift} />
        </group>
      )}
      {mode === 'to-build' && <BuildSite time={() => (tRun.current < 0 ? 0 : tRun.current)} st={main} />}

      {/* pozostałe turbiny farmy */}
      {showOthers &&
        FARM.slice(1).map(([x, z], i) =>
          hidden(i + 1) ? null : (
            <group key={i} position={[x, turbineY(x, z), z]}>
              {sea && (
                <group position={[0, -OFF_BASE, 0]}>
                  <OffshoreBase kind="monopile" />
                </group>
              )}
              <Turbine st={others[i]} lod="low" night={night} noBase={sea} />
            </group>
          ),
        )}
      {sea && mode === 'fa-off' && (
        <>
          <OffshoreSubstation />
          <ServiceBoat at={[160, 0, 120]} />
        </>
      )}

      {/* przepływ wiatru */}
      {cfg.trails !== 'none' && (
        <WindTrails
          field={() => fieldRef.current}
          region={region}
          count={cfg.trails === 'farm' ? 900 : mode === 'home' ? 320 : 480}
          width={cfg.trails === 'farm' ? 3.2 : 0.9}
          opacity={cfg.trails === 'farm' ? 0.75 : mode === 'home' ? 0.55 : 0.8}
          sample={cfg.trails === 'farm' ? 0.3 : 0.16}
          speedUp={cfg.trails === 'farm' ? 3 : 1}
          tint={mode !== 'home'}
        />
      )}
      {cfg.swept && <SweptDisc />}
      {mode === 'wi-shear' && <MetMast V={v} />}
      {mode === 'wi-power' && <AirSlab V={v} hubY={HUB_Y} />}
      {mode === 'wi-betz' && <StreamTube a={1 / 3} hubY={HUB_Y} />}
      {(mode === 'wi-betz' || mode === 'ro-tip') && <TipVortices st={main} U={() => dyn.current[0].V} rpm={() => dyn.current[0].rpm} hub={[HUB[0], HUB_Y, 0]} />}
      {mode === 'ro-lift' && (
        <>
          <AirfoilForces V={v} rpm={opPoint(windP).rpm} pitch={opPoint(windP).pitch} at={[HUB[0] + 4, HUB_Y, R + 16]} />
          <LiftMarker pitch={opPoint(windP).pitch} />
        </>
      )}
      {mode === 'ro-twist' && <TwistOutlines pitch={0} />}
      {mode === 'ro-tip' && <SpeedRings rpm={op.rpm} />}
      {mode === 'ro-build' && <BladeSegment at={[22, 2.6, 16]} />}
      {mode === 'ct-yaw' && <Compass dir={dir} />}

      {/* energia */}
      {gridMode && mode !== 'gr-nacelle' &&
        routes.map((r, i) => <EnergyFlow key={i} path={r} count={Math.max(8, Math.round(r.length * 4))} speed={60} size={3.2} rate={() => dyn.current[i].P / T.ratedP} />)}
      {gridMode && mode !== 'gr-nacelle' && <EnergyFlow path={linePath} count={60} speed={110} size={4} rate={() => dyn.current.reduce((a, d) => a + d.P, 0) / (T.ratedP * FARM.length)} />}
      {mode === 'gr-nacelle' && <EnergyFlow path={nacellePath} count={90} speed={6} size={0.22} rate={flowRate} />}

      {/* podpisy */}
      {parts &&
        Object.entries(parts).map(([id, p]) => (
          <Lbl key={id} pos={p.pos} active={sel === id} onClick={() => setSel(sel === id ? null : id)}>
            {p.name}
          </Lbl>
        ))}
      {links &&
        Object.entries(links).map(([id, p]) => (
          <Lbl key={id} pos={p.pos} link onClick={() => p.link && nav?.openModule(p.link)}>
            {p.name}
          </Lbl>
        ))}

      {(partBox || info) && (
        <InfoPortal>
          {info}
          {info && partBox && <div style={{ height: 8 }} />}
          {partBox}
        </InfoPortal>
      )}
      {mode === 'to-off' && <SeaLevelLabel kind={offKind} />}
      {mode === 'to-found' && <FoundLabels />}
    </>
  );
}

/** Podpisy w przekroju fundamentu (nieklikalne – zakładka pokazuje). */
function FoundLabels() {
  return (
    <>
      <Lbl pos={[-8, -2.2, 0.5]} sub>
        beton zbrojony
      </Lbl>
      <Lbl pos={[2.25, -3.6, 0.5]} sub>
        kosz kotwiący
      </Lbl>
      <Lbl pos={[-PIT_R + 4, -0.6, 0.5]} sub>
        gleba
      </Lbl>
      <Lbl pos={[PIT_R - 5, -4.8, 0.5]} sub>
        piasek i glina
      </Lbl>
    </>
  );
}

function SeaLevelLabel({ kind }: { kind: OffKind }) {
  return (
    <>
      <Lbl pos={[-30, 1.5, 0]} sub color="#7dd3fc">
        poziom morza
      </Lbl>
      <Lbl pos={[-30, -offDepth(kind) + 2, 0]} sub color="#e7d3a8">
        dno – {offDepth(kind)} m
      </Lbl>
    </>
  );
}
