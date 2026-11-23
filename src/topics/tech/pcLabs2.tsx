/*
 * Komputer osobisty – pracownie pamięci, grafiki i urządzeń: wystawa pamięci (RAM, SSD, HDD), komórki DRAM
 * z odświeżaniem, przekrój 3D NAND, dysk twardy bez pokrywy, piramida pamięci, karta graficzna rozłożona na
 * warstwy, od trójkątów do pikseli, rdzenie procesora i karty graficznej, warstwy matrycy LCD z pikselami,
 * przełącznik klawisza w przekroju, mysz optyczna w przekroju i złącza.
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Lbl } from '../aviation/airliner';
import { GPU, HDD, MEM_LEVELS, clamp, rng, sm, type V3 } from './pcGeo';
import { Box, Cyl, Fan, MAT, Tube } from './pcMats';
import { EnergyFlow } from '../energy/windExtras';

/** Położenia kości pamięci względem układu GPU (jak w GpuChips). */
const VRAM_AT: [number, number][] = [
  [-3.6, -1.6],
  [-3.6, 1.6],
  [3.6, -1.6],
  [3.6, 1.6],
  [-1.4, -3.7],
  [1.4, -3.7],
];
import { Gpu, Hdd, M2Ssd, RamStick, SSD_PARTS } from './pcParts';
import { LC, LabStage, Slab } from './pcLabs';

/* ================= wystawa pamięci ================= */

/** Obrót: lokalne osie modułu RAM (długość y, wysokość z, grubość x) → świat (długość x, wysokość y, grubość z). */
const RAM_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));

/**
 * Wystawa pamięci: dwa moduły RAM (z radiatorem i goły – widać kości), dysk SSD M.2 na podstawce i dysk twardy
 * bez pokrywy z wirującym talerzem i ramieniem przeskakującym między ścieżkami.
 */
export function MemLab({ p, spin }: { p: V3; spin: () => number }) {
  const n = MAT();
  return (
    <LabStage p={p} r={90}>
      <group position={[-30, -86, -20]} scale={3.6}>
        <group quaternion={RAM_Q}>
          <RamStick />
        </group>
        <group position={[0, 0, 4.2]} quaternion={RAM_Q}>
          <RamStick heatspreader={false} />
        </group>
      </group>
      {/* podstawka z dyskiem M.2 */}
      <Box p={[-26, -84.5, 24]} s={[44, 3, 14]} m={n.pedestalTop} />
      <group position={[-26, -82.5, 24]} rotation={[-Math.PI / 2 + 0.25, 0, 0]} scale={5}>
        <M2Ssd />
      </group>
      <group position={[30, -86.2, 2]} rotation={[0, -0.35, 0]} scale={2.9}>
        <group position={[-(HDD.x0 + HDD.x1) / 2, -HDD.y0, -(HDD.z0 + HDD.z1) / 2]}>
          <Hdd lid={false} />
        </group>
        <HddInside spin={spin} arm={() => 0.5 + 0.4 * Math.sin(performance.now() / 700)} y={0.75} />
      </group>
    </LabStage>
  );
}

/** Ramię głowic: zwężający się kształt z otworami odciążającymi (płaszczyzna x–z, oś obrotu w 0,0). */
let ARM: THREE.BufferGeometry | null = null;
function armGeo() {
  if (ARM) return ARM;
  const s = new THREE.Shape();
  s.moveTo(0.6, -0.75);
  s.lineTo(-5.4, -0.22);
  s.lineTo(-5.4, 0.22);
  s.lineTo(0.6, 0.75);
  s.lineTo(0.6, -0.75);
  for (const [x, r] of [
    [-1.6, 0.35],
    [-3.1, 0.25],
  ] as [number, number][]) {
    const h = new THREE.Path();
    h.absarc(x, 0, r, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false, curveSegments: 16 });
  g.rotateX(Math.PI / 2);
  ARM = g;
  return g;
}

/**
 * Wnętrze dysku twardego (w wannie obudowy): dwa talerze z dociskiem na śrubach, ramię głowic z zawieszeniem
 * i głowicą, cewka z magnesem, rampa parkingowa, filtr powietrza i taśma sygnałowa. Środek dysku (x, z) =
 * (0, 0), dno wnętrza na wysokości `y`. `arm()` 0…1 – położenie ramienia (od brzegu do środka talerza).
 */
