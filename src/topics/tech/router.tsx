import type { Control, PartModule, Step, Topic } from '../../lib/types';
import { RouterScene } from './routerScene';
import { FRAME, LAB, MICROWAVE, ROUTER, type V3 } from './routerGeo';

/* ======================= pomocnicze ======================= */

const rs = (s: Omit<Step, 'kind' | 'scene' | 'stageKey' | 'frame'>): Step => ({ kind: '3d', scene: RouterScene, stageKey: 'router', frame: FRAME, ...s });
const RUN: Control = { type: 'button', key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false };
const BAND: Control = {
  type: 'select',
  key: 'band',
  label: 'Pasmo',
  default: '5',
  options: [
    { value: '24', label: '2,4 GHz' },
    { value: '5', label: '5 GHz' },
  ],
};

/** Ujęcie pracowni: kamera przed podestem, patrzy na eksponat (cm). */
const labCam = (k: keyof typeof LAB, dist = 260, h = 190, ty = 105): { camera: V3; target: V3 } => ({
  camera: [LAB[k][0], h, dist],
  target: [LAB[k][0], ty, 0],
});
const R = (x: number, y: number, z: number): V3 => [ROUTER[0] + x, ROUTER[1] + y, ROUTER[2] + z];

const APT_CAM: V3 = [60, 1150, 1000];
const APT_TGT: V3 = [0, 0, 30];
const NEAR_CAM: V3 = R(18, 34, 42);
const NEAR_TGT: V3 = R(0, 4, 0);

/* ======================= przegląd ======================= */

const overview: Step[] = [
  rs({
    title: 'Router Wi-Fi',
    camera: APT_CAM,
    target: APT_TGT,
    preset: { mode: 'home' },
    body: (
      <>
        <p>
          <b>Router</b> to skrzyżowanie i poczta Twojej sieci domowej. Rozmawia z telefonem, laptopem i telewizorem bez kabli – <b>falami radiowymi</b> – i przekazuje ich pakiety danych do internetu jednym łączem, a odpowiedzi rozdaje z powrotem właściwym urządzeniom.
        </p>
        <p>Przed Tobą mieszkanie z przyciętymi ścianami. Router stoi na komodzie w salonie, obok modemu światłowodowego. Niebieskie czasze to fale, które z niego wychodzą.</p>
        <p>Kliknij podpis na modelu, żeby otworzyć moduł. Model możesz obracać myszą i przybliżać kółkiem.</p>
      </>
    ),
  }),
  rs({
    title: 'Od telefonu do strony',
    camera: [-60, 1050, 720],
    target: [-90, 40, -110],
    preset: { mode: 'tour' },
    controls: [RUN],
    body: (
      <>
        <p>
          Co się dzieje, gdy na telefonie otworzysz stronę z pogodą? Naciśnij <b>Rozpocznij</b> i śledź kulki. Telefon zamienia prośbę o stronę na fale radiowe. Router je odbiera, zamienia adres telefonu na swój i wysyła pakiet kablem do <b>modemu</b>.
        </p>
        <p>
          Modem zamienia sygnał elektryczny na błyski światła i puszcza je <b>światłowodem</b> do operatora, a stamtąd do serwera z pogodą. Odpowiedź wraca tą samą drogą, router poznaje, że jest dla telefonu, i nadaje ją w powietrze.
        </p>
      </>
    ),
  }),
  rs({
    title: 'Zasięg w mieszkaniu',
    camera: [0, 1350, 640],
    target: [0, 0, 10],
    preset: { mode: 'cover' },
    controls: [
      BAND,
      {
        type: 'select',
        key: 'place',
        label: 'Gdzie stoi router',
        default: 'kat',
        options: [
          { value: 'kat', label: 'na komodzie w rogu' },
          { value: 'srodek', label: 'na półce pośrodku' },
        ],
      },
    ],
    body: (
      <>
        <p>
          Kolory na podłodze pokazują siłę sygnału: zielony – świetnie, żółty – w sam raz na filmy, czerwony – słabo. Fala słabnie z odległością, a każda ściana zabiera jej część. Najwięcej – <b>ściana nośna z żelbetu</b> między salonem a resztą mieszkania.
        </p>
        <p>
          Przełącz pasmo. <b>2,4 GHz</b> sięga dalej i lepiej przechodzi przez ściany, ale jest wolniejsze i zatłoczone – w kuchni zakłóca je mikrofalówka. <b>5 GHz</b> jest kilka razy szybsze, ale szybciej słabnie.
        </p>
        <p>Przestaw router na półkę pośrodku mieszkania. Najlepiej, żeby stał wysoko, na środku i nie w szafce – wtedy fale mają najkrótszą drogę do każdego pokoju.</p>
      </>
    ),
  }),
];

