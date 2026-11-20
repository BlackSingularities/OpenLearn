import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Trail } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { DynamicArrow, Lights } from '../../lib/three';
import { num } from '../../lib/mathkit';
import { useSpeed } from '../../components/ui';

const G = 9.81;
const RED = '#ff6b8b';
const BLUE = '#4fc3ff';
const GOLD = '#ffd166';
const GREEN = '#4ade80';

function Floor({ r = 8 }: { r?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <circleGeometry args={[r, 64]} />
      <meshStandardMaterial color="#161b28" />
    </mesh>
  );
}

/* ---------- Krok 1: kamień na sznurku ---------- */
function StringScene({ params }: SceneProps) {
  const sp = useSpeed();
  const r = Number(params.r);
  const v = Number(params.v);
  const m = Number(params.m);
  const cut = Boolean(params.cut);
  const ball = useRef<THREE.Mesh>(null);
  const rope = useRef<THREE.Mesh>(null);
  const st = useRef({ phi: 0, free: false, p: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0 });
  useEffect(() => {
    st.current.free = false;
    st.current.t = 0;
  }, [cut, r, v]);
  const H = 1.2;
  useFrame((_, dt) => {
    const s = st.current;
    if (cut && !s.free) {
      s.free = true;
      s.p.set(r * Math.cos(s.phi), H, -r * Math.sin(s.phi));
      s.vel.set(-v * Math.sin(s.phi), 0, -v * Math.cos(s.phi));
      s.t = 0;
    }
    if (s.free) {
      s.t += dt;
      s.p.addScaledVector(s.vel, dt * 0.5);
      if (s.t > 3.5) {
        s.free = false;
      }
    } else {
      s.phi += (v / r) * dt * 0.5;
      s.p.set(r * Math.cos(s.phi), H, -r * Math.sin(s.phi));
    }
    ball.current?.position.copy(s.p);
    if (rope.current) {
      rope.current.visible = !s.free;
      rope.current.position.set((r / 2) * Math.cos(s.phi), H, (-r / 2) * Math.sin(s.phi));
      rope.current.rotation.set(0, s.phi, Math.PI / 2);
      rope.current.scale.y = r;
    }
  });
  const vel = () => {
    const s = st.current;
    const dir = s.free ? s.vel.clone() : new THREE.Vector3(-Math.sin(s.phi), 0, -Math.cos(s.phi)).multiplyScalar(v);
    return [s.p.clone().add(new THREE.Vector3(0, 0.05, 0)), dir.multiplyScalar(0.28)] as [THREE.Vector3, THREE.Vector3];
  };
  const acc = () => {
    const s = st.current;
    if (s.free) return null;
    const toC = new THREE.Vector3(-Math.cos(s.phi), 0, Math.sin(s.phi)).multiplyScalar(Math.min(3, ((v * v) / r) * 0.12));
    return [s.p.clone().add(new THREE.Vector3(0, -0.05, 0)), toC] as [THREE.Vector3, THREE.Vector3];
  };
  const pathPts = useMemo(() => Array.from({ length: 81 }, (_, i) => [r * Math.cos((i / 80) * Math.PI * 2), H, -r * Math.sin((i / 80) * Math.PI * 2)] as [number, number, number]), [r]);
  const omega = v / r;
  return (
    <group>
      <Lights />
      <Floor />
      <mesh position={[0, H / 2, 0]}>
        <cylinderGeometry args={[0.08, 0.08, H, 12]} />
        <meshStandardMaterial color="#8090b0" />
      </mesh>
      <Line points={pathPts} color="#ffffff" lineWidth={1} transparent opacity={0.25} dashed dashSize={0.15} gapSize={0.12} />
      <mesh ref={rope}>
        <cylinderGeometry args={[0.015, 0.015, 1, 6]} />
        <meshStandardMaterial color="#ddd" />
      </mesh>
      <Trail width={1.4} length={5} color={GOLD} attenuation={(t) => t * t}>
        <mesh ref={ball}>
          <sphereGeometry args={[0.12 + Math.cbrt(m) * 0.08, 24, 24]} />
          <meshStandardMaterial color={RED} />
        </mesh>
      </Trail>
      <DynamicArrow get={vel} color={BLUE} />
      <DynamicArrow get={acc} color={GREEN} />
      <InfoPortal>
        <div style={{ color: BLUE, fontWeight: 600 }}>v = {sp.fmt(v, 1)} – zawsze styczna do okręgu</div>
        <div style={{ color: GREEN, fontWeight: 600 }}>a = v²/r = {num((v * v) / r, 2)} m/s² – do środka</div>
        <div>
          ω = v/r = {num(omega, 2)} rad/s, okres T = {num((2 * Math.PI) / omega, 2)} s
        </div>
        <div style={{ color: GOLD }}>siła dośrodkowa (naciąg) F = mv²/r = {num((m * v * v) / r, 1)} N</div>
        <div className="muted-line">{cut ? 'sznurek przecięty – kamień leci po stycznej' : 'animacja zwolniona 2×'}</div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 2: samochód na zakręcie ---------- */
function CurveScene({ params }: SceneProps) {
  const sp = useSpeed();
  const r = Number(params.r);
  const vKmh = Number(params.v);
  const surf = String(params.surf);
  const mu = { sucha: 0.8, mokra: 0.5, lod: 0.1 }[surf] ?? 0.8;
  const v = vKmh / 3.6;
  const vMax = Math.sqrt(mu * G * r);
  const skid = v > vMax;
  const car = useRef<THREE.Group>(null);
  const st = useRef({ phi: 0, rad: 0, t: 0 });
  const R = 3.2; // promień w scenie
  useEffect(() => {
    st.current = { phi: 0, rad: R, t: 0 };
  }, [r, vKmh, surf]);
  useFrame((_, dt) => {
    const s = st.current;
    s.t += dt;
    const w = (v / r) * 0.6;
    s.phi += w * dt * (R / s.rad);
    if (skid && s.t > 1.2) s.rad += dt * (v - vMax) * 0.25 * (1 + (s.rad - R));
    if (s.rad > 7) {
      s.rad = R;
      s.t = 0;
    }
    car.current?.position.set(s.rad * Math.cos(s.phi), 0.25, -s.rad * Math.sin(s.phi));
    if (car.current) car.current.rotation.y = s.phi + (skid && s.t > 1.2 ? 0.35 : 0);
  });
  const road = useMemo(() => new THREE.RingGeometry(R - 0.7, R + 0.7, 96), []);
  const roadColor = surf === 'lod' ? '#a5d8ff' : surf === 'mokra' ? '#2b3550' : '#3a3f4b';
  return (
    <group>
      <Lights />
      <Floor r={9} />
      <mesh geometry={road} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <meshStandardMaterial color={roadColor} roughness={surf === 'lod' ? 0.1 : 0.9} metalness={surf === 'lod' ? 0.3 : 0} />
      </mesh>
      <group ref={car}>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.55, 0.3, 1.05]} />
          <meshStandardMaterial color={RED} />
        </mesh>
        <mesh position={[0, 0.3, 0.05]}>
          <boxGeometry args={[0.45, 0.22, 0.55]} />
          <meshStandardMaterial color="#ffe4ea" />
        </mesh>
      </group>
      <InfoPortal>
        <div>
          v = {sp.fmt(v)}, promień łuku r = {r} m
        </div>
        <div style={{ color: GREEN }}>potrzebna siła dośrodkowa: m·v²/r = m · {num((v * v) / r, 2)} m/s²</div>
        <div style={{ color: GOLD }}>tarcie może dać najwyżej μ·m·g = m · {num(mu * G, 2)} m/s²</div>
        <div style={{ color: skid ? RED : GREEN, fontWeight: 600 }}>
          v max = √(μgr) = {sp.fmt(vMax)} → {skid ? 'POŚLIZG – auto wypada na zewnątrz' : 'auto utrzymuje tor'}
        </div>
      </InfoPortal>
    </group>
  );
}

