/*
 * PFD – główny wyświetlacz lotu w stylu kokpitu Airbusa A350 (SVG, bez zależności od sceny 3D).
 * Pasek trybów (FMA), sztuczny horyzont z drabinką pochylenia i skalą przechylenia, taśma prędkości z liczbą
 * Macha, taśma wysokości z okienkiem, wariometr i taśma kursu. Wszystko sterowane właściwościami – komponent
 * można wstawić w dowolnym miejscu aplikacji (w HTML albo w podpisie sceny 3D).
 */
import { useContext, useId, useRef } from 'react';
import { useCockpitPref } from '../ui';
import { AIRBUS, ScreenWidth, cockpitFont, wrap360 } from './common';

export interface PfdProps {
  /** Pochylenie (°, nos w górę dodatnio). */
  pitch?: number;
  /** Przechylenie (°, w prawo dodatnio). */
  bank?: number;
  /** Prędkość przyrządowa (węzły). */
  ias?: number;
  /** Prędkość wybrana / docelowa (węzły) – magentowy trójkąt na taśmie. */
  iasTarget?: number;
  /** Liczba Macha (np. 0,85) – pokazywana pod taśmą prędkości. */
  mach?: number;
  /** Prędkości charakterystyczne na taśmie (węzły): przeciągnięcie (Vα max), ochrona kąta natarcia (Vα prot), VLS i maksymalna. */
  vAlphaMax?: number;
  vAlphaProt?: number;
  vls?: number;
  vmax?: number;
  /** Zmiana prędkości w ciągu 10 s (węzły) – żółta strzałka trendu. */
  speedTrend?: number;
  /** Belki wskaźnika kierunku lotu (FD): odchylenie poziome i pionowe w stopniach. */
  fd?: [number, number] | null;
  /** Tor lotu (°) – zielony romb na taśmie kursu. */
  track?: number;
  /** Wysokość (stopy). */
  alt?: number;
  /** Wysokość wybrana (stopy) – nad taśmą wysokości. */
  altSel?: number;
  /** Prędkość pionowa (stopy/min). */
  vs?: number;
  /** Kurs magnetyczny (°). */
  heading?: number;
  /** Ciśnienie odniesienia: 'STD' albo QNH w hPa. */
  baro?: 'STD' | number;
  /** Pasek trybów: pięć kolumn (ciąg, pion, poziom, podejście, autopilot). */
  fma?: [string, string, string, string, string];
  /**
   * Wskaźnik ślizgu (prostokącik pod wskaźnikiem przechylenia, „kulka” Airbusa): −1…1, dodatnio w prawo.
   * Zasada pilota: naciśnij pedał po stronie, w którą uciekł wskaźnik.
   */
  slip?: number;
  /** Wysokość radiowa (stopy) – zielona liczba pod horyzontem, pokazywana poniżej 2500 ft (bursztynowa poniżej 100 ft przy podejściu). */
  ra?: number;
  /** Szerokość w pikselach (wysokość proporcjonalnie). */
  width?: number;
}

const W = 360;
const H = 330;

/**
 * Trend prędkości (o ile węzłów zmieni się prędkość w ciągu 10 s) liczony z kolejnych wskazań – wygładzony, więc
 * strzałka pojawia się sama w każdej scenie, w której prędkość się zmienia (lądowanie, fugoida, przyspieszanie).
 */
function useSpeedTrend(ias: number) {
  const st = useRef({ v: ias, t: 0, tr: 0 });
  const now = performance.now() / 1000;
  const s = st.current;
  if (s.t === 0) Object.assign(s, { v: ias, t: now });
  const dt = now - s.t;
  if (dt > 0.05) {
    const a = (ias - s.v) / dt; // kt/s
    s.tr += (a * 10 - s.tr) * Math.min(1, dt / 0.6);
    Object.assign(s, { v: ias, t: now });
  }
  return s.tr;
}

