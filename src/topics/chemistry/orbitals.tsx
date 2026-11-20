import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import type { Control, SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';

/* ---------- Funkcje falowe atomu wodoru (bez normalizacji, a₀ = 1) ---------- */
type Psi = (x: number, y: number, z: number, r: number) => number;

interface Orbital {
  label: string;
  psi: Psi;
  /** Promień obszaru próbkowania (w a₀). */
  R: number;
}

const ORBITALS: Record<string, Orbital> = {
  '1s': { label: '1s', R: 6, psi: (_x, _y, _z, r) => Math.exp(-r) },
  '2s': { label: '2s', R: 16, psi: (_x, _y, _z, r) => (2 - r) * Math.exp(-r / 2) },
  '3s': { label: '3s', R: 28, psi: (_x, _y, _z, r) => (27 - 18 * r + 2 * r * r) * Math.exp(-r / 3) },
  '2px': { label: '2pₓ', R: 15, psi: (x, _y, _z, r) => x * Math.exp(-r / 2) },
  '2py': { label: '2p_y', R: 15, psi: (_x, y, _z, r) => y * Math.exp(-r / 2) },
  '2pz': { label: '2p_z', R: 15, psi: (_x, _y, z, r) => z * Math.exp(-r / 2) },
  '3pz': { label: '3p_z', R: 26, psi: (_x, _y, z, r) => (6 - r) * z * Math.exp(-r / 3) },
  '3dz2': { label: '3d_z²', R: 26, psi: (_x, _y, z, r) => (3 * z * z - r * r) * Math.exp(-r / 3) },
  '3dxy': { label: '3d_xy', R: 24, psi: (x, y, _z, r) => x * y * Math.exp(-r / 3) },
  '3dxz': { label: '3d_xz', R: 24, psi: (x, _y, z, r) => x * z * Math.exp(-r / 3) },
  '3dx2y2': { label: '3d_x²−y²', R: 24, psi: (x, y, _z, r) => (x * x - y * y) * Math.exp(-r / 3) },
};

const POS = new THREE.Color('#4f9dff');
const NEG = new THREE.Color('#ff9b42');
const SCENE_RADIUS = 3.2;

/** Losowanie punktów z gęstością |ψ|² (metoda odrzucania). Osie sceny: y w górę = oś z orbitalu. */
function sampleOrbital(o: Orbital, count: number, slice: boolean) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  // oszacowanie maksimum gęstości
  let max = 0;
  for (let i = 0; i < 40000; i++) {
    const x = (Math.random() * 2 - 1) * o.R;
    const y = (Math.random() * 2 - 1) * o.R;
    const z = (Math.random() * 2 - 1) * o.R;
    const v = o.psi(x, y, z, Math.hypot(x, y, z)) ** 2;
    if (v > max) max = v;
  }
  max *= 1.05;
  const s = SCENE_RADIUS / o.R;
  const slab = o.R * 0.06;
  let n = 0;
  let guard = 0;
  while (n < count && guard < 6e6) {
    guard++;
    const x = (Math.random() * 2 - 1) * o.R;
    const y = slice ? (Math.random() * 2 - 1) * slab : (Math.random() * 2 - 1) * o.R;
    const z = (Math.random() * 2 - 1) * o.R;
    const r = Math.hypot(x, y, z);
    if (r > o.R) continue;
    const psi = o.psi(x, y, z, r);
    if (Math.random() * max > psi * psi) continue;
    // orbital: (x, y, z) → scena: (x, z, y), żeby oś z była pionowa
    positions.set([x * s, z * s, -y * s], n * 3);
    const c = psi >= 0 ? POS : NEG;
    colors.set([c.r, c.g, c.b], n * 3);
    n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors.subarray(0, n * 3), 3));
  return g;
}

function AxisLabels() {
  const L = SCENE_RADIUS + 0.5;
  return (
    <>
      <axesHelper args={[SCENE_RADIUS + 0.3]} />
      <Html position={[L, 0, 0]} center>
        <div className="label-3d">x</div>
      </Html>
      <Html position={[0, L, 0]} center>
        <div className="label-3d">z</div>
      </Html>
      <Html position={[0, 0, -L]} center>
        <div className="label-3d">y</div>
      </Html>
    </>
  );
}

