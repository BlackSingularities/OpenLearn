import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PauseContext } from '../../lib/useAnimationClock';
import { useModuleHome, useSceneHidden } from '../../lib/topicNav';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Environment, Html, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { TrailMesh, Trails } from '../../lib/streaks';
import { fmt } from '../../lib/plot';
import { ALONG, CORE_IN, CORE_OUT, PARTS, SPINNER, lerpTable, tempColor } from './engine2d';

/*
 * Wspólny, interaktywny model turbowentylatora 3D.
 * Geometria pochodzi z przekroju 2D (engine2d.tsx, jednostki SVG) – oś silnika to oś X świata.
 * Każdy podzespół jest osobną grupą: można go kliknąć, wyróżnić i odsunąć (widok rozłożony).
 * Wybrany podzespół w widoku rozłożonym rozkłada się dalej – na pojedyncze wieńce łopatek, wtryskiwacze itd.
 */

/*
 * Zewnętrzny kształt 3D wzorowany na silniku dużego samolotu szerokokadłubowego: pękata gondola z najszerszym miejscem
 * w ok. ⅓ długości i zaokrągloną krawędzią wlotu, cienka krawędź spływu dyszy zimnego strumienia,
 * za nią krótka, mocno zbieżna osłona rdzenia i długi, wypukły stożek wylotowy.
 * Jednostki jak w przekroju (engine2d): x – wzdłuż osi, wartości – promień.
 */
type Tab = [number, number][];
/** Krawędź wlotu: środek łuku (x, r) i jego promień. */
const LIP: [number, number, number] = [64, 163, 13];
const NAC3_OUT: Tab = [[64, 176], [78, 183], [100, 189], [150, 193], [220, 194], [300, 190], [380, 181], [450, 168], [520, 152], [570, 140], [600, 131]];
export const NAC3_IN: Tab = [[64, 150], [82, 151], [110, 157], [140, 166], [175, 168], [230, 161], [320, 153], [420, 143], [520, 135], [600, 129]];
/** Osłona rdzenia – pod gondolą walcowa, za nią zbieżna do dyszy gorącego strumienia (x = 765). */
export const COWL3: Tab = [[196, 80], [210, 88], [270, 102], [430, 103], [545, 99], [600, 95], [650, 90], [700, 82], [740, 72], [765, 64]];
/** Ścianka kanału gorącego strumienia przy dyszy (wewnątrz osłony). */
const CORE3_OUT: Tab = [...CORE_OUT.filter(([x]) => x < 690), [690, 76], [740, 68], [765, 61]];
/** Cienka osłona rdzenia (od środka) i zewnętrzna ścianka obudowy przepływu – między nimi przedział rdzenia. */
const COWL_SKIN: Tab = COWL3.map(([x, r]) => [x, r - 1.4]);
export const CASE_OUT: Tab = Array.from({ length: 58 }, (_, i) => {
  const x = 196 + i * 10;
  // obudowa trzyma się co najmniej 3 j. pod osłoną rdzenia – inaczej powierzchnie migoczą (z-fighting)
  return [x, Math.max(lerpTable(CORE3_OUT, x) + 0.8, Math.min(lerpTable(CORE3_OUT, x) + 4, lerpTable(COWL3, x) - 4.5))] as [number, number];
});
/** Stożek wylotowy – wypukły, ostro zakończony, wystaje daleko za dyszę. */
export const PLUG3: Tab = [[690, 40], [740, 44], [765, 46], [800, 44], [840, 37], [880, 26], [915, 12], [945, 0]];

export const S = 1 / 100;
const X0 = 4.4;
export const ax = (x: number) => x * S - X0;
/**
 * Pas kaskad odwracacza (układ modelu silnika, m): od przedniego do tylnego pierścienia i promień zewnętrznego
 * brzegu łopatek – stąd wylatuje strumień wsteczny po odsunięciu osłony.
 */
export const CASCADE_BAND = { x0: ax(366), x1: ax(448), r: (lerpTable(NAC3_OUT, 407) - 4) * S };
const CUT_START = 0.5;
const CUT_LEN = Math.PI * 1.5;

export type PartId = 'wlot' | 'bypass' | 'fan' | 'lpc' | 'hpc' | 'comb' | 'hpt' | 'lpt' | 'nozzle' | 'shafts' | 'ab';
export type SpoolCfg = 'tf2' | 'tf3' | 'jet1' | 'gtf';
export type FlowMode = 'plain' | 'temp' | 'p' | 'v';

const SHAFT_PART = { id: 'shafts', name: 'wały N1 i N2', color: '#7dd3fc', desc: 'Dwa wały, jeden w drugim. Cienki wał niskiego ciśnienia (N1) łączy tylną turbinę z wentylatorem i pierwszą sprężarką, a gruby, pusty w środku wał wysokiego ciśnienia (N2) łączy przednią turbinę ze sprężarką WP. Kręcą się niezależnie, z różną prędkością.' };
const ACC_PART = { id: 'acc', name: 'osprzęt i skrzynka napędów', color: '#cbd5e1', desc: 'Urządzenia napędzane przez silnik przez wałek i skrzynkę kół zębatych: rozrusznik, generator prądu, pompy paliwa, oleju i hydrauliki oraz regulator paliwa. Silnik nie tylko pcha samolot – daje mu też prąd, ciśnienie w instalacji hydraulicznej i sprężone powietrze.' };
const WING_PART = { id: 'wing', name: 'skrzydło (wycinek)', color: '#e2e8f0', desc: 'Kawałek skrzydła nad silnikiem. Jego „kręgosłup” to szczelna skrzynia z dwóch głównych belek, poprzecznych żeber i poszycia – a zarazem zbiornik paliwa. Silnik wisi na pylonie przykręconym do tych belek.' };
const AB_PART = { id: 'ab', name: 'dopalacz', color: '#fb923c', desc: 'Przedłużona rura wylotowa, w której do spalin wtryskuje się dodatkowe paliwo i spala je drugi raz. Daje dużo więcej ciągu, ale zużywa bardzo dużo paliwa – mają go samoloty wojskowe.' };

export function partInfo(id: string) {
  if (id === 'shafts') return SHAFT_PART;
  if (id === 'ab') return AB_PART;
  if (id === 'acc') return ACC_PART;
  if (id === 'wing') return WING_PART;
  return PARTS.find((p) => p.id === id) ?? null;
}

/** Ramiona rozsunięcia w widoku rozłożonym: [przesunięcie wzdłuż osi, w górę]. */
const EXPLODE: Record<string, [number, number, number?]> = {
  wlot: [-3.4, 3.6, -3.2],
  bypass: [0.6, 4.4, -4.2],
  fan: [-1.8, 0],
  lpc: [-1.0, 0],
  hpc: [-0.25, 0],
  comb: [0.55, 0],
  hpt: [1.2, 0],
  lpt: [1.85, 0],
  nozzle: [2.7, 0],
  shafts: [0, 0],
  ab: [3.3, 0],
};

/**
 * Bieżące przesunięcie podzespołów w widoku rozłożonym (j. modelu silnika). Czytają je np. numery zakładek na modelu,
 * żeby jechały razem ze swoją częścią. Pisze tylko model, który jest akurat rozłożony.
 */
export const ENGINE_PART_OFFSET: Record<string, [number, number, number]> = {};
let partOffsetOwner: object | null = null;

/** O ile obudowy rdzenia odjeżdżają w dół w widoku rozłożonym (przy explode = 1). */
const CASING_DROP = 2.6;

/** Zasięg modułów wzdłuż osi (j. przekroju) – do odsuwania sąsiadów rozkładanego modułu. */
const SPAN: Record<string, [number, number]> = { wlot: [64, 140], fan: [140, 196], lpc: [196, 275], hpc: [275, 445], comb: [445, 545], hpt: [545, 590], lpt: [590, 690], nozzle: [690, 945], ab: [740, 1100] };

/** Zakresy podzespołów w jednostkach przekroju (do rozkładania wieńców wokół środka modułu). */
const RANGE: Record<string, [number, number]> = { lpc: [196, 275], hpc: [275, 445], hpt: [545, 590], lpt: [590, 690] };

export const SPOOL_COLOR = { lp: '#38bdf8', ip: '#4ade80', hp: '#f87171', fan: '#7dd3fc', st: '#94a3b8' };

/* ---------------- opisy elementów (drugi poziom rozkładu) ---------------- */

const SUB_INFO: Record<string, { name: string; desc: string }> = {
  'wlot:lip': { name: 'krawędź wlotu', desc: 'Grube, zaokrąglone brzegi wlotu. Dzięki nim powietrze gładko wpływa do silnika nawet przy bocznym wietrze albo gdy samolot leci z nosem wysoko. W chmurach podgrzewa je gorące powietrze z silnika, żeby nie osadzał się lód.' },
  'bypass:fixed': { name: 'gondola – część stała', desc: 'Zewnętrzna osłona kanału z chłodnym powietrzem. Od środka ma panele w kształcie plastra miodu, które pochłaniają hałas.' },
  'bypass:sleeve': { name: 'przesuwna osłona rewersu', desc: 'Tylna część osłony silnika. Gdy pilot włącza odwracacz ciągu, siłowniki przesuwają ją do tyłu i odsłaniają kratki.' },
  'bypass:cascade': { name: 'kaskady rewersu', desc: 'Kratki z wygiętych łopatek, schowane w osłonie silnika. Gdy osłona się odsunie, kierują chłodne powietrze skośnie do przodu – i silnik hamuje samolot.' },
  'bypass:pylon': { name: 'pylon', desc: 'Pylon silnika: wąski przód na grzbiecie gondoli wznosi się aż do krawędzi natarcia i chowa w spodzie skrzydła, a tylna owiewka schodzi nisko nad dyszę rdzenia – jej dolny klin z żaroodpornego stopu chroni pylon i skrzydło przed gorącymi spalinami. Silnik wisi na dwóch mocowaniach – przednim na ramie wentylatora i tylnym na tylnej ramie turbiny – a ciąg przenoszą dwa skośne cięgła. Dolna, tylna owiewka nad gorącym strumieniem ma tytanową osłonę termiczną. Pylon przenosi ciąg i ciężar silnika, a w środku prowadzi przewody paliwa, powietrza upustowego, hydrauliki i elektryki. Mocowania są zaprojektowane tak, by w razie awarii silnik odpadł, nie rozrywając skrzydła.' },
  'bypass:door': { name: 'drzwi rewersu / blokujące', desc: 'Klapy, które zamykają kanał z chłodnym powietrzem, żeby zamiast do tyłu trafiło ono do kratek odwracacza (albo na zewnątrz).' },
  'bypass:link': { name: 'cięgło drzwi blokujących', desc: 'Pręt łączący klapę z osłoną środka silnika. Gdy tylna część osłony odsuwa się do tyłu, pręt ustawia klapę w poprzek kanału.' },
  'bypass:actuator': { name: 'siłownik drzwi', desc: 'Siłownik hydrauliczny w nieruchomej części osłony. Wypycha przednią krawędź klapy na zewnątrz i obraca ją wokół osi.' },
  'wlot:liner': { name: 'okładziny wlotu i obudowy wentylatora', desc: 'Przed wentylatorem ścianki wlotu pokrywają panele w kształcie plastra miodu, które tłumią hałas. Nad końcami łopat jest miękki pas – łopaty mogą go lekko zetrzeć, więc szczelina między nimi a obudową jest minimalna. Za nim jest pancerz z kevlaru, który zatrzyma urwaną łopatę.' },
  'fan:blades': { name: 'łopaty wentylatora', desc: 'Szerokie łopaty z kompozytu węglowego (w tym silniku – 18 sztuk). Przednie krawędzie mają tytanowe okucie, które chroni je przed piaskiem, gradem i ptakami. Mocno wygięty kształt zmniejsza hałas. Końce łopat pędzą niemal z prędkością dźwięku – stąd charakterystyczne „piłowanie” przy starcie.' },
  'fan:spinner': { name: 'kołpak', desc: 'Stożek na środku wentylatora. Narysowana na nim spirala pozwala obsłudze od razu zobaczyć, czy wentylator się obraca. Jego kształt pomaga też kruszyć lód.' },
  'fan:ogv': { name: 'kierownice wylotowe wentylatora (OGV)', desc: 'Nieruchome łopatki tuż za wentylatorem. Prostują zakręcony przez wentylator strumień, dzięki czemu powietrze wylatuje prosto do tyłu i daje więcej ciągu. Często podtrzymują też osłonę silnika.' },
  'fan:gear': { name: 'przekładnia planetarna', desc: 'Zestaw kół zębatych (przekładnia planetarna) między wentylatorem a wałem. Zmniejsza obroty ok. trzy razy: wielki wentylator kręci się wolno, a turbina, która go napędza – szybko, tak jak lubi.' },
  'comb:liner': { name: 'płomieniówka', desc: 'Pierścieniowa rura z blachy z tysiącami małych otworów – w środku płonie paliwo. Przez otwory wpływa dodatkowe powietrze: część studzi spaliny, a część tworzy przy ściankach chłodną warstwę, która chroni blachę.' },
  'comb:inj': { name: 'wtryskiwacze paliwa', desc: 'Kilkanaście do dwudziestu kilku dysz rozmieszczonych dookoła komory spalania. Każda rozpyla paliwo na drobną mgiełkę, która łatwo się zapala.' },
  'comb:diffuser': { name: 'dyfuzor i kierownice wylotowe sprężarki', desc: 'Nieruchome łopatki prostują strumień ze sprężarki, a rozszerzający się kanał spowalnia powietrze z ok. 120 do ok. 50 m/s. Przy większej prędkości płomień zostałby zdmuchnięty.' },
  'comb:dome': { name: 'osłony i ściana czołowa z zawirowywaczami', desc: 'Łukowe osłony dzielą strumień powietrza: część wpada przez zawirowywacze w przedniej ścianie komory, reszta opływa ją z zewnątrz. Zawirowywacz zakręca powietrze wokół wtryskiwacza w wir – gorące spaliny krążą w nim i przez cały czas zapalają świeże paliwo.' },
  'hpc:vsv': { name: 'kierownice przestawne (VSV)', desc: 'Pierwsze rzędy nieruchomych łopatek sprężarki WP mogą się obracać. Przy małych obrotach silnika przymykają się i ustawiają strumień tak, żeby łopatki wirników nie trafiały w powietrze pod zbyt dużym kątem – inaczej przepływ by się zerwał. Wszystkie łopatki w rzędzie obraca naraz pierścień, a pierścienie – siłownik sterowany przez komputer silnika.' },
  'hpc:bleed': { name: 'kolektory upustu powietrza', desc: 'Pierścieniowe kanały wokół sprężarki zbierają część sprężonego powietrza. Silnik oddaje je samolotowi: do klimatyzacji i utrzymania ciśnienia w kabinie, do ogrzewania skrzydeł przed lodem i do uruchamiania drugiego silnika. Część chłodzi też turbinę.' },
  'lpc:vbv': { name: 'zawory upustowe (VBV)', desc: 'Klapki w ściance kanału za sprężarką NP. Przy małych obrotach sprężarka NP tłoczy więcej powietrza, niż zmieści sprężarka WP – nadmiar wypuszcza się do kanału z chłodnym powietrzem, bo inaczej przepływ mógłby się gwałtownie cofnąć (pompaż). Przy dużych obrotach są zamknięte.' },
  'shafts:bearing': { name: 'łożysko wału', desc: 'Wały obracają się w pięciu łożyskach. Łożyska kulkowe przejmują siłę wzdłuż osi – m.in. ciąg wentylatora – a wałeczkowe trzymają wał tylko na boki i pozwalają mu się wydłużać, gdy się nagrzeje. Łożyska są w szczelnych komorach, do których pompa tłoczy olej.' },
  'shafts:support': { name: 'podpora łożyska', desc: 'Stożkowa podpora przenosi siły z łożyska na ramę silnika, a stamtąd – przez mocowania – na skrzydło.' },
  'lpt:trf': { name: 'tylna rama turbiny', desc: 'Opływowe wsporniki za ostatnią turbiną. Trzymają tylne łożysko wału i tylne mocowanie silnika, a przy okazji prostują zakręcony strumień spalin przed wylotem.' },
  'lpt:acc': { name: 'aktywna regulacja luzów (ACC)', desc: 'Rury z otworkami owinięte wokół obudowy turbin. W przelocie komputer silnika kieruje na nie chłodne powietrze z wentylatora. Obudowa się kurczy, szczelina nad łopatkami maleje i mniej gazów ucieka bokiem. Daje to ok. 1% oszczędności paliwa.' },
  'hpt:acc': { name: 'aktywna regulacja luzów turbiny WP', desc: 'Chłodzenie obudowy turbiny WP w przelocie: obudowa lekko się kurczy, więc nad łopatkami zostaje mniejsza szczelina i mniej gazów ucieka bokiem.' },
  'acc:shaft': { name: 'wał promieniowy i skrzynka pośrednia', desc: 'Koło zębate na wale WP kręci wałek, który biegnie na zewnątrz, w poprzek kanału powietrza. Mała skrzynka zmienia kierunek napędu o 90° i przekazuje go do skrzynki napędów. Przy rozruchu działa to w drugą stronę – rozrusznik kręci przez wałek środkiem silnika.' },
  'acc:agb': { name: 'skrzynka napędów (AGB)', desc: 'Łukowa obudowa z rzędem kół zębatych (tu półprzezroczysta). Każde koło kręci się z inną prędkością, dopasowaną do urządzenia, które napędza: generatora, pomp czy rozrusznika.' },
  'acc:starter': { name: 'rozrusznik pneumatyczny (ATS)', desc: 'Mała turbinka kręcona sprężonym powietrzem z APU, z drugiego silnika albo z wózka na lotnisku. Przy rozruchu obraca skrzynkę napędów, a przez nią środek silnika. Gdy silnik ruszy, sprzęgło odłącza rozrusznik.' },
  'acc:duct': { name: 'przewód powietrza rozruchowego', desc: 'Rura doprowadzająca sprężone powietrze z pylonu do rozrusznika. W locie tą samą instalacją płynie w drugą stronę powietrze z silnika do samolotu – np. do klimatyzacji.' },
  'acc:sav': { name: 'zawór rozrusznika (SAV)', desc: 'Zawór, który otwiera dopływ powietrza do rozrusznika na początku rozruchu i zamyka go, gdy silnik rozpędzi się do ok. połowy obrotów.' },
  'acc:hyd': { name: 'pompa hydrauliczna (EDP)', desc: 'Pompa napędzana przez silnik. Wytwarza wysokie ciśnienie w płynie hydraulicznym (ok. 350 barów), który porusza sterami, klapami, podwoziem i hamulcami.' },
  'acc:pma': { name: 'prądnica sterownika (PMA)', desc: 'Mała prądnica z magnesami. Gdy silnik pracuje, zasila jego komputer – niezależnie od instalacji elektrycznej samolotu, żeby silnik działał nawet przy awarii prądu.' },
  'acc:idg': { name: 'generator (IDG)', desc: 'Generator – główne źródło prądu w samolocie. Obroty silnika się zmieniają, a prąd musi mieć stałe parametry, więc generator ma własną przekładnię (albo elektronikę), która to wyrównuje. Chłodzi go olej.' },
  'acc:lube': { name: 'pompa olejowa', desc: 'Pompa oleju. Jedna część tłoczy olej do łożysk i kół zębatych, a kilka innych odsysa go z powrotem do zbiornika. W korku spustowym jest magnes, który łapie metalowe opiłki – ich obecność zdradza zużywające się łożysko na długo przed awarią.' },
  'acc:tank': { name: 'zbiornik oleju', desc: 'Zbiornik na ok. 20–30 litrów oleju. Przez okienko mechanik od razu widzi jego poziom – sprawdza go zaraz po wyłączeniu silnika, zanim olej spłynie z łożysk. Ilość, ciśnienie i temperaturę oleju piloci widzą też na ekranie ECAM. Silnik zużywa zwykle tylko ok. 0,1–0,3 litra oleju na godzinę.' },
  'acc:ofilter': { name: 'filtr oleju', desc: 'Wyłapuje zanieczyszczenia, zanim olej trafi do łożysk. Gdy filtr się zapycha, wyskakuje czerwony wskaźnik, a piloci dostają ostrzeżenie na ekranie. Wtedy zawór przepuszcza olej obok filtra – lepszy brudny olej niż żaden.' },
  'acc:fcoc': { name: 'wymiennik ciepła paliwo–olej (FCOC)', desc: 'Wymiennik ciepła: gorący olej z łożysk oddaje ciepło zimnemu paliwu, które i tak płynie do spalania. Olej się chłodzi, a paliwo ogrzewa – dzięki temu kryształki lodu w paliwie nie zatkają filtra, a ciepło się nie marnuje.' },
  'acc:ffilter': { name: 'filtr paliwa', desc: 'Filtr paliwa. Tak jak filtr oleju ma wskaźnik zapchania (piloci dostają ostrzeżenie na ekranie ECAM) i zawór, który w razie potrzeby przepuszcza paliwo obok filtra.' },
  'acc:eec': { name: 'sterownik silnika (EEC / FADEC)', desc: 'Komputer silnika (FADEC) – to on naprawdę steruje silnikiem. Pilot przesuwa dźwignię ciągu, a komputer odczytuje obroty, temperatury i ciśnienia i dawkuje tyle paliwa, ile trzeba. Steruje też rozruchem, zapłonem, odwracaczem ciągu i ruchomymi łopatkami sprężarki. Ma dwa niezależne „mózgi”, które się nawzajem sprawdzają. Siedzi na obudowie wentylatora, gdzie jest chłodniej i mniej trzęsie.' },
  'acc:harness': { name: 'wiązki elektryczne', desc: 'Wiązki przewodów łączą komputer silnika z czujnikami i urządzeniami. Każdy z dwóch „mózgów” komputera ma własne, osobno poprowadzone przewody, więc jedno uszkodzenie nie odetnie obu. Obejmy trzymają wiązki tak, żeby drgania silnika ich nie przecierały.' },
  'acc:boost': { name: 'pompy paliwa w zbiorniku skrzydła', desc: 'Dwie elektryczne pompy (główna i zapasowa) w zbiorniku w skrzydle. Tłoczą paliwo do silnika pod niewielkim ciśnieniem, żeby pompa w silniku nie zasysała pęcherzyków. Gdy obie stoją, silnik może jeszcze sam zasysać paliwo – ale tylko na mniejszej wysokości.' },
  'acc:lpvalve': { name: 'zawór odcinający LP', desc: 'Zawór w skrzydle, przy pylonie. Odcina paliwo do silnika, gdy pilot wyłączy silnik albo wciśnie przycisk gaśniczy przy pożarze. Przepływ paliwa na ekranie spada wtedy do zera. Tu: zielony – otwarty, czerwony – zamknięty.' },
  'acc:feed': { name: 'przewód paliwa w pylonie', desc: 'Rura prowadząca paliwo ze skrzydła przez pylon na silnik. Tam paliwo przechodzi przez pompę, wymiennik ciepła i filtr do regulatora, a dalej przez przepływomierz – jego wskazanie (FF) piloci widzą na ekranie – do wtryskiwaczy. Tempo kropek odpowiada temu przepływowi. Rury w skrzydle i pylonie są pokazane jak na prześwietleniu.' },
  'acc:oil': { name: 'przewody oleju', desc: 'Zamknięty obieg oleju: ze zbiornika przez pompę i filtr do łożysk, które olej smaruje i chłodzi, a potem z powrotem przez wymiennik ciepła do zbiornika.' },
  'acc:hmu': { name: 'pompa paliwa i regulator (HMU)', desc: 'Pompa podnosi ciśnienie paliwa, a regulator odmierza je dokładnie tak, jak każe komputer silnika. Ten sam zespół porusza też ruchomymi łopatkami i zaworami sprężarki.' },
  'acc:exciter': { name: 'wzbudnica zapłonu', desc: 'Zamienia prąd z samolotu na impulsy o napięciu kilkunastu tysięcy woltów dla dwóch świec zapłonowych – jak cewka zapłonowa w samochodzie.' },
  'wing:skin': { name: 'poszycie skrzydła', desc: 'Górna i dolna „skóra” skrzydła. W locie skrzydło wygina się w górę, więc górne poszycie jest ściskane, a dolne rozciągane. Tu górne poszycie częściowo zdjęto, żeby było widać wnętrze. Na dole widać właz do zbiornika.' },
  'wing:spar': { name: 'dźwigary', desc: 'Dwie główne belki biegnące wzdłuż skrzydła – przednia i tylna. To one dźwigają ciężar samolotu. Do nich przykręcony jest pylon silnika.' },
  'wing:rib': { name: 'żebra', desc: 'Poprzeczne ścianki w kształcie przekroju skrzydła, co kilkadziesiąt centymetrów. Nadają skrzydłu kształt i usztywniają poszycie. Otwory w nich zmniejszają masę i pozwalają paliwu przepływać, ale nie pozwalają mu gwałtownie chlupotać.' },
  'wing:stringer': { name: 'podłużnice', desc: 'Długie, wąskie listwy od środka poszycia. Nie pozwalają cienkiej „skórze” pofałdować się, gdy jest ściskana.' },
  'wing:tank': { name: 'integralny zbiornik paliwa', desc: 'Wnętrze skrzydła między belkami, żebrami i poszyciem jest uszczelnione i wypełnione paliwem – skrzydło samo jest zbiornikiem. Paliwo w skrzydle je odciąża, bo jego ciężar ciągnie w dół, a siła nośna – w górę.' },
  'wing:slat': { name: 'slot (skrzela)', desc: 'Ruchoma przednia krawędź skrzydła. Przy starcie i lądowaniu wysuwa się do przodu i w dół. Skrzydło staje się bardziej wygięte i może nieść samolot przy mniejszej prędkości.' },
  'wing:flap': { name: 'klapa', desc: 'Ruchoma część tylnej krawędzi skrzydła. Wysunięta do tyłu i w dół powiększa skrzydło i bardziej je wygina – dzięki temu samolot może lecieć wolniej przy starcie i lądowaniu.' },
  'wing:mount': { name: 'mocowanie pylonu do skrzydła', desc: 'Pylon wisi pod skrzydłem na okuciach przykręconych do jego głównych belek. Łączą je sworznie, które celowo są nieco słabsze: przy ogromnym przeciążeniu – np. gdy silnik uderzy o ziemię – pękają i silnik odpada, zamiast rozerwać skrzydło ze zbiornikiem paliwa.' },
  'bypass:bifi': { name: 'rozwidlenia kanału obejściowego', desc: 'Dwie opływowe przegrody w kanale z chłodnym powietrzem – u góry i u dołu. Górna osłania mocowanie silnika do pylonu i przewody (paliwo, powietrze, hydraulika, prąd), dolna – przewody olejowe. Mają taki kształt, żeby jak najmniej przeszkadzały w przepływie.' },
  'wing:root': { name: 'żebro przykadłubowe', desc: 'Tu wycinek się kończy – przy kadłubie. Mocne żebro i okucia łączą skrzydło ze środkową częścią skrzydła w kadłubie. Przechodzą przez nie wszystkie siły, którymi skrzydło dźwiga samolot.' },
  'wing:spoiler': { name: 'spojlery (przerywacze)', desc: 'Płyty na górze skrzydła, przed klapami. Podniesione psują przepływ i zmniejszają siłę nośną. W locie pomagają przechylać samolot i go hamują, a po przyziemieniu podnoszą się wszystkie naraz – samolot mocno dociska koła do pasa, więc hamulce działają skuteczniej.' },
  'wing:fuselage': { name: 'kadłub (wycinek)', desc: 'Kadłub ma ok. 6 m średnicy i jest zbudowany jak skorupa jajka: cienkie poszycie z kompozytu węglowego usztywniają poprzeczne pierścienie (co ok. 60 cm) i podłużne listwy. Taka konstrukcja wytrzymuje ciśnienie kabiny, zginanie i skręcanie. Tu wycinek ma poszarpane brzegi, a od strony skrzydła poszycie zdjęto, żeby zajrzeć do środka.' },
  'wing:cabin': { name: 'kabina pasażerska', desc: 'Podłoga leży na poprzecznych belkach. W klasie ekonomicznej fotele stoją po trzy, z dwoma przejściami, a nad nimi wiszą schowki na bagaż. Ścianę kabiny oddziela od poszycia warstwa izolacji.' },
  'wing:cargo': { name: 'luk bagażowy', desc: 'Dolna część kadłuba, pod podłogą kabiny. Bagaż i ładunek jadą w kontenerach, po dwa obok siebie. Ładownie są przed środkową częścią skrzydła i za wnęką podwozia – pośrodku miejsce zajmuje skrzydło.' },
  'wing:centre': { name: 'centropłat', desc: 'Środkowa skrzynia skrzydła przechodzi w poprzek kadłuba pod podłogą kabiny i łączy oba skrzydła w jedną belkę. Przenosi wszystkie siły, którymi skrzydła dźwigają samolot. W środku jest też zbiornik paliwa.' },
  'wing:canoe': { name: 'owiewki prowadnic klap', desc: 'Opływowe osłony pod tylną krawędzią skrzydła, nazywane „kajakami”. Kryją szyny i siłowniki, po których klapy wysuwają się do tyłu i w dół.' },
  'wing:pump': { name: 'pompa i przewód paliwa', desc: 'Pompy na dnie zbiornika tłoczą paliwo rurą przez pylon do silnika. Tam pompa i regulator podnoszą ciśnienie paliwa i odmierzają je do wtryskiwaczy.' },
  'comb:ign': { name: 'świece zapłonowe', desc: 'Zwykle dwie świece – jak w samochodzie, tylko o dużo silniejszej iskrze. Pracują przy uruchamianiu silnika i wtedy, gdy płomień mógłby zgasnąć: w ulewie, oblodzeniu albo silnych turbulencjach.' },
  'nozzle:plug': { name: 'stożek wylotowy', desc: 'Stożek na końcu środka silnika. Razem z osłoną tworzy zwężający się wylot gorących spalin.' },
  'nozzle:cowl': { name: 'dysza gorącego strumienia', desc: 'Tylna krawędź osłony środka silnika. Tu gazy przyspieszają i wylatują do tyłu.' },
  'nozzle:bucket': { name: 'czasze rewersu (klapowego)', desc: 'Dwie połówki „muszli” za wylotem silnika (inny typ odwracacza ciągu). Po zamknięciu odbijają cały strumień skośnie do przodu.' },
  'shafts:lp': { name: 'wał NP (N1)', desc: 'Cienki, długi wał biegnący przez cały silnik, wewnątrz drugiego wału. Tylna turbina napędza nim wentylator z przodu.' },
  'shafts:hp': { name: 'wał WP (N2)', desc: 'Krótki, pusty w środku wał łączący przednią turbinę ze sprężarką wysokiego ciśnienia. Kręci się najszybciej. Od niego napędzana jest skrzynka z osprzętem i to nim kręci rozrusznik przy uruchamianiu.' },
  'ab:pipe': { name: 'kadłub dopalacza', desc: 'Zewnętrzna rura za turbiną. Między nią a osłoną w środku płynie chłodne powietrze – bez tego metal stopiłby się od płomienia o temperaturze ok. 2000 °C.' },
  'ab:liner': { name: 'osłona termiczna (liner)', desc: 'Cienka, dziurkowana i pofalowana blacha wewnątrz dopalacza. Przez tysiące otworków wypływa chłodzące powietrze, a fale pozwalają blasze swobodnie się rozszerzać od żaru.' },
  'ab:mixer': { name: 'mieszalnik', desc: 'Płatki na końcu osłony środka silnika przeplatają gorące spaliny z chłodnym powietrzem z kanału obejściowego. Do dopalacza trafia jeden wymieszany strumień z dużą ilością tlenu.' },
  'ab:outer': { name: 'klapy zewnętrzne i siłowniki dyszy', desc: 'Zewnętrzne klapy zakrywają mechanizm dyszy. Siłowniki przestawiają wszystkie płatki dyszy naraz.' },
  'bypass:casing': { name: 'kadłub silnika / kanał obejściowy', desc: 'W myśliwcu silnik jest schowany w kadłubie, więc nie ma osobnej osłony ani pylonu – tylko smukła obudowa. Pod nią biegnie wąski kanał z chłodnym powietrzem: omija środek silnika najwyżej połowa tego, co przez niego przechodzi.' },
  'ab:spray': { name: 'kolektory wtrysku', desc: 'Pierścienie z dyszami, które wtryskują paliwo do gorących spalin.' },
  'ab:holder': { name: 'stabilizatory płomienia', desc: 'Pierścienie o przekroju litery V. Tuż za nimi powietrze zwalnia i wiruje – tam płomień nie zostaje zdmuchnięty przez szybki strumień.' },
  'ab:petals': { name: 'dysza zbieżno-rozbieżna', desc: 'Ruchome płatki dyszy. Najpierw zwężają strumień – w najwęższym miejscu osiąga on prędkość dźwięku – a potem go rozszerzają, co rozpędza gazy powyżej prędkości dźwięku. Przy dopalaczu najwęższe miejsce musi się otworzyć, bo gorętsze gazy zajmują więcej miejsca.' },
};
/** Podpisy osprzętu w zakładce „Osprzęt silnika” – urządzenia, o których mówi jej tekst (bez elementów rozruchu). */
const ACC_TAB = ['starter', 'hyd', 'pma', 'agb', 'shaft', 'idg', 'lube', 'ofilter', 'tank', 'oil', 'hmu', 'ffilter', 'fcoc', 'eec', 'harness'];


