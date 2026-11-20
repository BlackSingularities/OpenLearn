import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';
import { Marked } from './marked';

/* ======================= Krok 1: trzy rodzaje literackie ======================= */

type Kind = 'liryka' | 'epika' | 'dramat';

const KIND_COLORS: Record<Kind, string> = { liryka: '#e0913a', epika: '#3d8bff', dramat: '#a855f7' };

const KINDS: Record<Kind, { who: string; base: string; form: string; traits: string[]; source: string; sample: { speaker?: string; text: string; stage?: boolean }[] }> = {
  liryka: {
    who: 'podmiot liryczny („ja” wiersza)',
    base: 'przeżycia, uczucia, refleksje',
    form: 'monolog liryczny, zwykle wiersz',
    traits: ['brak fabuły lub fabuła szczątkowa', 'subiektywizm', 'skrót, obrazowość, rytm'],
    source: 'J. Kochanowski, „Na lipę” – mówi drzewo',
    sample: [
      { text: 'Gościu, siądź pod mym liściem, a odpoczni sobie!' },
      { text: 'Nie dójdzie cię tu słońce, przyrzekam ja tobie,' },
    ],
  },
  epika: {
    who: 'narrator',
    base: 'fabuła – ciąg zdarzeń',
    form: 'narracja (opowiadanie), zwykle proza',
    traits: ['świat przedstawiony: postacie, czas, miejsce', 'opisy i dialogi wplecione w narrację', 'dystans narratora do zdarzeń'],
    source: 'B. Prus, „Lalka” – pierwsze zdanie',
    sample: [{ text: 'W początkach roku 1878, kiedy świat polityczny zajmował się pokojem San Stefano, wyborem nowego papieża albo szansami europejskiej wojny, […]' }],
  },
  dramat: {
    who: 'postacie (bez narratora)',
    base: 'akcja oparta na konflikcie',
    form: 'dialog i monolog + didaskalia',
    traits: ['przeznaczony do wystawienia na scenie', 'podział na akty i sceny', 'didaskalia – uwagi autora o miejscu, ruchu, tonie'],
    source: 'przykład ułożony na potrzeby lekcji',
    sample: [
      { stage: true, text: '(Pokój w starym domu. Wieczór. ANNA stoi przy oknie).' },
      { speaker: 'ANNA', text: 'Znowu pada…' },
      { speaker: 'PIOTR', text: '(wchodząc, otrzepuje płaszcz) Pada od rana. Nie czekaj na niego.' },
      { speaker: 'ANNA', text: '(nie odwracając się) Obiecał, że wróci przed zmrokiem.' },
    ],
  },
};

