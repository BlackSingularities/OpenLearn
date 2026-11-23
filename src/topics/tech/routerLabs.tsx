/*
 * Router Wi-Fi – pracownie (powiększone eksponaty na podestach): kabel Ethernet i wtyk RJ-45, długości fal,
 * antena dipolowa z wykresem promieniowania, fala przechodząca przez różne ściany, kanały w paśmie 2,4 i 5 GHz,
 * pakiet danych, modulacja QAM, podział kanału OFDMA, droga do serwera, światłowód i szyfrowanie.
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Lbl } from '../aviation/airliner';
import { EnergyFlow } from '../energy/windExtras';
import { Box, Cyl, MAT, Pedestal, Tube } from './pcMats';
import { LAB_Y, rng, type V3 } from './routerGeo';
import { RM, Router } from './routerParts';

export const LC = { hot: '#fca5a5', cold: '#7dd3fc', part: '#e2e8f0', gold: '#fde68a', green: '#86efac', violet: '#c4b5fd', teal: '#5eead4' };

/** Podest i eksponat na wysokości LAB_Y. */
export function Stage({ p, children, r = 90 }: { p: V3; children: ReactNode; r?: number }) {
  return (
    <group position={p}>
      <Pedestal p={[0, 0, 0]} r={r} />
      <group position={[0, LAB_Y, 0]}>{children}</group>
    </group>
  );
}
const basic = (c: string, o: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, ...o });
const glassy = (c: string, opacity: number) => new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity, roughness: 0.15, depthWrite: false, side: THREE.DoubleSide });
function textMat(lines: string[], o: { w?: number; h?: number; bg?: string; fg?: string; size?: number } = {}) {
  const W = o.w ?? 256;
  const H = o.h ?? 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = o.bg ?? '#1e293b';
  g.fillRect(0, 0, W, H);
  g.fillStyle = o.fg ?? '#f8fafc';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const sz = o.size ?? 28;
  g.font = `bold ${sz}px sans-serif`;
  lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * sz * 1.25));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
}

/* ================= kabel Ethernet ================= */

const PAIRS: [string, string][] = [
  ['#f08c2e', 'pomarańczowa'],
  ['#2fa35a', 'zielona'],
  ['#2f6fd6', 'niebieska'],
  ['#8a5a32', 'brązowa'],
];

/**
 * Kabel sieciowy kategorii 6 powiększony 10 razy: osłona zdjęta z końca, w środku cztery skręcone pary
 * przewodów (każda inaczej skręcona), krzyżak rozdzielający; obok wtyk RJ-45 z ośmioma złotymi stykami.
 * Kulki – sygnały płynące parami w obie strony.
 */
