import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Control, SceneProps, Topic } from '../../lib/types';

type Fig =
  | 'epitet'
  | 'porownanie'
  | 'metafora'
  | 'personifikacja'
  | 'apostrofa'
  | 'wykrzyknienie'
  | 'onomatopeja'
  | 'powtorzenie'
  | 'antyteza'
  | 'zdrobnienie'
  | 'inwersja'
  | 'anafora'
  | 'pytanie'
  | 'wyliczenie'
  | 'symbol';

const FIGS: Record<Fig, { name: string; color: string; def: string }> = {
  epitet: { name: 'Epitet', color: '#e0913a', def: 'Określenie rzeczownika, które uwydatnia jego cechę.' },
  porownanie: { name: 'Porównanie', color: '#3d8bff', def: 'Zestawienie dwóch zjawisk za pomocą „jak”, „niby”, „jakby”, „niczym”.' },
  metafora: { name: 'Metafora', color: '#a855f7', def: 'Połączenie słów, które razem tworzą nowe, przenośne znaczenie.' },
  personifikacja: { name: 'Personifikacja', color: '#ec4899', def: 'Nadanie cech ludzkich przedmiotom, zwierzętom lub zjawiskom.' },
  apostrofa: { name: 'Apostrofa', color: '#22b07d', def: 'Bezpośredni zwrot do osoby, rzeczy lub idei.' },
  wykrzyknienie: { name: 'Wykrzyknienie', color: '#ef4444', def: 'Zdanie wyrażające silne emocje, zakończone wykrzyknikiem.' },
  onomatopeja: { name: 'Onomatopeja', color: '#14b8a6', def: 'Wyraz naśladujący dźwięk.' },
  powtorzenie: { name: 'Powtórzenie', color: '#eab308', def: 'Ponowne użycie tego samego słowa lub zwrotu dla wzmocnienia.' },
  antyteza: { name: 'Antyteza / paradoks', color: '#6366f1', def: 'Zestawienie przeciwieństw; paradoks – sformułowanie pozornie sprzeczne, które kryje głęboką prawdę.' },
  zdrobnienie: { name: 'Zdrobnienie', color: '#f472b6', def: 'Forma wyrazu wyrażająca czułość, małość lub kruchość (deminutivum).' },
  inwersja: { name: 'Inwersja', color: '#0ea5e9', def: 'Przestawienie naturalnego szyku wyrazów w zdaniu – wyróżnia słowa i buduje rytm.' },
  anafora: { name: 'Anafora', color: '#84cc16', def: 'Powtórzenie tego samego wyrazu na początku kolejnych wersów lub zdań.' },
  pytanie: { name: 'Pytanie retoryczne', color: '#f97316', def: 'Pytanie, które nie oczekuje odpowiedzi – służy wyrażeniu emocji lub skłonieniu do refleksji.' },
  wyliczenie: { name: 'Wyliczenie', color: '#8b5cf6', def: 'Szereg wymienianych po kolei elementów – podkreśla bogactwo, nagromadzenie lub ogrom.' },
  symbol: { name: 'Symbol', color: '#0d9488', def: 'Motyw, który oprócz znaczenia dosłownego ma ukryty, wieloznaczny sens.' },
};

/** Fragment tekstu: zwykły tekst albo [tekst, figura, komentarz]. */
type Seg = string | [string, Fig, string];

interface Passage {
  source: string;
  lines: Seg[][];
}

