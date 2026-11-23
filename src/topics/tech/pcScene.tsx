/*
 * Komputer osobisty – wspólna scena 3D wszystkich zakładek tematu. Tryb zakładki (params.mode) decyduje, co
 * widać: pokój z komputerem (z szybą albo bez, z kartą graficzną i chłodzeniem albo bez), widok rozłożony,
 * przepływy danych i prądu, jedna z pracowni z powiększonym modelem albo muzeum dawnych komputerów.
 */
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SceneProps } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { useModuleHome, useTopicNav } from '../../lib/topicNav';
import { PauseContext } from '../../lib/useAnimationClock';
import { Lbl } from '../aviation/airliner';
import { EnergyFlow } from '../energy/windExtras';
import {
  ATX24,
  BIOS,
  CASE,
  CHIPSET,
  CMOS,
  CODEC,
  DIMMS,
  EPS,
  ERAS,
  FANS_FRONT,
  FAN_REAR,
  GPU,
  HDD,
  KEYBOARD,
  LAB,
  LAB_Y,
  M2,
  MBZ,
  MEM_LEVELS,
  MONITOR,
  MOUSE,
  MUSEUM,
  PATH_GPU,
  PATH_KEY,
  PATH_RAM,
  PCIE,
  POWER,
  PSU,
  PWR_CPU,
  PWR_GPU,
  PWR_HDD,
  PWR_MB,
  SATA,
  SOCKET,
  airPaths,
  pc,
  sm,
  type V3,
} from './pcGeo';
import { Computer, tickRgb } from './pcParts';
import { Shadow } from './pcMats';
import { Keyboard, KeyboardCable, Monitor, Mouse, Room, type ScreenState } from './pcDesk';
import { CoolLab, CpuCutLab, DieLab, FinLab, PcbLab, PipeLab, PsuLab } from './pcLabs';
import { CoresLab, DramLab, GpuLab, HddLab, LcdLab, MemLab, NandLab, PortsLab, PyrLab, RasterLab, SsdLab } from './pcLabs2';
import { KbdLab, KeyLab, MouseLab } from './pcInput';
import { CrtLab, MediaLab, MooreLab, Museum, TubeLab } from './pcHistory';

const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

/* ================= ustawienia trybów ================= */

type Lab = keyof typeof LAB | 'museum' | '';
interface Cfg {
  glass: boolean;
  cooler: boolean;
  gpu: boolean;
  cables: boolean;
  lab: Lab;
}
const BASE: Cfg = { glass: true, cooler: true, gpu: true, cables: true, lab: '' };
const CFG: Record<string, Partial<Cfg>> = {
  home: {},
  'tour-key': { glass: false },
  explode: { glass: true },
  'ob-home': { glass: false },
  'ob-psu': { lab: 'psu' },
  'ob-air': { glass: false },
  'ob-power': { glass: false },
  'mb-home': { glass: false, cooler: false, gpu: false, cables: false },
  'mb-bus': { glass: false, cooler: false, gpu: false, cables: false },
  'mb-pcb': { lab: 'pcb' },
  'mb-boot': { glass: false },
  'cpu-home': { glass: false, cooler: false, gpu: false, cables: false },
  'cpu-cut': { lab: 'cpuCut' },
  'cpu-die': { lab: 'die' },
  'cpu-fin': { lab: 'fin' },
  'cpu-pipe': { lab: 'pipe' },
  'cpu-cool': { lab: 'cool' },
  'mem-home': { lab: 'mem' },
  'mem-dram': { lab: 'dram' },
  'mem-ssd': { lab: 'ssd' },
  'mem-nand': { lab: 'nand' },
  'mem-hdd': { lab: 'hdd' },
  'mem-pyr': { lab: 'pyr' },
  'gpu-home': { lab: 'gpu' },
  'gpu-raster': { lab: 'raster' },
  'gpu-cores': { lab: 'cores' },
  'gpu-lcd': { lab: 'lcd' },
  'io-home': {},
  'io-kbd': { lab: 'kbd' },
  'io-key': { lab: 'key' },
  'io-mouse': { lab: 'mouse' },
  'io-ports': { lab: 'ports' },
  'hi-home': { lab: 'museum' },
  'hi-tube': { lab: 'tube' },
  'hi-crt': { lab: 'crt' },
  'hi-media': { lab: 'media' },
  'hi-moore': { lab: 'moore' },
};
const cfgOf = (mode: string): Cfg => ({ ...BASE, ...(CFG[mode] ?? {}) });

/* ================= drogi danych na płycie ================= */

const P = (pts: V3[]): V3[] => pts.map(([x, y, z]) => pc(x, y, z));
const CPU_P: V3 = [SOCKET.x, SOCKET.y, MBZ + 1];
const BUS = {
  ram: P([CPU_P, [-4, SOCKET.y + 1, MBZ + 0.5], [DIMMS[1], 33, MBZ + 0.5], [DIMMS[3], 33, MBZ + 0.5]]),
  ram2: P([CPU_P, [-4, SOCKET.y - 1, MBZ + 0.5], [DIMMS[1], 30, MBZ + 0.5], [DIMMS[3], 30, MBZ + 0.5]]),
  pcie: P([CPU_P, [-10, 27, MBZ + 0.4], [-14, PCIE.y + 0.6, MBZ + 0.4], [-14, PCIE.y, MBZ + 1.2], [PCIE.x0 + 1, PCIE.y, MBZ + 1.2]]),
  m2: P([CPU_P, [-9.5, 28, MBZ + 0.4], [M2.x1 - 1, M2.y, MBZ + 1.4], [M2.x0 + 1, M2.y, MBZ + 1.4]]),
  dmi: P([CPU_P, [-6, 27, MBZ + 0.4], [-4.5, 22, MBZ + 0.4], [CHIPSET.x, CHIPSET.y, MBZ + 1.2]]),
  sata: P([[CHIPSET.x, CHIPSET.y, MBZ + 1.2], [0, 18, MBZ + 0.4], [SATA.x, SATA.y, MBZ + 0.8]]),
  usb: P([[CHIPSET.x, CHIPSET.y, MBZ + 1.2], [-10, 20, MBZ + 0.4], [-20, 24, MBZ + 0.4], [-21, 33, MBZ + 0.8], [-23, 33, 3]]),
  audio: P([[CHIPSET.x, CHIPSET.y, MBZ + 1.2], [-12, 16.5, MBZ + 0.4], [CODEC.x, CODEC.y, MBZ + 0.6], [-21, 44, 3]]),
  bios: P([[BIOS.x, BIOS.y, MBZ + 0.4], [CHIPSET.x, CHIPSET.y - 1, MBZ + 1], [-6, 27, MBZ + 0.4], CPU_P]),
};

