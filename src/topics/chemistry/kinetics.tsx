import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal, Sparkline, fmt } from '../../lib/plot';
import { useTicker } from '../../lib/useCanvasLoop';
import { Lights } from '../../lib/three';

/** Rodzaj cząsteczki: 0 = A, 1 = B, 2 = C, 3 = D (produkty) */
interface P {
  p: THREE.Vector3;
  v: THREE.Vector3;
  s: number;
  flash: number;
}

const COLORS = ['#4fc3ff', '#fb923c', '#4ade80', '#a78bfa'].map((c) => new THREE.Color(c));
const WHITE = new THREE.Color('#ffffff');
const R = 0.13;
const BOX = new THREE.Vector3(6, 3.6, 3.6);

const rms = (T: number) => 1.25 * Math.sqrt(T / 300);
/** próg energii zderzenia dla energii aktywacji Ea [kJ/mol] (jednostki symulacji) */
const threshold = (Ea: number) => Ea * 0.0105;

function gauss() {
  return Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random());
}

function spawn(n: number, T: number, species: (i: number) => number): P[] {
  const v = rms(T) / Math.sqrt(3);
  return Array.from({ length: n }, (_, i) => ({
    p: new THREE.Vector3((Math.random() - 0.5) * (BOX.x - 2 * R), (Math.random() - 0.5) * (BOX.y - 2 * R), (Math.random() - 0.5) * (BOX.z - 2 * R)),
    v: new THREE.Vector3(gauss() * v, gauss() * v, gauss() * v),
    s: species(i),
    flash: 0,
  }));
}

/** Mini-histogram w ramce informacyjnej. */
function Bars({ counts }: { counts: number[] }) {
  const mx = Math.max(...counts, 6);
  return (
    <svg viewBox={`0 0 ${counts.length * 10} 60`} preserveAspectRatio="none" className="mini-bars">
      {counts.map((c, i) => (
        <rect key={i} x={i * 10 + 1} width={8} y={60 - (c / mx) * 58} height={(c / mx) * 58} fill={`hsl(${220 - (i / counts.length) * 220}, 80%, 60%)`} />
      ))}
    </svg>
  );
}

/** Profil energetyczny reakcji (SVG). */
function EnergyProfile({ Ea, catalyst }: { Ea: number; catalyst: boolean }) {
  const path = (e: number) => {
    let d = '';
    for (let i = 0; i <= 50; i++) {
      const u = i / 50;
      const base = 46 + (54 - 46) * (1 / (1 + Math.exp(-(u - 0.5) * 14)));
      const y = base - Math.exp(-((u - 0.5) ** 2) / 0.018) * e * 0.38;
      d += `${i ? 'L' : 'M'}${u * 240},${y}`;
    }
    return d;
  };
  return (
    <svg viewBox="0 0 240 62" className="profile">
      <path d={path(Ea)} fill="none" stroke="#ff6b8b" strokeWidth="2" />
      {catalyst && <path d={path(Ea * 0.55)} fill="none" stroke="#4ade80" strokeWidth="2" strokeDasharray="5 4" />}
      <text x="2" y="42" fontSize="9" fill="rgba(255,255,255,0.7)">A + B</text>
      <text x="204" y="62" fontSize="9" fill="rgba(255,255,255,0.7)">C + D</text>
    </svg>
  );
}

