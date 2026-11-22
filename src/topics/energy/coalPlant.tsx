/*
 * Elektrownia węglowa – modele 3D: kotłownia z kotłem wieżowym (w przekroju widać komorę paleniskową, palniki
 * i pęczki rur), bunkrownia z młynami, maszynownia z turbozespołem (turbina WP, SP, dwie NP, generator), skraplacze,
 * rurociągi pary i wody, chłodnia kominowa, oczyszczanie spalin (DeNOx, elektrofiltr, odsiarczanie), komin,
 * skład węgla ze zwałowarką, pociągiem i taśmociągami, transformatory, rozdzielnia i linia 400 kV, teren.
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AH,
  AX,
  BANKS,
  BH,
  BOIL,
  BUNK,
  BURNER_Y,
  CRUSH,
  CT,
  DEAER,
  ESP,
  FGD,
  FGD_H,
  FGD_R,
  MILLS,
  MILL_Z,
  PILES,
  PYLONS,
  P_COAL,
  P_COOL_IN,
  P_COOL_OUT,
  P_CROSS,
  P_FEED,
  P_REHEAT_COLD,
  P_REHEAT_HOT,
  P_STEAM,
  RAIL_Z,
  RIVER_W,
  RIVER_Z,
  SCR,
  STACK,
  STACKER_Z,
  STACK_H,
  SWYARD,
  TH,
  TRAFO,
  TURB,
  UNLOAD,
  YARD,
  ctR,
  fbm,
  groundH,
  inPlant,
  rng,
  type V3,
} from './coalGeo';

/* ================= materiały ================= */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });

