import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { Lights } from '../../lib/three';
import { C, num } from '../../lib/mathkit';

type V3 = [number, number, number];
const EXTENT = 3.6; // bok całego wyświetlanego fragmentu kryształu
const EPS = 1e-6;
const UP = new THREE.Vector3(0, 1, 0);

/** Wolno obracająca się grupa (można też kręcić myszą). */
function Spin({ children, speed = 0.18 }: { children: ReactNode; speed?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * speed;
  });
  return <group ref={g}>{children}</group>;
}

function Ball({ p, r, color, dim = false }: { p: V3; r: number; color: string; dim?: boolean }) {
  return (
    <mesh position={p}>
      <sphereGeometry args={[r, 22, 22]} />
      <meshStandardMaterial color={color} roughness={0.35} transparent={dim} opacity={dim ? 0.18 : 1} emissive={color} emissiveIntensity={dim ? 0 : 0.08} />
    </mesh>
  );
}

function Stick({ a, b, r = 0.045, color = '#cbd5e1', opacity = 1 }: { a: V3; b: V3; r?: number; color?: string; opacity?: number }) {
  const { mid, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    return { mid: va.clone().add(vb).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), len: d.length() };
  }, [a[0], a[1], a[2], b[0], b[1], b[2]]);
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[r, r, len, 10]} />
      <meshStandardMaterial color={color} roughness={0.5} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

/** Krawędzie komórek elementarnych (siatka n × n × n o boku a, wyśrodkowana). */
function CellEdges({ n, a, color = '#ffffff', opacity = 0.35 }: { n: number; a: number; color?: string; opacity?: number }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const o = (n * a) / 2;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        pts.push(i * a - o, j * a - o, -o, i * a - o, j * a - o, o);
        pts.push(i * a - o, -o, j * a - o, i * a - o, o, j * a - o);
        pts.push(-o, i * a - o, j * a - o, o, i * a - o, j * a - o);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [n, a]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}

/** Punkty sieci: węzły bazy powielone w siatce n × n × n (we współrzędnych ułamkowych), z brzegami włącznie. */
function latticePoints(basis: V3[], n: number) {
  const out: V3[] = [];
  const seen = new Set<string>();
  for (let i = -1; i <= n; i++)
    for (let j = -1; j <= n; j++)
      for (let k = -1; k <= n; k++)
        for (const b of basis) {
          const p: V3 = [i + b[0], j + b[1], k + b[2]];
          if (p.some((c) => c < -EPS || c > n + EPS)) continue;
          const key = p.map((c) => c.toFixed(3)).join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(p);
        }
  return out;
}
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* ---------- Krok 1: komórki elementarne metali ---------- */
const CUBIC: Record<string, { name: string; basis: V3[]; nn: number; rFrac: number; z: number; atoms: string; pack: number; ex: string; color: string }> = {
  sc: { name: 'regularna prosta (RP)', basis: [[0, 0, 0]], nn: 1, rFrac: 0.5, z: 6, atoms: '8 · ⅛ = 1', pack: 52, ex: 'polon (Po)', color: '#f59e0b' },
  bcc: { name: 'regularna przestrzennie centrowana (RPC)', basis: [[0, 0, 0], [0.5, 0.5, 0.5]], nn: Math.sqrt(3) / 2, rFrac: Math.sqrt(3) / 4, z: 8, atoms: '8 · ⅛ + 1 = 2', pack: 68, ex: 'żelazo α, sód, potas, chrom', color: '#94a3b8' },
  fcc: { name: 'regularna ściennie centrowana (RSC)', basis: [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]], nn: Math.SQRT2 / 2, rFrac: Math.SQRT2 / 4, z: 12, atoms: '8 · ⅛ + 6 · ½ = 4', pack: 74, ex: 'miedź, glin, złoto, srebro', color: '#f97316' },
};

