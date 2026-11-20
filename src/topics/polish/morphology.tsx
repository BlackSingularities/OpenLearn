import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';
import { Marked } from './marked';

/* ======================= Krok 1: części mowy ======================= */

type Pos = 'rzeczownik' | 'czasownik' | 'przymiotnik' | 'liczebnik' | 'zaimek' | 'przyslowek' | 'przyimek' | 'spojnik' | 'partykula' | 'wykrzyknik';

const POS: Record<Pos, { name: string; color: string; q: string; inflected: boolean }> = {
  rzeczownik: { name: 'rzeczownik', color: '#3d8bff', q: 'kto? co?', inflected: true },
  czasownik: { name: 'czasownik', color: '#ef4444', q: 'co robi? co się z nim dzieje?', inflected: true },
  przymiotnik: { name: 'przymiotnik', color: '#e0913a', q: 'jaki? który? czyj?', inflected: true },
  liczebnik: { name: 'liczebnik', color: '#eab308', q: 'ile? który z kolei?', inflected: true },
  zaimek: { name: 'zaimek', color: '#ec4899', q: 'zastępuje inne części mowy', inflected: true },
  przyslowek: { name: 'przysłówek', color: '#a855f7', q: 'jak? gdzie? kiedy?', inflected: false },
  przyimek: { name: 'przyimek', color: '#14b8a6', q: 'łączy się z rzeczownikiem: w, na, do, o…', inflected: false },
  spojnik: { name: 'spójnik', color: '#22b07d', q: 'łączy wyrazy i zdania: i, ale, że…', inflected: false },
  partykula: { name: 'partykuła', color: '#64748b', q: 'nadaje odcień znaczeniowy: nie, czy, nawet…', inflected: false },
  wykrzyknik: { name: 'wykrzyknik', color: '#f97316', q: 'wyraża emocje: och, ach, hej…', inflected: false },
};

const POS_SENTENCES: Record<string, [string, Pos][]> = {
  kot: [
    ['Och,', 'wykrzyknik'],
    ['nasz', 'zaimek'],
    ['mały', 'przymiotnik'],
    ['kot', 'rzeczownik'],
    ['znowu', 'przyslowek'],
    ['zjadł', 'czasownik'],
    ['dwie', 'liczebnik'],
    ['ryby', 'rzeczownik'],
    ['i', 'spojnik'],
    ['nawet', 'partykula'],
    ['nie', 'partykula'],
    ['zostawił', 'czasownik'],
    ['ości', 'rzeczownik'],
    ['na', 'przyimek'],
    ['talerzu.', 'rzeczownik'],
  ],
  uczen: [
    ['Pierwszy', 'liczebnik'],
    ['uczeń', 'rzeczownik'],
    ['bardzo', 'przyslowek'],
    ['starannie', 'przyslowek'],
    ['napisał', 'czasownik'],
    ['swoje', 'zaimek'],
    ['trudne', 'przymiotnik'],
    ['wypracowanie', 'rzeczownik'],
    ['o', 'przyimek'],
    ['wojnie,', 'rzeczownik'],
    ['ale', 'spojnik'],
    ['czy', 'partykula'],
    ['zdał?', 'czasownik'],
  ],
};

