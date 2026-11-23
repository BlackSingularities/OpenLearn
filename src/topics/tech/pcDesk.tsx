/*
 * Komputer osobisty – pokój i stanowisko: podłoga, ściany z oknem, biurko, krzesło, lampa, roślina, monitor
 * z obrazem (pulpit, ekran startowy, test pamięci, gra), klawiatura i mysz z kablami.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DESK, KEYBOARD, MONITOR, MOUSE, PC_O, WALL_X, WALL_Z, rng, type V3 } from './pcGeo';
import { Box, Cyl, MAT, Tube } from './pcMats';
import { MB, MH, MW, SE_Y, SE_Z, keycapGeo, mouseBaseGeo, mouseShellGeo } from './pcInputGeo';

/* ================= obraz na monitorze ================= */

export type ScreenState = 'off' | 'logo' | 'post' | 'boot' | 'desktop' | 'game' | 'text' | 'text0';
const SCR = new Map<string, THREE.MeshBasicMaterial>();

function drawScreen(g: CanvasRenderingContext2D, s: ScreenState, W: number, H: number) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  if (s === 'off') return;
  if (s === 'logo') {
    g.fillStyle = '#e8edf3';
    g.font = 'bold 64px sans-serif';
    g.textAlign = 'center';
    g.fillText('GAMING', W / 2, H / 2 - 10);
    g.font = '24px sans-serif';
    g.fillStyle = '#8b95a3';
    g.fillText('Naciśnij DEL, aby wejść do ustawień', W / 2, H - 60);
    return;
  }
  if (s === 'post') {
    g.fillStyle = '#cfd6df';
    g.font = '22px monospace';
    const lines = ['UEFI BIOS v2.13', '', 'CPU: Core i7-14700K  5.5 GHz', 'Pamięć: 32768 MB DDR5  ...OK', 'Karta graficzna: PCIe x16  ...OK', 'Dysk NVMe: 2 TB  ...OK', 'Klawiatura USB  ...OK', '', 'Uruchamiam system z dysku NVMe...'];
    lines.forEach((l, i) => g.fillText(l, 40, 60 + i * 34));
    return;
  }
  if (s === 'boot') {
    g.strokeStyle = '#7cc7ff';
    g.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.globalAlpha = 0.2 + (i / 8) * 0.8;
      g.beginPath();
      g.arc(W / 2 + Math.cos(a) * 28, H / 2 + 60 + Math.sin(a) * 28, 5, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#7cc7ff';
    for (let i = 0; i < 4; i++) g.fillRect(W / 2 - 46 + (i % 2) * 48, H / 2 - 90 + Math.floor(i / 2) * 48, 44, 44);
    return;
  }
  if (s === 'game') {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#ff9a5a');
    sky.addColorStop(0.55, '#ffd28a');
    sky.addColorStop(0.56, '#3d5a3a');
    sky.addColorStop(1, '#1f2e1e');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#2c3d2a';
    g.beginPath();
    g.moveTo(0, H * 0.56);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.5 - Math.sin(x / 90) * 40 - Math.sin(x / 33) * 12);
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 22px sans-serif';
    g.fillText('144 kl./s', 24, 40);
    return;
  }
  // pulpit
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1e3a8a');
  bg.addColorStop(0.6, '#7c3aed');
  bg.addColorStop(1, '#db2777');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  if (s === 'text' || s === 'text0') {
    g.fillStyle = '#f8fafc';
    g.fillRect(W * 0.18, H * 0.1, W * 0.64, H * 0.74);
    g.fillStyle = '#334155';
    g.font = '30px sans-serif';
    g.fillText(s === 'text' ? 'Ala ma kota_' : 'Ala ma kot_', W * 0.22, H * 0.22);
  } else {
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.fillRect(W * 0.12, H * 0.14, W * 0.46, H * 0.5);
    g.fillStyle = '#2563eb';
    g.fillRect(W * 0.12, H * 0.14, W * 0.46, 26);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(W * 0.62, H * 0.3, W * 0.28, H * 0.42);
  }
  g.fillStyle = 'rgba(15,23,42,0.85)';
  g.fillRect(0, H - 44, W, 44);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#e2e8f0'][i];
    g.fillRect(W / 2 - 150 + i * 52, H - 36, 30, 28);
  }
}
export function screenMat(s: ScreenState) {
  let m = SCR.get(s);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 576;
    drawScreen(c.getContext('2d')!, s, 1024, 576);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    SCR.set(s, m);
  }
  return m;
}