function MetalScene({ params }: SceneProps) {
  const L = CUBIC[String(params.lat)] ?? CUBIC.fcc;
  const coord = Boolean(params.coord);
  const fill = Boolean(params.fill);
  const n = coord ? 2 : 1;
  const a = EXTENT / n;
  const o = (n * a) / 2;
  const pts = useMemo(() => latticePoints(L.basis, n), [L, n]);
  const center: V3 = [1, 1, 1];
  const isNb = (p: V3) => coord && Math.abs(dist(p, center) - L.nn) < 1e-3;
  const isC = (p: V3) => coord && dist(p, center) < 1e-3;
  const w = (p: V3): V3 => [p[0] * a - o, p[1] * a - o, p[2] * a - o];
  const r = fill ? L.rFrac * a : 0.13 * a;
  const bonds = useMemo(() => {
    if (fill) return [] as [V3, V3][];
    const out: [V3, V3][] = [];
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) if (Math.abs(dist(pts[i], pts[j]) - L.nn) < 1e-3) out.push([pts[i], pts[j]]);
    return out;
  }, [pts, L, fill]);
  return (
    <group>
      <Lights />
      <Spin>
        <CellEdges n={n} a={a} />
        {bonds.map(([p, q], i) => {
          const hl = coord && (isC(p) || isC(q));
          return <Stick key={i} a={w(p)} b={w(q)} r={hl ? 0.05 : 0.025} color={hl ? C.third : '#64748b'} opacity={coord && !hl ? 0.35 : 1} />;
        })}
        {pts.map((p, i) => (
          <Ball key={i} p={w(p)} r={r} color={isC(p) ? C.main : isNb(p) ? C.third : L.color} dim={coord && !isC(p) && !isNb(p)} />
        ))}
      </Spin>
      <InfoPortal>
        <div style={{ color: L.color, fontWeight: 600, fontSize: 16 }}>sieć {L.name}</div>
        <div>atomów w komórce: {L.atoms}</div>
        <div style={{ color: C.third }}>liczba koordynacyjna: {L.z} najbliższych sąsiadów</div>
        <div>wypełnienie przestrzeni: {L.pack}%</div>
        <div>stykające się atomy: r = {L.rFrac === 0.5 ? 'a / 2' : L.rFrac === Math.SQRT2 / 4 ? 'a·√2 / 4' : 'a·√3 / 4'}</div>
        <div className="muted-line">przykłady: {L.ex}</div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 2: kryształy jonowe ---------- */
const IONIC: Record<string, { name: string; cat: string; an: string; rc: number; ra: number; z: string; units: string; ex: string }> = {
  nacl: { name: 'chlorek sodu NaCl', cat: 'Na⁺', an: 'Cl⁻', rc: 0.102, ra: 0.181, z: '6 : 6 (oktaedr)', units: '4 Na⁺ + 4 Cl⁻ = 4 NaCl', ex: 'tak samo: KCl, MgO, LiF' },
  cscl: { name: 'chlorek cezu CsCl', cat: 'Cs⁺', an: 'Cl⁻', rc: 0.167, ra: 0.181, z: '8 : 8 (sześcian)', units: '1 Cs⁺ + 1 Cl⁻ = 1 CsCl', ex: 'duży kation mieści 8 anionów' },
};
const CAT = '#a78bfa';
const AN = '#4ade80';

function IonicScene({ params }: SceneProps) {
  const key = String(params.ion);
  const S = IONIC[key] ?? IONIC.nacl;
  const n = Number(params.n);
  const coord = Boolean(params.coord);
  const fill = Boolean(params.fill);
  const a = EXTENT / n;
  const o = (n * a) / 2;
  const ions = useMemo(() => {
    const out: { p: V3; cat: boolean }[] = [];
    if (key === 'nacl') {
      for (let i = 0; i <= 2 * n; i++)
        for (let j = 0; j <= 2 * n; j++) for (let k = 0; k <= 2 * n; k++) out.push({ p: [i / 2, j / 2, k / 2], cat: (i + j + k) % 2 === 0 });
    } else {
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) out.push({ p: [i, j, k], cat: true });
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) out.push({ p: [i + 0.5, j + 0.5, k + 0.5], cat: false });
    }
    return out;
  }, [key, n]);
  // promienie w skali: kationy i aniony stykają się wzdłuż krawędzi (NaCl) albo przekątnej sześcianu (CsCl)
  const touch = key === 'nacl' ? a / 2 : (Math.sqrt(3) * a) / 2;
  const k = (touch / (S.rc + S.ra)) * (fill ? 1 : 0.42);
  const nnDist = key === 'nacl' ? 0.5 : Math.sqrt(3) / 2;
  // jon centralny: najbliższy środkowi fragmentu
  const mid: V3 = [n / 2, n / 2, n / 2];
  let cIdx = 0;
  ions.forEach((q, i) => {
    if (dist(q.p, mid) < dist(ions[cIdx].p, mid) - EPS) cIdx = i;
  });
  const cp = ions[cIdx].p;
  const w = (p: V3): V3 => [p[0] * a - o, p[1] * a - o, p[2] * a - o];
  const nbs = ions.filter((q) => Math.abs(dist(q.p, cp) - nnDist) < 1e-3);
  return (
    <group>
      <Lights />
      <Spin>
        <CellEdges n={n} a={a} opacity={0.22} />
        {coord && nbs.map((q, i) => <Stick key={i} a={w(cp)} b={w(q.p)} r={0.035} color={C.third} />)}
        {ions.map((q, i) => {
          const hl = !coord || i === cIdx || nbs.includes(q);
          return <Ball key={i} p={w(q.p)} r={(q.cat ? S.rc : S.ra) * k} color={i === cIdx && coord ? C.main : q.cat ? CAT : AN} dim={!hl} />;
        })}
      </Spin>
      <InfoPortal>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{S.name}</div>
        <div>
          <span style={{ color: CAT }}>● {S.cat}</span> r = {num(S.rc * 1000, 0)} pm · <span style={{ color: AN }}>● {S.an}</span> r = {num(S.ra * 1000, 0)} pm
        </div>
        <div style={{ color: C.third }}>liczba koordynacyjna {S.z}</div>
        <div>w jednej komórce: {S.units}</div>
        <div>stosunek promieni r₊/r₋ = {num(S.rc / S.ra, 2)}</div>
        <div className="muted-line">{S.ex}. W krysztale jonowym nie ma pojedynczych cząsteczek – wzór podaje tylko stosunek jonów.</div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 3: kryształy kowalencyjne – diament i grafit ---------- */
function diamond() {
  const fcc: V3[] = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
  const basis: V3[] = [...fcc, ...fcc.map((p) => [p[0] + 0.25, p[1] + 0.25, p[2] + 0.25] as V3)];
  const n = 1;
  const pts = latticePoints(basis, n);
  const a = EXTENT;
  const o = a / 2;
  const atoms = pts.map((p) => [p[0] * a - o, p[1] * a - o, p[2] * a - o] as V3);
  const bl = (Math.sqrt(3) / 4) * a;
  const bonds: [V3, V3][] = [];
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) if (Math.abs(dist(atoms[i], atoms[j]) - bl) < 1e-3) bonds.push([atoms[i], atoms[j]]);
  return { atoms, bonds, layers: [] as number[], cell: true };
}

