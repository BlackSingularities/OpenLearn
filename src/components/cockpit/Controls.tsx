/*
 * Kontrolki kokpitu w stylu Airbusa A350 – wspólne dla wszystkich modułów, tak jak wyświetlacze (PFD, ND, ECAM).
 * Domyślnie tylko pokazują stan: przełączają się same, zgodnie z tym, co dzieje się w animacji (dźwignia podwozia idzie
 * w górę przy chowaniu, dźwignie ciągu cofają się przy RETARD itd.). Przycisk staje się klikalny dopiero wtedy, gdy
 * scena poda mu `onPress` (np. panel APU, którym uruchamia się APU).
 *
 * Elementy: przycisk z lampkami (Pushbutton), sekcja panelu (PanelBox), dźwignie ciągu (ThrustLevers), dźwignia klap
 * (FlapLever), dźwignia hamulców aerodynamicznych (SpeedBrakeLever), dźwignia podwozia ze wskaźnikami (GearLever),
 * przełącznik autobrake (AutoBrakeKnob) i panel rozruchu silników (EngStartPanel).
 */
import { useId, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { useCockpitPref } from '../ui';
import { AIRBUS, cockpitFont } from './common';

const PANEL_BG = 'linear-gradient(#5d6670, #4c545d)';
const LEGEND = '#f2f4f6';
const OFF = '#2c3138';
const MOVE = 'transform 0.45s cubic-bezier(.4,.1,.2,1)';

/** Lampka przycisku: napis i kolor po zapaleniu. */
export type PbLight = { text: string; color: string; on: boolean };

/** Sekcja panelu (górnego albo pulpitu) z nagłówkiem. */
export function PanelBox({ title, children, style }: { title: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '5px 7px 7px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont, ...style }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.35)', marginBottom: 4, paddingBottom: 1 }}>{title}</div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

/**
 * Przycisk Airbusa: kwadrat z dwiema lampkami – górna (FAULT, FIRE, AVAIL…) i dolna (ON, OFF…). Bez `onPress` to tylko
 * wskaźnik stanu (nie da się go wcisnąć). `guard` – czerwona osłona (np. APU FIRE).
 */
/**
 * Przycisk z lampkami. `act` – załoga właśnie go wciska (scenariusz pokazuje użycie przełączników): obwódka dookoła
 * i lekko wciśnięta płyta.
 */
export function Pushbutton({ label, top, bottom, onPress, guard = false, disabled = false, act = false, size = 50 }: { label: string; top?: PbLight; bottom?: PbLight; onPress?: () => void; guard?: boolean; disabled?: boolean; act?: boolean; size?: number }) {
  // przycisk do klikania (np. panel APU) zostaje zawsze – bez niego nie da się sterować; wskaźnik stanu można ukryć
  const shown = useCockpitPref('controls');
  if (!shown && !onPress) return null;
  const lamp = (l: PbLight | undefined, i: number) => (
    <span
      key={i}
      style={{
        fontSize: l && l.text.length > 5 ? 7.5 : 9,
        fontWeight: 700,
        letterSpacing: '0.03em',
        color: l?.on ? l.color : OFF,
        textShadow: l?.on ? `0 0 6px ${l.color}` : 'none',
        minHeight: 11,
        transition: 'color 0.2s, text-shadow 0.2s',
      }}
    >
      {l?.text ?? ''}
    </span>
  );
  const face: CSSProperties = {
    width: size,
    height: size * 0.86,
    borderRadius: 4,
    background: '#14171b',
    border: guard ? '2px solid #d93a2f' : '1px solid #3a4048',
    boxShadow: act ? `inset 0 2px 6px rgba(0,0,0,0.7), 0 0 0 2px ${AIRBUS.cyan}, 0 0 12px ${AIRBUS.cyan}` : 'inset 0 -3px 6px rgba(0,0,0,0.6), 0 2px 3px rgba(0,0,0,0.5)',
    transform: act ? 'scale(0.95)' : 'none',
    transition: 'box-shadow 0.2s, transform 0.2s',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    padding: 0,
    fontFamily: cockpitFont,
    opacity: disabled ? 0.45 : 1,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: size + 8 }}>
      <div style={{ fontSize: 8.5, color: LEGEND, letterSpacing: '0.04em', textAlign: 'center', minHeight: 20, lineHeight: 1.15, display: 'flex', alignItems: 'flex-end' }}>{label}</div>
      {onPress ? (
        <button type="button" disabled={disabled} onClick={onPress} aria-label={label} style={{ ...face, cursor: disabled ? 'default' : 'pointer', outline: 'none' }}>
          {lamp(top, 0)}
          {lamp(bottom, 1)}
        </button>
      ) : (
        <div role="img" aria-label={`${label}: ${[top, bottom].filter((l) => l?.on).map((l) => l!.text).join(', ') || 'zgaszony'}`} style={face}>
          {lamp(top, 0)}
          {lamp(bottom, 1)}
        </div>
      )}
    </div>
  );
}