/* ================= pokój ================= */

export function Room() {
  const n = MAT();
  const books = useMemo(() => {
    const r = rng(31);
    const cols = ['#b91c1c', '#1d4ed8', '#15803d', '#a16207', '#6d28d9', '#334155', '#be185d'];
    let x = -60;
    const list: { x: number; w: number; h: number; c: string }[] = [];
    while (x < 40) {
      const w = 2 + r() * 2.5;
      list.push({ x: x + w / 2, w, h: 18 + r() * 8, c: cols[Math.floor(r() * cols.length)] });
      x += w + 0.3;
    }
    return list;
  }, []);
  const bookMats = useMemo(() => new Map(books.map((b) => [b.c, new THREE.MeshStandardMaterial({ color: b.c, roughness: 0.8 })])), [books]);
  return (
    <group>
      {/* podłoga i ściany */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={n.floor}>
        <planeGeometry args={[520, 420]} />
      </mesh>
      <Box p={[60, 135, WALL_Z - 2]} s={[460, 270, 4]} m={n.wall} />
      <Box p={[WALL_X - 2, 135, 140]} s={[4, 270, 400]} m={n.wall} />
      <Box p={[60, 5, WALL_Z]} s={[460, 10, 1.5]} m={n.white} />
      {/* okno */}
      <group position={[110, 150, WALL_Z]}>
        <Box p={[0, 0, 0.5]} s={[120, 110, 1]} m={n.white} />
        <mesh position={[0, 0, 1.1]} material={windowMat()}>
          <planeGeometry args={[110, 100]} />
        </mesh>
        <Box p={[0, 0, 1.6]} s={[3, 100, 1]} m={n.white} />
        <Box p={[0, 0, 1.6]} s={[110, 3, 1]} m={n.white} />
        <Box p={[0, -57, 8]} s={[130, 3, 16]} m={n.white} />
      </group>
      {/* półka z książkami */}
      <group position={[-60, 150, WALL_Z + 12]}>
        <Box p={[-10, 0, 0]} s={[110, 2.5, 22]} m={n.wood} />
        {books.map((b, i) => (
          <Box key={i} p={[b.x, 1.25 + b.h / 2, 0]} s={[b.w, b.h, 16]} m={bookMats.get(b.c)!} />
        ))}
      </group>
      {/* roślina w doniczce */}
      <group position={[WALL_X + 30, 0, WALL_Z + 30]}>
        <Cyl p={[0, 18, 0]} r={14} r2={17} h={36} m={n.white} seg={28} />
        {Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 9, 55 + (i % 3) * 10, Math.sin(a) * 9]} rotation={[Math.sin(a) * 0.5, a, Math.cos(a) * 0.5]} material={n.green}>
              <sphereGeometry args={[12, 8, 6]} />
            </mesh>
          );
        })}
      </group>
      <Desk />
      <DeskProps />
      <Chair />
      <Lamp />
      {/* listwa zasilająca na podłodze i kabel komputera */}
      <Box p={[40, 2, WALL_Z + 20]} s={[30, 4, 6]} m={n.white} />
      <Tube
        pts={[
          [PC_O[0] - 24, PC_O[1] + 5, PC_O[2] + 6],
          [PC_O[0] - 28, PC_O[1] - 5, PC_O[2] - 4],
          [PC_O[0] - 10, 40, WALL_Z + 18],
          [35, 4, WALL_Z + 20],
        ]}
        r={0.45}
        m={n.cable}
      />
    </group>
  );
}

