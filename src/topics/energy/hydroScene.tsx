/*
 * Elektrownia wodna – wspólna scena 3D wszystkich zakładek tematu. Tryb zakładki (params.mode) decyduje, co
 * widać: cała dolina z zaporą i zbiornikami, przekrój przez zaporę i hydrozespół, hala maszyn, przelew,
 * jaz z przepławką, sieć, powiększenie rodzajów turbin, inne rodzaje zapór. Kulki w ruchu pokazują przepływy:
 * wodę przez turbiny (także w drugą stronę przy pompowaniu), wodę na przelewie, rzekę i prąd.
 */
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { SceneProps } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { useModuleHome, useTopicNav } from '../../lib/topicNav';
import { PauseContext } from '../../lib/useAnimationClock';
import { Lbl } from '../aviation/airliner';
import { Clouds, Sky } from './windWorld';
import { EnergyFlow } from './windExtras';
import {
  BAYS,
  CREST,
  CUT_X,
  DAM,
  FLOOD,
  FLOOD_H,
  GALLERIES,
  GEN,
  HYDRO_SHARE,
  LEVEL,
  PH,
  PL_PLANTS,
  PYLONS,
  P_POWER,
  SPILL,
  SWY,
  TAIL,
  TRAFO_Z,
  TU,
  UNIT,
  UNITS,
  WEIR_Z,
  clamp,
  cz,
  demandAt,
  floodAt,
  inflowPath,
  powerOf,
  pumpModeAt,
  riverPath,
  sm,
  unitPath,
  zFace,
  type V3,
} from './hydroGeo';
import { ArchDam, Dam, Embankment, Forest, HydroUnit, Penstock, Powerhouse, SectionCaps, Switchyard, Terrain, Waters, Weir, damArea, setCut } from './hydroPlant';
import { Fish, GateLab, OutletFoam, PressureArrows, RainCycle, SpillFlow, SpillSheet, TurbineTypes } from './hydroFx';
import { Cars, Lake, Roads, Village } from './hydroWorld';

const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

/* ================= ustawienia trybów ================= */

type FlowKey = 'unit' | 'units' | 'river' | 'power' | 'inflow';
interface Cfg {
  cut: boolean;
  hall: boolean;
  flows: FlowKey[];
  lab: boolean;
  rain: boolean;
  fish: boolean;
  arrows: boolean;
  spill: boolean;
}
const BASE: Cfg = { cut: false, hall: false, flows: ['river'], lab: false, rain: false, fish: false, arrows: false, spill: false };
const CFG: Record<string, Partial<Cfg>> = {
  home: { flows: ['river', 'units'] },
  'tour-za': { cut: true, flows: [] },
  'tour-tu': { cut: true, flows: ['unit'] },
  'tour-en': { flows: ['units', 'river', 'inflow'] },
  'tour-po': { spill: true },
  'tour-pp': { flows: ['units', 'river'] },
  'tour-si': { flows: ['power', 'river'] },
  'za-home': { cut: true, flows: [] },
  'za-push': { cut: true, arrows: true, flows: [] },
  'za-types': { flows: [] },
  'za-lake': { flows: ['inflow', 'units'] },
  'tu-home': { cut: true, flows: ['unit'] },
  'tu-path': { cut: true, flows: ['unit'] },
  'tu-gate': { cut: true, flows: ['unit'] },
  'tu-types': { lab: true, flows: [] },
  'tu-gen': { cut: true, flows: ['unit'] },
  'en-home': { flows: ['units', 'river', 'inflow'] },
  'en-power': { flows: ['units', 'river'] },
  'en-cycle': { rain: true, flows: ['inflow', 'river'] },
  'en-sankey': { hall: true, flows: ['units', 'power'] },
  'po-home': { flows: ['river', 'units'] },
  'po-flood': { spill: true, flows: ['river', 'units', 'inflow'] },
  'po-basin': { spill: true, flows: ['river'] },
  'pp-home': { flows: ['river'] },
  'pp-day': { hall: true, flows: [] },
  'pp-zarn': { flows: ['units'] },
  'si-home': { hall: true, flows: ['power', 'units'] },
  'si-start': { hall: true, flows: [] },
  'si-fish': { fish: true, flows: [] },
  'si-poland': { flows: ['river', 'power'] },
};
const cfgOf = (mode: string): Cfg => ({ ...BASE, ...(CFG[mode] ?? {}) });

/* ================= części do kliknięcia ================= */

interface PartInfo {
  name: string;
  desc: string;
  pos: V3;
  link?: string;
}
const X = CUT_X - 1;

