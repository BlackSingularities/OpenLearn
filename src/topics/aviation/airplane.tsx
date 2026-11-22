import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { DockExtra, Ecam } from '../../components/cockpit';
import type { PartModule, SceneProps, Step, Topic } from '../../lib/types';
import { Lights } from '../../lib/three';
import { useModuleHome, useTopicNav } from '../../lib/topicNav';
import { Airliner, CONTROL_PTS, TAIL_GROUPS, TAIL_PART_INFO, tailColorOf, ENG_K, EngineOnPlane, WING_GROUPS, WING_PART_INFO, W_TIP, engineOrigin, macX, wingGroupOf, wingPoint, GEAR_GROUPS, GEAR_PART_INFO, gearGroupColor, type PlanePart, type PlanePhase } from './airliner';
import { InfoPortal } from '../../lib/plot';
import { AutoRotate, useEngineOverview } from './jetEngine';
import { jetEngine } from './jetEngine';
import { FollowPlane, WingLab, isSliceMode, labPose, makeWingLabSteps, newDirectPose, newPose, usePoseDriver, type LabMode } from './wingLab';
import { ENGINE_PART_OFFSET, ax } from './engineModel';
import { C_PITCH, C_ROLL, C_YAW, LATERAL_EXP_OPTIONS, LAYOUT_OPTIONS, lateralView, TailHomeCockpit, TailLab, YAW_MODE_OPTIONS, ctlScene, lateralLook, type CtlMode } from './tailLab';
import { GEAR_SPOTS, GearLab, makeGearSteps, useGearDriver, type GearMode } from './gearLab';
import { APU_SPOTS, ApuLab, makeApuSteps, useApuDriver, type ApuMode } from './apuLab';
import { RADAR_SPOTS, RadarLab, makeRadarSteps, useRadarDriver, type RadarMode } from './radarLab';
import { LIGHTS_SPOTS, LightsLab, LightsModel, LightsPanel, makeLightsSteps, useLightsDriver, type LightsMode } from './lightsLab';
import { NightCtx } from './runway';
import { FuselageLab, useFusDriver } from './fuselageLab';
import { AirSystem } from './airSystem';
import { FireSystem, WaterSystem, useStage } from './cabinSystems';
import { RefuelLab, RefuelScene, useRefuelDriver } from './refuel';
import { DoorsLab, DoorsScene, useDoorsDriver, type DoorMode } from './doors';
import { ElecLab, ElecScene, useElecDriver, type ElecMode } from './electrics';
import { CockpitLab, cockpitOnGround, makeCockpitModule, useCockpitDriver, type CkMode } from './cockpitLab';
import { cycleModule } from './cycleLab';
import { REC_SPOTS, RecLab, RecScene, recFlight, useRecDriver, type RecMode } from './recorders';
import { FUS_DY, FUS_GROUPS, FUS_LIVE, FUS_PART_INFO, cargoDoorOpen, type FusView } from './airliner';

/* ======================= sceny ======================= */

/** Oś lewego silnika w samolocie – do ustawienia kamery w kroku silnika. */
const EO = engineOrigin();
/**
 * Sceny silnika (w jego jednostkach) umieszczone dokładnie w miejscu lewego silnika na samolocie – kamera
 * przelatuje płynnie z widoku całego samolotu do kolejnych zakładek silnika i z powrotem.
 */
const ENGINE_FRAME = { position: EO, scale: ENG_K };
const atEngine = (s: Step): Step => (s.kind === '3d' ? { ...s, frame: ENGINE_FRAME } : s);
/**
 * Punkty numerów zakładek silnika na modelu (w jednostkach modelu silnika: oś x – ax(…), promień gondoli ok. 1,45).
 * Każdy numer siedzi przy części, o której jest zakładka.
 */
const ENGINE_SPOTS: [number, number, number][] = [
  [ax(240), 1.95, 0.4], // turbowentylator w 3D – cała gondola
  [ax(900), 0.75, 0.7], // ciąg – wylot
  [ax(120), 1.15, 0.85], // droga powietrza – wlot
  [ax(450), 0.85, 0.85], // ciśnienie, temperatura, prędkość
  [ax(390), 0.5, 0.95], // sprężarka
  [ax(515), 0.55, 0.95], // komora spalania
  [ax(610), 0.45, 0.95], // turbina i wały
  [ax(320), 1.35, 0.6], // bypass
  [ax(660), 1.55, 0.45], // rewers
  [ax(800), 0.35, 0.85], // dopalacz
  [ax(300), -1.35, 0.8], // rozruch – skrzynka napędów pod spodem
  [ax(440), -1.3, 0.95], // osprzęt – zbiornik oleju, EEC, wymiennik
  [ax(200), -0.95, 1.15], // awarie
];
/** Punkt świata → układ sceny silnika (ENGINE_FRAME). */
const toEngineFrame = (p: [number, number, number]): [number, number, number] => [(p[0] - EO[0]) / ENG_K, (p[1] - EO[1]) / ENG_K, (p[2] - EO[2]) / ENG_K];
/** Numery zakładek skrzydła: każdy przy tej części skrzydła, której dotyczy zakładka (współrzędne samolotu). */
const WING_SPOTS: [number, number, number][] = [
  wingPoint(14.5, 0.02, 0.7), // budowa profilu – krawędź natarcia
  wingPoint(20, 0.3, 1.0), // opływ
  wingPoint(10, 0.12, 0.8), // rozkład ciśnienia
  wingPoint(23.5, 0.5, 0.9), // wzór na siłę nośną
  wingPoint(26, 0.85, 0.8), // przeciągnięcie
  wingPoint(15.5, 0.95, 0.7), // klapy i sloty
  wingPoint(18, 0.68, 0.7), // spojlery – płyty przed klapami
  wingPoint(W_TIP + 1.2, 0.6, 1.6), // wiry brzegowe – winglet
  wingPoint(27.5, 0.92, 0.7), // zakręt – lotki
];
/** Część silnika, przy której stoi numer – w widoku rozłożonym numer jedzie razem z nią. */
const ENGINE_SPOT_PART: (string | null)[] = ['bypass', 'nozzle', 'wlot', 'hpc', 'hpc', 'comb', 'hpt', 'bypass', 'bypass', 'ab', null, 'fan'];
const withSpot = (s: Step, i: number): Step => {
  if (!ENGINE_SPOTS[i]) return s;
  const part = ENGINE_SPOT_PART[i];
  return { ...s, spot: ENGINE_SPOTS[i], ...(part ? { spotFollow: () => ENGINE_PART_OFFSET[part] } : {}), ...(s.title === 'Dopalacz' ? { spotLabel: '★' } : {}) };
};