let WIN: THREE.MeshBasicMaterial | null = null;
function windowMat() {
  if (WIN) return WIN;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#7fb6e6');
  sky.addColorStop(1, '#d8ecf8');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#9fb7a2';
  g.beginPath();
  g.moveTo(0, 190);
  for (let x = 0; x <= 256; x += 16) g.lineTo(x, 175 - Math.sin(x / 30) * 14);
  g.lineTo(256, 256);
  g.lineTo(0, 256);
  g.fill();
  g.fillStyle = '#c9d3dc';
  for (let i = 0; i < 6; i++) g.fillRect(20 + i * 40, 150 - (i % 3) * 18, 26, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  WIN = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  return WIN;
}

function Desk() {
  const n = MAT();
  const { x0, x1, z0, z1, top, th } = DESK;
  return (
    <group>
      <Box p={[(x0 + x1) / 2, top - th / 2, (z0 + z1) / 2]} s={[x1 - x0, th, z1 - z0]} m={n.wood} />
      {[x0 + 4, x1 - 4].map((x) => (
        <group key={x}>
          <Box p={[x, (top - th) / 2, z0 + 5]} s={[5, top - th, 5]} m={n.steelDark} />
          <Box p={[x, (top - th) / 2, z1 - 5]} s={[5, top - th, 5]} m={n.steelDark} />
          <Box p={[x, 4, (z0 + z1) / 2]} s={[5, 3, z1 - z0 - 6]} m={n.steelDark} />
        </group>
      ))}
      <Box p={[(x0 + x1) / 2, top - th - 4, z0 + 5]} s={[x1 - x0 - 8, 6, 2]} m={n.steelDark} />
      {/* podkładka pod mysz */}
      <Box p={[-12, top + 0.15, 17]} s={[90, 0.3, 32]} m={n.plastic} />
    </group>
  );
}

/** Słuchawki leżące na biurku i kubek – żeby stanowisko wyglądało na używane. */
function DeskProps() {
  const n = MAT();
  return (
    <group>
      <group position={[70, DESK.top, 16]} rotation={[0, -0.5, 0]}>
        <mesh position={[0, 2, 0]} rotation={[Math.PI / 2, 0, 0]} material={n.plastic}>
          <torusGeometry args={[8, 0.8, 10, 32, Math.PI]} />
        </mesh>
        {[-8, 8].map((x) => (
          <group key={x} position={[x, 2.2, 0]}>
            <Cyl p={[0, 0, 0]} r={4} h={2.6} m={n.plastic} seg={28} />
            <Cyl p={[0, 1.4, 0]} r={3.4} h={0.3} m={n.rubber} seg={28} />
          </group>
        ))}
      </group>
      <group position={[-72, DESK.top, 12]}>
        <Cyl p={[0, 5, 0]} r={4} h={10} m={n.white} seg={28} />
        <Cyl p={[0, 9.8, 0]} r={3.6} h={0.3} m={n.chip} seg={28} />
        <mesh position={[4.6, 5, 0]} rotation={[0, 0, 0]} material={n.white}>
          <torusGeometry args={[2.4, 0.6, 8, 20, Math.PI]} />
        </mesh>
      </group>
    </group>
  );
}

function Chair() {
  const n = MAT();
  return (
    <group position={[-75, 0, 85]} rotation={[0, 0.6, 0]}>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i}>
            <Box p={[Math.cos(a) * 15, 8, Math.sin(a) * 15]} s={[30, 3, 5]} r={[0, -a, 0]} m={n.plasticGrey} />
            <mesh position={[Math.cos(a) * 30, 3, Math.sin(a) * 30]} material={n.plastic}>
              <sphereGeometry args={[3, 10, 8]} />
            </mesh>
          </group>
        );
      })}
      <Cyl p={[0, 26, 0]} r={2.5} h={36} m={n.steel} />
      <Box p={[0, 47, 0]} s={[50, 8, 48]} m={n.plastic} />
      <Box p={[0, 85, 23]} s={[46, 62, 7]} r={[-0.12, 0, 0]} m={n.plastic} />
      {[-26, 26].map((x) => (
        <group key={x}>
          <Box p={[x, 58, 4]} s={[4, 16, 4]} m={n.plasticGrey} />
          <Box p={[x, 66, 4]} s={[7, 3, 26]} m={n.plastic} />
        </group>
      ))}
    </group>
  );
}