/** Tekstura blachy falistej (pionowe żłobienia) do ścian budynków. */
function cladTex(base: string, line: string) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 8);
  g.fillStyle = line;
  for (let i = 0; i < 64; i += 8) g.fillRect(i, 0, 2, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Ściany szczelne kotła: pionowe rury spawane płaskownikami. */
function tubeTex() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 4;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 8, 0);
  gr.addColorStop(0, '#2c3238');
  gr.addColorStop(0.5, '#7d8790');
  gr.addColorStop(1, '#2c3238');
  for (let i = 0; i < 32; i += 8) {
    g.fillStyle = gr;
    g.save();
    g.translate(i, 0);
    g.fillRect(0, 0, 8, 4);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let MATS: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const clad = cladTex('#d9dde0', '#b7bcc1');
  const cladBlue = cladTex('#4f7fae', '#3f6893');
  const tubes = tubeTex();
  return {
    clad: std('#ffffff', { map: clad, roughness: 0.6, side: THREE.DoubleSide }),
    cladBlue: std('#ffffff', { map: cladBlue, roughness: 0.6, side: THREE.DoubleSide }),
    tubes: std('#ffffff', { map: tubes, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
    tubesIn: std('#8a4a30', { map: tubes, metalness: 0.2, roughness: 0.6, side: THREE.BackSide, emissive: '#5a1c08', emissiveIntensity: 0.6 }),
    steel: std('#8e98a2', { metalness: 0.6, roughness: 0.4 }),
    steelDark: std('#4f5862', { metalness: 0.5, roughness: 0.5 }),
    frame: std('#6b7b8c', { metalness: 0.4, roughness: 0.6 }),
    concrete: std('#bdb9b0', { roughness: 0.95 }),
    concreteDs: std('#c9c5bc', { roughness: 0.95, side: THREE.DoubleSide }),
    concreteDark: std('#8f8b83', { roughness: 0.95 }),
    roof: std('#7a8088', { roughness: 0.8 }),
    casing: std('#a9b2bb', { metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }),
    casingIn: std('#5e666e', { metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }),
    gen: std('#2f62a3', { metalness: 0.3, roughness: 0.45 }),
    blade: std('#c9ced4', { metalness: 0.8, roughness: 0.25 }),
    shaft: std('#d7dbe0', { metalness: 0.9, roughness: 0.2 }),
    insul: std('#e4e1d8', { roughness: 0.85 }),
    steamPipe: std('#c9563b', { roughness: 0.6 }),
    rhPipe: std('#d98a3a', { roughness: 0.6 }),
    feedPipe: std('#3f7fc4', { roughness: 0.6 }),
    coolPipe: std('#2d6aa0', { roughness: 0.7 }),
    coal: std('#1f1f22', { roughness: 0.95 }),
    coalPile: std('#262627', { roughness: 1, flatShading: true }),
    yellow: std('#f2c230', { roughness: 0.5 }),
    orange: std('#e0782c', { roughness: 0.5 }),
    red: std('#c8382d', { roughness: 0.5 }),
    white: std('#f2f2ef', { roughness: 0.6 }),
    rail: std('#5a534c', { metalness: 0.4, roughness: 0.6 }),
    wagon: std('#5b3a2a', { roughness: 0.7 }),
    loco: std('#2f6f4a', { roughness: 0.5 }),
    trafo: std('#6f7a6a', { roughness: 0.6 }),
    glass: std('#9fd0f0', { transparent: true, opacity: 0.4, roughness: 0.1 }),
    water: new THREE.MeshStandardMaterial({ color: '#2f6d8f', roughness: 0.15, metalness: 0.1 }),
    shell: std('#d8d4cb', { roughness: 0.9, side: THREE.DoubleSide }),
    fill: std('#7d8a90', { roughness: 0.9 }),
    gypsum: std('#efeee8', { roughness: 0.95 }),
    tree: std('#3d5a30', { roughness: 1, flatShading: true }),
    trunk: std('#5b4330', { roughness: 1 }),
    cable: std('#1d2126', { roughness: 0.8 }),
    copper: std('#c8773a', { metalness: 0.7, roughness: 0.35 }),
    lamination: std('#3a3f46', { metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }),
    window: std('#9cc4de', { roughness: 0.15, metalness: 0.3, emissive: '#2a4152', emissiveIntensity: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#ff3020', emissive: '#ff2010', emissiveIntensity: 2, toneMapped: false }),
  };
}
export const M = () => (MATS ??= makeMats());

/* ================= pomocnicze ================= */

export function Box({ p, s, m, r }: { p: V3; s: V3; m: THREE.Material; r?: V3 }) {
  return (
    <mesh position={p} rotation={r} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}
/** Walec o osi x. */
export function CylX({ x0, x1, r, y = 0, z = 0, m, seg = 32, r2 }: { x0: number; x1: number; r: number; y?: number; z?: number; m: THREE.Material; seg?: number; r2?: number }) {
  return (
    <mesh position={[(x0 + x1) / 2, y, z]} rotation={[0, 0, -Math.PI / 2]} material={m}>
      <cylinderGeometry args={[r2 ?? r, r, Math.abs(x1 - x0), seg]} />
    </mesh>
  );
}
/** Pionowy walec. */
export function CylY({ p, r, h, m, seg = 32, r2 }: { p: V3; r: number; h: number; m: THREE.Material; seg?: number; r2?: number }) {
  return (
    <mesh position={[p[0], p[1] + h / 2, p[2]]} material={m}>
      <cylinderGeometry args={[r2 ?? r, r, h, seg]} />
    </mesh>
  );
}
/** Rura po łamanej. */
export function Pipe({ pts, r, m }: { pts: V3[]; r: number; m: THREE.Material }) {
  const geo = useMemo(() => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i - 1]), new THREE.Vector3(...pts[i])));
    return new THREE.TubeGeometry(path, pts.length * 6, r, 10, false);
  }, [pts, r]);
  return <mesh geometry={geo} material={m} />;
}
/** Belka (prostopadłościan) między dwoma punktami. */
export function Beam({ a, b, w, h = w, m }: { a: V3; b: V3; w: number; h?: number; m: THREE.Material }) {
  const { pos, q, len } = useMemo(() => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
    return { pos: A.clone().add(B).multiplyScalar(0.5), q, len: d.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={q} material={m}>
      <boxGeometry args={[len, h, w]} />
    </mesh>
  );
}
/** Wiele prostopadłościanów jednej barwy w jednej siatce. */
function Boxes({ list, m }: { list: [V3, V3][]; m: THREE.Material }) {
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, list.length);
    const o = new THREE.Object3D();
    list.forEach(([p, s], i) => {
      o.position.set(...p);
      o.scale.set(...s);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [list, m]);
  return <primitive object={mesh} />;
}

/** Ściana budynku z blachy (tekstura powtarzana co 4 m). */
function Wall({ p, s, m, u = 4 }: { p: V3; s: V3; m: THREE.MeshStandardMaterial; u?: number }) {
  const mat = useMemo(() => {
    const c = m.clone();
    if (m.map) {
      c.map = m.map.clone();
      c.map.needsUpdate = true;
      c.map.repeat.set(Math.max(s[0], s[2]) / u, s[1] / u);
    }
    return c;
  }, [m, s, u]);
  return (
    <mesh position={p} material={mat}>
      <boxGeometry args={s} />
    </mesh>
  );
}

/* ================= kotłownia i kocioł ================= */

/**
 * Kotłownia: stalowy szkielet obity blachą. `cut` – zdjęta ściana od strony kamery (+z) i część dachu, widać kocioł.
 */
export function BoilerHouse({ cut }: { cut: boolean }) {
  const m = M();
  const { x0, x1, z0, z1, h } = BH;
  const w = x1 - x0;
  const d = z1 - z0;
  const cols = useMemo(() => {
    const list: [V3, V3][] = [];
    for (let x = x0; x <= x1 + 0.1; x += 12)
      for (const z of [z0, 0, z1]) if (!cut || z <= 0 || x === x0 || x === x1) list.push([[x, h / 2, z], [0.9, h, 0.9]]);
    // stropy technologiczne (pomosty) co ok. 15 m – w przekroju widać ich krawędzie
    for (let y = 15; y < h - 5; y += 15) {
      list.push([[x0 + 2.5, y, cut ? z0 / 2 : 0], [5, 0.5, cut ? -z0 : d]]);
      list.push([[x1 - 2.5, y, cut ? z0 / 2 : 0], [5, 0.5, cut ? -z0 : d]]);
    }
    return list;
  }, [cut, x0, x1, z0, z1, h, d]);
  return (
    <group>
      <Boxes list={cols} m={m.frame} />
      <Wall p={[(x0 + x1) / 2, h / 2, z0]} s={[w, h, 0.4]} m={m.clad} />
      {!cut && <Wall p={[(x0 + x1) / 2, h / 2, z1]} s={[w, h, 0.4]} m={m.clad} />}
      {[x0, x1].map((x) => (
        <Wall key={x} p={[x, h / 2, cut ? z0 / 2 : 0]} s={[0.4, h, cut ? -z0 : d]} m={m.clad} />
      ))}
      {/* pas w kolorze firmowym pod dachem */}
      <Wall p={[(x0 + x1) / 2, h - 4, z0 - 0.1]} s={[w, 6, 0.5]} m={m.cladBlue} />
      {!cut && <Wall p={[(x0 + x1) / 2, h - 4, z1 + 0.1]} s={[w, 6, 0.5]} m={m.cladBlue} />}
      <Box p={[(x0 + x1) / 2, h + 0.4, cut ? z0 / 2 : 0]} s={[w + 1, 0.8, cut ? -z0 + 1 : d + 1]} m={m.roof} />
      {/* pasy okien na ścianach bocznych */}
      {[24, 50, 76, 98].map((y) =>
        [x0 - 0.25, x1 + 0.25].map((x) => <Box key={`${x}${y}`} p={[x, y, cut ? z0 / 2 : 0]} s={[0.12, 2.6, cut ? -z0 - 6 : d - 6]} m={m.window} />),
      )}
      {/* klatka schodowa z windą przy ścianie bocznej, wyższa od dachu */}
      <Wall p={[x1 + 5, (h + 8) / 2, z0 + 8]} s={[10, h + 8, 10]} m={m.cladBlue} />
      <Box p={[x1 + 10.1, (h + 8) / 2, z0 + 8]} s={[0.12, h + 2, 1.6]} m={m.window} />
      {/* wentylatory dachowe */}
      {[-18, -6, 6, 18].map((x) => (
        <CylY key={x} p={[x, h + 0.8, cut ? z0 / 2 : 0]} r={1.6} h={2.2} m={m.steel} />
      ))}
      {/* fundament */}
      <Box p={[(x0 + x1) / 2, 0.3, 0]} s={[w + 2, 0.6, d + 2]} m={m.concrete} />
    </group>
  );
}

/** Kocioł wieżowy: komora paleniskowa ze ścian rurowych, lej, palniki narożne i pęczki rur nad płomieniem. */
export function Boiler({ cut }: { cut: boolean }) {
  const m = M();
  const { half: a, y0, hop, y1 } = BOIL;
  const H = y1 - hop;
  const wallMat = useMemo(() => {
    const c = m.tubes.clone();
    c.map = m.tubes.map!.clone();
    c.map.needsUpdate = true;
    c.map.repeat.set((2 * a) / 0.8, 1);
    return c;
  }, [m, a]);
  // lej (dno komory) – ścięty ostrosłup
  const hopper = useMemo(() => {
    const g = new THREE.CylinderGeometry(a * Math.SQRT2, 2.5, hop - y0, 4, 1, true);
    g.rotateY(Math.PI / 4);
    return g;
  }, [a, hop, y0]);
  return (
    <group>
      {/* ściany komory: tylna i boczne zawsze, przednia tylko bez przekroju */}
      <mesh position={[0, hop + H / 2, -a]} material={wallMat}>
        <planeGeometry args={[2 * a, H]} />
      </mesh>
      {[-a, a].map((x) => (
        <mesh key={x} position={[x, hop + H / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={wallMat}>
          <planeGeometry args={[2 * a, H]} />
        </mesh>
      ))}
      {!cut && (
        <mesh position={[0, hop + H / 2, a]} material={wallMat}>
          <planeGeometry args={[2 * a, H]} />
        </mesh>
      )}
      <mesh geometry={hopper} position={[0, (y0 + hop) / 2, 0]} material={m.tubes} />
      {/* izolacja i blacha na zewnątrz komory (w przekroju widać jej grubość przy krawędziach) */}
      {[-a - 0.6, a + 0.6].map((x) => (
        <Box key={x} p={[x, hop + H / 2, cut ? -a / 2 : 0]} s={[1.0, H, cut ? a + 1.2 : 2 * a + 1.2]} m={m.insul} />
      ))}
      <Box p={[0, hop + H / 2, -a - 0.6]} s={[2 * a + 2.2, H, 1.0]} m={m.insul} />
      {/* palniki w narożach: 4 poziomy × 4 narożniki, skierowane stycznie do okręgu w środku komory */}
      {BURNER_Y.map((y) =>
        [
          [a, a],
          [-a, a],
          [-a, -a],
          [a, -a],
        ].map(([x, z], i) =>
          cut && z > 0 ? null : (
            <group key={`${y}${i}`} position={[x * 0.95, y, z * 0.95]} rotation={[0, Math.atan2(-z, x) + Math.PI + 0.25, 0]}>
              <Box p={[0.2, 0, 0]} s={[2.6, 1.2, 1.4]} m={m.steelDark} />
              <Box p={[-1.3, 0, 0]} s={[0.4, 1.4, 1.6]} m={m.orange} />
            </group>
          ),
        ),
      )}
      {/* pęczki rur nad paleniskiem (przegrzewacze i podgrzewacz wody) */}
      {BANKS.map(([name, b0, b1, col]) => (
        <TubeBank key={name} y0={b0} y1={b1} color={col} half={a} cut={cut} />
      ))}
      {/* sufit komory i wylot spalin u góry */}
      <Box p={[0, y1 + 0.5, 0]} s={[2 * a + 2, 1, 2 * a + 2]} m={m.insul} />
      {/* stalowy szkielet, na którym kocioł wisi (kocioł wydłuża się od ciepła o kilkadziesiąt cm – w dół) */}
      <Box p={[0, y1 + 6, 0]} s={[2 * a + 10, 1.6, 2.4]} m={m.frame} />
      <Box p={[0, y1 + 6, 0]} s={[2.4, 1.6, 2 * a + 10]} m={m.frame} />
    </group>
  );
}

/** Pęczek rur: poziome wężownice, ułożone gęsto jedna przy drugiej (w przekroju – rząd kółek). */
function TubeBank({ y0, y1, color, half, cut }: { y0: number; y1: number; color: string; half: number; cut: boolean }) {
  const mesh = useMemo(() => {
    const rows = Math.round((y1 - y0) / 0.9);
    const cols = 16;
    const n = rows * cols;
    const len = cut ? half : 2 * half;
    const g = new THREE.CylinderGeometry(0.22, 0.22, len, 10);
    g.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 });
    const im = new THREE.InstancedMesh(g, mat, n);
    const o = new THREE.Object3D();
    let k = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        o.position.set(-half + 0.7 + (c + (r % 2) * 0.5) * ((2 * half - 1.4) / cols), y0 + r * 0.9, cut ? -half / 2 : 0);
        o.updateMatrix();
        im.setMatrixAt(k++, o.matrix);
      }
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [y0, y1, color, half, cut]);
  return <primitive object={mesh} />;
}

/** Bunkrownia: zasobniki węgla nad młynami i pyłoprzewody do palników. */
export function Bunkers({ cut }: { cut: boolean }) {
  const m = M();
  const { x0, x1, z0, z1, h } = BUNK;
  return (
    <group>
      {!cut && <Wall p={[(x0 + x1) / 2, h / 2, z0]} s={[x1 - x0, h, 0.4]} m={m.clad} />}
      {[x0, x1].map((x) => (
        <Wall key={x} p={[x, h / 2, (z0 + z1) / 2]} s={[0.4, h, z1 - z0]} m={m.clad} />
      ))}
      <Box p={[(x0 + x1) / 2, h + 0.4, (z0 + z1) / 2]} s={[x1 - x0 + 1, 0.8, z1 - z0 + 1]} m={m.roof} />
      {MILLS.map((x) => (
        <group key={x}>
          {/* zasobnik: prostopadłościan z lejem */}
          <Box p={[x, 52, MILL_Z]} s={[7, 16, 8]} m={m.steel} />
          <mesh position={[x, 40, MILL_Z]} material={m.steel}>
            <cylinderGeometry args={[5, 1.2, 8, 4, 1]} />
          </mesh>
          {/* podajnik i młyn misowo-rolkowy */}
          <Box p={[x, 33, MILL_Z]} s={[1.2, 6, 1.2]} m={m.steelDark} />
          <CylY p={[x, 0.6, MILL_Z]} r={3.4} h={7} m={m.steelDark} />
          <mesh position={[x, 10.5, MILL_Z]} material={m.steel}>
            <cylinderGeometry args={[1.4, 3.4, 4, 24]} />
          </mesh>
          {/* silnik młyna */}
          <Box p={[x + 4.4, 1.6, MILL_Z]} s={[3, 2.2, 2]} m={m.gen} />
          {/* pyłoprzewody: z góry młyna do palników na ścianie kotła */}
          <Pipe pts={[[x, 12.5, MILL_Z], [x, 16, MILL_Z + 6], [x * 0.5, 22 + ((x + 22) / 45) * 15, -BOIL.half - 1.4]]} r={0.45} m={m.steel} />
        </group>
      ))}
      {/* taśmociąg nad zasobnikami */}
      <Box p={[(x0 + x1) / 2, 63, MILL_Z]} s={[x1 - x0 - 2, 1, 3]} m={m.steelDark} />
    </group>
  );
}

/* ================= maszynownia i turbozespół ================= */

/** Stopnie turbiny: [x, promień piasty, promień końca łopatki] – dla każdej części. */
function stagesOf(id: string, x: number, len: number, r: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  if (id === 'hp' || id === 'ip') {
    const n = id === 'hp' ? 9 : 8;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      out.push([x - len / 2 + 0.8 + k * (len - 1.6), 0.7, mix(r * 0.42, r * 0.72, k)]);
    }
  } else {
    // dwuprzepływowa część NP: para wpływa w środku i płynie w obie strony – łopatki rosną ku końcom
    for (const sg of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const k = i / 4;
        out.push([x + sg * (1.0 + k * (len / 2 - 2)), 1.0, mix(r * 0.45, r * 0.92, k * k)]);
      }
  }
  return out;
}
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Turbozespół: obudowy części turbiny, generator i wzbudnica na wspólnej osi. `open` – zdjęte górne połówki
 * obudów, widać wirniki z wieńcami łopatek. `spin()` – kąt obrotu wału (rad).
 */
