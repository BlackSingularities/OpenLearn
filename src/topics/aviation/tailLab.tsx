/*
 * Zakładki modułu „Usterzenie”: osie i stery, odchylenie niekorzystne, równowaga momentów, podmuch, fugoida,
 * wznios i statecznik pionowy, masa i wyważenie. Wszystkie działają na wspólnej scenie samolotu (ten sam model,
 * przeloty kamery, te same smugi opływu co w zakładkach skrzydła i silnika). Każda zakładka ma własną symulację,
 * która co klatkę ustawia pozę samolotu i wychylenia sterów (DirectPose), oraz nakładkę: strzałki sił, osie, podpisy.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Params } from '../../lib/types';
import { InfoPortal, fmt } from '../../lib/plot';
import { CockpitDock, Ecam, Pfd } from '../../components/cockpit';
import { useSpeed } from '../../components/ui';
import { AmbientWind, EngineStreams, FollowPlane, PathStreaks, Tag, useReady, type DirectPose, type PoseState, type Surfaces } from './wingLab';
import { CONTROL_PTS, PLANE_LEVELS, WING_MAC, controlCycle, macX, wingPoint, wingSurface } from './airliner';

type V3 = [number, number, number];
const DEG = Math.PI / 180;
const G0 = 9.81;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Kolory osi (te same w podpisach, strzałkach i poświacie sterów). */
export const C_ROLL = '#f87171';
export const C_PITCH = '#4ade80';
export const C_YAW = '#38bdf8';

export type CtlMode = 'axes' | 'adverse' | 'balance' | 'gust' | 'phugoid' | 'lateral' | 'mass';

/** Środek ciężkości samolotu (oś obrotu w zakładkach): 25% SCA, w osi kadłuba. */
export const CG_REF: V3 = [macX(0.25), -0.6, 0];
const mirrorZ = (p: V3): V3 => [p[0], p[1], -p[2]];

/* ======================= ustawienia sceny dla zakładki ======================= */

const YAW_MODES: Record<string, { name: string; adverse: number; rudder: boolean; note: string }> = {
  brak: { name: 'same lotki', adverse: 1, rudder: false, note: 'Opuszczona lotka zwiększa siłę nośną, a z nią opór indukowany. Wznoszące się skrzydło „hamuje”, więc nos ucieka w przeciwną stronę niż zakręt.' },
  roznicowe: { name: 'lotki różnicowe / spojlery', adverse: 0.35, rudder: false, note: 'Lotka idąca w górę wychyla się bardziej, a w samolotach takich jak A350 pomagają jej spojlery na opadającym skrzydle – dokładają oporu po tej stronie. Odchylenie niekorzystne maleje, ale nie znika.' },
  ster: { name: 'lotki + ster kierunku', adverse: 0, rudder: true, note: 'Ster kierunku wychyla się w stronę zakrętu i równoważy moment odchylający – lot jest skoordynowany, kulka w środku. W A350 robi to sam system sterowania (fly-by-wire), pilot nie musi naciskać pedału.' },
};
export const YAW_MODE_OPTIONS = Object.entries(YAW_MODES).map(([value, m]) => ({ value, label: m.name }));

const LAYOUTS: Record<string, { name: string; eff: number; wingY: number }> = {
  dolno: { name: 'dolnopłat', eff: -3, wingY: 0 },
  srednio: { name: 'średniopłat', eff: 0, wingY: 1.7 },
  gorno: { name: 'górnopłat', eff: 3, wingY: 3.9 },
};
export const LAYOUT_OPTIONS = Object.entries(LAYOUTS).map(([value, l]) => ({ value, label: l.name }));
export const lateralLook = (params: Params) => ({ dihedral: Number(params.dih ?? 5.5), wingY: (LAYOUTS[String(params.layout ?? 'dolno')] ?? LAYOUTS.dolno).wingY, fin: Number(params.fin ?? 1) });

/** Jak ma wyglądać samolot w danej zakładce: w locie czy na ziemi, wyróżnione stery, przekrój, uproszczony model. */
export function ctlScene(mode: CtlMode, params: Params) {
  const flight = mode !== 'mass';
  let hilite: Record<string, string> | null = null;
  if (mode === 'axes') hilite = { aileron: C_ROLL, elevator: C_PITCH, rudder: C_YAW };
  if (mode === 'adverse') {
    // spojlery na opadającym skrzydle model wychyla razem z lotkami – wyróżnione w trybie, który o nich mówi
    const m = String(params.mode ?? 'brak');
    hilite = { aileron: C_ROLL, ...(m === 'roznicowe' ? { spoiler: '#fb923c' } : {}), ...(m === 'ster' ? { rudder: C_YAW } : {}) };
  }
  if (mode === 'lateral' && String(params.exp ?? 'roll') === 'yaw') hilite = { vtp: C_YAW, rudder: C_YAW };
  if (mode === 'balance') hilite = { elevator: C_PITCH };
  if (mode === 'gust' && params.fbw) hilite = { elevator: '#c084fc' };
  return { flight, hilite, mini: mode === 'lateral', focus: null, wingOpen: false };
}

/* ======================= drobne elementy ======================= */

