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
/** Droga kołowania równoległa do pasa (v osi) i łącznik do progu 27R (u osi), szerokość dróg kołowania. */
export const TWY_V = -110;
export const A1_U = 40;
export const TWY_W = 23;
/** Stanowisko przy terminalu (cykl obsługi): koła główne w (u, v), nos w stronę terminalu (−v); linia zatrzymania koła przedniego. */
export const GATE = { u: 1560, v: -272, stopV: -272 - 30.8 };
/** Fasada terminalu (v), głębokość budynku i zakres wzdłuż płyty (u). */
const TERM = { v: -320, d: 26, u0: 1420, u1: 1850 };

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

/* ---------- tekstury nawierzchni, trawy i fasady (wspólne, rysowane raz) ---------- */

const TEX = new Map<string, THREE.CanvasTexture>();
/** Tekstura z kanwy (rysowana raz) – kopia z własnym powtórzeniem dla każdego użycia. */
function canvasTex(key: string, size: number, draw: (x: CanvasRenderingContext2D, n: number) => void, rep: [number, number]) {
  let base = TEX.get(key);
  if (!base) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d')!, size);
    base = new THREE.CanvasTexture(c);
    base.colorSpace = THREE.SRGBColorSpace;
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    base.anisotropy = 8;
    TEX.set(key, base);
  }
  const t = base.clone();
  t.repeat.set(rep[0], rep[1]);
  t.needsUpdate = true;
  return t;
}
/** Powtarzalny szum (ziarno nawierzchni, kępy trawy). */
function speckle(x: CanvasRenderingContext2D, n: number, count: number, cols: string[], rMax: number, seed: number) {
  let k = seed;
  const r = () => ((k = (k * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < count; i++) {
    x.fillStyle = cols[i % cols.length];
    x.globalAlpha = 0.25 + r() * 0.5;
    const s = 0.6 + r() * rMax;
    x.fillRect(r() * n, r() * n, s, s);
  }
  x.globalAlpha = 1;
}
/** Trawa: zielona z odcieniami i pasami koszenia (kafel 50 m). */
export const grassTex = (rep: [number, number]) =>
  canvasTex(
    'grass',
    512,
    (x, n) => {
      x.fillStyle = '#5d7a3e';
      x.fillRect(0, 0, n, n);
      for (let i = 0; i < 8; i++) {
        x.fillStyle = i % 2 ? 'rgba(255,255,230,0.05)' : 'rgba(0,30,0,0.06)';
        x.fillRect(0, (i * n) / 8, n, n / 8);
      }
      speckle(x, n, 9000, ['#4c6a31', '#6f8c4a', '#7d9452', '#435d2c'], 3, 11);
    },
    rep,
  );
/** Asfalt: ciemnoszary z drobnym kruszywem (kafel 20 m). */
const asphaltTex = (rep: [number, number]) =>
  canvasTex(
    'asphalt',
    512,
    (x, n) => {
      x.fillStyle = '#383c41';
      x.fillRect(0, 0, n, n);
      speckle(x, n, 14000, ['#2a2d31', '#454a50', '#3c4045', '#50555b'], 1.6, 7);
    },
    rep,
  );
/** Beton płyty: płyty 5 × 5 m z fugami i przebarwieniami (kafel 40 m). */
const concreteTex = (rep: [number, number]) =>
  canvasTex(
    'concrete',
    512,
    (x, n) => {
      x.fillStyle = '#8d939a';
      x.fillRect(0, 0, n, n);
      let k = 5;
      const r = () => ((k = (k * 16807) % 2147483647) - 1) / 2147483646;
      const c = n / 8;
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          const v = Math.round(r() * 14 - 7);
          x.fillStyle = `rgb(${141 + v},${147 + v},${154 + v})`;
          x.fillRect(i * c, j * c, c, c);
        }
      speckle(x, n, 8000, ['#7d838a', '#9aa0a6', '#868c93'], 1.4, 3);
      // plamy oleju i ślady opon
      for (let i = 0; i < 14; i++) {
        x.fillStyle = 'rgba(40,40,40,0.08)';
        x.beginPath();
        x.ellipse(r() * n, r() * n, 6 + r() * 20, 4 + r() * 12, r() * 3, 0, Math.PI * 2);
        x.fill();
      }
      x.strokeStyle = 'rgba(45,48,52,0.75)';
      x.lineWidth = 1.5;
      for (let i = 0; i <= 8; i++) {
        x.beginPath();
        x.moveTo(i * c, 0);
        x.lineTo(i * c, n);
        x.moveTo(0, i * c);
        x.lineTo(n, i * c);
        x.stroke();
      }
    },
    rep,
  );
/** Fasada terminalu: szklana ściana z ramami i stropami pięter (kafel 24 m szerokości, cała wysokość). */
const facadeTex = (rep: [number, number]) =>
  canvasTex(
    'facade',
    512,
    (x, n) => {
      const g = x.createLinearGradient(0, 0, 0, n);
      g.addColorStop(0, '#9dbbd3');
      g.addColorStop(0.5, '#6a8ba6');
      g.addColorStop(1, '#45617a');
      x.fillStyle = g;
      x.fillRect(0, 0, n, n);
      // odbicie nieba w szybach
      x.fillStyle = 'rgba(255,255,255,0.12)';
      x.beginPath();
      x.moveTo(0, n * 0.1);
      x.lineTo(n, n * 0.55);
      x.lineTo(n, n * 0.75);
      x.lineTo(0, n * 0.3);
      x.fill();
      x.fillStyle = '#cdd2d8';
      for (let i = 0; i <= 16; i++) x.fillRect((i * n) / 16 - 2, 0, 4, n);
      for (const f of [0, 0.5, 1]) x.fillRect(0, f * n - 7, n, 14);
      x.fillStyle = 'rgba(205,210,216,0.6)';
      for (const f of [0.25, 0.75]) x.fillRect(0, f * n - 1, n, 2);
    },
    rep,
  );

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
  const tx = useMemo(() => ({ grass: grassTex([(L + 6000) / 50, 5000 / 50]), rwy: asphaltTex([L / 20, W / 20]), pad: asphaltTex([6, W / 20]), twy: asphaltTex([1, (-EXIT.vEnd - EXIT.R) / 20]) }), [L, W]);
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
      {/* trawa wokół pasa, asfalt pasa, jaśniejsze pobocza i przedpola za końcami pasa z żółtymi strzałami */}
      <mesh position={[-L / 2, -0.05, -200]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[L + 6000, 5000]} />
        <meshStandardMaterial map={tx.grass} color={night ? '#1c241b' : '#ffffff'} roughness={1} />
      </mesh>
      <mesh position={[-L / 2, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial map={tx.rwy} color={night ? '#666' : '#ffffff'} roughness={0.92} />
      </mesh>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[-L / 2, -0.02, sd * (W / 2 + 3.75)]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[L + 240, 7.5]} />
          <meshStandardMaterial color={night ? '#26282a' : '#62676c'} roughness={0.95} />
        </mesh>
      ))}
      {[-1, 1].map((dir) => {
        // przedpole za końcem pasa (60 m) z żółtymi strzałami w stronę pasa
        const u = dir < 0 ? -60 : L + 60;
        return (
          <group key={dir}>
            <mesh position={[-u, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <planeGeometry args={[120, W]} />
              <meshStandardMaterial map={tx.pad} color={night ? '#666' : '#ffffff'} roughness={0.92} />
            </mesh>
            {[0, 1, 2].flatMap((k) =>
              [-1, 1].map((sd) => {
                const uu = u + dir * (k * 30 - 30);
                return (
                  <mesh key={`${k}${sd}`} position={[-uu, 0.002, sd * W * 0.2]} rotation={[-Math.PI / 2, 0, -dir * sd * 0.62]} raycast={() => null}>
                    <planeGeometry args={[W * 0.5, 1.2]} />
                    <meshStandardMaterial color="#d9a520" roughness={0.7} emissive="#d9a520" emissiveIntensity={night ? 0 : 0.2} />
                  </mesh>
                );
              }),
            )}
          </group>
        );
      })}
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
            <meshStandardMaterial color={night ? '#26282c' : '#3a3e43'} roughness={0.92} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-(EXIT.u + EXIT.R), -0.012, straight]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[EXIT.w, -EXIT.R - EXIT.vEnd]} />
            <meshStandardMaterial map={tx.twy} color={night ? '#666' : '#ffffff'} roughness={0.92} />
          </mesh>
          {/* pobocza drogi kołowania i podwójne żółte linie jej krawędzi */}
          {[-1, 1].map((sd) => (
            <mesh key={`sh${sd}`} position={[-(EXIT.u + EXIT.R) - sd * (EXIT.w / 2 + 5), -0.02, straight]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <planeGeometry args={[10, -EXIT.R - EXIT.vEnd]} />
              <meshStandardMaterial color={night ? '#26282a' : '#62676c'} roughness={0.95} />
            </mesh>
          ))}
          {[-1, 1].flatMap((sd) =>
            [0, 0.3].map((d) => (
              <mesh key={`${sd}${d}`} position={[-(EXIT.u + EXIT.R) - sd * (EXIT.w / 2 - 0.4 - d), 0.004, straight - 6]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <planeGeometry args={[0.15, -EXIT.R - EXIT.vEnd - 12]} />
                <meshStandardMaterial color="#d9a520" roughness={0.7} emissive="#d9a520" emissiveIntensity={night ? 0 : 0.2} />
              </mesh>
            )),
          )}
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

/** Prostokąt na płycie w układzie lotniska (u0…u1, v0…v1): nawierzchnia, linia, znak. */
function Rect({ u0, u1, v0, v1, y = 0.003, color, map, emissive = 0, night = false }: { u0: number; u1: number; v0: number; v1: number; y?: number; color: string; map?: THREE.Texture; emissive?: number; night?: boolean }) {
  return (
    <mesh position={[-(u0 + u1) / 2, y, (v0 + v1) / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[Math.max(0.1, Math.abs(u1 - u0)), Math.max(0.1, Math.abs(v1 - v0))]} />
      <meshStandardMaterial color={color} map={map} roughness={0.85} emissive={emissive ? color : '#000'} emissiveIntensity={night ? 0 : emissive} />
    </mesh>
  );
}
const YEL = '#d9a520';

/** Tablica informacyjna przy drodze kołowania (czerwona z białym napisem – oznaczenie pasa przed punktem oczekiwania). */
function signTexture(text: string, bg: string, fg: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.fillRect(0, 0, 256, 96);
  x.fillStyle = fg;
  x.font = 'bold 64px Arial, Helvetica, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function Sign({ u, v, text, bg, fg, yaw = 0 }: { u: number; v: number; text: string; bg: string; fg: string; yaw?: number }) {
  const tex = useMemo(() => signTexture(text, bg, fg), [text, bg, fg]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={[-u, 0, v]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.85, 0]} raycast={() => null}>
        <boxGeometry args={[2.6, 1, 0.25]} />
        <meshStandardMaterial color="#202326" />
      </mesh>
      {[1, -1].map((sd) => (
        <mesh key={sd} position={[0, 0.85, sd * 0.13]} rotation={[0, sd > 0 ? 0 : Math.PI, 0]} raycast={() => null}>
          <planeGeometry args={[2.5, 0.92]} />
          <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.35} />
        </mesh>
      ))}
      {[-0.9, 0.9].map((dx) => (
        <mesh key={dx} position={[dx, 0.2, 0]} raycast={() => null}>
          <boxGeometry args={[0.12, 0.4, 0.12]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
      ))}
    </group>
  );
}

/** Rękaw wiatrowy (pomarańczowo-biały) na maszcie przy progu pasa. */
function Windsock({ u, v }: { u: number; v: number }) {
  const sock = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (sock.current) sock.current.rotation.y = 0.6 + Math.sin(clock.elapsedTime * 0.7) * 0.12;
  });
  return (
    <group position={[-u, 0, v]}>
      <mesh position={[0, 3, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.06, 0.09, 6, 8]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>
      <group ref={sock} position={[0, 5.8, 0]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[0.4 + i * 0.7, -0.05 * i, 0]} rotation={[0, 0, Math.PI / 2]} raycast={() => null}>
            <cylinderGeometry args={[0.45 - i * 0.06, 0.4 - i * 0.06, 0.7, 14, 1, true]} />
            <meshStandardMaterial color={i % 2 ? '#f8fafc' : '#f97316'} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Terminal: parter z betonu, dwie kondygnacje przeszklone, wysunięty dach, urządzenia na dachu, numery wyjść. */
function Terminal({ night }: { night: boolean }) {
  const len = TERM.u1 - TERM.u0;
  const uc = (TERM.u0 + TERM.u1) / 2;
  const fac = useMemo(() => facadeTex([len / 24, 1]), [len]);
  const H0 = 4.5;
  const H1 = 11;
  const zf = TERM.v - 0.4;
  const gates = [GATE.u, STAND.u];
  const gTex = useMemo(() => gates.map((u, i) => signTexture(`A${i + 1}`, '#1f2937', '#fde047')), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      {/* parter */}
      <mesh position={[-uc, H0 / 2, TERM.v - TERM.d / 2]} raycast={() => null}>
        <boxGeometry args={[len, H0, TERM.d]} />
        <meshStandardMaterial color={night ? '#1d2024' : '#a7adb4'} roughness={0.85} />
      </mesh>
      {/* piętra: szklana fasada od strony płyty, reszta bryły jasna */}
      <mesh position={[-uc, H0 + H1 / 2, TERM.v - TERM.d / 2 - 1]} raycast={() => null}>
        <boxGeometry args={[len, H1, TERM.d - 2]} />
        <meshStandardMaterial color={night ? '#171a1e' : '#c3c8ce'} roughness={0.8} />
      </mesh>
      <mesh position={[-uc, H0 + H1 / 2, zf - 1 + 0.02]} raycast={() => null}>
        <planeGeometry args={[len, H1]} />
        <meshStandardMaterial map={fac} color={night ? '#3a4a5a' : '#ffffff'} roughness={0.15} metalness={0.4} emissive={night ? '#f2c07a' : '#000'} emissiveIntensity={night ? 0.25 : 0} />
      </mesh>
      {/* dach z okapem i krawędzią */}
      <mesh position={[-uc, H0 + H1 + 0.45, TERM.v - TERM.d / 2 + 1.5]} raycast={() => null}>
        <boxGeometry args={[len + 6, 0.9, TERM.d + 3]} />
        <meshStandardMaterial color={night ? '#22262a' : '#e2e5e9'} roughness={0.6} />
      </mesh>
      {/* słupy podcienia przed parterem */}
      {Array.from({ length: Math.floor(len / 24) + 1 }, (_, i) => (
        <mesh key={i} position={[-(TERM.u0 + i * 24), (H0 + H1) / 2, TERM.v + 1.2]} raycast={() => null}>
          <cylinderGeometry args={[0.35, 0.35, H0 + H1, 10]} />
          <meshStandardMaterial color={night ? '#2a2e33' : '#d5d9de'} />
        </mesh>
      ))}
      {/* urządzenia na dachu (wentylacja, klimatyzacja) */}
      {[0.15, 0.35, 0.6, 0.82].map((f, i) => (
        <mesh key={i} position={[-(TERM.u0 + f * len), H0 + H1 + 1.9, TERM.v - TERM.d / 2 - 2]} raycast={() => null}>
          <boxGeometry args={[14, 2, 6]} />
          <meshStandardMaterial color={night ? '#1d2024' : '#9aa1a9'} roughness={0.7} />
        </mesh>
      ))}
      {/* numery wyjść nad stanowiskami */}
      {gates.map((u, i) => (
        <mesh key={u} position={[-u, H0 + H1 - 1.2, zf + 0.05]} raycast={() => null}>
          <planeGeometry args={[4, 1.5]} />
          <meshStandardMaterial map={gTex[i]} emissive="#ffffff" emissiveMap={gTex[i]} emissiveIntensity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Wieża kontroli lotów: trzon, przeszklona kabina kontrolerów z okapem i anteny. */
function Tower({ u, v, night }: { u: number; v: number; night: boolean }) {
  return (
    <group position={[-u, 0, v]}>
      <mesh position={[0, 3, 0]} raycast={() => null}>
        <boxGeometry args={[16, 6, 16]} />
        <meshStandardMaterial color={night ? '#1d2024' : '#a7adb4'} />
      </mesh>
      <mesh position={[0, 24, 0]} raycast={() => null}>
        <cylinderGeometry args={[3.2, 4, 42, 16]} />
        <meshStandardMaterial color={night ? '#1d2024' : '#d5d9de'} roughness={0.7} />
      </mesh>
      <mesh position={[0, 45.5, 0]} raycast={() => null}>
        <cylinderGeometry args={[6.5, 4.5, 2, 8]} />
        <meshStandardMaterial color={night ? '#22262a' : '#c3c8ce'} />
      </mesh>
      <mesh position={[0, 48.5, 0]} raycast={() => null}>
        <cylinderGeometry args={[7, 6.5, 4, 8]} />
        <meshStandardMaterial color={night ? '#2f4a63' : '#4f7391'} roughness={0.1} metalness={0.5} emissive={night ? '#8fd0ff' : '#000'} emissiveIntensity={night ? 0.35 : 0} />
      </mesh>
      <mesh position={[0, 51, 0]} raycast={() => null}>
        <cylinderGeometry args={[7.8, 7.8, 1, 8]} />
        <meshStandardMaterial color={night ? '#22262a' : '#e2e5e9'} />
      </mesh>
      {[-2, 2].map((dx) => (
        <mesh key={dx} position={[dx, 54, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.08, 0.08, 5, 6]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
      ))}
    </group>
  );
}

/** Hangar obsługi technicznej: łukowy dach, wielkie przesuwne wrota. */
function Hangar({ u, v, night }: { u: number; v: number; night: boolean }) {
  return (
    <group position={[-u, 0, v]}>
      <mesh position={[0, 11, 0]} raycast={() => null}>
        <boxGeometry args={[96, 22, 70]} />
        <meshStandardMaterial color={night ? '#1a1d20' : '#c9ced4'} roughness={0.8} />
      </mesh>
      <mesh position={[0, 22, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 1]} raycast={() => null}>
        <cylinderGeometry args={[35, 35, 96, 24, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color={night ? '#1d2024' : '#b4bac1'} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>
      {[-30, -10, 10, 30].map((dx) => (
        <mesh key={dx} position={[dx, 9.5, 35.05]} raycast={() => null}>
          <planeGeometry args={[19.4, 19]} />
          <meshStandardMaterial color={night ? '#15181b' : '#8e959d'} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Lotnisko wokół pasa: drogi kołowania (zjazd, droga równoległa z łącznikiem do progu i punktem oczekiwania), betonowa
 * płyta postojowa z dwoma stanowiskami (oznakowanie wjazdu, zatrzymania i ograniczenia sprzętu), terminal, wieża
 * kontroli, hangar, maszty oświetlenia, rękaw wiatrowy i tablice. Wspólne dla wszystkich scen na lotnisku – w dzień
 * i w nocy (NightCtx: światła dróg kołowania, okna, maszty).
 */
export function AirportModel({ W = 45 }: { W?: number }) {
  const night = useContext(NightCtx);
  const S = STAND;
  const w = TWY_W;
  const apron = { u0: TERM.u0, u1: EXIT.u + EXIT.R - w / 2 - 6, v0: TERM.v, v1: TWY_V - w / 2 - 10 };
  const tx = useMemo(
    () => ({
      apron: concreteTex([(apron.u1 - apron.u0) / 40, (apron.v1 - apron.v0) / 40]),
      par: asphaltTex([(EXIT.u + EXIT.R - A1_U) / 20, w / 20]),
      a1: asphaltTex([w / 20, (-TWY_V - W / 2) / 20]),
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const d = useMemo(() => {
    // światła nocą: niebieskie krawędzi płyty i dróg, zielone osi dróg kołowania
    const blue: number[] = [];
    for (let u = apron.u0; u <= apron.u1; u += 24) blue.push(-u, 0.3, apron.v1 + 1);
    for (let u = A1_U + w; u <= EXIT.u + EXIT.R - w; u += 30) for (const dv of [-w / 2 - 1, w / 2 + 1]) blue.push(-u, 0.3, TWY_V + dv);
    for (let v = TWY_V + w; v <= -W / 2 - 8; v += 20) for (const du of [-w / 2 - 1, w / 2 + 1]) blue.push(-(A1_U + du), 0.3, v);
    const green: number[] = [];
    for (let u = A1_U + 20; u <= EXIT.u + EXIT.R - 10; u += 15) green.push(-u, 0.06, TWY_V);
    for (let v = TWY_V + 15; v <= -6; v += 15) green.push(-A1_U, 0.06, v);
    for (let v = TWY_V - 15; v >= GATE.stopV; v -= 15) green.push(-GATE.u, 0.06, v);
    // czerwone światła poprzeczki zatrzymania na punkcie oczekiwania
    const red: number[] = [];
    for (let du = -w / 2; du <= w / 2; du += 3) red.push(-(A1_U + du), 0.1, -76.5);
    const masts = [S.u - 60, S.u + 20, GATE.u - 60, GATE.u + 40].map((u) => [u, TERM.v + 22] as [number, number]);
    let k = 21;
    const r = () => {
      k = (k * 16807) % 2147483647;
      return (k - 1) / 2147483646;
    };
    const windows: number[] = [];
    for (let u = TERM.u0 + 3; u <= TERM.u1 - 3; u += 2.4) for (const y of [6.5, 9.5, 12.5]) if (r() > 0.35) windows.push(-u, y, TERM.v - 1.3);
    return { blue, green, red, masts, windows };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = (pts: number[], c: [number, number, number]) => pts.map((_, i) => c[i % 3]);
  const mastPts = d.masts.flatMap(([u, v]) => [-u, 26, v]);
  // stanowiska: linia wjazdu (od osi drogi), linia zatrzymania przedniego koła i czerwone linie ograniczenia sprzętu
  const stand = (u: number, from: number, to: number, stop: number, along: 'v' | 'u') =>
    along === 'v' ? (
      <group key={`${u}`}>
        <Rect u0={u - 0.15} u1={u + 0.15} v0={Math.min(from, to)} v1={Math.max(from, to)} color={YEL} emissive={0.25} night={night} />
        <Rect u0={u - 4} u1={u + 4} v0={stop - 0.3} v1={stop + 0.3} color={YEL} emissive={0.25} night={night} />
        {[-38, 38].map((du) => (
          <Rect key={du} u0={u + du - 0.2} u1={u + du + 0.2} v0={TERM.v + 2} v1={GATE.v + 40} color="#c8352b" emissive={0.15} night={night} />
        ))}
      </group>
    ) : null;
  return (
    <group>
      <RunwayModel W={W} />
      {/* droga równoległa i łącznik A1 do progu: asfalt, pobocza, oś i podwójne krawędzie */}
      <Rect u0={A1_U - w / 2 - 10} u1={EXIT.u + EXIT.R + w / 2} v0={TWY_V - w / 2 - 10} v1={TWY_V + w / 2 + 10} y={-0.025} color={night ? '#26282a' : '#62676c'} />
      <Rect u0={A1_U - w / 2} u1={EXIT.u + EXIT.R + w / 2} v0={TWY_V - w / 2} v1={TWY_V + w / 2} y={-0.012} color={night ? '#666' : '#ffffff'} map={tx.par} />
      <Rect u0={A1_U - w / 2 - 10} u1={A1_U + w / 2 + 10} v0={TWY_V} v1={-W / 2 - 7.5} y={-0.024} color={night ? '#26282a' : '#62676c'} />
      <Rect u0={A1_U - w / 2} u1={A1_U + w / 2} v0={TWY_V} v1={-W / 2} y={-0.011} color={night ? '#666' : '#ffffff'} map={tx.a1} />
      <Rect u0={A1_U + w / 2} u1={EXIT.u + EXIT.R} v0={TWY_V - 0.15} v1={TWY_V + 0.15} color={YEL} emissive={0.25} night={night} />
      <Rect u0={A1_U - 0.15} u1={A1_U + 0.15} v0={TWY_V + w / 2} v1={-W / 2 - 1} color={YEL} emissive={0.25} night={night} />
      {[-1, 1].flatMap((sd) =>
        [0, 0.3].map((dd) => (
          <group key={`${sd}${dd}`}>
            <Rect u0={A1_U + w / 2 + 2} u1={EXIT.u + EXIT.R - w / 2 - 2} v0={TWY_V + sd * (w / 2 - 0.4 - dd) - 0.075} v1={TWY_V + sd * (w / 2 - 0.4 - dd) + 0.075} color={YEL} emissive={0.2} night={night} />
            <Rect u0={A1_U + sd * (w / 2 - 0.4 - dd) - 0.075} u1={A1_U + sd * (w / 2 - 0.4 - dd) + 0.075} v0={TWY_V + w / 2 + 2} v1={-W / 2 - 3} color={YEL} emissive={0.2} night={night} />
          </group>
        )),
      )}
      {/* punkt oczekiwania przed pasem: dwie linie ciągłe (od strony drogi) i dwie przerywane (od strony pasa) */}
      {[0, 0.9].map((dd) => (
        <Rect key={dd} u0={A1_U - w / 2} u1={A1_U + w / 2} v0={-78 - dd - 0.15} v1={-78 - dd + 0.15} color={YEL} emissive={0.25} night={night} />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <group key={i}>
          <Rect u0={A1_U - w / 2 + i * 3.4} u1={A1_U - w / 2 + i * 3.4 + 2} v0={-80.1} v1={-79.8} color={YEL} emissive={0.25} night={night} />
          <Rect u0={A1_U - w / 2 + i * 3.4} u1={A1_U - w / 2 + i * 3.4 + 2} v0={-81} v1={-80.7} color={YEL} emissive={0.25} night={night} />
        </group>
      ))}
      <Sign u={A1_U - w / 2 - 6} v={-79} text={`${RWY.name}-${RWY.opp}`} bg="#c62828" fg="#ffffff" yaw={Math.PI / 2} />
      <Sign u={A1_U + w / 2 + 6} v={-79} text="A1" bg="#111111" fg="#fde047" yaw={Math.PI / 2} />
      <Sign u={EXIT.u + EXIT.R + w / 2 + 7} v={TWY_V + 20} text="A" bg="#fde047" fg="#111111" />
      {/* płyta postojowa: beton w płytach */}
      <Rect u0={apron.u0} u1={apron.u1} v0={apron.v0} v1={apron.v1} y={-0.008} color={night ? '#555' : '#ffffff'} map={tx.apron} />
      {/* łączniki płyty z drogą równoległą */}
      <Rect u0={apron.u0 + 20} u1={apron.u1 - 10} v0={apron.v1} v1={TWY_V - w / 2} y={-0.01} color={night ? '#555' : '#ffffff'} map={tx.apron} />
      {/* stanowisko A1 (cykl obsługi: nos w stronę terminalu) */}
      {stand(GATE.u, TWY_V, GATE.stopV - 1, GATE.stopV, 'v')}
      {/* stanowisko A2 (moduły kadłuba i świateł: samolot stoi nosem w stronę drogi kołowania) */}
      <Rect u0={S.u - 40} u1={EXIT.u + EXIT.R} v0={S.v - 0.15} v1={S.v + 0.15} color={YEL} emissive={0.25} night={night} />
      <Rect u0={S.u + 40 - 0.3} u1={S.u + 40 + 0.3} v0={S.v - 6} v1={S.v + 6} color={YEL} emissive={0.25} night={night} />
      {/* pola postoju sprzętu (białe obrysy) przy terminalu */}
      {[GATE.u - 30, GATE.u + 14, S.u - 40, S.u + 6].map((u) => (
        <group key={u}>
          <Rect u0={u} u1={u + 16} v0={TERM.v + 4} v1={TERM.v + 4.2} color="#e5e7eb" emissive={0.1} night={night} />
          <Rect u0={u} u1={u + 16} v0={TERM.v + 12} v1={TERM.v + 12.2} color="#e5e7eb" emissive={0.1} night={night} />
          <Rect u0={u} u1={u + 0.2} v0={TERM.v + 4} v1={TERM.v + 12.2} color="#e5e7eb" emissive={0.1} night={night} />
          <Rect u0={u + 15.8} u1={u + 16} v0={TERM.v + 4} v1={TERM.v + 12.2} color="#e5e7eb" emissive={0.1} night={night} />
        </group>
      ))}
      <Terminal night={night} />
      <Tower u={1250} v={-400} night={night} />
      <Hangar u={2250} v={-420} night={night} />
      {/* budynek cargo i magazyn obsługi naziemnej */}
      <mesh position={[-1150, 7, -360]} raycast={() => null}>
        <boxGeometry args={[120, 14, 40]} />
        <meshStandardMaterial color={night ? '#1a1d20' : '#b7a88f'} roughness={0.85} />
      </mesh>
      <mesh position={[-2000, 4, -340]} raycast={() => null}>
        <boxGeometry args={[60, 8, 26]} />
        <meshStandardMaterial color={night ? '#1a1d20' : '#9aa5b1'} roughness={0.85} />
      </mesh>
      {/* zbiorniki składu paliwa */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-(2450 + i * 34), 7, -520]} raycast={() => null}>
          <cylinderGeometry args={[14, 14, 14, 28]} />
          <meshStandardMaterial color={night ? '#1d2024' : '#eef1f4'} roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
      <Windsock u={260} v={W / 2 + 70} />
      {/* maszty oświetlenia płyty z oprawami */}
      {d.masts.map(([u, v]) => (
        <group key={u} position={[-u, 0, v]}>
          <mesh position={[0, 13, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.25, 0.4, 26, 8]} />
            <meshStandardMaterial color="#5b636c" roughness={0.8} />
          </mesh>
          <mesh position={[0, 26.2, 0]} raycast={() => null}>
            <boxGeometry args={[3.2, 0.5, 1.2]} />
            <meshStandardMaterial color="#3f464e" emissive={night ? '#ffe2a8' : '#000'} emissiveIntensity={night ? 1 : 0} />
          </mesh>
        </group>
      ))}
      {night && (
        <>
          <GlowDots pts={d.blue} colors={cols(d.blue, [0.24, 0.48, 1])} size={1.4} />
          <GlowDots pts={d.green} colors={cols(d.green, [0.21, 1, 0.42])} size={1.1} />
          <GlowDots pts={d.red} colors={cols(d.red, [1, 0.2, 0.15])} size={1.2} />
          <GlowDots pts={d.windows} colors={cols(d.windows, [0.79, 0.64, 0.42])} size={0.9} opacity={0.55} />
          <GlowDots pts={mastPts} colors={cols(mastPts, [1, 0.85, 0.63])} size={4} />
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
