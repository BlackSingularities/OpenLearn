/*
 * Pas startowy wspólny dla wszystkich animacji (lądowanie, dobieg, zawracanie) i dla mapy lotniska na ND – jedno
 * źródło, więc to, co widać na scenie, zgadza się z tym, co pokazuje wyświetlacz.
 *
 * Pas 27R/09L: 3000 m, kurs lądowania 270°. Oznakowanie według ICAO (przybliżone): na każdym końcu znaki progu
 * („klawisze fortepianu”), oznaczenie pasa (27R / 09L), znaki strefy przyziemienia (pary pasów co 150 m) i znaki
 * punktu celowania 400 m od progu; przerywana oś (30 m kreski, 20 m przerwy), linie krawędziowe i światła krawędziowe
 * co 60 m.
 *
 * Układ pasa: u – odległość od progu 27R wzdłuż kierunku lądowania na 27R (m), v – w lewo od osi (m). Model 3D jest
 * budowany w układzie lokalnym x = −u, z = v (samolot leci „do przodu” w −x) – scena ustawia tylko jego położenie.
 *
 * Ten sam pas służy w dzień i w nocy (NightCtx): w nocy świecą światła pasa (krawędzi, osi, progu i końca, strefy
 * przyziemienia), światła podejścia z „biegnącym” błyskiem, PAPI oraz zielone i niebieskie światła drogi kołowania.
 * Do pasa należy zjazd w prawo (EXIT) na drogę kołowania i płyta postojowa z terminalem (AirportModel) – wspólne
 * dla wszystkich scen na lotnisku.
 */
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Noc w scenie: pas i lotnisko zapalają swoje światła (podaje scena, np. moduł świateł). */
export const NightCtx = createContext(false);
/** Zjazd z pasa w prawo: początek łuku (m od progu 27R), promień osi łuku, szerokość drogi i koniec drogi (v). */
export const EXIT = { u: 1800, R: 50, w: 23, vEnd: -700 };
/** Stanowisko postojowe na płycie przy drodze kołowania (koła główne samolotu, nos w stronę +u). */
export const STAND = { u: EXIT.u + EXIT.R - 90, v: -220 };
/** Ścieżka podejścia (°) i położenie PAPI (m od progu, po lewej stronie pasa). */
export const GLIDE_DEG = 3;
export const PAPI_U = 400;

export const RWY = { L: 3000, name: '27R', opp: '09L', hdg: 270 };

type Rect = [number, number, number, number]; // u0, u1, v0, v1
export type RunwayLabel = { text: string; u: number; v: number; up: 1 | -1 };

/** Znaki na jednym końcu (od progu w głąb pasa); dir = 1 – koniec 27R (u rośnie w głąb), −1 – koniec 09L. */
function endMarks(W: number, u0: number, dir: 1 | -1): Rect[] {
  const at = (a: number, b: number, v0: number, v1: number): Rect => (dir > 0 ? [u0 + a, u0 + b, v0, v1] : [u0 - b, u0 - a, v0, v1]);
  const out: Rect[] = [];
  // próg: pasy 1,8 m szerokie co 3,6 m, po obu stronach osi (12 przy 45 m, 16 przy 60 m)
  const n = Math.round(W / 45 * 6);
  for (const s of [-1, 1])
    for (let k = 0; k < n; k++) {
      const c = s * (W * 0.07 + 0.9 + k * 3.6);
      out.push(at(6, 36, c - 0.9, c + 0.9));
    }
  // strefa przyziemienia: pary pasów (3, 3, 2, 2, 1, 1) co 150 m, 22,5 m długie, 3 m szerokie
  const tdz: [number, number][] = [
    [150, 3],
    [300, 3],
    [450, 2],
    [600, 2],
    [750, 1],
    [900, 1],
  ];
  for (const [d, k] of tdz)
    for (const s of [-1, 1])
      for (let i = 0; i < k; i++) {
        const v0 = 9 + i * 4.5;
        out.push(at(d, d + 22.5, s > 0 ? v0 : -v0 - 3, s > 0 ? v0 + 3 : -v0));
      }
  // punkt celowania: dwa duże prostokąty 50 × 8 m, 400 m od progu
  for (const s of [-1, 1]) out.push(at(400, 450, s > 0 ? 9 : -17, s > 0 ? 17 : -9));
  return out;
}