function homeParts(mode: string): Record<string, PartInfo> | null {
  switch (mode) {
    case 'za-home':
      return {
        crest: { name: 'korona zapory', desc: 'Górna krawędź zapory, ok. 82 m nad dnem doliny. Biegnie po niej droga. Korona jest wyżej niż najwyższa woda w zbiorniku, żeby fale nigdy się nie przelewały.', pos: [X, CREST + 4, 5] },
        up: { name: 'ściana od strony wody', desc: 'Prawie pionowa. Cały napór wody działa na tę ścianę – przy dnie woda pcha na każdy metr kwadratowy z siłą ok. 75 t.', pos: [X, 62, -3] },
        down: { name: 'ściana od strony doliny', desc: 'Pochyła – zapora jest szeroka u dołu (ok. 66 m) i wąska u góry (10 m). Taki kształt trójkąta daje dużo betonu tam, gdzie woda pcha najmocniej.', pos: [X, 36, zFace(36) + 4] },
        gal: { name: 'galerie kontrolne', desc: 'Korytarze wewnątrz zapory. Chodzą nimi ludzie, którzy sprawdzają beton, mierzą przesunięcia i odprowadzają wodę, która przesiąka przez szczeliny.', pos: [X, GALLERIES[0][1] + 1.5, GALLERIES[0][0] + 9] },
        curtain: { name: 'uszczelnienie podłoża', desc: 'Pod zaporą wierci się w skale rząd głębokich otworów i wtłacza w nie zaczyn cementowy. Powstaje szczelna „kurtyna”, która nie pozwala wodzie przeciekać pod zaporą.', pos: [X, -14, 6] },
        intake: { name: 'wlot z kratami', desc: 'Woda wpływa do rurociągu przez kraty, które zatrzymują gałęzie i śmieci. Nad wlotem jest szczelina, w którą można opuścić stalowe zamknięcie i odciąć wodę.', pos: [X, 52, -10] },
        rock: { name: 'skała', desc: 'Zapora ciężka musi stać na mocnej skale. Przed budową zdejmuje się słabą, spękaną warstwę i zaporę wbudowuje się kilka metrów w litą skałę.', pos: [X, -30, 40] },
      };
    case 'tu-home':
      return {
        pen: { name: 'rurociąg', desc: 'Stalowa rura o średnicy ok. 5 m biegnie przez zaporę od wlotu do turbiny. Na dole woda ma ciśnienie ok. 7 atmosfer i płynie z prędkością ok. 4 m/s.', pos: [X, 7.5, 52] },
        spiral: { name: 'spirala', desc: 'Rura zwinięta jak ślimak dookoła turbiny, coraz węższa. Dzięki temu woda wpływa do turbiny równo ze wszystkich stron.', pos: [X, TU.y + 3.4, TU.z - 7] },
        vanes: { name: 'kierownica', desc: 'Pierścień 20 ruchomych łopatek. Obracając się, otwierają albo zamykają drogę wody do wirnika – tak reguluje się moc turbiny.', pos: [X, TU.y + 1.3, TU.z + 4.6] },
        runner: { name: 'wirnik Francisa', desc: 'Woda wpływa do wirnika z boku, oddaje mu energię na zakrzywionych łopatkach i wypływa w dół. Wirnik waży kilkadziesiąt ton i obraca się 250 razy na minutę.', pos: [X, TU.y - 1.2, TU.z] },
        draft: { name: 'rura ssawna', desc: 'Rozszerzająca się rura pod wirnikiem. Woda zwalnia w niej i dzięki temu turbina wyciąga z niej jeszcze trochę energii. Wylot jest pod wodą zbiornika dolnego.', pos: [X, -9, 100] },
        servo: { name: 'serwomotory', desc: 'Dwa siłowniki hydrauliczne na pokrywie turbiny. Obracają pierścień regulacyjny, a ten przez dźwignie przekręca naraz wszystkie 20 łopatek kierownicy.', pos: [X, 2.6, TU.z + 3.6] },
        thrust: { name: 'łożysko oporowe', desc: 'Na nim wisi cały wirujący zespół: wirnik generatora, wał i wirnik turbiny – razem kilkaset ton. Ślizga się na cienkiej warstwie oleju.', pos: [X, 16.4, TU.z + 3.2] },
        shaft: { name: 'wał', desc: 'Pionowy stalowy wał łączy wirnik turbiny z wirnikiem generatora. Cały zespół wiruje razem.', pos: [X, 5, TU.z + 1] },
        gen: { name: 'generator', desc: 'Nad turbiną, na podłodze hali. Wirujące elektromagnesy (bieguny) wytwarzają prąd w uzwojeniu nieruchomego stojana – ok. 50 MW.', pos: [X, GEN.y1 + 2, TU.z - 6] },
        crane: { name: 'suwnica', desc: 'Dźwig pod dachem hali. Przy remoncie wyjmuje nim się wirnik generatora i turbiny – najcięższe części ważą kilkaset ton.', pos: [-11, PH.roof - 1, 70] },
      };
    case 'en-home':
      return {
        lake: { name: 'zbiornik', desc: 'Woda stoi wysoko nad doliną. Ma energię położenia – tak jak kamień trzymany nad ziemią. Im wyżej i im więcej wody, tym więcej energii.', pos: [-60, LEVEL + 8, -260] },
        head: { name: 'spad', desc: 'Różnica wysokości między wodą w zbiorniku a wodą pod elektrownią. Tutaj ok. 70 m. To on decyduje, z jaką siłą woda napiera na turbinę.', pos: [-90, 40, 70] },
        flow: { name: 'przepływ', desc: 'Ile wody przepływa przez turbiny w każdej sekundzie. Przy pełnej mocy cztery turbiny biorą ok. 320 m³ wody na sekundę – mniej więcej tyle, ile mieści mały basen pływacki.', pos: [UNITS[1], 30, 140] },
        units: { name: 'hydrozespoły', desc: 'Cztery turbiny z generatorami. Zamieniają energię spadającej wody na prąd z bardzo dużą sprawnością – ok. 90%.', pos: [-30, PH.roof + 6, 80] },
        river: { name: 'rzeka', desc: 'Woda, która przepłynęła przez turbiny, wraca do rzeki. Nic jej nie ubywa i nie jest brudniejsza – oddała tylko energię.', pos: [cz(400), 12, 400] },
      };
    case 'po-home':
      return {
        gates: { name: 'zamknięcia segmentowe', desc: 'Trzy stalowe zamknięcia w kształcie wycinka walca. Obracają się wokół czopów w filarach i unoszą do góry, wypuszczając wodę spod spodu.', pos: [(SPILL.x0 + SPILL.x1) / 2, CREST + 6, 4] },
        spill: { name: 'przelew', desc: 'Obniżona część korony. Gdy wody jest za dużo, zbędna woda płynie tędy po ścianie zapory, omijając turbiny. Przelew musi przepuścić nawet największą powódź, jaka może się zdarzyć raz na 1000 lat.', pos: [SPILL.x1 + 6, 50, 26] },
        basin: { name: 'niecka wypadowa', desc: 'Betonowe koryto u stopy zapory. Woda spadająca z ponad 70 m mogłaby wyżłobić dół w dnie rzeki i podmyć zaporę – w niecce kłębi się i traci energię.', pos: [(SPILL.x0 + SPILL.x1) / 2, 14, 92] },
        bridge: { name: 'most i sterownia', desc: 'Droga po koronie prowadzi mostem nad przelewem. W budynku sterowni są napędy hydrauliczne zamknięć – można je też otworzyć ręcznie, bez prądu.', pos: [82, CREST + 12, 5] },
        tail: { name: 'zbiornik dolny', desc: 'Za zaporą woda wpada do mniejszego zbiornika, zamkniętego jazem. Wyrównuje on przepływ rzeki – poniżej płynie ona równo, choć elektrownia raz pracuje pełną mocą, a raz stoi.', pos: [cz(450), 12, 450] },
      };
    case 'pp-home':
      return {
        upper: { name: 'zbiornik górny', desc: 'Duże jezioro za zaporą. W elektrowni szczytowo-pompowej to magazyn energii: pełny zbiornik to naładowana bateria.', pos: [-40, LEVEL + 10, -300] },
        lower: { name: 'zbiornik dolny', desc: 'Mniejszy zbiornik poniżej elektrowni. Stąd w nocy pompy biorą wodę z powrotem w górę.', pos: [cz(500), 14, 500] },
        weir: { name: 'jaz', desc: 'Niska zapora z przelewem, która zamyka zbiornik dolny. Dzięki niej woda wypuszczana z elektrowni nie odpływa od razu rzeką.', pos: [cz(WEIR_Z), 16, WEIR_Z] },
        units: { name: 'hydrozespoły odwracalne', desc: 'Ta sama maszyna jest raz turbiną z generatorem, a raz pompą z silnikiem – zależy, w którą stronę się kręci. W Solinie dwa z czterech hydrozespołów są odwracalne.', pos: [-30, PH.roof + 6, 80] },
      };
    case 'si-home':
      return {
        gen: { name: 'generatory', desc: 'Cztery generatory po ok. 50 MW. Wytwarzają prąd o napięciu ok. 15 kV i częstotliwości 50 Hz.', pos: [UNITS[2], GEN.y1 + 4, TU.z] },
        trafo: { name: 'transformatory', desc: 'Na pomoście za halą. Każdy podnosi napięcie z generatora do 220 kV – przy wyższym napięciu mniej energii ginie po drodze w przewodach.', pos: [UNITS[0], 18, TRAFO_Z + 2] },
        yard: { name: 'rozdzielnia', desc: 'Na terasie nad rzeką. Łączy elektrownię z liniami i pozwala ją odłączyć na czas remontu.', pos: [(SWY.x0 + SWY.x1) / 2, SWY.y + 26, (SWY.z0 + SWY.z1) / 2] },
        line: { name: 'linia 220 kV', desc: 'Prąd płynie z gór do sieci w całym kraju. Elektrownie wodne są w Polsce przede wszystkim „szybką rezerwą” – ruszają, gdy sieć potrzebuje mocy natychmiast.', pos: [PYLONS[2][0], PYLONS[2][1] + 44, PYLONS[2][2]] },
        ctrl: { name: 'sterownia', desc: 'Stąd steruje się hydrozespołami. Często elektrownią kieruje się zdalnie – z centrum dyspozytorskiego setki kilometrów dalej.', pos: [PH.x1 - 5, PH.floor + 12, 78] },
      };
  }
  return null;
}

