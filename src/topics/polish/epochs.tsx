import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';
import { useNarrow } from '../../lib/useNarrow';

interface Epoch {
  id: string;
  name: string;
  short: string;
  /** Ramy czasowe w Europie */
  eu: [number, number];
  /** Ramy czasowe w Polsce (jeśli dotyczy) */
  pl?: [number, number];
  color: string;
  idea: string;
  /** Położenie na „wahadle idei”: −1 rozum/ład … +1 uczucie/niepokój */
  swing: number;
  swingLabel: string;
  keywords: string[];
  traits: string[];
  authors: string[];
  works: string[];
  /** Gatunki charakterystyczne dla epoki. */
  genres: string[];
}

const EPOCHS: Epoch[] = [
  {
    id: 'antyk', name: 'Starożytność', short: 'Antyk', eu: [-800, 476], color: '#c2a878',
    idea: 'Człowiek wobec losu i bogów; harmonia, umiar, piękno.', swing: -0.8, swingLabel: 'ład, harmonia',
    keywords: ['mimesis', 'katharsis', 'fatum', 'tragizm'],
    traits: ['mitologia jako źródło motywów', 'narodziny gatunków: epos, tragedia, liryka', 'filozofia: Platon, Arystoteles, stoicy'],
    authors: ['Homer', 'Sofokles', 'Horacy', 'Wergiliusz'],
    works: ['„Iliada”, „Odyseja”', '„Antygona”, „Król Edyp”', 'Biblia'],
    genres: ['epos', 'tragedia', 'oda', 'hymn', 'elegia', 'bajka (Ezop)'],
  },
  {
    id: 'sredniowiecze', name: 'Średniowiecze', short: 'Średniow.', eu: [476, 1450], pl: [966, 1500], color: '#9b8ec4',
    idea: 'Teocentryzm – Bóg w centrum świata; życie doczesne jako przygotowanie do wieczności.', swing: 0.5, swingLabel: 'duchowość, asceza',
    keywords: ['teocentryzm', 'uniwersalizm', 'asceza', 'danse macabre'],
    traits: ['uniwersalizm (łacina, Kościół)', 'parenetyka – wzorce osobowe: rycerz, święty, władca', 'motyw tańca śmierci'],
    authors: ['Dante Alighieri', 'Gall Anonim', 'Wincenty Kadłubek'],
    works: ['„Bogurodzica”', '„Lament świętokrzyski”', '„Pieśń o Rolandzie”', '„Boska komedia”'],
    genres: ['hagiografia', 'kronika', 'pieśń religijna', 'lament', 'moralitet', 'pieśń o czynach (chanson de geste)'],
  },
  {
    id: 'renesans', name: 'Renesans', short: 'Renesans', eu: [1400, 1600], pl: [1500, 1620], color: '#3fb27f',
    idea: 'Antropocentryzm – człowiek i jego doczesność w centrum zainteresowania.', swing: -0.8, swingLabel: 'harmonia, człowiek',
    keywords: ['humanizm', 'antropocentryzm', 'horacjanizm', 'reformacja'],
    traits: ['powrót do antyku', 'rozwój literatury w językach narodowych', 'złoty wiek kultury polskiej'],
    authors: ['Jan Kochanowski', 'Mikołaj Rej', 'Andrzej Frycz Modrzewski', 'William Szekspir'],
    works: ['„Treny”', '„Odprawa posłów greckich”', 'fraszki i pieśni', '„Romeo i Julia”'],
    genres: ['fraszka', 'pieśń', 'tren', 'sonet', 'traktat', 'tragedia'],
  },
  {
    id: 'barok', name: 'Barok', short: 'Barok', eu: [1600, 1750], pl: [1620, 1764], color: '#d07a35',
    idea: 'Świat pełen sprzeczności; marność i przemijanie (vanitas).', swing: 0.8, swingLabel: 'niepokój, kontrasty',
    keywords: ['vanitas', 'konceptyzm', 'sarmatyzm', 'marinizm'],
    traits: ['paradoks, antyteza, kontrast', 'niepokój metafizyczny', 'kultura sarmacka'],
    authors: ['Mikołaj Sęp Szarzyński', 'Jan Andrzej Morsztyn', 'Jan Chryzostom Pasek'],
    works: ['sonety Sępa Szarzyńskiego', '„Pamiętniki” Paska', '„Do trupa” Morsztyna'],
    genres: ['sonet', 'madrygał', 'epigramat', 'pamiętnik', 'epos rycerski'],
  },
  {
    id: 'oswiecenie', name: 'Oświecenie', short: 'Oświecenie', eu: [1700, 1800], pl: [1764, 1822], color: '#3d8bff',
    idea: 'Rozum i nauka naprawią świat; literatura ma uczyć i bawić.', swing: -1, swingLabel: 'rozum',
    keywords: ['racjonalizm', 'klasycyzm', 'sentymentalizm', 'deizm'],
    traits: ['empiryzm, encyklopedyzm', 'dydaktyzm: satyra, bajka', 'reformy państwa (Konstytucja 3 maja)'],
    authors: ['Ignacy Krasicki', 'Julian Ursyn Niemcewicz', 'Wolter'],
    works: ['„Bajki” i „Satyry” Krasickiego', '„Powrót posła”', '„Kandyd”'],
    genres: ['bajka', 'satyra', 'poemat heroikomiczny', 'komedia polityczna', 'powieść'],
  },
  {
    id: 'romantyzm', name: 'Romantyzm', short: 'Romantyzm', eu: [1795, 1850], pl: [1822, 1863], color: '#8b5cf6',
    idea: 'Uczucie i wiara ponad rozumem; jednostka wybitna, walka o wolność.', swing: 1, swingLabel: 'uczucie, wiara',
    keywords: ['irracjonalizm', 'mesjanizm', 'prometeizm', 'wallenrodyzm'],
    traits: ['„Czucie i wiara silniej mówi do mnie”', 'bohater romantyczny – samotny buntownik', 'ludowość i fantastyka'],
    authors: ['Adam Mickiewicz', 'Juliusz Słowacki', 'Zygmunt Krasiński', 'Cyprian Norwid'],
    works: ['„Ballady i romanse”', '„Dziady”', '„Kordian”', '„Pan Tadeusz”'],
    genres: ['ballada', 'dramat romantyczny', 'powieść poetycka', 'poemat dygresyjny', 'epopeja'],
  },
  {
    id: 'pozytywizm', name: 'Pozytywizm', short: 'Pozytywizm', eu: [1850, 1890], pl: [1864, 1890], color: '#14b8a6',
    idea: 'Praca organiczna i praca u podstaw zamiast walki zbrojnej.', swing: -0.9, swingLabel: 'nauka, praca',
    keywords: ['praca organiczna', 'praca u podstaw', 'scjentyzm', 'utylitaryzm'],
    traits: ['powieść realistyczna', 'emancypacja kobiet', 'asymilacja Żydów'],
    authors: ['Bolesław Prus', 'Eliza Orzeszkowa', 'Henryk Sienkiewicz', 'Maria Konopnicka'],
    works: ['„Lalka”', '„Nad Niemnem”', 'Trylogia', '„Mendel Gdański”'],
    genres: ['powieść realistyczna', 'nowela', 'powieść historyczna', 'obrazek', 'publicystyka'],
  },
  {
    id: 'mloda-polska', name: 'Młoda Polska', short: 'Młoda Pol.', eu: [1890, 1918], pl: [1890, 1918], color: '#ec4899',
    idea: 'Kryzys wartości, dekadentyzm; sztuka dla sztuki.', swing: 0.9, swingLabel: 'dekadentyzm',
    keywords: ['dekadentyzm', 'symbolizm', 'impresjonizm', 'chłopomania'],
    traits: ['fin de siècle – poczucie schyłku', 'filozofia Schopenhauera i Nietzschego', 'kult artysty'],
    authors: ['Stanisław Wyspiański', 'Stefan Żeromski', 'Władysław Reymont', 'Kazimierz Przerwa-Tetmajer'],
    works: ['„Wesele”', '„Ludzie bezdomni”', '„Chłopi”', '„Moralność pani Dulskiej”'],
    genres: ['dramat symboliczny', 'liryka nastrojowa', 'powieść', 'sonet', 'poemat prozą'],
  },
  {
    id: 'dwudziestolecie', name: 'Dwudziestolecie międzywojenne', short: '20-lecie', eu: [1918, 1939], pl: [1918, 1939], color: '#f97316',
    idea: 'Radość z niepodległości i niepokój przed katastrofą; eksperyment artystyczny.', swing: -0.1, swingLabel: 'eksperyment',
    keywords: ['awangarda', 'Skamander', 'katastrofizm', 'groteska'],
    traits: ['nowe kierunki: futuryzm, ekspresjonizm', 'powieść psychologiczna i groteskowa', 'przeczucie wojny'],
    authors: ['Julian Tuwim', 'Bruno Schulz', 'Witold Gombrowicz', 'Bolesław Leśmian'],
    works: ['„Ferdydurke”', '„Sklepy cynamonowe”', '„Przedwiośnie”'],
    genres: ['powieść psychologiczna', 'powieść groteskowa', 'wiersz awangardowy', 'dramat (Witkacy – Czysta Forma)', 'reportaż'],
  },
  {
    id: 'wojna', name: 'Wojna i okupacja', short: 'Wojna', eu: [1939, 1945], pl: [1939, 1945], color: '#94a3b8',
    idea: 'Literatura wobec totalitaryzmu i Zagłady; świadectwo.', swing: 0.6, swingLabel: 'katastrofa',
    keywords: ['pokolenie Kolumbów', 'apokalipsa spełniona', 'literatura faktu'],
    traits: ['poezja pokolenia wojennego', 'etyka w czasie wojny', 'literatura obozowa (często pisana po 1945)'],
    authors: ['Krzysztof Kamil Baczyński', 'Tadeusz Borowski', 'Gustaw Herling-Grudziński', 'Hanna Krall'],
    works: ['wiersze Baczyńskiego', 'opowiadania Borowskiego', '„Inny świat”', '„Zdążyć przed Panem Bogiem”'],
    genres: ['liryka', 'opowiadanie', 'wspomnienia', 'reportaż', 'literatura faktu'],
  },
  {
    id: 'wspolczesnosc', name: 'Współczesność', short: 'Współcz.', eu: [1945, 2025], pl: [1945, 2025], color: '#22c55e',
    idea: 'Pluralizm postaw: rozrachunki z historią, egzystencjalizm, postmodernizm.', swing: 0, swingLabel: 'pluralizm',
    keywords: ['socrealizm', 'egzystencjalizm', 'Nowa Fala', 'postmodernizm'],
    traits: ['socrealizm i odwilż 1956', 'emigracja (paryska „Kultura”)', 'literatura po 1989 roku'],
    authors: ['Czesław Miłosz', 'Wisława Szymborska', 'Zbigniew Herbert', 'Olga Tokarczuk'],
    works: ['„Zniewolony umysł”', '„Pan Cogito”', '„Prowadź swój pług przez kości umarłych”'],
    genres: ['reportaż', 'esej', 'powieść', 'wiersz wolny', 'dramat absurdu'],
  },
];