export function Pfd({ pitch = 0, bank = 0, ias = 250, iasTarget, mach, vAlphaMax, vAlphaProt, vls, vmax, speedTrend: trendIn, fd = [0, 0], track, alt = 10000, altSel, vs = 0, heading = 0, baro = 'STD', fma = ['SPEED', 'ALT', 'NAV', '', 'AP1\n1FD2\nA/THR'], slip = 0, ra, width: widthProp = 300 }: PfdProps) {
  // w doku kokpitu – wspólna szerokość ekranów (PFD i ND zawsze tej samej wielkości)
  const width = useContext(ScreenWidth) ?? widthProp;
  const autoTrend = useSpeedTrend(ias);
  const speedTrend = Math.max(-40, Math.min(40, trendIn ?? autoTrend));
  const id = useId().replace(/:/g, '');
  const shown = useCockpitPref('screens');
  if (!shown) return null;
  const cx = 178;
  const cy = 160;
  const K = 3.6; // px na stopień pochylenia
  // ---- taśma prędkości ----
  const sT = { x: 22, y: 66, w: 50, h: 188 };
  const sK = 2.4; // px na węzeł
  const sMid = sT.y + sT.h / 2;
  const speedTicks: number[] = [];
  for (let v = Math.floor((ias - 45) / 10) * 10; v <= ias + 45; v += 10) if (v >= 30) speedTicks.push(v);
  // ---- taśma wysokości ----
  const aT = { x: 284, y: 66, w: 40, h: 188 };
  const aK = 0.12; // px na stopę
  const aMid = aT.y + aT.h / 2;
  const altTicks: number[] = [];
  for (let a = Math.floor((alt - 800) / 100) * 100; a <= alt + 800; a += 100) altTicks.push(a);
  // ---- taśma kursu ----
  const hT = { x: 112, y: 266, w: 136, h: 22 };
  const hK = 3.2; // px na stopień
  const hdgTicks: number[] = [];
  for (let d = Math.floor((heading - 22) / 5) * 5; d <= heading + 22; d += 5) hdgTicks.push(d);
  // ---- wariometr ----
  const vsY = (v: number) => {
    const s = Math.sign(v);
    const a = Math.abs(v);
    const f = a <= 1000 ? (a / 1000) * 0.45 : a <= 2000 ? 0.45 + ((a - 1000) / 1000) * 0.25 : 0.7 + Math.min(1, (a - 2000) / 4000) * 0.3;
    return cy - s * f * 86;
  };
  /*
   * Pole horyzontu jak w Airbusie: koło o środku w symbolu samolotu, przycięte z boków pionowymi krawędziami – u góry
   * i u dołu łuki tego samego okręgu, po bokach proste odcinki. Ta sama ścieżka przycina horyzont i drabinkę.
   */
  const aw = 76;
  const ar = 94;
  const ah = ar;
  const sideH = Math.sqrt(ar * ar - aw * aw);
  const attPath = `M${cx - aw},${cy - sideH} A${ar},${ar} 0 0 1 ${cx + aw},${cy - sideH} L${cx + aw},${cy + sideH} A${ar},${ar} 0 0 1 ${cx - aw},${cy + sideH} Z`;
  const fmaCols = fma.map((t, i) => ({ t, x: 36 + i * 72 }));
  /**
   * Kolory FMA jak w Airbusie: wiersz 1 – tryby aktywne (zielone), wiersz 2 – uzbrojone (niebieskie), kolumna 4
   * (kategoria podejścia) i 5 (AP / FD / A/THR) – białe; ciąg ręczny (MAN TOGA) – biały.
   */
  const wide = /^(LAND|FLARE|ROLL OUT)$/.test(fma[1].split('\n')[0]) && !fma[2];
  const fmaColor = (i: number, row: number, man: boolean) => (i >= 3 || man ? AIRBUS.white : row === 0 ? AIRBUS.green : AIRBUS.cyan);
  // świeżo włączony tryb (zmiana napisu w wierszu 1) – w ramce przez 10 s
  const fmaSeen = useRef<{ t: string; at: number }[]>([]);
  const now = Date.now();
  const boxedCols = fma.slice(0, 3).flatMap((t, i) => {
    const top = t.split('\n')[0];
    const seen = fmaSeen.current[i];
    if (!seen) {
      fmaSeen.current[i] = { t: top, at: 0 };
      return [];
    }
    if (seen.t !== top) fmaSeen.current[i] = { t: top, at: now };
    return now - fmaSeen.current[i].at < 10000 ? [i] : [];
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={width} height={(width * H) / W} style={{ display: 'block', background: AIRBUS.bg, borderRadius: 6, fontFamily: cockpitFont }} role="img" aria-label="Główny wyświetlacz lotu (PFD)">
      <defs>
        <clipPath id={`att-${id}`}>
          <path d={attPath} />
        </clipPath>
        <clipPath id={`spd-${id}`}>
          <rect x={sT.x} y={sT.y} width={sT.w} height={sT.h} />
        </clipPath>
        <clipPath id={`alt-${id}`}>
          <rect x={aT.x} y={aT.y} width={aT.w} height={aT.h} />
        </clipPath>
        <clipPath id={`hdg-${id}`}>
          <rect x={hT.x} y={hT.y} width={hT.w} height={hT.h} />
        </clipPath>
        <pattern id={`prot-${id}`} width={7} height={6} patternUnits="userSpaceOnUse">
          <rect width={7} height={6} fill="#000" />
          <rect width={7} height={3} fill={AIRBUS.amber} />
        </pattern>
        <pattern id={`vmax-${id}`} width={7} height={8} patternUnits="userSpaceOnUse">
          <rect width={7} height={8} fill="#000" />
          <rect width={7} height={4} fill={AIRBUS.red} />
        </pattern>
      </defs>
      {/* ---- FMA (jak w Airbusie): 5 kolumn, 3 wiersze; świeżo włączony tryb w białej ramce przez 10 s ---- */}
      {[72, 144, 216, 288].map((x) =>
        x === 144 && wide ? null : <line key={x} x1={x} x2={x} y1={3} y2={41} stroke={AIRBUS.white} strokeWidth={1.2} />,
      )}
      {fmaCols.map(({ t, x: x0 }, i) => {
        // LAND, FLARE, ROLL OUT – wspólne dla toru pionowego i poziomego: na środku kolumn 2 i 3
        const x = i === 1 && wide ? 144 : x0;
        const rows = t.split('\n');
        const man = i === 0 && /^MAN /.test(rows[0]);
        // ciąg ręczny (MAN TOGA, MAN FLX) – biały, w dwóch wierszach, zawsze w ramce
        const lines = man ? [rows[0].slice(0, 3), rows[0].slice(4), ...rows.slice(1)] : rows;
        const boxed = man || (Boolean(rows[0]) && i < 3 && boxedCols.includes(i));
        return (
          <g key={i}>
            {boxed && <rect x={x - 33} y={4} width={66} height={man ? 23 : 13} fill="none" stroke={AIRBUS.white} strokeWidth={1} />}
            {lines.map((line, k) => (
              <text key={k} x={x} y={14 + k * 12} fill={fmaColor(i, k, man)} fontSize={10.5} textAnchor="middle" letterSpacing="0.02em">
                {line}
              </text>
            ))}
          </g>
        );
      })}
      {/* ---- horyzont ---- */}
      <g clipPath={`url(#att-${id})`}>
        <g transform={`rotate(${-bank} ${cx} ${cy}) translate(0 ${pitch * K})`}>
          <rect x={cx - 300} y={cy - 600} width={600} height={600} fill={AIRBUS.sky} />
          <rect x={cx - 300} y={cy} width={600} height={600} fill={AIRBUS.ground} />
          <line x1={cx - 300} x2={cx + 300} y1={cy} y2={cy} stroke={AIRBUS.white} strokeWidth={1.6} />
          {[-30, -25, -20, -15, -10, -7.5, -5, -2.5, 2.5, 5, 7.5, 10, 15, 20, 25, 30].map((p) => {
            const y = cy - p * K;
            const major = p % 10 === 0;
            const half = major ? 22 : p % 5 === 0 ? 12 : 6;
            return (
              <g key={p}>
                <line x1={cx - half} x2={cx + half} y1={y} y2={y} stroke={AIRBUS.white} strokeWidth={1.3} />
                {major && (
                  <>
                    <text x={cx - half - 4} y={y + 4} fill={AIRBUS.white} fontSize={10} textAnchor="end">
                      {Math.abs(p)}
                    </text>
                    <text x={cx + half + 4} y={y + 4} fill={AIRBUS.white} fontSize={10}>
                      {Math.abs(p)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </g>
      </g>
      {/* skala przechylenia (stała) i wskaźnik (obraca się z horyzontem) */}
      {[-45, -30, -20, -10, 0, 10, 20, 30, 45].map((a) => {
        const r1 = ar + 3;
        const r2 = a % 30 === 0 || a === 45 || a === -45 ? ar + 11 : ar + 7;
        const t = ((a - 90) * Math.PI) / 180;
        return <line key={a} x1={cx + r1 * Math.cos(t)} y1={cy + r1 * Math.sin(t)} x2={cx + r2 * Math.cos(t)} y2={cy + r2 * Math.sin(t)} stroke={AIRBUS.white} strokeWidth={1.4} />;
      })}
      <path d={`M${cx},${cy - ar - 2} l-7,-10 h14 z`} fill={AIRBUS.yellow} stroke={AIRBUS.yellow} strokeWidth={1.2} />
      <g transform={`rotate(${-bank} ${cx} ${cy})`}>
        <path d={`M${cx},${cy - ar + 2} l-6,9 h12 z`} fill="none" stroke={AIRBUS.white} strokeWidth={1.5} />
        {/* wskaźnik ślizgu: przesuwa się w bok pod wskaźnikiem przechylenia; przy dużym ślizgu bursztynowy */}
        <rect x={cx - 6 + Math.max(-1.2, Math.min(1.2, slip)) * 14} y={cy - ar + 13} width={12} height={4} fill={Math.abs(slip) > 0.6 ? AIRBUS.amber : 'none'} stroke={Math.abs(slip) > 0.6 ? AIRBUS.amber : AIRBUS.white} strokeWidth={1.3} />
      </g>
      {/* belki wskaźnika kierunku lotu (FD) */}
      {fd && (
        <g stroke={AIRBUS.green} strokeWidth={2.4}>
          <line x1={cx - 50} x2={cx + 50} y1={cy - fd[1] * K} y2={cy - fd[1] * K} />
          <line x1={cx + fd[0] * 3} x2={cx + fd[0] * 3} y1={cy - 50} y2={cy + 50} />
        </g>
      )}
      {/* symbol samolotu */}
      <g stroke="#000" strokeWidth={1}>
        <path d={`M${cx - 62},${cy - 3} h40 v12 h-7 v-6 h-33 z`} fill={AIRBUS.yellow} />
        <path d={`M${cx + 62},${cy - 3} h-40 v12 h7 v-6 h33 z`} fill={AIRBUS.yellow} />
        <rect x={cx - 4} y={cy - 4} width={8} height={8} fill="#000" stroke={AIRBUS.yellow} strokeWidth={2} />
      </g>
      {/* wysokość radiowa pod horyzontem (A350: zielona, poniżej 2500 ft) */}
      {ra !== undefined && ra < 2500 && (
        <text x={cx} y={cy + ah - 14} fill={AIRBUS.green} fontSize={15} textAnchor="middle" stroke="#000" strokeWidth={0.6} paintOrder="stroke">
          {ra < 50 ? Math.max(0, Math.round(ra)) : ra < 2500 ? Math.round(ra / 10) * 10 : ''}
        </text>
      )}
      {/* ---- taśma prędkości ---- */}
      <rect x={sT.x} y={sT.y} width={sT.w} height={sT.h} fill={AIRBUS.tape} />
      <g clipPath={`url(#spd-${id})`}>
        {speedTicks.map((v) => {
          const y = sMid - (v - ias) * sK;
          return (
            <g key={v}>
              <line x1={sT.x + sT.w - 8} x2={sT.x + sT.w} y1={y} y2={y} stroke={AIRBUS.white} strokeWidth={1.3} />
              {v % 20 === 0 && (
                <text x={sT.x + sT.w - 11} y={y + 4} fill={AIRBUS.white} fontSize={12} textAnchor="end">
                  {v}
                </text>
              )}
            </g>
          );
        })}
        {iasTarget !== undefined && <path d={`M${sT.x + sT.w},${sMid - (iasTarget - ias) * sK} l8,-6 v12 z`} fill="none" stroke={AIRBUS.magenta} strokeWidth={1.6} />}
        {/* od dołu: czerwony pas Vα max (przeciągnięcie), nad nim paski Vα prot, potem bursztynowy pasek VLS */}
        {vAlphaMax !== undefined && <rect x={sT.x + sT.w - 7} y={sMid - (vAlphaMax - ias) * sK} width={7} height={sT.h * 3} fill={AIRBUS.red} />}
        {vAlphaProt !== undefined && vAlphaMax !== undefined && (
          <rect x={sT.x + sT.w - 7} y={sMid - (vAlphaProt - ias) * sK} width={7} height={Math.max(0, (vAlphaProt - vAlphaMax) * sK)} fill={`url(#prot-${id})`} />
        )}
        {vls !== undefined && vAlphaProt !== undefined && (
          <rect x={sT.x + sT.w - 4} y={sMid - (vls - ias) * sK} width={4} height={Math.max(0, (vls - vAlphaProt) * sK)} fill={AIRBUS.amber} />
        )}
        {/* u góry: czerwono-czarny pasek prędkości maksymalnej */}
        {vmax !== undefined && <rect x={sT.x + sT.w - 7} y={sMid - (vmax - ias) * sK - sT.h * 3} width={7} height={sT.h * 3} fill={`url(#vmax-${id})`} />}
      </g>
      {/* strzałka trendu prędkości (zmiana w ciągu 10 s) */}
      {Math.abs(speedTrend) > 1 && (
        <g stroke={AIRBUS.yellow} strokeWidth={1.8} fill={AIRBUS.yellow}>
          <line x1={sT.x + sT.w + 3} x2={sT.x + sT.w + 3} y1={sMid} y2={sMid - speedTrend * sK} />
          <path d={`M${sT.x + sT.w + 3},${sMid - speedTrend * sK} l-4,${speedTrend > 0 ? 6 : -6} h8 z`} />
        </g>
      )}
      <line x1={sT.x - 8} x2={sT.x + sT.w + 10} y1={sMid} y2={sMid} stroke={AIRBUS.yellow} strokeWidth={2.4} />
      {mach !== undefined && (
        <text x={sT.x + 6} y={sT.y + sT.h + 22} fill={AIRBUS.green} fontSize={13}>
          {mach.toFixed(3).replace(/^0/, '')}
        </text>
      )}
      {/* ---- taśma wysokości ---- */}
      {altSel !== undefined && (
        <text x={aT.x + aT.w / 2} y={aT.y - 8} fill={AIRBUS.cyan} fontSize={12} textAnchor="middle">
          {Math.round(altSel / 100) >= 100 ? `FL${Math.round(altSel / 100)}` : altSel}
        </text>
      )}
      <rect x={aT.x} y={aT.y} width={aT.w} height={aT.h} fill={AIRBUS.tape} />
      <g clipPath={`url(#alt-${id})`}>
        {altTicks.map((a) => {
          const y = aMid - (a - alt) * aK;
          return (
            <g key={a}>
              <line x1={aT.x} x2={aT.x + 6} y1={y} y2={y} stroke={AIRBUS.white} strokeWidth={1.3} />
              {a % 500 === 0 && (
                <text x={aT.x + 9} y={y + 4} fill={AIRBUS.white} fontSize={11}>
                  {String(Math.round(a / 100)).padStart(3, '0')}
                </text>
              )}
            </g>
          );
        })}
      </g>
      {/* okienko wysokości: setki stóp + bęben dziesiątek */}
      <path d={`M${aT.x - 6},${aMid - 11} h${aT.w - 4} v-6 h18 v34 h-18 v-6 h-${aT.w - 4} z`} fill="#000" stroke={AIRBUS.yellow} strokeWidth={1.6} />
      <text x={aT.x + 26} y={aMid + 5} fill={AIRBUS.green} fontSize={15} textAnchor="end">
        {Math.floor(Math.max(0, alt) / 100)}
      </text>
      <text x={aT.x + 46} y={aMid + 5} fill={AIRBUS.green} fontSize={11} textAnchor="end">
        {String(Math.round((Math.max(0, alt) % 100) / 20) * 20).padStart(2, '0')}
      </text>
      {/* nastawa ciśnienia jak w Airbusie: STD – niebieski w żółtej ramce, QNH – biały napis i niebieska wartość */}
      {baro === 'STD' ? (
        <>
          <rect x={aT.x + 3} y={aT.y + aT.h + 8} width={34} height={16} fill="none" stroke={AIRBUS.yellow} strokeWidth={1.2} />
          <text x={aT.x + 20} y={aT.y + aT.h + 20} fill={AIRBUS.cyan} fontSize={11} textAnchor="middle">
            STD
          </text>
        </>
      ) : (
        <text x={aT.x + 22} y={aT.y + aT.h + 20} fill={AIRBUS.white} fontSize={9} textAnchor="middle">
          QNH
          <tspan fill={AIRBUS.cyan} fontSize={11} dx={3}>
            {baro}
          </tspan>
        </text>
      )}
      {/* ---- wariometr ---- */}
      <path d={`M330,${cy - 92} h14 l8,30 v124 l-8,30 h-14 z`} fill={AIRBUS.tape} opacity={0.85} />
      {[-6000, -2000, -1000, 1000, 2000, 6000].map((v) => (
        <g key={v}>
          <line x1={334} x2={341} y1={vsY(v)} y2={vsY(v)} stroke={AIRBUS.white} strokeWidth={1.2} />
          <text x={333} y={vsY(v) + 3} fill={AIRBUS.white} fontSize={7} textAnchor="end">
            {Math.abs(v) / 1000}
          </text>
        </g>
      ))}
      <line x1={354} y1={cy} x2={338} y2={vsY(vs)} stroke={AIRBUS.green} strokeWidth={2.2} />
      {Math.abs(vs) >= 200 && (
        <text x={344} y={vsY(vs) + (vs > 0 ? -4 : 12)} fill={AIRBUS.green} fontSize={10} textAnchor="middle">
          {Math.round(Math.abs(vs) / 100)}
        </text>
      )}
      {/* ---- taśma kursu ---- */}
      <rect x={hT.x} y={hT.y} width={hT.w} height={hT.h} fill={AIRBUS.tape} />
      <g clipPath={`url(#hdg-${id})`}>
        {hdgTicks.map((d) => {
          const x = hT.x + hT.w / 2 + (d - heading) * hK;
          return (
            <g key={d}>
              <line x1={x} x2={x} y1={hT.y} y2={hT.y + (d % 10 === 0 ? 7 : 4)} stroke={AIRBUS.white} strokeWidth={1.2} />
              {d % 10 === 0 && (
                <text x={x} y={hT.y + 18} fill={AIRBUS.white} fontSize={10} textAnchor="middle">
                  {String(wrap360(d) / 10).padStart(2, '0')}
                </text>
              )}
            </g>
          );
        })}
      </g>
      <line x1={hT.x + hT.w / 2} x2={hT.x + hT.w / 2} y1={hT.y - 6} y2={hT.y + 10} stroke={AIRBUS.yellow} strokeWidth={2.4} />
      {track !== undefined && Math.abs(track - heading) < 20 && (
        <path d={`M${hT.x + hT.w / 2 + (track - heading) * hK},${hT.y + 2} l4,5 l-4,5 l-4,-5 z`} fill="none" stroke={AIRBUS.green} strokeWidth={1.6} />
      )}
    </svg>
  );
}