export function TurbineSet({ open, spin, genOpen = false }: { open: boolean; spin: () => number; genOpen?: boolean }) {
  const m = M();
  const rotors = useRef<THREE.Group>(null);
  const blades = useMemo(() => {
    const list: { x: number; r0: number; r1: number }[] = [];
    for (const t of TURB) if (t.id !== 'gen' && t.id !== 'exc') for (const [x, r0, r1] of stagesOf(t.id, t.x, t.len, t.r)) list.push({ x, r0, r1 });
    const per = 36;
    const g = new THREE.BoxGeometry(0.18, 1, 0.42);
    const im = new THREE.InstancedMesh(g, m.blade, list.length * per);
    const o = new THREE.Object3D();
    let k = 0;
    for (const b of list)
      for (let j = 0; j < per; j++) {
        const a = (j / per) * Math.PI * 2;
        const rm = (b.r0 + b.r1) / 2;
        o.position.set(b.x, Math.cos(a) * rm, Math.sin(a) * rm);
        o.rotation.set(a, 0.35, 0);
        o.scale.set(1, b.r1 - b.r0, 1);
        o.updateMatrix();
        im.setMatrixAt(k++, o.matrix);
      }
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [m]);
  useFrame(() => {
    if (rotors.current) rotors.current.rotation.x = spin();
  });
  const half = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true, 0, Math.PI);
    g.rotateZ(-Math.PI / 2);
    return g;
  }, []);
  return (
    <group>
      {/* fundament – stół betonowy na słupach (drgania nie przenoszą się na budynek) */}
      <Box p={[-95, AX - 3.6, 0]} s={[90, 1.6, 14]} m={m.concrete} />
      {[-52, -66, -80, -95, -110, -125, -138].map((x) => (
        <group key={x}>
          <Box p={[x, (AX - 4.4) / 2, -5]} s={[2, AX - 4.4, 2]} m={m.concrete} />
          <Box p={[x, (AX - 4.4) / 2, 5]} s={[2, AX - 4.4, 2]} m={m.concrete} />
        </group>
      ))}
      <group position={[0, AX, 0]}>
        {TURB.map((t) => {
          const isGen = t.id === 'gen' || t.id === 'exc';
          if (t.id === 'gen' && genOpen) return <GeneratorCut key={t.id} x={t.x} len={t.len} r={t.r} />;
          return (
            <group key={t.id}>
              {open && !isGen ? (
                <>
                  <mesh geometry={half} position={[t.x, 0, 0]} scale={[t.len, t.r, t.r]} material={m.casingIn} />
                  {/* kołnierz poziomy podziału obudowy */}
                  {[-1, 1].map((sg) => (
                    <Box key={sg} p={[t.x, 0, sg * (t.r + 0.25)]} s={[t.len, 0.35, 0.6]} m={m.casing} />
                  ))}
                </>
              ) : (
                <CylX x0={t.x - t.len / 2} x1={t.x + t.len / 2} r={t.r} m={isGen ? m.gen : m.casing} seg={40} />
              )}
              {/* łożyska między częściami */}
              <Box p={[t.x + t.len / 2 + 0.8, -t.r * 0.4, 0]} s={[1.2, t.r * 0.9, Math.max(2.2, t.r * 0.9)]} m={m.steelDark} />
            </group>
          );
        })}
        {/* wał i wirniki */}
        <group ref={rotors}>
          <CylX x0={-60} x1={-139} r={0.55} m={m.shaft} />
          {open && <primitive object={blades} />}
          {genOpen && <GenRotor x={TURB.find((t) => t.id === 'gen')!.x} len={TURB.find((t) => t.id === 'gen')!.len} />}
          {/* bęben wirnika części NP (gruby wał z tarczami) */}
          {open &&
            TURB.filter((t) => t.id.startsWith('lp')).map((t) => <CylX key={t.id} x0={t.x - t.len / 2 + 1} x1={t.x + t.len / 2 - 1} r={1.0} m={m.shaft} />)}
        </group>
      </group>
      {/* skraplacze pod częściami NP */}
      {TURB.filter((t) => t.id.startsWith('lp')).map((t) => (
        <group key={t.id}>
          <Box p={[t.x, 5.4, 0]} s={[t.len - 1, 8.6, 12]} m={m.steel} />
          <CylX x0={t.x - t.len / 2} x1={t.x + t.len / 2} r={0.9} y={3} z={7.4} m={m.coolPipe} />
          <CylX x0={t.x - t.len / 2} x1={t.x + t.len / 2} r={0.9} y={3} z={-7.4} m={m.coolPipe} />
        </group>
      ))}
      {/* pompy wody zasilającej z silnikami */}
      {[-60, -70].map((x) => (
        <group key={x}>
          <CylX x0={x - 2.5} x1={x + 2.5} r={0.8} y={1.4} z={14} m={m.steel} />
          <CylX x0={x + 2.5} x1={x + 5.5} r={0.9} y={1.4} z={14} m={m.gen} />
        </group>
      ))}
    </group>
  );
}

