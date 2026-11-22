/*
 * Elektrownia jądrowa – modele 3D: budynek osłonowy z betonu ze zbiornikiem wody na dachu, stalowa obudowa
 * bezpieczeństwa, w środku zbiornik reaktora z rdzeniem (kasety paliwowe, pręty sterujące), dwie wytwornice
 * pary, stabilizator ciśnienia, pompy i rurociągi obiegu pierwotnego, suwnica; budynek pomocniczy z basenem
 * wypalonego paliwa, magazyn suchy, agregaty diesla, pompownia wody morskiej, plaża, wydmy i morze.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Beam, Box, CylX, CylY, M, Pipe } from './coalPlant';
import { dotTex } from './coalFx';
import {
  ASSEMBLIES,
  AUX,
  BEACH,
  CASKS,
  CORE,
  CRANE_Y,
  CV,
  DECK_Y,
  DIESEL,
  INTAKE,
  OUTFALL,
  POOL,
  PUMP,
  PZR,
  RCP_DZ,
  RPV,
  SEA_Z,
  SG,
  SHIELD,
  TRANSFER_Y,
  fbm,
  groundH,
  hasRod,
  inPlant,
  rng,
  type V3,
} from './nuclearGeo';
import { AX } from './coalGeo';

/* ================= materiały ================= */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
let NM: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  return {
    concrete: std('#d4d1c9', { roughness: 0.9, side: THREE.DoubleSide }),
    concreteIn: std('#a9a59c', { roughness: 0.95, side: THREE.DoubleSide }),
    steelShell: std('#8f9aa5', { metalness: 0.55, roughness: 0.4, side: THREE.DoubleSide }),
    steelGhost: std('#8f9aa5', { metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }),
    vessel: std('#6d7782', { metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }),
    vesselIn: std('#c9cdd2', { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }),
    sg: std('#d9dce0', { metalness: 0.4, roughness: 0.45, side: THREE.DoubleSide }),
    hot: std('#d2452e', { roughness: 0.5 }),
    cold: std('#3f7fc4', { roughness: 0.5 }),
    fuel: new THREE.MeshStandardMaterial({ color: '#b3bcc6', metalness: 0.6, roughness: 0.35, emissive: '#2a7fff', emissiveIntensity: 0.25 }),
    rod: std('#2b2f35', { metalness: 0.5, roughness: 0.4 }),
    water: new THREE.MeshStandardMaterial({ color: '#2f8fd8', transparent: true, opacity: 0.16, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
    pool: new THREE.MeshStandardMaterial({ color: '#1f7fd0', transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false, emissive: '#0a3a8a', emissiveIntensity: 0.6 }),
    rack: std('#7d8892', { metalness: 0.6, roughness: 0.4 }),
    tank: std('#cfd3d6', { roughness: 0.6 }),
    deck: std('#7a8088', { roughness: 0.8 }),
    yellow: std('#f2c230', { roughness: 0.5 }),
    orange: std('#e0782c', { roughness: 0.5 }),
    sand: std('#e2d3a6', { roughness: 1 }),
    sea: new THREE.MeshStandardMaterial({ color: '#2b6f93', transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.1 }),
    seabed: std('#b9a883', { roughness: 1 }),
    cask: std('#9aa0a6', { metalness: 0.4, roughness: 0.5 }),
    copper: std('#c8773a', { metalness: 0.7, roughness: 0.35 }),
    red: std('#c8382d', { roughness: 0.5 }),
    pine: std('#2f4a2a', { roughness: 1, flatShading: true }),
    trunk: std('#6b4a30', { roughness: 1 }),
  };
}
export const NMAT = () => (NM ??= makeMats());

/* ================= budynek reaktora ================= */

/** Walec z wycięciem: pełny albo tylna połowa (z < 0) przy przekroju. */
function Shell({ r, y0, y1, m, cut, seg = 64 }: { r: number; y0: number; y1: number; m: THREE.Material; cut: boolean; seg?: number }) {
  return (
    <mesh position={[0, (y0 + y1) / 2, 0]} material={m}>
      <cylinderGeometry args={[r, r, y1 - y0, seg, 1, true, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2]} />
    </mesh>
  );
}
/** Kopuła (część sfery) nad y0 o wysokości h i promieniu podstawy r. */
function Dome({ r, y0, h, m, cut }: { r: number; y0: number; h: number; m: THREE.Material; cut: boolean }) {
  const geo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r + 0.001, Math.sin(a) * h));
    }
    return new THREE.LatheGeometry(pts.reverse(), 64, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2);
  }, [r, h, cut]);
  return <mesh geometry={geo} position={[0, y0, 0]} material={m} />;
}

/**
 * Budynek osłonowy: betonowy walec z dachem w kształcie stożka, na dachu pierścieniowy zbiornik wody do biernego
 * chłodzenia obudowy i komin wylotu powietrza. W środku – stalowa obudowa bezpieczeństwa. `cut` – połowa od strony
 * kamery (+z) zdjęta.
 */
