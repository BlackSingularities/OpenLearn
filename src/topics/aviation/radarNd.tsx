/*
 * ND z radarem pogodowym (tryb ARC, jak w A350) i profil pionowy (VD) pod nim. Obraz echa liczony jest z tej samej
 * pogody co miniatura burzy w scenie 3D (radarWx.ts). Jak w prawdziwym radarze obraz odświeża się pasem za wiązką:
 * antena przemiata ±80°, a ekran zmienia się tylko tam, gdzie właśnie przeszła wiązka.
 *
 * Kolory: zielony, żółty, czerwony, magenta – coraz silniejszy opad; magenta w zasięgu 40 NM w trybie WX+T –
 * turbulencja. Kreskowanie – echo poniżej drogi samolotu (tryb AUTO, radar z pamięcią 3D).
 */
import { useContext, useEffect, useRef, type MutableRefObject } from 'react';
import { useCockpitPref } from '../../components/ui';
import { AIRBUS, cockpitFont, ScreenWidth, SCREEN_W } from '../../components/cockpit';
import { BEAM_HALF, FT_NM, PATH_BAND, fieldDbz, levelOf, sampleRadar, worldAt, type AcState, type RadarOpts } from './radarWx';

/** Wspólny stan radaru odczytywany przez ekran (bez przerysowywania Reacta co klatkę). */
export type RadarView = { ac: AcState; az: number };

const W = 360;
const H = 330;
const VD_H = 112;
const cx = 180;
const cy = 292;
const R = 230;
/** VD: obszar wykresu (x – odległość, y – wysokość). */
const VX0 = 44;
const VX1 = 348;
const VY0 = H + 16;
const VY1 = H + VD_H - 12;
const DEG = Math.PI / 180;

export type WxNdProps = {
  view: MutableRefObject<RadarView>;
  opts: RadarOpts;
  /** Zasięg (NM). */
  range: number;
  /** Kurs na róży, gdy samolot leci kursem początkowym (°). */
  baseHdg?: number;
  gs?: number;
  tas?: number;
  wind?: [number, number];
  /** Napis w prawym górnym rogu (punkt trasy). */
  target?: string;
  /** Profil pionowy pod ND. */
  vd?: boolean;
  /** Ruchoma scena (samolot leci): obraz liczony od nowa kilka razy na sekundę i pokazywany cały naraz. */
  moving?: boolean;
  /** Ikona uskoku wiatru (PWS): położenie w układzie samolotu [w prawo, do przodu] (NM). */
  ws?: [number, number] | null;
  /** Trasa planu lotu (punkty świata, NM) – zielona linia; przerywana, gdy samolot z niej zboczył. */
  route?: [number, number][];
  /** Tor w trybie HDG (zboczenie z trasy) – trasa rysowana wtedy przerywaną linią. */
  offRoute?: boolean;
  /** Punkty trasy (świat, NM): zielone romby z nazwami; pierwszy przed samolotem – punkt „TO” (biały, w rogu ekranu). */
  wpts?: { name: string; X: number; Y: number }[];
  /** Najniższa bezpieczna wysokość w promieniu 40 NM (setki ft) – magenta w lewym dolnym rogu. */
  mora?: number;
  /** Radiolatarnie VOR1 i VOR2 w dolnych rogach: nazwa i odległość (NM). */
  vor?: [[string, number], [string, number]];
};

/** Piksel ekranu (x, y) → odległość (NM) i kąt (°) od samolotu. */
function polar(i: number, j: number, px: number) {
  const dx = i - cx;
  const dy = cy - j;
  return { r: Math.hypot(dx, dy) / px, az: (Math.atan2(dx, dy) * 180) / Math.PI, rp: Math.hypot(dx, dy) };
}

/** Szum pikseli (0…1) – stały dla danego miejsca ekranu. */
function speck(i: number, j: number) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Obraz echa w całym zakresie ekranu (bloki 2×2 px). */
function paintWx(ctx: CanvasRenderingContext2D, o: RadarOpts, ac: AcState, range: number) {
  const px = R / range;
  const s = 2;
  ctx.clearRect(0, 0, W, H);
  for (let j = cy - R; j < cy; j += s)
    for (let i = cx - R; i < cx + R; i += s) {
      const p = polar(i + s / 2, j + s / 2, px);
      if (p.rp > R || p.rp < 2 || Math.abs(p.az) > 80) continue;
      const e = sampleRadar(o, ac, p.r, p.az);
      // ziarno obrazu jak w prawdziwym radarze: echo „szumi” o kilka dB, więc brzegi kolorów są postrzępione
      const lv = levelOf(e.v + (speck(i, j) - 0.5) * 6);
      if (!lv) continue;
      // kreskowanie (echo pod drogą samolotu): ukośne paski
      if (e.below && ((i + j) / s) % 4 > 1) continue;
      const c = e.turb ? [255, 79, 216] : lv.color;
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(i, j, s, s);
    }
}

