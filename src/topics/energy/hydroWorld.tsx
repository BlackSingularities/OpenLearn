/*
 * Elektrownia wodna – otoczenie: drogi wzdłuż brzegów jeziora i doliny, wieś na terasie, przystań z pomostem,
 * żaglówki i statek wycieczkowy na jeziorze, samochody. Wszystko korzysta z tych samych materiałów
 * (i płaszczyzny przekroju) co reszta modelu.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CREST, LEVEL, SWY, cz, groundH, rng, type V3 } from './hydroGeo';
import { Box, CLIP, CylY, HMAT } from './hydroPlant';

/* ================= drogi ================= */

/** Punkt na zboczu, w którym teren osiąga wysokość `h` (strona −1 – lewy brzeg, +1 – prawy). */
export function contourX(z: number, h: number, side: number) {
  const x0 = cz(z);
  for (let d = 0; d < 900; d += 2) if (groundH(x0 + side * d, z) >= h) return x0 + side * d;
  return x0 + side * 900;
}

/** Wstęga drogi szerokości `w` po łamanej (x, z), dopasowana do terenu (nie niżej niż `minY`). */
function Road({ pts, w = 7, minY = -50 }: { pts: [number, number][]; w?: number; minY?: number }) {
  const geo = useMemo(() => {
    // równe kroki co ok. 5 m
    const P: [number, number][] = [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 5));
      for (let k = 0; k < n; k++) P.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    P.push(pts[pts.length - 1]);
    const pos: number[] = [];
    const idx: number[] = [];
    P.forEach(([x, z], i) => {
      const a = P[Math.max(0, i - 1)];
      const b = P[Math.min(P.length - 1, i + 1)];
      let tx = b[0] - a[0];
      let tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      for (const s of [-1, 1]) {
        const px = x - tz * s * (w / 2);
        const pz = z + tx * s * (w / 2);
        pos.push(px, Math.max(minY, groundH(px, pz), groundH(x, z)) + 0.3, pz);
      }
      if (i > 0) {
        const o = (i - 1) * 2;
        idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [pts, w, minY]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5a5c5f', roughness: 0.95, side: THREE.DoubleSide, clippingPlanes: CLIP, polygonOffset: true, polygonOffsetFactor: -2 }), []);
  return <mesh geometry={geo} material={mat} />;
}

/** Trasy dróg: brzegi jeziora (na wysokości korony), zjazd do rozdzielni i drogi na terasach w dolinie. */
export function useRoads() {
  return useMemo(() => {
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let z = 2; z >= -1150; z -= 30) left.push([contourX(z, CREST + 2, -1), z]);
    for (let z = 2; z >= -900; z -= 30) right.push([contourX(z, CREST + 2, 1), z]);
    const lx = contourX(30, CREST + 2, -1);
    const down: [number, number][] = [
      [lx, 2],
      [lx + 10, 40],
      [SWY.x0 - 40, 90],
      [SWY.x0 - 12, SWY.z0 - 6],
    ];
    const terL: [number, number][] = [[SWY.x0 - 12, SWY.z0 - 6]];
    for (let z = SWY.z1 + 20; z <= 1250; z += 40) terL.push([cz(z) - 76, z]);
    const terR: [number, number][] = [];
    for (let z = 150; z <= 1250; z += 40) terR.push([cz(z) + 74, z]);
    return { left, right, down, terL, terR };
  }, []);
}

export function Roads() {
  const r = useRoads();
  return (
    <group>
      <Road pts={r.left} minY={CREST - 1} />
      <Road pts={r.right} minY={CREST - 1} />
      <Road pts={r.down} />
      <Road pts={r.terL} />
      <Road pts={r.terR} />
    </group>
  );
}

/* ================= wieś na terasie ================= */

const HOUSE_COLORS = ['#efe7d6', '#e8dcc2', '#f2efe8', '#d9cdb5', '#e6d2b8'];
const ROOF_COLORS = ['#8b3a2b', '#6d4c3d', '#4f555c', '#7a3326'];

/** Domy z dwuspadowymi dachami po obu stronach drogi na prawym brzegu i kilka przy przystani. */
export function Village() {
  const houses = useMemo(() => {
    const r = rng(83);
    const list: { p: V3; rot: number; w: number; d: number; h: number; wall: number; roof: number }[] = [];
    for (let z = 330; z < 640; z += 22) {
      for (const off of [62 + r() * 4, 88 + r() * 3]) {
        if (r() < 0.25) continue;
        const x = cz(z) + off;
        list.push({ p: [x, groundH(x, z), z + (r() - 0.5) * 6], rot: Math.atan2(1, 0) + (r() - 0.5) * 0.3, w: 8 + r() * 4, d: 10 + r() * 4, h: 5 + r() * 2, wall: Math.floor(r() * HOUSE_COLORS.length), roof: Math.floor(r() * ROOF_COLORS.length) });
      }
    }
    return list;
  }, []);
  const mats = useMemo(
    () => ({
      walls: HOUSE_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, clippingPlanes: CLIP })),
      roofs: ROOF_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true, clippingPlanes: CLIP })),
    }),
    [],
  );
  const roofGeo = useMemo(() => {
    const s = new THREE.Shape([new THREE.Vector2(-0.55, 0), new THREE.Vector2(0.55, 0), new THREE.Vector2(0, 0.5)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  }, []);
  return (
    <group>
      {houses.map((h, i) => (
        <group key={i} position={h.p} rotation={[0, h.rot, 0]}>
          <mesh position={[0, h.h / 2, 0]} material={mats.walls[h.wall]}>
            <boxGeometry args={[h.w, h.h, h.d]} />
          </mesh>
          <mesh geometry={roofGeo} position={[0, h.h, 0]} scale={[h.w, h.w * 0.9, h.d + 0.8]} material={mats.roofs[h.roof]} />
        </group>
      ))}
    </group>
  );
}

/* ================= jezioro: przystań, łódki ================= */

/** Miejsce przystani na lewym brzegu jeziora. */
const MARINA_Z = -430;

function Sailboat({ color }: { color: string }) {
  const n = HMAT();
  const sail = useMemo(() => {
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(3.2, 0), new THREE.Vector2(0, 9)]);
    return new THREE.ShapeGeometry(s);
  }, []);
  const sailMat = useMemo(() => new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8, clippingPlanes: CLIP }), [color]);
  return (
    <group>
      <mesh position={[0, 0.5, 0]} scale={[1, 0.55, 1]} material={n.white}>
        <cylinderGeometry args={[1.3, 0.7, 1.6, 4, 1]} />
      </mesh>
      <mesh position={[0, 0.5, 0]} scale={[1, 1, 3]} material={n.white} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[1.4, 0.9, 1.4]} />
      </mesh>
      <CylY p={[0, 0.9, -0.6]} r={0.08} h={10} m={n.steelDark} seg={6} />
      <mesh geometry={sail} position={[0.05, 1.4, -0.6]} rotation={[0, Math.PI / 2, 0]} material={sailMat} />
    </group>
  );
}

