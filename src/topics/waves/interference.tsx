import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox } from '../../lib/plot';

const SIZE = 12;
const SEG = 140;

const DEEP = new THREE.Color('#0b2a6b');
const MID = new THREE.Color('#1f7bd8');
const CREST = new THREE.Color('#bff3ff');
const NODE = new THREE.Color('#151a2a');
const ANTINODE = new THREE.Color('#ffd166');

function WaterScene({ params }: SceneProps) {
  const sources = Number(params.sources ?? 1);
  const freq = Number(params.freq ?? 1.2);
  const sep = Number(params.sep ?? 3);
  const amp = Number(params.amp ?? 0.35);
  const playing = Boolean(params.play ?? true);
  const mapMode = String(params.view ?? 'surface') === 'map';

  const mesh = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    const count = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, []);

  const srcPos = useMemo<[number, number][]>(
    () => (sources === 1 ? [[0, 0]] : [[-sep / 2, 0], [sep / 2, 0]]),
    [sources, sep],
  );

  // prędkość fali stała → długość fali λ = v / f
  const v = 2.4;
  const k = (2 * Math.PI * freq) / v;
  const omega = 2 * Math.PI * freq;
  const lambda = v / freq;

  useFrame((_, dt) => {
    if (playing) t.current += Math.min(dt, 0.05);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const col = geometry.attributes.color as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      let h = 0;
      let re = 0;
      let im = 0;
      for (const [sx, sy] of srcPos) {
        const r = Math.hypot(x - sx, y - sy);
        const damp = 1 / Math.sqrt(1 + r * 0.6);
        // fala rozchodzi się od źródła – przed czołem fali woda jest spokojna
        const front = Math.min(1, Math.max(0, (v * t.current - r) * 1.5));
        h += amp * damp * front * Math.sin(k * r - omega * t.current);
        re += damp * Math.cos(k * r);
        im += damp * Math.sin(k * r);
      }
      if (mapMode) {
        // amplituda drgań w danym punkcie: |Σ e^{ikr}|
        const A = Math.hypot(re, im) / srcPos.length;
        pos.setZ(i, h * 0.35);
        tmp.copy(NODE).lerp(ANTINODE, Math.min(1, A * 1.4));
      } else {
        pos.setZ(i, h);
        const n = h / (amp * 1.2);
        if (n < 0) tmp.copy(MID).lerp(DEEP, Math.min(1, -n));
        else tmp.copy(MID).lerp(CREST, Math.min(1, n));
      }
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 10, 6]} intensity={1.6} />
      <mesh ref={mesh} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial vertexColors roughness={0.25} metalness={0.1} side={THREE.DoubleSide} />
      </mesh>
      {srcPos.map(([x, y], i) => (
        <group key={i} position={[x, 0.15, -y]}>
          <mesh>
            <sphereGeometry args={[0.14, 24, 24]} />
            <meshStandardMaterial color="#ff6b8b" emissive="#ff6b8b" emissiveIntensity={0.6} />
          </mesh>
          <Html position={[0, 0.45, 0]} center>
            <div className="label-3d">źródło {srcPos.length > 1 ? i + 1 : ''}</div>
          </Html>
        </group>
      ))}
      <InfoBox
        lines={[
          { text: `λ = ${lambda.toFixed(2).replace('.', ',')} · f = ${freq.toFixed(1).replace('.', ',')} Hz`, color: '#4fc3ff' },
          ...(srcPos.length > 1 ? [{ text: `odległość źródeł d = ${sep.toFixed(1).replace('.', ',')} = ${(sep / lambda).toFixed(1).replace('.', ',')} λ` }] : []),
          ...(mapMode ? [{ text: 'żółty: wzmocnienie · ciemny: wygaszenie' }] : []),
        ]}
      />
    </>
  );
}

const playControl = { type: 'toggle' as const, key: 'play', label: 'Animacja', default: true };

