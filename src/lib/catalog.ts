/**
 * Katalog modeli na stronie głównej. Każdy model to jedna rzecz z prawdziwego świata, na której przykładzie
 * wyjaśniamy, jak działa – od środka, krok po kroku.
 *
 * Gotowy model ma pole `topic` (identyfikator z rejestru w src/topics/index.ts) – karta prowadzi do niego.
 * Model bez `topic` jest zapowiedzią: widać go na liście i w wyszukiwarce, ale karta jest wyszarzona.
 * Żeby dodać nowy model: dopisz go tutaj, a gdy będzie gotowy – uzupełnij `topic`.
 */

export type Category = 'lotnictwo' | 'transport' | 'energia' | 'budynki' | 'urzadzenia' | 'czlowiek' | 'przyroda';

export interface CatalogModel {
  id: string;
  title: string;
  category: Category;
  /** Jedno–dwa zdania: co pokażemy na tym modelu. */
  summary: string;
  /** Dodatkowe słowa dla wyszukiwarki (synonimy, części, zjawiska). */
  keywords?: string;
  /** Identyfikator gotowego modelu w rejestrze; brak – model w przygotowaniu. */
  topic?: string;
}

export const categoryLabels: Record<Category, string> = {
  lotnictwo: 'Lotnictwo i kosmos',
  transport: 'Transport',
  energia: 'Energia',
  budynki: 'Budynki i miasto',
  urzadzenia: 'Urządzenia',
  czlowiek: 'Człowiek',
  przyroda: 'Ziemia i przyroda',
};

export const categoryOrder: Category[] = ['lotnictwo', 'transport', 'energia', 'budynki', 'urzadzenia', 'czlowiek', 'przyroda'];