/** Cały samolot – wspólna scena przeglądu i pierwszych zakładek podzespołów (kamera przelatuje między ujęciami). */
function PlaneScene({ params }: SceneProps) {
  const part = (v: unknown) => (typeof v === 'string' && v ? (v as PlanePart) : null);
  const focus = part(params.focus);
  // silnik w centrum uwagi działa tak samo jak w scenie samego silnika (model w skali: wentylator 3,0 m = 1)
  const eng = useEngineOverview(params, 3.0);
  const engineOn = focus === 'engine';
  // zakładki aerodynamiki skrzydła: ten sam samolot płynnie wycina się do plastra skrzydła albo leci w całości
  const lab = typeof params.lab === 'string' && params.lab ? (params.lab as LabMode) : null;
  // przełącznik 2D / 3D w zakładkach z wycinkiem: 3D = kawałek skrzydła wokół silnika
  params = { ...params, wide: params.dim === '3d' };
  const tgt = labPose(lab, params);
  const pose = useMemo(newPose, []);
  // zakładki usterzenia i sterowania: symulacja w nakładce ustawia pozę i stery wprost
  const ctl = typeof params.ctl === 'string' && params.ctl ? (params.ctl as CtlMode) : null;
  const cs = ctl ? ctlScene(ctl, params) : null;
  const direct = useMemo(newDirectPose, []);
  // zakładki sterowania i lądowania (amortyzator, hamulce) same ustawiają pozę samolotu
  // spojlery „po przyziemieniu” odtwarzają wspólną animację lądowania (tryb podwozia „landing”)
  const gearMode0: GearMode | null =
    typeof params.gear === 'string' && params.gear ? (params.gear as GearMode) : params.lab === 'spoiler' && params.use === 'ground' ? 'landing' : null;
  const landTab = gearMode0 === 'shock' || gearMode0 === 'brakes' || gearMode0 === 'landing';
  // zawracanie na pasie (sterowanie na ziemi) też obraca samolot wprost – wokół środka zakrętu
  // moduł radaru: zakładki z lotem (podejście z mikroburstem, omijanie burzy) też ustawiają pozę samolotu wprost
  const radarMode: RadarMode | null = typeof params.radar === 'string' && params.radar ? (params.radar as RadarMode) : null;
  // moduł świateł: zakładki z lotem, podejściem i kołowaniem ustawiają pozę wprost (strona główna i logo – postój)
  const lightsMode: LightsMode | null = typeof params.lights === 'string' && params.lights ? (params.lights as LightsMode) : null;
  direct.active = Boolean(ctl) || landTab || gearMode0 === 'steer' || Boolean(radarMode && radarMode !== 'home') || Boolean(lightsMode && lightsMode !== 'home' && lightsMode !== 'logo');
  // oś obrotu ustawiana od razu tylko przy zawracaniu (gdzie indziej dojeżdża płynnie)
  direct.snap = gearMode0 === 'steer';
  usePoseDriver(pose, tgt, direct);
  // strona główna skrzydła: podpisy i elementy skrzydła są klikalne, jak w zbliżeniu konstrukcji
  const wingHome = focus === 'wing' && !lab;
  // stan samolotu: aerodynamika i pracujący silnik – w locie; przegląd na ziemi
  // zakładki podwozia: chowanie w locie, pozostałe na ziemi; podwozie sterowane wspólnym stanem
  const gearMode = gearMode0;
  const gearDrv = useGearDriver(gearMode, params, direct);
  // moduł APU: wspólna symulacja dla wszystkich zakładek (strona główna – APU pracuje)
  const apuMode: ApuMode | null = typeof params.apu === 'string' && params.apu ? (params.apu as ApuMode) : null;
  const apuSim = useApuDriver(apuMode, params);
  // moduł kadłuba: zakładka (przekrój, konstrukcja, ciśnienie, ładownie) i jej symulacja
  const fusView: FusView | null = focus === 'fuselage' ? ((typeof params.fus === 'string' && params.fus ? params.fus : 'home') as FusView) : null;
  const fusSim = useFusDriver(fusView, params);
  // moduł silnika, strona „Paliwo”: tankowanie na stanowisku i droga paliwa do silnika
  const refuel = Boolean(params.refuel);
  const refuelSim = useRefuelDriver(refuel, params);
  // od etapu „Pompy w zbiorniku” lewy silnik w przekroju z własnym układem paliwowym (ten sam co w module silnika)
  const refuelStage = useStage(refuelSim.getStage);
  // moduł drzwi: tryb zakładki (strona główna, otwieranie, uzbrajanie, zjeżdżalnia, ewakuacja, ciśnienie)
  const doorsMode: DoorMode | null = typeof params.doors === 'string' && params.doors ? (params.doors as DoorMode) : null;
  const doorsSim = useDoorsDriver(doorsMode, params);
  const [dsel, setDsel] = useState<string | null>(null);
  // moduł elektryki: tryb zakładki (strona główna, GPU, APU, silniki, rozdział, RAT)
  const elecMode: ElecMode | null = typeof params.elec === 'string' && params.elec ? (params.elec as ElecMode) : null;
  const elecSim = useElecDriver(elecMode, params);
  const [esel, setEsel] = useState<string | null>(null);
  // moduł czarnych skrzynek: tryb zakładki (strona główna, dane, rozmowy, budowa, próby, poszukiwania)
  const recMode: RecMode | null = typeof params.rec === 'string' && params.rec ? (params.rec as RecMode) : null;
  const recSim = useRecDriver(recMode, params);
  const [rsel, setRsel] = useState<string | null>(null);
  const refuelEngine = refuel && refuelStage >= 5;
  // przekrój pokazuje samolot w locie: podwozie schowane we wnękach, bez płyty lotniska
  const fusFlight = fusView !== null && fusView !== 'cargo';
  // moduł radaru: przemiatanie anteny, lot i pogoda – wspólne dla modelu w nosie, miniatury burzy i ekranów
  const radarSim = useRadarDriver(radarMode, params, direct);
  const radarFlight = Boolean(radarMode && radarMode !== 'home');
  // moduł kokpitu: kokpit jest częścią samolotu (kamera w nosie); scenariusz zakładki i niebo za oknami
  const ckMode: CkMode | null = typeof params.ck === 'string' && params.ck ? (params.ck as CkMode) : null;
  const ckSim = useCockpitDriver(ckMode, params);
  const ckGround = ckMode ? cockpitOnGround(ckMode, typeof params.scn === 'string' ? params.scn : '') : false;
  /*
   * Złota zasada: samolot da się kliknąć (przejście do innego modułu), widać podpisy-odnośniki do innych modułów
   * i pełne, klikalne podpisy części modułu tylko w widoku ogólnym i na stronie głównej modułu (zakładka „0”).
   * W pozostałych zakładkach samolot tylko pokazuje to, o czym jest zakładka.
   */
  // zakładka „0” modułu albo widok całości – wspólne ustawienie z nawigacji tematu (useModuleHome)
  const moduleHome = useModuleHome();
  // moduł świateł: noc, stan przełączników i własne podwozie (chowanie w czasie „lotu w minutę”)
  const lightsSim = useLightsDriver(lightsMode, params, direct, gearDrv.live);
  const ls = lightsSim.current;
  const phase: PlanePhase = recMode ? (recFlight(recMode) ? 'flight' : 'ground') : ckMode ? (ckGround ? 'ground' : 'flight') : elecMode ? (elecMode === 'dist' || elecMode === 'rat' ? 'flight' : 'ground') : doorsMode ? (doorsMode === 'press' ? 'flight' : 'ground') : refuel ? 'ground' : fusFlight ? 'flight' : lightsMode ? (ls.ground ? 'ground' : 'flight') : cs ? (cs.flight ? 'flight' : 'ground') : radarFlight ? 'flight' : gearMode === 'retract' ? 'flight' : gearMode ? 'ground' : lab === 'spoiler' && params.use === 'ground' ? 'ground' : lab || engineOn ? 'flight' : 'ground';
  // strona główna usterzenia: lotki skrzydeł też biorą udział w sterowaniu – wyróżnione kolorem osi przechylania
  const tailHome = focus === 'tail' && !ctl;
  const hilite = cs ? cs.hilite : tailHome ? { aileron: C_ROLL, spoiler: C_ROLL } : null;
  // strona główna usterzenia: wszystkie elementy (także lotki i spojlery) można kliknąć
  const [tsel, setTsel] = useState<string | null>(null);
  const [wsel, setWsel] = useState<string | null>(null);
  // strona główna podwozia: podpisy części są klikalne
  const gearHome = focus === 'gear' && !params.gear;
  const [gsel, setGsel] = useState<string | null>(null);
  // strona główna kadłuba: klikane podpisy części
  const fusHome = fusView === 'home' && moduleHome;
  const [fsel, setFsel] = useState<string | null>(null);
  return (
    // moduł świateł: noc – pas i lotnisko zapalają swoje światła (te same modele co w dzień)
    <NightCtx.Provider value={Boolean(lightsMode)}>
      {lightsMode ? (
        // noc: słaba poświata nieba i księżyc – samolot oświetlają głównie jego własne światła
        <>
          <ambientLight intensity={0.12} color="#8ea6d8" />
          <hemisphereLight args={['#33405e', '#050608', 0.35]} />
          <directionalLight position={[-40, 60, 30]} intensity={0.18} color="#aebfff" />
        </>
      ) : (
        <>
          <Lights />
          <directionalLight position={[-30, 40, 30]} intensity={0.9} />
        </>
      )}
      <AutoRotate on={engineOn && eng.rotate} />
      {/* strona główna usterzenia: ECAM F/CTL pokazuje te same wychylenia, które wykonuje animacja */}
      {tailHome && Boolean(params.animate ?? true) && <TailHomeCockpit />}
      <FollowPlane pose={pose}>
        <Airliner
          // wznios i statecznik: ten sam samolot ze zmienionym wzniosem, położeniem skrzydeł i wielkością statecznika
          morph={cs?.mini ? lateralLook(params) : null}
          focus={cs ? cs.focus : focus}
          hilite={hilite}
          wingOpen={cs?.wingOpen}
          highlight={part(params.highlight)}
          throttle={Number(params.throttle ?? 60) / 100}
          flow={Boolean(params.flow ?? true)}
          animate={Boolean(params.animate ?? true)}
          engine={engineOn ? eng.engineProps : undefined}
          // moduł kadłuba: cały samolot przecięty płaszczyzną symetrii – prawa połowa zdjęta, widać przekrój i zawartość
          clip={focus === 'fuselage' && !lab && !cs ? (fusView === 'cargo' ? FUS_HALF_R : fusView === 'decomp' ? null : FUS_HALF) : tgt.clip}
          fusView={fusView ?? undefined}
          engineCut={fusView === 'press' || refuelEngine}
          engineFeed={refuelEngine}
          doorsOpen={Boolean(doorsMode)}
          fusPick={fusHome ? { selected: fsel, onSelect: setFsel } : undefined}
          // dobieg po lądowaniu: klapy i sloty w konfiguracji do lądowania
          mech={landTab ? { flap: 32, fowler: 1, slat: 1 } : tgt.mech}
          interactive={moduleHome && !doorsMode && !elecMode && !recMode}
          // odnośniki do innych modułów tylko na stronie głównej modułu – w zakładkach podwozia (i innych) ich nie ma
          links={moduleHome && !doorsMode && !elecMode && !recMode}
          partLabels={moduleHome && !doorsMode && !elecMode && !recMode}
          moduleLabels={moduleHome && !doorsMode && !elecMode && !recMode}
          // na wycinkach skrzydła bez owiewek prowadnic klap – czysty przekrój profilu
          wingPick={wingHome ? { selected: wsel, onSelect: setWsel } : tailHome ? { selected: tsel, onSelect: setTsel } : undefined}
          // zakładki aerodynamiki to lot: podwozie schowane, silniki pracują
          inFlight={phase === 'flight'}
          surfaces={landTab ? gearDrv.surf : lab || ctl ? pose.surf : undefined}
          // na wycinkach skrzydła: bez owiewek klap i usterzenia (statecznik poziomy wpadałby w zakres wycinka)
          // moduł kokpitu: za oknami niebo i ziemia ze scenariusza kokpitu (zamiast lotniska)
          layers={ckMode || (recMode && recFlight(recMode)) ? { ground: false } : lightsMode ? { ground: false, env: false } : lab ? { ground: false, canoes: !isSliceMode(lab) || Boolean(params.wide), tail: !isSliceMode(lab) } : gearMode === 'retract' || landTab || radarFlight || fusFlight || (cs && cs.flight) || elecMode === 'dist' || elecMode === 'rat' ? { ground: false } : undefined}
          gear={gearMode ? gearDrv.drive : lightsMode ? ls.gear : undefined}
          extLights={lightsMode ? ls.ext : null}
          // reflektory lądowania tylko w czasie animacji lądowania (nie na postoju ustawianym suwakiem)
          landingLights={landTab && (gearMode0 === 'shock' ? params.land !== false : gearMode0 === 'brakes' ? params.run !== false : true)}
          enginePower={recMode ? recSim.power : gearMode ? gearDrv.power : lightsMode ? { n1: ls.n1, rev: 0 } : refuel ? { n1: refuelEngine ? 21 : 0, rev: 0 } : elecMode ? elecSim.power : undefined}
          gearPick={gearHome ? { selected: gsel, onSelect: setGsel } : undefined}
          // podzespoły wbudowane (kokpit, radar, APU) – w swoich modułach z ich symulacją, poza nimi w spoczynku
          systems={{
            apu: apuMode ? { sim: apuSim, mode: apuMode } : undefined,
            radar: radarMode ? { sim: radarSim, mode: radarMode } : undefined,
            cockpit: ckMode ? { sim: ckSim } : undefined,
          }}
        />
        {/* ciśnienie i klimatyzacja: urządzenia, kanały i strugi powietrza od silnika do zaworu wylotowego */}
        {fusView === 'press' && <AirSystem getStage={() => fusSim.current.stage} />}
        {/* woda i toalety, pożar w ładowni: rury, urządzenia i strugi etapów scenariusza */}
        {fusView === 'water' && <WaterSystem getStage={() => fusSim.current.stage} />}
        {fusView === 'fire' && <FireSystem getStage={() => fusSim.current.stage} getT={() => (params.run ? fusSim.current.t : -1)} />}
        {refuel && <RefuelScene sim={refuelSim} />}
        {doorsMode && <DoorsScene sim={doorsSim} sel={dsel} onSelect={setDsel} />}
        {elecMode && <ElecScene sim={elecSim} sel={esel} onSelect={setEsel} />}
        {recMode && <RecScene sim={recSim} sel={rsel} onSelect={setRsel} />}
        {lightsMode && <LightsModel sim={lightsSim} mode={lightsMode} params={params} />}
      </FollowPlane>
      {lab && <WingLab mode={lab} params={params} pose={pose} />}
      {ctl && <TailLab mode={ctl} params={params} pose={pose} direct={direct} />}
      {wingHome && <WingInfo sel={wsel} />}
      {tailHome && <TailInfo sel={tsel} />}
      {gearHome && <GearInfo sel={gsel} />}
      {fusHome && <FusInfo sel={fsel} />}
      {gearMode && <GearLab mode={gearMode} params={params} live={gearDrv.live} pose={pose} dockExtra={lightsMode ? <LightsPanel sim={lightsSim} /> : undefined} />}
      {apuMode && <ApuLab mode={apuMode} sim={apuSim} />}
      {fusView && fusView !== 'home' && fusView !== 'struct' && <FuselageLab view={fusView} sim={fusSim} params={params} />}
      {radarMode && <RadarLab mode={radarMode} sim={radarSim} params={params} />}
      {ckMode && <CockpitLab mode={ckMode} sim={ckSim} />}
      {refuel && <RefuelLab sim={refuelSim} />}
      {doorsMode && <DoorsLab sim={doorsSim} sel={dsel} />}
      {elecMode && <ElecLab sim={elecSim} sel={esel} />}
      {recMode && <RecLab sim={recSim} sel={rsel} />}
      {lightsMode && <LightsLab mode={lightsMode} sim={lightsSim} params={params} gear={gearDrv.live} />}
      {engineOn && eng.info}
    </NightCtx.Provider>
  );
}


/** Opis klikniętego elementu skrzydła (albo legenda grup i podpowiedź) w ramce informacji. */
function WingInfo({ sel }: { sel: string | null }) {
  const info = sel ? WING_PART_INFO[sel] : null;
  const g = sel ? wingGroupOf(sel) : undefined;
  return (
    <InfoPortal>
      {info ? (
        <>
          <div style={{ fontWeight: 700, color: g?.color }}>{info.name}</div>
          {g && <div style={{ fontSize: 12, opacity: 0.7 }}>{g.name}</div>}
          <div>{info.desc}</div>
        </>
      ) : (
        <>
          <div>Kliknij dowolny element skrzydła albo jego podpis, aby przeczytać, do czego służy.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
            {WING_GROUPS.map((gr) => (
              <span key={gr.name} style={{ color: gr.color }}>
                ● {gr.name}
              </span>
            ))}
          </div>
        </>
      )}
    </InfoPortal>
  );
}

/** Opis klikniętego elementu usterzenia (albo legenda grup i podpowiedź) w ramce informacji. */
function TailInfo({ sel }: { sel: string | null }) {
  const info = sel ? TAIL_PART_INFO[sel] ?? WING_PART_INFO[sel] : null;
  return (
    <InfoPortal>
      {info ? (
        <>
          <div style={{ fontWeight: 700, color: tailColorOf(sel!) ?? wingGroupOf(sel!)?.color }}>{info.name}</div>
          <div>{info.desc}</div>
        </>
      ) : (
        <>
          <div>Kliknij dowolny element usterzenia albo jego podpis, aby przeczytać, do czego służy. Siłowniki i mechanizm trymera są w środku – pokazane prześwietlone.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
            {TAIL_GROUPS.map((gr) => (
              <span key={gr.name} style={{ color: gr.color }}>
                ● {gr.name}
              </span>
            ))}
          </div>
        </>
      )}
    </InfoPortal>
  );
}

/** Opis klikniętej części podwozia (albo legenda grup i podpowiedź) w ramce informacji. */
/** Opis klikniętej części kadłuba (albo legenda grup i podpowiedź) w ramce informacji. */
function FusInfo({ sel }: { sel: string | null }) {
  const info = sel ? FUS_PART_INFO[sel] : null;
  const g = info ? FUS_GROUPS.find((x) => x.id === info.group) : undefined;
  return (
    <InfoPortal>
      {info ? (
        <>
          <div style={{ fontWeight: 700, color: g?.color }}>{info.name}</div>
          {g && <div style={{ fontSize: 12, opacity: 0.7 }}>{g.name}</div>}
          <div>{info.desc}</div>
        </>
      ) : (
        <>
          <div>Kliknij dowolny podpis w przekroju, aby przeczytać, co to jest i do czego służy.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
            {FUS_GROUPS.map((gr) => (
              <span key={gr.id} style={{ color: gr.color }}>
                {gr.name}
              </span>
            ))}
          </div>
        </>
      )}
    </InfoPortal>
  );
}

function GearInfo({ sel }: { sel: string | null }) {
  const info = sel ? GEAR_PART_INFO[sel] : null;
  return (
    <InfoPortal>
      {info ? (
        <>
          <div style={{ fontWeight: 700, color: gearGroupColor(sel!) }}>{info.name}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>podwozie {info.group === 'koła i hamulce' ? '– koła i hamulce' : info.group}</div>
          <div>{info.desc}</div>
        </>
      ) : (
        <>
          <div>Kliknij dowolny podpis części podwozia, aby przeczytać, do czego służy.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
            {GEAR_GROUPS.map((gr) => (
              <span key={gr.name} style={{ color: gr.color }}>
                ● {gr.name === 'główne' ? 'podwozie główne' : gr.name === 'przednie' ? 'podwozie przednie' : gr.name}
              </span>
            ))}
          </div>
        </>
      )}
    </InfoPortal>
  );
}