function homeLinks(): Record<string, PartInfo> {
  return {
    za: { name: 'zapora', desc: '', pos: [-160, CREST + 22, 10], link: 'zapora' },
    tu: { name: 'turbina i generator', desc: '', pos: [-34, PH.roof + 20, 100], link: 'turbina' },
    en: { name: 'energia wody', desc: '', pos: [-120, LEVEL + 26, -340], link: 'energia' },
    po: { name: 'przelew i powódź', desc: '', pos: [(SPILL.x0 + SPILL.x1) / 2 + 20, CREST + 26, 30], link: 'powodz' },
    pp: { name: 'elektrownia szczytowo-pompowa', desc: '', pos: [cz(330) + 10, 26, 330], link: 'pompowa' },
    si: { name: 'rzeka i sieć', desc: '', pos: [(SWY.x0 + SWY.x1) / 2, SWY.y + 34, (SWY.z0 + SWY.z1) / 2], link: 'siec' },
  };
}

/* ================= wykresy i ramki ================= */

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

/** Bilans energii: energia spadającej wody → prąd i straty. */
function Sankey() {
  const parts: [string, number, string][] = [
    ['prąd do sieci', 89, '#facc15'],
    ['tarcie w rurociągu i kratach', 3, '#7fd0ff'],
    ['straty w turbinie', 6, '#38bdf8'],
    ['generator i transformator', 2, '#fb923c'],
  ];
  const W = 300;
  const H = 176;
  const x0 = 40;
  const x1 = 150;
  const top = 8;
  const scale = (H - 40) / 100;
  let yL = top;
  let yR = top;
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <rect x={10} y={top} width={30} height={100 * scale} fill="#0ea5e9" />
      <text x={25} y={top + 50 * scale} fill="#fff" fontSize={10} textAnchor="middle" transform={`rotate(-90 25 ${top + 50 * scale})`}>
        energia wody
      </text>
      {parts.map(([name, v, col], i) => {
        const h = v * scale;
        const yl = yL;
        const yr = yR + i * 14;
        yL += h;
        yR += h;
        const d = `M${x0},${yl} C${(x0 + x1) / 2},${yl} ${(x0 + x1) / 2},${yr} ${x1},${yr} L${x1},${yr + h} C${(x0 + x1) / 2},${yr + h} ${(x0 + x1) / 2},${yl + h} ${x0},${yl + h} Z`;
        return (
          <g key={name}>
            <path d={d} fill={col} opacity={0.75} />
            <text x={x1 + 6} y={yr + Math.max(h, 8) / 2 + 4} fill={col} fontSize={10.5}>
              {name} – {v}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Wezbranie: dopływ i odpływ ze zbiornika w czasie; znacznik – chwila scenariusza. */
function FloodChart({ h }: { h: number }) {
  const W = 300;
  const H = 130;
  const x = (t: number) => 30 + (t / FLOOD_H) * (W - 40);
  const y = (q: number) => H - 20 - (q / 2600) * (H - 34);
  const line = (k: 'qin' | 'qout') => FLOOD.filter((_, i) => i % 5 === 0).map((p, i) => `${i ? 'L' : 'M'}${x(p.h).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {[0, 12, 24, 36, 48, 60].map((t) => (
        <text key={t} x={x(t)} y={H - 6} fill="#cbd5e1" fontSize={10} textAnchor="middle">
          {t} h
        </text>
      ))}
      {[0, 1000, 2000].map((q) => (
        <text key={q} x={26} y={y(q) + 4} fill="#cbd5e1" fontSize={9} textAnchor="end">
          {q}
        </text>
      ))}
      <path d={line('qin')} stroke="#fb7185" strokeWidth={2.2} fill="none" />
      <path d={line('qout')} stroke="#38bdf8" strokeWidth={2.2} fill="none" />
      {h >= 0 && <line x1={x(h)} x2={x(h)} y1={y(0)} y2={y(2600)} stroke="#fde047" strokeWidth={1.5} />}
      <text x={40} y={14} fill="#fb7185" fontSize={10}>
        dopływ rzeki (m³/s)
      </text>
      <text x={168} y={14} fill="#38bdf8" fontSize={10}>
        odpływ z zapory
      </text>
    </svg>
  );
}

/** Doba elektrowni szczytowo-pompowej: zapotrzebowanie i praca hydrozespołów (pompowanie / turbiny). */
function PumpChart({ h }: { h: number }) {
  const W = 300;
  const H = 140;
  const x = (t: number) => 28 + (t / 24) * (W - 40);
  const y = (v: number) => H - 22 - v * (H - 44);
  const mid = y(0.35);
  const demand = Array.from({ length: 97 }, (_, i) => i / 4)
    .map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(demandAt(t)).toFixed(1)}`)
    .join(' ');
  const bars = Array.from({ length: 48 }, (_, i) => i / 2 + 0.25);
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {[0, 6, 12, 18, 24].map((t) => (
        <text key={t} x={x(t)} y={H - 6} fill="#cbd5e1" fontSize={10} textAnchor="middle">
          {t}:00
        </text>
      ))}
      <line x1={x(0)} x2={x(24)} y1={mid} y2={mid} stroke="#ffffff33" />
      {bars.map((t) => {
        const m = pumpModeAt(t);
        if (!m) return null;
        const hh = Math.abs(m) * 26;
        return <rect key={t} x={x(t - 0.25) + 0.5} width={x(0.5) - x(0) - 1} y={m > 0 ? mid - hh : mid} height={hh} fill={m > 0 ? '#facc15' : '#38bdf8'} opacity={0.8} />;
      })}
      <path d={demand} stroke="#e2e8f0" strokeWidth={2} fill="none" />
      <line x1={x(h)} x2={x(h)} y1={y(0)} y2={y(1)} stroke="#fde047" strokeWidth={1.5} />
      <text x={30} y={12} fill="#e2e8f0" fontSize={10}>
        zapotrzebowanie
      </text>
      <text x={124} y={12} fill="#facc15" fontSize={10}>
        prąd do sieci
      </text>
      <text x={204} y={12} fill="#38bdf8" fontSize={10}>
        pompowanie
      </text>
    </svg>
  );
}

/** Rozruch hydrozespołu: moc w czasie (wykres) z bieżącym punktem. */
function StartChart({ t }: { t: number }) {
  const W = 300;
  const H = 120;
  const x = (s: number) => 30 + (s / 36) * (W - 40);
  const y = (p: number) => H - 20 - p * (H - 34);
  const pts = Array.from({ length: 73 }, (_, i) => i / 2);
  const d = pts.map((s, i) => `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(startPower(s)).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {[0, 30, 60, 90, 120].map((s) => (
        <text key={s} x={x((s / 120) * 36)} y={H - 6} fill="#cbd5e1" fontSize={10} textAnchor="middle">
          {s} s
        </text>
      ))}
      {[0, 50, 100].map((p) => (
        <text key={p} x={26} y={y(p / 100) + 4} fill="#cbd5e1" fontSize={9} textAnchor="end">
          {p}%
        </text>
      ))}
      <path d={d} stroke="#facc15" strokeWidth={2.4} fill="none" />
      {t >= 0 && <circle cx={x(Math.min(36, t))} cy={y(startPower(t))} r={4} fill="#fde047" />}
    </svg>
  );
}

/** Słupki: udział energii z wody w produkcji prądu (%) albo moc elektrowni (MW). */
function Bars({ data, max, unit }: { data: [string, number, string][]; max: number; unit: string }) {
  const W = 300;
  const rowH = 22;
  return (
    <svg width={W} height={data.length * rowH + 8} style={{ display: 'block' }}>
      {data.map(([name, v, col], i) => (
        <g key={name} transform={`translate(0 ${i * rowH + 4})`}>
          <text x={134} y={14} fill="#e2e8f0" fontSize={10.5} textAnchor="end">
            {name}
          </text>
          <rect x={140} y={3} width={Math.max(2, (v / max) * 110)} height={14} fill={col} />
          <text x={146 + Math.max(2, (v / max) * 110)} y={14} fill={col} fontSize={10.5}>
            {fmt(v)} {unit}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ================= scenariusze ================= */

const FLOOD_PH: [number, string][] = [
  [3, 'Przed sezonem powodzi poziom w zbiorniku obniżono – jest miejsce na wodę'],
  [12, 'Ulewa w górach: rzeka niesie coraz więcej wody, zbiornik się napełnia'],
  [24, 'Woda przekracza poziom normalny – zamknięcia przelewu powoli się podnoszą'],
  [36, 'Szczyt fali: do zbiornika wpływa ok. 2400 m³/s, wypływa tylko ok. 1350 m³/s'],
  [1e9, 'Fala mija – zbiornik oddaje nadmiar wody powoli, zamknięcia się opuszczają'],
];
/** Czas scenariusza (s) → godzina wezbrania. */
const floodHour = (t: number) => clamp((t / 48) * FLOOD_H, 0, FLOOD_H);

const START_PH: [number, string][] = [
  [3, 'Hydrozespół stoi – kierownica zamknięta'],
  [10, 'Polecenie z dyspozycji: kierownica uchyla się, wirnik nabiera obrotów'],
  [14, 'Obroty 250 na minutę – generator dopasowuje się do sieci i łączy z nią'],
  [26, 'Kierownica otwiera się szerzej – moc rośnie do pełnych 50 MW'],
  [1e9, 'Pełna moc w ok. 2 minuty od polecenia – elektrownia węglowa potrzebuje kilku godzin'],
];
/** Moc (0…1) w czasie scenariusza rozruchu (s). */
function startPower(t: number) {
  if (t < 14) return 0;
  return sm(14, 26, t);
}
const startSpeed = (t: number) => (t < 3 ? 0 : t < 14 ? sm(3, 12, t) : 1);
const startGate = (t: number) => (t < 3 ? 0 : t < 14 ? 0.12 * sm(3, 6, t) : 0.12 + 0.88 * sm(14, 26, t));

/* ================= scena ================= */

export function HydroScene({ params }: SceneProps) {
  const mode = str(params.mode, 'home');
  const cfg = cfgOf(mode);
  const run = Boolean(params.run);
  const lvlP = num(params.level, LEVEL);
  const flowP = num(params.flow, 320);
  const gateP = num(params.gate, 100) / 100;
  const spillP = num(params.spill, 60) / 100;
  const kind = str(params.kind, 'ciezka');
  const home = useModuleHome();
  const nav = useTopicNav();
  const paused = useContext(PauseContext);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  const cut = cfg.cut || (mode === 'za-types' && kind !== 'lukowa');
  setCut(cut);
  useEffect(() => () => setCut(false), []);

  const tRun = useRef(-1);
  const st = useRef({ level: LEVEL, gate: 0, vanes: 1, angle: 0, speed: 1, P: 1, pump: 1, h: 6, flood: 0, start: 0 });
  const [phase, setPhase] = useState('');
  const [live, setLive] = useState({ level: LEVEL, P: 1, h: 6, flood: 0, start: -1, pump: 1, gate: 0 });
  const liveRef = useRef(live);
  useEffect(() => {
    tRun.current = run ? 0 : -1;
  }, [run, mode]);

  useFrame((_, dt0) => {
    const dt = paused ? 0 : Math.min(dt0, 0.05);
    if (tRun.current >= 0) tRun.current += dt;
    const t = tRun.current;
    const S = st.current;
    let levelT = LEVEL;
    let gateT = 0;
    let vanesT = 1;
    let speedT = 1;
    let pumpT = 1;
    let ph = '';
    let list: [number, string][] | null = null;
    if (mode === 'za-push') levelT = lvlP;
    else if (mode === 'en-power') {
      levelT = lvlP;
      vanesT = flowP / (UNIT.n * UNIT.Q1);
    } else if (mode === 'tu-gate') vanesT = gateP;
    else if (mode === 'po-basin') gateT = spillP;
    else if (mode === 'tour-po') gateT = 0.45;
    else if (mode === 'po-flood') {
      list = FLOOD_PH;
      const f = floodAt(t < 0 ? 0 : floodHour(t));
      levelT = f.level;
      gateT = f.gate;
      S.flood = t < 0 ? 0 : floodHour(t);
    } else if (mode === 'si-start' || mode === 'tour-si' || mode === 'si-home') {
      if (mode === 'si-start') {
        list = START_PH;
        const tt = t < 0 ? 0 : t;
        vanesT = startGate(tt);
        speedT = startSpeed(tt);
        S.start = t;
      }
    } else if (mode === 'pp-day') {
      if (t >= 0) S.h = (6 + t * 0.5) % 24;
      else S.h = 6;
      pumpT = pumpModeAt(S.h);
      speedT = Math.abs(pumpT) > 0 ? 1 : 0;
      vanesT = Math.abs(pumpT);
      levelT = LEVEL - 0.6 + 0.6 * Math.cos(((S.h - 7) / 24) * Math.PI * 2);
    } else if (mode === 'za-lake' || mode === 'en-home' || mode === 'home') vanesT = 0.8;
    if (list) {
      const i = t < 0 ? -1 : list.findIndex(([e]) => t < e);
      ph = i < 0 ? '' : `${i}|${list[i][1]}`;
    }
    const k = Math.min(1, dt * 1.5);
    S.level += (levelT - S.level) * (mode === 'po-flood' ? 1 : k);
    S.gate += (gateT - S.gate) * k;
    S.vanes += (vanesT - S.vanes) * k;
    S.speed += (speedT - S.speed) * k;
    S.pump += (pumpT - S.pump) * k;
    S.P = mode === 'si-start' ? startPower(Math.max(0, t)) : S.vanes * S.speed;
    // obroty: przy pompowaniu wirnik kręci się w drugą stronę
    S.angle += dt * 2.2 * S.speed * (mode === 'pp-day' ? Math.sign(S.pump || 1) : 1);
    if (ph !== phase) setPhase(ph);
    const L = liveRef.current;
    if (Math.abs(L.level - S.level) > 0.02 || Math.abs(L.P - S.P) > 0.005 || Math.abs(L.h - S.h) > 0.1 || Math.abs(L.flood - S.flood) > 0.2 || Math.abs(L.start - S.start) > 0.25 || Math.abs(L.pump - S.pump) > 0.02 || Math.abs(L.gate - S.gate) > 0.01) {
      const next = { level: S.level, P: S.P, h: S.h, flood: S.flood, start: S.start, pump: S.pump, gate: S.gate };
      liveRef.current = next;
      setLive(next);
    }
  });

  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [mode]);
  const parts = home ? homeParts(mode) : null;
  const links = mode === 'home' && home ? homeLinks() : null;

  const level = () => st.current.level;
  const vanes = () => st.current.vanes;
  const spin = () => st.current.angle;
  const flowRate = () => clamp(st.current.vanes * Math.max(0.05, st.current.speed), 0, 1.2);
  const fwd = () => (mode === 'pp-day' ? Math.max(0, st.current.pump) : flowRate());
  const back = () => (mode === 'pp-day' ? Math.max(0, -st.current.pump) : 0);

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

  const head = live.level - TAIL;
  let info: ReactNode = null;
  if (mode === 'za-push') {
    const h = lvlP;
    const pBottom = (1000 * 9.81 * h) / 1000;
    const force = (1000 * 9.81 * h * h) / 2 / 9810;
    const weight = (damArea() * 2.4 * 1000) / 1000;
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Napór wody na zaporę</div>
        {rows([
          ['głębokość wody przy zaporze', `${fmt(h)} m`],
          ['ciśnienie przy dnie', `${fmt(pBottom)} kPa (ok. ${fmt(pBottom / 101, 1)} atm)`],
          ['woda pcha na 1 m zapory', `ok. ${fmt(Math.round(force / 100) * 100)} t`],
          ['1 m zapory waży', `ok. ${fmt(Math.round(weight / 100) * 100)} t`],
        ])}
        <div style={{ fontSize: 13, marginTop: 4 }}>Dwa razy głębsza woda pcha cztery razy mocniej – siła rośnie z kwadratem głębokości.</div>
      </>
    );
  } else if (mode === 'za-types') {
    const d: Record<string, [string, string][]> = {
      ciezka: [
        ['trzyma się dzięki', 'własnemu ciężarowi'],
        ['materiał', 'beton, ok. 2 mln m³'],
        ['gdzie się buduje', 'na mocnej skale, w różnych dolinach'],
        ['przykład', 'Solina (82 m)'],
      ],
      lukowa: [
        ['trzyma się dzięki', 'zboczom doliny – łuk przenosi na nie napór'],
        ['materiał', 'beton, kilka razy mniej niż w ciężkiej'],
        ['gdzie się buduje', 'w wąskich, skalistych wąwozach'],
        ['przykład', 'Hoover (USA, 221 m), Kölnbrein (Austria)'],
      ],
      ziemna: [
        ['trzyma się dzięki', 'szerokiemu nasypowi z ziemi i kamieni'],
        ['szczelność', 'rdzeń z gliny w środku'],
        ['gdzie się buduje', 'w szerokich dolinach na słabszym gruncie'],
        ['przykład', 'Czorsztyn (Niedzica), Jeziorsko'],
      ],
    };
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>{kind === 'ciezka' ? 'Zapora ciężka' : kind === 'lukowa' ? 'Zapora łukowa' : 'Zapora ziemna'}</div>
        {rows(d[kind] ?? d.ciezka)}
      </>
    );
  } else if (mode === 'za-lake') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Zbiornik</div>
        {rows([
          ['powierzchnia', `ok. ${UNIT.area} km² (jak 3000 boisk)`],
          ['pojemność', `ok. ${UNIT.volume} mln m³`],
          ['długość', 'ok. 25 km (z zatokami)'],
          ['największa głębokość', 'ok. 60 m'],
        ])}
      </>
    );
  } else if (mode === 'tu-gate') {
    const q = UNIT.Q1 * gateP;
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Kierownica</div>
        {rows([
          ['otwarcie łopatek', `${fmt(gateP * 100)}%`],
          ['przepływ przez turbinę', `${fmt(q)} m³/s`],
          ['moc', `${fmt(powerOf(LEVEL - TAIL, q) * (gateP < 0.15 ? gateP / 0.15 : 1), 1)} MW`],
          ['obroty', `${UNIT.rpm} na minutę (stałe)`],
        ])}
        <div style={{ fontSize: 13, marginTop: 4 }}>Obroty się nie zmieniają – generator musi dawać prąd o częstotliwości 50 Hz. Zmienia się siła, z jaką woda pcha wirnik.</div>
      </>
    );
  } else if (mode === 'tu-types') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Którą turbinę wybrać</div>
        {rows([
          ['duży spad, mało wody', 'Pelton (strumień z dyszy)'],
          ['średni spad', 'Francis (jak tutaj)'],
          ['mały spad, dużo wody', 'Kaplan (śmigło)'],
        ])}
      </>
    );
  } else if (mode === 'tu-gen') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Generator</div>
        {rows([
          ['obroty', `${UNIT.rpm} na minutę`],
          ['bieguny wirnika', `${UNIT.poles}`],
          ['częstotliwość', `${UNIT.rpm} × ${UNIT.poles} ÷ 120 = 50 Hz`],
          ['generator w elektrowni węglowej', '3000 obr/min, 2 bieguny'],
        ])}
      </>
    );
  } else if (mode === 'en-power') {
    const q = flowP;
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Moc = ciężar wody × spad × sprawność</div>
        {rows([
          ['spad', `${fmt(lvlP - TAIL)} m`],
          ['przepływ', `${fmt(q)} m³/s (${fmt(q)} t wody na sekundę)`],
          ['sprawność', `${fmt(UNIT.eta * 100)}%`],
          ['moc', `${fmt(powerOf(lvlP - TAIL, q), 1)} MW`],
        ])}
        <div style={{ fontSize: 13, marginTop: 4 }}>P = 1000 kg/m³ × 9,81 m/s² × {fmt(q)} m³/s × {fmt(lvlP - TAIL)} m × {fmt(UNIT.eta, 2)}</div>
      </>
    );
  } else if (mode === 'en-cycle') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Woda krąży dzięki Słońcu</div>
        {rows([
          ['1 m³ wody spadający z 70 m', 'ok. 0,17 kWh prądu'],
          ['to wystarczy, żeby', 'zagotować ok. 1,5 l wody w czajniku'],
          ['średni dopływ rzeki', 'ok. 20 m³/s'],
          ['w czasie powodzi', 'nawet ponad 2000 m³/s'],
        ])}
      </>
    );
  } else if (mode === 'en-sankey') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Dokąd idzie energia wody</div>
        <Sankey />
      </>
    );
  } else if (mode === 'po-flood') {
    const f = floodAt(live.flood);
    info = (
      <>
        {phaseList(FLOOD_PH)}
        <FloodChart h={run ? live.flood : -1} />
        {rows([
          ['godzina wezbrania', run ? `${fmt(live.flood)} h` : '–'],
          ['poziom wody w zbiorniku', `${fmt(live.level - LEVEL, 2)} m względem normalnego`],
          ['dopływ / odpływ', `${fmt(f.qin)} / ${fmt(f.qout)} m³/s`],
          ['otwarcie przelewu', `${fmt(live.gate * 100)}%`],
        ])}
      </>
    );
  } else if (mode === 'po-basin') {
    const q = spillP * 1400;
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Przelew</div>
        {rows([
          ['otwarcie zamknięć', `${fmt(spillP * 100)}%`],
          ['przepływ przez przelew', `ok. ${fmt(Math.round(q / 10) * 10)} m³/s`],
          ['prędkość wody u stopy', 'ok. 30 m/s (ponad 100 km/h)'],
          ['moc, którą niecka musi wytracić', `ok. ${fmt(Math.round((1000 * 9.81 * q * (SPILL.crest - TAIL)) / 1e7) * 10)} MW`],
        ])}
      </>
    );
  } else if (mode === 'pp-day') {
    const hh = Math.floor(live.h);
    const m = pumpModeAt(live.h);
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>
          Godzina {hh}:{String(Math.floor((live.h - hh) * 60)).padStart(2, '0')} – {m > 0 ? 'praca turbinowa: prąd do sieci' : m < 0 ? 'pompowanie: woda w górę' : 'postój'}
        </div>
        <PumpChart h={live.h} />
        {!run && <div style={{ fontSize: 13 }}>Naciśnij „Rozpocznij”, żeby przewinąć dobę.</div>}
      </>
    );
  } else if (mode === 'pp-zarn') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Elektrownia Żarnowiec</div>
        {rows([
          ['moc', 'ok. 716 MW (4 hydrozespoły)'],
          ['spad', 'ok. 115 m'],
          ['zbiornik górny', 'sztuczny, na wzgórzu, ok. 13 mln m³'],
          ['zbiornik dolny', 'Jezioro Żarnowieckie'],
          ['energia w pełnym zbiorniku', 'ok. 3,6 GWh – 5 godzin pełnej mocy'],
          ['sprawność cyklu', 'ok. 75%'],
        ])}
      </>
    );
  } else if (mode === 'si-start') {
    info = (
      <>
        {phaseList(START_PH)}
        <StartChart t={run ? live.start : -1} />
        {rows([['moc hydrozespołu', `${fmt(live.P * UNIT.P1, 1)} MW`]])}
      </>
    );
  } else if (mode === 'si-fish') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Przepławka</div>
        {rows([
          ['baseny', '9, każdy o ok. 0,5 m wyżej'],
          ['przez kogo używana', 'pstrągi, lipienie, brzany, łososie'],
          ['dlaczego ważna', 'ryby płyną w górę rzeki na tarło'],
        ])}
      </>
    );
  } else if (mode === 'si-poland') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Udział energii z wody w produkcji prądu</div>
        <Bars data={HYDRO_SHARE} max={90} unit="%" />
        <div style={{ height: 6 }} />
        <div style={{ fontWeight: 700, color: PART_C }}>Największe elektrownie wodne w Polsce</div>
        <Bars data={PL_PLANTS} max={716} unit="MW" />
      </>
    );
  } else if (mode === 'tu-path') {
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Droga wody przez hydrozespół</div>
        {rows([
          ['spad', `ok. ${fmt(head)} m`],
          ['ciśnienie przy turbinie', 'ok. 7 atm'],
          ['woda w rurociągu', 'ok. 4 m/s'],
          ['woda w wirniku', 'ok. 30 m/s'],
          ['woda na wylocie rury ssawnej', 'ok. 2 m/s'],
        ])}
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

  const altDam = mode === 'za-types' && kind !== 'ciezka';
  const flows = cfg.flows;
  const showUnits = !altDam;
  return (
    <>
      <Sky weather="day" />
      <Clouds weather={cfg.rain ? 'storm' : 'day'} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#e3edf7', '#5a5a40', 0.6]} />
      <directionalLight position={[300, 520, 380]} intensity={1.7} color="#fff6e8" />
      <directionalLight position={[-260, 160, 300]} intensity={0.35} color="#cfe0ff" />

      <Terrain />
      <Forest />
      <Waters level={level} noPlant={altDam} />
      {!altDam && <Dam gate={() => st.current.gate} />}
      {mode === 'za-types' && kind === 'lukowa' && <ArchDam />}
      {mode === 'za-types' && kind === 'ziemna' && <Embankment />}
      {showUnits && <Powerhouse open={cfg.hall} cut={cut} />}
      {showUnits &&
        UNITS.map((u, i) => <HydroUnit key={u} u={u} spin={spin} open={vanes} detail={i === 2 && cut} />)}
      {cut && !altDam && <Penstock u={CUT_X} />}
      {cut && <SectionCaps level={level} kind={kind === 'ziemna' && mode === 'za-types' ? 'ziemna' : 'ciezka'} />}
      <Switchyard />
      <Weir />
      {cfg.spill && <SpillFlow open={() => st.current.gate} level={level} />}
      {!altDam && <SpillSheet open={() => st.current.gate} />}
      {showUnits && <OutletFoam units={UNITS} rate={() => (mode === 'pp-day' ? Math.max(0, st.current.pump) : st.current.vanes * st.current.speed)} />}
      <Roads />
      <Village />
      <Cars />
      <Lake level={level} />
      {cfg.rain && <RainCycle on={() => 1} />}
      {cfg.arrows && <PressureArrows level={level} />}
      {cfg.lab && <TurbineTypes spin={spin} />}
      {mode === 'tu-gate' && <GateLab open={vanes} spin={spin} />}
      {cfg.fish && <Fish />}

      {/* przepływy */}
      {flows.includes('unit') && <EnergyFlow path={unitPath(CUT_X, -1.2)} count={260} speed={14} size={0.36} color="#5fb4ff" rate={flowRate} />}
      {(flows.includes('units') || mode === 'pp-day') &&
        UNITS.map((u) => (
          <group key={u}>
            <EnergyFlow path={unitPath(u)} count={90} speed={16} size={0.9} color="#5fb4ff" rate={fwd} />
            {mode === 'pp-day' && <EnergyFlow path={[...unitPath(u)].reverse()} count={90} speed={16} size={0.9} color="#7dd3fc" rate={back} />}
          </group>
        ))}
      {flows.includes('river') && [-22, -8, 8, 22].map((o) => <EnergyFlow key={o} path={riverPath(o)} count={70} speed={18} size={0.9} color="#8fd3ff" />)}
      {flows.includes('inflow') && [-10, 10].map((o) => <EnergyFlow key={o} path={inflowPath(o)} count={40} speed={22} size={1.1} color="#8fd3ff" />)}
      {(flows.includes('power') || mode === 'pp-day' || mode === 'si-start') && (
        <>
          <EnergyFlow path={P_POWER} count={110} speed={60} size={1.6} color="#ffd34d" rate={() => (mode === 'pp-day' ? Math.max(0, st.current.pump) : st.current.P)} />
          {mode === 'pp-day' && <EnergyFlow path={[...P_POWER].reverse()} count={110} speed={60} size={1.6} color="#38bdf8" rate={() => Math.max(0, -st.current.pump)} />}
        </>
      )}

      {/* stałe podpisy */}
      {mode === 'tu-path' && (
        <>
          <Lbl pos={[X, 44, -12]} sub color="#7dd3fc">
            wlot z kratami
          </Lbl>
          <Lbl pos={[X, 26, 22]} sub color="#7dd3fc">
            rurociąg
          </Lbl>
          <Lbl pos={[X, 4, TU.z - 6]} sub color="#7dd3fc">
            spirala i kierownica
          </Lbl>
          <Lbl pos={[X, -4, TU.z + 4]} sub color="#fde68a">
            wirnik
          </Lbl>
          <Lbl pos={[X, -14, 100]} sub color="#7dd3fc">
            rura ssawna
          </Lbl>
        </>
      )}
      {mode === 'tu-gen' && (
        <>
          <Lbl pos={[X, GEN.y1 + 1.4, TU.z + 5.4]} sub color="#fdba74">
            stojan z uzwojeniem
          </Lbl>
          <Lbl pos={[X, (GEN.y0 + GEN.y1) / 2, TU.z + 2.6]} sub color="#fca5a5">
            bieguny wirnika
          </Lbl>
          <Lbl pos={[X, GEN.y0 - 3, TU.z + 1.2]} sub color="#e2e8f0">
            wał z turbiny
          </Lbl>
        </>
      )}
      {mode === 'en-power' && (
        <Lbl pos={[-90, (lvlP + TAIL) / 2, 70]} sub color="#fde68a">
          spad {fmt(lvlP - TAIL)} m
        </Lbl>
      )}
      {mode === 'en-cycle' && (
        <>
          <Lbl pos={[-60, 460, -880]} sub color="#e2e8f0">
            deszcz i śnieg w górach
          </Lbl>
          <Lbl pos={[0, 220, -400]} sub color="#f1f5f9">
            parowanie
          </Lbl>
          <Lbl pos={[cz(-1150), 120, -1150]} sub color="#7dd3fc">
            rzeka zasila zbiornik
          </Lbl>
        </>
      )}
      {mode === 'pp-day' && (
        <Lbl pos={[-30, PH.roof + 8, 80]} sub color={live.pump < -0.05 ? '#7dd3fc' : '#facc15'}>
          {live.pump < -0.05 ? 'pompa: silnik pobiera prąd z sieci' : live.pump > 0.05 ? 'turbina: generator daje prąd' : 'postój'}
        </Lbl>
      )}
      {mode === 'za-types' && kind === 'ziemna' && (
        <>
          <Lbl pos={[X, 40, 4]} sub color="#fdba74">
            rdzeń z gliny
          </Lbl>
          <Lbl pos={[X, 30, -90]} sub color="#e2e8f0">
            nasyp z kamieni i ziemi
          </Lbl>
        </>
      )}
      {mode === 'za-push' && (
        <Lbl pos={[X, lvlP + 4, -40]} sub color="#7dd3fc">
          poziom wody
        </Lbl>
      )}
      {mode === 'po-basin' && (
        <Lbl pos={[(SPILL.x0 + SPILL.x1) / 2, 18, 96]} sub color="#e2e8f0">
          niecka wypadowa – woda traci energię
        </Lbl>
      )}
      {mode === 'si-fish' && (
        <Lbl pos={[cz(WEIR_Z) - 37, 9, WEIR_Z - 20]} sub color="#fdba74">
          przepławka dla ryb
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

