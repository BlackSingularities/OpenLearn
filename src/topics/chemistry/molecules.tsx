import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { LewisFormula } from './lewis';

type El = 'H' | 'C' | 'N' | 'O' | 'F' | 'Cl' | 'S' | 'P' | 'B';

const ELEMENTS: Record<El, { color: string; vdw: number; name: string }> = {
  H: { color: '#f4f6fa', vdw: 1.2, name: 'wodór' },
  C: { color: '#3b3f4a', vdw: 1.7, name: 'węgiel' },
  N: { color: '#3d6dff', vdw: 1.55, name: 'azot' },
  O: { color: '#ff3b3b', vdw: 1.52, name: 'tlen' },
  F: { color: '#8fe36b', vdw: 1.47, name: 'fluor' },
  Cl: { color: '#2fd36b', vdw: 1.75, name: 'chlor' },
  S: { color: '#ffd23f', vdw: 1.8, name: 'siarka' },
  P: { color: '#ff8c1a', vdw: 1.8, name: 'fosfor' },
  B: { color: '#ffb5b5', vdw: 1.92, name: 'bor' },
};

interface Molecule {
  name: string;
  formula: string;
  atoms: { el: El; pos: [number, number, number] }[];
  bonds: [number, number, number][]; // [a, b, krotność]
  angle?: { center: number; a: number; b: number; label: string };
  geometry: string;
  /** Kierunki wolnych par elektronowych atomu centralnego (indeks 0). */
  lonePairs?: [number, number, number][];
}

const SCALE = 1.6; // Å → jednostki sceny

function dirFromAngles(polarDeg: number, azimuthDeg: number, len: number): [number, number, number] {
  const p = (polarDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [len * Math.sin(p) * Math.cos(a), len * Math.cos(p), len * Math.sin(p) * Math.sin(a)];
}

function tetra(len: number): [number, number, number][] {
  const s = len / Math.sqrt(3);
  return [
    [s, s, s],
    [-s, -s, s],
    [-s, s, -s],
    [s, -s, -s],
  ];
}

const MOLECULES: Record<string, Molecule> = {
  h2o: {
    name: 'Woda',
    formula: 'H₂O',
    geometry: 'kątowa',
    atoms: [
      { el: 'O', pos: [0, 0, 0] },
      { el: 'H', pos: dirFromAngles(180 - 52.25, 0, 0.96 * SCALE) },
      { el: 'H', pos: dirFromAngles(180 - 52.25, 180, 0.96 * SCALE) },
    ],
    bonds: [
      [0, 1, 1],
      [0, 2, 1],
    ],
    angle: { center: 0, a: 1, b: 2, label: '104,5°' },
    lonePairs: [
      [0, 0.58, 0.82],
      [0, 0.58, -0.82],
    ],
  },
  co2: {
    name: 'Dwutlenek węgla',
    formula: 'CO₂',
    geometry: 'liniowa',
    atoms: [
      { el: 'C', pos: [0, 0, 0] },
      { el: 'O', pos: [1.16 * SCALE, 0, 0] },
      { el: 'O', pos: [-1.16 * SCALE, 0, 0] },
    ],
    bonds: [
      [0, 1, 2],
      [0, 2, 2],
    ],
    angle: { center: 0, a: 1, b: 2, label: '180°' },
  },
  nh3: {
    name: 'Amoniak',
    formula: 'NH₃',
    geometry: 'piramida trygonalna',
    atoms: [
      { el: 'N', pos: [0, 0.25, 0] },
      ...[0, 120, 240].map((az) => {
        const d = dirFromAngles(180 - 68, az, 1.01 * SCALE);
        return { el: 'H' as El, pos: [d[0], d[1] + 0.25, d[2]] as [number, number, number] };
      }),
    ],
    bonds: [
      [0, 1, 1],
      [0, 2, 1],
      [0, 3, 1],
    ],
    angle: { center: 0, a: 1, b: 2, label: '107°' },
    lonePairs: [[0, 1, 0]],
  },
  ch4: {
    name: 'Metan',
    formula: 'CH₄',
    geometry: 'tetraedryczna',
    atoms: [{ el: 'C', pos: [0, 0, 0] }, ...tetra(1.09 * SCALE).map((p) => ({ el: 'H' as El, pos: p }))],
    bonds: [
      [0, 1, 1],
      [0, 2, 1],
      [0, 3, 1],
      [0, 4, 1],
    ],
    angle: { center: 0, a: 1, b: 2, label: '109,5°' },
  },
  c2h4: {
    name: 'Eten (etylen)',
    formula: 'C₂H₄',
    geometry: 'płaska',
    atoms: [
      { el: 'C', pos: [0.67 * SCALE, 0, 0] },
      { el: 'C', pos: [-0.67 * SCALE, 0, 0] },
      ...[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sy]) => {
        const a = (121.3 * Math.PI) / 180;
        const l = 1.087 * SCALE;
        return {
          el: 'H' as El,
          pos: [sx * (0.67 * SCALE - l * Math.cos(a)), sy * l * Math.sin(a), 0] as [number, number, number],
        };
      }),
    ],
    bonds: [
      [0, 1, 2],
      [0, 2, 1],
      [0, 3, 1],
      [1, 4, 1],
      [1, 5, 1],
    ],
    angle: { center: 0, a: 2, b: 3, label: '117°' },
  },
  bf3: {
    name: 'Fluorek boru',
    formula: 'BF₃',
    geometry: 'płaska trygonalna',
    atoms: [{ el: 'B', pos: [0, 0, 0] }, ...[0, 120, 240].map((az) => ({ el: 'F' as El, pos: dirFromAngles(90, az, 1.31 * SCALE) }))],
    bonds: [
      [0, 1, 1],
      [0, 2, 1],
      [0, 3, 1],
    ],
    angle: { center: 0, a: 1, b: 2, label: '120°' },
  },
  pcl5: {
    name: 'Pentachlorek fosforu',
    formula: 'PCl₅',
    geometry: 'bipiramida trygonalna',
    atoms: [
      { el: 'P', pos: [0, 0, 0] },
      ...[0, 120, 240].map((az) => ({ el: 'Cl' as El, pos: dirFromAngles(90, az, 2.02 * SCALE * 0.75) })),
      { el: 'Cl', pos: [0, 2.14 * SCALE * 0.75, 0] },
      { el: 'Cl', pos: [0, -2.14 * SCALE * 0.75, 0] },
    ],
    bonds: [
      [0, 1, 1],
      [0, 2, 1],
      [0, 3, 1],
      [0, 4, 1],
      [0, 5, 1],
    ],
    angle: { center: 0, a: 4, b: 1, label: '90° (oś) · 120° (równik)' },
  },
  sf6: {
    name: 'Sześciofluorek siarki',
    formula: 'SF₆',
    geometry: 'oktaedryczna',
    atoms: [
      { el: 'S', pos: [0, 0, 0] },
      ...([
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ] as [number, number, number][]).map((d) => ({ el: 'F' as El, pos: d.map((v) => v * 1.56 * SCALE) as [number, number, number] })),
    ],
    bonds: [1, 2, 3, 4, 5, 6].map((i) => [0, i, 1] as [number, number, number]),
    angle: { center: 0, a: 1, b: 3, label: '90°' },
  },
};

