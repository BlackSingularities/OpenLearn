import { useEffect, useState } from 'react';

type IconName = 'arrow-left' | 'gear' | 'panel' | 'left' | 'right' | 'search' | 'sun' | 'moon' | 'auto' | 'cube' | 'orbit' | 'close' | 'arrow-up-right';

const paths: Record<IconName, string> = {
  panel: 'M4 5h16v14H4zM15 5v14',
  'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
  // zębatka (koło zębate z otworem)
  gear: 'M10.3 2.6h3.4l.5 2.3a7.6 7.6 0 0 1 1.9.8l2-1.3 2.4 2.4-1.3 2a7.6 7.6 0 0 1 .8 1.9l2.3.5v3.4l-2.3.5a7.6 7.6 0 0 1-.8 1.9l1.3 2-2.4 2.4-2-1.3a7.6 7.6 0 0 1-1.9.8l-.5 2.3h-3.4l-.5-2.3a7.6 7.6 0 0 1-1.9-.8l-2 1.3-2.4-2.4 1.3-2a7.6 7.6 0 0 1-.8-1.9l-2.3-.5v-3.4l2.3-.5a7.6 7.6 0 0 1 .8-1.9l-1.3-2 2.4-2.4 2 1.3a7.6 7.6 0 0 1 1.9-.8zM12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  auto: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9',
  orbit: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5-4 4.5-9 4.5-9-2-9-4.5z',
  close: 'M6 6l12 12M18 6L6 18',
  'arrow-up-right': 'M7 17L17 7M8 7h9v9',
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className="icon"
    >
      <path d={paths[name]} />
    </svg>
  );
}

type Theme = 'auto' | 'light' | 'dark';
const KEY = 'openlearn-theme';

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyStoredTheme() {
  const t = readTheme();
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

const labels: Record<Theme, string> = { auto: 'Motyw: systemowy', light: 'Motyw: jasny', dark: 'Motyw: ciemny' };
const icons: Record<Theme, IconName> = { auto: 'auto', light: 'sun', dark: 'moon' };
const next: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };

/** Przełącznik motywu: systemowy → jasny → ciemny. Wybór zostaje tylko w tej przeglądarce. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      if (theme === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* brak dostępu do pamięci – motyw działa do odświeżenia */
    }
  }, [theme]);
  return (
    <button type="button" className="icon-btn" onClick={() => setTheme(next[theme])} aria-label={labels[theme]} title={labels[theme]}>
      <Icon name={icons[theme]} />
    </button>
  );
}

/* ---------- ustawienia globalne: opisy na scenach i motyw ---------- */

const LABELS_KEY = 'openlearn-labels';
const LABELS_EVENT = 'openlearn-labels';

