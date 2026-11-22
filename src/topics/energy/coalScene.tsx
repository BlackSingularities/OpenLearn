/*
 * Elektrownia węglowa – wspólna scena 3D wszystkich zakładek tematu. Tryb zakładki (params.mode) decyduje, co
 * widać: cała elektrownia, kotłownia w przekroju z płomieniem, maszynownia z otwartą turbiną, chłodnia
 * w przekroju, elektrofiltr i absorber odsiarczania od środka, sieć. Kulki w ruchu pokazują przepływy: węgiel,
 * woda, para, woda chłodząca, spaliny i prąd. Moc bloku (suwak albo scenariusz) zmienia płomień, przepływy
 * i pióropusze.
 */
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneProps } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { useModuleHome, useTopicNav } from '../../lib/topicNav';
import { PauseContext } from '../../lib/useAnimationClock';
import { Lbl } from '../aviation/airliner';
import { Clouds, Sky, Stars, type Weather } from './windWorld';
import { EnergyFlow } from './windExtras';
import {
  AX,
  BANKS,
  BH,
  BOIL,
  BUNK,
  COAL_SHARE,
  CRUSH,
  CT,
  DEAER,
  ESP,
  FGD,
  FGD_H,
  MILLS,
  MILL_Z,
  PILES,
  PYLONS,
  P_COAL,
  P_COOL_IN,
  P_COOL_OUT,
  P_CROSS,
  P_FEED,
  P_FLUE,
  P_POWER,
  P_REHEAT_COLD,
  P_REHEAT_HOT,
  P_STEAM,
  RAIL_Z,
  SCR,
  STACK,
  STACKER_Z,
  STACK_H,
  SWYARD,
  TRAFO,
  TURB,
  UNIT,
  UNLOAD,
  clamp,
  demandAt,
  load,
  mix,
  sm,
  solarAt,
  type V3,
} from './coalGeo';
import { Aux, Boiler, BoilerHouse, Bunkers, CoalYard, CoolingTower, FlueGasLine, Grid, Ground, SteamPipes, Stack, Train, Trees, TurbineHall, TurbineSet } from './coalPlant';
import { EspDust, FgdSpray, Fireball, Plumes, TowerFlow } from './coalFx';

const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

/* ================= ustawienia trybów ================= */

type FlowKey = 'coal' | 'steam' | 'feed' | 'cool' | 'flue' | 'power';
interface Cfg {
  bhCut: boolean;
  thCut: boolean;
  turbOpen: boolean;
  ctCut: boolean;
  espCut: boolean;
  fgdCut: boolean;
  flows: FlowKey[];
  plume: boolean;
  weather: Weather;
}
const BASE: Cfg = { bhCut: false, thCut: false, turbOpen: false, ctCut: false, espCut: false, fgdCut: false, flows: [], plume: true, weather: 'day' };
const CFG: Record<string, Partial<Cfg>> = {
  home: {},
  'tour-fu': { flows: ['coal'] },
  'tour-bo': { bhCut: true },
  'tour-tu': { thCut: true, turbOpen: true, flows: ['steam'] },
  'tour-co': { flows: ['cool'] },
  'tour-fg': { flows: ['flue'] },
  'tour-gr': { flows: ['power'] },
  'fu-home': { flows: ['coal'] },
  'fu-rail': { flows: ['coal'] },
  'fu-mill': { bhCut: true, flows: ['coal'] },
  'fu-energy': { flows: ['coal'] },
  'bo-home': { bhCut: true },
  'bo-flame': { bhCut: true },
  'bo-water': { bhCut: true, flows: ['feed', 'steam'] },
  'bo-start': { bhCut: true, thCut: true, flows: ['feed', 'steam', 'cool'] },
  'tu-home': { thCut: true },
  'tu-blades': { thCut: true, turbOpen: true, flows: ['steam'] },
  'tu-gen': { thCut: true, flows: ['power'] },
  'tu-sync': { thCut: true, turbOpen: true, flows: ['steam'] },
  'co-home': { flows: ['cool'] },
  'co-tower': { ctCut: true, flows: ['cool'] },
  'co-cycle': { thCut: true, bhCut: true, flows: ['steam', 'feed', 'cool'] },
  'co-sankey': {},
  'fg-home': { flows: ['flue'] },
  'fg-esp': { espCut: true },
  'fg-fgd': { fgdCut: true },
  'fg-co2': {},
  'gr-home': { flows: ['power'] },
  'gr-load': { flows: ['power'] },
  'gr-mix': {},
};
const cfgOf = (mode: string): Cfg => ({ ...BASE, ...(CFG[mode] ?? {}) });

const FLOW_STYLE: Record<FlowKey, { color: string; size: number; speed: number }> = {
  coal: { color: '#1b1b1e', size: 1.5, speed: 22 },
  steam: { color: '#ff5a36', size: 0.9, speed: 26 },
  feed: { color: '#3b8be0', size: 0.75, speed: 14 },
  cool: { color: '#7fd0ff', size: 1.4, speed: 18 },
  flue: { color: '#8a8580', size: 2.2, speed: 24 },
  power: { color: '#ffd34d', size: 1.8, speed: 60 },
};

/* ================= części do kliknięcia ================= */

interface PartInfo {
  name: string;
  desc: string;
  pos: V3;
  link?: string;
}

