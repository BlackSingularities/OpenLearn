import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Control, SceneProps, Topic } from '../../lib/types';
import { InfoBox, fmt } from '../../lib/plot';
import { DynamicArrow, Lights } from '../../lib/three';
import { useSpeed } from '../../components/ui';

const GRAV: Record<string, number> = { ziemia: 9.81, ksiezyc: 1.62, mars: 3.71 };

interface Traj {
  pts: [number, number, number, number][]; // x, y, vx, vy (w metrach)
  dt: number;
  range: number;
  hmax: number;
  time: number;
}

/** Tor rzutu: bez oporu (drag = 0) lub z oporem kwadratowym a = −k·|v|·v. */
function simulate(v0: number, angleDeg: number, g: number, drag: number): Traj {
  const a = (angleDeg * Math.PI) / 180;
  let x = 0;
  let y = 0;
  let vx = v0 * Math.cos(a);
  let vy = v0 * Math.sin(a);
  const dt = 0.004;
  const pts: Traj['pts'] = [[0, 0, vx, vy]];
  let hmax = 0;
  for (let i = 0; i < 200000; i++) {
    const v = Math.hypot(vx, vy);
    vx += -drag * v * vx * dt;
    vy += (-g - drag * v * vy) * dt;
    const nx = x + vx * dt;
    const ny = y + vy * dt;
    if (ny < 0) {
      const f = y / (y - ny);
      pts.push([x + (nx - x) * f, 0, vx, vy]);
      break;
    }
    x = nx;
    y = ny;
    hmax = Math.max(hmax, y);
    pts.push([x, y, vx, vy]);
  }
  return { pts, dt, range: pts[pts.length - 1][0], hmax, time: (pts.length - 1) * dt };
}

const FAMILY = [15, 30, 45, 60, 75];
const FAMILY_COLORS = ['#4fc3ff', '#a78bfa', '#ffd166', '#ff6b8b', '#4ade80'];
const WORLD = 10; // najdłuższy tor ma 10 jednostek sceny

/** Linia toru odsłaniana stopniowo (setDrawRange) – bez przebudowy geometrii co klatkę. */
function makeLine(tr: Traj, scale: number, z: number, color: string, dashed: boolean) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < tr.pts.length; i += 4) pts.push(new THREE.Vector3(tr.pts[i][0] * scale, tr.pts[i][1] * scale, z));
  const last = tr.pts[tr.pts.length - 1];
  pts.push(new THREE.Vector3(last[0] * scale, last[1] * scale, z));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.55 })
    : new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geo, mat);
  if (dashed) line.computeLineDistances();
  return line;
}

