import { Suspense, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Params, Step } from '../lib/types';
import { InfoDisplay, InfoSlot, createInfoStore } from '../lib/plot';
import { PauseContext } from '../lib/useAnimationClock';
import { SceneHiddenContext } from '../lib/topicNav';
import { SettingsMenu, useGlobalLabels } from './ui';

/** Tylko w trybie deweloperskim: dostęp do stanu sceny z konsoli (window.__r3f()) – do sprawdzania ujęć i modeli. */
function DevHandle() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    (window as unknown as { __r3f?: typeof get }).__r3f = get;
  }, [get]);
  return null;
}

interface Props {
  step: Step;
  params: Params;
  /**
   * false – scena jest trzymana w pamięci, ale ukryta i nierenderowana (np. cały samolot, gdy na chwilę
   * przechodzimy do kroku 2D – powrót jest wtedy natychmiastowy).
   */
  active?: boolean;
  /** Nawigacja numerami na modelu (zakładki modułu z polem `spot`). */
  spots?: SpotNav;
  /** Miejsce na przycisk pauzy (dół panelu). */
  pauseSlot?: HTMLElement | null;
}
type SpotNav = { steps: Step[]; index: number; goTo: (i: number) => void };

type V3 = [number, number, number];

/** Jak długo scena wspólna (np. cały samolot) zostaje w pamięci po przejściu do innej sceny w tej samej kanwie. */
const KEEP_MS = 15000;

/** Na wąskim ekranie kamera odsuwa się od celu, żeby model zmieścił się w kadrze. */
const fitFactor = (w: number, h: number) => {
  const aspect = w / Math.max(1, h);
  return aspect < 1.3 ? Math.pow(1.3 / aspect, 0.85) : 1;
};
const fitted = (base: V3, target: V3, f: number): V3 => [target[0] + (base[0] - target[0]) * f, target[1] + (base[1] - target[1]) * f, target[2] + (base[2] - target[2]) * f];
/** Punkt kroku przeniesiony do wspólnego układu tematu (pole `frame`). */
const inFrame = (p: V3, step: Step): V3 => (step.frame ? [step.frame.position[0] + p[0] * step.frame.scale, step.frame.position[1] + p[1] * step.frame.scale, step.frame.position[2] + p[2] * step.frame.scale] : p);

/** Oddala kamerę, gdy scena jest węższa niż wysoka, żeby model zmieścił się w kadrze. */
function FitCamera({ base, target, fit = true }: { base: V3; target: V3; fit?: boolean }) {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  useEffect(() => {
    camera.position.set(...fitted(base, target, fit ? fitFactor(width, height) : 1));
    camera.lookAt(target[0], target[1], target[2]);
    // tylko przy pierwszym ustawieniu i zmianie rozmiaru – nie walczymy z OrbitControls
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);
  return null;
}

/** Gładki start i koniec (pochodne 1. i 2. rzędu zerowe na końcach) – bez szarpnięcia przy ruszaniu i hamowaniu. */
const smootherstep = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);

/**
 * Przelot kamery: przy każdej zmianie ujęcia kamera nie skacze, tylko spokojnie przelatuje do nowego.
 * – cel przesuwa się po prostej, a kierunek patrzenia obraca po najkrótszym łuku (slerp), więc kamera okrąża model;
 * – odległość zmienia się logarytmicznie: zbliżenie z 80 m do 8 m wygląda równie płynnie jak z 8 m do 0,8 m;
 * – czas płynie klatkami z limitem kroku: gdy przeglądarka na chwilę się zatnie (budowa nowej sceny, kompilacja
 *   shaderów), przelot nie przeskakuje do przodu, tylko spokojnie toczy się dalej;
 * – złapanie modelu myszą przerywa przelot (bez walki z użytkownikiem).
 * Czas liczony jest niezależnie od pauzy animacji.
 */