const UP = new THREE.Vector3(0, 1, 0);

function Bond({ from, to, order, color }: { from: THREE.Vector3; to: THREE.Vector3; order: number; color: string }) {
  const { mid, quat, len, offset } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    // wektor prostopadły dla wiązań wielokrotnych
    let perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1));
    if (perp.lengthSq() < 1e-6) perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(1, 0, 0));
    perp.normalize().multiplyScalar(0.13);
    return { mid, quat, len, offset: perp };
  }, [from, to]);

  const offsets = order === 1 ? [0] : order === 2 ? [-1, 1] : [-1.6, 0, 1.6];
  return (
    <>
      {offsets.map((k) => (
        <mesh key={k} position={mid.clone().addScaledVector(offset, k)} quaternion={quat}>
          <cylinderGeometry args={[order === 1 ? 0.12 : 0.075, order === 1 ? 0.12 : 0.075, len, 20]} />
          <meshStandardMaterial color={color} roughness={0.35} metalness={0.1} />
        </mesh>
      ))}
    </>
  );
}

function AngleArc({ c, a, b, label }: { c: THREE.Vector3; a: THREE.Vector3; b: THREE.Vector3; label: string }) {
  const { points, labelPos } = useMemo(() => {
    const va = a.clone().sub(c).normalize();
    const vb = b.clone().sub(c).normalize();
    const pts: THREE.Vector3[] = [];
    const r = 0.75;
    const opposite = va.dot(vb) < -0.999;
    const perp = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const v = opposite
        ? va.clone().multiplyScalar(Math.cos(Math.PI * t)).addScaledVector(perp, Math.sin(Math.PI * t))
        : va.clone().lerp(vb, t);
      pts.push(v.normalize().multiplyScalar(r).add(c));
    }
    const midDir = pts[16].clone().sub(c).normalize();
    return { points: pts, labelPos: c.clone().addScaledVector(midDir, r + 0.45) };
  }, [a, b, c]);

  const line = useMemo(
    () =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: '#ffd166' }),
      ),
    [points],
  );
  return (
    <>
      <primitive object={line} />
      <Html position={labelPos} center>
        <div className="label-3d" style={{ color: '#ffd166' }}>
          {label}
        </div>
      </Html>
    </>
  );
}

