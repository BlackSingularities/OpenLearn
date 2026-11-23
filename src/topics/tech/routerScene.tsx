/*
 * Router Wi-Fi – wspólna scena 3D wszystkich zakładek. Tryb zakładki (params.mode) decyduje, co widać:
 * mieszkanie z routerem (fale, scenariusz pakietu, mapa zasięgu, wiązki, adresy, sieć mesh), zbliżenie na
 * router bez pokrywy albo rozłożony, albo jedną z pracowni z powiększonym eksponatem.
 */
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SceneProps } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { useModuleHome, useTopicNav } from '../../lib/topicNav';
import { PauseContext } from '../../lib/useAnimationClock';
import { Lbl } from '../aviation/airliner';
import { EnergyFlow } from '../energy/windExtras';
import { Box } from './pcMats';
import {
  FIBER_SOCKET,
  LAB,
  LAPTOP,
  MESH_NODES,
  MICROWAVE,
  ONT,
  PATH_AIR_DOWN,
  PATH_AIR_UP,
  PATH_ETH,
  PATH_FIBER,
  PHONE,
  ROUTER,
  ROUTER_MID,
  SPEAKER,
  TV,
  arc,
  rssi,
  rssiWord,
  speedAt,
  type V3,
} from './routerGeo';
import { Apartment, Cables, Devices, Heatmap, MeshNode, Ont, RM, Router, Waves } from './routerParts';
import { ChainLab, CryptLab, DipoleLab, EthLab, FRAME_PARTS, FRAME_X, FiberLab, HOPS, OfdmaLab, PacketLab, QamLab, SAMPLES, SpectrumLab, WallsLab, WaveLab, remain } from './routerLabs';

const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

type LabK = keyof typeof LAB;
/** Tryby pracowni: tryb → eksponat. */
const LAB_OF: Record<string, LabK> = {
  'in-eth': 'eth',
  'fa-wave': 'wave',
  'fa-dipole': 'dipole',
  'fa-walls': 'walls',
  'fa-spec': 'spectrum',
  'da-home': 'packet',
  'da-qam': 'qam',
  'da-ofdma': 'ofdma',
  'ne-home': 'chain',
  'ne-ping': 'chain',
  'ne-fiber': 'fiber',
  'se-home': 'crypt',
};

/* ================= scenariusz ================= */

const TOUR_PH: [number, string][] = [
  [2.5, 'Telefon nadaje prośbę o stronę falami radiowymi'],
  [5, 'Router odbiera pakiet i wpisuje swój adres w miejsce adresu telefonu'],
  [7, 'Kablem sieciowym do modemu światłowodowego'],
  [10, 'Modem zamienia sygnał na błyski światła i wysyła je do operatora'],
  [13.5, 'Serwer z prognozą pogody odsyła stronę tą samą drogą'],
  [99, 'Router nadaje stronę do telefonu – gotowe'],
];
const phaseAt = (list: [number, string][], t: number) => (t < 0 ? -1 : list.findIndex(([e]) => t < e));

/* ================= części do kliknięcia ================= */

interface PartInfo {
  name: string;
  desc: string;
  pos: V3;
  link?: string;
}
const R = (x: number, y: number, z: number): V3 => [ROUTER[0] + x, ROUTER[1] + y, ROUTER[2] + z];
const L = (k: LabK, x: number, y: number, z = 0): V3 => [LAB[k][0] + x, 110 + y, z];