/** Wszystkie znaki pasa (prostokąty), oznaczenia i światła krawędziowe – w układzie (u, v). */
export function runwayMarks(W: number, L = RWY.L) {
  const rects: Rect[] = [];
  // linie krawędziowe
  rects.push([0, L, W / 2 - 1.1, W / 2 - 0.2], [0, L, -W / 2 + 0.2, -W / 2 + 1.1]);
  // oś: od oznaczenia do oznaczenia przeciwnego końca
  for (let u = 66; u + 30 < L - 66; u += 50) rects.push([u, u + 30, -0.45, 0.45]);
  rects.push(...endMarks(W, 0, 1), ...endMarks(W, L, -1));
  const labels: RunwayLabel[] = [
    { text: RWY.name, u: 50, v: 0, up: 1 },
    { text: RWY.opp, u: L - 50, v: 0, up: -1 },
  ];
  const lights: [number, number][] = [];
  for (let u = 0; u <= L; u += 60) for (const s of [-1, 1]) lights.push([u, s * (W / 2 + 1.5)]);
  return { rects, labels, lights };
}

/** Tekstura z oznaczeniem pasa (np. „27” nad „R”), biała farba na przezroczystym tle. */
function labelTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e8ebee';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'bold 230px Arial, Helvetica, sans-serif';
  // liczba dalej od progu (czytana jako pierwsza), litera bliżej progu
  x.fillText(text.slice(0, 2), 128, 140);
  x.fillText(text.slice(2), 128, 390);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

/* ---------- świecące punkty (światła lotniska nocą) ---------- */

