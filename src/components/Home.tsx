import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { catalog, type CatalogModel } from '../lib/catalog';
import { allSteps } from '../lib/types';
import { topics } from '../topics';
import { BrandMark } from './Cover';
import { Icon, ThemeToggle } from './ui';

/** Okładka samolotu: szkic A350 z boku. */
function AirlinerSketch() {
  return (
    <svg className="row-svg" viewBox="0 0 320 180" aria-hidden focusable="false">
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

/** Okładka wulkanu: stożek w przekroju z kominem i komorą magmową. */
function VolcanoSketch() {
  return (
    <svg className="row-svg" viewBox="0 0 320 180" aria-hidden focusable="false">
      <g className="cover-motif">
        <path d="M30 150 L134 58 H186 L290 150" className="cv-ink" />
        <path d="M156 58 V128" className="cv-ink" stroke="var(--accent)" />
        <path d="M164 58 V128" className="cv-ink" stroke="var(--accent)" />
        <ellipse cx="160" cy="140" rx="34" ry="10" className="cv-ink" stroke="var(--accent)" />
        <path d="M150 50 C 140 36, 150 26, 142 14 M168 50 C 178 38, 168 28, 178 18" className="cv-thin" />
        <circle cx="128" cy="34" r="2.4" className="cv-dot" />
        <circle cx="196" cy="28" r="2.4" className="cv-dot" />
        <path d="M24 150 H296" className="cv-dash" />
      </g>
    </svg>
  );
}

function ModelRow({ m, i }: { m: CatalogModel; i: number }) {
  const topic = topics.find((t) => t.id === m.topic);
  const modules = topic?.modules ?? [];
  const steps = topic ? allSteps(topic).length : 0;
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1], delay: Math.min(i, 12) * 0.025 }}
    >
      <Link to={`/temat/${m.topic}/1`} className="model-row" style={{ '--accent': m.color } as CSSProperties}>
        <span className="row-thumb">{m.cover === 'samolot' ? <AirlinerSketch /> : <VolcanoSketch />}</span>
        <span className="row-main">
          <span className="row-title">{m.title}</span>
          <span className="row-sum">{m.summary}</span>
        </span>
        <span className="row-meta">
          {modules.length} rozdz. · {steps} kroków
        </span>
        <span className="row-go" aria-hidden>
          <Icon name="arrow-up-right" size={18} />
        </span>
      </Link>
    </motion.li>
  );
}

/** Wyszukiwanie bez wielkości liter i bez polskich znaków. */
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
  const [query, setQuery] = useState('');
  const words = fold(query).split(/\s+/).filter(Boolean);
  const list = catalog.filter((m) => {
    const hay = fold(`${m.title} ${m.summary}`);
    return words.every((w) => hay.includes(w));
  });

  return (
    <div className="site home">
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
        <section className="home-hero">
          <h1>
            Zobacz, <em>jak to</em> działa.
          </h1>
          <p>Prawdziwe rzeczy w 3D, rozbierane na części krok po kroku – od środka, z podpisami i krótkim wyjaśnieniem obok.</p>
        </section>

        <div className="list-head">
          <span className="list-count">
            {catalog.length} {catalog.length === 1 ? 'model' : catalog.length < 5 ? 'modele' : 'modeli'}
          </span>
          <label className="list-search">
            <Icon name="search" size={18} />
            <input type="search" placeholder="Szukaj modelu…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Szukaj modelu" />
          </label>
        </div>

        <ul className="model-list">
          {list.map((m, i) => (
            <ModelRow key={m.id} m={m} i={i} />
          ))}
        </ul>
        {list.length === 0 && <p className="list-empty">Nie ma modelu pasującego do „{query}”.</p>}
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
