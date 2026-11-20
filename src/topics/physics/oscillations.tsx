import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line, Trail } from '@react-three/drei';
import * as THREE from 'three';
import type { Control, SceneProps, Topic } from '../../lib/types';
import { InfoPortal, Sparkline, fmt } from '../../lib/plot';
import { useTicker } from '../../lib/useCanvasLoop';
import { DynamicArrow, Lights } from '../../lib/three';

const GRAVITY: Record<string, { g: number; label: string }> = {
  ziemia: { g: 9.81, label: 'Ziemia' },
  ksiezyc: { g: 1.62, label: 'Księżyc' },
  mars: { g: 3.71, label: 'Mars' },
  jowisz: { g: 24.79, label: 'Jowisz' },
};

const HIST = 240;
const PIVOT = new THREE.Vector3(0, 3.4, 0);
const UP = new THREE.Vector3(0, 1, 0);

function Floor({ y = -0.25 }: { y?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <circleGeometry args={[7, 64]} />
      <meshStandardMaterial color="#1a2030" roughness={0.9} />
    </mesh>
  );
}

/* ======================= Wahadło matematyczne 3D ======================= */
function PendulumScene({ params }: SceneProps) {
  const L = Number(params.L ?? 1.5);
  const g = GRAVITY[String(params.g ?? 'ziemia')].g;
  const amp0 = (Number(params.amp ?? 20) * Math.PI) / 180;
  const b = Number(params.damping ?? 0);
  const energy = Boolean(params.energy);
  const playing = Boolean(params.play ?? true);

  const s = useRef({ key: '', th: amp0, w: 0, t: 0, hist: [] as number[], lastCross: -1, period: 0, sample: 0 });
  const key = `${L}|${g}|${amp0}|${b}`;
  if (s.current.key !== key) s.current = { key, th: amp0, w: 0, t: 0, hist: [], lastCross: -1, period: 0, sample: 0 };
  useTicker(150);

  const bob = useRef<THREE.Mesh>(null);
  const rod = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const bars = useRef<(THREE.Mesh | null)[]>([]);
  const offsetX = energy ? -1.2 : 0;
  const pivot = useMemo(() => PIVOT.clone().add(new THREE.Vector3(offsetX, 0, 0)), [offsetX]);

  const arc = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = -amp0 + (2 * amp0 * i) / 40;
      pts.push(new THREE.Vector3(pivot.x + Math.sin(a) * L, pivot.y - Math.cos(a) * L, 0));
    }
    return pts;
  }, [amp0, L, pivot]);

  useFrame((_, dt) => {
    const st = s.current;
    if (playing) {
      const n = 8;
      const h = Math.min(dt, 0.05) / n;
      const acc = (th: number, om: number) => -(g / L) * Math.sin(th) - b * om;
      for (let i = 0; i < n; i++) {
        // RK4
        const k1t = st.w;
        const k1w = acc(st.th, st.w);
        const k2t = st.w + (h / 2) * k1w;
        const k2w = acc(st.th + (h / 2) * k1t, st.w + (h / 2) * k1w);
        const k3t = st.w + (h / 2) * k2w;
        const k3w = acc(st.th + (h / 2) * k2t, st.w + (h / 2) * k2w);
        const k4t = st.w + h * k3w;
        const k4w = acc(st.th + h * k3t, st.w + h * k3w);
        const prev = st.th;
        st.th += (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
        st.w += (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
        st.t += h;
        if (prev < 0 && st.th >= 0) {
          if (st.lastCross >= 0) st.period = st.t - st.lastCross;
          st.lastCross = st.t;
        }
      }
      st.sample += dt;
      if (st.sample > 1 / 30) {
        st.sample = 0;
        st.hist.push((st.th * 180) / Math.PI);
        if (st.hist.length > HIST) st.hist.shift();
      }
    }
    const bx = pivot.x + Math.sin(st.th) * L;
    const by = pivot.y - Math.cos(st.th) * L;
    bob.current?.position.set(bx, by, 0);
    if (rod.current) {
      rod.current.position.set((pivot.x + bx) / 2, (pivot.y + by) / 2, 0);
      rod.current.quaternion.setFromUnitVectors(UP, new THREE.Vector3(pivot.x - bx, pivot.y - by, 0).normalize());
      rod.current.scale.set(1, L, 1);
    }
    shadow.current?.position.set(bx, -0.24, 0);

    if (energy) {
      const E0 = g * L * (1 - Math.cos(amp0));
      const Ep = g * L * (1 - Math.cos(st.th));
      const Ek = 0.5 * (L * st.w) ** 2;
      const Q = Math.max(0, E0 - Ep - Ek);
      [Ep, Ek, Q, Ep + Ek].forEach((v, i) => {
        const m = bars.current[i];
        if (!m) return;
        const hh = Math.max(0.001, E0 > 0 ? (v / E0) * 3 : 0);
        m.scale.y = hh;
        m.position.y = -0.25 + hh / 2;
      });
    }
  });

  const st = s.current;
  const Tf = 2 * Math.PI * Math.sqrt(L / g);
  const BAR = [
    { c: '#4fc3ff', l: 'Eₚ' },
    { c: '#ff6b8b', l: 'Eₖ' },
    { c: '#f59e0b', l: 'ciepło' },
    { c: '#4ade80', l: 'E mech.' },
  ];

  return (
    <>
      <Lights />
      <Floor />
      {/* sufit z uchwytem */}
      <mesh position={[pivot.x, pivot.y + 0.1, 0]}>
        <boxGeometry args={[1.6, 0.2, 0.6]} />
        <meshStandardMaterial color="#475569" roughness={0.6} />
      </mesh>
      <Line points={[pivot, new THREE.Vector3(pivot.x, pivot.y - L - 0.4, 0)]} color="#ffffff" transparent opacity={0.25} dashed dashSize={0.1} gapSize={0.1} lineWidth={1} />
      <Line points={arc} color="#ffd166" transparent opacity={0.45} lineWidth={1.5} />
      <mesh ref={rod}>
        <cylinderGeometry args={[0.012, 0.012, 1, 8]} />
        <meshStandardMaterial color="#d6dae4" />
      </mesh>
      <Trail width={0.6} length={5} color="#ff6b8b" attenuation={(w) => w * w}>
        <mesh ref={bob}>
          <sphereGeometry args={[0.2, 40, 40]} />
          <meshStandardMaterial color="#ff6b8b" metalness={0.5} roughness={0.25} />
        </mesh>
      </Trail>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
      <DynamicArrow
        color="#ffd166"
        get={() => {
          const th = s.current.th;
          const bx = pivot.x + Math.sin(th) * L;
          const by = pivot.y - Math.cos(th) * L;
          const Ft = -g * Math.sin(th) * 0.12;
          return [new THREE.Vector3(bx, by, 0.25), new THREE.Vector3(Math.cos(th) * Ft, Math.sin(th) * Ft, 0)];
        }}
      />
      {energy &&
        BAR.map((bar, i) => (
          <group key={bar.l}>
            <mesh position={[1.4 + i * 0.75, 1.25, -0.4]}>
              <boxGeometry args={[0.5, 3, 0.5]} />
              <meshStandardMaterial color="#ffffff" transparent opacity={0.06} depthWrite={false} />
            </mesh>
            <mesh ref={(m) => (bars.current[i] = m)} position={[1.4 + i * 0.75, 0, -0.4]}>
              <boxGeometry args={[0.5, 1, 0.5]} />
              <meshStandardMaterial color={bar.c} emissive={bar.c} emissiveIntensity={0.25} />
            </mesh>
            <Html position={[1.4 + i * 0.75, -0.6, -0.4]} center>
              <div className="label-3d">{bar.l}</div>
            </Html>
          </group>
        ))}
      <InfoPortal>
        <div style={{ color: '#4fc3ff', fontWeight: 600 }}>T = 2π√(l/g) = {fmt(Tf)} s</div>
        <div style={{ color: '#ff6b8b', fontWeight: 600 }}>T zmierzony: {st.period > 0 ? `${fmt(st.period)} s` : '…'}</div>
        <div>
          {st.period > 0 && Math.abs(st.period - Tf) / Tf > 0.02 ? 'duża amplituda → wzór jest tylko przybliżeniem' : 'małe wychylenia: wzór działa'}
        </div>
        <Sparkline series={[{ data: st.hist, color: '#ff6b8b', label: 'θ(t)' }]} min={(-amp0 * 180) / Math.PI * 1.1} max={((amp0 * 180) / Math.PI) * 1.1} title="wychylenie" />
      </InfoPortal>
    </>
  );
}

/* ======================= Sprężyna 3D ======================= */
function helixGeometry() {
  const coils = 12;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 600; i++) {
    const t = i / 600;
    const a = t * coils * Math.PI * 2;
    pts.push(new THREE.Vector3(t, Math.cos(a) * 0.22, Math.sin(a) * 0.22));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 600, 0.025, 8, false);
}

