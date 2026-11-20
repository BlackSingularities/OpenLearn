import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { Arrow3D, Lights } from '../../lib/three';
import { num } from '../../lib/mathkit';

const G = 9.81;
const RED = '#ff6b8b';
const BLUE = '#4fc3ff';
const GOLD = '#ffd166';
const GREEN = '#4ade80';
const VIOLET = '#c084fc';

function Ground({ size = 14 }: { size?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#161b28" />
    </mesh>
  );
}

/* ---------- Kroki 1–2: równia pochyła ---------- */
const SLOPE = 6;
function InclineScene({ params }: SceneProps) {
  const deg = Number(params.alpha);
  const mu = Number(params.mu ?? 0);
  const m = Number(params.m ?? 2);
  const comps = Boolean(params.comps);
  const al = (deg * Math.PI) / 180;
  const b = SLOPE * Math.cos(al);
  const H = SLOPE * Math.sin(al);
  const top = new THREE.Vector3(-b / 2, H, 0);
  const d = new THREE.Vector3(Math.cos(al), -Math.sin(al), 0);
  const n = new THREE.Vector3(Math.sin(al), Math.cos(al), 0);
  const half = 0.35;
  const muK = mu * 0.8;
  const sliding = Math.tan(al) > mu + 1e-9;
  const acc = sliding ? G * (Math.sin(al) - muK * Math.cos(al)) : 0;
  const Q = m * G;
  const Nf = Q * Math.cos(al);
  const fr = sliding ? muK * Nf : Q * Math.sin(al);
  const k = 0.06; // skala strzałek [jednostki sceny / N]

  const wedge = useMemo(() => {
    const sh = new THREE.Shape();
    sh.moveTo(-b / 2, 0);
    sh.lineTo(b / 2, 0);
    sh.lineTo(-b / 2, H);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: false });
    g.translate(0, 0, -0.8);
    return g;
  }, [b, H]);

  const group = useRef<THREE.Group>(null);
  const st = useRef({ s: 0.6, v: 0, wait: 0 });
  useFrame((_, dt) => {
    const s = st.current;
    if (sliding) {
      if (s.wait > 0) {
        s.wait -= dt;
        if (s.wait <= 0) {
          s.s = 0.6;
          s.v = 0;
        }
      } else {
        s.v += acc * dt * 0.5; // animacja w zwolnionym tempie
        s.s += s.v * dt;
        if (s.s > SLOPE - 0.6) {
          s.s = SLOPE - 0.6;
          s.wait = 1;
        }
      }
    } else {
      s.s = 0.6 + (SLOPE - 1.2) * 0.35;
      s.v = 0;
    }
    const pos = top.clone().addScaledVector(d, s.s).addScaledVector(n, half);
    group.current?.position.copy(pos);
  });

  const v = (w: THREE.Vector3, len: number): [number, number, number] => [w.x * len, w.y * len, w.z * len];
  const o: [number, number, number] = [0, 0, 0.0];
  return (
    <group position={[0, 0, 0]}>
      <Lights />
      <Ground />
      <mesh geometry={wedge}>
        <meshStandardMaterial color="#3a4560" roughness={0.8} />
        <Edges color="#8090b0" />
      </mesh>
      <group ref={group}>
        <mesh rotation={[0, 0, -al]}>
          <boxGeometry args={[0.9, 0.7, 0.9]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
          <Edges color="#0b0d12" />
        </mesh>
        <group position={[0, 0, 0.6]}>
          <Arrow3D from={o} vec={[0, -Q * k, 0]} color={RED} radius={0.035} />
          <Arrow3D from={o} vec={v(n, Nf * k)} color={BLUE} radius={0.035} />
          {fr > 0.01 && <Arrow3D from={v(n, -half)} vec={v(d, -fr * k)} color={GOLD} radius={0.035} />}
          {comps && (
            <>
              <Arrow3D from={o} vec={v(d, Q * Math.sin(al) * k)} color={VIOLET} radius={0.022} />
              <Arrow3D from={o} vec={v(n, -Q * Math.cos(al) * k)} color={VIOLET} radius={0.022} />
              <Line points={[v(d, Q * Math.sin(al) * k), [0, -Q * k, 0]]} color={VIOLET} dashed dashSize={0.08} gapSize={0.06} lineWidth={1} />
              <Line points={[v(n, -Q * Math.cos(al) * k), [0, -Q * k, 0]]} color={VIOLET} dashed dashSize={0.08} gapSize={0.06} lineWidth={1} />
            </>
          )}
        </group>
      </group>
      <InfoPortal>
        <div>
          α = {deg}°, m = {num(m)} kg
        </div>
        <div style={{ color: RED, fontWeight: 600 }}>ciężar Q = mg = {num(Q, 1)} N</div>
        <div style={{ color: BLUE, fontWeight: 600 }}>nacisk / reakcja N = mg·cos α = {num(Nf, 1)} N</div>
        {mu > 0 && (
          <div style={{ color: GOLD, fontWeight: 600 }}>
            tarcie {sliding ? `kinetyczne μk·N = ${num(fr, 1)}` : `statyczne = ${num(fr, 1)} (≤ μs·N = ${num(mu * Nf, 1)})`} N
          </div>
        )}
        {comps && <div style={{ color: VIOLET }}>składowa wzdłuż równi mg·sin α = {num(Q * Math.sin(al), 1)} N</div>}
        <div style={{ color: GREEN, fontWeight: 600 }}>{sliding ? `zsuwa się z a = ${num(acc, 2)} m/s²` : 'spoczywa – siły się równoważą'}</div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 3: maszyna Atwooda ---------- */
function AtwoodScene({ params }: SceneProps) {
  const m1 = Number(params.m1);
  const m2 = Number(params.m2);
  const a = ((m1 - m2) / (m1 + m2)) * G;
  const Tn = (2 * m1 * m2 * G) / (m1 + m2);
  const R = 0.6;
  const top = 5;
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const wheel = useRef<THREE.Mesh>(null);
  const ropeL = useRef<THREE.Mesh>(null);
  const ropeR = useRef<THREE.Mesh>(null);
  const st = useRef({ y: 0, v: 0, wait: 0 });
  const size = (mm: number) => 0.35 + Math.cbrt(mm) * 0.22;
  useFrame((_, dt) => {
    const s = st.current;
    if (s.wait > 0) {
      s.wait -= dt;
      if (s.wait <= 0) {
        s.y = 0;
        s.v = 0;
      }
    } else {
      s.v += a * dt * 0.35;
      s.y += s.v * dt;
      if (Math.abs(s.y) > 1.8) {
        s.y = Math.sign(s.y) * 1.8;
        s.wait = 1;
      }
    }
    const yL = 2.6 - s.y; // m1 opada, gdy a > 0
    const yR = 2.6 + s.y;
    left.current?.position.set(-R, yL, 0);
    right.current?.position.set(R, yR, 0);
    if (wheel.current) wheel.current.rotation.y = s.y / R;
    if (ropeL.current) {
      const len = top - yL;
      ropeL.current.scale.y = len;
      ropeL.current.position.set(-R, yL + len / 2, 0);
    }
    if (ropeR.current) {
      const len = top - yR;
      ropeR.current.scale.y = len;
      ropeR.current.position.set(R, yR + len / 2, 0);
    }
  });
  const k = 0.05;
  return (
    <group>
      <Lights />
      <Ground />
      <mesh position={[0, top + 1.2, 0]}>
        <boxGeometry args={[3, 0.15, 0.8]} />
        <meshStandardMaterial color="#3a4560" />
      </mesh>
      <mesh position={[0, top + 0.6, 0]}>
        <boxGeometry args={[0.08, 1.2, 0.08]} />
        <meshStandardMaterial color="#8090b0" />
      </mesh>
      <mesh ref={wheel} position={[0, top, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[R, R, 0.25, 40]} />
        <meshStandardMaterial color="#8090b0" metalness={0.6} roughness={0.3} />
        <Edges color="#c8d0e0" threshold={30} />
      </mesh>
      <mesh ref={ropeL}>
        <cylinderGeometry args={[0.02, 0.02, 1, 6]} />
        <meshStandardMaterial color="#ddd" />
      </mesh>
      <mesh ref={ropeR}>
        <cylinderGeometry args={[0.02, 0.02, 1, 6]} />
        <meshStandardMaterial color="#ddd" />
      </mesh>
      <group ref={left}>
        <mesh position={[0, -size(m1) / 2, 0]}>
          <boxGeometry args={[size(m1), size(m1), size(m1)]} />
          <meshStandardMaterial color={RED} />
        </mesh>
        <Arrow3D from={[-0.7, -size(m1) / 2, 0]} vec={[0, -m1 * G * k, 0]} color={RED} radius={0.03} />
        <Arrow3D from={[-0.7, -size(m1) / 2, 0]} vec={[0, Tn * k, 0]} color={GOLD} radius={0.03} />
      </group>
      <group ref={right}>
        <mesh position={[0, -size(m2) / 2, 0]}>
          <boxGeometry args={[size(m2), size(m2), size(m2)]} />
          <meshStandardMaterial color={BLUE} />
        </mesh>
        <Arrow3D from={[0.7, -size(m2) / 2, 0]} vec={[0, -m2 * G * k, 0]} color={BLUE} radius={0.03} />
        <Arrow3D from={[0.7, -size(m2) / 2, 0]} vec={[0, Tn * k, 0]} color={GOLD} radius={0.03} />
      </group>
      <InfoPortal>
        <div style={{ color: RED, fontWeight: 600 }}>m₁ = {num(m1)} kg, ciężar {num(m1 * G, 1)} N</div>
        <div style={{ color: BLUE, fontWeight: 600 }}>m₂ = {num(m2)} kg, ciężar {num(m2 * G, 1)} N</div>
        <div style={{ color: GOLD, fontWeight: 600 }}>naciąg linki N = {num(Tn, 1)} N</div>
        <div style={{ color: GREEN, fontWeight: 600 }}>a = (m₁ − m₂)g / (m₁ + m₂) = {num(Math.abs(a), 2)} m/s²</div>
        <div className="muted-line">animacja zwolniona</div>
      </InfoPortal>
    </group>
  );
}

const inclineBody = (
  <>
    <p>
      Na klocek działają tylko dwie siły: <strong>ciężar Q</strong> (pionowo w dół) i <strong>reakcja podłoża N</strong>{' '}
      (prostopadle do równi). Ich wypadkowa jest skierowana wzdłuż równi w dół.
    </p>
    <p>
      Włącz rozkład ciężaru: składowa prostopadła równoważy reakcję, a składowa równoległa mg·sin α rozpędza klocek.
      Bez tarcia przyspieszenie to <strong>a = g·sin α</strong> – nie zależy od masy.
    </p>
  </>
);

export const dynamics: Topic = {
  id: 'dynamika',
  title: 'Dynamika: siły i zasady Newtona',
  subject: 'fizyka',
  summary: 'Równia pochyła w 3D z rozkładem sił, tarcie statyczne i kinetyczne oraz maszyna Atwooda – druga zasada dynamiki w praktyce.',
  accent: '#7c3aed',
  glyph: 'F',
  steps: [
    {
      title: 'Równia pochyła bez tarcia',
      kind: '3d',
      scene: InclineScene,
      preset: { mu: 0 },
      camera: [1, 3.8, 10],
      target: [0, 1.5, 0],
      controls: [
        { type: 'slider', key: 'alpha', label: 'Kąt nachylenia α', min: 5, max: 60, step: 1, default: 30, unit: '°' },
        { type: 'slider', key: 'm', label: 'Masa m', min: 0.5, max: 5, step: 0.1, default: 2, unit: 'kg' },
        { type: 'toggle', key: 'comps', label: 'Rozłóż ciężar na składowe', default: true },
      ],
      body: (
        <>
          <div className="formula">a = g · sin α</div>
          {inclineBody}
        </>
      ),
    },
    {
      title: 'Tarcie statyczne i kinetyczne',
      kind: '3d',
      scene: InclineScene,
      camera: [1, 3.8, 10],
      target: [0, 1.5, 0],
      controls: [
        { type: 'slider', key: 'alpha', label: 'Kąt nachylenia α', min: 5, max: 60, step: 1, default: 20, unit: '°' },
        { type: 'slider', key: 'mu', label: 'Współczynnik tarcia μs', min: 0.05, max: 1, step: 0.01, default: 0.45, decimals: 2 },
        { type: 'slider', key: 'm', label: 'Masa m', min: 0.5, max: 5, step: 0.1, default: 2, unit: 'kg' },
        { type: 'toggle', key: 'comps', label: 'Rozłóż ciężar na składowe', default: false },
      ],
      body: (
        <>
          <div className="formula">spoczynek: tg α ≤ μs      ruch: a = g(sin α − μk cos α)</div>
          <p>
            <strong>Tarcie statyczne</strong> dopasowuje się do potrzeb – jest dokładnie tak duże, by klocek stał. Ma
            jednak granicę: μs · N.
          </p>
          <p>
            Zwiększaj kąt. Gdy tg α przekroczy μs, klocek rusza, a tarcie staje się <strong>kinetyczne</strong> (tu μk =
            0,8 μs). Kąt graniczny nie zależy od masy – tak mierzy się współczynnik tarcia w szkolnej pracowni.
          </p>
        </>
      ),
    },
    {
      title: 'Maszyna Atwooda',
      kind: '3d',
      scene: AtwoodScene,
      camera: [0, 4, 9],
      target: [0, 3.2, 0],
      controls: [
        { type: 'slider', key: 'm1', label: 'Masa m₁ (czerwona)', min: 0.5, max: 6, step: 0.1, default: 3, unit: 'kg' },
        { type: 'slider', key: 'm2', label: 'Masa m₂ (niebieska)', min: 0.5, max: 6, step: 0.1, default: 2, unit: 'kg' },
      ],
      body: (
        <>
          <div className="formula">F = m · a   →   (m₁ − m₂)g = (m₁ + m₂)a</div>
          <p>
            Dwa ciężarki połączone linką przez bloczek. Siłą napędzającą jest <strong>różnica ciężarów</strong>, a
            rozpędzać trzeba <strong>obie masy</strong> naraz.
          </p>
          <p>
            Przy niewielkiej różnicy mas przyspieszenie jest małe – dlatego Atwood użył tej maszyny do „spowolnienia”
            spadku i dokładnego zmierzenia g. Naciąg linki (żółte strzałki) jest mniejszy od ciężaru cięższej masy i
            większy od ciężaru lżejszej.
          </p>
        </>
      ),
    },
  ],
};