function KindsScene({ params }: SceneProps) {
  const kind = String(params.kind ?? 'liryka') as Kind;
  const k = KINDS[kind];
  return (
    <div className="poem kinds" style={{ '--kc': KIND_COLORS[kind] } as React.CSSProperties}>
      <div className="kind-tabs">
        {(Object.keys(KINDS) as Kind[]).map((key) => (
          <span key={key} className={key === kind ? 'on' : ''} style={{ '--kc': KIND_COLORS[key] } as React.CSSProperties}>
            {key}
          </span>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={kind} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
          <div className="kind-sample">
            <div className="poem-source">{k.source}</div>
            {k.sample.map((l, i) => (
              <motion.p
                key={i}
                className={l.stage ? 'stage-dir' : ''}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.18 }}
              >
                {l.speaker && <b className="speaker">{l.speaker}: </b>}
                {l.text.split(/(\([^)]*\))/).map((part, j) =>
                  part.startsWith('(') && !l.stage ? (
                    <em key={j} className="stage-dir">
                      {part}
                    </em>
                  ) : (
                    <span key={j}>{part}</span>
                  ),
                )}
              </motion.p>
            ))}
          </div>
          <dl className="kind-facts">
            {(
              [
                ['Kto mówi?', k.who],
                ['Podstawa', k.base],
                ['Sposób podawczy', k.form],
              ] as const
            ).map(([dt, dd], i) => (
              <motion.div key={dt} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.08 }}>
                <dt>{dt}</dt>
                <dd>{dd}</dd>
              </motion.div>
            ))}
          </dl>
          <ul className="kind-traits">
            {k.traits.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ======================= Krok 2: odmiany liryki ======================= */

const LYRIC: Record<string, { name: string; who: string; to: string; source: string; lines: string[]; note: string }> = {
  bezposrednia: {
    name: 'liryka bezpośrednia (wyznania)',
    who: 'ja',
    to: 'czytelnik',
    source: 'J. Słowacki, „Testament mój”',
    lines: ['[Żyłem] z wami, [cierpiałem] i [płakałem] z wami,', 'Nigdy [mi], kto szlachetny, nie był obojętny,'],
    note: 'Podmiot liryczny ujawnia się w 1. osobie – czasowniki i zaimki „ja”, „mi”, „mnie” mówią o jego przeżyciach wprost.',
  },
  zbiorowa: {
    name: 'liryka zbiorowa (podmiot „my”)',
    who: 'my',
    to: 'wspólnota, świat',
    source: 'M. Konopnicka, „Rota”',
    lines: ['Nie [rzucim] ziemi, skąd [nasz] ród,', 'Nie [damy] pogrześć mowy.'],
    note: 'Podmiot mówi w imieniu wspólnoty – tu narodu. 1. osoba liczby mnogiej nadaje tekstowi siłę zbiorowej przysięgi.',
  },
  inwokacyjna: {
    name: 'liryka zwrotu do adresata (apelu)',
    who: 'ja / my',
    to: 'ty – adresat wskazany wprost',
    source: 'J. Kochanowski, „Pieśń”',
    lines: ['Czego chcesz od nas, [Panie], za [Twe] hojne dary?', 'Czego za dobrodziejstwa, którym nie masz miary?'],
    note: 'Wiersz jest skierowany do kogoś – zdradza to wołacz („Panie”), zaimki 2. osoby i tryb rozkazujący.',
  },
  roli: {
    name: 'liryka roli (maski)',
    who: 'ktoś inny niż poeta – tu: drzewo',
    to: 'gość, wędrowiec',
    source: 'J. Kochanowski, „Na lipę”',
    lines: ['[Gościu], siądź pod [mym] liściem, a odpoczni sobie!', 'Nie dójdzie cię tu słońce, przyrzekam [ja] tobie,'],
    note: 'Poeta oddaje głos postaci wyraźnie od siebie różnej – lipa mówi o sobie „mym liściem”, „ja”. To kostium, maska.',
  },
  opisowa: {
    name: 'liryka pośrednia – opisowa',
    who: 'podmiot ukryty',
    to: 'brak wskazanego adresata',
    source: 'J. Tuwim, „Lokomotywa”',
    lines: ['[Stoi] na stacji lokomotywa,', 'Ciężka, ogromna i pot z niej [spływa]:'],
    note: 'Nikt nie mówi „ja” ani „ty”. Uczucia wyrażają się pośrednio – przez to, jak przedstawiony jest obraz (tu: potęga i zmęczenie maszyny).',
  },
};

function LyricScene({ params }: SceneProps) {
  const id = String(params.type ?? 'bezposrednia');
  const l = LYRIC[id];
  return (
    <div className="poem lyric">
      <AnimatePresence mode="wait">
        <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="poem-source">{l.source}</div>
          <div className="lyric-lines">
            {l.lines.map((line, i) => (
              <motion.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}>
                <Marked text={line} />
              </motion.p>
            ))}
          </div>
          <div className="speech-flow">
            <motion.span className="sf-node who" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3 }}>
              <small>mówi</small>
              {l.who}
            </motion.span>
            <motion.svg viewBox="0 0 80 20" className="sf-arrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              <motion.path d="M2,10 H70 M62,3 L72,10 L62,17" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 0.5 }} />
            </motion.svg>
            <motion.span className="sf-node to" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.75 }}>
              <small>do kogo</small>
              {l.to}
            </motion.span>
          </div>
          <p className="poem-info">
            <b>{l.name}.</b> {l.note}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ======================= Krok 3: mapa gatunków ======================= */

interface Genre {
  name: string;
  kind: Kind | 'synkretyczne';
  def: string;
  ex: string;
}

