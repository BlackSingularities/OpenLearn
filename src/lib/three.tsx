import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/** Strzałka 3D (wektor): walec + stożek, od punktu `from` w kierunku `vec`. */
export function Arrow3D({ from, vec, color, radius = 0.04 }: { from: [number, number, number]; vec: [number, number, number]; color: string; radius?: number }) {
  const { len, quat, mid, tip, head } = useMemo(() => {
    const v = new THREE.Vector3(...vec);
    const len = v.length();
    const dir = len > 1e-6 ? v.clone().normalize() : UP.clone();
    const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    const head = Math.min(len * 0.35, radius * 6);
    const shaft = Math.max(0, len - head);
    const o = new THREE.Vector3(...from);
    return {
      len: shaft,
      quat,
      mid: o.clone().addScaledVector(dir, shaft / 2),
      tip: o.clone().addScaledVector(dir, shaft + head / 2),
      head,
    };
  }, [from[0], from[1], from[2], vec[0], vec[1], vec[2], radius]);
  if (len + head < 1e-4) return null;
  return (
    <group>
      <mesh position={mid} quaternion={quat}>
        <cylinderGeometry args={[radius, radius, len, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={tip} quaternion={quat}>
        <coneGeometry args={[radius * 2.6, head, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

/** Standardowe oświetlenie scen. */
export function Lights() {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 9, 6]} intensity={1.4} />
      <directionalLight position={[-6, -2, -4]} intensity={0.35} color="#88aaff" />
      <hemisphereLight args={['#ffffff', '#223', 0.5]} />
    </>
  );
}

/**
 * Strzałka aktualizowana w każdej klatce (bez przerysowywania Reacta).
 * `get` zwraca [początek, wektor] w układzie sceny albo null, gdy strzałka ma zniknąć.
 */
export function DynamicArrow({ get, color, radius = 0.035 }: { get: () => [THREE.Vector3, THREE.Vector3] | null; color: string; radius?: number }) {
  const group = useRef<THREE.Group>(null);
  const shaft = useRef<THREE.Mesh>(null);
  const cone = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const g = group.current;
    if (!g || !shaft.current || !cone.current) return;
    const r = get();
    if (!r || r[1].length() < 1e-3) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const [from, vec] = r;
    const len = vec.length();
    const head = Math.min(len * 0.4, radius * 7);
    const dir = vec.clone().normalize();
    g.position.copy(from);
    g.quaternion.setFromUnitVectors(UP, dir);
    shaft.current.scale.set(1, Math.max(1e-3, len - head), 1);
    shaft.current.position.set(0, (len - head) / 2, 0);
    cone.current.scale.set(1, head, 1);
    cone.current.position.set(0, len - head / 2, 0);
  });
  return (
    <group ref={group}>
      <mesh ref={shaft}>
        <cylinderGeometry args={[radius, radius, 1, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh ref={cone}>
        <coneGeometry args={[radius * 2.6, 1, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}