export function ReactorBuilding({ cut, ghost = false }: { cut: boolean; ghost?: boolean }) {
  const n = NMAT();
  const steel = ghost ? n.steelGhost : n.steelShell;
  const roof = useMemo(() => {
    const pts = [new THREE.Vector2(SHIELD.r, SHIELD.h), new THREE.Vector2(SHIELD.tankR + 1, SHIELD.tankY0), new THREE.Vector2(0.01, SHIELD.tankY0 + 0.5)];
    return new THREE.LatheGeometry(pts.reverse(), 64, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2);
  }, [cut]);
  return (
    <group>
      {/* budynek osłonowy */}
      <Shell r={SHIELD.r} y0={0} y1={SHIELD.h} m={n.concrete} cut={cut} />
      <Shell r={SHIELD.r - SHIELD.t} y0={0} y1={SHIELD.h} m={n.concreteIn} cut={cut} />
      {/* wloty powietrza pod dachem (ciemny pas otworów) */}
      <Shell r={SHIELD.r + 0.05} y0={SHIELD.h - 4} y1={SHIELD.h - 1.5} m={NMAT().rod} cut={cut} />
      <mesh geometry={roof} material={n.concrete} />
      {/* zbiornik wody biernego chłodzenia i komin wylotu powietrza */}
      <Shell r={SHIELD.tankR} y0={SHIELD.tankY0} y1={SHIELD.tankY1} m={n.concrete} cut={cut} />
      <Dome r={SHIELD.tankR} y0={SHIELD.tankY1} h={3} m={n.concrete} cut={cut} />
      <Shell r={4.5} y0={SHIELD.tankY1} y1={SHIELD.stackTop} m={n.concrete} cut={cut} />
      {cut && (
        <mesh position={[0, (SHIELD.tankY0 + SHIELD.tankY1) / 2 - 1, 0]} material={n.water}>
          <cylinderGeometry args={[SHIELD.tankR - 0.6, SHIELD.tankR - 0.6, 7, 48, 1, false, Math.PI / 2, Math.PI]} />
        </mesh>
      )}
      {/* stalowa obudowa bezpieczeństwa */}
      <Shell r={CV.r} y0={0} y1={CV.h} m={steel} cut={cut} />
      <Dome r={CV.r} y0={CV.h} h={CV.domeH} m={steel} cut={cut} />
      {/* fundament */}
      <mesh position={[0, -1, 0]} material={n.concreteIn}>
        <cylinderGeometry args={[SHIELD.r + 1, SHIELD.r + 1, 2, 64]} />
      </mesh>
    </group>
  );
}

/** Tekstura boku kasety: pionowe pręty paliwowe i ciemne szczeliny między nimi, poziome kratki dystansowe. */
let FUEL_TEX: THREE.Texture | null = null;
function fuelTex() {
  if (FUEL_TEX) return FUEL_TEX;
  const c = document.createElement('canvas');
  c.width = 68;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b3138';
  g.fillRect(0, 0, 68, 128);
  for (let i = 0; i < 17; i++) {
    const gr = g.createLinearGradient(i * 4, 0, i * 4 + 4, 0);
    gr.addColorStop(0, '#6f7a85');
    gr.addColorStop(0.5, '#d5dbe1');
    gr.addColorStop(1, '#6f7a85');
    g.fillStyle = gr;
    g.fillRect(i * 4 + 0.4, 0, 3.2, 128);
  }
  g.fillStyle = '#c3c9cf';
  for (const y of [6, 34, 62, 90, 118]) g.fillRect(0, y, 68, 3);
  FUEL_TEX = new THREE.CanvasTexture(c);
  FUEL_TEX.colorSpace = THREE.SRGBColorSpace;
  return FUEL_TEX;
}

/**
 * Rdzeń: kasety paliwowe (pręty w kratkach dystansowych, głowice u góry i u dołu), wiązki prętów sterujących
 * wsuwane od góry (`rods()` – wsunięcie 0…1; wsunięta część kasety ciemnieje).
 */
export function Core({ rods, cut, glow }: { rods: () => number; cut: boolean; glow: () => number }) {
  const n = NMAT();
  const H = CORE.y1 - CORE.y0;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: fuelTex(), metalness: 0.5, roughness: 0.4, emissive: '#2a7fff', emissiveIntensity: 0.05 }), []);
  const { fuel, nozzles, rodMesh, rodIdx } = useMemo(() => {
    const list = ASSEMBLIES.map((p, k) => ({ p, k })).filter(({ p }) => !cut || p[1] <= 0.12);
    const w = CORE.pitch * 0.86;
    const fuel = new THREE.InstancedMesh(new THREE.BoxGeometry(w, H, w), mat, list.length);
    const nozzles = new THREE.InstancedMesh(new THREE.BoxGeometry(w * 1.02, 0.2, w * 1.02), n.vessel, list.length * 2);
    const o = new THREE.Object3D();
    list.forEach(({ p }, i) => {
      o.position.set(p[0], CORE.y0 + H / 2, p[1]);
      o.updateMatrix();
      fuel.setMatrixAt(i, o.matrix);
      for (const [j, y] of [
        [0, CORE.y0 - 0.1],
        [1, CORE.y1 + 0.1],
      ]) {
        o.position.set(p[0], y, p[1]);
        o.updateMatrix();
        nozzles.setMatrixAt(i * 2 + j, o.matrix);
      }
    });
    fuel.instanceMatrix.needsUpdate = true;
    nozzles.instanceMatrix.needsUpdate = true;
    const rodIdx = list.filter(({ k }) => hasRod(k)).map(({ p }) => p);
    // wiązka prętów sterujących: trochę szersza od kasety – część wsunięta jest widoczna jako ciemny pas
    const rodMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(w * 1.04, H, w * 1.04), n.rod, rodIdx.length);
    return { fuel, nozzles, rodMesh, rodIdx };
  }, [n, cut, H, mat]);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const k = rods();
    rodIdx.forEach((p, i) => {
      // widoczna tylko część wsunięta (od góry rdzenia w dół); pręty nad rdzeniem są w rurach prowadzących
      const len = Math.max(0.001, k * H);
      o.position.set(p[0], CORE.y1 - len / 2, p[1]);
      o.scale.set(1, len / H, 1);
      o.updateMatrix();
      rodMesh.setMatrixAt(i, o.matrix);
    });
    rodMesh.instanceMatrix.needsUpdate = true;
    mat.emissiveIntensity = 0.02 + 0.22 * glow();
  });
  return (
    <group>
      <primitive object={fuel} />
      <primitive object={nozzles} />
      <primitive object={rodMesh} />
    </group>
  );
}

