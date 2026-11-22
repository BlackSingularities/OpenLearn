/*
 * Elektrownia jądrowa – efekty i powiększenia: reakcja łańcuchowa (neutrony, jądra uranu, rozszczepienia, woda
 * spowalniająca neutrony i pręty sterujące, które je pochłaniają), paliwo od pastylki do kasety, świecenie
 * Czerenkowa w basenie, wrzenie wody w wytwornicy pary, bierne chłodzenie obudowy, przenoszenie kasety
 * przy wymianie paliwa.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Lbl } from '../aviation/airliner';
import { dotTex } from './coalFx';
import { CV, POOL, P_REFUEL, SG, SHIELD, rng, type V3 } from './nuclearGeo';

/** Powiększenia stoją nad lasem, z dala od budynków. */
export const LAB: V3 = [60, 46, 200];
export const FUEL_LAB: V3 = [150, 46, 200];

/* ================= reakcja łańcuchowa ================= */

interface Nucleus {
  x: number;
  y: number;
  alive: boolean;
  t: number;
}
interface Neutron {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}
interface Frag {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

const COLS = 8;
const ROWS = 5;
const SP = 6;
const W = COLS * SP;
const HH = ROWS * SP;

export interface ChainStats {
  neutrons: number;
  rate: number;
}

/**
 * Reakcja łańcuchowa w powiększeniu (płaska plansza). `rods()` – wsunięcie prętów 0…1; `stats` – licznik dla ramki.
 * Neutron prędki (pomarańczowy) zwalnia w wodzie (staje się niebieski) i dopiero wolny rozszczepia jądro uranu-235:
 * jądro rozpada się na dwa odłamki (ich ruch to ciepło) i wyrzuca 2–3 nowe neutrony. Pręty pochłaniają neutrony.
 */
export function ChainReaction({ rods, stats, moderated = true }: { rods: () => number; stats: React.MutableRefObject<ChainStats>; moderated?: boolean }) {
  const st = useMemo(() => {
    const nuclei: Nucleus[] = [];
    for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) nuclei.push({ x: (i + 0.5) * SP - W / 2 + (j % 2) * 1.2, y: (j + 0.5) * SP - HH / 2, alive: true, t: 0 });
    return { nuclei, neutrons: [] as Neutron[], frags: [] as Frag[], flashes: [] as { x: number; y: number; age: number }[], src: 0, fissions: [] as number[], time: 0, r: rng(5) };
  }, []);
  const MAXN = 70;
  const meshes = useMemo(() => {
    const nuc = new THREE.InstancedMesh(new THREE.SphereGeometry(1.35, 20, 14), new THREE.MeshStandardMaterial({ color: '#7cc36a', roughness: 0.4 }), st.nuclei.length);
    const neu = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), MAXN);
    neu.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXN * 3), 3);
    const frag = new THREE.InstancedMesh(new THREE.SphereGeometry(0.85, 14, 10), new THREE.MeshStandardMaterial({ color: '#e0a25a', roughness: 0.5 }), 90);
    const flash = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 40);
    for (const m of [nuc, neu, frag, flash]) m.frustumCulled = false;
    return { nuc, neu, frag, flash };
  }, [st]);
  const rodRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ROD_X = [-W / 2 + SP * 2, 0, W / 2 - SP * 2];
  const o = useMemo(() => new THREE.Object3D(), []);
  const fast = useMemo(() => new THREE.Color('#ff9a3c'), []);
  const slow = useMemo(() => new THREE.Color('#5ab0ff'), []);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const S = st;
    S.time += dt;
    const k = rods();
    const rodBottom = HH / 2 - k * HH;
    // źródło: gdy nie ma neutronów, co chwilę wpada jeden z lewej (jak ze źródła rozruchowego)
    S.src -= dt;
    if (S.neutrons.length === 0 && S.src < 0) {
      S.src = 1.2;
      S.neutrons.push({ x: -W / 2 - 2, y: (S.r() - 0.5) * HH * 0.6, vx: 18, vy: (S.r() - 0.5) * 4, age: 0 });
    }
    // jądra wracają (w paliwie są ich miliardy – na planszy zastępujemy zużyte)
    for (const n of S.nuclei)
      if (!n.alive) {
        n.t -= dt;
        if (n.t < 0) n.alive = true;
      }
    // ruch neutronów: zwalniają w wodzie, pochłaniają je pręty, uciekają poza planszę
    for (let i = S.neutrons.length - 1; i >= 0; i--) {
      const q = S.neutrons[i];
      q.age += dt;
      const sp = Math.hypot(q.vx, q.vy);
      // w wodzie neutrony szybko zwalniają; bez wody zostają prędkie
      const target = moderated ? 6 : 21;
      const ns = target + (sp - target) * Math.exp(-dt * 2.2);
      q.vx *= ns / sp;
      q.vy *= ns / sp;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      let dead = Math.abs(q.x) > W / 2 + 4 || Math.abs(q.y) > HH / 2 + 3;
      for (const rx of ROD_X) if (Math.abs(q.x - rx) < 0.9 && q.y > rodBottom) dead = true;
      if (!dead && ns < 9) {
        for (const n of S.nuclei) {
          if (!n.alive || Math.hypot(n.x - q.x, n.y - q.y) > 1.6) continue;
          // rozszczepienie
          n.alive = false;
          n.t = 3 + S.r() * 3;
          dead = true;
          S.fissions.push(S.time);
          const a = S.r() * Math.PI * 2;
          for (const sg of [1, -1]) S.frags.push({ x: n.x, y: n.y, vx: Math.cos(a) * 9 * sg, vy: Math.sin(a) * 9 * sg, age: 0 });
          S.flashes.push({ x: n.x, y: n.y, age: 0 });
          const nn = S.r() < 0.5 ? 2 : 3;
          for (let j = 0; j < nn; j++) {
            if (S.neutrons.length >= MAXN) break;
            const b = S.r() * Math.PI * 2;
            S.neutrons.push({ x: n.x, y: n.y, vx: Math.cos(b) * 22, vy: Math.sin(b) * 22, age: 0 });
          }
          break;
        }
      }
      if (dead) S.neutrons.splice(i, 1);
    }
    S.fissions = S.fissions.filter((t) => S.time - t < 2);
    stats.current.neutrons = S.neutrons.length;
    stats.current.rate = S.fissions.length / 2;
    // rysowanie
    const { nuc, neu, frag, flash } = meshes;
    S.nuclei.forEach((n, i) => {
      o.position.set(n.x, n.y, 0);
      o.scale.setScalar(n.alive ? 1 : 0.001);
      o.updateMatrix();
      nuc.setMatrixAt(i, o.matrix);
    });
    nuc.instanceMatrix.needsUpdate = true;
    let j = 0;
    for (const q of S.neutrons) {
      o.position.set(q.x, q.y, 0.4);
      o.scale.setScalar(1);
      o.updateMatrix();
      neu.setMatrixAt(j, o.matrix);
      const f = Math.min(1, Math.max(0, (Math.hypot(q.vx, q.vy) - 6) / 14));
      c.copy(slow).lerp(fast, f);
      neu.setColorAt(j, c);
      j++;
    }
    neu.count = j;
    neu.instanceMatrix.needsUpdate = true;
    if (neu.instanceColor) neu.instanceColor.needsUpdate = true;
    j = 0;
    for (let i = S.frags.length - 1; i >= 0; i--) {
      const q = S.frags[i];
      q.age += dt;
      q.vx *= Math.exp(-dt * 1.5);
      q.vy *= Math.exp(-dt * 1.5);
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.age > 1.6 || j >= 90) {
        S.frags.splice(i, 1);
        continue;
      }
      o.position.set(q.x, q.y, 0.2);
      o.scale.setScalar(1 - q.age / 1.8);
      o.updateMatrix();
      frag.setMatrixAt(j++, o.matrix);
    }
    frag.count = j;
    frag.instanceMatrix.needsUpdate = true;
    j = 0;
    for (let i = S.flashes.length - 1; i >= 0; i--) {
      const q = S.flashes[i];
      q.age += dt;
      if (q.age > 0.5 || j >= 40) {
        S.flashes.splice(i, 1);
        continue;
      }
      o.position.set(q.x, q.y, 0.6);
      o.scale.setScalar(1 + q.age * 7);
      o.updateMatrix();
      flash.setMatrixAt(j++, o.matrix);
    }
    flash.count = j;
    flash.instanceMatrix.needsUpdate = true;
    rodRefs.current.forEach((m) => {
      if (!m) return;
      const len = Math.max(0.01, k * HH + 4);
      m.scale.y = len;
      m.position.y = HH / 2 + 4 - len / 2;
    });
  });
  return (
    <group position={LAB}>
      {/* tło: woda (moderator) w ramce */}
      <mesh position={[0, 0, -1.2]}>
        <planeGeometry args={[W + 8, HH + 8]} />
        <meshStandardMaterial color={moderated ? '#1c4f80' : '#3a3f47'} transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, -1.3]}>
        <boxGeometry args={[W + 9, HH + 9, 0.3]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <primitive object={meshes.nuc} />
      <primitive object={meshes.neu} />
      <primitive object={meshes.frag} />
      <primitive object={meshes.flash} />
      {ROD_X.map((x, i) => (
        <mesh key={x} ref={(m) => (rodRefs.current[i] = m)} position={[x, 0, 0.1]}>
          <boxGeometry args={[1.4, 1, 1.2]} />
          <meshStandardMaterial color="#1f2328" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      <Lbl pos={[-W / 2 + 3, HH / 2 + 7, 0]} sub color="#7cc36a">
        jądra uranu-235
      </Lbl>
      <Lbl pos={[0, HH / 2 + 7, 0]} sub color="#cbd5e1">
        pręty sterujące
      </Lbl>
      <Lbl pos={[W / 2 - 4, HH / 2 + 7, 0]} sub color={moderated ? '#5ab0ff' : '#94a3b8'}>
        {moderated ? 'woda spowalnia neutrony' : 'brak wody – neutrony zostają prędkie'}
      </Lbl>
      <Lbl pos={[0, -HH / 2 - 6, 0]} sub color="#cbd5e1">
        powiększenie: w rzeczywistości jądro ma ok. 0,000 000 000 000 01 m
      </Lbl>
    </group>
  );
}

/* ================= paliwo w powiększeniu ================= */

/** Pastylka, pręt paliwowy (w przekroju – stos pastylek w koszulce) i kaseta 17 × 17 prętów z kratkami dystansowymi. */
export function FuelExhibit() {
  const rods = useMemo(() => {
    const n = 17 * 17;
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.075, 24, 6), new THREE.MeshStandardMaterial({ color: '#b9c2cc', metalness: 0.6, roughness: 0.35 }), n);
    const o = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < 17; i++)
      for (let j = 0; j < 17; j++) {
        o.position.set((i - 8) * 0.2, 0, (j - 8) * 0.2);
        o.updateMatrix();
        im.setMatrixAt(k++, o.matrix);
      }
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, []);
  const pellet = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b3a38', roughness: 0.6, metalness: 0.2 }), []);
  const clad = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c8ced4', metalness: 0.7, roughness: 0.3, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), []);
  return (
    <group position={FUEL_LAB}>
      {/* pastylka (powiększona ok. 500 razy) */}
      <group position={[-26, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[2, 2, 2.5, 40]} />
          <primitive object={pellet} attach="material" />
        </mesh>
        <Lbl pos={[0, 4.5, 0]} sub color="#e2e8f0">
          pastylka UO₂ (ok. 8 × 10 mm)
        </Lbl>
      </group>
      {/* pręt paliwowy: koszulka z cyrkonu i stos pastylek (powiększony ok. 25 razy w poprzek) */}
      <group position={[-12, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 26, 24, 1, true]} />
          <primitive object={clad} attach="material" />
        </mesh>
        {Array.from({ length: 30 }, (_, i) => (
          <mesh key={i} position={[0, -12 + i * 0.75, 0]} material={pellet}>
            <cylinderGeometry args={[0.42, 0.42, 0.66, 16]} />
          </mesh>
        ))}
        <Lbl pos={[0, 15.5, 0]} sub color="#e2e8f0">
          pręt paliwowy (4 m, ok. 370 pastylek)
        </Lbl>
      </group>
      {/* kaseta */}
      <group position={[6, 0, 0]}>
        <primitive object={rods} />
        {[-10, -5, 0, 5, 10].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[3.5, 0.3, 3.5]} />
            <meshStandardMaterial color="#d6dbe0" metalness={0.6} roughness={0.35} transparent opacity={0.8} />
          </mesh>
        ))}
        <mesh position={[0, 12.6, 0]}>
          <boxGeometry args={[3.6, 1, 3.6]} />
          <meshStandardMaterial color="#8a939c" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, -12.6, 0]}>
          <boxGeometry args={[3.6, 1, 3.6]} />
          <meshStandardMaterial color="#8a939c" metalness={0.6} roughness={0.4} />
        </mesh>
        <Lbl pos={[0, 15.5, 0]} sub color="#e2e8f0">
          kaseta paliwowa: 17 × 17 prętów
        </Lbl>
      </group>
      {/* dla skali: rdzeń ma 157 takich kaset */}
      <Lbl pos={[-10, -16, 0]} sub color="#94a3b8">
        rdzeń: 157 kaset, ok. 41 000 prętów, ok. 75 t uranu
      </Lbl>
    </group>
  );
}