function CameraFlight({ base, target, fit = true }: { base: V3; target: V3; fit?: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as (THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3; update: () => void }) | null;
  const size = useThree((s) => s.size);
  const first = useRef(true);
  const fl = useRef<{ t0: THREE.Vector3; t1: THREE.Vector3; d0: THREE.Vector3; q: THREE.Quaternion; r0: number; r1: number; lift: number; t: number; dur: number; last: number } | null>(null);
  const key = `${base.join()}|${target.join()}`;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const p1 = new THREE.Vector3(...fitted(base, target, fit ? fitFactor(size.width, size.height) : 1));
    const t1 = new THREE.Vector3(...target);
    const p0 = camera.position.clone();
    const t0 = controls?.target.clone() ?? t1.clone();
    const o0 = p0.clone().sub(t0);
    const o1 = p1.clone().sub(t1);
    const r0 = Math.max(0.5, o0.length());
    const r1 = Math.max(0.5, o1.length());
    const d0 = o0.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(d0, o1.clone().normalize());
    const turn = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    const zoom = Math.abs(Math.log(r1 / r0));
    const move = t0.distanceTo(t1) / Math.max(r0, r1);
    // czas zależny od tego, jak bardzo zmienia się ujęcie (obrót, zoom, przesunięcie celu): 0,9–3,2 s
    const dur = Math.min(3.2, 0.9 + 0.55 * turn + 0.45 * zoom + 0.6 * Math.min(2, move));
    // przy dużym przelocie kamera lekko „oddycha” – oddala się w połowie drogi, żeby widać było, dokąd leci
    const lift = 0.12 * Math.min(1, turn / 1.5 + move / 2);
    fl.current = { t0, t1, d0, q, r0, r1, lift, t: 0, dur, last: performance.now() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // użytkownik łapie model – przelot ustępuje
  useEffect(() => {
    if (!controls) return;
    const stop = () => (fl.current = null);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), id: new THREE.Quaternion(), dir: new THREE.Vector3(), tgt: new THREE.Vector3() }), []);
  useFrame(() => {
    const f = fl.current;
    if (!f || !controls) return;
    const now = performance.now();
    f.t += Math.min(1 / 30, (now - f.last) / 1000);
    f.last = now;
    const u = Math.min(1, f.t / f.dur);
    const e = smootherstep(u);
    tmp.tgt.lerpVectors(f.t0, f.t1, e);
    tmp.q.copy(tmp.id).slerp(f.q, e);
    tmp.dir.copy(f.d0).applyQuaternion(tmp.q);
    const r = Math.exp(THREE.MathUtils.lerp(Math.log(f.r0), Math.log(f.r1), e)) * (1 + f.lift * Math.sin(Math.PI * e));
    camera.position.copy(tmp.tgt).addScaledVector(tmp.dir, r);
    controls.target.copy(tmp.tgt);
    controls.update();
    if (u >= 1) fl.current = null;
  });
  return null;
}

/**
 * Zdejmuje przyciemnienie dopiero, gdy nowa scena naprawdę się narysowała (pierwsza klatka bywa długa –
 * kompilacja shaderów), żeby nigdy nie było widać zacięcia ani pustej sceny.
 */
function SwapWatch({ token, onReady }: { token: string; onReady: () => void }) {
  const n = useRef(0);
  useEffect(() => {
    n.current = 0;
  }, [token]);
  useFrame(() => {
    if (n.current < 0) return;
    n.current += 1;
    if (n.current >= 3) {
      n.current = -1;
      onReady();
    }
  });
  return null;
}

/**
 * Kanwa leży pod panelem bocznym (cała szerokość okna), więc środek rzutu przesuwamy w lewo o połowę
 * szerokości panelu – model jest wyśrodkowany w widocznej części sceny. Podpisy i klikanie korzystają
 * z tej samej macierzy rzutu, więc wszystko się zgadza.
 */
function ViewShift({ panel }: { panel: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (size.width > 900) camera.setViewOffset(size.width, size.height, panel / 2, 0, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, panel]);
  return null;
}

/**
 * Pauza sceny 3D: zatrzymuje zegar react-three-fiber, więc wszystkie animacje (useFrame dostaje dt = 0,
 * czas shaderów stoi), a scena nadal się renderuje – można ją obracać i przybliżać.
 */
