import { useMemo } from 'react';
import { Edges } from '@react-three/drei';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoBox, InfoPortal } from '../../lib/plot';
import { Lights } from '../../lib/three';
import { Board, C, Label, Poly, Pt, Seg, num, squareFrame, usePlot } from '../../lib/mathkit';

type P = [number, number];
const D2R = Math.PI / 180;

/* ---------- Krok 1: twierdzenie Talesa ---------- */
function ThalesScene({ params }: SceneProps) {
  const spread = Number(params.spread) * D2R;
  const t1 = Number(params.t1);
  const t2 = Number(params.t2);
  const tilt = Number(params.tilt) * D2R;
  const p = usePlot(squareFrame(1.5, 1.5, 7.5));
  const O: P = [-4.5, -2];
  const r1: P = [Math.cos(0.08), Math.sin(0.08)];
  const r2: P = [Math.cos(0.08 + spread), Math.sin(0.08 + spread)];
  const d: P = [Math.cos(tilt + 0.08 + spread), Math.sin(tilt + 0.08 + spread)];
  const hit = (A: P): P => {
    // O + s·r2 = A + λ·d
    const det = r2[0] * -d[1] - r2[1] * -d[0];
    const bx = A[0] - O[0];
    const by = A[1] - O[1];
    const s = (bx * -d[1] - by * -d[0]) / det;
    return [O[0] + s * r2[0], O[1] + s * r2[1]];
  };
  const A: P = [O[0] + t1 * r1[0], O[1] + t1 * r1[1]];
  const A2: P = [O[0] + t2 * r1[0], O[1] + t2 * r1[1]];
  const B = hit(A);
  const B2 = hit(A2);
  const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ext = (dir: P, len: number): P => [O[0] + dir[0] * len, O[1] + dir[1] * len];
  const ok = dist(O, B2) < 20;
  return (
    <Board p={p} axes={false}>
      <Seg p={p} a={O} b={ext(r1, 13)} color="rgba(255,255,255,0.6)" width={2} />
      <Seg p={p} a={O} b={ext(r2, 13)} color="rgba(255,255,255,0.6)" width={2} />
      {ok && (
        <>
          <Seg p={p} a={O} b={A} color={C.main} width={5} />
          <Seg p={p} a={A} b={A2} color={C.third} width={5} />
          <Seg p={p} a={O} b={B} color={C.second} width={5} />
          <Seg p={p} a={B} b={B2} color={C.good} width={5} />
          <Seg p={p} a={[A[0] - d[0] * 0.8, A[1] - d[1] * 0.8]} b={[B[0] + d[0] * 0.8, B[1] + d[1] * 0.8]} color="#c084fc" width={2.5} />
          <Seg p={p} a={[A2[0] - d[0] * 0.8, A2[1] - d[1] * 0.8]} b={[B2[0] + d[0] * 0.8, B2[1] + d[1] * 0.8]} color="#c084fc" width={2.5} />
          {(
            [
              [A, 'A', 10, 24],
              [A2, "A'", 10, 24],
              [B, 'B', -14, -10],
              [B2, "B'", -14, -10],
            ] as [P, string, number, number][]
          ).map(([q, name, dx, dy]) => (
            <Pt key={name} p={p} x={q[0]} y={q[1]} color="#fff" r={4} label={name} dx={dx} dy={dy} />
          ))}
        </>
      )}
      <Pt p={p} x={O[0]} y={O[1]} color="#fff" r={4} label="O" dx={-12} dy={4} />
      <InfoBox
        lines={[
          { text: `|OA| / |OA'| = ${num(t1)} / ${num(t2)} = ${num(t1 / t2, 3)}` },
          { text: `|OB| / |OB'| = ${num(dist(O, B))} / ${num(dist(O, B2))} = ${num(dist(O, B) / dist(O, B2), 3)}`, color: C.second },
          { text: `|AB| / |A'B'| = ${num(dist(A, B))} / ${num(dist(A2, B2))} = ${num(dist(A, B) / dist(A2, B2), 3)}`, color: '#c084fc' },
          { text: `|AA'| / |BB'| = |OA| / |OB| = ${num(t1 / dist(O, B), 3)}`, color: C.third },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 2: obwód ×k, pole ×k² ---------- */
function ScaleScene({ params }: SceneProps) {
  const k = Number(params.k);
  const p = usePlot(squareFrame(4.6, 2.1, 6));
  const tri: P[] = [];
  const s = 1.15;
  const h = (s * Math.sqrt(3)) / 2;
  const tris: P[][] = [];
  for (let row = 0; row < k; row++) {
    for (let i = 0; i < k - row; i++) {
      const x = i * s + (row * s) / 2;
      const y = row * h;
      tris.push([[x, y], [x + s, y], [x + s / 2, y + h]]);
      if (i < k - row - 1) tris.push([[x + s, y], [x + s / 2, y + h], [x + s * 1.5, y + h]]);
    }
  }
  tri.push([0, 0], [k * s, 0], [(k * s) / 2, k * h]);
  const sq0 = 5.5;
  const cells: P[][] = [];
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) cells.push([[sq0 + i * s, j * s], [sq0 + (i + 1) * s, j * s], [sq0 + (i + 1) * s, (j + 1) * s], [sq0 + i * s, (j + 1) * s]]);
  return (
    <Board p={p} axes={false}>
      {tris.map((t, i) => (
        <Poly key={i} p={p} pts={t} color="rgba(255,255,255,0.35)" fill={i === 0 ? C.third : C.main} fillOpacity={i === 0 ? 0.6 : 0.18} width={1.2} />
      ))}
      <Poly p={p} pts={tri} color={C.main} width={3.5} />
      {cells.map((c, i) => (
        <Poly key={i} p={p} pts={c} color="rgba(255,255,255,0.35)" fill={i === 0 ? C.third : C.second} fillOpacity={i === 0 ? 0.6 : 0.18} width={1.2} />
      ))}
      <Poly p={p} pts={[[sq0, 0], [sq0 + k * s, 0], [sq0 + k * s, k * s], [sq0, k * s]]} color={C.second} width={3.5} />
      <Label p={p} x={(k * s) / 2} y={0} dy={26} color={C.main} size={16}>
        bok ×{k}
      </Label>
      <Label p={p} x={sq0 + (k * s) / 2} y={0} dy={26} color={C.second} size={16}>
        bok ×{k}
      </Label>
      <InfoBox
        lines={[
          { text: `skala podobieństwa k = ${k}` },
          { text: `obwód: ×${k}`, color: C.third },
          { text: `pole: ×k² = ×${k * k} – mieści się ${k * k} małych figur`, color: C.main },
          { text: 'tak samo dla każdej figury, nie tylko trójkąta i kwadratu' },
        ]}
      />
    </Board>
  );
}

/* ---------- Krok 3: objętość ×k³ (3D) ---------- */
function CubesScene({ params }: SceneProps) {
  const k = Number(params.k);
  const explode = Number(params.explode);
  const cubes = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let x = 0; x < k; x++) for (let y = 0; y < k; y++) for (let z = 0; z < k; z++) out.push([x, y, z]);
    return out;
  }, [k]);
  const size = 0.7;
  const gap = size * (1 + explode * 0.6);
  const off = ((k - 1) * gap) / 2;
  return (
    <group>
      <Lights />
      <group position={[-off + 0.8, 0, -off]}>
        {cubes.map(([x, y, z], i) => (
          <mesh key={i} position={[x * gap, y * gap + size / 2, z * gap]}>
            <boxGeometry args={[size, size, size]} />
            <meshStandardMaterial color={i === 0 ? '#ffd166' : '#ff6b8b'} roughness={0.5} />
            <Edges color="#0b0d12" />
          </mesh>
        ))}
      </group>
      <mesh position={[-off - 0.9, size / 2, -off]}>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color="#ffd166" />
        <Edges color="#0b0d12" />
      </mesh>
      <InfoPortal>
        <div>skala k = {k}</div>
        <div style={{ color: '#ffd166', fontWeight: 600 }}>krawędź ×{k}, pole powierzchni ×{k * k}</div>
        <div style={{ color: '#ff6b8b', fontWeight: 600 }}>
          objętość ×k³ = ×{k ** 3} ({k ** 3} małych sześcianów)
        </div>
      </InfoPortal>
    </group>
  );
}

