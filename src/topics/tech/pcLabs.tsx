/*
 * Komputer osobisty – pracownie „w środku komputera”: powiększone modele na podestach. Zasilacz bez pokrywy
 * z drogą prądu, przekrój płytki drukowanej, przekrój procesora, plan krzemowego rdzenia, tranzystor FinFET,
 * potok wykonywania rozkazów i przekrój chłodzenia z przepływem ciepła.
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Lbl } from '../aviation/airliner';
import { EnergyFlow } from '../energy/windExtras';
import { LAB_Y, mix, rng, type V3 } from './pcGeo';
import { Box, Cyl, Fan, MAT, Pedestal } from './pcMats';
import { labelMat } from './pcParts';

/** Kolory podpisów. */
export const LC = { hot: '#fca5a5', cold: '#7dd3fc', part: '#e2e8f0', gold: '#fde68a', green: '#86efac', violet: '#c4b5fd' };

/** Pracownia: podest i grupa eksponatu na wysokości LAB_Y. */
export function LabStage({ p, children, r = 75 }: { p: V3; children: ReactNode; r?: number }) {
  return (
    <group position={p}>
      <Pedestal p={[0, 0, 0]} r={r} />
      <group position={[0, LAB_Y, 0]}>{children}</group>
    </group>
  );
}

/**
 * Warstwa w przekroju: prostopadłościan od z = −d do 0 (przód ścięty) i płaska ściana przekroju w z = 0
 * z kreskowaniem. x0…x1, y0…y1 – zakres.
 */
export function Slab({ x0, x1, y0, y1, d, m, cut }: { x0: number; x1: number; y0: number; y1: number; d: number; m: THREE.Material; cut?: THREE.Material }) {
  return (
    <group>
      <Box p={[(x0 + x1) / 2, (y0 + y1) / 2, -d / 2]} s={[x1 - x0, y1 - y0, d]} m={m} />
      {cut && (
        <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, 0.02]} material={cut}>
          <planeGeometry args={[x1 - x0, y1 - y0]} />
        </mesh>
      )}
    </group>
  );
}

/* ================= zasilacz ================= */

/**
 * Zasilacz komputerowy bez pokrywy, powiększony 5×. Prąd z gniazdka (230 V, zmienny) przechodzi przez filtr,
 * mostek prostowniczy, układ PFC i duży kondensator, tranzystory „siekają” go na impulsy 100 tys. razy na
 * sekundę, mały transformator obniża napięcie, prostowniki i kondensatory dają gładkie 12 V.
 */
