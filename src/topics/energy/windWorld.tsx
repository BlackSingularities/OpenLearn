/*
 * Elektrownia wiatrowa – otoczenie: niebo (dzień, burza, noc), chmury, równina z pasami pól, drogami dojazdowymi
 * i placami montażowymi pod turbinami, lasy, wieś, a w zakładkach morskich – morze z falami i dno.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FARM, FRAME, SUBSTATION, VILLAGE, clamp, fbm, groundH, hash2, mix, rng, sm } from './windGeo';

export type Weather = 'day' | 'storm' | 'night' | 'dusk';

const SKY: Record<Weather, { top: string; hor: string; fog: string }> = {
  day: { top: '#4f86c6', hor: '#d9e6f0', fog: '#cfdde9' },
  dusk: { top: '#3b5a8f', hor: '#f0c9a0', fog: '#d9c3ad' },
  storm: { top: '#56606c', hor: '#a9b1b9', fog: '#9ea7af' },
  night: { top: '#060a18', hor: '#1d2236', fog: '#121626' },
};

/** Niebo: kopuła z gradientem, zawsze wokół kamery; mgła sceny w kolorze horyzontu. */
export function Sky({ weather }: { weather: Weather }) {
  const ref = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const R0 = 2150;
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(R0, 40, 20);
    const p = g.getAttribute('position');
    const col: number[] = [];
    const s = SKY[weather];
    const top = new THREE.Color(s.top);
    const hor = new THREE.Color(s.hor);
    const ground = new THREE.Color(s.fog);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / R0;
      if (y < 0) c.copy(ground);
      else c.copy(hor).lerp(top, clamp(Math.pow(y, 0.6) * 1.15));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [weather]);
  useEffect(() => {
    const prev = scene.fog;
    const s = FRAME.scale;
    scene.fog = new THREE.Fog(SKY[weather].fog, (weather === 'storm' ? 500 : 800) * s, 2250 * s);
    return () => {
      scene.fog = prev;
    };
  }, [scene, weather]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m || !m.parent) return;
    v.copy(camera.position);
    m.parent.worldToLocal(v);
    m.position.copy(v);
  });
  return (
    <mesh ref={ref} geometry={geo} renderOrder={-10} frustumCulled={false}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

/** Gwiazdy (noc). */
export function Stars() {
  const geo = useMemo(() => {
    const r = rng(5);
    const pos: number[] = [];
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2;
      const y = 0.08 + r() * 0.92;
      const rr = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * rr * 2000, y * 2000, Math.sin(a) * rr * 2000);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, []);
  const ref = useRef<THREE.Points>(null);
  const camera = useThree((s) => s.camera);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m || !m.parent) return;
    v.copy(camera.position);
    m.parent.worldToLocal(v);
    m.position.copy(v);
  });
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial color="#ffffff" size={2} sizeAttenuation={false} fog={false} transparent opacity={0.8} />
    </points>
  );
}

/* ================= chmury ================= */

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = rng(9);
  for (let i = 0; i < 26; i++) {
    const x = 128 + (r() - 0.5) * 150;
    const y = 140 + (r() - 0.5) * 50 - Math.abs(x - 128) * 0.15;
    const rad = 30 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let CLOUD_TEX: THREE.Texture | null = null;

export function Clouds({ weather }: { weather: Weather }) {
  const tex = useMemo(() => (CLOUD_TEX ??= cloudTexture()), []);
  const list = useMemo(() => {
    const r = rng(3);
    return Array.from({ length: 16 }, () => {
      const a = r() * Math.PI * 2;
      const d = 700 + r() * 1300;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, y: 650 + r() * 500, s: 500 + r() * 600, sp: 1 + r() * 2 };
    });
  }, []);
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      c.position.x -= list[i].sp * dt * 3;
      if (c.position.x < -2200) c.position.x += 4000;
    });
  });
  const col = weather === 'storm' ? '#8a929b' : weather === 'dusk' ? '#ffd9c0' : '#ffffff';
  return (
    <group ref={ref}>
      {list.map((c, i) => (
        <sprite key={i} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.45, 1]}>
          <spriteMaterial map={tex} color={col} transparent opacity={weather === 'storm' ? 0.95 : 0.85} depthWrite={false} fog={false} />
        </sprite>
      ))}
    </group>
  );
}

