import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';

/** Rozwiązanie równania Keplera M = E − e·sin E metodą Newtona. */
function eccentricAnomaly(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

/** Pozycja na orbicie (Słońce w ognisku, w początku układu). Orbita leży w płaszczyźnie XZ. */
function orbitPos(a: number, e: number, M: number): THREE.Vector3 {
  const E = eccentricAnomaly(M, e);
  const b = a * Math.sqrt(1 - e * e);
  return new THREE.Vector3(a * (Math.cos(E) - e), 0, -b * Math.sin(E));
}

function ellipsePoints(a: number, e: number, n = 256): THREE.Vector3[] {
  const b = a * Math.sqrt(1 - e * e);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const E = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(a * (Math.cos(E) - e), 0, -b * Math.sin(E)));
  }
  return pts;
}

function Sun() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.45, 48, 48]} />
        <meshBasicMaterial color="#ffcf5a" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.7, 32, 32]} />
        <meshBasicMaterial color="#ffb02e" transparent opacity={0.18} />
      </mesh>
      <pointLight intensity={60} distance={60} color="#fff2d0" />
    </group>
  );
}

const SECTORS = 12;
const SECTOR_COLORS = ['#5b6cff', '#ff6b8b'];

function SweptSectors({ a, e, active }: { a: number; e: number; active: number }) {
  const geometries = useMemo(() => {
    return Array.from({ length: SECTORS }, (_, k) => {
      const verts: number[] = [];
      const steps = 24;
      for (let i = 0; i < steps; i++) {
        const m0 = ((k + i / steps) / SECTORS) * Math.PI * 2;
        const m1 = ((k + (i + 1) / steps) / SECTORS) * Math.PI * 2;
        const p0 = orbitPos(a, e, m0);
        const p1 = orbitPos(a, e, m1);
        verts.push(0, 0, 0, p0.x, 0, p0.z, p1.x, 0, p1.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      return g;
    });
  }, [a, e]);

  return (
    <>
      {geometries.map((g, k) => (
        <mesh key={k} geometry={g} position={[0, -0.01, 0]}>
          <meshBasicMaterial
            color={SECTOR_COLORS[k % 2]}
            transparent
            opacity={k === active ? 0.55 : 0.16}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

function Planet({ color, size }: { color: string; size: number }) {
  return (
    <mesh>
      <sphereGeometry args={[size, 32, 32]} />
      <meshStandardMaterial color={color} roughness={0.6} emissive={color} emissiveIntensity={0.15} />
    </mesh>
  );
}

function SingleOrbitScene({ params }: SceneProps) {
  const e = Number(params.e ?? 0.5);
  const speed = Number(params.speed ?? 1);
  const playing = Boolean(params.play ?? true);
  const showSectors = Boolean(params.sectors);
  const showFoci = Boolean(params.foci);
  const showVelocity = Boolean(params.velocity);
  const a = 4.5;

  const M = useRef(0);
  const planet = useRef<THREE.Group>(null);
  const radius = useRef<THREE.Mesh>(null);
  const label = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);

  const pts = useMemo(() => ellipsePoints(a, e), [e]);

  useFrame((_, dt) => {
    if (playing) M.current = (M.current + dt * 0.6 * speed) % (Math.PI * 2);
    const p = orbitPos(a, e, M.current);
    planet.current?.position.copy(p);
    if (radius.current) {
      const len = p.length();
      radius.current.scale.set(1, len, 1);
      radius.current.position.copy(p).multiplyScalar(0.5);
      radius.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
    }
    // prędkość z zasady zachowania energii (vis-viva): v² ∝ 2/r − 1/a
    const r = p.length();
    const v = Math.sqrt(2 / r - 1 / a);
    const vRef = Math.sqrt(1 / a);
    if (label.current) label.current.textContent = `v = ${(v / vRef).toFixed(2).replace('.', ',')} × v̄  ·  r = ${(r / a).toFixed(2).replace('.', ',')} a`;
    activeRef.current = Math.floor((M.current / (Math.PI * 2)) * SECTORS);
  });

  const c = a * e;

  return (
    <>
      <ambientLight intensity={0.15} />
      <Stars radius={80} depth={40} count={2500} factor={3} fade speed={0.5} />
      <Sun />
      <Line points={pts} color="#ffffff" lineWidth={1.5} transparent opacity={0.6} />

      {showSectors && <ActiveSectors a={a} e={e} activeRef={activeRef} />}

      {showFoci && (
        <>
          <mesh position={[-2 * c, 0, 0]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshBasicMaterial color="#ffd166" />
          </mesh>
          <Html position={[0, -0.6, 0]} center>
            <div className="label-3d">ognisko F₁ (Słońce)</div>
          </Html>
          <Html position={[-2 * c, -0.5, 0]} center>
            <div className="label-3d">ognisko F₂</div>
          </Html>
          <Line points={[new THREE.Vector3(-a - c, 0, 0), new THREE.Vector3(a - c, 0, 0)]} color="#ffd166" lineWidth={1} dashed dashSize={0.2} gapSize={0.15} />
        </>
      )}

      <mesh ref={radius}>
        <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
        <meshBasicMaterial color="#9fb3ff" transparent opacity={0.7} />
      </mesh>

      <group ref={planet}>
        <Planet color="#4fc3ff" size={0.22} />
        {showVelocity && (
          <Html position={[0, 0.55, 0]} center>
            <div className="label-3d" ref={label} />
          </Html>
        )}
      </group>
    </>
  );
}

function ActiveSectors({ a, e, activeRef }: { a: number; e: number; activeRef: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    // podświetl sektor, w którym jest planeta
    g.children.forEach((child, k) => {
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = k === activeRef.current ? 0.55 : 0.16;
    });
  });
  return (
    <group ref={group}>
      <SweptSectors a={a} e={e} active={-1} />
    </group>
  );
}

const PLANETS = [
  { name: 'Merkury', a: 0.387, color: '#b7a89a', size: 0.1 },
  { name: 'Wenus', a: 0.723, color: '#e8c27a', size: 0.16 },
  { name: 'Ziemia', a: 1.0, color: '#4fc3ff', size: 0.17 },
  { name: 'Mars', a: 1.524, color: '#ff7a4f', size: 0.13 },
];

function ThirdLawScene({ params }: SceneProps) {
  const speed = Number(params.speed ?? 1);
  const playing = Boolean(params.play ?? true);
  const scale = 3.6;
  const refs = useRef<(THREE.Group | null)[]>([]);
  const t = useRef(0);

  useFrame((_, dt) => {
    if (playing) t.current += dt * speed * 0.8;
    PLANETS.forEach((p, i) => {
      const T = Math.pow(p.a, 1.5); // lata
      const ang = (t.current / T) * Math.PI * 2 * 0.25;
      refs.current[i]?.position.set(Math.cos(ang) * p.a * scale, 0, -Math.sin(ang) * p.a * scale);
    });
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      <Stars radius={80} depth={40} count={2500} factor={3} fade speed={0.5} />
      <Sun />
      {PLANETS.map((p, i) => (
        <group key={p.name}>
          <Line points={ellipsePoints(p.a * scale, 0, 128)} color={p.color} lineWidth={1} transparent opacity={0.45} />
          <group ref={(el) => (refs.current[i] = el)}>
            <Planet color={p.color} size={p.size * 1.4} />
            <Html position={[0, 0.45, 0]} center>
              <div className="label-3d">
                {p.name} · T = {Math.pow(p.a, 1.5).toFixed(2).replace('.', ',')} r.
              </div>
            </Html>
          </group>
        </group>
      ))}
    </>
  );
}

export const kepler: Topic = {
  id: 'prawa-keplera',
  title: 'Prawa Keplera – jak krążą planety',
  subject: 'fizyka',
  summary: 'Orbity eliptyczne, równe pola w równych czasach i związek okresu z rozmiarem orbity – w 3D.',
  accent: '#7c5cff',
  glyph: '🪐',
  steps: [
    {
      title: 'I prawo: orbity są elipsami',
      kind: '3d',
      scene: SingleOrbitScene,
      camera: [-2.2, 10, 9],
      target: [-2.2, 0, 0],
      preset: { sectors: false },
      controls: [
        { type: 'slider', key: 'e', label: 'Mimośród e', min: 0, max: 0.9, step: 0.01, default: 0.5 },
        { type: 'toggle', key: 'foci', label: 'Pokaż ogniska', default: true },
        { type: 'toggle', key: 'play', label: 'Ruch planety', default: true },
        { type: 'slider', key: 'speed', label: 'Tempo czasu', min: 0.2, max: 3, step: 0.1, default: 1, unit: '×' },
      ],
      body: (
        <>
          <p>
            Planety nie krążą po okręgach, lecz po <strong>elipsach</strong>. Słońce nie leży w środku elipsy, tylko w
            jednym z jej <strong>ognisk</strong>.
          </p>
          <p>
            Kształt elipsy opisuje <strong>mimośród e</strong>. Dla e = 0 elipsa jest okręgiem, a im bliżej 1, tym
            bardziej jest wydłużona.
          </p>
          <p>Orbita Ziemi ma e ≈ 0,017 – jest prawie okręgiem. Komety mają e bliskie 1.</p>
        </>
      ),
    },
    {
      title: 'II prawo: równe pola w równych czasach',
      kind: '3d',
      scene: SingleOrbitScene,
      camera: [-2.7, 13, 4],
      target: [-2.7, 0, 0],
      preset: { sectors: true, foci: false },
      controls: [
        { type: 'slider', key: 'e', label: 'Mimośród e', min: 0, max: 0.85, step: 0.01, default: 0.6 },
        { type: 'toggle', key: 'velocity', label: 'Pokaż prędkość', default: true },
        { type: 'toggle', key: 'play', label: 'Ruch planety', default: true },
        { type: 'slider', key: 'speed', label: 'Tempo czasu', min: 0.2, max: 3, step: 0.1, default: 1, unit: '×' },
      ],
      body: (
        <>
          <p>
            Promień łączący Słońce z planetą zakreśla <strong>równe pola w równych odstępach czasu</strong>. Każdy
            kolorowy wycinek to 1/12 okresu obiegu i każdy ma takie samo pole.
          </p>
          <p>
            Blisko Słońca (w <strong>peryhelium</strong>) wycinki są krótkie i szerokie, więc planeta musi poruszać się
            szybciej. Daleko (w <strong>aphelium</strong>) zwalnia.
          </p>
          <p>To prawo wynika z zasady zachowania momentu pędu.</p>
        </>
      ),
    },
    {
      title: 'III prawo: T² ∝ a³',
      kind: '3d',
      scene: ThirdLawScene,
      camera: [0, 11, 9],
      controls: [
        { type: 'toggle', key: 'play', label: 'Ruch planet', default: true },
        { type: 'slider', key: 'speed', label: 'Tempo czasu', min: 0.2, max: 4, step: 0.1, default: 1, unit: '×' },
      ],
      body: (
        <>
          <p>
            Im dalej planeta od Słońca, tym dłużej trwa jej obieg. Kepler odkrył dokładny związek między okresem{' '}
            <strong>T</strong> a wielką półosią <strong>a</strong>:
          </p>
          <div className="formula">T² / a³ = const</div>
          <p>
            Mars krąży 1,52 razy dalej niż Ziemia, więc jego rok trwa 1,52<sup>1,5</sup> ≈ 1,88 roku ziemskiego.
            Obserwuj, jak wewnętrzne planety wyprzedzają zewnętrzne.
          </p>
        </>
      ),
    },
  ],
};