export const interference: Topic = {
  id: 'fale-i-interferencja',
  title: 'Fale na wodzie i interferencja',
  subject: 'fizyka',
  summary: 'Wrzuć kamień do wody, a potem dwa. Zobacz, jak fale się wzmacniają i wygaszają.',
  accent: '#1fb5c9',
  glyph: '🌊',
  steps: [
    {
      title: 'Fala kolista',
      kind: '3d',
      scene: WaterScene,
      camera: [0, 8, 11],
      preset: { sources: 1 },
      controls: [
        { type: 'slider', key: 'freq', label: 'Częstotliwość f', min: 0.4, max: 2.5, step: 0.1, default: 1, unit: 'Hz' },
        { type: 'slider', key: 'amp', label: 'Amplituda', min: 0.1, max: 0.6, step: 0.01, default: 0.35 },
        playControl,
      ],
      body: (
        <>
          <p>
            Drgające źródło wysyła w każdą stronę <strong>falę kolistą</strong>. Woda nie płynie razem z falą –
            każdy jej fragment tylko podnosi się i opada.
          </p>
          <p>
            Odległość między kolejnymi grzbietami to <strong>długość fali λ</strong>. Prędkość fali w danym ośrodku jest
            stała, więc:
          </p>
          <div className="formula">v = λ · f</div>
          <p>Zwiększ częstotliwość i zobacz, jak grzbiety zbliżają się do siebie.</p>
        </>
      ),
    },
    {
      title: 'Dwa źródła – interferencja',
      kind: '3d',
      scene: WaterScene,
      camera: [0, 9, 10],
      preset: { sources: 2 },
      controls: [
        { type: 'slider', key: 'sep', label: 'Odległość źródeł d', min: 1, max: 6, step: 0.1, default: 3 },
        { type: 'slider', key: 'freq', label: 'Częstotliwość f', min: 0.4, max: 2.5, step: 0.1, default: 1.2, unit: 'Hz' },
        playControl,
      ],
      body: (
        <>
          <p>
            Gdy spotykają się dwie fale, ich wychylenia się <strong>sumują</strong>. To zasada superpozycji.
          </p>
          <p>
            Tam, gdzie grzbiet spotyka grzbiet, fala się <strong>wzmacnia</strong>. Tam, gdzie grzbiet spotyka dolinę –{' '}
            <strong>wygasza</strong> i woda pozostaje prawie nieruchoma.
          </p>
          <p>Poszukaj na powierzchni promienistych pasów spokojnej wody rozchodzących się od źródeł.</p>
        </>
      ),
    },
    {
      title: 'Mapa wzmocnień i wygaszeń',
      kind: '3d',
      scene: WaterScene,
      camera: [0, 14, 3],
      preset: { sources: 2 },
      controls: [
        {
          type: 'select',
          key: 'view',
          label: 'Widok',
          default: 'map',
          options: [
            { value: 'map', label: 'Mapa amplitudy' },
            { value: 'surface', label: 'Powierzchnia' },
          ],
        },
        { type: 'slider', key: 'sep', label: 'Odległość źródeł d', min: 1, max: 6, step: 0.1, default: 4 },
        { type: 'slider', key: 'freq', label: 'Częstotliwość f', min: 0.4, max: 2.5, step: 0.1, default: 1.2, unit: 'Hz' },
        playControl,
      ],
      body: (
        <>
          <p>
            Kolor pokazuje, jak mocno drga woda w danym miejscu: <strong>żółty</strong> – silne wzmocnienie, ciemny –
            wygaszenie (<strong>linie węzłowe</strong>).
          </p>
          <p>Wzmocnienie występuje, gdy różnica dróg od obu źródeł jest wielokrotnością długości fali:</p>
          <div className="formula">|r₁ − r₂| = n · λ</div>
          <p>
            Zwiększ odległość źródeł albo częstotliwość – linii węzłowych przybywa. Ten sam efekt w świetle pokazuje
            słynne doświadczenie Younga z dwiema szczelinami.
          </p>
        </>
      ),
    },
  ],
};