export function PsuLab({ p, spin, labels }: { p: V3; spin: () => number; labels: boolean }) {
  const n = MAT();
  const S = 5;
  const big = useMemo(() => labelMat('bulk', ['450 V', '470 µF'], '#21304a', '#d0d8e4'), []);
  const fins = (x: number, z0: number, z1: number) =>
    Array.from({ length: 9 }, (_, i) => <Box key={i} p={[x + (i - 4) * 0.28, 3.4, (z0 + z1) / 2]} s={[0.08, 4.2, z1 - z0]} m={n.alu} />);
  // droga prądu w układzie zasilacza (cm)
  const ac: V3[] = [
    [-7.6, 6.2, -4],
    [-6, 1.6, -4],
    [-4.4, 1.6, -3],
    [-3.6, 1.6, 0],
    [-3, 2.5, 2.6],
    [-1.2, 2.2, 3.5],
  ];
  const hv: V3[] = [
    [-1.2, 2.2, 3.5],
    [0.4, 2.4, 1],
    [1.4, 2.4, -1],
    [2.6, 2.6, -1],
  ];
  const dc: V3[] = [
    [2.6, 2.6, -1],
    [4.4, 2.2, -1],
    [5.2, 2, 1.5],
    [6.4, 2, 3],
    [7.6, 2, 3],
  ];
  const sc = (pts: V3[]): V3[] => pts.map(([x, y, z]) => [x * S, y * S, z * S]);
  return (
    <LabStage p={p}>
      <group position={[0, -35, 0]}>
        <group scale={S}>
          {/* obudowa bez pokrywy: dno i trzy ściany */}
          <Box p={[0, 0.05, 0]} s={[15, 0.1, 14]} m={n.psu} />
          <Box p={[0, 4.3, -7]} s={[15, 8.6, 0.1]} m={n.psu} />
          <Box p={[-7.5, 4.3, 0]} s={[0.1, 8.6, 14]} m={n.psu} />
          <Box p={[7.5, 4.3, 0]} s={[0.1, 8.6, 14]} m={n.psu} />
          <Box p={[0, 0.2, 0]} s={[14.6, 0.16, 13.6]} m={n.greenBoard} />
          {/* gniazdo sieciowe i włącznik */}
          <Box p={[-7.3, 6.2, -4]} s={[0.4, 2.2, 2.8]} m={n.plastic} />
          <Box p={[-7.3, 6.2, -1.2]} s={[0.4, 1.4, 0.9]} m={n.red} />
          {/* filtr EMI: dławik toroidalny i kondensatory X */}
          <mesh position={[-5.6, 1.3, -4]} rotation={[0, Math.PI / 2, 0]} material={n.copper}>
            <torusGeometry args={[0.8, 0.35, 10, 24]} />
          </mesh>
          {[-5.8, -2.4].map((z) => (
            <Box key={z} p={[-4.6, 0.9, z]} s={[1.2, 1.4, 0.6]} m={n.yellow} />
          ))}
          {/* mostek prostowniczy na radiatorze */}
          <Box p={[-3.6, 1.4, 0]} s={[0.4, 2.2, 2.4]} m={n.chip} />
          {/* dławik PFC */}
          <mesh position={[-3, 1.5, 2.8]} rotation={[-Math.PI / 2, 0, 0]} material={n.copper}>
            <torusGeometry args={[1.2, 0.55, 12, 28]} />
          </mesh>
          {/* kondensator główny */}
          <Cyl p={[-1.2, 2.15, 4.4]} r={1.4} h={3.9} m={big} seg={28} />
          <Cyl p={[-1.2, 4.12, 4.4]} r={1.35} h={0.05} m={n.capTop} seg={28} />
          {/* tranzystory przełączające na radiatorze strony pierwotnej */}
          <Box p={[0.4, 0.5, 0]} s={[2.6, 0.4, 6]} m={n.alu} />
          {fins(0.4, -3, 3)}
          {[-1.8, 0, 1.8].map((z) => (
            <group key={z}>
              <Box p={[-0.85, 2.2, z]} s={[0.25, 1.2, 0.9]} m={n.chip} />
              <Box p={[-0.72, 2.7, z]} s={[0.05, 0.6, 0.9]} m={n.steel} />
            </group>
          ))}
          {/* transformator: rdzeń ferrytowy i uzwojenia */}
          <group position={[1.9, 1.9, -1.6]}>
            <Box p={[0, 0, 0]} s={[2.6, 3.2, 2.6]} m={n.yellow} />
            <Box p={[0, 1.8, 0]} s={[2.8, 0.5, 2.2]} m={n.ferrite} />
            <Box p={[0, -1.4, 0]} s={[2.8, 0.4, 2.2]} m={n.ferrite} />
            {[-1.3, 1.3].map((x) => (
              <Box key={x} p={[x, 0.2, 0]} s={[0.45, 3.4, 2.2]} m={n.ferrite} />
            ))}
          </group>
          {/* radiator strony wtórnej z prostownikami */}
          <Box p={[4.4, 0.5, -1]} s={[1.6, 0.4, 7]} m={n.alu} />
          {fins(4.4, -4.5, 2.5)}
          {/* kondensatory wyjściowe i płytka 5 V / 3,3 V */}
          {Array.from({ length: 8 }, (_, i) => (
            <Cyl key={i} p={[5.6 + (i % 2) * 0.8, 0.9, -5 + Math.floor(i / 2) * 1.6]} r={0.35} h={1.4} m={n.capacitor} seg={14} />
          ))}
          <Box p={[6.6, 2.4, 2.2]} s={[1.6, 3.2, 0.12]} m={n.greenBoard} />
          {[1.6, 2.6, 3.4].map((y) => (
            <Box key={y} p={[6.6, y, 2.32]} s={[0.8, 0.5, 0.15]} m={n.chip} />
          ))}
          {/* gniazda kabli modułowych */}
          {[-4.5, -2, 0.5, 3, 5.5].map((z) => (
            <Box key={z} p={[7.2, 1.2, z]} s={[0.5, 1.4, 2]} m={n.slot} />
          ))}
          {/* pokrywa z wentylatorem uniesiona nad zasilaczem */}
          <group position={[0, 12.5, 0]}>
            <Box p={[0, 0, 0]} s={[15, 0.1, 14]} m={n.glass} />
            <Fan p={[0, -0.6, 0]} d={12} axis="y" spin={spin} frame={false} />
          </group>
        </group>
        <EnergyFlow path={sc(ac)} count={34} speed={18} size={0.7} color="#ff8a5c" />
        <EnergyFlow path={sc(hv)} count={18} speed={26} size={0.7} color="#ffd34d" />
        <EnergyFlow path={sc(dc)} count={30} speed={18} size={0.7} color="#5fb4ff" />
        {labels && (
          <>
            <Lbl pos={[-7.6 * S, 9 * S, -4 * S]} sub color={LC.hot}>
              gniazdo 230 V
            </Lbl>
            <Lbl pos={[-5.6 * S, 3.2 * S, -5 * S]} sub color={LC.part}>
              filtr zakłóceń
            </Lbl>
            <Lbl pos={[-3.6 * S, 3.6 * S, 0.4 * S]} sub color={LC.part}>
              mostek prostowniczy
            </Lbl>
            <Lbl pos={[-3 * S, 3.6 * S, 3 * S]} sub color={LC.part}>
              dławik PFC
            </Lbl>
            <Lbl pos={[-1.2 * S, 5.4 * S, 4.4 * S]} sub color={LC.gold}>
              kondensator 400 V
            </Lbl>
            <Lbl pos={[0.4 * S, 6.2 * S, 0]} sub color={LC.part}>
              tranzystory kluczujące
            </Lbl>
            <Lbl pos={[1.9 * S, 4.6 * S, -1.6 * S]} sub color={LC.gold}>
              transformator
            </Lbl>
            <Lbl pos={[4.4 * S, 6.2 * S, -1 * S]} sub color={LC.part}>
              prostowniki
            </Lbl>
            <Lbl pos={[6.2 * S, 2.8 * S, -5 * S]} sub color={LC.cold}>
              kondensatory 12 V
            </Lbl>
            <Lbl pos={[7.6 * S, 3 * S, 4.5 * S]} sub color={LC.cold}>
              wyjścia 12 V, 5 V, 3,3 V
            </Lbl>
            <Lbl pos={[0, 13.6 * S, 0]} sub color={LC.part}>
              pokrywa z wentylatorem
            </Lbl>
          </>
        )}
      </group>
    </LabStage>
  );
}

