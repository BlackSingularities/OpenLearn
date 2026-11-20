import { AnimatePresence, motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';
import { useNarrow } from '../../lib/useNarrow';
import { Marked } from './marked';

/* ======================= Krok 1: podstawa i formant ======================= */

type Piece = 'base' | 'pre' | 'suf';
const PIECE_COLORS: Record<Piece, string> = { base: '#3d8bff', pre: '#a855f7', suf: '#e0913a' };
const PIECE_NAMES: Record<Piece, string> = { base: 'podstawa słowotwórcza', pre: 'przedrostek', suf: 'przyrostek' };

interface Derived {
  word: string;
  from: string;
  parts: [string, Piece][];
  def: string;
  type: string;
  meaning: string;
}

const DERIVED: Record<string, Derived> = {
  kotek: { word: 'kotek', from: 'kot', parts: [['kot', 'base'], ['ek', 'suf']], def: 'mały kot', type: 'formant przyrostkowy (-ek)', meaning: 'zdrobnienie' },
  przepisac: { word: 'przepisać', from: 'pisać', parts: [['prze', 'pre'], ['pisać', 'base']], def: 'napisać jeszcze raz', type: 'formant przedrostkowy (prze-)', meaning: 'powtórzenie czynności' },
  nauczyciel: { word: 'nauczyciel', from: 'nauczać', parts: [['naucz', 'base'], ['yciel', 'suf']], def: 'ten, kto naucza', type: 'formant przyrostkowy (-yciel)', meaning: 'nazwa wykonawcy czynności' },
  bezdomny: { word: 'bezdomny', from: 'dom', parts: [['bez', 'pre'], ['dom', 'base'], ['ny', 'suf']], def: 'taki, który nie ma domu', type: 'formant przedrostkowo-przyrostkowy (bez- + -ny)', meaning: 'nazwa braku cechy' },
  piekarnia: { word: 'piekarnia', from: 'piekarz', parts: [['piekar', 'base'], ['nia', 'suf']], def: 'miejsce, gdzie pracuje piekarz', type: 'formant przyrostkowy (-nia)', meaning: 'nazwa miejsca' },
  wiatrak: { word: 'wiatrak', from: 'wiatr', parts: [['wiatr', 'base'], ['ak', 'suf']], def: 'młyn poruszany wiatrem', type: 'formant przyrostkowy (-ak)', meaning: 'nazwa narzędzia' },
  bieg: { word: 'bieg', from: 'biegać', parts: [['bieg', 'base']], def: 'czynność biegania', type: 'formant zerowy (paradygmatyczny)', meaning: 'nazwa czynności' },
};

function DerivationScene({ params }: SceneProps) {
  const id = String(params.word ?? 'kotek');
  const split = Boolean(params.split ?? true);
  const d = DERIVED[id];
  return (
    <div className="poem wf">
      <AnimatePresence mode="wait">
        <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="wf-chain">
            <span className="wf-base-word">{d.from}</span>
            <motion.span className="wf-arrow" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.2 }}>
              →
            </motion.span>
            <span className="wf-word">
              {d.parts.map(([text, kind], i) => (
                <motion.span
                  key={i}
                  className={`wf-piece ${split ? 'split' : ''}`}
                  style={{ '--pc': PIECE_COLORS[kind] } as React.CSSProperties}
                  layout
                  transition={{ type: 'spring', stiffness: 260, damping: 22, delay: i * 0.08 }}
                >
                  {text}
                  {split && (
                    <motion.small initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }}>
                      {PIECE_NAMES[kind]}
                    </motion.small>
                  )}
                </motion.span>
              ))}
              {split && d.parts.length === 1 && (
                <motion.span className="wf-piece split zero" style={{ '--pc': PIECE_COLORS.suf } as React.CSSProperties} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
                  ∅<small>formant zerowy</small>
                </motion.span>
              )}
            </span>
          </div>
          <dl className="kind-facts">
            <div>
              <dt>wyraz podstawowy</dt>
              <dd>{d.from}</dd>
            </div>
            <div>
              <dt>definicja słowotwórcza</dt>
              <dd>
                {d.word} – {d.def}
              </dd>
            </div>
            <div>
              <dt>formant</dt>
              <dd>{d.type}</dd>
            </div>
          </dl>
          <p className="poem-info">
            Kategoria znaczeniowa: <b>{d.meaning}</b>.
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ======================= Krok 2: rodzina wyrazów ======================= */