export function EthLab({ p }: { p: V3 }) {
  const n = MAT();
  const wires = useMemo(() => {
    const out: { geo: THREE.TubeGeometry; c: string }[] = [];
    PAIRS.forEach(([c], k) => {
      const a0 = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = Math.cos(a0) * 1.25;
      const cy = Math.sin(a0) * 1.25;
      const pitch = 5 + k * 1.3;
      for (let w = 0; w < 2; w++) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 260; i++) {
          const x = -46 + (i / 260) * 76;
          const a = (x / pitch) * Math.PI * 2 + w * Math.PI;
          pts.push(new THREE.Vector3(x, cy + Math.sin(a) * 0.5, cx + Math.cos(a) * 0.5));
        }
        out.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 520, 0.42, 8, false), c: w ? '#f3f3ef' : c });
      }
    });
    return out;
  }, []);
  const wm = useMemo(() => Object.fromEntries(['#f3f3ef', ...PAIRS.map(([c]) => c)].map((c) => [c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 })])), []);
  const jacket = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b7fa3', roughness: 0.7, side: THREE.DoubleSide }), []);
  const plug = useMemo(() => glassy('#e8eef3', 0.35), []);
  return (
    <Stage p={p}>
      <group position={[-10, 0, 0]}>
        {/* osłona do x = 0, dalej gołe pary */}
        <Cyl p={[-40, 0, 0]} r={3.2} h={60} m={jacket} axis="x" seg={40} open />
        <mesh position={[-10, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={jacket}>
          <ringGeometry args={[2.9, 3.2, 40]} />
        </mesh>
        {wires.map((w, i) => (
          <mesh key={i} geometry={w.geo} material={wm[w.c]} />
        ))}
        <Box p={[-8, 0, 0]} s={[76, 0.25, 2.6]} m={n.plasticWhite} />
        <Box p={[-8, 0, 0]} s={[76, 2.6, 0.25]} m={n.plasticWhite} />
        {PAIRS.map(([c], k) => {
          const a0 = (k / 4) * Math.PI * 2 + Math.PI / 4;
          const y = Math.sin(a0) * 1.25;
          const z = Math.cos(a0) * 1.25;
          return (
            <EnergyFlow
              key={k}
              path={
                k % 2
                  ? [
                      [30, y, z + 0.9],
                      [-46, y, z + 0.9],
                    ]
                  : [
                      [-46, y, z + 0.9],
                      [30, y, z + 0.9],
                    ]
              }
              count={10}
              speed={24}
              size={0.55}
              color={c}
            />
          );
        })}
      </group>
      {/* wtyk RJ-45 (przezroczysty), 8 styków */}
      <group position={[46, 0, 0]}>
        <Box p={[0, 0, 0]} s={[22, 8, 12]} m={plug} />
        <Box p={[-1, 5.2, 0]} s={[12, 2.4, 6]} m={plug} />
        {Array.from({ length: 8 }, (_, i) => (
          <Box key={i} p={[8, -2.2, (i - 3.5) * 1.3]} s={[5, 2, 0.5]} m={n.gold} />
        ))}
        {Array.from({ length: 8 }, (_, i) => {
          const pair = [0, 0, 1, 2, 2, 1, 3, 3][i];
          return <Box key={'w' + i} p={[-2, -1.6, (i - 3.5) * 1.3]} s={[14, 0.9, 0.9]} m={wm[i % 2 && pair !== 2 ? '#f3f3ef' : PAIRS[pair][0]]} />;
        })}
      </group>
      <Lbl pos={[-50, 6, 0]} sub color={LC.part}>
        osłona kabla
      </Lbl>
      <Lbl pos={[2, 7, 0]} sub color={LC.gold}>
        4 skręcone pary przewodów
      </Lbl>
      <Lbl pos={[2, -7, 4]} sub color={LC.cold}>
        sygnały płyną w obie strony naraz
      </Lbl>
      <Lbl pos={[46, 11, 0]} sub color={LC.part}>
        wtyk RJ-45
      </Lbl>
      <Lbl pos={[54, -8, 4]} sub color={LC.gold}>
        8 złotych styków
      </Lbl>
    </Stage>
  );
}

/* ================= długości fal ================= */

const BANDS: [string, number, string][] = [
  ['2,4 GHz', 12.5, '#7dd3fc'],
  ['5 GHz', 6.0, '#c4b5fd'],
  ['6 GHz', 5.0, '#f9a8d4'],
];

/** Fale trzech pasm Wi-Fi w prawdziwej skali (cm) nad linijką: długość fali 12,5 cm, 6 cm i 5 cm. */
export function WaveLab({ p }: { p: V3 }) {
  const n = MAT();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const geos = useMemo(
    () =>
      BANDS.map(([, lam]) => {
        const pts: THREE.Vector3[] = [];
        const N = 900;
        for (let i = 0; i <= N; i++) {
          const x = -50 - lam + (i / N) * (100 + lam);
          pts.push(new THREE.Vector3(x, Math.sin((x / lam) * Math.PI * 2) * 4, 0));
        }
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 1800, 0.35, 6, false);
      }),
    [],
  );
  const mats = useMemo(() => BANDS.map(([, , c]) => basic(c)), []);
  const ruler = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.5 }), []);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    groups.current.forEach((g, i) => {
      if (g) g.position.x = (t.current * 8) % BANDS[i][1];
    });
  });
  return (
    <Stage p={p}>
      {BANDS.map(([name, lam], i) => (
        <group key={name} position={[0, 28 - i * 18, 0]}>
          <group
            ref={(g) => {
              groups.current[i] = g;
            }}
          >
            <mesh geometry={geos[i]} material={mats[i]} />
          </group>
          {/* znacznik jednej długości fali */}
          <Box p={[-50 + lam / 2, -7, 0]} s={[lam, 0.3, 0.3]} m={mats[i]} />
          <Box p={[-50, -6.2, 0]} s={[0.3, 1.8, 0.3]} m={mats[i]} />
          <Box p={[-50 + lam, -6.2, 0]} s={[0.3, 1.8, 0.3]} m={mats[i]} />
          <Lbl pos={[-62, 0, 0]} sub color={i === 0 ? LC.cold : i === 1 ? LC.violet : '#f9a8d4'}>
            {name}
          </Lbl>
          <Lbl pos={[-50 + lam / 2 + 12, -8.5, 0]} sub color={LC.part}>
            {`fala ${lam.toLocaleString('pl-PL')} cm`}
          </Lbl>
        </group>
      ))}
      {/* osłony boków, żeby fale nie wystawały */}
      {[-56, 56].map((x) => (
        <Box key={x} p={[x, 10, 1]} s={[12, 60, 2]} m={n.pedestal} />
      ))}
      {/* linijka 1 m */}
      <Box p={[0, -24, 0]} s={[100, 4, 0.6]} m={ruler} />
      {Array.from({ length: 101 }, (_, i) => (
        <Box key={i} p={[-50 + i, -22.6 - (i % 10 ? 0 : 0.6), 0.35]} s={[0.15, i % 10 ? 1 : 2.2, 0.1]} m={n.slot} />
      ))}
      <Lbl pos={[0, -30, 0]} sub color={LC.gold}>
        linijka 1 m – fale w prawdziwej wielkości
      </Lbl>
    </Stage>
  );
}

/* ================= antena dipolowa ================= */

/**
 * Antena dipolowa powiększona 10 razy: dwa pręty po ok. 3 cm (razem pół długości fali 2,4 GHz). Elektrony
 * biegają w górę i w dół, a wokół anteny widać wykres promieniowania – „pączek”: najsilniej w bok, słabo w górę.
 */