/** Konstrukcja skrzydła z bliska: kawałek tego samego skrzydła (przekrój z kesonem) z pylonem i silnikiem w spoczynku. */
function WingDetailScene() {
  return (
    <>
      <Lights />
      {/* zakładka modułu (nie strona główna): bez podpisów i klikania – pełne podpisy skrzydła są w zakładce „0” */}
      <EngineOnPlane n1={0} n2={0} cut={false} flow={false} labels={false} clickable={[]} accessories={false} wingOpen />
    </>
  );
}

/** Przycisk w treści kroku, który otwiera moduł podzespołu. */
function Open({ id, children }: { id: string; children: ReactNode }) {
  const nav = useTopicNav();
  return (
    <button type="button" className="module-open" onClick={() => nav?.openModule(id)}>
      {children}
      <span aria-hidden>→</span>
    </button>
  );
}

/* ======================= przegląd samolotu ======================= */

const plane = (s: Omit<Step, 'kind' | 'scene' | 'stageKey'>): Step => ({ kind: '3d', scene: PlaneScene, stageKey: 'airliner', ...s });

const overview: Step[] = [
  plane({
    title: 'Airbus A350-1000',
    camera: [-58, 22, 68],
    target: [1, -0.5, 0],
    body: (
      <>
        <p>
          To <b>Airbus A350-1000</b> – największa odmiana samolotów z rodziny A350. Jest szerokokadłubowy (w kabinie są dwa przejścia), ma dwa silniki i lata na bardzo długich trasach – nawet do ok. <b>16 000 km</b>, czyli np. z Warszawy do Sydney z jednym międzylądowaniem albo z Europy do Azji bez przerwy.
        </p>
        <p>
          Kilka liczb, żeby poczuć skalę: samolot ma <b>74 m długości</b> (prawie jak boisko piłkarskie wszerz), <b>65 m rozpiętości skrzydeł</b> i <b>17 m wysokości</b> – tyle co sześciopiętrowy blok. Zabiera zwykle <b>350–410 pasażerów</b>, a z pełnymi zbiornikami i kompletem ludzi waży przy starcie do <b>319 ton</b>.
        </p>
        <p>
          Ponad połowa konstrukcji jest z <b>kompozytu węglowego</b> – tworzywa wzmacnianego włóknami węgla. Jest lżejszy od aluminium i nie rdzewieje, więc samolot spala mniej paliwa.
        </p>
        <p>
          W kolejnych krokach obejdziemy samolot dookoła. W każdej chwili możesz też <b>kliknąć dowolną część</b> samolotu – otworzy się jej moduł: przekrój, podpisy i animacje pokazujące, jak działa.
        </p>
      </>
    ),
  }),
  plane({
    title: 'Kadłub i kabina',
    camera: [-30, 9, 34],
    target: [-9, 0, 0],
    preset: { highlight: 'fuselage' },
    body: (
      <>
        <p>
          <b>Kadłub</b> to szczelna rura o średnicy prawie 6 m. W przelocie samolot leci na wysokości ok. 12 km, gdzie powietrze jest zbyt rzadkie, żeby nim oddychać. Dlatego do środka wtłacza się powietrze – w kabinie jest wtedy ciśnienie jak w górach na wysokości ok. 1800 m. Kadłub działa jak napompowany balon: przy każdym locie trochę się „nadyma”, a po wylądowaniu wraca do zwykłego kształtu.
        </p>
        <p>
          Z przodu jest <b>kokpit</b> – poznasz go po czarnej „masce” okien. Wzdłuż boków ciągną się okna kabiny i cztery pary drzwi. Pod podłogą kabiny są <b>ładownie</b> na bagaż, a pod skrzydłami – opływowa <b>owiewka</b>, która osłania środkową część skrzydła i schowane podwozie.
        </p>
        <p>
          <Open id="kadlub">Otwórz moduł: kadłub i kabina</Open>
        </p>
      </>
    ),
  }),
  plane({
    title: 'Skrzydła',
    camera: [2, 30, 44],
    target: [8, -1, 12],
    preset: { highlight: 'wing' },
    body: (
      <>
        <p>
          <b>Skrzydła</b> niosą cały samolot. W locie powietrze nad skrzydłem ma niższe ciśnienie niż pod nim – ta różnica pcha skrzydło w górę z siłą równą ciężarowi samolotu. Skrzydła są odchylone do tyłu (to tzw. skos, ok. 32°) i lekko uniesione ku końcom, a na samych końcach mają zagięte w górę <b>winglety</b>, które zmniejszają opór.
        </p>
        <p>
          Przednia i tylna krawędź skrzydła są ruchome. <b>Sloty</b> i <b>klapy</b> powiększają skrzydło do startu i lądowania, gdy samolot leci wolno. <b>Lotki</b> przechylają samolot w zakręcie, a <b>spojlery</b> – płyty na górze skrzydła – hamują. W środku skrzydła jest <b>zbiornik paliwa</b>.
        </p>
        <p>
          <Open id="skrzydlo">Otwórz moduł: skrzydło</Open>
        </p>
      </>
    ),
  }),
  plane({
    title: 'Silniki',
    camera: [-30, 1, 30],
    target: [-6, -3, 10],
    preset: { highlight: 'engine' },
    body: (
      <>
        <p>
          Samolot ma dwa <b>silniki</b> Rolls-Royce Trent XWB. Każdy ma wentylator o średnicy 3 m (szerszy niż wysokość pokoju) i przy starcie pcha samolot siłą ok. 43 ton. Silniki wiszą pod skrzydłami na <b>pylonach</b> – wysięgnikach, które trzymają je z przodu skrzydła, żeby gorące spaliny nie uderzały w klapy.
        </p>
        <p>Większą część siły daje nie gorący strumień ze środka silnika, ale chłodne powietrze, które wielki wentylator przepycha dookoła niego. Dzięki temu współczesne silniki są ciche i oszczędne.</p>
        <p>
          <Open id="silnik">Otwórz moduł: silnik</Open>
        </p>
      </>
    ),
  }),
  plane({
    title: 'Usterzenie',
    camera: [55, 13, 33],
    target: [28.5, 4, 0],
    preset: { highlight: 'tail' },
    body: (
      <>
        <p>
          Na końcu kadłuba jest <b>usterzenie</b>, czyli „ogon”: pionowy statecznik ze sterem kierunku i poziomy statecznik ze sterami wysokości. Stateczniki działają jak lotki na końcu strzały – same z siebie ustawiają samolot w kierunku lotu. Stery pozwalają skręcać nosem w lewo i w prawo oraz w górę i w dół.
        </p>
        <p>
          Cały poziomy statecznik można powoli przestawiać (to tzw. trymowanie). Dzięki temu samolot leci równo, a pilot nie musi przez cały czas trzymać steru.
        </p>
        <p>
          <Open id="usterzenie">Otwórz moduł: usterzenie</Open>
        </p>
      </>
    ),
  }),
  plane({
    title: 'APU',
    camera: [56, 6, 16],
    target: [35, 1.5, 0],
    body: (
      <>
        <p>
          W samym końcu kadłuba pracuje <b>APU</b> – pomocniczy zespół napędowy (z ang. Auxiliary Power Unit). To mały silnik turbinowy, który nie napędza samolotu. Na ziemi daje <b>prąd</b> i <b>sprężone powietrze</b> do klimatyzacji i do uruchamiania głównych silników – wtedy, gdy samolot nie jest podłączony do zasilania z lotniska. Jego wylot spalin widać na samym końcu ogona.
        </p>
        <p>
          <Open id="apu">Otwórz moduł: APU</Open>
        </p>
      </>
    ),
  }),
  plane({
    title: 'Podwozie',
    camera: [-22, -4, 32],
    target: [-8, -4.2, 2],
    preset: { highlight: 'gear' },
    body: (
      <>
        <p>
          Samolot stoi na trzech „nogach”, czyli goleniach: <b>przedniej</b> z dwoma kołami, którą pilot skręca na ziemi, i dwóch <b>głównych</b> pod skrzydłami. Każda goleń główna ma po sześć kół – tak rozkłada się ogromny ciężar samolotu, żeby nie niszczył nawierzchni. W kołach głównych są hamulce, które przy lądowaniu rozgrzewają się do kilkuset stopni.
        </p>
        <p>Po starcie podwozie chowa się do wnęk w kadłubie, a ich drzwi się zamykają – samolot leci wtedy gładszy i stawia mniejszy opór.</p>
        <p>
          <Open id="podwozie">Otwórz moduł: podwozie</Open>
        </p>
      </>
    ),
  }),
];

/* ======================= podzespoły ======================= */

const engineModule: PartModule = {
  id: 'silnik',
  title: 'Silnik',
  summary: 'Silnik od środka: skąd bierze się ciąg, sprężarka, spalanie, turbina, odwracacz ciągu, tankowanie i awarie',
  steps: [
    plane({
      title: 'Turbowentylator na skrzydle',
      spot: [EO[0] - 0.5, EO[1] + 2.9, EO[2] + 0.6],
      camera: [EO[0] + 6.2, EO[1] + 2.6, EO[2] + 14.5],
      target: [EO[0] + 0.4, EO[1] + 0.5, EO[2]],
      preset: { focus: 'engine' },
      controls: [{ type: 'button', key: 'explode', label: 'Rozłóż silnik', labelOn: 'Złóż silnik', default: false }],
      body: (
        <>
          <p>
            Lewy silnik „ożył”: jego osłona jest przecięta, a w środku kręcą się wirniki. To <b>silnik turbowentylatorowy</b> – taki, jaki ma niemal każdy współczesny samolot pasażerski. Obróć model, zajrzyj do środka przez wycięcie i <b>kliknij</b> dowolną część albo jej podpis, żeby przeczytać, do czego służy.
          </p>
          <p>
            Z przodu wielki <b>wentylator</b> zasysa ogromną ilość powietrza. Większość tego powietrza omija środek silnika i od razu wylatuje z tyłu – to ono daje większą część siły ciągu. Tylko niewielka część wpada do <b>rdzenia</b>: tam jest ściskana w <b>sprężarce</b>, ogrzewana spalaniem paliwa w <b>komorze spalania</b>, a potem obraca <b>turbinę</b>, która napędza wentylator i sprężarkę. Silnik wisi na <b>pylonie</b>, który przenosi jego ciężar i siłę ciągu na skrzydło.
          </p>
          <p>
            Naciśnij <b>„Rozłóż silnik”</b>: osłona razem z całym samolotem uniesie się, a części silnika rozsuną się wzdłuż osi jak w rysunku technicznym. Kliknij wtedy dowolny zespół – rozłoży się dalej, aż do pojedynczych łopatek, wtryskiwaczy paliwa i świec zapłonowych.
          </p>
          <p>
            Wirniki są osadzone na kilku <b>wałach</b>, które kręcą się z różną prędkością. W kokpicie ich obroty nazywa się <b>N1</b> (wentylator), <b>N2</b> i <b>N3</b> (sprężarki i turbiny w środku silnika). Model pokazuje to w uproszczeniu: jasna łopatka na każdym wirniku pozwala zobaczyć, że wewnętrzny wał kręci się szybciej niż wentylator. Spirala na środku wentylatora jest dla ludzi na płycie lotniska – od razu widać, czy silnik się obraca.
          </p>
          <p>W zakładce „Turbowentylator w 3D” możesz sam zmieniać ciąg, średnicę wentylatora, rodzaj przekroju i prześwietlenie. W kolejnych zakładkach zostaje już tylko silnik z pylonem i kawałkiem skrzydła.</p>
        </>
      ),
    }),
    plane({
      title: 'Paliwo: od cysterny do silnika',
      spot: [3, -3.4, -16],
      // samolot na stanowisku (to samo co przy załadunku), z prawej i z przodu: prawe skrzydło, silnik i cysterna
      camera: [-40, 8, -44],
      target: [-6, -3.5, -12],
      preset: { refuel: true },
      controls: [{ type: 'button', key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false }],
      body: (
        <>
          <p>
            Silnik pracuje, dopóki dostaje paliwo. A350-1000 zabiera go do <b>125 ton</b>, czyli ok. 159 000 litrów – tyle, ile zmieściłoby się w kilku cysternach drogowych. Samoloty odrzutowe spalają <b>naftę lotniczą</b> (oznaczenie Jet A-1). Z rafinerii trafia ona do magazynu paliw na lotnisku, a stamtąd do samolotu – cysterną albo rurociągiem ukrytym pod płytą postojową.
          </p>
          <p>
            Naciśnij „Rozpocznij”. Pod prawe skrzydło podjeżdża <b>cysterna</b>. Mechanik najpierw łączy ją z samolotem przewodem uziemiającym (żeby iskra elektryczności statycznej nie zapaliła oparów), potem podnosi platformę i przykręca wąż do <b>złącza tankowania</b> pod skrzydłem. Paliwo płynie pod ciśnieniem rurą wzdłuż skrzydła i wypełnia zbiorniki – najpierw te w <b>skrzydłach</b>, potem <b>środkowy</b> pod kadłubem. Zbiorniki są widoczne „na wylot”, a ekran w kokpicie (strona <b>FUEL</b>) pokazuje, ile paliwa jest w każdym z nich.
          </p>
          <p>
            Potem zobaczysz drogę paliwa do silnika. <b>Pompy</b> na dnie zbiornika tłoczą je rurą w skrzydle do <b>pylonu</b> i dalej do silnika. Tam paliwo chłodzi olej silnika, przechodzi przez filtr i pompę wysokiego ciśnienia, a na koniec trafia do <b>regulatora</b>. Regulator, sterowany przez komputer silnika, odmierza dokładnie tyle paliwa, ile potrzeba, i kieruje je do <b>wtryskiwaczy</b> w komorze spalania.
          </p>
        </>
      ),
    }),
    ...jetEngine.steps.map(atEngine).map(withSpot),
  ],
};

