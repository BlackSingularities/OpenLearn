import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { TrailMesh, Trails } from '../../lib/streaks';
import type { Params, SceneProps, Topic } from '../../lib/types';
import { PauseContext, useAnimationClock } from '../../lib/useAnimationClock';
import { InfoPortal, fmt } from '../../lib/plot';
import { useSpeed } from '../../components/ui';
import { Arrow3D, Lights } from '../../lib/three';
import { ALONG, CORE_IN, CORE_OUT, COWL_OUT, NAC_IN, PARTS, lerpTable, tempColor } from './engine2d';
import { ACC_TH, BEARINGS, COMB_HOLES, COWL3, Flame, VSV_TH, accP, vbvOf, vsvOf, LONG_IN, NAC3_IN, PLUG3, S, SelectionInfo, ax, buildRows, type FlowMode, type SpoolCfg } from './engineModel';
import { isaRho } from './wingFlow';
import { EngineOnPlane } from './airliner';
import { useSceneHidden } from '../../lib/topicNav';
import { AIRBUS, CockpitDock, Ecam, type EcamEngine } from '../../components/cockpit';

/** Parametry silnika do strony ENG: Trent XWB ma trzy wały – model liczy N1 i wał WP (tu N3), N2 leży pomiędzy. */
function ecamEng(o: { n1: number; n2: number; ff: number; oilP?: number; oilT?: number; oilQ?: number; vib?: number }): EcamEngine {
  const run = Math.min(1, o.n2 / 60);
  return {
    ff: o.ff,
    n2: o.n1 + (o.n2 - o.n1) * 0.6,
    n3: o.n2,
    oilQ: o.oilQ ?? 12.7,
    oilT: o.oilT ?? 20 + 60 * run,
    oilP: o.oilP ?? 68 * run,
    vib: [o.vib ?? 0.2 * run, (o.vib ?? 0.2 * run) * 0.7, (o.vib ?? 0.2 * run) * 0.5],
  };
}
import type { EngineModelProps } from './engineModel';