function ProjectileScene({ params }: SceneProps) {
  const sp = useSpeed();
  const v0 = Number(params.v0 ?? 20);
  const angle = Number(params.angle ?? 45);
  const g = GRAV[String(params.g ?? 'ziemia')];
  const mode = String(params.mode ?? 'single');
  const drag = mode === 'drag' ? Number(params.drag ?? 0.02) : 0;
  const vectors = Boolean(params.vectors ?? true) && mode === 'single';
  const speed = Number(params.speed ?? 1);

  const trajs = useMemo(() => {
    if (mode === 'family') return FAMILY.map((a) => simulate(v0, a, g, 0));
    if (mode === 'drag') return [simulate(v0, angle, g, 0), simulate(v0, angle, g, drag)];
    return [simulate(v0, angle, g, 0)];
  }, [mode, v0, angle, g, drag]);

  const bestDrag = useMemo(() => {
    if (mode !== 'drag') return null;
    let best = { a: 45, r: 0 };
    for (let a = 10; a <= 80; a += 1) {
      const r = simulate(v0, a, g, drag).range;
      if (r > best.r) best = { a, r };
    }
    return best;
  }, [mode, v0, g, drag]);

  const maxRange = Math.max(...trajs.map((t) => t.range), 0.1);
  const scale = WORLD / maxRange;
  const lanes = trajs.map((_, i) => (mode === 'family' ? (i - 2) * 1.1 : 0));
  const colors = trajs.map((_, i) => (mode === 'family' ? FAMILY_COLORS[i] : mode === 'drag' && i === 0 ? '#cbd5e1' : '#ff6b8b'));
  const ghostIdx = mode === 'drag' ? 0 : -1;

  const lines = useMemo(
    () =>
      trajs.map((tr, i) => ({
        dashed: makeLine(tr, scale, lanes[i], colors[i], true),
        solid: makeLine(tr, scale, lanes[i], colors[i], false),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trajs, scale],
  );

  const clock = useRef({ t: 0, key: '' });
  const key = `${mode}|${v0}|${angle}|${g}|${drag}`;
  if (clock.current.key !== key) clock.current = { t: 0, key };
  const balls = useRef<(THREE.Mesh | null)[]>([]);
  const shadows = useRef<(THREE.Mesh | null)[]>([]);

  const current = (i: number) => {
    const tr = trajs[i];
    const idx = Math.min(tr.pts.length - 1, Math.max(0, Math.floor(clock.current.t / tr.dt)));
    return tr.pts[idx];
  };

  useFrame((_, dt) => {
    const c = clock.current;
    const longest = Math.max(...trajs.map((t) => t.time));
    c.t += Math.min(dt, 0.05) * speed;
    if (c.t > longest + 1.2) c.t = 0;
    trajs.forEach((tr, i) => {
      const idx = Math.min(tr.pts.length - 1, Math.floor(c.t / tr.dt));
      const [x, y] = tr.pts[idx];
      balls.current[i]?.position.set(x * scale, y * scale, lanes[i]);
      shadows.current[i]?.position.set(x * scale, 0.01, lanes[i]);
      const solid = lines[i].solid;
      solid.geometry.setDrawRange(0, Math.floor(idx / 4) + 1);
    });
  });

  const rad = (angle * Math.PI) / 180;
  const info =
    mode === 'family'
      ? [{ text: 'Zasięg dla kątów:', color: '#ffd166' }, ...FAMILY.map((a, i) => ({ text: `${a}° → ${fmt(trajs[i].range, 1)} m`, color: FAMILY_COLORS[i] }))]
      : mode === 'drag'
        ? [
            { text: `bez oporu: zasięg ${fmt(trajs[0].range, 1)} m`, color: '#cbd5e1' },
            { text: `z oporem: zasięg ${fmt(trajs[1].range, 1)} m`, color: '#ff6b8b' },
            { text: `najlepszy kąt z oporem ≈ ${bestDrag?.a}°`, color: '#ffd166' },
          ]
        : [
            { text: `zasięg Z = v₀²·sin2α / g = ${fmt(trajs[0].range, 1)} m`, color: '#ff6b8b' },
            { text: `h max = v₀²·sin²α / 2g = ${fmt(trajs[0].hmax, 1)} m` },
            { text: `czas lotu t = 2v₀·sinα / g = ${fmt(trajs[0].time, 2)} s` },
            { text: `vₓ = ${sp.fmt(v0 * Math.cos(rad), 1)} (stała)`, color: '#4ade80' },
          ];

  // podziałka w metrach co „ładną” wartość
  const step = [1, 2, 5, 10, 20, 50, 100].find((s) => maxRange / s <= 8) ?? 100;
  const ticks = Array.from({ length: Math.floor(maxRange / step) + 1 }, (_, i) => i * step);

  return (
    <>
      <Lights />
      <Grid position={[WORLD / 2, 0, 0]} args={[WORLD + 6, 8]} cellSize={0.5} cellThickness={0.6} cellColor="#2b3446" sectionSize={2} sectionThickness={1} sectionColor="#3b4a66" fadeDistance={30} infiniteGrid={false} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD / 2, -0.01, 0]}>
        <planeGeometry args={[WORLD + 6, 8]} />
        <meshStandardMaterial color="#14301f" roughness={1} />
      </mesh>
      {ticks.map((m) => (
        <Html key={m} position={[m * scale, 0, 2.9]} center>
          <div className="label-3d" style={{ fontSize: 11 }}>{m} m</div>
        </Html>
      ))}
      {lines.map((l, i) => (
        <group key={i}>
          <primitive object={l.dashed} />
          {i !== ghostIdx && <primitive object={l.solid} />}
        </group>
      ))}
      {trajs.map((_, i) =>
        i === ghostIdx ? null : (
          <group key={`b${i}`}>
            <mesh ref={(m) => (balls.current[i] = m)}>
              <sphereGeometry args={[0.16, 32, 32]} />
              <meshStandardMaterial color={colors[i]} emissive={colors[i]} emissiveIntensity={0.35} roughness={0.3} />
            </mesh>
            <mesh ref={(m) => (shadows.current[i] = m)} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.16, 24]} />
              <meshBasicMaterial color="#000" transparent opacity={0.4} />
            </mesh>
            {mode === 'family' && (
              <Html position={[trajs[i].range * scale, 0.35, lanes[i]]} center>
                <div className="label-3d" style={{ color: colors[i] }}>{FAMILY[i]}°</div>
              </Html>
            )}
          </group>
        ),
      )}
      {vectors && (
        <>
          <DynamicArrow color="#4ade80" get={() => { const [x, y, vx] = current(0); return [new THREE.Vector3(x * scale, y * scale, 0), new THREE.Vector3(vx * 0.08, 0, 0)]; }} />
          <DynamicArrow color="#4fc3ff" get={() => { const [x, y, , vy] = current(0); return [new THREE.Vector3(x * scale, y * scale, 0), new THREE.Vector3(0, vy * 0.08, 0)]; }} />
          <DynamicArrow color="#ffd166" radius={0.045} get={() => { const [x, y, vx, vy] = current(0); return [new THREE.Vector3(x * scale, y * scale, 0), new THREE.Vector3(vx * 0.08, vy * 0.08, 0)]; }} />
        </>
      )}
      <InfoBox lines={vectors ? [...info, { text: 'zielony vₓ · niebieski v_y · żółty v' }] : info} />
    </>
  );
}