function KineticsScene({ params }: SceneProps) {
  const mode = String(params.mode ?? 'gas'); // gas | react | equilibrium
  const T = Number(params.T ?? 300);
  const Ea = Number(params.Ea ?? 50);
  const catalyst = Boolean(params.catalyst);
  const EaRev = Number(params.EaRev ?? 60);
  const n = mode === 'gas' ? 160 : 150;
  const effEa = catalyst ? Ea * 0.55 : Ea;

  const st = useRef({
    key: '',
    ps: [] as P[],
    t: 0,
    events: [] as { t: number; dir: 1 | -1 }[],
    histA: [] as number[],
    histC: [] as number[],
    sampleT: 0,
    reacted: 0,
    restartAt: 0,
    counts: new Array(24).fill(0) as number[],
  });
  if (st.current.key !== mode) {
    st.current = {
      ...st.current,
      key: mode,
      ps: spawn(n, T, mode === 'gas' ? () => 0 : (i) => i % 2),
      t: 0,
      events: [],
      histA: [],
      histC: [],
      reacted: 0,
      restartAt: 0,
    };
  }
  useTicker(250);

  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(BOX.x, BOX.y, BOX.z)), []);

  useFrame((_, rawDt) => {
    const s = st.current;
    const dt = Math.min(rawDt, 0.033);
    s.t += dt;
    const ps = s.ps;
    const half = BOX.clone().multiplyScalar(0.5).subScalar(R);

    // termostat
    const target = rms(T);
    let sum = 0;
    for (const q of ps) sum += q.v.lengthSq();
    const cur = Math.sqrt(sum / ps.length) || 1;
    const k = Math.pow(target / cur, 0.08);
    for (const q of ps) {
      q.v.multiplyScalar(k);
      q.p.addScaledVector(q.v, dt);
      (['x', 'y', 'z'] as const).forEach((ax) => {
        if (q.p[ax] < -half[ax]) {
          q.p[ax] = -half[ax];
          q.v[ax] = Math.abs(q.v[ax]);
        }
        if (q.p[ax] > half[ax]) {
          q.p[ax] = half[ax];
          q.v[ax] = -Math.abs(q.v[ax]);
        }
      });
      q.flash = Math.max(0, q.flash - dt * 2);
    }

    // zderzenia sprężyste (równe masy)
    const thrF = threshold(effEa);
    const thrR = threshold(catalyst ? EaRev * 0.55 : EaRev);
    const d = new THREE.Vector3();
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        d.subVectors(b.p, a.p);
        const d2 = d.lengthSq();
        if (d2 > 4 * R * R || d2 === 0) continue;
        const dist = Math.sqrt(d2);
        d.divideScalar(dist);
        const vn = (a.v.x - b.v.x) * d.x + (a.v.y - b.v.y) * d.y + (a.v.z - b.v.z) * d.z;
        if (vn <= 0) continue;
        const E = 0.25 * vn * vn;
        a.v.addScaledVector(d, -vn);
        b.v.addScaledVector(d, vn);
        const ov = (2 * R - dist) / 2;
        a.p.addScaledVector(d, -ov);
        b.p.addScaledVector(d, ov);
        if (mode === 'gas') continue;
        const AB = (a.s === 0 && b.s === 1) || (a.s === 1 && b.s === 0);
        const CD = (a.s === 2 && b.s === 3) || (a.s === 3 && b.s === 2);
        if (AB && E > thrF) {
          a.s = a.s === 0 ? 2 : 3;
          b.s = b.s === 0 ? 2 : 3;
          a.flash = b.flash = 1;
          s.reacted++;
          s.events.push({ t: s.t, dir: 1 });
        } else if (mode === 'equilibrium' && CD && E > thrR) {
          a.s = a.s === 2 ? 0 : 1;
          b.s = b.s === 2 ? 0 : 1;
          a.flash = b.flash = 1;
          s.events.push({ t: s.t, dir: -1 });
        }
      }
    }
    s.events = s.events.filter((e) => s.t - e.t < 3);

    if (mode === 'react') {
      const left = ps.filter((q) => q.s < 2).length;
      if (left < 8 && !s.restartAt) s.restartAt = s.t + 2;
      if (s.restartAt && s.t > s.restartAt) {
        ps.forEach((q, i) => (q.s = i % 2));
        s.restartAt = 0;
      }
    }
    if (mode === 'equilibrium') {
      s.sampleT += dt;
      if (s.sampleT > 0.15) {
        s.sampleT = 0;
        s.histA.push(ps.filter((q) => q.s === 0).length);
        s.histC.push(ps.filter((q) => q.s === 2).length);
        if (s.histA.length > 300) {
          s.histA.shift();
          s.histC.shift();
        }
      }
    }
    // histogram prędkości
    const vmax = rms(1000) * 2.4;
    const counts = new Array(24).fill(0);
    for (const q of ps) counts[Math.min(23, Math.floor((q.v.length() / vmax) * 24))]++;
    s.counts = counts;

    // aktualizacja instancji
    const m = mesh.current;
    if (!m) return;
    ps.forEach((q, i) => {
      dummy.position.copy(q.p);
      dummy.scale.setScalar(1 + q.flash * 0.9);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (mode === 'gas') {
        const f = Math.min(1, q.v.length() / vmax);
        color.setHSL((220 - f * 220) / 360, 0.85, 0.55 + f * 0.1);
      } else {
        color.copy(COLORS[q.s]);
        if (q.flash > 0) color.lerp(WHITE, q.flash * 0.7);
      }
      m.setColorAt(i, color);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  const s = st.current;
  const fwd = s.events.filter((e) => e.dir === 1).length / 3;
  const rev = s.events.filter((e) => e.dir === -1).length / 3;

  return (
    <>
      <Lights />
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#94a3b8" transparent opacity={0.5} />
      </lineSegments>
      <mesh>
        <boxGeometry args={[BOX.x, BOX.y, BOX.z]} />
        <meshStandardMaterial color="#3b82f6" transparent opacity={0.04} depthWrite={false} side={THREE.BackSide} />
      </mesh>
      <instancedMesh key={n} ref={mesh} args={[undefined, undefined, n]}>
        <sphereGeometry args={[R, 16, 16]} />
        <meshStandardMaterial roughness={0.35} />
      </instancedMesh>
      <InfoPortal>
        {mode === 'gas' && (
          <>
            <div style={{ color: '#ffd166', fontWeight: 600 }}>T = {T} K</div>
            <div>średnia prędkość ∝ √T: {fmt(rms(T) / rms(300), 2)}× względem 300 K</div>
            <div className="spark-title" style={{ marginTop: 6 }}>rozkład prędkości (wolne → szybkie)</div>
            <Bars counts={s.counts} />
          </>
        )}
        {mode === 'react' && (
          <>
            <div style={{ color: '#ffd166', fontWeight: 600 }}>
              T = {T} K, Eₐ = {Math.round(effEa)} kJ/mol
            </div>
            <div style={{ color: '#4ade80' }}>reakcje na sekundę: {fmt(fwd, 1)}</div>
            <div>łącznie przereagowało: {s.reacted} par</div>
            <EnergyProfile Ea={Ea} catalyst={catalyst} />
            <div>
              <span style={{ color: '#4fc3ff' }}>● A</span> <span style={{ color: '#fb923c' }}>● B</span> <span style={{ color: '#4ade80' }}>● C</span>{' '}
              <span style={{ color: '#a78bfa' }}>● D</span>
            </div>
          </>
        )}
        {mode === 'equilibrium' && (
          <>
            <div style={{ color: '#4ade80', fontWeight: 600 }}>szybkość →: {fmt(fwd, 1)} /s</div>
            <div style={{ color: '#4fc3ff', fontWeight: 600 }}>szybkość ←: {fmt(rev, 1)} /s</div>
            <div>{Math.abs(fwd - rev) < Math.max(1, fwd * 0.35) && fwd > 0 ? 'szybkości wyrównane → równowaga' : 'układ dąży do równowagi…'}</div>
            <Sparkline
              series={[
                { data: s.histA, color: '#4fc3ff', label: '[A]' },
                { data: s.histC, color: '#4ade80', label: '[C]' },
              ]}
              min={0}
              max={n / 2}
              title="stężenia"
            />
          </>
        )}
      </InfoPortal>
    </>
  );
}

export const kinetics: Topic = {
  id: 'kinetyka-rownowaga',
  title: 'Kinetyka i równowaga chemiczna',
  subject: 'chemia',
  summary: 'Symulacja cząsteczek w 3D: temperatura, zderzenia skuteczne, energia aktywacji, katalizator i równowaga dynamiczna.',
  accent: '#06b6d4',
  glyph: '⇌',
  steps: [
    {
      title: 'Temperatura i ruch cząsteczek',
      kind: '3d',
      scene: KineticsScene,
      camera: [5, 3.5, 7],
      preset: { mode: 'gas' },
      controls: [{ type: 'slider', key: 'T', label: 'Temperatura T', min: 100, max: 1000, step: 10, default: 300, unit: 'K' }],
      body: (
        <>
          <p>
            Cząsteczki gazu poruszają się chaotycznie i zderzają się ze sobą oraz ze ściankami naczynia.{' '}
            <strong>Temperatura</strong> jest miarą średniej energii kinetycznej ich ruchu.
          </p>
          <p>
            Nie wszystkie cząsteczki są jednakowo szybkie – kolor pokazuje prędkość, a histogram <strong>rozkład prędkości</strong>{' '}
            (Maxwella). Podgrzej gaz: rozkład przesuwa się w prawo, przybywa bardzo szybkich cząsteczek.
          </p>
          <p>To właśnie te najszybsze cząsteczki są kluczem do zrozumienia szybkości reakcji.</p>
        </>
      ),
    },
    {
      title: 'Zderzenia skuteczne i energia aktywacji',
      kind: '3d',
      scene: KineticsScene,
      camera: [5, 3.5, 7],
      preset: { mode: 'react' },
      controls: [
        { type: 'slider', key: 'T', label: 'Temperatura T', min: 150, max: 1000, step: 10, default: 400, unit: 'K' },
        { type: 'slider', key: 'Ea', label: 'Energia aktywacji Eₐ', min: 10, max: 100, step: 1, default: 50, unit: 'kJ/mol' },
        { type: 'toggle', key: 'catalyst', label: 'Katalizator', default: false },
      ],
      body: (
        <>
          <p>
            Reakcja A + B → C + D zachodzi tylko wtedy, gdy cząsteczki zderzą się z energią większą niż{' '}
            <strong>energia aktywacji Eₐ</strong>. Takie zderzenie nazywamy <strong>skutecznym</strong> (błysk).
          </p>
          <p>
            Wyższa temperatura → więcej szybkich cząsteczek → więcej zderzeń skutecznych. Reguła van ’t Hoffa: wzrost
            temperatury o 10 K przyspiesza wiele reakcji 2–4 razy.
          </p>
          <p>
            <strong>Katalizator</strong> obniża barierę energetyczną (zielona przerywana krzywa) i nie zużywa się w reakcji.
          </p>
        </>
      ),
    },
    {
      title: 'Równowaga dynamiczna',
      kind: '3d',
      scene: KineticsScene,
      camera: [5, 3.5, 7],
      preset: { mode: 'equilibrium' },
      controls: [
        { type: 'slider', key: 'T', label: 'Temperatura T', min: 150, max: 1000, step: 10, default: 500, unit: 'K' },
        { type: 'slider', key: 'Ea', label: 'Eₐ reakcji →', min: 20, max: 90, step: 1, default: 40, unit: 'kJ/mol' },
        { type: 'slider', key: 'EaRev', label: 'Eₐ reakcji ←', min: 20, max: 90, step: 1, default: 55, unit: 'kJ/mol' },
      ],
      body: (
        <>
          <p>
            Wiele reakcji jest <strong>odwracalnych</strong>: A + B ⇌ C + D. Na początku zachodzi głównie reakcja w prawo,
            ale gdy przybywa produktów, coraz częściej zachodzi też reakcja odwrotna.
          </p>
          <p>
            Po pewnym czasie obie szybkości się <strong>wyrównują</strong> – stężenia przestają się zmieniać, choć reakcje
            wciąż zachodzą. To <strong>równowaga dynamiczna</strong>.
          </p>
          <p>
            Zmień temperaturę lub energie aktywacji, a układ przesunie się do nowego stanu równowagi – ilustracja{' '}
            <strong>reguły przekory Le Chateliera</strong>.
          </p>
        </>
      ),
    },
  ],
};
