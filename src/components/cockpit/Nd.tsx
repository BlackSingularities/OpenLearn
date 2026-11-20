/*
 * ND – wyświetlacz nawigacyjny w stylu Airbusa A350, tryb ARC (SVG, niezależny od sceny 3D).
 * Łuk róży kursów u góry, przerywane okręgi zasięgu, żółty symbol samolotu, zielony przewidywany tor (prosty
 * albo łuk zakrętu o zadanym promieniu), w rogach prędkości GS/TAS, wiatr i kurs – tylko napisy jak w samolocie.
 */
import { AIRBUS, cockpitFont, wrap360 } from './common';

export interface NdProps {
  /** Kurs (°). */
  heading?: number;
  /** Prędkość względem ziemi i prędkość rzeczywista (węzły). */
  gs?: number;
  tas?: number;
  /** Wiatr: kierunek (°) i prędkość (węzły). */
  wind?: [number, number];
  /** Promień zakrętu (mile morskie); ujemny – w lewo, brak/0 – lot prosty. */
  turnRadiusNm?: number;
  /** Zasięg wyświetlacza (NM); brak – dobierany do promienia zakrętu. */
  range?: number;
  /** Nazwa celu w prawym górnym rogu (np. punkt trasy). */
  target?: string;
  /** Szerokość w pikselach. */
  width?: number;
}

const W = 360;
const H = 330;
const RANGES = [5, 10, 20, 40, 80, 160, 320];

export function Nd({ heading = 0, gs = 280, tas = 280, wind = [0, 0], turnRadiusNm = 0, range, target, width = 300 }: NdProps) {
  const cx = 180;
  const cy = 292;
  const R = 230; // promień łuku = zasięg
  const r = Math.abs(turnRadiusNm);
  const rng = range ?? (r > 0 ? RANGES.find((v) => v >= r * 2.2) ?? 320 : 20);
  const px = R / rng; // px na NM
  // przewidywany tor: łuk zakrętu albo prosta
  let track = `M${cx},${cy} L${cx},${cy - R}`;
  if (r > 0) {
    const rp = r * px;
    const side = Math.sign(turnRadiusNm);
    const th = Math.min(Math.PI * 0.95, (R * 1.1) / rp);
    const ccx = cx + side * rp;
    const ex = ccx - side * rp * Math.cos(th);
    const ey = cy - rp * Math.sin(th);
    track = `M${cx},${cy} A${rp},${rp} 0 ${th > Math.PI ? 1 : 0} ${side > 0 ? 1 : 0} ${ex},${ey}`;
  }
  const rose: number[] = [];
  for (let d = 0; d < 360; d += 5) rose.push(d);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={width} height={(width * H) / W} style={{ display: 'block', background: AIRBUS.bg, borderRadius: 6, fontFamily: cockpitFont }} role="img" aria-label="Wyświetlacz nawigacyjny (ND)">
      <defs>
        <clipPath id="nd-view">
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
      </defs>
      {/* ---- rogi: prędkości, wiatr, cel ---- */}
      <text x={10} y={18} fill={AIRBUS.white} fontSize={10}>
        GS<tspan fill={AIRBUS.green} fontSize={14}> {Math.round(gs)}</tspan>
        <tspan dx={6}>TAS</tspan>
        <tspan fill={AIRBUS.green} fontSize={14}> {Math.round(tas)}</tspan>
      </text>
      <text x={10} y={34} fill={AIRBUS.green} fontSize={11}>
        {String(wrap360(wind[0])).padStart(3, '0')}/{Math.round(wind[1])}
      </text>
      {wind[1] > 0 && (
        <g transform={`translate(18 50) rotate(${wind[0] + 180 - heading})`}>
          <line x1={0} y1={-8} x2={0} y2={8} stroke={AIRBUS.green} strokeWidth={1.6} />
          <path d="M0,8 l-3,-5 h6 z" fill={AIRBUS.green} />
        </g>
      )}
      <text x={W - 10} y={18} fill={AIRBUS.white} fontSize={11} textAnchor="end">
        {target ?? 'HDG'}
        <tspan fill={AIRBUS.green} dx={6} fontSize={14}>
          {String(wrap360(heading)).padStart(3, '0')}°
        </tspan>
      </text>
      <g clipPath="url(#nd-view)">
        {/* ---- okręgi zasięgu ---- */}
        {[0.25, 0.5, 0.75].map((f) => (
          <g key={f}>
            <path d={`M${cx - R * f},${cy} A${R * f},${R * f} 0 0 1 ${cx + R * f},${cy}`} fill="none" stroke={AIRBUS.white} strokeWidth={1} strokeDasharray="4 5" opacity={0.75} />
            <text x={cx - R * f * 0.72 - 6} y={cy - R * f * 0.7 + 10} fill={AIRBUS.cyan} fontSize={10} textAnchor="end">
              {Math.round(rng * f * 10) / 10}
            </text>
          </g>
        ))}
        {/* ---- łuk róży kursów ---- */}
        <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`} fill="none" stroke={AIRBUS.white} strokeWidth={1.4} />
        <g transform={`rotate(${-heading} ${cx} ${cy})`}>
          {rose.map((d) => {
            const big = d % 10 === 0;
            const t = ((d - 90) * Math.PI) / 180;
            const r1 = R;
            const r2 = R + (big ? 10 : 6);
            return (
              <g key={d}>
                <line x1={cx + r1 * Math.cos(t)} y1={cy + r1 * Math.sin(t)} x2={cx + r2 * Math.cos(t)} y2={cy + r2 * Math.sin(t)} stroke={AIRBUS.white} strokeWidth={1.2} />
                {d % 30 === 0 || d % 10 === 0 ? (
                  <text
                    x={cx + (R + 22) * Math.cos(t)}
                    y={cy + (R + 22) * Math.sin(t) + 4}
                    fill={AIRBUS.white}
                    fontSize={d % 30 === 0 ? 15 : 10}
                    textAnchor="middle"
                    transform={`rotate(${d} ${cx + (R + 22) * Math.cos(t)} ${cy + (R + 22) * Math.sin(t)})`}
                  >
                    {d / 10}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
        {/* ---- przewidywany tor ---- */}
        <path d={track} fill="none" stroke={AIRBUS.green} strokeWidth={2.2} />
      </g>
      {/* znacznik kursu (stały, u góry łuku) */}
      <line x1={cx} x2={cx} y1={cy - R - 14} y2={cy - R + 6} stroke={AIRBUS.yellow} strokeWidth={2.6} />
      {/* ---- symbol samolotu ---- */}
      <g stroke={AIRBUS.yellow} strokeWidth={3} strokeLinecap="round">
        <line x1={cx} x2={cx} y1={cy - 16} y2={cy + 14} />
        <line x1={cx - 15} x2={cx + 15} y1={cy - 6} y2={cy - 6} />
        <line x1={cx - 6} x2={cx + 6} y1={cy + 11} y2={cy + 11} />
      </g>
    </svg>
  );
}