const wingModule: PartModule = {
  id: 'skrzydlo',
  title: 'Skrzydło',
  summary: 'Budowa skrzydła, paliwo, klapy i sloty oraz to, jak skrzydło niesie samolot i kiedy przestaje',
  steps: [
    plane({
      title: 'Skrzydło od środka',
      spot: wingPoint(18, 0.35, 1.3),
      camera: [-6, 26, 36],
      target: [8, -1, 13],
      preset: { focus: 'wing' },
      controls: [{ type: 'toggle', key: 'animate', label: 'Ruch mechanizacji', default: true }],
      body: (
        <>
          <p>
            Z lewego skrzydła zdjęliśmy kawałek górnego „poszycia”, czyli zewnętrznej skóry. Pod spodem widać szkielet: dwie mocne belki biegnące wzdłuż skrzydła – <b>dźwigary</b> – połączone poprzecznymi ściankami, czyli <b>żebrami</b>. Poszycie od środka usztywniają długie listwy – <b>podłużnice</b>. Razem tworzą szczelną skrzynię nazywaną <b>kesonem</b>.
          </p>
          <p>
            Keson jest jednocześnie <b>zbiornikiem paliwa</b> – nie ma w nim osobnych baków, paliwo wypełnia samą konstrukcję. W skrzydłach mieści się większość z ok. 159 000 litrów paliwa samolotu.
          </p>
          <p>
            Ruchome części skrzydła pracują w pętli. Najpierw <b>klapy</b> wysuwają się do tyłu i w dół, a <b>sloty</b> do przodu – tak skrzydło przygotowuje się do lądowania: robi się większe i mocniej wygięte. Potem wychylają się <b>lotki</b>, które przechylają samolot, a na końcu podnoszą się <b>spojlery</b>, które hamują.
          </p>
          <p>W kolejnych zakładkach zobaczysz konstrukcję z bliska, a potem to, co dzieje się z powietrzem wokół skrzydła: skąd bierze się siła, która trzyma samolot w powietrzu, i kiedy skrzydło przestaje ją dawać.</p>
        </>
      ),
    }),
    {
      title: 'Konstrukcja z bliska',
      kind: '3d',
      spot: toEngineFrame(wingPoint(8.5, 0.5, 1.1)),
      frame: ENGINE_FRAME,
      scene: WingDetailScene,
      camera: [9, 7.5, 17],
      target: [3, 2, -1.5],
      body: (
        <>
          <p>
            To kawałek tego samego skrzydła, „wycięty” nad silnikiem. Górne poszycie zdjęto, żeby było widać <b>dźwigary</b>, <b>żebra</b>, <b>podłużnice</b> i <b>paliwo</b> wewnątrz kesonu.
          </p>
          <p>Zwróć uwagę na szczeliny przy slotach i klapach – przez nie przepływa powietrze, kiedy są wysunięte. Nad klapami leżą spojlery, a pod tylną krawędzią skrzydła wystają podłużne osłony (potocznie „kajaki”). Kryją się w nich szyny, po których wysuwają się klapy.</p>
        </>
      ),
    },
    ...makeWingLabSteps(plane).map((s, i) => (WING_SPOTS[i] ? { ...s, spot: WING_SPOTS[i] } : s)),
  ],
};

/** Zakładka usterzenia: krok sceny całego samolotu z nakładką `ctl` (symulacja, strzałki sił, wyróżnione stery). */
const ctlStep = (mode: CtlMode, s: Omit<Step, 'kind' | 'scene' | 'stageKey' | 'preset'>): Step => plane({ ...s, preset: { ctl: mode } });
const tailColor = (c: string, children: ReactNode) => <strong style={{ color: c }}>{children}</strong>;

const tailModule: PartModule = {
  id: 'usterzenie',
  title: 'Usterzenie',
  summary: 'Stateczniki i stery, trzy osie obrotu samolotu, stateczność, masa i wyważenie',
  steps: [
    plane({
      title: 'Usterzenie w ruchu',
      camera: [60, 30, 30],
      target: [25, 3, 9],
      preset: { focus: 'tail' },
      controls: [{ type: 'toggle', key: 'animate', label: 'Ruch sterów', default: true }],
      body: (
        <>
          <p>
            Najpierw wychyla się <b>ster kierunku</b> na pionowym stateczniku – obraca nos samolotu w lewo i w prawo. Potem pracują <b>stery wysokości</b> na poziomym stateczniku – podnoszą albo opuszczają nos.
          </p>
          <p>
            Cały <b>statecznik poziomy</b> może się też powoli obracać. Napędza go długa śruba z silnikami. Tak ustawia się go w locie, żeby samolot sam leciał równo, bez ciągłego trzymania steru – to tzw. <b>trymowanie</b>.
          </p>
          <p>
            Usterzenie to nie wszystko: do przechylania służą {tailColor(C_ROLL, 'lotki')} na końcach skrzydeł, a pomagają im spojlery (podświetlone na czerwono). Na końcu animacji widać, jak przechylają samolot.
          </p>
          <p>
            Kliknij dowolną część albo jej podpis. Siłowniki sterów i śruba statecznika są schowane w środku – pokazujemy je „prześwietlone”. W kolejnych zakładkach: jak samolot obraca się w powietrzu, jak działają lotki, dlaczego samolot leci stabilnie i jak ważne jest dobre rozłożenie ładunku.
          </p>
        </>
      ),
    }),
    ctlStep('axes', {
      title: 'Trzy osie i trzy stery',
      camera: [64, 26, 52],
      target: [2, 0, 0],
      controls: [
        { type: 'slider', key: 'bank', label: 'Przechylenie: lewo ↔ prawo (drążek w bok)', min: -60, max: 60, step: 1, default: 25, unit: '°' },
        { type: 'slider', key: 'pitch', label: 'Pochylenie nosa (drążek do siebie / od siebie)', min: -5, max: 15, step: 0.5, default: 2, unit: '°' },
        { type: 'slider', key: 'rud', label: 'Pedały: lewy ↔ prawy (ster kierunku)', min: -1, max: 1, step: 0.05, default: 0, decimals: 2 },
        { type: 'toggle', key: 'forces', label: 'Siły na sterach', default: true },
        { type: 'toggle', key: 'labels', label: 'Podpisy osi', default: true },
      ],
      body: (
        <>
          <p>
            Samolot może obracać się na trzy sposoby – wokół trzech wyobrażonych osi, które przecinają się w jego <strong>środku ciężkości</strong> (punkcie, w którym samolot by się zrównoważył, gdyby go podwiesić). Każdym obrotem steruje inna część – na modelu podświetlona kolorem swojej osi:
          </p>
          <p>
            {tailColor(C_ROLL, 'lotki')} na końcach skrzydeł – <strong>przechylanie</strong> (jedno skrzydło w górę, drugie w dół), {tailColor(C_PITCH, 'ster wysokości')} na poziomym stateczniku – <strong>pochylanie</strong> (nos w górę albo w dół), {tailColor(C_YAW, 'ster kierunku')} na pionowym stateczniku – <strong>odchylanie</strong> (nos w lewo albo w prawo).
          </p>
          <p>
            Wszystkie działają tak samo: wychylona klapka zmienia kształt skrzydła albo statecznika, a przez to siłę, z jaką powietrze na nie naciska. Ta siła jest niewielka, ale działa daleko od środka ciężkości – jak długi klucz, którym łatwo odkręcić śrubę – więc obraca cały samolot. Lotki wychylają się w przeciwne strony: jedna w górę, druga w dół.
          </p>
          <p>
            Stery służą do <strong>zmiany</strong> położenia, a nie do jego trzymania. Suwakami ustawiasz, dokąd samolot ma się obrócić. W A350 pilot nie porusza sterów bezpośrednio: boczny drążek (sidestick) wysyła polecenie do komputerów, a one wychylają stery siłownikami (to sterowanie „fly-by-wire”, czyli „po przewodach”). Lotki pracują tylko w czasie przechylania i wracają do środka – przechylony samolot sam utrzymuje przechylenie. Pochylenie na dłużej utrzymuje trymer statecznika. Inaczej ster kierunku: obrót trwa tylko, dopóki pilot trzyma wciśnięty pedał.
          </p>
        </>
      ),
    }),
    ctlStep('adverse', {
      title: 'Lotki i odchylenie niekorzystne',
      camera: [52, 60, 26],
      target: [-2, 0, 0],
      controls: [
        { type: 'slider', key: 'ail', label: 'Wychylenie lotek (drążek)', min: -1, max: 1, step: 0.05, default: 0.6, decimals: 2 },
        { type: 'select', key: 'mode', label: 'Sposób sterowania', default: 'brak', options: YAW_MODE_OPTIONS },
      ],
      body: (
        <>
          <p>
            Żeby skręcić, samolot musi się <strong>przechylić</strong> – jak rowerzysta na zakręcie. Wtedy siła, która go niesie, ciągnie go trochę w bok i samolot zakręca. Pilot przechyla samolot {tailColor(C_ROLL, 'lotkami')}: skrzydło z lotką opuszczoną w dół unosi się, a skrzydło z lotką podniesioną opada.
          </p>
          <p>
            Jest jednak haczyk. Skrzydło, które mocniej niesie, jest też mocniej hamowane przez powietrze (pomarańczowe strzałki). Dlatego na początku przechylania nos samolotu ucieka na chwilę w stronę <em>przeciwną</em> do zakrętu – widać to względem przerywanej linii kierunku lotu. To <strong>odchylenie niekorzystne</strong>.
          </p>
          <p>
            Konstruktorzy zmniejszają ten efekt: lotki wychylają się w górę bardziej niż w dół, pomagają im spojlery, a ster kierunku sam wychyla się w stronę zakrętu. Pilot sprawdza to na wskaźniku z <strong>kulką</strong>: gdy kulka wychodzi ze środka, samolot leci lekko bokiem. Żółta nitka na nosie pokazuje, skąd napływa powietrze – szybownicy przyklejają taką nitkę do szyby.
          </p>
        </>
      ),
    }),
    ctlStep('balance', {
      title: 'Równowaga momentów',
      camera: [-3, -1, 98],
      target: [-3, -2, 0],
      controls: [{ type: 'slider', key: 'cg', label: 'Środek ciężkości (% SCA)', min: 5, max: 60, step: 1, default: 25, unit: '%' }],
      body: (
        <>
          <p>
            Gdy samolot leci równo, wszystkie siły, które go obracają, muszą się znosić – jak na huśtawce, na której dwie osoby siedzą w takich odległościach, że deska stoi poziomo. Ciężar samolotu działa w jego <strong>środku ciężkości</strong>, a siła nośna skrzydła – w punkcie nieco za nim. Do tego wygięte skrzydło samo z siebie lekko „kręci” nosem w dół.
          </p>
          <p>
            Resztę wyrównuje {tailColor(C_PITCH, 'poziomy statecznik')} na końcu długiego kadłuba. W typowym samolocie dociska on ogon <strong>w dół</strong>, więc skrzydło musi nieść trochę więcej niż sam ciężar samolotu. Im bardziej z przodu jest środek ciężkości, tym mocniej statecznik musi dociskać – a to kosztuje trochę dodatkowego oporu i paliwa.
          </p>
          <p>
            Ważny jest <strong>punkt neutralny</strong> – fioletowy trójkąt na skali pod samolotem. Dopóki środek ciężkości leży przed nim, samolot jest stabilny: gdy nos sam się uniesie, powstaje siła, która go opuszcza z powrotem. Odległość między tymi punktami to <strong>zapas stabilności</strong>. Przesuń suwak za punkt neutralny i zobacz, co dzieje się na wykresie. (Odległości podajemy w procentach tzw. średniej cięciwy – umownej „szerokości” skrzydła, w skrócie SCA.)
          </p>
        </>
      ),
    }),
    ctlStep('gust', {
      title: 'Podmuch: stateczność dynamiczna',
      camera: [-2, 1, 88],
      target: [-2, -1, 0],
      controls: [
        { type: 'slider', key: 'cg', label: 'Środek ciężkości (% SCA)', min: 10, max: 60, step: 1, default: 25, unit: '%' },
        { type: 'toggle', key: 'fbw', label: 'Stabilizacja komputerowa (fly-by-wire)', default: true },
      ],
      body: (
        <>
          <p>
            Stabilny samolot po zaburzeniu wraca do równowagi. Ale w jaki sposób? Szybko i bez kołysania, z kilkoma gasnącymi wahnięciami, a może wcale? To opisuje <strong>stateczność dynamiczna</strong>.
          </p>
          <p>
            Co kilka sekund samolot wpada w <strong>podmuch od dołu</strong> – smugi powietrza uderzają w niego z dołu. Gdy środek ciężkości jest z przodu, samolot wraca szybko i „sztywno”. Gdy przesuwasz go do tyłu, wahania stają się wolniejsze i dłużej trwają. Za punktem neutralnym (48%) każde zaburzenie <strong>narasta</strong> i samolot sam się nie uspokoi. Ten sam ruch widać na sztucznym horyzoncie w kokpicie.
          </p>
          <p>
            W A350 przez cały czas pracuje komputerowy system sterowania (<strong>fly-by-wire</strong>): po każdym podmuchu sam wychyla {tailColor('#c084fc', 'ster wysokości')}, lotki, spojlery i ster kierunku, a pilot nie musi ruszać drążka. Widać to na ekranie F/CTL, który pokazuje wychylenia sterów. Wyłącz go, żeby zobaczyć „gołe” zachowanie samolotu: nos wraca do poprzedniego położenia sam, przechylenie zostaje, a nos kiwa się na boki. Myśliwce, np. F-16, projektuje się celowo jako niestabilne – są przez to zwrotniejsze, ale bez komputera nie dałoby się nimi latać.
          </p>
        </>
      ),
    }),
    ctlStep('phugoid', {
      title: 'Fugoida – długie wahania',
      camera: [30, 3, 118],
      target: [30, 0, 0],
      controls: [
        { type: 'slider', key: 'v', label: 'Prędkość lotu', min: 250, max: 950, step: 10, default: 500, unit: 'km/h' },
        { type: 'slider', key: 'ld', label: 'Doskonałość L/D', min: 4, max: 40, step: 1, default: 18 },
      ],
      body: (
        <>
          <p>
            Samolot wytrącony z równowagi wraca do niej dwoma rodzajami ruchu. Pierwszy to szybkie kiwnięcie nosem po podmuchu – gaśnie w kilka sekund. Drugi, nazywany <strong>fugoidą</strong>, jest bardzo powolny: jedno pełne wahnięcie trwa minutę albo dłużej. Samolot nie kiwa się wtedy nosem – zmienia się jego prędkość i wysokość.
          </p>
          <p>
            Co jakiś czas samolot dostaje lekkiego „kopniaka”, np. od podmuchu z przodu. Z nadmiarem prędkości skrzydła niosą mocniej, więc samolot łagodnie się wznosi. Wspinając się, zwalnia, więc skrzydła niosą słabiej – samolot zaczyna schodzić i znów przyspiesza. I tak w kółko. Na <strong>szczycie</strong> fali leci najwolniej, w <strong>dołku</strong> najszybciej – tak jak wahadło albo wagonik kolejki górskiej, w którym prędkość zamienia się w wysokość i z powrotem. Za samolotem rysuje się jego tor; w pionie jest powiększony, bo prawdziwe wahania to kilkadziesiąt metrów na odcinku wielu kilometrów.
          </p>
          <p>
            Im szybciej leci samolot, tym dłuższe są te wahania, a im lepiej szybuje, tym wolniej gasną: szybowiec kołysze się długo, cegła – krótko. Fugoida jest tak powolna, że pilot poprawia ją odruchowo, a w A350 autopilot i komputery tłumią ją, zanim pasażerowie cokolwiek poczują. Na sztucznym horyzoncie i taśmach prędkości i wysokości w kokpicie widać, jak delikatny to ruch.
          </p>
        </>
      ),
    }),
    ctlStep('lateral', {
      title: 'Wznios i statecznik pionowy',
      camera: [88, 20, 12],
      target: [0, 0, 7],
      view: lateralView,
      controls: [
        { type: 'select', key: 'exp', label: 'Doświadczenie', default: 'roll', options: LATERAL_EXP_OPTIONS },
        { type: 'slider', key: 'dih', label: 'Wznios skrzydeł (przechylenie)', min: -6, max: 10, step: 0.5, default: 5.5, unit: '°' },
        { type: 'select', key: 'layout', label: 'Położenie skrzydła (przechylenie)', default: 'dolno', options: LAYOUT_OPTIONS },
        { type: 'slider', key: 'fin', label: 'Wielkość statecznika pionowego (odchylenie)', min: 0, max: 2, step: 0.05, default: 1, decimals: 2 },
      ],
      body: (
        <>
          <p>
            Samolot sam wraca do prostego lotu po zaburzeniu dzięki dwóm sprytnym rozwiązaniom. Każde pokazuje osobne doświadczenie – przełączasz je u góry ustawień. Co 8 sekund podmuch wytrąca samolot, a wykres w ramce pokazuje, czy i jak szybko wraca.
          </p>
          <p>
            <strong>Przechylenie – wznios</strong> (widok od tyłu). Gdy podmuch przechyli samolot, ten zaczyna się zsuwać w bok, w stronę opuszczonego skrzydła, a powietrze napływa na niego z ukosa (smugi płyną skośnie). Jeśli skrzydła są uniesione ku końcom w literę V – to właśnie <strong>wznios</strong> – ten boczny napływ sprawia, że opuszczone skrzydło niesie mocniej, a uniesione słabiej. Samolot sam się wypoziomuje. Ustaw skrzydła opuszczone ku końcom albo zmień ich położenie na kadłubie: skrzydła na górze kadłuba działają podobnie jak wznios, a na dole – osłabiają ten efekt. Dlatego samoloty ze skrzydłami na dole kadłuba, jak A350, mają wyraźny wznios, a duże samoloty transportowe ze skrzydłami na górze – skrzydła opuszczone ku końcom.
          </p>
          <p>
            <strong>Odchylenie – {tailColor(C_YAW, 'statecznik pionowy')}</strong> (widok z góry). Gdy podmuch obróci nos w bok, powietrze napływa na samolot z ukosa. Statecznik, daleko za środkiem ciężkości, dostaje wtedy boczne pchnięcie, które obraca nos z powrotem pod wiatr – tak samo ustawia się chorągiewka albo strzała z lotkami. Przód kadłuba działa odwrotnie i chce obracać nos dalej. Zmniejsz statecznik poniżej ok. 0,35 – kadłub przeważy i samolot ustawi się bokiem.
          </p>
        </>
      ),
    }),
    ctlStep('mass', {
      title: 'Masa i wyważenie',
      camera: [0, 18, 92],
      target: [-3, -1, 0],
      controls: [
        { type: 'slider', key: 'paxF', label: 'Pasażerowie – klasa biznes (z przodu)', min: 0, max: 46, step: 1, default: 40 },
        { type: 'slider', key: 'paxR', label: 'Pasażerowie – klasa ekonomiczna', min: 0, max: 324, step: 2, default: 280 },
        { type: 'slider', key: 'cargoF', label: 'Przedni luk bagażowy', min: 0, max: 25000, step: 500, default: 12000, unit: 'kg' },
        { type: 'slider', key: 'cargoR', label: 'Tylny luk bagażowy', min: 0, max: 20000, step: 500, default: 8000, unit: 'kg' },
        { type: 'slider', key: 'fuel', label: 'Paliwo', min: 0, max: 125000, step: 1000, default: 80000, unit: 'kg' },
      ],
      body: (
        <>
          <p>
            Wszystko, co mówiliśmy o stabilności, zależy od tego, gdzie leży <strong>środek ciężkości</strong>. Dlatego przed każdym lotem powstaje <strong>arkusz załadunkowy</strong>: zestawienie, ile waży każdy element (pasażerowie, bagaż, ładunek, paliwo) i gdzie się znajduje. Z niego wynika masa samolotu i położenie środka ciężkości. Pasażerów (kropki) i ładunek w ładowniach widać „przez” poszycie.
          </p>
          <p>
            Środek ciężkości musi leżeć w dopuszczalnym obszarze – na wykresie to <strong>obwiednia</strong>. Nie może być za bardzo z przodu, bo przy lądowaniu stery nie dałyby rady podnieść nosa. Nie może być za bardzo z tyłu, bo samolot stałby się niestabilny. Sprawdza się dwa stany: bez paliwa i na starcie – bo w czasie lotu paliwo się spala, a środek ciężkości przesuwa.
          </p>
          <p>
            Spróbuj posadzić wszystkich pasażerów z tyłu przy pustej przedniej ładowni. Właśnie dlatego w pustawym samolocie załoga czasem prosi kogoś o przesiadkę. Od położenia środka ciężkości zależy też ustawienie <strong>trymera</strong> statecznika do startu.
          </p>
        </>
      ),
    }),
  ],
};
/** Numery zakładek usterzenia na modelu – każdy przy części, o której mowa. */
const TAIL_SPOTS: [number, number, number][] = [
  [30.5, 11.5, 0.8], // usterzenie w ruchu – nad statecznikiem pionowym
  [macX(0.25), 4.2, 3.2], // trzy osie – środek ciężkości
  wingPoint(27.5, 0.92, 0.8), // lotki
  [CONTROL_PTS.elevator[0], CONTROL_PTS.elevator[1] + 1, CONTROL_PTS.elevator[2]], // równowaga – ster wysokości
  [-26, 4, 2.4], // podmuch
  [-8, 4.4, 2.6], // fugoida
  [CONTROL_PTS.vtpAc[0], CONTROL_PTS.vtpAc[1] + 1.5, 0.6], // statecznik pionowy
  [-12, 3.9, 2.8], // masa i wyważenie – kabina
];
tailModule.steps.forEach((s, i) => (s.spot = TAIL_SPOTS[i]));

