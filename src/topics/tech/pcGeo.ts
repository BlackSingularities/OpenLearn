/*
 * Komputer osobisty – wymiary, położenia podzespołów, drogi przepływów i dane do wykresów (bez Reacta).
 *
 * Jednostka: centymetr. Pokój: podłoga y = 0, blat biurka na wysokości 77 cm. Komputer (obudowa typu „midi
 * tower”) stoi na biurku po prawej. Jego układ lokalny: x – od tyłu (−22,5) do przodu (+22,5), y – od dna w górę,
 * z – od ściany z płytą główną (0) do szyby bocznej (22). Szyba patrzy w stronę widza (+z świata).
 * Powiększone modele („pracownie”) stoją daleko na prawo od pokoju, każda na własnym podeście.
 */

export type V3 = [number, number, number];

/** Wspólny układ tematu: 1 cm = 0,5 jednostki sceny. */
export const FRAME = { position: [0, 0, 0] as V3, scale: 0.5 };

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const sm = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ================= pokój i biurko ================= */

export const DESK = { x0: -90, x1: 90, z0: -38, z1: 38, top: 77, th: 3 };
export const WALL_Z = -60;
export const WALL_X = -170;
export const MONITOR = { x: -32, z: -18, w: 61, h: 35, y0: DESK.top + 12 };
export const KEYBOARD = { x: -32, z: 16 };
export const MOUSE = { x: 0, z: 18 };

/* ================= obudowa (układ lokalny komputera) ================= */

/** Położenie komputera na biurku (punkt (0,0,0) układu lokalnego). */
export const PC_O: V3 = [32, DESK.top, -14];
export const CASE = { x0: -22.5, x1: 22.5, y0: 0, y1: 47, z0: 0, z1: 22, wall: 0.8 };
/** Przegroda nad zasilaczem (osłona). */
export const SHROUD = { x0: -22, x1: 3, y: 10.5 };
/** Płyta główna ATX 30,5 × 24,4 cm na kołkach dystansowych. */
export const MB = { x0: -21.5, x1: 2.9, y0: 14, y1: 44.5, z: 1.4, th: 0.16 };
/** Wierzch płyty (z), na nim stoją elementy. */
export const MBZ = MB.z + MB.th;
export const SOCKET = { x: -8.5, y: 33.5, w: 4.5, h: 3.75 };
export const DIMMS = [-2.2, -1.3, -0.1, 0.8];
export const DIMM = { y0: 26.2, y1: 39.5 };
export const PCIE = { y: 22.4, x0: -19.5, x1: -10.5 };
export const M2 = { y: 26, x0: -15.5, x1: -7.5 };
export const CHIPSET = { x: -3.6, y: 18.6 };
export const CMOS = { x: -12, y: 15.2 };
export const BIOS = { x: -0.6, y: 16.2 };
export const CODEC = { x: -19, y: 16.6 };
export const ATX24 = { x: 2.2, y: 30 };
export const EPS = { x: -16, y: 43.6 };
export const SATA = { x: 2.3, y: 18 };
/** Karta graficzna: płytka drukowana poziomo (płaszczyzna x–z), wentylatory w dół. */
export const GPU = { x0: -21.4, x1: 9.5, y: 21.6, z0: MBZ + 1, z1: 13.6, cool: 5.6 };
export const PSU = { x0: -22, x1: -7, y0: 0.6, y1: 9.2, z0: 3.5, z1: 17.5 };
export const HDD = { x0: 4, x1: 18.7, y0: 0.9, y1: 3.5, z0: 5, z1: 15.2 };
export const FANS_FRONT = [16, 28.5, 41];
export const FAN_REAR = { y: 37, z: 11 };
export const COOLER = { w: 12.4, d: 5.2, h: 15.5 };

/** Punkt układu lokalnego komputera w układzie pokoju. */
export const pc = (x: number, y: number, z: number): V3 => [PC_O[0] + x, PC_O[1] + y, PC_O[2] + z];

/* ================= pracownie (powiększenia) ================= */