/* ================= teren ================= */

const G_HALF = 2400;
const TEX = 2048;
/** Las w punkcie (te same plamy na teksturze i z drzewami 3D). */
export function forestAt(x: number, z: number) {
  for (const [fx, fz] of FARM) if (Math.hypot(x - fx, z - fz) < 140) return false;
  if (Math.hypot(x - VILLAGE[0], z - VILLAGE[2]) < 260) return false;
  if (Math.hypot(x - SUBSTATION[0], z - SUBSTATION[2]) < 120) return false;
  // teren farmy (pola między turbinami) bez lasu
  if (x > -1450 && x < 250 && z > -750 && z < 780) return false;
  const r = Math.hypot(x, z);
  return fbm(x / 380 + 11, z / 380 - 4) > 0.64 - 0.05 * sm(600, 1600, r);
}

/** Drogi: asfaltowa i dojazdowe (szutrowe) do każdej turbiny. Odcinki [x0, z0, x1, z1]. */
export const ROAD_MAIN: [number, number][] = [
  [-2400, 260],
  [-900, 200],
  [-300, 260],
  [300, 180],
  [900, 120],
  [2400, 40],
];
function mainRoadZ(x: number) {
  for (let i = 0; i < ROAD_MAIN.length - 1; i++) {
    const [x0, z0] = ROAD_MAIN[i];
    const [x1, z1] = ROAD_MAIN[i + 1];
    if (x >= x0 && x <= x1) return mix(z0, z1, (x - x0) / (x1 - x0));
  }
  return 0;
}
/** Droga dojazdowa: z placu turbiny prosto do drogi asfaltowej (najpierw w osi z). */
export function accessRoads(): [number, number, number, number][] {
  return FARM.map(([x, z]) => [x + 18, z, x + 18, mainRoadZ(x + 18)]);
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d')!;
  const px = (x: number) => ((x + G_HALF) / (2 * G_HALF)) * TEX;
  const sc = TEX / (2 * G_HALF);
  g.fillStyle = '#7d9752';
  g.fillRect(0, 0, TEX, TEX);
  // pasy pól (typowe dla polskiej wsi: długie i wąskie), w kilku blokach o różnej orientacji
  const r = rng(21);
  const palette = ['#8fa85a', '#a3b562', '#c6b46c', '#b5995e', '#7b9450', '#6d8947', '#d0c07c', '#94754f', '#9dae68', '#85a157'];
  for (let bi = -6; bi < 6; bi++)
    for (let bj = -6; bj < 6; bj++) {
      const cx = (bi + 0.5) * 400 + (r() - 0.5) * 80;
      const cz = (bj + 0.5) * 400 + (r() - 0.5) * 80;
      const ang = (r() - 0.5) * 0.5 + (r() < 0.5 ? 0 : Math.PI / 2);
      g.save();
      g.translate(px(cx), px(cz));
      g.rotate(ang);
      let off = -230;
      while (off < 230) {
        const w = 22 + r() * 48;
        const col = palette[Math.floor(r() * palette.length)];
        g.fillStyle = col;
        g.fillRect(-230 * sc, off * sc, 460 * sc, w * sc);
        // rzędy upraw
        g.strokeStyle = 'rgba(40,50,20,0.08)';
        g.lineWidth = 1;
        for (let q = 4; q < w; q += 4) {
          g.beginPath();
          g.moveTo(-230 * sc, (off + q) * sc);
          g.lineTo(230 * sc, (off + q) * sc);
          g.stroke();
        }
        // miedza
        g.fillStyle = 'rgba(70,90,40,0.45)';
        g.fillRect(-230 * sc, (off + w - 1.2) * sc, 460 * sc, 1.2 * sc);
        off += w;
      }
      g.restore();
    }
  // lasy
  const step = 6;
  for (let y = 0; y < TEX; y += step)
    for (let x = 0; x < TEX; x += step) {
      const wx = (x / TEX) * 2 * G_HALF - G_HALF;
      const wz = (y / TEX) * 2 * G_HALF - G_HALF;
      if (forestAt(wx, wz)) {
        const k = hash2(x, y);
        g.fillStyle = k < 0.5 ? '#3d5631' : '#44603a';
        g.fillRect(x, y, step + 1, step + 1);
      }
    }
  // wieś: trawniki i podwórza
  g.fillStyle = '#8eaa62';
  g.beginPath();
  g.arc(px(VILLAGE[0]), px(VILLAGE[2]), 230 * sc, 0, Math.PI * 2);
  g.fill();
  // drogi
  const line = (pts: [number, number][], w: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = w * sc;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), px(z)) : g.moveTo(px(x), px(z))));
    g.stroke();
  };
  line(ROAD_MAIN, 11, '#8b8a80');
  line(ROAD_MAIN, 7, '#5f605d');
  for (const [x0, z0, x1, z1] of accessRoads()) line([[x0, z0], [x1, z1]], 6, '#c3bba6');
  // drogi we wsi
  line([[VILLAGE[0] - 220, VILLAGE[2]], [VILLAGE[0] + 220, VILLAGE[2] + 30]], 6, '#6a6a66');
  line([[VILLAGE[0], VILLAGE[2] - 200], [VILLAGE[0] + 10, VILLAGE[2] + 220], [mainRoadZ(VILLAGE[0]) > 0 ? VILLAGE[0] - 40 : VILLAGE[0], mainRoadZ(VILLAGE[0] - 40)]], 6, '#6a6a66');
  // place montażowe pod dźwigi (żwir)
  for (const [x, z] of FARM) {
    g.fillStyle = '#c9c2ae';
    g.fillRect(px(x - 6), px(z - 30), 46 * sc, 60 * sc);
    g.fillStyle = '#b3ab96';
    g.beginPath();
    g.arc(px(x), px(z), 14 * sc, 0, Math.PI * 2);
    g.fill();
  }
  // stacja elektroenergetyczna
  g.fillStyle = '#bdb8aa';
  g.fillRect(px(SUBSTATION[0] - 45), px(SUBSTATION[2] - 35), 90 * sc, 70 * sc);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
