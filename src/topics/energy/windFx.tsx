/*
 * Elektrownia wiatrowa – przepływ powietrza.
 *
 * Smugi wiatru płyną w prostym, ale fizycznie poprawnym polu prędkości: wiatr słabnie przy ziemi, przed wirnikiem
 * zwalnia, a za nim płynie wolniej i szerzej (struga rozszerza się, bo wolniejsze powietrze potrzebuje więcej
 * miejsca – tzw. model tarczy aktywnej). Za turbinami ciągnie się ślad – pas wolniejszego powietrza, który
 * powoli miesza się z otoczeniem. Kolor smugi: biały – pełna prędkość wiatru, niebieski – powietrze spowolnione.
 */
import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PauseContext } from '../../lib/useAnimationClock';
import { R, T, clamp, mix, rng, shear, sm, type V3 } from './windGeo';
import type { TurbineState } from './windTurbine';

/* ================= wstęgi ================= */

const _inv = new THREE.Matrix4();
const _cam = new THREE.Vector3();
const _t = new THREE.Vector3();
const _v = new THREE.Vector3();
const _side = new THREE.Vector3();

/**
 * Wstęgi zwrócone do kamery, z przezroczystością (głowa wyraźna, ogon zanika) – zwykłe mieszanie kolorów, więc
 * widać je także na jasnym niebie. Punkty każdej wstęgi ustawia właściciel (setPoint), od głowy (k = 0).
 */