/* ======================= router od środka ======================= */

const insideModule: PartModule = {
  id: 'wnetrze',
  title: 'Router od środka',
  summary: 'Płytka z procesorem, pamięciami i układami radiowymi, router rozłożony, kabel sieciowy i wtyk RJ-45',
  steps: [
    rs({
      title: 'Router bez pokrywy',
      camera: NEAR_CAM,
      target: NEAR_TGT,
      preset: { mode: 'in-home' },
      body: (
        <>
          <p>
            Router to mały komputer wyspecjalizowany w przekazywaniu danych. Ma <b>procesor</b> pod radiatorem, pamięć roboczą i trwałą, dwa <b>układy radiowe</b> (2,4 i 5 GHz) pod metalowymi ekranami, cztery anteny i gniazda na kable.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: router rozłożony i kabel sieciowy.</p>
        </>
      ),
    }),
    rs({
      title: 'Router rozłożony',
      spot: R(0, 12, 0),
      camera: R(40, 48, 62),
      target: R(0, 8, 0),
      preset: { mode: 'in-ex' },
      controls: [{ type: 'button', key: 'ex', label: 'Rozłóż router', labelOn: 'Złóż router', default: false }],
      body: (
        <>
          <p>
            Naciśnij <b>Rozłóż router</b>. Od góry: <b>pokrywa</b> z otworami wentylacyjnymi – router chłodzi się bez wentylatora, ciepłe powietrze samo uchodzi górą. Pod nią <b>radiator</b> procesora i blaszane <b>ekrany</b> nad układami radiowymi.
          </p>
          <p>
            Niżej <b>płytka drukowana</b> z kilkoma warstwami miedzianych ścieżek – część z nich ma wyliczoną długość i szerokość, żeby sygnał radiowy nie gubił się po drodze do anten. Anteny są na zawiasach po bokach, a całość stoi na <b>podstawie</b> z gumowymi nóżkami.
          </p>
        </>
      ),
    }),
    rs({
      title: 'Kabel sieciowy',
      spot: R(-5.1, 4, -9),
      ...labCam('eth', 160, 150, 106),
      preset: { mode: 'in-eth' },
      body: (
        <>
          <p>
            Kabel sieciowy (Ethernet) powiększony 10 razy. Pod osłoną są <b>cztery pary</b> cienkich przewodów, a każda para jest skręcona – i to każda trochę inaczej. Zakłócenie z zewnątrz działa na oba przewody pary tak samo, a odbiornik patrzy tylko na różnicę między nimi, więc zakłócenie znika.
          </p>
          <p>
            Wtyk <b>RJ-45</b> ma osiem złotych styków – po jednym na przewód. Przy prędkości 1 Gb/s wszystkie cztery pary pracują naraz i w obie strony. Kabel jest szybszy i pewniejszy niż Wi-Fi, dlatego konsolę czy komputer do gier warto podłączyć kablem.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= fale radiowe ======================= */

const wavesModule: PartModule = {
  id: 'fale',
  title: 'Fale radiowe',
  summary: 'Długość fali 2,4 i 5 GHz, antena i jej „pączek”, ściany i przeszkody, kanały i zakłócenia',
  steps: [
    rs({
      title: 'Fale w mieszkaniu',
      camera: [-40, 1050, 860],
      target: [-60, 40, -60],
      preset: { mode: 'fa-home' },
      body: (
        <>
          <p>
            Wi-Fi to <b>fale radiowe</b> – ten sam rodzaj fal co radio FM czy telefon komórkowy, tylko o wiele szybciej drgające: 2,4 albo 5 miliardów razy na sekundę. Rozchodzą się z prędkością światła i przechodzą przez większość ścian, za każdym razem trochę słabnąc.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: długość fali, antena, przeszkody i kanały.</p>
        </>
      ),
    }),
    rs({
      title: 'Długość fali',
      spot: [ROUTER[0] - 60, 120, ROUTER[2] + 60],
      ...labCam('wave', 200, 165, 108),
      preset: { mode: 'fa-wave' },
      body: (
        <>
          <p>
            Fale trzech pasm Wi-Fi w prawdziwej wielkości nad metrową linijką. Fala <b>2,4 GHz</b> ma 12,5 cm od grzbietu do grzbietu, <b>5 GHz</b> – 6 cm, a <b>6 GHz</b> (Wi-Fi 6E i 7) – 5 cm. Im częściej fala drga, tym jest krótsza.
          </p>
          <p>
            Krótsza fala niesie więcej danych, bo w tej samej chwili mieści więcej drgań, ale łatwiej ją zatrzymać – gorzej przenika ściany i szybciej słabnie z odległością. Dlatego 2,4 GHz sięga dalej, a 5 i 6 GHz są szybsze z bliska.
          </p>
        </>
      ),
    }),
    rs({
      title: 'Antena',
      spot: [ROUTER[0] + 14, ROUTER[1] + 20, ROUTER[2]],
      ...labCam('dipole', 230, 150, 110),
      preset: { mode: 'fa-dipole' },
      body: (
        <>
          <p>
            W środku anteny routera są zwykle dwa krótkie metalowe pręty – razem pół długości fali, czyli ok. 6 cm. Układ radiowy pcha w nich elektrony w górę i w dół miliardy razy na sekundę, a drgający prąd wypromieniowuje falę. Przy odbiorze dzieje się odwrotnie: fala porusza elektrony w antenie.
          </p>
          <p>
            Fioletowy „pączek” pokazuje, w którą stronę antena świeci najmocniej: we wszystkie strony w bok, a w górę i w dół prawie wcale. Dlatego pionowa antena dobrze obsługuje całe piętro, a słabo – piętro wyżej. Warto ustawić anteny pod różnymi kątami.
          </p>
        </>
      ),
    }),
    rs({
      title: 'Ściany i przeszkody',
      spot: [60, 125, -200],
      ...labCam('walls', 330, 210, 108),
      preset: { mode: 'fa-walls' },
      controls: [BAND],
      body: (
        <>
          <p>
            Ta sama fala przechodzi przez siedem próbek. Słupki z przodu pokazują, ile mocy przeszło. Szkło i płyta g-k prawie nie przeszkadzają, cegła zabiera połowę lub więcej, a <b>beton zbrojony</b> – zwykle ponad 90%.
          </p>
          <p>
            Najgorsze są <b>woda</b> (akwarium, ale też ludzie – jesteśmy w większości z wody) i <b>metal</b>, który odbija fale jak lustro światło. Lodówka, metalowa szafa czy lustro z warstwą srebra potrafią zrobić „cień” za sobą. Przełącz pasmo – 5 GHz traci na każdej przeszkodzie więcej.
          </p>
        </>
      ),
    }),
    rs({
      title: 'Kanały i zakłócenia',
      spot: [MICROWAVE[0], MICROWAVE[1] + 30, MICROWAVE[2]],
      ...labCam('spectrum', 260, 180, 102),
      preset: { mode: 'fa-spec' },
      body: (
        <>
          <p>
            Pasmo dzieli się na <b>kanały</b> – jak pasy na drodze. W paśmie 2,4 GHz jest 13 kanałów, ale każdy jest szerszy niż odstęp między nimi, więc sąsiednie zachodzą na siebie. Naprawdę rozdzielne są tylko 1, 6 i 11. W bloku wszyscy sąsiedzi nadają w tym samym wąskim paśmie i przeszkadzają sobie nawzajem, a mikrofalówka zagłusza środek.
          </p>
          <p>
            Pasmo <b>5 GHz</b> jest dużo szersze: mieści kilka szerokich kanałów obok siebie, które nie zachodzą na siebie. Router sam wybiera najmniej zatłoczony kanał, a gdy coś się zmieni – przenosi się na inny.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= bity w powietrzu ======================= */

const dataModule: PartModule = {
  id: 'dane',
  title: 'Bity w powietrzu',
  summary: 'Pakiet danych i jego części, zapis bitów w fali (QAM), wiele urządzeń naraz (OFDMA), wiązki do urządzeń (MU-MIMO)',
  steps: [
    rs({
      title: 'Pakiet danych',
      ...labCam('packet', 200, 160, 106),
      preset: { mode: 'da-home' },
      body: (
        <>
          <p>
            Wszystko, co płynie przez sieć – strona, film, wiadomość – jest pocięte na małe <b>pakiety</b>, zwykle po ok. 1500 bajtów. Każdy pakiet ma na początku „kopertę” z adresami i numerami, a dopiero potem właściwe dane. W powietrzu pakiet jest opakowany jeszcze w <b>ramkę Wi-Fi</b>.
          </p>
          <p>Kliknij podpis części ramki, żeby przeczytać, po co jest. Wideo w jakości HD to ok. 500 takich pakietów na sekundę.</p>
        </>
      ),
    }),
    rs({
      title: 'Jak fala niesie bity',
      ...labCam('qam', 190, 140, 110),
      preset: { mode: 'da-qam' },
      controls: [
        {
          type: 'select',
          key: 'qam',
          label: 'Gęstość mapy punktów',
          default: '256',
          options: [
            { value: '16', label: '16-QAM (4 bity)' },
            { value: '64', label: '64-QAM (6 bitów)' },
            { value: '256', label: '256-QAM (8 bitów)' },
            { value: '1024', label: '1024-QAM (10 bitów)' },
          ],
        },
        { type: 'slider', key: 'noise', label: 'Zakłócenia', min: 0, max: 100, step: 5, default: 20, unit: '%' },
      ],
      body: (
        <>
          <p>
            Router nie nadaje zer i jedynek po jednej. W każdej chwili zmienia naraz <b>siłę</b> fali i jej <b>przesunięcie</b> (moment, w którym wypada grzbiet). Każda kombinacja to jeden punkt na mapie – a każdy punkt oznacza inną grupę bitów. Przy 256 punktach jedno „zawołanie” niesie 8 bitów.
          </p>
          <p>
            Kropki to odebrane sygnały – szum rozmywa je wokół punktów. Zwiększ zakłócenia albo gęstość mapy: gdy kropka wpadnie bliżej sąsiedniego punktu, odbiornik się pomyli (czerwone). Dlatego z bliska router używa gęstej mapy i jest szybki, a daleko przechodzi na rzadszą – wolniejszą, ale pewną.
          </p>
        </>
      ),
    }),
    rs({
      title: 'Wiele urządzeń naraz',
      ...labCam('ofdma', 230, 150, 110),
      preset: { mode: 'da-ofdma' },
      controls: [{ type: 'button', key: 'ofdma', label: 'Włącz OFDMA', labelOn: 'Wyłącz OFDMA', default: false }],
      body: (
        <>
          <p>
            Kanał radiowy to jak droga: w prawo płynie czas, w górę są kolejne kawałki pasma. Każdy kolor to inne urządzenie. W starszym Wi-Fi każde urządzenie dostawało <b>cały kanał</b> na chwilę – nawet gdy wysyłało tylko krótką wiadomość, a reszta czekała w kolejce.
          </p>
          <p>
            Naciśnij <b>Włącz OFDMA</b>. Wi-Fi 6 dzieli kanał na wąskie pasy, a router w każdej chwili rozdziela je między kilka urządzeń. Mniej czekania, mniej opóźnień – to ważne w domu, w którym działa kilkanaście urządzeń naraz.
          </p>
        </>
      ),
    }),
    rs({
      title: 'Wiązki do urządzeń',
      camera: [-40, 1000, 800],
      target: [-20, 40, -80],
      preset: { mode: 'da-mimo' },
      controls: [{ type: 'button', key: 'bf', label: 'Kieruj wiązki', labelOn: 'Nadawaj we wszystkie strony', default: false }],
      body: (
        <>
          <p>
            Router ma cztery anteny. Gdy nadaje z nich ten sam sygnał z drobnymi przesunięciami w czasie, fale w jednych miejscach się wzmacniają, w innych wygaszają – powstaje <b>wiązka</b> skierowana na urządzenie. To kształtowanie wiązki: więcej mocy trafia tam, gdzie trzeba.
          </p>
          <p>
            Naciśnij <b>Kieruj wiązki</b>. Dzięki <b>MU-MIMO</b> router może wysłać różne dane do kilku urządzeń w tym samym momencie – każde dostaje swoją wiązkę i nie musi czekać.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= internet ======================= */

const netModule: PartModule = {
  id: 'internet',
  title: 'Internet za routerem',
  summary: 'Droga pakietu do serwera, światłowód od środka, adresy w domu i w internecie, czas odpowiedzi',
  steps: [
    rs({
      title: 'Droga do serwera',
      ...labCam('chain', 440, 240, 100),
      preset: { mode: 'ne-home' },
      body: (
        <>
          <p>
            Za routerem zaczyna się <b>internet</b> – sieć sieci. Pakiet z Twojego domu biegnie światłowodem do szafki na klatce, potem do budynku operatora, do punktu, w którym łączą się różni operatorzy, a czasem kablem po dnie oceanu – aż do serwerowni, w której „mieszka” strona.
          </p>
          <p>Po drodze mija kilkanaście routerów. Każdy patrzy tylko na adres i wybiera najlepszy kierunek – jak sortownie paczek. Kliknij podpis, żeby przeczytać o każdym etapie.</p>
        </>
      ),
    }),
    rs({
      title: 'Światłowód od środka',
      ...labCam('fiber', 300, 180, 110),
      preset: { mode: 'ne-fiber' },
      body: (
        <>
          <p>
            Światłowód to szklana nić cieńsza od włosa (na modelu ogromnie powiększona). Środek – <b>rdzeń</b> – otacza <b>płaszcz</b> z innego szkła. Światło, które pada na granicę między nimi pod małym kątem, odbija się w całości z powrotem, więc nie może uciec i biegnie kilometrami.
          </p>
          <p>
            Bity to błyski światła lasera: jest światło – jedynka, nie ma – zero, miliardy razy na sekundę. Światłowodowi nie szkodzą burze ani prąd obok, a jedno włókno może nieść naraz wiele kolorów światła – każdy z osobnymi danymi.
          </p>
        </>
      ),
    }),
    rs({
      title: 'Adresy w domu i w internecie',
      camera: [-40, 1050, 860],
      target: [-20, 40, -40],
      preset: { mode: 'ne-nat' },
      body: (
        <>
          <p>
            Każde urządzenie w domu dostaje od routera <b>adres IP</b> – numer jak numer mieszkania, np. 192.168.1.23. Takie adresy działają tylko w Twoim domu. W internecie cały dom ma jeden adres – adres routera.
          </p>
          <p>
            Gdy telefon wysyła pakiet do internetu, router podmienia adres telefonu na swój i zapisuje w tabeli, czyj to pakiet (ramka obok). Gdy wraca odpowiedź, router sprawdza tabelę i oddaje ją telefonowi. Nazwy stron, np. pogoda.pl, zamienia na adresy IP <b>DNS</b> – internetowa książka telefoniczna.
          </p>
        </>
      ),
    }),
    rs({
      title: 'Ile to trwa',
      ...labCam('chain', 440, 240, 100),
      preset: { mode: 'ne-ping' },
      body: (
        <>
          <p>
            Czas tam i z powrotem nazywa się <b>ping</b> i mierzy się go w milisekundach (tysięcznych sekundy). Do serwera w Polsce to zwykle 10–20 ms, za ocean – ok. 100 ms. Nawet światło potrzebuje czasu: 1000 km w szkle przebiega w 5 ms.
          </p>
          <p>Prędkość łącza (np. 600 Mb/s) mówi, ile danych przepłynie w sekundzie, a ping – jak szybko przychodzi odpowiedź. Do filmów ważna jest prędkość, do gier i rozmów wideo – niski ping.</p>
        </>
      ),
    }),
  ],
};

/* ======================= sieć w domu ======================= */

const homeNetModule: PartModule = {
  id: 'siec',
  title: 'Bezpieczna sieć w domu',
  summary: 'Hasło i szyfrowanie WPA3, sieć mesh w dużym mieszkaniu',
  steps: [
    rs({
      title: 'Hasło i szyfrowanie',
      ...labCam('crypt', 210, 160, 108),
      preset: { mode: 'se-home' },
      controls: [{ type: 'button', key: 'enc', label: 'Włącz szyfrowanie WPA3', labelOn: 'Wyłącz szyfrowanie', default: false }],
      body: (
        <>
          <p>
            Fale Wi-Fi nie kończą się na ścianie mieszkania – odbierze je każdy w pobliżu. Bez szyfrowania laptop sąsiada odczyta wszystko, co wysyłasz. Naciśnij <b>Włącz szyfrowanie WPA3</b>: litery zamieniają się w przypadkowe znaki, które odczyta tylko router.
          </p>
          <p>
            Hasło do Wi-Fi nie leci w powietrzu. Telefon i router tylko sprawdzają, czy oboje je znają, i ustalają tajny <b>klucz</b> – inny dla każdego urządzenia. Długie hasło (np. trzy przypadkowe słowa) jest praktycznie nie do zgadnięcia. Kliknij podpis części, żeby przeczytać więcej.
          </p>
        </>
      ),
    }),
    rs({
      title: 'Sieć mesh',
      camera: [0, 1350, 640],
      target: [0, 0, 10],
      preset: { mode: 'se-mesh' },
      controls: [{ type: 'button', key: 'mesh', label: 'Dodaj węzły mesh', labelOn: 'Zostaw sam router', default: false }],
      body: (
        <>
          <p>
            W dużym mieszkaniu albo domu jeden router nie wystarczy – za ścianą nośną zasięg pasma 5 GHz słabnie. Naciśnij <b>Dodaj węzły mesh</b>: w sypialni i kuchni stają małe nadajniki.
          </p>
          <p>
            Węzły łączą się z routerem bezprzewodowo (białe kulki) albo kablem i tworzą jedną sieć o tej samej nazwie i haśle. Telefon sam przełącza się do najbliższego węzła, gdy przechodzisz z pokoju do pokoju.
          </p>
        </>
      ),
    }),
  ],
};

export const wifiRouter: Topic = {
  id: 'router-wifi',
  title: 'Router Wi-Fi',
  subject: 'technika',
  summary: 'Router w mieszkaniu w 3D: wnętrze routera, fale radiowe i przeszkody, bity w powietrzu, droga pakietu przez internet, szyfrowanie i sieć mesh.',
  accent: '#0d9488',
  glyph: '📶',
  steps: overview,
  modules: [insideModule, wavesModule, dataModule, netModule, homeNetModule],
};

