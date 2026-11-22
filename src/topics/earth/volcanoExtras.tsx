/*
 * Wulkan – elementy dodatkowe sceny: gablota z próbkami skał i tefry, makiety tektoniki (wnętrze Ziemi, subdukcja,
 * grzbiet śródoceaniczny, plama gorąca), przyrządy obserwacyjne, gejzer i elektrownia geotermalna, wioska, samolot
 * w chmurze popiołu i sześcian objętości z erupcji w skali VEI.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { InfoPortal, Sparkline } from '../../lib/plot';
import { Arrow3D } from '../../lib/three';
import { Lbl, MiniPlane } from '../aviation/airliner';
import { clamp, fbm, hex, mix, rockH, sm, vnoise, type RGB } from './volcanoGeo';
import { Puffs, rnd, type PuffSys, type V3 } from './volcanoFx';

/* ================= gablota z próbkami ================= */

/** Położenie gabloty (z dala od wulkanu – kamera tam przelatuje). */
export const SPEC: V3 = [-210, 0, 70];

type SampleKind = 'ash' | 'lapilli' | 'bomb' | 'block' | 'pumice' | 'scoria' | 'obsidian' | 'basalt' | 'andesite' | 'rhyolite' | 'tuff' | 'pele' | 'pahoehoe' | 'aa' | 'sulfur';
export interface Sample {
  id: SampleKind;
  name: string;
  desc: string;
  /** Położenie na stole (x, z względem środka gabloty). */
  at: [number, number];
}
export const SAMPLES: Sample[] = [
  { id: 'ash', name: 'popiół wulkaniczny', at: [-6, -1.2], desc: 'Drobinki skały i szkła wulkanicznego mniejsze niż 2 mm – nie ma w nim nic spalonego, to nie popiół z ogniska. Powstaje, gdy gaz rozrywa gęstą magmę na drobny pył. Jest ostry jak tłuczone szkło: rani płuca, ściera szyby i topi się w silnikach samolotów.' },
  { id: 'lapilli', name: 'lapille', at: [-3.6, -1.2], desc: 'Okruchy od 2 do 64 mm – wielkości od ziarnka grochu do orzecha włoskiego (po włosku lapilli to „kamyczki”). Spadają z kolumny erupcyjnej jak grad, czasem na odległość kilkudziesięciu kilometrów.' },
  { id: 'bomb', name: 'bomba wulkaniczna', at: [-1.2, -1.2], desc: 'Kawał lawy większy niż 64 mm, wyrzucony jeszcze w stanie ciekłym. Wirując w locie, przybiera kształt wrzeciona ze skręconymi końcami. Gdy jej wnętrze wciąż się rozszerza, skórka pęka jak skórka chleba. Bomby mogą ważyć wiele ton i spadać kilka kilometrów od krateru.' },
  { id: 'block', name: 'blok', at: [1.2, -1.2], desc: 'Kanciasty odłamek większy niż 64 mm, wyrzucony jako stała skała – kawałek starego czopu albo ściany krateru, rozbity wybuchem. Od bomby różni się ostrymi krawędziami: nie był płynny w locie.' },
  { id: 'pumice', name: 'pumeks', at: [3.6, -1.2], desc: 'Zastygła piana z gęstej, bogatej w gaz magmy. Pęcherzyki zajmują do 90% objętości, więc pumeks unosi się na wodzie. Po wielkich erupcjach podmorskich na oceanie pływają tratwy pumeksu ciągnące się przez setki kilometrów.' },
  { id: 'scoria', name: 'żużel wulkaniczny', at: [6, -1.2], desc: 'Ciemny, dziurawy okruch bazaltowej lawy – cięższy od pumeksu, bo pęcherzyków jest mniej i są większe. Z żużla zbudowane są stożki żużlowe. Czerwony kolor to rdza – utlenione żelazo.' },
  { id: 'obsidian', name: 'obsydian', at: [-6, 1.3], desc: 'Naturalne szkło wulkaniczne. Powstaje z gęstej lawy ryolitowej, która ostygła tak szybko, że nie zdążyły wyrosnąć kryształy. Pęka muszlowo, na krawędzie ostrzejsze od skalpela – w epoce kamienia robiono z niego noże i groty.' },
  { id: 'basalt', name: 'bazalt', at: [-3.6, 1.3], desc: 'Najczęstsza skała wulkaniczna na Ziemi: ciemna, drobnoziarnista, uboga w krzemionkę (ok. 50%). Zbudowane są z niej dna oceanów, Hawaje i Islandia. Stygnąc powoli, tworzy sześcioboczne słupy, jak na Grobli Olbrzyma.' },
  { id: 'andesite', name: 'andezyt', at: [-1.2, 1.3], desc: 'Szara skała z wulkanów nad strefami subdukcji – nazwa pochodzi od Andów. Ma ok. 60% krzemionki. W drobnym tle widać większe kryształy, które urosły jeszcze w komorze magmowej.' },
  { id: 'rhyolite', name: 'ryolit', at: [1.2, 1.3], desc: 'Jasna, często różowawa skała z najgęstszej magmy (ponad 70% krzemionki). Taka magma wybucha najgwałtowniej. Smugi w ryolicie to ślady płynięcia lepkiej lawy.' },
  { id: 'tuff', name: 'tuf', at: [3.6, 1.3], desc: 'Skała ze sprasowanego popiołu. Gorący popiół z przepływu piroklastycznego potrafi zespawać się w twardy kamień. Tuf łatwo się obrabia – w Kapadocji wykuwano w nim całe podziemne miasta.' },
  { id: 'pele', name: 'włosy i łzy Pele', at: [6, 1.3], desc: 'Fontanna rzadkiej lawy rozciąga krople w cieniutkie, złociste nitki szkła – „włosy Pele” (od hawajskiej bogini wulkanów). Krople, które zastygły w locie, to czarne „łzy Pele”.' },
  { id: 'pahoehoe', name: 'lawa pahoehoe', at: [-4.8, 3.6], desc: 'Lawa o gładkiej, pomarszczonej skórce – po hawajsku „gładka”. Płynie powoli, a jej zastygająca skórka marszczy się w sznury. Rzadka, gorąca lawa bazaltowa (ok. 1150 °C).' },
  { id: 'aa', name: 'lawa aa', at: [-1.2, 3.6], desc: 'Ta sama lawa bazaltowa, ale chłodniejsza i szybsza: jej skórka rwie się na ostre, kolczaste okruchy (żużel). Po hawajsku „aʻā” – podobno okrzyk bólu kogoś, kto szedł po niej boso.' },
  { id: 'sulfur', name: 'siarka', at: [2.6, 3.6], desc: 'Żółte kryształy osadzające się wokół fumaroli – otworów, z których uchodzą gorące gazy. Gaz z siarką stygnie na powietrzu i zostawia kryształy. Na wulkanie Ijen w Indonezji górnicy wynoszą ją w koszach.' },
];