/* ================= płytka drukowana w przekroju ================= */

/**
 * Wycinek płyty głównej powiększony ok. 60×: 8 warstw miedzi rozdzielonych laminatem szklano-epoksydowym,
 * przelotki łączące warstwy, na wierzchu układ BGA na kulkach lutu i rezystor.
 */
export function PcbLab({ p }: { p: V3 }) {
  const n = MAT();
  const W = 110;
  const D = 60;
  // grubości (cm w powiększeniu): maska, miedź, laminat...
  const layers = useMemo(() => {
    const list: { y0: number; y1: number; kind: 'mask' | 'cu' | 'plane' | 'fr4' }[] = [];
    const seq: ['mask' | 'cu' | 'plane' | 'fr4', number][] = [
      ['mask', 0.8],
      ['cu', 1.2],
      ['fr4', 3.2],
      ['plane', 2],
      ['fr4', 3.2],
      ['cu', 1.2],
      ['fr4', 4.5],
      ['plane', 2],
      ['fr4', 4.5],
      ['cu', 1.2],
      ['fr4', 3.2],
      ['plane', 2],
      ['fr4', 3.2],
      ['cu', 1.2],
      ['mask', 0.8],
    ];
    let y = 0;
    for (const [k, t] of [...seq].reverse()) {
      list.push({ y0: y, y1: y + t, kind: k });
      y += t;
    }
    return { list, top: y };
  }, []);
  const traces = useMemo(() => {
    const r = rng(77);
    return layers.list
      .filter((l) => l.kind === 'cu')
      .flatMap((l) => Array.from({ length: 9 }, (_, i) => ({ x: -W / 2 + 6 + i * 11.5 + r() * 3, w: 2 + r() * 3, y: (l.y0 + l.y1) / 2, h: l.y1 - l.y0 })));
  }, [layers]);
  const vias = [-38, -12, 14, 34];
  const top = layers.top;
  const balls = Array.from({ length: 7 }, (_, i) => -18 + i * 6);
  return (
    <LabStage p={p}>
      <group position={[0, -20, 0]}>
        {layers.list.map((l, i) =>
          l.kind === 'cu' ? (
            <Slab key={i} x0={-W / 2} x1={W / 2} y0={l.y0} y1={l.y1} d={D} m={n.cutBoard} cut={n.cutBoard} />
          ) : (
            <Slab key={i} x0={-W / 2} x1={W / 2} y0={l.y0} y1={l.y1} d={D} m={l.kind === 'mask' ? n.chip : l.kind === 'plane' ? n.copper : n.cutBoard} cut={l.kind === 'plane' ? n.cutCopper : l.kind === 'mask' ? n.cutPlastic : n.cutBoard} />
          ),
        )}
        {/* ścieżki w warstwach sygnałowych (przekroje miedzi) */}
        {traces.map((t, i) => (
          <Box key={i} p={[t.x, t.y, -D / 2]} s={[t.w, t.h, D]} m={n.copper} />
        ))}
        {traces.map((t, i) => (
          <mesh key={`c${i}`} position={[t.x, t.y, 0.04]} material={n.cutCopper}>
            <planeGeometry args={[t.w, t.h]} />
          </mesh>
        ))}
        {/* przelotki: miedziane rurki przez całą grubość */}
        {vias.map((x) => (
          <group key={x}>
            <Cyl p={[x, top / 2, 0]} r={1.4} h={top} m={n.copper} theta={[Math.PI, Math.PI]} seg={20} />
            <mesh position={[x, top / 2, 0.05]} material={n.cutCopper}>
              <planeGeometry args={[2.8, top]} />
            </mesh>
            <mesh position={[x, top / 2, 0.06]} material={n.slot}>
              <planeGeometry args={[1.6, top]} />
            </mesh>
          </group>
        ))}
        {/* układ BGA na kulkach lutu */}
        <group position={[-2, top, 0]}>
          {balls.map((x) =>
            [-2, -8, -14].map((z) => (
              <mesh key={`${x}${z}`} position={[x, 1.6, z]} material={n.solder}>
                <sphereGeometry args={[1.6, 14, 10]} />
              </mesh>
            )),
          )}
          {balls.map((x) => (
            <mesh key={x} position={[x, 1.6, 0.02]} material={n.cutAlu}>
              <circleGeometry args={[1.6, 16]} />
            </mesh>
          ))}
          <Slab x0={-24} x1={24} y0={3} y1={6} d={D * 0.5} m={n.greenBoard} cut={n.cutBoard} />
          <Slab x0={-16} x1={16} y0={6} y1={8} d={D * 0.45} m={n.die} cut={n.cutSilicon} />
          <Slab x0={-22} x1={22} y0={8} y1={11} d={D * 0.5} m={n.chip} cut={n.cutPlastic} />
        </group>
        {/* rezystor SMD */}
        <Box p={[42, top + 1.6, -14]} s={[8, 3.2, 4]} m={n.chip} />
        {[38.5, 45.5].map((x) => (
          <Box key={x} p={[x, top + 1.6, -14]} s={[1, 3.4, 4.2]} m={n.solder} />
        ))}
        <Lbl pos={[-W / 2 - 4, top - 0.4, 0]} sub color={LC.part}>
          maska lutownicza
        </Lbl>
        <Lbl pos={[W / 2 + 6, top - 1.4, 0]} sub color={LC.gold}>
          ścieżki z miedzi
        </Lbl>
        <Lbl pos={[W / 2 + 6, layers.list[3].y0 + 18, 0]} sub color={LC.gold}>
          warstwa zasilania
        </Lbl>
        <Lbl pos={[-W / 2 - 6, 12, 0]} sub color={LC.green}>
          laminat szklano-epoksydowy
        </Lbl>
        <Lbl pos={[vias[0], top + 4, 2]} sub color={LC.gold}>
          przelotka
        </Lbl>
        <Lbl pos={[-2, top + 16, 0]} sub color={LC.part}>
          układ scalony BGA
        </Lbl>
        <Lbl pos={[-28, top + 2, 2]} sub color={LC.part}>
          kulki lutu
        </Lbl>
        <Lbl pos={[42, top + 6, -14]} sub color={LC.part}>
          rezystor
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= przekrój procesora ================= */

/**
 * Procesor przecięty na pół, powiększony 12×: styki LGA, wielowarstwowy laminat, mikrokulki lutu, krzemowy rdzeń,
 * lut indowy (pasta termiczna wewnątrz), osłona IHS z niklowanej miedzi, klej. Nad nim pasta i podstawa chłodzenia.
 * `lift` (0…1) – osłona i chłodzenie podnoszą się, odsłaniając rdzeń.
 */
export function CpuCutLab({ p, lift }: { p: V3; lift: () => number }) {
  const n = MAT();
  const up = useRef<THREE.Group>(null);
  const up2 = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = lift();
    if (up.current) up.current.position.y = k * 14;
    if (up2.current) up2.current.position.y = k * 26;
  });
  const W = 45;
  const D = 30;
  return (
    <LabStage p={p}>
      <group position={[0, -18, 0]}>
        {/* styki LGA na spodzie */}
        {Array.from({ length: 22 }, (_, i) => (
          <Box key={i} p={[-W / 2 + 1.5 + i * 2, -0.3, -D / 2]} s={[1, 0.6, D - 2]} m={n.gold} />
        ))}
        {/* laminat: warstwy miedzi i żywicy */}
        {Array.from({ length: 7 }, (_, i) => (
          <Slab key={i} x0={-W / 2} x1={W / 2} y0={i * 0.9} y1={(i + 1) * 0.9} d={D} m={i % 2 ? n.copper : n.greenBoard} cut={i % 2 ? n.cutCopper : n.cutBoard} />
        ))}
        {/* kondensatory na laminacie */}
        {[-19, -16, 16, 19].map((x) => (
          <Box key={x} p={[x, 6.8, -6]} s={[1.6, 0.8, 1]} m={n.chip} />
        ))}
        {/* mikrokulki lutu (C4) i wypełnienie */}
        {Array.from({ length: 14 }, (_, i) => (
          <mesh key={i} position={[-10.4 + i * 1.6, 6.75, -0.5]} material={n.solder}>
            <sphereGeometry args={[0.5, 10, 8]} />
          </mesh>
        ))}
        <Slab x0={-11.5} x1={11.5} y0={6.3} y1={7.2} d={D * 0.5} m={n.chipGrey} />
        {/* rdzeń krzemowy */}
        <Slab x0={-11} x1={11} y0={7.2} y1={9.6} d={D * 0.45} m={n.die} cut={n.cutSilicon} />
        <mesh position={[0, 7.45, 0.03]} material={n.dieShine}>
          <planeGeometry args={[22, 0.5]} />
        </mesh>
        <group ref={up}>
          {/* lut indowy i osłona IHS */}
          <Slab x0={-11} x1={11} y0={9.6} y1={10.2} d={D * 0.45} m={n.solder} cut={n.cutAlu} />
          <Slab x0={-18} x1={18} y0={10.2} y1={13.4} d={D * 0.85} m={n.nickel} cut={n.cutCopper} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <Slab x0={s > 0 ? 15 : -18} x1={s > 0 ? 18 : -15} y0={6.3} y1={10.2} d={D * 0.85} m={n.nickel} cut={n.cutCopper} />
              <Slab x0={s > 0 ? 15 : -18} x1={s > 0 ? 18 : -15} y0={5.9} y1={6.3} d={D * 0.85} m={n.chipGrey} cut={n.cutPlastic} />
            </group>
          ))}
        </group>
        <group ref={up2}>
          {/* pasta termiczna i podstawa chłodzenia */}
          <Slab x0={-17} x1={17} y0={13.4} y1={13.9} d={D * 0.8} m={n.plasticGrey} cut={n.cutPlastic} />
          <Slab x0={-24} x1={24} y0={13.9} y1={19} d={D} m={n.copper} cut={n.cutCopper} />
          {[-12, -4, 4, 12].map((x) => (
            <group key={x}>
              <Cyl p={[x, 18.4, -D / 2]} r={2.3} h={D} m={n.copper} axis="z" seg={18} />
              <mesh position={[x, 18.4, 0.03]} material={n.cutCopper}>
                <circleGeometry args={[2.3, 20]} />
              </mesh>
              <mesh position={[x, 18.4, 0.05]} material={n.slot}>
                <circleGeometry args={[1.7, 20]} />
              </mesh>
            </group>
          ))}
        </group>
        <Lbl pos={[-W / 2 - 8, -0.4, 0]} sub color={LC.gold}>
          styki (1700 pól)
        </Lbl>
        <Lbl pos={[W / 2 + 8, 3, 0]} sub color={LC.green}>
          laminat ze ścieżkami
        </Lbl>
        <Lbl pos={[14, 6.6, 1]} sub color={LC.part}>
          mikrokulki lutu
        </Lbl>
        <Lbl pos={[-14, 8.4, 1]} sub color={LC.violet}>
          rdzeń krzemowy
        </Lbl>
        <Lbl pos={[0, 9.9, 1]} sub color={LC.part}>
          lut indowy
        </Lbl>
        <Lbl pos={[W / 2 + 8, 12, 0]} sub color={LC.gold}>
          osłona IHS (miedź niklowana)
        </Lbl>
        <Lbl pos={[-W / 2 - 8, 14.2, 0]} sub color={LC.part}>
          pasta termoprzewodząca
        </Lbl>
        <Lbl pos={[W / 2 + 8, 18, 0]} sub color={LC.hot}>
          podstawa chłodzenia z rurkami cieplnymi
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= plan rdzenia ================= */

