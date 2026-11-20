import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal, Sparkline } from '../../lib/plot';
import { Lights } from '../../lib/three';
import { num } from '../../lib/mathkit';

const RED = '#ef4444';
const BLUE = '#3b82f6';
const GOLD = '#ffd166';
const PINK = '#ff6b8b';

function useRefresh(ms = 100) {
  const [, set] = useState(0);
  const acc = useRef(0);
  return (dt: number) => {
    acc.current += dt * 1000;
    if (acc.current > ms) {
      acc.current = 0;
      set((n) => n + 1);
    }
  };
}

function Magnet({ flip }: { flip: boolean }) {
  return (
    <group rotation={[0, 0, flip ? Math.PI : 0]}>
      <mesh position={[0.45, 0, 0]}>
        <boxGeometry args={[0.9, 0.42, 0.42]} />
        <meshStandardMaterial color={RED} />
      </mesh>
      <mesh position={[-0.45, 0, 0]}>
        <boxGeometry args={[0.9, 0.42, 0.42]} />
        <meshStandardMaterial color={BLUE} />
      </mesh>
    </group>
  );
}

/** Miernik z wychylaną wskazówką. */
function Meter({ value, position }: { value: number; position: [number, number, number] }) {
  const needle = useRef<THREE.Group>(null);
  useFrame(() => {
    if (needle.current) needle.current.rotation.z += (-Math.max(-1.2, Math.min(1.2, value)) - needle.current.rotation.z) * 0.3;
  });
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[1.4, 1, 0.2]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[0, -0.3, 0.11]}>
        <circleGeometry args={[0.06, 16]} />
        <meshStandardMaterial color="#0b0d12" />
      </mesh>
      <group ref={needle} position={[0, -0.3, 0.12]}>
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[0.03, 0.64, 0.01]} />
          <meshStandardMaterial color={RED} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- Krok 1: magnes i cewka ---------- */