/**
 * Generator w przekroju (zdjęta górna połowa obudowy): stojan z pakietu blach z miedzianymi prętami uzwojeń
 * w żłobkach i ich wygiętymi końcami (czołami), a w środku wirnik – elektromagnes (rysowany osobno, obraca się).
 */
function GeneratorCut({ x, len, r }: { x: number; len: number; r: number }) {
  const m = M();
  const half = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true, 0, Math.PI);
    g.rotateZ(-Math.PI / 2);
    return g;
  }, []);
  const bars = useMemo(() => {
    const n = 36;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.22, 0.22), m.copper, n);
    const o = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < n; i++) {
      // tylko dolna połowa (górna obudowa i stojan zdjęte)
      const a = Math.PI * (i + 0.5) / n;
      o.position.set(x, -Math.sin(a) * r * 0.6, Math.cos(a) * r * 0.6);
      o.rotation.set(-a, 0, 0);
      o.scale.set(len - 3.2, 1, 1);
      o.updateMatrix();
      im.setMatrixAt(k++, o.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [m, x, len, r]);
  const endW = useMemo(() => {
    const g = new THREE.TorusGeometry(r * 0.62, 0.32, 10, 40, Math.PI);
    g.rotateY(Math.PI / 2);
    g.rotateX(Math.PI);
    return g;
  }, [r]);
  return (
    <group>
      <mesh geometry={half} position={[x, 0, 0]} scale={[len, r, r]} material={m.gen} />
      <mesh geometry={half} position={[x, 0, 0]} scale={[len - 2.4, r * 0.88, r * 0.88]} material={m.lamination} />
      <mesh geometry={half} position={[x, 0, 0]} scale={[len - 2.4, r * 0.52, r * 0.52]} material={m.lamination} />
      <primitive object={bars} />
      {[-1, 1].map((sg) => (
        <mesh key={sg} geometry={endW} position={[x + sg * (len / 2 - 1.5), 0, 0]} material={m.copper} />
      ))}
      {[-1, 1].map((sg) => (
        <Box key={`f${sg}`} p={[x, 0, sg * (r + 0.25)]} s={[len, 0.35, 0.6]} m={m.gen} />
      ))}
    </group>
  );
}

/** Wirnik generatora: walec z miedzianymi zwojami w żłobkach – dwa bieguny elektromagnesu (N i S). */
function GenRotor({ x, len }: { x: number; len: number }) {
  const m = M();
  return (
    <group>
      <CylX x0={x - len / 2 + 1.6} x1={x + len / 2 - 1.6} r={1.15} m={m.shaft} seg={40} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return <Box key={i} p={[x, Math.cos(a) * 1.13, Math.sin(a) * 1.13]} s={[len - 3.6, 0.16, 0.5]} r={[a, 0, 0]} m={m.copper} />;
      })}
      {/* bieguny: czerwony N, niebieski S */}
      <Box p={[x, 1.2, 0]} s={[len - 3.8, 0.06, 0.9]} m={m.red} />
      <Box p={[x, -1.2, 0]} s={[len - 3.8, 0.06, 0.9]} m={m.feedPipe} />
    </group>
  );
}

/** Maszynownia: hala nad turbozespołem z suwnicą. `cut` – bez dachu i ściany od strony kamery. */
export function TurbineHall({ cut }: { cut: boolean }) {
  const m = M();
  const { x0, x1, z0, z1, h } = TH;
  const cols = useMemo(() => {
    const list: [V3, V3][] = [];
    for (let x = x0; x <= x1 + 0.1; x += 9) for (const z of cut ? [z0] : [z0, z1]) list.push([[x, h / 2, z], [0.8, h, 0.8]]);
    // tory suwnicy
    for (const z of cut ? [z0 + 1.2] : [z0 + 1.2, z1 - 1.2]) list.push([[(x0 + x1) / 2, h - 8, z], [x1 - x0, 1.2, 1.0]]);
    return list;
  }, [x0, x1, z0, z1, h, cut]);
  return (
    <group>
      <Boxes list={cols} m={m.frame} />
      <Wall p={[(x0 + x1) / 2, h / 2, z0]} s={[x1 - x0, h, 0.4]} m={m.clad} />
      {!cut && <Wall p={[(x0 + x1) / 2, h / 2, z1]} s={[x1 - x0, h, 0.4]} m={m.clad} />}
      <Wall p={[x0, h / 2, 0]} s={[0.4, h, z1 - z0]} m={m.clad} />
      {!cut && <Box p={[(x0 + x1) / 2, h + 1, 0]} s={[x1 - x0 + 1, 2, z1 - z0 + 1]} m={m.roof} />}
      {/* rzędy okien */}
      <Box p={[(x0 + x1) / 2, h - 3, z0 - 0.25]} s={[x1 - x0 - 4, 3, 0.1]} m={m.window} />
      <Box p={[(x0 + x1) / 2, 14, z0 - 0.25]} s={[x1 - x0 - 4, 2.4, 0.1]} m={m.window} />
      {!cut && <Box p={[(x0 + x1) / 2, h - 3, z1 + 0.25]} s={[x1 - x0 - 4, 3, 0.1]} m={m.window} />}
      {!cut && <Box p={[(x0 + x1) / 2, 14, z1 + 0.25]} s={[x1 - x0 - 4, 2.4, 0.1]} m={m.window} />}
      <Box p={[x0 - 0.25, h / 2, 0]} s={[0.1, h - 10, 8]} m={m.window} />
      {/* suwnica: most z wciągarką */}
      <Box p={[-100, h - 7, 0]} s={[3, 2, z1 - z0 - 2]} m={m.yellow} />
      <Box p={[-100, h - 8.4, 4]} s={[3.4, 1.6, 3]} m={m.orange} />
      {/* posadzka hali i podesty obsługi przy turbinie */}
      <Box p={[(x0 + x1) / 2, 0.3, 0]} s={[x1 - x0, 0.6, z1 - z0]} m={m.concreteDark} />
      <Box p={[-95, AX - 2.6, 10.5]} s={[90, 0.3, 6]} m={m.steelDark} />
      {/* łącznik z kotłownią (pomieszczenia odgazowywacza i rozdzielni) */}
      <Wall p={[(x1 + BH.x0) / 2, 22, -14]} s={[BH.x0 - x1, 44, 0.4]} m={m.clad} />
      <Box p={[(x1 + BH.x0) / 2, 44.5, cut ? -16 : 0]} s={[BH.x0 - x1, 1, cut ? 16 : 34]} m={m.roof} />
    </group>
  );
}

