import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { Lights } from '../../lib/three';
import { num } from '../../lib/mathkit';

const RAD = 1.3;
const MAXN = 260;
const tmp = new THREE.Object3D();
const col = new THREE.Color();

/** p·V = N·k·T w jednostkach umownych: p = N·T / (V·C0). */
const C0 = 80;

function PVDiagram({ p, V, mode, Tref, hist, N }: { p: number; V: number; mode: string; Tref: number; hist: [number, number][]; N: number }) {
  const W = 240;
  const H = 120;
  const X = (v: number) => 24 + ((v - 0.8) / 2.6) * (W - 32);
  const Y = (pp: number) => H - 18 - (pp / 12) * (H - 28);
  const iso = (T: number) =>
    Array.from({ length: 50 }, (_, i) => {
      const v = 0.8 + (i / 49) * 2.6;
      return `${X(v)},${Y(Math.min(12, (N * T) / (v * C0 * 100)))}`;
    }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 260, display: 'block', marginTop: 6 }}>
      <line x1="24" y1={H - 18} x2={W - 4} y2={H - 18} stroke="rgba(255,255,255,0.4)" />
      <line x1="24" y1="4" x2="24" y2={H - 18} stroke="rgba(255,255,255,0.4)" />
      <text x={W - 6} y={H - 6} fill="rgba(255,255,255,0.55)" fontSize="10" textAnchor="end">
        V
      </text>
      <text x="8" y="12" fill="rgba(255,255,255,0.55)" fontSize="10">
        p
      </text>
      {[200, 300, 400, 500].map((T) => (
        <polyline key={T} points={iso(T)} fill="none" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
      ))}
      {mode === 'izoterma' && <polyline points={iso(Tref)} fill="none" stroke="#4fc3ff" strokeWidth="1.5" />}
      {hist.length > 1 && <polyline points={hist.map(([v, pp]) => `${X(v)},${Y(pp)}`).join(' ')} fill="none" stroke="#ffd166" strokeWidth="2" />}
      <circle cx={X(V)} cy={Y(Math.min(12, p))} r="4.5" fill="#ff6b8b" />
    </svg>
  );
}

function GasScene({ params }: SceneProps) {
  const mode = String(params.mode ?? 'free');
  const N = Number(params.n ?? 160);
  // wartości zależne od przemiany
  let T = Number(params.T ?? 300);
  let V = Number(params.V ?? 2);
  const p0 = 4.5;
  if (mode === 'izoterma') T = 300;
  if (mode === 'izochora') V = 2;
  if (mode === 'izobara') V = Math.max(0.8, Math.min(3.4, (N * T) / (p0 * C0 * 100))); // p stałe
  const p = (N * T) / (V * C0 * 100);
  const [hist, setHist] = useState<[number, number][]>([]);
  useEffect(() => setHist([]), [mode]);
  useEffect(() => {
    setHist((h) => [...h.slice(-80), [V, p]]);
  }, [V, p]);

  const mesh = useRef<THREE.InstancedMesh>(null);
  const piston = useRef<THREE.Mesh>(null);
  const hitsRef = useRef({ count: 0, rate: 0, t: 0 });
  const [rate, setRate] = useState(0);
  const parts = useMemo(() => {
    const arr = Array.from({ length: MAXN }, () => {
      const r = Math.sqrt(Math.random()) * (RAD - 0.1);
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      return { p: new THREE.Vector3(r * Math.cos(a), Math.random() * 1.5 + 0.1, r * Math.sin(a)), d: dir, s: 0.6 + Math.random() * 0.8 };
    });
    return arr;
  }, []);
  const hRef = useRef(V);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.03);
    hRef.current += (V - hRef.current) * Math.min(1, d * 4);
    const H = hRef.current;
    const speed = Math.sqrt(T / 300) * 1.6;
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < MAXN; i++) {
      const q = parts[i];
      if (i < N) {
        q.p.addScaledVector(q.d, q.s * speed * d);
        const rr = Math.hypot(q.p.x, q.p.z);
        if (rr > RAD - 0.06) {
          const nx = q.p.x / rr;
          const nz = q.p.z / rr;
          const dot = q.d.x * nx + q.d.z * nz;
          if (dot > 0) {
            q.d.x -= 2 * dot * nx;
            q.d.z -= 2 * dot * nz;
          }
          q.p.x = nx * (RAD - 0.06);
          q.p.z = nz * (RAD - 0.06);
        }
        if (q.p.y < 0.06) {
          q.p.y = 0.06;
          q.d.y = Math.abs(q.d.y);
        }
        if (q.p.y > H - 0.06) {
          q.p.y = H - 0.06;
          if (q.d.y > 0) hitsRef.current.count++;
          q.d.y = -Math.abs(q.d.y);
        }
        tmp.position.copy(q.p);
        tmp.scale.setScalar(1);
      } else {
        tmp.position.set(0, -100, 0);
        tmp.scale.setScalar(0.001);
      }
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      col.setHSL(0.62 - Math.min(0.62, ((q.s * speed) / 3.5) * 0.62), 0.85, 0.6);
      m.setColorAt(i, col);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (piston.current) piston.current.position.y = H + 0.05;
    const hr = hitsRef.current;
    hr.t += dt;
    if (hr.t > 1) {
      setRate(Math.round(hr.count / hr.t));
      hr.count = 0;
      hr.t = 0;
    }
  });

  const label: Record<string, string> = {
    free: 'model gazu doskonałego',
    izoterma: 'przemiana izotermiczna (T = const)',
    izobara: 'przemiana izobaryczna (p = const)',
    izochora: 'przemiana izochoryczna (V = const)',
  };
  return (
    <group position={[0, -1.2, 0]}>
      <Lights />
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[RAD, RAD, 3.6, 48, 1, true]} />
        <meshStandardMaterial color="#cbd5e1" transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[RAD + 0.05, RAD + 0.05, 0.1, 48]} />
        <meshStandardMaterial color="#3a4560" />
      </mesh>
      <mesh ref={piston}>
        <cylinderGeometry args={[RAD - 0.01, RAD - 0.01, 0.1, 48]} />
        <meshStandardMaterial color="#8090b0" metalness={0.5} roughness={0.3} />
        <Edges color="#c8d0e0" threshold={30} />
      </mesh>
      <instancedMesh ref={mesh} args={[undefined, undefined, MAXN]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial />
      </instancedMesh>
      <InfoPortal>
        <div style={{ color: '#ffd166', fontWeight: 600 }}>{label[mode]}</div>
        <div>
          N = {N} cząsteczek, T = {Math.round(T)} K, V = {num(V, 2)} (j. umowne)
        </div>
        <div style={{ color: '#ff6b8b', fontWeight: 600 }}>p ∝ N·T / V = {num(p, 2)}</div>
        <div className="muted-line">uderzenia w tłok: {rate} na sekundę</div>
        {mode !== 'free' && <PVDiagram p={p} V={V} mode={mode} Tref={T} hist={hist} N={N} />}
      </InfoPortal>
    </group>
  );
}