/* ======================= narzędzia ======================= */

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (i: number) => {
  const s = Math.sin(i * 91.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Ramka informacyjna: opis klikniętej części + treść kroku. */
function EngineInfo({ sel, rows, children, hint = 'Kliknij dowolną część silnika (albo jej podpis), aby ją wyróżnić i przeczytać opis.' }: { sel: string | null; rows: ReturnType<typeof buildRows>; children?: ReactNode; hint?: string | null }) {
  return (
    <InfoPortal>
      {sel ? (
        <>
          <SelectionInfo id={sel} rows={rows} />
          <div style={{ opacity: 0.5, fontSize: 12 }}>Kliknij tę część jeszcze raz, aby wrócić do całego silnika.</div>
          {children && <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', margin: '6px 0 2px' }} />}
        </>
      ) : (
        hint && <div style={{ opacity: 0.6, fontSize: 12 }}>{hint}</div>
      )}
      {children}
    </InfoPortal>
  );
}

/** Podpis w scenie. Z onClick działa jak kliknięcie w opisany element modelu (wyróżnia go i pokazuje opis). */
function Tag({ pos, color, children, onClick }: { pos: [number, number, number]; color: string; children: ReactNode; onClick?: () => void }) {
  // scena ukryta albo rozgrzewana w tle nie pokazuje podpisów
  if (useSceneHidden()) return null;
  return (
    <Html position={pos} center zIndexRange={[5, 0]}>
      <span className="engine-label" style={{ color, pointerEvents: onClick ? 'auto' : 'none', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
        {children}
      </span>
    </Html>
  );
}

/** Kliknięcie podpisu: zaznacza element albo – przy drugim kliknięciu – odznacza. */
const pick = (setSel: (f: (s: string | null) => string | null) => void, id: string) => () => setSel((s) => (s === id ? null : id));

const thrOf = (thr: number) => ({ n1: 20 + 80 * thr, n2: 60 + 40 * Math.pow(thr, 0.7) });

/* ======================= Krok 1: model 3D ======================= */

/** Powolne obracanie modelu (OrbitControls.autoRotate); w pauzie stoi. */
export function AutoRotate({ on }: { on: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as { autoRotate: boolean; autoRotateSpeed: number } | null;
  const paused = useContext(PauseContext);
  useEffect(() => {
    if (!controls) return;
    controls.autoRotate = on && !paused;
    controls.autoRotateSpeed = 0.7;
    return () => {
      controls.autoRotate = false;
    };
  }, [controls, on, paused]);
  return null;
}

/**
 * Prawdziwe turbowentylatory według średnicy wentylatora – z nich interpolujemy dane dla suwaka.
 * [średnica m, masa t, ciąg startowy kN, spręż całkowity, BPR, łopaty wentylatora, nazwa]
 */
const ENGINES: [number, number, number, number, number, number, string][] = [
  [1.52, 1.95, 98, 27, 5.0, 38, 'CFM56-3 (Boeing 737 Classic)'],
  [1.73, 2.4, 121, 32, 5.1, 24, 'CFM56-7B (Boeing 737NG)'],
  [1.98, 3.0, 143, 40, 11, 18, 'LEAP-1A (Airbus A320neo)'],
  [2.06, 2.9, 147, 42, 12.5, 20, 'PW1100G (Airbus A320neo)'],
  [2.82, 5.8, 330, 50, 9.6, 18, 'GEnx-1B (Boeing 787)'],
  [3.0, 7.55, 431, 52, 9.0, 22, 'Trent XWB-97 (Airbus A350-1000)'],
  [3.25, 8.3, 513, 42, 8.9, 22, 'GE90-115B (Boeing 777)'],
  [3.4, 9.6, 470, 60, 10, 16, 'GE9X (Boeing 777X)'],
];
const engineAt = (D: number) => {
  const col = (k: number): [number, number][] => ENGINES.map((e) => [e[0], e[k] as number]);
  const near = ENGINES.reduce((b, e) => (Math.abs(e[0] - D) < Math.abs(b[0] - D) ? e : b));
  return {
    mass: lerpTable(col(1), D),
    thrust: lerpTable(col(2), D),
    opr: lerpTable(col(3), D),
    bpr: lerpTable(col(4), D),
    blades: Math.round(lerpTable(col(5), D)),
    near: near[6],
    // obroty maksymalne: końcówki łopat ok. 450 m/s, więc większy wentylator kręci się wolniej
    rpm: (450 / (Math.PI * D)) * 60,
  };
};

/** Wartość dążąca płynnie do celu (ok. 0,6 s) – np. rozkładanie silnika przyciskiem. */
function useEased(target: number) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useFrame((_, dt) => {
    const d = target - cur.current;
    if (Math.abs(d) < 1e-3) {
      if (cur.current !== target) setV((cur.current = target));
      return;
    }
    cur.current += d * Math.min(1, dt * 5);
    setV(cur.current);
  });
  return v;
}

/**
 * Silnik z przeglądu (suwaki, wybór części, ramka z danymi) – wspólny dla sceny samego silnika i dla silnika
 * ożywionego w całym samolocie. base – średnica wentylatora, przy której model ma skalę 1 (w samolocie 3,0 m).
 */
export function useEngineOverview(params: Params, base = 1.98) {
  const thr = Number(params.throttle ?? 60) / 100;
  // suwak (0…1) albo przycisk (true/false) – przycisk rozkłada silnik płynnie
  const explode = useEased(Number(params.explode ?? 0));
  const cut = Boolean(params.cut ?? true);
  const flow = Boolean(params.flow ?? true);
  const labels = Boolean(params.labels ?? true);
  const xray = Boolean(params.xray ?? false);
  const rotate = Boolean(params.rotate ?? false);
  // bez suwaka średnicy – silnik w swojej naturalnej skali
  const D = Number(params.diam ?? base);
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const { n1, n2 } = thrOf(thr);
  const e = engineAt(D);
  const thrustPct = Math.pow((n1 - 20) / 80, 1.6) * 100;
  const F = (e.thrust * thrustPct) / 100;
  const egt = 420 + 520 * Math.pow(thr, 1.5);
  const ff = (0.36 * F * (1 - 0.02 * (e.bpr - 5))) / 10;
  // model: rdzeń zostaje ten sam, wentylator i gondola skalują się ze średnicą
  const fs = D / base;
  const specs: [string, string][] = [
    ['średnica wentylatora', `${fmt(D, 2)} m`],
    ['masa', `ok. ${fmt(e.mass, 1)} t`],
    ['ciąg startowy', `ok. ${fmt(e.thrust, 0)} kN (${fmt((e.thrust * 1000) / 9.81 / 1000, 0)} t)`],
    ['spręż całkowity', `ok. ${fmt(e.opr, 0)} – ciśnienie rośnie ${fmt(e.opr, 0)} razy`],
    ['stosunek obejścia', `${fmt(e.bpr, 1)} : 1`],
    ['łopaty wentylatora', `${e.blades} (${e.blades > 26 ? 'wąskie, tytanowe' : 'szerokie, kompozytowe'})`],
    ['obroty wentylatora', `do ok. ${fmt(e.rpm, 0)} obr/min`],
    ['stosunek ciągu do ciężaru', `ok. ${fmt((e.thrust * 1000) / 9.81 / (e.mass * 1000), 1)}`],
  ];
  const engineProps: EngineModelProps = { n1, n2, cut, xray, fanScale: fs, fanBlades: e.blades, explode, flow: flow ? 'plain' : false, flowSpeed: 0.25 + thr * 1.1, labels, fuelFlow: (ff * 1000) / 2, selected: sel, onSelect: setSel };
  const info = (
      <EngineInfo sel={sel} rows={rows}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>najbliżej: {e.near}</div>
        <div>
          <b>N1</b> (wentylator): {fmt(n1, 0)}% ≈ {fmt((n1 / 100) * e.rpm, 0)} obr/min · <b>N2</b> (rdzeń): {fmt(n2, 0)}%
        </div>
        <div>
          ciąg ≈ <b>{fmt(F, 0)} kN</b> ({fmt(thrustPct, 0)}% startowego) · EGT ≈ {fmt(egt, 0)} °C · paliwo ≈ {fmt(ff, 1)} t/h
        </div>
        {!sel && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1px 10px', fontSize: 11.5, padding: '4px 6px', background: 'rgba(255,255,255,0.04)' }}>
            {specs.map(([k, v]) => [
              <span key={`${k}a`} style={{ opacity: 0.7 }}>
                {k}
              </span>,
              <span key={`${k}b`} style={{ textAlign: 'right' }}>
                {v}
              </span>,
            ])}
          </div>
        )}
        {explode > 0.05 ? (
          <div style={{ opacity: 0.75, fontSize: 12 }}>Widok rozłożony: kliknij moduł – rozsunie się dalej na pojedyncze wieńce łopatek, wtryskiwacze, świece, wały.</div>
        ) : (
          <div style={{ opacity: 0.75, fontSize: 12 }}>
            {xray ? 'Rentgen: gondola i obudowy są półprzezroczyste. ' : ''}niebieskie kropki – strumień zimny, kolorowe – rdzeń (kolor = temperatura). Dane z prawdziwych silników, wartości pośrednie – przybliżone.
          </div>
        )}
      </EngineInfo>
  );
  const ffKg = (ff * 1000) / 2;
  const ecam = (
    <CockpitDock>
      <Ecam
        thrMode={thr > 0.85 ? ['TOGA', 100] : thr > 0.6 ? ['CLB', 98] : ['IDLE', thr * 100]}
        n1={[n1, n1]}
        egt={[egt, egt]}
        egtLimit={1000}
        page="ENG"
        eng={[ecamEng({ n1, n2, ff: ffKg }), ecamEng({ n1, n2, ff: ffKg })]}
        footer={{ tat: 18, sat: 15, isa: 0, flt: '00:42', time: '17:05:48', gw: 290000, gwcg: 28.4, fob: 98000 }}
        width={260}
      />
    </CockpitDock>
  );
  return {
    engineProps,
    info: (
      <>
        {info}
        {ecam}
      </>
    ),
    rotate,
  };
}

function OverviewScene({ params }: SceneProps) {
  const o = useEngineOverview(params);
  return (
    <>
      <Lights />
      <AutoRotate on={o.rotate} />
      <EngineOnPlane {...o.engineProps} />
      {o.info}
    </>
  );
}

/* ======================= Krok 2: skąd się bierze ciąg ======================= */

/**
 * Strumień wokół silnika w kroku „ciąg”:
 * – napływ: powietrze zbiega się do wlotu z obszaru tym szerszego, im wolniej leci samolot
 *   (przy starcie z miejsca – także z boków), i przyspiesza dopiero tuż przed wentylatorem,
 * – wylot: szeroki zimny strumień z dyszy gondoli opływający zbieżną osłonę rdzenia
 *   oraz wąski, szybszy i gorący strumień z dyszy rdzenia wokół stożka wylotowego.
 * Prędkości na ekranie są proporcjonalne do prawdziwych (1 m/s ≈ 0,01 j./s).
 */
function MomentumFlow({ v0, vj, thr }: { v0: number; vj: number; thr: number }) {
  const NIN = 300;
  const NB = 170;
  const NC = 90;
  const inRef = useRef<TrailMesh>(null);
  const bRef = useRef<TrailMesh>(null);
  const cRef = useRef<TrailMesh>(null);
  const st = useMemo(
    () => ({
      inl: Array.from({ length: NIN }, (_, i) => ({ u: hash(i), s: hash(i + 300), a: hash(i + 700) * Math.PI * 2 })),
      byp: Array.from({ length: NB }, (_, i) => ({ d: hash(i + 1000) * 9, f: hash(i + 1300), a: hash(i + 1700) * Math.PI * 2 })),
      core: Array.from({ length: NC }, (_, i) => ({ d: hash(i + 2000) * 9, f: hash(i + 2300), a: hash(i + 2700) * Math.PI * 2 })),
    }),
    [],
  );
  const K = 0.01; // j. sceny na 1 m
  const vFace = 70 + 130 * thr + 0.3 * v0; // prędkość tuż przed wentylatorem
  const vFar = Math.max(v0, 6);
  const vCold = vj * 0.92;
  const vHot = vj * 1.35;
  // szerokość „strugi” wpadającej do wlotu: przy postoju dużo szersza niż wlot, w przelocie – węższa
  const capture = clamp(1 + 1.7 * (1 - v0 / 140), 0.85, 2.7);
  const xIn = ax(140);
  const RIN = 1.5;
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    const m1 = inRef.current;
    if (m1) {
      st.inl.forEach((p, i) => {
        // część cząstek przy postoju nadpływa z boków, zza krawędzi wlotu
        const side = v0 < 80 && p.s > 0.72;
        const xs = side ? xIn - 3.2 : xIn - 7;
        const rs = side ? RIN * (1.6 + 2.2 * (p.s - 0.72)) * (1.4 - v0 / 200) : RIN * capture * Math.sqrt(p.s / 0.72 > 1 ? 1 : p.s / 0.72) * 0.98 + 0.05;
        const re = 0.45 + 1.0 * Math.sqrt(Math.min(1, p.s));
        const L = Math.hypot(xIn - xs, rs - re);
        const u = p.u;
        const v = vFar + (vFace - vFar) * u * u * u;
        p.u += (v * K * dt * 1.8) / L;
        if (p.u >= 1) p.u = 0;
        const x = xs + (xIn - xs) * u;
        const k = Math.pow(1 - u, 2.4);
        const r = re + (rs - re) * k;
        const drdu = -2.4 * (rs - re) * Math.pow(1 - u, 1.4);
        o.position.set(x, Math.cos(p.a) * r, Math.sin(p.a) * r);
        dir.set(xIn - xs, Math.cos(p.a) * drdu, Math.sin(p.a) * drdu).normalize();
        o.quaternion.setFromUnitVectors(X_AXIS, dir);
        const fade = Math.min(1, u / 0.08) * Math.min(1, (1 - u) / 0.04);
        o.scale.set(fade * (0.08 + v * 0.0028), 0.018 * fade, 0.018 * fade);
        o.updateMatrix();
        m1.setMatrixAt(i, o.matrix);
        m1.setColorAt(i, c.set('#7dd3fc').multiplyScalar(0.55 + 0.6 * u));
      });
      m1.instanceMatrix.needsUpdate = true;
      if (m1.instanceColor) m1.instanceColor.needsUpdate = true;
    }
    const exhaust = (m: TrailMesh | null, arr: typeof st.byp, hot: boolean) => {
      if (!m) return;
      const vEx = hot ? vHot : vCold;
      // ta sama masa na sekundę przy większej prędkości = rzadsze smugi
      const keep = clamp((vFace / vEx) * (hot ? 1.3 : 1.6), 0.25, 1);
      arr.forEach((p, i) => {
        p.d += vEx * K * dt * 1.8;
        if (p.d > 9) p.d -= 9;
        const x0 = hot ? 765 : 600;
        const xs = x0 + p.d / S; // w jednostkach przekroju
        let r: number;
        if (hot) {
          const inner = lerpTable(PLUG3, Math.min(xs, 945));
          const outer = 61 + (xs - 765) * 0.05;
          r = inner + 2 + p.f * (outer - inner - 3);
        } else {
          const cw = lerpTable(COWL3, Math.min(xs, 765));
          const outer = 128 + (xs - 600) * 0.04;
          r = cw + 3 + p.f * (outer - cw - 4);
        }
        // za stożkiem/osłoną strumień lekko dąży do osi
        const conv = !hot && xs < 765 ? -0.18 : 0;
        o.position.set(ax(xs), Math.cos(p.a) * r * S, Math.sin(p.a) * r * S);
        dir.set(1, Math.cos(p.a) * conv, Math.sin(p.a) * conv).normalize();
        o.quaternion.setFromUnitVectors(X_AXIS, dir);
        const on = hash(i + (hot ? 77 : 33)) < keep ? Math.min(1, p.d / 0.4) * Math.min(1, (9 - p.d) / 1.5) : 0;
        o.scale.set(on * (0.1 + vEx * 0.0024), on * 0.02, on * 0.02);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
        m.setColorAt(i, hot ? c.set(tempColor(lerpTable(ALONG.T, 820) - p.d * 40)) : c.set('#bae6fd'));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    exhaust(bRef.current, st.byp, false);
    exhaust(cRef.current, st.core, true);
  });
  return (
    <>
      <Trails ref={inRef} count={NIN} />
      <Trails ref={bRef} count={NB} opacity={0.8} />
      <Trails ref={cRef} count={NC} />
    </>
  );
}

/**
 * Prosty model turbowentylatora klasy CFM LEAP (ok. 140 kN na starcie):
 * strumień masy rośnie z obrotami wentylatora, gęstością powietrza i spiętrzeniem we wlocie,
 * a wentylator dodaje każdemu kilogramowi mniej więcej stałą energię – stąd vⱼ = √(vⱼ,stat² + v₀²).
 */
function thrustModel(thr: number, v0: number, h: number) {
  const n = (20 + 80 * thr) / 100;
  const sigma = isaRho(h) / 1.225;
  const M0 = v0 / 340;
  const mdot = 430 * Math.pow(n, 1.4) * sigma * (1 + 0.6 * M0);
  const vjs = 330 * Math.pow(n, 1.2);
  const vj = Math.sqrt(vjs * vjs + v0 * v0);
  const F = (mdot * (vj - v0)) / 1000;
  const eta = v0 > 1 ? 2 / (1 + vj / v0) : 0;
  return { mdot, vj, F, eta, sigma };
}

/** Wykres: ciąg brutto ṁ·vⱼ, opór wlotu ṁ·v₀ i ciąg netto w funkcji prędkości lotu (przy danej dźwigni i wysokości). */
function ThrustChart({ thr, v0, h }: { thr: number; v0: number; h: number }) {
  const sp = useSpeed();
  const W = 300;
  const H = 120;
  const vs = Array.from({ length: 53 }, (_, i) => i * 5);
  const pts = vs.map((v) => {
    const r = thrustModel(thr, v, h);
    return { v, F: r.F, G: (r.mdot * r.vj) / 1000, D: (r.mdot * v) / 1000 };
  });
  const max = Math.max(...pts.map((p) => p.G), 1);
  const X = (v: number) => 26 + (v / 260) * (W - 34);
  const Y = (f: number) => H - 18 - (f / max) * (H - 30);
  const line = (k: 'F' | 'G' | 'D') => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.v).toFixed(1)},${Y(p[k]).toFixed(1)}`).join(' ');
  const cur = thrustModel(thr, v0, h);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      <line x1={X(0)} y1={Y(0)} x2={X(260)} y2={Y(0)} stroke="rgba(255,255,255,0.3)" />
      {[0, 50, 100, 150, 200, 250].map((v) => (
        <text key={v} x={X(v)} y={H - 6} fontSize="8" fill="rgba(255,255,255,0.55)" textAnchor="middle">
          {fmt(sp.val(v), 0)}
        </text>
      ))}
      <text x={W - 6} y={H - 6} fontSize="8" fill="rgba(255,255,255,0.55)" textAnchor="end">
        v₀ {sp.unit}
      </text>
      <path d={line('G')} fill="none" stroke="#fb923c" strokeWidth="1.6" strokeDasharray="5 3" />
      <path d={line('D')} fill="none" stroke="#f87171" strokeWidth="1.6" strokeDasharray="2 3" />
      <path d={line('F')} fill="none" stroke="#4ade80" strokeWidth="2.2" />
      <line x1={X(v0)} x2={X(v0)} y1={8} y2={Y(0)} stroke="rgba(255,255,255,0.4)" />
      <circle cx={X(v0)} cy={Y(cur.F)} r="4" fill="#4ade80" stroke="#0b1020" strokeWidth="1.2" />
      {(
        [
          ['ciąg brutto ṁ·vⱼ', '#fb923c'],
          ['opór wlotu ṁ·v₀', '#f87171'],
          ['ciąg netto', '#4ade80'],
        ] as const
      ).map(([n, c], i) => (
        <text key={n} x={30 + i * 88} y="12" fontSize="8" fill={c}>
          {n}
        </text>
      ))}
    </svg>
  );
}

/**
 * Gdzie działają siły: ciśnienia na powierzchniach części silnika. Wentylator, sprężarki i komora (wysokie ciśnienie
 * na powierzchniach zwróconych do tyłu) pchają do przodu, turbiny i dysza ciągną do tyłu – suma to ciąg netto.
 * Udziały przybliżone, wzorowane na klasycznym rozkładzie z „The Jet Engine” (Rolls-Royce) dla turbowentylatora.
 */
const FORCE_SPLIT: [string, number, number][] = [
  ['wentylator i kierownice', 160, 0.8],
  ['sprężarki', 360, 0.95],
  ['komora spalania', 495, 1.25],
  ['turbiny', 620, -1.75],
  ['dysza i stożek', 790, -0.25],
];

/** Granica „objętości kontrolnej” – prostokąt wokół silnika, przez który liczymy pęd wchodzący i wychodzący. */
function ControlVolume({ mdot, v0, vj }: { mdot: number; v0: number; vj: number }) {
  const x0 = ax(-120);
  const x1 = ax(1080);
  const y = 2.7;
  const pts: [number, number, number][] = [
    [x0, -y, 0],
    [x0, y, 0],
    [x1, y, 0],
    [x1, -y, 0],
    [x0, -y, 0],
  ];
  return (
    <group>
      <Line points={pts} color="#e2e8f0" lineWidth={1.4} dashed dashSize={0.18} gapSize={0.12} transparent opacity={0.7} />
      <Tag pos={[x0, y + 0.35, 0]} color="#38bdf8">
        wchodzi: ṁ·v₀ = {fmt((mdot * v0) / 1000, 0)} kN
      </Tag>
      <Tag pos={[x1, y + 0.35, 0]} color="#fb923c">
        wychodzi: ṁ·vⱼ = {fmt((mdot * vj) / 1000, 0)} kN
      </Tag>
    </group>
  );
}

function ThrustScene({ params }: SceneProps) {
  const sp = useSpeed();
  const thrPct = Number(params.throttle ?? 100);
  const v0 = Number(params.v0 ?? 0);
  const h = Number(params.h ?? 0);
  const view = String(params.view ?? 'flow') as 'flow' | 'forces' | 'cv';
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const thr = thrPct / 100;
  const { mdot, vj, F, eta, sigma } = thrustModel(thr, v0, h);
  const F0 = thrustModel(1, 0, 0).F;
  const { n1, n2 } = thrOf(thr);
  const fl = clamp(F * 0.02, 0, 3);
  // podział na strumienie: rdzeń ok. 1/12 powietrza, ale szybszy (jak w MomentumFlow)
  const mc = mdot / 12;
  const mb = mdot - mc;
  const Fc0 = (mc * (vj * 1.35 - v0)) / 1000;
  const Fb0 = (mb * (vj * 0.92 - v0)) / 1000;
  const norm = Fc0 + Fb0 !== 0 ? F / (Fc0 + Fb0) : 0;
  const Fc = Fc0 * norm;
  const Fb = Fb0 * norm;
  const tonnes = (F * 1000) / 9.81 / 1000;
  const ff = 0.36 * F * (1 + v0 / 600) * (thr > 0.05 ? 1 : 0); // przybliżone zużycie paliwa [kg/h na kN → t/h]
  return (
    <>
      <Lights />
      <EngineOnPlane clickable={[]} n1={n1} n2={n2} cut={view === 'forces'} flow={false} labels={view === 'forces'} accessories={false} selected={sel} onSelect={setSel} />
      {view !== 'forces' && <MomentumFlow v0={v0} vj={Math.max(vj, 1)} thr={thr} />}
      <Arrow3D from={[ax(50) - 0.3, 3.0, 0]} vec={[-fl, 0, 0]} color={F >= 0 ? '#4ade80' : '#f87171'} radius={0.07} />
      <Tag pos={[ax(50) - 0.3 - fl / 2, 3.5, 0]} color={F >= 0 ? '#4ade80' : '#f87171'}>
        ciąg F = {fmt(F, 0)} kN ≈ {fmt(tonnes, 1)} t
      </Tag>
      {view === 'flow' && (
        <>
          <Tag pos={[ax(50) - 4.5, 2.6, 0]} color="#38bdf8">
            v₀ = {sp.fmt(v0)}{v0 < 30 ? ' – powietrze zasysane także z boków' : ''}
          </Tag>
          <Tag pos={[ax(1000), 1.75, 0]} color="#bae6fd">
            strumień zimny ≈ {sp.fmt(vj * 0.92)}
          </Tag>
          <Tag pos={[ax(1050), -0.9, 0]} color="#fb923c">
            strumień gorący ≈ {sp.fmt(vj * 1.35)}
          </Tag>
        </>
      )}
      {view === 'cv' && <ControlVolume mdot={mdot} v0={v0} vj={vj} />}
      {view === 'forces' &&
        FORCE_SPLIT.map(([n, x, k]) => {
          const f = k * F;
          const len = clamp(Math.abs(f) * 0.012, 0.1, 3);
          const fwd = f >= 0;
          const y = -2.35 - (x === 495 || x === 790 ? 0.55 : 0);
          return (
            <group key={n}>
              <Arrow3D from={[ax(x) + (fwd ? len / 2 : -len / 2), y, 0]} vec={[fwd ? -len : len, 0, 0]} color={fwd ? '#4ade80' : '#f87171'} radius={0.05} />
              <Tag pos={[ax(x), y - 0.38, 0]} color={fwd ? '#4ade80' : '#f87171'}>
                {n}: {fwd ? '+' : '−'}
                {fmt(Math.abs(f), 0)} kN
              </Tag>
            </group>
          );
        })}
      <EngineInfo sel={sel} rows={rows} hint={null}>
        <div>
          N1 = {fmt(n1, 0)}% · gęstość powietrza {fmt(sigma * 100, 0)}% wartości przy ziemi
        </div>
        <div>
          strumień masy <b>ṁ = {fmt(mdot, 0)} kg/s</b> · prędkość strumienia <b>vⱼ = {sp.fmt(vj)}</b>
        </div>
        <div>
          F = ṁ · (vⱼ − v₀) = {fmt(mdot, 0)} · ({fmt(vj, 0)} − {fmt(v0, 0)}) = <b>{fmt(F, 1)} kN</b> ({fmt((F / F0) * 100, 0)}% ciągu startowego)
        </div>
        <div style={{ display: 'flex', height: 10, background: 'rgba(255,255,255,0.08)' }} title="udział strumieni w ciągu">
          <span style={{ width: `${clamp(Fb / Math.max(F, 1e-3), 0, 1) * 100}%`, background: '#7dd3fc' }} />
          <span style={{ width: `${clamp(Fc / Math.max(F, 1e-3), 0, 1) * 100}%`, background: '#fb923c' }} />
        </div>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: '#7dd3fc' }}>zimny strumień {fmt(F > 0 ? (Fb / F) * 100 : 0, 0)}%</span> · <span style={{ color: '#fb923c' }}>gorący {fmt(F > 0 ? (Fc / F) * 100 : 0, 0)}%</span> ciągu
          – choć gorący płynie szybciej, zimnego jest ok. 11 razy więcej
        </div>
        <ThrustChart thr={thr} v0={v0} h={h} />
        <div style={{ opacity: 0.75, fontSize: 12 }}>
          ciąg „brutto” ṁ·vⱼ = {fmt((mdot * vj) / 1000, 0)} kN minus opór wlotu ṁ·v₀ = {fmt((mdot * v0) / 1000, 0)} kN
          {v0 > 1 && ` · sprawność napędowa η = 2 / (1 + vⱼ/v₀) = ${fmt(eta * 100, 0)}%`}
          {thr > 0.05 && ` · paliwo ≈ ${fmt(ff / 10, 1)} t/h`}
        </div>
        {view === 'forces' && (
          <div style={{ fontSize: 12 }}>
            Ciąg nie „pcha” dyszy: wentylator, sprężarki i komora są popychane do przodu, a turbiny i dysza – ciągnięte do tyłu. Na samolot działa różnica, przenoszona przez mocowania do pylonu.
          </div>
        )}
        {view === 'cv' && (
          <div style={{ fontSize: 12 }}>
            Objętość kontrolna: nie trzeba znać sił na każdej części – wystarczy policzyć pęd powietrza wchodzącego i wychodzącego z pudełka wokół silnika.
          </div>
        )}
        <div style={{ opacity: 0.6, fontSize: 12 }}>Model przybliżony: silnik klasy CFM LEAP, ok. 140 kN przy starcie z miejsca na poziomie morza (masa silnika ok. 3 t – stosunek ciągu do ciężaru ≈ 5).</div>
      </EngineInfo>
    </>
  );
}

/* ======================= Krok 3: droga powietrza ======================= */

/** Takty pracy wzdłuż drogi gorącego strumienia. */
const STROKES: { x0: number; x1: number; name: string; color: string; part: string; txt: string }[] = [
  { x0: -200, x1: 140, name: 'ssanie', color: '#7dd3fc', part: 'wlot', txt: 'Wlot prowadzi powietrze do wentylatora i lekko je spowalnia.' },
  { x0: 140, x1: 196, name: 'ssanie', color: '#38bdf8', part: 'fan', txt: 'Wentylator rozdziela strumień: ok. 90% idzie do kanału obejściowego, reszta do rdzenia.' },
  { x0: 196, x1: 275, name: 'sprężanie', color: '#a3e635', part: 'lpc', txt: 'Booster (sprężarka NP) wstępnie podnosi ciśnienie.' },
  { x0: 275, x1: 445, name: 'sprężanie', color: '#facc15', part: 'hpc', txt: 'Sprężarka WP: ciśnienie rośnie kilkadziesiąt razy, temperatura do ok. 600 °C.' },
  { x0: 445, x1: 545, name: 'spalanie', color: '#fb923c', part: 'comb', txt: 'Paliwo spala się przy prawie stałym ciśnieniu – temperatura skacze do ok. 1600 °C.' },
  { x0: 545, x1: 590, name: 'rozprężanie', color: '#f87171', part: 'hpt', txt: 'Turbina WP odbiera gazom energię, by napędzać sprężarkę WP.' },
  { x0: 590, x1: 690, name: 'rozprężanie', color: '#c084fc', part: 'lpt', txt: 'Turbina NP napędza wentylator – gazy tracą ciśnienie i temperaturę.' },
  { x0: 690, x1: 1300, name: 'wydech', color: '#f472b6', part: 'nozzle', txt: 'Dysza zamienia resztę ciśnienia na prędkość – strumień wylatuje do tyłu.' },
];
const COLD: { x0: number; x1: number; name: string; color: string; part: string; txt: string }[] = [
  { x0: -200, x1: 140, name: 'ssanie', color: '#7dd3fc', part: 'wlot', txt: 'Wlot prowadzi powietrze do wentylatora.' },
  { x0: 140, x1: 196, name: 'sprężanie', color: '#38bdf8', part: 'fan', txt: 'Wentylator spręża powietrze tylko ok. 1,5 raza – ale ogromną jego ilość.' },
  { x0: 196, x1: 540, name: 'kanał obejściowy', color: '#60a5fa', part: 'bypass', txt: 'Zimny strumień omija rdzeń – nie jest spalany, a daje większość ciągu.' },
  { x0: 540, x1: 1300, name: 'wydech', color: '#f472b6', part: 'bypass', txt: 'Dysza zimnego strumienia przyspiesza go i wyrzuca do tyłu.' },
];

/** Te same takty w silniku tłokowym – po kolei w jednym cylindrze. */
function PistonStrokes({ name, cold }: { name: string; cold: boolean }) {
  const idx = cold ? (name === 'ssanie' ? 0 : name === 'sprężanie' || name === 'kanał obejściowy' ? 1 : 3) : name === 'ssanie' ? 0 : name === 'sprężanie' ? 1 : name === 'spalanie' || name === 'rozprężanie' ? 2 : 3;
  const labels = ['ssanie', 'sprężanie', 'praca', 'wydech'];
  const piston = [0.85, 0.2, 0.85, 0.2]; // położenie tłoka (0 – góra, 1 – dół) na końcu taktu
  return (
    <svg viewBox="0 0 300 78" style={{ width: '100%', maxWidth: 300 }}>
      <rect x="0" y="0" width="300" height="78" rx="6" fill="rgba(255,255,255,0.04)" />
      {labels.map((l, i) => {
        const x = 18 + i * 70;
        const on = i === idx;
        const py = 14 + piston[i] * 30;
        return (
          <g key={l} opacity={on ? 1 : 0.4}>
            {/* cylinder, zawory i tłok */}
            <rect x={x} y={10} width={40} height={50} fill="none" stroke={on ? '#e2e8f0' : 'rgba(255,255,255,0.5)'} strokeWidth="1.5" />
            <line x1={x + 6} y1={10} x2={x + 6 + (i === 0 ? 0 : 0)} y2={i === 0 ? 16 : 10} stroke="#38bdf8" strokeWidth="3" />
            <line x1={x + 34} y1={10} x2={x + 34} y2={i === 3 ? 16 : 10} stroke="#f472b6" strokeWidth="3" />
            {i === 2 && <circle cx={x + 20} cy={18} r={on ? 6 : 4} fill="#fb923c" />}
            {i === 1 && <rect x={x + 2} y={12} width={36} height={py - 12} fill="rgba(250,204,21,0.25)" />}
            <rect x={x + 2} y={py} width={36} height={8} fill={on ? '#cbd5e1' : '#64748b'} />
            <line x1={x + 20} y1={py + 8} x2={x + 20} y2={60} stroke="#94a3b8" strokeWidth="2" />
            <text x={x + 20} y={72} fontSize="9" fill={on ? '#fff' : 'rgba(255,255,255,0.7)'} textAnchor="middle" fontWeight={on ? 700 : 400}>
              {l}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Pasek drogi: odcinki taktów wzdłuż drogi porcji i jej bieżące miejsce. */
function PathBar({ path, list, phase, label }: { path: number[]; list: typeof STROKES; phase: number; label: string }) {
  const n = path.length - 1;
  const fracOf = (x: number) => {
    const i = path.findIndex((px) => px >= x);
    return i < 0 ? 1 : i / n;
  };
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
      <div style={{ position: 'relative', height: 12, display: 'flex' }}>
        {list.map((s, i) => {
          const a = fracOf(s.x0);
          const b = i === list.length - 1 ? 1 : fracOf(s.x1);
          return <span key={i} title={s.name} style={{ width: `${(b - a) * 100}%`, background: s.color, opacity: 0.75 }} />;
        })}
        <span style={{ position: 'absolute', left: `calc(${phase * 100}% - 2px)`, top: -3, width: 4, height: 18, background: '#fff' }} />
      </div>
    </div>
  );
}

function SectionScene({ params }: SceneProps) {
  const sp = useSpeed();
  const stream = String(params.stream ?? 'both') as 'both' | 'cold' | 'hot';
  const thr = Number(params.throttle ?? 70) / 100;
  const follow = Boolean(params.follow ?? true);
  const pace = Number(params.pace ?? 1);
  const showTrail = Boolean(params.trail ?? true);
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const { n1, n2 } = thrOf(thr);
  const t = useAnimationClock(follow, pace);
  // znacznik porusza się ze zmienną prędkością (wolno w komorze, szybko w dyszy)
  const buildPath = (cold: boolean) => {
    const vOf = (x: number) => (cold ? (x > 540 ? 1.5 : 1) : x > 445 && x < 545 ? 0.45 : x > 690 ? 1.8 : x > 545 ? 1.3 : 1);
    const xs: number[] = [];
    let x = -200;
    while (x < 1300) {
      xs.push(x);
      x += 4 * vOf(x);
    }
    return xs;
  };
  const paths = useMemo(() => ({ hot: buildPath(false), cold: buildPath(true) }), []);
  // jeden przelot trwa ok. 20–40 s (przy tempie 1), żeby dało się śledzić każdy takt
  const phase = (t * (0.025 + thr * 0.025)) % 1;
  const tracerOf = (cold: boolean, ph: number) => {
    const pathX = cold ? paths.cold : paths.hot;
    // płynna interpolacja między kolejnymi punktami drogi (bez skoków)
    const fk = Math.max(0, ph) * (pathX.length - 1);
    const k = Math.min(pathX.length - 2, Math.floor(fk));
    const x = pathX[k] + (pathX[k + 1] - pathX[k]) * (fk - k);
    const list = cold ? COLD : STROKES;
    const st = list.find((s) => x >= s.x0 && x < s.x1) ?? list[list.length - 1];
    const coldR = (xx: number) =>
      (lerpTable(COWL_OUT, Math.min(xx, 740)) + 0.5 * ((xx <= 540 ? lerpTable(NAC_IN, xx) : 128) - lerpTable(COWL_OUT, Math.min(xx, 740)))) * S;
    const hotR = (xx: number) => (0.5 * (lerpTable(CORE_IN, xx) + lerpTable(CORE_OUT, xx))) * S;
    const blend = (a: number, b: number, x0: number, x1: number) => {
      const u = clamp((x - x0) / (x1 - x0), 0, 1);
      return a + (b - a) * u * u * (3 - 2 * u);
    };
    const r = cold
      ? x < 240
        ? blend(1.2, coldR(240), 150, 240)
        : coldR(x)
      : x < 240
        ? blend(0.6, hotR(240), 150, 240)
        : x > 720
          ? blend(hotR(720), 0.4, 720, 800)
          : hotR(x);
    const xc = Math.max(0, Math.min(1000, x));
    const p = lerpTable(cold ? ALONG.pByp : ALONG.p, xc);
    const T = lerpTable(cold ? ALONG.TByp : ALONG.T, xc);
    const v = lerpTable(cold ? ALONG.vByp : ALONG.v, xc) * (0.5 + 0.5 * thr);
    // zimny znacznik po drugiej stronie osi, żeby się nie nakładały
    const a = cold ? -0.9 : 0.7;
    return { cold, x, st, r, p, T, v, a };
  };
  const kinds = stream === 'both' ? [false, true] : [stream === 'cold'];
  const tracers = kinds.map((c) => tracerOf(c, phase));
  const cold = stream === 'cold';
  const st = tracers[0].st;
  const focusParts = Array.from(new Set(tracers.map((tr) => tr.st.part)));
  // prawdziwy czas przelotu: ok. 3,5 m silnika, prędkości z przebiegu ALONG.v
  const realMs = (c: boolean) => {
    let s = 0;
    for (let x = 0; x < 1000; x += 10) s += 0.035 / Math.max(30, lerpTable(c ? ALONG.vByp : ALONG.v, x + 5) * (0.5 + 0.5 * thr));
    return s * 1000;
  };
  const visibleS = 1 / ((0.025 + thr * 0.025) * pace);
  return (
    <>
      <Lights />
      <EngineOnPlane clickable={[]} n1={n1} n2={n2} cut flow="temp" stream={stream} flowSpeed={0.2 + thr} labels accessories={false} focus={follow && !sel ? [...focusParts, 'shafts'] : undefined} selected={sel} onSelect={setSel} />
      {follow &&
        kinds.map((c) => {
          const tr = tracerOf(c, phase);
          const pos: [number, number, number] = [ax(tr.x), tr.r * Math.cos(tr.a), tr.r * Math.sin(tr.a)];
          const col = tempColor(tr.T);
          return (
            <group key={c ? 'cold' : 'hot'}>
              {/* ślad: te same punkty drogi chwilę wcześniej, coraz mniejsze i bledsze */}
              {showTrail &&
                Array.from({ length: 22 }, (_, i) => {
                  const q = tracerOf(c, phase - (i + 1) * 0.0045);
                  if (phase - (i + 1) * 0.0045 < 0) return null;
                  const k = 1 - i / 22;
                  return (
                    <mesh key={i} position={[ax(q.x), q.r * Math.cos(q.a), q.r * Math.sin(q.a)]} raycast={() => null}>
                      <sphereGeometry args={[0.055 * k + 0.015, 10, 8]} />
                      <meshBasicMaterial color={tempColor(q.T)} transparent opacity={0.55 * k} depthWrite={false} />
                    </mesh>
                  );
                })}
              <mesh position={pos} raycast={() => null}>
                <sphereGeometry args={[0.09, 18, 14]} />
                <meshBasicMaterial color={col} />
              </mesh>
              <mesh position={pos} raycast={() => null}>
                <sphereGeometry args={[0.18, 18, 14]} />
                <meshBasicMaterial color={col} transparent opacity={0.25} depthWrite={false} />
              </mesh>
              <Tag pos={[pos[0], pos[1] + (tr.cold ? -0.45 : 0.45), pos[2]]} color={tr.st.color}>
                {stream === 'both' ? (tr.cold ? 'zimny · ' : 'gorący · ') : ''}
                {tr.st.name} · {fmt(tr.p, tr.p < 10 ? 1 : 0)} bar · {fmt(tr.T, 0)} °C · {sp.fmt(tr.v)}
              </Tag>
            </group>
          );
        })}
      <EngineInfo sel={sel} rows={rows} hint={null}>
        {follow && !sel && (
          <>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', fontSize: 12 }}>
              {['ssanie', 'sprężanie', 'spalanie', 'rozprężanie', 'wydech'].map((n) => (
                <span key={n} style={{ padding: '1px 8px', background: n === st.name ? st.color : 'rgba(255,255,255,0.08)', color: n === st.name ? '#0b1020' : undefined, fontWeight: n === st.name ? 700 : 400, opacity: cold && (n === 'spalanie' || n === 'rozprężanie') ? 0.35 : 1 }}>
                  {n}
                </span>
              ))}
            </div>
            <div style={{ color: st.color, fontWeight: 700 }}>{st.name}</div>
            <div>{st.txt}</div>
            {tracers[1] && (
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                <b style={{ color: tracers[1].st.color }}>zimny: {tracers[1].st.name}</b> – {tracers[1].st.txt}
              </div>
            )}
            {kinds.map((c) => (
              <PathBar key={String(c)} path={c ? paths.cold : paths.hot} list={c ? COLD : STROKES} phase={phase} label={c ? 'droga zimnego strumienia' : 'droga gorącego strumienia'} />
            ))}
            <div style={{ fontSize: 12, opacity: 0.8 }}>W silniku tłokowym te same takty dzieją się po kolei w jednym cylindrze:</div>
            <PistonStrokes name={st.name} cold={cold} />
            <div style={{ fontSize: 12 }}>
              Naprawdę porcja powietrza przelatuje przez rdzeń w ok. <b>{fmt(realMs(false), 0)} ms</b>
              {stream !== 'hot' ? `, a kanałem obejściowym w ok. ${fmt(realMs(true), 0)} ms` : ''} – tu przelot trwa ok. {fmt(visibleS, 0)} s, czyli jest spowolniony ok. {fmt((visibleS * 1000) / realMs(false), 0)} razy.
            </div>
          </>
        )}
        <div style={{ opacity: 0.7, fontSize: 12 }}>Kolor kropek i znacznika to temperatura: od chłodnego niebieskiego, przez żółty za sprężarką, po czerwony za komorą.</div>
      </EngineInfo>
    </>
  );
}

/* ======================= Krok 4: ciśnienie, temperatura, prędkość ======================= */

type QKey = 'p' | 'T' | 'v';
type Regime = 'to' | 'cruise' | 'idle';
const QUANT: Record<QKey, { label: string; unit: string; core: [number, number][]; byp: [number, number][]; max: number; d: number; flow: FlowMode; color: string }> = {
  p: { label: 'ciśnienie', unit: 'bar', core: ALONG.p, byp: ALONG.pByp, max: 45, d: 1, flow: 'p', color: '#facc15' },
  T: { label: 'temperatura', unit: '°C', core: ALONG.T, byp: ALONG.TByp, max: 1700, d: 0, flow: 'temp', color: '#fb923c' },
  v: { label: 'prędkość przepływu', unit: 'm/s', core: ALONG.v, byp: ALONG.vByp, max: 450, d: 0, flow: 'v', color: '#4ade80' },
};
const REGIMES: Record<Regime, { label: string; amb: string }> = {
  to: { label: 'start (pełny ciąg)', amb: 'poziom morza: 1,0 bar, 15 °C, samolot stoi' },
  cruise: { label: 'przelot', amb: 'ok. 11 km: 0,24 bar, −56 °C, Ma 0,8 – spiętrzenie we wlocie podnosi to do ok. 0,36 bar i −28 °C' },
  idle: { label: 'bieg jałowy', amb: 'poziom morza, silnik na ziemi na jałowym' },
};
/** Przebiegi z tabel (start) przeliczone na inny stan pracy – w przybliżeniu. */
function regimeVal(q: QKey, r: Regime, v: number, x: number) {
  if (r === 'to') return v;
  if (r === 'cruise') {
    if (q === 'p') return v * 0.3;
    if (q === 'T') return (v + 273) * 0.85 - 273;
    return x < 140 ? 240 - ((240 - 170) * Math.max(0, x)) / 140 : v;
  }
  if (q === 'p') return 1 + (v - 1) * 0.12;
  if (q === 'T') return 15 + (v - 15) * 0.4;
  return v * 0.45;
}
const valAt = (q: QKey, r: Regime, x: number, byp = false) => regimeVal(q, r, lerpTable(byp ? QUANT[q].byp : QUANT[q].core, Math.max(0, Math.min(1000, x))), x);

/** Stacje silnika według przyjętej numeracji (SAE): 0 – otoczenie, 2 – przed wentylatorem, 3 – za sprężarką, 4 – za komorą… */
const STATIONS: [string, number, string][] = [
  ['0', 0, 'otoczenie'],
  ['2', 140, 'przed wentylatorem'],
  ['25', 275, 'za sprężarką NP'],
  ['3', 440, 'za sprężarką WP'],
  ['4', 545, 'za komorą (przed turbiną)'],
  ['45', 590, 'między turbinami'],
  ['5', 690, 'za turbiną NP'],
  ['9', 820, 'wylot dyszy'],
];

function qColor(q: QKey, v: number) {
  const c = new THREE.Color();
  if (q === 'T') return c.set(tempColor(v));
  if (q === 'p') {
    const k = Math.max(0, Math.min(1, Math.log(Math.max(v, 0.2)) / Math.log(42)));
    return c.setHSL(0.6 - k * 0.45, 0.85, 0.55 + 0.1 * k);
  }
  const k = Math.max(0, Math.min(1, v / 430));
  return c.setHSL(0.33 - k * 0.2, 0.8, 0.45 + 0.25 * k);
}

/** Pasy podzespołów pod wykresem – od razu widać, gdzie co się dzieje. */
const ZONES: [number, number, string, string][] = [
  [0, 140, 'wlot', '#7dd3fc'],
  [140, 275, 'went. + NP', '#38bdf8'],
  [275, 445, 'sprężarka WP', '#facc15'],
  [445, 545, 'komora', '#fb923c'],
  [545, 690, 'turbiny', '#f87171'],
  [690, 1000, 'dysza i strumień', '#f472b6'],
];

function AlongChart({ q, r, cur }: { q: QKey | 'all'; r: Regime; cur: number }) {
  const W = 300;
  const H = 130;
  const X = (x: number) => 8 + (x / 1000) * (W - 16);
  const top = 14;
  const bot = H - 24;
  const keys: QKey[] = q === 'all' ? ['p', 'T', 'v'] : [q];
  const max = (k: QKey) => (q === 'all' ? Math.max(...Array.from({ length: 101 }, (_, i) => valAt(k, r, i * 10))) : QUANT[k].max * (r === 'idle' && k !== 'T' ? 0.5 : 1));
  const Y = (k: QKey, v: number) => bot - (v / max(k)) * (bot - top);
  const path = (k: QKey, byp: boolean) =>
    Array.from({ length: 121 }, (_, i) => (i / 120) * 1000)
      .map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(k, valAt(k, r, x, byp)).toFixed(1)}`)
      .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      {ZONES.map(([a, b, n, c]) => (
        <g key={n}>
          <rect x={X(a)} y={bot + 2} width={X(b) - X(a) - 1} height={6} fill={c} opacity="0.55" />
          <text x={(X(a) + X(b)) / 2} y={H - 4} fontSize="7" fill="rgba(255,255,255,0.6)" textAnchor="middle">
            {n}
          </text>
        </g>
      ))}
      <line x1={X(0)} y1={bot} x2={X(1000)} y2={bot} stroke="rgba(255,255,255,0.3)" />
      {keys.map((k) => (
        <g key={k}>
          {q !== 'all' && <path d={path(k, true)} fill="none" stroke="#38bdf8" strokeWidth="1.6" strokeDasharray="5 4" />}
          <path d={path(k, false)} fill="none" stroke={QUANT[k].color} strokeWidth="2.2" />
          <circle cx={X(cur)} cy={Y(k, valAt(k, r, cur))} r="4" fill={QUANT[k].color} stroke="#0b1020" strokeWidth="1.2" />
        </g>
      ))}
      {STATIONS.map(([n, x]) => (
        <text key={n} x={X(x)} y={top - 4} fontSize="7.5" fill="rgba(255,255,255,0.55)" textAnchor="middle">
          {n}
        </text>
      ))}
      <line x1={X(cur)} x2={X(cur)} y1={top} y2={bot} stroke="#f472b6" strokeDasharray="3 3" />
      {q === 'all' &&
        keys.map((k, i) => (
          <text key={k} x={W - 10} y={24 + i * 10} fontSize="8" fill={QUANT[k].color} textAnchor="end">
            {QUANT[k].label}
          </text>
        ))}
    </svg>
  );
}

/** Obieg Braytona w układzie p–v albo T–s (z tych samych przebiegów). */
function CycleChart({ kind, r, cur }: { kind: 'pv' | 'Ts'; r: Regime; cur: number }) {
  const W = 300;
  const H = 130;
  const pt = (x: number) => {
    const p = valAt('p', r, x);
    const T = valAt('T', r, x) + 273;
    const p0 = valAt('p', r, 0);
    const T0 = valAt('T', r, 0) + 273;
    return kind === 'pv' ? { a: T / p, b: p } : { a: 1005 * Math.log(T / T0) - 287 * Math.log(p / p0), b: T - 273 };
  };
  const xs = Array.from({ length: 140 }, (_, i) => 140 + (i / 139) * 680);
  const pts = xs.map(pt);
  const end = pt(820);
  const start = pt(140);
  const aMin = Math.min(...pts.map((q) => q.a), end.a);
  const aMax = Math.max(...pts.map((q) => q.a));
  const bMin = Math.min(...pts.map((q) => q.b));
  const bMax = Math.max(...pts.map((q) => q.b));
  const PX = (a: number) => 24 + ((a - aMin) / (aMax - aMin || 1)) * (W - 34);
  const PY = (b: number) => H - 16 - ((b - bMin) / (bMax - bMin || 1)) * (H - 28);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${PX(q.a).toFixed(1)},${PY(q.b).toFixed(1)}`).join(' ');
  const c = pt(clamp(cur, 140, 820));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      <line x1={24} y1={H - 16} x2={W - 6} y2={H - 16} stroke="rgba(255,255,255,0.4)" />
      <line x1={24} y1={6} x2={24} y2={H - 16} stroke="rgba(255,255,255,0.4)" />
      <text x={W - 8} y={H - 4} fill="rgba(255,255,255,0.6)" fontSize="10" textAnchor="end">
        {kind === 'pv' ? 'objętość właściwa v' : 'entropia s'}
      </text>
      <text x={18} y={14} fill="rgba(255,255,255,0.6)" fontSize="10" textAnchor="end">
        {kind === 'pv' ? 'p' : 'T'}
      </text>
      <path d={`${d} L${PX(start.a).toFixed(1)},${PY(start.b).toFixed(1)} Z`} fill="rgba(250,204,21,0.12)" stroke="none" />
      <path d={d} fill="none" stroke="#facc15" strokeWidth="2.4" />
      {/* 4→1: oddanie ciepła atmosferze (poza silnikiem) */}
      <line x1={PX(end.a)} y1={PY(end.b)} x2={PX(start.a)} y2={PY(start.b)} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="5 4" />
      {[140, 440, 545, 820].map((x, i) => (
        <text key={x} x={PX(pt(x).a) + 5} y={PY(pt(x).b) - 4} fill="#fff" fontSize="11" fontWeight="700">
          {i + 1}
        </text>
      ))}
      <circle cx={PX(c.a)} cy={PY(c.b)} r="5" fill="#f472b6" />
    </svg>
  );
}

/** Przekrój silnika w miejscu znacznika: pierścienie rdzenia i kanału obejściowego w kolorze wartości. */
function SliceDisc({ q, r, cur }: { q: QKey; r: Regime; cur: number }) {
  const rings: [number, number, number][] = []; // [r wewn., r zewn., wartość] w j. sceny
  const core = valAt(q, r, cur);
  const byp = valAt(q, r, cur, true);
  if (cur < 150) rings.push([0, lerpTable(NAC3_IN, Math.max(cur, 64)) * S, core]);
  else if (cur < 196) {
    rings.push([lerpTable(CORE_IN, cur) * S, 0.8, core]);
    rings.push([0.8, lerpTable(NAC3_IN, cur) * S, byp]);
  } else if (cur < 765) {
    rings.push([lerpTable(CORE_IN, cur) * S, lerpTable(CORE_OUT, Math.min(cur, 760)) * S, core]);
    if (cur < 600) rings.push([lerpTable(COWL3, cur) * S, lerpTable(NAC3_IN, cur) * S, byp]);
    else rings.push([lerpTable(COWL3, cur) * S + 0.02, (126 + (cur - 600) * 0.03) * S, byp]);
  } else {
    rings.push([cur < 945 ? lerpTable(PLUG3, cur) * S : 0, 0.62, core]);
    rings.push([0.66, 1.28, byp]);
  }
  const outer = Math.max(...rings.map((x) => x[1]));
  return (
    <group position={[ax(cur), 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      {rings.map(([a, b, v], i) => (
        <mesh key={i} raycast={() => null}>
          <ringGeometry args={[Math.max(0.001, a), b, 64]} />
          <meshBasicMaterial color={qColor(q, v)} transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh raycast={() => null}>
        <ringGeometry args={[outer - 0.025, outer, 64]} />
        <meshBasicMaterial color="#f472b6" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function AlongScene({ params }: SceneProps) {
  const sp = useSpeed();
  const qp = String(params.q ?? 'p') as QKey | 'all' | 'brayton' | 'ts';
  const reg = String(params.regime ?? 'to') as Regime;
  const cur = Number(params.x ?? 440);
  const showSt = Boolean(params.stations ?? true);
  const q: QKey = qp === 'T' || qp === 'v' ? qp : qp === 'all' || qp === 'ts' ? 'T' : 'p';
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const Q = QUANT[q];
  // wartość wielkości z jednostką; prędkość – w jednostce z ustawień
  const qv = (k: QKey, val: number) => (k === 'v' ? sp.fmt(val) : `${fmt(val, QUANT[k].d)} ${QUANT[k].unit}`);
  const part = PARTS.find((p) => cur >= p.x0 && cur <= p.x1 && p.id !== 'bypass');
  const n = reg === 'idle' ? { n1: 21, n2: 62 } : reg === 'cruise' ? { n1: 86, n2: 93 } : { n1: 100, n2: 100 };
  const rSlice = cur < 600 ? lerpTable(NAC3_IN, Math.max(cur, 64)) * S : 1.28;
  const st = [...STATIONS].reverse().find(([, x]) => cur >= x - 2);
  return (
    <>
      <Lights />
      <EngineOnPlane clickable={[]} n1={n.n1} n2={n.n2} cut flow={Q.flow} flowSpeed={reg === 'idle' ? 0.4 : 1} labels={false} selected={sel} onSelect={setSel} />
      <SliceDisc q={q} r={reg} cur={cur} />
      <Tag pos={[ax(cur), rSlice + 0.45, 0]} color="#f472b6">
        {qp === 'brayton' || qp === 'ts' || qp === 'all'
          ? `${fmt(valAt('p', reg, cur), 1)} bar · ${fmt(valAt('T', reg, cur), 0)} °C · ${sp.fmt(valAt('v', reg, cur))}`
          : qv(q, valAt(q, reg, cur))}
      </Tag>
      {showSt &&
        STATIONS.filter(([, x]) => x > 0).map(([nm, x]) => (
          <Tag key={nm} pos={[ax(x), -(x < 600 ? lerpTable(NAC3_IN, x) * S + 0.25 : 1.1), 0]} color={st?.[0] === nm ? '#f472b6' : '#94a3b8'}>
            {nm}
          </Tag>
        ))}
      <EngineInfo sel={sel} rows={rows} hint={null}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {REGIMES[reg].label}: {REGIMES[reg].amb}
        </div>
        {part && <div style={{ color: part.color, fontWeight: 700 }}>położenie: {part.name}{st ? ` · stacja ${st[0]} (${st[2]})` : ''}</div>}
        {qp === 'brayton' || qp === 'ts' ? (
          <>
            <div>
              <b>Obieg Braytona</b> ({qp === 'ts' ? 'T–s' : 'p–v'}): 1→2 sprężanie, 2→3 spalanie przy stałym ciśnieniu, 3→4 rozprężanie w turbinach i dyszy, 4→1 oddanie ciepła atmosferze.
            </div>
            <CycleChart kind={qp === 'ts' ? 'Ts' : 'pv'} r={reg} cur={cur} />
            <div style={{ opacity: 0.75, fontSize: 12 }}>
              {qp === 'ts'
                ? 'W układzie T–s sprężanie i rozprężanie byłyby pionowe, gdyby nie straty – ich pochylenie w prawo to tarcie i nieodwracalności. Pole pętli to praca obiegu.'
                : 'Pole wewnątrz pętli ~ praca obiegu na każdy kilogram powietrza. Im wyższy spręż, tym wyższa sprawność.'}
            </div>
          </>
        ) : (
          <>
            {qp !== 'all' && (
              <div>
                {Q.label} w rdzeniu: <b>{qv(q, valAt(q, reg, cur))}</b> · w kanale obejściowym: {qv(q, valAt(q, reg, cur, true))}
              </div>
            )}
            <AlongChart q={qp === 'all' ? 'all' : q} r={reg} cur={cur} />
            <div style={{ opacity: 0.75, fontSize: 12 }}>
              {qp === 'all' ? 'Wszystkie trzy wielkości w rdzeniu, każda w swojej skali.' : `linia ciągła – rdzeń, przerywana – kanał obejściowy; kolor kropek i przekroju = ${Q.label}`}
            </div>
          </>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '2.2em 1fr 3.6em 3.6em 3.4em', gap: '1px 6px', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ opacity: 0.6 }}>st.</span>
          <span style={{ opacity: 0.6 }}>miejsce</span>
          <span style={{ opacity: 0.6, textAlign: 'right' }}>bar</span>
          <span style={{ opacity: 0.6, textAlign: 'right' }}>°C</span>
          <span style={{ opacity: 0.6, textAlign: 'right' }}>{sp.unit}</span>
          {STATIONS.map(([nm, x, txt]) => {
            const on = st?.[0] === nm;
            return [
              <span key={`${nm}a`} style={{ color: on ? '#f472b6' : undefined, fontWeight: on ? 700 : 400 }}>{nm}</span>,
              <span key={`${nm}b`} style={{ color: on ? '#f472b6' : undefined, opacity: on ? 1 : 0.8 }}>{txt}</span>,
              <span key={`${nm}c`} style={{ textAlign: 'right' }}>{fmt(valAt('p', reg, x), 1)}</span>,
              <span key={`${nm}d`} style={{ textAlign: 'right', color: tempColor(valAt('T', reg, x)) }}>{fmt(valAt('T', reg, x), 0)}</span>,
              <span key={`${nm}e`} style={{ textAlign: 'right' }}>{fmt(sp.val(valAt('v', reg, x)), 0)}</span>,
            ];
          })}
        </div>
      </EngineInfo>
    </>
  );
}

/* ======================= Krok 5: sprężarka osiowa ======================= */

/**
 * Uproszczony model pierwszego stopnia sprężarki WP i jej mapy.
 * nf – obroty względne (N2/100), m – względny przepływ, vsv – przymknięcie kierownic [rad].
 */
function stageModel(n2: number, variable: boolean, piTot: number) {
  const nf = n2 / 100;
  const m = Math.pow(nf, 1.3);
  const vsv = variable ? vsvOf(n2) : 0;
  const U = 380 * nf; // prędkość obwodowa łopatki [m/s]
  const cx = 165 * Math.pow(m, 1.25); // prędkość osiowa powietrza [m/s]
  const ctheta = cx * Math.tan(vsv * 1.2); // zawirowanie nadane przez przymknięte kierownice
  const beta = (Math.atan2(U - ctheta, cx) * 180) / Math.PI; // kąt napływu względnego (od osi)
  const betaBlade = (Math.atan2(380, 165) * 180) / Math.PI; // kąt łopatki = kąt napływu w punkcie obliczeniowym
  const inc = beta - betaBlade;
  // mapa: linia pracy i linia pompażu (ze sterowaną geometrią zapas jest stały, z zablokowaną – maleje przy niskich obrotach)
  const opPR = 1 + (piTot - 1) * Math.pow(nf, 2.4);
  const surgePR = (mm: number) => 1 + (piTot - 1) * (1.22 * Math.pow(mm, 1.75) - (variable ? 0 : 0.7 * mm * (1 - mm)));
  const margin = (surgePR(m) - opPR) / (opPR - 1 + 1e-6);
  return { nf, m, vsv, U, cx, ctheta, beta, inc, opPR, surgePR, margin, stall: surgePR(m) < opPR };
}

function VelocityTriangle({ st }: { st: ReturnType<typeof stageModel> }) {
  const W = 300;
  const H = 120;
  const k = 0.2; // px na m/s
  // oś silnika – w prawo; obrót łopatek – w górę (−y). c = w + U
  const ox = 30;
  const oy = 22;
  const c = [st.cx * k, -st.ctheta * k];
  const U = [0, -st.U * k];
  const w = [c[0] - U[0], c[1] - U[1]];
  const arrow = (x0: number, y0: number, dx: number, dy: number, col: string, label: string, lx = 0, ly = 0) => {
    const x1 = x0 + dx;
    const y1 = y0 + dy;
    const a = Math.atan2(dy, dx);
    return (
      <g>
        <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={col} strokeWidth="2" />
        <path d={`M${x1},${y1} L${x1 - 7 * Math.cos(a - 0.4)},${y1 - 7 * Math.sin(a - 0.4)} L${x1 - 7 * Math.cos(a + 0.4)},${y1 - 7 * Math.sin(a + 0.4)} Z`} fill={col} />
        <text x={(x0 + x1) / 2 + lx} y={(y0 + y1) / 2 + ly} fill={col} fontSize="10" fontWeight="700">
          {label}
        </text>
      </g>
    );
  };
  const bad = Math.abs(st.inc) > 6;
  // profil łopatki ustawiony pod kątem obliczeniowym względem osi
  const bb = (Math.atan2(380, 165) * 180) / Math.PI;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      {/* c – prędkość bezwzględna powietrza, U – prędkość łopatki, w – prędkość względna widziana przez łopatkę */}
      {arrow(ox, oy, c[0], c[1], '#38bdf8', 'c', -2, -6)}
      {arrow(ox, oy, w[0], w[1], bad ? '#f87171' : '#facc15', 'w', 6, 4)}
      {arrow(ox + w[0], oy + w[1], U[0], U[1], '#a3e635', 'U', 6, 0)}
      {/* profil łopatki ustawiony wzdłuż kierunku napływu w punkcie obliczeniowym i rzeczywisty kierunek napływu */}
      <g transform={`translate(230,58) rotate(${bb})`}>
        <path d="M-30,0 Q0,-8 30,0 Q0,-3 -30,0 Z" fill="#cbd5e1" />
      </g>
      <g transform={`translate(230,58) rotate(${st.beta})`}>
        <line x1="-56" y1="0" x2="-34" y2="0" stroke={bad ? '#f87171' : '#facc15'} strokeWidth="2" />
        <path d="M-34,0 L-40,-3 L-40,3 Z" fill={bad ? '#f87171' : '#facc15'} />
      </g>
      <text x="200" y="104" fontSize="10" fill={bad ? '#f87171' : 'rgba(255,255,255,0.75)'} fontWeight={bad ? 700 : 400}>
        kąt natarcia {st.inc >= 0 ? '+' : ''}
        {fmt(st.inc, 1)}°
      </text>
      <text x="200" y="16" fontSize="9" fill="rgba(255,255,255,0.55)">
        łopatka 1. stopnia
      </text>
    </svg>
  );
}

function CompressorMap({ st, piTot, n2 }: { st: ReturnType<typeof stageModel>; piTot: number; n2: number }) {
  const W = 300;
  const H = 130;
  const X = (m: number) => 30 + (m / 1.1) * (W - 40);
  const Y = (pr: number) => H - 20 - ((pr - 1) / (piTot * 1.35 - 1)) * (H - 32);
  const ms = Array.from({ length: 41 }, (_, i) => 0.2 + (i / 40) * 0.88);
  const surge = ms.map((m, i) => `${i ? 'L' : 'M'}${X(m).toFixed(1)},${Y(Math.max(1, st.surgePR(m))).toFixed(1)}`).join(' ');
  const op = Array.from({ length: 41 }, (_, i) => {
    const nf = 0.45 + (i / 40) * 0.6;
    return `${i ? 'L' : 'M'}${X(Math.pow(nf, 1.3)).toFixed(1)},${Y(1 + (piTot - 1) * Math.pow(nf, 2.4)).toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      <line x1={X(0)} y1={H - 20} x2={W - 6} y2={H - 20} stroke="rgba(255,255,255,0.3)" />
      <line x1={X(0)} y1={8} x2={X(0)} y2={H - 20} stroke="rgba(255,255,255,0.3)" />
      <text x={W - 8} y={H - 6} fontSize="9" fill="rgba(255,255,255,0.6)" textAnchor="end">
        przepływ powietrza →
      </text>
      <text x="6" y="14" fontSize="9" fill="rgba(255,255,255,0.6)">
        spręż
      </text>
      <path d={surge} fill="none" stroke="#f87171" strokeWidth="2" />
      <text x={X(0.42)} y={Y(st.surgePR(0.5)) - 6} fontSize="9" fill="#f87171">
        linia pompażu
      </text>
      <path d={op} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" strokeDasharray="4 3" />
      <text x={X(0.98)} y={Y(1 + (piTot - 1) * 0.85) + 14} fontSize="9" fill="rgba(255,255,255,0.6)" textAnchor="end">
        linia pracy
      </text>
      <circle cx={X(st.m)} cy={Y(st.opPR)} r="5" fill={st.stall ? '#f87171' : '#4ade80'} stroke="#0b1020" strokeWidth="1.5" />
      <text x={X(st.m) + 8} y={Y(st.opPR) + 4} fontSize="9" fill={st.stall ? '#f87171' : '#4ade80'}>
        N2 {fmt(n2, 0)}%
      </text>
    </svg>
  );
}

function CompressorScene({ params }: SceneProps) {
  const n = Math.round(Number(params.stages ?? 9));
  const pis = Number(params.pis ?? 1.3);
  const n2 = Number(params.n2 ?? 95);
  const variable = Boolean(params.vsv ?? true);
  const explode = Boolean(params.explode ?? false);
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(n), [n]);
  useEffect(() => setSel(null), [n]);
  const piTot = Math.pow(pis, n);
  const Tout = 288 * Math.pow(piTot, 0.286 / 0.88) - 273;
  const stagesP = Array.from({ length: n }, (_, i) => Math.pow(pis, i + 1));
  const st = stageModel(n2, variable, piTot);
  const vbv = variable ? vbvOf(n2) : 0;
  const n1 = 20 + 80 * Math.pow(Math.max(0, (n2 - 58) / 42), 1.4);
  return (
    <>
      <Lights />
      <EngineOnPlane clickable={['lpc', 'hpc']} n1={n1} n2={n2} hpcStages={n} variableGeom={variable} cut explode={explode ? 0.35 : 0} explodable={['lpc', 'hpc']} focus={['lpc', 'hpc', 'shafts']} flow={explode ? false : 'temp'} flowSpeed={0.3 + 0.7 * st.nf} labels={false} selected={sel ?? (explode ? 'hpc' : null)} onSelect={setSel} />
      <Tag pos={[ax(360), 1.25, 0]} color="#facc15" onClick={pick(setSel, 'hpc')}>
        sprężarka WP – {n} stopni
      </Tag>
      {!explode && (
        <>
          <Tag pos={[ax(300), 1.12 * Math.cos(VSV_TH), 1.12 * Math.sin(VSV_TH)]} color={variable ? '#a3e635' : '#f87171'} onClick={pick(setSel, 'hpc:vsv')}>
            VSV {variable ? `przymknięte o ${fmt((st.vsv * 180) / Math.PI, 0)}°` : 'zablokowane'}
          </Tag>
          <Tag pos={[ax(268), -0.98, 0]} color="#7dd3fc" onClick={pick(setSel, 'lpc:vbv')}>
            VBV {vbv > 0.02 ? `otwarte ${fmt(vbv * 100, 0)}%` : 'zamknięte'}
          </Tag>
        </>
      )}
      <EngineInfo sel={sel} rows={rows} hint="Kliknij sprężarkę, kierownice przestawne, kolektory upustu albo zawory VBV, aby przeczytać opis.">
        <div>
          spręż całkowity (ile razy rośnie ciśnienie) π = {fmt(pis, 2)}^{n} = <b>{fmt(piTot, 1)}</b> · za sprężarką ≈ {fmt(Tout, 0)} °C
        </div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 36, margin: '2px 0' }}>
          {stagesP.map((p, i) => (
            <div key={i} title={`stopień ${i + 1}: ${fmt(p, 1)}×`} style={{ flex: 1, height: `${(p / piTot) * 100}%`, background: tempColor(288 * Math.pow(p, 0.325) - 273) }} />
          ))}
        </div>
        <div style={{ opacity: 0.75, fontSize: 12 }}>Słupki: ciśnienie za kolejnymi stopniami, kolor – temperatura.</div>
        <VelocityTriangle st={st} />
        <div style={{ opacity: 0.75, fontSize: 12 }}>
          Łopatka widzi prędkość względną <b>w = c − U</b>. Przy niskich obrotach powietrze płynie wolniej osiowo, więc kąt napływu rośnie.
          Przymknięte VSV nadają strumieniowi zawirowanie zgodne z obrotem i przywracają właściwy kąt natarcia.
        </div>
        <CompressorMap st={st} piTot={piTot} n2={n2} />
        {st.stall ? (
          <div style={{ color: '#f87171', fontWeight: 600 }}>Punkt pracy nad linią pompażu – łopatki tracą „nośność”, przepływ się odrywa i cofa.</div>
        ) : (
          <div style={{ fontSize: 12 }}>
            zapas do pompażu ≈ <b>{fmt(st.margin * 100, 0)}%</b>
            {variable ? '' : ' – bez geometrii zmiennej maleje przy niskich obrotach'}
          </div>
        )}
      </EngineInfo>
    </>
  );
}