/** Wolna para elektronowa: półprzezroczysty „płat” z dwiema kropkami elektronów. */
function LonePair({ origin, dir }: { origin: THREE.Vector3; dir: [number, number, number] }) {
  const { pos, quat, e1, e2 } = useMemo(() => {
    const d = new THREE.Vector3(...dir).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(UP, d);
    const pos = origin.clone().addScaledVector(d, 0.85);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).multiplyScalar(0.1);
    const tip = origin.clone().addScaledVector(d, 1.05);
    return { pos, quat, e1: tip.clone().add(side), e2: tip.clone().sub(side) };
  }, [origin, dir]);
  return (
    <>
      <mesh position={pos} quaternion={quat} scale={[0.36, 0.62, 0.36]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#f472b6" transparent opacity={0.35} depthWrite={false} roughness={0.4} />
      </mesh>
      {[e1, e2].map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color="#ffd166" />
        </mesh>
      ))}
    </>
  );
}

function MoleculeScene({ params }: SceneProps) {
  const key = String(params.molecule ?? 'h2o');
  const mol = MOLECULES[key] ?? MOLECULES.h2o;
  const style = String(params.style ?? 'ballstick');
  const labels = Boolean(params.labels);
  const showAngle = Boolean(params.angle);
  const spin = Boolean(params.spin);
  const lone = Boolean(params.lone ?? true);
  const group = useRef<THREE.Group>(null);

  const positions = useMemo(() => mol.atoms.map((a) => new THREE.Vector3(...a.pos)), [mol]);

  useFrame((_, dt) => {
    if (spin && group.current) group.current.rotation.y += dt * 0.5;
  });

  const spaceFill = style === 'spacefill';

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 5]} intensity={1.4} />
      <directionalLight position={[-6, -2, -4]} intensity={0.4} color="#88aaff" />
      <hemisphereLight args={['#ffffff', '#223', 0.6]} />

      <group ref={group}>
        {mol.atoms.map((a, i) => {
          const el = ELEMENTS[a.el];
          const r = spaceFill ? el.vdw * 0.9 : a.el === 'H' ? 0.3 : 0.45;
          return (
            <group key={i} position={positions[i]}>
              <mesh>
                <sphereGeometry args={[r, 48, 48]} />
                <meshStandardMaterial
                  color={el.color}
                  roughness={0.25}
                  metalness={0.05}
                  transparent={spaceFill}
                  opacity={spaceFill ? 0.92 : 1}
                />
              </mesh>
              {labels && (
                <Html position={[0, 0, 0]} center zIndexRange={[10, 0]}>
                  <div className={`atom-symbol ${['H', 'F', 'B', 'S', 'Cl'].includes(a.el) ? 'dark' : ''}`}>{a.el}</div>
                </Html>
              )}
            </group>
          );
        })}

        {!spaceFill &&
          mol.bonds.map(([a, b, order], i) => (
            <Bond key={i} from={positions[a]} to={positions[b]} order={order} color="#c9ccd6" />
          ))}

        {lone && !spaceFill &&
          mol.lonePairs?.map((d, i) => <LonePair key={i} origin={positions[0]} dir={d} />)}

        {showAngle && !spaceFill && mol.angle && (
          <AngleArc
            c={positions[mol.angle.center]}
            a={positions[mol.angle.a]}
            b={positions[mol.angle.b]}
            label={mol.angle.label}
          />
        )}
      </group>

      <InfoPortal>
        <div style={{ fontWeight: 700 }}>
          {mol.name} · {mol.formula}
        </div>
        <div className="muted-line">budowa {mol.geometry}</div>
        <LewisFormula id={key} />
      </InfoPortal>
    </>
  );
}

const commonControls = [
  {
    type: 'select' as const,
    key: 'style',
    label: 'Model',
    default: 'ballstick',
    options: [
      { value: 'ballstick', label: 'Kulki i pręciki' },
      { value: 'spacefill', label: 'Czaszowy' },
    ],
  },
  { type: 'toggle' as const, key: 'angle', label: 'Pokaż kąt wiązania', default: true },
  { type: 'toggle' as const, key: 'lone', label: 'Wolne pary elektronowe', default: true },
  { type: 'toggle' as const, key: 'labels', label: 'Symbole pierwiastków', default: true },
  { type: 'toggle' as const, key: 'spin', label: 'Obracaj', default: true },
];