/**
 * Przekrój podłużny: zdjęta prawa połowa samolotu (z < 0), krawędź cięcia poszarpana jak wyrwa. Zostaje lewa połowa – ta, przy
 * której stoją podpisy i odnośniki do innych modułów.
 */
// poszarpana krawędź leży po prawej stronie osi (z od −0,7 do 0) – to, co stoi pośrodku (radar, pulpit), zostaje całe
const FUS_HALF = { z0: -0.7, z1: 80, amp: 0.7 };
/** Załadunek: zostaje prawa połowa – drzwi ładowni są w prawej burcie (zdjęta lewa, widać ładownie od środka). */
const FUS_HALF_R = { z0: -80, z1: 0.7, amp: 0.7 };

/** Numery zakładek kadłuba na modelu – przy tym, o czym jest zakładka. */
const FUS_SPOTS: [number, number, number][] = [
  [-4, 3.6, 0.6], // przekrój
  [-10, 3.4, 1.2], // konstrukcja – grzbiet
  [20.6 + 3.49, 1.6, 0.8], // ciśnienie – gródź
  [-6, 1.0, 0.6], // dekompresja – kabina nad skrzydłem
  [-25.3, -1.6, 0.6], // woda – zbiorniki wody pitnej
  [-17, -1.8, 0.6], // pożar – przednia ładownia
  [-19.6, -2.0, 0.6], // ładownie – drzwi ładowni
];

const RUN_BTN = { type: 'button' as const, key: 'run', label: 'Rozpocznij', labelOn: 'Zatrzymaj i wróć do początku', default: false };

