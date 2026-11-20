import { AnimatePresence, motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';

/* ======================= Krok 1: litera a głoska ======================= */

/** Segment: litery zapisu → głoska w wymowie (+ krótka uwaga). */
type Seg = [string, string, string?];

const WORDS: Record<string, { segs: Seg[]; note: string }> = {
  chrzaszcz: {
    segs: [['ch', 'ch', 'dwuznak'], ['rz', 'sz', 'rz po ch traci dźwięczność'], ['ą', 'ą'], ['sz', 'sz', 'dwuznak'], ['cz', 'cz', 'dwuznak']],
    note: '9 liter, ale tylko 5 głosek: dwuznaki (ch, rz, sz, cz) to po jednej głosce, a rz brzmi jak sz.',
  },
  dziecko: {
    segs: [['dzi', 'dź', 'i tylko zmiękcza'], ['e', 'e'], ['c', 'c'], ['k', 'k'], ['o', 'o']],
    note: '„i” przed samogłoską nie jest głoską – tylko zmiękcza „dz” w „dź”.',
  },
  zima: {
    segs: [['z', 'ź', 'zmiękczone przez i'], ['i', 'i', 'i jest też samogłoską'], ['m', 'm'], ['a', 'a']],
    note: 'Przed spółgłoską „i” pełni dwie funkcje: zmiękcza poprzednią spółgłoskę i jest samogłoską.',
  },
  miod: {
    segs: [['mi', 'm’', 'i zmiękcza'], ['ó', 'u'], ['d', 't', 'na końcu wyrazu – bez dźwięczności']],
    note: '4 litery, 3 głoski. „ó” brzmi jak u, a „d” na końcu wyrazu wymawiamy jak t.',
  },
  babcia: {
    segs: [['b', 'b'], ['a', 'a'], ['b', 'p', 'przed ć – bez dźwięczności'], ['ci', 'ć', 'i tylko zmiękcza'], ['a', 'a']],
    note: '6 liter, 5 głosek. Drugie „b” traci dźwięczność pod wpływem bezdźwięcznego ć.',
  },
  rzeka: {
    segs: [['rz', 'ż', 'dwuznak'], ['e', 'e'], ['k', 'k'], ['a', 'a']],
    note: 'Dwuznak „rz” to jedna głoska – brzmi jak ż.',
  },
};

function LettersScene({ params }: SceneProps) {
  const id = String(params.word ?? 'chrzaszcz');
  const show = Boolean(params.sounds);
  const w = WORDS[id];
  const letters = w.segs.flatMap(([l]) => l.split(''));
  // kolumna startowa każdego segmentu w siatce liter
  let col = 1;
  const spans = w.segs.map(([l]) => {
    const s = col;
    col += l.length;
    return s;
  });
  return (
    <div className="poem phon">
      <AnimatePresence mode="wait">
        <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="lg-grid" style={{ gridTemplateColumns: `repeat(${letters.length}, minmax(0, 1fr))` }}>
            {letters.map((l, i) => (
              <motion.span key={i} className="lg-letter" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                {l}
              </motion.span>
            ))}
            <AnimatePresence>
              {show &&
                w.segs.map(([l, g, note], i) => (
                  <motion.span
                    key={`g${i}`}
                    className={`lg-sound ${l !== g ? 'changed' : ''}`}
                    style={{ gridColumn: `${spans[i]} / span ${l.length}`, gridRow: 2 }}
                    initial={{ opacity: 0, y: -16, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.1 + i * 0.12, type: 'spring', stiffness: 260, damping: 20 }}
                    title={note}
                  >
                    [{g}]
                    {note && <small>{note}</small>}
                  </motion.span>
                ))}
            </AnimatePresence>
          </div>
          <div className="lg-count">
            <span>
              liter: <b>{letters.length}</b>
            </span>
            {show && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                głosek: <b>{w.segs.length}</b>
              </motion.span>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
      <p className="poem-info">{show ? w.note : 'Włącz „Pokaż głoski”, aby zobaczyć, jak naprawdę wymawiamy ten wyraz.'}</p>
    </div>
  );
}

/* ======================= Krok 2: podział głosek ======================= */

interface Phone {
  g: string;
  vowel?: boolean;
  voiced?: boolean;
  soft?: boolean;
  nasal?: boolean;
  /** para dźwięczna/bezdźwięczna */
  pair?: string;
}

const PHONES: Phone[] = [
  { g: 'a', vowel: true, voiced: true },
  { g: 'e', vowel: true, voiced: true },
  { g: 'i', vowel: true, voiced: true },
  { g: 'o', vowel: true, voiced: true },
  { g: 'u', vowel: true, voiced: true },
  { g: 'y', vowel: true, voiced: true },
  { g: 'ą', vowel: true, voiced: true, nasal: true },
  { g: 'ę', vowel: true, voiced: true, nasal: true },
  { g: 'b', voiced: true, pair: 'p' },
  { g: 'p', pair: 'b' },
  { g: 'd', voiced: true, pair: 't' },
  { g: 't', pair: 'd' },
  { g: 'g', voiced: true, pair: 'k' },
  { g: 'k', pair: 'g' },
  { g: 'w', voiced: true, pair: 'f' },
  { g: 'f', pair: 'w' },
  { g: 'z', voiced: true, pair: 's' },
  { g: 's', pair: 'z' },
  { g: 'ż', voiced: true, pair: 'sz' },
  { g: 'sz', pair: 'ż' },
  { g: 'ź', voiced: true, soft: true, pair: 'ś' },
  { g: 'ś', soft: true, pair: 'ź' },
  { g: 'dz', voiced: true, pair: 'c' },
  { g: 'c', pair: 'dz' },
  { g: 'dż', voiced: true, pair: 'cz' },
  { g: 'cz', pair: 'dż' },
  { g: 'dź', voiced: true, soft: true, pair: 'ć' },
  { g: 'ć', soft: true, pair: 'dź' },
  { g: 'ch' },
  { g: 'm', voiced: true, nasal: true },
  { g: 'n', voiced: true, nasal: true },
  { g: 'ń', voiced: true, nasal: true, soft: true },
  { g: 'l', voiced: true },
  { g: 'ł', voiced: true },
  { g: 'r', voiced: true },
  { g: 'j', voiced: true, soft: true },
];

const CRITERIA: Record<string, { label: string; yes: string; no: string; test: (p: Phone) => boolean; note: string }> = {
  vowel: { label: 'samogłoski / spółgłoski', yes: 'samogłoski', no: 'spółgłoski', test: (p) => !!p.vowel, note: 'Samogłoski tworzą sylabę – ile samogłosek, tyle sylab. „ó” to w wymowie u, więc nie ma osobnej głoski.' },
  voiced: { label: 'dźwięczne / bezdźwięczne', yes: 'dźwięczne', no: 'bezdźwięczne', test: (p) => !!p.voiced, note: 'Dźwięczne wymawiamy z drganiem wiązadeł głosowych (połóż palce na krtani!). Większość tworzy pary: b–p, d–t, w–f, ż–sz… Głoski m, n, ń, l, ł, r, j (sonorne) są zawsze dźwięczne i nie mają pary.' },
  nasal: { label: 'nosowe / ustne', yes: 'nosowe', no: 'ustne', test: (p) => !!p.nasal, note: 'Przy głoskach nosowych powietrze uchodzi także przez nos: ą, ę oraz m, n, ń.' },
  soft: { label: 'miękkie / twarde', yes: 'miękkie', no: 'twarde', test: (p) => !!p.soft && !p.vowel, note: 'Miękkie spółgłoski: ś, ź, ć, dź, ń, j (oraz zmiękczone przez i, np. pi, mi). Przed samogłoską miękkość zapisujemy przez „i” (sia, zie), przed spółgłoską i na końcu – kreską (ś, ź).' },
};

function PhonesScene({ params }: SceneProps) {
  const key = String(params.criterion ?? 'voiced');
  const c = CRITERIA[key];
  const pairs = Boolean(params.pairs) && key === 'voiced';
  const list = key === 'soft' ? PHONES.filter((p) => !p.vowel) : PHONES;
  const yes = list.filter(c.test);
  const no = list.filter((p) => !c.test(p));
  const tile = (p: Phone) => (
    <motion.span key={p.g} layoutId={`ph-${p.g}`} className={`ph-tile ${c.test(p) ? 'yes' : 'no'}`} transition={{ type: 'spring', stiffness: 280, damping: 26 }}>
      {p.g}
    </motion.span>
  );
  return (
    <div className="poem phon">
      {pairs ? (
        <div className="ph-pairs">
          {PHONES.filter((p) => p.voiced && p.pair).map((p) => (
            <motion.div key={p.g} className="ph-pair" layout>
              {tile(p)}
              <span className="ph-dash">–</span>
              {tile(PHONES.find((q) => q.g === p.pair)!)}
            </motion.div>
          ))}
          <div className="ph-pair solo">
            <small>bez pary:</small>
            {PHONES.filter((p) => !p.vowel && !p.pair).map(tile)}
          </div>
        </div>
      ) : (
        <div className="ph-groups">
          {[
            [c.yes, yes],
            [c.no, no],
          ].map(([label, items]) => (
            <div key={label as string} className={`ph-group ${label === c.yes ? 'yes' : 'no'}`}>
              <h4>{label as string}</h4>
              <div className="ph-tiles">{(items as Phone[]).map(tile)}</div>
            </div>
          ))}
        </div>
      )}
      <p className="poem-info">{c.note}</p>
    </div>
  );
}

/* ======================= Krok 3: upodobnienia ======================= */

interface Assim {
  segs: string[];
  /** indeks głoski, która się zmienia, i indeks głoski, która ją zmienia (−1: koniec wyrazu) */
  target: number;
  cause: number;
  result: string;
  type: string;
  note: string;
}

const ASSIM: Record<string, Assim> = {
  babka: { segs: ['b', 'a', 'b', 'k', 'a'], target: 2, cause: 3, result: 'p', type: 'ubezdźwięcznienie wsteczne', note: 'Bezdźwięczne k „cofa się” i odbiera dźwięczność poprzedzającemu b.' },
  prosba: { segs: ['p', 'r', 'o', 'ś', 'b', 'a'], target: 3, cause: 4, result: 'ź', type: 'udźwięcznienie wsteczne', note: 'Dźwięczne b udźwięcznia poprzedzające ś – mówimy [proźba].' },
  liczba: { segs: ['l', 'i', 'cz', 'b', 'a'], target: 2, cause: 3, result: 'dż', type: 'udźwięcznienie wsteczne', note: 'Dźwięczne b zmienia cz w dż – [lidżba].' },
  kwiat: { segs: ['k', 'w', 'i', 'a', 't'], target: 1, cause: 0, result: 'f', type: 'ubezdźwięcznienie postępowe', note: 'Bezdźwięczne k działa „do przodu” i zmienia w w f – [kfiat].' },
  trzy: { segs: ['t', 'rz', 'y'], target: 1, cause: 0, result: 'sz', type: 'ubezdźwięcznienie postępowe', note: 'Po bezdźwięcznym t dwuznak rz brzmi jak sz – [tszy].' },
  chleb: { segs: ['ch', 'l', 'e', 'b'], target: 3, cause: -1, result: 'p', type: 'ubezdźwięcznienie w wygłosie', note: 'Na końcu wyrazu (w wygłosie) spółgłoski dźwięczne tracą dźwięczność – [chlep]. To dlatego „ó” i „u”, „rz” i „ż” trzeba sprawdzać w innych formach.' },
};

function AssimScene({ params }: SceneProps) {
  const id = String(params.word ?? 'babka');
  const spoken = Boolean(params.spoken);
  const a = ASSIM[id];
  const W = 64;
  const width = a.segs.length * W;
  const cx = (i: number) => i * W + W / 2;
  const fromX = a.cause < 0 ? width + 18 : cx(a.cause);
  const toX = cx(a.target);
  const forward = a.cause >= 0 && a.cause < a.target;
  return (
    <div className="poem phon">
      <AnimatePresence mode="wait">
        <motion.div key={id} className="as-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <svg className="as-arrow" viewBox={`-10 0 ${width + 40} 54`} style={{ width: width + 50 }}>
            <defs>
              <marker id="asHead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
              </marker>
            </defs>
            <motion.path
              d={`M${fromX},48 C${fromX},6 ${toX},6 ${toX},46`}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              markerEnd="url(#asHead)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: spoken ? 1 : 0, opacity: spoken ? 1 : 0 }}
              transition={{ duration: 0.6 }}
            />
            {a.cause < 0 && spoken && (
              <text x={width + 18} y="52" fontSize="12" textAnchor="middle" fill="var(--accent)">
                koniec
              </text>
            )}
          </svg>
          <div className="as-row" style={{ width: width + 50 }}>
            {a.segs.map((s, i) => (
              <motion.span key={i} className={`as-tile ${i === a.target ? 'target' : ''} ${i === a.cause ? 'cause' : ''}`} style={{ width: W - 8 }} layout>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={spoken && i === a.target ? 'r' : 'w'} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} exit={{ rotateY: -90 }} transition={{ duration: 0.2 }}>
                    {spoken && i === a.target ? a.result : s}
                  </motion.span>
                </AnimatePresence>
              </motion.span>
            ))}
          </div>
          <div className="as-ipa">
            pisownia: <b>{a.segs.join('')}</b>
            {spoken && (
              <>
                {' '}
                · wymowa: <b>[{a.segs.map((s, i) => (i === a.target ? a.result : s)).join('')}]</b>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
      <p className="poem-info">
        {!spoken ? (
          'Przeczytaj wyraz na głos i zastanów się, która głoska brzmi inaczej, niż ją zapisujemy. Potem włącz „Pokaż wymowę”.'
        ) : (
          <>
        <b>
          {a.type}
          {a.cause >= 0 ? (forward ? ' (→ działa do przodu)' : ' (← działa do tyłu)') : ''}.
        </b>{' '}
        {a.note}
          </>
        )}
      </p>
    </div>
  );
}

/* ======================= Krok 4: akcent ======================= */

const STRESS: Record<string, { syl: string[]; at: number; rule: string; regular: boolean }> = {
  okno: { syl: ['o', 'kno'], at: 0, rule: 'Akcent paroksytoniczny – na przedostatniej sylabie. Tak akcentujemy zdecydowaną większość polskich wyrazów.', regular: true },
  telewizor: { syl: ['te', 'le', 'wi', 'zor'], at: 2, rule: 'Nawet w długim wyrazie akcent pada na przedostatnią sylabę.', regular: true },
  matematyka: { syl: ['ma', 'te', 'ma', 'ty', 'ka'], at: 2, rule: 'Wyrazy pochodzenia greckiego i łacińskiego na -yka, -ika: akcent na trzeciej sylabie od końca (ma-te-MA-ty-ka, fi-ZY-ka).', regular: false },
  bylismy: { syl: ['by', 'li', 'śmy'], at: 0, rule: '1. i 2. osoba liczby mnogiej czasu przeszłego: akcent na trzeciej sylabie od końca (BY-li-śmy, cze-KA-li-ście).', regular: false },
  zrobilbym: { syl: ['zro', 'bił', 'bym'], at: 0, rule: 'Tryb przypuszczający w liczbie pojedynczej: akcent na trzeciej sylabie od końca (ZRO-bił-bym) – tam, gdzie w formie „zrobił”.', regular: false },
  zrobilibysmy: { syl: ['zro', 'bi', 'li', 'by', 'śmy'], at: 1, rule: 'Tryb przypuszczający, 1. i 2. osoba liczby mnogiej: akcent na czwartej sylabie od końca (zro-BI-li-by-śmy).', regular: false },
  siedemset: { syl: ['sie', 'dem', 'set'], at: 0, rule: 'Liczebniki na -set: akcent na trzeciej sylabie od końca (SIE-dem-set, O-siem-set, DZIE-więć-set).', regular: false },
  uniwersytet: { syl: ['u', 'ni', 'wer', 'sy', 'tet'], at: 2, rule: 'Kilka wyrazów zapożyczonych ma akcent na trzeciej od końca: u-ni-WER-sy-tet, rzecz-po-SPO-li-ta.', regular: false },
};

function StressScene({ params }: SceneProps) {
  const id = String(params.word ?? 'okno');
  const s = STRESS[id];
  const fromEnd = s.syl.length - s.at;
  return (
    <div className="poem phon">
      <AnimatePresence mode="wait">
        <motion.div key={id} className="st-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {s.syl.map((x, i) => (
            <motion.span
              key={i}
              className={`st-syl ${i === s.at ? 'on' : ''}`}
              initial={{ y: 0 }}
              animate={i === s.at ? { y: [0, -14, 0], scale: [1, 1.15, 1.08] } : {}}
              transition={{ delay: 0.3 + i * 0.12, duration: 0.5 }}
            >
              {i === s.at ? x.toUpperCase() : x}
              <small>{s.syl.length - i}</small>
            </motion.span>
          ))}
        </motion.div>
      </AnimatePresence>
      <div className="lg-count">
        <span>
          akcent na <b>{fromEnd}.</b> sylabie od końca
        </span>
        <span className={`verdict ${s.regular ? 'ok' : 'bad'}`}>{s.regular ? 'reguła ogólna' : 'wyjątek'}</span>
      </div>
      <p className="poem-info">{s.rule}</p>
    </div>
  );
}

