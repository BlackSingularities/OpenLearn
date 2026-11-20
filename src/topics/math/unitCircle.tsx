import type { Control, SceneProps, Topic } from '../../lib/types';
import { formatNumber, useAnimationClock } from '../../lib/useAnimationClock';

const SIN = '#ff6b8b';
const COS = '#4fc3ff';
const POINT = '#ffd166';

const CX = 270;
const CY = 220;
const R = 140;
const WAVE_X0 = 470;
const WAVE_W = 400;

function UnitCircleScene({ params }: SceneProps) {
  const mode = String(params.mode ?? 'point');
  const playing = Boolean(params.play);
  const speed = Number(params.speed ?? 1);
  const time = useAnimationClock(playing, speed);

  const manual = (Number(params.angle ?? 45) * Math.PI) / 180;
  const theta = playing ? (manual + time) % (Math.PI * 2) : manual;

  const px = CX + R * Math.cos(theta);
  const py = CY - R * Math.sin(theta);
  const deg = (theta * 180) / Math.PI;

  const showProjections = mode !== 'point';
  const showWave = mode === 'wave';

  // Łuk kąta
  const arcR = 38;
  const large = theta > Math.PI ? 1 : 0;
  const arcEnd = `${CX + arcR * Math.cos(theta)} ${CY - arcR * Math.sin(theta)}`;

  // Wykres sinusa od 0 do bieżącego kąta
  const wavePts: string[] = [];
  const fullPts: string[] = [];
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    const x = WAVE_X0 + (a / (Math.PI * 2)) * WAVE_W;
    const y = CY - R * Math.sin(a);
    fullPts.push(`${x},${y}`);
    if (a <= theta) wavePts.push(`${x},${y}`);
  }
  const waveX = WAVE_X0 + (theta / (Math.PI * 2)) * WAVE_W;

  return (
    <svg viewBox={showWave ? '0 20 900 400' : `${CX - 250} 30 500 380`} role="img" aria-label="Okrąg jednostkowy">
      <defs>
        <radialGradient id="glow">
          <stop offset="0%" stopColor={POINT} stopOpacity="0.8" />
          <stop offset="100%" stopColor={POINT} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* osie */}
      <g stroke="rgba(255,255,255,0.18)" strokeWidth="1.5">
        <line x1={CX - R - 30} y1={CY} x2={showWave ? WAVE_X0 + WAVE_W + 10 : CX + R + 30} y2={CY} />
        <line x1={CX} y1={CY - R - 30} x2={CX} y2={CY + R + 30} />
      </g>
      <circle cx={CX} cy={CY} r={R} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />

      <g fill="rgba(255,255,255,0.5)" fontSize="13" fontFamily="Geist">
        <text x={CX + R + 6} y={CY - 6}>1</text>
        <text x={CX - R - 20} y={CY - 6}>−1</text>
        <text x={CX + 6} y={CY - R - 6}>1</text>
        <text x={CX + 6} y={CY + R + 18}>−1</text>
      </g>

      {/* łuk kąta */}
      <path
        d={`M ${CX + arcR} ${CY} A ${arcR} ${arcR} 0 ${large} 0 ${arcEnd}`}
        fill="none"
        stroke={POINT}
        strokeWidth="2.5"
      />
      <text x={CX + 44} y={CY - 12} fill={POINT} fontSize="15" fontWeight="600" fontFamily="Geist">
        θ = {formatNumber(deg, 0)}°
      </text>

      {/* promień */}
      <line x1={CX} y1={CY} x2={px} y2={py} stroke="#fff" strokeWidth="3" strokeLinecap="round" />

      {showProjections && (
        <g strokeLinecap="round">
          <line x1={CX} y1={CY} x2={px} y2={CY} stroke={COS} strokeWidth="5" />
          <line x1={px} y1={CY} x2={px} y2={py} stroke={SIN} strokeWidth="5" />
          <text
            x={(CX + px) / 2}
            y={CY + (Math.sin(theta) >= 0 ? 22 : -10)}
            fill={COS}
            fontSize="14"
            fontWeight="600"
            textAnchor="middle"
            fontFamily="Geist"
          >
            cos θ = {formatNumber(Math.cos(theta))}
          </text>
          <text
            x={px + (Math.cos(theta) >= 0 ? 10 : -10)}
            y={(CY + py) / 2 + 5}
            fill={SIN}
            fontSize="14"
            fontWeight="600"
            textAnchor={Math.cos(theta) >= 0 ? 'start' : 'end'}
            fontFamily="Geist"
          >
            sin θ = {formatNumber(Math.sin(theta))}
          </text>
        </g>
      )}

      {showWave && (
        <g>
          <polyline points={fullPts.join(' ')} fill="none" stroke="rgba(255,107,139,0.18)" strokeWidth="2" />
          <polyline points={wavePts.join(' ')} fill="none" stroke={SIN} strokeWidth="3.5" strokeLinejoin="round" />
          <line x1={px} y1={py} x2={waveX} y2={py} stroke={POINT} strokeDasharray="5 6" strokeWidth="1.5" opacity="0.8" />
          <circle cx={waveX} cy={py} r="6" fill={SIN} />
          <g fill="rgba(255,255,255,0.5)" fontSize="13" fontFamily="Geist" textAnchor="middle">
            {[
              ['π/2', 0.25],
              ['π', 0.5],
              ['3π/2', 0.75],
              ['2π', 1],
            ].map(([label, f]) => (
              <g key={label as string}>
                <line
                  x1={WAVE_X0 + (f as number) * WAVE_W}
                  x2={WAVE_X0 + (f as number) * WAVE_W}
                  y1={CY - 5}
                  y2={CY + 5}
                  stroke="rgba(255,255,255,0.4)"
                />
                <text x={WAVE_X0 + (f as number) * WAVE_W} y={CY + 22}>
                  {label}
                </text>
              </g>
            ))}
          </g>
        </g>
      )}

      {/* punkt */}
      <circle cx={px} cy={py} r="22" fill="url(#glow)" />
      <circle cx={px} cy={py} r="8" fill={POINT} stroke="#1b1d22" strokeWidth="2" />
    </svg>
  );
}