/* ======================= Krok 6: komora spalania ======================= */

type AirKind = 'swirl' | 'primary' | 'dilution' | 'cooling';
const AIR: Record<AirKind, { label: string; share: number; color: string; txt: string }> = {
  swirl: { label: 'przez zawirowywacze', share: 25, color: '#facc15', txt: 'miesza się z paliwem w strefie pierwotnej i krąży w wirze zwrotnym, który podtrzymuje płomień' },
  primary: { label: 'otwory pierwotne', share: 15, color: '#fb923c', txt: 'strugi z obu ścianek zamykają wir od tyłu i dostarczają tlenu do dopalenia' },
  dilution: { label: 'otwory rozcieńczające', share: 35, color: '#38bdf8', txt: 'zimne powietrze studzi spaliny do temperatury, którą zniesie turbina, i wyrównuje ich profil' },
  cooling: { label: 'chłodzenie ścianek', share: 25, color: '#a78bfa', txt: 'wpływa szczelinami wzdłuż ścianek i tworzy chłodną warstwę między płomieniem a blachą' },
};

/**
 * Drogi powietrza w komorze (x, r w j. przekroju, dθ – skręcenie przez zawirowywacz, faza: 0 – powietrze, 1 – strefa pierwotna, 2 – wylot).
 * Wszystkie zaczynają się w sprężarce, przechodzą przez dyfuzor i rozdzielają się na osłonach.
 */
type CP = [number, number, number, number];
function combPath(kind: AirKind, outer: boolean): CP[] {
  const m = (pts: [number, number, number?, number?][]): CP[] => pts.map(([x, r, d = 0, ph = 0]) => [x, r, d, ph]);
  const io = (o: number, i: number) => (outer ? o : i);
  const tail: [number, number, number, number][] = [
    [540, 48, 0.8, 2],
    [560, 47, 0.8, 2],
    [600, 47.5, 0.8, 2],
  ];
  if (kind === 'swirl')
    return m([[400, 48.5], [438, 45], [452, 47.5], [458, 48], [462, 48, 0.1, 1], [470, 53.5, 0.35, 1], [478, 50, 0.5, 1], [474, 44.5, 0.6, 1], [467, 46.5, 0.7, 1], [474, 51, 0.8, 1], [492, 49, 0.8, 1.4], [515, 48, 0.8, 1.8], ...tail]);
  const pre: [number, number][] = outer
    ? [[400, 53], [438, 49.8], [452, 56.5], [463, 61.5]]
    : [[400, 43.5], [438, 41], [452, 39.2], [463, 34.5]];
  if (kind === 'primary') {
    const h = COMB_HOLES.primary;
    return m([...pre, [h - 3, io(61.8, 34.2)], [h, io(58.6, 38)], [h + 2, io(54, 42.5), 0, 0.6], [h + 6, io(50.5, 46), 0.2, 1], [495, 49, 0.4, 1.3], [520, 48, 0.6, 1.8], ...tail]);
  }
  if (kind === 'dilution') {
    const h = COMB_HOLES.dilution;
    return m([...pre, [490, io(62, 34)], [h - 3, io(61.4, 34.6)], [h, io(58, 38.6)], [h + 2, io(53, 44)], [h + 7, io(50, 46.5), 0, 1.4], [528, 48.5, 0, 1.9], ...tail]);
  }
  // chłodzenie: wejście przy pierwszych szczelinach i dalej wzdłuż ścianki
  return m([...pre, [482, io(61.8, 34.3)], [486, io(57.8, 38.8)], [492, io(57.4, 39.2), 0, 0.5], [508, io(56.6, 39.9), 0, 0.6], [524, io(55.6, 40.8), 0, 0.7], [540, io(54.4, 41.6), 0, 0.8], [560, io(55, 40.5), 0, 0.9], [600, io(57, 38), 0, 0.9]]);
}