/** Strzałka, której początek i wektor scena podaje co klatkę (get → null ukrywa strzałkę). */
function DynArrow({ get, color, radius = 0.28 }: { get: () => [V3, V3] | null; color: string; radius?: number }) {
  const g = useRef<THREE.Group>(null);
  const shaft = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame(() => {
    const G = g.current;
    if (!G || !shaft.current || !head.current) return;
    const r = get();
    const len = r ? tmp.v.set(...r[1]).length() : 0;
    if (!r || len < 0.08) {
      G.visible = false;
      return;
    }
    G.visible = true;
    G.position.set(...r[0]);
    G.quaternion.setFromUnitVectors(tmp.up, tmp.v.normalize());
    const h = Math.min(len * 0.45, radius * 4.5);
    shaft.current.scale.set(1, Math.max(0.001, len - h), 1);
    shaft.current.position.y = (len - h) / 2;
    head.current.scale.set(1, h, 1);
    head.current.position.y = len - h / 2;
  });
  return (
    <group ref={g} visible={false}>
      <mesh ref={shaft}>
        <cylinderGeometry args={[radius, radius, 1, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
      <mesh ref={head}>
        <coneGeometry args={[radius * 2.3, 1, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

/** Stała strzałka (pomija zerowe). */
function Arr({ from, vec, color, radius = 0.28 }: { from: V3; vec: V3; color: string; radius?: number }) {
  return <DynArrow get={() => [from, vec]} color={color} radius={radius} />;
}

/** Przerysowanie nakładki kilka razy na sekundę (liczby w ramce, wykresy) – bez przerysowywania co klatkę. */
function useTick(hz = 10) {
  const [, set] = useState(0);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += Math.min(dt, 0.1);
    if (acc.current > 1 / hz) {
      acc.current = 0;
      set((n) => (n + 1) % 1e6);
    }
  });
}

/** Znacznik środka ciężkości: kula w cztery pola (czarne i białe), jak na rysunkach technicznych. */
function CgMark({ pos, r = 0.55 }: { pos: V3; r?: number }) {
  return (
    <group position={pos}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
          <sphereGeometry args={[r, 16, 12, 0, Math.PI / 2]} />
          <meshStandardMaterial color={i % 2 ? '#0b1020' : '#f1f5f9'} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/** Znacznik punktu neutralnego: fioletowy trójkąt (stożek) skierowany w górę. */
function NpMark({ pos }: { pos: V3 }) {
  return (
    <mesh position={pos}>
      <coneGeometry args={[0.45, 0.8, 3]} />
      <meshStandardMaterial color="#c084fc" emissive="#c084fc" emissiveIntensity={0.4} />
    </mesh>
  );
}

/** Belka SCA pod samolotem: 0–100% cięciwy, zakres dopuszczalny, strefa niestateczności i znaczniki. */
function MacBar({ y, z, ranges = [], marks = [] }: { y: number; z: number; ranges?: { a: number; b: number; color: string }[]; marks?: { f: number; color: string; label: string; kind?: 'line' | 'np' }[] }) {
  const x0 = macX(0);
  const L = WING_MAC.mac;
  return (
    <group>
      <mesh position={[x0 + L / 2, y, z]}>
        <boxGeometry args={[L, 0.18, 0.9]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {ranges.map((r, i) => (
        <mesh key={i} position={[macX((r.a + r.b) / 2), y + 0.02, z]}>
          <boxGeometry args={[(r.b - r.a) * L, 0.2, 0.92]} />
          <meshStandardMaterial color={r.color} transparent opacity={0.65} />
        </mesh>
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <mesh key={f} position={[macX(f), y + 0.25, z + 0.5]}>
          <boxGeometry args={[0.05, 0.5, 0.05]} />
          <meshBasicMaterial color="#94a3b8" />
        </mesh>
      ))}
      <Tag pos={[x0 + L + 1.2, y, z + 1.3]} color="#94a3b8">
        SCA 0–100%
      </Tag>
      {/* podpisy znaczników schodzą schodkami pod belkę, żeby na siebie nie wchodziły */}
      {marks.map((m, i) =>
        m.kind === 'np' ? (
          <group key={m.label}>
            <NpMark pos={[macX(m.f), y + 0.6, z]} />
            <Tag pos={[macX(m.f), y - 1.3 - i * 1.4, z + 0.6]} color={m.color}>
              {m.label}
            </Tag>
          </group>
        ) : (
          <group key={m.label}>
            <mesh position={[macX(m.f), y + 0.5, z]}>
              <boxGeometry args={[0.1, 1, 1.1]} />
              <meshBasicMaterial color={m.color} />
            </mesh>
            <Tag pos={[macX(m.f), y - 1.3 - i * 1.4, z + 0.6]} color={m.color}>
              {m.label}
            </Tag>
          </group>
        ),
      )}
    </group>
  );
}

/** Pionowa przerywana linia działania siły (przez punkt przyłożenia). */
function ActionLine({ x, y0, y1, z = 0 }: { x: number; y0: number; y1: number; z?: number }) {
  return <Line points={[[x, y0, z], [x, y1, z]]} color="rgba(255,255,255,0.35)" lineWidth={1} dashed dashSize={0.5} gapSize={0.35} />;
}

/** Wskaźnik ślizgu (kulka w rurce) – jak w kokpicie: kulka w środku = lot skoordynowany. */
function SlipBall({ ball }: { ball: number }) {
  const ok = Math.abs(ball) < 0.15;
  return (
    <svg viewBox="-110 -30 220 70" style={{ width: '100%', maxWidth: 260 }}>
      <path d="M-90,-14 Q0,26 90,-14" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="26" strokeLinecap="round" />
      <path d="M-90,-14 Q0,26 90,-14" fill="none" stroke="#0b1020" strokeWidth="22" strokeLinecap="round" />
      <line x1="-16" x2="-16" y1="-6" y2="20" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      <line x1="16" x2="16" y1="-6" y2="20" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      <circle cx={ball * 70} cy={6 - ball * ball * 14} r="10" fill={ok ? '#4ade80' : '#facc15'} />
      <text x="0" y="38" fill="rgba(255,255,255,0.6)" fontSize="11" textAnchor="middle">
        {ok ? 'kulka w środku – lot skoordynowany' : `ślizg – potrzebny ${ball > 0 ? 'prawy' : 'lewy'} pedał`}
      </text>
    </svg>
  );
}

/** Mały wykres przebiegu w czasie (SVG w ramce). */
function TimeChart({ data, color, range, label }: { data: number[]; color: string; range: number; label: string }) {
  const W = 300;
  const H = 90;
  const pts = data.map((v, i) => `${((i / Math.max(1, data.length - 1)) * W).toFixed(1)},${(H / 2 - (clamp(v, -range, range) / range) * (H / 2 - 4)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,0.25)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
      <text x="4" y={H + 11} fontSize="10" fill="rgba(255,255,255,0.6)">
        {label}
      </text>
    </svg>
  );
}

/** Wyświetlacz główny kapitana z bieżącą pozą samolotu; slip – wskaźnik ślizgu (−1…1, dodatnio w prawo), czytany co odświeżenie. */
function PosePfd({ pose, ias = 280, alt = 10000, vs = 0, slip, fctl, trim, extra }: { pose: PoseState; ias?: number; alt?: number; vs?: number; slip?: () => number; fctl?: boolean; trim?: () => number; extra?: ReactNode }) {
  useTick(15);
  const hdg = (((-pose.yaw % 360) + 360) % 360);
  return (
    <CockpitDock>
      <Pfd pitch={pose.alpha} bank={-pose.bank} ias={ias} iasTarget={ias} mach={ias / 575} alt={alt} altSel={Math.round(alt / 1000) * 1000} vs={vs} heading={hdg} track={hdg} slip={slip ? slip() : 0} fma={['SPEED', 'ALT', 'HDG', '', '1FD2\nA/THR']} width={260} />
      {fctl && <FctlEcam surf={pose.surf} trim={trim} />}
      {extra}
    </CockpitDock>
  );
}

const R2D = 180 / Math.PI;
/**
 * Strona ECAM F/CTL z wychyleń sterów modelu (radiany, te same, które widać na samolocie). Konwencje ECAM: lotki
 * i ster wysokości dodatnio w dół, ster kierunku dodatnio w prawo, trymer statecznika dodatnio „nos w górę”.
 * Spojlery: hamulce aerodynamiczne – wszystkie 7 na skrzydło; przy przechylaniu pomagają lotce spojlery 3–7
 * na skrzydle, które ma opaść (tak jak w modelu: 1,6 × wychylenia lotki).
 */
export function fctlFrom(s: Surfaces, pitchTrim = 0) {
  const sb = Math.max(0, (s.spoiler ?? 0) * R2D);
  const roll = (v: number) => Array.from({ length: 7 }, (_, i) => sb + (i >= 2 ? Math.max(0, v) * 1.6 * R2D : 0));
  return { spL: roll(-s.aileron), spR: roll(s.aileron), ailL: s.aileron * R2D, ailR: -s.aileron * R2D, elev: -s.elevator * R2D, rudder: s.rudder * R2D, pitchTrim };
}
/** Typowy przelot A350-1000 (do dolnego paska ECAM): masa, środek ciężkości, paliwo, temperatury. */
const CRZ_FOOT = { tat: -24, sat: -51, isa: 2, flt: '02:14', gw: 268000, gwcg: 29.4, fob: 61500 };

/** ECAM ze stroną F/CTL z bieżącej pozy sterów (bez hooków – renderowany w HTML, odświeża go rodzic w scenie). */
function FctlEcam({ surf, trim }: { surf: Surfaces; trim?: () => number }) {
  return <Ecam thrMode={['CLB', 92.4]} n1={[84.6, 84.6]} egt={[688, 692]} page="FCTL" fctl={fctlFrom(surf, trim ? trim() : 0.6)} footer={CRZ_FOOT} width={260} />;
}
/** Sam ECAM F/CTL w doku kokpitu (zakładki bez PFD) – odświeżany w scenie kilka razy na sekundę. */
function FctlDock({ surf, trim }: { surf: Surfaces; trim?: () => number }) {
  useTick(10);
  return (
    <CockpitDock>
      <FctlEcam surf={surf} trim={trim} />
    </CockpitDock>
  );
}

/**
 * Strona główna „Usterzenie w ruchu”: ECAM F/CTL zgrany z animacją modelu – ster kierunku, stery wysokości,
 * lotki ze spojlerami i wolny ruch statecznika poziomego (ten sam cykl i ten sam zegar co model).
 */
export function TailHomeCockpit() {
  const t = useRef(0);
  useFrame(({ clock }) => {
    t.current = clock.elapsedTime;
  });
  useTick(12);
  const k = controlCycle(t.current);
  const trim = 0.045 * Math.sin(t.current * 0.45) * R2D;
  return (
    <CockpitDock>
      <Ecam thrMode={['CLB', 92.4]} n1={[84.6, 84.6]} egt={[688, 692]} page="FCTL" fctl={fctlFrom({ aileron: k.ail, elevator: k.elev, rudder: k.rudder, spoiler: 0 }, trim)} footer={CRZ_FOOT} width={260} />
    </CockpitDock>
  );
}

/* ======================= 1. trzy osie i trzy stery ======================= */

function AxesOverlay({ params, pose, direct }: { params: Params; pose: PoseState; direct: DirectPose }) {
  const ail = Number(params.ail ?? 0.5);
  const elev = Number(params.elev ?? 0);
  const rud = Number(params.rud ?? 0);
  const respond = Boolean(params.respond ?? true);
  const forces = Boolean(params.forces ?? true);
  const labels = Boolean(params.labels ?? true);
  const cur = useRef({ bank: 0, alpha: 2, yaw: 0 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const k = 1 - Math.exp(-dt * 1.4);
    const c = cur.current;
    // wychylenie wolantu/pedałów → przechylenie, pochylenie, odchylenie (ustalone kąty, żeby było widać kierunek ruchu)
    c.bank += ((respond ? -ail * 35 : 0) - c.bank) * k;
    c.alpha += ((respond ? 2 + elev * 10 : 2) - c.alpha) * k;
    c.yaw += ((respond ? -rud * 14 : 0) - c.yaw) * k;
    Object.assign(direct, { pivot: CG_REF, lift: 0, bank: c.bank, alpha: c.alpha, yaw: c.yaw });
    Object.assign(direct.surf, { aileron: ail * 0.35, elevator: elev * 0.3, rudder: rud * 0.35, spoiler: 0 });
  });
  const ready = useReady('axes');
  const [cx, cy, cz] = CG_REF;
  const axis = (a: V3, b: V3, color: string) => (
    <>
      <Line points={[a, b]} color={color} lineWidth={3} transparent opacity={0.85} />
      <mesh position={b} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize())}>
        <coneGeometry args={[0.6, 1.8, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
    </>
  );
  // pierścień obrotu wokół osi (łuk z grotem) – pokazuje, w którą stronę obraca dany ster
  const ring = (center: V3, axisDir: 'x' | 'y' | 'z', r: number, color: string) => {
    const pts: V3[] = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 39) * Math.PI * 1.6;
      const u = Math.cos(a) * r;
      const v = Math.sin(a) * r;
      return axisDir === 'x' ? [center[0], center[1] + u, center[2] + v] : axisDir === 'y' ? [center[0] + u, center[1], center[2] + v] : [center[0] + u, center[1] + v, center[2]];
    });
    return <Line points={pts} color={color} lineWidth={2.5} transparent opacity={0.8} />;
  };
  const ap = CONTROL_PTS.aileron;
  const ep = CONTROL_PTS.elevator;
  const rp = CONTROL_PTS.rudder;
  return (
    <>
      <AmbientWind cl={0.5} count={130} opacity={0.4} />
      <FollowPlane pose={pose}>
        <EngineStreams />
        {ready && (
          <>
            {axis([cx + 44, cy, cz], [cx - 46, cy, cz], C_ROLL)}
            {axis([cx, cy, -38], [cx, cy, 38], C_PITCH)}
            {axis([cx, cy - 13, cz], [cx, cy + 20, cz], C_YAW)}
            {ring([cx - 40, cy, cz], 'x', 3.2, C_ROLL)}
            {ring([cx, cy, 34], 'z', 3.2, C_PITCH)}
            {ring([cx, cy + 16, cz], 'y', 3.2, C_YAW)}
            {labels && (
              <>
                <Tag pos={[cx - 49, cy + 2.5, cz]} color={C_ROLL}>
                  oś podłużna – przechylanie (lotki)
                </Tag>
                <Tag pos={[cx, cy + 2.5, 40.5]} color={C_PITCH}>
                  oś poprzeczna – pochylanie (ster wysokości)
                </Tag>
                <Tag pos={[cx, cy + 22.5, cz]} color={C_YAW}>
                  oś pionowa – odchylanie (ster kierunku)
                </Tag>
                <Tag pos={[cx + 1.5, cy - 2, 2.5]}>środek ciężkości</Tag>
              </>
            )}
            <CgMark pos={[cx, cy, 3.25]} r={0.6} />
            {forces && (
              <>
                {/* lotki działają przeciwsobnie: lewa w dół = siła w górę po lewej, prawa w górę = siła w dół po prawej */}
                <Arr from={[ap[0], ap[1] + 0.4, ap[2]]} vec={[0, ail * 6, 0]} color={C_ROLL} />
                <Arr from={mirrorZ([ap[0], ap[1] + 0.4, ap[2]])} vec={[0, -ail * 6, 0]} color={C_ROLL} />
                {/* ster wysokości: drążek do siebie → ster w górę → siła na ogonie w dół → nos w górę */}
                {[ep, mirrorZ(ep)].map((p, i) => (
                  <Arr key={i} from={[p[0], p[1], p[2]]} vec={[0, -elev * 5, 0]} color={C_PITCH} />
                ))}
                {/* ster kierunku: prawy pedał → ogon spychany w lewo → nos w prawo */}
                <Arr from={[rp[0], rp[1], 0.3]} vec={[0, 0, rud * 5]} color={C_YAW} />
                {labels && Math.abs(ail) > 0.05 && (
                  <Tag pos={[ap[0], ap[1] + 1.2 + Math.max(0, ail) * 6, ap[2] + 1]} color={C_ROLL}>
                    lotka {ail > 0 ? '↓' : '↑'}
                  </Tag>
                )}
                {labels && Math.abs(ail) > 0.05 && (
                  <Tag pos={[ap[0], ap[1] + 1.2 + Math.max(0, -ail) * 6, -ap[2] - 1]} color={C_ROLL}>
                    lotka {ail > 0 ? '↑' : '↓'}
                  </Tag>
                )}
              </>
            )}
          </>
        )}
      </FollowPlane>
      <PosePfd pose={pose} fctl />
      <InfoPortal>
        <div>
          <b style={{ color: C_ROLL }}>lotki</b> {fmt(Math.abs(ail) * 20, 0)}° {ail > 0.02 ? '(lewa ↓, prawa ↑ – przechylenie w prawo)' : ail < -0.02 ? '(lewa ↑, prawa ↓ – przechylenie w lewo)' : ''}
        </div>
        <div>
          <b style={{ color: C_PITCH }}>ster wysokości</b> {fmt(Math.abs(elev) * 17, 0)}° {elev > 0.02 ? 'w górę – nos w górę' : elev < -0.02 ? 'w dół – nos w dół' : ''}
        </div>
        <div>
          <b style={{ color: C_YAW }}>ster kierunku</b> {fmt(Math.abs(rud) * 20, 0)}° {rud > 0.02 ? 'w prawo – nos w prawo' : rud < -0.02 ? 'w lewo – nos w lewo' : ''}
        </div>
        <div style={{ opacity: 0.75, fontSize: 12 }}>Strzałki to siły aerodynamiczne na wychylonych sterach. Mała siła na długim ramieniu od środka ciężkości daje duży moment obrotowy.</div>
      </InfoPortal>
    </>
  );
}

/* ======================= 2. lotki i odchylenie niekorzystne ======================= */

function AdverseOverlay({ params, pose, direct }: { params: Params; pose: PoseState; direct: DirectPose }) {
  const a = Number(params.ail ?? 0.6);
  const mode = YAW_MODES[String(params.mode ?? 'brak')] ?? YAW_MODES.brak;
  const t = useRef(0);
  const cur = useRef({ yaw: 0 });
  // siła nośna i opór obu skrzydeł (jak w modelu 2D): lewa lotka w dół przy a > 0
  const liftL = 1 + 0.35 * a;
  const liftR = 1 - 0.35 * a;
  const extraUp = mode.adverse < 1 ? 0.3 * Math.abs(a) : 0;
  const dragL = 0.45 + 0.45 * Math.max(0, a) + (a < 0 ? extraUp : 0) + 0.1 * Math.max(0, -a);
  const dragR = 0.45 + 0.45 * Math.max(0, -a) + (a > 0 ? extraUp : 0) + 0.1 * Math.max(0, a);
  const yawT = a * 12 * mode.adverse; // dodatnie = nos w lewo
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    t.current += dt;
    const wob = Math.sin(t.current * 1.3) * 0.6;
    cur.current.yaw += (yawT - cur.current.yaw) * (1 - Math.exp(-dt * 1.2));
    Object.assign(direct, { pivot: CG_REF, lift: 0, bank: -(a * 30 + wob), alpha: 2.5, yaw: cur.current.yaw });
    // spojlery na opadającym skrzydle pomagają lotkom (tryb „różnicowe/spojlery”)
    Object.assign(direct.surf, { aileron: a * 0.3, elevator: 0.02, rudder: mode.rudder ? a * 0.3 : 0, spoiler: 0 });
  });
  const ready = useReady('adverse');
  const lp = wingPoint(17, 0.3, 0.4);
  const tip = wingPoint(28, 0.95, 0);
  const rp = CONTROL_PTS.rudder;
  const ball = clamp(a * mode.adverse, -1, 1);
  return (
    <>
      <AmbientWind cl={0.5} count={190} opacity={0.6} />
      {ready && (
        <>
          <Line points={[[CG_REF[0] - 4, CG_REF[1] + 4, 0], [-80, CG_REF[1] + 4, 0]]} color="rgba(255,255,255,0.5)" lineWidth={1.5} dashed dashSize={1.2} gapSize={0.8} />
          <Tag pos={[-62, CG_REF[1] + 6, 0]}>kierunek lotu</Tag>
        </>
      )}
      <FollowPlane pose={pose}>
        <EngineStreams />
        {ready && (
          <>
            <Arr from={lp} vec={[0, liftL * 7, 0]} color="#4ade80" radius={0.32} />
            <Arr from={mirrorZ(lp)} vec={[0, liftR * 7, 0]} color="#4ade80" radius={0.32} />
            <Tag pos={[lp[0], lp[1] + liftL * 7 + 1.4, lp[2]]} color="#4ade80">
              L lewe {fmt(liftL * 100, 0)}%
            </Tag>
            <Tag pos={[lp[0], lp[1] + liftR * 7 + 1.4, -lp[2]]} color="#4ade80">
              L prawe {fmt(liftR * 100, 0)}%
            </Tag>
            {/* opór działa do tyłu (+x); większy po stronie skrzydła z opuszczoną lotką */}
            <Arr from={[tip[0] + 1, tip[1], tip[2]]} vec={[dragL * 10, 0, 0]} color="#fb923c" radius={0.3} />
            <Arr from={mirrorZ([tip[0] + 1, tip[1], tip[2]])} vec={[dragR * 10, 0, 0]} color="#fb923c" radius={0.3} />
            <Tag pos={[tip[0] + 2 + dragL * 10, tip[1] + 1.2, tip[2]]} color="#fb923c">
              opór {fmt(dragL * 100, 0)}%
            </Tag>
            <Tag pos={[tip[0] + 2 + dragR * 10, tip[1] + 1.2, -tip[2]]} color="#fb923c">
              opór {fmt(dragR * 100, 0)}%
            </Tag>
            {mode.rudder && Math.abs(a) > 0.02 && <Arr from={[rp[0], rp[1], 0.3]} vec={[0, 0, a * 5]} color={C_YAW} />}
            {/* nitka odchylenia na nosie: odchyla się w stronę napływu */}
            <Line points={[[-34, 2.6, 0], [-31.5, 2.7, 0]]} color="#facc15" lineWidth={3} />
          </>
        )}
      </FollowPlane>
      <PosePfd pose={pose} slip={() => ball} fctl />
      <InfoPortal>
        <div style={{ fontWeight: 700 }}>{mode.name}</div>
        <div>{mode.note}</div>
        <div style={{ color: Math.abs(yawT) < 1 ? '#4ade80' : '#facc15', fontWeight: 600 }}>
          {Math.abs(a) < 0.02 ? 'lot prosty' : Math.abs(yawT) < 1 ? 'nos prowadzi w stronę zakrętu' : `nos ucieka ${yawT > 0 ? 'w lewo' : 'w prawo'} – przeciwnie do przechylenia (β ≈ ${fmt(Math.abs(yawT), 0)}°)`}
        </div>
        <SlipBall ball={ball} />
      </InfoPortal>
    </>
  );
}

/* ======================= 3. równowaga momentów ======================= */

const X_AC = 0.25; // środek aerodynamiczny skrzydła (ułamek SCA)
const X_NP = 0.48; // punkt neutralny całego samolotu
/** Ramię usterzenia poziomego w długościach SCA – z geometrii modelu. */
const TAIL_ARM = (CONTROL_PTS.htpAc[0] - macX(X_AC)) / WING_MAC.mac;
const CM0 = -0.06; // moment pochylający profilu (na nos), w jednostkach ciężar × SCA
const FWD_LIM = 0.15;
const AFT_LIM = 0.38;

function balance(xcg: number) {
  const xt = X_AC + TAIL_ARM;
  const Lw = (xt - xcg - CM0) / (xt - X_AC);
  return { Lw, Lt: 1 - Lw, sm: X_NP - xcg };
}

function CmChart({ sm, color }: { sm: number; color: string }) {
  const W = 300;
  const H = 150;
  const GX = (al: number) => 20 + ((al + 4) / 18) * (W - 30);
  const GY = (cm: number) => H / 2 - (cm / 0.3) * (H / 2 - 10);
  const line = (s: number) => [-4, 14].map((al, i) => `${i ? 'L' : 'M'}${GX(al)},${GY(clamp(-0.1 * s * (al - 4), -0.3, 0.3))}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      <line x1="20" x2={W - 10} y1={GY(0)} y2={GY(0)} stroke="rgba(255,255,255,0.35)" />
      <path d={line(X_NP - FWD_LIM)} stroke="rgba(255,255,255,0.2)" strokeDasharray="5 5" fill="none" />
      <path d={line(X_NP - AFT_LIM)} stroke="rgba(255,255,255,0.2)" strokeDasharray="5 5" fill="none" />
      <path d={line(sm)} stroke={color} strokeWidth="3" fill="none" />
      <circle cx={GX(4)} cy={GY(0)} r="5" fill={color} />
      <text x="24" y="14" fontSize="10" fill="rgba(255,255,255,0.55)">
        + nos w górę
      </text>
      <text x="24" y={H - 6} fontSize="10" fill="rgba(255,255,255,0.55)">
        − nos w dół
      </text>
      <text x={GX(4) + 7} y={GY(0) - 6} fontSize="10" fill="rgba(255,255,255,0.6)">
        trym
      </text>
      <text x={W / 2} y={H + 13} fontSize="10" fill="rgba(255,255,255,0.6)" textAnchor="middle">
        moment C<tspan baselineShift="sub">m</tspan> w funkcji kąta natarcia α (−4°…14°)
      </text>
    </svg>
  );
}

function BalanceOverlay({ params, pose, direct }: { params: Params; pose: PoseState; direct: DirectPose }) {
  const cgPct = Number(params.cg ?? 25);
  const xcg = cgPct / 100;
  const { Lw, Lt, sm } = balance(xcg);
  const t = useRef(0);
  useFrame((_, dtRaw) => {
    t.current += Math.min(0.05, dtRaw);
    // ogon dociskany w dół → statecznik/ster ustawiony „nosem w górę” (trym)
    Object.assign(direct, { pivot: [macX(xcg), CG_REF[1], 0] as V3, lift: 0.15 * Math.sin(t.current * 1.2), bank: 0, alpha: 2, yaw: 0 });
    Object.assign(direct.surf, { aileron: 0, elevator: clamp(-Lt * 2.2, -0.3, 0.3), rudder: 0, spoiler: 0 });
  });
  const ready = useReady('balance');
  const status = sm < 0 ? { t: 'NIESTATECZNY – środek ciężkości za punktem neutralnym', c: '#f87171' } : sm < 0.05 ? { t: 'prawie obojętny – samolot „nerwowy”', c: '#facc15' } : xcg < FWD_LIM ? { t: 'stateczny, ale za ciężki na nos – brak steru do wyrównania', c: '#facc15' } : { t: 'stateczny', c: '#4ade80' };
  const xCg = macX(xcg);
  const xAc = macX(X_AC);
  const xNp = macX(X_NP);
  const ht = CONTROL_PTS.htpAc;
  const Z = 3.3; // strzałki przy lewej burcie, żeby kadłub ich nie zasłaniał
  const S = 9; // długość strzałki ciężaru (= 100%)
  return (
    <>
      <AmbientWind cl={0.5} count={150} opacity={0.5} />
      <FollowPlane pose={pose}>
        <EngineStreams />
        {ready && (
          <>
            <ActionLine x={xCg} y0={-4.8} y1={3.6} z={Z} />
            <ActionLine x={xAc} y0={-4.8} y1={3.6} z={Z} />
            <CgMark pos={[xCg, CG_REF[1], Z]} r={0.62} />
            <Arr from={[xCg, -4.8, Z]} vec={[0, -S, 0]} color="#f87171" radius={0.35} />
            <Tag pos={[xCg + 2, -4.8 - S - 0.6, Z]} color="#f87171">
              Q – ciężar (100%)
            </Tag>
            <Arr from={[xAc, 3.6, Z]} vec={[0, Lw * S, 0]} color="#4ade80" radius={0.35} />
            <Tag pos={[xAc - 2.5, 3.6 + Lw * S + 1.2, Z]} color="#4ade80">
              L skrzydła = {fmt(Lw * 100, 1)}% Q
            </Tag>
            {/* siła na usterzeniu: mała, więc strzałka ×8 */}
            <Arr from={[ht[0], ht[1] + (Lt < 0 ? -0.6 : 0.6), ht[2]]} vec={[0, Lt * S * 8, 0]} color={Lt < 0 ? '#facc15' : '#38bdf8'} radius={0.3} />
            <Tag pos={[ht[0] + 2, ht[1] + Lt * S * 8 + (Lt < 0 ? -1.4 : 1.4), ht[2]]} color={Lt < 0 ? '#facc15' : '#38bdf8'}>
              usterzenie {Lt < 0 ? '↓ dociska' : '↑ unosi'} {fmt(Math.abs(Lt) * 100, 1)}% Q (×8)
            </Tag>
            <Tag pos={[xAc - 4, 1.2, Z]} color="#c084fc">
              moment profilu M₀ – nos w dół
            </Tag>
            <MacBar
              y={-18}
              z={Z}
              ranges={[
                { a: FWD_LIM, b: AFT_LIM, color: '#16a34a' },
                { a: X_NP, b: 0.75, color: '#b91c1c' },
              ]}
              marks={[
                { f: X_AC, color: '#4ade80', label: 'środek aerodynamiczny 25%' },
                { f: X_NP, color: '#c084fc', label: 'punkt neutralny 48%', kind: 'np' },
              ]}
            />
            <CgMark pos={[xCg, -17.3, Z]} r={0.5} />
            <Tag pos={[xCg, -15.9, Z + 0.6]} color={status.c}>
              SC {fmt(cgPct, 0)}%
            </Tag>
          </>
        )}
      </FollowPlane>
      {/* trymer statecznika: im większy docisk ogona, tym bardziej „nos w górę” (zakres A350 ok. −4…+13,5°) */}
      <FctlDock surf={pose.surf} trim={() => clamp(-Lt * 40, -4, 13.5)} />
      <InfoPortal>
        <div style={{ color: status.c, fontWeight: 700 }}>{status.t}</div>
        <div>
          środek ciężkości {fmt(cgPct, 0)}% SCA (SCA = {fmt(WING_MAC.mac, 1)} m) · zapas stateczności statycznej {fmt(sm * 100, 0)}% SCA
        </div>
        <div>
          usterzenie {Lt < 0 ? 'dociska ogon w dół' : 'unosi ogon'} siłą {fmt(Math.abs(Lt) * 100, 1)}% ciężaru, więc skrzydło niesie {fmt(Lw * 100, 1)}% ciężaru
          {Lw > 1 ? ' – to dodatkowy opór (opór wyważenia).' : '.'}
        </div>
        <CmChart sm={sm} color={status.c} />
        <div style={{ fontSize: 12, color: status.c }}>{sm > 0 ? 'nachylenie ujemne → moment przywraca trym' : 'nachylenie dodatnie → moment pogłębia wytrącenie'}</div>
      </InfoPortal>
    </>
  );
}

/* ======================= 4. podmuch – stateczność dynamiczna ======================= */

/** Tory podmuchu wznoszącego: powietrze uderza w samolot od dołu (i przesuwa się do tyłu względem samolotu). */
function useGustPaths() {
  return useMemo(() => {
    const out: V3[][] = [];
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 46; k++) {
      const x0 = -30 + rnd() * 60;
      const z0 = -30 + rnd() * 60;
      out.push(Array.from({ length: 12 }, (_, i) => [x0 + i * 1.4, -22 + i * 3.2, z0] as V3));
    }
    return out;
  }, []);
}

function GustOverlay({ params, pose, direct }: { params: Params; pose: PoseState; direct: DirectPose }) {
  const cgPct = Number(params.cg ?? 25);
  const fbw = Boolean(params.fbw ?? false);
  const sm = X_NP - cgPct / 100;
  const K = 150; // sztywność aerodynamiczna na 1 SCA zapasu (1/s²)
  const w2 = K * sm + (fbw ? 25 : 0);
  const damp = 2.5 + (fbw ? 4 : 0);
  const st = useRef({ a: 0, q: 0, nextGust: 1.2, lastGust: -10, lost: -1, hist: [] as number[], acc: 0, simT: 0 });
  const gust = useRef<THREE.Group>(null);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const s = st.current;
    const sim = dt * 0.5; // czas symulacji płynie 2× wolniej, żeby było widać ruch
    s.simT += sim;
    if (s.lost < 0) {
      if (s.simT > s.nextGust) {
        s.q += 75;
        s.lastGust = s.simT;
        s.nextGust = s.simT + 3;
      }
      for (let i = 0; i < 4; i++) {
        const acc = -w2 * s.a - damp * s.q;
        s.q += acc * (sim / 4);
        s.a += s.q * (sim / 4);
      }
      if (Math.abs(s.a) > 35) s.lost = s.simT;
    } else if (s.simT - s.lost > 1.2) {
      Object.assign(s, { a: 0, q: 0, lost: -1, nextGust: s.simT + 1 });
    }
    s.acc += dt;
    while (s.acc > 1 / 30) {
      s.acc -= 1 / 30;
      s.hist.push(s.a);
      if (s.hist.length > 270) s.hist.shift();
    }
    if (gust.current) gust.current.visible = s.simT - s.lastGust < 0.9;
    Object.assign(direct, { pivot: [macX(cgPct / 100), CG_REF[1], 0] as V3, lift: 0, bank: 0, alpha: 2 + clamp(s.a, -40, 40), yaw: 0 });
    // komputer wychyla ster wysokości przeciw wytrąceniu
    Object.assign(direct.surf, { aileron: 0, elevator: fbw ? clamp(-s.a * 0.03, -0.3, 0.3) : 0, rudder: 0, spoiler: 0 });
  });
  useTick(10);
  const ready = useReady('gust');
  const paths = useGustPaths();
  const s = st.current;
  const xNp = macX(X_NP);
  const xCg = macX(cgPct / 100);
  const Z = 3.3;
  const zeta = w2 > 0 ? damp / (2 * Math.sqrt(w2)) : 0;
  return (
    <>
      <AmbientWind cl={0.5} count={140} opacity={0.45} />
      <group ref={gust} visible={false}>
        <PathStreaks paths={paths} count={160} color="#7dd3fc" speed={28} trail={5} width={0.18} opacity={0.9} />
      </group>
      {/* podpis HTML nie chowa się razem z grupą – pokazywany przez stan odświeżany kilka razy na sekundę */}
      {s.simT - s.lastGust < 0.9 && (
        <Tag pos={[-14, -16, 8]} color="#7dd3fc">
          podmuch wznoszący
        </Tag>
      )}
      <FollowPlane pose={pose}>
        <EngineStreams />
        {ready && (
          <>
            <CgMark pos={[xCg, CG_REF[1], Z]} r={0.62} />
            <NpMark pos={[xNp, -4.6, Z]} />
            <Tag pos={[xNp + 1, -6, Z]} color="#c084fc">
              punkt neutralny
            </Tag>
            {/* przyrost siły nośnej przy zmianie kąta natarcia działa w punkcie neutralnym */}
            <DynArrow get={() => [[xNp, 3.6, Z], [0, clamp(st.current.a * 0.8, -9, 9), 0]]} color={sm > 0 ? '#4ade80' : '#f87171'} radius={0.32} />
            {fbw && <DynArrow get={() => [[CONTROL_PTS.htpAc[0], CONTROL_PTS.htpAc[1] + 0.6, CONTROL_PTS.htpAc[2]], [0, clamp(-st.current.a * 0.6, -6, 6), 0]]} color="#c084fc" radius={0.26} />}
          </>
        )}
      </FollowPlane>
      <PosePfd pose={pose} fctl />
      <InfoPortal>
        <div style={{ fontWeight: 700, color: w2 <= 0 ? '#f87171' : sm < 0 ? '#facc15' : '#4ade80' }}>
          {s.lost >= 0 ? 'wytrącenie narasta – samolot wymyka się spod kontroli' : w2 <= 0 ? 'niestateczny – wychylenie rośnie wykładniczo' : sm < 0 ? 'aerodynamicznie niestateczny, stabilizowany przez komputer' : zeta >= 1 ? 'stateczny, ruch przetłumiony' : 'stateczny – gasnące wahania'}
        </div>
        <div>
          środek ciężkości {fmt(cgPct, 0)}% SCA · zapas {fmt(sm * 100, 0)}% · {w2 > 0 ? `okres wahań ≈ ${fmt((2 * Math.PI) / Math.sqrt(w2), 1)} s, tłumienie ζ = ${fmt(zeta, 2)}` : 'brak położenia równowagi'}
        </div>
        <TimeChart data={s.hist} color={w2 > 0 ? '#4ade80' : '#f87171'} range={30} label={`zmiana pochylenia Δθ(t) – teraz ${fmt(s.a, 1)}°`} />
        <div style={{ opacity: 0.75, fontSize: 12 }}>
          Czas płynie 2× wolniej. Strzałka nad fioletowym znacznikiem to przyrost siły nośnej – działa w punkcie neutralnym. Gdy leży on za środkiem ciężkości, siła obraca nos z powrotem (zielona), gdy przed – pogłębia wytrącenie (czerwona).
          {fbw && ' Fioletowa strzałka na ogonie to korekta steru wysokości od komputera.'}
        </div>
      </InfoPortal>
    </>
  );
}

/* ======================= 5. fugoida ======================= */

/**
 * Fugoida liczona na bieżąco (bez skoków w pętli): oscylator z tłumieniem z doskonałości
 * h'' = −2ζω·h' − ω²·h, ω = √2·g/v, ζ = 1/(√2·L/D). Gdy wahania prawie wygasną, samolot dostaje łagodny podmuch
 * wiatru z przodu (nadwyżka prędkości) i fala zaczyna się od nowa. Na ekranie jeden cykl trwa ok. 16 s.
 */
function PhugoidOverlay({ params, pose, direct }: { params: Params; pose: PoseState; direct: DirectPose }) {
  const vKmh = Number(params.v ?? 500);
  const ld = Number(params.ld ?? 18);
  const V = vKmh / 3.6;
  const om = (Math.SQRT2 * G0) / V;
  const T = (2 * Math.PI) / om;
  const zeta = 1 / (Math.SQRT2 * ld);
  const A = 60; // amplituda po podmuchu (m) – typowa skala lekkiego zaburzenia
  const KV = 0.09; // przesadzenie pionu: 60 m → ok. 5 m na scenie (droga pozioma bez przesadzenia nie zmieściłaby się)
  const VIS_T = 16; // s na ekranie na jeden okres
  const HIST = 260;
  const SPAN = 75; // długość jednego okresu na scenie
  const sim = useRef({ h: 0, hd: 0, t: 0, kickAt: -1e9, hist: [] as number[], acc: 0 });
  const cfg = useRef({ om, zeta, T });
  cfg.current = { om, zeta, T };
  const trail = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(HIST * 3), 3));
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.9 }));
  }, []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const s = sim.current;
    const { om: w, zeta: z, T: per } = cfg.current;
    const simDt = dt * (per / VIS_T);
    s.t += simDt;
    // nowy podmuch, gdy fala prawie wygasła (albo na starcie): skok prędkości pionowej toru, wysokość bez skoku
    const amp = Math.hypot(s.h, s.hd / w);
    if (amp < 0.25 * A && s.t - s.kickAt > 1.2 * per) {
      s.hd += A * w * 0.9;
      s.kickAt = s.t;
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      const h = simDt / n;
      const acc = -2 * z * w * s.hd - w * w * s.h;
      s.hd += acc * h;
      s.h += s.hd * h;
    }
    // historia wysokości w równych odstępach czasu symulacji (1,6 okresu na całą długość toru)
    s.acc += simDt;
    const step = (1.6 * per) / HIST;
    while (s.acc > step) {
      s.acc -= step;
      s.hist.push(s.h);
      if (s.hist.length > HIST) s.hist.shift();
    }
    // pochylenie = kąt toru lotu (rzeczywisty, bez przesadzania) + stały kąt natarcia
    const gamma = Math.atan(s.hd / V) / DEG;
    Object.assign(direct, { pivot: CG_REF, lift: s.h * KV, bank: 0, alpha: 2 + gamma, yaw: 0 });
    Object.assign(direct.surf, { aileron: 0, elevator: 0, rudder: 0, spoiler: 0 });
    const pa = trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    const L = s.hist.length;
    for (let i = 0; i < HIST; i++) {
      const k = Math.max(0, L - 1 - i);
      const hv = L ? s.hist[k] : 0;
      pa.setXYZ(i, CG_REF[0] + (i / HIST) * 1.6 * SPAN, CG_REF[1] + hv * KV, 0);
    }
    pa.needsUpdate = true;
    trail.geometry.setDrawRange(0, Math.max(2, Math.min(HIST, L)));
  });
  useTick(8);
  const sp = useSpeed();
  const ready = useReady('phugoid');
  const s = sim.current;
  const dv = (-G0 * s.h) / V; // wymiana energii: wyżej → wolniej
  const Ek = 0.5 * (V + dv) ** 2 - 0.5 * V * V;
  const Ep = G0 * s.h;
  const eMax = G0 * A;
  const halfCycles = zeta > 0 ? Math.log(2) / (2 * Math.PI * zeta) : Infinity;
  const kicked = s.t - s.kickAt < 0.25 * T;
  const yTop = CG_REF[1] + A * KV;
  const yBot = CG_REF[1] - A * KV;
  const bar = (v: number, c: string, label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
      <div style={{ position: 'relative', height: 70, width: 34, background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(255,255,255,0.3)' }} />
        <div style={{ position: 'absolute', left: 3, right: 3, borderRadius: 3, background: c, ...(v >= 0 ? { bottom: '50%', height: `${clamp(v / eMax, 0, 1) * 50}%` } : { top: '50%', height: `${clamp(-v / eMax, 0, 1) * 50}%` }) }} />
      </div>
      <span style={{ fontSize: 11, color: c }}>{label}</span>
    </div>
  );
  return (
    <>
      <AmbientWind cl={0.5} count={150} opacity={0.45} />
      {ready && (
        <>
          <primitive object={trail} />
          <Line points={[[-90, CG_REF[1], 0], [130, CG_REF[1], 0]]} color="rgba(255,255,255,0.3)" lineWidth={1} dashed dashSize={1.2} gapSize={0.8} />
          <Line points={[[-20, yTop, 0], [130, yTop, 0]]} color="rgba(250,204,21,0.3)" lineWidth={1} dashed dashSize={0.6} gapSize={0.9} />
          <Line points={[[-20, yBot, 0], [130, yBot, 0]]} color="rgba(125,211,252,0.3)" lineWidth={1} dashed dashSize={0.6} gapSize={0.9} />
          <Tag pos={[96, CG_REF[1] + 1.2, 0]} color="#94a3b8">
            wysokość wyważenia
          </Tag>
          <Tag pos={[70, yTop + 1.4, 0]} color="#facc15">
            szczyt: wyżej i najwolniej
          </Tag>
          <Tag pos={[70, yBot - 1.4, 0]} color="#7dd3fc">
            dołek: niżej i najszybciej
          </Tag>
          {kicked && (
            <Tag pos={[CG_REF[0] - 30, CG_REF[1] + 7, 0]} color="#fb923c">
              podmuch – samolot przyspieszył
            </Tag>
          )}
        </>
      )}
      <FollowPlane pose={pose}>
        <EngineStreams />
      </FollowPlane>
      <PosePfd pose={pose} ias={(V + dv) * 1.944} alt={10000 + s.h * 3.281} vs={s.hd * 196.85} />
      <InfoPortal>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ flex: 2 }}>
            <div style={{ color: '#facc15' }}>
              prędkość {sp.fmt(V + dv)} ({dv >= 0 ? '+' : '−'}
              {sp.fmt(Math.abs(dv))})
            </div>
            <div style={{ color: '#7dd3fc' }}>
              wysokość {s.h >= 0 ? '+' : '−'}
              {fmt(Math.abs(s.h), 0)} m · pionowo {sp.fmt(s.hd, 1)}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>animacja przyspieszona ×{fmt(T / VIS_T, 1)} · pion na rysunku powiększony</div>
          </div>
          {bar(Ek, '#facc15', 'kinetyczna')}
          {bar(Ep, '#7dd3fc', 'potencjalna')}
        </div>
        <div>
          okres fugoidy <b>T ≈ π·√2·v / g = {fmt(T, 0)} s</b> (przy {sp.fmt(V)})
        </div>
        <div>
          tłumienie ζ ≈ 1 / (√2 · L/D) = {fmt(zeta, 3)} · amplituda maleje o połowę po ok. {isFinite(halfCycles) ? fmt(halfCycles, 1) : '∞'} okresach
        </div>
        <div style={{ opacity: 0.75, fontSize: 12 }}>Suma energii prawie się nie zmienia – samolot wymienia prędkość na wysokość i z powrotem. Wzory Lanchestera (1908): przybliżone, ale zaskakująco dobre dla samolotów pasażerskich.</div>
      </InfoPortal>
    </>
  );
}

