/*
 * Elektrownia jądrowa – wspólna scena 3D wszystkich zakładek tematu. Tryb zakładki (params.mode) decyduje, co
 * widać: cała elektrownia nad morzem, budynek reaktora w przekroju (zbiornik z rdzeniem, wytwornice pary,
 * stabilizator ciśnienia), maszynownia z otwartą turbiną, basen wypalonego paliwa, ujęcie wody morskiej, sieć,
 * powiększenia reakcji łańcuchowej i paliwa. Kulki w ruchu pokazują przepływy: woda obiegu pierwotnego (gorąca
 * i zimna), para, woda zasilająca, woda morska i prąd.
 */
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { SceneProps } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { useModuleHome, useTopicNav } from '../../lib/topicNav';
import { PauseContext } from '../../lib/useAnimationClock';
import { Lbl } from '../aviation/airliner';
import { Clouds, Sky } from './windWorld';
import { EnergyFlow } from './windExtras';
import { Grid, TurbineHall, TurbineSet } from './coalPlant';
import { AX, TURB, TRAFO } from './coalGeo';
import {
  CASKS,
  CO2_LIFE,
  CORE,
  CV,
  DECK_Y,
  DIESEL,
  INTAKE,
  OUTFALL,
  POOL,
  PUMP,
  PZR,
  P_CROSS,
  P_FEED,
  P_POWER,
  P_SEA_IN,
  P_SEA_OUT,
  P_STEAM,
  P_STEAM2,
  RPV,
  SG,
  SHIELD,
  SWYARD,
  UNIT,
  clamp,
  coldLeg,
  decayHeat,
  hotLeg,
  sm,
  type V3,
} from './nuclearGeo';
import { ACC, AuxBuilding, CMT, CaskPad, Coast, CoreFlow, IRWST, Msr, Pines, PrimaryLoop, ReactorBuilding, Site } from './nuclearPlant';
import { ChainReaction, Cherenkov, FuelExhibit, PassiveCooling, PoolGlow, RefuelAssembly, SgBoil, type ChainStats } from './nuclearFx';

const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

/* ================= ustawienia trybów ================= */

type FlowKey = 'hot' | 'cold' | 'steam' | 'feed' | 'sea' | 'power';
interface Cfg {
  cut: boolean;
  auxCut: boolean;
  thCut: boolean;
  turbOpen: boolean;
  flows: FlowKey[];
  lab: boolean;
  fuelLab: boolean;
  boil: boolean;
  passive: boolean;
}
const BASE: Cfg = { cut: false, auxCut: false, thCut: false, turbOpen: false, flows: [], lab: false, fuelLab: false, boil: false, passive: false };
const CFG: Record<string, Partial<Cfg>> = {
  home: {},
  'tour-re': { cut: true },
  'tour-ob': { cut: true, flows: ['hot', 'cold'] },
  'tour-bz': { cut: true },
  'tour-tu': { thCut: true, turbOpen: true, flows: ['steam'] },
  'tour-pa': { auxCut: true },
  'tour-gr': { flows: ['power'] },
  're-home': { cut: true },
  're-fission': { lab: true },
  're-fuel': { fuelLab: true },
  're-rods': { cut: true },
  'ob-home': { cut: true },
  'ob-loop': { cut: true, flows: ['hot', 'cold', 'steam', 'feed'] },
  'ob-sg': { cut: true, boil: true, flows: ['hot', 'cold'] },
  'ob-press': { cut: true },
  'bz-home': { cut: true },
  'bz-scram': { cut: true, flows: ['hot', 'cold'] },
  'bz-passive': { cut: true },
  'bz-dose': {},
  'tu-home': { thCut: true },
  'tu-cycle': { thCut: true, cut: true, turbOpen: true, flows: ['steam', 'feed', 'sea', 'hot', 'cold'] },
  'tu-sea': { flows: ['sea'] },
  'tu-sankey': {},
  'pa-home': { auxCut: true },
  'pa-energy': { fuelLab: true },
  'pa-refuel': { cut: true, auxCut: true },
  'pa-pool': { auxCut: true },
  'pa-dry': {},
  'gr-home': { flows: ['power'] },
  'gr-load': { flows: ['power'] },
  'gr-poland': {},
};
const cfgOf = (mode: string): Cfg => ({ ...BASE, ...(CFG[mode] ?? {}) });

/* ================= części do kliknięcia ================= */

interface PartInfo {
  name: string;
  desc: string;
  pos: V3;
  link?: string;
}
const tx = (id: string) => TURB.find((t) => t.id === id)!.x;