/** Bryła próbki: zniekształcona kula z kolorami wierzchołków. */
function rockGeo(kind: SampleKind): THREE.BufferGeometry {
  const detail = kind === 'obsidian' ? 2 : 5;
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position');
  const col: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n1 = fbm(v.x * 2 + 3, v.y * 2 + v.z * 1.7, 4);
    const nh = vnoise(v.x * 9 + v.z * 3, v.y * 9 - v.z * 5);
    let r = 1 + 0.18 * n1;
    let c: RGB = hex('#555');
    switch (kind) {
      case 'bomb': {
        // wrzeciono ze skręconymi końcami i spękaną skórką „chlebową”
        const x = v.x;
        const taper = Math.max(0.12, 1 - x * x * 0.85);
        v.set(x * 1.9, v.y * taper, v.z * taper);
        const tw = Math.atan2(v.z, v.y) + x * 3;
        r = 1 + 0.05 * Math.sin(tw * 3) + 0.08 * n1;
        const crack = Math.abs(fbm(v.x * 3, v.y * 4 + v.z * 4) ) < 0.04;
        c = crack ? hex('#7a2a18') : mixRGB(hex('#3a302c'), hex('#5a4a40'), nh);
        break;
      }
      case 'block':
        r = 1 + 0.12 * n1;
        c = mixRGB(hex('#6e6862'), hex('#8a837c'), nh);
        break;
      case 'pumice':
        r = 1 + 0.12 * n1 - (nh > 0.68 ? 0.07 : 0);
        c = nh > 0.68 ? hex('#a59a86') : mixRGB(hex('#e2d9c4'), hex('#cfc4ad'), n1 + 0.5);
        break;
      case 'scoria':
        r = 1 + 0.2 * n1 - (nh > 0.6 ? 0.1 : 0);
        c = nh > 0.6 ? hex('#1a1210') : mixRGB(hex('#4a2a22'), hex('#7a3a26'), n1 + 0.5);
        break;
      case 'obsidian':
        r = 1 + 0.25 * n1;
        c = hex('#0e0d10');
        break;
      case 'basalt':
        c = mixRGB(hex('#2f2f33'), hex('#3b3b40'), nh);
        break;
      case 'andesite':
        c = nh > 0.8 ? hex('#e6e2dc') : mixRGB(hex('#6c6c6e'), hex('#7c7b7c'), n1 + 0.5);
        break;
      case 'rhyolite': {
        const band = Math.sin(v.y * 14 + n1 * 6);
        c = mixRGB(hex('#d8a8a0'), hex('#b98378'), band * 0.5 + 0.5);
        break;
      }
      case 'tuff':
        c = nh > 0.78 ? hex('#6a5a4a') : mixRGB(hex('#d9cbb0'), hex('#c8b898'), n1 + 0.5);
        break;
      case 'aa':
        r = 1 + 0.35 * Math.abs(fbm(v.x * 4, v.y * 4 + v.z * 3, 3)) + 0.1 * n1;
        c = mixRGB(hex('#3a2620'), hex('#6a3a28'), nh);
        break;
      default:
        c = mixRGB(hex('#555'), hex('#666'), nh);
    }
    v.multiplyScalar(r);
    p.setXYZ(i, v.x, v.y, v.z);
    col.push(c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], clamp(t)), mix(a[1], b[1], clamp(t)), mix(a[2], b[2], clamp(t))];