/* ======================= 6. wznios i statecznik pionowy ======================= */

/** Dwa osobne doświadczenia: przechylenie (stateczność poprzeczna, wznios) i odchylenie (stateczność kierunkowa). */
export const LATERAL_EXP_OPTIONS = [
  { value: 'roll', label: 'przechylenie – wznios' },
  { value: 'yaw', label: 'odchylenie – statecznik' },
];
/** Kamera zakładki: przechylenie oglądamy od tyłu, odchylenie – z góry. */
export const lateralView = (p: Params) =>
  String(p.exp ?? 'roll') === 'yaw'
    ? // z góry, nos w lewo, kadłub poziomo na ekranie; samolot przesunięty w prawo, dalej od ramki z danymi
      { camera: [-18, 118, 30] as V3, target: [-18, 0, -8] as V3 }
    : // od tyłu i lekko z góry – widać przechylenie i ukośne smugi bocznego napływu
      { camera: [88, 20, 12] as V3, target: [0, 0, 7] as V3 };

/**
 * Smugi napływu przy ślizgu: powietrze nadlatuje z ukosa, od strony opuszczonego skrzydła.
 * Tory są stałe (proste wzdłuż lotu), a całe pole smug płynnie obraca się o kąt ślizgu – cząstki nie przeskakują.
 * getSlip() zwraca −1…1 (znak = strona), czytane co klatkę.
 */
