/*
 * Wulkan – efekty: kłęby (popiół, para, gaz) jako miękkie, zawsze zwrócone do kamery plamy, odłamki skalne
 * (bomby, lapille, bloki, krople lawy) z rzutem ukośnym, spływy (lawa, lahar) rozlewające się po zboczu.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clamp, downhill, sm } from './volcanoGeo';

export type V3 = [number, number, number];
export const G = 9;

/* ================= kłęby ================= */

const PUFF_VS = /* glsl */ `
attribute vec3 iOffset;
attribute float iSize;
attribute vec3 iColor;
attribute float iAlpha;
attribute float iSeed;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vSeed;
void main() {
  vUv = uv;
  vColor = iColor;
  vAlpha = iAlpha;
  vSeed = iSeed;
  vec4 mv = modelViewMatrix * vec4(iOffset, 1.0);
  mv.xy += position.xy * iSize;
  gl_Position = projectionMatrix * mv;
}`;
const PUFF_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vSeed;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float q = n(p * 2.3 + vSeed * 13.0) * 0.6 + n(p * 5.1 - vSeed * 7.0) * 0.3;
  float a = smoothstep(1.0, 0.25, r + (q - 0.45) * 0.7) * vAlpha;
  if (a < 0.01) discard;
  float lit = 0.72 + 0.38 * clamp(p.y + 0.3, -1.0, 1.0) + (q - 0.45) * 0.25;
  gl_FragColor = vec4(vColor * lit, a);
}`;

export interface Puff {
  p: V3;
  v: V3;
  size: number;
  grow: number;
  age: number;
  life: number;
  color: V3;
  alpha: number;
  /** 0 – wznosi się i zwalnia; 1 – spływa po ziemi (przepływ piroklastyczny); 2 – unosi się w górę stale (gaz). */
  kind: number;
  /** Wyporność (przyspieszenie w górę) albo prędkość spływu. */
  lift: number;
  seed: number;
}

export interface PuffSys {
  emit: (p: Partial<Puff> & { p: V3 }) => void;
  count: () => number;
  clear: () => void;
}

/** System kłębów. `ground` – wysokość terenu (do spływów po zboczu), `wind` – wiatr (jedn./s). */
export function Puffs({ cap = 1400, sys, ground, wind, ceiling = 95 }: { cap?: number; sys: React.MutableRefObject<PuffSys | null>; ground: (x: number, z: number) => number; wind: () => V3; ceiling?: number }) {
  const { geo, mat, items } = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    const off = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    const size = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    const col = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    const al = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    const seed = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    for (const a of [off, size, col, al, seed]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iOffset', off);
    g.setAttribute('iSize', size);
    g.setAttribute('iColor', col);
    g.setAttribute('iAlpha', al);
    g.setAttribute('iSeed', seed);
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false });
    return { geo: g, mat: m, items: [] as Puff[] };
  }, [cap]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useEffect(() => {
    sys.current = {
      emit: (q) => {
        if (items.length >= cap) items.shift();
        items.push({ v: [0, 0, 0], size: 1, grow: 1, age: 0, life: 6, color: [0.6, 0.6, 0.6], alpha: 0.8, kind: 0, lift: 0, seed: Math.random(), ...q, p: [...q.p] as V3 });
      },
      count: () => items.length,
      clear: () => {
        items.length = 0;
      },
    };
  }, [sys, items, cap]);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const w = wind();
    let j = 0;
    const off = geo.getAttribute('iOffset') as THREE.InstancedBufferAttribute;
    const size = geo.getAttribute('iSize') as THREE.InstancedBufferAttribute;
    const col = geo.getAttribute('iColor') as THREE.InstancedBufferAttribute;
    const al = geo.getAttribute('iAlpha') as THREE.InstancedBufferAttribute;
    const seed = geo.getAttribute('iSeed') as THREE.InstancedBufferAttribute;
    for (let i = 0; i < items.length; i++) {
      const q = items[i];
      q.age += dt;
      if (q.age > q.life) continue;
      if (q.kind === 1) {
        // spływ po ziemi: w dół zbocza, wolniej z czasem, kłąb przytulony do terenu
        const e = 0.6;
        const gx = (ground(q.p[0] + e, q.p[2]) - ground(q.p[0] - e, q.p[2])) / (2 * e);
        const gz = (ground(q.p[0], q.p[2] + e) - ground(q.p[0], q.p[2] - e)) / (2 * e);
        q.v[0] += (-gx * 14 - q.v[0] * 0.35) * dt;
        q.v[2] += (-gz * 14 - q.v[2] * 0.35) * dt;
        q.p[0] += q.v[0] * dt;
        q.p[2] += q.v[2] * dt;
        const gy = ground(q.p[0], q.p[2]);
        q.p[1] += (gy + q.size * 0.32 - q.p[1]) * Math.min(1, dt * 6);
        // część chmury unosi się (popiół z przepływu)
        if (q.lift > 0) q.p[1] += q.lift * q.age * dt;
      } else {
        // kłąb w powietrzu: hamowany przez powietrze, unoszony wypornością, znoszony wiatrem
        const drag = q.kind === 2 ? 0.6 : 0.9;
        q.v[0] += ((w[0] - q.v[0]) * drag * 0.5) * dt * sm(4, 30, q.p[1]);
        q.v[2] += ((w[2] - q.v[2]) * drag * 0.5) * dt * sm(4, 30, q.p[1]);
        q.v[1] += (q.lift - q.v[1] * drag) * dt;
        q.p[0] += q.v[0] * dt;
        q.p[1] += q.v[1] * dt;
        q.p[2] += q.v[2] * dt;
        // pułap: kłąb rozpływa się na boki (parasol chmury)
        if (q.p[1] > ceiling) {
          q.p[1] = ceiling + (q.p[1] - ceiling) * 0.5;
          q.v[1] = Math.min(q.v[1], 0);
        }
      }
      q.size += q.grow * dt;
      const fadeIn = clamp(q.age / 0.4);
      const fadeOut = clamp((q.life - q.age) / (q.life * 0.35));
      const a = q.alpha * fadeIn * fadeOut;
      off.setXYZ(j, q.p[0], q.p[1], q.p[2]);
      size.setX(j, q.size);
      col.setXYZ(j, q.color[0], q.color[1], q.color[2]);
      al.setX(j, a);
      seed.setX(j, q.seed);
      j++;
    }
    // usuwamy wygasłe z początku listy (kolejność emisji ≈ kolejność wygasania)
    while (items.length && items[0].age > items[0].life) items.shift();
    geo.instanceCount = j;
    off.needsUpdate = size.needsUpdate = col.needsUpdate = al.needsUpdate = seed.needsUpdate = true;
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}

/* ================= odłamki ================= */

export interface Rock {
  p: V3;
  v: V3;
  size: number;
  /** Temperatura 0…1: 1 – świeży, żarzący się kawał lawy; spada w locie i po upadku. */
  heat: number;
  cool: number;
  /** Kształt: 0 – kanciasty (blok, lapille), 1 – wrzecionowaty (bomba), 2 – kropla (fontanna lawy). */
  shape: number;
  age: number;
  life: number;
  landed: boolean;
  spin: V3;
  rot: V3;
  /** Kolor zimnego odłamka. */
  color: V3;
  /** Opór powietrza (popiół i lapille – większy). */
  drag: number;
}
export interface RockSys {
  emit: (r: Partial<Rock> & { p: V3; v: V3 }) => void;
  clear: () => void;
}

/** Odłamki skalne i krople lawy: lecą po paraboli, żarzą się i stygną, po upadku chwilę leżą. */
export function Rocks({ cap = 700, sys, ground, onLand }: { cap?: number; sys: React.MutableRefObject<RockSys | null>; ground: (x: number, z: number) => number; onLand?: (r: Rock) => void }) {
  const hot = useRef<THREE.InstancedMesh>(null);
  const cold = useRef<THREE.InstancedMesh>(null);
  const items = useMemo<Rock[]>(() => [], []);
  const land = useRef(onLand);
  land.current = onLand;
  const geos = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    // nieregularny kształt: lekko zniekształcony dwudziestościan
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const k = 0.8 + 0.4 * Math.abs(Math.sin(p.getX(i) * 5.1 + p.getY(i) * 3.7 + p.getZ(i) * 2.3));
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => {
    sys.current = {
      emit: (q) => {
        if (items.length >= cap) items.shift();
        items.push({ size: 0.3, heat: 1, cool: 0.25, shape: 0, age: 0, life: 9, landed: false, spin: [Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2], rot: [Math.random() * 6, Math.random() * 6, Math.random() * 6], color: [0.27, 0.25, 0.24], drag: 0.02, ...q, p: [...q.p] as V3, v: [...q.v] as V3 });
      },
      clear: () => {
        items.length = 0;
      },
    };
  }, [sys, items, cap]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const qt = useMemo(() => new THREE.Quaternion(), []);
  const eu = useMemo(() => new THREE.Euler(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const ps = useMemo(() => new THREE.Vector3(), []);
  const cHot = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const H = hot.current;
    const Cm = cold.current;
    if (!H || !Cm) return;
    let nh = 0;
    let nc = 0;
    for (const r of items) {
      r.age += dt;
      if (r.age > r.life) continue;
      if (!r.landed) {
        r.v[1] -= G * dt;
        const k = Math.max(0, 1 - r.drag * Math.hypot(r.v[0], r.v[1], r.v[2]) * dt);
        r.v[0] *= k;
        r.v[1] *= k;
        r.v[2] *= k;
        r.p[0] += r.v[0] * dt;
        r.p[1] += r.v[1] * dt;
        r.p[2] += r.v[2] * dt;
        r.rot[0] += r.spin[0] * dt;
        r.rot[1] += r.spin[1] * dt;
        r.rot[2] += r.spin[2] * dt;
        const gy = ground(r.p[0], r.p[2]);
        if (r.p[1] < gy + r.size * 0.4) {
          r.p[1] = gy + r.size * (r.shape === 2 ? 0.15 : 0.4);
          r.landed = true;
          r.life = Math.min(r.life, r.age + (r.shape === 2 ? 2.5 : 4));
          land.current?.(r);
        }
      }
      r.heat = Math.max(0, r.heat - r.cool * dt * (r.landed ? 1.6 : 1));
      const fade = clamp((r.life - r.age) / 0.8);
      const s = r.size * (r.landed ? fade : 1);
      eu.set(r.rot[0], r.rot[1], r.rot[2]);
      qt.setFromEuler(eu);
      // bomba wrzecionowata – wydłużona wzdłuż lotu; kropla po upadku – placek
      if (r.shape === 1) sc.set(s * 1.7, s * 0.8, s * 0.8);
      else if (r.shape === 2 && r.landed) sc.set(s * 1.6, s * 0.35, s * 1.6);
      else sc.set(s, s, s);
      if (r.shape === 2 && r.landed) qt.identity();
      ps.set(r.p[0], r.p[1], r.p[2]);
      m4.compose(ps, qt, sc);
      if (r.heat > 0.35) {
        H.setMatrixAt(nh, m4);
        // od jasnożółtego (ok. 1150 °C) przez pomarańcz do ciemnej czerwieni
        const h = r.heat;
        cHot.setRGB(1, clamp(0.15 + 0.75 * (h - 0.35) * 1.5, 0.12, 0.95), clamp((h - 0.8) * 2.5, 0, 0.6));
        cHot.multiplyScalar(0.55 + 0.6 * h);
        H.setColorAt(nh, cHot);
        nh++;
      } else {
        Cm.setMatrixAt(nc, m4);
        cHot.setRGB(r.color[0], r.color[1], r.color[2]);
        // jeszcze ciepły – czerwonawy odcień
        cHot.lerp(new THREE.Color(0.45, 0.12, 0.06), clamp(r.heat * 2));
        Cm.setColorAt(nc, cHot);
        nc++;
      }
    }
    while (items.length && items[0].age > items[0].life) items.shift();
    H.count = nh;
    Cm.count = nc;
    H.instanceMatrix.needsUpdate = true;
    Cm.instanceMatrix.needsUpdate = true;
    if (H.instanceColor) H.instanceColor.needsUpdate = true;
    if (Cm.instanceColor) Cm.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={hot} args={[geos, undefined, cap]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={cold} args={[geos, undefined, cap]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
    </>
  );
}

/* ================= spływy ================= */

const FLOW_VS = /* glsl */ `
attribute float aAlong;
attribute float aAcross;
varying float vAlong;
varying float vAcross;
varying vec3 vWorld;
void main() {
  vAlong = aAlong;
  vAcross = aAcross;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FLOW_FS = /* glsl */ `
uniform float uFront;
uniform float uTime;
uniform float uKind;
uniform float uCut;
uniform float uHeat;
varying float vAlong;
varying float vAcross;
varying vec3 vWorld;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { return n(p) * 0.5 + n(p * 2.1) * 0.25 + n(p * 4.3) * 0.125; }
void main() {
  if (uCut > 0.5 && vWorld.z > 0.0) discard;
  float behind = uFront - vAlong;
  if (behind < 0.0) discard;
  // jęzor: przy czole węższy i zaokrąglony
  float wid = clamp(0.35 + behind * 0.35, 0.0, 1.0);
  float edge = abs(vAcross) / wid;
  if (edge > 1.0 + (fbm(vec2(vAlong * 0.8, vAcross * 3.0)) - 0.5) * 0.35) discard;
  vec2 q = vec2(vAlong * 1.3, vAcross * 4.0);
  float cool = clamp(behind / 25.0, 0.0, 1.0) * (1.0 - uHeat * 0.5);
  vec3 col;
  float glow = 0.0;
  if (uKind < 0.5) {
    // pahoehoe: gładka, lśniąca skórka, w pęknięciach i przy czole – żar; „sznury” w poprzek jęzora
    float ropes = sin(vAlong * 9.0 + edge * edge * 6.0 + fbm(q) * 4.0);
    col = mix(vec3(0.16, 0.15, 0.16), vec3(0.32, 0.30, 0.32), 0.5 + 0.5 * ropes);
    float crack = smoothstep(0.08, 0.0, abs(fbm(q * 1.6 + uTime * 0.05) - 0.5));
    glow = max(crack * (1.0 - cool), smoothstep(2.5, 0.0, behind));
  } else if (uKind < 1.5) {
    // aa: szorstki, rumoszowaty żużel; żar tylko w głębi i na czole
    float rub = fbm(q * 3.0);
    col = mix(vec3(0.17, 0.12, 0.10), vec3(0.33, 0.24, 0.20), rub);
    glow = smoothstep(0.7, 0.85, fbm(q * 2.0 + 3.0)) * (1.0 - cool) * 0.7 + smoothstep(1.5, 0.0, behind) * 0.9;
  } else if (uKind < 2.5) {
    // lawa blokowa: wielkie, kanciaste bloki
    vec2 c = floor(q * vec2(0.6, 0.9));
    float b = h(c);
    col = mix(vec3(0.30, 0.29, 0.29), vec3(0.45, 0.43, 0.42), b);
    glow = smoothstep(1.0, 0.0, behind) * 0.6;
  } else if (uKind < 3.5) {
    // lahar: błoto i kamienie, płynie szybko (fale w poprzek)
    float wave = 0.5 + 0.5 * sin(vAlong * 2.5 - uTime * 6.0 + fbm(q) * 3.0);
    col = mix(vec3(0.36, 0.29, 0.21), vec3(0.50, 0.42, 0.31), wave * 0.6 + fbm(q * 2.0 - uTime) * 0.4);
  } else {
    // woda z topniejącego lodowca – mętna, szara
    float wave = 0.5 + 0.5 * sin(vAlong * 2.0 - uTime * 5.0 + fbm(q) * 3.0);
    col = mix(vec3(0.40, 0.45, 0.48), vec3(0.58, 0.62, 0.64), wave);
  }
  vec3 hot = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.3), clamp(glow - 0.5, 0.0, 1.0));
  col = mix(col, hot * 1.6, clamp(glow, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export type FlowKind = 'pahoehoe' | 'aa' | 'block' | 'lahar' | 'flood';
const KIND_N: Record<FlowKind, number> = { pahoehoe: 0, aa: 1, block: 2, lahar: 3, flood: 4 };

/**
 * Spływ (lawa, lahar, woda): pas narzucony na teren wzdłuż drogi w dół zbocza. Czoło przesuwa się (`front()` – metry
 * od początku), część za czołem stygnie. `cut` – przekrój: połowa z > 0 jest ukryta.
 */
export function Flow({ start, dir, width, len, kind, front, ground, cut, heat = 0, lift = 0.12 }: { start: [number, number]; dir: number; width: number; len: number; kind: FlowKind; front: () => number; ground: (x: number, z: number) => number; cut: boolean; heat?: number; lift?: number }) {
  const geo = useMemo(() => {
    const path = downhill(ground, start[0], start[1], dir, len, 0.45);
    const N = 7;
    const pos: number[] = [];
    const along: number[] = [];
    const across: number[] = [];
    const idx: number[] = [];
    let s = 0;
    for (let i = 0; i < path.length; i++) {
      const [x, , z] = path[i];
      if (i > 0) s += Math.hypot(x - path[i - 1][0], z - path[i - 1][2]);
      const a = path[Math.max(0, i - 1)];
      const b = path[Math.min(path.length - 1, i + 1)];
      let tx = b[0] - a[0];
      let tz = b[2] - a[2];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      // jęzor rozszerza się w miarę spływania na płaskie
      const w = width * (0.6 + 0.4 * clamp(s / 12)) * (1 + 0.6 * sm(len * 0.6, len, s));
      for (let k = 0; k < N; k++) {
        const u = (k / (N - 1)) * 2 - 1;
        const px = x - tz * u * w;
        const pz = z + tx * u * w;
        pos.push(px, ground(px, pz) + lift * (1 - 0.6 * u * u), pz);
        along.push(s);
        across.push(u);
      }
    }
    for (let i = 0; i < path.length - 1; i++)
      for (let k = 0; k < N - 1; k++) {
        const a = i * N + k;
        idx.push(a, a + N, a + 1, a + 1, a + N, a + N + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
    g.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }, [ground, start[0], start[1], dir, width, len]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FLOW_VS,
        fragmentShader: FLOW_FS,
        uniforms: { uFront: { value: 0 }, uTime: { value: 0 }, uKind: { value: KIND_N[kind] }, uCut: { value: cut ? 1 : 0 }, uHeat: { value: heat } },
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  );
  useEffect(() => {
    mat.uniforms.uKind.value = KIND_N[kind];
    mat.uniforms.uCut.value = cut ? 1 : 0;
    mat.uniforms.uHeat.value = heat;
  }, [mat, kind, cut, heat]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    mat.uniforms.uFront.value = front();
    mat.uniforms.uTime.value += Math.min(dt, 0.05);
  });
  return <mesh geometry={geo} material={mat} />;
}

/* ================= pomocnicze ================= */

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Losowy kierunek w stożku wokół pionu (kąt rozwarcia `spread` w radianach) razy prędkość. */
export function upCone(speed: number, spread: number, lean: V3 = [0, 0, 0]): V3 {
  const a = Math.random() * Math.PI * 2;
  const t = Math.sqrt(Math.random()) * spread;
  return [Math.sin(t) * Math.cos(a) * speed + lean[0], Math.cos(t) * speed + lean[1], Math.sin(t) * Math.sin(a) * speed + lean[2]];
}
