import { AnimatePresence, motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';
import { useAnimationClock } from '../../lib/useAnimationClock';

/* Wers zapisany jako lista słów, a słowo jako lista sylab. `|` w danych oznacza granicę sylaby. */
interface Line {
  words: string[];
  /** Po którym słowie (indeks) wypada średniówka. */
  caesura?: number;
  /** Numery akcentowanych sylab (od 1) – gdy podane, nadpisują akcent paroksytoniczny. */
  stresses?: number[];
}

const parse = (s: string) => s.split(' ');

const INWOKACJA: Line[] = [
  { words: parse('Li|two! Oj|czy|zno mo|ja! ty jes|teś jak zdro|wie:'), caesura: 2 },
  { words: parse('I|le cię trze|ba ce|nić, ten tyl|ko się do|wie,'), caesura: 3 },
  { words: parse('Kto cię stra|cił. Dziś pięk|ność twą w_ca|łej o|zdo|bie'), caesura: 4 },
  { words: parse('Wi|dzę i o|pi|su|ję, bo tęsk|nię po to|bie.'), caesura: 2 },
];

const ROTA: Line[] = [
  { words: parse('Nie rzu|cim zie|mi, skąd nasz ród,'), stresses: [2, 4, 6, 8] },
  { words: parse('Nie bę|dzie Nie|miec pluł nam w_twarz,'), stresses: [2, 4, 6, 8] },
];

/** Wiersz wolny – przykład ułożony na potrzeby lekcji. */
const FREE: Line[] = [
  { words: parse('Mia|sto') },
  { words: parse('za|sy|pia po|wo|li') },
  { words: parse('a ja') },
  { words: parse('li|czę o|kna, w_któ|rych jesz|cze świe|ci się świat|ło') },
];

const CLITICS = new Set(['cię', 'się', 'mi', 'ci', 'go', 'mu', 'nam', 'was', 'i', 'a', 'w', 'z', 'jak', 'bo', 'po', 'ty', 'nie', 'ten', 'twą', 'kto', 'nasz']);

interface Syl {
  text: string;
  index: number; // numer w wersie, od 1
  stressed: boolean;
  wordIndex: number;
}

function syllables(line: Line): Syl[] {
  const out: Syl[] = [];
  let n = 0;
  line.words.forEach((w, wi) => {
    const parts = w.split('|');
    parts.forEach((p, pi) => {
      n++;
      const clean = w.replace(/[|!,.:]/g, '').toLowerCase();
      const paroxytone = parts.length > 1 ? pi === parts.length - 2 : !CLITICS.has(clean);
      out.push({ text: p.replace('_', ' '), index: n, stressed: line.stresses ? line.stresses.includes(n) : paroxytone, wordIndex: wi });
    });
  });
  return out;
}

function Verse({ line, split, accents, caesura, delay = 0 }: { line: Line; split: boolean; accents: boolean; caesura: boolean; delay?: number }) {
  const syls = syllables(line);
  // Wers dzielimy na dwa półwersy (przed i po średniówce) – na wąskim ekranie łamie się dokładnie w miejscu średniówki.
  const cut = line.caesura ?? line.words.length - 1;
  const halves = [line.words.map((_, i) => i).filter((i) => i <= cut), line.words.map((_, i) => i).filter((i) => i > cut)].filter((h) => h.length > 0);

  const word = (wi: number) => (
    <span key={wi} className={`word ${split ? 'split' : ''}`}>
      {syls
        .filter((s) => s.wordIndex === wi)
        .map((s) => (
          <motion.span
            key={s.index}
            layout
            className={`syl ${split ? 'boxed' : ''} ${accents && s.stressed ? 'stressed' : ''}`}
            transition={{ type: 'spring', stiffness: 300, damping: 26, delay: split ? delay + s.index * 0.035 : 0 }}
          >
            {s.text}
            <AnimatePresence>
              {split && (
                <motion.sup initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: delay + s.index * 0.05 }}>
                  {s.index}
                </motion.sup>
              )}
            </AnimatePresence>
          </motion.span>
        ))}
    </span>
  );

  return (
    <div className="verse">
      {halves.map((h, hi) => (
        <span key={hi} className="hemi">
          {h.map(word)}
          <AnimatePresence>
            {caesura && line.caesura !== undefined && hi === 0 && halves.length > 1 && (
              <motion.span className="caesura" initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} exit={{ scaleY: 0, opacity: 0 }}>
                ||
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      ))}
      <AnimatePresence>
        {split && (
          <motion.span className="count" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ delay: delay + 0.5 }}>
            {syls.length}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function SyllableScene({ params }: SceneProps) {
  const split = Boolean(params.split);
  const accents = Boolean(params.accents);
  const caesura = Boolean(params.caesura);
  return (
    <div className="poem">
      <div className="poem-source">Adam Mickiewicz, „Pan Tadeusz” – Inwokacja</div>
      {INWOKACJA.map((l, i) => (
        <Verse key={i} line={l} split={split} accents={accents} caesura={caesura} delay={i * 0.15} />
      ))}
      <div className="legend">
        {split && <span>liczba nad sylabą – numer zgłoski w wersie</span>}
        {accents && <span><b className="stressed-dot" /> sylaba akcentowana</span>}
        {caesura && <span><b className="caesura-mark">||</b> średniówka</span>}
      </div>
    </div>
  );
}

/** Rytm: wiersz jako rząd „uderzeń” – akcentowane sylaby pulsują w takt. */
function RhythmScene({ params }: SceneProps) {
  const system = String(params.system ?? 'syllabotonic');
  const lines = system === 'syllabic' ? INWOKACJA.slice(0, 2) : system === 'syllabotonic' ? ROTA : FREE;
  const source =
    system === 'syllabic' ? 'A. Mickiewicz, „Pan Tadeusz”' : system === 'syllabotonic' ? 'M. Konopnicka, „Rota”' : 'przykład wiersza wolnego';
  const info: Record<string, string> = {
    syllabic: 'Stała liczba sylab (13) i średniówka po 7. sylabie. Akcenty rozkładają się swobodnie.',
    syllabotonic: 'Stała liczba sylab (8) i stały układ akcentów: co druga sylaba akcentowana – stopa jambiczna (◡ –).',
    free: 'Brak stałej liczby sylab, akcentów i rymów. Rytm wyznaczają podział na wersy, składnia i intonacja.',
  };
  return (
    <div className="poem">
      <div className="poem-source">{source}</div>
      <AnimatePresence mode="wait">
        <motion.div key={system} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
          {lines.map((l, i) => {
            const syls = syllables(l);
            return (
              <div key={i} className="beat-line">
                {syls.map((s) => (
                  <motion.span
                    key={s.index}
                    className={`beat ${s.stressed ? 'on' : ''}`}
                    animate={s.stressed ? { scale: [1, 1.18, 1] } : {}}
                    transition={{ duration: 0.5, repeat: Infinity, repeatDelay: syls.length * 0.25 - 0.5, delay: s.index * 0.25 + i * 0.1 }}
                  >
                    <span className="beat-mark">{s.stressed ? '–' : '◡'}</span>
                    {s.text}
                  </motion.span>
                ))}
                <span className="count">{syls.length}</span>
              </div>
            );
          })}
          <p className="poem-info">{info[system]}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------- Stopy metryczne ---------- */
const FEET: Record<string, { name: string; pattern: number[]; sign: string; note: string }> = {
  trochej: { name: 'Trochej', pattern: [1, 0], sign: '– ◡', note: 'Akcent na pierwszej sylabie stopy. W polszczyźnie brzmi najnaturalniej, bo zgadza się z akcentem wyrazowym – stąd częsty w piosenkach i wierszach dla dzieci.' },
  jamb: { name: 'Jamb', pattern: [0, 1], sign: '◡ –', note: 'Akcent na drugiej sylabie. W języku polskim wymaga jednosylabowych wyrazów lub wyrazów poprzedzonych nieakcentowanym słowem („nie RZU-cim ZIE-mi”). Przykład: „Rota” Konopnickiej.' },
  daktyl: { name: 'Daktyl', pattern: [1, 0, 0], sign: '– ◡ ◡', note: 'Akcent i dwie sylaby nieakcentowane. Podstawa heksametru – miary eposów Homera i Wergiliusza.' },
  amfibrach: { name: 'Amfibrach', pattern: [0, 1, 0], sign: '◡ – ◡', note: 'Akcent w środku stopy. Dzięki temu dobrze współgra z polskim akcentem na przedostatniej sylabie; częsty w balladach romantycznych.' },
  anapest: { name: 'Anapest', pattern: [0, 0, 1], sign: '◡ ◡ –', note: 'Dwie sylaby nieakcentowane i akcent na końcu – rytm „rozpędzony”, rzadki w poezji polskiej.' },
};

function FeetScene({ params }: SceneProps) {
  const foot = FEET[String(params.foot ?? 'trochej')];
  const playing = Boolean(params.play ?? true);
  const tempo = Number(params.tempo ?? 1);
  const t = useAnimationClock(playing, tempo);
  const feetCount = 4;
  const total = foot.pattern.length * feetCount;
  const current = Math.floor(t * 3) % total;

  return (
    <div className="poem feet">
      <div className="feet-head">
        <h3>{foot.name}</h3>
        <span className="feet-sign">{foot.sign}</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={foot.name} className="feet-row" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
          {Array.from({ length: feetCount }, (_, f) => (
            <div key={f} className="foot">
              {foot.pattern.map((stress, i) => {
                const idx = f * foot.pattern.length + i;
                const active = idx === current;
                return (
                  <motion.div
                    key={i}
                    className={`foot-syl ${stress ? 'stress' : ''} ${active ? 'active' : ''}`}
                    animate={active ? { y: stress ? -16 : -6, scale: stress ? 1.15 : 1.05 } : { y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  >
                    {stress ? 'TA' : 'ta'}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
      <p className="poem-info">{foot.note}</p>
    </div>
  );
}

/* ---------- Rymy ---------- */
interface RhymePoem {
  source: string;
  lines: { text: string; end: string; group: string }[];
  scheme: string;
  name: string;
}

const RHYMES: Record<string, RhymePoem> = {
  aabb: {
    source: 'A. Mickiewicz, „Pan Tadeusz”',
    scheme: 'aabb',
    name: 'rymy parzyste (sąsiednie)',
    lines: [
      { text: 'Litwo! Ojczyzno moja! ty jesteś jak ', end: 'zdrowie:', group: 'a' },
      { text: 'Ile cię trzeba cenić, ten tylko się ', end: 'dowie,', group: 'a' },
      { text: 'Kto cię stracił. Dziś piękność twą w całej ', end: 'ozdobie', group: 'b' },
      { text: 'Widzę i opisuję, bo tęsknię po ', end: 'tobie.', group: 'b' },
    ],
  },
  abab: {
    source: 'J. Słowacki, „Testament mój”',
    scheme: 'abab',
    name: 'rymy krzyżowe (przeplatane)',
    lines: [
      { text: 'Żyłem z wami, cierpiałem i płakałem z ', end: 'wami,', group: 'a' },
      { text: 'Nigdy mi, kto szlachetny, nie był ', end: 'obojętny,', group: 'b' },
      { text: 'Dziś was rzucam i dalej idę w cień – z ', end: 'duchami –', group: 'a' },
      { text: 'A jak gdyby tu szczęście było – idę ', end: 'smętny.', group: 'b' },
    ],
  },
  abba: {
    source: 'A. Mickiewicz, „Stepy akermańskie”',
    scheme: 'abba',
    name: 'rymy okalające',
    lines: [
      { text: 'Wpłynąłem na suchego przestwór ', end: 'oceanu,', group: 'a' },
      { text: 'Wóz nurza się w zieloność i jak łódka ', end: 'brodzi,', group: 'b' },
      { text: 'Śród fali łąk szumiących, śród kwiatów ', end: 'powodzi,', group: 'b' },
      { text: 'Omijam koralowe ostrowy ', end: 'burzanu.', group: 'a' },
    ],
  },
};

const GROUP_COLORS: Record<string, string> = { a: '#e0913a', b: '#3d8bff' };

function RhymeScene({ params }: SceneProps) {
  const key = String(params.scheme ?? 'aabb');
  const poem = RHYMES[key];
  const ROW = 56;
  // pary rymów do narysowania łuków
  const pairs: [number, number, string][] = [];
  poem.lines.forEach((l, i) => {
    const j = poem.lines.findIndex((m, k) => k > i && m.group === l.group);
    if (j > 0 && !pairs.some((p) => p[1] === i)) pairs.push([i, j, l.group]);
  });
  return (
    <div className="poem">
      <div className="poem-source">{poem.source}</div>
      <AnimatePresence mode="wait">
        <motion.div key={key} className="rhyme-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="rhyme-lines">
            {poem.lines.map((l, i) => (
              <div key={i} className="rhyme-line" style={{ height: ROW }}>
                <span>{l.text}</span>
                <motion.span
                  className="rhyme-end"
                  style={{ '--g': GROUP_COLORS[l.group] } as React.CSSProperties}
                  initial={{ backgroundSize: '0% 100%' }}
                  animate={{ backgroundSize: '100% 100%' }}
                  transition={{ delay: 0.3 + i * 0.25, duration: 0.4 }}
                >
                  {l.end}
                </motion.span>
              </div>
            ))}
          </div>
          <svg className="rhyme-arcs" width="90" height={poem.lines.length * ROW} aria-hidden>
            {pairs.map(([i, j, g], k) => {
              const y1 = i * ROW + ROW / 2;
              const y2 = j * ROW + ROW / 2;
              const bulge = 20 + (j - i) * 18;
              return (
                <motion.path
                  key={k}
                  d={`M4,${y1} C${bulge},${y1} ${bulge},${y2} 4,${y2}`}
                  fill="none"
                  stroke={GROUP_COLORS[g]}
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 1.2 + k * 0.3, duration: 0.6 }}
                />
              );
            })}
            {poem.lines.map((l, i) => (
              <text key={i} x="70" y={i * ROW + ROW / 2 + 6} fill={GROUP_COLORS[l.group]} fontWeight="700" fontSize="18" fontFamily="Geist">
                {l.group}
              </text>
            ))}
          </svg>
        </motion.div>
      </AnimatePresence>
      <p className="poem-info">
        Układ <b>{poem.scheme}</b> – {poem.name}.
      </p>
    </div>
  );
}

/* ---------- Sonet: budowa i kompozycja ---------- */
const SONET: { text: string; end: string; g: string }[] = [
  { text: 'Wpłynąłem na suchego przestwór ', end: 'oceanu,', g: 'a' },
  { text: 'Wóz nurza się w zieloność i jak łódka ', end: 'brodzi,', g: 'b' },
  { text: 'Śród fali łąk szumiących, śród kwiatów ', end: 'powodzi,', g: 'b' },
  { text: 'Omijam koralowe ostrowy ', end: 'burzanu.', g: 'a' },
  { text: 'Już mrok zapada, nigdzie drogi ni ', end: 'kurhanu;', g: 'a' },
  { text: 'Patrzę w niebo, gwiazd szukam, przewodniczek ', end: 'łodzi;', g: 'b' },
  { text: 'Tam z dala błyszczy obłok? tam jutrzenka ', end: 'wschodzi?', g: 'b' },
  { text: 'To błyszczy Dniestr, to wzeszła lampa ', end: 'Akermanu.', g: 'a' },
  { text: 'Stójmy! – jak cicho! – słyszę ciągnące ', end: 'żurawie,', g: 'c' },
  { text: 'Których by nie dościgły źrenice ', end: 'sokoła;', g: 'd' },
  { text: 'Słyszę, kędy się motyl kołysa na ', end: 'trawie,', g: 'c' },
  { text: 'Kędy wąż śliską piersią dotyka się ', end: 'zioła.', g: 'd' },
  { text: 'W takiej ciszy! – tak ucho natężam ', end: 'ciekawie,', g: 'c' },
  { text: 'Że słyszałbym głos z Litwy. – Jedźmy, nikt nie ', end: 'woła.', g: 'd' },
];
const SONET_STANZAS = [
  { from: 0, to: 4, name: 'czterowiersz (tetrastych)', part: 'opis' },
  { from: 4, to: 8, name: 'czterowiersz (tetrastych)', part: 'opis' },
  { from: 8, to: 11, name: 'trójwiersz (tercyna)', part: 'refleksja' },
  { from: 11, to: 14, name: 'trójwiersz (tercyna)', part: 'refleksja' },
];
const SONET_COLORS: Record<string, string> = { a: '#e0913a', b: '#3d8bff', c: '#22b07d', d: '#a855f7' };

function SonnetScene({ params }: SceneProps) {
  const rhymes = Boolean(params.rhymes);
  const parts = Boolean(params.parts);
  return (
    <div className="poem sonnet">
      <div className="poem-source">A. Mickiewicz, „Stepy akermańskie” (z cyklu „Sonety krymskie”, 1826)</div>
      {SONET_STANZAS.map((s, si) => (
        <motion.div
          key={si}
          className={`stanza ${parts ? `part-${s.part}` : ''}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: si * 0.12 }}
        >
          <AnimatePresence>
            {parts && (
              <motion.span className="stanza-tag" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {s.name} · {s.part === 'opis' ? 'część opisowa' : 'część refleksyjna'}
              </motion.span>
            )}
          </AnimatePresence>
          {SONET.slice(s.from, s.to).map((l, li) => (
            <div key={li} className="sonnet-line">
              <span>
                {l.text}
                <span className={`rhyme-end ${rhymes ? '' : 'off'}`} style={{ '--g': SONET_COLORS[l.g] } as React.CSSProperties}>
                  {l.end}
                </span>
              </span>
              <AnimatePresence>
                {rhymes && (
                  <motion.b
                    className="rhyme-letter"
                    style={{ color: SONET_COLORS[l.g] }}
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: (s.from + li) * 0.04 }}
                  >
                    {l.g}
                  </motion.b>
                )}
              </AnimatePresence>
            </div>
          ))}
        </motion.div>
      ))}
      <p className="poem-info">
        {rhymes ? (
          <>
            Układ rymów: <b>abba abba cdc dcd</b> – w czterowierszach rymy okalające, w tercynach przeplatane.{' '}
          </>
        ) : null}
        {parts
          ? 'Czterowiersze malują krajobraz (step jak ocean), tercyny przynoszą ciszę i zwrot ku tęsknocie za Litwą – puenta w ostatnim wersie.'
          : !rhymes && 'Włącz rymy albo kompozycję, aby zobaczyć budowę sonetu.'}
      </p>
    </div>
  );
}

export const versification: Topic = {
  id: 'wersyfikacja',
  title: 'Wersyfikacja: sylaby, rytm i rymy',
  subject: 'polski',
  summary: 'Policz zgłoski Inwokacji, usłysz rytm „Roty”, rozłóż na części sonet „Stepy akermańskie”.',
  accent: '#e0913a',
  glyph: '♪',
  steps: [
    {
      title: 'Sylaby, wers i średniówka',
      kind: 'page',
      scene: SyllableScene,
      controls: [
        { type: 'toggle', key: 'split', label: 'Podziel na sylaby', default: true },
        { type: 'toggle', key: 'caesura', label: 'Pokaż średniówkę', default: true },
        { type: 'toggle', key: 'accents', label: 'Pokaż akcenty', default: false },
      ],
      body: (
        <>
          <p>
            <strong>Wers</strong> to jedna linijka wiersza. W poezji polskiej podstawową jednostką rytmu jest{' '}
            <strong>sylaba</strong> (zgłoska).
          </p>
          <p>
            Policz sylaby w Inwokacji: każdy wers ma ich <strong>13</strong>. To <strong>trzynastozgłoskowiec</strong> –
            klasyczny wiersz epiki polskiej.
          </p>
          <p>
            Po 7. sylabie wypada <strong>średniówka</strong> – stała przerwa dzieląca wers na dwie części (7 + 6). Zwykle
            pokrywa się z granicą słowa lub frazy.
          </p>
          <p>Włącz akcenty: w polszczyźnie akcent pada zwykle na przedostatnią sylabę wyrazu (akcent paroksytoniczny).</p>
        </>
      ),
    },
    {
      title: 'Systemy wersyfikacyjne',
      kind: 'page',
      scene: RhythmScene,
      controls: [
        {
          type: 'select',
          key: 'system',
          label: 'System',
          default: 'syllabotonic',
          options: [
            { value: 'syllabic', label: 'Sylabiczny' },
            { value: 'syllabotonic', label: 'Sylabotoniczny' },
            { value: 'free', label: 'Wiersz wolny' },
          ],
        },
      ],
      body: (
        <>
          <p>Systemy wersyfikacyjne różnią się tym, co w wierszu jest regularne:</p>
          <p>
            <strong>Sylabizm</strong> – stała liczba sylab w wersie (Kochanowski, Mickiewicz).
          </p>
          <p>
            <strong>Sylabotonizm</strong> – stała liczba sylab <em>i</em> regularny układ akcentów tworzący stopy (jamb ◡–,
            trochej –◡, daktyl –◡◡, amfibrach ◡–◡).
          </p>
          <p>
            <strong>Tonizm</strong> – stała liczba akcentów w wersie przy zmiennej liczbie sylab (część poezji Młodej
            Polski i dwudziestolecia).
          </p>
          <p>
            <strong>Wiersz wolny</strong> – brak stałego metrum; dominuje w poezji XX wieku (awangarda, Różewicz). Często
            korzysta z <strong>przerzutni</strong> – zdanie „przelewa się” do następnego wersu.
          </p>
          <p>Obserwuj pulsujące akcenty: w „Rocie” uderzają równo co drugą sylabę jak marsz.</p>
        </>
      ),
    },
    {
      title: 'Stopy metryczne',
      kind: 'page',
      scene: FeetScene,
      controls: [
        {
          type: 'select',
          key: 'foot',
          label: 'Stopa',
          default: 'trochej',
          options: Object.entries(FEET).map(([value, f]) => ({ value, label: f.name })),
        },
        { type: 'toggle', key: 'play', label: 'Wybijaj rytm', default: true },
        { type: 'slider', key: 'tempo', label: 'Tempo', min: 0.4, max: 2, step: 0.1, default: 1, unit: '×' },
      ],
      body: (
        <>
          <p>
            W sylabotonizmie wers dzieli się na <strong>stopy</strong> – powtarzalne grupy sylab z jednym akcentem.
            Oznaczamy je znakami: <strong>–</strong> sylaba akcentowana, <strong>◡</strong> nieakcentowana.
          </p>
          <p>Stopy dwusylabowe to trochej i jamb, trzysylabowe – daktyl, amfibrach i anapest.</p>
          <p>
            Nazwa miary mówi o stopie i ich liczbie w wersie, np. <strong>czterostopowy jamb</strong> = 4 stopy ◡–, czyli 8
            sylab. Tak zbudowana jest „Rota”.
          </p>
          <p>Przełączaj stopy i obserwuj, gdzie wypada „skok” akcentu.</p>
        </>
      ),
    },
    {
      title: 'Układy rymów',
      kind: 'page',
      scene: RhymeScene,
      controls: [
        {
          type: 'select',
          key: 'scheme',
          label: 'Układ',
          default: 'aabb',
          options: [
            { value: 'aabb', label: 'aabb' },
            { value: 'abab', label: 'abab' },
            { value: 'abba', label: 'abba' },
          ],
        },
      ],
      body: (
        <>
          <p>
            <strong>Rym</strong> to współbrzmienie końcówek wersów. Rymy oznaczamy literami – te same litery to wersy
            rymujące się ze sobą.
          </p>
          <p>
            <strong>Parzyste (aabb)</strong> – rymują się sąsiednie wersy. <strong>Krzyżowe (abab)</strong> – co drugi
            wers. <strong>Okalające (abba)</strong> – para wewnętrzna objęta parą zewnętrzną; typowe dla sonetu.
          </p>
          <p>
            Zwróć uwagę na rodzaj rymu: <em>zdrowie – dowie</em> to rym <strong>żeński</strong> (akcent na przedostatniej
            sylabie). Rym <strong>męski</strong> łączy wyrazy akcentowane na ostatniej sylabie, np. <em>ród – lud</em>.
          </p>
          <p>
            Rymy bywają też <strong>dokładne</strong> (pełna zgodność głosek: <em>brodzi – powodzi</em>) i{' '}
            <strong>niedokładne</strong> (zgodność tylko części głosek), a także <strong>wewnętrzne</strong> – gdy rymuje
            się słowo w środku wersu ze słowem na końcu.
          </p>
        </>
      ),
    },
    {
      title: 'Sonet – budowa i kompozycja',
      kind: 'page',
      scene: SonnetScene,
      controls: [
        { type: 'toggle', key: 'rhymes', label: 'Pokaż rymy', default: true },
        { type: 'toggle', key: 'parts', label: 'Pokaż kompozycję', default: false },
      ],
      body: (
        <>
          <p>
            <strong>Sonet</strong> to jeden z najbardziej „ścisłych” gatunków lirycznych: <strong>14 wersów</strong>{' '}
            ułożonych w dwa czterowiersze i dwa trójwiersze.
          </p>
          <p>
            W wersji włoskiej (Petrarka) czterowiersze mają rymy <strong>abba abba</strong>, a tercyny – <em>cdc dcd</em>{' '}
            albo <em>cde cde</em>. Do Polski sonet przenieśli Kochanowski i Sęp Szarzyński; w romantyzmie mistrzem formy był
            Mickiewicz.
          </p>
          <p>
            Kompozycja jest dwudzielna: <strong>część opisowa</strong> (czterowiersze) i <strong>część refleksyjna</strong>{' '}
            (tercyny), często zakończona <strong>puentą</strong>. Włącz „Pokaż kompozycję” i porównaj obie części.
          </p>
        </>
      ),
    },
  ],
};