/** Płyta lawy sznurowej (pahoehoe). */
function pahoehoeGeo() {
  const g = new THREE.PlaneGeometry(2.6, 1.8, 90, 60);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  const col: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    // łukowate „sznury” – zmarszczki skórki wygięte w kierunku płynięcia
    const arc = x + 0.35 * (z * z);
    const rope = Math.sin(arc * 16) * 0.05 * sm(1.3, 0.6, Math.abs(z) * 1.2);
    const edge = sm(1.3, 1.0, Math.abs(x)) * sm(0.9, 0.65, Math.abs(z));
    p.setY(i, (0.25 + rope + 0.05 * fbm(x * 3, z * 3)) * edge);
    const c = mixRGB(hex('#2a292c'), hex('#5a585c'), 0.5 + rope * 8);
    col.push(c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function SampleMesh({ s }: { s: Sample }) {
  const geo = useMemo(() => (s.id === 'pahoehoe' ? pahoehoeGeo() : ['ash', 'lapilli', 'pele', 'sulfur'].includes(s.id) ? null : rockGeo(s.id)), [s.id]);
  const grains = useMemo(() => {
    if (s.id !== 'ash' && s.id !== 'lapilli') return null;
    const n = s.id === 'ash' ? 1600 : 160;
    const m = new THREE.Matrix4();
    const out: THREE.Matrix4[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.85;
      const h = (1 - r / 0.85) * (s.id === 'ash' ? 0.35 : 0.45) * Math.random();
      const sz = s.id === 'ash' ? rnd(0.015, 0.03) : rnd(0.05, 0.11);
      m.compose(new THREE.Vector3(Math.cos(a) * r, 0.08 + h, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), 0)), new THREE.Vector3(sz, sz * rnd(0.6, 1), sz));
      out.push(m.clone());
    }
    return out;
  }, [s.id]);
  const hair = useMemo(() => {
    if (s.id !== 'pele') return null;
    return Array.from({ length: 22 }, () => {
      const pts: V3[] = [];
      let x = rnd(-0.6, 0.6);
      let y = 0.1;
      let z = rnd(-0.5, 0.5);
      const dx = rnd(-0.06, 0.06);
      const dz = rnd(-0.06, 0.06);
      for (let k = 0; k < 14; k++) {
        pts.push([x, y, z]);
        x += dx + rnd(-0.02, 0.02);
        y += rnd(0.0, 0.03);
        z += dz + rnd(-0.02, 0.02);
      }
      return pts;
    });
  }, [s.id]);
  const scale = s.id === 'bomb' ? 0.42 : s.id === 'pahoehoe' ? 0.8 : 0.45;
  if (s.id === 'ash' || s.id === 'lapilli')
    return (
      <group>
        <mesh>
          <cylinderGeometry args={[0.95, 0.8, 0.12, 40]} />
          <meshStandardMaterial color="#e8e4dc" roughness={0.5} />
        </mesh>
        <Grains mats={grains!} color={s.id === 'ash' ? '#7a7672' : '#4e4744'} />
      </group>
    );
  if (s.id === 'pele')
    return (
      <group>
        {hair!.map((pts, i) => (
          <Line key={i} points={pts} color="#d9b35a" lineWidth={1.2} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[-0.5 + i * 0.25, 0.08, 0.6]} scale={[0.06, 0.06, 0.1]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#111" roughness={0.1} metalness={0.3} />
          </mesh>
        ))}
      </group>
    );
  if (s.id === 'sulfur')
    return (
      <group>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} position={[Math.cos(i * 2.4) * 0.35 * (i % 3), 0.25 + (i % 2) * 0.1, Math.sin(i * 2.4) * 0.35 * (i % 3)]} rotation={[i, i * 0.7, 0]} scale={0.18 + (i % 3) * 0.06}>
            <octahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#e8d23a" roughness={0.35} emissive="#3a3000" />
          </mesh>
        ))}
      </group>
    );
  if (s.id === 'pumice')
    // pumeks pływa w szklance wody
    return (
      <group>
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.95, 0.85, 1.5, 40, 1, true]} />
          <meshStandardMaterial color="#cfe6f5" transparent opacity={0.25} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.92, 0.84, 1.15, 40]} />
          <meshStandardMaterial color="#4a9ad0" transparent opacity={0.35} roughness={0.05} depthWrite={false} />
        </mesh>
        <Bob>
          <mesh geometry={geo!} scale={0.42} position={[0, 1.18, 0]}>
            <meshStandardMaterial vertexColors roughness={1} />
          </mesh>
        </Bob>
      </group>
    );
  const glossy = s.id === 'obsidian';
  return (
    <mesh geometry={geo!} scale={scale} position={[0, s.id === 'pahoehoe' ? 0 : 0.4, 0]} rotation={[0, s.id === 'bomb' ? 0.6 : 0, s.id === 'bomb' ? 0.15 : 0]}>
      <meshStandardMaterial vertexColors roughness={glossy ? 0.06 : s.id === 'pahoehoe' ? 0.35 : 0.95} metalness={glossy ? 0.35 : 0.05} flatShading={glossy} />
    </mesh>
  );
}
function Bob({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((st) => {
    if (g.current) {
      g.current.position.y = 0.03 * Math.sin(st.clock.elapsedTime * 1.6);
      g.current.rotation.z = 0.05 * Math.sin(st.clock.elapsedTime * 1.1);
    }
  });
  return <group ref={g}>{children}</group>;
}
function Grains({ mats, color }: { mats: THREE.Matrix4[]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useMemo(() => {
    queueMicrotask(() => {
      const I = ref.current;
      if (!I) return;
      mats.forEach((m, i) => I.setMatrixAt(i, m));
      I.instanceMatrix.needsUpdate = true;
    });
  }, [mats]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, mats.length]}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </instancedMesh>
  );
}

/** Gablota: stół z próbkami, podpisy (klikalne na stronie głównej modułu). */
export function Samples({ interactive }: { interactive: boolean }) {
  const [sel, setSel] = useState<SampleKind | null>(null);
  const cur = SAMPLES.find((s) => s.id === sel);
  return (
    <group position={SPEC}>
      {/* stół z blatem z ciemnego drewna */}
      <mesh position={[0, 0.9, 1.2]}>
        <boxGeometry args={[15.5, 0.25, 7.6]} />
        <meshStandardMaterial color="#5a3d2a" roughness={0.6} />
      </mesh>
      {[-7, 7].flatMap((x) => [-2, 4.4].map((z) => [x, z])).map(([x, z], i) => (
        <mesh key={i} position={[x, 0.4, z]}>
          <boxGeometry args={[0.3, 0.8, 0.3]} />
          <meshStandardMaterial color="#3e2a1d" />
        </mesh>
      ))}
      {/* linijka do porównania wielkości: 2 mm i 64 mm – granice popiołu, lapilli i bomb */}
      <mesh position={[0, 1.04, -2.3]}>
        <boxGeometry args={[12, 0.03, 0.3]} />
        <meshStandardMaterial color="#e9d9a8" />
      </mesh>
      {SAMPLES.map((s) => (
        <group key={s.id} position={[s.at[0], 1.03, s.at[1]]}>
          <SampleMesh s={s} />
          <Lbl pos={[0, s.id === 'pahoehoe' ? 0.9 : 1.3, 0]} active={sel === s.id} onClick={interactive ? () => setSel(sel === s.id ? null : s.id) : undefined}>
            {s.name}
          </Lbl>
        </group>
      ))}
      {interactive && (
        <InfoPortal>
          {cur ? (
            <>
              <div style={{ fontWeight: 700, color: '#ffb35c' }}>{cur.name}</div>
              <div>{cur.desc}</div>
            </>
          ) : (
            <div>Kliknij podpis próbki, żeby dowiedzieć się, skąd się wzięła.</div>
          )}
        </InfoPortal>
      )}
    </group>
  );
}

