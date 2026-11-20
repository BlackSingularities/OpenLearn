import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';

/* ======================= Krok 1: akt komunikacji i funkcje wypowiedzi ======================= */

type Elem = 'nadawca' | 'odbiorca' | 'komunikat' | 'kontekst' | 'kod' | 'kontakt';

const ELEMS: Record<Elem, { x: number; y: number; label: string }> = {
  nadawca: { x: 80, y: 120, label: 'nadawca' },
  komunikat: { x: 300, y: 120, label: 'komunikat' },
  odbiorca: { x: 520, y: 120, label: 'odbiorca' },
  kontekst: { x: 300, y: 36, label: 'kontekst (rzeczywistość)' },
  kontakt: { x: 300, y: 196, label: 'kontakt (kanał)' },
  kod: { x: 300, y: 262, label: 'kod (język)' },
};

const FUNCS: Record<string, { name: string; elem: Elem | null; ex: string; note: string }> = {
  informatywna: { name: 'informatywna (poznawcza)', elem: 'kontekst', ex: 'Pociąg do Krakowa odjedzie o 15:20 z peronu drugiego.', note: 'Przekazuje wiedzę o świecie. Dominuje w wiadomościach, podręcznikach, instrukcjach.' },
  ekspresywna: { name: 'ekspresywna', elem: 'nadawca', ex: 'Ojej, jak ja się cieszę!', note: 'Wyraża uczucia i stan nadawcy: wykrzyknienia, zdrobnienia, zgrubienia, intonacja.' },
  impresywna: { name: 'impresywna (konatywna)', elem: 'odbiorca', ex: 'Zamknij, proszę, okno. Kup teraz – drugi gratis!', note: 'Ma wpłynąć na odbiorcę – skłonić go do działania. Tryb rozkazujący, wołacz, pytania. Typowa dla reklamy i polityki.' },
  poetycka: { name: 'poetycka (estetyczna)', elem: 'komunikat', ex: 'Pada, pada, pada deszcz – szyby płaczą, płacze zmierzch.', note: 'Uwaga skupia się na samym komunikacie: brzmieniu, rytmie, obrazowaniu. Dominuje w literaturze, ale też w hasłach i przysłowiach.' },
  metajezykowa: { name: 'metajęzykowa', elem: 'kod', ex: 'Słowo „ponieważ” jest spójnikiem.', note: 'Język mówi o języku: definicje, objaśnienia słów, pytania „co to znaczy?”.' },
  fatyczna: { name: 'fatyczna', elem: 'kontakt', ex: 'Halo? Słyszysz mnie? No więc…', note: 'Nawiązuje, podtrzymuje lub kończy kontakt: powitania, pożegnania, „halo”, „no wiesz”.' },
  performatywna: { name: 'performatywna (stanowiąca)', elem: null, ex: 'Ogłaszam was mężem i żoną. Otwieram posiedzenie.', note: 'Wypowiedzenie słów samo tworzy nowy stan rzeczy – pod warunkiem, że mówi osoba uprawniona w odpowiedniej sytuacji.' },
};