function SideWind({ getSlip }: { getSlip: () => number }) {
  const g = useRef<THREE.Group>(null);
  const paths = useMemo(() => {
    const out: V3[][] = [];
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 60; k++) {
      const y0 = -10 + rnd() * 20;
      const z0 = -40 + rnd() * 80;
      out.push([
        [-60, y0, z0],
        [70, y0, z0],
      ]);
    }
    return out;
  }, []);
  useFrame((_, dt) => {
    const G = g.current;
    if (!G) return;
    // obrót wokół pionu: kierunek smug (cos θ, 0, −sin θ), θ ≈ atan(0,3 · ślizg); wygładzony
    const want = Math.atan(0.3 * clamp(getSlip(), -1, 1));
    G.rotation.y += (want - G.rotation.y) * Math.min(1, dt * 6);
  });
  return (
    <group ref={g}>
      <PathStreaks paths={paths} count={200} color="#9bd7ff" speed={40} trail={8} width={0.2} opacity={0.55} />
    </group>
  );
}

function LateralOverlay({ params, pose, direct }: { params: Params; pose: PoseState; direct: DirectPose }) {
  const exp = String(params.exp ?? 'roll') === 'yaw' ? 'yaw' : 'roll';
  const dih = Number(params.dih ?? 5.5);
  const lay = LAYOUTS[String(params.layout ?? 'dolno')] ?? LAYOUTS.dolno;
  const fin = Number(params.fin ?? 1);
  // wznios efektywny: geometryczny + efekt położenia skrzydła (górnopłat ok. +3°, dolnopłat ok. −3°)
  const gEff = dih + lay.eff;
  // stateczność kierunkowa: statecznik pionowy (za środkiem ciężkości) minus kadłub (destabilizuje, głównie przód)
  const nB = fin - 0.35;
  const st = useRef({ exp, t: 0, phi: 0, p: 0, psi: 0, r: 0, next: 1.5, hold: -1, side: 1, hist: [] as number[], acc: 0 });
  if (st.current.exp !== exp) Object.assign(st.current, { exp, phi: 0, p: 0, psi: 0, r: 0, hold: -1, next: st.current.t + 1.2, hist: [] });
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const s = st.current;
    s.t += dt;
    if (s.hold < 0) {
      // co 8 s podmuch: w doświadczeniu „przechylenie” przechyla samolot, w „odchyleniu” obraca nos
      if (s.t > s.next) {
        // podmuch na przemian z lewej i z prawej – samolot przechyla się o ok. 20° / obraca nos o ok. 12°
        if (exp === 'roll') s.p += 40 * s.side;
        else s.r += 30 * s.side;
        s.side = -s.side;
        s.next = s.t + 8;
      }
      for (let i = 0; i < 6; i++) {
        const h = dt / 6;
        if (exp === 'roll') {
          s.p += (-0.6 * gEff * s.phi - 1.2 * s.p) * h;
          s.phi += s.p * h;
        } else {
          s.r += (-3 * nB * s.psi - 1.4 * s.r) * h;
          s.psi += s.r * h;
        }
      }
      if (Math.abs(s.phi) > 45 || Math.abs(s.psi) > 40) s.hold = s.t;
    } else if (s.t - s.hold > 1.5) {
      Object.assign(s, { phi: 0, p: 0, psi: 0, r: 0, hold: -1, next: s.t + 1 });
    }
    s.acc += dt;
    while (s.acc > 1 / 20) {
      s.acc -= 1 / 20;
      s.hist.push(exp === 'roll' ? s.phi : s.psi);
      if (s.hist.length > 240) s.hist.shift();
    }
    Object.assign(direct, { pivot: CG_REF, lift: 0, bank: s.phi, alpha: 2, yaw: s.psi });
    Object.assign(direct.surf, { aileron: 0, elevator: 0, rudder: 0, spoiler: 0 });
  });
  useTick(8);
  const ready = useReady(`lateral-${exp}`);
  const s = st.current;
  // przechylenie: bank > 0 – opuszczone lewe skrzydło (+z); samolot zsuwa się w jego stronę (ślizg β ≈ ½ φ)
  const lowZ = s.phi >= 0 ? 1 : -1;
  const beta = Math.abs(s.phi) * 0.5;
  // boczny napływ zmienia kąt natarcia skrzydeł przy wzniosie: Δα ≈ β · sin Γ (opuszczone +, uniesione −)
  const dA = beta * Math.sin(gEff * DEG);
  const wy = (z: number) => -1.55 + lay.wingY + Math.tan(dih * DEG) * (Math.abs(z) - 3);
  const lpL: V3 = [-1, wy(16) + 0.6, 16];
  const lpR: V3 = [-1, wy(16) + 0.6, -16];
  // strzałki siły nośnej: różnica przesadzona (ok. 10% wydłużenia na 0,1° zmiany kąta natarcia), żeby była widoczna
  const dL = clamp(dA, -0.7, 0.7);
  const liftLow = 6 * (1 + dL);
  const liftHigh = 6 * (1 - dL);
  const okRoll = gEff > 0;
  // odchylenie: psi > 0 – nos w lewo (+z). Siła boczna statecznika (za SC) przywraca, kadłub z przodu – obraca dalej
  const vt = CONTROL_PTS.vtpAc;
  const finF = clamp(fin * s.psi * 0.55, -10, 10);
  const fusF = clamp(0.35 * s.psi * 0.55, -10, 10);
  const okYaw = nB > 0;
  const showRoll = exp === 'roll' && ready && beta > 0.6;
  const showYaw = exp === 'yaw' && ready && Math.abs(s.psi) > 0.6;
  return (
    <>
      {exp === 'roll' ? <SideWind getSlip={() => st.current.phi / 30} /> : <AmbientWind cl={0.5} count={150} opacity={0.5} />}
      <FollowPlane pose={pose}>
        {showRoll && (
          <>
            <Arr from={lowZ > 0 ? lpL : lpR} vec={[0, liftLow, 0]} color={okRoll ? '#4ade80' : '#f87171'} radius={0.34} />
            <Arr from={lowZ > 0 ? lpR : lpL} vec={[0, liftHigh, 0]} color="#4ade80" radius={0.34} />
            <Tag pos={[(lowZ > 0 ? lpL : lpR)[0], (lowZ > 0 ? lpL : lpR)[1] + liftLow + 1.4, (lowZ > 0 ? lpL : lpR)[2]]} color={okRoll ? '#4ade80' : gEff < 0 ? '#f87171' : '#facc15'}>
              opuszczone skrzydło: Δα {dA >= 0 ? '+' : '−'}
              {fmt(Math.abs(dA), 1)}°
            </Tag>
            <Tag pos={[(lowZ > 0 ? lpR : lpL)[0], (lowZ > 0 ? lpR : lpL)[1] + liftHigh + 1.4, (lowZ > 0 ? lpR : lpL)[2]]}>
              uniesione: Δα {dA >= 0 ? '−' : '+'}
              {fmt(Math.abs(dA), 1)}°
            </Tag>
            <Tag pos={[-6, -5, lowZ * 30]} color="#7dd3fc">
              boczny napływ – ślizg β ≈ {fmt(beta, 0)}°
            </Tag>
          </>
        )}
        {showYaw && (
          <>
            {fin > 0.05 && <Arr from={[vt[0], 1.6 + (vt[1] - 1.6) * fin, 0]} vec={[0, 0, finF]} color={okYaw ? C_YAW : '#38bdf8'} radius={0.34} />}
            <Arr from={[-27, 1.2, 0]} vec={[0, 0, fusF]} color="#fb923c" radius={0.3} />
            {fin > 0.05 && (
              <Tag pos={[vt[0], 1.6 + (vt[1] - 1.6) * fin + 2, finF + Math.sign(finF) * 1.5]} color={C_YAW}>
                statecznik: siła boczna przywraca nos
              </Tag>
            )}
            <Tag pos={[-27, 3.4, fusF + Math.sign(fusF) * 1.5]} color="#fb923c">
              kadłub z przodu – obraca dalej
            </Tag>
          </>
        )}
      </FollowPlane>
      {/*
        wskaźnik ślizgu: przy przechyleniu samolot zsuwa się w stronę opuszczonego skrzydła (wskaźnik ucieka w tę
        stronę), przy odchyleniu nosa w lewo trzeba prawego pedału – wskaźnik ucieka w prawo
      */}
      <PosePfd pose={pose} slip={() => (exp === 'roll' ? (-st.current.phi * 0.5) / 10 : st.current.psi / 10)} />
      {exp === 'yaw' && ready && (
        <>
          <Line points={[[CG_REF[0] - 4, CG_REF[1] + 6, 0], [-70, CG_REF[1] + 6, 0]]} color="rgba(255,255,255,0.45)" lineWidth={1.5} dashed dashSize={1.2} gapSize={0.8} />
          <Tag pos={[-58, CG_REF[1] + 8, 0]}>kierunek lotu i napływu</Tag>
        </>
      )}
      <InfoPortal>
        {exp === 'roll' ? (
          <>
            <div style={{ fontWeight: 700 }}>
              {lay.name}, wznios {fmt(dih, 1)}° {lay.eff ? `${lay.eff > 0 ? '+' : '−'} ${Math.abs(lay.eff)}° (położenie skrzydła)` : ''} → wznios efektywny {fmt(gEff, 1)}°
            </div>
            <div style={{ color: okRoll ? '#4ade80' : gEff < 0 ? '#f87171' : '#facc15', fontWeight: 600 }}>
              {s.hold >= 0 ? 'przechylenie narasta – samolot sam się nie wyprostuje' : okRoll ? 'stateczny poprzecznie – samolot sam wraca do poziomu' : gEff < 0 ? 'niestateczny – przechylenie narasta' : 'obojętny – przechylenie zostaje'}
            </div>
            <div>
              przechylenie φ = {fmt(Math.abs(s.phi), 1)}° · ślizg β ≈ {fmt(beta, 1)}° · zmiana kąta natarcia skrzydeł ±{fmt(Math.abs(dA), 2)}°
            </div>
            <TimeChart data={s.hist} color={okRoll ? '#4ade80' : '#f87171'} range={45} label="przechylenie φ(t) – co 8 s podmuch przechyla samolot" />
            <div style={{ opacity: 0.75, fontSize: 12 }}>Górnopłat działa jak wahadło: kadłub „wisi” pod skrzydłem i dodaje ok. 3° wzniosu, dolnopłat odejmuje. A350 to dolnopłat z wzniosem ok. 5,5°. Różnica długości zielonych strzałek jest na rysunku przesadzona – w rzeczywistości to kilka procent siły nośnej, ale na rozpiętości 65 m daje duży moment.</div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700 }}>
              statecznik pionowy ×{fmt(fin, 2)} kontra kadłub (ok. ×0,35)
            </div>
            <div style={{ color: okYaw ? '#4ade80' : '#f87171', fontWeight: 600 }}>
              {s.hold >= 0 ? 'samolot obraca się bokiem – statecznik za mały' : okYaw ? 'stateczny kierunkowo – nos wraca w stronę napływu' : 'niestateczny kierunkowo – kadłub przeważa'}
            </div>
            <div>kąt ślizgu β = {fmt(Math.abs(s.psi), 1)}° · siła statecznika ×{fmt(fin, 2)}, kadłuba ×0,35</div>
            <TimeChart data={s.hist} color={okYaw ? '#4ade80' : '#f87171'} range={40} label="kąt ślizgu β(t) – co 8 s podmuch obraca nos" />
            <div style={{ opacity: 0.75, fontSize: 12 }}>Statecznik leży daleko za środkiem ciężkości – jego siła boczna ma długie ramię i obraca nos z powrotem pod wiatr (efekt wiatrowskazu). Przód kadłuba działa odwrotnie.</div>
          </>
        )}
      </InfoPortal>
    </>
  );
}