function OrbitalCloud({ id, slice, density, size = 0.035 }: { id: string; slice: boolean; density: number; size?: number }) {
  const o = ORBITALS[id] ?? ORBITALS['1s'];
  const geometry = useMemo(() => sampleOrbital(o, Math.round(density * (slice ? 0.5 : 1)), slice), [o, slice, density]);
  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={slice ? size * 1.4 : size}
        vertexColors
        transparent
        opacity={0.75}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function OrbitalScene({ params }: SceneProps) {
  const orbital = String(params.orbital ?? '1s');
  const slice = Boolean(params.slice);
  const spin = Boolean(params.spin ?? true);
  const bohr = Boolean(params.bohr);
  const density = Number(params.density ?? 30000);
  const all3p = orbital === '2p-all';
  const group = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (spin && group.current) group.current.rotation.y += dt * 0.25;
  });

  const label = all3p ? '2pₓ + 2p_y + 2p_z' : ORBITALS[orbital]?.label;

  return (
    <>
      <ambientLight intensity={0.6} />
      <group ref={group}>
        <AxisLabels />
        {all3p ? (
          ['2px', '2py', '2pz'].map((id) => <OrbitalCloud key={id} id={id} slice={slice} density={density * 0.6} />)
        ) : (
          <OrbitalCloud id={orbital} slice={slice} density={density} />
        )}
        <mesh>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color="#ff4d6d" />
        </mesh>
        {bohr && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            {/* orbita Bohra o promieniu a₀ w skali sceny */}
            <torusGeometry args={[SCENE_RADIUS / ORBITALS['1s'].R, 0.012, 8, 96]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        )}
      </group>
      <InfoPortal>
        <div style={{ fontWeight: 700 }}>orbital {label}</div>
        <div>
          <span style={{ color: '#4f9dff' }}>● ψ &gt; 0</span> · <span style={{ color: '#ff9b42' }}>● ψ &lt; 0</span>
        </div>
        <div className="muted-line">gęstość punktów ∝ |ψ|²</div>
      </InfoPortal>
    </>
  );
}

/* ---------- Konfiguracja elektronowa (scena „page”) ---------- */
const SYMBOLS =
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr'.split(' ');
const NAMES =
  'wodór hel lit beryl bor węgiel azot tlen fluor neon sód magnez glin krzem fosfor siarka chlor argon potas wapń skand tytan wanad chrom mangan żelazo kobalt nikiel miedź cynk gal german arsen selen brom krypton'.split(' ');
const SUBSHELLS: { name: string; boxes: number; energy: number }[] = [
  { name: '1s', boxes: 1, energy: 1 },
  { name: '2s', boxes: 1, energy: 2 },
  { name: '2p', boxes: 3, energy: 3 },
  { name: '3s', boxes: 1, energy: 4 },
  { name: '3p', boxes: 3, energy: 5 },
  { name: '4s', boxes: 1, energy: 6 },
  { name: '3d', boxes: 5, energy: 7 },
  { name: '4p', boxes: 3, energy: 8 },
];

function configuration(Z: number): number[] {
  const fill = SUBSHELLS.map(() => 0);
  let left = Z;
  SUBSHELLS.forEach((s, i) => {
    const take = Math.min(left, s.boxes * 2);
    fill[i] = take;
    left -= take;
  });
  // wyjątki: Cr (24) i Cu (29) – promocja elektronu 4s → 3d
  if (Z === 24 || Z === 29) {
    fill[5] = 1;
    fill[6] += 1;
  }
  return fill;
}

/** Rozkład elektronów w klatkach zgodnie z regułą Hunda. */
function boxesFor(electrons: number, boxes: number): ('up' | 'down')[][] {
  const out: ('up' | 'down')[][] = Array.from({ length: boxes }, () => []);
  for (let e = 0; e < electrons; e++) {
    if (e < boxes) out[e].push('up');
    else out[e - boxes].push('down');
  }
  return out;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).split('').map((d) => SUP[Number(d)]).join('');

