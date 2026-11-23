/*
 * Komputer osobisty – pracownie klawiatury i myszy: przełącznik mechaniczny w przekroju razem z siatką
 * skanowania klawiszy, klawiatura rozłożona na warstwy i mysz optyczna przecięta wzdłuż.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Lbl } from '../aviation/airliner';
import { rng, sm, type V3 } from './pcGeo';
import { Box, Cyl, MAT, Tube, chipTex } from './pcMats';
import { LC, LabStage, Slab } from './pcLabs';
import { keyLayout, legendMat } from './pcDesk';
import { MB, keycapGeo, mouseBaseGeo, mouseShellCut, mouseShellGeo } from './pcInputGeo';

type P2 = [number, number];
const shp = (pts: P2[]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
const mir = (pts: P2[]): P2[] => pts.map(([x, y]) => [-x, y] as P2).reverse();
const rect = (x0: number, y0: number, x1: number, y1: number) =>
  shp([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);

/** Bryła z kształtu w płaszczyźnie x–y, wyciągnięta w głąb (z od −d do 0), z kreskowaną ścianą przekroju. */
function Cut({ shape, d, m, cut, uv = 0.12 }: { shape: THREE.Shape; d: number; m: THREE.Material; cut?: THREE.Material; uv?: number }) {
  const [ext, face] = useMemo(() => {
    const e = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 20 });
    e.translate(0, 0, -d);
    const f = new THREE.ShapeGeometry(shape, 20);
    const a = f.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * uv, a.getY(i) * uv);
    return [e, f];
  }, [shape, d, uv]);
  return (
    <group>
      <mesh geometry={ext} material={m} />
      {cut && <mesh geometry={face} material={cut} position={[0, 0, 0.02]} />}
    </group>
  );
}

/** Litera na nasadce (biała na przezroczystym tle). */
function letterMat(t: string, color = '#f1f3f6') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.font = 'bold 84px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
}

/* ================= przełącznik klawisza ================= */

/** Przekrój przełącznika w mm (y = 0 – wierzch płytki drukowanej). */
const SW = (() => {
  const botL: P2[] = [
    [-7, 0],
    [-1.6, 0],
    [-1.6, 1.5],
    [-5.9, 1.5],
    [-5.9, 6.5],
    [-7, 6.5],
  ];
  const topL: P2[] = [
    [-7.8, 6.5],
    [-5.9, 6.5],
    [-5.9, 7.3],
    [-4.6, 10.8],
    [-3.6, 10.8],
    [-3.6, 11.6],
    [-6.0, 11.6],
    [-7.8, 7.3],
  ];
  const tubeL: P2[] = [
    [-1.6, -3.4],
    [-1.0, -3.4],
    [-1.0, 4.2],
    [-1.6, 4.2],
  ];
  const cap = new THREE.Shape();
  cap.moveTo(-9, 11.4);
  cap.lineTo(-7.8, 11.4);
  cap.lineTo(-5.6, 18.0);
  cap.lineTo(5.6, 18.0);
  cap.lineTo(7.8, 11.4);
  cap.lineTo(9, 11.4);
  cap.lineTo(6.4, 19.6);
  cap.quadraticCurveTo(0, 18.7, -6.4, 19.6);
  cap.closePath();
  const sockL: P2[] = [
    [-2.8, 12.8],
    [-2.0, 12.8],
    [-2.0, 18.0],
    [-2.8, 18.0],
  ];
  return {
    botL: shp(botL),
    botR: shp(mir(botL)),
    topL: shp(topL),
    topR: shp(mir(topL)),
    tubeL: shp(tubeL),
    tubeR: shp(mir(tubeL)),
    tubeCap: rect(-1.6, -3.4, 1.6, -2.8),
    cap,
    sockL: shp(sockL),
    sockR: shp(mir(sockL)),
    slider: shp([
      [-3.2, 5.6],
      [-2.4, 5.6],
      [-2.4, 7.6],
      [2.4, 7.6],
      [2.4, 5.6],
      [3.2, 5.6],
      [3.2, 8.6],
      [-3.2, 8.6],
    ]),
    pole: rect(-0.9, 2.6, 0.9, 7.6),
    cross: rect(-2, 8.6, 2, 14.4),
  };
})();

/** Siatka klawiszy obok przełącznika: wiersze × kolumny, wciśnięty klawisz w wierszu KR, kolumnie KC. */
const MR = 4;
const MC = 5;
const KR = 1;
const KC = 2;
const DIM = '#3b4250';