export function HddInside({ spin, arm, y }: { spin: () => number; arm: () => number; y: number }) {
  const n = MAT();
  const pl = useRef<THREE.Group>(null);
  const ar = useRef<THREE.Group>(null);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    const gr = g.createConicGradient(0, 256, 256);
    gr.addColorStop(0, '#f3f6fa');
    gr.addColorStop(0.25, '#97a0aa');
    gr.addColorStop(0.5, '#eef2f6');
    gr.addColorStop(0.75, '#8b949e');
    gr.addColorStop(1, '#f3f6fa');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
    // ścieżki zapisu: drobne koncentryczne pierścienie
    g.strokeStyle = 'rgba(60,70,90,0.12)';
    for (let r = 70; r < 255; r += 3) {
      g.beginPath();
      g.arc(256, 256, r, 0, Math.PI * 2);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const platter = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, metalness: 0.95, roughness: 0.1 }), [tex]);
  useFrame((_, dt) => {
    if (pl.current) pl.current.rotation.y += Math.min(dt, 0.05) * spin();
    // kąt ramienia: −1,09 rad – głowica nad zewnętrzną ścieżką, −0,65 – nad wewnętrzną
    if (ar.current) ar.current.rotation.y = -1.09 + arm() * 0.44;
  });
  const cx = -1.6;
  const piv: V3 = [4.9, 0, 2.9];
  return (
    <group position={[0, y, 0]}>
      <Box p={[0, -0.25, 0]} s={[14.2, 0.1, 9.8]} m={n.aluDark} />
      {/* talerze: dolny i górny z przekładką, docisk na sześciu śrubach */}
      <group ref={pl} position={[cx, 0, 0]}>
        {[-0.55, 0.02].map((yy) => (
          <mesh key={yy} position={[0, yy, 0]} rotation={[-Math.PI / 2, 0, 0]} material={platter}>
            <ringGeometry args={[1.25, 4.75, 72]} />
          </mesh>
        ))}
        <Cyl p={[0, -0.27, 0]} r={1.25} h={0.55} m={n.steelDark} seg={28} />
        <Cyl p={[0, 0.12, 0]} r={1.35} h={0.2} m={n.steel} seg={28} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Cyl key={i} p={[Math.cos((i * Math.PI) / 3) * 0.95, 0.25, Math.sin((i * Math.PI) / 3) * 0.95]} r={0.13} h={0.08} m={n.steelDark} seg={8} />
        ))}
        <Cyl p={[0, 0.27, 0]} r={0.3} h={0.05} m={n.steelDark} seg={12} />
      </group>
      {/* ramię głowic: oś, ramię, zawieszenie, głowica; po drugiej stronie osi cewka */}
      <group position={piv}>
        <Cyl p={[0, 0.2, 0]} r={0.6} h={0.8} m={n.steel} seg={24} />
        <Cyl p={[0, 0.62, 0]} r={0.35} h={0.06} m={n.steelDark} seg={16} />
        <group ref={ar} rotation={[0, -1.09, 0]}>
          <group>
            <mesh geometry={armGeo()} position={[0, 0.35, 0]} material={n.steelDark} />
            <Box p={[-6.1, 0.27, 0]} s={[1.5, 0.03, 0.3]} m={n.steel} />
            <Box p={[-6.85, 0.2, 0]} s={[0.22, 0.1, 0.16]} m={n.gold} />
            <Box p={[1.15, 0.3, 0]} s={[1.2, 0.3, 1.4]} m={n.copper} />
            <Box p={[1.15, 0.31, 0]} s={[0.6, 0.31, 0.7]} m={n.steelDark} />
          </group>
        </group>
      </group>
      {/* magnes cewki (górna płytka) */}
      <Box p={[5.7, 0.75, 3.7]} s={[2.2, 0.25, 1.4]} r={[0, 0.2, 0]} m={n.steel} />
      {/* rampa parkingowa przy brzegu talerza */}
      <Box p={[2.4, 0.15, -3.4]} s={[0.9, 0.5, 0.5]} r={[0, -0.4, 0]} m={n.plastic} />
      {/* filtr powietrza w rogu i taśma sygnałowa do złącza */}
      <Box p={[-6.2, 0.1, -3.8]} s={[1.2, 0.6, 0.9]} m={n.white} />
      <Tube
        pts={[
          [piv[0] + 0.3, 0.3, piv[2] - 0.6],
          [5.8, 0.15, 0.5],
          [6.3, 0.15, -2.5],
          [6.6, 0.15, -3.8],
        ]}
        r={0.06}
        m={n.orange}
        seg={6}
      />
      <Box p={[6.5, 0.2, -3.9]} s={[0.5, 0.4, 1]} m={n.chip} />
      {/* śruby pokrywy na brzegach wanny */}
      {[
        [-6.9, -4.6],
        [0, -4.6],
        [6.9, -4.6],
        [-6.9, 4.6],
        [0, 4.6],
        [6.9, 4.6],
      ].map(([x, z], i) => (
        <Cyl key={i} p={[x, 1.86, z]} r={0.13} h={0.04} m={n.steelDark} seg={8} />
      ))}
    </group>
  );
}

/* ================= dysk SSD od środka ================= */

/**
 * Dysk M.2 powiększony 11×: dane przychodzą stykami złącza (4 tory PCIe) do kontrolera, ten rozsyła je
 * równolegle czterema kanałami do każdej kości NAND i zagląda do pamięci DRAM, gdzie trzyma mapę: który
 * blok danych leży w której komórce.
 */
