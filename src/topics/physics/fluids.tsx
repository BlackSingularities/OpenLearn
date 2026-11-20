import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { Arrow3D, Lights } from '../../lib/three';
import { arrow, useCanvasLoop } from '../../lib/useCanvasLoop';
import { C, num } from '../../lib/mathkit';
import { useSpeed } from '../../components/ui';

const G = 9.81;
const LIQUIDS: Record<string, { name: string; rho: number; color: string }> = {
  woda: { name: 'woda', rho: 1000, color: '#3b82f6' },
  solanka: { name: 'woda morska', rho: 1030, color: '#14b8a6' },
  olej: { name: 'olej', rho: 900, color: '#eab308' },
  rtec: { name: 'rtęć', rho: 13600, color: '#94a3b8' },
};
const MATERIALS = [
  { name: 'styropian', rho: 30 },
  { name: 'drewno sosnowe', rho: 500 },
  { name: 'lód', rho: 917 },
  { name: 'aluminium', rho: 2700 },
  { name: 'żelazo', rho: 7870 },
  { name: 'złoto', rho: 19300 },
];

/* ---------- Krok 1: prawo Archimedesa ---------- */
const TANK = { w: 4, d: 2.4, h: 3, level: 2.2 };
function ArchimedesScene({ params }: SceneProps) {
  const L = LIQUIDS[String(params.liquid)] ?? LIQUIDS.woda;
  const rho = Number(params.rho);
  const a = 1; // krawędź sześcianu w metrach (w scenie 1 = 1 m)
  const V = a ** 3;
  const frac = Math.min(1, rho / L.rho);
  const sinks = rho > L.rho;
  // równowaga: dolna ścianka na głębokości frac·a
  const targetBottom = sinks ? 0.02 : TANK.level - frac * a;
  const block = useRef<THREE.Group>(null);
  const st = useRef({ y: TANK.level + 0.6, v: 0 });
  useFrame((_, dt) => {
    const s = st.current;
    const k = 8;
    s.v += (-(s.y - targetBottom) * k - s.v * 3) * dt;
    s.y += s.v * dt;
    if (s.y < 0.02) {
      s.y = 0.02;
      s.v = 0;
    }
    block.current?.position.set(0, s.y + a / 2, 0);
  });
  const W = rho * V * G;
  const B = L.rho * G * V * frac;
  const scale = 1.4 / Math.max(W, B, 1);
  const mat = MATERIALS.reduce((best, m) => (Math.abs(m.rho - rho) < Math.abs(best.rho - rho) ? m : best));
  return (
    <group position={[0, -1, 0]}>
      <Lights />
      {/* zbiornik */}
      <mesh position={[0, TANK.h / 2, 0]}>
        <boxGeometry args={[TANK.w, TANK.h, TANK.d]} />
        <meshStandardMaterial color="#cbd5e1" transparent opacity={0.06} depthWrite={false} />
        <Edges color="#94a3b8" />
      </mesh>
      <mesh position={[0, TANK.level / 2, 0]}>
        <boxGeometry args={[TANK.w - 0.02, TANK.level, TANK.d - 0.02]} />
        <meshStandardMaterial color={L.color} transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <group ref={block}>
        <mesh>
          <boxGeometry args={[a, a, a]} />
          <meshStandardMaterial color={rho > 5000 ? '#fbbf24' : rho > 2000 ? '#cbd5e1' : rho < 100 ? '#f8fafc' : '#c08457'} metalness={rho > 2000 ? 0.6 : 0} roughness={0.5} />
          <Edges color="#0b0d12" />
        </mesh>
        <Arrow3D from={[0.75, 0, 0]} vec={[0, -W * scale, 0]} color="#ff6b8b" radius={0.04} />
        <Arrow3D from={[-0.75, 0, 0]} vec={[0, B * scale, 0]} color="#4fc3ff" radius={0.04} />
      </group>
      <InfoPortal>
        <div>
          sześcian 1 m³, ρ = {rho.toLocaleString('pl-PL')} kg/m³ (≈ {mat.name})
        </div>
        <div style={{ color: '#ff6b8b', fontWeight: 600 }}>ciężar Q = ρ·V·g = {num(W / 1000, 2)} kN</div>
        <div style={{ color: '#4fc3ff', fontWeight: 600 }}>wypór Fw = ρ_c·g·V_zan = {num(B / 1000, 2)} kN</div>
        <div style={{ color: '#ffd166' }}>
          {sinks ? `tonie: nawet całkowicie zanurzony wypiera za mało cieczy (${L.name})` : `pływa, zanurzony w ${Math.round(frac * 100)}% – wypór = ciężar`}
        </div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 2: ciśnienie hydrostatyczne ---------- */
function PressureScene({ params }: SceneProps) {
  const sp = useSpeed();
  const hW = Number(params.h);
  const L = LIQUIDS[String(params.liquid)] ?? LIQUIDS.woda;
  const holes = [0.2, 0.45, 0.7];
  const ref = useCanvasLoop((ctx, w, h, _dt, t) => {
    const ground = h - 30;
    const tankH = Math.min(h - 80, 360);
    const scale = tankH / 2.2; // px na metr (zbiornik 2,2 m)
    const tx = w * 0.18;
    const tw = Math.min(140, w * 0.2);
    const base = ground - 20; // dno zbiornika
    const top = base - hW * scale;
    // zbiornik i ciecz
    ctx.fillStyle = L.color;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(tx, top, tw, base - top);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, base - 2.2 * scale);
    ctx.lineTo(tx, base);
    ctx.lineTo(tx + tw, base);
    ctx.lineTo(tx + tw, base - 2.2 * scale);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#2a3348';
    ctx.fillRect(0, ground, w, 30);
    ctx.fillRect(tx - 10, base, tw + 20, ground - base);
    // strumienie (Torricelli) i manometry
    holes.forEach((frac, i) => {
      const yh = base - frac * 2.2 * scale;
      const depth = (yh - top) / scale;
      if (depth <= 0.01) return;
      const v = Math.sqrt(2 * G * depth);
      const fall = (ground - yh) / scale;
      const tFall = Math.sqrt((2 * fall) / G);
      ctx.strokeStyle = L.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const tt = (k / 40) * tFall;
        const x = tx + tw + v * tt * scale;
        const y = yh + 0.5 * G * tt * tt * scale;
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      // kropelki
      ctx.fillStyle = '#e0f2fe';
      for (let k = 0; k < 6; k++) {
        const tt = (((t * 0.8 + k / 6) % 1) * tFall);
        ctx.beginPath();
        ctx.arc(tx + tw + v * tt * scale, yh + 0.5 * G * tt * tt * scale, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // strzałki parcia na ściankę
      const p = L.rho * G * depth;
      arrow(ctx, tx + tw - 4 - Math.min(60, p / 400), yh, tx + tw - 4, yh, C.main, 2.5);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '600 12px Geist, sans-serif';
      ctx.fillText(`${i + 1}: ${num(p / 1000, 1)} kPa`, 8, yh + 4);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px Geist, sans-serif';
    ctx.fillText('ciśnienie hydrostatyczne w otworach', 8, top - 12 > 14 ? top - 12 : 14);
  });
  const depths = holes.map((f) => hW - f * 2.2).filter((d) => d > 0);
  return (
    <>
      <canvas ref={ref} className="scene-canvas" />
      <InfoPortal>
        <div style={{ color: C.main, fontWeight: 600 }}>p = ρ·g·h (h – głębokość pod powierzchnią)</div>
        {depths.map((d, i) => (
          <div key={i}>
            otwór {i + 1}: h = {num(d, 2)} m, p = {num((L.rho * G * d) / 1000, 1)} kPa, v = √(2gh) = {sp.fmt(Math.sqrt(2 * G * d), 2)}
          </div>
        ))}
        <div className="muted-line">
          {L.name}, ρ = {L.rho.toLocaleString('pl-PL')} kg/m³ – prędkość wypływu nie zależy od gęstości
        </div>
      </InfoPortal>
    </>
  );
}

export const fluids: Topic = {
  id: 'hydrostatyka',
  title: 'Hydrostatyka i prawo Archimedesa',
  subject: 'fizyka',
  summary: 'Sześcian z różnych materiałów w wodzie, oleju i rtęci – kiedy pływa, kiedy tonie – oraz ciśnienie rosnące z głębokością i strumienie z otworów w zbiorniku.',
  accent: '#818cf8',
  glyph: '≋',
  steps: [
    {
      title: 'Prawo Archimedesa',
      kind: '3d',
      scene: ArchimedesScene,
      camera: [3.5, 2.6, 6.5],
      target: [0, 0.2, 0],
      controls: [
        { type: 'slider', key: 'rho', label: 'Gęstość sześcianu', min: 30, max: 20000, step: 10, default: 600, unit: 'kg/m³' },
        {
          type: 'select',
          key: 'liquid',
          label: 'Ciecz',
          default: 'woda',
          options: Object.entries(LIQUIDS).map(([value, l]) => ({ value, label: l.name })),
        },
      ],
      body: (
        <>
          <div className="formula">Fw = ρ_cieczy · g · V_zanurzone</div>
          <p>
            Ciecz naciska na dolną ściankę mocniej niż na górną, bo jest tam głębiej. Wypadkowa tych nacisków to{' '}
            <strong>siła wyporu</strong> – równa ciężarowi cieczy wypartej przez ciało.
          </p>
          <p>
            Ciało pływa, gdy jest mniej gęste od cieczy, i zanurza się dokładnie w takim ułamku, jaki wynosi stosunek
            gęstości. Lód (917 kg/m³) wystaje z wody w ok. 8% – stąd „wierzchołek góry lodowej”.
          </p>
          <p>Wybierz rtęć: pływa w niej nawet żelazo.</p>
        </>
      ),
    },
    {
      title: 'Ciśnienie hydrostatyczne',
      kind: '2d',
      scene: PressureScene,
      controls: [
        { type: 'slider', key: 'h', label: 'Poziom cieczy', min: 0.5, max: 2.1, step: 0.05, default: 2, unit: 'm' },
        {
          type: 'select',
          key: 'liquid',
          label: 'Ciecz',
          default: 'woda',
          options: Object.entries(LIQUIDS).map(([value, l]) => ({ value, label: l.name })),
        },
      ],
      body: (
        <>
          <div className="formula">p = ρ · g · h</div>
          <p>
            Ciśnienie w cieczy rośnie <strong>liniowo z głębokością</strong> – im niżej otwór, tym mocniej ciecz napiera
            na ściankę i tym szybciej wypływa.
          </p>
          <p>
            Prędkość wypływu v = √(2gh) to wzór Torricellego – taki sam jak na prędkość ciała spadającego z wysokości h.
            Dlatego tamy są u dołu znacznie grubsze niż u góry.
          </p>
        </>
      ),
    },
  ],
};
