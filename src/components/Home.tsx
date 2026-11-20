import { CollapsibleGrid } from './CollapsibleGrid';
import { HeroAtom } from './HeroAtom';
import { PyramidTitle } from './PyramidTitle';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { topics } from '../topics';
import { allSteps, type Subject, type Topic } from '../lib/types';
import { subjectLabels, subjectMeta, subjectOrder } from '../lib/subjects';
import { BrandMark, Cover } from './Cover';
import { Icon, ThemeToggle } from './ui';

function plural(n: number, one: string, few: string, many: string): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (n === 1) return `${n} ${one}`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

const has3d = (t: Topic) => t.steps.some((s) => s.kind === '3d');

function TopicCard({ t, i }: { t: Topic; i: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1], delay: Math.min(i, 6) * 0.04 }}
    >
      <Link to={`/temat/${t.id}/1`} className="card" style={{ '--accent': t.accent } as React.CSSProperties}>
        <div className="card-cover">
          <Cover id={t.id} />
          <PyramidTitle text={t.title} />
        </div>
        <div className="card-body">
          <p>{t.summary}</p>
        </div>
      </Link>
    </motion.li>
  );
}


const SUBJECT_ICON: Record<Subject, JSX.Element> = {
  matematyka: (
    <>
      <path d="M4 20 H20 M6 4 V20" />
      <path d="M6 17 C 10 17, 11 6, 19 5" />
    </>
  ),
  fizyka: (
    <>
      <path d="M12 3 V9" />
      <path d="M12 9 L17 17" />
      <circle cx="17.5" cy="18" r="2.5" />
      <path d="M7 3 H17" />
    </>
  ),
  chemia: (
    <>
      <path d="M9 3 H15 M10 3 V9 L4.5 19 A1.5 1.5 0 0 0 6 21 H18 A1.5 1.5 0 0 0 19.5 19 L14 9 V3" />
      <path d="M7 15 H17" />
    </>
  ),
  lotnictwo: (
    <>
      <path d="M2.5 14.5 L21 8.5 A1.6 1.6 0 0 0 20 5.6 L14.5 7.4 L8 3 L6 3.8 L10.5 8.6 L5.5 10.2 L3.4 8.6 L2 9.1 L3.6 12.4 Z" />
      <path d="M3 20 H21" />
    </>
  ),
  polski: (
    <>
      <path d="M5 19 L15 5 L19 9 L9 21 L5 21 Z" />
      <path d="M13 7 L17 11" />
    </>
  ),
  angielski: (
    <>
      <path d="M4 5 H15 A2 2 0 0 1 17 7 V13 A2 2 0 0 1 15 15 H9 L5 19 V15 H4 Z" />
      <path d="M8 9 H13 M8 12 H11" />
    </>
  ),
};

function SubjectIcon({ s, size }: { s: Subject; size?: number }) {
  return (
    <svg className={size ? 'subject-icon-sm' : 'subject-icon'} viewBox="0 0 24 24" width={size ?? 34} height={size ?? 34} fill="none" stroke={subjectMeta[s].color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {SUBJECT_ICON[s]}
    </svg>
  );
}

export function Home() {
  const still = useReducedMotion();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const [filter, setFilter] = useState<Subject | 'all'>('all');
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

  const stats = useMemo(
    () => ({
      topics: topics.length,
      steps: topics.reduce((n, t) => n + allSteps(t).length, 0),
      scenes3d: topics.reduce((n, t) => n + allSteps(t).filter((s) => s.kind === '3d').length, 0),
    }),
    [],
  );

  const q = query.trim().toLowerCase();
  const matches = (t: Topic) => q === '' || `${t.title} ${t.summary}`.toLowerCase().includes(q);
  const sections = subjectOrder
    .filter((s) => filter === 'all' || s === filter)
    .map((s) => ({ subject: s, items: topics.filter((t) => t.subject === s && matches(t)) }))
    .filter((s) => s.items.length > 0);

  const pick = (s: Subject | 'all') => {
    setFilter(s);
    document.getElementById('katalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="site">
      <header className="topnav">
        <Link to="/" className="brand">
          <BrandMark />
          <span>
            Open Learn<em>atlas zjawisk</em>
          </span>
        </Link>
        <nav className="topnav-links" aria-label="Przedmioty">
          {subjectOrder.map((s) => (
            <button key={s} type="button" onClick={() => pick(s)} style={{ '--accent': subjectMeta[s].color } as React.CSSProperties}>
              <SubjectIcon s={s} size={18} />
              {subjectLabels[s].replace('Język ', 'J. ')}
            </button>
          ))}
        </nav>
        <ThemeToggle />
      </header>

      <main>
        <section className="hero">
          <div className="hero-text">
            <h1>
              Zobacz, <em>jak to</em> działa.
            </h1>
            <p>
              Obracaj cząsteczki w 3D, puszczaj pociski pod różnymi kątami, rozbieraj wiersz na sylaby i patrz, jak zdanie
              przechodzi w stronę bierną. Każdy temat to kilka kroków: animacja, suwaki i krótkie wyjaśnienie obok.
            </p>
            <dl className="stats">
              <div>
                <dt>tematów</dt>
                <dd>{stats.topics}</dd>
              </div>
              <div>
                <dt>kroków</dt>
                <dd>{stats.steps}</dd>
              </div>
              <div>
                <dt>scen 3D</dt>
                <dd>{stats.scenes3d}</dd>
              </div>
            </dl>
          </div>
          <HeroAtom still={!!still} />
        </section>

        <div className="toolbar" id="katalog">
          <div className="filters" role="radiogroup" aria-label="Przedmiot">
            <button type="button" role="radio" aria-checked={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              wszystkie <span className="fcount">{topics.length}</span>
            </button>
            {subjectOrder.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={filter === s}
                className={filter === s ? 'active' : ''}
                onClick={() => setFilter(s)}
                style={{ '--accent': subjectMeta[s].color } as React.CSSProperties}
              >
                {subjectLabels[s].replace('Język ', '').toLowerCase()}
                <span className="fcount">{topics.filter((t) => t.subject === s).length}</span>
              </button>
            ))}
          </div>
          <label className="search">
            <Icon name="search" size={17} />
            <input ref={searchRef} type="search" placeholder="Szukaj tematu" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Szukaj tematu" />
            {query ? (
              <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Wyczyść wyszukiwanie">
                <Icon name="close" size={15} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </label>
        </div>

        {sections.map(({ subject, items }) => (
          <section key={subject} className="subject" id={`przedmiot-${subject}`} style={{ '--accent': subjectMeta[subject].color } as React.CSSProperties}>
            <header className="subject-head">
              <div className="subject-title">
                <h2>
                  <SubjectIcon s={subject} />
                  {subjectLabels[subject]}
                </h2>
              </div>
            </header>
            <CollapsibleGrid resetKey={`${filter}|${query}`}>
              {items.map((t, i) => (
                <TopicCard key={t.id} t={t} i={i} />
              ))}
            </CollapsibleGrid>
          </section>
        ))}
        {sections.length === 0 && (
          <div className="empty">
            <p>Nie ma tematu pasującego do „{query}”.</p>
            <button type="button" className="btn ghost" onClick={() => { setQuery(''); setFilter('all'); }}>
              Pokaż wszystkie
            </button>
          </div>
        )}
      </main>

      <footer className="site-foot">
        <span>
          <BrandMark size={20} /> Open Learn
        </span>
        <span>Bez kont, bez ocen, bez śledzenia postępu – tylko zjawiska.</span>
      </footer>
    </div>
  );
}