const PASSAGES: Record<string, Passage> = {
  tren: {
    source: 'J. Kochanowski, „Tren VIII”',
    lines: [
      [['Wielkieś mi uczyniła pustki', 'inwersja', 'Naturalny szyk to „Uczyniłaś mi wielkie pustki”. Przestawienie wysuwa na początek słowo „wielkie” – rozmiar straty.'], ' w domu moim,'],
      [['Moja droga Orszulo', 'apostrofa', 'Ojciec zwraca się do zmarłej córki, jakby wciąż mogła go słyszeć.'], ', tym zniknienim swoim.'],
      [['Pełno nas, a jakoby nikogo nie było', 'antyteza', 'Paradoks: dom jest pełen ludzi, a jednocześnie pusty. Nieobecność jednej osoby przytłacza obecność wszystkich.'], ':'],
      ['Jedną ', ['maluczką', 'zdrobnienie', 'Czułe zdrobnienie podkreśla kruchość dziecka – i kontrastuje z ogromem straty.'], ' duszą tak wiele ubyło.'],
    ],
  },
  rota: {
    source: 'M. Konopnicka, „Rota”',
    lines: [
      [['Nie', 'anafora', 'Kolejne wersy zaczynają się od „Nie” – rytm przysięgi i stanowczy sprzeciw.'], ' rzucim ziemi, skąd nasz ród,'],
      [['Nie', 'anafora', 'Druga część anafory – ta sama budowa wzmacnia deklarację.'], ' damy pogrześć mowy.'],
      [['Polski', 'powtorzenie', 'Powtórzenie słowa „polski” podkreśla tożsamość narodową.'], ' my naród, ', ['polski', 'powtorzenie', 'Powtórzenie w obrębie jednego wersu – jak skandowanie.'], ' lud,'],
      [['Królewski szczep piastowy', 'metafora', 'Naród przedstawiony jako „szczep” – gałąź drzewa rodowego sięgającego Piastów.'], '.'],
    ],
  },
  inwokacja: {
    source: 'A. Mickiewicz, „Pan Tadeusz”',
    lines: [
      [['Litwo! Ojczyzno moja!', 'apostrofa', 'Poeta zwraca się wprost do ojczyzny – jakby była osobą.'], ' ', ['ty jesteś jak zdrowie:', 'porownanie', 'Ojczyzna porównana do zdrowia: docenia się ją dopiero po utracie.']],
      ['Ile cię trzeba cenić, ten tylko się dowie,'],
      ['Kto cię stracił. Dziś ', ['piękność twą w całej ozdobie', 'metafora', 'Pełnia piękna kraju ukazana jak strój z ozdobami.']],
      ['Widzę i opisuję, bo tęsknię po tobie.'],
    ],
  },
  stepy: {
    source: 'A. Mickiewicz, „Stepy akermańskie”',
    lines: [
      ['Wpłynąłem na ', ['suchego przestwór oceanu', 'metafora', 'Step nazwany „suchym oceanem” – bezkresna przestrzeń jak morze.']],
      [['Wóz nurza się w zieloność', 'metafora', 'Wóz „zanurza się” w trawie jak statek w wodzie.'], ' i ', ['jak łódka brodzi', 'porownanie', 'Porównanie wozu do łodzi wzmacnia obraz stepu-morza.'], ','],
      ['Śród fali ', ['łąk szumiących', 'epitet', '„Szumiące” – epitet oddający dźwięk i ruch traw.'], ', śród kwiatów powodzi,'],
      ['Omijam ', ['koralowe', 'epitet', 'Epitet barwy – kwiaty czerwone jak koralowce.'], ' ostrowy burzanu.'],
    ],
  },
  piesn: {
    source: 'J. Kochanowski, „Pieśń” („Czego chcesz od nas, Panie…”)',
    lines: [
      [['Czego', 'anafora', 'Oba pierwsze wersy zaczynają się od „Czego” – uroczysty, hymniczny rytm.'], ' chcesz od nas, ', ['Panie', 'apostrofa', 'Zwrot wprost do Boga – wiersz jest modlitwą dziękczynną.'], ', za Twe ', ['hojne', 'epitet', 'Epitet podkreśla szczodrość Stwórcy.'], ' dary?'],
      [['Czego', 'anafora', 'Druga część anafory.'], ' ', ['za dobrodziejstwa, którym nie masz miary?', 'pytanie', 'Pytanie retoryczne: odpowiedź jest oczywista – człowiek nie ma czym odpłacić Bogu za Jego dary.']],
      [['Kościół Cię nie ogarnie, wszędy pełno Ciebie', 'antyteza', 'Paradoks: Bóg jest wszędzie, a zarazem nie mieści się w żadnej świątyni – jest większy niż wszystko, co stworzone.'], ','],
      [['I w otchłaniach, i w morzu, na ziemi, na niebie', 'wyliczenie', 'Wyliczenie obejmuje cały wszechświat – od głębin po niebo. Powtarzane „i” (wielospójnikowość) spowalnia rytm.'], '.'],
    ],
  },
  oda: {
    source: 'A. Mickiewicz, „Oda do młodości”',
    lines: [
      [['Bez serc, bez ducha', 'powtorzenie', 'Powtórzone „bez” wylicza braki starszego pokolenia – brzmi jak wyrok.'], ', ', ['to szkieletów ludy', 'metafora', 'Ludzie bez zapału i ideałów są jak szkielety – martwi za życia.'], ';'],
      [['Młodości!', 'apostrofa', 'Zwrot do młodości jak do siły zdolnej odmienić świat.'], ' ', ['dodaj mi skrzydła!', 'symbol', 'Skrzydła – symbol wzlotu, natchnienia i wolności od przyziemności.']],
      ['Niech nad ', ['martwym', 'epitet', 'Świat „martwy” – bez ideałów, pogrążony w marazmie.'], ' wzlecę światem'],
      ['W ', ['rajską', 'epitet', 'Kraina marzeń i ideałów – przeciwieństwo martwego świata.'], ' dziedzinę ułudy:'],
    ],
  },
  lokomotywa: {
    source: 'J. Tuwim, „Lokomotywa”',
    lines: [
      ['Stoi na stacji lokomotywa,'],
      [['Ciężka', 'epitet', 'Epitet podkreślający masę maszyny.'], ', ', ['ogromna', 'epitet', 'Kolejny epitet – budowanie wrażenia potęgi.'], ' i ', ['pot z niej spływa', 'personifikacja', 'Lokomotywa „poci się” jak zmęczony człowiek.'], ':'],
      ['Tłusta oliwa.'],
      [['Stoi i sapie', 'personifikacja', 'Maszyna oddycha ciężko jak żywa istota.'], ', ', ['dyszy', 'personifikacja', 'Dyszy – znów ludzka czynność.'], ' i ', ['dmucha', 'personifikacja', 'Dmuchanie – kolejna czynność żywej istoty. Cztery czasowniki w jednym wersie tworzą wrażenie ciężkiego oddechu.'], ','],
      ['Żar z rozgrzanego jej brzucha ', ['bucha', 'onomatopeja', 'Krótkie, wybuchowe brzmienie naśladuje wyrzut pary.'], ':'],
      [['Buch', 'onomatopeja', 'Czysty dźwięk – naśladowanie pary.'], ' – ', ['jak gorąco!', 'powtorzenie', 'Refren powtarzany cztery razy oddaje rytm maszyny.']],
      [['Uch', 'onomatopeja', 'Dźwiękonaśladowczy wykrzyknik.'], ' – ', ['jak gorąco!', 'powtorzenie', 'Powtórzenie buduje rytm.']],
      [['Puff', 'onomatopeja', 'Odgłos pary.'], ' – ', ['jak gorąco!', 'powtorzenie', 'Powtórzenie buduje rytm.']],
      [['Uff', 'onomatopeja', 'Odgłos zmęczenia.'], ' – ', ['jak gorąco!', 'wykrzyknienie', 'Wykrzyknienie oddaje emocje i upał.']],
    ],
  },
};