export const similarity: Topic = {
  id: 'podobienstwo-tales',
  title: 'Tales i podobieństwo',
  subject: 'matematyka',
  summary: 'Twierdzenie Talesa o odcinkach proporcjonalnych i skala podobieństwa: obwód rośnie k razy, pole k², a objętość k³.',
  accent: '#f9735b',
  glyph: '△',
  steps: [
    {
      title: 'Twierdzenie Talesa',
      kind: '2d',
      scene: ThalesScene,
      controls: [
        { type: 'slider', key: 'spread', label: 'Kąt między ramionami', min: 15, max: 70, step: 1, default: 35, unit: '°' },
        { type: 'slider', key: 'tilt', label: 'Kierunek prostych równoległych', min: 30, max: 150, step: 1, default: 110, unit: '°' },
        { type: 'slider', key: 't1', label: '|OA|', min: 1.5, max: 6, step: 0.1, default: 3.5 },
        { type: 'slider', key: 't2', label: "|OA'|", min: 4, max: 11, step: 0.1, default: 8 },
      ],
      body: (
        <>
          <div className="formula">|OA| / |OA'| = |OB| / |OB'|</div>
          <p>
            Ramiona kąta przecinamy dwiema <strong>prostymi równoległymi</strong> (fioletowe). Odcinki wycięte na jednym
            ramieniu są proporcjonalne do odcinków na drugim.
          </p>
          <p>
            Zmieniaj kąt i kierunek prostych – liczby w ramce zawsze się zgadzają. Proporcjonalne są też odcinki AB i
            A'B' na samych prostych. Na tym opiera się mierzenie wysokości drzewa po długości cienia.
          </p>
        </>
      ),
    },
    {
      title: 'Skala podobieństwa a pole',
      kind: '2d',
      scene: ScaleScene,
      controls: [{ type: 'slider', key: 'k', label: 'Skala k', min: 1, max: 5, step: 1, default: 3 }],
      body: (
        <>
          <div className="formula">Obw' = k · Obw      P' = k² · P</div>
          <p>
            Figura powiększona k razy ma <strong>k razy dłuższe boki</strong>, więc i obwód. Ale pole rośnie znacznie
            szybciej: w trójkącie o boku 3 razy dłuższym mieści się 9 małych trójkątów.
          </p>
          <p>Mapa w skali 1 : 2 pokazuje teren o polu 4 razy większym niż mapa 1 : 1 tego samego rozmiaru.</p>
        </>
      ),
    },
    {
      title: 'Objętość rośnie jak k³',
      kind: '3d',
      scene: CubesScene,
      camera: [5.5, 5, 7.5],
      target: [0, 1, 0],
      controls: [
        { type: 'slider', key: 'k', label: 'Skala k', min: 1, max: 5, step: 1, default: 3 },
        { type: 'slider', key: 'explode', label: 'Rozsunięcie', min: 0, max: 1, step: 0.05, default: 0.3, decimals: 2 },
      ],
      body: (
        <>
          <div className="formula">V' = k³ · V</div>
          <p>
            W przestrzeni dochodzi trzeci wymiar. Sześcian o krawędzi 3 razy dłuższej składa się z{' '}
            <strong>27 małych sześcianów</strong>, a jego powierzchnia jest tylko 9 razy większa.
          </p>
          <p>
            Dlatego słoń ma tak grube nogi: masa (objętość) rośnie jak k³, a wytrzymałość kości (pole przekroju) tylko
            jak k².
          </p>
        </>
      ),
    },
  ],
};