export function SsdLab({ p }: { p: V3 }) {
  const S = 11;
  const z = 0.32;
  const toCtrl: V3[][] = [-0.45, -0.15, 0.15, 0.45].map((yy) => [
    [-3.9, yy, z],
    [-3.3, yy * 0.8, z],
    [SSD_PARTS.ctrl, yy * 0.5, z + 0.1],
  ]);
  const toNand: V3[][] = SSD_PARTS.nand.flatMap((x) =>
    [-0.5, -0.17, 0.17, 0.5].map(
      (yy) =>
        [
          [SSD_PARTS.ctrl + 0.6, yy * 0.6, z + 0.1],
          [x - 0.9, yy, z],
          [x, yy, z + 0.1],
        ] as V3[],
    ),
  );
  return (
    <LabStage p={p} r={85}>
      <group position={[0, -58, 4]} rotation={[-Math.PI / 2 + 0.75, 0, 0]} scale={S}>
        <M2Ssd />
        {toCtrl.map((pp, i) => (
          <EnergyFlow key={`c${i}`} path={pp} count={6} speed={1.6} size={0.05} color="#86efac" />
        ))}
        {toNand.map((pp, i) => (
          <EnergyFlow key={`n${i}`} path={pp} count={6} speed={1.4} size={0.045} color={i < 4 ? '#fdba74' : '#f9a8d4'} />
        ))}
        <EnergyFlow
          path={[
            [SSD_PARTS.ctrl + 0.2, 0.7, z + 0.1],
            [SSD_PARTS.dram, 0.4, z + 0.05],
            [SSD_PARTS.ctrl + 0.2, 0.1, z + 0.1],
          ]}
          count={5}
          speed={1}
          size={0.045}
          color="#7dd3fc"
        />
        <Lbl pos={[-4.1, -1.5, 0.4]} sub color={LC.gold}>
          złącze M.2: 4 tory PCIe
        </Lbl>
        <Lbl pos={[SSD_PARTS.ctrl, 1.3, 0.6]} sub color={LC.green}>
          kontroler
        </Lbl>
        <Lbl pos={[SSD_PARTS.dram, -1.35, 0.5]} sub color={LC.cold}>
          DRAM: mapa danych
        </Lbl>
        <Lbl pos={[(SSD_PARTS.nand[0] + SSD_PARTS.nand[1]) / 2, 1.35, 0.5]} sub color="#fdba74">
          kości 3D NAND – po 4 kanały
        </Lbl>
        <Lbl pos={[SSD_PARTS.pmic - 0.3, -1.35, 0.4]} sub color={LC.part}>
          zasilanie
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= komórki DRAM ================= */

const BITS = [
  '00111100',
  '01100110',
  '11000011',
  '11000011',
  '11111111',
  '11000011',
  '11000011',
  '00000000',
];

/**
 * Siatka 8 × 8 komórek DRAM: każda to kondensator (przezroczysty walec, który może być naładowany – świeci) i
 * tranzystor. Rzędy łączą linie słowa, kolumny – linie bitu. Zapisana litera „A” z czasem blednie (ładunek ucieka),
 * a odświeżanie co chwilę odczytuje rząd po rzędzie i ładuje komórki od nowa.
 */
export function DramLab({ p, t }: { p: V3; t: () => number }) {
  const n = MAT();
  const G = 8;
  const step = 11;
  const caps = useMemo(() => Array.from({ length: G * G }, () => new THREE.MeshStandardMaterial({ color: '#1e3a5f', emissive: '#38bdf8', emissiveIntensity: 0, roughness: 0.3 })), []);
  const fill = useRef<(THREE.Mesh | null)[]>([]);
  const word = useRef<(THREE.Mesh | null)[]>([]);
  const lv = useRef(new Float32Array(G * G).fill(0));
  const lastRow = useRef(-1);
  const wordOn = useMemo(() => new THREE.MeshBasicMaterial({ color: '#facc15', toneMapped: false }), []);
  const sense = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1f3b2c', emissive: '#4ade80', emissiveIntensity: 0 }), []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const time = t();
    // zapis na początku, potem upływ ładunku i odświeżanie rząd po rzędzie co 0,35 s
    const row = Math.floor(time / 0.35) % G;
    const refresh = time > 2.5;
    for (let r = 0; r < G; r++)
      for (let c = 0; c < G; c++) {
        const i = r * G + c;
        const bit = BITS[r][c] === '1';
        if (time < 2.5) lv.current[i] = bit ? Math.min(1, sm(r * 0.3, r * 0.3 + 0.3, time)) : 0;
        else lv.current[i] = Math.max(0, lv.current[i] - dt * 0.05);
        if (refresh && row === r && lastRow.current !== row && bit) lv.current[i] = 1;
        const m = fill.current[i];
        if (m) {
          m.scale.y = Math.max(0.02, lv.current[i]);
          m.position.y = -4 + 4 * Math.max(0.02, lv.current[i]);
        }
        caps[i].emissiveIntensity = lv.current[i] * 0.9;
      }
    sense.emissiveIntensity = refresh && time % 0.35 < 0.14 ? 1.2 : time < 2.5 ? 0.5 : 0.05;
    lastRow.current = refresh ? row : -1;
    word.current.forEach((m, r) => m && (m.material = (refresh ? row === r : Math.floor(time / 0.3) === r) ? wordOn : n.aluDark));
  });
  return (
    <LabStage p={p} r={80}>
      <group position={[0, -70, 0]}>
        {Array.from({ length: G }, (_, r) => (
          <mesh key={r} ref={(m) => (word.current[r] = m)} position={[0, 0.5, -38.5 + r * step + 4]} material={n.aluDark}>
            <boxGeometry args={[G * step, 0.6, 1]} />
          </mesh>
        ))}
        {Array.from({ length: G }, (_, c) => (
          <Box key={c} p={[-38.5 + c * step - 4, 1.4, 0]} s={[1, 0.6, G * step]} m={n.copper} />
        ))}
        {/* wzmacniacze odczytu: na końcu każdej linii bitu – błyskają, gdy odczytują rząd */}
        {Array.from({ length: G }, (_, c) => (
          <mesh key={`s${c}`} position={[-38.5 + c * step - 4, 2, 49]} material={sense}>
            <boxGeometry args={[6, 4, 4]} />
          </mesh>
        ))}
        <Lbl pos={[0, 9, 54]} sub color={LC.green}>
          wzmacniacze odczytu
        </Lbl>
        {Array.from({ length: G * G }, (_, i) => {
          const r = Math.floor(i / G);
          const c = i % G;
          const x = -38.5 + c * step;
          const z = -38.5 + r * step;
          return (
            <group key={i} position={[x, 0, z]}>
              <Box p={[-2.5, 1.2, 2.5]} s={[2.4, 2.4, 2.4]} m={n.chipGrey} />
              <mesh position={[1.5, 6, -1.5]} material={n.tubeGlass}>
                <cylinderGeometry args={[2.4, 2.4, 10, 16, 1, true]} />
              </mesh>
              <mesh ref={(m) => (fill.current[i] = m)} position={[1.5, 6, -1.5]} material={caps[i]}>
                <cylinderGeometry args={[2, 2, 8, 16]} />
              </mesh>
            </group>
          );
        })}
        <Lbl pos={[-50, 4, -34.5]} sub color={LC.gold}>
          linia słowa (wybiera rząd)
        </Lbl>
        <Lbl pos={[-42.5, 4, 48]} sub color="#fdba74">
          linia bitu
        </Lbl>
        <Lbl pos={[41, 18, 39]} sub color={LC.cold}>
          kondensator: ładunek = 1
        </Lbl>
        <Lbl pos={[-41, 6, 43]} sub color={LC.part}>
          tranzystor
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= 3D NAND ================= */

/**
 * Pamięć 3D NAND w przekroju: wiele warstw (linie słowa przekładane izolatorem) i pionowe kanały przewiercone
 * przez cały stos. W pierścieniu wokół kanału w każdej warstwie można uwięzić elektrony – to jeden bit (lub kilka).
 */
export function NandLab({ p }: { p: V3 }) {
  const n = MAT();
  const L = 24;
  const h = 3;
  const holes = [-36, -18, 0, 18, 36];
  const trapped = useMemo(() => {
    const r = rng(41);
    return holes.flatMap((x) => Array.from({ length: L }, (_, k) => ({ x, y: k * h + h * 0.75, on: r() < 0.45 }))).filter((e) => e.on);
  }, []);
  return (
    <LabStage p={p}>
      <group position={[8, -55, 10]} scale={0.72}>
        <Slab x0={-50} x1={50} y0={-6} y1={0} d={40} m={n.silicon} cut={n.cutSilicon} />
        {Array.from({ length: L }, (_, k) => (
          <Slab key={k} x0={-50} x1={50} y0={k * h} y1={k * h + h * 0.5} d={40} m={n.aluDark} cut={n.cutAlu} />
        ))}
        {Array.from({ length: L }, (_, k) => (
          <Slab key={`o${k}`} x0={-50} x1={50} y0={k * h + h * 0.5} y1={(k + 1) * h} d={40} m={n.white} cut={n.cutPlastic} />
        ))}
        {/* kanały: rdzeń z izolatora, kanał krzemowy, warstwa pułapkująca */}
        {holes.map((x) => (
          <group key={x}>
            <mesh position={[x, (L * h) / 2, 0.06]} material={n.cutAlu}>
              <planeGeometry args={[8.6, L * h + 2]} />
            </mesh>
            <mesh position={[x, (L * h) / 2, 0.07]} material={n.orange}>
              <planeGeometry args={[6.2, L * h + 2]} />
            </mesh>
            <mesh position={[x, (L * h) / 2, 0.08]} material={n.silicon}>
              <planeGeometry args={[4.4, L * h + 2]} />
            </mesh>
            <mesh position={[x, (L * h) / 2, 0.09]} material={n.white}>
              <planeGeometry args={[2.4, L * h + 2]} />
            </mesh>
            <Cyl p={[x, L * h + 1.5, -1]} r={1.6} h={3} m={n.copper} />
          </group>
        ))}
        {trapped.map((e, i) => (
          <group key={i}>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[e.x + s * 2.65, e.y, 0.3]} material={n.glowBlue}>
                <sphereGeometry args={[0.55, 8, 6]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* schodki: każda linia słowa wystaje dalej, żeby dało się do niej doprowadzić kontakt z góry */}
        {Array.from({ length: L }, (_, k) => {
          const x0 = -50 - (L - k) * 1.6;
          return (
            <group key={`st${k}`}>
              <Slab x0={x0} x1={-50} y0={k * h} y1={k * h + h * 0.5} d={40} m={n.aluDark} cut={n.cutAlu} />
              <Slab x0={x0} x1={-50} y0={k * h + h * 0.5} y1={(k + 1) * h} d={40} m={n.white} cut={n.cutPlastic} />
              <Cyl p={[x0 + 0.8, ((k + 1) * h + L * h + 4) / 2, -20]} r={0.45} h={L * h + 4 - (k + 1) * h} m={n.copper} seg={8} />
            </group>
          );
        })}
        {/* kanały w głębi stosu: widać ich miedziane zakończenia na wierzchu i linie bitu nad nimi */}
        {holes.map((x) =>
          [-12, -26].map((zz) => <Cyl key={`${x}${zz}`} p={[x, L * h + 0.6, zz]} r={2.2} h={1.2} m={n.copper} />),
        )}
        {holes.map((x) => (
          <Box key={`bl${x}`} p={[x, L * h + 3.4, -18]} s={[1.6, 0.8, 40]} m={n.gold} />
        ))}
        <Lbl pos={[-75, L * h + 6, -20]} sub color={LC.gold}>
          schodki z kontaktami linii słowa
        </Lbl>
        <Lbl pos={[36, L * h + 8, -30]} sub color={LC.gold}>
          linie bitu
        </Lbl>
        <Lbl pos={[-62, 30, 0]} sub color={LC.part}>
          {`${L} warstw (w nowych układach ponad 200)`}
        </Lbl>
        <Lbl pos={[-18, L * h + 8, 0]} sub color={LC.gold}>
          pionowy kanał
        </Lbl>
        <Lbl pos={[18, -2, 4]} sub color="#fdba74">
          warstwa pułapkująca ładunek
        </Lbl>
        <Lbl pos={[60, 40, 0]} sub color={LC.cold}>
          uwięzione elektrony = zapisany bit
        </Lbl>
        <Lbl pos={[60, 20, 0]} sub color={LC.part}>
          linie słowa (metal)
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= dysk twardy ================= */

/** Dysk twardy bez pokrywy, powiększony 5×. Talerz wiruje, ramię przeskakuje między ścieżkami. */
export function HddLab({ p, spin }: { p: V3; spin: () => number }) {
  const t = useRef(0);
  const target = useRef(0.4);
  const cur = useRef(0.4);
  useFrame((_, dt) => {
    t.current += dt;
    if (t.current > 0.8) {
      t.current = 0;
      target.current = Math.random();
    }
    cur.current += (target.current - cur.current) * Math.min(1, dt * 14);
  });
  return (
    <LabStage p={p} r={85}>
      <group position={[0, -50, 0]} scale={5}>
        <group position={[-(HDD.x0 + HDD.x1) / 2, -HDD.y0, -(HDD.z0 + HDD.z1) / 2]}>
          <Hdd lid={false} />
        </group>
        <HddInside spin={spin} arm={() => cur.current} y={0.75} />
      </group>
      <Lbl pos={[-8, -26, 0]} sub color={LC.part}>
        talerz (szkło pokryte magnetykiem)
      </Lbl>
      <Lbl pos={[-8, -32, -2]} sub color={LC.gold}>
        oś silnika: 7200 obr./min
      </Lbl>
      <Lbl pos={[0, -28, 20]} sub color={LC.cold}>
        ramię z głowicą
      </Lbl>
      <Lbl pos={[34, -30, 18]} sub color="#fdba74">
        silnik cewki ramienia
      </Lbl>
    </LabStage>
  );
}

/* ================= piramida pamięci ================= */

const PYR_C = ['#f43f5e', '#fb923c', '#facc15', '#a3e635', '#22d3ee', '#818cf8', '#c084fc'];
/** Piramida: im wyżej, tym szybciej i mniej; im niżej, tym więcej i wolniej. */
export function PyrLab({ p }: { p: V3 }) {
  const mats = useMemo(() => PYR_C.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })), []);
  const N = MEM_LEVELS.length;
  return (
    <LabStage p={p} r={85}>
      <group position={[0, -86, 0]}>
        {MEM_LEVELS.map(([name, , , cap], i) => {
          // rejestry na górze (najwęższe), dyski na dole (najszersze)
          const w = 22 + i * 20;
          return (
            <group key={name} position={[0, (N - 1 - i) * 11 + 5, 0]}>
              <mesh material={mats[i]}>
                <boxGeometry args={[w, 10, 40]} />
              </mesh>
              <Lbl pos={[w / 2 + 4, 0, 20]} sub color={PYR_C[i]}>
                {`${name}: ${cap}`}
              </Lbl>
            </group>
          );
        })}
        <Lbl pos={[-85, 75, 0]} sub color={LC.hot}>
          szybciej, drożej, mniej
        </Lbl>
        <Lbl pos={[-85, 8, 0]} sub color={LC.cold}>
          wolniej, taniej, więcej
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= karta graficzna rozłożona ================= */

/**
 * Karta graficzna odwrócona wentylatorami do góry i rozsunięta na warstwy: osłona z wentylatorami, radiator
 * z rurkami, laminat z układem GPU i pamięciami, tylna płytka. Powiększenie 2,5×. `ex()` – rozsunięcie 0…1.
 */
export function GpuLab({ p, spin, ex }: { p: V3; spin: () => number; ex: () => number }) {
  const n = MAT();
  const parts = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const e = ex();
    [3, 1.5, 0, -1.2].forEach((k, i) => {
      const g = parts.current[i];
      if (g) g.position.y = -k * 6 * e;
    });
  });
  const cx = (GPU.x0 + GPU.x1) / 2;
  const cz = (GPU.z0 + GPU.z1) / 2;
  return (
    <LabStage p={p} r={90}>
      <group position={[0, -20, 0]} scale={2.6}>
        {/* odwrócona: oś x bez zmian, y w dół; środek karty w (0,0,0) */}
        <group rotation={[Math.PI, 0, 0]} position={[-cx, 0, 0]}>
          <group position={[0, -GPU.y, -cz]}>
            <group ref={(g) => (parts.current[0] = g)}>
              <Gpu spin={spin} part="shroud" />
            </group>
            <group ref={(g) => (parts.current[1] = g)}>
              <Gpu spin={spin} part="cooler" />
            </group>
            <group ref={(g) => (parts.current[2] = g)}>
              <Gpu spin={spin} part="pcb" />
              {/* dane między pamięciami a układem GPU (w obie strony) */}
              {VRAM_AT.map(([dx, dz], i) => {
                const a: V3 = [-7 + dx, GPU.y - 0.4, 7.5 + dz];
                const b: V3 = [-7, GPU.y - 0.4, 7.5];
                return (
                  <group key={i}>
                    <EnergyFlow path={[a, b]} count={6} speed={4} size={0.16} color="#c4b5fd" />
                    <EnergyFlow path={[b, a]} count={6} speed={4} size={0.16} color="#86efac" />
                  </group>
                );
              })}
            </group>
            <group ref={(g) => (parts.current[3] = g)}>
              <Gpu spin={spin} part="back" />
            </group>
          </group>
        </group>
      </group>
    </LabStage>
  );
}
/* ================= od trójkątów do pikseli ================= */

/** Rzut kuli o promieniu 1 na siatkę R × R: jasność piksela z oświetlenia (lub −1 – tło). */
function sphereShade(R: number) {
  const out: number[] = [];
  const L = new THREE.Vector3(-0.5, 0.6, 0.62).normalize();
  for (let j = 0; j < R; j++)
    for (let i = 0; i < R; i++) {
      const x = ((i + 0.5) / R) * 2.4 - 1.2;
      const y = 1.2 - ((j + 0.5) / R) * 2.4;
      const r2 = x * x + y * y;
      if (r2 > 1) out.push(-1);
      else {
        // ścianki 20-ścianu: jasność „schodkowa” jak przy cieniowaniu płaskim
        const nz = Math.sqrt(1 - r2);
        const nv = new THREE.Vector3(Math.round(x * 3) / 3, Math.round(y * 3) / 3, nz).normalize();
        out.push(clamp(nv.dot(L), 0.08, 1));
      }
    }
  return out;
}

/**
 * Cztery etapy w rzędzie: wierzchołki, trójkąty, rasteryzacja (które piksele zakrywa kształt) i cieniowanie
 * (kolor każdego piksela). Bryła w dwóch pierwszych etapach się obraca.
 */
export function RasterLab({ p }: { p: V3 }) {
  const n = MAT();
  const ico = useMemo(() => new THREE.IcosahedronGeometry(16, 1), []);
  const rot = useRef<THREE.Group>(null);
  const rot2 = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rot.current) rot.current.rotation.y += dt * 0.5;
    if (rot2.current) rot2.current.rotation.y += dt * 0.5;
  });
  const R = 18;
  const shade = useMemo(() => sphereShade(R), []);
  const cols = useMemo(() => {
    const base = new THREE.Color('#f97316');
    return shade.map((s) => (s < 0 ? null : base.clone().multiplyScalar(0.25 + s * 0.9)));
  }, [shade]);
  const pixMats = useMemo(() => cols.map((c) => (c ? new THREE.MeshBasicMaterial({ color: c, toneMapped: false }) : null)), [cols]);
  const pts = useMemo(() => new THREE.PointsMaterial({ color: '#7dd3fc', size: 2.6, sizeAttenuation: true }), []);
  const wire = useMemo(() => new THREE.MeshBasicMaterial({ color: '#7dd3fc', wireframe: true }), []);
  const X = [-75, -25, 25, 75];
  const cell = 36 / R;
  return (
    <LabStage p={p} r={110}>
      <group position={[0, -50, 0]}>
        <group ref={rot} position={[X[0], 30, 0]}>
          <points geometry={ico} material={pts} />
        </group>
        <group ref={rot2} position={[X[1], 30, 0]}>
          <mesh geometry={ico} material={wire} />
        </group>
        {[2, 3].map((k) => (
          <group key={k} position={[X[k], 30, 0]}>
            <Box p={[0, 0, -1]} s={[40, 40, 1]} m={n.plastic} />
            {shade.map((s, i) => {
              const ix = i % R;
              const iy = Math.floor(i / R);
              const x = -18 + (ix + 0.5) * cell;
              const y = 18 - (iy + 0.5) * cell;
              if (s < 0) return null;
              return (
                <mesh key={i} position={[x, y, 0]} material={k === 2 ? n.white : pixMats[i]!}>
                  <planeGeometry args={[cell * 0.86, cell * 0.86]} />
                </mesh>
              );
            })}
          </group>
        ))}
        {['1. wierzchołki', '2. trójkąty', '3. rasteryzacja', '4. cieniowanie'].map((s, i) => (
          <Lbl key={s} pos={[X[i], 4, 0]} sub color={i < 2 ? LC.cold : i === 2 ? LC.part : '#fdba74'}>
            {s}
          </Lbl>
        ))}
      </group>
    </LabStage>
  );
}