/* ======================= 7. masa i wyważenie ======================= */

/** Dane A350-1000 (przybliżone): masy w kg, ramiona jako x w układzie modelu (m, nos w −x). */
const MB = {
  dow: 158000,
  dowF: 0.3, // środek ciężkości samolotu gotowego do lotu (bez ładunku i paliwa): 30% SCA
  pax: 95, // pasażer z bagażem podręcznym
  mzfw: 223000,
  mtow: 319000,
  front: { x0: -31.5, x1: -22.5, rows: 12, cols: 4, max: 46, halfW: 1.9 }, // klasa biznes
  rear: { x0: -20, x1: 21, rows: 36, cols: 9, max: 324, halfW: 2.45 }, // klasa ekonomiczna
  fwdHold: { x0: -25, x1: -11, max: 25000 },
  aftHold: { x0: 7, x1: 19, max: 20000 },
  fuelMax: 125000,
};

/*
 * Zbiorniki paliwa A350-1000 (przybliżone): lewy i prawy w skrzydłach, między dźwigarami, od boku kadłuba prawie do
 * końcówki (dalej zbiornik odpowietrzający), oraz centralny w centropłacie pod podłogą kabiny. Tankowanie: najpierw
 * skrzydła, potem centralny; w locie centralny zużywany jest pierwszy. Paliwo w skrzydle wypełniamy od kadłuba na
 * zewnątrz – skrzydło ma skos, więc im więcej paliwa, tym dalej do tyłu jego środek ciężkości.
 */