function homeParts(mode: string): Record<string, PartInfo> | null {
  switch (mode) {
    case 'in-home':
      return {
        soc: { name: 'procesor (SoC)', desc: 'Mózg routera: cztery rdzenie po 1,7 GHz w jednym układzie razem z obsługą sieci. Decyduje, dokąd wysłać każdy pakiet – setki tysięcy razy na sekundę. Grzeje się, dlatego ma radiator.', pos: R(0, 7.5, 1.5) },
        ram: { name: 'pamięć RAM', desc: '512 MB pamięci roboczej: tablice adresów, kolejki pakietów czekających na wysłanie, lista podłączonych urządzeń. Po wyłączeniu prądu znika.', pos: R(3.8, 2.6, -0.8) },
        flash: { name: 'pamięć flash', desc: '128 MB pamięci trwałej: oprogramowanie routera i Twoje ustawienia – nazwa sieci, hasło. Zostają po wyłączeniu prądu.', pos: R(4.6, 1.6, 5.2) },
        r24: { name: 'radio 2,4 GHz', desc: 'Układ radiowy pasma 2,4 GHz pod metalowym ekranem. Ekran nie wypuszcza zakłóceń na resztę płytki i nie wpuszcza ich do środka. Fale tego pasma sięgają dalej, ale są wolniejsze.', pos: R(-9.5, 4.8, 4.6) },
        r5: { name: 'radio 5 GHz', desc: 'Drugi układ radiowy – pasmo 5 GHz. Szybsze (szersze kanały), ale gorzej przechodzi przez ściany. Router nadaje w obu pasmach naraz.', pos: R(9.5, 4.8, 4.6) },
        fem: { name: 'wzmacniacze anten', desc: 'Przy każdej antenie mały układ: wzmacnia sygnał przed wysłaniem i bardzo słaby sygnał odebrany – nawet miliardowe części wata.', pos: R(-11.5, 2.2, -6) },
        ant: { name: 'anteny', desc: 'Cztery anteny: router nadaje i odbiera kilkoma naraz (MIMO), dzięki czemu może rozmawiać z kilkoma urządzeniami jednocześnie i kierować sygnał w ich stronę.', pos: R(14.2, 19, 3.5) },
        ports: { name: 'gniazda sieciowe', desc: 'Niebieskie WAN – kabel do modemu, czyli do internetu. Cztery żółte LAN – na kable do komputera, telewizora czy konsoli. Każde do 1 Gb/s.', pos: R(-5.1, 5.6, -8.5) },
        sw: { name: 'przełącznik sieciowy', desc: 'Układ, który łączy pięć gniazd kablowych i przerzuca między nimi pakiety bez angażowania procesora.', pos: R(-4.6, 2.2, -2.8) },
        pwr: { name: 'zasilanie', desc: 'Gniazdo 12 V od zasilacza wtyczkowego. Dławik i kondensatory obniżają napięcie do ok. 1 V dla procesora i 3,3 V dla reszty. Router pobiera ok. 10 W – jak mała żarówka LED.', pos: R(6.5, 2.8, -6) },
        leds: { name: 'diody', desc: 'Pokazują, co się dzieje: zasilanie, internet, praca obu pasm radiowych i gniazd. Miganie oznacza, że płyną dane.', pos: R(-1, 1.6, 9.2) },
      };
    case 'fa-home':
      return {
        ant: { name: 'anteny routera', desc: 'Prądy w antenach drgają 2,4 albo 5 miliardów razy na sekundę i wypromieniowują fale radiowe – takie jak radio czy telefon komórkowy, tylko o wiele krótsze.', pos: [ROUTER[0], ROUTER[1] + 26, ROUTER[2]] },
        wave: { name: 'fala radiowa', desc: 'Fala rozchodzi się we wszystkie strony z prędkością światła – przez całe mieszkanie w 30 miliardowych częściach sekundy. Im dalej, tym słabsza.', pos: [-150, 100, -140] },
        wall: { name: 'ściana nośna', desc: 'Żelbet z prętami stalowymi zatrzymuje większość fali – zwłaszcza pasma 5 GHz. To najczęstszy powód słabego Wi-Fi w drugim pokoju.', pos: [60, 128, -230] },
        mw: { name: 'mikrofalówka', desc: 'Grzeje jedzenie falami 2,45 GHz – w środku pasma Wi-Fi. Jej ekran przepuszcza odrobinę promieniowania, a to wystarczy, żeby zagłuszyć Wi-Fi 2,4 GHz w kuchni.', pos: [MICROWAVE[0], MICROWAVE[1] + 36, MICROWAVE[2]] },
        phone: { name: 'telefon', desc: 'Też ma anteny i nadaje z powrotem do routera – słabiej, bo musi oszczędzać baterię. Zasięg sieci zależy więc i od routera, i od najsłabszego urządzenia.', pos: [PHONE[0], PHONE[1] + 18, PHONE[2]] },
      };
    case 'da-home':
      return Object.fromEntries(
        FRAME_PARTS.map(([k, name], i) => [
          k,
          {
            name,
            desc: {
              pre: 'Ustalony wzór bitów na początek. Odbiornik „łapie” po nim rytm i siłę sygnału – jak „raz, dwa, trzy” przed piosenką.',
              mac: 'Adresy sprzętowe (MAC) w sieci domowej: komu w pokoju przekazać ramkę i od kogo jest. Każda karta Wi-Fi ma swój numer.',
              ip: 'Adresy w internecie: komputer, do którego pakiet ma dotrzeć na końcu świata, i adres nadawcy, żeby wiedział, komu odpowiedzieć.',
              tcp: 'Numer „okienka” w serwerze (port 443 – strony internetowe) i numer kolejny. Dzięki numerom strona złoży się w dobrej kolejności, a zgubione kawałki zostaną wysłane jeszcze raz.',
              data: 'Właściwa treść: tu prośba o stronę z pogodą. Zwykle jest zaszyfrowana – czyta ją tylko serwer.',
              fcs: 'Liczba wyliczona ze wszystkich bitów ramki. Odbiorca liczy ją jeszcze raz – jeśli wyjdzie inna, ramka uszkodziła się po drodze i trzeba ją powtórzyć.',
            }[k] as string,
            pos: L('packet', FRAME_X[i], 9),
          },
        ]),
      );
    case 'ne-home':
      return Object.fromEntries(
        HOPS.map(([x, name], i) => [
          'h' + i,
          {
            name,
            desc: [
              'Twój router: zbiera pakiety ze wszystkich urządzeń w domu i wysyła je jednym łączem do operatora.',
              'Na klatce schodowej albo przy ulicy: tu światłowód z mieszkania łączy się z grubszym kablem, w którym biegną setki włókien do wielu domów.',
              'Budynek operatora z szafami pełnymi przełączników i routerów. Stąd ruch z całej dzielnicy płynie dalej.',
              'Miejsce, w którym sieci różnych operatorów i firm łączą się ze sobą (w Polsce np. w Warszawie). Bez tego internet byłby wieloma osobnymi sieciami.',
              'Na dnie oceanów leżą światłowody między kontynentami – ponad 1,4 mln km kabli. Przez nie płynie prawie cały ruch między Europą a Ameryką.',
              'Hala z tysiącami serwerów – tu „mieszkają” strony, filmy i aplikacje. Serwer odsyła odpowiedź tą samą drogą.',
            ][i],
            pos: L('chain', x, 24),
          },
        ]),
      );
    case 'se-home':
      return {
        phone: { name: 'telefon', desc: 'Przy pierwszym połączeniu telefon i router sprawdzają, czy znają to samo hasło – bez wysyłania samego hasła. Potem ustalają wspólny klucz, którym szyfrują każdy pakiet.', pos: L('crypt', -60, 20) },
        router: { name: 'router', desc: 'Zna klucz każdego podłączonego urządzenia i odszyfrowuje ich pakiety. Każde urządzenie ma inny klucz, więc nawet domownicy nie czytają nawzajem swoich danych.', pos: L('crypt', 60, 34) },
        air: { name: 'fale w powietrzu', desc: 'Fale radiowe wychodzą za ściany – sąsiad czy ktoś na ulicy może je odebrać. Dlatego wszystko, co leci w powietrzu, musi być zaszyfrowane.', pos: L('crypt', 0, 28) },
        nb: { name: 'laptop sąsiada', desc: 'Odbiera te same fale. Bez klucza widzi tylko przypadkowe znaki – złamanie szyfru WPA3 zajęłoby dłużej, niż istnieje wszechświat. Słabe, krótkie hasło da się jednak zgadnąć.', pos: L('crypt', 30, 10, 34) },
      };
  }
  return null;
}

