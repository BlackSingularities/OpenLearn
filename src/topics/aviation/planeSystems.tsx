/*
 * Podzespoły wbudowane we wnętrze A350: kokpit w nosie, radar pogodowy pod owiewką i APU w stożku ogonowym.
 *
 * To te same modele co w ich modułach (cockpitLab, radarLab, apuLab) – samolot nie ma ich uproszczonych kopii.
 * Każdy ma poziomy szczegółów (LOD) zależne od kamery: z daleka same główne bryły, z bliska wszystkie części
 * (ekrany kokpitu malowane na żywo, wirniki APU, napędy anteny). Rysowane są tylko tam, gdzie je widać:
 * – kokpit zawsze (widać go przez szyby),
 * – radar w swoim module (owiewka otwarta) i w przekroju kadłuba,
 * – APU w swoim module (zdjęta pokrywa) i w przekroju kadłuba.
 * Moduł podzespołu podaje swoją symulację (`drive`); bez niej podzespół stoi w spoczynku.
 *
 * Ładowany leniwie przez airliner.tsx (moduły podzespołów same importują model samolotu).
 */
import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { ClipCull, useCameraLod, type FusView, type PlanePart } from './airliner';
import { ApuModel, newApuSim, type ApuMode, type ApuSim } from './apuLab';
import { RadarModel, newRadarSim, type RadarMode, type RadarSim } from './radarLab';
import { CockpitModel, idleCockpitSim, type CockpitSim } from './cockpitLab';

/** Symulacje podzespołów z ich modułów (strona modułu przekazuje je samolotowi). */
export type SystemsDrive = {
  apu?: { sim: MutableRefObject<ApuSim>; mode: ApuMode };
  radar?: { sim: MutableRefObject<RadarSim>; mode: RadarMode };
  cockpit?: { sim: MutableRefObject<CockpitSim> };
};

type Props = { focus: PlanePart | null; fusView: FusView | null; inFlight: boolean; drive?: SystemsDrive };

/** Punkty odniesienia LOD (układ samolotu): środek kokpitu, płyta anteny, APU. */
const AT_COCKPIT: [number, number, number] = [-33.2, 0.5, 0];
const AT_RADAR: [number, number, number] = [-36.0, -1.25, 0];
const AT_APU: [number, number, number] = [33.8, 1.08, 0];

export default function PlaneSystems({ focus, fusView, inFlight, drive }: Props) {
  // przekrój kadłuba z wyposażeniem (bez zakładki „konstrukcja” – tam sam szkielet)
  const section = fusView !== null && fusView !== 'struct';
  return (
    <>
      <CockpitUnit drive={drive?.cockpit} inFlight={inFlight} />
      {(drive?.radar || section) && <RadarUnit drive={drive?.radar} section={!drive?.radar} />}
      {(drive?.apu || section) && <ApuUnit drive={drive?.apu} section={!drive?.apu} forced={focus === 'apu'} />}
    </>
  );
}

/** Kotwica LOD: pusty obiekt w punkcie podzespołu, od którego liczy się odległość kamery. */
function useLodAt(at: [number, number, number], near: number, far: number) {
  const ref = useRef<THREE.Group>(null);
  const on = useCameraLod(ref, near, far, 1500);
  const anchor = <group ref={ref} position={at} />;
  return [on, anchor] as const;
}

function CockpitUnit({ drive, inFlight }: { drive?: SystemsDrive['cockpit']; inFlight: boolean }) {
  const idle = useMemo(() => ({ current: idleCockpitSim(inFlight) }), [inFlight]);
  const [near, anchor] = useLodAt(AT_COCKPIT, 16, 24);
  // w module kokpitu zawsze pełny (kamera jest w środku), poza nim – według odległości
  return (
    <>
      {anchor}
      {/* przekrój kadłuba: bryły w zdjętej połowie samolotu znikają (prawy fotel, prawy pulpit) */}
      <ClipCull>
        <CockpitModel sim={drive?.sim ?? idle} detail={Boolean(drive) || near} outside={Boolean(drive)} />
      </ClipCull>
    </>
  );
}

function RadarUnit({ drive, section }: { drive?: SystemsDrive['radar']; section: boolean }) {
  const idle = useRef(newRadarSim());
  const [near, anchor] = useLodAt(AT_RADAR, 14, 22);
  return (
    <>
      {anchor}
      <RadarModel sim={drive?.sim ?? idle} mode={drive?.mode ?? 'home'} section={section} detail={!section || near} />
    </>
  );
}

function ApuUnit({ drive, section, forced }: { drive?: SystemsDrive['apu']; section: boolean; forced: boolean }) {
  const idle = useRef(newApuSim());
  const [near, anchor] = useLodAt(AT_APU, 14, 22);
  return (
    <>
      {anchor}
      <ApuModel sim={drive?.sim ?? idle} mode={drive?.mode ?? 'home'} section={section} detail={forced || near} />
    </>
  );
}