const FAMILIES: Record<string, { root: string; words: string[]; note: string }> = {
  pis: {
    root: 'pis',
    words: ['[pis]ać', '[pis]arz', '[pis]mo', '[pis]ak', 'prze[pis]ać', 'o[pis]', 'na[pis]', 'pod[pis]', 'długo[pis]', '[pis]emny'],
    note: 'Wszystkie wyrazy łączy rdzeń „pis-” i wspólne znaczenie: utrwalanie znaków.',
  },
  las: {
    root: 'las / les / leś',
    words: ['[las]', '[las]ek', '[leś]ny', '[leś]nik', '[leś]niczy', '[leś]niczówka', 'za[les]ić', '[les]isty'],
    note: 'Rdzeń ma kilka postaci – oboczności a : e oraz s : ś. To wciąż jedna rodzina.',
  },
  dom: {
    root: 'dom',
    words: ['[dom]', '[dom]ek', '[dom]owy', 'bez[dom]ny', '[dom]ownik', '[dom]ostwo', 'przy[dom]owy', '[dom]ator'],
    note: 'Rodzinę wyrazów tworzą wszystkie wyrazy pokrewne – mające ten sam rdzeń i związane znaczeniowo.',
  },
};

function FamilyScene({ params }: SceneProps) {
  const id = String(params.family ?? 'pis');
  const f = FAMILIES[id];
  const narrow = useNarrow();
  const n = f.words.length;
  const R = narrow ? 38 : 40;
  const pos = f.words.map((_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: 50 + Math.cos(a) * (narrow ? R * 0.95 : R), y: 50 + Math.sin(a) * R };
  });
  return (
    <div className="poem family">
      <AnimatePresence mode="wait">
        <motion.div key={id} className="family-map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <svg className="family-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {pos.map((p, i) => (
              <motion.line key={i} x1="50" y1="50" x2={p.x} y2={p.y} stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.4" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2 + i * 0.05, duration: 0.4 }} />
            ))}
          </svg>
          <motion.span className="family-root" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
            <small>rdzeń</small>
            {f.root}
          </motion.span>
          {f.words.map((w, i) => (
            <motion.span
              key={w}
              className="family-word"
              style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.35 + i * 0.06, type: 'spring', stiffness: 260, damping: 18 }}
            >
              <Marked text={w} />
            </motion.span>
          ))}
        </motion.div>
      </AnimatePresence>
      <p className="poem-info">{f.note}</p>
    </div>
  );
}

/* ======================= Krok 3: wyrazy złożone ======================= */

const COMPOUNDS: Record<string, { kind: string; parts: string[]; link?: string; whole: string; note: string }> = {
  gwiazdozbior: { kind: 'złożenie', parts: ['gwiazd', 'zbiór'], link: 'o', whole: 'gwiazdozbiór', note: 'Złożenie: dwa tematy połączone łącznikiem (wrostkiem) -o-, -i-, -y-. Też: wodospad, długopis, pracodawca.' },
  wodospad: { kind: 'złożenie', parts: ['wod', 'spad'], link: 'o', whole: 'wodospad', note: 'Pierwszy człon traci końcówkę (woda → wod-), a łącznik -o- spaja go z drugim.' },
  wielkanoc: { kind: 'zrost', parts: ['Wielka', 'noc'], whole: 'Wielkanoc', note: 'Zrost: dwa wyrazy zrosły się bez łącznika, a pierwszy zachowuje swoją formę. Też: dobranoc, Białystok, wniebowstąpienie.' },
  bialystok: { kind: 'zrost', parts: ['Biały', 'stok'], whole: 'Białystok', note: 'W zroście pierwszy człon czasem nadal się odmienia: w Białymstoku.' },
  wiecznePioro: { kind: 'zestawienie', parts: ['wieczne', 'pióro'], whole: 'wieczne pióro', note: 'Zestawienie: osobne wyrazy, które razem mają jedno, nowe znaczenie. Też: maszyna do szycia, panna młoda, Morze Bałtyckie.' },
  pannaMloda: { kind: 'zestawienie', parts: ['panna', 'młoda'], whole: 'panna młoda', note: 'Znaczenie całości nie jest sumą części – panna młoda to kobieta w dniu ślubu, nie każda młoda panna.' },
};

