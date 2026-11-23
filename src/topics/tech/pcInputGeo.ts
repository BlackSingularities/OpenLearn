/*
 * Komputer osobisty – bryły klawiatury i myszy wspólne dla biurka i pracowni: nasadka klawisza (ścięty
 * ostrosłup) oraz skorupa i spód myszy liczone z profilu w milimetrach.
 */
import * as THREE from 'three';

/* ================= nasadka klawisza ================= */

let CAP: THREE.BufferGeometry | null = null;
/** Nasadka: podstawa 1 × 1 na y = 0, wierzch 0,8 × 0,8 na y = 1 (skalować do szerokości klawisza). */
export function keycapGeo() {
  if (CAP) return CAP;
  const g = new THREE.CylinderGeometry(Math.SQRT1_2 * 0.8, Math.SQRT1_2, 1, 4, 1).toNonIndexed();
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  g.computeVertexNormals();
  return (CAP = g);
}

/* ================= mysz (w mm, przód w x = −60) ================= */

/** Wykładniki przekroju poprzecznego (1 – elipsa, mniej – bardziej kanciasty). */
export const SE_Y = 0.75;
export const SE_Z = 0.8;
/** Spód skorupy (nad spodem obudowy). */
export const MB = 2.5;
/** Wysokość grzbietu myszy nad MB w miejscu x (mm). */
export const MH = (x: number) => {
  const e = Math.max(0, 1 - (x / 60) ** 6) ** (1 / 3);
  return (13 + 23 * Math.exp(-(((x - 8) / 40) ** 2))) * e;
};
/** Połowa szerokości myszy w miejscu x – z tyłu szersza, pod dłonią. */
export const MW = (x: number) => (29 + (4 * x) / 60) * Math.max(0, 1 - (x / 60) ** 4) ** 0.25;

/**
 * Skorupa myszy: przekroje poprzeczne to „zaokrąglone prostokąty” o wysokości MH i szerokości MW.
 * `half` – tylko połowa za płaszczyzną z = 0 (do przekroju wzdłuż).
 */
export function mouseShellGeo(half: boolean) {
  const NX = 64;
  const NT = 22;
  const t0 = half ? 0 : -Math.PI / 2;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= NX; i++) {
    const x = -60 + (120 * i) / NX;
    const h = MH(x);
    const w = MW(x);
    for (let j = 0; j <= NT; j++) {
      const t = t0 + ((Math.PI / 2 - t0) * j) / NT;
      const s = Math.sin(t);
      const c = Math.cos(t);
      pos.push(x, MB + h * Math.abs(c) ** SE_Y, -w * Math.sign(s) * Math.abs(s) ** SE_Z);
    }
  }
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NT; j++) {
      const a = i * (NT + 1) + j;
      const b = a + NT + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Obrys myszy z góry (x, −szerokość); `half` – tylko połowa z ≤ 0. */
function footprint(half: boolean, inset = 0) {
  const s = new THREE.Shape();
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const x = -60 + inset + ((120 - 2 * inset) * i) / N;
    const w = Math.max(0, MW(x) - inset);
    if (i === 0) s.moveTo(x, -w);
    else s.lineTo(x, -w);
  }
  if (half) {
    s.lineTo(60 - inset, 0);
    s.lineTo(-60 + inset, 0);
  } else
    for (let i = N; i >= 0; i--) {
      const x = -60 + inset + ((120 - 2 * inset) * i) / N;
      s.lineTo(x, Math.max(0, MW(x) - inset));
    }
  return s;
}

/** Spód myszy: płyta od y = 0,8 do y = MB + 1,3, obrys jak skorupa. */
export function mouseBaseGeo(half: boolean) {
  const th = MB + 1.3 - 0.8;
  const g = new THREE.ExtrudeGeometry(footprint(half, 0.6), { depth: th, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(Math.PI / 2);
  g.translate(0, MB + 1.3, 0);
  return g;
}

/** Profil przekroju wzdłuż: skorupa jako pas grubości 2,2 mm. */
export function mouseShellCut() {
  const s = new THREE.Shape();
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const x = -60 + (120 * i) / N;
    const y = MB + MH(x);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const x = -56.5 + (113 * i) / N;
    s.lineTo(x, MB + MH(x) - 2.2);
  }
  return s;
}