/**
 * Przełącznik mechaniczny (typu MX) w przekroju, powiększony ok. 3 razy: nasadka na krzyżaku trzpienia,
 * obudowa wpięta w stalową płytkę, sprężyna, dwie blaszki styku i nóżka trzpienia, która trzyma je osobno.
 * Obok linijka skoku klawisza i siatka klawiszy, którą układ klawiatury sprawdza wiersz po wierszu.
 * `press()` 0…1 – jak głęboko wciśnięty (pełny skok 4 mm, zadziałanie przy 2 mm).
 */
export function KeyLab({ p, press }: { p: V3; press: () => number }) {
  const n = MAT();
  const S = 3.2;
  const stem = useRef<THREE.Group>(null);
  const spring = useRef<THREE.Group>(null);
  const leaf = useRef<THREE.Group>(null);
  const spark = useRef<THREE.Mesh>(null);
  const mark = useRef<THREE.Group>(null);
  const t = useRef(0);
  const springGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 240; i++) {
      const a = (i / 240) * Math.PI * 2 * 7;
      pts.push(new THREE.Vector3(Math.cos(a) * 2.0, i / 240, Math.sin(a) * 2.0));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 480, 0.2, 6, false);
  }, []);
  const letterA = useMemo(() => letterMat('A'), []);
  const rows = useMemo(() => Array.from({ length: MR }, () => new THREE.MeshBasicMaterial({ color: DIM, toneMapped: false })), []);
  const cols = useMemo(() => Array.from({ length: MC }, () => new THREE.MeshBasicMaterial({ color: DIM, toneMapped: false })), []);
  const cell = useMemo(() => new THREE.MeshBasicMaterial({ color: '#94a3b8', toneMapped: false }), []);
  const stemMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d8342a', roughness: 0.45 }), []);
  const topMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.5 }), []);
  const capMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.7 }), []);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    const d = press() * 4;
    if (stem.current) stem.current.position.y = -d;
    if (spring.current) spring.current.scale.y = 6.1 - d;
    const on = d >= 2;
    if (leaf.current) leaf.current.rotation.z = 0.33 * sm(1.7, 2.0, d);
    if (spark.current) spark.current.visible = on;
    if (mark.current) mark.current.position.y = 19.6 - d;
    const row = Math.floor(t.current * 12) % MR;
    rows.forEach((m, i) => m.color.set(i === row ? '#facc15' : DIM));
    const hit = on && row === KR;
    cols.forEach((m, j) => m.color.set(hit && j === KC ? '#4ade80' : DIM));
    cell.color.set(on ? '#4ade80' : '#94a3b8');
  });
  const mx = (j: number) => 24 + (j - (MC - 1) / 2) * 3.4;
  const my = (i: number) => 11 - (i - (MR - 1) / 2) * 3.4;
  return (
    <LabStage p={p} r={95}>
      <group position={[-22, -66, 0]} scale={S}>
        {/* płytka drukowana z otworem na bolec, płytka stalowa */}
        <Slab x0={-11} x1={-1.7} y0={-1.6} y1={0} d={10} m={n.greenBoard} cut={n.cutBoard} />
        <Slab x0={1.7} x1={11} y0={-1.6} y1={0} d={10} m={n.greenBoard} cut={n.cutBoard} />
        <Slab x0={-11} x1={-7} y0={5} y1={6.5} d={10} m={n.steel} cut={n.cutAlu} />
        <Slab x0={7} x1={11} y0={5} y1={6.5} d={10} m={n.steel} cut={n.cutAlu} />
        {/* dioda przy przełączniku i lut pod nóżkami */}
        <Box p={[8.2, 0.5, -3]} s={[3.2, 1, 1.6]} m={n.chip} />
        <Box p={[7.1, 0.5, -3]} s={[0.4, 1.02, 1.62]} m={n.solder} />
        {[-5.4, -4.0].map((x) => (
          <Cyl key={x} p={[x, -2.0, -2.5]} r={0.25} r2={0.75} h={0.8} m={n.solder} />
        ))}
        {/* obudowa: dół (ciemny) i góra */}
        <Cut shape={SW.botL} d={7} m={n.plastic} cut={n.cutPlastic} />
        <Cut shape={SW.botR} d={7} m={n.plastic} cut={n.cutPlastic} />
        <Cut shape={SW.tubeL} d={1.6} m={n.plastic} cut={n.cutPlastic} />
        <Cut shape={SW.tubeR} d={1.6} m={n.plastic} cut={n.cutPlastic} />
        <Cut shape={SW.tubeCap} d={1.6} m={n.plastic} cut={n.cutPlastic} />
        <Cut shape={SW.topL} d={7} m={topMat} cut={n.cutPlastic} />
        <Cut shape={SW.topR} d={7} m={topMat} cut={n.cutPlastic} />
        {/* blaszki styku: nieruchoma i giętka (obraca się przy podstawie) */}
        <Box p={[-5.4, 3.3, -2.5]} s={[0.3, 3.6, 1.6]} m={n.gold} />
        <Box p={[-5.4, -1.0, -2.5]} s={[0.5, 4.6, 0.5]} m={n.gold} />
        <Box p={[-4.0, -1.0, -2.5]} s={[0.5, 4.6, 0.5]} m={n.gold} />
        <group ref={leaf} position={[-4.0, 1.5, -2.5]}>
          <Box p={[0, 1.65, 0]} s={[0.3, 3.3, 1.6]} m={n.gold} />
          <Box p={[-0.25, 3.1, 0]} s={[0.4, 0.4, 1.6]} m={n.gold} />
        </group>
        <mesh ref={spark} position={[-5.2, 4.55, -1.6]}>
          <sphereGeometry args={[0.45, 12, 8]} />
          <meshBasicMaterial color="#86efac" toneMapped={false} />
        </mesh>
        {/* sprężyna: od dna obudowy do gniazda w trzpieniu */}
        <group ref={spring} position={[0, 1.5, -1.2]}>
          <mesh geometry={springGeo} material={n.nickel} />
        </group>
        {/* trzpień z nóżką i krzyżakiem, nasadka z gniazdem */}
        <group ref={stem}>
          <Cut shape={SW.slider} d={3} m={stemMat} />
          <Cut shape={SW.pole} d={0.9} m={stemMat} />
          <Cut shape={SW.cross} d={0.65} m={stemMat} />
          <Box p={[0, 11.5, -1.3]} s={[1.3, 5.8, 1.3]} m={stemMat} />
          <Box p={[-4.0, 5.85, -1.0]} s={[2.4, 0.5, 1.2]} m={stemMat} />
          <Box p={[-4.75, 4.95, -1.0]} s={[0.8, 1.6, 1.2]} m={stemMat} />
          <Cut shape={SW.cap} d={9} m={capMat} cut={n.cutPlastic} />
          <Cut shape={SW.sockL} d={2.8} m={capMat} cut={n.cutPlastic} />
          <Cut shape={SW.sockR} d={2.8} m={capMat} cut={n.cutPlastic} />
          <mesh position={[0, 19.32, -4.5]} rotation={[-Math.PI / 2, 0, 0]} material={letterA}>
            <planeGeometry args={[5, 5]} />
          </mesh>
        </group>

        {/* linijka skoku */}
        <Box p={[-13.2, 17.6, 0]} s={[0.25, 4.3, 0.25]} m={n.steelDark} />
        {[0, 1, 2, 3, 4].map((k) => (
          <Box key={k} p={[-13.2 + (k === 2 ? -0.3 : 0), 19.6 - k, 0]} s={[k === 2 ? 1.6 : 0.9, 0.14, 0.25]} m={k === 2 ? n.ledGreen : n.steel} />
        ))}
        <group ref={mark} position={[-12.3, 19.6, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.45, 0.9, 3]} />
            <meshBasicMaterial color="#facc15" toneMapped={false} />
          </mesh>
        </group>

        {/* siatka klawiszy */}
        <Box p={[24, 11, -0.5]} s={[19.5, 16, 0.4]} m={n.slot} />
        {rows.map((m, i) => (
          <Box key={'r' + i} p={[24, my(i), 0]} s={[18, 0.3, 0.12]} m={m} />
        ))}
        {cols.map((m, j) => (
          <Box key={'c' + j} p={[mx(j), 11, 0.08]} s={[0.3, 14.4, 0.12]} m={m} />
        ))}
        {Array.from({ length: MR * MC }, (_, k) => {
          const i = Math.floor(k / MC);
          const j = k % MC;
          const me = i === KR && j === KC;
          return <Box key={k} p={[mx(j) + 0.9, my(i) - 0.9, 0.18]} s={[1.5, 1.5, 0.2]} m={me ? cell : n.plasticGrey} />;
        })}
        <mesh position={[mx(KC) + 0.9, my(KR) - 0.9, 0.3]} material={letterA}>
          <planeGeometry args={[1.6, 1.6]} />
        </mesh>

        <Lbl pos={[0, 21.6, -4]} sub color={LC.part}>
          nasadka
        </Lbl>
        <Lbl pos={[0, 9.6, 1]} sub color={LC.hot}>
          trzpień
        </Lbl>
        <Lbl pos={[3.6, 3.2, 1.5]} sub color={LC.part}>
          sprężyna
        </Lbl>
        <Lbl pos={[-9.6, 3.2, 0]} sub color={LC.gold}>
          blaszki styku
        </Lbl>
        <Lbl pos={[-9.6, 7.6, 0]} sub color={LC.part}>
          płytka stalowa
        </Lbl>
        <Lbl pos={[10.2, 9.0, 0]} sub color={LC.part}>
          obudowa
        </Lbl>
        <Lbl pos={[8.2, 2.3, -3]} sub color={LC.part}>
          dioda
        </Lbl>
        <Lbl pos={[5.5, -3.2, 2]} sub color={LC.green}>
          płytka drukowana
        </Lbl>
        <Lbl pos={[-12.6, 22.6, 0]} sub color={LC.gold}>
          skok 4 mm
        </Lbl>
        <Lbl pos={[-12.6, 15.0, 0]} sub color={LC.green}>
          styk po 2 mm
        </Lbl>
        <Lbl pos={[24, 20.2, 0]} sub color={LC.violet}>
          siatka klawiszy
        </Lbl>
        <Lbl pos={[24, 1.8, 0]} sub color={LC.gold}>
          wiersze zasilane po kolei
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= klawiatura warstwa po warstwie ================= */

/** Wysokości warstw (cm) w rozłożonej klawiaturze. */
const LY = { case: 0, foam: 4.5, pcb: 9, plate: 13.5, caps: 18 };
/** Przesunięcie warstw w głąb – wyższe dalej, żeby nie zasłaniały niższych. */
const LZ = { case: 20, foam: 10, pcb: 0, plate: -10, caps: -20 };
const PRESS_KEYS = 'H E J K L A S D'.split(' ');

/**
 * Klawiatura rozłożona na warstwy, powiększona 2 razy: obudowa, pianka, płytka drukowana z siatką ścieżek
 * (wiersze i kolumny), diodami, mikrokontrolerem i złączem USB-C, stalowa płytka z przełącznikami i nasadki.
 * Co chwilę inny klawisz się wciska, a na płytce widać, jak układ sprawdza wiersze i znajduje kolumnę z prądem.
 */
export function KbdLab({ p }: { p: V3 }) {
  const n = MAT();
  const keys = useMemo(keyLayout, []);
  const caps = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const cur = useRef(-1);
  // wiersz i kolumna każdego klawisza w siatce
  const grid = useMemo(() => {
    const zs = [...new Set(keys.map((k) => k.z.toFixed(2)))].map(Number).sort((a, b) => a - b);
    const col = (x: number) => Math.floor((x + 21.5) / 1.9);
    const cs = [...new Set(keys.map((k) => col(k.x)))].sort((a, b) => a - b);
    return { zs, cs, rowOf: keys.map((k) => zs.indexOf(Number(k.z.toFixed(2)))), colOf: keys.map((k) => cs.indexOf(col(k.x))), colX: (c: number) => -21.5 + (cs[c] + 0.5) * 1.9 + 0.62 };
  }, [keys]);
  const rowMats = useMemo(() => grid.zs.map(() => new THREE.MeshBasicMaterial({ color: '#8a6a32', toneMapped: false })), [grid]);
  const colMats = useMemo(() => grid.cs.map(() => new THREE.MeshBasicMaterial({ color: '#8a6a32', toneMapped: false })), [grid]);
  const hitDot = useRef<THREE.Mesh>(null);
  const pressIdx = useMemo(() => {
    const L = ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', ...'~ 1 2 3 4 5 6 7 8 9 0 - = ⌫ Tab Q W E R T Y U I O P [ ] \\ Caps A S D F G H J K L'.split(' ')];
    return PRESS_KEYS.map((c) => L.indexOf(c)).filter((i) => i >= 0);
  }, []);
  const capMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62 }), []);
  const pcbMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#163323', roughness: 0.6 }), []);
  const foamMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cfc7b3', roughness: 1 }), []);
  const mcuMat = useMemo(() => new THREE.MeshStandardMaterial({ map: chipTex(['MCU', 'USB']), roughness: 0.45 }), []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const capAt = (i: number, dy: number) => {
    const k = keys[i];
    m4.compose(new THREE.Vector3(k.x, dy, k.z), new THREE.Quaternion(), new THREE.Vector3(k.w, 0.68, 1.7));
    caps.current?.setMatrixAt(i, m4);
  };
  useEffect(() => {
    const im = caps.current;
    if (!im) return;
    keys.forEach((_, i) => capAt(i, 0));
    const c = new THREE.Color();
    keys.forEach((_, i) => im.setColorAt(i, c.set(i === 0 ? '#e0603a' : i < 13 || i >= keys.length - 10 ? '#3a3e45' : '#25272b')));
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  const swGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1.4, 1.15, 1.4);
    g.translate(0, 0.08, 0);
    return g;
  }, []);
  const stemGeo = useMemo(() => new THREE.BoxGeometry(0.42, 0.35, 0.42), []);
  const diodeGeo = useMemo(() => new THREE.BoxGeometry(0.22, 0.14, 0.5), []);
  const inst = (geo: THREE.BufferGeometry, m: THREE.Material, at: (k: { x: number; z: number }, i: number) => V3) => (
    <instancedMesh
      args={[geo, m, keys.length]}
      ref={(im) => {
        if (!im) return;
        const mm = new THREE.Matrix4();
        keys.forEach((k, i) => im.setMatrixAt(i, mm.makeTranslation(...at(k, i))));
        im.instanceMatrix.needsUpdate = true;
      }}
    />
  );
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    const T = t.current;
    const cycle = 1.4;
    const ki = pressIdx[Math.floor(T / cycle) % pressIdx.length];
    const ph = T % cycle;
    const pr = ph < 0.12 ? ph / 0.12 : ph < 0.62 ? 1 : ph < 0.74 ? 1 - (ph - 0.62) / 0.12 : 0;
    if (cur.current !== ki && cur.current >= 0) capAt(cur.current, 0);
    cur.current = ki;
    capAt(ki, -0.45 * pr);
    if (caps.current) caps.current.instanceMatrix.needsUpdate = true;
    const row = Math.floor(T * 9) % grid.zs.length;
    rowMats.forEach((m, i) => m.color.set(i === row ? '#facc15' : '#8a6a32'));
    const hit = pr > 0.5 && grid.rowOf[ki] === row;
    colMats.forEach((m, j) => m.color.set(hit && grid.colOf[ki] === j ? '#4ade80' : '#8a6a32'));
    if (hitDot.current) {
      hitDot.current.visible = pr > 0.5;
      hitDot.current.position.set(keys[ki].x + 0.62, 0.2, keys[ki].z + 0.45);
    }
  });
  const W = 44;
  const D = 14;
  return (
    <LabStage p={p} r={95}>
      <group position={[0, -78, 0]} scale={2}>
        {/* obudowa */}
        <group position={[0, LY.case, LZ.case]}>
          <Box p={[0, 0.15, 0]} s={[W, 0.3, D]} m={n.plasticGrey} />
          <Box p={[0, 0.9, -D / 2 + 0.2]} s={[W, 1.5, 0.4]} m={n.plasticGrey} />
          <Box p={[0, 0.9, D / 2 - 0.2]} s={[W, 1.5, 0.4]} m={n.plasticGrey} />
          <Box p={[-W / 2 + 0.2, 0.9, 0]} s={[0.4, 1.5, D]} m={n.plasticGrey} />
          <Box p={[W / 2 - 0.2, 0.9, 0]} s={[0.4, 1.5, D]} m={n.plasticGrey} />
          {[-12, 0, 12].map((x) => (
            <Box key={x} p={[x, 0.7, 0]} s={[0.3, 1.0, D - 1]} m={n.plasticGrey} />
          ))}
          <Lbl pos={[25.5, 0.8, 0]} sub color={LC.part}>
            obudowa
          </Lbl>
        </group>
        {/* pianka */}
        <group position={[0, LY.foam, LZ.foam]}>
          <Box p={[0, 0, 0]} s={[W - 1, 0.5, D - 1]} m={foamMat} />
          <Lbl pos={[-25.5, 0, 0]} sub color={LC.part}>
            pianka wygłuszająca
          </Lbl>
        </group>
        {/* płytka drukowana: siatka ścieżek, diody, mikrokontroler, USB-C */}
        <group position={[0, LY.pcb, LZ.pcb]}>
          <Box p={[0, 0, 0]} s={[W - 1, 0.16, D - 1]} m={pcbMat} />
          {grid.zs.map((z, i) => (
            <Box key={'r' + i} p={[-3, 0.09, z + 0.72]} s={[37.5, 0.02, 0.22]} m={rowMats[i]} />
          ))}
          {grid.cs.map((_, j) => (
            <Box key={'c' + j} p={[grid.colX(j), 0.1, 0.3]} s={[0.22, 0.02, 12.2]} m={colMats[j]} />
          ))}
          {inst(diodeGeo, n.chip, (k) => [k.x + 0.62, 0.15, k.z + 0.45])}
          <mesh ref={hitDot} position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.36, 12, 8]} />
            <meshBasicMaterial color="#4ade80" toneMapped={false} />
          </mesh>
          <mesh position={[19.2, 0.25, 1.2]} material={mcuMat}>
            <boxGeometry args={[2.4, 0.3, 2.4]} />
          </mesh>
          <Box p={[19.2, 0.32, -6.15]} s={[1.0, 0.36, 0.8]} m={n.nickel} />
          <Box p={[19.2, 0.09, -2.6]} s={[0.14, 0.02, 6.4]} m={n.gold} />
          {[18.4, 20.0].map((x) => (
            <Box key={x} p={[x, 0.2, 3.6]} s={[0.7, 0.24, 0.4]} m={n.chipGrey} />
          ))}
          <Tube
            pts={[
              [19.2, 0.32, -6.6],
              [19.2, 0.3, -9],
              [17.5, -1.2, -11],
            ]}
            r={0.28}
            m={n.cable}
          />
          <Lbl pos={[-25.5, 0, 0]} sub color={LC.green}>
            płytka drukowana
          </Lbl>
          <Lbl pos={[-8, 0.3, 7.6]} sub color={LC.gold}>
            wiersze i kolumny ścieżek
          </Lbl>
          <Lbl pos={[19.2, 1.4, 2.4]} sub color={LC.violet}>
            mikrokontroler
          </Lbl>
          <Lbl pos={[26, 0, -5]} sub color={LC.part}>
            złącze USB-C
          </Lbl>
        </group>
        {/* stalowa płytka z przełącznikami */}
        <group position={[0, LY.plate, LZ.plate]}>
          <Box p={[0, 0, 0]} s={[W - 1, 0.15, D - 1]} m={n.steel} />
          {inst(swGeo, n.plastic, (k) => [k.x, 0, k.z])}
          {inst(stemGeo, n.red, (k) => [k.x, 0.82, k.z])}
          <Lbl pos={[26, 0.4, 0]} sub color={LC.hot}>
            przełączniki w stalowej płytce
          </Lbl>
        </group>
        {/* nasadki z opisami */}
        <group position={[0, LY.caps, LZ.caps]}>
          <instancedMesh ref={caps} args={[keycapGeo(), capMat, keys.length]} />
          <mesh position={[0, 0.695, 0]} rotation={[-Math.PI / 2, 0, 0]} material={legendMat(keys)}>
            <planeGeometry args={[44, 14]} />
          </mesh>
          <Lbl pos={[-25.5, 0.6, 0]} sub color={LC.part}>
            nasadki
          </Lbl>
        </group>
      </group>
    </LabStage>
  );
}

