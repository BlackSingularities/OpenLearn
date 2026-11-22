import type { ReactNode } from 'react';
import type { Control, PartModule, Step, Topic } from '../../lib/types';
import { useTopicNav } from '../../lib/topicNav';
import { CoalScene } from './coalScene';
import { AX, BOIL, CT, ESP, FGD, FGD_H, FRAME, MILLS, MILL_Z, RAIL_Z, STACK, STACK_H, SWYARD, TRAFO, TURB, UNLOAD, type V3 } from './coalGeo';

/* ======================= pomocnicze ======================= */

const coal = (s: Omit<Step, 'kind' | 'scene' | 'stageKey' | 'frame'>): Step => ({ kind: '3d', scene: CoalScene, stageKey: 'coal', frame: FRAME, ...s });
const RUN: Control = { type: 'button', key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false };
const POWER = (def = 100): Control => ({ type: 'slider', key: 'power', label: 'Moc bloku', min: 40, max: 100, step: 5, default: def, unit: '%' });
const tx = (id: string) => TURB.find((t) => t.id === id)!.x;

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

const HOME_CAM: V3 = [470, 300, 560];
const HOME_TGT: V3 = [10, 60, -20];
const YARD_CAM: V3 = [430, 170, 470];
const YARD_TGT: V3 = [210, 10, 140];
const BOIL_CAM: V3 = [46, 74, 150];
const BOIL_TGT: V3 = [0, 58, 0];
const HALL_CAM: V3 = [-60, 62, 118];
const HALL_TGT: V3 = [-95, 14, 0];
const CT_CAM: V3 = [-380, 130, 70];
const CT_TGT: V3 = [-100, 80, -200];
const FLUE_CAM: V3 = [330, 160, 300];
const FLUE_TGT: V3 = [112, 55, 0];
const GRID_CAM: V3 = [-80, 160, 330];
const GRID_TGT: V3 = [-260, 20, 0];

/* ======================= przegląd ======================= */