/** Statek wycieczkowy: kadłub, dwa pokłady, mostek. */
function TourBoat() {
  const n = HMAT();
  return (
    <group>
      <Box p={[0, 0.8, 0]} s={[6, 1.8, 26]} m={n.white} />
      <mesh position={[0, 0.8, -13]} rotation={[0, Math.PI / 4, 0]} material={n.white}>
        <boxGeometry args={[4.24, 1.8, 4.24]} />
      </mesh>
      <Box p={[0, 2.8, 2]} s={[5.4, 2.2, 18]} m={n.glass} />
      <Box p={[0, 4.05, 2]} s={[5.8, 0.3, 18.6]} m={n.white} />
      <Box p={[0, 5, -4]} s={[3, 1.6, 3.2]} m={n.white} />
      <Box p={[0, 0.25, 0]} s={[6.1, 0.4, 26.1]} m={n.red} />
    </group>
  );
}

/** Pomost przystani z cumującymi łódkami, żaglówki pływające po jeziorze i statek kursujący wzdłuż jeziora. */
export function Lake({ level }: { level: () => number }) {
  const n = HMAT();
  const shore = useMemo(() => contourX(MARINA_Z, LEVEL, -1), []);
  const boats = useMemo(() => {
    const r = rng(97);
    return Array.from({ length: 7 }, (_, i) => ({ cx: (r() - 0.5) * 200, cz: -320 - i * 110 - r() * 50, rx: 30 + r() * 40, rz: 40 + r() * 50, sp: 0.02 + r() * 0.03, ph: r() * 6.28, col: ['#ffffff', '#f97316', '#38bdf8', '#facc15', '#ffffff', '#f43f5e', '#ffffff'][i] }));
  }, []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const ship = useRef<THREE.Group>(null);
  const moored = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const L = level();
    boats.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = b.ph + t * b.sp;
      g.position.set(b.cx + Math.cos(a) * b.rx, L + 0.1, b.cz + Math.sin(a) * b.rz);
      g.rotation.set(Math.sin(t * 0.8 + i) * 0.04, -a, 0.12 + Math.sin(t * 0.6 + i) * 0.03);
    });
    if (ship.current) {
      // statek pływa tam i z powrotem wzdłuż jeziora
      const u = (Math.sin(t * 0.012) + 1) / 2;
      const z = -260 - u * 640;
      ship.current.position.set(cz(z) + 30, L + 0.1, z);
      ship.current.rotation.y = Math.cos(t * 0.012) > 0 ? Math.PI : 0;
    }
    if (moored.current) moored.current.position.y = L;
  });
  return (
    <group>
      {/* pomost przystani */}
      <group position={[shore, 0, MARINA_Z]}>
        <group ref={moored}>
          <Box p={[22, 1, 0]} s={[44, 0.6, 4]} m={n.trunk} />
          {[10, 24, 38].map((x) => (
            <Box key={x} p={[x, 1, 6]} s={[2, 0.6, 12]} m={n.trunk} />
          ))}
          {[14, 28, 42].map((x, i) => (
            <group key={x} position={[x, 0.1, 7]} rotation={[0, Math.PI / 2, 0]}>
              <Sailboat color={['#ffffff', '#38bdf8', '#ffffff'][i]} />
            </group>
          ))}
        </group>
      </group>
      {boats.map((b, i) => (
        <group key={i} ref={(g) => (refs.current[i] = g)}>
          <Sailboat color={b.col} />
        </group>
      ))}
      <group ref={ship}>
        <TourBoat />
      </group>
    </group>
  );
}

