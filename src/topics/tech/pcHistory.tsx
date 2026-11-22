/*
 * Komputer osobisty – „komputer kiedyś”: muzeum (fragment ENIAC-a z 1946 r., IBM PC z 1981 r., beżowy komputer
 * z końca lat 90. i dzisiejszy), lampa elektronowa w przekroju, kineskop CRT w przekroju z wiązką elektronów,
 * nośniki danych od karty perforowanej do karty microSD i prawo Moore'a jako słupki.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Lbl } from '../aviation/airliner';
import { EnergyFlow } from '../energy/windExtras';
import { MEDIA, MOORE, MUSEUM, MUSEUM_Z, rng, type V3 } from './pcGeo';
import { Box, Cyl, MAT } from './pcMats';
import { LC, LabStage } from './pcLabs';
import { Computer, labelMat } from './pcParts';
import { screenMat } from './pcDesk';

/* ================= tekstury ekranów dawnych komputerów ================= */

const OLD = new Map<string, THREE.MeshBasicMaterial>();
function oldScreen(kind: 'dos' | 'win') {
  let m = OLD.get(kind);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 240;
  const g = c.getContext('2d')!;
  if (kind === 'dos') {
    g.fillStyle = '#031a06';
    g.fillRect(0, 0, 320, 240);
    g.fillStyle = '#3cff6a';
    g.font = '15px monospace';
    ['IBM Personal Computer DOS', 'Version 1.10', '', 'A>dir', ' COMMAND  COM', ' BASIC    COM', ' 2 plików   160 KB wolne', '', 'A>_'].forEach((l, i) => g.fillText(l, 12, 26 + i * 22));
  } else {
    g.fillStyle = '#008080';
    g.fillRect(0, 0, 320, 240);
    g.fillStyle = '#c0c0c0';
    g.fillRect(0, 220, 320, 20);
    g.fillStyle = '#008000';
    g.fillRect(3, 223, 44, 14);
    g.fillStyle = '#ffffff';
    g.fillRect(70, 50, 170, 110);
    g.fillStyle = '#000080';
    g.fillRect(70, 50, 170, 14);
    g.fillStyle = '#ffff99';
    for (let i = 0; i < 4; i++) g.fillRect(14, 14 + i * 44, 24, 22);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  OLD.set(kind, m);
  return m;
}

/* ================= muzeum ================= */

/** Fragment ENIAC-a: szafy z rzędami świecących lamp, tablice połączeń z kablami, czytnik kart. */
function Eniac() {
  const n = MAT();
  const tubes = useMemo(() => {
    const r = rng(46);
    return Array.from({ length: 6 }, (_, panel) => Array.from({ length: 60 }, (_, i) => ({ x: (i % 10) * 5.4 - 24, y: 40 + Math.floor(i / 10) * 26, on: r() < 0.8, panel })));
  }, []);
  const glow = useMemo(() => [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ color: '#ff9a3c', toneMapped: false })), []);
  useFrame(({ clock }) => {
    glow.forEach((m, i) => m.color.setHSL(0.07, 1, 0.45 + 0.12 * Math.sin(clock.elapsedTime * 3 + i * 2)));
  });
  return (
    <group>
      {Array.from({ length: 6 }, (_, k) => {
        const a = (k - 2.5) * 0.12;
        return (
          <group key={k} position={[(k - 2.5) * 62, 0, Math.abs(k - 2.5) * 8]} rotation={[0, -a, 0]}>
            <Box p={[0, 125, -10]} s={[60, 250, 30]} m={n.steelDark} />
            <Box p={[0, 125, 5.1]} s={[56, 200, 0.4]} m={n.slot} />
            {tubes[k].map((t, i) => (
              <group key={i} position={[t.x, t.y, 6]}>
                <Cyl p={[0, 4, 0]} r={1.3} h={8} m={n.tubeGlass} seg={10} />
                {t.on && <Cyl p={[0, 4, 0]} r={0.6} h={4} m={glow[i % 3]} seg={8} />}
              </group>
            ))}
            {/* tablica połączeń z kablami na górze */}
            <Box p={[0, 228, 6]} s={[56, 30, 1]} m={n.plasticGrey} />
            {Array.from({ length: 4 }, (_, i) => (
              <mesh key={i} position={[-18 + i * 12, 220, 9]} rotation={[0, 0, 0.3 * (i % 2 ? 1 : -1)]} material={i % 2 ? n.cableRed : n.cable}>
                <torusGeometry args={[6, 0.5, 6, 20, Math.PI]} />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* czytnik kart perforowanych */}
      <group position={[-250, 0, 60]}>
        <Box p={[0, 50, 0]} s={[60, 100, 50]} m={n.steelDark} />
        <Box p={[0, 101, 0]} s={[40, 2, 20]} m={n.beige} />
      </group>
    </group>
  );
}

/** IBM PC 5150: płaska skrzynka z dwiema stacjami dyskietek 5,25″, monitor z zielonym tekstem, ciężka klawiatura. */
function IbmPc() {
  const n = MAT();
  return (
    <group>
      <Box p={[0, 40, 0]} s={[120, 80, 70]} m={n.wood} />
      <group position={[0, 80, 0]}>
        <Box p={[0, 7.5, 0]} s={[50, 14, 41]} m={n.beige} />
        {[-11, 11].map((x) => (
          <group key={x} position={[x, 7, 20.6]}>
            <Box p={[0, 0, 0]} s={[15, 4.6, 0.4]} m={n.beigeDark} />
            <Box p={[0, 0.3, 0.25]} s={[13, 0.5, 0.2]} m={n.slot} />
            <Box p={[5.5, -1.2, 0.3]} s={[1.6, 1.2, 0.5]} m={n.slot} />
          </group>
        ))}
        <Box p={[-20, 3, 20.6]} s={[6, 1.5, 0.3]} m={n.slot} />
        {/* monitor IBM 5151 */}
        <group position={[0, 15, -2]}>
          <Box p={[0, 15, -6]} s={[38, 30, 30]} m={n.beige} />
          <Box p={[0, 15, 9.2]} s={[36, 28, 1]} m={n.beigeDark} />
          <mesh position={[0, 16, 9.8]} material={oldScreen('dos')}>
            <planeGeometry args={[25, 19]} />
          </mesh>
        </group>
        {/* klawiatura */}
        <group position={[0, 0.5, 34]}>
          <Box p={[0, 1.5, 0]} s={[50, 3, 21]} m={n.beige} />
          {Array.from({ length: 50 }, (_, i) => (
            <Box key={i} p={[-21 + (i % 10) * 3.2 + (i % 10 > 6 ? 4 : 0), 3.4, -7 + Math.floor(i / 10) * 3.2]} s={[2.8, 1, 2.8]} m={n.beigeDark} />
          ))}
        </group>
      </group>
    </group>
  );
}

/** Beżowy komputer z 1998 r.: wieża ze stacją dyskietek 3,5″ i CD-ROM, monitor CRT 17″, klawiatura i mysz. */
function BeigePc() {
  const n = MAT();
  return (
    <group>
      <Box p={[0, 40, 0]} s={[150, 80, 70]} m={n.wood} />
      <group position={[50, 80, 0]}>
        <Box p={[0, 22, 0]} s={[19, 44, 43]} m={n.beige} />
        <Box p={[0, 37, 21.6]} s={[15, 4, 0.4]} m={n.beigeDark} />
        <Box p={[0, 37.3, 21.9]} s={[12, 0.4, 0.2]} m={n.slot} />
        <Box p={[0, 31, 21.6]} s={[11, 2.4, 0.4]} m={n.beigeDark} />
        <Box p={[0, 31, 21.9]} s={[9, 0.3, 0.2]} m={n.slot} />
        <Cyl p={[0, 12, 21.8]} r={1.4} h={0.6} m={n.beigeDark} axis="z" />
        <Box p={[4, 8, 21.8]} s={[0.6, 0.6, 0.3]} m={n.ledGreen} />
      </group>
      <group position={[-12, 80, -6]}>
        <Box p={[0, 3, 0]} s={[22, 6, 22]} m={n.beige} />
        <Box p={[0, 25, -2]} s={[42, 38, 22]} m={n.beige} />
        <mesh position={[0, 21, -22]} scale={[1, 0.85, 1]} material={n.beige}>
          <cylinderGeometry args={[12, 17, 26, 4, 1]} />
        </mesh>
        <mesh position={[0, 26, 9.1]} material={oldScreen('win')}>
          <planeGeometry args={[32, 24]} />
        </mesh>
      </group>
      <group position={[-12, 80.5, 28]}>
        <Box p={[0, 1.4, 0]} s={[46, 2.8, 17]} m={n.beige} />
        {Array.from({ length: 60 }, (_, i) => (
          <Box key={i} p={[-20 + (i % 15) * 2.6, 3.2, -6 + Math.floor(i / 15) * 2.8]} s={[2.3, 0.9, 2.4]} m={n.plasticWhite} />
        ))}
      </group>
      <Box p={[22, 82, 28]} s={[6, 3, 10]} m={n.beige} />
    </group>
  );
}

/** Dzisiejszy komputer (ten sam co w pokoju) na stoliku z monitorem. */
function TodayPc({ spin }: { spin: () => number }) {
  const n = MAT();
  return (
    <group>
      <Box p={[0, 40, 0]} s={[150, 80, 70]} m={n.wood} />
      <group position={[45, 80, -10]}>
        <Computer glass cooler cables gpu explode={() => 0} spin={spin} />
      </group>
      <group position={[-25, 80, -15]}>
        <Box p={[0, 0.5, 0]} s={[22, 1, 16]} m={n.steelDark} />
        <Box p={[0, 9, -4]} s={[4, 17, 2]} m={n.steelDark} />
        <Box p={[0, 28, -1.5]} s={[62, 36, 2.4]} m={n.plastic} />
        <mesh position={[0, 28.2, -0.25]} material={screenMat('game')}>
          <planeGeometry args={[60, 34]} />
        </mesh>
      </group>
    </group>
  );
}

/** Muzeum: rząd komputerów z różnych lat na podestach z tabliczkami. */
export function Museum({ spin }: { spin: () => number }) {
  const n = MAT();
  const signs: [V3, string, string][] = [
    [MUSEUM.eniac, 'ENIAC', '1946'],
    [MUSEUM.ibm, 'IBM PC', '1981'],
    [MUSEUM.beige, 'PC z Windows 98', '1998'],
    [MUSEUM.today, 'PC dziś', '2025'],
  ];
  return (
    <group>
      <mesh position={[0, 0.2, MUSEUM_Z]} rotation={[-Math.PI / 2, 0, 0]} material={n.pedestalTop}>
        <planeGeometry args={[1400, 600]} />
      </mesh>
      <Box p={[0, 160, MUSEUM_Z - 200]} s={[1400, 320, 4]} m={n.pedestal} />
      <group position={MUSEUM.eniac}>
        <Eniac />
      </group>
      <group position={MUSEUM.ibm}>
        <IbmPc />
      </group>
      <group position={MUSEUM.beige}>
        <BeigePc />
      </group>
      <group position={MUSEUM.today}>
        <TodayPc spin={spin} />
      </group>
      {signs.map(([pos, name, year]) => (
        <group key={name} position={[pos[0] + (name === 'ENIAC' ? -190 : 0), 0, pos[2] + 60]}>
          <Box p={[0, 50, 0]} s={[3, 100, 3]} m={n.steelDark} />
          <Box p={[0, 104, 0]} s={[36, 16, 2]} r={[-0.3, 0, 0]} m={labelMat(`sign-${name}`, [name, year], '#1d222a', '#f8fafc')} />
        </group>
      ))}
      <pointLight position={[0, 300, MUSEUM_Z + 150]} intensity={60000} distance={0} decay={2} color="#fff3dd" />
    </group>
  );
}

/* ================= lampa elektronowa ================= */

/**
 * Trioda w przekroju, powiększona 8×: żarzona katoda wysyła elektrony do anody, a siatka między nimi decyduje,
 * czy przelecą – jak tranzystor, tylko wielka, gorąca i krótko żyjąca.
 */
export function TubeLab({ p, on }: { p: V3; on: () => number }) {
  const n = MAT();
  const S = 8;
  const helix = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2 * 12;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.55, 1.4 + (i / 160) * 3.2, Math.sin(a) * 0.55));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.025, 5, false);
  }, []);
  const paths = useMemo<V3[][]>(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        // elektrony lecą do tej połowy anody, która została po przecięciu (x > 0)
        const a = -Math.PI / 2 + ((i + 0.5) / 8) * Math.PI;
        const y = (1.8 + (i % 4) * 0.7) * S;
        return [
          [Math.cos(a) * 0.2 * S, y, Math.sin(a) * 0.2 * S],
          [Math.cos(a) * 1.05 * S, y, Math.sin(a) * 1.05 * S],
        ];
      }),
    [],
  );
  return (
    <LabStage p={p}>
      <group position={[0, -75, 0]}>
        <group scale={S}>
          {/* cokół z nóżkami */}
          <Cyl p={[0, 0.5, 0]} r={1.5} h={1} m={n.plastic} />
          {Array.from({ length: 8 }, (_, i) => (
            <Cyl key={i} p={[Math.cos(i) * 1, -0.3, Math.sin(i) * 1]} r={0.08} h={0.6} m={n.steel} seg={6} />
          ))}
          {/* bańka szklana (przecięta) */}
          <mesh position={[0, 3.6, 0]} material={n.tubeGlass}>
            <cylinderGeometry args={[1.45, 1.45, 5.2, 32, 1, true, 0, Math.PI]} />
          </mesh>
          <mesh position={[0, 6.2, 0]} material={n.tubeGlass}>
            <sphereGeometry args={[1.45, 24, 12, 0, Math.PI, 0, Math.PI / 2]} />
          </mesh>
          {/* katoda (żarzy się), siatka, anoda (przecięta) */}
          <Cyl p={[0, 3, 0]} r={0.18} h={3.4} m={n.glow} seg={12} />
          <mesh geometry={helix} material={n.steel} />
          <mesh position={[0, 3, 0]} material={n.steelDark}>
            <cylinderGeometry args={[1.1, 1.1, 3.6, 24, 1, true, 0, Math.PI]} />
          </mesh>
          <Cyl p={[0, 6.4, 0]} r={0.6} h={0.1} m={n.steel} />
        </group>
        {paths.map((pp, i) => (
          <EnergyFlow key={i} path={pp} count={4} speed={14} size={0.7} color="#7cc7ff" rate={on} />
        ))}
        <Lbl pos={[0, 60, 0]} sub color={LC.part}>
          szklana bańka z próżnią
        </Lbl>
        <Lbl pos={[-14, 12, 10]} sub color={LC.hot}>
          katoda (rozżarzona)
        </Lbl>
        <Lbl pos={[14, 34, 10]} sub color={LC.part}>
          siatka
        </Lbl>
        <Lbl pos={[-16, 38, 4]} sub color={LC.part}>
          anoda
        </Lbl>
        <Lbl pos={[14, 18, 10]} sub color={LC.cold}>
          elektrony
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= kineskop ================= */

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Kineskop przecięty na pół, powiększony 2×: działo elektronowe, cewki odchylające i ekran z luminoforem.
 * Wiązka biegnie linia po linii, rysując obraz – świecący punkt na ekranie.
 */
export function CrtLab({ p }: { p: V3 }) {
  const n = MAT();
  const beam = useRef<THREE.Mesh>(null);
  const dot = useRef<THREE.Mesh>(null);
  const gun: V3 = [0, 0, -40];
  const W = 30;
  const H = 22;
  const scr = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0b1210';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 3)
      for (let x = 0; x < 128; x += 3) {
        g.fillStyle = ['#ff4040', '#40ff60', '#4070ff'][(x / 3 + Math.floor(y / 3)) % 3];
        g.globalAlpha = 0.35;
        g.fillRect(x, y, 2, 2);
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.7;
    const line = Math.floor(t * 8) % 12;
    const u = (t * 8) % 1;
    const x = (u - 0.5) * W * 0.9;
    const y = (0.5 - line / 11) * H * 0.85;
    const end = new THREE.Vector3(x, y, 0.5);
    const start = new THREE.Vector3(...gun);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    if (beam.current) {
      // walec wiązki: oś y obrócona w kierunku od działa do punktu na ekranie (w układzie kineskopu)
      beam.current.position.copy(mid);
      beam.current.quaternion.setFromUnitVectors(UP, end.clone().sub(start).normalize());
      beam.current.scale.set(1, start.distanceTo(end), 1);
    }
    if (dot.current) dot.current.position.set(x, y, 0.6);
  });
  return (
    <LabStage p={p} r={85}>
      <group position={[0, -10, 10]} rotation={[0, -0.7, 0]} scale={2}>
        {/* ekran i lejek (połowa) */}
        <mesh position={[0, 0, 0]} material={scr}>
          <planeGeometry args={[W, H]} />
        </mesh>
        <mesh position={[0, 0, -15]} rotation={[Math.PI / 2, Math.PI / 4, 0]} material={n.tubeGlass}>
          <cylinderGeometry args={[19, 3, 30, 4, 1, true]} />
        </mesh>
        <Cyl p={[0, 0, -36]} r={3} h={12} m={n.tubeGlass} axis="z" />
        {/* działo elektronowe i cewki odchylające */}
        <Cyl p={[0, 0, -38]} r={1.2} h={7} m={n.steel} axis="z" />
        <Cyl p={[0, 0, -42]} r={0.6} h={1} m={n.glow} axis="z" />
        {[0, Math.PI / 2].map((a) => (
          <mesh key={a} position={[0, 0, -28]} rotation={[0, 0, a]} material={n.copper}>
            <torusGeometry args={[4.5, 1.1, 8, 24, Math.PI]} />
          </mesh>
        ))}
        <mesh ref={beam} material={n.glowBlue}>
          <cylinderGeometry args={[0.12, 0.12, 1, 6]} />
        </mesh>
        <mesh ref={dot}>
          <sphereGeometry args={[0.9, 12, 8]} />
          <meshBasicMaterial color="#e8fff0" toneMapped={false} />
        </mesh>
      </group>
      <Lbl pos={[-20, 30, 20]} sub color={LC.part}>
        ekran z luminoforem (kropki R, G, B)
      </Lbl>
      <Lbl pos={[45, 12, -40]} sub color={LC.hot}>
        działo elektronowe
      </Lbl>
      <Lbl pos={[30, 18, -20]} sub color={LC.gold}>
        cewki odchylające wiązkę
      </Lbl>
      <Lbl pos={[10, -6, 0]} sub color={LC.cold}>
        wiązka elektronów
      </Lbl>
    </LabStage>
  );
}

