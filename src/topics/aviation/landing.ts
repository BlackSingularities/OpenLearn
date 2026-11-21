/*
 * Lądowanie A350-1000 – wspólny przebieg w czasie, używany przez zakładki podwozia (amortyzator, hamulce) i do
 * wykorzystania w innych scenach. Wartości typowe dla samolotu o masie do lądowania ok. 220 t, klapy FULL:
 *
 * – podejście po ścieżce 3°: ok. 140 kt (72 m/s), opadanie ok. 3,7 m/s (ok. 730 ft/min), nos ok. 2,5° w górę,
 *   silniki ok. 45% N1 (ciąg utrzymujący prędkość),
 * – wyrównanie (flare) od ok. 30 ft (9 m): pilot podnosi nos do ok. 5,5°, opadanie maleje do ok. 0,9 m/s,
 *   na ok. 20 ft dźwignie ciągu na bieg jałowy („RETARD”), prędkość spada o kilka węzłów,
 * – przyziemienie kół głównych (wózki pochylone – najpierw jedna oś, potem cały wózek),
 * – gdy obie golenie główne są ugięte, wysuwają się spojlery naziemne (gaszą siłę nośną, ciężar przechodzi na koła;
 *   przy jednej goleni i wybranym ciągu wstecznym – częściowo), a ich sygnał uruchamia autobrake,
 * – zaraz po przyziemieniu kół głównych (ok. 0,5 s) pilot wybiera ciąg wsteczny: REV IDLE, odwracacze otwierają się
 *   ok. 1,5 s, a po zielonym REV – MAX REV (koło przednie nie musi jeszcze dotykać pasa),
 * – derotacja: po ok. 1 s pilot łagodnie opuszcza nos (do ok. 1,8°/s), koło przednie dotyka pasa po ok. 5,5 s,
 * – dobieg: hamowanie do zatrzymania (prędkość i drogę liczy scena, bo zależą od wybranego autobrake).
 *
 * Czas t liczony od początku animacji; przyziemienie kół głównych w chwili LANDING.tTD.
 */

export const LANDING = {
  /** Chwila przyziemienia kół głównych (s od początku animacji). */
  tTD: 6,
  /** Początek wyrównania (s) – na wysokości ok. 9 m. */
  tFlare: 2.6,
  /** Prędkość na podejściu i przy przyziemieniu (m/s). */
  vApp: 72,
  vTD: 69,
  /** Prędkość opadania na ścieżce i w chwili przyziemienia (m/s). */
  sinkApp: 3.7,
  sinkTD: 0.9,
  /** Pochylenie (°): na podejściu i przy przyziemieniu. */
  pitchApp: 2.5,
  pitchTD: 5.5,
  /** Po przyziemieniu (s): początek i czas opuszczania nosa. */
  derotStart: 1.0,
  derotTime: 4.5,
  /**
   * Po przyziemieniu (s): spojlery naziemne (tylko podpowiedź – w animacji wysuwają się, gdy obie golenie główne są na
   * pasie), wybór ciągu wstecznego, opóźnienie autobrake po wysunięciu spojlerów i czas dojścia do pełnego opóźnienia.
   */
  spoilerAt: 0.3,
  revAt: 0.5,
  brakeAt: 0.4,
  brakeRamp: 1.5,
  /** N1 (%) na podejściu i na biegu jałowym. */
  n1App: 45,
  n1Idle: 21,
  /** Opóźnienie od oporu powietrza zaraz po przyziemieniu (m/s²). */
  aAero: 0.6,
};

const sm = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
/** Ułamek wyrównania 0…1 w chwili t (przed przyziemieniem). */
const flareK = (t: number) => sm((t - LANDING.tFlare) / (LANDING.tTD - LANDING.tFlare));

/** Prędkość opadania (m/s, dodatnio w dół) przed przyziemieniem. */
const sinkAt = (t: number) => LANDING.sinkApp + (LANDING.sinkTD - LANDING.sinkApp) * flareK(t);

/** Wysokość kół głównych nad pasem: całka prędkości opadania od t do przyziemienia (tablica co 10 ms). */
const H_STEP = 0.01;
const H_TABLE = (() => {
  const n = Math.round(LANDING.tTD / H_STEP);
  const h = new Float32Array(n + 1);
  for (let i = n - 1; i >= 0; i--) {
    const t = (i + 0.5) * H_STEP;
    h[i] = h[i + 1] + sinkAt(t) * H_STEP;
  }
  return h;
})();

export type LandingAir = { h: number; sink: number; pitch: number; v: number; n1: number; flare: number };

/** Stan przed przyziemieniem (t < tTD): wysokość kół głównych (m), opadanie (m/s), pochylenie (°), prędkość (m/s), N1. */
export function landingAir(t: number): LandingAir {
  const tc = Math.max(0, Math.min(LANDING.tTD, t));
  const i = Math.min(H_TABLE.length - 2, Math.floor(tc / H_STEP));
  const f = tc / H_STEP - i;
  const h = H_TABLE[i] + (H_TABLE[i + 1] - H_TABLE[i]) * f;
  const k = flareK(tc);
  // „RETARD” ok. 2 s przed przyziemieniem: ciąg płynnie do biegu jałowego
  const retard = sm((tc - (LANDING.tTD - 2.2)) / 1.4);
  return {
    h,
    sink: sinkAt(tc),
    pitch: LANDING.pitchApp + (LANDING.pitchTD - LANDING.pitchApp) * k,
    v: LANDING.vApp + (LANDING.vTD - LANDING.vApp) * k,
    n1: LANDING.n1App + (LANDING.n1Idle - LANDING.n1App) * retard,
    flare: k,
  };
}

export type LandingGround = { pitch: number; spoiler: boolean; rev: boolean; brake: number; nose: number };

/**
 * Stan po przyziemieniu, u = czas od przyziemienia kół głównych (s): pochylenie (°), czy wysunąć spojlery
 * i odwracacze, udział zadanego opóźnienia autobrake (0…1) i obciążenie koła przedniego (0 – w powietrzu, 1 – postój).
 */
export function landingGround(u: number): LandingGround {
  const d = sm((u - LANDING.derotStart) / LANDING.derotTime);
  const pitch = LANDING.pitchTD * (1 - d);
  return {
    pitch,
    spoiler: u > LANDING.spoilerAt,
    rev: u > LANDING.revAt,
    brake: sm((u - LANDING.brakeAt) / LANDING.brakeRamp),
    // koło przednie przejmuje ciężar w ostatniej fazie derotacji (poniżej ok. 0,7°)
    nose: sm(1 - pitch / 0.7),
  };
}

/** Faza lądowania do podpisów: przed przyziemieniem t < tTD, po – u = t − tTD. */
export function landingPhase(t: number, v: number) {
  const u = t - LANDING.tTD;
  if (u < 0) return t < LANDING.tFlare ? 'podejście po ścieżce 3°' : 'wyrównanie (flare)';
  if (u < LANDING.derotStart) return 'przyziemienie kół głównych';
  const g = landingGround(u);
  if (g.nose < 0.99) return 'derotacja – opuszczanie nosa';
  if (v > 0.5) return 'dobieg i hamowanie';
  return 'samolot stoi';
}
