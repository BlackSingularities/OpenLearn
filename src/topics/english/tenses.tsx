import { AnimatePresence, motion } from 'framer-motion';
import type { Control, SceneProps, Topic } from '../../lib/types';

type Mark =
  | { kind: 'point'; at: number; label: string; color?: string }
  | { kind: 'span'; from: number; to: number; label: string; color?: string; open?: boolean }
  | { kind: 'repeat'; from: number; to: number; every: number; label: string }
  | { kind: 'arrow'; from: number; to: number; label: string }
  | { kind: 'range'; from: number; to: number; label: string };

interface Tense {
  name: string;
  form: string[];
  use: string;
  examples: { en: string; pl: string }[];
  marks: Mark[];
  signals: string[];
}

const A = '#22b07d';
const B = '#3d8bff';
const D = '#e0913a';

const TENSES: Record<string, Tense> = {
  pastSimple: {
    name: 'Past Simple',
    form: ['V2 / V-ed', 'did + V1 (pytania, przeczenia)'],
    use: 'Czynność zakończona w konkretnym momencie przeszłości – wiemy KIEDY.',
    examples: [
      { en: 'I *visited* Paris in 2019.', pl: 'Odwiedziłem Paryż w 2019 roku.' },
      { en: 'She *didn’t call* me yesterday.', pl: 'Nie zadzwoniła do mnie wczoraj.' },
    ],
    marks: [{ kind: 'point', at: -6, label: '2019' }],
    signals: ['yesterday', 'last week', 'in 2019', '… ago'],
  },
  presentPerfect: {
    name: 'Present Perfect',
    form: ['have / has + V3'],
    use: 'Przeszłość połączona z teraźniejszością: liczy się doświadczenie lub skutek TERAZ, a nie moment.',
    examples: [
      { en: 'I *have visited* Paris twice.', pl: 'Byłem w Paryżu dwa razy (do tej pory).' },
      { en: 'She *has lost* her keys.', pl: 'Zgubiła klucze (i teraz ich nie ma).' },
    ],
    marks: [
      { kind: 'range', from: -9.5, to: 0, label: 'kiedyś w moim życiu – do teraz' },
      { kind: 'point', at: -6.5, label: '?' },
      { kind: 'point', at: -3, label: '?' },
      { kind: 'arrow', from: -3, to: 0, label: 'skutek teraz' },
    ],
    signals: ['ever', 'never', 'already', 'yet', 'just', 'so far'],
  },
  presentContinuous: {
    name: 'Present Continuous',
    form: ['am / is / are + V-ing'],
    use: 'Czynność trwająca właśnie teraz lub w tym okresie; sytuacja tymczasowa.',
    examples: [
      { en: 'I *am reading* a great book.', pl: 'Czytam (teraz) świetną książkę.' },
      { en: 'They *are living* with friends this month.', pl: 'W tym miesiącu mieszkają u znajomych.' },
    ],
    marks: [{ kind: 'span', from: -2.5, to: 2.5, label: 'trwa teraz', open: true }],
    signals: ['now', 'at the moment', 'currently', 'this week'],
  },
  pastContinuous: {
    name: 'Past Continuous',
    form: ['was / were + V-ing'],
    use: 'Czynność trwająca w przeszłości – często przerwana krótszą czynnością (Past Simple).',
    examples: [
      { en: 'I *was cooking* when the phone *rang*.', pl: 'Gotowałem, kiedy zadzwonił telefon.' },
      { en: 'At 8 p.m. we *were watching* a film.', pl: 'O 20:00 oglądaliśmy film.' },
    ],
    marks: [
      { kind: 'span', from: -8, to: -2.5, label: 'was cooking' },
      { kind: 'point', at: -5, label: 'rang', color: D },
    ],
    signals: ['while', 'when', 'at 8 p.m. yesterday', 'all evening'],
  },
  presentPerfectContinuous: {
    name: 'Present Perfect Continuous',
    form: ['have / has been + V-ing'],
    use: 'Czynność, która zaczęła się w przeszłości i trwa do teraz – liczy się, JAK DŁUGO.',
    examples: [
      { en: 'I *have been waiting* for two hours.', pl: 'Czekam od dwóch godzin.' },
      { en: 'It *has been raining* since morning.', pl: 'Pada od rana.' },
    ],
    marks: [
      { kind: 'span', from: -6, to: 0, label: 'for two hours', open: true },
      { kind: 'point', at: -6, label: 'since 10:00', color: D },
    ],
    signals: ['for', 'since', 'how long', 'all day'],
  },
  pastPerfect: {
    name: 'Past Perfect',
    form: ['had + V3'],
    use: 'Przeszłość w przeszłości: czynność wcześniejsza od innej czynności przeszłej.',
    examples: [
      { en: 'When we *arrived*, the train *had left*.', pl: 'Kiedy przyjechaliśmy, pociąg już odjechał.' },
      { en: 'She *had never seen* snow before 2010.', pl: 'Przed 2010 rokiem nigdy nie widziała śniegu.' },
    ],
    marks: [
      { kind: 'point', at: -7.5, label: '1. had left', color: D },
      { kind: 'point', at: -3.5, label: '2. arrived' },
      { kind: 'arrow', from: -3.5, to: -7.5, label: 'wcześniej' },
    ],
    signals: ['before', 'after', 'by the time', 'already'],
  },
  futureWill: {
    name: 'Future Simple (will)',
    form: ['will + V1'],
    use: 'Decyzja podjęta w chwili mówienia, obietnica, przewidywanie oparte na opinii.',
    examples: [
      { en: 'It’s cold. I *will close* the window.', pl: 'Zimno. Zamknę okno (decyzja teraz).' },
      { en: 'I think she *will win*.', pl: 'Myślę, że wygra.' },
    ],
    marks: [
      { kind: 'point', at: 0.2, label: 'decyzja', color: D },
      { kind: 'arrow', from: 0.2, to: 4, label: '' },
      { kind: 'point', at: 4, label: 'will close' },
    ],
    signals: ['I think', 'probably', 'I’m sure', 'tomorrow'],
  },
  goingTo: {
    name: 'be going to',
    form: ['am / is / are going to + V1'],
    use: 'Zamiar zaplanowany wcześniej albo przewidywanie na podstawie tego, co widać teraz.',
    examples: [
      { en: 'I *am going to study* medicine.', pl: 'Zamierzam studiować medycynę.' },
      { en: 'Look at those clouds! It *is going to rain*.', pl: 'Spójrz na te chmury! Będzie padać.' },
    ],
    marks: [
      { kind: 'point', at: -4, label: 'plan / dowód', color: D },
      { kind: 'arrow', from: -4, to: 5, label: '' },
      { kind: 'point', at: 5, label: 'study' },
    ],
    signals: ['look!', 'plan', 'intend', 'next year'],
  },
  futureArrangement: {
    name: 'Present Continuous (przyszłość)',
    form: ['am / is / are + V-ing + określenie czasu'],
    use: 'Ustalone plany i umówione spotkania – z konkretną datą, „w kalendarzu”.',
    examples: [
      { en: 'I *am meeting* Tom on Friday.', pl: 'W piątek spotykam się z Tomem (jesteśmy umówieni).' },
      { en: 'We *are flying* to Rome next week.', pl: 'W przyszłym tygodniu lecimy do Rzymu.' },
    ],
    marks: [{ kind: 'point', at: 3.5, label: '📅 Friday' }],
    signals: ['on Friday', 'tonight', 'next week'],
  },
};