const overview: Step[] = [
  coal({
    title: 'Elektrownia węglowa',
    camera: HOME_CAM,
    target: HOME_TGT,
    preset: { mode: 'home' },
    body: (
      <>
        <p>
          <b>Elektrownia węglowa</b> zamienia energię zapisaną w węglu w prąd. Węgiel się spala, ciepło gotuje wodę, para pod wielkim ciśnieniem kręci turbiną, a turbina – generatorem. Tak wciąż powstaje duża część prądu w Polsce.
        </p>
        <p>
          Przed Tobą nowoczesny <b>blok energetyczny o mocy 900 MW</b>, podobny do tych w Opolu i Jaworznie. Najwyższe są: kotłownia (ok. 120 m), komin i chłodnia kominowa (po ok. 180 m). Wystarczyłby, żeby zasilić ok. dwa miliony domów.
        </p>
        <p>Kliknij podpis na modelu, żeby otworzyć moduł: węgiel i paliwo, kocioł, turbina i generator, chłodzenie, spaliny oraz droga prądu do sieci. Model możesz obracać myszą i przybliżać kółkiem.</p>
      </>
    ),
  }),
  coal({
    title: 'Węgiel – paliwo',
    camera: YARD_CAM,
    target: YARD_TGT,
    preset: { mode: 'tour-fu' },
    body: (
      <>
        <p>
          Węgiel przyjeżdża pociągami z kopalni i leży na <b>składzie</b> – w czarnych zwałach. Taśmociągi (czarne kulki pokazują, którędy jedzie) wnoszą go do budynku obok kotłowni. Tam młyny mielą go na pył drobny jak mąka.
        </p>
        <p>
          <Open id="paliwo">Otwórz moduł: węgiel i paliwo</Open>
        </p>
      </>
    ),
  }),
  coal({
    title: 'Kocioł',
    camera: BOIL_CAM,
    target: BOIL_TGT,
    preset: { mode: 'tour-bo' },
    body: (
      <>
        <p>
          Zdjęliśmy przednią ścianę <b>kotłowni</b>. W środku wisi kocioł: wysoka „skrzynia” ze ścian zrobionych z rur, w których płynie woda. Na dole wiruje płomień pyłu węglowego, nad nim są pęczki rur, w których para nagrzewa się do 600 °C.
        </p>
        <p>
          <Open id="kociol">Otwórz moduł: kocioł</Open>
        </p>
      </>
    ),
  }),
  coal({
    title: 'Turbina i generator',
    camera: HALL_CAM,
    target: HALL_TGT,
    preset: { mode: 'tour-tu' },
    body: (
      <>
        <p>
          W <b>maszynowni</b> (zdjęliśmy dach) para z kotła płynie przez turbinę i obraca jej wirnik z łopatkami 3000 razy na minutę. Na tym samym wale siedzi <b>generator</b> – niebieski walec na końcu – który wytwarza prąd.
        </p>
        <p>
          <Open id="turbina">Otwórz moduł: turbina i generator</Open>
        </p>
      </>
    ),
  }),
  coal({
    title: 'Chłodzenie',
    camera: CT_CAM,
    target: CT_TGT,
    preset: { mode: 'tour-co' },
    body: (
      <>
        <p>
          Za turbiną para musi się z powrotem zamienić w wodę. Chłodzi ją woda krążąca do <b>chłodni kominowej</b> – największej budowli elektrowni. Biały pióropusz nad nią to nie dym, tylko chmura kropelek wody.
        </p>
        <p>
          <Open id="chlodzenie">Otwórz moduł: chłodzenie</Open>
        </p>
      </>
    ),
  }),
  coal({
    title: 'Spaliny',
    camera: FLUE_CAM,
    target: FLUE_TGT,
    preset: { mode: 'tour-fg' },
    body: (
      <>
        <p>
          Spaliny z kotła (szare kulki) przechodzą przez kilka „pralni”: usuwa się z nich tlenki azotu, pył i siarkę. Dopiero potem wylatują <b>kominem</b>. Dwutlenku węgla nie da się tak po prostu wyłapać – i to jest największy problem elektrowni węglowych.
        </p>
        <p>
          <Open id="spaliny">Otwórz moduł: spaliny</Open>
        </p>
      </>
    ),
  }),
  coal({
    title: 'Do sieci',
    camera: GRID_CAM,
    target: GRID_TGT,
    preset: { mode: 'tour-gr' },
    body: (
      <>
        <p>
          Prąd z generatora (żółte kulki) płynie do <b>transformatorów</b>, które podnoszą napięcie do 400 000 V, a potem przez rozdzielnię do linii najwyższego napięcia. Stąd trafia do miast i fabryk w całym kraju.
        </p>
        <p>
          <Open id="siec">Otwórz moduł: do sieci</Open>
        </p>
      </>
    ),
  }),
];

/* ======================= paliwo ======================= */

