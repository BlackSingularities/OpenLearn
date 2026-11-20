import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { Control, SceneProps, Topic } from '../../lib/types';

/** Słowo zdania; `v` oznacza część formy czasownika (podświetlaną). */
type Tok = { w: string; v?: boolean };
const t = (s: string): Tok[] => s.split(' ').map((w) => (w.startsWith('*') ? { w: w.slice(1), v: true } : { w }));

interface Cond {
  name: string;
  ifPart: Tok[];
  main: Tok[];
  ifForm: string;
  mainForm: string;
  pl: string;
  /** 0 = rzeczywiste, 1 = całkowicie nierzeczywiste */
  reality: number;
  time: 'zawsze' | 'przyszłość' | 'teraźniejszość' | 'przeszłość' | 'przeszłość → teraz' | 'teraz → przeszłość';
  note: string;
}

const CONDS: Record<string, Cond> = {
  zero: {
    name: 'Zero Conditional',
    ifPart: t('If you *heat ice,'),
    main: t('it *melts.'),
    ifForm: 'Present Simple',
    mainForm: 'Present Simple',
    pl: 'Jeśli podgrzejesz lód, (on zawsze) topnieje.',
    reality: 0,
    time: 'zawsze',
    note: 'Prawa natury i ogólne prawdy – „if” znaczy tu prawie „when”.',
  },
  first: {
    name: 'First Conditional',
    ifPart: t('If it *rains tomorrow,'),
    main: t('we *will stay at home.'),
    ifForm: 'Present Simple',
    mainForm: 'will + V1',
    pl: 'Jeśli jutro będzie padać, zostaniemy w domu.',
    reality: 0.2,
    time: 'przyszłość',
    note: 'Realna możliwość w przyszłości. Uwaga: po „if” NIE używamy „will”, mimo że po polsku mówimy „będzie”.',
  },
  second: {
    name: 'Second Conditional',
    ifPart: t('If I *had more time,'),
    main: t('I *would learn Japanese.'),
    ifForm: 'Past Simple',
    mainForm: 'would + V1',
    pl: 'Gdybym miał więcej czasu, uczyłbym się japońskiego.',
    reality: 0.7,
    time: 'teraźniejszość',
    note: 'Sytuacja nierealna lub mało prawdopodobna TERAZ. Forma przeszła nie oznacza przeszłości, tylko dystans od rzeczywistości. Formalnie: „If I were you…”.',
  },
  third: {
    name: 'Third Conditional',
    ifPart: t('If I *had studied harder,'),
    main: t('I *would have passed the exam.'),
    ifForm: 'Past Perfect',
    mainForm: 'would have + V3',
    pl: 'Gdybym uczył się pilniej, zdałbym egzamin (ale nie zdałem).',
    reality: 1,
    time: 'przeszłość',
    note: 'Gdybanie o przeszłości, której nie da się zmienić – żal, krytyka, wyobrażanie innego scenariusza.',
  },
  mixedA: {
    name: 'Mixed: przeszłość → teraz',
    ifPart: t('If I *had taken that job,'),
    main: t('I *would live in London now.'),
    ifForm: 'Past Perfect',
    mainForm: 'would + V1',
    pl: 'Gdybym (wtedy) przyjął tę pracę, mieszkałbym teraz w Londynie.',
    reality: 1,
    time: 'przeszłość → teraz',
    note: 'Inny wybór w przeszłości i jego skutek w teraźniejszości. Część „if” z 3. trybu, część główna z 2. trybu.',
  },
  mixedB: {
    name: 'Mixed: teraz → przeszłość',
    ifPart: t('If I *spoke French,'),
    main: t('I *would have understood the film.'),
    ifForm: 'Past Simple',
    mainForm: 'would have + V3',
    pl: 'Gdybym mówił po francusku (ogólnie), zrozumiałbym (wczorajszy) film.',
    reality: 1,
    time: 'teraz → przeszłość',
    note: 'Stała cecha w teraźniejszości wyjaśnia przeszłe wydarzenie. Część „if” z 2. trybu, część główna z 3. trybu.',
  },
};