/** Woda krążąca w zbiorniku: w dół szczeliną przy ścianie, w górę przez rdzeń (kropki). */
export function CoreFlow({ rate }: { rate: () => number }) {
  const N = 600;
  const d = useMemo(() => {
    const r = rng(19);
    return Array.from({ length: N }, () => ({ a: Math.PI + r() * Math.PI, rr: Math.sqrt(r()), s: r(), down: r() < 0.4 }));
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = rate();
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const c = geo.getAttribute('color') as THREE.BufferAttribute;
    d.forEach((q, i) => {
      q.s = (q.s + dt * 0.25 * (0.2 + k)) % 1;
      if (q.down) {
        // szczelina opadowa między koszem rdzenia a ścianą zbiornika
        const rr = CORE.r + 0.3 + q.rr * 0.25;
        const y = RPV.nozY - 1 - q.s * (RPV.nozY - 1 - RPV.y0 + 0.5);
        p.setXYZ(i, Math.cos(q.a) * rr, y, Math.sin(q.a) * rr);
        c.setXYZ(i, 0.35, 0.65, 1);
      } else {
        const rr = q.rr * (CORE.r - 0.1);
        const y = CORE.y0 - 0.4 + q.s * (RPV.nozY - CORE.y0 + 0.4);
        p.setXYZ(i, Math.cos(q.a) * rr, y, Math.sin(q.a) * rr);
        const u = Math.min(1, Math.max(0, (y - CORE.y0) / (CORE.y1 - CORE.y0)));
        c.setXYZ(i, 0.35 + 0.65 * u, 0.65 - 0.35 * u, 1 - 0.8 * u);
      }
    });
    p.needsUpdate = true;
    c.needsUpdate = true;
  });
  return (
    <points geometry={geo}>
      <pointsMaterial map={dotTex()} vertexColors size={0.09} sizeAttenuation transparent depthWrite={false} />
    </points>
  );
}