/* ================= świecenie Czerenkowa ================= */

/** Niebieska poświata nad paliwem pod wodą (cząstki szybsze od światła w wodzie). */
export function Cherenkov({ at, size, power }: { at: V3; size: [number, number]; power: () => number }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3fa0ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const p = power();
    mat.opacity = 0.26 * p * (0.9 + 0.1 * Math.sin(clock.elapsedTime * 3));
    if (light.current) light.current.intensity = 80 * p;
  });
  return (
    <group position={at}>
      {[0, 1.2, 2.4].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
          <planeGeometry args={size} />
        </mesh>
      ))}
      <pointLight ref={light} color="#4aa8ff" distance={30} decay={1.6} position={[0, 4, 0]} />
    </group>
  );
}

/** Poświata w basenie wypalonego paliwa. */
export function PoolGlow() {
  return <Cherenkov at={[(POOL.x0 + POOL.x1) / 2, POOL.y0 + 4.8, (POOL.z0 + POOL.z1) / 2]} size={[POOL.x1 - POOL.x0 - 1, POOL.z1 - POOL.z0 - 1]} power={() => 1} />;
}

/* ================= wytwornica pary: wrzenie ================= */

/** Pęcherzyki pary w wodzie po stronie wtórnej wytwornicy (wokół rurek) i para w górnej części. */
export function SgBoil({ sg, rate }: { sg: number; rate: () => number }) {
  const N = 500;
  const d = useMemo(() => {
    const r = rng(sg > 0 ? 3 : 7);
    return Array.from({ length: N }, () => ({ a: Math.PI + r() * Math.PI, rr: Math.sqrt(r()), y: SG.y0 + r() * (SG.y1 - SG.y0 - 3), v: 2 + r() * 3 }));
  }, [sg]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = rate();
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    d.forEach((q, i) => {
      q.y += q.v * dt * (0.3 + k);
      if (q.y > SG.y1 - 1) q.y = SG.y0 + 1;
      const R = q.y < SG.yMid ? SG.rLow - 0.3 : SG.rUp - 0.3;
      p.setXYZ(i, sg * SG.x + Math.cos(q.a) * q.rr * R, q.y, Math.sin(q.a) * q.rr * R * 0.95);
    });
    p.needsUpdate = true;
  });
  return (
    <points geometry={geo}>
      <pointsMaterial map={dotTex()} color="#f1f7ff" size={0.18} sizeAttenuation transparent depthWrite={false} />
    </points>
  );
}