/** Wyraźna linia wybranej drogi powietrza (górą i dołem płomieniówki) ze strzałkami kierunku. */
function AirPathGuide({ kind }: { kind: AirKind }) {
  const th = 1.29;
  const lines = [true, false].map((outer) =>
    combPath(kind, outer)
      .filter(([x]) => x >= 425)
      .map(([x, r, d]) => [ax(x), r * S * Math.cos(th + d * 0.3), r * S * Math.sin(th + d * 0.3)] as [number, number, number]),
  );
  return (
    <group>
      {lines.map((pts, i) => (
        <group key={i}>
          <Line points={pts} color={AIR[kind].color} lineWidth={3} transparent opacity={0.95} depthTest={false} />
          {pts.slice(1).map((p, k) => {
            if (k % 2) return null;
            const a = pts[k];
            const dir: [number, number, number] = [(p[0] - a[0]) * 0.5, (p[1] - a[1]) * 0.5, (p[2] - a[2]) * 0.5];
            const len = Math.hypot(...dir);
            if (len < 0.03) return null;
            return <Arrow3D key={k} from={[a[0] + dir[0] * 0.6, a[1] + dir[1] * 0.6, a[2] + dir[2] * 0.6]} vec={[dir[0] * 0.8, dir[1] * 0.8, dir[2] * 0.8]} color={AIR[kind].color} radius={0.012} />;
          })}
        </group>
      ))}
    </group>
  );
}

function CombustorFlow({ fuel, focus }: { fuel: number; focus: AirKind | 'all' }) {
  const N = 340;
  const ref = useRef<TrailMesh>(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        // udział cząstek ≈ udziałowi powietrza
        const h = hash(i + 11) * 100;
        const kind: AirKind = h < 25 ? 'swirl' : h < 40 ? 'primary' : h < 75 ? 'dilution' : 'cooling';
        const pts = combPath(kind, hash(i + 31) > 0.5);
        const cum = [0];
        for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
        // kąt w obrębie wyciętej ćwiartki (ok. 0,55–2,0 rad) – w pozostałej części pierścienia cząstki i tak zasłania obudowa
        return { kind, pts, cum, u: hash(i + 7), a: 0.6 + hash(i + 91) * 1.35, j: (hash(i + 57) - 0.5) * 1.8 };
      }),
    [],
  );
  const Tp = 600 + 1450 * fuel;
  const TIT = 600 + 1000 * fuel;
  useFrame((_, dtRaw) => {
    const m = ref.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.05);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    const d = new THREE.Vector3();
    seeds.forEach((s, i) => {
      const L = s.cum[s.cum.length - 1];
      let dist = s.u * L;
      let k = 1;
      while (k < s.cum.length - 1 && s.cum[k] < dist) k++;
      const x0 = s.pts[k - 1][0];
      // prędkość: w dyfuzorze maleje, w komorze jest mała, za komorą (dysza turbiny) gwałtownie rośnie
      const v = x0 < 438 ? 1 : x0 < 460 ? 0.55 : x0 < 540 ? 0.38 : 1.7;
      s.u = (s.u + (dt * 70 * v) / L) % 1;
      dist = s.u * L;
      k = 1;
      while (k < s.cum.length - 1 && s.cum[k] < dist) k++;
      const p0 = s.pts[k - 1];
      const p1 = s.pts[k];
      const t = (dist - s.cum[k - 1]) / Math.max(1e-6, s.cum[k] - s.cum[k - 1]);
      const x = p0[0] + (p1[0] - p0[0]) * t;
      const r = (p0[1] + (p1[1] - p0[1]) * t + s.j * 0.6) * S;
      const th = s.a + p0[2] + (p1[2] - p0[2]) * t;
      const ph = p0[3] + (p1[3] - p0[3]) * t;
      o.position.set(ax(x), r * Math.cos(th), r * Math.sin(th));
      const r1 = p1[1] * S;
      const th1 = s.a + p1[2];
      d.set(ax(p1[0]) - ax(p0[0]), r1 * Math.cos(th1) - (p0[1] * S) * Math.cos(s.a + p0[2]), r1 * Math.sin(th1) - (p0[1] * S) * Math.sin(s.a + p0[2]));
      if (d.lengthSq() < 1e-8) d.set(1, 0, 0);
      o.quaternion.setFromUnitVectors(X_AXIS, d.normalize());
      const on = Math.min(1, s.u / 0.03) * Math.min(1, (1 - s.u) / 0.05);
      // wybrana droga: pozostałe cząstki znikają, wybrane są większe i jaśniejsze
      const picked = focus === 'all' || focus === s.kind;
      const dim = picked ? (focus === 'all' ? 1 : 1.6) : 0;
      const big = focus !== 'all' && picked ? 1.6 : 1;
      o.scale.set(on * (x > 540 ? 0.09 : 0.05) * big, on * 0.011 * big, on * 0.011 * big);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      // temperatura: powietrze 600 °C → strefa pierwotna → wylot (TIT); warstwa chłodząca zostaje chłodniejsza
      let T: number;
      if (s.kind === 'cooling') T = 600 + (TIT - 600) * 0.35 * ph;
      else if (ph <= 1) T = 600 + (Tp - 600) * ph;
      else T = Tp + (TIT - Tp) * Math.min(1, ph - 1);
      if (s.kind === 'dilution' && ph < 1.4) T = 600 + (TIT - 600) * Math.max(0, (ph - 1) / 0.4) * 0.6;
      c.set(focus === 'all' ? tempColor(T) : AIR[s.kind].color).multiplyScalar(dim);
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <Trails ref={ref} count={N} />
  );
}

function CombustorScene({ params }: SceneProps) {
  const fuel = Number(params.fuel ?? 0.7);
  const explode = Boolean(params.explode ?? false);
  const air = String(params.air ?? 'all') as AirKind | 'all';
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(), []);
  // poniżej ok. 5% mieszanka w strefie pierwotnej jest za uboga – płomień gaśnie
  const lit = fuel > 0.05;
  const f = lit ? fuel : 0;
  const TIT = 600 + 1000 * f;
  const Tp = 600 + 1450 * f;
  const afr = 1 / (0.012 + 0.014 * fuel);
  return (
    <>
      <Lights />
      <EngineOnPlane clickable={['comb']} elementLabels={['comb']} n1={30 + 60 * f} n2={70 + 28 * f} combustion={f} combDetail={!explode} cut explode={explode ? 0.35 : 0} explodable={['comb']} focus={['comb', 'hpc', 'hpt']} flow={false} labels={false} selected={sel ?? (explode ? 'comb' : null)} onSelect={setSel} />
      {!explode && <CombustorFlow fuel={f} focus={air} />}
      {!explode && air !== 'all' && <AirPathGuide kind={air} />}
      {!explode && (
        <>
          <Tag pos={[ax(445), -0.72, 0]} color="#facc15" onClick={pick(setSel, 'comb:diffuser')}>
            dyfuzor · 600 °C · 42 bar
          </Tag>
          <Tag pos={[ax(478), 0.92, 0.3]} color={tempColor(Tp)} onClick={pick(setSel, 'comb:dome')}>
            strefa pierwotna · {lit ? `≈ ${fmt(Tp, 0)} °C` : 'płomień zgasł'}
          </Tag>
          <Tag pos={[ax(545), -0.78, 0]} color={tempColor(TIT)} onClick={pick(setSel, 'comb:liner')}>
            wylot · {fmt(TIT, 0)} °C
          </Tag>
        </>
      )}
      <EngineInfo sel={sel} rows={rows} hint={'Kliknij element komory spalania, aby przeczytać opis.'}>
        <div>
          temperatura przed turbiną (TIT) ≈ <b>{fmt(TIT, 0)} °C</b> · w strefie pierwotnej ≈ <b>{lit ? `${fmt(Tp, 0)} °C` : '–'}</b>
        </div>
        {!lit && <div style={{ color: '#f87171' }}>Za mało paliwa – mieszanka za uboga, płomień zgasł (flame-out).</div>}
        <div style={{ display: 'grid', gap: 4 }}>
          {(Object.keys(AIR) as AirKind[]).map((k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '10em 1fr 3em', gap: 6, alignItems: 'center', fontSize: 12, opacity: air === 'all' || air === k ? 1 : 0.4 }}>
              <span>{AIR[k].label}</span>
              <span style={{ height: 8, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${AIR[k].share * 2.5}%`, background: AIR[k].color }} />
              </span>
              <span style={{ color: AIR[k].color, textAlign: 'right' }}>{AIR[k].share}%</span>
            </div>
          ))}
        </div>
        {air !== 'all' && <div style={{ fontSize: 12 }}>{AIR[air].txt}.</div>}
        <div style={{ opacity: 0.75, fontSize: 12 }}>
          Cała komora pracuje „ubogo”: ok. 1 kg paliwa na {fmt(afr, 0)} kg powietrza. Spadek ciśnienia w komorze to tylko ok. 4%.
          {explode ? '' : ' Włącz rozłożenie, by zobaczyć wtryskiwacze i świece osobno.'}
        </div>
      </EngineInfo>
    </>
  );
}

/* ======================= Krok 7: turbina i wały ======================= */

const CONFIGS: Record<SpoolCfg, { name: string; rpm: Record<string, number>; fanR: number; note: string }> = {
  jet1: { name: 'turboodrzutowy jednowałowy', rpm: { hp: 13000 }, fanR: 0, note: 'Jedna turbina napędza całą sprężarkę. Prosty, ale sprężarka nie może kręcić się z optymalną prędkością we wszystkich stopniach.' },
  tf2: { name: 'turbowentylator dwuwałowy', rpm: { lp: 5200, hp: 14500 }, fanR: 0.88, note: 'Najpopularniejszy układ (CFM56, LEAP, GE90). Wał NP biegnie wewnątrz drążonego wału WP – oba obracają się niezależnie.' },
  tf3: { name: 'turbowentylator trójwałowy', rpm: { lp: 2700, ip: 8000, hp: 12500 }, fanR: 1.5, note: 'Trzy wały pozwalają każdej części sprężarki kręcić się z najlepszą dla niej prędkością.' },
  gtf: { name: 'turbowentylator z przekładnią (GTF)', rpm: { fan: 3300, lp: 10000, hp: 22000 }, fanR: 1.03, note: 'Przekładnia planetarna (ok. 3 : 1) między wałem NP a wentylatorem: wielki wentylator kręci się wolno, a turbina NP szybko (Pratt & Whitney PW1000G).' },
};
const SPOOL_TXT: Record<string, [string, string]> = { lp: ['wał NP (N1)', '#38bdf8'], ip: ['wał SP', '#4ade80'], hp: ['wał WP (N2)', '#f87171'], fan: ['wentylator', '#7dd3fc'] };

/** Schemat: która turbina napędza którą sprężarkę – kolory jak na modelu. */
function SpoolSchematic({ cfg }: { cfg: SpoolCfg }) {
  const W = 300;
  const H = 96;
  const one = cfg === 'jet1';
  const C = { lp: '#38bdf8', ip: '#4ade80', hp: '#f87171' };
  const lpcC = one ? C.hp : cfg === 'tf3' ? C.ip : C.lp;
  const box = (x: number, w: number, h: number, fill: string, label: string) => (
    <g>
      <rect x={x} y={48 - h / 2} width={w} height={h} fill={fill} opacity="0.85" />
      <text x={x + w / 2} y={48 + h / 2 + 11} fontSize="8.5" fill="rgba(255,255,255,0.7)" textAnchor="middle">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      {!one && box(10, 16, 62, C.lp, 'wentylator')}
      {box(38, 30, 34, lpcC, one ? 'sprężarka' : cfg === 'tf3' ? 'spręż. SP' : 'spręż. NP')}
      {box(76, 70, 26, C.hp, 'sprężarka WP')}
      <rect x={150} y={36} width={26} height={24} fill="#fb923c" opacity="0.7" />
      <text x={163} y={71} fontSize="8.5" fill="rgba(255,255,255,0.7)" textAnchor="middle">
        komora
      </text>
      {box(180, 16, 28, C.hp, 'turb. WP')}
      {cfg === 'tf3' && box(200, 14, 32, C.ip, 'SP')}
      {box(cfg === 'tf3' ? 218 : 200, cfg === 'tf3' ? 40 : 54, 40, one ? C.hp : C.lp, one ? 'turbina' : 'turbina NP')}
      {/* wały: NP najdłuższy, w środku; WP krótki, drążony, na zewnątrz */}
      {!one && <line x1={18} y1={48} x2={250} y2={48} stroke={C.lp} strokeWidth="3" />}
      {cfg === 'tf3' && <line x1={53} y1={43} x2={207} y2={43} stroke={C.ip} strokeWidth="3" />}
      {cfg === 'tf3' && <line x1={53} y1={53} x2={207} y2={53} stroke={C.ip} strokeWidth="3" />}
      <line x1={one ? 53 : 90} y1={cfg === 'tf3' ? 38 : 41} x2={188} y2={cfg === 'tf3' ? 38 : 41} stroke={C.hp} strokeWidth="3" />
      <line x1={one ? 53 : 90} y1={cfg === 'tf3' ? 58 : 55} x2={188} y2={cfg === 'tf3' ? 58 : 55} stroke={C.hp} strokeWidth="3" />
      {one && <line x1={53} y1={48} x2={226} y2={48} stroke={C.hp} strokeWidth="3" />}
      {cfg === 'gtf' && (
        <g>
          <circle cx={32} cy={48} r={7} fill="#0b1020" stroke="#facc15" strokeWidth="2" />
          <text x={32} y={14} fontSize="8.5" fill="#facc15" textAnchor="middle">
            przekładnia 3 : 1
          </text>
        </g>
      )}
      {/* łożyska */}
      {(one ? [3, 4] : [1, 2, 3, 4, 5]).map((id) => {
        const x = { 1: 22, 2: 30, 3: 86, 4: 190, 5: 252 }[id] as number;
        return (
          <g key={id}>
            <rect x={x - 3} y={id === 3 || id === 4 ? 31 : 40} width={6} height={4} fill="#e5e7eb" />
            <text x={x} y={id === 3 || id === 4 ? 28 : 37} fontSize="7" fill="#e5e7eb" textAnchor="middle">
              {id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SpoolScene({ params }: SceneProps) {
  const sp = useSpeed();
  const cfgId = String(params.cfg ?? 'tf2') as SpoolCfg;
  const cfg = CONFIGS[cfgId];
  const thr = Number(params.throttle ?? 80) / 100;
  const showBearings = Boolean(params.bearings ?? true);
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(9, cfgId), [cfgId]);
  const { n1, n2 } = thrOf(thr);
  const pct: Record<string, number> = { lp: n1, fan: n1, ip: 45 + 55 * thr, hp: n2 };
  const maxRpm = Math.max(...Object.values(cfg.rpm));
  // moc turbin (klasa CFM LEAP przy starcie): turbina WP ≈ 26 MW, NP ≈ 24 MW; rośnie mocno z obrotami
  const pw = Math.pow(Math.max(0.05, thr), 1.6);
  const one = cfgId === 'jet1';
  const power: [string, string, number, string][] = one
    ? [['turbina', 'sprężarka', 30 * pw, '#f87171']]
    : cfgId === 'tf3'
      ? [
          ['turbina WP', 'sprężarka WP', 22 * pw, '#f87171'],
          ['turbina SP', 'sprężarka SP', 12 * pw, '#4ade80'],
          ['turbina NP', 'wentylator', 34 * pw, '#38bdf8'],
        ]
      : [
          ['turbina WP', 'sprężarka WP', 26 * pw, '#f87171'],
          ['turbina NP', cfgId === 'gtf' ? 'przekładnia → wentylator i sprężarka NP' : 'wentylator i sprężarka NP', 24 * pw, '#38bdf8'],
        ];
  // stan gazu przed turbiną, między turbinami i za nimi (przy danej dźwigni)
  const k = 0.55 + 0.45 * thr;
  const gas: [string, number, number][] = [
    ['przed turbiną WP', 600 + 1000 * k, 40 * k],
    ['między turbinami', 450 + 600 * k, 10 * k],
    ['za turbiną NP', 400 + 250 * k, 1 + 0.6 * k],
  ];
  const fanTip = cfg.fanR ? ((pct.fan * cfg.rpm[cfgId === 'gtf' ? 'fan' : 'lp']) / 100) * ((2 * Math.PI) / 60) * cfg.fanR : 0;
  return (
    <>
      <Lights />
      <EngineOnPlane clickable={['fan', 'lpc', 'hpc', 'hpt', 'lpt', 'shafts']} n1={n1} n2={n2} spools={cfgId} colorBySpool cut flow={false} labels={false} selected={sel} onSelect={setSel} />
      {showBearings &&
        BEARINGS.filter((b) => !(one && b.spool === 'lp')).map((b) => (
          <Tag key={b.id} pos={[ax(b.x), -(b.id % 2 ? 0.55 : 0.75) - (b.spool === 'hp' ? 0.15 : 0), 0.25]} color="#e5e7eb" onClick={pick(setSel, 'shafts:bearing')}>
            łożysko {b.id} · {b.kind === 'ball' ? 'kulkowe' : 'wałeczkowe'}
          </Tag>
        ))}
      <EngineInfo sel={sel} rows={rows} hint={'Kliknij wał, łożysko albo wieniec wirnika, aby przeczytać opis.'}>
        <div style={{ fontWeight: 700 }}>{cfg.name}</div>
        <SpoolSchematic cfg={cfgId} />
        <div style={{ display: 'grid', gap: 3 }}>
          {Object.entries(cfg.rpm).map(([key, v]) => {
            const rpm = (v * pct[key]) / 100;
            return (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '7.5em 1fr 6.5em', gap: 6, alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: SPOOL_TXT[key][1] }}>{one ? 'wał (N)' : SPOOL_TXT[key][0]}</span>
                <span style={{ height: 8, background: 'rgba(255,255,255,0.08)' }}>
                  <span style={{ display: 'block', height: '100%', width: `${(rpm / maxRpm) * 100}%`, background: SPOOL_TXT[key][1] }} />
                </span>
                <span style={{ textAlign: 'right' }}>{fmt(rpm, 0)} obr/min</span>
              </div>
            );
          })}
        </div>
        {fanTip > 0 && (
          <div style={{ fontSize: 12 }}>
            końcówki łopat wentylatora: <b>{sp.fmt(fanTip)}</b> (Ma ≈ {fmt(fanTip / 340, 2)}){fanTip > 380 ? ' – prędkość ponaddźwiękowa, stąd „piłowy” dźwięk przy starcie' : ''}
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 600 }}>Bilans mocy – każda turbina napędza swoją sprężarkę:</div>
        {power.map(([a, b, p, c]) => (
          <div key={a} style={{ fontSize: 12 }}>
            <span style={{ color: c }}>{a}</span> → {b}: <b>{fmt(p, 1)} MW</b>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 11 }}>
          {gas.map(([n, T, p]) => (
            <div key={n} style={{ padding: '4px 6px', background: 'rgba(255,255,255,0.05)' }}>
              <div style={{ opacity: 0.7 }}>{n}</div>
              <div style={{ color: tempColor(T), fontWeight: 700 }}>{fmt(T, 0)} °C</div>
              <div>{fmt(p, p < 10 ? 1 : 0)} bar</div>
            </div>
          ))}
        </div>
        <div style={{ opacity: 0.75, fontSize: 12 }}>{cfg.note}</div>
        <div style={{ opacity: 0.6, fontSize: 12 }}>
          Jedna łopatka turbiny WP oddaje przy starcie kilkaset kilowatów, a siła odśrodkowa ciągnie ją tak mocno, jakby wisiało na niej kilkanaście ton. Wirniki pokolorowano według
          wałów; szare wieńce to nieruchome kierownice.
        </div>
      </EngineInfo>
    </>
  );
}

/* ======================= Krok 8: bypass ======================= */

const BPR_EXAMPLES: [number, string, string][] = [
  [0, 'Olympus', 'Concorde'],
  [0.4, 'F100', 'F-16'],
  [1.7, 'JT8D', 'Boeing 727'],
  [5.5, 'CFM56', 'A320, 737'],
  [9, 'GE90', 'Boeing 777'],
  [11, 'LEAP', 'A320neo, 737 MAX'],
  [12.5, 'PW1100G', 'A320neo (GTF)'],
];

export const fanScaleOf = (bpr: number) => (bpr < 0.15 ? 0 : 0.5 + 0.5 * Math.sqrt(bpr / 5));

/**
 * Ta sama moc rdzenia (100 kg/s spalin rozpędzonych z 230 do 900 m/s), rozłożona na coraz większą masę powietrza.
 * Do tego opór i masa gondoli rosnące mniej więcej z czwartą potęgą średnicy wentylatora.
 */
function bypassModel(bpr: number, v0: number) {
  const mc = 100;
  const P = 0.5 * mc * (900 * 900 - 230 * 230);
  const m = mc * (1 + bpr);
  const vj = Math.sqrt((2 * P) / m + v0 * v0);
  const F = (m * (vj - v0)) / 1000;
  const eta = v0 > 0 ? 2 / (1 + vj / v0) : 0;
  const fs = fanScaleOf(bpr);
  const D = fs > 0 ? 1.6 * fs : 0.9; // średnica wentylatora (albo wlotu turboodrzutowego) [m]
  const drag = 0.5 * Math.pow(D, 4) * Math.pow(v0 / 230, 2); // opór i „kara” za masę gondoli [kN]
  return { m, vj, F, eta, D, drag, Fnet: F - drag };
}

function engineKind(bpr: number) {
  if (bpr < 0.15) return 'turboodrzutowy – całe powietrze przez rdzeń';
  if (bpr < 2.2) return 'małe obejście – długa gondola, strumienie mieszają się przed wspólną dyszą';
  if (bpr < 12) return 'duże obejście – krótka gondola, osobne dysze zimnego i gorącego strumienia';
  return 'bardzo duże obejście – wentylator napędzany przez przekładnię';
}

function BypassChart({ bpr, v0 }: { bpr: number; v0: number }) {
  const W = 300;
  const H = 128;
  const X = (b: number) => 26 + (b / 13) * (W - 36);
  const Y = (v: number) => H - 18 - v * (H - 30);
  const bs = Array.from({ length: 66 }, (_, i) => (i / 65) * 13);
  const ref = bypassModel(0, v0);
  const best = bypassModel(13, v0);
  const path = (f: (b: number) => number) => bs.map((b, i) => `${i ? 'L' : 'M'}${X(b).toFixed(1)},${Y(f(b)).toFixed(1)}`).join(' ');
  // paliwo na 1 kN ciągu (z oporem gondoli), względem turboodrzutowego – mniej = lepiej
  const fuel = (b: number) => ref.Fnet / bypassModel(b, v0).Fnet;
  const noise = (b: number) => (80 * Math.log10(bypassModel(b, v0).vj / ref.vj)) / -40;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      <line x1={X(0)} y1={Y(0)} x2={X(13)} y2={Y(0)} stroke="rgba(255,255,255,0.3)" />
      {[0, 2, 4, 6, 8, 10, 12].map((b) => (
        <text key={b} x={X(b)} y={H - 6} fontSize="8" fill="rgba(255,255,255,0.55)" textAnchor="middle">
          {b}
        </text>
      ))}
      <text x={W - 6} y={H - 6} fontSize="8" fill="rgba(255,255,255,0.55)" textAnchor="end">
        BPR
      </text>
      <path d={path((b) => bypassModel(b, v0).eta)} fill="none" stroke="#facc15" strokeWidth="1.8" />
      <path d={path(fuel)} fill="none" stroke="#c084fc" strokeWidth="1.8" />
      <path d={path((b) => Math.min(1, noise(b)))} fill="none" stroke="#38bdf8" strokeWidth="1.4" strokeDasharray="4 3" />
      <path d={path((b) => bypassModel(b, v0).F / best.F)} fill="none" stroke="#4ade80" strokeWidth="1.2" opacity="0.8" />
      {BPR_EXAMPLES.map(([b, n]) => (
        <g key={n}>
          <circle cx={X(b)} cy={Y(bypassModel(b, v0).eta)} r="2.6" fill="#facc15" />
          <text x={X(b)} y={Y(bypassModel(b, v0).eta) - 5} fontSize="7" fill="rgba(255,255,255,0.7)" textAnchor="middle">
            {n}
          </text>
        </g>
      ))}
      <line x1={X(bpr)} y1={8} x2={X(bpr)} y2={Y(0)} stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
      {(
        [
          ['sprawność', '#facc15'],
          ['paliwo/ciąg', '#c084fc'],
          ['ciąg', '#4ade80'],
          ['cisza', '#38bdf8'],
        ] as const
      ).map(([n, c], i) => (
        <text key={n} x={30 + i * 62} y="12" fontSize="8" fill={c}>
          {n}
        </text>
      ))}
    </svg>
  );
}

function BypassScene({ params }: SceneProps) {
  const sp = useSpeed();
  const bpr = Number(params.bpr ?? 5);
  const v0 = Number(params.v0 ?? 230);
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const res = bypassModel(bpr, v0);
  const ref = bypassModel(0, v0);
  const noise = 80 * Math.log10(res.vj / ref.vj);
  const ex = BPR_EXAMPLES.reduce((b, e) => (Math.abs(e[0] - bpr) < Math.abs(b[0] - bpr) ? e : b));
  const fs = fanScaleOf(bpr);
  const gear = bpr >= 12;
  const bars = [
    { label: 'ciąg', v: res.F / bypassModel(13, v0).F, txt: `${fmt(res.F, 0)} kN`, c: '#4ade80' },
    { label: 'sprawność napędowa', v: res.eta, txt: `${fmt(res.eta * 100, 0)}%`, c: '#facc15' },
    { label: 'prędkość strumienia', v: res.vj / 900, txt: sp.fmt(res.vj), c: '#fb923c' },
    { label: 'opór i masa gondoli', v: res.drag / 20, txt: `${fmt(res.drag, 1)} kN`, c: '#f87171' },
    { label: 'paliwo na 1 kN ciągu', v: ref.Fnet / res.Fnet, txt: `${fmt((ref.Fnet / res.Fnet) * 100, 0)}%`, c: '#c084fc' },
  ];
  return (
    <>
      <Lights />
      <EngineOnPlane clickable={['fan', 'bypass']} n1={85} n2={95} fanScale={fs} longDuct={bpr >= 0.15 && bpr < 2.2} spools={gear ? 'gtf' : 'tf2'} cut flow="plain" flowSpeed={0.35 + 0.9 * Math.min(1, res.vj / 900)} labels={false} selected={sel} onSelect={setSel} />
      <Tag pos={[ax(170), (fs > 0 ? 1.95 * fs : 0.9) + 0.25, 0]} color="#7dd3fc" onClick={fs > 0 ? pick(setSel, 'fan:blades') : undefined}>
        {fs > 0 ? `wentylator Ø ${fmt(res.D, 2)} m` : 'bez wentylatora'}
      </Tag>
      <Tag pos={[ax(1000), 0.9 + 0.35 * fs, 0]} color="#fb923c">
        strumień ≈ {sp.fmt(res.vj)}
      </Tag>
      <EngineInfo sel={sel} rows={rows} hint={'Kliknij wentylator albo gondolę, aby przeczytać opis.'}>
        <div>
          <b>BPR = {fmt(bpr, 1)} : 1</b> · najbliżej: {ex[1]} ({ex[2]})
        </div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{engineKind(bpr)}</div>
        {/* masa powietrza: rdzeń i obejście */}
        <div style={{ fontSize: 12 }}>
          powietrze: <b>{fmt(res.m, 0)} kg/s</b> – rdzeń 100, obejście {fmt(bpr * 100, 0)}
        </div>
        <div style={{ display: 'flex', height: 10, background: 'rgba(255,255,255,0.08)' }}>
          <span style={{ width: `${(100 / 1400) * 100}%`, background: '#fb923c' }} title="rdzeń" />
          <span style={{ width: `${((bpr * 100) / 1400) * 100}%`, background: '#7dd3fc' }} title="obejście" />
        </div>
        {bars.map((b) => (
          <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '9.5em 1fr 4.5em', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <span style={{ opacity: 0.75 }}>{b.label}</span>
            <span style={{ height: 8, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${clamp(b.v, 0.02, 1) * 100}%`, background: b.c }} />
            </span>
            <span style={{ color: b.c, textAlign: 'right' }}>{b.txt}</span>
          </div>
        ))}
        <div style={{ fontSize: 12 }}>hałas strumienia: {noise > -0.5 ? 'jak turboodrzutowy' : `${fmt(noise, 0)} dB względem turboodrzutowego`}</div>
        <BypassChart bpr={bpr} v0={v0} />
        <div style={{ opacity: 0.75, fontSize: 12 }}>
          Krzywe w funkcji BPR przy tej samej mocy rdzenia; kropki – prawdziwe silniki. Zysk z większego obejścia maleje, a gondola rośnie – stąd granica ok. 12–15.
          {gear ? ' Przy tak dużym wentylatorze model pokazuje przekładnię między wentylatorem a turbiną NP.' : ''}
        </div>
      </EngineInfo>
    </>
  );
}