function CommScene({ params }: SceneProps) {
  const id = String(params.fn ?? 'informatywna');
  const f = FUNCS[id];
  const boxW = 150;
  return (
    <div className="poem comm">
      <svg className="tree-svg" viewBox="0 0 600 290">
        <defs>
          <marker id="cmArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
        <line x1={80 + 60} y1={120} x2={300 - boxW / 2 - 6} y2={120} stroke="currentColor" strokeWidth="2" markerEnd="url(#cmArrow)" opacity="0.5" />
        <line x1={300 + boxW / 2 + 6} y1={120} x2={520 - 60 - 4} y2={120} stroke="currentColor" strokeWidth="2" markerEnd="url(#cmArrow)" opacity="0.5" />
        {(['kontekst', 'kontakt', 'kod'] as Elem[]).map((e) => (
          <line key={e} x1={300} y1={e === 'kontekst' ? 56 : e === 'kontakt' ? 176 : 242} x2={300} y2={e === 'kontekst' ? 100 : e === 'kontakt' ? 140 : 216} stroke="currentColor" strokeDasharray="3 4" opacity="0.35" />
        ))}
        {(Object.keys(ELEMS) as Elem[]).map((e) => {
          const p = ELEMS[e];
          const on = f.elem === e;
          const w = e === 'nadawca' || e === 'odbiorca' ? 120 : e === 'komunikat' ? boxW : 210;
          return (
            <motion.g key={e} animate={{ scale: on ? 1.08 : 1 }} style={{ transformOrigin: `${p.x}px ${p.y}px` }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
              <rect x={p.x - w / 2} y={p.y - 19} width={w} height="38" rx="12" fill={on ? 'var(--accent)' : 'currentColor'} opacity={on ? 0.9 : 0.07} />
              <rect x={p.x - w / 2} y={p.y - 19} width={w} height="38" rx="12" fill="none" stroke={on ? 'var(--accent)' : 'currentColor'} strokeOpacity={on ? 1 : 0.25} strokeWidth="1.5" />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="14" fontWeight={on ? 700 : 500} fill={on ? '#fff' : 'currentColor'}>
                {p.label}
              </text>
            </motion.g>
          );
        })}
      </svg>
      <AnimatePresence mode="wait">
        <motion.div key={id} className="comm-ex" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <small>funkcja {f.name}</small>
          <blockquote>„{f.ex}”</blockquote>
        </motion.div>
      </AnimatePresence>
      <p className="poem-info">{f.note}</p>
    </div>
  );
}

/* ======================= Krok 2: style funkcjonalne ======================= */

const STYLES: Record<string, { name: string; text: string; traits: string[]; where: string }> = {
  potoczny: {
    name: 'styl potoczny',
    text: 'Sorry, tramwaj się zepsuł i utknąłem na moście na pół godziny. No masakra!',
    traits: ['spontaniczność, emocje', 'słownictwo potoczne, zapożyczenia', 'zdania krótkie, urwane, wykrzyknienia'],
    where: 'rozmowa, SMS, czat',
  },
  urzedowy: {
    name: 'styl urzędowy',
    text: 'Uprzejmie informuję, iż w dniu 14 marca br. nie stawiłem się na zajęciach o wyznaczonej godzinie z powodu awarii środka komunikacji miejskiej. W załączeniu przedkładam zaświadczenie przewoźnika.',
    traits: ['schematyczność, gotowe formuły', 'bezosobowość, precyzja', 'skróty (br., ww.), słownictwo urzędowe (iż, przedkładam)'],
    where: 'podanie, pismo, protokół, ustawa',
  },
  naukowy: {
    name: 'styl naukowy',
    text: 'Awarie taboru należą do głównych przyczyn opóźnień w komunikacji tramwajowej; ich częstość rośnie wraz ze średnim wiekiem eksploatowanych pojazdów.',
    traits: ['obiektywizm, logiczny tok wywodu', 'terminologia specjalistyczna', 'zdania złożone, konstrukcje bezosobowe'],
    where: 'podręcznik, artykuł naukowy, referat',
  },
  publicystyczny: {
    name: 'styl publicystyczny',
    text: 'Znowu stanęło całe miasto! Kolejna awaria wysłużonego tramwaju pokazuje, że na modernizację taboru czekamy zdecydowanie za długo.',
    traits: ['aktualność, komentowanie faktów', 'perswazja, ocena', 'chwytliwe sformułowania, pytania retoryczne'],
    where: 'felieton, artykuł prasowy, reportaż, wpis na blogu',
  },
  artystyczny: {
    name: 'styl artystyczny',
    text: 'Tramwaj zamarł na moście jak zmęczone zwierzę. Za szybą rzeka płynęła dalej – tylko ja stałem w miejscu, spóźniony na wszystko.',
    traits: ['funkcja poetycka', 'środki stylistyczne, obrazowanie', 'może wykorzystać każdy inny styl'],
    where: 'literatura piękna',
  },
};

function StylesScene({ params }: SceneProps) {
  const id = String(params.style ?? 'potoczny');
  const s = STYLES[id];
  return (
    <div className="poem styles">
      <div className="poem-source">Ta sama sytuacja: spóźnienie przez awarię tramwaju</div>
      <AnimatePresence mode="wait">
        <motion.div key={id} initial={{ opacity: 0, rotateX: -12, y: 10 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
          <blockquote className={`style-text st-${id}`}>{s.text}</blockquote>
          <div className="style-meta">
            <h4>{s.name}</h4>
            <ul className="kind-traits">
              {s.traits.map((t, i) => (
                <motion.li key={t} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.07 }}>
                  {t}
                </motion.li>
              ))}
            </ul>
            <p className="muted">Gdzie: {s.where}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ======================= Kroki 3–4: karty do odwracania ======================= */

interface Card {
  front: string;
  back: string;
  tag: string;
  note: string;
}

const ERRORS: Card[] = [
  { front: 'Muszę wziąść parasol.', back: 'Muszę wziąć parasol.', tag: 'fleksyjny', note: 'Bezokolicznik brzmi „wziąć” (jak „ciąć”, „żąć”).' },
  { front: 'Wczoraj poszłem do kina.', back: 'Wczoraj poszedłem do kina.', tag: 'fleksyjny', note: 'Forma czasu przeszłego: poszedłem, poszedłeś.' },
  { front: 'Byliśmy na dworzu.', back: 'Byliśmy na dworze.', tag: 'fleksyjny', note: 'Miejscownik rzeczownika „dwór”: na dworze.' },
  { front: 'Wracając ze szkoły, zaczął padać deszcz.', back: 'Kiedy wracałem ze szkoły, zaczął padać deszcz.', tag: 'składniowy', note: 'Imiesłowowy równoważnik zdania wymaga tego samego wykonawcy obu czynności.' },
  { front: 'Odnośnie tego problemu…', back: 'Odnośnie do tego problemu… / W związku z tym problemem…', tag: 'składniowy', note: '„Odnośnie” łączy się z „do” + dopełniacz.' },
  { front: 'Na koncert przyszło wiele ludzi.', back: 'Na koncert przyszło wielu ludzi.', tag: 'składniowy', note: 'Z rzeczownikami męskoosobowymi łączymy „wielu”.' },
  { front: 'Bynajmniej ja tak uważam.', back: 'Przynajmniej ja tak uważam.', tag: 'leksykalny', note: '„Bynajmniej” znaczy „wcale nie” i służy do wzmocnienia przeczenia.' },
  { front: 'Dzięki chorobie opuścił trzy tygodnie lekcji.', back: 'Z powodu choroby opuścił trzy tygodnie lekcji.', tag: 'leksykalny', note: '„Dzięki” używamy tylko przy skutkach pozytywnych.' },
  { front: 'Cofnął się do tyłu.', back: 'Cofnął się.', tag: 'leksykalny (pleonazm)', note: 'Pleonazm – „cofnąć się” już znaczy „do tyłu”. Podobnie: „akwen wodny”, „kontynuować dalej”.' },
  { front: 'W każdym bądź razie się uda.', back: 'W każdym razie się uda. / Bądź co bądź się uda.', tag: 'frazeologiczny', note: 'Kontaminacja – skrzyżowanie dwóch związków: „w każdym razie” i „bądź co bądź”.' },
  { front: 'Wziąć udział w finale – to dla mnie wielka rzecz, aż mi ręce opadły ze szczęścia.', back: '…aż podskoczyłem ze szczęścia.', tag: 'frazeologiczny', note: '„Ręce opadają” wyraża bezradność i zniechęcenie – nie radość.' },
  { front: 'To bardzo przekonywujący argument.', back: 'To bardzo przekonujący argument.', tag: 'słowotwórczy', note: 'Imiesłów od „przekonywać” to „przekonujący”.' },
  { front: 'Wyłanczam komputer.', back: 'Wyłączam komputer.', tag: 'fonetyczny', note: 'Błąd wymowy przeniesiony do pisowni – w „wyłączać” nie ma „n”.' },
];

const IDIOMS: Card[] = [
  { front: 'syzyfowa praca', back: 'praca ciężka, daremna i nigdy niekończąca się', tag: 'mitologia', note: 'Syzyf za karę w nieskończoność wtacza na górę głaz, który zawsze stacza się w dół.' },
  { front: 'puszka Pandory', back: 'źródło nieszczęść i kłopotów', tag: 'mitologia', note: 'Pandora otworzyła puszkę (stągiew), z której wydostały się na świat wszystkie nieszczęścia; na dnie została nadzieja.' },
  { front: 'pięta Achillesa', back: 'czyjś słaby, czuły punkt', tag: 'mitologia', note: 'Tetyda zanurzyła Achillesa w Styksie, trzymając go za piętę – tylko ona pozostała bezbronna.' },
  { front: 'nić Ariadny', back: 'sposób wyjścia z trudnej sytuacji', tag: 'mitologia', note: 'Dzięki nici od Ariadny Tezeusz wydostał się z labiryntu Minotaura.' },
  { front: 'wdowi grosz', back: 'skromny dar ofiarowany z serca, choć ofiarodawca sam niewiele ma', tag: 'Biblia', note: 'Ewangeliczna uboga wdowa wrzuciła do skarbony dwa drobne pieniążki – wszystko, co miała.' },
  { front: 'hiobowe wieści', back: 'złe, tragiczne wiadomości', tag: 'Biblia', note: 'Hiob otrzymywał kolejno wieści o utracie dobytku i dzieci.' },
  { front: 'kamień węgielny', back: 'podstawa, fundament czegoś', tag: 'Biblia', note: 'Kamień narożny, na którym opiera się cała budowla; w Biblii – symbol Chrystusa.' },
  { front: 'węzeł gordyjski', back: 'zawiły problem, rozwiązany radykalnym posunięciem', tag: 'historia', note: 'Aleksander Wielki zamiast rozplątać węzeł w Gordion – przeciął go mieczem.' },
  { front: 'koń trojański', back: 'podstęp, który pozwala wedrzeć się do wnętrza obozu przeciwnika', tag: 'mitologia', note: 'Grecy ukryli wojowników w drewnianym koniu, którego Trojanie sami wciągnęli do miasta.' },
];

function makeCards(cards: Card[], allLabel: string) {
  return function CardsScene({ params }: SceneProps) {
    const filter = String(params.filter ?? 'all');
    const [open, setOpen] = useState<Set<number>>(new Set());
    const shown = cards.map((c, i) => [c, i] as const).filter(([c]) => filter === 'all' || c.tag.startsWith(filter));
    const flip = (i: number) =>
      setOpen((o) => {
        const n = new Set(o);
        if (n.has(i)) n.delete(i);
        else n.add(i);
        return n;
      });
    return (
      <div className="poem cards">
        <div className="poem-source">
          {filter === 'all' ? allLabel : filter} · kliknij kartę, aby ją odwrócić
        </div>
        <div className="flip-grid">
          <AnimatePresence>
            {shown.map(([c, i]) => {
              const on = open.has(i);
              return (
                <motion.button type="button" key={i} className={`flip ${on ? 'on' : ''}`} onClick={() => flip(i)} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                  <motion.span className="flip-inner" animate={{ rotateY: on ? 180 : 0 }} transition={{ duration: 0.45 }}>
                    <span className="flip-face front">
                      <small>{c.tag}</small>
                      {c.front}
                    </span>
                    <span className="flip-face back">
                      <b>{c.back}</b>
                      <small>{c.note}</small>
                    </span>
                  </motion.span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    );
  };
}

const ErrorsScene = makeCards(ERRORS, 'wszystkie błędy');
const IdiomsScene = makeCards(IDIOMS, 'wszystkie frazeologizmy');

export const communication: Topic = {
  id: 'komunikacja-i-poprawnosc',
  title: 'Komunikacja, style i poprawność',
  subject: 'polski',
  summary: 'Schemat aktu komunikacji i funkcje wypowiedzi, jedna sytuacja w pięciu stylach, karty z błędami językowymi i frazeologizmami.',
  accent: '#c2410c',
  glyph: '❝',
  steps: [
    {
      title: 'Akt komunikacji i funkcje wypowiedzi',
      kind: 'page',
      scene: CommScene,
      controls: [
        {
          type: 'select',
          key: 'fn',
          label: 'Funkcja',
          default: 'informatywna',
          options: Object.entries(FUNCS).map(([value, f]) => ({ value, label: f.name.split(' (')[0] })),
        },
      ],
      body: (
        <>
          <p>
            Każda wypowiedź to <strong>akt komunikacji</strong>: nadawca przekazuje odbiorcy komunikat, korzystając z kodu
            (języka) i kanału, w jakimś kontekście.
          </p>
          <p>
            Według Romana Jakobsona każdemu elementowi odpowiada jedna <strong>funkcja</strong>. Wybierz funkcję – zaświeci
            się element, na którym się skupia.
          </p>
          <p>Jedna wypowiedź może pełnić kilka funkcji naraz – w analizie wskazujemy funkcję dominującą.</p>
        </>
      ),
    },
    {
      title: 'Style funkcjonalne',
      kind: 'page',
      scene: StylesScene,
      controls: [
        {
          type: 'select',
          key: 'style',
          label: 'Styl',
          default: 'potoczny',
          options: Object.entries(STYLES).map(([value, s]) => ({ value, label: s.name.replace('styl ', '') })),
        },
      ],
      body: (
        <>
          <p>
            Ta sama treść brzmi zupełnie inaczej zależnie od sytuacji i celu. Odmiany języka dobrane do sytuacji to{' '}
            <strong>style funkcjonalne</strong>.
          </p>
          <p>
            Przełączaj style i porównuj: słownictwo, długość zdań, emocje, obecność „ja”. Styl artystyczny może korzystać z
            każdego z pozostałych.
          </p>
          <p>Na maturze ocenia się stosowność stylu – w rozprawce piszemy stylem zbliżonym do naukowego i publicystycznego.</p>
        </>
      ),
    },
    {
      title: 'Błędy językowe',
      kind: 'page',
      scene: ErrorsScene,
      controls: [
        {
          type: 'select',
          key: 'filter',
          label: 'Rodzaj błędu',
          default: 'all',
          options: [
            { value: 'all', label: 'wszystkie' },
            { value: 'fleksyjny', label: 'fleksyjne' },
            { value: 'składniowy', label: 'składniowe' },
            { value: 'leksykalny', label: 'leksykalne' },
            { value: 'frazeologiczny', label: 'frazeologiczne' },
            { value: 'słowotwórczy', label: 'słowotwórcze' },
            { value: 'fonetyczny', label: 'fonetyczne' },
          ],
        },
      ],
      body: (
        <>
          <p>Na każdej karcie jest zdanie z błędem. Spróbuj go znaleźć i poprawić w myślach, zanim odwrócisz kartę.</p>
          <p>
            <strong>Fleksyjne</strong> – zła odmiana. <strong>Składniowe</strong> – złe łączenie wyrazów w zdaniu.{' '}
            <strong>Leksykalne</strong> – słowo w złym znaczeniu. <strong>Frazeologiczne</strong> – zniekształcony związek
            frazeologiczny. <strong>Słowotwórcze</strong> – źle utworzony wyraz. <strong>Fonetyczne</strong> – błędy
            wymowy.
          </p>
        </>
      ),
    },
    {
      title: 'Frazeologizmy i ich źródła',
      kind: 'page',
      scene: IdiomsScene,
      controls: [
        {
          type: 'select',
          key: 'filter',
          label: 'Źródło',
          default: 'all',
          options: [
            { value: 'all', label: 'wszystkie' },
            { value: 'mitologia', label: 'mitologia' },
            { value: 'Biblia', label: 'Biblia' },
            { value: 'historia', label: 'historia' },
          ],
        },
      ],
      body: (
        <>
          <p>
            <strong>Związek frazeologiczny</strong> to utrwalone połączenie wyrazów o znaczeniu przenośnym – nie wynika ono z
            sumy znaczeń słów.
          </p>
          <p>
            Wiele frazeologizmów pochodzi z <strong>mitologii</strong> i <strong>Biblii</strong> – fundamentów kultury
            europejskiej. Znajomość ich źródeł przydaje się w interpretacji tekstów i w rozprawce.
          </p>
        </>
      ),
    },
  ],
};