function readLabels(): boolean {
  try {
    return localStorage.getItem(LABELS_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Czy pokazywać opisy na scenach (ustawienie globalne, zapamiętane w przeglądarce). */
export function useGlobalLabels() {
  const [on, setOn] = useState(readLabels);
  useEffect(() => {
    const f = () => setOn(readLabels());
    window.addEventListener(LABELS_EVENT, f);
    return () => window.removeEventListener(LABELS_EVENT, f);
  }, []);
  return on;
}

function setGlobalLabels(on: boolean) {
  try {
    if (on) localStorage.removeItem(LABELS_KEY);
    else localStorage.setItem(LABELS_KEY, 'off');
  } catch {
    /* brak dostępu do pamięci – ustawienie działa do odświeżenia */
  }
  if (on) delete document.documentElement.dataset.labels;
  else document.documentElement.dataset.labels = 'off';
  window.dispatchEvent(new Event(LABELS_EVENT));
}

/** Przywraca zapamiętane ustawienie opisów przy starcie strony. */
export function applyStoredLabels() {
  if (!readLabels()) document.documentElement.dataset.labels = 'off';
}

/** Przycisk ustawień (zamiast samego przełącznika motywu): opisy na scenach i motyw. */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const labelsOn = useGlobalLabels();
  const screensOn = useCockpitPref('screens');
  const controlsOn = useCockpitPref('controls');
  const cockpitSize = useCockpitSize();
  const speedUnit = useSpeedUnit();
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      if (theme === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* brak dostępu do pamięci */
    }
  }, [theme]);
  // klik poza menu albo Esc zamyka je
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as HTMLElement).closest('.settings')) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  const themes: [Theme, string][] = [
    ['auto', 'systemowy'],
    ['light', 'jasny'],
    ['dark', 'ciemny'],
  ];
  return (
    <div className="settings">
      <button type="button" className={`icon-btn${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Ustawienia" title="Ustawienia">
        <Icon name="gear" />
      </button>
      {open && (
        <div className="settings-pop" role="dialog" aria-label="Ustawienia">
          <label className="settings-row">
            <span>Opisy na scenach</span>
            <button type="button" role="switch" aria-checked={labelsOn} className={`switch ${labelsOn ? 'on' : ''}`} onClick={() => setGlobalLabels(!labelsOn)}>
              <span className="knob" />
            </button>
          </label>
          <label className="settings-row">
            <span>Pokazuj wyświetlacze</span>
            <button type="button" role="switch" aria-checked={screensOn} className={`switch ${screensOn ? 'on' : ''}`} onClick={() => setCockpitPref('screens', !screensOn)}>
              <span className="knob" />
            </button>
          </label>
          <label className="settings-row">
            <span>Pokazuj przełączniki</span>
            <button type="button" role="switch" aria-checked={controlsOn} className={`switch ${controlsOn ? 'on' : ''}`} onClick={() => setCockpitPref('controls', !controlsOn)}>
              <span className="knob" />
            </button>
          </label>
          <div className="settings-row col">
            <span>Wielkość wyświetlaczy i przełączników</span>
            <div className="segmented" role="radiogroup" aria-label="Wielkość wyświetlaczy i przełączników">
              {(
                [
                  ['small', 'mała'],
                  ['medium', 'średnia'],
                  ['large', 'duża'],
                ] as [CockpitSize, string][]
              ).map(([v, name]) => (
                <button key={v} type="button" role="radio" aria-checked={cockpitSize === v} className={cockpitSize === v ? 'active' : ''} onClick={() => setCockpitSize(v)}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row col">
            <span>Jednostka prędkości</span>
            <div className="segmented" role="radiogroup" aria-label="Jednostka prędkości">
              {SPEED_UNITS.map(([u, name]) => (
                <button key={u} type="button" role="radio" aria-checked={speedUnit === u} className={speedUnit === u ? 'active' : ''} onClick={() => setSpeedUnit(u)}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row col">
            <span>Motyw</span>
            <div className="segmented" role="radiogroup" aria-label="Motyw">
              {themes.map(([t, name]) => (
                <button key={t} type="button" role="radio" aria-checked={theme === t} className={theme === t ? 'active' : ''} onClick={() => setTheme(t)}>
                  <Icon name={icons[t]} size={14} />
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- kokpit: czy pokazywać wyświetlacze i przełączniki (ustawienie globalne) ---------- */

export type CockpitPref = 'screens' | 'controls';
const COCKPIT_KEY: Record<CockpitPref, string> = { screens: 'openlearn-show-screens', controls: 'openlearn-show-controls' };
const COCKPIT_EVENT = 'openlearn-cockpit-pref';
function readCockpitPref(k: CockpitPref) {
  try {
    return localStorage.getItem(COCKPIT_KEY[k]) !== 'off';
  } catch {
    return true;
  }
}
/** Czy pokazywać wyświetlacze kokpitu (PFD, ND, ECAM) albo przełączniki (dźwignie, drążek, przyciski) – domyślnie tak. */
export function useCockpitPref(k: CockpitPref) {
  const [on, setOn] = useState(() => readCockpitPref(k));
  useEffect(() => {
    const f = () => setOn(readCockpitPref(k));
    window.addEventListener(COCKPIT_EVENT, f);
    return () => window.removeEventListener(COCKPIT_EVENT, f);
  }, [k]);
  return on;
}
export function setCockpitPref(k: CockpitPref, on: boolean) {
  try {
    if (on) localStorage.removeItem(COCKPIT_KEY[k]);
    else localStorage.setItem(COCKPIT_KEY[k], 'off');
  } catch {
    /* brak dostępu do pamięci */
  }
  window.dispatchEvent(new Event(COCKPIT_EVENT));
}

/** Rozmiar wyświetlaczy i przełączników kokpitu: mały (100%), średni (110%), duży (120%). */
export type CockpitSize = 'small' | 'medium' | 'large';
const SIZE_KEY = 'openlearn-cockpit-size';
export const COCKPIT_SCALE: Record<CockpitSize, number> = { small: 1, medium: 1.1, large: 1.2 };
function readCockpitSize(): CockpitSize {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    return v === 'medium' || v === 'large' ? v : 'small';
  } catch {
    return 'small';
  }
}
export function useCockpitSize() {
  const [v, setV] = useState<CockpitSize>(readCockpitSize);
  useEffect(() => {
    const f = () => setV(readCockpitSize());
    window.addEventListener(COCKPIT_EVENT, f);
    return () => window.removeEventListener(COCKPIT_EVENT, f);
  }, []);
  return v;
}
export function setCockpitSize(v: CockpitSize) {
  try {
    if (v === 'small') localStorage.removeItem(SIZE_KEY);
    else localStorage.setItem(SIZE_KEY, v);
  } catch {
    /* brak dostępu do pamięci */
  }
  window.dispatchEvent(new Event(COCKPIT_EVENT));
}

/* ---------- jednostka prędkości (cała symulacja) ---------- */

export type SpeedUnit = 'kmh' | 'kt' | 'ms';
const SPEED_KEY = 'openlearn-speed-unit';
const SPEED_EVENT = 'openlearn-speed-unit';
const SPEED_UNITS: [SpeedUnit, string][] = [
  ['kmh', 'km/h'],
  ['kt', 'węzły'],
  ['ms', 'm/s'],
];
/** Nazwa jednostki do wyświetlenia przy liczbie. */
export const SPEED_LABEL: Record<SpeedUnit, string> = { kmh: 'km/h', kt: 'kt', ms: 'm/s' };
/** Ile jednostek w 1 km/h. */
export const SPEED_PER_KMH: Record<SpeedUnit, number> = { kmh: 1, kt: 1 / 1.852, ms: 1 / 3.6 };

function readSpeedUnit(): SpeedUnit {
  try {
    const v = localStorage.getItem(SPEED_KEY);
    return v === 'kt' || v === 'ms' ? v : 'kmh';
  } catch {
    return 'kmh';
  }
}

/** Wybrana jednostka prędkości (ustawienie globalne, zapamiętane w przeglądarce). */
export function useSpeedUnit() {
  const [u, setU] = useState<SpeedUnit>(readSpeedUnit);
  useEffect(() => {
    const f = () => setU(readSpeedUnit());
    window.addEventListener(SPEED_EVENT, f);
    return () => window.removeEventListener(SPEED_EVENT, f);
  }, []);
  return u;
}

export function setSpeedUnit(u: SpeedUnit) {
  try {
    if (u === 'kmh') localStorage.removeItem(SPEED_KEY);
    else localStorage.setItem(SPEED_KEY, u);
  } catch {
    /* brak dostępu do pamięci */
  }
  window.dispatchEvent(new Event(SPEED_EVENT));
}

/** Prędkość w m/s przeliczona na wybraną jednostkę. */
export const toSpeedUnit = (mps: number, u: SpeedUnit) => mps * 3.6 * SPEED_PER_KMH[u];
/** Jednostki suwaków, które są prędkością (przeliczane na jednostkę z ustawień). */
export const SPEED_CONTROL_MPS: Record<string, number> = { 'km/h': 1 / 3.6, 'm/s': 1, 'km/s': 1000 };

/**
 * Formatowanie prędkości (podanej w m/s) w wybranej jednostce, np. „450 km/h”. Liczba miejsc po przecinku jest
 * podana dla km/h; dla węzłów i m/s dobierana tak, żeby dokładność była podobna.
 */
export function useSpeedFmt() {
  const u = useSpeedUnit();
  return (mps: number, digits = 0) => {
    const v = toSpeedUnit(mps, u);
    return `${v.toLocaleString('pl-PL', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${SPEED_LABEL[u]}`;
  };
}

/** Liczba prędkości do tekstu: km/h bez zmian, węzły zaokrąglone do 5 (powyżej 50), m/s do całości. */
function speedText(kmh: number, u: SpeedUnit) {
  const v = kmh * SPEED_PER_KMH[u];
  const r = u === 'kt' && v > 50 ? Math.round(v / 5) * 5 : Math.round(v);
  return `${r.toLocaleString('pl-PL')} ${SPEED_LABEL[u]}`;
}
/**
 * Tekst opisu z prędkościami zapisanymi w km/h („ok. 30 km/h”, „185 km/h”) przeliczony na wybraną jednostkę –
 * opisy piszemy w km/h, a czytelnik widzi je w swojej jednostce.
 */
export function speedInText(text: string, u: SpeedUnit) {
  if (u === 'kmh') return text;
  return text.replace(/(\d[\d\s ]*)\s?km\/h/g, (_, n: string) => speedText(Number(n.replace(/[\s ]/g, '')), u));
}
/** Prędkość w opisie (podana w km/h) w jednostce z ustawień. */
export function Spd({ kmh }: { kmh: number }) {
  return <>{speedText(kmh, useSpeedUnit())}</>;
}

/** Prędkość w wybranej jednostce: sama liczba (val), etykieta jednostki (unit) i gotowy tekst (fmt). */
export function useSpeed() {
  const u = useSpeedUnit();
  const fmt = useSpeedFmt();
  return { u, unit: SPEED_LABEL[u], val: (mps: number) => toSpeedUnit(mps, u), fmt };
}