function homeLinks(): Record<string, PartInfo> {
  return {
    in: { name: 'router od środka', desc: '', pos: [ROUTER[0], ROUTER[1] + 30, ROUTER[2]], link: 'wnetrze' },
    fa: { name: 'fale radiowe', desc: '', pos: [-180, 140, -150], link: 'fale' },
    da: { name: 'bity w powietrzu', desc: '', pos: [PHONE[0], PHONE[1] + 30, PHONE[2]], link: 'dane' },
    ne: { name: 'internet za routerem', desc: '', pos: [FIBER_SOCKET[0] - 30, 110, FIBER_SOCKET[2] + 10], link: 'internet' },
    se: { name: 'bezpieczna sieć w domu', desc: '', pos: [LAPTOP[0], LAPTOP[1] + 40, LAPTOP[2]], link: 'siec' },
  };
}

/* ================= ramki ================= */

const PART_C = '#facc15';
const PHASE_C = '#5eead4';
function Rows({ list }: { list: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: 13 }}>
      {list.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <div style={{ opacity: 0.75 }}>{k}</div>
          <div>{v}</div>
        </div>
      ))}
    </div>
  );
}
const DEVICES: [string, V3][] = [
  ['telefon na kanapie', PHONE],
  ['laptop w sypialni', LAPTOP],
  ['telewizor', TV],
  ['głośnik w kuchni', SPEAKER],
];

