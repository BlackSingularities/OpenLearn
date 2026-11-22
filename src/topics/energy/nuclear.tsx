import type { ReactNode } from 'react';
import type { Control, PartModule, Step, Topic } from '../../lib/types';
import { useTopicNav } from '../../lib/topicNav';
import { NuclearScene } from './nuclearScene';
import { AX, TRAFO, TURB } from './coalGeo';
import { CASKS, CORE, FRAME, INTAKE, POOL, PZR, RPV, SG, SHIELD, type V3 } from './nuclearGeo';
import { FUEL_LAB, LAB } from './nuclearFx';

/* ======================= pomocnicze ======================= */

const nuc = (s: Omit<Step, 'kind' | 'scene' | 'stageKey' | 'frame'>): Step => ({ kind: '3d', scene: NuclearScene, stageKey: 'nuclear', frame: FRAME, ...s });
const RUN: Control = { type: 'button', key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false };
const RODS = (def: number): Control => ({ type: 'slider', key: 'rods', label: 'Wsunięcie prętów sterujących', min: 0, max: 100, step: 5, default: def, unit: '%' });
const tx = (id: string) => TURB.find((t) => t.id === id)!.x;

function Open({ id, children }: { id: string; children: ReactNode }) {
  const nav = useTopicNav();
  return (
    <button type="button" className="module-open" onClick={() => nav?.openModule(id)}>
      {children}
      <span aria-hidden>→</span>
    </button>
  );
}

const HOME_CAM: V3 = [380, 230, 430];
const HOME_TGT: V3 = [-40, 30, -40];
const CUT_CAM: V3 = [50, 52, 104];
const CUT_TGT: V3 = [0, 30, 0];
const CORE_CAM: V3 = [7, 17, 17];
const CORE_TGT: V3 = [0, 13.5, 0];
const LOOP_CAM: V3 = [22, 30, 46];
const LOOP_TGT: V3 = [0, 20, 0];
const HALL_CAM: V3 = [-60, 62, 118];
const HALL_TGT: V3 = [-95, 14, 0];
const POOL_CAM: V3 = [46, 44, 40];
const POOL_TGT: V3 = [42, 6, -7];
const SEA_CAM: V3 = [-460, 280, 240];
const SEA_TGT: V3 = [-60, -10, -430];
const GRID_CAM: V3 = [-80, 160, 330];
const GRID_TGT: V3 = [-260, 20, 0];
const LAB_CAM: V3 = [LAB[0], LAB[1] + 2, LAB[2] + 66];
const FUEL_CAM: V3 = [FUEL_LAB[0] - 10, FUEL_LAB[1] + 2, FUEL_LAB[2] + 86];
const FUEL_TGT: V3 = [FUEL_LAB[0] - 10, FUEL_LAB[1], FUEL_LAB[2]];

/* ======================= przegląd ======================= */