export function DipoleLab({ p }: { p: V3 }) {
  const n = MAT();
  const dots = useRef<THREE.Group>(null);
  const pattern = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 60; i++) {
      const th = (i / 60) * Math.PI;
      const r = 55 * Math.sin(th) ** 2;
      pts.push(new THREE.Vector2(r * Math.sin(th), 55 * Math.cos(th) * Math.sin(th) ** 2 * 0 + r * Math.cos(th)));
    }
    return new THREE.LatheGeometry(pts, 64);
  }, []);
  const patMat = useMemo(() => glassy('#a78bfa', 0.18), []);
  const patWire = useMemo(() => basic('#c4b5fd', { wireframe: true, transparent: true, opacity: 0.25 }), []);
  const eMat = useMemo(() => basic('#7dd3fc'), []);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    const s = Math.sin(t.current * 4);
    dots.current?.children.forEach((c, i) => {
      const base = (i % 6) * 5 + 3;
      const up = i < 6;
      c.position.y = (up ? 1 : -1) * base + s * 2.4;
    });
  });
  return (
    <Stage p={p}>
      <mesh geometry={pattern} material={patMat} />
      <mesh geometry={pattern} material={patWire} />
      {/* pręty, przerwa zasilania, kabel */}
      <Cyl p={[0, 17, 0]} r={1} h={31} m={n.nickel} />
      <Cyl p={[0, -17, 0]} r={1} h={31} m={n.nickel} />
      <Tube
        pts={[
          [0, -1, 1.2],
          [8, -6, 4],
          [24, -40, 4],
          [26, -60, 0],
        ]}
        r={0.8}
        m={n.cable}
      />
      <group ref={dots}>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} position={[1.3, 0, 0]} material={eMat}>
            <sphereGeometry args={[0.55, 10, 8]} />
          </mesh>
        ))}
      </group>
      <Lbl pos={[-14, 30, 0]} sub color={LC.part}>
        pręt 3 cm
      </Lbl>
      <Lbl pos={[-14, -30, 0]} sub color={LC.part}>
        pręt 3 cm
      </Lbl>
      <Lbl pos={[12, 8, 6]} sub color={LC.cold}>
        elektrony biegają w górę i w dół
      </Lbl>
      <Lbl pos={[52, 0, 0]} sub color={LC.violet}>
        najmocniej w bok
      </Lbl>
      <Lbl pos={[0, 46, 0]} sub color={LC.violet}>
        w górę prawie nic
      </Lbl>
      <Lbl pos={[30, -50, 0]} sub color={LC.part}>
        kabel od układu radiowego
      </Lbl>
    </Stage>
  );
}

/* ================= ściany ================= */

/** Próbki ścian: nazwa, kolor, grubość (cm), tłumienie dB w paśmie 2,4 / 5 GHz. */
export const SAMPLES: [string, string, number, number, number][] = [
  ['szkło', '#bcd7ea', 1, 2, 4],
  ['płyta g-k', '#f3f2ee', 3, 3, 5],
  ['drzwi z drewna', '#a07650', 4, 3, 4],
  ['cegła', '#b8664a', 12, 6, 10],
  ['beton zbrojony', '#b9b4ab', 18, 11, 17],
  ['akwarium', '#3b82c4', 14, 15, 25],
  ['blacha', '#9aa3ad', 1, 30, 35],
];
export const remain = (db: number) => Math.round(100 * 10 ** (-db / 10) * 10) / 10;

/**
 * Siedem próbek obok siebie. Z tyłu nadajnik, przez próbkę płynie fala (kulki), przed nią słupek pokazuje,
 * ile mocy przeszło. Woda i metal zatrzymują prawie wszystko.
 */
export function WallsLab({ p, band }: { p: V3; band: 0 | 1 }) {
  const n = MAT();
  const mats = useMemo(() => SAMPLES.map(([, c]) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, transparent: c === '#bcd7ea' || c === '#3b82c4', opacity: c === '#bcd7ea' ? 0.5 : c === '#3b82c4' ? 0.65 : 1 })), []);
  const bars = useRef<(THREE.Mesh | null)[]>([]);
  const barMat = useMemo(() => basic(band ? '#c4b5fd' : '#7dd3fc'), [band]);
  const h = useRef(SAMPLES.map(() => 30));
  useFrame((_, dt) => {
    SAMPLES.forEach((s, i) => {
      const target = Math.max(0.3, 40 * 10 ** (-s[3 + band] / 10));
      h.current[i] += (target - h.current[i]) * Math.min(1, dt * 4);
      const b = bars.current[i];
      if (b) {
        b.scale.y = h.current[i];
        b.position.y = -20 + h.current[i] / 2;
      }
    });
  });
  return (
    <Stage p={p} r={110}>
      {SAMPLES.map(([name, , th, d24, d5], i) => {
        const x = (i - 3) * 24;
        const db = band ? d5 : d24;
        const left = remain(db);
        return (
          <group key={name} position={[x, 0, 0]}>
            <Box p={[0, 4, 0]} s={[18, 48, Math.max(2, th * 0.6)]} m={mats[i]} />
            <EnergyFlow
              path={[
                [0, 0, -40],
                [0, 0, -1],
              ]}
              count={8}
              speed={30}
              size={0.9}
              color={band ? '#c4b5fd' : '#7dd3fc'}
            />
            <EnergyFlow
              path={[
                [0, 0, 1],
                [0, 0, 26],
              ]}
              count={Math.max(1, Math.round(8 * Math.min(1, left / 50 + 0.05)))}
              speed={30}
              size={0.9 * Math.max(0.35, Math.min(1, left / 50))}
              color={band ? '#c4b5fd' : '#7dd3fc'}
            />
            <mesh
              ref={(m) => {
                bars.current[i] = m;
              }}
              position={[0, -10, 30]}
              material={barMat}
            >
              <boxGeometry args={[8, 1, 3]} />
            </mesh>
            <Lbl pos={[0, -27, 30]} sub color={LC.part}>
              {name}
            </Lbl>
            <Lbl pos={[0, 34, 0]} sub color={left < 5 ? LC.hot : left < 30 ? LC.gold : LC.green}>
              {`${left.toLocaleString('pl-PL')}%`}
            </Lbl>
          </group>
        );
      })}
      <Box p={[0, 0, -44]} s={[170, 6, 4]} m={n.plastic} />
      <Lbl pos={[-96, 0, -44]} sub color={LC.cold}>
        nadajnik
      </Lbl>
      <Lbl pos={[0, 44, 0]} sub color={LC.gold}>
        ile mocy przechodzi przez przeszkodę
      </Lbl>
    </Stage>
  );
}