const fuselageModule: PartModule = {
  id: 'kadlub',
  title: 'Kadłub i kabina',
  summary: 'Przekrój samolotu: kokpit, kabina, ładownie, konstrukcja, ciśnienie i klimatyzacja, dekompresja, woda, załadunek i ochrona przed pożarem',
  steps: [
    plane({
      title: 'Kadłub od środka',
      spot: FUS_SPOTS[0],
      // z prawej strony, na wprost przekroju: cały kadłub od nosa po ogon
      camera: [-4, 7, -78],
      target: [-2, -0.5, 0],
      preset: { focus: 'fuselage', fus: 'home' },
      body: (
        <>
          <p>
            Samolot jest przecięty wzdłuż na pół – prawą połowę zdjęliśmy, żeby zajrzeć do środka. Kadłub A350-1000 to rura o długości prawie <b>74 m</b> i średnicy ok. <b>6 m</b>. <b>Podłoga</b> dzieli ją na dwa piętra: na górze jest kabina pasażerska, a na dole ładownie, instalacje i schowane podwozie.
          </p>
          <p>
            W nosie, pod opływową osłoną, kryje się <b>radar pogodowy</b>. Za nim stoi <b>gródź przednia</b> – szczelna ściana, od której zaczyna się część kadłuba trzymająca ciśnienie. Dalej jest <b>kokpit</b>, a pod nim pomieszczenie z komputerami samolotu (tzw. <b>przedział awioniki</b>). Nad kabiną, tuż za kokpitem, piloci mają małą sypialnię na odpoczynek w długich lotach.
          </p>
          <p>
            W kabinie jest <b>klasa biznes</b> – po cztery fotele w rzędzie, rozkładane w łóżka – i <b>klasa ekonomiczna</b>, po dziewięć foteli w rzędzie (3-3-3). Przy drzwiach są kuchnie i toalety.
          </p>
          <p>
            Pod podłogą są dwie <b>ładownie</b> na bagaż. Między nimi przechodzi <b>centropłat</b> – środkowa część skrzydła, która łączy oba skrzydła i jest zarazem zbiornikiem paliwa – a za nim <b>wnęka podwozia</b>. Z tyłu kabinę zamyka kopulasta <b>gródź tylna</b>. Za nią, w zwężającym się ogonie, nie ma już ciśnienia – stoją tam mechanizm poruszający statecznikiem i <b>APU</b>.
          </p>
          <p>Kliknij podpis w przekroju, żeby przeczytać, co to jest. Odnośniki ze strzałką otwierają inne moduły, a numery – kolejne zakładki o kadłubie.</p>
        </>
      ),
    }),
    plane({
      title: 'Konstrukcja kadłuba',
      spot: FUS_SPOTS[1],
      camera: [-16, 6, -24],
      target: [-8, 0, 0.8],
      preset: { focus: 'fuselage', fus: 'struct' },
      body: (
        <>
          <p>
            Szkielet kadłuba tworzą dwa rodzaje usztywnień. <b style={{ color: '#5eead4' }}>Wręgi</b> to poprzeczne pierścienie co ok. 60 cm – trzymają okrągły kształt rury. <b style={{ color: '#fbbf24' }}>Podłużnice</b> to długie listwy biegnące wzdłuż – nie pozwalają cienkiemu poszyciu się pofałdować, gdy kadłub ugina się w locie.
          </p>
          <p>
            Każdy otwór w kadłubie osłabia go, więc trzeba go wzmocnić. Wokół drzwi są mocne <b style={{ color: '#fb923c' }}>ramy</b>: grubsze wręgi po bokach i belki nad i pod otworem. W pasie okien zamiast podłużnic biegną wzmocnione <b style={{ color: '#38bdf8' }}>ramy okien</b>. Na wręgach leżą <b style={{ color: '#a78bfa' }}>belki podłogi</b>, podparte od spodu słupkami.
          </p>
          <p>
            Tam, gdzie chowa się podwozie, kadłub ma od spodu wielki otwór. Obciążenia przenosi tam mocna belka biegnąca wzdłuż dołu kadłuba – <b style={{ color: '#f472b6' }}>belka kilowa</b> (jak kil łodzi). Część kadłuba trzymającą ciśnienie zamykają z przodu i z tyłu dwie <b style={{ color: '#f472b6' }}>grodzie</b>, a przez środek przechodzą <b style={{ color: '#bef264' }}>dźwigary centropłatu</b> – główne belki skrzydła.
          </p>
          <p>
            W A350 poszycie kadłuba składa się z wielkich płyt z <b>kompozytu węglowego</b> – na każdy odcinek kadłuba przypadają cztery: góra, dwa boki i spód. Kompozyt nie rdzewieje i lepiej znosi tysiące „nadmuchań” kadłuba w kolejnych lotach. Dzięki temu w kabinie może być wyższe ciśnienie i bardziej wilgotne powietrze niż w starszych samolotach – po długim locie jest się mniej zmęczonym.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Ciśnienie i klimatyzacja',
      spot: FUS_SPOTS[2],
      // z góry, od strony przekroju: silnik i skrzydło, owiewka z pakietami i wnętrze kabiny naraz
      camera: [-15, 15, -24],
      target: [-6, -1.2, 3],
      preset: { focus: 'fuselage', fus: 'press' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            Na wysokości 12 km powietrze jest bardzo rzadkie – ma pięć razy mniejsze ciśnienie niż przy ziemi – i mroźne: ok. −56 °C. Człowiek nie przeżyłby tam długo. Dlatego kabina jest <b>szczelna</b>, a do środka przez cały lot trzeba wtłaczać świeże powietrze: ogrzane albo schłodzone, oczyszczone i pod ciśnieniem.
          </p>
          <p>
            Naciśnij „Rozpocznij”, a zobaczysz krok po kroku całą drogę powietrza. Zaczyna się w silniku: część sprężonego tam, gorącego powietrza zostaje odebrana (to tzw. <b>upust</b>). Potem przechodzi przez <b>pakiety klimatyzacji</b> pod kadłubem, które je chłodzą i osuszają. W <b>mieszalniku</b> łączy się z oczyszczonym powietrzem z kabiny, przez <b>nawiewy</b> trafia do kabiny, a na końcu uchodzi na zewnątrz przez <b>zawór wylotowy</b>. Strzałki pokazują kierunek, a kolory – etap: od gorącego (czerwony), przez zimne (błękitny), po zużyte powietrze (szary).
          </p>
          <p>
            Ciśnienie w kabinie nie bierze się z „pompowania do pełna”. Do kabiny wpływa stale mniej więcej tyle samo powietrza, a <b>zawór wylotowy</b> decyduje, ile go wypuścić: im bardziej przymknięty, tym wyższe ciśnienie w środku. W przelocie A350 utrzymuje w kabinie ciśnienie jak na wysokości ok. 1800 m – niższej niż w starszych samolotach. Kadłub musi wtedy wytrzymać sporą różnicę ciśnień: na każdy metr kwadratowy ścian kabiny powietrze w środku naciska siłą ok. 6 ton.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Dekompresja',
      spot: FUS_SPOTS[3],
      // z fotela pasażera nad skrzydłem (środkowe miejsce prawej grupy), wzrokiem do przodu kabiny
      camera: [-6.05, 0.2, -1.95],
      target: [-10.5, 0.15, -1.1],
      cameraInside: true,
      preset: { focus: 'fuselage', fus: 'decomp' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            Siedzisz w fotelu nad skrzydłem. Samolot leci na wysokości 12,5 km, a w kabinie ciśnienie jest jak na ok. 1800 m. Naciśnij „Rozpocznij”. Po kilku sekundach kabina nagle traci szczelność – to <b>dekompresja</b>. Przyczyną może być np. uszkodzona uszczelka drzwi albo pęknięcie poszycia. W nowoczesnych samolotach zdarza się to bardzo rzadko.
          </p>
          <p>
            Powietrze ucieka z kabiny w ułamku sekundy. Gwałtownie się przy tym ochładza, a para wodna zamienia się w <b>mgłę</b>, która po chwili znika. Robi się zimno, w uszach „trzaska”. Gdy ciśnienie w kabinie spadnie do takiego, jak na wysokości ok. 4 km, z paneli nad fotelami same wypadają <b>maski tlenowe</b>. Pociągnięcie maski uruchamia mały <b>generator tlenu</b>, który daje tlen przez ok. 12–15 minut.
          </p>
          <p>
            Najważniejsza zasada: <b>najpierw maska dla siebie, potem dla dziecka</b>. Bez tlenu na tej wysokości człowiek ma tylko kilkanaście sekund, zanim straci zdolność rozsądnego działania.
          </p>
          <p>
            W kokpicie zapala się czerwone ostrzeżenie. Piloci zakładają maski i od razu sprowadzają samolot na ok. 3 km, gdzie da się normalnie oddychać – to <b>zniżanie awaryjne</b>. Tutaj trwa kilkadziesiąt sekund, w rzeczywistości ok. 4–5 minut. Ramka pokazuje wysokość lotu, ciśnienie w kabinie i to, ile sekund zostaje bez tlenu.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Woda i toalety',
      spot: FUS_SPOTS[4],
      // z prawej, przez przekrój: zbiorniki pod podłogą, magistrala, toalety i kuchnie po lewej burcie
      camera: [-6, 12, -27],
      target: [-3, -1.2, 1],
      preset: { focus: 'fuselage', fus: 'water' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            Na pokładzie jest ok. <b>1100 litrów wody</b> w dwóch zbiornikach pod podłogą, z przodu samolotu. Nie ma tu pompy: nad wodą jest <b>sprężone powietrze</b>, które wypycha ją rurami do kuchni i umywalek – jak w syfonie do wody gazowanej. Zużyta woda z umywalek nie wraca do zbiornika. Spływa do ogrzewanego <b>masztu</b> pod kadłubem i rozpyla się w powietrzu za samolotem.
          </p>
          <p>
            Toalety działają <b>podciśnieniowo</b>. Po naciśnięciu przycisku na chwilę otwiera się zawór pod muszlą, a różnica ciśnień między kabiną a rzadkim powietrzem na zewnątrz zasysa zawartość z ogromną prędkością do zbiorników z tyłu samolotu. Spłukanie zużywa tylko ok. 0,2 litra wody – w domowej toalecie to kilka litrów. Na ziemi i nisko, gdy różnica ciśnień jest za mała, pracuje dodatkowa pompa próżniowa.
          </p>
          <p>Naciśnij „Rozpocznij” – krok po kroku zobaczysz drogę wody: od napełnienia na ziemi, przez kran i spłukanie, do opróżnienia zbiorników po locie.</p>
        </>
      ),
    }),
    plane({
      title: 'Ładownie i załadunek',
      spot: FUS_SPOTS[6],
      // z prawej strony, z zewnątrz: drzwi ładowni, podnośniki i wózki; przez przekrój widać ładownie
      camera: [-6, 4.5, -58],
      target: [-6, -4.2, -6],
      preset: { focus: 'fuselage', fus: 'cargo' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            Pod podłogą kabiny są dwie ładownie: <b>przednia</b> przed skrzydłem i <b>tylna</b> za podwoziem. Bagaż i ładunek jadą w specjalnych <b>kontenerach</b> (oznaczanych LD3), które z jednej strony są ścięte, żeby pasowały do zaokrąglonego kadłuba. Tym razem widać prawą połowę samolotu, bo to w prawym boku są <b>drzwi ładowni</b>.
          </p>
          <p>
            Samolot stoi na <b>stanowisku postojowym</b> na lotnisku: pod kołami są kliny, przy silniku i końcówce skrzydła pachołki, a sprzęt czeka za czerwoną linią. Naciśnij „Rozpocznij”. Drzwi ładowni otwierają się do góry. Przy każdych stoi <b>podnośnik</b>: przedni pomost trzyma wysokość progu drzwi, a tylna platforma zjeżdża na dół po kontener.
          </p>
          <p>
            Kontenery przywozi mały ciągnik z czterema <b>wózkami</b>. Wózek staje za podnośnikiem, kontener zsuwa się z niego na platformę, platforma unosi go do progu, a kontener wjeżdża przez drzwi i jedzie po <b>rolkach</b> w podłodze na swoje miejsce, gdzie blokują go zaczepy. Potem ciągnik podjeżdża o jeden wózek, a pusty zestaw odjeżdża i robi miejsce następnemu.
          </p>
          <p>
            Kolejność nie jest przypadkowa: ładownię zapełnia się od jej końca, a każdy kontener ma swoje miejsce w <b>planie załadunku</b>. Od tego, jak ciężar rozłoży się między przodem a tyłem, zależy <b>środek ciężkości</b> samolotu – gdyby był za daleko z przodu albo z tyłu, samolotem trudno byłoby sterować. Za tylną ładownią jest jeszcze mały schowek na bagaż bez kontenerów.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Pożar w ładowni',
      spot: FUS_SPOTS[5],
      // przez przekrój, z prawej: przednia ładownia z kontenerami, butle gaśnicze za nią
      camera: [-26, 6, -18],
      target: [-12, -1.8, 0.5],
      preset: { focus: 'fuselage', fus: 'fire' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            Ładownie są pod podłogą, zamknięte i niewidoczne dla załogi, a w samolocie nie da się „zjechać na pobocze”. Dlatego mają własną ochronę: <b>czujniki dymu</b>, szczelne i <b>ognioodporne ściany</b>, zawory, które <b>odcinają dopływ powietrza</b>, i <b>instalację gaśniczą</b> z butlami środka gaśniczego.
          </p>
          <p>
            Naciśnij „Rozpocznij”. W jednym z kontenerów zaczyna się tlić bagaż – np. uszkodzona bateria w walizce. Czujniki wykrywają dym i w kokpicie rozlega się alarm. Piloci odcinają wentylację ładowni, żeby ogień nie dostawał świeżego powietrza, a potem wyzwalają pierwszą butlę: w ułamku sekundy wypełnia ona ładownię gazem gaśniczym. Druga butla wypuszcza gaz powoli, przez wiele godzin, żeby pożar nie wrócił.
          </p>
          <p>
            Taka instalacja <b>dusi</b> pożar, ale go całkiem nie gasi. Dlatego samolot musi wylądować na najbliższym odpowiednim lotnisku, a ładownię otwiera dopiero straż pożarna.
          </p>
        </>
      ),
    }),
  ],
};

/** APU – budowa, rozruch, przepływ, zasilanie samolotu oraz wyłączanie i zabezpieczenia (wspólna symulacja w apuLab). */
const apuModule: PartModule = {
  id: 'apu',
  title: 'APU',
  summary: 'Mały silnik w ogonie, który daje prąd i powietrze na ziemi: budowa, uruchamianie, działanie, wyłączanie i ochrona przed pożarem',
  steps: [
    plane({
      title: 'APU w stożku ogonowym',
      spot: APU_SPOTS[0],
      camera: [37.6, 1.9 + FUS_DY, 5.6],
      target: [34.0, 1.05 + FUS_DY, 0.1],
      preset: { focus: 'apu', apu: 'home' },
      body: (
        <>
          <p>
            <b>APU</b> to pomocniczy zespół napędowy (z ang. Auxiliary Power Unit) – mały silnik turbinowy schowany w samym końcu kadłuba. Od reszty samolotu oddziela go <b>ściana ogniowa</b>, która w razie pożaru zatrzyma ogień. Zdjęliśmy boczną pokrywę serwisową, a obudowy przecięliśmy, żeby było widać APU od środka.
          </p>
          <p>
            APU nie napędza samolotu. Na ziemi zastępuje zasilanie z lotniska: jego <b>prądnica</b> daje prąd, a <b>sprężarka</b> – sprężone powietrze do klimatyzacji i do uruchamiania głównych silników. W razie potrzeby APU może pracować też w locie, jako zapasowe źródło prądu.
          </p>
          <p>Kliknij podpisy części. Numery na modelu prowadzą do kolejnych zakładek: uruchamianie APU, przepływ powietrza przez turbinę, zasilanie samolotu oraz wyłączanie i ochrona przed pożarem.</p>
        </>
      ),
    }),
    ...makeApuSteps(plane),
  ],
};

/** Kokpit – część samolotu: ta sama scena, kamera w nosie (zakładki i teksty w cockpitLab). */
const cockpitModule: PartModule = makeCockpitModule(plane);

/** Radar pogodowy – budowa w nosie, wiązka, kolory echa, pochylenie anteny, turbulencje, uskok wiatru i omijanie burzy. */
const radarModule: PartModule = {
  id: 'radar',
  title: 'Radar pogodowy',
  summary: 'Radar pogodowy w nosie samolotu: jak „widzi” deszcz, co znaczą kolory na ekranie, turbulencje, uskok wiatru i omijanie burzy',
  steps: [
    plane({
      title: 'Radar w nosie samolotu',
      spot: RADAR_SPOTS[0],
      // z przodu, z lewej, nieco z góry: otwarta owiewka, antena na grodzi i podpisy części
      camera: [-42.2, 1.6, 6.2],
      target: [-35.8, 0.2, 0],
      preset: { focus: 'radar', radar: 'home' },
      controls: [{ type: 'button', key: 'open', label: 'Otwórz owiewkę', labelOn: 'Zamknij owiewkę', default: true }],
      body: (
        <>
          <p>
            W samym nosie samolotu, pod opływową osłoną (<b>radomem</b>), pracuje <b>radar pogodowy</b>. Na ziemi osłonę można podnieść jak maskę samochodu – tak jest tutaj. Do ściany kadłuba przymocowana jest okrągła, płaska <b>antena</b>, która obraca się na boki i pochyla w górę i w dół, a pod nią stoją dwa <b>nadajniki-odbiorniki</b> (drugi jest zapasowy).
          </p>
          <p>
            Radar wysyła przed samolot krótkie impulsy fal radiowych i odbiera ich odbicie od kropel deszczu i gradu. Na ekranie nawigacyjnym w kokpicie rysuje opady kolorami – od zielonego (słaby deszcz) po fioletowy (ulewa, grad). Ostrzega też przed silnymi turbulencjami i przed groźną, nagłą zmianą wiatru przy lądowaniu, tzw. <b>uskokiem wiatru</b>.
          </p>
          <p>Kliknij podpisy części. Numery na modelu prowadzą do zakładek: jak radar „patrzy”, co znaczą kolory, jak pochyla się antena, turbulencje, uskok wiatru i omijanie burzy.</p>
        </>
      ),
    }),
    ...makeRadarSteps(plane),
  ],
};
/** Generator prawego silnika (do numeru zakładki) – przybliżone miejsce skrzynki napędów pod gondolą. */
const E_GEN: [number, number, number] = [EO[0] + 1.0, EO[1] - 0.9, -EO[2] - 0.9];
const elecModule: PartModule = {
  id: 'elektryka',
  title: 'Elektryka',
  summary: 'Skąd samolot bierze prąd: zasilanie z lotniska, APU, generatory silników, akumulatory, rozdział prądu i awaryjna turbina wiatrowa RAT',
  steps: [
    plane({
      title: 'Prąd w samolocie',
      spot: [-28.6, -0.8, -1.2],
      // z przodu i z prawej: nos z gniazdem i wózkiem GPU, przedział awioniki, prawy silnik i owiewka z RAT
      camera: [-48, 2.5, -26],
      target: [-18, -3, -2],
      preset: { elec: 'home' },
      body: (
        <>
          <p>
            Prawie wszystko w samolocie działa na prąd: ekrany i komputery w kokpicie, sterowanie, pompy paliwa, światła, kuchnie, ogrzewanie szyb. A350 zużywa go dużo – w przelocie jego sieć elektryczna daje tyle mocy, co kilkadziesiąt domów naraz.
          </p>
          <p>
            Skąd bierze się prąd? W locie dają go <b>generatory</b> na silnikach – po dwa na każdym. Na ziemi – <b>APU</b> w ogonie albo <b>zasilanie z lotniska</b> (wózek z agregatem, nazywany GPU). Do tego są <b>akumulatory</b> i awaryjna turbina wiatrowa <b>RAT</b>. Prąd płynie do szaf rozdzielczych pod kokpitem, a stamtąd do wszystkich urządzeń.
          </p>
          <p>
            Samolot stoi na płycie i jest zasilany z wózka GPU. Kliknij podpisy części. Ekran w rogu to strona <b>ELEC</b> – taka sama jak w kokpicie: pokazuje źródła prądu i „szyny” (główne linie zasilające). Zielone znaczy: jest prąd.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Zasilanie z płyty',
      spot: [-31.5, -4.3, -2.6],
      camera: [-44, 2, -22],
      target: [-28, -3, -1],
      preset: { elec: 'gpu' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>Jak „budzi się” samolot rano? Naciśnij „Rozpocznij”. Najpierw mechanik włącza <b>akumulatory</b> – zasilają tylko najważniejsze urządzenia. Potem pod nos podjeżdża wózek z agregatem prądotwórczym (<b>GPU</b>), gruby kabel trafia do gniazda pod kadłubem i cały samolot dostaje prąd: zapalają się światła i ekrany, ruszają wentylatory.</p>
        </>
      ),
    }),
    plane({
      title: 'Generator APU',
      spot: [32.6, 1.8, -0.6],
      camera: [44, 4, -18],
      target: [32, 0.8, 0],
      preset: { elec: 'apu' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>Przed odlotem samolot musi stać się niezależny od lotniska. Naciśnij „Rozpocznij”: <b>APU</b> w ogonie rusza na prądzie z akumulatora, jego generator przejmuje zasilanie całego samolotu – bez nawet chwilowej przerwy – a wózek GPU odjeżdża.</p>
        </>
      ),
    }),
    plane({
      title: 'Generatory silników',
      spot: E_GEN,
      camera: [EO[0] - 9, EO[1] + 2, -EO[2] - 10],
      target: [EO[0] + 1, EO[1], -EO[2]],
      preset: { elec: 'eng' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>W locie prąd dają <b>generatory na silnikach</b> – po dwa na każdym. Napędza je silnik przez przekładnię (ten sam generator zobaczysz w module silnika). Naciśnij „Rozpocznij”: silniki ruszają, ich generatory włączają się do sieci, a APU można wyłączyć.</p>
        </>
      ),
    }),
    plane({
      title: 'Szyny i odbiorniki',
      spot: [-28.6, -1.4, 1.2],
      camera: [-22, 1, -9],
      target: [-28.6, -2.1, 0],
      preset: { elec: 'dist' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>Prąd z generatorów nie płynie prosto do urządzeń. Najpierw trafia na <b>szyny</b> – główne linie zasilające, coś jak rozdzielnia w bloku. Są szyny prądu przemiennego (AC, jak w gniazdku, tylko o innym napięciu i częstotliwości) i prądu stałego (DC, jak z akumulatora, dla elektroniki). Najważniejsze urządzenia wiszą na szynach <b>awaryjnych</b> (ESS), które można zasilić niemal z każdego źródła. Naciśnij „Rozpocznij” – zobaczysz, co zasila każda szyna i co się dzieje, gdy jeden generator się zepsuje.</p>
        </>
      ),
    }),
    plane({
      title: 'RAT – turbina awaryjna',
      spot: [-9.2, -5.2, -1.9],
      camera: [-20, 6, -36],
      target: [-6, -1, 0],
      preset: { elec: 'rat' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            Co, jeśli zgasną oba silniki? To niezwykle rzadkie, ale samolot jest na to przygotowany. Naciśnij „Rozpocznij”. Generatory przestają dawać prąd, przez chwilę najważniejsze urządzenia zasilają <b>akumulatory</b>, a spod kadłuba wysuwa się <b>RAT</b> – mała turbina wiatrowa. Pęd powietrza kręci jej śmigłem, a ona napędza awaryjny generator. Daje dość prądu na ekrany, sterowanie i radio, żeby bezpiecznie wylądować.
          </p>
        </>
      ),
    }),
  ],
};
/** Sterowanie fly-by-wire – na razie tylko zakładka startowa (szczegóły do dopisania). */
const fbwModule: PartModule = {
  id: 'sterowanie',
  title: 'Sterowanie fly-by-wire',
  summary: 'Jak ruch drążka trafia do sterów: komputery sterowania lotem, ochrona przed niebezpiecznymi manewrami i co się dzieje, gdy któryś komputer zawiedzie',
  steps: [
    plane({
      title: 'Sterowanie przez komputery',
      // z tyłu i z góry: skrzydła z lotkami i spojlerami oraz usterzenie
      camera: [48, 26, 40],
      target: [4, -1, 0],
      body: (
        <>
          <p>
            W A350 drążek pilota nie jest połączony ze sterami linkami ani dźwigniami. Ruch drążka zamienia się w sygnał elektryczny, który trafia do <b>komputerów sterowania lotem</b>. To one decydują, jak wychylić lotki, spojlery i stery na ogonie. Taki układ nazywa się <b>fly-by-wire</b> – „sterowanie po przewodzie”.
          </p>
          <p>Ten moduł jest w przygotowaniu.</p>
        </>
      ),
    }),
  ],
};
/** Hydraulika – na razie tylko zakładka startowa (szczegóły do dopisania). */
const hydModule: PartModule = {
  id: 'hydraulika',
  title: 'Hydraulika',
  summary: 'Płyn pod wysokim ciśnieniem, który porusza sterami, podwoziem i hamulcami: dwa układy, zielony i żółty, pompy i zapasowe siłowniki elektryczne',
  steps: [
    plane({
      title: 'Siła z płynu pod ciśnieniem',
      // z boku i z dołu: podwozie, skrzydło i silniki z pompami
      camera: [-6, -9, 42],
      target: [-2, -3, 0],
      body: (
        <>
          <p>
            Stery, podwozie i hamulce A350 są za ciężkie, żeby poruszać nimi siłą mięśni. Robi to <b>hydraulika</b>: pompy napędzane silnikami tłoczą płyn pod ciśnieniem 5000 psi, czyli ok. 345 atmosfer, a <b>siłowniki</b> zamieniają je na ruch. Samolot ma dwa niezależne układy, <b>zielony</b> i <b>żółty</b>, a w zapasie siłowniki z własnymi małymi pompami na prąd.
          </p>
          <p>Ten moduł jest w przygotowaniu.</p>
        </>
      ),
    }),
  ],
};
/** Czarne skrzynki – rejestratory danych i rozmów, budowa, próby wytrzymałości i poszukiwania (symulacja w recorders). */
const recordersModule: PartModule = {
  id: 'czarne-skrzynki',
  title: 'Czarne skrzynki',
  summary: 'Rejestratory lotu w ogonie: co zapisują, z czego są zbudowane, jak przetrwają katastrofę i jak się je odnajduje',
  steps: [
    plane({
      title: 'Rejestratory lotu',
      spot: REC_SPOTS[0],
      // z tyłu i z lewej: tylna część kadłuba z prześwietlonymi rejestratorami, nadajnikiem ELT i przewodami
      camera: [26.6, 2.9, 6.0],
      target: [22.4, 1.1, 0.2],
      preset: { rec: 'home' },
      body: (
        <>
          <p>
            „Czarne skrzynki” to dwa <b>rejestratory lotu</b>. Wcale nie są czarne – maluje się je na jaskrawy pomarańczowy kolor, żeby łatwo je znaleźć. <b>Rejestrator danych</b> zapisuje, co robi samolot: prędkość, wysokość, położenie sterów, pracę silników i tysiące innych wartości. <b>Rejestrator rozmów</b> nagrywa dźwięk w kokpicie.
          </p>
          <p>
            W A350 oba stoją w tylnej części kadłuba, nad sufitem kabiny, tuż przed tylną grodzią. Ta część samolotu przy wypadku zwykle najmniej ucierpi. Dane płyną do nich przewodami z przedziału awioniki pod kokpitem, a dźwięk – z mikrofonów w kokpicie. Rejestratory, przewody i inne części w środku są pokazane prześwietlone przez poszycie.
          </p>
          <p>Kliknij podpisy części. Numery na modelu prowadzą do zakładek: co zapisuje rejestrator danych, co nagrywa rejestrator rozmów, co jest w środku, jakie próby przechodzi i jak się go odnajduje po wypadku.</p>
        </>
      ),
    }),
    plane({
      title: 'Rejestrator danych lotu',
      spot: REC_SPOTS[1],
      camera: [-30, 12, 44],
      target: [-4, -1, 5],
      preset: { rec: 'data' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>Skąd rejestrator wie, co robi samolot? Naciśnij „Rozpocznij”. Zobaczysz, jak wyniki pomiarów z czujników na nosie, silnikach, skrzydłach i ogonie płyną do jednostki zbierającej dane pod kokpitem, a stamtąd jednym przewodem do ogona. Ekran w rogu pokazuje kilka zapisywanych wartości.</p>
        </>
      ),
    }),
    plane({
      title: 'Rejestrator rozmów',
      spot: REC_SPOTS[2],
      camera: [-21.5, 4.6, 12.5],
      target: [-31.4, 0.2, 0],
      preset: { rec: 'voice' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>Drugi rejestrator nagrywa dźwięk w kokpicie. Naciśnij „Rozpocznij”: zobaczysz, skąd biorą się cztery ścieżki nagrania, ile godzin się mieści i kiedy można je skasować. Ekran w rogu pokazuje ścieżki tak, jak nagrywa je rejestrator.</p>
        </>
      ),
    }),
    plane({
      title: 'Co jest w środku',
      spot: REC_SPOTS[3],
      camera: [22.65 + 3.4, -6.13 + 0.86 + 1.5, 5.4 + 5.0],
      target: [22.05, -6.13 + 0.86 + 1.3, 3.2],
      cameraInside: true,
      preset: { rec: 'build' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>Mechanik wyjmuje rejestrator danych z samolotu i kładzie go na stole obok ogona. Naciśnij „Rozpocznij”: zdejmiemy pokrywę, rozłożymy moduł pamięci warstwa po warstwie i pokażemy nadajnik, który pomaga znaleźć rejestrator pod wodą.</p>
        </>
      ),
    }),
    plane({
      title: 'Próby wytrzymałości',
      spot: REC_SPOTS[4],
      camera: [22.85 - 0.42, -6.13 + 0.86 + 0.53, 5.4 + 1.28],
      target: [22.8, -6.13 + 0.96, 5.4],
      cameraInside: true,
      preset: { rec: 'tests' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>Zanim nowy typ rejestratora trafi do samolotów, jego moduł pamięci musi przejść ciężkie próby: uderzenie, przebicie, zgniatanie, pożar i ciśnienie głębin oceanu. Naciśnij „Rozpocznij” i zobacz je po kolei. Po każdej z nich zapis musi dać się odczytać.</p>
        </>
      ),
    }),
    plane({
      title: 'Odnajdywanie po wypadku',
      spot: REC_SPOTS[5],
      camera: [4, 16, 42],
      target: [8, 0, 0],
      preset: { rec: 'search' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>Rejestrator na nic się nie przyda, jeśli nikt go nie znajdzie. Naciśnij „Rozpocznij”: zobaczysz, jak samolot sam informuje o swoim położeniu, jak nadajniki pomagają odnaleźć szczątki na lądzie i pod wodą i co dzieje się z rejestratorem w laboratorium.</p>
        </>
      ),
    }),
  ],
};
/** Światła zewnętrzne – nocą, z panelem EXT LT: pozycyjne, antykolizyjne, reflektory, skrzydło, logo i kolejność w locie. */
const lightsModule: PartModule = {
  id: 'swiatla',
  title: 'Światła zewnętrzne',
  summary: 'Światła zewnętrzne nocą: pozycyjne, migające ostrzegawcze, reflektory do lądowania i kołowania, oświetlenie skrzydła i logo oraz kiedy co się włącza',
  steps: [
    plane({
      title: 'Światła samolotu nocą',
      spot: LIGHTS_SPOTS[0],
      // z przodu, z lewej i z góry: cały samolot na płycie, wszystkie światła zapalone
      camera: [-62, 20, 62],
      target: [2, -3, 0],
      preset: { focus: 'lights', lights: 'home' },
      body: (
        <>
          <p>
            Noc na lotnisku. A350 ma kilkanaście <b>świateł zewnętrznych</b> i każde ma inne zadanie. Jedne pokazują innym, w którą stronę leci samolot – to <b>światła pozycyjne</b> (czerwone po lewej, zielone po prawej). Inne ostrzegają przed nim: czerwony migający <b>beacon</b> i białe błyski <b>stroboskopów</b>. A <b>reflektory</b> pozwalają pilotom widzieć pas, drogę kołowania i skrzydło.
          </p>
          <p>
            Piloci włączają je przełącznikami na panelu nad głową. Ten panel jest w lewym dolnym rogu ekranu i pokazuje, które światła są włączone. Kliknij podpis światła – zapali się tylko ono, a obok zobaczysz jego opis.
          </p>
          <p>Numery na modelu prowadzą do zakładek: w które strony świecą światła pozycyjne, rytm błysków, lądowanie nocą, kołowanie i zjazd z pasa, oświetlenie skrzydła, logo na ogonie i kolejność włączania świateł w czasie lotu.</p>
        </>
      ),
    }),
    ...makeLightsSteps(plane),
  ],
};
const XL2 = -16.4;
const doorsModule: PartModule = {
  id: 'drzwi',
  title: 'Drzwi i ewakuacja',
  summary: 'Drzwi pasażerskie: budowa, otwieranie, uzbrajanie zjeżdżalni, zjeżdżalnia awaryjna, ewakuacja w 90 sekund i dlaczego w locie nie da się ich otworzyć',
  steps: [
    plane({
      title: 'Drzwi pasażerskie',
      spot: [XL2, 1.6, 3.4],
      // z zewnątrz, na wprost otworu 2L: otwarte drzwi obok otworu, przez otwór – drzwi 2R od środka
      camera: [XL2 + 0.6, 0.1, 10.5],
      target: [XL2 - 0.3, -0.35, 0],
      preset: { doors: 'home' },
      body: (
        <>
          <p>
            A350-1000 ma <b>osiem drzwi pasażerskich</b> – po cztery z każdej strony, numerowanych od przodu: 1L…4L po lewej i 1R…4R po prawej. Każde mają ok. 1 × 2 m i mogą służyć jako wyjście ewakuacyjne nawet dla ok. 110 osób. Samolot stoi na płycie: drzwi po lewej są otwarte (jak przy wsiadaniu), po prawej – zamknięte.
          </p>
          <p>
            Drzwi samolotu nie wiszą na zwykłych zawiasach. Najpierw unoszą się, potem wychodzą na zewnątrz i obracają do przodu na <b>ramieniu</b>, przez cały czas równoległe do boku kadłuba. W każdych jest złożona <b>zjeżdżalnia awaryjna</b>, która w razie potrzeby sama wypada i napełnia się powietrzem.
          </p>
          <p>Podpisy części widocznych z zewnątrz i mechanizmu są przy otwartych drzwiach 2L. Części od strony kabiny i zjeżdżalnia są podpisane na zamkniętych drzwiach 2R, które widać przez otwór na wprost. Kliknij podpis, żeby przeczytać opis. Numery na modelu prowadzą do zakładek.</p>
        </>
      ),
    }),
    plane({
      title: 'Jak otwierają się drzwi',
      spot: [XL2 - 0.6, 0.9, 3.6],
      camera: [XL2 + 4.2, 0.45, 8.1],
      target: [XL2 - 0.4, -0.25, 2.95],
      preset: { doors: 'open' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            Drzwi samolotu otwierają się <b>na zewnątrz</b> – a mimo to w locie nie da się ich otworzyć. Naciśnij „Rozpocznij” i obejrzyj krok po kroku, jak otwierają się drzwi 2L: dźwignia, uniesienie drzwi z <b>ograniczników</b>, wysunięcie na zewnątrz i obrót do przodu na <b>ramieniu</b>, a na koniec blokada, żeby wiatr ich nie zamknął.
          </p>
        </>
      ),
    }),
    plane({
      title: 'Uzbrajanie zjeżdżalni',
      // od środka drzwi – numer na wewnętrznej stronie drzwi 2R (widać ją przez otwór 2L)
      spot: [XL2 - 0.33, -0.3, -2.55],
      // z kabiny, przodem do drzwi 2L od środka
      camera: [XL2 + 0.3, 0.3, -0.1],
      target: [XL2 - 0.15, -0.6, 2.9],
      cameraInside: true,
      preset: { doors: 'arm' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            „Cabin crew, <b>arm doors</b> and cross-check” – to zdanie słychać przed każdym startem. Znaczy: „załoga, uzbroić drzwi i sprawdzić nawzajem”. Naciśnij „Rozpocznij” i zobacz od środka, co dzieje się wtedy przy drzwiach 2L: <b>dźwignia</b> przechodzi na ARMED (uzbrojone), metalowy <b>drążek zjeżdżalni</b> wchodzi w uchwyty w podłodze, a w okienku zapala się czerwona kontrolka <b>SLIDE ARMED</b>.
          </p>
          <p>Od tej chwili otwarcie drzwi od środka wyrzuci zjeżdżalnię. Dlatego po przylocie, zanim drzwi zostaną otwarte przy rękawie, pada polecenie „disarm doors” – rozbroić drzwi.</p>
        </>
      ),
    }),
    plane({
      title: 'Zjeżdżalnia awaryjna',
      spot: [XL2, -2.2, 6.5],
      camera: [XL2 + 0.3, 0.3, -0.1],
      target: [XL2 - 0.1, -0.55, 2.9],
      cameraInside: true,
      preset: { doors: 'slide' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            Ewakuacja na ziemi przez uzbrojone drzwi 2L. Naciśnij „Rozpocznij”. Członek załogi sprawdza przez okienko, czy na zewnątrz nie ma ognia, i podnosi dźwignię. Drzwi otwiera sam <b>siłownik awaryjny</b>. Drążek trzyma się podłogi, więc otwierające się drzwi wyciągają pakiet ze <b>zjeżdżalnią</b>. Pakiet spada wzdłuż kadłuba i w ok. <b>6 sekund</b> napełnia się gazem z butli i powietrzem zasysanym z otoczenia.
          </p>
          <p>Próg drzwi jest ok. 5 m nad ziemią – jak okno drugiego piętra. Zjeżdżalnia ma ponad 8 m długości, dwa tory i światła wzdłuż brzegów. Na wodzie można jej użyć jako tratwy.</p>
        </>
      ),
    }),
    plane({
      title: 'Ewakuacja w 90 sekund',
      spot: [-4, 2.5, 0],
      camera: [-6, 30, 40],
      target: [-4, -6, 6],
      preset: { doors: 'evac' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            Przepisy wymagają, żeby wszyscy pasażerowie mogli opuścić samolot w <b>90 sekund</b>, korzystając tylko z <b>połowy wyjść</b> – bo druga połowa może być od strony ognia. Producent musi to udowodnić w próbie z prawdziwymi ludźmi, w ciemności i z bagażami porozrzucanymi w przejściach.
          </p>
          <p>Naciśnij „Rozpocznij”: wszystkie osiem drzwi otwiera się, zjeżdżalnie napełniają się jednocześnie, a pasażerowie zjeżdżają na płytę i odbiegają od samolotu.</p>
        </>
      ),
    }),
    plane({
      title: 'Drzwi w locie',
      spot: [XL2 + 0.2, 0.0, -2.55],
      camera: [XL2 + 0.3, 0.2, -0.1],
      target: [XL2, -0.25, 2.9],
      cameraInside: true,
      preset: { doors: 'press' },
      controls: [RUN_BTN],
      body: (
        <>
          <p>
            Czy pasażer może otworzyć drzwi w czasie lotu? Nie – i nie chodzi tylko o zamki. Drzwi są jak <b>korek w butelce</b>: większe od otworu i od środka dociśnięte do <b>ograniczników</b> w ramie. Na wysokości przelotu powietrze w kabinie naciska na nie siłą ok. <b>12 ton</b> – jakby stało na nich kilka samochodów.
          </p>
          <p>Naciśnij „Rozpocznij” – strzałki pokażą siłę od ciśnienia, a kolejne kroki wyjaśnią, dlaczego drzwi da się otworzyć dopiero na ziemi, gdy ciśnienie w środku i na zewnątrz jest takie samo.</p>
        </>
      ),
    }),
  ],
};

const gearModule: PartModule = {
  id: 'podwozie',
  title: 'Podwozie',
  summary: 'Nogi samolotu: amortyzator, sześć kół na goleni, chowanie podwozia, hamulce i skręcanie na ziemi',
  steps: [
    plane({
      title: 'Podwozie z bliska',
      spot: GEAR_SPOTS[0],
      // nisko, za lewym skrzydłem: na pierwszym planie podwozie główne (przed silnikiem), w głębi przednie
      camera: [11, -4.6, 22],
      target: [-11, -4.4, 3],
      preset: { focus: 'gear' },
      body: (
        <>
          <p>
            A350-1000 stoi na trzech „nogach”, czyli <b>goleniach</b>. <b>Przednia</b> ma dwa koła i pilot skręca nią samolot na ziemi. Dwie <b>główne</b> mają po sześć kół na trzech osiach – tak rozkłada się ciężar samolotu ważącego przy starcie ponad 300 ton, żeby koła nie niszczyły nawierzchni pasa.
          </p>
          <p>
            Goleń główna to przede wszystkim ogromny <b>amortyzator</b>: cylinder, w który wsuwa się błyszczące <b>tłoczysko</b>. Widać też <b>nożyce</b> (nie pozwalają kołom obracać się na boki), składany boczny <b>zastrzał</b> z zamkiem, który trzyma wypuszczoną goleń, i przewody hydrauliczne do hamulców. W kołach kryją się <b>hamulce</b> z tarczami z włókna węglowego.
          </p>
          <p>Kliknij numer na modelu, żeby zobaczyć, jak działa amortyzator, jak podwozie się chowa, jak hamuje i jak samolot skręca na ziemi.</p>
        </>
      ),
    }),
    ...makeGearSteps(plane),
  ],
};


export const airplane: Topic = {
  id: 'samolot-pasazerski',
  title: 'Lotnictwo pasażerskie na przykładzie Airbusa A350',
  subject: 'lotnictwo',
  summary: 'Airbus A350-1000 w 3D: kadłub, skrzydła, silniki, usterzenie i podwozie. Kliknij podzespół, a otworzy się od środka – z przekrojem, podpisami i własnymi zakładkami.',
  accent: '#0ea5e9',
  glyph: '✈',
  steps: overview,
  modules: [cycleModule, engineModule, wingModule, tailModule, fuselageModule, gearModule, apuModule, cockpitModule, radarModule, lightsModule, doorsModule, elecModule, fbwModule, hydModule, recordersModule],
};