const TANK = { s0: 0.15, s1: 0.6, r0: 3.3, r1: 25.5, wingMax: 41000, centerMax: 43000, n: 28 };
type TankSec = { pts: V3[]; x: number };
/** Przekroje zbiornika skrzydłowego (lewego): 4 narożniki – góra przód, góra tył, dół tył, dół przód – lekko wsunięte w poszycie. */
const wingTankSections = (() => {
  const out: { r: number; sec: TankSec; area: number }[] = [];
  for (let i = 0; i <= TANK.n; i++) {
    const r = TANK.r0 + ((TANK.r1 - TANK.r0) * i) / TANK.n;
    const tf = wingSurface(r, TANK.s0, 1);
    const tr = wingSurface(r, TANK.s1, 1);
    const br = wingSurface(r, TANK.s1, -1);
    const bf = wingSurface(r, TANK.s0, -1);
    const pts = [tf, tr, br, bf];
    const c = pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4] as V3, [0, 0, 0] as V3);
    const ins = pts.map((p) => [c[0] + (p[0] - c[0]) * 0.9, c[1] + (p[1] - c[1]) * 0.85, p[2]] as V3);
    const area = (tr[0] - tf[0]) * ((tf[1] - bf[1] + (tr[1] - br[1])) / 2);
    out.push({ r, sec: { pts: ins, x: c[0] }, area });
  }
  // objętość odcinków między przekrojami (do wypełniania i środka ciężkości paliwa)
  const seg = out.slice(1).map((o, i) => ({ v: ((o.area + out[i].area) / 2) * (o.r - out[i].r), x: (o.sec.x + out[i].sec.x) / 2 }));
  return { secs: out, seg, vol: seg.reduce((a, q) => a + q.v, 0) };
})();
/** Zbiornik centralny: skrzynia centropłata między dźwigarami, na szerokość kadłuba. */
const CENTER_TANK = (() => {
  const f = wingSurface(TANK.r0, TANK.s0, 1);
  const r = wingSurface(TANK.r0, TANK.s1, 1);
  const b = wingSurface(TANK.r0, 0.35, -1);
  return { x0: f[0] + 0.2, x1: r[0] - 0.2, y0: b[1] + 0.1, y1: Math.min(f[1], PLANE_LEVELS.floor) - 0.15, halfW: 2.6 };
})();

