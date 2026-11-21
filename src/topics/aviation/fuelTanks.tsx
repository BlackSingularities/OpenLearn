/*
 * Zbiorniki paliwa A350-1000 – wspólne dla zakładki „Masa i wyważenie” (moduł usterzenia) i tankowania (moduł
 * silnika): kształt zbiorników w skrzydłach i centropłacie, podział paliwa między nie, jego środek ciężkości i
 * „prześwietlone” wypełnienie widoczne przez poszycie.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PLANE_LEVELS, wingSurface } from './airliner';

type V3 = [number, number, number];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/*
 * Zbiorniki paliwa A350-1000 (przybliżone): lewy i prawy w skrzydłach, między dźwigarami, od boku kadłuba prawie do
 * końcówki (dalej zbiornik odpowietrzający), oraz centralny w centropłacie pod podłogą kabiny. Tankowanie: najpierw
 * skrzydła, potem centralny; w locie centralny zużywany jest pierwszy. Paliwo w skrzydle wypełniamy od kadłuba na
 * zewnątrz – skrzydło ma skos, więc im więcej paliwa, tym dalej do tyłu jego środek ciężkości.
 */
export const TANK = { s0: 0.15, s1: 0.6, r0: 3.3, r1: 25.5, wingMax: 41000, centerMax: 43000, n: 28 };
type TankSec = { pts: V3[]; x: number };
/** Przekroje zbiornika skrzydłowego (lewego): 4 narożniki – góra przód, góra tył, dół tył, dół przód – lekko wsunięte w poszycie. */
export const wingTankSections = (() => {
  const out: { r: number; sec: TankSec; area: number }[] = [];
  for (let i = 0; i <= TANK.n; i++) {
    const r = TANK.r0 + ((TANK.r1 - TANK.r0) * i) / TANK.n;
    const tf = wingSurface(r, TANK.s0, 1);
    const tr = wingSurface(r, TANK.s1, 1);
    const br = wingSurface(r, TANK.s1, -1);
    const bf = wingSurface(r, TANK.s0, -1);
    const pts = [tf, tr, br, bf];
    const c = pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4] as V3, [0, 0, 0] as V3);
    const ins = pts.map((p) => [c[0] + (p[0] - c[0]) * 0.9, c[1] + (p[1] - c[1]) * 0.85, p[2]] as V3);
    const area = (tr[0] - tf[0]) * ((tf[1] - bf[1] + (tr[1] - br[1])) / 2);
    out.push({ r, sec: { pts: ins, x: c[0] }, area });
  }
  // objętość odcinków między przekrojami (do wypełniania i środka ciężkości paliwa)
  const seg = out.slice(1).map((o, i) => ({ v: ((o.area + out[i].area) / 2) * (o.r - out[i].r), x: (o.sec.x + out[i].sec.x) / 2 }));
  return { secs: out, seg, vol: seg.reduce((a, q) => a + q.v, 0) };
})();
/** Zbiornik centralny: skrzynia centropłata między dźwigarami, na szerokość kadłuba. */
export const CENTER_TANK = (() => {
  const f = wingSurface(TANK.r0, TANK.s0, 1);
  const r = wingSurface(TANK.r0, TANK.s1, 1);
  const b = wingSurface(TANK.r0, 0.35, -1);
  return { x0: f[0] + 0.2, x1: r[0] - 0.2, y0: b[1] + 0.1, y1: Math.min(f[1], PLANE_LEVELS.floor) - 0.15, halfW: 2.6 };
})();

/** Podział paliwa: skrzydła po równo do pełna, reszta do centralnego. Ramiona (x) z faktycznie wypełnionej części. */
export function fuelSplit(fuel: number) {
  const wing = Math.min(fuel, 2 * TANK.wingMax) / 2;
  const center = Math.max(0, fuel - 2 * TANK.wingMax);
  const fw = wing / TANK.wingMax;
  const fc = center / TANK.centerMax;
  // wypełnienie od kadłuba: odcinki do objętości fw·V (ostatni częściowo)
  let left = fw * wingTankSections.vol;
  let vSum = 0;
  let mx = 0;
  let reach = 0; // ile odcinków (z ułamkiem) jest wypełnionych
  for (const q of wingTankSections.seg) {
    if (left <= 0) break;
    const take = Math.min(q.v, left);
    vSum += take;
    mx += take * q.x;
    reach += take / q.v;
    left -= take;
  }
  const wingX = vSum > 0 ? mx / vSum : wingTankSections.seg[0].x;
  const centerX = (CENTER_TANK.x0 + CENTER_TANK.x1) / 2;
  const moment = 2 * wing * wingX + center * centerX;
  return { wing, center, fw, fc, reach, wingX, centerX, x: fuel > 0 ? moment / fuel : centerX, moment };
}

