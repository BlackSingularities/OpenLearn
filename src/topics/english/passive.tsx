import { AnimatePresence, motion } from 'framer-motion';
import type { Control, SceneProps, Topic } from '../../lib/types';
import { MorphSentence, RoleLegend, toks } from '../../lib/Morph';
import { useAnimationClock } from '../../lib/useAnimationClock';

const COLORS = { subj: '#3d8bff', verb: '#22b07d', obj: '#e0913a', agent: '#a855f7' };
const LEGEND = [
  { color: COLORS.subj, label: 'wykonawca (podmiot w stronie czynnej)' },
  { color: COLORS.obj, label: 'obiekt czynności' },
  { color: COLORS.verb, label: 'czasownik' },
  { color: COLORS.agent, label: 'by + wykonawca' },
];

interface Example {
  label: string;
  form: string;
  active: string;
  passive: string;
  note: string;
}

const EXAMPLES: Record<string, Example> = {
  presentSimple: {
    label: 'Present Simple',
    form: 'am / is / are + V3',
    active: 's:Students@subj | v1:clean@verb | o:the classroom@obj | t:every day.',
    passive: 'o:The classroom@obj | v0:is@verb | v1:cleaned@verb | s:by students@agent | t:every day.',
    note: 'Obiekt czynności wędruje na początek i staje się podmiotem. Wykonawca – jeśli w ogóle zostaje – trafia na koniec po „by”.',
  },
  pastSimple: {
    label: 'Past Simple',
    form: 'was / were + V3',
    active: 's:Someone@subj | v1:stole@verb | o:my bike.@obj',
    passive: 'o:My bike@obj | v0:was@verb | v1:stolen.@verb',
    note: 'Wykonawca jest nieznany („someone”), więc go pomijamy. To najczęstszy powód użycia strony biernej.',
  },
  presentContinuous: {
    label: 'Present Continuous',
    form: 'am / is / are being + V3',
    active: 's:Workers@subj | v0:are@verb | v1:repairing@verb | o:the road.@obj',
    passive: 'o:The road@obj | v0:is being@verb | v1:repaired@verb | s:by workers.@agent',
    note: 'Forma ciągła w stronie biernej: „being” + V3. Liczba czasownika (is/are) zgadza się z nowym podmiotem.',
  },
  presentPerfect: {
    label: 'Present Perfect',
    form: 'has / have been + V3',
    active: 's:They@subj | v0:have@verb | v1:built@verb | o:a new bridge.@obj',
    passive: 'o:A new bridge@obj | v0:has been@verb | v1:built.@verb',
    note: '„They” to ogólnikowy wykonawca – w stronie biernej znika. Zauważ zmianę have → has (nowy podmiot w liczbie pojedynczej).',
  },
  future: {
    label: 'Future Simple',
    form: 'will be + V3',
    active: 's:They@subj | v0:will@verb | v1:announce@verb | o:the results@obj | t:tomorrow.',
    passive: 'o:The results@obj | v0:will be@verb | v1:announced@verb | t:tomorrow.',
    note: 'Po „will” zawsze „be” w formie podstawowej, niezależnie od podmiotu.',
  },
  modal: {
    label: 'Czasowniki modalne',
    form: 'modal + be + V3',
    active: 's:You@subj | v0:must@verb | v1:wear@verb | o:a helmet.@obj',
    passive: 'o:A helmet@obj | v0:must be@verb | v1:worn.@verb',
    note: 'Tak samo z can, should, may, might: „It can be done”, „It should be checked”.',
  },
  causativeCar: {
    label: 'have something done',
    form: 'have + obiekt + V3',
    active: 's:A mechanic@subj | v1:repaired@verb | o:my car.@obj',
    passive: 'i:I@subj | h:had@verb | o:my car@obj | v1:repaired@verb | s:(by a mechanic).@agent',
    note: 'Konstrukcja kauzatywna: ktoś wykonał usługę dla nas. Po polsku: „naprawiłem samochód” – choć zrobił to mechanik!',
  },
  causativeHair: {
    label: 'get something done',
    form: 'get + obiekt + V3',
    active: 's:The hairdresser@subj | v1:cut@verb | o:my hair@obj | t:yesterday.',
    passive: 'i:I@subj | h:got@verb | o:my hair@obj | v1:cut@verb | t:yesterday.',
    note: '„Get” zamiast „have” – bardziej potocznie. „I cut my hair” znaczyłoby, że obciąłem włosy sam.',
  },
};