const fuelModule: PartModule = {
  id: 'paliwo',
  title: 'Węgiel i paliwo',
  summary: 'Skład węgla, pociąg z kopalni, młyny i pył węglowy, ile węgla spala blok i skąd w nim energia',
  steps: [
    coal({
      title: 'Skład węgla',
      camera: YARD_CAM,
      target: YARD_TGT,
      preset: { mode: 'fu-home' },
      body: (
        <>
          <p>
            Elektrownia zjada węgiel bez przerwy, dzień i noc. Dlatego obok niej jest <b>skład</b> z zapasem na kilka tygodni – na wypadek, gdyby pociągi z kopalni nie dojechały. Czarne kulki pokazują drogę węgla: z wagonów na zwał albo od razu do kotłowni.
          </p>
          <p>Kliknij podpis, żeby przeczytać, co to jest. Numery na modelu prowadzą do zakładek: pociąg z kopalni, młyny i ilość spalanego węgla.</p>
        </>
      ),
    }),
    coal({
      title: 'Pociąg z kopalni',
      spot: [UNLOAD[0] + 60, 20, RAIL_Z],
      camera: [330, 90, 380],
      target: [160, 6, 210],
      preset: { mode: 'fu-rail' },
      controls: [RUN],
      body: (
        <>
          <p>
            Naciśnij „Rozpocznij”. Pociąg z 24 wagonami węgla (po ok. 60 t) wjeżdża na bocznicę i bardzo powoli przejeżdża przez halę <b>rozładunku</b>. Wagony otwierają klapy w dnie, węgiel spada do lejów pod torem, a stamtąd taśmą jedzie na zwał.
          </p>
          <p>
            Taki skład to ok. 1400 t węgla – blok o mocy 900 MW spala to w ok. 4,5 godziny. Każdego dnia muszą więc przyjechać co najmniej trzy pociągi. Kiedyś elektrownie budowano tuż przy kopalniach, żeby węgla nie trzeba było wozić daleko.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Młyny i pył węglowy',
      spot: [MILLS[2], 30, MILL_Z],
      camera: [26, 36, -100],
      target: [-2, 24, -37],
      preset: { mode: 'fu-mill' },
      body: (
        <>
          <p>
            Bryłki węgla spalałyby się powoli i nierówno. W <b>młynach</b> węgiel jest mielony między obracającą się misą a ciężkimi rolkami na pył drobniejszy niż mąka – ziarenka mają zwykle poniżej 0,1 mm. Gorące powietrze suszy pył i unosi go w górę.
          </p>
          <p>
            W <b>odsiewaczu</b> na górze młyna grubsze ziarna wracają do mielenia, a drobny pył leci rurami prosto do palników. Pył węglowy z powietrzem pali się prawie jak gaz – w ułamku sekundy. Blok ma sześć młynów, a do pełnej mocy wystarcza pięć.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Ile węgla spala blok',
      spot: [240, 30, 98],
      camera: YARD_CAM,
      target: YARD_TGT,
      preset: { mode: 'fu-energy' },
      controls: [POWER()],
      body: (
        <>
          <p>
            Energia w węglu pochodzi od Słońca. Ponad 300 mln lat temu, w <b>karbonie</b>, rosły ogromne lasy paproci i skrzypów. Rośliny gromadziły energię słoneczną w drewnie, a po obumarciu zostały przykryte osadami. Pod ciśnieniem i w cieple zamieniły się w węgiel.
          </p>
          <p>
            Kilogram węgla kamiennego daje przy spalaniu ok. <b>22 MJ</b> ciepła – tyle, ile potrzeba, żeby zagotować ok. 60 litrów wody. Mniej więcej 45% z tego zamienia się w prąd. Przesuń suwak mocy i zobacz w ramce, ile węgla zjada blok.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= kocioł ======================= */

const boilerModule: PartModule = {
  id: 'kociol',
  title: 'Kocioł',
  summary: 'Budowa kotła wieżowego, palniki i płomień, droga wody i pary, rozruch bloku',
  steps: [
    coal({
      title: 'Kocioł w przekroju',
      camera: BOIL_CAM,
      target: BOIL_TGT,
      preset: { mode: 'bo-home' },
      body: (
        <>
          <p>
            <b>Kocioł</b> nie przypomina garnka. To wysoka na ok. 100 m konstrukcja ze stalowych rur, w której woda zamienia się w parę. Ten kocioł jest <b>wieżowy</b>: płomień jest na dole, a wszystkie pęczki rur są nad nim, jeden nad drugim.
          </p>
          <p>
            Woda pracuje tu pod ciśnieniem ok. 30 MPa – trzysta razy większym niż w kole roweru. Przy takim ciśnieniu nie wrze jak w czajniku, tylko płynnie zamienia się w parę. Takie kotły nazywa się <b>nadkrytycznymi</b> – są sprawniejsze od starszych.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: płomień, droga wody i rozruch bloku.</p>
        </>
      ),
    }),
    coal({
      title: 'Płomień',
      spot: [0, 32, BOIL.half],
      camera: [30, 34, 70],
      target: [0, 32, 0],
      preset: { mode: 'bo-flame' },
      controls: [POWER()],
      body: (
        <>
          <p>
            Szesnaście <b>palników</b> w narożnikach komory wdmuchuje pył węglowy z gorącym powietrzem. Nie celują w środek, tylko trochę obok. Strumienie tworzą wirującą kulę ognia jak tornado, w której wszystko dobrze się miesza i dopala.
          </p>
          <p>
            W środku płomienia jest ok. <b>1400 °C</b>. Ściany komory się nie topią, bo płynie w nich woda, która od razu zabiera ciepło. Przesuń suwak mocy: przy mniejszej mocy pracuje mniej młynów i płomień jest mniejszy.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Droga wody i pary',
      spot: [0, 80, 8],
      camera: [70, 70, 150],
      target: [-14, 55, 0],
      preset: { mode: 'bo-water' },
      body: (
        <>
          <p>
            Niebieskie kulki to <b>woda zasilająca</b>. Najpierw ogrzewa się w podgrzewaczu wody na samej górze kotła, potem płynie w dół i w górę rurami ścian komory, gdzie zamienia się w parę. W przegrzewaczach para nagrzewa się do <b>600 °C</b>.
          </p>
          <p>
            Czerwone kulki to <b>para świeża</b>, która płynie grubym rurociągiem do turbiny. Za pierwszą częścią turbiny para wraca do kotła (pomarańczowe kulki), jest ponownie podgrzewana i dopiero wtedy płynie dalej. Dzięki temu z każdego kilograma pary da się wycisnąć więcej energii.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Rozruch bloku',
      spot: [0, 12, BOIL.half + 4],
      camera: [80, 90, 210],
      target: [-50, 45, 0],
      preset: { mode: 'bo-start' },
      controls: [RUN],
      body: (
        <>
          <p>
            Naciśnij „Rozpocznij” i zobacz, jak blok wstaje do pracy. Najpierw kocioł napełnia się wodą, a wentylatory przewietrzają komorę. Potem zapalają się palniki olejowe, a gdy komora się nagrzeje – ruszają młyny i palniki pyłowe.
          </p>
          <p>
            Para stopniowo nagrzewa rurociągi i turbinę. Gdy turbina osiągnie 3000 obr/min, generator dołącza się do sieci i moc rośnie. W rzeczywistości taki rozruch trwa od kilku do kilkunastu godzin – stalowe elementy grube na kilkadziesiąt centymetrów trzeba nagrzewać powoli, żeby nie popękały.
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
  summary: 'Maszynownia, turbina parowa od środka, generator i prąd trójfazowy, synchronizacja z siecią',
  steps: [
    coal({
      title: 'Maszynownia',
      camera: HALL_CAM,
      target: HALL_TGT,
      preset: { mode: 'tu-home' },
      body: (
        <>
          <p>
            <b>Turbozespół</b> to szereg maszyn na jednym wale o długości ok. 50 m: cztery części turbiny, generator i wzbudnica. Stoi na betonowym stole wspartym na słupach, żeby drgania nie przenosiły się na budynek. Całość waży kilka tysięcy ton.
          </p>
          <p>Kliknij podpis, żeby przeczytać więcej. Numery prowadzą do zakładek: turbina od środka, generator i synchronizacja z siecią.</p>
        </>
      ),
    }),
    coal({
      title: 'Turbina od środka',
      spot: [tx('lp1'), AX + 7, 2],
      camera: [-58, 40, 50],
      target: [-80, AX, 0],
      preset: { mode: 'tu-blades' },
      body: (
        <>
          <p>
            Zdjęliśmy górne połówki obudów. Na wale siedzą <b>wieńce łopatek</b>, a między nimi, w obudowie, są nieruchome łopatki kierownicze. Kierują parę na łopatki wirnika pod najlepszym kątem. Para przepływa przez kilkadziesiąt takich stopni i w każdym oddaje trochę energii.
          </p>
          <p>
            Para się przy tym <b>rozpręża</b>: jej ciśnienie spada kilka tysięcy razy, a objętość rośnie. Dlatego łopatki są coraz dłuższe – w części wysokoprężnej mają kilka centymetrów, a na końcu części niskoprężnych ponad metr. Ich końce pędzą wtedy z prędkością ok. 1800 km/h.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Generator',
      spot: [tx('gen'), AX + 4, 2],
      camera: [-108, 30, 36],
      target: [-124, AX - 1, 0],
      preset: { mode: 'tu-gen' },
      body: (
        <>
          <p>
            Zdjęliśmy górną połowę <b>generatora</b>. Wirnik w środku to potężny elektromagnes (czerwony i niebieski pas to jego bieguny N i S), a wokół leży nieruchomy stojan z pakietu blach z miedzianymi prętami uzwojeń. Gdy magnes się obraca, pole magnetyczne przecina uzwojenia i płynie w nich prąd – zasada jest ta sama co w dynamie rowerowym.
          </p>
          <p>
            Stojan ma trzy oddzielne uzwojenia, przesunięte względem siebie, więc powstają trzy prądy przemienne – <b>prąd trójfazowy</b>. Wirnik obraca się 50 razy na sekundę, więc prąd zmienia kierunek 50 razy na sekundę: to <b>50 Hz</b>, jak w każdym gniazdku w Polsce.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Synchronizacja z siecią',
      spot: [tx('exc') - 6, AX + 3, 2],
      camera: [-70, 46, 80],
      target: [-100, AX, 0],
      preset: { mode: 'tu-sync' },
      controls: [RUN],
      body: (
        <>
          <p>
            Wszystkie elektrownie w Europie pracują razem i kręcą się w tym samym rytmie – 50 Hz. Nowy generator nie może tak po prostu wskoczyć do sieci. Najpierw para rozpędza go dokładnie do 3000 obr/min, a jego prąd musi „iść w nogę” z siecią. Naciśnij „Rozpocznij”.
          </p>
          <p>
            Lampka synchronizacji miga coraz wolniej, gdy częstotliwości się zbliżają. Gdy różnica jest prawie zerowa, a fazy się pokrywają, operator (dziś automat) załącza <b>wyłącznik</b>. Od tej chwili sieć trzyma generator w swoim rytmie, a większa porcja pary nie rozpędza go już, tylko zwiększa moc.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= chłodzenie ======================= */

const coolModule: PartModule = {
  id: 'chlodzenie',
  title: 'Chłodzenie',
  summary: 'Skraplacz i chłodnia kominowa, jak działa chłodnia, obieg wody i pary, dokąd idzie energia z węgla',
  steps: [
    coal({
      title: 'Chłodnia i woda chłodząca',
      camera: CT_CAM,
      target: CT_TGT,
      preset: { mode: 'co-home' },
      body: (
        <>
          <p>
            Para, która wyszła z turbiny, musi się z powrotem zamienić w wodę, żeby pompy mogły ją znów wtłoczyć do kotła. Robi się to w <b>skraplaczu</b> pod turbiną: para oddaje ciepło wodzie chłodzącej, a ta płynie do chłodni (kulki pomarańczowe – ciepła, niebieskie – ochłodzona).
          </p>
          <p>Kliknij podpis, żeby przeczytać więcej. Numery prowadzą do zakładek: chłodnia od środka, obieg wody i pary oraz bilans energii.</p>
        </>
      ),
    }),
    coal({
      title: 'Chłodnia od środka',
      spot: [CT.x, 60, CT.z],
      camera: [CT.x + 40, 70, CT.z + 220],
      target: [CT.x, 60, CT.z],
      preset: { mode: 'co-tower' },
      controls: [POWER()],
      body: (
        <>
          <p>
            Zdjęliśmy przednią połowę chłodni. Ciepła woda jest rozprowadzana rurami nad <b>zraszalnikiem</b> i spada w dół jak deszcz (niebieskie kropki) do basenu. Po drodze rozbija się na cienkie strugi i krople, a powietrze odbiera jej ciepło i trochę wody odparowuje.
          </p>
          <p>
            Ogrzane, wilgotne powietrze (pomarańczowe kropki) jest lżejsze od zimnego, więc samo unosi się w górę, jak w kominie. Od dołu, między słupami, napływa nowe. Kształt wieży – przewężenie w trzech czwartych wysokości – sprawia, że cienka powłoka jest bardzo sztywna i dobrze prowadzi powietrze.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Obieg wody i pary',
      spot: [-60, 30, 12],
      camera: [40, 150, 260],
      target: [-50, 40, 0],
      preset: { mode: 'co-cycle' },
      body: (
        <>
          <p>
            Woda i para krążą w elektrowni w zamkniętym kole: <b>1.</b> w kotle woda zamienia się w parę, <b>2.</b> para rozpręża się w turbinie i oddaje energię, <b>3.</b> w skraplaczu zamienia się z powrotem w wodę, <b>4.</b> pompy tłoczą ją z powrotem do kotła. Fizycy nazywają to <b>obiegiem Rankine’a</b>.
          </p>
          <p>
            Pompowanie wody to mały wydatek, bo woda prawie się nie ściska. Para po rozprężeniu zajmuje tysiące razy więcej miejsca i to ona wykonuje dużą pracę w turbinie. Z różnicy między tymi dwiema pracami bierze się prąd.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Dokąd idzie energia z węgla',
      spot: [CT.x, CT.h + 30, CT.z],
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'co-sankey' },
      body: (
        <>
          <p>
            Tylko mniej więcej <b>45%</b> energii z węgla zamienia się w prąd. Prawie tyle samo ucieka jako ciepło w chłodni – pióropusz nad nią to właśnie ta energia. Nie da się tego uniknąć: para musi się skroplić, a skraplać się może tylko wtedy, gdy oddaje ciepło czemuś chłodniejszemu.
          </p>
          <p>
            Najlepsze, co można zrobić, to wykorzystać to ciepło. <b>Elektrociepłownie</b> grzeją nim wodę w sieci ciepłowniczej i ogrzewają miasta – wtedy z węgla da się wykorzystać nawet 80% energii.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= spaliny ======================= */

const flueModule: PartModule = {
  id: 'spaliny',
  title: 'Spaliny',
  summary: 'Droga spalin, elektrofiltr, odsiarczanie i gips, dwutlenek węgla',
  steps: [
    coal({
      title: 'Droga spalin',
      camera: FLUE_CAM,
      target: FLUE_TGT,
      preset: { mode: 'fg-home' },
      body: (
        <>
          <p>
            Przy spalaniu węgla powstają nie tylko dwutlenek węgla i para wodna. W spalinach są też <b>popiół</b>, <b>tlenki azotu</b> i <b>dwutlenek siarki</b> – z tego ostatniego powstawały kiedyś kwaśne deszcze, które niszczyły lasy w Sudetach. Szare kulki pokazują drogę spalin przez kolejne urządzenia oczyszczające.
          </p>
          <p>Kliknij podpis, żeby przeczytać więcej. Numery prowadzą do zakładek: elektrofiltr, odsiarczanie i dwutlenek węgla.</p>
        </>
      ),
    }),
    coal({
      title: 'Elektrofiltr',
      spot: [(ESP.x0 + ESP.x1) / 2, ESP.h + 8, 0],
      camera: [90, 66, 46],
      target: [89, 14, -11],
      preset: { mode: 'fg-esp' },
      body: (
        <>
          <p>
            Zdjęliśmy ścianę <b>elektrofiltru</b> i jego dach – patrzymy z góry. Spaliny płyną wąskimi korytarzami między stalowymi płytami. Pośrodku każdego korytarza wiszą żółte elektrody pod napięciem ok. 80 000 V. Drobiny popiołu dostają ładunek elektryczny i przyciąga je uziemiona płyta.
          </p>
          <p>
            Widać, jak pył (szare kropki) zbliża się do płyt, a spaliny po drodze stają się czyste. Młotki co jakiś czas strząsają z płyt warstwę popiołu, która spada do lejów. Filtr zatrzymuje ponad <b>99,9%</b> pyłu – kilkadziesiąt ton na godzinę.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Odsiarczanie',
      spot: [FGD[0], FGD_H - 8, 0],
      camera: [FGD[0] + 20, 34, 64],
      target: [FGD[0], 24, -4],
      preset: { mode: 'fg-fgd' },
      body: (
        <>
          <p>
            W <b>absorberze</b> spaliny płyną w górę, a z dysz na trzech poziomach leje się na nie zawiesina zmielonego kamienia wapiennego w wodzie. Dwutlenek siarki rozpuszcza się w kroplach i reaguje z wapieniem – w kropkach widać, jak żółtawe spaliny u góry stają się czyste.
          </p>
          <p>
            Na dole absorbera powstaje <b>gips</b> – ten sam, z którego robi się płyty do wykańczania mieszkań. Elektrownia sprzedaje go fabrykom, więc odpad zamienia się w surowiec. Odsiarczanie usuwa ponad 95% siarki ze spalin.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Dwutlenek węgla',
      spot: [STACK[0], STACK_H + 10, 0],
      camera: [STACK[0] + 360, STACK_H + 40, 420],
      target: [STACK[0], STACK_H + 40, 0],
      preset: { mode: 'fg-co2' },
      controls: [POWER()],
      body: (
        <>
          <p>
            Węgiel to głównie pierwiastek węgiel, a spalanie to łączenie go z tlenem. Z każdej tony węgla powstają ponad <b>2 tony CO₂</b>. Szara bańka nad kominem rośnie do objętości dwutlenku węgla, który blok wypuszcza w ciągu jednej godziny: przy pełnej mocy ok. 700 t, czyli kula o średnicy ok. 90 m.
          </p>
          <p>
            CO₂ jest niewidoczny i nie truje, ale zatrzymuje ciepło w atmosferze i ociepla klimat. Elektrownie węglowe wypuszczają go najwięcej ze wszystkich – ok. <b>800 g na każdą kilowatogodzinę</b> prądu. Gaz ziemny daje mniej więcej połowę tego, a wiatr, słońce i atom – prawie zero. Dlatego elektrownie węglowe są stopniowo zamykane.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= sieć ======================= */

const gridModule: PartModule = {
  id: 'siec',
  title: 'Do sieci',
  summary: 'Transformator blokowy, rozdzielnia i linia 400 kV, praca bloku w ciągu doby, węgiel w polskiej energetyce',
  steps: [
    coal({
      title: 'Od generatora do linii',
      camera: GRID_CAM,
      target: GRID_TGT,
      preset: { mode: 'gr-home' },
      body: (
        <>
          <p>
            Generator wytwarza prąd o napięciu ok. 27 kV. To za mało, żeby przesłać go daleko – prąd musiałby być ogromny, a przewody by się grzały. <b>Transformator blokowy</b> podnosi więc napięcie do <b>400 kV</b>, a prąd maleje kilkanaście razy.
          </p>
          <p>Kliknij podpis, żeby przeczytać więcej. Numery prowadzą do zakładek: praca w ciągu doby i węgiel w polskiej energetyce.</p>
        </>
      ),
    }),
    coal({
      title: 'Blok w ciągu doby',
      spot: [TRAFO[0], 30, TRAFO[2]],
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'gr-load' },
      body: (
        <>
          <p>
            W sieci w każdej sekundzie musi być tyle prądu, ile zużywamy – ani więcej, ani mniej. A zużywamy różnie: najmniej w nocy, najwięcej rano i wieczorem. W południe sporo prądu dają też panele słoneczne. Wykres pokazuje zimowy dzień roboczy.
          </p>
          <p>
            Blok węglowy dopasowuje moc do potrzeb (czerwona linia), ale robi to powoli – kilka procent mocy na minutę. Nie może też zejść niżej niż do ok. 40% mocy, bo płomień byłby niestabilny. Wyłączenie i ponowne uruchomienie zajmuje wiele godzin, dlatego takie bloki najlepiej pracują równo, dzień i noc.
          </p>
        </>
      ),
    }),
    coal({
      title: 'Węgiel w polskiej energetyce',
      spot: [SWYARD.x0 + 40, 40, 0],
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'gr-mix' },
      body: (
        <>
          <p>
            Przez dziesięciolecia prawie cały prąd w Polsce pochodził z węgla – kamiennego ze Śląska i brunatnego z odkrywek, m.in. w Bełchatowie i Turowie. Wykres pokazuje, jak ten udział maleje: w 1990 r. było to ponad 95%, a dziś – nieco ponad połowa.
          </p>
          <p>
            Miejsce węgla zajmują wiatr, słońce i gaz, a w przyszłości atom. Powody są dwa: emisje CO₂, za które elektrownie płacą coraz więcej, i to, że prąd z wiatru i słońca jest tańszy. Nowe bloki, takie jak ten na modelu, będą pracować jeszcze kilkanaście lat, coraz częściej tylko wtedy, gdy nie wieje i nie świeci słońce.
          </p>
        </>
      ),
    }),
  ],
};

export const coalPlant: Topic = {
  id: 'elektrownia-weglowa',
  title: 'Elektrownia węglowa',
  subject: 'energetyka',
  summary: 'Blok 900 MW w 3D: skład węgla i młyny, kocioł z płomieniem, turbina i generator, chłodnia kominowa, oczyszczanie spalin i droga prądu do sieci.',
  accent: '#b45309',
  glyph: '🏭',
  steps: overview,
  modules: [fuelModule, boilerModule, turbineModule, coolModule, flueModule, gridModule],
};