const LX = (i: number): V3 => [700 + i * 320, 0, 0];
export const LAB = {
  psu: LX(0),
  pcb: LX(1),
  cpuCut: LX(2),
  die: LX(3),
  fin: LX(4),
  pipe: LX(5),
  cool: LX(6),
  mem: LX(7),
  dram: LX(8),
  nand: LX(9),
  hdd: LX(10),
  pyr: LX(11),
  gpu: LX(12),
  raster: LX(13),
  cores: LX(14),
  lcd: LX(15),
  key: LX(16),
  mouse: LX(17),
  ports: LX(18),
  tube: LX(19),
  crt: LX(20),
  media: LX(21),
  moore: LX(22),
};
/** Wysokość eksponatu nad podestem. */
export const LAB_Y = 95;

/** Muzeum za pokojem: ENIAC jako ściana szaf w tle, przed nim trzy komputery w rzędzie. */
export const MUSEUM_Z = -900;
export const MUSEUM = {
  eniac: [0, 0, MUSEUM_Z - 170] as V3,
  ibm: [-150, 0, MUSEUM_Z] as V3,
  beige: [0, 0, MUSEUM_Z] as V3,
  today: [152, 0, MUSEUM_Z] as V3,
};

/* ================= drogi przepływów (w układzie pokoju) ================= */

const P = (pts: [number, number, number][]): V3[] => pts.map(([x, y, z]) => pc(x, y, z));
/** Od klawiatury kablem do portu USB z tyłu komputera, dalej do chipsetu i procesora. */
export const PATH_KEY: V3[] = [
  [KEYBOARD.x + 16, DESK.top + 1.5, KEYBOARD.z - 6],
  [KEYBOARD.x + 18, DESK.top + 0.4, KEYBOARD.z - 14],
  [PC_O[0] - 26, DESK.top + 0.4, PC_O[2] + 8],
  ...P([
    [-23.5, 1, 11],
    [-23.5, 38, 11],
    [-21.5, 38, MBZ + 0.6],
    [-12, 25, MBZ + 0.4],
    [CHIPSET.x, CHIPSET.y, MBZ + 0.6],
    [-6, 27, MBZ + 0.4],
    [SOCKET.x, SOCKET.y, MBZ + 1],
  ]),
];
/** Procesor ↔ pamięć RAM (tam i z powrotem). */
export const PATH_RAM: V3[] = P([
  [SOCKET.x, SOCKET.y, MBZ + 1],
  [-4, SOCKET.y + 1, MBZ + 0.4],
  [DIMMS[1], 33, MBZ + 2],
  [DIMMS[1], 33, MBZ + 3.5],
]);
/** Procesor → slot PCIe → karta graficzna → złącze monitora → kabel → monitor. */
export const PATH_GPU: V3[] = [
  ...P([
    [SOCKET.x, SOCKET.y, MBZ + 1],
    [-11, 26, MBZ + 0.4],
    [-14, PCIE.y, MBZ + 0.4],
    [-10, GPU.y - 0.5, 6],
    [-20, GPU.y - 0.5, 6],
    [-23.5, GPU.y - 1, 6],
    [-24.5, GPU.y - 1, 6],
    [-25, 1, 6],
  ]),
  [MONITOR.x + 10, DESK.top + 0.4, MONITOR.z - 8],
  [MONITOR.x, DESK.top + 6, MONITOR.z - 4],
  [MONITOR.x, MONITOR.y0 + 12, MONITOR.z - 3],
];
/** Prąd: z zasilacza kablami do płyty, procesora, karty graficznej i dysku. */
export const PWR_MB: V3[] = P([
  [-8, 6, 10],
  [3, 9, 18],
  [4.5, 12, 18],
  [4.5, 30, 18],
  [ATX24.x + 0.6, ATX24.y, 6],
  [ATX24.x, ATX24.y, MBZ + 1],
]);
export const PWR_CPU: V3[] = P([
  [-15, 8, 4],
  [-21.8, 12, 3],
  [-21.8, 45.5, 3],
  [EPS.x, 45.5, 3],
  [EPS.x, EPS.y, MBZ + 1],
]);
export const PWR_GPU: V3[] = P([
  [-10, 8, 14],
  [0, 11, 17],
  [6, 15, 17],
  [6, GPU.y - 2, 13],
]);
export const PWR_HDD: V3[] = P([
  [-8, 4, 8],
  [3, 3, 5],
  [HDD.x0 + 1, 2.2, 6],
]);
/** Powietrze: wlot przodem, przez wnętrze, wylot tyłem (kilka strug). */
export const airPaths = (k: number): V3[] => {
  const y = FANS_FRONT[k];
  const z = 8 + k * 2.5;
  return P([
    [25, y, z],
    [21, y, z],
    [6, y + 2, z],
    [-6, mix(y, FAN_REAR.y, 0.6), z - 1],
    [-20, FAN_REAR.y + (k - 1) * 3, FAN_REAR.z],
    [-26, FAN_REAR.y + (k - 1) * 3, FAN_REAR.z],
    [-32, FAN_REAR.y + (k - 1) * 4 + 3, FAN_REAR.z],
  ]);
};