/** Rurociągi pary i wody (kolory: czerwony – para świeża, pomarańczowy – para wtórna, niebieski – woda). */
export function SteamPipes() {
  const m = M();
  return (
    <group>
      <Pipe pts={P_STEAM} r={0.8} m={m.steamPipe} />
      <Pipe pts={P_REHEAT_COLD} r={0.95} m={m.rhPipe} />
      <Pipe pts={P_REHEAT_HOT} r={0.95} m={m.steamPipe} />
      <Pipe pts={P_CROSS} r={1.4} m={m.insul} />
      <Pipe pts={P_FEED} r={0.55} m={m.feedPipe} />
      {/* odgazowywacz: poziomy zbiornik z kolumną */}
      <CylX x0={DEAER[0] - 9} x1={DEAER[0] + 9} r={2.6} y={DEAER[1]} z={DEAER[2]} m={m.steel} />
      <CylY p={[DEAER[0] - 4, DEAER[1] + 2, DEAER[2]]} r={1.4} h={5} m={m.steel} />
    </group>
  );
}

/* ================= chłodnia kominowa ================= */

/**
 * Chłodnia kominowa: żelbetowa powłoka w kształcie hiperboloidy na skośnych słupach, w środku zraszalnik
 * nad basenem. `cut` – połowa powłoki zdjęta.
 */
export function CoolingTower({ cut }: { cut: boolean }) {
  const m = M();
  const shell = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 60; i++) {
      const y = CT.yShell + ((CT.h - CT.yShell) * i) / 60;
      pts.push(new THREE.Vector2(ctR(y), y));
    }
    return new THREE.LatheGeometry(pts, 96, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2);
  }, [cut]);
  const legs = useMemo(() => {
    const list: [V3, V3][] = [];
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (cut && Math.sin(a) > 0.05) continue;
      for (const sg of [-1, 1]) {
        const a1 = a + sg * 0.065;
        const r0 = CT.rBase + 1.5;
        const r1 = ctR(CT.yShell);
        list.push([
          [Math.cos(a) * r0, 0, Math.sin(a) * r0],
          [Math.cos(a1) * r1, CT.yShell, Math.sin(a1) * r1],
        ]);
      }
    }
    return list;
  }, [cut]);
  return (
    <group position={[CT.x, 0, CT.z]}>
      <mesh geometry={shell} material={m.shell} />
      {legs.map(([a, b], i) => (
        <Beam key={i} a={a} b={b} w={0.9} m={m.concrete} />
      ))}
      {/* basen z wodą i zraszalnik */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]} material={m.water}>
        <circleGeometry args={[CT.rBase + 3, 64, 0, cut ? Math.PI : Math.PI * 2]} />
      </mesh>
      <mesh position={[0, 0.5, 0]} material={m.concrete}>
        <cylinderGeometry args={[CT.rBase + 4, CT.rBase + 4, 1.2, 64, 1, true, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2]} />
      </mesh>
      <mesh position={[0, 7.5, 0]} material={m.fill}>
        <cylinderGeometry args={[CT.rBase - 4, CT.rBase - 4, 3, 64, 1, false, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2]} />
      </mesh>
      {/* rury rozprowadzające wodę nad zraszalnikiem */}
      <Box p={[0, 10.5, cut ? -CT.rBase / 2 : 0]} s={[1.6, 1.2, cut ? CT.rBase : 2 * CT.rBase - 6]} m={m.coolPipe} />
      <Box p={[0, 10.5, 0]} s={[2 * CT.rBase - 6, 1.2, 1.6]} m={m.coolPipe} />
    </group>
  );
}

/* ================= spaliny ================= */

/** Kanał spalin (prostokątny) po łamanej. */
function Duct({ pts, w, h }: { pts: V3[]; w: number; h: number }) {
  const m = M();
  return (
    <>
      {pts.slice(1).map((b, i) => (
        <Beam key={i} a={pts[i]} b={b} w={w} h={h} m={m.steelDark} />
      ))}
    </>
  );
}

/**
 * Oczyszczanie spalin: reaktor DeNOx i podgrzewacz powietrza za kotłem, elektrofiltr (w przekroju – płyty
 * zbiorcze i elektrody), wentylator, absorber odsiarczania (w przekroju – poziomy zraszania), komin.
 */
