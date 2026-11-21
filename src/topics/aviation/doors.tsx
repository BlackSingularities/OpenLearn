/*
 * Moduł „Drzwi i ewakuacja”: drzwi pasażerskie A350-1000 (typ A, po cztery z każdej burty) z detalami i napisami,
 * otwieranie (unoszenie z ograniczników, wysunięcie i obrót do przodu na ramieniu z równoległowodem), uzbrajanie
 * zjeżdżalni (dźwignia, drążek w uchwytach podłogi, kontrolka SLIDE ARMED), otwarcie awaryjne z siłownikiem
 * i napełnianie zjeżdżalni, ewakuacja wszystkimi wyjściami oraz drzwi w locie (ciśnienie dociska je do ram).
 * Otwory w poszyciu, kabinę za nimi i stanowisko na płycie daje wspólny model (airliner.tsx, CargoStand); drzwi,
 * zjeżdżalnie i ludzie są tutaj. Scenariusze – etap po etapie, jak w innych modułach (StageCamera, ramka z etapami).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Params } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { CockpitDock, Ecam } from '../../components/cockpit';
import { CargoStand, FLOOR, Lbl, PAX_DOOR, PLANE_LEVELS, fusPt, fusTheta, grid, mergeGeo, placeBetween, refine } from './airliner';
import { StageCamera } from './airSystem';
import { useStage } from './cabinSystems';

type V3 = [number, number, number];
const G = PLANE_LEVELS.ground;
const sm = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type DoorMode = 'home' | 'open' | 'arm' | 'slide' | 'evac' | 'press';

/* ============================== geometria drzwi (lewa burta, z > 0) ============================== */

const HW = PAX_DOOR.hw - 0.02;
const YB = PAX_DOOR.yb + 0.02;
const YT = PAX_DOOR.yt - 0.02;
const DOOR_T = 0.2; // grubość drzwi (poszycie → wykładzina)
const R_CORNER = 0.2;
/** Punkt poszycia (lewa burta) w x, na wysokości y, odsunięty o `off` do środka (ujemne – na zewnątrz). */
const P = (x: number, y: number, off = 0): V3 => fusPt(x, fusTheta(x, y), off);
/** Układ na poszyciu: położenie i obrót tak, żeby płaska bryła (+z lokalnie) patrzyła na zewnątrz (out) albo do kabiny. */
function onSkin(x: number, y: number, off: number, out: boolean) {
  const a = new THREE.Vector3(...P(x, y, off));
  const n = new THREE.Vector3(...P(x, y, 0)).sub(new THREE.Vector3(...P(x, y, 0.1))).normalize();
  const z = out ? n : n.clone().negate();
  const xAxis = new THREE.Vector3(0, 1, 0).cross(z).normalize();
  const yAxis = z.clone().cross(xAxis);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, z));
  return { p: a.toArray() as V3, q };
}
/** Czy punkt (x, y) drzwi leży w zaokrąglonym prostokącie otworu. */
const inDoor = (xd: number, x: number, y: number) => {
  const dx = Math.abs(x - xd) - (HW - R_CORNER);
  const dy = y < YB + R_CORNER ? YB + R_CORNER - y : y > YT - R_CORNER ? y - (YT - R_CORNER) : 0;
  return dx <= 0 || dy <= 0 || dx * dx + dy * dy <= R_CORNER * R_CORNER;
};

