/*
 * Airbus A350-1000 – cały samolot w skali 1 j. = 1 m, według danych producenta i rysunków (three-view):
 * długość 73,79 m, rozpiętość 64,75 m, wysokość 17,08 m, kadłub 5,96 × 6,09 m, skos skrzydła ok. 32°,
 * powierzchnia skrzydeł 464,3 m², dwa silniki Rolls-Royce Trent XWB-97 z wentylatorem o średnicy 3,0 m,
 * podwozie główne z wózkami sześciokołowymi.
 *
 * Kadłub jest o 6,99 m dłuższy niż w wersji -900: wstawka 3,5 m przed skrzydłem (między drzwiami 1 i 2)
 * i 3,49 m za nim (między drzwiami 3 i 4). Skrzydło ma przedłużoną krawędź spływu (cięciwa przy kadłubie
 * większa o ok. 0,8 m), co daje 464 m² zamiast 442 m².
 *
 * Układ: x – wzdłuż kadłuba (nos w −x, samolot leci ku −x, jak w modelu silnika), y – w górę (0 – oś kadłuba),
 * z – rozpiętość (+z – lewe skrzydło). Ziemia na y = −6,13.
 *
 * Model pokazuje się w całości; podzespół wybrany w danym kroku („focus”) przeobraża się: silnik zostaje
 * przecięty i rusza, skrzydło odsłania keson i porusza mechanizacją, kadłub odsłania kabinę i luki.
 */
import { Suspense, createContext, lazy, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Environment, Html, Lightformer, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useModuleHome, useSceneHidden, useTopicNav } from '../../lib/topicNav';
import { EngineModel, type EngineModelProps } from './engineModel';
import { AirportModel, STAND } from './runway';
import type { SystemsDrive } from './planeSystems';

/*
 * Podzespoły wbudowane we wnętrze samolotu (kokpit, APU, radar) mają własne moduły z symulacją, które same importują
 * ten plik – dlatego ich wspólny „monter” ładuje się leniwie (bez cyklu importów). Każdy A350 ma je w środku.
 */
const PlaneSystems = lazy(() => import('./planeSystems'));

export type PlanePart = 'fuselage' | 'wing' | 'engine' | 'tail' | 'gear' | 'apu' | 'cockpit' | 'radar' | 'lights' | 'doors';
/** Który moduł tematu otwiera kliknięcie podzespołu (null – moduł w przygotowaniu). */
export const PART_MODULE: Record<PlanePart, string | null> = {
  fuselage: 'kadlub',
  wing: 'skrzydlo',
  engine: 'silnik',
  tail: 'usterzenie',
  gear: 'podwozie',
  apu: 'apu',
  cockpit: 'kokpit',
  radar: 'radar',
  lights: 'swiatla',
  doors: 'drzwi',
};
export const PART_NAME: Record<PlanePart, string> = {
  fuselage: 'kadłub i kabina',
  wing: 'skrzydło',
  engine: 'silnik',
  tail: 'usterzenie',
  gear: 'podwozie',
  apu: 'APU',
  cockpit: 'kokpit',
  radar: 'radar pogodowy',
  lights: 'światła',
  doors: 'drzwi',
};

const GROUND = -6.13;
type V3 = [number, number, number];

/* ================= materiały ================= */

/** Poświata podzespołu (najechanie, wyróżnienie w kroku) – dziedziczona przez wszystkie jego materiały. */
const GlowCtx = createContext(0);
/** Kolor poświaty (domyślnie błękitny; powierzchnie sterowe wyróżnione w scenie – kolorem swojej osi). */
const GlowColorCtx = createContext('#7dd3fc');
/**
 * Elementy wyróżnione przez scenę (np. lotki, ster wysokości i ster kierunku w zakładkach sterowania):
 * identyfikator części (ten sam co przy klikaniu) → kolor poświaty.
 */
const HiliteCtx = createContext<Record<string, string> | null>(null);

const MATS: Record<string, { color: string; metal: number; rough: number; clear?: number }> = {
  paint: { color: '#eef1f4', metal: 0.05, rough: 0.32, clear: 0.6 },
  wing: { color: '#d7dce2', metal: 0.12, rough: 0.38, clear: 0.35 },
  panel: { color: '#cdd3da', metal: 0.12, rough: 0.4, clear: 0.3 },
  belly: { color: '#d6dadf', metal: 0.08, rough: 0.42, clear: 0.3 },
  seam: { color: '#3b4148', metal: 0.2, rough: 0.6 },
  cove: { color: '#4b535c', metal: 0.3, rough: 0.75 },
  glass: { color: '#0b1016', metal: 0.6, rough: 0.07, clear: 1 },
  // okna kabiny z zewnątrz: szyba przyciemniana (granat z szarością) z mocnym połyskiem i jej głębia
  winGlass: { color: '#2a3a4c', metal: 0.55, rough: 0.04, clear: 1 },
  winDeep: { color: '#121a24', metal: 0.4, rough: 0.08, clear: 1 },
  primer: { color: '#9cb87e', metal: 0.25, rough: 0.6 },
  steel: { color: '#a4adb7', metal: 0.9, rough: 0.3 },
  // chromowane tłoczyska amortyzatorów: jasne, gładkie (odcinają się od szarej goleni nawet przy ciemnym tle)
  chrome: { color: '#e6ebf0', metal: 0.7, rough: 0.14, clear: 0.6 },
  dark: { color: '#3d434b', metal: 0.5, rough: 0.45 },
  tyre: { color: '#1b1e22', metal: 0, rough: 0.85 },
  liner: { color: '#ece6da', metal: 0, rough: 0.75 },
  carpet: { color: '#56606e', metal: 0, rough: 0.9 },
  seatY: { color: '#2c4f86', metal: 0, rough: 0.8 },
  seatJ: { color: '#7a5b48', metal: 0, rough: 0.7 },
  bin: { color: '#f1ede4', metal: 0, rough: 0.55 },
  can: { color: '#b8bec6', metal: 0.7, rough: 0.4 },
  lead: { color: '#c96b3c', metal: 0.4, rough: 0.5 },
  fuel: { color: '#f5b041', metal: 0, rough: 0.15 },
};

/*
 * Przycinanie: ten sam model samolotu pokazuje się w scenach podzespołów tylko we fragmencie (np. kawałek
 * skrzydła nad silnikiem). Fragmenty poza zakresem rozpiętości z0…z1 są odrzucane w shaderze, a granica jest
 * poszarpana (szum zależny od położenia), więc wygląda jak wyrwany kawałek konstrukcji.
 */
/**
 * Uniformy przycinania. `id` jest nowy przy każdym włączeniu przycinania: wchodzi do klucza programu shadera, więc
 * materiał kompiluje się na nowo i wiąże świeże uniformy – inaczej three.js użyłby programu skompilowanego z
 * poprzednim obiektem i część brył zostałaby przycięta według starej, „zamrożonej” granicy.
 */
type ClipUniforms = { id: number; uInv: { value: THREE.Matrix4 }; uClip: { value: THREE.Vector3 } };
let clipSeq = 0;
const ClipCtx = createContext<ClipUniforms | null>(null);
const CLIP_GLSL = `
uniform vec3 uClip;
varying vec3 vPlane;
float clipH(float p) { return fract(sin(p * 127.1 + 311.7) * 43758.5453); }
float clipN(float p) { float i = floor(p); return mix(clipH(i), clipH(i + 1.0), fract(p)); }
`;
/**
 * `cap` – bryła wygląda na pełną: przez przecięcie widać jej tylne ściany od środka, więc rysujemy je płaskim,
 * przyciemnionym kolorem bryły (jak zamalowany przekrój). Wymaga materiału dwustronnego.
 */
function clipShader(u: ClipUniforms, cap = false) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    if (cap) sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>', 'if (!gl_FrontFacing) gl_FragColor.rgb = diffuseColor.rgb * 0.55;\n#include <tonemapping_fragment>');
    sh.uniforms.uInv = u.uInv;
    sh.uniforms.uClip = u.uClip;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uInv;\nvarying vec3 vPlane;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 cp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cp = instanceMatrix * cp;
        #endif
        vPlane = (uInv * modelMatrix * cp).xyz;
      }`,
    );
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${CLIP_GLSL}`).replace(
      'void main() {',
      `void main() {
        float ja = uClip.z * (0.7 * clipN(vPlane.x * 1.3) + 0.3 * clipN(vPlane.y * 2.1 + 5.0));
        float jb = uClip.z * (0.7 * clipN(vPlane.x * 1.3 + 17.0) + 0.3 * clipN(vPlane.y * 2.1 + 9.0));
        if (vPlane.z < uClip.x + ja || vPlane.z > uClip.y - jb) discard;`,
    );
  };
}

function M({ k, side = THREE.FrontSide, opacity = 1, color, emit, matRef, cap = false }: { k: keyof typeof MATS | string; side?: THREE.Side; opacity?: number; color?: string; emit?: string; matRef?: React.Ref<THREE.MeshPhysicalMaterial>; cap?: boolean }) {
  const glow = useContext(GlowCtx);
  const glowColor = useContext(GlowColorCtx);
  const clip = useContext(ClipCtx);
  // bez przekroju też podajemy funkcje (no-op i stały klucz): wartość undefined nadpisałaby metody three.js
  // i po przełączeniu z widoku z przekrojem renderowanie przerwałoby się błędem
  const onCompile = useMemo(() => (clip ? clipShader(clip, cap) : () => {}), [clip, cap]);
  const m = MATS[k] ?? { color: k, metal: 0.2, rough: 0.5 };
  return (
    <meshPhysicalMaterial
      ref={matRef}
      onBeforeCompile={onCompile}
      customProgramCacheKey={clip ? () => `plane-clip-${clip.id}${cap ? '-cap' : ''}` : () => 'plane'}
      color={color ?? m.color}
      metalness={m.metal}
      roughness={m.rough}
      clearcoat={m.clear ?? 0}
      clearcoatRoughness={0.2}
      envMapIntensity={1.05}
      side={side}
      transparent={opacity < 1}
      opacity={opacity}
      depthWrite={opacity >= 1}
      emissive={emit ?? (glow > 0 ? glowColor : '#000000')}
      emissiveIntensity={emit ? 1.6 : glow}
    />
  );
}

/* ================= światła zewnętrzne ================= */

/** Miękka poświata świateł (sprite addytywny) – wspólna tekstura. */
let haloTex: THREE.CanvasTexture | null = null;
function getHalo() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}
/** Błysk strobo: ostry, oślepiający rdzeń, dwa cienkie promienie i słaba poświata – inny niż miękka poświata świateł pozycyjnych. */
let starTex: THREE.CanvasTexture | null = null;
function getStar() {
  if (starTex) return starTex;
  const S = 128;
  const h = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const core = x.createRadialGradient(h, h, 0, h, h, h);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.07, 'rgba(255,255,255,1)');
  core.addColorStop(0.16, 'rgba(255,255,255,0.35)');
  core.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = core;
  x.fillRect(0, 0, S, S);
  // promienie: poziomy dłuższy (jak na nocnych zdjęciach), pionowy krótszy
  x.globalCompositeOperation = 'lighter';
  for (const [horiz, len] of [
    [true, 1],
    [false, 0.6],
  ] as const) {
    const g = horiz ? x.createLinearGradient(h - h * len, 0, h + h * len, 0) : x.createLinearGradient(0, h - h * len, 0, h + h * len);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    if (horiz) x.fillRect(h - h * len, h - 1.5, 2 * h * len, 3);
    else x.fillRect(h - 1.5, h - h * len, 3, 2 * h * len);
  }
  starTex = new THREE.CanvasTexture(c);
  return starTex;
}

/**
 * Sektor świecenia w płaszczyźnie poziomej samolotu: środek c i połowa szerokości h w stopniach, kąt mierzony od
 * nosa (0°) w stronę lewego skrzydła (+90°), tył = 180°. Prawe skrzydło jest lustrzanym odbiciem (scale z = −1),
 * więc ten sam sektor „w lewo” po prawej stronie świeci w prawo. Jak w przepisach: pozycyjne lewe/prawe 0–110°,
 * tylne białe 140° do tyłu.
 */
export type LampSector = { c: number; h: number; v?: number; vh?: number };
/**
 * Wzory migania (jak w Airbusach, czasy w sekundach):
 * – beacon – czerwone światło antykolizyjne: pojedynczy błysk LED raz na sekundę (ok. 60/min), szybkie narastanie
 *   i wygaszanie; górne i dolne błyskają razem,
 * – strobe – białe strobo na końcówkach skrzydeł: podwójny, bardzo krótki błysk co ok. 1,1 s,
 * – strobe1 – strobo w stożku ogonowym: pojedynczy błysk, zgrany z pierwszym błyskiem skrzydeł.
 */
export type Blink = 'beacon' | 'strobe' | 'strobe1';
const BLINK_T: Record<Blink, number> = { beacon: 1.0, strobe: 1.1, strobe1: 1.1 };

/**
 * Stan świateł zewnętrznych podawany przez moduł świateł (obiekt zmieniany co klatkę, bez przerysowania Reacta).
 * Z nim każda lampa świeci według swojego przełącznika, a reflektory, beacony i strobo naprawdę oświetlają samolot
 * i ziemię (źródła światła w scenie). Bez niego lampy zachowują się jak dotąd (zależnie od fazy lotu).
 */
export type ExtLights = { nav: boolean; logo: boolean; beacon: boolean; strobe: boolean; land: boolean; taxi: boolean; to: boolean; turnoff: boolean; wing: boolean; night?: boolean };
export type ExtLt = Exclude<keyof ExtLights, 'night'>;
export const newExtLights = (night = false): ExtLights => ({ nav: false, logo: false, beacon: false, strobe: false, land: false, taxi: false, to: false, turnoff: false, wing: false, night });
export const ExtLtCtx = createContext<ExtLights | null>(null);
/**
 * Najjaśniejszy poziom błysku między dwiema klatkami (t0…t1). Błysk strobo trwa ok. 0,04 s – przy mniejszej liczbie
 * klatek na sekundę mógłby wypaść między klatkami i lampa mrugałaby nieregularnie. Tak każdy błysk jest widoczny
 * w co najmniej jednej klatce, a rytm (beacon 60/min, strobo 2 błyski co 1,1 s) zostaje zachowany.
 */
export function blinkPeak(b: Blink, t0: number, t1: number) {
  const a = Math.max(t0, t1 - 0.25);
  if (t1 - a <= 0.012) return blinkLevel(b, t1);
  let m = 0;
  for (let t = t1; t > a; t -= 0.008) m = Math.max(m, blinkLevel(b, t));
  return m;
}
export function blinkLevel(b: Blink, time: number) {
  const t = time % BLINK_T[b];
  if (b === 'beacon') return t < 0.03 ? t / 0.03 : Math.max(0, Math.exp(-(t - 0.03) / 0.06) - 0.02);
  const pulse = (a: number) => (t >= a && t < a + 0.04 ? 1 : 0);
  return b === 'strobe' ? Math.max(pulse(0), pulse(0.13)) : pulse(0);
}
const SEC_EDGE = 8; // miękkie przejście na granicy sektora (stopnie)

/**
 * Światło zewnętrzne wbudowane w poszycie: płaska, lekko wypukła soczewka (jak szkło lampy) w ciemnej oprawce,
 * ustawiona wzdłuż normalnej `n` powierzchni, i poświata wysunięta przed soczewkę. `blink` – wzór migania
 * (beacon: dwa szybkie czerwone błyski, strobo: krótki biały błysk); bez wzoru świeci stale. `on = false` –
 * lampa zgaszona (np. światła lądowania na ziemi). Poświata znika w przyciętych fragmentach.
 */
const _lampZ = new THREE.Vector3(0, 0, 1);
/**
 * Stożek wiązki reflektora: wierzchołek w lampie, oś wzdłuż +z. Jasność zapisana w kolorach wierzchołków – pełna
 * przy lampie, zanikająca do zera na końcu (przy mieszaniu addytywnym czerń nic nie dodaje), więc nie widać ani
 * krawędzi podstawy, ani twardego końca wiązki.
 */
const beamGeos = new Map<string, THREE.BufferGeometry>();
function beamGeo(len: number, half: number) {
  const key = `${len}|${half}`;
  const hit = beamGeos.get(key);
  if (hit) return hit;
  // jeden odcinek wzdłuż osi: jasność interpolowana liniowo od lampy do końca – bez pierścieni na granicach odcinków
  const g = new THREE.ConeGeometry(Math.tan(half) * len, len, 32, 1, true);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, len / 2);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getZ(i) / len));
    const k = 1 - t;
    col.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  beamGeos.set(key, g);
  return g;
}
const _beamZ = new THREE.Vector3(0, 0, 1);

function Lamp({ p, n = [0, 1, 0], color, r = 0.09, halo = 1.6, blink, on: onProp = true, isOn, rx = 1, bezel = true, sector, beam, lt }: { p: V3; n?: V3; color: string; r?: number; halo?: number; blink?: Blink; on?: boolean; isOn?: () => boolean; rx?: number; bezel?: boolean; sector?: LampSector; beam?: { len: number; half: number; dir: V3 }; lt?: ExtLt }) {
  const ext = useContext(ExtLtCtx);
  const beamRef = useRef<THREE.Mesh>(null);
  // wiązka ma własny kierunek (oś reflektora), niezależny od ustawienia szkła w poszyciu
  const qb = useMemo(() => (beam ? new THREE.Quaternion().setFromUnitVectors(_beamZ, new THREE.Vector3(...beam.dir).normalize()) : null), [beam?.dir[0], beam?.dir[1], beam?.dir[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useRef<THREE.MeshPhysicalMaterial>(null);
  const spr = useRef<THREE.Sprite>(null);
  const clip = useContext(ClipCtx);
  const grp = useRef<THREE.Group>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(_lampZ, new THREE.Vector3(...n).normalize()), [n[0], n[1], n[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const cam = useMemo(() => new THREE.Vector3(), []);
  const lastT = useRef(-1);
  useFrame(({ clock, camera }) => {
    // włączenie: z właściwości albo z funkcji (stan sceny zmieniany co klatkę, bez przerysowania)
    // moduł świateł: każda lampa według swojego przełącznika
    const on = ext && lt ? ext[lt] : isOn ? isOn() : onProp;
    if (beamRef.current) beamRef.current.visible = on;
    // poświata (sprite) nie podlega przycinaniu w shaderze – chowamy ją, gdy lampa jest poza widocznym fragmentem
    let inside = true;
    if (clip && grp.current) {
      const z = grp.current.getWorldPosition(v).applyMatrix4(clip.uInv.value).z;
      inside = z > clip.uClip.value.x && z < clip.uClip.value.y;
    }
    if (spr.current) spr.current.visible = inside && on;
    if (!on) {
      if (mat.current) mat.current.emissiveIntensity = 0.05;
      return;
    }
    // kierunkowość: jak jasno lampa świeci w stronę kamery (1 w sektorze, 0 poza nim)
    let dirK = 1;
    const par = grp.current?.parent;
    if (sector && par) {
      par.worldToLocal(cam.copy(camera.position));
      const dx = cam.x - p[0];
      const dy = cam.y - p[1];
      const dz = cam.z - p[2];
      const az = (Math.atan2(dz, -dx) * 180) / Math.PI; // 0 = przód, +90 = lewo (w układzie rodzica)
      const off = Math.max(0, Math.abs(((az - sector.c + 540) % 360) - 180) - sector.h);
      dirK = Math.max(0, 1 - off / SEC_EDGE);
      const el = Math.atan2(dy, Math.hypot(dx, dz));
      if (sector.vh !== undefined) {
        // wąska wiązka (reflektory): osobny zakres w pionie wokół kąta v
        const offV = Math.max(0, Math.abs((el * 180) / Math.PI - (sector.v ?? 0)) - sector.vh);
        dirK *= Math.max(0, 1 - offV / SEC_EDGE);
      } else {
        // światła pozycyjne i strobo świecą w pionie szeroko, ale z góry i z dołu nieco słabiej
        dirK *= 0.55 + 0.45 * Math.cos(el);
      }
    }
    const now = clock.elapsedTime;
    const lit = blink ? blinkPeak(blink, lastT.current < 0 ? now : lastT.current, now) : 1;
    lastT.current = now;
    if (mat.current) mat.current.emissiveIntensity = blink ? 0.25 + 2.4 * lit * Math.max(0.3, dirK) : 1.6 * Math.max(0.25, dirK);
    // nocą z daleka (np. z drugiego samolotu) poświata nie maleje poniżej kilkunastu pikseli – jak prawdziwe światło
    if (spr.current && ext?.night && grp.current) {
      const sc = Math.max(halo, camera.position.distanceTo(grp.current.getWorldPosition(v)) * 0.013);
      spr.current.scale.set(sc, sc, 1);
    }
    if (spr.current) {
      (spr.current.material as THREE.SpriteMaterial).opacity = (blink ? lit : 0.85) * dirK;
      spr.current.visible = inside && dirK > 0.01 && (!blink || lit > 0.01);
    }
  });
  return (
    <>
    {/* wiązka reflektora: miękki stożek wzdłuż osi reflektora – widać, że światło jest włączone i dokąd świeci */}
    {beam && qb && (
      <group position={p} quaternion={qb}>
        <mesh ref={beamRef} geometry={beamGeo(beam.len, beam.half)} raycast={() => null} visible={false}>
          <meshBasicMaterial color={color} vertexColors transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>
    )}
    <group ref={grp} position={p} quaternion={q}>
      {/* soczewka: spłaszczona kopułka, w połowie schowana w poszyciu */}
      <mesh scale={[r * rx, r, r * 0.18]} raycast={() => null}>
        <sphereGeometry args={[1, 20, 12]} />
        <M k="glass" color={color} emit={color} matRef={mat} />
      </mesh>
      {/* ciemna oprawka wokół szkła – tylko na płaskim poszyciu (na krzywiźnie wystawałaby półksiężycem) */}
      {bezel && (
        <mesh scale={[r * rx * 1.12, r * 1.12, r * 0.4]} raycast={() => null}>
          <torusGeometry args={[1, 0.09, 6, 24]} />
          <M k="dark" />
        </mesh>
      )}
      <sprite ref={spr} position={[0, 0, r * 0.9]} scale={[halo, halo, 1]} raycast={() => null}>
        <spriteMaterial map={blink === 'strobe' || blink === 'strobe1' ? getStar() : getHalo()} color={blink === 'strobe' || blink === 'strobe1' ? '#eef4ff' : color} transparent opacity={blink ? 0 : 0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
    </group>
    </>
  );
}

/**
 * Prawdziwe źródło światła reflektora (moduł świateł): stożek SpotLight z lampy w kierunku `dir` – oświetla
 * poszycie, pas i drogi kołowania. Zawsze w scenie (zmiana liczby świateł przebudowałaby wszystkie materiały),
 * zgaszone przez jasność 0.
 */
function SpotLamp({ p, dir, lt, angle, dist, power, color = '#fff1d8', penumbra = 0.55 }: { p: V3; dir: V3; lt: ExtLt; angle: number; dist: number; power: number; color?: string; penumbra?: number }) {
  const ext = useContext(ExtLtCtx);
  const l = useRef<THREE.SpotLight>(null);
  const tgt = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    if (l.current) l.current.intensity = ext && ext[lt] ? power : 0;
  });
  return (
    <group position={p}>
      <spotLight ref={l} position={[0, 0, 0]} target={tgt} angle={angle} penumbra={penumbra} distance={dist} decay={1.1} color={color} intensity={0} />
      <primitive object={tgt} position={[dir[0] * 10, dir[1] * 10, dir[2] * 10]} />
    </group>
  );
}

/** Błysk beacona albo strobo oświetlający samolot (punktowe źródło światła migające w rytmie lampy). */
function FlashLight({ p, lt, blink, color, power, dist }: { p: V3; lt: ExtLt; blink: Blink; color: string; power: number; dist: number }) {
  const ext = useContext(ExtLtCtx);
  const l = useRef<THREE.PointLight>(null);
  const lastT = useRef(-1);
  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    const lvl = blinkPeak(blink, lastT.current < 0 ? now : lastT.current, now);
    lastT.current = now;
    if (l.current) l.current.intensity = ext && ext[lt] ? power * lvl : 0;
  });
  return <pointLight ref={l} position={p} color={color} distance={dist} decay={1.2} intensity={0} />;
}

/** Kierunek od punktu a do b (znormalizowany) – normalna do ustawienia soczewki. */
const dirOf = (a: V3, b: V3, tilt: V3 = [0, 0, 0]): V3 => {
  const d = new THREE.Vector3(b[0] - a[0] + tilt[0], b[1] - a[1] + tilt[1], b[2] - a[2] + tilt[2]).normalize();
  return [d.x, d.y, d.z];
};

/* ================= narzędzia geometrii ================= */

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (k: number, seed: number) => {
  const v = Math.sin((k + seed) * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
/** Poszarpanie brzegu przekroju (wartość 0…amp, zmienna co ok. 1/n długości). */
const jag = (u: number, seed: number, amp: number, n = 26) => {
  const f = u * n;
  const i = Math.floor(f);
  return amp * (hash(i, seed) + (hash(i + 1, seed) - hash(i, seed)) * (f - i));
};
/** Podział odcinków między punktami granicznymi tak, by krawędzie części wypadały dokładnie na liniach siatki. */
export function refine(breaks: number[], step: number) {
  const out: number[] = [];
  const b = [...new Set(breaks)].sort((p, q) => p - q);
  for (let i = 0; i < b.length - 1; i++) {
    const n = Math.max(1, Math.ceil((b[i + 1] - b[i]) / step));
    for (let k = 0; k < n; k++) out.push(b[i] + ((b[i + 1] - b[i]) * k) / n);
  }
  out.push(b[b.length - 1]);
  return out;
}
/**
 * Kształt okna A350 (wysoki, zaokrąglony prostokąt – superelipsa) o promieniu r w jednostkach skali okna; z otworem
 * o promieniu hole (> 0) – pierścień (uszczelka, rant). Drobne przesunięcie w z kładzie warstwy jedna nad drugą.
 */
function winShape(r: number, hole: number) {
  const pts = (rr: number) =>
    Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const e = 2 / 2.8;
      return new THREE.Vector2(rr * Math.sign(c) * Math.pow(Math.abs(c), e), rr * Math.sign(sn) * Math.pow(Math.abs(sn), e));
    });
  const sh = new THREE.Shape(pts(r));
  if (hole > 0) sh.holes.push(new THREE.Path(pts(hole).reverse()));
  const g = new THREE.ShapeGeometry(sh);
  // kolejność warstw: rant, uszczelka, szyba, głębia – każda o włos dalej od poszycia
  g.translate(0, 0, hole > 0 ? (r > 1.15 ? 0 : 0.002) : r < 1 ? 0.006 : 0.004);
  return g;
}
/** Łączy kilka siatek w jedną (pozycje i indeksy; normalne liczone na nowo); źródła są zwalniane. */
export function mergeGeo(gs: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const g of gs) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}
/** Siatka powierzchni na listach parametrów u, v; trójkąty, których środek spełnia `skip`, są pomijane. */
export function grid(us: number[], vs: number[], fn: (u: number, v: number) => V3, skip?: (u: number, v: number) => boolean) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const u of us) for (const v of vs) pos.push(...fn(u, v));
  const nv = vs.length;
  for (let i = 0; i < us.length - 1; i++)
    for (let j = 0; j < vs.length - 1; j++) {
      if (skip && skip((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2)) continue;
      const p = i * nv + j;
      const q = p + nv;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Bryła z przekrojów (zamknięte wieloboki) ułożonych wzdłuż listy parametrów; końce zaślepione. */
function loftSections(rs: number[], sec: (r: number) => V3[], caps = true) {
  const rows = rs.map(sec);
  const n = rows[0].length;
  const pos: number[] = [];
  const idx: number[] = [];
  rows.forEach((row) => row.forEach((p) => pos.push(...p)));
  for (let j = 0; j < rows.length - 1; j++)
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      idx.push(a, a + n, b, b, a + n, b + n);
    }
  if (caps)
    for (const [k, row] of [
      [0, rows[0]],
      [rows.length - 1, rows[rows.length - 1]],
    ] as const) {
      // rzut przekroju na jego własną płaszczyznę (dwie najbardziej rozpięte osie)
      const ext = [0, 1, 2].map((d) => Math.max(...row.map((p) => p[d])) - Math.min(...row.map((p) => p[d])));
      const ax = [0, 1, 2].sort((p, q) => ext[q] - ext[p]).slice(0, 2);
      const flat = row.map((p) => new THREE.Vector2(p[ax[0]], p[ax[1]]));
      const faces = THREE.ShapeUtils.triangulateShape(flat, []);
      for (const f of faces) idx.push(k * n + f[0], k * n + f[1], k * n + f[2]);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Bryła obrotowa o przekroju superelipsy: środek (yc, zc), półosie h, w dla każdego x. */
function podLoft(xs: number[], sec: (x: number) => { yc: number; zc: number; h: number; w: number }, n = 2.4, nk = 28) {
  return loftSections(xs, (x) => {
    const { yc, zc, h, w } = sec(x);
    return Array.from({ length: nk }, (_, k) => {
      const a = (k / nk) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [x, yc + Math.max(h, 1e-3) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), zc + Math.max(w, 1e-3) * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)] as V3;
    });
  });
}
/** Wstęga wzdłuż ścieżki na powierzchni (linie łączeń, obrysy drzwi); normal – kierunek „na zewnątrz”. */
function ribbon(path: V3[], normal: (p: V3) => THREE.Vector3, w: number, lift = 0.012) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = new THREE.Vector3(...path[i]);
    const q = new THREE.Vector3(...path[Math.min(path.length - 1, i + 1)]);
    const o = new THREE.Vector3(...path[Math.max(0, i - 1)]);
    const t = q.sub(o).normalize();
    const n = normal(path[i]);
    const side = t.clone().cross(n).normalize().multiplyScalar(w / 2);
    p.addScaledVector(n, lift);
    pos.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
    if (i < path.length - 1) {
      const v = i * 2;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function merge(geos: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const g of geos) {
    const base = pos.length / 3;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ================= profil i powierzchnie nośne ================= */

/** Profil nadkrytyczny na jednostkę cięciwy (góra/dół); `camber` 0 – profil symetryczny (usterzenie). */
function prof(s: number, t: number, camber = 1) {
  const q = Math.max(0, Math.min(1, s));
  const yt = 5 * t * (0.2969 * Math.sqrt(q) - 0.126 * q - 0.3516 * q * q + 0.2843 * q ** 3 - 0.1036 * q ** 4);
  const yc = camber * (t / 0.105) * (0.018 * Math.sin(Math.PI * Math.pow(q, 0.75)) + 0.012 * Math.max(0, q - 0.6) * 5 * (1 - q));
  return camber ? { u: yc + yt * 0.92, l: yc - yt * 1.08 } : { u: yt, l: -yt };
}

/** Przekrój powierzchni nośnej na stacji r: krawędź natarcia (x, y, z), cięciwa, grubość, kierunek „w górę” profilu. */
interface Station {
  x: number;
  y: number;
  z: number;
  c: number;
  t: number;
  n: V3;
  /** Kąt zaklinowania (rad) – dodatni podnosi krawędź natarcia. */
  inc: number;
}
type Surface = { st: (r: number) => Station; camber: number };
/** Punkt na powierzchni: s – ułamek cięciwy, side: 1 – góra, −1 – dół; inset – odsunięcie do środka profilu. */
function sp(S: Surface, r: number, s: number, side: 1 | -1, inset = 0): V3 {
  const st = S.st(r);
  const p = prof(s, st.t, S.camber);
  const off = (side > 0 ? p.u : p.l) * st.c - side * inset - (s - 0.25) * st.c * Math.tan(st.inc);
  return [st.x + s * st.c, st.y + st.n[1] * off, st.z + st.n[2] * off];
}
/** Środek grubości profilu w punkcie (s, r) – do zawiasów i podpisów. */
const mid = (S: Surface, r: number, s: number): V3 => {
  const a = sp(S, r, s, 1);
  const b = sp(S, r, s, -1);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
};

/* ---------- skrzydło (lewe, +z) ---------- */

const W_SIDE = 2.98; // bok kadłuba
const W_Y0 = -1.55; // płaszczyzna cięciw przy kadłubie (dolnopłat)
const W_DIH = Math.atan(0.0963); // wznios ok. 5,5°
const W_TIP = 30.4; // koniec właściwego skrzydła – dalej winglet
export const W_ENG = 10.6; // silnik
const wLE = (z: number) => -9.6 + 0.675 * (z - W_SIDE); // skos krawędzi natarcia ok. 34°
/** Przedłużenie krawędzi spływu wersji -1000: ok. 0,8 m przy kadłubie, zanika ku końcowi skrzydła. */
const W_TE_EXT = (z: number) => 0.8 * (1 - Math.min(1, Math.max(0, (z - W_SIDE) / (W_TIP - W_SIDE))));
const wTE = (z: number) => (z <= W_ENG ? 4.0 + (z - W_SIDE) * (1.0 / (W_ENG - W_SIDE)) : 5.0 + 0.3275 * (z - W_ENG)) + W_TE_EXT(z);
const wT = (z: number) => (z <= W_ENG ? 0.135 - 0.03 * ((z - W_SIDE) / (W_ENG - W_SIDE)) : 0.105 - 0.015 * ((z - W_ENG) / (W_TIP - W_ENG)));
const W_WL = 4.24; // długość wingletu wzdłuż jego krzywizny
const W_WL_R = 1.5;
const W_WL_A = 1.361;
export const W_REND = W_TIP + W_WL;

const WING: Surface = {
  camber: 1,
  st: (r) => {
    if (r <= W_TIP) {
      const z = r;
      const inc = THREE.MathUtils.degToRad(2.2 - 4.0 * Math.max(0, (z - W_SIDE) / (W_TIP - W_SIDE)));
      return { x: wLE(z), y: W_Y0 + Math.tan(W_DIH) * (z - W_SIDE), z, c: wTE(z) - wLE(z), t: wT(z), n: [0, Math.cos(W_DIH), -Math.sin(W_DIH)], inc };
    }
    // winglet: łuk do góry, potem prosty odcinek pochylony o ok. 84°
    const q = r - W_TIP;
    const yTip = W_Y0 + Math.tan(W_DIH) * (W_TIP - W_SIDE);
    const qa = Math.min(q, W_WL_R * W_WL_A);
    const a = W_DIH + qa / W_WL_R;
    let z = W_TIP + W_WL_R * (Math.sin(a) - Math.sin(W_DIH));
    let y = yTip + W_WL_R * (Math.cos(W_DIH) - Math.cos(a));
    const rest = q - qa;
    z += rest * Math.cos(a);
    y += rest * Math.sin(a);
    const u = q / W_WL;
    const c0 = wTE(W_TIP) - wLE(W_TIP);
    return { x: wLE(W_TIP) + 1.75 * Math.pow(u, 1.35), y, z, c: c0 - 1.6 * Math.pow(u, 0.9), t: 0.09, n: [0, Math.cos(a), -Math.sin(a)], inc: THREE.MathUtils.degToRad(-1.8) };
  },
};

/* mechanizacja skrzydła (zakresy rozpiętości r i cięciwy s) */
const W_FLAPS: [number, number][] = [
  [3.4, 10.25],
  [11.0, 21.6],
];
const W_AIL: [number, number][] = [
  [21.8, 25.65],
  [25.8, 29.6],
];
const W_DROOP: [number, number] = [3.4, 9.3];
const W_SLAT_SPAN: [number, number] = [11.9, 29.8];
const W_SLATS = Array.from({ length: 6 }, (_, i) => {
  const [a, b] = W_SLAT_SPAN;
  return [a + ((b - a) * i) / 6 + (i ? 0.04 : 0), a + ((b - a) * (i + 1)) / 6 - (i < 5 ? 0.04 : 0)] as [number, number];
});
const W_SPOILERS: [number, number][] = [
  ...[0, 1, 2].map((i) => [3.4 + (6.85 * i) / 3 + (i ? 0.04 : 0), 3.4 + (6.85 * (i + 1)) / 3 - (i < 2 ? 0.04 : 0)] as [number, number]),
  // jak w A350: nad klapą wewnętrzną panel opadający i 2 spojlery, nad zewnętrzną 5 spojlerów
  ...[0, 1, 2, 3, 4].map((i) => [11.0 + (10.6 * i) / 5 + (i ? 0.04 : 0), 11.0 + (10.6 * (i + 1)) / 5 - (i < 4 ? 0.04 : 0)] as [number, number]),
];
const W_CANOES = [6.7, 13.5, 17.1, 20.5];
const S_SLAT_U = 0.12;
const S_SLAT_L = 0.04;
const S_DROOP_U = 0.1;
const S_DROOP_L = 0.035;
const S_SPOIL = 0.64;
const S_FLAP_L = 0.76;
const S_FLAP_U = 0.775;
const S_FS = 0.15; // dźwigar przedni
const S_RS = 0.6; // dźwigar tylny
const inSpan = (r: number, spans: [number, number][]) => spans.some(([a, b]) => r > a && r < b);
/**
 * Zdjęty panel górnego poszycia w trybie „skrzydło”: prostokątny otwór między dźwigarami (jak zdjęty panel
 * rewizyjny), krawędzie dokładnie na liniach siatki – bez schodków.
 */
const W_HOLE = { s0: 0.17, s1: 0.58, r0: 4.6, r1: 19.2 };
const W_CUT = (s: number, r: number) => s > W_HOLE.s0 && s < W_HOLE.s1 && r > W_HOLE.r0 && r < W_HOLE.r1;

/* ---------- usterzenie ---------- */

const HTP: Surface = {
  camber: 0,
  st: (r) => {
    const z = r;
    const u = Math.max(0, (z - 1.0) / 8.45);
    return { x: 24.4 + PA + 0.7 * (z - 1.0), y: 0.85 + 0.105 * (z - 1.0), z, c: 6.6 - 4.3 * u, t: 0.1 - 0.012 * u, n: [0, 0.995, -0.104], inc: 0 };
  },
};
const HTP_TIP = 9.45;
const ELEV: [number, number] = [2.1, 9.0];
const VTP: Surface = {
  camber: 0,
  st: (r) => {
    const y = r;
    const u = Math.max(0, (y - 1.6) / 9.32);
    // n = (0, 0, 1): grubość profilu w kierunku z; płaszczyzna cięciw pionowa.
    // Kształt jak w A350: krawędź natarcia skośna ok. 55°, długa cięciwa u nasady (ok. 1,25 wysokości), krawędź spływu
    // pochylona ok. 28°, końcówka nad końcem stożka ogonowego.
    return { x: 16.3 + PA + 1.43 * (y - 1.6), y, z: 0, c: 11.6 - 8.2 * u, t: 0.11 - 0.02 * u, n: [0, 0, 1], inc: 0 };
  },
};
const VTP_TIP = 10.92;
const RUDDER: [number, number] = [2.9, 10.55];

/* ================= kadłub ================= */

/** Wstawki kadłuba wersji -1000 względem -900: przed skrzydłem (nos idzie do przodu) i za skrzydłem (ogon do tyłu). */
const PF = 3.5;
const PA = 3.49;
/**
 * Położenie kadłuba w pionie względem reszty samolotu (skrzydła, podwozia, usterzenia, ziemi). Według tabeli prześwitów
 * Airbusa (AC A350-900, rys. 2-3-0) spód kadłuba jest 2,41 m, a grzbiet 8,50 m nad ziemią, czyli oś kadłuba 5,46 m nad
 * ziemią – o 0,67 m niżej niż oś układu modelu (y = 0, ziemia y = −6,13). Z tym przesunięciem zgadzają się też: próg
 * drzwi 1 (podłoga kabiny ok. 0,48 m pod osią kadłuba), próg ładowni (3,09 m) i punkt oczu pilota.
 */
export const FUS_DY = -0.67;
/** Przekrój kadłuba w x: środek yc, półwysokość h, półszerokość w. Nos lekko opuszczony, ogon podniesiony. */
function fusSec(x: number) {
  // część walcowa wydłużona o obie wstawki; nos i stożek ogonowy jak w krótszej wersji
  const s = fusSec900(x < -24.5 - PF ? x + PF : x > 6 + PA ? x - PA : 0);
  return { yc: s.yc + FUS_DY, h: s.h, w: s.w };
}
function fusSec900(x: number) {
  if (x < -24.5) {
    // nos dopasowany do pomiarów modelu referencyjnego A350-900: szpic owiewki radaru nisko (ok. 1,4 m pod osią),
    // spód szybko dochodzi do pełnego przekroju, góra wznosi się łagodnie (długi skos szyb kokpitu), nos jest smukły.
    // Górny obrys dopasowany do modeli referencyjnych A350-900 (SketchUp i FlightGear – oba zgodne): nad kokpitem
    // grzbiet jest pełny, tak że panel górny mieści się nad głowami pilotów (różnica do modelu SketchUp do ±6 cm).
    const u = Math.max(0, (x + 33.4) / 8.9);
    const tip = -1.4;
    const top = tip + (3.05 - tip) * Math.pow(Math.max(0, 1 - (1 - u) ** 2.9), 1.05);
    const bot = tip - (3.05 + tip) * Math.pow(Math.max(0, 1 - (1 - u) ** 2.95), 0.53);
    const w = 2.98 * Math.pow(Math.max(0, 1 - (1 - u) ** 1.25), 0.53);
    return { yc: (top + bot) / 2, h: (top - bot) / 2, w };
  }
  if (x <= 6) return { yc: 0, h: 3.05, w: 2.98 };
  const v = Math.min(1, (x - 6) / 27.4);
  const bot = -3.05 + 4.0 * Math.pow(v, 1.3);
  const top = 3.05 - 1.55 * Math.pow(v, 2.2);
  return { yc: (top + bot) / 2, h: (top - bot) / 2, w: 2.98 * (1 - 0.86 * Math.pow(v, 1.5)) };
}
const FUS_N = 2.2;
/** Punkt na kadłubie: kąt θ od grzbietu (0) ku lewej burcie (+π/2); inset – odsunięcie do środka. */
export function fusPt(x: number, th: number, inset = 0): V3 {
  const { yc, h, w } = fusSec(x);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [x, yc + Math.max(0.01, h - inset) * Math.sign(c) * Math.pow(Math.abs(c), 2 / FUS_N), Math.max(0.01, w - inset) * Math.sign(s) * Math.pow(Math.abs(s), 2 / FUS_N)];
}
/** Kąt θ, pod którym burta kadłuba w x ma wysokość y (lewa burta). */
export function fusTheta(x: number, y: number) {
  let a = 0;
  let b = Math.PI;
  for (let i = 0; i < 30; i++) {
    const m = (a + b) / 2;
    if (fusPt(x, m)[1] > y) a = m;
    else b = m;
  }
  return (a + b) / 2;
}
const fusNormal = (x: number, th: number) => {
  const p = new THREE.Vector3(...fusPt(x, th));
  const a = new THREE.Vector3(...fusPt(x + 0.05, th)).sub(p);
  const b = new THREE.Vector3(...fusPt(x, th + 0.01)).sub(p);
  const n = a.cross(b).normalize();
  // zawsze na zewnątrz (dla obu burt)
  return n.dot(new THREE.Vector3(0, p.y - fusSec(x).yc, p.z)) < 0 ? n.multiplyScalar(-1) : n;
};
/**
 * Zdjęta pokrywa serwisowa APU w lewej burcie stożka ogonowego (moduł APU): x od – do, kąt θ od grzbietu.
 * Przez nią widać przedział APU za grodzią ogniową.
 */
export const APU_HATCH = { x0: 32.4, x1: 35.9, th0: 0.3, th1: 2.05 };
const APU_CUT = (x: number, th: number) => x > APU_HATCH.x0 && x < APU_HATCH.x1 && th > APU_HATCH.th0 && th < APU_HATCH.th1;
/**
 * Styk owiewki radaru (radomu) z kadłubem: przed nim jest sama owiewka, za nim przednia gródź ciśnieniowa. W module
 * radaru kadłub kończy się tutaj – owiewkę i radar rysuje moduł radaru (otwierana do góry na zawiasach).
 * Według rysunku Airbusa (AC A350-900, rys. 4-4-0) styk leży ok. 1,4 m za czubkiem nosa – tuż przed szybami.
 */
export const RADOME_X = -35.5;
const RADOME_CUT = (x: number) => x < RADOME_X;
/** Przekrój kadłuba w x (środek yc, półwysokość h, półszerokość w) – do rozmieszczenia wyposażenia w stożku ogonowym. */
export const fuselageSection = (x: number) => fusSec(x);
/**
 * Drzwi ładowni w prawej burcie (A350: ok. 2,7 × 1,7 m): x środka drzwi przedniej i tylnej ładowni, pół szerokości,
 * dolna i górna krawędź (y). Krawędzie dochodzą do siatki poszycia, żeby otwór miał równe brzegi.
 */
/*
 * Drzwi ładowni (prawa burta), układ jak w A350: przednie między drzwiami 1 a 2, przed skrzydłem; tylne tuż za
 * owiewką centropłata, za drzwiami 3. Szerokość ok. 2,7 m; górna krawędź (zawias) pod belkami podłogi kabiny,
 * dolna równo z podłogą ładowni (próg) – kontener LD3 (1,1 m w modelu) mieści się z zapasem.
 */
const CARGO_DOOR = { xs: [-19.6, 10.6], hw: 1.35, yb: -3.06, yt: -1.36 };
/**
 * Drzwi pasażerskie A350-1000 (typ A, po cztery z każdej strony): środki w x, połowa szerokości otworu i jego dół/góra
 * (y; podłoga kabiny −1,15). Otwór ok. 1,07 × 1,93 m.
 */
export const PAX_DOOR = { xs: [-26.9 - 3.5, -16.4, 7.4, 18.6 + 3.49], hw: 0.535, yb: -1.08 + 0.05, yt: -1.08 + 1.98 };
/** Zakresy kąta θ otworów (drzwi ładowni – prawa burta, drzwi pasażerskie – obie) na wręgu x. */
function openingGaps(x: number): [number, number][] {
  const out: [number, number][] = [];
  if (CARGO_DOOR.xs.some((xd) => Math.abs(x - xd) < CARGO_DOOR.hw + 0.02)) out.push([-fusTheta(x, CARGO_DOOR.yb), -fusTheta(x, CARGO_DOOR.yt)]);
  if (PAX_DOOR.xs.some((xd) => Math.abs(x - xd) < PAX_DOOR.hw + 0.02)) {
    const a = fusTheta(x, PAX_DOOR.yt);
    const b = fusTheta(x, PAX_DOOR.yb);
    out.push([a, b], [-b, -a]);
  }
  return out.sort((p, q) => p[0] - q[0]);
}
/** Zakres kąta θ (prawa burta) otworu drzwi ładowni na wręgu x; null – wręg nie przechodzi przez otwór. */
function cargoGap(x: number): [number, number] | null {
  if (!CARGO_DOOR.xs.some((xd) => Math.abs(x - xd) < CARGO_DOOR.hw + 0.02)) return null;
  return [-fusTheta(x, CARGO_DOOR.yb), -fusTheta(x, CARGO_DOOR.yt)];
}
const FUS_X = [...new Set([...CARGO_DOOR.xs.flatMap((x) => [x - CARGO_DOOR.hw, x + CARGO_DOOR.hw]), ...PAX_DOOR.xs.flatMap((x) => [x - PAX_DOOR.hw, x + PAX_DOOR.hw]), ...refine([-33.4 - PF, -33.2 - PF, -32.6 - PF, -31.9 - PF, -29 - PF, -27 - PF, -24.5 - PF, -22.5, 6 + PA, 15, 22 + PA, 30 + PA, APU_HATCH.x0, APU_HATCH.x1, 33 + PA, 33.4 + PA], 0.45), RADOME_X, ...refine([-31.8 - PF, -29.4 - PF], 0.05), ...refine([-29.3 - PF, -27.5 - PF], 0.08)])].sort((a, b) => a - b);
const FUS_TH = [...new Set([...[CARGO_DOOR.yb, CARGO_DOOR.yt, PAX_DOOR.yb, PAX_DOOR.yt].flatMap((y) => [fusTheta(0, y), -fusTheta(0, y)]), ...refine([-Math.PI, -0.35, 0, 1.32, Math.PI], 0.05), ...refine([-0.75, 0.75], 0.016), ...refine([Math.PI - 0.45, Math.PI], 0.015), ...refine([-Math.PI, -Math.PI + 0.45], 0.015)])].sort((a, b) => a - b);

/* ---------- brzuch: owiewka centropłata i wnęki podwozia ---------- */

/** Owiewka centropłata: przekrój w x (środek yc, półwysokość h, półszerokość w), superelipsa o wykładniku 2,6. */
const FAIR_N = 2.6;
function fairSec(x: number) {
  const b = smooth(-14.5, -8.5, x) * (1 - smooth(3.5, 9.5, x));
  return { yc: -2.05 - 0.75 * b, h: 0.95 + 0.6 * b, w: 1.6 + 1.75 * b };
}
/** Punkt owiewki: kąt a (0 – góra, π – spód), out – odsunięcie na zewnątrz. */
const fairPt = (x: number, a: number, out = 0): V3 => {
  const { yc, h, w } = fairSec(x);
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return [x, yc + (h + out) * Math.sign(c) * Math.pow(Math.abs(c), 2 / FAIR_N), (w + out) * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / FAIR_N)];
};
/** Spód przekroju (superelipsa o wykładniku n, środek yc, półosie h i w) w odległości z od osi: wysokość y. */
const secBottom = (yc: number, h: number, w: number, n: number, z: number) => {
  const sn = Math.pow(Math.min(1, Math.abs(z) / w), n / 2);
  return yc - h * Math.pow(Math.sqrt(Math.max(0, 1 - sn * sn)), 2 / n);
};
export const fairBottom = (x: number, z: number, out = 0) => {
  const { yc, h, w } = fairSec(x);
  return secBottom(yc, h + out, w + out, FAIR_N, z);
};
export const fusBottom = (x: number, z: number, out = 0) => {
  const { yc, h, w } = fusSec(x);
  return secBottom(yc, h + out, w + out, FUS_N, z);
};
/** Wnęki podwozia: główne (w owiewce, po każdej stronie osi) i przednie (w kadłubie pod kokpitem). */
const BAY_MAIN = { x0: 1.3 - 2.25, x1: 1.3 + 2.25, z0: 0.15, z1: 2.45 };
/**
 * Wnęka przednia: goleń chowa się do przodu, więc wnęka sięga od przegubu ok. 4,3 m w przód (pod kokpit).
 * xs – podział na drzwi przednie (otwarte tylko w czasie ruchu) i tylne (otwarte, gdy goleń jest wypuszczona).
 */
const BAY_NOSE = { x0: -27.3 - PF - 4.2, x1: -27.3 - PF + 0.25, xs: -27.3 - PF - 0.8, z1: 0.56 };
/** Czy punkt poszycia (x, z, y poniżej środka) leży w otworze wnęki (z małym zapasem – drzwi zakrywają brzeg). */
const inMainBay = (x: number, z: number) => x > BAY_MAIN.x0 + 0.06 && x < BAY_MAIN.x1 - 0.06 && Math.abs(z) > BAY_MAIN.z0 + 0.05 && Math.abs(z) < BAY_MAIN.z1 - 0.05;
/**
 * Podwozie główne chowa się w bok: goleń kładzie się pod nasadą skrzydła, a wózek wchodzi do wnęki w owiewce.
 * Na drogę goleni są dwie szczeliny (lewe; prawe – odbicie):
 * – w spodzie skrzydła (x, r – stacja skrzydła ≈ z): prostokąt zamykany osłoną na goleni i wąskie przewężenie przy
 *   przegubie, w którym leży sama goleń; przy wypuszczonym podwoziu szczelina jest otwarta (jak w A350),
 * – w boku owiewki: pas od wnęki kół (z ≥ z0) do połączenia ze skrzydłem (y < yTop), zamykany osobnymi drzwiami,
 *   które otwierają się tylko na czas chowania i wypuszczania.
 */
// szerokość tylko na goleń (ok. 0,45 m) i zastrzał (x ≈ 1,6) z zapasem – przy wypuszczonym podwoziu otwór jest wąski
const LEG_SLOT = { x0: 0.9, x1: 1.8, z0: 3.33, z1: 4.42 };
const LEG_NECK = { x0: 0.98, x1: 1.62, z1: 5.0 };
/** Osłona na goleni (w położeniu schowanym, na spodzie skrzydła): trochę większa od szczeliny. */
const LEG_DOOR = { x0: 0.85, x1: 1.85, z0: 3.25, z1: 4.5 };
// w boku owiewki na całą długość wnęki kół: przez tę strefę przechodzi przy chowaniu nie tylko goleń, ale i wózek
const FAIR_SLOT = { x0: 1.3 - 2.25, x1: 1.3 + 2.25, z0: 2.4, yTop: -2.0 };
/** Czy komórka spodu skrzydła (środek x, stacja r) leży w szczelinie goleni – z zapasem, żeby osłona zakrywała brzeg. */
const inLegSlot = (x: number, r: number) =>
  (x > LEG_SLOT.x0 + 0.12 && x < LEG_SLOT.x1 - 0.12 && r > LEG_SLOT.z0 && r < LEG_SLOT.z1) ||
  (x > LEG_NECK.x0 + 0.12 && x < LEG_NECK.x1 - 0.12 && r >= LEG_SLOT.z1 && r < LEG_NECK.z1);
const inNoseBay = (x: number, z: number) => x > BAY_NOSE.x0 + 0.06 && x < BAY_NOSE.x1 - 0.06 && Math.abs(z) < BAY_NOSE.z1 - 0.04;
/** Kąty przekroju owiewki (lewa strona), między którymi leży szczelina goleni: górny (y = yTop) i dolny (z = z0). */
const FAIR_A = (() => {
  const bis = (lo: number, hi: number, f: (a: number) => number) => {
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2;
      if (f(lo) * f(m) <= 0) hi = m;
      else lo = m;
    }
    return (lo + hi) / 2;
  };
  const xm = (FAIR_SLOT.x0 + FAIR_SLOT.x1) / 2;
  return {
    a1: bis(0.05, Math.PI / 2, (a) => fairPt(xm, a)[1] - FAIR_SLOT.yTop),
    a2: bis(Math.PI / 2, Math.PI - 0.02, (a) => fairPt(xm, a)[2] - FAIR_SLOT.z0),
  };
})();
const inFairSlot = (x: number, a: number) => {
  if (x < FAIR_SLOT.x0 || x > FAIR_SLOT.x1) return false;
  const aa = a > Math.PI ? Math.PI * 2 - a : a;
  return aa > FAIR_A.a1 && aa < FAIR_A.a2;
};
/** Wyrwa w poszyciu w trybie „kadłub”: górna część lewej burty od drzwi 2 do drzwi 3, poszarpane brzegi. */
const FUS_CUT = (x: number, th: number) => th > -0.35 + jag(x / 40 + 0.5, 5, 0.18) && th < 1.32 - jag(x / 40 + 0.5, 9, 0.16) && x > -22.5 + jag(th / 2, 13, 1.2) && x < 15 - jag(th / 2, 19, 1.2);
const CK_TIP = -33.4 - PF;
/**
 * Czarna „maska” szyb kokpitu (lewa połowa, z osią): obrys [odległość od czubka nosa, odsunięcie od osi w bok]
 * w metrach. Zmierzony na modelach A350-900 z 3D Warehouse dostarczonych przez właściciela projektu – szczegóły
 * w CREDITS.md. Kształt półksiężyca: z przodu od 1,53 m za czubkiem (na osi) do 3,7 m przy burcie, z tyłu od 2,38 m;
 * pas ok. 0,9 m wysoki, z garbem dolnego brzegu przy słupkach między szybą przednią a boczną.
 */
const CK_MASK_REF: [number, number][] = [[1.529,0],[1.551,0.118],[1.611,0.344],[1.709,0.498],[1.875,0.715],[2.172,0.987],[2.273,1.118],[2.696,1.493],[2.846,1.578],[3.002,1.649],[3.426,1.783],[3.54,1.809],[3.655,1.821],[3.712,1.809],[3.739,1.782],[3.721,1.741],[3.692,1.61],[3.594,1.521],[3.373,1.354],[3.25,1.226],[3.01,1.041],[2.851,0.886],[2.518,0.43],[2.391,0.077],[2.378,0]];
/**
 * Szyby kokpitu (lewa burta; prawa – odbicie): przednia, boczna (otwierana) i mała tylna. Wyznaczone wewnątrz
 * maski: ok. 7 cm od jej brzegu, słupki ok. 10 cm – środkowy, między szybą przednią a boczną (ok. 1,0–1,1 m od osi)
 * i między boczną a tylną (ok. 1,5–1,6 m). Obrysy [odległość od czubka nosa, odsunięcie od osi w bok].
 */
const CK_PANES: [number, number][][] = [[[1.606,0.037],[1.679,0.342],[1.773,0.494],[1.937,0.711],[2.257,1.013],[2.963,1.063],[2.79,0.897],[2.454,0.443],[2.314,0.044]],[[2.296,1.065],[2.335,1.119],[2.562,1.318],[2.752,1.493],[2.871,1.563],[2.958,1.604],[3.536,1.528],[3.319,1.366],[3.195,1.239],[3.051,1.124]],[[3.19,1.691],[3.425,1.761],[3.524,1.783],[3.605,1.792],[3.648,1.783],[3.667,1.764],[3.625,1.608],[3.593,1.579],[3.055,1.645]]];
/**
 * Punkt oczu kapitana (AC A350-900, rys. 4-4-0): 3,04 m za czubkiem nosa, 0,53 m w bok od osi; wysokość 0,71 m nad
 * osią kadłuba (6,27 m nad ziemią na rysunku, ok. 1,1 m nad podłogą kabiny i kokpitu). Pierwszy oficer – symetrycznie.
 */
export const COCKPIT_EYE = { x: CK_TIP + 3.04, y: 0.71 + FUS_DY, z: 0.53 };
/** Przelicznik kąta θ na metry łuku (do odsuwania obrysów) – przybliżony promień kadłuba w rejonie kokpitu. */
const CK_R = 2.6;
/** Kąt θ (od grzbietu), pod którym górna połowa burty w x jest odsunięta od osi o z. */
function fusThetaZ(x: number, z: number) {
  let a = 0;
  let b = Math.PI / 2;
  for (let i = 0; i < 30; i++) {
    const m = (a + b) / 2;
    if (fusPt(x, m)[2] < z) a = m;
    else b = m;
  }
  return (a + b) / 2;
}
type P2 = [number, number];
/** Obrys szyby w płaszczyźnie (x, θ·R), odsunięty na zewnątrz o off metrów (ujemne – do środka). */
function ckPoly(pane: [number, number][], off: number): P2[] {
  const P: P2[] = pane.map(([d, z]) => {
    const x = CK_TIP + d;
    return [x, fusThetaZ(x, Math.max(0.02, z)) * CK_R];
  });
  let area = 0;
  for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i];
    const [x2, y2] = P[(i + 1) % P.length];
    area += x1 * y2 - x2 * y1;
  }
  const sg = area > 0 ? 1 : -1;
  return P.map((p, i) => {
    const a = P[(i - 1 + P.length) % P.length];
    const b = P[(i + 1) % P.length];
    const n1 = [sg * (p[1] - a[1]), -sg * (p[0] - a[0])];
    const n2 = [sg * (b[1] - p[1]), -sg * (b[0] - p[0])];
    const l1 = Math.hypot(n1[0], n1[1]) || 1;
    const l2 = Math.hypot(n2[0], n2[1]) || 1;
    const nx = n1[0] / l1 + n2[0] / l2;
    const ny = n1[1] / l1 + n2[1] / l2;
    const ln = Math.hypot(nx, ny) || 1;
    const k = off / Math.max(0.5, (nx / ln) * (n1[0] / l1) + (ny / ln) * (n1[1] / l1));
    return [p[0] + (nx / ln) * k, p[1] + (ny / ln) * k];
  });
}
const inPoly = (q: P2, poly: P2[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const CK_POLYS = CK_PANES.map((p) => ckPoly(p, 0));
/** Czy punkt poszycia (x, θ) leży w otworze szyby kokpitu (obie burty). */
const COCKPIT = (x: number, th: number) => CK_POLYS.some((poly) => inPoly([x, Math.abs(th) * CK_R], poly));
/** Czarna „maska” wokół szyb kokpitu w płaszczyźnie (x, θ·R), jak obrysy szyb – z obrysu zmierzonego na modelu. */
const CK_MASK: P2[] = CK_MASK_REF.map(([d, z]) => {
  const x = CK_TIP + d;
  return [x, z <= 0.002 ? 0 : fusThetaZ(x, z) * CK_R];
});
const CK_MASK_A = Math.max(...CK_MASK.map((q) => q[1]));
const DOORS = PAX_DOOR.xs;
/** Podłoga kabiny: próg drzwi 1 (AC A350-900, rys. 2-3-0: D1 ≈ 5,05 m nad ziemią). */
export const FLOOR = -1.08;
/**
 * Kokpit w nosie kadłuba (układ samolotu): podłoga stanowiska pilotów równo z podłogą kabiny (pod nią – przedział
 * awioniki) i tylna ściana z drzwiami. Wnętrze rysuje model kokpitu (cockpitLab), wbudowany w samolot.
 */
export const COCKPIT_FLOOR = FLOOR;
export const COCKPIT_REAR = -32.1;
/** Wykładzina kokpitu: odsunięcie od poszycia do środka (do niej sięgają ścianki wnęk szyb). */
const CK_LINING = 0.12;
/** Środek okien kabiny: ok. 1,2 m nad podłogą (na rysunku Airbusa okna są na wysokości oczu siedzącego pasażera). */
const WIN_Y = 0.05;

/* ================= pamięć geometrii ================= */

/*
 * Geometria samolotu jest budowana raz na całą sesję i współdzielona przez wszystkie jego wystąpienia (widok
 * ogólny, moduły, kawałek skrzydła nad silnikiem). Dzięki temu przejścia między widokami nie zacinają się na
 * ponownym liczeniu siatek. Bufory zostają w pamięci karty – to kilka MB.
 */
const GEO_CACHE = new Map<string, unknown>();
function cached<T>(key: string, build: () => T): T {
  if (!GEO_CACHE.has(key)) GEO_CACHE.set(key, build());
  return GEO_CACHE.get(key) as T;
}
/** Własna kopia siatki dzieląca bufory ze wspólną – tylko z własnym zestawem trójkątów (np. z wyrwą w poszyciu). */
function useShared(src: THREE.BufferGeometry, index: THREE.BufferAttribute) {
  const g = useMemo(() => {
    const c = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(src.attributes)) c.setAttribute(k, a);
    c.boundingSphere = src.boundingSphere;
    return c;
  }, [src]);
  // bez dispose(): zwolniłby też wspólne bufory GPU, które zaraz trzeba by wysłać ponownie
  useMemo(() => {
    g.setIndex(index);
    if (!g.boundingSphere) g.computeBoundingSphere();
  }, [g, index]);
  return g;
}

/* ================= klikalne elementy skrzydła ================= */

/** Opisy elementów skrzydła, które można kliknąć w zbliżeniu konstrukcji. */
export const WING_PART_INFO: Record<string, { name: string; desc: string }> = {
  skin: { name: 'poszycie', desc: 'Zewnętrzna „skóra” skrzydła z kompozytu węglowego – przy kadłubie ma kilkanaście milimetrów grubości. Razem ze szkieletem przenosi obciążenia i tworzy szczelne ściany zbiornika paliwa. Górną część poszycia zdjęliśmy, żeby zajrzeć do środka.' },
  spar: { name: 'dźwigary', desc: 'Dwie główne belki biegnące wzdłuż całego skrzydła – przednia i tylna. To one dźwigają ciężar samolotu: w locie skrzydło wygina się w górę, a jego koniec unosi się o kilka metrów. Razem z poszyciem i żebrami tworzą sztywną skrzynię – serce skrzydła.' },
  rib: { name: 'żebra', desc: 'Poprzeczne ścianki co ok. 70 cm. Nadają skrzydłu kształt, usztywniają poszycie i dzielą zbiornik na komory, żeby paliwo nie chlupotało gwałtownie przy manewrach. Mają otwory na przewody i na przepływ paliwa.' },
  stringer: { name: 'podłużnice', desc: 'Długie, wąskie listwy przyklejone od środka do poszycia. Nie pozwalają mu się pofałdować. W locie górne poszycie jest ściskane, a dolne rozciągane – bez listew cienka górna „skóra” wygięłaby się jak zgnieciona kartka.' },
  fuel: { name: 'paliwo w kesonie', desc: 'Skrzydło samo jest zbiornikiem: jego szczelne poszycie, belki i żebra tworzą ściany zbiornika, bez osobnego „baku” w środku. W skrzydłach i środkowej części mieści się ok. 159 000 litrów paliwa. Paliwo w skrzydłach je odciąża – jego ciężar ciągnie w dół, a siła nośna w górę.' },
  droop: { name: 'nosek opuszczany', desc: 'Część przedniej krawędzi skrzydła przy kadłubie, która przy starcie i lądowaniu pochyla się w dół. Skrzydło staje się bardziej wygięte i lepiej niesie przy małej prędkości. Nie otwiera przy tym szczeliny, więc nie zaburza powietrza wpadającego do silnika.' },
  slat: { name: 'sloty', desc: 'Ruchome części przedniej krawędzi skrzydła. Przy starcie i lądowaniu wysuwają się do przodu i w dół, otwierając wąską szczelinę. Szybki strumień powietrza spod skrzydła przepływa nią na górę i pomaga mu „przylegać” do skrzydła. Dzięki temu samolot może lecieć wolniej, z nosem wyżej, i nie traci siły nośnej.' },
  flap: { name: 'klapy', desc: 'Duże ruchome części tylnej krawędzi skrzydła. Wysuwają się po szynach do tyłu i w dół – skrzydło robi się większe i bardziej wygięte, więc niesie samolot przy mniejszej prędkości. Przy starcie wysuwają się trochę, przy lądowaniu – najbardziej.' },
  spoiler: { name: 'spojlery', desc: 'Płyty na górze skrzydła, przed klapami. Podniesione psują przepływ powietrza nad skrzydłem. W locie hamują i pomagają przechylać samolot, a po przyziemieniu „gaszą” siłę nośną – samolot mocno dociska koła do pasa i hamulce działają skuteczniej.' },
  aileron: { name: 'lotki', desc: 'Ruchome części tylnej krawędzi, bliżej końca skrzydła. Na obu skrzydłach wychylają się w przeciwne strony: jedno skrzydło unosi się mocniej, drugie słabiej – i samolot się przechyla, np. do zakrętu.' },
  canoe: { name: 'owiewki prowadnic klap', desc: 'Opływowe osłony pod skrzydłem, nazywane „kajakami”. Kryją szyny i mechanizmy, po których wysuwają się klapy. Mają taki kształt, żeby przy dużej prędkości przy okazji trochę zmniejszały opór.' },
  winglet: { name: 'winglet', desc: 'Zagięta w górę końcówka skrzydła. Pod skrzydłem ciśnienie jest wyższe niż nad nim, więc na końcu powietrze „przelewa się” spod spodu na górę i zawija w wir, który hamuje samolot. Winglet osłabia ten wir i daje kilka procent oszczędności paliwa.' },
  dis: { name: 'wyładowniki statyczne', desc: 'Cienkie pręciki na tylnej krawędzi. W locie samolot elektryzuje się od tarcia o powietrze – pręciki oddają ten ładunek do powietrza, żeby iskrzenie nie zakłócało łączności radiowej.' },
  panel: { name: 'włazy rewizyjne zbiorników', desc: 'Owalne pokrywy w spodzie skrzydła. Gdy zbiornik zostanie opróżniony i przewietrzony, mechanik zdejmuje pokrywę i wchodzi do środka skrzydła, żeby obejrzeć konstrukcję, pompy i czujniki paliwa. Kształt jest owalny, bo w ostrych narożnikach łatwiej zaczynają się pęknięcia.' },
  vent: { name: 'wlot odpowietrzenia zbiornika', desc: 'Płaski, zagłębiony wlot pod końcem skrzydła. Łączy zbiorniki z powietrzem na zewnątrz, żeby przy tankowaniu, zużywaniu paliwa i zmianie wysokości ciśnienie w nich nie rosło ani nie spadało – tak jak otwór w zakrętce kanistra. Jego kształt wpuszcza powietrze, prawie nie zwiększając oporu.' },
  walk: { name: 'pas do chodzenia', desc: 'Obrysowany obszar na górze skrzydła przy kadłubie. Tylko tu poszycie wytrzyma ciężar człowieka – np. przy przeglądach albo ewakuacji przez wyjście nad skrzydłem. Poza nim widnieje napis NO STEP („nie stawać”).' },
  light: { name: 'światła zewnętrzne', desc: 'Na przedniej krawędzi końca skrzydła są światła pozycyjne (czerwone po lewej, zielone po prawej) i białe błyskające stroboskopy, a na tylnej – białe światło pozycyjne. Przy kadłubie, pod przezroczystą osłoną w przedniej krawędzi, są dwa reflektory lądowania, zapalane przy starcie i lądowaniu.' },
};

/**
 * Grupy elementów skrzydła i ich kolory podpisów (jak grupy części w silniku): konstrukcja kesonu, paliwo,
 * krawędź natarcia, krawędź spływu i końcówka.
 */
export const WING_GROUPS: { name: string; color: string; ids: string[] }[] = [
  { name: 'konstrukcja kesonu', color: '#bef264', ids: ['spar', 'rib', 'stringer', 'skin'] },
  { name: 'paliwo', color: '#f5b041', ids: ['fuel'] },
  { name: 'krawędź natarcia', color: '#7dd3fc', ids: ['droop', 'slat'] },
  { name: 'krawędź spływu', color: '#fca5a5', ids: ['flap', 'spoiler', 'aileron', 'canoe'] },
  { name: 'końcówka skrzydła', color: '#c4b5fd', ids: ['winglet', 'dis'] },
  { name: 'obsługa i systemy', color: '#f9a8d4', ids: ['panel', 'vent', 'walk', 'light'] },
];
export const wingGroupOf = (id: string) => WING_GROUPS.find((g) => g.ids.includes(id));

/** Wybór elementu skrzydła (tylko w scenach, które go obsługują). */
export type WingPick = { selected: string | null; onSelect: (id: string | null) => void };
type PickState = { pick: WingPick; hover: string | null; setHover: (id: string | null) => void; accept: (p: THREE.Vector3) => boolean };
const PickCtx = createContext<PickState | null>(null);

/** Klikalny element skrzydła: najechanie podświetla, kliknięcie wybiera (i pokazuje opis). */
function Pk({ id, children }: { id: string; children: ReactNode }) {
  const ctx = useContext(PickCtx);
  const base = useContext(GlowCtx);
  const hl = useContext(HiliteCtx)?.[id];
  // wyróżnienie ze sceny: poświata w kolorze osi, którą ta powierzchnia steruje
  const lit = (node: ReactNode, glow: number) =>
    hl ? (
      <GlowColorCtx.Provider value={hl}>
        <GlowCtx.Provider value={Math.max(glow, 1.1)}>{node}</GlowCtx.Provider>
      </GlowColorCtx.Provider>
    ) : (
      node
    );
  if (!ctx) return <>{lit(children, base)}</>;
  const { pick, hover, setHover, accept } = ctx;
  const glow = pick.selected === id ? 0.42 : hover === id ? 0.24 : base;
  return (
    <GlowCtx.Provider value={hl ? Math.max(glow, 1.1) : glow}>
    <GlowColorCtx.Provider value={hl ?? '#7dd3fc'}>
      <group
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!accept(e.point)) return;
          e.stopPropagation();
          if (e.delta > 6) return;
          pick.onSelect(pick.selected === id ? null : id);
        }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (!accept(e.point)) return;
          e.stopPropagation();
          if (hover !== id) setHover(id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (hover === id) setHover(null);
          document.body.style.cursor = '';
        }}
      >
        {children}
      </group>
    </GlowColorCtx.Provider>
    </GlowCtx.Provider>
  );
}

/* ================= części modelu ================= */

/** Promień do sprawdzania, czy podpis nie jest zasłonięty przez model (wspólny dla wszystkich podpisów). */
const occRay = new THREE.Raycaster();
const occV = new THREE.Vector3();
const occD = new THREE.Vector3();
let occSeed = 0;
/** Obiekt naprawdę widoczny (z rodzicami) – ukryte sceny trzymane w pamięci nie zasłaniają podpisów. */
const shown = (o: THREE.Object3D | null): boolean => {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

export function Lbl({ pos, children, color = '#e2e8f0', sub = false, link = false, occlude = false, onClick, onHover, active = false }: { pos: V3; children: ReactNode; color?: string; sub?: boolean; link?: boolean; occlude?: boolean; onClick?: () => void; onHover?: (on: boolean) => void; active?: boolean }) {
  const hidden = useSceneHidden();
  const anchor = useRef<THREE.Group>(null);
  const span = useRef<HTMLSpanElement>(null);
  const seed = useMemo(() => occSeed++ % 10, []);
  const frame = useRef(0);
  // podpis zasłonięty przez samolot (np. podwozie za skrzydłem) znika; sprawdzane co 10 klatek, kolejno
  useFrame(({ camera, scene }) => {
    if (!occlude || hidden || !anchor.current || !span.current) return;
    if ((frame.current++ + seed) % 10) return;
    anchor.current.getWorldPosition(occV);
    occD.copy(occV).sub(camera.position);
    const dist = occD.length();
    occRay.set(camera.position, occD.normalize());
    occRay.far = dist - 0.35;
    // linie drei (Line2) przy sprawdzaniu trafienia potrzebują kamery promienia
    occRay.camera = camera;
    const blocked = occRay.intersectObjects(scene.children, true).some((h) => (h.object as THREE.Mesh).isMesh && shown(h.object));
    span.current.style.opacity = blocked ? '0' : '';
    span.current.style.pointerEvents = blocked || !onClick ? 'none' : 'auto';
  });
  // scena trzymana w pamięci (ukryta) nie pokazuje podpisów
  if (hidden) return null;
  const cls = ['engine-label', sub ? 'sub' : '', onClick ? 'part-name' : '', link ? 'module-link' : '', active ? 'on' : ''].filter(Boolean).join(' ');
  return (
    <group ref={anchor} position={pos}>
    <Html center zIndexRange={[6, 0]} style={{ pointerEvents: onClick ? 'auto' : 'none' }}>
      <span ref={span} className={cls} style={{ color, whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : undefined, pointerEvents: onClick ? 'auto' : 'none', transition: 'opacity 0.25s' }} onClick={(e) => {
          // kliknięcie podpisu nie może przejść dalej do sceny 3D (trafiłoby w część za podpisem, np. skrzydło, i otworzyło jej moduł)
          e.stopPropagation();
          onClick?.();
        }} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onPointerEnter={() => onHover?.(true)} onPointerLeave={() => onHover?.(false)}>
        {children}
        {link && (
          // odnośnik do innego modułu: strzałka „przejdź dalej”
          <svg className="module-link-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        )}
      </span>
    </Html>
    </group>
  );
}

/** Kadłub: poszycie, owiewka centropłata, okna, drzwi, kokpit; w trybie „kadłub” – przekrój z wnętrzem. */
function Fuselage({ open, apu = false, radar = false, view = 'home', labels = true, pick, doorsOpen = false }: { open: boolean; apu?: boolean; radar?: boolean; view?: FusView; labels?: boolean; pick?: WingPick; doorsOpen?: boolean }) {
  const ext = useContext(ExtLtCtx);
  const g = useMemo(() => cached('fuselage', () => {
    // otwory w poszyciu: szyby kokpitu i wnęka koła przedniego (zamknięte drzwi wnęki leżą równo z poszyciem)
    const ckHole = (x: number, th: number) => COCKPIT(x, th) || (Math.cos(th) < -0.5 && inNoseBay(x, fusPt(x, th)[2]));
    const shell = grid(FUS_X, FUS_TH, (x, th) => fusPt(x, th), ckHole);
    const full = shell.getIndex()!.clone();
    const cutG = grid(FUS_X, FUS_TH, (x, th) => fusPt(x, th), (x, th) => FUS_CUT(x, th) || ckHole(x, th));
    const cut = cutG.getIndex()!.clone();
    cutG.dispose();
    const apuG = grid(FUS_X, FUS_TH, (x, th) => fusPt(x, th), (x, th) => APU_CUT(x, th) || ckHole(x, th));
    const apuCut = apuG.getIndex()!.clone();
    apuG.dispose();
    const cargoG = grid(FUS_X, FUS_TH, (x, th) => fusPt(x, th), (x, th) => {
      if (ckHole(x, th)) return true;
      if (th > 0) return false;
      const y = fusPt(x, th)[1];
      return y > CARGO_DOOR.yb && y < CARGO_DOOR.yt && CARGO_DOOR.xs.some((xd) => Math.abs(x - xd) < CARGO_DOOR.hw);
    });
    const cargoCut = cargoG.getIndex()!.clone();
    cargoG.dispose();
    // moduł drzwi: otwory drzwi pasażerskich po obu burtach (drzwi są osobnymi bryłami, otwierają się na zewnątrz)
    const paxG = grid(FUS_X, FUS_TH, (x, th) => fusPt(x, th), (x, th) => {
      if (ckHole(x, th)) return true;
      const y = fusPt(x, th)[1];
      return y > PAX_DOOR.yb && y < PAX_DOOR.yt && PAX_DOOR.xs.some((xd) => Math.abs(x - xd) < PAX_DOOR.hw);
    });
    const doorCut = paxG.getIndex()!.clone();
    paxG.dispose();
    const radG = grid(FUS_X, FUS_TH, (x, th) => fusPt(x, th), (x, th) => RADOME_CUT(x) || ckHole(x, th));
    const radarCut = radG.getIndex()!.clone();
    radG.dispose();
    // szyby kokpitu w 3D: czarna ramka na poszyciu, ścianki wnęki i szkło cofnięte o ok. 4 cm
    const densify = (P: P2[], k = 4): P2[] =>
      P.flatMap((p, i) => {
        const q = P[(i + 1) % P.length];
        return Array.from({ length: k }, (_, j) => [p[0] + ((q[0] - p[0]) * j) / k, p[1] + ((q[1] - p[1]) * j) / k] as P2);
      });
    const strip = (a: V3[], b: V3[]) => {
      const pos: number[] = [];
      const idx: number[] = [];
      a.forEach((p, i) => pos.push(...p, ...b[i]));
      for (let i = 0; i < a.length; i++) {
        const j = (i + 1) % a.length;
        idx.push(2 * i, 2 * j, 2 * i + 1, 2 * i + 1, 2 * j, 2 * j + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const glassG: THREE.BufferGeometry[] = [];
    const wallG: THREE.BufferGeometry[] = [];
    const frameG: THREE.BufferGeometry[] = [];
    const trimG: THREE.BufferGeometry[] = [];
    for (const side of [1, -1])
      for (const pane of CK_PANES) {
        const at = (q: P2, inset: number) => fusPt(q[0], (side * q[1]) / CK_R, inset);
        const inner = densify(ckPoly(pane, -0.045));
        const outer = densify(ckPoly(pane, 0.045));
        frameG.push(strip(outer.map((q) => at(q, -0.004)), inner.map((q) => at(q, -0.004))));
        // ścianka wnęki szyby: od poszycia do wykładziny kokpitu (z obu stron widać grubość burty)
        wallG.push(strip(inner.map((q) => at(q, -0.002)), inner.map((q) => at(q, CK_LINING + 0.01))));
        // od środka: obramowanie szyby na wykładzinie (zakrywa brzeg otworu w siatce wykładziny)
        const trimOut = densify(ckPoly(pane, 0.11));
        const trimIn = densify(ckPoly(pane, -0.045));
        trimG.push(strip(trimOut.map((q) => at(q, CK_LINING - 0.004)), trimIn.map((q) => at(q, CK_LINING - 0.004))));
        const tris = THREE.ShapeUtils.triangulateShape(inner.map((q) => new THREE.Vector2(q[0], q[1])), []);
        const gl = new THREE.BufferGeometry();
        gl.setAttribute('position', new THREE.Float32BufferAttribute(inner.flatMap((q) => at(q, 0.04)), 3));
        gl.setIndex(tris.flat());
        gl.computeVertexNormals();
        glassG.push(gl);
      }
    const cockpit = merge(glassG);
    // maska: cienka warstwa farby tuż nad poszyciem, z otworami szyb (ich brzegi zakrywa czarna ramka)
    // w każdym rzędzie (stały łuk) pas od lewej do prawej krawędzi obrysu – brzeg dokładnie po obrysie, bez schodków;
    // otwory szyb wycięte komórkami (ich brzegi zakrywa czarna ramka w tym samym kolorze)
    const ckMask = (() => {
      const span = (a: number): [number, number] | null => {
        const xs: number[] = [];
        for (let i = 0; i < CK_MASK.length; i++) {
          const [x1, y1] = CK_MASK[i];
          const [x2, y2] = CK_MASK[(i + 1) % CK_MASK.length];
          if ((y1 - a) * (y2 - a) <= 0 && y1 !== y2) xs.push(x1 + ((a - y1) * (x2 - x1)) / (y2 - y1));
        }
        if (xs.length < 2) return null;
        return [Math.max(RADOME_X + 0.03, Math.min(...xs)), Math.max(...xs)];
      };
      const N = 140;
      const ths = refine([-CK_MASK_A / CK_R + 0.001, CK_MASK_A / CK_R - 0.001], 0.015 / CK_R);
      const pos: number[] = [];
      const idx: number[] = [];
      const rows = ths.map((th) => span(Math.abs(th) * CK_R));
      ths.forEach((th, j) => {
        const sp = rows[j] ?? [0, 0];
        for (let k = 0; k <= N; k++) pos.push(...fusPt(sp[0] + ((sp[1] - sp[0]) * k) / N, th, -0.003));
      });
      for (let j = 0; j < ths.length - 1; j++) {
        if (!rows[j] || !rows[j + 1]) continue;
        for (let k = 0; k < N; k++) {
          const p0 = j * (N + 1) + k;
          const q0 = p0 + N + 1;
          const cx = (pos[p0 * 3] + pos[(q0 + 1) * 3]) / 2;
          if (COCKPIT(cx, (ths[j] + ths[j + 1]) / 2)) continue;
          idx.push(p0, q0, p0 + 1, p0 + 1, q0, q0 + 1);
        }
      }
      const gm = new THREE.BufferGeometry();
      gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      gm.setIndex(idx);
      gm.computeVertexNormals();
      return gm;
    })();
    const ckWall = merge(wallG);
    const ckFrame = merge(frameG);
    const ckTrim = merge(trimG);
    // wykładzina kokpitu (wewnętrzna strona burty i sufit) od grodzi ciśnieniowej do tylnej ściany kokpitu, nad podłogą
    // stanowiska pilotów; w miejscach szyb – otwory. Wyposażenie (pulpity, fotele, ekrany) to model kokpitu.
    const ckLining = grid(
      refine([RADOME_X + 0.05, COCKPIT_REAR], 0.04),
      refine([-Math.PI, -1.0, 0, 1.0, Math.PI], 0.025),
      (x, th) => fusPt(x, th, CK_LINING),
      (x, th) => COCKPIT(x, th) || fusPt(x, th, CK_LINING)[1] < COCKPIT_FLOOR - 0.05,
    );
    // owiewka centropłata pod kadłubem (miejsce na keson, podwozie i instalacje)
    // owiewka centropłata jako siatka (x, kąt): z otworami wnęk podwozia głównego, które zakrywają drzwi
    const fairA = [
      ...new Set([
        ...refine([0, Math.PI * 2], 0.08),
        ...refine([Math.PI * 0.62, Math.PI * 1.38], 0.02),
        // szczeliny goleni w bokach owiewki – brzegi dokładnie na liniach siatki
        ...refine([FAIR_A.a1, FAIR_A.a2], 0.03),
        ...refine([Math.PI * 2 - FAIR_A.a2, Math.PI * 2 - FAIR_A.a1], 0.03),
      ]),
    ].sort((a, b) => a - b);
    const fairing = grid(
      [...new Set([...refine([-14.5, -9, BAY_MAIN.x0, BAY_MAIN.x1, 3.5, 9.5], 0.3), ...refine([BAY_MAIN.x0 - 0.2, BAY_MAIN.x1 + 0.2], 0.08), FAIR_SLOT.x0, FAIR_SLOT.x1])].sort((a, b) => a - b),
      fairA,
      (x, a) => fairPt(x, a),
      (x, a) => (Math.cos(a) < -0.3 && inMainBay(x, fairPt(x, a)[2])) || inFairSlot(x, a),
    );
    // linie podziału paneli brzucha: obrysy drzwi wnęk, wzdłużne i poprzeczne łączenia owiewki
    const doorOutline = (x0: number, x1: number, z0: number, z1: number, bottom: (x: number, z: number) => number): V3[] => [
      ...refine([x0, x1], 0.1).map((x) => [x, bottom(x, z0), z0] as V3),
      ...refine([z0, z1], 0.08).map((z) => [x1, bottom(x1, z), z] as V3),
      ...refine([x0, x1], 0.1).reverse().map((x) => [x, bottom(x, z1), z1] as V3),
      ...refine([z0, z1], 0.08).reverse().map((z) => [x0, bottom(x0, z), z] as V3),
    ];
    const down = () => new THREE.Vector3(0, -1, 0);
    const bellySeams = merge([
      ...[1, -1].map((sg) =>
        ribbon(doorOutline(BAY_MAIN.x0, BAY_MAIN.x1, BAY_MAIN.z0 * sg, BAY_MAIN.z1 * sg, (x, z) => fairBottom(x, z, 0.012)), down, 0.06, 0),
      ),
      ribbon(doorOutline(BAY_NOSE.x0, BAY_NOSE.x1, -BAY_NOSE.z1, BAY_NOSE.z1, (x, z) => fusBottom(x, z, 0.012)), down, 0.05, 0),
      // podział drzwi przednich wzdłuż osi i poprzeczny między drzwiami przednimi a tylnymi
      ribbon(refine([BAY_NOSE.x0, BAY_NOSE.x1], 0.1).map((x) => [x, fusBottom(x, 0, 0.012), 0] as V3), down, 0.035, 0),
      ribbon(refine([-BAY_NOSE.z1, BAY_NOSE.z1], 0.08).map((z) => [BAY_NOSE.xs, fusBottom(BAY_NOSE.xs, z, 0.012), z] as V3), down, 0.035, 0),
      // łączenia paneli owiewki: wzdłużne i poprzeczne
      ...[BAY_MAIN.z0, -BAY_MAIN.z0].map((z) => ribbon(refine([-12.5, BAY_MAIN.x0 - 0.1], 0.3).map((x) => [x, fairBottom(x, z, 0.01), z] as V3), down, 0.025, 0)),
      ...[-11.5, -7.5, -4.0, 6.0].map((x) => ribbon(refine([-2.6, 2.6], 0.1).map((z) => [x, fairBottom(x, z, 0.01), z] as V3), down, 0.025, 0)),
    ]);
    /**
     * Ciemne wnęki widoczne przez otwarte drzwi: ścianki wychodzą dokładnie z brzegu otworu w poszyciu (po jego
     * krzywiźnie) i biegną w górę do stropu – nic nie wystaje pod brzuch, nawet tam, gdzie owiewka się zakrzywia.
     */
    const tub = (x0: number, x1: number, z0: number, z1: number, bottom: (x: number, z: number) => number, topY: number) => {
      const edge = doorOutline(x0, x1, z0, z1, (x, z) => bottom(x, z));
      const walls = grid([0, 1], edge.map((_, i) => i), (v, i) => {
        const p = edge[i];
        return [p[0], p[1] + (topY - p[1]) * v, p[2]];
      });
      const roof = grid([x0, x1], [z0, z1], (x, z) => [x, topY, z]);
      return merge([walls, roof]);
    };
    /** Ścianka wnęki: od linii brzegu otworu w poszyciu w górę do stropu na wysokości topY. */
    const wallUp = (edge: V3[], topY: number) =>
      grid([0, 1], edge.map((_, i) => i), (v, i) => {
        const p = edge[i];
        return [p[0], p[1] + (topY - p[1]) * v, p[2]];
      });
    const roofAt = (x0: number, x1: number, z0: number, z1: number, y: number) => grid([x0, x1], [z0, z1], (x, z) => [x, y, z]);
    const fb = (x: number, z: number) => fairBottom(x, z, -0.002);
    /** Spód lewego skrzydła w punkcie (x, stacja r), lekko do środka. */
    const wingLow = (x: number, rr: number): V3 => {
      const st = WING.st(rr);
      return sp(WING, rr, (x - st.x) / st.c, -1, 0.004);
    };
    const mainBays = [1, -1].flatMap((sg) => {
      const B = BAY_MAIN;
      const F = FAIR_SLOT;
      const zz = (z: number) => z * sg;
      const alongX = (x0: number, x1: number, z: number) => refine([x0, x1], 0.1).map((x) => [x, fb(x, zz(z)), zz(z)] as V3);
      const alongZ = (x: number, z0: number, z1: number) => refine([z0, z1], 0.08).map((z) => [x, fb(x, zz(z)), zz(z)] as V3);
      // szczelina w boku owiewki: brzeg wzdłuż x u góry (a1) i boki wzdłuż kąta; od strony wnęki kół bez ścianki
      const aOf = (a: number) => (sg > 0 ? a : Math.PI * 2 - a);
      const sideEdge = (x: number) => refine([FAIR_A.a1, FAIR_A.a2], 0.04).map((a) => fairPt(x, aOf(a), -0.002));
      /** Półszerokość owiewki w x na wysokości y (0 poza nią). */
      const fairHalf = (x: number, y: number) => {
        const { yc, h, w } = fairSec(x);
        const c = Math.abs(y - yc) / h;
        return c >= 1 ? 0 : w * Math.pow(1 - Math.pow(c, FAIR_N), 1 / FAIR_N);
      };
      /** Półszerokość kadłuba w x na wysokości y. */
      const fusHalf = (x: number, y: number) => Math.abs(fusPt(x, fusTheta(x, y))[2]);
      /**
       * Ścianka od brzegu w owiewce w górę i do środka – do krawędzi wnęki kół (z = BAY_MAIN.z1). Każdy punkt zostaje
       * wewnątrz owiewki albo kadłuba: inaczej ciemna ścianka wystawałaby nad owiewką przy nasadzie skrzydła.
       */
      const wallIn = (edge: V3[], topY: number) =>
        grid(refine([0, 1], 0.05), edge.map((_, i) => i), (v, i) => {
          const q = edge[i];
          const zi = Math.sign(q[2]) * Math.min(Math.abs(q[2]), B.z1);
          const y = q[1] + (topY - q[1]) * v;
          const z = q[2] + (zi - q[2]) * v;
          if (v === 0) return [q[0], y, z];
          const lim = Math.max(fairHalf(q[0], y) - 0.004, fusHalf(q[0], y) - 0.03);
          return [q[0], y, Math.sign(z) * Math.min(Math.abs(z), lim)];
        });
      const zTop = fairPt(F.x0, FAIR_A.a1)[2];
      return [
        // wnęka kół: ścianki wzdłuż brzegu otworu, bez ścianki tam, gdzie łączy się ze szczeliną goleni
        wallUp(alongX(B.x0, B.x1, B.z0), -0.75),
        wallUp(alongZ(B.x1, B.z0, B.z1), -0.75),
        // ścianka od strony szczeliny w owiewce tylko tam, gdzie szczelina jest węższa od wnęki
        ...(B.x1 - F.x1 > 0.05 ? [wallUp(alongX(F.x1, B.x1, B.z1), -0.75)] : []),
        ...(F.x0 - B.x0 > 0.05 ? [wallUp(alongX(B.x0, F.x0, B.z1), -0.75)] : []),
        wallUp(alongZ(B.x0, B.z0, B.z1), -0.75),
        roofAt(B.x0, B.x1, zz(B.z0), zz(B.z1), -0.75),
        // szczelina w owiewce
        wallIn(refine([F.x0, F.x1], 0.1).map((x) => fairPt(x, aOf(FAIR_A.a1), -0.002)), -0.75),
        wallIn(sideEdge(F.x0), -0.75),
        wallIn(sideEdge(F.x1), -0.75),
        roofAt(F.x0, F.x1, zz(B.z1 - 0.05), zz(Math.min(zTop, B.z1)), -0.75),
      ];
    });
    const wingSlots = [1, -1].flatMap((sg) => {
      const L = LEG_SLOT;
      const N = LEG_NECK;
      const top = -1.25;
      const pz = (p: V3): V3 => [p[0], p[1], p[2] * sg];
      const ax = (x0: number, x1: number, rr: number) => refine([x0, x1], 0.1).map((x) => pz(wingLow(x, rr)));
      const az = (x: number, r0: number, r1: number) => refine([r0, r1], 0.08).map((rr) => pz(wingLow(x, rr)));
      const zAt = (rr: number) => wingLow(1.3, rr)[2] * sg;
      return [
        // obrys: prostokąt pod osłoną i przewężenie przy przegubie (ścianki od spodu skrzydła w górę)
        wallUp(ax(L.x0, L.x1, L.z0), top),
        wallUp(az(L.x1, L.z0, L.z1), top),
        wallUp(ax(N.x1, L.x1, L.z1), top),
        wallUp(az(N.x1, L.z1, N.z1), top),
        wallUp(ax(N.x0, N.x1, N.z1), top),
        wallUp(az(N.x0, L.z1, N.z1), top),
        wallUp(ax(L.x0, N.x0, L.z1), top),
        wallUp(az(L.x0, L.z0, L.z1), top),
        roofAt(L.x0, L.x1, zAt(L.z0), zAt(L.z1), top),
        roofAt(N.x0, N.x1, zAt(L.z1), zAt(N.z1), top),
      ];
    });
    // szczelina goleni w skrzydle leży pod spojlerami i klapą – przy wysuniętych klapach widać ją przez wnękę klapy,
    // więc ma kolor wnęki klapy (osobna siatka), a nie czerń wnęk w brzuchu
    const legBays = merge(wingSlots);
    const bays = merge([
      ...mainBays,
      tub(BAY_NOSE.x0, BAY_NOSE.x1, -BAY_NOSE.z1, BAY_NOSE.z1, (x, z) => fusBottom(x, z, -0.002), -1.05),
    ]);
    // okna kabiny po obu burtach co wręg (ok. 0,64 m), duże i owalne; pomijamy drzwi
    const wins: THREE.Matrix4[] = [];
    const o = new THREE.Object3D();
    for (let x = -24.3 - PF; x <= 19.9 + PA; x += 0.635) {
      if (DOORS.some((d) => Math.abs(d - x) < 0.9)) continue;
      const th = fusTheta(x, WIN_Y);
      for (const side of [1, -1]) {
        const p = fusPt(x, th * side, -0.006);
        const n = fusNormal(x, th * side);
        o.position.set(...p);
        o.quaternion.copy(uprightQuat(n));
        o.scale.set(0.17, 0.24, 1);
        o.updateMatrix();
        wins.push(o.matrix.clone());
      }
    }
    // obrysy drzwi (z okienkiem) po obu burtach
    const doorLines: THREE.BufferGeometry[] = [];
    const doorWins: THREE.Matrix4[] = [];
    /** Obrys prostokąta o zaokrąglonych rogach, naniesiony na burtę (side: 1 – lewa, −1 – prawa). */
    const outline = (dx: number, W: number, y0: number, y1: number, R: number, side: number, w = 0.035) => {
      const path: V3[] = [];
      const corners: [number, number, number][] = [
        [dx + W - R, y1 - R, 0],
        [dx - W + R, y1 - R, Math.PI / 2],
        [dx - W + R, y0 + R, Math.PI],
        [dx + W - R, y0 + R, (3 * Math.PI) / 2],
      ];
      for (const [cx, cy, a0] of corners)
        for (let k = 0; k <= 6; k++) {
          const a = a0 + (k / 6) * (Math.PI / 2);
          const x = cx + R * Math.cos(a);
          const y = cy + R * Math.sin(a);
          const p = fusPt(x, fusTheta(x, y));
          path.push([p[0], p[1], p[2] * side]);
        }
      path.push(path[0]);
      return ribbon(path, (p) => new THREE.Vector3(0, 0.1 * Math.sign(p[1]), Math.sign(p[2])).normalize(), w, 0.01);
    };
    // luki bagażowe na prawej burcie: przedni i tylny (kontenery LD3) oraz mały luk bagażu luzem
    // obrys luków LD3 dokładnie wokół otworu drzwi (tuż poza krawędzią – zostaje na poszyciu, gdy drzwi są otwarte)
    for (const xd of CARGO_DOOR.xs) doorLines.push(outline(xd, CARGO_DOOR.hw + 0.03, CARGO_DOOR.yb - 0.03, CARGO_DOOR.yt + 0.03, 0.04, -1, 0.03));
    for (const [cx, hw, hgt] of [[16.6 + PA, 0.5, 0.95]]) {
      const bot = fusSec(cx).yc - fusSec(cx).h;
      const y0 = Math.max(-2.75, bot + 0.42);
      doorLines.push(outline(cx, hw, y0, Math.min(FLOOR - 0.2, y0 + hgt), 0.12, -1, 0.03));
    }
    for (const dx of DOORS)
      for (const side of [1, -1]) {
        doorLines.push(outline(dx, 0.535, FLOOR + 0.05, FLOOR + 1.98, 0.22, side));
        const th = fusTheta(dx, WIN_Y + 0.05);
        const p = fusPt(dx, th * side, -0.006);
        const n = fusNormal(dx, th * side);
        o.position.set(...p);
        o.quaternion.copy(uprightQuat(n));
        o.scale.set(0.12, 0.17, 1);
        o.updateMatrix();
        doorWins.push(o.matrix.clone());
      }
    // linie łączeń sekcji kadłuba (obwodowe) – subtelne
    const joints = merge(
      [-24.5 - PF, -6.2, 6.0 + PA, 21.0 + PA].map((x) =>
        ribbon(
          refine([-Math.PI, Math.PI], 0.06).map((th) => fusPt(x, th)),
          (p) => new THREE.Vector3(0, p[1], p[2]).normalize(),
          0.03,
          0.006,
        ),
      ),
    );
    const doors = merge(doorLines);
    // anteny łopatkowe na grzbiecie i pod kadłubem (pochylone do tyłu)
    const ant: THREE.Matrix4[] = [];
    for (const x of [-21.5 - PF, -9.5, 0.5, 13.0 + PA]) {
      const s = fusSec(x);
      ant.push(box([x, s.yc + s.h + 0.13, 0], [0.42, 0.3, 0.035], [0, 0, -0.35]));
    }
    for (const x of [-24.0 - PF, -20.5 - PF, 13.5 + PA]) {
      const s = fusSec(x);
      ant.push(box([x, s.yc - s.h - 0.11, 0], [0.38, 0.26, 0.035], [0, 0, 0.35]));
    }
    /** Płaski element na poszyciu: położenie (x, θ), oś y wzdłuż normalnej kadłuba, rozmiar sz. */
    const flat = (x: number, th: number, sz: V3, lift = 0.004) => {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), fusNormal(x, th));
      return new THREE.Matrix4().compose(new THREE.Vector3(...fusPt(x, th, -lift)), q, new THREE.Vector3(...sz));
    };
    // czujniki na nosie (położenia zmierzone na modelach referencyjnych, d – odległość od czubka nosa, y – wysokość
    // względem osi kadłuba): po każdej burcie dwie rurki Pitota ok. 1,95 m za czubkiem, pod nimi łopatka kąta natarcia
    const probes: { a: V3; b: V3; c: V3 }[] = [];
    const sensors: THREE.Matrix4[] = [];
    const vanes: THREE.Matrix4[] = [];
    const plates: THREE.Matrix4[] = [];
    for (const side of [1, -1]) {
      for (const y of [-0.59, -0.84]) {
        const x = CK_TIP + 1.95;
        const th = fusTheta(x, y + FUS_DY) * side;
        const p = fusPt(x, th);
        const n = fusNormal(x, th);
        const b: V3 = [p[0] + n.x * 0.11, p[1] + n.y * 0.11, p[2] + n.z * 0.11];
        probes.push({ a: p, b, c: [b[0] - 0.16, b[1] + 0.005, b[2]] });
        sensors.push(flat(x, th, [0.09, 0.006, 0.09]));
      }
      // łopatka kąta natarcia: okrągła podstawa i płetwa skierowana do tyłu (lewa burta niżej, prawa wyżej)
      const xv = CK_TIP + 1.9;
      const thv = fusTheta(xv, (side > 0 ? -1.55 : -1.17) + FUS_DY) * side;
      sensors.push(flat(xv, thv, [0.13, 0.006, 0.13]));
      vanes.push(flat(xv + 0.03, thv, [0.12, 0.09, 0.012], 0.045));
      // kwadratowe panele z małym czujnikiem obok dolnego brzegu szyb bocznych
      const xs = CK_TIP + 2.37;
      const ths = fusTheta(xs, -0.01 + FUS_DY) * side;
      plates.push(flat(xs, ths, [0.32, 0.006, 0.28], 0.002));
      vanes.push(flat(xs + 0.02, ths, [0.08, 0.06, 0.01], 0.03));
    }
    // trzy małe czujniki na grzbiecie nosa nad owiewką radaru
    for (const z of [-0.2, 0, 0.2]) {
      const x = CK_TIP + 1.1;
      sensors.push(flat(x, fusThetaZ(x, Math.abs(z) + 0.001) * Math.sign(z || 1), [0.08, 0.025, 0.08], 0.012));
    }
    // wycieraczki: dwie, zaparkowane pionowo przy słupku środkowym (od dolnego brzegu szyb ku górze)
    const wipers = [1, -1].map((side) => {
      const at = (d: number, z: number, lift: number): V3 => fusPt(CK_TIP + d, fusThetaZ(CK_TIP + d, z) * side, -lift);
      return { a: at(1.5, 0.15, 0.03), b: at(1.62, 0.13, 0.035), c: at(2.15, 0.1, 0.03) };
    });
    // porty ciśnienia statycznego: po trzy płaskie otworki na każdej burcie za kokpitem (dla prędkościomierza i wysokościomierza)
    const statics: THREE.Matrix4[] = [];
    for (const side of [1, -1])
      for (const [d, y] of [
        [5.55, -0.3],
        [5.8, -0.3],
        [5.55, -0.55],
      ] as const) {
        const x = CK_TIP + d;
        statics.push(flat(x, fusTheta(x, y + FUS_DY) * side, [0.1, 0.006, 0.1]));
      }
    // maszty odpływowe: małe płetwy pod kadłubem, pochylone do tyłu – odprowadzają wodę i skropliny z dala od poszycia
    const masts: THREE.Matrix4[] = [];
    for (const x of [-19.5 - PF, 12.6 + PA]) {
      const p = fusPt(x, Math.PI);
      masts.push(box([p[0] + 0.05, p[1] - 0.09, 0], [0.26, 0.2, 0.03], [0, 0, -0.55]));
    }
    // wloty powietrza do pakietów klimatyzacji: płaskie, zagłębione wloty NACA pod owiewką centropłata
    const ramAir: THREE.Matrix4[] = [];
    for (const z of [0.95, -0.95]) {
      ramAir.push(box([-6.6, -4.335, z], [1.05, 0.012, 0.26]));
      ramAir.push(box([-6.85, -4.33, z], [0.5, 0.014, 0.16]));
    }
    // zawór wylotowy ciśnienia w kabinie: prostokątna klapka na spodzie tylnej części kadłuba (prawa strona)
    const outflow = [flat(15.2 + PA, -(Math.PI - 0.5), [0.55, 0.012, 0.4])];
    return { shell, full, cut, apuCut, radarCut, cargoCut, doorCut, cockpit, ckWall, ckFrame, ckTrim, ckLining, ckMask, fairing, bellySeams, bays, legBays, wins, doorWins, doors, joints, ant, probes, sensors, vanes, plates, wipers, statics, masts, ramAir, outflow, win: winShape(1, 0), winDepth: winShape(0.86, 0), frame: winShape(1.12, 1.0), lip: winShape(1.2, 1.12) };
  }), []);
  // moduł kadłuba: poszycie całe – samolot przecina płaszczyzna symetrii (przycinanie w shaderze), nie wyrwa w burcie
  const shell = useShared(g.shell, apu ? g.apuCut : radar ? g.radarCut : open && view === 'cargo' ? g.cargoCut : doorsOpen ? g.doorCut : g.full);
  const unit = cached('unit-box', () => new THREE.BoxGeometry(1, 1, 1));
  // zakładka o ciśnieniu: kadłub pęcznieje pod różnicą ciśnień (naprawdę o ok. 2–3 mm – tu przesadzone)
  const body = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!body.current) return;
    const k = view === 'press' ? 1 + 0.035 * FUS_LIVE.dp : 1;
    body.current.scale.set(1, k, k);
  });
  return (
    <group ref={body}>
      <mesh geometry={shell}>
        <M k="paint" side={THREE.DoubleSide} />
      </mesh>
      {/* szyby kokpitu: półprzezroczyste, w czarnej ramce; za nimi wykładzina kokpitu (wyposażenie – model kokpitu) */}
      <mesh geometry={g.ckLining}>
        <M k="#b9bfc6" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.ckTrim}>
        <M k="#8f979f" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.ckWall}>
        <M k="#5b636c" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.ckFrame}>
        <M k="#0b0e12" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.ckMask}>
        <M k="#101317" side={THREE.DoubleSide} />
      </mesh>
      <FuselagePaint />
      <mesh geometry={g.cockpit} renderOrder={2}>
        <M k="glass" side={THREE.DoubleSide} opacity={0.42} />
      </mesh>
      <mesh geometry={g.fairing}>
        <M k="belly" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.bellySeams}>
        <M k="#8d96a0" side={THREE.DoubleSide} />
      </mesh>
      {/* wnęki podwozia: ciemne wnętrza widoczne tylko przez otwarte drzwi */}
      {/* w przekroju (moduł kadłuba) bez ścianek wnęk – zasłaniałyby schowane podwozie */}
      {!open && (
        <mesh geometry={g.bays} raycast={() => null}>
          <M k="#15191e" side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh geometry={g.legBays} raycast={() => null}>
        <M k="cove" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.doors}>
        <M k="seam" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.joints}>
        <M k="#c8cdd3" side={THREE.DoubleSide} />
      </mesh>
      {/* okna z zewnątrz: przyciemniana szyba z odbiciami, głębiej ciemniejsza (wnęka i wewnętrzna szyba), gumowa
          uszczelka i delikatny rant poszycia wokół */}
      <Inst geo={g.lip} mats={g.wins} k="#c3cad2" />
      <Inst geo={g.frame} mats={g.wins} k="#30363e" />
      <Inst geo={g.win} mats={g.wins} k="winGlass" />
      <Inst geo={g.winDepth} mats={g.wins} k="winDeep" />
      {/* okienka drzwi: w module drzwi są na samych drzwiach (otwierają się razem z nimi) */}
      {!doorsOpen && <Inst geo={g.win} mats={g.doorWins} k="glass" />}
      <Inst geo={unit} mats={g.ant} k="#c3c9d0" />
      {/* drobne elementy poszycia: porty statyczne, maszty odpływowe, wloty klimatyzacji, zawór wylotowy */}
      <Inst geo={cached('disc', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 28))} mats={g.statics} k="#3b4048" />
      <Inst geo={unit} mats={g.masts} k="#9aa3ad" />
      <Inst geo={unit} mats={g.ramAir} k="#262b31" />
      <Inst geo={unit} mats={g.outflow} k="#5b636c" />
      {g.probes.map((pr, i) => (
        <group key={i}>
          <Strut a={pr.a} b={pr.b} r={0.022} />
          <Strut a={pr.b} b={pr.c} r={0.018} />
        </group>
      ))}
      {/* czujniki na nosie: podstawy, łopatki kąta natarcia; wycieraczki przy słupku środkowym */}
      <Inst geo={cached('disc', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 28))} mats={g.sensors} k="#aab2bb" />
      <Inst geo={unit} mats={g.plates} k="#b4bcc5" />
      <Inst geo={unit} mats={g.vanes} k="#3b4048" />
      {g.wipers.map((w, i) => (
        <group key={i}>
          <Strut a={w.a} b={w.b} r={0.014} k="#1d2126" />
          <Strut a={w.b} b={w.c} r={0.01} k="#1d2126" />
        </group>
      ))}
      {/* światła antykolizyjne (czerwone, migające) na grzbiecie i pod owiewką oraz białe strobo w stożku ogonowym */}
      <Lamp p={fusPt(-1.5, 0)} n={[0, 1, 0]} color="#ff2a1a" r={0.16} halo={2.4} blink="beacon" lt="beacon" />
      <Lamp p={[-3.0, -4.4, 0]} n={[0, -1, 0]} color="#ff2a1a" r={0.16} halo={2.4} blink="beacon" lt="beacon" />
      <Lamp p={[33.1 + PA, 1.62 + FUS_DY, 0]} n={[1, 0.05, 0]} color="#ffffff" r={0.09} halo={4.4} blink="strobe1" sector={SECTOR.tailStrobe} lt="strobe" />
      {ext?.night && (
        <>
          <FlashLight p={[fusPt(-1.5, 0)[0], fusPt(-1.5, 0)[1] + 0.6, 0]} lt="beacon" blink="beacon" color="#ff3020" power={28} dist={28} />
          <FlashLight p={[-3.0, -5.0, 0]} lt="beacon" blink="beacon" color="#ff3020" power={28} dist={22} />
          <FlashLight p={[33.6 + PA, 1.62 + FUS_DY, 0]} lt="strobe" blink="strobe1" color="#eef4ff" power={140} dist={40} />
        </>
      )}
      {open && <Interior view={view} labels={labels} pick={pick} />}
      {/* moduł drzwi: przez otwarte drzwi widać kabinę */}
      {/* zamknięty kadłub z otworami drzwi; widok ładowni – kontenery jadą jak w scenariuszu załadunku (cykl obsługi) */}
      {doorsOpen && !open && <Interior view={view === 'cargo' ? 'cargo' : 'home'} labels={false} doorHoles />}
      {open && view === 'cargo' && <CargoOps />}
      {open && view === 'decomp' && <DecompFx />}
    </group>
  );
}

/** Wiele jednakowych brył w jednym wywołaniu rysowania. */
function Inst({ geo, mats, k, side, emit, cap }: { geo: THREE.BufferGeometry; mats: THREE.Matrix4[]; k: string; side?: THREE.Side; emit?: string; cap?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    mats.forEach((mt, i) => m.setMatrixAt(i, mt));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [mats]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, mats.length]}>
      <M k={k} side={cap ? THREE.DoubleSide : side} emit={emit} cap={cap} />
    </instancedMesh>
  );
}

/**
 * Bryły z własnymi materiałami (opony, tarcze hamulców) nie są przycinane w shaderze. Przy przekroju kadłuba chowamy
 * każdą taką bryłę, której środek leży w zdjętej połowie samolotu (poza zakresem przycinania).
 */
export function ClipCull({ children }: { children: ReactNode }) {
  const clip = useContext(ClipCtx);
  const ref = useRef<THREE.Group>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!clip || !ref.current) return;
    const lo = clip.uClip.value.x;
    const hi = clip.uClip.value.y;
    ref.current.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      // bryły z materiałem przycinanym shaderem (np. drzwi wnęki) przycina sam materiał – nie chowamy ich w całości
      if (m.userData.noCull) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      v.copy(m.geometry.boundingSphere!.center).applyMatrix4(m.matrixWorld).applyMatrix4(clip.uInv.value);
      // chowamy bryły poza wycinkiem i przywracamy tylko te, które schowaliśmy sami – resztą widoczności rządzi podwozie
      // krawędź cięcia jest poszarpana w pasie lo…lo+amp – wszystko ze środkiem przed nim znika
      const amp = clip.uClip.value.z;
      const out = (lo > -50 && v.z < lo + amp) || (hi < 50 && v.z > hi - amp);
      if (out && m.visible) {
        m.visible = false;
        m.userData.clipHid = true;
      } else if (!out && m.userData.clipHid) {
        m.visible = true;
        delete m.userData.clipHid;
      }
    });
  });
  return <group ref={ref}>{children}</group>;
}

const box = (p: V3, s: V3, rot: V3 = [0, 0, 0]) => {
  const o = new THREE.Object3D();
  o.position.set(...p);
  o.rotation.set(...rot);
  o.scale.set(...s);
  o.updateMatrix();
  return o.matrix.clone();
};

/** Wnętrze kadłuba (tylko w trybie „kadłub”): kokpit, kabina, luki, centropłat, wnęka podwozia, gródź. */
/**
 * Widok modułu kadłuba: strona główna (pełny przekrój z wyposażeniem), konstrukcja (sam szkielet), ciśnienie w kabinie
 * (kadłub „oddycha”) i ładownie (załadunek kontenerów).
 */
export type FusView = 'home' | 'struct' | 'press' | 'decomp' | 'water' | 'fire' | 'cargo';
/**
 * Stan sceny modułu kadłuba zmieniany co klatkę przez zakładki (bez przerysowania React): różnica ciśnień 0…1
 * (kadłub pęcznieje – pokazowo przesadzone) i postęp załadunku ładowni (liczba kontenerów na miejscu, ułamkowa).
 */
/** cargoT – czas scenariusza załadunku (s; −1 – przed „Rozpocznij”: kontenery na wózkach, drzwi zamknięte). */
/** fog – gęstość mgły w kabinie 0…1, masks – postęp wypadania masek tlenowych 0…1, maskAge – czas od wypadnięcia (s). */
export const FUS_LIVE = { dp: 0, cargo: 99, outflow: 1, cargoT: 1e9, fog: 0, masks: 0, maskAge: 0, cargoUnload: false };

/** Ładownie pod podłogą: podłoga i zakres w x. */
/** Podłoga ładowni na wysokości progu drzwi ładowni (AC A350-900, rys. 2-3-0: C1 ≈ 3,09 m nad ziemią). */
const CARGO_Y = -3.04;
const HOLDS: [number, number][] = [
  // od przodu: zbiorniki wody pitnej; z tyłu, przed kesonem centropłata – mieszalnik klimatyzacji i recyrkulacja
  [-24.6, -10.2],
  // tylny luk kończy się tam, gdzie spód kadłuba zaczyna się podnosić ku ogonowi (dalej kontenery wystawałyby z poszycia)
  [4.6, 11.2],
];
/** Drzwi ładowni (prawa burta): przednie i tylne – stąd kontenery wjeżdżają do luku. */
export const CARGO_DOORS = CARGO_DOOR.xs;
export const CARGO_DOOR_X = CARGO_DOOR.xs;
/** Miejsca kontenerów LD3 w kolejności załadunku (przednia ładownia od przodu, potem tylna). */
export const CARGO_SLOTS: { x: number; z: number; hold: number; j: number }[] = HOLDS.flatMap(([a, b], hold) => {
  const out: { x: number; z: number; hold: number; j: number }[] = [];
  for (let x = a + 0.85; x <= b - 0.8; x += 1.66) for (const z of [1.03, -1.03]) out.push({ x, z, hold, j: 0 });
  // kolejność wjazdu (j): od miejsc najdalej od drzwi, w każdym rzędzie najpierw pas dalszy od drzwi (lewa burta)
  const door = CARGO_DOOR.xs[hold];
  [...out].sort((p, q) => Math.abs(q.x - door) - Math.abs(p.x - door) || q.z - p.z).forEach((sl, j) => (sl.j = j));
  return out;
});

/** Grupy części kadłuba (kolory podpisów na stronie głównej modułu). */
export const FUS_GROUPS: { id: string; name: string; color: string }[] = [
  { id: 'nose', name: 'kokpit i elektronika', color: '#7dd3fc' },
  { id: 'cabin', name: 'kabina', color: '#fde68a' },
  { id: 'cargo', name: 'ładownie i zbiorniki', color: '#fdba74' },
  { id: 'struct', name: 'konstrukcja', color: '#bef264' },
  { id: 'sys', name: 'instalacje', color: '#c4b5fd' },
  { id: 'skin', name: 'na poszyciu', color: '#e2e8f0' },
];
const fusGroupColor = (g: string) => FUS_GROUPS.find((x) => x.id === g)?.color ?? '#e2e8f0';
/**
 * Części kadłuba z opisami – klikane podpisy na stronie głównej modułu. Podpisy stoją przy lewej połowie samolotu,
 * blisko płaszczyzny przekroju (z ≈ 0,3), więc nie zasłania ich poszycie.
 */
export const FUS_PART_INFO: Record<string, { name: string; group: string; pos: V3; sub?: boolean; desc: string }> = {
  radar: { name: 'radar pogodowy', group: 'nose', pos: [RADOME_X - 0.5, -0.35 + FUS_DY, 0.3], desc: 'Pod opływową osłoną z materiału przepuszczającego fale radiowe obraca się płyta anteny. Przeszukuje przestrzeń przed samolotem i pokazuje opady na ekranie nawigacyjnym w kokpicie. Pod nią, na ścianie kadłuba, są dwa nadajniki-odbiorniki. Więcej – w module radaru.' },
  fwdBulk: { name: 'gródź przednia', group: 'struct', pos: [RADOME_X + 0.1, 0.4 + FUS_DY, 0.3], sub: true, desc: 'Płaska, usztywniona ściana, od której z przodu zaczyna się szczelna część kadłuba (ta, w której utrzymuje się ciśnienie). Przed nią, pod osłoną radaru, jest zwykłe ciśnienie zewnętrzne, więc w przelocie na każdy metr kwadratowy grodzi naciska kilka ton. Sięga do podłogi kokpitu – niżej, za nią, jest nieszczelna wnęka podwozia przedniego.' },
  avionics: { name: 'przedział awioniki', group: 'nose', pos: [-28.75, -2.8 + FUS_DY, 0.3], desc: 'Pod podłogą, tuż za wnęką podwozia przedniego, stoją regały z komputerami samolotu: do sterowania, nawigacji, łączności i prowadzenia lotu. Każdy komputer to skrzynka, którą wsuwa się na półkę i wymienia w kilka minut. Chłodzi je powietrze tłoczone kanałami wzdłuż regałów. Mechanicy wchodzą tu po drabince przez właz w spodzie kadłuba.' },
  restF: { name: 'odpoczynek pilotów', group: 'cabin', pos: [-28.8, 2.75 + FUS_DY, 0.3], sub: true, desc: 'Na długich lotach na pokładzie jest dodatkowa załoga, a piloci odpoczywają na zmianę. Mają mały przedział z dwiema kojami nad kabiną, tuż za kokpitem. Wchodzi się do niego po stromych schodach od strony pierwszych drzwi. W środku są koje z pościelą, zasłony i lampki do czytania.' },
  business: { name: 'klasa biznes', group: 'cabin', pos: [-23.0, 0.9, 0.3], desc: 'Fotele w układzie 1-2-1 (cztery w rzędzie), ustawione skośnie jak jodełka – z każdego można wyjść prosto do przejścia, bez przechodzenia nad sąsiadem. Fotel rozkłada się w płaskie łóżko. Od sąsiada oddziela go wysoka osłona ze schowkiem, obok jest lampka i panel do ustawiania fotela, a przed nim – duży ekran. Rzędy są co ok. 2 m.' },
  economy: { name: 'klasa ekonomiczna 3-3-3', group: 'cabin', pos: [0.5, 0.75, 0.3], desc: 'Dziewięć foteli w rzędzie (3-3-3), rzędy co ok. 81 cm. Szeroki kadłub A350 mieści też ciaśniejszy układ – dziesięć foteli w rzędzie (3-4-3). Nad fotelami są schowki na bagaż podręczny: po bokach i pośrodku.' },
  galley: { name: 'kuchnie i toalety', group: 'cabin', pos: [DOORS[2] - 1.0, FLOOR + 2.3, 0.3], sub: true, desc: 'Przy drzwiach są kuchnie – z wózkami, piekarnikami i chłodziarkami – oraz toalety. Toalety są podciśnieniowe: różnica ciśnień między kabiną a powietrzem na zewnątrz zasysa ścieki rurą do zbiorników z tyłu kadłuba.' },
  restA: { name: 'odpoczynek personelu pokładowego', group: 'cabin', pos: [12.8 + PA, 2.65 + FUS_DY, 0.3], sub: true, desc: 'Nad tylną częścią kabiny są koje dla personelu pokładowego. Na lotach trwających kilkanaście godzin stewardesy i stewardzi pracują na zmiany.' },
  duct: { name: 'kanał klimatyzacji i wiązki kabli', group: 'sys', pos: [-6, 2.85 + FUS_DY, 0.3], sub: true, desc: 'Nad sufitem biegnie główny kanał klimatyzacji – okrągła rura owinięta izolacją, podwieszona do szkieletu kadłuba. Co kilka metrów odchodzą od niej odgałęzienia do nawiewów nad schowkami, a zużyte powietrze uchodzi z kabiny kratkami przy podłodze. Po bokach, w korytkach, biegną wiązki kabli: zasilania i przesyłu danych (niebieska to światłowód). Kable z lewej i prawej strony prowadzi się osobno, żeby jedno uszkodzenie nie przecięło obu zapasowych kopii instalacji.' },
  floor: { name: 'podłoga i belki podłogi', group: 'struct', pos: [-12.5, FLOOR - 0.35, 0.3], sub: true, desc: 'Płyty podłogi leżą na poprzecznych belkach, podpartych od spodu słupkami. W podłodze są szyny do mocowania foteli – linia lotnicza może więc zmienić układ kabiny.' },
  fwdHold: { name: 'ładownia przednia', group: 'cargo', pos: [-17.0, -2.3, 0.3], desc: 'Kontenery z bagażem wjeżdżają przez drzwi w prawym boku i jadą po rolkach w podłodze. Ładownia jest szczelna i ogrzewana, więc można w niej przewozić np. zwierzęta. Ma czujniki dymu i instalację gaśniczą.' },
  water: { name: 'woda pitna', group: 'cargo', pos: [-25.3, -1.55, 0.3], sub: true, desc: 'Zbiorniki wody do kuchni i umywalek. Przed lotem napełnia się je z cysterny przez zawór w spodzie kadłuba, a do kranów wodę wypycha sprężone powietrze.' },
  centre: { name: 'centropłat (zbiornik centralny)', group: 'struct', pos: [-4.6, -0.55, 0.3], desc: 'Środkowa część skrzydła – mocna skrzynia, która przechodzi przez kadłub pod podłogą kabiny i łączy oba skrzydła. Przenosi na kadłub siłę, z jaką skrzydła niosą samolot, a w środku mieści centralny zbiornik paliwa. Więcej – w module skrzydła i w zakładce o tankowaniu w module silnika.' },
  bay: { name: 'wnęka podwozia i belka kilowa', group: 'struct', pos: [2.4, -3.6, 0.3], desc: 'Za środkową częścią skrzydła chowają się koła podwozia głównego. Wnęka to wielki otwór w spodzie kadłuba, więc obciążenia przejmuje mocna belka biegnąca pod nią (belka kilowa), a nad kołami jest szczelna płyta. Więcej – w module podwozia.' },
  aftHold: { name: 'ładownia tylna', group: 'cargo', pos: [7.0, -2.3, 0.3], desc: 'Druga ładownia na kontenery, za wnęką podwozia, z własnymi drzwiami w prawym boku. Od tego, jak rozłoży się ładunek między ładowniami, zależy położenie środka ciężkości samolotu.' },
  bulkHold: { name: 'bagaż luzem · zbiorniki ścieków', group: 'cargo', pos: [11.6 + PA, -1.15 + FUS_DY, 0.3], sub: true, desc: 'Za tylną ładownią jest miejsce na bagaż bez kontenerów: spóźnione walizki, wózki dziecięce, sprzęt sportowy. Obok stoją zbiorniki ścieków z toalet, opróżniane na ziemi przez zawór w spodzie kadłuba.' },
  rearBulk: { name: 'gródź ciśnieniowa', group: 'struct', pos: [20.8 + PA, 0.55 + FUS_DY, 0.3], desc: 'Kopuła, która z tyłu zamyka szczelną część kadłuba. Jest wypukła jak dno puszki z napojem – taki kształt najlepiej znosi ciśnienie. Za nią, w zwężającym się ogonie, nie ma już ciśnienia kabiny.' },
  jack: { name: 'śruba trymera statecznika', group: 'sys', pos: [26.2 + PA, 2.05 + FUS_DY, 0.3], sub: true, desc: 'Cały statecznik poziomy (mniejsze „skrzydło” na ogonie) może się powoli obracać – przestawia go długa śruba z napędem hydraulicznym. Tak samolot jest wyważany przy różnych prędkościach i różnym rozłożeniu ładunku, żeby stery wysokości nie musiały być przez cały czas wychylone.' },
  apu: { name: 'APU', group: 'sys', pos: [33.6, 1.35 + FUS_DY, 0.3], desc: 'Mały silnik turbinowy w samym końcu kadłuba, za ścianą ogniową (APU – pomocniczy zespół napędowy). Na ziemi daje prąd i sprężone powietrze do klimatyzacji i uruchamiania silników, w locie może być zapasowym źródłem prądu. Powietrze wpada przez klapkę w boku kadłuba, a spaliny wylatują na samym końcu ogona. Więcej – w module APU.' },
  fireWall: { name: 'gródź ogniowa APU', group: 'struct', pos: [APU_HATCH.x0 - 0.5, 1.15 + FUS_DY, 0.3], sub: true, desc: 'Tytanowa ściana oddziela przedział APU od reszty ogona, żeby ewentualny pożar nie przeszedł dalej. W przedziale są czujniki ognia i dysze, przez które butla wypuszcza środek gaśniczy. Więcej – w module APU.' },
  statics: { name: 'porty ciśnienia statycznego', group: 'skin', pos: fusPt(CK_TIP + 5.7, fusTheta(CK_TIP + 5.7, -0.4 + FUS_DY), -0.6), sub: true, desc: 'Małe otworki w poszyciu, równo z powierzchnią. Mierzą ciśnienie powietrza wokół samolotu – na tej podstawie komputery liczą wysokość lotu i to, jak szybko samolot się wznosi albo zniża.' },
  pitot: { name: 'rurki Pitota i czujniki kąta natarcia', group: 'skin', pos: [CK_TIP + 1.95, -0.9 + FUS_DY, 1.75], sub: true, desc: 'Rurki Pitota to rurki skierowane do przodu, w które wpada pęd powietrza – z jego nacisku komputery liczą prędkość samolotu. Obracające się łopatki obok mierzą, pod jakim kątem powietrze napływa na samolot (kąt natarcia). Wszystkie są podgrzewane, żeby nie oblodziły się w chmurach.' },
  mast: { name: 'maszt odpływowy', group: 'skin', pos: [-19.5 - PF, -3.6 + FUS_DY, 0.6], sub: true, desc: 'Wystający, podgrzewany maszt pod kadłubem. Wyrzuca na zewnątrz wodę z umywalek i kuchni (nie ścieki z toalet) – daleko od poszycia, żeby nie zamarzała na kadłubie.' },
  ram: { name: 'wloty powietrza klimatyzacji', group: 'skin', pos: [-6.6, -4.7, 1.6], sub: true, desc: 'Wloty w osłonie pod kadłubem. Doprowadzają zimne powietrze z zewnątrz do chłodnic klimatyzacji. W locie ich klapki się przymykają, żeby zmniejszyć opór.' },
  outflow: { name: 'zawór wylotowy kabiny', group: 'skin', pos: [15.2 + PA, -2.9 + FUS_DY, 0.3], sub: true, desc: 'Klapka w prawym boku kadłuba za skrzydłem (w przekroju zdjęta razem z prawą połową samolotu). Wypuszcza powietrze z kabiny – to, jak bardzo jest otwarta, decyduje o ciśnieniu w środku. Zobacz zakładkę „Ciśnienie i klimatyzacja”.' },
};

/** Klikane podpisy części kadłuba (strona główna modułu). */
function FuselageLabels({ pick }: { pick?: WingPick }) {
  return (
    <>
      {Object.entries(FUS_PART_INFO).map(([id, p]) => {
        const on = pick?.selected === id;
        return (
          <Lbl key={id} pos={p.pos} sub={p.sub} color={on ? '#ffffff' : fusGroupColor(p.group)} active={on} onClick={pick ? () => pick.onSelect(on ? null : id) : undefined}>
            {p.name}
          </Lbl>
        );
      })}
    </>
  );
}

/** Grupa jednakowych brył wyposażenia: kształt, kolor, ewentualna poświata (lampki, ekrany). */
type DetailGroup = { g: 'box' | 'capsule' | 'cylX' | 'cylV' | 'cone' | 'ringH' | 'sphere'; k: string; e?: string; m: THREE.Matrix4[] };
/**
 * Szczegóły wnętrza kadłuba (przekrój w module kadłuba): kuchnie z wózkami, piekarnikami i schowkami, toalety
 * w przekroju (muszla, umywalka, lustro), zbiorniki wody pitnej i ścieków z rurami, wyposażenie foteli, oświetlenie
 * kabiny, regały awioniki z modułami i drobiazgi kokpitu.
 */
function interiorDetail(half: (y: number, x?: number) => number, cutaway = true): DetailGroup[] {
  const groups = new Map<string, DetailGroup>();
  const add = (g: DetailGroup['g'], k: string, m: THREE.Matrix4, e?: string) => {
    const key = `${g}|${k}|${e ?? ''}`;
    if (!groups.has(key)) groups.set(key, { g, k, e, m: [] });
    groups.get(key)!.m.push(m);
  };
  const B = (k: string, p: V3, s: V3, rot?: V3, e?: string) => add('box', k, box(p, s, rot), e);
  /** Półszerokość wnętrza kadłuba na wysokości y w x (0, gdy y jest poza przekrojem) – ogon szybko się zwęża. */
  const hw = (y: number, x: number) => Math.max(0, half(y, x) + 0.2);

  // ---------- kuchnie: za każdymi drzwiami, przodem do drzwi ----------
  const Bmain = B;
  DOORS.forEach((dx) => {
    const f = dx + 0.75; // front kuchni
    // szerokość kuchni dopasowana do przekroju przy jej tylnej ścianie (współrzędne z mnożone przez gw)
    const gw = Math.min(1, (Math.min(hw(FLOOR + 0.02, dx + 1.65), hw(FLOOR + 2.0, dx + 1.65)) - 0.3) / 1.2);
    const B0 = Bmain;
    const B = (k: string, p: V3, sz: V3, rot?: V3, e?: string) => B0(k, [p[0], p[1], p[2] * gw], [sz[0], sz[1], sz[2] * gw], rot, e);
    // obudowa: tylna ściana, boki, dach – w środku osobne bryły, więc w przekroju widać, co jest w kuchni
    B('#e7e2d6', [dx + 1.62, FLOOR + 1.0, 0], [0.06, 2.0, 2.4]); // tylna ściana
    for (const z of [-1.18, 1.18]) B('#e7e2d6', [dx + 1.2, FLOOR + 1.0, z], [0.9, 2.0, 0.04]); // boki
    B('#e7e2d6', [dx + 1.2, FLOOR + 1.98, 0], [0.9, 0.04, 2.4]); // dach
    B('#2b3036', [dx + 1.585, FLOOR + 0.53, 0], [0.01, 1.04, 2.3]); // ciemne tło wnęki na wózki
    for (const z of [-0.66, -0.22, 0.22, 0.66]) B('#d6d1c4', [dx + 1.2, FLOOR + 0.53, z], [0.8, 1.04, 0.02]); // przegródki
    for (const z of [-0.88, -0.44, 0, 0.44, 0.88]) {
      B('#c3c8ce', [f + 0.41, FLOOR + 0.52, z], [0.8, 0.98, 0.4]); // wózek – pełnej głębokości wnęki
      B('#4b5563', [f, FLOOR + 0.95, z], [0.02, 0.035, 0.32]); // uchwyt
      B('#dc2626', [f + 0.005, FLOOR + 0.1, z + 0.13], [0.02, 0.05, 0.07]); // hamulec wózka
    }
    B('#9aa1a9', [dx + 1.2, FLOOR + 1.07, 0], [0.9, 0.05, 2.36]); // blat
    for (const z of [-0.6, 0.6]) {
      B('#d1d5db', [f + 0.245, FLOOR + 1.42, z], [0.55, 0.42, 0.52]); // piekarnik
      B('#3a3f46', [f + 0.27, FLOOR + 1.42, z], [0.44, 0.3, 0.42]); // komora piekarnika
      B('#111827', [f - 0.035, FLOOR + 1.44, z], [0.01, 0.22, 0.36]); // szyba piekarnika
    }
    B('#9ca3af', [f + 0.18, FLOOR + 1.3, 0], [0.4, 0.38, 0.32]); // ekspres do kawy
    B('#1f2937', [f - 0.05, FLOOR + 1.16, 0], [0.05, 0.1, 0.12]); // dzbanek
    for (const z of [-0.9, -0.45, 0, 0.45, 0.9]) B('#d6d1c4', [f + 0.265, FLOOR + 1.83, z], [0.55, 0.26, 0.43]); // schowki górne
    B('#fff7e0', [f - 0.02, FLOOR + 1.66, 0], [0.02, 0.025, 2.3], undefined, '#fff2cc'); // oświetlenie blatu
    // fotel personelu przy drzwiach (jumpseat): składany, na panelu ściennym obok kuchni, z szelkami;
    // obok słuchawka interkomu i latarka w uchwycie (lampka ładowania)
    const jz = Math.min(1.62, hw(FLOOR + 0.05, dx + 0.8) - 0.35) / gw;
    B('#e7e2d6', [dx + 0.79, FLOOR + 1.0, jz], [0.08, 2.0, 0.62]); // panel ścienny
    B('#334155', [dx + 0.72, FLOOR + 0.93, jz], [0.07, 0.55, 0.44]); // oparcie
    B('#334155', [dx + 0.72, FLOOR + 1.33, jz], [0.07, 0.2, 0.3]); // zagłówek
    B('#334155', [dx + 0.55, FLOOR + 0.56, jz], [0.34, 0.07, 0.44]); // siedzisko (rozłożone)
    for (const dz of [0.23, -0.23]) B('#9ca3af', [dx + 0.6, FLOOR + 0.52, jz + dz], [0.3, 0.04, 0.02]); // wsporniki siedziska
    for (const dz of [0.1, -0.1]) B('#64748b', [dx + 0.68, FLOOR + 0.95, jz + dz], [0.02, 0.52, 0.05]); // szelki
    B('#64748b', [dx + 0.53, FLOOR + 0.61, jz], [0.02, 0.05, 0.44]); // pas biodrowy
    B('#d1d5db', [dx + 0.52, FLOOR + 0.64, jz], [0.03, 0.08, 0.08]); // klamra
    B('#1f2937', [dx + 0.745, FLOOR + 1.6, jz + 0.22], [0.04, 0.18, 0.07]); // słuchawka interkomu
    B('#f59e0b', [dx + 0.745, FLOOR + 0.25, jz + 0.22], [0.05, 0.2, 0.07]); // latarka
    B('#22c55e', [dx + 0.72, FLOOR + 0.37, jz + 0.22], [0.01, 0.02, 0.02], undefined, '#22c55e');
  });

  // ---------- toalety: przed drzwiami 2, 3 i 4, po obu burtach ----------
  // moduł toalety: muszla przy tylnej ścianie (siada się przodem do kierunku lotu), umywalka z szafką przy przedniej;
  // od strony przejścia (lewa burta – w przekroju widać do środka) drzwi składane, otwarte
  const C = (g: DetailGroup['g'], k: string, p: V3, sz: V3, e?: string) => add(g, k, box(p, sz), e);
  DOORS.slice(1).forEach((dx) => {
    const lx = dx - 1.25;
    for (const s of [1, -1]) {
      const zc = Math.min(1.7, Math.min(hw(FLOOR + 0.02, lx + 0.5), hw(FLOOR + 2.1, lx + 0.5)) - 0.65) * s;
      const zo = zc + 0.46 * s; // ściana od strony burty
      const zi = zc - 0.475 * s; // strona przejścia
      // ściany, sufit, podłoga
      B('#e8e3d8', [lx - 0.5, FLOOR + 1.05, zc], [0.04, 2.1, 0.95]);
      B('#e8e3d8', [lx + 0.5, FLOOR + 1.05, zc], [0.04, 2.1, 0.95]);
      B('#e8e3d8', [lx, FLOOR + 1.05, zo + 0.02 * s], [1.0, 2.1, 0.04]);
      B('#e8e3d8', [lx, FLOOR + 2.1, zc], [1.0, 0.04, 0.95]);
      B('#64748b', [lx, FLOOR + 0.01, zc], [0.98, 0.02, 0.93]);
      // w przekroju lewa toaleta jest otwarta (widać do środka); w pełnej kabinie obie mają ściany od przejścia
      if (s < 0 || !cutaway) B('#e8e3d8', [lx, FLOOR + 1.05, zi], [1.0, 2.1, 0.04]);
      if (s > 0 && cutaway) {
        // otwarte drzwi składane przy przedniej ścianie i nadproże z lampką „wolne”
        B('#e7e2d6', [lx - 0.43, FLOOR + 0.98, zi + 0.2 * s], [0.04, 1.9, 0.4], [0, 0.35 * s, 0]);
        B('#d6d1c4', [lx - 0.3, FLOOR + 0.98, zi + 0.36 * s], [0.04, 1.9, 0.02]);
        B('#e8e3d8', [lx, FLOOR + 2.0, zi], [1.0, 0.2, 0.04]);
        B('#22c55e', [lx - 0.25, FLOOR + 2.0, zi - 0.025 * s], [0.12, 0.06, 0.01], undefined, '#22c55e');
      }
      // muszla: obudowa, misa, deska, podniesiona klapa, przycisk spłukiwania próżniowego
      B('#e5e7eb', [lx + 0.27, FLOOR + 0.2, zc], [0.44, 0.4, 0.42]);
      C('cone', '#f8fafc', [lx + 0.22, FLOOR + 0.43, zc], [0.4, 0.07, 0.34]);
      C('cylV', '#334155', [lx + 0.22, FLOOR + 0.462, zc], [0.24, 0.005, 0.19]);
      C('ringH', '#f1f5f9', [lx + 0.22, FLOOR + 0.475, zc], [0.38, 0.38, 0.32]);
      B('#f1f5f9', [lx + 0.455, FLOOR + 0.72, zc], [0.03, 0.48, 0.36]);
      B('#2563eb', [lx + 0.475, FLOOR + 1.12, zc - 0.25 * s], [0.01, 0.06, 0.1]);
      B('#cbd5e1', [lx + 0.25, FLOOR + 0.68, zo - 0.03 * s], [0.14, 0.12, 0.04]); // papier
      B('#9ca3af', [lx + 0.1, FLOOR + 1.0, zo - 0.03 * s], [0.42, 0.03, 0.03]); // uchwyt
      // umywalka: szafka z drzwiczkami, blat z wpuszczoną misą, kran, lustro w ramie z lampą
      B('#ded8cc', [lx - 0.33, FLOOR + 0.42, zc], [0.32, 0.84, 0.72]);
      for (const dz of [0.18, -0.18]) {
        B('#ece7dc', [lx - 0.165, FLOOR + 0.42, zc + dz], [0.01, 0.74, 0.33]);
        B('#9ca3af', [lx - 0.155, FLOOR + 0.66, zc + dz * 0.15], [0.01, 0.12, 0.015]);
      }
      B('#f1f5f9', [lx - 0.33, FLOOR + 0.86, zc], [0.34, 0.04, 0.74]);
      C('cylV', '#94a3b8', [lx - 0.32, FLOOR + 0.875, zc], [0.24, 0.02, 0.36]);
      C('cylV', '#d1d5db', [lx - 0.46, FLOOR + 0.95, zc], [0.035, 0.14, 0.035]);
      B('#d1d5db', [lx - 0.41, FLOOR + 1.0, zc], [0.1, 0.02, 0.022]);
      B('#9ca3af', [lx - 0.482, FLOOR + 1.45, zc], [0.01, 0.68, 0.7]);
      B('#bfdbfe', [lx - 0.476, FLOOR + 1.45, zc], [0.01, 0.6, 0.62]);
      B('#fff7e0', [lx - 0.47, FLOOR + 1.82, zc], [0.02, 0.03, 0.6], undefined, '#fff2cc');
      B('#d1d5db', [lx - 0.25, FLOOR + 1.25, zo - 0.04 * s], [0.24, 0.3, 0.06]); // ręczniki papierowe
      B('#9ca3af', [lx - 0.25, FLOOR + 0.55, zo - 0.03 * s], [0.2, 0.14, 0.02]); // klapka kosza
      // sufit: lampa, czujka dymu, maski tlenowe
      B('#fff7e0', [lx, FLOOR + 2.07, zc], [0.4, 0.01, 0.2], undefined, '#fff2cc');
      C('cylV', '#f8fafc', [lx + 0.25, FLOOR + 2.06, zc + 0.2 * s], [0.1, 0.03, 0.1]);
      B('#d6d1c4', [lx - 0.2, FLOOR + 2.07, zc - 0.2 * s], [0.22, 0.01, 0.14]);
    }
  });

  // ---------- woda pitna: dwa zbiorniki pod podłogą, za przednią ładownią; rura do kuchni i toalet ----------
  const WX = -25.3;
  for (const z of [0.55, -0.55]) {
    add('capsule', '#dbeafe', box([WX, -2.12, z], [0.62, 0.72, 0.72]));
    for (const dx of [-0.38, 0.38]) {
      B('#64748b', [WX + dx, -2.5, z], [0.08, 0.14, 0.62]); // siodło
      B('#475569', [WX + dx, -2.12, z], [0.03, 0.75, 0.75]); // opaska
    }
  }
  B('#38bdf8', [WX, (FLOOR - 0.5 - 1.76) / 2, 0.55], [0.05, -1.76 - (FLOOR - 0.5), 0.05]); // pion od zbiornika
  const WEND = 19.5; // dalej spód kadłuba podchodzi pod samą podłogę
  B('#38bdf8', [(DOORS[0] + 0.6 + WEND) / 2, FLOOR - 0.5, 0.95], [WEND - DOORS[0] - 0.6, 0.05, 0.05]); // magistrala pod podłogą
  B('#38bdf8', [WX, FLOOR - 0.5, (0.55 + 0.95) / 2], [0.05, 0.05, 0.45]);
  DOORS.forEach((dx, i) => {
    if (dx + 1.2 < WEND) B('#38bdf8', [dx + 1.2, FLOOR - 0.25, 0.95], [0.05, 0.5, 0.05]); // do kuchni
    if (i > 0 && dx - 1.0 < WEND) B('#38bdf8', [dx - 1.0, FLOOR - 0.25, 0.95], [0.05, 0.5, 0.05]); // do umywalek
  });
  // ---------- ścieki: toalety próżniowe – rura podciśnieniowa do zbiorników za tylną ładownią ----------
  const SX = 15.5;
  for (const z of [0.45, -0.45]) {
    add('capsule', '#a8a29e', box([SX, -1.78, z], [0.66, 0.8, 0.8]));
    for (const dx of [-0.42, 0.42]) B('#57534e', [SX + dx, -2.2, z], [0.08, 0.12, 0.7]);
  }
  B('#b45309', [(DOORS[1] - 1.25 + SX) / 2, FLOOR - 0.6, 1.3], [SX - DOORS[1] + 1.25, 0.07, 0.07]);
  B('#b45309', [SX, (FLOOR - 0.6 - 1.4) / 2, 1.3], [0.07, -1.4 - (FLOOR - 0.6) + 0.1, 0.07]);
  DOORS.slice(1).forEach((dx) => dx - 1.03 < SX && B('#b45309', [dx - 1.03, FLOOR - 0.3, 1.3], [0.07, 0.6, 0.07]));

  // ---------- kabina: podłokietniki, ekrany w oparciach, panele nad fotelami, oświetlenie ----------
  const zs = [-2.42, -1.95, -1.48, -0.47, 0, 0.47, 1.48, 1.95, 2.42];
  for (let x = -14.2; x <= 16.5 + PA; x += 0.81) {
    if (DOORS.some((dd) => x > dd - 1.95 && x < dd + 1.85)) continue; // przy drzwiach: toalety (przed) i kuchnia (za)
    const k = Math.min(1, half(FLOOR + 0.6, x) / 2.75);
    // fotel (pasażer patrzy w stronę nosa, −x): wałek siedziska, boczki zagłówka, tył oparcia ze stolikiem,
    // ekranem i kieszenią, podłokietniki po obu stronach (w rzędzie trzech – wspólne), klamra pasa
    zs.forEach((dz, i) => {
      const z = dz * k;
      const tilt: V3 = [0, 0, -0.14];
      B('#2c4f86', [x - 0.24, FLOOR + 0.42, z], [0.06, 0.08, 0.44]); // wałek z przodu siedziska
      for (const w of [0.2, -0.2]) B('#e5e7eb', [x + 0.29, FLOOR + 1.03, z + w], [0.11, 0.17, 0.05], tilt); // boczki zagłówka
      B('#94a3b8', [x + 0.3, FLOOR + 0.84, z], [0.015, 0.3, 0.34], tilt); // stolik (złożony)
      B('#64748b', [x + 0.302, FLOOR + 0.97, z], [0.015, 0.03, 0.08], tilt); // zatrzask stolika
      B('#0f172a', [x + 0.31, FLOOR + 1.08, z], [0.02, 0.15, 0.24], tilt, '#0b1d33'); // ekran w oparciu
      B('#33415c', [x + 0.27, FLOOR + 0.6, z], [0.02, 0.18, 0.36], tilt); // kieszeń
      B('#d1d5db', [x - 0.05, FLOOR + 0.5, z + 0.12], [0.06, 0.02, 0.05]); // klamra pasa
      const first = i === 0 || i === 3 || i === 6; // pierwszy fotel w grupie trzech – podłokietnik także z drugiej strony
      for (const side of first ? [0.235, -0.235] : [0.235]) {
        B('#3f4a5a', [x + 0.02, FLOOR + 0.64, z + side], [0.42, 0.05, 0.05]); // podłokietnik
        B('#64748b', [x + 0.2, FLOOR + 0.5, z + side], [0.04, 0.24, 0.04]); // wspornik podłokietnika
      }
    });
    // nogi foteli stoją na szynach w podłodze; kamizelka ratunkowa pod siedziskiem (żółta zakładka)
    for (const g of [-1.95, 0, 1.95]) B('#facc15', [x - 0.18, FLOOR + 0.33, g * k], [0.02, 0.04, 0.12]);
    // panel nad fotelami (PSU): dla każdego fotela lampka do czytania i dysza nawiewu, przycisk wezwania personelu,
    // a w środku znaki „zapiąć pasy” i „zakaz palenia” oraz klapka masek tlenowych
    for (const sg of [1, -1]) {
      const pz = 1.95 * sg * k;
      B('#e5e7eb', [x, 0.97 + FUS_DY, pz], [0.6, 0.05, 1.2]);
      B('#d6d1c4', [x + 0.12, 0.945 + FUS_DY, pz], [0.3, 0.01, 1.05]); // klapka masek
      for (const dz of [-0.47, 0, 0.47]) {
        add('cylV', '#fff7e0', box([x - 0.16, 0.94 + FUS_DY, pz + dz * k - 0.08], [0.07, 0.02, 0.07]), '#fff2cc'); // lampka
        add('cylV', '#9ca3af', box([x - 0.16, 0.94 + FUS_DY, pz + dz * k + 0.08], [0.06, 0.03, 0.06])); // nawiew
        B('#60a5fa', [x - 0.22, 0.943 + FUS_DY, pz + dz * k], [0.03, 0.01, 0.03], undefined, '#3b82f6'); // wezwanie personelu
      }
      B('#fde68a', [x + 0.2, 0.943 + FUS_DY, pz - 0.15], [0.08, 0.008, 0.12], undefined, '#f59e0b'); // „zapiąć pasy”
      B('#fde68a', [x + 0.2, 0.943 + FUS_DY, pz + 0.15], [0.08, 0.008, 0.12], undefined, '#f59e0b'); // „zakaz palenia”
    }
    // schowki nad głowami: uchwyt klapy i zatrzask (boczne – od strony przejścia, środkowe – z obu stron)
    for (const sg of [1, -1]) B('#475569', [x, 1.02 + FUS_DY, 1.93 * sg * k], [0.28, 0.035, 0.04]);
    for (const sg of [1, -1]) B('#475569', [x, 1.54 + FUS_DY, 0.56 * sg], [0.28, 0.035, 0.04]);
  }
  // listwa pod oknami (półka przy burcie, na wysokości podłokietników) wzdłuż całej kabiny
  for (let x = -28.1; x < 20.6; x += 0.62) {
    if (DOORS.some((dd) => Math.abs(dd - (x + 0.31)) < 0.75)) continue;
    const zl = half(FLOOR + 0.66, x + 0.31) + 0.07;
    for (const sg of [1, -1]) B('#e9e4d8', [x + 0.31, FLOOR + 0.66, zl * sg], [0.62, 0.035, 0.1]);
  }
  // ---------- klasa biznes: apartamenty w układzie 1-2-1, „jodełka” (każdy fotel skośnie, przodem do przejścia) ----------
  // układ fotela: dx – wzdłuż fotela (pasażer patrzy w stronę −dx), dz – w bok (+dz – osłona prywatności)
  {
    const LEATHER = '#6b4f3f';
    const SHELL = '#ddd5c6';
    const WOOD = '#8b6b4a';
    for (let x = -24.6 - PF; x <= -19.5; x += 2.0)
      for (const z of [-2.05, -0.45, 0.45, 2.05]) {
        const th = Math.sign(z) * (Math.abs(z) > 1 ? -0.36 : 0.36);
        // dz w lustrzanym odbiciu po obu stronach kadłuba: +dz zawsze ku burcie (osłona), −dz ku przejściu (konsola)
        const at = (dx: number, dy: number, dz0: number): V3 => {
          const dz = dz0 * Math.sign(z);
          return [x + dx * Math.cos(th) + dz * Math.sin(th), FLOOR + dy, z - dx * Math.sin(th) + dz * Math.cos(th)];
        };
        const R = (rz = 0): V3 => [0, th, rz];
        // przy oknie osłona krótsza – skośna, dłuższa wchodziłaby końcem w burtę przy podłodze
        const win = Math.abs(z) > 1;
        const shL = win ? 1.5 : 2.0;
        const shX = win ? 0.12 : -0.1;
        // fotel: podstawa, siedzisko, oparcie lekko odchylone, zagłówek z pokrowcem, podłokietnik od przejścia
        B('#3b2f28', at(0.15, 0.13, 0), [1.0, 0.26, 0.56], R());
        B(LEATHER, at(0.12, 0.44, 0), [0.62, 0.12, 0.54], R());
        B(LEATHER, at(0.06, 0.38, 0), [0.66, 0.05, 0.56], R()); // lamówka siedziska
        B(LEATHER, at(0.56, 0.86, 0), [0.13, 0.78, 0.54], R(-0.22));
        B('#e7e2d6', at(0.68, 1.33, 0), [0.11, 0.24, 0.44], R(-0.22));
        B(LEATHER, at(0.2, 0.64, -0.33), [0.62, 0.08, 0.1], R());
        // podnóżek w zagłębieniu na nogi i ekran na ściance przed fotelem
        B('#4a3a30', at(-0.78, 0.33, 0), [0.44, 0.36, 0.5], R());
        B(LEATHER, at(-0.78, 0.52, 0), [0.42, 0.04, 0.48], R());
        B('#cfc7b8', at(-1.02, 0.55, 0), [0.05, 1.1, 0.66], R()); // ścianka przednia (tył fotela przed nami)
        B('#1f2937', at(-0.995, 0.98, 0), [0.02, 0.42, 0.62], R());
        B('#0f172a', at(-0.985, 0.98, 0), [0.01, 0.36, 0.56], R(), '#12304f'); // ekran
        // osłona prywatności: ściana, listwa z drewna, schowek z lusterkiem
        B(SHELL, at(shX, 0.62, 0.37), [shL, 1.24, 0.05], R());
        B(WOOD, at(shX, 1.25, 0.37), [shL, 0.035, 0.1], R());
        B('#cfc7b8', at(0.62, 0.92, 0.31), [0.32, 0.26, 0.1], R());
        B('#c7d2fe', at(0.62, 0.92, 0.255), [0.24, 0.18, 0.01], R());
        // konsola boczna od przejścia: blat z drewna, lampka, panel sterowania fotelem
        B(SHELL, at(0.55, 0.36, -0.42), [0.55, 0.72, 0.2], R());
        B(WOOD, at(0.55, 0.735, -0.42), [0.57, 0.03, 0.22], R());
        add('cylV', '#9ca3af', box(at(0.72, 0.85, -0.44), [0.03, 0.2, 0.03]));
        add('cylV', '#fff7e0', box(at(0.72, 0.97, -0.44), [0.1, 0.05, 0.1]), '#fff2cc');
        B('#1f2937', at(0.32, 0.69, -0.34), [0.14, 0.01, 0.06], R());
        B('#60a5fa', at(0.32, 0.696, -0.34), [0.1, 0.005, 0.04], R(), '#3b82f6');
        // pościel: poduszka na oparciu, złożony koc na podnóżku; co trzeci apartament zajęty
        B('#f1f5f9', at(0.45, 0.63, 0), [0.12, 0.22, 0.38], R(-0.25));
        B('#475569', at(-0.78, 0.57, 0), [0.36, 0.05, 0.44], R());
      }
    // ciepła wykładzina w kabinie biznes
    B('#5a4a42', [(-29.0 + -19.0) / 2, FLOOR + 0.003, 0], [10.0, 0.004, 2 * (half(FLOOR, -24) - 0.05)]);
  }

  // ---------- zasłonki między klasami (za kuchnią przy drzwiach 2) i znaki EXIT nad drzwiami ----------
  for (const sg of [1, -1]) {
    B('#9ca3af', [-14.68, FLOOR + 1.98, 0.97 * sg], [0.03, 0.03, 0.6]); // szyna
    B('#2b3a55', [-14.68, FLOOR + 1.0, (0.97 + 0.17) * sg], [0.03, 1.94, 0.26]); // zasłonka (odsunięta)
  }
  DOORS.forEach((dx) => {
    for (const sg of [1, -1]) {
      const zs0 = Math.max(0.4, hw(FLOOR + 2.0, dx) - 0.7) * sg;
      B('#e5e7eb', [dx + 0.02, FLOOR + 2.0, zs0], [0.03, 0.15, 0.38]);
      B('#16a34a', [dx, FLOOR + 2.0, zs0], [0.03, 0.12, 0.34], undefined, '#22c55e');
    }
  });

  // podłoga kabiny: chodniki w przejściach (inny kolor wykładziny) i szyny foteli
  {
    const ex0 = -14.6;
    const ex1 = 19.8;
    for (const sg of [1, -1]) B('#3b4a63', [(ex0 + ex1) / 2, FLOOR + 0.004, 0.97 * sg], [ex1 - ex0, 0.004, 0.52]);
    for (const zr of [-2.2, -1.7, -1.2, -0.25, 0.25, 1.2, 1.7, 2.2]) B('#9ca3af', [(-28 + 12) / 2, FLOOR + 0.006, zr], [40, 0.006, 0.03]);
  }
  const cx0 = -27.5;
  const cx1 = 19.5 + PA;
  for (const s of [1, -1]) B('#dbeafe', [(cx0 + cx1) / 2, 1.62 + FUS_DY, 1.72 * s], [cx1 - cx0, 0.03, 0.05], undefined, '#bfdbfe'); // światło nad schowkami
  B('#dbeafe', [(cx0 + cx1) / 2, 2.12 + FUS_DY, 0], [cx1 - cx0, 0.02, 0.28], undefined, '#93c5fd'); // światło sufitu
  for (const s of [1, -1]) B('#fde68a', [(cx0 + cx1) / 2, FLOOR + 0.01, 0.95 * s], [cx1 - cx0, 0.01, 0.03], undefined, '#facc15'); // ścieżka ewakuacyjna

  // ---------- instalacje nad sufitem ----------
  // główny kanał klimatyzacji: okrągły, w izolacji, z odcinków łączonych kołnierzami, podwieszony do wręg;
  // co drugi odcinek odgałęzienia w dół, do nawiewów nad schowkami po obu stronach
  const D0 = -27;
  const D1 = 21.5;
  // instalacje nad sufitem wiszą pod grzbietem kadłuba – przesunięte razem z nim
  const DY = 2.42 + FUS_DY;
  const DR = 0.22;
  const cyl = (k: string, x: number, y: number, z: number, len: number, d: number, e?: string) => add('cylX', k, box([x, y, z], [len, d, d]), e);
  let seg = 0;
  // nad odpoczynkiem personelu pokładowego (x ok. 14–18,9) kanał biegnie wyżej, pod samym grzbietem, bez odgałęzień
  for (let x = D0; x < D1 - 0.6; x += 1.24, seg++) {
    const xm = x + 0.62;
    const top = fusSec(xm).yc + fusSec(xm).h;
    const up = xm > 12.8 + PA - 2.6 && xm < 12.8 + PA + 2.6;
    const y = up ? top - 0.36 : DY;
    cyl('#c3ced6', xm, y, 0, 1.2, 2 * DR); // odcinek kanału (izolacja)
    cyl('#7b8a96', x, y, 0, 0.05, 2 * DR + 0.05); // kołnierz
    for (const z of [0.16, -0.16]) B('#8b939c', [xm, (y + DR + top - 0.08) / 2, z], [0.025, Math.max(0.02, top - 0.08 - y - DR), 0.025]); // wieszak
    B('#8b939c', [xm, y + DR + 0.01, 0], [0.05, 0.02, 0.4]); // obejma
    if (seg % 2 === 0 && !up)
      for (const s of [1, -1]) {
        // odgałęzienie: skośnie w dół ku burcie, zakończone nawiewem nad schowkami
        B('#c3ced6', [x + 0.62, DY - 0.17, 0.55 * s], [0.13, 0.13, 0.75], [0.5 * s, 0, 0]);
        B('#c3ced6', [x + 0.62, 2.0 + FUS_DY, 0.92 * s], [0.13, 0.22, 0.13]);
        B('#9ca3af', [x + 0.62, 1.88 + FUS_DY, 0.98 * s], [0.42, 0.04, 0.16]); // nawiew
      }
  }
  // korytka kablowe po obu stronach: otwarte, na wspornikach co dwie wręgi; w nich wiązki zasilania i danych
  const T0 = -29.5;
  const T1 = 19.8;
  for (const s of [1, -1]) {
    const z = 1.32 * s;
    B('#6b7280', [(T0 + T1) / 2, 2.15 + FUS_DY, z], [T1 - T0, 0.015, 0.3]); // dno korytka
    for (const dz of [0.15, -0.15]) B('#6b7280', [(T0 + T1) / 2, 2.19 + FUS_DY, z + dz], [T1 - T0, 0.08, 0.012]); // burty
    const bundles: [number, number, string][] = [
      [-0.08, 0.06, '#d1d5db'], // zasilanie
      [0, 0.07, '#4b5563'],
      [0.08, 0.05, '#e5e7eb'],
      [0.03, 0.035, '#3b82f6'], // sieć danych (światłowód) – cieńsza, na wierzchu
    ];
    for (const [dz, d, k] of bundles) cyl(k, (T0 + T1) / 2, 2.19 + FUS_DY + (k === '#3b82f6' ? 0.05 : 0), z + dz * s, T1 - T0, d);
    for (let x = T0 + 0.3; x < T1; x += 1.24) B('#9ca3af', [x, 2.27 + FUS_DY, z], [0.03, 0.26, 0.34]); // wspornik
  }

  // ---------- odpoczynek załóg: przedziały nad kabiną (podłoga, sufit, ściany, koje z pościelą, lampki) ----------
  const crewRest = (x0: number, x1: number, yf: number, yc: number, bunkXs: number[]) => {
    const xm = (x0 + x1) / 2;
    const h = yc - yf;
    B('#c8c2b6', [xm, yf, 0], [x1 - x0, 0.06, 2.3]); // podłoga
    B('#e8e3d8', [xm, yc, 0], [x1 - x0, 0.04, 2.3]); // sufit
    for (const x of [x0, x1]) B('#e8e3d8', [x, yf + h / 2, 0], [0.04, h, 2.3]); // ściany końcowe
    B('#e8e3d8', [xm, yf + h / 2, 1.15], [x1 - x0, h, 0.04]); // ściana od burty
    for (const bx of bunkXs)
      for (const z of [0.55, -0.55]) {
        B('#4f6b8a', [bx, yf + 0.1, z], [1.95, 0.12, 0.72]); // rama koi
        B('#e2e8f0', [bx, yf + 0.19, z], [1.9, 0.07, 0.68]); // materac
        B('#f8fafc', [bx - 0.78, yf + 0.26, z], [0.3, 0.08, 0.5]); // poduszka
        B('#1e3a8a', [bx + 0.3, yf + 0.235, z], [1.2, 0.025, 0.7]); // koc
        B('#475569', [bx + 0.9, yf + h / 2, z > 0 ? 0.2 : -0.2], [0.22, h - 0.12, 0.05]); // zasłona (odsunięta)
        B('#fff7e0', [bx - 0.6, yc - 0.03, z], [0.1, 0.02, 0.1], undefined, '#fff2cc'); // lampka do czytania
      }
  };
  // pilotów: nad wejściem do kabiny za kokpitem; wchodzi się stromymi schodami z przestrzeni przy drzwiach 1
  crewRest(-30.2, -27.4, 1.72 + FUS_DY, 2.52 + FUS_DY, [-28.8]);
  // personelu pokładowego: nad tylną częścią kabiny, cztery koje
  crewRest(14.0, 18.7, 1.6 + FUS_DY, 2.38 + FUS_DY, [15.2, 17.4]);
  {
    const xb = -31.9;
    const xt = -30.3;
    const rest = 1.72 + FUS_DY;
    const rise = rest - FLOOR;
    const run = xt - xb;
    for (let i = 1; i <= 11; i++) B('#9ca3af', [xb + (run * i) / 11.5, FLOOR + (rise * i) / 11.5, 1.0], [0.2, 0.035, 0.55]); // stopnie
    const len = Math.hypot(run, rise);
    const ang = Math.atan2(rise, run);
    for (const z of [0.71, 1.29]) B('#6b7280', [(xb + xt) / 2, (FLOOR + rest) / 2, z], [len, 0.07, 0.04], [0, 0, ang]); // policzki schodów
    B('#d1d5db', [(xb + xt) / 2, (FLOOR + rest) / 2 + 0.7, 1.3], [len, 0.03, 0.03], [0, 0, ang]); // poręcz
    B('#e7e2d6', [xt + 0.02, 2.12 + FUS_DY, 1.0], [0.04, 0.8, 0.6]); // obramowanie włazu w podłodze przedziału
  }

  // ---------- awionika: regały (słupki, półki), moduły LRU z uchwytami i diodami, chłodzenie, pomost ----------
  for (let x = -30.1; x <= -27.4; x += 0.65)
    for (const sg of [1, -1]) {
      const z = 1.05 * sg;
      const face = z - 0.255 * sg; // przód regału (od przejścia)
      for (const dx of [-0.26, 0.26]) for (const dz of [-0.23, 0.23]) B('#9ca3af', [x + dx, -2.05, z + dz], [0.03, 0.9, 0.03]);
      for (const y of [-2.48, -2.18, -1.88]) {
        B('#6b7280', [x, y, z], [0.55, 0.02, 0.5]);
        for (const dx of [-0.13, 0.13]) {
          B('#3f4752', [x + dx, y + 0.13, z], [0.24, 0.24, 0.44]);
          B('#4b5563', [x + dx, y + 0.13, face], [0.24, 0.24, 0.01]);
          B('#9ca3af', [x + dx, y + 0.2, face - 0.012 * sg], [0.14, 0.02, 0.015]);
          B(dx < 0 ? '#22c55e' : '#f59e0b', [x + dx + 0.08, y + 0.06, face - 0.01 * sg], [0.025, 0.025, 0.01], undefined, dx < 0 ? '#22c55e' : '#f59e0b');
        }
      }
      B('#c3ced6', [x, -1.7, z - 0.1 * sg], [0.08, 0.12, 0.08]); // odgałęzienie chłodzenia
    }
  for (const sg of [1, -1]) add('cylX', '#c3ced6', box([-28.75, -1.7, 0.85 * sg], [3.0, 0.16, 0.16])); // kanał chłodzenia
  B('#4b5563', [-28.75, -2.5, 0], [3.0, 0.02, 1.05]); // pomost
  for (let i = 0; i < 4; i++) B('#9ca3af', [-27.15, -2.62 - i * 0.12, 0], [0.04, 0.02, 0.45]); // drabinka do luku w spodzie

  // ---------- gródź przednia: usztywnienia (pionowe i poziome) ----------
  {
    const gx = RADOME_X + 0.09;
    for (const z of [-0.6, 0, 0.6]) {
      const top = fusPt(gx, fusTheta(gx, 0.2 + FUS_DY) * (z === 0 ? 0.01 : Math.abs(z) / 1.2))[1] - 0.12;
      // dół usztywnienia nad zwężeniem nosa (przy podłodze kokpitu gródź jest wąska)
      const bot = FLOOR + (z === 0 ? 0 : 0.3);
      B('#7f9a63', [gx, (bot + top) / 2, z], [0.05, top - bot, 0.07]);
    }
    for (const y of [-0.55 + FUS_DY, 0.2 + FUS_DY]) B('#7f9a63', [gx, y, 0], [0.05, 0.07, 2 * half(y, gx) - 0.2]);
  }

  // kokpit: podłoga stanowiska pilotów równo z podłogą kabiny; ściana z pancernymi drzwiami należy do modelu kokpitu

  return [...groups.values()];
}

/** Kontener LD3: profil ze skosem od strony burty (pasuje do zaokrąglenia kadłuba), wysokość ok. 1,1 m w skali modelu. */
/**
 * Kontener LD3 (AKE) w prawdziwych wymiarach: 1,53 m długości, 1,63 m wysokości, 2,01 m szerokości u góry (1,56 m przy
 * podstawie, skos od strony burty). Bryła i detale są rysowane w jednostkach „roboczych” i skalowane tym mnożnikiem.
 */
const LD3_K = { x: 1.53 / 1.56, y: 1.63 / 1.1, z: 2.01 / 1.55 };
const LD3_S = new THREE.Matrix4().makeScale(LD3_K.x, LD3_K.y, LD3_K.z);
function ld3Geo() {
  const sh = new THREE.Shape();
  sh.moveTo(-0.775, 0);
  sh.lineTo(0.285, 0);
  sh.lineTo(0.775, 0.55);
  sh.lineTo(0.775, 1.1);
  sh.lineTo(-0.775, 1.1);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1.56, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
  g.translate(0, 0, -0.78);
  // profil w płaszczyźnie (z, y), długość wzdłuż x; skos po stronie +z (lewa burta)
  g.rotateY(-Math.PI / 2);
  g.scale(LD3_K.x, LD3_K.y, LD3_K.z);
  g.computeVertexNormals();
  return g;
}

/**
 * Detale kontenera LD3 w jego układzie (długość w x ±0,78, profil w z: pełna ściana przy z = −0,775, skos przy +z):
 * aluminiowe krawędzie i narożniki, ciemna podstawa z rantem, plandeka drzwi na pełnej ścianie z pasami i tabliczka
 * z numerem. Rysowane jako osobne instancje, ustawiane razem z kontenerem.
 */
const CAN_PARTS: { k: string; mats: THREE.Matrix4[] }[] = (() => {
  const slLen = Math.hypot(0.49, 0.55);
  const slAng = Math.atan2(0.49, 0.55);
  const edge = (x: number) => [
    box([x, 0.55, -0.775], [0.05, 1.12, 0.05]),
    box([x, 0.825, 0.775], [0.05, 0.57, 0.05]),
    box([x, 1.1, 0], [0.05, 0.05, 1.6]),
    box([x, 0.275, 0.53], [0.05, slLen, 0.05], [slAng, 0, 0]),
    box([x, 0.01, -0.245], [0.05, 0.05, 1.1]),
  ];
  return [
    { k: '#9aa2ab', mats: [box([0, 1.1, -0.775], [1.62, 0.05, 0.05]), box([0, 1.1, 0.775], [1.62, 0.05, 0.05]), box([0, 0.55, 0.775], [1.62, 0.05, 0.05]), ...edge(-0.78), ...edge(0.78)] },
    // podstawa (płyta z rantem) i żebra na dachu
    { k: '#4b535c', mats: [box([0, 0.02, -0.245], [1.64, 0.04, 1.12]), ...[-0.4, 0, 0.4].map((x) => box([x, 1.11, 0], [0.04, 0.025, 1.5]))] },
    // plandeka drzwi na pełnej ścianie
    { k: '#2c4a73', mats: [box([0, 0.58, -0.792], [1.44, 0.92, 0.012])] },
    { k: '#18263a', mats: [...[-0.48, 0, 0.48].map((x) => box([x, 0.58, -0.8], [0.05, 0.94, 0.01])), box([0, 0.13, -0.8], [1.44, 0.05, 0.01])] },
    // tabliczka z numerem (biała z ciemnym napisem)
    { k: '#eef2f6', mats: [box([0.42, 1.0, -0.79], [0.32, 0.1, 0.012])] },
    { k: '#111317', mats: [box([0.42, 1.0, -0.798], [0.24, 0.028, 0.006])] },
  ].map((p) => ({ ...p, mats: p.mats.map((m) => LD3_S.clone().multiply(m)) }));
})();

/**
 * Kontrola w trybie deweloperskim: czy jakaś bryła wyposażenia wystaje poza poszycie kadłuba (narożniki prostopadłościanu
 * otaczającego sprawdzane względem przekroju superelipsy w danym x). Wypisuje listę w konsoli – do poprawiania modelu.
 */
function checkInside(lists: Record<string, { geo: THREE.BufferGeometry; mats: THREE.Matrix4[] }>) {
  const out: string[] = [];
  const v = new THREE.Vector3();
  for (const [name, { geo, mats }] of Object.entries(lists)) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    mats.forEach((m) => {
      let worst = 0;
      let at: V3 = [0, 0, 0];
      for (const cx of [bb.min.x, bb.max.x])
        for (const cy of [bb.min.y, bb.max.y])
          for (const cz of [bb.min.z, bb.max.z]) {
            v.set(cx, cy, cz).applyMatrix4(m);
            const sec = fusSec(v.x);
            const r = Math.pow(Math.abs(v.y - sec.yc) / Math.max(0.05, sec.h - 0.03), FUS_N) + Math.pow(Math.abs(v.z) / Math.max(0.05, sec.w - 0.03), FUS_N);
            if (r > 1 + worst) {
              worst = r - 1;
              at = [v.x, v.y, v.z];
            }
          }
      if (worst > 0.002) out.push(`${name} @ x=${at[0].toFixed(2)} y=${at[1].toFixed(2)} z=${at[2].toFixed(2)} (+${(worst * 100).toFixed(1)}%)`);
    });
  }
  (window as unknown as { __fusCheck?: string[] }).__fusCheck = out;
  // eslint-disable-next-line no-console
  console.info(`[kadłub] wystające bryły: ${out.length}\n` + out.join('\n'));
}

/**
 * Obrót osi z na kierunek n z „górą” możliwie pionowo (pion rzutowany na płaszczyznę prostopadłą do n). W zwężającym
 * się ogonie normalna poszycia jest pochylona – sam obrót z osi z (setFromUnitVectors) obracałby okna wokół środka.
 */
function uprightQuat(n: THREE.Vector3) {
  const z = n.clone().normalize();
  const y = new THREE.Vector3(0, 1, 0).addScaledVector(z, -z.y).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Okna kabiny od środka: x okien (co wręgę, bez drzwi) i wymiary otworu w wykładzinie (pół szerokości, pół wysokości). */
const CABIN_WINS: number[] = (() => {
  const out: number[] = [];
  for (let x = -24.3 - PF; x <= 19.9 + PA; x += 0.635) if (!DOORS.some((dd) => Math.abs(dd - x) < 0.9)) out.push(x);
  return out;
})();
const WIN_HOLE = { hx: 0.15, hy: 0.22 };
/** Zaokrąglony prostokąt (środek w 0,0) – okna A350 są duże i prawie prostokątne. */
function roundRect(w: number, h: number, r: number, path: THREE.Path = new THREE.Shape()) {
  const x = -w / 2;
  const y = -h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

function Interior({ view = 'home', labels = true, pick, doorHoles = false }: { view?: FusView; labels?: boolean; pick?: WingPick; doorHoles?: boolean }) {
  const furnished = view !== 'struct';
  const d = useMemo(() => cached('interior2', () => {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const XA = -32.1; // tył kokpitu (ściana z drzwiami kokpitu)
    const XB = 20.6 + PA; // tylna gródź ciśnieniowa
    // wykładzina kabiny z otworami na okna: dodatkowe podziały siatki na krawędziach okien
    const linerX = [...new Set([...refine([-28.6 - PF, 21 + PA], 0.45), ...CABIN_WINS.flatMap((wx) => [wx - WIN_HOLE.hx, wx + WIN_HOLE.hx]), ...CARGO_DOOR.xs.flatMap((xd) => [xd - CARGO_DOOR.hw, xd + CARGO_DOOR.hw]), ...PAX_DOOR.xs.flatMap((xd) => [xd - PAX_DOOR.hw, xd + PAX_DOOR.hw])])].sort((a, b) => a - b);
    const linerTh = [...new Set([...FUS_TH, ...refine([1.15, 2.0], 0.015), ...refine([-2.0, -1.15], 0.015)])].sort((a, b) => a - b);
    const liner = grid(linerX, linerTh, (x, th) => fusPt(x, th, 0.16), (x, th) => {
      const y = fusPt(x, th, 0.16)[1];
      // otwory drzwi ładowni w prawej burcie
      if (th < 0 && y > CARGO_DOOR.yb - 0.1 && y < CARGO_DOOR.yt + 0.1 && cargoGap(x)) return true;
      return Math.abs(y - WIN_Y) < WIN_HOLE.hy && CABIN_WINS.some((wx) => Math.abs(x - wx) < WIN_HOLE.hx);
    });
    // wykładzina z otworami drzwi pasażerskich (moduł drzwi – przez otwór widać kabinę)
    const linerDoors = grid(linerX, linerTh, (x, th) => fusPt(x, th, 0.16), (x, th) => {
      const y = fusPt(x, th, 0.16)[1];
      if (y > PAX_DOOR.yb && y < PAX_DOOR.yt && PAX_DOOR.xs.some((xd) => Math.abs(x - xd) < PAX_DOOR.hw)) return true;
      if (th < 0 && y > CARGO_DOOR.yb - 0.1 && y < CARGO_DOOR.yt + 0.1 && cargoGap(x)) return true;
      return Math.abs(y - WIN_Y) < WIN_HOLE.hy && CABIN_WINS.some((wx) => Math.abs(x - wx) < WIN_HOLE.hx);
    });
    const half = (y: number, x = 0) => fusPt(x, fusTheta(x, y), 0)[2] - 0.2;
    // ---------- konstrukcja ----------
    // wręgi co ok. 0,62 m (pierścienie o kształcie przekroju) – od grodzi przedniej po stożek ogonowy
    // rurka pierścienia skaluje się razem z przekrojem (ok. ×3) – cienka, żeby wręgi nie przebijały wykładziny
    const ring = new THREE.TorusGeometry(1, 0.012, 4, 72);
    // w zakładce o konstrukcji wręgi grubsze (bez wykładziny nic ich nie zasłania)
    const ringThick = new THREE.TorusGeometry(1, 0.022, 4, 96);
    ringThick.rotateY(Math.PI / 2);
    ring.rotateY(Math.PI / 2);
    const frames: THREE.Matrix4[] = [];
    const cutFrameXs: number[] = [];
    // wręgi w rytmie okien (co 0,635 m), w połowie odstępu między oknami – żaden wręg nie przechodzi przez okno
    const FR = 0.635;
    const fr0 = -24.3 - PF + FR / 2;
    for (let x = fr0 - Math.floor((fr0 - (RADOME_X + 0.3)) / FR) * FR; x <= 31.5; x += FR) {
      const { yc, h, w } = fusSec(x);
      if (w < 0.5) continue;
      // wręgi przecięte otworami drzwi (ładowni i pasażerskich) – rysowane osobno, jako łuki z przerwami
      if (openingGaps(x).length) {
        cutFrameXs.push(x);
        continue;
      }
      frames.push(box([x, yc, 0], [1, h - 0.07, w - 0.07]));
    }
    /*
     * Otwory drzwi ładowni (prawa burta): przecięte wręgi (środnik i pas) z przerwą na otwór oraz wzmocniona rama
     * otworu – grube wręgi krawędziowe i progi górny i dolny na całą głębokość konstrukcji kadłuba.
     */
    const frameArc = (x: number, gaps: [number, number][], depth: number, flange: number) => {
      // łuki między przerwami (przerwy posortowane po kącie)
      const parts: [number, number][] = [];
      let a0 = -Math.PI;
      for (const [g0, g1] of gaps) {
        if (g0 > a0) parts.push([a0, g0]);
        a0 = Math.max(a0, g1);
      }
      if (a0 < Math.PI) parts.push([a0, Math.PI]);
      return parts.flatMap(([a, b]) => {
        const ths = refine([a, b], 0.03);
        return [grid(ths, [0.005, depth], (th, o) => fusPt(x, th, o)), grid(ths, [x - flange / 2, x + flange / 2], (th, xx) => fusPt(xx, th, depth))];
      });
    };
    const cutFrames = mergeGeo(cutFrameXs.flatMap((x) => frameArc(x, openingGaps(x), 0.11, 0.05)));
    const cargoSurround = mergeGeo(
      CARGO_DOOR.xs.flatMap((xd) => {
        const x0 = xd - CARGO_DOOR.hw;
        const x1 = xd + CARGO_DOOR.hw;
        const xs = refine([x0 - 0.08, x1 + 0.08], 0.1);
        const sill = (y: number) => [
          grid(xs, [0.005, 0.17], (x, o) => fusPt(x, -fusTheta(x, y), o)),
          grid(xs, [-0.04, 0.04], (x, dy) => fusPt(x, -fusTheta(x, y + dy), 0.17)),
        ];
        return [...frameArc(x0, [], 0.17, 0.09), ...frameArc(x1, [], 0.17, 0.09), ...sill(CARGO_DOOR.yt), ...sill(CARGO_DOOR.yb)];
      }),
    );
    // podłużnice: listwy wzdłuż poszycia (pokazane rzadziej niż w samolocie) – odcinki między wręgami
    const stringers: THREE.Matrix4[] = [];
    const ths = Array.from({ length: 65 }, (_, i) => -Math.PI + (i / 64) * Math.PI * 2);
    // zaczynają się za kokpitem – dalej do przodu są szyby i gęste wręgi nosa
    for (let x = -31.9; x < 30; x += 0.62) {
      if (fusSec(x).w < 0.6) continue;
      for (const th of ths) {
        const a = new THREE.Vector3(...fusPt(x, th, 0.05));
        const b = new THREE.Vector3(...fusPt(x + 0.62, th, 0.05));
        const ym = (a.y + b.y) / 2;
        // pas okien: tu zamiast podłużnic są wzmocnione ramy okien
        if (Math.abs(ym - WIN_Y) < WIN_HOLE.hy + 0.06 && x > -24.5 - PF && x < 20.3 + PA) continue;
        // otwory drzwi (obie burty): od podłogi do nadproża
        if (ym > FLOOR - 0.05 && ym < FLOOR + 2.1 && DOORS.some((dd) => x + 0.62 > dd - 0.6 && x < dd + 0.6)) continue;
        // otwory drzwi ładowni (prawa burta)
        if (th < 0 && ym > CARGO_DOOR.yb - 0.05 && ym < CARGO_DOOR.yt + 0.05 && CARGO_DOOR.xs.some((xd) => x + 0.62 > xd - CARGO_DOOR.hw && x < xd + CARGO_DOOR.hw)) continue;
        const o = new THREE.Object3D();
        o.position.copy(a).add(b).multiplyScalar(0.5);
        o.lookAt(b);
        o.scale.set(0.03, 0.05, a.distanceTo(b));
        o.updateMatrix();
        stringers.push(o.matrix.clone());
      }
    }
    // obramowania drzwi: wzmocnione wręgi przy krawędziach otworu i progi nad i pod drzwiami
    const doorFrames: THREE.Matrix4[] = [];
    const doorSills: THREE.Matrix4[] = [];
    for (const dd of DOORS) {
      for (const xe of [dd - 0.62, dd + 0.62]) {
        const { yc, h, w } = fusSec(xe);
        doorFrames.push(box([xe, yc, 0], [1, h - 0.06, w - 0.06]));
      }
      for (const y of [FLOOR + 0.02, FLOOR + 2.05])
        for (const sg of [1, -1]) {
          const p = fusPt(dd, fusTheta(dd, y) * sg, 0.07);
          doorSills.push(box([dd, p[1], p[2]], [1.3, 0.1, 0.1]));
        }
    }
    // belki podłogi (poprzeczne, przy każdej wrędze) i podłoga kabiny
    /** Półszerokość wnętrza na wysokości y w x (bez marginesu). */
    const hw = (y: number, x: number) => Math.max(0, half(y, x) + 0.2);
    // belki: wysokość ograniczona spodem kadłuba (w ogonie spód podchodzi pod podłogę), długość – przekrojem
    const beams: THREE.Matrix4[] = [];
    for (let x = XA; x <= XB - 0.3; x += 0.62) {
      const sec = fusSec(x);
      // nad wnęką podwozia głównego belki są płytkie – pod nimi jest płyta ciśnieniowa i schowane koła
      const overBay = x > BAY_MAIN.x0 - 0.3 && x < BAY_MAIN.x1 + 0.3;
      // belki płytkie (ok. 0,18 m): między podłogą kabiny a podłogą ładowni jest 1,96 m, a kontener LD3 ma 1,63 m
      const hb = Math.min(overBay ? 0.14 : 0.18, FLOOR - 0.08 - (sec.yc - sec.h) - 0.12);
      if (hb < 0.12) continue;
      const yb = FLOOR - 0.08 - hb;
      // nad drzwiami ładowni belki kończą się przed ramą otworu (nie wchodzą w otwór drzwi)
      const bw = 2 * (Math.min(hw(yb, x), hw(FLOOR - 0.08, x)) - 0.12) - (cargoGap(x) ? 0.25 : 0);
      beams.push(box([x, FLOOR - 0.08 - hb / 2, cargoGap(x) ? 0.125 : 0], [0.07, hb, bw]));
    }
    // podłoga z odcinków – szerokość za każdym razem dopasowana do przekroju
    const fl = half(FLOOR);
    const floor: THREE.Matrix4[] = [];
    for (let x = XA; x < XB - 0.01; x += 0.62) {
      const x1 = Math.min(XB, x + 0.62);
      floor.push(box([(x + x1) / 2, FLOOR - 0.04, 0], [x1 - x, 0.08, 2 * (Math.min(hw(FLOOR - 0.08, x), hw(FLOOR - 0.08, x1)) - 0.16)]));
    }
    // słupki podpierające belki podłogi od spodu (po bokach ładowni) i belka kilowa pod wnęką podwozia
    const struts: THREE.Matrix4[] = [];
    for (let x = XA + 0.3; x <= XB - 0.6; x += 1.24) {
      // przy samej burcie – obok skośnych ścian kontenerów
      const zs = hw(-2.3, x) - 0.15;
      if (zs < 1.0) continue;
      for (const sg of [1, -1]) struts.push(box([x, -1.85, zs * sg], [0.05, 0.9, 0.05]));
    }
    const keel = [box([1.8, -2.84, 0], [6.4, 0.3, 0.36])];
    // grodzie: przednia (za owiewką radaru), tylna kopuła i gródź ogniowa APU w stożku ogonowym
    const bulk = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.6);
    bulk.rotateZ(-Math.PI / 2);
    const bs = fusSec(21.2 + PA);
    const bulkM = [box([20.6 + PA, bs.yc, 0], [1.2, bs.h - 0.15, bs.w - 0.15])];
    const disc = new THREE.CircleGeometry(1, 48);
    disc.rotateY(Math.PI / 2);
    // gródź przednia: płyta od podłogi kokpitu w górę – niżej, za nią, jest niehermetyczna wnęka podwozia przedniego
    const fwdPlate = (() => {
      const gx = RADOME_X + 0.05;
      const tf = fusTheta(gx, FLOOR);
      const sh = new THREE.Shape();
      for (let i = 0; i <= 48; i++) {
        const th = -tf + (2 * tf * i) / 48;
        const p = fusPt(gx, th, 0.03);
        if (i === 0) sh.moveTo(p[2], p[1]);
        else sh.lineTo(p[2], p[1]);
      }
      sh.closePath();
      const g = new THREE.ShapeGeometry(sh, 4);
      g.rotateY(-Math.PI / 2);
      g.translate(gx, 0, 0);
      return g;
    })();
    const fw = fusSec(APU_HATCH.x0 - 0.5);
    const fireWall = [box([APU_HATCH.x0 - 0.5, fw.yc, 0], [1, fw.h - 0.04, fw.w - 0.04])];
    // centropłat (keson między dźwigarami przy kadłubie – zbiornik centralny) i wnęka podwozia głównego
    const xF = wLE(W_SIDE) + S_FS * (wTE(W_SIDE) - wLE(W_SIDE));
    const xR = wLE(W_SIDE) + S_RS * (wTE(W_SIDE) - wLE(W_SIDE));
    // keson leży pod belkami podłogi kabiny (góra ok. 0,45 m pod podłogą)
    // szerokość kesonu wewnątrz kadłuba – ograniczona dolnym narożnikiem (spód przekroju się zaokrągla)
    const cw = 2 * (Math.min(hw(-2.56, xF), hw(-2.56, xR)) - 0.04);
    const centre = [box([(xF + xR) / 2, -2.07, 0], [xR - xF, 0.92, cw])];
    const spars = [xF, xR].map((x) => box([x, -2.07, 0], [0.08, 0.98, cw - 0.06]));
    // strop wnęki podwozia głównego (hermetyczna płyta nad kołami) – samą wnękę zajmuje schowane podwozie
    const bay = [box([1.3, -1.355, 0], [5.2, 0.03, 4.6])];
    // radar pogodowy w nosie to model radaru (wbudowany w samolot – planeSystems), nie uproszczona kopia
    // ---------- kabina ----------
    // klasa biznes 1-2-1: fotele-łóżka ustawione skośnie („jodełka”), każdy przodem do swojego przejścia,
    // w kabinie z osłoną prywatności; rozstaw rzędów ok. 2 m. Klasa ekonomiczna 3-3-3.
    const seatJ: THREE.Matrix4[] = [];
    // fotele biznes (apartamenty z osłonami, konsolą, ekranem i podnóżkiem) buduje interiorDetail
    const seatY: THREE.Matrix4[] = [];
    const heads: THREE.Matrix4[] = [];
    const legs: THREE.Matrix4[] = [];
    const zs = [-2.42, -1.95, -1.48, -0.47, 0, 0.47, 1.48, 1.95, 2.42];
    for (let x = -14.2; x <= 16.5 + PA; x += 0.81) {
      if (DOORS.some((dd) => x > dd - 1.95 && x < dd + 1.85)) continue; // przy drzwiach: toalety (przed) i kuchnia (za)
      const k = Math.min(1, half(FLOOR + 0.6, x) / 2.75);
      for (const dz of zs) {
        const z = dz * k;
        seatY.push(box([x, FLOOR + 0.44, z], [0.46, 0.1, 0.44]));
        seatY.push(box([x + 0.24, FLOOR + 0.78, z], [0.09, 0.62, 0.44], [0, 0, -0.14]));
        heads.push(box([x + 0.285, FLOOR + 1.03, z], [0.1, 0.17, 0.445], [0, 0, -0.14]));
      }
      // nogi foteli przy podłodze – tam kadłub jest węższy niż na wysokości siedzisk
      const kl = Math.min(k, (hw(FLOOR + 0.02, x + 0.25) - 0.2) / 2.6);
      for (const z of [-1.95, 0, 1.95]) legs.push(box([x, FLOOR + 0.2, z * kl], [0.05, 0.38, 1.3 * kl]));
    }
    // schowki nad głowami
    const bins: THREE.Matrix4[] = [];
    for (let x = -24.4 - PF; x <= 17 + PA; x += 1.72) {
      // schowki boczne przy burcie – w zwężającym się ogonie bliżej osi
      const zb = Math.min(2.2, Math.min(hw(1.45 + FUS_DY, x - 0.82), hw(1.45 + FUS_DY, x + 0.82)) - 0.36);
      bins.push(box([x, 1.2 + FUS_DY, zb], [1.64, 0.42, 0.62], [0.35, 0, 0]));
      bins.push(box([x, 1.2 + FUS_DY, -zb], [1.64, 0.42, 0.62], [-0.35, 0, 0]));
      if (x > -16) bins.push(box([x, 1.72 + FUS_DY, 0], [1.64, 0.4, 1.1]));
    }
    // kuchnie, toalety, zbiorniki wody i ścieków, oświetlenie, awionika i drobiazgi kokpitu – interiorDetail
    const detail = interiorDetail(half);
    // okna kabiny od środka – w tych samych miejscach co szyby w poszyciu (co wręgę, bez drzwi):
    // owalne obramowanie w wykładzinie, szyba z jasnym niebem i roleta (część opuszczona do połowy)
    // okna od środka: jasne obramowanie w wykładzinie, głęboka wnęka (tunel do szyby w poszyciu), szyba z jasnym
    // niebem, rolety w różnym położeniu (z uchwytem) i kratki powrotu powietrza przy podłodze pod oknami
    const winSurround: THREE.Matrix4[] = [];
    const winReveal: THREE.Matrix4[] = [];
    const winPane: THREE.Matrix4[] = [];
    const winShade: THREE.Matrix4[] = [];
    const winHandle: THREE.Matrix4[] = [];
    const grilles: THREE.Matrix4[] = [];
    {
      const o = new THREE.Object3D();
      const bx = new THREE.Vector3();
      const by = new THREE.Vector3();
      const basis = new THREE.Matrix4();
      const put = (list: THREE.Matrix4[], x: number, th: number, inset: number, sy = 1, dy = 0) => {
        const p = fusPt(x, th, inset);
        const n = fusNormal(x, th).multiplyScalar(-1); // do środka kabiny
        // „góra” okna zawsze pionowo (pion rzutowany na płaszczyznę poszycia) – w zwężającym się ogonie normalna jest
        // pochylona i sam obrót z osi z obracałby okna wokół ich środka
        by.set(0, 1, 0).addScaledVector(n, -n.y).normalize();
        bx.crossVectors(by, n).normalize();
        basis.makeBasis(bx, by, n);
        o.position.set(p[0], p[1] + dy, p[2]);
        o.quaternion.setFromRotationMatrix(basis);
        o.scale.set(1, sy, 1);
        o.updateMatrix();
        list.push(o.matrix.clone());
      };
      const shades = [0, 0, 0.19, 0, 0.33, 0, 0.12, 0];
      CABIN_WINS.forEach((x, k) => {
        const th = fusTheta(x, WIN_Y);
        const thG = fusTheta(x, FLOOR + 0.2);
        for (const side of [1, -1]) {
          put(winSurround, x, th * side, 0.158);
          put(winReveal, x, th * side, 0.158);
          put(winPane, x, th * side, 0.158);
          const L = shades[(k * 3 + (side > 0 ? 0 : 5)) % shades.length];
          if (L > 0) {
            put(winShade, x, th * side, 0.158, L, 0.185);
            put(winHandle, x, th * side, 0.158, 1, 0.185 - L);
          }
          put(grilles, x, thG * side, 0.157);
        }
      });
    }
    const winSurroundGeo = (() => {
      const sh = roundRect(0.44, 0.58, 0.15) as THREE.Shape;
      sh.holes.push(roundRect(WIN_HOLE.hx * 2 + 0.01, WIN_HOLE.hy * 2 + 0.01, 0.12, new THREE.Path()));
      const g = new THREE.ShapeGeometry(sh, 6);
      g.translate(0, 0, 0.004);
      return g;
    })();
    const winRevealGeo = (() => {
      const sh = roundRect(WIN_HOLE.hx * 2 + 0.02, WIN_HOLE.hy * 2 + 0.02, 0.12) as THREE.Shape;
      sh.holes.push(roundRect(0.25, 0.37, 0.1, new THREE.Path()));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.13, bevelEnabled: false, curveSegments: 6 });
      g.translate(0, 0, -0.13); // wnęka biegnie od wykładziny na zewnątrz, do szyby
      return g;
    })();
    const winPaneGeo = (() => {
      const g = new THREE.ShapeGeometry(roundRect(0.26, 0.38, 0.1) as THREE.Shape, 6);
      g.translate(0, 0, -0.12);
      return g;
    })();
    // roleta: pas od górnej krawędzi szyby w dół (długość przez skalę y), tuż przed szybą
    const winShadeGeo = new THREE.PlaneGeometry(0.25, 1);
    winShadeGeo.translate(0, -0.5, -0.1);
    const winHandleGeo = new THREE.BoxGeometry(0.12, 0.018, 0.02);
    winHandleGeo.translate(0, 0, -0.095);
    const grilleGeo = new THREE.BoxGeometry(0.34, 0.06, 0.012);
    const capsule = new THREE.CapsuleGeometry(0.5, 1, 6, 20);
    // walec wzdłuż kadłuba: długość 1, średnica 1 (kanały, wiązki kabli)
    const cylX = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
    cylX.rotateZ(Math.PI / 2);
    // walec pionowy, misa (zwężająca się ku dołowi) i płaski pierścień (deska sedesu) – średnica 1, wysokość 1
    const cylV = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    const sphere = new THREE.SphereGeometry(0.5, 16, 12);
    const cone = new THREE.CylinderGeometry(0.5, 0.36, 1, 24);
    const ringH = new THREE.TorusGeometry(0.4, 0.09, 8, 28);
    ringH.rotateX(Math.PI / 2);
    capsule.rotateZ(Math.PI / 2);
    const ld3 = ld3Geo();
    // instalacje nad sufitem: główny kanał klimatyzacji wzdłuż grzbietu i wiązki kabli po obu stronach
    // ---------- ładownie ----------
    const ch = half(CARGO_Y + 0.1) + 0.05;
    const cargoFloor = HOLDS.map(([a, b]) => box([(a + b) / 2, CARGO_Y - 0.05, 0], [b - a, 0.1, 2 * (Math.min(hw(CARGO_Y - 0.1, a), hw(CARGO_Y - 0.1, b)) - 0.14)]));
    const rollers: THREE.Matrix4[] = [];
    for (const [a, b] of HOLDS) for (let x = a + 0.2; x < b; x += 0.4) for (const z of [-0.82, 0.82]) rollers.push(box([x, CARGO_Y + 0.02, z], [0.05, 0.05, 1.2]));
    // ładownia na bagaż luzem za tylną ładownią
    const bulkBags: THREE.Matrix4[] = [];
    // ładownia luzem: za tylną ładownią, na własnej podłodze (spód kadłuba jest tu już wyżej); torby i walizki w stosie
    const BY = -2.42 + FUS_DY;
    for (let i = 0; i < 14; i++) bulkBags.push(box([12.55 + (i % 5) * 0.42, BY + 0.2 + Math.floor(i / 5) * 0.3, 0.15 + ((i * 7) % 5) * 0.1 - 0.2], [0.38, 0.28, 0.5], [0, i * 0.4, 0]));
    cargoFloor.push(box([13.4, BY - 0.03, 0], [2.4, 0.06, 2 * (Math.min(hw(BY - 0.06, 12.2), hw(BY - 0.06, 14.6)) - 0.12)]));
    // stożek ogonowy: śruba trymera statecznika poziomego
    const jack = [box([26.2 + PA, 0.75 + FUS_DY, 0], [0.16, 1.5, 0.16]), box([26.2 + PA, 1.55 + FUS_DY, 0], [0.4, 0.3, 0.4])];
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      const U = { geo: unit };
      const can = new THREE.Object3D();
      checkInside({
        beams: { ...U, mats: beams }, floor: { ...U, mats: floor }, struts: { ...U, mats: struts }, keel: { ...U, mats: keel },
        centre: { ...U, mats: centre }, spars: { ...U, mats: spars }, bay: { ...U, mats: bay },
        seatJ: { ...U, mats: seatJ }, seatY: { ...U, mats: seatY }, heads: { ...U, mats: heads },
        legs: { ...U, mats: legs }, bins: { ...U, mats: bins }, cargoFloor: { ...U, mats: cargoFloor }, rollers: { ...U, mats: rollers },
        bulkBags: { ...U, mats: bulkBags }, jack: { ...U, mats: jack },
        ld3: { geo: ld3, mats: CARGO_SLOTS.map((sl) => { can.position.set(sl.x, CARGO_Y + 0.03, 0); can.scale.set(1, 1, sl.z < 0 ? -1 : 1); can.position.z = sl.z; can.updateMatrix(); return can.matrix.clone(); }) },
        ...Object.fromEntries(detail.map((g, i) => [`detail ${g.k}${g.e ? ' (świeci)' : ''} #${i}`, { geo: g.g === 'capsule' ? capsule : g.g === 'cylX' ? cylX : g.g === 'cylV' ? cylV : g.g === 'cone' ? cone : g.g === 'ringH' ? ringH : g.g === 'sphere' ? sphere : unit, mats: g.m }])),
      });
    }
    return { unit, liner, linerDoors, ring, ringThick, frames, cutFrames, cargoSurround, doorFrames, doorSills, stringers, beams, floor, struts, keel, bulk, bulkM, disc, fwdPlate, fireWall, centre, spars, bay, seatJ, seatY, heads, legs, bins, detail, winSurround, winReveal, winPane, winShade, winHandle, grilles, winSurroundGeo, winRevealGeo, winPaneGeo, winShadeGeo, winHandleGeo, grilleGeo, capsule, cylX, cylV, cone, ringH, sphere, ld3, cargoFloor, rollers, bulkBags, jack };
  }), []);
  // kontenery: w zakładce ładowni wjeżdżają po kolei przez drzwi ładowni (prawa burta) i jadą po rolkach na miejsce
  const cans = useRef<THREE.InstancedMesh>(null);
  const canParts = useRef<(THREE.InstancedMesh | null)[]>([]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const mm = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const m = cans.current;
    if (!m) return;
    const t = view === 'cargo' ? FUS_LIVE.cargoT : 1e9;
    CARGO_SLOTS.forEach((sl, i) => {
      const { p, yaw, vis } = canPose(sl, t);
      tmp.position.set(p[0], p[1], p[2]);
      tmp.rotation.set(0, yaw, 0);
      // kontener pociągu, który jeszcze nie wjechał na płytę – schowany
      tmp.scale.set(vis ? 1 : 0, vis ? 1 : 0, vis ? (sl.z < 0 ? -1 : 1) : 0);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      CAN_PARTS.forEach((pt, k) => {
        const im = canParts.current[k];
        if (!im) return;
        pt.mats.forEach((L, j) => im.setMatrixAt(i * pt.mats.length + j, mm.multiplyMatrices(tmp.matrix, L)));
      });
    });
    m.instanceMatrix.needsUpdate = true;
    canParts.current.forEach((im) => im && (im.instanceMatrix.needsUpdate = true));
  });
  const S = view === 'struct';
  return (
    <group>
      {!S && (
        <mesh geometry={doorHoles ? d.linerDoors : d.liner}>
          {/* w zakładce o ciśnieniu wykładzina półprzezroczysta – widać piony nawiewu schowane w burtach */}
          <M k="liner" side={THREE.DoubleSide} opacity={view === 'press' ? 0.28 : 1} />
        </mesh>
      )}
      {/* konstrukcja – w zakładce o konstrukcji wyróżniona kolorami */}
      <Inst geo={S ? d.ringThick : d.ring} mats={d.frames} k={S ? '#5eead4' : 'dark'} />
      <mesh geometry={d.cutFrames}>
        <M k={S ? '#5eead4' : 'dark'} side={THREE.DoubleSide} />
      </mesh>
      {/* rama otworów drzwi ładowni: wręgi krawędziowe i progi */}
      <mesh geometry={d.cargoSurround}>
        <M k={S ? '#fb923c' : '#7b8590'} side={THREE.DoubleSide} />
      </mesh>
      {S && <Inst geo={d.unit} mats={d.stringers} k="#fbbf24" />}
      {S && <Inst geo={d.ringThick} mats={d.doorFrames} k="#fb923c" />}
      {S && <Inst geo={d.unit} mats={d.doorSills} k="#fb923c" />}
      <Inst geo={d.unit} mats={d.beams} k={S ? '#a78bfa' : '#59616b'} />
      <Inst geo={d.unit} mats={d.struts} k={S ? '#a78bfa' : '#59616b'} />
      <Inst geo={d.unit} mats={d.floor} k={S ? '#4b5563' : 'carpet'} />
      <Inst geo={d.unit} mats={d.keel} k={S ? '#f472b6' : 'primer'} />
      <Inst geo={d.bulk} mats={d.bulkM} k={S ? '#f472b6' : 'primer'} side={THREE.DoubleSide} />
      <mesh geometry={d.fwdPlate}>
        <M k={S ? '#f472b6' : 'primer'} side={THREE.DoubleSide} />
      </mesh>
      <Inst geo={d.disc} mats={d.fireWall} k="#b9bfc6" side={THREE.DoubleSide} />
      <Inst geo={d.unit} mats={d.centre} k="primer" />
      <Inst geo={d.unit} mats={d.spars} k={S ? '#bef264' : '#7f9a63'} />
      <Inst geo={d.unit} mats={d.bay} k="#565d66" />
      <Inst geo={d.unit} mats={d.cargoFloor} k="#6b7280" />
      <Inst geo={d.unit} mats={d.rollers} k="#9ca3af" />
      <Inst geo={d.unit} mats={d.jack} k="#8b939c" />
      {/* okna (także w zakładce o konstrukcji – otwory w wykładzinie, wnęki i szyby) */}
      {!S && <Inst geo={d.winSurroundGeo} mats={d.winSurround} k="#f1ede4" side={THREE.DoubleSide} />}
      <Inst geo={d.winRevealGeo} mats={d.winReveal} k={S ? '#38bdf8' : '#dcd6ca'} side={THREE.DoubleSide} />
      <Inst geo={d.winPaneGeo} mats={d.winPane} k="#cfe6fb" emit="#6aa2d8" side={THREE.DoubleSide} />
      {furnished && <Inst geo={d.winShadeGeo} mats={d.winShade} k="#f4f1ea" side={THREE.DoubleSide} />}
      {furnished && <Inst geo={d.winHandleGeo} mats={d.winHandle} k="#9ca3af" />}
      {/* wyposażenie */}
      {furnished && (
        <>
          <Inst geo={d.unit} mats={d.seatJ} k="seatJ" />
          <Inst geo={d.unit} mats={d.seatY} k="seatY" />
          <Inst geo={d.unit} mats={d.heads} k="#e5e7eb" />
          <Inst geo={d.unit} mats={d.legs} k="#9ca3af" />
          <Inst geo={d.unit} mats={d.bins} k="bin" />
          <Inst geo={d.unit} mats={d.bulkBags} k="#3f4a5a" />
          <Inst geo={d.grilleGeo} mats={d.grilles} k="#5b6470" />
          {d.detail.map((gr, i) => (
            <Inst key={i} geo={{ box: d.unit, capsule: d.capsule, cylX: d.cylX, cylV: d.cylV, cone: d.cone, ringH: d.ringH, sphere: d.sphere }[gr.g]} mats={gr.m} k={gr.k} emit={gr.e} cap />
          ))}
          <instancedMesh ref={cans} args={[d.ld3, undefined, CARGO_SLOTS.length]} frustumCulled={false}>
            <M k="can" side={THREE.DoubleSide} />
          </instancedMesh>
          {CAN_PARTS.map((pt, k) => (
            <instancedMesh key={k} ref={(el) => (canParts.current[k] = el)} args={[d.unit, undefined, CARGO_SLOTS.length * pt.mats.length]} frustumCulled={false}>
              <M k={pt.k} />
            </instancedMesh>
          ))}
        </>
      )}
      {labels && <FuselageLabels pick={pick} />}
    </group>
  );
}

/* ---------- powierzchnie sterowe: bryły z przekrojów, obracane wokół zawiasu ---------- */

/** Zamknięty przekrój klapy/lotki (od s0 do krawędzi spływu) z zaokrąglonym noskiem. */
function teSection(S: Surface, r: number, sU: number, sL: number, nose = 0.014): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= 16; i++) pts.push(sp(S, r, 1 - ((1 - sU) * i) / 16, 1));
  const a = sp(S, r, sU, 1);
  const b = sp(S, r, sL, -1);
  const st = S.st(r);
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const bulge = Math.sin(Math.PI * t) * nose * st.c;
    pts.push([a[0] + (b[0] - a[0]) * t - bulge, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  for (let i = 0; i < 16; i++) pts.push(sp(S, r, sL + ((1 - sL) * i) / 16, -1));
  return pts;
}
/** Przekrój slotu: góra od sU do noska, dół do sL, wklęsły tył. */
function slatSection(S: Surface, r: number, sU: number, sL: number): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= 14; i++) pts.push(sp(S, r, sU * (1 - Math.sin(((i / 14) * Math.PI) / 2)), 1));
  for (let i = 1; i <= 8; i++) pts.push(sp(S, r, sL * (1 - Math.cos(((i / 8) * Math.PI) / 2)), -1));
  const lo = sp(S, r, sL, -1);
  const hi = sp(S, r, sU, 1, 0.035);
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const st = S.st(r);
    pts.push([lo[0] + (hi[0] - lo[0]) * t - Math.sin(Math.PI * t) * 0.02 * st.c, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t]);
  }
  pts.push(hi);
  return pts;
}
/** Spojler: cienka płyta na górnym poszyciu, ścieniona ku tyłowi. */
function spoilerSection(S: Surface, r: number): V3[] {
  const pts: V3[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) pts.push(sp(S, r, S_SPOIL + ((S_FLAP_U + 0.01 - S_SPOIL) * i) / n, 1));
  for (let i = n; i >= 0; i--) pts.push(sp(S, r, S_SPOIL + ((S_FLAP_U + 0.01 - S_SPOIL) * i) / n, 1, 0.06 - 0.04 * (i / n)));
  return pts;
}

type Mover = { geo: THREE.BufferGeometry; a: V3; b: V3; kind: 'flap' | 'ail' | 'slat' | 'spoil' | 'rudder' | 'elev'; idx: number; slide: V3; tag?: 'canoe' };
/** Bryła powierzchni sterowej z zawiasem a–b (bryła przesunięta tak, by zawias był w początku układu). */
function mover(geo: THREE.BufferGeometry, a: V3, b: V3, kind: Mover['kind'], idx: number, slide: V3 = [0, 0, 0]): Mover {
  geo.translate(-a[0], -a[1], -a[2]);
  return { geo, a, b, kind, idx, slide };
}
function Movers({ list, k, deflect }: { list: Mover[]; k: string; deflect?: (m: Mover, t: number) => { ang: number; move: number } }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const axes = useMemo(() => list.map((m) => new THREE.Vector3(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]).normalize()), [list]);
  useFrame(({ clock }) => {
    list.forEach((m, i) => {
      const g = refs.current[i];
      if (!g) return;
      const { ang, move } = deflect ? deflect(m, clock.elapsedTime) : { ang: 0, move: 0 };
      g.quaternion.setFromAxisAngle(axes[i], ang);
      g.position.set(m.a[0] + m.slide[0] * move, m.a[1] + m.slide[1] * move, m.a[2] + m.slide[2] * move);
    });
  });
  return (
    <>
      {list.map((m, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)} position={m.a}>
          <mesh geometry={m.geo}>
            <M k={k} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/* ---------- skrzydło ---------- */

/** Cykl pracy mechanizacji w trybie „skrzydło” (ok. 20 s): klapy i sloty → lotki → spojlery. */
function wingCycle(m: Mover, t: number) {
  const c = t % 20;
  const ramp = (a: number, b: number, x: number, y: number) => smooth(a, b, c) * (1 - smooth(x, y, c));
  switch (m.kind) {
    case 'flap': {
      const e = ramp(0.5, 3.5, 6.5, 9);
      return { ang: -0.56 * e, move: 0 };
    }
    case 'slat': {
      // dodatni kąt = nosem w dół (oś biegnie od kadłuba ku końcowi skrzydła); nosek opuszczany nieco mniej
      const e = ramp(0.5, 3.0, 6.5, 8.5);
      return { ang: 0.26 * e, move: 0 };
    }
    case 'ail': {
      const e = ramp(9.5, 10.5, 13.5, 14.5);
      return { ang: 0.28 * Math.sin((c - 9.5) * 1.6) * e, move: 0 };
    }
    case 'spoil': {
      // przy wysuniętych klapach spojlery lekko opadają i domykają szczelinę nad klapą; potem podnoszą się do hamowania
      const droop = ramp(0.5, 3.5, 6.5, 9);
      const e = ramp(15, 16, 18.2, 19.4);
      return { ang: 0.75 * e - 0.1 * droop, move: 0 };
    }
    default:
      return { ang: 0, move: 0 };
  }
}

/** Ustawienie mechanizacji skrzydła: klapy (kąt w stopniach, wysunięcie 0…1) i sloty (0…1). */
export type Mech = { flap: number; fowler: number; slat: number };
function Wing({ open, animate, ctlAnim = false, mech, canoes = true, side = 1, surfaces, outside = false }: { open: boolean; animate: boolean; ctlAnim?: boolean; mech?: Mech; canoes?: boolean; side?: number; surfaces?: { aileron: number; spoiler?: number }; outside?: boolean }) {
  // mechanizacja dojeżdża płynnie do zadanego ustawienia (ok. 1,5 s – jak prawdziwe klapy, tylko szybciej)
  const mc = useRef<Mech>({ flap: 0, fowler: 0, slat: 0 });
  const mt = useRef(mech);
  mt.current = mech;
  const mLast = useRef(0);
  useFrame(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - (mLast.current || now)) / 1000);
    mLast.current = now;
    const target = mt.current ?? { flap: 0, fowler: 0, slat: 0 };
    const k = 1 - Math.exp(-dt * 2.4);
    mc.current.flap += (target.flap - mc.current.flap) * k;
    mc.current.fowler += (target.fowler - mc.current.fowler) * k;
    mc.current.slat += (target.slat - mc.current.slat) * k;
  });
  const mechDef = useMemo(
    () => (m: Mover) => {
      const c = mc.current;
      if (m.kind === 'flap') return { ang: -c.flap * (Math.PI / 180), move: 0 };
      if (m.kind === 'slat') return { ang: 0.26 * c.slat, move: 0 };
      if (m.kind === 'spoil') return { ang: -0.1 * Math.min(1, c.flap / 32), move: 0 };
      return { ang: 0, move: 0 };
    },
    [],
  );
  const g = useMemo(() => cached('wing', () => {
    const rB = [1.2, ...W_FLAPS.flat(), ...W_AIL.flat(), ...W_DROOP, ...W_SLATS.flat(), ...W_SPOILERS.flat(), W_TIP, W_REND, W_HOLE.r0, W_HOLE.r1, LEG_SLOT.z0, LEG_SLOT.z1, LEG_NECK.z1];
    const rs = refine(rB, 0.32);
    const sB = [0, 0.012, 0.035, 0.04, 0.07, S_DROOP_U, S_SLAT_U, S_FS, 0.17, 0.3, 0.45, 0.58, S_RS, S_SPOIL, 0.7, S_FLAP_L, S_FLAP_U, 0.85, 0.93, 1];
    const ss = refine(sB, 0.022);
    const slatSpans: [number, number][] = [W_DROOP, W_SLAT_SPAN];
    const teSpans: [number, number][] = [...W_FLAPS, ...W_AIL];
    const upSkip = (cut: boolean) => (s: number, r: number) =>
      (r > W_DROOP[0] && r < W_DROOP[1] && s < S_DROOP_U) ||
      (r > W_SLAT_SPAN[0] && r < W_SLAT_SPAN[1] && s < S_SLAT_U) ||
      (inSpan(r, W_FLAPS) && s > S_SPOIL) ||
      (inSpan(r, W_AIL) && s > S_FLAP_L) ||
      (cut && W_CUT(s, r));
    const loSkip = (s: number, r: number) =>
      (r > W_DROOP[0] && r < W_DROOP[1] && s < S_DROOP_L) ||
      (r > W_SLAT_SPAN[0] && r < W_SLAT_SPAN[1] && s < S_SLAT_L) ||
      (inSpan(r, teSpans) && s > S_FLAP_L) ||
      // szczelina goleni podwozia głównego (x z ułamka cięciwy)
      (r < LEG_NECK.z1 + 0.5 && inLegSlot(WING.st(r).x + s * WING.st(r).c, r));
    const upper = grid(ss, rs, (s, r) => sp(WING, r, s, 1), upSkip(false));
    const full = upper.getIndex()!.clone();
    // przekrój kadłuba: poszycie skrzydła dopiero od burty – część wewnątrz kadłuba wystawałaby nad podłogę kabiny
    const outG = grid(ss, rs, (s, r) => sp(WING, r, s, 1), (s, r) => r < W_SIDE - 0.05 || upSkip(false)(s, r));
    const fullOut = outG.getIndex()!.clone();
    outG.dispose();
    const cutG = grid(ss, rs, (s, r) => sp(WING, r, s, 1), upSkip(true));
    const cut = cutG.getIndex()!.clone();
    cutG.dispose();
    const lower = grid(ss, rs, (s, r) => sp(WING, r, s, -1), loSkip);
    const lowFull = lower.getIndex()!.clone();
    const lowG = grid(ss, rs, (s, r) => sp(WING, r, s, -1), (s, r) => r < W_SIDE - 0.05 || loSkip(s, r));
    const lowOut = lowG.getIndex()!.clone();
    lowG.dispose();
    // zaślepka końca wingletu
    const tip = loftSections([W_REND - 0.001, W_REND], (r) => [...Array.from({ length: 17 }, (_, i) => sp(WING, r, 1 - i / 16, 1)), ...Array.from({ length: 15 }, (_, i) => sp(WING, r, (i + 1) / 16, -1))]);
    // ciemne wnęki widoczne w szczelinach: za slotami (nosek) i przed klapami/lotkami
    // stały nosek skrzydła za slotem: zaokrąglona powierzchnia dopasowana do wklęsłego tyłu slotu (po wysunięciu
    // slotu widać gładki nosek i szczelinę, a nie płaską płytę)
    const fixedNose = merge(
      slatSpans.map(([a, b]) =>
        grid(refine([0, 1], 0.08), refine([a, b], 0.5), (t, r) => {
          const droop = a === W_DROOP[0];
          const lo = sp(WING, r, (droop ? S_DROOP_L : S_SLAT_L) + 0.003, -1, 0.004);
          const hi = sp(WING, r, (droop ? S_DROOP_U : S_SLAT_U) + 0.003, 1, 0.04);
          const c = WING.st(r).c;
          // ten sam łuk co tylna ścianka slotu (wybrzuszony do przodu), lekko cofnięty
          return [lo[0] + (hi[0] - lo[0]) * t - Math.sin(Math.PI * t) * 0.02 * c + 0.012, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t] as V3;
        }),
      ),
    );
    const coves = merge([
      ...teSpans.map(([a, b]) => grid([0, 1], refine([a, b], 0.5), (u, r) => (u ? sp(WING, r, S_FLAP_L - 0.012, 1, inSpan(r, W_FLAPS) ? 0.07 : 0.01) : sp(WING, r, S_FLAP_L - 0.012, -1, 0.005)))),
    ]);
    // ruchome powierzchnie
    const movers: Mover[] = [];
    /**
     * Owiewka prowadnicy klapy jak w A350: smukła, głęboka (mieści zawias klapy), z ogonem lekko odchylonym w dół.
     * Dzieli się na część stałą (przód, do skrzydła) i tylną, która obraca się razem z klapą wokół zawiasu.
     */
    const canoePieces = (r: number) => {
      const st = WING.st(r);
      // proporcje zmierzone na modelu referencyjnym A350-900: początek w ok. 1/3 cięciwy, koniec ogona ok. 0,19 cięciwy
      // za krawędzią spływu
      const x0 = st.x + 0.34 * st.c;
      const x1 = st.x + 1.19 * st.c;
      // podział dokładnie na osi zawiasu: wsporniki leżą w całości w tylnej części, która obraca się razem z nimi,
      // więc w żadnym położeniu klapy nie wychodzą na zewnątrz
      const xs = st.x + 0.79 * st.c;
      // górna krawędź owiewki: lekko wewnątrz spodu skrzydła; za krawędzią spływu ogon odchyla się w dół
      const top = (x: number): V3 => {
        const s = (x - st.x) / st.c;
        if (s <= 1) return sp(WING, r, Math.max(0, s), -1, 0.05);
        const e = sp(WING, r, 1, -1, -0.05);
        const d = (s - 1) * st.c * 0.1;
        return [x, e[1] - st.n[1] * d, e[2] - st.n[2] * d];
      };
      const ramp = (v: number) => v * v * (3 - 2 * v);
      /**
       * Przekrój w kształcie litery U: u góry szeroko przylega do spodu skrzydła (bez przewężenia), u dołu zaokrąglony.
       * Z przodu owiewka rozlewa się płasko po skrzydle (głębokość rośnie od zera, szerokość jest od razu spora),
       * od ok. 0,6 cięciwy do krawędzi spływu ma płaskie dno, za nią ogon zwęża się do szpica.
       */
      const sec = (x: number): V3[] => {
        const s = (x - st.x) / st.c;
        const front = ramp(Math.min(1, Math.max(0, (s - 0.34) / 0.26)));
        const tail = s <= 1 ? 1 : Math.max(0, 1 - (s - 1) / 0.19);
        // głębokość ok. 0,55 m (mieści zawias 0,35 m pod skrzydłem z okuciem), szerokość ok. 0,6 m
        const d = 0.01 + 0.55 * front * Math.pow(tail, 0.75);
        const w = 0.03 + 0.27 * (0.35 + 0.65 * front) * Math.pow(tail, 0.9);
        const t = top(x);
        const N = 22;
        return Array.from({ length: N + 1 }, (_, i) => {
          const phi = -Math.PI / 2 + (Math.PI * i) / N;
          const dz = w * Math.sin(phi);
          // dno zaokrąglone, boki prawie pionowe tuż pod skrzydłem
          const dy = -d * Math.pow(Math.cos(phi), 0.7);
          // „w dół” wzdłuż normalnej skrzydła (wznios), tak jak zawias i wsporniki
          return [x, t[1] + st.n[1] * dy, t[2] + st.n[2] * dy + dz] as V3;
        });
      };
      // obie części stykają się (bez szpary, przez którą prześwitywałby wspornik)
      return { fwd: loftSections(refine([x0, xs], 0.08), sec), aft: loftSections(refine([xs, x1 - 0.005], 0.08), sec) };
    };
    const fixedCanoes: THREE.BufferGeometry[] = [];
    W_FLAPS.forEach(([a, b], i) => {
      const geo = loftSections(refine([a + 0.03, b - 0.03], 0.5), (r) => teSection(WING, r, S_FLAP_U, S_FLAP_L));
      // klapa na nisko opuszczonym zawiasie (dropped hinge, jak w A350): zawias schowany w owiewce ok. 0,35 m pod
      // skrzydłem – sam obrót przesuwa klapę do tyłu i w dół, otwierając szczelinę, bez osobnej szyny
      const ha = sp(WING, a, 0.79, -1, -0.35);
      const hb = sp(WING, b, 0.79, -1, -0.35);
      // wsporniki (ramiona zawiasu) w miejscach owiewek: trójkątny wspornik od zawiasu do spodu klapy;
      // po wysunięciu klapy widać, na czym ona wisi
      const arms: THREE.BufferGeometry[] = [];
      const tails: THREE.BufferGeometry[] = [];
      for (const r of W_CANOES.filter((c) => c > a + 0.2 && c < b - 0.2)) {
        const h = sp(WING, r, 0.79, -1, -0.35);
        const tube = (p: V3, q: V3, rad: number) => new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(...p), new THREE.Vector3(...q)), 1, rad, 6, false);
        const f1 = sp(WING, r, 0.81, -1, 0.02);
        const f2 = sp(WING, r, 0.9, -1, 0.015);
        // cienkie ramiona w całości wewnątrz owiewki
        arms.push(tube(h, f1, 0.05), tube(h, f2, 0.04), tube(f1, f2, 0.03));
        const hub = new THREE.CylinderGeometry(0.08, 0.08, 0.16, 10);
        hub.rotateX(Math.PI / 2);
        hub.translate(h[0], h[1], h[2]);
        arms.push(hub);
        const cp = canoePieces(r);
        fixedCanoes.push(cp.fwd);
        tails.push(cp.aft);
      }
      movers.push(mover(geo, ha, hb, 'flap', i));
      // tylne części owiewek i wsporniki obracają się z klapą; są osobno, bo znikają razem z owiewkami
      // (bez owiewki wspornik wisiałby w powietrzu pod skrzydłem)
      if (tails.length) movers.push({ ...mover(merge([...tails, ...arms]), ha, hb, 'flap', i), tag: 'canoe' });
    });
    W_AIL.forEach(([a, b], i) => movers.push(mover(loftSections(refine([a + 0.03, b - 0.03], 0.5), (r) => teSection(WING, r, S_FLAP_L, S_FLAP_L, 0.012)), mid(WING, a, S_FLAP_L + 0.01), mid(WING, b, S_FLAP_L + 0.01), 'ail', i)));
    W_SPOILERS.forEach(([a, b], i) => movers.push(mover(loftSections(refine([a, b], 0.5), (r) => spoilerSection(WING, r)), sp(WING, a, S_SPOIL, 1, 0.03), sp(WING, b, S_SPOIL, 1, 0.03), 'spoil', i)));
    [W_DROOP, ...W_SLATS].forEach(([a, b], i) => {
      const droop = i === 0;
      const geo = loftSections(refine([a + 0.02, b - 0.02], 0.5), (r) => slatSection(WING, r, droop ? S_DROOP_U : S_SLAT_U, droop ? S_DROOP_L : S_SLAT_L));
      // nosek opuszczany: zawias na górnym poszyciu tuż za nim – opada w dół bez szczeliny;
      // slot: oś daleko za i pod nim (jak środek łukowej szyny) – obrót wysuwa go do przodu i w dół, otwierając szczelinę
      const pa = droop ? sp(WING, a, S_DROOP_U + 0.004, 1, 0.025) : sp(WING, a, 0.22, -1, -0.5);
      const pb = droop ? sp(WING, b, S_DROOP_U + 0.004, 1, 0.025) : sp(WING, b, 0.22, -1, -0.5);
      let full = geo;
      if (!droop) {
        // prowadnica = łuk okręgu wokół osi obrotu slotu: od tylnego, dolnego narożnika slotu w głąb skrzydła;
        // po wysunięciu slotu łuk wychodzi ze skrzydła dokładnie tak, jak prawdziwa szyna
        const tracks = [0.25, 0.75].map((f) => {
          const r = a + (b - a) * f;
          const piv = sp(WING, r, 0.22, -1, -0.5);
          const att = sp(WING, r, S_SLAT_L * 0.55, -1, 0.06);
          const pts = Array.from({ length: 14 }, (_, k) => {
            // ok. 0,18 rad (krócej ku końcówce, gdzie profil jest cieńszy): przy schowanym slocie cała szyna mieści się w nosku
            const th = -(k / 13) * (r < 15 ? 0.18 : 0.18 - 0.0085 * (r - 15));
            const dx = att[0] - piv[0];
            const dy = att[1] - piv[1];
            return new THREE.Vector3(piv[0] + dx * Math.cos(th) - dy * Math.sin(th), piv[1] + dx * Math.sin(th) + dy * Math.cos(th), att[2]);
          });
          // przy końcówce profil jest cienki – szyna też cieńsza
          return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r > 26 ? 0.025 : 0.045, 6, false);
        });
        full = merge([geo, ...tracks]);
      }
      movers.push(mover(full, pa, pb, 'slat', i));
    });
    // owiewki prowadnic klap („kajaki”) – części stałe; tylne obracają się z klapami
    const canoes = merge(fixedCanoes);
    // linie łączeń (seams): granice mechanizacji na górze i na dole
    const seamUp = merge([
      ...[S_FS, S_RS].map((s) => ribbon(refine([1.2, W_TIP], 0.4).map((r) => sp(WING, r, s, 1)), () => new THREE.Vector3(0, 1, 0), 0.02, 0.008)),
    ]);
    // wyładowniki statyczne: cienkie pręciki za krawędzią spływu końcówki i wingletu
    const dis: THREE.Matrix4[] = [];
    for (const r of [29.75, 30.25, W_TIP + 1.6, W_TIP + 2.6, W_TIP + 3.6]) {
      const p = mid(WING, r, 0.985);
      const st = WING.st(r);
      const roll = Math.atan2(-st.n[2], st.n[1]);
      dis.push(box(p, [0.36, 0.014, 0.014], [roll, 0, 0]));
    }
    // linie łączeń dolnego poszycia wzdłuż dźwigarów (granice paneli kesonu)
    const seamLo = merge([S_FS, S_RS].map((s) => ribbon(refine([1.2, W_TIP], 0.4).map((r) => sp(WING, r, s, -1)), () => new THREE.Vector3(0, -1, 0), 0.02, 0.008)));
    /** Ułożenie płaskiego elementu na poszyciu w (r, s): oś y wzdłuż normalnej (góra/dół), skala sz. */
    const onSkin = (r: number, s: number, side: 1 | -1, sz: V3, lift = 0.008) => {
      const st = WING.st(r);
      // nachylenie poszycia wzdłuż cięciwy w tym miejscu (profil jest wygięty) – płytka leży płasko na skórze
      const a = sp(WING, r, s - 0.02, side);
      const b = sp(WING, r, s + 0.02, side);
      return box(sp(WING, r, s, side, -lift), sz, [Math.atan2(st.n[2], st.n[1]), 0, Math.atan2(b[1] - a[1], b[0] - a[0])]);
    };
    // włazy rewizyjne zbiorników: owalne pokrywy w dolnym poszyciu co ok. 1,45 m, przerwa przy pylonie
    const panels: THREE.Matrix4[] = [];
    const panelRims: THREE.Matrix4[] = [];
    for (let r = 4.3; r <= 25; r += 1.45) {
      if (Math.abs(r - W_ENG) < 1.5) continue;
      const k = 1 - 0.35 * (r / 25);
      panels.push(onSkin(r, 0.37, -1, [0.5 * k, 0.006, 0.3 * k]));
      panelRims.push(onSkin(r, 0.37, -1, [0.58 * k, 0.006, 0.37 * k], 0.005));
    }
    // wlot odpowietrzenia zbiornika (NACA) pod końcem skrzydła: ciemne, zwężające się zagłębienie
    const vent = [onSkin(27.3, 0.43, -1, [0.62, 0.008, 0.16]), onSkin(27.3, 0.47, -1, [0.3, 0.009, 0.1])];
    // pas do chodzenia: obrys na górze skrzydła przy kadłubie (od wyjścia nad skrzydłem ku tyłowi)
    const walkPath = (rs: number[], ss: number[]): V3[] => [
      ...rs.map((r) => sp(WING, r, ss[0], 1)),
      ...[...rs].reverse().map((r) => sp(WING, r, ss[1], 1)),
      sp(WING, rs[0], ss[0], 1),
    ];
    const walk = ribbon(walkPath(refine([3.5, 8.6], 0.25), [0.2, 0.56]), () => new THREE.Vector3(0, 1, 0), 0.05, 0.01);
    // brzeg zdjętego panelu: grubość poszycia (wąska ścianka od skóry w głąb) i rząd nitów dookoła otworu
    const { s0, s1, r0, r1 } = W_HOLE;
    const edgeWall = (pt: (u: number) => [number, number], n: number) => grid([0, 1], Array.from({ length: n + 1 }, (_, i) => i / n), (d, u) => sp(WING, pt(u)[1], pt(u)[0], 1, d * 0.035));
    const holeEdge = merge([
      edgeWall((u) => [s0 + (s1 - s0) * u, r0], 24),
      edgeWall((u) => [s0 + (s1 - s0) * u, r1], 24),
      edgeWall((u) => [s0, r0 + (r1 - r0) * u], 60),
      edgeWall((u) => [s1, r0 + (r1 - r0) * u], 60),
    ]);
    const rivets: THREE.Matrix4[] = [];
    for (let r = r0; r <= r1 + 1e-6; r += 0.22) {
      const c = WING.st(r).c;
      rivets.push(onSkin(r, s0 - 0.06 / c, 1, [0.035, 0.006, 0.035], 0.004), onSkin(r, s1 + 0.06 / c, 1, [0.035, 0.006, 0.035], 0.004));
    }
    for (const r of [r0 - 0.06, r1 + 0.06])
      for (let s = s0; s <= s1 + 1e-6; s += 0.22 / WING.st(r).c) rivets.push(onSkin(r, s, 1, [0.035, 0.006, 0.035], 0.004));
    return { upper, full, fullOut, cut, lower, lowFull, lowOut, tip, coves, fixedNose, movers, canoes, seamUp, seamLo, dis, panels, panelRims, vent, walk, holeEdge, rivets };
  }), []);
  const rod = cached('rod', () => {
    const c = new THREE.CylinderGeometry(1, 0.6, 1, 6);
    c.rotateZ(-Math.PI / 2);
    c.translate(0.5, 0, 0);
    return c;
  });
  // owalna płytka (walec o średnicy i wysokości 1) – włazy rewizyjne i wlot odpowietrzenia
  const disc = cached('disc', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 28));
  // outside – przekrój kadłuba: bez poszycia wewnątrz kadłuba
  const upper = useShared(g.upper, open ? g.cut : outside ? g.fullOut : g.full);
  const lower = useShared(g.lower, outside ? g.lowOut : g.lowFull);
  const groups = useMemo(
    () => ({
      flaps: g.movers.filter((m) => m.kind === 'flap' && !m.tag),
      canoeTails: g.movers.filter((m) => m.tag === 'canoe'),
      ails: g.movers.filter((m) => m.kind === 'ail'),
      spoils: g.movers.filter((m) => m.kind === 'spoil'),
      // nosek opuszczany (pierwszy „slot”, przy kadłubie) jest osobnym elementem do kliknięcia
      droop: g.movers.filter((m) => m.kind === 'slat' && m.idx === 0),
      slats: g.movers.filter((m) => m.kind === 'slat' && m.idx > 0),
    }),
    [g],
  );
  // lotki z manewru: przeciwnie na obu skrzydłach (lewa w dół przy przechylaniu w prawo); na skrzydle z podniesioną
  // lotką pomagają spojlery
  const def = animate
    ? wingCycle
    : ctlAnim
      ? (m: Mover, t: number) => {
          // zakładka usterzenia: lotki w tym samym cyklu co stery, spojlery pomagają na skrzydle z lotką w górze
          const a = controlCycle(t).ail;
          if (m.kind === 'ail') return { ang: -side * a, move: 0 };
          if (m.kind === 'spoil') return { ang: Math.max(0, -side * a) * 1.6, move: 0 };
          return { ang: 0, move: 0 };
        }
    : surfaces
      ? (m: Mover, t: number) => {
          const base = mechDef(m);
          if (m.kind === 'ail') return { ang: -side * surfaces.aileron, move: 0 };
          if (m.kind === 'spoil') return { ang: base.ang + Math.max(0, -side * surfaces.aileron) * 1.6 + (surfaces.spoiler ?? 0), move: 0 };
          return mech ? base : { ang: 0, move: 0 * t };
        }
      : mech
        ? mechDef
        : undefined;
  return (
    <group>
      <Pk id="skin">
        <mesh geometry={upper}>
          <M k="wing" side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={lower}>
          <M k="wing" side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={g.coves}>
          <M k="cove" side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={g.fixedNose}>
          <M k="wing" side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={g.seamUp}>
          <M k="#bfc5cc" side={THREE.DoubleSide} />
        </mesh>
      </Pk>
      <Pk id="winglet">
        <mesh geometry={g.tip}>
          <M k="wing" side={THREE.DoubleSide} />
        </mesh>
      </Pk>
      {canoes && (
        <Pk id="canoe">
          <mesh geometry={g.canoes}>
            <M k="wing" />
          </mesh>
          <Movers list={groups.canoeTails} k="wing" deflect={def} />
        </Pk>
      )}
      <Pk id="dis">
        <Inst geo={rod} mats={g.dis} k="dark" />
      </Pk>
      <Pk id="skin">
        <mesh geometry={g.seamLo}>
          <M k="#bfc5cc" side={THREE.DoubleSide} />
        </mesh>
      </Pk>
      <Pk id="panel">
        <Inst geo={disc} mats={g.panelRims} k="#9aa3ad" />
        <Inst geo={disc} mats={g.panels} k="#dfe4e9" />
      </Pk>
      <Pk id="vent">
        <Inst geo={disc} mats={g.vent} k="#2a3038" />
      </Pk>
      {!open && (
        <Pk id="walk">
          <mesh geometry={g.walk}>
            <M k="#4b5563" side={THREE.DoubleSide} />
          </mesh>
        </Pk>
      )}
      <Pk id="flap">
        <Movers list={groups.flaps} k="panel" deflect={def} />
      </Pk>
      <Pk id="aileron">
        <Movers list={groups.ails} k="panel" deflect={def} />
      </Pk>
      <Pk id="spoiler">
        <Movers list={groups.spoils} k="panel" deflect={def} />
      </Pk>
      <Pk id="droop">
        <Movers list={groups.droop} k="panel" deflect={def} />
      </Pk>
      <Pk id="slat">
        <Movers list={groups.slats} k="panel" deflect={def} />
      </Pk>
      {open && (
        <Pk id="skin">
          <mesh geometry={g.holeEdge}>
            <M k="#a7b0ba" side={THREE.DoubleSide} />
          </mesh>
          <Inst geo={disc} mats={g.rivets} k="#aab2bb" />
        </Pk>
      )}
      {open && <WingBox />}
    </group>
  );
}

/** Wnętrze skrzydła w trybie „skrzydło”: dźwigary, żebra, podłużnice, paliwo – widoczne przez zdjęte poszycie. */
function WingBox() {
  const d = useMemo(() => cached('wingbox', () => {
    const rs = refine([1.2, W_TIP - 0.4], 0.5);
    const spar = (s: number) => grid([0, 1], rs, (u, r) => (u ? sp(WING, r, s, 1, 0.03) : sp(WING, r, s, -1, 0.03)));
    const R0 = 3.6;
    const R1 = 20.4;
    const ribRs: number[] = [];
    for (let r = R0; r < 20.5; r += 0.72) ribRs.push(r);
    /** Punkt wewnątrz kesonu: s – położenie wzdłuż cięciwy, t – wysokość od dolnego (0) do górnego (1) poszycia. */
    const inBox = (r: number, s: number, t: number, inset = 0.03): V3 => {
      const lo = sp(WING, r, s, -1, inset);
      const hi = sp(WING, r, s, 1, inset);
      return [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t];
    };
    const spars = merge([spar(S_FS), spar(S_RS)]);
    // pasy dźwigarów: półki u góry i u dołu ścianki, skierowane do wnętrza kesonu (przenoszą zginanie skrzydła)
    const capR = refine([1.2, W_TIP - 0.4], 0.5);
    const cap = (s: number, side: 1 | -1, dir: 1 | -1) => grid([0, 1], capR, (u, r) => sp(WING, r, s + dir * u * (0.13 / WING.st(r).c), side, 0.03));
    const capG = merge([cap(S_FS, 1, 1), cap(S_FS, -1, 1), cap(S_RS, 1, -1), cap(S_RS, -1, -1)]);
    // pionowe usztywnienia ścianek dźwigarów – przy każdym żebrze
    const tube = (p: V3, q: V3, rad: number) => new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(...p), new THREE.Vector3(...q)), 1, rad, 4, false);
    const stiff = merge(ribRs.flatMap((r) => [S_FS + 0.004, S_RS - 0.004].map((s) => tube(inBox(r + 0.03, s, 0), inBox(r + 0.03, s, 1), 0.022))));
    /**
     * Żebro: płyta w przekroju kesonu z rzędem owalnych otworów odciążających (mniejsza masa, paliwo przepływa
     * między komorami). Kształt rysowany w (s, t) i odwzorowany na przekrój – brzegi idą dokładnie po poszyciu.
     */
    const ribPlate = (r: number) => {
      const N = 16;
      const a = S_FS + 0.004;
      const b = S_RS - 0.004;
      const shape = new THREE.Shape();
      shape.moveTo(a, 0);
      for (let i = 1; i <= N; i++) shape.lineTo(a + ((b - a) * i) / N, 0);
      for (let i = N; i >= 0; i--) shape.lineTo(a + ((b - a) * i) / N, 1);
      shape.lineTo(a, 0);
      const nh = 4;
      for (let k = 0; k < nh; k++) {
        const h = new THREE.Path();
        h.absellipse(a + ((b - a) * (k + 0.5)) / nh, 0.5, ((b - a) / nh) * 0.32, 0.26, 0, Math.PI * 2, true, 0);
        shape.holes.push(h);
      }
      const plate = (rr: number) => {
        const geo = new THREE.ShapeGeometry(shape, 14);
        const pa = geo.getAttribute('position');
        for (let i = 0; i < pa.count; i++) {
          const p = inBox(rr, pa.getX(i), pa.getY(i));
          pa.setXYZ(i, p[0], p[1], p[2]);
        }
        geo.deleteAttribute('normal');
        geo.deleteAttribute('uv');
        geo.computeVertexNormals();
        return geo;
      };
      return [plate(r - 0.01), plate(r + 0.01)];
    };
    const ribG = merge(ribRs.flatMap(ribPlate));
    // półki żeber u góry i u dołu (do nich nitowane jest poszycie)
    const ribCaps = merge(
      ribRs.flatMap((r) =>
        ([1, -1] as const).map((side) => grid(refine([S_FS, S_RS], 0.03), [r - 0.05, r + 0.05], (s, rr) => sp(WING, rr, s, side, 0.031))),
      ),
    );
    // wnętrze dolnego poszycia – zagruntowane, ciemniejsze niż lakier z zewnątrz
    const floor = grid(refine([S_FS, S_RS], 0.03), refine([R0 - 0.4, R1 + 0.4], 0.5), (s, r) => sp(WING, r, s, -1, 0.026));
    // przewód paliwa wzdłuż tylnego dźwigara do pomp przy silniku i dwie pompy zanurzone na dnie zbiornika
    const galleryPts = refine([2.0, W_ENG - 1.2], 0.8).map((r) => new THREE.Vector3(...inBox(r, S_RS - 0.035, 0.18)));
    const pumpAt = [W_ENG - 1.2, W_ENG - 2.0].map((r) => inBox(r, S_RS - 0.06, 0.2));
    const gallery = merge([
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(galleryPts), 48, 0.045, 8, false),
      ...pumpAt.map((p) => {
        const c = new THREE.CylinderGeometry(0.11, 0.11, 0.26, 16);
        c.translate(p[0], p[1], p[2]);
        return c;
      }),
    ]);
    const fuelTop = (r: number, s: number) => {
      const lo = sp(WING, r, s, -1, 0.04);
      const hi = sp(WING, r, s, 1, 0.04);
      return [lo[0], lo[1] + (hi[1] - lo[1]) * 0.58, lo[2] + (hi[2] - lo[2]) * 0.58] as V3;
    };
    const fuel = loftSections(refine([1.2, 23.5], 0.6), (r) => [...Array.from({ length: 9 }, (_, i) => fuelTop(r, S_FS + 0.01 + ((S_RS - S_FS - 0.02) * i) / 8)), ...Array.from({ length: 9 }, (_, i) => sp(WING, r, S_RS - 0.01 - ((S_RS - S_FS - 0.02) * i) / 8, -1, 0.04))]);
    // podłużnice o przekroju T na górnym i dolnym poszyciu: półka przy skórze i ścianka w głąb kesonu
    const strR = refine([R0, R1], 0.5);
    const tee = (s: number, side: 1 | -1) => [
      grid([-1, 1], strR, (u, r) => sp(WING, r, s + u * (0.025 / WING.st(r).c), side, 0.032)),
      grid([0, 1], strR, (u, r) => sp(WING, r, s, side, 0.032 + u * 0.07)),
    ];
    const stringers = merge([0.2, 0.26, 0.32, 0.38, 0.44, 0.5, 0.555].flatMap((s) => [...tee(s, 1), ...tee(s, -1)]));
    return { spars, capG, stiff, ribG, ribCaps, floor, fuel, gallery, stringers };
  }), []);
  return (
    <group>
      <Pk id="spar">
        <mesh geometry={d.spars}>
          <M k="primer" side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={d.capG}>
          <M k="#86a36b" side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={d.stiff}>
          <M k="#86a36b" />
        </mesh>
      </Pk>
      <Pk id="rib">
        <mesh geometry={d.ribG}>
          <M k="primer" side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={d.ribCaps}>
          <M k="#86a36b" side={THREE.DoubleSide} />
        </mesh>
      </Pk>
      <Pk id="stringer">
        <mesh geometry={d.stringers}>
          <M k="#b5c99a" side={THREE.DoubleSide} />
        </mesh>
      </Pk>
      <Pk id="skin">
        <mesh geometry={d.floor}>
          <M k="#6f8a5c" side={THREE.DoubleSide} />
        </mesh>
      </Pk>
      <Pk id="fuel">
        <mesh geometry={d.gallery}>
          <M k="steel" />
        </mesh>
        <mesh geometry={d.fuel} renderOrder={2}>
          <M k="fuel" opacity={0.42} side={THREE.DoubleSide} />
        </mesh>
      </Pk>
    </group>
  );
}

function WingLabels({ range }: { range?: { z0: number; z1: number } | null }) {
  const ctx = useContext(PickCtx);
  const L = (r: number, s: number, dy: number, txt: string, id: string, _color?: string, side: 1 | -1 = 1) => {
    const p = sp(WING, r, s, side);
    // w przyciętym kawałku skrzydła podpisy części, których nie widać, są ukryte
    if (range && (p[2] < range.z0 + 0.6 || p[2] > range.z1 - 0.6)) return null;
    const on = ctx ? ctx.pick.selected === id || ctx.hover === id : false;
    // kolor grupy (konstrukcja, paliwo, krawędź natarcia/spływu, końcówka); wybrany – biały
    return (
      <Lbl
        key={txt}
        occlude
        pos={[p[0], p[1] + dy, p[2]]}
        color={ctx?.pick.selected === id ? '#ffffff' : wingGroupOf(id)?.color}
        active={on}
        onClick={ctx ? () => ctx.pick.onSelect(ctx.pick.selected === id ? null : id) : undefined}
        onHover={ctx ? (h) => ctx.setHover(h ? id : null) : undefined}
      >
        {txt}
      </Lbl>
    );
  };
  return (
    <>
      {L(13.5, 0.15, 0.55, 'dźwigar przedni', 'spar')}
      {L(16.5, 0.6, 0.55, 'dźwigar tylny', 'spar')}
      {L(9.0, 0.38, 0.75, 'żebra', 'rib')}
      {L(12.2, 0.46, 0.32, 'podłużnice', 'stringer')}
      {L(6.0, 0.35, 0.1, 'paliwo w kesonie', 'fuel', '#f5b041')}
      {L(15.6, 0.3, 0.35, 'poszycie', 'skin')}
      {L(6.4, 0.04, 0.45, 'nosek opuszczany', 'droop')}
      {L(22.0, 0.05, 0.45, 'sloty', 'slat')}
      {L(7.0, 0.9, 0.5, 'klapa wewnętrzna', 'flap')}
      {L(16.0, 0.9, 0.5, 'klapa zewnętrzna', 'flap')}
      {L(19.0, 0.69, 0.55, 'spojlery', 'spoiler')}
      {L(13.5, 1.0, -0.75, 'owiewki prowadnic klap', 'canoe', undefined, -1)}
      {L(25.6, 0.88, 0.5, 'lotki', 'aileron')}
      {L(W_TIP + 3.6, 0.4, 0.6, 'winglet', 'winglet')}
      {L(29.9, 0.99, 0.5, 'wyładowniki statyczne', 'dis')}
      {L(13.2, 0.37, -0.55, 'włazy rewizyjne zbiorników', 'panel', undefined, -1)}
      {L(27.3, 0.45, -0.5, 'wlot odpowietrzenia (NACA)', 'vent', undefined, -1)}
      {L(5.6, 0.38, 0.35, 'pas do chodzenia', 'walk')}
      {L(W_TIP - 0.2, 0.0, 0.5, 'światła pozycyjne i strobo', 'light')}
      {L(W_SIDE + 0.25, 0.0, -0.45, 'reflektory lądowania', 'light', undefined, -1)}
    </>
  );
}

/* ---------- usterzenie ---------- */

/**
 * Cykl pracy sterów w zakładce „Usterzenie w ruchu” (18 s): ster kierunku (0–6 s), stery wysokości (6–12 s),
 * lotki z pomocą spojlerów na skrzydłach (12–18 s). Wartości w radianach; ail > 0 – przechylanie w prawo.
 */
export function controlCycle(t: number) {
  const c = t % 18;
  return {
    rudder: 0.32 * Math.sin(c * 0.9) * smooth(0, 1, c) * (1 - smooth(5, 6, c)),
    elev: 0.26 * Math.sin((c - 6) * 1.1) * smooth(6, 7, c) * (1 - smooth(11, 12, c)),
    ail: 0.3 * Math.sin((c - 12) * 1.05) * smooth(12, 13, c) * (1 - smooth(17, 18, c)),
  };
}
function tailCycle(m: Mover, t: number) {
  const k = controlCycle(t);
  if (m.kind === 'rudder') return { ang: k.rudder, move: 0 };
  if (m.kind === 'elev') return { ang: k.elev, move: 0 };
  return { ang: 0, move: 0 };
}

/** Elementy usterzenia schowane w środku (siłowniki, oś obrotu i śruba trymera) – prześwietlone przez poszycie. */
function XMat({ color }: { color: string }) {
  const glow = useContext(GlowCtx);
  return <meshBasicMaterial color={glow > 0.2 ? '#ffffff' : color} transparent opacity={glow > 0.2 ? 0.95 : 0.7} depthTest={false} depthWrite={false} toneMapped={false} />;
}
/** Pręt (walec) między dwoma punktami. */
const rodGeo = (p: V3, q: V3, r: number) => new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(...p), new THREE.Vector3(...q)), 1, r, 8, true);
/** Punkty mechanizmu statecznika poziomego (w osi kadłuba): oś obrotu na tylnym dźwigarze i śruba trymera na przednim. */
const THS_PIVOT: V3 = (() => {
  const p = mid(HTP, 1.0, 0.62);
  return [p[0], p[1], 0];
})();
/** Nasada statecznika pionowego (krawędź natarcia przy kadłubie) – środek skalowania statecznika. */
const VTP_ROOT: V3 = [VTP.st(1.6).x, 1.6, 0];
const THS_JACK: V3 = (() => {
  const p = mid(HTP, 1.0, 0.14);
  return [p[0], p[1], 0];
})();

function Tail({ animate, surfaces, open = false, fin = 1 }: { animate: boolean; surfaces?: { elevator: number; rudder: number }; open?: boolean; fin?: number }) {
  const g = useMemo(() => cached('tail-2', () => {
    const sB = [0, 0.02, 0.06, 0.15, 0.3, 0.5, 0.68, 0.72, 0.85, 1];
    const hr = refine([1.0, ...ELEV, HTP_TIP], 0.3);
    const hs = refine(sB, 0.03);
    const hSkip = (s: number, r: number) => r > ELEV[0] && r < ELEV[1] && s > 0.72;
    const htpU = grid(hs, hr, (s, r) => sp(HTP, r, s, 1), hSkip);
    const htpL = grid(hs, hr, (s, r) => sp(HTP, r, s, -1), hSkip);
    const htpTip = loftSections([HTP_TIP - 0.001, HTP_TIP], (r) => [...Array.from({ length: 13 }, (_, i) => sp(HTP, r, 1 - i / 12, 1)), ...Array.from({ length: 11 }, (_, i) => sp(HTP, r, (i + 1) / 12, -1))]);
    const vr = refine([1.6, ...RUDDER, VTP_TIP], 0.3);
    const vSkip = (s: number, r: number) => r > RUDDER[0] && r < RUDDER[1] && s > 0.68;
    const vtpU = grid(hs, vr, (s, r) => sp(VTP, r, s, 1), vSkip);
    const vtpL = grid(hs, vr, (s, r) => sp(VTP, r, s, -1), vSkip);
    const vtpTip = loftSections([VTP_TIP - 0.001, VTP_TIP], (r) => [...Array.from({ length: 13 }, (_, i) => sp(VTP, r, 1 - i / 12, 1)), ...Array.from({ length: 11 }, (_, i) => sp(VTP, r, (i + 1) / 12, -1))]);
    /*
     * Grzbietowa owiewka przed statecznikiem pionowym: zaczyna się płasko na grzbiecie kadłuba, łagodnie (wklęsło)
     * rośnie i wchodzi w krawędź natarcia statecznika – jej koniec leży już wewnątrz statecznika, więc nie ma
     * tępego zakończenia. Szerokość zbiega się do grubości statecznika przy nasadzie.
     */
    const DX0 = 12.0 + PA;
    const DX1 = 21.4 + PA;
    const dorsal = podLoft(refine([DX0, DX1], 0.25), (x) => {
      const u = (x - DX0) / (DX1 - DX0);
      const top = fusSec(x).yc + fusSec(x).h;
      const hgt = 1.35 * Math.pow(u, 2.2);
      return { yc: top + hgt / 2 - 0.15, h: hgt / 2 + 0.15, zc: 0, w: 0.06 + 0.3 * Math.pow(Math.sin((Math.PI / 2) * Math.min(1, u * 1.25)), 0.9) };
    }, 2.2, 24);
    const movers: Mover[] = [
      mover(loftSections(refine([RUDDER[0] + 0.03, RUDDER[1] - 0.03], 0.4), (r) => teSection(VTP, r, 0.68, 0.68, 0.012)), mid(VTP, RUDDER[0], 0.69), mid(VTP, RUDDER[1], 0.69), 'rudder', 0),
      mover(loftSections(refine([ELEV[0] + 0.03, ELEV[1] - 0.03], 0.4), (r) => teSection(HTP, r, 0.72, 0.72, 0.012)), mid(HTP, ELEV[0], 0.73), mid(HTP, ELEV[1], 0.73), 'elev', 0),
    ];
    const htpCove = grid([0, 1], refine(ELEV, 0.5), (u, r) => sp(HTP, r, 0.715, u ? 1 : -1, 0.005));
    const vtpCove = grid([0, 1], refine(RUDDER, 0.5), (u, r) => sp(VTP, r, 0.675, u ? 1 : -1, 0.005));
    // linie podziału paneli: wzdłuż przedniego i tylnego dźwigara (krawędź natarcia i panele krawędzi spływu są osobne)
    const seamAlong = (S: Surface, rs: number[], s: number, side: 1 | -1, n: THREE.Vector3) => ribbon(rs.map((r) => sp(S, r, s, side)), () => n, 0.03, 0.006);
    const hrs = refine([1.0, HTP_TIP - 0.05], 0.4);
    const vrs = refine([1.6, VTP_TIP - 0.05], 0.4);
    const htpSeams = merge([0.13, 0.62].flatMap((s) => [seamAlong(HTP, hrs, s, 1, new THREE.Vector3(0, 1, 0)), seamAlong(HTP, hrs, s, -1, new THREE.Vector3(0, -1, 0))]));
    const vtpSeams = merge([0.13, 0.6].flatMap((s) => [seamAlong(VTP, vrs, s, 1, new THREE.Vector3(0, 0, 1)), seamAlong(VTP, vrs, s, -1, new THREE.Vector3(0, 0, -1))]));
    // wyładowniki statyczne na krawędziach spływu sterów – obracają się razem ze sterami (ten sam zawias)
    const dis = (S: Surface, rs: number[]) =>
      merge(
        rs.map((r) => {
          const p = mid(S, r, 0.985);
          return rodGeo(p, [p[0] + 0.42, p[1] - 0.02, p[2]], 0.012);
        }),
      );
    const rudderHinge: [V3, V3] = [mid(VTP, RUDDER[0], 0.69), mid(VTP, RUDDER[1], 0.69)];
    const elevHinge: [V3, V3] = [mid(HTP, ELEV[0], 0.73), mid(HTP, ELEV[1], 0.73)];
    const disMovers: Mover[] = [
      mover(dis(VTP, [4.6, 7.3, 10.0]), rudderHinge[0], rudderHinge[1], 'rudder', 1),
      mover(dis(HTP, [4.0, 6.5, 8.6]), elevHinge[0], elevHinge[1], 'elev', 1),
    ];
    // siłowniki: cylinder przy tylnym dźwigarze i tłoczysko do okucia na sterze (trzy na sterze kierunku, po dwa na sterach wysokości)
    const act = (S: Surface, rs: number[]) =>
      merge(rs.flatMap((r) => [rodGeo(mid(S, r, 0.56), mid(S, r, 0.66), 0.14), rodGeo(mid(S, r, 0.66), mid(S, r, 0.71), 0.06)]));
    const rudderAct = act(VTP, [3.8, 6.4, 9.0]);
    const elevAct = act(HTP, [3.0, 6.8]);
    // oś obrotu statecznika poziomego (okucia na tylnym dźwigarze) i śruba trymera z napędem na przednim dźwigarze
    const [px, py] = THS_PIVOT;
    const pivot = merge([rodGeo([px, py, -1.3], [px, py, 1.3], 0.14), ...[-1, 1].map((s) => rodGeo([px, py - 0.6, s * 0.9], [px, py, s * 0.9], 0.11))]);
    const [jx, jy] = THS_JACK;
    const gearbox = new THREE.BoxGeometry(0.55, 0.35, 0.7);
    gearbox.translate(jx, jy - 1.55, 0);
    const nut = new THREE.BoxGeometry(0.28, 0.2, 0.28);
    nut.translate(jx, jy - 0.05, 0);
    const jack = merge([rodGeo([jx, jy - 1.4, 0], [jx, jy + 0.45, 0], 0.12), gearbox, nut]);
    // APU – wylot w stożku ogonowym
    const apu = podLoft(refine([32.6 + PA, 33.5 + PA], 0.1), () => ({ yc: 1.2 + FUS_DY, h: 0.34, zc: 0, w: 0.34 }), 2, 24);
    return { htpU, htpL, htpTip, vtpU, vtpL, vtpTip, dorsal, movers, disMovers, htpCove, vtpCove, htpSeams, vtpSeams, rudderAct, elevAct, pivot, jack, apu };
  }), []);
  // ster wysokości i ster kierunku z manewru (koordynacja zakrętu, podnoszenie nosa)
  const def = animate ? tailCycle : surfaces ? (m: Mover) => ({ ang: m.kind === 'rudder' ? surfaces.rudder : m.kind === 'elev' ? surfaces.elevator : 0, move: 0 }) : undefined;
  const elevMovers = useMemo(() => g.movers.filter((m) => m.kind === 'elev'), [g]);
  const elevDis = useMemo(() => g.disMovers.filter((m) => m.kind === 'elev'), [g]);
  const rudderMovers = useMemo(() => g.movers.filter((m) => m.kind === 'rudder'), [g]);
  const rudderDis = useMemo(() => g.disMovers.filter((m) => m.kind === 'rudder'), [g]);
  // przestawianie całego statecznika poziomego (trym) – w animacji powoli, o ok. ±2,5°, wokół osi na tylnym dźwigarze
  const ths = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ths.current) ths.current.rotation.z = animate ? 0.045 * Math.sin(clock.elapsedTime * 0.45) : 0;
  });
  const paint = <M k="paint" side={THREE.DoubleSide} />;
  return (
    <group>
      {/* statecznik poziomy z oboma sterami wysokości obraca się w całości wokół osi THS_PIVOT */}
      <group position={THS_PIVOT}>
        <group ref={ths}>
          <group position={[-THS_PIVOT[0], -THS_PIVOT[1], 0]}>
            {[1, -1].map((sz) => (
              <group key={sz} scale={[1, 1, sz]}>
                <Pk id="htp">
                  <mesh geometry={g.htpU}>{paint}</mesh>
                  <mesh geometry={g.htpL}>{paint}</mesh>
                  <mesh geometry={g.htpTip}>{paint}</mesh>
                  <mesh geometry={g.htpSeams}>
                    <M k="#b9c0c8" side={THREE.DoubleSide} />
                  </mesh>
                </Pk>
                <mesh geometry={g.htpCove}>
                  <M k="cove" side={THREE.DoubleSide} />
                </mesh>
                <Pk id="elevator">
                  <Movers list={elevMovers} k="panel" deflect={def} />
                </Pk>
                <Pk id="dis">
                  <Movers list={elevDis} k="dark" deflect={def} />
                </Pk>
                {open && (
                  <Pk id="elevAct">
                    <mesh geometry={g.elevAct} renderOrder={12}>
                      <XMat color="#c084fc" />
                    </mesh>
                  </Pk>
                )}
              </group>
            ))}
          </group>
        </group>
      </group>
      {open && (
        <>
          <Pk id="thsPivot">
            <mesh geometry={g.pivot} renderOrder={12}>
              <XMat color="#facc15" />
            </mesh>
          </Pk>
          <Pk id="thsJack">
            <mesh geometry={g.jack} renderOrder={12}>
              <XMat color="#fb923c" />
            </mesh>
          </Pk>
        </>
      )}
      {/* statecznik pionowy ze sterem kierunku – skalowany wokół nasady (zakładka o wielkości statecznika) */}
      <group position={[VTP_ROOT[0], VTP_ROOT[1], 0]} scale={[Math.max(0.001, fin), Math.max(0.001, fin), 1]} visible={fin > 0.02}>
      <group position={[-VTP_ROOT[0], -VTP_ROOT[1], 0]}>
      {open && (
        <Pk id="rudderAct">
          <mesh geometry={g.rudderAct} renderOrder={12}>
            <XMat color="#c084fc" />
          </mesh>
        </Pk>
      )}
      <Pk id="vtp">
        <mesh geometry={g.vtpU}>{paint}</mesh>
        <mesh geometry={g.vtpL}>{paint}</mesh>
        <mesh geometry={g.vtpTip}>{paint}</mesh>
        <mesh geometry={g.vtpSeams}>
          <M k="#b9c0c8" side={THREE.DoubleSide} />
        </mesh>
      </Pk>
      <mesh geometry={g.vtpCove}>
        <M k="cove" side={THREE.DoubleSide} />
      </mesh>
      <Pk id="dorsal">
        <mesh geometry={g.dorsal}>
          <M k="paint" />
        </mesh>
      </Pk>
      <Pk id="rudder">
        <Movers list={rudderMovers} k="panel" deflect={def} />
      </Pk>
      <Pk id="dis">
        <Movers list={rudderDis} k="dark" deflect={def} />
      </Pk>
      </group>
      </group>
      <mesh geometry={g.apu}>
        <M k="dark" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Opisy elementów usterzenia, które można kliknąć w zakładce „Usterzenie w ruchu”. */
export const TAIL_PART_INFO: Record<string, { name: string; desc: string }> = {
  vtp: { name: 'statecznik pionowy', desc: 'Stała, pionowa część ogona – ma ok. 10 m wysokości ponad kadłubem. W środku ma szkielet z belek i żeber z kompozytu węglowego. Działa jak lotki na końcu strzały: gdy samolot zacznie lecieć trochę bokiem, napływające z boku powietrze samo obraca nos z powrotem w kierunku lotu.' },
  rudder: { name: 'ster kierunku', desc: 'Ruchoma tylna część statecznika pionowego. Obraca nos samolotu w lewo albo w prawo. Pomaga w zakrętach, przy lądowaniu z bocznym wiatrem i wtedy, gdy jeden silnik przestanie pracować, a drugi „ciągnie” samolot w bok. Przy dużej prędkości komputery pozwalają wychylić go tylko trochę, żeby nie przeciążyć ogona.' },
  rudderAct: { name: 'siłowniki steru kierunku', desc: 'Trzy siłowniki hydrauliczne w środku statecznika, przy zawiasach steru (pokazane jak na prześwietleniu). Jednym końcem są przymocowane do statecznika, drugim do steru. Każdy ma inne źródło zasilania, więc ster działa nawet po awarii jednej instalacji.' },
  htp: { name: 'statecznik poziomy (przestawiany)', desc: 'Poziome „skrzydełka” na ogonie. Cały statecznik może się powoli obracać o kilka stopni – tak samolot jest wyważany, gdy zmienia się prędkość, położenie klap albo rozłożenie ładunku. Dzięki temu stery wysokości mogą wrócić do położenia środkowego. W animacji widać ten wolny ruch.' },
  elevator: { name: 'ster wysokości', desc: 'Ruchome tylne części statecznika poziomego, po jednej z każdej strony. Służą do szybkich zmian pochylenia: wychylone w górę dociskają ogon w dół i podnoszą nos, wychylone w dół – odwrotnie. Do długotrwałego wyważenia służy przestawny statecznik.' },
  elevAct: { name: 'siłowniki sterów wysokości', desc: 'Po dwa siłowniki na każdy ster, w środku statecznika poziomego (pokazane jak na prześwietleniu). Mają różne źródła zasilania: gdy jeden zawiedzie, drugi przejmuje pracę, a pierwszy tylko tłumi ruchy steru, żeby nie trzepotał.' },
  thsPivot: { name: 'oś obrotu statecznika', desc: 'Okucia, na których obraca się statecznik poziomy – jak na zawiasie. Są w środku ogona, przy tylnej belce statecznika. Przednią krawędź statecznika podnosi i opuszcza śruba.' },
  thsJack: { name: 'śruba trymera statecznika', desc: 'Długa śruba z nakrętką przymocowaną do przedniej belki statecznika. Kręcą nią silniki przez przekładnię na dole: obrót śruby podnosi albo opuszcza przednią krawędź statecznika. Śruba sama się nie obraca, więc gdy napęd stanie, statecznik zostaje tam, gdzie był.' },
  dis: { name: 'wyładowniki statyczne', desc: 'Cienkie pręciki na tylnych krawędziach sterów (i skrzydeł). W locie samolot elektryzuje się od tarcia o powietrze, krople i kryształki lodu. Pręciki oddają ten ładunek do powietrza po trochu i z dala od anten, żeby iskrzenie nie zakłócało łączności radiowej.' },
  dorsal: { name: 'płetwa grzbietowa', desc: 'Opływowe przejście grzbietu kadłuba w przednią krawędź statecznika pionowego. Poprawia opływ statecznika, gdy samolot leci mocno bokiem (np. po awarii silnika), i łagodnie przenosi obciążenia ze statecznika na kadłub.' },
  aileron: { name: 'lotki', desc: 'Po dwie lotki na tylnej krawędzi każdego skrzydła, przy końcu. Wychylają się w przeciwne strony: na jednym skrzydle w dół (skrzydło unosi się mocniej), na drugim w górę (słabiej) – samolot się przechyla. Razem ze sterem kierunku i sterami wysokości pozwalają obracać samolot we wszystkich trzech kierunkach. W A350 lotki wychylają się też lekko w dół razem z klapami, żeby skrzydło lepiej niosło przy starcie i lądowaniu.' },
  spoiler: { name: 'spojlery (pomoc lotkom)', desc: 'Płyty na górze skrzydła, przed klapami. Przy przechylaniu podnoszą się tylko na skrzydle, które ma opaść: odbierają mu część siły nośnej i hamują je, więc samolot przechyla się szybciej i równiej. Po wylądowaniu wszystkie podnoszą się naraz i hamują samolot.' },
  tailLights: { name: 'światła logo', desc: 'Reflektory w górnej powierzchni poziomych stateczników, przy kadłubie. Oświetlają logo linii lotniczej na stateczniku pionowym – nocą na postoju oraz przy starcie i lądowaniu, żeby samolot był lepiej widoczny.' },
};

/**
 * Punkty sterów lewej strony (+z) w układzie samolotu – do strzałek sił i podpisów w zakładkach sterowania.
 * Prawa lotka i prawy ster wysokości: ta sama pozycja z przeciwnym z.
 */
export const CONTROL_PTS = {
  aileron: mid(WING, 27.6, 0.9),
  elevator: mid(HTP, 5.4, 0.86),
  rudder: mid(VTP, 6.2, 0.84),
  /** Środek aerodynamiczny statecznika poziomego (ok. 1/4 cięciwy na połowie rozpiętości). */
  htpAc: mid(HTP, 4.6, 0.3),
  /** Środek siły bocznej statecznika pionowego. */
  vtpAc: mid(VTP, 5.0, 0.35),
};

/**
 * Średnia cięciwa aerodynamiczna (SCA) skrzydła liczona z geometrii modelu (część pod kadłubem – cięciwa przy
 * jego boku): x krawędzi natarcia SCA i jej długość. Dla A350-1000 wychodzi ok. 10,1 m (w rzeczywistości ok. 10,2 m).
 */
export const WING_MAC = (() => {
  let a = 0;
  let b = 0;
  let c = 0;
  const n = 400;
  for (let i = 0; i < n; i++) {
    const st = WING.st(Math.max(W_SIDE, ((i + 0.5) / n) * W_TIP));
    a += st.c;
    b += st.c * st.c;
    c += st.c * st.x;
  }
  return { lemac: c / a, mac: b / a, y: W_Y0 };
})();
/** x punktu na SCA o danym ułamku (0 – krawędź natarcia, 1 – spływu). */
export const macX = (f: number) => WING_MAC.lemac + f * WING_MAC.mac;
/** Poziomy w układzie samolotu: płyta lotniska, podłoga kabiny, podłoga luków bagażowych. */
export const PLANE_LEVELS = { ground: GROUND, floor: FLOOR, cargo: CARGO_Y };

/** Kolory grup podpisów usterzenia: stateczniki, stery, mechanizmy (prześwietlone), wyposażenie. */
const TAIL_GROUP_COLOR: Record<string, string> = { vtp: '#e2e8f0', htp: '#e2e8f0', dorsal: '#e2e8f0', rudder: '#fbbf24', elevator: '#fbbf24', rudderAct: '#c084fc', elevAct: '#c084fc', thsPivot: '#facc15', thsJack: '#fb923c', dis: '#94a3b8', tailLights: '#7dd3fc', aileron: '#f87171', spoiler: '#f87171' };
export const TAIL_GROUPS = [
  { name: 'stateczniki', color: '#e2e8f0' },
  { name: 'stery', color: '#fbbf24' },
  { name: 'stery na skrzydłach', color: '#f87171' },
  { name: 'siłowniki (prześwietlone)', color: '#c084fc' },
  { name: 'trym statecznika', color: '#fb923c' },
  { name: 'wyposażenie', color: '#7dd3fc' },
];
export const tailColorOf = (id: string) => TAIL_GROUP_COLOR[id];

function TailLabels() {
  const ctx = useContext(PickCtx);
  const L = (pos: V3, txt: string, id: string, occlude = true) => {
    const on = ctx ? ctx.pick.selected === id || ctx.hover === id : false;
    return (
      <Lbl
        key={txt}
        pos={pos}
        occlude={occlude}
        color={ctx?.pick.selected === id ? '#ffffff' : TAIL_GROUP_COLOR[id]}
        active={on}
        onClick={ctx ? () => ctx.pick.onSelect(ctx.pick.selected === id ? null : id) : undefined}
        onHover={ctx ? (h) => ctx.setHover(h ? id : null) : undefined}
      >
        {txt}
      </Lbl>
    );
  };
  const up = (p: V3, dy: number, dz = 0): V3 => [p[0], p[1] + dy, p[2] + dz];
  const mirZ = (p: V3): V3 => [p[0], p[1], -p[2]];
  const rd = mid(VTP, 10.0, 0.99);
  const lamp = sp(HTP, 1.9, 0.32, 1);
  return (
    <>
      {L(up(mid(VTP, 8.4, 0.3), 0, 0.7), 'statecznik pionowy', 'vtp')}
      {L(up(mid(VTP, 6.6, 0.86), 0, 0.7), 'ster kierunku', 'rudder')}
      {L(up(mid(VTP, 5.2, 0.4), 0, 1.0), 'siłowniki steru kierunku', 'rudderAct', false)}
      {L(up(mirZ(mid(HTP, 6.5, 0.3)), 0.6), 'statecznik poziomy (przestawiany)', 'htp')}
      {L(up(mid(HTP, 6.0, 0.88), 0.5), 'ster wysokości', 'elevator')}
      {L(up(mirZ(mid(HTP, 4.6, 0.4)), 0.5), 'siłowniki sterów wysokości', 'elevAct', false)}
      {L([THS_PIVOT[0] + 0.4, THS_PIVOT[1] - 0.9, 1.9], 'oś obrotu statecznika', 'thsPivot', false)}
      {L([THS_JACK[0] - 0.6, THS_JACK[1] - 2.0, 0], 'śruba trymera statecznika', 'thsJack', false)}
      {L([rd[0] + 0.9, rd[1] + 0.3, 0.4], 'wyładowniki statyczne', 'dis')}
      {L([18.5 + PA, 4.2, 0.6], 'płetwa grzbietowa', 'dorsal')}
      {L([lamp[0], lamp[1] + 0.6, lamp[2] + 0.4], 'światła logo', 'tailLights')}
      {/* stery na skrzydłach – przechylanie należy do tego samego układu sterowania */}
      {L(up(mid(WING, 25.6, 0.9), 0.55), 'lotki', 'aileron')}
      {L(up(mid(WING, 21.0, 0.7), 0.55), 'spojlery (wspomagają lotki)', 'spoiler')}
    </>
  );
}

/* ---------- podwozie ---------- */

/** Opona: przekrój o zaokrąglonych bokach obrócony wokół osi (bryła obrotowa), wspólna dla kół o tym samym rozmiarze. */
const tyreGeo = (r: number, w: number) =>
  cached(`tyre-${r}-${w}`, () => {
    const hw = w / 2;
    const ri = r * 0.6;
    const rc = Math.min(hw * 0.6, r * 0.2);
    const pts: THREE.Vector2[] = [new THREE.Vector2(ri, -hw * 0.82)];
    for (let i = 0; i <= 8; i++) {
      const t = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
      pts.push(new THREE.Vector2(r - rc + Math.cos(t) * rc, -hw + rc + Math.sin(t) * rc));
    }
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * (Math.PI / 2);
      pts.push(new THREE.Vector2(r - rc + Math.cos(t) * rc, hw - rc + Math.sin(t) * rc));
    }
    pts.push(new THREE.Vector2(ri, hw * 0.82));
    return new THREE.LatheGeometry(pts, 56);
  });
const GEAR_GREY = '#b9bfc7';
/**
 * Koło podwozia: opona z rowkami bieżnika, felga, piasta ze śrubami po stronie zewnętrznej (hub = +1 / −1 wzdłuż z)
 * i hamulec węglowy w środku felgi od strony wózka.
 */
function Wheel({ p, r, w, hub = 1, reg, brake, nose = false, idx }: { p: V3; r: number; w: number; hub?: 1 | -1; reg?: (o: THREE.Object3D | null) => void; brake?: THREE.Material; nose?: boolean; idx?: number }) {
  const ri = r * 0.6;
  return (
    <group position={p} rotation={[(hub * Math.PI) / 2, 0, 0]}>
      {/* koło toczy się wokół swojej osi (lokalnie y) – grupa obracana przez napęd podwozia */}
      <group ref={reg} userData={{ r, nose, idx }}>
        <mesh geometry={tyreGeo(r, w)}>
          <M k="tyre" side={THREE.DoubleSide} />
        </mesh>
        {/* cztery rowki bieżnika wzdłuż obwodu (opony lotnicze nie mają poprzecznego wzoru) */}
        {[-0.3, -0.1, 0.1, 0.3].map((u) => (
          <mesh key={u} position={[0, u * w, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r + 0.001, 0.009, 4, 72]} />
            <M k="#0a0c0e" />
          </mesh>
        ))}
        {/* felga: jasna, srebrna obręcz */}
        <mesh>
          <cylinderGeometry args={[ri * 1.01, ri * 1.01, w * 0.84, 40, 1, true]} />
          <M k="#c9cfd6" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, w * 0.36, 0]}>
          <cylinderGeometry args={[ri * 0.98, ri * 0.98, 0.02, 40]} />
          <M k="#2a2f35" />
        </mesh>
        {/* tarcza felgi ze szprychami: między szprychami prześwituje ciemne wnętrze z hamulcem */}
        {Array.from({ length: 12 }, (_, i) => {
          const t = (i / 12) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(t) * ri * 0.62, w * 0.375, Math.sin(t) * ri * 0.62]} rotation={[0, -t, 0]}>
              <boxGeometry args={[ri * 0.72, 0.03, ri * 0.13]} />
              <M k="#d6dbe1" />
            </mesh>
          );
        })}
        <mesh position={[0, w * 0.375, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[ri * 0.97, 0.025, 6, 40]} />
          <M k="#d6dbe1" />
        </mesh>
        {/* piasta z kołpakiem i śrubami */}
        <mesh position={[0, w * 0.4, 0]}>
          <cylinderGeometry args={[r * 0.17, r * 0.24, 0.09, 28]} />
          <M k="#e2e6ea" />
        </mesh>
        <mesh position={[0, w * 0.45, 0]}>
          <cylinderGeometry args={[r * 0.08, r * 0.12, 0.04, 20]} />
          <M k="steel" />
        </mesh>
        {Array.from({ length: 10 }, (_, i) => {
          const t = (i / 10) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(t) * r * 0.205, w * 0.43, Math.sin(t) * r * 0.205]}>
              <cylinderGeometry args={[0.016, 0.016, 0.05, 6]} />
              <M k="dark" />
            </mesh>
          );
        })}
      </group>
      {/* hamulec węglowy (pakiet tarcz) od strony wózka – nie obraca się z kołem, żarzy się po hamowaniu */}
      <mesh position={[0, -w * 0.12, 0]} material={brake}>
        <cylinderGeometry args={[ri * 0.92, ri * 0.92, w * 0.62, 28]} />
        {!brake && <M k="#2b2f35" />}
      </mesh>
      {/* obudowa tłoczków hamulca na wewnętrznej stronie koła, z króćcami przewodów */}
      <mesh position={[0, -w * 0.46, 0]}>
        <cylinderGeometry args={[ri * 0.78, ri * 0.78, 0.08, 28]} />
        <M k="#9aa2ab" />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const t = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(t) * ri * 0.62, -w * 0.5, Math.sin(t) * ri * 0.62]}>
            <cylinderGeometry args={[0.035, 0.035, 0.06, 10]} />
            <M k="#b9c0c8" />
          </mesh>
        );
      })}
    </group>
  );
}
function Strut({ a, b, r, k = 'steel' }: { a: V3; b: V3; r: number; k?: string }) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return (
    <mesh position={va.clone().add(vb).multiplyScalar(0.5)} quaternion={q}>
      <cylinderGeometry args={[r, r, va.distanceTo(vb), 16]} />
      <M k={k} />
    </mesh>
  );
}
/** Przewód hydrauliczny / elektryczny: łamana z cienkich rurek. */
function Pipe({ pts, r = 0.014, k = '#3b4048' }: { pts: V3[]; r?: number; k?: string }) {
  return (
    <>
      {pts.slice(1).map((p, i) => (
        <Strut key={i} a={pts[i]} b={p} r={r} k={k} />
      ))}
    </>
  );
}
/** Sworzeń / oś poprzeczna (wzdłuż z). */
/** Elastyczny wąż hydrauliczny: łuk przez punkty pośrednie (wygina się przy pracy amortyzatora i chowaniu). */
function Hose({ pts, r = 0.018, k = '#2a2e34' }: { pts: V3[]; r?: number; k?: string }) {
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 6, false), [pts, r]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <M k={k} />
    </mesh>
  );
}
/** Sprężyna śrubowa między punktami a i b (np. sprężyny zamka zastrzału). */
function Spring({ a, b, rad = 0.035, turns = 9, k = '#c9ced4' }: { a: V3; b: V3; rad?: number; turns?: number; k?: string }) {
  const geo = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const ax = vb.clone().sub(va);
    const len = ax.length();
    ax.normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(ax);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    const w = ax.clone().cross(u).normalize();
    const pts = Array.from({ length: turns * 12 + 1 }, (_, i) => {
      const t = i / (turns * 12);
      const ang = t * turns * Math.PI * 2;
      return va.clone().addScaledVector(ax, t * len).addScaledVector(u, Math.cos(ang) * rad).addScaledVector(w, Math.sin(ang) * rad);
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 12, 0.006, 4, false);
  }, [a, b, rad, turns]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <M k={k} />
    </mesh>
  );
}
function Pin({ p, r, len, k = 'steel' }: { p: V3; r: number; len: number; k?: string }) {
  return (
    <mesh position={p} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[r, r, len, 16]} />
      <M k={k} />
    </mesh>
  );
}

/**
 * Stan podwozia zmieniany co klatkę przez scenę (bez przerysowywania Reacta):
 * retract – chowanie 0 (wypuszczone) … 1 (schowane), z otwieraniem i zamykaniem drzwi wnęk;
 * extend – wysunięcie tłoczyska amortyzatora głównego względem postoju (m; w powietrzu ok. GEAR_STROKE);
 * lift – wysokość samolotu nad postojem (m; płyta lotniska obniża się o tyle);
 * steer – skręt koła przedniego (rad), rear – skręt tylnej osi wózków (rad);
 * heat – nagrzanie hamulców 0…1, spin – droga przetoczona przez koła (m),
 * nose – wysunięcie amortyzatora przedniego (m; bez podania – jak główny, w proporcji skoków),
 * bogie – pochylenie wózka, noseSpin – obrót kół przednich, lights – reflektory na goleni przedniej.
 */
export type GearDrive = {
  retract: number;
  extend: number;
  lift: number;
  steer: number;
  rear: number;
  heat: number;
  spin: number;
  nose?: number;
  /** Pochylenie wózka względem goleni (rad, przednia oś w dół); bez podania – z wysunięcia amortyzatora. */
  bogie?: number;
  /** Droga przetoczona przez koła przednie (m) – bez podania jak główne. */
  noseSpin?: number;
  /**
   * Droga przetoczona przez każde z 12 kół głównych osobno (m) – każde rozkręca się dopiero, gdy samo dotknie pasa.
   * Kolejność: wózek lewy, potem prawy; w każdym oś przednia, środkowa, tylna; w osi koło zewnętrzne, potem wewnętrzne
   * (indeks MAIN_WHEEL_INDEX). Bez podania – wszystkie jak `spin`.
   */
  wheelSpin?: number[];
  /** Pochylenie każdego wózka osobno (rad, lewy i prawy) – bez podania jak `bogie`. */
  bogieLR?: [number, number];
  /** Reflektory na goleni przedniej (kołowanie, start i lądowanie). */
  lights?: boolean;
};
/** Indeks koła głównego w `wheelSpin`: strona (0 – lewy wózek), oś (0 – przednia … 2 – tylna), koło (0 – zewnętrzne). */
export const MAIN_WHEEL_INDEX = (side: number, axle: number, outer: boolean) => side * 6 + axle * 2 + (outer ? 0 : 1);
export const newGearDrive = (): GearDrive => ({ retract: 0, extend: 0, lift: 0, steer: 0, rear: 0, heat: 0, spin: 0 });
/** Skok amortyzatora głównego od lotu (wysunięty) do postoju (m). */
export const GEAR_STROKE = 0.46;
const GearCtx = createContext<GearDrive | null>(null);
/** Podwozie schowane (lot): goleń we wnęce, drzwi zamknięte, amortyzator wysunięty. */
const GEAR_STOWED: GearDrive = { retract: 1, extend: 0.46, lift: 0, steer: 0, rear: 0, heat: 0, spin: 0 };
/**
 * Kąt obrotu goleni głównej przy chowaniu (do środka kadłuba). Mniej niż 90°: schowany wózek leży niżej, pod płytą
 * nad wnęką (zmierzone w przekroju kadłuba – przy 85° górny rząd kół wchodził ok. 10 cm nad podłogę kabiny, a przy
 * 75° goleń przy nasadzie skrzydła wystawała z owiewki).
 */
const MAIN_SWING = (80 * Math.PI) / 180;
const smooth01 = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};

/**
 * Dół cylindra amortyzatora głównego (y). Poniżej widać chromowane tłoczysko: na postoju ok. 1,2 m, w powietrzu
 * o skok amortyzatora więcej.
 */
const MAIN_CYL_END = -4.0;
/** Położenia podwozia: przednie (oś kadłuba) i główne (lewe; prawe – odbicie). */
export const NOSE_X = -27.3 - PF;
/** Przegub goleni (top) siedzi w skrzydle nad poszyciem – schowana goleń mieści się wtedy nad spodem skrzydła. */
export const MLG = { x: 1.3, z: 4.75, top: -1.62 };

/**
 * Podwozie A350-1000. Główne: goleń z amortyzatorem olejowo-gazowym (chromowane tłoczysko), nożyce, składany
 * zastrzał boczny z zamkiem, wózek z trzema osiami i sześcioma kołami (tylna oś skrętna), siłownik ustawiający
 * wózek do chowania, hamulce węglowe, przewody hydrauliczne, osłona na goleni i drzwi wnęki w owiewce. Przednie:
 * goleń z kołnierzem sterowania, nożyce, zastrzał, dwa koła, reflektory kołowania i startu, drzwi wnęki.
 * Części ruchome (chowanie, amortyzator, skręt, toczenie kół, żarzenie hamulców) sterowane są stanem GearDrive.
 */
function Gear() {
  const drive = useContext(GearCtx);
  const ext = useContext(ExtLtCtx);
  const nx = NOSE_X;
  const { x: mx, z: mz, top } = MLG;
  const wy = GROUND + 0.7; // środek kół głównych (opona ok. 1,4 m)
  const ny = GROUND + 0.53; // środek kół przednich (ok. 1,07 m)
  // przegub goleni przedniej – wysoko we wnęce, żeby po schowaniu do przodu koła zmieściły się nad poszyciem
  // i pod podłogą kokpitu
  const NP = -1.95;
  // drzwi wnęk: powierzchnie dopasowane do spodu owiewki i kadłuba (budowane raz)
  const doors = useMemo(
    () =>
      cached('gear-doors', () => {
        const panel = (x0: number, x1: number, z0: number, z1: number, bottom: (x: number, z: number) => number) =>
          grid(refine([x0, x1], 0.15), refine([z0, z1], 0.08), (x, z) => [x, bottom(x, z), z]);
        const xm = (BAY_MAIN.x0 + BAY_MAIN.x1) / 2;
        /**
         * Drzwi wnęki przedniej: dwie pary skrzydeł z zawiasami przy zewnętrznych krawędziach. Spód kadłuba wznosi się
         * ku nosowi, więc oś zawiasu idzie po tym spadku (a – kąt pochylenia osi), a nie poziomo.
         */
        const noseDoor = (xa: number, xb: number, sg: 1 | -1) => {
          const z = BAY_NOSE.z1 * sg;
          const p0: V3 = [xa, fusBottom(xa, z, 0.004), z];
          const p1: V3 = [xb, fusBottom(xb, z, 0.004), z];
          return {
            geo: panel(xa, xb, sg > 0 ? 0.015 : -BAY_NOSE.z1, sg > 0 ? BAY_NOSE.z1 : -0.015, (x, zz) => fusBottom(x, zz, 0.004)),
            p0,
            a: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]),
            sg,
          };
        };
        return {
          /*
           * Drzwi wnęki podwozia głównego (jak w A350 – jedne duże z każdej strony): spód owiewki od osi kadłuba do
           * wnęki kół i dalej bok owiewki aż do skrzydła, którędy przechodzi goleń i wózek. Zawias przy osi kadłuba –
           * otwarte wiszą pionowo pod brzuchem, poza drogą goleni, osłony i kół.
           */
          main: merge([
            panel(BAY_MAIN.x0, BAY_MAIN.x1, BAY_MAIN.z0, BAY_MAIN.z1, (x, z) => fairBottom(x, z, 0.004)),
            grid(refine([FAIR_SLOT.x0, FAIR_SLOT.x1], 0.15), refine([FAIR_A.a1 - 0.03, FAIR_A.a2 + 0.02], 0.03), (x, a) => fairPt(x, a, 0.004)),
          ]),
          /*
           * Osłona na goleni: w położeniu schowanym leży dokładnie na spodzie skrzydła (ten sam kształt, 1 cm niżej);
           * siatkę liczymy w tym położeniu i obracamy z powrotem o kąt chowania – w grupie goleni wraca na miejsce.
           */
          leg: (() => {
            const c = Math.cos(-MAIN_SWING);
            const sn = Math.sin(-MAIN_SWING);
            const part = (x0: number, x1: number, r0: number, r1: number) =>
              grid(refine([x0, x1], 0.12), refine([r0, r1], 0.08), (x, rr) => {
                const st = WING.st(rr);
                const q = sp(WING, rr, (x - st.x) / st.c, -1);
                const dy = q[1] - 0.01 - top;
                const dz = q[2] - mz;
                return [q[0], top + dy * c - dz * sn, mz + dy * sn + dz * c];
              });
            // prostokąt szczeliny i przewężenie przy przegubie – po schowaniu w spodzie nie widać goleni
            return merge([part(LEG_DOOR.x0, LEG_DOOR.x1, LEG_DOOR.z0, LEG_DOOR.z1), part(LEG_NECK.x0 - 0.05, LEG_NECK.x1 + 0.05, LEG_DOOR.z1 - 0.02, LEG_NECK.z1 + 0.06)]);
          })(),
          mainHingeY: fairBottom(xm, BAY_MAIN.z0, 0.004),
          // przednie (otwarte tylko w czasie ruchu) i tylne (otwarte, dopóki goleń jest wypuszczona)
          noseFront: ([1, -1] as const).map((sg) => noseDoor(BAY_NOSE.x0, BAY_NOSE.xs, sg)),
          noseAft: ([1, -1] as const).map((sg) => noseDoor(BAY_NOSE.xs, BAY_NOSE.x1, sg)),
        };
      }),
    [],
  );
  const brake = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.4, roughness: 0.6, emissive: '#ff4a00', emissiveIntensity: 0 }), []);
  useEffect(() => () => brake.dispose(), [brake]);
  const swing = useRef<(THREE.Group | null)[]>([]);
  const piston = useRef<(THREE.Group | null)[]>([]);
  const bogie = useRef<(THREE.Group | null)[]>([]);
  const rearAx = useRef<(THREE.Group | null)[]>([]);
  const bayDoor = useRef<(THREE.Group | null)[]>([]);
  const torqueUp = useRef<(THREE.Group | null)[]>([]);
  const torqueLo = useRef<(THREE.Group | null)[]>([]);
  const torqueKnee = useRef<(THREE.Group | null)[]>([]);
  /**
   * Nożyce goleni głównej: górny przegub na dole cylindra, dolny na tłoczysku; długości ramion dobrane tak, żeby
   * przy postoju kolano było ok. 0,7 m przed goleniją, a przy pełnym wysunięciu w powietrzu wciąż lekko zgięte.
   */
  const TORQUE = useMemo(() => {
    const U = new THREE.Vector3(mx - 0.24, MAIN_CYL_END + 0.12, mz);
    const P0 = new THREE.Vector3(mx - 0.18, wy + 0.25, mz);
    const K0 = new THREE.Vector3(mx - 0.95, (U.y + P0.y) / 2, mz);
    return { U, l1: U.distanceTo(K0), l2: K0.distanceTo(P0) };
  }, [mx, mz, wy]);
  const stayUp = useRef<(THREE.Group | null)[]>([]);
  const stayLo = useRef<(THREE.Group | null)[]>([]);
  const stayKnee = useRef<(THREE.Group | null)[]>([]);
  const stayLock = useRef<(THREE.Group | null)[]>([]);
  // siłownik chowania: cylinder zawieszony w skrzydle (A), tłoczysko na goleni (B) – wysuwa się, gdy goleń się chowa
  const retBody = useRef<(THREE.Group | null)[]>([]);
  const retRod = useRef<(THREE.Group | null)[]>([]);
  const RET = useMemo(() => ({ A: new THREE.Vector3(mx - 0.3, top + 0.3, mz + 0.9), B0: new THREE.Vector3(mx - 0.3, top - 1.0, mz), body: 1.1 }), [mx, mz, top]);
  // zastrzał: punkt zawieszenia w konstrukcji (stały), kolano i punkt na goleni (w położeniu wypuszczonym)
  const stay = useMemo(() => {
    // górny koniec zastrzału w konstrukcji skrzydła, w szczelinie goleni – przy wypuszczonym podwoziu zastrzał nie
    // przechodzi przez owiewkę, a po schowaniu chowa się razem z goleniją
    const A = new THREE.Vector3(mx + 0.3, -1.95, 3.6);
    const K0 = new THREE.Vector3(mx + 0.2, -3.05, 3.65);
    const B0 = new THREE.Vector3(mx, -3.6, mz - 0.18);
    return { A, B0, l1: A.distanceTo(K0), l2: K0.distanceTo(B0) };
  }, [mx, mz]);
  const noseSwing = useRef<THREE.Group>(null);
  const nosePiston = useRef<THREE.Group>(null);
  const noseSteer = useRef<THREE.Group>(null);
  const noseDoor = useRef<(THREE.Group | null)[]>([]);
  const noseAftDoor = useRef<(THREE.Group | null)[]>([]);
  const wheels = useRef<Set<THREE.Object3D>>(new Set());
  const reg = (o: THREE.Object3D | null) => {
    if (o) wheels.current.add(o);
  };
  useFrame(() => {
    const d = drive ?? newGearDrive();
    // chowanie: drzwi otwierają się (0–0,12), goleń obraca się (0,15–0,85), drzwi się zamykają (0,88–1)
    const r = d.retract;
    const sw = smooth01((r - 0.15) / 0.7);
    const door = Math.min(smooth01(r / 0.12), smooth01((1 - r) / 0.12));
    // tylne drzwi wnęki przedniej: otwarte przy wypuszczonej goleni (przechodzi przez nie), zamykają się na końcu chowania
    const aftDoor = 1 - smooth01((r - 0.86) / 0.12);
    const stroke = d.extend;
    swing.current.forEach((g) => g && (g.rotation.x = sw * MAIN_SWING));
    {
      // punkt na goleni obraca się z nią wokół przegubu; kolano – przecięcie okręgów o promieniach ramion (bliższe poprzedniemu)
      const ang = sw * MAIN_SWING;
      const dy = stay.B0.y - top;
      const dz = stay.B0.z - mz;
      const B = new THREE.Vector3(stay.B0.x, top + dy * Math.cos(ang) - dz * Math.sin(ang), mz + dy * Math.sin(ang) + dz * Math.cos(ang));
      const A = stay.A;
      const kx = mx + 0.2;
      const l1 = Math.sqrt(Math.max(1e-4, stay.l1 ** 2 - (kx - A.x) ** 2));
      const l2 = Math.sqrt(Math.max(1e-4, stay.l2 ** 2 - (kx - B.x) ** 2));
      const vy = B.y - A.y;
      const vz = B.z - A.z;
      const d = Math.max(1e-4, Math.hypot(vy, vz));
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const py = A.y + (a * vy) / d;
      const pz = A.z + (a * vz) / d;
      const c1 = new THREE.Vector3(kx, py - (h * vz) / d, pz + (h * vy) / d);
      const c2 = new THREE.Vector3(kx, py + (h * vz) / d, pz - (h * vy) / d);
      // kolano zawsze po zewnętrznej stronie linii zastrzału: po wypuszczeniu jak narysowany zamek, po schowaniu –
      // w skrzydle nad szczeliną goleni, więc złożony zastrzał nie wystaje pod skrzydło ani w szczelinę między
      // skrzydłem a owiewką
      const side = (c: THREE.Vector3) => vy * (c.z - A.z) - vz * (c.y - A.y);
      const K = side(c1) > 0 ? c1 : c2;
      const up = new THREE.Vector3(0, 1, 0);
      const place = (g: THREE.Group | null, p: THREE.Vector3, q: THREE.Vector3) => {
        if (!g) return;
        g.position.copy(p).add(q).multiplyScalar(0.5);
        g.quaternion.setFromUnitVectors(up, q.clone().sub(p).normalize());
        g.scale.set(1, p.distanceTo(q), 1);
      };
      stayUp.current.forEach((g) => place(g, A, K));
      stayLo.current.forEach((g) => place(g, K, B));
      stayKnee.current.forEach((g) => g && g.position.copy(K));
      stayLock.current.forEach((g) => g && (g.visible = sw < 0.03));
      // siłownik chowania: punkt na goleni obraca się z nią, cylinder i tłoczysko leżą na prostej A–B
      const rdy = RET.B0.y - top;
      const RB = new THREE.Vector3(RET.B0.x, top + rdy * Math.cos(ang), mz + rdy * Math.sin(ang));
      const dir = RB.clone().sub(RET.A).normalize();
      const bodyEnd = RET.A.clone().addScaledVector(dir, RET.body);
      retBody.current.forEach((g) => place(g, RET.A, bodyEnd));
      retRod.current.forEach((g) => place(g, bodyEnd.clone().addScaledVector(dir, -0.15), RB));
    }
    piston.current.forEach((g) => g && (g.position.y = -stroke));
    // wózek: w powietrzu pochylony (przednia oś niżej); przed obrotem goleni siłownik ustawia go prostopadle do niej,
    // żeby po schowaniu leżał wzdłuż kadłuba w swojej wnęce (inaczej przednie koła wchodziłyby za oś samolotu)
    const air = Math.min(1, stroke / GEAR_STROKE);
    bogie.current.forEach((g, si) => g && (g.rotation.z = d.bogieLR?.[si] ?? d.bogie ?? 0.19 * air * (1 - smooth01(sw / 0.35))));
    // nożyce: kolano liczone ze skoku amortyzatora (górne ramię na cylindrze, dolne na tłoczysku, kolano z przodu)
    {
      const P = new THREE.Vector3(mx - 0.18, wy + 0.25 - stroke, mz);
      const U = TORQUE.U;
      const dx = P.x - U.x;
      const dy = P.y - U.y;
      const dd = Math.max(1e-4, Math.hypot(dx, dy));
      const a = (TORQUE.l1 ** 2 - TORQUE.l2 ** 2 + dd * dd) / (2 * dd);
      const h = Math.sqrt(Math.max(0, TORQUE.l1 ** 2 - a * a));
      const bx = U.x + (a * dx) / dd;
      const by = U.y + (a * dy) / dd;
      // dwa możliwe kolana – bierzemy to z przodu goleni (mniejsze x)
      const k1 = new THREE.Vector3(bx - (h * dy) / dd, by + (h * dx) / dd, mz);
      const k2 = new THREE.Vector3(bx + (h * dy) / dd, by - (h * dx) / dd, mz);
      const K = k1.x < k2.x ? k1 : k2;
      const up = new THREE.Vector3(0, 1, 0);
      const place = (g: THREE.Group | null, p: THREE.Vector3, q: THREE.Vector3) => {
        if (!g) return;
        g.position.copy(p).add(q).multiplyScalar(0.5);
        g.quaternion.setFromUnitVectors(up, q.clone().sub(p).normalize());
        g.scale.set(1, p.distanceTo(q), 1);
      };
      torqueUp.current.forEach((g) => place(g, U, K));
      torqueLo.current.forEach((g) => place(g, K, P));
      torqueKnee.current.forEach((g) => g && g.position.copy(K));
    }
    rearAx.current.forEach((g, i) => g && (g.rotation.y = (i === 0 ? 1 : -1) * d.rear));
    bayDoor.current.forEach((g) => g && (g.rotation.x = door * (Math.PI / 2)));
    if (noseSwing.current) noseSwing.current.rotation.z = -sw * (Math.PI / 2);
    // amortyzator przedni: własny skok przy lądowaniu (koło przednie dotyka pasa później), inaczej jak główny
    if (nosePiston.current) nosePiston.current.position.y = -(d.nose ?? stroke * 0.6);
    if (noseSteer.current) noseSteer.current.rotation.y = d.steer;
    // skrzydła drzwi przednich otwierają się w dół na zewnątrz (lewe i prawe w przeciwne strony)
    noseDoor.current.forEach((g, i) => g && (g.rotation.x = (i % 2 === 0 ? -1 : 1) * door * 1.45));
    noseAftDoor.current.forEach((g, i) => g && (g.rotation.x = (i % 2 === 0 ? -1 : 1) * aftDoor * 1.45));
    wheels.current.forEach((w) => {
      const idx = w.userData.idx as number | undefined;
      const dist = w.userData.nose ? (d.noseSpin ?? d.spin) : idx !== undefined && d.wheelSpin ? d.wheelSpin[idx] : d.spin;
      w.rotation.y = -dist / (w.userData.r as number);
    });
    brake.emissiveIntensity = 2.2 * d.heat;
    brake.color.setRGB(0.17 + 0.25 * d.heat, 0.18, 0.2);
  });
  return (
    <group>
      {/* ---------- przednie ---------- */}
      <group ref={noseSwing} position={[nx, NP, 0]}>
        <group position={[-nx, -NP, 0]}>
          <Strut a={[nx, NP, 0]} b={[nx + 0.04, -4.6, 0]} r={0.13} k={GEAR_GREY} />
          <mesh position={[nx + 0.03, -4.1, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.2, 24]} />
            <M k={GEAR_GREY} />
          </mesh>
          <mesh position={[nx + 0.04, -4.6, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.1, 20]} />
            <M k="dark" />
          </mesh>
          {/* zastrzał: dwa ramiona z zamkiem w kolanie, do przodu ku wnęce (górny koniec w głębi wnęki) */}
          <Strut a={[nx - 0.75, -2.35, 0]} b={[nx - 0.5, -3.4, 0]} r={0.06} k={GEAR_GREY} />
          <Strut a={[nx - 0.5, -3.4, 0]} b={[nx, -4.28, 0]} r={0.065} k={GEAR_GREY} />
          <Pin p={[nx - 0.5, -3.4, 0]} r={0.07} len={0.2} />
          {/* siłowniki sterowania kołem przednim po obu stronach kołnierza */}
          {[0.21, -0.21].map((z) => (
            <group key={z}>
              <Strut a={[nx + 0.32, -4.05, z]} b={[nx + 0.02, -4.1, z * 1.05]} r={0.045} k={GEAR_GREY} />
              <Strut a={[nx + 0.02, -4.1, z * 1.05]} b={[nx - 0.14, -4.12, z * 0.9]} r={0.028} k="steel" />
            </group>
          ))}
          <Hose pts={[[nx + 0.32, -3.0, 0.16], [nx + 0.4, -3.6, 0.22], [nx + 0.33, -4.0, 0.22]]} />
          <Pipe pts={[[nx + 0.16, -2.9, 0.1], [nx + 0.16, -4.0, 0.1], [nx + 0.2, -4.1, 0.05]]} />
          {/* reflektory na goleni: kołowania (szeroka wiązka, z = +0,12) i startu (wąska, daleka, z = −0,12) */}
          {[0.12, -0.12].map((z) => (
            <group key={z}>
              <mesh position={[nx - 0.17, -3.85, z]}>
                <boxGeometry args={[0.12, 0.16, 0.16]} />
                <M k="dark" />
              </mesh>
              <Lamp
                p={[nx - 0.235, -3.85, z]}
                n={[-1, -0.08, 0]}
                color="#fff6dc"
                r={0.055}
                halo={1.6}
                isOn={() => Boolean(drive?.lights)}
                lt={z > 0 ? 'taxi' : 'to'}
                sector={SECTOR.taxi}
                bezel={false}
                beam={z > 0 ? { len: 16, half: 0.3, dir: [-1, -0.16, 0] } : { len: 28, half: 0.1, dir: [-1, -0.07, 0] }}
              />
            </group>
          ))}
          {/* reflektory zjazdu z pasa (RWY TURN OFF): wyżej na goleni, skierowane ukośnie w lewo i w prawo */}
          {[1, -1].map((sg) => (
              <group key={`to${sg}`}>
                <mesh position={[nx - 0.12, -3.62, 0.17 * sg]}>
                  <boxGeometry args={[0.12, 0.13, 0.13]} />
                  <M k="dark" />
                </mesh>
                <Lamp p={[nx - 0.17, -3.62, 0.215 * sg]} n={[-0.7, -0.08, 0.7 * sg]} color="#fff6dc" r={0.048} halo={1.4} lt="turnoff" sector={{ c: 45 * sg, h: 30, v: -5, vh: 15 }} bezel={false} beam={{ len: 22, half: 0.32, dir: [-0.7, -0.14, 0.7 * sg] }} />
              </group>
            ))}
          {ext?.night && (
            <>
              <SpotLamp p={[nx - 0.3, -3.85, 0.12]} dir={[-1, -0.16, 0]} lt="taxi" angle={0.42} dist={70} power={900} />
              <SpotLamp p={[nx - 0.3, -3.85, -0.12]} dir={[-1, -0.07, 0]} lt="to" angle={0.17} dist={160} power={2600} />
              {[1, -1].map((sg) => (
                <SpotLamp key={sg} p={[nx - 0.2, -3.62, 0.25 * sg]} dir={[-0.7, -0.15, 0.7 * sg]} lt="turnoff" angle={0.5} dist={60} power={700} />
              ))}
            </>
          )}
          {/* tłoczysko z kołami: wysuwa się w powietrzu, a koła skręcają razem z dolną częścią goleni */}
          <group ref={nosePiston}>
            <group ref={noseSteer} position={[nx + 0.06, 0, 0]}>
              <group position={[-(nx + 0.06), 0, 0]}>
                <Strut a={[nx + 0.035, -4.1, 0]} b={[nx + 0.08, ny + 0.12, 0]} r={0.09} k="chrome" />
                <Pin p={[nx + 0.08, ny, 0]} r={0.065} len={0.98} />
                <mesh position={[nx + 0.08, ny + 0.1, 0]}>
                  <boxGeometry args={[0.3, 0.22, 0.32]} />
                  <M k={GEAR_GREY} />
                </mesh>
                {/* ucho holownicze: tu zaczepia się dyszel ciągnika przy wypychaniu samolotu */}
                <mesh position={[nx - 0.12, ny + 0.02, 0]}>
                  <boxGeometry args={[0.16, 0.1, 0.2]} />
                  <M k="dark" />
                </mesh>
                <Pin p={[nx - 0.2, ny + 0.02, 0]} r={0.03} len={0.24} />
                <Strut a={[nx - 0.12, -4.5, 0]} b={[nx - 0.36, -4.92, 0]} r={0.035} k={GEAR_GREY} />
                <Strut a={[nx - 0.36, -4.92, 0]} b={[nx - 0.06, ny + 0.2, 0]} r={0.035} k={GEAR_GREY} />
                <Pin p={[nx - 0.36, -4.92, 0]} r={0.035} len={0.12} />
                {[0.34, -0.34].map((z) => (
                  <Wheel key={z} p={[nx + 0.08, ny, z]} r={0.53} w={0.33} hub={z > 0 ? 1 : -1} reg={reg} nose />
                ))}
              </group>
            </group>
          </group>
        </group>
      </group>
      {/* drzwi wnęki przedniej: wygięte jak spód kadłuba, zawiasy przy zewnętrznych krawędziach (po spadku kadłuba);
          przednie otwierają się tylko w czasie ruchu goleni, tylne zostają otwarte, gdy goleń jest wypuszczona */}
      {[
        [doors.noseFront, noseDoor] as const,
        [doors.noseAft, noseAftDoor] as const,
      ].flatMap(([list, refs]) =>
        list.map((d, i) => (
          <group key={`${d.p0[0]}${d.sg}`} position={d.p0} rotation={[0, 0, d.a]}>
            <group ref={(g) => (refs.current[i] = g)}>
              <group rotation={[0, 0, -d.a]}>
                <mesh geometry={d.geo} position={[-d.p0[0], -d.p0[1], -d.p0[2]]}>
                  <M k="paint" side={THREE.DoubleSide} />
                </mesh>
              </group>
            </group>
          </group>
        )),
      )}

      {/* ---------- główne (lewe; prawe – odbicie lustrzane) ---------- */}
      {[1, -1].map((sz, si) => (
        <group key={sz} scale={[1, 1, sz]}>
          {/* drzwi wnęki w owiewce: wygięte jak spód owiewki i równe z poszyciem, zawias wzdłuż krawędzi przy osi kadłuba;
              otwierają się w dół tylko w czasie chowania i wypuszczania podwozia */}
          <group ref={(g) => (bayDoor.current[si] = g)} position={[0, doors.mainHingeY, BAY_MAIN.z0]}>
            <mesh geometry={doors.main} position={[0, -doors.mainHingeY, -BAY_MAIN.z0]} userData={{ noCull: true }}>
              <M k="belly" side={THREE.DoubleSide} />
            </mesh>
          </group>
          {/* zastrzał boczny: górne ramię zawieszone w konstrukcji, dolne na goleni – przy chowaniu składa się w kolanie */}
          <group ref={(g) => (stayUp.current[si] = g)}>
            <mesh>
              <cylinderGeometry args={[0.075, 0.075, 1, 16]} />
              <M k={GEAR_GREY} />
            </mesh>
          </group>
          <group ref={(g) => (stayLo.current[si] = g)}>
            <mesh>
              <cylinderGeometry args={[0.085, 0.085, 1, 16]} />
              <M k={GEAR_GREY} />
            </mesh>
          </group>
          <group ref={(g) => (stayKnee.current[si] = g)}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.09, 0.09, 0.24, 16]} />
              <M k="steel" />
            </mesh>
          </group>
          {/* siłownik chowania goleni: cylinder w skrzydle, chromowane tłoczysko zaczepione u góry goleni */}
          <group ref={(g) => (retBody.current[si] = g)}>
            <mesh>
              <cylinderGeometry args={[0.1, 0.1, 1, 16]} />
              <M k={GEAR_GREY} />
            </mesh>
          </group>
          <group ref={(g) => (retRod.current[si] = g)}>
            <mesh>
              <cylinderGeometry args={[0.055, 0.055, 1, 14]} />
              <M k="chrome" />
            </mesh>
          </group>
          {/* goleń obraca się do środka kadłuba wokół osi przegubu (wzdłuż kadłuba) */}
          <group ref={(g) => (swing.current[si] = g)} position={[mx, top, mz]}>
            <group position={[-mx, -top, -mz]}>
              {/* czop przegubu wzdłuż osi obrotu goleni (wzdłuż kadłuba) – przy chowaniu obraca się w miejscu */}
              <mesh position={[mx, top - 0.02, mz]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.09, 0.09, 0.56, 16]} />
                <M k={GEAR_GREY} />
              </mesh>
              <Strut a={[mx, top, mz]} b={[mx, MAIN_CYL_END, mz]} r={0.22} k={GEAR_GREY} />
              {/* ucho siłownika chowania na goleni */}
              <mesh position={[mx - 0.3, top - 1.0, mz + 0.12]}>
                <boxGeometry args={[0.16, 0.22, 0.3]} />
                <M k={GEAR_GREY} />
              </mesh>
              {/* czujnik zbliżeniowy „koła na ziemi” (WOW) przy nożycach – mówi komputerom, że samolot stoi na ziemi */}
              <mesh position={[mx - 0.3, MAIN_CYL_END + 0.05, mz + 0.2]}>
                <boxGeometry args={[0.08, 0.12, 0.08]} />
                <M k="dark" />
              </mesh>
              <mesh position={[mx, MAIN_CYL_END - 0.03, mz]}>
                <cylinderGeometry args={[0.25, 0.25, 0.14, 28]} />
                <M k="dark" />
              </mesh>
              {/* nożyce: dwa ramiona z kolanem z przodu goleni – składają się i rozkładają razem z amortyzatorem */}
              <group ref={(g) => (torqueUp.current[si] = g)}>
                <mesh>
                  <cylinderGeometry args={[0.05, 0.05, 1, 12]} />
                  <M k={GEAR_GREY} />
                </mesh>
              </group>
              <group ref={(g) => (torqueLo.current[si] = g)}>
                <mesh>
                  <cylinderGeometry args={[0.05, 0.05, 1, 12]} />
                  <M k={GEAR_GREY} />
                </mesh>
              </group>
              <group ref={(g) => (torqueKnee.current[si] = g)}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.06, 0.06, 0.16, 12]} />
                  <M k="steel" />
                </mesh>
              </group>
              {/* zamek zastrzału (dwa ogniwa ze sprężynami) – przy chowaniu odblokowany i złożony */}
              <group ref={(g) => (stayLock.current[si] = g)}>
                <Strut a={[mx + 0.2, -3.05, 3.65]} b={[mx + 0.05, -3.2, 4.3]} r={0.03} k="dark" />
                <Strut a={[mx + 0.05, -3.2, 4.3]} b={[mx, -3.05, mz - 0.2]} r={0.03} k="dark" />
                {/* sprężyny dociskające zamek zastrzału (trzymają go w położeniu zablokowanym) */}
                <Spring a={[mx + 0.32, -2.95, 3.55]} b={[mx + 0.12, -3.3, 4.32]} />
                <Spring a={[mx + 0.08, -2.95, 3.55]} b={[mx - 0.08, -3.3, 4.32]} />
              </group>
              {/* przewody hydrauliczne wzdłuż goleni */}
              <Pipe pts={[[mx + 0.24, top, mz + 0.12], [mx + 0.24, -4.3, mz + 0.12]]} />
              <Pipe pts={[[mx - 0.24, top, mz + 0.12], [mx - 0.24, -4.3, mz + 0.12]]} />
              {/* elastyczne węże: łukiem z goleni ku tłoczysku (dopasowują się do ruchu amortyzatora) */}
              <Hose pts={[[mx + 0.24, -4.3, mz + 0.12], [mx + 0.42, -4.6, mz + 0.3], [mx + 0.3, -4.95, mz + 0.22]]} />
              <Hose pts={[[mx - 0.24, -4.3, mz + 0.12], [mx - 0.44, -4.6, mz + 0.3], [mx - 0.3, -4.95, mz + 0.22]]} />
              <Hose pts={[[mx + 0.1, -3.4, mz + 0.24], [mx + 0.3, -3.9, mz + 0.4], [mx + 0.26, -4.3, mz + 0.2]]} r={0.012} k="#11151a" />
              {/* osłona na goleni: po schowaniu zamyka szczelinę w spodzie skrzydła (z przewężeniem), równo z poszyciem i w kolorze skrzydła */}
              <mesh geometry={doors.leg}>
                <M k="wing" side={THREE.DoubleSide} />
              </mesh>
              {/* tłoczysko amortyzatora z wózkiem: wysuwa się w powietrzu, chowa przy obciążeniu */}
              <group ref={(g) => (piston.current[si] = g)}>
                {/* tłoczysko sięga w głąb cylindra dalej niż pełny skok – przy wysunięciu w powietrzu nie ma przerwy */}
                <Strut a={[mx, MAIN_CYL_END + 0.75, mz]} b={[mx, wy + 0.18, mz]} r={0.155} k="chrome" />
                <Strut a={[mx + 0.22, -4.05, mz]} b={[mx + 1.9, wy + 0.12, mz]} r={0.055} k="dark" />
                <Pin p={[mx, wy + 0.12, mz]} r={0.15} len={0.56} k={GEAR_GREY} />
                {/* widełki na końcu tłoczyska: obejmują środek belki wózka, przez nie przechodzi sworzeń przegubu */}
                <mesh position={[mx, wy + 0.32, mz]}>
                  <boxGeometry args={[0.42, 0.14, 0.52]} />
                  <M k={GEAR_GREY} />
                </mesh>
                {[1, -1].map((sg) => (
                  <mesh key={`fork${sg}`} position={[mx, wy + 0.16, mz + 0.235 * sg]}>
                    <boxGeometry args={[0.4, 0.42, 0.05]} />
                    <M k={GEAR_GREY} />
                  </mesh>
                ))}
                {[1, -1].map((sg) => (
                  <mesh key={`nut${sg}`} position={[mx, wy + 0.12, mz + 0.3 * sg]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.1, 0.1, 0.05, 6]} />
                    <M k="steel" />
                  </mesh>
                ))}
                <group ref={(g) => (bogie.current[si] = g)} position={[mx, wy + 0.12, mz]}>
                  <group position={[-mx, -(wy + 0.12), -mz]}>
                    {/* belka wózka: kuta rura, gruba w środku (przegub) i zwężająca się ku końcom */}
                    <mesh position={[mx, wy + 0.06, mz]} rotation={[0, 0, Math.PI / 2]}>
                      <cylinderGeometry args={[0.15, 0.15, 3.0, 24]} />
                      <M k={GEAR_GREY} />
                    </mesh>
                    {[1, -1].map((e) => (
                      <mesh key={e} position={[mx + e * 1.85, wy + 0.06, mz]} rotation={[0, 0, (-e * Math.PI) / 2]}>
                        <cylinderGeometry args={[0.1, 0.15, 0.7, 24]} />
                        <M k={GEAR_GREY} />
                      </mesh>
                    ))}
                    {/* środek belki z gniazdem przegubu */}
                    <mesh position={[mx, wy + 0.1, mz]}>
                      <boxGeometry args={[0.62, 0.36, 0.36]} />
                      <M k={GEAR_GREY} />
                    </mesh>
                    {/* piasty osi w belce i podkładki pod podnośnik (do zmiany koła podnosi się wózek pod osią) */}
                    {[-1.5, 0, 1.5].map((dx) => (
                      <group key={`hub${dx}`}>
                        <mesh position={[mx + dx, wy, mz]} rotation={[Math.PI / 2, 0, 0]}>
                          <cylinderGeometry args={[0.17, 0.17, 0.4, 24]} />
                          <M k={GEAR_GREY} />
                        </mesh>
                        <mesh position={[mx + dx, wy - 0.19, mz]}>
                          <sphereGeometry args={[0.07, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
                          <M k="steel" />
                        </mesh>
                        {/* rozdzielacz hamulcowy na belce: z niego wychodzą węże do obu hamulców osi */}
                        <mesh position={[mx + dx + 0.24, wy + 0.2, mz]}>
                          <boxGeometry args={[0.16, 0.08, 0.2]} />
                          <M k="#8b939c" />
                        </mesh>
                      </group>
                    ))}
                    {[-1.5, 0].map((dx) => (
                      <Pin key={dx} p={[mx + dx, wy, mz]} r={0.095} len={1.5} />
                    ))}
                    {/* ucho holownicze z przodu belki i ucho siłownika ustawiającego wózek z tyłu */}
                    <mesh position={[mx - 2.24, wy + 0.06, mz]} rotation={[Math.PI / 2, 0, 0]}>
                      <torusGeometry args={[0.07, 0.025, 8, 20]} />
                      <M k="steel" />
                    </mesh>
                    {[1, -1].map((sg) => (
                      <mesh key={`lug${sg}`} position={[mx + 1.92, wy + 0.17, mz + 0.07 * sg]}>
                        <boxGeometry args={[0.18, 0.16, 0.035]} />
                        <M k={GEAR_GREY} />
                      </mesh>
                    ))}
                    <Pin p={[mx + 1.92, wy + 0.2, mz]} r={0.03} len={0.2} />
                    {/* przewody hamulców wzdłuż belki wózka (po obu stronach – dwa niezależne układy hydrauliczne) */}
                    {[1, -1].map((sg) => (
                      <Pipe key={`bl${sg}`} pts={[[mx - 1.3, wy + 0.24, mz + 0.1 * sg], [mx - 0.32, wy + 0.24, mz + 0.1 * sg], [mx - 0.32, wy + 0.3, mz + 0.19 * sg], [mx + 0.32, wy + 0.3, mz + 0.19 * sg], [mx + 0.32, wy + 0.24, mz + 0.1 * sg], [mx + 1.72, wy + 0.24, mz + 0.1 * sg]]} />
                    ))}
                    {/* węże do hamulców przedniej i środkowej osi (tylna oś ma swoje, skręcają się razem z nią) */}
                    {[-1.5, 0].flatMap((dx) =>
                      [1, -1].map((sg) => <Hose key={`bh${dx}${sg}`} pts={[[mx + dx + 0.3, wy + 0.22, mz + 0.06 * sg], [mx + dx + 0.42, wy + 0.34, mz + 0.24 * sg], [mx + dx + 0.3, wy + 0.3, mz + 0.38 * sg]]} r={0.014} />),
                    )}
                    {/* drążki reakcyjne hamulców: przenoszą moment hamowania z obudowy hamulca na belkę wózka */}
                    {[-1.5, 0].flatMap((dx) =>
                      [1, -1].map((sg) => <Strut key={`tr${dx}${sg}`} a={[mx + dx, wy - 0.3, mz + 0.34 * sg]} b={[mx + dx + 0.62, wy - 0.06, mz + 0.14 * sg]} r={0.028} k="#7c848e" />),
                    )}
                    {/* siłownik tylnej osi skrętnej (cecha A350-1000) */}
                    <Strut a={[mx + 0.55, wy + 0.06, mz + 0.18]} b={[mx + 1.35, wy + 0.02, mz + 0.18]} r={0.05} k="dark" />
                    {[-1.5, 0].flatMap((dx) =>
                      [0.63, -0.63].map((dz) => <Wheel key={`${dx}${dz}`} p={[mx + dx, wy, mz + dz]} r={0.7} w={0.5} hub={dz > 0 ? 1 : -1} reg={reg} brake={brake} idx={MAIN_WHEEL_INDEX(si, dx < 0 ? 0 : 1, dz > 0)} />),
                    )}
                    {/* tylna oś: skręca w przeciwną stronę niż koło przednie */}
                    <group ref={(g) => (rearAx.current[si] = g)} position={[mx + 1.5, wy, mz]}>
                      <group position={[-(mx + 1.5), -wy, -mz]}>
                        <Pin p={[mx + 1.5, wy, mz]} r={0.095} len={1.5} />
                        {[1, -1].map((sg) => (
                          <Hose key={`rh${sg}`} pts={[[mx + 1.8, wy + 0.22, mz + 0.06 * sg], [mx + 1.92, wy + 0.34, mz + 0.24 * sg], [mx + 1.8, wy + 0.3, mz + 0.38 * sg]]} r={0.014} />
                        ))}
                        {[1, -1].map((sg) => (
                          <Strut key={sg} a={[mx + 1.5, wy - 0.3, mz + 0.34 * sg]} b={[mx + 0.9, wy - 0.06, mz + 0.14 * sg]} r={0.028} k="#7c848e" />
                        ))}
                        {[0.63, -0.63].map((dz) => (
                          <Wheel key={dz} p={[mx + 1.5, wy, mz + dz]} r={0.7} w={0.5} hub={dz > 0 ? 1 : -1} reg={reg} brake={brake} idx={MAIN_WHEEL_INDEX(si, 2, dz > 0)} />
                        ))}
                      </group>
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}

/** Opisy części podwozia, które można kliknąć na stronie głównej modułu. */
export const GEAR_PART_INFO: Record<string, { name: string; group: 'główne' | 'przednie' | 'koła i hamulce'; desc: string }> = {
  leg: { name: 'goleń z amortyzatorem', group: 'główne', desc: 'Główna kolumna podwozia, przymocowana przegubem do konstrukcji skrzydła i kadłuba. W środku jest amortyzator: cylinder z olejem i sprężonym azotem. Goleń dźwiga cały ciężar samolotu na postoju i przyjmuje uderzenie przy lądowaniu.' },
  piston: { name: 'tłoczysko', group: 'główne', desc: 'Błyszcząca, gładka rura, która wsuwa się w cylinder amortyzatora. Gładka powierzchnia pozwala uszczelkom szczelnie trzymać gaz i olej. W powietrzu tłoczysko jest wysunięte, a na postoju w dużej części schowane – po tym, ile go widać, mechanik ocenia, czy amortyzator jest dobrze napełniony.' },
  torque: { name: 'nożyce', group: 'główne', desc: 'Dwa ramiona połączone przegubem z przodu goleni. Łączą cylinder z tłoczyskiem tak, żeby tłoczysko mogło się wsuwać i wysuwać, ale nie obracać – inaczej koła mogłyby się skręcić względem goleni.' },
  stay: { name: 'zastrzał boczny z zamkiem', group: 'główne', desc: 'Składane ramię, które podpiera goleń z boku. Po wypuszczeniu podwozia prostuje się i blokuje zamkiem, więc goleń nie może się złożyć pod ciężarem samolotu. Przy chowaniu siłownik odblokowuje zamek, a ramię składa się „w kolanie”.' },
  bogie: { name: 'wózek', group: 'główne', desc: 'Belka z trzema osiami i sześcioma kołami – w A350-1000, cięższym od A350-900, który ma po cztery koła na goleni. Więcej kół rozkłada ciężar na większą powierzchnię, więc samolot nie niszczy nawierzchni. Wózek może się kołysać na końcu tłoczyska, żeby wszystkie koła stały na nierównym podłożu.' },
  retract: { name: 'siłownik chowania', group: 'główne', desc: 'Duży siłownik hydrauliczny między konstrukcją skrzydła a górą goleni. Przy chowaniu wysuwa tłoczysko i obraca goleń do środka kadłuba, przy wypuszczaniu ją hamuje – goleń opada głównie pod własnym ciężarem. Na postoju i w locie nie przenosi obciążeń: trzymają je zamki.' },
  pitch: { name: 'siłownik ustawiający wózek', group: 'główne', desc: 'Siłownik hydrauliczny między goleń a wózkiem. W powietrzu trzyma wózek pochylony, żeby przy lądowaniu koła dotykały pasa po kolei, a przed schowaniem ustawia go tak, by sześć kół zmieściło się we wnęce.' },
  rear: { name: 'tylna oś skrętna', group: 'główne', desc: 'Tylna oś każdego wózka może się lekko skręcać – w przeciwną stronę niż koło przednie, podobnie jak w niektórych autobusach przegubowych. W ciasnych zakrętach opony mniej się ścierają, a koła nie szorują bokiem po płycie. Steruje nią automatycznie ten sam układ, co kołem przednim.' },
  hyd: { name: 'przewody hydrauliczne', group: 'główne', desc: 'Sztywne rurki i elastyczne węże biegnące wzdłuż goleni i belki wózka. Doprowadzają płyn pod ciśnieniem do hamulców każdego koła i do siłowników. Na złączach ruchomych są węże, które wyginają się przy pracy amortyzatora i przy chowaniu.' },
  doors: { name: 'drzwi wnęk podwozia', group: 'główne', desc: 'Wnęki podwozia głównego są w owiewce centropłata pod kadłubem. Duże drzwi otwierają się tylko na czas chowania i wypuszczania, a potem zamykają – wnęka zostaje zakryta i nie zwiększa oporu. Mniejsza osłona przymocowana do goleni zamyka resztę otworu.' },
  brakes: { name: 'hamulce węglowe', group: 'koła i hamulce', desc: 'W każdym z dwunastu kół głównych jest pakiet tarcz z kompozytu węglowego: na przemian tarcze obracające się z kołem i nieruchome. Hydrauliczne tłoczki ściskają je przy hamowaniu. Węgiel jest lekki i znosi bardzo wysoką temperaturę – po hamowaniu tarcze nagrzewają się do kilkuset stopni.' },
  tyres: { name: 'opony', group: 'koła i hamulce', desc: 'Opony pompowane azotem, a nie powietrzem – azot nie podtrzymuje ognia i nie zawiera wilgoci. Ciśnienie to ok. 14–15 barów, kilka razy więcej niż w samochodzie. Bieżnik ma tylko rowki wzdłuż obwodu, które odprowadzają wodę spod opony. W feldze są bezpieczniki: gdy hamulce za mocno ją nagrzeją, wypuszczają gaz, zanim opona mogłaby pęknąć.' },
  nose: { name: 'podwozie przednie', group: 'przednie', desc: 'Przednia goleń z dwoma kołami, pod kokpitem. Ma własny amortyzator, a składane ramię przed nią blokuje ją po wypuszczeniu. Chowa się do przodu – gdyby zawiodła hydraulika, pęd powietrza pomaga ją wypuścić. Koła przednie nie mają hamulców.' },
  steer: { name: 'sterowanie kołem przednim', group: 'przednie', desc: 'Siłowniki hydrauliczne obracają dolną część przedniej goleni razem z kołami. Na ziemi pilot skręca małą kierownicą przy bocznym oknie – nawet o ok. 70° – a pedałami w czasie rozbiegu po pasie, o kilka stopni. Gdy samolot jest holowany, sterowanie się odłącza, żeby ciągnik mógł swobodnie obracać kołem.' },
  lights: { name: 'reflektory kołowania i startu', group: 'przednie', desc: 'Na goleni przedniej są reflektory, które świecą do przodu podczas kołowania i startu, oraz reflektory oświetlające zjazd z drogi startowej na boki. Są przymocowane do goleni, więc chowają się razem z nią.' },
};
const GEAR_GROUP_COLOR: Record<string, string> = { główne: '#fbbf24', przednie: '#7dd3fc', 'koła i hamulce': '#fca5a5' };
export const gearGroupColor = (id: string) => GEAR_GROUP_COLOR[GEAR_PART_INFO[id]?.group ?? ''] ?? '#e2e8f0';
export const GEAR_GROUPS = Object.entries(GEAR_GROUP_COLOR).map(([name, color]) => ({ name, color }));

/** Podpisy podwozia (strona główna modułu): każdy klikalny – wybór pokazuje opis części w ramce informacji. */
function GearLabels({ pick }: { pick?: WingPick }) {
  const { x: mx, z: mz } = MLG;
  const L = (id: string, pos: V3, txt: string) => (
    <Lbl
      key={txt}
      occlude
      pos={pos}
      color={pick?.selected === id ? '#ffffff' : gearGroupColor(id)}
      active={pick?.selected === id}
      onClick={pick ? () => pick.onSelect(pick.selected === id ? null : id) : undefined}
    >
      {txt}
    </Lbl>
  );
  return (
    <>
      {L('leg', [mx + 0.4, -3.0, mz + 0.8], 'goleń z amortyzatorem')}
      {L('piston', [mx + 0.45, -4.85, mz + 0.55], 'tłoczysko')}
      {L('torque', [mx - 0.9, -4.75, mz + 0.4], 'nożyce')}
      {L('stay', [mx + 0.2, -2.7, 3.3], 'zastrzał boczny z zamkiem')}
      {L('bogie', [mx + 2.4, -5.0, mz + 0.9], 'wózek sześciokołowy')}
      {L('rear', [mx + 2.3, -5.75, mz - 1.0], 'tylna oś skrętna')}
      {L('pitch', [mx + 1.9, -4.3, mz + 0.3], 'siłownik ustawiający wózek')}
      {L('retract', [mx - 0.3, -2.45, mz + 0.75], 'siłownik chowania')}
      {L('hyd', [mx + 0.55, -3.7, mz + 0.35], 'przewody hydrauliczne')}
      {L('doors', [mx, -4.6, 1.7], 'drzwi wnęki')}
      {L('brakes', [mx - 1.5, -5.9, mz + 1.1], 'hamulce węglowe')}
      {L('tyres', [mx + 1.5, -6.05, mz + 1.15], 'opony')}
      {L('nose', [NOSE_X - 0.3, -2.9, 0.9], 'podwozie przednie')}
      {L('steer', [NOSE_X + 0.35, -4.1, 0.45], 'sterowanie kołem przednim')}
      {L('lights', [NOSE_X - 0.6, -3.85, 0.4], 'reflektory kołowania i startu')}
    </>
  );
}

/* ---------- ziemia: miękki cień pod samolotem ---------- */

function Ground() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.45, 'rgba(0,0,0,0.28)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const drive = useContext(GearCtx);
  const gnd = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (gnd.current) gnd.current.position.y = GROUND - 0.01 - (drive?.lift ?? 0);
  });
  return (
    <mesh ref={gnd} position={[0, GROUND - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[85, 70, 1]} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

/* ================= silniki ================= */

/**
 * Skala modelu silnika (jego jednostki → metry): cały silnik powiększony równomiernie, z proporcjami gondoli
 * jak w module silnika, tak by wentylator miał 3,0 m średnicy. W modelu wentylator 1,98 m = 3,33 j.
 */
export const ENG_K = (3.0 / 1.98) * 0.595;
const ENG_FS = 1;
/**
 * Położenie osi lewego silnika w samolocie. Pylon modelu silnika sięga do skrzydła 2,0·fs + 0,4 j. nad osią,
 * a jego przód styka się ze skrzydłem 0,6 j. za początkiem układu silnika – tak samo ustawiamy silnik pod
 * prawdziwym skrzydłem (fs – skala gondoli, gdy w scenie silnika zmienia się średnicę wentylatora).
 */
const engineAt = (fs = ENG_FS): V3 => {
  const lowY = sp(WING, W_ENG, 0.35, -1)[1];
  return [wLE(W_ENG) - 0.6 * ENG_K, lowY - (2.0 * fs + 0.4) * ENG_K, W_ENG];
};
/** Punkt nad górną powierzchnią lewego skrzydła (stacja r, ułamek cięciwy s, uniesienie dy) – do numerów zakładek. */
export const wingPoint = (r: number, s: number, dy = 0): V3 => {
  const p = sp(WING, r, s, 1);
  return [p[0], p[1] + dy, p[2]];
};
export { W_TIP };
/** Punkt na powierzchni lewego skrzydła: stacja r, ułamek cięciwy s, strona (1 – góra, −1 – dół), odsunięcie dy. */
export const wingSurface = (r: number, s: number, side: 1 | -1, dy = 0): V3 => {
  const p = sp(WING, Math.max(1.2, r), s, side);
  return [p[0], p[1] + dy, p[2]];
};
/** Koniec płata (stacja W_TIP) – do granic przepływu. */
export const W_TIP_Z = W_TIP;
/** Końcówka skrzydła, z której schodzi wir: szczyt wingletu albo (bez wingletów) koniec płata przy krawędzi spływu. */
export function wingTipPos(winglet: boolean): V3 {
  const st = WING.st(winglet ? W_REND - 0.05 : W_TIP);
  return [st.x + st.c * 0.9, st.y, st.z];
}
/** Położenie osi lewego silnika (do ustawień kamery w krokach). */
export const engineOrigin = (fs = ENG_FS): V3 => engineAt(fs);

/**
 * Poziom szczegółów zależny od kamery (a nie od kroku): gdy kamera podleci bliżej niż `near` metrów do obiektu,
 * doładowuje się jego wnętrze; gdy oddali się dalej niż `far` na dłużej niż `holdMs`, wnętrze jest zwalniane.
 * Histereza i opóźnienie chronią przed migotaniem przy przelotach kamery – działa w każdym scenariuszu.
 */
export function useCameraLod(ref: React.RefObject<THREE.Object3D>, near: number, far: number, holdMs = 2500) {
  const [on, setOn] = useState(false);
  const st = useRef({ on: false, farSince: 0 });
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const o = ref.current;
    if (!o) return;
    const d = camera.position.distanceTo(o.getWorldPosition(v));
    const s = st.current;
    if (!s.on) {
      if (d < near) {
        s.on = true;
        s.farSince = 0;
        setOn(true);
      }
    } else if (d > far) {
      const now = performance.now();
      if (!s.farSince) s.farSince = now;
      else if (now - s.farSince > holdMs) {
        s.on = false;
        s.farSince = 0;
        setOn(false);
      }
    } else s.farSince = 0;
  });
  return on;
}

/** Stan silników zmieniany co klatkę przez scenę: N1 (%) i wysunięcie odwracacza ciągu 0…1. */
export type EnginePower = { n1: number; rev: number };

function Engine({ active, cutaway = false, feed = false, throttle, flow, running = false, power }: { active: boolean; cutaway?: boolean; feed?: boolean; throttle: number; flow: boolean; running?: boolean; power?: EnginePower }) {
  // stan ze sceny odczytywany co klatkę – silnik przerysowuje się tylko przy wyraźnej zmianie obrotów lub odwracacza
  const [pw, setPw] = useState<EnginePower | null>(power ? { ...power } : null);
  useFrame(() => {
    if (!power) return;
    if (!pw || Math.abs(power.n1 - pw.n1) > 0.5 || Math.abs(power.rev - pw.rev) > 0.02) setPw({ ...power });
  });
  // w locie silniki pracują (przelot: N1 ok. 85%), na ziemi stoją – chyba że silnik jest w centrum uwagi albo scena podaje stan
  const n1 = active ? 20 + 80 * throttle : power && pw ? pw.n1 : running ? 85 : 0;
  const n2 = active ? 60 + 38 * throttle : power && pw ? Math.min(98, 40 + 0.62 * pw.n1) : running ? 92 : 0;
  const ref = useRef<THREE.Group>(null);
  // wnętrze silnika tylko wtedy, gdy kamera jest blisko (silnik ma ok. 5 m długości)
  const near = useCameraLod(ref, 18, 26);
  // silnik ma własne materiały (bez przycinania w shaderze) – znika, gdy granica wycinka minie jego oś
  const clip = useContext(ClipCtx);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!clip || !ref.current) return;
    const z = ref.current.getWorldPosition(v).applyMatrix4(clip.uInv.value).z;
    ref.current.visible = z > clip.uClip.value.x && z < clip.uClip.value.y;
  });
  return (
    <group ref={ref} position={engineAt()} scale={ENG_K}>
      <EngineModel
        env={false}
        wing={false}
        clickable={[]}
        n1={n1}
        n2={n2}
        cut={active || cutaway}
        fanScale={ENG_FS}
        fanBlades={22}
        // przekrój w module kadłuba: przepływ z temperaturą – widać, skąd bierze się gorące powietrze upustu
        flow={cutaway ? 'temp' : active && flow ? 'plain' : false}
        flowSpeed={cutaway ? 0.9 : 0.25 + throttle * 1.1}
        labels={active}
        accessories={active || cutaway}
        // zasilanie paliwem ze zbiornika w skrzydle – ten sam układ co w module silnika
        feed={feed}
        detail={active || cutaway || near}
        reverser={power && pw && pw.rev > 0.01 ? { type: 'kaskadowy', deploy: pw.rev } : undefined}
      />
    </group>
  );
}

/* ================= plaster skrzydła (do zakładek aerodynamiki) ================= */

/**
 * Wycinek skrzydła używany w zakładkach o profilu i opływie: cienki (30 cm) plaster lewego skrzydła za silnikiem,
 * w miejscu, gdzie są klapa zewnętrzna, slot, spojler i owiewka prowadnicy klapy.
 */
export const SLICE = { r: 13.6, z0: 13.45, z1: 13.75 };
/** Wycinek skrzydła wokół silnika (ten sam w zbliżeniu konstrukcji, w scenach silnika i jako „większy wycinek”). */
/**
 * Stan samolotu wspólny dla wszystkich scen: w locie (podwozie schowane, silniki pracują) albo na ziemi
 * (podwozie wypuszczone, samolot stoi na płycie). Każda scena wybiera jeden z nich.
 */
export type PlanePhase = 'flight' | 'ground';

/** Przezroczysta osłona reflektorów lądowania: pasek krawędzi natarcia przy kadłubie, lekko nad poszyciem. */
function landingCover() {
  return cached('landing-cover', () =>
    grid(refine([W_SIDE + 0.03, W_SIDE + 0.44], 0.03), refine([-1, 1], 0.08), (r, t) => sp(WING, r, Math.max(0.0008, 0.03 * Math.abs(t)), t < 0 ? -1 : 1, -0.006)),
  );
}

/**
 * Sektory świecenia świateł (stopnie od nosa w stronę lewego skrzydła): pozycyjne czerwone/zielone 0–110°, tylne
 * białe ±70° od ogona, strobo w krawędzi natarcia końcówki – przód i bok (szerzej niż pozycyjne), strobo w krawędzi
 * spływu – tył i bok, strobo w stożku ogonowym – do tyłu. Razem dają widoczność dookoła samolotu. Reflektory
 * lądowania i reflektor skrzydła mają wąską wiązkę także w pionie – widać je tylko z kierunku, w który świecą.
 */
const SECTOR: Record<'nav' | 'tailNav' | 'strobeF' | 'strobeA' | 'tailStrobe' | 'landing' | 'scan' | 'taxi', LampSector> = {
  nav: { c: 55, h: 55 },
  tailNav: { c: 180, h: 70 },
  strobeF: { c: 60, h: 75 },
  strobeA: { c: 150, h: 45 },
  tailStrobe: { c: 180, h: 70 },
  // reflektory na goleni przedniej (kołowania i startu): szersza wiązka do przodu i w dół
  taxi: { c: 0, h: 25, v: -5, vh: 15 },
  // reflektory lądowania: wąska wiązka do przodu, lekko na zewnątrz i w dół (oświetla pas przed samolotem)
  landing: { c: 4, h: 13, v: -4, vh: 10 },
  // reflektor na burcie: świeci na krawędź natarcia skrzydła i gondolę (na zewnątrz, lekko do tyłu)
  scan: { c: 114, h: 22, v: 7, vh: 18 },
};

/** Położenia świateł skrzydła i burty (lewa strona; prawa – odbicie lustrzane). */
const LAMP_R = W_TIP - 0.2;
const LAMP = (() => {
  const le = mid(WING, LAMP_R, 0.004);
  const navN = dirOf(mid(WING, LAMP_R, 0.08), le, [0, 0, 0.25]);
  const te = mid(WING, LAMP_R, 0.996);
  const aftN = dirOf(mid(WING, LAMP_R, 0.9), te, [0, 0, 0.2]);
  const along = (p: V3, d: number): V3 => [p[0], p[1], p[2] - d];
  const land = [W_SIDE + 0.13, W_SIDE + 0.32].map((r) => {
    const p = mid(WING, r, 0.006);
    return { p, n: dirOf(mid(WING, r, 0.06), p, [0, -0.06, 0]) };
  });
  const xs = wLE(W_SIDE) - 2.6;
  const scanP = fusPt(xs, fusTheta(xs, W_Y0 + 1.0));
  return { navN, aftN, strobeF: along(le, 0.22), strobeA: along(te, 0.2), land, scan: { p: scanP, n: [0.45, 0.12, 1] as V3 } };
})();

/** Położenia świateł zewnętrznych (lewa strona; prawa – z = −z) – do podpisów i numerów w module świateł. */
export const EXT_LIGHT_POS = (() => {
  const logo = sp(HTP, 1.9, 0.32, 1);
  const nx = NOSE_X;
  return {
    navL: mid(WING, LAMP_R, 0.004),
    navTail: mid(WING, LAMP_R, 0.996),
    strobe: LAMP.strobeF,
    tailStrobe: [33.1 + PA, 1.62 + FUS_DY, 0] as V3,
    beaconTop: fusPt(-1.5, 0),
    beaconBottom: [-3.0, -4.4, 0] as V3,
    land: LAMP.land[0].p,
    scan: LAMP.scan.p,
    logo,
    taxi: [nx - 0.24, -3.85, 0] as V3,
    turnoff: [nx - 0.17, -3.62, 0.22] as V3,
    fin: [VTP.st(6).x + VTP.st(6).c * 0.45, 6, 0] as V3,
  };
})();

/** Logo linii na obu stronach statecznika pionowego (moduł świateł) – oświetlane przez światła logo. */
let logoTex: THREE.CanvasTexture | null = null;
function getLogoTex() {
  if (logoTex) return logoTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, 512, 512);
  // znak: koło z łukiem jak tor lotu i skrzydłem
  const g = x.createLinearGradient(0, 80, 0, 440);
  g.addColorStop(0, '#1d6fd6');
  g.addColorStop(1, '#0b3a82');
  x.fillStyle = g;
  x.beginPath();
  x.arc(256, 250, 170, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#f5f7fa';
  x.lineWidth = 26;
  x.lineCap = 'round';
  x.beginPath();
  x.arc(256, 420, 230, Math.PI * 1.22, Math.PI * 1.78);
  x.stroke();
  x.fillStyle = '#f5f7fa';
  x.beginPath();
  x.moveTo(150, 300);
  x.lineTo(380, 175);
  x.lineTo(330, 235);
  x.lineTo(360, 330);
  x.lineTo(310, 270);
  x.closePath();
  x.fill();
  x.fillStyle = '#ffb020';
  x.beginPath();
  x.arc(372, 160, 22, 0, Math.PI * 2);
  x.fill();
  logoTex = new THREE.CanvasTexture(c);
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = 4;
  return logoTex;
}
/**
 * Malowanie kadłuba (fikcyjna linia, w barwach logo na stateczniku): nazwa nad oknami w przedniej części i znaki
 * rejestracyjne z tyłu, po obu burtach. Napisy to cienkie nakładki na poszyciu, czytelne od nosa ku ogonowi.
 */
function textTex(key: string, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  return cached(`tex-${key}`, () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, w, h);
    draw(x);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}
/** Nakładka na burcie: prostokąt x0…x1 (wzdłuż kadłuba) × y0…y1 (wysokość) owinięty na poszyciu. */
function skinDecal(x0: number, x1: number, y0: number, y1: number, side: 1 | -1) {
  const xs = refine([x0, x1], 0.1);
  const ys = refine([y0, y1], 0.05);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  ys.forEach((y) =>
    xs.forEach((x) => {
      pos.push(...fusPt(x, fusTheta(x, y) * side, -0.004));
      const u = (x - x0) / (x1 - x0);
      uv.push(side > 0 ? u : 1 - u, (y - y0) / (y1 - y0));
    }),
  );
  for (let j = 0; j < ys.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      const a = j * xs.length + i;
      idx.push(a, a + 1, a + xs.length, a + 1, a + xs.length + 1, a + xs.length);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function FuselagePaint() {
  const title = textTex('title', 1024, 160, (x) => {
    x.fillStyle = '#0b3a82';
    x.font = 'bold 124px "Segoe UI", Arial, sans-serif';
    x.textBaseline = 'middle';
    x.fillText('OpenLearn', 10, 84);
    x.fillStyle = '#1d6fd6';
    x.fillRect(660, 72, 350, 10);
    x.fillStyle = '#ffb020';
    x.beginPath();
    x.arc(1000, 77, 14, 0, Math.PI * 2);
    x.fill();
  });
  const reg = textTex('reg', 512, 128, (x) => {
    x.fillStyle = '#2b3038';
    x.font = 'bold 92px "Segoe UI", Arial, sans-serif';
    x.textBaseline = 'middle';
    x.textAlign = 'center';
    x.fillText('SP-OLN', 256, 68);
  });
  const geos = useMemo(
    () =>
      cached('paint-decals', () =>
        ([1, -1] as const).flatMap((sd) => [
          { g: skinDecal(-25.6, -25.6 + 1.05 * 6.4, 0.36, 1.41, sd), t: 'title' as const },
          { g: skinDecal(18.8, 18.8 + 0.5 * 4, 0.3, 0.8, sd), t: 'reg' as const },
        ]),
      ),
    [],
  );
  return (
    <ClipCull>
      {geos.map((d, i) => (
        <mesh key={i} geometry={d.g} renderOrder={1} raycast={() => null}>
          <meshStandardMaterial map={d.t === 'title' ? title : reg} transparent alphaTest={0.05} roughness={0.45} metalness={0.05} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </ClipCull>
  );
}

function FinLogo() {
  const geos = useMemo(
    () =>
      cached('fin-logo', () =>
        ([1, -1] as const).map((side) => {
          const ys = refine([3.2, 8.6], 0.2);
          const ss = refine([0.18, 0.78], 0.03);
          const pos: number[] = [];
          const uv: number[] = [];
          const idx: number[] = [];
          ys.forEach((y, j) =>
            ss.forEach((s0, i) => {
              const p = sp(VTP, y, s0, side, -0.012);
              pos.push(...p);
              // wzór czytelny z obu stron: od nosa do ogona po lewej burcie, odwrotnie po prawej
              const u = (p[0] - (VTP.st(5.9).x + 0.5 * VTP.st(5.9).c)) / 5.4 + 0.5;
              uv.push(side > 0 ? u : 1 - u, (y - 3.2) / 5.4);
              if (i > 0 && j > 0) {
                const a = (j - 1) * ss.length + i - 1;
                const b = a + 1;
                const c2 = a + ss.length;
                const d = c2 + 1;
                if (side > 0) idx.push(a, b, d, a, d, c2);
                else idx.push(a, d, b, a, c2, d);
              }
            }),
          );
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          g.setIndex(idx);
          g.computeVertexNormals();
          return g;
        }),
      ),
    [],
  );
  return (
    <>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} renderOrder={1} raycast={() => null}>
          <meshStandardMaterial map={getLogoTex()} transparent alphaTest={0.05} roughness={0.45} metalness={0.05} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </>
  );
}

export const WING_PIECE = { z0: W_ENG - 6.7, z1: W_ENG + 6.7, amp: 0.9 };
/** Przesunięcie przekroju na stacji z względem przekroju na stacji r: środek cięciwy (skos), wznios i skala cięciwy. */
export function stationShift(z: number, r: number) {
  const a = WING.st(Math.max(W_SIDE, Math.min(W_TIP, z)));
  const b = WING.st(r);
  return { dx: a.x + a.c / 2 - (b.x + b.c / 2), dy: a.y - b.y, k: a.c / b.c };
}
/** Przekrój skrzydła na stacji r: górna i dolna powierzchnia, krawędzie, cięciwa i środek cięciwy (oś obrotu). */
export function wingSectionAt(r: number) {
  const up = Array.from({ length: 61 }, (_, i) => sp(WING, r, (1 - Math.cos((i / 60) * Math.PI)) / 2, 1));
  const lo = Array.from({ length: 61 }, (_, i) => sp(WING, r, (1 - Math.cos((i / 60) * Math.PI)) / 2, -1));
  const le = mid(WING, r, 0);
  const te = mid(WING, r, 1);
  const c = WING.st(r).c;
  const pivot: V3 = [(le[0] + te[0]) / 2, (le[1] + te[1]) / 2, r];
  return { up, lo, le, te, c, pivot };
}

/** Osie obrotu mechanizacji na stacji r (do rysowania strumieni przez szczeliny): slot i klapa. */
/**
 * Kształty części przekroju na stacji r (w płaszczyźnie x–y): stała część skrzydła, slot i klapa – do pełnych
 * przekrojów na ściankach plastra, gdy mechanizacja jest wysunięta.
 */
export function sectionPieces(r: number) {
  const xy = (p: V3): [number, number] => [p[0], p[1]];
  const c = WING.st(r).c;
  const main: [number, number][] = [];
  for (let i = 0; i <= 24; i++) main.push(xy(sp(WING, r, S_SLAT_U + ((S_FLAP_U - S_SLAT_U) * i) / 24, 1)));
  for (let i = 0; i <= 24; i++) main.push(xy(sp(WING, r, S_FLAP_L - ((S_FLAP_L - S_SLAT_L) * i) / 24, -1)));
  // zaokrąglony nosek stałej części (ten sam łuk co tył slotu)
  const lo = sp(WING, r, S_SLAT_L + 0.003, -1, 0.004);
  const hi = sp(WING, r, S_SLAT_U + 0.003, 1, 0.04);
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    main.push([lo[0] + (hi[0] - lo[0]) * t - Math.sin(Math.PI * t) * 0.02 * c + 0.012, lo[1] + (hi[1] - lo[1]) * t]);
  }
  return { main, slat: slatSection(WING, r, S_SLAT_U, S_SLAT_L).map(xy), flap: teSection(WING, r, S_FLAP_U, S_FLAP_L).map(xy) };
}

export function mechPivots(r: number) {
  return { slat: sp(WING, r, 0.22, -1, -0.5), flap: sp(WING, r, 0.79, -1, -0.35) };
}

/* ================= miniatura samolotu ================= */

/**
 * Uproszczona miniatura tego samego samolotu do małych animacji (np. widok z góry na zakręt): te same kształty
 * kadłuba, skrzydeł ze skosem i wingletami, usterzenia i silników, tylko z niewielu wielokątów. Skala 1 = rozmiar
 * prawdziwy (66,8 m), więc zwykle podaje się np. scale={0.1}.
 */
/**
 * Uproszczony samolot (ta sama sylwetka co duży model, bez szczegółów) – do scen, w których liczy się układ brył,
 * a nie detale. Opcjonalnie zmienia układ: dihedral – kąt wzniosu skrzydeł (°), wingY – przesunięcie skrzydeł w pionie
 * (dolnopłat 0, średniopłat i górnopłat wyżej), fin – wielkość statecznika pionowego (1 = oryginalny), finColor – jego kolor.
 */
export function MiniPlane({ scale = 1, color = '#e8ecf1', accent = '#9aa4b0', dihedral, wingY = 0, fin = 1, finColor }: { scale?: number; color?: string; accent?: string; dihedral?: number; wingY?: number; fin?: number; finColor?: string }) {
  const g = cached('mini-plane-2', () => {
    const fus = podLoft(refine([-33.4 - PF, -31 - PF, -27 - PF, -24.5 - PF, 6 + PA, 20 + PA, 33.4 + PA], 1.6), (x) => ({ ...fusSec(x), zc: 0 }), FUS_N, 16);
    const surf = (S: Surface, rs: number[], mirror: number) =>
      loftSections(rs, (r) => {
        const ss = [1, 0.7, 0.4, 0.15, 0.04, 0];
        const pts = [...ss.map((s) => sp(S, r, s, 1)), ...ss.slice(1, -1).reverse().map((s) => sp(S, r, s, -1))];
        return pts.map(([x, y, z]) => [x, y, z * mirror] as V3);
      });
    // połówka skrzydła od osi kadłuba (nasada schowana w kadłubie przy każdym położeniu skrzydła)
    const wingRs = [0.3, W_SIDE, W_ENG, 20, W_TIP, W_TIP + 1.2, W_TIP + 2.4, W_REND];
    const wing = surf(WING, wingRs, 1);
    const htp = merge([surf(HTP, [1.0, HTP_TIP], 1), surf(HTP, [1.0, HTP_TIP], -1)]);
    const vtp = surf(VTP, [1.0, VTP_TIP], 1);
    const e = engineAt();
    const engine = new THREE.CylinderGeometry(1.55, 1.25, 5.6, 14, 1, true);
    engine.rotateZ(Math.PI / 2);
    engine.translate(e[0] + 1.6, e[1], e[2]);
    return { fus, wing, htp, vtp, engine, finRoot: [VTP.st(1.6).x, 1.6] as const };
  });
  // dodatkowy wznios względem modelu: obrót połówki skrzydła wokół osi kadłuba na wysokości płaszczyzny cięciw
  const extra = dihedral === undefined ? 0 : dihedral * (Math.PI / 180) - W_DIH;
  const mat = (c: string, side: THREE.Side = THREE.DoubleSide) => <meshStandardMaterial color={c} roughness={0.5} metalness={0.1} side={side} />;
  return (
    <group scale={scale}>
      <mesh geometry={g.fus}>{mat(color, THREE.FrontSide)}</mesh>
      {[1, -1].map((sz) => (
        <group key={sz} scale={[1, 1, sz]}>
          <group position={[0, W_Y0 + wingY, 0]} rotation={[-extra, 0, 0]}>
            <group position={[0, -W_Y0, 0]}>
              <mesh geometry={g.wing}>{mat(color)}</mesh>
              <mesh geometry={g.engine}>
                <meshStandardMaterial color={accent} roughness={0.4} metalness={0.4} side={THREE.DoubleSide} />
              </mesh>
            </group>
          </group>
        </group>
      ))}
      <mesh geometry={g.htp}>{mat(color)}</mesh>
      {/* statecznik pionowy skalowany wokół nasady (przy fin = 0 znika) */}
      <group position={[g.finRoot[0], g.finRoot[1], 0]} scale={[Math.max(0.001, fin), Math.max(0.001, fin), 1]} visible={fin > 0.02}>
        <mesh geometry={g.vtp} position={[-g.finRoot[0], -g.finRoot[1], 0]}>
          {mat(finColor ?? color)}
        </mesh>
      </group>
    </group>
  );
}

/* ================= cały samolot ================= */

export interface AirlinerProps {
  /** Podzespół przeobrażony w tym kroku (przekrój, ruch, podpisy). */
  focus?: PlanePart | null;
  /** Podzespół wyróżniony poświatą (wycieczka po samolocie). */
  highlight?: PlanePart | null;
  throttle?: number;
  flow?: boolean;
  animate?: boolean;
  /** Widoczne warstwy (domyślnie wszystkie). */
  layers?: Partial<Record<'fuselage' | 'tail' | 'gear' | 'rightSide' | 'leftEngine' | 'ground' | 'env' | 'canoes', boolean>>;
  /** Mechanizacja skrzydeł ustawiona na stałe (klapy, sloty) – dojeżdża płynnie. */
  mech?: Mech;
  /** Samolot w locie: podwozie schowane, silniki pracują (sceny aerodynamiki); na ziemi – podwozie i silniki stoją. */
  inFlight?: boolean;
  /** Reflektory lądowania (w locie domyślnie zgaszone – włącza je np. scena podejścia do lądowania). */
  landingLights?: boolean;
  /** Stan podwozia sterowany przez scenę (chowanie, amortyzator, skręt, hamulce); z nim podwozie widać też w locie. */
  gear?: GearDrive;
  /** Klikanie podpisów podwozia (strona główna modułu): wybrana część i zmiana wyboru. */
  gearPick?: WingPick;
  /** Stan obu silników ze sceny (obroty, odwracacz ciągu) – np. dobieg po lądowaniu. */
  enginePower?: EnginePower;
  /** Wychylenia sterów z manewru (obiekt zmieniany co klatkę): lotki, ster wysokości, ster kierunku. */
  surfaces?: { aileron: number; elevator: number; rudder: number; spoiler?: number };
  /** Przycięcie do fragmentu rozpiętości z0…z1 (poszarpana granica o amplitudzie amp). */
  clip?: { z0: number; z1: number; amp?: number } | null;
  /** Moduł kadłuba: która zakładka (przekrój z wyposażeniem, konstrukcja, ciśnienie, ładownie). */
  fusView?: FusView;
  /** Strona główna modułu kadłuba: zaznaczona część (klikane podpisy). */
  fusPick?: WingPick;
  /** Lewy silnik w przekroju z przepływem (jak w module silnika) – np. upust powietrza w zakładce o klimatyzacji. */
  engineCut?: boolean;
  /** W przekroju lewego silnika także zasilanie paliwem ze zbiornika (pompy, zawór LP, przewód w pylonie). */
  engineFeed?: boolean;
  /** Moduł drzwi: otwory drzwi pasażerskich w poszyciu, kabina widoczna przez nie (drzwi rysuje scena). */
  doorsOpen?: boolean;
  /** Lewe skrzydło jako przekrój (zdjęte poszycie, keson) i jego podpisy. */
  wingOpen?: boolean;
  wingLabels?: boolean;
  /** Reakcja na najechanie i kliknięcie (wyłączona we fragmentach w scenach podzespołów). */
  interactive?: boolean;
  /** Nazwy podzespołów do kliknięcia w widoku ogólnym (domyślnie widoczne). */
  partLabels?: boolean;
  /** Stan lewego silnika, gdy jest w centrum uwagi (suwaki, wybór części, rozłożenie) – jak w scenie samego silnika. */
  engine?: EngineModelProps;
  /** Podzespół, w którego module jesteśmy – pozostałe dostają podpisy-odnośniki do swoich modułów. */
  linksFrom?: PlanePart | null;
  /** Podpisy-odnośniki do innych modułów – tylko na stronie ogólnej i na stronie głównej modułu (nie w jego zakładkach). */
  links?: boolean;
  /** Klikanie elementów skrzydła (zbliżenie konstrukcji): wybrany element i zmiana wyboru. */
  wingPick?: WingPick;
  /** Powierzchnie wyróżnione poświatą w kolorze (aileron, elevator, rudder, spoiler) – zakładki sterowania. */
  hilite?: Record<string, string> | null;
  /** Zmieniony układ (zakładka o wzniosie): kąt wzniosu skrzydeł (°), przesunięcie skrzydeł w pionie, wielkość statecznika pionowego. */
  morph?: { dihedral: number; wingY: number; fin: number } | null;
  /** Pełne, klikalne podpisy części modułu (skrzydło, usterzenie, podwozie) – tylko na stronie głównej modułu. */
  moduleLabels?: boolean;
  /** Moduł świateł: stan przełączników (każda lampa osobno, prawdziwe źródła światła, logo na stateczniku). */
  extLights?: ExtLights | null;
  /**
   * Symulacje podzespołów wbudowanych (kokpit, APU, radar) z ich modułów. Bez nich podzespoły i tak są w samolocie –
   * w stanie spoczynku i z poziomem szczegółów zależnym od odległości kamery.
   */
  systems?: SystemsDrive;
}

const sideV = new THREE.Vector3();
const ANCHOR: Record<PlanePart, V3> = {
  fuselage: [-12, 3.8, 0],
  wing: [4.2, 0.6, 18], // na górze skrzydła, w połowie cięciwy
  engine: [-10.2, -2.2, W_ENG],
  // środek ogona: między sterem kierunku a sterami wysokości (podświetla się całe usterzenie z oboma sterami)
  tail: [28.6 + PA, 3.6, 0],
  gear: [1.3, -6.6, 6.2],
  // APU: przy wylocie w końcu stożka ogonowego (nieco niżej, żeby nie nachodzić na podpis usterzenia)
  apu: [34.2 + PA, 0.4, 0],
  // zalążki modułów – podpisy przy miejscu, którego dotyczą
  cockpit: [-34.5, 1.9, 1.3], // szyby kokpitu
  radar: [-37.5, -1.0, 0.5], // owiewka radaru w nosie
  lights: [8.6, 2.2, 29.8], // światła na końcówce skrzydła
  doors: [-26.9 - PF, 0.6, 3.1], // drzwi 1L
};

export function Airliner(props: AirlinerProps) {
  /*
   * Silnik w centrum uwagi: ten sam model silnika co w jego module (podpisy, klikanie części, rozkładanie),
   * a reszta samolotu jest zawieszona na jego pylonie – przy rozłożeniu odjeżdża razem z gondolą.
   */
  if (props.focus === 'engine' && props.engine) {
    const fs = props.engine.fanScale ?? 1;
    const { engine, ...rest } = props;
    return (
      <group position={engineAt(fs)} scale={ENG_K}>
        <EngineModel
          env={false}
          accessories
          {...engine}
          mount={(f) => {
            const p = engineAt(f);
            return (
              <group position={[-p[0] / ENG_K, -p[1] / ENG_K, -p[2] / ENG_K]} scale={1 / ENG_K}>
                <AirlinerBody {...rest} focus={null} partLabels={false} linksFrom="engine" layers={{ ...rest.layers, leftEngine: false }} />
              </group>
            );
          }}
        />
      </group>
    );
  }
  return <AirlinerBody {...props} />;
}

function AirlinerBody(props: AirlinerProps) {
  // złota zasada: klikanie, odnośniki i podpisy części tylko na stronie głównej modułu (zakładka „0”) i w widoku całości
  const home = useModuleHome();
  return <AirlinerBodyInner {...props} {...(home ? {} : { interactive: false, links: false, partLabels: false, moduleLabels: false, wingLabels: false, wingPick: undefined, gearPick: undefined, fusPick: undefined })} />;
}

function AirlinerBodyInner({ focus = null, highlight = null, throttle = 0.6, flow = true, animate = true, layers = {}, clip = null, wingOpen, wingLabels, interactive = true, partLabels = true, wingPick, mech, linksFrom = null, links = true, inFlight = false, landingLights = false, surfaces, gear, gearPick, enginePower, hilite = null, morph = null, extLights = null, moduleLabels = true, fusView = 'home', fusPick, engineCut = false, engineFeed = false, doorsOpen = false, systems }: AirlinerProps) {
  // dodatkowy wznios względem modelu: połówka skrzydła (z silnikiem) obraca się wokół osi kadłuba
  const wingTilt = morph ? morph.dihedral * (Math.PI / 180) - W_DIH : 0;
  const wingLift = morph ? morph.wingY : 0;
  const nav = useTopicNav();
  const show = (k: keyof NonNullable<AirlinerProps['layers']>) => layers[k] !== false;
  const root = useRef<THREE.Group>(null);
  // uniformy przycinania tworzone raz (shadery ich używają); zmiana zakresu – płynny dojazd, bez przebudowy
  const clipU = useMemo<ClipUniforms | null>(() => (clip ? { id: ++clipSeq, uInv: { value: new THREE.Matrix4() }, uClip: { value: new THREE.Vector3(clip.z0, clip.z1, clip.amp ?? 0.8) } } : null), [Boolean(clip)]); // eslint-disable-line react-hooks/exhaustive-deps
  const clipT = useRef(clip);
  clipT.current = clip;
  const clipLast = useRef(0);
  useFrame(() => {
    if (!clipU || !root.current) return;
    clipU.uInv.value.copy(root.current.matrixWorld).invert();
    const c = clipT.current;
    if (!c) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - (clipLast.current || now)) / 1000);
    clipLast.current = now;
    const u = clipU.uClip.value;
    // zmiana na przeciwną połowę (np. z lewej na prawą) – od razu, bez przesuwania granicy przez cały samolot
    const k = Math.abs(c.z0 - u.x) > 40 && Math.abs(c.z1 - u.y) > 40 ? 1 : 1 - Math.exp(-dt * 2.2);
    u.x += (c.z0 - u.x) * k;
    u.y += (c.z1 - u.y) * k;
    u.z += ((c.amp ?? 0.8) - u.z) * k;
  });
  const [hover, setHover] = useState<PlanePart | null>(null);
  // podpisy części parzystych (skrzydło, silnik, podwozie, drzwi, światła) – po stronie samolotu zwróconej do kamery
  const sideRef = useRef<THREE.Group>(null);
  const [side, setSide] = useState(1);
  useFrame(({ camera }) => {
    if (!sideRef.current) return;
    sideV.copy(camera.position);
    sideRef.current.worldToLocal(sideV);
    // mała strefa nieczułości, żeby podpisy nie skakały przy widoku dokładnie z przodu albo z tyłu
    if (side > 0 && sideV.z < -1.5) setSide(-1);
    else if (side < 0 && sideV.z > 1.5) setSide(1);
  });
  const anchorAt = (p: PlanePart): V3 => [ANCHOR[p][0], ANCHOR[p][1], ANCHOR[p][2] * side];
  const [tip, setTip] = useState<PlanePart | null>(null);
  const [pickHover, setPickHover] = useState<string | null>(null);
  // kliknięcia tylko w widocznej (nieprzyciętej) części skrzydła – niewidoczne fragmenty nie łapią myszy
  const pickState = useMemo<PickState | null>(() => {
    if (!wingPick) return null;
    const inv = new THREE.Matrix4();
    const v = new THREE.Vector3();
    return {
      pick: wingPick,
      hover: pickHover,
      setHover: setPickHover,
      accept: (p) => {
        if (!clip || !root.current) return true;
        inv.copy(root.current.matrixWorld).invert();
        const z = Math.abs(v.copy(p).applyMatrix4(inv).z);
        return z > clip.z0 + 0.5 && z < clip.z1 - 0.5;
      },
    };
  }, [wingPick, pickHover, clip]);
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => setTip(null), 2600);
    return () => window.clearTimeout(t);
  }, [tip]);
  const ev = (part: PlanePart) =>
    interactive ? {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta > 6 || part === focus) return;
      const mod = PART_MODULE[part];
      if (mod && nav) nav.openModule(mod);
      else setTip(part);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (part === focus) return;
      setHover(part);
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      setHover((h) => (h === part ? null : h));
      document.body.style.cursor = '';
    },
  } : {};
  const glow = (p: PlanePart) => (p === focus ? 0 : hover === p ? 0.22 : highlight === p ? 0.16 : 0);
  // zwykła funkcja (nie komponent) – inaczej każde najechanie myszą przebudowywałoby całą geometrię
  const part = (p: PlanePart, children: ReactNode) => (
    <GlowCtx.Provider value={glow(p)}>
      <group {...ev(p)}>{children}</group>
    </GlowCtx.Provider>
  );
  /*
   * Te same lampy i ten sam stan świateł w każdym module. Gdy scena nie podaje przełączników (moduł świateł), samolot
   * ustawia je jak załoga w danej fazie: pozycyjne zawsze; beacon, gdy silniki pracują; strobo w powietrzu i na pasie
   * przy lądowaniu; reflektory lądowania przy podejściu i dobiegu; na goleni przedniej – przy kołowaniu i lądowaniu;
   * logo na ziemi i przy lądowaniu.
   */
  const auto = useMemo(() => newExtLights(false), []);
  const autoIn = useRef({ inFlight, landingLights, gear, enginePower });
  autoIn.current = { inFlight, landingLights, gear, enginePower };
  useFrame(() => {
    if (extLights) return;
    const a = autoIn.current;
    const nose = Boolean(a.gear?.lights) && (a.gear?.retract ?? 0) < 0.5;
    const engines = a.inFlight || (a.enginePower ? a.enginePower.n1 > 12 : false) || nose;
    Object.assign(auto, {
      nav: true,
      logo: !a.inFlight || a.landingLights,
      beacon: engines,
      strobe: a.inFlight || a.landingLights,
      land: a.landingLights,
      taxi: nose,
      to: nose && a.landingLights,
      turnoff: nose && !a.landingLights,
      wing: false,
    });
  });
  const ext = extLights ?? auto;
  return (
    <ExtLtCtx.Provider value={ext}>
    <GearCtx.Provider value={gear ?? null}>
    <ClipCtx.Provider value={clipU}>
    <PickCtx.Provider value={pickState}>
    <HiliteCtx.Provider value={hilite}>
    <group ref={root}>
      {show('env') && <Environment resolution={256} frames={1}>
        <Lightformer intensity={2.2} position={[0, 30, -20]} scale={[90, 30, 1]} color="#ffffff" />
        <Lightformer intensity={1.1} position={[-50, 10, 30]} rotation-y={Math.PI / 3} scale={[60, 20, 1]} color="#dbeafe" />
        <Lightformer intensity={0.8} position={[50, -4, 25]} rotation-y={-Math.PI / 3} scale={[50, 30, 1]} color="#ffedd5" />
        <Lightformer intensity={0.45} position={[0, -30, 0]} rotation-x={Math.PI / 2} scale={[120, 120, 1]} color="#64748b" />
      </Environment>}
      {show('ground') && <Ground />}
      {show('fuselage') && part('fuselage', <Fuselage open={focus === 'fuselage'} apu={focus === 'apu'} radar={focus === 'radar'} view={fusView} labels={moduleLabels} pick={fusPick} doorsOpen={doorsOpen} />)}
      {/* wnętrze nosa i ogona: kokpit, radar, APU – te same modele co w ich modułach, z poziomami szczegółów */}
      {show('fuselage') && (
        <Suspense fallback={null}>
          <PlaneSystems focus={focus} fusView={focus === 'fuselage' ? fusView : null} inFlight={inFlight} drive={systems} />
        </Suspense>
      )}
      {show('tail') && part('tail', <Tail animate={focus === 'tail' && animate} surfaces={surfaces} open={focus === 'tail'} fin={morph ? morph.fin : 1} />)}
      {/* światła logo: w górnej powierzchni statecznika poziomego przy kadłubie, świecą na statecznik pionowy */}
      {show('tail') &&
        [1, -1].map((sg) => {
          const p = sp(HTP, 1.9, 0.32, 1);
          return <Lamp key={sg} p={[p[0], p[1], p[2] * sg]} n={[0.15, 1, -0.75 * sg]} color="#fff6dc" r={0.07} halo={1.4} on={inFlight} lt="logo" />;
        })}
      {show('tail') && <FinLogo />}
      {show('tail') &&
        ext.night &&
        [1, -1].map((sg) => {
          const p = sp(HTP, 1.9, 0.32, 1);
          return <SpotLamp key={sg} p={[p[0], p[1] + 0.15, p[2] * sg]} dir={[0.12, 1, -0.5 * sg]} lt="logo" angle={0.42} dist={16} power={260} />;
        })}
      {/* podwozie zawsze: w locie (bez sterowania ze sceny) schowane we wnękach, z zamkniętymi drzwiami */}
      {/* na wycinkach skrzydła (plaster profilu, kawałek wokół silnika) podwozie nic nie wnosi – a tarcze hamulców mają
          własny materiał, który nie podlega przycinaniu, więc schowane koła prześwitywałyby przez plaster. Szeroki
          „wycinek” całego samolotu (z = ±60 m) obejmuje podwozie, więc wtedy jest rysowane – tak samo przekrój kadłuba */}
      {show('gear') && !(clip && (clip.z0 > -6 || clip.z1 < 6) && focus !== 'fuselage') && part('gear', <GearCtx.Provider value={gear ?? (inFlight ? GEAR_STOWED : null)}>{focus === 'fuselage' ? <ClipCull><Gear /></ClipCull> : <Gear />}</GearCtx.Provider>)}
      {[1, -1].filter((sz) => sz > 0 || show('rightSide')).map((sz) => (
        <group key={sz} scale={[1, 1, sz]}>
          <group position={[0, W_Y0 + wingLift, 0]} rotation={[-wingTilt, 0, 0]}>
          <group position={[0, -W_Y0, 0]}>
          {part('wing', <Wing open={(focus === 'wing' || Boolean(wingOpen)) && sz > 0} animate={focus === 'wing' && animate} ctlAnim={focus === 'tail' && animate} mech={mech} canoes={show('canoes')} side={sz} surfaces={surfaces} outside={focus === 'fuselage'} />)}
          {(sz < 0 || show('leftEngine')) && part('engine', <Engine active={focus === 'engine' && sz > 0} cutaway={engineCut && sz > 0} feed={engineFeed && sz > 0} throttle={throttle} flow={flow} running={inFlight} power={enginePower} />)}
          {/*
            Światła jak w A350, wbudowane w poszycie pod przezroczystymi osłonami:
            – w krawędzi natarcia końcówki, tuż przed wingletem: pozycyjne (czerwone po lewej, zielone po prawej) i strobo,
            – na krawędzi spływu końcówki: białe pozycyjne (tylne) i drugie strobo,
            – w krawędzi natarcia przy nasadzie skrzydła: dwa reflektory lądowania (świecą w locie),
            – na burcie przed skrzydłem: reflektor oświetlający krawędź natarcia i gondolę (kontrola oblodzenia).
          */}
          <Lamp p={mid(WING, LAMP_R, 0.004)} n={LAMP.navN} color={sz > 0 ? '#ff3b2f' : '#22e06b'} r={0.075} rx={1.9} halo={1.9} sector={SECTOR.nav} lt="nav" />
          <Lamp p={LAMP.strobeF} n={LAMP.navN} color="#ffffff" r={0.05} halo={4.2} blink="strobe" sector={SECTOR.strobeF} lt="strobe" />
          <Lamp p={mid(WING, LAMP_R, 0.996)} n={LAMP.aftN} color="#ffffff" r={0.06} rx={1.5} halo={1.7} sector={SECTOR.tailNav} lt="nav" />
          <Lamp p={LAMP.strobeA} n={LAMP.aftN} color="#ffffff" r={0.045} halo={4} blink="strobe" sector={SECTOR.strobeA} lt="strobe" />
          {ext.night && (
            <>
              {/* światło pozycyjne lekko barwi końcówkę skrzydła, a błysk strobo oświetla całą końcówkę i winglet */}
              <SpotLamp p={mid(WING, LAMP_R, 0.004)} dir={[-0.6, 0, 0.8]} lt="nav" angle={1.2} dist={7} power={6} color={sz > 0 ? '#ff3b2f' : '#22e06b'} penumbra={1} />
              <FlashLight p={[LAMP.strobeF[0] - 0.6, LAMP.strobeF[1] + 0.4, LAMP.strobeF[2] + 0.3]} lt="strobe" blink="strobe" color="#eef4ff" power={160} dist={26} />
            </>
          )}
          {/* reflektory lądowania: dwa reflektory w krawędzi natarcia przy kadłubie, pod przezroczystą osłoną w kształcie krawędzi */}
          <mesh geometry={landingCover()} renderOrder={2}>
            <M k="glass" side={THREE.DoubleSide} opacity={0.55} />
          </mesh>
          {LAMP.land.map((l, i) => (
            <Lamp key={i} p={l.p} n={l.n} color="#fff6dc" r={0.07} halo={3.2} on={landingLights} lt="land" sector={SECTOR.landing} bezel={false} beam={{ len: 45, half: 0.06, dir: [-1, -0.05, 0.07] }} />
          ))}
          <Lamp p={LAMP.scan.p} n={LAMP.scan.n} color="#fff6dc" r={0.07} halo={1.6} on={inFlight} lt="wing" sector={SECTOR.scan} beam={{ len: 16, half: 0.22, dir: [0.64, -0.09, 0.76] }} />
          {ext.night && (
            <>
              <SpotLamp p={LAMP.land[0].p} dir={[-1, -0.07, 0.07]} lt="land" angle={0.15} dist={600} power={9000} />
              {/* reflektor skrzydła celuje w krawędź natarcia i wlot silnika (w modelu: między nimi) */}
              <SpotLamp p={[LAMP.scan.p[0], LAMP.scan.p[1], LAMP.scan.p[2] + 0.3]} dir={[0.64, -0.09, 0.76]} lt="wing" angle={0.42} dist={50} power={150} />
            </>
          )}
          </group>
          </group>
        </group>
      ))}
      {((focus === 'wing' && moduleLabels) || wingLabels) && <WingLabels range={clip} />}
      {focus === 'tail' && moduleLabels && <TailLabels />}
      {focus === 'gear' && moduleLabels && show('gear') && !inFlight && !gear && <GearLabels pick={gearPick} />}
      {/* widok ogólny: tylko nazwy podzespołów (klikalne); szczegółowe podpisy dopiero w module podzespołu */}
      <group ref={sideRef}>
      {interactive && partLabels && !focus &&
        (Object.keys(ANCHOR) as PlanePart[]).map((p) => (
          <Lbl
            key={p}
            occlude
            pos={anchorAt(p)}
            color={p === tip ? '#fbbf24' : '#e2e8f0'}
            active={hover === p || highlight === p}
            onHover={(on) => setHover(on ? p : (h) => (h === p ? null : h))}
            onClick={() => {
              const mod = PART_MODULE[p];
              if (mod && nav) nav.openModule(mod);
              else setTip(p);
            }}
          >
            {p === tip ? `${PART_NAME[p]} – moduł w przygotowaniu` : PART_NAME[p]}
          </Lbl>
        ))}
      {/* w module jednego podzespołu pozostałe mają podpisy-odnośniki (inną czcionką), żeby było widać, że można w nie kliknąć */}
      {interactive && links && (focus ?? linksFrom) &&
        (Object.keys(ANCHOR) as PlanePart[])
          .filter((p) => p !== (focus ?? linksFrom))
          .map((p) => (
            <Lbl
              key={`link-${p}`}
              occlude
              pos={anchorAt(p)}
              link
              color={p === tip ? '#fbbf24' : '#e2e8f0'}
              active={hover === p}
              onHover={(on) => setHover(on ? p : (h) => (h === p ? null : h))}
              onClick={() => {
                const mod = PART_MODULE[p];
                if (mod && nav) nav.openModule(mod);
                else setTip(p);
              }}
            >
              {p === tip ? `${PART_NAME[p]} – moduł w przygotowaniu` : PART_NAME[p]}
            </Lbl>
          ))}
      </group>
    </group>
    </HiliteCtx.Provider>
    </PickCtx.Provider>
    </ClipCtx.Provider>
    </GearCtx.Provider>
    </ExtLtCtx.Provider>
  );
}

/**
 * Ten sam samolot zawieszony na pylonie modelu silnika (w jego jednostkach): w scenach silnika widać tylko
 * przycięty kawałek lewego skrzydła nad silnikiem – reszta warstw jest ukryta.
 */
export function PlaneMount({ fs, wingOpen = false, wingLabels = false, wingPick, phase = 'flight', whole = false }: { fs: number; wingOpen?: boolean; wingLabels?: boolean; wingPick?: WingPick; phase?: PlanePhase; whole?: boolean }) {
  const p = engineAt(fs);
  const ground = phase === 'ground';
  // cały samolot: na ziemi zawsze; w locie na życzenie sceny (np. awarie w locie) – wtedy bez podwozia i płyty
  const all = ground || whole;
  return (
    <group position={[-p[0] / ENG_K, -p[1] / ENG_K, -p[2] / ENG_K]} scale={1 / ENG_K}>
      <Airliner
        interactive={false}
        animate={false}
        wingOpen={wingOpen}
        wingLabels={wingLabels}
        wingPick={wingPick}
        inFlight={!ground}
        // na ziemi widać cały samolot stojący na podwoziu (rozruch, awarie); w locie – tylko kawałek skrzydła nad silnikiem
        layers={all ? { leftEngine: false, env: false, ground } : { fuselage: false, tail: false, gear: false, rightSide: false, leftEngine: false, ground: false, env: false }}
        clip={all ? null : WING_PIECE}
      />
    </group>
  );
}

/** Model silnika w scenach podzespołu: ten sam silnik co w samolocie, z pylonem i kawałkiem tego samego skrzydła. */
export function EngineOnPlane({ wingOpen, wingLabels, wingPick, phase, whole, ...props }: EngineModelProps & { wingOpen?: boolean; wingLabels?: boolean; wingPick?: WingPick; phase?: PlanePhase; whole?: boolean }) {
  const plain = Boolean(props.afterburner) || props.spools === 'jet1' || (props.fanScale ?? 1) <= 0.05 || props.wing === false;
  if (plain) return <EngineModel {...props} />;
  return <EngineModel {...props} mount={(fs) => <PlaneMount fs={fs} wingOpen={wingOpen} wingLabels={wingLabels} wingPick={wingPick} phase={phase} whole={whole} />} />;
}

/* ---------- klimatyzacja i ciśnienie w kabinie: układ (tory powietrza, położenie urządzeń) ---------- */

/** Strefy kabiny z własnym pionem nawiewu i zaworem powietrza dogrzewającego (trim air): x pionu. */
export const AIR_ZONES = [
  { id: 'fwd', name: 'przód (biznes)', x: -22.0 },
  { id: 'mid', name: 'środek', x: -3.0 },
  { id: 'aft', name: 'tył', x: 12.0 },
];
/**
 * Układ wody, ścieków i gaszenia ładowni (zakładki „Woda i toalety” oraz „Pożar w ładowni”) – w tych samych miejscach
 * co zbiorniki, rury, toalety i kuchnie modelu kabiny. Toalety i umywalki – lewa burta (widać je w przekroju).
 */
export function cabinSystemsLayout() {
  const bottom = (x: number, z = 0): V3 => [x, fusBottom(x, z, 0.02), z];
  const half = (y: number, x: number) => fusPt(x, fusTheta(x, y), 0)[2] - 0.2;
  const hw = (y: number, x: number) => Math.max(0, half(y, x) + 0.2);
  const WX = -25.3;
  const SX = 15.5;
  const WEND = 19.5;
  const yMain = FLOOR - 0.5;
  // toalety (lewa burta) przed drzwiami 2, 3 i 4: muszla i umywalka
  const lavs = DOORS.slice(1).map((dx) => {
    const lx = dx - 1.25;
    const zc = Math.min(1.7, Math.min(hw(FLOOR + 0.02, lx + 0.5), hw(FLOOR + 2.1, lx + 0.5)) - 0.65);
    return { dx, lx, zc, bowl: [lx + 0.22, FLOOR + 0.45, zc] as V3, sink: [lx - 0.33, FLOOR + 0.86, zc] as V3 };
  });
  const galleys = DOORS.filter((dx) => dx + 1.2 < WEND).map((dx) => [dx + 1.2, FLOOR + 0.95, 0.95] as V3);
  // --- woda pitna ---
  const fillPanel = bottom(WX + 1.3, -0.35);
  const fill: V3[] = [fillPanel, [WX + 1.3, -2.55, -0.35], [WX + 0.6, -2.4, -0.55], [WX + 0.2, -2.25, -0.55]];
  const compressor: V3 = [WX + 1.4, -1.85, -0.75];
  const air: V3[] = [compressor, [WX + 0.8, -1.72, -0.75], [WX, -1.72, -0.55], [WX, -1.82, -0.55]];
  const air2: V3[] = [[WX, -1.72, -0.55], [WX, -1.72, 0.55], [WX, -1.82, 0.55]];
  const trunk: V3[] = [[WX, -1.82, 0.55], [WX, yMain, 0.55], [WX, yMain, 0.95], [DOORS[0] + 0.6, yMain, 0.95], [WEND, yMain, 0.95]];
  const branches: V3[][] = [
    ...galleys.map((g) => [[g[0], yMain, 0.95], [g[0], FLOOR - 0.05, 0.95], g] as V3[]),
    ...lavs.map((l) => [[l.dx - 1.0, yMain, 0.95], [l.dx - 1.0, FLOOR - 0.05, 0.95], [l.sink[0] + 0.05, FLOOR + 0.3, l.zc - 0.2], l.sink] as V3[]),
  ];
  const heaters = lavs.map((l) => [l.sink[0], FLOOR + 0.45, l.zc] as V3);
  // --- szara woda: z umywalek i zlewów kuchni do podgrzewanych masztów odpływowych (przedni i tylny) ---
  const mastF = bottom(-19.5 - PF, 0);
  const mastA = bottom(12.6 + PA, 0);
  const grey: V3[][] = lavs.map((l) => {
    const m = l.dx < 0 ? mastF : mastA;
    return [l.sink, [l.sink[0] + 0.05, FLOOR + 0.2, l.zc - 0.1], [l.sink[0], FLOOR - 0.75, 0.25], [m[0], FLOOR - 0.75, 0.25], [m[0], m[1] + 0.25, 0.05], m];
  });
  const greyOut: V3[][] = [mastF, mastA].map((m) => [m, [m[0] + 0.4, m[1] - 0.25, 0], [m[0] + 1.6, m[1] - 0.9, 0]]);
  // --- ścieki: przewód podciśnieniowy od muszli do zbiorników ---
  const yVac = FLOOR - 0.6;
  const vacuum: V3[][] = lavs.map((l) => [l.bowl, [l.lx + 0.22, FLOOR - 0.05, l.zc], [l.dx - 1.03, FLOOR - 0.3, 1.3], [l.dx - 1.03, yVac, 1.3], [SX, yVac, 1.3], [SX, -1.4, 0.9], [SX, -1.45, 0.45]]);
  const vacGen: V3 = [SX + 1.0, -1.55, 0.95];
  // powietrze odessane ze zbiorników przez generator podciśnienia – wylot w spodzie kadłuba
  const vent: V3[] = [[SX + 0.3, -1.4, 0.45], [SX + 0.8, -1.42, 0.85], vacGen, [SX + 1.3, -1.9, 0.6], bottom(SX + 1.5, 0.35), [SX + 2.0, bottom(SX + 1.5)[1] - 0.6, 0.35]];
  const wastePanel = bottom(SX + 0.9, -0.35);
  const drain: V3[] = [[SX, -2.15, -0.45], [SX + 0.5, -2.35, -0.4], wastePanel, [wastePanel[0], wastePanel[1] - 0.8, -0.35]];
  // --- gaszenie ładowni: butle za przednią ładownią, rury pod sufitem ładowni, dysze ---
  const ceil = FLOOR - 0.47;
  const bottles: V3[] = [
    [-9.6, -2.15, 1.25],
    [-9.6, -2.15, 0.8],
  ];
  const nozzlesF = [-23.5, -20.5, -17.5, -14.5, -11.5].map((x) => [x, ceil - 0.05, 0.35] as V3);
  const nozzlesA = [5.5, 8, 10.5].map((x) => [x, ceil - 0.05, 0.35] as V3);
  const agentF: V3[] = [[bottles[0][0], -1.9, 1.05], [-9.8, ceil, 1.05], [-10.2, ceil, 0.35], [-24, ceil, 0.35]];
  const agentA: V3[] = [[-9.8, ceil, 1.05], [-1, ceil, 1.05], [4.6, ceil, 0.35], [11.5, ceil, 0.35]];
  const detectorsF = [-22, -17, -12.5].map((x) => [x, ceil + 0.02, -0.4] as V3);
  // wentylacja ładowni: wlot (z kabiny przez zawór odcinający) i wyciąg (wentylator, zawór odcinający)
  const ventIn: V3[] = [[-22.8, FLOOR - 0.15, 1.2], [-22.8, ceil, 1.2], [-22.8, ceil - 0.35, 1.0]];
  const ventOut: V3[] = [[-11.2, ceil - 0.35, 1.0], [-11.2, ceil, 1.2], [-11.2, FLOOR - 0.15, 1.2], [-9.9, FLOOR - 0.15, 1.2]];
  const isoValves: V3[] = [
    [-22.8, ceil + 0.2, 1.2],
    [-11.2, ceil + 0.2, 1.2],
  ];
  const hold = { x0: HOLDS[0][0], x1: HOLDS[0][1], y0: CARGO_Y, y1: ceil, z: 1.55 };
  return { WX, SX, lavs, galleys, fill, fillPanel, compressor, air: [air, air2], trunk, branches, heaters, grey, greyOut, mastF, mastA, vacuum, vacGen, vent, drain, wastePanel, bottles, agentF, agentA, nozzlesF, nozzlesA, detectorsF, ventIn, ventOut, isoValves, hold };
}

/**
 * Układ klimatyzacji w lewej połowie samolotu (przekrój kadłuba): tory strug powietrza (od silnika do zaworu
 * wylotowego) i położenie urządzeń. Tory to łamane w układzie samolotu; rury rysuje się po nich jako rurki.
 */
export function cabinAirLayout() {
  const E = engineAt();
  const mid = (r: number, s: number): V3 => {
    const a = sp(WING, r, s, 1);
    const b = sp(WING, r, s, -1);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  };
  const hw = (y: number, x: number) => fusPt(x, fusTheta(x, y))[2];
  // urządzenia
  const pylonTop: V3 = [E[0] + 2.0, sp(WING, W_ENG, 0.3, -1)[1] - 0.12, W_ENG];
  const PACK: V3 = [-5.0, -3.62, 1.2];
  const MIXER: V3 = [-8.75, -2.0, 0];
  const FILTERS: V3[] = [[-9.85, -2.0, 0.95], [-9.85, -2.0, -0.95]];
  const FANS: V3[] = [[-9.35, -2.0, 0.95], [-9.35, -2.0, -0.95]];
  const OUTFLOW: V3 = [18.3, fusBottom(18.3, 0) + 0.2, -0.15];
  // upust z silnika: sprężarka WP → chłodnica w pylonie → krawędź natarcia skrzydła → owiewka → pakiet
  const bleed: V3[] = [
    [E[0] + 2.3, E[1] + 0.35, E[2]],
    [E[0] + 2.2, E[1] + 1.0, E[2]],
    pylonTop,
    ...[W_ENG - 0.4, 8.5, 6.5, 4.6, 3.3].map((r) => mid(r, 0.09)),
    [-5.9, -2.55, 2.55],
    [-6.3, -3.25, 1.6],
    [-6.35, -3.45, 1.25],
  ];
  // powietrze dogrzewające (trim air): gorące, z rury upustowej przed pakietem, osobno do każdej strefy
  const trimMain: V3[] = [[-5.9, -2.55, 2.55], [-7.2, -2.0, 2.2], [-8.6, -1.5, 2.0]];
  const trim: V3[][] = AIR_ZONES.map((zn) => [...trimMain, [zn.x, -1.5, 2.05], [zn.x, -1.45, hw(-1.45, zn.x) - 0.32]]);
  // powietrze z zewnątrz przez wlot NACA w owiewce: chłodzi wymienniki pakietu i wylatuje za skrzydłem
  const ram: V3[] = [[-6.8, -4.3, 1.2], [-6.0, -3.98, 1.2], [-4.0, -3.98, 1.2], [-2.6, -4.28, 1.35], [-1.4, -4.7, 1.45]];
  // zimne powietrze z pakietu → mieszalnik (pod kesonem centropłata, do przodu)
  const packOut: V3[] = [[-6.3, -3.5, 1.0], [-7.4, -3.1, 0.7], [-8.3, -2.75, 0.4], [-8.6, -2.3, 0.15], MIXER];
  // recyrkulacja: powietrze spod podłogi przez filtry HEPA i wentylatory do mieszalnika (z obu stron)
  const recirc: V3[][] = [1, -1].map((sg) => [
    [-14.0, -1.75, 1.7 * sg],
    [-11.2, -1.85, 1.25 * sg],
    [FILTERS[0][0], -2.0, 0.95 * sg],
    [FANS[0][0], -2.0, 0.95 * sg],
    [-9.0, -2.0, 0.4 * sg],
    MIXER,
  ]);
  // nawiew: z mieszalnika pod podłogą do pionu w burcie każdej strefy, w górę do głównego kanału nad sufitem
  const supply: V3[][] = AIR_ZONES.map((zn) => {
    const x = zn.x;
    return [
      [MIXER[0], -1.68, 0.2],
      [MIXER[0] + Math.sign(x - MIXER[0]) * 0.8, -1.5, 0.8],
      [x, -1.5, 1.3],
      [x, -1.5, hw(-1.5, x) - 0.35],
      [x, -0.8, hw(-0.8, x) - 0.1],
      [x, 0.5, hw(0.5, x) - 0.1],
      [x, 1.6, hw(1.6, x) - 0.15],
      [x, 2.25, 1.0],
      [x, 2.42, 0.3],
    ];
  });
  // główny kanał nad sufitem: od pionów w obie strony
  const DX0 = -26.5;
  const DX1 = 21.0;
  const duct: V3[][] = [];
  AIR_ZONES.forEach((zn, i) => {
    const prev = i === 0 ? DX0 : (AIR_ZONES[i - 1].x + zn.x) / 2;
    const next = i === AIR_ZONES.length - 1 ? DX1 : (AIR_ZONES[i + 1].x + zn.x) / 2;
    duct.push([[zn.x, 2.42, 0.3], [prev, 2.42, 0.3]], [[zn.x, 2.42, 0.3], [next, 2.42, 0.3]]);
  });
  // w kabinie: z nawiewów nad schowkami w dół, wzdłuż burty do kratek przy podłodze i pod podłogę
  const cabin: V3[][] = [];
  for (let x = -26; x <= 19.5; x += 1.6) {
    if (DOORS.some((dd) => Math.abs(dd - x) < 0.8)) continue;
    cabin.push([
      [x, 2.3, 0.6],
      [x, 1.9, 0.98],
      [x, 1.2, 1.5],
      [x, 0.3, Math.min(2.05, hw(0.3, x) - 0.6)],
      [x, -0.7, hw(-0.7, x) - 0.35],
      [x, FLOOR + 0.18, hw(FLOOR + 0.18, x) - 0.2],
      [x, -1.45, hw(-1.45, x) - 0.15],
      [x + 0.3, -1.75, hw(-1.75, x) - 0.3],
    ]);
  }
  // wylot: dolna część kadłuba do zaworu wylotowego za skrzydłem i na zewnątrz
  const exhaust: V3[][] = [0.8, 1.6].map((dz) => [
    [-1.0, -1.85, dz],
    [6.0, -1.85, dz],
    [12.0, -1.8, Math.min(dz, hw(-1.8, 12) - 0.3)],
    [16.5, -1.85, 0.5],
    [OUTFLOW[0], OUTFLOW[1] + 0.15, 0.1],
    [OUTFLOW[0] + 0.25, OUTFLOW[1] - 0.3, -0.45],
    [OUTFLOW[0] + 0.9, OUTFLOW[1] - 0.9, -1.0],
  ]);
  return { bleed, trim, ram, packOut, recirc, supply, duct, cabin, exhaust, PACK, MIXER, FILTERS, FANS, OUTFLOW, pylonTop, engine: E };
}

/* ---------- załadunek ładowni: drzwi, podnośniki, wózki bagażowe (zakładka „Ładownie i załadunek”) ---------- */

/*
 * Przebieg jak na płycie: pod każde drzwi podjeżdża podnośnik (most na wysokości progu i tylna platforma na nożycach).
 * Kontenery przywożą pociągi po TRAIN_N wózków. Pociąg dojeżdża z boku (z dala od silnika), skręca i staje wzdłuż
 * kadłuba tuż za tylną platformą; kontener zsuwa się z wózka na platformę, a ciągnik podciąga pociąg o jeden wózek.
 * Pusty pociąg odjeżdża (przedni ku nosowi, tylny ku ogonowi), a na jego miejsce podjeżdża następny.
 */

/** Czas scenariusza załadunku (s): otwarcie drzwi, potem kontenery co CARGO_CT w obu ładowniach naraz. */
export const CARGO_T0 = 3.2;
export const CARGO_CT = 2.8;
/** Wózków w pociągu i dodatkowy czas na zmianę pociągu. */
const TRAIN_N = 4;
const TRAIN_GAP = 4.5;
/** Liczba kontenerów w ładowni (do czasu zamknięcia drzwi). */
const holdCount = (h: number) => CARGO_SLOTS.filter((s) => s.hold === h).length;
/** Chwila, w której kontener j (kolejność załadunku w ładowni) zaczyna zjeżdżać z wózka. */
const canStart = (j: number) => CARGO_T0 + j * CARGO_CT + Math.floor(j / TRAIN_N) * TRAIN_GAP;
export const CARGO_TEND = Math.max(canStart(holdCount(0) - 1), canStart(holdCount(1) - 1)) + CARGO_CT + 0.6;
const sm01 = (v: number) => {
  const u = Math.max(0, Math.min(1, v));
  return u * u * (3 - 2 * u);
};
/** Otwarcie drzwi ładowni 0…1 w chwili t scenariusza (−1 – przed „Rozpocznij”): otwarcie, załadunek, zamknięcie. */
export function cargoDoorOpen(t: number) {
  if (t < 0) return 0;
  return sm01(t / 2.6) * (1 - sm01((t - CARGO_TEND) / 2.6));
}
/** Wysokość podłogi ładowni (próg drzwi) i pokładu wózka (spód kontenera). */
const SILL_Y = CARGO_Y + 0.03;
const DOLLY_Y = GROUND + 0.62;
/** Podnośnik (z): most do progu i tylna platforma; rząd wózków za platformą. */
const BRIDGE_Z: [number, number] = [-3.25, -5.75];
const LZ = -6.9;
const ZD = -9.5;
/** Rozstaw wózków w pociągu i odległość ciągnika od pierwszego wózka. */
const DOLLY_P = 2.5;
const TUG_D = 2.85;
/** Wysokość ramy podwozia podnośnika (nożyce zaczynają się tuż nad nią). */
const LOADER_YC = GROUND + 0.42;

type TrainPath = { pts: [number, number][]; len: number[]; total: number; sx: number; yaw0: number };
/** Trasa pociągu ładowni: dojazd z boku wzdłuż +z, łuk i prosta wzdłuż kadłuba (przednia – ku nosowi, tylna – ku ogonowi). */
function makeTrainPath(hold: number): TrainPath {
  const xd = CARGO_DOORS[hold];
  const dir = hold === 0 ? -1 : 1;
  const R = hold === 0 ? 4 : 3;
  // kolumna dojazdu: przednia przed silnikiem, tylna za dyszą silnika
  const xc = xd - dir * (R + (hold === 0 ? 1.5 : 0.3));
  const pts: [number, number][] = [];
  for (let z = -78; z < ZD - R; z += 0.5) pts.push([xc, z]);
  const c: [number, number] = [xc + dir * R, ZD - R];
  for (let i = 0; i <= 24; i++) {
    const f = (i / 24) * (Math.PI / 2);
    pts.push([c[0] - dir * R * Math.cos(f), c[1] + R * Math.sin(f)]);
  }
  pts[pts.length - 1] = [c[0], ZD];
  const iArc = pts.length - 1;
  for (let x = c[0] + dir * 0.5; Math.abs(x) < 130; x += dir * 0.5) pts.push([x, ZD]);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const sx = len[iArc] + Math.abs(xd - pts[iArc][0]);
  return { pts, len, total: len[len.length - 1], sx, yaw0: dir < 0 ? Math.PI : 0 };
}
const TRAIN_PATHS = [0, 1].map(makeTrainPath);
/** Punkt trasy w odległości s: położenie (x, z) i obrót wokół pionu (oś x pojazdu w kierunku jazdy); null – poza trasą. */
function pathAt(P: TrainPath, s: number): { x: number; z: number; yaw: number } | null {
  if (s < 0 || s > P.total) return null;
  let lo = 0;
  let hi = P.len.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (P.len[mid] <= s) lo = mid;
    else hi = mid;
  }
  const a = P.pts[lo];
  const b = P.pts[hi];
  const k = (s - P.len[lo]) / Math.max(1e-6, P.len[hi] - P.len[lo]);
  return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) };
}
/** Położenie (s na trasie) pierwszego wózka pociągu m ładowni h w chwili t; null – pociągu nie ma jeszcze na płycie. */
function trainLead(h: number, m: number, t: number): number | null {
  const P = TRAIN_PATHS[h];
  const n = Math.min(TRAIN_N, holdCount(h) - m * TRAIN_N);
  if (n <= 0) return null;
  const j0 = m * TRAIN_N;
  const t0 = canStart(j0);
  if (t < 0) return m === 0 ? P.sx : null;
  if (m > 0 && t < t0) {
    const ARR = 5.5;
    if (t < t0 - ARR) return null;
    return P.sx - 48 * (1 - sm01((t - (t0 - ARR)) / ARR));
  }
  let s = P.sx;
  // po zdjęciu kontenera ciągnik podciąga pociąg o jeden wózek
  for (let k = 1; k < n; k++) s += DOLLY_P * sm01((t - (canStart(j0 + k - 1) + 0.25 * CARGO_CT)) / (0.55 * CARGO_CT));
  // pusty pociąg odjeżdża, coraz szybciej
  const e = Math.max(0, Math.min(1, (t - (canStart(j0 + n - 1) + 0.25 * CARGO_CT)) / 8));
  return s + 110 * e * e;
}
/**
 * Tor kontenera: z wózka na tylną platformę podnośnika, w górę do progu, przez drzwi do ładowni, po rolkach na miejsce.
 * Rozładunek (FUS_LIVE.cargoUnload): kontenery wyjeżdżają w odwrotnej kolejności (najpierw te przy drzwiach) tą samą
 * drogą w drugą stronę i trafiają na kolejne wózki pustych pociągów, które podjeżdżają przodem i odjeżdżają pełne.
 */
export function canPose(sl: (typeof CARGO_SLOTS)[number], t: number): { p: V3; u: number; yaw: number; vis: boolean } {
  if (FUS_LIVE.cargoUnload && t >= 0) {
    const q = holdCount(sl.hold) - 1 - sl.j;
    const u = (t - canStart(q)) / CARGO_CT;
    if (u < 0) return { p: [sl.x, SILL_Y, sl.z], u, yaw: 0, vis: true };
    if (u < 1) return { ...canPath(sl, 1 - u), u };
    return onDolly(sl.hold, q, t, u);
  }
  const u = t < 0 ? -1 : (t - canStart(sl.j)) / CARGO_CT;
  if (u < 0) return onDolly(sl.hold, sl.j, t, u);
  return { ...canPath(sl, u), u };
}
/** Kontener na wózku nr j (kolejność w ładowni) w swoim pociągu. */
function onDolly(hold: number, j: number, t: number, u: number): { p: V3; u: number; yaw: number; vis: boolean } {
  const P = TRAIN_PATHS[hold];
  const s = trainLead(hold, Math.floor(j / TRAIN_N), t);
  const q = s === null ? null : pathAt(P, s - (j % TRAIN_N) * DOLLY_P);
  if (!q) return { p: [0, -50, 0], u, yaw: 0, vis: false };
  return { p: [q.x, DOLLY_Y, q.z], u, yaw: q.yaw - P.yaw0, vis: true };
}
/** Droga kontenera między wózkiem (u = 0) a miejscem w ładowni (u = 1). */
function canPath(sl: (typeof CARGO_SLOTS)[number], u: number): { p: V3; yaw: number; vis: boolean } {
  const door = CARGO_DOORS[sl.hold];
  const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
  const at = (p: V3) => ({ p, yaw: 0, vis: true });
  if (u >= 1) return at([sl.x, SILL_Y, sl.z]);
  if (u < 0.2) return at([door, DOLLY_Y, lerp(ZD, LZ, u / 0.2)]);
  if (u < 0.45) return at([door, lerp(DOLLY_Y, SILL_Y, sm01((u - 0.2) / 0.25)), LZ]);
  if (u < 0.62) return at([door, SILL_Y, lerp(LZ, -1.2, (u - 0.45) / 0.17)]);
  const k = (u - 0.62) / 0.38;
  return at([lerp(door, sl.x, k), SILL_Y, lerp(-1.2, sl.z, Math.min(1, k * 2.5))]);
}
/** Wysokość mostu podnośnika: na dole (pod progiem) przy zamkniętych drzwiach, do progu po ich otwarciu. */
function bridgeY(t: number) {
  // nisko: barierki (1 m nad pokładem) muszą być pod łukiem, który zatacza dolna krawędź otwieranych drzwi
  const lo = SILL_Y - 1.5;
  if (t < 0) return lo;
  const k = sm01((t - 2.7) / 1.4) * (1 - sm01((t - (CARGO_TEND - 1.5)) / 1.4));
  return lo + (SILL_Y - lo) * k;
}
/** Wysokość pokładu tylnej platformy podnośnika ładowni h w chwili t (podnosi kontener i wraca na dół po następny). */
function liftY(h: number, t: number) {
  const lo = DOLLY_Y;
  const hi = SILL_Y;
  for (let j = 0; j < holdCount(h); j++) {
    const u0 = (t - canStart(j)) / CARGO_CT;
    if (u0 < 0 || u0 >= 1) continue;
    // rozładunek: ten sam ruch platformy w odwrotnej kolejności (w górę pusta, w dół z kontenerem)
    const u = FUS_LIVE.cargoUnload ? 1 - u0 : u0;
    const k = u < 0.2 ? 0 : u < 0.45 ? sm01((u - 0.2) / 0.25) : u < 0.62 ? 1 : u < 0.88 ? 1 - sm01((u - 0.62) / 0.26) : 0;
    return lo + (hi - lo) * k;
  }
  return lo;
}
/**
 * Drzwi ładowni: gruba skorupa wycięta z walca kadłuba – poszycie, krawędzie na całą głębokość, wewnętrzne wręgi
 * z pasami i belki poprzeczne, okucia zawiasów u góry i zaczepy zamków na dolnej krawędzi. Zawias u góry: drzwi
 * otwierają się do góry i na zewnątrz (prawa burta).
 */
const DOOR_D = 0.15;
export function CargoDoor({ xd }: { xd: number }) {
  const g = useMemo(() => {
    const x0 = xd - CARGO_DOOR.hw + 0.015;
    const x1 = xd + CARGO_DOOR.hw - 0.015;
    // kąty krawędzi otworu (θ < 0 – prawa burta), z małym luzem
    const thT = (x: number) => -fusTheta(x, CARGO_DOOR.yt) - 0.012;
    const thB = (x: number) => -fusTheta(x, CARGO_DOOR.yb) + 0.012;
    const H = fusPt(xd, -fusTheta(xd, CARGO_DOOR.yt), -0.02);
    const xs = refine([x0, x1], 0.12);
    const ths = (x: number) => refine([thB(x), thT(x)], 0.03);
    const tn = 24;
    const lerpTh = (x: number, k: number) => thB(x) + (thT(x) - thB(x)) * k;
    const ks = Array.from({ length: tn + 1 }, (_, i) => i / tn);
    const skin = grid(xs, ks, (x, k) => fusPt(x, lerpTh(x, k), -0.012));
    // krawędzie skorupy: góra, dół i boki – od poszycia do wewnętrznej strony
    const edges = [
      grid(xs, [-0.012, DOOR_D], (x, o) => fusPt(x, thT(x), o)),
      grid(xs, [-0.012, DOOR_D], (x, o) => fusPt(x, thB(x), o)),
      grid(ks, [-0.012, DOOR_D], (k, o) => fusPt(x0, lerpTh(x0, k), o)),
      grid(ks, [-0.012, DOOR_D], (k, o) => fusPt(x1, lerpTh(x1, k), o)),
      // pas obwodowy od środka (rama drzwi)
      grid(xs, [0, 0.08], (x, k) => fusPt(x, lerpTh(x, 1 - k * 0.5), DOOR_D)),
      grid(xs, [0, 0.08], (x, k) => fusPt(x, lerpTh(x, k * 0.5), DOOR_D)),
    ];
    // wewnętrzne wręgi drzwi (środnik + pas) i belki poprzeczne
    const ribs: THREE.BufferGeometry[] = [];
    const nR = 4;
    for (let i = 1; i <= nR; i++) {
      const x = x0 + ((x1 - x0) * i) / (nR + 1);
      ribs.push(grid(ks, [0, DOOR_D], (k, o) => fusPt(x, lerpTh(x, k), o)));
      ribs.push(grid(ks, [x - 0.035, x + 0.035], (k, xx) => fusPt(xx, lerpTh(xx, k), DOOR_D)));
    }
    for (const k of [0.33, 0.66]) {
      ribs.push(grid(xs, [0, DOOR_D * 0.8], (x, o) => fusPt(x, lerpTh(x, k), o)));
      ribs.push(grid(xs, [-0.012, 0.012], (x, dk) => fusPt(x, lerpTh(x, k + dk), DOOR_D * 0.8)));
    }
    const shell = mergeGeo([skin, ...edges]);
    const frame = mergeGeo(ribs);
    shell.translate(-H[0], -H[1], -H[2]);
    frame.translate(-H[0], -H[1], -H[2]);
    // okucia zawiasów (u góry) i zaczepy zamków (dolna krawędź) – położenia względem osi zawiasu
    const fit = (x: number, th: number, o: number): V3 => {
      const q = fusPt(x, th, o);
      return [q[0] - H[0], q[1] - H[1], q[2] - H[2]];
    };
    const hinges = [0.15, 0.38, 0.62, 0.85].map((f) => fit(x0 + (x1 - x0) * f, thT(xd) - 0.01, 0.07));
    const latches = [0.12, 0.37, 0.63, 0.88].map((f) => fit(x0 + (x1 - x0) * f, thB(xd) + 0.015, DOOR_D + 0.03));
    return { shell, frame, H, hinges, latches };
  }, [xd]);
  useEffect(
    () => () => {
      g.shell.dispose();
      g.frame.dispose();
    },
    [g],
  );
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    // ok. 150°: drzwi podnoszą się wysoko nad otwór, blisko poszycia – cały płat nad zawiasem, ponad barierkami mostu
    if (ref.current) ref.current.rotation.x = 2.6 * cargoDoorOpen(FUS_LIVE.cargoT);
  });
  return (
    <group position={g.H}>
      <group ref={ref}>
        <mesh geometry={g.shell}>
          <M k="paint" side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={g.frame}>
          <M k="#9aa3ad" side={THREE.DoubleSide} />
        </mesh>
        {g.hinges.map((p, i) => (
          <mesh key={`h${i}`} position={p}>
            <boxGeometry args={[0.1, 0.12, 0.14]} />
            <M k="#5b636c" />
          </mesh>
        ))}
        {g.latches.map((p, i) => (
          <mesh key={`l${i}`} position={p}>
            <boxGeometry args={[0.08, 0.1, 0.08]} />
            <M k="#3f464e" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Ustawia ramiona nożyc (stopnie jeden nad drugim, w każdym po dwa skrzyżowane z każdej strony) między y0 a y1 wokół zc,
 * a także rurowe poprzeczki łączące lewą i prawą stronę: na końcach ramion (przeguby) i w środku każdego stopnia (oś). */
/** Ustawia walec (oś y geometrii o wysokości 1) między punktami a i b. */
const _ya = new THREE.Vector3(0, 1, 0);
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
export function placeBetween(m: THREE.Object3D, a: V3, b: V3) {
  _va.set(...a);
  _vb.set(...b).sub(_va);
  const len = _vb.length();
  m.position.set(a[0] + _vb.x / 2, a[1] + _vb.y / 2, a[2] + _vb.z / 2);
  m.quaternion.setFromUnitVectors(_ya, _vb.normalize());
  m.scale.set(1, Math.max(0.01, len), 1);
}
function setScissor(bars: (THREE.Mesh | null)[], y0: number, y1: number, zc: number, L: number, stages: number, tubes?: (THREE.Mesh | null)[], rams?: (THREE.Mesh | null)[]) {
  const h = Math.max(0.04, y1 - y0) / stages;
  const a = Math.acos(Math.min(0.999, h / L));
  const sp = L * Math.sin(a);
  bars.forEach((m, i) => {
    if (!m) return;
    const st = Math.floor(i / 4);
    const j = i % 4;
    m.position.set(j < 2 ? -0.95 : 0.95, y0 + (st + 0.5) * h, zc);
    m.rotation.set((j % 2 ? 1 : -1) * a, 0, 0);
  });
  tubes?.forEach((m, i) => {
    if (!m) return;
    // najpierw przeguby na obu końcach każdego poziomu, potem osie środkowe stopni
    if (i < 2 * (stages + 1)) {
      const l = Math.floor(i / 2);
      m.position.set(0, y0 + l * h, zc + (i % 2 ? 1 : -1) * (sp / 2));
    } else m.position.set(0, y0 + (i - 2 * (stages + 1) + 0.5) * h, zc);
  });
  // siłowniki podnoszenia (po jednym z każdej strony): od przegubu przy ramie do osi pierwszego stopnia
  if (rams) {
    for (const [k, sx] of [[0, -0.6], [1, 0.6]] as const) {
      const A: V3 = [sx, y0 + 0.06, zc + sp / 2 - 0.05];
      const B: V3 = [sx, y0 + h * 1.0, zc - sp * 0.05];
      const M2: V3 = [(A[0] + B[0]) / 2, A[1] + (B[1] - A[1]) * 0.55, A[2] + (B[2] - A[2]) * 0.55];
      const body = rams[2 * k];
      const rod = rams[2 * k + 1];
      if (body) placeBetween(body, A, M2);
      if (rod) placeBetween(rod, M2, B);
    }
  }
}
function Scissor({ bars, tubes, rams, L, stages, k = '#2b3440' }: { bars: React.MutableRefObject<(THREE.Mesh | null)[]>; tubes: React.MutableRefObject<(THREE.Mesh | null)[]>; rams: React.MutableRefObject<(THREE.Mesh | null)[]>; L: number; stages: number; k?: string }) {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`r${i}`} ref={(el) => (rams.current[i] = el)}>
          <cylinderGeometry args={i % 2 ? [0.035, 0.035, 1, 12] : [0.07, 0.07, 1, 14]} />
          <M k={i % 2 ? 'steel' : '#e8b10e'} />
        </mesh>
      ))}
      {Array.from({ length: 4 * stages }, (_, i) => (
        <mesh key={i} ref={(el) => (bars.current[i] = el)}>
          <boxGeometry args={[0.09, L, 0.16]} />
          <M k={k} />
        </mesh>
      ))}
      {Array.from({ length: 3 * stages + 2 }, (_, i) => (
        <mesh key={`t${i}`} ref={(el) => (tubes.current[i] = el)} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.045, 0.045, 2.02, 12]} />
          <M k="#4b5563" />
        </mesh>
      ))}
    </>
  );
}

/** Tekstura pasów ostrzegawczych (skośne pasy żółte i czarne) – wspólna dla sprzętu na płycie. */
let hazardTex: THREE.CanvasTexture | null = null;
function getHazardTex() {
  if (hazardTex) return hazardTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f2c214';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#15171a';
  for (let i = -64; i < 128; i += 32) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 16, 0);
    x.lineTo(i + 16 + 64, 64);
    x.lineTo(i + 64, 64);
    x.closePath();
    x.fill();
  }
  hazardTex = new THREE.CanvasTexture(c);
  hazardTex.wrapS = hazardTex.wrapT = THREE.RepeatWrapping;
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  return hazardTex;
}
/** Płyta z pasami ostrzegawczymi (rozmiar s, powtórzenia wzoru rep wzdłuż). */
export function HazardPlate({ p, s, rot = [0, 0, 0], rep = 3 }: { p: V3; s: [number, number, number]; rot?: V3; rep?: number }) {
  const tex = useMemo(() => {
    const t = getHazardTex().clone();
    t.repeat.set(rep, 1);
    t.needsUpdate = true;
    return t;
  }, [rep]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={p} rotation={rot}>
      <boxGeometry args={s} />
      <meshStandardMaterial map={tex} roughness={0.6} />
    </mesh>
  );
}

/** Pokład z rolkami (oś rolek w x – kontener jedzie w z): rama z ceowników, dwa pasy rolek, w środku kule, prowadnice. */
function RollerDeck({ z0, z1, w = 2.4, rails = true }: { z0: number; z1: number; w?: number; rails?: boolean }) {
  const L = Math.abs(z1 - z0);
  const zc = (z0 + z1) / 2;
  const zMin = Math.min(z0, z1);
  const n = Math.max(2, Math.floor(L / 0.2));
  const nb = Math.max(2, Math.floor(L / 0.3));
  return (
    <>
      {/* płyta spodnia, belki boczne i czołowe ramy */}
      <mesh position={[0, -0.12, zc]}>
        <boxGeometry args={[w - 0.1, 0.05, L - 0.04]} />
        <M k="#3a424c" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.06), -0.06, zc]}>
          <boxGeometry args={[0.12, 0.17, L]} />
          <M k="#2b3138" />
        </mesh>
      ))}
      {[zMin + 0.04, zMin + L - 0.04].map((z) => (
        <mesh key={z} position={[0, -0.07, z]}>
          <boxGeometry args={[w, 0.14, 0.08]} />
          <M k="#2b3138" />
        </mesh>
      ))}
      {/* rolki w dwóch pasach i kule w środku (na nich kontener można obrócić) */}
      {Array.from({ length: n }, (_, i) => {
        const z = zMin + (i + 0.5) * (L / n);
        return [-1, 1].map((sg) => (
          <mesh key={`${i}${sg}`} position={[sg * (w / 4 + 0.05), -0.02, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.032, 0.032, w / 2 - 0.35, 10]} />
            <M k="#d5dae0" />
          </mesh>
        ));
      })}
      {Array.from({ length: nb }, (_, i) => (
        <mesh key={`b${i}`} position={[0, -0.02, zMin + (i + 0.5) * (L / nb)]}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <M k="steel" />
        </mesh>
      ))}
      {/* prowadnice boczne z pasami ostrzegawczymi – kontener nie zjedzie z platformy */}
      {rails && [-1, 1].map((s) => <HazardPlate key={s} p={[s * (w / 2 - 0.03), 0.1, zc]} s={[0.04, 0.2, L - 0.12]} rep={Math.max(2, Math.round(L * 2))} />)}
    </>
  );
}

/** Koło pojazdu obsługi naziemnej: opona z wyraźnym barkiem, jasna felga, piasta. Oś w x. */
export function GseWheel({ p, r = 0.3, w = 0.24 }: { p: V3; r?: number; w?: number }) {
  return (
    <group position={p}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[r, r, w, 28]} />
        <M k="#16181b" />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[(s * w) / 2 + s * 0.004, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[r * 0.6, r * 0.6, 0.01, 20]} />
            <M k="#c9ced4" />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[s * 0.012, 0, 0]}>
            <cylinderGeometry args={[r * 0.2, r * 0.22, 0.03, 12]} />
            <M k="#6b7280" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Podnośnik kontenerów do ładowni dolnej (typu „TLD”): niska rama na czterech kołach z błotnikami, z przodu i z tyłu
 * pasy ostrzegawcze, gumowe odbojniki i podpory hydrauliczne; z boku kabina operatora (okna z trzech stron, fotel,
 * kierownica, pulpit, lusterko, reflektory, lampa ostrzegawcza na maszcie), za nią obudowa silnika i pompy
 * hydraulicznej z kratką. Przedni most na nożycach na wysokości progu (zderzaki przy poszyciu, płyta najazdowa,
 * prowadnice wejściowe, barierki z poprzeczką) i tylna platforma na nożycach, która zjeżdża do wysokości wózka po
 * każdy kontener.
 */
export function CargoLoader({ xd, hold }: { xd: number; hold: number }) {
  const G = GROUND;
  const rear = useRef<THREE.Group>(null);
  const rearBars = useRef<(THREE.Mesh | null)[]>([]);
  const frontBars = useRef<(THREE.Mesh | null)[]>([]);
  const rearTubes = useRef<(THREE.Mesh | null)[]>([]);
  const frontTubes = useRef<(THREE.Mesh | null)[]>([]);
  const rearRams = useRef<(THREE.Mesh | null)[]>([]);
  const frontRams = useRef<(THREE.Mesh | null)[]>([]);
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  const bridge = useRef<THREE.Group>(null);
  // przód mostu dosunięty do burty: z poszycia na wysokości progu (kadłub w dole się zwęża), z luzem na zderzak
  const zS = fusPt(xd, -fusTheta(xd, SILL_Y), 0)[2];
  const zF = zS - 0.1;
  const bz = (zF + BRIDGE_Z[1]) / 2;
  const lip = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = FUS_LIVE.cargoT;
    const y = liftY(hold, t);
    if (rear.current) rear.current.position.y = y;
    setScissor(rearBars.current, LOADER_YC, y - 0.16, LZ, 1.9, 2, rearTubes.current, rearRams.current);
    // most podnosi się do progu dopiero, gdy drzwi są otwarte, i opuszcza się przed ich zamknięciem
    const yb = bridgeY(t);
    if (bridge.current) bridge.current.position.y = yb;
    // płyta najazdowa: opuszcza się na próg, gdy most dojdzie do jego wysokości (wcześniej uniesiona pionowo)
    if (lip.current) lip.current.rotation.x = -(Math.PI / 2) * (1 - sm01((yb - (SILL_Y - 0.08)) / 0.08));
    setScissor(frontBars.current, LOADER_YC, yb - 0.16, bz, 2.0, 2, frontTubes.current, frontRams.current);
    // lampa błyska, gdy podnośnik pracuje (drzwi otwarte)
    if (beacon.current) beacon.current.emissiveIntensity = cargoDoorOpen(t) > 0.05 ? (Math.sin(clock.elapsedTime * 9) > 0 ? 2.2 : 0.15) : 0.1;
  });
  const z0 = -3.1;
  const z1 = -8.0;
  const zc = (z0 + z1) / 2;
  const yel = '#e8b10e';
  return (
    <group position={[xd, 0, 0]}>
      {/* rama: dwie podłużnice i blacha pokładu */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.1, G + 0.36, zc]}>
          <boxGeometry args={[0.2, 0.24, z0 - z1]} />
          <M k={yel} />
        </mesh>
      ))}
      <mesh position={[0, G + 0.29, zc]}>
        <boxGeometry args={[2.0, 0.1, z0 - z1 - 0.1]} />
        <M k="#2d333b" />
      </mesh>
      {/* odblaski boczne: pomarańczowe wzdłuż ramy, czerwone z tyłu */}
      {[-1, 1].flatMap((s) => [-4.6, -5.6, -6.5].map((z) => (
        <mesh key={`o${s}${z}`} position={[s * 1.205, G + 0.36, z]}>
          <boxGeometry args={[0.01, 0.06, 0.12]} />
          <meshStandardMaterial color="#ff8a00" emissive="#ff8a00" emissiveIntensity={0.5} />
        </mesh>
      )))}
      {[-0.9, 0.9].map((x) => (
        <mesh key={`t${x}`} position={[x, G + 0.4, z1 - 0.07]}>
          <boxGeometry args={[0.2, 0.08, 0.01]} />
          <meshStandardMaterial color="#d61f1f" emissive="#d61f1f" emissiveIntensity={0.6} />
        </mesh>
      ))}
      {/* czoła ramy z pasami ostrzegawczymi i gumowe odbojniki na narożnikach */}
      {[z0 + 0.03, z1 - 0.03].map((z) => (
        <group key={z}>
          <HazardPlate p={[0, G + 0.36, z]} s={[2.44, 0.24, 0.06]} rep={6} />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 1.1, G + 0.36, z + (z > zc ? 0.07 : -0.07)]}>
              <boxGeometry args={[0.24, 0.2, 0.08]} />
              <M k="#111317" />
            </mesh>
          ))}
        </group>
      ))}
      {/* koła z błotnikami */}
      {[-1.24, 1.24].flatMap((x) => [-3.75, -7.35].map((z) => (
        <group key={`${x}${z}`}>
          <GseWheel p={[x, G + 0.3, z]} />
          <mesh position={[x, G + 0.64, z]}>
            <boxGeometry args={[0.3, 0.04, 0.78]} />
            <M k="#1f2329" />
          </mesh>
        </group>
      )))}
      {/* podpory hydrauliczne: cylinder, tłoczysko i stopa opuszczona na płytę */}
      {/* na końcach ramy (z dala od kół): wysięgnik przykręcony do podłużnicy, cylinder, tłoczysko i stopa */}
      {[-1, 1].flatMap((sx) => [z0 + 0.12, z1 - 0.1].map((z) => (
        <group key={`s${sx}${z}`} position={[sx * 1.32, G, z]}>
          <mesh position={[-sx * 0.12, 0.5, 0]}>
            <boxGeometry args={[0.36, 0.14, 0.18]} />
            <M k="#2b3138" />
          </mesh>
          {[-1, 1].map((k) => (
            <mesh key={k} position={[-sx * 0.25, 0.5, k * 0.095]}>
              <cylinderGeometry args={[0.02, 0.02, 0.02, 8]} />
              <M k="steel" />
            </mesh>
          ))}
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.28, 12]} />
            <M k={yel} />
          </mesh>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.3, 10]} />
            <M k="steel" />
          </mesh>
          <mesh position={[0, 0.025, 0]}>
            <cylinderGeometry args={[0.12, 0.14, 0.05, 16]} />
            <M k="#2b3138" />
          </mesh>
        </group>
      )))}
      {/* obudowa silnika i pompy hydraulicznej (z boku, pod tylną platformą) z kratką i rurą wydechową */}
      <group position={[1.66, G, -6.9]}>
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[0.6, 0.7, 1.9]} />
          <M k={yel} />
        </mesh>
        {/* zaokrąglona pokrywa */}
        <mesh position={[0, 0.98, 0]}>
          <boxGeometry args={[0.5, 0.06, 1.84]} />
          <M k={yel} />
        </mesh>
        <mesh position={[0, 1.03, 0]}>
          <boxGeometry args={[0.36, 0.04, 1.76]} />
          <M k={yel} />
        </mesh>
        {/* żaluzje wlotu powietrza (poziome), panel serwisowy z zamkami, pas ostrzegawczy u dołu */}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[0.305, 0.48 + i * 0.07, -0.45]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.012, 0.035, 0.7]} />
            <M k="#1f2329" />
          </mesh>
        ))}
        <mesh position={[0.303, 0.68, 0.45]}>
          <boxGeometry args={[0.006, 0.46, 0.75]} />
          <M k="#cf9c0c" />
        </mesh>
        {[0.25, 0.65].map((dz) => (
          <mesh key={dz} position={[0.31, 0.68, dz]}>
            <boxGeometry args={[0.02, 0.05, 0.05]} />
            <M k="#1f2329" />
          </mesh>
        ))}
        <HazardPlate p={[0.305, 0.31, 0]} s={[0.01, 0.12, 1.9]} rep={8} />
        {/* rura wydechowa z daszkiem */}
        <mesh position={[0.12, 1.2, 0.65]}>
          <cylinderGeometry args={[0.035, 0.035, 0.4, 10]} />
          <M k="#2b3138" />
        </mesh>
        <mesh position={[0.12, 1.41, 0.69]} rotation={[0.6, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.02, 10]} />
          <M k="#2b3138" />
        </mesh>
      </group>
      {/* kabina operatora z boku, pod mostem */}
      {/* podest kabiny przykręcony do podłużnicy ramy */}
      <mesh position={[1.42, G + 0.5, -4.3]}>
        <boxGeometry args={[0.5, 0.2, 1.4]} />
        <M k="#2b3138" />
      </mesh>
      <group position={[1.76, G + 0.25, -4.3]}>
        <mesh position={[0, 0.66, 0]}>
          <boxGeometry args={[0.92, 0.72, 1.6]} />
          <M k={yel} />
        </mesh>
        <mesh position={[0, 0.36, 0]}>
          <boxGeometry args={[0.94, 0.12, 1.62]} />
          <M k="#1f2329" />
        </mesh>
        {/* drzwi (zewnętrzny bok): obrys, klamka, stopień i uchwyt przy wejściu */}
        {[
          [0.6, 0.02, 0.02, 0.462, 0.66, 0.38],
          [0.6, 0.02, 0.02, 0.462, 0.66, -0.38],
          [0.02, 0.02, 0.78, 0.462, 0.96, 0],
        ].map(([sy, sx, sz, x, y, z], i) => (
          <mesh key={`d${i}`} position={[x, y, z]}>
            <boxGeometry args={[sx, sy, sz]} />
            <M k="#a87c08" />
          </mesh>
        ))}
        <mesh position={[0.48, 0.8, 0.28]}>
          <boxGeometry args={[0.03, 0.03, 0.12]} />
          <M k="#1f2329" />
        </mesh>
        {/* stopień wejściowy pod drzwiami: kratownica (rama i poprzeczki z prześwitami) zawieszona na dwóch bocznych
            płaskownikach przykręconych do spodu kabiny; ok. 0,3 m nad płytą, podłoga kabiny ok. 0,55 m */}
        {[-0.26, 0.26].map((dz) => (
          <mesh key={dz} position={[0.43, 0.18, dz]}>
            <boxGeometry args={[0.05, 0.3, 0.02]} />
            <M k="#2b3138" />
          </mesh>
        ))}
        {[-0.26, 0.26].map((dz) => (
          <mesh key={`r${dz}`} position={[0.53, 0.05, dz]}>
            <boxGeometry args={[0.24, 0.04, 0.025]} />
            <M k="#2b3138" />
          </mesh>
        ))}
        {[0.42, 0.64].map((x) => (
          <mesh key={`f${x}`} position={[x, 0.05, 0]}>
            <boxGeometry args={[0.025, 0.04, 0.54]} />
            <M k={x > 0.5 ? '#e8b10e' : '#2b3138'} />
          </mesh>
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={`g${i}`} position={[0.53, 0.055, -0.2 + i * 0.1]}>
            <boxGeometry args={[0.2, 0.03, 0.015]} />
            <M k="#5b636c" />
          </mesh>
        ))}
        {[-0.26, 0.26].map((dz) => (
          <mesh key={`b${dz}`} position={[0.43, 0.31, dz]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.04, 8]} />
            <M k="steel" />
          </mesh>
        ))}
        <mesh position={[0.5, 1.25, 0.6]}>
          <cylinderGeometry args={[0.018, 0.018, 0.6, 8]} />
          <M k="#d1d5db" />
        </mesh>
        {/* światła pozycyjne na narożnikach */}
        {[-0.81, 0.81].map((dz) => (
          <mesh key={`p${dz}`} position={[0.4, 0.94, dz]}>
            <boxGeometry args={[0.1, 0.05, 0.02]} />
            <meshStandardMaterial color={dz < 0 ? '#ffb347' : '#d61f1f'} emissive={dz < 0 ? '#ffb347' : '#d61f1f'} emissiveIntensity={0.6} />
          </mesh>
        ))}
        {/* słupki */}
        {[-0.44, 0.44].flatMap((dx) => [-0.78, 0.78].map((dz) => (
          <mesh key={`${dx}${dz}`} position={[dx, 1.36, dz]}>
            <boxGeometry args={[0.06, 0.7, 0.06]} />
            <M k={yel} />
          </mesh>
        )))}
        {/* okna: przód (w stronę samolotu), tył i bok zewnętrzny */}
        {[-0.78, 0.78].map((dz) => (
          <mesh key={dz} position={[0, 1.36, dz]}>
            <boxGeometry args={[0.84, 0.64, 0.02]} />
            <M k="glass" opacity={0.42} />
          </mesh>
        ))}
        <mesh position={[0.44, 1.36, 0]}>
          <boxGeometry args={[0.02, 0.64, 1.52]} />
          <M k="glass" opacity={0.42} />
        </mesh>
        {/* dach z daszkiem i lampa ostrzegawcza na maszcie */}
        <mesh position={[0, 1.73, 0]}>
          <boxGeometry args={[1.02, 0.05, 1.78]} />
          <M k={yel} />
        </mesh>
        <mesh position={[0, 1.77, 0]}>
          <boxGeometry args={[0.9, 0.05, 1.64]} />
          <M k={yel} />
        </mesh>
        {/* uszczelki szyb (ciemne ramki) */}
        {[-0.77, 0.77].map((dz) => (
          <mesh key={`u${dz}`} position={[0, 1.36, dz]}>
            <boxGeometry args={[0.86, 0.66, 0.01]} />
            <meshStandardMaterial color="#111317" wireframe />
          </mesh>
        ))}
        <mesh position={[0.25, 1.86, -0.6]}>
          <cylinderGeometry args={[0.02, 0.02, 0.18, 8]} />
          <M k="#2b3138" />
        </mesh>
        <mesh position={[0.25, 2.0, -0.6]}>
          <cylinderGeometry args={[0.07, 0.08, 0.13, 14]} />
          <meshStandardMaterial ref={beacon} color="#f97316" emissive="#f97316" emissiveIntensity={0.1} />
        </mesh>
        {/* wnętrze: fotel, pulpit i kierownica */}
        <mesh position={[-0.05, 1.12, 0.25]}>
          <boxGeometry args={[0.44, 0.1, 0.44]} />
          <M k="#1f2329" />
        </mesh>
        <mesh position={[-0.05, 1.4, 0.47]}>
          <boxGeometry args={[0.44, 0.5, 0.08]} />
          <M k="#1f2329" />
        </mesh>
        <mesh position={[0, 1.15, -0.5]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[0.7, 0.08, 0.3]} />
          <M k="#2b3138" />
        </mesh>
        <mesh position={[0, 1.33, -0.35]} rotation={[1.1, 0, 0]}>
          <torusGeometry args={[0.15, 0.018, 6, 20]} />
          <M k="#111317" />
        </mesh>
        {/* reflektory i lusterko */}
        {[-0.3, 0.3].map((dx) => (
          <mesh key={dx} position={[dx, 0.82, -0.81]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.03, 14]} />
            <meshStandardMaterial color="#fffbe8" emissive="#fff4c2" emissiveIntensity={0.6} />
          </mesh>
        ))}
        <mesh position={[0.56, 1.5, -0.74]}>
          <boxGeometry args={[0.03, 0.18, 0.12]} />
          <M k="#111317" />
        </mesh>
      </group>
      {/* przedni most na wysokości progu: rolki, prowadnice, gumowy zderzak przy poszyciu */}
      <Scissor bars={frontBars} tubes={frontTubes} rams={frontRams} L={2.0} stages={2} />
      <group ref={bridge} position={[0, bridgeY(-1), 0]}>
        <RollerDeck z0={zF} z1={BRIDGE_Z[1]} />
        {/* gumowe zderzaki na przodzie mostu – opierają się o poszycie pod progiem */}
        {[-0.85, 0.85].map((x) => (
          <mesh key={x} position={[x, -0.2, zF + 0.04]}>
            <boxGeometry args={[0.35, 0.22, 0.12]} />
            <M k="#111317" />
          </mesh>
        ))}
        {/* płyta najazdowa na zawiasie: leży na progu drzwi, kontener przejeżdża po niej do ładowni */}
        <group ref={lip} position={[0, -0.01, zF]}>
          <mesh position={[0, 0, 0.2]}>
            <boxGeometry args={[1.9, 0.03, 0.4]} />
            <M k="#9ca3af" />
          </mesh>
        </group>
        {/* prowadnice wejściowe (rozchylone) – ustawiają kontener na środku otworu drzwi */}
        {[-1, 1].map((sg) => (
          <mesh key={sg} position={[sg * 1.0, 0.12, zF - 0.35]} rotation={[0, sg * 0.35, 0]}>
            <boxGeometry args={[0.05, 0.22, 0.6]} />
            <M k="#f59e0b" />
          </mesh>
        ))}
        {/* pulpit sterowania na moście: słupek, skrzynka z przyciskami i dźwignią (operator steruje z mostu) */}
        <group position={[1.0, 0, BRIDGE_Z[1] + 0.35]}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.08, 0.9, 0.08]} />
            <M k="#2b3138" />
          </mesh>
          <mesh position={[0, 0.98, 0]} rotation={[-0.4, 0, 0]}>
            <boxGeometry args={[0.32, 0.12, 0.26]} />
            <M k="#e8b10e" />
          </mesh>
          <mesh position={[0, 1.06, -0.03]} rotation={[-0.4, 0, 0]}>
            <boxGeometry args={[0.26, 0.01, 0.18]} />
            <M k="#1f2329" />
          </mesh>
          {[-0.08, 0, 0.08].map((dx, i) => (
            <mesh key={dx} position={[dx, 1.075, 0.02]}>
              <cylinderGeometry args={[0.018, 0.018, 0.02, 10]} />
              <meshStandardMaterial color={['#22c55e', '#ef4444', '#facc15'][i]} emissive={['#22c55e', '#ef4444', '#facc15'][i]} emissiveIntensity={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 1.12, -0.07]}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 8]} />
            <M k="#111317" />
          </mesh>
          <mesh position={[0, 1.19, -0.07]}>
            <sphereGeometry args={[0.025, 10, 8]} />
            <M k="#111317" />
          </mesh>
        </group>
        {/* barierki z boku mostu (dla obsługi) */}
        {[-1.25, 1.25].map((x) => (
          <group key={x}>
            {[zF - 0.7, BRIDGE_Z[1] + 0.2].map((z) => (
              <mesh key={z} position={[x, 0.5, z]}>
                <boxGeometry args={[0.04, 1.0, 0.04]} />
                <M k="#f59e0b" />
              </mesh>
            ))}
            {[1.0, 0.55].map((yy) => (
              <mesh key={yy} position={[x, yy, (zF - 0.7 + BRIDGE_Z[1] + 0.2) / 2]}>
                <boxGeometry args={[0.045, 0.045, Math.abs(BRIDGE_Z[1] - zF) - 0.9]} />
                <M k="#f59e0b" />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {/* tylna platforma na nożycach – jeździ w górę i w dół z kontenerem */}
      <Scissor bars={rearBars} tubes={rearTubes} rams={rearRams} L={1.9} stages={2} />
      <group ref={rear} position={[0, DOLLY_Y, 0]}>
        <RollerDeck z0={LZ + 1.05} z1={LZ - 1.05} />
        {/* niskie ograniczniki na tylnej krawędzi platformy */}
        {[-0.75, 0.75].map((x) => (
          <mesh key={x} position={[x, 0.07, LZ - 1.02]}>
            <boxGeometry args={[0.3, 0.12, 0.05]} />
            <M k="#111317" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Pręt (walec) między dwoma stałymi punktami – do dyszli, zastrzałów i poręczy. */
export function StaticBar({ a, b, r, k }: { a: V3; b: V3; r: number; k: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useEffect(() => {
    if (ref.current) placeBetween(ref.current, a, b);
  }, [a, b]);
  return (
    <mesh ref={ref}>
      <cylinderGeometry args={[r, r, 1, 10]} />
      <M k={k} />
    </mesh>
  );
}

/**
 * Wózek pod kontener (przód w +x, ku ciągnikowi): rama z podłużnic i poprzeczek, pokład z rolkami (kontener zsuwa się
 * w bok, w z) i kulami, narożne słupki i ograniczniki z przodu i z tyłu w pasy ostrzegawcze, skrętna oś przednia
 * z trójkątnym dyszlem zakończonym uchem, hak z tyłu do następnego wózka, koła z felgami.
 */
function DollyModel() {
  const G = GROUND;
  const y = DOLLY_Y;
  const tip: V3 = [DOLLY_P - 1.0, G + 0.36, 0];
  return (
    <group>
      {/* rama */}
      {[-0.75, 0.75].map((z) => (
        <mesh key={z} position={[0, y - 0.19, z]}>
          <boxGeometry args={[1.9, 0.12, 0.1]} />
          <M k="#3b4552" />
        </mesh>
      ))}
      {[-0.85, 0, 0.85].map((x) => (
        <mesh key={x} position={[x, y - 0.19, 0]}>
          <boxGeometry args={[0.1, 0.1, 1.5]} />
          <M k="#3b4552" />
        </mesh>
      ))}
      {/* pokład */}
      <mesh position={[0, y - 0.1, 0]}>
        <boxGeometry args={[1.94, 0.06, 1.94]} />
        <M k="#56616e" />
      </mesh>
      {Array.from({ length: 7 }, (_, i) =>
        [-1, 1].map((sg) => (
          <mesh key={`${i}${sg}`} position={[-0.81 + i * 0.27, y - 0.035, sg * 0.45]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.03, 0.03, 0.12, 8]} />
            <M k="#d5dae0" />
          </mesh>
        )),
      )}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={`r${i}`} position={[-0.81 + i * 0.27, y - 0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.028, 0.028, 1.6, 8]} />
          <M k="#c4cad1" />
        </mesh>
      ))}
      {/* ograniczniki z przodu i z tyłu (w kierunku jazdy) i narożne słupki */}
      {[-0.95, 0.95].map((x) => (
        <HazardPlate key={x} p={[x, y + 0.07, 0]} s={[0.05, 0.2, 1.7]} rep={5} />
      ))}
      {[-0.95, 0.95].flatMap((x) => [-0.92, 0.92].map((z) => (
        <mesh key={`p${x}${z}`} position={[x, y + 0.12, z]}>
          <boxGeometry args={[0.08, 0.34, 0.08]} />
          <M k="#2b3138" />
        </mesh>
      )))}
      {/* oś przednia (skrętna, na obrotnicy) i tylna; koła z felgami */}
      <mesh position={[0.62, G + 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 1.3, 8]} />
        <M k="#2b3138" />
      </mesh>
      <mesh position={[-0.62, G + 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 1.3, 8]} />
        <M k="#2b3138" />
      </mesh>
      <mesh position={[0.62, y - 0.3, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.06, 18]} />
        <M k="#2b3138" />
      </mesh>
      {[-0.62, 0.62].flatMap((dx) => [-0.66, 0.66].map((dz) => (
        <group key={`${dx}${dz}`} position={[dx, G + 0.2, dz]} rotation={[0, Math.PI / 2, 0]}>
          <GseWheel p={[0, 0, 0]} r={0.2} w={0.13} />
        </group>
      )))}
      {/* dyszel: trójkąt od osi przedniej do ucha */}
      <StaticBar a={[0.62, G + 0.22, 0.42]} b={tip} r={0.03} k="#e8b10e" />
      <StaticBar a={[0.62, G + 0.22, -0.42]} b={tip} r={0.03} k="#e8b10e" />
      <mesh position={tip} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.06, 0.018, 6, 14]} />
        <M k="#2b3138" />
      </mesh>
      {/* hak z tyłu */}
      <mesh position={[-1.0, G + 0.36, 0]}>
        <boxGeometry args={[0.14, 0.08, 0.14]} />
        <M k="#2b3138" />
      </mesh>
    </group>
  );
}

/**
 * Ciągnik bagażowy (przód w +x): niska rama, maska silnika z osłoną chłodnicy i reflektorami, błotniki nad kołami,
 * otwarte stanowisko kierowcy z fotelem i kierownicą, dach na czterech słupkach z lampą ostrzegawczą, przeciwwaga
 * z tyłu z hakiem i światłami, zderzak z przodu.
 */
export function TugModel() {
  const G = GROUND;
  const white = '#e9ecef';
  const blue = '#1f5fd1';
  return (
    <group>
      {/* rama i dolna część nadwozia */}
      <mesh position={[0, G + 0.42, 0]}>
        <boxGeometry args={[2.7, 0.26, 1.3]} />
        <M k="#2b3138" />
      </mesh>
      {/* maska silnika (przód) */}
      <mesh position={[0.82, G + 0.78, 0]}>
        <boxGeometry args={[1.0, 0.5, 1.2]} />
        <M k={white} />
      </mesh>
      <mesh position={[0.74, G + 1.06, 0]}>
        <boxGeometry args={[0.8, 0.06, 1.12]} />
        <M k={white} />
      </mesh>
      {/* skośny przód maski */}
      <mesh position={[1.2, G + 0.98, 0]} rotation={[0, 0, -0.75]}>
        <boxGeometry args={[0.24, 0.05, 1.18]} />
        <M k={white} />
      </mesh>
      {/* kratki wentylacyjne na bokach maski */}
      {[-0.605, 0.605].flatMap((z) => Array.from({ length: 4 }, (_, i) => (
        <mesh key={`v${z}${i}`} position={[0.62 + i * 0.12, G + 0.82, z]}>
          <boxGeometry args={[0.06, 0.22, 0.01]} />
          <M k="#2b3138" />
        </mesh>
      )))}
      {/* deska rozdzielcza z zegarami za maską */}
      <mesh position={[0.3, G + 1.0, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.08, 0.3, 1.1]} />
        <M k="#1f2329" />
      </mesh>
      {[0.05, 0.3].map((z) => (
        <mesh key={`g${z}`} position={[0.27, G + 1.02, z]} rotation={[0, 0, Math.PI / 2 + 0.5]}>
          <cylinderGeometry args={[0.05, 0.05, 0.01, 16]} />
          <meshStandardMaterial color="#e5e7eb" emissive="#9fd3ff" emissiveIntensity={0.25} />
        </mesh>
      ))}
      {/* lusterka na przednich słupkach */}
      {[-0.68, 0.68].map((z) => (
        <group key={`m${z}`}>
          <StaticBar a={[0.3, G + 1.55, z * 0.9]} b={[0.32, G + 1.6, z * 1.12]} r={0.012} k="#2b3138" />
          <mesh position={[0.32, G + 1.6, z * 1.16]}>
            <boxGeometry args={[0.03, 0.16, 0.1]} />
            <M k="#111317" />
          </mesh>
        </group>
      ))}
      {/* uchwyt przy wejściu i stopień */}
      <StaticBar a={[0.27, G + 0.8, 0.62]} b={[0.27, G + 1.6, 0.62]} r={0.016} k="#d1d5db" />
      <mesh position={[-0.2, G + 0.33, 0.68]}>
        <boxGeometry args={[0.45, 0.03, 0.16]} />
        <M k="#4b535c" />
      </mesh>
      <mesh position={[0.82, G + 0.6, 0]}>
        <boxGeometry args={[1.02, 0.08, 1.22]} />
        <M k={blue} />
      </mesh>
      {/* osłona chłodnicy i reflektory */}
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[1.325, G + 0.72 + i * 0.05, 0]}>
          <boxGeometry args={[0.01, 0.025, 0.6]} />
          <M k="#1f2329" />
        </mesh>
      ))}
      {[-0.45, 0.45].map((z) => (
        <mesh key={z} position={[1.325, G + 0.88, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 16]} />
          <meshStandardMaterial color="#fffbe8" emissive="#fff4c2" emissiveIntensity={0.7} />
        </mesh>
      ))}
      {[-0.45, 0.45].map((z) => (
        <mesh key={`r${z}`} position={[1.322, G + 0.88, z]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.08, 0.014, 6, 18]} />
          <M k="#2b3138" />
        </mesh>
      ))}
      <mesh position={[1.38, G + 0.42, 0]}>
        <boxGeometry args={[0.1, 0.16, 1.36]} />
        <M k="#111317" />
      </mesh>
      {/* stanowisko kierowcy: podłoga, fotel z oparciem, kolumna kierownicy, kierownica */}
      <mesh position={[-0.2, G + 0.58, 0]}>
        <boxGeometry args={[0.9, 0.06, 1.2]} />
        <M k="#3a424c" />
      </mesh>
      {/* fotel kierowcy: podstawa na słupku z amortyzatorem, zaokrąglone siedzisko z boczkami, oparcie, zagłówek */}
      <group position={[-0.45, G, 0.2]}>
        <mesh position={[0, 0.66, 0]}>
          <boxGeometry args={[0.34, 0.06, 0.34]} />
          <M k="#2b3138" />
        </mesh>
        <mesh position={[0, 0.73, 0]}>
          <cylinderGeometry args={[0.06, 0.07, 0.1, 14]} />
          <M k="#3a424c" />
        </mesh>
        <RoundedBox args={[0.44, 0.1, 0.46]} radius={0.04} smoothness={3} position={[0.02, 0.83, 0]}>
          <M k="#23272d" />
        </RoundedBox>
        {[-1, 1].map((sg) => (
          <RoundedBox key={sg} args={[0.38, 0.06, 0.06]} radius={0.025} smoothness={2} position={[0.02, 0.89, sg * 0.21]}>
            <M k="#1a1d21" />
          </RoundedBox>
        ))}
        <RoundedBox args={[0.1, 0.5, 0.44]} radius={0.04} smoothness={3} position={[-0.2, 1.1, 0]} rotation={[0, 0, -0.12]}>
          <M k="#23272d" />
        </RoundedBox>
        {[-1, 1].map((sg) => (
          <RoundedBox key={`o${sg}`} args={[0.08, 0.42, 0.06]} radius={0.025} smoothness={2} position={[-0.17, 1.08, sg * 0.21]} rotation={[0, 0, -0.12]}>
            <M k="#1a1d21" />
          </RoundedBox>
        ))}
        {/* zagłówek na dwóch prętach wsuniętych w oparcie */}
        {[-0.07, 0.07].map((dz) => (
          <mesh key={`h${dz}`} position={[-0.235, 1.38, dz]} rotation={[0, 0, -0.12]}>
            <cylinderGeometry args={[0.009, 0.009, 0.14, 8]} />
            <M k="steel" />
          </mesh>
        ))}
        <RoundedBox args={[0.09, 0.15, 0.26]} radius={0.035} smoothness={3} position={[-0.245, 1.47, 0]} rotation={[0, 0, -0.12]}>
          <M k="#23272d" />
        </RoundedBox>
        {/* przeszycia siedziska */}
        {[-0.1, 0.1].map((dz) => (
          <mesh key={`s${dz}`} position={[0.02, 0.882, dz]}>
            <boxGeometry args={[0.36, 0.004, 0.006]} />
            <M k="#3a3f46" />
          </mesh>
        ))}
      </group>
      {/* kolumna kierownicy z osłoną i kierownica: obręcz zwrócona do kierowcy, trzy ramiona, piasta i gałka */}
      <StaticBar a={[0.3, G + 0.6, 0.2]} b={[0.1, G + 1.1, 0.2]} r={0.022} k="#2b3138" />
      <StaticBar a={[0.26, G + 0.7, 0.2]} b={[0.16, G + 0.95, 0.2]} r={0.05} k="#1f2329" />
      <group position={[0.09, G + 1.13, 0.2]} rotation={[0, 0, -1.19]}>
        <group rotation={[0, -Math.PI / 2, 0]}>
          <mesh>
            <torusGeometry args={[0.18, 0.022, 10, 32]} />
            <M k="#111317" />
          </mesh>
          {[Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6].map((ang) => (
            <mesh key={ang} position={[Math.cos(ang) * 0.09, Math.sin(ang) * 0.09, 0]} rotation={[0, 0, ang]}>
              <boxGeometry args={[0.17, 0.03, 0.015]} />
              <M k="#2b3138" />
            </mesh>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.045, 0.05, 0.05, 16]} />
            <M k="#1f2329" />
          </mesh>
          <mesh position={[0.18, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.07, 10]} />
            <M k="#111317" />
          </mesh>
        </group>
      </group>
      {/* słupki, dach i lampa ostrzegawcza */}
      {[-0.95, 0.3].flatMap((x) => [-0.6, 0.6].map((z) => (
        <mesh key={`${x}${z}`} position={[x, G + 1.42, z]}>
          <boxGeometry args={[0.05, 1.3, 0.05]} />
          <M k="#2b3138" />
        </mesh>
      )))}
      <mesh position={[-0.32, G + 2.09, 0]}>
        <boxGeometry args={[1.5, 0.05, 1.42]} />
        <M k={blue} />
      </mesh>
      <mesh position={[-0.32, G + 2.12, 0]}>
        <boxGeometry args={[1.36, 0.03, 1.28]} />
        <M k={white} />
      </mesh>
      <mesh position={[-0.6, G + 2.21, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.13, 12]} />
        <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={1.2} />
      </mesh>
      {/* przeciwwaga z tyłu, światła i hak */}
      <mesh position={[-1.08, G + 0.75, 0]}>
        <boxGeometry args={[0.5, 0.45, 1.24]} />
        <M k={white} />
      </mesh>
      <mesh position={[-1.08, G + 0.6, 0]}>
        <boxGeometry args={[0.52, 0.08, 1.26]} />
        <M k={blue} />
      </mesh>
      {[-0.5, 0.5].map((z) => (
        <mesh key={`l${z}`} position={[-1.335, G + 0.85, z]}>
          <boxGeometry args={[0.01, 0.08, 0.14]} />
          <meshStandardMaterial color="#d61f1f" emissive="#d61f1f" emissiveIntensity={0.7} />
        </mesh>
      ))}
      <HazardPlate p={[-1.34, G + 0.42, 0]} s={[0.02, 0.18, 1.3]} rep={4} />
      <mesh position={[-1.42, G + 0.36, 0]}>
        <boxGeometry args={[0.16, 0.08, 0.16]} />
        <M k="#2b3138" />
      </mesh>
      {/* błotniki i koła */}
      {[-0.85, 0.85].flatMap((dx) => [-0.66, 0.66].map((dz) => (
        <group key={`${dx}${dz}`}>
          <group position={[dx, G + 0.32, dz]} rotation={[0, Math.PI / 2, 0]}>
            <GseWheel p={[0, 0, 0]} r={0.32} w={0.22} />
          </group>
          {/* błotnik: łuk nad kołem (półwalec) z gumowym fartuchem */}
          <mesh position={[dx, G + 0.32, dz]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.41, 0.41, 0.3, 20, 1, true, Math.PI / 2, Math.PI]} />
            <M k="#1f2329" side={THREE.DoubleSide} />
          </mesh>
        </group>
      )))}
    </group>
  );
}

/** Pociągi wózków jednej ładowni (każdy: ciągnik i do TRAIN_N wózków) jadące po swojej trasie. */
export function DollyTrains({ hold }: { hold: number }) {
  const P = TRAIN_PATHS[hold];
  const nTrains = Math.ceil(holdCount(hold) / TRAIN_N);
  const trains = Array.from({ length: nTrains }, (_, m) => Math.min(TRAIN_N, holdCount(hold) - m * TRAIN_N));
  const refs = useRef<(THREE.Group | null)[][]>(trains.map(() => []));
  useFrame(() => {
    const t = FUS_LIVE.cargoT;
    trains.forEach((n, m) => {
      const s = trainLead(hold, m, t);
      for (let k = -1; k < n; k++) {
        const g = refs.current[m][k + 1];
        if (!g) continue;
        const q = s === null ? null : pathAt(P, k < 0 ? s + TUG_D : s - k * DOLLY_P);
        g.visible = Boolean(q);
        if (q) {
          g.position.set(q.x, 0, q.z);
          g.rotation.y = q.yaw;
        }
      }
    });
  });
  return (
    <group>
      {trains.map((n, m) =>
        Array.from({ length: n + 1 }, (_, i) => (
          <group key={`${m}-${i}`} ref={(el) => (refs.current[m][i] = el)} visible={false}>
            {i === 0 ? <TugModel /> : <DollyModel />}
          </group>
        )),
      )}
    </group>
  );
}

/** Odległość środka klina od środka wózka: oś skrajna (dx) + miejsce, gdzie opona r jest 0,2 m nad płytą, + 3 cm (czubek skosu). */
const chockSpan = (dx: number, r: number) => dx + Math.sqrt(r * r - (r - 0.2) * (r - 0.2)) + 0.03;
/** Para klinów pod kołem (przed i za oponą, w odległości span od osi): skośny profil oparty o oponę, czarny pas
 * odblaskowy, uchwyt i linka łącząca oba kliny z boku. */
export function ChockPair({ x, z, span, len }: { x: number; z: number; span: number; len: number }) {
  const G = GROUND;
  const geo = useMemo(() => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.16, 0);
    sh.lineTo(0.17, 0);
    sh.lineTo(0.03, 0.2);
    sh.lineTo(-0.16, 0.2);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
    g.translate(0, 0, -len / 2);
    return g;
  }, [len]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group position={[x, G + 0.012, z]}>
      {[-1, 1].map((sg) => (
        // skos zwrócony ku oponie (klin przed kołem – skos w +x, za kołem – w −x)
        <group key={sg} position={[sg * span, 0, 0]} scale={[-sg, 1, 1]}>
          <mesh geometry={geo} raycast={() => null}>
            <meshStandardMaterial color="#f5c518" roughness={0.65} />
          </mesh>
          <mesh position={[-0.065, 0.214, 0]} raycast={() => null}>
            <boxGeometry args={[0.2, 0.012, len * 0.35]} />
            <meshStandardMaterial color="#111317" roughness={0.6} />
          </mesh>
          <mesh position={[-0.07, 0.24, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
            <torusGeometry args={[0.07, 0.012, 6, 16, Math.PI]} />
            <meshStandardMaterial color="#1f2937" roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Pachołek ostrzegawczy: pomarańczowy stożek z zaokrąglonym czubkiem, dwa pasy odblaskowe, gumowa kwadratowa podstawa. */
export function SafetyCone({ x, z }: { x: number; z: number }) {
  const orange = '#f26a1b';
  return (
    <group position={[x, GROUND, z]}>
      <mesh position={[0, 0.025, 0]} raycast={() => null}>
        <boxGeometry args={[0.42, 0.05, 0.42]} />
        <meshStandardMaterial color="#1b1d21" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.06, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.17, 0.19, 0.03, 20]} />
        <meshStandardMaterial color="#1b1d21" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.405, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.035, 0.165, 0.67, 24]} />
        <meshStandardMaterial color={orange} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.745, 0]} raycast={() => null}>
        <sphereGeometry args={[0.036, 12, 8]} />
        <meshStandardMaterial color={orange} roughness={0.55} />
      </mesh>
      {/* pasy odblaskowe (lekko świecą, jak folia w świetle) */}
      {[
        [0.5, 0.075, 0.098],
        [0.33, 0.11, 0.124],
      ].map(([y, r0, r1]) => (
        <mesh key={y} position={[0, y, 0]} raycast={() => null}>
          <cylinderGeometry args={[r0 + 0.004, r1 + 0.004, 0.08, 24]} />
          <meshStandardMaterial color="#eef2f6" roughness={0.3} metalness={0.2} emissive="#ffffff" emissiveIntensity={0.15} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Stanowisko postojowe: lotnisko z pasem, drogą kołowania i terminalem (runway.tsx) ustawione tak, że stanowisko jest
 * pod samolotem, a na płycie wokół samolotu – czerwona linia ograniczenia sprzętu, pola postoju sprzętu, kliny pod
 * kołami i pachołki przy silniku i końcówce skrzydła.
 */
export function CargoStand() {
  const G = GROUND;
  const line = (x0: number, x1: number, z0: number, z1: number, c: string, key: string) => (
    <mesh key={key} position={[(x0 + x1) / 2, G + 0.004, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[Math.max(0.15, Math.abs(x1 - x0)), Math.max(0.15, Math.abs(z1 - z0))]} />
      <meshStandardMaterial color={c} roughness={0.75} emissive={c} emissiveIntensity={0.18} />
    </mesh>
  );
  const ERA = { x0: -40, x1: 40, z: 35 };
  const eng = engineOrigin();
  const red = '#d23b2f';
  const white = '#dfe3e8';
  // pola postoju sprzętu (białe obrysy) za czerwoną linią, z prawej strony
  const boxes: [number, number][] = [
    [-26, -12],
    [-8, 6],
    [10, 24],
  ];
  const cones: [number, number][] = [
    [eng[0] - 3.2, -eng[2]],
    [eng[0] + 8, -eng[2] - 2.2],
    [8, -33],
    [36.5, -4],
    [NOSE_X - 8.5, -2],
  ];
  return (
    <group>
      <group position={[STAND.u, G - 0.028, -STAND.v]}>
        <AirportModel />
      </group>
      {/* czerwona linia ograniczenia sprzętu wokół samolotu */}
      {line(ERA.x0, ERA.x1, -ERA.z, -ERA.z, red, 'e1')}
      {line(ERA.x0, ERA.x1, ERA.z, ERA.z, red, 'e2')}
      {line(ERA.x0, ERA.x0, -ERA.z, ERA.z, red, 'e3')}
      {line(ERA.x1, ERA.x1, -ERA.z, ERA.z, red, 'e4')}
      {/* białe pola postoju sprzętu za linią */}
      {boxes.flatMap(([a, b], i) => [
        line(a, b, -ERA.z - 1.5, -ERA.z - 1.5, white, `b${i}a`),
        line(a, b, -ERA.z - 9, -ERA.z - 9, white, `b${i}b`),
        line(a, a, -ERA.z - 9, -ERA.z - 1.5, white, `b${i}c`),
        line(b, b, -ERA.z - 9, -ERA.z - 1.5, white, `b${i}d`),
      ])}
      {/* kliny pod kołami: przednie podwozie i prawy wózek główny (lewa połowa samolotu jest zdjęta); para przed i za kołem */}
      {/* skos klina dotyka bieżnika ok. 0,2 m nad płytą: przed pierwszą i za ostatnią osią wózka (osie co 1,5 m, opony r = 0,7 m) */}
      <ChockPair x={NOSE_X + 0.08} z={0} span={chockSpan(0, 0.53)} len={0.9} />
      {[-0.63, 0.63].map((dz) => (
        <ChockPair key={dz} x={MLG.x} z={-MLG.z + dz} span={chockSpan(1.5, 0.7)} len={0.44} />
      ))}
      {/* pachołki: przed silnikiem, za nim, przy końcówce skrzydła, przy ogonie i przed nosem */}
      {cones.map(([x, z], i) => (
        <SafetyCone key={i} x={x} z={z} />
      ))}
    </group>
  );
}

/* ---------- dekompresja: maski tlenowe i mgła w kabinie (zakładka „Dekompresja”) ---------- */

/** Fotele klasy ekonomicznej (jak w kabinie): rząd x i położenie z każdego fotela. */
function economySeats() {
  const half = (y: number, x: number) => fusPt(x, fusTheta(x, y), 0)[2] - 0.2;
  const zs = [-2.42, -1.95, -1.48, -0.47, 0, 0.47, 1.48, 1.95, 2.42];
  const out: { x: number; z: number; centre: boolean }[] = [];
  for (let x = -14.2; x <= 16.5 + PA; x += 0.81) {
    if (DOORS.some((dd) => x > dd - 1.95 && x < dd + 1.85)) continue;
    const k = Math.min(1, half(FLOOR + 0.6, x) / 2.75);
    for (const dz of zs) out.push({ x, z: dz * k, centre: Math.abs(dz) < 1 });
  }
  return out;
}

/** Miękka, okrągła plamka do mgły (biała, z przezroczystym brzegiem). */
let fogTex: THREE.CanvasTexture | null = null;
function getFogTex() {
  if (fogTex) return fogTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  fogTex = new THREE.CanvasTexture(c);
  return fogTex;
}

/**
 * Skutki dekompresji w kabinie: z paneli nad fotelami (PSU) otwierają się klapki i wypadają maski tlenowe – po
 * jednej na fotel, na przewodzie, z woreczkiem; spadają, odbijają się i kołyszą. Przy gwałtownym spadku ciśnienia
 * powietrze rozpręża się i ochładza poniżej punktu rosy – w kabinie na kilka sekund pojawia się mgła.
 * Stan (postęp wypadania masek, ich „wiek”, gęstość mgły) ustawia zakładka w FUS_LIVE.
 */
function DecompFx() {
  const seats = useMemo(economySeats, []);
  const n = seats.length;
  const tubes = useRef<THREE.InstancedMesh>(null);
  const cups = useRef<THREE.InstancedMesh>(null);
  const bags = useRef<THREE.InstancedMesh>(null);
  const flaps = useRef<THREE.InstancedMesh>(null);
  const fog = useRef<THREE.Points>(null);
  const fogMat = useRef<THREE.PointsMaterial>(null);
  const o = useMemo(() => new THREE.Object3D(), []);
  // punkt zawieszenia maski: panel nad rzędem z boku albo spód środkowego schowka; maska kończy się przed twarzą
  const tops = useMemo(() => seats.map((s) => new THREE.Vector3(s.x - 0.12, s.centre ? 1.5 : 0.93, s.z)), [seats]);
  const lens = useMemo(() => tops.map((p) => p.y - 0.08), [tops]);
  const fogGeo = useMemo(() => {
    const pts: number[] = [];
    let k = 7;
    const r = () => {
      k = (k * 16807) % 2147483647;
      return (k - 1) / 2147483646;
    };
    for (let i = 0; i < 1400; i++) {
      const x = -15 + r() * 33;
      const y = FLOOR + 0.1 + r() * 2.6;
      const w = Math.max(0.3, fusPt(x, fusTheta(x, Math.min(1.2, y)), 0)[2] - 0.35);
      pts.push(x, y, (r() * 2 - 1) * w);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useEffect(() => () => fogGeo.dispose(), [fogGeo]);
  useFrame(({ clock }) => {
    const d = FUS_LIVE.masks;
    const age = FUS_LIVE.maskAge;
    const t = clock.elapsedTime;
    // spadek z odbiciem: przewód rozwija się, przeskakuje trochę za długość i wraca
    const drop = d <= 0 ? 0 : d < 1 ? 1 - Math.pow(1 - d, 3) : 1 + 0.08 * Math.sin(age * 7) * Math.exp(-age * 2.2);
    const swingAmp = 0.22 * Math.exp(-Math.max(0, age) * 0.35) + 0.03;
    const tm = tubes.current;
    const cm = cups.current;
    const bm = bags.current;
    const fm = flaps.current;
    for (let i = 0; i < n; i++) {
      const T = tops[i];
      const L = Math.max(0.001, lens[i] * drop);
      const a = d > 0 ? swingAmp * Math.sin(t * 2.1 + i * 1.7) : 0;
      const b = d > 0 ? 0.6 * swingAmp * Math.sin(t * 1.6 + i * 2.3) : 0;
      const dir = new THREE.Vector3(Math.sin(a), -Math.cos(a) * Math.cos(b), Math.sin(b)).normalize();
      const end = T.clone().addScaledVector(dir, L);
      const vis = d > 0 ? 1 : 0;
      if (tm) {
        o.position.copy(T).addScaledVector(dir, L / 2);
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        o.scale.set(vis, L, vis);
        o.updateMatrix();
        tm.setMatrixAt(i, o.matrix);
      }
      if (cm) {
        o.position.copy(end);
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
        o.scale.set(vis, vis, vis);
        o.updateMatrix();
        cm.setMatrixAt(i, o.matrix);
      }
      if (bm) {
        o.position.copy(T).addScaledVector(dir, L * 0.72);
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        o.scale.set(vis, vis, vis);
        o.updateMatrix();
        bm.setMatrixAt(i, o.matrix);
      }
      if (fm && i % 3 === 1) {
        // klapka panelu: jedna na grupę trzech foteli, otwiera się w dół na zawiasie
        const j = (i - 1) / 3;
        const open = Math.min(1, d * 3);
        o.position.set(T.x + 0.12 - 0.15 * open, T.y + 0.01 - 0.15 * Math.sin(open * 1.4), T.z);
        o.quaternion.setFromEuler(new THREE.Euler(0, 0, -open * 1.4));
        o.scale.set(0.3, 0.012, 1.0);
        o.updateMatrix();
        fm.setMatrixAt(j, o.matrix);
      }
    }
    [tm, cm, bm, fm].forEach((m) => m && (m.instanceMatrix.needsUpdate = true));
    // mgła: gęstość z zakładki, lekki ruch (powietrze płynie ku nieszczelności)
    if (fogMat.current) fogMat.current.opacity = 0.55 * FUS_LIVE.fog;
    if (fog.current) {
      fog.current.visible = FUS_LIVE.fog > 0.01;
      fog.current.position.x = -0.6 * Math.sin(t * 0.3) - 0.8 * FUS_LIVE.fog;
    }
  });
  return (
    <group>
      <instancedMesh ref={tubes} args={[undefined, undefined, n]} frustumCulled={false}>
        <cylinderGeometry args={[0.006, 0.006, 1, 6]} />
        <M k="#e8eef4" />
      </instancedMesh>
      <instancedMesh ref={cups} args={[undefined, undefined, n]} frustumCulled={false}>
        <cylinderGeometry args={[0.03, 0.065, 0.075, 16]} />
        <M k="#f5c518" />
      </instancedMesh>
      <instancedMesh ref={bags} args={[undefined, undefined, n]} frustumCulled={false}>
        <capsuleGeometry args={[0.035, 0.09, 4, 10]} />
        <meshStandardMaterial color="#cfe9d6" transparent opacity={0.55} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={flaps} args={[undefined, undefined, Math.ceil(n / 3)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <M k="#d6d1c4" />
      </instancedMesh>
      <points ref={fog} geometry={fogGeo} visible={false} frustumCulled={false}>
        <pointsMaterial ref={fogMat} map={getFogTex()} size={1.4} sizeAttenuation transparent depthWrite={false} opacity={0} color="#eef3f8" />
      </points>
    </group>
  );
}

/** Wszystko do załadunku: stanowisko na płycie, drzwi obu ładowni, podnośniki, pociągi wózków. */
function CargoOps() {
  return (
    <group>
      <CargoStand />
      {CARGO_DOORS.map((xd, h) => (
        <group key={h}>
          <CargoDoor xd={xd} />
          <CargoLoader xd={xd} hold={h} />
          <DollyTrains hold={h} />
        </group>
      ))}
    </group>
  );
}
