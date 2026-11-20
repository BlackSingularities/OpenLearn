import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { Lights } from '../../lib/three';
import { num } from '../../lib/mathkit';

const PINK = '#ff6b8b';
const BLUE = '#4fc3ff';
const GOLD = '#ffd166';
const GREEN = '#4ade80';

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
      <circleGeometry args={[4.5, 64]} />
      <meshStandardMaterial color="#1a1f2e" transparent opacity={0.6} />
    </mesh>
  );
}

/* ---------- Krok 1: graniastosłup i ostrosłup ---------- */
function PrismScene({ params }: SceneProps) {
  const n = Number(params.n);
  const h = Number(params.h);
  const r = Number(params.r);
  const fill = Number(params.fill);
  const liquid = useRef<THREE.Mesh>(null);
  const level = useRef(0);
  useFrame((_, dt) => {
    const target = (fill / 3) * h;
    level.current += (target - level.current) * Math.min(1, dt * 3);
    const m = liquid.current;
    if (m) {
      const H = Math.max(0.001, level.current);
      m.scale.set(1, H, 1);
      m.position.y = H / 2;
      m.visible = level.current > 0.005;
    }
  });
  const base = (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
  const off = r * 1.25;
  return (
    <group>
      <Lights />
      <Floor />
      {/* graniastosłup */}
      <group position={[-off, 0, 0]}>
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[r, r, h, n, 1]} />
          <meshStandardMaterial color={BLUE} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
          <Edges color={BLUE} />
        </mesh>
        <mesh ref={liquid}>
          <cylinderGeometry args={[r * 0.985, r * 0.985, 1, n, 1]} />
          <meshStandardMaterial color={BLUE} transparent opacity={0.55} />
        </mesh>
      </group>
      {/* ostrosłup o tej samej podstawie i wysokości */}
      <group position={[off, 0, 0]}>
        <mesh position={[0, h / 2, 0]}>
          <coneGeometry args={[r, h, n, 1]} />
          <meshStandardMaterial color={PINK} flatShading transparent opacity={0.85} />
          <Edges color="#ffd1dc" />
        </mesh>
      </group>
      <InfoPortal>
        <div style={{ color: BLUE, fontWeight: 600 }}>graniastosłup: V = Pp · h = {num(base * h)}</div>
        <div style={{ color: PINK, fontWeight: 600 }}>ostrosłup: V = ⅓ · Pp · h = {num((base * h) / 3)}</div>
        <div>
          podstawa: {n}-kąt foremny, Pp = {num(base)}, h = {num(h)}
        </div>
        <div className="muted-line">wlano {fill} z 3 ostrosłupów wody</div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 2: bryły obrotowe ---------- */
const PROFILES: Record<string, { name: string; pts: (r: number, h: number) => THREE.Vector2[]; V: (r: number, h: number) => number; P: (r: number, h: number) => number; Vtxt: string; Ptxt: string }> = {
  walec: {
    name: 'prostokąt → walec',
    pts: (r, h) => [new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, h), new THREE.Vector2(0, h)],
    V: (r, h) => Math.PI * r * r * h,
    P: (r, h) => 2 * Math.PI * r * r + 2 * Math.PI * r * h,
    Vtxt: 'V = πr²h',
    Ptxt: 'P = 2πr² + 2πrh',
  },
  stozek: {
    name: 'trójkąt prostokątny → stożek',
    pts: (r, h) => [new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(0, h)],
    V: (r, h) => (Math.PI * r * r * h) / 3,
    P: (r, h) => Math.PI * r * r + Math.PI * r * Math.hypot(r, h),
    Vtxt: 'V = ⅓πr²h',
    Ptxt: 'P = πr² + πrl,  l = √(r² + h²)',
  },
  kula: {
    name: 'półkole → kula',
    pts: (r) => Array.from({ length: 33 }, (_, i) => {
      const t = (i / 32) * Math.PI;
      return new THREE.Vector2(r * Math.sin(t), r - r * Math.cos(t));
    }),
    V: (r) => (4 / 3) * Math.PI * r ** 3,
    P: (r) => 4 * Math.PI * r * r,
    Vtxt: 'V = 4/3 · πr³',
    Ptxt: 'P = 4πr²',
  },
};

function LatheScene({ params }: SceneProps) {
  const kind = String(params.shape);
  const prof = PROFILES[kind] ?? PROFILES.stozek;
  const r = Number(params.r);
  const h = kind === 'kula' ? 2 * r : Number(params.h);
  const play = Boolean(params.play);
  const [phi, setPhi] = useState(0.0001);
  const acc = useRef(0);
  useFrame((_, dt) => {
    if (!play) return;
    acc.current = (acc.current + dt * 1.1) % (2 * Math.PI + 1.6);
    setPhi(Math.min(2 * Math.PI, Math.max(0.0001, acc.current)));
  });
  const angle = play ? phi : (Number(params.angle) / 360) * 2 * Math.PI;
  const pts = useMemo(() => prof.pts(r, h), [prof, r, h]);
  const lathe = useMemo(() => new THREE.LatheGeometry(pts, 72, 0, Math.max(0.0001, angle)), [pts, angle]);
  const shape = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(pts)), [pts]);
  return (
    <group position={[0, 0, 0]}>
      <Lights />
      <Floor />
      <Line points={[[0, -0.3, 0], [0, h + 0.8, 0]]} color={GOLD} lineWidth={2} dashed dashSize={0.15} gapSize={0.1} />
      <mesh geometry={lathe}>
        <meshStandardMaterial color={PINK} side={THREE.DoubleSide} transparent opacity={0.8} roughness={0.45} />
      </mesh>
      {/* figura obracana */}
      <group rotation={[0, angle - Math.PI / 2, 0]}>
        <mesh geometry={shape}>
          <meshStandardMaterial color={BLUE} side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
      </group>
      <group rotation={[0, -Math.PI / 2, 0]}>
        <mesh geometry={shape}>
          <meshStandardMaterial color={BLUE} side={THREE.DoubleSide} transparent opacity={0.25} />
        </mesh>
      </group>
      <InfoPortal>
        <div style={{ color: BLUE, fontWeight: 600 }}>{prof.name}</div>
        <div>
          obrót: {Math.round((angle / (2 * Math.PI)) * 360)}° · oś obrotu – żółta
        </div>
        <div style={{ color: PINK, fontWeight: 600 }}>
          {prof.Vtxt} = {num(prof.V(r, h))}
        </div>
        <div style={{ color: GOLD }}>
          {prof.Ptxt} = {num(prof.P(r, h))}
        </div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 3: przekroje sześcianu ---------- */
const S = 1.4;
const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new THREE.Vector3(x * S, y * S, z * S))));
const EDGES: [number, number][] = [];
for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (CORNERS[i].distanceTo(CORNERS[j]) < 2 * S + 1e-6) EDGES.push([i, j]);

