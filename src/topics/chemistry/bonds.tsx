import { useMemo, useReducer, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox, InfoPortal, fmt } from '../../lib/plot';
import { Lights } from '../../lib/three';

const E_COLOR = '#ffd166';
const E_COLOR_2 = '#fb923c';

function Electron({ position, color = E_COLOR, size = 0.09 }: { position: THREE.Vector3 | [number, number, number]; color?: string; size?: number }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
    </mesh>
  );
}

function Nucleus({ symbol, color, r = 0.32, dark = false }: { symbol: string; color: string; r?: number; dark?: boolean }) {
  return (
    <>
      <mesh>
        <sphereGeometry args={[r, 40, 40]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
      <Html center zIndexRange={[10, 0]}>
        <div className={`atom-symbol ${dark ? 'dark' : ''}`}>{symbol}</div>
      </Html>
    </>
  );
}

/** Pochylenia płaszczyzn kolejnych powłok – żeby model był przestrzenny, a nie płaski. */
const TILTS: [number, number][] = [
  [Math.PI / 2, 0],
  [Math.PI / 2.6, 0.6],
  [Math.PI / 3.2, -0.5],
];

/** Atom w modelu powłokowym 3D: pierścienie powłok i krążące elektrony. */
function ShellAtom3D({
  position,
  symbol,
  color,
  shells,
  scale,
  speed,
  hideOuter = 0,
}: {
  position: [number, number, number];
  symbol: string;
  color: string;
  shells: number[];
  scale: number;
  speed: number;
  hideOuter?: number;
}) {
  const t = useRef(0);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const radii = [0.7, 1.25, 1.8];
  useFrame((_, dt) => {
    t.current += dt;
    groups.current.forEach((g, i) => {
      if (g) g.rotation.z = t.current * speed * (1 - i * 0.25);
    });
  });
  return (
    <group position={position}>
      <Nucleus symbol={symbol} color={color} />
      {shells.map((n, si) => {
        const r = radii[si] * scale;
        const [rx, ry] = TILTS[si];
        return (
          <group key={si} rotation={[rx, ry, 0]}>
            <mesh>
              <torusGeometry args={[r, 0.012, 8, 96]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.28} />
            </mesh>
            <group ref={(g) => (groups.current[si] = g)}>
              {Array.from({ length: n }, (_, k) => {
                if (si === shells.length - 1 && k >= n - hideOuter) return null;
                const a = (k / n) * Math.PI * 2;
                return <Electron key={k} position={[Math.cos(a) * r, Math.sin(a) * r, 0]} />;
              })}
            </group>
          </group>
        );
      })}
    </group>
  );
}

/* ======================= Krok 1: wiązanie jonowe ======================= */
function IonicScene({ params }: SceneProps) {
  const auto = Boolean(params.auto ?? true);
  const manual = Number(params.stage ?? 0);
  const clock = useRef(0);
  const flying = useRef<THREE.Mesh>(null);
  const naRef = useRef<THREE.Group>(null);
  const clRef = useRef<THREE.Group>(null);
  const phaseRef = useRef(0);
  const [, force] = useStateTick();

  useFrame((_, dt) => {
    clock.current += dt;
    const phase = auto ? Math.min(2, (clock.current % 9) / 3) : manual;
    const prevIons = phaseRef.current >= 1.2;
    const prevTransfer = phaseRef.current > 0.6;
    phaseRef.current = phase;
    if (prevIons !== phase >= 1.2 || prevTransfer !== phase > 0.6) force();

    const attract = Math.max(0, Math.min(1, (phase - 1.6) / 0.4));
    naRef.current?.position.set(-3 + attract * 0.9, 0, 0);
    clRef.current?.position.set(3 - attract * 0.9, 0, 0);
    const transfer = Math.max(0, Math.min(1, (phase - 0.6) / 0.6));
    if (flying.current) {
      flying.current.visible = transfer > 0 && transfer < 1;
      const x = -3 + 1.8 + (6 - 3.6) * transfer;
      flying.current.position.set(x, Math.sin(transfer * Math.PI) * 1.6, 0);
    }
  });

  const phase = phaseRef.current;
  const ions = phase >= 1.2;
  const transferStarted = phase > 0.6;

  return (
    <>
      <Lights />
      <group ref={naRef} position={[-3, 0, 0]}>
        <ShellAtom3D position={[0, 0, 0]} symbol="Na" color="#a78bfa" shells={ions ? [2, 8] : [2, 8, 1]} scale={ions ? 0.92 : 1} speed={0.9} hideOuter={!ions && transferStarted ? 1 : 0} />
        {ions && (
          <Html position={[0.9, 2.1, 0]} center>
            <div className="ion-charge plus">+</div>
          </Html>
        )}
      </group>
      <group ref={clRef} position={[3, 0, 0]}>
        <ShellAtom3D position={[0, 0, 0]} symbol="Cl" color="#22c55e" shells={ions ? [2, 8, 8] : [2, 8, 7]} scale={ions ? 1.06 : 1} speed={-0.8} />
        {ions && (
          <Html position={[1.2, 2.4, 0]} center>
            <div className="ion-charge minus">−</div>
          </Html>
        )}
      </group>
      <mesh ref={flying} visible={false}>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshStandardMaterial color={E_COLOR} emissive={E_COLOR} emissiveIntensity={2} />
      </mesh>
      <InfoBox
        lines={[
          { text: ions ? 'Na⁺ (2, 8) – jak neon' : 'Na (2, 8, 1)', color: '#a78bfa' },
          { text: ions ? 'Cl⁻ (2, 8, 8) – jak argon' : 'Cl (2, 8, 7)', color: '#22c55e' },
          { text: !transferStarted ? 'atomy obojętne' : !ions ? 'elektron przechodzi z Na do Cl' : 'jony przyciągają się: Na⁺Cl⁻' },
        ]}
      />
    </>
  );
}

/** Wymusza przerysowanie komponentu (używane przy zmianie etapu animacji). */
function useStateTick(): [number, () => void] {
  return useReducer((n: number) => n + 1, 0);
}

/* ======================= Krok 2: wiązanie kowalencyjne ======================= */
const COVALENT: Record<string, { sym: string; valence: number; bonds: number; color: string; lewis: string; label: string; dark?: boolean }> = {
  H2: { sym: 'H', valence: 1, bonds: 1, color: '#e2e8f0', lewis: 'H – H', label: 'H₂', dark: true },
  Cl2: { sym: 'Cl', valence: 7, bonds: 1, color: '#22c55e', lewis: '|Cl – Cl|', label: 'Cl₂' },
  O2: { sym: 'O', valence: 6, bonds: 2, color: '#ef4444', lewis: 'O = O', label: 'O₂' },
  N2: { sym: 'N', valence: 5, bonds: 3, color: '#3d8bff', lewis: '|N ≡ N|', label: 'N₂' },
};

function CovalentScene({ params }: SceneProps) {
  const m = COVALENT[String(params.molecule ?? 'H2')];
  const R = m.sym === 'H' ? 1.05 : 1.35;
  const t = useRef(0);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const bondEls = useRef<(THREE.Mesh | null)[]>([]);
  const loneEls = useRef<(THREE.Mesh | null)[]>([]);
  const overlap = useRef<THREE.Mesh>(null);
  const bondedRef = useRef(false);
  const [, force] = useStateTick();
  const lone = m.valence - m.bonds;

  // kierunki wolnych par (po zewnętrznej stronie atomu)
  const loneDirs = useMemo(() => {
    const pairs = Math.ceil(lone / 2);
    return Array.from({ length: pairs }, (_, p) => {
      const a = (p / Math.max(1, pairs)) * Math.PI * 2;
      return new THREE.Vector3(0.55, Math.cos(a) * 0.85, Math.sin(a) * 0.85).normalize();
    });
  }, [lone]);

  useFrame((_, dt) => {
    t.current += dt;
    const approach = Math.min(1, (t.current % 8) / 2.4);
    const sep = R * 2.7 - approach * R * 1.1;
    left.current?.position.set(-sep / 2, 0, 0);
    right.current?.position.set(sep / 2, 0, 0);
    const bonded = approach > 0.97;
    if (bonded !== bondedRef.current) {
      bondedRef.current = bonded;
      force();
    }
    if (overlap.current) overlap.current.visible = bonded;
    // elektrony wiążące: przed związaniem przy „swoich” atomach, potem krążą wokół osi wiązania
    for (let i = 0; i < m.bonds; i++) {
      for (let side = 0; side < 2; side++) {
        const e = bondEls.current[i * 2 + side];
        if (!e) continue;
        const ang = t.current * 2.2 + (i / m.bonds) * Math.PI * 2 + side * Math.PI;
        const rr = m.bonds === 1 ? 0.18 : 0.42;
        const target = bonded
          ? new THREE.Vector3((side ? 0.1 : -0.1), Math.cos(ang) * rr, Math.sin(ang) * rr)
          : new THREE.Vector3((side ? 1 : -1) * (sep / 2 - R * 0.95), Math.cos(ang * 0.3 + i) * 0.35, Math.sin(ang * 0.3 + i) * 0.35);
        e.position.lerp(target, Math.min(1, dt * 6));
      }
    }
    // wolne pary – lekko „pływają”
    loneEls.current.forEach((e, k) => {
      if (!e) return;
      const atom = k < lone ? -1 : 1;
      const idx = k % lone;
      const pair = Math.floor(idx / 2);
      const d = loneDirs[pair].clone();
      d.x *= atom;
      const center = new THREE.Vector3(atom * (sep / 2), 0, 0).addScaledVector(d, R);
      const wob = t.current * 1.5 + k;
      const perp = new THREE.Vector3(0, 0, 1).cross(d).normalize().multiplyScalar(idx % 2 ? 0.12 : -0.12);
      e.position.copy(center).add(perp).add(new THREE.Vector3(0, Math.sin(wob) * 0.04, Math.cos(wob) * 0.04));
    });
  });

  const atom = (ref: React.RefObject<THREE.Group>) => (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[R, 48, 48]} />
        <meshStandardMaterial color={m.color} transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[R, 32, 32]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.06} />
      </mesh>
      <Nucleus symbol={m.sym} color={m.color} dark={m.dark} r={0.3} />
    </group>
  );

  return (
    <>
      <Lights />
      {atom(left)}
      {atom(right)}
      <mesh ref={overlap} scale={[0.45, 1, 1]} visible={false}>
        <sphereGeometry args={[R * 0.75, 32, 32]} />
        <meshStandardMaterial color={E_COLOR} transparent opacity={0.16} depthWrite={false} emissive={E_COLOR} emissiveIntensity={0.3} />
      </mesh>
      {Array.from({ length: m.bonds * 2 }, (_, i) => (
        <mesh key={`b${m.label}${i}`} ref={(el) => (bondEls.current[i] = el)} position={[i % 2 ? 2 : -2, 0, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color={i % 2 ? E_COLOR_2 : E_COLOR} emissive={i % 2 ? E_COLOR_2 : E_COLOR} emissiveIntensity={1.2} />
        </mesh>
      ))}
      {Array.from({ length: lone * 2 }, (_, i) => (
        <mesh key={`l${m.label}${i}`} ref={(el) => (loneEls.current[i] = el)}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial color={i < lone ? E_COLOR : E_COLOR_2} emissive={i < lone ? E_COLOR : E_COLOR_2} emissiveIntensity={1.1} />
        </mesh>
      ))}
      <InfoBox
        lines={[
          { text: bondedRef.current ? m.lewis : `${m.sym} + ${m.sym}`, color: '#ffffff' },
          { text: bondedRef.current ? `${m.bonds === 1 ? 'jedna wspólna para' : m.bonds === 2 ? 'dwie wspólne pary – wiązanie podwójne' : 'trzy wspólne pary – wiązanie potrójne'}` : 'atomy zbliżają się…', color: E_COLOR },
          { text: `wolne pary na każdym atomie: ${lone / 2}` },
          { text: m.sym === 'H' ? 'każdy atom ma dublet (jak hel)' : 'każdy atom ma oktet' },
        ]}
      />
    </>
  );
}

/* ======================= Krok 3: elektroujemność ======================= */
const EN: Record<string, number> = { H: 2.1, C: 2.5, N: 3.0, O: 3.5, F: 4.0, Cl: 3.0, Na: 0.9, K: 0.8 };
const ATOM_COLORS: Record<string, string> = { H: '#e2e8f0', C: '#475569', O: '#ef4444', F: '#8fe36b', Cl: '#22c55e', Na: '#a78bfa', K: '#c084fc' };
const PAIRS: Record<string, [string, string]> = {
  HH: ['H', 'H'],
  CH: ['C', 'H'],
  HCl: ['H', 'Cl'],
  OH: ['H', 'O'],
  HF: ['H', 'F'],
  NaCl: ['Na', 'Cl'],
  KF: ['K', 'F'],
};

function PolarityScene({ params }: SceneProps) {
  const [a, b] = PAIRS[String(params.pair ?? 'HCl')];
  const d = EN[b] - EN[a];
  const ad = Math.abs(d);
  const kind = ad < 0.4 ? 'kowalencyjne niespolaryzowane' : ad <= 1.7 ? 'kowalencyjne spolaryzowane' : 'jonowe';
  const shift = Math.max(-1, Math.min(1, d / 2.4));
  const cloud = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt;
    const c = cloud.current;
    if (!c) return;
    const tx = shift * 1.5;
    c.position.x += (tx - c.position.x) * Math.min(1, dt * 3);
    const sx = 2.4 - Math.abs(shift) * 0.9;
    const syz = 1.25 - Math.abs(shift) * 0.25 + Math.sin(t.current * 2) * 0.03;
    c.scale.x += (sx - c.scale.x) * Math.min(1, dt * 3);
    c.scale.y = c.scale.z = c.scale.y + (syz - c.scale.y) * Math.min(1, dt * 3);
  });

  const sign = (i: 0 | 1) => {
    if (ad < 0.05) return '';
    const neg = (i === 1) === d > 0;
    if (ad > 1.7) return neg ? '−' : '+';
    return neg ? 'δ−' : 'δ+';
  };

  const meter = (v: number) => `${(Math.min(3.3, v) / 3.3) * 100}%`;

  return (
    <>
      <Lights />
      <mesh ref={cloud} scale={[2.4, 1.2, 1.2]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial color={E_COLOR} transparent opacity={0.22} depthWrite={false} emissive={E_COLOR} emissiveIntensity={0.35} />
      </mesh>
      {[a, b].map((s, i) => (
        <group key={`${s}${i}`} position={[i === 0 ? -1.6 : 1.6, 0, 0]}>
          <Nucleus symbol={s} color={ATOM_COLORS[s]} r={0.5} dark={s === 'H' || s === 'F'} />
          {sign(i as 0 | 1) && (
            <Html position={[0, 1.15, 0]} center>
              <div className={`ion-charge ${sign(i as 0 | 1).includes('+') ? 'plus' : 'minus'}`}>{sign(i as 0 | 1)}</div>
            </Html>
          )}
          <Html position={[0, -1.1, 0]} center>
            <div className="label-3d">EN = {fmt(EN[s], 1)}</div>
          </Html>
        </group>
      ))}
      <InfoPortal>
        <div style={{ fontWeight: 700, color: E_COLOR }}>ΔEN = {fmt(ad, 1)}</div>
        <div className="en-meter">
          <span style={{ width: meter(0.4), background: '#22c55e' }} />
          <span style={{ width: `calc(${meter(1.7)} - ${meter(0.4)})`, background: '#eab308' }} />
          <span style={{ flex: 1, background: '#ef4444' }} />
          <i style={{ left: meter(ad) }} />
        </div>
        <div className="en-scale">
          <span>0</span>
          <span>0,4</span>
          <span>1,7</span>
          <span>3,3</span>
        </div>
        <div>wiązanie {kind}</div>
      </InfoPortal>
    </>
  );
}

