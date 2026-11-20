/**
 * Opływ profilu Żukowskiego – dokładne rozwiązanie przepływu potencjalnego (nielepkiego, nieściśliwego)
 * z cyrkulacją dobraną z warunku Kutty (przepływ schodzi gładko z ostrej krawędzi spływu).
 *
 * Płaszczyzna ζ: walec o środku μ = (−t, f) i promieniu a, przechodzący przez ζ = 1.
 * Odwzorowanie z = ζ + 1/ζ zamienia walec w profil o cięciwie ≈ 4 (od ok. −2 do 2).
 */

export interface C {
  re: number;
  im: number;
}
const c = (re: number, im = 0): C => ({ re, im });
const add = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
const sub = (a: C, b: C): C => c(a.re - b.re, a.im - b.im);
const mul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im || 1e-12;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const expi = (t: number): C => c(Math.cos(t), Math.sin(t));
const abs = (a: C) => Math.hypot(a.re, a.im);
function csqrt(a: C): C {
  const r = abs(a);
  const re = Math.sqrt(Math.max(0, (r + a.re) / 2));
  const im = Math.sign(a.im || 1) * Math.sqrt(Math.max(0, (r - a.re) / 2));
  return c(re, im);
}

export interface Airfoil {
  mu: C;
  a: number;
  beta: number;
  /** krawędź natarcia i spływu w płaszczyźnie z */
  xLE: number;
  xTE: number;
  chord: number;
}

/** t – „grubość” (0..0,2), f – „wygięcie” (0..0,2). */
export function makeAirfoil(t: number, f: number): Airfoil {
  const mu = c(-t, f);
  const a = Math.hypot(1 + t, f);
  const beta = Math.atan2(f, 1 + t);
  let xLE = Infinity;
  let xTE = -Infinity;
  for (let i = 0; i < 360; i++) {
    const z = toZ(add(mu, mul(c(a), expi((i / 360) * Math.PI * 2))));
    xLE = Math.min(xLE, z.re);
    xTE = Math.max(xTE, z.re);
  }
  return { mu, a, beta, xLE, xTE, chord: xTE - xLE };
}

export const toZ = (zeta: C): C => add(zeta, div(c(1), zeta));

/** Odwrotność odwzorowania: wybieramy pierwiastek leżący na zewnątrz walca. */
export function toZeta(z: C, af: Airfoil): C {
  const s = csqrt(sub(mul(z, z), c(4)));
  const z1 = mul(add(z, s), c(0.5));
  const z2 = mul(sub(z, s), c(0.5));
  return abs(sub(z1, af.mu)) >= abs(sub(z2, af.mu)) ? z1 : z2;
}

/** Cyrkulacja z warunku Kutty (U = 1). */
export const gammaKutta = (af: Airfoil, alpha: number) => 4 * Math.PI * af.a * Math.sin(alpha + af.beta);

/** Prędkość (u, v) w punkcie z układu profilu, przepływ swobodny U = 1 pod kątem alpha. */
export function velocity(z: C, af: Airfoil, alpha: number, G = gammaKutta(af, alpha)): { u: number; v: number; inside: boolean } {
  const zeta = toZeta(z, af);
  const d = sub(zeta, af.mu);
  const r = abs(d);
  if (r < af.a * 0.999) return { u: 0, v: 0, inside: true };
  const dW = add(sub(expi(-alpha), div(mul(c(af.a * af.a), expi(alpha)), mul(d, d))), div(c(0, G / (2 * Math.PI)), d));
  const dz = sub(c(1), div(c(1), mul(zeta, zeta)));
  // w pobliżu krawędzi spływu oba czynniki dążą do zera – ograniczamy dzielnik
  const dzSafe = abs(dz) < 0.02 ? mul(dz, c(0.02 / Math.max(1e-6, abs(dz)))) : dz;
  const w = div(dW, dzSafe);
  return { u: w.re, v: -w.im, inside: false };
}

/** Obrys profilu (w płaszczyźnie z), n punktów, zaczynając od krawędzi spływu po górze. */
export function outline(af: Airfoil, n = 200): { x: number; y: number; theta: number }[] {
  const th0 = Math.atan2(-af.mu.im, 1 - af.mu.re); // kąt punktu ζ = 1
  return Array.from({ length: n + 1 }, (_, i) => {
    const th = th0 + (i / n) * Math.PI * 2;
    const z = toZ(add(af.mu, mul(c(af.a), expi(th))));
    return { x: z.re, y: z.im, theta: th };
  });
}

/** Współczynnik ciśnienia na powierzchni: Cp = 1 − (V/U)². */
export function surfaceCp(af: Airfoil, alpha: number, n = 160) {
  const G = gammaKutta(af, alpha);
  return outline(af, n).map((p) => {
    // prędkość na walcu jest styczna: |dW/dζ| = |2U sin(θ − α) + Γ/(2πa)|
    const vt = Math.abs(2 * Math.sin(p.theta - alpha) + G / (2 * Math.PI * af.a));
    const zeta = add(af.mu, mul(c(af.a), expi(p.theta)));
    const dz = abs(sub(c(1), div(c(1), mul(zeta, zeta))));
    const V = vt / Math.max(dz, 0.05);
    return { x: p.x, y: p.y, cp: 1 - V * V };
  });
}

/** Współczynnik siły nośnej teorii przepływu potencjalnego: CL = 2Γ / (U·c). */
export const liftCoef = (af: Airfoil, alpha: number) => (2 * gammaKutta(af, alpha)) / af.chord;

/** Gęstość powietrza w atmosferze wzorcowej ISA (troposfera). */
export const isaRho = (h: number) => 1.225 * Math.pow(Math.max(0.05, 1 - 2.25577e-5 * h), 4.25588);

/** Profil NACA 4-cyfrowy: m – wygięcie, p – położenie wygięcia, t – grubość (ułamki cięciwy). */
export function naca(m: number, p: number, t: number, n = 80) {
  const up: [number, number][] = [];
  const lo: [number, number][] = [];
  const camber: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos((i / n) * Math.PI)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    let yc = 0;
    let dy = 0;
    if (m > 0) {
      if (x < p) {
        yc = (m / (p * p)) * (2 * p * x - x * x);
        dy = ((2 * m) / (p * p)) * (p - x);
      } else {
        yc = (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x);
        dy = ((2 * m) / ((1 - p) ** 2)) * (p - x);
      }
    }
    const th = Math.atan(dy);
    up.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
    lo.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
    camber.push([x, yc]);
  }
  return { up, lo, camber };
}