/* ================= kanały ================= */

/** Kształt kanału: garb o szerokości `w` i wysokości `h` (płaszczyzna x–y). */
function humpGeo(w: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  for (let i = 0; i <= 24; i++) {
    const x = -w / 2 + (i / 24) * w;
    const u = (x / (w / 2)) ** 2;
    s.lineTo(x, h * Math.max(0, 1 - u) ** 0.6);
  }
  s.lineTo(w / 2, 0);
  return new THREE.ShapeGeometry(s);
}

/**
 * Pasmo 2,4 GHz (u góry): 13 kanałów co 5 MHz, każdy szeroki na 20 MHz – zachodzą na siebie, tylko 1, 6 i 11 są
 * rozdzielne. Nasza sieć na kanale 6, sąsiedzi na innych, mikrofalówka zakłóca środek pasma.
 * Pasmo 5 GHz (u dołu): szerokie kanały 80 MHz obok siebie, bez tłoku.
 */
export function SpectrumLab({ p }: { p: V3 }) {
  const n = MAT();
  // 2,4 GHz: 2400…2484 MHz → x −60…60
  const fx = (f: number) => -60 + ((f - 2400) / 84) * 120;
  const nets: [number, string, number][] = [
    [6, '#2dd4bf', 26],
    [1, '#fb923c', 20],
    [3, '#f472b6', 16],
    [11, '#a78bfa', 22],
    [9, '#facc15', 12],
    [6, '#94a3b8', 14],
  ];
  const humps = useMemo(() => nets.map(([, , h]) => humpGeo((20 / 84) * 120, h)), []);
  const humpMats = useMemo(() => nets.map(([, c], i) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: i ? 0.42 : 0.75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })), []);
  const mwMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }), []);
  const g5 = useMemo(() => [0, 1, 2, 3].map(() => humpGeo(27, 20)), []);
  const m5 = useMemo(() => ['#2dd4bf', '#a78bfa', '#334155', '#334155'].map((c, i) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: i < 2 ? 0.6 : 0.3, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })), []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mw = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    refs.current.forEach((m, i) => {
      if (m) m.scale.y = 0.75 + 0.25 * Math.abs(Math.sin(t.current * (1.3 + i * 0.7) + i));
    });
    if (mw.current) mw.current.scale.y = Math.sin(t.current * 1.1) > 0.2 ? 1 : 0.05;
  });
  return (
    <Stage p={p} r={100}>
      {/* 2,4 GHz */}
      <group position={[0, 12, 0]}>
        <Box p={[0, -0.6, 0]} s={[124, 1.2, 1]} m={n.steel} />
        {Array.from({ length: 13 }, (_, i) => {
          const f = 2412 + i * 5;
          return <Box key={i} p={[fx(f), -2, 0.5]} s={[0.4, 2, 0.4]} m={[0, 5, 10].includes(i) ? n.ledGreen : n.steelDark} />;
        })}
        {nets.map(([ch], i) => (
          <mesh
            key={i}
            ref={(m) => {
              refs.current[i] = m;
            }}
            geometry={humps[i]}
            material={humpMats[i]}
            position={[fx(2412 + (ch - 1) * 5), 0, i === 0 ? 1 : -1 - i * 0.4]}
          />
        ))}
        <mesh ref={mw} position={[fx(2455), 15, -4]} material={mwMat}>
          <planeGeometry args={[30, 30]} />
        </mesh>
        <Lbl pos={[0, 42, 0]} sub color={LC.gold}>
          pasmo 2,4 GHz – 13 kanałów, ciasno
        </Lbl>
        <Lbl pos={[fx(2437), 31, 2]} sub color={LC.teal}>
          nasza sieć: kanał 6
        </Lbl>
        <Lbl pos={[fx(2455) + 12, 20, 0]} sub color={LC.hot}>
          mikrofalówka
        </Lbl>
        <Lbl pos={[0, -7, 2]} sub color={LC.green}>
          kanały 1, 6 i 11 nie zachodzą na siebie
        </Lbl>
      </group>
      {/* 5 GHz */}
      <group position={[0, -32, 0]}>
        <Box p={[0, -0.6, 0]} s={[124, 1.2, 1]} m={n.steel} />
        {g5.map((g, i) => (
          <mesh key={i} geometry={g} material={m5[i]} position={[-45 + i * 30, 0, 0]} />
        ))}
        <Lbl pos={[0, 28, 0]} sub color={LC.violet}>
          pasmo 5 GHz – szerokie kanały obok siebie
        </Lbl>
        <Lbl pos={[0, -6, 2]} sub color={LC.part}>
          kanał 80 MHz – cztery razy szerszy, więc szybszy
        </Lbl>
      </group>
    </Stage>
  );
}