const overview: Step[] = [
  nuc({
    title: 'Elektrownia jądrowa',
    camera: HOME_CAM,
    target: HOME_TGT,
    preset: { mode: 'home' },
    body: (
      <>
        <p>
          <b>Elektrownia jądrowa</b> działa prawie tak samo jak węglowa: ciepło zamienia wodę w parę, para kręci turbiną, a turbina – generatorem. Różnica jest w źródle ciepła. Zamiast spalać węgiel, w <b>reaktorze</b> rozszczepia się jądra atomów uranu. Nic się tu nie pali, więc z komina nie leci dym ani dwutlenek węgla.
        </p>
        <p>
          Przed Tobą blok z reaktorem wodnym ciśnieniowym o mocy ok. <b>1150 MW</b>, taki jak AP1000, który wybrano dla pierwszej polskiej elektrowni jądrowej na Pomorzu. Stoi nad morzem: zamiast chłodni kominowej chłodzi go woda z Bałtyku. Okrągły budynek z kopułą to budynek reaktora.
        </p>
        <p>Kliknij podpis na modelu, żeby otworzyć moduł: reaktor i paliwo, obieg pierwotny, bezpieczeństwo, turbina i morze, paliwo i odpady oraz droga prądu do sieci. Model możesz obracać myszą i przybliżać kółkiem.</p>
      </>
    ),
  }),
  nuc({
    title: 'Reaktor',
    camera: CUT_CAM,
    target: CUT_TGT,
    preset: { mode: 'tour-re' },
    body: (
      <>
        <p>
          Zdjęliśmy przednią połowę budynku. W środku, pod pomostem, stoi stalowy <b>zbiornik reaktora</b>, a w nim <b>rdzeń</b> z paliwem uranowym. Uran oddaje ciepło wodzie, która płynie przez rdzeń. Pręty sterujące, wsuwane od góry, decydują, ile tego ciepła powstaje.
        </p>
        <p>
          <Open id="reaktor">Otwórz moduł: reaktor i paliwo</Open>
        </p>
      </>
    ),
  }),
  nuc({
    title: 'Obieg pierwotny',
    camera: LOOP_CAM,
    target: LOOP_TGT,
    preset: { mode: 'tour-ob' },
    body: (
      <>
        <p>
          Gorąca woda z reaktora (czerwone kulki) płynie do dwóch <b>wytwornic pary</b>, oddaje im ciepło i wraca pompami do reaktora (niebieskie kulki). Ta woda nigdy nie wypływa poza budynek. W wytwornicach powstaje para z innej, czystej wody.
        </p>
        <p>
          <Open id="obieg">Otwórz moduł: obieg pierwotny</Open>
        </p>
      </>
    ),
  }),
  nuc({
    title: 'Bezpieczeństwo',
    camera: [70, 80, 130],
    target: [0, 40, 0],
    preset: { mode: 'tour-bz' },
    body: (
      <>
        <p>
          Reaktor jest zamknięty w kilku barierach jedna w drugiej: stalowa obudowa bezpieczeństwa, a na zewnątrz – betonowy budynek osłonowy. Na dachu jest zbiornik z wodą. W razie awarii woda spływa sama po obudowie i ją chłodzi (niebieskie kropki), a powietrze wynosi ciepło kominem (pomarańczowe).
        </p>
        <p>
          <Open id="bezpieczenstwo">Otwórz moduł: bezpieczeństwo</Open>
        </p>
      </>
    ),
  }),
  nuc({
    title: 'Turbina i morze',
    camera: HALL_CAM,
    target: HALL_TGT,
    preset: { mode: 'tour-tu' },
    body: (
      <>
        <p>
          Para z wytwornic płynie do <b>maszynowni</b> i kręci turbiną połączoną z generatorem – tak jak w elektrowni węglowej. Potem skrapla się w skraplaczach, które chłodzi woda morska pompowana z Bałtyku.
        </p>
        <p>
          <Open id="turbina">Otwórz moduł: turbina i morze</Open>
        </p>
      </>
    ),
  }),
  nuc({
    title: 'Paliwo i odpady',
    camera: POOL_CAM,
    target: POOL_TGT,
    preset: { mode: 'tour-pa' },
    body: (
      <>
        <p>
          W budynku obok reaktora jest <b>basen</b>, w którym pod wodą stoi wypalone paliwo. Świeci na niebiesko. Paliwa jest bardzo mało – kilkadziesiąt ton rocznie zamiast kilku milionów ton węgla – ale przez długi czas trzeba je bezpiecznie przechowywać.
        </p>
        <p>
          <Open id="paliwo">Otwórz moduł: paliwo i odpady</Open>
        </p>
      </>
    ),
  }),
  nuc({
    title: 'Do sieci',
    camera: GRID_CAM,
    target: GRID_TGT,
    preset: { mode: 'tour-gr' },
    body: (
      <>
        <p>
          Prąd z generatora (żółte kulki) płynie przez transformator i rozdzielnię do linii 400 kV. Elektrownia jądrowa pracuje równo, dzień i noc, przez cały rok – przerwę robi się tylko co ok. 18 miesięcy na wymianę paliwa.
        </p>
        <p>
          <Open id="siec">Otwórz moduł: do sieci</Open>
        </p>
      </>
    ),
  }),
];

/* ======================= reaktor ======================= */

