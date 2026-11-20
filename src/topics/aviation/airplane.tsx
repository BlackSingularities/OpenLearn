import { useMemo, useState, type ReactNode } from 'react';
import type { PartModule, SceneProps, Step, Topic } from '../../lib/types';
import { Lights } from '../../lib/three';
import { useTopicNav } from '../../lib/topicNav';
import { Airliner, CONTROL_PTS, TAIL_GROUPS, TAIL_PART_INFO, tailColorOf, ENG_K, EngineOnPlane, WING_GROUPS, WING_PART_INFO, W_TIP, engineOrigin, macX, wingGroupOf, wingPoint, GEAR_GROUPS, GEAR_PART_INFO, gearGroupColor, type PlanePart, type PlanePhase } from './airliner';
import { InfoPortal } from '../../lib/plot';
import { AutoRotate, useEngineOverview } from './jetEngine';
import { jetEngine } from './jetEngine';
import { FollowPlane, WingLab, isSliceMode, labPose, makeWingLabSteps, newDirectPose, newPose, usePoseDriver, type LabMode } from './wingLab';
import { ENGINE_PART_OFFSET, ax } from './engineModel';
import { C_PITCH, C_ROLL, C_YAW, LATERAL_EXP_OPTIONS, LAYOUT_OPTIONS, lateralView, TailHomeCockpit, TailLab, YAW_MODE_OPTIONS, ctlScene, lateralLook, type CtlMode } from './tailLab';
import { GEAR_SPOTS, GearLab, makeGearSteps, useGearDriver, type GearMode } from './gearLab';

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
  direct.active = Boolean(ctl) || landTab;
  usePoseDriver(pose, tgt, direct);
  // strona główna skrzydła: podpisy i elementy skrzydła są klikalne, jak w zbliżeniu konstrukcji
  const wingHome = focus === 'wing' && !lab;
  // stan samolotu: aerodynamika i pracujący silnik – w locie; przegląd na ziemi
  // zakładki podwozia: chowanie w locie, pozostałe na ziemi; podwozie sterowane wspólnym stanem
  const gearMode = gearMode0;
  const gearDrv = useGearDriver(gearMode, params, direct);
  const phase: PlanePhase = cs ? (cs.flight ? 'flight' : 'ground') : gearMode === 'retract' ? 'flight' : gearMode ? 'ground' : lab === 'spoiler' && params.use === 'ground' ? 'ground' : lab || engineOn ? 'flight' : 'ground';
  // strona główna usterzenia: lotki skrzydeł też biorą udział w sterowaniu – wyróżnione kolorem osi przechylania
  const tailHome = focus === 'tail' && !ctl;
  const hilite = cs ? cs.hilite : tailHome ? { aileron: C_ROLL, spoiler: C_ROLL } : null;
  // strona główna usterzenia: wszystkie elementy (także lotki i spojlery) można kliknąć
  const [tsel, setTsel] = useState<string | null>(null);
  const [wsel, setWsel] = useState<string | null>(null);
  // strona główna podwozia: podpisy części są klikalne
  const gearHome = focus === 'gear' && !params.gear;
  const [gsel, setGsel] = useState<string | null>(null);
  return (
    <>
      <Lights />
      <directionalLight position={[-30, 40, 30]} intensity={0.9} />
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
          clip={tgt.clip}
          // dobieg po lądowaniu: klapy i sloty w konfiguracji do lądowania
          mech={landTab ? { flap: 32, fowler: 1, slat: 1 } : tgt.mech}
          interactive={!lab && !ctl}
          // odnośniki do innych modułów tylko na stronie głównej modułu – w zakładkach podwozia (i innych) ich nie ma
          links={!gearMode}
          partLabels={!lab && !ctl}
          // na wycinkach skrzydła bez owiewek prowadnic klap – czysty przekrój profilu
          wingPick={wingHome ? { selected: wsel, onSelect: setWsel } : tailHome ? { selected: tsel, onSelect: setTsel } : undefined}
          // zakładki aerodynamiki to lot: podwozie schowane, silniki pracują
          inFlight={phase === 'flight'}
          surfaces={landTab ? gearDrv.surf : lab || ctl ? pose.surf : undefined}
          // na wycinkach skrzydła: bez owiewek klap i usterzenia (statecznik poziomy wpadałby w zakres wycinka)
          layers={lab ? { ground: false, canoes: !isSliceMode(lab) || Boolean(params.wide), tail: !isSliceMode(lab) } : gearMode === 'retract' || landTab || (cs && cs.flight) ? { ground: false } : undefined}
          gear={gearMode ? gearDrv.drive : undefined}
          // reflektory lądowania tylko w czasie animacji lądowania (nie na postoju ustawianym suwakiem)
          landingLights={landTab && (gearMode0 === 'shock' ? params.land !== false : gearMode0 === 'brakes' ? params.run !== false : true)}
          enginePower={gearMode ? gearDrv.power : undefined}
          gearPick={gearHome ? { selected: gsel, onSelect: setGsel } : undefined}
        />
      </FollowPlane>
      {lab && <WingLab mode={lab} params={params} pose={pose} />}
      {ctl && <TailLab mode={ctl} params={params} pose={pose} direct={direct} />}
      {wingHome && <WingInfo sel={wsel} />}
      {tailHome && <TailInfo sel={tsel} />}
      {gearHome && <GearInfo sel={gsel} />}
      {gearMode && <GearLab mode={gearMode} params={params} live={gearDrv.live} pose={pose} />}
      {engineOn && eng.info}
    </>
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
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <Lights />
      <EngineOnPlane n1={0} n2={0} cut={false} flow={false} labels={false} clickable={[]} accessories={false} wingOpen wingLabels wingPick={{ selected: sel, onSelect: setSel }} />
      <WingInfo sel={sel} />
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
          To <b>Airbus A350-1000</b> – największa wersja rodziny A350, dwusilnikowy samolot szerokokadłubowy dalekiego zasięgu. Ma <b>73,79 m</b> długości, <b>64,75 m</b> rozpiętości i <b>17,08 m</b> wysokości. W typowym układzie dwuklasowym zabiera <b>350–410 pasażerów</b> (maksymalnie 480) na trasy do ok. <b>16 100 km</b>, a waży na starcie do <b>319 t</b> (w odmianie o zwiększonej masie – 322 t).
        </p>
        <p>
          Ok. 53% masy jego konstrukcji to <b>kompozyty z włókna węglowego</b> – z nich są poszycie kadłuba, skrzydła i usterzenie. Są lżejsze od aluminium i nie korodują, więc samolot zużywa mniej paliwa. Od krótszego A350-900 różni się kadłubem dłuższym o 7 m, skrzydłem z przedłużoną krawędzią spływu (464 m²), sześciokołowymi wózkami podwozia głównego i mocniejszymi silnikami.
        </p>
        <p>
          W kolejnych krokach spokojnie obejdziemy samolot dookoła. W każdej chwili możesz też <b>kliknąć podzespół</b> na modelu – otworzy się jego moduł z własnymi zakładkami, a wtedy dopiero on się „otworzy”: pokaże przekrój, podpisy i zacznie działać.
        </p>
      </>
    ),
  }),
  plane({
    title: 'Kadłub',
    camera: [-30, 9, 34],
    target: [-9, 0, 0],
    preset: { highlight: 'fuselage' },
    body: (
      <>
        <p>
          <b>Kadłub</b> to hermetyczna rura o średnicy prawie 6 m. W locie na wysokości 12 km w środku utrzymuje się ciśnienie jak na wysokości ok. 1800 m – kadłub jest więc jak napompowany balon, który przy każdym locie lekko się rozszerza i kurczy.
        </p>
        <p>
          Z przodu ma <b>kokpit</b> z charakterystyczną czarną „maską” okien, wzdłuż burt – rzędy dużych okien i cztery pary drzwi. Pod podłogą kabiny są luki bagażowe, a pod skrzydłem duża <b>owiewka centropłata</b>, w której mieszczą się keson łączący skrzydła i wnęki podwozia.
        </p>
        <p>
          <Open id="kadlub">Otwórz moduł: kadłub</Open>
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
          <b>Skrzydła</b> mają skos ok. 32° i wznios ok. 5°, a na końcach zagięte do góry <b>winglety</b>, które osłabiają wiry brzegowe. W locie nad skrzydłem ciśnienie jest niższe niż pod nim – ta różnica niesie cały samolot.
        </p>
        <p>
          Krawędź natarcia i krawędź spływu są ruchome: <b>sloty</b>, <b>klapy</b>, <b>lotki</b> i <b>spojlery</b> zmieniają kształt skrzydła do startu, lądowania i skrętów. W środku skrzydła, między dwoma dźwigarami, jest keson, który jest zarazem <b>zbiornikiem paliwa</b>.
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
          Samolot ma dwa <b>silniki</b> Rolls-Royce Trent XWB-97 – turbowentylatory o średnicy wentylatora 3 m i ciągu startowym ok. 431 kN (97 000 lbf) każdy. Wiszą na <b>pylonach</b> pod skrzydłami, przed krawędzią natarcia, żeby gorące spaliny nie trafiały w klapy.
        </p>
        <p>Większość ciągu daje zimne powietrze przepychane przez wielki wentylator obok rdzenia – to on sprawia, że współczesne silniki są ciche i oszczędne.</p>
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
          Na końcu kadłuba jest <b>usterzenie</b>: pionowy statecznik ze sterem kierunku i poziomy statecznik ze sterami wysokości. Stateczniki działają jak lotki strzały – same z siebie ustawiają samolot w kierunku lotu.
        </p>
        <p>
          Cały poziomy statecznik da się powoli przestawiać (trymować), żeby samolot leciał w równowadze bez ciągłego trzymania steru.
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
          W stożku ogonowym, za grodzią ogniową, pracuje <b>APU</b> (Auxiliary Power Unit) – mała turbina gazowa. Na ziemi daje prąd i sprężone powietrze do klimatyzacji oraz rozruchu silników, gdy samolot nie jest podłączony do zasilania z lotniska. Jej wylot widać na samym końcu kadłuba.
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
          Samolot stoi na trzech goleniach: <b>przedniej</b> z dwoma kołami (sterowanej z kokpitu) i dwóch <b>głównych</b> pod skrzydłami. W wersji -1000 każda goleń główna ma <b>sześciokołowy wózek</b> (trzy osie) – tak rozkłada się większy ciężar samolotu. Koła główne mają hamulce węglowe, które przy lądowaniu nagrzewają się do kilkuset stopni.
        </p>
        <p>Po starcie podwozie chowa się do wnęk w kadłubie i owiewce centropłata.</p>
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
  summary: 'Turbowentylator od środka: ciąg, sprężarka, spalanie, turbina, rewers, awarie',
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
            Lewy silnik ożył: gondola jest przecięta, a wały się kręcą. To <b>turbowentylator</b> – silnik jak w niemal każdym współczesnym samolocie pasażerskim. Obróć model, zajrzyj do środka przez wycięcie i <b>kliknij</b> dowolną część albo jej podpis, aby przeczytać opis.
          </p>
          <p>
            Wentylator zasysa ogromną strugę powietrza: większość omija rdzeń kanałem obejściowym, a mała część przechodzi przez sprężarki, komorę spalania i turbiny. Silnik wisi na <b>pylonie</b>, który przenosi ciąg i ciężar na dźwigary skrzydła.
          </p>
          <p>
            Naciśnij <b>„Rozłóż silnik”</b>: gondola razem z pylonem i całym samolotem unosi się, a moduły rozsuwają się wzdłuż osi. Kliknij wtedy moduł – rozłoży się dalej na wieńce łopatek, wtryskiwacze czy świece, i każdy z nich też da się kliknąć.
          </p>
          <p>
            Silnik ma dwa niezależne wały: <b>N1</b> (wentylator + sprężarka i turbina NP) i <b>N2</b> (sprężarka i turbina WP). Jasna łopatka na każdym wirniku pokazuje, że N2 kręci się szybciej niż N1, a spirala na kołpaku pozwala obsłudze na lotnisku zobaczyć, czy wentylator się obraca.
          </p>
          <p>W zakładce „Turbowentylator w 3D” dostaniesz pełny zestaw suwaków: ciąg, średnicę wentylatora, przekrój, rentgen. Dalej zostaje już tylko silnik z pylonem i kawałkiem skrzydła.</p>
        </>
      ),
    }),
    ...jetEngine.steps.map(atEngine).map(withSpot),
  ],
};