function homeParts(mode: string): Record<string, PartInfo> | null {
  switch (mode) {
    case 're-home':
      return {
        vessel: { name: 'zbiornik reaktora', desc: 'Stalowy zbiornik o średnicy ok. 4,5 m, wysoki na ponad 12 m, ze ścianami grubości ok. 20 cm. W środku jest rdzeń i woda pod ciśnieniem 155 razy większym niż ciśnienie powietrza. Waży ok. 400 t.', pos: [-RPV.r - 0.8, 14, 1] },
        core: { name: 'rdzeń', desc: '157 kaset paliwowych, każda z 264 prętów wypełnionych pastylkami tlenku uranu. W rdzeniu zachodzi reakcja łańcuchowa i powstaje ciepło – ok. 3400 MW, tyle co z ok. 1000 t węgla na godzinę.', pos: [0.4, CORE.y0 + 2, 1] },
        rods: { name: 'pręty sterujące', desc: 'Pręty z materiału, który pochłania neutrony (np. srebro z indem i kadmem). Wsuwane do rdzenia zwalniają reakcję, wysuwane – przyspieszają. W razie awarii wpadają do rdzenia same, pod własnym ciężarem, w ok. 2 sekundy.', pos: [0.6, CORE.y1 + 1.4, 1] },
        drives: { name: 'napędy prętów', desc: 'Na pokrywie zbiornika stoją rury z elektromagnesami, które trzymają i przesuwają pręty sterujące. Gdy zabraknie prądu, elektromagnesy puszczają i pręty spadają do rdzenia.', pos: [0, RPV.y1 + 4.5, 1] },
        water: { name: 'woda', desc: 'Woda robi w reaktorze trzy rzeczy naraz: odbiera ciepło z prętów, spowalnia neutrony (bez tego reakcja by nie szła) i osłania przed promieniowaniem. Krąży z prędkością ok. 14 t na sekundę.', pos: [RPV.r - 0.6, RPV.y1 - 1.5, 1] },
        well: { name: 'osłona biologiczna', desc: 'Gruba betonowa studnia wokół zbiornika. Zatrzymuje promieniowanie z rdzenia, dzięki czemu przy wyłączonym reaktorze ludzie mogą pracować w obudowie.', pos: [-4.4, 8, 1] },
      };
    case 'ob-home':
      return {
        hot: { name: 'gałąź gorąca', desc: 'Rura o średnicy ok. 1 m, którą woda o temperaturze ok. 320 °C płynie z reaktora do wytwornicy pary. Mimo takiej temperatury nie wrze, bo jest pod ciśnieniem 15,5 MPa.', pos: [-(SG.x - 3), RPV.nozY + 1, 1] },
        sg: { name: 'wytwornice pary', desc: 'Dwa wielkie wymienniki ciepła, wysokie na ok. 22 m. Gorąca woda z reaktora płynie w nich przez ok. 10 000 rurek w kształcie U i podgrzewa wodę z drugiego obiegu, która zamienia się w parę. Oba obiegi nigdzie się nie mieszają.', pos: [-SG.x, SG.yMid + 3, 2] },
        pumps: { name: 'pompy obiegu pierwotnego', desc: 'Cztery pompy, po dwie pod każdą wytwornicą. Silnik jest razem z pompą w szczelnej obudowie, więc woda z reaktora nie ma którędy wyciec.', pos: [SG.x + 1, SG.y0 - 7, 2] },
        cold: { name: 'gałęzie zimne', desc: 'Rury, którymi ochłodzona w wytwornicy woda (ok. 280 °C) wraca z pomp do reaktora.', pos: [SG.x - 3.5, RPV.nozY - 2, 2] },
        pzr: { name: 'stabilizator ciśnienia', desc: 'Wysoki zbiornik połączony z gałęzią gorącą. Jest w nim woda, a nad nią poduszka pary. Utrzymuje w obiegu stałe ciśnienie: grzałki podnoszą je, a natrysk zimnej wody obniża.', pos: [PZR.x + 1.6, PZR.y1, PZR.z] },
        steam: { name: 'rurociągi pary', desc: 'Z kopuł wytwornic para (ok. 273 °C, 5,8 MPa) płynie przez ścianę obudowy do maszynowni. To już obieg wtórny – woda w nim nie ma kontaktu z rdzeniem i nie jest radioaktywna.', pos: [-SG.x, SG.y1 + 4, 1] },
      };
    case 'bz-home':
      return {
        pellet: { name: '1. pastylka paliwa', desc: 'Ceramiczna pastylka tlenku uranu topi się dopiero w ok. 2800 °C. Zatrzymuje w sobie większość radioaktywnych odłamków powstałych przy rozszczepieniu.', pos: [0.2, CORE.y0 + 1, 1] },
        clad: { name: '2. koszulka pręta', desc: 'Szczelna rurka ze stopu cyrkonu, w której są pastylki. Nie wypuszcza gazów i pyłów, które wydostały się z pastylek.', pos: [0.8, CORE.y0 + 3.4, 1] },
        rcs: { name: '3. obieg pierwotny', desc: 'Stalowy zbiornik reaktora i rury o grubych ścianach. Gdyby nieszczelna była koszulka, radioaktywne substancje zostałyby w wodzie obiegu.', pos: [RPV.r + 0.4, 17, 1] },
        cv: { name: '4. stalowa obudowa bezpieczeństwa', desc: 'Szczelna stalowa „puszka” o średnicy prawie 40 m ze ścianami grubości 4,4 cm. Wytrzymuje ciśnienie pary, gdyby pękła rura obiegu pierwotnego.', pos: [-CV.r + 1, 40, 1] },
        shield: { name: '5. budynek osłonowy', desc: 'Żelbetowa ściana grubości ok. 90 cm. Chroni przed promieniowaniem i przed uderzeniami z zewnątrz – nawet przed rozbiciem się samolotu.', pos: [-SHIELD.r + 0.5, 52, 1] },
        irwst: { name: 'zbiornik wody przeładunkowej', desc: 'Pierścieniowy zbiornik ok. 2000 m³ wody wewnątrz obudowy, wyżej niż reaktor. Gdy obieg pierwotny straci wodę, otwierają się zawory i woda spływa do reaktora siłą ciężkości – bez pomp.', pos: [IRWST.r0 * Math.sin(Math.PI * 1.1), IRWST.y1 + 1, IRWST.r0 * Math.cos(Math.PI * 1.1)] },
        cmt: { name: 'zbiorniki uzupełniania rdzenia', desc: 'Dwa zbiorniki z zimną wodą z dodatkiem boru, ustawione nad reaktorem. Połączone są z obiegiem tak, że gdy w obiegu ubywa wody, sama z nich spływa do reaktora i zarazem gasi reakcję łańcuchową.', pos: [CMT[0][0], CMT[0][1] + 5.5, CMT[0][2]] },
        acc: { name: 'akumulatory hydrauliczne', desc: 'Kule z wodą, nad którą jest sprężony azot. Gdy ciśnienie w obiegu mocno spadnie, azot w kilkadziesiąt sekund wypycha wodę do reaktora.', pos: [ACC[1][0], ACC[1][1] + 3.2, ACC[1][2]] },
        tank: { name: 'zbiornik biernego chłodzenia', desc: 'Na dachu jest ok. 3000 m³ wody. W razie awarii spływa sama, siłą ciężkości, po stalowej obudowie i ją chłodzi – bez pomp, prądu i ludzi, przez co najmniej 3 doby.', pos: [0, SHIELD.tankY1 + 1, 2] },
      };
    case 'tu-home':
      return {
        hp: { name: 'część wysokoprężna (WP)', desc: 'Para z wytwornic (ok. 273 °C, 5,8 MPa) jest dużo chłodniejsza niż w elektrowni węglowej. Po przejściu przez część WP jest już trochę mokra – zawiera kropelki wody.', pos: [tx('hp'), AX + 4.5, 3] },
        msr: { name: 'osuszacze i przegrzewacze pary', desc: 'Przed częściami NP para przechodzi przez dwa długie zbiorniki po bokach turbiny, które oddzielają z niej krople i lekko ją dogrzewają. Krople wody pędzące razem z parą niszczyłyby łopatki.', pos: [-92, AX + 4.6, 12.5] },
        lp: { name: 'części niskoprężne (NP)', desc: 'Trzy dwuprzepływowe części NP z najdłuższymi łopatkami (ok. 1,4 m). Para jest tu tak rzadka, że zajmuje ogromną objętość.', pos: [tx('lp1'), AX + 7, 3] },
        gen: { name: 'generator', desc: 'Obraca się 1500 razy na minutę – o połowę wolniej niż w elektrowni węglowej. Ma cztery bieguny zamiast dwóch, więc i tak wytwarza prąd o częstotliwości 50 Hz. Wolniejsze obroty pozwalają na dłuższe łopatki w turbinie.', pos: [tx('gen'), AX + 4.4, 3] },
        cond: { name: 'skraplacze', desc: 'Para oddaje ciepło wodzie morskiej płynącej w dziesiątkach tysięcy rurek z tytanu (słona woda zniszczyłaby zwykłą stal) i zamienia się z powrotem w wodę.', pos: [-94, 10, 7] },
      };
    case 'pa-home':
      return {
        pool: { name: 'basen wypalonego paliwa', desc: 'Betonowy basen głęboki na ok. 12 m, wyłożony stalą. Wypalone kasety stoją na dnie w stojakach. Woda chłodzi je i osłania – nad basenem można bezpiecznie stać.', pos: [(POOL.x0 + POOL.x1) / 2, POOL.y1 + 2, -2] },
        racks: { name: 'stojaki z kasetami', desc: 'Kasety stoją w stalowych komorach z dodatkiem boru, który pochłania neutrony – dzięki temu w basenie nie może zacząć się reakcja łańcuchowa.', pos: [POOL.x0 + 2, POOL.y0 + 5, -6] },
        glow: { name: 'niebieska poświata', desc: 'Świecenie Czerenkowa: cząstki wylatujące z paliwa pędzą w wodzie szybciej niż światło w wodzie i wywołują niebieski blask – trochę jak samolot naddźwiękowy wywołuje huk.', pos: [(POOL.x0 + POOL.x1) / 2 + 3, POOL.y0 + 6, -4] },
        crane: { name: 'suwnica basenowa', desc: 'Przenosi kasety pod wodą – zawsze kilka metrów pod powierzchnią, żeby woda osłaniała ludzi na pomoście.', pos: [(POOL.x0 + POOL.x1) / 2, POOL.y1 + 9, -7] },
        tunnel: { name: 'tunel przeładunkowy', desc: 'Łączy kanał nad reaktorem z basenem. W czasie wymiany paliwa kasety przejeżdżają nim na wózku – cały czas pod wodą.', pos: [(CV.r + POOL.x0) / 2 + 2, 8, -4] },
        diesel: { name: 'agregaty prądotwórcze', desc: 'Silniki diesla z prądnicami na wypadek utraty zasilania z sieci. W tym typie reaktora nie są potrzebne do bezpieczeństwa (chłodzenie działa biernie), ale pomagają.', pos: [DIESEL[0][0], 14, DIESEL[0][2]] },
      };
    case 'gr-home':
      return {
        gen: { name: 'generator', desc: 'Generator o mocy ok. 1150 MW – to jeden z największych pojedynczych generatorów w Polsce. Daje prąd o napięciu ok. 24 kV.', pos: [tx('gen'), AX + 6, 5] },
        trafo: { name: 'transformator blokowy', desc: 'Podnosi napięcie do 400 kV. Elektrownia ma też osobne transformatory, przez które zasila się z sieci, gdy reaktor nie pracuje.', pos: [TRAFO[0] + 12, 16, TRAFO[2]] },
        yard: { name: 'rozdzielnia 400 kV', desc: 'Łączy blok z kilkoma liniami. Dla bezpieczeństwa elektrownia jądrowa musi mieć zasilanie z co najmniej dwóch niezależnych linii.', pos: [(SWYARD.x0 + SWYARD.x1) / 2, 32, 0] },
        line: { name: 'linia 400 kV', desc: 'Prąd z Pomorza płynie do miast w całym kraju. Na północy Polski jest mało dużych elektrowni, więc nowy blok wzmocni tam sieć.', pos: [-470, 58, 15] },
      };
  }
  return null;
}