/* ================= pakiet ================= */

/** Części ramki Wi-Fi: klucz, nazwa, kolor, długość na modelu, napis na wierzchu. */
export const FRAME_PARTS: [string, string, string, number, string[]][] = [
  ['pre', 'preambuła', '#64748b', 10, ['SYNC']],
  ['mac', 'nagłówek Wi-Fi', '#2dd4bf', 22, ['do: router', 'od: telefon']],
  ['ip', 'nagłówek IP', '#60a5fa', 18, ['do: 93.184.216.34', 'od: 192.168.1.23']],
  ['tcp', 'nagłówek TCP', '#a78bfa', 14, ['port 443', 'nr 1']],
  ['data', 'dane', '#fbbf24', 34, ['GET /pogoda', '(zaszyfrowane)']],
  ['fcs', 'suma kontrolna', '#f87171', 10, ['CRC', '8F2A']],
];
export const FRAME_X = (() => {
  const total = FRAME_PARTS.reduce((a, b) => a + b[3] + 1.5, 0);
  let x = -total / 2;
  return FRAME_PARTS.map(([, , , L]) => {
    const c = x + L / 2;
    x += L + 1.5;
    return c;
  });
})();

/** Ramka (pakiet) Wi-Fi jak wagoniki pociągu, a pod nią strumień bitów, który z niej powstaje. */
export function PacketLab({ p }: { p: V3 }) {
  const tops = useMemo(() => FRAME_PARTS.map(([, , c, L, lines]) => textMat(lines, { w: Math.round(L * 16), h: 128, bg: c, fg: '#0f172a', size: 22 })), []);
  const sides = useMemo(() => FRAME_PARTS.map(([, , c]) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })), []);
  const bitsTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 32;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0f172a';
    g.fillRect(0, 0, 1024, 32);
    g.fillStyle = '#5eead4';
    g.font = 'bold 24px monospace';
    const r = rng(7);
    let s = '';
    for (let i = 0; i < 70; i++) s += r() > 0.5 ? '1' : '0';
    g.fillText(s, 4, 25);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const bitsMat = useMemo(() => new THREE.MeshBasicMaterial({ map: bitsTex, toneMapped: false }), [bitsTex]);
  useFrame((_, dt) => {
    bitsTex.offset.x += Math.min(dt, 0.05) * 0.08;
  });
  return (
    <Stage p={p} r={100}>
      {FRAME_PARTS.map(([k, , , L], i) => (
        <group key={k} position={[FRAME_X[i], 0, 0]}>
          <mesh material={sides[i]}>
            <boxGeometry args={[L, 10, 12]} />
          </mesh>
          <mesh position={[0, 0, 6.02]} material={tops[i]}>
            <planeGeometry args={[L, 10]} />
          </mesh>
          <mesh position={[0, 5.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={tops[i]}>
            <planeGeometry args={[L, 12]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -18, 0]} material={bitsMat}>
        <planeGeometry args={[120, 4]} />
      </mesh>
      <Lbl pos={[0, -24, 0]} sub color={LC.teal}>
        w powietrzu ramka to ciąg zer i jedynek
      </Lbl>
    </Stage>
  );
}

/* ================= QAM ================= */

/**
 * Mapa punktów QAM: każdy punkt to inna kombinacja siły i przesunięcia fali, czyli inna grupa bitów.
 * Kolorowe kropki – odebrane sygnały rozmyte przez szum. Gdy kropka wpadnie bliżej innego punktu – błąd.
 */
export function QamLab({ p, order, noise, onErr }: { p: V3; order: number; noise: number; onErr?: (e: number) => void }) {
  const N = Math.round(Math.sqrt(order));
  const S = 56;
  const step = S / (N - 1);
  const grid = useMemo(() => {
    const im = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), basic('#e2e8f0'), N * N);
    const o = new THREE.Object3D();
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        o.position.set(-S / 2 + i * step, -S / 2 + j * step, 0.1);
        o.scale.setScalar(Math.min(1.1, step * 0.18));
        o.updateMatrix();
        im.setMatrixAt(i * N + j, o.matrix);
      }
    return im;
  }, [N, step]);
  const M = 220;
  const rx = useMemo(() => {
    const im = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10), new THREE.MeshBasicMaterial({ toneMapped: false }), M);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(M * 3), 3);
    return im;
  }, []);
  const o = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const r = useMemo(() => rng(3), []);
  const acc = useRef(0);
  const errs = useRef({ n: 0, e: 0 });
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-6, r()))) * Math.cos(2 * Math.PI * r());
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.08) return;
    acc.current = 0;
    let e = 0;
    for (let k = 0; k < M; k++) {
      const i = Math.floor(r() * N);
      const j = Math.floor(r() * N);
      const x = -S / 2 + i * step + gauss() * noise * 4;
      const y = -S / 2 + j * step + gauss() * noise * 4;
      const bad = Math.abs(x - (-S / 2 + i * step)) > step / 2 || Math.abs(y - (-S / 2 + j * step)) > step / 2;
      if (bad) e++;
      o.position.set(x, y, 0.3);
      o.scale.setScalar(0.9);
      o.updateMatrix();
      rx.setMatrixAt(k, o.matrix);
      rx.setColorAt(k, c.set(bad ? '#f87171' : '#5eead4'));
    }
    rx.instanceMatrix.needsUpdate = true;
    if (rx.instanceColor) rx.instanceColor.needsUpdate = true;
    errs.current.n = errs.current.n * 0.8 + M * 0.2;
    errs.current.e = errs.current.e * 0.8 + e * 0.2;
    onErr?.(errs.current.e / Math.max(1, errs.current.n));
  });
  const n = MAT();
  return (
    <Stage p={p}>
      <Box p={[0, 0, -0.6]} s={[S + 14, S + 14, 1]} m={n.slot} />
      <Box p={[0, 0, 0]} s={[S + 10, 0.25, 0.2]} m={n.steelDark} />
      <Box p={[0, 0, 0]} s={[0.25, S + 10, 0.2]} m={n.steelDark} />
      <primitive object={grid} />
      <primitive object={rx} />
      <Lbl pos={[0, S / 2 + 10, 0]} sub color={LC.gold}>
        {`${order}-QAM: ${Math.log2(order)} bitów w jednym „zawołaniu”`}
      </Lbl>
      <Lbl pos={[S / 2 + 12, 0, 0]} sub color={LC.part}>
        siła fali
      </Lbl>
      <Lbl pos={[0, -S / 2 - 9, 0]} sub color={LC.part}>
        przesunięcie fali
      </Lbl>
    </Stage>
  );
}