let GROUND_TEX: THREE.Texture | null = null;

/** Równina z polami; `hole` – wycięty krąg wokół wieży (przekrój fundamentu). */
export function Ground({ hole = 0, night = false }: { hole?: number; night?: boolean }) {
  const tex = useMemo(() => (GROUND_TEX ??= groundTexture()), []);
  const geo = useMemo(() => {
    const N = 220;
    const g = new THREE.PlaneGeometry(2 * G_HALF, 2 * G_HALF, N, N);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
    // uv: x → u, z → v (tekstura rysowana z z w dół)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + G_HALF) / (2 * G_HALF), 1 - (p.getZ(i) + G_HALF) / (2 * G_HALF));
    g.computeVertexNormals();
    return g;
  }, []);
  // wycięcie: osobna siatka z otworem tylko, gdy potrzeba
  const holeGeo = useMemo(() => {
    if (!hole) return null;
    const g = geo.clone();
    const idx = g.getIndex()!;
    const p = g.getAttribute('position');
    const keep: number[] = [];
    // otwór tylko w połowie od strony widza (z > 0): tam widać przekrój gruntu
    const cut = (v: number) => Math.hypot(p.getX(v), p.getZ(v)) < hole && p.getZ(v) > -0.5;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i);
      const b = idx.getX(i + 1);
      const c = idx.getX(i + 2);
      if (!(cut(a) && cut(b) && cut(c))) keep.push(a, b, c);
    }
    g.setIndex(keep);
    return g;
  }, [geo, hole]);
  return (
    <mesh geometry={holeGeo ?? geo}>
      <meshStandardMaterial map={tex} roughness={1} metalness={0} color={night ? '#5a6070' : '#ffffff'} />
    </mesh>
  );
}

/* ================= drzewa ================= */