function homeLinks(): Record<string, PartInfo> {
  return {
    re: { name: 'reaktor i paliwo', desc: '', pos: [0, SHIELD.stackTop + 10, 0], link: 'reaktor' },
    ob: { name: 'obieg pierwotny', desc: '', pos: [-26, 46, 10], link: 'obieg' },
    bz: { name: 'bezpieczeństwo', desc: '', pos: [24, 62, 10], link: 'bezpieczenstwo' },
    tu: { name: 'turbina i morze', desc: '', pos: [-95, 58, 0], link: 'turbina' },
    pa: { name: 'paliwo i odpady', desc: '', pos: [(CASKS.x0 + CASKS.x1) / 2, 20, (CASKS.z0 + CASKS.z1) / 2], link: 'paliwo' },
    gr: { name: 'do sieci', desc: '', pos: [SWYARD.x0 + 40, 40, 0], link: 'siec' },
  };
}

/* ================= ramki ================= */

const PART_C = '#facc15';
const PHASE_C = '#7cc7ff';
const fmt = (v: number, d = 0) => v.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });
function rows(list: [string, string][]) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: 13 }}>
      {list.map(([k, v]) => (
        <Row key={k} k={k} v={v} />
      ))}
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span style={{ opacity: 0.75 }}>{k}</span>
      <b>{v}</b>
    </>
  );
}