/* ================= OFDMA ================= */

export const DEV_C = ['#2dd4bf', '#f472b6', '#fbbf24', '#60a5fa'];

/**
 * Kanał w czasie (w prawo) i częstotliwości (w górę). Bez OFDMA każde urządzenie dostaje cały kanał na chwilę,
 * nawet gdy wysyła mało. Z OFDMA kanał dzieli się na kawałki i kilka urządzeń nadaje naraz.
 */
export function OfdmaLab({ p, on }: { p: V3; on: boolean }) {
  const n = MAT();
  const COLS = 24;
  const ROWS = 8;
  const cw = 5;
  const rh = 5;
  const im = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.5 }), COLS * ROWS);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COLS * ROWS * 3), 3);
    return m;
  }, []);
  const o = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const t = useRef(0);
  // przydział: dla kolumny (chwili) i wiersza (kawałka pasma) – numer urządzenia albo −1 (pusto)
  const who = (col: number, row: number) => {
    if (on) {
      const r = rng(col * 131 + Math.floor(row / 2) * 17 + 5);
      r();
      return r() < 0.1 ? -1 : Math.floor(r() * 4);
    }
    const r = rng(Math.floor(col / 3) * 97 + 11);
    r();
    return r() < 0.2 ? -1 : Math.floor(r() * 4);
  };
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05) * 2;
    const shift = t.current % 1;
    const base = Math.floor(t.current);
    for (let i = 0; i < COLS; i++)
      for (let j = 0; j < ROWS; j++) {
        const col = base + i;
        const d = who(col, j);
        o.position.set(-60 + (i - shift) * cw + cw / 2, -20 + j * rh + rh / 2, 0);
        o.scale.set(cw - 0.5, rh - 0.5, d < 0 ? 0.3 : 3);
        o.updateMatrix();
        im.setMatrixAt(i * ROWS + j, o.matrix);
        im.setColorAt(i * ROWS + j, c.set(d < 0 ? '#1f2937' : DEV_C[d]));
      }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  return (
    <Stage p={p} r={100}>
      <Box p={[0, 0, -2]} s={[124, 44, 1]} m={n.slot} />
      <primitive object={im} />
      {[-62, 62].map((x) => (
        <Box key={x} p={[x + Math.sign(x) * 2, 0, 0]} s={[4, 46, 6]} m={n.pedestal} />
      ))}
      <Lbl pos={[0, 28, 0]} sub color={LC.gold}>
        {on ? 'OFDMA: kanał dzielony na kawałki – kilka urządzeń naraz' : 'bez OFDMA: cały kanał dla jednego urządzenia naraz'}
      </Lbl>
      <Lbl pos={[0, -27, 0]} sub color={LC.part}>
        czas →
      </Lbl>
      <Lbl pos={[-72, 0, 0]} sub color={LC.part}>
        częstotliwość
      </Lbl>
    </Stage>
  );
}