const v0Control: Control = { type: 'slider', key: 'v0', label: 'Prędkość początkowa v₀', min: 5, max: 40, step: 1, default: 20, unit: 'm/s' };
const angleControl: Control = { type: 'slider', key: 'angle', label: 'Kąt rzutu α', min: 5, max: 85, step: 1, default: 45, unit: '°' };
const speedControl: Control = { type: 'slider', key: 'speed', label: 'Tempo animacji', min: 0.2, max: 2, step: 0.1, default: 1, unit: '×' };

export const projectile: Topic = {
  id: 'rzut-ukosny',
  title: 'Rzut ukośny',
  subject: 'fizyka',
  summary: 'Ruch w dwóch wymiarach w scenie 3D: składowe prędkości, zasięg w zależności od kąta i wpływ oporu powietrza.',
  accent: '#fb923c',
  glyph: '⤴',
  steps: [
    {
      title: 'Dwa ruchy w jednym',
      kind: '3d',
      scene: ProjectileScene,
      camera: [5, 4, 13],
      target: [5, 2, 0],
      preset: { mode: 'single' },
      controls: [
        v0Control,
        angleControl,
        { type: 'select', key: 'g', label: 'Miejsce', default: 'ziemia', options: [{ value: 'ziemia', label: 'Ziemia' }, { value: 'mars', label: 'Mars' }, { value: 'ksiezyc', label: 'Księżyc' }] },
        { type: 'toggle', key: 'vectors', label: 'Wektory prędkości', default: true },
        speedControl,
      ],
      body: (
        <>
          <p>
            Rzut ukośny to złożenie dwóch niezależnych ruchów: <strong>jednostajnego w poziomie</strong> (vₓ = const,
            zielony wektor) i <strong>jednostajnie zmiennego w pionie</strong> (v_y maleje o g co sekundę, niebieski).
          </p>
          <p>Torem jest parabola. W najwyższym punkcie v_y = 0, ale ciało wciąż leci – z prędkością vₓ.</p>
          <div className="formula">Z = v₀² sin 2α / g</div>
          <p>Scena skaluje się do zasięgu – podziałka na ziemi pokazuje metry. Przenieś rzut na Księżyc i porównaj liczby.</p>
        </>
      ),
    },
    {
      title: 'Który kąt jest najlepszy?',
      kind: '3d',
      scene: ProjectileScene,
      camera: [3, 6, 13],
      target: [5, 1.5, 0],
      preset: { mode: 'family', g: 'ziemia' },
      controls: [v0Control, speedControl],
      body: (
        <>
          <p>Pięć ciał wyrzuconych z tą samą prędkością pod różnymi kątami – każde na osobnym „torze” w głąb sceny.</p>
          <p>
            Największy zasięg daje kąt <strong>45°</strong>, bo wtedy sin 2α = 1. Kąty dopełniające się do 90° (np. 30° i
            60°) dają <strong>ten sam zasięg</strong> – ale różną wysokość i czas lotu.
          </p>
          <p>Obróć scenę i spójrz z boku albo z góry – zobaczysz, które ciało ląduje najdalej.</p>
        </>
      ),
    },
    {
      title: 'Opór powietrza',
      kind: '3d',
      scene: ProjectileScene,
      camera: [5, 4, 13],
      target: [5, 2, 0],
      preset: { mode: 'drag', g: 'ziemia', vectors: false },
      controls: [
        v0Control,
        angleControl,
        { type: 'slider', key: 'drag', label: 'Opór powietrza', min: 0.002, max: 0.08, step: 0.002, default: 0.02 },
        speedControl,
      ],
      body: (
        <>
          <p>
            W rzeczywistości działa <strong>siła oporu</strong> rosnąca z kwadratem prędkości. Szara przerywana linia to tor w
            próżni, czerwona – z oporem.
          </p>
          <p>
            Tor przestaje być parabolą: opada bardziej stromo niż się wznosi. Zasięg maleje, a{' '}
            <strong>optymalny kąt jest mniejszy niż 45°</strong> – zobacz w ramce.
          </p>
          <p>Ten tor symulacja liczy numerycznie, krok po kroku – tak jak robią to programy balistyczne.</p>
        </>
      ),
    },
  ],
};