let glowTex: THREE.CanvasTexture | null = null;
/** Miękka plamka światła (wspólna tekstura świateł lotniska, gwiazd i miast). */
export function getGlowTex() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
/** Zbiór świecących punktów (x, y, z kolejno) z kolorami; size – średnica w metrach (atten) albo w pikselach. */
export function GlowDots({ pts, colors, size = 1.6, atten = true, opacity = 1, renderOrder }: { pts: number[]; colors: number[]; size?: number; atten?: boolean; opacity?: number; renderOrder?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [pts, colors]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <points geometry={geo} raycast={() => null} renderOrder={renderOrder}>
      <pointsMaterial map={getGlowTex()} vertexColors size={atten ? size * 2 : size} sizeAttenuation={atten} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}
const rgbOf = (hex: string) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
/** Grupa świateł jednego koloru w układzie pasa: [u, v, wysokość]. */
type LightSet = { pts: [number, number, number][]; color: string; size: number };
const toXYZ = (pts: [number, number, number][]) => pts.flatMap(([u, v, y]) => [-u, y, v]);

/** Punkt łuku zjazdu (u, v) w odległości r od środka łuku, kąt θ od osi pasa (0) do kierunku drogi (90°). */
const exitPt = (r: number, th: number): [number, number] => [EXIT.u + r * Math.sin(th), -EXIT.R + r * Math.cos(th)];

/** Światła pasa, podejścia i zjazdu nocą (bez PAPI i „biegnącego” błysku – te zmieniają się w czasie). */
function runwayLights(W: number, L: number, exit: boolean): LightSet[] {
  const edge: [number, number, number][] = [];
  for (let u = 0; u <= L; u += 60) for (const s of [-1, 1]) if (!(exit && s < 0 && u > EXIT.u - 5 && u < EXIT.u + EXIT.R + 15)) edge.push([u, s * (W / 2 + 1.5), 0.3]);
  // oś pasa co 15 m: biała, na ostatnich 900 m na przemian z czerwoną, na ostatnich 300 m czerwona (ostrzeżenie o końcu)
  const cW: [number, number, number][] = [];
  const cR: [number, number, number][] = [];
  for (let u = 8, i = 0; u < L - 8; u += 15, i++) {
    const left = L - u;
    (left < 300 || (left < 900 && i % 2 === 1) ? cR : cW).push([u, 0.8, 0.06]);
  }
  const thr: [number, number, number][] = [];
  const end: [number, number, number][] = [];
  for (let v = -W / 2 - 1; v <= W / 2 + 1; v += 3) {
    thr.push([-1, v, 0.3]);
    end.push([L + 1, v, 0.3]);
  }
  // strefa przyziemienia: po obu stronach osi rzędy po 3 światła co 60 m, do 900 m
  const tdz: [number, number, number][] = [];
  for (let u = 60; u <= 900; u += 60) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) tdz.push([u, s * (9 + k * 1.5), 0.06]);
  // światła podejścia: oś z belkami po 5 lamp co 30 m do 900 m przed progiem, poprzeczka 300 m przed progiem
  const als: [number, number, number][] = [];
  for (let u = -60; u >= -900; u -= 30) for (let v = -2; v <= 2; v += 1) als.push([u, v, 0.8 + (-u / 900) * 4]);
  for (let v = -15; v <= 15; v += 1.5) if (Math.abs(v) > 2.5) als.push([-300, v, 0.8 + (300 / 900) * 4]);
  const out: LightSet[] = [
    { pts: edge, color: '#fff1d6', size: 1.8 },
    { pts: cW, color: '#f5f0e6', size: 1.1 },
    { pts: cR, color: '#ff4a3a', size: 1.1 },
    { pts: thr, color: '#36ff6b', size: 1.8 },
    { pts: end, color: '#ff3b2a', size: 1.8 },
    { pts: tdz, color: '#fff4dc', size: 0.9 },
    { pts: als, color: '#fff4dc', size: 2.2 },
  ];
  if (exit) {
    // droga kołowania: zielone światła osi (na łuku co 6 m, dalej co 15 m), niebieskie krawędzi (co 10 m na łuku, co 30 m dalej)
    const green: [number, number, number][] = [];
    for (let th = 0; th <= Math.PI / 2 + 1e-6; th += 6 / EXIT.R) green.push([...exitPt(EXIT.R, th), 0.06]);
    for (let v = -EXIT.R - 15; v >= EXIT.vEnd; v -= 15) green.push([EXIT.u + EXIT.R, v, 0.06]);
    const blue: [number, number, number][] = [];
    for (const r of [EXIT.R - EXIT.w / 2 - 1, EXIT.R + EXIT.w / 2 + 1])
      for (let th = 0; th <= Math.PI / 2 + 1e-6; th += 10 / r) {
        const p = exitPt(r, th);
        if (p[1] < -W / 2 - 3) blue.push([...p, 0.3]);
      }
    for (const du of [-EXIT.w / 2 - 1, EXIT.w / 2 + 1]) for (let v = -EXIT.R; v >= EXIT.vEnd; v -= 30) blue.push([EXIT.u + EXIT.R + du, v, 0.3]);
    out.push({ pts: green, color: '#36ff6b', size: 1.2 }, { pts: blue, color: '#3d7bff', size: 1.5 });
  }
  return out;
}

/** Pas łuku na ziemi w układzie lokalnym (x = −u, z = v): promienie r0…r1, kąty 0…90°. */
function exitArcGeo(r0: number, r1: number, y: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const th = ((Math.PI / 2) * i) / n;
    for (const r of [r0, r1]) {
      const [u, v] = exitPt(r, th);
      pos.push(-u, y, v);
    }
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 3, b + 1, b, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [0, 1, 0]).flat(), 3));
  return g;
}

