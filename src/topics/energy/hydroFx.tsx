/*
 * Elektrownia wodna – efekty i powiększenia: woda na przelewie i w niecce wypadowej, deszcz i parowanie nad
 * doliną, strzałki naporu wody na zaporę, trzy rodzaje turbin (Pelton, Francis, Kaplan) w powiększeniu, ryby
 * w przepławce.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Lbl } from '../aviation/airliner';
import { dotTex } from './coalFx';
import { BAYS, CUT_X, DAM, PH, SPILL, TAIL, groundH, mix, rng, zFace, type V3 } from './hydroGeo';
import { FISH, FrancisRunner, GuideVanes, HMAT, Spiral } from './hydroPlant';

/** Powiększenia stoją nad doliną, z dala od zapory. */
export const LAB: V3 = [210, 210, 330];
export const GATE_LAB: V3 = [120, 200, 330];

/* ================= woda na przelewie ================= */

/** Droga wody przez przęsło przelewu (z, y): nad progiem, po ścianie zapory, w niecce i dalej do rzeki. */
const SPILL_PATH: [number, number][] = [
  [-14, 0],
  [1.5, SPILL.crest + 0.7],
  [6, SPILL.crest + 0.4],
  [12, SPILL.crest - 3.4],
  [zFace(SPILL.crest - 12) + 0.6, SPILL.crest - 11.6],
  [zFace(10) + 0.7, 10.4],
  [zFace(0) + 2, -2.6],
  [zFace(0) + 12, 3.5],
  [PH.z1 - 6, 5.2],
  [PH.z1 + 40, TAIL - 0.2],
];

/**
 * Woda przelewająca się przez otwarte przęsła: strumień po ścianie zapory i spieniona woda w niecce.
 * `open()` – otwarcie zamknięć 0…1, `level()` – poziom wody w zbiorniku.
 */
export function SpillFlow({ open, level }: { open: () => number; level: () => number }) {
  const N = 5000;
  const d = useMemo(() => {
    const r = rng(29);
    return Array.from({ length: N }, () => ({ s: r(), bay: Math.floor(r() * 3), u: r(), v: r(), w: r(), sp: 0.7 + r() * 0.6 }));
  }, []);
  const { cum, total } = useMemo(() => {
    const cum = [0];
    for (let i = 1; i < SPILL_PATH.length; i++) cum.push(cum[i - 1] + Math.hypot(SPILL_PATH[i][0] - SPILL_PATH[i - 1][0], SPILL_PATH[i][1] - SPILL_PATH[i - 1][1]));
    return { cum, total: cum[cum.length - 1] };
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = open();
    const L = level();
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const c = geo.getAttribute('color') as THREE.BufferAttribute;
    const depth = Math.max(0.3, (L - SPILL.crest) * 0.55 * Math.min(1, k * 2));
    d.forEach((q, i) => {
      // aktywna tylko część kropek – im szerzej otwarte, tym więcej wody
      const on = q.w < k;
      q.s = (q.s + (dt * q.sp * (14 + 26 * k)) / total) % 1;
      const dist = q.s * total;
      let j = 1;
      while (j < cum.length - 1 && cum[j] < dist) j++;
      const t = (dist - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]);
      const a = SPILL_PATH[j - 1];
      const b = SPILL_PATH[j];
      let z = mix(a[0], b[0], t);
      let y = mix(a[1], b[1], t);
      if (j === 1) y = mix(L - 1.5, b[1], t);
      // grubość strumienia nad powierzchnią; w niecce woda kłębi się i pieni
      const basin = z > zFace(0) - 2 && z < PH.z1;
      y += q.v * depth;
      if (basin) y += Math.abs(Math.sin(clock.elapsedTime * 3 + q.u * 20)) * 3.2 * k * (1 - (z - zFace(0)) / (PH.z1 - zFace(0)));
      if (basin) z += Math.sin(clock.elapsedTime * 2 + q.v * 9) * 1.2;
      const [x0, x1] = BAYS[q.bay];
      const spread = z > zFace(0) ? [SPILL.x0, SPILL.x1] : [x0, x1];
      const x = mix(spread[0] + 0.4, spread[1] - 0.4, q.u);
      p.setXYZ(i, x, on ? y : -200, z);
      const foam = basin || (z > 12 && q.v > 0.6) ? 1 : 0.55;
      c.setXYZ(i, mix(0.55, 0.95, foam), mix(0.78, 0.97, foam), 1);
    });
    p.needsUpdate = true;
    c.needsUpdate = true;
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial map={dotTex()} vertexColors size={1.15} sizeAttenuation transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}

/** Smugi spływającej wody (kafelek: jasne pasma wzdłuż spadku i przezroczyste szczeliny). */
let STREAK: THREE.Texture | null = null;
function streakTex() {
  if (STREAK) return STREAK;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = rng(17);
  g.fillStyle = 'rgba(200,230,250,0.55)';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 40; i++) {
    const x = r() * 64;
    const y = r() * 64;
    g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.5})`;
    g.fillRect(x, y, 1 + r() * 2, 10 + r() * 30);
    g.fillRect(x, y - 64, 1 + r() * 2, 10 + r() * 30);
  }
  STREAK = new THREE.CanvasTexture(c);
  STREAK.wrapS = STREAK.wrapT = THREE.RepeatWrapping;
  return STREAK;
}
/** Piana: białe plamy różnej wielkości (bez szwu – plamy rysowane też przesunięte o kafelek). */
let FOAM: THREE.Texture | null = null;
function foamTex() {
  if (FOAM) return FOAM;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rng(23);
  for (let i = 0; i < 160; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 2 + r() * 9;
    for (const dx of [-S, 0, S])
      for (const dy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        gr.addColorStop(0, `rgba(255,255,255,${0.5 + r() * 0.4})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
  }
  FOAM = new THREE.CanvasTexture(c);
  FOAM.wrapS = FOAM.wrapT = THREE.RepeatWrapping;
  return FOAM;
}