function CoilScene({ params }: SceneProps) {
  const speed = Number(params.speed);
  const turns = Number(params.n);
  const flip = Boolean(params.flip);
  const magnet = useRef<THREE.Group>(null);
  const st = useRef({ t: 0, x: -3, phi: 0, emf: 0, hPhi: [] as number[], hE: [] as number[] });
  const refresh = useRefresh(120);
  const flux = (x: number) => (flip ? -1 : 1) / Math.pow(1 + (x / 0.9) ** 2, 1.5);
  useFrame((_, dt) => {
    const s = st.current;
    s.t += dt;
    const x = -3.2 * Math.cos(s.t * speed * 0.8);
    const ph = flux(x);
    s.emf = (-(ph - s.phi) / Math.max(dt, 1e-3)) * turns * 0.05;
    s.phi = ph;
    s.x = x;
    s.hPhi.push(ph);
    s.hE.push(s.emf);
    if (s.hPhi.length > 160) {
      s.hPhi.shift();
      s.hE.shift();
    }
    magnet.current?.position.set(x, 0, 0);
    refresh(dt);
  });
  const s = st.current;
  const rings = Array.from({ length: Math.min(24, turns / 4) }, (_, i) => i);
  return (
    <group>
      <Lights />
      {rings.map((i) => (
        <mesh key={i} position={[-0.6 + (i / Math.max(1, rings.length - 1)) * 1.2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.6, 0.035, 8, 40]} />
          <meshStandardMaterial color="#d97706" metalness={0.7} roughness={0.3} emissive={GOLD} emissiveIntensity={Math.min(0.8, Math.abs(s.emf) * 0.3)} />
        </mesh>
      ))}
      <group ref={magnet}>
        <Magnet flip={flip} />
      </group>
      <Meter value={s.emf * 0.6} position={[0, 1.8, -0.6]} />
      <InfoPortal>
        <div style={{ color: GOLD, fontWeight: 600 }}>SEM ε = −n · ΔΦ/Δt = {num(s.emf, 2)}</div>
        <div>liczba zwojów n = {turns}</div>
        <Sparkline series={[{ data: s.hPhi, color: BLUE, label: 'Φ' }, { data: s.hE, color: PINK, label: 'ε' }]} min={-2.5} max={2.5} height={60} />
        <div className="muted-line">prąd płynie tylko wtedy, gdy strumień się zmienia</div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 2: prądnica ---------- */
function GeneratorScene({ params }: SceneProps) {
  const f = Number(params.f);
  const B = Number(params.B);
  const coil = useRef<THREE.Group>(null);
  const st = useRef({ t: 0, hPhi: [] as number[], hE: [] as number[], e: 0 });
  const refresh = useRefresh(120);
  const S = 1.6;
  useFrame((_, dt) => {
    const s = st.current;
    s.t += dt;
    const w = 2 * Math.PI * f * 0.5;
    const ang = w * s.t;
    const ph = B * S * Math.cos(ang);
    s.e = B * S * w * Math.sin(ang);
    s.hPhi.push(ph);
    s.hE.push(s.e);
    if (s.hPhi.length > 200) {
      s.hPhi.shift();
      s.hE.shift();
    }
    if (coil.current) coil.current.rotation.y = ang;
    refresh(dt);
  });
  const s = st.current;
  const bulb = Math.min(1, Math.abs(s.e) / 8);
  return (
    <group>
      <Lights />
      <mesh position={[-2.2, 0, 0]}>
        <boxGeometry args={[1, 2, 1.6]} />
        <meshStandardMaterial color={RED} />
      </mesh>
      <mesh position={[2.2, 0, 0]}>
        <boxGeometry args={[1, 2, 1.6]} />
        <meshStandardMaterial color={BLUE} />
      </mesh>
      {[-0.6, 0, 0.6].map((y) =>
        [-0.5, 0.5].map((z) => (
          <mesh key={`${y}${z}`} position={[0, y, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.012, 3.4, 6]} />
            <meshStandardMaterial color="#93c5fd" transparent opacity={0.35 + B * 0.1} />
          </mesh>
        )),
      )}
      <group ref={coil}>
        {[
          [[0, 0.8, 0], [0.04, 0.04, S]],
          [[0, -0.8, 0], [0.04, 0.04, S]],
          [[0, 0, 0.8], [0.04, S, 0.04]],
          [[0, 0, -0.8], [0.04, S, 0.04]],
        ].map(([p, size], i) => (
          <mesh key={i} position={p as [number, number, number]}>
            <boxGeometry args={size as [number, number, number]} />
            <meshStandardMaterial color="#d97706" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[S, S]} />
          <meshStandardMaterial color={GOLD} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
      <mesh position={[0, -1.7, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.4, 8]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <sphereGeometry args={[0.3, 24, 24]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={bulb * 1.5} transparent opacity={0.4 + bulb * 0.6} />
      </mesh>
      <pointLight position={[0, 2, 0]} intensity={bulb * 6} color={GOLD} distance={5} />
      <InfoPortal>
        <div style={{ color: BLUE }}>Φ = B·S·cos ωt</div>
        <div style={{ color: PINK, fontWeight: 600 }}>ε = B·S·ω·sin ωt, amplituda {num(B * S * 2 * Math.PI * f * 0.5, 2)}</div>
        <Sparkline series={[{ data: s.hPhi, color: BLUE, label: 'Φ' }, { data: s.hE, color: PINK, label: 'ε' }]} height={60} />
        <div className="muted-line">gdy ramka jest prostopadła do pola, Φ jest największy, a ε = 0</div>
      </InfoPortal>
    </group>
  );
}

export const induction: Topic = {
  id: 'indukcja',
  title: 'Indukcja elektromagnetyczna',
  subject: 'fizyka',
  summary: 'Magnes przesuwany przez cewkę z wychylającym się miernikiem i prądnica, w której obracająca się ramka wytwarza prąd przemienny.',
  accent: '#c084fc',
  glyph: 'ε',
  steps: [
    {
      title: 'Magnes i cewka',
      kind: '3d',
      scene: CoilScene,
      camera: [1, 2.5, 6],
      target: [0, 0.5, 0],
      controls: [
        { type: 'slider', key: 'speed', label: 'Szybkość ruchu magnesu', min: 0.3, max: 3, step: 0.1, default: 1 },
        { type: 'slider', key: 'n', label: 'Liczba zwojów', min: 20, max: 200, step: 10, default: 80 },
        { type: 'toggle', key: 'flip', label: 'Odwróć magnes', default: false },
      ],
      body: (
        <>
          <div className="formula">ε = −n · ΔΦ / Δt</div>
          <p>
            Gdy magnes się zbliża, przez cewkę przechodzi coraz więcej linii pola – <strong>strumień Φ rośnie</strong>, a
            w cewce pojawia się napięcie. Gdy magnes się oddala, strumień maleje i wskazówka wychyla się w drugą stronę.
          </p>
          <p>
            Napięcie zależy od <strong>szybkości zmian</strong>, nie od samego pola: magnes nieruchomy w środku cewki nie
            daje nic. Szybszy ruch i więcej zwojów – większe wychylenie. Minus w prawie Faradaya to reguła Lenza: prąd
            indukcyjny przeciwdziała zmianie, która go wywołała.
          </p>
        </>
      ),
    },
    {
      title: 'Prądnica prądu przemiennego',
      kind: '3d',
      scene: GeneratorScene,
      camera: [1.8, 2.6, 8],
      controls: [
        { type: 'slider', key: 'f', label: 'Obroty na sekundę', min: 0.1, max: 2, step: 0.05, default: 0.5 },
        { type: 'slider', key: 'B', label: 'Indukcja pola B', min: 0.5, max: 3, step: 0.1, default: 1.5 },
      ],
      body: (
        <>
          <div className="formula">ε(t) = B·S·ω · sin(ωt)</div>
          <p>
            Ramka obraca się między biegunami magnesu. Strumień przez nią zmienia się jak cosinus, więc indukowane
            napięcie zmienia się jak <strong>sinus</strong> – to prąd przemienny.
          </p>
          <p>
            Największe napięcie powstaje, gdy ramka jest równoległa do linii pola (strumień przechodzi przez zero
            najszybciej). Szybsze obroty dają większą amplitudę i częstotliwość – w polskiej sieci to 50 Hz.
          </p>
        </>
      ),
    },
  ],
};