/* ================= rdzenie CPU i GPU ================= */

/** Po lewej 8 dużych rdzeni procesora, po prawej 1024 małe rdzenie karty graficznej – wszystkie mrugają naraz. */
export function CoresLab({ p }: { p: V3 }) {
  const n = MAT();
  const gpu = useRef<THREE.InstancedMesh>(null);
  const cpu = useRef<(THREE.Mesh | null)[]>([]);
  const G = 32;
  const cpuMats = useMemo(() => Array.from({ length: 8 }, () => new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#60a5fa', emissiveIntensity: 0.2 })), []);
  const c = useMemo(() => new THREE.Color(), []);
  const ready = useRef(false);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    cpuMats.forEach((m, i) => (m.emissiveIntensity = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + i))));
    if (!gpu.current) return;
    if (!ready.current) {
      const o = new THREE.Object3D();
      for (let i = 0; i < G * G; i++) {
        o.position.set(((i % G) - G / 2 + 0.5) * 1.9, 0, (Math.floor(i / G) - G / 2 + 0.5) * 1.9);
        o.updateMatrix();
        gpu.current.setMatrixAt(i, o.matrix);
      }
      gpu.current.instanceMatrix.needsUpdate = true;
      ready.current = true;
    }
    for (let i = 0; i < G * G; i++) {
      const a = 0.5 + 0.5 * Math.sin(t * 3 + (i % G) * 0.4 + Math.floor(i / G) * 0.25);
      c.setRGB(0.1 + 0.2 * a, 0.5 + 0.5 * a, 0.2 + 0.2 * a);
      gpu.current.setColorAt(i, c);
    }
    if (gpu.current.instanceColor) gpu.current.instanceColor.needsUpdate = true;
  });
  return (
    <LabStage p={p} r={110}>
      <group position={[0, -60, 0]} rotation={[0.55, 0, 0]}>
        <Box p={[-55, -1, 0]} s={[64, 2, 64]} m={n.die} />
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} ref={(m) => (cpu.current[i] = m)} position={[-55 + ((i % 4) - 1.5) * 14.5, 2, (Math.floor(i / 4) - 0.5) * 26]} material={cpuMats[i]}>
            <boxGeometry args={[12.5, 4, 22]} />
          </mesh>
        ))}
        <Box p={[45, -1, 0]} s={[66, 2, 66]} m={n.die} />
        <instancedMesh ref={gpu} args={[undefined, undefined, G * G]} position={[45, 1, 0]}>
          <boxGeometry args={[1.5, 2, 1.5]} />
          <meshStandardMaterial color="#ffffff" />
        </instancedMesh>
        <Lbl pos={[-55, 14, -38]} sub color="#93c5fd">
          procesor: 8 dużych, sprytnych rdzeni
        </Lbl>
        <Lbl pos={[45, 14, -38]} sub color={LC.green}>
          karta graficzna: tysiące prostych rdzeni
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= matryca LCD ================= */