export const bonds: Topic = {
  id: 'wiazania-chemiczne',
  title: 'Wiązania chemiczne',
  subject: 'chemia',
  summary: 'W 3D: elektron przeskakuje z sodu do chloru, atomy dzielą się parami elektronów, a chmura elektronowa przesuwa się ku bardziej elektroujemnemu atomowi.',
  accent: '#22c55e',
  glyph: '⚭',
  steps: [
    {
      title: 'Wiązanie jonowe: NaCl',
      kind: '3d',
      scene: IonicScene,
      camera: [0, 3.5, 11],
      controls: [
        { type: 'toggle', key: 'auto', label: 'Animacja w pętli', default: true },
        { type: 'slider', key: 'stage', label: 'Etap (gdy pętla wyłączona)', min: 0, max: 2, step: 0.05, default: 0 },
      ],
      body: (
        <>
          <p>
            Atomy dążą do trwałej konfiguracji gazu szlachetnego – zwykle <strong>oktetu</strong> (8 elektronów na
            zewnętrznej powłoce).
          </p>
          <p>
            Sód ma 1 elektron walencyjny, chlor – 7. Sód <strong>oddaje</strong> elektron, chlor go{' '}
            <strong>przyjmuje</strong>. Powstają jony Na⁺ i Cl⁻, które przyciągają się elektrostatycznie.
          </p>
          <p>
            Obróć model: każda powłoka leży w innej płaszczyźnie. Kation Na⁺ jest mniejszy od atomu (stracił całą powłokę),
            anion Cl⁻ – większy.
          </p>
        </>
      ),
    },
    {
      title: 'Wiązanie kowalencyjne',
      kind: '3d',
      scene: CovalentScene,
      camera: [0, 2.5, 8],
      controls: [
        {
          type: 'select',
          key: 'molecule',
          label: 'Cząsteczka',
          default: 'H2',
          options: Object.entries(COVALENT).map(([value, v]) => ({ value, label: v.label })),
        },
      ],
      body: (
        <>
          <p>
            Gdy dwa atomy mają podobną elektroujemność, żaden nie „odda” elektronu. Zamiast tego <strong>uwspólniają</strong>{' '}
            elektrony – wspólne pary krążą w obszarze, gdzie chmury elektronowe atomów się nakładają.
          </p>
          <p>
            Jedna wspólna para to wiązanie pojedyncze (H–H, Cl–Cl), dwie – podwójne (O=O), trzy – potrójne (N≡N). Żółte i
            pomarańczowe elektrony pochodzą od różnych atomów.
          </p>
          <p>Elektrony niewiążące tworzą wolne pary po zewnętrznych stronach atomów.</p>
        </>
      ),
    },
    {
      title: 'Elektroujemność i polaryzacja',
      kind: '3d',
      scene: PolarityScene,
      camera: [0, 2, 7.5],
      controls: [
        {
          type: 'select',
          key: 'pair',
          label: 'Wiązanie',
          default: 'HCl',
          options: Object.entries(PAIRS).map(([value, [a, b]]) => ({ value, label: `${a}–${b}` })),
        },
      ],
      body: (
        <>
          <p>
            <strong>Elektroujemność</strong> (EN, skala Paulinga) to zdolność atomu do przyciągania elektronów wiązania.
            Najbardziej elektroujemny jest fluor (4,0).
          </p>
          <p>
            Im większa różnica ΔEN, tym bardziej chmura elektronowa przesuwa się ku jednemu atomowi: pojawiają się ładunki
            cząstkowe δ+ i δ−. Przy bardzo dużej różnicy elektron praktycznie przechodzi na drugi atom – wiązanie jonowe.
          </p>
          <p>Granice 0,4 i 1,7 są umowne: np. HF (ΔEN = 1,9) uznajemy za wiązanie kowalencyjne spolaryzowane.</p>
        </>
      ),
    },
  ],
};