/* ================= nośniki danych ================= */

/** Nośniki obok siebie, każdy powiększony tak samo (2×). */
export function MediaLab({ p }: { p: V3 }) {
  const n = MAT();
  const cd = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const gr = g.createConicGradient(0, 128, 128);
    ['#e2e8f0', '#f9a8d4', '#a5f3fc', '#fde68a', '#c4b5fd', '#e2e8f0'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col));
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, metalness: 0.8, roughness: 0.15 });
  }, []);
  const S = 2;
  const X = [-100, -60, -22, 16, 54, 84];
  return (
    <LabStage p={p} r={115}>
      <group position={[0, -60, 0]} rotation={[-0.35, 0, 0]}>
        {/* karta perforowana 18,7 × 8,3 cm */}
        <group position={[X[0], 0, 0]} scale={S}>
          <Box p={[0, 0, 0]} s={[18.7, 8.3, 0.02]} m={n.beige} />
          {Array.from({ length: 60 }, (_, i) => (
            <Box key={i} p={[-8.5 + (i % 20) * 0.9, -3 + Math.floor(i / 20) * 2.6 + ((i * 7) % 3) * 0.4, 0.02]} s={[0.25, 0.5, 0.02]} m={n.slot} />
          ))}
        </group>
        {/* dyskietka 5,25″ */}
        <group position={[X[1], 0, 0]} scale={S}>
          <Box p={[0, 0, 0]} s={[13.3, 13.3, 0.15]} m={n.plastic} />
          <Cyl p={[0, 0, 0.08]} r={1.9} h={0.02} m={n.chipGrey} axis="z" />
          <Box p={[0, -4, 0.08]} s={[1.2, 3.6, 0.02]} m={n.copper} />
          <Box p={[0, 4.5, 0.09]} s={[7, 3, 0.01]} m={n.white} />
        </group>
        {/* dyskietka 3,5″ */}
        <group position={[X[2], 0, 0]} scale={S}>
          <Box p={[0, 0, 0]} s={[9, 9.4, 0.33]} m={n.blue} />
          <Box p={[0.6, 3.4, 0.18]} s={[5, 2.6, 0.02]} m={n.steel} />
          <Box p={[0, -2.2, 0.18]} s={[6.6, 4.4, 0.01]} m={n.white} />
        </group>
        {/* płyta CD */}
        <group position={[X[3], 0, 0]} scale={S}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={cd}>
            <cylinderGeometry args={[6, 6, 0.12, 64]} />
          </mesh>
          <Cyl p={[0, 0, 0.07]} r={0.75} h={0.02} m={n.slot} axis="z" />
        </group>
        {/* pendrive */}
        <group position={[X[4], 0, 0]} scale={S}>
          <Box p={[0, 1, 0]} s={[2, 4.4, 0.8]} m={n.plastic} />
          <Box p={[0, -2.2, 0]} s={[1.2, 2, 0.45]} m={n.steel} />
        </group>
        {/* karta microSD (1,1 × 1,5 cm) */}
        <group position={[X[5], 0, 0]} scale={S}>
          <Box p={[0, 0, 0]} s={[1.1, 1.5, 0.1]} m={n.plastic} />
          <Box p={[0, -0.5, 0.06]} s={[0.9, 0.3, 0.01]} m={n.gold} />
        </group>
        {MEDIA.map(([name, year, , cap], i) => (
          <group key={name}>
            <Lbl pos={[X[i], 26, 0]} sub color={LC.gold}>
              {`${name} (${year})`}
            </Lbl>
            <Lbl pos={[X[i], -24, 4]} sub color={LC.part}>
              {cap}
            </Lbl>
          </group>
        ))}
      </group>
    </LabStage>
  );
}