function FreezeClock({ paused }: { paused: boolean }) {
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    if (paused) {
      clock.getElapsedTime();
      clock.autoStart = false;
      clock.stop();
    } else if (!clock.running) {
      const saved = clock.elapsedTime;
      clock.autoStart = true;
      clock.start();
      clock.elapsedTime = saved;
    }
  }, [paused, clock]);
  return null;
}

const PauseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);
const PlayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M7 4l13 8-13 8z" />
  </svg>
);

/** Pasek stanu wtopiony w dół sceny: pauza, podpowiedź obsługi i przełącznik motywu (prawy dolny róg). */
function StatusBar({ paused, onToggle, hint, slot }: { paused?: boolean; onToggle?: () => void; hint: boolean; slot?: HTMLElement | null }) {
  const pause = onToggle && (
    <button type="button" className={`status-btn${paused ? ' on' : ''}`} onClick={onToggle} aria-pressed={paused} title={paused ? 'Wznów animację (P)' : 'Wstrzymaj animację (P)'}>
      {paused ? <PlayIcon /> : <PauseIcon />}
      <span>{paused ? 'Wznów animację' : 'Wstrzymaj animację'}</span>
    </button>
  );
  return (
    <div className="stage-status">
      {/* pauza na dole panelu (gdy jest miejsce), inaczej – w pasku sceny */}
      {pause && (slot ? createPortal(pause, slot) : pause)}
      {hint && (
        <span className="status-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5-4 4.5-9 4.5-9-2-9-4.5z" />
          </svg>
          <span className="hint-desktop">Przeciągnij, aby obrócić · kółko, aby przybliżyć</span>
          <span className="hint-touch">Przesuń palcem, aby obrócić · uszczypnij, aby przybliżyć</span>
        </span>
      )}
      <span className="status-theme">
        <SettingsMenu />
      </span>
    </div>
  );
}

/** Punkt numeru na modelu; z `spotFollow` przesuwa się co klatkę razem ze swoją częścią. */
function SpotAnchor({ step, children }: { step: Step; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const base = step.spot!;
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const d = step.spotFollow?.();
    g.position.set(...inFrame(d ? [base[0] + d[0], base[1] + d[1], base[2] + d[2]] : base, step));
  });
  return (
    <group ref={ref} position={inFrame(base, step)}>
      {children}
    </group>
  );
}

/**
 * Numery zakładek na modelu: kliknięcie przenosi do zakładki (kamera przelatuje, scena zamienia się bez
 * migania). Bieżąca jest wyróżniona, następna lekko pulsuje – podpowiada, dokąd iść dalej.
 */
function SpotMarkers({ nav }: { nav: SpotNav }) {
  // numery są tylko na stronie głównej modułu (zakładka 0) – jak klikanie i podpisy części (useModuleHome)
  if (nav.index !== 0) return null;
  return (
    <>
      {nav.steps.map((s, i) =>
        // zakładka 0 to strona główna modułu (wraca się do niej strzałką), więc numery zaczynają się od 1
        s.spot && i !== nav.index && i > 0 ? (
          <SpotAnchor key={i} step={s}>
          <Html center zIndexRange={[18, 10]}>
            <button
              type="button"
              className={`spot-marker${s.spotLabel ? ' special' : ''}`}
              onClick={() => nav.goTo(i)}
              aria-label={`Zakładka ${i}: ${s.title}`}
            >
              <span className="spot-num">{s.spotLabel ?? i}</span>
              <span className="spot-title">{s.title}</span>
            </button>
          </Html>
          </SpotAnchor>
        ) : null,
      )}
    </>
  );
}

/* identyfikator sceny: wspólny klucz albo sam obiekt kroku */
const stepIds = new WeakMap<Step, string>();
let stepSeq = 0;
const sceneKey = (s: Step) => {
  if (s.stageKey) return `k:${s.stageKey}`;
  let id = stepIds.get(s);
  if (!id) stepIds.set(s, (id = `s:${++stepSeq}`));
  return id;
};
type Entry = { key: string; step: Step; params: Params };

