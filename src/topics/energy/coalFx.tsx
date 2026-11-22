/*
 * Elektrownia węglowa – efekty: płomień (wirująca kula ognia w komorze paleniskowej), pióropusze pary nad
 * chłodnią i spalin nad kominem, deszcz kropel w chłodni z prądem powietrza w górę, pył w elektrofiltrze
 * przyciągany do płyt i zraszanie w absorberze odsiarczania.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BOIL, BURNER_Y, CT, ESP, FGD, FGD_H, FGD_R, STACK, STACK_H, ctR, rng, type V3 } from './coalGeo';

/* ================= płomień ================= */

const FIRE_VS = /* glsl */ `
varying vec3 vP;
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FIRE_FS = /* glsl */ `
uniform float time;
uniform float power;
varying vec3 vP;
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  // wir: współrzędne obracane wokół osi pionowej tym szybciej, im bliżej środka
  float r = length(vP.xz);
  float a = time * 1.2 + r * 0.25;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * vP.xz;
  float n = vn(vec3(q * 0.35, vP.y * 0.18 - time * 1.6)) * 0.6 + vn(vec3(q * 0.9, vP.y * 0.5 - time * 2.6)) * 0.4;
  float hgt = clamp((vP.y + 18.0) / 46.0, 0.0, 1.0);
  vec3 c = mix(vec3(1.0, 0.95, 0.6), vec3(1.0, 0.45, 0.08), hgt);
  c = mix(c, vec3(0.75, 0.16, 0.03), smoothstep(0.6, 1.0, hgt));
  float alpha = (0.25 + 0.75 * n) * (1.0 - hgt * 0.7) * power;
  gl_FragColor = vec4(c * alpha * 0.85, 1.0);
}`;

/** Płomień w komorze: kilka nałożonych brył z animowanym szumem, jasność od mocy (0…1). */
export function Fireball({ power, cut }: { power: () => number; cut: boolean }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, power: { value: 1 } },
        vertexShader: FIRE_VS,
        fragmentShader: FIRE_FS,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );
  const light = useRef<THREE.PointLight>(null);
  useFrame((_, dt) => {
    mat.uniforms.time.value += Math.min(dt, 0.05);
    const p = power();
    mat.uniforms.power.value = p;
    if (light.current) light.current.intensity = 320 * p * (0.85 + 0.15 * Math.sin(mat.uniforms.time.value * 9));
  });
  const yc = (BURNER_Y[0] + BURNER_Y[BURNER_Y.length - 1]) / 2 + 6;
  const a = BOIL.half - 1.5;
  return (
    <group position={[0, yc, 0]}>
      {[1, 0.78, 0.55].map((s, i) => (
        <mesh key={i} material={mat} scale={[a * s, 1, a * s]}>
          <cylinderGeometry args={[0.7, 1, 46 - i * 6, 40, 12, true, cut ? Math.PI / 2 : 0, cut ? Math.PI : Math.PI * 2]} />
        </mesh>
      ))}
      <pointLight ref={light} color="#ff8a3a" distance={70} decay={1.4} />
    </group>
  );
}

/* ================= pióropusze ================= */

let PUFF_TEX: THREE.Texture | null = null;
function puffTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

const PUFF_VS = /* glsl */ `
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
void main() {
  vUv = uv;
  vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const PUFF_FS = /* glsl */ `
uniform sampler2D map;
uniform vec3 color;
uniform float opacity;
varying vec2 vUv;
varying float vA;
void main() {
  float a = texture2D(map, vUv).a * vA * opacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(color, a);
  #include <colorspace_fragment>
}`;

interface Puff {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  s0: number;
}

/**
 * Pióropusz z kłębów: rodzą się w wylocie (promień r0 na wysokości y0), unoszą się, rozszerzają i dryfują
 * z wiatrem. `rate()` – natężenie 0…1 (przy 0 nic nie wylatuje).
 */
export function Plume({ at, r0, color, opacity, rate, rise = 14, size = 24, life = 14, max = 220, wind = [6, 0, 2] }: { at: V3; r0: number; color: string; opacity: number; rate: () => number; rise?: number; size?: number; life?: number; max?: number; wind?: V3 }) {
  const tex = useMemo(() => (PUFF_TEX ??= puffTex()), []);
  const mesh = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(max), 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
      vertexShader: PUFF_VS,
      fragmentShader: PUFF_FS,
      transparent: true,
      depthWrite: false,
    });
    const im = new THREE.InstancedMesh(g, m, max);
    im.frustumCulled = false;
    return im;
  }, [tex, color, opacity, max]);
  const puffs = useMemo<Puff[]>(() => [], []);
  const acc = useRef(0);
  const r = useMemo(() => rng(Math.round(at[0] * 7 + at[2])), [at]);
  const o = useMemo(() => new THREE.Object3D(), []);
  const warm = useRef(false);
  useFrame(({ camera }, dt0) => {
    // pierwsza klatka: symulacja „na zapas”, żeby pióropusz był od razu w pełni rozwinięty
    if (!warm.current) {
      warm.current = true;
      for (let i = 0; i < life * 10; i++) step(camera, 0.1);
    }
    step(camera, Math.min(dt0, 0.05));
  });
  function step(camera: THREE.Camera, dt: number) {
    const k = rate();
    const alpha = mesh.geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
    acc.current += dt * k * (max / life);
    while (acc.current > 1) {
      acc.current -= 1;
      if (puffs.length >= max) puffs.shift();
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * r0 * 0.8;
      puffs.push({
        p: new THREE.Vector3(at[0] + Math.cos(a) * rr, at[1], at[2] + Math.sin(a) * rr),
        v: new THREE.Vector3((r() - 0.5) * 2, rise * (0.8 + 0.4 * r()), (r() - 0.5) * 2),
        age: 0,
        life: life * (0.7 + 0.5 * r()),
        s0: size * (0.6 + 0.6 * r()),
      });
    }
    let n = 0;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const q = puffs[i];
      q.age += dt;
      if (q.age > q.life) {
        puffs.splice(i, 1);
        continue;
      }
      const u = q.age / q.life;
      // unoszenie słabnie, wiatr znosi kłęby coraz bardziej
      q.p.x += (q.v.x + wind[0] * u * 1.6) * dt;
      q.p.y += q.v.y * (1 - u * 0.75) * dt;
      q.p.z += (q.v.z + wind[2] * u * 1.6) * dt;
      o.position.copy(q.p);
      o.quaternion.copy(camera.quaternion);
      o.scale.setScalar(q.s0 * (0.6 + 1.8 * u));
      o.updateMatrix();
      mesh.setMatrixAt(n, o.matrix);
      // narasta tuż nad wylotem, potem powoli się rozwiewa
      alpha.setX(n, Math.min(1, u * 6) * (1 - u) ** 1.3);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    alpha.needsUpdate = true;
  }
  return <primitive object={mesh} />;
}