/* ================= dane ================= */

/** Pobór mocy podzespołów (W) przy grze. */
export const POWER: [string, number, string][] = [
  ['karta graficzna', 285, '#4ade80'],
  ['procesor', 125, '#60a5fa'],
  ['płyta główna i RAM', 35, '#c084fc'],
  ['wentylatory i dyski', 15, '#f472b6'],
];
/** Hierarchia pamięci: nazwa, czas dostępu (ns), pojemność (bajty), opis pojemności, czas „ludzki”. */
export const MEM_LEVELS: [string, number, number, string, string][] = [
  ['rejestry', 0.2, 1e3, 'ok. 1 KB', '1 s'],
  ['pamięć podręczna L1', 1, 8e4, '80 KB', '5 s'],
  ['pamięć podręczna L2', 4, 2e6, '2 MB', '20 s'],
  ['pamięć podręczna L3', 12, 3.6e7, '36 MB', '1 min'],
  ['RAM', 80, 3.2e10, '32 GB', '7 min'],
  ['dysk SSD', 60_000, 2e12, '2 TB', '3,5 dnia'],
  ['dysk HDD', 8_000_000, 8e12, '8 TB', '1,3 roku'],
];
/** Prawo Moore'a: rok, liczba tranzystorów, układ. */
export const MOORE: [number, number, string][] = [
  [1971, 2_300, 'Intel 4004'],
  [1978, 29_000, 'Intel 8086'],
  [1985, 275_000, 'Intel 386'],
  [1993, 3_100_000, 'Pentium'],
  [2000, 42_000_000, 'Pentium 4'],
  [2006, 291_000_000, 'Core 2 Duo'],
  [2012, 1_400_000_000, 'Core i7 (3. gen.)'],
  [2017, 4_800_000_000, 'Ryzen 7'],
  [2020, 16_000_000_000, 'Apple M1'],
  [2024, 92_000_000_000, 'Apple M3 Max'],
];
/** Komputer kiedyś i dziś – porównanie. */
export const ERAS: [string, string, string, string, string][] = [
  ['', 'ENIAC 1946', 'IBM PC 1981', 'PC 1998', 'PC dziś'],
  ['takt', '0,1 MHz', '4,77 MHz', '400 MHz', '5 500 MHz'],
  ['pamięć', '20 liczb', '64 KB', '64 MB', '32 GB'],
  ['dysk', '–', 'dyskietka 360 KB', '8 GB', '2 TB'],
  ['masa', '27 t', '13 kg', '12 kg', '10 kg'],
  ['pobór mocy', '150 kW', '130 W', '150 W', '450 W'],
];
/** Nośniki danych: nazwa, rok, pojemność (bajty), opis. */
export const MEDIA: [string, number, number, string][] = [
  ['karta perforowana', 1928, 80, '80 znaków'],
  ['dyskietka 5,25″', 1978, 360e3, '360 KB'],
  ['dyskietka 3,5″', 1987, 1.44e6, '1,44 MB'],
  ['płyta CD', 1990, 700e6, '700 MB'],
  ['pendrive', 2000, 64e9, '64 GB'],
  ['karta microSD', 2005, 1e12, '1 TB'],
];