const ROW_KIND: Record<string, string> = {
  lpc: 'sprężarki NP',
  hpc: 'sprężarki WP',
  hpt: 'turbiny WP',
  lpt: 'turbiny NP',
};

export interface RowSpec {
  part: 'lpc' | 'hpc' | 'hpt' | 'lpt';
  x: number;
  rotor: boolean;
  stage: number;
  spool: 'lp' | 'ip' | 'hp' | 'st';
}

export function buildRows(hpcStages = 9, cfg: SpoolCfg = 'tf2'): RowSpec[] {
  const rows: RowSpec[] = [];
  const add = (part: RowSpec['part'], x0: number, x1: number, n: number, spool: (stage: number) => RowSpec['spool']) => {
    for (let i = 0; i < n * 2; i++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / (n * 2);
      const turbine = part === 'hpt' || part === 'lpt';
      // w sprężarce najpierw wirnik, potem kierownica; w turbinie odwrotnie (dysza → wirnik)
      const rotor = turbine ? i % 2 === 1 : i % 2 === 0;
      const stage = Math.floor(i / 2) + 1;
      rows.push({ part, x, rotor, stage, spool: rotor ? spool(stage) : 'st' });
    }
  };
  const one = cfg === 'jet1';
  add('lpc', 205, 265, 3, () => (one ? 'hp' : cfg === 'tf3' ? 'ip' : 'lp'));
  add('hpc', 282, 438, hpcStages, () => 'hp');
  add('hpt', 550, 584, 1, () => 'hp');
  add('lpt', 596, 684, 4, (s) => (one ? 'hp' : cfg === 'tf3' && s === 1 ? 'ip' : 'lp'));
  return rows;
}

/** Opis wybranego elementu (do ramki informacyjnej sceny). */
export function SelectionInfo({ id, rows }: { id: string; rows: RowSpec[] }) {
  const [partId, sub] = id.split(':');
  const p = partInfo(partId);
  if (!p) return null;
  let subNode: ReactNode = null;
  if (sub?.startsWith('r')) {
    const r = rows[Number(sub.slice(1))];
    if (r) {
      const pr = lerpTable(ALONG.p, r.x);
      const T = lerpTable(ALONG.T, r.x);
      const turbine = r.part === 'hpt' || r.part === 'lpt';
      subNode = (
        <>
          <div style={{ fontWeight: 700 }}>
            {r.rotor ? 'wirnik' : turbine ? 'dysza (kierownica)' : 'kierownica'} {r.stage}. stopnia {ROW_KIND[r.part]}
          </div>
          <div>
            {r.rotor
              ? turbine
                ? 'Łopatki osadzone na tarczy odbierają energię gorących gazów i obracają wał.'
                : 'Łopatki obracają się z wałem i dodają powietrzu energię – rośnie ciśnienie i temperatura.'
              : turbine
                ? 'Nieruchome łopatki przyspieszają i skręcają gazy tak, by trafiały w wirnik pod właściwym kątem.'
                : 'Nieruchome łopatki prostują strumień po wirniku i zamieniają jego prędkość na ciśnienie.'}
          </div>
          <div style={{ opacity: 0.8 }}>
            w tym miejscu: ok. {fmt(pr, pr < 10 ? 1 : 0)} bar, {fmt(T, 0)} °C (start, poziom morza)
          </div>
        </>
      );
    }
  } else if (sub && SUB_INFO[id]) {
    subNode = (
      <>
        <div style={{ fontWeight: 700 }}>{SUB_INFO[id].name}</div>
        <div>{SUB_INFO[id].desc}</div>
      </>
    );
  }
  return (
    <>
      <div style={{ color: p.color, fontWeight: 700 }}>{p.name}</div>
      {subNode ?? <div>{p.desc}</div>}
      {subNode && <div style={{ opacity: 0.65 }}>{p.desc}</div>}
    </>
  );
}

/* ---------------- narzędzia ---------------- */

/** Płynnie dąży do wartości docelowych (jedno odświeżenie Reacta na klatkę tylko w trakcie ruchu). */
function useSmoothRecord(targets: Record<string, number>, rate = 3.5) {
  const cur = useRef<Record<string, number>>({ ...targets });
  const [, tick] = useState(0);
  useFrame((_, dt) => {
    let moving = false;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * rate);
    for (const key of Object.keys(targets)) {
      const c = cur.current[key] ?? targets[key];
      const d = targets[key] - c;
      if (Math.abs(d) > 1e-3) {
        cur.current[key] = c + d * k;
        moving = true;
      } else cur.current[key] = targets[key];
    }
    if (moving) tick((n) => (n + 1) % 1e6);
  });
  return cur.current;
}

interface Look {
  opacity: number;
  glow: number;
}

/**
 * Materiały „jak prawdziwe” (PBR). Kolor może być nazwą presetu albo kolorem CSS.
 * Metale dostają odbicia z otoczenia (Environment z Lightformerami w EngineModel).
 */
const PRESETS: Record<string, { color: string; metal: number; rough: number; clearcoat?: number }> = {
  paint: { color: '#e9ecef', metal: 0.05, rough: 0.3, clearcoat: 0.7 }, // lakierowana gondola
  paintGrey: { color: '#7d8590', metal: 0.15, rough: 0.42, clearcoat: 0.3 }, // osłona rdzenia
  lip: { color: '#d6dadf', metal: 1, rough: 0.18 }, // polerowane aluminium krawędzi wlotu
  liner: { color: '#3a3f46', metal: 0.2, rough: 0.85 }, // panele dźwiękochłonne, wnętrze
  carbon: { color: '#1f242b', metal: 0.25, rough: 0.28, clearcoat: 1 }, // kompozyt węglowy łopat wentylatora
  titanium: { color: '#b4bcc5', metal: 1, rough: 0.26 },
  steel: { color: '#9aa2ac', metal: 1, rough: 0.34 },
  darkSteel: { color: '#5a626c', metal: 1, rough: 0.45 },
  polished: { color: '#e6e8eb', metal: 1, rough: 0.1 },
  nickel: { color: '#8f8577', metal: 1, rough: 0.38 }, // superstop niklu (turbina)
  tbc: { color: '#b9a98f', metal: 0.35, rough: 0.55 }, // powłoka ceramiczna łopat turbiny WP
  heat: { color: '#7d5f48', metal: 0.85, rough: 0.48 }, // blacha przebarwiona temperaturą
  stator: { color: '#7c8590', metal: 0.95, rough: 0.4 },
  spinner: { color: '#23272d', metal: 0.6, rough: 0.22, clearcoat: 1 },
  yellow: { color: '#e0b43a', metal: 0.6, rough: 0.35 },
  red: { color: '#c2413a', metal: 0.3, rough: 0.45, clearcoat: 0.3 },
  primer: { color: '#9cb87e', metal: 0.25, rough: 0.6 }, // zielonkawy podkład antykorozyjny wnętrza skrzydła
  paintPanel: { color: '#dadee3', metal: 0.05, rough: 0.36, clearcoat: 0.5 }, // ruchome powierzchnie skrzydła (o ton ciemniejsze)
  cove: { color: '#4b535c', metal: 0.3, rough: 0.75 }, // wnęki klap i slotów – ciemne w szczelinach
};

function Mat({ color, look, metal = 0.6, rough = 0.35, emissive, emissiveIntensity = 0, side = THREE.FrontSide, vertexColors = false }: { color: string; look: Look; metal?: number; rough?: number; emissive?: string; emissiveIntensity?: number; side?: THREE.Side; vertexColors?: boolean }) {
  const ghost = look.opacity < 0.99;
  const p = PRESETS[color];
  return (
    <meshPhysicalMaterial
      color={p ? p.color : color}
      metalness={p ? p.metal : metal}
      roughness={p ? p.rough : rough}
      clearcoat={p?.clearcoat ?? 0}
      clearcoatRoughness={0.25}
      envMapIntensity={1.1}
      vertexColors={vertexColors}
      side={side}
      transparent={ghost}
      opacity={look.opacity}
      depthWrite={!ghost}
      emissive={look.glow > 0 ? '#ffffff' : (emissive ?? '#000000')}
      emissiveIntensity={look.glow > 0 ? look.glow * 0.35 : emissiveIntensity}
    />
  );
}

type ClickProps = { onClick?: (e: ThreeEvent<MouseEvent>) => void; onPointerOver?: (e: ThreeEvent<PointerEvent>) => void; onPointerOut?: () => void };