/**
 * Strumień na przelewie jako zwarta warstwa wody: wstęga po progu i ścianie zapory w każdym przęśle, ze smugami
 * pędzącymi w dół; w niecce i za nią – piana. `open()` – otwarcie zamknięć.
 */
export function SpillSheet({ open }: { open: () => number }) {
  const PATH = SPILL_PATH.slice(1, 7);
  const geo = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let base = 0;
    for (const [x0, x1] of BAYS) {
      let len = 0;
      PATH.forEach(([z, y], i) => {
        if (i > 0) len += Math.hypot(z - PATH[i - 1][0], y - PATH[i - 1][1]);
        pos.push(x0 + 0.2, y + 0.25, z, x1 - 0.2, y + 0.25, z);
        uv.push(0, len / 14, (x1 - x0) / 14, len / 14);
        if (i > 0) {
          const o = base + (i - 1) * 2;
          idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
        }
      });
      base += PATH.length * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [PATH]);
  const sheet = useMemo(() => {
    const t = streakTex().clone();
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity: 0, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide, emissive: '#5a7f99', emissiveIntensity: 0.25 });
  }, []);
  const foam = useMemo(() => {
    const t = foamTex().clone();
    t.needsUpdate = true;
    t.repeat.set(3, 4);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  }, []);
  const foam2 = useMemo(() => {
    const t = foamTex().clone();
    t.needsUpdate = true;
    t.repeat.set(2.4, 3);
    t.offset.set(0.37, 0.11);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  }, []);
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = open();
    sheet.opacity = 0.9 * Math.min(1, k * 4);
    sheet.map!.offset.y -= dt * (1.2 + 1.5 * k);
    foam.opacity = 0.85 * Math.min(1, k * 3);
    foam.map!.offset.y -= dt * 0.25;
    foam.map!.offset.x = Math.sin(clock.elapsedTime * 0.7) * 0.05;
    foam2.opacity = 0.6 * Math.min(1, k * 3);
    foam2.map!.offset.y -= dt * 0.12;
  });
  const z0 = zFace(0) - 2;
  const z1 = PH.z1 + 45;
  return (
    <group>
      <mesh geometry={geo} material={sheet} renderOrder={3} />
      <mesh position={[(SPILL.x0 + SPILL.x1) / 2, TAIL + 0.25, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={foam} renderOrder={3}>
        <planeGeometry args={[SPILL.x1 - SPILL.x0 + 6, z1 - z0]} />
      </mesh>
      <mesh position={[(SPILL.x0 + SPILL.x1) / 2, TAIL + 0.3, z1 + 30]} rotation={[-Math.PI / 2, 0, 0]} material={foam2} renderOrder={3}>
        <planeGeometry args={[SPILL.x1 - SPILL.x0 + 14, 70]} />
      </mesh>
    </group>
  );
}

/** Kłębiąca się woda nad wylotami rur ssawnych – tym silniej, im więcej wody płynie przez turbiny (`rate()`). */
export function OutletFoam({ units, rate }: { units: number[]; rate: () => number }) {
  const mats = useMemo(
    () =>
      units.map((_, i) => {
        const t = foamTex().clone();
        t.needsUpdate = true;
        t.repeat.set(1.2, 1.6);
        t.offset.set(i * 0.31, i * 0.17);
        return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      }),
    [units],
  );
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = Math.max(0, Math.min(1, rate()));
    mats.forEach((m) => {
      m.opacity = 0.6 * k;
      m.map!.offset.y -= dt * 0.35;
    });
  });
  return (
    <group>
      {units.map((u, i) => (
        <mesh key={u} position={[u, TAIL + 0.35, PH.z1 + 16]} rotation={[-Math.PI / 2, 0, 0]} material={mats[i]} renderOrder={3}>
          <planeGeometry args={[14, 30]} />
        </mesh>
      ))}
    </group>
  );
}