/** Wiązka: wydłużony stożek od anteny do urządzenia. */
function Beam({ a, b, color }: { a: V3; b: V3; color: string }) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const m = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }), [color]);
  return (
    <mesh position={mid} quaternion={q} material={m}>
      <cylinderGeometry args={[len * 0.09, 2, len, 24, 1, true]} />
    </mesh>
  );
}

/* ================= scena ================= */

export function RouterScene({ params }: SceneProps) {
  const mode = str(params.mode, 'home');
  const run = Boolean(params.run);
  const band: 0 | 1 = str(params.band, '5') === '24' ? 0 : 1;
  const mid = str(params.place, 'kat') === 'srodek';
  const exP = Boolean(params.ex);
  const bf = Boolean(params.bf);
  const enc = Boolean(params.enc);
  const ofd = Boolean(params.ofdma);
  const meshOn = Boolean(params.mesh);
  const order = Number(str(params.qam, '256'));
  const noise = num(params.noise, 20) / 100;
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
  const st = useRef({ ex: 0 });
  const [phase, setPhase] = useState(-1);
  const [err, setErr] = useState(0);
  useEffect(() => {
    tRun.current = run ? 0 : -1;
  }, [run, mode]);
  useFrame((_, dt0) => {
    const dt = paused ? 0 : Math.min(dt0, 0.05);
    if (tRun.current >= 0) tRun.current += dt;
    st.current.ex += ((mode === 'in-ex' && exP ? 1 : 0) - st.current.ex) * Math.min(1, dt * 2.2);
    const ph = mode === 'tour' ? phaseAt(TOUR_PH, tRun.current) : -1;
    if (ph !== phase) setPhase(ph);
  });

  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [mode]);
  const parts = home ? homeParts(mode) : null;
  const links = mode === 'home' && home ? homeLinks() : null;
  const lab = LAB_OF[mode];
  const on = (c: boolean) => () => (c ? 1 : 0);
  const tp = mode === 'tour' ? phase : -1;

  // gdzie stoi router i skąd nadaje
  const routerAt: V3 = mode === 'cover' && mid ? ROUTER_MID : ROUTER;
  const tx: V3[] = mode === 'se-mesh' && meshOn ? [ROUTER, ...MESH_NODES] : [routerAt];
  const heat = mode === 'cover' || mode === 'se-mesh';
  const heatBand: 0 | 1 = mode === 'se-mesh' ? 1 : band;

  let info: ReactNode = null;
  if (mode === 'home')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Ten router</div>
        <Rows
          list={[
            ['standard', 'Wi-Fi 6 (802.11ax)'],
            ['pasmo 2,4 GHz', 'do 574 Mb/s'],
            ['pasmo 5 GHz', 'do 2402 Mb/s'],
            ['anteny', '4, nadają i odbierają naraz'],
            ['procesor', '4 rdzenie, 1,7 GHz'],
            ['gniazda', 'WAN + 4 × LAN, 1 Gb/s'],
            ['pobór mocy', 'ok. 10 W'],
          ]}
        />
      </>
    );
  else if (mode === 'tour')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PHASE_C }}>{run ? (phase >= 0 ? TOUR_PH[phase][1] : 'Start') : 'Naciśnij „Rozpocznij”'}</div>
        {TOUR_PH.map(([, s], i) => (
          <div key={i} style={{ fontSize: 13, opacity: i === phase ? 1 : i < phase ? 0.75 : 0.45, fontWeight: i === phase ? 700 : 400 }}>
            {i < phase ? '✓' : i === phase ? '▸' : '·'} {s}
          </div>
        ))}
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>W rzeczywistości cała droga tam i z powrotem trwa ok. 20–40 milisekund.</div>
      </>
    );
  else if (heat) {
    const best = (p: V3) => Math.max(...tx.map((t) => rssi(t, p[0], p[2], heatBand, mode === 'cover' && heatBand === 0)));
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>{`Sygnał ${heatBand ? '5 GHz' : '2,4 GHz'}${mode === 'se-mesh' ? (meshOn ? ' – z siecią mesh' : ' – sam router') : ''}`}</div>
        <Rows list={DEVICES.map(([name, p]) => [name, `${Math.round(best(p))} dBm – ${rssiWord(best(p))}, ok. ${speedAt(best(p), heatBand)} Mb/s`] as [string, string])} />
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>dBm – miara mocy sygnału: −40 to bardzo mocny, −80 to granica zasięgu. Zielony – świetnie, żółty – w sam raz, czerwony – słabo.</div>
      </>
    );
  } else if (mode === 'fa-walls')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>{`Ile mocy przechodzi – ${band ? '5 GHz' : '2,4 GHz'}`}</div>
        <Rows list={SAMPLES.map(([n, , , a, b]) => [n, `${remain(band ? b : a).toLocaleString('pl-PL')}% (−${band ? b : a} dB)`] as [string, string])} />
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Każde −3 dB to połowa mocy, −10 dB to dziesięć razy mniej.</div>
      </>
    );
  else if (mode === 'da-qam') {
    const bits = Math.log2(order);
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>{`${order}-QAM`}</div>
        <Rows
          list={[
            ['bitów w jednym symbolu', `${bits}`],
            ['błędnie odczytane', `${Math.round(err * 1000) / 10}%`],
            ['prędkość (kanał 80 MHz, 2 anteny)', `ok. ${Math.round((1201 * bits) / 10 * (1 - Math.min(1, err * 3)))} Mb/s`],
          ]}
        />
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{err > 0.02 ? 'Za dużo błędów – router sam przejdzie na rzadszą mapę punktów, wolniejszą, ale pewniejszą.' : 'Punkty są daleko od siebie – odbiornik się nie myli.'}</div>
      </>
    );
  } else if (mode === 'ne-nat')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Tablica tłumaczenia adresów (NAT)</div>
        <Rows
          list={[
            ['telefon 192.168.1.23', '→ 83.24.117.9 : 40001'],
            ['laptop 192.168.1.10', '→ 83.24.117.9 : 40002'],
            ['telewizor 192.168.1.40', '→ 83.24.117.9 : 40003'],
            ['głośnik 192.168.1.55', '→ 83.24.117.9 : 40004'],
          ]}
        />
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Wszystkie urządzenia w domu wychodzą do internetu pod jednym adresem routera. Router pamięta, który numer należy do kogo, i odpowiedź oddaje właściwemu urządzeniu.</div>
      </>
    );
  else if (mode === 'ne-ping')
    info = (
      <>
        <div style={{ fontWeight: 700, color: PART_C }}>Czas tam i z powrotem (ping)</div>
        <Rows
          list={[
            ['telefon ↔ router (Wi-Fi)', '2–5 ms'],
            ['do serwera w Warszawie', 'ok. 10 ms'],
            ['do Frankfurtu (900 km)', 'ok. 25 ms'],
            ['do Nowego Jorku (6900 km)', 'ok. 95 ms'],
            ['do Sydney (15 900 km)', 'ok. 280 ms'],
          ]}
        />
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Światło w szkle biegnie ok. 200 000 km/s – 1000 km w 5 ms. Resztę czasu zabierają routery po drodze i kable, które nie biegną prosto.</div>
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

  const ANT: V3 = [routerAt[0], routerAt[1] + 14, routerAt[2]];
  const r = RM();
  const exLabels: [V3, string][] = [
    [R(0, 22, 0), 'pokrywa'],
    [R(0, 14, 5), 'radiator procesora'],
    [R(-8, 9, 6), 'ekrany układów radiowych'],
    [R(-14, 4, 8), 'płytka drukowana'],
    [R(-26, 12, -3), 'anteny'],
    [R(9, -1, 9), 'podstawa'],
  ];

  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#f3f1ea', '#5b5245', 0.7]} />
      <directionalLight position={[400, 900, 600]} intensity={1.6} color="#fff4e2" />
      <directionalLight position={[-500, 400, 400]} intensity={0.45} color="#cfe0ff" />

      <Apartment />
      <Ont />
      <Cables />
      <Devices page={mode !== 'tour' || tp === 5} />
      <group position={routerAt}>
        <Router cover={mode !== 'in-home'} ex={() => st.current.ex} />
      </group>
      {mode === 'cover' && mid && <Box p={[ROUTER_MID[0], ROUTER_MID[1] - 2, ROUTER_MID[2]]} s={[30, 4, 34]} m={r.woodLight} />}

      {/* fale */}
      {(mode === 'home' || mode === 'fa-home') && <Waves p={ANT} />}
      {mode === 'fa-home' && <Waves p={[MICROWAVE[0], MICROWAVE[1] + 14, MICROWAVE[2]]} color="#f87171" reach={160} count={3} speed={90} />}
      {mode === 'da-mimo' &&
        (bf ? (
          <>
            <Beam a={ANT} b={[PHONE[0], PHONE[1] + 4, PHONE[2]]} color="#2dd4bf" />
            <Beam a={ANT} b={[LAPTOP[0], LAPTOP[1] + 10, LAPTOP[2]]} color="#f472b6" />
            <Beam a={ANT} b={[TV[0] + 4, TV[1], TV[2]]} color="#fbbf24" />
          </>
        ) : (
          <Waves p={ANT} />
        ))}
      {mode === 'da-mimo' && (
        <>
          <Lbl pos={[PHONE[0], PHONE[1] + 22, PHONE[2]]} sub color="#5eead4">
            telefon
          </Lbl>
          <Lbl pos={[LAPTOP[0], LAPTOP[1] + 34, LAPTOP[2]]} sub color="#f9a8d4">
            laptop
          </Lbl>
          <Lbl pos={[TV[0] + 10, TV[1] + 44, TV[2]]} sub color="#fde68a">
            telewizor
          </Lbl>
        </>
      )}
      {heat && <Heatmap tx={tx} band={heatBand} microwave={mode === 'cover'} />}
      {mode === 'se-mesh' && meshOn && (
        <>
          {MESH_NODES.map((p, i) => (
            <MeshNode key={i} p={p} />
          ))}
          <EnergyFlow path={arc(ANT, [MESH_NODES[0][0], MESH_NODES[0][1] + 14, MESH_NODES[0][2]], 50)} count={14} speed={120} size={2.2} color="#e2e8f0" />
          <EnergyFlow path={arc(ANT, [MESH_NODES[1][0], MESH_NODES[1][1] + 14, MESH_NODES[1][2]], 50)} count={14} speed={120} size={2.2} color="#e2e8f0" />
          {MESH_NODES.map((p, i) => (
            <Lbl key={'l' + i} pos={[p[0], p[1] + 30, p[2]]} sub color="#e2e8f0">
              węzeł mesh
            </Lbl>
          ))}
        </>
      )}
      {heat && (
        <Lbl pos={[routerAt[0], routerAt[1] + 30, routerAt[2]]} sub color="#5eead4">
          router
        </Lbl>
      )}

      {/* scenariusz: od telefonu do strony */}
      {mode === 'tour' && (
        <>
          <EnergyFlow path={PATH_AIR_UP} count={14} speed={160} size={2.6} color="#7dd3fc" rate={on(tp === 0)} />
          <EnergyFlow path={PATH_ETH} count={10} speed={40} size={1.4} color="#fde68a" rate={on(tp === 2)} />
          <EnergyFlow path={PATH_FIBER} count={24} speed={260} size={2} color="#bbf7d0" rate={on(tp === 3)} />
          <EnergyFlow path={[...PATH_FIBER].reverse()} count={24} speed={260} size={2} color="#fbbf24" rate={on(tp === 4)} />
          <EnergyFlow path={[...PATH_ETH].reverse()} count={10} speed={40} size={1.4} color="#fbbf24" rate={on(tp === 4)} />
          <EnergyFlow path={PATH_AIR_DOWN} count={14} speed={160} size={2.6} color="#fbbf24" rate={on(tp === 5)} />
          {tp === 1 && <Waves p={ANT} color="#fde68a" reach={60} count={2} speed={80} />}
          <Lbl pos={[PHONE[0], PHONE[1] + 22, PHONE[2]]} sub color={tp === 0 || tp === 5 ? PART_C : '#e2e8f0'}>
            telefon
          </Lbl>
          <Lbl pos={[ROUTER[0], ROUTER[1] + 30, ROUTER[2]]} sub color={tp === 1 ? PART_C : '#e2e8f0'}>
            router
          </Lbl>
          <Lbl pos={[ONT[0] - 4, ONT[1] + 24, ONT[2]]} sub color={tp === 2 || tp === 3 ? PART_C : '#e2e8f0'}>
            modem światłowodowy
          </Lbl>
          <Lbl pos={[FIBER_SOCKET[0], 30, -460]} sub color={tp === 3 || tp === 4 ? PART_C : '#e2e8f0'}>
            światłowód do operatora
          </Lbl>
        </>
      )}

      {/* adresy w sieci domowej */}
      {mode === 'ne-nat' && (
        <>
          {DEVICES.map(([, p], i) => (
            <EnergyFlow key={i} path={arc([p[0], p[1] + 10, p[2]], ANT, 50)} count={8} speed={140} size={2} color={['#2dd4bf', '#f472b6', '#fbbf24', '#60a5fa'][i]} />
          ))}
          <EnergyFlow path={PATH_FIBER} count={20} speed={220} size={2} color="#bbf7d0" />
          {(
            [
              [PHONE, 'telefon 192.168.1.23', 22],
              [LAPTOP, 'laptop 192.168.1.10', 36],
              [TV, 'telewizor 192.168.1.40', 46],
              [SPEAKER, 'głośnik 192.168.1.55', 30],
            ] as [V3, string, number][]
          ).map(([p, s, dy]) => (
            <Lbl key={s} pos={[p[0] + (p === TV ? 12 : 0), p[1] + dy, p[2]]} sub color="#e2e8f0">
              {s}
            </Lbl>
          ))}
          <Lbl pos={[ROUTER[0], ROUTER[1] + 34, ROUTER[2]]} sub color={PART_C}>
            router: w domu 192.168.1.1, w internecie 83.24.117.9
          </Lbl>
        </>
      )}

      {/* widok rozłożony */}
      {mode === 'in-ex' &&
        exP &&
        exLabels.map(([p, s]) => (
          <Lbl key={s} pos={p} sub color="#e2e8f0">
            {s}
          </Lbl>
        ))}

      {/* pracownie */}
      {lab === 'eth' && <EthLab p={LAB.eth} />}
      {lab === 'wave' && <WaveLab p={LAB.wave} />}
      {lab === 'dipole' && <DipoleLab p={LAB.dipole} />}
      {lab === 'walls' && <WallsLab p={LAB.walls} band={band} />}
      {lab === 'spectrum' && <SpectrumLab p={LAB.spectrum} />}
      {lab === 'packet' && <PacketLab p={LAB.packet} />}
      {lab === 'qam' && <QamLab p={LAB.qam} order={order} noise={noise} onErr={(e) => Math.abs(e - err) > 0.004 && setErr(e)} />}
      {lab === 'ofdma' && <OfdmaLab p={LAB.ofdma} on={ofd} />}
      {lab === 'chain' && <ChainLab p={LAB.chain} both={mode === 'ne-ping'} />}
      {lab === 'fiber' && <FiberLab p={LAB.fiber} />}
      {lab === 'crypt' && <CryptLab p={LAB.crypt} on={enc} />}
      {mode === 'ne-ping' && (
        <>
          <Lbl pos={L('chain', -110, 48)} sub color="#bbf7d0">
            pytanie →
          </Lbl>
          <Lbl pos={L('chain', 100, 48)} sub color="#fde68a">
            ← odpowiedź
          </Lbl>
        </>
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