/** Zbiornik reaktora: walec z dnem i pokrywą, napędy prętów na pokrywie, woda w środku. */
export function Vessel({ cut, headOff = false }: { cut: boolean; headOff?: boolean }) {
  const n = NMAT();
  return (
    <group>
      <Shell r={RPV.r} y0={RPV.y0} y1={RPV.y1} m={n.vessel} cut={cut} />
      <Shell r={RPV.r - 0.22} y0={RPV.y0} y1={RPV.y1} m={n.vesselIn} cut={cut} />
      {/* dno i pokrywa (półkule) */}
      <mesh position={[0, RPV.y0, 0]} rotation={[Math.PI, 0, 0]} material={n.vessel}>
        <sphereGeometry args={[RPV.r, 40, 16, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {!headOff && (
        <mesh position={[0, RPV.y1 + 0.3, 0]} material={n.vessel}>
          <sphereGeometry args={[RPV.r, 40, 16, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      )}
      {/* kołnierz pokrywy ze śrubami */}
      <mesh position={[0, RPV.y1 + 0.15, 0]} material={n.vessel}>
        <cylinderGeometry args={[RPV.r + 0.35, RPV.r + 0.35, 0.6, 48, 1, false, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2]} />
      </mesh>
      {/* osłona rdzenia (kosz) */}
      <Shell r={CORE.r + 0.12} y0={CORE.y0 - 0.4} y1={CORE.y1 + 0.6} m={n.vesselIn} cut={cut} />
      {/* napędy prętów sterujących na pokrywie */}
      {!headOff && Array.from({ length: 21 }, (_, i) => {
        const a = (i / 21) * Math.PI * 7;
        const rr = 0.25 + (i / 21) * 1.5;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        if (cut && z > 0.1) return null;
        return <CylY key={i} p={[x, RPV.y1 + 1.2, z]} r={0.12} h={4.4} m={n.rod} seg={8} />;
      })}
      {/* woda w zbiorniku */}
      <mesh position={[0, (RPV.y0 + RPV.y1) / 2, 0]} material={n.water}>
        <cylinderGeometry args={[RPV.r - 0.25, RPV.r - 0.25, RPV.y1 - RPV.y0, 40, 1, false, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2]} />
      </mesh>
      {/* betonowa studnia reaktora (osłona biologiczna) */}
      <Shell r={4.2} y0={0} y1={RPV.y1 + 2} m={n.concreteIn} cut={cut} />
    </group>
  );
}

/** Wytwornica pary w przekroju: wiązka rurek w kształcie U w dolnej części, oddzielacze wilgoci w górnej. */
export function SteamGen({ sg, cut }: { sg: number; cut: boolean }) {
  const n = NMAT();
  const m = M();
  const x = sg * SG.x;
  const tubes = useMemo(() => {
    const list: [V3, V3][] = [];
    for (let i = 0; i < 14; i++) {
      const rr = 0.35 + i * 0.11;
      list.push([[x - rr, SG.y0 + 0.6, 0], [x - rr, SG.y0 + 9.5 + rr * 0.6, 0]]);
      list.push([[x + rr, SG.y0 + 0.6, 0], [x + rr, SG.y0 + 9.5 + rr * 0.6, 0]]);
    }
    return list;
  }, [x]);
  return (
    <group>
      <group position={[x, 0, 0]}>
        <Shell r={SG.rLow} y0={SG.y0} y1={SG.yMid - 2} m={n.sg} cut={cut} />
        <mesh position={[0, SG.yMid - 1, 0]} material={n.sg}>
          <cylinderGeometry args={[SG.rUp, SG.rLow, 2, 48, 1, true, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2]} />
        </mesh>
        <Shell r={SG.rUp} y0={SG.yMid} y1={SG.y1 - 2} m={n.sg} cut={cut} />
        <Dome r={SG.rUp} y0={SG.y1 - 2} h={2} m={n.sg} cut={cut} />
        {/* komora wodna u dołu (półkula) */}
        <mesh position={[0, SG.y0, 0]} rotation={[Math.PI, 0, 0]} material={n.sg}>
          <sphereGeometry args={[SG.rLow, 32, 12, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        {/* oddzielacze wilgoci u góry */}
        {cut &&
          [-1.6, -0.5, 0.6, 1.7].map((dx) => (
            <CylY key={dx} p={[dx, SG.yMid + 1.5, -0.6]} r={0.38} h={3.4} m={m.steel} seg={16} />
          ))}
        {cut && <Box p={[0, SG.y0 + 0.4, -0.2]} s={[2 * SG.rLow - 0.4, 0.4, 2 * SG.rLow - 0.6]} m={m.steelDark} />}
      </group>
      {/* rurki U: dwie odnogi i łuk u góry */}
      {cut &&
        tubes.map(([a, b], i) => (
          <Beam key={i} a={[a[0], a[1], -0.4]} b={[b[0], b[1], -0.4]} w={0.07} m={n.copper} />
        ))}
      {cut &&
        Array.from({ length: 14 }, (_, i) => {
          const rr = 0.35 + i * 0.11;
          return (
            <mesh key={`arc${i}`} position={[x, SG.y0 + 9.5 + rr * 0.6, -0.4]} material={n.copper}>
              <torusGeometry args={[rr, 0.035, 6, 20, Math.PI]} />
            </mesh>
          );
        })}
    </group>
  );
}

/** Pompy obiegu pierwotnego (z silnikami w hermetycznej obudowie) przyczepione pod wytwornicami. */
function Pumps() {
  const n = NMAT();
  return (
    <group>
      {[1, -1].map((sg) =>
        [-1, 1].map((dz) => (
          <group key={`${sg}${dz}`} position={[sg * (SG.x - 0.3), SG.y0 - 4, dz * RCP_DZ]}>
            <CylY p={[0, -1.6, 0]} r={0.75} h={3.6} m={n.vessel} seg={24} />
            <CylY p={[0, -3, 0]} r={0.55} h={1.4} m={NMAT().orange} seg={20} />
          </group>
        )),
      )}
    </group>
  );
}

/** Stabilizator ciśnienia: wysoki zbiornik z grzałkami u dołu i poduszką pary u góry. */
export function Pressurizer({ cut }: { cut: boolean }) {
  const n = NMAT();
  return (
    <group position={[PZR.x, 0, PZR.z]}>
      <Shell r={PZR.r} y0={PZR.y0} y1={PZR.y1} m={n.sg} cut={cut} />
      <Dome r={PZR.r} y0={PZR.y1} h={1.2} m={n.sg} cut={cut} />
      <mesh position={[0, PZR.y0, 0]} rotation={[Math.PI, 0, 0]} material={n.sg}>
        <sphereGeometry args={[PZR.r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {cut && (
        <>
          {/* woda w dolnej części, para nad nią */}
          <mesh position={[0, PZR.y0 + 5, 0]} material={n.water}>
            <cylinderGeometry args={[PZR.r - 0.1, PZR.r - 0.1, 10, 24, 1, false, Math.PI / 2, Math.PI]} />
          </mesh>
          {[-0.6, -0.2, 0.2, 0.6].map((x) => (
            <Box key={x} p={[x, PZR.y0 + 1.4, -0.3]} s={[0.08, 2.6, 0.08]} m={n.hot} />
          ))}
          <Box p={[0, PZR.y1 - 0.6, -0.3]} s={[1.2, 0.2, 0.2]} m={n.cold} />
        </>
      )}
    </group>
  );
}

/** Pierścieniowy wycinek zbiornika (przekrój prostokątny obrócony wokół osi y). */
function RingTank({ r0, r1, y0, y1, a0, a1, m }: { r0: number; r1: number; y0: number; y1: number; a0: number; a1: number; m: THREE.Material }) {
  const geo = useMemo(() => {
    const pts = [new THREE.Vector2(r0, y0), new THREE.Vector2(r1, y0), new THREE.Vector2(r1, y1), new THREE.Vector2(r0, y1), new THREE.Vector2(r0, y0)];
    return new THREE.LatheGeometry(pts, 48, a0, a1 - a0);
  }, [r0, r1, y0, y1, a0, a1]);
  return <mesh geometry={geo} material={m} />;
}

/**
 * Bierne układy bezpieczeństwa AP1000 w obudowie: zbiornik wody przeładunkowej (pierścień przy ścianie obudowy,
 * zalewa rdzeń grawitacyjnie), dwa zbiorniki uzupełniania rdzenia (nad pętlą) i dwa akumulatory hydrauliczne
 * (kule z wodą pod ciśnieniem azotu).
 */
export const IRWST = { r0: 13, r1: CV.r - 0.4, y0: 20, y1: 28, a0: Math.PI * 0.64, a1: Math.PI * 1.36 };
export const CMT: V3[] = [
  [-6, 38, -12],
  [6, 38, -12],
];
export const ACC: V3[] = [
  [-6.5, 6, -12],
  [6.5, 6, -12],
];
export function SafetyTanks() {
  const n = NMAT();
  const m = M();
  return (
    <group>
      <RingTank {...IRWST} m={n.water} />
      <RingTank r0={IRWST.r0 - 0.25} r1={IRWST.r0} y0={IRWST.y0} y1={IRWST.y1 + 0.4} a0={IRWST.a0} a1={IRWST.a1} m={m.steel} />
      <RingTank r0={IRWST.r0} r1={IRWST.r1} y0={IRWST.y0 - 0.4} y1={IRWST.y0} a0={IRWST.a0} a1={IRWST.a1} m={m.steel} />
      {CMT.map((p, i) => (
        <group key={i} position={p}>
          <CylY p={[0, -3, 0]} r={1.7} h={6} m={n.tank} seg={24} />
          <mesh position={[0, 3, 0]} material={n.tank}>
            <sphereGeometry args={[1.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, -3, 0]} rotation={[Math.PI, 0, 0]} material={n.tank}>
            <sphereGeometry args={[1.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </group>
      ))}
      {ACC.map((p, i) => (
        <mesh key={i} position={p} material={n.tank}>
          <sphereGeometry args={[2.3, 28, 18]} />
        </mesh>
      ))}
      {/* rury z akumulatorów i zbiorników do zbiornika reaktora */}
      {[1, -1].map((sg) => (
        <group key={sg}>
          <Pipe pts={[[sg * 6.5, 6, -9.8], [sg * 3, 10, -4], [sg * 1.6, RPV.y0 + 4, -1.6]]} r={0.16} m={n.cold} />
          <Pipe pts={[[sg * 6, 32.3, -12], [sg * 4, 22, -6], [sg * 2.2, RPV.nozY - 1, -1.2]]} r={0.16} m={n.cold} />
        </group>
      ))}
    </group>
  );
}

/** Osuszacze-przegrzewacze pary (MSR) przy turbinie: długie poziome zbiorniki po obu stronach części NP. */
export function Msr() {
  const m = M();
  return (
    <group>
      {[-12.5, 12.5].map((z) => (
        <group key={z}>
          <CylX x0={-108} x1={-76} r={2.2} y={AX + 1.2} z={z} m={m.steel} seg={28} />
          {[-108, -76].map((x) => (
            <mesh key={x} position={[x, AX + 1.2, z]} rotation={[0, 0, Math.PI / 2]} material={m.steel}>
              <sphereGeometry args={[2.2, 20, 12]} />
            </mesh>
          ))}
          {[-104, -92, -80].map((x) => (
            <Box key={x} p={[x, AX - 1.6, z]} s={[1, 3.2, 2.4]} m={m.steelDark} />
          ))}
        </group>
      ))}
    </group>
  );
}

/** Wnętrze obudowy: zbiornik, rdzeń, wytwornice, pompy, stabilizator, rurociągi, pomost i suwnica. */
export function PrimaryLoop({ cut, rods, glow, headOff = false }: { cut: boolean; rods: () => number; glow: () => number; headOff?: boolean }) {
  const n = NMAT();
  const m = M();
  return (
    <group>
      <Vessel cut={cut} headOff={headOff} />
      <Core rods={rods} cut={cut} glow={glow} />
      <SteamGen sg={-1} cut={cut} />
      <SteamGen sg={1} cut={cut} />
      <Pumps />
      <Pressurizer cut={cut} />
      <SafetyTanks />
      {/* gałęzie gorące (czerwone) i zimne (niebieskie) */}
      {[1, -1].map((sg) => (
        <group key={sg}>
          <Pipe pts={[[sg * RPV.r, RPV.nozY, 0], [sg * (SG.x - 1.4), RPV.nozY, 0], [sg * SG.x, SG.y0 - 1.5, 0]]} r={0.48} m={n.hot} />
          {[-1, 1].map((dz) => (
            <Pipe key={dz} pts={[[sg * (SG.x - 0.3), SG.y0 - 5.4, dz * RCP_DZ], [sg * (SG.x - 2.5), RPV.nozY - 1, dz * RCP_DZ], [sg * (RPV.r + 0.1), RPV.nozY - 1, dz * 0.8]]} r={0.36} m={n.cold} />
          ))}
        </group>
      ))}
      {/* przewód łączący stabilizator z gałęzią gorącą */}
      <Pipe pts={[[PZR.x, PZR.y0 - 1.3, PZR.z], [PZR.x + 3, RPV.nozY, PZR.z + 4], [SG.x - 3, RPV.nozY, 0]]} r={0.18} m={n.hot} />
      {/* pomost przeładunkowy z otworem nad reaktorem i kanał przeładunkowy (woda) */}
      <mesh position={[0, DECK_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={n.deck}>
        <ringGeometry args={[4.6, CV.r - 0.2, 48, 1, cut ? Math.PI : 0, cut ? Math.PI : Math.PI * 2]} />
      </mesh>
      {/* osłony betonowe przy wytwornicach */}
      {[1, -1].map((sg) => (
        <Box key={sg} p={[sg * (SG.x + 4.6), 17, cut ? -3 : 0]} s={[1.2, 34, cut ? 6 : 12]} m={n.concreteIn} />
      ))}
      {/* suwnica obrotowa na szynie pod kopułą */}
      <mesh position={[0, CRANE_Y, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.steelDark}>
        <torusGeometry args={[CV.r - 1, 0.4, 6, 64, cut ? Math.PI : Math.PI * 2]} />
      </mesh>
      <Box p={[0, CRANE_Y + 0.8, cut ? -4 : 0]} s={[2 * CV.r - 3, 2.2, 2.6]} m={n.yellow} />
      <Box p={[3, CRANE_Y - 0.6, cut ? -4 : 0]} s={[3, 1.6, 3]} m={n.orange} />
      {/* kanał przeładunkowy do basenu w budynku pomocniczym */}
      <Box p={[(CV.r + POOL.x0) / 2 + 2, TRANSFER_Y, -4]} s={[POOL.x0 - CV.r + 2, 1.2, 1.2]} m={m.steel} />
    </group>
  );
}

/* ================= budynek pomocniczy, basen ================= */

/**
 * Budynek pomocniczy z basenem wypalonego paliwa. `cut` – zdjęty dach i ściana od strony kamery, widać basen:
 * stojaki z kasetami pod wodą (`glow` – świecenie Czerenkowa nad paliwem).
 */
export function AuxBuilding({ cut }: { cut: boolean }) {
  const n = NMAT();
  const m = M();
  const racks = useMemo(() => {
    const list: [V3, V3][] = [];
    for (let i = 0; i < 18; i++)
      for (let j = 0; j < 22; j++) {
        const x = POOL.x0 + 0.8 + i * 0.58;
        const z = POOL.z0 + 0.8 + j * 0.58;
        if (x > POOL.x1 - 0.6 || z > POOL.z1 - 0.6) continue;
        list.push([[x, POOL.y0 + 2.4, z], [0.5, 4.6, 0.5]]);
      }
    return list;
  }, []);
  const rackMesh = useMemo(() => {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), n.rack, racks.length);
    const o = new THREE.Object3D();
    racks.forEach(([p, s], i) => {
      o.position.set(...p);
      o.scale.set(...s);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [racks, n]);
  const { x0, x1, z0, z1, h } = AUX;
  return (
    <group>
      <Box p={[(x0 + x1) / 2, h / 2, z0]} s={[x1 - x0, h, 0.6]} m={n.concrete} />
      {!cut && <Box p={[(x0 + x1) / 2, h / 2, z1]} s={[x1 - x0, h, 0.6]} m={n.concrete} />}
      <Box p={[x1, h / 2, cut ? z0 / 2 : 0]} s={[0.6, h, cut ? -z0 : z1 - z0]} m={n.concrete} />
      {!cut && <Box p={[(x0 + x1) / 2, h + 0.4, 0]} s={[x1 - x0, 0.8, z1 - z0]} m={m.roof} />}
      {/* basen: betonowe ściany, stalowa wykładzina, woda */}
      <Box p={[(POOL.x0 + POOL.x1) / 2, POOL.y0 - 0.5, (POOL.z0 + POOL.z1) / 2]} s={[POOL.x1 - POOL.x0 + 2, 1, POOL.z1 - POOL.z0 + 2]} m={n.concreteIn} />
      {[POOL.x0 - 0.5, POOL.x1 + 0.5].map((x) => (
        <Box key={x} p={[x, (POOL.y0 + POOL.y1) / 2 + 1, (POOL.z0 + POOL.z1) / 2]} s={[1, POOL.y1 - POOL.y0 + 2, POOL.z1 - POOL.z0 + 2]} m={n.concreteIn} />
      ))}
      <Box p={[(POOL.x0 + POOL.x1) / 2, (POOL.y0 + POOL.y1) / 2 + 1, POOL.z0 - 0.5]} s={[POOL.x1 - POOL.x0, POOL.y1 - POOL.y0 + 2, 1]} m={n.concreteIn} />
      {!cut && <Box p={[(POOL.x0 + POOL.x1) / 2, (POOL.y0 + POOL.y1) / 2 + 1, POOL.z1 + 0.5]} s={[POOL.x1 - POOL.x0, POOL.y1 - POOL.y0 + 2, 1]} m={n.concreteIn} />}
      <primitive object={rackMesh} />
      <mesh position={[(POOL.x0 + POOL.x1) / 2, (POOL.y0 + POOL.y1) / 2, (POOL.z0 + POOL.z1) / 2]} material={n.pool}>
        <boxGeometry args={[POOL.x1 - POOL.x0, POOL.y1 - POOL.y0, POOL.z1 - POOL.z0]} />
      </mesh>
      {/* pomost z suwnicą nad basenem */}
      <Box p={[(POOL.x0 + POOL.x1) / 2, POOL.y1 + 7, (POOL.z0 + POOL.z1) / 2]} s={[1.2, 1.2, POOL.z1 - POOL.z0 + 4]} m={n.yellow} />
      {/* posadzka hali i pozostałe pomieszczenia (bloki) */}
      <Box p={[(x0 + x1) / 2, 0.2, 0]} s={[x1 - x0, 0.4, z1 - z0]} m={m.concreteDark} />
      <Box p={[56, 8, 12]} s={[16, 16, 20]} m={n.concreteIn} />
      <Box p={[56, 6, -18]} s={[16, 12, 14]} m={n.concreteIn} />
    </group>
  );
}

/* ================= pozostałe ================= */

/** Magazyn suchy: betonowe pojemniki z wypalonym paliwem na placu za ogrodzeniem. */
export function CaskPad() {
  const n = NMAT();
  const m = M();
  const pts = useMemo(() => {
    const list: V3[] = [];
    for (let x = CASKS.x0 + 6; x < CASKS.x1 - 4; x += 7) for (let z = CASKS.z0 + 6; z < CASKS.z1 - 4; z += 7) list.push([x, 0.4, z]);
    return list;
  }, []);
  return (
    <group>
      <Box p={[(CASKS.x0 + CASKS.x1) / 2, 0.2, (CASKS.z0 + CASKS.z1) / 2]} s={[CASKS.x1 - CASKS.x0, 0.4, CASKS.z1 - CASKS.z0]} m={m.concrete} />
      {pts.map((p, i) => (
        <group key={i}>
          <CylY p={p} r={1.7} h={5.8} m={n.cask} seg={24} />
          <CylY p={[p[0], p[1] + 5.8, p[2]]} r={1.55} h={0.4} m={m.steelDark} seg={24} />
        </group>
      ))}
      {/* ogrodzenie */}
      {[CASKS.z0, CASKS.z1].map((z) => (
        <Box key={z} p={[(CASKS.x0 + CASKS.x1) / 2, 1.2, z]} s={[CASKS.x1 - CASKS.x0, 2.4, 0.1]} m={m.steel} />
      ))}
    </group>
  );
}

/** Agregaty prądotwórcze, budynek administracyjny, pompownia wody morskiej, głowice ujęcia i zrzutu. */
export function Site() {
  const n = NMAT();
  const m = M();
  return (
    <group>
      {DIESEL.map((p, i) => (
        <group key={i} position={p}>
          <Box p={[0, 5, 0]} s={[16, 10, 12]} m={n.concrete} />
          <CylY p={[5, 10, 3]} r={0.6} h={6} m={m.steelDark} />
          <CylY p={[-5, 10, 3]} r={0.6} h={6} m={m.steelDark} />
        </group>
      ))}
      {/* budynek administracyjny i nastawnia */}
      <Box p={[-20, 9, 60]} s={[48, 18, 18]} m={m.clad} />
      <Box p={[-20, 13, 69.2]} s={[44, 6, 0.3]} m={m.glass} />
      {/* pompownia przy brzegu */}
      <Box p={[PUMP[0], 6, PUMP[2]]} s={[30, 12, 22]} m={m.clad} />
      {/* głowice ujęcia i zrzutu w morzu (wystają nad dno) */}
      {[INTAKE, OUTFALL].map((p, i) => (
        <group key={i} position={[p[0], groundH(p[0], p[2]), p[2]]}>
          <CylY p={[0, 0, 0]} r={6} h={4} m={m.concreteDark} />
          <CylY p={[0, 4, 0]} r={4.5} h={1} m={m.steelDark} />
        </group>
      ))}
      {/* budynek przyłączy (wejście do części jądrowej, nastawnia awaryjna) i budynek odpadów promieniotwórczych */}
      <Box p={[-5, 11, 38]} s={[30, 22, 20]} m={m.clad} />
      <Box p={[-5, 16, 48.2]} s={[26, 5, 0.3]} m={m.glass} />
      <Box p={[40, 6.5, 37]} s={[28, 13, 14]} m={n.concrete} />
      {/* boje oznaczające głowice ujęcia i zrzutu */}
      {[INTAKE, OUTFALL].map((p, i) =>
        [-12, 12].map((dx) => (
          <group key={`${i}${dx}`} position={[p[0] + dx, 0, p[2]]}>
            <mesh position={[0, 0.3, 0]} material={n.yellow}>
              <sphereGeometry args={[1.4, 16, 10]} />
            </mesh>
            <CylY p={[0, 1.4, 0]} r={0.12} h={3} m={m.steelDark} />
            <mesh position={[0, 4.6, 0]} material={n.yellow}>
              <coneGeometry args={[0.6, 1, 4]} />
            </mesh>
          </group>
        )),
      )}
      {/* ogrodzenie terenu */}
      {[
        [-320, -140, 220, -140],
        [-320, 120, 220, 120],
        [-320, -140, -320, 120],
        [220, -140, 220, 120],
      ].map(([a, b, c, d], i) => (
        <Beam key={i} a={[a, 1.2, b]} b={[c, 1.2, d]} w={0.1} h={2.4} m={m.steel} />
      ))}
    </group>
  );
}

let NG_TEX: THREE.Texture | null = null;
function groundTexture() {
  const S = 2048;
  const ext = 2600;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const px = (v: number) => ((v + ext / 2) / ext) * S;
  const sc = S / ext;
  const r = rng(31);
  g.fillStyle = '#4d6a3c';
  g.fillRect(0, 0, S, S);
  // polany i łąki w lesie
  for (let i = 0; i < 140; i++) {
    const x = r() * ext - ext / 2;
    const z = r() * ext - ext / 2 + 300;
    g.fillStyle = ['#6f8a4a', '#7d9452', '#5d7a42'][Math.floor(r() * 3)];
    g.beginPath();
    g.ellipse(px(x), px(z), (40 + r() * 120) * sc, (30 + r() * 80) * sc, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // plaża i wydmy
  g.fillStyle = '#e4d6aa';
  g.fillRect(0, px(SEA_Z - 40), S, (BEACH + 40 - SEA_Z + 40) * sc);
  g.fillStyle = '#c9bf8e';
  g.fillRect(0, px(BEACH + 40), S, 60 * sc);
  // teren elektrowni
  g.fillStyle = '#b6b2aa';
  g.fillRect(px(-320), px(-140), 540 * sc, 260 * sc);
  g.fillStyle = '#8f8c86';
  g.fillRect(px(-310), px(30), 520 * sc, 6 * sc);
  g.fillRect(px(-310), px(-60), 520 * sc, 6 * sc);
  g.fillRect(px(90), px(-130), 6 * sc, 240 * sc);
  // droga dojazdowa
  g.strokeStyle = '#6a6964';
  g.lineWidth = 10 * sc;
  g.beginPath();
  g.moveTo(px(-40), px(120));
  g.lineTo(px(-120), px(1100));
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Teren: las, wydmy, plaża, morze z dnem. */
export function Coast() {
  const n = NMAT();
  const tex = useMemo(() => (NG_TEX ??= groundTexture()), []);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(2600, 2600, 200, 200);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)) - 0.05);
    g.computeVertexNormals();
    return g;
  }, []);
  const seaRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (seaRef.current) seaRef.current.position.y = -0.4 + 0.15 * Math.sin(clock.elapsedTime * 0.6);
  });
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial map={tex} roughness={1} />
      </mesh>
      {/* morze do horyzontu (zaczyna się przy brzegu) */}
      <mesh ref={seaRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, SEA_Z - 1600]} material={n.sea}>
        <planeGeometry args={[6000, 3240]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]}>
        <ringGeometry args={[1300, 6000, 32, 1]} />
        <meshStandardMaterial color="#4d6a3c" roughness={1} />
      </mesh>
    </group>
  );
}

/** Las sosnowy na wydmach i dookoła elektrowni. */
export function Pines() {
  const n = NMAT();
  const { crowns, trunks } = useMemo(() => {
    const r = rng(41);
    const pts: V3[] = [];
    while (pts.length < 1100) {
      const x = r() * 2400 - 1200;
      const z = r() * 1500 - 210;
      if (inPlant(x, z) || z < BEACH + 50 || (z < -130 && x > -140 && x < -40) || (x > CASKS.x0 - 30 && x < CASKS.x1 + 30 && z > 0 && z < CASKS.z1 + 30)) continue;
      if (fbm(x / 180, z / 180) < 0.42) continue;
      pts.push([x, groundH(x, z), z]);
    }
    const cg = new THREE.ConeGeometry(3.4, 10, 7);
    const tg = new THREE.CylinderGeometry(0.35, 0.45, 8, 5);
    const crowns = new THREE.InstancedMesh(cg, n.pine, pts.length);
    const trunks = new THREE.InstancedMesh(tg, n.trunk, pts.length);
    const o = new THREE.Object3D();
    pts.forEach(([x, y, z], i) => {
      const s = 0.8 + r() * 0.6;
      o.position.set(x, y + 4 * s, z);
      o.scale.setScalar(s);
      o.updateMatrix();
      trunks.setMatrixAt(i, o.matrix);
      o.position.set(x, y + 12 * s, z);
      o.updateMatrix();
      crowns.setMatrixAt(i, o.matrix);
    });
    return { crowns, trunks };
  }, [n]);
  return (
    <>
      <primitive object={crowns} />
      <primitive object={trunks} />
    </>
  );
}

