/*
 * Smugi przepływu – jeden wspólny sposób rysowania w całej aplikacji (silnik, skrzydło, opływ samolotu).
 *
 * Każda cząstka zostawia za sobą wstęgę z ostatnich położeń: jasna i szeroka głowa, ogon miękko zanika i się zwęża,
 * a przy skręcie toru wstęga wygina się razem z powietrzem. Wstęga jest zawsze zwrócona do kamery.
 *
 * TrailMesh ma te same metody co InstancedMesh używany do starych smug (setMatrixAt, setColorAt, instanceMatrix,
 * instanceColor), więc systemy cząstek liczą ruch po staremu – zmienia się tylko rysowanie. Z macierzy brane są:
 * położenie (głowa smugi), skala X (0 – smuga niewidoczna) i skala Y (grubość).
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _t = new THREE.Vector3();
const _side = new THREE.Vector3();

export class TrailMesh extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  readonly count: number;
  readonly TR: number;
  private hist: Float32Array;
  private len: Uint8Array;
  private step: Float32Array;
  private col: Float32Array;
  private wid: Float32Array;
  private vis: Float32Array;
  /** Zgodność z InstancedMesh (wywołujący ustawiają needsUpdate – tu przebudowa i tak następuje co klatkę). */
  instanceMatrix = { needsUpdate: false };
  instanceColor = { needsUpdate: false };

  constructor(count: number, opacity = 0.9, TR = 14) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * TR * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * TR * 6), 3));
    const idx = new Uint32Array(count * (TR - 1) * 6);
    let n = 0;
    for (let p = 0; p < count; p++)
      for (let k = 0; k < TR - 1; k++) {
        const a = (p * TR + k) * 2;
        idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], n);
        n += 6;
      }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    super(g, m);
    this.count = count;
    this.TR = TR;
    this.hist = new Float32Array(count * TR * 3);
    this.len = new Uint8Array(count);
    this.step = new Float32Array(count);
    this.col = new Float32Array(count * 3).fill(1);
    this.wid = new Float32Array(count).fill(0.05);
    this.vis = new Float32Array(count);
    this.frustumCulled = false;
    this.raycast = () => {};
  }

  /** Nowe położenie głowy smugi i–tej cząstki (szerokość wstęgi, widoczność 0…1). */
  push(i: number, x: number, y: number, z: number, width = 0.05, vis = 1) {
    const TR = this.TR;
    const h = this.hist;
    const o = i * TR * 3;
    const n = this.len[i];
    this.wid[i] = width;
    this.vis[i] = vis;
    if (n > 0) {
      const d = Math.hypot(x - h[o], y - h[o + 1], z - h[o + 2]);
      // zatrzymana cząstka (pauza) nie skraca ogona; skok (nowa cząstka na początku toru) zaczyna smugę od nowa
      if (d < 1e-6) return;
      if (d > Math.max(1e-3, this.step[i] * 12) && n > 2) this.len[i] = 0;
      else this.step[i] = this.step[i] ? this.step[i] * 0.8 + d * 0.2 : d;
    }
    h.copyWithin(o + 3, o, o + (TR - 1) * 3);
    h[o] = x;
    h[o + 1] = y;
    h[o + 2] = z;
    this.len[i] = Math.min(TR, this.len[i] + 1);
  }

  /** Kolor cząstki (rgb 0…1). */
  setColor(i: number, r: number, g: number, b: number) {
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
  }

  /** Zgodność z InstancedMesh: macierz → głowa smugi, widoczność (skala X) i grubość (skala Y). */
  setMatrixAt(i: number, m: THREE.Matrix4) {
    const e = m.elements;
    const sx = Math.hypot(e[0], e[1], e[2]);
    const sy = Math.hypot(e[4], e[5], e[6]);
    this.push(i, e[12], e[13], e[14], sy * 4, sx > 1e-5 ? 1 : 0);
  }

  setColorAt(i: number, c: THREE.Color) {
    this.setColor(i, c.r, c.g, c.b);
  }

  /** Przed narysowaniem: wstęgi z historii położeń, zwrócone do kamery. */
  onBeforeRender = (_r: THREE.WebGLRenderer, _s: THREE.Scene, camera: THREE.Camera) => {
    const TR = this.TR;
    _inv.copy(this.matrixWorld).invert();
    _cam.copy(camera.position).applyMatrix4(_inv);
    const P = (this.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const C = (this.geometry.getAttribute('color') as THREE.BufferAttribute).array as Float32Array;
    const h = this.hist;
    for (let i = 0; i < this.count; i++) {
      const n = this.len[i];
      const o = i * TR * 3;
      const vis = n >= 2 ? this.vis[i] : 0;
      for (let k = 0; k < TR; k++) {
        const kk = Math.min(k, Math.max(0, n - 1));
        const q = o + kk * 3;
        const qa = o + Math.max(0, kk - 1) * 3;
        const qb = o + Math.min(Math.max(0, n - 1), kk + 1) * 3;
        _t.set(h[qa] - h[qb], h[qa + 1] - h[qb + 1], h[qa + 2] - h[qb + 2]);
        if (_t.lengthSq() < 1e-14) _t.set(1, 0, 0);
        _v.set(h[q], h[q + 1], h[q + 2]);
        _side.copy(_cam).sub(_v).cross(_t).normalize();
        const f = k < n ? 1 - k / (TR - 1) : 0; // 1 – głowa, 0 – ogon
        const half = this.wid[i] * (0.25 + 0.75 * f) * 0.5;
        const j = (i * TR + k) * 6;
        P[j] = _v.x + _side.x * half;
        P[j + 1] = _v.y + _side.y * half;
        P[j + 2] = _v.z + _side.z * half;
        P[j + 3] = _v.x - _side.x * half;
        P[j + 4] = _v.y - _side.y * half;
        P[j + 5] = _v.z - _side.z * half;
        const a = Math.pow(f, 1.6) * vis;
        const r = this.col[i * 3] * a;
        const g = this.col[i * 3 + 1] * a;
        const b = this.col[i * 3 + 2] * a;
        C[j] = r;
        C[j + 1] = g;
        C[j + 2] = b;
        C[j + 3] = r;
        C[j + 4] = g;
        C[j + 5] = b;
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

/** Smugi jako element sceny; ref daje TrailMesh (push / setMatrixAt / setColorAt). */
export const Trails = forwardRef<TrailMesh, { count: number; opacity?: number; length?: number }>(function Trails({ count, opacity = 0.9, length = 14 }, ref) {
  const mesh = useMemo(() => new TrailMesh(count, opacity, length), [count, length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    mesh.material.opacity = opacity;
  }, [mesh, opacity]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  useImperativeHandle(ref, () => mesh, [mesh]);
  return <primitive object={mesh} />;
});
