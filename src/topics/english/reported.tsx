import { AnimatePresence, motion } from 'framer-motion';
import type { Control, SceneProps, Topic } from '../../lib/types';
import { MorphSentence, RoleLegend, toks } from '../../lib/Morph';
import { useAnimationClock } from '../../lib/useAnimationClock';

const COLORS = { intro: '#94a3b8', pron: '#3d8bff', verb: '#22b07d', time: '#e0913a', aux: '#ef4444' };

interface Example {
  label: string;
  direct: string;
  reported: string;
  /** Wiersz tabeli przesunięć do podświetlenia */
  row?: string;
  note: string;
}

const BACKSHIFT: { id: string; from: string; to: string }[] = [
  { id: 'ps', from: 'Present Simple', to: 'Past Simple' },
  { id: 'pc', from: 'Present Continuous', to: 'Past Continuous' },
  { id: 'pp', from: 'Present Perfect', to: 'Past Perfect' },
  { id: 'past', from: 'Past Simple', to: 'Past Perfect' },
  { id: 'will', from: 'will', to: 'would' },
  { id: 'can', from: 'can', to: 'could' },
];

const TIME_WORDS: { from: string; to: string }[] = [
  { from: 'now', to: 'then' },
  { from: 'today', to: 'that day' },
  { from: 'tomorrow', to: 'the next day' },
  { from: 'yesterday', to: 'the day before' },
  { from: 'next week', to: 'the following week' },
  { from: '… ago', to: '… before' },
  { from: 'here', to: 'there' },
  { from: 'this', to: 'that' },
];

const EXAMPLES: Record<string, Example> = {
  ps: { label: '„I am tired.”', row: 'ps', direct: 'q:“I@pron | v:am@verb | r:tired.”', reported: 'sh:She@intro | sd:said@intro | th:(that)@intro | q:she@pron | v:was@verb | r:tired.', note: 'am → was. „That” można pominąć. Zaimek zmienia się zgodnie z perspektywą: I → she.' },
  pc: { label: '„I am working.”', row: 'pc', direct: 'q:“I@pron | v:am@verb | w:working.”@verb', reported: 'sh:He@intro | sd:said@intro | q:he@pron | v:was@verb | w:working.@verb', note: 'Present Continuous → Past Continuous: am working → was working.' },
  pp: { label: '„I have finished.”', row: 'pp', direct: 'q:“I@pron | v:have@verb | w:finished.”@verb', reported: 'sh:She@intro | sd:said@intro | q:she@pron | v:had@verb | w:finished.@verb', note: 'Present Perfect → Past Perfect: have finished → had finished.' },
  past: { label: '„I saw the film.”', row: 'past', direct: 'q:“I@pron | v:saw@verb | r:the film.”', reported: 'sh:He@intro | sd:said@intro | q:he@pron | x:had@verb | v:seen@verb | r:the film.', note: 'Past Simple → Past Perfect: saw → had seen. W mowie potocznej Past Simple często zostaje bez zmian.' },
  will: { label: '„I will help you.”', row: 'will', direct: 'q:“I@pron | v:will@verb | w:help@verb | y:you.”@pron', reported: 'sh:She@intro | sd:said@intro | q:she@pron | v:would@verb | w:help@verb | y:me.@pron', note: 'will → would. Zaimki zmieniają się podwójnie: I → she, you → me.' },
  can: { label: '„I can swim.”', row: 'can', direct: 'q:“I@pron | v:can@verb | w:swim.”@verb', reported: 'sh:He@intro | sd:said@intro | q:he@pron | v:could@verb | w:swim.@verb', note: 'can → could, may → might, must → had to (lub bez zmiany).' },

  tomorrow: { label: '„I will see you here tomorrow.”', direct: 'q:“I@pron | v:will@verb | w:see@verb | y:you@pron | h:here@time | t:tomorrow.”@time', reported: 'sh:He@intro | sd:said@intro | q:he@pron | v:would@verb | w:see@verb | y:me@pron | h:there@time | t:the next day.@time', note: 'Relacjonujemy później i gdzie indziej, więc „tutaj, jutro” staje się „tam, następnego dnia”.' },
  yesterday: { label: '„I bought this yesterday.”', direct: 'q:“I@pron | v:bought@verb | d:this@time | t:yesterday.”@time', reported: 'sh:She@intro | sd:said@intro | q:she@pron | x:had@verb | v:bought@verb | d:that@time | t:the day before.@time', note: 'bought → had bought, this → that, yesterday → the day before.' },
  now: { label: '„We are leaving now.”', direct: 'q:“We@pron | v:are@verb | w:leaving@verb | t:now.”@time', reported: 'sh:They@intro | sd:said@intro | q:they@pron | v:were@verb | w:leaving@verb | t:then.@time', note: 'now → then (albo „at that moment”).' },

  wh: { label: '„Where do you live?”', direct: 'wh:“Where | do:do@aux | y:you@pron | v:live?”@verb', reported: 'sh:She@intro | sd:asked me@intro | wh:where | y:I@pron | v:lived.@verb', note: 'Pytanie zależne ma szyk zdania oznajmującego: znika „do”, podmiot wraca przed czasownik, nie ma znaku zapytania.' },
  yn: { label: '„Are you ready?”', direct: 'v:“Are@verb | y:you@pron | r:ready?”', reported: 'sh:He@intro | sd:asked@intro | if:if@aux | y:I@pron | v:was@verb | r:ready.', note: 'Pytania tak/nie wprowadzamy przez „if” lub „whether”. Szyk jak w zdaniu oznajmującym: I was, nie was I.' },
  cmd: { label: '„Close the door.”', direct: 'w:“Close@verb | r:the door.”', reported: 'sh:She@intro | sd:told me@intro | to:to@aux | w:close@verb | r:the door.', note: 'Polecenia: tell / ask + osoba + to + bezokolicznik.' },
  neg: { label: '„Don’t be late.”', direct: 'n:“Don’t@aux | w:be@verb | r:late.”', reported: 'sh:He@intro | sd:told me@intro | n:not to@aux | w:be@verb | r:late.', note: 'Zakaz: told me NOT to… – „not” stoi przed „to”.' },
};

