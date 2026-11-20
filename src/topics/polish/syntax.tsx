import { AnimatePresence, motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';
import { useNarrow } from '../../lib/useNarrow';
import { MorphSentence, RoleLegend, toks } from '../../lib/Morph';

/* ======================= Krok 1: części zdania pojedynczego ======================= */

type Part = 'podmiot' | 'orzeczenie' | 'przydawka' | 'dopelnienie' | 'okolicznik';

const PARTS: Record<Part, { name: string; color: string; q: string; line: string }> = {
  podmiot: { name: 'podmiot', color: '#3d8bff', q: 'kto? co?', line: 'jedna linia' },
  orzeczenie: { name: 'orzeczenie', color: '#ef4444', q: 'co robi? co się z nim dzieje?', line: 'dwie linie' },
  przydawka: { name: 'przydawka', color: '#e0913a', q: 'jaki? czyj? który?', line: 'linia falista' },
  dopelnienie: { name: 'dopełnienie', color: '#22b07d', q: 'kogo? czego? co? komu?', line: 'linia przerywana' },
  okolicznik: { name: 'okolicznik', color: '#a855f7', q: 'gdzie? kiedy? jak? dlaczego?', line: 'kropka-kreska' },
};

interface Tok {
  w: string;
  part: Part;
  /** indeks wyrazu nadrzędnego (dla podmiotu i orzeczenia: brak) */
  head?: number;
  q?: string;
}

const SENTENCES: Record<string, Tok[]> = {
  kot: [
    { w: 'Mały', part: 'przydawka', head: 1, q: 'jaki?' },
    { w: 'kot', part: 'podmiot' },
    { w: 'szybko', part: 'okolicznik', head: 3, q: 'jak?' },
    { w: 'pije', part: 'orzeczenie' },
    { w: 'ciepłe', part: 'przydawka', head: 5, q: 'jakie?' },
    { w: 'mleko.', part: 'dopelnienie', head: 3, q: 'co?' },
  ],
  brat: [
    { w: 'Wczoraj', part: 'okolicznik', head: 4, q: 'kiedy?' },
    { w: 'mój', part: 'przydawka', head: 3, q: 'czyj?' },
    { w: 'starszy', part: 'przydawka', head: 3, q: 'jaki?' },
    { w: 'brat', part: 'podmiot' },
    { w: 'napisał', part: 'orzeczenie' },
    { w: 'długi', part: 'przydawka', head: 6, q: 'jaki?' },
    { w: 'list', part: 'dopelnienie', head: 4, q: 'co?' },
    { w: 'do babci.', part: 'dopelnienie', head: 4, q: 'do kogo?' },
  ],
};

/** Prosty układ drzewa: każdy węzeł zajmuje tyle „kolumn”, ile liści ma jego poddrzewo. */
function layoutTree(toks: Tok[]) {
  const children = (i: number) => toks.map((t, j) => (t.head === i ? j : -1)).filter((j) => j >= 0);
  const width = (i: number): number => Math.max(1, children(i).reduce((s, c) => s + width(c), 0));
  const pos: Record<number, { col: number; depth: number }> = {};
  const place = (i: number, start: number, depth: number) => {
    const w = width(i);
    pos[i] = { col: start + w / 2, depth };
    let s = start;
    for (const c of children(i)) {
      place(c, s, depth + 1);
      s += width(c);
    }
  };
  const subj = toks.findIndex((t) => t.part === 'podmiot');
  const pred = toks.findIndex((t) => t.part === 'orzeczenie');
  place(subj, 0, 0);
  place(pred, width(subj) + 0.4, 0);
  const cols = width(subj) + 0.4 + width(pred);
  const depth = Math.max(...Object.values(pos).map((p) => p.depth));
  return { pos, cols, depth, subj, pred };
}

function PartsScene({ params }: SceneProps) {
  const toks = SENTENCES[String(params.sentence ?? 'kot')];
  const underline = Boolean(params.underline);
  const tree = Boolean(params.tree);
  const { pos, cols, depth, subj, pred } = layoutTree(toks);
  const narrow = useNarrow();
  // na telefonie węższy układ = mniejsze pomniejszenie SVG = większe napisy
  const W = narrow ? 400 : 640;
  const colW = W / cols;
  const rowH = narrow ? 74 : 86;
  const boxW = narrow ? 82 : 92;
  const pad = narrow ? 20 : 60;
  const H = (depth + 1) * rowH + 20;
  const X = (i: number) => pos[i].col * colW;
  const Y = (i: number) => 30 + pos[i].depth * rowH;

  return (
    <div className="poem syntax">
      <div className="sentence-line">
        {toks.map((t, i) => (
          <motion.span
            key={`${t.w}-${i}`}
            className={`part ${underline ? `u-${t.part}` : ''}`}
            style={{ '--pc': PARTS[t.part].color } as React.CSSProperties}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            {t.w}
          </motion.span>
        ))}
      </div>

      <AnimatePresence>
        {tree && (
          <motion.svg
            className="tree-svg"
            viewBox={`${-pad} 0 ${W + pad * 2} ${H}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* związek główny: podmiot – orzeczenie */}
            <motion.line
              x1={X(subj) + boxW / 2}
              x2={X(pred) - boxW / 2}
              y1={Y(subj)}
              y2={Y(pred)}
              stroke="currentColor"
              strokeWidth="2.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5 }}
            />
            {toks.map((t, i) =>
              t.head === undefined ? null : (
                <g key={`e${i}`}>
                  <motion.line
                    x1={X(t.head)}
                    y1={Y(t.head) + 16}
                    x2={X(i)}
                    y2={Y(i) - 16}
                    stroke="currentColor"
                    strokeOpacity="0.45"
                    strokeWidth="1.5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.3 + pos[i].depth * 0.25, duration: 0.4 }}
                  />
                  <motion.text
                    x={(X(t.head) + X(i)) / 2 + 6}
                    y={(Y(t.head) + Y(i)) / 2 + 4}
                    fontSize="12"
                    fontStyle="italic"
                    fill="currentColor"
                    opacity="0.65"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.65 }}
                    transition={{ delay: 0.6 + pos[i].depth * 0.25 }}
                  >
                    {t.q}
                  </motion.text>
                </g>
              ),
            )}
            {toks.map((t, i) => (
              <motion.g
                key={`n${i}`}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 + pos[i].depth * 0.25, type: 'spring', stiffness: 300, damping: 20 }}
                style={{ transformOrigin: `${X(i)}px ${Y(i)}px` }}
              >
                <rect x={X(i) - boxW / 2} y={Y(i) - 16} width={boxW} height="32" rx="9" fill={PARTS[t.part].color} opacity="0.16" />
                <rect x={X(i) - boxW / 2} y={Y(i) - 16} width={boxW} height="32" rx="9" fill="none" stroke={PARTS[t.part].color} strokeWidth="1.5" />
                <text className="node-label" x={X(i)} y={Y(i) + 5} textAnchor="middle" fontSize="15" fontWeight="600" fill="currentColor">
                  {t.w.replace('.', '')}
                </text>
              </motion.g>
            ))}
          </motion.svg>
        )}
      </AnimatePresence>

      <div className="parts-legend">
        {(Object.keys(PARTS) as Part[]).map((p) => (
          <span key={p} style={{ '--pc': PARTS[p].color } as React.CSSProperties}>
            <b className={`part u-${p}`}>{PARTS[p].name}</b>
            <small>
              {PARTS[p].q} · {PARTS[p].line}
            </small>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ======================= Krok 2: zdania złożone współrzędnie ======================= */

interface Coord {
  name: string;
  a: string;
  conj: string;
  b: string;
  symbol: 'line' | 'out' | 'in' | 'right' | 'eq';
  conjs: string;
  note: string;
}

const COORD: Record<string, Coord> = {
  laczne: { name: 'łączne', a: 'Ania czyta książkę', conj: 'i', b: 'Tomek rysuje.', symbol: 'line', conjs: 'i, oraz, a, ani, ni', note: 'Czynności zachodzą równocześnie lub po sobie – po prostu się sumują.' },
  rozlaczne: { name: 'rozłączne', a: 'Pójdziemy do kina', conj: 'albo', b: 'zostaniemy w domu.', symbol: 'out', conjs: 'lub, albo, czy, bądź', note: 'Treści się wykluczają – zachodzi jedno albo drugie.' },
  przeciwstawne: { name: 'przeciwstawne', a: 'Było zimno,', conj: 'ale', b: 'świeciło słońce.', symbol: 'in', conjs: 'ale, lecz, jednak, natomiast, zaś', note: 'Druga część przeciwstawia się pierwszej. Przed spójnikiem zawsze przecinek.' },
  wynikowe: { name: 'wynikowe', a: 'Padał deszcz,', conj: 'więc', b: 'zostaliśmy w domu.', symbol: 'right', conjs: 'więc, zatem, dlatego, toteż', note: 'Druga część jest skutkiem pierwszej. Przed spójnikiem przecinek.' },
  wyjasniajace: { name: 'wyjaśniające', a: 'Był bardzo zmęczony,', conj: 'to znaczy', b: 'ledwo trzymał się na nogach.', symbol: 'eq', conjs: 'czyli, to jest (tj.), mianowicie, to znaczy', note: 'Druga część wyjaśnia, uściśla lub dopowiada treść pierwszej. Przed spójnikiem przecinek.' },
};

function CoordScene({ params }: SceneProps) {
  const c = COORD[String(params.type ?? 'laczne')];
  const W = 640;
  const boxW = 220;
  const y = 70;
  const xA = 40;
  const xB = W - 40 - boxW;
  const x1 = xA + boxW;
  const x2 = xB;
  return (
    <div className="poem syntax">
      <AnimatePresence mode="wait">
        <motion.div key={c.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="sentence-line">
            <span className="clause-a">{c.a}</span> <b className="conj">{c.conj}</b> <span className="clause-b">{c.b}</span>
          </div>
          <svg className="tree-svg" viewBox={`0 0 ${W} 140`}>
            <defs>
              <marker id="cR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
              </marker>
            </defs>
            {[
              { x: xA, label: 'zdanie składowe 1', cls: '#3d8bff' },
              { x: xB, label: 'zdanie składowe 2', cls: '#22b07d' },
            ].map((b, i) => (
              <motion.g key={i} initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}>
                <rect x={b.x} y={y - 24} width={boxW} height="48" rx="10" fill={b.cls} opacity="0.14" />
                <rect x={b.x} y={y - 24} width={boxW} height="48" rx="10" fill="none" stroke={b.cls} strokeWidth="2" />
                <text x={b.x + boxW / 2} y={y + 5} textAnchor="middle" fontSize="15" fill="currentColor">
                  {b.label}
                </text>
              </motion.g>
            ))}
            {c.symbol === 'eq' ? (
              <>
                {[-5, 5].map((dy) => (
                  <motion.line key={dy} x1={x1 + 6} x2={x2 - 6} y1={y + dy} y2={y + dy} stroke="currentColor" strokeWidth="2.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.4 }} />
                ))}
              </>
            ) : c.symbol === 'in' ? (
              <>
                <motion.line x1={x1 + 6} x2={(x1 + x2) / 2 - 4} y1={y} y2={y} stroke="currentColor" strokeWidth="2.5" markerEnd="url(#cR)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.4 }} />
                <motion.line x1={x2 - 6} x2={(x1 + x2) / 2 + 4} y1={y} y2={y} stroke="currentColor" strokeWidth="2.5" markerEnd="url(#cR)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.4 }} />
              </>
            ) : (
              <motion.line
                x1={x1 + 6}
                x2={x2 - 6}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeWidth="2.5"
                markerStart={c.symbol === 'out' ? 'url(#cR)' : undefined}
                markerEnd={c.symbol === 'out' || c.symbol === 'right' ? 'url(#cR)' : undefined}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.4 }}
              />
            )}
            <motion.text x={(x1 + x2) / 2} y={y - 14} textAnchor="middle" fontSize="17" fontWeight="700" fill="currentColor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
              {c.conj}
            </motion.text>
            <text x={W / 2} y={y + 58} textAnchor="middle" fontSize="13" fill="currentColor" opacity="0.6">
              zdanie złożone współrzędnie {c.name}
            </text>
          </svg>
          <p className="poem-info">
            <b>Spójniki:</b> {c.conjs}. {c.note}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ======================= Krok 3: zdania złożone podrzędnie ======================= */

interface Sub {
  name: string;
  /** Kolejność w zdaniu: „main-first” albo „sub-first”. */
  order: 'main-first' | 'sub-first';
  main: string;
  sub: string;
  link: string;
  q: string;
  note: string;
}

const SUB: Record<string, Sub> = {
  przydawkowe: { name: 'przydawkowe', order: 'main-first', main: 'Przeczytałem książkę,', sub: 'którą mi poleciłaś.', link: 'którą', q: 'jaką książkę?', note: 'Określa rzeczownik ze zdania nadrzędnego. Zwykle zaczyna się od: który, jaki, czyj, gdzie.' },
  dopelnieniowe: { name: 'dopełnieniowe', order: 'main-first', main: 'Wiem,', sub: 'że jutro jest sprawdzian.', link: 'że', q: 'co wiem?', note: 'Pełni funkcję dopełnienia: odpowiada na pytania przypadków zależnych (kogo? czego? co? o czym?).' },
  czasu: { name: 'okolicznikowe czasu', order: 'main-first', main: 'Zadzwonię,', sub: 'kiedy wrócę do domu.', link: 'kiedy', q: 'kiedy?', note: 'Okolicznikowe odpowiadają na pytania okolicznika. Czasu: kiedy? od kiedy? do kiedy?' },
  przyczyny: { name: 'okolicznikowe przyczyny', order: 'main-first', main: 'Nie przyszła na lekcję,', sub: 'bo była chora.', link: 'bo', q: 'dlaczego?', note: 'Podaje przyczynę: bo, ponieważ, gdyż, dlatego że.' },
  celu: { name: 'okolicznikowe celu', order: 'main-first', main: 'Uczę się codziennie,', sub: 'żeby zdać maturę.', link: 'żeby', q: 'po co? w jakim celu?', note: 'Wskazuje cel: żeby, aby, by, ażeby.' },
  warunku: { name: 'okolicznikowe warunku', order: 'sub-first', main: 'pojedziemy nad morze.', sub: 'Jeśli będzie ładna pogoda,', link: 'Jeśli', q: 'pod jakim warunkiem?', note: 'Wyraża warunek: jeśli, jeżeli, gdyby, o ile.' },
  miejsca: { name: 'okolicznikowe miejsca', order: 'main-first', main: 'Wyjedziemy tam,', sub: 'gdzie nikt nas nie zna.', link: 'gdzie', q: 'gdzie?', note: 'Wskazuje miejsce lub kierunek: gdzie, dokąd, skąd, którędy. W nadrzędnym często pojawia się zapowiednik „tam”.' },
  sposobu: { name: 'okolicznikowe sposobu', order: 'main-first', main: 'Mówił tak,', sub: 'jakby wszystko wiedział.', link: 'jakby', q: 'jak? w jaki sposób?', note: 'Opisuje sposób wykonania czynności: jak, jakby, jak gdyby, niby. Często z zapowiednikiem „tak”.' },
  przyzwolenia: { name: 'okolicznikowe przyzwolenia', order: 'sub-first', main: 'nikt nie chciał iść do domu.', sub: 'Choć było już późno,', link: 'Choć', q: 'mimo czego?', note: 'Wyraża okoliczność, która mogłaby przeszkodzić, a jednak nie przeszkadza: choć, chociaż, mimo że, pomimo że.' },
  podmiotowe: { name: 'podmiotowe', order: 'sub-first', main: 'nie błądzi.', sub: 'Kto pyta,', link: 'Kto', q: 'kto nie błądzi?', note: 'Zastępuje podmiot zdania nadrzędnego – nadrzędne nie ma własnego podmiotu.' },
  orzecznikowe: { name: 'orzecznikowe', order: 'main-first', main: 'Został tym,', sub: 'kim zawsze chciał być.', link: 'kim', q: 'kim został?', note: 'Pełni funkcję orzecznika – dopowiada treść orzeczenia imiennego (był, został, stał się + zaimek „tym”, „taki”).' },
};

function Highlight({ text, word }: { text: string; word: string }) {
  const i = text.indexOf(word);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <b className="conj">{word}</b>
      {text.slice(i + word.length)}
    </>
  );
}

function SubScene({ params }: SceneProps) {
  const s = SUB[String(params.type ?? 'przydawkowe')];
  const W = 640;
  const boxW = 300;
  const cx = W / 2;
  return (
    <div className="poem syntax">
      <AnimatePresence mode="wait">
        <motion.div key={s.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="sentence-line">
            {s.order === 'main-first' ? (
              <>
                <span className="clause-a">{s.main}</span>{' '}
                <span className="clause-b">
                  <Highlight text={s.sub} word={s.link} />
                </span>
              </>
            ) : (
              <>
                <span className="clause-b">
                  <Highlight text={s.sub} word={s.link} />
                </span>{' '}
                <span className="clause-a">{s.main}</span>
              </>
            )}
          </div>
          <svg className="tree-svg" viewBox={`0 0 ${W} 230`}>
            <motion.g initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}>
              <rect x={cx - boxW / 2} y={20} width={boxW} height="48" rx="10" fill="#3d8bff" opacity="0.14" />
              <rect x={cx - boxW / 2} y={20} width={boxW} height="48" rx="10" fill="none" stroke="#3d8bff" strokeWidth="2" />
              <text x={cx} y={49} textAnchor="middle" fontSize="15" fill="currentColor">
                zdanie nadrzędne
              </text>
            </motion.g>
            <motion.line x1={cx} x2={cx} y1={70} y2={150} stroke="currentColor" strokeWidth="2.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.35, duration: 0.4 }} />
            <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7, type: 'spring' }} style={{ transformOrigin: `${cx}px 110px` }}>
              <rect x={cx + 12} y={96} width={Math.max(110, s.q.length * 9)} height="28" rx="14" fill="#e0913a" opacity="0.2" />
              <text x={cx + 24} y={115} fontSize="14" fontStyle="italic" fontWeight="600" fill="currentColor">
                {s.q}
              </text>
            </motion.g>
            <motion.g initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <rect x={cx - boxW / 2} y={152} width={boxW} height="48" rx="10" fill="#22b07d" opacity="0.14" />
              <rect x={cx - boxW / 2} y={152} width={boxW} height="48" rx="10" fill="none" stroke="#22b07d" strokeWidth="2" />
              <text x={cx} y={181} textAnchor="middle" fontSize="15" fill="currentColor">
                zdanie podrzędne {s.name.split(' ')[0]}
              </text>
            </motion.g>
          </svg>
          <p className="poem-info">{s.note}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ======================= Krok 4: imiesłowowy równoważnik zdania ======================= */

const PART_COLORS = { s: '#3d8bff', v1: '#22b07d', v2: '#e0913a', imp: '#a855f7', s2: '#ef4444' };

interface Participle {
  label: string;
  before: string;
  after: string;
  ok: boolean;
  kind: string;
  who: [string, string];
  note: string;
}

const PARTICIPLES: Record<string, Participle> = {
  wrocila: {
    label: 'Wróciwszy do domu…',
    before: 'kiedy:Kiedy | ola:Ola@s | v1:wróciła@v1 | dd:do domu, | v2:zjadła@v2 | ob:obiad.',
    after: 'v1:Wróciwszy@imp | dd:do domu, | ola:Ola@s | v2:zjadła@v2 | ob:obiad.',
    ok: true,
    kind: 'imiesłów uprzedni (-wszy, -łszy)',
    who: ['Ola', 'Ola'],
    note: 'Najpierw wróciła, potem zjadła – czynność z imiesłowu jest wcześniejsza, więc używamy imiesłowu uprzedniego.',
  },
  czytal: {
    label: 'Czytając gazetę…',
    before: 'kiedy:Kiedy | v1:czytał@v1 | g:gazetę, | v2:pił@v2 | k:kawę.',
    after: 'v1:Czytając@imp | g:gazetę, | v2:pił@v2 | k:kawę.',
    ok: true,
    kind: 'imiesłów współczesny (-ąc)',
    who: ['on', 'on'],
    note: 'Obie czynności dzieją się równocześnie – stąd imiesłów współczesny. Wykonawca jest domyślny (on), ale ten sam.',
  },
  skonczyl: {
    label: 'Skończywszy lekcje…',
    before: 'gdy:Gdy | t:Tomek@s | v1:skończył@v1 | l:lekcje, | v2:wyszedł@v2 | b:na boisko.',
    after: 'v1:Skończywszy@imp | l:lekcje, | t:Tomek@s | v2:wyszedł@v2 | b:na boisko.',
    ok: true,
    kind: 'imiesłów uprzedni (-wszy, -łszy)',
    who: ['Tomek', 'Tomek'],
    note: 'Podmiot przechodzi do zdania głównego – przecinek oddziela równoważnik od reszty.',
  },
  deszcz: {
    label: 'Wracając ze szkoły, zaczął padać deszcz ✗',
    before: 'kiedy:Kiedy | v1:wracałem@v1 | sz:ze szkoły, | v2:zaczął@v2 | p:padać | d:deszcz.@s2',
    after: 'v1:Wracając@imp | sz:ze szkoły, | v2:zaczął@v2 | p:padać | d:deszcz.@s2',
    ok: false,
    kind: 'błąd składniowy',
    who: ['ja', 'deszcz'],
    note: 'Wychodzi na to, że to deszcz wracał ze szkoły! Gdy wykonawcy są różni, zostawiamy zdanie złożone: „Kiedy wracałem ze szkoły, zaczął padać deszcz”.',
  },
  dzwonek: {
    label: 'Wchodząc do klasy, zadzwonił dzwonek ✗',
    before: 'kiedy:Kiedy | v1:wchodziłam@v1 | kl:do klasy, | v2:zadzwonił@v2 | d:dzwonek.@s2',
    after: 'v1:Wchodząc@imp | kl:do klasy, | v2:zadzwonił@v2 | d:dzwonek.@s2',
    ok: false,
    kind: 'błąd składniowy',
    who: ['ja', 'dzwonek'],
    note: 'Dzwonek nie wchodził do klasy. Poprawnie: „Kiedy wchodziłam do klasy, zadzwonił dzwonek”.',
  },
};

function ParticipleScene({ params }: SceneProps) {
  const ex = PARTICIPLES[String(params.example ?? 'wrocila')];
  const on = Boolean(params.transform);
  const id = String(params.example ?? 'wrocila');
  return (
    <div className="poem syntax">
      <div className="poem-source">{on ? 'imiesłowowy równoważnik zdania' : 'zdanie złożone podrzędnie'}</div>
      <MorphSentence key={id} id={`imp-${id}`} tokens={toks(on ? ex.after : ex.before)} colors={PART_COLORS} />
      <AnimatePresence mode="wait">
        <motion.div key={`${id}-${on}`} className="agents" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <span>
            wykonawca czynności 1: <b>{ex.who[0]}</b>
          </span>
          <span>
            wykonawca czynności 2: <b>{ex.who[1]}</b>
          </span>
          <span className={`verdict ${ex.ok ? 'ok' : 'bad'}`}>{ex.ok ? '✓ ten sam wykonawca – można przekształcić' : '✗ różni wykonawcy – nie wolno przekształcać'}</span>
        </motion.div>
      </AnimatePresence>
      <RoleLegend
        items={[
          { color: PART_COLORS.s, label: 'podmiot' },
          { color: PART_COLORS.v1, label: 'czynność 1' },
          { color: PART_COLORS.v2, label: 'czynność 2' },
          { color: PART_COLORS.imp, label: 'imiesłów' },
          { color: PART_COLORS.s2, label: 'inny wykonawca' },
        ]}
      />
      <p className="poem-info">
        <b>{ex.kind}.</b> {ex.note}
      </p>
    </div>
  );
}

/* ======================= Krok 5: przecinek – ćwiczenie ======================= */

interface CommaEx {
  words: string[];
  /** Indeks słowa, po którym musi stać przecinek → uzasadnienie. */
  commas: Record<number, string>;
  /** Wyjaśnienie dla zdań bez przecinka. */
  none?: string;
}

const COMMA_EX: CommaEx[] = [
  { words: ['Wiem', 'że', 'jutro', 'jest', 'sprawdzian.'], commas: { 0: 'Przed „że” zaczyna się zdanie podrzędne – oddzielamy je przecinkiem.' } },
  {
    words: ['Kupiłam', 'chleb', 'masło', 'ser', 'i', 'mleko.'],
    commas: { 1: 'Elementy wyliczenia oddzielamy przecinkami.', 2: 'Kolejny element wyliczenia – przecinek. Ale przed „i” łączącym ostatni element przecinka już nie stawiamy.' },
  },
  {
    words: ['Książka', 'którą', 'mi', 'poleciłaś', 'jest', 'świetna.'],
    commas: { 0: 'Zdanie podrzędne wtrącone w środek nadrzędnego otwieramy przecinkiem…', 3: '…i zamykamy przecinkiem – wtrącenie ma przecinki z obu stron.' },
  },
  { words: ['Było', 'zimno', 'ale', 'świeciło', 'słońce.'], commas: { 1: 'Przed „ale” (zdanie przeciwstawne) zawsze stawiamy przecinek.' } },
  {
    words: ['Pójdziemy', 'do', 'kina', 'albo', 'zostaniemy', 'w', 'domu.'],
    commas: {},
    none: 'Przed pojedynczymi spójnikami „albo”, „lub”, „i”, „oraz”, „ani” przecinka nie stawiamy.',
  },
  { words: ['Wróciwszy', 'do', 'domu', 'Ola', 'zjadła', 'obiad.'], commas: { 2: 'Imiesłowowy równoważnik zdania oddzielamy przecinkiem.' } },
  { words: ['Mamo', 'czy', 'możesz', 'mi', 'pomóc?'], commas: { 0: 'Wołacz – bezpośredni zwrot do kogoś – oddzielamy przecinkiem.' } },
  { words: ['Ania', 'czytała', 'a', 'Tomek', 'rysował.'], commas: { 1: 'Przed „a” w znaczeniu przeciwstawnym stawiamy przecinek.' } },
  { words: ['Nie', 'wiem', 'dlaczego', 'tak', 'się', 'stało.'], commas: { 1: 'Zaimek „dlaczego” otwiera zdanie podrzędne – przed nim przecinek.' } },
  { words: ['Im', 'dłużej', 'czekał', 'tym', 'bardziej', 'się', 'niecierpliwił.'], commas: { 2: 'W konstrukcji „im…, tym…” przecinek stawiamy przed „tym”.' } },
];

function CommaScene({ params }: SceneProps) {
  const n = Number(params.sentence ?? 0);
  const show = Boolean(params.show);
  const ex = COMMA_EX[n];
  const rules = Object.entries(ex.commas);
  return (
    <div className="poem commas">
      <AnimatePresence mode="wait">
        <motion.div key={n} className="comma-line" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          {ex.words.map((w, i) => {
            const k = rules.findIndex(([g]) => Number(g) === i);
            return (
              <span key={i} className="comma-word">
                <span>{w}</span>
                <AnimatePresence>
                  {show && k >= 0 && (
                    <motion.b className="comma-mark" initial={{ opacity: 0, y: -18, scale: 1.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.25 + k * 0.35, type: 'spring', stiffness: 300, damping: 16 }}>
                      ,<sup>{k + 1}</sup>
                    </motion.b>
                  )}
                </AnimatePresence>
                {i < ex.words.length - 1 && <span>&nbsp;</span>}
              </span>
            );
          })}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {show ? (
          <motion.ol key={`r${n}`} className="comma-rules" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {rules.map(([g, why]) => (
              <li key={g}>
                <b>po „{ex.words[Number(g)]}”</b> – {why}
              </li>
            ))}
            {ex.none && <li className="none">{ex.none}</li>}
          </motion.ol>
        ) : (
          <motion.p key="hint" className="poem-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            Przeczytaj zdanie na głos i zastanów się, gdzie robisz pauzę. Potem włącz „Pokaż przecinki”.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export const syntax: Topic = {
  id: 'zdanie-zlozone',
  title: 'Składnia: części zdania i zdania złożone',
  subject: 'polski',
  summary: 'Podkreślenia, pytania i wykresy zdań – od zdania pojedynczego przez złożone aż po imiesłowowy równoważnik. Na koniec ćwiczenie z przecinków.',
  accent: '#c2410c',
  glyph: '⌥',
  steps: [
    {
      title: 'Części zdania i wykres zdania pojedynczego',
      kind: 'page',
      scene: PartsScene,
      controls: [
        {
          type: 'select',
          key: 'sentence',
          label: 'Zdanie',
          default: 'kot',
          options: [
            { value: 'kot', label: 'Mały kot…' },
            { value: 'brat', label: 'Wczoraj mój brat…' },
          ],
        },
        { type: 'toggle', key: 'underline', label: 'Podkreśl części zdania', default: true },
        { type: 'toggle', key: 'tree', label: 'Pokaż wykres', default: true },
      ],
      body: (
        <>
          <p>
            Trzon zdania tworzą <strong>podmiot</strong> i <strong>orzeczenie</strong> – to związek główny. Pozostałe
            części zdania określają je i tworzą <strong>grupę podmiotu</strong> oraz <strong>grupę orzeczenia</strong>.
          </p>
          <p>
            Na wykresie każdy wyraz określający łączy się z wyrazem, który określa. Przy linii zapisujemy{' '}
            <strong>pytanie</strong>, na które odpowiada.
          </p>
          <p>
            Szkolne podkreślenia: podmiot – jedna linia, orzeczenie – dwie, przydawka – falista, dopełnienie – przerywana,
            okolicznik – kropka-kreska.
          </p>
        </>
      ),
    },
    {
      title: 'Zdania złożone współrzędnie',
      kind: 'page',
      scene: CoordScene,
      controls: [
        {
          type: 'select',
          key: 'type',
          label: 'Rodzaj',
          default: 'laczne',
          options: Object.entries(COORD).map(([value, c]) => ({ value, label: c.name })),
        },
      ],
      body: (
        <>
          <p>
            W zdaniu złożonym <strong>współrzędnie</strong> oba zdania składowe są równorzędne – żadne nie określa
            drugiego. Na wykresie leżą na tym samym poziomie.
          </p>
          <p>
            Rodzaj zależy od spójnika i znaczenia. Zapamiętaj symbole: <strong>łączne</strong> – linia,{' '}
            <strong>rozłączne</strong> – strzałki na zewnątrz, <strong>przeciwstawne</strong> – strzałki do siebie,{' '}
            <strong>wynikowe</strong> – strzałka w stronę skutku, <strong>wyjaśniające</strong> – znak równości.
          </p>
          <p>Interpunkcja: przed „i”, „oraz”, „albo”, „lub” zwykle nie stawiamy przecinka; przed „ale”, „więc” – zawsze.</p>
        </>
      ),
    },
    {
      title: 'Zdania złożone podrzędnie',
      kind: 'page',
      scene: SubScene,
      controls: [
        {
          type: 'select',
          key: 'type',
          label: 'Rodzaj',
          default: 'przydawkowe',
          options: Object.entries(SUB).map(([value, s]) => ({ value, label: s.name.replace('okolicznikowe ', 'okol. ') })),
        },
      ],
      body: (
        <>
          <p>
            W zdaniu złożonym <strong>podrzędnie</strong> jedno zdanie (podrzędne) określa drugie (nadrzędne) – tak jak
            część zdania określa wyraz.
          </p>
          <p>
            Rodzaj zdania podrzędnego rozpoznajemy po <strong>pytaniu</strong>, które zadajemy od zdania nadrzędnego.
            Odpowiada ono nazwie części zdania: przydawkowe, dopełnieniowe, okolicznikowe, podmiotowe…
          </p>
          <p>Wyróżniony wyraz to spójnik lub zaimek łączący – przed nim stawiamy przecinek.</p>
          <p>
            Uwaga na <strong>zapowiedniki</strong> w zdaniu nadrzędnym („tam”, „tak”, „tym”) – podpowiadają, jakiego
            zdania podrzędnego się spodziewać.
          </p>
        </>
      ),
    },
    {
      title: 'Imiesłowowy równoważnik zdania',
      kind: 'page',
      scene: ParticipleScene,
      controls: [
        {
          type: 'select',
          key: 'example',
          label: 'Przykład',
          default: 'wrocila',
          options: Object.entries(PARTICIPLES).map(([value, p]) => ({ value, label: p.label })),
        },
        { type: 'toggle', key: 'transform', label: 'Przekształć w równoważnik', default: false },
      ],
      body: (
        <>
          <p>
            <strong>Imiesłowowy równoważnik zdania</strong> zastępuje zdanie podrzędne – zamiast osobowej formy czasownika
            ma imiesłów nieodmienny: <em>czytając</em> (współczesny, -ąc) albo <em>przeczytawszy</em> (uprzedni, -wszy,
            -łszy).
          </p>
          <p>
            Złota zasada: obie czynności musi wykonywać <strong>ten sam wykonawca</strong>. Inaczej powstaje błąd – często
            zabawny („Wracając ze szkoły, zaczął padać deszcz”).
          </p>
          <p>Włącz przekształcenie i obserwuj, jak słowa przesuwają się na nowe miejsca. Równoważnik zawsze oddzielamy przecinkiem.</p>
        </>
      ),
    },
    {
      title: 'Przecinek – zasady na przykładach',
      kind: 'page',
      scene: CommaScene,
      controls: [
        {
          type: 'select',
          key: 'sentence',
          label: 'Zdanie',
          default: '0',
          options: COMMA_EX.map((e, i) => ({ value: String(i), label: `${e.words.slice(0, 2).join(' ')}…` })),
        },
        { type: 'toggle', key: 'show', label: 'Pokaż przecinki', default: false },
      ],
      body: (
        <>
          <p>Dziesięć zdań, a w każdym inna reguła. Włącz „Pokaż przecinki” – wskoczą na swoje miejsca z numerem uzasadnienia.</p>
          <p>
            <strong>Zawsze</strong> przed spójnikami i zaimkami zdań podrzędnych (że, który, bo, gdy, dlaczego…), przed
            „ale”, „lecz”, „więc”, „a” (przeciwstawnym), przy wołaczu i imiesłowowym równoważniku.
          </p>
          <p>
            <strong>Nie</strong> stawiamy go przed pojedynczym „i”, „oraz”, „albo”, „lub”, „ani”. Zdanie wtrącone ma przecinki
            z obu stron.
          </p>
        </>
      ),
    },
  ],
};
