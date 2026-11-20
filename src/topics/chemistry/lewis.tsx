/**
 * Wzory kreskowe (elektronowe, Lewisa) cząsteczek: wiązania jako kreski, wolne pary jako krótkie kreski
 * przy atomie (konwencja szkolna), łuk z wartością kąta między wiązaniami.
 */

type Atom = [symbol: string, x: number, y: number, lonePairs?: number];

interface LewisData {
  atoms: Atom[];
  bonds: [number, number, number][]; // [a, b, krotność]
  angle?: [center: number, a: number, b: number, label: string];
  note?: string;
}

const LEWIS: Record<string, LewisData> = {
  h2o: {
    atoms: [['O', 0, 0, 2], ['H', -0.79, -0.61], ['H', 0.79, -0.61]],
    bonds: [[0, 1, 1], [0, 2, 1]],
    angle: [0, 1, 2, '104,5°'],
  },
  co2: {
    atoms: [['C', 0, 0], ['O', -1.15, 0, 2], ['O', 1.15, 0, 2]],
    bonds: [[0, 1, 2], [0, 2, 2]],
    angle: [0, 1, 2, '180°'],
  },
  nh3: {
    atoms: [['N', 0, 0, 1], ['H', -0.92, -0.42], ['H', 0.92, -0.42], ['H', 0, -1.0]],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]],
    angle: [0, 1, 3, '107°'],
  },
  ch4: {
    atoms: [['C', 0, 0], ['H', 0, 1], ['H', 0, -1], ['H', -1, 0], ['H', 1, 0]],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
    angle: [0, 1, 4, '109,5°'],
    note: 'Na płaskim rysunku kąt wygląda na 90°, w przestrzeni wynosi 109,5°.',
  },
  c2h4: {
    atoms: [['C', -0.62, 0], ['C', 0.62, 0], ['H', -1.2, 0.85], ['H', -1.2, -0.85], ['H', 1.2, 0.85], ['H', 1.2, -0.85]],
    bonds: [[0, 1, 2], [0, 2, 1], [0, 3, 1], [1, 4, 1], [1, 5, 1]],
    angle: [0, 2, 3, '117°'],
  },
  bf3: {
    atoms: [['B', 0, 0], ['F', 0, 1.05, 3], ['F', -0.91, -0.52, 3], ['F', 0.91, -0.52, 3]],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]],
    angle: [0, 1, 3, '120°'],
    note: 'Bor ma tylko 6 elektronów walencyjnych – luka elektronowa.',
  },
  pcl5: {
    atoms: [['P', 0, 0], ['Cl', 0, 1.15, 3], ['Cl', 0, -1.15, 3], ['Cl', -1.15, 0, 3], ['Cl', 0.95, 0.55, 3], ['Cl', 0.95, -0.55, 3]],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [0, 5, 1]],
    angle: [0, 1, 4, '90°'],
    note: 'Fosfor ma 10 elektronów walencyjnych – rozszerzony oktet.',
  },
  sf6: {
    atoms: [['S', 0, 0], ['F', 0, 1.1, 3], ['F', 0, -1.1, 3], ['F', -1.1, 0, 3], ['F', 1.1, 0, 3], ['F', 0.75, 0.75, 3], ['F', -0.75, -0.75, 3]],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [0, 5, 1], [0, 6, 1]],
    angle: [0, 1, 4, '90°'],
    note: 'Siarka ma 12 elektronów walencyjnych – rozszerzony oktet.',
  },
};

const COLORS: Record<string, string> = { H: '#e2e8f0', C: '#94a3b8', N: '#60a5fa', O: '#f87171', F: '#86efac', Cl: '#4ade80', S: '#fde047', P: '#fb923c', B: '#fca5a5' };

/** Kąty (w radianach) dla wolnych par: jak najdalej od wiązań i od siebie nawzajem. */
function lonePairAngles(bondAngles: number[], count: number): number[] {
  const chosen: number[] = [];
  const dist = (a: number, b: number) => {
    const d = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(d, Math.PI * 2 - d);
  };
  for (let k = 0; k < count; k++) {
    let best = 0;
    let bestScore = -1;
    for (let deg = 0; deg < 360; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const score = Math.min(...[...bondAngles, ...chosen].map((b) => dist(a, b)), Math.PI);
      if (score > bestScore + 1e-6) {
        bestScore = score;
        best = a;
      }
    }
    chosen.push(best);
  }
  return chosen;
}