export function FlueGasLine({ cutEsp, cutFgd }: { cutEsp: boolean; cutFgd: boolean }) {
  const m = M();
  return (
    <group>
      {/* kanał z góry kotła do reaktora DeNOx */}
      <Duct pts={[[0, 116, 0], [36, 116, 0], [SCR[0], 104, 0], [SCR[0], SCR[1] + 9, 0]]} w={8} h={7} />
      <Box p={SCR} s={[12, 16, 14]} m={m.steel} />
      {/* katalizator: warstwy kostek plastra miodu */}
      {[-4, 0, 4].map((y) => (
        <Box key={y} p={[SCR[0] + 6.1, SCR[1] + y, 0]} s={[0.2, 2.2, 12]} m={m.yellow} />
      ))}
      {/* obrotowy podgrzewacz powietrza */}
      <CylY p={[AH[0], AH[1] - 6, 0]} r={7} h={12} m={m.steelDark} />
      <Duct pts={[[AH[0], AH[1] - 4, 0], [ESP.x0, 16, 0]]} w={8} h={8} />
      {/* elektrofiltr */}
      <group>
        {cutEsp ? (
          <>
            {/* tylna ściana i ściana wylotowa (przednia połowa obudowy, dach i ściana wlotowa zdjęte) */}
            <Box p={[(ESP.x0 + ESP.x1) / 2, ESP.h / 2 + 6, ESP.z0]} s={[ESP.x1 - ESP.x0, ESP.h, 0.4]} m={m.casingIn} />
            <Box p={[ESP.x1, ESP.h / 2 + 6, ESP.z0 / 2]} s={[0.4, ESP.h, -ESP.z0]} m={m.casingIn} />
            {/* płyty zbiorcze (pionowe, wzdłuż przepływu) i elektrody między nimi */}
            {Array.from({ length: 9 }, (_, i) => (
              <Box key={i} p={[(ESP.x0 + ESP.x1) / 2, ESP.h / 2 + 6, -1.5 - i * 2.2]} s={[ESP.x1 - ESP.x0 - 4, ESP.h - 4, 0.1]} m={m.steel} />
            ))}
            {Array.from({ length: 9 }, (_, i) =>
              [0, 1, 2, 3, 4, 5, 6, 7].map((j) => <Box key={`${i}${j}`} p={[ESP.x0 + 4 + j * 5.5, ESP.h / 2 + 6, -2.6 - i * 2.2]} s={[0.08, ESP.h - 6, 0.08]} m={m.yellow} />),
            )}
          </>
        ) : (
          <Box p={[(ESP.x0 + ESP.x1) / 2, ESP.h / 2 + 6, 0]} s={[ESP.x1 - ESP.x0, ESP.h, ESP.z1 - ESP.z0]} m={m.clad} />
        )}
        {/* leje na popiół pod filtrem */}
        {[0, 1, 2, 3].map((i) =>
          [-1, 1].map((sg) =>
            cutEsp && sg > 0 ? null : (
              <mesh key={`${i}${sg}`} position={[ESP.x0 + 6 + i * 12, 3.5, sg * 11]} material={m.steel}>
                <cylinderGeometry args={[6.5, 1, 6, 4]} />
              </mesh>
            ),
          ),
        )}
        {/* nogi */}
        {[ESP.x0, ESP.x1].map((x) => [ESP.z0, ESP.z1].map((z) => <Box key={`${x}${z}`} p={[x, 3, z]} s={[1, 6, 1]} m={m.frame} />))}
      </group>
      {/* wentylator wyciągowy i kanał do absorbera */}
      <Duct pts={[[ESP.x1, 16, 0], [122, 10, 0], [FGD[0] - FGD_R, 10, 0]]} w={7} h={7} />
      <CylX x0={116} x1={124} r={4.5} y={10} z={8} m={m.gen} />
      {/* absorber odsiarczania */}
      <mesh position={[FGD[0], FGD_H / 2, 0]} material={cutFgd ? m.casingIn : m.white}>
        <cylinderGeometry args={[FGD_R, FGD_R, FGD_H, 48, 1, cutFgd, cutFgd ? Math.PI / 2 : 0, cutFgd ? Math.PI : Math.PI * 2]} />
      </mesh>
      {cutFgd &&
        [30, 35, 40].map((y) => (
          <group key={y}>
            <Box p={[FGD[0], y, -FGD_R / 2]} s={[2 * FGD_R - 2, 0.5, 0.5]} m={m.feedPipe} />
            {[-8, -4, 0, 4, 8].map((x) => (
              <Box key={x} p={[FGD[0] + x, y - 0.6, -FGD_R / 2]} s={[0.4, 0.7, 0.4]} m={m.steel} />
            ))}
          </group>
        ))}
      {/* zbiornik zawiesiny wapiennej na dole absorbera i pompy cyrkulacyjne */}
      {[0, 1, 2].map((i) => (
        <CylY key={i} p={[FGD[0] - 8 + i * 8, 0, FGD_R + 4]} r={1.4} h={3} m={m.feedPipe} />
      ))}
      <Duct pts={[[FGD[0], FGD_H, 0], [FGD[0], FGD_H + 4, 0], [STACK[0] - 14, FGD_H + 4, 0], [STACK[0] - 7, 36, 0]]} w={7} h={7} />
      {/* magazyn kamienia wapiennego (silos) i hala gipsu */}
      <CylY p={[FGD[0] - 22, 0, 32]} r={6} h={26} m={m.white} />
      <mesh position={[FGD[0] - 22, 26 + 2.5, 32]} material={m.white}>
        <coneGeometry args={[6, 5, 32]} />
      </mesh>
      <group position={[FGD[0] + 16, 0, 44]}>
        <Box p={[0, 7, 0]} s={[40, 14, 22]} m={m.clad} />
        <mesh position={[0, 14, 0]} rotation={[0, 0, Math.PI / 2]} material={m.roof}>
          <cylinderGeometry args={[11.5, 11.5, 40.5, 24, 1, false, 0, Math.PI]} />
        </mesh>
      </group>
    </group>
  );
}

/** Komin: żelbetowy trzon zwężający się ku górze, czerwono-białe pasy, światła przeszkodowe. */
export function Stack() {
  const m = M();
  return (
    <group position={STACK}>
      <mesh position={[0, STACK_H / 2, 0]} material={m.concrete}>
        <cylinderGeometry args={[5.2, 9, STACK_H, 40]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, STACK_H - 4 - i * 8, 0]} material={i % 2 ? m.white : m.red}>
          <cylinderGeometry args={[5.25 + i * 0.18, 5.4 + i * 0.18, 8, 40]} />
        </mesh>
      ))}
      {/* podesty z lampami */}
      {[STACK_H - 1, STACK_H * 0.66].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={m.steelDark}>
          <torusGeometry args={[5.9 + (STACK_H - y) * 0.021, 0.3, 6, 40]} />
        </mesh>
      ))}
      <Box p={[0, 1.5, 0]} s={[22, 3, 22]} m={m.concrete} />
    </group>
  );
}

/* ================= skład węgla i transport ================= */

/** Zwał węgla: wydłużona pryzma o łagodnych zboczach (kąt usypu ok. 35°). */
function Pile({ z, w, h }: { z: number; w: number; h: number }) {
  const m = M();
  const geo = useMemo(() => {
    const x0 = YARD.x0 + 12;
    const x1 = YARD.x1 - 12;
    const nx = 60;
    const nz = 16;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j <= nz; j++) {
        const x = x0 + ((x1 - x0) * i) / nx;
        const u = (j / nz) * 2 - 1;
        const ends = Math.min(1, (x - x0) / 14, (x1 - x) / 14);
        const prof = Math.max(0, 1 - Math.abs(u)) ** 0.9;
        const y = h * prof * Math.max(0, ends) * (0.88 + 0.12 * fbm(x / 20, z / 20 + j * 0.1)) + 0.2;
        pos.push(x, y, z + (u * w) / 2);
        if (i < nx && j < nz) {
          const a = i * (nz + 1) + j;
          idx.push(a, a + 1, a + nz + 1, a + 1, a + nz + 2, a + nz + 1);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [z, w, h]);
  return <mesh geometry={geo} material={m.coalPile} />;
}

/** Zwałowarko-ładowarka: suwnica na szynach z wysięgnikiem i kołem czerpakowym. `at()` – położenie x. */
function Stacker({ at }: { at: () => number }) {
  const m = M();
  const ref = useRef<THREE.Group>(null);
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.position.x = at();
    if (wheel.current) wheel.current.rotation.z -= dt * 0.8;
  });
  return (
    <group ref={ref} position={[200, 0, STACKER_Z]}>
      {[-4, 4].map((z) => (
        <Box key={z} p={[0, 1.2, z]} s={[10, 2.4, 1.6]} m={m.steelDark} />
      ))}
      <Box p={[0, 5, 0]} s={[8, 5, 9]} m={m.yellow} />
      <Box p={[0, 11, 0]} s={[3, 7, 3]} m={m.yellow} />
      {/* wysięgnik nad zwał i koło czerpakowe na końcu */}
      <Beam a={[0, 12, 0]} b={[0, 9, -32]} w={2.2} h={2.2} m={m.yellow} />
      <Beam a={[0, 16, 2]} b={[0, 9.5, -30]} w={0.3} m={m.cable} />
      <group ref={wheel} position={[0, 8.5, -33]} rotation={[0, Math.PI / 2, 0]}>
        <mesh material={m.orange}>
          <torusGeometry args={[4, 0.4, 8, 24]} />
        </mesh>
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <Box key={i} p={[Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0]} s={[1.2, 1.2, 1.4]} r={[0, 0, a]} m={m.steelDark} />;
        })}
      </group>
      {/* przeciwwaga */}
      <Beam a={[0, 12, 0]} b={[0, 11, 14]} w={1.6} m={m.yellow} />
      <Box p={[0, 10, 14]} s={[4, 4, 4]} m={m.concreteDark} />
    </group>
  );
}