function FiguresScene({ params }: SceneProps) {
  const passage = PASSAGES[String(params.passage ?? 'inwokacja')];
  const show = String(params.show ?? 'all');
  const [active, setActive] = useState<{ fig: Fig; note: string; text: string } | null>(null);
  // ten sam komponent obsługuje kilka kroków – po zmianie tekstu chowamy kartę z poprzedniego
  useEffect(() => setActive(null), [passage]);

  const used = Array.from(
    new Set(passage.lines.flat().filter((s): s is [string, Fig, string] => typeof s !== 'string').map((s) => s[1])),
  );

  let counter = 0;
  return (
    <div className="poem figures">
      <div className="poem-source">{passage.source} · kliknij zaznaczony fragment</div>
      <div className="fig-text">
        {passage.lines.map((line, li) => (
          <div key={li} className="fig-line">
            {line.map((seg, si) => {
              if (typeof seg === 'string') return <span key={si}>{seg}</span>;
              const [text, fig, note] = seg;
              const on = show === 'all' || show === fig;
              const n = counter++;
              return (
                <motion.button
                  type="button"
                  key={si}
                  className={`fig-mark ${on ? 'on' : ''} ${active?.text === text && active.note === note ? 'active' : ''}`}
                  style={{ '--fig': FIGS[fig].color } as React.CSSProperties}
                  onClick={() => setActive({ fig, note, text })}
                  initial={false}
                  animate={{ backgroundSize: on ? '100% 100%' : '0% 100%' }}
                  transition={{ duration: 0.45, delay: on ? n * 0.08 : 0 }}
                  disabled={!on}
                >
                  {text}
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="fig-legend">
        {used.map((f) => (
          <span key={f} className="fig-chip" style={{ '--fig': FIGS[f].color } as React.CSSProperties}>
            {FIGS[f].name}
          </span>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            key={active.text + active.note}
            className="fig-card"
            style={{ '--fig': FIGS[active.fig].color } as React.CSSProperties}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="fig-card-head">
              <span className="fig-chip">{FIGS[active.fig].name}</span>
              <em>„{active.text}”</em>
            </div>
            <p>{active.note}</p>
            <p className="muted">{FIGS[active.fig].def}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function showControl(options: Fig[], def = 'all'): Control {
  return {
    type: 'select',
    key: 'show',
    label: 'Zaznacz',
    default: def,
    options: [{ value: 'all', label: 'Wszystkie' }, ...options.map((f) => ({ value: f, label: FIGS[f].name }))],
  };
}

export const figures: Topic = {
  id: 'srodki-stylistyczne',
  title: 'Środki stylistyczne w praktyce',
  subject: 'polski',
  summary: 'Od apostrofy po symbol – odkrywaj środki stylistyczne w tekstach Mickiewicza, Kochanowskiego, Konopnickiej i Tuwima.',
  accent: '#d97706',
  glyph: '✎',
  steps: [
    {
      title: 'Apostrofa i porównanie',
      kind: 'page',
      scene: FiguresScene,
      preset: { passage: 'inwokacja' },
      controls: [showControl(['apostrofa', 'porownanie', 'metafora'])],
      body: (
        <>
          <p>
            <strong>Środki stylistyczne</strong> to celowe zabiegi językowe, które sprawiają, że tekst działa na wyobraźnię
            i emocje.
          </p>
          <p>
            Inwokacja zaczyna się od <strong>apostrofy</strong> – poeta zwraca się do Litwy jak do żywej osoby. Zaraz
            potem pojawia się <strong>porównanie</strong> ze słowem „jak”.
          </p>
          <p>Kliknij zaznaczony fragment, aby zobaczyć, jak działa w tekście.</p>
        </>
      ),
    },
    {
      title: 'Metafora i epitet',
      kind: 'page',
      scene: FiguresScene,
      preset: { passage: 'stepy' },
      controls: [showControl(['metafora', 'epitet', 'porownanie'])],
      body: (
        <>
          <p>
            <strong>Metafora</strong> (przenośnia) łączy słowa tak, że powstaje nowe znaczenie. W „Stepach akermańskich”
            step zamienia się w ocean, a wóz w łódź – cały sonet zbudowany jest na tej przenośni.
          </p>
          <p>
            <strong>Epitet</strong> to określenie rzeczownika: „łąk <em>szumiących</em>”, „<em>koralowe</em> ostrowy”.
            Dodaje barwy, dźwięku, ruchu.
          </p>
          <p>Różnica od porównania: metafora nie używa „jak” – utożsamia, a nie zestawia.</p>
        </>
      ),
    },
    {
      title: 'Inwersja, antyteza, zdrobnienie',
      kind: 'page',
      scene: FiguresScene,
      preset: { passage: 'tren' },
      controls: [showControl(['inwersja', 'apostrofa', 'antyteza', 'zdrobnienie'])],
      body: (
        <>
          <p>
            „Treny” Kochanowskiego to cykl żałobny po śmierci córki Urszuli. Środki stylistyczne służą tu wyrażeniu
            bólu, którego nie da się opisać wprost.
          </p>
          <p>
            <strong>Inwersja</strong> zmienia szyk zdania i wysuwa ważne słowo na początek. <strong>Paradoks</strong>{' '}
            „pełno nas, a jakoby nikogo nie było” mówi więcej niż długi opis smutku.
          </p>
          <p>Zwróć uwagę na kontrast: „maluczka dusza” – a „tak wiele ubyło”.</p>
        </>
      ),
    },
    {
      title: 'Personifikacja i onomatopeja',
      kind: 'page',
      scene: FiguresScene,
      preset: { passage: 'lokomotywa' },
      controls: [showControl(['personifikacja', 'onomatopeja', 'epitet', 'powtorzenie', 'wykrzyknienie'])],
      body: (
        <>
          <p>
            W „Lokomotywie” maszyna <strong>żyje</strong>: poci się, sapie, dyszy. To <strong>personifikacja</strong> –
            nadanie ludzkich cech przedmiotowi.
          </p>
          <p>
            Tuwim buduje też dźwięk: <strong>onomatopeje</strong> (buch, uch, puff, uff) naśladują parę, a{' '}
            <strong>powtórzenia</strong> („jak gorąco!”) – rytm kół.
          </p>
          <p>Zwróć uwagę, jak środki działają razem: dźwięk + rytm + ożywienie tworzą wrażenie ruszającego pociągu.</p>
        </>
      ),
    },
    {
      title: 'Anafora i powtórzenie',
      kind: 'page',
      scene: FiguresScene,
      preset: { passage: 'rota' },
      controls: [showControl(['anafora', 'powtorzenie', 'metafora'])],
      body: (
        <>
          <p>
            „Rota” powstała w 1908 roku jako protest przeciw germanizacji. To tekst-przysięga, więc jego siła tkwi w{' '}
            <strong>rytmie i powtórzeniach</strong>.
          </p>
          <p>
            <strong>Anafora</strong> to powtórzenie na <em>początku</em> kolejnych wersów („Nie… / Nie…”). Zwykłe{' '}
            <strong>powtórzenie</strong> może wystąpić w dowolnym miejscu („polski… polski”).
          </p>
          <p>Takie środki nazywamy retorycznymi – mają przekonać i porwać słuchacza.</p>
        </>
      ),
    },
    {
      title: 'Pytanie retoryczne, paradoks, wyliczenie',
      kind: 'page',
      scene: FiguresScene,
      preset: { passage: 'piesn' },
      controls: [showControl(['anafora', 'apostrofa', 'pytanie', 'antyteza', 'wyliczenie'])],
      body: (
        <>
          <p>
            Renesansowa pieśń Kochanowskiego to hymn na cześć Boga-Stwórcy i harmonijnego świata. Środki stylistyczne
            budują tu <strong>podniosły ton</strong>.
          </p>
          <p>
            <strong>Pytanie retoryczne</strong> nie czeka na odpowiedź – ona jest oczywista. <strong>Paradoks</strong>{' '}
            („Kościół Cię nie ogarnie, wszędy pełno Ciebie”) pokazuje, że Boga nie da się zamknąć w ludzkich miarach.
          </p>
          <p>
            <strong>Wyliczenie</strong> otchłani, morza, ziemi i nieba obejmuje cały wszechświat – to obraz wszechobecności
            Boga.
          </p>
        </>
      ),
    },
    {
      title: 'Metafora i symbol w liryce romantycznej',
      kind: 'page',
      scene: FiguresScene,
      preset: { passage: 'oda' },
      controls: [showControl(['powtorzenie', 'metafora', 'apostrofa', 'symbol', 'epitet'])],
      body: (
        <>
          <p>
            „Oda do młodości” (1820) to manifest młodego pokolenia: świat starych jest martwy, a młodzi mają ruszyć
            „bryłę z posad świata” i pchnąć ją na nowe tory.
          </p>
          <p>
            <strong>Symbol</strong> różni się od metafory: ma znaczenie dosłowne (skrzydła) i ukryte, wieloznaczne (wzlot,
            natchnienie, wolność). Metafora „szkieletów ludy” od razu narzuca jeden obraz.
          </p>
          <p>
            Zwróć uwagę na <strong>kontrast</strong> epitetów: <em>martwy</em> świat i <em>rajska</em> dziedzina – na nim
            opiera się cały wiersz.
          </p>
        </>
      ),
    },
  ],
};
