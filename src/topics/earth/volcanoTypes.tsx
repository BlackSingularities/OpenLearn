/*
 * Wulkan – moduł „Rodzaje wulkanów”: podpisy części każdego rodzaju (klikalne na każdej zakładce), karta z liczbami
 * i szczegóły widoczne tylko przy danym rodzaju (jezioro lawy, zarys dawnego szczytu kaldery).
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { CAL_CONE, CAL_R, FISSURE_CONES, PARASITE, iceH, rockH, type VType } from './volcanoGeo';

type V3 = [number, number, number];
export interface TypePart {
  name: string;
  desc: string;
  pos: V3;
}

const h = (t: VType, x: number, z: number, up = 1.5): V3 => [x, rockH(t, x, z) + up, z];
/** Podpis na ścianie przekroju (tuż przed nią). */
const sec = (x: number, y: number): V3 => [x, y, 0.3];

/** Podpisy części dla każdego rodzaju wulkanu. */
export function typeLabels(t: VType): Record<string, TypePart> {
  switch (t) {
    case 'strato': {
      const top = rockH('strato', 0, 0);
      return {
        crater: { name: 'krater', desc: 'Zagłębienie na szczycie, w którym kończy się komin. Jego kształt zmienia się po każdej erupcji – wybuchy go poszerzają, a zastygła lawa potrafi go wypełnić.', pos: [0, top + 2.5, -1] },
        snow: { name: 'czapa śnieżna', desc: 'Wysokie stratowulkany sięgają ponad granicę wiecznego śniegu. Śnieg i lodowce na szczycie są groźne: gorąca erupcja topi je w kilka minut, a woda z popiołem spływa jako lahar.', pos: [-9, 17.5, -4] },
        slopes: { name: 'strome, wklęsłe zbocza', desc: 'Gęsta lawa nie spływa daleko, a popiół i okruchy spadają blisko krateru. Dlatego stratowulkan jest stromy, a zbocza są coraz bardziej strome ku szczytowi – to rozpoznawczy kształt Fudżi.', pos: h('strato', -15, -6) },
        layers: { name: 'warstwy lawy i popiołu', desc: 'Stąd nazwa „wulkan warstwowy”: ciemne pasy to zastygła lawa, jasne – popiół i okruchy z wybuchów. Każda erupcja dokłada nową warstwę.', pos: sec(-12, 9) },
        parasite: { name: 'stożek pasożytniczy', desc: 'Mały stożek na zboczu, zasilany boczną żyłą magmy (widać ją w przekroju). Etna ma ich ponad 300.', pos: [PARASITE[0], rockH('strato', PARASITE[0], PARASITE[1]) + 2, PARASITE[1]] },
        chamber: { name: 'komora magmowa', desc: 'Kilka kilometrów pod szczytem. Magma stratowulkanów jest gęsta i bogata w gaz – dlatego ich erupcje bywają gwałtowne.', pos: sec(7, -24) },
        foot: { name: 'podnóże', desc: 'Stratowulkan ma u podstawy zwykle 10–30 km średnicy. Na żyznych zboczach i u podnóża leżą pola, sady i wsie.', pos: h('strato', -34, -18, 2) },
      };
    }
    case 'shield': {
      const top = rockH('shield', 0, 0);
      return {
        caldera: { name: 'kaldera szczytowa', desc: 'Płaskie, zapadnięte dno na szczycie wulkanu tarczowego. Powstaje, gdy magma odpływa spod szczytu, np. do erupcji na zboczu. W 2018 r. dno kaldery Kīlauei zapadło się o ok. 500 m.', pos: [-7, top + 3.2, -8] },
        lake: { name: 'jezioro lawy', desc: 'W kraterze na dnie kaldery może przez lata stać jezioro roztopionej lawy, przykryte cienką, pękającą skórką. Takie jezioro miała Kīlauea w kraterze Halemaʻumaʻu.', pos: [LAVA_LAKE[0] + 2, top + 1.2, LAVA_LAKE[1]] },
        rift: { name: 'strefa ryftowa', desc: 'Pas szczelin biegnący od szczytu w dół zbocza. Magma wciska się w niego z komory i wylewa się wiele kilometrów od kaldery – tak zaczyna się wiele erupcji na Hawajach.', pos: h('shield', 17, -10.5) },
        flows: { name: 'potoki lawy', desc: 'Ciemne pasy to młode potoki lawy, jaśniejsze i porośnięte – starsze. Cały wulkan zbudowany jest z tysięcy takich potoków, każdy gruby na kilka metrów.', pos: h('shield', -30, -30, 1.8) },
        slope: { name: 'łagodne zbocza (2–10°)', desc: 'Rzadka lawa bazaltowa spływa daleko, zanim zastygnie, więc wulkan rośnie bardziej wszerz niż w górę. Po zboczu Mauna Loa można by jechać rowerem – jest mniej strome niż wiele ulic.', pos: h('shield', 42, -10, 2) },
        layers: { name: 'cienkie warstwy bazaltu', desc: 'W przekroju wulkan tarczowy to stos setek cienkich, płaskich pokładów lawy – bez warstw popiołu, bo erupcje prawie nie są wybuchowe.', pos: sec(-28, 4) },
        chamber: { name: 'płytka komora magmowa', desc: 'Pod Kīlaueą komora leży tylko 1–3 km pod szczytem, a zasila ją magma z plamy gorąca w płaszczu.', pos: sec(12, -12) },
        dike: { name: 'żyły zasilające ryft', desc: 'Z komory odchodzą skośne żyły, którymi magma płynie pod strefy ryftowe.', pos: sec(20, -2) },
      };
    }
    case 'cinder': {
      const top = rockH('cinder', 3, 0);
      return {
        crater: { name: 'duży krater', desc: 'Krater stożka żużlowego jest szeroki w stosunku do całej góry – to po prostu otwór, wokół którego spadały okruchy.', pos: [0, top + 2.5, -1.5] },
        slope: { name: 'zbocze z żużla (ok. 33°)', desc: 'Luźne okruchy układają się pod kątem ok. 33° – tak jak piasek w klepsydrze albo sterta żwiru. Zbocze jest proste, bez wklęsłości.', pos: h('cinder', -7, -3, 1.2) },
        aa: { name: 'pole lawy aa', desc: 'Pod koniec życia stożka lawa często wypływa u jego podnóża – czasem rozrywając bok stożka. Na zdjęciach Parícutin widać pole lawy, z którego wystaje tylko wieża kościoła.', pos: h('cinder', 20, -24, 1.2) },
        layers: { name: 'warstwy żużla', desc: 'Stożek rośnie warstwami równoległymi do zbocza – każdy wybuch dosypuje nową porcję okruchów.', pos: sec(-6, 3) },
        feeder: { name: 'wąski kanał magmy', desc: 'Stożki żużlowe nie mają dużej, płytkiej komory. Zasila je wąska żyła magmy z dużej głębokości – gdy się wyczerpie, stożek gaśnie na zawsze.', pos: sec(1.5, -14) },
      };
    }
    case 'dome': {
      return {
        dome: { name: 'kopuła z gęstej lawy', desc: 'Lawa jest tak lepka, że nie spływa, tylko piętrzy się nad otworem jak pasta wyciśnięta z tubki. Kopuła rośnie od środka i rozpycha się na boki.', pos: [-3, 7.2, -3] },
        spine: { name: 'iglica', desc: 'Słup prawie zastygłej lawy wyciśnięty ponad kopułę. Iglica na Mont Pelée w 1903 r. miała ok. 300 m wysokości i rosła nawet o 10 m na dobę, a potem się rozpadła.', pos: [1.2, 9.8, -0.8] },
        talus: { name: 'piarg z odłamków', desc: 'Z boków kopuły co chwilę odpadają bloki – często jeszcze żarzące się. Zsypują się i tworzą stożek gruzu u podnóża.', pos: h('dome', -10, -6, 1.2) },
        core: { name: 'gęsta magma w kominie', desc: 'Magma dacytowa albo ryolitowa straciła po drodze większość gazu, więc nie wybucha, tylko się wyciska. Gdy jednak gaz zostanie uwięziony, kopuła może eksplodować.', pos: sec(2, -5) },
        chamber: { name: 'komora magmowa', desc: 'Kopuły rosną często w kraterach stratowulkanów po dużej erupcji, z resztek gęstej magmy z komory.', pos: sec(6, -22) },
      };
    }
    case 'caldera': {
      return {
        lake: { name: 'jezioro kalderowe', desc: 'Kaldera Crater Lake wypełniła się deszczem i śniegiem – nie płynie do niej żadna rzeka. Jezioro ma 594 m głębokości, najwięcej w USA.', pos: [-8, 6.2, -6] },
        cone: { name: 'nowy stożek (Wizard Island)', desc: 'Po zapadnięciu się szczytu wulkan jeszcze przez kilkaset lat wybuchał na dnie kaldery. Z wody wystaje młody stożek żużlowy.', pos: [CAL_CONE[0], rockH('caldera', CAL_CONE[0], CAL_CONE[1]) + 2, CAL_CONE[1]] },
        walls: { name: 'strome ściany kaldery', desc: 'Pionowe urwiska wysokie na kilkaset metrów. Widać w nich warstwy dawnego stratowulkanu – jak w przekroju.', pos: h('caldera', -16.5, -6, 2) },
        ghost: { name: 'dawny szczyt', desc: 'Przerywana linia pokazuje, jak wysoki był wulkan Mazama przed erupcją ok. 7700 lat temu – ok. 3,7 km. Erupcja wyrzuciła ok. 50 km³ magmy, a pusty szczyt zapadł się do komory.', pos: sec(0, 31) },
        faults: { name: 'uskoki pierścieniowe', desc: 'Szczyt nie wyleciał w powietrze – zapadł się jak tłok w cylindrze, wzdłuż kolistych pęknięć sięgających komory magmowej.', pos: sec(-15, -7) },
        fill: { name: 'gruz na dnie kaldery', desc: 'Dno kaldery pokrywają skały, które osunęły się ze ścian, i osady jeziorne.', pos: sec(-6, -1) },
        chamber: { name: 'opróżniona komora', desc: 'Po wielkiej erupcji komora była prawie pusta. Dziś znów zbiera się w niej magma, ale dużo wolniej, niż została wyrzucona.', pos: sec(10, -16) },
      };
    }
    case 'super': {
      return {
        rim: { name: 'krawędź kaldery', desc: 'Kaldera Yellowstone ma ok. 70 × 45 km – z ziemi widać ją tylko jako niewysokie wzgórza. Jej kształt rozpoznano dopiero na zdjęciach z samolotów i satelitów.', pos: h('super', -54, -12, 2.5) },
        domes: { name: 'kopuły wznoszące się', desc: 'Dno kaldery powoli podnosi się i opada nad komorą magmową – w niektórych latach o kilka centymetrów. To normalne „oddychanie” superwulkanu.', pos: h('super', -22, -12, 2.2) },
        springs: { name: 'gorące źródła i gejzery', desc: 'Woda nagrzana przez magmę wypływa w ponad 10 tys. miejsc: gejzery, gorące źródła i błotne garnki. Barwne pierścienie to bakterie lubiące gorąco.', pos: h('super', 12, -26, 2.2) },
        lake: { name: 'jezioro', desc: 'Jezioro Yellowstone częściowo wypełnia kalderę. Na jego dnie też są gorące źródła i małe kratery po wybuchach pary.', pos: [30, 3.2, -16] },
        tuff: { name: 'warstwy tufu', desc: 'Płaskowyż wokół zbudowany jest z tufów – zespawanego popiołu z dawnych superwybuchów, grubego na setki metrów.', pos: sec(-80, 2) },
        chamber: { name: 'olbrzymia komora magmowa', desc: 'Pod Yellowstone leży płaska komora długa na ok. 90 km. Jest w niej głównie gorąca, krystaliczna „papka” – stopionej magmy jest tylko 5–15%. Do superwybuchu musiałoby jej być znacznie więcej.', pos: sec(22, -19) },
      };
    }
    case 'fissure': {
      return {
        fissure: { name: 'szczelina', desc: 'Pęknięcie w ziemi długie na kilometry, z którego wydobywa się lawa. Na Islandii szczeliny otwierają się tam, gdzie płyty tektoniczne się rozsuwają.', pos: h('fissure', 0, -30, 2.5) },
        cones: { name: 'stożki rozprysku', desc: 'Po kilku dniach lawa wydobywa się już tylko w kilku miejscach szczeliny. Bryzgi lawy budują wokół nich niskie stożki ustawione w rzędzie jak koraliki.', pos: [0, rockH('fissure', 0, FISSURE_CONES[1]) + 3.5, FISSURE_CONES[1]] },
        field: { name: 'pole świeżej lawy', desc: 'Rzadka lawa rozlewa się szeroko po płaskim terenie. Szczelina Laki pokryła w 1783 r. lawą ok. 600 km².', pos: [12, 3, -12] },
        plateau: { name: 'płaskowyż z dawnych wylewów', desc: 'Setki takich erupcji nakładają warstwy lawy jedna na drugą. Tak powstały wielkie pokrywy bazaltowe, np. Płaskowyż Dekanu w Indiach – gruby na ponad 2 km.', pos: [44, 3, -40] },
      };
    }
    case 'maar': {
      return {
        lake: { name: 'jezioro maarowe', desc: 'Krater leży poniżej otaczającego terenu, więc szybko wypełnia go woda gruntowa i deszczowa. Jeziora maarowe są okrągłe i głębokie.', pos: [-4, -1.4, -4] },
        ring: { name: 'wał z tefry', desc: 'Niski wał wokół krateru z okruchów skał i popiołu wyrzuconych przez wybuchy pary. Ma zwykle kilkanaście–kilkadziesiąt metrów wysokości.', pos: h('maar', -12, -3, 1.5) },
        diatreme: { name: 'diatrema', desc: 'Lej pod kraterem wypełniony pokruszoną skałą, sięgający nawet 2 km w głąb. Powstał z wielu wybuchów, które rozsadzały skałę coraz głębiej. W diatremach w Afryce Południowej znajduje się diamenty.', pos: sec(3.5, -16) },
        aquifer: { name: 'warstwa wodonośna', desc: 'Przesiąknięta wodą warstwa piasku i spękanej skały. Gdy magma ją przetnie, woda w ułamku sekundy zamienia się w parę – i następuje wybuch.', pos: sec(-22, -8) },
        feeder: { name: 'żyła magmy', desc: 'Maar zasila wąska żyła magmy z głębi – podobnie jak stożek żużlowy. Różnica polega na spotkaniu z wodą.', pos: sec(1.2, -36) },
      };
    }
    case 'sub': {
      return {
        island: { name: 'nowa wyspa', desc: 'Szczyt wulkanu wynurzył się z morza. Surtsey ma dziś ok. 1,3 km² – fale co roku zabierają część jej brzegów.', pos: [0, 7.5, -2] },
        sea: { name: 'poziom morza', desc: 'Przy powierzchni woda wdziera się do krateru i erupcja staje się wybuchowa (surtsejska). Głęboko pod wodą ciśnienie na to nie pozwala.', pos: [-32, 1.5, -20] },
        pillows: { name: 'lawa poduszkowa', desc: 'Pod wodą skórka lawy natychmiast zastyga, a lawa wypycha ją jak pastę – powstają zaokrąglone „poduszki” wielkości worka ziemniaków. To najczęstsza skała dna oceanów.', pos: sec(-16, -24) },
        hyalo: { name: 'hialoklastyt', desc: 'Bliżej powierzchni woda gwałtownie chłodzi lawę, która kruszy się na szkliste okruchy. Ten żółtawy gruz scementowany z czasem tworzy skałę.', pos: sec(-9, -9) },
        floor: { name: 'dno oceanu', desc: 'Wulkan wyrasta z dna leżącego kilka kilometrów pod wodą. Na świecie jest ponad 100 tys. podwodnych gór wulkanicznych – większość nigdy nie wyrośnie ponad wodę.', pos: [-60, -26, -20] },
        chamber: { name: 'komora magmowa', desc: 'Podwodne wulkany mają zwykle rzadką, bazaltową magmę – taką jak wulkany tarczowe.', pos: sec(9, -44) },
      };
    }
    case 'tuya': {
      return {
        ice: { name: 'lądolód', desc: 'Lód gruby na kilkaset metrów przykrywa cały wulkan. Na Islandii pod lodowcem Vatnajökull kryje się kilka czynnych wulkanów, m.in. Grímsvötn.', pos: [-26, (iceH('tuya', -26, -10) || 0) + 2, -10] },
        cauldron: { name: 'kocioł w lodzie', desc: 'Nad otworem erupcja topi lód od spodu. Lód zapada się w lejowate zagłębienie, a para i popiół przebijają się na powierzchnię. Naciśnij „Rozpocznij”, żeby to zobaczyć.', pos: [0, 23, -2] },
        top: { name: 'płaski szczyt z lawy', desc: 'Gdy wulkan przebije się przez lód, lawa wylewa się już na suchym lądzie i tworzy płaską pokrywę. Po stopieniu lodowca zostaje góra stołowa – tuja.', pos: sec(9, 16) },
        hyalo: { name: 'hialoklastyt', desc: 'W wodzie z roztopionego lodu lawa kruszy się na szkliste okruchy. Z nich zbudowane są strome boki tui.', pos: sec(13, 8) },
        pillows: { name: 'lawa poduszkowa', desc: 'Na samym początku erupcji, pod lodem i w wodzie, lawa zastyga w poduszki – jak na dnie oceanu.', pos: sec(10, 2.5) },
        chamber: { name: 'komora magmowa', desc: 'Pod lodowcami Islandii magma jest bazaltowa, ale spotkanie z wodą i lodem czyni erupcje wybuchowymi, a popiół leci wysoko – jak z Eyjafjallajökull w 2010 r.', pos: sec(9, -24) },
      };
    }
  }
}