/* ======================= Krok 9: odwracacz ciągu ======================= */

type RevType = 'kaskadowy' | 'drzwiowy' | 'klapowy';
type RevSeed = { u: number; f: number; a: number; d: number; g: number };
/** Promień w kanale obejściowym (j. przekroju): f = 0 przy osłonie rdzenia, 1 przy gondoli. */
const coldR = (x: number, f: number, k = 1) => {
  if (x < 196) return 84 + f * (156 * k - 84);
  const base = lerpTable(COWL3, Math.min(x, 765)) + 3;
  const top = x <= 600 ? lerpTable(NAC3_IN, x) * k - 3 : Math.max(base + 8, 126 * k + (x - 600) * 0.03);
  return base + f * (top - base);
};
/**
 * Droga jednej cząstki przy rewersie – łamana w 3D (x w j. przekroju wzdłuż osi, y i z w j. przekroju).
 * Cząstki zawracane płyną kanałem do przeszkody (drzwi, czasze), a potem wychodzą skośnie do przodu
 * dokładnie tam, gdzie dany typ rewersu otwiera drogę: przez kaskady, przez otwory drzwi albo szczeliną przed czaszami.
 */
function revPath(type: RevType, d: number, s: RevSeed, k = 1) {
  const pts: [number, number, number][] = [];
  const div = d > 0.05 && s.d < d;
  let a = s.a;
  if (type === 'drzwiowy' && div) {
    // tylko przez otwory czterech drzwi (między nimi stałe belki)
    const k = Math.floor(s.a / (Math.PI / 2));
    a = Math.PI / 4 + (k * Math.PI) / 2 + (s.g - 0.5) * 1.1;
  }
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const rad = (x: number, r: number) => pts.push([x, ca * r, sa * r]);
  let hot = false;
  if (type === 'klapowy') {
    // silnik o małym obejściu: wewnętrzna część strumienia to rdzeń, zewnętrzna – powietrze z kanału; za mieszalnikiem jeden strumień
    hot = s.f < 0.45;
    const r = (x: number) =>
      x < 196 ? 30 + s.f * 85 : x < 765 ? lerpTable(CORE_IN, x) + 2 + s.f * (lerpTable(LONG_IN, x) - 5 - lerpTable(CORE_IN, x)) : x <= 832 ? 10 + s.f * (lerpTable(LONG_IN, x) - 14) : (10 + s.f * 84) * (1 + (x - 832) * 0.0012);
    const xEnd = div ? 870 : 1040;
    for (let x = -40; x <= xEnd; x += 30) rad(x, r(x));
    if (div) {
      const sg = ca >= 0 ? 1 : -1;
      const z = sa * r(870);
      pts.push([935, ca * r(870) * 0.35, z * 1.05], [900, sg * 102, z * 1.25], [852, sg * 140, z * 1.45], [660, sg * 330, z * 2.3]);
    }
  } else if (type === 'kaskadowy') {
    if (!div) for (let x = -40; x <= 1040; x += 30) rad(x, coldR(x, s.f));
    else {
      const xb = 364 + 90 * d; // drzwi blokujące
      const wEnd = Math.min(446, 362 + 90 * d - 4); // tylna granica odsłoniętych kaskad
      const xc = 370 + s.g * Math.max(0, wEnd - 370);
      for (let x = -40; x < Math.min(xb - 25, xc); x += 30) rad(x, coldR(x, s.f));
      if (xb - 25 > xc + 14) rad(xb - 25, coldR(xb - 25, s.f));
      rad(xc + 12, 140);
      rad(xc + 2, 160);
      rad(xc - 10, 182);
      rad(xc - 165, 350);
    }
  } else {
    // mniejszy silnik (k – skala gondoli); strumień ucieka otworem drzwi wzdłuż ich wychylonej przedniej części
    if (!div) for (let x = -40; x <= 1040; x += 30) rad(x, coldR(x, s.f, k));
    else {
      for (let x = -40; x <= 490; x += 30) rad(x, coldR(x, s.f, k));
      const xo = s.g * 40;
      rad(505, coldR(505, s.f, k) * 0.9 + 10);
      rad(475 - xo, 150 * k);
      rad(450 - xo, 180 * k);
      rad(425 - xo, 205 * k);
      rad(260 - xo, 350 * k);
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0, z0] = pts[i - 1];
    const [x1, y1, z1] = pts[i];
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0, z1 - z0));
  }
  return { pts, cum, hot };
}

function ReverseFlow({ type, deploy, k }: { type: RevType; deploy: number; k: number }) {
  const N = 340;
  const ref = useRef<TrailMesh>(null);
  const seeds = useMemo<RevSeed[]>(() => Array.from({ length: N }, (_, i) => ({ u: hash(i), f: 0.1 + 0.8 * hash(i + 50), a: hash(i + 90) * Math.PI * 2, d: hash(i + 200), g: hash(i + 400) })), []);
  const paths = useMemo(() => seeds.map((s) => revPath(type, deploy, s, k)), [type, deploy, seeds, k]);
  useFrame((_, dtRaw) => {
    const m = ref.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.05);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    seeds.forEach((s, i) => {
      const { pts, cum, hot } = paths[i];
      const L = cum[cum.length - 1];
      s.u = (s.u + (dt * 380) / L) % 1;
      const dist = s.u * L;
      let k = 1;
      while (k < cum.length - 1 && cum[k] < dist) k++;
      const t = (dist - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]);
      const p0 = pts[k - 1];
      const p1 = pts[k];
      const x = p0[0] + (p1[0] - p0[0]) * t;
      o.position.set(ax(x), (p0[1] + (p1[1] - p0[1]) * t) * S, (p0[2] + (p1[2] - p0[2]) * t) * S);
      dir.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
      o.quaternion.setFromUnitVectors(X_AXIS, dir);
      const on = Math.min(1, s.u / 0.03) * Math.min(1, (1 - s.u) / 0.08);
      o.scale.set(on * 0.3, on * 0.02, on * 0.02);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, hot ? c.set(tempColor(x > 765 ? 380 : 620)) : c.set('#7dd3fc'));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <Trails ref={ref} count={N} />
  );
}
const X_AXIS = new THREE.Vector3(1, 0, 0);
const dir = new THREE.Vector3();

function ReverserScene({ params }: SceneProps) {
  const type = String(params.type ?? 'kaskadowy') as 'kaskadowy' | 'drzwiowy' | 'klapowy';
  const d = Number(params.deploy ?? 0);
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const net = type === 'klapowy' ? 1 - d * 1.5 : 1 - d * 1.25;
  // każdy typ na pasującym silniku: kaskadowy – duży wentylator (LEAP, nasz samolot), drzwiowy – mniejszy (CFM56), klapowy – małe obejście (Tay)
  const fs = type === 'klapowy' ? fanScaleOf(1.2) : type === 'drzwiowy' ? 0.9 : 1;
  return (
    <>
      <Lights />
      <EngineOnPlane clickable={['bypass', 'nozzle']} elementLabels={['rev']} n1={70} n2={88} fanScale={fs} cut reverser={{ type, deploy: d }} fuelFlow={2100} flow={d > 0.1 ? 'plain' : 'plain'} labels={false} selected={sel} onSelect={setSel} />
      {/* ECAM: przy otwieraniu odwracacza na wskaźnikach N1 pojawia się REV – bursztynowy w ruchu, zielony po pełnym otwarciu */}
      <CockpitDock>
        <Ecam
          thrMode={null}
          n1={[70, 70]}
          rev={[d, d]}
          egt={[640, 645]}
          page="ENG"
          eng={[ecamEng({ n1: 70, n2: 88, ff: 2100 }), ecamEng({ n1: 70, n2: 88, ff: 2100 })]}
          footer={{ tat: 18, sat: 18, isa: 3, flt: '07:11', time: '20:33:20', gw: 220000, gwcg: 28.5, fob: 9800 }}
          width={260}
        />
      </CockpitDock>
      {/* strumień w gondoli zawsze rysuje ReverseFlow – przy złożonym rewersie płynie prosto, więc nic nie „przeskakuje” */}
      <ReverseFlow type={type} deploy={d} k={fs} />
      <Arrow3D from={[ax(40), 2.7, 0]} vec={[-net * 2.2, 0, 0]} color={net >= 0 ? '#4ade80' : '#f87171'} radius={0.07} />
      <Tag pos={[ax(40) - net * 1.1, 3.2, 0]} color={net >= 0 ? '#4ade80' : '#f87171'}>
        {net >= 0 ? `ciąg do przodu ${fmt(net * 100, 0)}%` : `hamowanie ${fmt(-net * 100, 0)}%`}
      </Tag>
      <EngineInfo sel={sel} rows={rows} hint={'Kliknij element rewersu, aby przeczytać opis.'}>
        {type === 'kaskadowy' && <div>Osłona odsuwa się do tyłu, odsłania żółte kaskady, a czerwone drzwi blokujące zamykają kanał obejściowy. Zimny strumień wychodzi skośnie do przodu; rdzeń nadal pcha do przodu.</div>}
        {type === 'drzwiowy' && <div>Cztery obrotowe drzwi w gondoli (np. CFM56-5 w A320). Siłownik wypycha przednią krawędź na zewnątrz – tylna, czerwona strona wchodzi w kanał i go zamyka, a strumień ucieka otworem skośnie do przodu. Między drzwiami zostają stałe belki.</div>}
        {type === 'klapowy' && <div>Silnik o małym obejściu z długą gondolą (np. Rolls-Royce Tay w Fokkerze 100): oba strumienie mieszają się i wychodzą wspólną dyszą. Dwie czasze tworzą koniec gondoli; po obróceniu schodzą się za dyszą i odbijają cały strumień – gorący i zimny – do przodu.</div>}
        <div style={{ opacity: 0.75 }}>Wartości przybliżone, przy tym samym N1.</div>
      </EngineInfo>
    </>
  );
}

/* ======================= Krok 10: dopalacz ======================= */

function AfterburnerScene({ params }: SceneProps) {
  const ab = Boolean(params.ab ?? false);
  const noz = Number(params.nozzle ?? 0.3);
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const need = ab ? 0.75 : 0.3;
  const mismatch = noz - need;
  const thrust = (ab ? 155 : 100) * (1 - Math.abs(mismatch) * 0.6);
  const fuel = ab ? 380 : 100;
  return (
    <>
      <Lights />
      <EngineOnPlane clickable={['ab']} elementLabels={['ab']} n1={100} n2={100} fanScale={fanScaleOf(0.5)} cut afterburner={{ on: ab, nozzle: noz }} flow="temp" flowSpeed={1.3} labels selected={sel} onSelect={setSel} />
      <EngineInfo sel={sel} rows={rows} hint={'Kliknij element dopalacza albo dyszy, aby przeczytać opis.'}>
        <div>
          ciąg: <b>{fmt(thrust, 0)}%</b> · zużycie paliwa: <b>{fuel}%</b>
        </div>
        {Math.abs(mismatch) < 0.12 && <div style={{ color: '#4ade80' }}>Dysza dopasowana – turbina pracuje w normalnych warunkach.</div>}
        {mismatch <= -0.12 && <div style={{ color: '#f87171' }}>Dysza za wąska: gorące gazy dopalacza „dławią się”, rośnie ciśnienie za turbiną – grozi pompaż wentylatora i przegrzanie turbiny.</div>}
        {mismatch >= 0.12 && <div style={{ color: '#facc15' }}>Dysza za szeroka: spada ciśnienie za turbiną, silnik przyspiesza, ale ciąg maleje.</div>}
        <div style={{ opacity: 0.75 }}>Silnik z małym obejściem, jak w myśliwcu. Ciąg i zużycie paliwa – wartości umowne względem pracy bez dopalacza.</div>
      </EngineInfo>
    </>
  );
}

/* ======================= Krok 11: rozruch ======================= */

type StartScenario = 'normal' | 'hot' | 'hung' | 'wet';

interface StartState {
  n1: number;
  n2: number;
  egt: number;
  ff: number;
  starter: boolean;
  ign: boolean;
  fuel: boolean;
  /** Płomień w komorze (0…1) – przy mokrym starcie paliwo płynie, ale się nie zapala. */
  flame: number;
}

/** Odcięcie rozrusznika – N2 ≈ 50%. */
const T_CUT = 33.5;
/** Koniec przebiegu na wykresie. */
const T_END = 60;

/**
 * Przykładowy automatyczny rozruch turbowentylatora klasy CFM56 / LEAP (wartości zaokrąglone):
 * paliwo przy N2 ≈ 22%, zapłon w ciągu kilku sekund, limit EGT na rozruchu 725 °C,
 * odcięcie rozrusznika przy N2 ≈ 50%, bieg jałowy N1 ≈ 21%, N2 ≈ 62%.
 */
function startModel(t: number, sc: StartScenario): StartState {
  const crankN2 = 22 * smooth(0, 12, t); // samo kręcenie rozrusznikiem
  const crankN1 = 6 * smooth(8, 20, t);
  if (sc === 'hot') {
    if (t > 21) {
      // przerwanie: paliwo odcięte, rozrusznik dalej przewietrza silnik
      return { n1: 9 - 3 * smooth(21, 46, t), n2: 26 - 4 * smooth(21, 46, t), egt: 760 - 560 * smooth(21, 52, t), ff: 0, starter: t < 52, ign: false, fuel: false, flame: 0 };
    }
    const egt = t > 14 ? 20 + 740 * smooth(14, 21, t) : 20;
    return { n1: Math.max(crankN1, 9 * smooth(10, 21, t)), n2: t < 12 ? crankN2 : 22 + 4 * smooth(12, 21, t), egt, ff: t >= 12 ? 520 : 0, starter: true, ign: t >= 11, fuel: t >= 12, flame: t > 14 ? clamp((egt - 60) / 700, 0, 1) : 0 };
  }
  if (sc === 'wet') {
    // paliwo płynie, ale nie ma zapłonu: po 10 s bez wzrostu EGT – przerwanie i przedmuchanie na sucho
    const fuel = t >= 12 && t < 22;
    return { n1: crankN1, n2: crankN2 + 2 * smooth(12, 20, t), egt: 20 + 6 * smooth(12, 22, t), ff: fuel ? 240 : 0, starter: t < 52, ign: t >= 11 && t < 22, fuel, flame: 0 };
  }
  if (sc === 'hung') {
    // zapłon jest, ale silnik nie przyspiesza: N2 „zawisa” ok. 40%, EGT powoli rośnie – przerwanie po 34 s
    if (t > 34) return { n1: 13 - 5 * smooth(34, 55, t), n2: 41 - 17 * smooth(34, 55, t), egt: 690 - 520 * smooth(34, 58, t), ff: 0, starter: t < 55, ign: false, fuel: false, flame: 0 };
    const n2 = t < 12 ? crankN2 : 22 + 19 * smooth(14, 28, t);
    const egt = t > 14 ? 20 + 540 * smooth(14, 24, t) + 130 * smooth(24, 34, t) : 20;
    return { n1: Math.max(crankN1, 13 * smooth(10, 30, t)), n2, egt, ff: t >= 12 ? 300 : 0, starter: true, ign: t >= 11, fuel: t >= 12, flame: t > 14 ? clamp((egt - 60) / 700, 0, 1) : 0 };
  }
  const n2 = t < 12 ? crankN2 : 22 + 40 * smooth(14, 45, t);
  const n1 = Math.max(crankN1, 21 * smooth(8, 46, t));
  const fuel = t >= 12;
  const egt = t > 14 ? 20 + 600 * smooth(14, 24, t) - 160 * smooth(28, 45, t) : 20;
  const ff = fuel ? 220 + 120 * smooth(12, 30, t) - 40 * smooth(30, 45, t) : 0;
  return { n1, n2, egt, ff, starter: t < T_CUT, ign: t >= 11 && t < T_CUT, fuel, flame: t > 14 ? clamp((egt - 60) / 700, 0, 1) : 0 };
}

