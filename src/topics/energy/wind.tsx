import type { ReactNode } from 'react';
import type { Control, PartModule, SceneProps, Step, Topic } from '../../lib/types';
import { useTopicNav } from '../../lib/topicNav';
import { WindScene } from './windScene';
import { FARM, FRAME, HUB, HUB_Y, R, SUBSTATION, T, VILLAGE, type V3 } from './windGeo';
import { BATTERY, LIFT_R, MAST, PYLONS } from './windExtras';

/* ======================= pomocnicze ======================= */

const wind = (s: Omit<Step, 'kind' | 'scene' | 'stageKey' | 'frame'>): Step => ({ kind: '3d', scene: WindScene, stageKey: 'wind', frame: FRAME, ...s });
const RUN: Control = { type: 'button', key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false };
const WIND = (def: number, min = 0, max = 30): Control => ({ type: 'slider', key: 'wind', label: 'Prędkość wiatru', min, max, step: 0.5, default: def, unit: 'm/s' });
const DIR = (def: number): Control => ({ type: 'slider', key: 'dir', label: 'Kierunek wiatru', min: 0, max: 355, step: 5, default: def, unit: '°' });
const TH = T.towerH;
const H0 = HUB[0];

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

const HOME_CAM: V3 = [300, 120, 260];
const HOME_TGT: V3 = [0, 95, 0];
const NAC_CAM: V3 = [6, TH + 11, 24];
const NAC_TGT: V3 = [-2, TH + 2.2, 0];
const AIR_CAM: V3 = [450, 600, 850];
const AIR_TGT: V3 = [150, 0, 150];
const FARM_CAM: V3 = [300, 420, 520];
const FARM_TGT: V3 = [-450, 60, 0];

/* ======================= przegląd ======================= */

const overview: Step[] = [
  wind({
    title: 'Elektrownia wiatrowa',
    camera: HOME_CAM,
    target: HOME_TGT,
    preset: { mode: 'home' },
    body: (
      <>
        <p>
          <b>Elektrownia wiatrowa</b> zamienia ruch powietrza w prąd elektryczny. Wiatr popycha trzy długie łopaty, wirnik obraca wał, a generator w gondoli na szczycie wieży wytwarza prąd – bez spalania czegokolwiek i bez dymu.
        </p>
        <p>
          Przed Tobą typowa współczesna turbina lądowa o mocy <b>4,5 MW</b>: wieża ma 117 m, a wirnik – 150 m średnicy. Razem z końcem łopaty w najwyższym położeniu to prawie <b>200 m</b>, o kilkadziesiąt metrów więcej niż najwyższe kościoły w Polsce. Stoi na polu, wśród ośmiu podobnych turbin – razem tworzą <b>farmę wiatrową</b>.
        </p>
        <p>Kliknij podpis na modelu, żeby otworzyć moduł: wiatr, wirnik i łopaty, gondola, sterowanie, wieża i fundament, droga prądu do gniazdka oraz cała farma. Model możesz obracać myszą i przybliżać kółkiem.</p>
      </>
    ),
  }),
  wind({
    title: 'Wiatr – paliwo elektrowni',
    camera: [330, 120, 300],
    target: [-40, 100, 0],
    preset: { mode: 'tour-wi' },
    body: (
      <>
        <p>
          Wiatr to powietrze w ruchu, a każda poruszająca się masa niesie energię. Przez koło zakreślane przez wirnik przepływa przy umiarkowanym wietrze ponad <b>100 t powietrza na sekundę</b>. Turbina zabiera mu część prędkości – za wirnikiem powietrze płynie wolniej (smugi robią się niebieskie).
        </p>
        <p>
          <Open id="wiatr">Otwórz moduł: wiatr</Open>
        </p>
      </>
    ),
  }),
  wind({
    title: 'Wirnik i łopaty',
    camera: [130, 140, 120],
    target: [H0, HUB_Y, 0],
    preset: { mode: 'tour-ro' },
    body: (
      <>
        <p>
          Łopata turbiny nie jest płaską deską, którą wiatr pcha jak żagiel. To <b>skrzydło</b> – takie jak w samolocie. Opływające je powietrze wytwarza siłę nośną, która ciągnie łopatę do przodu. Koniec łopaty pędzi nawet z prędkością <b>300 km/h</b>, choć cały wirnik obraca się powoli – ok. 10 razy na minutę.
        </p>
        <p>
          <Open id="wirnik">Otwórz moduł: wirnik i łopaty</Open>
        </p>
      </>
    ),
  }),
  wind({
    title: 'Gondola',
    camera: NAC_CAM,
    target: NAC_TGT,
    preset: { mode: 'tour-na' },
    body: (
      <>
        <p>
          Na szczycie wieży stoi <b>gondola</b> – maszynownia wielkości autobusu. Zdjęliśmy przednią połowę jej osłony. W środku: wał, łożysko, przekładnia, która przyspiesza obroty ok. 90 razy, generator, elektronika i transformator.
        </p>
        <p>
          <Open id="gondola">Otwórz moduł: gondola</Open>
        </p>
      </>
    ),
  }),
  wind({
    title: 'Sterowanie',
    camera: [24, TH + 8, 20],
    target: [3, TH + 3, 0],
    preset: { mode: 'tour-ct' },
    body: (
      <>
        <p>
          Turbina pracuje sama, bez obsługi. Komputer w gondoli obraca ją pod wiatr, ustawia kąt łopat tak, żeby łapały tyle wiatru, ile trzeba, a w czasie burzy zatrzymuje wirnik, zanim wiatr zdąży go uszkodzić.
        </p>
        <p>
          <Open id="sterowanie">Otwórz moduł: sterowanie</Open>
        </p>
      </>
    ),
  }),
  wind({
    title: 'Wieża i fundament',
    camera: [70, 70, 150],
    target: [0, 60, 0],
    preset: { mode: 'tour-to' },
    body: (
      <>
        <p>
          Wieża to stalowa rura wysoka na 117 m, w środku pusta – z drabiną, windą i kablami. Trzyma ją fundament z ok. 700 m³ betonu, zakopany w ziemi. Turbiny stawia się też na morzu – na palach wbitych w dno albo na pływających platformach.
        </p>
        <p>
          <Open id="wieza">Otwórz moduł: wieża i fundament</Open>
        </p>
      </>
    ),
  }),
  wind({
    title: 'Od wiatru do gniazdka',
    camera: AIR_CAM,
    target: AIR_TGT,
    preset: { mode: 'tour-gr' },
    body: (
      <>
        <p>
          Prąd z turbin (żółte kulki) płynie kablami pod ziemią do stacji elektroenergetycznej, a stamtąd linią wysokiego napięcia do sieci, z której korzystają domy, szkoły i fabryki. Im mocniej wieje, tym szybciej płynie energia.
        </p>
        <p>
          <Open id="siec">Otwórz moduł: od wiatru do gniazdka</Open>
        </p>
      </>
    ),
  }),
  wind({
    title: 'Farma wiatrowa',
    camera: FARM_CAM,
    target: FARM_TGT,
    preset: { mode: 'tour-fa' },
    body: (
      <>
        <p>
          Turbiny rzadko stoją pojedynczo. Na <b>farmie</b> ustawia się je w rzędach, daleko od siebie, żeby nie zabierały sobie wiatru. Farmy budujemy na polach i na morzu – w Polsce turbiny wiatrowe dają już mniej więcej co siódmą kilowatogodzinę prądu.
        </p>
        <p>
          <Open id="farma">Otwórz moduł: farma wiatrowa</Open>
        </p>
      </>
    ),
  }),
];