/** Jedna scena w kanwie, umieszczona we wspólnym układzie tematu; ukryta – bez podpisów i ramek informacji. */
function SceneSlot({ entry, hidden, warm = false, slot }: { entry: Entry; hidden: boolean; warm?: boolean; slot: { store: ReturnType<typeof createInfoStore> } }) {
  const Scene = entry.step.scene;
  const labels = useGlobalLabels();
  const merged = { ...entry.params, ...entry.step.preset, labels };
  const dummy = useMemo(() => ({ store: createInfoStore() }), []);
  const fr = entry.step.frame;
  return (
    // rozgrzewka: scena jest rysowana (kompilują się shadery, wysyłają bufory), ale ściśnięta do punktu – niewidoczna
    <group visible={!hidden} position={fr?.position ?? [0, 0, 0]} scale={(fr?.scale ?? 1) * (warm ? 1e-6 : 1)}>
      <SceneHiddenContext.Provider value={hidden || warm}>
        <InfoSlot.Provider value={hidden || warm ? dummy : slot}>
          <Suspense fallback={null}>
            <Scene params={merged} />
          </Suspense>
        </InfoSlot.Provider>
      </SceneHiddenContext.Provider>
    </group>
  );
}

/**
 * Kanwa 3D wspólna dla wszystkich kroków 3D tematu. Zmiana ujęcia = przelot kamery; zmiana zawartości =
 * krótkie, miękkie przyciemnienie, w którego połowie stara scena zamienia się na nową. Scena wspólna
 * (stageKey, np. cały samolot) po zamianie zostaje ukryta w pamięci jeszcze przez 15 s.
 */