/* ================= droga do serwera ================= */

/** Etapy drogi pakietu: x na modelu, nazwa. */
export const HOPS: [number, string][] = [
  [-130, 'router'],
  [-85, 'szafka na klatce'],
  [-35, 'centrala operatora'],
  [15, 'punkt wymiany ruchu'],
  [65, 'kabel podmorski'],
  [120, 'serwerownia'],
];

/** Szereg miniatur od routera do serwerowni połączony światłowodem z błyskami światła. */
export function ChainLab({ p, both = true }: { p: V3; both?: boolean }) {
  const n = MAT();
  const r = RM();
  const path: V3[] = HOPS.map(([x]) => [x, 2, 0]);
  const sea = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1e5a8a', roughness: 0.2, transparent: true, opacity: 0.85 }), []);
  return (
    <Stage p={p} r={160}>
      <group position={[0, -20, 0]}>
        {/* router */}
        <group position={[HOPS[0][0], 0, 0]} scale={0.9}>
          <Router cover blink />
        </group>
        {/* szafka uliczna */}
        <group position={[HOPS[1][0], 0, 0]}>
          <Box p={[0, 15, 0]} s={[14, 30, 9]} m={n.steelDark} />
          <Box p={[0, 15, 4.6]} s={[12, 26, 0.3]} m={n.steel} />
        </group>
        {/* centrala: budynek z szafami */}
        <group position={[HOPS[2][0], 0, 0]}>
          <Box p={[0, 15, -4]} s={[34, 30, 18]} m={r.concrete} />
          {[-10, -3, 4, 11].map((x) => (
            <Box key={x} p={[x, 11, 5.5]} s={[5, 22, 1]} m={n.plastic} />
          ))}
        </group>
        {/* punkt wymiany ruchu: rząd szaf z diodami */}
        <group position={[HOPS[3][0], 0, 0]}>
          {[-12, -4, 4, 12].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <Box p={[0, 17, 0]} s={[7, 34, 12]} m={n.plastic} />
              {Array.from({ length: 8 }, (_, i) => (
                <Box key={i} p={[0, 4 + i * 4, 6.05]} s={[5, 0.4, 0.1]} m={i % 3 ? n.ledGreen : n.glowBlue} />
              ))}
            </group>
          ))}
        </group>
        {/* morze z kablem na dnie */}
        <group position={[HOPS[4][0], 0, 0]}>
          <Box p={[0, 6, 0]} s={[40, 12, 26]} m={sea} />
          <Box p={[0, -0.5, 0]} s={[40, 1, 26]} m={r.ground} />
        </group>
        {/* serwerownia */}
        <group position={[HOPS[5][0], 0, 0]}>
          <Box p={[0, 13, -6]} s={[44, 26, 22]} m={r.white} />
          {[-15, -5, 5, 15].map((x) => (
            <group key={x} position={[x, 0, 7]}>
              <Box p={[0, 11, 0]} s={[8, 22, 6]} m={n.plastic} />
              {Array.from({ length: 6 }, (_, i) => (
                <Box key={i} p={[0, 3 + i * 3.4, 3.05]} s={[6, 0.4, 0.1]} m={n.ledGreen} />
              ))}
            </group>
          ))}
        </group>
        <Tube pts={path} r={0.5} m={r.fiber} smooth={false} />
        <EnergyFlow path={path} count={30} speed={60} size={1} color="#bbf7d0" />
        {both && <EnergyFlow path={[...path].reverse().map(([x, y, z]) => [x, y + 1.6, z] as V3)} count={30} speed={60} size={1} color="#fde68a" />}
      </group>
    </Stage>
  );
}

/* ================= światłowód ================= */

/**
 * Światłowód ogromnie powiększony: szklany rdzeń, płaszcz i kolorowa osłona, zdjęte stopniowo od końca.
 * Błyski światła odbijają się od granicy rdzenia i płaszcza i nie mogą uciec – to całkowite odbicie.
 */
export function FiberLab({ p }: { p: V3 }) {
  const core = useMemo(() => glassy('#a5f3fc', 0.45), []);
  const clad = useMemo(() => glassy('#e0f2fe', 0.16), []);
  const buf = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2fb35a', roughness: 0.6 }), []);
  const jacket = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1c40f', roughness: 0.7 }), []);
  const rayMat = useMemo(() => basic('#fef08a', { transparent: true, opacity: 0.5 }), []);
  const zig = useMemo<V3[]>(() => {
    const pts: V3[] = [];
    for (let i = 0; i <= 16; i++) pts.push([-70 + i * 8.75, i % 2 ? 3.4 : -3.4, 0]);
    return pts;
  }, []);
  return (
    <Stage p={p} r={100}>
      <Cyl p={[-35, 0, 0]} r={22} h={70} m={jacket} axis="x" seg={48} />
      <Cyl p={[5, 0, 0]} r={16} h={30} m={buf} axis="x" seg={48} />
      <Cyl p={[20, 0, 0]} r={12} h={100} m={clad} axis="x" seg={48} />
      <Cyl p={[0, 0, 0]} r={4} h={140} m={core} axis="x" seg={32} />
      <Tube pts={zig} r={0.25} m={rayMat} smooth={false} />
      <EnergyFlow path={zig} count={14} speed={45} size={1.1} color="#fef08a" />
      <Lbl pos={[-40, 28, 0]} sub color={LC.gold}>
        osłona zewnętrzna
      </Lbl>
      <Lbl pos={[5, 22, 0]} sub color={LC.green}>
        powłoka ochronna
      </Lbl>
      <Lbl pos={[50, 17, 0]} sub color={LC.cold}>
        płaszcz – szkło odbijające światło
      </Lbl>
      <Lbl pos={[60, -9, 4]} sub color={LC.teal}>
        rdzeń – cieńszy od włosa
      </Lbl>
      <Lbl pos={[-10, -10, 6]} sub color={LC.gold}>
        błysk = 1, ciemno = 0
      </Lbl>
    </Stage>
  );
}