function Clause({ toks, clause, color }: { toks: Tok[]; clause: string; color: string }) {
  // klucz słowa: tekst + numer wystąpienia – wspólne słowa „przelatują” między wersjami
  const seen: Record<string, number> = {};
  return (
    <motion.span layout className="clause" style={{ '--cl': color } as React.CSSProperties}>
      <AnimatePresence mode="popLayout" initial={false}>
        {toks.map((tk) => {
          const base = tk.w.replace(/[.,]/g, '').toLowerCase();
          seen[base] = (seen[base] ?? 0) + 1;
          return (
            <motion.span
              key={`${clause}-${base}-${seen[base]}`}
              layout
              className={`tok ${tk.v ? 'v' : ''}`}
              initial={{ opacity: 0, y: -18, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              {tk.w}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </motion.span>
  );
}

/** Zdanie główne na początku: bez przecinka i z małą literą w „if”. */
function reorder(c: Cond): { first: Tok[]; second: Tok[] } {
  const main = c.main.map((tk, i) => (i === 0 ? { ...tk, w: tk.w === 'I' ? 'I' : tk.w[0].toUpperCase() + tk.w.slice(1) } : tk));
  const last = main[main.length - 1];
  const mainNoDot = [...main.slice(0, -1), { ...last, w: last.w.replace('.', '') }];
  const ifp = c.ifPart.map((tk, i) => (i === 0 ? { ...tk, w: 'if' } : tk));
  const ifLast = ifp[ifp.length - 1];
  return { first: mainNoDot, second: [...ifp.slice(0, -1), { ...ifLast, w: ifLast.w.replace(',', '.') }] };
}

const IF_C = '#3d8bff';
const MAIN_C = '#22b07d';

function ConditionalScene({ params }: SceneProps) {
  const c = CONDS[String(params.type ?? 'first')];
  const swap = Boolean(params.swap);
  const r = swap ? reorder(c) : null;

  return (
    <div className="cond">
      <LayoutGroup>
        <motion.h3 layout key={c.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {c.name}
        </motion.h3>
        <motion.div layout className="cond-sentence">
          {swap && r
            ? [<Clause key="main" toks={r.first} clause="main" color={MAIN_C} />, <Clause key="if" toks={r.second} clause="if" color={IF_C} />]
            : [<Clause key="if" toks={c.ifPart} clause="if" color={IF_C} />, <Clause key="main" toks={c.main} clause="main" color={MAIN_C} />]}
        </motion.div>
        <motion.div layout className="cond-forms">
          <span style={{ '--cl': IF_C } as React.CSSProperties}>
            <small>if-clause</small>
            <b>{c.ifForm}</b>
          </span>
          <span className="plus">+</span>
          <span style={{ '--cl': MAIN_C } as React.CSSProperties}>
            <small>main clause</small>
            <b>{c.mainForm}</b>
          </span>
        </motion.div>
        <motion.p layout className="cond-pl">
          {c.pl}
        </motion.p>
      </LayoutGroup>

      <div className="meters">
        <div className="meter">
          <div className="meter-label">
            <span>realne</span>
            <span>nierealne</span>
          </div>
          <div className="meter-track">
            <motion.div className="meter-knob" animate={{ left: `${c.reality * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 20 }} />
          </div>
        </div>
        <div className="meter-time">
          czas, którego dotyczy: <AnimatePresence mode="wait"><motion.b key={c.time} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>{c.time}</motion.b></AnimatePresence>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.p key={c.note} className="cond-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {c.note}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function typeControl(ids: string[], def: string): Control {
  return { type: 'select', key: 'type', label: 'Typ', default: def, options: ids.map((id) => ({ value: id, label: CONDS[id].name.replace(' Conditional', '') })) };
}
const swapControl: Control = { type: 'toggle', key: 'swap', label: 'Zdanie główne na początku', default: false };

export const conditionals: Topic = {
  id: 'english-conditionals',
  title: 'Conditionals – zdania warunkowe',
  subject: 'angielski',
  summary: 'Od praw natury po żal za przeszłością: obserwuj, jak zmienia się forma zdania z każdym typem.',
  accent: '#16a34a',
  glyph: '⇄',
  steps: [
    {
      title: 'Zero i First Conditional',
      kind: 'page',
      scene: ConditionalScene,
      controls: [typeControl(['zero', 'first'], 'zero'), swapControl],
      body: (
        <>
          <p>
            Zdanie warunkowe ma dwie części: <strong>warunek</strong> (if-clause, niebieski) i <strong>skutek</strong> (main
            clause, zielony).
          </p>
          <p>
            <strong>Zero</strong> – zawsze prawdziwe zależności. <strong>First</strong> – realna sytuacja w przyszłości.
          </p>
          <p>
            Włącz „zdanie główne na początku” i zobacz, jak słowa zamieniają się miejscami. Gdy warunek stoi na końcu,{' '}
            <strong>nie stawiamy przecinka</strong>.
          </p>
        </>
      ),
    },
    {
      title: 'Second Conditional',
      kind: 'page',
      scene: ConditionalScene,
      controls: [typeControl(['first', 'second'], 'second'), swapControl],
      body: (
        <>
          <p>
            Przełączaj między First i Second. Obserwuj, które słowa się zmieniają, a które zostają: zmienia się tylko forma
            czasownika, ale sens przesuwa się z <strong>realnego</strong> na <strong>wyobrażony</strong>.
          </p>
          <p>
            Paradoks: w Second Conditional używamy <strong>Past Simple</strong>, choć mówimy o teraźniejszości. Czas
            przeszły działa tu jak „odsunięcie” od rzeczywistości.
          </p>
        </>
      ),
    },
    {
      title: 'Third Conditional',
      kind: 'page',
      scene: ConditionalScene,
      controls: [typeControl(['second', 'third'], 'third'), swapControl],
      body: (
        <>
          <p>
            <strong>Third Conditional</strong> dotyczy przeszłości, która się już wydarzyła – i wyobraża sobie inny
            przebieg. Wskaźnik realności jest na samym końcu skali.
          </p>
          <div className="formula">If + had + V3, … would have + V3</div>
          <p>W mowie: <em>I would’ve passed</em> – skrót „would’ve” brzmi jak „would of”, ale tak się nie pisze!</p>
        </>
      ),
    },
    {
      title: 'Mixed Conditionals',
      kind: 'page',
      scene: ConditionalScene,
      controls: [typeControl(['mixedA', 'mixedB'], 'mixedA'), swapControl],
      body: (
        <>
          <p>
            Rzeczywistość nie dzieli się równo na czasy. <strong>Mixed conditionals</strong> łączą warunek z jednego czasu
            ze skutkiem w innym.
          </p>
          <p>
            Najczęstszy wariant: <strong>przeszła decyzja → obecny skutek</strong> (if + Past Perfect, would + V1).
          </p>
          <p>To typowe zadanie na maturze rozszerzonej – szukaj w zdaniu słów „now”, „today”, „yesterday”.</p>
        </>
      ),
    },
  ],
};