const NORMALS: Record<string, [number, number, number]> = {
  pion: [0, 1, 0],
  ukos: [1, 1, 0],
  przekatna: [1, 1, 1],
  skos: [1, 2, 3],
};

function sectionOf(n: THREE.Vector3, d: number) {
  const pts: THREE.Vector3[] = [];
  for (const [i, j] of EDGES) {
    const a = CORNERS[i];
    const b = CORNERS[j];
    const fa = n.dot(a) - d;
    const fb = n.dot(b) - d;
    if (fa * fb > 0 || (Math.abs(fa) < 1e-9 && Math.abs(fb) < 1e-9)) continue;
    const t = fa / (fa - fb);
    const q = a.clone().lerp(b, t);
    if (!pts.some((x) => x.distanceTo(q) < 1e-5)) pts.push(q);
  }
  if (pts.length < 3) return { pts: [] as THREE.Vector3[], area: 0 };
  const c = pts.reduce((acc, q) => acc.add(q), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const u = pts[0].clone().sub(c).normalize();
  const w = n.clone().cross(u).normalize();
  pts.sort((p1, p2) => {
    const v1 = p1.clone().sub(c);
    const v2 = p2.clone().sub(c);
    return Math.atan2(v1.dot(w), v1.dot(u)) - Math.atan2(v2.dot(w), v2.dot(u));
  });
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i].clone().sub(c);
    const b = pts[(i + 1) % pts.length].clone().sub(c);
    area += a.cross(b).length() / 2;
  }
  return { pts, area };
}