/** Podział paliwa: skrzydła po równo do pełna, reszta do centralnego. Ramiona (x) z faktycznie wypełnionej części. */
function fuelSplit(fuel: number) {
  const wing = Math.min(fuel, 2 * TANK.wingMax) / 2;
  const center = Math.max(0, fuel - 2 * TANK.wingMax);
  const fw = wing / TANK.wingMax;
  const fc = center / TANK.centerMax;
  // wypełnienie od kadłuba: odcinki do objętości fw·V (ostatni częściowo)
  let left = fw * wingTankSections.vol;
  let vSum = 0;
  let mx = 0;
  let reach = 0; // ile odcinków (z ułamkiem) jest wypełnionych
  for (const q of wingTankSections.seg) {
    if (left <= 0) break;
    const take = Math.min(q.v, left);
    vSum += take;
    mx += take * q.x;
    reach += take / q.v;
    left -= take;
  }
  const wingX = vSum > 0 ? mx / vSum : wingTankSections.seg[0].x;
  const centerX = (CENTER_TANK.x0 + CENTER_TANK.x1) / 2;
  const moment = 2 * wing * wingX + center * centerX;
  return { wing, center, fw, fc, reach, wingX, centerX, x: fuel > 0 ? moment / fuel : centerX, moment };
}