/* ======================= wiatr ======================= */

const windModule: PartModule = {
  id: 'wiatr',
  title: 'Wiatr',
  summary: 'Skąd energia w wietrze, pole wirnika, wiatr na różnych wysokościach, moc rosnąca z sześcianem prędkości i granica Betza',
  steps: [
    wind({
      title: 'Wiatr wokół turbiny',
      camera: [330, 120, 300],
      target: [-40, 100, 0],
      preset: { mode: 'wi-home' },
      body: (
        <>
          <p>
            Wiatr powstaje, bo Słońce ogrzewa Ziemię nierówno: nad lądem i nad morzem, na równiku i przy biegunach. Ciepłe powietrze się rozpręża i unosi, a w jego miejsce napływa chłodniejsze – tak jak w pokoju ciepło od kaloryfera wędruje pod sufit. Energia wiatru to więc w gruncie rzeczy <b>energia słoneczna</b>.
          </p>
          <p>Smugi pokazują ruch powietrza: białe płyną z pełną prędkością, niebieskie – spowolnione przez wirnik. Żółty krąg to pole, które zakreślają łopaty. Kliknij podpis, żeby przeczytać więcej. Numery prowadzą do zakładek.</p>
        </>
      ),
    }),
    wind({
      title: 'Im wyżej, tym mocniej wieje',
      spot: [MAST[0], 120, MAST[2]],
      camera: [250, 100, 420],
      target: [30, 90, 50],
      preset: { mode: 'wi-shear' },
      body: (
        <>
          <p>
            Obok turbiny stoi <b>maszt pomiarowy</b> z wiatromierzami na pięciu wysokościach. Niebieskie strzałki pokazują prędkość wiatru: przy ziemi jest najmniejsza, bo powietrze hamują drzewa, budynki i nierówności terenu. Im wyżej, tym ta „szorstkość” ziemi mniej przeszkadza.
          </p>
          <p>
            Różnica wydaje się niewielka, ale moc wiatru rośnie z <b>sześcianem</b> prędkości (o tym w następnej zakładce). Dlatego na wysokości 120 m turbina dostaje ok. dwa razy więcej energii niż na 40 m. Przed budową farmy taki maszt mierzy wiatr przez co najmniej rok.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Ile energii niesie wiatr',
      spot: [H0 + 30, HUB_Y + 20, 40],
      camera: [200, 160, 230],
      target: [20, HUB_Y, 0],
      preset: { mode: 'wi-power' },
      controls: [WIND(10, 1, 25)],
      body: (
        <>
          <p>
            Niebieski „plaster” to powietrze, które w ciągu <b>jednej sekundy</b> przepłynie przez wirnik: przy wietrze 10 m/s ma 10 m grubości i waży ponad 200 t. Przesuń suwak. Przy dwa razy silniejszym wietrze plaster jest dwa razy grubszy – i każdy jego kilogram leci dwa razy szybciej, więc niesie cztery razy więcej energii ruchu.
          </p>
          <p>
            Razem daje to <b>osiem razy</b> więcej mocy: moc wiatru rośnie z sześcianem prędkości (P = ½ · gęstość · pole · v³). Przy 5 m/s turbina daje niewiele, przy 10 m/s – już prawie pełną moc. Dlatego tak ważne jest miejsce, w którym ją postawimy.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Granica Betza',
      spot: [-150, HUB_Y, 0],
      camera: [60, 220, 420],
      target: [-60, HUB_Y - 10, 0],
      preset: { mode: 'wi-betz' },
      body: (
        <>
          <p>
            Czy turbina może zabrać wiatrowi całą energię? Nie – wtedy powietrze za wirnikiem musiałoby się zatrzymać, a nowe nie miałoby gdzie wpłynąć. Niebieska <b>struga</b> pokazuje powietrze, które przechodzi przez wirnik: przed nim zwalnia i się rozszerza, za nim płynie wolniej i zajmuje więcej miejsca.
          </p>
          <p>
            Niemiecki fizyk <b>Albert Betz</b> obliczył w 1919 r., że idealna turbina może zabrać najwyżej <b>59,3%</b> energii wiatru – gdy spowolni go za wirnikiem do jednej trzeciej. Najlepsze turbiny osiągają ok. 50%. Białe spirale to wiry spływające z końców łopat.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= wirnik ======================= */

const rotorModule: PartModule = {
  id: 'wirnik',
  title: 'Wirnik i łopaty',
  summary: 'Budowa wirnika, łopata jako skrzydło – siła nośna, skręcenie łopaty, prędkość końca łopaty i wnętrze łopaty z włókna szklanego',
  steps: [
    wind({
      title: 'Wirnik',
      camera: [150, 150, 120],
      target: [H0, HUB_Y + 5, 0],
      preset: { mode: 'ro-home' },
      body: (
        <>
          <p>
            <b>Wirnik</b> to trzy łopaty przykręcone do piasty, osłoniętej opływowym kołpakiem. Zatrzymaliśmy go hamulcem, żeby można było go obejrzeć. Wirnik waży ok. 100 t, z czego każda łopata – ok. 25 t.
          </p>
          <p>
            Dlaczego trzy łopaty? Jedna albo dwie musiałyby kręcić się szybciej i hałasowałyby bardziej, a wirnik by się chybotał. Cztery i więcej kosztują więcej, a dają niewiele więcej energii. Trzy łopaty to najlepszy kompromis – stąd prawie wszystkie turbiny na świecie tak wyglądają.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: siła nośna, skręcenie łopaty, prędkość końca łopaty i wnętrze łopaty.</p>
        </>
      ),
    }),
    wind({
      title: 'Łopata to skrzydło',
      spot: [H0 + 4, HUB_Y - 27, 47],
      camera: [H0 + 10, HUB_Y + 3, R + 16 + 30],
      target: [H0 + 4, HUB_Y, R + 16],
      preset: { mode: 'ro-lift' },
      controls: [WIND(9, 3, 25)],
      body: (
        <>
          <p>
            Za końcem łopaty widzisz jej <b>przekrój</b> z miejsca oznaczonego pomarańczowym pierścieniem, powiększony 6 razy. Ma kształt skrzydła samolotu. Wiatr wieje z prawej (niebieska strzałka), a łopata jedzie w górę (zielona) – i to dużo szybciej niż wiatr. Dla łopaty powietrze napływa więc prawie z przodu, trochę z boku: to <b>wiatr względny</b> (biała strzałka).
          </p>
          <p>
            Opływ profilu wytwarza <b>siłę nośną</b> (pomarańczowa) – prostopadłą do wiatru względnego. Jej część ciągnie łopatę w kierunku ruchu (żółta) i to ona obraca wirnik. Reszta (fioletowa) naciska na wirnik z wiatrem i próbuje przewrócić wieżę. Przesuń suwak i zobacz, jak zmienia się kąt napływu.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Skręcona łopata',
      spot: [H0 + 4, HUB_Y + 60, 0],
      camera: [H0 + 10, HUB_Y + 3, R + 26],
      target: [H0 + 2, HUB_Y, 30],
      preset: { mode: 'ro-twist' },
      body: (
        <>
          <p>
            Patrzysz wzdłuż łopaty od jej końca. Kolorowe obrysy to przekroje w różnych miejscach: pomarańczowy przy nasadzie, niebieski przy końcu. Widać, że łopata jest <b>skręcona</b> jak śmigło – przy nasadzie profil stoi bardziej w poprzek, a przy końcu prawie płasko w płaszczyźnie obrotu.
          </p>
          <p>
            Dlaczego? Każdy kawałek łopaty jedzie z inną prędkością: blisko piasty powoli, na końcu – kilka razy szybciej. Wiatr względny napływa więc w każdym miejscu pod innym kątem. Skręcenie sprawia, że każdy fragment spotyka powietrze pod najlepszym kątem. Łopata zwęża się też ku końcowi – tam szybki ruch wystarcza, żeby wytworzyć dużą siłę.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Jak szybko pędzi koniec łopaty',
      spot: [H0 + 5, HUB_Y - 37, -64],
      camera: [190, 140, 150],
      target: [H0, HUB_Y, 0],
      preset: { mode: 'ro-tip' },
      controls: [WIND(10, 3, 25)],
      body: (
        <>
          <p>
            Wirnik obraca się leniwie – raz na kilka sekund. Ale koniec łopaty ma do przebycia okrąg o obwodzie ok. <b>470 m</b>, więc pędzi z prędkością samochodu wyścigowego. Kolorowe okręgi pokazują prędkość w różnych odległościach od piasty.
          </p>
          <p>
            Turbina kręci się tak, żeby koniec łopaty był ok. <b>8 razy szybszy od wiatru</b> – wtedy łapie najwięcej energii. Szybciej nie może, bo łopaty hałasowałyby za bardzo, a deszcz niszczyłby krawędzie. Białe spirale to <b>wiry</b> zrywające się z końców łopat – unosi je wiatr, tworząc za turbiną trzy spiralne „sprężyny”.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Z czego jest łopata',
      spot: [H0 + 2, HUB_Y - 8, -12],
      camera: [40, 12, 36],
      target: [22, 2, 16],
      preset: { mode: 'ro-build' },
      body: (
        <>
          <p>
            Pod turbiną położyliśmy kawałek łopaty, przecięty w poprzek. Łopata jest <b>pusta w środku</b>, jak skorupka. Jej ścianki to <b>laminat</b>: maty z włókna szklanego przesączone żywicą (białe), a między nimi lekki wypełniacz z drewna balsy albo pianki (żółty) – jak w kanapce. Taka „kanapka” jest sztywna i lekka.
          </p>
          <p>
            Największe siły przenosi <b>dźwigar</b>: dwa grube pasy z włókna węglowego (czarne) na górnej i dolnej ściance, połączone dwiema ścianami w środku – razem działają jak dwuteownik w moście. Łopatę formuje się z dwóch połówek sklejanych na całej długości. Po 25–30 latach trudno ją przerobić – dlatego powstają już łopaty z żywic, które da się rozpuścić i odzyskać włókna.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= gondola ======================= */

const nacelleModule: PartModule = {
  id: 'gondola',
  title: 'Gondola',
  summary: 'Wnętrze gondoli: wał, łożysko, przekładnia planetarna, generator, przekształtnik i transformator, turbina bez przekładni i hamowanie',
  steps: [
    wind({
      title: 'Wnętrze gondoli',
      camera: NAC_CAM,
      target: NAC_TGT,
      preset: { mode: 'na-home' },
      body: (
        <>
          <p>
            Gondola ma ok. 14 m długości, ponad 4 m szerokości i waży z wirnikiem ok. 250 t. Zdjęliśmy przednią połowę jej osłony. Energia płynie od piasty z prawej do tyłu: <b>wał główny → przekładnia → generator</b>, a dalej prąd przez <b>przekształtnik</b> i <b>transformator</b> trafia do kabli w wieży.
          </p>
          <p>Gondola to też miejsce pracy: serwisanci wchodzą do niej z wieży, a podłoga z kratki pozwala chodzić wokół maszyn. Kliknij podpis części. Numery prowadzą do zakładek.</p>
        </>
      ),
    }),
    wind({
      title: 'Przekładnia',
      spot: [0, TH + 4.4, 1.6],
      camera: [2.5, TH + 4.2, 7.5],
      target: [0.2, TH + 2.6, 0],
      preset: { mode: 'na-gear' },
      body: (
        <>
          <p>
            Wirnik obraca się ok. 10 razy na minutę, a generator potrzebuje ok. 1000 obrotów. Pomiędzy nimi pracuje <b>przekładnia</b> z kołami zębatymi – przecięliśmy jej obudowę. Ruch jest zwolniony 8 razy, żeby dało się go śledzić.
          </p>
          <p>
            Najpierw dwa <b>stopnie planetarne</b>. Wał wirnika obraca jarzmo z trzema kołami-satelitami (miedziane), które toczą się po wnętrzu nieruchomego wieńca z zębami w środku i obracają koło słoneczne pięć razy szybciej – jak planety krążące wokół Słońca. Na końcu duże koło zazębia się z małym i przyspiesza ruch jeszcze cztery razy. Razem 1 : 90. Koła rozkładają siłę na wiele zębów naraz, bo moment obrotowy jest ogromny.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Generator',
      spot: [-4.9, TH + 4.6, 1],
      camera: [-3.5, TH + 4.8, 6.5],
      target: [-4.9, TH + 3.2, 0],
      preset: { mode: 'na-gen' },
      body: (
        <>
          <p>
            <b>Generator</b> działa jak dynamo w rowerze, tylko jest kilka tysięcy razy mocniejszy. Wirnik generatora ma bieguny magnetyczne (czerwone i niebieskie), które obracają się wewnątrz <b>stojana</b> – pierścienia z blach z wpuszczonymi uzwojeniami z miedzi. Zmieniające się pole magnetyczne wytwarza w uzwojeniach prąd.
          </p>
          <p>
            Uzwojenia są trzy, rozstawione co jedną trzecią obwodu, więc powstają trzy prądy, przesunięte w czasie – to <b>prąd trójfazowy</b>, taki jak w gniazdku do kuchenki elektrycznej. Ruch zwolniony 8 razy.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Turbina bez przekładni',
      spot: [H0 - 3, TH + 6.5, 1],
      camera: [14, TH + 7, 18],
      target: [3, TH + 3, 0],
      preset: { mode: 'na-direct' },
      body: (
        <>
          <p>
            Przekładnia to część, która psuje się najczęściej i jest najdroższa w naprawie. Dlatego wiele turbin ma <b>napęd bezpośredni</b>: wirnik obraca wprost ogromny <b>generator pierścieniowy</b> o średnicy ok. 6–7 m, widoczny między piastą a gondolą.
          </p>
          <p>
            Generator kręci się tak wolno jak wirnik, więc żeby dał tyle samo prądu, potrzebuje wielu biegunów – tu ok. 70 <b>magnesów stałych</b> (czerwone i niebieskie) na obwodzie. Gondola jest krótsza, za to generator ciężki, a magnesy wymagają rzadkich metali. Obie konstrukcje są dziś popularne; na morzu przeważają turbiny bez przekładni.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Hamowanie',
      spot: [-2.8, TH + 4.4, 0.6],
      camera: [-1, TH + 5, 7],
      target: [-2.8, TH + 3.2, 0],
      preset: { mode: 'na-brake' },
      controls: [RUN],
      body: (
        <>
          <p>
            Jak zatrzymać wirnik ważący 100 t? Nie hamulcem – zużyłby się w kilka chwil. Naciśnij „Rozpocznij”. Najpierw łopaty obracają się <b>w chorągiewkę</b>, krawędzią do wiatru. Siła nośna znika i wirnik sam zwalnia, jak rower, gdy przestajesz pedałować.
          </p>
          <p>
            Dopiero gdy wirnik prawie stoi, <b>hamulec tarczowy</b> na szybkim wale (czerwony zacisk) unieruchamia go. Na czas prac w piaście serwisanci wsuwają jeszcze stalowy <b>bolec blokady</b>, żeby wirnik nie drgnął nawet przy podmuchu.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= sterowanie ======================= */

const controlModule: PartModule = {
  id: 'sterowanie',
  title: 'Sterowanie',
  summary: 'Czujniki i sterownik, obrót gondoli pod wiatr, ustawianie kąta łopat, krzywa mocy i zatrzymanie podczas burzy',
  steps: [
    wind({
      title: 'Mózg i mięśnie turbiny',
      camera: [16, TH + 9, 18],
      target: [2, TH + 3, 0],
      preset: { mode: 'ct-home' },
      body: (
        <>
          <p>
            Turbina ma „zmysły” – <b>czujniki</b> wiatru na dachu, a w środku setki czujników temperatury, drgań i obrotów. Ma „mózg” – <b>sterownik</b>, komputer, który co ułamek sekundy decyduje, co robić. I ma „mięśnie” – silniki, które obracają gondolę i łopaty. Kołpak piasty jest tu przezroczysty, widać silniki łopat.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: obrót gondoli, ustawianie łopat, krzywa mocy i burza.</p>
        </>
      ),
    }),
    wind({
      title: 'Gondola obraca się pod wiatr',
      spot: [1.5, TH + 0.2, 2.6],
      camera: [230, 260, 300],
      target: [0, 60, 0],
      preset: { mode: 'ct-yaw' },
      controls: [DIR(60)],
      body: (
        <>
          <p>
            Wiatr co chwilę zmienia kierunek. Zmień go suwakiem – niebieska strzałka na ziemi pokaże, skąd wieje. Wiatrowskaz na dachu gondoli wyczuwa zmianę, a sterownik włącza <b>silniki obrotu</b>, które powoli kręcą gondolę z wirnikiem, aż stanie pod wiatr.
          </p>
          <p>
            Prawdziwa gondola obraca się jeszcze wolniej – ok. pół stopnia na sekundę, czyli pełny obrót zająłby ok. 12 minut. Sterownik nie reaguje na każdy podmuch, tylko na zmianę, która trwa dłużej: inaczej silniki pracowałyby bez przerwy.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Ustawianie kąta łopat',
      spot: [H0 + 2, HUB_Y + 4.8, 2],
      camera: [26, HUB_Y + 6, 16],
      target: [H0, HUB_Y, 0],
      preset: { mode: 'ct-pitch' },
      controls: [WIND(8, 0, 30)],
      body: (
        <>
          <p>
            Przesuń suwak. Przy słabym wietrze łopaty są ustawione płasko i łapią, ile się da – wirnik kręci się szybciej, gdy wiatr rośnie. Od ok. <b>10 m/s</b> turbina daje już pełną moc. Gdy wieje mocniej, silniki w piaście <b>obracają łopaty</b> wokół ich osi, krawędzią natarcia pod wiatr: łopata „ślizga się” w powietrzu i przekazuje wirnikowi tylko tyle siły, ile trzeba.
          </p>
          <p>Tak samo kierowca puszcza trochę gaz, gdy auto rozpędza się z górki. Dzięki temu moc i obroty są stałe, a turbina nie przeciąża się nawet przy bardzo silnym wietrze.</p>
        </>
      ),
    }),
    wind({
      title: 'Krzywa mocy',
      spot: [-8.2, TH + 8.8, 0],
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'ct-curve' },
      controls: [WIND(7, 0, 30)],
      body: (
        <>
          <p>
            Wykres w ramce to <b>krzywa mocy</b> – „metryczka” każdej turbiny. Poniżej <b>3 m/s</b> wiatr jest za słaby i turbina czeka. Potem moc szybko rośnie (z sześcianem prędkości), aż przy ok. 10 m/s osiąga <b>4,5 MW</b> i dalej się nie zmienia. Powyżej <b>25 m/s</b> turbina się wyłącza.
          </p>
          <p>
            W Polsce na wysokości piasty wieje średnio 6–8 m/s, więc turbina rzadko pracuje pełną mocą. W ciągu roku daje mniej więcej jedną trzecią tego, co dałaby, pracując cały czas na 100% – ok. <b>12–13 mln kWh</b>, tyle zużywa ok. 5 tys. domów.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Burza',
      spot: [H0 + 3, HUB_Y - 4.5, 3],
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'ct-storm' },
      controls: [RUN],
      body: (
        <>
          <p>
            Naciśnij „Rozpocznij”. Nadciąga wichura i wiatr rośnie z 9 do prawie 30 m/s (ponad 100 km/h). Turbina pracuje pełną mocą coraz bardziej obracając łopaty, a gdy wiatr przekroczy <b>25 m/s</b>, ustawia je w chorągiewkę i przechodzi w stan spoczynku. Wirnik obraca się powoli „na luzie”, żeby wiatr nie szarpał łopat.
          </p>
          <p>
            Turbina wraca do pracy dopiero, gdy wiatr spadnie wyraźnie poniżej progu – inaczej przy porywistym wietrze co chwilę włączałaby się i wyłączała. Wytrzymuje podmuchy do ok. <b>250 km/h</b>.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= wieża ======================= */

const towerModule: PartModule = {
  id: 'wieza',
  title: 'Wieża i fundament',
  summary: 'Wnętrze wieży z drabiną i windą, fundament z betonu zbrojonego, fundamenty morskie: monopal, kratownica i pływający, montaż dźwigiem',
  steps: [
    wind({
      title: 'Wnętrze wieży',
      camera: [70, 70, 150],
      target: [0, 60, 0],
      preset: { mode: 'to-home' },
      body: (
        <>
          <p>
            Przecięliśmy wieżę wzdłuż. To stalowa rura ze ściankami grubości od ok. 1 cm na górze do 4–5 cm na dole – sama wieża waży ok. 350 t. Musi unieść gondolę z wirnikiem i oprzeć się sile, z jaką wiatr naciska na wirnik. Na wietrze jej szczyt kołysze się o kilkadziesiąt centymetrów.
          </p>
          <p>W środku jest drabina, winda, podesty i kable, którymi prąd płynie na dół. Kliknij podpis części. Numery prowadzą do zakładek: fundament, fundamenty morskie i montaż.</p>
        </>
      ),
    }),
    wind({
      title: 'Fundament',
      spot: [4, 3, 4],
      camera: [26, 10, 44],
      target: [0, -2, 0],
      preset: { mode: 'to-found' },
      body: (
        <>
          <p>
            Wykopaliśmy dół i przecięliśmy grunt. Turbina stoi na <b>fundamencie płytowym</b> – okrągłej płycie z betonu o średnicy ok. 24 m i grubości do 3 m. To ok. 700 m³ betonu (ok. 90 betoniarek) i 80 t stalowych prętów <b>zbrojenia</b> (brązowe linie). Płytę zasypuje się ziemią – jej ciężar też pomaga trzymać turbinę.
          </p>
          <p>
            W beton zalewa się <b>kosz kotwiący</b>: dwa pierścienie długich stalowych śrub, do których przykręca się kołnierz wieży. Fundament działa jak szeroka stopa: wiatr próbuje przewrócić turbinę, a ciężka płyta nie pozwala jej się przechylić. Na słabym gruncie wbija się jeszcze pod nią pale.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Turbiny na morzu',
      spot: [-3, 30, -3],
      camera: [140, 30, 200],
      target: [0, -10, 0],
      view: (p) => (p.found === 'floating' ? { camera: [300, 30, 420], target: [0, -40, 0] } : p.found === 'jacket' ? { camera: [150, 35, 210], target: [0, -12, 0] } : undefined),
      preset: { mode: 'to-off' },
      controls: [
        {
          type: 'select',
          key: 'found',
          label: 'Fundament',
          default: 'monopile',
          options: [
            { value: 'monopile', label: 'monopal – jeden gruby pal' },
            { value: 'jacket', label: 'kratownica (jacket)' },
            { value: 'floating', label: 'pływający' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Na morzu wieje mocniej i równiej niż na lądzie, a turbiny mogą być jeszcze większe. Najczęściej stoją na <b>monopalu</b> – stalowej rurze o średnicy do 10 m, wbitej młotem w dno na 30–40 m. Żółty <b>element przejściowy</b> ma pomost i przystań, przy której cumuje łódź serwisowa.
          </p>
          <p>
            W głębszej wodzie stawia się <b>kratownice</b> – stalowe wieże na czterech nogach. Gdzie morze ma ponad 60 m głębokości, turbina może <b>pływać</b> na platformie przywiązanej linami do kotwic na dnie. Wybierz fundament. Pierwsze polskie farmy na Bałtyku stoją na monopalach, kilkadziesiąt kilometrów od brzegu.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Montaż',
      spot: [4, 112, 4],
      camera: [150, 110, 190],
      target: [0, 70, 0],
      preset: { mode: 'to-build' },
      controls: [RUN],
      body: (
        <>
          <p>
            Części turbiny przyjeżdżają nocą na ciężarówkach – łopata ma ponad 70 m, więc taki transport wymaga pilotów i zamykania dróg. Na placu obok fundamentu czeka <b>dźwig gąsienicowy</b> z wysięgnikiem dłuższym niż wieża. Naciśnij „Rozpocznij”.
          </p>
          <p>
            Dźwig ustawia kolejne segmenty wieży, gondolę, piastę i łopaty – jedną po drugiej. Między łopatami wirnik obraca się o 120°, żeby następne gniazdo stanęło poziomo. Montaż może się odbywać tylko przy słabym wietrze – zwykle trwa kilka dni, a cała budowa turbiny razem z fundamentem – kilka miesięcy.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= sieć ======================= */

const gridModule: PartModule = {
  id: 'siec',
  title: 'Od wiatru do gniazdka',
  summary: 'Droga prądu z turbiny przez kable i stację GPZ do linii wysokiego napięcia, transformator w gondoli, wahania wiatru i magazyny energii',
  steps: [
    wind({
      title: 'Droga prądu',
      camera: AIR_CAM,
      target: AIR_TGT,
      preset: { mode: 'gr-home' },
      body: (
        <>
          <p>
            Żółte kulki pokazują energię płynącą z turbin. Każda turbina ma kabel zakopany na głębokości ok. 1 m, który biegnie wzdłuż drogi dojazdowej do <b>stacji elektroenergetycznej</b>. Tam napięcie rośnie, a energia płynie <b>linią wysokiego napięcia</b> do krajowej sieci.
          </p>
          <p>W sieci energia z wiatru miesza się z energią z innych elektrowni – nie da się wskazać, który kabel w Twoim domu „pochodzi” z wiatraka. Kliknij podpis. Numery prowadzą do zakładek.</p>
        </>
      ),
    }),
    wind({
      title: 'Z generatora do kabla',
      spot: [0, TH + 10, 0],
      camera: [-1, TH + 6, 13],
      target: [-4.5, TH + 2.2, 0],
      preset: { mode: 'gr-nacelle' },
      body: (
        <>
          <p>
            Prąd z generatora ma zmienną częstotliwość – zależy od tego, jak szybko kręci się wirnik. Sieć wymaga dokładnie <b>50 Hz</b>. <b>Przekształtnik</b> (szare szafy) zamienia prąd na stały, a potem z powrotem na zmienny – już z właściwą częstotliwością.
          </p>
          <p>
            Następnie <b>transformator</b> podnosi napięcie z ok. 700 V do 30 000 V. Dlaczego? Straty w kablu rosną z kwadratem prądu, a ten sam przesył energii przy 40 razy wyższym napięciu wymaga 40 razy mniejszego prądu – straty spadają 1600 razy. Grube kable biegną potem przez całą wieżę w dół.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Stacja i linia wysokiego napięcia',
      spot: [PYLONS[1][0], PYLONS[1][1] + 55, PYLONS[1][2]],
      camera: [SUBSTATION[0] + 250, 120, SUBSTATION[2] + 260],
      target: [SUBSTATION[0] + 120, 20, SUBSTATION[2] + 60],
      preset: { mode: 'gr-line' },
      body: (
        <>
          <p>
            Kable ze wszystkich turbin spotykają się w <b>stacji elektroenergetycznej</b>, zwanej GPZ (Główny Punkt Zasilający). Duże transformatory podnoszą napięcie jeszcze raz – z 30 kV do 110 kV. Wyłączniki na bramkach potrafią w ułamku sekundy odciąć farmę, gdy w sieci wydarzy się awaria.
          </p>
          <p>Z bramek energia wychodzi na <b>linię napowietrzną</b>: przewody z aluminium ze stalowym rdzeniem zawieszone na kratowych słupach. Ten najwyżej, na czubkach słupów, nie niesie prądu – chroni linię przed piorunami.</p>
        </>
      ),
    }),
    wind({
      title: 'Kiedy wiatr nie wieje',
      spot: [BATTERY[0], 18, BATTERY[2]],
      camera: [BATTERY[0] + 150, 110, BATTERY[2] + 200],
      target: [BATTERY[0] - 120, 40, BATTERY[2] - 140],
      preset: { mode: 'gr-balance' },
      body: (
        <>
          <p>
            Wiatr wieje, kiedy chce – a prąd jest potrzebny o każdej porze. Wykres w ramce pokazuje dobę: żółta linia to produkcja farmy, różowa – zużycie w okolicy (najwięcej rano i wieczorem). Obejrzyj, jak turbiny przyspieszają i zwalniają razem z wiatrem.
          </p>
          <p>
            Gdy wiatru jest za dużo, nadmiar ładuje <b>magazyny energii</b> – kontenery z akumulatorami przy stacji. Gdy brakuje, lukę wypełniają magazyny, elektrownie słoneczne, wodne i gazowe oraz prąd z sąsiednich krajów. Pomaga też to, że gdzieś zawsze wieje: farmy rozrzucone po całym kraju i na morzu uzupełniają się nawzajem.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= farma ======================= */

function History(_: SceneProps) {
  const list: [string, string, string][] = [
    ['ok. 900', 'Persja', 'Pierwsze znane wiatraki: pionowe wały z łopatami z trzciny, obudowane murem. Mieliły zboże i pompowały wodę.'],
    ['XII w.', 'Europa', 'Wiatraki koźlakowe: cały drewniany budynek obracano dźwignią pod wiatr. W Polsce było ich kiedyś ok. 20 tys.'],
    ['1888', 'Charles Brush, USA', 'Pierwsza turbina wytwarzająca prąd: wirnik o średnicy 17 m i 144 drewnianych łopatach dawał zaledwie 12 kW.'],
    ['1891', 'Poul la Cour, Dania', 'Badał łopaty w tunelu aerodynamicznym i odkrył, że kilka szybkich, wąskich łopat działa lepiej niż wiele szerokich.'],
    ['1957', 'Gedser, Dania', 'Turbina Johannesa Juula: trzy łopaty, wirnik pod wiatr, moc 200 kW. Wyznaczyła kształt prawie wszystkich dzisiejszych turbin.'],
    ['1980', 'Kalifornia, USA', 'Pierwsze wielkie farmy wiatrowe: tysiące małych turbin na przełęczach, każda po kilkadziesiąt kilowatów.'],
    ['1991', 'Vindeby, Dania', 'Pierwsza morska farma wiatrowa: 11 turbin po 450 kW. W tym samym roku w Polsce stanęła pierwsza turbina – w Żarnowcu.'],
    ['2001', 'Barzowice', 'Pierwsza polska farma wiatrowa – sześć turbin nad Bałtykiem, koło Darłowa.'],
    ['dziś', 'cały świat', 'Turbiny wiatrowe dają ok. 8–10% prądu na świecie. Największe turbiny morskie mają moc ponad 15 MW i wirniki o średnicy ponad 250 m.'],
  ];
  return (
    <div style={{ padding: '28px 28px 40px', maxWidth: 760, margin: '0 auto' }}>
      <h3 style={{ margin: '0 0 18px', fontSize: 22 }}>Od wiatraka do turbiny</h3>
      <div style={{ display: 'grid', gap: 12 }}>
        {list.map(([y, n, d]) => (
          <div key={y} style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 14, alignItems: 'start', background: 'rgba(13, 148, 136, 0.12)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0d9488', fontVariantNumeric: 'tabular-nums' }}>{y}</div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>{n}</div>
              <div style={{ opacity: 0.85, lineHeight: 1.5 }}>{d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const farmModule: PartModule = {
  id: 'farma',
  title: 'Farma wiatrowa',
  summary: 'Układ farmy, ślady aerodynamiczne za turbinami, farmy morskie, turbiny a ludzie i przyroda, historia od wiatraka do turbiny',
  steps: [
    wind({
      title: 'Farma na polach',
      camera: FARM_CAM,
      target: FARM_TGT,
      preset: { mode: 'fa-home' },
      body: (
        <>
          <p>
            Nasza farma to <b>dziewięć turbin</b> w trzech rzędach, na powierzchni ok. 2 km². Fundamenty, drogi i place zajmują zaledwie ok. 2% tego terenu – reszta to dalej pola, łąki i miedze. Każda turbina ma swoją drogę dojazdową i plac montażowy, a wszystkie łączą się kablami ze stacją.
          </p>
          <p>Kliknij podpis. Numery prowadzą do zakładek: ślady za turbinami, farmy morskie, turbiny nocą i historia.</p>
        </>
      ),
    }),
    wind({
      title: 'Turbiny zabierają sobie wiatr',
      spot: [-600, 215, 300],
      camera: [100, 550, 600],
      target: [-550, 60, 0],
      preset: { mode: 'fa-wake' },
      controls: [DIR(0), WIND(9, 4, 20)],
      body: (
        <>
          <p>
            Widzisz farmę z góry. Za każdą turbiną ciągnie się <b>ślad</b> – pas wolniejszego powietrza (niebieskie smugi). Turbina stojąca w śladzie innej dostaje słabszy wiatr i daje mniej prądu – porównaj słupki mocy w ramce.
          </p>
          <p>
            Zmieniaj kierunek wiatru. Gdy wieje wzdłuż rzędów (0°), turbiny chowają się jedna za drugą i farma traci najwięcej. Gdy wieje ukośnie, ślady przechodzą obok. Dlatego przed budową sprawdza się, skąd wieje najczęściej – w Polsce przeważają wiatry zachodnie – i rozstawia turbiny tak, żeby straty były jak najmniejsze. Zwykle wynoszą 5–15%.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Farma na morzu',
      spot: [FARM[5][0], 215, FARM[5][1]],
      camera: [450, 280, 560],
      target: [-250, 50, 0],
      preset: { mode: 'fa-off' },
      body: (
        <>
          <p>
            Na morzu nic nie hamuje wiatru – nie ma drzew, wzgórz ani budynków. Wieje mocniej i równiej, więc turbina morska daje nawet o połowę więcej energii niż taka sama na lądzie. Turbiny stoją na żółtych fundamentach, a prąd zbiera <b>morska stacja</b> na kratownicy i wysyła na ląd kablem ułożonym na dnie.
          </p>
          <p>
            Budowa na morzu jest jednak dużo droższa: potrzebne są specjalne statki do wbijania pali i ustawiania turbin, a serwisanci dopływają łodziami albo przylatują śmigłowcem. W polskiej części Bałtyku powstają farmy o mocy kilku tysięcy megawatów – mogą dać prąd dla kilku milionów domów.
          </p>
        </>
      ),
    }),
    wind({
      title: 'Turbiny nocą – sąsiedzi i przyroda',
      spot: [FARM[8][0], 205, FARM[8][1]],
      camera: [520, 110, -900],
      target: [0, 90, -100],
      preset: { mode: 'fa-night' },
      body: (
        <>
          <p>
            Nocą na gondolach migają <b>czerwone światła</b> – ostrzegają samoloty i śmigłowce. Coraz częściej zapalają się tylko wtedy, gdy radar wykryje zbliżający się statek powietrzny, żeby nie przeszkadzać mieszkańcom.
          </p>
          <p>
            Turbiny nie mogą stać zbyt blisko domów: w Polsce co najmniej <b>700 m</b>. Z takiej odległości szum łopat jest cichszy niż rozmowa szeptem. W słoneczne dni łopaty rzucają ruchomy cień – sterownik zatrzymuje turbinę, gdy cień padałby na okna zbyt długo. Przed budową przez rok liczy się ptaki i nietoperze, a niektóre farmy mają kamery, które wykrywają nadlatujące ptaki i zwalniają wirnik.
          </p>
        </>
      ),
    }),
    {
      kind: 'page',
      scene: History,
      title: 'Od wiatraka do turbiny',
      spot: [VILLAGE[0], 60, VILLAGE[2]],
      spotLabel: '★',
      body: (
        <>
          <p>Ludzie korzystają z siły wiatru od ponad tysiąca lat – najpierw do mielenia zboża i pompowania wody, od ponad stu lat – do wytwarzania prądu.</p>
        </>
      ),
    },
  ],
};

export const windFarm: Topic = {
  id: 'elektrownia-wiatrowa',
  title: 'Elektrownia wiatrowa – od podmuchu do gniazdka',
  subject: 'energetyka',
  summary: 'Turbina wiatrowa 4,5 MW w 3D: wiatr i jego energia, łopaty jako skrzydła, wnętrze gondoli z przekładnią i generatorem, sterowanie, wieża i fundamenty, droga prądu do sieci i cała farma – na lądzie i na morzu.',
  accent: '#0d9488',
  glyph: '🌬️',
  steps: overview,
  modules: [windModule, rotorModule, nacelleModule, controlModule, towerModule, gridModule, farmModule],
};

// zapobiega ostrzeżeniu o nieużywanym imporcie (pozycja przekroju z siłami – opisana w tekście)
void LIFT_R;