/* ================= tektonika ================= */

/** Położenie makiety tektoniki (nad równiną, na postumencie). */
export const TEC: V3 = [230, 26, -30];
const shapeOf = (pts: [number, number][]) => {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
};
function Slab({ pts, color, depth = 30, z = 0, opacity = 1 }: { pts: [number, number][]; color: string; depth?: number; z?: number; opacity?: number }) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(shapeOf(pts), { depth, bevelEnabled: false, curveSegments: 1 }), [pts, depth]);
  return (
    <mesh geometry={geo} position={[0, 0, -depth / 2 + z]}>
      <meshStandardMaterial color={color} roughness={0.85} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
    </mesh>
  );
}
/** Krzywa: od (x0, y0) poziomo, potem zagina się w dół (płyta wchodząca pod drugą). */
const slabCurve = (t: number): [number, number] => {
  const x = -55 + t * 95;
  const bend = Math.max(0, x + 8);
  return [x, -3 - 0.028 * bend * bend];
};

/** Płyty w ruchu: znaczniki przesuwające się po powierzchni płyty (`path` – parametr 0…1 → punkt). */
function Movers({ path, n, speed, color, z0 = -14, z1 = 14, size = 0.6 }: { path: (u: number) => V3; n: number; speed: number; color: string; z0?: number; z1?: number; size?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05) * speed;
    const I = ref.current;
    if (!I) return;
    let k = 0;
    for (let i = 0; i < n; i++)
      for (const z of [z0, (z0 + z1) / 2, z1]) {
        const u = (i / n + t.current) % 1;
        const p = path(u);
        m.makeScale(size, size * 0.3, size);
        m.setPosition(p[0], p[1] + 0.2, z);
        I.setMatrixAt(k++, m);
      }
    I.count = k;
    I.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n * 3]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} />
    </instancedMesh>
  );
}