type Blk = { x: number; z: number; w: number; d: number; c: string; h?: number };
/** Bloki na krzemowym rdzeniu (cm w powiększeniu, środek rdzenia w 0,0). */
export const DIE_BLOCKS: { name: string; c: string; blocks: Blk[] }[] = [
  {
    name: 'rdzenie wydajne (P)',
    c: '#3b82f6',
    blocks: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: -46 + (i % 4) * 13, z: i < 4 ? -14 : 14, w: 11.5, d: 12, c: '#3b82f6' })),
  },
  {
    name: 'rdzenie oszczędne (E)',
    c: '#22c55e',
    blocks: Array.from({ length: 12 }, (_, i) => ({ x: 9 + (i % 4) * 5.6, z: -15 + Math.floor(i / 4) * 15, w: 5, d: 12, c: '#22c55e' })),
  },
  {
    name: 'pamięć podręczna L3',
    c: '#a855f7',
    blocks: Array.from({ length: 12 }, (_, i) => ({ x: -46 + (i % 6) * 10.4, z: i < 6 ? -3.2 : 3.2, w: 9.6, d: 5, c: '#a855f7', h: 1.2 })),
  },
  { name: 'układ graficzny', c: '#ef4444', blocks: [{ x: 40, z: 0, w: 12, d: 36, c: '#ef4444' }] },
  { name: 'kontroler pamięci', c: '#f59e0b', blocks: [{ x: -57, z: 0, w: 5, d: 36, c: '#f59e0b' }] },
  { name: 'wejścia i wyjścia (PCIe)', c: '#94a3b8', blocks: [{ x: 0, z: -24.5, w: 110, d: 3.5, c: '#94a3b8', h: 0.8 }] },
];