/* ================= prawo Moore'a ================= */

/** Słupki: wysokość proporcjonalna do logarytmu liczby tranzystorów – każdy krok w górę to 10 razy więcej. */
export function MooreLab({ p }: { p: V3 }) {
  const n = MAT();
  const mats = useMemo(() => MOORE.map((_, i) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.72 - (i / MOORE.length) * 0.6, 0.7, 0.55), roughness: 0.4 })), []);
  const h = (v: number) => (Math.log10(v) - 3) * 14 + 4;
  return (
    <LabStage p={p} r={115}>
      <group position={[0, -86, 0]}>
        {[3, 4, 5, 6, 7, 8, 9, 10, 11].map((e) => (
          <Box key={e} p={[0, (e - 3) * 14 + 4, -13]} s={[200, 0.25, 0.25]} m={e % 3 === 0 ? n.steel : n.steelDark} />
        ))}
        {MOORE.map(([year, count, chip], i) => {
          const x = -90 + i * 20;
          const hh = h(count);
          return (
            <group key={year} position={[x, 0, 0]}>
              <mesh position={[0, hh / 2, 0]} material={mats[i]}>
                <boxGeometry args={[12, hh, 12]} />
              </mesh>
              <Lbl pos={[0, hh + 6, 0]} sub color={LC.part}>
                {chip}
              </Lbl>
              <Lbl pos={[0, -5, 8]} sub color={LC.gold}>
                {String(year)}
              </Lbl>
            </group>
          );
        })}
        <Lbl pos={[-110, 4, -13]} sub color={LC.cold}>
          tysiąc
        </Lbl>
        <Lbl pos={[-110, 46, -13]} sub color={LC.cold}>
          milion
        </Lbl>
        <Lbl pos={[-110, 88, -13]} sub color={LC.cold}>
          miliard
        </Lbl>
      </group>
    </LabStage>
  );
}