/* ================= szyfrowanie ================= */

const SECRET = 'HASLO:kot123';
const GIBBER = '#9Fq!xZ2@k7&w';

/**
 * Telefon wysyła pakiety do routera (klocki z literami). Laptop sąsiada łapie te same fale. Bez szyfrowania
 * odczyta treść, z szyfrowaniem WPA3 widzi tylko przypadkowe znaki.
 */
export function CryptLab({ p, on }: { p: V3; on: boolean }) {
  const n = MAT();
  const r = RM();
  const letters = useMemo(
    () =>
      SECRET.split('').map((ch, i) => [textMat([ch], { w: 64, h: 64, bg: '#fef3c7', fg: '#0f172a', size: 40 }), textMat([GIBBER[i]], { w: 64, h: 64, bg: '#334155', fg: '#94a3b8', size: 40 })]),
    [],
  );
  const g1 = useRef<THREE.Group>(null);
  const g2 = useRef<THREE.Group>(null);
  const t = useRef(0);
  const A: V3 = [-60, 5, 0];
  const B: V3 = [60, 12, 0];
  const C: V3 = [0, -18, 34];
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    const L = SECRET.length;
    [g1.current, g2.current].forEach((g, gi) =>
      g?.children.forEach((ch, i) => {
        const k = (t.current * 0.18 + i / L) % 1;
        const to = gi ? C : B;
        ch.position.set(A[0] + (to[0] - A[0]) * k, A[1] + (to[1] - A[1]) * k + Math.sin(Math.PI * k) * (gi ? 6 : 16), A[2] + (to[2] - A[2]) * k);
        ch.visible = gi ? k < 0.95 : true;
      }),
    );
  });
  return (
    <Stage p={p} r={100}>
      {/* telefon */}
      <group position={A} rotation={[0, 0.3, 0]}>
        <Box p={[0, 0, 0]} s={[8, 16, 1]} m={r.black} />
        <Box p={[0, 0, 0.52]} s={[7, 14.5, 0.05]} m={r.screenOn} />
      </group>
      {/* router */}
      <group position={[B[0], B[1] - 8, 0]}>
        <Router cover blink />
      </group>
      {/* laptop sąsiada */}
      <group position={[C[0], C[1] - 6, C[2]]} rotation={[0, -0.2, 0]}>
        <Box p={[0, 0.8, 0]} s={[30, 1.6, 20]} m={n.aluDark} />
        <group position={[0, 1.6, -10]} rotation={[-0.3, 0, 0]}>
          <Box p={[0, 9.5, -0.5]} s={[30, 19, 1]} m={n.aluDark} />
          <mesh position={[0, 9.5, 0.02]} material={on ? letters[0][1] : letters[0][0]}>
            <planeGeometry args={[27, 16]} />
          </mesh>
        </group>
      </group>
      <group ref={g1}>
        {letters.map((m, i) => (
          <mesh key={i} material={on ? m[1] : m[0]}>
            <boxGeometry args={[3.4, 3.4, 3.4]} />
          </mesh>
        ))}
      </group>
      <group ref={g2}>
        {letters.map((m, i) => (
          <mesh key={i} material={on ? m[1] : m[0]}>
            <boxGeometry args={[2.4, 2.4, 2.4]} />
          </mesh>
        ))}
      </group>
      {on && (
        <group position={[B[0], B[1] + 14, 0]}>
          <Box p={[0, 0, 0]} s={[6, 5, 2]} m={n.gold} />
          <mesh position={[0, 3.2, 0]} material={n.gold}>
            <torusGeometry args={[2, 0.5, 8, 16, Math.PI]} />
          </mesh>
        </group>
      )}
      <Lbl pos={[A[0], A[1] + 14, 0]} sub color={LC.part}>
        telefon
      </Lbl>
      <Lbl pos={[B[0], B[1] + 26, 0]} sub color={on ? LC.green : LC.part}>
        {on ? 'router zna klucz – odczyta' : 'router'}
      </Lbl>
      <Lbl pos={[C[0] + 24, C[1] + 20, C[2]]} sub color={on ? LC.green : LC.hot}>
        {on ? 'sąsiad widzi tylko bełkot' : 'sąsiad czyta wszystko!'}
      </Lbl>
    </Stage>
  );
}