function CompoundScene({ params }: SceneProps) {
  const id = String(params.example ?? 'gwiazdozbior');
  const joined = Boolean(params.join);
  const c = COMPOUNDS[id];
  const tight = joined && c.kind !== 'zestawienie';
  return (
    <div className="poem wf">
      <div className="poem-source">{c.kind}</div>
      <AnimatePresence mode="wait">
        <motion.div key={id} className={`compound ${tight ? 'tight' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.span layout className="wf-piece split" style={{ '--pc': PIECE_COLORS.base } as React.CSSProperties}>
            {c.parts[0]}
          </motion.span>
          {c.link && (
            <motion.span layout className="wf-piece split link" style={{ '--pc': '#22b07d' } as React.CSSProperties} animate={{ scale: joined ? [1, 1.25, 1] : 1 }}>
              {c.link}
              <small>łącznik</small>
            </motion.span>
          )}
          <motion.span layout className="wf-piece split" style={{ '--pc': PIECE_COLORS.suf } as React.CSSProperties}>
            {c.parts[1]}
          </motion.span>
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {joined && (
          <motion.div className="compound-result" initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
            = <b>{c.whole}</b>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="poem-info">{c.note}</p>
    </div>
  );
}

export const wordformation: Topic = {
  id: 'slowotworstwo',
  title: 'Słowotwórstwo',
  subject: 'polski',
  summary: 'Rozbierz wyraz na podstawę i formant, zobacz rodzinę wyrazów wokół rdzenia i połącz człony w złożenia, zrosty i zestawienia.',
  accent: '#d97706',
  glyph: '⚒',
  steps: [
    {
      title: 'Podstawa słowotwórcza i formant',
      kind: 'page',
      scene: DerivationScene,
      controls: [
        {
          type: 'select',
          key: 'word',
          label: 'Wyraz pochodny',
          default: 'kotek',
          options: Object.entries(DERIVED).map(([value, d]) => ({ value, label: d.word })),
        },
        { type: 'toggle', key: 'split', label: 'Rozłóż na części', default: true },
      ],
      body: (
        <>
          <p>
            <strong>Wyraz pochodny</strong> powstaje od <strong>wyrazu podstawowego</strong>. Składa się z{' '}
            <strong>podstawy słowotwórczej</strong> (części wspólnej z wyrazem podstawowym) i <strong>formantu</strong>{' '}
            (cząstki, która tworzy nowe znaczenie).
          </p>
          <p>
            Formant może stać przed podstawą (<strong>przedrostek</strong>), po niej (<strong>przyrostek</strong>), w obu
            miejscach naraz albo być <strong>zerowy</strong> – gdy wyraz pochodny jest krótszy od podstawowego.
          </p>
          <p>
            <strong>Definicja słowotwórcza</strong> objaśnia wyraz pochodny za pomocą podstawowego: <em>kotek – mały kot</em>.
          </p>
        </>
      ),
    },
    {
      title: 'Rodzina wyrazów',
      kind: 'page',
      scene: FamilyScene,
      controls: [
        {
          type: 'select',
          key: 'family',
          label: 'Rodzina',
          default: 'pis',
          options: [
            { value: 'pis', label: 'pisać' },
            { value: 'las', label: 'las' },
            { value: 'dom', label: 'dom' },
          ],
        },
      ],
      body: (
        <>
          <p>
            <strong>Rodzina wyrazów</strong> to wszystkie wyrazy pokrewne – mające wspólny <strong>rdzeń</strong> i
            związane znaczeniem.
          </p>
          <p>
            Rdzeń to najmniejsza wspólna cząstka. Może występować w kilku postaciach (<em>las – leśny – zalesić</em>) –
            to oboczności, które często podpowiadają pisownię.
          </p>
          <p>Uważaj na wyrazy podobne tylko z brzmienia – nie należą do rodziny (np. „lasso”).</p>
        </>
      ),
    },
    {
      title: 'Złożenia, zrosty, zestawienia',
      kind: 'page',
      scene: CompoundScene,
      controls: [
        {
          type: 'select',
          key: 'example',
          label: 'Przykład',
          default: 'gwiazdozbior',
          options: Object.entries(COMPOUNDS).map(([value, c]) => ({ value, label: `${c.whole} (${c.kind})` })),
        },
        { type: 'toggle', key: 'join', label: 'Połącz człony', default: false },
      ],
      body: (
        <>
          <p>Wyrazy złożone mają więcej niż jedną podstawę. Wyróżniamy trzy typy:</p>
          <p>
            <strong>Złożenie</strong> – człony połączone łącznikiem (<em>gwiazd-o-zbiór</em>). <strong>Zrost</strong> –
            wyrazy zrośnięte bez zmian (<em>Wielkanoc</em>). <strong>Zestawienie</strong> – osobne wyrazy o jednym znaczeniu
            (<em>wieczne pióro</em>).
          </p>
          <p>Włącz łączenie i porównaj: w zestawieniu człony nadal stoją osobno.</p>
        </>
      ),
    },
  ],
};