export const phonetics: Topic = {
  id: 'fonetyka',
  title: 'Fonetyka: głoski, upodobnienia i akcent',
  subject: 'polski',
  summary: 'Zobacz, czym różni się litera od głoski, pogrupuj głoski, obserwuj upodobnienia w akcji i znajdź akcent w wyrazach-pułapkach.',
  accent: '#fb923c',
  glyph: 'ą',
  steps: [
    {
      title: 'Litera a głoska',
      kind: 'page',
      scene: LettersScene,
      controls: [
        {
          type: 'select',
          key: 'word',
          label: 'Wyraz',
          default: 'chrzaszcz',
          options: [
            { value: 'chrzaszcz', label: 'chrząszcz' },
            { value: 'dziecko', label: 'dziecko' },
            { value: 'zima', label: 'zima' },
            { value: 'miod', label: 'miód' },
            { value: 'babcia', label: 'babcia' },
            { value: 'rzeka', label: 'rzeka' },
          ],
        },
        { type: 'toggle', key: 'sounds', label: 'Pokaż głoski', default: false },
      ],
      body: (
        <>
          <p>
            <strong>Litera</strong> to znak pisma, <strong>głoska</strong> – najmniejszy dźwięk mowy. Liczba liter i głosek
            często się różni.
          </p>
          <p>
            Dwuznaki (<em>ch, cz, dz, dź, dż, rz, sz</em>) oznaczają jedną głoskę. Litera <strong>„i”</strong> przed
            samogłoską tylko zmiękcza (<em>dziecko</em>), a przed spółgłoską jest też samogłoską (<em>zima</em>).
          </p>
          <p>Głoski zapisujemy w nawiasach kwadratowych, np. [ż-e-k-a].</p>
        </>
      ),
    },
    {
      title: 'Podział głosek',
      kind: 'page',
      scene: PhonesScene,
      controls: [
        {
          type: 'select',
          key: 'criterion',
          label: 'Kryterium',
          default: 'voiced',
          options: Object.entries(CRITERIA).map(([value, c]) => ({ value, label: c.label })),
        },
        { type: 'toggle', key: 'pairs', label: 'Pokaż pary (dźwięczność)', default: false },
      ],
      body: (
        <>
          <p>Głoski dzielimy według kilku kryteriów. Zmieniaj kryterium i patrz, jak kafelki przechodzą między grupami.</p>
          <p>
            Najważniejsze dla ortografii i wymowy jest kryterium <strong>dźwięczności</strong>. Włącz pary, aby zobaczyć
            głoski różniące się tylko drganiem wiązadeł: <em>b – p, d – t, ż – sz</em>…
          </p>
          <p>Głoski bez pary (m, n, ń, l, ł, r, j) to głoski sonorne – nie ulegają ubezdźwięcznieniu.</p>
        </>
      ),
    },
    {
      title: 'Upodobnienia',
      kind: 'page',
      scene: AssimScene,
      controls: [
        {
          type: 'select',
          key: 'word',
          label: 'Wyraz',
          default: 'babka',
          options: [
            { value: 'babka', label: 'babka' },
            { value: 'prosba', label: 'prośba' },
            { value: 'liczba', label: 'liczba' },
            { value: 'kwiat', label: 'kwiat' },
            { value: 'trzy', label: 'trzy' },
            { value: 'chleb', label: 'chleb' },
          ],
        },
        { type: 'toggle', key: 'spoken', label: 'Pokaż wymowę', default: false },
      ],
      body: (
        <>
          <p>
            Sąsiadujące głoski wpływają na siebie – to <strong>upodobnienia</strong> (asymilacje). Najczęściej dotyczą
            dźwięczności.
          </p>
          <p>
            <strong>Wsteczne</strong> (←): głoska późniejsza zmienia wcześniejszą (<em>babka → [bapka]</em>).{' '}
            <strong>Postępowe</strong> (→): wcześniejsza zmienia późniejszą (<em>kwiat → [kfiat]</em>).
          </p>
          <p>
            Na końcu wyrazu spółgłoski dźwięczne zawsze tracą dźwięczność (<em>chleb → [chlep]</em>). Dlatego pisownię
            sprawdzamy, zmieniając formę: chleba, zęby, nogi.
          </p>
        </>
      ),
    },
    {
      title: 'Akcent wyrazowy',
      kind: 'page',
      scene: StressScene,
      controls: [
        {
          type: 'select',
          key: 'word',
          label: 'Wyraz',
          default: 'okno',
          options: [
            { value: 'okno', label: 'okno' },
            { value: 'telewizor', label: 'telewizor' },
            { value: 'matematyka', label: 'matematyka' },
            { value: 'bylismy', label: 'byliśmy' },
            { value: 'zrobilbym', label: 'zrobiłbym' },
            { value: 'zrobilibysmy', label: 'zrobilibyśmy' },
            { value: 'siedemset', label: 'siedemset' },
            { value: 'uniwersytet', label: 'uniwersytet' },
          ],
        },
      ],
      body: (
        <>
          <p>
            W polszczyźnie akcent pada zwykle na <strong>przedostatnią sylabę</strong> (akcent paroksytoniczny). Liczby pod
            sylabami pokazują pozycję od końca.
          </p>
          <p>
            Wyjątki warto znać, bo pojawiają się na egzaminach: wyrazy na <em>-yka, -ika</em>, formy czasu przeszłego{' '}
            <em>-liśmy, -liście</em>, tryb przypuszczający i liczebniki na <em>-set</em>.
          </p>
          <p>Zasada dla trybu przypuszczającego: akcent zostaje tam, gdzie w formie bez „-by” (zrobił → ZRO-bił-bym).</p>
        </>
      ),
    },
  ],
};