function PosScene({ params }: SceneProps) {
  const sid = String(params.sentence ?? 'kot');
  const sent = POS_SENTENCES[sid];
  const color = Boolean(params.color);
  const split = Boolean(params.split);
  const chip = (w: string, p: Pos, i: number) => (
    <motion.span
      key={`${sid}-${i}`}
      layoutId={`${sid}-${i}`}
      className={`pos-tok ${color ? 'on' : ''}`}
      style={{ '--pc': POS[p].color } as React.CSSProperties}
      transition={{ type: 'spring', stiffness: 260, damping: 26, delay: split ? i * 0.03 : 0 }}
      title={POS[p].name}
    >
      {w}
      {color && <small>{POS[p].name}</small>}
    </motion.span>
  );
  return (
    <div className="poem pos">
      <LayoutGroup id={`pos-${sid}`}>
        {!split ? (
          <div className="pos-sentence">{sent.map(([w, p], i) => chip(w, p, i))}</div>
        ) : (
          <div className="pos-bins">
            {[true, false].map((inf) => (
              <div key={String(inf)} className="pos-bin">
                <h4>{inf ? 'odmienne' : 'nieodmienne'}</h4>
                <div className="pos-sentence">{sent.map(([w, p], i) => (POS[p].inflected === inf ? chip(w, p, i) : null))}</div>
              </div>
            ))}
          </div>
        )}
      </LayoutGroup>
      <div className="parts-legend">
        {(Object.keys(POS) as Pos[]).map((p) => (
          <span key={p} style={{ '--pc': POS[p].color } as React.CSSProperties}>
            <b className="pos-dot">{POS[p].name}</b>
            <small>{POS[p].q}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ======================= Krok 2: deklinacja ======================= */

const CASES = [
  { name: 'mianownik', q: 'kto? co?' },
  { name: 'dopełniacz', q: 'kogo? czego?' },
  { name: 'celownik', q: 'komu? czemu?' },
  { name: 'biernik', q: 'kogo? co?' },
  { name: 'narzędnik', q: 'z kim? z czym?' },
  { name: 'miejscownik', q: 'o kim? o czym?' },
  { name: 'wołacz', q: 'o!' },
];

/** Forma: „temat|końcówka”, opcjonalnie oboczność. */
type Form = [string, string?];

const NOUNS: Record<string, { label: string; gender: string; sg: Form[]; pl: Form[]; note: string }> = {
  kot: {
    label: 'kot',
    gender: 'rodzaj męski',
    sg: [['kot|'], ['kot|a'], ['kot|u'], ['kot|a'], ['kot|em'], ['koci|e', 't : ć'], ['koci|e', 't : ć']],
    pl: [['kot|y'], ['kot|ów'], ['kot|om'], ['kot|y'], ['kot|ami'], ['kot|ach'], ['kot|y']],
    note: 'Końcówka zerowa (∅) w mianowniku – wyraz kończy się tematem. W miejscowniku i wołaczu temat się zmiękcza: t wymienia się na ć.',
  },
  noga: {
    label: 'noga',
    gender: 'rodzaj żeński',
    sg: [['nog|a'], ['nog|i'], ['nodz|e', 'g : dz'], ['nog|ę'], ['nog|ą'], ['nodz|e', 'g : dz'], ['nog|o']],
    pl: [['nog|i'], ['nóg|', 'o : ó'], ['nog|om'], ['nog|i'], ['nog|ami'], ['nog|ach'], ['nog|i']],
    note: 'Dwie oboczności: g : dz (nodze) i o : ó (nóg). Wymiana o : ó podpowiada pisownię – stąd „nóg” przez ó.',
  },
  okno: {
    label: 'okno',
    gender: 'rodzaj nijaki',
    sg: [['okn|o'], ['okn|a'], ['okn|u'], ['okn|o'], ['okn|em'], ['okni|e', 'n : ń'], ['okn|o']],
    pl: [['okn|a'], ['okien|', 'e ruchome'], ['okn|om'], ['okn|a'], ['okn|ami'], ['okn|ach'], ['okn|a']],
    note: 'W rzeczownikach nijakich mianownik, biernik i wołacz mają tę samą formę. W dopełniaczu lm pojawia się e ruchome: okien.',
  },
  przyjaciel: {
    label: 'przyjaciel',
    gender: 'rodzaj męski (nieregularny)',
    sg: [['przyjaciel|'], ['przyjaciel|a'], ['przyjaciel|owi'], ['przyjaciel|a'], ['przyjaciel|em'], ['przyjaciel|u'], ['przyjaciel|u']],
    pl: [['przyjaciel|e'], ['przyjaciół|', 'e : o : ó'], ['przyjacioł|om', 'e : o'], ['przyjaciół|', 'e : o : ó'], ['przyjaciół|mi', 'e : o : ó'], ['przyjacioł|ach', 'e : o'], ['przyjaciel|e']],
    note: 'Odmiana nieregularna: w liczbie mnogiej temat zmienia się z „przyjaciel-” na „przyjacioł-/przyjaciół-”. Uwaga na narzędnik: przyjaciółmi.',
  },
};

function DeclensionScene({ params }: SceneProps) {
  const nid = String(params.noun ?? 'kot');
  const plural = Boolean(params.plural);
  const n = NOUNS[nid];
  const forms = plural ? n.pl : n.sg;
  return (
    <div className="poem flex-table">
      <div className="poem-source">
        {n.label} · {n.gender} · liczba {plural ? 'mnoga' : 'pojedyncza'}
      </div>
      <div className="ftable">
        {CASES.map((c, i) => {
          const [form, alt] = forms[i];
          const [stem, end] = form.split('|');
          return (
            <motion.div key={c.name} className="frow" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <span className="fcase">
                {c.name}
                <small>{c.q}</small>
              </span>
              <AnimatePresence mode="wait">
                <motion.span key={`${nid}-${plural}-${i}`} className="fform" initial={{ rotateX: -90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: 90, opacity: 0 }} transition={{ duration: 0.22, delay: i * 0.04 }}>
                  <span className={alt ? 'stem alt' : 'stem'}>{stem}</span>
                  <span className={`end ${end ? '' : 'zero'}`}>{end || '∅'}</span>
                  {alt && <em className="alt-tag">{alt}</em>}
                </motion.span>
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
      <div className="legend">
        <span>
          <b className="mk-stem">temat</b> + <b className="mk-end">końcówka</b>
        </span>
        <span>
          <b className="mk-alt">podkreślony temat</b> – oboczność
        </span>
      </div>
      <p className="poem-info">{n.note}</p>
    </div>
  );
}

/* ======================= Krok 3: koniugacja ======================= */

type Tense = 'teraz' | 'przeszly' | 'przyszly' | 'przyp' | 'rozk';
const PERSONS = ['ja', 'ty', 'on / ona / ono', 'my', 'wy', 'oni / one'];

const IMPERF: Record<Tense, string[]> = {
  teraz: ['czyta[m]', 'czyta[sz]', 'czyta', 'czyta[my]', 'czyta[cie]', 'czytaj[ą]'],
  przeszly: ['czytał[em]', 'czytał[eś]', 'czytał', 'czytali[śmy]', 'czytali[ście]', 'czytali'],
  przyszly: ['[będę] czytać', '[będziesz] czytać', '[będzie] czytać', '[będziemy] czytać', '[będziecie] czytać', '[będą] czytać'],
  przyp: ['czytał[bym]', 'czytał[byś]', 'czytał[by]', 'czytali[byśmy]', 'czytali[byście]', 'czytali[by]'],
  rozk: ['–', 'czytaj', '[niech] czyta', 'czytaj[my]', 'czytaj[cie]', '[niech] czytają'],
};
const PERF: Record<Tense, string[] | null> = {
  teraz: null,
  przeszly: IMPERF.przeszly.map((f) => `prze${f}`),
  przyszly: ['przeczyta[m]', 'przeczyta[sz]', 'przeczyta', 'przeczyta[my]', 'przeczyta[cie]', 'przeczytaj[ą]'],
  przyp: IMPERF.przyp.map((f) => `prze${f}`),
  rozk: ['–', 'przeczytaj', '[niech] przeczyta', 'przeczytaj[my]', 'przeczytaj[cie]', '[niech] przeczytają'],
};

const TENSE_NOTES: Record<Tense, { imperf: string; perf: string }> = {
  teraz: { imperf: 'Czas teraźniejszy – czynność trwa teraz. Końcówki osobowe: -m, -sz, ∅, -my, -cie, -ą.', perf: 'Czasownik dokonany nie ma czasu teraźniejszego – czynność zakończona nie może „właśnie trwać”.' },
  przeszly: { imperf: 'Czas przeszły tworzymy od tematu z -ł- (czytał-) i końcówek -em, -eś, -śmy, -ście. W tabeli formy rodzaju męskiego.', perf: 'Dokonany czas przeszły mówi o czynności zakończonej: przeczytałem całą książkę.' },
  przyszly: { imperf: 'Czas przyszły złożony: „być” w czasie przyszłym + bezokolicznik (albo forma na -ł: będę czytał).', perf: 'Czas przyszły prosty: wygląda jak teraźniejszy, ale znaczy przyszłość – przeczytam jutro.' },
  przyp: { imperf: 'Tryb przypuszczający: forma czasu przeszłego + cząstka -by z końcówką osobową. Piszemy łącznie z czasownikiem.', perf: 'Tryb przypuszczający od czasownika dokonanego: przeczytałbym, gdybym miał czas.' },
  rozk: { imperf: 'Tryb rozkazujący: polecenia i prośby. Dla 3. osoby używamy „niech”. Brak formy dla „ja”.', perf: 'Tryb rozkazujący dokonany: przeczytaj to do jutra!' },
};

function ConjugationScene({ params }: SceneProps) {
  const perf = String(params.aspect ?? 'niedok') === 'dok';
  const tense = String(params.tense ?? 'teraz') as Tense;
  const forms = perf ? PERF[tense] : IMPERF[tense];
  const note = TENSE_NOTES[tense][perf ? 'perf' : 'imperf'];
  return (
    <div className="poem flex-table">
      <div className="poem-source">
        {perf ? 'przeczytać – aspekt dokonany' : 'czytać – aspekt niedokonany'}
      </div>
      <AnimatePresence mode="wait">
        {forms ? (
          <motion.div key={`${perf}-${tense}`} className="conj-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="conj-h">liczba pojedyncza</span>
            <span className="conj-h">liczba mnoga</span>
            {[0, 3, 1, 4, 2, 5].map((k, i) => (
              <motion.span key={k} className="conj-cell" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <small>{PERSONS[k]}</small>
                <span className="fform">
                  <Marked text={forms[k]} />
                </span>
              </motion.span>
            ))}
          </motion.div>
        ) : (
          <motion.div key="none" className="conj-none" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            ✗ brak form
          </motion.div>
        )}
      </AnimatePresence>
      <p className="poem-info">{note}</p>
    </div>
  );
}

/* ======================= Krok 4: stopniowanie ======================= */

const DEGREES: Record<string, { forms: [string, string, string]; kind: string; note: string }> = {
  mlody: { forms: ['młody', 'młod[szy]', '[naj]młod[szy]'], kind: 'stopniowanie proste (regularne)', note: 'Formant -szy w stopniu wyższym, naj- + -szy w najwyższym.' },
  ladny: { forms: ['ładny', 'ładn[iejszy]', '[naj]ładn[iejszy]'], kind: 'stopniowanie proste (regularne)', note: 'Gdy temat kończy się kilkoma spółgłoskami lub trudno go wymówić z -szy, używamy -ejszy (-iejszy).' },
  dobry: { forms: ['dobry', '[lepszy]', '[najlepszy]'], kind: 'stopniowanie nieregularne (supletywne)', note: 'Stopień wyższy ma zupełnie inny temat. Tak samo: zły – gorszy, duży – większy, mały – mniejszy.' },
  duzy: { forms: ['duży', '[większy]', '[największy]'], kind: 'stopniowanie nieregularne (supletywne)', note: 'Formy wyższe pochodzą od innego rdzenia – trzeba je zapamiętać.' },
  ciekawy: { forms: ['interesujący', '[bardziej] interesujący', '[najbardziej] interesujący'], kind: 'stopniowanie opisowe', note: 'Przymiotniki odczasownikowe i trudne do stopniowania prostego łączymy z „bardziej” i „najbardziej”.' },
  szybko: { forms: ['szybko', 'szybc[iej]', '[naj]szybc[iej]'], kind: 'przysłówek – stopniowanie proste', note: 'Przysłówki stopniują się podobnie jak przymiotniki: formant -ej (-iej), oboczność k : c.' },
};

function DegreeScene({ params }: SceneProps) {
  const id = String(params.word ?? 'mlody');
  const d = DEGREES[id];
  const labels = ['stopień równy', 'stopień wyższy', 'stopień najwyższy'];
  return (
    <div className="poem degrees">
      <div className="deg-bars">
        {d.forms.map((f, i) => (
          <div key={i} className="deg-col">
            <motion.div className="deg-bar" initial={{ height: 0 }} animate={{ height: 40 + i * 55 }} transition={{ type: 'spring', stiffness: 120, damping: 16, delay: i * 0.12 }} />
            <AnimatePresence mode="wait">
              <motion.span key={`${id}-${i}`} className="deg-word" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.2 + i * 0.12 }}>
                <Marked text={f} />
              </motion.span>
            </AnimatePresence>
            <small>{labels[i]}</small>
          </div>
        ))}
      </div>
      <p className="poem-info">
        <b>{d.kind}.</b> {d.note}
      </p>
    </div>
  );
}

export const morphology: Topic = {
  id: 'czesci-mowy-fleksja',
  title: 'Części mowy i fleksja',
  subject: 'polski',
  summary: 'Rozsyp zdanie na części mowy, odmień rzeczownik przez przypadki z obocznościami, porównaj aspekty czasownika i stopniuj przymiotniki.',
  accent: '#f59e0b',
  glyph: '§',
  steps: [
    {
      title: 'Części mowy',
      kind: 'page',
      scene: PosScene,
      controls: [
        {
          type: 'select',
          key: 'sentence',
          label: 'Zdanie',
          default: 'kot',
          options: [
            { value: 'kot', label: 'Och, nasz mały kot…' },
            { value: 'uczen', label: 'Pierwszy uczeń…' },
          ],
        },
        { type: 'toggle', key: 'color', label: 'Pokaż części mowy', default: true },
        { type: 'toggle', key: 'split', label: 'Podziel na odmienne i nieodmienne', default: false },
      ],
      body: (
        <>
          <p>
            W polszczyźnie wyróżniamy <strong>dziesięć części mowy</strong>. Pierwsze zdanie zawiera wszystkie – znajdź je
            po kolorach.
          </p>
          <p>
            <strong>Odmienne</strong>: rzeczownik, czasownik, przymiotnik, liczebnik, zaimek. <strong>Nieodmienne</strong>:
            przysłówek, przyimek, spójnik, partykuła, wykrzyknik. Włącz podział i patrz, jak wyrazy rozchodzą się do dwóch
            grup.
          </p>
          <p>
            Rzeczowniki <strong>odmieniają się przez przypadki</strong> (deklinacja), czasowniki – przez osoby, czasy i tryby
            (koniugacja).
          </p>
        </>
      ),
    },
    {
      title: 'Deklinacja i oboczności',
      kind: 'page',
      scene: DeclensionScene,
      controls: [
        {
          type: 'select',
          key: 'noun',
          label: 'Rzeczownik',
          default: 'kot',
          options: Object.entries(NOUNS).map(([value, n]) => ({ value, label: n.label })),
        },
        { type: 'toggle', key: 'plural', label: 'Liczba mnoga', default: false },
      ],
      body: (
        <>
          <p>
            Forma wyrazu odmiennego składa się z <strong>tematu fleksyjnego</strong> (części stałej) i{' '}
            <strong>końcówki</strong> (części zmiennej). Gdy końcówki „nie widać”, mówimy o końcówce zerowej ∅.
          </p>
          <p>
            Przy odmianie temat bywa zmieniony – to <strong>oboczności</strong>, np. <em>noga – nodze</em>,{' '}
            <em>noga – nóg</em>. Pomagają w ortografii: „ó” wymienne na „o” piszemy przez ó.
          </p>
          <p>Siedem przypadków ma swoje pytania – zadawaj je, aby rozpoznać formę.</p>
        </>
      ),
    },
    {
      title: 'Koniugacja, czasy i tryby',
      kind: 'page',
      scene: ConjugationScene,
      controls: [
        {
          type: 'select',
          key: 'aspect',
          label: 'Aspekt',
          default: 'niedok',
          options: [
            { value: 'niedok', label: 'niedokonany (czytać)' },
            { value: 'dok', label: 'dokonany (przeczytać)' },
          ],
        },
        {
          type: 'select',
          key: 'tense',
          label: 'Czas / tryb',
          default: 'teraz',
          options: [
            { value: 'teraz', label: 'czas teraźniejszy' },
            { value: 'przeszly', label: 'czas przeszły' },
            { value: 'przyszly', label: 'czas przyszły' },
            { value: 'przyp', label: 'tryb przypuszczający' },
            { value: 'rozk', label: 'tryb rozkazujący' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Czasownik odmienia się przez <strong>osoby, liczby, czasy, tryby</strong> (a w czasie przeszłym także przez
            rodzaje). Wyróżnione cząstki to końcówki i elementy, które tworzą daną formę.
          </p>
          <p>
            Kluczowy jest <strong>aspekt</strong>: <em>czytać</em> (niedokonany) mówi o czynności w trakcie,{' '}
            <em>przeczytać</em> (dokonany) – o zakończonej. Dlatego czasownik dokonany nie ma czasu teraźniejszego, a jego
            czas przyszły jest prosty.
          </p>
          <p>Przełącz aspekt przy czasie teraźniejszym i przyszłym – różnica jest najlepiej widoczna.</p>
        </>
      ),
    },
    {
      title: 'Stopniowanie',
      kind: 'page',
      scene: DegreeScene,
      controls: [
        {
          type: 'select',
          key: 'word',
          label: 'Wyraz',
          default: 'mlody',
          options: Object.entries(DEGREES).map(([value, d]) => ({ value, label: d.forms[0] })),
        },
      ],
      body: (
        <>
          <p>
            Przymiotniki i przysłówki mają trzy <strong>stopnie</strong>: równy, wyższy i najwyższy.
          </p>
          <p>
            Stopniowanie bywa <strong>proste</strong> (formanty -szy, -ejszy, naj-), <strong>opisowe</strong> (bardziej,
            najbardziej) albo <strong>nieregularne</strong> (dobry – lepszy).
          </p>
          <p>
            Nie stopniują się przymiotniki oznaczające cechy „zero-jedynkowe”: <em>drewniany, polski, martwy</em>. Uwaga na
            błąd „bardziej lepszy” – to podwójne stopniowanie.
          </p>
        </>
      ),
    },
  ],
};
