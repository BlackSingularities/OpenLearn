import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Trail } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { Arrow3D, DynamicArrow, Lights } from '../../lib/three';
import { num } from '../../lib/mathkit';

const RED = '#ff6b8b';
const BLUE = '#4fc3ff';
const GOLD = '#ffd166';
const GREEN = '#4ade80';

/* ---------- Krok 1: siła Lorentza ---------- */
function LorentzScene({ params }: SceneProps) {
  const B = Number(params.B);
  const v = Number(params.v);
  const th = (Number(params.theta) * Math.PI) / 180;
  const q = String(params.q) === 'minus' ? -1 : 1;
  const m = 1;
  const vPar = v * Math.cos(th);
  const vPerp = v * Math.sin(th);
  const omega = (q * B) / m;
  const r = vPerp / Math.abs(omega);
  const ball = useRef<THREE.Mesh>(null);
  const st = useRef({ t: 0, key: 0 });
  useEffect(() => {
    st.current.t = 0;
    st.current.key++;
  }, [B, v, th, q]);
  const pos = (t: number) => {
    // ruch po okręgu wokół osi y (wzdłuż B), siła q·v×B skierowana do osi
    const ph = omega * t;
    return new THREE.Vector3(r * Math.cos(ph), -2.5 + vPar * t, r * Math.sin(ph));
  };
  const velAt = (t: number) => {
    const ph = omega * t;
    return new THREE.Vector3(-r * omega * Math.sin(ph), vPar, r * omega * Math.cos(ph));
  };
  useFrame((_, dt) => {
    const s = st.current;
    s.t += dt * 0.6;
    const p = pos(s.t);
    if (p.y > 2.8 || p.y < -2.9 || s.t > 25) s.t = 0;
    ball.current?.position.copy(pos(s.t));
  });
  const getV = () => {
    const t = st.current.t;
    return [pos(t), velAt(t).normalize().multiplyScalar(0.9)] as [THREE.Vector3, THREE.Vector3];
  };
  const getF = () => {
    const t = st.current.t;
    const F = velAt(t).cross(new THREE.Vector3(0, B, 0)).multiplyScalar(q);
    if (F.length() < 1e-4) return null;
    return [pos(t), F.normalize().multiplyScalar(0.8)] as [THREE.Vector3, THREE.Vector3];
  };
  const lines = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -3; x <= 3; x += 1.5) for (let z = -3; z <= 3; z += 1.5) out.push([x, z]);
    return out;
  }, []);
  return (
    <group>
      <Lights />
      {lines.map(([x, z]) => (
        <group key={`${x}${z}`}>
          <Line points={[[x, -3, z], [x, 3, z]]} color={BLUE} transparent opacity={0.18 + B * 0.08} lineWidth={1} />
          <Arrow3D from={[x, 2.4, z]} vec={[0, 0.5, 0]} color={BLUE} radius={0.02} />
        </group>
      ))}
      <Trail key={st.current.key} width={2.2} length={30} color={q > 0 ? RED : GREEN} attenuation={(t) => t}>
        <mesh ref={ball}>
          <sphereGeometry args={[0.14, 20, 20]} />
          <meshStandardMaterial color={q > 0 ? RED : GREEN} emissive={q > 0 ? RED : GREEN} emissiveIntensity={0.5} />
        </mesh>
      </Trail>
      <DynamicArrow get={getV} color={GOLD} />
      <DynamicArrow get={getF} color="#c084fc" />
      <InfoPortal>
        <div style={{ color: BLUE, fontWeight: 600 }}>pole B = {num(B, 1)} (w górę)</div>
        <div style={{ color: GOLD, fontWeight: 600 }}>prędkość – żółta, kąt z liniami pola {Math.round((th * 180) / Math.PI)}°</div>
        <div style={{ color: '#c084fc', fontWeight: 600 }}>siła Lorentza F = q·v×B – fioletowa, zawsze ⊥ do v</div>
        <div>
          promień r = m·v⊥ / (|q|·B) = {num(r, 2)}, okres T = 2πm / (|q|B) = {num((2 * Math.PI) / Math.abs(omega), 2)}
        </div>
        <div className="muted-line">{th < 0.02 ? 'ruch wzdłuż linii pola – siła równa zero' : th > 1.55 ? 'prędkość ⊥ do B – okrąg' : 'składowa wzdłuż pola + obieg = spirala'}</div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 2: pole wokół przewodnika ---------- */
function WireScene({ params }: SceneProps) {
  const I = Number(params.I);
  const second = Boolean(params.second);
  const I2 = Number(params.I2);
  const d = 2.4;
  const needles = useMemo(() => {
    const out: [number, number][] = [];
    for (const r of [0.9, 1.6, 2.4]) for (let k = 0; k < 10; k++) out.push([r * Math.cos((k / 10) * Math.PI * 2), r * Math.sin((k / 10) * Math.PI * 2)]);
    return out;
  }, []);
  const wires: { x: number; I: number }[] = second ? [{ x: -d / 2, I }, { x: d / 2, I: I2 }] : [{ x: 0, I }];
  const fieldAt = (x: number, z: number) => {
    let bx = 0;
    let bz = 0;
    for (const w of wires) {
      const dx = x - w.x;
      const r2 = dx * dx + z * z + 1e-3;
      // prąd wzdłuż +y: kierunek B = ŷ × r̂  →  (z, −dx)·I/r²  w płaszczyźnie (x, z)
      bx += (z * w.I) / r2;
      bz += (-dx * w.I) / r2;
    }
    return [bx, bz];
  };
  const pts = second
    ? needles.flatMap(([x, z]) => [[x - d / 2, z], [x + d / 2, z]] as [number, number][]).filter(([x, z]) => Math.min(Math.hypot(x + d / 2, z), Math.hypot(x - d / 2, z)) > 0.6)
    : needles;
  const force = second ? (I * I2) / d : 0;
  return (
    <group>
      <Lights />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[5, 64]} />
        <meshStandardMaterial color="#1a2030" transparent opacity={0.8} />
      </mesh>
      {wires.map((w, i) => (
        <group key={i} position={[w.x, 0, 0]}>
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 6, 16]} />
            <meshStandardMaterial color="#d97706" metalness={0.7} roughness={0.3} />
          </mesh>
          {Math.abs(w.I) > 0.05 && <Arrow3D from={[0.25, w.I > 0 ? 1.5 : 2.5, 0]} vec={[0, w.I > 0 ? 1 : -1, 0]} color={GOLD} radius={0.04} />}
          {!second &&
            [0.9, 1.6, 2.4].map((r) => (
              <Line
                key={r}
                points={Array.from({ length: 65 }, (_, k) => [r * Math.cos((k / 64) * Math.PI * 2), 0.02, r * Math.sin((k / 64) * Math.PI * 2)] as [number, number, number])}
                color={BLUE}
                transparent
                opacity={Math.min(0.9, (Math.abs(I) / r) * 0.25)}
                lineWidth={2}
              />
            ))}
        </group>
      ))}
      {pts.map(([x, z], i) => {
        const [bx, bz] = fieldAt(x, z);
        const ang = Math.atan2(bz, bx);
        return (
          <group key={i} position={[x, 0.08, z]} rotation={[0, -ang, 0]}>
            <mesh position={[0.13, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.05, 0.26, 8]} />
              <meshStandardMaterial color={RED} />
            </mesh>
            <mesh position={[-0.13, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.05, 0.26, 8]} />
              <meshStandardMaterial color="#e2e8f0" />
            </mesh>
          </group>
        );
      })}
      {second && Math.abs(force) > 0.01 && (
        <>
          <Arrow3D from={[-d / 2, -1, 0]} vec={[Math.sign(force) * 0.9, 0, 0]} color={GREEN} radius={0.05} />
          <Arrow3D from={[d / 2, -1, 0]} vec={[-Math.sign(force) * 0.9, 0, 0]} color={GREEN} radius={0.05} />
        </>
      )}
      <InfoPortal>
        <div style={{ color: GOLD, fontWeight: 600 }}>prąd I = {num(I, 1)} A {I >= 0 ? '(w górę)' : '(w dół)'}</div>
        <div style={{ color: BLUE }}>B = μ₀·I / (2π·r) – maleje z odległością</div>
        <div style={{ color: RED }}>czerwone końce igieł – biegun N, wskazują kierunek B</div>
        {second && <div style={{ color: GREEN, fontWeight: 600 }}>{force > 0 ? 'prądy zgodne → przewodniki się przyciągają' : force < 0 ? 'prądy przeciwne → przewodniki się odpychają' : 'brak oddziaływania'}</div>}
        <div className="muted-line">reguła prawej dłoni: kciuk wzdłuż prądu, palce pokazują linie pola</div>
      </InfoPortal>
    </group>
  );
}