const wingModule: PartModule = {
  id: 'skrzydlo',
  title: 'Skrzydło',
  summary: 'Keson, paliwo, mechanizacja oraz aerodynamika: siła nośna, opływ, przeciągnięcie',
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
            Z lewego skrzydła zdjęliśmy część górnego poszycia. Pod nim widać <b>keson</b>: dwa dźwigary (przedni i tylny) połączone żebrami, a od środka poszycie usztywniają podłużnice. Keson jest szczelny i wypełniony <b>paliwem</b> – A350-1000 mieści go ok. 159 000 litrów, głównie w skrzydłach.
          </p>
          <p>
            Mechanizacja pracuje w pętli: najpierw <b>klapy</b> wysuwają się do tyłu i w dół, a <b>sloty</b> do przodu – tak skrzydło przygotowuje się do lądowania. Potem wychylają się <b>lotki</b> (przechylanie), a na końcu podnoszą się <b>spojlery</b> (hamowanie aerodynamiczne).
          </p>
          <p>W kolejnych zakładkach zobaczysz konstrukcję z bliska, a potem aerodynamikę: skąd bierze się siła nośna i kiedy skrzydło przestaje nieść.</p>
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
            To kawałek tego samego skrzydła, wyrwany nad silnikiem. Górne poszycie zdjęto, żeby było widać <b>dźwigary</b>, <b>żebra</b>, <b>podłużnice</b> i <b>paliwo</b> w kesonie.
          </p>
          <p>Zwróć uwagę na szczeliny przy slotach i klapach, na spojlery nad klapami oraz na „kajaki” pod krawędzią spływu, w których kryją się prowadnice klap.</p>
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
  summary: 'Stateczniki, stery i lotki, trzy osie lotu, stateczność, masa i wyważenie',
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
            Najpierw wychyla się <b>ster kierunku</b> – obraca nos samolotu w lewo i w prawo (odchylanie). Potem pracują <b>stery wysokości</b> – podnoszą albo opuszczają nos (pochylanie).
          </p>
          <p>
            <b>Statecznik poziomy</b> jest przestawiany w całości: śruba napędzana silnikami powoli zmienia jego kąt, żeby samolot leciał w równowadze bez ciągłego trzymania steru.          </p>
          <p>
            Usterzenie nie steruje samolotem samo: trzecią oś obsługują {tailColor(C_ROLL, 'lotki')} na końcach skrzydeł, wspomagane przez spojlery (podświetlone na czerwono) – na końcu cyklu widać, jak przechylają samolot. Kliknij dowolny element albo jego podpis: także siłowniki i śrubę trymera, które są w środku i pokazujemy je prześwietlone. W następnych zakładkach: trzy osie lotu, lotki, równowaga momentów, stateczność oraz masa i wyważenie.
          </p>
        </>
      ),
    }),
    ctlStep('axes', {
      title: 'Trzy osie i trzy stery',
      camera: [64, 26, 52],
      target: [2, 0, 0],
      controls: [
        { type: 'slider', key: 'ail', label: 'Wolant: lewo ↔ prawo (lotki)', min: -1, max: 1, step: 0.05, default: 0.5, decimals: 2 },
        { type: 'slider', key: 'elev', label: 'Wolant: od siebie ↔ do siebie (ster wysokości)', min: -1, max: 1, step: 0.05, default: 0, decimals: 2 },
        { type: 'slider', key: 'rud', label: 'Pedały: lewy ↔ prawy (ster kierunku)', min: -1, max: 1, step: 0.05, default: 0, decimals: 2 },
        { type: 'toggle', key: 'respond', label: 'Samolot reaguje', default: true },
        { type: 'toggle', key: 'forces', label: 'Siły na sterach', default: true },
        { type: 'toggle', key: 'labels', label: 'Podpisy osi', default: true },
      ],
      body: (
        <>
          <p>
            Samolot obraca się wokół trzech osi, które przecinają się w <strong>środku ciężkości</strong>. Każdą z nich steruje inna powierzchnia – na modelu podświetlona kolorem swojej osi:
          </p>
          <p>
            {tailColor(C_ROLL, 'lotki')} na końcach skrzydeł – <strong>przechylenie</strong> wokół osi podłużnej, {tailColor(C_PITCH, 'ster wysokości')} na stateczniku poziomym – <strong>pochylenie</strong> wokół osi poprzecznej, {tailColor(C_YAW, 'ster kierunku')} na stateczniku pionowym – <strong>odchylenie</strong> wokół osi pionowej.
          </p>
          <p>
            Zasada jest zawsze ta sama: wychylona powierzchnia zmienia wygięcie profilu, a więc siłę nośną fragmentu skrzydła lub usterzenia. Mała siła na długim ramieniu daje duży moment obrotowy. Lotki działają przeciwsobnie – jedna idzie w dół, druga w górę. W A350 pilot nie porusza sterów bezpośrednio: boczny drążek (sidestick) wysyła polecenie do komputerów, a te wychylają stery siłownikami hydraulicznymi (fly-by-wire).
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
            Żeby skręcić, samolot musi się <strong>przechylić</strong> – wtedy siła nośna ma składową poziomą. Pilot wychyla więc {tailColor(C_ROLL, 'lotki')}: skrzydło z opuszczoną lotką unosi się, a to z podniesioną opada.
          </p>
          <p>
            Haczyk: więcej siły nośnej to także więcej <strong>oporu indukowanego</strong>. Unoszące się skrzydło jest hamowane (pomarańczowe strzałki), więc nos ucieka w stronę <em>przeciwną</em> do zamierzonego zakrętu – widać to względem przerywanej linii kierunku lotu. To <strong>odchylenie niekorzystne</strong> (adverse yaw).
          </p>
          <p>
            Konstruktorzy łagodzą je lotkami różnicowymi i spojlerami, a ster kierunku wychyla się w stronę zakrętu. Kontrolą jest <strong>kulka</strong> wskaźnika ślizgu: gdy wypada ze środka, samolot leci lekko bokiem. Żółta nitka na nosie pokazuje napływ – jak „yaw string” na szybowcach.
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
            W locie ustalonym wszystkie siły i <strong>momenty</strong> muszą się równoważyć. Ciężar działa w środku ciężkości, siła nośna skrzydła – w jego <strong>środku aerodynamicznym</strong> (ok. 25% średniej cięciwy aerodynamicznej, SCA), a wygięty profil dodatkowo „kręci” nosem w dół.
          </p>
          <p>
            Resztę wyrównuje {tailColor(C_PITCH, 'usterzenie poziome')} na długim ramieniu. W typowym samolocie dociska ono ogon <strong>w dół</strong> – skrzydło niesie wtedy nieco więcej niż ciężar samolotu. Im bardziej z przodu środek ciężkości, tym większy docisk i większy opór wyważenia.
          </p>
          <p>
            Kluczowy jest <strong>punkt neutralny</strong> (fioletowy trójkąt na belce SCA pod samolotem): dopóki środek ciężkości leży przed nim, wzrost kąta natarcia wywołuje moment pochylający nos w dół. Odległość między nimi to <strong>zapas stateczności statycznej</strong>. Przesuń suwak za punkt neutralny i zobacz, co dzieje się z wykresem.
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
        { type: 'toggle', key: 'fbw', label: 'Stabilizacja komputerowa (fly-by-wire)', default: false },
      ],
      body: (
        <>
          <p>
            Stateczność statyczna mówi, w którą stronę zadziała moment po wytrąceniu. <strong>Stateczność dynamiczna</strong> – jak samolot dojdzie do równowagi: gasnącymi wahaniami, płynnie czy wcale.
          </p>
          <p>
            Co kilka sekund samolot wpada w <strong>podmuch wznoszący</strong> – smugi powietrza uderzają w niego od dołu. Przy środku ciężkości z przodu wraca szybko i sztywno. Gdy przesuwasz go do tyłu, wahania stają się wolniejsze i słabiej tłumione, a za punktem neutralnym (48%) wytrącenie <strong>rośnie wykładniczo</strong>. Ten sam ruch widać na sztucznym horyzoncie w kokpicie.
          </p>
          <p>
            Myśliwce, np. F-16, celowo projektuje się jako niestateczne – są wtedy zwrotniejsze. Lecą tylko dzięki komputerowi, który dziesiątki razy na sekundę wychyla stery. Włącz <strong>fly-by-wire</strong>: {tailColor('#c084fc', 'ster wysokości')} zacznie pracować sam.
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
            Samolot wytrącony z równowagi wraca do niej dwoma ruchami. <strong>Oscylacja krótkookresowa</strong> – szybkie kiwanie nosem po podmuchu – gaśnie w kilka sekund. Drugi ruch, <strong>fugoida</strong>, jest bardzo powolny: jeden cykl trwa minutę albo dłużej. Kąt natarcia prawie się w nim nie zmienia – zmieniają się prędkość i wysokość.
          </p>
          <p>
            Co jakiś czas samolot dostaje lekkiego „kopniaka”, np. od podmuchu wiatru z przodu. Z nadwyżką prędkości ma nadmiar siły nośnej i łagodnie się wznosi. Wspinając się, zwalnia, siła nośna maleje, więc tor wygina się w dół i samolot schodzi, znów nabierając prędkości – i tak w kółko. Na <strong>szczycie</strong> fali leci najwolniej, w <strong>dołku</strong> najszybciej. Energia przelewa się między <strong>kinetyczną</strong> a <strong>potencjalną</strong> jak w wahadle. Za samolotem rysuje się jego tor – w pionie powiększony, bo prawdziwe wahania to kilkadziesiąt metrów na kilometrach drogi.
          </p>
          <p>
            Okres zależy niemal tylko od prędkości (ok. 0,45 s na każdy m/s), a tłumienie od doskonałości – szybowiec o L/D = 40 waha się długo, cegła z L/D = 4 – krótko. Fugoida jest tak powolna, że pilot koryguje ją odruchowo, a w A350 autopilot i system sterowania tłumią ją, zanim pasażerowie cokolwiek poczują. Na sztucznym horyzoncie i taśmach prędkości i wysokości w kokpicie widać, jak delikatny to ruch.
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
            Samolot sam wraca do lotu prostego po zaburzeniu dzięki dwóm mechanizmom. Każdy pokazuje osobne doświadczenie – przełączasz je u góry ustawień. Co 8 s podmuch wytrąca samolot, a wykres w ramce pokazuje, czy i jak szybko wraca.
          </p>
          <p>
            <strong>Przechylenie – wznios</strong> (widok od tyłu). Gdy podmuch przechyli samolot, siła nośna odchyla się od pionu i samolot zaczyna zsuwać się w stronę opuszczonego skrzydła – powstaje <strong>ślizg</strong>, a powietrze napływa z boku (smugi płyną z ukosa). Przy <strong>wzniosie</strong> (skrzydła uniesione w literę V) ten boczny napływ zwiększa kąt natarcia opuszczonego skrzydła, a uniesionemu go zmniejsza. Opuszczone skrzydło niesie więcej i samolot sam się poziomuje. Ustaw wznios ujemny albo zmień położenie skrzydła: górnopłat dokłada efekt wahadła (ok. +3°), dolnopłat go osłabia – dlatego dolnopłaty jak A350 mają wyraźny wznios, a duże górnopłaty, np. transportowce, wręcz ujemny.
          </p>
          <p>
            <strong>Odchylenie – {tailColor(C_YAW, 'statecznik pionowy')}</strong> (widok z góry). Gdy podmuch obróci nos, powietrze napływa na samolot z ukosa. Statecznik, daleko za środkiem ciężkości, dostaje siłę boczną, która obraca nos z powrotem pod wiatr – jak lotka strzały (efekt wiatrowskazu). Przód kadłuba działa odwrotnie i obraca nos dalej. Zmniejsz statecznik poniżej ok. 0,35 – kadłub przeważy i samolot ustawi się bokiem.
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
            Wszystko, co mówiliśmy o stateczności, zależy od położenia <strong>środka ciężkości</strong>. Dlatego przed każdym lotem powstaje <strong>arkusz załadunkowy</strong>: suma mas i momentów (masa × ramię od punktu odniesienia) daje masę i położenie SC. Pasażerów (kropki) i ładunek w lukach widać „prześwietlone” przez poszycie.
          </p>
          <p>
            Punkt musi leżeć w <strong>obwiedni</strong>. Przednia granica wynika z siły sterów (przy lądowaniu trzeba zadrzeć nos), tylna – ze stateczności. Sprawdzamy dwa stany: bez paliwa (ZFW) i na starcie (TOW), bo paliwo się spala.
          </p>
          <p>
            Spróbuj posadzić wszystkich z tyłu przy pustym przednim luku. Właśnie dlatego w pustawym samolocie załoga czasem prosi o przesiadkę, a z wyważenia wynika też ustawienie <strong>trymera</strong> statecznika poziomego do startu.
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

const fuselageModule: PartModule = {
  id: 'kadlub',
  title: 'Kadłub',
  summary: 'Kokpit, kabina, luki bagażowe, centropłat i gródź ciśnieniowa',
  steps: [
    plane({
      title: 'Kadłub od środka',
      camera: [-18, 14, 30],
      target: [-4, -0.5, 0],
      preset: { focus: 'fuselage' },
      body: (
        <>
          <p>
            W lewej burcie zrobiliśmy wyrwę od drzwi 2 do drzwi 3. Widać <b>wręgi</b> – poprzeczne pierścienie co ok. 60 cm – i wykładzinę kabiny. Z przodu jest <b>klasa biznes</b> z fotelami rozkładanymi w łóżka (1-2-1), dalej <b>klasa ekonomiczna</b> w układzie 3-3-3, a nad fotelami schowki na bagaż.
          </p>
          <p>
            Pod podłogą są dwa <b>luki bagażowe</b> – mieszczą razem do 44 kontenerów LD3. Między nimi przez kadłub przechodzi <b>centropłat</b> – keson łączący oba skrzydła – a za nim jest wnęka podwozia głównego. Kabinę od tyłu zamyka kopuła <b>grodzi ciśnieniowej</b>; za nią kadłub nie jest już hermetyczny.
          </p>
          <p>Kolejne zakładki kadłuba – konstrukcja, hermetyzacja, drzwi i kokpit – są w przygotowaniu.</p>
        </>
      ),
    }),
  ],
};

/** APU – osobny moduł; na razie tylko plansza wprowadzająca (zakładki w przygotowaniu). */
const apuModule: PartModule = {
  id: 'apu',
  title: 'APU',
  summary: 'Pomocnicza jednostka napędowa w stożku ogonowym – w przygotowaniu',
  steps: [
    plane({
      title: 'APU w stożku ogonowym',
      camera: [52, 5, 13],
      target: [35, 1.4, 0],
      body: (
        <>
          <p>
            <b>APU</b> (Auxiliary Power Unit) to mała turbina gazowa zamknięta w stożku ogonowym, za grodzią ogniową. Na ziemi zasila samolot prądem i sprężonym powietrzem – do klimatyzacji kabiny i rozruchu silników – bez podłączania go do instalacji lotniska. W razie awarii może też pracować w locie.
          </p>
          <p>Na końcu kadłuba widać jej wylot. Zakładki o budowie i pracy APU są w przygotowaniu.</p>
        </>
      ),
    }),
  ],
};

/**
 * Zalążki kolejnych modułów: po jednej planszy wprowadzającej (kamera na miejscu w samolocie, krótki opis).
 * Zakładki dojdą później – tak jak w APU.
 */
const stubModule = (id: string, title: string, summary: string, camera: [number, number, number], target: [number, number, number], body: ReactNode): PartModule => ({
  id,
  title,
  summary,
  steps: [plane({ title, camera, target, body })],
});
const cockpitModule = stubModule(
  'kokpit',
  'Kokpit',
  'Stanowisko pilotów: boczne drążki, wyświetlacze, FCU i panel górny – w przygotowaniu',
  [-48, 6, 14],
  [-34.5, 1.0, 0],
  <>
    <p>
      <b>Kokpit</b> A350 ma sześć dużych ekranów: przed każdym pilotem PFD i ND, pośrodku dwa ekrany ECAM. Pilot steruje <b>bocznym drążkiem</b> (sidestick) – sygnały idą do komputerów sterowania lotem (fly-by-wire). Nad ekranami jest <b>FCU</b> do autopilota, a nad głowami <b>panel górny</b> z przełącznikami systemów.
    </p>
    <p>Zakładki o kokpicie są w przygotowaniu. Wyświetlacze PFD i ECAM pojawiają się już w innych modułach.</p>
  </>,
);
const radarModule = stubModule(
  'radar',
  'Radar pogodowy',
  'Antena w nosie pod owiewką radaru: chmury burzowe, turbulencje i uskok wiatru – w przygotowaniu',
  [-50, 3, 10],
  [-36.5, 0, 0],
  <>
    <p>
      W samym nosie, pod <b>owiewką radaru</b> (radomem) przepuszczającą fale radiowe, siedzi antena <b>radaru pogodowego</b>. Wykrywa krople wody w chmurach i rysuje je na ekranie ND kolorami: zielony, żółty, czerwony, magenta – im większa intensywność opadu. Ostrzega też przed uskokiem wiatru przy podejściu.
    </p>
    <p>Zakładki o radarze są w przygotowaniu.</p>
  </>,
);
const packsModule = stubModule(
  'klimatyzacja',
  'Klimatyzacja i ciśnienie',
  'Pakiety klimatyzacji, hermetyzacja kabiny i zawór wylotowy – w przygotowaniu',
  [-14, -12, 22],
  [-8, -4, 1],
  <>
    <p>
      W owiewce pod kadłubem, przed skrzydłem, są <b>pakiety klimatyzacji</b>. A350 bierze do nich sprężone powietrze z silników albo z APU, chłodzi je i miesza z powietrzem z kabiny. Kabina jest <b>hermetyzowana</b>: w przelocie ciśnienie odpowiada ok. 1800 m wysokości, a reguluje je <b>zawór wylotowy</b> w tylnej części kadłuba.
    </p>
    <p>Zakładki o klimatyzacji i ciśnieniu są w przygotowaniu.</p>
  </>,
);
const fuelModule = stubModule(
  'paliwo',
  'Układ paliwowy',
  'Zbiorniki w skrzydłach i centropłacie, pompy, przelewanie paliwa i zrzut – w przygotowaniu',
  [-14, 22, 30],
  [2, 0, 12],
  <>
    <p>
      A350-1000 zabiera ok. 125 t paliwa w trzech zbiornikach: w obu <b>skrzydłach</b> i w <b>centropłacie</b>. Każdy silnik zasilają pompy w zbiorniku skrzydłowym, a zawory pozwalają zasilać silnik z drugiej strony. Paliwo chłodzi też olej silnika, a jego rozmieszczenie wpływa na środek ciężkości – widać to w zakładce o masie i wyważeniu w module usterzenia.
    </p>
    <p>Zakładki o układzie paliwowym są w przygotowaniu.</p>
  </>,
);
const lightsModule = stubModule(
  'swiatla',
  'Światła zewnętrzne',
  'Pozycyjne, antykolizyjne, strobo, reflektory lądowania i kołowania – w przygotowaniu',
  [-6, 6, 44],
  [8.6, 1.6, 29],
  <>
    <p>
      Światła <b>pozycyjne</b> świecą w ściśle określonych sektorach: czerwone na lewym skrzydle, zielone na prawym (każde od przodu do 110° w bok) i białe do tyłu. Białe <b>strobo</b> błyskają podwójnie na końcówkach skrzydeł i pojedynczo w ogonie, a czerwone <b>beacony</b> na grzbiecie i pod brzuchem sygnalizują pracujące silniki. Do lądowania i kołowania służą reflektory w krawędzi natarcia przy kadłubie i na goleni przedniej.
    </p>
    <p>Zakładki o światłach są w przygotowaniu.</p>
  </>,
);
const doorsModule = stubModule(
  'drzwi',
  'Drzwi i ewakuacja',
  'Drzwi pasażerskie, zjeżdżalnie awaryjne i ewakuacja w 90 sekund – w przygotowaniu',
  [-38, 2, 20],
  [-30, 0, 3],
  <>
    <p>
      A350-1000 ma po <b>cztery pary drzwi</b> pasażerskich. Każde otwiera się do przodu i na zewnątrz, a w trybie awaryjnym samo wyrzuca i napełnia <b>zjeżdżalnię</b>. Przepisy wymagają, żeby wszyscy pasażerowie mogli opuścić samolot w <b>90 sekund</b>, korzystając tylko z połowy wyjść.
    </p>
    <p>Zakładki o drzwiach i ewakuacji są w przygotowaniu.</p>
  </>,
);

const gearModule: PartModule = {
  id: 'podwozie',
  title: 'Podwozie',
  summary: 'Goleń, amortyzator, wózek sześciokołowy, chowanie, hamulce węglowe i sterowanie na ziemi',
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
            A350-1000 stoi na trzech goleniach. <b>Przednia</b> ma dwa koła i jest sterowana z kokpitu. Dwie <b>główne</b> mają wózki z trzema osiami i sześcioma kołami – tak rozkłada się ciężar samolotu ważącego przy starcie ponad 300 ton, żeby nie niszczył nawierzchni.
          </p>
          <p>
            Na goleni głównej widać <b>cylinder amortyzatora</b> z chromowanym <b>tłoczyskiem</b>, <b>nożyce</b>, składany <b>zastrzał boczny</b> z zamkiem, <b>siłownik</b> ustawiający wózek i przewody hydrauliczne hamulców. W kołach kryją się <b>hamulce węglowe</b>.
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
  title: 'Samolot pasażerski od środka',
  subject: 'lotnictwo',
  summary: 'Airbus A350-1000 w 3D: kadłub, skrzydła, silniki, usterzenie i podwozie. Kliknij podzespół, a otworzy się od środka – z przekrojem, podpisami i własnymi zakładkami.',
  accent: '#0ea5e9',
  glyph: '✈',
  steps: overview,
  modules: [engineModule, wingModule, tailModule, fuselageModule, gearModule, apuModule, cockpitModule, radarModule, packsModule, fuelModule, lightsModule, doorsModule],
};