/** Para nad chłodnią i spaliny nad kominem (natężenie od mocy bloku). */
export function Plumes({ rate, stack = true }: { rate: () => number; stack?: boolean }) {
  return (
    <>
      <Plume at={[CT.x, CT.h - 4, CT.z]} r0={CT.rTop} color="#ffffff" opacity={0.75} rate={rate} rise={10} size={46} life={16} max={260} />
      {stack && <Plume at={[STACK[0], STACK_H, STACK[2]]} r0={4} color="#d9dde2" opacity={0.35} rate={rate} rise={7} size={12} life={12} max={120} />}
    </>
  );
}

/* ================= chłodnia w przekroju: krople i powietrze ================= */

/** Woda spadająca ze zraszalnika do basenu i powietrze płynące w górę (strzałki z kropek). */
export function TowerFlow({ rate }: { rate: () => number }) {
  const N = 1400;
  const drops = useMemo(() => {
    const r = rng(9);
    const d: { x: number; z: number; y: number; v: number }[] = [];
    for (let i = 0; i < N; i++) {
      const a = Math.PI + r() * Math.PI;
      const rr = Math.sqrt(r()) * (CT.rBase - 6);
      d.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr * 0.98, y: r() * 6.5, v: 6 + r() * 3 });
    }
    return d;
  }, []);
  const air = useMemo(() => {
    const r = rng(4);
    const d: { x: number; z: number; y: number }[] = [];
    for (let i = 0; i < 420; i++) {
      const a = Math.PI + r() * Math.PI;
      d.push({ x: Math.cos(a), z: Math.sin(a), y: r() * CT.h });
    }
    return d;
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  const ageo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(420 * 3), 3));
    return g;
  }, []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = rate();
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    drops.forEach((d, i) => {
      d.y -= d.v * dt * (0.4 + 0.6 * k);
      if (d.y < 0.6) d.y = 6.5;
      p.setXYZ(i, d.x, d.y, d.z);
    });
    p.needsUpdate = true;
    const q = ageo.getAttribute('position') as THREE.BufferAttribute;
    air.forEach((d, i) => {
      d.y += dt * (6 + 10 * k);
      if (d.y > CT.h) d.y = 1;
      // powietrze wpływa dołem przez otwory między słupami i płynie w górę wzdłuż powłoki
      const rr = d.y < CT.yShell ? (CT.rBase + 6) * (1 - d.y / CT.yShell) + ctR(CT.yShell) * 0.7 * (d.y / CT.yShell) : ctR(d.y) * 0.7;
      q.setXYZ(i, d.x * rr, d.y, d.z * rr);
    });
    q.needsUpdate = true;
  });
  return (
    <group position={[CT.x, 0, CT.z]}>
      <points geometry={geo}>
        <pointsMaterial color="#9fd3f2" size={0.6} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
      </points>
      <points geometry={ageo}>
        <pointsMaterial color="#ffb66b" size={1.1} sizeAttenuation transparent opacity={0.75} depthWrite={false} />
      </points>
    </group>
  );
}