/** Przebieg N2 i EGT od początku rozruchu do chwili t. */
function StartChart({ t, sc }: { t: number; sc: StartScenario }) {
  const W = 300;
  const H = 74;
  const X = (tt: number) => 4 + (tt / T_END) * (W - 8);
  const Yn = (v: number) => H - 6 - (v / 100) * (H - 14);
  const Ye = (v: number) => H - 6 - (v / 1000) * (H - 14);
  const pts = useMemo(() => {
    const a: StartState[] = [];
    for (let tt = 0; tt <= T_END; tt += 0.5) a.push(startModel(tt, sc));
    return a;
  }, [sc]);
  const upto = pts.slice(0, Math.floor(t / 0.5) + 1);
  const line = (f: (s: StartState) => number) => upto.map((s, i) => `${i ? 'L' : 'M'}${X(i * 0.5).toFixed(1)},${f(s).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      <line x1={X(0)} x2={X(T_END)} y1={Ye(725)} y2={Ye(725)} stroke="#f87171" strokeDasharray="4 3" strokeWidth="1" />
      <text x={X(T_END) - 2} y={Ye(725) - 3} fill="#f87171" fontSize="8" textAnchor="end">
        limit EGT 725 °C
      </text>
      <line x1={X(0)} x2={X(T_END)} y1={Yn(50)} y2={Yn(50)} stroke="rgba(56,189,248,0.35)" strokeDasharray="2 3" strokeWidth="1" />
      <path d={line((s) => Yn(s.n2))} fill="none" stroke="#38bdf8" strokeWidth="1.8" />
      <path d={line((s) => Yn(s.n1))} fill="none" stroke="#a5f3fc" strokeWidth="1.2" opacity="0.7" />
      <path d={line((s) => Ye(s.egt))} fill="none" stroke="#fb923c" strokeWidth="1.8" />
      <line x1={X(t)} x2={X(t)} y1={4} y2={H - 4} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      <text x="8" y="12" fontSize="8" fill="#38bdf8">
        N2
      </text>
      <text x="22" y="12" fontSize="8" fill="#a5f3fc">
        N1
      </text>
      <text x="36" y="12" fontSize="8" fill="#fb923c">
        EGT
      </text>
    </svg>
  );
}

const START_EVENTS: Record<StartScenario, [number, string][]> = {
  normal: [
    [0, 'Zawór rozrusznika otwarty – powietrze z APU kręci turbinką rozrusznika, a ta przez skrzynkę napędów i wał promieniowy – wałem WP (N2)'],
    [8, 'Wentylator (N1) zaczyna się obracać – porywa go przepływ powietrza przez rdzeń'],
    [11, 'Wzbudnica zasila świece zapłonowe'],
    [12, 'N2 ≈ 22% – regulator paliwa otwiera dopływ, wtryskiwacze rozpylają paliwo'],
    [14, 'Zapłon (light-off) – płomień w komorze, rośnie EGT'],
    [T_CUT, 'N2 ≈ 50% – zawór rozrusznika zamknięty, zapłon wyłączony; turbina sama rozpędza silnik'],
    [45, 'Bieg jałowy ustabilizowany: N1 ≈ 21%, N2 ≈ 62%, EGT ≈ 460 °C'],
  ],
  hot: [
    [0, 'Zawór rozrusznika otwarty – N2 rośnie'],
    [12, 'Wtrysk paliwa przy N2 ≈ 22% – ale za dużo paliwa na zbyt małą ilość powietrza'],
    [14, 'Zapłon – EGT rośnie zbyt szybko'],
    [20, 'EGT przekracza limit 725 °C – gorący start!'],
    [21, 'PRZERWANIE: odcięcie paliwa, rozrusznik kręci dalej „na sucho” i wydmuchuje ciepło'],
    [46, 'Silnik schłodzony – przed kolejną próbą trzeba znaleźć przyczynę i sprawdzić turbinę'],
  ],
  hung: [
    [0, 'Zawór rozrusznika otwarty – N2 rośnie'],
    [12, 'Wtrysk paliwa przy N2 ≈ 22%'],
    [14, 'Zapłon – EGT rośnie normalnie'],
    [26, 'N2 przestaje rosnąć przy ok. 40% – turbina daje za mało mocy, by przyspieszyć sprężarkę'],
    [30, 'ZAWIS: obroty stoją, a EGT dalej powoli rośnie'],
    [34, 'PRZERWANIE: odcięcie paliwa, rozrusznik przewietrza silnik'],
  ],
  wet: [
    [0, 'Zawór rozrusznika otwarty – N2 rośnie'],
    [11, 'Świece zapłonowe włączone'],
    [12, 'Wtrysk paliwa przy N2 ≈ 22%'],
    [16, 'Brak zapłonu – EGT się nie zmienia, a paliwo zbiera się w komorze'],
    [22, 'PRZERWANIE po 10 s bez zapłonu: odcięcie paliwa i zapłonu'],
    [23, 'Kręcenie „na sucho” – rozrusznik wydmuchuje niespalone paliwo, żeby następna próba nie skończyła się wybuchem płomienia z dyszy'],
  ],
};

/* ---------- podpisy instalacji rozruchowej (sam osprzęt jest częścią EngineModel) ---------- */

function StartTags({ s, setSel }: { s: { starter: boolean; fuel: boolean; ign: boolean }; setSel: (f: (s: string | null) => string | null) => void }) {
  return (
    <>
      <Tag pos={accP(314, 1.02, ACC_TH - 0.27)} color={s.starter ? '#38bdf8' : '#94a3b8'} onClick={pick(setSel, 'acc:starter')}>
        rozrusznik pneumatyczny
      </Tag>
      <Tag pos={accP(400, 1.45, 0.55)} color={s.starter ? '#4ade80' : '#94a3b8'} onClick={pick(setSel, 'acc:sav')}>
        zawór rozrusznika {s.starter ? '– otwarty' : '– zamknięty'}
      </Tag>
      <Tag pos={accP(346, 0.68)} color="#cbd5e1" onClick={pick(setSel, 'acc:agb')}>
        skrzynka napędów
      </Tag>
      <Tag pos={accP(387, 1.02, ACC_TH + 0.27)} color={s.fuel ? '#fb923c' : '#94a3b8'} onClick={pick(setSel, 'acc:hmu')}>
        regulator paliwa
      </Tag>
      <Tag pos={accP(470, 1.1)} color={s.ign ? '#facc15' : '#94a3b8'} onClick={pick(setSel, 'acc:exciter')}>
        wzbudnica zapłonu
      </Tag>
    </>
  );
}

function StartInner({ run, sc, speed }: { run: boolean; sc: StartScenario; speed: number }) {
  const t = Math.min(T_END, useAnimationClock(run, speed));
  const s = startModel(t, sc);
  const evs = START_EVENTS[sc];
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const cur = [...evs].reverse().find(([te]) => t >= te);
  const bad = (txt: string) => /PRZERW|gorący|ZAWIS|Brak/.test(txt);
  return (
    <>
      <Lights />
      <EngineOnPlane phase="ground" clickable={['acc', 'comb']} n1={s.n1} n2={s.n2} cut combustion={s.flame} ignite={s.ign} start={{ starter: s.starter, fuel: s.fuel, ign: s.ign }} fuelFlow={s.ff} flow="temp" flowSpeed={(s.n2 / 62) * 0.5} labels={false} selected={sel} onSelect={setSel} />
      <StartTags s={s} setSel={setSel} />
      <Tag pos={[ax(495), -1.2, 0]} color={s.egt > 725 ? '#f87171' : '#fb923c'}>
        EGT {fmt(s.egt, 0)} °C
      </Tag>
      <CockpitDock>
        <Ecam
          thrMode={null}
          n1={[s.n1, 21]}
          egt={[s.egt, 460]}
          egtLimit={725}
          memo={s.ign ? [['IGNITION', AIRBUS.green]] : []}
          page="ENG"
          eng={[ecamEng({ n1: s.n1, n2: s.n2, ff: s.ff }), ecamEng({ n1: 21, n2: 62, ff: 300 })]}
          footer={{ tat: 18, sat: 18, isa: 3, flt: '00:00', time: '05:12:30', fob: 98000 }}
          width={260}
        />
      </CockpitDock>
      <EngineInfo sel={sel} rows={rows} hint="Kliknij element osprzętu (rozrusznik, skrzynkę napędów, regulator…) albo komorę, aby przeczytać opis.">
        <div style={{ fontSize: 12, opacity: 0.8 }}>Parametry pokazuje ECAM w lewym dolnym rogu: N1, EGT, przepływ paliwa i obroty wałów (N3 – wał wysokiego ciśnienia, kręcony przez rozrusznik).</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
          {(
            [
              ['rozrusznik', s.starter, '#38bdf8'],
              ['zapłon', s.ign, '#facc15'],
              ['paliwo', s.fuel, '#fb923c'],
              ['płomień', s.flame > 0.05, '#f97316'],
            ] as const
          ).map(([n, on, c]) => (
            <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: on ? c : 'rgba(255,255,255,0.15)' }} />
              {n}
            </span>
          ))}
          <span style={{ opacity: 0.6 }}>t = {fmt(t, 0)} s</span>
        </div>
        <StartChart t={t} sc={sc} />
        {run ? (
          <div style={{ display: 'grid', gap: 3, fontSize: 12 }}>
            {evs.map(([te, txt]) => {
              const done = t >= te;
              const now = cur?.[0] === te;
              return (
                <div key={te} style={{ display: 'grid', gridTemplateColumns: '2.6em 1fr', gap: 6, opacity: done ? (now ? 1 : 0.55) : 0.25, fontWeight: now ? 600 : 400, color: now && bad(txt) ? '#f87171' : undefined }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(te, 0)} s</span>
                  <span>{txt}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#facc15' }}>Włącz „Uruchom silnik”, aby zacząć sekwencję.</div>
        )}
      </EngineInfo>
    </>
  );
}

function StartScene({ params }: SceneProps) {
  const run = Boolean(params.run ?? false);
  const sc = String(params.scenario ?? 'normal') as StartScenario;
  const speed = Number(params.speed ?? 1.5);
  return <StartInner key={`${run}-${sc}`} run={run} sc={sc} speed={speed} />;
}

/* ======================= osprzęt silnika z bliska ======================= */

function AccessoryScene({ params }: SceneProps) {
  const run = Boolean(params.run ?? true);
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(), []);
  // bieg jałowy na ziemi albo silnik wyłączony (wtedy nic nie płynie i nic się nie kręci)
  const n1 = useEased(run ? 21 : 0);
  const n2 = useEased(run ? 62 : 0);
  return (
    <>
      <Lights />
      <EngineOnPlane phase="ground" clickable={['acc']} elementLabels={['acc']} n1={n1} n2={n2} cut combustion={run ? 0.25 : 0} fuelFlow={run ? 300 * Math.min(1, n2 / 62) : 0} flow={false} labels={false} selected={sel} onSelect={setSel} />
      <CockpitDock>
        <Ecam
          thrMode={null}
          n1={[n1, 21]}
          egt={[run ? 460 : 30, 460]}
          page="ENG"
          eng={[ecamEng({ n1, n2, ff: run ? 300 * Math.min(1, n2 / 62) : 0 }), ecamEng({ n1: 21, n2: 62, ff: 300 })]}
          footer={{ tat: 18, sat: 18, isa: 3, flt: '00:00', time: '05:20:10', fob: 98000 }}
          width={260}
        />
      </CockpitDock>
      <EngineInfo sel={sel} rows={rows} hint="Kliknij urządzenie albo jego podpis, aby przeczytać opis. Żółte kropki to olej, pomarańczowe – paliwo." />
    </>
  );
}

/* ======================= Krok 12: awarie w locie ======================= */

type FailId = 'surge' | 'bird' | 'fbo' | 'flameout' | 'fire' | 'oil' | 'ash' | 'turbine';
type Tb = [number, number][];
type MsgLevel = 'red' | 'amber' | 'info';

interface FailDef {
  label: string;
  /** Przebiegi w czasie (s) – interpolacja liniowa. */
  n1: Tb;
  n2: Tb;
  egt: Tb;
  ff: Tb;
  vib?: Tb;
  oilP?: Tb;
  oilT?: Tb;
  oilQ?: Tb;
  flame?: Tb;
  ign?: [number, number];
  /** Efekty 3D (0…1). */
  fx?: Partial<Record<'fire' | 'leak' | 'agent' | 'rain' | 'ash' | 'elmo' | 'sparks' | 'bird' | 'fbo' | 'smoke', Tb>>;
  /** Chwile huków pompażu. */
  surges?: number[];
  fanDamage?: [number, number];
  msgs: [number, number, string, MsgLevel][];
  /**
   * Procedura ECAM pod alarmem: [od, wykonane, polecenie]. Polecenie widać od chwili `od` do wykonania; `{T}`
   * w tekście to sekundy pozostałe do wykonania (odliczanie przed butlą gaśniczą).
   */
  proc?: [number, number, string][];
  /** Okres migania MASTER WARN (alarm czerwony). */
  master?: [number, number];
  events: [number, string][];
  note: string;
}

const FAILS: Record<FailId, FailDef> = {
  surge: {
    label: 'pompaż sprężarki',
    n1: [[0, 88], [5, 88], [5.6, 70], [6.2, 84], [6.8, 66], [7.4, 80], [8, 64], [9, 72], [12, 80], [14, 80], [17, 68], [60, 68]],
    n2: [[0, 95], [5, 95], [5.6, 88], [6.2, 93], [6.8, 86], [7.4, 91], [8, 85], [10, 90], [14, 92], [17, 87], [60, 87]],
    egt: [[0, 780], [5, 780], [5.6, 880], [6.2, 830], [6.8, 930], [7.4, 870], [8, 965], [10, 860], [14, 790], [17, 690], [60, 680]],
    ff: [[0, 1150], [5, 1150], [5.6, 1100], [7, 900], [8, 700], [10, 950], [14, 980], [17, 780], [60, 780]],
    vib: [[0, 0.6], [5, 0.6], [5.6, 3], [8, 3.5], [10, 1.2], [14, 0.8], [60, 0.8]],
    surges: [5.6, 6.8, 8],
    msgs: [
      [5.6, 10, 'ENG 1 STALL', 'red'],
      [8, 10.5, 'ENG 1 EGT OVER LIMIT', 'amber'],
    ],
    events: [
      [0, 'Przelot na FL350, silnik pracuje normalnie'],
      [5, 'Zaburzony napływ (silna turbulencja, duży kąt natarcia): strumień w sprężarce WP odrywa się od łopatek'],
      [5.6, 'POMPAŻ: przepływ na ułamek sekundy cofa się – huk, płomień z wlotu i z dyszy, skok EGT'],
      [6.8, 'Kolejne huki – cykl powtarza się, dopóki sprężarka nie „złapie” przepływu'],
      [8, 'FADEC zmniejsza dawkę paliwa i otwiera zawory upustowe, by odciążyć sprężarkę'],
      [10, 'Przepływ przywrócony – obroty i EGT wracają'],
      [14, 'Załoga zmniejsza ciąg i obserwuje silnik; po locie – przegląd boroskopowy łopatek'],
    ],
    note: 'Pompaż to „czkawka” sprężarki: ciśnienie za nią na chwilę przewyższa to, co łopatki są w stanie utrzymać, i strumień zawraca.',
  },
  bird: {
    label: 'zderzenie z ptakiem',
    n1: [[0, 92], [5, 92], [5.3, 86], [6, 90], [12, 90], [14, 75], [28, 75], [31, 30], [36, 12], [60, 11]],
    n2: [[0, 97], [5, 97], [5.3, 94], [12, 96], [14, 88], [28, 88], [31, 45], [36, 14], [60, 12]],
    egt: [[0, 850], [5, 850], [5.5, 960], [7, 900], [12, 890], [14, 780], [28, 790], [31, 500], [40, 180], [60, 80]],
    ff: [[0, 2600], [12, 2600], [14, 1600], [28, 1600], [30, 0], [60, 0]],
    vib: [[0, 0.6], [5, 0.6], [5.2, 6.5], [12, 6], [14, 4.2], [28, 4.4], [31, 3], [36, 2.2], [60, 2]],
    oilP: [[0, 55], [30, 50], [34, 8], [60, 6]],
    flame: [[0, 1], [30, 1], [30.5, 0], [60, 0]],
    surges: [5.3, 5.9],
    fanDamage: [5, 1],
    fx: { bird: [[0, 0], [4.3, 0], [4.35, 1], [5.6, 1], [5.7, 0], [60, 0]] },
    msgs: [
      [5.3, 7, 'ENG 1 STALL', 'red'],
      [5.2, 60, 'ENG 1 N1 VIB HI', 'amber'],
      [30, 60, 'ENG 1 SHUT DOWN', 'amber'],
    ],
    events: [
      [0, 'Wznoszenie po starcie, 3000 ft, ciąg wznoszenia'],
      [4.3, 'Przed samolotem stado gęsi'],
      [5, 'Ptak trafia w wentylator – trzy łopaty zginają się na końcach'],
      [5.3, 'Uszkodzony wentylator zaburza przepływ – krótki pompaż'],
      [7, 'Drgania N1 wysoko ponad normę, EGT nieco wyższa, w kabinie zapach spalenizny'],
      [12, 'Załoga zmniejsza ciąg – drgania maleją, ale zostają wysokie'],
      [28, 'Decyzja: wyłączenie zapobiegawcze i powrót na lotnisko na jednym silniku'],
      [31, 'Paliwo odcięte – silnik wiatrakuje: kręci go pęd powietrza (N1 ≈ 11%)'],
    ],
    note: 'Przy certyfikacji silnik musi przejść próby zassania ptaków: średni ptak nie może go wyłączyć, a duży nie może spowodować pożaru ani rozerwania obudowy.',
  },
  fbo: {
    label: 'urwanie łopaty wentylatora',
    n1: [[0, 88], [5, 88], [5.4, 60], [7, 45], [9, 30], [12, 18], [16, 12], [60, 10]],
    n2: [[0, 95], [5, 95], [5.4, 92], [8, 80], [10, 60], [14, 25], [18, 12], [60, 10]],
    egt: [[0, 780], [5, 780], [5.5, 900], [8, 820], [10, 500], [16, 250], [60, 90]],
    ff: [[0, 1150], [5, 1150], [8, 400], [9, 0], [60, 0]],
    vib: [[0, 0.6], [5, 0.6], [5.1, 10], [9, 10], [12, 8], [18, 5], [60, 4.5]],
    oilP: [[0, 55], [8, 45], [14, 10], [60, 6]],
    flame: [[0, 1], [9, 1], [9.3, 0], [60, 0]],
    surges: [5.4],
    fanDamage: [5, 2],
    fx: { fbo: [[0, 0], [5, 0], [5.05, 1], [6.2, 0.4], [7, 0], [60, 0]] },
    msgs: [
      [5.1, 60, 'ENG 1 N1 VIB HI', 'red'],
      [5.4, 7, 'ENG 1 STALL', 'red'],
      [9, 60, 'ENG 1 SHUT DOWN', 'amber'],
    ],
    events: [
      [0, 'Przelot, FL370'],
      [5, 'Pęknięcie zmęczeniowe u nasady – jedna łopata wentylatora odrywa się przy ok. 3800 obr/min'],
      [5.1, 'Pancerz obudowy wentylatora (kevlar) zatrzymuje fragmenty – nic nie przebija gondoli'],
      [5.4, 'Ogromne niewyważenie: drgania na maksimum, łopaty trą o obudowę, wentylator gwałtownie zwalnia'],
      [8, 'Załoga: dźwignia na jałowy, potem odcięcie paliwa'],
      [12, 'Bezpieczniki w mocowaniu łożyska wentylatora odłączają je – drgania przenoszone na skrzydło maleją'],
      [16, 'Silnik wiatrakuje z niewyważeniem – samolot zniża się i leci na lotnisko zapasowe'],
    ],
    note: 'Na próbach certyfikacyjnych łopatę urywa się ładunkiem wybuchowym przy pełnych obrotach – obudowa musi ją zatrzymać.',
  },
  flameout: {
    label: 'zgaśnięcie płomienia w ulewie',
    n1: [[0, 30], [9, 30], [11, 22], [14, 15], [16, 14], [19, 20], [24, 28], [60, 30]],
    n2: [[0, 70], [9, 70], [11, 58], [14, 38], [16.5, 34], [19, 52], [24, 66], [60, 70]],
    egt: [[0, 520], [9, 520], [9.5, 420], [11, 250], [14, 150], [16.5, 170], [17.5, 460], [19, 560], [24, 520], [60, 520]],
    ff: [[0, 400], [14, 400], [16, 380], [24, 400], [60, 400]],
    flame: [[0, 1], [9, 1], [9.6, 0], [16.5, 0], [17.5, 0.8], [24, 1], [60, 1]],
    ign: [5, 40],
    fx: { rain: [[0, 0], [3, 0], [4, 1], [38, 1], [40, 0], [60, 0]] },
    msgs: [
      [5, 40, 'ENG 1 IGN – zapłon ciągły (auto)', 'info'],
      [9.6, 17, 'ENG 1 FLAMEOUT', 'amber'],
      [17, 24, 'ENG 1 RELIGHT', 'info'],
    ],
    events: [
      [0, 'Zniżanie na biegu jałowym, wlot w ulewę z gradem'],
      [4, 'Ogromne ilości wody i lodu wpadają do silnika – wentylator odrzuca część na zewnątrz, reszta trafia do rdzenia'],
      [5, 'FADEC sam włącza zapłon ciągły (obie świece) – zabezpieczenie przed zgaśnięciem'],
      [9.5, 'Woda gasi płomień w komorze – EGT gwałtownie spada, N2 maleje'],
      [11, 'FLAMEOUT: silnik wiatrakuje, świece dalej iskrzą, paliwo płynie'],
      [16.5, 'Ponowny zapłon przy N2 ≈ 34% – pęd powietrza wystarcza, rozrusznik niepotrzebny'],
      [19, 'Silnik wraca na bieg jałowy'],
      [40, 'Po wyjściu z ulewy zapłon ciągły się wyłącza'],
    ],
    note: 'Na biegu jałowym przez komorę płynie mało powietrza i paliwa – płomień najłatwiej zgasić właśnie przy zniżaniu.',
  },
  fire: {
    label: 'pożar silnika',
    // po odcięciu paliwa silnik wiatrakuje: pęd powietrza kręci wentylatorem i rdzeniem
    n1: [[0, 88], [12, 88], [13, 35], [15, 30], [17, 18], [22, 12], [70, 11]],
    n2: [[0, 95], [12, 95], [13, 72], [15, 70], [17, 40], [22, 14], [70, 12]],
    egt: [[0, 780], [9, 790], [12, 800], [13, 560], [15, 540], [17, 350], [25, 180], [56, 140], [70, 70]],
    ff: [[0, 1150], [5, 1150], [6, 1320], [12, 1320], [13, 500], [15, 0], [70, 0]],
    flame: [[0, 1], [15, 1], [15.4, 0], [70, 0]],
    oilT: [[0, 95], [9, 100], [15, 110], [30, 85], [70, 60]],
    fx: {
      leak: [[0, 0], [5, 0], [5.5, 1], [16, 1], [16.5, 0], [70, 0]],
      // po butli 1 ogień słabnie, ale się tli; po 30 s butla 2 gasi go całkowicie
      fire: [[0, 0], [8.5, 0], [9.5, 0.7], [12, 1], [26, 1], [28, 0.55], [40, 0.4], [55, 0.45], [56.5, 0.2], [58, 0], [70, 0]],
      smoke: [[0, 0], [9, 0], [11, 1], [56, 0.8], [63, 0], [70, 0]],
      agent: [[0, 0], [26, 0], [26.3, 1], [30, 0.6], [33, 0], [56, 0], [56.3, 1], [60, 0.6], [63, 0], [70, 0]],
    },
    msgs: [
      [6, 9, 'FUEL – zużycie paliwa za duże jak na ciąg', 'amber'],
      [9, 58, 'ENG 1 FIRE', 'red'],
      [16, 70, 'ENG 1 FIRE P/B – odcięte paliwo, powietrze, hydraulika', 'info'],
      [26, 70, 'AGENT 1 DISCH', 'info'],
      [56, 70, 'AGENT 2 DISCH', 'info'],
      [58, 70, 'ENG 1 SHUT DOWN', 'amber'],
    ],
    // procedura ENG FIRE w locie (jak na ECAM A350): polecenia znikają po wykonaniu
    master: [9, 12],
    proc: [
      [9, 12, 'THR LEVER 1 ............ IDLE'],
      [9, 15, 'ENG MASTER 1 ............ OFF'],
      [9, 16, 'ENG 1 FIRE P/B ......... PUSH'],
      [16, 26, 'AGENT 1 AFTER {T} S .... DISCH'],
      [16, 30, 'ATC .................. NOTIFY'],
      [26, 56, 'IF FIRE AFTER 30 S:'],
      [26, 56, ' AGENT 2 .............. DISCH'],
    ],
    events: [
      [0, 'Przelot'],
      [5, 'Pęka przewód paliwowy w przedziale rdzenia – paliwo pod ciśnieniem rozpyla się na gorące obudowy'],
      [6, 'Przepływ paliwa większy, niż wynika z ciągu – pierwszy sygnał wycieku'],
      [9, 'Opary zapalają się od gorącej obudowy turbiny: pożar w przedziale rdzenia, pętle czujników ognia alarmują'],
      [12, 'Załoga: dźwignia ciągu na jałowy'],
      [15, 'Odcięcie paliwa (ENG MASTER OFF) – silnik gaśnie'],
      [16, 'Wciśnięty przycisk pożarowy: zamknięty zawór paliwa w pylonie, odcięte powietrze upustowe, hydraulika i generator'],
      [26, 'Butla gaśnicza 1 (10 s po przycisku pożarowym) – środek gaśniczy wypełnia przedział, ogień słabnie'],
      [30, 'Załoga zgłasza sytuację kontroli ruchu (MAYDAY)'],
      [56, 'Po 30 s czujniki dalej widzą ogień – butla 2'],
      [58, 'Ogień zgaszony – silnik wyłączony, lot do najbliższego lotniska na jednym silniku'],
    ],
    note: 'Gondola jest podzielona przegrodami ogniowymi na przedziały – każdy ma własne czujniki i dysze gaśnicze.',
  },
  oil: {
    label: 'utrata oleju (łożysko)',
    n1: [[0, 88], [23, 88], [24, 40], [27, 30], [30, 14], [60, 11]],
    n2: [[0, 95], [23, 95], [24, 72], [27, 70], [30, 18], [60, 12]],
    egt: [[0, 780], [23, 790], [24, 560], [27, 540], [30, 300], [60, 100]],
    ff: [[0, 1150], [23, 1150], [24, 500], [27, 500], [28, 0], [60, 0]],
    vib: [[0, 0.6], [18, 0.6], [22, 1.8], [26, 2.6], [30, 1.5], [60, 1.2]],
    oilP: [[0, 55], [5, 55], [20, 26], [25, 14], [27, 10], [30, 6], [60, 4]],
    oilT: [[0, 115], [5, 115], [20, 140], [26, 158], [30, 150], [60, 90]],
    oilQ: [[0, 16], [5, 16], [20, 6], [26, 2], [60, 1]],
    flame: [[0, 1], [28, 1], [28.4, 0], [60, 0]],
    fx: { smoke: [[0, 0], [8, 0], [10, 0.6], [28, 0.6], [32, 0], [60, 0]] },
    msgs: [
      [20, 60, 'ENG 1 OIL LO PR', 'amber'],
      [22, 28, 'ENG 1 OIL HI TEMP', 'amber'],
      [27, 60, 'ENG 1 OIL LO PR – poniżej czerwonej kreski', 'red'],
      [28, 60, 'ENG 1 SHUT DOWN', 'amber'],
    ],
    events: [
      [0, 'Przelot – ciśnienie oleju ok. 55 psi, 16 kwart w zbiorniku'],
      [5, 'Pęknięta uszczelka łożyska – olej ucieka do strumienia powietrza'],
      [10, 'Za dyszą ciągnie się niebieskawy dym spalanego oleju'],
      [14, 'Ilość oleju spada, ciśnienie maleje, a temperatura rośnie – mniej oleju odbiera to samo ciepło'],
      [20, 'Ciśnienie w strefie pomarańczowej'],
      [22, 'Rosną drgania – łożysko zaczyna się przegrzewać'],
      [24, 'Załoga: ciąg na jałowy'],
      [27, 'Ciśnienie poniżej czerwonej kreski (13 psi): silnik trzeba wyłączyć, zanim łożysko się zatrze'],
      [28, 'Odcięcie paliwa, silnik wiatrakuje'],
    ],
    note: 'Zatarte łożysko może zablokować wał albo rozgrzać go do pęknięcia – dlatego niskie ciśnienie oleju oznacza wyłączenie silnika.',
  },
  ash: {
    label: 'pył wulkaniczny',
    n1: [[0, 88], [8, 88], [12, 86], [14, 70], [15, 82], [16, 66], [18, 40], [22, 20], [36, 14], [40, 16], [44, 30], [50, 60], [60, 70]],
    n2: [[0, 95], [8, 95], [14, 90], [16, 84], [18, 60], [22, 30], [36, 24], [40, 30], [44, 58], [50, 85], [60, 88]],
    egt: [[0, 780], [3, 780], [8, 840], [12, 900], [14, 980], [16, 930], [17, 500], [22, 200], [38, 140], [41, 420], [44, 560], [50, 720], [60, 740]],
    ff: [[0, 1150], [16, 1150], [18, 600], [22, 500], [40, 500], [50, 950], [60, 1000]],
    flame: [[0, 1], [16.8, 1], [17.4, 0], [40.5, 0], [42, 0.7], [48, 1], [60, 1]],
    ign: [36, 48],
    surges: [14, 16],
    fx: { ash: [[0, 0], [2, 0], [3, 1], [30, 1], [34, 0], [60, 0]], elmo: [[0, 0], [2, 0], [3, 1], [30, 1], [33, 0], [60, 0]] },
    msgs: [
      [12, 17, 'ENG 1 EGT HI', 'amber'],
      [14, 17, 'ENG 1 STALL', 'red'],
      [17, 42, 'ENG DUAL FAILURE', 'red'],
      [36, 48, 'ENG 1 RELIGHT – rozrusznik + zapłon', 'info'],
    ],
    events: [
      [0, 'Nocny przelot; przed samolotem chmura pyłu wulkanicznego – radar jej nie widzi'],
      [3, 'Wlot w chmurę: na krawędziach wlotów i szybach ogień św. Elma, zapach siarki, pył w kabinie'],
      [8, 'Pył topi się w komorze (mięknie już w ok. 1100 °C) i osiada szkliwem na kierownicach turbiny – przepływ się dławi, EGT rośnie'],
      [14, 'Zdławiony przepływ wywołuje pompaż'],
      [17, 'Zgaśnięcie płomienia – w takich zdarzeniach (BA 9 w 1982, KLM 867 w 1989) gasły wszystkie silniki naraz'],
      [20, 'Załoga: ciąg na jałowy, zawrót o 180° i zniżanie, by wyjść z chmury'],
      [34, 'Poza chmurą, w chłodniejszym powietrzu, szkliwo kruszy się i odpada'],
      [36, 'Próby ponownego rozruchu z rozrusznikiem i zapłonem'],
      [42, 'Silnik zapala się – obroty rosną, ale osiągi zostają obniżone (erozja łopatek)'],
    ],
    note: 'Szkło wulkaniczne topi się w temperaturze niższej niż ta w komorze – dlatego od lat 90. omija się chmury pyłu szerokim łukiem.',
  },
  turbine: {
    label: 'urwanie łopatki turbiny',
    n1: [[0, 88], [5, 88], [5.5, 84], [10, 82], [12, 34], [17, 32], [19, 22], [24, 12], [60, 11]],
    n2: [[0, 95], [5, 95], [5.5, 91], [10, 90], [12, 70], [17, 68], [19, 30], [24, 13], [60, 12]],
    egt: [[0, 780], [5, 780], [5.5, 930], [9, 990], [12, 640], [17, 610], [19, 450], [28, 150], [60, 90]],
    ff: [[0, 1150], [5, 1150], [10, 1220], [12, 420], [17, 420], [18, 0], [60, 0]],
    vib: [[0, 0.6], [5, 0.6], [5.2, 7], [12, 6], [16, 6], [19, 3], [60, 2.4]],
    flame: [[0, 1], [18, 1], [18.4, 0], [60, 0]],
    surges: [5.5],
    fx: { sparks: [[0, 0], [5, 0], [5.1, 1], [7, 0.6], [10, 0.2], [12, 0], [60, 0]] },
    msgs: [
      [5.2, 60, 'ENG 1 N2 VIB HI', 'amber'],
      [8, 12, 'ENG 1 EGT OVER LIMIT', 'red'],
      [18, 60, 'ENG 1 SHUT DOWN', 'amber'],
    ],
    events: [
      [0, 'Przelot'],
      [5, 'Pęknięcie zmęczeniowe – łopatka turbiny WP (ok. 1500 °C, 15 000 obr/min) odrywa się'],
      [5.1, 'Odłamki przelatują przez turbinę NP i wylatują dyszą jako iskry – obudowa zatrzymuje większe kawałki'],
      [5.5, 'Uszkodzona turbina daje mniej mocy; FADEC dokłada paliwa, by utrzymać obroty – EGT rośnie'],
      [8, 'EGT ponad limit, wysokie drgania N2'],
      [12, 'Załoga: ciąg na jałowy – EGT spada, drgania zostają'],
      [18, 'Wyłączenie silnika; po lądowaniu silnik do wymiany'],
    ],
    note: 'Łopatki turbiny WP pracują w gazach gorętszych niż temperatura topnienia ich stopu – chroni je tylko chłodzenie i powłoka ceramiczna.',
  },
};

const F_END = 70;
const EGT_LIM = 950;

interface FailState {
  n1: number;
  n2: number;
  egt: number;
  ff: number;
  vib: number;
  oilP: number;
  oilT: number;
  oilQ: number;
  flame: number;
  ign: boolean;
  surge: number;
  fanDamage: number;
  fx: Record<string, number>;
}

function failModel(t: number, id: FailId): FailState {
  const d = FAILS[id];
  const v = (tb: Tb | undefined, def: number) => (tb ? lerpTable(tb, t) : def);
  // huk pompażu: krótki impuls wokół każdej chwili
  const surge = (d.surges ?? []).reduce((m, ts) => Math.max(m, Math.exp(-Math.pow((t - ts) / 0.22, 2))), 0);
  const fx: Record<string, number> = {};
  for (const [k, tb] of Object.entries(d.fx ?? {})) fx[k] = lerpTable(tb as Tb, t);
  return {
    n1: v(d.n1, 88),
    n2: v(d.n2, 95),
    egt: v(d.egt, 780),
    ff: v(d.ff, 1150),
    vib: v(d.vib, 0.6),
    oilP: v(d.oilP, 55 * Math.min(1, v(d.n2, 95) / 60)),
    oilT: v(d.oilT, 115),
    oilQ: v(d.oilQ, 16),
    flame: v(d.flame, 1),
    ign: d.ign ? t >= d.ign[0] && t < d.ign[1] : false,
    surge,
    fanDamage: d.fanDamage && t >= d.fanDamage[0] ? d.fanDamage[1] : 0,
    fx,
  };
}

/* ---------- efekty 3D ---------- */

type Seed = { a: number; b: number; c: number; d: number };
/** Rój cząstek: każda ma swoją fazę u ∈ [0, 1) zmieniającą się w czasie; fn ustawia pozycję i zwraca skalę. */
function Swarm({ n, period, active, color, size = 0.03, opacity = 0.9, additive = true, fn, seed = 0 }: { n: number; period: number; active: number; color: string; size?: number; opacity?: number; additive?: boolean; fn: (s: Seed, u: number, out: THREE.Vector3) => number; seed?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: n }, (_, i) => ({ a: hash(i + seed), b: hash(i + seed + 300), c: hash(i + seed + 600), d: hash(i + seed + 900) })), [n, seed]);
  const time = useRef(0);
  const act = useRef(active);
  act.current = active;
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    time.current += Math.min(dt, 0.05);
    const o = new THREE.Object3D();
    const p = new THREE.Vector3();
    seeds.forEach((s, i) => {
      const u = (s.a + time.current / period) % 1;
      const k = fn(s, u, p);
      // przy częściowej aktywności widać tylko część cząstek
      const on = s.d < act.current ? 1 : 0;
      o.position.copy(p);
      o.scale.setScalar(size * k * on);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} raycast={() => null} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

function FailFx({ s }: { s: FailState }) {
  const fx = s.fx;
  const fire = fx.fire ?? 0;
  const elmo = fx.elmo ?? 0;
  const flick = 0.75 + 0.25 * Math.sin(performance.now() / 45);
  return (
    <>
      {/* pompaż: płomień z wlotu (do przodu) i z dyszy */}
      {s.surge > 0.03 && (
        <>
          <group position={[ax(150), 0, 0]} rotation={[0, Math.PI, 0]}>
            <Flame len={1.6 * s.surge} r={0.75 * s.surge} intensity={s.surge} seed={3} hot={1} />
          </group>
          <group position={[ax(770), 0, 0]}>
            <Flame len={2.6 * s.surge} r={0.5} intensity={s.surge} seed={5} hot={1} />
          </group>
          <pointLight position={[ax(100), 0, 0.5]} color="#ff7a1a" intensity={18 * s.surge} distance={6} decay={2} />
        </>
      )}
      {/* pożar w przedziale rdzenia (pod osłoną rdzenia, widoczny w wyciętej ćwiartce) */}
      {fire > 0.02 &&
        Array.from({ length: 14 }, (_, k) => {
          const th = 0.75 + (k / 13) * 1.15 + (k % 2) * 0.05;
          const x = 470 + ((k * 37) % 150);
          return (
            <group key={k} rotation={[th, 0, 0]}>
              <group position={[ax(x), 1.06, 0]} rotation={[0, 0, 0.55]}>
                <Flame len={(0.3 + 0.25 * ((k * 7) % 3)) * fire} r={0.07} intensity={fire} seed={k} hot={fire} />
              </group>
            </group>
          );
        })}
      {fire > 0.02 && <pointLight position={accP(540, 1.2)} color="#ff6a00" intensity={9 * fire * flick} distance={4} decay={2} />}
      {/* dym z pożaru / spalanego oleju – ciągnie się do tyłu */}
      <Swarm
        n={60}
        period={2.2}
        active={Math.max(fx.smoke ?? 0, 0)}
        color={fire > 0.02 ? '#3f3f46' : '#93a3b8'}
        additive={false}
        opacity={0.35}
        size={0.12}
        seed={40}
        fn={(q, u, p) => {
          const oil = fire < 0.02;
          const x0 = oil ? 780 : 520;
          const th = oil ? q.b * Math.PI * 2 : 0.9 + q.b * 0.9;
          const r = (oil ? 0.2 + 0.4 * q.c : 1.1) + u * 0.6;
          p.set(ax(x0) + u * 4.5, r * Math.cos(th) + u * 0.4, r * Math.sin(th));
          return 0.6 + 2.2 * u;
        }}
      />
      {/* wyciek paliwa przy przewodzie paliwowym */}
      <Swarm
        n={40}
        period={0.6}
        active={fx.leak ?? 0}
        color="#fbbf24"
        size={0.012}
        seed={80}
        fn={(q, u, p) => {
          const [x, y, z] = accP(425, 1.0);
          p.set(x + (q.b - 0.3) * 0.6 * u, y + (q.c - 0.5) * 0.3 * u, z + 0.15 + u * 0.35 * q.c);
          return 1;
        }}
      />
      {/* środek gaśniczy wypełnia przedział rdzenia */}
      <Swarm
        n={90}
        period={1.6}
        active={fx.agent ?? 0}
        color="#e2e8f0"
        additive={false}
        opacity={0.45}
        size={0.07}
        seed={120}
        fn={(q, u, p) => {
          const th = q.b * Math.PI * 2;
          const r = 0.98 + 0.08 * q.c;
          p.set(ax(300 + q.c * 350) + u * 0.6, r * Math.cos(th), r * Math.sin(th));
          return 0.5 + u;
        }}
      />
      {/* ulewa z gradem leci w stronę wlotu */}
      <Swarm
        n={160}
        period={0.55}
        active={fx.rain ?? 0}
        color="#bae6fd"
        size={0.018}
        seed={200}
        fn={(q, u, p) => {
          const th = q.b * Math.PI * 2;
          const r = 2.2 * Math.sqrt(q.c);
          p.set(ax(-450) + u * (ax(150) - ax(-450)), r * Math.cos(th) * (1 - 0.3 * u), r * Math.sin(th) * (1 - 0.3 * u));
          return q.d > 0.85 ? 1.8 : 1;
        }}
      />
      {/* pył wulkaniczny */}
      <Swarm
        n={140}
        period={1.2}
        active={fx.ash ?? 0}
        color="#a8a29e"
        additive={false}
        opacity={0.6}
        size={0.016}
        seed={300}
        fn={(q, u, p) => {
          const th = q.b * Math.PI * 2;
          const r = 2.4 * Math.sqrt(q.c);
          p.set(ax(-400) + u * 12, r * Math.cos(th), r * Math.sin(th));
          return 1;
        }}
      />
      {/* ogień św. Elma na krawędzi wlotu */}
      {elmo > 0.02 && (
        <mesh position={[ax(66), 0, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
          <torusGeometry args={[1.66, 0.05, 10, 96]} />
          <meshBasicMaterial color="#a78bfa" transparent opacity={0.5 * elmo * flick} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <Swarm
        n={50}
        period={0.35}
        active={elmo}
        color="#c4b5fd"
        size={0.014}
        seed={400}
        fn={(q, u, p) => {
          const th = q.b * Math.PI * 2;
          const r = 1.66 + 0.12 * u * (q.c - 0.3);
          p.set(ax(62) - u * 0.15, r * Math.cos(th), r * Math.sin(th));
          return 1 - u;
        }}
      />
      {/* odłamki łopatki turbiny wylatują dyszą jako iskry */}
      <Swarm
        n={70}
        period={0.45}
        active={fx.sparks ?? 0}
        color="#fde68a"
        size={0.02}
        seed={500}
        fn={(q, u, p) => {
          const th = q.b * Math.PI * 2;
          const r = 0.1 + 0.6 * q.c * u;
          p.set(ax(640) + u * 4, r * Math.cos(th), r * Math.sin(th));
          return 1 - 0.6 * u;
        }}
      />
      {/* ptak nadlatuje, a po uderzeniu – szczątki i pióra przed wentylatorem */}
      {(fx.bird ?? 0) > 0 && <BirdFx t={s.fx.birdT ?? 0} />}
      {/* urwana łopata: iskry wzdłuż pancerza obudowy wentylatora */}
      <Swarm
        n={90}
        period={0.4}
        active={fx.fbo ?? 0}
        color="#fef3c7"
        size={0.022}
        seed={600}
        fn={(q, u, p) => {
          const th = q.b * Math.PI * 2 + u * 0.6;
          const r = 1.6 + 0.1 * u;
          p.set(ax(150) + (q.c - 0.5) * 0.3 - u * 0.4 * q.d, r * Math.cos(th), r * Math.sin(th));
          return 1 - u;
        }}
      />
    </>
  );
}

/** Ptak: do t = 0 nadlatuje, po uderzeniu (t > 0) – rozbłysk szczątków przed wentylatorem. */
function BirdFx({ t }: { t: number }) {
  if (t < 0) {
    const k = Math.max(0, 1 + t / 0.65);
    return (
      <mesh position={[ax(-600) + (ax(140) - ax(-600)) * k, 0.9 - 0.3 * k, 0.2]} raycast={() => null}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshStandardMaterial color="#57534e" roughness={0.9} />
      </mesh>
    );
  }
  const u = Math.min(1, t / 0.6);
  return (
    <group>
      {Array.from({ length: 26 }, (_, i) => {
        const th = hash(i + 700) * Math.PI * 2;
        const r = 0.5 + 1.0 * hash(i + 720) * u;
        return (
          <mesh key={i} position={[ax(140) - u * (0.3 + 0.8 * hash(i + 740)), 0.6 * Math.cos(th) + r * Math.cos(th) * 0.5, r * Math.sin(th)]} raycast={() => null}>
            <boxGeometry args={[0.05, 0.012, 0.025]} />
            <meshStandardMaterial color={i % 3 ? '#e7e5e4' : '#7f1d1d'} transparent opacity={1 - u} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Drgania: cały model trzęsie się z amplitudą zależną od wskazania VIB. */
function Shake({ vib, children }: { vib: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const a = Math.max(0, vib - 1) * 0.0045;
    const t = clock.elapsedTime;
    g.position.set(0, a * Math.sin(t * 61), a * Math.sin(t * 47 + 1));
  });
  return <group ref={ref}>{children}</group>;
}

function FailChart({ t, id }: { t: number; id: FailId }) {
  const W = 300;
  const H = 74;
  const X = (tt: number) => 4 + (tt / F_END) * (W - 8);
  const Yp = (v: number) => H - 6 - (v / 100) * (H - 14);
  const Ye = (v: number) => H - 6 - (v / 1100) * (H - 14);
  const pts = useMemo(() => {
    const a: FailState[] = [];
    for (let tt = 0; tt <= F_END; tt += 0.25) a.push(failModel(tt, id));
    return a;
  }, [id]);
  const upto = pts.slice(0, Math.floor(t / 0.25) + 1);
  const line = (f: (s: FailState) => number) => upto.map((s, i) => `${i ? 'L' : 'M'}${X(i * 0.25).toFixed(1)},${f(s).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }}>
      <rect x="0" y="0" width={W} height={H} rx="6" fill="rgba(255,255,255,0.04)" />
      <line x1={X(0)} x2={X(F_END)} y1={Ye(EGT_LIM)} y2={Ye(EGT_LIM)} stroke="#f87171" strokeDasharray="4 3" strokeWidth="1" />
      <text x={X(F_END) - 2} y={Ye(EGT_LIM) - 3} fill="#f87171" fontSize="8" textAnchor="end">
        limit EGT {EGT_LIM} °C
      </text>
      <path d={line((s) => Yp(s.n1))} fill="none" stroke="#38bdf8" strokeWidth="1.6" />
      <path d={line((s) => Yp(s.n2))} fill="none" stroke="#a5f3fc" strokeWidth="1.1" opacity="0.7" />
      <path d={line((s) => Ye(s.egt))} fill="none" stroke="#fb923c" strokeWidth="1.6" />
      <path d={line((s) => Yp(s.vib * 10))} fill="none" stroke="#c084fc" strokeWidth="1.3" />
      <path d={line((s) => Yp((s.oilP / 60) * 100))} fill="none" stroke="#4ade80" strokeWidth="1.1" opacity="0.8" />
      <line x1={X(t)} x2={X(t)} y1={4} y2={H - 4} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      {(
        [
          ['N1', '#38bdf8'],
          ['N2', '#a5f3fc'],
          ['EGT', '#fb923c'],
          ['VIB', '#c084fc'],
          ['OIL P', '#4ade80'],
        ] as const
      ).map(([n, c], i) => (
        <text key={n} x={8 + i * 26} y="12" fontSize="8" fill={c}>
          {n}
        </text>
      ))}
    </svg>
  );
}

