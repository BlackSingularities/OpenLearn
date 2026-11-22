import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { catalog, categoryLabels, categoryOrder, type CatalogModel, type Category } from '../lib/catalog';
import { BrandMark } from './Cover';
import { Icon, ThemeToggle } from './ui';

/** Kolor akcentu każdej dziedziny. */
const CAT_COLOR: Record<Category, string> = {
  lotnictwo: '#0ea5e9',
  transport: '#f0535b',
  energia: '#e3a21f',
  budynki: '#8a6cf0',
  urzadzenia: '#2b8cf0',
  czlowiek: '#e0567f',
  przyroda: '#1fa36a',
};

/** Ikony dziedzin – rysunek liniowy w polu 24 × 24. */
const CAT_ICON: Record<Category, ReactNode> = {
  lotnictwo: <path d="M2.5 14.5 L21 8.5 A1.6 1.6 0 0 0 20 5.6 L14.5 7.4 L8 3 L6 3.8 L10.5 8.6 L5.5 10.2 L3.4 8.6 L2 9.1 L3.6 12.4 Z" />,
  transport: (
    <>
      <path d="M3 15 V11 L6 6 H16 L20 11 V15 Z" />
      <circle cx="7.5" cy="16.5" r="2" />
      <circle cx="16.5" cy="16.5" r="2" />
      <path d="M3 11 H20" />
    </>
  ),
  energia: <path d="M13 2 L5 13.5 H11 L10 22 L19 10 H13 Z" />,
  budynki: (
    <>
      <path d="M4 21 V9 L10 5 V21 M10 21 V3 H19 V21 M2 21 H22" />
      <path d="M13 7 H16 M13 11 H16 M13 15 H16" />
    </>
  ),
  urzadzenia: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5 H13" />
    </>
  ),
  czlowiek: <path d="M12 20.5 C 6 16, 3 13, 3 8.8 A4.6 4.6 0 0 1 12 6.6 A4.6 4.6 0 0 1 21 8.8 C 21 13, 18 16, 12 20.5 Z" />,
  przyroda: (
    <>
      <path d="M12 21 V12" />
      <path d="M12 12 C 6 12, 4 8, 5 3 C 10 3, 13 6, 12 12 Z" />
      <path d="M12 15 C 16 15, 19 12, 19 8 C 15 8, 12 10, 12 15 Z" />
    </>
  ),
};

function CatIcon({ c, size = 22 }: { c: Category; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {CAT_ICON[c]}
    </svg>
  );
}

/** Okładka gotowego samolotu: szkic A350 z boku. */
function AirlinerSketch() {
  return (
    <svg className="cover-svg" viewBox="0 0 320 180" aria-hidden focusable="false">
      <g className="cover-motif">
        <path d="M40 98 C 44 84, 60 80, 78 80 H246 C 262 80, 272 70, 280 52 H292 L286 84 C 284 96, 270 104, 250 104 H70 C 56 104, 42 104, 40 98 Z" className="cv-ink" />
        <path d="M54 86 C 58 83, 64 82, 70 82 L66 88 Z" className="cv-solid" />
        <path d="M134 104 L172 140 H190 L170 104" className="cv-ink" stroke="var(--accent)" />
        <path d="M250 82 L266 64 H276" className="cv-thin" />
        <path d="M150 120 h28 a6 6 0 0 1 0 12 h-28 a6 6 0 0 1 0 -12 Z" className="cv-ink" />
        {Array.from({ length: 14 }, (_, i) => (
          <circle key={i} cx={92 + i * 10.5} cy="90" r="1.8" className="cv-dot" />
        ))}
        <path d="M24 150 H296" className="cv-dash" />
      </g>
    </svg>
  );
}

/** Okładka modelu w przygotowaniu: duża ikona dziedziny. */
function SoonCover({ c }: { c: Category }) {
  return (
    <div className="soon-cover" aria-hidden>
      <CatIcon c={c} size={56} />
    </div>
  );
}

function ModelCard({ m, i }: { m: CatalogModel; i: number }) {
  const style = { '--accent': CAT_COLOR[m.category] } as CSSProperties;
  const inner = (
    <>
      <div className="card-cover">
        {m.topic ? <AirlinerSketch /> : <SoonCover c={m.category} />}
        {!m.topic && <span className="soon-badge">wkrótce</span>}
        <h3>{m.title}</h3>
      </div>
      <div className="card-body">
        <p>{m.summary}</p>
        {m.topic && (
          <span className="card-cta">
            otwórz model <Icon name="arrow-up-right" size={14} />
          </span>
        )}
      </div>
    </>
  );
  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1], delay: Math.min(i, 8) * 0.03 }}
    >
      {m.topic ? (
        <Link to={`/temat/${m.topic}/1`} className="card is-ready" style={style}>
          {inner}
        </Link>
      ) : (
        <div className="card is-soon" style={style} aria-label={`${m.title} – model w przygotowaniu`}>
          {inner}
        </div>
      )}
    </motion.li>
  );
}