/** Wznoszące się krople stopionej skały (`from` → `to`, rozrzut). */
function Rising({ from, to, n = 18, color = '#ff6a1a', speed = 0.12, spread = 2 }: { from: V3; to: V3; n?: number; color?: string; speed?: number; spread?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const seeds = useMemo(() => Array.from({ length: n }, () => [Math.random(), rnd(-1, 1), rnd(-1, 1), rnd(0.5, 1)]), [n]);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05) * speed;
    const I = ref.current;
    if (!I) return;
    seeds.forEach(([ph, a, b, s], i) => {
      const u = (ph + t.current) % 1;
      const r = (0.5 + 0.6 * s) * (1 - 0.4 * u);
      m.makeScale(r, r * 1.3, r);
      m.setPosition(mix(from[0], to[0], u) + a * spread * (1 - u), mix(from[1], to[1], u), mix(from[2], to[2], u) + b * spread);
      I.setMatrixAt(i, m);
    });
    I.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]}>
      <sphereGeometry args={[1, 12, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
}

function Cone({ p, h, r, color = '#5a4a42', glow = false }: { p: V3; h: number; r: number; color?: string; glow?: boolean }) {
  return (
    <group position={p}>
      <mesh position={[0, h / 2, 0]}>
        <coneGeometry args={[r, h, 24]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {glow && (
        <mesh position={[0, h + 0.05, 0]}>
          <sphereGeometry args={[r * 0.18, 12, 8]} />
          <meshBasicMaterial color="#ff8a1f" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Wnętrze Ziemi: kula z wyciętą ćwiartką. */
function EarthLayers() {
  const layers: [number, string, string][] = [
    [20, '#7a6a52', 'skorupa'],
    [19.6, '#d0582a', 'płaszcz'],
    [10.9, '#f0a030', 'jądro zewnętrzne'],
    [3.8, '#fff0b0', 'jądro wewnętrzne'],
  ];
  const planes = useMemo(() => [new THREE.Plane(new THREE.Vector3(-1, 0, 0), TEC[0]), new THREE.Plane(new THREE.Vector3(0, 0, -1), TEC[2])], []);
  return (
    <group>
      {layers.map(([r, c], i) => (
        <group key={i}>
          <mesh position={TEC}>
            <sphereGeometry args={[r, 64, 48]} />
            <meshStandardMaterial color={i === 0 ? '#3f6f9e' : c} roughness={0.8} clippingPlanes={planes} clipIntersection side={THREE.DoubleSide} />
          </mesh>
          {/* przekroje na obu płaszczyznach cięcia */}
          <mesh position={[TEC[0], TEC[1], TEC[2] + 0.02 * (i + 1)]}>
            <circleGeometry args={[r, 64, -Math.PI / 2, Math.PI]} />
            <meshBasicMaterial color={c} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[TEC[0] + 0.02 * (i + 1), TEC[1], TEC[2]]} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[r, 64, -Math.PI / 2, Math.PI]} />
            <meshBasicMaterial color={c} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Makiety tektoniki: wnętrze Ziemi, subdukcja, grzbiet śródoceaniczny, plama gorąca. */
export function Tectonics({ mode }: { mode: string }) {
  if (mode === 'tec-layers') return <EarthLayers />;
  return (
    <group position={TEC}>
      {/* postument */}
      <mesh position={[0, -48, 0]}>
        <boxGeometry args={[114, 6, 34]} />
        <meshStandardMaterial color="#3a3530" />
      </mesh>
      {mode === 'tec-sub' && <Subduction />}
      {mode === 'tec-ridge' && <Ridge />}
      {mode === 'tec-hot' && <Hotspot />}
    </group>
  );
}

function Mantle() {
  return <Slab pts={[[-56, -44], [56, -44], [56, -10], [-56, -10]]} color="#c0643a" depth={29.6} />;
}
function Ocean({ x0, x1, y0 = -3 }: { x0: number; x1: number; y0?: number }) {
  return <Slab pts={[[x0, y0], [x1, y0], [x1, 0], [x0, 0]]} color="#3d7fbf" opacity={0.55} depth={30.2} />;
}

function Subduction() {
  const top = useMemo(() => Array.from({ length: 40 }, (_, i) => slabCurve(i / 39)), []);
  const slab = useMemo<[number, number][]>(() => [...top, ...top.slice().reverse().map(([x, y]) => [x + 1.2, y - 5] as [number, number])], [top]);
  const cont: [number, number][] = [[-6, -2.4], [-2, 0], [8, 2.5], [14, 4.5], [22, 3.5], [56, 2], [56, -16], [10, -16], [0, -9]];
  return (
    <>
      <Mantle />
      <Slab pts={slab} color="#3b4a5c" depth={30.4} />
      <Slab pts={cont} color="#8a7055" depth={30.4} />
      <Ocean x0={-56} x1={-4} />
      {[-8, 0, 8].map((z) => (
        <Cone key={z} p={[16 + z * 0.15, 3.8, z]} h={5} r={3} glow={z === 0} />
      ))}
      <Rising from={[22, -27, 0]} to={[16, 2, 0]} n={22} spread={3} />
      <Movers path={(u) => [...slabCurve(u * 0.85), 0] as unknown as V3} n={12} speed={0.03} color="#a8c0d8" />
      <Arrow3D from={[-40, 3, 16]} vec={[12, 0, 0]} color="#7cc7ff" radius={0.5} />
      <Arrow3D from={[44, 7, 16]} vec={[-8, 0, 0]} color="#e8c58a" radius={0.5} />
      <Lbl pos={[-35, 2, 15]}>płyta oceaniczna (cięższa)</Lbl>
      <Lbl pos={[38, 6, 15]}>płyta kontynentalna (lżejsza)</Lbl>
      <Lbl pos={[-6, -6, 15]}>rów oceaniczny</Lbl>
      <Lbl pos={[24, -22, 15]} color="#ffb35c">płyta oddaje wodę – skały płaszcza topnieją</Lbl>
      <Lbl pos={[16, 11, 0]}>łuk wulkanów (np. Andy, Japonia)</Lbl>
      <Lbl pos={[-30, -30, 15]}>płaszcz Ziemi</Lbl>
    </>
  );
}

function Ridge() {
  // dwie płyty rozsuwają się od grzbietu; pasy na dnie – zapis odwracania się pola magnetycznego
  const plate = (s: number): [number, number][] => [[s * 1.2, -1.5], [s * 56, -4], [s * 56, -12], [s * 1.2, -4]];
  return (
    <>
      <Mantle />
      <Slab pts={plate(1)} color="#3b4a5c" depth={30.4} />
      <Slab pts={plate(-1)} color="#3b4a5c" depth={30.4} />
      <Ocean x0={-56} x1={56} y0={-4} />
      <Movers path={(u) => [1.5 + u * 50, -1.5 - u * 2.5 + 0.05, 0]} n={10} speed={0.03} color="#e8e8e8" />
      <Movers path={(u) => [-1.5 - u * 50, -1.5 - u * 2.5 + 0.05, 0]} n={10} speed={0.03} color="#e8e8e8" />
      <Rising from={[0, -40, 0]} to={[0, -2.5, 0]} n={26} spread={6} speed={0.08} />
      <Cone p={[0, -2.2, -8]} h={4} r={2.4} glow />
      <Arrow3D from={[6, 2, 16]} vec={[12, 0, 0]} color="#7cc7ff" radius={0.5} />
      <Arrow3D from={[-6, 2, 16]} vec={[-12, 0, 0]} color="#7cc7ff" radius={0.5} />
      <Lbl pos={[0, 4, 0]}>grzbiet śródoceaniczny (np. Islandia)</Lbl>
      <Lbl pos={[0, -22, 15]} color="#ffb35c">gorący płaszcz wznosi się i topnieje</Lbl>
      <Lbl pos={[30, 1, 15]}>nowe dno oceanu odsuwa się na boki</Lbl>
    </>
  );
}

function Hotspot() {
  const t = useRef(0);
  const g = useRef<THREE.Group>(null);
  const [cycle, setCycle] = useState(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    const u = (t.current / 24) % 1;
    if (g.current) g.current.position.x = -u * 14;
    const c = Math.floor(t.current / 24);
    if (c !== cycle) setCycle(c);
  });
  // łańcuch wysp: im dalej od plamy, tym starsze, niższe i bardziej zatopione
  const islands = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 30 - i * 14, h: Math.max(1.5, 13 - i * 2.8), r: 6.5 - i * 0.6, age: ['dziś', '1 mln lat', '2 mln lat', '4 mln lat', '6 mln lat', '10 mln lat'][i] }));
  return (
    <>
      <Mantle />
      <Ocean x0={-56} x1={56} y0={-6} />
      <group ref={g}>
        <Slab pts={[[-70, -6], [70, -6], [70, -12], [-70, -12]]} color="#3b4a5c" depth={30.4} />
        {islands.map((s, i) => (
          <group key={i}>
            <Cone p={[s.x, -6, 0]} h={s.h} r={s.r} color={i === 0 ? '#3a3236' : i < 3 ? '#4d5a3e' : '#5a5048'} glow={i === 0} />
            {i < 4 && <Lbl pos={[s.x, -6 + s.h + 2.2, 0]}>{s.age}</Lbl>}
          </group>
        ))}
      </group>
      {/* pióropusz płaszcza – stoi w miejscu, płyta przesuwa się nad nim */}
      <mesh position={[30, -26, 0]}>
        <cylinderGeometry args={[3.5, 7, 34, 24, 1, true]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.55} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Rising from={[30, -42, 0]} to={[30, -6, 0]} n={20} spread={2.5} speed={0.1} />
      <Arrow3D from={[0, 9, 16]} vec={[-14, 0, 0]} color="#7cc7ff" radius={0.5} />
      <Lbl pos={[30, -32, 12]} color="#ffb35c">plama gorąca – pióropusz z głębi płaszcza</Lbl>
      <Lbl pos={[-6, 11, 16]}>płyta pacyficzna sunie ok. 8 cm/rok</Lbl>
    </>
  );
}

/* ================= obserwacja wulkanu ================= */

/** Stacje: [x, z, rodzaj]. */
export const MON_STATIONS: [number, number, 'seis' | 'gps' | 'gas' | 'cam'][] = [
  [-14, -12, 'seis'],
  [12, -16, 'gps'],
  [-26, -20, 'gps'],
  [4, -6, 'gas'],
  [24, -30, 'seis'],
  [-8, -30, 'cam'],
  [-34, -6, 'seis'],
  [30, -12, 'gps'],
];
const STATION_NAME = { seis: 'sejsmometr', gps: 'odbiornik GPS', gas: 'czujnik gazów', cam: 'kamera termowizyjna' };

/** Przyrządy na zboczach i ich odczyty. `shape()` – wypiętrzenie (0…1,3). */
export function Instruments({ mode, shape }: { mode: string; shape: () => number }) {
  const [, force] = useState(0);
  const hist = useRef<number[]>([]);
  const tilt = useRef<number[]>([]);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.05);
    const k = shape();
    // sejsmogram: szum tła + coraz częstsze i silniejsze wstrząsy
    const quake = Math.random() < 0.02 + 0.25 * k ? rnd(0.3, 1) * (0.3 + k) : 0;
    hist.current.push(rnd(-0.05, 0.05) + (Math.random() < 0.5 ? quake : -quake));
    if (hist.current.length > 160) hist.current.shift();
    if (Math.floor(t.current * 4) !== Math.floor((t.current - dt) * 4)) {
      tilt.current.push(k * 10);
      if (tilt.current.length > 60) tilt.current.shift();
      force((x) => x + 1);
    }
  });
  const k = shape();
  const alert = k < 0.2 ? 0 : k < 0.6 ? 1 : k < 0.95 ? 2 : 3;
  const AL = [
    ['ZIELONY', '#3ee36b', 'wulkan spokojny'],
    ['ŻÓŁTY', '#facc15', 'niepokój – więcej wstrząsów i gazów'],
    ['POMARAŃCZOWY', '#fb923c', 'erupcja możliwa w ciągu dni'],
    ['CZERWONY', '#ef4444', 'erupcja trwa albo jest tuż-tuż'],
  ][alert];
  return (
    <>
      {MON_STATIONS.map(([x, z, kind], i) => {
        const y = rockH('strato', x, z) + k * 2.2 * Math.exp(-((Math.hypot(x, z) / 20) ** 2));
        const out: V3 = [x / (Math.hypot(x, z) || 1), 0.4, z / (Math.hypot(x, z) || 1)];
        return (
          <group key={i}>
            <group position={[x, y, z]}>
              {kind === 'gps' ? (
                <>
                  {[0, 2.1, 4.2].map((a) => (
                    <mesh key={a} position={[Math.cos(a) * 0.25, 0.4, Math.sin(a) * 0.25]} rotation={[Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]}>
                      <cylinderGeometry args={[0.04, 0.04, 0.9, 6]} />
                      <meshStandardMaterial color="#c9c9c9" />
                    </mesh>
                  ))}
                  <mesh position={[0, 0.95, 0]}>
                    <sphereGeometry args={[0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    <meshStandardMaterial color="#ffffff" />
                  </mesh>
                </>
              ) : (
                <>
                  <mesh position={[0, 0.3, 0]}>
                    <boxGeometry args={[0.6, 0.6, 0.6]} />
                    <meshStandardMaterial color={kind === 'gas' ? '#e0c040' : kind === 'cam' ? '#3a3a3a' : '#d9d9d9'} />
                  </mesh>
                  <mesh position={[0, 1.2, 0]}>
                    <cylinderGeometry args={[0.04, 0.04, 1.6, 6]} />
                    <meshStandardMaterial color="#888" />
                  </mesh>
                  <mesh position={[0.35, 0.9, 0]} rotation={[0, 0, -0.6]}>
                    <boxGeometry args={[0.6, 0.03, 0.5]} />
                    <meshStandardMaterial color="#1e3a6a" metalness={0.4} roughness={0.3} />
                  </mesh>
                </>
              )}
            </group>
            {kind === 'gps' && mode === 'mon-swell' && k > 0.05 && <Arrow3D from={[x, y + 1.3, z]} vec={[out[0] * k * 6, out[1] * k * 4, out[2] * k * 6]} color="#7cc7ff" radius={0.12} />}
            {i < 4 && mode !== 'mon-home' && <Lbl pos={[x, y + 2.2, z]}>{STATION_NAME[kind]}</Lbl>}
          </group>
        );
      })}
      {mode === 'mon-alert' && <Zones />}
      <InfoPortal>
        {(mode === 'mon-quake' || mode === 'mon-home' || mode === 'mon-alert') && <Sparkline title="sejsmogram" series={[{ data: hist.current, color: '#7cc7ff', label: 'drgania gruntu' }]} min={-1.4} max={1.4} />}
        {mode === 'mon-swell' && <Sparkline title="wypiętrzenie szczytu (cm)" series={[{ data: tilt.current, color: '#ffb35c', label: 'GPS' }]} min={0} max={14} />}
        {mode === 'mon-alert' && (
          <div style={{ fontWeight: 700, color: AL[1] }}>
            Poziom alarmowy: {AL[0]} – {AL[2]}
          </div>
        )}
      </InfoPortal>
    </>
  );
}

/** Strefy zagrożenia narysowane na terenie: czerwona, pomarańczowa, żółta. */
function Zones() {
  const rings = useMemo(
    () =>
      ([
        [12, '#ef4444'],
        [26, '#fb923c'],
        [42, '#facc15'],
      ] as [number, string][]).map(([r, c]) => ({
        c,
        pts: Array.from({ length: 121 }, (_, i) => {
          const a = Math.PI + (i / 120) * Math.PI;
          const x = r * Math.cos(a);
          const z = r * Math.sin(a);
          return [x, rockH('strato', x, z) + 0.4, z] as V3;
        }),
      })),
    [],
  );
  return (
    <>
      {rings.map((r, i) => (
        <Line key={i} points={r.pts} color={r.c} lineWidth={4} />
      ))}
    </>
  );
}

/** Samolot lecący w chmurze popiołu (powiększony, żeby było go widać). */
export function AshPlane() {
  const g = useRef<THREE.Group>(null);
  useFrame((st) => {
    const t = st.clock.elapsedTime * 0.12;
    const a = -t;
    if (g.current) {
      g.current.position.set(20 + Math.cos(a) * 40, 52, -10 + Math.sin(a) * 40);
      g.current.rotation.set(0, -a + Math.PI, 0.25);
    }
  });
  return (
    <group ref={g}>
      <group scale={0.07}>
        <MiniPlane />
      </group>
      <Lbl pos={[0, 3, 0]}>samolot (powiększony)</Lbl>
    </group>
  );
}

/* ================= skala VEI ================= */

/** Sześcian o objętości materiału wyrzuconego w erupcji danej siły (1 km = 10 jednostek). */
export function VeiCube({ vei }: { vei: number }) {
  const km3 = Math.pow(10, vei - 5);
  const side = Math.cbrt(km3) * 10;
  const ref = useRef<THREE.Mesh>(null);
  const cur = useRef(side);
  useFrame((_, dt) => {
    cur.current += (side - cur.current) * Math.min(1, dt * 3);
    if (ref.current) {
      ref.current.scale.setScalar(Math.max(0.05, cur.current));
      ref.current.position.set(52 + cur.current / 2, cur.current / 2, -40 - cur.current / 2);
    }
  });
  return (
    <>
      <mesh ref={ref}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffb35c" transparent opacity={0.55} roughness={0.5} />
      </mesh>
      <Lbl pos={[52 + side / 2, side + 3, -40 - side / 2]} color="#ffd9a8">
        objętość tefry: {km3 >= 1 ? `${km3.toLocaleString('pl-PL')} km³` : `${(km3 * 1e9).toLocaleString('pl-PL', { maximumFractionDigits: 0 })} m³`}
      </Lbl>
    </>
  );
}

/* ================= życie przy wulkanie ================= */

export const GEYSER: [number, number] = [40, -22];
const PLANT: [number, number] = [-42, -12];

/** Gejzer, gorące źródła, pola uprawne, elektrownia geotermalna. */
export function LifeFeatures({ mode }: { mode: string }) {
  const puffs = useRef<PuffSys | null>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const items = useMemo<{ p: V3; v: V3; age: number }[]>(() => [], []);
  const t = useRef(0);
  const [phase, setPhase] = useState('');
  const gy = rockH('strato', GEYSER[0], GEYSER[1]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    t.current += dt;
    const P = puffs.current;
    // gejzer: cykl 14 s – woda w kanale nagrzewa się, aż zawrze i wyrzuci słup wody i pary
    const c = t.current % 14;
    const erupting = c > 9 && c < 13;
    const ph = c < 9 ? 'Woda w kanale gejzeru nagrzewa się pod ciśnieniem' : erupting ? 'Wrzenie! Para wyrzuca słup wody' : 'Kanał napełnia się znowu';
    if (mode === 'life-geyser' && ph !== phase) setPhase(ph);
    if (P) {
      if (Math.random() < dt * 3) P.emit({ p: [GEYSER[0], gy + 0.4, GEYSER[1]], v: [0, 1.5, 0], size: 0.6, grow: 0.6, life: 5, color: [0.95, 0.95, 0.97], alpha: 0.45, lift: 0.3 });
      if (erupting && Math.random() < dt * 14) P.emit({ p: [GEYSER[0], gy + rnd(2, 7), GEYSER[1]], v: [0, rnd(3, 6), 0], size: 1.2, grow: 1.2, life: 6, color: [0.96, 0.97, 0.99], alpha: 0.6, lift: 0.6 });
      // fumarole i chłodnie elektrowni
      if (mode === 'life-springs' && Math.random() < dt * 6) {
        const [x, z] = [[46, -14], [34, -28], [44, -30]][Math.floor(Math.random() * 3)];
        P.emit({ p: [x, rockH('strato', x, z) + 0.3, z], v: [0, 1.2, 0], size: 0.5, grow: 0.7, life: 5, color: [0.92, 0.92, 0.85], alpha: 0.5, lift: 0.3 });
      }
      if (mode === 'life-geo' && Math.random() < dt * 8)
        for (const dx of [-3, 3]) P.emit({ p: [PLANT[0] + dx, 6.5, PLANT[1] - 6], v: [0, 2, 0], size: 1.6, grow: 1.4, life: 7, color: [0.97, 0.97, 0.98], alpha: 0.55, lift: 0.5 });
    }
    if (erupting && mode !== 'life-geo') for (let i = 0; i < 6; i++) items.push({ p: [GEYSER[0] + rnd(-0.15, 0.15), gy + 0.3, GEYSER[1] + rnd(-0.15, 0.15)], v: [rnd(-0.8, 0.8), rnd(11, 15), rnd(-0.8, 0.8)], age: 0 });
    const I = drops.current;
    if (!I) return;
    let k = 0;
    for (const d of items) {
      d.age += dt;
      d.v[1] -= 9 * dt;
      d.p[0] += d.v[0] * dt;
      d.p[1] += d.v[1] * dt;
      d.p[2] += d.v[2] * dt;
      if (d.p[1] < gy) continue;
      m4.makeScale(0.12, 0.2, 0.12);
      m4.setPosition(d.p[0], d.p[1], d.p[2]);
      I.setMatrixAt(k++, m4);
    }
    while (items.length && (items[0].p[1] < gy || items.length > 900)) items.shift();
    I.count = k;
    I.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <Puffs cap={500} sys={puffs} ground={(x, z) => rockH('strato', x, z)} wind={() => [1.5, 0, 0]} />
      <instancedMesh ref={drops} args={[undefined, undefined, 1000]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#cfe8f7" roughness={0.1} transparent opacity={0.85} />
      </instancedMesh>
      {/* gejzer: jeziorko z białą obwódką z gejzerytu */}
      <mesh position={[GEYSER[0], gy + 0.06, GEYSER[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.6, 40]} />
        <meshStandardMaterial color="#e9e3d2" roughness={0.8} />
      </mesh>
      <mesh position={[GEYSER[0], gy + 0.09, GEYSER[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 32]} />
        <meshStandardMaterial color="#2f8fd0" roughness={0.1} />
      </mesh>
      {mode !== 'life-geyser' && <Lbl pos={[GEYSER[0], gy + 4, GEYSER[1]]}>gejzer</Lbl>}
      {mode === 'life-springs' && <Springs />}
      {mode === 'life-soil' && <Fields />}
      {mode === 'life-geo' && <Geothermal />}
      {mode === 'life-geyser' && phase && (
        <InfoPortal>
          <div style={{ fontWeight: 700, color: '#7cc7ff' }}>{phase}</div>
        </InfoPortal>
      )}
    </>
  );
}

function Springs() {
  const pools: [number, number, number, string, string][] = [
    [46, -14, 1.6, '#2f8fd0', 'gorące źródło'],
    [34, -28, 1.2, '#8a6a4a', 'błotne garnki'],
    [44, -30, 0.9, '#d9c443', 'fumarola i siarka'],
  ];
  return (
    <>
      {pools.map(([x, z, r, c, n]) => {
        const y = rockH('strato', x, z);
        return (
          <group key={n}>
            <mesh position={[x, y + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[r * 1.8, 32]} />
              <meshStandardMaterial color="#e07a2a" roughness={0.8} />
            </mesh>
            <mesh position={[x, y + 0.08, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[r, 32]} />
              <meshStandardMaterial color={c} roughness={0.2} />
            </mesh>
            <Lbl pos={[x, y + 2.6, z]}>{n}</Lbl>
          </group>
        );
      })}
    </>
  );
}

/** Pola i winnice na żyznych zboczach, wioska u podnóża. */
function Fields() {
  const patches = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; a: number; c: string }[] = [];
    for (let i = 0; i < 60; i++) {
      const ang = rnd(Math.PI * 1.05, Math.PI * 1.95);
      const r = rnd(24, 44);
      out.push({ x: Math.cos(ang) * r, z: Math.sin(ang) * r, w: rnd(2.5, 5), d: rnd(2, 4), a: ang, c: ['#7d9a3a', '#b9a748', '#5f8a34', '#8aa04a', '#6b7f2a'][i % 5] });
    }
    return out;
  }, []);
  return (
    <>
      {patches.map((p, i) => (
        <mesh key={i} position={[p.x, rockH('strato', p.x, p.z) + 0.12, p.z]} rotation={[-Math.PI / 2, 0, p.a]}>
          <planeGeometry args={[p.w, p.d]} />
          <meshStandardMaterial color={p.c} roughness={1} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      <Village />
      <Lbl pos={[-20, rockH('strato', -20, -28) + 4, -28]}>pola i winnice na żyznym popiele</Lbl>
    </>
  );
}

/** Elektrownia geotermalna: budynki, chłodnie i odwierty sięgające gorących skał (widoczne w przekroju). */
function Geothermal() {
  const [x, z] = PLANT;
  const y = rockH('strato', x, z);
  return (
    <group>
      <mesh position={[x, y + 1.2, z]}>
        <boxGeometry args={[7, 2.4, 4]} />
        <meshStandardMaterial color="#d8dde3" />
      </mesh>
      {[-3, 3].map((dx) => (
        <mesh key={dx} position={[x + dx, y + 2.6, z - 6]}>
          <cylinderGeometry args={[1.6, 2.3, 5.2, 24, 1, true]} />
          <meshStandardMaterial color="#c4cad1" side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* odwierty: przed płaszczyzną przekroju, żeby było je widać na tle gorących skał */}
      {[-2, 2].map((dx, i) => (
        <group key={dx}>
          <mesh position={[x + dx, (y - 16) / 2, 0.4]}>
            <cylinderGeometry args={[0.18, 0.18, y + 16, 8]} />
            <meshStandardMaterial color={i ? '#e05a3a' : '#4a9ad0'} />
          </mesh>
        </group>
      ))}
      <Lbl pos={[x, y + 7, z]}>elektrownia geotermalna</Lbl>
      <Lbl pos={[x + 4, -12, 0.5]} color="#ffb35c">
        gorąca woda z głębi (ok. 250 °C)
      </Lbl>
    </group>
  );
}

/** Wioska u podnóża (na drodze laharu). */
export function Village() {
  const houses = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const a = -1.45 + rnd(-0.35, 0.35);
        const r = rnd(46, 60);
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, rot: rnd(0, 3), s: rnd(0.8, 1.3), roof: i % 3 ? '#b5523a' : '#8a5a3a' };
      }),
    [],
  );
  return (
    <>
      {houses.map((h, i) => {
        const y = rockH('strato', h.x, h.z);
        return (
          <group key={i} position={[h.x, y, h.z]} rotation={[0, h.rot, 0]} scale={h.s}>
            <mesh position={[0, 0.45, 0]}>
              <boxGeometry args={[1.2, 0.9, 0.9]} />
              <meshStandardMaterial color="#e9e2d4" />
            </mesh>
            <mesh position={[0, 1.15, 0]} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[0.95, 0.6, 4]} />
              <meshStandardMaterial color={h.roof} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