/**
 * Rdzeń procesora z góry, powiększony ok. 50×: rdzenie wydajne i oszczędne, pamięć podręczna, układ graficzny,
 * kontroler pamięci. Bloki migają, gdy „pracują”.
 */
export function DieLab({ p }: { p: V3 }) {
  const n = MAT();
  const mats = useMemo(() => DIE_BLOCKS.map((g) => new THREE.MeshStandardMaterial({ color: g.c, emissive: g.c, emissiveIntensity: 0.2, roughness: 0.4, metalness: 0.3 })), []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const flat = useMemo(() => DIE_BLOCKS.flatMap((g, gi) => g.blocks.map((b) => ({ ...b, gi }))), []);
  const ph = useMemo(() => {
    const r = rng(3);
    return flat.map(() => r() * 10);
  }, [flat]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const a = 0.5 + 0.5 * Math.sin(t * (1.5 + (i % 5) * 0.7) + ph[i]);
      m.scale.y = 0.6 + a * 0.8;
    });
  });
  return (
    <LabStage p={p}>
      <group position={[0, -30, 0]} rotation={[0.5, 0, 0]}>
        <Box p={[0, -1, 0]} s={[124, 2, 56]} m={n.die} />
        <Box p={[0, 0.02, 0]} s={[120, 0.05, 52]} m={n.dieShine} />
        {/* szyna pierścieniowa łącząca bloki */}
        <Box p={[-8, 0.3, 0]} s={[100, 0.4, 1]} m={n.gold} />
        {flat.map((b, i) => (
          <mesh key={i} ref={(m) => (refs.current[i] = m)} position={[b.x, 0, b.z]} material={mats[b.gi]}>
            <boxGeometry args={[b.w, b.h ?? 1.6, b.d]} />
          </mesh>
        ))}
        <Lbl pos={[-33, 6, -26]} sub color="#93c5fd">
          8 rdzeni wydajnych
        </Lbl>
        <Lbl pos={[16, 6, 26]} sub color={LC.green}>
          12 rdzeni oszczędnych
        </Lbl>
        <Lbl pos={[-20, 6, 0]} sub color={LC.violet}>
          pamięć podręczna L3 (33 MB)
        </Lbl>
        <Lbl pos={[40, 6, 0]} sub color={LC.hot}>
          układ graficzny
        </Lbl>
        <Lbl pos={[-57, 6, 20]} sub color={LC.gold}>
          kontroler pamięci RAM
        </Lbl>
        <Lbl pos={[0, 4, -30]} sub color={LC.part}>
          złącza PCIe i wejścia/wyjścia
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= tranzystor FinFET ================= */

/**
 * Tranzystor FinFET powiększony ok. 2 mln razy: krzemowe żeberko, bramka owinięta wokół niego, źródło i dren.
 * `gate()` (0…1) – napięcie na bramce: elektrony płyną ze źródła do drenu tylko, gdy bramka jest włączona.
 */
export function FinLab({ p, gate }: { p: V3; gate: () => number }) {
  const n = MAT();
  const e = useRef<THREE.InstancedMesh>(null);
  const N = 60;
  const st = useMemo(() => {
    const r = rng(8);
    return Array.from({ length: N }, () => ({ u: r(), y: r(), z: r() }));
  }, []);
  const gateMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c0a14a', metalness: 0.6, roughness: 0.3, emissive: '#ffcc33', emissiveIntensity: 0, transparent: true, opacity: 0.45, depthWrite: false }), []);
  // żeberko i tlenek półprzezroczyste – widać elektrony płynące w kanale
  const finMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a93a8', roughness: 0.4, transparent: true, opacity: 0.4, depthWrite: false }), []);
  const oxMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.4, transparent: true, opacity: 0.3, depthWrite: false }), []);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const g = gate();
    gateMat.emissiveIntensity = g * 0.6;
    if (!e.current) return;
    st.forEach((s, i) => {
      // przy wyłączonej bramce elektrony drgają w źródle; przy włączonej – płyną kanałem do drenu
      if (g > 0.05) s.u = (s.u + dt * 0.25 * g) % 1;
      else s.u = Math.min(s.u, 0.22) + Math.sin(i + performance.now() / 300) * 0.0005;
      const x = mix(-34, 34, s.u);
      o.position.set(x, 9 + s.y * 10, -3 + (s.z - 0.5) * 4.5);
      o.scale.setScalar(1);
      o.updateMatrix();
      e.current!.setMatrixAt(i, o.matrix);
    });
    e.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <LabStage p={p}>
      <group position={[0, -30, 0]}>
        {/* podłoże krzemowe i izolacja */}
        <Box p={[0, 3, -3]} s={[90, 6, 40]} m={n.silicon} />
        <Box p={[0, 6.5, -3]} s={[90, 1, 40]} m={n.white} />
        {/* żeberko (kanał) */}
        <Box p={[0, 14, -3]} s={[48, 16, 6]} m={finMat} />
        {/* źródło i dren */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <Box p={[s * 33, 15, -3]} s={[18, 18, 12]} m={n.orange} />
            <Box p={[s * 33, 30, -3]} s={[8, 12, 8]} m={n.copper} />
          </group>
        ))}
        {/* bramka owinięta wokół żeberka, cienka warstwa tlenku */}
        <Box p={[0, 15, -3]} s={[14, 19, 8]} m={oxMat} />
        <mesh position={[0, 17, -3]} material={gateMat}>
          <boxGeometry args={[12, 26, 26]} />
        </mesh>
        <Box p={[0, 36, -3]} s={[8, 10, 8]} m={n.copper} />
        <instancedMesh ref={e} args={[undefined, undefined, N]} material={n.glowBlue}>
          <sphereGeometry args={[1.1, 10, 8]} />
        </instancedMesh>
        <Lbl pos={[-33, 40, -3]} sub color="#fdba74">
          źródło
        </Lbl>
        <Lbl pos={[33, 40, -3]} sub color="#fdba74">
          dren
        </Lbl>
        <Lbl pos={[0, 46, -3]} sub color={LC.gold}>
          bramka
        </Lbl>
        <Lbl pos={[-20, 3, 18]} sub color={LC.part}>
          krzemowe żeberko (kanał)
        </Lbl>
        <Lbl pos={[22, 4, 18]} sub color={LC.cold}>
          elektrony
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= potok rozkazów ================= */