function Lamp() {
  const n = MAT();
  const top = DESK.top;
  return (
    <group position={[-78, top, -26]}>
      <Cyl p={[0, 1, 0]} r={8} h={2} m={n.steelDark} />
      <Tube
        pts={[
          [0, 2, 0],
          [3, 30, 4],
          [12, 46, 10],
          [24, 44, 16],
        ]}
        r={0.8}
        m={n.steelDark}
      />
      <mesh position={[26, 42, 17]} rotation={[0.3, 0, -0.9]} material={n.steelDark}>
        <coneGeometry args={[7, 10, 20, 1, true]} />
      </mesh>
      <pointLight position={[27, 38, 18]} intensity={1800} distance={240} decay={2} color="#fff1d6" />
    </group>
  );
}

/* ================= monitor, klawiatura, mysz ================= */

/** Monitor 27″: podstawa, ramię, panel z cienką ramką, obraz. `screen` – co jest na ekranie. */
export function Monitor({ screen }: { screen: ScreenState }) {
  const n = MAT();
  const { x, z, w, h, y0 } = MONITOR;
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, DESK.top + 0.5, -2]} s={[24, 1, 18]} m={n.steelDark} />
      <Box p={[0, DESK.top + 9, -7]} s={[5, 17, 2]} m={n.steelDark} />
      <group position={[0, y0 + h / 2, 0]}>
        <Box p={[0, 0, -2]} s={[w + 1.6, h + 2.2, 2.4]} m={n.plastic} />
        <Box p={[0, 0, -4.2]} s={[30, 18, 2]} m={n.plastic} />
        <mesh position={[0, 0.3, -0.75]} material={screenMat(screen)}>
          <planeGeometry args={[w, h]} />
        </mesh>
        <Box p={[0, -h / 2 - 0.6, -0.8]} s={[2, 0.4, 0.3]} m={n.ledWhite} />
      </group>
      {/* złącza i kabel DisplayPort z tyłu */}
      <Tube
        pts={[
          [3, y0 + 8, -5],
          [4, DESK.top + 2, -10],
          [30, DESK.top + 0.4, -12],
          [PC_O[0] - x - 26, DESK.top + 0.4, PC_O[2] - z + 6],
        ]}
        r={0.35}
        m={n.cable}
      />
    </group>
  );
}