function graphite() {
  const b = 0.62; // długość wiązania C–C (1,42 Å)
  const gap = (b * 3.35) / 1.42; // odstęp warstw (3,35 Å)
  const a1 = [1.5 * b, (Math.sqrt(3) / 2) * b];
  const a2 = [1.5 * b, -(Math.sqrt(3) / 2) * b];
  const atoms: V3[] = [];
  const bonds: [V3, V3][] = [];
  const layers: number[] = [];
  for (let L = 0; L < 3; L++) {
    const y = (L - 1) * gap;
    layers.push(y);
    const shift = L % 2 === 1 ? b : 0; // ułożenie ABAB
    const layer: V3[] = [];
    for (let i = -6; i <= 6; i++)
      for (let j = -6; j <= 6; j++)
        for (const bx of [0, b]) {
          const x = i * a1[0] + j * a2[0] + bx + shift - b / 2;
          const z = i * a1[1] + j * a2[1];
          if (Math.hypot(x, z) <= 2.05) layer.push([x, y, z]);
        }
    for (let i = 0; i < layer.length; i++) for (let j = i + 1; j < layer.length; j++) if (Math.abs(dist(layer[i], layer[j]) - b) < 1e-3) bonds.push([layer[i], layer[j]]);
    atoms.push(...layer);
  }
  return { atoms, bonds, layers, cell: false };
}