export const STAGES = ['pobierz', 'odczytaj', 'wykonaj', 'pamięć', 'zapisz'];
const INSTR_C = ['#60a5fa', '#f472b6', '#facc15', '#4ade80', '#fb923c', '#a78bfa'];

/**
 * Potok: pięć stanowisk w rzędzie. Co takt zegara każdy rozkaz przesuwa się o jedno stanowisko, więc naraz
 * obrabianych jest pięć rozkazów. `tick()` – takty od startu (z częścią ułamkową do płynnego ruchu).
 */
export function PipeLab({ p, tick }: { p: V3; tick: () => number }) {
  const n = MAT();
  const mats = useMemo(() => INSTR_C.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.4 })), []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const clk = useRef<THREE.Mesh>(null);
  const M = 8;
  useFrame(() => {
    const t = tick();
    const base = Math.floor(t);
    const f = t - base;
    const ease = f < 0.35 ? (f / 0.35) * (f / 0.35) * (3 - (2 * f) / 0.35) : 1;
    refs.current.forEach((g, i) => {
      if (!g) return;
      // rozkaz nr k wchodzi do potoku w takcie k; i – slot w buforze kołowym
      const k = base - ((base - i) % M + M) % M;
      const stage = base - k - 1 + Math.min(1, ease);
      g.visible = stage > -1 && stage < STAGES.length;
      g.position.x = -48 + stage * 24;
      (g.children[0] as THREE.Mesh).material = mats[((k % INSTR_C.length) + INSTR_C.length) % INSTR_C.length];
    });
    if (clk.current) (clk.current.material as THREE.MeshBasicMaterial).color.set(f < 0.2 ? '#facc15' : '#3b3f46');
  });
  return (
    <LabStage p={p}>
      <group position={[0, -40, 0]}>
        {STAGES.map((s, i) => (
          <group key={s} position={[-48 + i * 24, 0, 0]}>
            <Box p={[0, 6, 0]} s={[20, 12, 20]} m={n.steelDark} />
            <Box p={[0, 12.1, 0]} s={[16, 0.2, 16]} m={n.aluDark} />
            <Lbl pos={[0, -4, 12]} sub color={LC.part}>
              {`${i + 1}. ${s}`}
            </Lbl>
          </group>
        ))}
        <Box p={[0, 13, -11]} s={[120, 2, 1]} m={n.gold} />
        {Array.from({ length: M }, (_, i) => (
          <group key={i} ref={(g) => (refs.current[i] = g)} position={[-48, 18, 0]}>
            <mesh material={mats[0]}>
              <boxGeometry args={[12, 8, 12]} />
            </mesh>
          </group>
        ))}
        <mesh ref={clk} position={[-66, 26, 0]}>
          <sphereGeometry args={[3, 16, 12]} />
          <meshBasicMaterial color="#facc15" toneMapped={false} />
        </mesh>
        <Lbl pos={[-66, 33, 0]} sub color={LC.gold}>
          zegar: takt
        </Lbl>
        <Lbl pos={[0, 34, 0]} sub color={LC.cold}>
          rozkazy płyną jak na taśmie
        </Lbl>
      </group>
    </LabStage>
  );
}