/** Układ klawiszy: rzędy szerokości (w jednostkach 1,9 cm). */
const ROWS: number[][] = [
  [1, 0.5, 1, 1, 1, 1, 0.5, 1, 1, 1, 1, 0.5, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
  [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
];
/** Klawisze klawiatury (środek, szerokość) w układzie klawiatury. Pusta szerokość < 0 – przerwa. */
export function keyLayout() {
  const U = 1.9;
  const keys: { x: number; z: number; w: number }[] = [];
  ROWS.forEach((row, ri) => {
    let x = -21.5;
    const z = -5.2 + ri * U + (ri ? 0.5 : 0);
    row.forEach((wu, ki) => {
      // przerwy w rzędzie funkcyjnym (0,5)
      if (ri === 0 && wu === 0.5) {
        x += 0.5 * U;
        return;
      }
      keys.push({ x: x + (wu * U) / 2, z, w: wu * U - 0.2 });
      x += wu * U;
      void ki;
    });
  });
  // strzałki i blok nawigacyjny
  for (const [dx, dz] of [
    [0, 4],
    [-1, 5],
    [0, 5],
    [1, 5],
  ])
    keys.push({ x: 13.2 + dx * U, z: -5.2 + dz * U + 0.5, w: U - 0.2 });
  for (let i = 0; i < 6; i++) keys.push({ x: 11.3 + (i % 3) * U, z: -5.2 + (1 + Math.floor(i / 3)) * U + 0.5, w: U - 0.2 });
  return keys;
}

/** Opisy klawiszy w kolejności `keyLayout()`. */
const LEGENDS: string[] = [
  ...'Esc F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12'.split(' '),
  ...'~ 1 2 3 4 5 6 7 8 9 0 - = ⌫'.split(' '),
  ...'Tab Q W E R T Y U I O P [ ] \\'.split(' '),
  ...'Caps A S D F G H J K L ; \' Enter'.split(' '),
  ...'Shift Z X C V B N M , . / Shift'.split(' '),
  ...'Ctrl Win Alt _ AltGr Fn ☰ Ctrl'.split(' '),
  '↑',
  '←',
  '↓',
  '→',
  ...'Ins Home PgUp Del End PgDn'.split(' '),
];
let LEG: THREE.MeshBasicMaterial | null = null;
/** Przezroczysta warstwa z białymi opisami, leżąca tuż nad nasadkami (układ: x −22…22, z −7…7). */
export function legendMat(keys: { x: number; z: number; w: number }[]) {
  if (LEG) return LEG;
  const W = 1024;
  const H = Math.round((W * 14) / 44);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const k = W / 44;
  g.fillStyle = '#f1f3f6';
  g.textAlign = 'center';
  keys.forEach((key, i) => {
    const t = LEGENDS[i] ?? '';
    if (!t || t === '_') return;
    g.font = `${t.length > 2 ? 11 : 17}px sans-serif`;
    g.fillText(t, (key.x + 22) * k - (t.length > 2 ? 0 : 0), (key.z + 7) * k + 6);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  LEG = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  return LEG;
}

/** Klawisze z kolorem modyfikatora (ciemnoszare): wszystko, co nie jest literą, cyfrą ani spacją. */
const MOD = new Set(['Tab', 'Caps', 'Shift', 'Ctrl', 'Win', 'Alt', 'AltGr', 'Fn', '☰', 'Enter', '⌫', '\\', '~', '↑', '←', '↓', '→', 'Ins', 'Home', 'PgUp', 'Del', 'End', 'PgDn']);

/** Obudowa klawiatury: zaokrąglony prostokąt z fazowanymi krawędziami, wysokość 1,8 cm. */
function kbCaseGeo() {
  const w = 43.5;
  const d = 13.5;
  const r = 0.9;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2);
  s.absarc(w / 2 - r, -d / 2 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, d / 2 - r);
  s.absarc(w / 2 - r, d / 2 - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, d / 2);
  s.absarc(-w / 2 + r, d / 2 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -d / 2 + r);
  s.absarc(-w / 2 + r, -d / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.3, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.25, 0);
  return g;
}

export function Keyboard() {
  const n = MAT();
  const keys = useMemo(keyLayout, []);
  const caseGeo = useMemo(kbCaseGeo, []);
  const capMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62 }), []);
  const caps = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const im = caps.current;
    if (!im) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    keys.forEach((k, i) => {
      im.setMatrixAt(i, m.compose(new THREE.Vector3(k.x, 1.86, k.z), new THREE.Quaternion(), new THREE.Vector3(k.w, 0.67, 1.7)));
      const t = LEGENDS[i] ?? '';
      im.setColorAt(i, c.set(i === 0 ? '#d9583a' : MOD.has(t) || /^F\d/.test(t) ? '#3b3f46' : '#25272c'));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [keys]);
  return (
    <group position={[KEYBOARD.x, DESK.top + 0.3, KEYBOARD.z]} rotation={[0.05, 0, 0]}>
      <mesh geometry={caseGeo} material={n.plastic} />
      <Box p={[0, 1.81, 0]} s={[42.6, 0.04, 12.8]} m={n.aluDark} />
      <instancedMesh ref={caps} args={[keycapGeo(), capMat, keys.length]} />
      <mesh position={[0, 2.545, 0]} rotation={[-Math.PI / 2, 0, 0]} material={legendMat(keys)}>
        <planeGeometry args={[44, 14]} />
      </mesh>
      {[17.4, 18.6, 19.8].map((x) => (
        <Box key={x} p={[x, 1.84, -6.2]} s={[0.5, 0.02, 0.25]} m={n.ledWhite} />
      ))}
      {/* gniazdo USB-C z tyłu i nóżki */}
      <Box p={[14, 0.9, -7.05]} s={[1.0, 0.4, 0.2]} m={n.slot} />
      {[-19, 19].map((x) => (
        <Box key={x} p={[x, -0.15, -5.6]} s={[3, 0.3, 1.2]} m={n.rubber} />
      ))}
    </group>
  );
}

/** Odległość boku myszy od środka na wysokości y (mm). */
function sideZ(x: number, y: number) {
  const c = Math.min(1, Math.max(0, (y - MB) / MH(x))) ** (1 / SE_Y);
  return MW(x) * Math.sqrt(1 - c * c) ** SE_Z;
}

/** Mysz: skorupa z profilu (jak prawdziwa, wyższa pod dłonią), podział przycisków, kółko, boczne przyciski. */
export function Mouse() {
  const n = MAT();
  const shell = useMemo(() => mouseShellGeo(false), []);
  const base = useMemo(() => mouseBaseGeo(false), []);
  const shellMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2d3036', roughness: 0.38, metalness: 0.15, side: THREE.DoubleSide }), []);
  const k = 0.1;
  const wheelMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5a5f67', roughness: 0.8 }), []);
  // linia podziału przycisków i poprzeczna szczelina
  const split = useMemo<V3[]>(() => Array.from({ length: 12 }, (_, i) => -58 + i * 4.4).map((x) => [x, MB + MH(x) + 0.25, 0] as V3), []);
  const cross = useMemo<V3[]>(
    () =>
      Array.from({ length: 13 }, (_, i) => {
        const t = -1.0 + (i / 12) * 2.0;
        const x = -8;
        const s = Math.sin(t);
        return [x, MB + MH(x) * Math.abs(Math.cos(t)) ** SE_Y + 0.25, -MW(x) * Math.sign(s) * Math.abs(s) ** SE_Z * 1.01] as V3;
      }),
    [],
  );
  const wx = -30;
  return (
    <group position={[MOUSE.x, DESK.top, MOUSE.z]} rotation={[0, -Math.PI / 2, 0]} scale={k}>
      <mesh geometry={shell} material={shellMat} />
      <mesh geometry={base} material={n.plastic} />
      <Tube pts={split} r={0.4} m={n.rubber} seg={6} />
      <Tube pts={cross} r={0.4} m={n.rubber} seg={6} />
      {/* kółko w szczelinie */}
      <Box p={[wx, MB + MH(wx) - 1.6, 0]} s={[17, 4, 8.4]} m={n.rubber} />
      <Cyl p={[wx, MB + MH(wx) - 5.2, 0]} r={8} h={6.4} m={wheelMat} axis="z" seg={28} />
      {Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI / 2 + (i - 4) * 0.2;
        return <Box key={i} p={[wx + Math.cos(a) * 8.1, MB + MH(wx) - 5.2 + Math.sin(a) * 8.1, 0]} s={[0.6, 0.6, 6.6]} r={[0, 0, a]} m={n.rubber} />;
      })}
      {/* boczne przyciski pod kciukiem (lewa strona) */}
      {[-6, 8].map((x) => (
        <mesh key={x} position={[x, 15, sideZ(x, 15) - 0.7]}>
          <boxGeometry args={[11, 4.5, 2.4]} />
          <meshStandardMaterial color="#34373d" roughness={0.45} />
        </mesh>
      ))}
      {/* podświetlone logo pod dłonią */}
      <mesh position={[30, MB + MH(30) + 0.15, 0]} rotation={[-Math.PI / 2, 0, -0.35]}>
        <circleGeometry args={[3.2, 24]} />
        <meshBasicMaterial color="#7cc7ff" toneMapped={false} />
      </mesh>
      {/* ślizgacze */}
      {[-46, 46].map((x) => (
        <Box key={x} p={[x, 0.45, 0]} s={[8, 0.9, 34]} m={n.plasticWhite} />
      ))}
      <Tube
        pts={[
          [-58, 12, 0],
          [-68, 3, 0],
          [-120, 3, 0],
          [-240, 3, -60],
          [(PC_O[2] - MOUSE.z + 6) * 10, 3, -(PC_O[0] - MOUSE.x - 30) * 10],
        ]}
        r={2}
        m={n.cable}
      />
    </group>
  );
}

/** Kabel klawiatury do tylnego portu USB. */
export function KeyboardCable() {
  const n = MAT();
  const pts = useMemo<V3[]>(
    () => [
      [KEYBOARD.x + 14, DESK.top + 1.5, KEYBOARD.z - 7],
      [KEYBOARD.x + 16, DESK.top + 0.3, KEYBOARD.z - 14],
      [PC_O[0] - 30, DESK.top + 0.3, PC_O[2] + 6],
      [PC_O[0] - 24, DESK.top + 3, PC_O[2] + 9],
      [PC_O[0] - 23.2, PC_O[1] + 33, PC_O[2] + 2.2],
    ],
    [],
  );
  return <Tube pts={pts} r={0.25} m={n.cable} />;
}