/* ================= scenariusze ================= */

const KEY_PH: [number, string][] = [
  [2, 'Klawisz zwiera styk pod spodem'],
  [5, 'Klawiatura wysyła kod klawisza kablem USB'],
  [7, 'Chipset przekazuje kod procesorowi'],
  [9.5, 'Procesor zapisuje literę w pamięci RAM'],
  [12, 'Karta graficzna rysuje nową klatkę'],
  [99, 'Obraz płynie do monitora – litera jest na ekranie'],
];
const BOOT_PH: [number, string][] = [
  [2.5, 'Przycisk zasilania budzi zasilacz'],
  [5, 'Zasilacz daje napięcia 12 V, 5 V i 3,3 V'],
  [7.5, 'Procesor czyta program UEFI z kości BIOS'],
  [11, 'Test POST: pamięć, karta graficzna, dyski'],
  [14.5, 'Ładowanie systemu z dysku M.2'],
  [99, 'System gotowy do pracy'],
];
const phaseAt = (list: [number, string][], t: number) => (t < 0 ? -1 : list.findIndex(([e]) => t < e));

/* ================= części do kliknięcia ================= */

interface PartInfo {
  name: string;
  desc: string;
  pos: V3;
  link?: string;
}
const L = (k: keyof typeof LAB, x: number, y: number, z: number): V3 => [LAB[k][0] + x, LAB_Y + y, LAB[k][2] + z];