/** Profil pionowy wzdłuż kursu: pełny przekrój chmur (radar z pamięcią 3D) do wysokości hMax. */
function paintVd(ctx: CanvasRenderingContext2D, o: RadarOpts, ac: AcState, range: number, hMax: number) {
  const s = 2;
  ctx.clearRect(0, H, W, VD_H);
  for (let i = VX0; i < VX1; i += s) {
    const r = ((i + s / 2 - VX0) / (VX1 - VX0)) * range;
    const [X, Y] = worldAt(ac, r, 0);
    for (let j = VY0; j < VY1; j += s) {
      const h = ((VY1 - (j + s / 2)) / (VY1 - VY0)) * hMax;
      const lv = levelOf(fieldDbz(o.cells, X, Y, h).v);
      if (!lv) continue;
      ctx.fillStyle = `rgb(${lv.color[0]},${lv.color[1]},${lv.color[2]})`;
      ctx.fillRect(i, j, s, s);
    }
  }
}

export function WxNd({ view, opts, range, baseHdg = 84, gs = 480, tas = 470, wind = [270, 45], target, vd = false, moving = false, ws = null, route, offRoute = false, wpts, mora, vor }: WxNdProps) {
  const width = useContext(ScreenWidth) ?? SCREEN_W;
  const shown = useCockpitPref('screens');
  const disp = useRef<HTMLCanvasElement>(null);
  const full = useRef<HTMLCanvasElement | null>(null);
  const key = JSON.stringify({ c: opts.cells, a: opts.auto, t: opts.tilt, g: opts.gcs, w: opts.turb, range, vd });
  const keyRef = useRef(key);
  keyRef.current = key;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const hMax = Math.max(45000, view.current.ac.alt + 8000);
  const totalH = H + (vd ? VD_H : 0);
  useEffect(() => {
    if (!full.current) full.current = document.createElement('canvas');
    const F = full.current;
    F.width = W * 2;
    F.height = (H + VD_H) * 2;
    const fctx = F.getContext('2d')!;
    fctx.setTransform(2, 0, 0, 2, 0, 0);
    const D = disp.current;
    if (!D) return;
    const dctx = D.getContext('2d')!;
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, D.width, D.height);
    let lastKey = '';
    let lastAz = view.current.az;
    let lastT = 0;
    let raf = 0;
    const compute = () => {
      const v = view.current;
      paintWx(fctx, optsRef.current, v.ac, range);
      if (vd) paintVd(fctx, optsRef.current, v.ac, range, Math.max(45000, v.ac.alt + 8000));
    };
    const loop = (now: number) => {
      const v = view.current;
      if (keyRef.current !== lastKey || (moving && now - lastT > 180)) {
        lastKey = keyRef.current;
        lastT = now;
        compute();
        // profil pionowy pokazujemy od razu (to przekrój z pamięci radaru, nie bieżąca wiązka)
        if (vd) {
          dctx.clearRect(0, H * 2, W * 2, VD_H * 2);
          dctx.drawImage(F, 0, H * 2, W * 2, VD_H * 2, 0, H * 2, W * 2, VD_H * 2);
        }
        if (moving) {
          dctx.clearRect(0, 0, W * 2, H * 2);
          dctx.drawImage(F, 0, 0, W * 2, H * 2, 0, 0, W * 2, H * 2);
        }
      }
      if (!moving) {
        // obraz odświeża się pasem za wiązką: klin między poprzednim a obecnym kątem anteny
        const a0 = Math.min(lastAz, v.az) - 1.5;
        const a1 = Math.max(lastAz, v.az) + 1.5;
        if (a1 - a0 > 1.6) {
          dctx.save();
          dctx.beginPath();
          dctx.moveTo(cx * 2, cy * 2);
          dctx.arc(cx * 2, cy * 2, (R + 4) * 2, ((a0 - 90) * Math.PI) / 180, ((a1 - 90) * Math.PI) / 180);
          dctx.closePath();
          dctx.clip();
          dctx.clearRect(0, 0, W * 2, H * 2);
          dctx.drawImage(F, 0, 0, W * 2, H * 2, 0, 0, W * 2, H * 2);
          dctx.restore();
        }
      }
      lastAz = v.az;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view, range, vd, moving, shown]);
  if (!shown) return null;

  const v = view.current;
  const hdg = (((baseHdg + v.ac.hdg) % 360) + 360) % 360;
  const px = R / range;
  // punkt świata → ekran
  const toScr = (X: number, Y: number): [number, number] => {
    const a = (v.ac.hdg * Math.PI) / 180;
    const dX = X - v.ac.X;
    const dY = Y - v.ac.Y;
    const f = dX * Math.sin(a) + dY * Math.cos(a);
    const r = dX * Math.cos(a) - dY * Math.sin(a);
    return [cx + r * px, cy - f * px];
  };
  // punkt TO: pierwszy punkt trasy przed samolotem – nazwa, kurs, odległość i czas przelotu w prawym górnym rogu
  const toWpt = wpts?.find((w) => (w.X - v.ac.X) * Math.sin(v.ac.hdg * DEG) + (w.Y - v.ac.Y) * Math.cos(v.ac.hdg * DEG) > 0.5);
  const toDist = toWpt ? Math.hypot(toWpt.X - v.ac.X, toWpt.Y - v.ac.Y) : 0;
  const toBrg = toWpt ? (((baseHdg + (Math.atan2(toWpt.X - v.ac.X, toWpt.Y - v.ac.Y) * 180) / Math.PI) % 360) + 360) % 360 : 0;
  const eta = (() => {
    const m = 11 * 60 + 2 + (toDist / Math.max(60, gs)) * 60;
    return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  })();
  const rose: number[] = [];
  for (let d = 0; d < 360; d += 5) rose.push(d);
  const tiltTxt = opts.auto ? null : `${opts.tilt > 0 ? '+' : ''}${opts.tilt.toFixed(1)}°`;
  // VD: wysokość → y, odległość → x
  const vy = (h: number) => VY1 - (Math.max(0, h) / hMax) * (VY1 - VY0);
  const vx = (r: number) => VX0 + (r / range) * (VX1 - VX0);
  const beam = (t: number) =>
    Array.from({ length: 21 }, (_, k) => {
      const r = (k / 20) * range;
      return `${k ? 'L' : 'M'}${vx(r)},${Math.max(VY0, Math.min(VY1, vy(v.ac.alt + r * FT_NM * Math.tan((t * Math.PI) / 180) - 0.66 * r * r)))}`;
    }).join(' ');
  return (
    <div style={{ position: 'relative', width, height: (width * totalH) / W, background: AIRBUS.bg, borderRadius: 6, overflow: 'hidden' }}>
      <canvas ref={disp} width={W * 2} height={(H + VD_H) * 2} style={{ position: 'absolute', left: 0, top: 0, width, height: (width * (H + VD_H)) / W }} />
      <svg viewBox={`0 0 ${W} ${totalH}`} width={width} height={(width * totalH) / W} style={{ position: 'absolute', left: 0, top: 0, fontFamily: cockpitFont }} role="img" aria-label="Wyświetlacz nawigacyjny z radarem pogodowym">
        <defs>
          <clipPath id="wxnd-view">
            <rect x={0} y={0} width={W} height={H} />
          </clipPath>
        </defs>
        <g clipPath="url(#wxnd-view)">
          {/* trasa planu lotu */}
          {route && route.length > 1 && <path d={route.map((p, k) => `${k ? 'L' : 'M'}${toScr(p[0], p[1]).join(',')}`).join(' ')} fill="none" stroke={AIRBUS.green} strokeWidth={2} strokeDasharray={offRoute ? '8 6' : undefined} />}
          {/* punkty trasy: romb i nazwa (punkt TO – biały) */}
          {wpts?.map((w, k) => {
            const [x, y] = toScr(w.X, w.Y);
            const to = w === toWpt;
            return (
              <g key={k}>
                <path d={`M${x},${y - 5} l5,5 l-5,5 l-5,-5 z`} fill="none" stroke={to ? AIRBUS.white : AIRBUS.green} strokeWidth={1.5} />
                <text x={x + 8} y={y + 4} fill={to ? AIRBUS.white : AIRBUS.green} fontSize={10}>
                  {w.name}
                </text>
              </g>
            );
          })}
          {/* okręgi zasięgu */}
          {[0.25, 0.5, 0.75].map((f) => (
            <g key={f}>
              <path d={`M${cx - R * f},${cy} A${R * f},${R * f} 0 0 1 ${cx + R * f},${cy}`} fill="none" stroke={AIRBUS.white} strokeWidth={1} strokeDasharray="4 5" opacity={0.75} />
              <text x={cx - R * f * 0.72 - 6} y={cy - R * f * 0.7 + 10} fill={AIRBUS.cyan} fontSize={10} textAnchor="end">
                {Math.round(range * f * 10) / 10}
              </text>
            </g>
          ))}
          {/* róża kursów */}
          <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`} fill="none" stroke={AIRBUS.white} strokeWidth={1.4} />
          <g transform={`rotate(${-hdg} ${cx} ${cy})`}>
            {rose.map((d) => {
              const big = d % 10 === 0;
              const t = ((d - 90) * Math.PI) / 180;
              const r2 = R + (big ? 10 : 6);
              const lx = cx + (R + 22) * Math.cos(t);
              const ly = cy + (R + 22) * Math.sin(t);
              return (
                <g key={d}>
                  <line x1={cx + R * Math.cos(t)} y1={cy + R * Math.sin(t)} x2={cx + r2 * Math.cos(t)} y2={cy + r2 * Math.sin(t)} stroke={AIRBUS.white} strokeWidth={1.2} />
                  {big && (
                    <text x={lx} y={ly + 4} fill={AIRBUS.white} fontSize={d % 30 === 0 ? 15 : 10} textAnchor="middle" transform={`rotate(${d} ${lx} ${ly})`}>
                      {d / 10}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          {/* ikona uskoku wiatru (PWS): czerwono-czarne łuki w miejscu mikroburstu */}
          {ws &&
            [0, 1, 2].map((k) => {
              const x = cx + ws[0] * px;
              const y = cy - ws[1] * px;
              const rr = (0.35 + k * 0.28) * px;
              const a0 = (-35 * Math.PI) / 180;
              const a1 = (35 * Math.PI) / 180;
              const d = `M${x + rr * Math.sin(a0)},${y - rr * Math.cos(a0)} A${rr},${rr} 0 0 1 ${x + rr * Math.sin(a1)},${y - rr * Math.cos(a1)}`;
              return (
                <g key={k}>
                  <path d={d} fill="none" stroke="#000" strokeWidth={4} />
                  <path d={d} fill="none" stroke={AIRBUS.red} strokeWidth={4} strokeDasharray="5 5" />
                </g>
              );
            })}
        </g>
        {/* znacznik kursu i symbol samolotu */}
        <line x1={cx} x2={cx} y1={cy - R - 14} y2={cy - R + 6} stroke={AIRBUS.yellow} strokeWidth={2.6} />
        <g stroke={AIRBUS.yellow} strokeWidth={3} strokeLinecap="round">
          <line x1={cx} x2={cx} y1={cy - 16} y2={cy + 14} />
          <line x1={cx - 15} x2={cx + 15} y1={cy - 6} y2={cy - 6} />
          <line x1={cx - 6} x2={cx + 6} y1={cy + 11} y2={cy + 11} />
        </g>
        {/* rogi: prędkości, wiatr, kurs; tryb radaru i pochylenie anteny */}
        <g stroke={AIRBUS.bg} strokeWidth={3} strokeLinejoin="round" style={{ paintOrder: 'stroke' }}>
          <text x={10} y={18} fill={AIRBUS.white} fontSize={10}>
            GS<tspan fill={AIRBUS.green} fontSize={14}> {Math.round(gs)}</tspan>
            <tspan dx={6}>TAS</tspan>
            <tspan fill={AIRBUS.green} fontSize={14}> {Math.round(tas)}</tspan>
          </text>
          <text x={10} y={34} fill={AIRBUS.green} fontSize={11}>
            {String(Math.round(wind[0])).padStart(3, '0')}/{Math.round(wind[1])}
          </text>
          <text x={W - 10} y={18} fill={AIRBUS.white} fontSize={11} textAnchor="end">
            {toWpt ? toWpt.name : target ?? 'HDG'}
            <tspan fill={AIRBUS.green} dx={6} fontSize={14}>
              {String(Math.round(toWpt ? toBrg : hdg) % 360).padStart(3, '0')}°
            </tspan>
          </text>
          {toWpt && (
            <>
              <text x={W - 10} y={33} fill={AIRBUS.green} fontSize={13} textAnchor="end">
                {Math.round(toDist)}
                <tspan fontSize={9} fill={AIRBUS.cyan}>
                  {' '}
                  NM
                </tspan>
              </text>
              <text x={W - 10} y={47} fill={AIRBUS.green} fontSize={12} textAnchor="end">
                {eta}
              </text>
            </>
          )}
          {mora !== undefined && (
            <text x={10} y={cy - 22} fill={AIRBUS.magenta} fontSize={10}>
              40NM MORA
              <tspan x={10} dy={12} fontSize={12}>
                {mora}
              </tspan>
            </text>
          )}
          {vor &&
            vor.map(([name, d], k) => (
              <text key={k} x={k ? W - 8 : 8} y={H - 26} fill={AIRBUS.white} fontSize={9.5} textAnchor={k ? 'end' : 'start'}>
                {k ? 'VOR2' : 'VOR1'}
                <tspan x={k ? W - 8 : 8} dy={11}>
                  {name}
                </tspan>
                <tspan x={k ? W - 8 : 8} dy={11} fill={AIRBUS.green}>
                  {d}
                  <tspan fill={AIRBUS.cyan} fontSize={8}>
                    {' '}
                    NM
                  </tspan>
                </tspan>
              </text>
            ))}
          <text x={W - 10} y={cy - 36} fill={AIRBUS.green} fontSize={11} textAnchor="end">
            {opts.turb ? 'WX+T' : 'WX'}
          </text>
          {tiltTxt && (
            <text x={W - 10} y={cy - 22} fill={AIRBUS.cyan} fontSize={10} textAnchor="end">
              MAN {tiltTxt}
            </text>
          )}
          {!opts.auto && (
            <text x={W - 10} y={cy - 50} fill={AIRBUS.cyan} fontSize={9} textAnchor="end">
              {opts.gcs ? 'GCS' : ''}
            </text>
          )}
        </g>
        {/* ---- profil pionowy (VD) ---- */}
        {vd && (
          <g>
            <line x1={0} x2={W} y1={H + 2} y2={H + 2} stroke={AIRBUS.white} strokeWidth={1} opacity={0.6} />
            <rect x={VX0} y={VY0} width={VX1 - VX0} height={VY1 - VY0} fill="none" stroke={AIRBUS.white} strokeWidth={1} />
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                {f > 0 && f < 1 && <line x1={vx(range * f)} x2={vx(range * f)} y1={VY0} y2={VY1} stroke={AIRBUS.white} strokeWidth={0.8} strokeDasharray="3 4" opacity={0.6} />}
                <text x={vx(range * f)} y={VY0 - 3} fill={AIRBUS.cyan} fontSize={8.5} textAnchor="middle">
                  {Math.round(range * f)}
                </text>
              </g>
            ))}
            {[10000, 20000, 30000, 40000].filter((h) => h < hMax).map((h) => (
              <g key={h}>
                <line x1={VX0 - 4} x2={VX0} y1={vy(h)} y2={vy(h)} stroke={AIRBUS.white} />
                <text x={VX0 - 6} y={vy(h) + 3} fill={AIRBUS.white} fontSize={8} textAnchor="end">
                  {h / 100}
                </text>
              </g>
            ))}
            <text x={6} y={VY0 + 10} fill={AIRBUS.white} fontSize={8}>
              FL
            </text>
            {/* teren (płaski) */}
            <line x1={VX0} x2={VX1} y1={VY1 - 1} y2={VY1 - 1} stroke="#c2662d" strokeWidth={3} />
            {opts.auto ? (
              // tryb AUTO: droga samolotu i okno ±4000 ft, w którym echo jest „na drodze”
              <g>
                <line x1={VX0} x2={VX1} y1={vy(v.ac.alt)} y2={vy(v.ac.alt)} stroke={AIRBUS.green} strokeWidth={1.4} />
                {[1, -1].map((s) => (
                  <line key={s} x1={VX0} x2={VX1} y1={vy(v.ac.alt + s * PATH_BAND)} y2={vy(v.ac.alt + s * PATH_BAND)} stroke={AIRBUS.white} strokeWidth={0.8} strokeDasharray="5 4" opacity={0.7} />
                ))}
              </g>
            ) : (
              // tryb ręczny: wiązka – środek i krawędzie (±1,75°)
              <g>
                <path d={beam(opts.tilt)} fill="none" stroke={AIRBUS.cyan} strokeWidth={1.2} />
                <path d={beam(opts.tilt + BEAM_HALF)} fill="none" stroke={AIRBUS.cyan} strokeWidth={0.8} strokeDasharray="4 3" />
                <path d={beam(opts.tilt - BEAM_HALF)} fill="none" stroke={AIRBUS.cyan} strokeWidth={0.8} strokeDasharray="4 3" />
              </g>
            )}
            <path d={`M${VX0 - 2},${vy(v.ac.alt)} l-10,-4 v8 z`} fill={AIRBUS.yellow} />
          </g>
        )}
      </svg>
    </div>
  );
}
// w doku kokpitu to ekran ND
(WxNd as unknown as { cockpitSlot: string }).cockpitSlot = 'nd';