const LCD_LAYERS: [string, string, number][] = [
  ['podświetlenie LED i światłowód', '#f8fafc', 3],
  ['folia rozpraszająca', '#e2e8f0', 1],
  ['polaryzator tylny', '#475569', 1],
  ['szkło z tranzystorami (TFT)', '#94a3b8', 2],
  ['ciekłe kryształy', '#a5f3fc', 1.5],
  ['filtr barw RGB', '#f472b6', 1.5],
  ['polaryzator przedni', '#475569', 1],
  ['szkło ochronne', '#bae6fd', 1.5],
];

/**
 * Matryca LCD rozsunięta na warstwy (po lewej) i powiększone piksele z trzema subpikselami (po prawej). Jasność
 * subpikseli zmienia się tak, że piksele składają różne kolory.
 */
export function LcdLab({ p }: { p: V3 }) {
  const mats = useMemo(() => LCD_LAYERS.map(([, c], i) => new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: i === 0 ? 1 : 0.75, roughness: 0.3, side: THREE.DoubleSide, emissive: i === 0 ? '#ffffff' : '#000000', emissiveIntensity: i === 0 ? 0.6 : 0 })), []);
  const sub = useMemo(() => Array.from({ length: 27 }, (_, i) => new THREE.MeshBasicMaterial({ color: ['#ff2a2a', '#2aff4a', '#2a6bff'][i % 3], toneMapped: false })), []);
  const base = useMemo(() => [new THREE.Color('#ff2a2a'), new THREE.Color('#2aff4a'), new THREE.Color('#2a6bff')], []);
  const filt = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 8;
    const g = c.getContext('2d')!;
    ['#ef4444', '#22c55e', '#3b82f6'].forEach((col, i) => {
      for (let k = 0; k < 32; k++) {
        g.fillStyle = col;
        g.fillRect((k * 3 + i), 0, 1, 8);
      }
    });
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useMemo(() => {
    mats[5].map = filt;
    mats[5].color.set('#ffffff');
  }, [mats, filt]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    sub.forEach((m, i) => {
      const px = Math.floor(i / 3);
      const ch = i % 3;
      const v = 0.5 + 0.5 * Math.sin(t * 0.9 + px * 0.7 + ch * 2.1);
      m.color.copy(base[ch]).multiplyScalar(0.08 + 0.92 * v);
    });
  });
  let z = 0;
  return (
    <LabStage p={p} r={110}>
      <group position={[-42, -40, 10]} rotation={[0, 0.62, 0]}>
        {LCD_LAYERS.map(([name, , th], i) => {
          const zz = z;
          z += th + 11;
          return (
            <group key={name} position={[0, 0, zz - 50]}>
              <mesh material={mats[i]}>
                <boxGeometry args={[46, 32, th]} />
              </mesh>
              <Lbl pos={[-20, i % 2 ? -19 : 19, 0]} sub color={i === 4 ? LC.cold : LC.part}>
                {name}
              </Lbl>
            </group>
          );
        })}
      </group>
      <group position={[55, -30, 0]}>
        {Array.from({ length: 9 }, (_, px) => (
          <group key={px} position={[((px % 3) - 1) * 16, (1 - Math.floor(px / 3)) * 16, 0]}>
            {[0, 1, 2].map((ch) => (
              <mesh key={ch} position={[(ch - 1) * 4.6, 0, 0]} material={sub[px * 3 + ch]}>
                <planeGeometry args={[4, 13]} />
              </mesh>
            ))}
          </group>
        ))}
        <Lbl pos={[0, 30, 0]} sub color="#fdba74">
          piksele z subpikselami R, G, B
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= przełącznik klawisza ================= */

/**
 * Przełącznik mechaniczny klawiatury w przekroju, powiększony 30×: nasadka, trzpień, sprężyna, obudowa,
 * dwie blaszki styku. `press()` (0…1) – jak głęboko wciśnięty; przy ok. 2 mm blaszki się stykają.
 */
export function KeyLab({ p, press }: { p: V3; press: () => number }) {
  const n = MAT();
  const stem = useRef<THREE.Group>(null);
  const spring = useRef<THREE.Group>(null);
  const leaf = useRef<THREE.Group>(null);
  const led = useRef<THREE.Mesh>(null);
  const S = 30;
  const springGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 200; i++) {
      const a = (i / 200) * Math.PI * 2 * 7;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.32, i / 200, Math.sin(a) * 0.32));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.035, 6, false);
  }, []);
  useFrame(() => {
    const k = press();
    const d = k * 0.4;
    if (stem.current) stem.current.position.y = -d;
    if (spring.current) {
      spring.current.scale.y = (1.25 - d) / 1.25;
    }
    const on = d > 0.2;
    if (leaf.current) leaf.current.rotation.z = on ? -0.12 : 0;
    if (led.current) (led.current.material as THREE.MeshBasicMaterial).color.set(on ? '#4ade80' : '#1f2a23');
  });
  return (
    <LabStage p={p}>
      <group position={[0, -72, 0]} scale={S}>
        {/* płytka i obudowa dolna (przecięte) */}
        <Slab x0={-1.2} x1={1.2} y0={-0.16} y1={0} d={1.6} m={n.greenBoard} cut={n.cutBoard} />
        <Slab x0={-0.75} x1={0.75} y0={0} y1={0.55} d={1.4} m={n.plasticGrey} cut={n.cutPlastic} />
        <Slab x0={-0.75} x1={-0.62} y0={0.55} y1={1.15} d={1.4} m={n.plasticGrey} cut={n.cutPlastic} />
        <Slab x0={0.62} x1={0.75} y0={0.55} y1={1.15} d={1.4} m={n.plasticGrey} cut={n.cutPlastic} />
        <Slab x0={-0.75} x1={0.75} y0={1.15} y1={1.25} d={1.4} m={n.plastic} cut={n.cutPlastic} />
        {/* blaszki styku */}
        <Box p={[-0.45, 0.6, -0.3]} s={[0.04, 0.9, 0.3]} m={n.gold} />
        <group ref={leaf} position={[-0.25, 0.15, -0.3]}>
          <Box p={[0, 0.45, 0]} s={[0.04, 0.9, 0.3]} m={n.gold} />
        </group>
        <group ref={spring} position={[0, 0.05, -0.3]}>
          <mesh geometry={springGeo} material={n.steel} scale={[1, 1.2, 1]} />
        </group>
        <group ref={stem}>
          {/* trzpień z krzyżakiem i nasadka */}
          <Slab x0={-0.25} x1={0.25} y0={0.75} y1={1.7} d={0.6} m={n.red} cut={n.cutPlastic} />
          <Box p={[-0.28, 0.85, -0.3]} s={[0.1, 0.25, 0.2]} m={n.red} />
          <Slab x0={-0.9} x1={0.9} y0={1.7} y1={1.85} d={1.8} m={n.keycap} cut={n.cutPlastic} />
          <Slab x0={-0.9} x1={-0.78} y0={1.15} y1={1.85} d={1.8} m={n.keycap} cut={n.cutPlastic} />
          <Slab x0={0.78} x1={0.9} y0={1.15} y1={1.85} d={1.8} m={n.keycap} cut={n.cutPlastic} />
        </group>
        <mesh ref={led} position={[1.0, 0.05, -0.4]}>
          <sphereGeometry args={[0.1, 12, 8]} />
          <meshBasicMaterial color="#1f2a23" toneMapped={false} />
        </mesh>
        <Lbl pos={[0, 2.05, 0.4]} sub color={LC.part}>
          nasadka klawisza
        </Lbl>
        <Lbl pos={[0.55, 1.35, 0.3]} sub color={LC.hot}>
          trzpień
        </Lbl>
        <Lbl pos={[0.3, 0.45, 0.2]} sub color={LC.part}>
          sprężyna
        </Lbl>
        <Lbl pos={[-0.95, 0.75, 0]} sub color={LC.gold}>
          blaszki styku
        </Lbl>
        <Lbl pos={[0, -0.32, 0.8]} sub color={LC.green}>
          płytka klawiatury
        </Lbl>
        <Lbl pos={[1.25, 0.12, -0.4]} sub color={LC.green}>
          sygnał
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= mysz optyczna ================= */

/**
 * Mysz optyczna przecięta wzdłuż, powiększona 6×: dioda oświetla blat pod kątem, soczewka skupia obraz na
 * czujniku – maleńkiej kamerze, która robi kilka tysięcy zdjęć na sekundę i porównuje je, żeby wyliczyć ruch.
 */
export function MouseLab({ p }: { p: V3 }) {
  const n = MAT();
  const S = 6;
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const r = rng(19);
    g.fillStyle = '#6b5a48';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) {
      const v = 60 + r() * 120;
      g.fillStyle = `rgb(${v},${v * 0.85},${v * 0.7})`;
      g.fillRect(r() * 128, r() * 128, 2 + r() * 4, 2 + r() * 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const camMat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  const deskMat = useMemo(() => {
    const t2 = tex.clone();
    t2.needsUpdate = true;
    t2.repeat.set(4, 2);
    return new THREE.MeshStandardMaterial({ map: t2, roughness: 0.8 });
  }, [tex]);
  useFrame((_, dt) => {
    tex.offset.x += dt * 0.08;
    tex.offset.y += dt * 0.03;
    if (deskMat.map) deskMat.map.offset.x += dt * 0.08;
  });
  const beam = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }), []);
  return (
    <LabStage p={p}>
      <group position={[0, -66, 0]}>
        <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={deskMat}>
          <planeGeometry args={[110, 50]} />
        </mesh>
        <group scale={S}>
          {/* skorupa przecięta wzdłuż (pół elipsoidy) */}
          {/* skorupa (pół elipsoidy, widać ją od środka) i jej cienka krawędź przekroju */}
          <mesh position={[0, 0.6, 0]} scale={[6, 3.6, 3.2]} material={n.fanBlade}>
            <sphereGeometry args={[1, 32, 16, Math.PI, Math.PI, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, 0.6, 0.01]} scale={[6, 3.6, 1]} material={n.cutPlastic}>
            <ringGeometry args={[0.95, 1, 48, 1, 0, Math.PI]} />
          </mesh>
          <Slab x0={-5.6} x1={5.6} y0={0.1} y1={0.6} d={3} m={n.plastic} cut={n.cutPlastic} />
          <Slab x0={-4} x1={3.6} y0={1.3} y1={1.45} d={2.6} m={n.greenBoard} cut={n.cutBoard} />
          {/* czujnik, soczewka, dioda */}
          <Slab x0={-0.6} x1={0.6} y0={1.0} y1={1.3} d={1.2} m={n.chip} cut={n.cutPlastic} />
          <Slab x0={-0.8} x1={0.8} y0={0.15} y1={0.6} d={1.4} m={n.tubeGlass} />
          <Cyl p={[-1.8, 1, -0.4]} r={0.25} h={0.5} m={n.ledRed} />
          {/* przyciski z mikroprzełącznikami i kółko */}
          <Box p={[-3.2, 1.75, -0.6]} s={[0.8, 0.5, 0.6]} m={n.chip} />
          <Box p={[-3.2, 2.05, -0.6]} s={[0.25, 0.15, 0.25]} m={n.red} />
          <Cyl p={[-2.2, 3.2, 0]} r={0.75} h={0.5} m={n.rubber} axis="z" seg={20} />
          <Box p={[-2.2, 2.2, -0.4]} s={[0.6, 0.8, 0.4]} m={n.chip} />
          {/* „zdjęcie” z czujnika */}
          <mesh position={[0, 6.5, 0]} material={camMat}>
            <planeGeometry args={[3, 3]} />
          </mesh>
        </group>
        <mesh position={[-5, 3.5, -1.5]} rotation={[0, 0, -0.7]} material={beam}>
          <coneGeometry args={[2.5, 10, 16, 1, true]} />
        </mesh>
        <Lbl pos={[-11, 11, 3]} sub color={LC.hot}>
          dioda oświetla blat
        </Lbl>
        <Lbl pos={[6, 0, 6]} sub color={LC.cold}>
          soczewka
        </Lbl>
        <Lbl pos={[8, 9, 3]} sub color={LC.part}>
          czujnik – mała kamera
        </Lbl>
        <Lbl pos={[0, 50, 0]} sub color={LC.gold}>
          obraz z czujnika: ok. 10 000 zdjęć na sekundę
        </Lbl>
        <Lbl pos={[-19, 24, 3]} sub color={LC.part}>
          mikroprzełącznik przycisku
        </Lbl>
        <Lbl pos={[-13, 28, 5]} sub color={LC.part}>
          kółko
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= złącza ================= */

/** Złącza komputera powiększone 6×, każde z prędkością. */
export function PortsLab({ p }: { p: V3 }) {
  const n = MAT();
  const S = 14;
  const items: { name: string; sub: string; draw: () => ReactNode }[] = [
    {
      name: 'USB-A',
      sub: 'do 10 Gb/s',
      draw: () => (
        <group>
          <Box p={[0, 0, 0]} s={[1.2, 0.45, 1.4]} m={n.steel} />
          <Box p={[0, 0.06, 0.05]} s={[1.0, 0.12, 1.4]} m={n.blue} />
        </group>
      ),
    },
    {
      name: 'USB-C',
      sub: 'do 40 Gb/s, prąd do 240 W',
      draw: () => (
        <group>
          <Box p={[0, 0, 0]} s={[0.9, 0.32, 1]} m={n.steel} />
          <Box p={[0, 0, 0.05]} s={[0.66, 0.1, 1]} m={n.slot} />
        </group>
      ),
    },
    {
      name: 'HDMI',
      sub: 'obraz i dźwięk, 48 Gb/s',
      draw: () => (
        <group>
          <Box p={[0, 0, 0]} s={[1.5, 0.55, 1.2]} m={n.steel} />
          <Box p={[0, 0.03, 0.05]} s={[1.3, 0.3, 1.2]} m={n.slot} />
        </group>
      ),
    },
    {
      name: 'DisplayPort',
      sub: 'obraz, do 80 Gb/s',
      draw: () => (
        <group>
          <Box p={[0, 0, 0]} s={[1.65, 0.55, 1.2]} m={n.steel} />
          <Box p={[0.1, 0.03, 0.05]} s={[1.3, 0.3, 1.2]} m={n.slot} />
        </group>
      ),
    },
    {
      name: 'RJ-45 (sieć)',
      sub: 'Ethernet, 2,5 Gb/s',
      draw: () => (
        <group>
          <Box p={[0, 0, 0]} s={[1.6, 1.35, 1.6]} m={n.steel} />
          <Box p={[0, -0.05, 0.1]} s={[1.2, 0.9, 1.6]} m={n.slot} />
          {Array.from({ length: 8 }, (_, i) => (
            <Box key={i} p={[-0.5 + i * 0.14, 0.32, 0.4]} s={[0.05, 0.05, 0.6]} m={n.gold} />
          ))}
        </group>
      ),
    },
    {
      name: 'jack 3,5 mm',
      sub: 'słuchawki, sygnał analogowy',
      draw: () => (
        <group>
          <Box p={[0, 0, 0]} s={[1, 1, 1.2]} m={n.green} />
          <Cyl p={[0, 0, 0.61]} r={0.2} h={0.02} m={n.slot} axis="z" seg={16} />
        </group>
      ),
    },
  ];
  return (
    <LabStage p={p} r={100}>
      <group position={[0, -60, 0]}>
        {items.map((it, i) => (
          <group key={it.name} position={[((i % 3) - 1) * 48, Math.floor(i / 3) ? -4 : 38, 0]}>
            <group scale={S}>{it.draw()}</group>
            <Lbl pos={[0, 15, 0]} sub color={LC.gold}>
              {it.name}
            </Lbl>
            <Lbl pos={[0, -13, 8]} sub color={LC.part}>
              {it.sub}
            </Lbl>
          </group>
        ))}
      </group>
    </LabStage>
  );
}