/** Pionowy prowadnik dźwigni z zapadkami (pozycja 0…1 od dołu) i podpisami po lewej. */
function Quadrant({ w, h, detents, children, label }: { w: number; h: number; detents: { at: number; text: string; color?: string }[]; children: ReactNode; label: string }) {
  return (
    <svg width={w} height={h + 18} viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label={label} style={{ display: 'block', fontFamily: cockpitFont }}>
      <rect x={w - 34} y={6} width={10} height={h - 4} rx={3} fill="#1b1f24" stroke="#3a4048" />
      {detents.map((d) => {
        const y = 8 + (1 - d.at) * (h - 8);
        return (
          <g key={d.text}>
            <line x1={w - 40} x2={w - 18} y1={y} y2={y} stroke="#8b939c" strokeWidth={1} />
            <text x={w - 44} y={y + 3} fontSize={8} fill={d.color ?? LEGEND} textAnchor="end">
              {d.text}
            </text>
          </g>
        );
      })}
      {children}
    </svg>
  );
}

/** Uchwyt dźwigni na prowadniku (y – położenie środka). */
function Handle({ x, y, w = 22, color = '#d4d9de', knob = 'rect', h }: { x: number; y: number; w?: number; color?: string; knob?: 'rect' | 'wheel'; h: number }) {
  return (
    <g style={{ transform: `translate(0px, ${y}px)`, transition: MOVE }}>
      {knob === 'wheel' ? (
        <g>
          <circle cx={x} cy={0} r={10} fill="#e9edf1" stroke="#9aa3ad" strokeWidth={1.5} />
          <circle cx={x} cy={0} r={4} fill="#9aa3ad" />
        </g>
      ) : (
        <rect x={x - w / 2} y={-6} width={w} height={12} rx={3} fill={color} stroke="#6b7480" />
      )}
      <line x1={x} x2={x} y1={knob === 'wheel' ? 10 : 6} y2={h} stroke="#6b7480" strokeWidth={3} opacity={0} />
    </g>
  );
}

/**
 * Dźwignie ciągu A350 (widok od strony pilotów): dwie czarne dźwignie z poziomymi uchwytami-walcami, stykającymi się
 * pośrodku, z czerwonymi przyciskami rozłączenia autothrottle na zewnętrznych końcach. Każda chodzi w niebiesko-szarym
 * kwadrancie z podziałką: TO GA, FLX MCT, CL, zakres A/THR i 0 (bieg jałowy); poniżej 0 – zakres odwracacza (REV),
 * do którego wchodzi się po podniesieniu czarnego zatrzasku przed dźwignią.
 * Położenie: −1 – MAX REV, od −1 do 0 – odwracacz, 0 – IDLE, 1 – CL (praca autothrottle), 1,5 – FLX/MCT, 2 – TOGA.
 */
