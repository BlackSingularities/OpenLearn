import type { ReactNode } from 'react';
import type { Control, PartModule, Step, Topic } from '../../lib/types';
import { useTopicNav } from '../../lib/topicNav';
import { HydroScene } from './hydroScene';
import { CREST, CUT_X, FRAME, GEN, LEVEL, PH, SPILL, SWY, TU, WEIR_Z, cz, type V3 } from './hydroGeo';
import { GATE_LAB, LAB } from './hydroFx';

/* ======================= pomocnicze ======================= */

const hyd = (s: Omit<Step, 'kind' | 'scene' | 'stageKey' | 'frame'>): Step => ({ kind: '3d', scene: HydroScene, stageKey: 'hydro', frame: FRAME, ...s });
const RUN: Control = { type: 'button', key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false };

function Open({ id, children }: { id: string; children: ReactNode }) {
  const nav = useTopicNav();
  return (
    <button type="button" className="module-open" onClick={() => nav?.openModule(id)}>
      {children}
      <span aria-hidden>→</span>
    </button>
  );
}

const HOME_CAM: V3 = [430, 250, 560];
const HOME_TGT: V3 = [-20, 40, 60];
const CUT_CAM: V3 = [CUT_X - 165, 55, 72];
const CUT_TGT: V3 = [CUT_X, 26, 48];
const TURB_CAM: V3 = [CUT_X - 52, 9, 96];
const TURB_TGT: V3 = [CUT_X, 0, 86];
const GEN_CAM: V3 = [CUT_X - 30, 18, 97];
const GEN_TGT: V3 = [CUT_X, 11, 82];
const SPILL_CAM: V3 = [160, 100, 200];
const SPILL_TGT: V3 = [40, 38, 60];
const LAKE_CAM: V3 = [460, 320, 260];
const LAKE_TGT: V3 = [0, 70, -600];
const HALL_CAM: V3 = [50, 80, 175];
const HALL_TGT: V3 = [-30, 12, 78];
const WEIR_CAM: V3 = [cz(WEIR_Z) + 4, 24, WEIR_Z + 46];
const WEIR_TGT: V3 = [cz(WEIR_Z) - 37, 2, WEIR_Z];
const GRID_CAM: V3 = [140, 150, 440];
const GRID_TGT: V3 = [-170, 30, 150];
const RAIN_CAM: V3 = [760, 400, 520];
const RAIN_TGT: V3 = [0, 140, -700];
const LAB_CAM: V3 = [LAB[0], LAB[1] + 3, LAB[2] + 60];
const X = CUT_X - 1;

/* ======================= przegląd ======================= */