/* ================= chłodzenie w przekroju ================= */

/**
 * Chłodzenie wieżowe przecięte na pół, powiększone 3×: rdzeń procesora oddaje ciepło przez osłonę i pastę do
 * miedzianej podstawy; w rurkach ciecz paruje, para unosi ciepło do żeber, skrapla się i wraca knotem.
 * Wentylator przepycha powietrze między żebrami. `fan()` – obroty wentylatora (0…1).
 */
export function CoolLab({ p, fan }: { p: V3; fan: () => number }) {
  const n = MAT();
  const S = 4.6;
  const heat: V3[][] = [-1.8, -0.6, 0.6, 1.8].map((x, i) => [
    [0, 0.2, 0],
    [x * 0.5, 0.75, 0],
    [x > 0 ? 1.2 : -1.2, 0.75, 0],
    [x > 0 ? 1.7 + (i % 2) * 0.5 : -1.7 - (i % 2) * 0.5, 2.4, 0],
    [x > 0 ? 1.7 + (i % 2) * 0.5 : -1.7 - (i % 2) * 0.5, 15, 0],
  ]);
  const sc = (pts: V3[]): V3[] => pts.map(([x, y, z]) => [x * S, y * S, z * S]);
  const air: V3[][] = [4, 7, 10, 13].map((y) => [
    [12, y, 0.6],
    [4.5, y, 0.6],
    [0, y + 0.2, 0.6],
    [-4.5, y + 0.4, 0.6],
    [-10, y + 0.6, 0.6],
  ]);
  return (
    <LabStage p={p}>
      <group position={[-6, -62, 0]}>
        <group scale={S}>
          {/* kawałek płyty, procesor */}
          <Slab x0={-6} x1={6} y0={-0.6} y1={-0.4} d={6} m={n.board} cut={n.cutBoard} />
          <Slab x0={-2.2} x1={2.2} y0={-0.4} y1={-0.28} d={4.5} m={n.greenBoard} cut={n.cutBoard} />
          <Slab x0={-1.1} x1={1.1} y0={-0.28} y1={-0.18} d={2} m={n.die} cut={n.cutSilicon} />
          <Slab x0={-1.6} x1={1.6} y0={-0.18} y1={0} d={3.6} m={n.nickel} cut={n.cutCopper} />
          {/* podstawa i rurki (przecięte) */}
          <Slab x0={-2} x1={2} y0={0} y1={0.6} d={4} m={n.copper} cut={n.cutCopper} />
          {[-1.8, -0.6, 0.6, 1.8].map((x, i) => {
            const xs = x > 0 ? 1.7 + (i % 2) * 0.5 : -1.7 - (i % 2) * 0.5;
            return (
              <group key={x}>
                <Cyl p={[xs, 8.7, 0]} r={0.3} h={12.6} m={n.copper} theta={[Math.PI, Math.PI]} />
                <mesh position={[xs, 8.7, 0.01]} material={n.cutCopper}>
                  <planeGeometry args={[0.6, 12.6]} />
                </mesh>
                <mesh position={[xs, 8.7, 0.02]} material={n.slot}>
                  <planeGeometry args={[0.36, 12.6]} />
                </mesh>
              </group>
            );
          })}
          {/* żebra (przecięte) */}
          {Array.from({ length: 24 }, (_, i) => 3.4 + i * 0.5).map((y) => (
            <Slab key={y} x0={-2.6} x1={2.6} y0={y} y1={y + 0.06} d={6.2} m={n.alu} cut={n.cutAlu} />
          ))}
          <Fan p={[4.2, 9, -3]} d={12} axis="x" spin={() => fan() * 3} />
        </group>
        {heat.map((h, i) => (
          <EnergyFlow key={i} path={sc(h)} count={22} speed={16} size={0.8} color="#ff7a45" rate={() => 0.4 + fan() * 0.6} />
        ))}
        {air.map((a, i) => (
          <EnergyFlow key={`a${i}`} path={sc(a)} count={16} speed={30} size={0.6} color={i % 2 ? '#7dd3fc' : '#a5f3fc'} rate={fan} />
        ))}
        <Lbl pos={[0, -2.2 * S, 3]} sub color={LC.violet}>
          rdzeń procesora
        </Lbl>
        <Lbl pos={[-4 * S, 0.6 * S, 3]} sub color={LC.gold}>
          miedziana podstawa
        </Lbl>
        <Lbl pos={[-4.4 * S, 6 * S, 3]} sub color={LC.hot}>
          rurka cieplna: para unosi ciepło
        </Lbl>
        <Lbl pos={[0, 16.2 * S, 3]} sub color={LC.part}>
          aluminiowe żebra
        </Lbl>
        <Lbl pos={[6.2 * S, 15.5 * S, -3 * S]} sub color={LC.cold}>
          wentylator
        </Lbl>
      </group>
    </LabStage>
  );
}