function homeParts(mode: string): Record<string, PartInfo> | null {
  switch (mode) {
    case 'fu-home':
      return {
        rail: { name: 'bocznica kolejowa', desc: 'Węgiel przyjeżdża pociągami z kopalni – blok 900 MW zużywa w ciągu doby ponad 7000 t, czyli ok. trzy pełne składy po kilkadziesiąt wagonów.', pos: [300, 10, RAIL_Z] },
        unload: { name: 'rozładunek wagonów', desc: 'Wagony samowyładowcze otwierają klapy w dnie nad lejami pod torem. Zimą zamarznięty węgiel trzeba najpierw rozmrozić w specjalnej hali, a z zalegających resztek wybijają go wstrząsarki.', pos: [UNLOAD[0], 24, RAIL_Z] },
        pile: { name: 'zwały węgla', desc: 'Zapas na kilkanaście–kilkadziesiąt dni pracy, na wypadek przerw w dostawach. Zwał ugniata się walcami, żeby nie dostawało się do niego powietrze – inaczej węgiel mógłby się sam zapalić.', pos: [240, 22, PILES[1].z] },
        stacker: { name: 'zwałowarko-ładowarka', desc: 'Maszyna na szynach z długim wysięgnikiem: taśmą na wysięgniku usypuje zwał, a kołem czerpakowym na końcu wybiera z niego węgiel, kiedy pociągi nie przyjeżdżają.', pos: [200, 24, STACKER_Z] },
        crusher: { name: 'kruszarnia', desc: 'Kruszarki rozbijają większe bryły na kawałki mniejsze niż ok. 3 cm. Po drodze magnesy wyłapują kawałki żelaza, a wagi taśmowe liczą, ile węgla poszło do kotła.', pos: [CRUSH[0], 32, CRUSH[2]] },
        belt: { name: 'taśmociąg w galerii', desc: 'Przenośnik taśmowy w zamkniętej galerii (osłona przed deszczem i pyleniem) wnosi węgiel ok. 70 m w górę, do zasobników nad młynami. Taśma ma ok. 2 m szerokości i jedzie ok. 3 m/s.', pos: [70, 48, 8] },
        bunker: { name: 'bunkrownia', desc: 'Budynek z sześcioma zasobnikami nad młynami. Zapas w zasobnikach wystarcza na kilka godzin pracy – blok nie stanie, gdy taśmociąg na chwilę się zatrzyma.', pos: [0, BUNK.h + 6, BUNK.z0] },
      };
    case 'bo-home':
      return {
        furnace: { name: 'komora paleniskowa', desc: 'Wysoka na ok. 90 m „skrzynia” o przekroju 22 × 22 m, w której spala się pył węglowy. W środku płomienia jest ok. 1400 °C. Ściany nie są z cegieł, tylko z rur, w których płynie woda – to one odbierają ciepło.', pos: [0, 52, 2] },
        burners: { name: 'palniki narożne', desc: 'Po cztery w każdym narożniku, jeden nad drugim. Wdmuchują mieszankę pyłu węglowego z gorącym powietrzem stycznie do okręgu w środku komory, więc płomień wiruje jak tornado – dobrze się miesza i równo grzeje ściany.', pos: [BOIL.half, 30, BOIL.half + 2] },
        walls: { name: 'ściany szczelne z rur', desc: 'Setki pionowych rur spawanych ze sobą płaskownikami w gazoszczelną ścianę. Woda pod ciśnieniem ok. 30 MPa płynie w nich w górę i odbiera ciepło płomienia. Rury mają ok. 4 cm średnicy i ściankę grubości kilku milimetrów.', pos: [-BOIL.half, 70, 2] },
        sh: { name: BANKS[0][0], desc: 'Pęczek wężownic, w których para jest dogrzewana do ok. 600 °C. To najgorętsze rury w elektrowni – są ze specjalnej stali, która nie mięknie w takiej temperaturze.', pos: [6, (BANKS[0][1] + BANKS[0][2]) / 2, 4] },
        rh: { name: BANKS[1][0], desc: 'Para, która oddała już część energii w turbinie wysokoprężnej, wraca tu i jest ponownie podgrzewana do ok. 620 °C. Dzięki temu dalej w turbinie oddaje więcej energii, a skropliny nie niszczą łopatek.', pos: [6, (BANKS[1][1] + BANKS[1][2]) / 2, 4] },
        eco: { name: BANKS[3][0], desc: 'Podgrzewacz wody (ekonomizer): ostatnie rury na drodze spalin. Odbierają ciepło już chłodniejszym spalinom i podgrzewają wodę, zanim trafi do ścian komory.', pos: [6, (BANKS[3][1] + BANKS[3][2]) / 2, 4] },
        hopper: { name: 'lej żużlowy', desc: 'Dno komory w kształcie leja. Spadają do niego stopione kawałki popiołu (żużel), które w wannie z wodą zastygają i są wywożone – np. do budowy dróg.', pos: [0, 8, 6] },
        frame: { name: 'konstrukcja nośna', desc: 'Kocioł nie stoi, tylko wisi na stalowych belkach pod dachem kotłowni. Po rozgrzaniu wydłuża się o kilkadziesiąt centymetrów – w dół, swobodnie.', pos: [0, BOIL.y1 + 9, 6] },
      };
    case 'tu-home': {
      const t = (id: string) => TURB.find((q) => q.id === id)!;
      return {
        hp: { name: 'część wysokoprężna (WP)', desc: 'Pierwsza część turbiny: wpływa do niej para świeża o temperaturze ok. 600 °C i ciśnieniu ok. 28 MPa. Łopatki są tu krótkie, bo gęsta para zajmuje mało miejsca.', pos: [t('hp').x, AX + 4.5, 3] },
        ip: { name: 'część średnioprężna (SP)', desc: 'Wpływa tu para wtórnie przegrzana w kotle (ok. 620 °C, ok. 5 MPa). Rozpręża się dalej i płynie przelotnią (gruba rura nad turbiną) do części niskoprężnych.', pos: [t('ip').x, AX + 5, 3] },
        lp: { name: 'części niskoprężne (NP)', desc: 'Dwie największe części: para jest już rzadka i zajmuje ogromną objętość, więc ostatnie łopatki mają ponad metr długości, a ich końce pędzą szybciej niż dźwięk. Para wpływa w środku i płynie w obie strony.', pos: [t('lp1').x - 8, AX + 7, 3] },
        gen: { name: 'generator', desc: 'Prądnica o mocy 900 MW chłodzona wodorem i wodą. Wirnik to elektromagnes ważący ok. 70 t, który obraca się 3000 razy na minutę w uzwojeniach stojana – powstaje w nich prąd przemienny o napięciu ok. 27 kV.', pos: [t('gen').x, AX + 4.4, 3] },
        exc: { name: 'wzbudnica', desc: 'Zasila prądem stałym elektromagnes wirnika generatora. Regulując ten prąd, utrzymuje się stałe napięcie w sieci.', pos: [t('exc').x, AX + 3, 2] },
        cond: { name: 'skraplacze', desc: 'Pod częściami NP para oddaje resztę ciepła wodzie chłodzącej płynącej w tysiącach rurek i skrapla się. Woda zajmuje tysiące razy mniej miejsca niż para, więc w skraplaczu powstaje podciśnienie – ono „zasysa” parę przez turbinę.', pos: [-94, 10, 7] },
        crane: { name: 'suwnica', desc: 'Dźwig pod dachem hali, który przy remoncie zdejmuje górne połówki obudów i wyjmuje wirniki – najcięższe ważą kilkadziesiąt ton.', pos: [-100, 40, 5] },
        pumps: { name: 'pompy wody zasilającej', desc: 'Tłoczą wodę do kotła pod ciśnieniem ponad 30 MPa – trzysta razy większym niż w oponie samochodu. To największe „odbiorniki” prądu w samej elektrowni: każda ma moc kilkunastu MW.', pos: [-65, 4, 15] },
        deaer: { name: 'odgazowywacz', desc: 'Zbiornik wody zasilającej. Woda jest tu podgrzewana parą, a rozpuszczony w niej tlen ucieka – inaczej powodowałby rdzewienie rur kotła.', pos: [DEAER[0], DEAER[1] + 5, DEAER[2]] },
      };
    }
    case 'co-home':
      return {
        tower: { name: 'chłodnia kominowa', desc: 'Żelbetowa wieża o wysokości ok. 180 m i ścianie grubości zaledwie kilkunastu–kilkudziesięciu centymetrów. Woda chłodząca spływa w niej w dół jak deszcz, a powietrze płynie w górę i ją ochładza.', pos: [CT.x + 50, 120, CT.z + 30] },
        plume: { name: 'pióropusz pary', desc: 'To nie dym, tylko krople wody – jak chmura. Ciepłe, wilgotne powietrze ochładza się nad chłodnią i para wodna skrapla się w drobne kropelki. W mroźny dzień pióropusz jest ogromny, w upał prawie go nie widać.', pos: [CT.x + 20, CT.h + 40, CT.z] },
        legs: { name: 'słupy i wlot powietrza', desc: 'Powłoka stoi na skośnych słupach. Między nimi wpływa chłodne powietrze. Ciągu nie robią wentylatory: ciepłe, wilgotne powietrze w środku jest lżejsze i samo unosi się w górę, jak w kominie.', pos: [CT.x + CT.rBase, 8, CT.z + 10] },
        pipes: { name: 'rurociągi wody chłodzącej', desc: 'Dwa grube rurociągi (ok. 3 m średnicy): jednym ciepła woda ze skraplacza (ok. 30 °C) płynie do chłodni, drugim ochłodzona (ok. 20 °C) wraca. Krąży jej ok. 100 000 m³ na godzinę – tyle co wody w 40 basenach olimpijskich.', pos: [-90, 8, -80] },
        pump: { name: 'pompownia', desc: 'Pompy wody chłodzącej – kilka ogromnych pomp, każda o mocy kilku MW. Woda krąży w obiegu zamkniętym, a z rzeki uzupełnia się tylko to, co odparuje (ok. 1500 m³ na godzinę).', pos: [-80, 14, -140] },
        river: { name: 'rzeka', desc: 'Z rzeki pobiera się wodę na uzupełnianie strat w chłodni. Starsze elektrownie bez chłodni brały z rzeki całą wodę chłodzącą i oddawały ją cieplejszą – to szkodziło rybom.', pos: [-200, 6, -470] },
      };
    case 'fg-home':
      return {
        scr: { name: 'odazotowanie (DeNOx)', desc: 'Reaktor z katalizatorem: do spalin wtryskuje się amoniak, który na żółtych kostkach katalizatora zamienia szkodliwe tlenki azotu w zwykły azot i parę wodną.', pos: [SCR[0] + 2, SCR[1] + 12, 8] },
        ah: { name: 'podgrzewacz powietrza', desc: 'Wielki obracający się bęben z blachami: z jednej strony nagrzewają go spaliny, z drugiej oddaje ciepło powietrzu do spalania. Odzyskuje ciepło, które inaczej uciekłoby kominem.', pos: [44, 22, 9] },
        esp: { name: 'elektrofiltr', desc: 'Wyłapuje ponad 99,9% popiołu lotnego. Drobiny pyłu ładują się elektrycznie przy elektrodach pod wysokim napięciem i przyklejają do uziemionych płyt. Co jakiś czas płyty są strząsane, a popiół spada do lejów.', pos: [(ESP.x0 + ESP.x1) / 2, ESP.h + 10, 8] },
        fan: { name: 'wentylator spalin', desc: 'Wysysa spaliny z kotła i przetłacza je przez wszystkie urządzenia do komina. W komorze paleniskowej utrzymuje lekkie podciśnienie, żeby gorące gazy nie wydostawały się szczelinami na zewnątrz.', pos: [120, 18, 10] },
        fgd: { name: 'odsiarczanie (absorber)', desc: 'Wysoka wieża, w której spaliny płyną w górę przez deszcz zawiesiny kamienia wapiennego w wodzie. Dwutlenek siarki reaguje z wapieniem i powstaje gips. Usuwa się w ten sposób ponad 95% siarki.', pos: [FGD[0], FGD_H + 6, 8] },
        gyps: { name: 'magazyn gipsu', desc: 'Gips z odsiarczania jest suszony i sprzedawany – trafia do fabryk płyt gipsowo-kartonowych i cementowni.', pos: [FGD[0] + 16, 20, 44] },
        stack: { name: 'komin', desc: 'Komin ma ok. 180 m wysokości: oczyszczone spaliny wypuszcza się wysoko, żeby rozrzedziły się w powietrzu, zanim opadną. W spalinach zostaje przede wszystkim dwutlenek węgla i para wodna.', pos: [STACK[0] + 8, STACK_H - 30, 6] },
        ash: { name: 'silosy popiołu', desc: 'Popiół z elektrofiltru trafia rurami do silosów, a stąd cysternami do cementowni i na budowy. Dodaje się go do betonu i cementu.', pos: [109, 30, -48] },
      };
    case 'gr-home':
      return {
        gen: { name: 'generator', desc: 'Wytwarza prąd przemienny o napięciu ok. 27 kV i częstotliwości 50 Hz. Szynoprzewody – grube przewody w osłonach – prowadzą go do transformatora.', pos: [-123, AX + 6, 5] },
        trafo: { name: 'transformator blokowy', desc: 'Trzy jednofazowe transformatory podwyższają napięcie z 27 kV do 400 kV. Przy wyższym napięciu tę samą moc przesyła się mniejszym prądem, więc przewody mniej się nagrzewają i mniej energii ginie po drodze.', pos: [TRAFO[0] + 12, 16, TRAFO[2]] },
        own: { name: 'potrzeby własne', desc: 'Ok. 6% prądu zużywa sama elektrownia: pompy, młyny, wentylatory, taśmociągi i oświetlenie. Zasila je osobny transformator.', pos: [-150, 20, -10] },
        yard: { name: 'rozdzielnia 400 kV', desc: 'Plac z wyłącznikami i odłącznikami: pozwalają przełączać linie i w ułamku sekundy odciąć uszkodzony odcinek sieci, zanim awaria się rozprzestrzeni.', pos: [(SWYARD.x0 + SWYARD.x1) / 2, 32, 0] },
        line: { name: 'linia 400 kV', desc: 'Linia najwyższego napięcia w Polsce. Wysyła energię setki kilometrów dalej – do stacji, gdzie napięcie obniża się stopniowo aż do 230 V w gniazdku.', pos: [PYLONS[1][0], 58, PYLONS[1][2]] },
      };
  }
  return null;
}

