import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import type { Subject } from '../lib/types';
import { subjectLabels, subjectMeta } from '../lib/subjects';

/** Okazy z każdego przedmiotu – zmieniają się co kilka sekund. */
const SPECIMENS: Record<Subject, string[]> = {
  matematyka: ['f′(x) = 2ax + b', 'sin²α + cos²α = 1', 'Δ = b² − 4ac', 'aₙ = a₁ · qⁿ⁻¹', 'a² + b² = c²'],
  fizyka: ['T = 2π√(l/g)', 'F = m · a', 'E = h · ν', 'p = m · v', 'Eₖ = mv² / 2'],
  chemia: ['sp³ · 109,5°', 'pH = −log[H⁺]', 'n = m / M', '2H₂ + O₂ → 2H₂O', 'Cp = mₛ / mᵣ · 100%'],
  lotnictwo: ['F = ṁ·(vⱼ − v₀)', 'BPR 11:1', 'N1 · N2 · EGT', 'η = 2 / (1 + vⱼ/v₀)', 'rewers'],
  polski: ['– ∪ – ∪ – ∪', 'oksymoron', 'Pan Tadeusz', 'zdanie złożone', 'romantyzm'],
  angielski: ['had + been + V₃', 'If I were…', 'is being done', 'said that…', 'will have done'],
};

const ORBITS: { s: Subject; r: number; tilt: [number, number]; speed: number; phase: number }[] = [
  { s: 'matematyka', r: 2.5, tilt: [1.15, 0.3], speed: 0.42, phase: 0 },
  { s: 'fizyka', r: 2.9, tilt: [1.3, -0.9], speed: 0.33, phase: 1.3 },
  { s: 'chemia', r: 2.15, tilt: [0.5, 1.2], speed: 0.55, phase: 2.6 },
  { s: 'lotnictwo', r: 3.05, tilt: [1.0, 2.8], speed: 0.3, phase: 4.5 },
  { s: 'polski', r: 3.25, tilt: [1.45, 1.9], speed: 0.27, phase: 3.9 },
  { s: 'angielski', r: 2.7, tilt: [0.85, -2.2], speed: 0.38, phase: 5.1 },
];

function Nucleus() {
  const g = useRef<THREE.Group>(null);
  const pts = useMemo(() => {
    const n = 22;
    return Array.from({ length: n }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963;
      return { p: new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(0.36), proton: i % 2 === 0 };
    });
  }, []);
  useFrame((st, dt) => {
    if (!g.current) return;
    g.current.rotation.y += dt * 0.3;
    g.current.rotation.x += dt * 0.12;
    const s = 1 + Math.sin(st.clock.elapsedTime * 2) * 0.03;
    g.current.scale.setScalar(s);
  });
  return (
    <group ref={g}>
      {pts.map(({ p, proton }, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.2, 24, 24]} />
          <meshStandardMaterial color={proton ? '#ff6a45' : '#ffc2ad'} roughness={0.3} emissive={proton ? '#ff4d2a' : '#ff9a7a'} emissiveIntensity={0.25} />
        </mesh>
      ))}
      <mesh>
        <sphereGeometry args={[0.95, 32, 32]} />
        <meshBasicMaterial color="#ff5a36" transparent opacity={0.07} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Label({ s }: { s: Subject }) {
  const list = SPECIMENS[s];
  const [k, setK] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => {
    const id = setInterval(() => setK((v) => (v + 1) % list.length), 3200 + Math.random() * 2400);
    return () => clearInterval(id);
  }, [list.length]);
  return (
    <span className="specimen" style={{ '--accent': subjectMeta[s].color } as React.CSSProperties}>
      <span>{subjectLabels[s].replace('Język ', '').toLowerCase()}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.b key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
          {list[k]}
        </motion.b>
      </AnimatePresence>
    </span>
  );
}

function Orbit({ o, still }: { o: (typeof ORBITS)[number]; still: boolean }) {
  const color = subjectMeta[o.s].color;
  const plane = useRef<THREE.Group>(null);
  const electron = useRef<THREE.Group>(null);
  const label = useRef<HTMLDivElement>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((st, dt) => {
    const t = still ? o.phase : st.clock.elapsedTime * o.speed + o.phase;
    if (plane.current && !still) plane.current.rotation.y += dt * 0.05; // precesja orbity
    if (electron.current) {
      electron.current.position.set(Math.cos(t) * o.r, 0, Math.sin(t) * o.r);
      // etykieta przygasa i maleje, gdy elektron jest za jądrem
      electron.current.getWorldPosition(tmp);
      const depth = THREE.MathUtils.clamp((tmp.z + o.r) / (2 * o.r), 0, 1);
      if (label.current) {
        label.current.style.opacity = String(0.35 + depth * 0.65);
        label.current.style.transform = `scale(${0.82 + depth * 0.18})`;
        label.current.style.zIndex = String(Math.round(depth * 100));
      }
    }
  });
  return (
    <group rotation={[o.tilt[0], 0, o.tilt[1]]}>
      <group ref={plane}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[o.r, 0.008, 8, 160]} />
          <meshBasicMaterial color={color} transparent opacity={0.35} />
        </mesh>
        <group ref={electron}>
          <mesh>
            <sphereGeometry args={[0.1, 20, 20]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.22, 20, 20]} />
            <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
          </mesh>
          <Html center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
            <div ref={label} className="hero-label">
              <Label s={o.s} />
            </div>
          </Html>
        </group>
      </group>
    </group>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((st) => {
    if (!g.current) return;
    // łagodne odchylenie za kursorem
    g.current.rotation.x = THREE.MathUtils.lerp(g.current.rotation.x, -st.pointer.y * 0.25, 0.05);
    g.current.rotation.y = THREE.MathUtils.lerp(g.current.rotation.y, st.pointer.x * 0.4, 0.05);
  });
  return <group ref={g}>{children}</group>;
}

export function HeroAtom({ still = false }: { still?: boolean }) {
  return (
    <div className="hero-art" aria-hidden>
      <Canvas camera={{ position: [0, 0, 10.5], fov: 42 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[0, 0, 0]} intensity={6} color="#ff7a59" distance={6} />
        <directionalLight position={[4, 6, 5]} intensity={1.3} />
        <Rig>
          <Nucleus />
          {ORBITS.map((o) => (
            <Orbit key={o.s} o={o} still={still} />
          ))}
        </Rig>
      </Canvas>
    </div>
  );
}