export const catalog: CatalogModel[] = [
  // lotnictwo i kosmos
  {
    id: 'samolot-pasazerski',
    title: 'Samolot pasażerski',
    category: 'lotnictwo',
    summary: 'Airbus A350-1000 w 3D: kadłub, skrzydła, silniki, usterzenie, podwozie i kokpit – każdy podzespół otwiera się od środka.',
    keywords: 'airbus a350 lot skrzydło silnik odrzutowy turbofan kokpit podwozie apu radar paliwo drzwi światła elektryka lądowanie start',
    topic: 'samolot-pasazerski',
  },
  { id: 'smiglowiec', title: 'Śmigłowiec', category: 'lotnictwo', summary: 'Wirnik nośny i ogonowy, tarcza sterująca i to, jak śmigłowiec wisi w miejscu i leci w bok.', keywords: 'helikopter wirnik łopaty autorotacja' },
  { id: 'szybowiec', title: 'Szybowiec', category: 'lotnictwo', summary: 'Lot bez silnika: noszenia, kominy termiczne i długie, smukłe skrzydła.', keywords: 'termika doskonałość szybowanie' },
  { id: 'balon', title: 'Balon na ogrzane powietrze', category: 'lotnictwo', summary: 'Palnik, czasza i wyporność – dlaczego ciepłe powietrze unosi kosz z ludźmi.', keywords: 'wyporność archimedes palnik' },
  { id: 'dron', title: 'Dron', category: 'lotnictwo', summary: 'Cztery śmigła, żyroskopy i komputer, który kilkaset razy na sekundę poprawia lot.', keywords: 'quadcopter multikopter śmigło' },
  { id: 'rakieta', title: 'Rakieta kosmiczna', category: 'lotnictwo', summary: 'Stopnie, silnik rakietowy i droga na orbitę – od startu do rozdzielenia stopni.', keywords: 'orbita ciąg paliwo stopień' },
  { id: 'satelita', title: 'Satelita', category: 'lotnictwo', summary: 'Panele słoneczne, anteny i orbita: jak satelita nie spada i skąd GPS wie, gdzie jesteś.', keywords: 'gps orbita stacja kosmiczna' },

  // transport
  { id: 'samochod', title: 'Samochód', category: 'transport', summary: 'Silnik, skrzynia biegów, hamulce i zawieszenie – co się dzieje po wciśnięciu pedału gazu.', keywords: 'auto silnik spalinowy skrzynia biegów sprzęgło hamulec' },
  { id: 'samochod-elektryczny', title: 'Samochód elektryczny', category: 'transport', summary: 'Akumulator, falownik i silnik elektryczny; hamowanie, które ładuje baterię.', keywords: 'ev bateria rekuperacja' },
  { id: 'rower', title: 'Rower', category: 'transport', summary: 'Przerzutki, łańcuch i równowaga – dlaczego jadący rower się nie przewraca.', keywords: 'przerzutka łańcuch zębatka' },
  { id: 'pociag', title: 'Pociąg dużych prędkości', category: 'transport', summary: 'Pantograf, silniki trakcyjne i sygnalizacja – jak pociąg jedzie 300 km/h.', keywords: 'kolej lokomotywa tory pantograf' },
  { id: 'statek', title: 'Statek', category: 'transport', summary: 'Kadłub, śruba napędowa i balast – dlaczego stalowy statek pływa.', keywords: 'wyporność kontenerowiec śruba ster' },
  { id: 'okret-podwodny', title: 'Okręt podwodny', category: 'transport', summary: 'Zbiorniki balastowe i peryskop: jak okręt zanurza się i wynurza.', keywords: 'łódź podwodna balast sonar' },

  // energia
  { id: 'elektrownia-wiatrowa', title: 'Elektrownia wiatrowa', category: 'energia', summary: 'Łopaty, przekładnia i generator w gondoli – jak wiatr staje się prądem.', keywords: 'turbina wiatrak generator' },
  { id: 'elektrownia-jadrowa', title: 'Elektrownia jądrowa', category: 'energia', summary: 'Reaktor, pręty paliwowe i obieg pary – od rozszczepienia do gniazdka.', keywords: 'atom reaktor uran rozszczepienie' },
  { id: 'elektrownia-wodna', title: 'Elektrownia wodna', category: 'energia', summary: 'Zapora, turbina i generator: energia spadającej wody.', keywords: 'zapora tama turbina' },
  { id: 'panel-sloneczny', title: 'Panel słoneczny', category: 'energia', summary: 'Ogniwo krzemowe od środka – jak światło wybija elektrony.', keywords: 'fotowoltaika ogniwo pv' },
  { id: 'akumulator', title: 'Akumulator litowo-jonowy', category: 'energia', summary: 'Anoda, katoda i elektrolit: co się dzieje w baterii przy ładowaniu i rozładowaniu.', keywords: 'bateria lit ogniwo' },
  { id: 'siec-energetyczna', title: 'Sieć energetyczna', category: 'energia', summary: 'Od elektrowni przez linie wysokiego napięcia i transformatory do domu.', keywords: 'transformator linia napięcie prąd' },

  // budynki i miasto
  { id: 'wiezowiec', title: 'Wieżowiec', category: 'budynki', summary: 'Fundamenty, rdzeń i tłumik drgań – jak wysoki budynek opiera się wiatrowi.', keywords: 'drapacz chmur konstrukcja windy' },
  { id: 'most-wiszacy', title: 'Most wiszący', category: 'budynki', summary: 'Pylony, liny nośne i wieszaki – gdzie płyną siły w moście.', keywords: 'most liny pylon' },
  { id: 'tunel', title: 'Tunel i maszyna drążąca', category: 'budynki', summary: 'Tarcza skrawająca, obudowa i wentylacja tunelu pod rzeką.', keywords: 'tbm metro drążenie' },
  { id: 'dom', title: 'Dom i jego instalacje', category: 'budynki', summary: 'Woda, kanalizacja, prąd, ogrzewanie i wentylacja – ukryte w ścianach.', keywords: 'instalacja hydraulika ogrzewanie pompa ciepła' },
  { id: 'oczyszczalnia', title: 'Oczyszczalnia ścieków', category: 'budynki', summary: 'Kraty, osadniki i bakterie: droga wody od zlewu do rzeki.', keywords: 'ścieki woda kanalizacja' },

  // urządzenia
  { id: 'smartfon', title: 'Smartfon', category: 'urzadzenia', summary: 'Ekran dotykowy, procesor, aparat i anteny – co jest w środku telefonu.', keywords: 'telefon procesor ekran aparat' },
  { id: 'komputer', title: 'Komputer', category: 'urzadzenia', summary: 'Procesor, pamięć i dysk – jak kod zamienia się w obraz na ekranie.', keywords: 'pc procesor ram dysk' },
  { id: 'lodowka', title: 'Lodówka', category: 'urzadzenia', summary: 'Sprężarka i czynnik chłodniczy: jak wypompować ciepło ze środka.', keywords: 'chłodzenie pompa ciepła sprężarka' },
  { id: 'kuchenka-mikrofalowa', title: 'Kuchenka mikrofalowa', category: 'urzadzenia', summary: 'Magnetron i fale, które podgrzewają wodę w jedzeniu.', keywords: 'mikrofale magnetron' },
  { id: 'aparat-fotograficzny', title: 'Aparat fotograficzny', category: 'urzadzenia', summary: 'Obiektyw, przysłona, migawka i matryca – jak powstaje zdjęcie.', keywords: 'obiektyw soczewka matryca' },
  { id: 'zegarek-mechaniczny', title: 'Zegarek mechaniczny', category: 'urzadzenia', summary: 'Sprężyna, wychwyt i balans – zegarek bez baterii.', keywords: 'mechanizm wychwyt koło balansowe' },
  { id: 'drukarka-3d', title: 'Drukarka 3D', category: 'urzadzenia', summary: 'Głowica, warstwy i silniki krokowe – jak powstaje przedmiot z plastiku.', keywords: 'druk 3d filament' },

  // człowiek
  { id: 'serce', title: 'Serce', category: 'czlowiek', summary: 'Przedsionki, komory i zastawki – jedno uderzenie serca krok po kroku.', keywords: 'krwiobieg krew zastawka' },
  { id: 'pluca', title: 'Płuca', category: 'czlowiek', summary: 'Oddech od nosa do pęcherzyków płucnych i wymiana gazów.', keywords: 'oddychanie tlen pęcherzyki' },
  { id: 'oko', title: 'Oko', category: 'czlowiek', summary: 'Rogówka, soczewka i siatkówka – jak oko ostrzy obraz.', keywords: 'wzrok soczewka siatkówka' },
  { id: 'ucho', title: 'Ucho', category: 'czlowiek', summary: 'Błona bębenkowa, kosteczki i ślimak: droga dźwięku do mózgu.', keywords: 'słuch dźwięk ślimak' },
  { id: 'mozg', title: 'Mózg', category: 'czlowiek', summary: 'Neurony, synapsy i obszary mózgu – jak powstaje myśl i ruch.', keywords: 'neuron układ nerwowy' },
  { id: 'kregoslup', title: 'Kręgosłup i stawy', category: 'czlowiek', summary: 'Kręgi, dyski i mięśnie – jak się schylamy i dźwigamy.', keywords: 'szkielet kości staw' },

  // ziemia i przyroda
  { id: 'wulkan', title: 'Wulkan', category: 'przyroda', summary: 'Komora magmowa, krater i erupcja – co dzieje się pod górą.', keywords: 'magma lawa erupcja' },
  { id: 'burza', title: 'Burza', category: 'przyroda', summary: 'Chmura burzowa od środka: prądy wznoszące, grad i piorun.', keywords: 'piorun chmura grad' },
  { id: 'ziemia', title: 'Wnętrze Ziemi', category: 'przyroda', summary: 'Skorupa, płaszcz i jądro; płyty tektoniczne i trzęsienia ziemi.', keywords: 'tektonika trzęsienie płaszcz jądro' },
  { id: 'drzewo', title: 'Drzewo', category: 'przyroda', summary: 'Korzenie, pień i liście – jak woda wędruje 50 m w górę i jak działa fotosynteza.', keywords: 'fotosynteza liść roślina' },
  { id: 'ul', title: 'Ul', category: 'przyroda', summary: 'Plaster, matka i robotnice – jak pszczoły budują i ogrzewają gniazdo.', keywords: 'pszczoły miód' },
];