export const magnetism: Topic = {
  id: 'pole-magnetyczne',
  title: 'Pole magnetyczne',
  subject: 'fizyka',
  summary: 'Ładunek krążący po spirali w polu magnetycznym, siła Lorentza w 3D, igły kompasów wokół przewodnika z prądem i przyciąganie dwóch przewodów.',
  accent: '#8b5cf6',
  glyph: 'B',
  steps: [
    {
      title: 'Siła Lorentza',
      kind: '3d',
      scene: LorentzScene,
      camera: [6.5, 3, 8.5],
      controls: [
        { type: 'slider', key: 'B', label: 'Indukcja B', min: 0.5, max: 4, step: 0.1, default: 2 },
        { type: 'slider', key: 'v', label: 'Prędkość v', min: 0.5, max: 4, step: 0.1, default: 2.5 },
        { type: 'slider', key: 'theta', label: 'Kąt między v a B', min: 0, max: 90, step: 1, default: 70, unit: '°' },
        {
          type: 'select',
          key: 'q',
          label: 'Ładunek',
          default: 'plus',
          options: [
            { value: 'plus', label: 'dodatni' },
            { value: 'minus', label: 'ujemny' },
          ],
        },
      ],
      body: (
        <>
          <div className="formula">F = q · v × B      r = m·v / (q·B)</div>
          <p>
            Pole magnetyczne działa tylko na <strong>poruszający się</strong> ładunek, i to siłą prostopadłą do jego
            prędkości. Taka siła nie zmienia szybkości, tylko kierunek – ładunek zatacza okrąg.
          </p>
          <p>
            Jeśli prędkość ma też składową wzdłuż linii pola, okrąg rozciąga się w <strong>spiralę</strong>. Tak cząstki
            wiatru słonecznego wędrują wzdłuż pola Ziemi ku biegunom i tworzą zorze. Zmień znak ładunku – kierunek obiegu
            się odwraca.
          </p>
        </>
      ),
    },
    {
      title: 'Pole wokół przewodnika z prądem',
      kind: '3d',
      scene: WireScene,
      camera: [0, 6.5, 5.5],
      controls: [
        { type: 'slider', key: 'I', label: 'Natężenie I', min: -10, max: 10, step: 0.5, default: 6, unit: 'A' },
        { type: 'toggle', key: 'second', label: 'Drugi przewodnik', default: false },
        { type: 'slider', key: 'I2', label: 'Prąd w drugim przewodniku', min: -10, max: 10, step: 0.5, default: 6, unit: 'A' },
      ],
      body: (
        <>
          <div className="formula">B = μ₀ · I / (2π · r)</div>
          <p>
            Prąd wytwarza pole magnetyczne, którego linie to <strong>okręgi wokół przewodnika</strong>. Igły kompasów
            ustawiają się stycznie do nich. Odwróć prąd – wszystkie igły obracają się o 180°.
          </p>
          <p>
            Dodaj drugi przewodnik: każdy znajduje się w polu drugiego, więc działa na niego siła. Prądy zgodne się{' '}
            <strong>przyciągają</strong>, przeciwne – <strong>odpychają</strong>. Na tym zjawisku opierała się dawna
            definicja ampera.
          </p>
        </>
      ),
    },
  ],
};