export class Ribbons extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  readonly count: number;
  readonly TR: number;
  pts: Float32Array;
  /** Liczba ważnych punktów wstęgi. */
  len: Uint16Array;
  rgba: Float32Array;
  wid: Float32Array;
  /** Zanikanie ogona: 1 – liniowo do zera, 0 – stała jasność. */
  fade = 1;

  constructor(count: number, TR: number) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * TR * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * TR * 8), 4));
    const idx = new Uint32Array(count * (TR - 1) * 6);
    let n = 0;
    for (let p = 0; p < count; p++)
      for (let k = 0; k < TR - 1; k++) {
        const a = (p * TR + k) * 2;
        idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], n);
        n += 6;
      }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    super(g, m);
    this.count = count;
    this.TR = TR;
    this.pts = new Float32Array(count * TR * 3);
    this.len = new Uint16Array(count);
    this.rgba = new Float32Array(count * 4).fill(1);
    this.wid = new Float32Array(count).fill(0.5);
    this.frustumCulled = false;
    this.renderOrder = 5;
    this.raycast = () => {};
  }

  setPoint(i: number, k: number, x: number, y: number, z: number) {
    const o = (i * this.TR + k) * 3;
    this.pts[o] = x;
    this.pts[o + 1] = y;
    this.pts[o + 2] = z;
  }

  setStyle(i: number, r: number, g: number, b: number, a: number, w: number) {
    this.rgba.set([r, g, b, a], i * 4);
    this.wid[i] = w;
  }

  onBeforeRender = (_r: THREE.WebGLRenderer, _s: THREE.Scene, camera: THREE.Camera) => {
    const TR = this.TR;
    _inv.copy(this.matrixWorld).invert();
    _cam.copy(camera.position).applyMatrix4(_inv);
    const P = (this.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const C = (this.geometry.getAttribute('color') as THREE.BufferAttribute).array as Float32Array;
    const h = this.pts;
    for (let i = 0; i < this.count; i++) {
      const n = this.len[i];
      const o = i * TR * 3;
      const al = n >= 2 ? this.rgba[i * 4 + 3] : 0;
      for (let k = 0; k < TR; k++) {
        const kk = Math.min(k, Math.max(0, n - 1));
        const q = o + kk * 3;
        const qa = o + Math.max(0, kk - 1) * 3;
        const qb = o + Math.min(Math.max(0, n - 1), kk + 1) * 3;
        _t.set(h[qa] - h[qb], h[qa + 1] - h[qb + 1], h[qa + 2] - h[qb + 2]);
        if (_t.lengthSq() < 1e-12) _t.set(1, 0, 0);
        _v.set(h[q], h[q + 1], h[q + 2]);
        _side.copy(_cam).sub(_v).cross(_t).normalize();
        const f = n > 1 && k < n ? 1 - kk / (n - 1) : 0;
        const half = this.wid[i] * (0.35 + 0.65 * f) * 0.5;
        const j = (i * TR + k) * 6;
        P[j] = _v.x + _side.x * half;
        P[j + 1] = _v.y + _side.y * half;
        P[j + 2] = _v.z + _side.z * half;
        P[j + 3] = _v.x - _side.x * half;
        P[j + 4] = _v.y - _side.y * half;
        P[j + 5] = _v.z - _side.z * half;
        const a = al * (this.fade ? Math.pow(f, 1.3) : k < n ? 1 : 0) * (k === 0 ? 0.6 : 1);
        const c = (i * TR + k) * 8;
        C[c] = C[c + 4] = this.rgba[i * 4];
        C[c + 1] = C[c + 5] = this.rgba[i * 4 + 1];
        C[c + 2] = C[c + 6] = this.rgba[i * 4 + 2];
        C[c + 3] = C[c + 7] = a;
      }
    }
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('color').needsUpdate = true;
  };

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export function useRibbons(count: number, TR: number) {
  const r = useMemo(() => new Ribbons(count, TR), [count, TR]);
  useEffect(() => () => r.dispose(), [r]);
  return r;
}

/* ================= pole prędkości ================= */

/** Turbina w polu wiatru (w układzie wiatru: s – z wiatrem, l – w bok, y – w górę). */
export interface FieldTurbine {
  s: number;
  l: number;
  /** wysokość piasty */
  y: number;
  r: number;
  /** spowolnienie powietrza w płaszczyźnie wirnika (0 – turbina stoi, 1/3 – granica Betza) */
  a: number;
}

export interface WindField {
  /** prędkość wiatru na wysokości piasty (m/s) */
  U: number;
  /** kierunek, z którego wieje wiatr (rad; 0 – z +x) */
  dir: number;
  turbines: FieldTurbine[];
  /** czy smugi omijają wirnik pierwszej turbiny (rozszerzanie strugi) */
  displace: boolean;
  /** czy wiatr słabnie przy ziemi */
  shear: boolean;
}

/** Wzrost spowolnienia wzdłuż osi: 0 daleko przed wirnikiem, 1 w wirniku, 2 daleko za nim. */
const axial = (d: number, r: number) => 1 + d / Math.sqrt(d * d + r * r);
/** Zanikanie śladu: powietrze z otoczenia stopniowo przyspiesza ślad. */
const recover = (d: number, r: number) => (d <= 0 ? 1 : Math.exp(-d / (9 * r)));
/** Promień strugi za/przed wirnikiem (z ciągłości przepływu) + rozmywanie śladu. */
export function tubeR(t: FieldTurbine, d: number) {
  const A = axial(d, t.r) * recover(d, t.r);
  return t.r * Math.sqrt((1 - t.a) / Math.max(0.2, 1 - t.a * A)) + Math.max(0, d) * 0.035;
}

/** Względna prędkość powietrza (1 – jak wiatr niezakłócony) w punkcie układu wiatru. */
export function speedAt(f: WindField, s: number, y: number, l: number) {
  let def = 0;
  for (const t of f.turbines) {
    if (t.a <= 0) continue;
    const d = s - t.s;
    if (d < -4 * t.r || d > 40 * t.r) continue;
    const rr = Math.hypot(y - t.y, l - t.l);
    const rw = tubeR(t, d);
    const inside = 1 - sm(rw * 0.8, rw * 1.15, rr);
    def += t.a * axial(d, t.r) * recover(d, t.r) * inside;
  }
  return clamp(1 - def, 0.15, 1.05);
}

/** Układ wiatru → scena. */
export function windToWorld(f: WindField, s: number, y: number, l: number, out: THREE.Vector3) {
  const c = Math.cos(f.dir);
  const sn = Math.sin(f.dir);
  // z wiatrem: (−cos, −sin); w bok: (sin, −cos)
  return out.set(-c * s + sn * l, y, -sn * s - c * l);
}
/** Scena → układ wiatru. */
export function worldToWind(f: WindField, x: number, z: number): [number, number] {
  const c = Math.cos(f.dir);
  const sn = Math.sin(f.dir);
  return [-c * x - sn * z, sn * x - c * z];
}

/* ================= smugi wiatru ================= */

export interface Region {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
  l0: number;
  l1: number;
}

interface Particle {
  s: number;
  y0: number;
  l0: number;
  tSample: number;
  life: number;
  seed: number;
}

const WHITE = new THREE.Color('#ffffff');
const SLOW = new THREE.Color('#2f6fe0');
const _c = new THREE.Color();
const _w = new THREE.Vector3();

/**
 * Smugi wiatru. Cząstki rodzą się na nawietrznej stronie obszaru i płyną z prędkością pola; ich ślad (co
 * `sample` s) tworzy wstęgę. `speedUp` – przyspieszenie czasu tylko dla smug (żeby były czytelne z daleka).
 */
export function WindTrails({ field, region, count = 500, width = 0.8, opacity = 0.8, sample = 0.16, TR = 22, speedUp = 1, tint = true }: { field: () => WindField; region: Region; count?: number; width?: number; opacity?: number; sample?: number; TR?: number; speedUp?: number; tint?: boolean }) {
  const rib = useRibbons(count, TR);
  const paused = useContext(PauseContext);
  const parts = useMemo<Particle[]>(() => {
    const r = rng(17);
    return Array.from({ length: count }, () => ({ s: 0, y0: 0, l0: 0, tSample: 0, life: -1, seed: r() }));
  }, [count]);
  const reg = useRef(region);
  reg.current = region;
  useEffect(() => {
    // nowe ustawienie: cząstki rozsiane po całym obszarze (bez czekania, aż wpłyną)
    for (const p of parts) p.life = -1;
  }, [parts, region.s0, region.s1, region.y0, region.y1, region.l0, region.l1]);
  useFrame((_, dt0) => {
    const dt = paused ? 0 : Math.min(dt0, 0.05) * speedUp;
    const f = field();
    const g = reg.current;
    const t0 = f.turbines[0];
    for (let i = 0; i < count; i++) {
      const p = parts[i];
      if (p.life < 0 || p.s > g.s1) {
        const first = p.life < 0;
        p.s = first ? mix(g.s0, g.s1, Math.random()) : g.s0 + Math.random() * 20;
        p.y0 = mix(g.y0, g.y1, Math.pow(Math.random(), 0.9));
        p.l0 = mix(g.l0, g.l1, Math.random());
        p.life = 0;
        p.tSample = 0;
        rib.len[i] = 0;
      }
      // położenie: przesunięcie promieniowe wokół osi pierwszej turbiny (rozszerzanie strugi)
      let y = p.y0;
      let l = p.l0;
      if (f.displace && t0 && t0.a > 0) {
        const d = p.s - t0.s;
        const dy = p.y0 - t0.y;
        const dl = p.l0 - t0.l;
        const r0 = Math.hypot(dy, dl);
        const rInf = tubeR(t0, -1e5);
        const rw = tubeR(t0, d);
        const r = r0 < rInf ? (r0 * rw) / rInf : Math.sqrt(r0 * r0 + rw * rw - rInf * rInf);
        const k = r0 > 1e-3 ? r / r0 : 1;
        y = t0.y + dy * k;
        l = t0.l + dl * k;
      }
      const U = f.shear ? shear(f.U, y) : f.U;
      const rel = speedAt(f, p.s, y, l);
      p.s += U * rel * dt;
      p.life += dt;
      windToWorld(f, p.s, Math.max(0.5, y), l, _w);
      // historia: przesunięcie co `sample` s, głowa zawsze w bieżącym miejscu
      const TRn = rib.TR;
      const o = i * TRn * 3;
      p.tSample += dt;
      if (rib.len[i] === 0) {
        rib.setPoint(i, 0, _w.x, _w.y, _w.z);
        rib.setPoint(i, 1, _w.x, _w.y, _w.z);
        rib.len[i] = 2;
      } else if (p.tSample >= sample) {
        p.tSample = 0;
        rib.pts.copyWithin(o + 6, o + 3, o + (TRn - 1) * 3);
        rib.len[i] = Math.min(TRn, rib.len[i] + 1);
      }
      rib.setPoint(i, 0, _w.x, _w.y, _w.z);
      if (p.tSample === 0) rib.setPoint(i, 1, _w.x, _w.y, _w.z);
      // kolor: spowolnienie; pojawianie się i znikanie na brzegach obszaru
      _c.copy(WHITE);
      if (tint) _c.lerp(SLOW, clamp((1 - rel) / 0.55));
      const edge = sm(g.s0, g.s0 + 40, p.s) * (1 - sm(g.s1 - 60, g.s1, p.s));
      rib.setStyle(i, _c.r, _c.g, _c.b, opacity * edge * (0.75 + 0.25 * p.seed), width * (0.8 + 0.4 * p.seed));
    }
  });
  return <primitive object={rib} />;
}

/* ================= wiry z końców łopat ================= */

/**
 * Wiry spływające z końców łopat: każdy koniec zostawia za sobą spiralę, unoszoną z wiatrem z prędkością śladu.
 * Kąt spirali zależy od obrotów: im szybciej kręci się wirnik w stosunku do wiatru, tym gęstsza spirala.
 */
export function TipVortices({ st, U, rpm, a = 0.3, hub, dir = 0, opacity = 0.75 }: { st: TurbineState; U: () => number; rpm: () => number; a?: number; hub: V3; dir?: number; opacity?: number }) {
  const N = 140;
  const rib = useRibbons(3, N);
  rib.fade = 1;
  useFrame(() => {
    const u = U() * (1 - a * 1.6);
    const om = (rpm() * 2 * Math.PI) / 60;
    const c = Math.cos(dir);
    const sn = Math.sin(dir);
    for (let b = 0; b < 3; b++) {
      for (let k = 0; k < N; k++) {
        const tau = k * 0.06;
        const ang = st.angle + om * tau + (b * 2 * Math.PI) / 3;
        const rr = R * (0.98 + 0.12 * (1 - Math.exp(-tau / 2.5)));
        const down = 2 + u * tau;
        // w układzie wirnika: oś w −x (z wiatrem), obrót wokół x
        const py = rr * Math.cos(ang);
        const pz = rr * Math.sin(ang);
        const px = -down;
        // obrót o kierunek wiatru (gondola ustawiona pod wiatr): oś wirnika (cos, sin), bok (−sin, cos)
        const wx = px * c - pz * sn;
        const wz = px * sn + pz * c;
        rib.setPoint(b, k, hub[0] + wx, hub[1] + py, hub[2] + wz);
      }
      rib.len[b] = N;
      rib.setStyle(b, 0.92, 0.96, 1, opacity, 0.45);
    }
  });
  return <primitive object={rib} />;
}

/* ================= struga powietrza (granica Betza) ================= */

/** Przezroczysta struga powietrza przechodzącego przez wirnik: przed wirnikiem węższa, za nim szersza. */
export function StreamTube({ a, hubY, opacity = 0.3 }: { a: number; hubY: number; opacity?: number }) {
  const geo = useMemo(() => {
    const t: FieldTurbine = { s: 0, l: 0, y: hubY, r: R, a };
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 60; i++) {
      const d = -260 + (i / 60) * 620;
      pts.push(new THREE.Vector2(tubeR(t, d), -d));
    }
    const g = new THREE.LatheGeometry(pts, 64);
    // oś lathe (y) → oś x sceny; −d w y → x = +260 przed wirnikiem
    g.rotateZ(-Math.PI / 2);
    return g;
  }, [a, hubY]);
  return (
    <group position={[T.hubX, hubY, 0]}>
      <mesh geometry={geo} renderOrder={4}>
        <meshStandardMaterial color="#7fb8ff" transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} roughness={0.3} />
      </mesh>
    </group>
  );
}
