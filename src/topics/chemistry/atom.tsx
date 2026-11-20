import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox, InfoPortal } from '../../lib/plot';
import { Lights } from '../../lib/three';
import { C, VIEW, num } from '../../lib/mathkit';

export const ELEMENTS: [string, string, number][] = [
  ['H', 'wodór', 1],
  ['He', 'hel', 4],
  ['Li', 'lit', 7],
  ['Be', 'beryl', 9],
  ['B', 'bor', 11],
  ['C', 'węgiel', 12],
  ['N', 'azot', 14],
  ['O', 'tlen', 16],
  ['F', 'fluor', 19],
  ['Ne', 'neon', 20],
  ['Na', 'sód', 23],
  ['Mg', 'magnez', 24],
  ['Al', 'glin', 27],
  ['Si', 'krzem', 28],
  ['P', 'fosfor', 31],
  ['S', 'siarka', 32],
  ['Cl', 'chlor', 35],
  ['Ar', 'argon', 40],
  ['K', 'potas', 39],
  ['Ca', 'wapń', 40],
];

function shells(e: number) {
  const cap = [2, 8, 8, 2];
  const out: number[] = [];
  let left = e;
  for (const c of cap) {
    if (left <= 0) break;
    out.push(Math.min(c, left));
    left -= c;
  }
  return out;
}

const NR = 0.16; // promień nukleonu

/** Ciasno upakowane jądro: nukleony odpychają się przy styku i są ściągane do środka (kilkaset kroków relaksacji). */
function nucleonPositions(n: number) {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const pts = Array.from({ length: n }, () => new THREE.Vector3(rnd(), rnd(), rnd()).multiplyScalar(0.7));
  const d = new THREE.Vector3();
  for (let it = 0; it < 300; it++) {
    for (const p of pts) p.multiplyScalar(0.985); // ściąganie do środka
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        d.subVectors(pts[i], pts[j]);
        const len = d.length() || 1e-4;
        const overlap = 2 * NR * 0.98 - len;
        if (overlap > 0) {
          d.multiplyScalar((overlap / len) * 0.5);
          pts[i].add(d);
          pts[j].sub(d);
        }
      }
  }
  return pts;
}