const angleControls: Control[] = [
  { type: 'slider' as const, key: 'angle', label: 'Kąt θ', min: 0, max: 360, step: 1, default: 45, unit: '°' },
  { type: 'toggle' as const, key: 'play', label: 'Obracaj automatycznie', default: false },
  { type: 'slider' as const, key: 'speed', label: 'Prędkość obrotu', min: 0.2, max: 3, step: 0.1, default: 1, unit: '×' },
];

export const unitCircle: Topic = {
  id: 'okrag-jednostkowy',
  title: 'Okrąg jednostkowy i funkcje trygonometryczne',
  subject: 'matematyka',
  summary: 'Skąd się biorą sinus i cosinus? Zobacz, jak punkt krążący po okręgu rysuje falę.',
  accent: '#ff6b8b',
  glyph: '∿',
  steps: [
    {
      title: 'Punkt na okręgu',
      kind: '2d',
      scene: UnitCircleScene,
      preset: { mode: 'point' },
      controls: angleControls,
      body: (
        <>
          <p>
            <strong>Okrąg jednostkowy</strong> ma środek w początku układu współrzędnych i promień równy 1.
          </p>
          <p>
            Każdy punkt na nim możemy opisać jedną liczbą: <strong>kątem θ</strong> mierzonym od dodatniej półosi x,
            przeciwnie do ruchu wskazówek zegara.
          </p>
          <p>Przesuń suwak albo włącz automatyczny obrót i obserwuj, jak zmienia się położenie punktu.</p>
        </>
      ),
    },
    {
      title: 'Rzuty: sinus i cosinus',
      kind: '2d',
      scene: UnitCircleScene,
      preset: { mode: 'projections' },
      controls: angleControls,
      body: (
        <>
          <p>
            Rzuć punkt na osie. Długość rzutu na oś x to <strong>cosinus</strong>, a na oś y to{' '}
            <strong>sinus</strong> kąta θ.
          </p>
          <div className="formula">P = (cos θ, sin θ)</div>
          <p>
            Promień, rzut poziomy i pionowy tworzą trójkąt prostokątny o przeciwprostokątnej 1. Stąd z twierdzenia
            Pitagorasa:
          </p>
          <div className="formula">sin²θ + cos²θ = 1</div>
          <p>Sprawdź, w których ćwiartkach sinus i cosinus są ujemne.</p>
        </>
      ),
    },
    {
      title: 'Od okręgu do fali',
      kind: '2d',
      scene: UnitCircleScene,
      preset: { mode: 'wave' },
      controls: [
        { type: 'toggle', key: 'play', label: 'Obracaj automatycznie', default: true },
        angleControls[2],
        angleControls[0],
      ],
      body: (
        <>
          <p>
            Gdy punkt krąży, jego wysokość (sinus) rośnie i maleje. Jeśli zapiszemy ją w funkcji kąta, otrzymamy{' '}
            <strong>sinusoidę</strong>.
          </p>
          <p>
            Pełny obrót to <strong>2π</strong> radianów (360°) – po nim wykres zaczyna się powtarzać. Mówimy, że
            sinus jest funkcją <strong>okresową</strong> o okresie 2π.
          </p>
          <p>Właśnie dlatego sinusoidy opisują drgania, fale dźwiękowe i prąd przemienny.</p>
        </>
      ),
    },
  ],
};