/* ================= bierne chłodzenie obudowy ================= */

/**
 * Bierne chłodzenie: woda ze zbiornika na dachu spływa po stalowej obudowie (niebieskie kropki), parując odbiera
 * jej ciepło, a ogrzane powietrze unosi się w szczelinie między obudową a betonem i wylatuje kominem (pomarańczowe).
 * `on()` – 0…1 (czy płynie).
 */
export function PassiveCooling({ on }: { on: () => number }) {
  const N = 900;
  const water = useMemo(() => {
    const r = rng(13);
    return Array.from({ length: N }, () => ({ a: Math.PI + r() * Math.PI, s: r() }));
  }, []);
  const air = useMemo(() => {
    const r = rng(17);
    return Array.from({ length: 500 }, () => ({ a: Math.PI + r() * Math.PI, s: r() }));
  }, []);
  const wg = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  const ag = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(500 * 3), 3));
    return g;
  }, []);
  // droga po obudowie: od szczytu kopuły (s = 0) po kopule i dalej w dół ściany (s = 1)
  const domeLen = (CV.domeH + CV.r) * 0.9;
  const total = domeLen + CV.h;
  const at = (s: number, a: number, out: THREE.Vector3, off = 0.4) => {
    const L = s * total;
    if (L < domeLen) {
      const u = L / domeLen;
      const th = u * (Math.PI / 2);
      const rr = Math.sin(th) * (CV.r + off);
      return out.set(Math.cos(a) * rr, CV.h + Math.cos(th) * (CV.domeH + off), Math.sin(a) * rr);
    }
    const y = CV.h - (L - domeLen);
    return out.set(Math.cos(a) * (CV.r + off), y, Math.sin(a) * (CV.r + off));
  };
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = on();
    const p = wg.getAttribute('position') as THREE.BufferAttribute;
    water.forEach((q, i) => {
      q.s = (q.s + dt * 0.06 * k) % 1;
      at(q.s, q.a, v);
      p.setXYZ(i, v.x, k > 0.01 ? v.y : -100, v.z);
    });
    p.needsUpdate = true;
    const pa = ag.getAttribute('position') as THREE.BufferAttribute;
    air.forEach((q, i) => {
      q.s = (q.s + dt * 0.08 * (0.2 + k)) % 1;
      const y = q.s * (SHIELD.stackTop + 6);
      let rr = (CV.r + SHIELD.r - SHIELD.t) / 2;
      // u góry powietrze zbiega się do komina
      if (y > SHIELD.h) rr = rr * (1 - (y - SHIELD.h) / (SHIELD.stackTop - SHIELD.h)) + 3 * ((y - SHIELD.h) / (SHIELD.stackTop - SHIELD.h));
      pa.setXYZ(i, Math.cos(q.a) * rr, y, Math.sin(q.a) * rr);
    });
    pa.needsUpdate = true;
  });
  return (
    <>
      <points geometry={wg}>
        <pointsMaterial map={dotTex()} color="#7cc8ff" size={0.45} sizeAttenuation transparent depthWrite={false} />
      </points>
      <points geometry={ag}>
        <pointsMaterial map={dotTex()} color="#ffb066" size={0.7} sizeAttenuation transparent depthWrite={false} />
      </points>
    </>
  );
}