/* ================= mysz optyczna ================= */

/** Wzór blatu, jaki „widzi” czujnik: drobne ziarna w odcieniach czerwieni (świeci czerwona dioda). */
function speckle(seed: number, red: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = rng(seed);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const v = 40 + r() * 70 + (r() < 0.12 ? 110 : 0);
      g.fillStyle = red ? `rgb(${Math.min(255, v * 1.3)},${v * 0.35},${v * 0.3})` : `rgb(${v * 1.1},${v * 0.92},${v * 0.75})`;
      g.fillRect(x, y, 1, 1);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ścieżki rozbite na kreski (promień światła). */
function Ray({ a, b, m, r = 0.35 }: { a: V3; b: V3; m: THREE.Material; r?: number }) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const len = va.distanceTo(vb);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return (
    <mesh position={mid} quaternion={q} material={m}>
      <cylinderGeometry args={[r, r, len, 8, 1, true]} />
    </mesh>
  );
}

/**
 * Mysz optyczna przecięta wzdłuż (w mm, skala 0,62): skorupa, spód ze ślizgaczami, płytka drukowana,
 * dioda z prowadnicą światła, soczewka i czujnik, mikroprzełącznik przycisku, kółko z tarczą z otworami
 * i fotokomórką, mikrokontroler i kabel. Nad myszą dwa kolejne „zdjęcia” z czujnika – wzór przesunięty o kawałek.
 */