/**
 * „Biegnący” błysk świateł podejścia (dwa razy na sekundę, od 900 m do 60 m przed progiem) i PAPI: cztery lampy po
 * lewej stronie pasa przy punkcie celowania. Lampa jest biała, gdy pilot widzi ją powyżej jej kąta (2,5°, 2,83°,
 * 3,17°, 3,5° – od zewnętrznej do najbliższej pasa); na ścieżce 3° – dwie białe i dwie czerwone.
 */
function RunwayFlashers({ W, eye }: { W: number; eye?: () => [number, number] | null }) {
  const rabbit = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let u = -900; u <= -60; u += 30) pts.push(-u, 1.2 + (-u / 900) * 4, 0);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pts.length).fill(0), 3));
    return g;
  }, []);
  const papi = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 4; i++) pts.push(-PAPI_U, 0.9, W / 2 + 15 + i * 9);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(12).fill(1), 3));
    return g;
  }, [W]);
  useEffect(
    () => () => {
      rabbit.dispose();
      papi.dispose();
    },
    [rabbit, papi],
  );
  useFrame(({ clock }) => {
    const col = rabbit.getAttribute('color') as THREE.BufferAttribute;
    const n = col.count;
    // błysk przebiega całą linię w 0,5 s (od najdalszej lampy do progu)
    const ph = (clock.elapsedTime * 2) % 1;
    for (let i = 0; i < n; i++) {
      const on = Math.max(0, 1 - Math.abs(ph * n - i) * 1.2);
      col.setXYZ(i, on, on, on);
    }
    col.needsUpdate = true;
    const e = eye?.();
    const ang = e ? (Math.atan2(e[1], PAPI_U - e[0]) * 180) / Math.PI : GLIDE_DEG;
    const pc = papi.getAttribute('color') as THREE.BufferAttribute;
    // i = 0 – lampa najbliżej pasa (próg 3,5°), i = 3 – zewnętrzna (2,5°)
    for (let i = 0; i < 4; i++) {
      const white = ang > GLIDE_DEG + 0.5 - i * (1 / 3);
      pc.setXYZ(i, 1, white ? 0.95 : 0.12, white ? 0.88 : 0.08);
    }
    pc.needsUpdate = true;
  });
  return (
    <>
      <points geometry={rabbit} raycast={() => null}>
        <pointsMaterial map={getGlowTex()} vertexColors size={9} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
      <points geometry={papi} raycast={() => null}>
        <pointsMaterial map={getGlowTex()} vertexColors size={6} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
    </>
  );
}

/**
 * Model pasa w układzie lokalnym (x = −u, z = v, y = 0 – nawierzchnia): asfalt, trawa wokół, znaki, oznaczenia,
 * światła krawędziowe, PAPI i zjazd na drogę kołowania (exit). Nocą (NightCtx) zapalają się wszystkie światła.
 * eye – położenie oczu pilota (u od progu, wysokość nad pasem) do PAPI. Rodzic ustawia położenie (np. przesuwa pas
 * pod lądującym samolotem).
 */
