import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneProps } from '../../lib/types';
import { InfoPortal, fmt } from '../../lib/plot';
import { Lights } from '../../lib/three';

/*
 * Model wiru podkowiastego: wir związany wzdłuż rozpiętości (x = 0) i dwa wiry swobodne
 * ciągnące się od końcówek skrzydeł daleko w dół strumienia (+x). Prędkość indukowaną liczymy
 * z prawa Biota–Savarta dla odcinków prostych, z „rdzeniem” wygładzającym osobliwość.
 * Układ: x – w dół strumienia, y – w górę, z – wzdłuż rozpiętości.
 */
type V3 = [number, number, number];

function segment(p: V3, a: V3, b: V3, gamma: number, core: number, out: V3) {
  const r1: V3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const r2: V3 = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const cx = r1[1] * r2[2] - r1[2] * r2[1];
  const cy = r1[2] * r2[0] - r1[0] * r2[2];
  const cz = r1[0] * r2[1] - r1[1] * r2[0];
  const c2 = cx * cx + cy * cy + cz * cz;
  const l1 = Math.hypot(...r1) || 1e-6;
  const l2 = Math.hypot(...r2) || 1e-6;
  const r0: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...r0) || 1;
  const dot = r0[0] * (r1[0] / l1 - r2[0] / l2) + r0[1] * (r1[1] / l1 - r2[1] / l2) + r0[2] * (r1[2] / l1 - r2[2] / l2);
  const k = (gamma / (4 * Math.PI)) * dot / (c2 + (core * L) ** 2);
  out[0] += k * cx;
  out[1] += k * cy;
  out[2] += k * cz;
}

function induced(p: V3, half: number, gamma: number, core: number): V3 {
  const out: V3 = [0, 0, 0];
  const far = 60;
  segment(p, [far, 0, -half], [0, 0, -half], gamma, core, out);
  segment(p, [0, 0, -half], [0, 0, half], gamma, core, out);
  segment(p, [0, 0, half], [far, 0, half], gamma, core, out);
  return out;
}

const tmp = new THREE.Object3D();
const col = new THREE.Color();

function Particles({ half, gamma, core }: { half: number; gamma: number; core: number }) {
  const N = 900;
  const ref = useRef<THREE.InstancedMesh>(null);
  // znak dobieramy tak, by za środkiem skrzydła było odchylenie w dół
  const sign = useMemo(() => (induced([2, 0, 0], half, 1, core)[1] > 0 ? -1 : 1), [half, core]);
  const seeds = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        // gęściej przy końcówkach, żeby było widać wiry
        const nearTip = i % 3 !== 0;
        const side = i % 2 ? 1 : -1;
        const z = nearTip ? side * (half + (Math.random() - 0.5) * 1.4) : (Math.random() * 2 - 1) * (half + 1.5);
        return { x: -3 - Math.random() * 12, y: (Math.random() - 0.5) * 1.6, z, y0: 0, z0: 0 };
      }),
    [half],
  );
  useFrame((_, dtRaw) => {
    const m = ref.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.04);
    seeds.forEach((s, i) => {
      for (let k = 0; k < 2; k++) {
        const v = induced([s.x, s.y, s.z], half, gamma * sign, core);
        s.x += (2.2 + v[0]) * dt * 0.5;
        s.y += v[1] * dt * 0.5;
        s.z += v[2] * dt * 0.5;
      }
      if (s.x > 16 || Math.abs(s.y) > 6) {
        s.x = -3 - Math.random() * 3;
        const nearTip = i % 3 !== 0;
        const side = i % 2 ? 1 : -1;
        s.z = nearTip ? side * (half + (Math.random() - 0.5) * 1.4) : (Math.random() * 2 - 1) * (half + 1.5);
        s.y = (Math.random() - 0.5) * 1.6;
      }
      const v = induced([s.x, s.y, s.z], half, gamma * sign, core);
      const vy = Math.max(-1, Math.min(1, v[1] / (0.6 + gamma * 0.15)));
      col.setRGB(vy < 0 ? 0.35 : 0.98, vy < 0 ? 0.65 + 0.2 * -vy : 0.75, vy < 0 ? 1 : 0.3);
      if (Math.abs(vy) < 0.05) col.setRGB(0.85, 0.88, 0.92);
      tmp.position.set(s.x, s.y, s.z);
      tmp.scale.setScalar(s.x < -2.8 ? 0 : 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, col);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]}>
      <sphereGeometry args={[0.035, 6, 6]} />
      <meshBasicMaterial color="#fff" />
    </instancedMesh>
  );
}

export function WingVortexScene({ params }: SceneProps) {
  const ar = Number(params.ar ?? 8);
  const cl = Number(params.cl ?? 0.8);
  const winglets = Boolean(params.winglets ?? false);
  const area = 12; // stała powierzchnia skrzydła (j. umowne)
  const span = Math.sqrt(ar * area);
  const chord = area / span;
  const half = span / 2;
  // cyrkulacja z siły nośnej: Γ = ½·U·c·C_L (U umowne = 2,2); winglety „poszerzają” efektywnie rozpiętość
  const effHalf = half * (winglets ? 1.08 : 1);
  const gamma = 0.5 * 2.2 * chord * cl * (winglets ? 0.9 : 1);
  const core = winglets ? 0.09 : 0.06;
  const e = winglets ? 0.9 : 0.8;
  const arEff = ar * (winglets ? 1.15 : 1);
  const cdi = (cl * cl) / (Math.PI * e * arEff);
  return (
    <>
      <Lights />
      {/* skrzydło */}
      <mesh position={[chord / 2 - chord, 0, 0]}>
        <boxGeometry args={[chord, 0.08, span]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.4} />
      </mesh>
      {/* kadłub (skrócony) */}
      <mesh position={[-0.6, -0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.28, 0.22, 4.6, 20]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.3} roughness={0.5} />
      </mesh>
      {winglets &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[-chord * 0.35, 0.35, s * half]} rotation={[s * 0.2, 0, 0]}>
            <boxGeometry args={[chord * 0.6, 0.7, 0.05]} />
            <meshStandardMaterial color="#38bdf8" metalness={0.4} roughness={0.4} />
          </mesh>
        ))}
      <Particles half={effHalf} gamma={gamma} core={core} />
      <InfoPortal>
        <div>
          wydłużenie λ = {fmt(ar, 1)} · rozpiętość {fmt(span, 1)} · cięciwa {fmt(chord, 2)} (j. umowne, stała powierzchnia)
        </div>
        <div>
          opór indukowany C<sub>Di</sub> = C<sub>L</sub>² / (π·e·λ) = <b>{fmt(cdi, 4)}</b>
        </div>
        <div>
          <span style={{ color: '#60a5fa' }}>niebieskie</span> – powietrze opada (za skrzydłem), <span style={{ color: '#facc15' }}>żółte</span> – unosi się (na zewnątrz końcówek)
        </div>
      </InfoPortal>
    </>
  );
}
