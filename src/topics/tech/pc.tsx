import type { Control, PartModule, Step, Topic } from '../../lib/types';
import { PcScene } from './pcScene';
import { BIOS, CHIPSET, FANS_FRONT, FRAME, KEYBOARD, LAB, LAB_Y, MBZ, MOUSE, MUSEUM, MUSEUM_Z, SOCKET, pc, type V3 } from './pcGeo';

/* ======================= pomocnicze ======================= */

const pcs = (s: Omit<Step, 'kind' | 'scene' | 'stageKey' | 'frame'>): Step => ({ kind: '3d', scene: PcScene, stageKey: 'pc', frame: FRAME, ...s });
const RUN: Control = { type: 'button', key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false };
const FAN: Control = { type: 'slider', key: 'fan', label: 'Obroty wentylatorów', min: 0, max: 100, step: 5, default: 60, unit: '%' };

/** Ujęcie pracowni: kamera przed podestem, patrzy na eksponat. */
const labCam = (k: keyof typeof LAB, dist = 185, h = 150, ty = LAB_Y - 15, dx = 0): { camera: V3; target: V3 } => ({
  camera: [LAB[k][0] + dx, h, dist],
  target: [LAB[k][0], ty, 0],
});
/** Punkt na eksponacie pracowni (numer zakładki). */
const at = (k: keyof typeof LAB, x: number, y: number, z = 0): V3 => [LAB[k][0] + x, LAB_Y + y, z];

const HOME_CAM: V3 = [125, 165, 235];
const HOME_TGT: V3 = [0, 100, -8];
const CASE_CAM: V3 = [78, 128, 82];
const CASE_TGT: V3 = [30, 100, -4];
const MB_CAM: V3 = [32, 115, 44];
const MB_TGT: V3 = [22, 106.5, -12];
const CPU_CAM: V3 = [27, 119, 8];
const CPU_TGT: V3 = [23.5, 110.5, -12];
const DESK_CAM: V3 = [-8, 150, 145];
const DESK_TGT: V3 = [-10, 98, -6];
const MUS_CAM: V3 = [10, 300, MUSEUM_Z + 400];
const MUS_TGT: V3 = [10, 105, MUSEUM_Z - 50];

/* ======================= przegląd ======================= */

const overview: Step[] = [
  pcs({
    title: 'Komputer osobisty',
    camera: HOME_CAM,
    target: HOME_TGT,
    preset: { mode: 'home' },
    body: (
      <>
        <p>
          <b>Komputer osobisty</b> to maszyna, która robi tylko jedno: bardzo szybko liczy na liczbach zapisanych jako zera i jedynki. Wszystko inne – tekst, zdjęcia, muzyka, gry – to liczby, a programy mówią, co z nimi zrobić. Ten komputer wykonuje ok. <b>miliard prostych działań</b> w czasie, gdy Ty mrugniesz okiem.
        </p>
        <p>
          Przed Tobą biurko z komputerem stacjonarnym w obudowie z szybą, monitorem, klawiaturą i myszą. W środku obudowy są: zasilacz, płyta główna, procesor z chłodzeniem, pamięć RAM, dyski i karta graficzna.
        </p>
        <p>Kliknij podpis na modelu, żeby otworzyć moduł. Model możesz obracać myszą i przybliżać kółkiem.</p>
      </>
    ),
  }),
  pcs({
    title: 'Od klawisza do ekranu',
    camera: [8, 142, 118],
    target: [2, 96, -10],
    preset: { mode: 'tour-key' },
    controls: [RUN],
    body: (
      <>
        <p>
          Co się dzieje, gdy naciśniesz literę „a”? Naciśnij <b>Rozpocznij</b> i śledź kolorowe kulki. Klawiatura zamienia naciśnięcie na liczbę – kod klawisza – i wysyła ją kablem USB. Chipset na płycie głównej przekazuje ją procesorowi.
        </p>
        <p>
          Procesor sprawdza, który program jest otwarty, i dopisuje literę do tekstu w pamięci RAM. Potem karta graficzna rysuje nowy obraz z tą literą i wysyła go do monitora. Na modelu trwa to kilkanaście sekund, naprawdę – kilkanaście tysięcznych sekundy.
        </p>
      </>
    ),
  }),
  pcs({
    title: 'Komputer rozłożony',
    camera: [105, 185, 175],
    target: [26, 112, 8],
    preset: { mode: 'explode' },
    controls: [{ type: 'button', key: 'ex', label: 'Rozłóż komputer', labelOn: 'Złóż komputer', default: false }],
    body: (
      <>
        <p>
          Naciśnij przycisk, a części rozsuną się tak, jak wyjmuje się je przy rozbieraniu komputera. Komputer stacjonarny składa się z kilku wymiennych części, które łączą się standardowymi złączami – dlatego można go samemu złożyć albo rozbudować.
        </p>
        <p>
          Najpierw zdejmuje się szybę. Potem kartę graficzną, chłodzenie, procesor, pamięci i dysk M.2. Zasilacz wysuwa się do tyłu, a wentylatory odkręca się od przodu i tyłu. Płyta główna zostaje na swoim miejscu – wszystko inne się do niej podłącza.
        </p>
      </>
    ),
  }),
];