export const gas: Topic = {
  id: 'gaz-doskonaly',
  title: 'Gaz doskonały i przemiany gazowe',
  subject: 'fizyka',
  summary: 'Cząsteczki odbijające się w cylindrze z tłokiem, ciśnienie jako efekt uderzeń oraz przemiany izotermiczna, izobaryczna i izochoryczna z wykresem p(V).',
  accent: '#a78bfa',
  glyph: 'pV',
  steps: [
    {
      title: 'Skąd się bierze ciśnienie',
      kind: '3d',
      scene: GasScene,
      preset: { mode: 'free' },
      camera: [3.5, 2.5, 5.5],
      target: [0, 0.3, 0],
      controls: [
        { type: 'slider', key: 'T', label: 'Temperatura T', min: 100, max: 800, step: 10, default: 300, unit: 'K' },
        { type: 'slider', key: 'n', label: 'Liczba cząsteczek N', min: 20, max: 260, step: 10, default: 140 },
        { type: 'slider', key: 'V', label: 'Objętość V', min: 0.8, max: 3.4, step: 0.05, default: 2 },
      ],
      body: (
        <>
          <div className="formula">p · V = n · R · T</div>
          <p>
            Ciśnienie gazu to skutek <strong>miliardów uderzeń cząsteczek</strong> o ścianki. Kolor kulki pokazuje jej
            prędkość: niebieskie są wolne, czerwone szybkie.
          </p>
          <ul>
            <li>więcej cząsteczek → więcej uderzeń → większe ciśnienie,</li>
            <li>wyższa temperatura → szybsze cząsteczki uderzają częściej i mocniej,</li>
            <li>mniejsza objętość → cząsteczki częściej docierają do ścianek.</li>
          </ul>
          <p>Licznik uderzeń w tłok w ramce rośnie razem z ciśnieniem.</p>
        </>
      ),
    },
    {
      title: 'Przemiany gazowe',
      kind: '3d',
      scene: GasScene,
      camera: [3.5, 2.5, 5.5],
      target: [0, 0.3, 0],
      controls: [
        {
          type: 'select',
          key: 'mode',
          label: 'Przemiana',
          default: 'izoterma',
          options: [
            { value: 'izoterma', label: 'izotermiczna' },
            { value: 'izobara', label: 'izobaryczna' },
            { value: 'izochora', label: 'izochoryczna' },
          ],
        },
        { type: 'slider', key: 'T', label: 'Temperatura T (izobaryczna, izochoryczna)', min: 150, max: 700, step: 10, default: 300, unit: 'K' },
        { type: 'slider', key: 'V', label: 'Objętość V (izotermiczna)', min: 0.8, max: 3.4, step: 0.05, default: 2 },
      ],
      body: (
        <>
          <ul>
            <li>
              <strong>izotermiczna</strong> (T = const): p·V = const – ściskając gaz, zwiększasz ciśnienie; na wykresie
              p(V) to hiperbola,
            </li>
            <li>
              <strong>izobaryczna</strong> (p = const): V/T = const – ogrzany gaz rozpycha tłok,
            </li>
            <li>
              <strong>izochoryczna</strong> (V = const): p/T = const – w zamkniętym naczyniu ogrzewanie podnosi
              ciśnienie (dlatego nie wrzuca się puszek do ognia).
            </li>
          </ul>
          <p>Żółta linia na wykresie p(V) w ramce to droga, którą przeszedł gaz.</p>
        </>
      ),
    },
  ],
};