const COVALENT: Record<string, { name: string; rows: [string, string][]; hyb: string; color: string }> = {
  diamond: {
    name: 'diament',
    hyb: 'każdy C tworzy 4 wiązania (tetraedr, kąt 109,5°)',
    color: '#7dd3fc',
    rows: [
      ['twardość', '10 w skali Mohsa – najtwardszy minerał'],
      ['przewodnictwo', 'izolator – wszystkie elektrony w wiązaniach'],
      ['temp. sublimacji', 'ok. 3600 °C'],
      ['gęstość', '3,51 g/cm³'],
    ],
  },
  graphite: {
    name: 'grafit',
    hyb: 'każdy C tworzy 3 wiązania w płaskiej warstwie (kąt 120°)',
    color: '#94a3b8',
    rows: [
      ['twardość', '1–2 – warstwy łatwo się przesuwają (ołówek)'],
      ['przewodnictwo', 'przewodzi prąd wzdłuż warstw – czwarty elektron jest zdelokalizowany'],
      ['temp. sublimacji', 'ok. 3650 °C'],
      ['gęstość', '2,26 g/cm³ – warstwy są daleko od siebie'],
    ],
  },
};

function CovalentScene({ params }: SceneProps) {
  const key = String(params.c);
  const S = COVALENT[key] ?? COVALENT.diamond;
  const model = useMemo(() => (key === 'graphite' ? graphite() : diamond()), [key]);
  return (
    <group>
      <Lights />
      <Spin speed={0.15}>
        {model.cell && <CellEdges n={1} a={EXTENT} opacity={0.25} />}
        {model.layers.map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[2.25, 48]} />
            <meshBasicMaterial color={S.color} transparent opacity={0.06} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {model.layers.length > 1 &&
          model.layers.slice(1).map((y, i) => (
            <Stick key={`v${i}`} a={[2.35, model.layers[i], 0]} b={[2.35, y, 0]} r={0.015} color={C.third} opacity={0.8} />
          ))}
        {model.bonds.map(([p, q], i) => (
          <Stick key={i} a={p} b={q} r={0.05} color="#cbd5e1" />
        ))}
        {model.atoms.map((p, i) => (
          <Ball key={i} p={p} r={0.15} color={S.color} />
        ))}
      </Spin>
      <InfoPortal>
        <div style={{ color: S.color, fontWeight: 600, fontSize: 16 }}>{S.name} – czysty węgiel</div>
        <div style={{ color: C.third }}>{S.hyb}</div>
        {S.rows.map(([k, v]) => (
          <div key={k}>
            <strong>{k}:</strong> {v}
          </div>
        ))}
        {key === 'graphite' && <div className="muted-line">żółta kreska: odstęp warstw 335 pm, ponad 2 razy więcej niż wiązanie C–C (142 pm)</div>}
      </InfoPortal>
    </group>
  );
}

