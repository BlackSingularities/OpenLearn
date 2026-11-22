import { useEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { catalog, type CatalogModel } from '../lib/catalog';
import { BrandMark } from './Cover';
import { Icon, ThemeToggle } from './ui';

/** Okładka samolotu: szkic A350 z boku. */
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

/** Okładka wulkanu: stożek w przekroju z kominem i komorą magmową. */
function VolcanoSketch() {
  return (
    <svg className="cover-svg" viewBox="0 0 320 180" aria-hidden focusable="false">
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

function ModelCard({ m, i }: { m: CatalogModel; i: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1], delay: i * 0.05 }}
    >
      <Link to={`/temat/${m.topic}/1`} className="card is-ready" style={{ '--accent': m.color } as CSSProperties}>
        <div className="card-cover">
          {m.cover === 'samolot' ? <AirlinerSketch /> : <VolcanoSketch />}
          <h3>{m.title}</h3>
        </div>
        <div className="card-body">
          <p>{m.summary}</p>
          <span className="card-cta">
            otwórz model <Icon name="arrow-up-right" size={14} />
          </span>
        </div>
      </Link>
    </motion.li>
  );
}

export function Home() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
        <section className="hero">
          <h1>
            Zobacz, <em>jak to</em> działa.
          </h1>
          <p>Prawdziwe rzeczy w 3D, rozbierane na części krok po kroku – od środka, z podpisami i krótkim wyjaśnieniem obok.</p>
        </section>

        <ul className="grid">
          {catalog.map((m, i) => (
            <ModelCard key={m.id} m={m} i={i} />
          ))}
        </ul>
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