/* ================= deszcz i parowanie ================= */

/** Deszcz nad górami powyżej zbiornika i para unosząca się z wody (`on()` 0…1). */
export function RainCycle({ on }: { on: () => number }) {
  const N = 2400;
  const M = 500;
  const rain = useMemo(() => {
    const r = rng(37);
    return Array.from({ length: N }, () => ({ x: r() * 1200 - 600, z: -500 - r() * 760, y: r() * 420, v: 90 + r() * 40 }));
  }, []);
  const evap = useMemo(() => {
    const r = rng(41);
    return Array.from({ length: M }, () => ({ x: r() * 500 - 250, z: -60 - r() * 700, y: r() * 260 }));
  }, []);
  const rg = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  const eg = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(M * 3), 3));
    return g;
  }, []);
  const ground = useMemo(() => rain.map((q) => groundH(q.x, q.z)), [rain]);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = on();
    const p = rg.getAttribute('position') as THREE.BufferAttribute;
    rain.forEach((q, i) => {
      q.y -= q.v * dt;
      if (q.y < ground[i]) q.y = 420;
      p.setXYZ(i, q.x, k > 0.01 ? q.y : -500, q.z);
    });
    p.needsUpdate = true;
    const e = eg.getAttribute('position') as THREE.BufferAttribute;
    evap.forEach((q, i) => {
      q.y = (q.y + dt * 14) % 260;
      e.setXYZ(i, q.x + Math.sin(q.y / 30 + i) * 6, k > 0.01 ? 78 + q.y : -500, q.z);
    });
    e.needsUpdate = true;
  });
  return (
    <>
      <points geometry={rg} frustumCulled={false}>
        <pointsMaterial map={dotTex()} color="#a9cdf0" size={2.2} sizeAttenuation transparent opacity={0.8} depthWrite={false} />
      </points>
      <points geometry={eg} frustumCulled={false}>
        <pointsMaterial map={dotTex()} color="#ffffff" size={7} sizeAttenuation transparent opacity={0.35} depthWrite={false} />
      </points>
      {/* chmury deszczowe nad górami */}
      {[-380, -60, 260].map((x, i) => (
        <mesh key={x} position={[x, 430 + i * 20, -880 + i * 90]} scale={[260, 50, 200]}>
          <sphereGeometry args={[1, 20, 12]} />
          <meshStandardMaterial color="#8d96a0" roughness={1} transparent opacity={0.9} />
        </mesh>
      ))}
    </>
  );
}

/* ================= napór wody ================= */