/** Najważniejsze liczby każdego rodzaju (karta w ramce). */
export const TYPE_FACTS: Record<VType, { name: string; rows: [string, string][] }> = {
  strato: { name: 'Stratowulkan', rows: [['wysokość', '1–3 km nad podnóżem'], ['średnica', '10–30 km'], ['nachylenie', 'do 30–35° przy szczycie'], ['magma', 'andezyt, dacyt – gęsta'], ['erupcje', 'często wybuchowe'], ['przykłady', 'Fudżi, Etna, Wezuwiusz']] },
  shield: { name: 'Wulkan tarczowy', rows: [['wysokość', 'do 9 km od dna oceanu'], ['średnica', 'do ok. 120 km'], ['nachylenie', '2–10°'], ['magma', 'bazalt – rzadka'], ['erupcje', 'wylewne, fontanny lawy'], ['przykłady', 'Mauna Loa, Kīlauea']] },
  cinder: { name: 'Stożek żużlowy', rows: [['wysokość', '50–400 m'], ['średnica', '0,3–2,5 km'], ['nachylenie', 'ok. 33°'], ['magma', 'bazalt, andezyt bazaltowy'], ['erupcje', 'strombolijskie, krótko'], ['przykłady', 'Parícutin, Cerro Negro']] },
  dome: { name: 'Kopuła lawowa', rows: [['wysokość', 'od kilkudziesięciu m do 1 km'], ['średnica', 'do kilku km'], ['nachylenie', '25–60°, bardzo strome'], ['magma', 'dacyt, ryolit – bardzo gęsta'], ['erupcje', 'wyciskanie, zawalenia, lawiny żaru'], ['przykłady', 'Unzen, Lassen Peak']] },
  caldera: { name: 'Kaldera', rows: [['średnica', '2–20 km'], ['głębokość', 'kilkaset metrów do 1 km'], ['powstaje', 'po zapadnięciu się szczytu'], ['magma', 'andezyt, dacyt'], ['erupcje', 'jedna wielka, potem małe'], ['przykłady', 'Crater Lake, Santoryn']] },
  super: { name: 'Superwulkan', rows: [['średnica kaldery', '20–100 km'], ['erupcja', 'ponad 1000 km³ (VEI 8)'], ['jak często', 'raz na kilkadziesiąt tys. lat'], ['magma', 'ryolit – najgęstsza'], ['dziś', 'gejzery, gorące źródła'], ['przykłady', 'Yellowstone, Toba, Taupo']] },
  fissure: { name: 'Wulkan szczelinowy', rows: [['długość szczeliny', 'od setek m do dziesiątek km'], ['wysokość', 'niskie stożki, do ok. 100 m'], ['kształt', 'płaskie pola lawy'], ['magma', 'bazalt – rzadka'], ['erupcje', 'kurtyna ognia, wylewy'], ['przykłady', 'Laki, Holuhraun, Reykjanes']] },
  maar: { name: 'Maar', rows: [['średnica', '60 m – 2 km'], ['głębokość krateru', 'do 200–300 m'], ['wał', 'zwykle do kilkudziesięciu m'], ['przyczyna', 'magma + woda podziemna'], ['erupcje', 'wybuchy pary (freatomagmatyczne)'], ['przykłady', 'jeziora w Eifel (Niemcy)']] },
  sub: { name: 'Wulkan podmorski', rows: [['wysokość', 'od dna nawet kilka km'], ['liczba', 'ponad 100 tys. gór podwodnych'], ['skały', 'lawa poduszkowa, hialoklastyt'], ['magma', 'zwykle bazalt'], ['erupcje', 'spokojne w głębi, wybuchowe przy powierzchni'], ['przykłady', 'Surtsey, Hunga Tonga']] },
  tuya: { name: 'Wulkan pod lodowcem', rows: [['lód', 'kilkaset metrów'], ['kształt (tuja)', 'płaski szczyt, strome boki'], ['skały', 'poduszki, hialoklastyt, lawa'], ['magma', 'zwykle bazalt'], ['zagrożenie', 'powódź spod lodu (jökulhlaup)'], ['przykłady', 'Grímsvötn, Herðubreið']] },
};