const NAMES: Record<number, string> = { 3: 'trójkąt', 4: 'czworokąt', 5: 'pięciokąt', 6: 'sześciokąt' };

function SectionScene({ params }: SceneProps) {
  const dir = NORMALS[String(params.dir)] ?? NORMALS.przekatna;
  const n = useMemo(() => new THREE.Vector3(...dir).normalize(), [dir]);
  const maxD = S * (Math.abs(n.x) + Math.abs(n.y) + Math.abs(n.z));
  const d = Number(params.d) * maxD;
  const { pts, area } = useMemo(() => sectionOf(n, d), [n, d]);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (pts.length < 3) return g;
    const c = pts.reduce((acc, q) => acc.add(q), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const arr: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      arr.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  }, [pts]);
  const planeQuat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n), [n]);
  const side = 2 * S;
  const sideLens = pts.map((q, i) => q.distanceTo(pts[(i + 1) % pts.length]));
  const regular = sideLens.length > 2 && Math.max(...sideLens) - Math.min(...sideLens) < 1e-3;
  return (
    <group>
      <Lights />
      <mesh>
        <boxGeometry args={[side, side, side]} />
        <meshStandardMaterial color={BLUE} transparent opacity={0.1} depthWrite={false} />
        <Edges color={BLUE} />
      </mesh>
      <mesh position={n.clone().multiplyScalar(d)} quaternion={planeQuat}>
        <planeGeometry args={[6, 6]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh geometry={geom}>
        <meshStandardMaterial color={PINK} side={THREE.DoubleSide} emissive={PINK} emissiveIntensity={0.25} />
      </mesh>
      {pts.length >= 3 && <Line points={[...pts, pts[0]]} color="#fff" lineWidth={2.5} />}
      {pts.map((q, i) => (
        <mesh key={i} position={q}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={0.4} />
        </mesh>
      ))}
      <InfoPortal>
        <div style={{ color: PINK, fontWeight: 600 }}>
          przekrój: {pts.length >= 3 ? `${regular ? (pts.length === 3 ? 'trójkąt równoboczny' : pts.length === 4 ? 'kwadrat' : `${NAMES[pts.length]} foremny`) : NAMES[pts.length] ?? `${pts.length}-kąt`}` : 'brak (płaszczyzna mija sześcian)'}
        </div>
        <div>krawędź sześcianu a = 2, pole przekroju ≈ {num(area / (S * S))}</div>
        <div className="muted-line">wierzchołki przekroju leżą na krawędziach sześcianu (zielone)</div>
      </InfoPortal>
    </group>
  );
}