export function MouseLab({ p }: { p: V3 }) {
  const n = MAT();
  const shell = useMemo(() => mouseShellGeo(true), []);
  const base = useMemo(() => mouseBaseGeo(true), []);
  const cutShape = useMemo(() => mouseShellCut(), []);
  const shellMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.45, side: THREE.DoubleSide }), []);
  const deskTex = useMemo(() => {
    const t = speckle(19, false);
    t.repeat.set(6, 5);
    return t;
  }, []);
  const deskMat = useMemo(() => new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.85 }), [deskTex]);
  const [imgA, imgB] = useMemo(() => {
    const a = speckle(19, true);
    const b = a.clone();
    b.needsUpdate = true;
    a.repeat.set(0.3, 0.3);
    b.repeat.set(0.3, 0.3);
    return [a, b];
  }, []);
  const frameA = useMemo(() => new THREE.MeshBasicMaterial({ map: imgA, toneMapped: false }), [imgA]);
  const frameB = useMemo(() => new THREE.MeshBasicMaterial({ map: imgB, toneMapped: false }), [imgB]);
  const beam = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false }), []);
  const lensMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.55, roughness: 0.05 }), []);
  const mcuMat = useMemo(() => new THREE.MeshStandardMaterial({ map: chipTex(['USB', 'MCU']), roughness: 0.45 }), []);
  const wheel = useRef<THREE.Group>(null);
  const gate = useRef<THREE.MeshBasicMaterial>(null);
  const btn = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    t.current += dt;
    const T = t.current;
    // mysz jedzie w prawo i w lewo, więc wzór na zdjęciach płynie w przeciwną stronę
    const v = Math.sin(T * 0.6) * 0.06;
    deskTex.offset.x += v * dt * 6;
    imgA.offset.x = deskTex.offset.x * 0.05;
    imgB.offset.x = imgA.offset.x + Math.sign(v || 1) * 0.02;
    beam.opacity = 0.35 + 0.1 * Math.sin(T * 20);
    // kółko obraca się co kilka sekund, tarcza z nim; fotokomórka miga, gdy przez szczelinę przechodzi światło
    const a = sm(1, 2.4, T % 5) * Math.PI * 0.9 + Math.floor(T / 5) * Math.PI * 0.9;
    if (wheel.current) wheel.current.rotation.z = -a;
    if (gate.current) gate.current.color.set(Math.cos(a * 16) > 0 ? '#ff6b6b' : '#3a1414');
    // klik lewym przyciskiem co 5 s
    const c = T % 5;
    if (btn.current) btn.current.position.y = c > 3.4 && c < 3.7 ? -0.7 : 0;
  });
  const WX = -28;
  const WY = 20;
  return (
    <LabStage p={p} r={90}>
      <group position={[9, -66, 0]} scale={0.7}>
        {/* blat */}
        <mesh position={[-20, 0, -10]} rotation={[-Math.PI / 2, 0, 0]} material={deskMat}>
          <planeGeometry args={[200, 160]} />
        </mesh>
        {/* skorupa (połowa) i jej przekrój, spód ze ślizgaczami */}
        <mesh geometry={shell} material={shellMat} />
        <mesh geometry={base} material={n.plastic} />
        <Cut shape={cutShape} d={0.01} m={n.plastic} cut={n.cutPlastic} uv={0.08} />
        <Slab x0={-59} x1={-6} y0={0.8} y1={MB + 1.3} d={0.01} m={n.plastic} cut={n.cutPlastic} />
        <Slab x0={6} x1={59} y0={0.8} y1={MB + 1.3} d={0.01} m={n.plastic} cut={n.cutPlastic} />
        <Box p={[-48, 0.4, -14]} s={[11, 0.8, 22]} m={n.plasticWhite} />
        <Box p={[47, 0.4, -14]} s={[11, 0.8, 22]} m={n.plasticWhite} />
        {/* płytka drukowana */}
        <Slab x0={-46} x1={42} y0={10} y1={11.6} d={24} m={n.greenBoard} cut={n.cutBoard} />
        {/* soczewka w okienku spodu i czujnik nad nią */}
        <Slab x0={-6} x1={6} y0={0.6} y1={4.4} d={10} m={lensMat} />
        <mesh position={[0, 4.4, -4]} scale={[1, 0.5, 1]} material={lensMat}>
          <sphereGeometry args={[3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <Slab x0={-5} x1={5} y0={5.8} y1={10} d={9} m={n.chip} cut={n.cutPlastic} />
        {[-4, -1.3, 1.3, 4].map((x) => (
          <Box key={x} p={[x, 10.4, -8.5]} s={[0.6, 1, 0.6]} m={n.solder} />
        ))}
        {/* dioda i prowadnica światła; promień pada płasko na blat, odbity trafia przez soczewkę do czujnika */}
        <Slab x0={-17} x1={-12} y0={6.2} y1={10} d={6} m={n.tubeGlass} />
        <mesh position={[-14.5, 7.4, -3]} rotation={[0, 0, 0.9]}>
          <cylinderGeometry args={[1.6, 1.6, 3.4, 16]} />
          <meshBasicMaterial color="#ff4d4d" toneMapped={false} />
        </mesh>
        <Ray a={[-14, 6.6, -3]} b={[0, 0.2, -3]} m={beam} r={1.2} />
        <Ray a={[0, 0.2, -3]} b={[0, 5.8, -3]} m={beam} r={0.5} />
        {/* lewy przycisk: popychacz ze skorupy i mikroprzełącznik */}
        <Box p={[-42, 13.1, -6]} s={[9, 3, 6]} m={n.chip} />
        <group ref={btn}>
          <Box p={[-42, 15.1, -6]} s={[2, 1.2, 2]} m={n.plasticWhite} />
          <Box p={[-42, 16.6, -6]} s={[2.4, 1.8, 2.4]} m={n.plastic} />
        </group>
        {/* kółko z bieżnikiem, oś, tarcza z otworami i fotokomórka */}
        <group ref={wheel} position={[WX, WY, -4]}>
          <Cyl p={[0, 0, 0]} r={8.5} h={6} m={n.rubber} axis="z" seg={32} />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            return <Box key={i} p={[Math.cos(a) * 8.6, Math.sin(a) * 8.6, 0]} s={[0.9, 0.9, 6.2]} r={[0, 0, a]} m={n.chipGrey} />;
          })}
          <Cyl p={[0, 0, -6]} r={1} h={12} m={n.steel} axis="z" />
          <Cyl p={[0, 0, -10]} r={2.6} h={0.8} m={n.slotGrey} axis="z" />
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            return <Box key={'s' + i} p={[Math.cos(a) * 4.6, Math.sin(a) * 4.6, -10]} s={[4, 1.1, 0.8]} r={[0, 0, a]} m={n.slotGrey} />;
          })}
        </group>
        <Box p={[WX, WY + 4.6, -8.6]} s={[2.2, 2.2, 1.4]} m={n.chipGrey} />
        <mesh position={[WX, WY + 4.6, -11.6]}>
          <boxGeometry args={[2.2, 2.2, 1.4]} />
          <meshBasicMaterial ref={gate} color="#3a1414" toneMapped={false} />
        </mesh>
        <Box p={[WX, 15.6, -16.5]} s={[3, 8, 1.4]} m={n.plasticGrey} />
        {/* mikrokontroler i kabel */}
        <mesh position={[18, 12.4, -8]} material={mcuMat}>
          <boxGeometry args={[9, 1.6, 9]} />
        </mesh>
        <Cyl p={[-61, 12.5, -2]} r={2.4} h={6} m={n.rubber} axis="x" />
        <Tube
          pts={[
            [-46, 11.8, -2],
            [-60, 12.5, -2],
            [-72, 9, -2],
            [-80, 2, -2],
            [-92, 1.6, -2],
          ]}
          r={1.6}
          m={n.cable}
        />
        {/* dwa kolejne zdjęcia z czujnika */}
        {[
          [-24, frameA],
          [24, frameB],
        ].map(([x, m]) => (
          <group key={x as number} position={[x as number, 60, 0]}>
            <Box p={[0, 0, -0.6]} s={[28, 28, 0.8]} m={n.slot} />
            <mesh material={m as THREE.Material}>
              <planeGeometry args={[25, 25]} />
            </mesh>
          </group>
        ))}
        <mesh position={[1, 60, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[2.6, 5, 3]} />
          <meshBasicMaterial color="#fde68a" toneMapped={false} />
        </mesh>
        <Box p={[-3.5, 60, 0]} s={[6, 1.4, 0.4]} m={n.yellow} />

        <Lbl pos={[0, 79, 0]} sub color={LC.gold}>
          obraz z czujnika: ok. 10 000 zdjęć na sekundę
        </Lbl>
        <Lbl pos={[-24, 42.5, 0]} sub color={LC.part}>
          zdjęcie wcześniej
        </Lbl>
        <Lbl pos={[24, 42.5, 0]} sub color={LC.part}>
          zdjęcie teraz
        </Lbl>
        <Lbl pos={[-24, 3.5, 4]} sub color={LC.hot}>
          dioda oświetla blat
        </Lbl>
        <Lbl pos={[0, -5, 4]} sub color={LC.cold}>
          soczewka
        </Lbl>
        <Lbl pos={[14, 6.5, 4]} sub color={LC.part}>
          czujnik – mała kamera
        </Lbl>
        <Lbl pos={[-50, 23, 0]} sub color={LC.part}>
          mikroprzełącznik
        </Lbl>
        <Lbl pos={[WX, 33, 0]} sub color={LC.part}>
          kółko
        </Lbl>
        <Lbl pos={[-6, 22, -10]} sub color={LC.hot}>
          tarcza z otworami
        </Lbl>
        <Lbl pos={[22, 17, 0]} sub color={LC.violet}>
          mikrokontroler
        </Lbl>
        <Lbl pos={[47, -4.5, 0]} sub color={LC.part}>
          ślizgacze
        </Lbl>
      </group>
    </LabStage>
  );
}