export function RunwayModel({ W, L = RWY.L, exit = true, eye }: { W: number; L?: number; exit?: boolean; eye?: () => [number, number] | null }) {
  const night = useContext(NightCtx);
  const m = useMemo(() => runwayMarks(W, L), [W, L]);
  const marks = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const tex = useMemo(() => m.labels.map((l) => labelTexture(l.text)), [m]);
  useEffect(() => () => tex.forEach((t) => t.dispose()), [tex]);
  const glow = useMemo(() => runwayLights(W, L, exit).map((g) => ({ ...g, xyz: toXYZ(g.pts), cols: g.pts.flatMap(() => rgbOf(g.color)) })), [W, L, exit]);
  const tw = useMemo(() => (exit ? { arc: exitArcGeo(EXIT.R - EXIT.w / 2, EXIT.R + EXIT.w / 2, -0.012), line: exitArcGeo(EXIT.R - 0.15, EXIT.R + 0.15, 0.004) } : null), [exit]);
  useEffect(
    () => () => {
      tw?.arc.dispose();
      tw?.line.dispose();
    },
    [tw],
  );
  useEffect(() => {
    const o = new THREE.Object3D();
    const im = marks.current;
    if (im) {
      m.rects.forEach(([u0, u1, v0, v1], i) => {
        o.position.set(-(u0 + u1) / 2, 0.012, (v0 + v1) / 2);
        o.scale.set(u1 - u0, 1, v1 - v0);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
    }
    const il = lights.current;
    if (il) {
      m.lights.forEach(([u, v], i) => {
        o.position.set(-u, 0.25, v);
        o.scale.set(0.18, 0.5, 0.18);
        o.updateMatrix();
        il.setMatrixAt(i, o.matrix);
      });
      il.instanceMatrix.needsUpdate = true;
    }
  }, [m]);
  const straight = (EXIT.vEnd - EXIT.R) / 2;
  return (
    <group>
      {/* trawa (ciemna) i asfalt */}
      <mesh position={[-L / 2, -0.03, -150]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[L + 1600, 1400]} />
        <meshStandardMaterial color={night ? '#0b0e0c' : '#1c2026'} roughness={1} />
      </mesh>
      <mesh position={[-L / 2, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color="#2f3338" roughness={0.92} />
      </mesh>
      <instancedMesh ref={marks} args={[undefined, undefined, m.rects.length]} raycast={() => null} frustumCulled={false}>
        <boxGeometry args={[1, 0.004, 1]} />
        <meshStandardMaterial color="#d9dde2" roughness={0.7} emissive="#d9dde2" emissiveIntensity={night ? 0 : 0.35} />
      </instancedMesh>
      {m.labels.map((l, i) => (
        // napis leży na nawierzchni; góra liter w głąb pasa (czytany przez lądującego na tym kierunku)
        <mesh key={l.text} position={[-l.u, 0.014, l.v]} rotation={[-Math.PI / 2, l.up > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 'YXZ']} raycast={() => null}>
          <planeGeometry args={[W * 0.36, W * 0.72]} />
          <meshStandardMaterial map={tex[i]} transparent depthWrite={false} roughness={0.7} emissive="#ffffff" emissiveMap={tex[i]} emissiveIntensity={night ? 0 : 0.35} />
        </mesh>
      ))}
      <instancedMesh ref={lights} args={[undefined, undefined, m.lights.length]} raycast={() => null} frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
        <meshBasicMaterial color={night ? '#fff3c4' : '#c9c2a0'} />
      </instancedMesh>
      {/* PAPI: cztery skrzynki z soczewkami po lewej stronie pasa przy punkcie celowania */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-PAPI_U, 0.45, W / 2 + 15 + i * 9]} raycast={() => null}>
          <boxGeometry args={[0.9, 0.7, 1.4]} />
          <meshStandardMaterial color="#d4d8dc" roughness={0.6} />
        </mesh>
      ))}
      {/* zjazd w prawo na drogę kołowania: łuk i prosta, żółta oś */}
      {tw && (
        <>
          <mesh geometry={tw.arc} raycast={() => null}>
            <meshStandardMaterial color="#2f3338" roughness={0.92} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-(EXIT.u + EXIT.R), -0.012, straight]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[EXIT.w, -EXIT.R - EXIT.vEnd]} />
            <meshStandardMaterial color="#2f3338" roughness={0.92} />
          </mesh>
          <mesh geometry={tw.line} raycast={() => null}>
            <meshStandardMaterial color="#d9a520" roughness={0.7} side={THREE.DoubleSide} emissive="#d9a520" emissiveIntensity={night ? 0 : 0.25} />
          </mesh>
          <mesh position={[-(EXIT.u + EXIT.R), 0.004, straight]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[0.3, -EXIT.R - EXIT.vEnd]} />
            <meshStandardMaterial color="#d9a520" roughness={0.7} emissive="#d9a520" emissiveIntensity={night ? 0 : 0.25} />
          </mesh>
        </>
      )}
      {night && glow.map((g, i) => <GlowDots key={i} pts={g.xyz} colors={g.cols} size={g.size} />)}
      {night && <RunwayFlashers W={W} eye={eye} />}
    </group>
  );
}