const reactorModule: PartModule = {
  id: 'reaktor',
  title: 'Reaktor i paliwo',
  summary: 'Zbiornik i rdzeń w przekroju, reakcja łańcuchowa, paliwo od pastylki do kasety, pręty sterujące',
  steps: [
    nuc({
      title: 'Reaktor w przekroju',
      camera: CORE_CAM,
      target: CORE_TGT,
      preset: { mode: 're-home' },
      body: (
        <>
          <p>
            Patrzysz na przecięty <b>zbiornik reaktora</b>. Szare słupki w środku to <b>kasety paliwowe</b>, a ciemne – <b>pręty sterujące</b>, wsunięte od góry tylko trochę. Rdzeń jest zanurzony w wodzie, która płynie przez niego z dołu do góry i zabiera ciepło.
          </p>
          <p>Kliknij podpis części. Numery na modelu prowadzą do zakładek: reakcja łańcuchowa, paliwo i pręty sterujące.</p>
        </>
      ),
    }),
    nuc({
      title: 'Reakcja łańcuchowa',
      spot: [0, CORE.y1 + 1, 2],
      camera: LAB_CAM,
      target: LAB,
      preset: { mode: 're-fission' },
      controls: [RODS(45)],
      body: (
        <>
          <p>
            To ogromne powiększenie tego, co dzieje się w paliwie. Zielone kule to jądra atomów <b>uranu-235</b>. Gdy trafi w nie wolny <b>neutron</b> (niebieski), jądro pęka na dwa odłamki, a te pędzą z ogromną prędkością. W paliwie szybko hamują, a ich ruch zamienia się w ciepło. Przy okazji wylatują 2–3 nowe neutrony.
          </p>
          <p>
            Nowe neutrony są prędkie (pomarańczowe). Dopiero gdy zwolnią w wodzie, mogą rozszczepić kolejne jądro – tak powstaje <b>reakcja łańcuchowa</b>. Ciemne <b>pręty</b> pochłaniają neutrony. Przesuń suwak: przy wysuniętych prętach reakcja przyspiesza, przy wsuniętych gaśnie. W reaktorze trzyma się ją dokładnie pośrodku: każde rozszczepienie wywołuje średnio jedno następne.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Paliwo jądrowe',
      spot: [0.6, CORE.y0 + 1, 1.5],
      camera: FUEL_CAM,
      target: FUEL_TGT,
      preset: { mode: 're-fuel' },
      body: (
        <>
          <p>
            Paliwo to <b>pastylki</b> z tlenku uranu – twardej, szarej ceramiki – wielkości gumki na końcu ołówka. Uran jest <b>wzbogacony</b>: zwykły uran ma tylko 0,7% łatwo rozszczepialnego uranu-235, a w paliwie jest go ok. 4–5%.
          </p>
          <p>
            Ok. 370 pastylek wsuwa się do szczelnej rurki ze stopu cyrkonu – to <b>pręt paliwowy</b> długości ok. 4 m. 264 pręty, połączone kratkami dystansowymi, tworzą <b>kasetę</b>. W pozostałych 25 miejscach kasety są rurki, w które wsuwają się pręty sterujące albo przyrządy pomiarowe. Rdzeń składa się ze 157 kaset.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Pręty sterujące',
      spot: [0, RPV.y1 + 4, 1.5],
      camera: [8, 18, 15],
      target: [0, 14.5, 0],
      preset: { mode: 're-rods' },
      controls: [RODS(15)],
      body: (
        <>
          <p>
            Przesuń suwak i zobacz, jak <b>pręty sterujące</b> wchodzą w rdzeń. Im głębiej, tym więcej neutronów pochłaniają, tym mniej rozszczepień i tym mniej ciepła. Przy pełnej mocy pręty są prawie wysunięte.
          </p>
          <p>
            Moc reguluje też sama woda. Gdy reaktor się nagrzewa, woda rzednie i gorzej spowalnia neutrony, więc reakcja słabnie. Taki reaktor sam się hamuje, gdy robi się za gorący – to ważna cecha bezpieczeństwa. Do powolnych zmian dodaje się do wody kwas borowy, który też pochłania neutrony.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= obieg ======================= */

const loopModule: PartModule = {
  id: 'obieg',
  title: 'Obieg pierwotny',
  summary: 'Wytwornice pary, pompy i stabilizator ciśnienia, dwa obiegi wody, wytwornica od środka, dlaczego woda nie wrze',
  steps: [
    nuc({
      title: 'Obieg pierwotny',
      camera: LOOP_CAM,
      target: LOOP_TGT,
      preset: { mode: 'ob-home' },
      body: (
        <>
          <p>
            Woda, która płynie przez rdzeń, krąży w zamkniętym <b>obiegu pierwotnym</b>: z reaktora do wytwornic pary, przez pompy i z powrotem. Wszystko to jest w szczelnej obudowie bezpieczeństwa. Woda jest lekko radioaktywna, więc nie może się wydostać na zewnątrz.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: dwa obiegi wody, wytwornica od środka i stabilizator ciśnienia.</p>
        </>
      ),
    }),
    nuc({
      title: 'Dwa obiegi wody',
      spot: [-SG.x, SG.y1 + 6, 1],
      camera: [40, 40, 64],
      target: [-14, 26, 0],
      preset: { mode: 'ob-loop' },
      body: (
        <>
          <p>
            W elektrowni są dwa oddzielne obiegi wody. <b>Obieg pierwotny</b> (czerwone i niebieskie kulki) przenosi ciepło z reaktora do wytwornic pary. <b>Obieg wtórny</b>: woda zasilająca (granatowe kulki) wpływa do wytwornic, zamienia się w parę (białe kulki), a ta płynie do turbiny.
          </p>
          <p>
            Dlaczego dwa obiegi? Woda w reaktorze ma kontakt z rdzeniem i zawiera ślady substancji radioaktywnych. Dzięki wytwornicom do turbiny trafia tylko czysta para. W maszynowni można pracować jak w zwykłej elektrowni.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Wytwornica pary od środka',
      spot: [SG.x, SG.yMid, 2],
      camera: [24, 27, 26],
      target: [SG.x, 25, 0],
      preset: { mode: 'ob-sg' },
      body: (
        <>
          <p>
            <b>Wytwornica pary</b> to ogromny czajnik, w którym zamiast grzałki są rurki z gorącą wodą z reaktora. Woda z obiegu pierwotnego wpływa od dołu, przechodzi przez ok. 10 000 rurek w kształcie odwróconego U i wypływa z powrotem. Rurki mają grubość ołówka.
          </p>
          <p>
            Wokół rurek jest woda z obiegu wtórnego. Ma niższe ciśnienie, więc wrze – białe kropki to pęcherzyki pary. W górnej, szerszej części <b>oddzielacze</b> wyłapują krople wody, żeby do turbiny płynęła sucha para.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Stabilizator ciśnienia',
      spot: [PZR.x, PZR.y1 + 2, PZR.z],
      camera: [15, 27, 13],
      target: [PZR.x, 25.5, PZR.z],
      preset: { mode: 'ob-press' },
      body: (
        <>
          <p>
            Woda w reaktorze ma ok. 320 °C, a jednak nie wrze. Temperatura wrzenia zależy od ciśnienia: w szybkowarze woda gotuje się w ok. 120 °C, a przy ciśnieniu 155 razy większym od atmosferycznego – dopiero w ok. 345 °C.
          </p>
          <p>
            To ciśnienie utrzymuje <b>stabilizator</b>. W dolnej części jest woda, a w górnej – poduszka pary. Gdy ciśnienie spada, włączają się grzałki: więcej wody paruje i ciśnienie rośnie. Gdy rośnie za bardzo, natrysk zimnej wody skrapla część pary i ciśnienie spada.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= bezpieczeństwo ======================= */

const safetyModule: PartModule = {
  id: 'bezpieczenstwo',
  title: 'Bezpieczeństwo',
  summary: 'Bariery między paliwem a otoczeniem, wyłączenie awaryjne i ciepło powyłączeniowe, bierne chłodzenie bez prądu',
  steps: [
    nuc({
      title: 'Bariery',
      camera: [56, 54, 108],
      target: [0, 30, 0],
      preset: { mode: 'bz-home' },
      body: (
        <>
          <p>
            Paliwo jest zamknięte w kilku <b>barierach</b>, jedna w drugiej – jak w matrioszce. Każda z nich osobno zatrzymuje substancje radioaktywne. Żeby wydostały się na zewnątrz, musiałyby zawieść wszystkie naraz.
          </p>
          <p>Kliknij podpisy barier. Numery prowadzą do zakładek: wyłączenie awaryjne i bierne chłodzenie.</p>
        </>
      ),
    }),
    nuc({
      title: 'Wyłączenie awaryjne',
      spot: [0, CORE.y1 + 2, 3],
      camera: [9, 19, 19],
      target: [0, 14, 0],
      preset: { mode: 'bz-scram' },
      controls: [RUN],
      body: (
        <>
          <p>
            Naciśnij „Rozpocznij”. Gdy czujniki wykryją coś niepokojącego – zbyt wysoką temperaturę, ciśnienie albo trzęsienie ziemi – elektromagnesy puszczają <b>pręty sterujące</b> i te w ok. 2 sekundy wpadają do rdzenia. Reakcja łańcuchowa ustaje.
          </p>
          <p>
            Reaktora nie da się jednak „zgasić” do zera jak palnika. Odłamki rozszczepienia są radioaktywne i rozpadając się, dalej wydzielają ciepło – na początku ok. 6% mocy, czyli ok. 200 MW. To <b>ciepło powyłączeniowe</b> maleje powoli (wykres), dlatego reaktor trzeba chłodzić jeszcze przez wiele dni. To właśnie zabrakło chłodzenia w Fukushimie w 2011 r.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Bierne chłodzenie',
      spot: [0, SHIELD.tankY1 + 2, 2],
      camera: [64, 70, 120],
      target: [0, 40, 0],
      preset: { mode: 'bz-passive' },
      controls: [RUN],
      body: (
        <>
          <p>
            Co, jeśli zabraknie prądu do pomp? Naciśnij „Rozpocznij”. W tym typie reaktora zawory otwierają się same, a woda ze <b>zbiornika na dachu</b> spływa siłą ciężkości po stalowej obudowie (niebieskie kropki). Parując, odbiera stali ciepło. W środku para z obiegu skrapla się na zimnej ścianie i spływa z powrotem do reaktora.
          </p>
          <p>
            Ogrzane powietrze w szczelinie między stalą a betonem unosi się i wylatuje kominem (pomarańczowe kropki), a od dołu napływa nowe. Nie trzeba pomp, prądu ani ludzi – takie <b>bierne chłodzenie</b> działa co najmniej 3 doby, a po dolaniu wody dłużej.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= turbina ======================= */

const turbineModule: PartModule = {
  id: 'turbina',
  title: 'Turbina i morze',
  summary: 'Maszynownia, obieg wody i pary, chłodzenie wodą z Bałtyku, bilans energii',
  steps: [
    nuc({
      title: 'Maszynownia',
      camera: HALL_CAM,
      target: HALL_TGT,
      preset: { mode: 'tu-home' },
      body: (
        <>
          <p>
            Maszynownia elektrowni jądrowej wygląda prawie tak samo jak w elektrowni węglowej. Turbina jest jednak większa, bo para jest chłodniejsza (ok. 273 °C zamiast 600 °C) i trzeba jej więcej, żeby dać tę samą moc.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: obieg wody i pary, woda z morza i bilans energii.</p>
        </>
      ),
    }),
    nuc({
      title: 'Obieg wody i pary',
      spot: [tx('lp1'), AX + 9, 2],
      camera: [40, 120, 200],
      target: [-50, 20, 0],
      preset: { mode: 'tu-cycle' },
      body: (
        <>
          <p>
            Na całym rysunku widać, jak ciepło wędruje z reaktora do morza. Obieg pierwotny (czerwony i niebieski) oddaje je w wytwornicach. Para (białe kulki) kręci turbiną. W skraplaczu oddaje ciepło wodzie morskiej (jasnoniebieskie i pomarańczowe kulki) i jako woda (granatowe kulki) wraca do wytwornic.
          </p>
          <p>
            Trzy obiegi wody nigdzie się nie mieszają: woda z morza nie styka się z wodą z obiegu pary, a ta – z wodą z reaktora. Dlatego woda oddawana do morza jest tylko cieplejsza, nie radioaktywna.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Woda z Bałtyku',
      spot: [INTAKE[0], 10, INTAKE[2]],
      camera: SEA_CAM,
      target: SEA_TGT,
      preset: { mode: 'tu-sea' },
      body: (
        <>
          <p>
            Elektrownia na Pomorzu nie potrzebuje chłodni kominowych – chłodzi ją <b>woda morska</b>. Tunel pod dnem (na modelu kulki płyną nad nim) prowadzi od ujęcia kilka kilometrów od brzegu do pompowni. Pompy przetłaczają ok. 60 m³ wody na sekundę przez skraplacze, a drugi tunel wypuszcza ją z powrotem do morza, daleko od ujęcia.
          </p>
          <p>
            Oddawana woda jest o ok. 10 °C cieplejsza. W otwartym morzu szybko się miesza i ochładza. Przed budową bada się, jak wpłynie to na ryby i rośliny przy dnie. Głowice ujęcia mają kraty i sita, które nie wpuszczają ryb.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Bilans energii',
      spot: [-94, 12, 8],
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'tu-sankey' },
      body: (
        <>
          <p>
            Z ciepła powstałego w reaktorze ok. <b>33%</b> zamienia się w prąd. To mniej niż w nowoczesnej elektrowni węglowej (ok. 45%), bo para ma niższą temperaturę. Woda w reaktorze nie może być gorętsza niż ok. 320 °C, bo zaczęłaby wrzeć.
          </p>
          <p>
            Resztę, prawie dwie trzecie, trzeba oddać do otoczenia – tu do morza. Nie oznacza to marnowania paliwa: uranu jest tak mało i jest tak tani w przeliczeniu na energię, że sprawność nie jest tu najważniejsza.
          </p>
        </>
      ),
    }),
  ],
};

/* ======================= paliwo i odpady ======================= */

const fuelModule: PartModule = {
  id: 'paliwo',
  title: 'Paliwo i odpady',
  summary: 'Basen wypalonego paliwa, ile energii w uranie, wymiana paliwa, magazyn suchy i składowanie',
  steps: [
    nuc({
      title: 'Basen wypalonego paliwa',
      camera: POOL_CAM,
      target: POOL_TGT,
      preset: { mode: 'pa-home' },
      body: (
        <>
          <p>
            Paliwo pracuje w reaktorze 4–6 lat. Potem jest <b>wypalone</b>: ma za mało uranu-235, a za dużo odłamków rozszczepienia. Jest wtedy bardzo radioaktywne i gorące, dlatego najpierw przez kilka lat leży w <b>basenie</b> pod wodą, która je chłodzi i osłania.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: energia w uranie, wymiana paliwa, basen z bliska i magazyn suchy.</p>
        </>
      ),
    }),
    nuc({
      title: 'Ile energii jest w uranie',
      spot: [POOL.x0 + 2, POOL.y1 + 3, -2],
      camera: FUEL_CAM,
      target: FUEL_TGT,
      preset: { mode: 'pa-energy' },
      body: (
        <>
          <p>
            Rozszczepienie jednego jądra uranu daje kilkadziesiąt milionów razy więcej energii niż spalenie jednego atomu węgla. Dlatego jedna <b>pastylka</b> paliwa – ok. 7 gramów – daje tyle ciepła, co tona węgla.
          </p>
          <p>
            Blok o mocy 1150 MW zużywa rocznie ok. <b>25 t</b> uranu – mieści się to w jednej ciężarówce. Elektrownia węglowa tej mocy spaliłaby w tym czasie ok. 3 mln t węgla, czyli ok. 50 000 wagonów.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Wymiana paliwa',
      spot: [12, 34, -4],
      camera: [70, 46, 76],
      target: [22, 14, -4],
      preset: { mode: 'pa-refuel' },
      controls: [RUN],
      body: (
        <>
          <p>
            Co ok. 18 miesięcy reaktor zatrzymuje się na kilka tygodni. Naciśnij „Rozpocznij”. Pokrywę zbiornika zdejmuje się suwnicą, a kanał nad reaktorem zalewa wodą – woda osłania ludzi przed promieniowaniem. <b>Maszyna przeładunkowa</b> wyjmuje kasety jedna po drugiej.
          </p>
          <p>
            Kaseta przejeżdża pod wodą tunelem do <b>basenu</b> w budynku obok. Wymienia się ok. jednej trzeciej kaset. Pozostałe przestawia się w rdzeniu, żeby wypalały się równo, a na wolne miejsca wstawia się nowe. W tym czasie robi się też przeglądy i naprawy.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Basen z bliska',
      spot: [(POOL.x0 + POOL.x1) / 2, POOL.y1 + 4, -6],
      camera: [50, 26, 20],
      target: [42, 6, -8],
      preset: { mode: 'pa-pool' },
      body: (
        <>
          <p>
            Woda nad paliwem świeci na niebiesko – to <b>promieniowanie Czerenkowa</b>. Szybkie cząstki z paliwa pędzą w wodzie szybciej, niż porusza się w niej światło, i woda „błyska” jak przy huku naddźwiękowym, tylko światłem.
          </p>
          <p>
            Kilka metrów wody to doskonała osłona: nad basenem promieniowanie jest tak słabe, że ludzie pracują tam na co dzień. Pompy i wymienniki ciepła stale chłodzą wodę, a gdyby przestały, woda zaczęłaby parować dopiero po wielu godzinach – jest czas, żeby ją dolać.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Magazyn suchy i składowanie',
      spot: [(CASKS.x0 + CASKS.x1) / 2, 10, CASKS.z1],
      camera: [230, 60, 170],
      target: [150, 4, 58],
      preset: { mode: 'pa-dry' },
      body: (
        <>
          <p>
            Po kilku latach w basenie paliwo jest już dużo chłodniejsze. Wkłada się je do grubych pojemników ze stali i betonu, które stoją na placu i chłodzi je zwykłe powietrze. To <b>magazyn suchy</b> – na zewnątrz pojemnika można bezpiecznie stanąć.
          </p>
          <p>
            Docelowo wypalone paliwo trafi do <b>składowiska głębokiego</b> – tuneli kilkaset metrów pod ziemią, w stabilnej skale. Pierwsze takie składowisko budują Finowie. Wypalone paliwo można też przerabiać: ok. 95% to wciąż uran, z którego da się zrobić nowe paliwo.
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
  summary: 'Od generatora do linii 400 kV, równa praca przez całą dobę, emisje CO₂ i atom w Polsce',
  steps: [
    nuc({
      title: 'Od generatora do linii',
      camera: GRID_CAM,
      target: GRID_TGT,
      preset: { mode: 'gr-home' },
      body: (
        <>
          <p>
            Prąd z generatora płynie przez transformator blokowy do rozdzielni 400 kV i dalej linią do sieci. Elektrownia jądrowa jest też odbiorcą prądu: gdy reaktor stoi, pompy i urządzenia zasila się z sieci.
          </p>
          <p>Kliknij podpis części. Numery prowadzą do zakładek: praca przez całą dobę i atom w Polsce.</p>
        </>
      ),
    }),
    nuc({
      title: 'Równa praca przez całą dobę',
      spot: [TRAFO[0], 26, TRAFO[2]],
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'gr-load' },
      body: (
        <>
          <p>
            Elektrownia jądrowa najlepiej pracuje z pełną mocą przez całą dobę i cały rok – ok. <b>90% czasu</b>. Daje tzw. moc podstawową: tę, której kraj potrzebuje zawsze, także w nocy. Wiatr i słońce zmieniają się z godziny na godzinę, a atom jest stały (niebieska linia).
          </p>
          <p>
            Reaktor może też zmieniać moc, ale opłaca się to mniej. Paliwo kosztuje tu niewiele, a budowa bardzo dużo, więc każda godzina postoju to strata. Dlatego wahania zapotrzebowania pokrywają raczej elektrownie gazowe, wodne i magazyny energii.
          </p>
        </>
      ),
    }),
    nuc({
      title: 'Atom w Polsce',
      spot: [SHIELD.r, 30, 0],
      camera: HOME_CAM,
      target: HOME_TGT,
      preset: { mode: 'gr-poland' },
      body: (
        <>
          <p>
            Wykres pokazuje, ile CO₂ przypada na kilowatogodzinę prądu w całym cyklu życia elektrowni: z budową, wydobyciem paliwa i rozbiórką. Atom jest tu na równi z wiatrem – dlatego wiele krajów buduje elektrownie jądrowe, żeby zastąpić węgiel.
          </p>
          <p>
            Polska nie ma jeszcze żadnej. Pierwsza elektrownia – trzy bloki AP1000 – powstaje na Pomorzu, w okolicy Lubiatowa i Kopalina, a pierwszy blok ma ruszyć w drugiej połowie lat 30. Planowane są też kolejne elektrownie i małe reaktory modułowe.
          </p>
        </>
      ),
    }),
  ],
};

export const nuclearPlant: Topic = {
  id: 'elektrownia-jadrowa',
  title: 'Elektrownia jądrowa',
  subject: 'energetyka',
  summary: 'Blok z reaktorem AP1000 nad Bałtykiem w 3D: reaktor i reakcja łańcuchowa, obieg pierwotny, bezpieczeństwo i bierne chłodzenie, turbina i woda morska, paliwo i odpady, sieć.',
  accent: '#0284c7',
  glyph: '⚛',
  steps: overview,
  modules: [reactorModule, loopModule, safetyModule, turbineModule, fuelModule, gridModule],
};