export function ThrustLevers({ pos, size = 120, athr = false }: { pos: [number, number]; size?: number; athr?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const shown = useCockpitPref('controls');
  if (!shown) return null;
  const W = 168;
  const top = 26;
  const bot = top + size;
  const H = bot + 30;
  const at = (p: number) => (Math.max(-1, Math.min(2, p)) + 1) / 3; // −1…2 → 0…1
  const y = (p: number) => bot - at(p) * (bot - top);
  const slots = [62, 106];
  const name = (p: number) => (p <= -0.95 ? 'MAX REV' : p < -0.05 ? 'REV' : p < 0.1 ? 'IDLE' : p < 1.2 ? 'CL' : p < 1.75 ? 'FLX/MCT' : 'TOGA');
  const BLUE = '#7d9bb3';
  const BLUE_D = '#5f7d95';
  const scale = (sx: number, side: -1 | 1) => {
    // podziałka po zewnętrznej stronie kwadrantu (jak na zdjęciach): kreski i napisy
    const lx = sx + side * 17;
    const tx = sx + side * 21;
    const anchor = side < 0 ? 'end' : 'start';
    const marks: { p: number; t: string; c?: string }[] = [
      { p: 2, t: 'TO GA' },
      { p: 1.5, t: 'FLX MCT' },
      { p: 1, t: 'CL' },
      { p: 0, t: '0' },
      { p: -1, t: 'MAX REV', c: AIRBUS.amber },
    ];
    return (
      <g>
        <line x1={lx} x2={lx} y1={y(2)} y2={y(0)} stroke="#f2f4f6" strokeWidth={1} />
        {marks.map((m) => (
          <g key={m.t}>
            <line x1={lx} x2={lx + side * 4} y1={y(m.p)} y2={y(m.p)} stroke={m.c ?? '#f2f4f6'} strokeWidth={1.2} />
            <text x={tx} y={y(m.p) + 2.5} fontSize={6.5} fill={m.c ?? '#f2f4f6'} textAnchor={anchor} fontWeight={700}>
              {m.t}
            </text>
          </g>
        ))}
        {/* zakres pracy autothrottle: od 0 do CL */}
        <text x={tx + side * 1} y={(y(1) + y(0)) / 2 + 2} fontSize={6.5} fill="#f2f4f6" textAnchor={anchor} fontWeight={700} letterSpacing="0.05em">
          A/THR
        </text>
      </g>
    );
  };
  return (
    <div style={{ background: 'linear-gradient(#2c3238, #1e2226)', borderRadius: 6, padding: '4px 4px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Dźwignie ciągu: silnik 1 ${name(pos[0])}, silnik 2 ${name(pos[1])}${athr ? ', autothrottle aktywny' : ''}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`q${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={BLUE_D} />
            <stop offset="0.35" stopColor={BLUE} />
            <stop offset="1" stopColor={BLUE_D} />
          </linearGradient>
          <linearGradient id={`h${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a929a" />
            <stop offset="0.3" stopColor="#3a3f45" />
            <stop offset="0.75" stopColor="#15181b" />
            <stop offset="1" stopColor="#050607" />
          </linearGradient>
          <linearGradient id={`s${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0d0f11" />
            <stop offset="0.5" stopColor="#30353b" />
            <stop offset="1" stopColor="#0d0f11" />
          </linearGradient>
        </defs>
        {/* kwadranty (niebiesko-szare) ze szczelinami */}
        {slots.map((sx, i) => (
          <g key={sx}>
            <rect x={sx - 15} y={top - 10} width={30} height={bot - top + 26} rx={5} fill={`url(#q${uid})`} stroke="#3f5566" />
            <rect x={sx - 4} y={top - 6} width={8} height={bot - top + 18} rx={3} fill="#0b0d0f" />
            {/* zakres odwracacza zaznaczony na kwadrancie */}
            <rect x={sx - 15} y={y(0)} width={3} height={y(-1) - y(0)} fill={AIRBUS.amber} opacity={0.75} />
            {scale(sx, i === 0 ? -1 : 1)}
          </g>
        ))}
        {/* dźwignie: trzon od osi obrotu w kwadrancie do uchwytu; uchwyty stykają się pośrodku */}
        {pos.map((p, i) => {
          const sx = slots[i];
          const yy = y(p);
          const rev = p < -0.05;
          const inner = i === 0 ? 1 : -1;
          // uchwyt: walec od trzonu do środka (styk z drugim) i trochę na zewnątrz, z czerwonym przyciskiem na końcu
          const x0 = i === 0 ? sx - 18 : (slots[0] + slots[1]) / 2 + 1;
          const x1 = i === 0 ? (slots[0] + slots[1]) / 2 - 1 : sx + 18;
          return (
            <g key={i} style={{ transform: `translate(0px, ${yy}px)`, transition: MOVE }}>
              <rect x={sx - 7} y={8} width={14} height={bot + 10 - yy} rx={2} fill={`url(#s${uid})`} stroke="#000" strokeWidth={0.6} />
              {/* zatrzask odwracacza przed trzonem – podniesiony w zakresie REV */}
              <rect x={sx - 5} y={rev ? 12 : 18} width={10} height={9} rx={2} fill="#1a1d21" stroke="#4b5259" strokeWidth={0.8} style={{ transition: 'y 0.3s' }} />
              <rect x={x0} y={-9} width={x1 - x0} height={18} rx={8} fill={`url(#h${uid})`} stroke="#6b737b" strokeWidth={0.9} />
              <rect x={x0 + 4} y={-7} width={x1 - x0 - 8} height={3} rx={1.5} fill="#ffffff" opacity={0.3} />
              <rect x={i === 0 ? x0 - 3 : x1 - 1} y={-4} width={4} height={8} rx={1.5} fill="#e5332a" stroke="#7a1d17" strokeWidth={0.6} />
              <text x={sx + inner * 2} y={3} fontSize={7} fill="#9aa3ad" textAnchor="middle" fontWeight={700}>
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Dźwignia klap: położenia 0, 1, 2, 3, FULL (konfiguracja 1+F – położenie 1 z klapami wysuniętymi na ziemi). */
export function FlapLever({ conf, size = 110 }: { conf: '0' | '1' | '1+F' | '2' | '3' | 'FULL'; size?: number }) {
  if (!useCockpitPref('controls')) return null;
  const order = ['0', '1', '2', '3', 'FULL'];
  const idx = conf === '1+F' ? 1 : order.indexOf(conf);
  const h = size;
  const w = 86;
  const at = (i: number) => 1 - i / 4;
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>FLAPS</div>
      <Quadrant w={w} h={h} label={`Dźwignia klap w położeniu ${conf}`} detents={order.map((t, i) => ({ at: at(i), text: t }))}>
        <Handle x={w - 29} y={8 + (1 - at(idx)) * (h - 8)} w={26} color="#e9edf1" h={h} />
      </Quadrant>
      <div style={{ fontSize: 9, textAlign: 'center', color: AIRBUS.green, fontWeight: 700 }}>CONF {conf}</div>
    </div>
  );
}

/**
 * Dźwignia hamulców aerodynamicznych: RET (schowane), ARMED (spojlery naziemne uzbrojone – wysuną się same po
 * przyziemieniu), od 0 do 1 – wychylenie w locie (FULL). `deployed` – ile spojlery są teraz wysunięte (pasek obok).
 */
export function SpeedBrakeLever({ pos, armed = false, deployed = 0, size = 110 }: { pos: number; armed?: boolean; deployed?: number; size?: number }) {
  if (!useCockpitPref('controls')) return null;
  const h = size;
  const w = 92;
  const y = 8 + Math.max(0, Math.min(1, pos)) * (h - 8);
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>SPEED BRAKE</div>
      <Quadrant
        w={w}
        h={h}
        label={`Hamulce aerodynamiczne: ${armed ? 'uzbrojone' : pos < 0.02 ? 'schowane' : `wychylone ${Math.round(pos * 100)}%`}`}
        detents={[
          { at: 1, text: 'RET' },
          { at: 0.5, text: '1/2' },
          { at: 0, text: 'FULL' },
        ]}
      >
        <Handle x={w - 29} y={armed ? 2 : y} w={22} color={armed ? '#ffffff' : '#d4d9de'} h={h} />
        {/* wychylenie spojlerów (z ECAM) – pasek po prawej */}
        <rect x={w - 10} y={8} width={6} height={h - 8} fill="#1b1f24" stroke="#3a4048" />
        <rect x={w - 10} y={8} width={6} height={(h - 8) * Math.max(0, Math.min(1, deployed))} fill={AIRBUS.green} style={{ transition: 'height 0.3s' }} />
      </Quadrant>
      <div style={{ fontSize: 9, textAlign: 'center', color: armed ? AIRBUS.cyan : OFF, fontWeight: 700 }}>{armed ? 'ARMED' : 'GND SPLR'}</div>
    </div>
  );
}

/**
 * Dźwignia podwozia z kołem na końcu i wskaźnikami trzech goleni (LDG GEAR): zielone trójkąty – wypuszczone
 * i zablokowane, czerwone UNLK – w ruchu, zgaszone – schowane. `lever` – położenie dźwigni.
 */
export function GearLever({ lever, state, act = false, size = 110 }: { lever: 'up' | 'down'; state: 'down' | 'transit' | 'up'; act?: boolean; size?: number }) {
  if (!useCockpitPref('controls')) return null;
  const h = size;
  const w = 104;
  const tri = (cx: number) => (
    <g key={cx}>
      <polygon points={`${cx - 7},${12} ${cx + 7},${12} ${cx},${24}`} fill={state === 'down' ? AIRBUS.green : OFF} stroke="#0b0d10" style={{ transition: 'fill 0.2s' }} />
      <text x={cx} y={34} fontSize={7} fill={state === 'transit' ? AIRBUS.red : OFF} textAnchor="middle" fontWeight={700}>
        UNLK
      </text>
    </g>
  );
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 6px', boxShadow: act ? `0 0 0 2px ${AIRBUS.cyan}, 0 0 14px ${AIRBUS.cyan}` : '0 4px 14px rgba(0,0,0,0.45)', transition: 'box-shadow 0.2s', fontFamily: cockpitFont }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>LDG GEAR</div>
      <svg width={w} height={h + 18} viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label={`Dźwignia podwozia ${lever === 'up' ? 'w górze' : 'w dole'}, podwozie ${state === 'down' ? 'wypuszczone' : state === 'up' ? 'schowane' : 'w ruchu'}`} style={{ display: 'block' }}>
        <rect x={4} y={4} width={50} height={36} rx={4} fill="#14171b" stroke="#3a4048" />
        {[16, 29, 42].map((cx) => tri(cx))}
        <rect x={w - 30} y={8} width={10} height={h - 4} rx={3} fill="#1b1f24" stroke="#3a4048" />
        <text x={w - 36} y={14} fontSize={8} fill={LEGEND} textAnchor="end">
          UP
        </text>
        <text x={w - 36} y={h + 6} fontSize={8} fill={LEGEND} textAnchor="end">
          DOWN
        </text>
        <Handle x={w - 25} y={lever === 'up' ? 16 : h - 2} knob="wheel" h={h} />
      </svg>
    </div>
  );
}

/**
 * Przełącznik autobrake A350 (pokrętło na pulpicie): DISARM, BTV, LO, 2, 3, 4, HI. Jak w samolocie: biała podziałka
 * łukiem z kreską przy każdym położeniu, nad zakresem do lądowania (LO–3) napis LDG, a gałka to jasnoszary walec
 * z kanciastym uchwytem i wyżłobioną linią wskazującą wybrane położenie. Lampka DECEL – osiągnięte zadane opóźnienie.
 */
export function AutoBrakeKnob({ sel, decel = false, active = false }: { sel: 'DISARM' | 'BTV' | 'LO' | '2' | '3' | '4' | 'HI'; decel?: boolean; active?: boolean }) {
  const uid = useId().replace(/:/g, '');
  if (!useCockpitPref('controls')) return null;
  const pos = ['DISARM', 'BTV', 'LO', '2', '3', '4', 'HI'];
  // kąty położeń (° od góry, w prawo dodatnie) – jak na panelu: DISARM w lewo w dół, HI w prawo
  const ANG = [-138, -96, -58, -20, 18, 54, 90];
  const i = Math.max(0, pos.indexOf(sel));
  const r = 25; // promień podziałki
  const pt = (a: number, rr: number) => {
    const t = ((a - 90) * Math.PI) / 180;
    return [Math.cos(t) * rr, Math.sin(t) * rr] as const;
  };
  const arc = (a0: number, a1: number, rr: number) => {
    const [x0, y0] = pt(a0, rr);
    const [x1, y1] = pt(a1, rr);
    return `M${x0},${y0} A${rr},${rr} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`;
  };
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 6px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>AUTO BRK</div>
      <svg width={112} height={100} viewBox="-56 -50 112 100" role="img" aria-label={`Autobrake ${sel}${active ? ', hamuje' : ''}${decel ? ', DECEL' : ''}`} style={{ display: 'block', margin: '0 auto' }}>
        <defs>
          <radialGradient id={`akS${uid}`} cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#e9ecef" />
            <stop offset="0.7" stopColor="#b9c0c7" />
            <stop offset="1" stopColor="#8d959e" />
          </radialGradient>
          <linearGradient id={`akG${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#aeb5bd" />
            <stop offset="0.45" stopColor="#f1f3f5" />
            <stop offset="1" stopColor="#9aa2ab" />
          </linearGradient>
        </defs>
        {/* całość przesunięta lekko w prawo – napisy po lewej (DISARM, BTV) są dłuższe, więc pokrętło wypada pośrodku */}
        <g transform="translate(6 2)">
          {/* podziałka: biały łuk z kreskami położeń, nad zakresem do lądowania napis LDG */}
          <path d={arc(ANG[0], ANG[ANG.length - 1], r)} fill="none" stroke="#f2f4f6" strokeWidth={1.2} />
          {ANG.map((a, k) => {
            const [x0, y0] = pt(a, r);
            const [x1, y1] = pt(a, r + 3.5);
            return <line key={k} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#f2f4f6" strokeWidth={k === 0 ? 1 : 1.6} />;
          })}
          {pos.map((p, k) => {
            const [x, y] = pt(ANG[k], r + (k === 0 ? 10 : 9.5));
            const anchor = ANG[k] < -30 ? 'end' : ANG[k] > 30 ? 'start' : 'middle';
            return (
              <text key={p} x={x + (anchor === 'end' ? 2 : anchor === 'start' ? -2 : 0)} y={y + (k === 0 ? 6 : 3)} fontSize={k === 0 ? 6.2 : 7.6} fill={k === i ? AIRBUS.cyan : LEGEND} textAnchor={anchor} fontWeight={k === i ? 700 : 400}>
                {p}
              </text>
            );
          })}
          <text x={pt(-38, r + 20)[0]} y={pt(-38, r + 20)[1]} fontSize={6.2} fill={LEGEND} textAnchor="middle">
            LDG
          </text>
          {/* gałka: walec (podstawa) i kanciasty uchwyt z wyżłobioną linią wskazującą położenie */}
          <circle r={17.5} fill="#1a1d21" opacity={0.45} transform="translate(1.6 2.2)" />
          <circle r={17} fill={`url(#akS${uid})`} stroke="#6b737c" strokeWidth={0.8} />
          <g style={{ transform: `rotate(${ANG[i]}deg)`, transition: MOVE }}>
            <path d="M-7.5,15 L-6,-19 Q0,-23 6,-19 L7.5,15 Q0,18 -7.5,15 Z" fill="#000" opacity={0.25} transform="translate(1.5 1.8)" />
            <path d="M-7.5,15 L-6,-19 Q0,-23 6,-19 L7.5,15 Q0,18 -7.5,15 Z" fill={`url(#akG${uid})`} stroke="#7d858e" strokeWidth={0.8} />
            <line x1={0} y1={-20.5} x2={0} y2={9} stroke="#3b4148" strokeWidth={1.6} strokeLinecap="round" />
            <line x1={0.9} y1={-19.5} x2={0.9} y2={8} stroke="#ffffff" strokeWidth={0.5} opacity={0.7} />
          </g>
        </g>
        {/* lampka DECEL – pod pokrętłem, pośrodku */}
        <rect x={-21} y={36} width={42} height={11} rx={2} fill="#14171b" stroke="#3a4048" />
        <text x={0} y={44.3} fontSize={8} textAnchor="middle" fontWeight={700} fill={decel ? AIRBUS.green : OFF}>
          DECEL
        </text>
      </svg>
    </div>
  );
}

/**
 * Panel rozruchu silników na pulpicie: przełącznik trybu (CRANK, NORM, IGN/START) i przełączniki ENG MASTER 1 i 2
 * z lampkami FAULT (bursztynowa – przerwany rozruch) i FIRE.
 */
export function EngStartPanel({ mode, masters, faults = [false, false], fires = [false, false], act = [false, false] }: { mode: 'CRANK' | 'NORM' | 'IGN/START'; masters: [boolean, boolean]; faults?: [boolean, boolean]; fires?: [boolean, boolean]; act?: [boolean, boolean] }) {
  if (!useCockpitPref('controls')) return null;
  const modes = ['CRANK', 'NORM', 'IGN/START'] as const;
  const mi = modes.indexOf(mode);
  // `act` – załoga właśnie przestawia ten przełącznik: obwódka dookoła
  const sw = (on: boolean, fault: boolean, fire: boolean, n: number) => (
    <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, borderRadius: 5, padding: '1px 2px', boxShadow: act[n - 1] ? `0 0 0 2px ${AIRBUS.cyan}, 0 0 12px ${AIRBUS.cyan}` : 'none', transition: 'box-shadow 0.2s' }}>
      <div style={{ fontSize: 8, color: LEGEND }}>ENG {n}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 7.5, fontWeight: 700 }}>
        <span style={{ color: fire ? AIRBUS.red : OFF, textShadow: fire ? `0 0 5px ${AIRBUS.red}` : 'none' }}>FIRE</span>
        <span style={{ color: fault ? AIRBUS.amber : OFF, textShadow: fault ? `0 0 5px ${AIRBUS.amber}` : 'none' }}>FAULT</span>
      </div>
      <svg width={26} height={48} viewBox="0 0 26 48" role="img" aria-label={`ENG MASTER ${n}: ${on ? 'ON' : 'OFF'}`}>
        <rect x={8} y={2} width={10} height={44} rx={4} fill="#1b1f24" stroke="#3a4048" />
        <g style={{ transform: `translate(0px, ${on ? 0 : 24}px)`, transition: MOVE }}>
          <rect x={3} y={6} width={20} height={16} rx={3} fill="#d4d9de" stroke="#6b7480" />
        </g>
      </svg>
      <div style={{ fontSize: 7.5, color: LEGEND }}>{on ? 'ON' : 'OFF'}</div>
    </div>
  );
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 8px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>ENG START</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {sw(masters[0], faults[0], fires[0], 1)}
        <svg width={70} height={70} viewBox="-35 -32 70 70" role="img" aria-label={`Tryb rozruchu ${mode}`}>
          {modes.map((m, k) => {
            const a = ((-45 + k * 45 - 90) * Math.PI) / 180;
            return (
              <text key={m} x={Math.cos(a) * 26} y={Math.sin(a) * 26 + 3} fontSize={6.5} fill={k === mi ? AIRBUS.cyan : LEGEND} textAnchor="middle" fontWeight={k === mi ? 700 : 400}>
                {m}
              </text>
            );
          })}
          <circle r={14} fill="#20252b" stroke="#6b7480" strokeWidth={2} />
          <g style={{ transform: `rotate(${-45 + mi * 45}deg)`, transition: MOVE }}>
            <rect x={-3} y={-14} width={6} height={28} rx={2} fill="#cfd5db" />
            <polygon points="0,-17 -4,-10 4,-10" fill="#ffffff" />
          </g>
          <text x={0} y={30} fontSize={6.5} fill={LEGEND} textAnchor="middle">
            MODE
          </text>
        </svg>
        {sw(masters[1], faults[1], fires[1], 2)}
      </div>
    </div>
  );
}

/**
 * Tiller A350 widziany z góry – jak na pulpicie bocznym: niska, okrągła podstawa w zagłębieniu pulpitu z podziałką
 * skrętu (pomarańczowe kreski i liczby 10, 30, 50, 75 w lewo i w prawo), na niej obrotowa piasta z wygiętą rączką
 * zakończoną gałką do kręcenia jedną ręką i przycisk PEDAL DISC w środku (odłącza pedały od koła przedniego).
 * Z `onChange` tiller można kręcić myszą albo palcem; `cmd` – zadany skręt (turkusowy znacznik), gdy koło nie nadąża.
 */
export function Tiller({ deg, cmd, onChange }: { deg: number; cmd?: number; onChange?: (deg: number) => void }) {
  const uid = useId().replace(/:/g, '');
  const shown = useCockpitPref('controls');
  // tiller do kręcenia myszą zostaje zawsze – bez niego nie da się sterować
  if (!shown && !onChange) return null;
  /** Kąt wskazany myszą/palcem: od góry tarczy, w lewo dodatni, do ±70°. */
  const drag = (e: RPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const a = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    onChange?.(Math.max(-70, Math.min(70, -a)));
  };
  const AMBER = '#f5a524';
  const R = 40; // promień podziałki
  /** Punkt na okręgu o promieniu r pod kątem a (° od góry, w prawo dodatni). */
  const at = (a: number, r: number) => {
    const t = ((a - 90) * Math.PI) / 180;
    return [Math.cos(t) * r, Math.sin(t) * r] as const;
  };
  // podziałka: kreski co 5° do 75°, dłuższe przy opisanych wartościach (kąt na tarczy = kąt skrętu koła)
  const ticks = Array.from({ length: 31 }, (_, i) => -75 + i * 5);
  const nums = [10, 30, 50, 75];
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>TILLER</div>
      <svg
        width={108}
        height={104}
        viewBox="-54 -52 108 104"
        style={{ display: 'block', margin: '0 auto', cursor: onChange ? 'grab' : undefined, touchAction: onChange ? 'none' : undefined }}
        onPointerDown={
          onChange
            ? (e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag(e);
              }
            : undefined
        }
        onPointerMove={onChange ? (e) => e.buttons & 1 && drag(e) : undefined}
        role="img"
        aria-label={`Tiller obrócony o ${Math.round(Math.abs(deg))} stopni ${deg > 0.5 ? 'w lewo' : deg < -0.5 ? 'w prawo' : ''}`}
      >
        <defs>
          <radialGradient id={`well${uid}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.75" stopColor="#24282d" />
            <stop offset="1" stopColor="#0d0f11" />
          </radialGradient>
          <radialGradient id={`base${uid}`} cx="0.45" cy="0.4" r="0.6">
            <stop offset="0" stopColor="#2b3036" />
            <stop offset="1" stopColor="#15181b" />
          </radialGradient>
          <linearGradient id={`arm${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#08090a" />
            <stop offset="0.45" stopColor="#3a4047" />
            <stop offset="0.6" stopColor="#262a2f" />
            <stop offset="1" stopColor="#060708" />
          </linearGradient>
          <radialGradient id={`hub${uid}`} cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#4a5058" />
            <stop offset="0.6" stopColor="#1f2327" />
            <stop offset="1" stopColor="#0b0c0e" />
          </radialGradient>
          <radialGradient id={`knob${uid}`} cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#6b737b" />
            <stop offset="0.55" stopColor="#23272b" />
            <stop offset="1" stopColor="#08090a" />
          </radialGradient>
        </defs>
        {/* zagłębienie w pulpicie i nieruchoma podstawa z podziałką */}
        <circle r={R + 11} fill={`url(#well${uid})`} />
        <circle r={R + 6} fill={`url(#base${uid})`} stroke="#0a0b0d" strokeWidth={0.8} />
        {ticks.map((a) => {
          const big = a % 10 === 0 || Math.abs(a) === 75;
          const [x0, y0] = at(a, R - (big ? 4 : 2));
          const [x1, y1] = at(a, R + 2);
          return <line key={a} x1={x0} y1={y0} x2={x1} y2={y1} stroke={a === 0 ? '#f2f4f6' : AMBER} strokeWidth={big ? 1.3 : 0.8} opacity={big ? 1 : 0.75} />;
        })}
        {nums.flatMap((n) =>
          [-1, 1].map((s) => {
            const [x, y] = at(s * n, R - 9);
            return (
              <text key={`${n}${s}`} x={x} y={y + 2} fontSize={5.6} fill={AMBER} textAnchor="middle" fontWeight={700}>
                {n}
              </text>
            );
          }),
        )}
        <text x={-R + 2} y={R + 3} fontSize={6} fill={AMBER} textAnchor="middle" fontWeight={700}>
          L
        </text>
        <text x={R - 2} y={R + 3} fontSize={6} fill={AMBER} textAnchor="middle" fontWeight={700}>
          R
        </text>
        {/* zadany skręt (tiller), gdy koło przednie jeszcze za nim nie nadąża */}
        {cmd !== undefined && <path d={`M0,${-R + 3} L-3,${-R - 4} L3,${-R - 4} Z`} fill="#22d3ee" style={{ transform: `rotate(${-cmd}deg)` }} />}
        {/* obrotowa część: piasta z białym wskaźnikiem na podziałce, wygięta rączka z gałką (w lewo – przeciwnie do wskazówek) */}
        <g style={{ transform: `rotate(${-deg}deg)`, transition: 'transform 0.15s linear' }}>
          {/* cień rączki na podstawie */}
          <path d="M-9,-6 C-11,-18 -9,-27 -3,-33 C1,-37 7,-36 7,-31 C7,-27 4,-24 4,-18 L8,-6 Z" fill="#000" opacity={0.35} transform="translate(2.5,2.5)" />
          {/* piasta */}
          <circle r={15} fill={`url(#hub${uid})`} stroke="#000" strokeWidth={0.8} />
          <path d={`M0,-15 L-2,-11 L2,-11 Z`} fill="#f2f4f6" />
          {/* rączka: szeroka u piasty, wygięta, zwęża się ku gałce */}
          <path d="M-9,-6 C-11,-18 -9,-27 -3,-33 C1,-37 7,-36 7,-31 C7,-27 4,-24 4,-18 L8,-6 Z" fill={`url(#arm${uid})`} stroke="#000" strokeWidth={0.8} />
          <path d="M-6,-12 C-7,-20 -5,-27 -1,-31" fill="none" stroke="#6b737b" strokeWidth={0.9} opacity={0.6} />
          {/* gałka na końcu (pionowy uchwyt – z góry walec z odblaskiem) */}
          <circle cx={2} cy={-33} r={6} fill={`url(#knob${uid})`} stroke="#000" strokeWidth={0.8} />
          <circle cx={0.3} cy={-35} r={1.7} fill="#ffffff" opacity={0.25} />
          {/* biały wskaźnik położenia przy podziałce */}
          <rect x={-1} y={-R - 1} width={2} height={7} rx={0.6} fill="#f2f4f6" />
        </g>
        {/* przycisk PEDAL DISC w środku (nie obraca się) */}
        <circle r={9} fill="#121417" stroke="#3a4048" strokeWidth={1} />
        <circle r={7.5} fill="#1b1e22" />
        <text x={0} y={-0.6} fontSize={3.4} fill="#e8ecef" textAnchor="middle" fontWeight={700} letterSpacing="0.06em">
          PEDAL
        </text>
        <text x={0} y={3.6} fontSize={3.4} fill="#e8ecef" textAnchor="middle" fontWeight={700} letterSpacing="0.06em">
          DISC
        </text>
      </svg>
    </div>
  );
}

/**
 * Boczny drążek Airbusa (sidestick) – rysunek uchwytu na gumowej osłonie, z czerwonym przyciskiem przejęcia
 * sterowania (takeover) i spustem radia. Uchwyt pochyla się w bok (x: przechylanie) i do pilota (y > 0: do siebie –
 * nos w górę). Obok – kwadrat położenia drążka (jak znacznik na PFD) i pedały steru kierunku. Drążek sprężynuje do
 * środka: w fly-by-wire pilot wychyla go tylko na czas zmiany.
 */
export function Sidestick({ x, y, pedals = 0 }: { x: number; y: number; pedals?: number }) {
  const uid = useId().replace(/:/g, '');
  const shown = useCockpitPref('controls');
  if (!shown) return null;
  const c = (v: number) => Math.max(-1, Math.min(1, v));
  const roll = c(x) * 20; // ° pochylenia uchwytu w bok
  const pull = c(y); // do siebie > 0
  const S = 26; // pół boku kwadratu położenia
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 6px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>SIDESTICK</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        <svg width={86} height={112} viewBox="-43 -8 86 112" role="img" aria-label={`Boczny drążek: w bok ${Math.round(x * 100)}%, do siebie ${Math.round(y * 100)}%`} style={{ display: 'block' }}>
          <defs>
            <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0b0d0f" />
              <stop offset="0.35" stopColor="#3b4148" />
              <stop offset="0.6" stopColor="#24282d" />
              <stop offset="1" stopColor="#08090b" />
            </linearGradient>
            <radialGradient id={`b${uid}`} cx="0.5" cy="0.35" r="0.7">
              <stop offset="0" stopColor="#3a3f45" />
              <stop offset="1" stopColor="#111316" />
            </radialGradient>
          </defs>
          {/* podstawa w pulpicie bocznym */}
          <rect x={-40} y={86} width={80} height={16} rx={4} fill="#2f353b" stroke="#1d2125" />
          <ellipse cx={0} cy={88} rx={30} ry={8} fill="#1a1d21" />
          {/* gumowa osłona (harmonijka) – lekko podąża za uchwytem */}
          <g style={{ transform: `rotate(${roll * 0.45}deg)`, transformOrigin: '0px 88px', transition: 'transform 0.12s linear' }}>
            <path d="M-24,88 Q-22,74 -12,66 L12,66 Q22,74 24,88 Z" fill={`url(#b${uid})`} stroke="#000" strokeWidth={0.8} />
            {[72, 78, 84].map((yy) => (
              <path key={yy} d={`M${-20 + (84 - yy) * 0.5},${yy} Q0,${yy + 3} ${20 - (84 - yy) * 0.5},${yy}`} fill="none" stroke="#000" strokeWidth={0.8} opacity={0.7} />
            ))}
          </g>
          {/* uchwyt: pochyla się w bok wokół przegubu, a przy ciągnięciu „do siebie” zbliża się do patrzącego */}
          <g
            style={{
              transform: `rotate(${roll}deg) translate(0px, ${pull * 5}px) scale(${1 + pull * 0.07})`,
              transformOrigin: '0px 70px',
              transition: 'transform 0.12s linear',
            }}
          >
            {/* trzon i uchwyt profilowany pod dłoń (szerszy u góry, z podparciem dłoni) */}
            <path d="M-9,70 L-10,46 Q-15,30 -14,16 Q-13,2 -2,-2 Q10,-4 13,8 Q15,18 11,32 Q9,44 9,70 Z" fill={`url(#g${uid})`} stroke="#000" strokeWidth={0.9} />
            <path d="M-11,40 Q-12,28 -10,18" fill="none" stroke="#5b636b" strokeWidth={1.2} opacity={0.7} />
            {/* czerwony przycisk przejęcia sterowania (takeover / A/P disconnect) */}
            <ellipse cx={-6} cy={2} rx={5} ry={3.2} fill="#d92c22" stroke="#6a120d" strokeWidth={0.8} />
            <ellipse cx={-7} cy={1} rx={2} ry={1.1} fill="#ff8a80" opacity={0.6} />
            {/* spust radia z przodu */}
            <rect x={10} y={20} width={4} height={9} rx={1.5} fill="#15181b" stroke="#000" strokeWidth={0.6} />
          </g>
        </svg>
        <svg width={64} height={100} viewBox="-32 -32 64 100" role="img" aria-label={`Pedały steru kierunku ${Math.round(pedals * 100)}%`} style={{ display: 'block' }}>
          {/* kwadrat położenia drążka (jak znacznik na PFD przy rozbiegu) */}
          <rect x={-S} y={-S} width={2 * S} height={2 * S} fill="#0b0d0f" stroke="#5b636b" />
          {[-1, 1].map((k) => (
            <g key={k}>
              <line x1={k * S} x2={k * (S - 5)} y1={0} y2={0} stroke={AIRBUS.white} />
              <line x1={0} x2={0} y1={k * S} y2={k * (S - 5)} stroke={AIRBUS.white} />
            </g>
          ))}
          <g style={{ transform: `translate(${c(x) * (S - 5)}px, ${c(y) * (S - 5)}px)`, transition: 'transform 0.12s linear' }}>
            <path d="M-6,0 H6 M0,-6 V6" stroke={AIRBUS.white} strokeWidth={2.2} />
            <rect x={-3} y={-3} width={6} height={6} fill="none" stroke={AIRBUS.white} strokeWidth={1.4} />
          </g>
          {/* pedały */}
          <text x={0} y={42} fontSize={7} fill={LEGEND} textAnchor="middle">
            PEDAŁY
          </text>
          <rect x={-S} y={47} width={2 * S} height={9} rx={3} fill="#14171b" stroke="#3a4048" />
          <line x1={0} x2={0} y1={47} y2={56} stroke="#3f464e" />
          <rect x={-3 + c(pedals) * (S - 4)} y={48} width={6} height={7} rx={1.5} fill={AIRBUS.cyan} style={{ transition: 'x 0.15s linear' }} />
        </svg>
      </div>
    </div>
  );
}

/** Kolumna kontrolek do doku kokpitu (obok ekranów). */
export function ControlStack({ children }: { children: ReactNode }) {
  if (!useCockpitPref('controls')) return null;
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>{children}</div>;
}

/** Dźwignia ciągu z wartości N1 / ciągu 0…1 (0 – bieg jałowy, ok. 0,89 – CL, 1 – TOGA). */
export const leverFromThrust = (thr: number) => (thr <= 0.89 ? Math.max(0, thr / 0.89) : 1 + Math.min(1, (thr - 0.89) / 0.11));