function homeParts(mode: string): Record<string, PartInfo> | null {
  switch (mode) {
    case 'ob-home':
      return {
        case: { name: 'obudowa', desc: 'Stalowa skrzynka typu „midi tower”, ok. 47 × 45 × 22 cm. Trzyma wszystko na swoim miejscu, ekranuje zakłócenia i prowadzi powietrze. Szyba z boku jest ze szkła hartowanego.', pos: pc(0, CASE.y1 + 4, 11) },
        psu: { name: 'zasilacz', desc: 'Zamienia prąd z gniazdka (230 V, zmienny) na prąd stały 12 V, 5 V i 3,3 V, którego potrzebują podzespoły. Ten ma moc 750 W i sprawność ok. 90% (certyfikat 80 PLUS Gold).', pos: pc(-14, PSU.y1 + 1, 18) },
        shroud: { name: 'osłona zasilacza', desc: 'Przegroda nad zasilaczem. Chowa jego kable i oddziela gorące powietrze karty graficznej od zasilacza, który ma własny wentylator.', pos: pc(-4, 11.5, 20) },
        hdd: { name: 'dysk twardy', desc: 'Dysk HDD 3,5″ o pojemności 8 TB – na zdjęcia, filmy i kopie zapasowe. Jest dużo wolniejszy od dysku SSD, ale za tę samą cenę mieści kilka razy więcej.', pos: pc(11, HDD.y1 + 2, 14) },
        front: { name: 'wentylatory przednie', desc: 'Trzy wentylatory 12 cm wciągają chłodne powietrze przez siatkę z przodu. Za siatką jest filtr kurzu, który warto czyścić co kilka miesięcy.', pos: pc(20, FANS_FRONT[2] + 7, 11) },
        rear: { name: 'wentylator tylny', desc: 'Wyrzuca ciepłe powietrze z tyłu obudowy – tuż za chłodzeniem procesora.', pos: pc(-21, FAN_REAR.y + 8, 11) },
        cables: { name: 'kable zasilające', desc: 'Z zasilacza wychodzą osobne kable: 24-stykowy do płyty głównej, 8-stykowy do procesora, 16-stykowy do karty graficznej i kabel SATA do dysku.', pos: pc(4, 30, 18) },
        top: { name: 'panel przedni', desc: 'Na górze obudowy: przycisk zasilania z diodą, gniazda USB, USB-C i słuchawkowe. Łączą się cienkimi kablami z płytą główną.', pos: pc(19.5, CASE.y1 + 4, 4) },
        io: { name: 'tylne złącza', desc: 'Z tyłu wystają złącza płyty głównej (USB, sieć, dźwięk) i karty graficznej (monitor). Tu podłącza się prawie wszystkie urządzenia.', pos: pc(-24, 40, 3) },
      };
    case 'mb-home':
      return {
        socket: { name: 'gniazdo procesora', desc: 'Gniazdo LGA1700: 1700 sprężystych styków, na których leży procesor. Metalowa ramka z dźwignią dociska go równo do wszystkich styków.', pos: pc(SOCKET.x, SOCKET.y + 4.2, MBZ + 1) },
        vrm: { name: 'sekcja zasilania (VRM)', desc: 'Zamienia 12 V z zasilacza na ok. 1,2 V dla procesora. Prąd jest ogromny – nawet 250 A – więc pracuje kilkanaście „faz” na zmianę. Pod radiatorami są tranzystory, obok czarne kostki to dławiki.', pos: pc(-15.4, 41, MBZ + 4) },
        ram: { name: 'sloty pamięci', desc: 'Cztery gniazda na moduły RAM DDR5. Dwa moduły wkłada się w co drugi slot (A2 i B2) – wtedy pracują w dwóch kanałach naraz i pamięć jest dwa razy szybsza.', pos: pc(-0.7, 41, MBZ + 1.5) },
        pcie: { name: 'slot PCIe x16', desc: 'Długie złącze na kartę graficzną. Ma 16 torów danych PCI Express 5.0 – razem ok. 64 GB/s. Metalowe wzmocnienie chroni je przed ciężarem karty.', pos: pc(-15, PCIE.y + 1.2, MBZ + 1.6) },
        m2: { name: 'złącze M.2', desc: 'Pod radiatorem leży dysk SSD wielkości gumy do żucia. Łączy się z procesorem bezpośrednio czterema torami PCIe – czyta ponad 7 GB na sekundę.', pos: pc(-11.5, M2.y + 1.8, MBZ + 1.8) },
        chipset: { name: 'chipset', desc: 'Układ pomocniczy: obsługuje porty USB, SATA, sieć, dźwięk i kolejne sloty. Z procesorem łączy go szybkie łącze DMI.', pos: pc(CHIPSET.x, CHIPSET.y + 2.6, MBZ + 1.5) },
        sata: { name: 'porty SATA', desc: 'Złącza dla dysków 2,5″ i 3,5″ oraz napędów. SATA jest starsze i wolniejsze niż M.2 – do 600 MB/s.', pos: pc(SATA.x + 1.2, SATA.y + 2.5, MBZ + 1) },
        atx: { name: 'złącze ATX 24-pin', desc: 'Główne zasilanie płyty: 24 styki z napięciami 12 V, 5 V i 3,3 V oraz przewodami sygnałowymi (np. „włącz się”).', pos: pc(ATX24.x + 1, ATX24.y + 3.4, MBZ + 1.5) },
        eps: { name: 'złącze zasilania procesora', desc: 'Osobne 8 + 4 styki 12 V tylko dla procesora – przez zwykłe złącze płyty nie dałoby się przesłać tak dużego prądu.', pos: pc(EPS.x + 1, EPS.y + 1.2, MBZ + 1.5) },
        bios: { name: 'kość BIOS', desc: 'Mała pamięć flash z programem UEFI. Uruchamia się jako pierwszy po włączeniu: sprawdza sprzęt i wczytuje system z dysku.', pos: pc(BIOS.x, BIOS.y - 1, MBZ + 0.8) },
        cmos: { name: 'bateria CMOS', desc: 'Bateria pastylkowa CR2032. Podtrzymuje zegar i ustawienia, gdy komputer jest odłączony od prądu. Wystarcza na kilka lat.', pos: pc(CMOS.x, CMOS.y - 1.8, MBZ + 1) },
        audio: { name: 'układ dźwiękowy', desc: 'Kodek audio zamienia dane na sygnał dla słuchawek i głośników. Ma osobne, odizolowane ścieżki (jasna linia), żeby nie łapał szumów z reszty płyty.', pos: pc(CODEC.x, CODEC.y - 1.6, MBZ + 1) },
        rear: { name: 'panel złączy', desc: 'Pod plastikową osłoną są tylne gniazda: USB, sieć, wyjście obrazu z procesora, gniazda dźwięku i anteny Wi-Fi.', pos: pc(-19.6, 45.5, MBZ + 3) },
      };
    case 'cpu-home':
      return {
        ihs: { name: 'osłona IHS', desc: 'Metalowa pokrywa z niklowanej miedzi. Chroni delikatny krzemowy rdzeń i rozprowadza jego ciepło na większą powierzchnię, którą dotyka chłodzenie.', pos: pc(SOCKET.x, SOCKET.y + 1, MBZ + 2.2) },
        sub: { name: 'laminat procesora', desc: 'Zielona płytka pod osłoną: kilkanaście warstw miedzianych ścieżek, które rozprowadzają sygnały z rdzenia do 1700 pól stykowych na spodzie.', pos: pc(SOCKET.x - 2.4, SOCKET.y - 2.6, MBZ + 1.2) },
        mark: { name: 'oznaczenie', desc: 'Nazwa modelu: Core i7-14700K. Ma 20 rdzeni (8 wydajnych i 12 oszczędnych), działa do 5,6 GHz i ma ok. 12 mld tranzystorów.', pos: pc(SOCKET.x + 1, SOCKET.y - 0.8, MBZ + 1.6) },
        frame: { name: 'ramka dociskowa', desc: 'Stalowa ramka dociska procesor do styków siłą kilkudziesięciu kilogramów. Zamyka się dźwignią.', pos: pc(SOCKET.x - 2.9, SOCKET.y + 3.4, MBZ + 1) },
        lever: { name: 'dźwignia', desc: 'Podnosi się ją, żeby otworzyć ramkę i włożyć procesor. Procesor pasuje tylko w jednym ułożeniu – ma wycięcia z boków.', pos: pc(SOCKET.x + 3.4, SOCKET.y + 3.4, MBZ + 1) },
        vrm: { name: 'zasilanie procesora', desc: 'Dławiki i tranzystory obok gniazda karmią procesor prądem do 250 A przy napięciu ok. 1,2 V. Procesor sam mówi, jakiego napięcia potrzebuje.', pos: pc(-13.3, 28.3, MBZ + 1.5) },
        ram: { name: 'pamięć RAM obok', desc: 'Moduły RAM stoją kilka centymetrów od procesora – im krótsze ścieżki, tym szybciej można przesyłać dane.', pos: pc(DIMMS[1], 26, MBZ + 4.5) },
      };
    case 'mem-home':
      return {
        ram: { name: 'moduł RAM', desc: 'Pamięć operacyjna DDR5: osiem kości DRAM po 4 GB. Trzyma dane programów, które są właśnie używane. Po wyłączeniu prądu wszystko z niej znika.', pos: L('mem', -30, -58, -14) },
        spd: { name: 'radiator i styki', desc: 'Aluminiowy radiator odprowadza ciepło z kości. Na dole złocone styki – po 144 z każdej strony – i wycięcie, które nie pozwala włożyć modułu odwrotnie.', pos: L('mem', -56, -84, -4) },
        ssd: { name: 'dysk SSD M.2', desc: 'Pamięć trwała bez ruchomych części. Kontroler zarządza zapisem, w kościach NAND dane zostają po wyłączeniu prądu, a mała pamięć DRAM przyspiesza wyszukiwanie.', pos: L('mem', -26, -70, 34) },
        hdd: { name: 'dysk twardy', desc: 'Pod pokrywą wirują talerze pokryte magnetykiem. Głowica na ramieniu unosi się nad nimi na poduszce powietrza cieńszej niż odcisk palca.', pos: L('mem', 30, -68, 12) },
      };
    case 'gpu-home':
      return {
        fans: { name: 'osłona z wentylatorami', desc: 'Trzy wentylatory wciskają powietrze między żebra radiatora. Przy małym obciążeniu stoją – karta jest wtedy zupełnie cicha.', pos: L('gpu', 52, 44, 0) },
        fins: { name: 'radiator i rurki cieplne', desc: 'Setki aluminiowych żeber i miedziane rurki cieplne odbierają ponad 280 W ciepła – tyle co mała grzałka.', pos: L('gpu', 52, 12, 0) },
        chip: { name: 'układ GPU', desc: 'Mózg karty: ok. 36 mld tranzystorów i kilka tysięcy prostych rdzeni, które liczą kolory milionów pikseli naraz.', pos: L('gpu', -12, -16, 14) },
        vram: { name: 'pamięć GDDR6X', desc: 'Własna, bardzo szybka pamięć karty (12 GB) wokół układu GPU. Trzyma tekstury, modele i gotowe klatki obrazu – przesyła ponad 500 GB/s.', pos: L('gpu', 8, -16, 22) },
        vrm: { name: 'sekcja zasilania', desc: 'Dławiki i tranzystory zamieniają 12 V z zasilacza na ok. 1 V dla układu GPU i pamięci.', pos: L('gpu', 30, -17, -6) },
        back: { name: 'tylna płytka', desc: 'Usztywnia długą kartę, żeby się nie wyginała, i oddaje trochę ciepła z tyłu laminatu.', pos: L('gpu', 50, -38, 0) },
        out: { name: 'złącza monitorów', desc: 'Na metalowym śledziu: trzy DisplayPorty i HDMI. Karta może zasilać obrazem nawet cztery monitory.', pos: L('gpu', -46, 6, 0) },
      };
    case 'io-home':
      return {
        monitor: { name: 'monitor', desc: '27 cali, 2560 × 1440 pikseli, odświeżanie 144 razy na sekundę. Każdy piksel składa się z trzech świecących punktów: czerwonego, zielonego i niebieskiego.', pos: [MONITOR.x, MONITOR.y0 + MONITOR.h + 5, MONITOR.z] },
        kb: { name: 'klawiatura', desc: 'Klawiatura mechaniczna: pod każdym klawiszem jest osobny przełącznik ze sprężyną. Kilkaset razy na sekundę sprawdza, które klawisze są wciśnięte.', pos: [KEYBOARD.x, 86, KEYBOARD.z + 4] },
        mouse: { name: 'mysz', desc: 'Mysz optyczna: kamera pod spodem robi tysiące zdjęć blatu na sekundę i z różnic między nimi wylicza ruch.', pos: [MOUSE.x, 86, MOUSE.z] },
        usb: { name: 'kabel USB', desc: 'Klawiatura i mysz łączą się z komputerem przez USB. Kabel przesyła dane i zasila urządzenie napięciem 5 V.', pos: [10, 79, 2] },
        dp: { name: 'kabel DisplayPort', desc: 'Przesyła obraz z karty graficznej do monitora – ok. 5,3 mld bitów na sekundę przy tym monitorze.', pos: [-8, 80, -28] },
        pc: { name: 'komputer', desc: 'Jednostka centralna: wszystko, co liczy i pamięta. Reszta to urządzenia wejścia (klawiatura, mysz) i wyjścia (monitor).', pos: pc(0, CASE.y1 + 5, 11) },
      };
    case 'hi-home':
      return {
        eniac: { name: 'ENIAC (1946)', desc: 'Jeden z pierwszych komputerów elektronicznych. Zajmował całą salę, ważył 27 ton i miał ok. 18 000 lamp elektronowych. Programowało się go, przełączając kable. Wykonywał 5000 dodawań na sekundę.', pos: [MUSEUM.eniac[0], 275, MUSEUM.eniac[2] + 10] },
        ibm: { name: 'IBM PC (1981)', desc: 'Pierwszy „pecet”: procesor Intel 8088 4,77 MHz, 64 KB pamięci, stacje dyskietek 5,25″ i monitor z zielonym tekstem. Od niego wziął się zestaw części, z którego składamy komputery do dziś.', pos: [MUSEUM.ibm[0], 160, MUSEUM.ibm[2]] },
        beige: { name: 'PC z 1998 r.', desc: 'Beżowa wieża z procesorem Pentium II 400 MHz, 64 MB RAM i dyskiem 8 GB. Do tego stacja dyskietek 3,5″, CD-ROM i ciężki monitor kineskopowy. Na ekranie Windows 98.', pos: [MUSEUM.beige[0], 160, MUSEUM.beige[2]] },
        today: { name: 'PC dziś', desc: 'Nasz komputer: 20 rdzeni po 5,5 GHz, 32 GB RAM, dysk 2 TB. Liczy ok. miliard razy szybciej niż ENIAC, a mieści się pod biurkiem.', pos: [MUSEUM.today[0], 160, MUSEUM.today[2]] },
      };
  }
  return null;
}