export function Trees({ night = false }: { night?: boolean }) {
  const data = useMemo(() => {
    const r = rng(77);
    const list: [number, number, number][] = [];
    for (let i = 0; i < 26000 && list.length < 2200; i++) {
      const x = (r() - 0.5) * 2 * 2200;
      const z = (r() - 0.5) * 2 * 2200;
      if (forestAt(x, z)) list.push([x, z, 0.7 + r() * 0.6]);
    }
    // szpalery przy drodze
    for (let x = -2000; x < 2000; x += 26) {
      if (r() < 0.35) continue;
      const z = mainRoadZ(x) + (r() < 0.5 ? 10 : -10);
      list.push([x, z, 0.6 + r() * 0.4]);
    }
    return list;
  }, []);
  const meshes = useMemo(() => {
    const crown = new THREE.ConeGeometry(4.2, 14, 7);
    crown.translate(0, 13, 0);
    const trunk = new THREE.CylinderGeometry(0.35, 0.5, 6, 5);
    trunk.translate(0, 3, 0);
    const mc = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: '#2f4a2a', roughness: 1 }), data.length);
    const mt = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#5a4632', roughness: 1 }), data.length);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    data.forEach(([x, z, s], i) => {
      o.position.set(x, groundH(x, z) - 0.3, z);
      o.scale.set(s * (0.85 + 0.3 * hash2(i, 3)), s, s * (0.85 + 0.3 * hash2(i, 5)));
      o.rotation.y = hash2(i, 7) * 6;
      o.updateMatrix();
      mc.setMatrixAt(i, o.matrix);
      mt.setMatrixAt(i, o.matrix);
      col.setHSL(0.27 + 0.06 * hash2(i, 9), 0.35, 0.22 + 0.08 * hash2(i, 11));
      mc.setColorAt(i, col);
    });
    mc.instanceMatrix.needsUpdate = true;
    mt.instanceMatrix.needsUpdate = true;
    return { mc, mt };
  }, [data]);
  useEffect(() => {
    (meshes.mc.material as THREE.MeshStandardMaterial).color.set(night ? '#6a7a90' : '#ffffff');
  }, [meshes, night]);
  return (
    <>
      <primitive object={meshes.mc} />
      <primitive object={meshes.mt} />
    </>
  );
}

/* ================= wieś ================= */

export const HOUSES: [number, number, number][] = (() => {
  const r = rng(31);
  const out: [number, number, number][] = [];
  for (let i = 0; i < 70; i++) {
    const along = (r() - 0.5) * 420;
    const side = (r() < 0.5 ? -1 : 1) * (16 + r() * 22);
    const onMain = r() < 0.6;
    const x = VILLAGE[0] + (onMain ? along : side);
    const z = VILLAGE[2] + (onMain ? side + along * 0.07 : along * 0.9);
    if (out.some(([a, b]) => Math.hypot(a - x, b - z) < 18)) continue;
    out.push([x, z, onMain ? 0 : Math.PI / 2]);
  }
  return out;
})();

export function Village({ night = false }: { night?: boolean }) {
  const m = useMemo(() => {
    const wall = new THREE.BoxGeometry(11, 6, 8);
    wall.translate(0, 3, 0);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-4.6, 0);
    roofShape.lineTo(0, 4.4);
    roofShape.lineTo(4.6, 0);
    roofShape.closePath();
    const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 12, bevelEnabled: false });
    roof.translate(0, 6, -6);
    roof.rotateY(Math.PI / 2);
    const win = new THREE.BoxGeometry(11.1, 1.2, 1.4);
    win.translate(0, 3.2, 1.4);
    const mw = new THREE.InstancedMesh(wall, new THREE.MeshStandardMaterial({ roughness: 0.9 }), HOUSES.length);
    const mr = new THREE.InstancedMesh(roof, new THREE.MeshStandardMaterial({ roughness: 0.8 }), HOUSES.length);
    const mwin = new THREE.InstancedMesh(win, new THREE.MeshBasicMaterial({ color: '#ffcf7a', toneMapped: false }), HOUSES.length);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    const walls = ['#efe7d6', '#e8dcc4', '#f4f1ea', '#dcd3c0', '#e9e2cf'];
    const roofs = ['#8c3b2b', '#6b4a3a', '#4a4f57', '#7a2f25', '#5c5f63'];
    HOUSES.forEach(([x, z, a], i) => {
      o.position.set(x, groundH(x, z), z);
      o.rotation.y = a;
      o.updateMatrix();
      mw.setMatrixAt(i, o.matrix);
      mr.setMatrixAt(i, o.matrix);
      mwin.setMatrixAt(i, o.matrix);
      mw.setColorAt(i, c.set(walls[i % walls.length]));
      mr.setColorAt(i, c.set(roofs[(i * 3) % roofs.length]));
    });
    return { mw, mr, mwin };
  }, []);
  useEffect(() => {
    (m.mw.material as THREE.MeshStandardMaterial).color.set(night ? '#59606e' : '#ffffff');
    (m.mr.material as THREE.MeshStandardMaterial).color.set(night ? '#59606e' : '#ffffff');
    m.mwin.visible = night;
  }, [m, night]);
  return (
    <>
      <primitive object={m.mw} />
      <primitive object={m.mr} />
      <primitive object={m.mwin} />
    </>
  );
}