/** Taśmociąg w krytej galerii po łamanej, na podporach. */
function Conveyor({ pts }: { pts: V3[] }) {
  const m = M();
  const sup = useMemo(() => {
    const list: [V3, V3][] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const n = Math.floor(len / 22);
      for (let k = 1; k <= n; k++) {
        const u = k / (n + 1);
        const y = a[1] + (b[1] - a[1]) * u;
        if (y < 5) continue;
        list.push([[a[0] + (b[0] - a[0]) * u, y / 2, a[2] + (b[2] - a[2]) * u], [1.2, y, 3]]);
      }
    }
    return list;
  }, [pts]);
  return (
    <group>
      {pts.slice(1).map((b, i) => (
        <Beam key={i} a={pts[i]} b={b} w={4.2} h={3.6} m={m.clad} />
      ))}
      <Boxes list={sup} m={m.frame} />
    </group>
  );
}

/** Pociąg z węglem: lokomotywa i wagony samowyładowcze. `x()` – położenie czoła. */
export function Train({ x, n = 24 }: { x: () => number; n?: number }) {
  const m = M();
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.x = x();
  });
  return (
    <group ref={ref} position={[0, 0, RAIL_Z]}>
      <Box p={[0, 2.8, 0]} s={[20, 3.8, 3.1]} m={m.loco} />
      <Box p={[-7, 5.2, 0]} s={[4, 1.4, 3]} m={m.loco} />
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[22 + i * 14.2, 0, 0]}>
          <Box p={[0, 1.2, 0]} s={[13.4, 0.8, 2.8]} m={m.steelDark} />
          <Box p={[0, 3, 0]} s={[12.6, 3, 3.1]} m={m.wagon} />
          <Box p={[0, 4.55, 0]} s={[12, 0.3, 2.7]} m={m.coal} />
        </group>
      ))}
    </group>
  );
}

/** Skład węgla: zwały, zwałowarka, tor, rozładunek, kruszarnia i taśmociągi do bunkrowni. */
export function CoalYard({ stackerX }: { stackerX: () => number }) {
  const m = M();
  return (
    <group>
      {PILES.map((p) => (
        <Pile key={p.z} {...p} />
      ))}
      {/* tory zwałowarki */}
      {[-4, 4].map((z) => (
        <Box key={z} p={[(YARD.x0 + YARD.x1) / 2, 0.3, STACKER_Z + z]} s={[YARD.x1 - YARD.x0, 0.4, 0.4]} m={m.rail} />
      ))}
      <Stacker at={stackerX} />
      {/* tor kolejowy z podkładami */}
      {[-0.75, 0.75].map((z) => (
        <Box key={z} p={[150, 0.4, RAIL_Z + z]} s={[900, 0.25, 0.15]} m={m.rail} />
      ))}
      <Box p={[150, 0.15, RAIL_Z]} s={[900, 0.3, 3.6]} m={m.concreteDark} />
      {/* rozładunek wagonów: hala nad torem z lejami pod spodem */}
      <group position={[UNLOAD[0], 0, RAIL_Z]}>
        <Box p={[0, 9, -6]} s={[34, 18, 0.5]} m={m.clad} />
        <Box p={[0, 9, 6]} s={[34, 18, 0.5]} m={m.clad} />
        <Box p={[0, 18.3, 0]} s={[35, 0.6, 13]} m={m.roof} />
      </group>
      {/* kruszarnia */}
      <Box p={[CRUSH[0], 14, CRUSH[2]]} s={[16, 28, 14]} m={m.clad} />
      <Conveyor pts={[[UNLOAD[0], 6, RAIL_Z - 6], [UNLOAD[0], 6, STACKER_Z + 10]]} />
      <Conveyor pts={P_COAL.slice(3)} />
    </group>
  );
}

/* ================= sieć ================= */

/** Słup kratowy linii 400 kV. */
function Pylon({ p }: { p: V3 }) {
  const m = M();
  const h = 46;
  return (
    <group position={p}>
      {[
        [-3, -3],
        [3, -3],
        [-3, 3],
        [3, 3],
      ].map(([x, z], i) => (
        <Beam key={i} a={[x * 1.6, 0, z * 1.6]} b={[x * 0.3, h, z * 0.3]} w={0.4} m={m.steel} />
      ))}
      {[22, 34, 44].map((y, i) => (
        <Box key={y} p={[0, y, 0]} s={[1, 0.6, 22 - i * 4]} m={m.steel} />
      ))}
    </group>
  );
}

/** Transformatory blokowe, rozdzielnia 400 kV z bramkami i linia do sieci. */
export function Grid() {
  const m = M();
  const wires = useMemo(() => {
    const segs: V3[][] = [];
    const pts: V3[] = [[SWYARD.x0 + 10, 30, 20], ...PYLONS.map((p) => [p[0], 44, p[2]] as V3)];
    for (const dz of [-10, 0, 10]) {
      const line: V3[] = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        for (let k = 0; k <= 16; k++) {
          const u = k / 16;
          line.push([mix(a[0], b[0], u), mix(a[1], b[1], u) - 6 * 4 * u * (1 - u), mix(a[2], b[2], u) + dz]);
        }
      }
      segs.push(line);
    }
    return segs;
  }, []);
  return (
    <group>
      {/* trzy jednofazowe transformatory blokowe z chłodnicami */}
      {[0, 1, 2].map((i) => (
        <group key={i} position={[TRAFO[0] + i * 12, 0, TRAFO[2]]}>
          <Box p={[0, 5, 0]} s={[7, 8, 5]} m={m.trafo} />
          <Box p={[0, 5, 4.2]} s={[6, 7, 3]} m={m.steelDark} />
          {[-2, 0, 2].map((x) => (
            <CylY key={x} p={[x, 9, -1]} r={0.35} h={4} m={m.white} />
          ))}
          <Box p={[0, 0.3, 0]} s={[10, 0.6, 12]} m={m.concrete} />
        </group>
      ))}
      {/* rozdzielnia: bramki z izolatorami i aparatura */}
      <Box p={[(SWYARD.x0 + SWYARD.x1) / 2, 0.05, (SWYARD.z0 + SWYARD.z1) / 2]} s={[SWYARD.x1 - SWYARD.x0, 0.1, SWYARD.z1 - SWYARD.z0]} m={m.gypsum} />
      {[SWYARD.x0 + 10, SWYARD.x0 + 45, SWYARD.x1 - 10].map((x) => (
        <group key={x}>
          {[-40, 0, 40].map((z) => (
            <Box key={z} p={[x, 13, z]} s={[1, 26, 1]} m={m.steel} />
          ))}
          <Box p={[x, 26, 0]} s={[1, 1, 82]} m={m.steel} />
        </group>
      ))}
      {Array.from({ length: 6 }, (_, i) =>
        [-20, 0, 20].map((z) => <CylY key={`${i}${z}`} p={[SWYARD.x0 + 18 + i * 10, 0, z]} r={0.5} h={7} m={m.white} />),
      )}
      {PYLONS.map((p, i) => (
        <Pylon key={i} p={p} />
      ))}
      {wires.map((w, i) => (
        <Pipe key={i} pts={w} r={0.12} m={m.cable} />
      ))}
      {/* przewody od transformatora do rozdzielni */}
      <Pipe pts={[[TRAFO[0] + 12, 12, TRAFO[2]], [-190, 22, 34], [SWYARD.x1 - 10, 26, 20]]} r={0.15} m={m.cable} />
    </group>
  );
}