export function LewisFormula({ id }: { id: string }) {
  const data = LEWIS[id];
  if (!data) return null;
  const S = 46; // piksele na jednostkę
  const X = (x: number) => x * S;
  const Y = (y: number) => -y * S;
  const atomR = 0.24;

  const xs = data.atoms.map((a) => a[1]);
  const ys = data.atoms.map((a) => a[2]);
  const pad = 0.75;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;

  const lines: JSX.Element[] = [];
  data.bonds.forEach(([a, b, order], i) => {
    const [, x1, y1] = data.atoms[a];
    const [, x2, y2] = data.atoms[b];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy * 0.09;
    const py = ux * 0.09;
    const offsets = order === 1 ? [0] : order === 2 ? [-1, 1] : [-1.6, 0, 1.6];
    offsets.forEach((o, j) =>
      lines.push(
        <line
          key={`b${i}-${j}`}
          x1={X(x1 + ux * atomR + px * o)}
          y1={Y(y1 + uy * atomR + py * o)}
          x2={X(x2 - ux * atomR + px * o)}
          y2={Y(y2 - uy * atomR + py * o)}
          stroke="#e5e7eb"
          strokeWidth="2.4"
          strokeLinecap="round"
        />,
      ),
    );
  });

  // wolne pary – krótkie kreski prostopadłe do kierunku od atomu
  const pairs: JSX.Element[] = [];
  data.atoms.forEach(([, x, y, lp = 0], ai) => {
    if (!lp) return;
    const bondAngles = data.bonds
      .filter(([a, b]) => a === ai || b === ai)
      .map(([a, b]) => {
        const o = data.atoms[a === ai ? b : a];
        return Math.atan2(o[2] - y, o[1] - x);
      });
    lonePairAngles(bondAngles, lp).forEach((ang, k) => {
      const cx = x + Math.cos(ang) * 0.4;
      const cy = y + Math.sin(ang) * 0.4;
      const tx = -Math.sin(ang) * 0.15;
      const ty = Math.cos(ang) * 0.15;
      pairs.push(<line key={`lp${ai}-${k}`} x1={X(cx - tx)} y1={Y(cy - ty)} x2={X(cx + tx)} y2={Y(cy + ty)} stroke="#f472b6" strokeWidth="2.4" strokeLinecap="round" />);
    });
  });

  // łuk kąta
  let arc: JSX.Element | null = null;
  if (data.angle) {
    const [c, a, b, label] = data.angle;
    const [, cx, cy] = data.atoms[c];
    const a1 = Math.atan2(data.atoms[a][2] - cy, data.atoms[a][1] - cx);
    let a2 = Math.atan2(data.atoms[b][2] - cy, data.atoms[b][1] - cx);
    let diff = a2 - a1;
    while (diff <= -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    if (Math.abs(Math.abs(diff) - Math.PI) < 0.01) diff = Math.PI; // 180°: łuk górą
    a2 = a1 + diff;
    const r = 0.5;
    const pts: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = a1 + (diff * i) / 24;
      pts.push(`${X(cx + Math.cos(t) * r)},${Y(cy + Math.sin(t) * r)}`);
    }
    const mid = a1 + diff / 2;
    arc = (
      <g>
        <polyline points={pts.join(' ')} fill="none" stroke="#ffd166" strokeWidth="1.6" />
        <text x={X(cx + Math.cos(mid) * 0.82)} y={Y(cy + Math.sin(mid) * 0.82) + 4} fontSize="12" fontWeight="700" fill="#ffd166" textAnchor="middle">
          {label}
        </text>
      </g>
    );
  }

  return (
    <div className="lewis">
      <div className="lewis-title">wzór kreskowy</div>
      <svg viewBox={`${X(minX)} ${Y(maxY)} ${(maxX - minX) * S} ${(maxY - minY) * S}`} fontFamily="Geist, sans-serif">
        {lines}
        {arc}
        {pairs}
        {data.atoms.map(([sym, x, y], i) => (
          <text key={`a${i}`} x={X(x)} y={Y(y) + 6} fontSize="17" fontWeight="700" textAnchor="middle" fill={COLORS[sym] ?? '#fff'}>
            {sym}
          </text>
        ))}
      </svg>
      <div className="lewis-legend">
        <span className="lg-bond">wiązanie</span>
        <span className="lg-lp">wolna para</span>
      </div>
      {data.note && <div className="lewis-note">{data.note}</div>}
    </div>
  );
}