/* ================= morze ================= */

const SEA_VS = /* glsl */ `
uniform float uTime;
varying vec3 vPos;
varying float vH;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float h = sin(p.x * 0.045 + uTime * 0.9) * 0.6 + sin(p.z * 0.07 + p.x * 0.02 + uTime * 1.3) * 0.35 + sin((p.x + p.z) * 0.13 + uTime * 2.1) * 0.15;
  p.y += h;
  vH = h;
  vPos = p;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SEA_FS = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uOpacity;
uniform vec3 uCam;
varying vec3 vPos;
varying float vH;
#include <fog_pars_fragment>
void main() {
  float dx = cos(vPos.x * 0.045 + uTime * 0.9) * 0.027 + cos((vPos.x + vPos.z) * 0.13 + uTime * 2.1) * 0.02;
  float dz = cos(vPos.z * 0.07 + vPos.x * 0.02 + uTime * 1.3) * 0.025 + cos((vPos.x + vPos.z) * 0.13 + uTime * 2.1) * 0.02;
  vec3 n = normalize(vec3(-dx, 1.0, -dz));
  vec3 v = normalize(uCam - vPos);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 l = normalize(vec3(0.5, 0.7, 0.4));
  float spec = pow(max(dot(reflect(-l, n), v), 0.0), 60.0);
  vec3 col = mix(uDeep, uShallow, 0.35 + vH * 0.25) + fres * vec3(0.45, 0.55, 0.65) + spec * 0.6;
  gl_FragColor = vec4(col, mix(uOpacity, 1.0, fres * 0.7));
  #include <fog_fragment>
}`;

export function Sea({ opacity = 0.82, night = false }: { opacity?: number; night?: boolean }) {
  const camera = useThree((s) => s.camera);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SEA_VS,
        fragmentShader: SEA_FS,
        transparent: true,
        fog: true,
        depthWrite: false,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          { uTime: { value: 0 }, uDeep: { value: new THREE.Color('#1d4f6e') }, uShallow: { value: new THREE.Color('#3f86a3') }, uOpacity: { value: opacity }, uCam: { value: new THREE.Vector3() } },
        ]),
      }),
    [opacity],
  );
  useEffect(() => {
    mat.uniforms.uDeep.value.set(night ? '#07121c' : '#1d4f6e');
    mat.uniforms.uShallow.value.set(night ? '#102433' : '#3f86a3');
  }, [mat, night]);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(4800, 4800, 260, 260);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const ref = useRef<THREE.Mesh>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
    if (ref.current?.parent) {
      v.copy(camera.position);
      ref.current.parent.worldToLocal(v);
      mat.uniforms.uCam.value.copy(v);
    }
  });
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={3} />;
}

/** Dno morza (piasek z falkami). */
export function Seabed({ depth = 35 }: { depth?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(4800, 4800, 120, 120);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const col: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, -depth + (fbm(x / 300, z / 300) - 0.5) * 6);
      c.setHSL(0.11, 0.3, mix(0.42, 0.55, fbm(x / 60, z / 60)));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, [depth]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}
