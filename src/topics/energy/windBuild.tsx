/*
 * Elektrownia wiatrowa – montaż turbiny. Dźwig gąsienicowy z wysięgnikiem kratowym podnosi kolejno pięć segmentów
 * wieży, gondolę, piastę i trzy łopaty. Każdy element: podniesienie z placu, obrót wysięgnika, opuszczenie na
 * miejsce. Między łopatami wirnik obraca się o 120°, żeby kolejne gniazdo stanęło poziomo.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DEG, HUB, T, clamp, mix, sm, type V3 } from './windGeo';
import { BladeMesh, MAT, Nacelle, Rotor, TowerSection, type TurbineState } from './windTurbine';
import { Crane, type CraneState } from './windExtras';

/** Podstawa dźwigu na placu montażowym. */
export const CRANE_AT: V3 = [26, 0, -16];

type Part = { id: string; dur: number; pick: V3; final: V3; hook: number; turn?: number };

/** Kąt wirnika, przy którym gniazdo łopaty i jest poziomo, w stronę −z. */
const slotAngle = (i: number) => -Math.PI / 2 - (i * 2 * Math.PI) / 3;

/** Środek ciężkości łopaty w gnieździe (poziomej, w stronę −z) – w układzie turbiny. */
const BLADE_COG = 24;
const bladeFinal = (): V3 => [HUB[0] + 1.8, HUB[1], -(T.rootR + BLADE_COG)];

function plan(): Part[] {
  const out: Part[] = [];
  const at = (deg: number, rad: number, y: number): V3 => {
    const a = deg * DEG;
    return [CRANE_AT[0] + Math.cos(a) * rad, y, CRANE_AT[2] - Math.sin(a) * rad];
  };
  for (let i = 0; i < 5; i++) {
    const y0 = T.flanges[i];
    const y1 = T.flanges[i + 1];
    const h = y1 - y0;
    out.push({ id: `sec${i}`, dur: 4.6, pick: at(-40 - i * 13, 34, h / 2 + 0.4), final: [0, (y0 + y1) / 2, 0], hook: h / 2 + 3 });
  }
  out.push({ id: 'nacelle', dur: 5.5, pick: at(-112, 30, 3), final: [-1.5, T.towerH + 2.4, 0], hook: 5 });
  out.push({ id: 'hub', dur: 4.6, pick: at(-128, 30, 3), final: [HUB[0], HUB[1], 0], hook: 4.5 });
  for (let i = 0; i < 3; i++) out.push({ id: `blade${i}`, dur: 6.5, pick: at(-160 + i * 16, 36, 2.5), final: bladeFinal(), hook: 6, turn: i > 0 ? 1.6 : 0 });
  return out;
}

/** Położenie w czasie t: rozkład planu na odcinki. */
function timeline(parts: Part[]) {
  let t = 1;
  return parts.map((p) => {
    const t0 = t + (p.turn ?? 0);
    t = t0 + p.dur;
    return { ...p, t0, t1: t };
  });
}
export const BUILD_T = (() => {
  const tl = timeline(plan());
  return tl[tl.length - 1].t1 + 2;
})();