function ConfigScene({ params }: SceneProps) {
  const Z = Math.round(Number(params.z ?? 8));
  const fill = configuration(Z);
  const text = SUBSHELLS.map((s, i) => (fill[i] > 0 ? `${s.name}${sup(fill[i])}` : ''))
    .filter(Boolean)
    .join(' ');
  const exception = Z === 24 || Z === 29;

  return (
    <div className="config">
      <div className="config-head">
        <motion.div key={Z} className="element-tile" initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.35 }}>
          <span className="z">{Z}</span>
          <span className="sym">{SYMBOLS[Z - 1]}</span>
          <span className="nm">{NAMES[Z - 1]}</span>
        </motion.div>
        <div>
          <div className="config-text">{text}</div>
          {exception && <div className="config-note">Wyjątek! Półzapełniona lub pełna podpowłoka 3d jest trwalsza – jeden elektron przechodzi z 4s na 3d.</div>}
        </div>
      </div>
      <div className="energy">
        <div className="energy-axis">energia ↑</div>
        <div className="levels">
          {SUBSHELLS.map((s, i) => {
            const cells = boxesFor(fill[i], s.boxes);
            return (
              <div key={s.name} className="level" style={{ order: -s.energy }}>
                <span className="level-name">{s.name}</span>
                <div className="cells">
                  {cells.map((c, j) => (
                    <div key={j} className="cell">
                      <AnimatePresence>
                        {c.map((spin) => (
                          <motion.span
                            key={spin}
                            className={`spin ${spin}`}
                            initial={{ y: spin === 'up' ? -30 : 30, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                          >
                            {spin === 'up' ? '↑' : '↓'}
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const sceneControls: Control[] = [
  { type: 'toggle' as const, key: 'slice', label: 'Przekrój (cienka warstwa)', default: false },
  { type: 'toggle' as const, key: 'spin', label: 'Obracaj', default: true },
  { type: 'slider' as const, key: 'density', label: 'Liczba punktów', min: 5000, max: 60000, step: 5000, default: 30000 },
];

export const orbitals: Topic = {
  id: 'orbitale-atomowe',
  title: 'Orbitale atomowe i konfiguracja elektronowa',
  subject: 'chemia',
  summary: 'Chmury prawdopodobieństwa s, p i d w 3D, węzły, fazy funkcji falowej i zapełnianie podpowłok.',
  accent: '#4f9dff',
  glyph: '◎',
  steps: [
    {
      title: 'Od orbity do chmury elektronowej',
      kind: '3d',
      scene: OrbitalScene,
      camera: [5, 3, 6],
      preset: { orbital: '1s' },
      controls: [{ type: 'toggle', key: 'bohr', label: 'Pokaż orbitę Bohra (r = a₀)', default: true }, ...sceneControls],
      body: (
        <>
          <p>
            W modelu Bohra elektron krąży po okręgu. Mechanika kwantowa mówi coś innego: nie da się wskazać toru
            elektronu, można tylko podać <strong>prawdopodobieństwo</strong> znalezienia go w danym miejscu.
          </p>
          <p>
            Każdy punkt na rysunku to jeden „pomiar” położenia elektronu w stanie 1s. Gęstość punktów jest proporcjonalna
            do <strong>|ψ|²</strong> – kwadratu funkcji falowej.
          </p>
          <p>
            <strong>Orbital</strong> to obszar, w którym prawdopodobieństwo napotkania elektronu jest duże (zwykle
            ~90%). Najbardziej prawdopodobna odległość od jądra to właśnie promień Bohra a₀.
          </p>
        </>
      ),
    },
    {
      title: 'Orbitale s i powierzchnie węzłowe',
      kind: '3d',
      scene: OrbitalScene,
      camera: [5, 3, 6],
      controls: [
        {
          type: 'select',
          key: 'orbital',
          label: 'Orbital',
          default: '2s',
          options: [
            { value: '1s', label: '1s' },
            { value: '2s', label: '2s' },
            { value: '3s', label: '3s' },
          ],
        },
        { type: 'toggle', key: 'slice', label: 'Przekrój (cienka warstwa)', default: true },
        sceneControls[1],
        sceneControls[2],
      ],
      body: (
        <>
          <p>
            Orbitale <strong>s</strong> są kuliście symetryczne. Wyższe orbitale s (2s, 3s) zawierają wewnątrz{' '}
            <strong>sfery węzłowe</strong> – powierzchnie, na których ψ = 0 i elektronu nie ma nigdy.
          </p>
          <p>
            Na przekroju widać je jako ciemne pierścienie. Kolor oznacza znak funkcji falowej (fazę): po przejściu przez
            węzeł znak się zmienia.
          </p>
          <div className="formula">liczba węzłów radialnych = n − l − 1</div>
          <p>Dla 2s to 1 węzeł, dla 3s – 2 węzły.</p>
        </>
      ),
    },
    {
      title: 'Orbitale p – trzy kierunki',
      kind: '3d',
      scene: OrbitalScene,
      camera: [5, 3, 6],
      controls: [
        {
          type: 'select',
          key: 'orbital',
          label: 'Orbital',
          default: '2pz',
          options: [
            { value: '2px', label: '2pₓ' },
            { value: '2py', label: '2p_y' },
            { value: '2pz', label: '2p_z' },
            { value: '2p-all', label: 'wszystkie 2p' },
            { value: '3pz', label: '3p_z' },
          ],
        },
        ...sceneControls,
      ],
      body: (
        <>
          <p>
            Dla l = 1 istnieją trzy orbitale <strong>p</strong>, ułożone wzdłuż osi x, y i z. Każdy ma kształt
            „hantli” złożonej z dwóch płatów o <strong>przeciwnych znakach</strong> funkcji falowej.
          </p>
          <p>
            Między płatami leży <strong>płaszczyzna węzłowa</strong> przechodząca przez jądro. Razem trzy orbitale p
            tworzą rozkład kulisto symetryczny – sprawdź opcję „wszystkie 2p”.
          </p>
          <p>Faza ma znaczenie: wiązanie powstaje, gdy nakładają się płaty o tym samym znaku.</p>
        </>
      ),
    },
    {
      title: 'Orbitale d',
      kind: '3d',
      scene: OrbitalScene,
      camera: [5, 3, 6],
      controls: [
        {
          type: 'select',
          key: 'orbital',
          label: 'Orbital',
          default: '3dxy',
          options: [
            { value: '3dz2', label: 'd_z²' },
            { value: '3dxy', label: 'd_xy' },
            { value: '3dxz', label: 'd_xz' },
            { value: '3dx2y2', label: 'd_x²−y²' },
          ],
        },
        ...sceneControls,
      ],
      body: (
        <>
          <p>
            Dla l = 2 mamy pięć orbitali <strong>d</strong>. Cztery z nich mają kształt „czterolistnej koniczyny” z
            dwiema płaszczyznami węzłowymi. Piąty, d_z², to hantla z pierścieniem wokół.
          </p>
          <p>
            Orbitale d zapełniają się w metalach przejściowych (Sc–Zn). Ich kształt i ułożenie wyjaśniają barwy
            związków kompleksowych i właściwości magnetyczne.
          </p>
        </>
      ),
    },
    {
      title: 'Zapełnianie podpowłok',
      kind: 'page',
      scene: ConfigScene,
      controls: [{ type: 'slider', key: 'z', label: 'Liczba atomowa Z', min: 1, max: 36, step: 1, default: 8 }],
      body: (
        <>
          <p>Elektrony zajmują orbitale według trzech zasad:</p>
          <p>
            <strong>Reguła rozbudowy</strong> – najpierw podpowłoki o niższej energii (uwaga: 4s przed 3d!).
          </p>
          <p>
            <strong>Zakaz Pauliego</strong> – w jednej klatce najwyżej dwa elektrony o przeciwnych spinach.
          </p>
          <p>
            <strong>Reguła Hunda</strong> – w podpowłoce elektrony najpierw obsadzają klatki pojedynczo, z tym samym
            spinem.
          </p>
          <p>Przesuwaj Z od 1 do 36. Zatrzymaj się na Cr (24) i Cu (29) – to słynne wyjątki.</p>
        </>
      ),
    },
  ],
};