function ReportedScene({ params }: SceneProps) {
  const ex = EXAMPLES[String(params.example ?? 'ps')];
  const auto = Boolean(params.auto);
  const t = useAnimationClock(auto, 1);
  const reported = auto ? Math.floor(t / 2.8) % 2 === 1 : Boolean(params.reported ?? true);
  const table = String(params.table ?? 'tenses');

  return (
    <div className="cond reported">
      <div className="voice-switch" aria-hidden>
        <span className={!reported ? 'on' : ''}>Direct</span>
        <span className={reported ? 'on' : ''}>Reported</span>
        <motion.i layout className="voice-knob" style={{ left: reported ? '50%' : '0%' }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
      </div>

      <div className={`speech ${reported ? '' : 'bubble'}`}>
        <MorphSentence id={ex.label} tokens={toks(reported ? ex.reported : ex.direct)} colors={COLORS} />
      </div>

      <AnimatePresence mode="wait">
        <motion.p key={ex.note} className="cond-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {ex.note}
        </motion.p>
      </AnimatePresence>

      {table === 'tenses' && (
        <div className="shift-table">
          {BACKSHIFT.map((r) => (
            <motion.div key={r.id} className={`shift-row ${r.id === ex.row ? 'on' : ''}`} animate={r.id === ex.row ? { scale: 1.02 } : { scale: 1 }}>
              <span>{r.from}</span>
              <motion.span className="shift-arrow" animate={r.id === ex.row && reported ? { x: [0, 6, 0] } : {}} transition={{ repeat: Infinity, duration: 1 }}>
                →
              </motion.span>
              <span>{r.to}</span>
            </motion.div>
          ))}
        </div>
      )}
      {table === 'time' && (
        <div className="shift-table">
          {TIME_WORDS.map((r) => (
            <div key={r.from} className="shift-row">
              <span>{r.from}</span>
              <span className="shift-arrow">→</span>
              <span>{r.to}</span>
            </div>
          ))}
        </div>
      )}
      <RoleLegend
        items={[
          { color: COLORS.intro, label: 'wprowadzenie (said, asked, told)' },
          { color: COLORS.pron, label: 'zaimki' },
          { color: COLORS.verb, label: 'czasowniki' },
          { color: COLORS.time, label: 'czas i miejsce' },
          { color: COLORS.aux, label: 'do / if / to' },
        ]}
      />
    </div>
  );
}

function exampleControl(ids: string[], def: string): Control {
  return { type: 'select', key: 'example', label: 'Zdanie', default: def, options: ids.map((id) => ({ value: id, label: EXAMPLES[id].label })) };
}
const autoControl: Control = { type: 'toggle', key: 'auto', label: 'Przełączaj automatycznie', default: true };
const reportedControl: Control = { type: 'toggle', key: 'reported', label: 'Mowa zależna (gdy auto wyłączone)', default: true };

export const reported: Topic = {
  id: 'english-reported-speech',
  title: 'Reported Speech – mowa zależna',
  subject: 'angielski',
  summary: 'Cudzysłów znika, czasy cofają się o krok, zaimki i określenia czasu zmieniają perspektywę – wszystko na żywo.',
  accent: '#059669',
  glyph: '❝',
  steps: [
    {
      title: 'Backshift – czasy cofają się o krok',
      kind: 'page',
      scene: ReportedScene,
      preset: { table: 'tenses' },
      controls: [exampleControl(['ps', 'pc', 'pp', 'past', 'will', 'can'], 'ps'), autoControl, reportedControl],
      body: (
        <>
          <p>
            W mowie zależnej relacjonujemy czyjeś słowa. Gdy czasownik wprowadzający jest w czasie przeszłym (
            <em>said, told</em>), czasy w relacji <strong>cofają się o jeden krok w przeszłość</strong>.
          </p>
          <p>Tabela pod zdaniem pokazuje, który „krok” właśnie wykonujemy.</p>
          <p>
            Wyjątek: jeśli to, co powiedziano, jest wciąż prawdą, można zostawić czas bez zmian:{' '}
            <em>She said she is tired</em> (nadal jest zmęczona).
          </p>
        </>
      ),
    },
    {
      title: 'Zaimki, czas i miejsce',
      kind: 'page',
      scene: ReportedScene,
      preset: { table: 'time' },
      controls: [exampleControl(['tomorrow', 'yesterday', 'now'], 'tomorrow'), autoControl, reportedControl],
      body: (
        <>
          <p>
            Relacjonujemy z innej perspektywy: w innym miejscu i czasie, często inna osoba. Dlatego zmieniają się{' '}
            <strong>zaimki</strong> (I → he, you → me) i <strong>określenia czasu i miejsca</strong>.
          </p>
          <p>Pomarańczowe słowa pokazują, jak „tu i teraz” mówiącego zamienia się w „tam i wtedy”.</p>
          <p>Tabela zawiera najważniejsze zamiany do nauczenia na pamięć.</p>
        </>
      ),
    },
    {
      title: 'Pytania i polecenia',
      kind: 'page',
      scene: ReportedScene,
      preset: { table: 'none' },
      controls: [exampleControl(['wh', 'yn', 'cmd', 'neg'], 'wh'), autoControl, reportedControl],
      body: (
        <>
          <p>
            <strong>Pytania zależne</strong> mają szyk zdania oznajmującego. Znikają „do / does / did”, a podmiot wraca
            przed czasownik. Pytania tak/nie wprowadzamy słowem <strong>if</strong> lub <strong>whether</strong>.
          </p>
          <p>
            <strong>Polecenia i prośby</strong>: <em>tell / ask + osoba + (not) to + bezokolicznik</em>.
          </p>
          <p>Obserwuj, jak „do” wypada ze zdania, a „you → I” przeskakuje przed czasownik.</p>
        </>
      ),
    },
  ],
};