const MSG_COLOR: Record<MsgLevel, string> = { red: '#f87171', amber: '#fbbf24', info: '#67e8f9' };
/** Komunikat w formie ECAM (same wielkie litery, cyfry i znaki jak w samolocie) – tylko takie trafiają na ekran. */
const ECAM_TEXT = /^[A-Z0-9 ./+-]+$/;

function FailInner({ run, id, speed }: { run: boolean; id: FailId; speed: number }) {
  const t = Math.min(F_END, useAnimationClock(run, speed));
  const def = FAILS[id];
  const s = failModel(t, id);
  // czas względem uderzenia ptaka (do animacji nadlatywania i szczątków)
  if (id === 'bird') s.fx.birdT = t - 5;
  const rows = useMemo(() => buildRows(), []);
  const cur = [...def.events].reverse().find(([te]) => t >= te);
  const msgs = def.msgs.filter(([a, b]) => t >= a && t < b);
  const comb = s.flame * clamp((s.egt - 100) / 800, 0.15, 1);
  return (
    <>
      <Lights />
      <Shake vib={s.vib}>
        <EngineOnPlane phase="flight" whole n1={s.n1} n2={s.n2} cut combustion={comb} ignite={s.ign} fanDamage={s.fanDamage} fuelFlow={s.ff} clickable={[]} flow="temp" flowSpeed={(s.n2 / 95) * 0.9} labels={false} />
        <FailFx s={s} />
      </Shake>
      <Tag pos={[ax(495), -1.2, 0]} color={s.egt > EGT_LIM ? '#f87171' : '#fb923c'}>
        EGT {fmt(s.egt, 0)} °C
      </Tag>
      <CockpitDock>
        <Ecam
          thrMode={['CLB', 92]}
          n1={[s.n1, 88]}
          egt={[s.egt, 742]}
          egtLimit={EGT_LIM}
          memo={msgs.filter(([, , m, lv]) => lv !== 'red' && ECAM_TEXT.test(m)).map(([, , m, lv]) => [m, MSG_COLOR[lv]] as [string, string])}
          warning={(() => {
            const red = msgs.find(([, , , lv]) => lv === 'red');
            if (!red) return null;
            const lines = (def.proc ?? []).filter(([a, b]) => t >= a && t < b).map(([, b, txt]) => txt.replace('{T}', String(Math.max(0, Math.ceil(b - t)))));
            return { title: red[2].split(' – ')[0], lines, master: !!def.master && t >= def.master[0] && t < def.master[1] };
          })()}
          page="ENG"
          eng={[ecamEng({ n1: s.n1, n2: s.n2, ff: s.ff, oilP: s.oilP, oilT: s.oilT, oilQ: s.oilQ, vib: s.vib }), ecamEng({ n1: 88, n2: 97, ff: 2690 })]}
          footer={{ tat: -36, sat: -66, isa: -3, flt: '03:16', time: '14:31:11', gw: 207400, gwcg: 30.6, fob: 34900 }}
          width={260}
        />
      </CockpitDock>
      <EngineInfo sel={null} rows={rows} hint={null}>

        <div style={{ display: 'grid', gap: 2, padding: '6px 8px', background: 'rgba(0,0,0,0.35)', fontFamily: 'ui-monospace, monospace', fontSize: 12, minHeight: 22 }}>
          {msgs.length ? (
            msgs.map(([, , m, lv]) => (
              <span key={m} style={{ color: MSG_COLOR[lv], fontWeight: 700 }}>
                {m}
              </span>
            ))
          ) : (
            <span style={{ color: '#4ade80' }}>brak ostrzeżeń</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
          {(
            [
              ['płomień', s.flame > 0.05, '#f97316'],
              ['zapłon', s.ign, '#facc15'],
              ['paliwo', s.ff > 1, '#fb923c'],
            ] as const
          ).map(([n, on, c]) => (
            <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: on ? c : 'rgba(255,255,255,0.15)' }} />
              {n}
            </span>
          ))}
          <span style={{ opacity: 0.6 }}>t = {fmt(t, 0)} s</span>
        </div>
        <FailChart t={t} id={id} />
        {run ? (
          <div style={{ display: 'grid', gap: 3, fontSize: 12 }}>
            {def.events.map(([te, txt]) => {
              const done = t >= te;
              const now = cur?.[0] === te;
              return (
                <div key={te} style={{ display: 'grid', gridTemplateColumns: '2.6em 1fr', gap: 6, opacity: done ? (now ? 1 : 0.55) : 0.25, fontWeight: now ? 600 : 400 }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(te, 0)} s</span>
                  <span>{txt}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#facc15' }}>Wybierz awarię i włącz „Start symulacji”.</div>
        )}
        <div style={{ opacity: 0.7, fontSize: 12 }}>{def.note}</div>
      </EngineInfo>
    </>
  );
}

function FailureScene({ params }: SceneProps) {
  const run = Boolean(params.run ?? false);
  const id = String(params.failure ?? 'surge') as FailId;
  const speed = Number(params.speed ?? 1);
  return <FailInner key={`${run}-${id}`} run={run} id={id} speed={speed} />;
}

/* ======================= Temat ======================= */

const CAM: [number, number, number] = [3.6, 1.6, 9.6];

export const jetEngine: Topic = {
  id: 'silnik-odrzutowy',
  title: 'Silnik odrzutowy od środka',
  subject: 'lotnictwo',
  summary: 'Interaktywny turbowentylator 3D, który rozkłada się na części: ciąg, droga powietrza, sprężarka, komora spalania, wały N1/N2, bypass, rewers, dopalacz, rozruch i awarie w locie.',
  accent: '#0ea5e9',
  glyph: '✈',
  steps: [
    {
      title: 'Turbowentylator w 3D',
      kind: '3d',
      scene: OverviewScene,
      camera: [5.0, 2.6, 13.5],
      target: [0, 0.6, 0],
      controls: [
        { type: 'slider', key: 'throttle', label: 'Dźwignia ciągu', min: 0, max: 100, step: 1, default: 60, unit: '%' },
        { type: 'slider', key: 'diam', label: 'Średnica wentylatora', min: 1.5, max: 3.4, step: 0.02, default: 1.98, decimals: 2, unit: 'm' },
        { type: 'slider', key: 'explode', label: 'Rozłożenie silnika', min: 0, max: 1, step: 0.01, default: 0, decimals: 2 },
        { type: 'toggle', key: 'cut', label: 'Przekrój (wycięcie)', default: true },
        { type: 'toggle', key: 'flow', label: 'Pokaż przepływ', default: true },
        { type: 'toggle', key: 'labels', label: 'Podpisy', default: true },
        { type: 'toggle', key: 'xray', label: 'Rentgen (przezroczyste obudowy)', default: false },
        { type: 'toggle', key: 'rotate', label: 'Obracaj model', default: false },
      ],
      body: (
        <>
          <p>
            Tak wygląda <strong>turbowentylator</strong> – silnik niemal każdego współczesnego samolotu pasażerskiego. Obróć
            model, zajrzyj do środka przez wycięcie i <strong>kliknij</strong> dowolną część, aby przeczytać jej opis.
          </p>
          <p>
            Przesuń suwak <strong>„Rozłożenie silnika”</strong>: gondola unosi się, a moduły rozsuwają wzdłuż osi. Kliknij
            wtedy moduł – rozłoży się dalej na pojedyncze wieńce łopatek, wtryskiwacze czy świece, i każdy z nich też da się
            kliknąć.
          </p>
          <p>
            Silnik ma dwa niezależne wały: <strong>N1</strong> (wentylator + sprężarka i turbina NP) i <strong>N2</strong>{' '}
            (sprężarka i turbina WP). Kręcą się wszystkie wirniki, a jasna łopatka na każdym z nich pokazuje, że N2 obraca się
            szybciej niż N1. Zwróć uwagę na spiralę na kołpaku – po niej obsługa na lotnisku widzi, czy wentylator się kręci.
          </p>
          <p>
            Zmień <strong>średnicę wentylatora</strong> – od CFM56 z Boeinga 737 (1,5 m) po GE9X z Boeinga 777X (3,4 m).
            W ramce zmieniają się masa, ciąg, <strong>spręż całkowity</strong> (ile razy sprężarki podnoszą ciśnienie),
            stosunek obejścia i liczba łopat: małe wentylatory mają wiele wąskich łopat z tytanu, duże – kilkanaście
            szerokich z kompozytu. Większy wentylator kręci się wolniej, bo końcówki łopat nie mogą przekroczyć ok. 450 m/s.
            Tryb <strong>rentgen</strong> pokazuje wnętrze bez wycinania, a <strong>obracanie</strong> pozwala obejrzeć silnik
            ze wszystkich stron.
          </p>
        </>
      ),
    },
    {
      title: 'Skąd się bierze ciąg',
      kind: '3d',
      scene: ThrustScene,
      camera: [0, 3.2, 19],
      target: [0, 0.3, 0],
      controls: [
        { type: 'slider', key: 'throttle', label: 'Dźwignia ciągu', min: 0, max: 100, step: 1, default: 100, unit: '%' },
        { type: 'slider', key: 'v0', label: 'Prędkość lotu v₀', min: 0, max: 260, step: 5, default: 0, unit: 'm/s' },
        { type: 'slider', key: 'h', label: 'Wysokość lotu', min: 0, max: 12000, step: 250, default: 0, unit: 'm' },
        {
          type: 'select',
          key: 'view',
          label: 'Widok',
          default: 'flow',
          options: [
            { value: 'flow', label: 'przepływ powietrza' },
            { value: 'forces', label: 'siły na częściach silnika' },
            { value: 'cv', label: 'objętość kontrolna (bilans pędu)' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Silnik odrzutowy to <strong>pompa pędu</strong>: zasysa powietrze, przyspiesza je i wyrzuca do tyłu. Zmiana pędu
            powietrza oznacza siłę – a reakcją na nią jest <strong>ciąg</strong> pchający samolot do przodu (zielona strzałka).
          </p>
          <p>
            <strong>F = ṁ · (vⱼ − v₀)</strong>: ciąg zależy od tego, ile powietrza na sekundę przechodzi przez silnik (ṁ) i o
            ile zostaje przyspieszone. Pilot nie ustawia tych wielkości osobno – przesuwa <strong>dźwignię ciągu</strong>, a
            wentylator kręci się szybciej, zasysa więcej powietrza i mocniej je rozpędza.
          </p>
          <p>
            Zwiększ prędkość lotu v₀: powietrze „wpada” do silnika już rozpędzone, więc różnica vⱼ − v₀ maleje i ciąg spada,
            choć ṁ trochę rośnie (spiętrzenie we wlocie). Podnieś wysokość: powietrze jest rzadsze, ṁ maleje – na 11 km ten
            sam silnik daje ok. 20–25% ciągu startowego, i tyle wystarcza w przelocie.
          </p>
          <p>
            Ten sam ciąg można uzyskać, przyspieszając <em>dużo</em> powietrza <em>trochę</em> albo <em>mało</em> powietrza{' '}
            <em>bardzo</em> – to klucz do zrozumienia bypassu. W turbowentylatorze większość ciągu daje zimny strumień
            z wentylatora, choć jest wolniejszy od gorącego.
          </p>
          <p>
            Przełącz <strong>widok</strong>. „Siły na częściach” pokazuje, że ciąg to suma ciśnień na wielu powierzchniach:
            wentylator, sprężarki i komora są pchane do przodu, a turbiny i dysza – do tyłu. „Objętość kontrolna” to sposób
            inżyniera: wystarczy porównać pęd powietrza wchodzącego i wychodzącego z pudełka wokół silnika.
          </p>
        </>
      ),
    },
    {
      title: 'Droga powietrza',
      kind: '3d',
      scene: SectionScene,
      camera: CAM,
      controls: [
        {
          type: 'select',
          key: 'stream',
          label: 'Strumień',
          default: 'both',
          options: [
            { value: 'both', label: 'oba' },
            { value: 'hot', label: 'gorący (rdzeń)' },
            { value: 'cold', label: 'zimny (obejście)' },
          ],
        },
        { type: 'toggle', key: 'follow', label: 'Śledź porcję powietrza', default: true },
        { type: 'toggle', key: 'trail', label: 'Ślad za porcją', default: true },
        { type: 'slider', key: 'pace', label: 'Tempo porcji', min: 0.25, max: 2, step: 0.05, default: 1, decimals: 2, unit: '×' },
        { type: 'slider', key: 'throttle', label: 'Dźwignia ciągu', min: 0, max: 100, step: 1, default: 70, unit: '%' },
      ],
      body: (
        <>
          <p>
            Silnik działa jak ciągły, „rozciągnięty” silnik spalinowy: <strong>ssanie → sprężanie → spalanie →
            rozprężanie</strong>. W tłokowym te takty dzieją się po kolei w jednym cylindrze, tu – jednocześnie, w różnych
            miejscach.
          </p>
          <p>
            Jasny znacznik to jedna porcja powietrza. Leci przez silnik, a model podświetla moduł, w którym akurat jest – w
            ramce widać bieżący takt, ciśnienie i temperaturę. Przełącz <strong>strumień</strong> na zimny: ta droga omija
            spalanie i turbiny, a mimo to daje większość ciągu.
          </p>
          <p>Zwróć uwagę: kropki w komorze zwalniają (tam powietrze musi płynąć wolno, żeby płomień nie zgasł), a w dyszy wyraźnie przyspieszają.</p>
          <p>
            Pasek w ramce pokazuje całą drogę porcji podzieloną na takty, a rysunek pod nim – te same takty w cylindrze
            silnika tłokowego. Naprawdę cała podróż przez rdzeń trwa kilkadziesiąt milisekund; tempo porcji możesz zmienić
            suwakiem, a pauzą na dole sceny – zatrzymać ją w dowolnym miejscu.
          </p>
        </>
      ),
    },
    {
      title: 'Ciśnienie, temperatura, prędkość',
      kind: '3d',
      scene: AlongScene,
      camera: [1.5, 1.8, 10],
      controls: [
        {
          type: 'select',
          key: 'q',
          label: 'Wielkość',
          default: 'p',
          options: [
            { value: 'p', label: 'ciśnienie' },
            { value: 'T', label: 'temperatura' },
            { value: 'v', label: 'prędkość' },
            { value: 'all', label: 'wszystkie trzy naraz' },
            { value: 'brayton', label: 'obieg Braytona (p–v)' },
            { value: 'ts', label: 'obieg Braytona (T–s)' },
          ],
        },
        {
          type: 'select',
          key: 'regime',
          label: 'Stan pracy',
          default: 'to',
          options: [
            { value: 'to', label: 'start (pełny ciąg)' },
            { value: 'cruise', label: 'przelot (11 km)' },
            { value: 'idle', label: 'bieg jałowy' },
          ],
        },
        { type: 'slider', key: 'x', label: 'Położenie w silniku', min: 0, max: 1000, step: 5, default: 440 },
        { type: 'toggle', key: 'stations', label: 'Numery stacji', default: true },
      ],
      body: (
        <>
          <p>
            Przesuwaj różową płaszczyznę przekroju wzdłuż silnika. Kropki przepływu są pokolorowane według wybranej wielkości,
            a wykres w ramce pokazuje jej przebieg. W sprężarce ciśnienie rośnie ok. <strong>40 razy</strong>, a temperatura do
            ok. 600 °C – samo sprężanie mocno grzeje.
          </p>
          <p>
            W komorze spalania ciśnienie prawie się nie zmienia, za to temperatura skacze do ok. <strong>1600 °C</strong>.
            Turbiny odbierają gazom energię (spadek ciśnienia i temperatury), a dysza zamienia resztę ciśnienia na prędkość.
          </p>
          <p>
            Wybierz <strong>obieg Braytona</strong>: to idealny model termodynamiczny silnika. Cztery przemiany tworzą
            pętlę – jej pole odpowiada pracy, którą silnik oddaje na każdy kilogram powietrza. W wersji <strong>T–s</strong>
            (temperatura–entropia) widać też straty: sprężanie i rozprężanie nie są idealnie pionowe.
          </p>
          <p>
            Inżynierowie opisują silnik <strong>stacjami</strong>: 2 – przed wentylatorem, 3 – za sprężarką, 4 – za komorą,
            5 – za turbiną, 9 – wylot dyszy. Tabela w ramce podaje wartości w każdej z nich. Zmień <strong>stan pracy</strong>:
            w przelocie na 11 km ciśnienia są ok. trzy razy niższe, bo powietrze jest rzadkie, a na biegu jałowym sprężarka
            prawie nie spręża i komora jest znacznie chłodniejsza.
          </p>
        </>
      ),
    },
    {
      title: 'Sprężarka osiowa',
      kind: '3d',
      scene: CompressorScene,
      camera: [0.5, 2.2, 4.6],
      target: [-0.9, 0, 0],
      controls: [
        { type: 'slider', key: 'stages', label: 'Liczba stopni sprężarki WP', min: 1, max: 14, step: 1, default: 9 },
        { type: 'slider', key: 'pis', label: 'Spręż stopnia (wzrost ciśnienia)', min: 1.1, max: 1.5, step: 0.01, default: 1.3, decimals: 2 },
        { type: 'slider', key: 'n2', label: 'Obroty N2', min: 50, max: 104, step: 1, default: 95, unit: '%' },
        { type: 'toggle', key: 'vsv', label: 'Geometria zmienna (VSV i VBV)', default: true },
        { type: 'toggle', key: 'explode', label: 'Rozłóż sprężarkę na stopnie', default: false },
      ],
      body: (
        <>
          <p>
            Każdy <strong>stopień</strong> sprężarki to para wieńców: <strong>wirnik</strong> (tytanowe, obracające się łopatki)
            i <strong>kierownica</strong> (nieruchome). Z tyłu łopatki są krótsze, węższe i jest ich więcej, a ostatnie wirniki
            są stalowe, bo powietrze jest tam już gorące. Zmieniaj liczbę stopni – model przebudowuje się na bieżąco.
          </p>
          <p>
            Wirnik nadaje powietrzu energię i skręca je w kierunku obrotu. Kanały między łopatkami się rozszerzają, więc
            powietrze zwalnia, a ciśnienie rośnie (dyfuzor). Kierownica prostuje strumień i dalej podnosi ciśnienie. Włącz
            rozłożenie i klikaj pojedyncze wieńce – zobaczysz ciśnienie i temperaturę w każdym miejscu.
          </p>
          <p>
            Jeden stopień daje tylko 1,2–1,4 razy więcej ciśnienia, ale spręże kolejnych stopni się <strong>mnożą</strong>: 1,3⁹ ≈ 10.
            Gdy stopień próbuje sprężyć za dużo, przepływ się odrywa i może dojść do <strong>pompażu</strong> – gwałtownego
            cofnięcia strumienia. Kanał zwęża się ku tyłowi, bo sprężone powietrze zajmuje coraz mniej miejsca.
          </p>
          <p>
            Zmniejsz <strong>N2</strong>: <strong>kierownice przestawne (VSV)</strong> przymykają się – widać, jak obraca się
            pierścień, dźwigienki i łopatki – a <strong>zawory VBV</strong> za sprężarką NP otwierają się i wypuszczają nadmiar
            powietrza. Wyłącz geometrię zmienną: przy niskich obrotach kąt natarcia rośnie, a punkt pracy na mapie przechodzi
            nad linię pompażu. Na obudowie widać też kolektory, którymi pobiera się sprężone powietrze dla samolotu.
          </p>
        </>
      ),
    },
    {
      title: 'Komora spalania',
      kind: '3d',
      scene: CombustorScene,
      camera: [2.2, 1.8, 4.2],
      target: [0.6, 0, 0],
      controls: [
        { type: 'slider', key: 'fuel', label: 'Przepływ paliwa', min: 0, max: 1, step: 0.01, default: 0.7, decimals: 2 },
        {
          type: 'select',
          key: 'air',
          label: 'Powietrze',
          default: 'all',
          options: [
            { value: 'all', label: 'wszystkie drogi (kolor = temperatura)' },
            { value: 'swirl', label: 'przez zawirowywacze' },
            { value: 'primary', label: 'otwory pierwotne' },
            { value: 'dilution', label: 'otwory rozcieńczające' },
            { value: 'cooling', label: 'chłodzenie ścianek' },
          ],
        },
        { type: 'toggle', key: 'explode', label: 'Rozłóż komorę', default: false },
      ],
      body: (
        <>
          <p>
            Za sprężarką powietrze pędzi zbyt szybko, by utrzymać płomień – jak zapałka na wietrze. <strong>Dyfuzor</strong>{' '}
            je spowalnia, a <strong>zawirowywacze</strong> przy 18 wtryskiwaczach tworzą wiry, w których gorące spaliny krążą i
            stale zapalają świeżą mieszankę.
          </p>
          <p>
            Łukowate <strong>osłony</strong> dzielą strumień. Tylko ok. ¼ powietrza wchodzi przez zawirowywacze do
            <strong> strefy pierwotnej</strong>. Reszta płynie kanałami nad i pod pierścieniową <strong>płomieniówką</strong> i
            wpada przez otwory. Mniejsze <strong>otwory pierwotne</strong> zamykają wir od tyłu, większe
            <strong> rozcieńczające</strong> studzą spaliny, a szczeliny chłodzące tworzą przy ściankach chłodną warstwę. Wybierz
            jedną drogę w „Powietrze”, aby prześledzić ją osobno.
          </p>
          <p>
            Zwiększ przepływ paliwa – płomienie rosną, rośnie temperatura przed turbiną (TIT), a z nią moc silnika. To właśnie
            TIT jest granicą: łopaty turbiny wytrzymują ją tylko dzięki chłodzeniu i powłokom ceramicznym. Świece zapłonowe
            pracują przy rozruchu i w warunkach ryzyka zgaśnięcia płomienia.
          </p>
        </>
      ),
    },
    {
      title: 'Turbina i wały (N1, N2)',
      kind: '3d',
      scene: SpoolScene,
      camera: CAM,
      controls: [
        {
          type: 'select',
          key: 'cfg',
          label: 'Układ',
          default: 'tf2',
          options: (Object.keys(CONFIGS) as SpoolCfg[]).map((value) => ({ value, label: CONFIGS[value].name })),
        },
        { type: 'slider', key: 'throttle', label: 'Dźwignia ciągu', min: 0, max: 100, step: 1, default: 80, unit: '%' },
        { type: 'toggle', key: 'bearings', label: 'Podpisy łożysk', default: true },
      ],
      body: (
        <>
          <p>
            <strong>Turbina</strong> to „odwrócona sprężarka”: gorące gazy rozprężają się na jej łopatach i kręcą wałem.
            Turbina oddaje tę moc sprężarce i wentylatorowi – sama nie daje ciągu.
          </p>
          <p>
            Wentylator jest wielki, więc musi kręcić się wolno (końcówki łopat nie mogą mocno przekroczyć prędkości
            dźwięku). Mała sprężarka WP potrzebuje za to dużych obrotów. Dlatego elementy połączono w osobne{' '}
            <strong>wały</strong> – na modelu wirniki mają kolor swojego wału. Kliknij wał, aby go wyróżnić.
          </p>
          <p>
            Porównaj układy: jedno-, dwu- i trójwałowy oraz turbowentylator z <strong>przekładnią</strong>, w którym
            wentylator kręci się ok. trzy razy wolniej niż napędzająca go turbina.
          </p>
          <p>
            Wały opierają się na <strong>łożyskach</strong>: kulkowe przejmują siły wzdłuż osi (ciąg wentylatora), wałeczkowe –
            tylko poprzeczne, i pozwalają wałom wydłużać się od ciepła. Siły trafiają przez stożkowe podpory na ramy silnika.
            Za turbiną NP widać <strong>tylną ramę</strong>, a na obudowie turbin – rury <strong>aktywnej regulacji luzów</strong>,
            które chłodzą obudowę, by szczelina nad łopatkami była jak najmniejsza.
          </p>
        </>
      ),
    },
    {
      title: 'Bypass – po co wielki wentylator',
      kind: '3d',
      scene: BypassScene,
      camera: [3.5, 2.2, 11.5],
      controls: [
        { type: 'slider', key: 'bpr', label: 'Stosunek obejścia BPR', min: 0, max: 13, step: 0.1, default: 5, decimals: 1 },
        { type: 'slider', key: 'v0', label: 'Prędkość lotu', min: 80, max: 300, step: 5, default: 230, unit: 'm/s' },
      ],
      body: (
        <>
          <p>
            <strong>Stosunek obejścia (BPR)</strong> mówi, ile kilogramów powietrza omija rdzeń na każdy kilogram, który
            przez niego przechodzi. Przesuwaj suwak – wentylator i gondola rosną, a rdzeń zostaje ten sam.
          </p>
          <p>
            Przy tej samej mocy rdzenia większy wentylator przyspiesza <strong>więcej powietrza, ale wolniej</strong>.
            Energia, która zostaje w strumieniu za samolotem, to strata – im mniejsza różnica vⱼ − v₀, tym wyższa{' '}
            <strong>sprawność napędowa</strong>, większy ciąg i mniejsze zużycie paliwa. Do tego wolniejszy strumień jest
            dużo cichszy (hałas rośnie mniej więcej z 8. potęgą prędkości).
          </p>
          <p>
            Czemu więc myśliwce mają małe obejście? Potrzebują dużej prędkości strumienia przy dużych prędkościach lotu i
            smukłego kadłuba. A w samolotach pasażerskich wentylator ogranicza masa, opór gondoli i prześwit pod skrzydłem.
          </p>
          <p>
            Zwróć uwagę, jak zmienia się budowa: bez wentylatora to <strong>turboodrzutowy</strong>; przy małym obejściu
            gondola ciągnie się do końca, a oba strumienie mieszają się przed <strong>wspólną dyszą</strong>; przy dużym –
            gondola jest krótka i zimny strumień ma własną dyszę. Przy BPR powyżej ok. 12 wentylator musiałby kręcić się za
            wolno dla turbiny NP – dlatego pojawia się <strong>przekładnia</strong>. Na wykresie widać, że sprawność rośnie
            coraz wolniej, a opór i masa coraz większej gondoli zjadają zysk.
          </p>
        </>
      ),
    },
    {
      title: 'Odwracacz ciągu (rewers)',
      kind: '3d',
      scene: ReverserScene,
      camera: [2.5, 1.8, 10.5],
      controls: [
        {
          type: 'select',
          key: 'type',
          label: 'Typ',
          default: 'kaskadowy',
          options: [
            { value: 'kaskadowy', label: 'kaskadowy (przesuwna osłona)' },
            { value: 'drzwiowy', label: 'drzwiowy (obrotowe drzwi)' },
            { value: 'klapowy', label: 'klapowy / czaszowy' },
          ],
        },
        { type: 'slider', key: 'deploy', label: 'Wysunięcie', min: 0, max: 1, step: 0.01, default: 0, decimals: 2 },
      ],
      body: (
        <>
          <p>
            Po przyziemieniu <strong>rewers</strong> kieruje część strumienia skośnie do przodu – silnik zaczyna hamować
            samolot. Odciąża to hamulce kół, co szczególnie pomaga na mokrym lub oblodzonym pasie.
          </p>
          <p>
            Przesuń suwak „Wysunięcie”. W turbowentylatorze zawraca się głównie <strong>zimny strumień</strong>: osłona
            odsuwa się do tyłu, odsłania <strong>kaskady</strong>, a <strong>drzwi blokujące</strong> zamykają kanał
            obejściowy. Rdzeń wciąż pcha do przodu, więc wypadkowa siła hamująca to tylko część pełnego ciągu.
          </p>
          <p>
            Rewers da się włączyć tylko na ziemi (czujniki obciążenia podwozia) i przy dźwigni na biegu jałowym. Przy ok. 60–70
            węzłach pilot zmniejsza go do biegu jałowego, aby silnik nie zassał zawróconych spalin i zanieczyszczeń z pasa.
          </p>
        </>
      ),
    },
    {
      title: 'Dopalacz',
      kind: '3d',
      scene: AfterburnerScene,
      camera: [5, 3.2, 10],
      target: [1.8, 0, 0],
      controls: [
        { type: 'toggle', key: 'ab', label: 'Dopalacz', default: false },
        { type: 'slider', key: 'nozzle', label: 'Otwarcie dyszy', min: 0, max: 1, step: 0.01, default: 0.3, decimals: 2 },
      ],
      body: (
        <>
          <p>
            Za turbiną w spalinach zostaje jeszcze sporo tlenu – w komorze spalono tylko część powietrza. <strong>Dopalacz</strong>{' '}
            (używany w samolotach wojskowych i w Concorde) wtryskuje tam dodatkowe paliwo, a stabilizatory płomienia
            utrzymują ogień w szybkim strumieniu. To zupełnie inny silnik niż pasażerski: smukły kadłub bez gondoli,
            trzystopniowy wentylator, wąski kanał obejściowy i <strong>mieszalnik</strong>, który łączy oba strumienie przed
            dopalaczem. Kliknij osłonę termiczną, kolektory, stabilizatory i płatki dyszy, aby poznać ich rolę.
          </p>
          <p>
            Dysza jest <strong>zbieżno-rozbieżna</strong>: w gardzieli strumień osiąga prędkość dźwięku, a w rozszerzającej się
            części za nią – naddźwiękową. Gorętsze gazy mają większą objętość, więc <strong>gardziel musi się otworzyć</strong>.
            Włącz dopalacz przy wąskiej dyszy i zobacz ostrzeżenie, a potem otwórz dyszę do ok. 0,75.
          </p>
          <p>
            Zysk: ok. 50% więcej ciągu. Koszt: kilkukrotnie większe zużycie paliwa – dlatego dopalacza używa się krótko.
            Jasne „diamenty” w płomieniu to układ fal uderzeniowych w naddźwiękowym strumieniu.
          </p>
        </>
      ),
    },
    {
      title: 'Rozruch silnika',
      kind: '3d',
      scene: StartScene,
      camera: CAM,
      controls: [
        { type: 'toggle', key: 'run', label: 'Uruchom silnik', default: false },
        {
          type: 'select',
          key: 'scenario',
          label: 'Scenariusz',
          default: 'normal',
          options: [
            { value: 'normal', label: 'prawidłowy rozruch' },
            { value: 'hot', label: 'gorący start' },
            { value: 'hung', label: 'zawis (hung start)' },
            { value: 'wet', label: 'mokry start (brak zapłonu)' },
          ],
        },
        { type: 'slider', key: 'speed', label: 'Tempo', min: 0.5, max: 4, step: 0.1, default: 1.5, unit: '×' },
      ],
      body: (
        <>
          <p>
            Silnik odrzutowy nie zapali „na korbie” – najpierw trzeba rozkręcić rdzeń, aby sprężarka dała wystarczająco
            dużo powietrza. Robi to <strong>rozrusznik pneumatyczny</strong> zasilany sprężonym powietrzem z APU albo z
            drugiego silnika.
          </p>
          <p>
            Włącz „Uruchom silnik” i patrz na model: najpierw rusza rdzeń (<strong>N2</strong>), potem wentylator. Przy ok.
            20–25% N2 iskrzą świece i pojawia się płomień w komorze, skacze <strong>EGT</strong>, a przy ok. 50% N2 silnik
            przyspiesza już sam.
          </p>
          <p>
            W wyciętej ćwiartce widać całą instalację: powietrze z APU płynie przez <strong>zawór rozrusznika</strong> do
            turbinki <strong>rozrusznika</strong>, ta przez <strong>skrzynkę napędów</strong> i wał promieniowy kręci wałem WP.
            Ze skrzynki napędzany jest też <strong>regulator paliwa</strong>, a <strong>wzbudnica</strong> zasila świece. Paliwo (pomarańczowe kropki) płynie od pomp w zbiorniku skrzydła przez zawór LP i pylon – dopiero od chwili, gdy regulator je otworzy; tempo kropek odpowiada wskazaniu <strong>FF</strong> na ECAM.
          </p>
          <p>
            Wypróbuj nieudane rozruchy. <strong>Gorący start</strong>: EGT przekracza limit. <strong>Zawis</strong>: silnik się
            zapala, ale obroty zatrzymują się na ok. 40%. <strong>Mokry start</strong>: paliwo płynie, ale się nie zapala. W każdym
            przypadku sterownik odcina paliwo, a rozrusznik dalej kręci silnik „na sucho”, by go schłodzić i przedmuchać.
            Wartości na wskaźnikach są przykładowe.
          </p>
        </>
      ),
    },
    {
      title: 'Osprzęt silnika',
      kind: '3d',
      scene: AccessoryScene,
      camera: [1.2, 1.7, 6.2],
      target: [-2.0, 0.5, 0.7],
      controls: [{ type: 'toggle', key: 'run', label: 'Silnik pracuje (bieg jałowy)', default: true }],
      body: (
        <>
          <p>
            Pod osłoną rdzenia, w wyciętej ćwiartce, siedzi <strong>osprzęt</strong> – wszystko, czego silnik potrzebuje do pracy
            i czym zasila samolot. Napęd bierze ze sprężarki WP: koło stożkowe na wale WP kręci <strong>wał promieniowy</strong>,
            a ten – <strong>skrzynkę napędów</strong> z rzędem kół zębatych.
          </p>
          <p>
            Na skrzynce wiszą <strong>rozrusznik</strong>, <strong>generator IDG</strong>, <strong>pompa hydrauliczna</strong>,
            <strong> prądnica PMA</strong> sterownika, <strong>pompa olejowa</strong> i <strong>pompa paliwa z regulatorem</strong>.
            Obok leżą urządzenia bez własnego napędu: <strong>zbiornik</strong> i <strong>filtr oleju</strong>,
            <strong> filtr paliwa</strong> i <strong>wymiennik ciepła paliwo–olej</strong>. Wyżej, na obudowie wentylatora, siedzi <strong>sterownik EEC</strong> – jego wiązki schodzą do rdzenia przez przegrodę kanału obejściowego przy pylonie.
          </p>
          <p>
            Gdy silnik pracuje, widać dwa obiegi. <strong>Olej</strong> (żółte kropki) płynie ze zbiornika przez pompę i filtr do
            komory łożysk, a wraca przez wymiennik, w którym oddaje ciepło. <strong>Paliwo</strong> (pomarańczowe) przychodzi z
            zbiornika w skrzydle (pompy i zawór LP, prześwietlone) przez pylon, ogrzewa się w wymienniku, przechodzi przez filtr do regulatora i dalej do wtryskiwaczy – tempo kropek odpowiada wskazaniu FF na ECAM. Wyłącz silnik – oba
            obiegi stają, bo pompy kręci ten sam wał WP.
          </p>
        </>
      ),
    },
    {
      title: 'Awarie w locie',
      kind: '3d',
      scene: FailureScene,
      camera: [3.6, 1.8, 10.2],
      controls: [
        { type: 'toggle', key: 'run', label: 'Start symulacji', default: false },
        {
          type: 'select',
          key: 'failure',
          label: 'Awaria',
          default: 'surge',
          options: [
            { value: 'surge', label: 'pompaż sprężarki' },
            { value: 'bird', label: 'zderzenie z ptakiem' },
            { value: 'fbo', label: 'urwanie łopaty wentylatora' },
            { value: 'flameout', label: 'zgaśnięcie płomienia w ulewie' },
            { value: 'fire', label: 'pożar silnika' },
            { value: 'oil', label: 'utrata oleju (łożysko)' },
            { value: 'ash', label: 'pył wulkaniczny' },
            { value: 'turbine', label: 'urwanie łopatki turbiny' },
          ],
        },
        { type: 'slider', key: 'speed', label: 'Tempo', min: 0.5, max: 3, step: 0.1, default: 1, unit: '×' },
      ],
      body: (
        <>
          <p>
            Silniki są dziś bardzo niezawodne – jeden wyłączony w locie przypada na setki tysięcy godzin pracy. Mimo to każdy
            samolot dwusilnikowy musi bezpiecznie dolecieć na jednym, a załogi ćwiczą awarie na symulatorach.
          </p>
          <p>
            Wybierz awarię i włącz „Start symulacji”. Obserwuj model, wskaźniki (także <strong>ciśnienie i temperaturę
            oleju</strong> oraz <strong>drgania</strong>) i komunikaty ostrzegawcze, jakie widzi załoga. Każdą awarię zdradza inny
            zestaw objawów: pompaż – huki i skoki EGT, utrata oleju – spadające ciśnienie, uszkodzenie wirnika – drgania.
          </p>
          <p>
            Zwróć uwagę na <strong>wiatrakowanie</strong>: wyłączony silnik dalej się obraca, napędzany pędem powietrza. Dzięki
            temu można go ponownie uruchomić w locie, a pompy napędzane ze skrzynki napędów jeszcze pracują. Przebiegi są
            przykładowe, oparte na typowych zdarzeniach.
          </p>
        </>
      ),
    },
  ],
};