export const crystals: Topic = {
  id: 'sieci-krystaliczne',
  title: 'Sieci krystaliczne w 3D',
  subject: 'chemia',
  summary: 'Komórki elementarne metali (RP, RPC, RSC) z liczbą koordynacyjną, kryształy jonowe NaCl i CsCl oraz diament i grafit – ten sam węgiel, inna sieć.',
  accent: '#a78bfa',
  glyph: '◈',
  steps: [
    {
      title: 'Komórki elementarne metali',
      kind: '3d',
      scene: MetalScene,
      camera: [5.5, 4, 7.5],
      controls: [
        {
          type: 'select',
          key: 'lat',
          label: 'Sieć',
          default: 'fcc',
          options: [
            { value: 'sc', label: 'regularna prosta' },
            { value: 'bcc', label: 'przestrzennie centrowana' },
            { value: 'fcc', label: 'ściennie centrowana' },
          ],
        },
        { type: 'toggle', key: 'fill', label: 'Model czaszowy (atomy się stykają)', default: false },
        { type: 'toggle', key: 'coord', label: 'Pokaż najbliższych sąsiadów', default: false },
      ],
      body: (
        <>
          <p>
            Kryształ to powtarzający się w trzech wymiarach wzór. Najmniejszy fragment, który go opisuje, to{' '}
            <strong>komórka elementarna</strong>. Atom w narożniku należy do 8 komórek naraz, a atom na ścianie do 2 –
            dlatego liczymy je jako ⅛ i ½.
          </p>
          <p>
            Włącz sąsiadów: w sieci ściennie centrowanej każdy atom dotyka aż 12 innych i wypełnia 74% przestrzeni –
            ciaśniej się nie da. Takie metale (miedź, złoto) są zwykle bardzo plastyczne, bo warstwy atomów łatwo się
            po sobie przesuwają.
          </p>
        </>
      ),
    },
    {
      title: 'Kryształy jonowe',
      kind: '3d',
      scene: IonicScene,
      camera: [5.5, 4, 7.5],
      controls: [
        {
          type: 'select',
          key: 'ion',
          label: 'Związek',
          default: 'nacl',
          options: Object.entries(IONIC).map(([value, s]) => ({ value, label: s.name })),
        },
        { type: 'slider', key: 'n', label: 'Liczba komórek na krawędzi', min: 1, max: 3, step: 1, default: 1 },
        { type: 'toggle', key: 'fill', label: 'Model czaszowy (jony się stykają)', default: true },
        { type: 'toggle', key: 'coord', label: 'Pokaż otoczenie jednego jonu', default: false },
      ],
      body: (
        <>
          <p>
            W krysztale jonowym kationy i aniony przyciągają się elektrostatycznie i ustawiają na przemian. Ile
            przeciwnych jonów zmieści się wokół jednego, zależy od <strong>stosunku ich promieni</strong>.
          </p>
          <p>
            Mały Na⁺ otaczają tylko 6 jonów Cl⁻, a duży Cs⁺ – aż 8. Silne przyciąganie we wszystkich kierunkach daje
            wysoką temperaturę topnienia (NaCl: 801 °C) i kruchość: przesunięcie warstwy ustawia obok siebie jony tego
            samego znaku, które się odpychają.
          </p>
        </>
      ),
    },
    {
      title: 'Diament i grafit',
      kind: '3d',
      scene: CovalentScene,
      camera: [5, 4, 7],
      controls: [
        {
          type: 'select',
          key: 'c',
          label: 'Odmiana węgla',
          default: 'diamond',
          options: [
            { value: 'diamond', label: 'diament' },
            { value: 'graphite', label: 'grafit' },
          ],
        },
      ],
      body: (
        <>
          <p>
            Diament i grafit to <strong>odmiany alotropowe</strong> węgla: te same atomy, inna sieć. W diamencie każdy
            atom jest połączony wiązaniami kowalencyjnymi z czterema sąsiadami w całym krysztale – to jedna gigantyczna
            cząsteczka.
          </p>
          <p>
            W graficie atomy tworzą płaskie warstwy z sześciokątów, a warstwy trzymają się tylko słabymi siłami van der
            Waalsa. Stąd miękkość grafitu i jego przewodnictwo: czwarty elektron każdego atomu może poruszać się wzdłuż
            warstwy.
          </p>
        </>
      ),
    },
  ],
};