/** Bryła zbiornika skrzydłowego od kadłuba do „reach” odcinków (ułamek dopuszczalny); mirror – prawe skrzydło. */
function wingTankGeometry(reach: number, mirror: boolean) {
  const S = wingTankSections.secs;
  const full = Math.floor(reach);
  const secs: V3[][] = S.slice(0, full + 1).map((q) => q.sec.pts);
  const frac = reach - full;
  if (frac > 1e-3 && full + 1 < S.length) {
    const a = S[full].sec.pts;
    const b = S[full + 1].sec.pts;
    secs.push(a.map((p, i) => [p[0] + (b[i][0] - p[0]) * frac, p[1] + (b[i][1] - p[1]) * frac, p[2] + (b[i][2] - p[2]) * frac] as V3));
  }
  const pos: number[] = [];
  const put = (p: V3) => pos.push(p[0], p[1], mirror ? -p[2] : p[2]);
  const tri = (a: V3, b: V3, c: V3) => {
    put(a);
    put(b);
    put(c);
  };
  for (let i = 0; i + 1 < secs.length; i++) {
    const A = secs[i];
    const B = secs[i + 1];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      tri(A[k], B[k], B[k2]);
      tri(A[k], B[k2], A[k2]);
    }
  }
  if (secs.length > 1) {
    for (const C of [secs[0], secs[secs.length - 1]]) {
      tri(C[0], C[1], C[2]);
      tri(C[0], C[2], C[3]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

const C_FUEL = '#a78bfa';
const xrayMat = (c: string, o: number) => <meshBasicMaterial color={c} transparent opacity={o} depthTest={false} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />;

/** Paliwo w zbiornikach, prześwietlone przez poszycie: obrys całego zbiornika blado, paliwo – wypełnieniem. */
function FuelTanks({ fuel }: { fuel: number }) {
  const f = fuelSplit(fuel);
  const rq = Math.round(f.reach * 50) / 50;
  const outline = useMemo(() => [wingTankGeometry(TANK.n, false), wingTankGeometry(TANK.n, true)], []);
  const filled = useMemo(() => (rq > 0.01 ? [wingTankGeometry(rq, false), wingTankGeometry(rq, true)] : null), [rq]);
  useEffect(() => () => filled?.forEach((g) => g.dispose()), [filled]);
  const ct = CENTER_TANK;
  const L = ct.x1 - ct.x0;
  const H = ct.y1 - ct.y0;
  const hc = H * clamp(f.fc, 0, 1);
  return (
    <group>
      {outline.map((g, i) => (
        <mesh key={`o${i}`} geometry={g} renderOrder={11} raycast={() => null}>
          {xrayMat(C_FUEL, 0.07)}
        </mesh>
      ))}
      {filled?.map((g, i) => (
        <mesh key={`f${rq}-${i}`} geometry={g} renderOrder={12} raycast={() => null}>
          {xrayMat(C_FUEL, 0.55)}
        </mesh>
      ))}
      <mesh position={[ct.x0 + L / 2, ct.y0 + H / 2, 0]} renderOrder={11} raycast={() => null}>
        <boxGeometry args={[L, H, 2 * ct.halfW]} />
        {xrayMat(C_FUEL, 0.07)}
      </mesh>
      {hc > 0.02 && (
        // paliwo w centralnym zbiorniku wypełnia go od dna
        <mesh position={[ct.x0 + L / 2, ct.y0 + hc / 2, 0]} renderOrder={12} raycast={() => null}>
          <boxGeometry args={[L - 0.1, hc, 2 * ct.halfW - 0.1]} />
          {xrayMat(C_FUEL, 0.55)}
        </mesh>
      )}
    </group>
  );
}
/** Obwiednia środka ciężkości: [%SCA, masa w t]. */
const ENVELOPE: [number, number][] = [
  [17, 150],
  [17, 230],
  [21, 319],
  [37, 319],
  [41, 250],
  [41, 150],
];
function inside(poly: [number, number][], x: number, y: number) {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}
const pctOf = (x: number) => ((x - WING_MAC.lemac) / WING_MAC.mac) * 100;

/** Miejsca w strefie kabiny: rzędy wzdłuż kadłuba, kolumny w poprzek, wypełniane od przodu. */
function seatPositions(z: { x0: number; x1: number; rows: number; cols: number; halfW: number }) {
  const out: V3[] = [];
  for (let r = 0; r < z.rows; r++)
    for (let c = 0; c < z.cols; c++) out.push([z.x0 + ((r + 0.5) / z.rows) * (z.x1 - z.x0), PLANE_LEVELS.floor + 0.9, -z.halfW + (c / Math.max(1, z.cols - 1)) * 2 * z.halfW]);
  return out;
}

/** Które miejsca są zajęte: n pasażerów rozsadzonych równomiernie w całej strefie (jak przy przydziale miejsc). */
const seatTaken = (i: number, n: number, max: number) => Math.floor(((i + 1) * n) / max) > Math.floor((i * n) / max);

/** Pasażerowie jako kropki prześwietlone przez poszycie: zajęte – niebieskie, wolne – blade. */
function Seats({ zone, filled }: { zone: (typeof MB)['front']; filled: number }) {
  const pts = useMemo(() => seatPositions(zone).slice(0, zone.max), [zone]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    pts.forEach((p, i) => {
      o.position.set(...p);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(seatTaken(i, filled, pts.length) ? '#38bdf8' : '#334155'));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]} renderOrder={12} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[0.2, 8, 6]} />
      <meshBasicMaterial transparent opacity={0.9} depthTest={false} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/** Luk bagażowy: obrys i wypełnienie od środka proporcjonalnie do masy ładunku (prześwietlone). */
function Hold({ h, kg }: { h: { x0: number; x1: number; max: number }; kg: number }) {
  const L = h.x1 - h.x0;
  const f = clamp(kg / h.max, 0, 1);
  const y = PLANE_LEVELS.cargo + 0.85;
  const xray = (c: string, o: number) => <meshBasicMaterial color={c} transparent opacity={o} depthTest={false} depthWrite={false} toneMapped={false} />;
  return (
    <group renderOrder={11}>
      <mesh position={[h.x0 + L / 2, y, 0]} renderOrder={11}>
        <boxGeometry args={[L, 1.6, 3.6]} />
        {xray('#fb923c', 0.08)}
      </mesh>
      {f > 0.005 && (
        <mesh position={[h.x0 + L / 2, y, 0]} renderOrder={12}>
          <boxGeometry args={[L * f, 1.5, 3.4]} />
          {xray('#fb923c', 0.55)}
        </mesh>
      )}
    </group>
  );
}

function MassOverlay({ params, direct }: { params: Params; direct: DirectPose }) {
  const paxF = Math.round(Number(params.paxF ?? 40));
  const paxR = Math.round(Number(params.paxR ?? 280));
  const cargoF = Number(params.cargoF ?? 12000);
  const cargoR = Number(params.cargoR ?? 8000);
  const fuel = Number(params.fuel ?? 80000);
  const arm = (z: { x0: number; x1: number }) => (z.x0 + z.x1) / 2;
  // pasażerowie siadają od przodu strefy – ramię liczone z faktycznie zajętych rzędów
  const paxArm = (z: (typeof MB)['front'], n: number) => {
    const pts = seatPositions(z).slice(0, z.max).filter((_, i) => seatTaken(i, n, z.max));
    return pts.length ? pts.reduce((s, p) => s + p[0], 0) / pts.length : arm(z);
  };
  const items = [
    { m: MB.dow, x: macX(MB.dowF) },
    { m: paxF * MB.pax, x: paxArm(MB.front, paxF) },
    { m: paxR * MB.pax, x: paxArm(MB.rear, paxR) },
    // kontenery ustawiane od środka luku
    { m: cargoF, x: arm(MB.fwdHold) },
    { m: cargoR, x: arm(MB.aftHold) },
  ];
  const zfw = items.reduce((s, i) => s + i.m, 0);
  const zfwMom = items.reduce((s, i) => s + i.m * i.x, 0);
  const tow = zfw + fuel;
  const fs = fuelSplit(fuel);
  const towMom = zfwMom + fs.moment;
  const zfwX = zfwMom / zfw;
  const towX = towMom / tow;
  const zfwCg = pctOf(zfwX);
  const towCg = pctOf(towX);
  const okZ = inside(ENVELOPE, zfwCg, zfw / 1000) && zfw <= MB.mzfw;
  const okT = inside(ENVELOPE, towCg, tow / 1000) && tow <= MB.mtow;
  // trymer statecznika do startu: SC z przodu → więcej „nos w górę”
  const trim = 2.5 - ((clamp(towCg, 17, 41) - 17) / 24) * 5;
  useFrame(() => {
    Object.assign(direct, { pivot: [macX(0.3), 0, 0] as V3, lift: 0, bank: 0, alpha: 0, yaw: 0 });
    Object.assign(direct.surf, { aileron: 0, elevator: clamp(trim * 0.04, -0.2, 0.2), rudder: 0, spoiler: 0 });
  });
  const ready = useReady('mass');
  const gy = PLANE_LEVELS.ground;
  const sideNote = towCg < 17 || zfwCg < 17 ? 'za daleko do przodu – przy wyrównaniu nad pasem może zabraknąć steru wysokości' : towCg > 41 || zfwCg > 41 ? 'za daleko do tyłu – samolot niestateczny, a na ziemi może nawet usiąść na ogonie' : '';
  // wykres obwiedni
  const W = 300;
  const H = 190;
  const GX = (p: number) => 28 + ((p - 5) / 50) * (W - 38);
  const GY = (t: number) => H - 18 - ((t - 140) / 200) * (H - 30);
  const cZ = { x: GX(clamp(zfwCg, 5, 55)), y: GY(clamp(zfw / 1000, 140, 340)) };
  const cT = { x: GX(clamp(towCg, 5, 55)), y: GY(clamp(tow / 1000, 140, 340)) };
  return (
    <>
      {ready && (
        <>
          <Seats zone={MB.front} filled={paxF} />
          <Seats zone={MB.rear} filled={paxR} />
          <Hold h={MB.fwdHold} kg={cargoF} />
          <Hold h={MB.aftHold} kg={cargoR} />
          <Tag pos={[arm(MB.front), 4.6, 0]} color="#38bdf8">
            biznes {paxF}/{MB.front.max}
          </Tag>
          <Tag pos={[arm(MB.rear), 4.6, 0]} color="#38bdf8">
            ekonomiczna {paxR}/{MB.rear.max}
          </Tag>
          <Tag pos={[arm(MB.fwdHold), PLANE_LEVELS.cargo - 0.6, 3.6]} color="#fb923c">
            luk przedni {fmt(cargoF / 1000, 1)} t
          </Tag>
          <Tag pos={[arm(MB.aftHold), PLANE_LEVELS.cargo - 0.6, 3.6]} color="#fb923c">
            luk tylny {fmt(cargoR / 1000, 1)} t
          </Tag>
          <FuelTanks fuel={fuel} />
          <Tag pos={wingSurface(19, 0.4, 1, 1.4)} color={C_FUEL}>
            zbiorniki w skrzydłach 2 × {fmt(fs.wing / 1000, 1)} t
          </Tag>
          <Tag pos={[(CENTER_TANK.x0 + CENTER_TANK.x1) / 2, CENTER_TANK.y0 - 1.6, 0]} color={C_FUEL}>
            zbiornik centralny {fmt(fs.center / 1000, 1)} t
          </Tag>
          {/* środek ciężkości: bez paliwa (ZFW) i startowy (TOW) */}
          <Arr from={[towX, 10, 0]} vec={[0, -5.4, 0]} color={okT ? '#4ade80' : '#f87171'} radius={0.32} />
          <Tag pos={[towX, 11.3, 0]} color={okT ? '#4ade80' : '#f87171'}>
            SC startowy {fmt(towCg, 1)}% SCA
          </Tag>
          <Arr from={[zfwX, 7.5, 2.2]} vec={[0, -3.6, 0]} color={okZ ? '#38bdf8' : '#f87171'} radius={0.22} />
          <Tag pos={[zfwX, 8.5, 2.2]} color={okZ ? '#38bdf8' : '#f87171'}>
            SC bez paliwa {fmt(zfwCg, 1)}%
          </Tag>
          <MacBar
            y={gy + 0.12}
            z={9}
            ranges={[{ a: 0.17, b: 0.41, color: '#16a34a' }]}
            marks={[
              { f: towCg / 100, color: okT ? '#4ade80' : '#f87171', label: 'TOW' },
              { f: zfwCg / 100, color: okZ ? '#38bdf8' : '#f87171', label: 'ZFW' },
            ]}
          />
        </>
      )}
      {/* na ziemi przed startem: silniki wyłączone, strona FUEL – paliwo w zbiornikach jak na modelu; w pasku masa i SC */}
      <CockpitDock>
        <Ecam
          thrMode={null}
          n1={[0, 0]}
          egt={[18, 18]}
          memo={[[`PITCH TRIM ${fmt(Math.abs(trim), 1)} ${trim >= 0 ? 'UP' : 'DN'}`, '#38d6ee']]}
          page="FUEL"
          fuel={{ l: fs.wing, c: fs.center, r: fs.wing, lMax: TANK.wingMax, cMax: TANK.centerMax, rMax: TANK.wingMax, fu: [0, 0] }}
          footer={{ tat: 15, sat: 15, isa: 0, flt: '--:--', time: '06:42:10', gw: tow, gwcg: towCg, fob: fuel }}
          width={260}
        />
      </CockpitDock>
      <InfoPortal>
        <div style={{ fontWeight: 700, color: okZ && okT ? '#4ade80' : '#f87171' }}>{okZ && okT ? 'załadunek w granicach – można lecieć' : 'POZA OBWIEDNIĄ – trzeba przenieść ładunek'}</div>
        <div style={{ color: okZ ? undefined : '#f87171' }}>
          masa bez paliwa (ZFW) {fmt(zfw / 1000, 1)} t · SC {fmt(zfwCg, 1)}% SCA{zfw > MB.mzfw ? ' · przekroczona MZFW!' : ''}
        </div>
        <div style={{ color: okT ? undefined : '#f87171' }}>
          masa startowa (TOW) {fmt(tow / 1000, 1)} t · SC {fmt(towCg, 1)}% SCA{tow > MB.mtow ? ' · przekroczona MTOW!' : ''}
        </div>
        <div style={{ color: C_FUEL }}>
          paliwo {fmt(fuel / 1000, 1)} t: skrzydła 2 × {fmt(fs.wing / 1000, 1)} t ({fmt(fs.fw * 100, 0)}%), centralny {fmt(fs.center / 1000, 1)} t ({fmt(fs.fc * 100, 0)}%) · SC paliwa {fmt(pctOf(fs.x), 0)}% SCA
        </div>
        <div style={{ color: '#facc15' }}>
          trymer statecznika do startu: {fmt(Math.abs(trim), 1)} {trim >= 0 ? 'UP (nos w górę)' : 'DN (nos w dół)'}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
          <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
          {[150, 200, 250, 300].map((m) => (
            <g key={m}>
              <line x1={28} x2={W - 10} y1={GY(m)} y2={GY(m)} stroke="rgba(255,255,255,0.07)" />
              <text x={24} y={GY(m) + 3} fontSize="9" fill="rgba(255,255,255,0.45)" textAnchor="end">
                {m} t
              </text>
            </g>
          ))}
          {[10, 20, 30, 40, 50].map((p) => (
            <text key={p} x={GX(p)} y={H - 4} fontSize="9" fill="rgba(255,255,255,0.45)" textAnchor="middle">
              {p}%
            </text>
          ))}
          <polygon points={ENVELOPE.map(([p, m]) => `${GX(p)},${GY(m)}`).join(' ')} fill="rgba(74,222,128,0.1)" stroke="#4ade80" strokeWidth="2" />
          <line x1={GX(17)} x2={GX(41)} y1={GY(MB.mzfw / 1000)} y2={GY(MB.mzfw / 1000)} stroke="#facc15" strokeDasharray="5 4" />
          <text x={GX(41) + 3} y={GY(MB.mzfw / 1000) + 3} fontSize="9" fill="#facc15">
            MZFW
          </text>
          <text x={GX(37) + 3} y={GY(319) - 3} fontSize="9" fill="#4ade80">
            MTOW
          </text>
          <line x1={cZ.x} y1={cZ.y} x2={cT.x} y2={cT.y} stroke="#a78bfa" strokeWidth="2" strokeDasharray="4 4" />
          <circle cx={cZ.x} cy={cZ.y} r="6" fill={okZ ? '#38bdf8' : '#f87171'} />
          <rect x={cT.x - 6} y={cT.y - 6} width="12" height="12" fill={okT ? '#4ade80' : '#f87171'} />
        </svg>
        {sideNote && <div style={{ color: '#f87171', fontWeight: 600 }}>{sideNote}</div>}
        <div style={{ opacity: 0.75, fontSize: 12 }}>
          SC = Σ(masa · ramię) / Σ masa, przeliczony na % SCA. Paliwo najpierw trafia do zbiorników w skrzydłach, nadmiar do centralnego; w locie zużywa się najpierw centralny. Skrzydło ma wznios, więc paliwo zbiera się najpierw przy kadłubie, gdzie skrzydło leży nisko i jest najgrubsze. Ma też skos, więc kolejne tony trafiają coraz dalej do tyłu. Dlatego środek ciężkości paliwa najpierw leży z przodu, a przy pełniejszych zbiornikach przesuwa się do tyłu („wektor paliwa” w dokumentacji wyważenia). Dane przybliżone dla A350-1000 (pasażer z bagażem podręcznym 95 kg, MZFW 223 t, MTOW 319 t).
        </div>
      </InfoPortal>
    </>
  );
}

/* ======================= nakładka zakładki ======================= */

export function TailLab({ mode, params, pose, direct }: { mode: CtlMode; params: Params; pose: PoseState; direct: DirectPose }) {
  switch (mode) {
    case 'axes':
      return <AxesOverlay params={params} pose={pose} direct={direct} />;
    case 'adverse':
      return <AdverseOverlay params={params} pose={pose} direct={direct} />;
    case 'balance':
      return <BalanceOverlay params={params} pose={pose} direct={direct} />;
    case 'gust':
      return <GustOverlay params={params} pose={pose} direct={direct} />;
    case 'phugoid':
      return <PhugoidOverlay params={params} pose={pose} direct={direct} />;
    case 'lateral':
      return <LateralOverlay params={params} pose={pose} direct={direct} />;
    case 'mass':
      return <MassOverlay params={params} direct={direct} />;
  }
}