const GENRES: Record<string, Genre> = {
  oda: { name: 'oda', kind: 'liryka', def: 'Utwór podniosły, sławiący osobę, ideę lub wydarzenie. Styl wzniosły, liczne apostrofy.', ex: 'A. Mickiewicz, „Oda do młodości”' },
  hymn: { name: 'hymn', kind: 'liryka', def: 'Uroczysta pieśń pochwalna, pierwotnie na cześć bóstwa; dziś także hymny narodowe.', ex: 'J. Kochanowski, „Czego chcesz od nas, Panie…”' },
  tren: { name: 'tren', kind: 'liryka', def: 'Utwór żałobny opłakujący zmarłego: pochwała, lament, pocieszenie.', ex: 'J. Kochanowski, „Treny”' },
  sonet: { name: 'sonet', kind: 'liryka', def: '14 wersów (4 + 4 + 3 + 3), część opisowa i refleksyjna, często puenta.', ex: 'A. Mickiewicz, „Sonety krymskie”' },
  fraszka: { name: 'fraszka', kind: 'liryka', def: 'Krótki, często żartobliwy wiersz z puentą – o ludziach, obyczajach, życiu.', ex: 'J. Kochanowski, „Na lipę”, „Na zdrowie”' },
  piesn: { name: 'pieśń', kind: 'liryka', def: 'Utwór o budowie stroficznej, często z refrenem; pierwotnie śpiewany.', ex: 'J. Kochanowski, „Pieśni”' },
  epopeja: { name: 'epos / epopeja', kind: 'epika', def: 'Rozbudowany utwór wierszowany o losach bohatera na tle przełomowych wydarzeń zbiorowości. Inwokacja, porównania homeryckie.', ex: 'Homer, „Iliada”; A. Mickiewicz, „Pan Tadeusz”' },
  powiesc: { name: 'powieść', kind: 'epika', def: 'Rozbudowana fabuła wielowątkowa, wielu bohaterów, szerokie tło społeczne.', ex: 'B. Prus, „Lalka”' },
  nowela: { name: 'nowela', kind: 'epika', def: 'Krótki utwór prozatorski o zwartej, jednowątkowej akcji z wyraźnym punktem kulminacyjnym i często motywem-symbolem („sokołem”).', ex: 'H. Sienkiewicz, „Latarnik”' },
  opowiadanie: { name: 'opowiadanie', kind: 'epika', def: 'Krótka forma prozatorska o luźniejszej kompozycji niż nowela; dopuszcza dygresje i opisy.', ex: 'T. Borowski, opowiadania obozowe' },
  bajka: { name: 'bajka', kind: 'epika', def: 'Krótki utwór alegoryczny – zwierzęta uosabiają ludzkie cechy; kończy się morałem.', ex: 'I. Krasicki, „Bajki”' },
  przypowiesc: { name: 'przypowieść (parabola)', kind: 'epika', def: 'Opowieść, której zdarzenia mają drugie, uniwersalne znaczenie (moralne lub filozoficzne).', ex: 'przypowieść o synu marnotrawnym; A. Camus, „Dżuma”' },
  tragedia: { name: 'tragedia', kind: 'dramat', def: 'Konflikt racji równorzędnych, bohater skazany na klęskę; w antyku – zasada trzech jedności i chór.', ex: 'Sofokles, „Antygona”' },
  komedia: { name: 'komedia', kind: 'dramat', def: 'Ośmiesza ludzkie wady i obyczaje; komizm sytuacji, postaci i słowa; szczęśliwe zakończenie.', ex: 'A. Fredro, „Zemsta”' },
  dramatRom: { name: 'dramat romantyczny', kind: 'dramat', def: 'Łamie klasyczne reguły: mieszanie tragizmu i komizmu, fantastyka, luźna, fragmentaryczna budowa.', ex: 'A. Mickiewicz, „Dziady” cz. III' },
  dramatSym: { name: 'dramat symboliczny', kind: 'dramat', def: 'Realistyczne zdarzenia przenikają się z fantastyką; postacie i przedmioty mają znaczenie symboliczne.', ex: 'S. Wyspiański, „Wesele”' },
  ballada: { name: 'ballada', kind: 'synkretyczne', def: 'Łączy cechy trzech rodzajów: fabułę (epika), nastrój i rytm (liryka), dialog (dramat). Często ludowa fantastyka.', ex: 'A. Mickiewicz, „Romantyczność”, „Lilije”' },
  poematDyg: { name: 'poemat dygresyjny', kind: 'synkretyczne', def: 'Fabuła przeplatana swobodnymi dygresjami narratora-poety – o polityce, literaturze, sobie.', ex: 'J. Słowacki, „Beniowski”' },
  powiescPoet: { name: 'powieść poetycka', kind: 'synkretyczne', def: 'Wierszowana opowieść o tajemniczym bohaterze, nastrojowa, z kompozycją fragmentaryczną.', ex: 'A. Mickiewicz, „Konrad Wallenrod”' },
};

