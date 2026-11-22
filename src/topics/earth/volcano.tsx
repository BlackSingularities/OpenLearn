import type { ReactNode } from 'react';
import type { PartModule, SceneProps, Step, Topic } from '../../lib/types';
import { useTopicNav } from '../../lib/topicNav';
import { VolcanoScene } from './volcanoScene';
import { rockH, type VType } from './volcanoGeo';
import { MON_STATIONS, SPEC, TEC } from './volcanoExtras';

/* ======================= pomocnicze ======================= */

const vol = (s: Omit<Step, 'kind' | 'scene' | 'stageKey'>): Step => ({ kind: '3d', scene: VolcanoScene, stageKey: 'volcano', ...s });
const RUN = { type: 'button' as const, key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false };
type V3 = [number, number, number];
const TOP = rockH('strato', 0, 0);

/** Przycisk w treści kroku, który otwiera moduł. */
function Open({ id, children }: { id: string; children: ReactNode }) {
  const nav = useTopicNav();
  return (
    <button type="button" className="module-open" onClick={() => nav?.openModule(id)}>
      {children}
      <span aria-hidden>→</span>
    </button>
  );
}

/** Ujęcia: przekrój stratowulkanu i widok ogólny. */
const CUT_CAM: V3 = [10, 20, 104];
const CUT_TGT: V3 = [0, -8, -6];

/* ======================= przegląd ======================= */

const overview: Step[] = [
  vol({
    title: 'Wulkan',
    camera: [-62, 40, 98],
    target: [0, -6, -8],
    preset: { mode: 'home', type: 'strato', cut: true, erupt: 'degas' },
    body: (
      <>
        <p>
          <b>Wulkan</b> to miejsce, w którym stopiona skała z wnętrza Ziemi – <b>magma</b> – wydostaje się na powierzchnię. Gdy wypływa, nazywamy ją <b>lawą</b>. Góra, którą zwykle kojarzymy z wulkanem, jest „efektem ubocznym”: to stos lawy, popiołu i okruchów skał, nagromadzonych przez setki erupcji.
        </p>
        <p>
          Przed Tobą <b>stratowulkan</b> – najbardziej znany kształt wulkanu, jak japońska Fudżi albo sycylijska Etna. Przecięliśmy go na pół, jak tort: widać warstwy skał, komin i komorę magmową głęboko pod spodem. Na Ziemi jest ok. <b>1350 wulkanów</b>, które wybuchały w ciągu ostatnich 10 tys. lat, a co roku wybucha ok. 50–70 z nich.
        </p>
        <p>
          Kliknij podpis na modelu, żeby otworzyć moduł: rodzaje wulkanów, erupcje, to, co wulkan wyrzuca, wnętrze i magmę, pochodzenie wulkanów, ich obserwację i życie w ich sąsiedztwie. Model możesz obracać myszą i przybliżać kółkiem.
        </p>
      </>
    ),
  }),
  vol({
    title: 'Wnętrze wulkanu',
    camera: CUT_CAM,
    target: CUT_TGT,
    preset: { mode: 'tour-inside', type: 'strato', cut: true, erupt: 'degas' },
    body: (
      <>
        <p>
          Kilka kilometrów pod wulkanem leży <b>komora magmowa</b> – miejsce, gdzie zbiera się stopiona skała o temperaturze 700–1200 °C. Magma jest lżejsza od otaczających ją skał, więc dąży w górę – jak korek wypychany przez wodę. Do krateru prowadzi <b>komin</b>. Białe kropki w kominie to <b>pęcherzyki gazu</b>, które rosną w miarę wznoszenia się magmy.
        </p>
        <p>To właśnie gaz – głównie para wodna i dwutlenek węgla rozpuszczone w magmie – decyduje, czy erupcja będzie spokojna, czy wybuchowa.</p>
        <p>
          <Open id="wnetrze">Otwórz moduł: wnętrze i magma</Open>
        </p>
      </>
    ),
  }),
  vol({
    title: 'Erupcja',
    camera: [-48, 30, 86],
    target: [0, 4, -8],
    preset: { mode: 'tour-erupt', type: 'strato', cut: true, erupt: 'degas' },
    controls: [RUN],
    body: (
      <>
        <p>
          Wulkan rzadko wybucha bez ostrzeżenia. Naciśnij „Rozpocznij” i zobacz, jak się budzi. Najpierw z głębi napływa nowa magma i komora rośnie. Skały pękają pod naporem – czujemy to jako <b>trzęsienia ziemi</b> (żółte kółka w przekroju). Magma wciska się w komin, ogniska wstrząsów są coraz płycej, a cała góra lekko <b>puchnie</b>.
        </p>
        <p>W końcu ciśnienie gazu pokonuje czop zastygłej magmy w kominie i wulkan wybucha: najpierw serią eksplozji, potem wysoką kolumną popiołu.</p>
        <p>
          <Open id="erupcje">Otwórz moduł: rodzaje erupcji</Open>
        </p>
      </>
    ),
  }),
  vol({
    title: 'Rodzaje wulkanów',
    camera: [-60, 34, 100],
    target: [0, -4, -10],
    preset: { mode: 'tour', type: 'shield', cut: true, erupt: 'degas' },
    body: (
      <>
        <p>
          Nie każdy wulkan wygląda jak Fudżi. Ten tutaj to <b>wulkan tarczowy</b>, jak hawajska Mauna Loa: płaski i ogromny, zbudowany z rzadkiej lawy, która rozlewa się na wiele kilometrów. Są też małe <b>stożki żużlowe</b>, <b>kopuły</b> z gęstej lawy, <b>kaldery</b> po zapadniętych szczytach, <b>szczeliny</b> długie na kilometry, wulkany podwodne i takie, które wybuchają pod lodowcem.
        </p>
        <p>Kształt wulkanu zależy przede wszystkim od tego, jak rzadka jest jego magma i ile ma w sobie gazu.</p>
        <p>
          <Open id="rodzaje">Otwórz moduł: rodzaje wulkanów</Open>
        </p>
      </>
    ),
  }),
  vol({
    title: 'Co wyrzuca wulkan',
    camera: [SPEC[0] + 1, 12, SPEC[2] + 15],
    target: [SPEC[0], 1, SPEC[2] + 1],
    preset: { mode: 'pr-sample', type: 'strato', cut: false, erupt: 'none' },
    body: (
      <>
        <p>
          Na stole leżą próbki tego, co wydostaje się z wulkanów: <b>lawa</b> zastygła w różne skały, <b>tefra</b> – wszystko, co wulkan wyrzuca w powietrze, od drobnego popiołu po wielotonowe bomby – oraz kryształy siarki z gazów. Jest też coś zaskakującego: kamień, który pływa.
        </p>
        <p>Do tego dochodzą zjawiska groźniejsze niż sama lawa: pędzące chmury żaru, rzeki błota i trujące gazy.</p>
        <p>
          <Open id="produkty">Otwórz moduł: co wyrzuca wulkan</Open>
        </p>
      </>
    ),
  }),
  vol({
    title: 'Skąd się biorą wulkany',
    camera: [TEC[0] + 10, TEC[1] + 10, TEC[2] + 95],
    target: [TEC[0], TEC[1] - 18, TEC[2]],
    preset: { mode: 'tec-sub', type: 'strato', cut: false, erupt: 'degas' },
    body: (
      <>
        <p>
          Skorupa Ziemi jest pęknięta na kilkanaście wielkich <b>płyt tektonicznych</b>, które pełzną po gorącym płaszczu z prędkością kilku centymetrów na rok – tyle, ile rosną nam paznokcie. Większość wulkanów leży na <b>granicach płyt</b>: tam, gdzie jedna płyta wsuwa się pod drugą (jak na tej makiecie), albo tam, gdzie płyty się rozsuwają.
        </p>
        <p>
          <Open id="tektonika">Otwórz moduł: skąd się biorą wulkany</Open>
        </p>
      </>
    ),
  }),
  vol({
    title: 'Jak obserwuje się wulkany',
    camera: [30, 36, 40],
    target: [0, 8, -16],
    preset: { mode: 'mon-home', type: 'strato', cut: false, erupt: 'degas' },
    body: (
      <>
        <p>
          Wulkanu nie da się powstrzymać, ale można przewidzieć jego erupcję. Na zboczach stoją <b>sejsmometry</b> (czują drgania), <b>odbiorniki GPS</b> (mierzą, czy góra puchnie), <b>czujniki gazów</b> i <b>kamery termowizyjne</b>. Dane płyną bez przerwy do obserwatorium.
        </p>
        <p>
          <Open id="obserwacja">Otwórz moduł: obserwacja wulkanu</Open>
        </p>
      </>
    ),
  }),
  vol({
    title: 'Życie przy wulkanie',
    camera: [70, 30, 30],
    target: [30, 2, -22],
    preset: { mode: 'life-geyser', type: 'strato', cut: false, erupt: 'degas' },
    body: (
      <>
        <p>
          W pobliżu czynnych wulkanów mieszka ok. <b>800 mln ludzi</b>. Dlaczego? Popiół wulkaniczny tworzy bardzo żyzne gleby, gorące skały dają energię i ciepłą wodę, a gejzery i gorące źródła przyciągają turystów.
        </p>
        <p>
          <Open id="zycie">Otwórz moduł: życie przy wulkanie</Open>
        </p>
      </>
    ),
  }),
];