/** Bryły drzwi o środku xd (lewa burta): poszycie, krawędzie, wykładzina od środka. */
function doorGeometry(xd: number) {
  const xs = refine([xd - HW, xd + HW], 0.04);
  const ys = refine([YB, YT], 0.04);
  const skip = (x: number, y: number) => !inDoor(xd, x, y);
  const outer = grid(xs, ys, (x, y) => P(x, y, -0.012), skip);
  const inner = grid(xs, ys, (x, y) => P(x, y, DOOR_T), skip);
  // krawędzie: obwód zaokrąglonego prostokąta wyciągnięty od poszycia do wykładziny
  const ring: [number, number][] = [];
  const corners: [number, number, number][] = [
    [xd + HW - R_CORNER, YT - R_CORNER, 0],
    [xd - HW + R_CORNER, YT - R_CORNER, Math.PI / 2],
    [xd - HW + R_CORNER, YB + R_CORNER, Math.PI],
    [xd + HW - R_CORNER, YB + R_CORNER, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) for (let k = 0; k <= 8; k++) ring.push([cx + R_CORNER * Math.cos(a0 + (k / 8) * (Math.PI / 2)), cy + R_CORNER * Math.sin(a0 + (k / 8) * (Math.PI / 2))]);
  ring.push(ring[0]);
  const idx = ring.map((_, i) => i);
  const edge = grid(idx, [-0.012, DOOR_T], (i, o) => P(ring[i][0], ring[i][1], o));
  // uszczelka: ciemny pas na krawędzi, bliżej wnętrza
  const seal = grid(idx, [DOOR_T - 0.06, DOOR_T + 0.005], (i, o) => P(ring[i][0], ring[i][1], o - 0.002));
  return { outer, inner, edge: mergeGeo([edge]), seal };
}

/* ============================== kinematyka ============================== */

/**
 * Przesunięcie drzwi przy otwieraniu (u: 0 – zamknięte, 1 – otwarte): najpierw uniesienie z ograniczników o ok. 5 cm,
 * wysunięcie na zewnątrz, potem obrót do przodu na ramieniu zawiasu – równoległowód trzyma drzwi równolegle do burty.
 */
function doorOffset(u: number): { off: V3; phi: number; push: number } {
  const lift = 0.05 * sm(u / 0.12) * (1 - 0.6 * sm((u - 0.9) / 0.1));
  const push = 0.16 * sm((u - 0.1) / 0.14);
  const phi = 2.6 * sm((u - 0.22) / 0.78);
  const R = PAX_DOOR.hw;
  return { off: [R * Math.cos(phi) - R, lift, push + R * Math.sin(phi)], phi, push };
}

/* ============================== stan drzwi w scenariuszach ============================== */

type DS = { u: number; handle: number; lever: number; girt: number; ind: boolean; press: boolean; k: number; actuator: boolean };
const CLOSED: DS = { u: 0, handle: 0, lever: 0, girt: 0, ind: false, press: false, k: 0, actuator: false };

export const DOOR_STAGES: Record<Exclude<DoorMode, 'home'>, { title: string; color: string; dur: number; text: string }[]> = {
  open: [
    { title: 'Zamknięte i zablokowane', color: '#94a3b8', dur: 4, text: 'Drzwi działają jak korek: są większe od otworu i od środka dociśnięte do metalowych ograniczników w ramie. To ograniczniki – kilkanaście par na krawędziach drzwi i ramy – trzymają drzwi, gdy w kabinie jest ciśnienie.' },
    { title: 'Dźwignia w górę', color: '#f59e0b', dur: 3.5, text: 'Członek załogi podnosi dźwignię otwierania. Zwalnia ona zamki, a mechanizm przygotowuje drzwi do uniesienia. Gdy w kabinie jest jeszcze nadciśnienie, zabezpieczenie na to nie pozwala – na ziemi ciśnienie w kabinie jest już takie jak na zewnątrz.' },
    { title: 'Uniesienie z ograniczników', color: '#facc15', dur: 3, text: 'Drzwi podnoszą się o kilka centymetrów, tak że ich ograniczniki przechodzą ponad ogranicznikami w ramie. Dopiero teraz drzwi mogą wyjść na zewnątrz – są szersze od otworu tylko w miejscach ograniczników.' },
    { title: 'Wysunięcie na zewnątrz', color: '#38bdf8', dur: 3, text: 'Drzwi wychodzą z otworu na zewnątrz kadłuba, a uszczelka odkleja się od ramy.' },
    { title: 'Obrót do przodu', color: '#22c55e', dur: 5, text: 'Drzwi obracają się do przodu na ramieniu. Mechanizm w ramieniu trzyma je przez cały czas równolegle do boku kadłuba – nie wystają daleko w bok i nie zawadzają o rękaw ani schody.' },
    { title: 'Blokada w pozycji otwartej', color: '#a78bfa', dur: 4, text: 'Otwarte drzwi trzyma blokada, więc wiatr ich nie zamknie. Żeby je zamknąć, trzeba zwolnić blokadę przyciskiem na ramieniu i pociągnąć drzwi za uchwyt.' },
  ],
  arm: [
    { title: 'Tryb rozbrojony', color: '#22c55e', dur: 4, text: 'Na ziemi drzwi są rozbrojone (DISARMED): metalowy drążek zjeżdżalni leży w jej pojemniku na dole drzwi. Otwarcie drzwi nie wyrzuci zjeżdżalni – tak otwiera się drzwi przy rękawie i schodach.' },
    { title: 'Dźwignia na ARMED', color: '#ef4444', dur: 4, text: 'Przed wypchnięciem samolotu pada polecenie: „Cabin crew, arm doors and cross-check” – „uzbroić drzwi i sprawdzić nawzajem”. Członek załogi przestawia dźwignię na ARMED (uzbrojone, czerwone pole na tabliczce).' },
    { title: 'Drążek w uchwytach podłogi', color: '#f59e0b', dur: 4, text: 'Dźwignia przekłada drążek zjeżdżalni z pojemnika do uchwytów w podłodze przy progu. Zjeżdżalnia jest teraz „przypięta” do kadłuba – gdy drzwi się otworzą, wyciągną ją z pojemnika na zewnątrz.' },
    { title: 'Kontrolka SLIDE ARMED', color: '#ef4444', dur: 4, text: 'W okienku drzwi świeci czerwona kontrolka SLIDE ARMED („zjeżdżalnia uzbrojona”), a w kokpicie strona drzwi pokazuje uzbrojone drzwi. Drugi członek załogi sprawdza drzwi po przeciwnej stronie.' },
    { title: 'Rozbrojenie po przylocie', color: '#22c55e', dur: 4, text: 'Po przylocie, zanim drzwi zostaną otwarte, pada polecenie „disarm doors” – „rozbroić drzwi”. Dźwignia wraca na DISARMED, a drążek do pojemnika. Gdyby ktoś o tym zapomniał, zjeżdżalnia wystrzeliłaby prosto na rękaw albo na ludzi na płycie.' },
  ],
  slide: [
    { title: 'Drzwi uzbrojone', color: '#ef4444', dur: 3, text: 'Ewakuacja na ziemi. Drzwi są uzbrojone: drążek zjeżdżalni tkwi w uchwytach w podłodze, kontrolka SLIDE ARMED świeci.' },
    { title: 'Ocena i otwarcie', color: '#f59e0b', dur: 3.5, text: 'Członek załogi patrzy przez okienko, czy na zewnątrz nie ma ognia ani wody, i sprawdza lampkę, która ostrzega przed ciśnieniem w kabinie. Potem jednym ruchem podnosi dźwignię.' },
    { title: 'Siłownik awaryjny', color: '#facc15', dur: 2.5, text: 'W uzbrojonych drzwiach otwieranie wspomaga siłownik napędzany gazem z butli. Drzwi otwierają się same w ok. 2 sekundy – nawet gdy samolot stoi przechylony albo wieje silny wiatr.' },
    { title: 'Pakiet wypada', color: '#fb923c', dur: 2.5, text: 'Drążek trzyma się podłogi, więc otwierające się drzwi wyciągają pakiet zjeżdżalni z pojemnika. Pakiet spada wzdłuż kadłuba, a linka uruchamia napełnianie.' },
    { title: 'Napełnianie', color: '#38bdf8', dur: 6, text: 'Butla ze sprężonym gazem napełnia zjeżdżalnię, a specjalne dysze zasysają przy tym mnóstwo powietrza z otoczenia. Zjeżdżalnia jest gotowa w ok. 6 sekund. Zapalają się światła wzdłuż jej brzegów.' },
    { title: 'Gotowa do ewakuacji', color: '#22c55e', dur: 6, text: 'Pasażerowie wskakują na zjeżdżalnię bez zatrzymywania się, z rękami skrzyżowanymi na piersi, bez bagażu i bez butów na obcasie, które mogłyby ją przebić. Zjeżdżalnia ma dwa tory. Na wodzie można ją odczepić i użyć jako tratwy.' },
  ],
  evac: [
    { title: 'Polecenie ewakuacji', color: '#ef4444', dur: 3, text: 'Kapitan ogłasza ewakuację i włącza alarm. Załoga ocenia każde wyjście – drzwi po stronie ognia zostają zamknięte.' },
    { title: 'Otwarcie wyjść', color: '#f59e0b', dur: 3, text: 'Uzbrojone drzwi otwierają się z pomocą siłowników, każde w ok. 2 sekundy.' },
    { title: 'Zjeżdżalnie', color: '#38bdf8', dur: 6, text: 'Osiem zjeżdżalni napełnia się jednocześnie, w ok. 6 sekund.' },
    { title: 'Ewakuacja', color: '#22c55e', dur: 16, text: 'Przez każde drzwi może wyjść ok. 110 osób. Personel pokładowy ponagla: „Zostawić bagaż! Skakać!”.' },
    { title: '90 sekund', color: '#a78bfa', dur: 6, text: 'Zanim samolot dostanie dopuszczenie do lotów, producent musi pokazać w próbie, że komplet pasażerów (w A350-1000 do ok. 440 osób) opuści samolot w 90 sekund. Wolno użyć tylko połowy wyjść, w ciemności, z bagażami porozrzucanymi w przejściach.' },
  ],
  press: [
    { title: 'Ciśnienie w kabinie', color: '#ef4444', dur: 5, text: 'Na wysokości przelotu powietrze w kabinie ma o ok. 0,6 bara większe ciśnienie niż na zewnątrz. Na drzwi o powierzchni ok. 2 m² daje to siłę ok. 12 ton – tyle ważą trzy duże samochody – która dociska je od środka do ramy.' },
    { title: 'Ograniczniki przenoszą siłę', color: '#f59e0b', dur: 5, text: 'Drzwi są większe od otworu w miejscach ograniczników. Siła z drzwi przechodzi przez ich ograniczniki na ograniczniki ramy i dalej na szkielet kadłuba. Im większe ciśnienie, tym mocniej drzwi siedzą w otworze.' },
    { title: 'Dlaczego nie da się ich otworzyć', color: '#22c55e', dur: 6, text: 'Żeby otworzyć drzwi, trzeba je najpierw unieść i lekko wepchnąć do środka – wbrew sile kilkunastu ton. Żaden człowiek tego nie zrobi. Dodatkowo w locie mechanizm blokuje specjalny zamek, który zwalnia się dopiero na ziemi.' },
  ],
};
const total = (m: Exclude<DoorMode, 'home'>) => DOOR_STAGES[m].reduce((a, s) => a + s.dur, 0);
export function doorStageAt(mode: DoorMode, t: number) {
  if (mode === 'home' || t < 0) return -1;
  const st = DOOR_STAGES[mode];
  let a = 0;
  for (let i = 0; i < st.length; i++) {
    if (t < a + st[i].dur) return i;
    a += st[i].dur;
  }
  return st.length;
}
const stStart = (mode: Exclude<DoorMode, 'home'>, i: number) => DOOR_STAGES[mode].slice(0, i).reduce((a, s) => a + s.dur, 0);
/** Postęp w etapie i trybu (0…1). */
const inStage = (mode: Exclude<DoorMode, 'home'>, t: number, i: number) => clamp01((t - stStart(mode, i)) / DOOR_STAGES[mode][i].dur);

/** Stan drzwi i (0–3), burta side (1 – L, −1 – R) w trybie mode w chwili t (−1 – przed „Rozpocznij”). */
export function doorState(mode: DoorMode, t: number, i: number, side: number): DS {
  const L2 = i === 1 && side > 0;
  if (mode === 'home') return side > 0 ? { ...CLOSED, u: 1 } : CLOSED;
  if (mode === 'press') return CLOSED;
  if (mode === 'open') {
    if (!L2 || t < 0) return CLOSED;
    const handle = sm(inStage('open', t, 1));
    const u = 0.12 * sm(inStage('open', t, 2)) + 0.12 * sm(inStage('open', t, 3)) + 0.76 * sm(inStage('open', t, 4));
    return { ...CLOSED, u, handle };
  }
  if (mode === 'arm') {
    if (!L2) return CLOSED;
    if (t < 0) return CLOSED;
    const on = sm(inStage('arm', t, 1)) * (1 - sm(inStage('arm', t, 4)));
    const girt = sm(inStage('arm', t, 2)) * (1 - sm(inStage('arm', t, 4)));
    return { ...CLOSED, lever: on, girt, ind: girt > 0.95 };
  }
  if (mode === 'slide') {
    if (!L2) return CLOSED;
    const armed = { ...CLOSED, lever: 1, girt: 1, ind: true };
    if (t < 0) return armed;
    const s1 = stStart('slide', 1);
    const s2 = stStart('slide', 2);
    const s3 = stStart('slide', 3);
    const s4 = stStart('slide', 4);
    const handle = sm((t - s1 - 1.5) / 1.2);
    const u = sm((t - s2) / 1.8);
    const k = t < s3 ? 0 : t < s4 ? 0.12 * sm((t - s3) / 2.5) : 0.12 + 0.88 * sm((t - s4) / 6);
    return { ...armed, handle, u, k, press: t > s1 && t < s1 + 1.4, actuator: t > s2 && t < s2 + 2.5, ind: t < s2 + 0.5 };
  }
  // evac: wszystkie drzwi uzbrojone, otwierają się kolejno (od przodu), zjeżdżalnie razem
  const armed = { ...CLOSED, lever: 1, girt: 1, ind: true };
  if (t < 0) return armed;
  const s1 = stStart('evac', 1) + i * 0.35 + (side < 0 ? 0.2 : 0);
  const s2 = stStart('evac', 2) + i * 0.25;
  const u = sm((t - s1) / 1.8);
  const k = t < s1 + 1 ? 0 : t < s2 ? 0.12 * sm((t - s1 - 1) / 1.5) : 0.12 + 0.88 * sm((t - s2) / 5);
  return { ...armed, handle: sm((t - s1 + 0.6) / 0.6), u, k, ind: u < 0.2, actuator: u > 0 && u < 1 };
}

/* ============================== napisy ============================== */

const texCache = new Map<string, THREE.CanvasTexture>();
/** Tekstura tabliczki: linie tekstu, kolory, obramowanie; rozmiar w px (proporcje jak tabliczka). */
function placardTex(key: string, lines: string[], o: { w: number; h: number; bg: string; fg: string; border?: string; font?: number; bold?: boolean; arrow?: boolean }) {
  const c0 = texCache.get(key);
  if (c0) return c0;
  const c = document.createElement('canvas');
  c.width = o.w;
  c.height = o.h;
  const x = c.getContext('2d')!;
  x.fillStyle = o.bg;
  x.fillRect(0, 0, o.w, o.h);
  if (o.border) {
    x.strokeStyle = o.border;
    x.lineWidth = Math.max(4, o.h * 0.06);
    x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, o.w - x.lineWidth, o.h - x.lineWidth);
  }
  x.fillStyle = o.fg;
  const fs = o.font ?? Math.floor((o.h * 0.7) / lines.length);
  x.font = `${o.bold === false ? '' : 'bold '}${fs}px sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, o.w / 2 + (o.arrow ? o.w * 0.12 : 0), (o.h * (i + 0.5)) / lines.length));
  if (o.arrow) {
    // strzałka w górę po lewej (kierunek ruchu dźwigni)
    x.beginPath();
    const ax = o.w * 0.14;
    x.moveTo(ax, o.h * 0.12);
    x.lineTo(ax - o.h * 0.25, o.h * 0.5);
    x.lineTo(ax - o.h * 0.09, o.h * 0.5);
    x.lineTo(ax - o.h * 0.09, o.h * 0.88);
    x.lineTo(ax + o.h * 0.09, o.h * 0.88);
    x.lineTo(ax + o.h * 0.09, o.h * 0.5);
    x.lineTo(ax + o.h * 0.25, o.h * 0.5);
    x.closePath();
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Tabliczka na poszyciu albo wykładzinie (wymiary w m); flip – na prawej burcie (lustro), żeby tekst się nie odwracał. */
function Placard({ x, y, off, out, w, h, tex, flip, emissive }: { x: number; y: number; off: number; out: boolean; w: number; h: number; tex: THREE.Texture; flip: boolean; emissive?: number }) {
  const f = useMemo(() => onSkin(x, y, off, out), [x, y, off, out]);
  return (
    <mesh position={f.p} quaternion={f.q} scale={[flip ? -1 : 1, 1, 1]} raycast={() => null}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.5} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={emissive ?? 0.12} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ============================== drzwi ============================== */

const WIN_DY = 0.2; // okienko drzwi (jak okna kabiny)
const PAINT = '#eef1f4';
const LINING = '#e8e3d8';

/** Jedne drzwi (lewa burta – dla prawej rodzic odbija z); stan czytany co klatkę. */
function PaxDoor({ i, side, getState }: { i: number; side: number; getState: () => DS }) {
  const xd = PAX_DOOR.xs[i];
  const name = `${i + 1}${side > 0 ? 'L' : 'R'}`;
  const flip = side < 0;
  const g = useMemo(() => doorGeometry(xd), [xd]);
  useEffect(
    () => () => {
      g.outer.dispose();
      g.inner.dispose();
      g.edge.dispose();
      g.seal.dispose();
    },
    [g],
  );
  const door = useRef<THREE.Group>(null);
  const handle = useRef<THREE.Group>(null);
  const lever = useRef<THREE.Group>(null);
  const girt = useRef<THREE.Mesh>(null);
  const ind = useRef<THREE.MeshStandardMaterial>(null);
  const pl = useRef<THREE.MeshStandardMaterial>(null);
  const arm = useRef<THREE.Mesh>(null);
  const act = useRef<THREE.Mesh>(null);
  const bustle = useRef<THREE.Group>(null);
  const hingeF: V3 = useMemo(() => P(xd - PAX_DOOR.hw - 0.02, FLOOR + 1.0, 0.05), [xd]);
  const doorEdge: V3 = useMemo(() => P(xd - HW + 0.06, FLOOR + 1.0, 0.1), [xd]);
  const actF: V3 = useMemo(() => P(xd - PAX_DOOR.hw - 0.05, FLOOR + 0.55, 0.12), [xd]);
  const actD: V3 = useMemo(() => P(xd - HW + 0.1, FLOOR + 0.7, 0.12), [xd]);
  const handleF = useMemo(() => onSkin(xd + 0.3, FLOOR + 1.05, DOOR_T + 0.04, false), [xd]);
  const leverF = useMemo(() => onSkin(xd - 0.33, FLOOR + 0.62, DOOR_T + 0.03, false), [xd]);
  const girtF = useMemo(() => onSkin(xd, YB + 0.1, DOOR_T + 0.2, false), [xd]);
  const bustleF = useMemo(() => onSkin(xd, YB + 0.25, DOOR_T + 0.1, false), [xd]);
  const winO = useMemo(() => onSkin(xd, WIN_DY, -0.014, true), [xd]);
  const winI = useMemo(() => onSkin(xd, WIN_DY, DOOR_T + 0.005, false), [xd]);
  const flapF = useMemo(() => onSkin(xd + 0.24, FLOOR + 1.0, -0.016, true), [xd]);
  const assistF = useMemo(() => onSkin(xd, FLOOR + 1.32, DOOR_T + 0.06, false), [xd]);
  useFrame(({ clock }) => {
    const s = getState();
    const o = doorOffset(s.u);
    if (door.current) door.current.position.set(...o.off);
    if (handle.current) handle.current.rotation.x = -1.2 * s.handle;
    if (lever.current) lever.current.rotation.z = (s.lever - 0.5) * 1.3;
    // drążek: w pojemniku (0) albo w uchwytach podłogi (1) – zostaje przy podłodze, gdy drzwi się otwierają
    if (girt.current) {
      girt.current.visible = s.girt < 0.98 || s.u < 0.02;
      girt.current.position.y = -0.09 * s.girt;
    }
    if (bustle.current) bustle.current.visible = s.k < 0.05;
    if (ind.current) ind.current.emissiveIntensity = s.ind ? 1.6 : 0.05;
    if (pl.current) pl.current.emissiveIntensity = s.press ? (Math.sin(clock.elapsedTime * 10) > 0 ? 2 : 0.1) : 0.05;
    if (arm.current) {
      const R = PAX_DOOR.hw;
      const tip: V3 = [doorEdge[0] + o.off[0], doorEdge[1] + o.off[1], doorEdge[2] + o.off[2]];
      arm.current.visible = s.u > 0.15;
      placeBetween(arm.current, [hingeF[0] + 0.02, hingeF[1], hingeF[2] + o.push], tip);
      void R;
    }
    if (act.current) {
      act.current.visible = s.actuator || (s.u > 0.02 && s.lever > 0.5);
      placeBetween(act.current, actF, [actD[0] + o.off[0], actD[1] + o.off[1], actD[2] + o.off[2]]);
    }
  });
  const T = (k: string, lines: string[], o: Parameters<typeof placardTex>[2]) => placardTex(k, lines, o);
  return (
    <group>
      <group ref={door}>
        <mesh geometry={g.outer}>
          <meshStandardMaterial color={PAINT} roughness={0.32} metalness={0.05} side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={g.edge}>
          <meshStandardMaterial color="#b9c0c8" roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={g.seal}>
          <meshStandardMaterial color="#1f2329" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={g.inner}>
          <meshStandardMaterial color={LINING} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
        {/* okienko: szyba zewnętrzna z uszczelką i ramka od środka */}
        <mesh position={winO.p} quaternion={winO.q}>
          <circleGeometry args={[0.12, 28]} />
          <meshStandardMaterial color="#2a3a4c" metalness={0.55} roughness={0.05} />
        </mesh>
        <mesh position={winO.p} quaternion={winO.q}>
          <ringGeometry args={[0.12, 0.145, 28]} />
          <meshStandardMaterial color="#30363e" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={winI.p} quaternion={winI.q}>
          <ringGeometry args={[0.11, 0.17, 28]} />
          <meshStandardMaterial color="#d6d0c2" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={winI.p} quaternion={winI.q}>
          <circleGeometry args={[0.11, 28]} />
          <meshStandardMaterial color="#cfe6fb" emissive="#6aa2d8" emissiveIntensity={0.25} transparent opacity={0.6} />
        </mesh>
        {/* na zewnątrz: klapka klamki w czerwonej ramce z instrukcją */}
        <mesh position={flapF.p} quaternion={flapF.q}>
          <planeGeometry args={[0.3, 0.12]} />
          <meshStandardMaterial color="#20252b" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
        <Placard x={xd + 0.24} y={FLOOR + 1.16} off={-0.016} out w={0.34} h={0.09} flip={flip} tex={T('ext-open', ['PUSH FLAP – PULL HANDLE UP'], { w: 512, h: 128, bg: '#ffffff', fg: '#c81e1e', border: '#c81e1e', font: 40 })} />
        <Placard x={xd} y={FLOOR + 1.66} off={-0.016} out w={0.5} h={0.1} flip={flip} tex={T('ext-exit', ['EMERGENCY EXIT'], { w: 512, h: 96, bg: '#ffffff', fg: '#c81e1e', font: 58 })} />
        <Placard x={xd - 0.3} y={FLOOR + 0.25} off={-0.016} out w={0.26} h={0.14} flip={flip} tex={T('ext-danger', ['DANGER', 'ESCAPE SLIDE'], { w: 256, h: 136, bg: '#ffffff', fg: '#111827', border: '#c81e1e', font: 34 })} />
        {/* od środka: dźwignia otwierania (na osi przy wykładzinie, podnosi się do góry) */}
        <group position={handleF.p} quaternion={handleF.q}>
          <group ref={handle}>
            <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.06, 12]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0, -0.18, 0.06]}>
              <boxGeometry args={[0.05, 0.38, 0.035]} />
              <meshStandardMaterial color="#9aa3ad" metalness={0.5} roughness={0.35} />
            </mesh>
            <mesh position={[0, -0.36, 0.07]}>
              <boxGeometry args={[0.09, 0.08, 0.05]} />
              <meshStandardMaterial color="#c81e1e" roughness={0.5} />
            </mesh>
          </group>
        </group>
        <Placard x={xd + 0.3} y={FLOOR + 1.22} off={DOOR_T + 0.006} out={false} w={0.2} h={0.1} flip={flip} tex={T('int-open', ['OPEN'], { w: 256, h: 128, bg: '#ffffff', fg: '#c81e1e', border: '#c81e1e', font: 56, arrow: true })} />
        {/* dźwignia uzbrajania z tabliczką ARMED / DISARMED */}
        <Placard x={xd - 0.33} y={FLOOR + 0.62} off={DOOR_T + 0.006} out={false} w={0.24} h={0.18} flip={flip} tex={T('int-arm', ['ARMED', 'DISARMED'], { w: 256, h: 192, bg: '#f8fafc', fg: '#111827', border: '#334155', font: 40 })} />
        <group position={leverF.p} quaternion={leverF.q}>
          <group ref={lever}>
            <mesh position={[0, 0.08, 0.03]}>
              <boxGeometry args={[0.03, 0.16, 0.03]} />
              <meshStandardMaterial color="#c81e1e" roughness={0.5} />
            </mesh>
          </group>
        </group>
        {/* kontrolka SLIDE ARMED pod okienkiem i lampka ciśnienia w kabinie obok */}
        <mesh position={onSkin(xd - 0.05, WIN_DY - 0.24, DOOR_T + 0.008, false).p} quaternion={onSkin(xd - 0.05, WIN_DY - 0.24, DOOR_T + 0.008, false).q} scale={[flip ? -1 : 1, 1, 1]}>
          <planeGeometry args={[0.18, 0.06]} />
          <meshStandardMaterial ref={ind} map={T('int-ind', ['SLIDE ARMED'], { w: 256, h: 80, bg: '#2a0606', fg: '#ff4040', font: 40 })} emissive="#ffffff" emissiveMap={T('int-ind', ['SLIDE ARMED'], { w: 256, h: 80, bg: '#2a0606', fg: '#ff4040', font: 40 })} emissiveIntensity={0.05} />
        </mesh>
        <mesh position={onSkin(xd + 0.12, WIN_DY - 0.24, DOOR_T + 0.008, false).p} quaternion={onSkin(xd + 0.12, WIN_DY - 0.24, DOOR_T + 0.008, false).q}>
          <circleGeometry args={[0.025, 16]} />
          <meshStandardMaterial ref={pl} color="#5a0a0a" emissive="#ff2020" emissiveIntensity={0.05} />
        </mesh>
        <Placard x={xd + 0.12} y={WIN_DY - 0.3} off={DOOR_T + 0.006} out={false} w={0.12} h={0.04} flip={flip} tex={T('int-cp', ['CABIN PRESSURE'], { w: 256, h: 64, bg: '#e8e3d8', fg: '#111827', font: 26 })} />
        <Placard x={xd} y={FLOOR + 1.78} off={DOOR_T + 0.006} out={false} w={0.26} h={0.08} flip={flip} tex={T(`int-door-${name}`, [`DOOR ${name}`], { w: 256, h: 80, bg: '#e8e3d8', fg: '#111827', font: 44 })} />
        {/* uchwyt pomocniczy na drzwiach */}
        <group position={assistF.p} quaternion={assistF.q}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.016, 0.016, 0.42, 10]} />
            <meshStandardMaterial color="#9aa3ad" metalness={0.6} roughness={0.3} />
          </mesh>
          {[-0.19, 0.19].map((dx) => (
            <mesh key={dx} position={[dx, 0, -0.03]}>
              <boxGeometry args={[0.03, 0.03, 0.06]} />
              <meshStandardMaterial color="#9aa3ad" metalness={0.6} roughness={0.3} />
            </mesh>
          ))}
        </group>
        {/* pojemnik zjeżdżalni na dole drzwi (z napisem) – znika, gdy pakiet wypadnie */}
        <group ref={bustle}>
          <group position={bustleF.p} quaternion={bustleF.q}>
            <mesh position={[0, 0, 0.0]}>
              <boxGeometry args={[0.92, 0.38, 0.2]} />
              <meshStandardMaterial color="#cfd4da" roughness={0.55} />
            </mesh>
            <mesh position={[0, 0.02, 0.101]} scale={[flip ? -1 : 1, 1, 1]}>
              <planeGeometry args={[0.6, 0.16]} />
              <meshStandardMaterial map={T('int-slide', ['ESCAPE SLIDE', 'EMERGENCY USE ONLY'], { w: 512, h: 136, bg: '#cfd4da', fg: '#111827', font: 40 })} />
            </mesh>
          </group>
        </group>
        <group position={girtF.p} quaternion={girtF.q}>
          <mesh ref={girt} position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.018, 0.018, 0.96, 10]} />
            <meshStandardMaterial color="#d1d5db" metalness={0.7} roughness={0.25} />
          </mesh>
        </group>
        {/* stopery na krawędziach drzwi (po 6 z przodu i z tyłu) */}
        {[-1, 1].flatMap((sx) =>
          [0.2, 0.5, 0.8, 1.1, 1.4, 1.7].map((dy) => {
            const f = onSkin(xd + sx * (HW + 0.005), YB + dy, DOOR_T * 0.6, false);
            return (
              <mesh key={`${sx}${dy}`} position={f.p} quaternion={f.q}>
                <boxGeometry args={[0.06, 0.07, 0.05]} />
                <meshStandardMaterial color="#8b939c" metalness={0.5} roughness={0.35} />
              </mesh>
            );
          }),
        )}
      </group>
      {/* rama: stopery ramy, uchwyty drążka w podłodze, uchwyt pomocniczy przy otworze, zawias ramienia */}
      {[-1, 1].flatMap((sx) =>
        [0.2, 0.5, 0.8, 1.1, 1.4, 1.7].map((dy) => {
          const f = onSkin(xd + sx * (PAX_DOOR.hw + 0.03), YB + dy, DOOR_T * 0.6 + 0.02, false);
          return (
            <mesh key={`f${sx}${dy}`} position={f.p} quaternion={f.q}>
              <boxGeometry args={[0.06, 0.07, 0.05]} />
              <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.35} />
            </mesh>
          );
        }),
      )}
      {[-0.38, 0.38].map((dx) => {
        const f = onSkin(xd + dx, FLOOR + 0.03, DOOR_T + 0.22, false);
        return (
          <mesh key={`b${dx}`} position={f.p} quaternion={f.q}>
            <boxGeometry args={[0.08, 0.05, 0.08]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} />
          </mesh>
        );
      })}
      <mesh position={P(xd + PAX_DOOR.hw + 0.12, FLOOR + 1.1, 0.32)}>
        <cylinderGeometry args={[0.018, 0.018, 0.9, 10]} />
        <meshStandardMaterial color="#9aa3ad" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={hingeF}>
        <boxGeometry args={[0.1, 0.3, 0.12]} />
        <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.35} />
      </mesh>
      {/* ramię zawiasu i siłownik awaryjny (ustawiane co klatkę między ramą a drzwiami) */}
      <mesh ref={arm} visible={false}>
        <cylinderGeometry args={[0.05, 0.05, 1, 12]} />
        <meshStandardMaterial color="#9aa3ad" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh ref={act} visible={false}>
        <cylinderGeometry args={[0.03, 0.03, 1, 10]} />
        <meshStandardMaterial color="#e8b10e" metalness={0.4} roughness={0.35} />
      </mesh>
    </group>
  );
}

/* ============================== zjeżdżalnia ============================== */

const SILL_Y = FLOOR + 0.02;
const SLIDE_RUN = 7.6; // poziomy zasięg od progu do końca na płycie
/** Zjeżdżalnia przy drzwiach xd (lewa burta): pakiet spada wzdłuż burty i rozwija się do pochyłej rynny na płytę. */
function Slide({ xd, getK }: { xd: number; getK: () => number }) {
  const sill = useMemo(() => P(xd, SILL_Y, -0.02), [xd]);
  const drop = sill[1] - (G + 0.35);
  const L = Math.hypot(drop, SLIDE_RUN);
  const a0 = Math.atan2(drop, SLIDE_RUN);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const lightMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#ffe9a8', emissiveIntensity: 0 }), []);
  useEffect(() => () => lightMat.dispose(), [lightMat]);
  const pack = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const k = getK();
    if (root.current) root.current.visible = k > 0.001;
    // kąt: od zwisu wzdłuż burty do pochylenia rynny; długość i grubość rosną z napełnianiem
    const e = sm(k * 1.15);
    // obrót +θ wokół x kieruje lokalne +z w dół: π/2 – zwis wzdłuż burty, a0 – pochylenie rynny
    if (root.current) root.current.rotation.x = (Math.PI / 2) * (1 - e) + a0 * e;
    if (body.current) body.current.scale.set(0.35 + 0.65 * sm(k * 1.4), 0.25 + 0.75 * e, 0.12 + 0.88 * e);
    if (pack.current) pack.current.visible = k < 0.25;
    lightMat.emissiveIntensity = k > 0.9 ? 1.2 + 0.3 * Math.sin(clock.elapsedTime * 6) : 0;
  });
  const yel = '#e9c63e';
  const grey = '#b7bcc2';
  const lightPos = useMemo(() => Array.from({ length: 7 }, (_, j) => 0.6 + (j * (L - 1.0)) / 6), [L]);
  return (
    <group position={sill}>
      {/* obrót wokół osi wzdłuż progu (x): lokalnie rynna biegnie w +z (na zewnątrz) */}
      <group ref={root} visible={false}>
        <mesh ref={pack} position={[0, -0.25, 0.25]}>
          <boxGeometry args={[0.8, 0.4, 0.35]} />
          <meshStandardMaterial color={grey} roughness={0.6} />
        </mesh>
        <group ref={body}>
          {/* rękawy boczne, rynna (dwa tory), rękaw u góry i na końcu, podpory pod spodem, światła wzdłuż krawędzi */}
          {[-0.78, 0.78].map((x) => (
            <mesh key={x} position={[x, 0.22, L / 2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.22, 0.22, L, 20]} />
              <meshStandardMaterial color={yel} roughness={0.45} />
            </mesh>
          ))}
          <mesh position={[0, 0.03, L / 2]}>
            <boxGeometry args={[1.36, 0.05, L]} />
            <meshStandardMaterial color={grey} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.06, L / 2]}>
            <boxGeometry args={[0.04, 0.03, L - 0.4]} />
            <meshStandardMaterial color={yel} roughness={0.5} />
          </mesh>
          {[0.15, L - 0.1].map((z) => (
            <mesh key={z} position={[0, 0.25, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.25, 0.25, 1.8, 20]} />
              <meshStandardMaterial color={yel} roughness={0.45} />
            </mesh>
          ))}
          {[0.4, 0.68].map((f) => (
            <mesh key={f} position={[0, -0.18, L * f]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.16, 0.16, 1.5, 16]} />
              <meshStandardMaterial color={yel} roughness={0.45} />
            </mesh>
          ))}
          {[-0.78, 0.78].flatMap((x) =>
            lightPos.map((z) => (
              <mesh key={`${x}${z}`} position={[x, 0.45, z]} material={lightMat}>
                <sphereGeometry args={[0.035, 8, 6]} />
              </mesh>
            )),
          )}
        </group>
      </group>
    </group>
  );
}


/* ============================== ludzie na zjeżdżalni ============================== */

const PEOPLE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#4b5563', '#ca8a04'];
/** Pasażerowie zjeżdżający po zjeżdżalni drzwi xd (lewa burta): od progu po rynnie, potem odbiegają od samolotu. */
function Evacuees({ xd, getT, start, n, gap }: { xd: number; getT: () => number; start: number; n: number; gap: number }) {
  const sill = useMemo(() => P(xd, SILL_Y, -0.02), [xd]);
  const toe: V3 = [sill[0], G + 0.35, sill[2] + SLIDE_RUN];
  const far: V3 = [sill[0] + 3, G, sill[2] + SLIDE_RUN + 9];
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const t = getT();
    refs.current.forEach((g, j) => {
      if (!g) return;
      const u = (t - start - j * gap) / 2.2;
      g.visible = u > 0 && u < 3;
      if (!g.visible) return;
      if (u < 1) {
        const e = u * u;
        g.position.set(sill[0] + (j % 2 ? 0.35 : -0.35), sill[1] + (toe[1] - sill[1]) * e + 0.35, sill[2] + (toe[2] - sill[2]) * e);
        g.rotation.set(-0.5, 0, 0);
      } else {
        const w = (u - 1) / 2;
        g.position.set(toe[0] + (far[0] - toe[0]) * w + (j % 2 ? 0.35 : -0.35), G + 0.85, toe[2] + (far[2] - toe[2]) * w);
        g.rotation.set(0, 0, 0);
      }
    });
  });
  return (
    <group>
      {Array.from({ length: n }, (_, j) => (
        <group key={j} ref={(el) => (refs.current[j] = el)} visible={false}>
          <mesh>
            <capsuleGeometry args={[0.17, 0.75, 4, 10]} />
            <meshStandardMaterial color={PEOPLE_COLORS[j % PEOPLE_COLORS.length]} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.66, 0]}>
            <sphereGeometry args={[0.12, 14, 10]} />
            <meshStandardMaterial color="#e0b48a" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ============================== ciśnienie na drzwiach ============================== */

function PressureArrows({ xd, getT }: { xd: number; getT: () => number }) {
  const pts = useMemo(() => {
    const out: { p: V3; q: THREE.Quaternion }[] = [];
    for (const dx of [-0.3, 0, 0.3]) for (const y of [FLOOR + 0.4, FLOOR + 0.9, FLOOR + 1.4]) out.push(onSkin(xd + dx, y, DOOR_T + 0.35, true));
    return out;
  }, [xd]);
  const grp = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = getT();
    const k = t < 0 ? 0.6 : sm(t / 2);
    grp.current.forEach((g) => g?.scale.setScalar(0.6 + 0.4 * k + 0.05 * Math.sin(clock.elapsedTime * 4)));
  });
  return (
    <group>
      {pts.map((f, j) => (
        <group key={j} position={f.p} quaternion={f.q}>
          <group ref={(el) => (grp.current[j] = el)}>
            <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.25, 8]} />
              <meshBasicMaterial color="#ef4444" depthTest={false} transparent opacity={0.9} />
            </mesh>
            <mesh position={[0, 0, 0.27]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.06, 0.12, 12]} />
              <meshBasicMaterial color="#ef4444" depthTest={false} transparent opacity={0.9} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/* ============================== podpisy (strona główna) ============================== */

export const DOOR_GROUPS = [
  { id: 'ext', name: 'z zewnątrz', color: '#7dd3fc' },
  { id: 'int', name: 'od środka', color: '#fde68a' },
  { id: 'slide', name: 'zjeżdżalnia', color: '#fb923c' },
  { id: 'mech', name: 'mechanizm i rama', color: '#a7f3d0' },
];
const XL2 = PAX_DOOR.xs[1];
const O1 = doorOffset(1).off;
/** Położenie na otwartych drzwiach L2 (strona główna). */
const onL2 = (x: number, y: number, off: number): V3 => {
  const p = P(XL2 + x, y, off);
  return [p[0] + O1[0], p[1] + O1[1], p[2] + O1[2]];
};
/**
 * Położenie na wewnętrznej stronie zamkniętych drzwi 2R (prawa burta) – przez otwarte drzwi 2L widać je na wprost,
 * więc tam stoją podpisy części od strony kabiny.
 */
const onR2 = (x: number, y: number, off: number): V3 => {
  const p = P(XL2 + x, y, off);
  return [p[0], p[1], -p[2]];
};
export const R2_IN = DOOR_T + 0.08;
export const DOOR_PART_INFO: Record<string, { name: string; group: string; pos: V3; sub?: boolean; desc: string }> = {
  door: { name: 'drzwi typu A', group: 'ext', pos: onL2(0, FLOOR + 1.9, -0.3), desc: 'Drzwi pasażerskie A350 to tzw. wyjście typu A – największe wyjście w samolotach pasażerskich. Otwór ma ok. 1,07 × 1,93 m i może przez niego uciec ok. 110 osób. Drzwi są wygięte jak kadłub i mają ok. 20 cm grubości: na zewnątrz poszycie z kompozytu, w środku szkielet i mechanizm, od strony kabiny – wykładzina.' },
  window: { name: 'okienko w drzwiach', group: 'ext', pos: onL2(0.25, WIN_DY + 0.12, -0.1), sub: true, desc: 'Przez okienko załoga przed otwarciem drzwi sprawdza, co jest na zewnątrz: ogień, dym, woda albo przeszkoda oznaczają, że tych drzwi nie wolno otworzyć.' },
  extHandle: { name: 'klamka zewnętrzna z instrukcją', group: 'ext', pos: onL2(0.3, FLOOR + 1.05, -0.12), sub: true, desc: 'Pod klapką w poszyciu jest klamka, którą można otworzyć drzwi z zewnątrz – np. strażacy. Otwarcie z zewnątrz zawsze rozbraja zjeżdżalnię, więc nie wystrzeli ona na ratowników.' },
  marking: { name: 'napisy EMERGENCY EXIT', group: 'ext', pos: onL2(-0.1, FLOOR + 1.66, -0.12), sub: true, desc: 'Czerwone napisy i instrukcje na poszyciu wymagają przepisy: ratownicy muszą od razu wiedzieć, gdzie jest wyjście i jak je otworzyć. Obok jest ostrzeżenie o zjeżdżalni (DANGER ESCAPE SLIDE – „uwaga, zjeżdżalnia ewakuacyjna”).' },
  handle: { name: 'dźwignia otwierania', group: 'int', pos: onR2(0.3, FLOOR + 0.8, R2_IN), desc: 'Duża dźwignia od strony kabiny. Podniesiona zwalnia zamki, unosi drzwi z ograniczników i pozwala je wypchnąć. W uzbrojonych drzwiach wystarczy jeden ruch dźwigni – resztę robi siłownik awaryjny.' },
  armLever: { name: 'dźwignia uzbrajania ARMED / DISARMED', group: 'int', pos: onR2(-0.33, FLOOR + 0.62, R2_IN), desc: 'Przełącza tryb zjeżdżalni. ARMED (uzbrojone) – drążek zjeżdżalni tkwi w uchwytach w podłodze, a otwarcie drzwi wyrzuca i napełnia zjeżdżalnię. DISARMED (rozbrojone) – zwykłe otwarcie, np. przy rękawie.' },
  indicator: { name: 'kontrolka SLIDE ARMED', group: 'int', pos: onR2(-0.05, WIN_DY - 0.24, R2_IN), sub: true, desc: 'Świeci na czerwono w okienku drzwi, gdy zjeżdżalnia jest uzbrojona. Widać ją z daleka, więc drugi członek załogi może sprawdzić drzwi po przeciwnej stronie.' },
  pressLight: { name: 'lampka ciśnienia w kabinie', group: 'int', pos: onR2(0.12, WIN_DY - 0.35, R2_IN), sub: true, desc: 'Miga na czerwono, gdy silniki są wyłączone, a w kabinie wciąż jest nadciśnienie. Otwarcie drzwi mogłoby je wtedy gwałtownie wyrwać – razem z osobą, która trzyma dźwignię.' },
  assist: { name: 'uchwyty pomocnicze', group: 'int', pos: onR2(0, FLOOR + 1.36, R2_IN), sub: true, desc: 'Uchwyt na drzwiach i drugi na ramie otworu. Członek załogi trzyma się ich przy otwieraniu i w czasie ewakuacji, żeby tłum nie wypchnął go na zjeżdżalnię.' },
  doorPlacard: { name: 'tabliczka DOOR 2R', group: 'int', pos: onR2(0, FLOOR + 1.8, R2_IN), sub: true, desc: 'Drzwi są numerowane od przodu: 1L…4L po lewej (L – left, lewe) i 1R…4R po prawej (R – right, prawe). Tak nazywa je załoga i tak są oznaczone na ekranie drzwi w kokpicie.' },
  bustle: { name: 'pojemnik zjeżdżalni', group: 'slide', pos: onR2(0, YB + 0.3, R2_IN + 0.15), desc: 'Na dole drzwi, od strony kabiny, jest pojemnik z ciasno złożoną zjeżdżalnią i butlą z gazem do jej napełnienia. Zjeżdżalnia A350 ma dwa tory i na wodzie może służyć jako tratwa.' },
  girt: { name: 'drążek zjeżdżalni (girt bar)', group: 'slide', pos: onR2(0.42, YB + 0.1, R2_IN + 0.15), sub: true, desc: 'Metalowy drążek przy dolnej krawędzi zjeżdżalni. W uzbrojonych drzwiach tkwi w uchwytach w podłodze – to on przytrzymuje zjeżdżalnię przy kadłubie, gdy drzwi się otwierają, więc drzwi wyciągają ją na zewnątrz.' },
  floorBrackets: { name: 'uchwyty w podłodze', group: 'slide', pos: onR2(0.38, FLOOR + 0.05, R2_IN + 0.2), sub: true, desc: 'Dwa zaczepy przy progu, w które wchodzi drążek zjeżdżalni po przestawieniu dźwigni na ARMED.' },
  stops: { name: 'ograniczniki (stopery)', group: 'mech', pos: [XL2 + PAX_DOOR.hw + 0.05, FLOOR + 1.4, P(XL2 + 0.6, FLOOR + 1.4, 0.15)[2]], desc: 'Kilkanaście par metalowych występów na krawędziach drzwi i ramy. Zamknięte drzwi opierają się o nie od środka, a ciśnienie w kabinie dociska je do ramy – jak korek w butelce.' },
  seal: { name: 'uszczelka', group: 'mech', pos: [XL2 - PAX_DOOR.hw, FLOOR + 1.85, P(XL2, FLOOR + 1.85, 0)[2] + 0.1], sub: true, desc: 'Gumowa uszczelka na obwodzie drzwi. Ciśnienie w kabinie dociska ją do ramy, więc w locie uszczelnia się sama.' },
  arm: { name: 'ramię zawiasu', group: 'mech', pos: [XL2 - PAX_DOOR.hw - 0.3, FLOOR + 1.25, P(XL2, FLOOR + 1.0, 0)[2] + 0.45], desc: 'Drzwi nie wiszą na zwykłych zawiasach. Ramię z mechanizmem prowadzi je na zewnątrz i do przodu, trzymając przez cały czas równolegle do boku kadłuba. Blokada na ramieniu trzyma otwarte drzwi, żeby wiatr ich nie zamknął.' },
  frame: { name: 'rama otworu', group: 'mech', pos: [XL2 + PAX_DOOR.hw + 0.05, FLOOR + 0.25, P(XL2, FLOOR + 0.25, 0)[2] + 0.1], sub: true, desc: 'Otwór w kadłubie osłabia go, więc wokół drzwi jest mocna rama: grubsze pierścienie szkieletu z przodu i z tyłu oraz belki nad i pod drzwiami. Przenosi obciążenia, które bez otworu przenosiłoby poszycie.' },
};
function DoorLabels({ sel, onSelect }: { sel: string | null; onSelect: (id: string | null) => void }) {
  const col = (g: string) => DOOR_GROUPS.find((x) => x.id === g)?.color ?? '#e2e8f0';
  return (
    <>
      {Object.entries(DOOR_PART_INFO).map(([id, p]) => {
        const on = sel === id;
        return (
          <Lbl key={id} pos={p.pos} sub={p.sub} color={on ? '#ffffff' : col(p.group)} active={on} onClick={() => onSelect(on ? null : id)}>
            {p.name}
          </Lbl>
        );
      })}
    </>
  );
}

/* ============================== kamera, zegar, scena ============================== */

const sk = (x: number, y: number) => P(x, y, 0);
const L2s = sk(XL2, FLOOR + 1);
const VIEWS: Record<Exclude<DoorMode, 'home'>, { cam: V3; tgt: V3 }[]> = {
  open: [
    { cam: [XL2 + 4.2, FLOOR + 1.6, L2s[2] + 5.2], tgt: [XL2 - 0.4, FLOOR + 0.9, L2s[2]] },
    { cam: [XL2 + 0.3, FLOOR + 1.4, -0.1], tgt: [XL2 + 0.1, FLOOR + 0.9, L2s[2]] },
    { cam: [XL2 + 3.6, FLOOR + 1.2, L2s[2] + 4.2], tgt: [XL2, FLOOR + 0.9, L2s[2]] },
    { cam: [XL2 + 3.2, FLOOR + 3.4, L2s[2] + 4.4], tgt: [XL2 - 0.3, FLOOR + 0.9, L2s[2] + 0.3] },
    { cam: [XL2 + 3.0, FLOOR + 4.5, L2s[2] + 5.6], tgt: [XL2 - 0.8, FLOOR + 0.9, L2s[2] + 0.4] },
    { cam: [XL2 - 4.6, FLOOR + 1.6, L2s[2] + 4.6], tgt: [XL2 - 0.8, FLOOR + 1.0, L2s[2] + 0.3] },
    { cam: [XL2 + 6, FLOOR + 2.5, L2s[2] + 8], tgt: [XL2 - 0.5, FLOOR + 0.9, L2s[2]] },
  ],
  arm: Array.from({ length: 6 }, (_, j) => ({ cam: [XL2 + 0.3, FLOOR + 1.45, -0.1] as V3, tgt: [XL2 - 0.15, FLOOR + (j === 3 ? 1.1 : 0.55), L2s[2]] as V3 })),
  slide: [
    { cam: [XL2 + 0.3, FLOOR + 1.45, -0.1], tgt: [XL2 - 0.1, FLOOR + 0.6, L2s[2]] },
    { cam: [XL2 + 0.3, FLOOR + 1.5, -0.1], tgt: [XL2, FLOOR + 1.0, L2s[2]] },
    { cam: [XL2 + 7, FLOOR + 1.2, L2s[2] + 9], tgt: [XL2, FLOOR + 0.2, L2s[2] + 1] },
    { cam: [XL2 + 8, FLOOR - 0.5, L2s[2] + 11], tgt: [XL2, FLOOR - 1.5, L2s[2] + 2] },
    { cam: [XL2 + 11, FLOOR + 0.5, L2s[2] + 13], tgt: [XL2, G + 2, L2s[2] + 4] },
    { cam: [XL2 + 12, G + 3, L2s[2] + 15], tgt: [XL2, G + 1.5, L2s[2] + 4] },
    { cam: [XL2 + 14, G + 5, L2s[2] + 17], tgt: [XL2, G + 1.5, L2s[2] + 4] },
  ],
  evac: [
    { cam: [-6, 30, 40], tgt: [-4, G, 6] },
    { cam: [-6, 30, 40], tgt: [-4, G, 6] },
    { cam: [-6, 24, 36], tgt: [-4, G, 6] },
    { cam: [-30, 14, 34], tgt: [-6, G, 8] },
    { cam: [-6, 34, 46], tgt: [-4, G, 4] },
    { cam: [-6, 34, 46], tgt: [-4, G, 4] },
  ],
  press: [
    { cam: [XL2 + 0.3, FLOOR + 1.35, -0.1], tgt: [XL2, FLOOR + 0.9, L2s[2]] },
    { cam: [XL2 - 0.3, FLOOR + 1.3, 0.2], tgt: [XL2 + 0.5, FLOOR + 0.9, L2s[2]] },
    { cam: [XL2 + 3.5, FLOOR + 1.6, L2s[2] + 4.5], tgt: [XL2, FLOOR + 0.9, L2s[2]] },
    { cam: [XL2 + 3.5, FLOOR + 1.6, L2s[2] + 4.5], tgt: [XL2, FLOOR + 0.9, L2s[2]] },
  ],
};

export function useDoorsDriver(mode: DoorMode | null, params: Params) {
  const st = useRef({ t: 0, key: '' });
  useFrame((_, dt) => {
    if (!mode) return;
    const run = Boolean(params.run);
    const key = `${mode}|${run}`;
    if (key !== st.current.key) Object.assign(st.current, { key, t: 0 });
    if (run && mode !== 'home') st.current.t = Math.min(total(mode) + 30, st.current.t + Math.min(0.05, dt));
  });
  const getT = () => (mode && mode !== 'home' && params.run ? st.current.t : -1);
  return { getT, getStage: () => (mode ? doorStageAt(mode, getT()) : -1), mode };
}

/** Wszystkie drzwi, zjeżdżalnie i ludzie w scenie (układ samolotu); stanowisko na płycie – na ziemi. */
export function DoorsScene({ sim, sel, onSelect }: { sim: ReturnType<typeof useDoorsDriver>; sel: string | null; onSelect: (id: string | null) => void }) {
  const mode = sim.mode!;
  const stage = useStage(sim.getStage);
  const view = mode === 'home' || stage < 0 ? null : VIEWS[mode][Math.min(stage, VIEWS[mode].length - 1)];
  const st = (i: number, side: number) => () => doorState(mode, sim.getT(), i, side);
  const ground = mode !== 'press';
  const evacStart = stStart('evac', 3);
  return (
    <group>
      {mode !== 'home' && <StageCamera view={view} />}
      {ground && <CargoStand />}
      {[1, -1].map((side) =>
        PAX_DOOR.xs.map((_, i) => (
          <group key={`${side}${i}`} scale={[1, 1, side]}>
            <PaxDoor i={i} side={side} getState={st(i, side)} />
            {(mode === 'slide' || mode === 'evac') && <Slide xd={PAX_DOOR.xs[i]} getK={() => st(i, side)().k} />}
            {mode === 'evac' && <Evacuees xd={PAX_DOOR.xs[i]} getT={sim.getT} start={evacStart - 1 + i * 0.3} n={10} gap={1.45} />}
          </group>
        )),
      )}
      {mode === 'slide' && <Evacuees xd={XL2} getT={sim.getT} start={stStart('slide', 5)} n={4} gap={1.3} />}
      {mode === 'press' && <PressureArrows xd={XL2} getT={sim.getT} />}
      {mode === 'home' && <DoorLabels sel={sel} onSelect={onSelect} />}
    </group>
  );
}

/* ============================== ECAM DOOR i ramka informacji ============================== */

/** Strona DOOR na ECAM: wszystkie drzwi z ich stanem w danej chwili (otwarte, uzbrojone), ładownie zamknięte. */
export function DoorEcam({ mode, t }: { mode: DoorMode; t: number }) {
  const all = [1, -1].flatMap((side) => [0, 1, 2, 3].map((i) => doorState(mode, t, i, side)));
  const flight = mode === 'press';
  return (
    <Ecam
      thrMode={flight ? ['CLB', 92] : null}
      n1={flight ? [85, 85] : [0, 0]}
      egt={flight ? [700, 702] : [30, 30]}
      page="DOOR"
      door={{ open: all.map((d) => d.u > 0.02), armed: all.map((d) => d.lever > 0.5), cargo: [false, false, false] }}
      footer={{ tat: flight ? -30 : 15, sat: flight ? -56 : 15, isa: 0, flt: flight ? '05:12' : '--:--', gw: 290000, gwcg: 29.5, fob: 72000 }}
      width={260}
    />
  );
}

/** Dla doku kokpitu: to ekran ECAM (stoi pod PFD i ND, nie wśród przełączników). */
(DoorEcam as unknown as { cockpitSlot: string }).cockpitSlot = 'ecam';

export function DoorsLab({ sim, sel }: { sim: ReturnType<typeof useDoorsDriver>; sel: string | null }) {
  const [, set] = useState(0);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 0.2) {
      acc.current = 0;
      set((k) => (k + 1) % 1e6);
    }
  });
  const mode = sim.mode!;
  if (mode === 'home') {
    const info = sel ? DOOR_PART_INFO[sel] : null;
    const g = info ? DOOR_GROUPS.find((x) => x.id === info.group) : undefined;
    return (
      <>
      <CockpitDock>
        <DoorEcam mode={mode} t={-1} />
      </CockpitDock>
      <InfoPortal>
        {info ? (
          <>
            <div style={{ fontWeight: 700, color: g?.color }}>{info.name}</div>
            {g && <div style={{ fontSize: 12, opacity: 0.7 }}>{g.name}</div>}
            <div>{info.desc}</div>
          </>
        ) : (
          <>
            <div>Drzwi po lewej stronie są otwarte (rozbrojone, jak przy wsiadaniu), po prawej – zamknięte. Kliknij podpis, aby przeczytać, do czego służy dana część: z zewnątrz i mechanizm – przy otwartych drzwiach 2L, od środka i zjeżdżalnia – na zamkniętych drzwiach 2R, widocznych na wprost przez otwór.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
              {DOOR_GROUPS.map((gr) => (
                <span key={gr.id} style={{ color: gr.color }}>
                  {gr.name}
                </span>
              ))}
            </div>
          </>
        )}
      </InfoPortal>
      </>
    );
  }
  const stages = DOOR_STAGES[mode];
  const s = sim.getStage();
  const t = sim.getT();
  const cur = s >= 0 && s < stages.length ? stages[s] : null;
  const L2 = doorState(mode, t, 1, 1);
  const rows: [string, string, string?][] =
    mode === 'evac'
      ? [
          ['czas od polecenia', t < 0 ? '–' : `${Math.max(0, Math.round(t * 3))} s (pokazowo przyspieszone)`],
          ['wyjścia', '8 × typ A (4 po każdej stronie)'],
          ['na wyjście', 'do ok. 110 osób'],
          ['limit certyfikacji', '90 s, połowa wyjść'],
        ]
      : mode === 'press'
        ? [
            ['różnica ciśnień', 'ok. 0,6 bar (8,6 psi)'],
            ['powierzchnia drzwi', 'ok. 2 m²'],
            ['siła na drzwi', 'ok. 120 kN – jak 12 t', '#ef4444'],
            ['blokada w locie', 'zamknięta', '#22c55e'],
          ]
        : [
            ['tryb zjeżdżalni', L2.lever > 0.5 ? 'ARMED' : 'DISARMED', L2.lever > 0.5 ? '#ef4444' : '#22c55e'],
            ['drążek zjeżdżalni', L2.girt > 0.5 ? 'w uchwytach podłogi' : 'w pojemniku'],
            ['drzwi', L2.u < 0.02 ? 'zamknięte' : L2.u > 0.98 ? 'otwarte, zablokowane' : 'w ruchu'],
            ...(mode === 'slide' ? [['zjeżdżalnia', L2.k < 0.01 ? 'w pojemniku' : L2.k > 0.98 ? 'napełniona, światła włączone' : `napełnianie ${Math.round(L2.k * 100)} %`] as [string, string]] : []),
          ];
  return (
    <>
    <CockpitDock>
      <DoorEcam mode={mode} t={t} />
    </CockpitDock>
    <InfoPortal>
      {cur ? (
        <>
          <div style={{ fontWeight: 700, color: cur.color }}>
            {s + 1}/{stages.length} · {cur.title}
          </div>
          <div style={{ fontSize: 13 }}>{cur.text}</div>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 700, color: '#7dd3fc' }}>{s < 0 ? 'Naciśnij „Rozpocznij”' : 'Koniec – możesz obrócić widok'}</div>
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px', fontSize: 13 }}>
        {rows.map(([a, b, c]) => (
          <span key={a} style={{ display: 'contents' }}>
            <span>{a}</span>
            <b style={{ color: c }}>{b}</b>
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 2, fontSize: 12 }}>
        {stages.map((a, i) => (
          <div key={a.title} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: s < 0 || i <= s ? 1 : 0.4, fontWeight: i === s ? 700 : 400 }}>
            <span style={{ width: 9, height: 9, borderRadius: 9, background: a.color, flex: 'none' }} />
            {i + 1}. {a.title}
          </div>
        ))}
      </div>
    </InfoPortal>
    </>
  );
}