/** Bilans energii: 100% ciepła z reaktora → prąd, ciepło do morza, potrzeby własne. */
function Sankey() {
  const parts: [string, number, string][] = [
    ['prąd do sieci', 33, '#facc15'],
    ['ciepło do morza', 64.5, '#7fd0ff'],
    ['potrzeby własne', 2.5, '#fb923c'],
  ];
  const W = 300;
  const H = 150;
  const x0 = 40;
  const x1 = 150;
  const top = 10;
  const scale = (H - 26) / 100;
  let yL = top;
  let yR = top;
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <rect x={10} y={top} width={30} height={100 * scale} fill="#0ea5e9" />
      <text x={25} y={top + 50 * scale} fill="#fff" fontSize={10} textAnchor="middle" transform={`rotate(-90 25 ${top + 50 * scale})`}>
        ciepło z reaktora
      </text>
      {parts.map(([name, v, col], i) => {
        const h = v * scale;
        const yl = yL;
        const yr = yR + i * 8;
        yL += h;
        yR += h;
        const d = `M${x0},${yl} C${(x0 + x1) / 2},${yl} ${(x0 + x1) / 2},${yr} ${x1},${yr} L${x1},${yr + h} C${(x0 + x1) / 2},${yr + h} ${(x0 + x1) / 2},${yl + h} ${x0},${yl + h} Z`;
        return (
          <g key={name}>
            <path d={d} fill={col} opacity={0.75} />
            <text x={x1 + 6} y={yr + h / 2 + 4} fill={col} fontSize={11}>
              {name} – {fmt(v, v % 1 ? 1 : 0)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Ciepło powyłączeniowe: moc cieplna w funkcji czasu od wyłączenia (oś czasu logarytmiczna). */
function DecayChart({ t }: { t: number }) {
  const W = 300;
  const H = 130;
  const x = (s: number) => 30 + (Math.log10(Math.max(1, s)) / 6) * (W - 40);
  const y = (p: number) => H - 20 - (p / 8) * (H - 34);
  const pts = Array.from({ length: 80 }, (_, i) => Math.pow(10, (i / 79) * 6));
  const d = pts.map((s, i) => `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(decayHeat(s) * 100).toFixed(1)}`).join(' ');
  const ticks: [number, string][] = [
    [1, '1 s'],
    [60, '1 min'],
    [3600, '1 h'],
    [86400, '1 doba'],
  ];
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {ticks.map(([s, l]) => (
        <g key={l}>
          <line x1={x(s)} x2={x(s)} y1={y(0)} y2={y(8)} stroke="#ffffff22" />
          <text x={x(s)} y={H - 6} fill="#cbd5e1" fontSize={10} textAnchor="middle">
            {l}
          </text>
        </g>
      ))}
      {[0, 4, 8].map((p) => (
        <text key={p} x={24} y={y(p) + 4} fill="#cbd5e1" fontSize={10} textAnchor="end">
          {p}%
        </text>
      ))}
      <path d={d} stroke="#fb7185" strokeWidth={2.2} fill="none" />
      {t > 0 && <circle cx={x(t)} cy={y(decayHeat(t) * 100)} r={4} fill="#fde047" />}
    </svg>
  );
}

/** Emisje CO₂ w całym cyklu życia (słupki). */
function Co2Bars() {
  const W = 300;
  const rowH = 22;
  const max = 820;
  return (
    <svg width={W} height={CO2_LIFE.length * rowH + 8} style={{ display: 'block' }}>
      {CO2_LIFE.map(([name, v, col], i) => (
        <g key={name} transform={`translate(0 ${i * rowH + 4})`}>
          <text x={96} y={14} fill="#e2e8f0" fontSize={11} textAnchor="end">
            {name}
          </text>
          <rect x={102} y={3} width={Math.max(2, (v / max) * 150)} height={14} fill={col} />
          <text x={108 + Math.max(2, (v / max) * 150)} y={14} fill={col} fontSize={11}>
            {v} g
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Doba w sieci: zapotrzebowanie, wiatr i równa praca bloku jądrowego. */
function BaseChart({ h }: { h: number }) {
  const W = 300;
  const H = 140;
  const x = (t: number) => 28 + (t / 24) * (W - 40);
  const y = (v: number) => H - 22 - v * (H - 40);
  const demand = (t: number) => 0.62 + Math.exp(-(((t - 8.5) / 2.6) ** 2)) * 0.22 + Math.exp(-(((t - 18.5) / 2.2) ** 2)) * 0.3;
  const windF = (t: number) => 0.25 + 0.15 * Math.sin(t / 3.1 + 1) + 0.08 * Math.sin(t * 1.3);
  const line = (f: (t: number) => number) =>
    Array.from({ length: 97 }, (_, i) => i / 4)
      .map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(Math.min(1, f(t))).toFixed(1)}`)
      .join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {[0, 6, 12, 18, 24].map((t) => (
        <text key={t} x={x(t)} y={H - 6} fill="#cbd5e1" fontSize={10} textAnchor="middle">
          {t}:00
        </text>
      ))}
      <path d={line(demand)} stroke="#e2e8f0" strokeWidth={2} fill="none" />
      <path d={line(windF)} stroke="#2dd4bf" strokeWidth={2} fill="none" />
      <path d={line(() => 0.3)} stroke="#38bdf8" strokeWidth={2.6} fill="none" />
      <line x1={x(h)} x2={x(h)} y1={y(0)} y2={y(1)} stroke="#fde047" strokeWidth={1.5} />
      <text x={32} y={14} fill="#e2e8f0" fontSize={10}>
        zapotrzebowanie
      </text>
      <text x={128} y={14} fill="#2dd4bf" fontSize={10}>
        wiatr
      </text>
      <text x={170} y={14} fill="#38bdf8" fontSize={10}>
        atom (równo)
      </text>
    </svg>
  );
}

/** Dawki promieniowania (mSv) – skala logarytmiczna. */
const DOSES: [string, number, string][] = [
  ['zjedzenie banana', 0.0001, '#fde047'],
  ['rok obok elektrowni jądrowej', 0.005, '#38bdf8'],
  ['prześwietlenie płuc', 0.02, '#a5b4fc'],
  ['lot Warszawa – Nowy Jork i z powrotem', 0.08, '#c4b5fd'],
  ['rok tła naturalnego w Polsce', 2.8, '#86efac'],
  ['tomografia brzucha', 8, '#fca5a5'],
  ['roczny limit dla pracowników', 20, '#fb923c'],
];
function DoseBars() {
  const W = 300;
  const rowH = 22;
  const lx = (v: number) => ((Math.log10(v) + 4) / 5.5) * 140;
  return (
    <svg width={W} height={DOSES.length * rowH + 8} style={{ display: 'block' }}>
      {DOSES.map(([name, v, col], i) => (
        <g key={name} transform={`translate(0 ${i * rowH + 4})`}>
          <rect x={0} y={3} width={Math.max(3, lx(v))} height={14} fill={col} opacity={0.85} />
          <text x={Math.max(3, lx(v)) + 6} y={14} fill="#e2e8f0" fontSize={10.5}>
            {name} – {v.toLocaleString('pl-PL', { maximumFractionDigits: 4 })} mSv
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ================= scenariusze ================= */

const SCRAM: [number, string][] = [
  [3, 'Czujniki wykrywają usterkę – pręty sterujące spadają do rdzenia'],
  [10, 'Reakcja łańcuchowa ustaje w sekundy – zostaje ciepło rozpadu (ok. 6%)'],
  [24, 'Pompy dalej krążą wodę, ciepło odbierają wytwornice pary'],
  [1e9, 'Ciepło rozpadu maleje: po godzinie ok. 1,5%, po dobie ok. 0,5% mocy'],
];
/** Czas „rzeczywisty” (s) dla czasu scenariusza – po kilku sekundach czas przyspiesza, żeby pokazać godziny. */
const scramSim = (t: number) => (t < 3 ? t : 3 + (t - 3) ** 2 * 35);

const PASSIVE: [number, string][] = [
  [4, 'Zanik zasilania z sieci – reaktor wyłącza się sam'],
  [10, 'Zawory otwierają się bez prądu – woda ze zbiornika spływa po obudowie'],
  [1e9, 'Para w obudowie skrapla się na zimnej stali, ciepło uchodzi z powietrzem kominem – przez 3 doby bez prądu i bez ludzi'],
];

const REFUEL: [number, string][] = [
  [5, 'Reaktor wyłączony, pokrywa zbiornika zdjęta, kanał nad nim zalany wodą'],
  [15, 'Maszyna przeładunkowa wyjmuje kasetę z rdzenia'],
  [30, 'Kaseta jedzie pod wodą tunelem do basenu'],
  [40, 'Kaseta trafia do stojaka w basenie'],
  [1e9, 'Co ok. 18 miesięcy wymienia się ok. jednej trzeciej kaset'],
];
const refuelU = (t: number) => (t < 5 ? 0 : t < 40 ? (t - 5) / 35 : 1);

/* ================= scena ================= */

export function NuclearScene({ params }: SceneProps) {
  const mode = str(params.mode, 'home');
  const cfg = cfgOf(mode);
  const run = Boolean(params.run);
  const rodsP = num(params.rods, mode === 're-fission' ? 45 : 15) / 100;
  const moderated = str(params.mod, 'woda') === 'woda';
  const home = useModuleHome();
  const nav = useTopicNav();
  const paused = useContext(PauseContext);

  const tRun = useRef(-1);
  const st = useRef({ P: 1, rods: 0.15, angle: 0, passive: 0, refuel: 0, h: 9, simT: 0 });
  const chain = useRef<ChainStats>({ neutrons: 0, rate: 0 });
  const [phase, setPhase] = useState('');
  const [live, setLive] = useState({ P: 1, rods: 0.15, n: 0, rate: 0, simT: 0, h: 9 });
  const liveRef = useRef(live);
  useEffect(() => {
    tRun.current = run ? 0 : -1;
  }, [run, mode]);

  useFrame((_, dt0) => {
    const dt = paused ? 0 : Math.min(dt0, 0.05);
    if (tRun.current >= 0) tRun.current += dt;
    const t = tRun.current;
    const S = st.current;
    let rodsT = 0.15;
    let Ptarget = 1;
    let ph = '';
    let list: [number, string][] | null = null;
    S.passive = 0;
    if (mode === 're-rods') {
      rodsT = rodsP;
      // moc ustala się przy położeniu prętów; ujemne sprzężenie temperaturowe stabilizuje reaktor
      Ptarget = clamp(1.05 - 3.4 * (rodsP - 0.15), 0.02, 1.08);
    } else if (mode === 'bz-scram') {
      list = SCRAM;
      if (t >= 0) {
        rodsT = 1;
        S.simT = scramSim(t);
        Ptarget = t < 0.4 ? 1 : decayHeat(S.simT);
      }
    } else if (mode === 'bz-passive') {
      list = PASSIVE;
      if (t >= 0) {
        rodsT = 1;
        Ptarget = decayHeat(Math.max(1, t * 600));
        S.passive = sm(6, 10, t);
      }
    } else if (mode === 'pa-refuel') {
      list = REFUEL;
      rodsT = 1;
      Ptarget = 0;
      S.refuel = t < 0 ? 0 : refuelU(t);
    } else if (mode === 'gr-load') {
      S.h = (S.h + dt * 0.4) % 24;
    }
    if (list) {
      const i = t < 0 ? -1 : list.findIndex(([e]) => t < e);
      ph = i < 0 ? '' : `${i}|${list[i][1]}`;
    }
    S.rods += (rodsT - S.rods) * Math.min(1, dt * (mode === 'bz-scram' || mode === 'bz-passive' ? 2.5 : 1.2));
    // moc: po wyłączeniu spada natychmiast do ciepła rozpadu, przy zmianach prętów – płynnie
    S.P += (Ptarget - S.P) * Math.min(1, dt * (Ptarget < S.P && (mode === 'bz-scram' || mode === 'bz-passive') ? 6 : 0.8));
    S.angle += dt * 1.2 * (mode === 'pa-refuel' ? 0 : 1);
    if (ph !== phase) setPhase(ph);
    const L = liveRef.current;
    if (Math.abs(L.P - S.P) > 0.002 || Math.abs(L.rods - S.rods) > 0.01 || L.n !== chain.current.neutrons || Math.abs(L.simT - S.simT) > 1 || Math.abs(L.h - S.h) > 0.1) {
      const next = { P: S.P, rods: S.rods, n: chain.current.neutrons, rate: chain.current.rate, simT: S.simT, h: S.h };
      liveRef.current = next;
      setLive(next);
    }
  });

  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [mode]);
  const parts = home ? homeParts(mode) : null;
  const links = mode === 'home' && home ? homeLinks() : null;

  const kRate = () => clamp(0.15 + 0.85 * st.current.P, 0.05, 1);
  const pi = Number(phase.split('|')[0] || -1);
  const ptxt = phase.split('|')[1] || '';
  const phaseList = (list: [number, string][]) => (
    <>
      <div style={{ fontWeight: 700, color: PHASE_C }}>{run ? ptxt || 'Start' : 'Naciśnij „Rozpocznij”'}</div>
      {list.map(([, s], i) => (
        <div key={i} style={{ fontSize: 13, opacity: i === pi ? 1 : i < pi ? 0.75 : 0.45, fontWeight: i === pi ? 700 : 400 }}>
          {i < pi ? '✓' : i === pi ? '▸' : '·'} {s}
        </div>
      ))}
    </>
  );
  let info: ReactNode = null;
  if (mode === 're-fission') {
    const state = !moderated ? 'bez wody neutrony nie zwalniają – prawie nie rozszczepiają uranu i reakcja gaśnie' : live.n === 0 ? 'czekamy na neutron ze źródła' : rodsP > 0.62 ? 'reakcja wygasa – pręty pochłaniają za dużo neutronów' : rodsP < 0.28 ? 'reakcja przyspiesza – każde rozszczepienie wywołuje więcej niż jedno następne' : 'reakcja stabilna – każde rozszczepienie wywołuje średnio jedno następne';
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Reakcja łańcuchowa</div>
        {rows([
          ['neutronów na planszy', `${live.n}`],
          ['rozszczepień na sekundę', fmt(live.rate, 1)],
          ['pręty wsunięte', `${fmt(rodsP * 100)}%`],
        ])}
        <div style={{ fontSize: 13, marginTop: 4 }}>{state}</div>
      </>
    );
  } else if (mode === 're-rods') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Pręty sterujące</div>
        {rows([
          ['wsunięcie prętów', `${fmt(rodsP * 100)}%`],
          ['moc cieplna', `${fmt(live.P * UNIT.Pth)} MW`],
          ['moc elektryczna', `${fmt(live.P * UNIT.P)} MW`],
        ])}
      </>
    );
  } else if (mode === 'ob-loop') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Dwa obiegi wody</div>
        {rows([
          ['obieg pierwotny – ciśnienie', '15,5 MPa'],
          ['woda do reaktora', `${UNIT.tCold} °C`],
          ['woda z reaktora', `${UNIT.tHot} °C`],
          ['przepływ', `ok. ${UNIT.flow1} t/s`],
          ['para (obieg wtórny)', `${UNIT.t2} °C, ${fmt(UNIT.p2, 1)} MPa`],
        ])}
      </>
    );
  } else if (mode === 'ob-press') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Dlaczego woda nie wrze</div>
        {rows([
          ['woda wrze przy 1 atmosferze', '100 °C'],
          ['w szybkowarze (ok. 2 atm)', 'ok. 120 °C'],
          ['przy 155 atm (obieg pierwotny)', 'ok. 345 °C'],
          ['najgorętsza woda w obiegu', 'ok. 321 °C'],
        ])}
      </>
    );
  } else if (mode === 'bz-scram') {
    info = (
      <>
        {phaseList(SCRAM)}
        <DecayChart t={run ? live.simT : 0} />
        {rows([
          ['czas od wyłączenia', run ? (live.simT < 120 ? `${fmt(live.simT)} s` : live.simT < 7200 ? `${fmt(live.simT / 60)} min` : `${fmt(live.simT / 3600, 1)} h`) : '–'],
          ['moc cieplna', `${fmt(live.P * UNIT.Pth)} MW (${fmt(live.P * 100, 1)}%)`],
        ])}
      </>
    );
  } else if (mode === 'bz-passive') {
    info = phaseList(PASSIVE);
  } else if (mode === 'pa-refuel') {
    info = phaseList(REFUEL);
  } else if (mode === 'tu-sankey') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Dokąd idzie ciepło z reaktora</div>
        <Sankey />
      </>
    );
  } else if (mode === 'tu-sea') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Woda morska</div>
        {rows([
          ['przepływ', 'ok. 60 m³ na sekundę'],
          ['ujęcie', 'ok. 3 km od brzegu, tunelem pod dnem'],
          ['woda podgrzewa się o', 'ok. 10 °C'],
          ['ciepło oddane morzu', `ok. ${fmt(UNIT.Pth * 0.645)} MW`],
        ])}
      </>
    );
  } else if (mode === 'pa-energy') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Jedna pastylka uranu (ok. 7 g) to tyle energii co</div>
        {rows([
          ['węgiel kamienny', 'ok. 1 t'],
          ['gaz ziemny', 'ok. 480 m³'],
          ['olej opałowy', 'ok. 560 l'],
        ])}
        <div style={{ height: 6 }} />
        {rows([
          ['paliwo bloku na rok', 'ok. 25 t uranu'],
          ['węgiel dla bloku tej mocy', 'ok. 3 mln t na rok'],
        ])}
      </>
    );
  } else if (mode === 'gr-load') {
    const hh = Math.floor(live.h);
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>
          Godzina {hh}:{String(Math.floor((live.h - hh) * 60)).padStart(2, '0')} – blok daje {fmt(UNIT.P)} MW
        </div>
        <BaseChart h={live.h} />
      </>
    );
  } else if (mode === 'bz-dose') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Dawki promieniowania (skala logarytmiczna)</div>
        <DoseBars />
      </>
    );
  } else if (mode === 'gr-poland') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>CO₂ w całym cyklu życia (g na kWh)</div>
        <Co2Bars />
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
  const showInside = cfg.cut;
  return (
    <>
      <Sky weather="day" />
      <Clouds weather="day" />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#e3edf7', '#5a5a40', 0.6]} />
      <directionalLight position={[300, 520, 380]} intensity={1.7} color="#fff6e8" />
      <directionalLight position={[-200, 120, -260]} intensity={0.3} color="#cfe0ff" />

      <Coast />
      <Pines />
      <ReactorBuilding cut={cfg.cut} ghost={mode === 'bz-passive' || mode === 'tour-bz'} />
      {showInside && <PrimaryLoop cut={cfg.cut} headOff={mode === 'pa-refuel'} rods={() => st.current.rods} glow={() => st.current.P} />}
      <AuxBuilding cut={cfg.auxCut} />
      {cfg.auxCut && <PoolGlow />}
      <TurbineHall cut={cfg.thCut} />
      <TurbineSet open={cfg.turbOpen} spin={() => st.current.angle} />
      <Msr />
      {['re-home', 're-rods', 'ob-loop', 'bz-scram'].includes(mode) && <CoreFlow rate={kRate} />}
      {mode === 'pa-refuel' && (
        <>
          {/* zdjęta pokrywa zbiornika odstawiona na pomost i poświata nad paliwem w zalanym kanale */}
          <group position={[9, DECK_Y + 0.2, -9]}>
            <mesh position={[0, 0.3, 0]}>
              <sphereGeometry args={[RPV.r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#6d7782" metalness={0.6} roughness={0.35} />
            </mesh>
            {[-1, -0.4, 0.3, 1].map((x) => (
              <mesh key={x} position={[x, 3.2, x * 0.4]}>
                <cylinderGeometry args={[0.12, 0.12, 4.4, 8]} />
                <meshStandardMaterial color="#2b2f35" />
              </mesh>
            ))}
          </group>
          <Cherenkov at={[0, CORE.y1 + 0.4, -0.9]} size={[3.4, 1.8]} power={() => 1} />
        </>
      )}
      <Grid />
      <CaskPad />
      <Site />
      {cfg.lab && <ChainReaction rods={() => rodsP} stats={chain} moderated={moderated} />}
      {cfg.fuelLab && <FuelExhibit />}
      {cfg.boil && (
        <>
          <SgBoil sg={-1} rate={kRate} />
          <SgBoil sg={1} rate={kRate} />
        </>
      )}
      {(mode === 'bz-passive' || mode === 'tour-bz') && <PassiveCooling on={() => (mode === 'tour-bz' ? 0.6 : st.current.passive)} />}
      {mode === 'pa-refuel' && <RefuelAssembly u={() => st.current.refuel} />}
      {mode === 'pa-refuel' && (
        // kanał nad reaktorem zalany wodą w czasie wymiany paliwa
        <mesh position={[0, (RPV.y1 + 34) / 2, -2]}>
          <boxGeometry args={[8, 34 - RPV.y1, 4]} />
          <meshStandardMaterial color="#2f8fd8" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}

      {/* przepływy */}
      {flows.includes('hot') &&
        [1, -1].map((sg) => <EnergyFlow key={sg} path={hotLeg(sg)} count={40} speed={8} size={0.32} color="#ff4d2e" rate={kRate} />)}
      {flows.includes('cold') &&
        [1, -1].flatMap((sg) => [-1, 1].map((dz) => <EnergyFlow key={`${sg}${dz}`} path={coldLeg(sg, dz)} count={70} speed={8} size={0.28} color="#3b9cff" rate={kRate} />))}
      {flows.includes('steam') && (
        <>
          <EnergyFlow path={P_STEAM} count={90} speed={24} size={0.8} color="#f3f4f6" rate={kRate} />
          <EnergyFlow path={P_STEAM2} count={90} speed={24} size={0.8} color="#f3f4f6" rate={kRate} />
          <EnergyFlow path={P_CROSS} count={50} speed={16} size={1.1} color="#e5e7eb" rate={kRate} />
        </>
      )}
      {flows.includes('feed') && <EnergyFlow path={P_FEED} count={80} speed={14} size={0.6} color="#3b8be0" rate={kRate} />}
      {flows.includes('sea') && (
        <>
          <EnergyFlow path={P_SEA_IN} count={140} speed={40} size={2.4} color="#5fd0ff" rate={kRate} />
          <EnergyFlow path={P_SEA_OUT} count={120} speed={40} size={2.4} color="#ff9e7a" rate={kRate} />
        </>
      )}
      {flows.includes('power') && <EnergyFlow path={P_POWER} count={110} speed={70} size={2.2} color="#ffd34d" rate={kRate} />}

      {/* stałe podpisy */}
      {mode === 'tu-sea' && (
        <>
          <Lbl pos={[INTAKE[0], 8, INTAKE[2]]} sub color="#7dd3fc">
            ujęcie wody
          </Lbl>
          <Lbl pos={[OUTFALL[0], 8, OUTFALL[2]]} sub color="#fdba74">
            zrzut ciepłej wody
          </Lbl>
          <Lbl pos={[PUMP[0], 18, PUMP[2]]} sub>
            pompownia
          </Lbl>
        </>
      )}
      {mode === 'ob-press' && (
        <>
          <Lbl pos={[PZR.x, PZR.y1 - 1.5, PZR.z + 1.6]} sub color="#f1f5f9">
            poduszka pary
          </Lbl>
          <Lbl pos={[PZR.x, PZR.y1 - 0.6, PZR.z + 1.6]} sub color="#7dd3fc">
            natrysk (obniża ciśnienie)
          </Lbl>
          <Lbl pos={[PZR.x, PZR.y0 + 4, PZR.z + 1.6]} sub color="#7dd3fc">
            woda
          </Lbl>
          <Lbl pos={[PZR.x, PZR.y0 + 1.2, PZR.z + 1.6]} sub color="#fca5a5">
            grzałki (podnoszą ciśnienie)
          </Lbl>
        </>
      )}
      {mode === 'ob-sg' && (
        <>
          <Lbl pos={[SG.x, SG.y0 + 6, 1]} sub color="#fdba74">
            rurki U z wodą z reaktora
          </Lbl>
          <Lbl pos={[SG.x, SG.yMid + 2, 1]} sub color="#f1f5f9">
            oddzielacze wilgoci
          </Lbl>
          <Lbl pos={[SG.x, SG.y1 + 1.5, 1]} sub color="#f1f5f9">
            para do turbiny
          </Lbl>
        </>
      )}
      {mode === 'pa-dry' && (
        <Lbl pos={[(CASKS.x0 + CASKS.x1) / 2, 12, CASKS.z1]} sub>
          pojemniki z wypalonym paliwem
        </Lbl>
      )}

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