/** Podpisy w widoku całości – prowadzą do modułów. */
function homeLinks(): Record<string, PartInfo> {
  return {
    fuel: { name: 'węgiel i paliwo', desc: '', pos: [240, 40, 140], link: 'paliwo' },
    boiler: { name: 'kocioł', desc: '', pos: [0, BH.h + 14, 0], link: 'kociol' },
    turbine: { name: 'turbina i generator', desc: '', pos: [-95, 58, 0], link: 'turbina' },
    cool: { name: 'chłodzenie', desc: '', pos: [CT.x, CT.h + 16, CT.z], link: 'chlodzenie' },
    flue: { name: 'spaliny', desc: '', pos: [FGD[0], FGD_H + 20, 0], link: 'spaliny' },
    grid: { name: 'do sieci', desc: '', pos: [SWYARD.x0 + 40, 40, 0], link: 'siec' },
  };
}

/* ================= wykresy w ramkach ================= */

const PART_C = '#facc15';
const PHASE_C = '#7cc7ff';

function rows(list: [string, string][]) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: 13 }}>
      {list.map(([k, v]) => (
        <FragmentRow key={k} k={k} v={v} />
      ))}
    </div>
  );
}
function FragmentRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span style={{ opacity: 0.75 }}>{k}</span>
      <b>{v}</b>
    </>
  );
}
const fmt = (v: number, d = 0) => v.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Bilans energii bloku (wykres Sankeya): 100% energii węgla → prąd, chłodnia, spaliny, potrzeby własne. */
function Sankey() {
  const W = 300;
  const H = 170;
  const parts: [string, number, string][] = [
    ['prąd do sieci', 45.5, '#facc15'],
    ['ciepło w chłodni', 43, '#7fd0ff'],
    ['ciepło spalin w kominie', 6, '#a8a29e'],
    ['potrzeby własne', 3, '#fb923c'],
    ['inne straty', 2.5, '#f472b6'],
  ];
  const x0 = 40;
  const x1 = 150;
  const top = 12;
  const scale = (H - 30) / 100;
  let yL = top;
  let yR = top;
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <rect x={10} y={top} width={30} height={100 * scale} fill="#57534e" />
      <text x={25} y={top + 50 * scale} fill="#fff" fontSize={10} textAnchor="middle" transform={`rotate(-90 25 ${top + 50 * scale})`}>
        węgiel 100%
      </text>
      {parts.map(([name, v, col], i) => {
        const h = v * scale;
        const yl = yL;
        const yr = yR + i * 6;
        yL += h;
        yR += h;
        const path = `M${x0},${yl} C${(x0 + x1) / 2},${yl} ${(x0 + x1) / 2},${yr} ${x1},${yr} L${x1},${yr + h} C${(x0 + x1) / 2},${yr + h} ${(x0 + x1) / 2},${yl + h} ${x0},${yl + h} Z`;
        return (
          <g key={name}>
            <path d={path} fill={col} opacity={0.75} />
            <text x={x1 + 6} y={yr + h / 2 + 4} fill={col} fontSize={11}>
              {name} – {fmt(v, v % 1 ? 1 : 0)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Doba: zapotrzebowanie w kraju, produkcja słoneczna i praca bloku (przesuwa się kreska godziny). */
function DayChart({ h }: { h: number }) {
  const W = 300;
  const H = 150;
  const x = (t: number) => 28 + (t / 24) * (W - 40);
  const y = (v: number) => H - 22 - v * (H - 40);
  const line = (f: (t: number) => number) =>
    Array.from({ length: 97 }, (_, i) => i / 4)
      .map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(f(t)).toFixed(1)}`)
      .join(' ');
  const block = (t: number) => blockAt(t);
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {[0, 6, 12, 18, 24].map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(1)} stroke="#ffffff22" />
          <text x={x(t)} y={H - 6} fill="#cbd5e1" fontSize={10} textAnchor="middle">
            {t}:00
          </text>
        </g>
      ))}
      <path d={line(demandAt)} stroke="#e2e8f0" strokeWidth={2} fill="none" />
      <path d={line(solarAt)} stroke="#fbbf24" strokeWidth={2} fill="none" />
      <path d={line(block)} stroke="#fb7185" strokeWidth={2.4} fill="none" />
      <line x1={x(h)} x2={x(h)} y1={y(0)} y2={y(1)} stroke="#7cc7ff" strokeWidth={1.5} />
      <text x={34} y={14} fill="#e2e8f0" fontSize={10}>
        zapotrzebowanie
      </text>
      <text x={130} y={14} fill="#fbbf24" fontSize={10}>
        słońce
      </text>
      <text x={180} y={14} fill="#fb7185" fontSize={10}>
        nasz blok (moc)
      </text>
    </svg>
  );
}
/** Moc bloku w ciągu doby (część mocy): w nocy i w południe niżej, rano i wieczorem pełna. */
const blockAt = (t: number) => clamp(0.45 + (demandAt(t) - solarAt(t) - 0.55) * 1.6, 0.42, 1);

/** Udział węgla w produkcji prądu w Polsce. */
function ShareChart() {
  const W = 300;
  const H = 140;
  const x = (yr: number) => 30 + ((yr - 1990) / 34) * (W - 44);
  const y = (v: number) => H - 22 - (v / 100) * (H - 36);
  const d = COAL_SHARE.map(([yr, v], i) => `${i ? 'L' : 'M'}${x(yr)},${y(v)}`).join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={30} x2={W - 10} y1={y(v)} y2={y(v)} stroke="#ffffff22" />
          <text x={24} y={y(v) + 4} fill="#cbd5e1" fontSize={10} textAnchor="end">
            {v}%
          </text>
        </g>
      ))}
      {[1990, 2000, 2010, 2020].map((yr) => (
        <text key={yr} x={x(yr)} y={H - 6} fill="#cbd5e1" fontSize={10} textAnchor="middle">
          {yr}
        </text>
      ))}
      <path d={d} stroke="#fb7185" strokeWidth={2.4} fill="none" />
      {COAL_SHARE.map(([yr, v]) => (
        <circle key={yr} cx={x(yr)} cy={y(v)} r={2.4} fill="#fb7185" />
      ))}
    </svg>
  );
}

/** Trzy fazy prądu przemiennego (sinusoidy przesunięte o 120°) – kreska przesuwa się z obrotem wirnika. */
function ThreePhase({ phase }: { phase: number }) {
  const W = 300;
  const H = 110;
  const cols = ['#f87171', '#facc15', '#60a5fa'];
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <line x1={10} x2={W - 10} y1={H / 2} y2={H / 2} stroke="#ffffff33" />
      {cols.map((c, k) => (
        <path
          key={c}
          d={Array.from({ length: 121 }, (_, i) => {
            const t = i / 120;
            const v = Math.sin(t * Math.PI * 4 - (k * 2 * Math.PI) / 3 + phase);
            return `${i ? 'L' : 'M'}${(10 + t * (W - 20)).toFixed(1)},${(H / 2 - v * 38).toFixed(1)}`;
          }).join(' ')}
          stroke={c}
          strokeWidth={2}
          fill="none"
        />
      ))}
    </svg>
  );
}

/* ================= scenariusze ================= */

/** Rozruch bloku: etapy [koniec (s), opis]. */
const START: [number, string][] = [
  [6, 'Napełnianie kotła wodą i przewietrzanie komory'],
  [14, 'Rozpałka: zapalają się palniki olejowe'],
  [26, 'Ruszają młyny – do palników płynie pył węglowy'],
  [38, 'Para nagrzewa rurociągi, wirnik turbiny rusza'],
  [44, 'Synchronizacja z siecią – 3000 obr/min, 50 Hz'],
  [62, 'Zwiększanie mocy do 900 MW'],
  [1e9, 'Blok pracuje z pełną mocą'],
];
function startState(t: number) {
  const rpm = t < 26 ? 0 : t < 38 ? UNIT.rpm * sm(26, 38, t) : UNIT.rpm;
  const fire = t < 6 ? 0 : t < 14 ? 0.15 * sm(6, 9, t) : t < 26 ? mix(0.15, 0.35, sm(14, 26, t)) : t < 44 ? 0.35 : mix(0.35, 1, sm(44, 62, t));
  const P = t < 44 ? 0 : mix(0.06, 1, sm(44, 62, t));
  const T = t < 6 ? 20 : t < 44 ? mix(20, 420, sm(6, 44, t)) : mix(420, UNIT.steamT, sm(44, 62, t));
  const phase = START.findIndex(([e]) => t < e);
  return { rpm, fire, P, T, phase };
}

/** Synchronizacja: [koniec (s), opis]. */
const SYNC: [number, string][] = [
  [14, 'Para rozpędza turbinę do 3000 obr/min'],
  [24, 'Dopasowanie: generator „goni” sieć – ta sama częstotliwość i faza'],
  [26, 'Załączenie wyłącznika – generator dołączony do sieci'],
  [1e9, 'Blok oddaje moc do sieci'],
];
function syncState(t: number) {
  const rpm = t < 14 ? UNIT.rpm * 0.985 * sm(0, 14, t) : t < 24 ? UNIT.rpm * mix(0.985, 1.002, sm(14, 22, t)) : UNIT.rpm;
  const P = t < 26 ? 0 : mix(0.05, 0.4, sm(26, 36, t));
  const phase = SYNC.findIndex(([e]) => t < e);
  return { rpm, P, phase };
}

/** Pociąg: czoło w funkcji czasu (s) – dojazd, rozładunek z wolną jazdą przez halę, postój. */
function trainX(t: number) {
  if (t < 0) return 60;
  if (t < 12) return mix(700, 130, sm(0, 12, t));
  if (t < 48) return mix(130, -210, (t - 12) / 36);
  return -210;
}

/* ================= scena ================= */

export function CoalScene({ params }: SceneProps) {
  const mode = str(params.mode, 'home');
  const cfg = cfgOf(mode);
  const run = Boolean(params.run);
  const powerP = num(params.power, 100) / 100;
  const home = useModuleHome();
  const nav = useTopicNav();
  const paused = useContext(PauseContext);

  const tRun = useRef(-1);
  const clock = useRef(0);
  const st = useRef({ k: powerP, fire: powerP, rpm: UNIT.rpm, angle: 0, stacker: 220, train: 60, coalRate: 0.6, h: 7 });
  const [phase, setPhase] = useState('');
  const [live, setLive] = useState({ k: powerP, rpm: UNIT.rpm, P: UNIT.P * powerP, T: UNIT.steamT, h: 7, ph: 0 });
  const liveRef = useRef(live);
  useEffect(() => {
    tRun.current = run ? 0 : -1;
  }, [run, mode]);

  const scenario = mode === 'fu-rail' || mode === 'bo-start' || mode === 'tu-sync';

  useFrame((_, dt0) => {
    const dt = paused ? 0 : Math.min(dt0, 0.05);
    clock.current += dt;
    if (tRun.current >= 0) tRun.current += dt;
    const t = tRun.current;
    const S = st.current;
    let k = powerP;
    let fire = powerP;
    let rpm: number = UNIT.rpm;
    let T: number = UNIT.steamT;
    let ph = '';
    let phIdx = -1;
    if (mode === 'bo-start') {
      if (t < 0) {
        k = 0;
        fire = 0;
        rpm = 0;
        T = 20;
      } else {
        const s = startState(t);
        k = s.P;
        fire = s.fire;
        rpm = s.rpm;
        T = s.T;
        phIdx = s.phase;
        ph = START[s.phase][1];
      }
    } else if (mode === 'tu-sync') {
      if (t < 0) {
        k = 0;
        rpm = 0;
      } else {
        const s = syncState(t);
        k = s.P;
        rpm = s.rpm;
        phIdx = s.phase;
        ph = SYNC[s.phase][1];
      }
      fire = 0.35 + k;
    } else if (mode === 'gr-load') {
      S.h = (S.h + dt * 0.4) % 24;
      k = blockAt(S.h);
      fire = k;
    } else if (mode === 'fu-rail') {
      const x = trainX(t);
      S.train = x;
      ph = t < 0 ? '' : t < 12 ? 'Pociąg z kopalni wjeżdża na bocznicę' : t < 48 ? 'Wagony otwierają klapy nad lejami – węgiel jedzie taśmą na zwał' : 'Rozładunek skończony – skład wraca do kopalni';
      S.coalRate = t >= 12 && t < 48 ? 1 : 0.25;
    }
    if (mode !== 'fu-rail') S.coalRate = 0.3 + 0.7 * k;
    S.k += (k - S.k) * Math.min(1, dt * 1.5);
    S.fire += (fire - S.fire) * Math.min(1, dt * 1.2);
    S.rpm = rpm;
    // obrót wału pokazany „stroboskopowo” – 3000 obr/min to 50 obrotów na sekundę, za szybko dla oka
    S.angle += (rpm / UNIT.rpm) * dt * 2.4;
    S.stacker = 240 + 70 * Math.sin(clock.current * 0.05);
    if (scenario && ph !== phase) setPhase(ph ? `${phIdx}|${ph}` : '');
    const L = liveRef.current;
    if (Math.abs(L.k - S.k) > 0.004 || Math.abs(L.rpm - rpm) > 5 || Math.abs(L.T - T) > 2 || (mode === 'gr-load' && Math.abs(L.h - S.h) > 0.1) || (mode === 'tu-gen' && Math.random() < 0.3)) {
      const next = { k: S.k, rpm, P: UNIT.P * S.k, T, h: S.h, ph: S.angle };
      liveRef.current = next;
      setLive(next);
    }
  });

  /* podpisy części */
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [mode]);
  const parts = home ? homeParts(mode) : null;
  const links = mode === 'home' && home ? homeLinks() : null;

  const L = load(clamp(live.k, 0.001, 1));
  const kRate = () => clamp(st.current.k, 0.03, 1);

  // ramka: treść zależna od trybu
  let info: ReactNode = null;
  const [pi, ptxt] = phase ? phase.split('|') : ['-1', ''];
  const phaseList = (list: [number, string][]) => (
    <>
      <div style={{ fontWeight: 700, color: PHASE_C }}>{run ? ptxt || 'Start' : 'Naciśnij „Rozpocznij”'}</div>
      {list.map(([, s], i) => (
        <div key={i} style={{ fontSize: 13, opacity: i === Number(pi) ? 1 : i < Number(pi) ? 0.75 : 0.45, fontWeight: i === Number(pi) ? 700 : 400 }}>
          {i < Number(pi) ? '✓' : i === Number(pi) ? '▸' : '·'} {s}
        </div>
      ))}
    </>
  );
  if (mode === 'fu-energy') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Ile węgla spala blok</div>
        {rows([
          ['moc bloku', `${fmt(L.P)} MW`],
          ['węgiel', `${fmt(L.coal)} t na godzinę`],
          ['na dobę', `${fmt(L.coal * 24)} t – ok. ${fmt((L.coal * 24) / 60)} wagonów`],
          ['energia w węglu', `${fmt(L.fuelMW)} MW`],
          ['sprawność', `${fmt(L.eta * 100, 1)}%`],
        ])}
      </>
    );
  } else if (mode === 'bo-flame') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Palenisko</div>
        {rows([
          ['pył węglowy', `${fmt(L.coal)} t/h`],
          ['powietrze do spalania', `ok. ${fmt(L.coal * 10)} t/h`],
          ['temperatura płomienia', 'ok. 1400 °C'],
          ['spaliny nad paleniskiem', 'ok. 1100 °C'],
          ['spaliny za kotłem', 'ok. 130 °C'],
        ])}
      </>
    );
  } else if (mode === 'bo-water') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Droga wody przez kocioł</div>
        {rows([
          ['woda zasilająca', '300 °C, 32 MPa'],
          ['za podgrzewaczem wody', '330 °C'],
          ['ściany komory', '330 → 450 °C (para)'],
          ['przegrzewacze', '450 → 600 °C, 28,5 MPa'],
          ['para wtórna', '360 → 620 °C, 5,5 MPa'],
          ['przepływ pary', `${fmt(L.steam)} t/h`],
        ])}
      </>
    );
  } else if (mode === 'bo-start') {
    info = (
      <>
        {phaseList(START)}
        <div style={{ height: 6 }} />
        {rows([
          ['temperatura pary', `${fmt(live.T)} °C`],
          ['obroty turbiny', `${fmt(live.rpm)} obr/min`],
          ['moc', `${fmt(live.P)} MW`],
        ])}
      </>
    );
  } else if (mode === 'tu-blades') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Para w turbinie</div>
        {rows([
          ['wlot WP', '600 °C, 28,5 MPa'],
          ['wylot WP', '360 °C, 6 MPa'],
          ['wlot SP (po kotle)', '620 °C, 5,5 MPa'],
          ['wylot SP', '300 °C, 0,5 MPa'],
          ['wylot NP', '33 °C, 0,005 MPa'],
          ['obroty', '3000 obr/min'],
        ])}
      </>
    );
  } else if (mode === 'tu-gen') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Prąd trójfazowy z generatora</div>
        <ThreePhase phase={live.ph * 6} />
        {rows([
          ['napięcie', 'ok. 27 kV'],
          ['częstotliwość', '50 Hz (3000 obr/min ÷ 60)'],
          ['prąd w każdej fazie', 'ok. 20 000 A'],
        ])}
      </>
    );
  } else if (mode === 'tu-sync') {
    const f = live.rpm / 60;
    const beat = Math.abs(f - UNIT.hz);
    const lit = run && live.rpm > 2000 && Math.cos(clock.current * beat * Math.PI * 2) > 0;
    info = (
      <>
        {phaseList(SYNC)}
        <div style={{ height: 6 }} />
        {rows([
          ['obroty', `${fmt(live.rpm)} obr/min`],
          ['częstotliwość generatora', `${fmt(f, 2)} Hz`],
          ['częstotliwość sieci', '50,00 Hz'],
          ['moc', `${fmt(live.P)} MW`],
        ])}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: lit ? '#fde047' : '#3f3f46', display: 'inline-block' }} />
          lampka synchronizacji (miga coraz wolniej, gdy częstotliwości się zbliżają)
        </div>
      </>
    );
  } else if (mode === 'fu-rail') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PHASE_C }}>{run ? phase.split('|')[1] || 'Start' : 'Naciśnij „Rozpocznij”'}</div>
        {rows([
          ['wagonów w składzie', '24'],
          ['węgla w składzie', 'ok. 1400 t'],
          ['wystarczy na', 'ok. 4,5 godziny pełnej mocy'],
        ])}
      </>
    );
  } else if (mode === 'co-tower') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Chłodnia</div>
        {rows([
          ['ciepło oddane powietrzu', `${fmt(L.cool)} MW`],
          ['woda krążąca', 'ok. 100 000 m³/h'],
          ['woda wpływająca', 'ok. 31 °C'],
          ['woda ochłodzona', 'ok. 21 °C'],
          ['odparowuje', `${fmt(L.evap)} m³/h`],
        ])}
      </>
    );
  } else if (mode === 'co-sankey') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Dokąd idzie energia z węgla</div>
        <Sankey />
      </>
    );
  } else if (mode === 'fg-fgd') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Odsiarczanie</div>
        {rows([
          ['SO₂ w spalinach przed', 'ok. 2000 mg/m³'],
          ['SO₂ za absorberem', 'poniżej 100 mg/m³'],
          ['kamień wapienny', `ok. ${fmt(L.gypsum * 0.6)} t/h`],
          ['powstaje gipsu', `ok. ${fmt(L.gypsum)} t/h`],
        ])}
      </>
    );
  } else if (mode === 'fg-co2') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Dwutlenek węgla</div>
        {rows([
          ['moc', `${fmt(L.P)} MW`],
          ['CO₂ na godzinę', `${fmt(L.co2)} t`],
          ['CO₂ na rok', `ok. ${fmt((UNIT.P * UNIT.co2 * 6500) / 1e6, 1)} mln t`],
          ['na 1 kWh prądu', `ok. ${fmt(UNIT.co2 * 1000)} g`],
          ['objętość w godzinę', `ok. ${fmt(L.co2 / 1.98 / 1000)} tys. m³`],
        ])}
      </>
    );
  } else if (mode === 'gr-load') {
    const hh = Math.floor(live.h);
    const mm = Math.floor((live.h - hh) * 60);
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>
          Godzina {hh}:{String(mm).padStart(2, '0')} – blok daje {fmt(live.P)} MW
        </div>
        <DayChart h={live.h} />
      </>
    );
  } else if (mode === 'gr-mix') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Węgiel w produkcji prądu w Polsce</div>
        <ShareChart />
      </>
    );
  }

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

  const flows = cfg.flows;
  const night = cfg.weather === 'night';
  const fireOn = cfg.bhCut;

  return (
    <>
      <Sky weather={cfg.weather} />
      <Clouds weather={cfg.weather} />
      {night && <Stars />}
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#e3edf7', '#5a5a40', 0.6]} />
      <directionalLight position={[300, 520, 380]} intensity={1.7} color="#fff6e8" />
      <directionalLight position={[-200, 120, -260]} intensity={0.3} color="#cfe0ff" />

      <Ground />
      <Trees />
      <BoilerHouse cut={cfg.bhCut} />
      <Boiler cut={cfg.bhCut} />
      <Bunkers cut={cfg.bhCut} />
      {fireOn && <Fireball power={() => st.current.fire} cut={cfg.bhCut} />}
      <TurbineHall cut={cfg.thCut} />
      <TurbineSet open={cfg.turbOpen} spin={() => st.current.angle} />
      <SteamPipes />
      <CoolingTower cut={cfg.ctCut} />
      <FlueGasLine cutEsp={cfg.espCut} cutFgd={cfg.fgdCut} />
      <Stack />
      <CoalYard stackerX={() => st.current.stacker} />
      <Train x={() => (mode === 'fu-rail' ? st.current.train : 60)} />
      <Grid />
      <Aux />
      {cfg.plume && <Plumes rate={() => clamp(st.current.k, 0, 1)} />}
      {mode === 'co-tower' && <TowerFlow rate={kRate} />}
      {mode === 'fg-esp' && <EspDust rate={kRate} />}
      {mode === 'fg-fgd' && <FgdSpray rate={kRate} />}
      {mode === 'fg-co2' && <Co2Cloud rate={kRate} />}

      {/* przepływy */}
      {flows.includes('coal') && <EnergyFlow path={P_COAL} count={160} speed={FLOW_STYLE.coal.speed} size={FLOW_STYLE.coal.size} color={FLOW_STYLE.coal.color} rate={() => st.current.coalRate} />}
      {flows.includes('steam') && (
        <>
          <EnergyFlow path={P_STEAM} count={120} speed={30} size={0.9} color="#ff5a36" rate={kRate} />
          <EnergyFlow path={P_REHEAT_COLD} count={110} speed={26} size={0.9} color="#ff9a3c" rate={kRate} />
          <EnergyFlow path={P_REHEAT_HOT} count={120} speed={30} size={0.9} color="#ff5a36" rate={kRate} />
          <EnergyFlow path={P_CROSS} count={40} speed={16} size={1.2} color="#f5d0c0" rate={kRate} />
        </>
      )}
      {flows.includes('feed') && <EnergyFlow path={P_FEED} count={90} speed={14} size={0.75} color="#3b8be0" rate={kRate} />}
      {flows.includes('cool') && (
        <>
          <EnergyFlow path={P_COOL_OUT} count={60} speed={18} size={1.6} color="#ff9e7a" rate={kRate} />
          <EnergyFlow path={P_COOL_IN} count={50} speed={18} size={1.6} color="#7fd0ff" rate={kRate} />
        </>
      )}
      {flows.includes('flue') && <EnergyFlow path={P_FLUE} count={220} speed={24} size={2.0} color="#8a8580" rate={kRate} />}
      {flows.includes('power') && <EnergyFlow path={P_POWER} count={110} speed={70} size={2.2} color="#ffd34d" rate={kRate} />}

      {/* stałe podpisy w zakładkach z przekrojem */}
      {mode === 'fu-mill' && <MillLabels />}
      {mode === 'bo-water' && <WaterLabels />}
      {mode === 'co-cycle' && <CycleLabels />}

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
    </>
  );
}

/** Podpisy młyna i zasobnika (nieklikalne). */
function MillLabels() {
  const x = MILLS[2];
  return (
    <>
      <Lbl pos={[x, 54, MILL_Z + 5]} sub>
        zasobnik węgla
      </Lbl>
      <Lbl pos={[x, 31, MILL_Z + 3]} sub>
        podajnik
      </Lbl>
      <Lbl pos={[x, 5, MILL_Z + 5]} sub>
        młyn
      </Lbl>
      <Lbl pos={[x, 12.5, MILL_Z + 4]} sub>
        odsiewacz
      </Lbl>
      <Lbl pos={[x * 0.5, 22, -BOIL.half + 2]} sub>
        pyłoprzewody do palników
      </Lbl>
    </>
  );
}

/** Podpisy drogi wody w kotle. */
function WaterLabels() {
  return (
    <>
      <Lbl pos={[-14, 3, 16]} sub color="#7cc0ff">
        woda zasilająca
      </Lbl>
      <Lbl pos={[-BOIL.half - 3, 45, 6]} sub color="#a5d8ff">
        parowanie w ścianach
      </Lbl>
      <Lbl pos={[-6, 114, 6]} sub color="#ff8a6a">
        para świeża do turbiny
      </Lbl>
      <Lbl pos={[-24, 104, -4]} sub color="#ffb37a">
        para wtórna
      </Lbl>
    </>
  );
}

/** Podpisy obiegu wody i pary. */
function CycleLabels() {
  return (
    <>
      <Lbl pos={[0, 70, 8]} sub color="#ff8a6a">
        1. kocioł: woda → para
      </Lbl>
      <Lbl pos={[-75, AX + 8, 8]} sub color="#f5d0c0">
        2. turbina: para się rozpręża
      </Lbl>
      <Lbl pos={[-94, 6, 12]} sub color="#a5d8ff">
        3. skraplacz: para → woda
      </Lbl>
      <Lbl pos={[-55, 4, 20]} sub color="#7cc0ff">
        4. pompy: woda wraca do kotła
      </Lbl>
    </>
  );
}

/**
 * Bańka CO₂: przezroczysta kula nad kominem rośnie w ciągu „godziny” (kilkunastu sekund) do objętości gazu
 * wyemitowanego w godzinę, potem odlatuje i zaczyna się nowa.
 */
function Co2Cloud({ rate }: { rate: () => number }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current = (t.current + Math.min(dt, 0.05) / 14) % 1;
    const vol = (load(rate()).co2 / 1.98) * 1000; // m³
    const R = Math.cbrt((3 * vol) / (4 * Math.PI));
    const r = R * Math.cbrt(t.current);
    if (ref.current) {
      ref.current.scale.setScalar(Math.max(0.1, r));
      ref.current.position.set(STACK[0] + r * 0.2, STACK_H + r * 0.95, STACK[2]);
    }
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1, 40, 24]} />
      <meshStandardMaterial color="#9aa3ad" transparent opacity={0.28} depthWrite={false} roughness={0.4} />
    </mesh>
  );
}