/**
 * Strzałki naporu wody na ścianę zapory w przekroju: im głębiej, tym dłuższe (ciśnienie rośnie liniowo
 * z głębokością). `level()` – poziom wody.
 */
export function PressureArrows({ level }: { level: () => number }) {
  const ys = useMemo(() => Array.from({ length: 14 }, (_, i) => 1.5 + i * 6), []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const shafts = useRef<(THREE.Group | null)[]>([]);
  const mat = useMemo(() => ys.map(() => new THREE.MeshBasicMaterial({ color: '#ff8a3d', toneMapped: false })), [ys]);
  const c = useMemo(() => new THREE.Color(), []);
  const hot = useMemo(() => new THREE.Color('#ef4444'), []);
  useFrame(() => {
    const L = level();
    refs.current.forEach((g, i) => {
      const s = shafts.current[i];
      if (!g || !s) return;
      const depth = L - ys[i];
      g.visible = depth > 0.3;
      s.scale.set(1, 1, Math.max(0.01, depth * 0.42));
      mat[i].color.copy(c.set('#ffd166').lerp(hot, Math.min(1, depth / 80)));
    });
  });
  const x = CUT_X - 1.2;
  return (
    <group>
      {ys.map((y, i) => (
        <group key={y} ref={(g) => (refs.current[i] = g)} position={[x, y, -0.6]}>
          {/* trzon długości 1 wzdłuż +z (skalowany głębokością) i grot przy ścianie zapory */}
          <group ref={(g) => (shafts.current[i] = g)}>
            <mesh position={[0, 0, -0.5]} rotation={[Math.PI / 2, 0, 0]} material={mat[i]}>
              <cylinderGeometry args={[0.35, 0.35, 1, 8]} />
            </mesh>
          </group>
          <mesh position={[0, 0, -0.8]} rotation={[Math.PI / 2, 0, 0]} material={mat[i]}>
            <coneGeometry args={[1.1, 1.8, 10]} />
          </mesh>
        </group>
      ))}
      {/* ciężar zapory: strzałka w dół w środku ciężkości przekroju */}
      <group position={[x, 0, 24]}>
        <mesh position={[0, 34, 0]}>
          <cylinderGeometry args={[0.8, 0.8, 22, 10]} />
          <meshBasicMaterial color="#60a5fa" toneMapped={false} />
        </mesh>
        <mesh position={[0, 22, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[2, 3.6, 12]} />
          <meshBasicMaterial color="#60a5fa" toneMapped={false} />
        </mesh>
      </group>
      <Lbl pos={[x, 48, 24]} sub color="#93c5fd">
        ciężar zapory
      </Lbl>
      <Lbl pos={[x, 10, -30]} sub color="#fca5a5">
        napór wody
      </Lbl>
    </group>
  );
}

/* ================= rodzaje turbin ================= */

/** Koło Peltona: czarki na obwodzie, w które bije strumień wody z dysz. */
function Pelton({ spin }: { spin: () => number }) {
  const n = HMAT();
  const ref = useRef<THREE.Group>(null);
  const jet = useRef<THREE.Points>(null);
  const N = 300;
  const jg = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  const seeds = useMemo(() => {
    const r = rng(53);
    return Array.from({ length: N }, () => ({ s: r(), a: r() * Math.PI * 2, rr: r() }));
  }, []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    if (ref.current) ref.current.rotation.z = -spin() * 1.6;
    const p = jg.getAttribute('position') as THREE.BufferAttribute;
    seeds.forEach((q, i) => {
      q.s = (q.s + dt * 1.4) % 1;
      // strumień z dyszy po lewej, poziomo, trafia w czarki u dołu koła
      const x = -9 + q.s * 8.5;
      p.setXYZ(i, x, -4.2 + Math.cos(q.a) * 0.35 * q.rr, Math.sin(q.a) * 0.35 * q.rr);
    });
    p.needsUpdate = true;
  });
  const buckets = useMemo(() => Array.from({ length: 20 }, (_, i) => (i / 20) * Math.PI * 2), []);
  return (
    <group>
      <group ref={ref}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={n.runner}>
          <cylinderGeometry args={[3.2, 3.2, 0.5, 40]} />
        </mesh>
        {buckets.map((a) => (
          <group key={a} rotation={[0, 0, a]}>
            <mesh position={[0, 3.8, 0]} scale={[0.7, 1, 1.1]} material={n.runner}>
              <sphereGeometry args={[0.75, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
          </group>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={n.shaft}>
          <cylinderGeometry args={[0.35, 0.35, 3, 16]} />
        </mesh>
      </group>
      {/* dysza z iglicą */}
      <mesh position={[-10, -4.2, 0]} rotation={[0, 0, -Math.PI / 2]} material={n.steelDark}>
        <cylinderGeometry args={[0.45, 1, 2.4, 16]} />
      </mesh>
      <points ref={jet} geometry={jg} frustumCulled={false}>
        <pointsMaterial map={dotTex()} color="#bfe3ff" size={0.45} sizeAttenuation transparent depthWrite={false} />
      </points>
    </group>
  );
}

/** Turbina Kaplana: piasta z łopatami jak śmigło statku; łopaty obracają się, dopasowując do przepływu. */
function Kaplan({ spin }: { spin: () => number }) {
  const n = HMAT();
  const ref = useRef<THREE.Group>(null);
  const blades = useMemo(() => Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = spin() * 1.2;
    const pitch = 0.45 + 0.25 * Math.sin(clock.elapsedTime * 0.6);
    ref.current.children.forEach((c) => {
      if (c.userData.blade) (c.children[0] as THREE.Mesh).rotation.x = pitch;
    });
  });
  return (
    <group>
      <group ref={ref}>
        <mesh material={n.runner}>
          <sphereGeometry args={[1.2, 24, 16]} />
        </mesh>
        <mesh position={[0, -1.2, 0]} material={n.runner}>
          <coneGeometry args={[1.15, 1.8, 24]} />
        </mesh>
        {blades.map((a) => (
          <group key={a} rotation={[0, a, 0]} userData={{ blade: true }}>
            <mesh position={[2.2, 0, 0]} material={n.runner}>
              <boxGeometry args={[2.6, 0.12, 1.9]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 3, 0]} material={n.shaft}>
          <cylinderGeometry args={[0.35, 0.35, 4, 16]} />
        </mesh>
      </group>
      {/* komora wirnika (przezroczysta rura) */}
      <mesh material={n.waterIn}>
        <cylinderGeometry args={[3.7, 3.7, 3, 40, 1, true]} />
      </mesh>
    </group>
  );
}

/** Trzy rodzaje turbin obok siebie, każda z zakresem spadów, do których pasuje. */
export function TurbineTypes({ spin }: { spin: () => number }) {
  const francis = useRef<THREE.Group>(null);
  useFrame(() => {
    if (francis.current) francis.current.rotation.y = spin();
  });
  return (
    <group position={LAB}>
      <group position={[-17, 0, 0]}>
        <Pelton spin={spin} />
        <Lbl pos={[0, 6.5, 0]} sub color="#e2e8f0">
          Pelton – wysokie góry
        </Lbl>
        <Lbl pos={[0, -7, 0]} sub color="#94a3b8">
          spad 200–1800 m, mało wody
        </Lbl>
      </group>
      <group position={[0, 0, 0]}>
        <group rotation={[0.55, 0, 0]}>
          <group ref={francis}>
            <FrancisRunner scale={1.6} />
          </group>
        </group>
        <Lbl pos={[0, 5, 0]} sub color="#fde68a">
          Francis – jak w tej elektrowni
        </Lbl>
        <Lbl pos={[0, -5, 0]} sub color="#94a3b8">
          spad 30–700 m
        </Lbl>
      </group>
      <group position={[17, 0, 0]}>
        <group rotation={[0.45, 0, 0]} scale={1.3}>
          <Kaplan spin={spin} />
        </group>
        <Lbl pos={[0, 6, 0]} sub color="#e2e8f0">
          Kaplan – duże rzeki na nizinach
        </Lbl>
        <Lbl pos={[0, -5, 0]} sub color="#94a3b8">
          spad 2–40 m, dużo wody
        </Lbl>
      </group>
    </group>
  );
}

/* ================= kierownica w powiększeniu ================= */

/**
 * Spirala, kierownica i wirnik widziane z góry (powiększone): łopatki kierownicy obracają się wraz z `open()`,
 * a kropki wody wpływają ze spirali między łopatki do wirnika – tym gęściej, im szerzej otwarte.
 */
export function GateLab({ open, spin }: { open: () => number; spin: () => number }) {
  const runner = useRef<THREE.Group>(null);
  const N = 260;
  const seeds = useMemo(() => {
    const r = rng(71);
    return Array.from({ length: N }, () => ({ a: r() * Math.PI * 2, s: r(), w: r() }));
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = open();
    if (runner.current) runner.current.rotation.y = spin();
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    seeds.forEach((q, i) => {
      q.s = (q.s + dt * (0.25 + 0.6 * k)) % 1;
      // ze spirali (promień 6) do środka wirnika, zakręcając razem z obrotem wody
      const rr = 6.2 - q.s * 5.6;
      const a = q.a - q.s * (1.6 + 0.8 * k);
      const on = q.w < k * 1.05;
      p.setXYZ(i, Math.cos(a) * rr, on ? 1.2 + (q.w - 0.5) * 0.6 : -500, -Math.sin(a) * rr);
    });
    p.needsUpdate = true;
  });
  return (
    <group position={GATE_LAB} scale={2.4}>
      <Spiral cover={false} />
      <GuideVanes open={open} />
      <group ref={runner}>
        <FrancisRunner />
      </group>
      <points geometry={geo} frustumCulled={false}>
        <pointsMaterial map={dotTex()} color="#5fb4ff" size={0.22} sizeAttenuation transparent depthWrite={false} />
      </points>
      <Lbl pos={[TU_LBL, 2.6, 0]} sub color="#fde68a">
        łopatki kierownicy
      </Lbl>
      <Lbl pos={[0, 2.8, 0]} sub color="#e2e8f0">
        wirnik
      </Lbl>
      <Lbl pos={[-6.4, 3.4, -3]} sub color="#7dd3fc">
        spirala
      </Lbl>
    </group>
  );
}
const TU_LBL = 3.4;

/* ================= ryby w przepławce ================= */

/** Ryby płynące pod prąd: przeskakują z basenu do basenu przepławki. */
export function Fish() {
  const N = 8;
  const refs = useRef<(THREE.Group | null)[]>([]);
  const seeds = useMemo(() => {
    const r = rng(61);
    return Array.from({ length: N }, () => ({ s: r(), sp: 0.03 + r() * 0.02, dx: (r() - 0.5) * 4 }));
  }, []);
  useFrame(({ clock }, dt0) => {
    const dt = Math.min(dt0, 0.05);
    refs.current.forEach((g, i) => {
      if (!g) return;
      const q = seeds[i];
      q.s = (q.s + dt * q.sp) % 1;
      // od najniższego basenu (koniec listy) do najwyższego; przy przejściu między basenami – skok
      const u = (1 - q.s) * (FISH.length - 1);
      const k = Math.min(FISH.length - 2, Math.floor(u));
      const t = u - k;
      const a = FISH[k];
      const b = FISH[k + 1];
      const jump = t > 0.75 ? Math.sin(((t - 0.75) / 0.25) * Math.PI) * 1.6 : 0;
      g.position.set(mix(a.x, b.x, t) + q.dx, mix(a.y, b.y, t) + 0.4 + jump, mix(a.z, b.z, t) + Math.sin(clock.elapsedTime * 2 + i) * 0.8);
      g.rotation.set(jump > 0 ? -0.5 : 0, Math.PI, Math.sin(clock.elapsedTime * 8 + i) * 0.2);
    });
  });
  return (
    <group>
      {seeds.map((_, i) => (
        <group key={i} ref={(g) => (refs.current[i] = g)}>
          <mesh scale={[0.35, 0.3, 1]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#c0843a" roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0, 1.1]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.3]}>
            <coneGeometry args={[0.35, 0.6, 4]} />
            <meshStandardMaterial color="#a86f2c" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