function SpringScene({ params }: SceneProps) {
  const k = Number(params.k ?? 40);
  const m = Number(params.m ?? 1);
  const A = Number(params.A ?? 0.2);
  const vectors = Boolean(params.vectors ?? true);
  const playing = Boolean(params.play ?? true);
  const omega = Math.sqrt(k / m);
  const SCALE = 8; // 1 m = 8 jednostek sceny (żeby 0,3 m było dobrze widać)
  const WALL = -3.2;
  const EQ = 0.6;
  const size = 0.55 + Math.sqrt(m) * 0.25;

  const s = useRef({ key: '', x: A, v: 0, hx: [] as number[], hv: [] as number[], sample: 0 });
  const key = `${k}|${m}|${A}`;
  if (s.current.key !== key) s.current = { key, x: A, v: 0, hx: [], hv: [], sample: 0 };
  useTicker(150);

  const spring = useRef<THREE.Mesh>(null);
  const block = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => helixGeometry(), []);

  useFrame((_, dt) => {
    const st = s.current;
    if (playing) {
      const n = 10;
      const h = Math.min(dt, 0.05) / n;
      for (let i = 0; i < n; i++) {
        st.v += (-(k / m) * st.x) * h;
        st.x += st.v * h;
      }
      st.sample += dt;
      if (st.sample > 1 / 30) {
        st.sample = 0;
        st.hx.push(st.x);
        st.hv.push(st.v / omega);
        if (st.hx.length > HIST) {
          st.hx.shift();
          st.hv.shift();
        }
      }
    }
    const bx = EQ + st.x * SCALE;
    block.current?.position.set(bx, size / 2 - 0.25, 0);
    if (spring.current) {
      spring.current.position.set(WALL, size / 2 - 0.25, 0);
      spring.current.scale.set(bx - size / 2 - WALL, 1, 1);
    }
  });

  return (
    <>
      <Lights />
      <mesh position={[0, -0.3, 0]}>
        <boxGeometry args={[9, 0.1, 2.4]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>
      <mesh position={[WALL - 0.1, 0.6, 0]}>
        <boxGeometry args={[0.2, 1.9, 2.4]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <Line points={[[EQ, -0.24, 1.2], [EQ, 1.8, 1.2]]} color="#ffffff" transparent opacity={0.35} dashed dashSize={0.1} gapSize={0.08} />
      <Html position={[EQ, -0.6, 1.2]} center>
        <div className="label-3d">x = 0</div>
      </Html>
      <mesh ref={spring} geometry={geo}>
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh ref={block}>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color="#4fc3ff" roughness={0.35} />
      </mesh>
      {vectors && (
        <>
          <DynamicArrow color="#ff6b8b" get={() => [new THREE.Vector3(EQ + s.current.x * SCALE, size + 0.15, 0), new THREE.Vector3(-k * s.current.x * 0.12, 0, 0)]} />
          <DynamicArrow color="#4ade80" get={() => [new THREE.Vector3(EQ + s.current.x * SCALE, size + 0.55, 0), new THREE.Vector3(s.current.v * 1.2, 0, 0)]} />
        </>
      )}
      <InfoPortal>
        <div style={{ color: '#4fc3ff', fontWeight: 600 }}>T = 2π√(m/k) = {fmt((2 * Math.PI) / omega)} s</div>
        <div>
          f = {fmt(omega / (2 * Math.PI))} Hz, ω = {fmt(omega)} rad/s
        </div>
        {vectors && (
          <div>
            <span style={{ color: '#ff6b8b' }}>■ F = −kx</span> <span style={{ color: '#4ade80' }}>■ v</span>
          </div>
        )}
        <Sparkline
          series={[
            { data: s.current.hx, color: '#4fc3ff', label: 'x(t)' },
            { data: s.current.hv, color: '#4ade80', label: 'v(t)/ω' },
          ]}
          min={-A * 1.1}
          max={A * 1.1}
        />
      </InfoPortal>
    </>
  );
}

const gControl: Control = {
  type: 'select',
  key: 'g',
  label: 'Planeta',
  default: 'ziemia',
  options: Object.entries(GRAVITY).map(([value, v]) => ({ value, label: v.label })),
};
const playControl: Control = { type: 'toggle', key: 'play', label: 'Ruch', default: true };

export const oscillations: Topic = {
  id: 'drgania',
  title: 'Ruch drgający: wahadło i sprężyna',
  subject: 'fizyka',
  summary: 'Symulacja 3D liczona na żywo: okres wahadła na różnych planetach, przemiany energii, tłumienie i oscylator harmoniczny.',
  accent: '#f43f5e',
  glyph: '◡',
  steps: [
    {
      title: 'Wahadło matematyczne',
      kind: '3d',
      scene: PendulumScene,
      camera: [0, 2.3, 8.5],
      target: [0, 1.8, 0],
      preset: { energy: false, damping: 0 },
      controls: [
        { type: 'slider', key: 'L', label: 'Długość nici l', min: 0.5, max: 3, step: 0.1, default: 2, unit: 'm' },
        gControl,
        { type: 'slider', key: 'amp', label: 'Wychylenie początkowe', min: 5, max: 90, step: 1, default: 15, unit: '°' },
        playControl,
      ],
      body: (
        <>
          <p>
            Wahadło matematyczne to punktowa masa na nieważkiej nici. Siła zwracająca (żółta strzałka) to składowa ciężaru
            styczna do toru – zawsze skierowana ku położeniu równowagi.
          </p>
          <div className="formula">T = 2π √(l / g)</div>
          <p>
            Okres <strong>nie zależy od masy</strong> ani – dla małych wychyleń – od amplitudy. Zależy tylko od długości i
            przyspieszenia grawitacyjnego.
          </p>
          <p>Wydłuż nić 4 razy – okres rośnie 2 razy. Przenieś wahadło na Księżyc. Ustaw 80° i porównaj okres zmierzony ze wzorem.</p>
        </>
      ),
    },
    {
      title: 'Energia w ruchu drgającym',
      kind: '3d',
      scene: PendulumScene,
      camera: [0.6, 2.4, 9.5],
      target: [0.6, 1.7, 0],
      preset: { energy: true, g: 'ziemia' },
      controls: [
        { type: 'slider', key: 'amp', label: 'Wychylenie początkowe', min: 5, max: 90, step: 1, default: 40, unit: '°' },
        { type: 'slider', key: 'damping', label: 'Opór powietrza (tłumienie)', min: 0, max: 0.6, step: 0.02, default: 0 },
        { type: 'slider', key: 'L', label: 'Długość nici l', min: 0.5, max: 3, step: 0.1, default: 2, unit: 'm' },
        playControl,
      ],
      body: (
        <>
          <p>
            W ruchu wahadła energia nieustannie zmienia postać: w skrajnym położeniu jest tylko{' '}
            <strong>potencjalna</strong> (Eₚ), w najniższym punkcie – tylko <strong>kinetyczna</strong> (Eₖ).
          </p>
          <div className="formula">Eₚ + Eₖ = const</div>
          <p>
            Włącz opór powietrza: energia mechaniczna maleje, a rośnie pomarańczowy słupek – energia zamieniona na{' '}
            <strong>ciepło</strong>. To <strong>drgania tłumione</strong>: amplituda maleje, a wykres θ(t) zwęża się.
          </p>
        </>
      ),
    },
    {
      title: 'Oscylator harmoniczny: sprężyna',
      kind: '3d',
      scene: SpringScene,
      camera: [0, 3, 8],
      target: [-0.5, 0.5, 0],
      controls: [
        { type: 'slider', key: 'k', label: 'Współczynnik sprężystości k', min: 5, max: 150, step: 1, default: 40, unit: 'N/m' },
        { type: 'slider', key: 'm', label: 'Masa m', min: 0.2, max: 5, step: 0.1, default: 1, unit: 'kg' },
        { type: 'slider', key: 'A', label: 'Amplituda A', min: 0.05, max: 0.3, step: 0.01, default: 0.2, unit: 'm' },
        { type: 'toggle', key: 'vectors', label: 'Wektory siły i prędkości', default: true },
        playControl,
      ],
      body: (
        <>
          <p>
            Siła sprężystości jest proporcjonalna do wychylenia i skierowana przeciwnie: <strong>F = −kx</strong> (prawo
            Hooke’a). Taki ruch nazywamy <strong>harmonicznym</strong> – jego wykres to sinusoida.
          </p>
          <div className="formula">T = 2π √(m / k)</div>
          <p>
            Prędkość (zielona) jest największa, gdy wychylenie jest zerowe – i odwrotnie. Siła (czerwona) zawsze „ciągnie”
            do x = 0.
          </p>
          <p>Zwiększ masę 4 razy – okres podwoi się. Amplituda nie zmienia okresu.</p>
        </>
      ),
    },
  ],
};