function Shell({ outer, inner, x0, x1, color, cut, look, metal = 0.6, emissive, emissiveIntensity, ev, lip }: { outer: [number, number][]; inner?: [number, number][]; x0: number; x1: number; color: string; cut: boolean; look: Look; metal?: number; emissive?: string; emissiveIntensity?: number; ev?: ClickProps; lip?: [number, number, number] }) {
  // gęstsza siatka obrotowa = gładsze odbicia na metalu
  const geo = useMemo(() => {
    const n = 40;
    const pts: THREE.Vector2[] = [];
    // zaokrąglona krawędź natarcia (łuk od ścianki wewnętrznej do zewnętrznej)
    if (lip)
      for (let i = 0; i <= 16; i++) {
        const f = Math.PI * (1 - i / 16);
        pts.push(new THREE.Vector2((lip[1] + lip[2] * Math.cos(f)) * S, (lip[0] - lip[2] * Math.sin(f)) * S));
      }
    for (let i = lip ? 1 : 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      pts.push(new THREE.Vector2(lerpTable(outer, x) * S, x * S));
    }
    if (inner)
      for (let i = n; i >= 0; i--) {
        const x = x0 + ((x1 - x0) * i) / n;
        pts.push(new THREE.Vector2(Math.max(0.001, lerpTable(inner, x) * S), x * S));
      }
    if (inner) pts.push(pts[0].clone());
    return new THREE.LatheGeometry(pts, 96, cut ? CUT_START : 0, cut ? CUT_LEN : Math.PI * 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outer, inner, x0, x1, cut, lip?.[0]]);
  useEffect(() => () => geo.dispose(), [geo]);
  // lathe w osi Y (x·S), obrót −90° wokół Z zamienia oś Y na oś X świata; przesunięcie −X0 robi grupa
  return (
    <group position={[-X0, 0, 0]}>
      <group rotation={[0, 0, -Math.PI / 2]}>
        <mesh geometry={geo} {...ev}>
          <Mat color={color} look={look} metal={metal} emissive={emissive} emissiveIntensity={emissiveIntensity} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Rozmycie ruchu: gdy wieniec obraca się szybciej, niż oko (i ekran 60 Hz) jest w stanie śledzić
 * pojedyncze łopatki, łopatki bledną, a w ich miejscu pojawia się półprzezroczysty dysk – jak na filmie
 * z prawdziwego silnika. 0 – łopatki ostre, 1 – pełne rozmycie.
 */
function motionBlur(w: number, n: number) {
  const cap = ((Math.PI * 2) / n) * 0.3 * 60; // ok. ⅓ podziałki na klatkę
  return Math.max(0, Math.min(1, (Math.abs(w) - cap) / (cap * 2.5)));
}

/**
 * Geometria jednej łopatki: profil wygięty (linia szkieletowa + grubość) ułożony wzdłuż promienia,
 * ze zmiennym kątem ustawienia (skręcenie od nasady do końca), zmienną cięciwą i odgięciem końcówki (sweep).
 * Układ: x – oś silnika, y – promień (od rIn do rOut), z – kierunek obwodowy.
 */
function bladeGeometry(rIn: number, rOut: number, cRoot: number, cTip: number, stRoot: number, stTip: number, camber: number, thick: number, sweep: number) {
  const M = 7; // przekroje wzdłuż promienia
  const N = 9; // punkty wzdłuż cięciwy
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= M; j++) {
    const u = j / M;
    const r = rIn + (rOut - rIn) * u;
    const c = cRoot + (cTip - cRoot) * u;
    const st = stRoot + (stTip - stRoot) * u;
    const sw = sweep * u * u * c;
    for (let side = 0; side < 2; side++)
      for (let i = 0; i <= N; i++) {
        const s = i / N - 0.5; // −0,5 krawędź natarcia … +0,5 krawędź spływu
        const q = 1 - 4 * s * s;
        const yc = camber * c * q;
        const th = thick * c * Math.sqrt(Math.max(0, q)) * (side ? -1 : 1) * 0.5;
        const a = s * c;
        const b = yc + th;
        pos.push(a * Math.cos(st) - b * Math.sin(st) + sw, r, a * Math.sin(st) + b * Math.cos(st));
      }
  }
  const row = (N + 1) * 2;
  for (let j = 0; j < M; j++)
    for (let side = 0; side < 2; side++)
      for (let i = 0; i < N; i++) {
        const a = j * row + side * (N + 1) + i;
        const b = a + row;
        if (side) idx.push(a, a + 1, b, a + 1, b + 1, b);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Łopata wentylatora z kompozytu (jak w LEAP / GE9X): bardzo szeroka cięciwa rosnąca ku końcowi, duże skręcenie,
 * profil gruby przy nasadzie i cienki na końcu, krawędź natarcia wygięta jak szabla (lekko do przodu w połowie
 * wysokości, mocno do tyłu przy końcu) oraz pochylenie końcówki w kierunku obrotu.
 * part = 'sheath' – sama tytanowa okuwka krawędzi natarcia (nieco grubsza, obejmuje przód profilu).
 */
function fanBladeGeometry(rIn: number, rOut: number, cRoot: number, cTip: number, stRoot: number, stTip: number, part: 'body' | 'sheath') {
  const M = 18;
  const N = part === 'sheath' ? 5 : 18;
  const s0 = -0.5;
  const s1 = part === 'sheath' ? -0.36 : 0.5;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= M; j++) {
    const u = j / M;
    const r = rIn + (rOut - rIn) * u;
    const c = cRoot + (cTip - cRoot) * Math.pow(u, 0.7);
    const st = stRoot + (stTip - stRoot) * Math.pow(u, 0.9);
    const camber = 0.11 * (1 - u) + 0.035;
    const thick = (0.12 * (1 - u) + 0.022) * (part === 'sheath' ? 1.12 : 1);
    // szablowy kształt krawędzi natarcia
    const sweep = -0.08 * c * Math.sin(Math.PI * u) + 0.18 * c * u * u * u;
    const lean = 0.07 * c * u * u;
    for (let side = 0; side < 2; side++)
      for (let i = 0; i <= N; i++) {
        const s = s0 + ((s1 - s0) * i) / N;
        const q = Math.max(0, 1 - 4 * s * s);
        const yc = camber * c * q;
        const th = thick * c * Math.sqrt(q) * (side ? -1 : 1) * 0.5;
        const a = s * c;
        const b = yc + th;
        pos.push(a * Math.cos(st) - b * Math.sin(st) + sweep, r, a * Math.sin(st) + b * Math.cos(st) + lean);
      }
  }
  const row = (N + 1) * 2;
  for (let j = 0; j < M; j++)
    for (let side = 0; side < 2; side++)
      for (let i = 0; i < N; i++) {
        const a = j * row + side * (N + 1) + i;
        const b = a + row;
        if (side) idx.push(a, a + 1, b, a + 1, b + 1, b);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function BladeRing({ x, rIn, rOut, n, color, chord = 0.05, twist = 0.5, spin = 0, look, ev, hub = false, wide = false, tipChord, damage = 0, pitch = 0 }: { x: number; rIn: number; rOut: number; n: number; color: string; chord?: number; twist?: number; spin?: number; thick?: number; look: Look; ev?: ClickProps; hub?: boolean; wide?: boolean; tipChord?: number; damage?: number; pitch?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(
    () =>
      wide
        ? fanBladeGeometry(rIn, rOut, chord, tipChord ?? chord * 1.6, twist * 0.45, twist * 1.2, 'body')
        : bladeGeometry(rIn, rOut, chord * 1.15, tipChord ?? chord * 0.9, twist * 0.8, twist * 1.1, twist > 0 ? 0.1 : -0.1, 0.12, 0),
    [rIn, rOut, chord, tipChord, twist, wide],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  // tytanowa okuwka krawędzi natarcia łopat wentylatora
  const sheathRef = useRef<THREE.InstancedMesh>(null);
  const sheathGeo = useMemo(() => (wide ? fanBladeGeometry(rIn, rOut, chord, tipChord ?? chord * 1.6, twist * 0.45, twist * 1.2, 'sheath') : null), [rIn, rOut, chord, tipChord, twist, wide]);
  useEffect(() => () => sheathGeo?.dispose(), [sheathGeo]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const base = new THREE.Color(PRESETS[color]?.color ?? color);
    // znacznik: łopatka nieco jaśniejsza od pozostałych (jak świeżo wymieniona) – widać obrót, a nie razi
    const mark = base.clone().lerp(new THREE.Color('#ffffff'), 0.55);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      o.position.set(0, 0, 0);
      o.rotation.set(a, 0, 0);
      o.scale.set(1, 1, 1);
      // uszkodzenia: 1 – kilka łopat zgiętych (np. po zderzeniu z ptakiem), 2 – jedna łopata urwana, sąsiednie zgięte
      const bent = (damage >= 1 && i >= 2 && i <= 4) || (damage >= 2 && (i === 1 || i === n - 1));
      // przestawne kierownice: cała łopatka obraca się wokół własnego czopa (oś promieniowa)
      if (pitch) o.rotateY(pitch);
      if (damage >= 2 && i === 0) o.scale.set(1, 0.18, 1);
      else if (bent) {
        o.rotateY(0.45);
        o.scale.set(1, 0.9, 1);
      }
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      sheathRef.current?.setMatrixAt(i, o.matrix);
      // na wirnikach jedna jasna łopatka-znacznik, żeby było widać obrót
      const hurt = (damage >= 1 && i >= 2 && i <= 4) || (damage >= 2 && (i <= 1 || i === n - 1));
      m.setColorAt(i, hurt ? base.clone().lerp(new THREE.Color('#5b3a1e'), 0.45) : spin && (i === 0 || i === Math.floor(n / 2)) ? mark : base);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    if (sheathRef.current) {
      sheathRef.current.instanceMatrix.needsUpdate = true;
      sheathRef.current.computeBoundingSphere();
    }
  }, [n, geo, sheathGeo, color, spin !== 0, damage, pitch]);
  // obrót z prawdziwą prędkością; przy dużych obrotach łopatki rozmywają się w dysk
  // w pauzie nic się nie obraca – łopatki ostre
  const paused = useContext(PauseContext);
  const blur = paused ? 0 : motionBlur(spin, n);
  useFrame((_, dt) => {
    if (group.current && spin) group.current.rotation.x += spin * Math.min(dt, 0.05);
  });
  const bladeLook = blur > 0 ? { ...look, opacity: look.opacity * (1 - 0.4 * blur) } : look;
  const p = PRESETS[color];
  return (
    <group ref={group} position={[x, 0, 0]}>
      <instancedMesh key={`${n}-${geo.uuid}`} ref={ref} args={[geo, undefined, n]} {...ev}>
        {/* biały materiał × kolor instancji; metaliczność i szorstkość z presetu */}
        <Mat color="#ffffff" look={bladeLook} metal={p?.metal ?? 0.8} rough={p?.rough ?? 0.3} side={THREE.DoubleSide} />
      </instancedMesh>
      {sheathGeo && (
        <instancedMesh key={`s-${n}-${sheathGeo.uuid}`} ref={sheathRef} args={[sheathGeo, undefined, n]} {...ev}>
          <Mat color="titanium" look={bladeLook} side={THREE.DoubleSide} />
        </instancedMesh>
      )}
      {blur > 0.01 && (
        <mesh rotation={[0, Math.PI / 2, 0]} {...ev}>
          <ringGeometry args={[rIn, rOut, 64, 1]} />
          <meshPhysicalMaterial color={p?.color ?? color} metalness={p?.metal ?? 0.8} roughness={0.55} transparent opacity={look.opacity * 0.3 * blur} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* tarcza wirnika: wieniec pod łopatkami, cienka środnik i piasta przy wale – obraca się z łopatkami */}
      {hub && (
        <group rotation={[0, 0, Math.PI / 2]}>
          <mesh {...ev}>
            <cylinderGeometry args={[rIn, rIn, chord * 1.3, 48, 1, true]} />
            <Mat color="steel" look={look} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} {...ev}>
            <ringGeometry args={[0.2, rIn - 0.005, 48]} />
            <Mat color="darkSteel" look={look} side={THREE.DoubleSide} />
          </mesh>
          <mesh {...ev}>
            <cylinderGeometry args={[0.2, 0.2, chord * 1.1, 24, 1, true]} />
            <Mat color="darkSteel" look={look} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function loftGeometry(x0: number, x1: number, top: (x: number) => number, bot: (x: number) => number, half: (x: number) => number, nx = 48, nk = 28) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    const yt = top(x);
    const yb = bot(x);
    const yc = (yt + yb) / 2;
    const h = Math.max(0.0005, (yt - yb) / 2);
    const w = Math.max(0.0005, half(x));
    for (let k = 0; k < nk; k++) {
      const f = (k / nk) * Math.PI * 2;
      // „superelipsa” – prawie prostokątny przekrój z zaokrąglonymi narożami
      const c = Math.cos(f);
      const s = Math.sin(f);
      pos.push(ax(x), yc + h * Math.sign(s) * Math.pow(Math.abs(s), 0.4), w * Math.sign(c) * Math.pow(Math.abs(c), 0.6));
    }
  }
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nk; k++) {
      const a = i * nk + k;
      const b = i * nk + ((k + 1) % nk);
      idx.push(a, a + nk, b, b, a + nk, b + nk);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Rozwidlenia kanału obejściowego: profilowane ścianki od osłony rdzenia do gondoli, u góry (pod pylonem) i u dołu.
 * Rysowane w skalowanej grupie gondoli (y·fs), więc dolny brzeg dzielimy przez fs, by trafił w nieskalowaną osłonę rdzenia.
 */
function Bifurcations({ fs, look, ev }: { fs: number; look: Look; ev?: ClickProps }) {
  const geos = useMemo(() => {
    const top = (x: number) => (lerpTable(NAC3_IN, x) - 0.5) * S;
    const bot = (x: number) => ((lerpTable(COWL3, x) + 0.5) * S) / fs;
    const half = (x: number) => 0.05 * Math.min(1, (x - 200) / 40, (600 - x) / 80);
    return [loftGeometry(205, 598, top, bot, (x) => Math.max(0.004, half(x)) / fs, 40, 20), loftGeometry(225, 590, top, bot, (x) => Math.max(0.004, half(x) * 0.8) / fs, 40, 20)];
  }, [fs]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  return (
    <group>
      <mesh geometry={geos[0]} {...ev}>
        <Mat color="paintGrey" look={look} />
      </mesh>
      <group rotation={[Math.PI, 0, 0]}>
        <mesh geometry={geos[1]} {...ev}>
          <Mat color="paintGrey" look={look} />
        </mesh>
      </group>
    </group>
  );
}

/** Detale zewnętrznej gondoli: szczeliny podziału, zatrzaski pokryw, płetwa (chine) na wlocie i maszt odpływowy. */
function NacelleDetails({ cut, look, ev, inlet }: { cut: boolean; look: Look; ev?: ClickProps; inlet: boolean }) {
  const t0 = cut ? V0 : 0;
  const t1 = cut ? V1 : Math.PI * 2;
  const groove = (x: number): Tab => [[x - 0.6, lerpTable(NAC3_OUT, x) - 0.6], [x + 0.6, lerpTable(NAC3_OUT, x) - 0.6], [x + 0.6, lerpTable(NAC3_OUT, x) + 0.12], [x - 0.6, lerpTable(NAC3_OUT, x) + 0.12], [x - 0.6, lerpTable(NAC3_OUT, x) - 0.6]];
  const surf = (x: number, th: number, lift = 0): [number, number, number] => {
    const r = (lerpTable(NAC3_OUT, x) + lift) * S;
    return [ax(x), r * Math.cos(th), r * Math.sin(th)];
  };
  if (inlet)
    return (
      <group>
        <Revolved pts={groove(138)} t0={t0} t1={t1} color="#2b3036" look={look} ev={ev} />
        {/* płetwa na wlocie: przy dużym kącie natarcia tworzy wir, który porządkuje opływ skrzydła za gondolą */}
        <group rotation={[-0.75, 0, 0]}>
          <mesh position={[ax(118), lerpTable(NAC3_OUT, 118) * S + 0.05, 0]} rotation={[0, 0, 0.12]} {...ev}>
            <boxGeometry args={[0.42, 0.1, 0.012]} />
            <Mat color="paint" look={look} />
          </mesh>
        </group>
      </group>
    );
  return (
    <group>
      <Revolved pts={groove(362)} t0={t0} t1={t1} color="#2b3036" look={look} ev={ev} />
      {/* linia zawiasów pokryw wentylatora u góry i zatrzaski u dołu */}
      {[230, 270, 310].map((x) => (
        <group key={x} rotation={[Math.PI, 0, 0]}>
          <mesh position={[ax(x), lerpTable(NAC3_OUT, x) * S + 0.004, 0]} {...ev}>
            <boxGeometry args={[0.18, 0.012, 0.07]} />
            <Mat color="#3b4149" look={look} />
          </mesh>
        </group>
      ))}
      {/* maszt odpływowy (odprowadza płyny z przedziałów gondoli) */}
      <group rotation={[Math.PI, 0, 0]}>
        <mesh position={[ax(500), lerpTable(NAC3_OUT, 500) * S + 0.06, 0]} rotation={[0, 0, 0.5]} {...ev}>
          <boxGeometry args={[0.12, 0.12, 0.018]} />
          <Mat color="paintGrey" look={look} />
        </mesh>
      </group>
      {/* panele przeglądowe na boku pokrywy wentylatora */}
      {[-1.2, -1.9].map((th) => (
        <mesh key={th} position={surf(260, th, 0.15)} rotation={[th, 0, 0]} {...ev}>
          <boxGeometry args={[0.3, 0.004, 0.16]} />
          <Mat color="#d6dade" look={look} />
        </mesh>
      ))}
    </group>
  );
}

/** Kołpak obracający się z wentylatorem, ze spiralnym znakiem jak na prawdziwych silnikach. */
function SpinnerRotor({ w, look, ev }: { w: number; look: Look; ev?: ClickProps }) {
  const ref = useRef<THREE.Group>(null);
  const spiral = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    // spirala od czubka kołpaka ku podstawie – ok. ¾ obrotu, jak znak na silnikach CFM/GE
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      const x = 80 + Math.pow(u, 0.8) * 66;
      const r = lerpTable(SPINNER, x) * S + 0.006;
      const a = u * Math.PI * 1.5;
      pts.push(new THREE.Vector3(ax(x), Math.cos(a) * r, Math.sin(a) * r));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.022, 8, false);
  }, []);
  useEffect(() => () => spiral.dispose(), [spiral]);
  // spirala jest pojedynczym znakiem, więc rozmywa się dopiero przy wyższych obrotach niż łopaty
  const paused = useContext(PauseContext);
  const blur = paused ? 0 : motionBlur(w, 1);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.x += w * Math.min(dt, 0.05);
  });
  return (
    <group ref={ref}>
      <Shell outer={SPINNER} x0={78} x1={150} color="spinner" cut={false} look={look} ev={ev} />
      {/* biała spirala na ciemnym kołpaku – jak na silnikach CFM/GE */}
      <mesh geometry={spiral} raycast={() => null}>
        <meshStandardMaterial color="#f8fafc" roughness={0.4} metalness={0} transparent={look.opacity < 1 || blur > 0} opacity={look.opacity * (1 - 0.35 * blur)} depthWrite={blur < 0.5} />
      </mesh>
    </group>
  );
}

const tmp = new THREE.Object3D();
const col = new THREE.Color();
const x2v = (x: number) => (x > 445 && x < 545 ? 0.5 : x > 545 ? 1.6 : 1);

function pColor(p: number) {
  const k = Math.max(0, Math.min(1, Math.log(p) / Math.log(42)));
  return col.setHSL(0.6 - k * 0.45, 0.85, 0.55 + 0.1 * k);
}
function vColor(v: number) {
  const k = Math.max(0, Math.min(1, v / 430));
  return col.setHSL(0.33 - k * 0.2, 0.8, 0.45 + 0.25 * k);
}
function flowColor(mode: FlowMode, x: number, core: boolean) {
  if (mode === 'p') return pColor(lerpTable(core ? ALONG.p : ALONG.pByp, x));
  if (mode === 'v') return vColor(lerpTable(core ? ALONG.v : ALONG.vByp, x));
  if (mode === 'temp') return col.set(tempColor(lerpTable(core ? ALONG.T : ALONG.TByp, x)));
  return core ? col.set(tempColor(lerpTable(ALONG.T, x))) : col.set('#7dd3fc');
}

/** Opływ zewnętrzny: obrys gondoli (promień w j. sceny w funkcji x przekroju), jej koniec i wysokość skrzydła. */
export type OuterFlowCfg = { nac: (xs: number) => number; end: number; wingY: number | null };

const FLOW_X0 = -720; // początek strugi – ok. 7 m przed wlotem
const FLOW_LIP = 64; // krawędź wlotu
const FLOW_CAP = 1.25; // o ile szersza jest struga daleko przed wlotem (promień ×2,25)
/** Postęp lejka przed wlotem: 1 daleko przed silnikiem, 0 na krawędzi wlotu. */
const funnelK = (x: number) => (x >= FLOW_LIP ? 0 : Math.pow((FLOW_LIP - x) / (FLOW_LIP - FLOW_X0), 0.75));
/** Powietrze przed wlotem przyspiesza: daleko płynie wolniej, tuż przed wentylatorem najszybciej. */
const funnelV = (x: number) => 0.38 + 0.62 * Math.pow(1 - funnelK(x), 1.6);
const flowQ = new THREE.Quaternion();
const flowDir = new THREE.Vector3();
const FLOW_X = new THREE.Vector3(1, 0, 0);
/** Ustawia smugę wzdłuż kierunku (dx, dr) w płaszczyźnie południkowej o kącie a. */
function aimStreak(a: number, dx: number, dr: number, dy = 0) {
  flowDir.set(dx, Math.cos(a) * dr + dy, Math.sin(a) * dr);
  if (flowDir.lengthSq() < 1e-10) flowDir.set(1, 0, 0);
  tmp.quaternion.copy(flowQ.setFromUnitVectors(FLOW_X, flowDir.normalize()));
}

/** Strumienie cząstek: zimny (obejściowy), gorący (rdzeń) i powietrze opływające gondolę z zewnątrz. */
function Flow({ speed, mode, fanScale, bypass, core, abNoz, ductIn, outer }: { speed: number; mode: FlowMode; fanScale: number; bypass: boolean; core: boolean; abNoz: number | null; ductIn?: Tab | null; outer?: OuterFlowCfg | null }) {
  const longPipe = abNoz !== null;
  const nz = abNozzle(abNoz ?? 0);
  const N_B = 420;
  const N_C = 230;
  const N_O = 420;
  const bRef = useRef<TrailMesh>(null);
  const cRef = useRef<TrailMesh>(null);
  const oRef = useRef<TrailMesh>(null);
  const end = longPipe ? 1250 : 1050;
  const seeds = useMemo(
    () => ({
      b: Array.from({ length: N_B }, () => ({ x: FLOW_X0 + Math.random() * (1050 - FLOW_X0), f: 0.1 + 0.8 * Math.random(), a: Math.random() * Math.PI * 2 })),
      c: Array.from({ length: N_C }, () => ({ x: FLOW_X0 + Math.random() * (1050 - FLOW_X0), f: 0.15 + 0.7 * Math.random(), a: Math.random() * Math.PI * 2 })),
      // opływ: kąt omija górę (pylon i skrzydło), promień od samej powierzchni gondoli do ok. 1,4 jej promienia dalej
      o: Array.from({ length: N_O }, () => ({ x: FLOW_X0 + Math.random() * 2100, f: Math.pow(Math.random(), 0.8), a: 0.4 + Math.random() * (Math.PI * 2 - 0.8) })),
    }),
    [],
  );

  /** Promień strugi obejściowej (j. przekroju) – w silniku jak dotąd, przed wlotem rozchylony w lejek. */
  const radB = (x: number, f: number) => {
    const xc = Math.max(x, -60);
    const cw = lerpTable(COWL3, Math.min(xc, 765));
    let rr = xc < 140 ? 84 + f * 76 : xc < 200 ? 80 + f * 84 : xc <= 600 ? cw + 3 + f * (lerpTable(NAC3_IN, xc) - cw - 6) : cw + 3 + f * (128 + (xc - 600) * 0.03 - cw);
    const base = xc < 200 ? 40 : cw + 3;
    rr = base + (rr - base) * fanScale;
    if (ductIn && xc >= 196) {
      // długa gondola: kanał aż do wspólnej dyszy, za nią jeden rozszerzający się strumień
      const top = lerpTable(ductIn, Math.min(xc, 832)) - 3;
      const b = xc < 765 ? cw + 3 : 30;
      rr = xc <= 832 ? b + f * (top - b) : (30 + f * (top - 30)) * (1 + (xc - 832) * 0.0015);
    }
    if (longPipe) {
      // silnik wojskowy: cienki kanał pod kadłubem, potem chłodzenie osłony dopalacza, za nią wspólna dysza
      rr =
        xc < 196
          ? 40 + f * (MIL_FAN_R * 100 - 44)
          : xc < 742
            ? cw + 2 + f * (lerpTable(MIL_IN, xc) - cw - 4)
            : xc < 1000
              ? AB_LINER + 3 + f * 8
              : xc < nz.xT
                ? (AB_LINER + ((nz.rT - AB_LINER) * (xc - 1000)) / (nz.xT - 1000)) * (0.85 + 0.1 * f)
                : (nz.rT + ((nz.rE - nz.rT) * Math.min(1, (xc - nz.xT) / (nz.xE - nz.xT)))) * (0.85 + 0.1 * f);
    }
    return rr * (1 + FLOW_CAP * funnelK(x));
  };
  /**
   * Przed rdzeniem struga płynie wokół kołpaka: daleko przed silnikiem bliżej osi, potem rozchyla się po jego kształcie
   * (r² = r196² − 40² + h²), tak by w x = 196 trafić dokładnie we wlot rdzenia.
   */
  const hubAvoid = (x: number, r196: number) => {
    const u = Math.max(0, Math.min(1, (x + 100) / 296));
    const h = 40 * u * u * (3 - 2 * u);
    return Math.sqrt(Math.max(0, r196 * r196 - 1600) + h * h);
  };
  /** Promień strugi rdzenia (j. przekroju). */
  const radC = (x: number, f: number) => {
    const xc = Math.max(x, -60);
    const plug = lerpTable(PLUG3, Math.min(xc, 945));
    const rr =
      xc < 196
        ? hubAvoid(xc, 42 + f * 34)
        : longPipe && xc > 690
          ? xc < 800
            ? lerpTable(PLUG_AB, xc) + 2 + f * (95 - lerpTable(PLUG_AB, xc))
            : xc < 1000
              ? f * 95
              : xc < nz.xT
                ? f * (95 + ((nz.rT * 0.85 - 95) * (xc - 1000)) / (nz.xT - 1000))
                : f * nz.rT * 0.85 * (1 + Math.min(1, (xc - nz.xT) / (nz.xE - nz.xT)) * ((nz.rE - nz.rT) / nz.rT))
          : xc > 690
            ? plug + 2 + f * ((xc < 765 ? lerpTable(CORE3_OUT, xc) : 61 + (xc - 765) * 0.06) - plug - 4)
            : lerpTable(CORE_IN, xc) + 2 + f * (lerpTable(CORE_OUT, xc) - lerpTable(CORE_IN, xc) - 4);
    return rr * (1 + FLOW_CAP * funnelK(x));
  };
  /** Wejście w kadr: smugi pojawiają się łagodnie na początku lejka i bledną daleko przed silnikiem. */
  const fadeIn = (x: number) => Math.min(1, (x - FLOW_X0) / 140);
  const dimFar = (x: number) => 0.55 + 0.45 * (1 - funnelK(x));

  /** Promień „ciała” omijanego przez opływ (j. sceny): wlot rozpycha powietrze nieco przed sobą, za gondolą – strumień wylotowy. */
  const body = (xs: number) => {
    if (!outer) return 0;
    const lip = outer.nac(FLOW_LIP);
    // przed wlotem „ciałem” jest cała struga wpadająca do silnika – opływ zaczyna się na zewnątrz lejka
    if (xs < FLOW_LIP) return lip * (1 + FLOW_CAP * funnelK(xs));
    if (xs <= outer.end) return outer.nac(xs);
    // za gondolą strumień wylotowy powoli się zwęża i rozmywa
    const e = outer.nac(outer.end);
    return e * Math.max(0.75, 1 - (xs - outer.end) * 0.0006);
  };
  const outerR = (xs: number, f: number) => {
    if (!outer) return 0;
    const r0 = outer.nac(220) * (0.06 + 1.4 * f);
    const b = body(xs);
    return Math.sqrt(r0 * r0 + b * b) + 0.03;
  };
  /** Spód skrzydła w punkcie (x, z) sceny – opływ przechodzi pod nim, przed i za nim łagodnie się podnosi. */
  const wingFloor = (x: number, z: number) => {
    if (!outer || outer.wingY === null) return Infinity;
    const c = wgChord(z);
    const s = (x - wgXle(z)) / c;
    const sc = Math.max(0, Math.min(1, s));
    return outer.wingY + wgY(sc, z, false) - 0.12 + Math.max(0, -s, s - 1) * c * 0.45;
  };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const b = bRef.current;
    const c = cRef.current;
    const o = oRef.current;
    if (b) {
      seeds.b.forEach((s, i) => {
        s.x += dt * speed * 260 * (s.x > 600 ? 1.4 : 1) * funnelV(s.x);
        if (s.x > (longPipe ? 1250 : 1050)) s.x = FLOW_X0;
        const x = s.x;
        const rr = radB(x, s.f);
        s.a += dt * speed * (x > 160 && x < 200 ? 0.6 : 0.02);
        tmp.position.set(ax(x), Math.cos(s.a) * rr * S, Math.sin(s.a) * rr * S);
        aimStreak(s.a, 6, radB(x + 6, s.f) - rr);
        const vis = bypass && x < (longPipe ? 1240 : 1040) ? fadeIn(x) : 0;
        // długość smugi ∝ lokalnej prędkości strumienia
        tmp.scale.set(vis * (0.1 + 0.32 * speed * (x > 540 ? 1.4 : 1) * funnelV(x)), vis * 0.014, vis * 0.014);
        tmp.updateMatrix();
        b.setMatrixAt(i, tmp.matrix);
        b.setColorAt(i, flowColor(mode, Math.max(x, -40), false).multiplyScalar(dimFar(x)));
      });
      b.instanceMatrix.needsUpdate = true;
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
    }
    if (c) {
      seeds.c.forEach((s, i) => {
        s.x += dt * speed * 260 * x2v(s.x) * funnelV(s.x);
        if (s.x > end) s.x = FLOW_X0;
        const x = s.x;
        // za turbiną gorący strumień płynie między stożkiem wylotowym a dyszą, a za dyszą lekko się rozszerza
        const rr = radC(x, s.f);
        s.a += dt * speed * 0.5;
        tmp.position.set(ax(x), Math.cos(s.a) * rr * S, Math.sin(s.a) * rr * S);
        aimStreak(s.a, 6, radC(x + 6, s.f) - rr);
        const vis = core && x < end - 10 ? fadeIn(x) : 0;
        tmp.scale.set(vis * (0.08 + 0.3 * speed * x2v(x) * funnelV(x)), vis * 0.017, vis * 0.017);
        tmp.updateMatrix();
        c.setMatrixAt(i, tmp.matrix);
        c.setColorAt(i, flowColor(mode, Math.max(-40, Math.min(x, 1000)), true).multiplyScalar(dimFar(x)));
      });
      c.instanceMatrix.needsUpdate = true;
      if (c.instanceColor) c.instanceColor.needsUpdate = true;
    }
    if (o) {
      const X1 = FLOW_X0 + 2100;
      seeds.o.forEach((s, i) => {
        s.x += dt * speed * 230;
        if (s.x > X1) s.x = FLOW_X0;
        const x = s.x;
        const r = outerR(x, s.f);
        let y = Math.cos(s.a) * r;
        const z = Math.sin(s.a) * r;
        // pod skrzydłem struga spłaszcza się wzdłuż jego spodu
        const floor = wingFloor(ax(x), z);
        const under = y > floor;
        if (under) y = floor;
        tmp.position.set(ax(x), y, z);
        const dr = outerR(x + 6, s.f) - r;
        const dyW = under ? wingFloor(ax(x + 6), z) - floor : 0;
        if (under) {
          flowDir.set(6 * S, dyW, Math.sin(s.a) * dr);
          tmp.quaternion.copy(flowQ.setFromUnitVectors(FLOW_X, flowDir.normalize()));
        } else aimStreak(s.a, 6 * S, dr);
        const vis = outer ? Math.min(fadeIn(x), Math.max(0, (X1 - x) / 160)) : 0;
        tmp.scale.set(vis * (0.12 + 0.3 * speed), vis * 0.011, vis * 0.011);
        tmp.updateMatrix();
        o.setMatrixAt(i, tmp.matrix);
        // dalej od gondoli – bledsze, żeby nie zasłaniały silnika
        o.setColorAt(i, flowColor(mode, -40, false).multiplyScalar(0.62 - 0.3 * s.f));
      });
      o.instanceMatrix.needsUpdate = true;
      if (o.instanceColor) o.instanceColor.needsUpdate = true;
    }
  });
  return (
    <>
      <Trails ref={bRef} count={N_B} opacity={0.85} />
      <Trails ref={cRef} count={N_C} />
      {outer && (
        <Trails ref={oRef} count={N_O} opacity={0.7} />
      )}
    </>
  );
}

/* ---------------- płomień (shader) ---------------- */

const FLAME_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uWob;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec3 p = position;
    float t = uv.y;
    float a = uv.x * 6.2831853;
    // falowanie i kołysanie – rośnie ku końcowi płomienia, nasada zostaje przy wtryskiwaczu
    float w = 1.0 + uWob * t * (0.12 * sin(uTime * 11.0 + t * 14.0 + a * 3.0 + uSeed)
                              + 0.07 * sin(uTime * 19.0 - t * 23.0 + a * 5.0 + uSeed * 2.3));
    p.xz *= w;
    p.x += uWob * 0.16 * t * t * sin(uTime * 6.1 + uSeed * 3.1);
    p.z += uWob * 0.16 * t * t * cos(uTime * 5.3 + uSeed * 1.7);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const FLAME_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uInt;
  uniform float uSeed;
  uniform float uHot;
  uniform float uCore;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.55;
    for (int k = 0; k < 4; k++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }
  void main() {
    float t = vUv.y; // 0 – nasada, 1 – koniec płomienia
    // miękkie krawędzie liczone dla każdego piksela: środek płomienia jasny, brzegi znikają
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float edge = pow(facing, 1.4);
    // języki ognia płyną wzdłuż płomienia; szum zawija się wokół osi (bez szwu)
    float ang = vUv.x * 6.2831853;
    vec2 q = vec2(cos(ang), sin(ang)) * 1.6;
    float n = fbm(q + vec2(uSeed, t * 3.0 - uTime * 4.6));
    float n2 = fbm(q * 2.2 + vec2(-uSeed, t * 6.5 - uTime * 8.0));
    float body = smoothstep(1.0, 0.18, t + (n - 0.5) * 0.7);
    float flick = 0.65 + 0.7 * n2;
    float a = body * edge * flick * uInt * smoothstep(0.0, 0.06, t);
    // nasada niebieska (pełne spalanie), potem biało-żółta, pomarańczowa i ciemnoczerwona na końcu
    vec3 c = mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.96, 0.78), smoothstep(0.02, 0.14, t));
    c = mix(c, vec3(1.0, 0.66, 0.18), smoothstep(0.18, 0.55, t));
    c = mix(c, vec3(0.8, 0.2, 0.04), smoothstep(0.55, 0.98, t));
    // rdzeń: biały, gorący środek
    c = mix(c, vec3(1.0, 0.98, 0.92), uCore * (1.0 - smoothstep(0.05, 0.75, t)));
    c *= 1.0 + uHot * 0.45;
    gl_FragColor = vec4(c * a * 1.9, a);
  }
`;

/** Wspólna bryła płomienia (długość 1, promień 1): kształt łzy – wąska nasada, pękaty przód, ostry koniec. */
let flameGeo: THREE.LatheGeometry | null = null;
function flameGeometry() {
  if (flameGeo) return flameGeo;
  const pts: THREE.Vector2[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.85) * (1 - 0.15 * t) + (i === 0 ? 0.18 : 0);
    pts.push(new THREE.Vector2(Math.max(0.0005, r), t - 0.5));
  }
  flameGeo = new THREE.LatheGeometry(pts, 56);
  return flameGeo;
}

function flameMaterial(seed: number, core: number) {
  return new THREE.ShaderMaterial({
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    uniforms: { uTime: { value: 0 }, uInt: { value: 1 }, uSeed: { value: seed * 1.7 }, uHot: { value: 0 }, uCore: { value: core }, uWob: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Płomień skierowany wzdłuż +X: zewnętrzna powłoka (pomarańczowa, z językami ognia) i wewnętrzny, biały rdzeń.
 * Przezroczystość liczona w każdym pikselu z kąta patrzenia – płomień wygląda na „objętościowy”, bez faset.
 */
export function Flame({ len, r, intensity, seed, hot = 0 }: { len: number; r: number; intensity: number; seed: number; hot?: number }) {
  const mats = useMemo(() => [flameMaterial(seed, 0), flameMaterial(seed + 0.37, 1)], [seed]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    mats.forEach((m, i) => {
      m.uniforms.uTime.value = t + i * 0.5;
      m.uniforms.uInt.value = intensity * (i ? 0.9 : 1);
      m.uniforms.uHot.value = hot;
    });
  });
  if (intensity < 0.02) return null;
  const g = flameGeometry();
  return (
    <group>
      <mesh geometry={g} material={mats[0]} position={[len / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[r, len, r]} raycast={() => null} />
      <mesh geometry={g} material={mats[1]} position={[len * 0.3, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[r * 0.5, len * 0.6, r * 0.5]} raycast={() => null} />
    </group>
  );
}

/** Zapłon: wyładowania świecy – wiązka iskier wylatujących z elektrody i błysk światła. */
function Spark({ on }: { on: boolean }) {
  const N = 24;
  const ref = useRef<TrailMesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const st = useRef({ next: 0, born: -1, v: Array.from({ length: N }, () => new THREE.Vector3()) });
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const s = st.current;
    if (on && t > s.next) {
      // świeca iskrzy kilka razy na sekundę
      s.born = t;
      s.next = t + 0.16 + Math.random() * 0.12;
      s.v.forEach((v) => v.set((Math.random() - 0.2) * 0.9, -0.4 - Math.random() * 0.9, (Math.random() - 0.5) * 0.9));
    }
    const age = t - s.born;
    const life = 0.13;
    const alive = on && s.born >= 0 && age < life;
    const o = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      if (alive) {
        const v = s.v[i];
        o.position.set(v.x * age, v.y * age, v.z * age);
        o.lookAt(v.x * (age + 0.01), v.y * (age + 0.01), v.z * (age + 0.01));
        o.rotateY(-Math.PI / 2);
        const k = 1 - age / life;
        o.scale.set(0.05 + 0.12 * k, 0.006, 0.006);
      } else o.scale.set(0, 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    if (light.current) light.current.intensity = alive ? 3.5 * (1 - age / life) : 0;
  });
  return (
    <>
      <Trails ref={ref} count={N} />
      <pointLight ref={light} color="#bfdbfe" intensity={0} distance={1.2} decay={2} />
    </>
  );
}

function PartLabel({ pos, color, children, onClick, sub = false }: { pos: [number, number, number]; color: string; children: string; onClick?: () => void; sub?: boolean }) {
  // scena trzymana w pamięci (ukryta) nie pokazuje podpisów
  if (useSceneHidden()) return null;
  return (
    <Html position={pos} center zIndexRange={[5, 0]}>
      <span className={sub ? 'engine-label sub' : 'engine-label'} style={{ color, pointerEvents: onClick ? 'auto' : 'none', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
        {children}
      </span>
    </Html>
  );
}

/* ---------------- rewersy ---------------- */

/*
 * Kąt wokół osi silnika: 0 – góra (+Y), rośnie ku +Z (ku kamerze).
 * W przekroju widoczny jest łuk [V0, V1] – części rewersu w wyciętej ćwiartce nie są rysowane.
 */
const V0 = CUT_START + Math.PI / 2;
const V1 = V0 + CUT_LEN;
function clipArc(t0: number, t1: number, cut: boolean): [number, number] | null {
  if (!cut) return [t0, t1];
  for (let k = -2; k <= 2; k++) {
    const s = 2 * Math.PI * k;
    const a = Math.max(t0 + s, V0);
    const b = Math.min(t1 + s, V1);
    if (b - a > 1e-3) return [a - s, b - s];
  }
  return null;
}
const shown = (t: number, cut: boolean) => clipArc(t - 0.01, t + 0.01, cut) !== null;

/** Zamknięty profil (x, r) między dwiema tablicami promieni. */
function band(outer: Tab, inner: Tab, x0: number, x1: number, n = 10): Tab {
  const pts: Tab = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push([x, lerpTable(outer, x)]);
  }
  for (let i = n; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push([x, lerpTable(inner, x)]);
  }
  pts.push(pts[0]);
  return pts;
}
const shiftTab = (t: Tab, dr: number): Tab => t.map(([x, r]) => [x, r + dr]);
const scaleTab = (t: Tab, k: number): Tab => t.map(([x, r]) => [x, r * k]);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Bryła obrotowa z profilu (x, r) na łuku [t0, t1]. */
function Revolved({ pts, t0, t1, color, look, ev }: { pts: Tab; t0: number; t1: number; color: string; look: Look; ev?: ClickProps }) {
  const key = pts.map((p) => p.join(',')).join(';');
  const geo = useMemo(() => {
    const v = pts.map(([x, r]) => new THREE.Vector2(Math.max(0.001, r * S), x * S));
    const seg = Math.max(4, Math.ceil(((t1 - t0) / (Math.PI * 2)) * 128));
    const g = new THREE.LatheGeometry(v, seg, t0 - Math.PI / 2, t1 - t0);
    g.rotateZ(-Math.PI / 2);
    g.translate(-X0, 0, 0);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, t0, t1]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} {...ev}>
      <Mat color={color} look={look} side={THREE.DoubleSide} />
    </mesh>
  );
}

const Y_UP = new THREE.Vector3(0, 1, 0);
/** Pręt (cięgło, siłownik) między dwoma punktami. */
function Rod({ a, b, r = 0.014, color = 'polished', look, ev }: { a: [number, number, number]; b: [number, number, number]; r?: number; color?: string; look: Look; ev?: ClickProps }) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, vb.clone().sub(va).normalize());
  const mid = va.add(vb).multiplyScalar(0.5);
  return (
    <mesh position={mid} quaternion={q} {...ev}>
      <cylinderGeometry args={[r, r, len, 8]} />
      <Mat color={color} look={look} />
    </mesh>
  );
}

/** Płytka w kształcie trapezu: od zawiasu (x = 0, szerokość w0) do końca (x = len, szerokość w1). */
function trapPlate(len: number, w0: number, w1: number, th: number) {
  const g = new THREE.BoxGeometry(len, th, 1, 4, 1, 1);
  g.translate(len / 2, 0, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (w0 + ((w1 - w0) * p.getX(i)) / len));
  g.computeVertexNormals();
  return g;
}

type RevProps = { d: number; cut: boolean; look: (id: string, sub?: string) => Look; ev: (id: string) => ClickProps | undefined };

/**
 * Rewers kaskadowy (np. CFM LEAP, silnik naszego samolotu): tylna część gondoli zsuwa się do tyłu i odsłania pierścień kaskad
 * – kratownicę wygiętych łopatek. Drzwi blokujące, zawieszone na wewnętrznej ściance osłony, opadają
 * na cięgłach i zamykają kanał obejściowy. Kaskady są w dwóch połówkach: u góry belka zawiasów (pylon), u dołu belka zamków.
 */
function CascadeReverser({ d, cut, look, ev, teach = true }: RevProps & { teach?: boolean }) {
  const sl = 90 * d; // przesunięcie osłony (j. przekroju)
  const doorGeo = useMemo(() => trapPlate(0.47, 0.74, 0.5, 0.03), []);
  useEffect(() => () => doorGeo.dispose(), [doorGeo]);
  const XC0 = 366;
  const XC1 = 448;
  const rIn = (x: number) => lerpTable(NAC3_IN, x) + 2;
  const rOut = (x: number) => lerpTable(NAC3_OUT, x) - 4;
  // łopatki kaskad: wygięte do przodu ku zewnętrznej krawędzi – to one kierują strumień skośnie do przodu
  const vanes = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const xv = XC0 + 8 + i * 10;
        const a = rIn(xv);
        const b = rOut(xv);
        const pts: Tab = [];
        for (let j = 0; j <= 6; j++) {
          const t = j / 6;
          pts.push([xv - 8 * t * t, a + (b - a) * t]);
        }
        for (let j = 6; j >= 0; j--) {
          const t = j / 6;
          pts.push([xv - 8 * t * t + 1.6, a + (b - a) * t]);
        }
        pts.push(pts[0]);
        return pts;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const ring = (x0: number, x1: number): Tab => [
    [x0, rIn(x0)],
    [x1, rIn(x1)],
    [x1, rOut(x1)],
    [x0, rOut(x0)],
    [x0, rIn(x0)],
  ];
  const ribPts = useMemo(() => band(shiftTab(NAC3_OUT, -4.5), shiftTab(NAC3_IN, 2.5), XC0 - 3, XC1 + 3, 12), []);
  const halves: [number, number][] = [
    [0.14, Math.PI - 0.14],
    [Math.PI + 0.14, 2 * Math.PI - 0.14],
  ];
  // drzwi blokujące: zawias na przedniej krawędzi wewnętrznej ścianki osłony
  const hingeX = 364;
  const hingeR = (lerpTable(NAC3_IN, hingeX) - 3.5) * S;
  const slope = 0.19; // nachylenie ścianki kanału w tym miejscu
  const tilt = slope + d * 1.42;
  const nDoors = 12;
  return (
    <>
      <Shell outer={NAC3_OUT} inner={NAC3_IN} x0={140} x1={362} color="paint" cut={cut} look={look('bypass', 'fixed')} ev={ev('bypass:fixed')} />
      <group position={[sl * S, 0, 0]}>
        <Shell outer={NAC3_OUT} inner={NAC3_IN} x0={362} x1={600} color="paint" cut={cut} look={look('bypass', 'sleeve')} ev={ev('bypass:sleeve')} />
      </group>
      {/* kaskady */}
      {halves.map(([a, b], h) => {
        const arc = clipArc(a, b, cut);
        if (!arc) return null;
        return (
          <group key={h}>
            {vanes.map((p, i) => (
              <Revolved key={i} pts={p} t0={arc[0]} t1={arc[1]} color={teach ? 'yellow' : 'darkSteel'} look={look('bypass', 'cascade')} ev={ev('bypass:cascade')} />
            ))}
            <Revolved pts={ring(XC0 - 4, XC0)} t0={arc[0]} t1={arc[1]} color="darkSteel" look={look('bypass', 'cascade')} ev={ev('bypass:cascade')} />
            <Revolved pts={ring(XC1, XC1 + 5)} t0={arc[0]} t1={arc[1]} color="darkSteel" look={look('bypass', 'cascade')} ev={ev('bypass:cascade')} />
          </group>
        );
      })}
      {/* żebra kaskad oraz belki: górna (zawiasy, pod pylonem) i dolna (zamki) – wąskie wycinki pierścienia, dopasowane do ścianki gondoli */}
      {Array.from({ length: 24 }, (_, k) => {
        const t = (k / 24) * Math.PI * 2;
        const beam = k === 0 || k === 12;
        const w = beam ? 0.07 : 0.006;
        const arc = clipArc(t - w, t + w, cut);
        if (!arc) return null;
        return <Revolved key={k} pts={ribPts} t0={arc[0]} t1={arc[1]} color={beam ? 'paint' : 'darkSteel'} look={look('bypass', beam ? 'fixed' : 'cascade')} ev={ev(beam ? 'bypass:fixed' : 'bypass:cascade')} />;
      })}
      {/* drzwi blokujące i cięgła do osłony rdzenia */}
      {Array.from({ length: nDoors }, (_, k) => {
        const t = ((k + 0.5) / nDoors) * Math.PI * 2;
        if (!shown(t, cut)) return null;
        const hx = ax(hingeX) + sl * S;
        const px = hx + 0.3 * Math.cos(tilt);
        const py = hingeR - 0.3 * Math.sin(tilt);
        return (
          <group key={k} rotation={[t, 0, 0]}>
            <group position={[hx, hingeR, 0]} rotation={[0, 0, -tilt]}>
              <mesh geometry={doorGeo} {...ev('bypass:door')}>
                <Mat color={teach ? 'red' : 'paintGrey'} look={look('bypass', 'door')} />
              </mesh>
            </group>
            <Rod a={[ax(300), lerpTable(COWL3, 300) * S, 0]} b={[px, py, 0]} r={0.011} color="steel" look={look('bypass', 'link')} ev={ev('bypass:link')} />
          </group>
        );
      })}
    </>
  );
}

/**
 * Rewers drzwiowy (np. CFM56-5 w A320): cztery drzwi są fragmentami gondoli i obracają się wokół osi
 * w połowie grubości ścianki. Tylna krawędź wchodzi do kanału i go zamyka, przednia wychyla się na zewnątrz
 * i kieruje strumień do przodu. Między drzwiami zostają stałe belki; każde drzwi otwiera siłownik.
 */
function PivotDoorReverser({ d, cut, look, ev, k: ks }: RevProps & { k: number }) {
  const W = 0.6; // połowa szerokości kątowej drzwi
  const xa = 402;
  const xb = 528;
  // oś obrotu w tylnej części drzwi: krótki tył szybko domyka wąski kanał, długi przód szeroko wychyla się na zewnątrz
  const px = 496;
  // gondola mniejszego silnika (CFM56 – wentylator węższy niż w LEAP i silniku naszego samolotu)
  const { OUT, IN } = useMemo(() => ({ OUT: scaleTab(NAC3_OUT, ks), IN: scaleTab(NAC3_IN, ks) }), [ks]);
  const pr = 0.5 * (lerpTable(OUT, px) + lerpTable(IN, px)) * S;
  // kąt pełnego otwarcia: tylna wewnętrzna krawędź drzwi dochodzi do osłony rdzenia
  const phiMax = useMemo(() => {
    const ddx = (xb - px) * S;
    const ddy = lerpTable(IN, xb) * S - pr;
    for (let f = 0; f < 1.4; f += 0.005) {
      const xr = px + (ddx * Math.cos(f) + ddy * Math.sin(f)) / S;
      const yr = pr - ddx * Math.sin(f) + ddy * Math.cos(f);
      if (yr <= (lerpTable(COWL3, xr) + 1.5) * S) return f;
    }
    return 1.4;
  }, [IN, pr]);
  const phi = d * phiMax;
  const doorPts = useMemo(() => band(OUT, IN, xa, xb), [OUT, IN]);
  const skinPts = useMemo(() => band(shiftTab(IN, -1), shiftTab(IN, -3), xa + 2, xb - 2), [IN]);
  const beamPts = useMemo(() => band(OUT, IN, 400, 530), [OUT, IN]);
  const centers = [0, 1, 2, 3].map((k) => Math.PI / 4 + (k * Math.PI) / 2);
  const dx = (430 - px) * S; // punkt mocowania siłownika na drzwiach
  return (
    <>
      <Shell outer={OUT} inner={IN} x0={140} x1={400} color="paint" cut={cut} look={look('bypass', 'fixed')} ev={ev('bypass:fixed')} />
      <Shell outer={OUT} inner={IN} x0={530} x1={600} color="paint" cut={cut} look={look('bypass', 'fixed')} ev={ev('bypass:fixed')} />
      {/* stałe belki między drzwiami */}
      {centers.map((c, k) => {
        const arc = clipArc(c + W, c + Math.PI / 2 - W, cut);
        return arc ? <Revolved key={`b${k}`} pts={beamPts} t0={arc[0]} t1={arc[1]} color="paint" look={look('bypass', 'fixed')} ev={ev('bypass:fixed')} /> : null;
      })}
      {centers.map((c, k) => {
        const arc = clipArc(c - W, c + W, cut);
        if (!arc) return null;
        const t0 = arc[0] - c;
        const t1 = arc[1] - c;
        return (
          <group key={k} rotation={[c, 0, 0]}>
            <group position={[ax(px), pr, 0]} rotation={[0, 0, -phi]}>
              <group position={[-ax(px), -pr, 0]}>
                <Revolved pts={doorPts} t0={t0} t1={t1} color="paint" look={look('bypass', 'door')} ev={ev('bypass:door')} />
                {/* wewnętrzna strona drzwi – ta powierzchnia zamyka kanał i zawraca strumień */}
                <Revolved pts={skinPts} t0={t0 + 0.02} t1={t1 - 0.02} color="red" look={look('bypass', 'door')} ev={ev('bypass:door')} />
              </group>
              {/* oś obrotu drzwi */}
              <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
                <cylinderGeometry args={[0.03, 0.03, 0.12, 10]} />
                <Mat color="polished" look={look('bypass', 'door')} />
              </mesh>
            </group>
            {shown(c, cut) && (
              <Rod a={[ax(385), pr, 0]} b={[ax(px) + dx * Math.cos(phi), pr - dx * Math.sin(phi), 0]} r={0.022} color="polished" look={look('bypass', 'actuator')} ev={ev('bypass:actuator')} />
            )}
          </group>
        );
      })}
    </>
  );
}

/** Długa gondola silnika o małym obejściu (np. Rolls-Royce Tay) – oba strumienie mieszają się przed wspólną dyszą. */
const LONG_OUT: Tab = [[140, 143], [200, 145], [300, 145], [450, 140], [600, 131], [720, 119], [832, 108]];
export const LONG_IN: Tab = [[140, 124], [200, 126], [300, 124], [450, 119], [600, 114], [720, 106], [790, 100], [832, 99]];
const PLUG_SHORT: Tab = [[690, 40], [740, 44], [765, 46], [790, 40], [815, 24], [840, 0]];

/**
 * Rewers klapowy / czaszowy (np. Fokker 100, Gulfstream): dwie czasze tworzą po złożeniu tylny koniec gondoli.
 * Obracają się wokół osi na bokach dyszy (na wysokości osi silnika) – tylne krawędzie schodzą się za dyszą,
 * a przednie odsuwają, zostawiając szczelinę, przez którą odbity strumień ucieka skośnie do przodu.
 */
/**
 * Powłoka obrotowa przycięta łukiem zależnym od x: kąt od thLo(x) do thHi(x) (0 – góra, rośnie ku +Z).
 * Dwie powierzchnie (zewnętrzna i wewnętrzna) plus krawędzie boczne.
 */
function trimmedShell(outer: Tab, inner: Tab, x0: number, x1: number, thLo: (x: number) => number, thHi: (x: number) => number, nx = 24, nt = 40) {
  const pos: number[] = [];
  const idx: number[] = [];
  const surf = (tab: Tab) => {
    const base = pos.length / 3;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      const r = lerpTable(tab, x) * S;
      const a = thLo(x);
      const b = thHi(x);
      for (let j = 0; j <= nt; j++) {
        const t = a + ((b - a) * j) / nt;
        pos.push(ax(x), r * Math.cos(t), r * Math.sin(t));
      }
    }
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nt; j++) {
        const p = base + i * (nt + 1) + j;
        const q = p + nt + 1;
        idx.push(p, q, p + 1, p + 1, q, q + 1);
      }
    return base;
  };
  const o = surf(outer);
  const n = surf(inner);
  // krawędzie: boczne (j = 0 i j = nt) oraz przednia i tylna
  for (const j of [0, nt])
    for (let i = 0; i < nx; i++) {
      const a = o + i * (nt + 1) + j;
      const b = n + i * (nt + 1) + j;
      idx.push(a, b, a + nt + 1, a + nt + 1, b, b + nt + 1);
    }
  for (const i of [0, nx])
    for (let j = 0; j < nt; j++) {
      const a = o + i * (nt + 1) + j;
      const b = n + i * (nt + 1) + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function BucketReverser({ d, cut, look, ev }: RevProps) {
  const px = 842; // oś obrotu czasz (na bokach dyszy, na wysokości osi silnika)
  const XA = 832;
  const XB = 950;
  const OUT: Tab = [[XA, 108], [XB, 100]];
  const IN: Tab = [[XA, 99], [XB, 93]];
  const rMid = (x: number) => 0.5 * (lerpTable(OUT, x) + lerpTable(IN, x));
  /*
   * Żeby czasze po złożeniu stykały się, a nie przenikały, ich boczne krawędzie są skośne:
   * czasza obejmuje tylko punkty z y ≥ (x − px)·tg φmax. Po obrocie o φmax te krawędzie leżą dokładnie
   * w płaszczyźnie y = 0 – obie czasze schodzą się w „dziób”. Trójkąty po bokach to stałe owiewki gondoli.
   */
  const tanMax = rMid(XB) / (XB - px);
  const phiMax = Math.atan(tanMax);
  const phi = d * phiMax;
  const half = (x: number) => Math.acos(clamp01(((x - px) * tanMax) / rMid(x)));
  const geos = useMemo(() => {
    const upper = trimmedShell(OUT, IN, XA, XB, (x) => -half(x), (x) => half(x));
    const lower = trimmedShell(OUT, IN, XA, XB, (x) => Math.PI - half(x), (x) => Math.PI + half(x));
    const lin = (lo: (x: number) => number, hi: (x: number) => number) => trimmedShell(shiftTab(IN, -1), shiftTab(IN, -2.4), XA + 2, XB - 2, lo, hi);
    const upperLin = lin((x) => -half(x) + 0.03, (x) => half(x) - 0.03);
    const lowerLin = lin((x) => Math.PI - half(x) + 0.03, (x) => Math.PI + half(x) - 0.03);
    const sideA = trimmedShell(OUT, IN, px, XB, (x) => half(x), (x) => Math.PI - half(x), 16, 12);
    const sideB = trimmedShell(OUT, IN, px, XB, (x) => Math.PI + half(x), (x) => 2 * Math.PI - half(x), 16, 12);
    return { upper, lower, upperLin, lowerLin, sideA, sideB };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  return (
    <>
      <Shell outer={LONG_OUT} inner={LONG_IN} x0={140} x1={832} color="paint" cut={cut} look={look('bypass', 'fixed')} ev={ev('bypass:fixed')} />
      {/* stałe boczne owiewki z osiami obrotu */}
      {[geos.sideA, geos.sideB].map((g, i) => (
        <mesh key={i} geometry={g} {...ev('bypass:fixed')}>
          <Mat color="paint" look={look('bypass', 'fixed')} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {[1, -1].map((s) => (
        <group key={s} position={[ax(px), 0, 0]} rotation={[0, 0, -s * phi]}>
          <group position={[-ax(px), 0, 0]}>
            <mesh geometry={s > 0 ? geos.upper : geos.lower} {...ev('nozzle:bucket')}>
              <Mat color="paint" look={look('nozzle', 'bucket')} side={THREE.DoubleSide} />
            </mesh>
            {/* wewnętrzna strona czaszy – przyjmuje gorący strumień */}
            <mesh geometry={s > 0 ? geos.upperLin : geos.lowerLin} {...ev('nozzle:bucket')}>
              <Mat color="heat" look={look('nozzle', 'bucket')} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      ))}
      {/* osie obrotu czasz po obu bokach dyszy */}
      {[1, -1].map((z) => (
        <group key={z}>
          <mesh position={[ax(px), 0, z * 1.1]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.05, 0.05, 0.08, 14]} />
            <Mat color="polished" look={look('nozzle', 'bucket')} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/* ---------------- szczegółowa komora spalania ---------------- */

/*
 * Pierścieniowa komora spalania (jednostki przekroju): za sprężarką dyfuzor z kierownicami wylotowymi,
 * osłony (cowl) dzielące strumień, ściana czołowa z 18 zawirowywaczami i wtryskiwaczami,
 * płomieniówka z otworami pierwotnymi i rozcieńczającymi oraz pierścieniami chłodzenia ścianek.
 * Kanały między płomieniówką a obudowami (zewnętrzną i wewnętrzną) prowadzą powietrze do otworów.
 */
export const LINER_O: Tab = [[461, 58.5], [480, 58.6], [500, 58], [520, 56.5], [540, 55]];
export const LINER_I: Tab = [[461, 38], [480, 38], [500, 38.6], [520, 40], [540, 41]];
export const COMB_HOLES = { primary: 476, dilution: 505, swirl: 48, n: 18 };
const WALL = 1.2;

function HoleRing({ x, wall, n, r, offset, cut, look }: { x: number; wall: Tab; n: number; r: number; offset: number; cut: boolean; look: Look }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const R = lerpTable(wall, x) * S;
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const dirV = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const t = ((k + offset) / n) * Math.PI * 2;
      const vis = shown(t, cut);
      o.position.set(ax(x), R * Math.cos(t), R * Math.sin(t));
      dirV.set(0, Math.cos(t), Math.sin(t));
      o.quaternion.setFromUnitVectors(Y_UP, dirV);
      o.scale.setScalar(vis ? 1 : 0);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [x, n, R, offset, cut]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} raycast={() => null}>
      <cylinderGeometry args={[r, r, (WALL + 1.2) * S, 14]} />
      <meshBasicMaterial color="#07090c" transparent={look.opacity < 0.99} opacity={look.opacity} depthWrite={look.opacity > 0.99} />
    </instancedMesh>
  );
}

/** Świecący gaz w płomieniówce: kilka współosiowych powłok z gradientem temperatury i przezroczystości. */
function HotGas({ comb, cut }: { comb: number; cut: boolean }) {
  const geos = useMemo(
    () =>
      [42, 47, 52, 56].map((rr, si) => {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= 24; i++) {
          const x = 463 + (i / 24) * 80;
          // promień lekko podąża za płomieniówką (zwęża się ku turbinie)
          const lo = lerpTable(LINER_I, Math.min(x, 540)) + 2;
          const hi = lerpTable(LINER_O, Math.min(x, 540)) - 2;
          const k = (rr - 42) / 14;
          pts.push(new THREE.Vector2((lo + (hi - lo) * k) * S, x * S));
        }
        const g = new THREE.LatheGeometry(pts, 96, cut ? V0 - Math.PI / 2 : 0, cut ? CUT_LEN : Math.PI * 2);
        const pos = g.getAttribute('position');
        const colors = new Float32Array(pos.count * 4);
        const c = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getY(i) / S;
          const u = (x - 463) / 80;
          // strefa pierwotna najgorętsza, dalej rozcieńczenie: biało-żółty → pomarańcz → ciemna czerwień
          const T = 2000 - 900 * smoothstep01((u - 0.25) / 0.55);
          c.set(tempColor(T));
          const a = Math.min(1, u / 0.06) * (1 - 0.75 * u) * (si === 1 || si === 2 ? 1 : 0.6);
          colors.set([c.r, c.g, c.b, a], i * 4);
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
        g.rotateZ(-Math.PI / 2);
        g.translate(-X0, 0, 0);
        return g;
      }),
    [cut],
  );
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  if (comb < 0.02) return null;
  return (
    <>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} raycast={() => null}>
          <meshBasicMaterial vertexColors transparent opacity={0.22 + 0.4 * comb} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}
const smoothstep01 = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};

function CombustorDetail({ comb, ignite, cut, look, ev }: { comb: number; ignite: boolean; cut: boolean; look: (id: string, sub?: string) => Look; ev: (id: string) => ClickProps | undefined }) {
  const t0 = cut ? V0 : 0;
  const t1 = cut ? V1 : Math.PI * 2;
  const wall = (tab: Tab, x0: number, x1: number, dr: number) => band(tab, shiftTab(tab, dr), x0, x1, 12);
  const P = useMemo(
    () => ({
      // dyfuzor: kanał za sprężarką rozszerza się, a powietrze zwalnia ze ~120 do ~50 m/s
      diffO: band([[438, 51], [452, 55.5]], [[438, 49.6], [452, 54]], 438, 452, 4),
      diffI: band([[438, 40.4], [452, 40.2]], [[438, 39], [452, 38.8]], 438, 452, 4),
      // osłony (cowl) – łukowate wloty dzielące strumień na część do zawirowywaczy i do kanałów obejściowych
      cowlO: band([[452, 57], [456, 59.4], [461, 60]], [[452, 56], [456, 58.2], [461, 58.6]], 452, 461, 6),
      cowlI: band([[452, 39.4], [456, 37.4], [461, 37.2]], [[452, 38.4], [456, 36.2], [461, 36]], 452, 461, 6),
      dome: [[459.5, 37.4], [461.5, 37.4], [461.5, 59.2], [459.5, 59.2], [459.5, 37.4]] as Tab,
      linerO: wall(LINER_O, 461, 540, WALL),
      linerI: wall(LINER_I, 461, 540, -WALL),
      louvers: [470, 486, 500, 516, 530],
    }),
    [],
  );
  // płomień krótszy i węższy przy małym przepływie paliwa; poniżej ok. 5% gaśnie (zbyt uboga mieszanka)
  const fl = comb > 0.05 ? comb : 0;
  const sw = COMB_HOLES.swirl * S;
  return (
    <group>
      <Revolved pts={P.diffO} t0={t0} t1={t1} color="titanium" look={look('comb', 'diffuser')} ev={ev('comb:diffuser')} />
      <Revolved pts={P.diffI} t0={t0} t1={t1} color="titanium" look={look('comb', 'diffuser')} ev={ev('comb:diffuser')} />
      {/* kierownice wylotowe sprężarki – prostują zawirowany strumień przed dyfuzorem */}
      <BladeRing x={ax(442)} rIn={0.405} rOut={0.495} n={64} color="stator" chord={0.03} twist={-0.5} look={look('comb', 'diffuser')} ev={ev('comb:diffuser')} />
      <Revolved pts={P.cowlO} t0={t0} t1={t1} color="nickel" look={look('comb', 'dome')} ev={ev('comb:dome')} />
      <Revolved pts={P.cowlI} t0={t0} t1={t1} color="nickel" look={look('comb', 'dome')} ev={ev('comb:dome')} />
      <Revolved pts={P.dome} t0={t0} t1={t1} color="nickel" look={look('comb', 'dome')} ev={ev('comb:dome')} />
      {/* płomieniówka: ścianka zewnętrzna i wewnętrzna, żarzące się przy pracy */}
      {[P.linerO, P.linerI].map((pts, i) => (
        <group key={i}>
          <Revolved pts={pts} t0={t0} t1={t1} color="heat" look={look('comb', 'liner')} ev={ev('comb:liner')} />
        </group>
      ))}
      {/* pierścienie chłodzenia (szczeliny filmowe) – powietrze wpływa tu wzdłuż ścianki i tworzy chłodną warstwę */}
      {P.louvers.flatMap((x) => [
        <Revolved key={`o${x}`} pts={[[x - 2, lerpTable(LINER_O, x) - 0.4], [x + 1, lerpTable(LINER_O, x) - 0.4], [x + 1, lerpTable(LINER_O, x) - 2], [x - 2, lerpTable(LINER_O, x) - 0.8], [x - 2, lerpTable(LINER_O, x) - 0.4]]} t0={t0} t1={t1} color="nickel" look={look('comb', 'liner')} ev={ev('comb:liner')} />,
        <Revolved key={`i${x}`} pts={[[x - 2, lerpTable(LINER_I, x) + 0.4], [x + 1, lerpTable(LINER_I, x) + 0.4], [x + 1, lerpTable(LINER_I, x) + 2], [x - 2, lerpTable(LINER_I, x) + 0.8], [x - 2, lerpTable(LINER_I, x) + 0.4]]} t0={t0} t1={t1} color="nickel" look={look('comb', 'liner')} ev={ev('comb:liner')} />,
      ])}
      {/* otwory: pierwotne (mniejsze) i rozcieńczające (większe, przesunięte o pół podziałki) */}
      <HoleRing x={COMB_HOLES.primary} wall={LINER_O} n={COMB_HOLES.n} r={0.017} offset={0.5} cut={cut} look={look('comb', 'liner')} />
      <HoleRing x={COMB_HOLES.primary} wall={LINER_I} n={COMB_HOLES.n} r={0.014} offset={0.5} cut={cut} look={look('comb', 'liner')} />
      <HoleRing x={COMB_HOLES.dilution} wall={LINER_O} n={COMB_HOLES.n} r={0.03} offset={0} cut={cut} look={look('comb', 'liner')} />
      <HoleRing x={COMB_HOLES.dilution} wall={LINER_I} n={COMB_HOLES.n} r={0.024} offset={0} cut={cut} look={look('comb', 'liner')} />
      {/* kolektor paliwa */}
      <mesh position={[ax(448), 0, 0]} rotation={[0, Math.PI / 2, 0]} {...ev('comb:inj')}>
        <torusGeometry args={[1.04, 0.022, 8, 72]} />
        <Mat color="steel" look={look('comb', 'inj')} />
      </mesh>
      {Array.from({ length: COMB_HOLES.n }, (_, k) => {
        const a = (k / COMB_HOLES.n) * Math.PI * 2;
        const vis = shown(a, cut);
        return (
          <group key={k} rotation={[a, 0, 0]}>
            {vis && (
              <>
                {/* trzon wtryskiwacza: od kolektora przez obudowę do ściany czołowej */}
                <mesh position={[ax(450), 0.78, 0]} {...ev('comb:inj')}>
                  <cylinderGeometry args={[0.016, 0.02, 0.52, 8]} />
                  <Mat color="darkSteel" look={look('comb', 'inj')} />
                </mesh>
                <mesh position={[ax(450), 1.04, 0]} {...ev('comb:inj')}>
                  <boxGeometry args={[0.07, 0.05, 0.07]} />
                  <Mat color="steel" look={look('comb', 'inj')} />
                </mesh>
                {/* końcówka wtryskiwacza skierowana do tyłu */}
                <mesh position={[ax(455), sw, 0]} rotation={[0, 0, -Math.PI / 2]} {...ev('comb:inj')}>
                  <cylinderGeometry args={[0.016, 0.026, 0.1, 10]} />
                  <Mat color="polished" look={look('comb', 'inj')} />
                </mesh>
              </>
            )}
            {/* zawirowywacz w ścianie czołowej: kubek z łopatkami */}
            {vis && (
              <group position={[ax(460.5), sw, 0]}>
                <mesh rotation={[0, 0, Math.PI / 2]} {...ev('comb:dome')}>
                  <cylinderGeometry args={[0.055, 0.045, 0.04, 18, 1, true]} />
                  <Mat color="polished" look={look('comb', 'dome')} side={THREE.DoubleSide} />
                </mesh>
                <BladeRing x={0} rIn={0.018} rOut={0.048} n={10} color="steel" chord={0.025} twist={0.9} look={look('comb', 'dome')} ev={ev('comb:dome')} />
              </group>
            )}
            {/* płomień: krótki i szeroki, zakręcony przez zawirowywacz */}
            <group position={[ax(462), sw, 0]}>
              <Flame len={0.12 + 0.2 * fl} r={0.045 + 0.04 * fl} intensity={fl} seed={k} hot={fl} />
            </group>
          </group>
        );
      })}
      <HotGas comb={fl} cut={cut} />
      {/* świece zapłonowe przez obudowę i płomieniówkę zewnętrzną */}
      {[0.2, Math.PI + 0.2].map((a) => (
        <group key={a} rotation={[a, 0, 0]}>
          <group position={[ax(472), 0.69, 0]}>
            <mesh {...ev('comb:ign')}>
              <cylinderGeometry args={[0.022, 0.022, 0.22, 10]} />
              <Mat color="polished" look={look('comb', 'ign')} />
            </mesh>
            <mesh position={[0, 0.12, 0]} {...ev('comb:ign')}>
              <cylinderGeometry args={[0.04, 0.04, 0.05, 6]} />
              <Mat color="steel" look={look('comb', 'ign')} />
            </mesh>
            <group position={[0, -0.11, 0]}>
              <Spark on={ignite} />
            </group>
          </group>
        </group>
      ))}
      <pointLight position={[ax(485), 0.48, 0.2]} color="#ff8a3d" intensity={fl * 6} distance={2.2} decay={2} />
      <pointLight position={[ax(485), -0.48, -0.2]} color="#ff8a3d" intensity={fl * 3} distance={2.2} decay={2} />
    </group>
  );
}

/* ---------------- osprzęt: skrzynka napędów, rozrusznik, regulator paliwa, zapłon ---------------- */

/** Kąt środka wyciętej ćwiartki – osprzęt leży tu, przodem do kamery. */
export const ACC_TH = 1.29;
export const accP = (x: number, r: number, th = ACC_TH): [number, number, number] => [ax(x), r * Math.cos(th), r * Math.sin(th)];
const tubeGeo = (pts: [number, number, number][], r: number) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 64, r, 8, false);

/**
 * Strumień w rurze – powietrze rozruchowe, olej albo paliwo. Wydłużone „krople” ułożone wzdłuż przebiegu rury,
 * w stałych odstępach i z tą samą prędkością liniową w każdej rurze (połączone odcinki płyną równo). Na końcach
 * odcinka krople maleją, żeby nie wyskakiwały znikąd. r – promień rury; opacity – wygląd rury (wyszarzona rura
 * w scenie, która o niej nie mówi, nie pokazuje przepływu); xray – rura schowana w skrzydle lub pylonie.
 */
function PipeFlow({ curve, on, color, speed, r = 0.014, opacity = 1, xray = false }: { curve: THREE.Curve<THREE.Vector3>; on: boolean; color: string; speed: number; r?: number; opacity?: number; xray?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const ph = useRef(0);
  const { n, len } = useMemo(() => {
    const l = curve.getLength();
    return { len: l, n: Math.max(3, Math.round(l / (r * 8))) };
  }, [curve, r]);
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), z: new THREE.Vector3(0, 0, 1), t: new THREE.Vector3() }), []);
  const show = on && opacity > 0.3;
  // w prześwietleniu kropla mieści się w półprzezroczystej rurze, na pełnej rurze lekko z niej wystaje
  const bead = xray ? 0.7 : 1.15;
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    // prędkość liniowa ok. 1,2 j./s przy speed = 1 – niezależna od długości odcinka
    ph.current = (ph.current + (Math.min(dt, 0.05) * speed * 1.2) / len) % 1;
    const { o, z, t } = tmp;
    for (let i = 0; i < n; i++) {
      const u = (i / n + ph.current) % 1;
      const s = show ? Math.min(1, u * 10, (1 - u) * 10) : 0;
      o.position.copy(curve.getPointAt(u));
      o.quaternion.setFromUnitVectors(z, curve.getTangentAt(u, t).normalize());
      o.scale.set(r * bead * s, r * bead * s, r * 2.6 * s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh key={n} args={[undefined, undefined, n]} ref={ref} raycast={() => null} frustumCulled={false} renderOrder={xray ? 12 : 0}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} depthTest={!xray} depthWrite={!xray} transparent={xray} opacity={xray ? 0.9 : 1} />
    </instancedMesh>
  );
}

export interface StartCfg {
  starter: boolean;
  fuel: boolean;
  ign: boolean;
}

/** Koło zębate z zębami, oś wzdłuż X (jak wszystkie koła w skrzynce napędów). */
function gearGeo(r: number, teeth: number, depth: number) {
  const s = new THREE.Shape();
  const ri = r * 0.84;
  const N = teeth * 4;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    // ząb: dwa punkty na obwodzie zewnętrznym, dwa na wewnętrznym
    const rr = i % 4 < 2 ? r : ri;
    if (i === 0) s.moveTo(rr * Math.cos(a), rr * Math.sin(a));
    else s.lineTo(rr * Math.cos(a), rr * Math.sin(a));
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.28, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** Walec osprzętu z osią wzdłuż silnika (od x0 do x1), na promieniu r i kącie th. */
function AccBody({ x0, x1, rad, th, r = 0.865, color, look, ev, open = false, children }: { x0: number; x1: number; rad: number; th: number; r?: number; color: string; look: Look; ev?: ClickProps; open?: boolean; children?: ReactNode }) {
  const p = accP((x0 + x1) / 2, r, th);
  const len = Math.abs(x1 - x0) * S;
  return (
    <group position={p}>
      <mesh rotation={[0, 0, Math.PI / 2]} {...ev}>
        <cylinderGeometry args={[rad, rad, len, 24, 1, open]} />
        <Mat color={color} look={open ? { ...look, opacity: Math.min(look.opacity, 0.35) } : look} side={open ? THREE.DoubleSide : THREE.FrontSide} />
      </mesh>
      {/* kołnierz mocujący do skrzynki */}
      <mesh position={[((x0 < x1 ? -1 : 1) * len) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} {...ev}>
        <cylinderGeometry args={[rad * 1.25, rad * 1.25, 0.012, 24]} />
        <Mat color="darkSteel" look={look} />
      </mesh>
      {children}
    </group>
  );
}

/** Przód i tył skrzynki napędów (j. przekroju) oraz kąty kół zębatych wzdłuż jej łuku. */
const AGB_X0 = 330;
const AGB_X1 = 362;
const AGB_R = 0.865;
const GEARS: [number, number, number][] = [
  // [przesunięcie kątowe od środka, promień koła, liczba zębów]
  [-0.4, 0.05, 13],
  [-0.27, 0.062, 16],
  [-0.135, 0.05, 13],
  [0, 0.062, 16],
  [0.135, 0.05, 13],
  [0.27, 0.062, 16],
  [0.4, 0.05, 13],
];

/**
 * Osprzęt napędzany z wału WP (jak w CFM56/LEAP): koło stożkowe na wale WP → wał promieniowy → skrzynka pośrednia
 * → wałek → łukowa skrzynka napędów (AGB) z rzędem kół zębatych. Na jej przedniej ścianie: rozrusznik pneumatyczny,
 * pompa hydrauliczna i prądnica sterownika (PMA); na tylnej: generator (IDG), pompa olejowa oraz pompa paliwa z
 * regulatorem (HMU). Osie wszystkich urządzeń są równoległe do osi silnika.
 */
function Accessories({ n2, start, duct, fs, ff, feed, look, ev }: { n2: number; start?: StartCfg; duct: boolean; fs: number; ff: number; feed: boolean; look: (id: string, sub?: string) => Look; ev: (id: string) => ClickProps | undefined }) {
  const shaft = useRef<THREE.Group>(null);
  const turbine = useRef<THREE.Group>(null);
  const gearRefs = useRef<(THREE.Group | null)[]>([]);
  const st = start ?? { starter: false, fuel: false, ign: false };
  const live = Boolean(start);
  const C = ACC_TH;
  // prędkości „pokazowe” (prawdziwe są za duże dla oka)
  const w = (n2 / 62) * 6;
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    if (shaft.current) shaft.current.rotation.y += w * 2 * dt;
    gearRefs.current.forEach((g, i) => {
      // sąsiednie koła zazębiają się – obracają się w przeciwne strony, mniejsze szybciej
      if (g) g.rotation.x += (i % 2 ? -1 : 1) * w * (0.062 / GEARS[i][1]) * dt;
    });
    // turbinka rozrusznika kręci się tylko, gdy płynie powietrze (sprzęgło jednokierunkowe odłącza ją po starcie)
    if (turbine.current && st.starter) turbine.current.rotation.x += w * 4 * dt;
  });
  const gears = useMemo(() => GEARS.map(([, r, n]) => gearGeo(r, n, 0.035)), []);
  useEffect(() => () => gears.forEach((g) => g.dispose()), [gears]);
  const geo = useMemo(() => {
    const P = accP;
    const ductPts = [P(520, 1.55, 0), P(470, 1.3, 0.12), P(400, 1.22, 0.55), P(340, 1.1, 0.88), P(305, 0.97, C - 0.27)];
    const fuelPts = [P(402, AGB_R, C + 0.27), P(425, 0.95, C + 0.2), P(446, 1.04, C + 0.12)];
    const leadA = [P(470, 0.95), P(472, 0.93, 1.0), P(472, 0.9, 0.6), P(472, 0.84, 0.25)];
    const leadB = [P(470, 0.95), P(472, 0.93, 1.6), P(472, 0.9, 2.4), P(472, 0.84, Math.PI + 0.2)];
    return {
      duct: tubeGeo(ductPts, 0.042),
      ductCurve: new THREE.CatmullRomCurve3(ductPts.map((p) => new THREE.Vector3(...p))),
      fuel: tubeGeo(fuelPts, 0.014),
      fuelCurve: new THREE.CatmullRomCurve3(fuelPts.map((p) => new THREE.Vector3(...p))),
      leadA: tubeGeo(leadA, 0.011),
      leadB: tubeGeo(leadB, 0.011),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => [geo.duct, geo.fuel, geo.leadA, geo.leadB].forEach((g) => g.dispose()), [geo]);
  // olej krąży, gdy wał WP się obraca; paliwo – gdy płynie do komory (w rozruchu po otwarciu zaworu, w pracy zawsze)
  const oilOn = n2 > 5;
  // paliwo płynie, gdy FF > 0 – tempo kropek rośnie z przepływem (jak wskazanie FF na ECAM)
  const fuelOn = ff > 1;
  const fSpeed = fuelSpeed(ff);
  const ignGlow = st.ign ? 0.6 + 0.4 * Math.sin(performance.now() / 60) : 0;
  const L = (sub: string) => look('acc', sub);
  const E = (sub: string) => ev(`acc:${sub}`);
  const housing: Tab = [[AGB_X0, 78], [AGB_X1, 78], [AGB_X1, 95], [AGB_X0, 95], [AGB_X0, 78]];
  return (
    <group>
      {/* przewód powietrza rozruchowego z pylonu (od APU) i zawór rozrusznika */}
      {duct && (
        <>
          <mesh geometry={geo.duct} {...E('duct')}>
            <Mat color="steel" look={L('duct')} />
          </mesh>
          {live && <PipeFlow curve={geo.ductCurve} on={st.starter} color="#7dd3fc" r={0.042} opacity={L('duct').opacity} speed={0.9} />}
          <group position={accP(400, 1.22, 0.55)} rotation={[0.55, 0, 0]}>
            <mesh rotation={[0.9, 0, 0]} {...E('sav')}>
              <cylinderGeometry args={[0.07, 0.07, 0.1, 18]} />
              <Mat color="darkSteel" look={L('sav')} emissive={st.starter ? '#22c55e' : undefined} emissiveIntensity={st.starter ? 0.8 : 0} />
            </mesh>
            <mesh position={[0, 0.09, 0]} {...E('sav')}>
              <boxGeometry args={[0.07, 0.06, 0.07]} />
              <Mat color="#6b7280" look={L('sav')} />
            </mesh>
          </group>
        </>
      )}
      {/* wał promieniowy: koło stożkowe na wale WP → przez wspornik ramy → skrzynka pośrednia */}
      <group rotation={[C, 0, 0]}>
        <mesh position={[ax(285), 0.16, 0]} {...E('shaft')}>
          <coneGeometry args={[0.06, 0.07, 18]} />
          <Mat color="steel" look={L('shaft')} />
        </mesh>
        <group ref={shaft} position={[ax(285), 0.5, 0]}>
          <mesh {...E('shaft')}>
            <cylinderGeometry args={[0.02, 0.02, 0.66, 12]} />
            <Mat color="polished" look={L('shaft')} />
          </mesh>
          {[-0.2, 0.05, 0.25].map((y) => (
            <mesh key={y} position={[0.024, y, 0]} raycast={() => null}>
              <boxGeometry args={[0.01, 0.07, 0.01]} />
              <Mat color="#38bdf8" look={L('shaft')} />
            </mesh>
          ))}
        </group>
        {/* skrzynka pośrednia (zmienia kierunek napędu o 90°) */}
        <mesh position={[ax(287), AGB_R, 0]} {...E('shaft')}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <Mat color="stator" look={L('shaft')} />
        </mesh>
      </group>
      {/* wałek do skrzynki napędów */}
      <AccBody x0={292} x1={AGB_X0} rad={0.016} th={C} color="polished" look={L('shaft')} ev={E('shaft')} />
      {/* skrzynka napędów: łukowy odlew pokazany półprzezroczyście, w środku rząd kół zębatych */}
      <Revolved pts={housing} t0={C - 0.48} t1={C + 0.48} color="#a3a9b1" look={{ ...L('agb'), opacity: Math.min(L('agb').opacity, 0.4) }} ev={E('agb')} />
      {GEARS.map(([d], i) => (
        <group key={i} position={accP((AGB_X0 + AGB_X1) / 2, AGB_R, C + d)} ref={(g) => (gearRefs.current[i] = g)}>
          <mesh geometry={gears[i]} {...E('agb')}>
            <Mat color={i === 3 ? '#38bdf8' : 'steel'} look={L('agb')} />
          </mesh>
        </group>
      ))}
      {/* przód skrzynki: rozrusznik, pompa hydrauliczna, prądnica sterownika */}
      <AccBody x0={AGB_X0} x1={298} rad={0.072} th={C - 0.27} color="titanium" look={L('starter')} ev={E('starter')} open>
        <group ref={turbine} position={[-0.06, 0, 0]}>
          <BladeRing x={0} rIn={0.02} rOut={0.066} n={18} color="steel" chord={0.025} twist={0.9} look={L('starter')} ev={E('starter')} />
        </group>
        {/* ślimak wlotu powietrza */}
        <mesh position={[-0.06, 0, 0]} rotation={[0, Math.PI / 2, 0]} {...E('starter')}>
          <torusGeometry args={[0.085, 0.022, 10, 32]} />
          <Mat color="titanium" look={L('starter')} emissive={st.starter ? '#38bdf8' : undefined} emissiveIntensity={st.starter ? 0.35 : 0} />
        </mesh>
      </AccBody>
      <AccBody x0={AGB_X0} x1={312} rad={0.045} th={C + 0.27} color="darkSteel" look={L('hyd')} ev={E('hyd')} />
      <AccBody x0={AGB_X0} x1={320} rad={0.038} th={C + 0.4} color="#4b5563" look={L('pma')} ev={E('pma')} />
      {/* tył skrzynki: generator z żebrami, pompa olejowa, pompa paliwa z regulatorem */}
      <AccBody x0={AGB_X1} x1={392} rad={0.074} th={C - 0.13} color="#4b5563" look={L('idg')} ev={E('idg')}>
        {[-0.08, -0.03, 0.02, 0.07].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]} {...E('idg')}>
            <torusGeometry args={[0.075, 0.006, 6, 32]} />
            <Mat color="steel" look={L('idg')} />
          </mesh>
        ))}
      </AccBody>
      <AccBody x0={AGB_X1} x1={376} rad={0.04} th={C - 0.38} color="darkSteel" look={L('lube')} ev={E('lube')} />
      <AccBody x0={AGB_X1} x1={372} rad={0.045} th={C + 0.27} color="darkSteel" look={L('hmu')} ev={E('hmu')} />
      <group rotation={[C + 0.27, 0, 0]}>
        <mesh position={[ax(387), AGB_R, 0]} {...E('hmu')}>
          <boxGeometry args={[0.3, 0.1, 0.12]} />
          <Mat color="#8b6a3e" look={L('hmu')} emissive={st.fuel ? '#f97316' : undefined} emissiveIntensity={st.fuel ? 0.35 : 0} />
        </mesh>
        {[-0.08, 0, 0.08].map((dx) => (
          <mesh key={dx} position={[ax(387) + dx, AGB_R + 0.06, 0]} {...E('hmu')}>
            <cylinderGeometry args={[0.014, 0.014, 0.03, 10]} />
            <Mat color="polished" look={L('hmu')} />
          </mesh>
        ))}
      </group>
      <mesh geometry={geo.fuel} {...E('hmu')}>
        <Mat color="#b45309" look={L('hmu')} />
      </mesh>
      <PipeFlow curve={geo.fuelCurve} on={fuelOn} color="#fb923c" r={0.014} opacity={L('hmu').opacity} speed={fSpeed} />
      {/* wzbudnica zapłonu z żebrami i przewody do świec */}
      <group rotation={[C, 0, 0]}>
        <mesh position={[ax(470), 0.95, 0]} {...E('exciter')}>
          <boxGeometry args={[0.16, 0.07, 0.13]} />
          <Mat color="#57534e" look={L('exciter')} emissive={st.ign ? '#facc15' : undefined} emissiveIntensity={ignGlow} />
        </mesh>
        {[-0.05, -0.017, 0.017, 0.05].map((dz) => (
          <mesh key={dz} position={[ax(470), 0.99, dz]} {...E('exciter')}>
            <boxGeometry args={[0.15, 0.02, 0.006]} />
            <Mat color="#78716c" look={L('exciter')} />
          </mesh>
        ))}
      </group>
      {[geo.leadA, geo.leadB].map((g, i) => (
        <mesh key={i} geometry={g} {...E('exciter')}>
          <Mat color="#a8a29e" look={L('exciter')} emissive={st.ign ? '#facc15' : undefined} emissiveIntensity={ignGlow} />
        </mesh>
      ))}
      <OilAndControls oilOn={oilOn} fuelOn={fuelOn} fSpeed={fSpeed} fs={fs} L={L} E={E} />
      {feed && <FuelFeed on={fuelOn} speed={fSpeed} fs={fs} L={L} E={E} />}
    </group>
  );
}

/** Obiegi oleju i paliwa (rury i kierunki przepływu) – wspólny opis tras, żeby rury, kropki i obejmy szły tą samą linią. */
const C0 = ACC_TH;
const OIL_ROUTES: Record<'supply' | 'press' | 'scav' | 'ret', [number, number, number][]> = {
  // zbiornik → pompa olejowa
  supply: [accP(398, 0.86, C0 - 0.47), accP(388, 0.83, C0 - 0.45), accP(380, 0.84, C0 - 0.4), accP(374, 0.865, C0 - 0.38)],
  // filtr → wzdłuż wspornika ramy (obok wału promieniowego) → przednia komora łożysk
  press: [accP(384, 0.84, C0 - 0.42), accP(360, 0.76, C0 - 0.3), accP(320, 0.78, C0 - 0.14), accP(294, 0.8, C0 - 0.1), accP(289, 0.55, C0 - 0.1), accP(288, 0.26, C0 - 0.1)],
  // komora łożysk → pod skrzynką napędów → wymiennik FCOC
  scav: [accP(288, 0.26, C0 + 0.1), accP(289, 0.58, C0 + 0.1), accP(300, 0.76, C0 + 0.12), accP(346, 0.73, C0 + 0.18), accP(392, 0.8, C0 + 0.36), accP(404, 0.87, C0 + 0.45)],
  // FCOC → z powrotem do zbiornika
  ret: [accP(438, 0.87, C0 + 0.45), accP(442, 0.83, C0 + 0.2), accP(438, 0.82, C0 - 0.2), accP(433, 0.86, C0 - 0.47)],
};
/** Paliwo z pylonu: rura zasilająca → wymiennik FCOC → filtr → pompa z regulatorem (HMU). */
const FUEL_IN: [number, number, number][] = [accP(430, 1.4, 0.25), accP(445, 1.05, C0 + 0.2), accP(446, 0.92, C0 + 0.42), accP(440, 0.89, C0 + 0.45)];
const FUEL_MID: [number, number, number][] = [accP(404, 0.89, C0 + 0.45), accP(398, 0.92, C0 + 0.5), accP(392, 0.93, C0 + 0.52)];
const FUEL_HMU: [number, number, number][] = [accP(392, 0.85, C0 + 0.52), accP(390, 0.84, C0 + 0.4), accP(387, 0.86, C0 + 0.3)];
/**
 * Sterownik EEC siedzi na obudowie wentylatora (chłodniej niż przy rdzeniu, mniej drgań), pod pokrywą wentylatora.
 * Kąt: w wyciętej ćwiartce, bliżej góry. Promienie w obrębie gondoli skalują się z wielkością wentylatora (fs).
 */
export const EEC_X = 200;
export const EEC_TH = ACC_TH - 0.3;
export const EEC_R = 1.765;
/**
 * Wiązki z tylnej ściany EEC (kanał A, kanał B i zapłon): wzdłuż obudowy wentylatora do górnej przegrody kanału
 * obejściowego (bifurkacji przy pylonie), nią w dół do przedziału rdzenia, a dalej pod osłoną rdzenia do PMA,
 * regulatora paliwa i wzbudnicy. Kanały A i B biegną osobno – jedno uszkodzenie nie odcina obu.
 */
function harnessRoutes(fs: number): [number, number, number][][] {
  const trunk = (o: number): [number, number, number][] => [
    accP(EEC_X + 13, EEC_R * fs, EEC_TH + o),
    accP(232, 1.735 * fs, EEC_TH - 0.25 + o),
    accP(252, 1.7 * fs, 0.42 + o),
    accP(272, 1.5 * fs, 0.16 + o),
    accP(292, 1.18 * fs, 0.16 + o),
    accP(312, 0.97, 0.32 + o),
  ];
  return [
    [...trunk(-0.035), accP(322, 0.975, C0 - 0.2), accP(324, 0.97, C0 + 0.2), accP(322, 0.92, C0 + 0.45)],
    [...trunk(0), accP(345, 0.985, C0 - 0.15), accP(380, 0.975, C0 + 0.1), accP(390, 0.97, C0 + 0.27)],
    [...trunk(0.035), accP(360, 0.99, C0 - 0.3), accP(440, 0.99, C0 - 0.2), accP(466, 0.97, C0 - 0.05), accP(470, 0.96, C0)],
  ];
}

/** Przybliżony przepływ paliwa z N1 (kg/h) – gdy scena nie podaje własnego: bieg jałowy ok. 300, start ok. 4000. */
export const ffFromN1 = (n1: number) => (n1 < 15 ? 0 : 280 + 3700 * Math.pow(Math.max(0, Math.min(1, (n1 - 21) / 79)), 1.6));
/** Tempo kropek paliwa: wolno na biegu jałowym, szybko przy pełnym ciągu (pierwiastek – żeby różnice były czytelne). */
const fuelSpeed = (ff: number) => (ff > 1 ? 0.12 + 0.8 * Math.sqrt(Math.min(ff, 6000) / 4000) : 0);

/**
 * Zasilanie paliwem ze skrzydła (prześwietlone – rury biegną w zbiorniku i w pylonie): dwie pompy w zbiorniku,
 * zawór odcinający LP na przednim dźwigarze i przewód w pylonie aż do wymiennika FCOC na silniku.
 */
function FuelFeed({ on, speed, fs, L, E }: { on: boolean; speed: number; fs: number; L: (sub: string) => Look; E: (sub: string) => ClickProps | undefined }) {
  const wy = 2.0 * fs + 0.4;
  const g = useMemo(() => {
    const mid = (sc: number, z: number) => wy + (wgY(sc, z, true) + wgY(sc, z, false)) / 2;
    const xAt = (sc: number, z: number) => wgXle(z) + sc * wgChord(z);
    const pumps: [number, number, number][] = [0.45, -0.45].map((z) => [xAt(0.32, z), mid(0.32, z) - 0.05, z]);
    const valve: [number, number, number] = [xAt(0.13, 0), mid(0.13, 0), 0];
    const pts: [number, number, number][][] = [
      // od każdej pompy do kolektora przy przednim dźwigarze
      [pumps[0], [xAt(0.22, 0.2), mid(0.22, 0.2) - 0.08, 0.2], [valve[0] + 0.2, valve[1] - 0.04, 0.04]],
      [pumps[1], [xAt(0.22, -0.2), mid(0.22, -0.2) - 0.08, -0.2], [valve[0] + 0.2, valve[1] - 0.04, -0.04]],
      // zawór LP → w dół przez pylon → na grzbiet gondoli → do wymiennika FCOC
      [valve, [valve[0] - 0.2, wy + wgY(0.1, 0, false) - 0.25, 0], [ax(520), 1.95 * fs, 0.02], [ax(455), 1.62 * fs, 0.1], FUEL_IN[0]],
    ];
    const tubes = pts.map((p) => tubeGeo(p, 0.024));
    // ścianka rury – ten sam przebieg, odrobinę grubszy i jasny, bardzo przezroczysty (obrys rury wokół rdzenia)
    const shells = pts.map((p) => new THREE.TubeGeometry(curveOf(p), 96, 0.03, 10, false));
    return { pumps, valve, tubes, shells, curves: pts.map(curveOf) };
  }, [wy, fs]);
  useEffect(() => () => [...g.tubes, ...g.shells].forEach((t) => t.dispose()), [g]);
  /** Materiał prześwietlenia: widoczny przez poszycie skrzydła i pylonu, przygaszony razem z resztą osprzętu. */
  const ghost = (color: string, opacity: number, lk: Look) => (
    <meshBasicMaterial color={color} transparent opacity={opacity * Math.max(0.25, lk.opacity)} depthTest={false} depthWrite={false} toneMapped={false} />
  );
  const sub = (i: number) => (i < 2 ? 'boost' : 'feed');
  return (
    <group>
      {g.tubes.map((t, i) => {
        const lk = L(sub(i));
        return (
          <group key={i}>
            {/* wnętrze rury – ciemny rdzeń, na którym dobrze widać płynące paliwo */}
            <mesh geometry={t} renderOrder={11} {...E(sub(i))}>
              {ghost(lk.glow > 0.5 ? '#f59e0b' : '#7c2d12', 0.5, lk)}
            </mesh>
            <mesh geometry={g.shells[i]} renderOrder={11} raycast={() => null}>
              {ghost('#fdba74', 0.16, lk)}
            </mesh>
          </group>
        );
      })}
      {g.curves.map((c, i) => (
        <PipeFlow key={i} curve={c} on={on} color="#fb923c" r={0.024} opacity={L(sub(i)).opacity} speed={speed} xray />
      ))}
      {g.pumps.map((p, i) => (
        <mesh key={i} position={p} renderOrder={11} {...E('boost')}>
          <cylinderGeometry args={[0.07, 0.07, 0.16, 16]} />
          {ghost(on ? '#22c55e' : '#64748b', 0.75, L('boost'))}
        </mesh>
      ))}
      <group position={g.valve}>
        <mesh renderOrder={11} {...E('lpvalve')}>
          <sphereGeometry args={[0.065, 16, 12]} />
          {ghost(on ? '#22c55e' : '#ef4444', 0.8, L('lpvalve'))}
        </mesh>
        <mesh position={[0, 0.08, 0]} renderOrder={11} {...E('lpvalve')}>
          <boxGeometry args={[0.05, 0.06, 0.05]} />
          {ghost('#94a3b8', 0.8, L('lpvalve'))}
        </mesh>
      </group>
    </group>
  );
}

const curveOf = (pts: [number, number, number][]) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));

/** Obejmy na rurze lub wiązce: pierścienie prostopadłe do przebiegu w równych odstępach. */
function Clamps({ curve, n, r, look, ev }: { curve: THREE.Curve<THREE.Vector3>; n: number; r: number; look: Look; ev?: ClickProps }) {
  const items = useMemo(() => {
    const z = new THREE.Vector3(0, 0, 1);
    return Array.from({ length: n }, (_, i) => {
      const u = (i + 1) / (n + 1);
      const q = new THREE.Quaternion().setFromUnitVectors(z, curve.getTangentAt(u).normalize());
      return { p: curve.getPointAt(u), q };
    });
  }, [curve, n]);
  return (
    <>
      {items.map(({ p, q }, i) => (
        <mesh key={i} position={p} quaternion={q} {...ev}>
          <torusGeometry args={[r * 1.45, r * 0.45, 6, 14]} />
          <Mat color="#d4d4d8" look={look} />
        </mesh>
      ))}
    </>
  );
}

/** Rura lub wiązka po trasie, z opcjonalnymi kropkami przepływu i obejmami. */
function Run({ pts, r, color, look, ev, flow, clamps = 0 }: { pts: [number, number, number][]; r: number; color: string; look: Look; ev?: ClickProps; flow?: { on: boolean; color: string; speed: number }; clamps?: number }) {
  const { geo, curve } = useMemo(() => ({ geo: tubeGeo(pts, r), curve: curveOf(pts) }), [pts, r]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <>
      <mesh geometry={geo} {...ev}>
        <Mat color={color} look={look} />
      </mesh>
      {flow && <PipeFlow curve={curve} on={flow.on} color={flow.color} r={r} opacity={look.opacity} speed={flow.speed} />}
      {clamps > 0 && <Clamps curve={curve} n={clamps} r={r} look={look} ev={ev} />}
    </>
  );
}

/** Element w lokalnym układzie przekroju: oś X wzdłuż silnika, Y promieniowo na zewnątrz, Z stycznie. */
function Rad({ x, r, th, children }: { x: number; r: number; th: number; children: ReactNode }) {
  return (
    <group rotation={[th, 0, 0]}>
      <group position={[ax(x), r, 0]}>{children}</group>
    </group>
  );
}

/** Filtr w puszce ustawionej promieniowo, ze wskaźnikiem zapchania. */
function Canister({ rad, h, color, look, ev }: { rad: number; h: number; color: string; look: Look; ev?: ClickProps }) {
  return (
    <>
      <mesh {...ev}>
        <cylinderGeometry args={[rad, rad, h, 20]} />
        <Mat color={color} look={look} />
      </mesh>
      {/* głowica z przyłączami */}
      <mesh position={[0, -h / 2 - 0.012, 0]} {...ev}>
        <boxGeometry args={[rad * 2.4, 0.026, rad * 2.4]} />
        <Mat color="darkSteel" look={look} />
      </mesh>
      {/* pokrywa z sześciokątem do odkręcania */}
      <mesh position={[0, h / 2 + 0.008, 0]} {...ev}>
        <cylinderGeometry args={[rad * 0.45, rad * 0.45, 0.016, 6]} />
        <Mat color="polished" look={look} />
      </mesh>
      {/* wskaźnik zapchania (czerwony przycisk) */}
      <mesh position={[0, -h / 2 - 0.012, rad * 1.25]} rotation={[Math.PI / 2, 0, 0]} {...ev}>
        <cylinderGeometry args={[0.007, 0.007, 0.012, 10]} />
        <Mat color="#dc2626" look={look} />
      </mesh>
    </>
  );
}

/**
 * Obieg oleju (zbiornik, filtr, przewody do komory łożysk i zwrotne), obieg paliwa (pylon → FCOC → filtr → HMU)
 * i sterowanie (EEC z wiązkami). Rury są cienkie i prowadzone pod osłoną rdzenia, jak w prawdziwym silniku.
 */
function OilAndControls({ oilOn, fuelOn, fSpeed, fs, L, E }: { oilOn: boolean; fuelOn: boolean; fSpeed: number; fs: number; L: (sub: string) => Look; E: (sub: string) => ClickProps | undefined }) {
  const harness = useMemo(() => harnessRoutes(fs), [fs]);
  const oilFlow = { on: oilOn, color: '#fbbf24', speed: 0.35 };
  const fuelFlow = { on: fuelOn, color: '#fb923c', speed: fSpeed };
  return (
    <group>
      {/* zbiornik oleju: kapsuła z wziernikiem, wlewem i opaskami mocującymi */}
      <Rad x={415} r={0.89} th={C0 - 0.47}>
        <mesh rotation={[0, 0, Math.PI / 2]} {...E('tank')}>
          <capsuleGeometry args={[0.062, 0.24, 8, 20]} />
          <Mat color="#9aa1aa" look={L('tank')} />
        </mesh>
        {[-0.09, 0.09].map((dx) => (
          <mesh key={dx} position={[dx, 0, 0]} rotation={[0, Math.PI / 2, 0]} {...E('tank')}>
            <torusGeometry args={[0.064, 0.005, 6, 28]} />
            <Mat color="darkSteel" look={L('tank')} />
          </mesh>
        ))}
        {/* wziernik poziomu oleju – bursztynowe okienko z kreskami MIN / MAX */}
        <mesh position={[0.02, 0, 0.061]} {...E('tank')}>
          <boxGeometry args={[0.06, 0.04, 0.006]} />
          <Mat color="#3f3f46" look={L('tank')} />
        </mesh>
        <mesh position={[0.02, -0.004, 0.065]} {...E('tank')}>
          <boxGeometry args={[0.046, 0.022, 0.004]} />
          <Mat color="#f59e0b" look={L('tank')} emissive="#f59e0b" emissiveIntensity={0.25} />
        </mesh>
        {[-0.008, 0.008].map((dy) => (
          <mesh key={dy} position={[0.02, dy, 0.068]} raycast={() => null}>
            <boxGeometry args={[0.05, 0.002, 0.002]} />
            <Mat color="#fafafa" look={L('tank')} />
          </mesh>
        ))}
        {/* wlew z korkiem i dźwignią zatrzasku */}
        <mesh position={[-0.07, 0.065, 0]} {...E('tank')}>
          <cylinderGeometry args={[0.022, 0.022, 0.03, 16]} />
          <Mat color="darkSteel" look={L('tank')} />
        </mesh>
        <mesh position={[-0.07, 0.083, 0]} {...E('tank')}>
          <boxGeometry args={[0.05, 0.008, 0.012]} />
          <Mat color="polished" look={L('tank')} />
        </mesh>
      </Rad>
      {/* filtr oleju za pompą */}
      <Rad x={384} r={0.9} th={C0 - 0.42}>
        <Canister rad={0.032} h={0.1} color="#a1a1aa" look={L('ofilter')} ev={E('ofilter')} />
      </Rad>
      {/* detektor opiłków w korku pompy olejowej */}
      <Rad x={372} r={0.82} th={C0 - 0.38}>
        <mesh {...E('lube')}>
          <cylinderGeometry args={[0.014, 0.014, 0.03, 6]} />
          <Mat color="#fde047" look={L('lube')} />
        </mesh>
      </Rad>
      {/* wymiennik ciepła paliwo–olej: korpus z żebrami i dwiema parami przyłączy */}
      <Rad x={422} r={0.89} th={C0 + 0.45}>
        <mesh {...E('fcoc')}>
          <boxGeometry args={[0.34, 0.085, 0.11]} />
          <Mat color="#8b9199" look={L('fcoc')} />
        </mesh>
        {Array.from({ length: 11 }, (_, i) => (
          <mesh key={i} position={[-0.15 + i * 0.03, 0.05, 0]} {...E('fcoc')}>
            <boxGeometry args={[0.008, 0.018, 0.1]} />
            <Mat color="#b0b6bd" look={L('fcoc')} />
          </mesh>
        ))}
        {[-0.18, 0.18].map((dx) => (
          <mesh key={dx} position={[dx, 0, 0]} rotation={[0, 0, Math.PI / 2]} {...E('fcoc')}>
            <cylinderGeometry args={[0.03, 0.03, 0.03, 16]} />
            <Mat color="darkSteel" look={L('fcoc')} />
          </mesh>
        ))}
      </Rad>
      {/* filtr paliwa */}
      <Rad x={392} r={0.89} th={C0 + 0.52}>
        <Canister rad={0.028} h={0.085} color="#b45309" look={L('ffilter')} ev={E('ffilter')} />
      </Rad>
      {/* sterownik EEC na obudowie wentylatora: płaska skrzynka z żebrami chłodzącymi i rzędem gniazd wiązek (kanał A i B) */}
      <Rad x={EEC_X} r={EEC_R * fs} th={EEC_TH}>
        <mesh {...E('eec')}>
          <boxGeometry args={[0.24, 0.07, 0.17]} />
          <Mat color="#7a8594" look={L('eec')} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[-0.1 + i * 0.028, 0.045, 0]} {...E('eec')}>
            <boxGeometry args={[0.006, 0.02, 0.16]} />
            <Mat color="#9aa4b1" look={L('eec')} />
          </mesh>
        ))}
        {[-0.06, 0, 0.06].map((dz, i) => (
          <mesh key={dz} position={[0.13, 0.005, dz]} rotation={[0, 0, Math.PI / 2]} {...E('eec')}>
            <cylinderGeometry args={[0.017, 0.017, 0.022, 14]} />
            <Mat color={i === 1 ? '#2563eb' : '#a1a1aa'} look={L('eec')} />
          </mesh>
        ))}
        {/* wsporniki do kołnierzy obudowy wentylatora */}
        {[-0.1, 0.1].map((dx) => (
          <mesh key={dx} position={[dx, -0.06, 0]} {...E('eec')}>
            <boxGeometry args={[0.03, 0.05, 0.2]} />
            <Mat color="darkSteel" look={L('eec')} />
          </mesh>
        ))}
        {/* mocowanie na amortyzatorach drgań */}
        {[-0.09, 0.09].flatMap((dx) =>
          [-0.07, 0.07].map((dz) => (
            <mesh key={`${dx}${dz}`} position={[dx, -0.042, dz]} raycast={() => null}>
              <cylinderGeometry args={[0.012, 0.012, 0.014, 10]} />
              <Mat color="#18181b" look={L('eec')} />
            </mesh>
          )),
        )}
      </Rad>
      {/* obieg oleju */}
      <Run pts={OIL_ROUTES.supply} r={0.011} color="#a16207" look={L('oil')} ev={E('oil')} flow={oilFlow} clamps={1} />
      <Run pts={OIL_ROUTES.press} r={0.01} color="#a16207" look={L('oil')} ev={E('oil')} flow={oilFlow} clamps={3} />
      <Run pts={OIL_ROUTES.scav} r={0.012} color="#78350f" look={L('oil')} ev={E('oil')} flow={oilFlow} clamps={3} />
      <Run pts={OIL_ROUTES.ret} r={0.012} color="#78350f" look={L('oil')} ev={E('oil')} flow={oilFlow} clamps={1} />
      {/* obieg paliwa przed regulatorem */}
      <Run pts={FUEL_IN} r={0.016} color="#b45309" look={L('fcoc')} ev={E('fcoc')} flow={fuelFlow} clamps={2} />
      <Run pts={FUEL_MID} r={0.014} color="#b45309" look={L('ffilter')} ev={E('ffilter')} flow={fuelFlow} />
      <Run pts={FUEL_HMU} r={0.014} color="#b45309" look={L('hmu')} ev={E('hmu')} flow={fuelFlow} />
      {/* wiązki elektryczne w oplocie z obejmami */}
      {harness.map((pts, i) => (
        <Run key={i} pts={pts} r={0.009} color="#c8bfa4" look={L('harness')} ev={E('harness')} clamps={4} />
      ))}
    </group>
  );
}

/* ---------------- osprzęt sprężarki: kierownice przestawne, upusty, zawory VBV ---------------- */

/** Ile pierwszych kierownic sprężarki WP jest przestawnych (VSV) – plus kierownica wlotowa (IGV). */
export const VSV_ROWS = 4;
export const IGV_X = 278;
/** Elementy sterowane przez FADEC spoza osprzętu – klikalne w każdej scenie silnika. */
const ALWAYS_CLICKABLE = ['hpc:vsv', 'hpc:bleed', 'lpc:vbv', 'hpt:acc', 'lpt:acc'];

/** Kąt, o który przymykają się VSV, i otwarcie zaworów upustowych VBV przy danym N2 (harmonogram FADEC). */
export const vsvOf = (n2: number) => Math.round(Math.max(0, Math.min(1, (95 - n2) / 40)) * 0.6 * 100) / 100;
export const vbvOf = (n2: number) => Math.max(0, Math.min(1, (80 - n2) / 20));
/** Kąt w przekroju, przy którym leży siłownik VSV (na skraju wyciętej ćwiartki, dobrze widoczny). */
export const VSV_TH = 2.3;

function LeverRing({ x, r, n, pitch, cut, look }: { x: number; r: number; n: number; pitch: number; cut: boolean; look: Look }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    for (let k = 0; k < n; k++) {
      const t = (k / n) * Math.PI * 2;
      o.position.set(ax(x), r * Math.cos(t), r * Math.sin(t));
      o.rotation.set(t, 0, 0);
      // dźwigienka obraca się razem z łopatką kierownicy
      o.rotateY(pitch);
      o.translateX(0.018);
      o.scale.setScalar(shown(t, cut) ? 1 : 0);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [x, r, n, pitch, cut]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} raycast={() => null}>
      <boxGeometry args={[0.045, 0.01, 0.012]} />
      <meshPhysicalMaterial color="#d4d8dd" metalness={0.9} roughness={0.3} transparent={look.opacity < 0.99} opacity={look.opacity} />
    </instancedMesh>
  );
}

function CompressorHardware({ rows, vsv, vbv, cut, look, ev }: { rows: RowSpec[]; vsv: number; vbv: number; cut: boolean; look: (id: string, sub?: string) => Look; ev: (id: string) => ClickProps | undefined }) {
  const t0 = cut ? V0 : 0;
  const t1 = cut ? V1 : Math.PI * 2;
  const vsvX = [IGV_X, ...rows.filter((r) => r.part === 'hpc' && !r.rotor && r.stage <= VSV_ROWS).map((r) => r.x)];
  const hpcSt = rows.filter((r) => r.part === 'hpc' && !r.rotor);
  const bleedX = hpcSt.length ? Array.from(new Set([hpcSt[Math.min(3, hpcSt.length - 1)].x + 6, hpcSt[hpcSt.length - 1].x + 4])) : [];
  const ro = (x: number) => lerpTable(CASE_OUT, x);
  const rect = (x: number, w: number, r0: number, r1: number): Tab => [[x - w, r0], [x + w, r0], [x + w, r1], [x - w, r1], [x - w, r0]];
  const circ = (x: number, rc: number, rr: number): Tab => Array.from({ length: 13 }, (_, i) => [x + rr * Math.cos((i / 12) * Math.PI * 2), rc + rr * Math.sin((i / 12) * Math.PI * 2)] as [number, number]);
  const lk = look('hpc', 'vsv');
  const ta = VSV_TH;
  const P = (x: number, r: number): [number, number, number] => [ax(x), r * S * Math.cos(ta), r * S * Math.sin(ta)];
  const x0 = vsvX[0];
  const x1 = vsvX[vsvX.length - 1];
  return (
    <group>
      {/* kołnierze obudowy na granicach modułów */}
      {[275, 360, 445].map((x) => (
        <Revolved key={x} pts={rect(x, 1.5, ro(x) - 0.5, ro(x) + 2.5)} t0={t0} t1={t1} color="darkSteel" look={look('hpc')} ev={ev('hpc')} />
      ))}
      {/* VSV: pierścienie synchronizujące i dźwigienki każdej kierownicy przestawnej */}
      {vsvX.map((x, i) => (
        <group key={x}>
          <Revolved pts={rect(x + 3.5, 1, ro(x) + 2.6, ro(x) + 4.4)} t0={t0} t1={t1} color="steel" look={lk} ev={ev('hpc:vsv')} />
          <LeverRing x={x} r={(ro(x) + 1.2) * S} n={i === 0 ? 36 : 30 + i * 4} pitch={vsv} cut={cut} look={lk} />
          {/* ramię dźwigni kątowej od wałka sterującego do pierścienia */}
          <Rod a={P(x + 3.5, ro(x) + 4.4)} b={P(x + 3.5 - 4 * Math.sin(vsv), ro(x) + 8)} r={0.008} color="steel" look={lk} ev={ev('hpc:vsv')} />
        </group>
      ))}
      {/* wałek sterujący i siłownik hydrauliczny VSV */}
      <Rod a={P(x0 - 2, ro(x0) + 8)} b={P(x1 + 6, ro(x1) + 8)} r={0.012} color="polished" look={lk} ev={ev('hpc:vsv')} />
      <Rod a={P(x1 + 26, ro(x1) + 8.5)} b={P(x1 + 60, ro(x1 + 60) + 9)} r={0.03} color="darkSteel" look={lk} ev={ev('hpc:vsv')} />
      <Rod a={P(x1 + 6, ro(x1) + 8)} b={P(x1 + 26 + 14 * (vsv / 0.6), ro(x1) + 8.5)} r={0.014} color="polished" look={lk} ev={ev('hpc:vsv')} />
      {/* kolektory upustu powietrza (po 4. stopniu – do instalacji samolotu, za ostatnim – upust WP) */}
      {bleedX.map((x) => (
        <Revolved key={`b${x}`} pts={circ(x, ro(x) + 6, 2.6)} t0={t0} t1={t1} color="#c9cdd2" look={look('hpc', 'bleed')} ev={ev('hpc:bleed')} />
      ))}
      {/* zawory upustowe VBV za sprężarką NP: przy niskich obrotach uchylają się i zrzucają nadmiar powietrza do kanału obejściowego */}
      {Array.from({ length: 12 }, (_, k) => {
        const t = ((k + 0.5) / 12) * Math.PI * 2;
        if (!shown(t, cut)) return null;
        const r = (lerpTable(CORE_OUT, 270) + 0.6) * S;
        return (
          <group key={k} rotation={[t, 0, 0]}>
            <group position={[ax(276), r, 0]} rotation={[0, 0, -vbv * 0.7]}>
              <mesh position={[-0.05, 0, 0]} {...ev('lpc:vbv')}>
                <boxGeometry args={[0.1, 0.012, 0.16]} />
                <Mat color="steel" look={look('lpc', 'vbv')} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}

/* ---------------- łożyska, ramy i chłodzenie obudowy turbiny ---------------- */

/** Łożyska wałów (j. przekroju): x, promień wewn./zewn., typ, wał, punkt podparcia na ramie. */
export const BEARINGS: { id: number; x: number; rIn: number; rOut: number; kind: 'ball' | 'roller'; spool: 'lp' | 'hp'; to: [number, number]; txt: string }[] = [
  { id: 1, x: 160, rIn: 7.5, rOut: 15, kind: 'ball', spool: 'lp', to: [190, 38], txt: 'kulkowe – przenosi ciąg wentylatora na ramę' },
  { id: 2, x: 178, rIn: 7.5, rOut: 15, kind: 'roller', spool: 'lp', to: [190, 38], txt: 'wałeczkowe – tylko siły poprzeczne' },
  { id: 3, x: 288, rIn: 13.5, rOut: 21, kind: 'ball', spool: 'hp', to: [272, 43], txt: 'kulkowe – przejmuje siłę osiową wirnika WP' },
  { id: 4, x: 588, rIn: 13.5, rOut: 21, kind: 'roller', spool: 'hp', to: [596, 34], txt: 'wałeczkowe – podpiera tył wału WP' },
  { id: 5, x: 694, rIn: 7.5, rOut: 15, kind: 'roller', spool: 'lp', to: [698, 33], txt: 'wałeczkowe – w tylnej ramie turbiny' },
];
/** Pierścienie aktywnej regulacji luzów (ACC) na obudowie turbin. */
const ACC_X = [556, 574, 606, 624, 642, 660, 678];
const TRF_X = 698;

function Bearing({ x, rIn, rOut, kind, w, look, ev }: { x: number; rIn: number; rOut: number; kind: 'ball' | 'roller'; w: number; look: Look; ev?: ClickProps }) {
  const cage = useRef<THREE.Group>(null);
  // koszyk z kulkami/wałeczkami obraca się z ok. 0,4 prędkości wału – pokazujemy go wolniej, żeby było widać elementy toczne
  const wc = Math.sign(w) * Math.min(Math.abs(w) * 0.4, 7);
  useFrame((_, dt) => {
    if (cage.current) cage.current.rotation.x += wc * Math.min(dt, 0.05);
  });
  const a = rIn * S;
  const b = rOut * S;
  const rm = (a + b) / 2;
  const e = (b - a) * 0.3;
  const n = kind === 'ball' ? 14 : 18;
  return (
    <group position={[ax(x), 0, 0]}>
      <mesh rotation={[0, Math.PI / 2, 0]} {...ev}>
        <torusGeometry args={[a + e * 0.35, e * 0.45, 8, 48]} />
        <Mat color="polished" look={look} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} {...ev}>
        <torusGeometry args={[b - e * 0.35, e * 0.45, 8, 48]} />
        <Mat color="polished" look={look} />
      </mesh>
      <group ref={cage}>
        {Array.from({ length: n }, (_, k) => {
          const t = (k / n) * Math.PI * 2;
          return kind === 'ball' ? (
            <mesh key={k} position={[0, rm * Math.cos(t), rm * Math.sin(t)]} {...ev}>
              <sphereGeometry args={[e * 0.95, 10, 8]} />
              <Mat color="#e5e7eb" look={look} metal={1} rough={0.12} />
            </mesh>
          ) : (
            <mesh key={k} position={[0, rm * Math.cos(t), rm * Math.sin(t)]} rotation={[0, 0, Math.PI / 2]} {...ev}>
              <cylinderGeometry args={[e * 0.85, e * 0.85, e * 2.6, 10]} />
              <Mat color="#e5e7eb" look={look} metal={1} rough={0.12} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function TurbineShaftHardware({ cut, look, ev, w1, w2, one }: { cut: boolean; look: (id: string, sub?: string) => Look; ev: (id: string) => ClickProps | undefined; w1: number; w2: number; one: boolean }) {
  const t0 = cut ? V0 : 0;
  const t1 = cut ? V1 : Math.PI * 2;
  const circ = (x: number, rc: number, rr: number): Tab => Array.from({ length: 13 }, (_, i) => [x + rr * Math.cos((i / 12) * Math.PI * 2), rc + rr * Math.sin((i / 12) * Math.PI * 2)] as [number, number]);
  const ro = (x: number) => lerpTable(CASE_OUT, x);
  const lk = look('shafts', 'bearing');
  const accTh = 2.65;
  const P = (x: number, r: number): [number, number, number] => [ax(x), r * S * Math.cos(accTh), r * S * Math.sin(accTh)];
  return (
    <group>
      {/* łożyska i stożki podpór (do ram silnika) */}
      {BEARINGS.filter((b) => !(one && b.spool === 'lp')).map((b) => {
        const cone: Tab = [[b.x - 1, b.rOut], [b.x + 1, b.rOut], [b.to[0] + 1, b.to[1]], [b.to[0] - 1, b.to[1]], [b.x - 1, b.rOut]];
        return (
          <group key={b.id}>
            <Bearing x={b.x} rIn={b.rIn} rOut={b.rOut} kind={b.kind} w={b.spool === 'lp' && !one ? w1 : w2} look={lk} ev={ev('shafts:bearing')} />
            <Revolved pts={cone} t0={t0} t1={t1} color="darkSteel" look={look('shafts', 'support')} ev={ev('shafts:support')} />
          </group>
        );
      })}
      {/* tylna rama turbiny: profilowane wsporniki niosące łożysko 5 i prostujące strumień za turbiną NP */}
      {Array.from({ length: 12 }, (_, k) => {
        const t = ((k + 0.5) / 12) * Math.PI * 2;
        if (!shown(t, cut)) return null;
        const r0 = lerpTable(CORE_IN, TRF_X) * S;
        const r1 = lerpTable(CORE3_OUT, TRF_X) * S;
        return (
          <group key={k} rotation={[t, 0, 0]}>
            <mesh position={[ax(TRF_X), (r0 + r1) / 2, 0]} rotation={[0, 0.15, 0]} {...ev('lpt:trf')}>
              <boxGeometry args={[0.14, r1 - r0, 0.022]} />
              <Mat color="nickel" look={look('lpt', 'trf')} />
            </mesh>
          </group>
        );
      })}
      {/* aktywna regulacja luzów: rury wokół obudowy turbin – zimne powietrze z wentylatora kurczy obudowę i zmniejsza szczelinę nad łopatkami */}
      {ACC_X.map((x) => (
        <Revolved key={x} pts={circ(x, ro(x) + 3, 1.5)} t0={t0} t1={t1} color="steel" look={look(x < 590 ? 'hpt' : 'lpt', 'acc')} ev={ev(x < 590 ? 'hpt:acc' : 'lpt:acc')} />
      ))}
      <Rod a={P(552, ro(552) + 7)} b={P(682, ro(682) + 7)} r={0.022} color="steel" look={look('lpt', 'acc')} ev={ev('lpt:acc')} />
      {ACC_X.map((x) => (
        <Rod key={`s${x}`} a={P(x, ro(x) + 4.5)} b={P(x, ro(x) + 7)} r={0.008} color="steel" look={look('lpt', 'acc')} ev={ev('lpt:acc')} />
      ))}
      {/* zawór ACC sterowany przez FADEC */}
      <mesh position={P(560, ro(560) + 10)} {...ev('lpt:acc')}>
        <boxGeometry args={[0.1, 0.06, 0.06]} />
        <Mat color="#9a6b3b" look={look('lpt', 'acc')} />
      </mesh>
    </group>
  );
}

/**
 * Długa gondola silnika o małym obejściu (BPR ≈ 0,2–2, np. JT8D, Spey): kanał obejściowy biegnie do końca
 * i oba strumienie wychodzą wspólną dyszą. Kształt zależy od skali wentylatora fs – im mniejsze obejście, tym węższy kanał.
 */
export function longDuctTables(fs: number) {
  const g = 6 + 34 * Math.max(0, Math.min(1, (fs - 0.5) / 0.35));
  const r0in = lerpTable(NAC3_IN, 140) * fs;
  const r0out = lerpTable(NAC3_OUT, 140) * fs;
  const inner: Tab = [];
  const outer: Tab = [];
  const in690 = lerpTable(COWL3, 690) + g;
  const inEnd = Math.max(64 + g * 0.6, 72);
  for (let x = 140; x <= 832; x += 8) {
    let r: number;
    if (x < 200) r = r0in + ((lerpTable(COWL3, 200) + g - r0in) * (x - 140)) / 60;
    else if (x <= 690) r = lerpTable(COWL3, x) + g;
    else r = in690 + ((inEnd - in690) * (x - 690)) / 142;
    const th = r0out - r0in + ((8 - (r0out - r0in)) * Math.min(1, (x - 140) / 220));
    inner.push([x, r]);
    outer.push([x, r + th]);
  }
  return { inner, outer };
}

function LongDuct({ fs, cut, look, ev }: { fs: number; cut: boolean; look: (id: string, sub?: string) => Look; ev: (id: string) => ClickProps | undefined }) {
  const { inner, outer } = useMemo(() => longDuctTables(fs), [fs]);
  return <Shell outer={outer} inner={inner} x0={140} x1={832} color="paint" cut={cut} look={look('bypass', 'fixed')} ev={ev('bypass:fixed')} />;
}

/* ---------------- skrzydło samolotu szerokokadłubowego i pylon ---------------- */

/*
 * Wycinek skrzydła samolotu nad silnikiem. Rozpiętość wycinka: od boku kadłuba (z < 0, żebro przykadłubowe)
 * do takiej samej odległości na zewnątrz silnika (z > 0, poszarpana krawędź). Skos krawędzi natarcia ok. 32°,
 * krawędź spływu do silnika prawie prosta, dalej skośna (charakterystyczne załamanie), wznios ok. 6°,
 * profil nadkrytyczny o grubości ok. 10,5%. Jednostki: sceny (1 m ≈ 1,1 j.).
 * Układ lokalny skrzydła: x – oś silnika (świat), y – w górę (0 = spód skrzydła przy silniku), z – rozpiętość.
 */
const WG_XLE0 = 0.6; // krawędź natarcia nad osią silnika
const WG_SWEEP = 0.62; // tg 32°
const WG_DIH = 0.105; // tg 6°
export const wgChord = (z: number) => (z < 0 ? 10.5 + 4.0 * (-z / 7.4) : 10.5 - 2.9 * (z / 7.4));
export const wgXle = (z: number) => WG_XLE0 + WG_SWEEP * z;
/** Profil na jednostkę cięciwy: górna i dolna powierzchnia (płaska góra, „podcięty” tył – profil nadkrytyczny). */
function wgProf(s: number) {
  const q = Math.max(0, Math.min(1, s));
  const t = 0.105;
  const yt = 5 * t * (0.2969 * Math.sqrt(q) - 0.126 * q - 0.3516 * q * q + 0.2843 * q ** 3 - 0.1036 * q ** 4);
  const yc = 0.018 * Math.sin(Math.PI * Math.pow(q, 0.75)) + 0.012 * Math.max(0, q - 0.6) * 2.5 * (1 - q) * 2;
  return { u: yc + yt * 0.92, l: yc - yt * 1.08 };
}
const WG_LREF = wgProf(0.35).l;
/** Wysokość (lokalna) powierzchni skrzydła w punkcie (s, z). */
export const wgY = (s: number, z: number, upper: boolean) => {
  const c = wgChord(z);
  const p = wgProf(s);
  return WG_DIH * z + c * ((upper ? p.u : p.l) - WG_LREF);
};

/**
 * Pylon silnika samolotu szerokokadłubowego: wąski przód na grzbiecie gondoli, wznosi się aż do krawędzi natarcia i wchodzi
 * w spód skrzydła; za gondolą tylna owiewka schodzi nisko nad dyszę rdzenia, a jej dolna, trójkątna część
 * to brązowa osłona termiczna (żaroodporny stop) nad gorącym strumieniem.
 */
function PylonWide({ nacTop, nacEnd, wingY, look, ev, fs }: { nacTop: (xs: number) => number; nacEnd: number; wingY: number; look: Look; ev?: ClickProps; fs: number }) {
  const geos = useMemo(() => {
    const xF = 262; // przód pylonu na gondoli
    const xLEs = (WG_XLE0 + 4.4) / 0.01; // krawędź natarcia skrzydła (j. przekroju)
    const xEnd = 1180;
    const wingLow = (xs: number) => wingY + wgY(Math.max(0, Math.min(1, (ax(xs) - WG_XLE0) / wgChord(0))), 0, false);
    const top = (xs: number) => {
      if (xs >= xLEs) return wingLow(xs) + 0.3; // schowany w skrzydle
      const a = nacTop(xF) + 0.06;
      const b = wingLow(xLEs) + 0.3;
      const u = (xs - xF) / (xLEs - xF);
      return a + (b - a) * Math.pow(u, 0.85);
    };
    const coreTop = (xs: number) => (xs < 945 ? Math.max(lerpTable(COWL3, Math.min(xs, 765)), xs > 765 ? lerpTable(PLUG3, xs) : 0) * S : 0);
    const apf: Tab = [
      [nacEnd, nacTop(nacEnd) - 0.04],
      [nacEnd + 70, Math.max(coreTop(nacEnd + 70) + 0.18, 0.95)],
      [nacEnd + 170, Math.max(coreTop(nacEnd + 170) + 0.16, 0.74)],
      [nacEnd + 300, 0.82],
      [nacEnd + 420, 1.35],
      [xEnd, wingLow(xEnd) + 0.29],
    ];
    const bot = (xs: number) => (xs <= nacEnd ? nacTop(xs) - 0.04 : Math.min(lerpTable(apf, xs), top(xs) - 0.002));
    const k = Math.sqrt(fs);
    const half = (xs: number) => lerpTable([[xF, 0.0], [xF + 12, 0.09], [xF + 70, 0.2], [xLEs, 0.3], [nacEnd + 150, 0.28], [nacEnd + 380, 0.18], [xEnd - 30, 0.08], [xEnd, 0.0]], xs) * k;
    const body = loftGeometry(xF, xEnd, top, bot, half, 80, 32);
    // osłona termiczna: dolny klin tylnej owiewki nad strumieniem rdzenia
    const hs0 = nacEnd + 40;
    const hs1 = nacEnd + 360;
    const shield = loftGeometry(hs0, hs1, (xs) => bot(xs) + 0.32 * Math.sin((Math.PI * (xs - hs0)) / (hs1 - hs0)) + 0.02, (xs) => bot(xs) - 0.012, (xs) => half(xs) + 0.01, 40, 28);
    return { body, shield };
  }, [nacTop, nacEnd, wingY, fs]);
  useEffect(() => () => [geos.body, geos.shield].forEach((g) => g.dispose()), [geos]);
  return (
    <group>
      <mesh geometry={geos.body} {...ev}>
        <Mat color="paint" look={look} />
      </mesh>
      <mesh geometry={geos.shield} {...ev}>
        <Mat color="#7a4a38" look={look} metal={0.55} rough={0.62} />
      </mesh>
    </group>
  );
}

/* ---------------- model ---------------- */

export interface ReverserCfg {
  type: 'kaskadowy' | 'drzwiowy' | 'klapowy';
  deploy: number;
}
export interface AfterburnerCfg {
  on: boolean;
  nozzle: number;
}

export interface EngineModelProps {
  /** Obroty wałów w % (N1 – wentylator i wał NP, N2 – wał WP). */
  n1?: number;
  n2?: number;
  /** Mnożnik prędkości wizualnej obrotu. */
  spinScale?: number;
  cut?: boolean;
  /** 0 – złożony, 1 – rozłożony. */
  explode?: number;
  /** Moduły, które można kliknąć (domyślnie wszystkie); [] – model nie reaguje na kliknięcia. */
  clickable?: string[];
  /** Moduły, które po kliknięciu w widoku rozłożonym rozsuwają się dalej (domyślnie wszystkie). */
  explodable?: string[];
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  /** Podzespoły pozostające w pełni widoczne (pozostałe półprzezroczyste). */
  focus?: string[];
  flow?: FlowMode | false;
  flowSpeed?: number;
  labels?: boolean;
  /** Skala promieniowa gondoli i wentylatora (1 – BPR ≈ 5). 0 – brak wentylatora i gondoli. */
  fanScale?: number;
  hpcStages?: number;
  spools?: SpoolCfg;
  /** Kolory wirników według wałów zamiast według podzespołów. */
  colorBySpool?: boolean;
  combustion?: number;
  /** Szczegółowa komora spalania (dyfuzor, osłony, zawirowywacze, otwory płomieniówki) – domyślnie włączona; w widoku rozłożonym zwykła. */
  combDetail?: boolean;
  ignite?: boolean;
  reverser?: ReverserCfg;
  /** Przestawne kierownice (VSV) i zawory upustowe (VBV) sterowane według N2; false – zablokowane (VSV otwarte, VBV zamknięte). */
  variableGeom?: boolean;
  /** Długa gondola z mieszaniem strumieni (silnik o małym obejściu). */
  longDuct?: boolean;
  /** Tryb rentgen: gondola i obudowy półprzezroczyste. */
  xray?: boolean;
  /** Dodatkowe podpisy elementów w scenach, które o nich mówią: 'comb', 'rev', 'ab'. */
  elementLabels?: string[];
  /** Liczba łopat wentylatora (wąskie tytanowe – dużo, szerokie kompozytowe – mało). */
  fanBlades?: number;
  /** Wycinek skrzydła nad pylonem (domyślnie widoczny). */
  wing?: boolean;
  /** Uszkodzenie wentylatora: 0 – brak, 1 – zgięte łopaty, 2 – urwana łopata. */
  fanDamage?: number;
  /** Stan instalacji rozruchowej (krok „rozruch”) – bez niego osprzęt jest statyczny. */
  start?: StartCfg;
  /** Osprzęt (skrzynka napędów, rozrusznik itd.) – domyślnie widoczny w przekroju. */
  accessories?: boolean;
  /**
   * Przepływ paliwa do silnika w kg/h – ta sama wartość, którą pokazuje FF na stronie ENG na ECAM. Od niej zależy
   * tempo kropek w całej instalacji paliwowej (od pomp w zbiorniku skrzydła do wtryskiwaczy); 0 – paliwo nie płynie.
   * Bez podania: przybliżenie z N1 (bieg jałowy ok. 300 kg/h).
   */
  fuelFlow?: number;
  /** Zasilanie paliwem ze skrzydła (pompy w zbiorniku, zawór LP, przewód w pylonie) – domyślnie razem z kawałkiem skrzydła. */
  feed?: boolean;
  afterburner?: AfterburnerCfg;
  /** Które strumienie pokazać w przepływie. */
  stream?: 'both' | 'cold' | 'hot';
  /**
   * Szczegóły wnętrza (wieńce łopatek, komora spalania, turbiny, wały, osprzęt, przepływ). false – tylko to, co
   * widać z zewnątrz (gondola, wentylator, osłona rdzenia, dysza): silnik w widoku całego samolotu nie obciąża sceny,
   * a wnętrze doładowuje się dopiero po wejściu do modułu silnika i zwalnia po wyjściu.
   */
  detail?: boolean;
  /** Co zawiesić na pylonie (w jednostkach silnika, fs – skala gondoli): kawałek samolotu ze skrzydłem. */
  mount?: (fs: number) => ReactNode;
  /** Własne otoczenie do odbić (wyłączone, gdy scena ma wspólne – np. cały samolot z dwoma silnikami). */
  env?: boolean;
}

export function EngineModel(props0: EngineModelProps) {
  // złota zasada modułów: w zakładkach > 0 części silnika nie są klikalne i nie mają podpisów
  const home = useModuleHome();
  const props: EngineModelProps = home ? props0 : { ...props0, onSelect: undefined, selected: null, labels: false, clickable: [] };
  const {
    n1 = 60,
    n2 = 85,
    spinScale = 1,
    cut = true,
    explode = 0,
    explodable,
    clickable,
    selected = null,
    onSelect,
    focus,
    flow = 'plain',
    flowSpeed = 0.9,
    labels = true,
    fanScale = 1,
    hpcStages = 9,
    spools = 'tf2',
    colorBySpool = false,
    combustion = 0.6,
    combDetail = true,
    ignite = false,
    reverser,
    start,
    fanDamage = 0,
    wing = true,
    fanBlades = 18,
    elementLabels,
    xray = false,
    longDuct = false,
    variableGeom = true,
    accessories = true,
    fuelFlow,
    feed,
    afterburner,
    stream = 'both',
    env = true,
    mount,
    detail = true,
  } = props;
  const selPart = selected ? selected.split(':')[0] : null;
  const rows = useMemo(() => buildRows(hpcStages, spools), [hpcStages, spools]);
  const hasFan = fanScale > 0.05 && spools !== 'jet1';

  // płynne rozkładanie: moduły + dodatkowe rozsunięcie wybranego modułu
  const targets: Record<string, number> = { ex: explode };
  // dalej rozsuwa się tylko moduł kluczowy dla danego kroku (explodable); inne można kliknąć, ale tylko po opis
  for (const id of Object.keys(EXPLODE)) targets[`s_${id}`] = explode > 0.01 && selPart === id && (!explodable || explodable.includes(id)) ? 1 : 0;
  const sm = useSmoothRecord(targets);
  const ex = sm.ex;
  /*
   * Gdy moduł rozsuwa się na wieńce, rośnie jego długość – sąsiedzi odsuwają się o tyle samo:
   * wszystko przed nim do przodu, wszystko za nim do tyłu, żeby części na siebie nie nachodziły.
   */
  const push = (id: string) => {
    if (!SPAN[id]) return 0;
    const cq = (SPAN[id][0] + SPAN[id][1]) / 2;
    let d = 0;
    for (const p of Object.keys(SPAN)) {
      const s = sm[`s_${p}`] ?? 0;
      if (p === id || s < 1e-3) continue;
      const [a, b] = SPAN[p];
      const cp = (a + b) / 2;
      d += Math.sign(cq - cp) * ((b - a) * 0.5 * S * 1.6 + 0.45) * s;
    }
    return d;
  };
  // obudowy odsuwają się szybko już przy małym rozłożeniu (np. „Rozłóż komorę”), żeby nie zasłaniały wnętrza
  const casingDrop = CASING_DROP * Math.min(1, ex * 2.5);
  const off = (id: string): [number, number, number] => [EXPLODE[id][0] * ex + push(id), EXPLODE[id][1] * ex, (EXPLODE[id][2] ?? 0) * ex];
  const spread = (id: string) => ex * 0.45 + (sm[`s_${id}`] ?? 0) * 1.6;
  /*
   * Przesunięcia części dla numerów zakładek: dwie pozycje – złożony (zera) i rozłożony (przesunięcia części).
   * Zapisuje model, który jest rozłożony; złożony zeruje je, gdy nikt inny ich nie trzyma. Model zeruje je też
   * przy zniknięciu (np. przejście do innej zakładki w trakcie rozłożenia) i po zakończeniu składania – inaczej
   * numery zostałyby „w powietrzu”, tam gdzie były części rozłożonego silnika.
   */
  const offsetKey = useRef({}).current;
  const zeroOffsets = () => {
    partOffsetOwner = null;
    for (const id of Object.keys(EXPLODE)) ENGINE_PART_OFFSET[id] = [0, 0, 0];
  };
  if (ex > 1e-3) {
    partOffsetOwner = offsetKey;
    for (const id of Object.keys(EXPLODE)) ENGINE_PART_OFFSET[id] = off(id);
  } else if (partOffsetOwner === offsetKey || partOffsetOwner === null) zeroOffsets();
  useEffect(
    () => () => {
      if (partOffsetOwner === offsetKey) zeroOffsets();
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useFrame(() => {
    // składanie kończy się bez przerysowania – wtedy zerujemy tutaj
    if (partOffsetOwner === offsetKey && sm.ex <= 1e-3) zeroOffsets();
  });

  const look = (id: string, sub?: string): Look => {
    const full = sub ? `${id}:${sub}` : id;
    const isSelExact = selected === full;
    if (selPart) {
      if (selPart !== id) return { opacity: 0.14, glow: 0 };
      return { opacity: 1, glow: isSelExact ? 1 : 0.08 };
    }
    if (focus && !focus.includes(id)) return { opacity: 0.18, glow: 0 };
    // rentgen: gondola i wlot półprzezroczyste, widać wnętrze bez wycinania
    if (xray && (id === 'bypass' || id === 'wlot')) return { opacity: 0.2, glow: 0 };
    return { opacity: 1, glow: 0 };
  };
  /** Wygląd obudów rdzenia – w trybie rentgen półprzezroczyste, łopatki i komora zostają pełne. */
  const caseLook = (id: string, sub?: string): Look => (xray && !selPart ? { opacity: 0.18, glow: 0 } : look(id, sub));
  // klikać można części ważne w danym kroku (clickable); osprzęt i elementy sterowane przez FADEC (instalacja paliwowa,
  // olejowa, EEC z wiązkami, VSV, VBV, ACC) są klikalne w każdej scenie, w której je widać – reszta nie reaguje
  const canClick = (id: string) => Boolean(onSelect) && (!clickable || clickable.includes(id.split(':')[0]) || id.startsWith('acc') || ALWAYS_CLICKABLE.includes(id));
  const ev = (id: string): ClickProps | undefined =>
    canClick(id)
      ? {
          onClick: (e) => {
            e.stopPropagation();
            if (e.delta > 6) return;
            onSelect?.(selected === id ? null : id);
          },
          onPointerOver: (e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          },
          onPointerOut: () => {
            document.body.style.cursor = '';
          },
        }
      : undefined;
  useEffect(() => () => void (document.body.style.cursor = ''), []);

  // prawdziwe prędkości obrotu (rad/s) dla silnika klasy CFM LEAP: N1 100% ≈ 3900 obr/min, N2 100% ≈ 19 400 obr/min
  const RPM = (2 * Math.PI) / 60;
  const w1 = (n1 / 100) * 3894 * RPM * spinScale;
  const w2 = (n2 / 100) * 19391 * RPM * spinScale;
  const wIp = (n2 / 100) * 10500 * RPM * spinScale;
  const wFan = spools === 'gtf' ? w1 * 0.35 : w1;
  const wLp = spools === 'gtf' ? w1 * 1.1 : w1;
  const spinOf = (s: RowSpec['spool']) => (s === 'hp' ? w2 : s === 'ip' ? wIp : s === 'lp' ? (spools === 'jet1' ? w2 : wLp) : 0);
  // realistyczne stopy: tytan z przodu, stal/nikiel z tyłu sprężarki, powłoka ceramiczna w turbinie WP
  const partColor: Record<string, string> = { lpc: 'titanium', hpc: 'titanium', hpt: 'tbc', lpt: 'nickel' };

  const rowX = (r: RowSpec) => {
    const [a, b] = RANGE[r.part];
    const c = (a + b) / 2;
    return ax(c + (r.x - c) * (1 + spread(r.part)));
  };

  // geometria zmienna sprężarki
  const vsv = variableGeom ? vsvOf(n2) : 0;
  const vbv = variableGeom ? vbvOf(n2) : 0;
  // rewers
  const rv = reverser;
  // dopalacz – wtedy cały silnik jest wojskowy: smukły kadłub, wielostopniowy wentylator, mieszalnik
  const ab = afterburner;
  const mil = Boolean(ab);
  const comb = Math.max(0, Math.min(1, combustion));
  const fs = hasFan ? fanScale : 1;
  // grzbiet gondoli (dla pylonu), koniec gondoli i wysokość skrzydła
  const nacEnd = rv?.type === 'klapowy' || longDuct ? 832 : 600;
  const nacTop = useMemo(() => {
    if (rv?.type === 'klapowy') return (xs: number) => lerpTable(LONG_OUT, Math.min(xs, 832)) * S;
    if (longDuct) {
      const o = longDuctTables(fs).outer;
      return (xs: number) => lerpTable(o, Math.min(xs, 832)) * S;
    }
    return (xs: number) => lerpTable(NAC3_OUT, Math.min(xs, 600)) * fs * S;
  }, [rv?.type, longDuct, fs]);
  const wingY = 2.0 * fs + 0.4;
  // opływ zewnętrzny: wokół gondoli (albo osłony rdzenia w silniku bez wentylatora); pod kadłubem myśliwca go nie ma,
  // a przy otwartym rewersie zasłaniałby odwrócony strumień
  const outerFlow = useMemo<OuterFlowCfg | null>(() => {
    if (mil || (rv && rv.deploy > 0.05)) return null;
    if (!hasFan) return { nac: (xs: number) => lerpTable(COWL3, Math.max(64, Math.min(xs, 765))) * S, end: 765, wingY: null };
    return { nac: nacTop, end: nacEnd, wingY: wing && mount ? wingY : null };
  }, [mil, rv, hasFan, nacTop, nacEnd, wing, wingY]);

  const sel = (id: string) => (canClick(id) ? () => onSelect?.(selected === id ? null : id) : undefined);

  return (
    <group>
      {/* otoczenie do odbić na metalu – generowane na miejscu (bez pobierania plików HDR) */}
      {env && <Environment resolution={256} frames={1}>
        <Lightformer intensity={2.2} position={[0, 6, -4]} scale={[14, 5, 1]} color="#ffffff" />
        <Lightformer intensity={1.2} position={[-7, 2, 5]} rotation-y={Math.PI / 3} scale={[10, 3, 1]} color="#dbeafe" />
        <Lightformer intensity={0.9} position={[7, -1, 4]} rotation-y={-Math.PI / 3} scale={[8, 6, 1]} color="#ffedd5" />
        <Lightformer form="ring" intensity={1.4} position={[0, 0, 9]} scale={5} color="#ffffff" />
        <Lightformer intensity={0.5} position={[0, -6, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} color="#64748b" />
      </Environment>}
      {/* ---------- wycinek skrzydła nad pylonem ---------- */}
      {/* pylon i wycinek skrzydła samolotu – oba odjeżdżają razem z gondolą przy rozłożeniu */}
      {hasFan && !mil && (
        <group position={off('bypass')}>
          <PylonWide nacTop={nacTop} nacEnd={nacEnd} wingY={wingY} fs={fs} look={look('bypass', 'pylon')} ev={ev('bypass:pylon')} />
          {/* samolot (ten sam model co w widoku całości) zawieszony na pylonie – w scenach silnika przycięty do kawałka skrzydła */}
          {mount?.(fs)}
        </group>
      )}
      {/* ---------- silnik z dopalaczem: smukły kadłub od wlotu po dyszę, bez gondoli i pylonu ---------- */}
      {mil && <MilCasing cut={cut} look={look} ev={ev} pos={off('bypass')} />}
      {/* ---------- gondola: wlot + kanał obejściowy (skalowane promieniowo) ---------- */}
      {hasFan && !mil && (
        <group scale={[1, fs, fs]}>
          <group position={off('wlot')}>
            <Shell outer={NAC3_OUT} inner={NAC3_IN} x0={64} x1={76} lip={LIP} color="lip" cut={cut} look={look('wlot', 'lip')} ev={ev('wlot:lip')} />
            <Shell outer={NAC3_OUT} inner={NAC3_IN} x0={76} x1={140} color="paint" cut={cut} look={look('wlot', 'lip')} ev={ev('wlot:lip')} />
            <NacelleDetails inlet cut={cut} look={look('wlot', 'lip')} ev={ev('wlot:lip')} />
            {/* panele dźwiękochłonne we wlocie i pas ścieralny nad końcami łopat wentylatora (lekko odsunięte od ścianki) */}
            <Revolved pts={band(shiftTab(NAC3_IN, -0.6), shiftTab(NAC3_IN, -1.6), 92, 136, 10)} t0={cut ? V0 : 0} t1={cut ? V1 : Math.PI * 2} color="liner" look={look('wlot', 'liner')} ev={ev('wlot:liner')} />
            <Revolved pts={band(shiftTab(NAC3_IN, -0.6), shiftTab(NAC3_IN, -1.4), 140, 166, 8)} t0={cut ? V0 : 0} t1={cut ? V1 : Math.PI * 2} color="#5b6470" look={look('wlot', 'liner')} ev={ev('wlot:liner')} />
          </group>
          <group position={off('bypass')}>
            {rv?.type === 'kaskadowy' ? (
              <CascadeReverser d={rv.deploy} cut={cut} look={look} ev={ev} />
            ) : rv?.type === 'drzwiowy' || rv?.type === 'klapowy' || longDuct ? null : (
              // zwykła gondola = złożony rewers kaskadowy (jak w LEAP i naszym silniku): widać drzwi blokujące i cięgła w kanale
              <>
                <CascadeReverser d={0} cut={cut} look={look} ev={ev} teach={false} />
                <NacelleDetails inlet={false} cut={cut} look={look('bypass', 'fixed')} ev={ev('bypass:fixed')} />
                <Bifurcations fs={fs} look={look('bypass', 'bifi')} ev={ev('bypass:bifi')} />
              </>
            )}
          </group>
        </group>
      )}
      {/* rewers klapowy: silnik o małym obejściu – długa gondola aż do wspólnej dyszy, za nią dwie czasze */}
      {/* małe obejście: długa gondola do wspólnej dyszy */}
      {hasFan && longDuct && !rv && !mil && <LongDuct fs={fs} cut={cut} look={look} ev={ev} />}
      {hasFan && rv?.type === 'klapowy' && <BucketReverser d={rv.deploy} cut={cut} look={look} ev={ev} />}
      {/* rewers drzwiowy: drzwi rysowane bez skalowania grupy (obrót w skalowanej grupie by je ścinał) */}
      {hasFan && rv?.type === 'drzwiowy' && <PivotDoorReverser d={rv.deploy} cut={cut} look={look} ev={ev} k={fs} />}


      {/* ---------- wentylator ---------- */}
      {hasFan && (
        <group position={off('fan')}>
          <group position={[-(spread('fan') * 0.3), 0, 0]}>
            <SpinnerRotor w={wFan} look={look('fan', 'spinner')} ev={ev('fan:spinner')} />
          </group>
          <Shell outer={CORE_IN} x0={150} x1={196} color="darkSteel" cut={false} look={look('fan')} ev={ev('fan:spinner')} />
          {mil ? (
            <>
              {/* wentylator wojskowy: trzy stopnie wąskich, tytanowych łopat – mała średnica, duży spręż */}
              {[0, 1, 2].map((i) => (
                <BladeRing key={`r${i}`} x={ax(146 + i * 18) + spread('fan') * 0.25 * i} rIn={0.36 + i * 0.06} rOut={MIL_FAN_R - i * 0.03} n={30 + i * 4} color={colorBySpool ? SPOOL_COLOR.fan : 'titanium'} chord={0.1} twist={0.85} spin={wFan} look={look('fan', 'blades')} ev={ev('fan:blades')} />
              ))}
              {[0, 1, 2].map((i) => (
                <BladeRing key={`s${i}`} x={ax(155 + i * 18) + spread('fan') * 0.25 * i} rIn={0.4 + i * 0.06} rOut={MIL_FAN_R - i * 0.03 + 0.01} n={40} color="stator" chord={0.06} twist={-0.5} look={look('fan', 'ogv')} ev={ev('fan:ogv')} />
              ))}
            </>
          ) : (
            <>
              <BladeRing x={ax(151)} rIn={0.34} rOut={1.64 * fs} n={fanBlades} color={colorBySpool ? SPOOL_COLOR.fan : fanBlades > 26 ? 'titanium' : 'carbon'} chord={0.22 * Math.sqrt(18 / fanBlades)} tipChord={0.4 * Math.pow(18 / fanBlades, 0.7)} twist={0.95} spin={wFan} wide damage={fanDamage} look={look('fan', 'blades')} ev={ev('fan:blades')} />
              <BladeRing x={ax(172) + spread('fan') * 0.45} rIn={0.86} rOut={1.66 * fs} n={40} color="stator" chord={0.09} twist={-0.25} look={look('fan', 'ogv')} ev={ev('fan:ogv')} />
            </>
          )}
          {/* rozdzielacz strumieni (splitter) – ostra krawędź przed rdzeniem */}
          <mesh position={[ax(193) + spread('fan') * 0.45, 0, 0]} rotation={[0, Math.PI / 2, 0]} {...ev('fan:ogv')}>
            <torusGeometry args={[0.8, 0.025, 8, 64]} />
            <Mat color="titanium" look={look('fan', 'ogv')} />
          </mesh>
          {spools === 'gtf' && (
            <group position={[ax(185) + spread('fan') * 0.3, 0, 0]}>
              <mesh rotation={[0, Math.PI / 2, 0]} {...ev('fan:gear')}>
                <torusGeometry args={[0.3, 0.05, 10, 32]} />
                <Mat color="steel" look={look('fan', 'gear')} />
              </mesh>
              <GearPlanets w={w1} look={look('fan', 'gear')} ev={ev('fan:gear')} />
            </group>
          )}
        </group>
      )}

      {/* ---------- moduły rdzenia: osłony i piasty ---------- */}
      {(
        [
          ['lpc', 196, 275],
          ['hpc', 275, 445],
          ['comb', 445, 545],
          ['hpt', 545, 590],
          ['lpt', 590, 690],
        ] as const
      ).map(([id, a, b]) => (
        <group key={id} position={off(id)}>
          {/* gdy moduł jest wybrany w widoku rozłożonym, jego osłona robi się przezroczysta – widać wieńce */}
          {/* osłona rdzenia (cienka) i obudowa przepływu – między nimi przedział rdzenia z osprzętem.
              W widoku rozłożonym obie odjeżdżają pod oś silnika, obok wnętrza, które zostaje odsłonięte. */}
          <group position={[0, -casingDrop, 0]}>
            <Shell outer={COWL3} inner={COWL_SKIN} x0={a} x1={b} color="paintGrey" cut={cut} look={caseLook(id)} ev={ev(id)} />
            {detail && <Shell outer={CASE_OUT} inner={CORE3_OUT} x0={a} x1={b} color={id === 'hpt' || id === 'lpt' || id === 'comb' ? 'heat' : 'titanium'} cut={cut} look={caseLook(id)} ev={ev(id)} />}
          </group>
          {/* piasta/bęben – w przekroju też wycięta, żeby było widać tarcze wirników i wały */}
          {detail && <Shell outer={CORE_IN} x0={a} x1={b} color={id === 'comb' || id === 'hpt' || id === 'lpt' ? 'heat' : 'darkSteel'} cut={cut} look={look(id)} ev={ev(id)} />}
        </group>
      ))}

      {/* ---------- wieńce łopatek ---------- */}
      {detail && rows.map((r, i) => {
        const id = `${r.part}:r${i}`;
        const color = r.rotor ? (colorBySpool ? SPOOL_COLOR[r.spool] : r.part === 'hpc' && r.stage > hpcStages * 0.6 ? 'steel' : partColor[r.part]) : r.part === 'hpt' || r.part === 'lpt' ? 'nickel' : 'stator';
        return (
          <group key={`${hpcStages}-${spools}-${i}`} position={off(r.part)}>
            <BladeRing
              x={rowX(r)}
              rIn={lerpTable(CORE_IN, r.x) * S + 0.01}
              rOut={lerpTable(CORE_OUT, r.x) * S - 0.01}
              n={
                r.part === 'hpc'
                  ? (r.rotor ? 24 : 32) + Math.round((r.stage / hpcStages) * (r.rotor ? 40 : 44))
                  : r.part === 'hpt'
                    ? r.rotor
                      ? 66
                      : 38
                    : r.part === 'lpt'
                      ? (r.rotor ? 52 : 60) + r.stage * 8
                      : (r.rotor ? 36 : 44) + r.stage * 6
              }
              color={color}
              chord={r.part === 'lpt' || r.part === 'lpc' ? 0.07 : r.part === 'hpt' ? (r.rotor ? 0.08 : 0.11) : 0.075 - 0.035 * (r.stage / hpcStages)}
              pitch={r.part === 'hpc' && !r.rotor && r.stage <= VSV_ROWS ? vsv : 0}
              twist={(r.rotor ? 0.75 : -0.6) * (r.part === 'hpt' || r.part === 'lpt' ? -1.15 : 1)}
              spin={spinOf(r.spool)}
              hub={r.rotor}
              look={look(r.part, `r${i}`)}
              ev={ev(id)}
            />
          </group>
        );
      })}

      {/* kierownica wlotowa sprężarki WP (IGV) – przestawna jak VSV */}
      <group position={off('hpc')}>
        <BladeRing x={rowX({ part: 'hpc', x: IGV_X, rotor: false, stage: 0, spool: 'st' })} rIn={lerpTable(CORE_IN, IGV_X) * S + 0.01} rOut={lerpTable(CORE_OUT, IGV_X) * S - 0.01} n={36} color="stator" chord={0.05} twist={-0.3} pitch={vsv} look={look('hpc', 'vsv')} ev={ev('hpc:vsv')} />
      </group>
      {/* łożyska, tylna rama turbiny i rury regulacji luzów (tylko w widoku złożonym) */}
      {detail && ex < 0.05 && <TurbineShaftHardware cut={cut} look={look} ev={ev} w1={wLp} w2={w2} one={spools === 'jet1'} />}
      {/* osprzęt sprężarki (tylko w widoku złożonym) */}
      {detail && ex < 0.05 && <CompressorHardware rows={rows} vsv={vsv} vbv={vbv} cut={cut} look={look} ev={ev} />}

      {/* ---------- komora spalania ---------- */}
      {!detail ? null : combDetail && ex < 0.05 ? (
        <CombustorDetail comb={comb} ignite={ignite} cut={cut} look={look} ev={ev} />
      ) : (
      <group position={off('comb')}>
        <group position={[-spread('comb') * 0.25, 0, 0]}>
          <Shell
            outer={[
              [455, 62],
              [540, 60],
            ]}
            inner={[
              [455, 34],
              [540, 36],
            ]}
            x0={455}
            x1={540}
            color="heat"
            cut={cut}
            look={look('comb', 'liner')}
            emissive="#f97316"
            emissiveIntensity={comb * 0.9}
            ev={ev('comb:liner')}
          />
        </group>
        {/* kolektor paliwa wokół komory */}
        <mesh position={[ax(448) - spread('comb') * 0.5, 0, 0]} rotation={[0, Math.PI / 2, 0]} {...ev('comb:inj')}>
          <torusGeometry args={[1.04 * (1 + spread('comb') * 0.25), 0.022, 8, 72]} />
          <Mat color="steel" look={look('comb', 'inj')} />
        </mesh>
        {Array.from({ length: 18 }, (_, k) => {
          const a = (k / 18) * Math.PI * 2;
          const sp = spread('comb');
          const k1 = 1 + sp * 0.25;
          return (
            <group key={k} rotation={[a, 0, 0]}>
              {/* króciec: od kolektora przez osłonę do wtryskiwacza */}
              <mesh position={[ax(448) - sp * 0.5, 0.76 * k1, 0]} {...ev('comb:inj')}>
                <cylinderGeometry args={[0.014, 0.014, 0.56 * k1, 6]} />
                <Mat color="darkSteel" look={look('comb', 'inj')} />
              </mesh>
              <group position={[ax(452) - sp * 0.5, 0.48 * k1, 0]}>
                <mesh rotation={[0, 0, Math.PI / 2]} {...ev('comb:inj')}>
                  <cylinderGeometry args={[0.025, 0.035, 0.12, 8]} />
                  <Mat color="polished" look={look('comb', 'inj')} />
                </mesh>
                {/* zawirowywacz wokół dyszy */}
                <mesh position={[0.07, 0, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
                  <torusGeometry args={[0.045, 0.012, 6, 16]} />
                  <Mat color="steel" look={look('comb', 'inj')} />
                </mesh>
                <Flame len={0.3 + 0.5 * comb} r={0.065 + 0.035 * comb} intensity={selPart && selPart !== 'comb' ? 0 : comb} seed={k} hot={comb} />
              </group>
            </group>
          );
        })}
        {/* żar komory oświetla płomieniówkę i sąsiednie łopatki */}
        <pointLight position={[ax(500), 0.48, 0.15]} color="#ff8a3d" intensity={comb * 5 * (selPart && selPart !== 'comb' ? 0 : 1)} distance={2.2} decay={2} />
        <pointLight position={[ax(500), -0.48, -0.15]} color="#ff8a3d" intensity={comb * 3 * (selPart && selPart !== 'comb' ? 0 : 1)} distance={2.2} decay={2} />
        {[0.2, Math.PI + 0.2].map((a) => (
          <group key={a} rotation={[a, 0, 0]}>
            <group position={[ax(478), 0.7 + spread('comb') * 0.3, 0]}>
              <mesh {...ev('comb:ign')}>
                <cylinderGeometry args={[0.03, 0.03, 0.22, 8]} />
                <Mat color="polished" look={look('comb', 'ign')} />
              </mesh>
              <group position={[0, -0.12, 0]}>
                <Spark on={ignite} />
              </group>
            </group>
          </group>
        ))}
      </group>
      )}

      {/* ---------- dysza ---------- */}
      <group position={off('nozzle')}>
        {mil ? (
          <>
            {/* mieszalnik: osłona rdzenia kończy się wcześniej, a płatki przeplatają strumień gorący z zimnym przed dopalaczem */}
            <Shell outer={COWL3} inner={CORE3_OUT} x0={690} x1={735} color="darkSteel" cut={cut} look={look('ab', 'mixer')} ev={ev('ab:mixer')} />
            {Array.from({ length: 16 }, (_, k) => {
              const t = (k / 16) * Math.PI * 2;
              if (!shown(t, cut)) return null;
              return (
                <group key={k} rotation={[t, 0, 0]}>
                  <mesh position={[ax(744), 0.74 + (k % 2 ? 0.1 : -0.04), 0]} rotation={[0, 0, k % 2 ? 0.35 : -0.25]} {...ev('ab:mixer')}>
                    <boxGeometry args={[0.2, 0.012, 0.22]} />
                    <Mat color="nickel" look={look('ab', 'mixer')} />
                  </mesh>
                </group>
              );
            })}
          </>
        ) : (
          <group position={[0, -casingDrop, 0]}>
          <Shell outer={COWL3} inner={CORE3_OUT} x0={690} x1={765} color="darkSteel" cut={cut} look={caseLook('nozzle', 'cowl')} ev={ev('nozzle:cowl')} />
        </group>
        )}
        <group position={[spread('nozzle') * 0.4, 0, 0]}>
          {/* przy rewersie klapowym i dopalaczu stożek jest krótki */}
          {mil ? (
            <Shell outer={PLUG_AB} x0={690} x1={800} color="nickel" cut={false} look={look('nozzle', 'plug')} ev={ev('nozzle:plug')} />
          ) : rv?.type === 'klapowy' ? (
            <Shell outer={PLUG_SHORT} x0={690} x1={840} color="darkSteel" cut={false} look={look('nozzle', 'plug')} ev={ev('nozzle:plug')} />
          ) : (
            <Shell outer={PLUG3} x0={690} x1={945} color="darkSteel" cut={false} look={look('nozzle', 'plug')} ev={ev('nozzle:plug')} />
          )}
        </group>
      </group>

      {/* ---------- dopalacz ---------- */}
      {ab && <Afterburner cfg={ab} pos={off('ab')} look={look} ev={ev} cut={cut} />}

      {/* ---------- wały ---------- */}
      {detail && (() => {
        const lpA = ax(150) + EXPLODE.fan[0] * ex + push('fan');
        const lpB = ax(700) + EXPLODE.lpt[0] * ex + push('lpt');
        const hpA = ax(280) + EXPLODE.hpc[0] * ex + push('hpc') - (sm.s_hpc ?? 0) * 85 * S * 1.6;
        const hpB = ax(585) + EXPLODE.hpt[0] * ex + push('hpt') + (sm.s_hpt ?? 0) * 22 * S * 1.6;
        const one = spools === 'jet1';
        return (
          <>
            {!one && (
              <mesh position={[(lpA + lpB) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} {...ev('shafts:lp')}>
                <cylinderGeometry args={[0.07, 0.07, lpB - lpA, 16]} />
                <Mat color={colorBySpool ? SPOOL_COLOR.lp : 'polished'} look={look('shafts', 'lp')} emissive="#0ea5e9" emissiveIntensity={colorBySpool ? 0.3 : 0} />
              </mesh>
            )}
            {spools === 'tf3' && (
              <mesh position={[(ax(205) + ax(620)) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.1, 0.1, ax(620) - ax(205), 16, 1, true]} />
                <Mat color={colorBySpool ? SPOOL_COLOR.ip : 'steel'} look={look('shafts', 'lp')} side={THREE.DoubleSide} emissive="#22c55e" emissiveIntensity={colorBySpool ? 0.3 : 0} />
              </mesh>
            )}
            <mesh position={[((one ? ax(205) : hpA) + hpB) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} {...ev('shafts:hp')}>
              <cylinderGeometry args={[0.13, 0.13, hpB - (one ? ax(205) : hpA), 16, 1, true]} />
              <Mat color={colorBySpool ? SPOOL_COLOR.hp : 'steel'} look={look('shafts', 'hp')} side={THREE.DoubleSide} emissive="#ef4444" emissiveIntensity={colorBySpool ? 0.3 : 0} />
            </mesh>
          </>
        );
      })()}

      {/* ---------- osprzęt (w wyciętej ćwiartce) ---------- */}
      {detail && accessories && cut && hasFan && !mil && ex < 0.05 && <Accessories n2={n2} start={start} duct={Math.abs(fs - 1) < 0.05} fs={fs} ff={fuelFlow ?? ffFromN1(start ? (start.fuel ? n1 : 0) : n1)} feed={feed ?? wing} look={look} ev={ev} />}

      {detail && flow && ex < 0.05 && <Flow speed={flowSpeed} mode={flow} fanScale={fs} bypass={hasFan && stream !== 'hot' && !rv} core={stream !== 'cold' && rv?.type !== 'klapowy'} abNoz={ab ? ab.nozzle : null} ductIn={longDuct && hasFan && !rv && !mil ? longDuctTables(fs).inner : null} outer={outerFlow} />}

      {/* ---------- podpisy elementów: w rozsuniętym module i w scenach, które o nich mówią ---------- */}
      {detail && (() => {
        const L: [[number, number, number], string, string, string][] = [];
        const add = (base: [number, number, number], d: [number, number, number], txt: string, id: string, color = '#e2e8f0') => L.push([[base[0] + d[0], base[1] + d[1], base[2] + d[2]], txt, id, color]);
        const open = (id: string) => (sm[`s_${id}`] ?? 0) > 0.5;
        const P3 = (x: number, r: number, th: number): [number, number, number] => [ax(x), r * Math.cos(th), r * Math.sin(th)];
        // moduł rozsunięty na elementy
        if (open('comb') && !(combDetail && ex < 0.05)) {
          const sp = spread('comb');
          const k1 = 1 + sp * 0.25;
          const o = off('comb');
          add(o, [ax(497) - sp * 0.25, 0.78, 0], 'płomieniówka', 'comb:liner', '#fb923c');
          add(o, [ax(448) - sp * 0.5, 1.04 * k1 + 0.16, 0], 'kolektor paliwa', 'comb:inj');
          add(o, [ax(452) - sp * 0.5, -0.48 * k1 - 0.2, 0], 'wtryskiwacze (18)', 'comb:inj');
          const ri = 0.7 + sp * 0.3;
          add(o, [ax(478), -Math.cos(0.2) * ri - 0.22, -Math.sin(0.2) * ri], 'świece zapłonowe', 'comb:ign', '#facc15');
        }
        for (const part of ['lpc', 'hpc', 'hpt', 'lpt'] as const) {
          if (!open(part)) continue;
          const o = off(part);
          const rs = rows.filter((r) => r.part === part);
          rs.forEach((r) => {
            const top = lerpTable(CORE_OUT, r.x) * S;
            if (r.rotor) add(o, [rowX(r), top + 0.16, 0], `${r.stage}`, `${part}:r${rows.indexOf(r)}`, '#e2e8f0');
          });
          const fr = rs.find((r) => r.rotor);
          const fs0 = rs.find((r) => !r.rotor);
          if (fr) add(o, [rowX(fr), -lerpTable(CORE_OUT, fr.x) * S - 0.18, 0], 'wirnik', `${part}:r${rows.indexOf(fr)}`, '#e2e8f0');
          if (fs0) add(o, [rowX(fs0), -lerpTable(CORE_OUT, fs0.x) * S - 0.42, 0], 'kierownica', `${part}:r${rows.indexOf(fs0)}`, '#94a3b8');
        }
        if (open('fan') && hasFan) {
          const sp = spread('fan');
          const o = off('fan');
          add(o, [ax(100) - sp * 0.3, 0.45, 0], 'kołpak', 'fan:spinner');
          add(o, [ax(151), -1.85 * fs, 0], mil ? 'wirniki wentylatora' : 'łopaty wentylatora', 'fan:blades', '#7dd3fc');
          add(o, [ax(172) + sp * 0.45, 1.85 * fs, 0], 'kierownice (OGV)', 'fan:ogv', '#94a3b8');
        }
        if (open('nozzle')) {
          const sp = spread('nozzle');
          const o = off('nozzle');
          add(o, [ax(860) + sp * 0.4, 0.55, 0], 'stożek wylotowy', 'nozzle:plug');
          add(o, [ax(730), -0.95 - casingDrop, 0], 'dysza gorącego strumienia', 'nozzle:cowl');
        }
        if (open('shafts')) {
          add([0, 0, 0], [ax(250), -0.24, 0], 'wał NP (N1)', 'shafts:lp', '#38bdf8');
          add([0, 0, 0], [ax(430), 0.32, 0], 'wał WP (N2)', 'shafts:hp', '#f87171');
        }
        if (open('bypass') && hasFan && !mil) {
          const o = off('bypass');
          add(o, [ax(560), 2.75 * fs, 0], 'pylon', 'bypass:pylon');
          add(o, [ax(250), -2.1 * fs, 0], 'pokrywa wentylatora', 'bypass:fixed');
          add(o, [ax(470), -1.95 * fs, 0], 'osłona rewersu', 'bypass:sleeve');
        }
        if (open('wlot') && hasFan && !mil) {
          const o = off('wlot');
          add(o, [ax(66), 1.95 * fs, 0], 'krawędź wlotu', 'wlot:lip');
          add(o, [ax(115), -1.35 * fs, 0], 'panele dźwiękochłonne', 'wlot:liner');
        }
        // sceny z wyróżnionymi elementami
        if (elementLabels?.includes('comb') && combDetail && ex < 0.05) {
          add([0, 0, 0], P3(460, 0.62, 1.95), 'zawirowywacze', 'comb:dome', '#facc15');
          add([0, 0, 0], P3(450, 1.2, 1.0), 'wtryskiwacze', 'comb:inj');
          add([0, 0, 0], P3(COMB_HOLES.primary, 0.74, 0.62), 'otwory pierwotne', 'comb:liner', '#fb923c');
          add([0, 0, 0], P3(COMB_HOLES.dilution, 0.74, 0.62), 'otwory rozcieńczające', 'comb:liner', '#38bdf8');
          add([0, 0, 0], P3(520, 0.33, 1.6), 'płomieniówka', 'comb:liner', '#fb923c');
          add([0, 0, 0], [ax(472), 0.95, 0.12], 'świeca zapłonowa', 'comb:ign', '#facc15');
        }
        if (elementLabels?.includes('rev') && rv) {
          const o = off('bypass');
          if (rv.type === 'kaskadowy') {
            const sl = 0.9 * rv.deploy;
            add(o, [ax(405), -1.98, 0], 'kaskady', 'bypass:cascade', '#facc15');
            add(o, [ax(520) + sl, -2.05, 0.3], 'osłona przesuwna', 'bypass:sleeve');
            add(o, [ax(390) + sl, -1.2, 0.35], 'drzwi blokujące', 'bypass:door', '#f87171');
            add(o, [ax(320), -0.95, 0.4], 'cięgła', 'bypass:link');
          } else if (rv.type === 'drzwiowy') {
            add([0, 0, 0], P3(440, 2.0 * fs, 2.36), 'drzwi rewersu', 'bypass:door', '#f87171');
            add([0, 0, 0], P3(385, 1.75 * fs, 2.36), 'siłownik', 'bypass:actuator');
            add([0, 0, 0], P3(465, 1.9 * fs, Math.PI * 1.5), 'stała belka', 'bypass:fixed');
          } else {
            add([0, 0, 0], [ax(900), 1.25, 0], 'czasze', 'nozzle:bucket', '#fb923c');
            add([0, 0, 0], [ax(842), 0.2, 1.35], 'oś obrotu czasz', 'nozzle:bucket');
            add([0, 0, 0], [ax(500), 1.7, 0], 'długa gondola', 'bypass:fixed');
          }
        }
        if (elementLabels?.includes('ab') && ab) {
          const o = off('ab');
          add(o, [ax(744), -0.98, 0], 'mieszalnik', 'ab:mixer');
          add(o, [ax(765), 1.05, 0.2], 'kolektory wtrysku', 'ab:spray', '#facc15');
          add(o, [ax(800), -1.1, 0.3], 'stabilizatory płomienia', 'ab:holder', '#fb923c');
          add(o, [ax(900), 1.12, 0.3], 'osłona termiczna', 'ab:liner');
          add(o, [ax(1000), -1.4, 0], 'klapy dyszy', 'ab:petals');
        }
        /*
         * osprzęt: w zakładce „Osprzęt silnika” podpisy tylko urządzeń, o których mówi jej tekst (elementy rozruchu
         * podpisuje zakładka rozruchu); po kliknięciu osprzętu w przeglądzie – wszystkie
         */
        const accSet = elementLabels?.includes('acc') ? ACC_TAB : selPart === 'acc' ? null : undefined;
        if (accSet !== undefined && accessories && cut && hasFan && !mil && ex < 0.05) {
          const want = (id: string) => accSet === null || accSet.includes(id);
          const C = ACC_TH;
          const z: [number, number, number] = [0, 0, 0];
          const ACC: [number, number, number, string, string, string?][] = [
            [306, 1.03, C - 0.3, 'rozrusznik', 'starter', '#38bdf8'],
            [318, 0.96, C + 0.24, 'pompa hydrauliczna', 'hyd'],
            [318, 1.0, C + 0.5, 'prądnica PMA', 'pma'],
            [346, 0.66, C, 'skrzynka napędów', 'agb'],
            [285, 0.42, C - 0.25, 'wał promieniowy', 'shaft'],
            [380, 1.04, C - 0.13, 'generator IDG', 'idg', '#a3e635'],
            [368, 0.74, C - 0.42, 'pompa olejowa', 'lube', '#fbbf24'],
            [384, 1.04, C - 0.4, 'filtr oleju', 'ofilter', '#fbbf24'],
            [415, 1.06, C - 0.5, 'zbiornik oleju', 'tank', '#fbbf24'],
            [330, 0.7, C - 0.2, 'przewody oleju', 'oil', '#fbbf24'],
            [380, 1.02, C + 0.3, 'regulator paliwa (HMU)', 'hmu', '#fb923c'],
            [392, 1.02, C + 0.6, 'filtr paliwa', 'ffilter', '#fb923c'],
            [425, 1.05, C + 0.46, 'wymiennik paliwo–olej', 'fcoc', '#fb923c'],
            [EEC_X - 25, (EEC_R + 0.32) * fs, EEC_TH - 0.2, 'sterownik EEC', 'eec', '#93c5fd'],
            [262, 1.72 * fs, 0.3, 'wiązki elektryczne', 'harness', '#93c5fd'],
            [470, 1.1, C, 'wzbudnica zapłonu', 'exciter', '#facc15'],
          ];
          for (const [x, r, th, txt, id, col] of ACC) if (want(id)) add(z, P3(x, r, th), txt, `acc:${id}`, col);
          if (wing) {
            // zasilanie paliwem ze skrzydła: pompy w zbiorniku, zawór LP i przewód w pylonie
            const wy = 2.0 * fs + 0.4;
            const top = (sc: number, zz: number) => wy + wgY(sc, zz, true);
            add(z, [wgXle(0.45) + 0.32 * wgChord(0.45), top(0.32, 0.45) + 0.3, 0.6], 'pompy paliwa w zbiorniku', 'acc:boost', '#fb923c');
            add(z, [wgXle(0) + 0.13 * wgChord(0), top(0.13, 0) + 0.3, 0.1], 'zawór odcinający LP', 'acc:lpvalve', '#fb923c');
            add(z, [ax(500), 2.05 * fs, 0.3], 'paliwo w pylonie', 'acc:feed', '#fb923c');
          }
          if (Math.abs(fs - 1) < 0.05) {
            if (want('duct')) add(z, P3(470, 1.36, 0.25), 'przewód powietrza rozruchowego', 'acc:duct', '#7dd3fc');
            if (want('sav')) add(z, P3(400, 1.4, 0.5), 'zawór rozrusznika', 'acc:sav', '#4ade80');
          }
        }
        return L.map(([pos, txt, id, color], i) => (
          <PartLabel key={`${id}-${txt}-${i}`} sub pos={pos} color={color} onClick={sel(id)}>
            {txt}
          </PartLabel>
        ));
      })()}

      {labels && (
        <>
          {hasFan && (
            <>
              <PartLabel pos={[ax(151) + off('fan')[0], 2.05 * fs, 0]} color="#38bdf8" onClick={sel('fan')}>
                wentylator
              </PartLabel>
              {!mil && (
                <PartLabel pos={[ax(70) + off('wlot')[0], -2.15 * fs + off('wlot')[1], off('wlot')[2]]} color="#7dd3fc" onClick={sel('wlot')}>
                  wlot
                </PartLabel>
              )}
              <PartLabel pos={[ax(420) + off('bypass')[0], (mil ? 1.6 : 2.1 * fs) + off('bypass')[1], off('bypass')[2]]} color="#60a5fa" onClick={sel('bypass')}>
                {mil ? 'kadłub / kanał obejściowy' : 'gondola / kanał obejściowy'}
              </PartLabel>
            </>
          )}
          <PartLabel pos={[ax(235) + off('lpc')[0], -1.25, 0]} color="#a3e635" onClick={sel('lpc')}>
            sprężarka NP
          </PartLabel>
          <PartLabel pos={[ax(360) + off('hpc')[0], 1.2, 0]} color="#facc15" onClick={sel('hpc')}>
            sprężarka WP
          </PartLabel>
          <PartLabel pos={[ax(495) + off('comb')[0], -1.15, 0]} color="#fb923c" onClick={sel('comb')}>
            komora spalania
          </PartLabel>
          <PartLabel pos={[ax(566) + off('hpt')[0], 1.1, 0]} color="#f87171" onClick={sel('hpt')}>
            turbina WP
          </PartLabel>
          <PartLabel pos={[ax(640) + off('lpt')[0], -1.2, 0]} color="#c084fc" onClick={sel('lpt')}>
            turbina NP
          </PartLabel>
          {wing && hasFan && !mil && (
            <PartLabel pos={[wgXle(-3.5) + 0.3 * wgChord(-3.5) + off('bypass')[0], wingY + wgY(0.3, -3.5, true) + 0.35 + off('bypass')[1], -3.5 + off('bypass')[2]]} color="#e2e8f0" onClick={sel('wing')}>
              skrzydło
            </PartLabel>
          )}
          {hasFan && !mil && cut && ex < 0.05 && accessories && (
            <PartLabel pos={accP(345, 1.12)} color="#cbd5e1" onClick={sel('acc')}>
              osprzęt
            </PartLabel>
          )}
          {mil ? (
            <PartLabel pos={[ax(1060) + off('ab')[0], 1.35, 0]} color="#f472b6" onClick={sel('ab')}>
              dysza zbieżno-rozbieżna
            </PartLabel>
          ) : (
            <PartLabel pos={[ax(790) + off('nozzle')[0], 0.8, 0]} color="#f472b6" onClick={sel('nozzle')}>
              dysza
            </PartLabel>
          )}
          {ex > 0.3 && (
            <PartLabel pos={[ax(430), -0.45, 0]} color="#7dd3fc" onClick={sel('shafts')}>
              wały
            </PartLabel>
          )}
          {ab && (
            <PartLabel pos={[ax(880) + off('ab')[0], 1.55, 0]} color="#fb923c" onClick={sel('ab')}>
              dopalacz
            </PartLabel>
          )}
        </>
      )}
    </group>
  );
}

function GearPlanets({ w, look, ev }: { w: number; look: Look; ev?: ClickProps }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.x += w * 0.35 * Math.min(dt, 0.05);
  });
  return (
    <group ref={ref}>
      <mesh rotation={[0, 0, Math.PI / 2]} {...ev}>
        <cylinderGeometry args={[0.1, 0.1, 0.08, 16]} />
        <Mat color="polished" look={look} />
      </mesh>
      {Array.from({ length: 5 }, (_, k) => {
        const a = (k / 5) * Math.PI * 2;
        return (
          <mesh key={k} position={[0, Math.cos(a) * 0.19, Math.sin(a) * 0.19]} rotation={[0, 0, Math.PI / 2]} {...ev}>
            <cylinderGeometry args={[0.07, 0.07, 0.08, 14]} />
            <Mat color="steel" look={look} />
          </mesh>
        );
      })}
    </group>
  );
}

/*
 * Silnik z dopalaczem (klasy F100 / EJ200): smukły kadłub o stałej średnicy od wlotu po dyszę,
 * trzystopniowy wentylator, cienki kanał obejściowy, mieszalnik, rura dopalacza z osłoną chłodzoną
 * powietrzem z kanału, wtryskiwacze, stabilizatory płomienia i zmienna dysza zbieżno-rozbieżna.
 */
const MIL_LIP: [number, number, number] = [72, 124, 4];
const MIL_OUT: Tab = [[72, 128], [90, 131], [150, 133], [300, 133], [500, 132], [700, 130], [1000, 128]];
const MIL_IN: Tab = [[72, 120], [90, 121], [140, 121], [200, 120], [300, 117], [500, 116], [700, 115], [740, 114], [1000, 113]];
export const MIL_FAN_R = 1.18;
const PLUG_AB: Tab = [[690, 40], [720, 42], [745, 38], [775, 24], [800, 0]];
/** Promień osłony termicznej dopalacza (j. przekroju) – między nią a kadłubem płynie powietrze chłodzące. */
export const AB_LINER = 100;
/** Gardziel i wylot dyszy zbieżno-rozbieżnej (j. przekroju) przy danym otwarciu 0…1. */
export const abNozzle = (open: number) => {
  const rT = 56 + 32 * open;
  return { xT: 1045, xE: 1098, rT, rE: rT + 6 + 20 * open };
};

function MilCasing({ cut, look, ev, pos }: { cut: boolean; look: (id: string, sub?: string) => Look; ev: (id: string) => ClickProps | undefined; pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <Shell outer={MIL_OUT} inner={MIL_IN} x0={72} x1={76} lip={MIL_LIP} color="lip" cut={cut} look={look('bypass', 'casing')} ev={ev('bypass:casing')} />
      <Shell outer={MIL_OUT} inner={MIL_IN} x0={76} x1={300} color="titanium" cut={cut} look={look('bypass', 'casing')} ev={ev('bypass:casing')} />
      <Shell outer={MIL_OUT} inner={MIL_IN} x0={300} x1={742} color="steel" cut={cut} look={look('bypass', 'casing')} ev={ev('bypass:casing')} />
      {/* kołnierze łączące moduły kadłuba */}
      {[300, 545, 742].map((x) => (
        <Revolved key={x} pts={[[x - 3, lerpTable(MIL_OUT, x) - 1], [x + 3, lerpTable(MIL_OUT, x) - 1], [x + 3, lerpTable(MIL_OUT, x) + 3], [x - 3, lerpTable(MIL_OUT, x) + 3], [x - 3, lerpTable(MIL_OUT, x) - 1]]} t0={cut ? V0 : 0} t1={cut ? V1 : Math.PI * 2} color="darkSteel" look={look('bypass', 'casing')} ev={ev('bypass:casing')} />
      ))}
    </group>
  );
}

function Afterburner({ cfg, pos, look, ev, cut }: { cfg: AfterburnerCfg; pos: [number, number, number]; look: (id: string, sub?: string) => Look; ev: (id: string) => ClickProps | undefined; cut: boolean }) {
  const diamonds = useRef<THREE.Group>(null);
  const { xT, xE, rT, rE } = abNozzle(cfg.nozzle);
  const len = cfg.on ? 3.8 : 1.2;
  useFrame(({ clock }) => {
    if (!diamonds.current) return;
    const t = clock.elapsedTime;
    diamonds.current.scale.set(1 + 0.04 * Math.sin(t * 23), 1 + 0.06 * Math.sin(t * 17), 1 + 0.06 * Math.sin(t * 19 + 1));
  });
  const t0 = cut ? V0 : 0;
  const t1 = cut ? V1 : Math.PI * 2;
  const glow = cfg.on ? 1 : 0;
  // płatki dyszy: 16 klap + 16 uszczelnień w szczelinach między nimi
  const N = 16;
  const XH = 1000; // zawias klap zbieżnych, koniec kadłuba
  const RH = AB_LINER;
  const RO = lerpTable(MIL_OUT, 1000);
  const petal = (k: number, seal: boolean, a: [number, number], b: [number, number], color: string, sub: string, th = 0.022) => {
    const t = ((k + (seal ? 0.5 : 0)) / N) * Math.PI * 2;
    if (!shown(t, cut)) return null;
    const dx = (b[0] - a[0]) * S;
    const dr = (b[1] - a[1]) * S;
    const L = Math.hypot(dx, dr);
    const k0 = seal ? 0.55 : 1.08;
    const w0 = ((2 * Math.PI * a[1] * S) / N) * k0;
    const w1 = ((2 * Math.PI * b[1] * S) / N) * k0;
    return (
      <group key={`${sub}-${seal ? 's' : 'f'}${k}`} rotation={[t, 0, 0]}>
        <group position={[ax(a[0]), a[1] * S - (seal ? 0.012 : 0), 0]} rotation={[0, 0, Math.atan2(dr, dx)]}>
          <PlateMesh len={L} w0={w0} w1={w1} th={th} color={seal ? 'darkSteel' : color} look={look('ab', sub)} ev={ev(`ab:${sub}`)} />
        </group>
      </group>
    );
  };
  return (
    <group position={pos}>
      {/* kadłub dopalacza (zewnętrzny) i perforowana osłona termiczna (wewnętrzna) */}
      <Shell outer={MIL_OUT} inner={MIL_IN} x0={742} x1={1000} color="heat" cut={cut} look={look('ab', 'pipe')} ev={ev('ab:pipe')} />
      <Revolved pts={[[752, RH + 1], [1000, RH + 1], [1000, RH - 1], [752, RH - 1], [752, RH + 1]]} t0={t0} t1={t1} color="heat" look={look('ab', 'liner')} ev={ev('ab:liner')} />
      {/* poprzeczne przetłoczenia osłony (fale ułatwiające rozszerzalność cieplną) */}
      {[790, 830, 870, 910, 950].map((x) => (
        <Revolved key={x} pts={[[x - 2, RH - 1], [x + 2, RH - 1], [x + 2, RH - 3.5], [x - 2, RH - 3.5], [x - 2, RH - 1]]} t0={t0} t1={t1} color="nickel" look={look('ab', 'liner')} ev={ev('ab:liner')} />
      ))}
      {/* żar osłony przy pracy dopalacza */}
      {cfg.on && <Revolved pts={[[760, RH - 1.2], [1000, RH - 1.2], [1000, RH - 1.6], [760, RH - 1.6], [760, RH - 1.2]]} t0={t0} t1={t1} color="#ff7a1a" look={{ opacity: 0.35, glow: 0 }} />}
      {/* wtrysk: pierścienie kolektorów i promieniowe rurki z dyszami */}
      {[42, 68, 90].map((r) => (
        <mesh key={r} position={[ax(765), 0, 0]} rotation={[0, Math.PI / 2, 0]} {...ev('ab:spray')}>
          <torusGeometry args={[r * S, 0.012, 8, 64]} />
          <Mat color="polished" look={look('ab', 'spray')} />
        </mesh>
      ))}
      {Array.from({ length: 12 }, (_, k) => {
        const t = (k / 12) * Math.PI * 2 + 0.13;
        if (!shown(t, cut)) return null;
        return (
          <group key={k} rotation={[t, 0, 0]}>
            <mesh position={[ax(762), 0.62, 0]} {...ev('ab:spray')}>
              <cylinderGeometry args={[0.01, 0.01, 0.76, 6]} />
              <Mat color="polished" look={look('ab', 'spray')} />
            </mesh>
          </group>
        );
      })}
      {/* stabilizatory płomienia: pierścienie o przekroju V połączone promieniowymi rynienkami */}
      {[38, 64, 88].map((r) => (
        <mesh key={r} position={[ax(800), 0, 0]} rotation={[0, Math.PI / 2, 0]} {...ev('ab:holder')}>
          <torusGeometry args={[r * S, 0.028, 3, 64]} />
          <Mat color="nickel" look={look('ab', 'holder')} />
        </mesh>
      ))}
      {Array.from({ length: 8 }, (_, k) => {
        const t = (k / 8) * Math.PI * 2;
        if (!shown(t, cut)) return null;
        return (
          <group key={k} rotation={[t, 0, 0]}>
            <mesh position={[ax(800), 0.64, 0]} rotation={[Math.PI / 4, 0, 0]} {...ev('ab:holder')}>
              <boxGeometry args={[0.05, 0.52, 0.05]} />
              <Mat color="nickel" look={look('ab', 'holder')} />
            </mesh>
          </group>
        );
      })}
      {/* płomienie za stabilizatorami */}
      {cfg.on &&
        [38, 64, 88].flatMap((r, ri) =>
          Array.from({ length: [6, 10, 13][ri] }, (_, k) => {
            const a = (k / [6, 10, 13][ri]) * Math.PI * 2 + ri * 0.2;
            return (
              <group key={`f${r}-${k}`} position={[ax(806), Math.cos(a) * r * S, Math.sin(a) * r * S]}>
                <Flame len={1.9} r={0.075} intensity={0.85} seed={k + ri * 20} hot={1} />
              </group>
            );
          }),
        )}
      <pointLight position={[ax(900), 0, 0]} color="#ff9a4d" intensity={cfg.on ? 7 : 0} distance={4} decay={2} />
      {/* pierścień synchronizujący i siłowniki dyszy na końcu kadłuba */}
      <mesh position={[ax(985), 0, 0]} rotation={[0, Math.PI / 2, 0]} {...ev('ab:outer')}>
        <torusGeometry args={[(RO + 2) * S, 0.025, 8, 64]} />
        <Mat color="darkSteel" look={look('ab', 'outer')} />
      </mesh>
      {/* dysza zbieżno-rozbieżna: klapy zbieżne → gardziel → klapy rozbieżne; na zewnątrz klapy osłonowe */}
      {Array.from({ length: N }, (_, k) => [
        petal(k, false, [XH, RH], [xT, rT], 'nickel', 'petals'),
        petal(k, true, [XH, RH], [xT, rT], 'nickel', 'petals'),
        petal(k, false, [xT, rT], [xE, rE], 'heat', 'petals'),
        petal(k, true, [xT, rT], [xE, rE], 'heat', 'petals'),
        petal(k, false, [XH, RO], [xE + 2, rE + 5], 'darkSteel', 'outer', 0.018),
      ])}
      {/* płomień z gardzieli i diamenty uderzeniowe za wylotem */}
      <group position={[ax(xT), 0, 0]}>
        <Flame len={len} r={rT * S * 0.95} intensity={cfg.on ? 1 : 0.3} seed={7} hot={glow} />
      </group>
      <group ref={diamonds} position={[ax(xE), 0, 0]}>
        {Array.from({ length: cfg.on ? 5 : 3 }, (_, i) => (
          <mesh key={i} position={[0.3 + i * (len / 6), 0, 0]} scale={[0.12, rT * S * (0.75 - i * 0.08), rT * S * (0.75 - i * 0.08)]} raycast={() => null}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshBasicMaterial color={cfg.on ? '#bfdbfe' : '#fde68a'} transparent opacity={(cfg.on ? 0.6 : 0.2) * (1 - i * 0.15)} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function PlateMesh({ len, w0, w1, th, color, look, ev }: { len: number; w0: number; w1: number; th: number; color: string; look: Look; ev?: ClickProps }) {
  const geo = useMemo(() => trapPlate(len, w0, w1, th), [len, w0, w1, th]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} {...ev}>
      <Mat color={color} look={look} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Stan zaznaczenia + gotowa ramka z opisem. */
export function useEngineSelection() {
  return useState<string | null>(null);
}
