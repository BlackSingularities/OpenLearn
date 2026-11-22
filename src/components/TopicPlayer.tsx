import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { legacyTopics, topics } from '../topics';
import type { Params, ParamValue, Step } from '../lib/types';
import { TopicNavContext, type TopicNav } from '../lib/topicNav';
import { Icon } from './ui';
import { Controls } from './Controls';
import { Stage } from './Stage';

function defaultsFor(step: Step): Params {
  const p: Params = {};
  for (const c of step.controls ?? []) p[c.key] = c.default;
  return p;
}

/** Jak długo ukryta, wspólna scena (np. cały samolot) zostaje w pamięci po przejściu do innej zakładki. */
const KEEP_MS = 15000;

type Kept = { key: string; step: Step; params: Params; until: number };

export function TopicPlayer() {
  const { topicId, mod: modParam, step: stepParam } = useParams();
  const navigate = useNavigate();
  const topic = topics.find((t) => t.id === topicId);

  // adres /temat/<id>/<moduł> (bez numeru) też otwiera moduł
  const modId = modParam ?? (stepParam && !/^\d+$/.test(stepParam) && topic?.modules?.some((m) => m.id === stepParam) ? stepParam : undefined);
  const module = modId ? topic?.modules?.find((m) => m.id === modId) : undefined;
  const steps = module ? module.steps : (topic?.steps ?? []);
  const total = steps.length;
  const stepNum = modParam ? stepParam : modId ? '1' : stepParam;
  const index = Math.max(0, Math.min(total - 1, Number(stepNum ?? 1) - 1 || 0));
  const step = steps[index];

  // Parametry są przypisane do kroku – po zmianie kroku od razu wracają wartości domyślne.
  // panel boczny można schować (wybór zapamiętany w przeglądarce)
  // miejsce na przycisk pauzy na dole panelu (pauza należy do sceny, więc trafia tam przez portal)
  const [footEl, setFootEl] = useState<HTMLDivElement | null>(null);
  const [panelHidden, setPanelHidden] = useState(() => {
    try {
      return localStorage.getItem('panel-hidden') === '1';
    } catch {
      return false;
    }
  });
  const togglePanel = () =>
    setPanelHidden((h) => {
      try {
        localStorage.setItem('panel-hidden', h ? '0' : '1');
      } catch {
        /* brak dostępu do pamięci – tylko w tej sesji */
      }
      return !h;
    });
  const [state, setState] = useState<{ step?: Step; values: Params }>({ values: {} });
  const params = state.step === step ? state.values : step ? defaultsFor(step) : {};

  const base = topic ? `/temat/${topic.id}` : '/';
  const goTo = useCallback(
    (i: number) => {
      if (!topic) return;
      const clamped = Math.max(0, Math.min(total - 1, i));
      navigate(module ? `${base}/${module.id}/${clamped + 1}` : `${base}/${clamped + 1}`);
    },
    [navigate, topic, total, module, base],
  );

  const nav = useMemo<TopicNav>(
    () => ({
      openModule: (id, s = 1) => navigate(`${base}/${id}/${s}`),
      openOverview: (s = 1) => navigate(`${base}/${s}`),
      module: module?.id ?? null,
      home: !module || index === 0,
    }),
    [navigate, base, module, index],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') goTo(index + 1);
      if (e.key === 'ArrowLeft') goTo(index - 1);
      if (e.key === 'Escape' && module) nav.openOverview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, index, module, nav]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [topicId, modId, index]);

  const onChange = useCallback(
    (key: string, value: ParamValue) => {
      setState((prev) => {
        const b = prev.step === step ? prev.values : step ? defaultsFor(step) : {};
        return { step, values: { ...b, [key]: value } };
      });
    },
    [step],
  );

  /*
   * Wspólna scena (stageKey): kroki z tym samym kluczem korzystają z jednego <Canvas> – kamera przelatuje między
   * ujęciami bez przeładowania. Po przejściu do kroku z inną sceną poprzednia zostaje ukryta w pamięci jeszcze
   * przez 15 s (szybki powrót), a potem jest zwalniana razem z całą geometrią.
   */
  // wszystkie kroki 3D tematu dzielą jedną kanwę (płynne przeloty kamery); kroki 2D i strony – własne sceny
  const stageKey = step ? (step.kind === '3d' ? `${topic?.id}:3d` : `${topic?.id}/${module?.id ?? ''}/${index}`) : '';
  const [kept, setKept] = useState<Kept | null>(null);
  const prev = useRef<{ key: string; step: Step; params: Params } | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (p && p.key !== stageKey && p.step.kind === '3d') setKept({ ...p, until: Date.now() + KEEP_MS });
    else if (kept?.key === stageKey) setKept(null);
    if (step) prev.current = { key: stageKey, step, params };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageKey]);
  useEffect(() => {
    if (step) prev.current = { key: stageKey, step, params };
  }, [step, params, stageKey]);
  useEffect(() => {
    if (!kept) return;
    const t = window.setTimeout(() => setKept(null), Math.max(0, kept.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [kept]);

  const style = useMemo(() => ({ '--accent': topic?.accent }) as React.CSSProperties, [topic]);

  if (!topic) {
    const legacy = topicId ? legacyTopics[topicId] : undefined;
    if (legacy) {
      const n = Number(stepParam ?? 1) || 1;
      return <Navigate replace to={`/temat/${legacy.topic}/${legacy.module}/${n + legacy.offset}`} />;
    }
    return (
      <main className="page narrow">
        <h1>Nie znaleziono modelu</h1>
        <Link to="/" className="btn">
          Wróć do katalogu
        </Link>
      </main>
    );
  }

  // w module, w którym każda zakładka ma swój punkt na modelu, numery na modelu zastępują pasek zakładek
  // numery pokazują się na scenach z modelem (wspólny układ samolotu); na scenach 2D zostaje pasek zakładek
  const spotNav = Boolean(module) && steps.length > 1 && steps.every((s) => s.spot) && step?.kind === '3d' && Boolean(step.frame || step.stageKey);
  const isLast = index === total - 1;
  const labels = steps.map((s) => s.title);
  const nextTitle = !isLast ? labels[index + 1] : null;

  const stages: { key: string; step: Step; params: Params; active: boolean }[] = [];
  if (kept && kept.key !== stageKey) stages.push({ key: kept.key, step: kept.step, params: kept.params, active: false });
  if (step) stages.push({ key: stageKey, step, params, active: true });

  // nawigacja między krokami (na dole panelu, obok pauzy)
  const navEl = (
    <nav className="panel-nav" aria-label="Nawigacja między krokami">
      {/* do góry: w module – do jego strony głównej (zakładka 0), z niej do całości; poza modułem – do katalogu */}
      {module ? (
        <button
          type="button"
          className="nav-prev"
          onClick={() => (index > 0 ? goTo(0) : nav.openOverview())}
          aria-label={index > 0 ? `Do strony głównej: ${steps[0]?.title ?? ''}` : `Do widoku: ${topic.title}`}
          title={index > 0 ? `Do strony głównej: ${steps[0]?.title ?? ''}` : `Do widoku: ${topic.title}`}
        >
          <Icon name="left" size={18} />
        </button>
      ) : (
        <Link to="/" className="nav-prev" aria-label="Do listy modeli" title="Do listy modeli">
          <Icon name="left" size={18} />
        </Link>
      )}
      <button type="button" className="nav-prev" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Poprzedni krok" title="Poprzedni krok">
        <Icon name="arrow-left" size={18} />
      </button>
      {isLast ? (
        module ? (
          <button type="button" className="nav-next" onClick={() => nav.openOverview()}>
            <span className="nav-text">
              <small>koniec podzespołu</small>
              <span>Wróć do: {topic.title}</span>
            </span>
            <span className="nav-arrow">
              <Icon name="right" size={15} />
            </span>
          </button>
        ) : (
          <Link to="/" className="nav-next">
            <span className="nav-text">
              <small>koniec</small>
              <span>Wróć do katalogu</span>
            </span>
            <span className="nav-arrow">
              <Icon name="right" size={15} />
            </span>
          </Link>
        )
      ) : (
        <button type="button" className="nav-next" onClick={() => goTo(index + 1)}>
          <span className="nav-text">
            <small>dalej</small>
            <span>{nextTitle}</span>
          </span>
          <span className="nav-arrow">
            <Icon name="right" size={15} />
          </span>
        </button>
      )}
    </nav>
  );

  return (
    <main className={`player kind-${step?.kind ?? '2d'}${panelHidden ? ' panel-hidden' : ''}`} style={style}>
      <header className="player-bar">
        <div className="player-title">
          {/* tytuł dla czytników ekranu; na ekranie – jedna linia ścieżki */}
          <h1 className="sr-only">{module ? module.title : topic.title}</h1>
          {/* ścieżka w jednej linii: dziedzina › temat › strona główna modułu › zakładka (wszystko poza bieżącym miejscem jest klikalne) */}
          <nav className="crumb" aria-label="Ścieżka">
            <Link to="/" className="crumb-link">
              Modele
            </Link>
            <span aria-hidden>›</span>
            {module ? (
              <>
                <button type="button" className="crumb-link" onClick={() => nav.openOverview()}>
                  {topic.title}
                </button>
                <span aria-hidden>›</span>
                {index > 0 ? (
                  <>
                    <button type="button" className="crumb-link" onClick={() => goTo(0)}>
                      {steps[0]?.title}
                    </button>
                    <span aria-hidden>›</span>
                    <span className="crumb-here" aria-current="page">
                      {step?.title}
                    </span>
                  </>
                ) : (
                  <span className="crumb-here" aria-current="page">
                    {steps[0]?.title}
                  </span>
                )}
              </>
            ) : (
              <>
                <span>{topic.title}</span>
                <span aria-hidden>›</span>
                <span className="crumb-here" aria-current="page">
                  {step?.title}
                </span>
              </>
            )}
          </nav>
        </div>
        <nav className="step-nav" aria-label={module ? `Zakładki: ${module.title}` : 'Kroki'}>
          {!spotNav && (
            <ol className="step-rail">
              {labels.map((title, i) => (
                <li key={`${i}-${title}`}>
                  <button
                    type="button"
                    className={i === index ? 'current' : i < index ? 'done' : ''}
                    onClick={() => goTo(i)}
                    data-tip={`${String(module ? i : i + 1).padStart(2, '0')} · ${title}`}
                    aria-label={`${module ? 'Zakładka' : 'Krok'} ${i + 1}: ${title}`}
                    aria-current={i === index ? 'step' : undefined}
                  >
                    <span className="bar" />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="rail-caption" aria-hidden>
            <span className="rail-num">
              {/* w module zakładka 0 to jego strona główna, a numery kolejnych zakładek liczą się od 1 */}
              {module ? `${String(index).padStart(2, '0')}/${String(total - 1).padStart(2, '0')}` : `${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`}
            </span>
            <span className="rail-title">{step?.title}</span>
          </p>
        </nav>
      </header>

      <TopicNavContext.Provider value={nav}>
        <div className={`player-body kind-${step?.kind ?? '2d'}`}>
          {stages.map((s) => (
            <Stage key={s.key} step={s.step} params={s.params} active={s.active} spots={s.active && spotNav ? { steps, index, goTo } : undefined} pauseSlot={s.active && !panelHidden ? footEl : null} />
          ))}

          <button type="button" className="panel-toggle" onClick={togglePanel} aria-expanded={!panelHidden} aria-label={panelHidden ? 'Pokaż panel z opisem' : 'Schowaj panel z opisem'} title={panelHidden ? 'Pokaż panel' : 'Schowaj panel'}>
            <Icon name={panelHidden ? 'left' : 'right'} size={18} />
          </button>
          <aside className="panel" aria-hidden={panelHidden || undefined}>
            <div className="panel-scroll">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${topic.id}-${module?.id ?? ''}-${index}`}
                  className="step-content"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
                >
                  <div className="step-head">
                    <h2>{step?.title}</h2>
                  </div>
                  <div className="prose">{step?.body}</div>
                  {step?.controls && step.controls.length > 0 && (
                    <div className="panel-controls">
                      <Controls controls={step.controls.filter((c) => c.key !== 'labels')} values={params} onChange={onChange} />
                    </div>
                  )}
                  {!module && topic.modules && topic.modules.length > 0 && (
                    <section className="panel-section">
                      <h3>Podzespoły – kliknij na modelu albo tutaj</h3>
                      <ul className="module-list">
                        {topic.modules.map((m) => (
                          <li key={m.id}>
                            <button type="button" onClick={() => nav.openModule(m.id)}>
                              <span className="module-name">{m.title}</span>
                              <span className="module-sum">{m.summary}</span>
                              <span className="module-steps">{m.steps.length} zakł.</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            {/* pasek na dole panelu: pauza animacji (z sceny, przez portal) i nawigacja między krokami */}
            <div className="panel-foot">
              <div className="pause-slot" ref={setFootEl} />
              {navEl}
            </div>
          </aside>
        </div>
      </TopicNavContext.Provider>
    </main>
  );
}