const overview: Step[] = [
  hyd({
    title: 'Elektrownia wodna',
    camera: HOME_CAM,
    target: HOME_TGT,
    preset: { mode: 'home' },
    body: (
      <>
        <p>
          <b>Elektrownia wodna</b> zamienia na prąd energię spadającej wody. Zapora zatrzymuje rzekę i podnosi jej poziom. Powstaje jezioro – <b>zbiornik</b>. Woda ze zbiornika spływa rurami w dół, do turbin u stopy zapory, i kręci nimi. Turbiny obracają generatory. Nic się tu nie spala, a woda po drodze nie ubywa.
        </p>
        <p>
          Przed Tobą zapora wysoka na ok. <b>82 m</b> w górskiej dolinie i elektrownia z czterema turbinami o łącznej mocy ok. <b>200 MW</b>. Wzorowaliśmy się na Solinie w Bieszczadach – to najwyższa zapora w Polsce. Poniżej elektrowni jest drugi, mniejszy zbiornik zamknięty jazem.
        </p>
        <p>Kliknij podpis na modelu, żeby otworzyć moduł: zapora, turbina i generator, energia wody, przelew i powódź, elektrownia szczytowo-pompowa oraz rzeka i sieć. Model możesz obracać myszą i przybliżać kółkiem.</p>
      </>
    ),
  }),
  hyd({
    title: 'Zapora',
    camera: CUT_CAM,
    target: CUT_TGT,
    preset: { mode: 'tour-za' },
    body: (
      <>
        <p>
          Przecięliśmy zaporę i elektrownię w poprzek. Zapora jest trójkątem z betonu: wąska u góry, szeroka u dołu. Po lewej stronie stoi woda, po prawej – elektrownia. Ciemne otwory to korytarze wewnątrz betonu, a ukośna rura prowadzi wodę do turbiny.
        </p>
        <p>
          <Open id="zapora">Otwórz moduł: zapora</Open>
        </p>
      </>
    ),
  }),
  hyd({
    title: 'Turbina i generator',
    camera: TURB_CAM,
    target: TURB_TGT,
    preset: { mode: 'tour-tu' },
    body: (
      <>
        <p>
          Pod halą elektrowni, w betonie, jest <b>turbina</b>. Woda (niebieskie kulki) wpływa do niej z rurociągu, obraca wirnik i wypływa w dół do rzeki. Wirnik siedzi na wale, który wychodzi w górę, do <b>generatora</b> stojącego na podłodze hali.
        </p>
        <p>
          <Open id="turbina">Otwórz moduł: turbina i generator</Open>
        </p>
      </>
    ),
  }),
  hyd({
    title: 'Energia wody',
    camera: HOME_CAM,
    target: HOME_TGT,
    preset: { mode: 'tour-en' },
    body: (
      <>
        <p>
          Ile prądu da elektrownia, zależy od dwóch rzeczy: z jakiej wysokości spada woda (<b>spad</b>) i ile jej spada w każdej sekundzie (<b>przepływ</b>). A skąd woda w górach? Podnosi ją tam Słońce – paruje ona z mórz i jezior, a potem spada jako deszcz i śnieg.
        </p>
        <p>
          <Open id="energia">Otwórz moduł: energia wody</Open>
        </p>
      </>
    ),
  }),
  hyd({
    title: 'Przelew i powódź',
    camera: SPILL_CAM,
    target: SPILL_TGT,
    preset: { mode: 'tour-po' },
    body: (
      <>
        <p>
          Gdy wody jest więcej, niż zmieszczą turbiny, podnosi się zamknięcia <b>przelewu</b> i woda płynie po ścianie zapory. Zbiornik chroni też dolinę przed powodzią: zatrzymuje część wezbranej wody i wypuszcza ją powoli.
        </p>
        <p>
          <Open id="powodz">Otwórz moduł: przelew i powódź</Open>
        </p>
      </>
    ),
  }),
  hyd({
    title: 'Elektrownia szczytowo-pompowa',
    camera: HOME_CAM,
    target: HOME_TGT,
    preset: { mode: 'tour-pp' },
    body: (
      <>
        <p>
          Ta elektrownia potrafi też działać jak wielka bateria. W nocy, gdy prądu jest za dużo, pompuje wodę ze zbiornika dolnego z powrotem do górnego. W dzień, gdy prąd jest potrzebny, wypuszcza ją przez turbiny.
        </p>
        <p>
          <Open id="pompowa">Otwórz moduł: elektrownia szczytowo-pompowa</Open>
        </p>
      </>
    ),
  }),
  hyd({
    title: 'Rzeka i sieć',
    camera: GRID_CAM,
    target: GRID_TGT,
    preset: { mode: 'tour-si' },
    body: (
      <>
        <p>
          Prąd z generatorów (żółte kulki) płynie przez transformatory i rozdzielnię do linii. Elektrownia wodna rusza w ok. 2 minuty – dlatego jest szybką rezerwą dla całej sieci. A poniżej, przy jazie, ryby mogą ominąć przeszkodę specjalnymi schodkami.
        </p>
        <p>
          <Open id="siec">Otwórz moduł: rzeka i sieć</Open>
        </p>
      </>
    ),
  }),
];

/* ======================= zapora ======================= */