function homeLinks(): Record<string, PartInfo> {
  return {
    ob: { name: 'obudowa i zasilanie', desc: '', pos: pc(0, CASE.y1 + 8, 11), link: 'obudowa' },
    mb: { name: 'płyta główna', desc: '', pos: pc(-18, 30, 23), link: 'plyta' },
    cpu: { name: 'procesor', desc: '', pos: pc(-8.5, 43, 23), link: 'procesor' },
    mem: { name: 'pamięć i dyski', desc: '', pos: pc(1, 37, 23), link: 'pamiec' },
    gpu: { name: 'karta graficzna', desc: '', pos: pc(-6, 16, 23), link: 'grafika' },
    io: { name: 'monitor, klawiatura i mysz', desc: '', pos: [MONITOR.x, MONITOR.y0 + MONITOR.h + 6, MONITOR.z], link: 'urzadzenia' },
    hi: { name: 'komputer kiedyś', desc: '', pos: [-60, 180, -46], link: 'historia' },
  };
}

/* ================= ramki ================= */

const PART_C = '#facc15';
const PHASE_C = '#c4b5fd';
const fmt = (v: number, d = 0) => v.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });
function Rows({ list }: { list: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: 13 }}>
      {list.map(([k, v]) => (
        <span key={k} style={{ display: 'contents' }}>
          <span style={{ opacity: 0.75 }}>{k}</span>
          <b>{v}</b>
        </span>
      ))}
    </div>
  );
}
function Bars({ data, unit }: { data: [string, number, string][]; unit: string }) {
  const max = Math.max(...data.map((d) => d[1]));
  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
      {data.map(([k, v, c]) => (
        <div key={k}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ opacity: 0.8 }}>{k}</span>
            <b>
              {fmt(v)} {unit}
            </b>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{ height: 6, borderRadius: 3, width: `${(v / max) * 100}%`, background: c }} />
          </div>
        </div>
      ))}
    </div>
  );
}
function Table({ rows }: { rows: string[][] }) {
  return (
    <table style={{ fontSize: 12, borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ fontWeight: i === 0 ? 700 : 400 }}>
            {r.map((c, j) => (
              <td key={j} style={{ padding: '1px 6px', opacity: j === 0 && i ? 0.75 : 1, color: i === 0 ? PART_C : undefined }}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ================= scena ================= */

export function PcScene({ params }: SceneProps) {
  const mode = str(params.mode, 'home');
  const cfg = cfgOf(mode);
  const run = Boolean(params.run);
  const exP = Boolean(params.ex);
  const fanP = num(params.fan, 60) / 100;
  const gateP = num(params.gate, 0) / 100;
  const clockP = num(params.clock, 1);
  const liftP = Boolean(params.lift);
  const home = useModuleHome();
  const nav = useTopicNav();
  const paused = useContext(PauseContext);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const prev = scene.background;
    const prevEnv = scene.environment;
    const prevI = scene.environmentIntensity;
    scene.background = new THREE.Color('#141a23');
    // otoczenie do odbić: metale (radiatory, talerze dysku, osłona procesora) nie są wtedy czarne
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    return () => {
      scene.background = prev;
      scene.environment = prevEnv;
      scene.environmentIntensity = prevI;
      env.dispose();
      pm.dispose();
    };
  }, [scene, gl]);

  const tRun = useRef(-1);
  const tAll = useRef(0);
  const st = useRef({ ex: 0, fan: 0.6, gate: 0, tick: 0, lift: 0, press: 0, gex: 1 });
  const [phase, setPhase] = useState(-1);
  const [dramWrite, setDramWrite] = useState(true);
  useEffect(() => {
    tRun.current = run ? 0 : -1;
  }, [run, mode]);
  useEffect(() => {
    tAll.current = 0;
  }, [mode]);

  useFrame((_, dt0) => {
    const dt = paused ? 0 : Math.min(dt0, 0.05);
    tAll.current += dt;
    tickRgb(dt);
    if (tRun.current >= 0) tRun.current += dt;
    const S = st.current;
    const k = Math.min(1, dt * 2.2);
    S.ex += ((mode === 'explode' && exP ? 1 : 0) - S.ex) * k;
    S.fan += ((mode === 'ob-air' || mode === 'cpu-cool' ? fanP : 0.6) - S.fan) * k;
    S.gate += ((mode === 'cpu-fin' ? gateP : 0) - S.gate) * Math.min(1, dt * 5);
    S.lift += ((mode === 'cpu-cut' && liftP ? 1 : 0) - S.lift) * k;
    S.gex += ((mode === 'gpu-home' ? 1 : 0.6) - S.gex) * k;
    S.tick += dt * (mode === 'cpu-pipe' ? clockP : 1);
    // klawisz: wciśnięcie co 1,6 s
    const kt = tAll.current % 1.6;
    S.press = kt < 0.25 ? sm(0, 0.12, kt) : kt < 0.55 ? 1 : 1 - sm(0.55, 0.75, kt);
    const list = mode === 'tour-key' ? KEY_PH : mode === 'mb-boot' ? BOOT_PH : null;
    const ph = list ? phaseAt(list, tRun.current) : -1;
    if (ph !== phase) setPhase(ph);
    const w = tAll.current % 16 < 2.5;
    if (mode === 'mem-dram' && w !== dramWrite) setDramWrite(w);
  });

  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [mode]);
  const parts = home ? homeParts(mode) : null;
  const links = mode === 'home' && home ? homeLinks() : null;

  const spin = () => 1.2 + st.current.fan * 5;
  const lab = cfg.lab;

  // obraz na monitorze
  let screen: ScreenState = mode === 'io-home' || mode === 'home' ? 'desktop' : 'game';
  if (mode === 'tour-key') screen = phase === 5 ? 'text' : 'text0';
  if (mode === 'mb-boot') screen = phase < 0 ? 'desktop' : phase <= 1 ? 'off' : phase === 2 ? 'logo' : phase === 3 ? 'post' : phase === 4 ? 'boot' : 'desktop';
  if (mode === 'ob-home' || mode === 'mb-home' || mode === 'cpu-home' || mode === 'explode' || mode === 'ob-power') screen = 'desktop';

  // przepływy w scenariuszach: kulki płyną tylko w swojej fazie
  const on = (cond: boolean) => () => (cond ? 1 : 0);
  const keyPh = mode === 'tour-key' ? phase : -1;
  const bootPh = mode === 'mb-boot' ? phase : -1;

  let info: ReactNode = null;
  const phaseList = (list: [number, string][], note: string) => (
    <>
      <div style={{ fontWeight: 700, color: PHASE_C }}>{run ? (phase >= 0 ? list[phase][1] : 'Start') : 'Naciśnij „Rozpocznij”'}</div>
      {list.map(([, s], i) => (
        <div key={i} style={{ fontSize: 13, opacity: i === phase ? 1 : i < phase ? 0.75 : 0.45, fontWeight: i === phase ? 700 : 400 }}>
          {i < phase ? '✓' : i === phase ? '▸' : '·'} {s}
        </div>
      ))}
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{note}</div>
    </>
  );
  if (mode === 'home')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Ten komputer</div>
        <Rows
          list={[
            ['procesor', '20 rdzeni, do 5,6 GHz'],
            ['pamięć RAM', '32 GB DDR5'],
            ['karta graficzna', '12 GB, ok. 5800 rdzeni'],
            ['dysk SSD', '2 TB, 7 GB/s'],
            ['dysk HDD', '8 TB'],
            ['zasilacz', '750 W'],
            ['monitor', '27″, 2560 × 1440, 144 Hz'],
          ]}
        />
      </>
    );
  else if (mode === 'tour-key') info = phaseList(KEY_PH, 'W rzeczywistości cała ta droga trwa ok. 10–20 milisekund – krócej niż mrugnięcie.');
  else if (mode === 'mb-boot') info = phaseList(BOOT_PH, 'Od naciśnięcia przycisku do pulpitu mija zwykle 10–20 sekund.');
  else if (mode === 'ob-power')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Pobór mocy podczas gry</div>
        <Bars data={POWER} unit="W" />
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Razem ok. 460 W. Zasilacz 750 W ma zapas i pracuje w swoim najbardziej sprawnym zakresie.</div>
      </>
    );
  else if (mode === 'ob-air' || mode === 'cpu-cool') {
    const f = fanP;
    const tc = Math.round(52 + 40 * (1 - f) ** 2);
    const tg = Math.round(58 + 30 * (1 - f) ** 2);
    const db = Math.round(22 + 18 * f);
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Temperatury podczas gry</div>
        <Rows
          list={[
            ['obroty wentylatorów', `${fmt(400 + f * 1400)} obr./min`],
            ['procesor', `${tc} °C`],
            ['karta graficzna', `${tg} °C`],
            ['głośność', `ok. ${db} dB`],
          ]}
        />
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{tc > 90 ? 'Za gorąco – procesor sam zwalnia, żeby się nie uszkodzić.' : f > 0.8 ? 'Chłodno, ale głośno.' : 'Rozsądny kompromis między ciszą a temperaturą.'}</div>
      </>
    );
  } else if (mode === 'mb-bus')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Drogi danych na płycie</div>
        <Rows
          list={[
            ['procesor ↔ RAM (2 kanały)', 'ok. 96 GB/s'],
            ['procesor → karta (PCIe x16)', 'ok. 64 GB/s'],
            ['procesor ↔ dysk M.2 (PCIe x4)', 'ok. 8 GB/s'],
            ['procesor ↔ chipset (DMI)', 'ok. 16 GB/s'],
            ['chipset → SATA', '0,6 GB/s'],
            ['chipset → USB 3.2', '1,2 GB/s'],
          ]}
        />
      </>
    );
  else if (mode === 'cpu-fin')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Tranzystor</div>
        <Rows
          list={[
            ['napięcie na bramce', `${fmt(gateP * 1.2, 2)} V`],
            ['stan', gateP > 0.05 ? 'włączony – prąd płynie (1)' : 'wyłączony – prąd nie płynie (0)'],
            ['szerokość żeberka', 'ok. 7 nm (ok. 30 atomów)'],
            ['przełączeń na sekundę', 'kilka miliardów'],
          ]}
        />
      </>
    );
  else if (mode === 'cpu-pipe')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Zegar procesora</div>
        <Rows
          list={[
            ['na modelu', `${fmt(clockP, 1)} taktu na sekundę`],
            ['w prawdziwym procesorze', '5 500 000 000 taktów na sekundę'],
            ['jeden takt trwa', '0,18 ns'],
            ['światło w czasie taktu', 'przebiega ok. 5 cm'],
          ]}
        />
      </>
    );
  else if (mode === 'mem-ssd')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Dysk SSD w liczbach</div>
        <Rows
          list={[
            ['odczyt', 'ok. 7 000 MB/s'],
            ['zapis', 'ok. 6 000 MB/s'],
            ['czas dostępu', 'ok. 0,06 ms'],
            ['kanały kontrolera', '8 (po 4 na kość)'],
            ['trwałość', 'ok. 1 200 TB zapisu'],
          ]}
        />
      </>
    );
  else if (mode === 'mem-pyr')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Ile czeka procesor? (gdyby rejestr odpowiadał w 1 s)</div>
        <Rows list={MEM_LEVELS.map(([name, , , , human]) => [name, human])} />
      </>
    );
  else if (mode === 'hi-home')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Komputer kiedyś i dziś</div>
        <Table rows={ERAS} />
      </>
    );
  else if (mode === 'hi-moore')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Prawo Moore'a</div>
        <div style={{ fontSize: 13 }}>Liczba tranzystorów w układzie podwaja się mniej więcej co 2 lata. Od 1971 r. wzrosła 40 milionów razy.</div>
      </>
    );
  else if (mode === 'mem-dram')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Pamięć DRAM</div>
        <div style={{ fontSize: 13 }}>{dramWrite ? 'Zapis: rząd po rzędzie ładujemy kondensatory – powstaje litera „A”.' : 'Ładunek ucieka. Co 32 ms kontroler odczytuje każdy rząd i ładuje go od nowa – to odświeżanie (żółta linia słowa).'}</div>
      </>
    );

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

  // etykiety w widoku rozłożonym (położenia części po rozsunięciu)
  const exLabels: [V3, string][] = [
    [pc(0, 47 + 58 + 3, 22 + 26), 'szyba boczna'],
    [pc(-8.5, 33.5 + 9, 1.6 + 40 + 9), 'chłodzenie procesora'],
    [pc(-6, 23, 7.5 + 32 + 4), 'karta graficzna'],
    [pc(-8.5, 30, 1.6 + 26), 'procesor'],
    [pc(-0.5, 42, 1.6 + 22 + 4), 'pamięć RAM'],
    [pc(-11.5, 25, 1.6 + 16), 'dysk M.2'],
    [pc(-14.5 - 42, 11, 10), 'zasilacz'],
    [pc(22 + 24, 49, 11 + 26), 'wentylatory przednie'],
    [pc(-22 - 26, 45, 11), 'wentylator tylny'],
    [pc(-9, 18, 1.6 + 6), 'płyta główna'],
    [pc(11, 6, 10 + 34), 'dysk HDD'],
  ];

  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#f3f1ea', '#5b5245', 0.7]} />
      <directionalLight position={[200, 300, 250]} intensity={1.6} color="#fff4e2" />
      <directionalLight position={[-150, 120, 200]} intensity={0.45} color="#cfe0ff" />

      <Room />
      {/* miękkie cienie pod przedmiotami */}
      <Shadow p={[0, 0.06, 0]} w={210} d={110} />
      <Shadow p={[-75, 0.07, 85]} w={85} d={85} />
      <Shadow p={[pc(0, 0, 0)[0], 77.04, pc(0, 0, 11)[2]]} w={64} d={38} o={2} />
      <Shadow p={[MONITOR.x, 77.04, MONITOR.z - 2]} w={36} d={28} o={2} />
      <Shadow p={[KEYBOARD.x, 77.33, KEYBOARD.z]} w={54} d={22} o={3} />
      <Shadow p={[MOUSE.x, 77.33, MOUSE.z]} w={10} d={15} o={3} />
      <Shadow p={[-78, 77.04, -26]} w={22} d={22} o={2} />
      <Monitor screen={screen} />
      <Keyboard />
      <KeyboardCable />
      <Mouse />
      <group position={pc(0, 0, 0)}>
        <Computer glass={cfg.glass} cooler={cfg.cooler} cables={cfg.cables} gpu={cfg.gpu} explode={() => st.current.ex} spin={spin} />
        <pointLight position={[-2, 36, 18]} intensity={70} distance={0} decay={2} color="#eef4ff" />
        <pointLight position={[-6, 12, 20]} intensity={18} distance={0} decay={2} color="#eef4ff" />
      </group>

      {/* przepływy */}
      {mode === 'tour-key' && (
        <>
          <EnergyFlow path={PATH_KEY} count={40} speed={40} size={0.55} color="#7dd3fc" rate={on(keyPh >= 1 && keyPh <= 2)} />
          <EnergyFlow path={PATH_RAM} count={20} speed={14} size={0.45} color="#c4b5fd" rate={on(keyPh === 3)} />
          <EnergyFlow path={PATH_GPU} count={60} speed={40} size={0.55} color="#86efac" rate={on(keyPh >= 4)} />
        </>
      )}
      {mode === 'ob-air' &&
        [0, 1, 2].map((i) => <EnergyFlow key={i} path={airPaths(i)} count={34} speed={30} size={0.5} color={i === 1 ? '#bae6fd' : '#7dd3fc'} rate={() => 0.3 + st.current.fan} />)}
      {(mode === 'ob-power' || (mode === 'mb-boot' && bootPh >= 1)) &&
        [PWR_MB, PWR_CPU, PWR_GPU, PWR_HDD].map((p, i) => <EnergyFlow key={i} path={p} count={26} speed={18} size={0.45} color="#facc15" />)}
      {mode === 'mb-bus' && (
        <>
          <EnergyFlow path={BUS.ram} count={24} speed={22} size={0.32} color="#c4b5fd" />
          <EnergyFlow path={BUS.ram2} count={24} speed={22} size={0.32} color="#c4b5fd" />
          <EnergyFlow path={BUS.pcie} count={30} speed={24} size={0.32} color="#86efac" />
          <EnergyFlow path={BUS.m2} count={16} speed={16} size={0.32} color="#fdba74" />
          <EnergyFlow path={BUS.dmi} count={14} speed={14} size={0.32} color="#7dd3fc" />
          <EnergyFlow path={BUS.sata} count={8} speed={6} size={0.28} color="#f9a8d4" />
          <EnergyFlow path={BUS.usb} count={14} speed={8} size={0.28} color="#93c5fd" />
          <EnergyFlow path={BUS.audio} count={10} speed={6} size={0.28} color="#fde68a" />
          <Lbl pos={pc(DIMMS[2], 41, MBZ + 2)} sub color="#c4b5fd">
            do pamięci RAM
          </Lbl>
          <Lbl pos={pc(PCIE.x0 + 2, PCIE.y - 1.6, MBZ + 2)} sub color="#86efac">
            PCIe x16 do karty graficznej
          </Lbl>
          <Lbl pos={pc(M2.x0 + 1, M2.y + 2, MBZ + 2)} sub color="#fdba74">
            PCIe x4 do dysku M.2
          </Lbl>
          <Lbl pos={pc(CHIPSET.x + 3, CHIPSET.y + 3, MBZ + 2)} sub color="#7dd3fc">
            DMI do chipsetu
          </Lbl>
          <Lbl pos={pc(-22, 30, 4)} sub color="#93c5fd">
            USB
          </Lbl>
          <Lbl pos={pc(SATA.x + 1, SATA.y - 3, MBZ + 1)} sub color="#f9a8d4">
            SATA
          </Lbl>
        </>
      )}
      {mode === 'mb-boot' && (
        <>
          <EnergyFlow path={BUS.bios} count={14} speed={10} size={0.4} color="#fde68a" rate={on(bootPh === 2)} />
          <EnergyFlow path={BUS.ram} count={20} speed={20} size={0.4} color="#c4b5fd" rate={on(bootPh === 3)} />
          <EnergyFlow path={BUS.pcie} count={20} speed={20} size={0.4} color="#86efac" rate={on(bootPh === 3)} />
          <EnergyFlow path={[...BUS.m2].reverse()} count={20} speed={16} size={0.4} color="#fdba74" rate={on(bootPh === 4)} />
        </>
      )}
      {mode === 'tour-key' && (
        <>
          <Lbl pos={[KEYBOARD.x, 86, KEYBOARD.z]} sub color={keyPh === 0 ? '#facc15' : '#e2e8f0'}>
            klawiatura
          </Lbl>
          <Lbl pos={pc(CHIPSET.x, CHIPSET.y - 3, MBZ + 2)} sub color={keyPh === 2 ? '#facc15' : '#e2e8f0'}>
            chipset
          </Lbl>
          <Lbl pos={pc(SOCKET.x - 4, SOCKET.y + 8, 18)} sub color={keyPh === 2 || keyPh === 3 ? '#facc15' : '#e2e8f0'}>
            procesor
          </Lbl>
          <Lbl pos={pc(DIMMS[3] + 2, 41, 6)} sub color={keyPh === 3 ? '#facc15' : '#e2e8f0'}>
            RAM
          </Lbl>
          <Lbl pos={pc(4, GPU.y - 7, 12)} sub color={keyPh === 4 ? '#facc15' : '#e2e8f0'}>
            karta graficzna
          </Lbl>
          <Lbl pos={[MONITOR.x, MONITOR.y0 + MONITOR.h + 5, MONITOR.z]} sub color={keyPh === 5 ? '#facc15' : '#e2e8f0'}>
            monitor
          </Lbl>
        </>
      )}
      {mode === 'explode' &&
        exP &&
        exLabels.map(([p, s]) => (
          <Lbl key={s} pos={p} sub color="#e2e8f0">
            {s}
          </Lbl>
        ))}
      {mode === 'ob-air' && (
        <>
          <Lbl pos={pc(CASE.x1 + 6, FANS_FRONT[1], 11)} sub color="#7dd3fc">
            chłodne powietrze
          </Lbl>
          <Lbl pos={pc(CASE.x0 - 10, FAN_REAR.y + 4, 11)} sub color="#fca5a5">
            ciepłe powietrze
          </Lbl>
        </>
      )}
      {mode === 'ob-power' && (
        <>
          <Lbl pos={pc(ATX24.x + 2, ATX24.y + 4, 8)} sub color="#fde68a">
            24-pin do płyty
          </Lbl>
          <Lbl pos={pc(EPS.x, EPS.y + 2.5, 4)} sub color="#fde68a">
            8-pin do procesora
          </Lbl>
          <Lbl pos={pc(GPU.x1 - 13, GPU.y + 1.5, GPU.z1 + 2.5)} sub color="#fde68a">
            16-pin do karty
          </Lbl>
          <Lbl pos={pc(HDD.x0 + 4, HDD.y1 + 2, 6)} sub color="#fde68a">
            SATA do dysku
          </Lbl>
        </>
      )}
      {mode === 'mb-boot' && bootPh === 0 && (
        <mesh position={pc(19.5, CASE.y1 + 1.4, CASE.z1 / 2)}>
          <sphereGeometry args={[1.1, 16, 12]} />
          <meshBasicMaterial color="#facc15" toneMapped={false} />
        </mesh>
      )}

      {/* pracownie */}
      {lab === 'psu' && <PsuLab p={LAB.psu} spin={spin} labels />}
      {lab === 'pcb' && <PcbLab p={LAB.pcb} />}
      {lab === 'cpuCut' && <CpuCutLab p={LAB.cpuCut} lift={() => st.current.lift} />}
      {lab === 'die' && <DieLab p={LAB.die} />}
      {lab === 'fin' && <FinLab p={LAB.fin} gate={() => st.current.gate} />}
      {lab === 'pipe' && <PipeLab p={LAB.pipe} tick={() => st.current.tick} />}
      {lab === 'cool' && <CoolLab p={LAB.cool} fan={() => st.current.fan} />}
      {lab === 'mem' && <MemLab p={LAB.mem} spin={() => 4} />}
      {lab === 'dram' && <DramLab p={LAB.dram} t={() => tAll.current % 16} />}
      {lab === 'nand' && <NandLab p={LAB.nand} />}
      {lab === 'ssd' && <SsdLab p={LAB.ssd} />}
      {lab === 'hdd' && <HddLab p={LAB.hdd} spin={() => 9} />}
      {lab === 'pyr' && <PyrLab p={LAB.pyr} />}
      {lab === 'gpu' && <GpuLab p={LAB.gpu} spin={spin} ex={() => st.current.gex} />}
      {lab === 'raster' && <RasterLab p={LAB.raster} />}
      {lab === 'cores' && <CoresLab p={LAB.cores} />}
      {lab === 'lcd' && <LcdLab p={LAB.lcd} />}
      {lab === 'kbd' && <KbdLab p={LAB.kbd} />}
      {lab === 'key' && <KeyLab p={LAB.key} press={() => st.current.press} />}
      {lab === 'mouse' && <MouseLab p={LAB.mouse} />}
      {lab === 'ports' && <PortsLab p={LAB.ports} />}
      {lab === 'tube' && <TubeLab p={LAB.tube} on={() => 1} />}
      {lab === 'crt' && <CrtLab p={LAB.crt} />}
      {lab === 'media' && <MediaLab p={LAB.media} />}
      {lab === 'moore' && <MooreLab p={LAB.moore} />}
      {lab === 'museum' && <Museum spin={spin} />}

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