/* ================= wymiana paliwa ================= */

/** Kaseta wędrująca z rdzenia do basenu (`u()` – postęp 0…1 po drodze P_REFUEL). */
export function RefuelAssembly({ u }: { u: () => number }) {
  const ref = useRef<THREE.Group>(null);
  const { cum, total } = useMemo(() => {
    const cum = [0];
    for (let i = 1; i < P_REFUEL.length; i++) {
      const a = P_REFUEL[i - 1];
      const b = P_REFUEL[i];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    return { cum, total: cum[cum.length - 1] };
  }, []);
  useFrame(() => {
    const d = Math.min(1, Math.max(0, u())) * total;
    let j = 1;
    while (j < cum.length - 1 && cum[j] < d) j++;
    const k = (d - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]);
    const a = P_REFUEL[j - 1];
    const b = P_REFUEL[j];
    ref.current?.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
  });
  // kaseta ma tylko ok. 20 cm szerokości – poświata wokół niej (świecenie Czerenkowa w wodzie) pozwala ją śledzić
  return (
    <group ref={ref}>
      <mesh>
        <boxGeometry args={[0.21, 4.3, 0.21]} />
        <meshStandardMaterial color="#b9c2cc" metalness={0.6} roughness={0.35} emissive="#2a7fff" emissiveIntensity={0.8} />
      </mesh>
      <mesh scale={[1.4, 3.2, 1.4]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshBasicMaterial color="#3fa0ff" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight color="#4aa8ff" intensity={40} distance={14} decay={1.5} />
      <Lbl pos={[0, 4.5, 0]} sub color="#7cc7ff">
        kaseta paliwowa
      </Lbl>
    </group>
  );
}
