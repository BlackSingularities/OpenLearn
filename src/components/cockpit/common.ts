/** Barwy wyświetlaczy kokpitu w stylu Airbusa (jasne kolory na czarnym tle). */
export const AIRBUS = {
  bg: '#05070a',
  sky: '#2f8fd6',
  ground: '#8a4a1c',
  tape: '#5b636c',
  white: '#f2f4f6',
  green: '#3ee36b',
  cyan: '#38d6ee',
  yellow: '#f6d53b',
  magenta: '#ff4fd8',
  amber: '#ffb000',
  red: '#ff3b30',
};

/** Czcionka wyświetlaczy: wąska, techniczna. */
export const cockpitFont = "'Geist Mono', 'Consolas', ui-monospace, monospace";

/** Kąt sprowadzony do 0–359 (0 jako 360 na taśmie kursu, jak w samolocie – tu 0). */
export const wrap360 = (d: number) => ((Math.round(d) % 360) + 360) % 360;