/** Kilka samochodów na drogach (stoją – to tylko skala i życie w krajobrazie). */
export function Cars() {
  const r = useRoads();
  const cars = useMemo(() => {
    const rr = rng(101);
    const pick = (list: [number, number][], k: number): [number, number, number] => {
      const i = Math.min(list.length - 2, Math.floor(k * (list.length - 1)));
      const [ax, az] = list[i];
      const [bx, bz] = list[i + 1];
      return [ax, az, Math.atan2(bx - ax, bz - az)];
    };
    const spots = [pick(r.left, 0.1), pick(r.left, 0.5), pick(r.right, 0.3), pick(r.terR, 0.3), pick(r.terR, 0.34), pick(r.terL, 0.6), pick(r.down, 0.4)];
    return spots.map(([x, z, a]) => ({ x, z, a, col: ['#c0392b', '#2c3e50', '#ecf0f1', '#2980b9', '#7f8c8d', '#16a085', '#f1c40f'][Math.floor(rr() * 7)] }));
  }, [r]);
  const mats = useMemo(() => new Map<string, THREE.Material>(), []);
  const mat = (c: string) => {
    if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3, clippingPlanes: CLIP }));
    return mats.get(c)!;
  };
  const n = HMAT();
  return (
    <group>
      {cars.map((c, i) => (
        <group key={i} position={[c.x + 1.6, groundH(c.x + 1.6, c.z) + 0.35, c.z]} rotation={[0, c.a, 0]}>
          <Box p={[0, 0.7, 0]} s={[1.8, 0.8, 4.4]} m={mat(c.col)} />
          <Box p={[0, 1.35, -0.2]} s={[1.6, 0.6, 2.4]} m={n.glass} />
        </group>
      ))}
    </group>
  );
}