/** Rozkład protonów równomiernie w jądrze (co któryś nukleon, licząc od środka). */
function protonMask(pts: THREE.Vector3[], Z: number) {
  const order = pts.map((p, i) => [p.length(), i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const mask = new Array(pts.length).fill(false);
  order.forEach(([, idx], k) => {
    if (Math.floor(((k + 1) * Z) / pts.length) > Math.floor((k * Z) / pts.length)) mask[idx] = true;
  });
  return mask;
}

/* ---------- Krok 1: budowa atomu ---------- */
function AtomScene({ params }: SceneProps) {
  const Z = Number(params.Z);
  const charge = Number(params.q);
  const [sym, name, A] = ELEMENTS[Z - 1];
  const N = A - Z;
  const e = Math.max(0, Z - charge);
  const sh = shells(e);
  const nuc = useMemo(() => {
    const pts = nucleonPositions(A);
    const mask = protonMask(pts, Z);
    return pts.map((p, i) => ({ p, proton: mask[i] }));
  }, [A, Z]);
  const nucR = Math.max(...nuc.map(({ p }) => p.length())) + NR;
  const orbit = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    orbit.current?.children.forEach((ch, k) => {
      ch.rotation.y += dt * (0.9 / (k + 1));
    });
  });
  return (
    <group>
      <Lights />
      {nuc.map(({ p, proton }, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[NR, 24, 24]} />
          <meshStandardMaterial color={proton ? '#f05252' : '#a8b3c4'} roughness={0.35} metalness={0.05} emissive={proton ? '#7f1d1d' : '#1e293b'} emissiveIntensity={0.35} />
        </mesh>
      ))}
      <mesh>
        <sphereGeometry args={[nucR * 1.45, 32, 32]} />
        <meshBasicMaterial color="#ff6b4a" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <group ref={orbit}>
        {sh.map((count, k) => {
          const r = nucR + 0.7 + k * 0.8;
          return (
            <group key={k} rotation={[0.35 + k * 0.25, 0, 0.15 * k]}>
              <Line points={Array.from({ length: 73 }, (_, j) => [r * Math.cos((j / 72) * Math.PI * 2), 0, r * Math.sin((j / 72) * Math.PI * 2)] as [number, number, number])} color="#7dd3fc" transparent opacity={0.22} lineWidth={1} />
              {Array.from({ length: count }, (_, j) => (
                <group key={j} position={[r * Math.cos((j / count) * Math.PI * 2), 0, r * Math.sin((j / count) * Math.PI * 2)]}>
                  <mesh>
                    <sphereGeometry args={[0.085, 20, 20]} />
                    <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={1.2} />
                  </mesh>
                  <mesh>
                    <sphereGeometry args={[0.15, 20, 20]} />
                    <meshBasicMaterial color="#38bdf8" transparent opacity={0.18} depthWrite={false} />
                  </mesh>
                </group>
              ))}
            </group>
          );
        })}
      </group>
      <Html position={[0, -nucR - 0.3, 0]} center zIndexRange={[10, 0]}>
        <div className="atom-symbol">
          {sym}
          {charge !== 0 ? (charge > 0 ? `${charge > 1 ? charge : ''}+` : `${-charge > 1 ? -charge : ''}−`) : ''}
        </div>
      </Html>
      <InfoPortal>
        <div style={{ color: '#ffd166', fontWeight: 600, fontSize: 16 }}>
          {name} ({sym}) – Z = {Z}, A = {A}
        </div>
        <div style={{ color: '#ef4444' }}>protony: {Z} (liczba atomowa)</div>
        <div style={{ color: '#94a3b8' }}>neutrony: A − Z = {N}</div>
        <div style={{ color: '#4fc3ff' }}>
          elektrony: {e} {charge !== 0 ? `(${charge > 0 ? 'kation' : 'anion'}, ładunek ${charge > 0 ? '+' : '−'}${Math.abs(charge)})` : '(atom obojętny)'}
        </div>
        <div>powłoki: {sh.map((c, k) => `${'KLMN'[k]}${c}`).join(' ')}</div>
        <div className="muted-line">elektrony walencyjne: {sh[sh.length - 1] ?? 0} · jądro w rzeczywistości jest ok. 100 000 razy mniejsze od atomu</div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 2: izotopy i masa atomowa ---------- */
const ISOTOPES: Record<string, { name: string; list: [number, number][] }> = {
  H: { name: 'wodór', list: [[1.008, 99.985], [2.014, 0.015]] },
  C: { name: 'węgiel', list: [[12, 98.93], [13.003, 1.07]] },
  Mg: { name: 'magnez', list: [[23.985, 78.99], [24.986, 10], [25.983, 11.01]] },
  Cl: { name: 'chlor', list: [[34.969, 75.78], [36.966, 24.22]] },
  Cu: { name: 'miedź', list: [[62.93, 69.15], [64.928, 30.85]] },
  Br: { name: 'brom', list: [[78.918, 50.69], [80.916, 49.31]] },
};
function IsotopeScene({ params }: SceneProps) {
  const key = String(params.el);
  const I = ISOTOPES[key] ?? ISOTOPES.Cl;
  // suwak przesuwa udział pierwszego izotopu względem naturalnego (pozostałe proporcjonalnie)
  const base = I.list;
  const share0 = Math.max(0, Math.min(100, base[0][1] + Number(params.shift)));
  const restSum = base.slice(1).reduce((s, [, p]) => s + p, 0) || 1;
  const list = base.map(([m, p], i) => [m, i === 0 ? share0 : ((100 - share0) * p) / restSum] as [number, number]);
  const avg = list.reduce((s, [m, p]) => s + (m * p) / 100, 0);
  const lo = Math.floor(Math.min(...list.map((l) => l[0]))) - 1;
  const hi = Math.ceil(Math.max(...list.map((l) => l[0]))) + 1;
  const X0 = 90;
  const W = 720;
  const sx = (m: number) => X0 + ((m - lo) / (hi - lo)) * W;
  const Y = 380;
  return (
    <svg viewBox={VIEW}>
      <rect x={X0 - 10} y={Y} width={W + 20} height="8" rx="4" fill="rgba(255,255,255,0.3)" />
      <path d={`M${sx(avg)},${Y + 10} l-20,40 h40 z`} fill={C.main} />
      {list.map(([m, p], i) => (
        <g key={i}>
          <rect x={sx(m) - 34} y={Y - 6 - p * 2.6} width="68" height={p * 2.6} rx="6" fill={['#4fc3ff', '#ffd166', '#4ade80'][i]} opacity="0.85" />
          <text x={sx(m)} y={Y - 14 - p * 2.6} fill="#fff" fontFamily="Geist" fontSize="15" fontWeight="700" textAnchor="middle">
            {num(p, 1)}%
          </text>
          <text x={sx(m)} y={Y + 74} fill={C.text} fontFamily="Geist" fontSize="14" textAnchor="middle">
            {Math.round(m)}
            {key}
          </text>
        </g>
      ))}
      <text x={sx(avg)} y={Y + 100} fill={C.main} fontFamily="Geist" fontSize="15" fontWeight="700" textAnchor="middle">
        {num(avg, 3)} u
      </text>
      <InfoBox
        lines={[
          { text: `${I.name}: ${list.length} trwałe izotopy` },
          { text: `masa atomowa = Σ (masa izotopu · zawartość)`, color: '#fff' },
          { text: list.map(([m, p]) => `${num(m, 2)}·${num(p / 100, 3)}`).join(' + ') + ` = ${num(avg, 3)} u`, color: C.main },
          { text: 'średnia leży bliżej izotopu, którego jest więcej' },
        ]}
      />
    </svg>
  );
}

export const atom: Topic = {
  id: 'budowa-atomu',
  title: 'Budowa atomu i izotopy',
  subject: 'chemia',
  summary: 'Jądro z protonami i neutronami, powłoki elektronowe pierwszych 20 pierwiastków w 3D, jony oraz masa atomowa jako średnia ważona izotopów.',
  accent: '#3b82f6',
  glyph: '⚛',
  steps: [
    {
      title: 'Protony, neutrony, elektrony',
      kind: '3d',
      scene: AtomScene,
      camera: [0, 3, 8],
      controls: [
        { type: 'slider', key: 'Z', label: 'Liczba atomowa Z', min: 1, max: 20, step: 1, default: 11 },
        { type: 'slider', key: 'q', label: 'Ładunek jonu', min: -3, max: 3, step: 1, default: 0 },
      ],
      body: (
        <>
          <div className="formula">ᴬ_Z E:  Z protonów, A − Z neutronów</div>
          <p>
            <strong>Liczba atomowa Z</strong> to liczba protonów – ona decyduje, jaki to pierwiastek. Liczba masowa A
            to suma protonów i neutronów. W atomie obojętnym elektronów jest tyle co protonów.
          </p>
          <p>
            Elektrony zajmują kolejne powłoki: K mieści 2, L – 8, M w tym zakresie też 8. Elektrony z ostatniej powłoki
            (walencyjne) biorą udział w reakcjach. Zmień ładunek: sód chętnie oddaje jeden elektron (Na⁺), a chlor
            przyjmuje jeden (Cl⁻) – wtedy oba mają pełną powłokę zewnętrzną.
          </p>
        </>
      ),
    },
    {
      title: 'Izotopy i masa atomowa',
      kind: '2d',
      scene: IsotopeScene,
      controls: [
        {
          type: 'select',
          key: 'el',
          label: 'Pierwiastek',
          default: 'Cl',
          options: Object.entries(ISOTOPES).map(([value, v]) => ({ value, label: v.name })),
        },
        { type: 'slider', key: 'shift', label: 'Zmiana udziału najlżejszego izotopu', min: -50, max: 50, step: 0.5, default: 0, unit: '%' },
      ],
      body: (
        <>
          <div className="formula">m_at = m₁·x₁ + m₂·x₂ + …</div>
          <p>
            <strong>Izotopy</strong> to atomy tego samego pierwiastka (ta sama liczba protonów) o różnej liczbie
            neutronów. Chlor to mieszanina ³⁵Cl i ³⁷Cl, dlatego jego masa atomowa to 35,45 u, a nie liczba całkowita.
          </p>
          <p>
            Masa atomowa w układzie okresowym to <strong>średnia ważona</strong> – jak punkt podparcia belki, na której
            stoją izotopy. Suwak pozwala sprawdzić, jak zmieniłaby się masa atomowa przy innym składzie izotopowym niż naturalny.
          </p>
        </>
      ),
    },
  ],
};