/* ================= elektrofiltr i odsiarczanie ================= */

/**
 * Pył w elektrofiltrze: drobiny płyną ze spalinami wzdłuż kanałów między płytami, ładują się przy elektrodach
 * i skręcają do płyt (w przekroju widać, jak spaliny po drodze robią się czyste).
 */
export function EspDust({ rate }: { rate: () => number }) {
  const N = 900;
  const d = useMemo(() => {
    const r = rng(17);
    return Array.from({ length: N }, () => ({ x: r(), lane: Math.floor(r() * 9), off: r() - 0.5, y: r(), stuck: 0 }));
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = rate();
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const L = ESP.x1 - ESP.x0 - 4;
    d.forEach((q, i) => {
      q.x += dt * 0.08 * (0.3 + k);
      if (q.x > 1) {
        q.x = 0;
        q.stuck = 0;
      }
      // im dalej w filtrze, tym więcej drobin już przylgnęło do płyty (zbliżają się do niej)
      const pull = Math.min(1, q.x * 2.2 + q.off * 0.3);
      const zc = -1.5 - q.lane * 2.2 - 1.1;
      const z = zc + q.off * 1.6 * (1 - pull) + (q.off > 0 ? 1 : -1) * 1.05 * pull;
      p.setXYZ(i, ESP.x0 + 2 + q.x * L, 8 + q.y * (ESP.h - 4), z);
    });
    p.needsUpdate = true;
  });
  return (
    <points geometry={geo}>
      <pointsMaterial color="#5a5248" size={0.55} sizeAttenuation />
    </points>
  );
}

/** Zraszanie w absorberze: krople zawiesiny wapiennej spadają, spaliny płyną w górę. */
export function FgdSpray({ rate }: { rate: () => number }) {
  const N = 900;
  const d = useMemo(() => {
    const r = rng(23);
    return Array.from({ length: N }, () => {
      const a = Math.PI + r() * Math.PI;
      const rr = Math.sqrt(r()) * (FGD_R - 1);
      return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: r() * 30 + 6, gas: r() < 0.3 };
    });
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const k = rate();
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const c = geo.getAttribute('color') as THREE.BufferAttribute;
    d.forEach((q, i) => {
      if (q.gas) {
        q.y += dt * 5 * (0.4 + k);
        if (q.y > FGD_H - 3) q.y = 8;
        // spaliny: na dole żółtawe (z dwutlenkiem siarki), u góry białawe – już czyste
        const u = (q.y - 8) / (FGD_H - 11);
        c.setXYZ(i, 0.95, 0.85 - 0.0 * u, 0.4 + 0.55 * u);
      } else {
        q.y -= dt * 9 * (0.4 + k);
        if (q.y < 6) q.y = 40;
        c.setXYZ(i, 0.82, 0.88, 0.95);
      }
      p.setXYZ(i, FGD[0] + q.x, q.y, q.z);
    });
    p.needsUpdate = true;
    c.needsUpdate = true;
  });
  return (
    <points geometry={geo}>
      <pointsMaterial vertexColors size={0.6} sizeAttenuation />
    </points>
  );
}