const W = 900;
const X = (t: number) => 60 + ((t + 10) / 20) * (W - 120);
const AXIS_Y = 150;

function Sentence({ en }: { en: string }) {
  const parts = en.split('*');
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <motion.b key={i} className="verb" initial={{ backgroundSize: '0% 100%' }} animate={{ backgroundSize: '100% 100%' }} transition={{ delay: 0.6 + i * 0.1 }}>
            {p}
          </motion.b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function TenseScene({ params }: SceneProps) {
  const tense = TENSES[String(params.tense ?? 'pastSimple')];
  return (
    <div className="tense">
      <AnimatePresence mode="wait">
        <motion.div key={tense.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="tense-head">
            <h3>{tense.name}</h3>
            <div className="form-chips">
              {tense.form.map((f, i) => (
                <motion.span key={f} className="form-chip" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 + i * 0.1 }}>
                  {f}
                </motion.span>
              ))}
            </div>
          </div>

          <svg viewBox={`0 0 ${W} 220`} className="tense-svg">
            <defs>
              <marker id="tarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
              </marker>
              <marker id="tarrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={B} />
              </marker>
            </defs>
            {/* oś czasu */}
            <line x1={40} x2={W - 30} y1={AXIS_Y} y2={AXIS_Y} stroke="currentColor" strokeWidth="2" opacity="0.5" markerEnd="url(#tarr)" />
            <text x={50} y={AXIS_Y + 30} fill="currentColor" opacity="0.6" fontSize="14" fontFamily="Geist">PAST</text>
            <text x={W - 40} y={AXIS_Y + 30} fill="currentColor" opacity="0.6" fontSize="14" fontFamily="Geist" textAnchor="end">FUTURE</text>
            <line x1={X(0)} x2={X(0)} y1={30} y2={AXIS_Y + 12} stroke={A} strokeWidth="2" strokeDasharray="4 4" />
            <text x={X(0)} y={AXIS_Y + 30} fill={A} fontWeight="700" fontSize="14" fontFamily="Geist" textAnchor="middle">NOW</text>

            {tense.marks.map((m, i) => {
              const delay = 0.2 + i * 0.25;
              if (m.kind === 'range')
                return (
                  <motion.g key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay }}>
                    <rect x={X(m.from)} width={X(m.to) - X(m.from)} y={AXIS_Y - 70} height={70} fill={B} opacity="0.08" rx="8" />
                    <text x={(X(m.from) + X(m.to)) / 2} y={AXIS_Y - 78} textAnchor="middle" fontSize="13" fill={B} fontFamily="Geist">{m.label}</text>
                  </motion.g>
                );
              if (m.kind === 'span') {
                const color = m.color ?? B;
                return (
                  <g key={i}>
                    <motion.rect
                      x={X(m.from)}
                      y={AXIS_Y - 34}
                      height={22}
                      rx="11"
                      fill={color}
                      opacity="0.85"
                      initial={{ width: 0 }}
                      animate={{ width: X(m.to) - X(m.from) }}
                      transition={{ delay, duration: 0.9, ease: 'easeOut' }}
                    />
                    {/* fala – czynność w toku */}
                    <motion.path
                      d={Array.from({ length: Math.floor((X(m.to) - X(m.from)) / 16) }, (_, k) => `${k === 0 ? 'M' : 'L'}${X(m.from) + 8 + k * 16},${AXIS_Y - 23 + (k % 2 ? 4 : -4)}`).join(' ')}
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: delay + 0.5, duration: 0.8 }}
                    />
                    {m.open && (
                      <motion.circle cx={X(m.to)} cy={AXIS_Y - 23} r="8" fill={color} animate={{ scale: [1, 1.5, 1], opacity: [0.9, 0.3, 0.9] }} transition={{ repeat: Infinity, duration: 1.4 }} />
                    )}
                    <text x={(X(m.from) + X(m.to)) / 2} y={AXIS_Y - 44} textAnchor="middle" fontSize="14" fill={color} fontWeight="600" fontFamily="Geist">{m.label}</text>
                  </g>
                );
              }
              if (m.kind === 'point') {
                const color = m.color ?? B;
                return (
                  <motion.g key={i} initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay, type: 'spring', stiffness: 300, damping: 15 }}>
                    <line x1={X(m.at)} x2={X(m.at)} y1={AXIS_Y - 10} y2={AXIS_Y} stroke={color} strokeWidth="3" />
                    <path d={`M${X(m.at)},${AXIS_Y - 4} l-9,-16 h18 z`} fill={color} />
                    <text x={X(m.at)} y={AXIS_Y - 30} textAnchor="middle" fontSize="14" fontWeight="600" fill={color} fontFamily="Geist">{m.label}</text>
                  </motion.g>
                );
              }
              if (m.kind === 'arrow') {
                const y = AXIS_Y + 50;
                const mid = (X(m.from) + X(m.to)) / 2;
                return (
                  <g key={i}>
                    <motion.path
                      d={`M${X(m.from)},${AXIS_Y + 8} Q${mid},${y + 10} ${X(m.to)},${AXIS_Y + 8}`}
                      fill="none"
                      stroke={B}
                      strokeWidth="2.5"
                      markerEnd="url(#tarrB)"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay, duration: 0.7 }}
                    />
                    {m.label && <text x={mid} y={y + 22} textAnchor="middle" fontSize="13" fill={B} fontFamily="Geist">{m.label}</text>}
                  </g>
                );
              }
              // repeat
              const dots = [];
              for (let t = m.from; t <= m.to; t += m.every) dots.push(t);
              return (
                <g key={i}>
                  {dots.map((t, k) => (
                    <motion.circle key={k} cx={X(t)} cy={AXIS_Y - 16} r="7" fill={B} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: delay + k * 0.08 }} />
                  ))}
                  <text x={X(0)} y={AXIS_Y - 40} textAnchor="middle" fontSize="14" fill={B} fontWeight="600" fontFamily="Geist">{m.label}</text>
                </g>
              );
            })}
          </svg>

          <p className="tense-use">{tense.use}</p>
          <div className="examples">
            {tense.examples.map((e, i) => (
              <motion.div key={e.en} className="example" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.15 }}>
                <div className="en">
                  <Sentence en={e.en} />
                </div>
                <div className="pl">{e.pl}</div>
              </motion.div>
            ))}
          </div>
          <div className="signals">
            <span>Słowa-sygnały:</span>
            {tense.signals.map((s) => (
              <span key={s} className="signal">{s}</span>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

TENSES.futureContinuous = {
  name: 'Future Continuous',
  form: ['will be + V-ing'],
  use: 'Czynność, która będzie W TRAKCIE w określonym momencie przyszłości.',
  examples: [
    { en: 'This time tomorrow I *will be flying* to Rome.', pl: 'Jutro o tej porze będę lecieć do Rzymu.' },
    { en: 'Don’t call at 8 – we *will be having* dinner.', pl: 'Nie dzwoń o 8 – będziemy wtedy jeść kolację.' },
  ],
  marks: [
    { kind: 'span', from: 2.5, to: 7, label: 'will be flying' },
    { kind: 'point', at: 4.5, label: 'this time tomorrow', color: D },
  ],
  signals: ['this time tomorrow', 'at 8 p.m. tomorrow', 'all day tomorrow'],
};

TENSES.futurePerfect = {
  name: 'Future Perfect',
  form: ['will have + V3'],
  use: 'Czynność, która zostanie ZAKOŃCZONA przed określonym momentem w przyszłości.',
  examples: [
    { en: 'By 2030 I *will have finished* university.', pl: 'Do 2030 roku skończę studia.' },
    { en: 'By the time you arrive, we *will have eaten*.', pl: 'Zanim przyjedziesz, zdążymy zjeść.' },
  ],
  marks: [
    { kind: 'point', at: 3, label: 'finished', color: B },
    { kind: 'point', at: 7, label: 'by 2030', color: D },
    { kind: 'arrow', from: 7, to: 3, label: 'już przed' },
  ],
  signals: ['by', 'by the time', 'before', 'by then'],
};

// Present Simple: powtarzające się kropki na całej osi
TENSES.presentSimple = {
  name: 'Present Simple',
  form: ['V1 (he/she/it + -s)', 'do / does + V1'],
  use: 'Rutyna, nawyki, fakty i prawdy ogólne – rzeczy, które dzieją się regularnie.',
  examples: [
    { en: 'I *play* tennis every Saturday.', pl: 'Gram w tenisa w każdą sobotę.' },
    { en: 'Water *boils* at 100°C.', pl: 'Woda wrze w temperaturze 100°C.' },
  ],
  marks: [{ kind: 'repeat', from: -9, to: 9, every: 2, label: 'every Saturday' }],
  signals: ['always', 'usually', 'often', 'every day', 'never'],
};

function tenseControl(ids: string[], def: string): Control {
  return { type: 'select', key: 'tense', label: 'Czas', default: def, options: ids.map((id) => ({ value: id, label: TENSES[id].name })) };
}

export const tenses: Topic = {
  id: 'english-tenses',
  title: 'English Tenses na osi czasu',
  subject: 'angielski',
  summary: 'Present Perfect czy Past Simple? Zobacz każdy czas jako animację na osi: przeszłość – teraz – przyszłość.',
  accent: '#22b07d',
  glyph: '⏱',
  steps: [
    {
      title: 'Present Simple vs Present Continuous',
      kind: 'page',
      scene: TenseScene,
      controls: [tenseControl(['presentSimple', 'presentContinuous'], 'presentSimple')],
      body: (
        <>
          <p>
            Angielski rozróżnia czynności <strong>regularne</strong> i czynności <strong>trwające teraz</strong> – po
            polsku oba zdania brzmią „czytam”.
          </p>
          <p>
            <strong>Present Simple</strong> to powtarzające się punkty na całej osi czasu: nawyki i fakty.{' '}
            <strong>Present Continuous</strong> to odcinek wokół „teraz”: coś w toku, tymczasowego.
          </p>
          <p>Przełączaj czasy i porównaj obraz na osi oraz słowa-sygnały.</p>
        </>
      ),
    },
    {
      title: 'Past Simple vs Present Perfect',
      kind: 'page',
      scene: TenseScene,
      controls: [tenseControl(['pastSimple', 'presentPerfect'], 'pastSimple')],
      body: (
        <>
          <p>
            To najczęstszy błąd Polaków. <strong>Past Simple</strong> zamyka czynność w przeszłości i podaje (lub
            zakłada) <strong>kiedy</strong> się wydarzyła.
          </p>
          <p>
            <strong>Present Perfect</strong> patrzy z perspektywy <strong>teraz</strong>: czas wydarzenia jest
            nieważny lub nieokreślony, liczy się doświadczenie albo skutek.
          </p>
          <p>
            Reguła praktyczna: jeśli w zdaniu jest konkretna data przeszła (<em>yesterday, in 2019</em>), Present Perfect
            jest błędny.
          </p>
        </>
      ),
    },
    {
      title: 'Czasy ciągłe i Past Perfect',
      kind: 'page',
      scene: TenseScene,
      controls: [tenseControl(['pastContinuous', 'presentPerfectContinuous', 'pastPerfect'], 'pastContinuous')],
      body: (
        <>
          <p>
            <strong>Past Continuous</strong> to tło – długa czynność, którą przerywa krótkie wydarzenie w Past Simple.
          </p>
          <p>
            <strong>Present Perfect Continuous</strong> mierzy czas trwania aż do teraz (<em>for, since</em>). Po polsku
            często używamy wtedy czasu teraźniejszego: „czekam od godziny”.
          </p>
          <p>
            <strong>Past Perfect</strong> porządkuje kolejność: która z dwóch przeszłych czynności była{' '}
            <strong>wcześniejsza</strong>.
          </p>
        </>
      ),
    },
    {
      title: 'Jak mówić o przyszłości',
      kind: 'page',
      scene: TenseScene,
      controls: [tenseControl(['futureWill', 'goingTo', 'futureArrangement'], 'futureWill')],
      body: (
        <>
          <p>Angielski ma kilka sposobów mówienia o przyszłości, a wybór zależy od tego, KIEDY zapadła decyzja:</p>
          <p>
            <strong>will</strong> – decyzja teraz, spontaniczna; obietnice, opinie. <strong>going to</strong> – zamiar
            powzięty wcześniej lub przewidywanie na podstawie dowodów. <strong>Present Continuous</strong> – ustalony
            plan z datą.
          </p>
          <p>Zwróć uwagę, gdzie na osi leży pomarańczowy znacznik decyzji.</p>
        </>
      ),
    },
    {
      title: 'Future Continuous i Future Perfect',
      kind: 'page',
      scene: TenseScene,
      controls: [tenseControl(['futureContinuous', 'futurePerfect'], 'futureContinuous')],
      body: (
        <>
          <p>Dwa czasy przyszłe z zakresu rozszerzonego – oba patrzą na konkretny punkt w przyszłości:</p>
          <p>
            <strong>Future Continuous</strong> – w tym punkcie czynność będzie <strong>trwać</strong> (odcinek przechodzi
            przez znacznik).
          </p>
          <p>
            <strong>Future Perfect</strong> – do tego punktu czynność będzie już <strong>zakończona</strong> (wydarzenie
            leży przed znacznikiem). Kluczowe słowo: <em>by</em>.
          </p>
        </>
      ),
    },
  ],
};