/* ======================= obudowa i zasilanie ======================= */

const caseModule: PartModule = {
  id: 'obudowa',
  title: 'Obudowa i zasilanie',
  summary: 'Obudowa, zasilacz od środka, przepływ powietrza i prąd dla podzespołów',
  steps: [
    pcs({
      title: 'Obudowa',
      camera: CASE_CAM,
      target: CASE_TGT,
      preset: { mode: 'ob-home' },
      body: (
        <>
          <p>
            Zdjęliśmy szybę boczną. <b>Obudowa</b> to stalowy szkielet, do którego przykręca się wszystkie części: płytę główną na kołkach, zasilacz na dole, dyski w koszyku, wentylatory z przodu i z tyłu. Na dole osłona chowa zasilacz i kable.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: zasilacz od środka, przepływ powietrza i prąd dla podzespołów.</p>
        </>
      ),
    }),
    pcs({
      title: 'Zasilacz od środka',
      spot: pc(-14, 4, 18),
      ...labCam('psu', 175, 150, 75),
      preset: { mode: 'ob-psu' },
      body: (
        <>
          <p>
            Zasilacz bez pokrywy, powiększony pięć razy. Z gniazdka płynie prąd <b>zmienny 230 V</b> – zmienia kierunek 50 razy na sekundę. Podzespoły potrzebują prądu <b>stałego</b> i niskiego napięcia: 12 V, 5 V i 3,3 V.
          </p>
          <p>
            Najpierw filtr zatrzymuje zakłócenia, mostek prostowniczy zamienia prąd zmienny na stały, a duży kondensator go wygładza. Potem tranzystory „siekają” go na impulsy ok. 100 000 razy na sekundę. Dzięki temu wystarcza mały transformator – przy 50 Hz musiałby ważyć kilka kilogramów. Na wyjściu prostowniki i kondensatory dają gładkie 12 V.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Przepływ powietrza',
      spot: pc(21, FANS_FRONT[0], 11),
      camera: [62, 122, 92],
      target: [30, 100, -4],
      preset: { mode: 'ob-air' },
      controls: [FAN],
      body: (
        <>
          <p>
            Prawie cały prąd, który pobiera komputer, zamienia się w ciepło. Przednie wentylatory wciągają chłodne powietrze, ono przepływa obok karty graficznej i chłodzenia procesora i wylatuje tyłem. Wentylator w zasilaczu ma własną drogę – od spodu.
          </p>
          <p>Przesuń suwak i zobacz, jak zmieniają się temperatury i hałas. Wolne wentylatory są ciche, ale przy grze procesor może się zbytnio nagrzać i wtedy sam zwalnia.</p>
        </>
      ),
    }),
    pcs({
      title: 'Prąd dla podzespołów',
      spot: pc(4, 14, 18),
      camera: CASE_CAM,
      target: CASE_TGT,
      preset: { mode: 'ob-power' },
      body: (
        <>
          <p>
            Żółte kulki to prąd. Z zasilacza wychodzą osobne kable: gruby 24-stykowy do płyty głównej, 8-stykowy prosto do procesora, 16-stykowy do karty graficznej i płaski SATA do dysku twardego.
          </p>
          <p>
            Najwięcej prądu biorą karta graficzna i procesor. Oba mają na swoich płytkach własne „mini zasilacze”, które obniżają 12 V do ok. 1 V. Niskie napięcie oznacza mniej ciepła w tranzystorach, ale za to ogromny prąd – nawet 250 amperów.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= płyta główna ======================= */

const boardModule: PartModule = {
  id: 'plyta',
  title: 'Płyta główna',
  summary: 'Gniazda i złącza, drogi danych, płytka w przekroju, start komputera',
  steps: [
    pcs({
      title: 'Płyta główna',
      camera: MB_CAM,
      target: MB_TGT,
      preset: { mode: 'mb-home' },
      body: (
        <>
          <p>
            Wyjęliśmy kartę graficzną i chłodzenie. <b>Płyta główna</b> łączy wszystkie części. Ma gniazdo na procesor, sloty na pamięć i karty, złącza dysków i zasilania, a tysiące miedzianych ścieżek przesyłają między nimi dane i prąd.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: drogi danych, płytka w przekroju i start komputera.</p>
        </>
      ),
    }),
    pcs({
      title: 'Drogi danych',
      spot: pc(CHIPSET.x, CHIPSET.y, MBZ + 1),
      camera: MB_CAM,
      target: MB_TGT,
      preset: { mode: 'mb-bus' },
      body: (
        <>
          <p>
            Kulki pokazują, którędy płyną dane. Najszybsze drogi prowadzą prosto do procesora: z pamięcią RAM, z kartą graficzną (16 torów PCI Express) i z dyskiem M.2 (4 tory). Resztą – USB, dyskami SATA, siecią i dźwiękiem – zajmuje się <b>chipset</b>, połączony z procesorem jedną szybką drogą.
          </p>
          <p>Tor PCI Express to dwie pary przewodów, którymi bity płyną szeregowo, jeden za drugim, 32 miliardy razy na sekundę.</p>
        </>
      ),
    }),
    pcs({
      title: 'Płytka w przekroju',
      spot: pc(-2, 20, MBZ + 1),
      ...labCam('pcb', 175, 150, 95),
      preset: { mode: 'mb-pcb' },
      body: (
        <>
          <p>
            Płyta główna ma grubość ok. 1,6 mm, ale to nie jest jedna płytka. W powiększeniu widać <b>8 warstw miedzi</b>, rozdzielonych laminatem z włókna szklanego i żywicy. Na wierzchu i spodzie biegną ścieżki sygnałowe, w środku są całe płaty miedzi – warstwy zasilania i masy.
          </p>
          <p>
            Warstwy łączą <b>przelotki</b> – otworki pokryte w środku miedzią. Układy scalone przylutowane są malutkimi kulkami lutu (BGA). Ścieżki do pamięci i do karty graficznej muszą mieć dokładnie równą długość, bo bity docierają w ułamkach nanosekundy.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Start komputera',
      spot: pc(BIOS.x, BIOS.y, MBZ + 1),
      camera: [45, 138, 118],
      target: [0, 100, -10],
      preset: { mode: 'mb-boot' },
      controls: [RUN],
      body: (
        <>
          <p>
            Naciśnij <b>Rozpocznij</b>. Wyłączony komputer nie jest zupełnie martwy – zasilacz daje płycie małe napięcie czuwania. Przycisk budzi zasilacz, a gdy napięcia są stabilne, wysyła on sygnał „zasilanie w porządku” i procesor rusza.
          </p>
          <p>
            Pierwszy program, jaki wykonuje procesor, to <b>UEFI</b> z kości BIOS. Sprawdza pamięć, kartę graficzną i dyski (test POST), pokazuje logo, a potem szuka na dysku systemu operacyjnego i oddaje mu sterowanie.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= procesor ======================= */

const cpuModule: PartModule = {
  id: 'procesor',
  title: 'Procesor',
  summary: 'Procesor w gnieździe i w przekroju, wnętrze rdzenia, tranzystor, zegar i potok, chłodzenie',
  steps: [
    pcs({
      title: 'Procesor',
      camera: CPU_CAM,
      target: CPU_TGT,
      preset: { mode: 'cpu-home' },
      body: (
        <>
          <p>
            Zdjęliśmy chłodzenie. <b>Procesor</b> to kwadrat 4 × 4,5 cm leżący w gnieździe. Pod metalową osłoną jest krzemowy rdzeń wielkości paznokcia z ok. 12 miliardami tranzystorów. Wykonuje rozkazy programów: dodaje, porównuje, przenosi liczby.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: przekrój, wnętrze rdzenia, tranzystor, zegar i chłodzenie.</p>
        </>
      ),
    }),
    pcs({
      title: 'Procesor w przekroju',
      spot: pc(SOCKET.x - 1.5, SOCKET.y, MBZ + 1),
      ...labCam('cpuCut', 95, 100, 86),
      preset: { mode: 'cpu-cut' },
      controls: [{ type: 'button', key: 'lift', label: 'Zdejmij osłonę', labelOn: 'Załóż osłonę', default: false }],
      body: (
        <>
          <p>
            Procesor przecięty na pół i powiększony 12 razy. Na dole złote pola stykowe, nad nimi zielony laminat z kilkunastoma warstwami ścieżek. Na nim, na malutkich kulkach lutu, leży <b>krzemowy rdzeń</b> – właściwy procesor, grubości ok. 0,8 mm.
          </p>
          <p>
            Nad rdzeniem jest warstwa lutu z indu i miedziana <b>osłona IHS</b>. Ciepło przechodzi przez nie do pasty termoprzewodzącej i chłodzenia. Naciśnij przycisk, żeby zdjąć osłonę i zobaczyć rdzeń.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Wnętrze rdzenia',
      spot: pc(SOCKET.x + 1, SOCKET.y + 1.4, MBZ + 1),
      ...labCam('die', 150, 160, 70),
      preset: { mode: 'cpu-die' },
      body: (
        <>
          <p>
            Rdzeń z góry, powiększony ok. 50 razy. Niebieskie bloki to <b>8 rdzeni wydajnych</b> – szybkich, do trudnych zadań. Zielone to <b>rdzenie oszczędne</b> – mniejsze i zużywające mniej prądu, do zadań w tle. Każdy rdzeń to jakby osobny procesor.
          </p>
          <p>
            Fioletowe pasy to <b>pamięć podręczna L3</b> – szybka pamięć tuż obok rdzeni, żeby nie czekały na wolniejszy RAM. Złota szyna w kształcie pierścienia łączy wszystkie bloki. Na bokach: kontroler pamięci RAM, układ graficzny i złącza PCIe.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Tranzystor',
      spot: pc(SOCKET.x - 1, SOCKET.y - 1.4, MBZ + 1),
      ...labCam('fin', 165, 150, 78),
      preset: { mode: 'cpu-fin' },
      controls: [{ type: 'slider', key: 'gate', label: 'Napięcie na bramce', min: 0, max: 100, step: 10, default: 0, unit: '%' }],
      body: (
        <>
          <p>
            Procesor zbudowany jest z <b>tranzystorów</b> – mikroskopijnych przełączników bez ruchomych części. Ten jest powiększony ok. 2 miliony razy. Elektrony mogą płynąć cienkim krzemowym żeberkiem ze <b>źródła</b> do <b>drenu</b>, ale tylko wtedy, gdy na <b>bramce</b> jest napięcie.
          </p>
          <p>
            Przesuń suwak. Bez napięcia prąd nie płynie – to <b>0</b>. Z napięciem płynie – to <b>1</b>. Z miliardów takich przełączników połączonych ze sobą powstają układy, które dodają, porównują i pamiętają liczby.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Zegar i potok',
      spot: pc(SOCKET.x + 1.6, SOCKET.y - 1.6, MBZ + 1),
      ...labCam('pipe', 150, 125, 65),
      preset: { mode: 'cpu-pipe' },
      controls: [{ type: 'slider', key: 'clock', label: 'Zegar (takty na sekundę)', min: 0.5, max: 4, step: 0.5, default: 1 }],
      body: (
        <>
          <p>
            Procesor pracuje w rytmie <b>zegara</b>. Przy każdym takcie każdy rozkaz robi jeden krok: pobranie z pamięci, odczytanie, co ma zrobić, wykonanie, dostęp do pamięci, zapis wyniku. Procesor 5,5 GHz ma 5,5 miliarda taktów na sekundę.
          </p>
          <p>
            Sztuczka nazywa się <b>potok</b>: gdy jeden rozkaz jest wykonywany, następny jest już odczytywany, a kolejny pobierany – jak na taśmie w fabryce. Dzięki temu co takt kończy się jeden rozkaz, choć każdy trwa pięć taktów. Prawdziwe rdzenie mają kilkanaście stanowisk i kilka taśm naraz.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Chłodzenie',
      spot: pc(SOCKET.x + 2, SOCKET.y + 2, MBZ + 1),
      ...labCam('cool', 150, 130, 50),
      preset: { mode: 'cpu-cool' },
      controls: [FAN],
      body: (
        <>
          <p>
            Rdzeń procesora oddaje nawet 250 W ciepła z powierzchni paznokcia – więcej na centymetr kwadratowy niż płyta kuchenki. Ciepło przechodzi do miedzianej podstawy, a stamtąd do <b>rurek cieplnych</b>. W środku rurki ciecz paruje przy rdzeniu, para leci w górę, skrapla się przy żebrach i wraca knotem.
          </p>
          <p>Rurka cieplna przewodzi ciepło kilkaset razy lepiej niż pręt z litej miedzi. Wentylator przepycha powietrze między aluminiowymi żebrami i zabiera ciepło na zewnątrz. Przesuń suwak obrotów.</p>
        </>
      ),
    }),
  ],
};

/* ======================= pamięć i dyski ======================= */

const memModule: PartModule = {
  id: 'pamiec',
  title: 'Pamięć i dyski',
  summary: 'RAM, SSD i HDD, komórki DRAM, 3D NAND, dysk twardy, piramida pamięci',
  steps: [
    pcs({
      title: 'Pamięć i dyski',
      ...labCam('mem', 200, 150, 65),
      preset: { mode: 'mem-home' },
      body: (
        <>
          <p>
            Komputer ma dwa rodzaje pamięci. <b>RAM</b> to pamięć robocza: szybka, ale zapomina wszystko po wyłączeniu prądu. <b>Dyski</b> pamiętają na stałe: SSD na kościach flash, a dysk twardy (HDD) na wirujących talerzach z magnetykiem.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: komórki RAM, pamięć flash, dysk twardy i piramida pamięci.</p>
        </>
      ),
    }),
    pcs({
      title: 'Komórki pamięci RAM',
      spot: at('mem', -48, 12, 6),
      ...labCam('dram', 115, 235, 25),
      preset: { mode: 'mem-dram' },
      body: (
        <>
          <p>
            Każdy bit pamięci RAM to maleńki <b>kondensator</b> i <b>tranzystor</b>. Naładowany kondensator (świeci) oznacza 1, pusty – 0. Linia słowa włącza tranzystory całego rzędu, a linie bitu odczytują lub zapisują ładunek. Na siatce 8 × 8 zapisaliśmy literę „A”.
          </p>
          <p>
            Kondensator jest tak mały, że ładunek z niego ucieka w ułamku sekundy. Dlatego pamięć jest <b>odświeżana</b>: co 32 ms każdy rząd jest odczytywany i ładowany od nowa. Moduł 32 GB ma ok. 275 miliardów takich komórek.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Pamięć flash w dysku SSD',
      spot: at('mem', 0, -22, 20),
      ...labCam('nand', 240, 120, 82),
      preset: { mode: 'mem-nand' },
      body: (
        <>
          <p>
            Dysk SSD zapisuje dane w pamięci <b>NAND flash</b>. W nowoczesnych kościach komórki ułożone są w wysokie stosy – ponad 200 warstw jedna na drugiej, jak wieżowiec. Przez cały stos przewiercone są pionowe kanały.
          </p>
          <p>
            W każdej warstwie wokół kanału jest <b>warstwa pułapkująca</b>. Gdy wtłoczy się do niej elektrony (niebieskie kropki), zostają tam latami – także bez prądu. Ilość ładunku zapisuje 1 do 4 bitów. Kontroler rozkłada zapis po całym dysku, żeby komórki zużywały się równo.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Dysk twardy',
      spot: at('mem', 44, -40, 10),
      ...labCam('hdd', 150, 195, 55),
      preset: { mode: 'mem-hdd' },
      body: (
        <>
          <p>
            Dysk twardy bez pokrywy. Talerze pokryte cienką warstwą magnetyku wirują 7200 razy na minutę. Głowica na ramieniu namagnesowuje maleńkie obszary w jedną albo drugą stronę – to zera i jedynki – i odczytuje je z powrotem.
          </p>
          <p>
            Głowica unosi się nad talerzem na poduszce powietrza grubości kilku nanometrów. Ramię przeskakuje między ścieżkami w kilka milisekund – dla procesora to wieczność. Dlatego system i programy trzyma się na SSD, a HDD służy na duże archiwa.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Piramida pamięci',
      spot: at('mem', 0, -48, 20),
      ...labCam('pyr', 210, 140, 45),
      preset: { mode: 'mem-pyr' },
      body: (
        <>
          <p>
            Im szybsza pamięć, tym droższa i mniejsza. Dlatego komputer ma ich całą piramidę. Na górze <b>rejestry</b> i <b>pamięć podręczna</b> w samym procesorze, niżej RAM, na dole dyski. Procesor szuka danych od góry: najpierw w L1, potem L2, L3, RAM, a na końcu na dysku.
          </p>
          <p>Ramka obok pokazuje różnicę w ludzkiej skali: gdyby odczyt z rejestru trwał sekundę, na dane z RAM-u czekałoby się 7 minut, a z dysku twardego ponad rok.</p>
        </>
      ),
    }),
  ],
};

/* ======================= karta graficzna ======================= */

const gpuModule: PartModule = {
  id: 'grafika',
  title: 'Karta graficzna i obraz',
  summary: 'Karta rozłożona na warstwy, od trójkątów do pikseli, tysiące rdzeni, matryca monitora',
  steps: [
    pcs({
      title: 'Karta graficzna',
      ...labCam('gpu', 200, 235, 92),
      preset: { mode: 'gpu-home' },
      body: (
        <>
          <p>
            <b>Karta graficzna</b> rozsunięta na warstwy i odwrócona wentylatorami do góry. To osobny komputer w komputerze: ma własny procesor (GPU), własną pamięć, zasilanie i chłodzenie. Rysuje obraz – w grze nawet 144 razy na sekundę – i liczy zadania sztucznej inteligencji.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: od trójkątów do pikseli, rdzenie i matryca monitora.</p>
        </>
      ),
    }),
    pcs({
      title: 'Od trójkątów do pikseli',
      spot: at('gpu', -12, -14, 10),
      ...labCam('raster', 230, 120, 45),
      preset: { mode: 'gpu-raster' },
      body: (
        <>
          <p>
            Każdy przedmiot w grze to siatka <b>trójkątów</b>. Karta najpierw oblicza, gdzie na ekranie wypadają ich wierzchołki (1). Potem łączy je w trójkąty (2) i sprawdza, które piksele ekranu każdy trójkąt zakrywa – to <b>rasteryzacja</b> (3).
          </p>
          <p>
            Na koniec dla każdego piksela liczy kolor: z tekstury, oświetlenia i cieni (4). Monitor 2560 × 1440 ma 3,7 mln pikseli, a przy 144 klatkach na sekundę karta liczy kolor ponad 500 mln pikseli na sekundę.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Tysiące rdzeni',
      spot: at('gpu', 6, -14, 20),
      ...labCam('cores', 210, 160, 55),
      preset: { mode: 'gpu-cores' },
      body: (
        <>
          <p>
            Procesor ma kilka–kilkanaście dużych, sprytnych rdzeni, które szybko wykonują długie, skomplikowane programy jeden krok po drugim. Karta graficzna ma <b>tysiące</b> prostych rdzeni, które robią to samo naraz na różnych danych.
          </p>
          <p>Kolor każdego piksela liczy się tak samo, tylko z innymi liczbami – idealne zadanie dla tysięcy rdzeni. Z tego samego powodu karty graficzne świetnie nadają się do uczenia sztucznej inteligencji.</p>
        </>
      ),
    }),
    pcs({
      title: 'Matryca monitora',
      spot: at('gpu', -46, 10, 0),
      ...labCam('lcd', 230, 140, 65),
      preset: { mode: 'gpu-lcd' },
      body: (
        <>
          <p>
            Monitor LCD to kanapka warstw. Z tyłu świeci białe <b>podświetlenie</b>. Dwa <b>polaryzatory</b> ustawione na krzyż zatrzymują światło, a między nimi <b>ciekłe kryształy</b> skręcają je o tyle, o ile każe tranzystor danego punktu. Tak każdy punkt przepuszcza więcej albo mniej światła.
          </p>
          <p>
            <b>Filtr barw</b> robi z każdego piksela trzy subpiksele: czerwony, zielony i niebieski. Z ich jasności oko składa każdy kolor. W monitorach OLED zamiast podświetlenia i kryształów każdy subpiksel sam świeci.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= urządzenia ======================= */

const ioModule: PartModule = {
  id: 'urzadzenia',
  title: 'Monitor, klawiatura i mysz',
  summary: 'Urządzenia wejścia i wyjścia, przełącznik klawisza, mysz optyczna, złącza',
  steps: [
    pcs({
      title: 'Urządzenia wejścia i wyjścia',
      camera: DESK_CAM,
      target: DESK_TGT,
      preset: { mode: 'io-home' },
      body: (
        <>
          <p>
            Komputer rozmawia ze światem przez <b>urządzenia wejścia</b> (klawiatura, mysz, mikrofon, kamera) i <b>wyjścia</b> (monitor, głośniki, drukarka). Każde z nich zamienia coś z naszego świata – naciśnięcie, ruch dłoni, światło – na liczby albo odwrotnie.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: klawisz, mysz i złącza.</p>
        </>
      ),
    }),
    pcs({
      title: 'Klawisz od środka',
      spot: [KEYBOARD.x + 4, 82, KEYBOARD.z],
      ...labCam('key', 150, 120, 50),
      preset: { mode: 'io-key' },
      body: (
        <>
          <p>
            Przełącznik klawiatury mechanicznej w przekroju, powiększony 30 razy. Nasadka siedzi na czerwonym <b>trzpieniu</b>, który sprężyna wypycha do góry. Gdy klawisz zjedzie ok. 2 mm, trzpień przestaje odpychać giętką blaszkę i ta styka się z drugą – płynie prąd.
          </p>
          <p>
            Klawisze połączone są w siatkę rzędów i kolumn. Układ w klawiaturze kilkaset razy na sekundę zasila po kolei każdy rząd i sprawdza, w której kolumnie pojawił się prąd. Tak wie, który klawisz naciśnięto, i wysyła jego kod do komputera.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Mysz optyczna',
      spot: [MOUSE.x, 83, MOUSE.z],
      ...labCam('mouse', 105, 85, 50),
      preset: { mode: 'io-mouse' },
      body: (
        <>
          <p>
            Mysz przecięta wzdłuż. Pod spodem <b>dioda</b> oświetla blat pod ostrym kątem, żeby było widać każdą nierówność. Soczewka rzuca obraz na <b>czujnik</b> – maleńką kamerę o rozdzielczości ok. 30 × 30 pikseli.
          </p>
          <p>Czujnik robi nawet 10 000 zdjęć na sekundę i porównuje kolejne. Jeśli wzór przesunął się w lewo, mysz pojechała w prawo. Przyciski to mikroprzełączniki, a kółko obraca tarczę z otworami, które liczy czujnik światła.</p>
        </>
      ),
    }),
    pcs({
      title: 'Złącza',
      spot: pc(-24, 34, 3),
      ...labCam('ports', 165, 120, 65),
      preset: { mode: 'io-ports' },
      body: (
        <>
          <p>
            Każde złącze ma swój kształt, żeby nie dało się pomylić kabli. <b>USB</b> łączy prawie wszystko: klawiaturę, mysz, pendrive, telefon. USB-C jest symetryczne i może też ładować laptop. <b>HDMI</b> i <b>DisplayPort</b> przesyłają obraz i dźwięk do monitora.
          </p>
          <p>Gniazdo <b>RJ-45</b> to sieć przewodowa – osiem przewodów w czterech skręconych parach. Gniazdo <b>jack</b> jako jedyne przesyła sygnał analogowy: drgania prądu odpowiadające drganiom powietrza w słuchawkach.</p>
        </>
      ),
    }),
  ],
};

/* ======================= komputer kiedyś ======================= */

const historyModule: PartModule = {
  id: 'historia',
  title: 'Komputer kiedyś',
  summary: 'Muzeum: ENIAC, IBM PC, komputer z lat 90., lampa elektronowa, kineskop, nośniki danych, prawo Moore’a',
  steps: [
    pcs({
      title: 'Komputer kiedyś',
      camera: MUS_CAM,
      target: MUS_TGT,
      preset: { mode: 'hi-home' },
      body: (
        <>
          <p>
            Muzeum komputerów. Po lewej fragment <b>ENIAC-a</b> z 1946 r. – szafy z tysiącami świecących lamp. Dalej <b>IBM PC</b> z 1981 r., pierwszy „pecet”, od którego wziął się układ części używany do dziś. Potem beżowy komputer z Windows 98 i na końcu nasz dzisiejszy.
          </p>
          <p>Kliknij podpis komputera. Numery prowadzą do zakładek: lampa elektronowa, kineskop, nośniki danych i prawo Moore’a.</p>
        </>
      ),
    }),
    pcs({
      title: 'Lampa elektronowa',
      spot: [MUSEUM.eniac[0] + 30, 120, MUSEUM.eniac[2] + 20],
      ...labCam('tube', 140, 120, 70),
      preset: { mode: 'hi-tube' },
      body: (
        <>
          <p>
            Zanim wynaleziono tranzystor, przełącznikami w komputerach były <b>lampy elektronowe</b>. W szklanej bańce bez powietrza rozżarzona <b>katoda</b> wyrzuca elektrony, które lecą do <b>anody</b>. Siatka między nimi decyduje, czy przelecą – jak bramka w tranzystorze.
          </p>
          <p>
            Lampa ma wielkość kciuka, grzeje się jak żarówka i przepala co kilka tysięcy godzin. ENIAC miał 18 000 lamp, brał 150 kW prądu i co kilka dni trzeba było szukać tej, która się przepaliła. Dziś na tej samej powierzchni co jedna lampa mieści się kilkaset miliardów tranzystorów.
          </p>
        </>
      ),
    }),
    pcs({
      title: 'Monitor kineskopowy',
      spot: [MUSEUM.beige[0] - 12, 120, MUSEUM.beige[2]],
      ...labCam('crt', 160, 120, 90, 40),
      preset: { mode: 'hi-crt' },
      body: (
        <>
          <p>
            Do ok. 2005 r. monitory miały <b>kineskop</b> – wielką szklaną bańkę. Z tyłu <b>działo elektronowe</b> wystrzeliwuje wiązkę elektronów, a cewki magnetyczne odchylają ją tak, że przebiega cały ekran linia po linii, 60–85 razy na sekundę.
          </p>
          <p>Ekran pokryty jest kropkami <b>luminoforu</b>, które świecą, gdy trafią w nie elektrony – czerwone, zielone i niebieskie. Monitor 17″ ważył ok. 15 kg i miał głębokość ok. 40 cm.</p>
        </>
      ),
    }),
    pcs({
      title: 'Nośniki danych',
      spot: [MUSEUM.ibm[0], 100, MUSEUM.ibm[2] + 22],
      ...labCam('media', 230, 130, 50),
      preset: { mode: 'hi-media' },
      body: (
        <>
          <p>
            Wszystko w tej samej skali. <b>Karta perforowana</b> mieściła 80 znaków – jedną linijkę tekstu. Dyskietka 5,25″ – 360 KB, czyli ok. 180 stron tekstu. Dyskietka 3,5″ – 1,44 MB. Płyta CD – 700 MB, tyle co prawie 500 dyskietek.
          </p>
          <p>Karta microSD wielkości paznokcia mieści dziś 1 TB – tyle co ok. 700 000 dyskietek 3,5″. Ułożone w stos miałyby ponad 2 km wysokości.</p>
        </>
      ),
    }),
    pcs({
      title: 'Prawo Moore’a',
      spot: [MUSEUM.today[0] + 40, 140, MUSEUM.today[2]],
      ...labCam('moore', 330, 150, 72),
      preset: { mode: 'hi-moore' },
      body: (
        <>
          <p>
            W 1965 r. Gordon Moore zauważył, że liczba tranzystorów w układzie scalonym podwaja się co mniej więcej dwa lata. Ta reguła sprawdza się od ponad 50 lat. Na wykresie każdy kolejny poziom to <b>dziesięć razy więcej</b> tranzystorów.
          </p>
          <p>
            Pierwszy mikroprocesor, Intel 4004 z 1971 r., miał 2300 tranzystorów. Dzisiejsze największe układy mają ich ponad 90 miliardów. Tranzystory są już tak małe, że ich części mają grubość kilkudziesięciu atomów – dalsze zmniejszanie jest coraz trudniejsze.
          </p>
        </>
      ),
    }),
  ],
};

export const personalComputer: Topic = {
  id: 'komputer-osobisty',
  title: 'Komputer osobisty',
  subject: 'technika',
  summary: 'Komputer stacjonarny w 3D: obudowa i zasilacz, płyta główna, procesor od tranzystora po chłodzenie, pamięć i dyski, karta graficzna i obraz, klawiatura, mysz i monitor, a także komputery dawniej.',
  accent: '#7c3aed',
  glyph: '🖥️',
  steps: overview,
  modules: [caseModule, boardModule, cpuModule, memModule, gpuModule, ioModule, historyModule],
};