/** Wyszukiwanie bez wielkości liter i bez polskich znaków („smiglowiec” znajduje „Śmigłowiec”). */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');

export function Home() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ready = catalog.filter((m) => m.topic).length;
  const haystack = useMemo(() => new Map(catalog.map((m) => [m.id, fold(`${m.title} ${m.summary} ${m.keywords ?? ''} ${categoryLabels[m.category]}`)])), []);
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches = (m: CatalogModel) => words.every((w) => haystack.get(m.id)!.includes(w));
  // w każdej dziedzinie najpierw gotowe modele, potem zapowiedzi
  const sections = categoryOrder
    .filter((c) => filter === 'all' || c === filter)
    .map((c) => ({ c, items: catalog.filter((m) => m.category === c && matches(m)).sort((a, b) => Number(!!b.topic) - Number(!!a.topic)) }))
    .filter((s) => s.items.length > 0);
  const found = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="site">
      <header className="topnav">
        <Link to="/" className="brand">
          <BrandMark />
          <span>
            Open Learn<em>jak to działa</em>
          </span>
        </Link>
        <ThemeToggle />
      </header>

      <main>
        <section className="hero hero-search">
          <h1>
            Zobacz, <em>jak to</em> działa.
          </h1>
          <p>
            Prawdziwe rzeczy w 3D, rozbierane na części krok po kroku – od środka, z podpisami i krótkim wyjaśnieniem obok.
            Wpisz, co chcesz zrozumieć.
          </p>
          <label className="search search-lg">
            <Icon name="search" size={22} />
            <input
              ref={searchRef}
              type="search"
              placeholder="Szukaj modelu, np. silnik, serce, most…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Szukaj modelu"
              autoFocus
            />
            {query ? (
              <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Wyczyść wyszukiwanie">
                <Icon name="close" size={15} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </label>
          <p className="hero-count">
            {ready} {ready === 1 ? 'gotowy model' : 'gotowe modele'} · {catalog.length - ready} w przygotowaniu
          </p>
        </section>

        <div className="toolbar" id="katalog">
          <div className="filters" role="radiogroup" aria-label="Dziedzina">
            <button type="button" role="radio" aria-checked={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              wszystkie <span className="fcount">{catalog.length}</span>
            </button>
            {categoryOrder.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={filter === c}
                className={filter === c ? 'active' : ''}
                onClick={() => setFilter(c)}
                style={{ '--accent': CAT_COLOR[c] } as CSSProperties}
              >
                <span className="cat-dot" style={{ color: CAT_COLOR[c] }}>
                  <CatIcon c={c} size={16} />
                </span>
                {categoryLabels[c].toLowerCase()}
                <span className="fcount">{catalog.filter((m) => m.category === c).length}</span>
              </button>
            ))}
          </div>
          {words.length > 0 && <span className="found">{found === 0 ? 'brak wyników' : `znaleziono: ${found}`}</span>}
        </div>

        {sections.map(({ c, items }) => (
          <section key={c} className="subject" id={`dziedzina-${c}`} style={{ '--accent': CAT_COLOR[c] } as CSSProperties}>
            <header className="subject-head">
              <div className="subject-title">
                <h2>
                  <span className="cat-head-icon" style={{ color: CAT_COLOR[c] }}>
                    <CatIcon c={c} size={30} />
                  </span>
                  {categoryLabels[c]}
                </h2>
              </div>
            </header>
            <ul className="grid">
              {items.map((m, i) => (
                <ModelCard key={m.id} m={m} i={i} />
              ))}
            </ul>
          </section>
        ))}
        {sections.length === 0 && (
          <div className="empty">
            <p>Nie ma jeszcze modelu pasującego do „{query}”.</p>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Pokaż wszystkie
            </button>
          </div>
        )}
      </main>

      <footer className="site-foot">
        <span>
          <BrandMark size={20} /> Open Learn
        </span>
        <span>Bez kont, bez ocen, bez śledzenia postępu – tylko modele i to, jak działają.</span>
      </footer>
    </div>
  );
}