/* ================= pozostałe budynki i teren ================= */

/** Budynki pomocnicze: nastawnia, biura, stacja uzdatniania wody, silosy popiołu. */
export function Aux() {
  const m = M();
  return (
    <group>
      {/* nastawnia blokowa i biurowiec */}
      <Box p={[-10, 9, 56]} s={[44, 18, 18]} m={m.clad} />
      <Box p={[-10, 13, 65.2]} s={[40, 6, 0.3]} m={m.glass} />
      <Box p={[60, 7, 70]} s={[30, 14, 16]} m={m.cladBlue} />
      {/* silosy popiołu */}
      {[0, 1, 2].map((i) => (
        <group key={i} position={[96 + i * 13, 0, -48]}>
          <CylY p={[0, 6, 0]} r={5} h={22} m={m.concrete} />
          <Box p={[0, 3, 0]} s={[8, 6, 8]} m={m.concreteDark} />
        </group>
      ))}
      {/* stacja uzdatniania wody: zbiorniki */}
      {[0, 1, 2, 3].map((i) => (
        <CylY key={i} p={[-180 + i * 14, 0, -110]} r={5} h={12} m={m.white} />
      ))}
      {/* pompownia wody chłodzącej przy chłodni */}
      <Box p={[-80, 5, -140]} s={[20, 10, 14]} m={m.clad} />
      <Pipe pts={P_COOL_OUT} r={1.6} m={m.coolPipe} />
      <Pipe pts={P_COOL_IN} r={1.6} m={m.coolPipe} />
    </group>
  );
}

let GROUND_TEX: THREE.Texture | null = null;
function groundTexture() {
  const S = 2048;
  const ext = 2600;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const px = (v: number) => ((v + ext / 2) / ext) * S;
  const sc = S / ext;
  const r = rng(11);
  g.fillStyle = '#7d8a4f';
  g.fillRect(0, 0, S, S);
  // pola uprawne w pasach
  for (let i = 0; i < 260; i++) {
    const x = r() * ext - ext / 2;
    const z = r() * ext - ext / 2;
    const w = 60 + r() * 200;
    const h = 20 + r() * 60;
    const cols = ['#8e9a55', '#a7a463', '#6f7f44', '#b5a874', '#7c8e4a', '#9a8a5a'];
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.save();
    g.translate(px(x), px(z));
    g.rotate(0.18);
    g.fillRect(0, 0, w * sc, h * sc);
    g.restore();
  }
  // teren elektrowni: beton i asfalt
  g.fillStyle = '#a9a69e';
  g.fillRect(px(-320), px(-300), 700 * sc, 560 * sc);
  g.fillStyle = '#8f8c86';
  g.fillRect(px(-300), px(-70), 640 * sc, 6 * sc);
  g.fillRect(px(-300), px(48), 640 * sc, 6 * sc);
  g.fillRect(px(60), px(-290), 6 * sc, 540 * sc);
  // skład węgla – ciemna, zapylona ziemia
  g.fillStyle = '#4a4741';
  g.fillRect(px(YARD.x0), px(YARD.z0), (YARD.x1 - YARD.x0) * sc, (YARD.z1 - YARD.z0) * sc);
  // rzeka
  g.fillStyle = '#3e6f86';
  g.fillRect(0, px(RIVER_Z - RIVER_W / 2), S, RIVER_W * sc);
  g.fillStyle = '#6f8a5a';
  g.fillRect(0, px(RIVER_Z - RIVER_W / 2 - 6), S, 6 * sc);
  g.fillRect(0, px(RIVER_Z + RIVER_W / 2), S, 6 * sc);
  // droga dojazdowa
  g.strokeStyle = '#6a6964';
  g.lineWidth = 9 * sc;
  g.beginPath();
  g.moveTo(px(-10), px(80));
  g.lineTo(px(-60), px(700));
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Teren: równina z polami, plac elektrowni, rzeka; dalej mgła. */
export function Ground() {
  const tex = useMemo(() => (GROUND_TEX ??= groundTexture()), []);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(2600, 2600, 160, 160);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)) - 0.05);
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial map={tex} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.8, RIVER_Z]}>
        <planeGeometry args={[2600, RIVER_W]} />
        <meshStandardMaterial color="#3a6f8c" roughness={0.15} metalness={0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -40, 0]}>
        <ringGeometry args={[1300, 6000, 32, 1]} />
        <meshStandardMaterial color="#7a8650" roughness={1} />
      </mesh>
    </group>
  );
}

/** Drzewa wokół elektrowni (las i zadrzewienia przy drogach). */
export function Trees() {
  const m = M();
  const { crowns, trunks } = useMemo(() => {
    const r = rng(21);
    const pts: V3[] = [];
    while (pts.length < 700) {
      const x = r() * 2200 - 1100;
      const z = r() * 2200 - 1100;
      if (inPlant(x, z) || Math.abs(z - RIVER_Z) < RIVER_W / 2 + 8) continue;
      if (fbm(x / 260, z / 260) < 0.52 && Math.abs(z - RIVER_Z) > 60) continue;
      pts.push([x, groundH(x, z), z]);
    }
    const cg = new THREE.ConeGeometry(4, 12, 7);
    const tg = new THREE.CylinderGeometry(0.4, 0.5, 4, 5);
    const crowns = new THREE.InstancedMesh(cg, m.tree, pts.length);
    const trunks = new THREE.InstancedMesh(tg, m.trunk, pts.length);
    const o = new THREE.Object3D();
    pts.forEach(([x, y, z], i) => {
      const s = 0.8 + r() * 0.7;
      o.position.set(x, y + 2 * s, z);
      o.scale.setScalar(s);
      o.updateMatrix();
      trunks.setMatrixAt(i, o.matrix);
      o.position.set(x, y + 9 * s, z);
      o.updateMatrix();
      crowns.setMatrixAt(i, o.matrix);
    });
    return { crowns, trunks };
  }, [m]);
  return (
    <>
      <primitive object={crowns} />
      <primitive object={trunks} />
    </>
  );
}

/** Grupa z przesunięciem – pomocnicze. */
export function At({ p, children }: { p: V3; children: ReactNode }) {
  return <group position={p}>{children}</group>;
}

/** Światła przeszkodowe (czerwone, migające) na kominie, kotłowni i chłodni. */
export function AviationLights() {
  const m = M();
  const pts = useMemo<V3[]>(() => {
    const list: V3[] = [];
    for (const a of [0, 1, 2, 3]) {
      const ang = (a / 4) * Math.PI * 2 + 0.4;
      list.push([STACK[0] + Math.cos(ang) * 6, STACK_H + 0.6, STACK[2] + Math.sin(ang) * 6]);
      list.push([STACK[0] + Math.cos(ang) * 7.6, STACK_H * 0.66 + 0.5, STACK[2] + Math.sin(ang) * 7.6]);
      list.push([CT.x + Math.cos(ang) * (CT.rTop + 0.4), CT.h + 0.6, CT.z + Math.sin(ang) * (CT.rTop + 0.4)]);
    }
    for (const x of [BH.x0, BH.x1]) for (const z of [BH.z0, BH.z1]) list.push([x, BH.h + 1.4, z]);
    return list;
  }, []);
  const mat = m.lamp;
  useFrame(({ clock }) => {
    // miganie ok. 40 razy na minutę
    mat.emissiveIntensity = Math.sin(clock.elapsedTime * 4.2) > 0.2 ? 3 : 0.3;
  });
  return (
    <>
      {pts.map((p, i) => (
        <mesh key={i} position={p} material={mat}>
          <sphereGeometry args={[0.7, 10, 8]} />
        </mesh>
      ))}
    </>
  );
}