const ZONES: { kind: Genre['kind']; label: string; color: string }[] = [
  { kind: 'liryka', label: 'Liryka', color: KIND_COLORS.liryka },
  { kind: 'epika', label: 'Epika', color: KIND_COLORS.epika },
  { kind: 'dramat', label: 'Dramat', color: KIND_COLORS.dramat },
  { kind: 'synkretyczne', label: 'Gatunki synkretyczne (pograniczne)', color: '#22b07d' },
];

function GenreMapScene() {
  const [sel, setSel] = useState('tren');
  const g = GENRES[sel];
  const color = ZONES.find((z) => z.kind === g.kind)!.color;
  return (
    <div className="poem genres">
      <div className="genre-zones">
        {ZONES.map((z, zi) => (
          <motion.section
            key={z.kind}
            className={`genre-zone ${z.kind === 'synkretyczne' ? 'wide' : ''}`}
            style={{ '--kc': z.color } as React.CSSProperties}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: zi * 0.1 }}
          >
            <h4>{z.label}</h4>
            <div className="genre-chips">
              {Object.entries(GENRES)
                .filter(([, x]) => x.kind === z.kind)
                .map(([id, x]) => (
                  <motion.button type="button" key={id} className={`genre-chip ${id === sel ? 'on' : ''}`} onClick={() => setSel(id)} whileTap={{ scale: 0.94 }} layout>
                    {x.name}
                  </motion.button>
                ))}
            </div>
          </motion.section>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={sel} className="fig-card" style={{ '--fig': color } as React.CSSProperties} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <div className="fig-card-head">
            <span className="fig-chip">{g.kind}</span>
            <strong>{g.name}</strong>
          </div>
          <p>{g.def}</p>
          <p className="muted">Przykład: {g.ex}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ======================= Krok 4: narrator i mowa postaci ======================= */

const NARRATORS: Record<string, { name: string; text: string; note: string; pos: { x: number; y: number }; inside: boolean }> = {
  pierwszo: {
    name: 'narrator pierwszoosobowy',
    text: 'Wszedłem do klasy jako ostatni. Kartka leżała już na mojej ławce – czerwona dwója patrzyła na mnie jak wyrzut.',
    note: 'Narrator jest bohaterem (lub świadkiem) zdarzeń. Wie tylko to, co sam przeżył; relacja jest subiektywna.',
    pos: { x: 150, y: 112 },
    inside: true,
  },
  wszechwiedzacy: {
    name: 'narrator trzecioosobowy wszechwiedzący',
    text: 'Marek wszedł do klasy jako ostatni. Nie wiedział jeszcze, że nauczycielka przez godzinę wahała się nad jego oceną i że ta dwója zaważy na całym semestrze.',
    note: 'Narrator stoi poza światem przedstawionym, „nad” nim. Zna myśli wszystkich postaci, przeszłość i przyszłość. Typowy dla powieści realistycznej.',
    pos: { x: 160, y: 18 },
    inside: false,
  },
  personalny: {
    name: 'narrator trzecioosobowy personalny',
    text: 'Marek wszedł do klasy jako ostatni. Kartka leżała już na ławce. Dwója. Znowu. Co powie mama?',
    note: 'Opowiada w 3. osobie, ale „zza pleców” bohatera – widzi tylko to, co on, i przejmuje jego sposób myślenia. Granica między narratorem a postacią się zaciera.',
    pos: { x: 108, y: 92 },
    inside: false,
  },
};

const SPEECH: Record<string, { name: string; text: string; note: string }> = {
  niezalezna: { name: 'mowa niezależna', text: 'Marek westchnął: – Znowu dwója. Co powie mama?', note: 'Słowa postaci przytoczone dosłownie, po dwukropku i myślniku (albo w cudzysłowie).' },
  zalezna: { name: 'mowa zależna', text: 'Marek westchnął, że znowu dostał dwóję, i zastanawiał się, co powie mama.', note: 'Narrator relacjonuje słowa postaci własnymi słowami, w zdaniu podrzędnym („że…”), w 3. osobie.' },
  pozornie: { name: 'mowa pozornie zależna', text: 'Marek westchnął. Znowu dwója. Co powie mama?', note: 'Myśli postaci wplecione w narrację bez cudzysłowu i bez „że” – brzmią jak jej własny głos. Ulubiony zabieg prozy XX wieku.' },
};

function NarratorScene({ params }: SceneProps) {
  const nid = String(params.narrator ?? 'pierwszo');
  const sid = String(params.speech ?? 'niezalezna');
  const n = NARRATORS[nid];
  const sp = SPEECH[sid];
  return (
    <div className="poem narrator">
      <svg className="tree-svg narr-svg" viewBox="0 0 320 150">
        <rect x="40" y="56" width="240" height="86" rx="14" fill="#3d8bff" opacity="0.1" />
        <rect x="40" y="56" width="240" height="86" rx="14" fill="none" stroke="#3d8bff" strokeWidth="1.5" strokeDasharray="5 5" />
        <text x="52" y="134" fontSize="11" fill="currentColor" opacity="0.6">
          świat przedstawiony
        </text>
        {/* bohater */}
        <g>
          <circle cx="200" cy="88" r="9" fill="#e0913a" />
          <rect x="190" y="99" width="20" height="26" rx="8" fill="#e0913a" />
          <text x="200" y="76" fontSize="11" textAnchor="middle" fill="currentColor">
            bohater
          </text>
        </g>
        {/* narrator */}
        <motion.g initial={false} animate={{ x: n.pos.x, y: n.pos.y }} transition={{ type: 'spring', stiffness: 160, damping: 18 }}>
          <circle cx="0" cy="0" r="12" fill="#a855f7" />
          <text x="0" y="4" fontSize="12" textAnchor="middle" fill="#fff" fontWeight="700">
            N
          </text>
        </motion.g>
        {nid === 'wszechwiedzacy' && (
          <motion.path d="M160,30 L60,120 M160,30 L260,120" stroke="#a855f7" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 4" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />
        )}
        {nid === 'personalny' && <motion.path d="M120,92 L190,92" stroke="#a855f7" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="3 4" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />}
      </svg>
      <AnimatePresence mode="wait">
        <motion.blockquote key={nid} className="narr-text" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <small>{n.name}</small>
          {n.text}
        </motion.blockquote>
      </AnimatePresence>
      <p className="poem-info">{n.note}</p>
      <AnimatePresence mode="wait">
        <motion.blockquote key={sid} className="narr-text speech-v" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <small>{sp.name}</small>
          {sp.text}
          <span className="muted">{sp.note}</span>
        </motion.blockquote>
      </AnimatePresence>
    </div>
  );
}

/* ======================= Krok 5: kompozycja fabuły ======================= */

const PLOT_STAGES = ['ekspozycja', 'zawiązanie akcji', 'perypetie (rozwój akcji)', 'punkt kulminacyjny', 'rozwiązanie akcji'];
const PLOT: Record<string, { name: string; events: string[] }> = {
  antygona: {
    name: 'Sofokles, „Antygona”',
    events: [
      'Po bratobójczej walce Eteoklesa i Polinejkesa Kreon zakazuje pochować Polinejkesa. Antygona zdradza Ismenie, że złamie zakaz.',
      'Antygona grzebie brata – prawo boskie stawia wyżej niż rozkaz władcy. Konflikt racji zostaje zawiązany.',
      'Strażnik chwyta Antygonę, Kreon skazuje ją na śmierć. Hajmon bezskutecznie broni narzeczonej, a chór waha się między racjami.',
      'Tejrezjasz przepowiada Kreonowi nieszczęście. Władca ugina się i biegnie uwolnić Antygonę – za późno.',
      'Antygona odbiera sobie życie, Hajmon i Eurydyka także. Kreon zostaje sam, złamany – spełnia się tragiczny los.',
    ],
  },
  latarnik: {
    name: 'H. Sienkiewicz, „Latarnik”',
    events: [
      'Latarnia w Aspinwall potrzebuje nowego latarnika. Zgłasza się stary polski tułacz, Skawiński.',
      'Skawiński dostaje posadę – po latach wędrówki wreszcie znajduje spokojną przystań.',
      'Mijają spokojne dni. Pewnego dnia latarnik dostaje paczkę z książkami – wśród nich „Pana Tadeusza”.',
      'Zaczytany w polskiej poezji, zapomina o świecie i nie zapala latarni – statek omal się nie rozbija.',
      'Skawiński traci posadę i rusza w dalszą tułaczkę – z „Panem Tadeuszem” na piersi.',
    ],
  },
};

function PlotScene({ params }: SceneProps) {
  const pid = String(params.work ?? 'antygona');
  const stage = Math.round(Number(params.stage ?? 1)) - 1;
  const p = PLOT[pid];
  // punkty „piramidy Freytaga”
  const pts = [
    { x: 30, y: 150 },
    { x: 110, y: 130 },
    { x: 220, y: 80 },
    { x: 320, y: 26 },
    { x: 440, y: 140 },
  ];
  const d = `M10,150 L${pts.map((q) => `${q.x},${q.y}`).join(' L')} L490,150`;
  return (
    <div className="poem plot">
      <div className="poem-source">{p.name}</div>
      <svg className="tree-svg" viewBox="0 0 500 190">
        <motion.path d={d} fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="3" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
        {pts.map((q, i) => (
          <g key={i}>
            <motion.circle cx={q.x} cy={q.y} r={i === stage ? 11 : 6} fill={i <= stage ? 'var(--accent)' : 'currentColor'} opacity={i <= stage ? 1 : 0.3} animate={{ r: i === stage ? 11 : 6 }} />
            <text x={q.x} y={i === 3 ? q.y - 16 : q.y + 28} fontSize="11.5" textAnchor="middle" fill="currentColor" fontWeight={i === stage ? 700 : 400} opacity={i === stage ? 1 : 0.65}>
              {PLOT_STAGES[i].split(' (')[0]}
            </text>
          </g>
        ))}
      </svg>
      <AnimatePresence mode="wait">
        <motion.div key={`${pid}-${stage}`} className="plot-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
          <b>
            {stage + 1}. {PLOT_STAGES[stage]}
          </b>
          <p>{p.events[stage]}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export const genres: Topic = {
  id: 'rodzaje-i-gatunki',
  title: 'Rodzaje i gatunki literackie',
  subject: 'polski',
  summary: 'Liryka, epika i dramat na przykładach, odmiany liryki, mapa gatunków, typy narratora i kompozycja fabuły na „piramidzie”.',
  accent: '#ea580c',
  glyph: '❦',
  steps: [
    {
      title: 'Liryka, epika, dramat',
      kind: 'page',
      scene: KindsScene,
      controls: [
        {
          type: 'select',
          key: 'kind',
          label: 'Rodzaj',
          default: 'liryka',
          options: [
            { value: 'liryka', label: 'Liryka' },
            { value: 'epika', label: 'Epika' },
            { value: 'dramat', label: 'Dramat' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Każdy utwór literacki należy do jednego z trzech <strong>rodzajów</strong>. Najprościej rozpoznać je po tym,{' '}
            <strong>kto mówi</strong>.
          </p>
          <p>
            W <strong>liryce</strong> – podmiot liryczny, który wyraża uczucia. W <strong>epice</strong> – narrator, który
            opowiada historię. W <strong>dramacie</strong> nie ma pośrednika: postacie mówią same, a autor odzywa się tylko w{' '}
            <strong>didaskaliach</strong>.
          </p>
          <p>Uwaga: rodzaj to nie to samo co forma. „Pan Tadeusz” jest pisany wierszem, a należy do epiki.</p>
        </>
      ),
    },
    {
      title: 'Odmiany liryki',
      kind: 'page',
      scene: LyricScene,
      controls: [
        {
          type: 'select',
          key: 'type',
          label: 'Odmiana',
          default: 'bezposrednia',
          options: Object.entries(LYRIC).map(([value, l]) => ({ value, label: l.name.replace('liryka ', '') })),
        },
      ],
      body: (
        <>
          <p>
            Liryka dzieli się według tego, <strong>jak ujawnia się podmiot</strong> i do kogo mówi. Wyróżnione słowa to
            sygnały: formy 1. osoby, zaimki, wołacze.
          </p>
          <p>
            <strong>Bezpośrednia</strong> – „ja” mówi o sobie. <strong>Zbiorowa</strong> – „my”.{' '}
            <strong>Zwrotu do adresata</strong> – wołacz i „ty”. <strong>Roli</strong> – mówi ktoś inny (maska).{' '}
            <strong>Pośrednia</strong> (opisowa, sytuacyjna) – podmiot się ukrywa.
          </p>
          <p>W maturalnej analizie zawsze określ podmiot liryczny i adresata – to punkt wyjścia interpretacji.</p>
        </>
      ),
    },
    {
      title: 'Mapa gatunków',
      kind: 'page',
      scene: GenreMapScene,
      body: (
        <>
          <p>
            <strong>Gatunek</strong> to węższa odmiana rodzaju o charakterystycznych cechach. Kliknij gatunek, aby zobaczyć
            definicję i przykład.
          </p>
          <p>
            Niektóre gatunki leżą na pograniczu – to <strong>gatunki synkretyczne</strong>. Ballada łączy fabułę, nastrój
            i dialog, dlatego romantycy uczynili ją swoim manifestem.
          </p>
          <p>Gatunki zmieniają się w czasie: każda epoka ma swoje ulubione (sprawdź karty w temacie „Epoki literackie”).</p>
        </>
      ),
    },
    {
      title: 'Narrator i mowa postaci',
      kind: 'page',
      scene: NarratorScene,
      controls: [
        {
          type: 'select',
          key: 'narrator',
          label: 'Narrator',
          default: 'pierwszo',
          options: [
            { value: 'pierwszo', label: 'pierwszoosobowy' },
            { value: 'wszechwiedzacy', label: 'wszechwiedzący' },
            { value: 'personalny', label: 'personalny' },
          ],
        },
        {
          type: 'select',
          key: 'speech',
          label: 'Mowa postaci',
          default: 'niezalezna',
          options: Object.entries(SPEECH).map(([value, s]) => ({ value, label: s.name })),
        },
      ],
      body: (
        <>
          <p>
            Ta sama scena opowiedziana na trzy sposoby. Na schemacie fioletowy punkt <strong>N</strong> to narrator – zobacz,
            gdzie stoi względem świata przedstawionego.
          </p>
          <p>
            Narrator decyduje też, jak przytoczyć słowa postaci: dosłownie (<strong>mowa niezależna</strong>), we własnej
            relacji (<strong>zależna</strong>) albo wplatając myśli bohatera w narrację (<strong>pozornie zależna</strong>).
          </p>
          <p>Narratora nie utożsamiamy z autorem – nawet jeśli mówi „ja”.</p>
        </>
      ),
    },
    {
      title: 'Kompozycja fabuły',
      kind: 'page',
      scene: PlotScene,
      controls: [
        {
          type: 'select',
          key: 'work',
          label: 'Utwór',
          default: 'antygona',
          options: [
            { value: 'antygona', label: '„Antygona”' },
            { value: 'latarnik', label: '„Latarnik”' },
          ],
        },
        { type: 'slider', key: 'stage', label: 'Etap akcji', min: 1, max: 5, step: 1, default: 1 },
      ],
      body: (
        <>
          <p>
            Klasyczna fabuła ma pięć etapów – tzw. <strong>piramidę Freytaga</strong>. Przesuwaj suwak i śledź, jak rośnie, a
            potem opada napięcie.
          </p>
          <p>
            <strong>Ekspozycja</strong> przedstawia bohaterów i sytuację, <strong>zawiązanie akcji</strong> uruchamia
            konflikt, <strong>perypetie</strong> go komplikują, <strong>punkt kulminacyjny</strong> to szczyt napięcia, a{' '}
            <strong>rozwiązanie</strong> zamyka historię.
          </p>
          <p>W tragedii antycznej rozwiązaniem jest katastrofa – a widz przeżywa oczyszczenie (katharsis).</p>
        </>
      ),
    },
  ],
};