function Stage3D({ step, params, active, spots, pauseSlot }: { step: Step; params: Params; active: boolean; spots?: SpotNav; pauseSlot?: HTMLElement | null }) {
  const store = useMemo(() => createInfoStore(), []);
  const slot = useMemo(() => ({ store }), [store]);
  const [paused, setPaused] = useState(false);
  const key = sceneKey(step);
  const [shown, setShown] = useState<Entry>({ key, step, params });
  const [kept, setKept] = useState<(Entry & { until: number })[]>([]);
  /** Nowa scena rozgrzewana w tle; zastępuje bieżącą w jednej klatce, gdy jest gotowa – bez przyciemniania. */
  const [incoming, setIncoming] = useState<Entry | null>(null);
  const incRef = useRef<Entry | null>(null);
  incRef.current = incoming;
  const [orbitTarget] = useState<V3>(inFrame(step.target ?? [0, 0, 0], step));

  useEffect(() => setPaused(false), [step]);
  useEffect(() => {
    if (key === shown.key) {
      setIncoming(null);
      if (shown.step !== step || shown.params !== params) setShown({ key, step, params });
      return;
    }
    // budowa nowej sceny jako przejście o niskim priorytecie – React rozkłada ją na kawałki między klatkami
    const next = { key, step, params };
    if (incRef.current?.key === key) setIncoming(next);
    else startTransition(() => setIncoming(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, step, params]);
  const promote = () => {
    const inc = incRef.current;
    if (!inc) return;
    const prev = shown;
    if (prev.step.stageKey) setKept((k) => [...k.filter((e) => e.key !== prev.key && e.key !== inc.key), { ...prev, until: Date.now() + KEEP_MS }]);
    else setKept((k) => k.filter((e) => e.key !== inc.key));
    setShown(inc);
    setIncoming(null);
  };
  useEffect(() => {
    if (!kept.length) return;
    const next = Math.min(...kept.map((e) => e.until));
    const t = window.setTimeout(() => setKept((k) => k.filter((e) => e.until > Date.now())), Math.max(0, next - Date.now()) + 20);
    return () => window.clearTimeout(t);
  }, [kept]);
  // skrót klawiszowy P (poza polami tekstowymi)
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'p' || e.key === 'P') setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  // kamera rusza od razu w stronę nowego ujęcia, nie czekając na rozgrzanie sceny
  const curE = incoming ?? shown;
  const cur = curE.step;
  // ujęcie może zależeć od kontrolek kroku (kamera wtedy też płynnie przelatuje)
  const view = cur.view?.({ ...curE.params, ...cur.preset });
  const base = inFrame(view?.camera ?? cur.camera ?? [6, 4, 8], cur);
  const target = inFrame(view?.target ?? cur.target ?? [0, 0, 0], cur);
  const entries = [
    ...kept.filter((e) => e.key !== shown.key && e.key !== incoming?.key).map((e) => ({ e, hidden: true, warm: false })),
    { e: shown, hidden: false, warm: false },
    ...(incoming ? [{ e: incoming, hidden: false, warm: true }] : []),
  ];
  return (
    <div className={`stage stage-3d${active ? '' : ' stage-hidden'}`} aria-hidden={!active || undefined}>
      <div className="stage-3d-canvas">
        <Canvas camera={{ position: base, fov: 45, near: 0.2, far: 600 }} dpr={[1, 2]} frameloop={active ? 'always' : 'never'}>
          <PauseContext.Provider value={paused}>
            <ViewShift panel={424} />
            {/* kamera we wnętrzu (np. w fotelu pasażera) nie odsuwa się na wąskim ekranie – wyszłaby poza model */}
            <FitCamera base={base} target={target} fit={!cur.cameraInside} />
            <CameraFlight base={base} target={target} fit={!cur.cameraInside} />
            <SwapWatch token={incoming?.key ?? ''} onReady={promote} />
            <FreezeClock paused={paused} />
            {(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV && <DevHandle />}
            {entries.map(({ e, hidden, warm }) => (
              <SceneSlot key={e.key} entry={e} hidden={hidden} warm={warm} slot={slot} />
            ))}
            {spots && active && <SpotMarkers nav={spots} />}
            <OrbitControls makeDefault target={orbitTarget} enableDamping dampingFactor={0.08} minDistance={cur.cameraInside ? 0.3 : 1.5} maxDistance={260} />
          </PauseContext.Provider>
        </Canvas>
        <StatusBar paused={paused} onToggle={() => setPaused((p) => !p)} hint slot={active ? pauseSlot : null} />
      </div>
      <div className="stage-info">
        <InfoDisplay store={store} />
      </div>
    </div>
  );
}

/** Scena lekcji: dla kroków 3D wspólna kanwa z kamerą i orbitowaniem, dla 2D i stron – komponent wprost. */
export function Stage({ step, params, active = true, spots, pauseSlot }: Props) {
  const Scene = step.scene;
  const labels = useGlobalLabels();
  const merged = { ...params, ...step.preset, labels };
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const slot2d = useMemo(() => ({ el: slot }), [slot]);
  const [paused, setPaused] = useState(false);
  useEffect(() => setPaused(false), [step]);
  useEffect(() => {
    if (!active || step.kind !== '2d') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'p' || e.key === 'P') setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, step.kind]);
  const hidden = active ? '' : ' stage-hidden';

  if (step.kind === 'page') {
    return (
      <div className={`stage stage-page${hidden}`}>
        <Scene params={merged} />
        <StatusBar hint={false} />
      </div>
    );
  }

  if (step.kind === '2d') {
    return (
      <div className={`stage stage-2d${hidden}`}>
        <div className="stage-canvas">
          <InfoSlot.Provider value={slot2d}>
            <PauseContext.Provider value={paused}>
              <Scene params={merged} />
            </PauseContext.Provider>
          </InfoSlot.Provider>
        </div>
        <div className="stage-info" ref={setSlot} />
        <StatusBar paused={paused} onToggle={() => setPaused((p) => !p)} hint={false} slot={active ? pauseSlot : null} />
      </div>
    );
  }

  return <Stage3D step={step} params={params} active={active} spots={spots} pauseSlot={pauseSlot} />;
}