const damModule: PartModule = {
  id: 'zapora',
  title: 'Zapora',
  summary: 'Zapora ciężka w przekroju, napór wody, zapory ciężkie, łukowe i ziemne, zbiornik',
  steps: [
    hyd({
      title: 'Zapora w przekroju',
      camera: CUT_CAM,
      target: CUT_TGT,
      preset: { mode: 'za-home' },
      body: (
        <>
          <p>
            To <b>zapora ciężka</b>. Nie ma w niej żadnych podpór ani lin – wodę zatrzymuje sam ciężar betonu, który mocno przyciska zaporę do skały. Kształt trójkąta nie jest przypadkowy: na dole, gdzie woda pcha najmocniej, betonu jest najwięcej.
          </p>
          <p>Kliknij podpis części. Numery na modelu prowadzą do zakładek: napór wody, rodzaje zapór i zbiornik.</p>
        </>
      ),
    }),
    hyd({
      title: 'Napór wody',
      spot: [X, 30, -4],
      camera: [CUT_X - 140, 45, 20],
      target: [CUT_X, 36, 18],
      preset: { mode: 'za-push' },
      controls: [{ type: 'slider', key: 'level', label: 'Poziom wody w zbiorniku', min: 10, max: 80, step: 1, default: 76, unit: ' m' }],
      body: (
        <>
          <p>
            Przesuń suwak i zmień poziom wody. Strzałki pokazują, jak mocno woda pcha na zaporę na różnych głębokościach. Przy powierzchni prawie wcale, a im głębiej, tym mocniej – bo na każdą warstwę wody naciska cała woda nad nią. Tak samo bolą uszy, gdy nurkujesz głęboko w basenie.
          </p>
          <p>
            Przy dnie, ok. 76 m pod powierzchnią, woda naciska na każdy metr kwadratowy zapory z siłą ok. 75 t. Na cały pas zapory szerokości 1 m pcha z siłą ok. 2900 t. Ten pas waży jednak prawie 8000 t – dlatego zapora się nie przesuwa ani nie przewraca.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Rodzaje zapór',
      spot: [X, CREST + 3, 5],
      camera: [-260, 130, 260],
      target: [0, 30, 20],
      preset: { mode: 'za-types' },
      controls: [
        {
          type: 'select',
          key: 'kind',
          label: 'Rodzaj zapory',
          default: 'lukowa',
          options: [
            { value: 'ciezka', label: 'ciężka (betonowa)' },
            { value: 'lukowa', label: 'łukowa' },
            { value: 'ziemna', label: 'ziemna' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Zmień rodzaj zapory na liście. <b>Zapora łukowa</b> jest cienka i wygięta w stronę wody, jak łuk mostu położony na boku. Napór wody przenosi na skalne zbocza doliny. Potrzeba na nią kilka razy mniej betonu, ale tylko w wąskim wąwozie z bardzo mocną skałą.
          </p>
          <p>
            <b>Zapora ziemna</b> to ogromny nasyp z ziemi i kamieni o łagodnych zboczach. Ziemia przepuszcza wodę, dlatego w środku jest rdzeń z gliny, który ją zatrzymuje. Takie zapory buduje się w szerokich dolinach, gdzie pod spodem nie ma mocnej skały – w Polsce na przykład w Czorsztynie.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Zbiornik',
      spot: [-40, LEVEL + 4, -160],
      camera: LAKE_CAM,
      target: LAKE_TGT,
      preset: { mode: 'za-lake' },
      body: (
        <>
          <p>
            Za zaporą zalana dolina zamieniła się w jezioro długie na kilkadziesiąt kilometrów. Zbiornik w Solinie mieści ok. 470 mln m³ wody – tyle, że Polacy mogliby z niego pić przez kilka miesięcy.
          </p>
          <p>
            Zbiornik ma wiele zadań naraz. Daje wodę do turbin, chroni przed powodzią, w suche lato dodaje wody rzece, a wokół powstają plaże i przystanie. Ma też wady: zalewa wsie i lasy, a rzeka niesie piasek i muł, które osiadają w zbiorniku i przez lata go zapełniają.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= turbina ======================= */

const turbineModule: PartModule = {
  id: 'turbina',
  title: 'Turbina i generator',
  summary: 'Hydrozespół w przekroju, droga wody, kierownica i moc, turbiny Peltona, Francisa i Kaplana, generator',
  steps: [
    hyd({
      title: 'Pod halą elektrowni',
      camera: [CUT_X - 52, 13, 100],
      target: [CUT_X, 4.5, 80],
      preset: { mode: 'tu-home' },
      body: (
        <>
          <p>
            Turbina z generatorem to <b>hydrozespół</b>. Na rysunku jest jeden z czterech, przecięty na pół wzdłuż osi. Woda płynie od lewej: rurociągiem do spirali, przez kierownicę do wirnika i rurą ssawną dalej do rzeki. Wszystko, co się kręci, jest połączone jednym pionowym wałem.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: droga wody, kierownica i moc, rodzaje turbin i generator.</p>
        </>
      ),
    }),
    hyd({
      title: 'Droga wody',
      spot: [X, 30, 28],
      camera: [CUT_X - 140, 40, 60],
      target: [CUT_X, 18, 50],
      preset: { mode: 'tu-path' },
      body: (
        <>
          <p>
            Śledź niebieskie kulki. Woda wpływa przez kraty do <b>rurociągu</b> ok. 34 m pod powierzchnią zbiornika – tak głęboko, żeby nawet przy niskim poziomie wody nie wciągało powietrza. Rurociągiem spada w dół i na dole ma ciśnienie ok. 7 atmosfer.
          </p>
          <p>
            W turbinie ciśnienie zamienia się w szybki ruch: woda pędzi przez łopatki wirnika i pcha je. Oddaje przy tym prawie całą energię. Rurą ssawną wypływa już powoli i spokojnie wpada do zbiornika dolnego.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Kierownica i moc',
      spot: [X, TU.y + 1, TU.z + 4],
      camera: [GATE_LAB[0], GATE_LAB[1] + 46, GATE_LAB[2] + 30],
      target: GATE_LAB,
      preset: { mode: 'tu-gate' },
      controls: [{ type: 'slider', key: 'gate', label: 'Otwarcie kierownicy', min: 0, max: 100, step: 5, default: 60, unit: '%' }],
      body: (
        <>
          <p>
            Patrzysz z góry na powiększony środek turbiny. Wokół wirnika stoi pierścień żółtych łopatek – <b>kierownica</b>. Przesuń suwak. Gdy łopatki się zamykają, przylegają do siebie jak żaluzja i woda nie płynie. Gdy się otwierają, przepuszczają coraz więcej wody i turbina daje więcej mocy.
          </p>
          <p>
            Łopatki kierują też wodę tak, żeby uderzała w wirnik pod dobrym kątem. Komputer zmienia ich położenie co chwilę – sieć raz potrzebuje więcej prądu, raz mniej, a wirnik musi przy tym kręcić się zawsze tak samo szybko.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Rodzaje turbin',
      spot: [X, TU.y - 2, TU.z],
      camera: LAB_CAM,
      target: LAB,
      preset: { mode: 'tu-types' },
      body: (
        <>
          <p>
            Turbinę dobiera się do spadu i ilości wody. <b>Koło Peltona</b> (po lewej) to koło z czarkami, w które bije cienki, bardzo szybki strumień z dyszy. Pasuje wysoko w górach, gdzie woda spada z setek metrów, ale jest jej mało.
          </p>
          <p>
            <b>Turbina Francisa</b> (w środku) jest w tej elektrowni – sprawdza się przy średnich spadach. <b>Turbina Kaplana</b> (po prawej) wygląda jak śmigło statku. Jej łopaty same się przestawiają. Pracuje na dużych nizinnych rzekach, gdzie spad jest mały, a wody dużo – jak we Włocławku na Wiśle.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Generator',
      spot: [X, GEN.y1 + 1, TU.z],
      camera: GEN_CAM,
      target: GEN_TGT,
      preset: { mode: 'tu-gen' },
      body: (
        <>
          <p>
            W <b>generatorze</b> na wale kręci się koło z 24 elektromagnesami – <b>biegunami</b> (czerwone). Wokół stoi nieruchomy <b>stojan</b> z miedzianym uzwojeniem. Gdy bieguny przelatują obok drutów, płynie w nich prąd.
          </p>
          <p>
            Turbina wodna kręci się wolno – 250 razy na minutę, dwanaście razy wolniej niż w elektrowni węglowej. Żeby mimo to dać prąd o częstotliwości 50 Hz, generator ma dużo biegunów i dużą średnicę, ok. 12 m. Dlatego hydrozespół wygląda jak wielki płaski bęben.
          </p>
          <p>
            W przekroju widać też części pomocnicze. Cały wirujący zespół wisi na <b>łożysku oporowym</b> nad generatorem. Generator się grzeje, więc wokół stojana stoją <b>chłodnice</b>: kręcący się wirnik przepycha przez nie powietrze jak wentylator, a woda w rurkach zabiera ciepło. Na górze, w małej kopule, prąd do elektromagnesów wpływa przez miedziane <b>pierścienie ślizgowe</b>.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= energia ======================= */

const energyModule: PartModule = {
  id: 'energia',
  title: 'Energia wody',
  summary: 'Spad i przepływ, ile mocy daje woda, skąd woda w górach, bilans energii',
  steps: [
    hyd({
      title: 'Skąd energia',
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'en-home' },
      body: (
        <>
          <p>
            Woda w zbiorniku jest wysoko – ma <b>energię położenia</b>, tak jak kamień trzymany nad ziemią. Gdy spada, ta energia zamienia się w ruch. Elektrownia wodna łapie ten ruch w turbinach i zamienia na prąd.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: spad i przepływ, skąd się bierze woda i bilans energii.</p>
        </>
      ),
    }),
    hyd({
      title: 'Spad i przepływ',
      spot: [-90, 40, 70],
      camera: [210, 150, 430],
      target: [-30, 36, 60],
      preset: { mode: 'en-power' },
      controls: [
        { type: 'slider', key: 'level', label: 'Poziom wody w zbiorniku', min: 40, max: 80, step: 1, default: 76, unit: ' m' },
        { type: 'slider', key: 'flow', label: 'Przepływ przez turbiny', min: 0, max: 320, step: 10, default: 320, unit: ' m³/s' },
      ],
      body: (
        <>
          <p>
            Moc elektrowni zależy od <b>spadu</b> (różnicy poziomów wody przed zaporą i za nią) i od <b>przepływu</b> (ilości wody na sekundę). Przesuń suwaki: dwa razy większy spad albo dwa razy więcej wody to dwa razy więcej mocy.
          </p>
          <p>
            Dlatego zapory buduje się wysokie, a elektrownie stawia na rzekach, które niosą dużo wody. W suche lato, gdy w zbiorniku jest mniej wody, spad maleje i elektrownia daje mniej prądu. Jeśli wody brakuje dłużej, trzeba ją oszczędzać.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Skąd się bierze woda',
      spot: [-60, LEVEL + 3, -500],
      camera: RAIN_CAM,
      target: RAIN_TGT,
      preset: { mode: 'en-cycle' },
      body: (
        <>
          <p>
            Woda nie zużywa się w elektrowni – płynie dalej rzeką do morza. Tam Słońce ją ogrzewa i woda paruje. Para unosi się, tworzy chmury, a wiatr niesie je nad góry. Tam woda spada jako deszcz i śnieg i spływa rzeką z powrotem do zbiornika.
          </p>
          <p>
            Energia wody to więc tak naprawdę energia Słońca, które co roku podnosi w górę ogromne ilości wody. Dlatego elektrownia wodna jest <b>odnawialnym</b> źródłem energii – tak długo, jak pada deszcz.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Bilans energii',
      spot: [-30, PH.roof + 4, 80],
      camera: HALL_CAM,
      target: HALL_TGT,
      preset: { mode: 'en-sankey' },
      body: (
        <>
          <p>
            Z energii spadającej wody ok. <b>89%</b> zamienia się w prąd. To najlepszy wynik ze wszystkich elektrowni – węglowa zamienia na prąd ok. 45% energii węgla, a jądrowa ok. 33% ciepła z reaktora.
          </p>
          <p>
            Po drodze trochę energii ginie: woda trze o ściany rurociągu i przeciska się przez kraty, w turbinie część energii zamienia się w zawirowania wody, a w generatorze i transformatorze – w ciepło. Nie ma tu jednak ogromnych strat ciepła, jakie są w elektrowniach parowych.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= przelew i powódź ======================= */

const floodModule: PartModule = {
  id: 'powodz',
  title: 'Przelew i powódź',
  summary: 'Przelew z zamknięciami, wezbranie i ochrona przed powodzią, niecka wypadowa',
  steps: [
    hyd({
      title: 'Przelew',
      camera: SPILL_CAM,
      target: SPILL_TGT,
      preset: { mode: 'po-home' },
      body: (
        <>
          <p>
            Turbiny przepuszczają najwyżej ok. 320 m³ wody na sekundę. W czasie roztopów i ulew rzeka niesie jej wielokrotnie więcej. Gdyby woda przelała się przez koronę, mogłaby podmyć zaporę. Dlatego każda zapora ma <b>przelew</b> – bezpieczną drogę dla nadmiaru wody.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: wielka woda i niecka wypadowa.</p>
        </>
      ),
    }),
    hyd({
      title: 'Wielka woda',
      spot: [(SPILL.x0 + SPILL.x1) / 2, CREST + 3, -6],
      camera: [150, 150, 260],
      target: [20, 40, 30],
      preset: { mode: 'po-flood' },
      controls: [RUN],
      body: (
        <>
          <p>
            Naciśnij „Rozpocznij”. Ulewa w górach – rzeka wpływająca do zbiornika niesie coraz więcej wody. Zbiornik ją przyjmuje i poziom wody się podnosi. Gdy przekroczy poziom normalny, zamknięcia przelewu powoli się otwierają.
          </p>
          <p>
            Popatrz na wykres. W szczycie fali do zbiornika wpływa ok. 2400 m³/s, a zapora wypuszcza dużo mniej. Resztę wody zbiornik zatrzymuje i oddaje powoli, gdy fala minie. Dolina poniżej dostaje mniej wody naraz, więc rzeka nie wylewa. Dlatego przed porą powodzi poziom w zbiorniku specjalnie się obniża – zostawia się miejsce na wielką wodę.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Niecka wypadowa',
      spot: [(SPILL.x0 + SPILL.x1) / 2, 12, 96],
      camera: [112, 40, 212],
      target: [38, 4, 92],
      preset: { mode: 'po-basin' },
      controls: [{ type: 'slider', key: 'spill', label: 'Otwarcie zamknięć przelewu', min: 0, max: 100, step: 5, default: 60, unit: '%' }],
      body: (
        <>
          <p>
            Woda spadająca po ścianie zapory nabiera ogromnej prędkości – ponad 100 km/h. Gdyby tak uderzyła w dno rzeki, wyrwałaby kamienie i wyżłobiła głęboki dół tuż przy zaporze. Przesuń suwak i zobacz, jak spieniona woda kłębi się u stopy.
          </p>
          <p>
            Ta betonowa „wanna” to <b>niecka wypadowa</b>. Na jej końcu jest próg. Szybka woda wpada na spokojną wodę w niecce, nagle zwalnia, piętrzy się i burzy. W tym zawirowaniu traci energię i dalej płynie już spokojnie.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= szczytowo-pompowa ======================= */

const pumpModule: PartModule = {
  id: 'pompowa',
  title: 'Elektrownia szczytowo-pompowa',
  summary: 'Zbiornik górny i dolny, doba z magazynem energii, Żarnowiec',
  steps: [
    hyd({
      title: 'Dwa zbiorniki',
      camera: [430, 390, 1230],
      target: [20, 20, 330],
      preset: { mode: 'pp-home' },
      body: (
        <>
          <p>
            Elektrownia <b>szczytowo-pompowa</b> ma dwa zbiorniki: górny i dolny. Jej hydrozespoły są odwracalne. Gdy wirnik kręci się w jedną stronę, woda płynie z góry w dół i generator daje prąd. Gdy kręci się w drugą stronę, generator działa jak silnik, a turbina jak pompa, i woda płynie w górę.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: doba z magazynem energii i Żarnowiec.</p>
        </>
      ),
    }),
    hyd({
      title: 'Doba z magazynem energii',
      spot: [-30, PH.roof + 4, 80],
      camera: HALL_CAM,
      target: HALL_TGT,
      preset: { mode: 'pp-day' },
      controls: [RUN],
      body: (
        <>
          <p>
            Naciśnij „Rozpocznij”. W nocy ludzie śpią i prądu potrzeba mało, a elektrownie węglowe i wiatraki dalej go wytwarzają. Wtedy elektrownia kupuje tani prąd i pompuje wodę w górę (niebieskie kulki). W południe może pompować znowu – gdy słońce daje dużo prądu.
          </p>
          <p>
            Rano i wieczorem, w <b>szczycie</b> zapotrzebowania, woda spływa przez turbiny i prąd płynie do sieci (żółte kulki). Z każdych 100 kWh zużytych na pompowanie wraca ok. 75 kWh. Opłaca się to, bo prąd w szczycie jest dużo cenniejszy, a sieć dostaje go dokładnie wtedy, gdy go brakuje.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Żarnowiec',
      spot: [cz(500), 6, 500],
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'pp-zarn' },
      body: (
        <>
          <p>
            Największa elektrownia wodna w Polsce nie stoi w górach, tylko na Pomorzu – w <b>Żarnowcu</b>. Na wzgórzu zbudowano sztuczny zbiornik górny, a dolnym jest Jezioro Żarnowieckie. Rzeka nie jest tu potrzebna: ta sama woda krąży w górę i w dół.
          </p>
          <p>
            Pełny zbiornik górny to ok. 3,6 GWh energii – tyle, ile ok. 20 tysięcy domów zużywa przez miesiąc. Elektrownie szczytowo-pompowe to dziś największe magazyny energii na świecie. Im więcej wiatraków i paneli słonecznych w sieci, tym bardziej są potrzebne.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= rzeka i sieć ======================= */

const gridModule: PartModule = {
  id: 'siec',
  title: 'Rzeka i sieć',
  summary: 'Od generatora do linii, szybki rozruch, przepławka dla ryb, energia wodna w Polsce i na świecie',
  steps: [
    hyd({
      title: 'Od generatora do linii',
      camera: GRID_CAM,
      target: GRID_TGT,
      preset: { mode: 'si-home' },
      body: (
        <>
          <p>
            Prąd z czterech generatorów płynie przez transformatory na pomoście za halą, potem linią nad rzeką do <b>rozdzielni</b> na terasie i dalej linią 220 kV do sieci w całym kraju.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: szybki start, ryby i rzeka oraz woda w Polsce.</p>
        </>
      ),
    }),
    hyd({
      title: 'Szybki start',
      spot: [-30, PH.roof + 3, 80],
      camera: HALL_CAM,
      target: HALL_TGT,
      preset: { mode: 'si-start' },
      controls: [RUN],
      body: (
        <>
          <p>
            Naciśnij „Rozpocznij”. Gdy w sieci nagle zabraknie mocy – na przykład wyłączy się duży blok węglowy – dyspozytor wysyła polecenie. Kierownica się uchyla, wirnik nabiera obrotów, generator łączy się z siecią i w ok. <b>2 minuty</b> daje pełną moc.
          </p>
          <p>
            Elektrownia węglowa albo jądrowa potrzebuje na to wielu godzin: trzeba nagrzać kocioł i turbinę. Dlatego w Polsce elektrownie wodne są przede wszystkim szybką rezerwą. Potrafią też uruchomić się bez prądu z zewnątrz i pomóc odbudować sieć po rozległej awarii.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Ryby i rzeka',
      spot: [cz(WEIR_Z) - 37, 7, WEIR_Z - 20],
      camera: WEIR_CAM,
      target: WEIR_TGT,
      preset: { mode: 'si-fish' },
      body: (
        <>
          <p>
            Zapora i jaz zagradzają rzekę także rybom. Łososie, trocie czy brzany płyną w górę rzeki na tarło, a przez wysoką ścianę nie przeskoczą. Przy jazie zbudowano dla nich <b>przepławkę</b>: schodki z basenów, każdy trochę wyżej od poprzedniego. Ryby przeskakują z jednego do drugiego jak po stopniach.
          </p>
          <p>
            Elektrownia zmienia też rzekę inaczej: zbiornik zatrzymuje piasek i muł, a woda wypuszczana z głębi jest zimna. Dlatego zbiornik dolny wyrównuje przepływ, a w rzece zawsze musi płynąć określona ilość wody – nawet gdy turbiny stoją.
          </p>
        </>
      ),
    }),
    hyd({
      title: 'Woda w Polsce',
      spot: [(SWY.x0 + SWY.x1) / 2, SWY.y + 6, SWY.z1],
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'si-poland' },
      body: (
        <>
          <p>
            W Norwegii prawie cały prąd pochodzi z wody – kraj ma wysokie góry i dużo opadów. W Polsce energia z wody to tylko ok. 2% prądu. Mamy mało gór, a nasze rzeki płyną głównie przez niziny, gdzie spad jest mały.
          </p>
          <p>
            Największe polskie elektrownie wodne to elektrownie szczytowo-pompowe – magazyny energii. Ich rola rośnie, bo pomagają wyrównać prąd z wiatraków i paneli słonecznych. Największa na świecie elektrownia wodna, Trzy Przełomy w Chinach, ma moc ok. 22 500 MW – sto razy więcej niż Solina.
          </p>
        </>
      ),
    }),
  ],
};

export const hydroPlant: Topic = {
  id: 'elektrownia-wodna',
  title: 'Elektrownia wodna',
  subject: 'energetyka',
  summary: 'Zapora i elektrownia w górskiej dolinie w 3D: zapora w przekroju, turbina i generator, energia wody, przelew i powódź, elektrownia szczytowo-pompowa, rzeka i sieć.',
  accent: '#0891b2',
  glyph: '💧',
  steps: overview,
  modules: [damModule, turbineModule, energyModule, floodModule, pumpModule, gridModule],
};