/* Skala „rozciągnięta”: dawne wieki ściśnięte, nowsze szersze. 0..1 */
const NOW = 2035;
const MIN = -800;
const pos = (year: number) => 1 - Math.pow((NOW - year) / (NOW - MIN), 0.38);
const pct = (year: number) => `${(pos(year) * 100).toFixed(3)}%`;
const TICKS = [-800, 0, 1000, 1500, 1700, 1800, 1900, 2000];
const yearLabel = (y: number) => (y < 0 ? `${-y} p.n.e.` : String(y));

/* ---------- Karta epoki ---------- */
function EpochCard({ e, onPrev, onNext }: { e: Epoch; onPrev: () => void; onNext: () => void }) {
  return (
    <AnimatePresence mode="wait">
      <motion.article
        key={e.id}
        className="epoch-card"
        style={{ '--ep': e.color } as React.CSSProperties}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25 }}
      >
        <header>
          <button type="button" className="epoch-nav" onClick={onPrev} aria-label="Poprzednia epoka">
            ‹
          </button>
          <div className="epoch-title">
            <h3>{e.name}</h3>
            <span className="epoch-dates">
              Europa: {yearLabel(e.eu[0])} – {e.eu[1] >= 2025 ? 'dziś' : e.eu[1]}
              {e.pl ? ` · Polska: ${e.pl[0]} – ${e.pl[1] >= 2025 ? 'dziś' : e.pl[1]}` : ''}
            </span>
          </div>
          <button type="button" className="epoch-nav" onClick={onNext} aria-label="Następna epoka">
            ›
          </button>
        </header>
        <p className="epoch-idea">{e.idea}</p>
        <div className="epoch-keys">
          {e.keywords.map((k, i) => (
            <motion.span key={k} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.05 }}>
              {k}
            </motion.span>
          ))}
        </div>
        <div className="epoch-cols">
          {(
            [
              ['Cechy', e.traits],
              ['Twórcy', e.authors],
              ['Utwory', e.works],
              ['Gatunki', e.genres],
            ] as const
          ).map(([title, items], ci) => (
            <div key={title}>
              <h4>{title}</h4>
              <ul>
                {items.map((it, i) => (
                  <motion.li key={it} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + ci * 0.08 + i * 0.04 }}>
                    {it}
                  </motion.li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </motion.article>
    </AnimatePresence>
  );
}

function useSelection(initial: string) {
  const [sel, setSel] = useState(initial);
  useEffect(() => setSel(initial), [initial]);
  const idx = EPOCHS.findIndex((e) => e.id === sel);
  const go = (d: number) => setSel(EPOCHS[(idx + d + EPOCHS.length) % EPOCHS.length].id);
  return { epoch: EPOCHS[Math.max(0, idx)], setSel, go };
}

/* ---------- Wykres: wiersz na każdą epokę ---------- */
function TimelineScene({ params }: SceneProps) {
  const mode = String(params.mode ?? 'eu');
  const { epoch, setSel, go } = useSelection(String(params.start ?? 'renesans'));
  const both = mode === 'compare';

  return (
    <div className="timeline">
      <div className="gantt">
        <div className="gantt-axis">
          <span className="gantt-label" />
          <div className="gantt-track">
            {TICKS.map((y) => (
              <span key={y} className="gantt-tick" style={{ left: pct(y) }}>
                {yearLabel(y)}
              </span>
            ))}
          </div>
        </div>
        {EPOCHS.map((e, i) => {
          const on = e.id === epoch.id;
          return (
            <button
              type="button"
              key={e.id}
              className={`gantt-row ${on ? 'on' : ''}`}
              style={{ '--ep': e.color } as React.CSSProperties}
              onClick={() => setSel(e.id)}
            >
              <span className="gantt-label">
                <span className="lbl-full">{e.name}</span>
                <span className="lbl-short">{e.short}</span>
              </span>
              <span className="gantt-track">
                {TICKS.map((y) => (
                  <i key={y} className="gantt-grid" style={{ left: pct(y) }} />
                ))}
                <motion.span
                  className={`gantt-bar ${both ? 'half' : ''}`}
                  style={{ left: pct(e.eu[0]), width: `max(6px, ${((pos(e.eu[1]) - pos(e.eu[0])) * 100).toFixed(3)}%)` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: i * 0.05, duration: 0.5, ease: 'easeOut' }}
                />
                {both && e.pl && (
                  <motion.span
                    className="gantt-bar pl"
                    style={{ left: pct(e.pl[0]), width: `max(6px, ${((pos(e.pl[1]) - pos(e.pl[0])) * 100).toFixed(3)}%)` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.4 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
                  />
                )}
              </span>
            </button>
          );
        })}
        {both && (
          <div className="gantt-legend">
            <span className="lg-eu">Europa</span>
            <span className="lg-pl">Polska</span>
          </div>
        )}
      </div>
      <EpochCard e={epoch} onPrev={() => go(-1)} onNext={() => go(1)} />
    </div>
  );
}

/* ---------- Wahadło idei ---------- */
function SwingScene({ params }: SceneProps) {
  const narrow = useNarrow();
  const { epoch, setSel, go } = useSelection(String(params.start ?? 'romantyzm'));
  const n = EPOCHS.length;

  // Na komputerze: oś pozioma = czas (kolejne epoki), pionowa = idea. Na telefonie odwrotnie.
  const W = narrow ? 360 : 1000;
  const H = narrow ? n * 46 + 40 : 360;
  const pad = narrow ? { l: 112, r: 24, t: 28, b: 12 } : { l: 50, r: 50, t: 74, b: 70 };
  const pt = (i: number, v: number) =>
    narrow
      ? { x: pad.l + ((v + 1) / 2) * (W - pad.l - pad.r), y: pad.t + i * 46 + 10 }
      : { x: pad.l + (i / (n - 1)) * (W - pad.l - pad.r), y: pad.t + ((1 - v) / 2) * (H - pad.t - pad.b) };
  const pts = EPOCHS.map((e, i) => pt(i, e.swing));
  // gładka krzywa (Catmull-Rom → Bezier)
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  const mid = pt(0, 0);
  const lo = pt(n - 1, -1);
  const hi = pt(n - 1, 1);

  return (
    <div className="timeline">
      <svg className="swing-svg" viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id="swingBg" x1={narrow ? '0' : '0'} y1={narrow ? '0' : '1'} x2={narrow ? '1' : '0'} y2={narrow ? '0' : '0'}>
            <stop offset="0%" stopColor="#3d8bff" stopOpacity="0.16" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0.16" />
          </linearGradient>
        </defs>
        <rect x={narrow ? pad.l : pad.l - 20} y={narrow ? 0 : pad.t - 34} width={narrow ? W - pad.l - pad.r : W - pad.l - pad.r + 40} height={narrow ? H : H - pad.t - pad.b + 60} rx="14" fill="url(#swingBg)" />
        {narrow ? (
          <>
            <line x1={mid.x} x2={mid.x} y1={8} y2={H - 4} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="4 6" />
            <text x={lo.x} y={16} fontSize="12" fill="#3d8bff" fontWeight="700">rozum, ład</text>
            <text x={hi.x} y={16} fontSize="12" fill="#ec4899" fontWeight="700" textAnchor="end">uczucie, niepokój</text>
          </>
        ) : (
          <>
            <line x1={pad.l - 20} x2={W - pad.r + 20} y1={mid.y} y2={mid.y} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="4 6" />
            <text x={pad.l - 20} y={18} fontSize="14" fill="#ec4899" fontWeight="700">↑ góra: uczucie, duchowość, niepokój</text>
            <text x={W - pad.r + 20} y={18} fontSize="14" fill="#3d8bff" fontWeight="700" textAnchor="end">↓ dół: rozum, ład, harmonia</text>
          </>
        )}
        <motion.path d={d} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
        {EPOCHS.map((e, i) => {
          const p = pts[i];
          const on = e.id === epoch.id;
          return (
            <motion.g
              key={e.id}
              onClick={() => setSel(e.id)}
              style={{ cursor: 'pointer' }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 300, damping: 18 }}
            >
              <circle cx={p.x} cy={p.y} r={on ? 15 : 10} fill={e.color} opacity={on ? 1 : 0.85} stroke={on ? 'currentColor' : 'none'} strokeWidth="3" />
              {narrow ? (
                <text x={8} y={p.y + 4} fontSize="13" fill="currentColor" fontWeight={on ? 700 : 500}>
                  {e.short}
                </text>
              ) : (
                <>
                  <text x={p.x} y={H - pad.b + 40} fontSize="13" fill="currentColor" textAnchor="middle" fontWeight={on ? 700 : 500}>
                    {e.short}
                  </text>
                  <text x={p.x} y={p.y + (e.swing >= 0 ? -22 : 30)} fontSize="12" fill="currentColor" opacity="0.7" textAnchor="middle">
                    {e.swingLabel}
                  </text>
                </>
              )}
            </motion.g>
          );
        })}
      </svg>
      <EpochCard e={epoch} onPrev={() => go(-1)} onNext={() => go(1)} />
    </div>
  );
}

export const epochs: Topic = {
  id: 'epoki-literackie',
  title: 'Epoki literackie',
  subject: 'polski',
  summary: 'Wszystkie epoki od antyku do dziś: wykres czasu, gatunki, różnice między Europą a Polską, „wahadło” idei.',
  accent: '#b45309',
  glyph: '⏳',
  steps: [
    {
      title: 'Panorama epok',
      kind: 'page',
      scene: TimelineScene,
      preset: { mode: 'eu', start: 'antyk' },
      body: (
        <>
          <p>
            Epoki literackie to umowne okresy, w których sztukę łączą wspólne idee i sposób patrzenia na świat. Na wykresie
            każda epoka ma własny wiersz – <strong>kliknij</strong> wybraną, by zobaczyć jej kartę, albo przechodź
            strzałkami ‹ ›.
          </p>
          <p>
            Oś czasu jest <strong>rozciągnięta</strong>: starożytność trwała ponad tysiąc lat, a dwudziestolecie
            międzywojenne tylko dwadzieścia – przy zwykłej skali nowsze epoki byłyby niewidoczne.
          </p>
          <p>Zwróć uwagę, że granice się zazębiają: nowa epoka rodzi się, zanim stara zniknie.</p>
        </>
      ),
    },
    {
      title: 'Europa a Polska',
      kind: 'page',
      scene: TimelineScene,
      preset: { mode: 'compare', start: 'oswiecenie' },
      body: (
        <>
          <p>
            Górny pasek to ramy epoki w Europie, dolny – w Polsce. Polskie daty są często <strong>przesunięte</strong>:
            nowe prądy docierały z opóźnieniem, a granice wyznaczały wydarzenia z historii kraju.
          </p>
          <p>
            Przykłady: oświecenie zaczyna się u nas wraz z panowaniem Stanisława Augusta (1764), romantyzm – od
            „Ballad i romansów” (1822), a pozytywizm – po upadku powstania styczniowego (1864).
          </p>
          <p>Od Młodej Polski daty w Polsce i w Europie praktycznie się pokrywają.</p>
        </>
      ),
    },
    {
      title: 'Wahadło idei',
      kind: 'page',
      scene: SwingScene,
      preset: { start: 'romantyzm' },
      body: (
        <>
          <p>
            Historia literatury przypomina <strong>wahadło</strong>: epoki ceniące rozum, ład i harmonię przeplatają się z
            epokami uczucia, duchowości i niepokoju.
          </p>
          <p>
            Renesans → barok, oświecenie → romantyzm, pozytywizm → Młoda Polska: każda epoka jest w dużej mierze{' '}
            <strong>reakcją</strong> na poprzednią. Kliknij punkt, by porównać idee.
          </p>
          <p>To uproszczenie – w każdej epoce współistnieją różne nurty – ale świetnie pomaga zapamiętać kolejność.</p>
        </>
      ),
    },
  ],
};