function PassiveScene({ params }: SceneProps) {
  const ex = EXAMPLES[String(params.example ?? 'presentSimple')];
  const auto = Boolean(params.auto);
  const t = useAnimationClock(auto, 1);
  const passive = auto ? Math.floor(t / 2.8) % 2 === 1 : Boolean(params.passive ?? true);
  const causative = ex.label.includes('something');

  return (
    <div className="cond passive">
      <div className="voice-switch" aria-hidden>
        <span className={!passive ? 'on' : ''}>{causative ? 'zwykłe zdanie' : 'Active'}</span>
        <span className={passive ? 'on' : ''}>{causative ? 'causative' : 'Passive'}</span>
        <motion.i layout className="voice-knob" style={{ left: passive ? '50%' : '0%' }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
      </div>

      <MorphSentence id={ex.label} tokens={toks(passive ? ex.passive : ex.active)} colors={COLORS} />

      <div className="cond-forms">
        <span style={{ '--cl': COLORS.verb } as React.CSSProperties}>
          <small>{ex.label}</small>
          <b>{ex.form}</b>
        </span>
      </div>
      <AnimatePresence mode="wait">
        <motion.p key={ex.note} className="cond-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {ex.note}
        </motion.p>
      </AnimatePresence>
      <RoleLegend items={LEGEND} />
    </div>
  );
}

function exampleControl(ids: string[], def: string): Control {
  return { type: 'select', key: 'example', label: 'Przykład', default: def, options: ids.map((id) => ({ value: id, label: EXAMPLES[id].label })) };
}
const autoControl: Control = { type: 'toggle', key: 'auto', label: 'Przełączaj automatycznie', default: true };
const passiveControl: Control = { type: 'toggle', key: 'passive', label: 'Pokaż drugą wersję (gdy auto wyłączone)', default: true };

export const passive: Topic = {
  id: 'english-passive',
  title: 'Passive Voice – strona bierna',
  subject: 'angielski',
  summary: 'Zobacz, jak słowa zamieniają się miejscami: obiekt idzie na początek, czasownik zmienia formę, a wykonawca znika lub chowa się za „by”.',
  accent: '#0d9488',
  glyph: '⇆',
  steps: [
    {
      title: 'Jak powstaje strona bierna',
      kind: 'page',
      scene: PassiveScene,
      preset: { example: 'presentSimple' },
      controls: [autoControl, passiveControl],
      body: (
        <>
          <p>
            Stronę bierną (<em>passive voice</em>) wybieramy, gdy ważniejsze jest <strong>co się dzieje</strong> niż{' '}
            <strong>kto to robi</strong>.
          </p>
          <p>Przekształcenie w trzech ruchach:</p>
          <p>
            1. <strong>Obiekt</strong> (pomarańczowy) staje się podmiotem.
            <br />
            2. Czasownik: <strong>be</strong> w odpowiednim czasie + <strong>V3</strong>.
            <br />
            3. Wykonawca znika lub przechodzi na koniec po <strong>by</strong>.
          </p>
          <p>Obserwuj, jak „the classroom” przesuwa się na początek zdania.</p>
        </>
      ),
    },
    {
      title: 'Strona bierna w różnych czasach',
      kind: 'page',
      scene: PassiveScene,
      controls: [exampleControl(['pastSimple', 'presentContinuous', 'presentPerfect', 'future', 'modal'], 'pastSimple'), autoControl, passiveControl],
      body: (
        <>
          <p>
            Czas zdania zachowujemy – zmienia się tylko forma <strong>be</strong>. V3 (trzecia forma czasownika) zostaje
            zawsze taka sama.
          </p>
          <p>
            Wykonawcę pomijamy, gdy jest <strong>nieznany</strong> (someone), <strong>oczywisty</strong> lub{' '}
            <strong>ogólny</strong> (they, people). Dodajemy „by…”, gdy to nowa, ważna informacja.
          </p>
          <p>Przełączaj czasy i porównaj formy w zielonej ramce.</p>
        </>
      ),
    },
    {
      title: 'Have / get something done',
      kind: 'page',
      scene: PassiveScene,
      controls: [exampleControl(['causativeCar', 'causativeHair'], 'causativeCar'), autoControl, passiveControl],
      body: (
        <>
          <p>
            <strong>Konstrukcja kauzatywna</strong> mówi, że ktoś wykonał dla nas usługę: fryzjer, mechanik, malarz.
          </p>
          <div className="formula">have / get + obiekt + V3</div>
          <p>
            Uwaga na szyk: obiekt stoi <strong>przed</strong> V3. „I had my car repaired” = ktoś naprawił mi samochód;
            „I had repaired my car” = sam go naprawiłem (Past Perfect).
          </p>
        </>
      ),
    },
  ],
};