/** Bryła zbiornika skrzydłowego od kadłuba do „reach” odcinków (ułamek dopuszczalny); mirror – prawe skrzydło. */
function wingTankGeometry(reach: number, mirror: boolean) {
  const S = wingTankSections.secs;
  const full = Math.floor(reach);
  const secs: V3[][] = S.slice(0, full + 1).map((q) => q.sec.pts);
  const frac = reach - full;
  if (frac > 1e-3 && full + 1 < S.length) {
    const a = S[full].sec.pts;
    const b = S[full + 1].sec.pts;
    secs.push(a.map((p, i) => [p[0] + (b[i][0] - p[0]) * frac, p[1] + (b[i][1] - p[1]) * frac, p[2] + (b[i][2] - p[2]) * frac] as V3));
  }
  const pos: number[] = [];
  const put = (p: V3) => pos.push(p[0], p[1], mirror ? -p[2] : p[2]);
  const tri = (a: V3, b: V3, c: V3) => {
    put(a);
    put(b);
    put(c);
  };
  for (let i = 0; i + 1 < secs.length; i++) {
    const A = secs[i];
    const B = secs[i + 1];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      tri(A[k], B[k], B[k2]);
      tri(A[k], B[k2], A[k2]);
    }
  }
  if (secs.length > 1) {
    for (const C of [secs[0], secs[secs.length - 1]]) {
      tri(C[0], C[1], C[2]);
      tri(C[0], C[2], C[3]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export const C_FUEL = '#a78bfa';
const xrayMat = (c: string, o: number) => <meshBasicMaterial color={c} transparent opacity={o} depthTest={false} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />;

/** Paliwo w zbiornikach, prześwietlone przez poszycie: obrys całego zbiornika blado, paliwo – wypełnieniem. */
export function FuelTanks({ fuel, color = C_FUEL }: { fuel: number; color?: string }) {
  const f = fuelSplit(fuel);
  const rq = Math.round(f.reach * 50) / 50;
  const outline = useMemo(() => [wingTankGeometry(TANK.n, false), wingTankGeometry(TANK.n, true)], []);
  const filled = useMemo(() => (rq > 0.01 ? [wingTankGeometry(rq, false), wingTankGeometry(rq, true)] : null), [rq]);
  useEffect(() => () => filled?.forEach((g) => g.dispose()), [filled]);
  const ct = CENTER_TANK;
  const L = ct.x1 - ct.x0;
  const H = ct.y1 - ct.y0;
  const hc = H * clamp(f.fc, 0, 1);
  return (
    <group>
      {outline.map((g, i) => (
        <mesh key={`o${i}`} geometry={g} renderOrder={11} raycast={() => null}>
          {xrayMat(color, 0.07)}
        </mesh>
      ))}
      {filled?.map((g, i) => (
        <mesh key={`f${rq}-${i}`} geometry={g} renderOrder={12} raycast={() => null}>
          {xrayMat(color, 0.55)}
        </mesh>
      ))}
      <mesh position={[ct.x0 + L / 2, ct.y0 + H / 2, 0]} renderOrder={11} raycast={() => null}>
        <boxGeometry args={[L, H, 2 * ct.halfW]} />
        {xrayMat(color, 0.07)}
      </mesh>
      {hc > 0.02 && (
        // paliwo w centralnym zbiorniku wypełnia go od dna
        <mesh position={[ct.x0 + L / 2, ct.y0 + hc / 2, 0]} renderOrder={12} raycast={() => null}>
          <boxGeometry args={[L - 0.1, hc, 2 * ct.halfW - 0.1]} />
          {xrayMat(color, 0.55)}
        </mesh>
      )}
    </group>
  );
}