export const circular: Topic = {
  id: 'ruch-po-okregu',
  title: 'Ruch po okręgu',
  subject: 'fizyka',
  summary: 'Kamień na sznurku z wektorami prędkości i przyspieszenia dośrodkowego, przecięty sznurek i samochód wypadający z zakrętu na lodzie.',
  accent: '#a855f7',
  glyph: '↻',
  steps: [
    {
      title: 'Siła dośrodkowa',
      kind: '3d',
      scene: StringScene,
      camera: [0, 5.5, 6.5],
      target: [0, 1, 0],
      controls: [
        { type: 'slider', key: 'r', label: 'Długość sznurka r', min: 1, max: 3.5, step: 0.1, default: 2.5, unit: 'm' },
        { type: 'slider', key: 'v', label: 'Prędkość v', min: 1, max: 8, step: 0.1, default: 4, unit: 'm/s' },
        { type: 'slider', key: 'm', label: 'Masa m', min: 0.1, max: 2, step: 0.1, default: 0.5, unit: 'kg' },
        { type: 'toggle', key: 'cut', label: 'Przetnij sznurek', default: false },
      ],
      body: (
        <>
          <div className="formula">a = v²/r = ω²r      F = m·v²/r</div>
          <p>
            Prędkość ma stałą wartość, ale <strong>ciągle zmienia kierunek</strong> – a zmiana prędkości to
            przyspieszenie. Jest skierowane do środka okręgu (zielona strzałka), dlatego nazywa się dośrodkowe.
          </p>
          <p>
            Siłę dośrodkową zapewnia tu naciąg sznurka. <strong>Przetnij sznurek</strong>: kamień nie leci „na
            zewnątrz”, tylko prosto po stycznej – zgodnie z pierwszą zasadą dynamiki.
          </p>
          <p>Dwa razy większa prędkość to cztery razy większa potrzebna siła.</p>
        </>
      ),
    },
    {
      title: 'Samochód na zakręcie',
      kind: '3d',
      scene: CurveScene,
      camera: [0, 7.5, 7.5],
      controls: [
        { type: 'slider', key: 'v', label: 'Prędkość', min: 20, max: 140, step: 5, default: 60, unit: 'km/h' },
        { type: 'slider', key: 'r', label: 'Promień zakrętu', min: 20, max: 200, step: 5, default: 50, unit: 'm' },
        {
          type: 'select',
          key: 'surf',
          label: 'Nawierzchnia',
          default: 'sucha',
          options: [
            { value: 'sucha', label: 'sucha (μ = 0,8)' },
            { value: 'mokra', label: 'mokra (μ = 0,5)' },
            { value: 'lod', label: 'lód (μ = 0,1)' },
          ],
        },
      ],
      body: (
        <>
          <div className="formula">m·v²/r ≤ μ·m·g   →   v ≤ √(μ·g·r)</div>
          <p>
            Na płaskim zakręcie siłę dośrodkową daje wyłącznie <strong>tarcie opon</strong>. Gdy potrzebna siła
            przekroczy maksymalne tarcie, auto wpada w poślizg i wyjeżdża na zewnątrz łuku.
          </p>
          <p>
            Masa się skraca – ciężarówka i rower mają tę samą prędkość graniczną. Przełącz na lód: przy 60 km/h na
            ciasnym zakręcie nie ma szans. Dlatego zakręty na torach wyścigowych są nachylone.
          </p>
        </>
      ),
    },
  ],
};