export const molecules: Topic = {
  id: 'ksztalty-czasteczek',
  title: 'Kształty cząsteczek w 3D',
  subject: 'chemia',
  summary: 'Dlaczego woda jest „zgięta”, a CO₂ prosty? Obracaj cząsteczki i poznaj teorię VSEPR.',
  accent: '#3d8bff',
  glyph: '⚛',
  steps: [
    {
      title: 'Woda – cząsteczka kątowa',
      kind: '3d',
      scene: MoleculeScene,
      preset: { molecule: 'h2o' },
      camera: [0, 1, 7],
      controls: commonControls,
      body: (
        <>
          <p>
            Cząsteczka wody składa się z atomu <strong>tlenu</strong> (czerwony) i dwóch atomów{' '}
            <strong>wodoru</strong> (białe).
          </p>
          <p>
            Nie jest prosta – wiązania tworzą kąt około <strong>104,5°</strong>. Powodem są dwie{' '}
            <strong>wolne pary elektronowe</strong> tlenu, które odpychają wiązania i „zginają” cząsteczkę.
          </p>
          <p>Ten kształt sprawia, że woda jest polarna, dzięki czemu rozpuszcza sól i cukier.</p>
        </>
      ),
    },
    {
      title: 'Dwutlenek węgla – cząsteczka liniowa',
      kind: '3d',
      scene: MoleculeScene,
      preset: { molecule: 'co2' },
      camera: [0, 1.5, 7],
      controls: commonControls,
      body: (
        <>
          <p>
            W CO₂ atom węgla łączy się z każdym tlenem <strong>wiązaniem podwójnym</strong>. Węgiel nie ma wolnych
            par elektronowych.
          </p>
          <p>
            Dwie grupy elektronów odpychają się najsilniej, gdy są po przeciwnych stronach, więc kąt wynosi{' '}
            <strong>180°</strong>.
          </p>
          <p>Mimo że wiązania C=O są polarne, symetria sprawia, że cała cząsteczka jest niepolarna.</p>
        </>
      ),
    },
    {
      title: 'Metan – tetraedr',
      kind: '3d',
      scene: MoleculeScene,
      preset: { molecule: 'ch4' },
      camera: [4, 3, 5],
      controls: commonControls,
      body: (
        <>
          <p>
            Węgiel w metanie tworzy cztery wiązania pojedyncze. Najdalej od siebie cztery pary elektronów mogą być
            w wierzchołkach <strong>czworościanu foremnego</strong>.
          </p>
          <div className="formula">kąt H–C–H = 109,5°</div>
          <p>Obróć model – w żadnym rzucie płaskim nie widać prawdziwego kształtu. Dlatego warto patrzeć w 3D.</p>
        </>
      ),
    },
    {
      title: 'Więcej niż oktet: BF₃, PCl₅, SF₆',
      kind: '3d',
      scene: MoleculeScene,
      camera: [5, 3, 7],
      controls: [
        {
          type: 'select',
          key: 'molecule',
          label: 'Cząsteczka',
          default: 'bf3',
          options: [
            { value: 'bf3', label: 'BF₃' },
            { value: 'pcl5', label: 'PCl₅' },
            { value: 'sf6', label: 'SF₆' },
          ],
        },
        ...commonControls,
      ],
      body: (
        <>
          <p>
            Liczba par elektronowych wokół atomu centralnego wyznacza geometrię: <strong>3 pary</strong> – trójkąt
            (120°), <strong>4</strong> – tetraedr (109,5°), <strong>5</strong> – bipiramida trygonalna (90° i 120°),{' '}
            <strong>6</strong> – oktaedr (90°).
          </p>
          <p>
            Bor w BF₃ ma tylko 6 elektronów walencyjnych – to tzw. <strong>luka elektronowa</strong>. Fosfor i siarka
            mogą mieć ich więcej niż 8 (<strong>rozszerzony oktet</strong>), bo mają dostępne orbitale trzeciej powłoki.
          </p>
          <p>Obróć PCl₅: dwa atomy chloru leżą na osi, trzy w płaszczyźnie „równika”.</p>
        </>
      ),
    },
    {
      title: 'Porównaj kształty',
      kind: '3d',
      scene: MoleculeScene,
      camera: [3, 2, 7],
      controls: [
        {
          type: 'select',
          key: 'molecule',
          label: 'Cząsteczka',
          default: 'nh3',
          options: Object.entries(MOLECULES).map(([value, m]) => ({ value, label: m.formula })),
        },
        ...commonControls,
      ],
      body: (
        <>
          <p>
            <strong>Teoria VSEPR</strong> mówi, że pary elektronów wokół atomu centralnego ustawiają się jak
            najdalej od siebie.
          </p>
          <p>
            Wolne pary odpychają mocniej niż wiązania, dlatego w NH₃ kąt to 107°, a w H₂O już tylko 104,5°, choć oba
            wywodzą się z tetraedru.
          </p>
          <p>Przełączaj cząsteczki i porównaj kąty oraz modele czaszowe, które pokazują rzeczywisty rozmiar atomów.</p>
        </>
      ),
    },
  ],
};