/**
 * Lotnisko wokół pasa: płyta postojowa przy drodze kołowania (za zjazdem), stanowisko z linią wjazdu i linią
 * zatrzymania, terminal z oknami i maszty oświetlenia płyty. Wspólne dla scen na ziemi (postój, kołowanie, światła).
 */
export function AirportModel({ W = 45 }: { W?: number }) {
  const night = useContext(NightCtx);
  const S = STAND;
  const d = useMemo(() => {
    const uEdge = EXIT.u + EXIT.R - EXIT.w / 2;
    const apron = { u0: S.u - 110, u1: uEdge, v0: -305, v1: -130 };
    const blue: number[] = [];
    for (let u = apron.u0; u <= apron.u1 - 20; u += 24) blue.push(-u, 0.3, apron.v1 + 1, -u, 0.3, apron.v0 - 1);
    for (let v = apron.v1; v >= apron.v0; v -= 24) blue.push(-apron.u0 + 1, 0.3, v);
    const masts = [-60, 0, 60].map((du) => [S.u + du, -300] as [number, number]);
    let k = 21;
    const r = () => {
      k = (k * 16807) % 2147483647;
      return (k - 1) / 2147483646;
    };
    const windows: number[] = [];
    for (let u = S.u - 78; u <= S.u + 78; u += 2.4) for (const y of [4, 8, 11.5]) if (r() > 0.35) windows.push(-u, y, -319.8);
    return { apron, blue, masts, windows };
  }, [S.u]);
  const a = d.apron;
  const blueCols = useMemo(() => d.blue.map((_, i) => [0.24, 0.48, 1][i % 3]), [d.blue]);
  const winCols = useMemo(() => d.windows.map((_, i) => [0.79, 0.64, 0.42][i % 3]), [d.windows]);
  const mastPts = useMemo(() => d.masts.flatMap(([u, v]) => [-u, 26, v]), [d.masts]);
  const mastCols = useMemo(() => mastPts.map((_, i) => [1, 0.85, 0.63][i % 3]), [mastPts]);
  const leadLen = EXIT.u + EXIT.R - (S.u - 40);
  return (
    <group>
      <RunwayModel W={W} />
      {/* płyta postojowa (jaśniejszy beton) */}
      <mesh position={[-(a.u0 + a.u1) / 2, -0.008, (a.v0 + a.v1) / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[a.u1 - a.u0, a.v1 - a.v0]} />
        <meshStandardMaterial color="#3a3e44" roughness={0.92} />
      </mesh>
      {/* linia wjazdu na stanowisko (od osi drogi kołowania) i linia zatrzymania przed nosem */}
      <mesh position={[-(S.u - 40 + leadLen / 2), 0.003, S.v]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[leadLen, 0.3]} />
        <meshStandardMaterial color="#d9a520" roughness={0.7} emissive="#d9a520" emissiveIntensity={night ? 0 : 0.25} />
      </mesh>
      <mesh position={[-(S.u + 40), 0.003, S.v]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[0.6, 12]} />
        <meshStandardMaterial color="#d9a520" roughness={0.7} emissive="#d9a520" emissiveIntensity={night ? 0 : 0.25} />
      </mesh>
      {/* terminal po prawej stronie stanowiska */}
      <mesh position={[-S.u, 7, -328]} raycast={() => null}>
        <boxGeometry args={[160, 14, 16]} />
        <meshStandardMaterial color={night ? '#15181c' : '#8a929b'} roughness={0.85} />
      </mesh>
      {/* maszty oświetlenia płyty */}
      {d.masts.map(([u, v]) => (
        <mesh key={u} position={[-u, 13, v]} raycast={() => null}>
          <cylinderGeometry args={[0.25, 0.35, 26, 8]} />
          <meshStandardMaterial color="#5b636c" roughness={0.8} />
        </mesh>
      ))}
      {night && (
        <>
          <GlowDots pts={d.blue} colors={blueCols} size={1.4} />
          <GlowDots pts={d.windows} colors={winCols} size={0.9} opacity={0.55} />
          <GlowDots pts={mastPts} colors={mastCols} size={4} />
        </>
      )}
    </group>
  );
}

export type NdLine = { pts: [number, number][]; color: string; width?: number; dash?: string; fill?: string };
/**
 * Ten sam pas jako mapa lotniska na ND (jak OANS w A350): nawierzchnia ciemnoszara z białym obrysem, przerywana oś,
 * pasy progów i oznaczenia obu końców w ramkach. toAc – punkt pasa (u, v) w układzie samolotu: [w prawo, do przodu] (m).
 */
export function runwayNdMap(W: number, toAc: (u: number, v: number) => [number, number], L = RWY.L) {
  const NM = 1852;
  const p = (u: number, v: number): [number, number] => {
    const [r, f] = toAc(u, v);
    return [r / NM, f / NM];
  };
  const lines: NdLine[] = [
    { pts: [p(0, -W / 2), p(L, -W / 2), p(L, W / 2), p(0, W / 2)], color: '#f2f4f6', width: 1.4, fill: '#3a3f46' },
    { pts: [p(66, 0), p(L - 66, 0)], color: '#f2f4f6', width: 1, dash: '8 6' },
  ];
  // progi: po jednej kresce na każdą stronę osi (w skali ND pojedyncze pasy zlewają się)
  for (const u0 of [6, L - 36])
    for (const s of [-1, 1]) {
      const a = s * W * 0.08;
      const b = s * (W / 2 - 2);
      lines.push({ pts: [p(u0, a), p(u0 + 30, a), p(u0 + 30, b), p(u0, b)], color: '#f2f4f6', width: 0.5, fill: '#f2f4f6' });
    }
  const labels = [
    { text: RWY.name, at: p(-28, 0) },
    { text: RWY.opp, at: p(L + 28, 0) },
  ];
  return { lines, labels };
}

/**
 * Pas jako symbol na ND w locie (tryby ARC/ROSE NAV, jak w prawdziwym ND): wąski biały obrys pasa w skali – ale nie
 * węższy niż kilka pikseli, żeby był czytelny – i przedłużona oś pasa od progu w stronę podejścia (biała, przerywana,
 * ok. 9 NM). Napis z oznaczeniem pasa obok progu. Na ziemi (kołowanie) zamiast symbolu jest mapa lotniska
 * (runwayNdMap). minHalf – najmniejsza połowa szerokości symbolu (m, w skali bieżącego zasięgu).
 */
export function runwayNdSymbol(W: number, toAc: (u: number, v: number) => [number, number], minHalf: number, L = RWY.L) {
  const NM = 1852;
  const p = (u: number, v: number): [number, number] => {
    const [r, f] = toAc(u, v);
    return [r / NM, f / NM];
  };
  const h = Math.max(W / 2, minHalf);
  const lines: NdLine[] = [
    { pts: [p(0, -h), p(L, -h), p(L, h), p(0, h)], color: '#f2f4f6', width: 1.6, fill: '#05070a' },
    { pts: [p(-9 * NM, 0), p(0, 0)], color: '#f2f4f6', width: 1, dash: '6 6' },
  ];
  const labels = [{ text: RWY.name, at: p(0, -h - 2.4 * minHalf), size: 10 }];
  return { lines, labels };
}