/** Biegunowe położenie względem dźwigu. */
const polar = (p: V3): [number, number] => {
  const dx = p[0] - CRANE_AT[0];
  const dz = p[2] - CRANE_AT[2];
  return [Math.atan2(-dz, dx), Math.hypot(dx, dz)];
};
function unwrap(a: number, ref: number) {
  while (a - ref > Math.PI) a -= 2 * Math.PI;
  while (a - ref < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function BuildSite({ time, st }: { time: () => number; st: TurbineState }) {
  const tl = useMemo(() => timeline(plan()), []);
  const cs = useRef<CraneState>({ slew: 0, reach: 30, hook: [0, 0, 0] });
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const phaseOf = (id: string) => tl.find((p) => p.id === id)!;
  const rotorSt = useMemo<TurbineState>(() => ({ ...st, angle: slotAngle(0), pitch: 0 }), [st]);
  const placed = useRef<Record<string, boolean>>({});
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const t = time();
    // obrót wirnika do gniazda kolejnej łopaty
    let rot = slotAngle(0);
    for (let i = 1; i < 3; i++) {
      const p = phaseOf(`blade${i}`);
      const k = sm(p.t0 - (p.turn ?? 0), p.t0, t);
      rot = mix(rot, slotAngle(i), k);
    }
    rotorSt.angle = rot;
    let active: (typeof tl)[number] | null = null;
    for (const p of tl) {
      const g = groups.current[p.id];
      if (!g) continue;
      const u = clamp((t - p.t0) / (p.t1 - p.t0));
      placed.current[p.id] = u >= 1;
      // gniazdo łopaty: łopata „final” liczona dla wirnika w położeniu montażu (zawsze poziomo, −z)
      const [a0, r0] = polar(p.pick);
      const [a1, r1] = polar(p.final);
      const a1u = unwrap(a1, a0);
      const top = p.final[1] + 6;
      let a = a0;
      let r = r0;
      let y = p.pick[1];
      if (u > 0 && u < 1) {
        const lift = sm(0, 0.35, u);
        const swing = sm(0.35, 0.72, u);
        const lower = sm(0.72, 1, u);
        a = mix(a0, a1u, swing);
        r = mix(r0, r1, swing);
        y = mix(mix(p.pick[1], top, lift), p.final[1], lower);
        active = p;
      } else if (u >= 1) {
        a = a1;
        r = r1;
        y = p.final[1];
      }
      const pos: V3 = [CRANE_AT[0] + Math.cos(a) * r, y, CRANE_AT[2] - Math.sin(a) * r];
      // obrót elementu razem z wysięgnikiem; na miejscu – ustawienie docelowe
      const psi = u >= 1 ? 0 : a - a1u;
      g.position.set(pos[0], pos[1], pos[2]);
      g.rotation.y = psi;
      const inner = g.children[0] as THREE.Group | undefined;
      if (inner) inner.position.set(-p.final[0], -p.final[1], -p.final[2]);
      if (p === active) cs.current.hook = [pos[0], pos[1] + p.hook, pos[2]];
    }
    // dźwig: hak nad aktywnym elementem albo spoczynek nad następnym
    if (!active) {
      const next = tl.find((p) => t < p.t0) ?? tl[tl.length - 1];
      const [a, r] = polar(next.pick);
      cs.current.slew = a;
      cs.current.reach = r;
      cs.current.hook = [CRANE_AT[0] + Math.cos(a) * r, next.pick[1] + next.hook + 8, CRANE_AT[2] - Math.sin(a) * r];
    } else {
      const [hx, , hz] = cs.current.hook;
      v.set(hx - CRANE_AT[0], 0, hz - CRANE_AT[2]);
      cs.current.slew = Math.atan2(-v.z, v.x);
      cs.current.reach = Math.max(12, v.length());
    }
  });
  const reg = (id: string) => (g: THREE.Group | null) => {
    groups.current[id] = g;
  };
  return (
    <group>
      <Crane at={CRANE_AT} cs={cs} />
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} ref={reg(`sec${i}`)}>
          <group>
            <TowerSection i={i} />
          </group>
        </group>
      ))}
      <group ref={reg('nacelle')}>
        <group>
          <group position={[0, T.towerH, 0]}>
            <Nacelle st={st} noRotor />
          </group>
        </group>
      </group>
      <group ref={reg('hub')}>
        <group>
          <group position={[HUB[0], HUB[1], 0]} rotation={[0, 0, T.tilt]}>
            <Rotor st={rotorSt} lod="high" blades={0} />
          </group>
        </group>
      </group>
      {[0, 1, 2].map((i) => (
        <BuildBlade key={i} i={i} reg={reg(`blade${i}`)} placedRef={placed} rotorSt={rotorSt} />
      ))}
      {/* cokół fundamentu */}
      <mesh position={[0, 0.15, 0]} material={MAT.concrete}>
        <cylinderGeometry args={[3.3, 3.5, 0.6, 48]} />
      </mesh>
    </group>
  );
}

/**
 * Łopata montażu: w powietrzu leci poziomo (pozycja jak w gnieździe poziomym), a po zamocowaniu obraca się
 * razem z wirnikiem do kolejnych gniazd.
 */
function BuildBlade({ i, reg, placedRef, rotorSt }: { i: number; reg: (g: THREE.Group | null) => void; placedRef: React.MutableRefObject<Record<string, boolean>>; rotorSt: TurbineState }) {
  const fly = useRef<THREE.Group>(null);
  const mounted = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  useFrame(() => {
    const done = placedRef.current[`blade${i}`];
    if (fly.current) fly.current.visible = !done;
    if (mounted.current) mounted.current.visible = !!done;
    if (spin.current) spin.current.rotation.x = rotorSt.angle + (i * 2 * Math.PI) / 3;
  });
  // łopata w gnieździe poziomym: kąt wirnika + gniazdo = −90° (w stronę −z)
  return (
    <>
      <group ref={(g) => {
          (fly as React.MutableRefObject<THREE.Group | null>).current = g;
          reg(g);
        }}>
        <group>
          <group position={[HUB[0], HUB[1], 0]} rotation={[0, 0, T.tilt]}>
            <group rotation={[-Math.PI / 2, 0, 0]}>
              <group rotation={[0, 0, -T.cone]}>
                <BladeMesh />
              </group>
            </group>
          </group>
        </group>
      </group>
      <group ref={mounted} position={[HUB[0], HUB[1], 0]} rotation={[0, 0, T.tilt]}>
        <group ref={spin}>
          <group rotation={[0, 0, -T.cone]}>
            <BladeMesh />
          </group>
        </group>
      </group>
    </>
  );
}
