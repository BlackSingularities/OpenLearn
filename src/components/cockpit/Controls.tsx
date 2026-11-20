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
import type { CSSProperties, ReactNode } from 'react';
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
export function Pushbutton({ label, top, bottom, onPress, guard = false, disabled = false, size = 50 }: { label: string; top?: PbLight; bottom?: PbLight; onPress?: () => void; guard?: boolean; disabled?: boolean; size?: number }) {
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
    boxShadow: 'inset 0 -3px 6px rgba(0,0,0,0.6), 0 2px 3px rgba(0,0,0,0.5)',
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
 * Dźwignie ciągu obu silników. Położenie: −1 – MAX REV, od −1 do 0 – zakres odwracacza, 0 – IDLE, 1 – CL (praca
 * autothrottle), 1,5 – FLX/MCT, 2 – TOGA.
 */
export function ThrustLevers({ pos, size = 120, athr = false }: { pos: [number, number]; size?: number; athr?: boolean }) {
  const h = size;
  const w = 104;
  const at = (p: number) => (p + 1) / 3; // −1…2 → 0…1
  const y = (p: number) => 8 + (1 - at(Math.max(-1, Math.min(2, p)))) * (h - 8);
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>THR LEVERS</div>
      <Quadrant
        w={w}
        h={h}
        label={`Dźwignie ciągu: ${pos.map((p) => (p <= -0.95 ? 'MAX REV' : p < -0.05 ? 'REV' : p < 0.1 ? 'IDLE' : p < 1.2 ? 'CL' : p < 1.75 ? 'FLX/MCT' : 'TOGA')).join(' i ')}`}
        detents={[
          { at: at(2), text: 'TOGA' },
          { at: at(1.5), text: 'FLX' },
          { at: at(1), text: 'CL' },
          { at: at(0), text: 'IDLE' },
          { at: at(-1), text: 'REV', color: AIRBUS.amber },
        ]}
      >
        {pos.map((p, i) => (
          <g key={i}>
            <Handle x={w - 29 + (i === 0 ? -9 : 9)} y={y(p)} w={14} color={p < -0.05 ? '#f1c27a' : '#d4d9de'} h={h} />
          </g>
        ))}
      </Quadrant>
      <div style={{ fontSize: 8, textAlign: 'center', color: athr ? AIRBUS.green : OFF, fontWeight: 700 }}>A/THR</div>
    </div>
  );
}

/** Dźwignia klap: położenia 0, 1, 2, 3, FULL (konfiguracja 1+F – położenie 1 z klapami wysuniętymi na ziemi). */
export function FlapLever({ conf, size = 110 }: { conf: '0' | '1' | '1+F' | '2' | '3' | 'FULL'; size?: number }) {
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
export function GearLever({ lever, state, size = 110 }: { lever: 'up' | 'down'; state: 'down' | 'transit' | 'up'; size?: number }) {
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
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
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

/** Przełącznik autobrake (pokrętło): DISARM, BTV, LO, 2, 3, 4, HI; lampka DECEL – osiągnięte zadane opóźnienie. */
export function AutoBrakeKnob({ sel, decel = false, active = false }: { sel: 'DISARM' | 'BTV' | 'LO' | '2' | '3' | '4' | 'HI'; decel?: boolean; active?: boolean }) {
  const pos = ['DISARM', 'BTV', 'LO', '2', '3', '4', 'HI'];
  const i = Math.max(0, pos.indexOf(sel));
  const ang = (k: number) => -120 + k * 40;
  const r = 30;
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>AUTO BRK</div>
      <svg width={104} height={96} viewBox="-52 -50 104 96" role="img" aria-label={`Autobrake ${sel}${active ? ', hamuje' : ''}${decel ? ', DECEL' : ''}`} style={{ display: 'block' }}>
        {pos.map((p, k) => {
          const a = ((ang(k) - 90) * Math.PI) / 180;
          return (
            <text key={p} x={Math.cos(a) * (r + 12)} y={Math.sin(a) * (r + 12) + 3} fontSize={k === 0 ? 6.5 : 8} fill={k === i ? AIRBUS.cyan : LEGEND} textAnchor="middle" fontWeight={k === i ? 700 : 400}>
              {p}
            </text>
          );
        })}
        <circle r={r - 6} fill="#20252b" stroke="#6b7480" strokeWidth={2} />
        <g style={{ transform: `rotate(${ang(i)}deg)`, transition: MOVE }}>
          <rect x={-4} y={-(r - 6)} width={8} height={2 * (r - 6)} rx={3} fill="#cfd5db" />
          <polygon points={`0,${-(r - 2)} -5,${-(r - 10)} 5,${-(r - 10)}`} fill="#ffffff" />
        </g>
        <rect x={-22} y={34} width={44} height={11} rx={2} fill="#14171b" stroke="#3a4048" />
        <text x={0} y={42.5} fontSize={8} textAnchor="middle" fontWeight={700} fill={decel ? AIRBUS.green : OFF}>
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
export function EngStartPanel({ mode, masters, faults = [false, false], fires = [false, false] }: { mode: 'CRANK' | 'NORM' | 'IGN/START'; masters: [boolean, boolean]; faults?: [boolean, boolean]; fires?: [boolean, boolean] }) {
  const modes = ['CRANK', 'NORM', 'IGN/START'] as const;
  const mi = modes.indexOf(mode);
  const sw = (on: boolean, fault: boolean, fire: boolean, n: number) => (
    <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
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

/** Tiller – małe koło sterowe przy fotelu pilota; obrócony o kąt skrętu koła przedniego (do ok. 70°). */
export function Tiller({ deg }: { deg: number }) {
  return (
    <div style={{ background: PANEL_BG, borderRadius: 6, padding: '4px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', fontFamily: cockpitFont }}>
      <div style={{ fontSize: 9, color: LEGEND, fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center' }}>TILLER</div>
      <svg width={80} height={80} viewBox="-40 -40 80 80" role="img" aria-label={`Tiller obrócony o ${Math.round(deg)} stopni`} style={{ display: 'block' }}>
        <circle r={34} fill="#11151a" stroke="#3a4048" strokeWidth={2} />
        {[-70, 0, 70].map((a) => {
          const r = ((a - 90) * Math.PI) / 180;
          return <line key={a} x1={Math.cos(r) * 30} y1={Math.sin(r) * 30} x2={Math.cos(r) * 35} y2={Math.sin(r) * 35} stroke="#8b939c" strokeWidth={1.5} />;
        })}
        <g transform={`rotate(${-deg})`}>
          <circle r={25} fill="none" stroke="#cfd5db" strokeWidth={6} />
          <line x1={0} y1={-25} x2={0} y2={25} stroke="#cfd5db" strokeWidth={4} />
          <circle cx={0} cy={-25} r={5.5} fill={AIRBUS.yellow} />
        </g>
        <circle r={5} fill="#64748b" />
      </svg>
      <div style={{ fontSize: 9, textAlign: 'center', color: AIRBUS.green, fontWeight: 700 }}>{Math.round(Math.abs(deg))}° {deg > 0.5 ? 'L' : deg < -0.5 ? 'R' : ''}</div>
    </div>
  );
}

/** Kolumna kontrolek do doku kokpitu (obok ekranów). */
export function ControlStack({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>{children}</div>;
}

/** Dźwignia ciągu z wartości N1 / ciągu 0…1 (0 – bieg jałowy, ok. 0,89 – CL, 1 – TOGA). */
export const leverFromThrust = (thr: number) => (thr <= 0.89 ? Math.max(0, thr / 0.89) : 1 + Math.min(1, (thr - 0.89) / 0.11));