/* ======================= wnętrze i magma ======================= */

const ch = { x: 0, y: -24 };
const insideModule: PartModule = {
  id: 'wnetrze',
  title: 'Wnętrze i magma',
  summary: 'Komora magmowa, komin i pęcherzyki gazu, lepkość magmy, żyły i stożki pasożytnicze, wzrost wulkanu warstwa po warstwie',
  steps: [
    vol({
      title: 'Przekrój wulkanu',
      camera: CUT_CAM,
      target: CUT_TGT,
      preset: { mode: 'in-home', type: 'strato', cut: true, erupt: 'degas' },
      body: (
        <>
          <p>
            Przekrój <b>stratowulkanu</b> od krateru do komory magmowej. W naturze komora leży zwykle 2–10 km pod powierzchnią, a sam stożek ma 1–3 km wysokości. Na modelu wulkan jest kilka razy „wyższy” niż w rzeczywistości, żeby było widać jego kształt – tak jak na rysunkach w podręcznikach.
          </p>
          <p>Kliknij podpis części, żeby przeczytać, czym jest. Numery na modelu prowadzą do zakładek: komora i komin, lepkość i gaz, żyły i stożki pasożytnicze oraz wzrost wulkanu.</p>
        </>
      ),
    }),
    vol({
      title: 'Komora magmowa i komin',
      spot: [ch.x + 7, ch.y + 3, 0.5],
      camera: [14, -4, 44],
      target: [0, -8, -2],
      preset: { mode: 'in-chamber', type: 'strato', cut: true, erupt: 'degas' },
      body: (
        <>
          <p>
            Magma powstaje głęboko, w płaszczu Ziemi albo u spodu skorupy, i wędruje w górę, bo jest lżejsza od skał wokół. Gdzieś po drodze utyka i zbiera się w <b>komorze magmowej</b>. Komora przypomina raczej gąbkę z kryształów nasiąkniętą magmą niż podziemne jezioro.
          </p>
          <p>
            W magmie rozpuszczony jest gaz – tak jak dwutlenek węgla w zamkniętej butelce wody gazowanej. Na głębokości kilku kilometrów ogromne ciśnienie nie pozwala mu się wydzielić. Gdy magma wznosi się <b>kominem</b>, ciśnienie spada i z magmy wyłaniają się <b>pęcherzyki</b> (białe kropki). Im wyżej, tym są większe – dokładnie jak bąbelki w butelce, którą właśnie otwierasz.
          </p>
          <p>Temperatura magmy to 700–1200 °C. Między erupcjami górna część komina zastyga w <b>czop</b>, który zatyka wulkan jak korek.</p>
        </>
      ),
    }),
    vol({
      title: 'Lepkość i gaz: wybuch czy wylew?',
      spot: [1.5, 6, 0.5],
      camera: [-20, 14, 70],
      target: [0, 0, -4],
      preset: { mode: 'in-gas', type: 'strato', cut: true },
      controls: [{ type: 'slider', key: 'silica', label: 'Krzemionka w magmie', min: 45, max: 75, step: 1, default: 50, unit: '%' }],
      body: (
        <>
          <p>
            Najważniejsza cecha magmy to <b>lepkość</b>, czyli to, jak łatwo płynie. Zależy od zawartości <b>krzemionki</b> (SiO₂) – tego samego związku, z którego jest piasek i szkło. Krzemionka tworzy w magmie łańcuchy, które ją zagęszczają.
          </p>
          <p>
            Przesuń suwak. W <b>rzadkiej</b> magmie bazaltowej (ok. 50% krzemionki) pęcherzyki gazu swobodnie uciekają w górę – lawa wylewa się spokojnie, czasem z fontannami. W <b>gęstej</b> magmie (ok. 70%) pęcherzyki nie mogą się wydostać. Rosną, aż w pewnym momencie rozrywają magmę na strzępy – na <b>popiół i pumeks</b>. To dlatego wulkany z gęstą magmą wybuchają najgwałtowniej.
          </p>
          <p>Działa to jak z napojem: wstrząśnięta woda gazowana tryska z butelki, a gęsty jogurt z pęcherzykami powietrza wybucha w mikrofalówce.</p>
        </>
      ),
    }),
    vol({
      title: 'Żyły i stożki pasożytnicze',
      spot: [11, -2, 0.5],
      camera: [24, 4, 58],
      target: [8, -4, -4],
      preset: { mode: 'in-dike', type: 'strato', cut: true, erupt: 'degas' },
      controls: [RUN],
      body: (
        <>
          <p>
            Magma nie zawsze płynie głównym kominem. Naciśnij „Rozpocznij”: z komory odrywa się porcja magmy i <b>rozsadza skałę</b>, wciskając się w szczelinę. Każde pęknięcie to małe trzęsienie ziemi – żółte kółka pokazują, jak czoło magmy przesuwa się ku powierzchni.
          </p>
          <p>
            Gdy taka <b>żyła</b> (dajka) dotrze do zbocza, otwiera się nowy otwór i rośnie <b>stożek pasożytniczy</b>. Wiele żył nigdy nie dociera na powierzchnię – zastyga w głębi jako płyty twardej skały. Po milionach lat, gdy erozja zetrze miękkie skały wokół, sterczą z ziemi jak mury.
          </p>
        </>
      ),
    }),
    vol({
      title: 'Jak rośnie wulkan',
      spot: [-12, 10, 0.5],
      camera: [8, 18, 100],
      target: [0, -2, -6],
      preset: { mode: 'in-growth', type: 'strato', cut: true, erupt: 'degas' },
      controls: [RUN],
      body: (
        <>
          <p>
            Naciśnij „Rozpocznij” i obejrzyj 100 tys. lat w kilkanaście sekund. Stratowulkan rośnie erupcja po erupcji. Raz wylewa się lawa i zastyga w twardy, ciemny pokład, raz spada gruba warstwa popiołu i okruchów. Stąd nazwa „wulkan warstwowy”.
          </p>
          <p>
            Wulkan też niszczeje: deszcz żłobi w jego zboczach żleby, a lodowce ścierają szczyt. Czasem cała ściana góry osuwa się w jednej chwili – jak w 1980 r. na Mount St. Helens, kiedy szczyt obniżył się o ok. 400 m.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= rodzaje wulkanów ======================= */

interface TypeTab {
  type: VType;
  title: string;
  cam: V3;
  tgt: V3;
  cut?: boolean;
  erupt?: string;
  body: ReactNode;
}
const TYPES: TypeTab[] = [
  {
    type: 'strato',
    title: 'Stratowulkan',
    cam: CUT_CAM,
    tgt: CUT_TGT,
    erupt: 'degas',
    body: (
      <>
        <p>
          <b>Stratowulkan</b> (wulkan warstwowy) to stromy stożek z naprzemiennych warstw lawy i popiołu. Ma gęstą magmę (andezyt, dacyt) z dużą ilością gazu, więc często wybucha gwałtownie. Zbocza są wklęsłe – coraz bardziej strome ku szczytowi – a szczyt bywa pokryty śniegiem.
        </p>
        <p>
          Przykłady: <b>Fudżi</b> (Japonia, 3776 m), <b>Etna</b> i <b>Wezuwiusz</b> (Włochy), <b>Mount St. Helens</b> (USA), <b>Kilimandżaro</b> (Tanzania). Większość z nich leży nad strefami subdukcji, wokół Oceanu Spokojnego.
        </p>
        <p>Kliknij podpis na modelu, żeby przeczytać o części wulkanu. Kolejne zakładki pokazują pozostałe rodzaje – góra zmienia kształt na Twoich oczach.</p>
      </>
    ),
  },
  {
    type: 'shield',
    title: 'Wulkan tarczowy',
    cam: [12, 34, 150],
    tgt: [0, -6, -14],
    erupt: 'degas',
    body: (
      <>
        <p>
          <b>Wulkan tarczowy</b> przypomina tarczę wojownika położoną na ziemi: jest płaski, rozległy, o zboczach nachylonych zaledwie o kilka stopni. Buduje go bardzo rzadka lawa bazaltowa, która spływa na dziesiątki kilometrów, zanim zastygnie. Erupcje są spokojne – lawa wylewa się, zamiast wybuchać.
        </p>
        <p>
          Największy wulkan na Ziemi, hawajska <b>Mauna Loa</b>, ma 4169 m n.p.m., ale licząc od dna oceanu – ok. 9 km, więcej niż Mount Everest. Na szczycie ma kalderę, a od niej odchodzą <b>strefy ryftowe</b> – pasy szczelin, którymi często wypływa lawa. Największy wulkan Układu Słonecznego, <b>Olympus Mons</b> na Marsie, to też wulkan tarczowy – ma ok. 22 km wysokości.
        </p>
      </>
    ),
  },
  {
    type: 'cinder',
    title: 'Stożek żużlowy',
    cam: [8, 12, 38],
    tgt: [0, 0, -4],
    erupt: 'strombo',
    body: (
      <>
        <p>
          <b>Stożek żużlowy</b> to najprostszy wulkan: kopiec z okruchów zastygłej lawy (żużla), które spadły wokół otworu. Ma proste zbocza nachylone pod kątem ok. 33° – takim, pod jakim usypuje się każda sterta kamyków – i duży krater na szczycie. Jest mały: zwykle 50–300 m wysokości.
        </p>
        <p>
          Stożki żużlowe rodzą się i umierają szybko. Meksykański <b>Parícutin</b> wyrósł w 1943 r. na polu kukurydzy – rolnik widział, jak z pęknięcia w ziemi zaczyna się dymić. Po tygodniu stożek miał 100 m, po 9 latach – 424 m. Potem wygasł na zawsze.
        </p>
      </>
    ),
  },
  {
    type: 'dome',
    title: 'Kopuła lawowa',
    cam: [8, 12, 38],
    tgt: [0, 2, -4],
    erupt: 'dome',
    body: (
      <>
        <p>
          <b>Kopuła lawowa</b> powstaje z lawy tak gęstej, że nie potrafi spłynąć. Wyciska się z otworu jak pasta z tubki i piętrzy w stromy, wybrzuszony kopiec. Z jej boków co chwilę odpadają żarzące się bloki. Czasem nad kopułę wysuwa się <b>iglica</b> – słup zastygłej lawy.
        </p>
        <p>
          Kopuły są groźne, bo mogą się nagle zawalić albo eksplodować, wywołując lawinę żaru. Rosną często w kraterach większych wulkanów – jak na Mount St. Helens po 1980 r. albo na wulkanie <b>Unzen</b> w Japonii.
        </p>
      </>
    ),
  },
  {
    type: 'caldera',
    title: 'Kaldera',
    cam: [10, 26, 96],
    tgt: [0, -4, -6],
    erupt: 'degas',
    body: (
      <>
        <p>
          <b>Kaldera</b> (po hiszpańsku „kocioł”) to ogromne zagłębienie, które powstaje, gdy wielka erupcja opróżni komorę magmową, a szczyt wulkanu zapadnie się w pustą przestrzeń. Kaldery mają od kilku do kilkudziesięciu kilometrów średnicy, często wypełnia je jezioro albo morze.
        </p>
        <p>
          <b>Crater Lake</b> w USA to kaldera po wulkanie Mazama, który zapadł się ok. 7700 lat temu – jezioro ma 594 m głębokości. Na wodzie wyrósł nowy stożek, Wizard Island. Grecka wyspa <b>Santoryn</b> to brzeg kaldery zalanej przez morze po erupcji ok. 1600 r. p.n.e.
        </p>
      </>
    ),
  },
  {
    type: 'super',
    title: 'Superwulkan',
    cam: [14, 46, 160],
    tgt: [0, -10, -10],
    erupt: 'degas',
    body: (
      <>
        <p>
          <b>Superwulkan</b> to wulkan, który choć raz wyrzucił ponad <b>1000 km³</b> materiału – najwyższy stopień skali VEI. Nie wygląda jak góra: to rozległa kaldera, często trudna do zauważenia z ziemi. Pod nią leży olbrzymia, płaska komora magmowa.
        </p>
        <p>
          Najbardziej znany to <b>Yellowstone</b> w USA – kaldera ma ok. 70 × 45 km. Ostatnia superpotężna erupcja była tam 640 tys. lat temu. Dziś o gorącej magmie w głębi świadczą tysiące gejzerów i barwnych gorących źródeł. Erupcja <b>Toby</b> na Sumatrze ok. 74 tys. lat temu na kilka lat ochłodziła klimat całej Ziemi.
        </p>
      </>
    ),
  },
  {
    type: 'fissure',
    title: 'Wulkan szczelinowy',
    cam: [46, 30, 58],
    tgt: [0, 1, -2],
    cut: false,
    erupt: 'fissure',
    body: (
      <>
        <p>
          Lawa nie musi wydobywać się z jednego krateru. W <b>erupcji szczelinowej</b> ziemia pęka na długości wielu kilometrów, a lawa tryska z całej szczeliny, tworząc <b>kurtynę ognia</b>. Wzdłuż szczeliny rosną niskie stożki rozprysku.
        </p>
        <p>
          Tak wybuchają wulkany <b>Islandii</b>. W 1783 r. szczelina <b>Laki</b> o długości 27 km przez 8 miesięcy wylewała lawę i trujące gazy – zginęła jedna czwarta mieszkańców wyspy, a w Europie nastało chłodne lato. Z takich erupcji powstały też olbrzymie <b>pokrywy bazaltowe</b>, np. Płaskowyż Dekanu w Indiach.
        </p>
      </>
    ),
  },
  {
    type: 'maar',
    title: 'Maar',
    cam: [8, 10, 44],
    tgt: [0, -6, -4],
    erupt: 'degas',
    body: (
      <>
        <p>
          <b>Maar</b> to płaski krater wybity <b>poniżej</b> poziomu otaczającego terenu, otoczony niskim wałem okruchów. Powstaje, gdy magma po drodze napotka wodę podziemną: woda zamienia się w parę w ułamku sekundy i seria wybuchów rozsadza skały. Pod kraterem zostaje lej wypełniony pokruszoną skałą – <b>diatrema</b> (w przekroju).
        </p>
        <p>
          Po erupcji krater zwykle wypełnia jezioro. Takie okrągłe jeziora są w niemieckim <b>Eifel</b> – stąd nazwa: „maar” to w tamtejszej gwarze „jezioro”.
        </p>
      </>
    ),
  },
  {
    type: 'sub',
    title: 'Wulkan podmorski',
    cam: [12, 10, 100],
    tgt: [0, -14, -6],
    erupt: 'degas',
    body: (
      <>
        <p>
          Większość erupcji na Ziemi odbywa się <b>pod wodą</b>, na dnie oceanów – zwykle nikt ich nie widzi. Na dużej głębokości ciśnienie wody nie pozwala gazom wybuchać: lawa wylewa się spokojnie i zastyga w kształt <b>poduszek</b> (lawa poduszkowa, w przekroju na dole). Wyżej woda gwałtownie chłodzi lawę, która kruszy się na szkliste okruchy (żółtawy hialoklastyt).
        </p>
        <p>
          Gdy wulkan urośnie aż do powierzchni, rodzi się nowa wyspa. Tak w 1963 r. powstała islandzka <b>Surtsey</b>. W 2022 r. podmorski wulkan <b>Hunga Tonga</b> wybuchł z siłą, którą zarejestrowały barometry na całej Ziemi, a jego kolumna popiołu sięgnęła 57 km.
        </p>
      </>
    ),
  },
  {
    type: 'tuya',
    title: 'Wulkan pod lodowcem',
    cam: [10, 26, 110],
    tgt: [0, 0, -8],
    erupt: 'glacier',
    body: (
      <>
        <p>
          Na Islandii i Antarktydzie wiele wulkanów kryje się <b>pod grubą czapą lodu</b>. Naciśnij „Rozpocznij”: erupcja topi lód od spodu, nad otworem lód zapada się w <b>kocioł</b>, a para z popiołem przebija się w górę. Woda z roztopionego lodu zbiera się pod lodowcem, aż nagle wylewa się falą powodziową – po islandzku <b>jökulhlaup</b>.
        </p>
        <p>
          Lawa zastygająca w wodzie i lodzie buduje górę o stromych bokach i płaskim szczycie. Gdy lodowiec zniknie, zostaje <b>tuja</b> – góra stołowa, jak islandzka Herðubreið.
        </p>
      </>
    ),
  },
];
const typesModule: PartModule = {
  id: 'rodzaje',
  title: 'Rodzaje wulkanów',
  summary: 'Stratowulkan, wulkan tarczowy, stożek żużlowy, kopuła lawowa, kaldera, superwulkan, szczelina, maar, wulkan podmorski i podlodowcowy',
  steps: TYPES.map((t) =>
    vol({
      title: t.title,
      camera: t.cam,
      target: t.tgt,
      preset: { mode: t.type === 'tuya' ? 'glacier' : `type-${t.type}`, type: t.type, cut: t.cut ?? true, erupt: t.erupt ?? 'degas' },
      controls: t.type === 'tuya' ? [RUN] : undefined,
      body: t.body,
    }),
  ),
};

/* ======================= erupcje ======================= */

interface EruptTab {
  erupt: string;
  type: VType;
  title: string;
  cam: V3;
  tgt: V3;
  run?: boolean;
  body: ReactNode;
}
const ERUPTS: EruptTab[] = [
  {
    erupt: 'hawaii',
    type: 'shield',
    title: 'Hawajska',
    cam: [26, 22, 44],
    tgt: [0, 9, -6],
    body: (
      <>
        <p>
          Najspokojniejsza erupcja: rzadka lawa bazaltowa tryska z krateru albo szczeliny <b>fontannami</b> wysokimi na dziesiątki, czasem setki metrów, i spływa po zboczach jęzorami. Gaz łatwo uchodzi z rzadkiej lawy, więc nie ma gwałtownych wybuchów. Do takiej erupcji można podejść dość blisko – trzeba tylko uważać na gazy i na to, gdzie popłynie lawa.
        </p>
        <p>Nazwa pochodzi od Hawajów, gdzie tak wybucha Kīlauea – jeden z najaktywniejszych wulkanów świata.</p>
        <p>Kliknij podpis na modelu, żeby przeczytać, co widzisz. Kolejne zakładki pokazują pozostałe rodzaje erupcji, od najspokojniejszych po najgwałtowniejsze.</p>
      </>
    ),
  },
  {
    erupt: 'strombo',
    type: 'cinder',
    title: 'Strombolijska',
    cam: [16, 12, 40],
    tgt: [0, 8, -3],
    body: (
      <>
        <p>
          Co kilka sekund albo minut w kominie pęka wielki pęcherz gazu i wyrzuca w górę żarzące się <b>bomby</b> i <b>lapille</b>. Okruchy lecą po łukach – dokładnie jak rzucony kamień – i spadają wokół krateru, budując stożek żużlowy. Nocą wygląda to jak sztuczne ognie.
        </p>
        <p>
          Nazwa pochodzi od włoskiej wyspy <b>Stromboli</b>, która wybucha tak od ponad 2000 lat. Żeglarze nazywali ją „latarnią Morza Śródziemnego”.
        </p>
      </>
    ),
  },
  {
    erupt: 'vulcan',
    type: 'strato',
    title: 'Wulkańska',
    cam: [-40, 34, 76],
    tgt: [0, 18, -6],
    body: (
      <>
        <p>
          Gęsta magma zatyka komin czopem. Pod nim zbiera się gaz, aż czop pęka z hukiem jak korek od szampana. Krótkie, silne <b>eksplozje</b> wyrzucają ciemne chmury popiołu na kilka kilometrów w górę i ciskają <b>blokami</b> starej skały. Przerwy między wybuchami trwają od minut do godzin.
        </p>
        <p>
          Nazwa pochodzi od wyspy <b>Vulcano</b> we Włoszech – a od niej słowo „wulkan” (Wulkan był rzymskim bogiem ognia i kowalstwa). Tak wybucha np. japoński Sakurajima, często kilka razy dziennie.
        </p>
      </>
    ),
  },
  {
    erupt: 'pelee',
    type: 'dome',
    title: 'Pelejska',
    cam: [26, 16, 36],
    tgt: [0, 3, -10],
    body: (
      <>
        <p>
          W kraterze rośnie kopuła z bardzo gęstej lawy. Gdy jej bok się zawali albo eksploduje, w dół zbocza rusza <b>chmura żaru</b> – mieszanina gorącego gazu, popiołu i bloków lawy, która pędzi z prędkością samochodu wyścigowego.
        </p>
        <p>
          Nazwa pochodzi od wulkanu <b>Mont Pelée</b> na Martynice. 8 maja 1902 r. chmura żaru w kilka minut zniszczyła miasto Saint-Pierre i zabiła ok. 28 tys. ludzi. Przeżyło zaledwie kilka osób – m.in. więzień zamknięty w celi o grubych murach.
        </p>
      </>
    ),
  },
  {
    erupt: 'plinian',
    type: 'strato',
    title: 'Pliniańska',
    cam: [-80, 50, 150],
    tgt: [0, 34, -10],
    run: true,
    body: (
      <>
        <p>
          Najpotężniejszy rodzaj erupcji. Gaz rozrywa gęstą magmę na popiół i pumeks, a mieszanina wystrzeliwuje z krateru z prędkością kilkuset km/h. Gorąca chmura unosi się jak balon na ogrzane powietrze – <b>kolumna erupcyjna</b> sięga 20–45 km, do stratosfery. Tam rozpływa się na boki w <b>parasol</b>, z którego na ogromnym obszarze sypie się pumeks i popiół. W kolumnie biją <b>pioruny</b>.
        </p>
        <p>
          Naciśnij „Rozpocznij”. Po kilkunastu sekundach kolumna staje się za ciężka, zapada się i jej popiół spływa po zboczach jako <b>przepływy piroklastyczne</b>. Nazwa pochodzi od <b>Pliniusza Młodszego</b>, który w 79 r. opisał erupcję Wezuwiusza, która pogrzebała Pompeje.
        </p>
      </>
    ),
  },
  {
    erupt: 'surtsey',
    type: 'sub',
    title: 'Surtsejska',
    cam: [24, 14, 52],
    tgt: [0, 6, -6],
    body: (
      <>
        <p>
          Wulkan wybucha w płytkiej wodzie albo tuż przy jej powierzchni. Woda wdziera się do krateru, w ułamku sekundy zamienia się w parę i rozrywa lawę. Z krateru strzelają czarne strugi tefry, wygięte jak <b>kogucie ogony</b>, a nad nimi kłębi się biała para.
        </p>
        <p>
          Nazwa pochodzi od wyspy <b>Surtsey</b>, która w 1963 r. wynurzyła się z oceanu u wybrzeży Islandii. Dziś jest rezerwatem przyrody – naukowcy obserwują, jak na nowej wyspie pojawiają się rośliny i zwierzęta.
        </p>
      </>
    ),
  },
  {
    erupt: 'fissure',
    type: 'fissure',
    title: 'Islandzka (szczelinowa)',
    cam: [50, 26, 50],
    tgt: [0, 2, -4],
    body: (
      <>
        <p>
          Ziemia rozstępuje się na długości od kilkuset metrów do kilkudziesięciu kilometrów, a z całej szczeliny tryskają fontanny lawy – <b>kurtyna ognia</b>. Po kilku dniach erupcja skupia się zwykle w kilku miejscach, gdzie rosną stożki rozprysku. Jęzory lawy rozlewają się szeroko po płaskim terenie.
        </p>
        <p>Taka erupcja trwała w latach 2021–2024 na półwyspie Reykjanes na Islandii – lawa podeszła pod miasteczko Grindavík i elektrownię geotermalną, które chroniono wałami usypanymi z ziemi.</p>
      </>
    ),
  },
  {
    erupt: 'phreatic',
    type: 'strato',
    title: 'Freatyczna (wybuch pary)',
    cam: [24, 32, 50],
    tgt: [0, 18, -6],
    run: true,
    body: (
      <>
        <p>
          W tej erupcji z wulkanu nie wydobywa się świeża magma. Woda deszczowa albo podziemna wsiąka w gorące skały nad komorą i nagle wrze. Para wybucha jak w szybkowarze, któremu urwano zawór, i wyrzuca stare skały i biały obłok. Naciśnij „Rozpocznij”.
        </p>
        <p>
          Wybuchów freatycznych prawie nie da się przewidzieć, bo przed nimi zwykle nie ma trzęsień ziemi ani puchnięcia góry. W 2014 r. taka erupcja wulkanu <b>Ontake</b> w Japonii zaskoczyła turystów na szczycie.
        </p>
      </>
    ),
  },
  {
    erupt: 'plinian',
    type: 'strato',
    title: 'Siła erupcji: skala VEI',
    cam: [-60, 60, 190],
    tgt: [30, 30, -30],
    body: (
      <>
        <p>
          Siłę erupcji mierzy się w <b>skali VEI</b> (Volcanic Explosivity Index) od 0 do 8. Liczy się przede wszystkim objętość wyrzuconej tefry i wysokość kolumny. Każdy stopień to <b>10 razy więcej</b> materiału niż poprzedni.
        </p>
        <p>Przesuń suwak. Pomarańczowy sześcian obok wulkanu ma objętość tefry z erupcji danej siły (1 km = 10 kratek modelu). Przy VEI 8 sześcian ma 10 km boku i przytłacza cały wulkan.</p>
      </>
    ),
  },
];
const eruptModule: PartModule = {
  id: 'erupcje',
  title: 'Rodzaje erupcji',
  summary: 'Erupcje hawajska, strombolijska, wulkańska, pelejska, pliniańska, surtsejska, islandzka i freatyczna oraz skala siły VEI',
  steps: ERUPTS.map((e) =>
    vol({
      title: e.title,
      camera: e.cam,
      target: e.tgt,
      preset: { mode: e.title.startsWith('Siła') ? 'vei' : `er-${e.erupt}`, type: e.type, cut: false, erupt: e.erupt },
      controls: e.title.startsWith('Siła') ? [{ type: 'slider', key: 'vei', label: 'VEI', min: 0, max: 8, step: 1, default: 4 }] : e.run ? [RUN] : e.erupt === 'plinian' ? [{ type: 'slider', key: 'wind', label: 'Wiatr', min: 0, max: 14, step: 1, default: 6, unit: 'm/s' }] : undefined,
      body: e.body,
    }),
  ),
};

/* ======================= co wyrzuca wulkan ======================= */

const productsModule: PartModule = {
  id: 'produkty',
  title: 'Co wyrzuca wulkan',
  summary: 'Lawa pahoehoe, aa i blokowa, tefra od popiołu po bomby, pumeks i obsydian, kolumna i opad popiołu, przepływy piroklastyczne, lahary, gazy i błyskawice',
  steps: [
    vol({
      title: 'Gablota z próbkami',
      camera: [SPEC[0] + 1, 12, SPEC[2] + 15],
      target: [SPEC[0], 1, SPEC[2] + 1],
      preset: { mode: 'pr-home', type: 'strato', cut: false, erupt: 'none' },
      body: (
        <>
          <p>
            Wszystko, co wydostaje się z wulkanu, to <b>lawa</b> (stopiona skała, która wypływa), <b>tefra</b> (wszystko, co zostało wyrzucone w powietrze) i <b>gazy</b>. Tefrę dzielimy według wielkości: <b>popiół</b> – mniej niż 2 mm, <b>lapille</b> – od 2 do 64 mm, a większe kawałki to <b>bomby</b> (wyrzucone jako płynne) i <b>bloki</b> (wyrzucone jako stałe).
          </p>
          <p>Ta sama magma może zastygnąć w zupełnie różne skały – zależnie od tego, ile ma krzemionki, ile gazu i jak szybko stygnie. Kliknij podpis próbki, żeby przeczytać jej historię.</p>
        </>
      ),
    }),
    vol({
      title: 'Lawa: pahoehoe, aa i blokowa',
      camera: [30, 26, 46],
      target: [2, 6, -16],
      preset: { mode: 'pr-lava', type: 'shield', cut: false, erupt: 'hawaii' },
      controls: [
        {
          type: 'select',
          key: 'lava',
          label: 'Rodzaj lawy',
          default: 'pahoehoe',
          options: [
            { value: 'pahoehoe', label: 'pahoehoe – gładka, sznurowa' },
            { value: 'aa', label: 'aa – szorstka, kolczasta' },
            { value: 'block', label: 'blokowa – wielkie bloki' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Lawa ma temperaturę 700–1200 °C i świeci tym jaśniej, im jest gorętsza: od żółtej przez pomarańczową po ciemnoczerwoną. Szybko pokrywa się ciemną skórką, ale pod nią płynie dalej – czasem w <b>tunelach lawowych</b> długich na kilometry.
          </p>
          <p>
            Wybierz rodzaj lawy. <b>Pahoehoe</b> jest rzadka i gorąca – płynie powoli, a jej skórka marszczy się w sznury. <b>Aa</b> to ta sama lawa, chłodniejsza i bardziej lepka: skórka rwie się na ostry rumosz, który toczy się przed czołem jęzora. <b>Lawa blokowa</b> z gęstej magmy przesuwa się bardzo powoli jako stos wielkich, kanciastych bloków. Lawa płynie zwykle wolniej niż idący człowiek – zagraża domom i drogom, rzadko ludziom.
          </p>
        </>
      ),
    }),
    vol({
      title: 'Bomby, lapille i popiół',
      camera: [18, 12, 34],
      target: [0, 9, -3],
      preset: { mode: 'pr-tephra', type: 'cinder', cut: false, erupt: 'strombo' },
      body: (
        <>
          <p>
            Wybuch wyrzuca w powietrze okruchy różnej wielkości. <b>Bomby</b> są jeszcze płynne i świecą – wirując w locie, przybierają kształt wrzeciona. Stygną już w powietrzu i z żółtych robią się czerwone, a potem czarne. <b>Lapille</b> wielkości orzecha spadają bliżej, a najdrobniejszy <b>popiół</b> unosi się z gazem i odlatuje z wiatrem.
          </p>
          <p>Ciężkie okruchy lecą po łukach – jak piłka kopnięta w górę. Opór powietrza ledwie je hamuje. Bomby spadają zwykle do kilku kilometrów od krateru, ale te największe mogą ważyć kilkadziesiąt ton.</p>
        </>
      ),
    }),
    vol({
      title: 'Kolumna erupcyjna i opad popiołu',
      camera: [-70, 46, 140],
      target: [10, 36, -10],
      preset: { mode: 'pr-column', type: 'strato', cut: false, erupt: 'plinian' },
      controls: [{ type: 'slider', key: 'wind', label: 'Wiatr', min: 0, max: 14, step: 1, default: 8, unit: 'm/s' }],
      body: (
        <>
          <p>
            W wielkiej erupcji gaz z popiołem wylatuje z krateru z prędkością kilkuset km/h. Po kilku kilometrach pęd słabnie, ale mieszanka jest gorąca i lżejsza od powietrza, więc wznosi się dalej. Kolumna rośnie, aż jej gęstość zrówna się z gęstością rzadkiego powietrza wysoko nad ziemią. Wtedy rozpływa się na boki w <b>parasol</b>.
          </p>
          <p>
            Wiatr znosi parasol i z niego sypie się pumeks i popiół (przesuń suwak). Warstwa popiołu grubości 10 cm waży ok. 100 kg na m² – mokra może zawalić dach. Pompeje w 79 r. przysypało 3 m pumeksu i popiołu.
          </p>
        </>
      ),
    }),
    vol({
      title: 'Przepływ piroklastyczny',
      camera: [-36, 34, 88],
      target: [0, 6, -20],
      preset: { mode: 'pdc', type: 'strato', cut: false, erupt: 'pdc' },
      controls: [RUN],
      body: (
        <>
          <p>
            Najgroźniejsze zjawisko wulkaniczne. Gdy kolumna erupcyjna się zapadnie albo zawali się kopuła lawowa, chmura gorącego gazu, popiołu i odłamków skał <b>spływa po zboczach</b> – jest cięższa od powietrza. Pędzi z prędkością 100–700 km/h, ma temperaturę 200–700 °C i przeskakuje doliny i niewielkie wzgórza.
          </p>
          <p>
            Naciśnij „Rozpocznij”. Przed przepływem piroklastycznym nie da się uciec ani schronić – jedyna ochrona to ewakuacja, zanim nadejdzie. Tak zginęli mieszkańcy Pompejów i Herkulanum oraz Saint-Pierre na Martynice.
          </p>
        </>
      ),
    }),
    vol({
      title: 'Lahar – rzeka błota',
      camera: [36, 30, 40],
      target: [0, 4, -42],
      preset: { mode: 'lahar', type: 'strato', cut: false, erupt: 'lahar' },
      controls: [RUN],
      body: (
        <>
          <p>
            <b>Lahar</b> (słowo z języka jawajskiego) to lawina błota z popiołu, kamieni i wody. Woda może pochodzić z topniejącego śniegu i lodu na szczycie, z jeziora w kraterze albo z ulewy, która spłukuje świeży popiół – nawet wiele lat po erupcji. Lahar płynie dolinami rzek jak mokry beton, z prędkością do kilkudziesięciu km/h, i porywa domy, mosty i drzewa.
          </p>
          <p>
            Naciśnij „Rozpocznij”. W 1985 r. niewielka erupcja wulkanu <b>Nevado del Ruiz</b> w Kolumbii stopiła część lodowca na szczycie. Lahar dotarł do miasta Armero 74 km dalej i zabił ok. 23 tys. ludzi. Dziś w dolinach pod wieloma wulkanami stoją czujniki, które włączają syreny.
          </p>
        </>
      ),
    }),
    vol({
      title: 'Gazy wulkaniczne',
      camera: [-10, 34, 40],
      target: [-14, 10, -16],
      preset: { mode: 'pr-gas', type: 'strato', cut: false, erupt: 'degas' },
      body: (
        <>
          <p>
            Wulkan wydziela gazy nawet wtedy, gdy nie wybucha. Najwięcej jest <b>pary wodnej</b> (ok. 60–90%), dalej <b>dwutlenku węgla</b> (CO₂) i <b>dwutlenku siarki</b> (SO₂), mniej – siarkowodoru o zapachu zgniłych jaj, chlorowodoru i fluorowodoru. Z gazów wokół otworów zwanych <b>fumarolami</b> osadzają się żółte kryształy siarki.
          </p>
          <p>
            Dwutlenek węgla jest niewidzialny, bez zapachu i <b>cięższy od powietrza</b>, więc zbiera się w zagłębieniach terenu (tu zaznaczony fioletem). W 1986 r. z jeziora Nyos w Kamerunie uwolniła się chmura CO₂, która spłynęła do dolin i udusiła ok. 1700 ludzi. SO₂ w stratosferze zamienia się w kropelki, które odbijają światło słońca – po wielkich erupcjach na Ziemi robi się chłodniej.
          </p>
        </>
      ),
    }),
    vol({
      title: 'Błyskawice wulkaniczne',
      camera: [-44, 30, 92],
      target: [0, 34, -6],
      preset: { mode: 'pr-lightning', type: 'strato', cut: false, erupt: 'plinian' },
      body: (
        <>
          <p>
            W kolumnie popiołu biją <b>pioruny</b>, często setki na minutę. Ziarna popiołu i kryształki lodu ocierają się o siebie i elektryzują, tak jak włosy pocierane balonikiem. Lżejsze ładunki unoszą się wyżej, cięższe zostają niżej – powstaje napięcie, które rozładowuje się błyskawicą, jak w chmurze burzowej.
          </p>
          <p>Podczas erupcji wulkanu Hunga Tonga w 2022 r. naliczono ok. 2600 wyładowań na minutę – najwięcej, jakie kiedykolwiek zmierzono.</p>
        </>
      ),
    }),
  ],
};

/* ======================= tektonika ======================= */

const tecCam = (dz = 95): { camera: V3; target: V3 } => ({ camera: [TEC[0] + 14, TEC[1] + 12, TEC[2] + dz], target: [TEC[0], TEC[1] - 18, TEC[2]] });
const tecModule: PartModule = {
  id: 'tektonika',
  title: 'Skąd się biorą wulkany',
  summary: 'Wnętrze Ziemi, płyty tektoniczne, strefy subdukcji i Pierścień Ognia, grzbiety śródoceaniczne i plamy gorąca',
  steps: [
    vol({
      title: 'Wnętrze Ziemi',
      camera: [TEC[0] + 38, TEC[1] + 26, TEC[2] + 46],
      target: [TEC[0], TEC[1], TEC[2]],
      preset: { mode: 'tec-layers', type: 'strato', cut: false, erupt: 'degas' },
      body: (
        <>
          <p>
            Ziemia jest zbudowana jak brzoskwinia. Na wierzchu cienka <b>skorupa</b> (5–70 km), pod nią <b>płaszcz</b> sięgający prawie 2900 km w głąb, a w środku <b>jądro</b> z żelaza i niklu: zewnętrzne ciekłe i wewnętrzne stałe, gorące jak powierzchnia Słońca.
          </p>
          <p>
            Płaszcz to nie morze lawy – jest zbudowany ze stałej skały. Ta skała jest jednak tak gorąca, że przez miliony lat powoli płynie, jak bardzo gęsta smoła. Ciepło z wnętrza Ziemi napędza ten ruch, a on przesuwa płyty skorupy. Skały topią się tylko w kilku szczególnych miejscach – i tam powstają wulkany.
          </p>
          <p>Kliknij podpis warstwy, żeby przeczytać o niej więcej.</p>
        </>
      ),
    }),
    vol({
      title: 'Subdukcja i Pierścień Ognia',
      ...tecCam(),
      preset: { mode: 'tec-sub', type: 'strato', cut: false, erupt: 'degas' },
      body: (
        <>
          <p>
            Gdy cięższa <b>płyta oceaniczna</b> zderza się z lżejszą <b>kontynentalną</b>, wsuwa się pod nią w głąb płaszcza – to <b>subdukcja</b>. Wciągana płyta niesie wodę uwięzioną w skałach dna. Na głębokości ok. 100 km woda uchodzi z płyty do gorącego płaszcza powyżej i obniża temperaturę topnienia skał – podobnie jak sól topi lód na drodze. Powstaje magma, która wędruje w górę i zasila <b>łuk wulkanów</b> równoległy do rowu oceanicznego.
          </p>
          <p>
            Tak powstały Andy, wulkany Japonii, Indonezji, Kamczatki i Alaski. Ciągną się one wokół Oceanu Spokojnego jak naszyjnik – to <b>Pierścień Ognia</b>, w którym leży ok. trzech czwartych czynnych wulkanów lądowych. Ich magma jest gęsta i bogata w wodę, więc wybuchają gwałtownie.
          </p>
        </>
      ),
    }),
    vol({
      title: 'Grzbiet śródoceaniczny',
      ...tecCam(),
      preset: { mode: 'tec-ridge', type: 'strato', cut: false, erupt: 'degas' },
      body: (
        <>
          <p>
            Pośrodku oceanów ciągną się podwodne łańcuchy górskie – <b>grzbiety śródoceaniczne</b>, w sumie ok. 65 tys. km. Tutaj płyty się <b>rozsuwają</b>. W szczelinę wciska się gorący płaszcz, a gdy spada ciśnienie, część skał się topi – jak w szybkowarze, w którym nagle otwarto zawór. Wylewająca się lawa tworzy nowe dno oceanu.
          </p>
          <p>
            Na grzbietach powstaje co roku więcej lawy niż we wszystkich innych wulkanach razem – ale prawie wszystko pod wodą. Jedno z nielicznych miejsc, gdzie grzbiet wychodzi na ląd, to <b>Islandia</b>: wyspa rozsuwa się o ok. 2 cm na rok.
          </p>
        </>
      ),
    }),
    vol({
      title: 'Plama gorąca: Hawaje',
      ...tecCam(),
      preset: { mode: 'tec-hot', type: 'strato', cut: false, erupt: 'degas' },
      body: (
        <>
          <p>
            Niektóre wulkany leżą daleko od granic płyt. Pod nimi z głębi płaszcza wznosi się słup wyjątkowo gorącej skały – <b>plama gorąca</b>. Plama stoi w miejscu, a płyta sunie nad nią jak taśma nad palnikiem. Nad plamą rośnie wulkan, płyta go odsuwa, wulkan gaśnie – i obok wyrasta następny.
          </p>
          <p>
            Tak powstał łańcuch <b>Hawajów</b>: najmłodsza Wielka Wyspa ma czynne wulkany, starsze wyspy na zachód są coraz niższe i bardziej zniszczone, a najstarsze zamieniły się w atole i podwodne góry. Plamą gorąca jest też <b>Yellowstone</b> – tam płyta przesuwa się nad nią pod kontynentem.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= obserwacja ======================= */

const st = (i: number): V3 => [MON_STATIONS[i][0], rockH('strato', MON_STATIONS[i][0], MON_STATIONS[i][1]) + 3.5, MON_STATIONS[i][1]];
const monModule: PartModule = {
  id: 'obserwacja',
  title: 'Obserwacja wulkanu',
  summary: 'Sejsmometry, pomiar puchnięcia góry, gazy i kamery termowizyjne, poziomy alarmowe i ewakuacja, popiół a samoloty',
  steps: [
    vol({
      title: 'Obserwatorium wulkanu',
      camera: [30, 36, 40],
      target: [0, 8, -16],
      preset: { mode: 'mon-home', type: 'strato', cut: false, erupt: 'degas' },
      body: (
        <>
          <p>
            Najgroźniejsze wulkany świata są obserwowane przez całą dobę. Na ich zboczach stoją małe stacje pomiarowe zasilane z paneli słonecznych, które wysyłają dane drogą radiową do <b>obserwatorium</b>. Naukowcy porównują pomiary z tym, co działo się przed dawnymi erupcjami.
          </p>
          <p>Kliknij podpis przyrządu, żeby przeczytać, co mierzy. Numery na modelu prowadzą do zakładek: trzęsienia ziemi, puchnięcie góry, gazy i ciepło, alarm i ewakuacja oraz popiół a samoloty.</p>
        </>
      ),
    }),
    vol({
      title: 'Trzęsienia ziemi pod wulkanem',
      spot: st(0),
      camera: CUT_CAM,
      target: CUT_TGT,
      preset: { mode: 'mon-quake', type: 'strato', cut: true, erupt: 'degas' },
      controls: [RUN],
      body: (
        <>
          <p>
            Magma, która wciska się w górę, rozpycha i łamie skały. Każde pęknięcie to małe <b>trzęsienie ziemi</b> – zwykle za słabe, żeby je poczuć, ale sejsmometry wyczuwają je wyraźnie. Sejsmogram w ramce pokazuje drgania gruntu.
          </p>
          <p>Naciśnij „Rozpocznij”. Wstrząsów przybywa, a ich ogniska (żółte kółka w przekroju) przesuwają się coraz płycej – to znak, że magma idzie w górę. Przed erupcją pojawia się często ciągłe, rytmiczne drżenie – <b>drżenie wulkaniczne</b>, wywołane przepływem magmy i gazu.</p>
        </>
      ),
    }),
    vol({
      title: 'Wulkan puchnie',
      spot: st(1),
      camera: [40, 40, 58],
      target: [0, 10, -12],
      preset: { mode: 'mon-swell', type: 'strato', cut: false, erupt: 'degas' },
      controls: [RUN],
      body: (
        <>
          <p>
            Gdy do komory napływa magma, wulkan <b>nadyma się</b> jak balon – jego szczyt podnosi się o kilka, czasem kilkadziesiąt centymetrów. Odbiorniki <b>GPS</b> na zboczach mierzą swoje położenie z dokładnością do milimetrów i pokazują, że stacje rozsuwają się na boki i w górę (niebieskie strzałki – mocno przesadzone). Satelity radarowe tworzą mapy całej góry – widać na nich, który fragment zbocza się wybrzusza.
          </p>
          <p>Naciśnij „Rozpocznij”. Przed erupcją Mount St. Helens w 1980 r. północne zbocze wybrzuszało się o ok. 1,5 m na dobę – aż osunęło się w jednej wielkiej lawinie.</p>
        </>
      ),
    }),
    vol({
      title: 'Gazy i ciepło',
      spot: st(3),
      camera: [16, 34, 26],
      target: [2, 18, -6],
      preset: { mode: 'mon-gas', type: 'strato', cut: false, erupt: 'degas' },
      body: (
        <>
          <p>
            Gdy magma podchodzi bliżej powierzchni, wydziela więcej gazu, a w jego składzie przybywa <b>dwutlenku siarki</b>. Czujniki przy kraterze mierzą to wprost, a spektrometry wykrywają SO₂ w pióropuszu z odległości kilku kilometrów – po tym, jak gaz pochłania światło słoneczne. Coraz częściej nad kratery latają też <b>drony</b> z czujnikami.
          </p>
          <p><b>Kamery termowizyjne</b> widzą ciepło: nowe gorące miejsca w kraterze albo pęknięcia na zboczu mogą zdradzić magmę tuż pod powierzchnią. Satelity obserwują w ten sposób wulkany na całej Ziemi, także te, przy których nie ma żadnych przyrządów.</p>
        </>
      ),
    }),
    vol({
      title: 'Alarm i ewakuacja',
      spot: st(5),
      camera: [20, 70, 80],
      target: [0, 0, -24],
      preset: { mode: 'mon-alert', type: 'strato', cut: false, erupt: 'degas' },
      controls: [RUN],
      body: (
        <>
          <p>
            Obserwatorium ogłasza <b>poziom alarmowy</b>: zielony (spokój), żółty (niepokój), pomarańczowy (erupcja możliwa) i czerwony (erupcja trwa albo jest tuż-tuż). Wokół wulkanu wyznacza się <b>strefy zagrożenia</b>: najbliższą zamyka się już przy pomarańczowym alarmie, z dalszych ewakuuje się ludzi, gdy sytuacja się pogarsza.
          </p>
          <p>
            Naciśnij „Rozpocznij” i obserwuj, jak rosną wskazania, a z nimi poziom alarmu. W 1991 r. dzięki takim pomiarom przed erupcją <b>Pinatubo</b> na Filipinach ewakuowano ok. 60 tys. ludzi. Erupcja była jedną z największych w XX w., ale uratowano tysiące istnień.
          </p>
        </>
      ),
    }),
    vol({
      title: 'Popiół a samoloty',
      spot: [20, 56, -10],
      camera: [-60, 64, 110],
      target: [10, 40, -10],
      preset: { mode: 'mon-ash', type: 'strato', cut: false, erupt: 'plinian' },
      body: (
        <>
          <p>
            Popiół wulkaniczny to drobne szkło i skała. W silniku odrzutowym temperatura sięga ok. 1500 °C – popiół się w nim <b>topi</b> i osiada na łopatkach turbiny jak szkliwo, a potem silnik gaśnie. Popiół ściera też szyby kokpitu i zatyka czujniki prędkości.
          </p>
          <p>
            W 1982 r. Boeing 747 linii British Airways wleciał w chmurę popiołu wulkanu Galunggung w Indonezji i stracił wszystkie cztery silniki. Szybował przez 13 minut, zanim piloci zdołali uruchomić je ponownie. Dziś dziewięć centrów ostrzeżeń (VAAC) śledzi chmury popiołu na całym świecie. W 2010 r. erupcja islandzkiego Eyjafjallajökull zamknęła przestrzeń powietrzną nad Europą na prawie tydzień.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= życie przy wulkanie ======================= */

function FamousEruptions(_: SceneProps) {
  const list: [string, string, string][] = [
    ['79', 'Wezuwiusz, Włochy', 'Erupcja pliniańska pogrzebała Pompeje i Herkulanum. Dzięki popiołowi miasta przetrwały do dziś niemal nietknięte – z ulicami, freskami i odciskami ludzi.'],
    ['1783', 'Laki, Islandia', 'Erupcja szczelinowa trwała 8 miesięcy. Gazy zatruły pastwiska – zginęła jedna czwarta mieszkańców Islandii. Nad Europą wisiała siarkowa mgła.'],
    ['1815', 'Tambora, Indonezja', 'Największa erupcja w historii zapisanej (VEI 7). Rok 1816 nazwano „rokiem bez lata”: w Europie i Ameryce Północnej padał śnieg w czerwcu i nie było zbiorów.'],
    ['1883', 'Krakatau, Indonezja', 'Huk wybuchu słychać było 4800 km dalej, a fale tsunami zabiły ok. 36 tys. ludzi. Przez kolejne miesiące zachody słońca na całym świecie były krwistoczerwone.'],
    ['1902', 'Mont Pelée, Martynika', 'Chmura żaru w kilka minut zniszczyła miasto Saint-Pierre. Od tej erupcji pochodzi nazwa erupcji pelejskich.'],
    ['1980', 'Mount St. Helens, USA', 'Północne zbocze osunęło się w największej zarejestrowanej lawinie skalnej, a boczny wybuch powalił lasy na obszarze 600 km².'],
    ['1985', 'Nevado del Ruiz, Kolumbia', 'Niewielka erupcja stopiła lodowiec. Lahar zniszczył miasto Armero i zabił ok. 23 tys. ludzi.'],
    ['1991', 'Pinatubo, Filipiny', 'Druga co do wielkości erupcja XX w. Ewakuacja uratowała dziesiątki tysięcy osób. Siarka w stratosferze ochłodziła Ziemię o ok. 0,5 °C na dwa lata.'],
    ['2010', 'Eyjafjallajökull, Islandia', 'Niewielka erupcja pod lodowcem, ale chmura popiołu zamknęła niebo nad Europą: odwołano ok. 100 tys. lotów.'],
    ['2022', 'Hunga Tonga, Tonga', 'Podmorski wybuch wyrzucił kolumnę na 57 km – najwyższą zmierzoną. Fala ciśnienia kilkukrotnie okrążyła Ziemię.'],
  ];
  return (
    <div style={{ padding: '28px 28px 40px', maxWidth: 760, margin: '0 auto' }}>
      <h3 style={{ margin: '0 0 18px', fontSize: 22 }}>Słynne erupcje</h3>
      <div style={{ display: 'grid', gap: 12 }}>
        {list.map(([y, n, d]) => (
          <div key={y} style={{ display: 'grid', gridTemplateColumns: '74px 1fr', gap: 14, alignItems: 'start', background: 'rgba(234, 88, 12, 0.12)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#f97316', fontVariantNumeric: 'tabular-nums' }}>{y}</div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>{n}</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.85 }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const GEY: V3 = [40, 6, -22];
const lifeModule: PartModule = {
  id: 'zycie',
  title: 'Życie przy wulkanie',
  summary: 'Gejzery, gorące źródła i fumarole, żyzne gleby, elektrownie geotermalne i słynne erupcje w historii',
  steps: [
    vol({
      title: 'Gejzer',
      spot: GEY,
      camera: [70, 30, 30],
      target: [30, 2, -22],
      preset: { mode: 'life-geyser', type: 'strato', cut: false, erupt: 'degas' },
      body: (
        <>
          <p>
            <b>Gejzer</b> to gorące źródło, które co jakiś czas wyrzuca w górę słup wody i pary. Pod nim jest wąski kanał wypełniony wodą, ogrzewaną od dołu przez gorące skały. Woda na dnie kanału jest pod ciśnieniem słupa wody nad nią, więc może się nagrzać ponad 100 °C i nie zawrzeć – jak w szybkowarze.
          </p>
          <p>Gdy w końcu zawrze, para wypycha wodę z kanału. Ciśnienie spada i nagle wrze cała woda naraz – gejzer wybucha. Potem kanał powoli napełnia się znowu. Słynny Old Faithful w Yellowstone wybucha mniej więcej co półtorej godziny, a słowo „gejzer” pochodzi od islandzkiego Geysiru.</p>
          <p>Kliknij podpis na modelu, żeby przeczytać więcej. Numery prowadzą do zakładek o gorących źródłach, żyznych glebach i energii z wnętrza Ziemi.</p>
        </>
      ),
    }),
    vol({
      title: 'Gorące źródła i fumarole',
      spot: [44, 4, -24],
      camera: [64, 22, 6],
      target: [40, 2, -22],
      preset: { mode: 'life-springs', type: 'strato', cut: false, erupt: 'degas' },
      body: (
        <>
          <p>
            Woda deszczowa wsiąka głęboko, nagrzewa się od gorących skał i wraca na powierzchnię jako <b>gorące źródło</b>. Barwne obwódki wokół takich źródeł to kolonie bakterii, które lubią gorąco – każdy gatunek żyje w innej temperaturze, więc tworzą kolorowe pierścienie. Gdzie wody jest mało, a gazów dużo, powstają <b>fumarole</b> (dymiące otwory) i <b>błotne garnki</b>, w których bulgocze gorące błoto.
          </p>
          <p>W Japonii przy gorących źródłach – onsenach – kąpią się ludzie, a w parku Jigokudani nawet małpy.</p>
        </>
      ),
    }),
    vol({
      title: 'Żyzne gleby',
      spot: [-20, 12, -28],
      camera: [-70, 40, 30],
      target: [-20, 4, -30],
      preset: { mode: 'life-soil', type: 'strato', cut: false, erupt: 'degas' },
      body: (
        <>
          <p>
            Popiół wulkaniczny jest bogaty w składniki potrzebne roślinom: potas, fosfor, magnez i żelazo. Po kilkudziesięciu latach zamienia się w jedne z najżyźniejszych gleb na Ziemi. Na zboczach Etny i Wezuwiusza rosną winorośle i cytryny, a na Jawie ryż zbiera się nawet trzy razy w roku.
          </p>
          <p>Dlatego ludzie od tysięcy lat osiedlają się pod wulkanami – choć wiedzą, że któregoś dnia mogą się obudzić.</p>
        </>
      ),
    }),
    vol({
      title: 'Energia z wnętrza Ziemi',
      spot: [-42, 8, -12],
      camera: [-44, 10, 46],
      target: [-40, -4, -6],
      preset: { mode: 'life-geo', type: 'strato', cut: true, erupt: 'degas' },
      body: (
        <>
          <p>
            Gorące skały nad komorą magmową to ogromny zapas ciepła. <b>Elektrownia geotermalna</b> wierci otwory na głębokość 1–3 km i wydobywa gorącą wodę i parę (czerwona rura). Para kręci turbinami, które napędzają prądnice, a ostudzona woda wraca pod ziemię (niebieska rura), żeby znów się nagrzać.
          </p>
          <p>Na Islandii z ciepła Ziemi pochodzi ok. jednej trzeciej prądu, a gorąca woda ogrzewa prawie wszystkie domy, a nawet chodniki w Reykjavíku zimą. W Polsce też korzysta się z ciepłych wód z głębi – np. na Podhalu ogrzewają one Zakopane.</p>
        </>
      ),
    }),
    {
      kind: 'page',
      scene: FamousEruptions,
      title: 'Słynne erupcje',
      body: (
        <>
          <p>Dziesięć erupcji, które zmieniły historię: od Pompejów po Hunga Tonga. Wiele z nich nauczyło nas czegoś nowego o wulkanach – i o tym, jak się przed nimi chronić.</p>
        </>
      ),
    },
  ],
};

export const volcano: Topic = {
  id: 'wulkan',
  title: 'Wulkan – od komory magmowej po chmurę popiołu',
  subject: 'przyroda',
  summary: 'Wulkan w przekroju: komora magmowa, komin i erupcja. Dziesięć rodzajów wulkanów, osiem rodzajów erupcji, wszystko, co wyrzuca wulkan, tektonika płyt, obserwacja i życie przy wulkanie.',
  accent: '#ea580c',
  glyph: '🌋',
  steps: overview,
  modules: [insideModule, typesModule, eruptModule, productsModule, tecModule, monModule, lifeModule],
};