/** Jezioro lawy w kalderze wulkanu tarczowego (Halemaʻumaʻu). */
export const LAVA_LAKE: [number, number] = [2.5, -2.5];
export function LavaLake({ visible }: { visible: () => number }) {
  const g = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const crust = useMemo(() => {
    // pękająca skórka: ciemne płyty z jasnymi szczelinami między nimi
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    x.fillStyle = '#ffb02e';
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 46; i++) {
      x.fillStyle = `rgba(${40 + Math.random() * 30},${24 + Math.random() * 14},${20},${0.85 + Math.random() * 0.15})`;
      x.beginPath();
      const cx = Math.random() * 256;
      const cy = Math.random() * 256;
      const n = 6;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
        const r = 14 + Math.random() * 22;
        if (k) x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
  const y = rockH('shield', LAVA_LAKE[0], LAVA_LAKE[1]);
  useFrame((st) => {
    const v = visible();
    if (g.current) g.current.visible = v > 0.02;
    crust.offset.set(st.clock.elapsedTime * 0.004, st.clock.elapsedTime * 0.002);
    if (glow.current) glow.current.opacity = v * (0.75 + 0.2 * Math.sin(st.clock.elapsedTime * 1.7));
  });
  return (
    <group ref={g} position={[LAVA_LAKE[0], y + 0.08, LAVA_LAKE[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.3, 48]} />
        <meshBasicMaterial map={crust} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[2.1, 2.6, 48]} />
        <meshBasicMaterial ref={glow} color="#ff7a1a" transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <pointLight color="#ff8a3a" intensity={60} distance={18} decay={1.5} position={[0, 1.5, 0]} />
    </group>
  );
}

/** Kaldera: zarys dawnego szczytu (przerywana linia) i uskoki pierścieniowe w przekroju. */
export function CalderaGhost() {
  const pts = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i <= 120; i++) {
      const x = -54 + (i / 120) * 108;
      const r = Math.abs(x);
      const old = 31 * Math.pow(Math.max(0, 1 - r / 54), 1.8);
      if (old > rockH('caldera', x, 0) + 0.3) out.push([x, old, 0.25]);
    }
    return out;
  }, []);
  const faults: V3[][] = [
    [
      [-CAL_R, 1.2, 0.25],
      [-12.5, -11.5, 0.25],
    ],
    [
      [CAL_R, 1.2, 0.25],
      [12.5, -11.5, 0.25],
    ],
  ];
  return (
    <>
      {pts.length > 1 && <Line points={pts} color="#ffffff" lineWidth={2} dashed dashSize={1.2} gapSize={0.8} transparent opacity={0.85} />}
      {faults.map((f, i) => (
        <Line key={i} points={f} color="#7a1f12" lineWidth={2.5} dashed dashSize={0.8} gapSize={0.5} />
      ))}
    </>
  );
}