export const solids: Topic = {
  id: 'bryly',
  title: 'Bryły w przestrzeni',
  subject: 'matematyka',
  summary: 'Dlaczego ostrosłup to ⅓ graniastosłupa, jak z obrotu figury powstaje walec, stożek i kula oraz jakie wielokąty kryją się w przekrojach sześcianu.',
  accent: '#ff8a65',
  glyph: '⬡',
  steps: [
    {
      title: 'Graniastosłup i ostrosłup',
      kind: '3d',
      scene: PrismScene,
      camera: [0.5, 4.2, 8.5],
      target: [0, 1.2, 0],
      controls: [
        { type: 'slider', key: 'n', label: 'Liczba boków podstawy', min: 3, max: 10, step: 1, default: 4 },
        { type: 'slider', key: 'r', label: 'Promień podstawy', min: 0.8, max: 1.8, step: 0.05, default: 1.3 },
        { type: 'slider', key: 'h', label: 'Wysokość', min: 1, max: 3.5, step: 0.1, default: 2.6 },
        { type: 'slider', key: 'fill', label: 'Przelane ostrosłupy wody', min: 0, max: 3, step: 1, default: 1 },
      ],
      body: (
        <>
          <div className="formula">V(graniastosłupa) = Pp · h      V(ostrosłupa) = ⅓ · Pp · h</div>
          <p>
            Obie bryły mają <strong>tę samą podstawę i wysokość</strong>. Wyobraź sobie, że ostrosłup to naczynie: ile
            razy trzeba go napełnić wodą i przelać, żeby wypełnić graniastosłup?
          </p>
          <p>
            Przesuń suwak przelewania: dokładnie <strong>trzy razy</strong>. To samo dotyczy walca i stożka – stożek to
            jedna trzecia walca.
          </p>
          <p>Zwiększaj liczbę boków podstawy: graniastosłup zbliża się do walca, a ostrosłup do stożka.</p>
        </>
      ),
    },
    {
      title: 'Bryły obrotowe',
      kind: '3d',
      scene: LatheScene,
      camera: [4.5, 3.5, 6.5],
      target: [0, 1.2, 0],
      controls: [
        {
          type: 'select',
          key: 'shape',
          label: 'Figura',
          default: 'stozek',
          options: [
            { value: 'walec', label: 'prostokąt' },
            { value: 'stozek', label: 'trójkąt' },
            { value: 'kula', label: 'półkole' },
          ],
        },
        { type: 'slider', key: 'r', label: 'Promień r', min: 0.6, max: 2, step: 0.05, default: 1.4 },
        { type: 'slider', key: 'h', label: 'Wysokość h', min: 0.8, max: 3, step: 0.05, default: 2.4 },
        { type: 'toggle', key: 'play', label: 'Animuj obrót', default: true },
        { type: 'slider', key: 'angle', label: 'Kąt obrotu (bez animacji)', min: 0, max: 360, step: 1, default: 240, unit: '°' },
      ],
      body: (
        <>
          <p>
            <strong>Bryła obrotowa</strong> powstaje, gdy figura płaska obraca się wokół prostej – osi obrotu. Niebieska
            figura zostawia za sobą ślad: to powierzchnia bryły.
          </p>
          <ul>
            <li>prostokąt obracany wokół boku → walec,</li>
            <li>trójkąt prostokątny wokół przyprostokątnej → stożek,</li>
            <li>półkole wokół średnicy → kula.</li>
          </ul>
          <p>Przekrój osiowy bryły to po prostu obracana figura odbita względem osi.</p>
        </>
      ),
    },
    {
      title: 'Przekroje sześcianu',
      kind: '3d',
      scene: SectionScene,
      camera: [4.2, 3.2, 5.2],
      controls: [
        {
          type: 'select',
          key: 'dir',
          label: 'Kierunek płaszczyzny',
          default: 'przekatna',
          options: [
            { value: 'pion', label: 'równoległa do ściany' },
            { value: 'ukos', label: 'przez krawędź' },
            { value: 'przekatna', label: 'prostopadła do przekątnej' },
            { value: 'skos', label: 'dowolna' },
          ],
        },
        { type: 'slider', key: 'd', label: 'Przesunięcie płaszczyzny', min: -1, max: 1, step: 0.01, default: 0, decimals: 2 },
      ],
      body: (
        <>
          <p>
            Płaszczyzna przecinająca sześcian daje wielokąt, którego wierzchołki leżą na krawędziach. Sześcian ma 6
            ścian, więc przekrój ma <strong>od 3 do 6 boków</strong>.
          </p>
          <p>
            Ustaw płaszczyznę prostopadłą do przekątnej sześcianu i przesuwaj ją: najpierw trójkąt równoboczny, potem
            sześciokąt, który w samym środku staje się <strong>foremny</strong>, i znowu trójkąt.
          </p>
          <p>Obracaj sześcian palcem lub myszą, żeby zobaczyć przekrój z różnych stron.</p>
        </>
      ),
    },
  ],
};
