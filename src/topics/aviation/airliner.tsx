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
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Environment, Html, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneHidden, useTopicNav } from '../../lib/topicNav';
import { EngineModel, type EngineModelProps } from './engineModel';

export type PlanePart = 'fuselage' | 'wing' | 'engine' | 'tail' | 'gear' | 'apu' | 'cockpit' | 'radar' | 'packs' | 'fuel' | 'lights' | 'doors';
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
  packs: 'klimatyzacja',
  fuel: 'paliwo',
  lights: 'swiatla',
  doors: 'drzwi',
};
export const PART_NAME: Record<PlanePart, string> = {
  fuselage: 'kadłub',
  wing: 'skrzydło',
  engine: 'silnik',
  tail: 'usterzenie',
  gear: 'podwozie',
  apu: 'APU',
  cockpit: 'kokpit',
  radar: 'radar pogodowy',
  packs: 'klimatyzacja',
  fuel: 'paliwo',
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
type ClipUniforms = { uInv: { value: THREE.Matrix4 }; uClip: { value: THREE.Vector3 } };
const ClipCtx = createContext<ClipUniforms | null>(null);
const CLIP_GLSL = `
uniform vec3 uClip;
varying vec3 vPlane;
float clipH(float p) { return fract(sin(p * 127.1 + 311.7) * 43758.5453); }
float clipN(float p) { float i = floor(p); return mix(clipH(i), clipH(i + 1.0), fract(p)); }
`;
function clipShader(u: ClipUniforms) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
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

function M({ k, side = THREE.FrontSide, opacity = 1, color, emit, matRef }: { k: keyof typeof MATS | string; side?: THREE.Side; opacity?: number; color?: string; emit?: string; matRef?: React.Ref<THREE.MeshPhysicalMaterial> }) {
  const glow = useContext(GlowCtx);
  const glowColor = useContext(GlowColorCtx);
  const clip = useContext(ClipCtx);
  const onCompile = useMemo(() => (clip ? clipShader(clip) : undefined), [clip]);
  const m = MATS[k] ?? { color: k, metal: 0.2, rough: 0.5 };
  return (
    <meshPhysicalMaterial
      ref={matRef}
      onBeforeCompile={onCompile}
      customProgramCacheKey={clip ? () => 'plane-clip' : undefined}
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
function blinkLevel(b: Blink, time: number) {
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

function Lamp({ p, n = [0, 1, 0], color, r = 0.09, halo = 1.6, blink, on: onProp = true, isOn, rx = 1, bezel = true, sector, beam }: { p: V3; n?: V3; color: string; r?: number; halo?: number; blink?: Blink; on?: boolean; isOn?: () => boolean; rx?: number; bezel?: boolean; sector?: LampSector; beam?: { len: number; half: number; dir: V3 } }) {
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
  useFrame(({ clock, camera }) => {
    // włączenie: z właściwości albo z funkcji (stan sceny zmieniany co klatkę, bez przerysowania)
    const on = isOn ? isOn() : onProp;
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
    const lit = blink ? blinkLevel(blink, clock.elapsedTime) : 1;
    if (mat.current) mat.current.emissiveIntensity = blink ? 0.25 + 2.4 * lit * Math.max(0.3, dirK) : 1.6 * Math.max(0.25, dirK);
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
function refine(breaks: number[], step: number) {
  const out: number[] = [];
  const b = [...new Set(breaks)].sort((p, q) => p - q);
  for (let i = 0; i < b.length - 1; i++) {
    const n = Math.max(1, Math.ceil((b[i + 1] - b[i]) / step));
    for (let k = 0; k < n; k++) out.push(b[i] + ((b[i + 1] - b[i]) * k) / n);
  }
  out.push(b[b.length - 1]);
  return out;
}
/** Siatka powierzchni na listach parametrów u, v; trójkąty, których środek spełnia `skip`, są pomijane. */
function grid(us: number[], vs: number[], fn: (u: number, v: number) => V3, skip?: (u: number, v: number) => boolean) {
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
/** Przekrój kadłuba w x: środek yc, półwysokość h, półszerokość w. Nos lekko opuszczony, ogon podniesiony. */
function fusSec(x: number) {
  // część walcowa wydłużona o obie wstawki; nos i stożek ogonowy jak w krótszej wersji
  return fusSec900(x < -24.5 - PF ? x + PF : x > 6 + PA ? x - PA : 0);
}
function fusSec900(x: number) {
  if (x < -24.5) {
    // nos dopasowany do pomiarów modelu referencyjnego A350-900: szpic owiewki radaru nisko (ok. 1,4 m pod osią),
    // spód szybko dochodzi do pełnego przekroju, góra wznosi się łagodnie (długi skos szyb kokpitu), nos jest smukły
    const u = Math.max(0, (x + 33.4) / 8.9);
    const tip = -1.4;
    const top = tip + (3.05 - tip) * Math.pow(Math.max(0, 1 - (1 - u) ** 2.5), 0.85);
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
function fusPt(x: number, th: number, inset = 0): V3 {
  const { yc, h, w } = fusSec(x);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [x, yc + Math.max(0.01, h - inset) * Math.sign(c) * Math.pow(Math.abs(c), 2 / FUS_N), Math.max(0.01, w - inset) * Math.sign(s) * Math.pow(Math.abs(s), 2 / FUS_N)];
}
/** Kąt θ, pod którym burta kadłuba w x ma wysokość y (lewa burta). */
function fusTheta(x: number, y: number) {
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
/** Przekrój kadłuba w x (środek yc, półwysokość h, półszerokość w) – do rozmieszczenia wyposażenia w stożku ogonowym. */
export const fuselageSection = (x: number) => fusSec(x);
const FUS_X = [...new Set([...refine([-33.4 - PF, -33.2 - PF, -32.6 - PF, -31.9 - PF, -29 - PF, -27 - PF, -24.5 - PF, -22.5, 6 + PA, 15, 22 + PA, 30 + PA, APU_HATCH.x0, APU_HATCH.x1, 33 + PA, 33.4 + PA], 0.45), ...refine([-31.8 - PF, -29.4 - PF], 0.05), ...refine([-29.3 - PF, -27.5 - PF], 0.08)])].sort((a, b) => a - b);
const FUS_TH = [...new Set([...refine([-Math.PI, -0.35, 0, 1.32, Math.PI], 0.05), ...refine([-0.75, 0.75], 0.016), ...refine([Math.PI - 0.45, Math.PI], 0.015), ...refine([-Math.PI, -Math.PI + 0.45], 0.015)])].sort((a, b) => a - b);

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
const fairBottom = (x: number, z: number, out = 0) => {
  const { yc, h, w } = fairSec(x);
  return secBottom(yc, h + out, w + out, FAIR_N, z);
};
const fusBottom = (x: number, z: number, out = 0) => {
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
/** Czarna „maska” okien kokpitu (charakterystyczna dla tego typu samolotu). */
/**
 * Szyby kokpitu (lewa burta): obrysy [odległość od czubka nosa, odsunięcie od osi w bok] w metrach – szyba przednia,
 * boczna (otwierana) i mała tylna. Obrysy zmierzone na modelu A350XWB-900 z repozytorium github.com/Sbyx13/A350XWB
 * (licencja MIT; autorzy: Sbyx, Christopher Andrews) – szczegóły w CREDITS.md.
 */
const CK_PANES: [number, number][][] = [[[1.942,0.091],[2.05,0.085],[2.157,0.079],[2.264,0.086],[2.353,0.154],[2.402,0.302],[2.47,0.446],[2.537,0.589],[2.633,0.715],[2.696,0.833],[2.599,0.893],[2.514,0.947],[2.446,0.992],[2.352,0.977],[2.236,0.884],[2.134,0.762],[2.048,0.628],[1.965,0.492],[1.906,0.344],[1.884,0.188]],[[3.027,1.067],[3.124,1.162],[3.141,1.25],[3.135,1.323],[3.13,1.394],[3.125,1.466],[3.13,1.524],[3.136,1.58],[3.034,1.544],[2.916,1.479],[2.802,1.407],[2.694,1.331],[2.591,1.245],[2.525,1.158],[2.549,1.104],[2.604,1.051],[2.668,0.998],[2.732,0.945],[2.816,0.918],[2.919,0.985]],[[3.224,1.504],[3.227,1.549],[3.23,1.594],[3.251,1.644],[3.342,1.69],[3.449,1.725],[3.549,1.742],[3.642,1.75],[3.689,1.727],[3.695,1.684],[3.669,1.632],[3.637,1.57],[3.594,1.5],[3.528,1.431],[3.446,1.365],[3.355,1.303],[3.266,1.27],[3.236,1.323],[3.232,1.383],[3.227,1.443]]];
const CK_TIP = -33.4 - PF;
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
const DOORS = [-26.9 - PF, -16.4, 7.4, 18.6 + PA];
const FLOOR = -1.15;
const WIN_Y = 0.15;

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
  skin: { name: 'poszycie', desc: 'Zewnętrzna „skóra” skrzydła z kompozytu węglowego, przy kadłubie grubości kilkunastu milimetrów. Przenosi część obciążeń i tworzy szczelną ścianę zbiornika paliwa. Tu górne poszycie zdjęliśmy, żeby zajrzeć do środka.' },
  spar: { name: 'dźwigary', desc: 'Dwie główne belki biegnące wzdłuż całego skrzydła: przedni (ok. 15% cięciwy) i tylny (ok. 60%). Przenoszą zginanie od siły nośnej – w locie koniec skrzydła unosi się o kilka metrów. Razem z poszyciem i żebrami tworzą keson.' },
  rib: { name: 'żebra', desc: 'Poprzeczne ścianki co ok. 0,7 m. Nadają skrzydłu kształt profilu, usztywniają poszycie i dzielą zbiornik na komory, żeby paliwo nie przelewało się gwałtownie przy manewrach. Mają otwory na przewody i przepływ paliwa.' },
  stringer: { name: 'podłużnice', desc: 'Długie, wąskie profile przyklejone od środka do poszycia. Chronią je przed wyboczeniem (pofalowaniem) pod ściskaniem – górne poszycie w locie jest ściskane, dolne rozciągane.' },
  fuel: { name: 'paliwo w kesonie', desc: 'Keson jest zbiornikiem integralnym: szczelne poszycie, dźwigary i żebra same tworzą zbiornik. W skrzydłach i centropłacie mieści się ok. 140 000 litrów. Paliwo w skrzydłach odciąża je – jego ciężar działa przeciwnie do siły nośnej.' },
  droop: { name: 'nosek opuszczany', desc: 'Część krawędzi natarcia przy kadłubie, która przy starcie i lądowaniu opuszcza się w dół bez otwierania szczeliny. Zwiększa wygięcie profilu, a gładka powierzchnia nie zaburza przepływu przed silnikiem.' },
  slat: { name: 'sloty', desc: 'Ruchome segmenty krawędzi natarcia. Wysuwają się do przodu i w dół, otwierając szczelinę: szybki strumień spod skrzydła zasila górną powierzchnię i opóźnia oderwanie, więc skrzydło znosi większy kąt natarcia.' },
  flap: { name: 'klapy', desc: 'Klapy typu Fowlera na krawędzi spływu. Wysuwają się po szynach do tyłu i w dół: zwiększają powierzchnię i wygięcie skrzydła. Przy starcie wychylają się trochę, przy lądowaniu – maksymalnie.' },
  spoiler: { name: 'spojlery', desc: 'Płyty na górnej powierzchni przed klapami. Podniesione psują opływ: w locie hamują i pomagają lotkom w przechylaniu, a po przyziemieniu gaszą siłę nośną, żeby koła mocno docisnęły pas i hamulce działały.' },
  aileron: { name: 'lotki', desc: 'Powierzchnie sterowe na zewnętrznej części krawędzi spływu. Wychylają się przeciwnie na obu skrzydłach: jedna zwiększa siłę nośną, druga zmniejsza – samolot się przechyla.' },
  canoe: { name: 'owiewki prowadnic klap', desc: 'Opływowe osłony pod skrzydłem, potocznie „kajaki”. Kryją szyny i mechanizmy, po których wysuwają się klapy. Ich kształt dobiera się tak, by przy okazji zmniejszały opór przy dużej prędkości.' },
  winglet: { name: 'winglet', desc: 'Zagięta w górę końcówka skrzydła. Osłabia wir brzegowy – przelewanie się powietrza spod skrzydła na górę – i zmniejsza opór indukowany, co daje kilka procent oszczędności paliwa.' },
  dis: { name: 'wyładowniki statyczne', desc: 'Cienkie pręciki na krawędzi spływu. Odprowadzają do powietrza ładunek elektryczny gromadzony przez tarcie powietrza o samolot, który inaczej zakłócałby łączność radiową.' },
  panel: { name: 'włazy rewizyjne zbiorników', desc: 'Owalne pokrywy w dolnym poszyciu, między dźwigarami. Po opróżnieniu i przewietrzeniu zbiornika mechanik zdejmuje je i wchodzi do kesonu, żeby obejrzeć konstrukcję, pompy i czujniki paliwa. Owal nie ma narożników, w których mogłyby zaczynać się pęknięcia.' },
  vent: { name: 'wlot odpowietrzenia zbiornika', desc: 'Płaski, zagłębiony wlot typu NACA pod końcem skrzydła. Łączy zbiorniki z atmosferą, żeby przy tankowaniu, zużywaniu paliwa i zmianie wysokości ciśnienie w nich nie rosło ani nie spadało. Kształt NACA wpuszcza powietrze, prawie nie zwiększając oporu.' },
  walk: { name: 'pas do chodzenia', desc: 'Obrysowany obszar na górze skrzydła przy kadłubie. Tylko tu poszycie jest przygotowane na ciężar człowieka – np. przy przeglądach albo ewakuacji przez wyjście nad skrzydłem. Poza nim widnieje napis NO STEP.' },
  light: { name: 'światła zewnętrzne', desc: 'Na krawędzi natarcia końcówki: światła pozycyjne (czerwone po lewej, zielone po prawej) i białe strobo; na krawędzi spływu – białe pozycyjne. Przy kadłubie, w krawędzi natarcia pod przezroczystą osłoną – dwa reflektory lądowania, zapalane przy starcie i podejściu.' },
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

function Lbl({ pos, children, color = '#e2e8f0', sub = false, link = false, occlude = false, onClick, onHover, active = false }: { pos: V3; children: ReactNode; color?: string; sub?: boolean; link?: boolean; occlude?: boolean; onClick?: () => void; onHover?: (on: boolean) => void; active?: boolean }) {
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
function Fuselage({ open, apu = false }: { open: boolean; apu?: boolean }) {
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
    for (const side of [1, -1])
      for (const pane of CK_PANES) {
        const at = (q: P2, inset: number) => fusPt(q[0], (side * q[1]) / CK_R, inset);
        const inner = densify(ckPoly(pane, -0.045));
        const outer = densify(ckPoly(pane, 0.045));
        frameG.push(strip(outer.map((q) => at(q, -0.004)), inner.map((q) => at(q, -0.004))));
        wallG.push(strip(inner.map((q) => at(q, -0.002)), inner.map((q) => at(q, 0.04))));
        const tris = THREE.ShapeUtils.triangulateShape(inner.map((q) => new THREE.Vector2(q[0], q[1])), []);
        const gl = new THREE.BufferGeometry();
        gl.setAttribute('position', new THREE.Float32BufferAttribute(inner.flatMap((q) => at(q, 0.04)), 3));
        gl.setIndex(tris.flat());
        gl.computeVertexNormals();
        glassG.push(gl);
      }
    const cockpit = merge(glassG);
    const ckWall = merge(wallG);
    const ckFrame = merge(frameG);
    // ciemne wnętrze kabiny pilotów widoczne przez szyby
    const ckTub = grid(refine([CK_TIP + 1.3, CK_TIP + 4.6], 0.15), refine([-Math.PI, Math.PI], 0.12), (x, th) => fusPt(x, th, 0.14));
    const ckBoxes = [
      box([CK_TIP + 2.85, -0.05, 0], [0.7, 0.5, 2.4], [0, 0, -0.45]), // pulpit z ekranami
      box([CK_TIP + 2.6, 0.27, 0], [0.4, 0.1, 2.0], [0, 0, -0.2]), // osłona przeciwodblaskowa
      ...[-0.55, 0.55].flatMap((z) => [box([CK_TIP + 3.75, FLOOR + 0.55, z], [0.55, 0.12, 0.5]), box([CK_TIP + 4.05, FLOOR + 0.98, z], [0.1, 0.8, 0.5], [0, 0, -0.18])]),
    ];
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
      /** Ścianka od brzegu w owiewce w górę i do środka (do z ≤ 2,9) – cała zostaje wewnątrz owiewki. */
      const wallIn = (edge: V3[], topY: number) =>
        grid([0, 1], edge.map((_, i) => i), (v, i) => {
          const q = edge[i];
          const zi = Math.sign(q[2]) * Math.min(Math.abs(q[2]), 2.9);
          return [q[0], q[1] + (topY - q[1]) * v, q[2] + (zi - q[2]) * v];
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
        roofAt(F.x0, F.x1, zz(B.z1 - 0.05), zz(Math.min(zTop, 2.9)), -0.75),
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
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
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
    for (const [cx, hw, hgt] of [
      [-20.5, 1.4, 1.62],
      [12.8, 1.4, 1.62],
      [16.6 + PA, 0.5, 0.95],
    ]) {
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
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
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
    // sondy Pitota i czujniki kąta natarcia pod kokpitem (po obu stronach)
    const probes: { a: V3; b: V3; c: V3 }[] = [];
    for (const side of [1, -1])
      for (const [x, y] of [
        [-30.55 - PF, -0.55],
        [-30.15 - PF, -1.05],
      ]) {
        const th = fusTheta(x, y) * side;
        const p = fusPt(x, th);
        const n = fusNormal(x, th);
        const b: V3 = [p[0] + n.x * 0.16, p[1] + n.y * 0.16, p[2] + n.z * 0.16];
        probes.push({ a: p, b, c: [b[0] - 0.2, b[1] + 0.01, b[2]] });
      }
    /** Płaski element na poszyciu: położenie (x, θ), oś y wzdłuż normalnej kadłuba, rozmiar sz. */
    const flat = (x: number, th: number, sz: V3, lift = 0.004) => {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), fusNormal(x, th));
      return new THREE.Matrix4().compose(new THREE.Vector3(...fusPt(x, th, -lift)), q, new THREE.Vector3(...sz));
    };
    // porty ciśnienia statycznego: po trzy płaskie otworki na każdej burcie za kokpitem (dla prędkościomierza i wysokościomierza)
    const statics: THREE.Matrix4[] = [];
    for (const side of [1, -1])
      for (const [d, y] of [
        [5.55, -0.3],
        [5.8, -0.3],
        [5.55, -0.55],
      ] as const) {
        const x = CK_TIP + d;
        statics.push(flat(x, fusTheta(x, y) * side, [0.1, 0.006, 0.1]));
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
    return { shell, full, cut, apuCut, cockpit, ckWall, ckFrame, ckTub, ckBoxes, fairing, bellySeams, bays, legBays, wins, doorWins, doors, joints, ant, probes, statics, masts, ramAir, outflow, win: new THREE.CircleGeometry(1, 28), frame: new THREE.RingGeometry(1.0, 1.28, 28) };
  }), []);
  const shell = useShared(g.shell, open ? g.cut : apu ? g.apuCut : g.full);
  const unit = cached('unit-box', () => new THREE.BoxGeometry(1, 1, 1));
  return (
    <group>
      <mesh geometry={shell}>
        <M k="paint" side={THREE.DoubleSide} />
      </mesh>
      {/* szyby kokpitu: półprzezroczyste, w czarnej ramce; za nimi ciemna kabina pilotów */}
      <mesh geometry={g.ckTub}>
        <M k="#14181d" side={THREE.BackSide} />
      </mesh>
      <Inst geo={unit} mats={g.ckBoxes} k="#2a3038" />
      <mesh geometry={g.ckWall}>
        <M k="#1a1f25" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.ckFrame}>
        <M k="#0b0e12" side={THREE.DoubleSide} />
      </mesh>
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
      <mesh geometry={g.bays} raycast={() => null}>
        <M k="#15191e" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.legBays} raycast={() => null}>
        <M k="cove" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.doors}>
        <M k="seam" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.joints}>
        <M k="#c8cdd3" side={THREE.DoubleSide} />
      </mesh>
      <Inst geo={g.win} mats={g.wins} k="glass" />
      <Inst geo={g.frame} mats={g.wins} k="#aab2bb" />
      <Inst geo={g.win} mats={g.doorWins} k="glass" />
      <Inst geo={unit} mats={g.ant} k="#c3c9d0" />
      {/* drobne elementy poszycia: porty statyczne, maszty odpływowe, wloty klimatyzacji, zawór wylotowy */}
      <Inst geo={cached('disc', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 28))} mats={g.statics} k="#3b4048" />
      <Inst geo={unit} mats={g.masts} k="#9aa3ad" />
      <Inst geo={unit} mats={g.ramAir} k="#262b31" />
      <Inst geo={unit} mats={g.outflow} k="#5b636c" />
      {open && (
        <>
          <Lbl pos={fusPt(CK_TIP + 5.7, fusTheta(CK_TIP + 5.7, -0.4), -0.6)} sub>
            porty ciśnienia statycznego
          </Lbl>
          <Lbl pos={[-30.4 - PF, -1.6, 3.0]} sub>
            rurki Pitota i czujniki kąta natarcia
          </Lbl>
          <Lbl pos={[-6.6, -4.7, 1.6]} sub>
            wloty powietrza klimatyzacji
          </Lbl>
          <Lbl pos={[-19.5 - PF, -3.6, 0.6]} sub>
            maszt odpływowy
          </Lbl>
          <Lbl pos={[15.2 + PA, -2.6, -2.2]} sub>
            zawór wylotowy kabiny
          </Lbl>
        </>
      )}
      {g.probes.map((pr, i) => (
        <group key={i}>
          <Strut a={pr.a} b={pr.b} r={0.022} />
          <Strut a={pr.b} b={pr.c} r={0.018} />
        </group>
      ))}
      {/* światła antykolizyjne (czerwone, migające) na grzbiecie i pod owiewką oraz białe strobo w stożku ogonowym */}
      <Lamp p={fusPt(-1.5, 0)} n={[0, 1, 0]} color="#ff2a1a" r={0.16} halo={2.4} blink="beacon" />
      <Lamp p={[-3.0, -4.4, 0]} n={[0, -1, 0]} color="#ff2a1a" r={0.16} halo={2.4} blink="beacon" />
      <Lamp p={[33.1 + PA, 1.62, 0]} n={[1, 0.05, 0]} color="#ffffff" r={0.09} halo={4.4} blink="strobe1" sector={SECTOR.tailStrobe} />
      {open && <Interior />}
    </group>
  );
}

/** Wiele jednakowych brył w jednym wywołaniu rysowania. */
function Inst({ geo, mats, k, side }: { geo: THREE.BufferGeometry; mats: THREE.Matrix4[]; k: string; side?: THREE.Side }) {
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
      <M k={k} side={side} />
    </instancedMesh>
  );
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
function Interior() {
  const d = useMemo(() => cached('interior', () => {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const liner = grid(
      refine([-28.6 - PF, 21 + PA], 0.45),
      FUS_TH,
      (x, th) => fusPt(x, th, 0.16),
      FUS_CUT,
    );
    // wręgi co ok. 0,6 m (pierścienie o kształcie przekroju)
    const ring = new THREE.TorusGeometry(1, 0.03, 4, 72);
    ring.rotateY(Math.PI / 2);
    const frames: THREE.Matrix4[] = [];
    for (let x = -28 - PF; x <= 20.5 + PA; x += 0.62) {
      const { yc, h, w } = fusSec(x);
      frames.push(box([x, yc, 0], [1, h - 0.08, w - 0.08]));
    }
    const half = (y: number, x = 0) => {
      const th = fusTheta(x, y);
      return fusPt(x, th)[2] - 0.2;
    };
    const fl = half(FLOOR);
    const floor = [box([-4.2 + (PA - PF) / 2, FLOOR - 0.06, 0], [48.6 + PF + PA, 0.12, 2 * fl])];
    // kokpit: podłoga, fotele pilotów, pulpit
    const cockpit = [box([-30.2 - PF, FLOOR + 0.05, 0], [3.2, 0.1, 2.6]), box([-31.0 - PF, FLOOR + 0.95, 0], [0.5, 0.35, 2.2], [0, 0, -0.5])];
    const pilotSeats = [-0.55, 0.55].flatMap((z) => [box([-30.1 - PF, FLOOR + 0.55, z], [0.55, 0.12, 0.5]), box([-29.82 - PF, FLOOR + 0.95, z], [0.1, 0.75, 0.5], [0, 0, -0.18])]);
    // klasa biznes 1-2-1: fotele-łóżka ustawione skośnie („jodełka”), każdy przodem do swojego przejścia,
    // w kabinie z osłoną prywatności; rozstaw rzędów ok. 2 m. Klasa ekonomiczna 3-3-3.
    const seatJ: THREE.Matrix4[] = [];
    for (let x = -24.6 - PF; x <= -17.4; x += 2.0)
      for (const z of [-2.15, -0.45, 0.45, 2.15]) {
        // fotel przy oknie patrzy skośnie ku przejściu, środkowe – ku przejściu po swojej stronie
        const th = Math.sign(z) * (Math.abs(z) > 1 ? -0.36 : 0.36);
        // punkt w układzie fotela (dx – do przodu/tyłu, dz – w bok) → układ kadłuba
        const at = (dx: number, dy: number, dz: number): V3 => [x + dx * Math.cos(th) + dz * Math.sin(th), FLOOR + dy, z - dx * Math.sin(th) + dz * Math.cos(th)];
        seatJ.push(box(at(0, 0.45, 0), [1.25, 0.18, 0.6], [0, th, 0])); // siedzisko z podnóżkiem
        seatJ.push(box(at(0.58, 0.9, 0), [0.14, 0.95, 0.6], [0, th, -0.12])); // oparcie
        seatJ.push(box(at(-0.05, 0.62, 0.38), [1.5, 0.75, 0.06], [0, th, 0])); // osłona prywatności od strony okna/sąsiada
        seatJ.push(box(at(0.35, 0.68, -0.4), [0.5, 0.42, 0.18], [0, th, 0])); // konsola z podłokietnikiem od przejścia
      }
    const seatY: THREE.Matrix4[] = [];
    const heads: THREE.Matrix4[] = [];
    const zs = [-2.42, -1.95, -1.48, -0.47, 0, 0.47, 1.48, 1.95, 2.42];
    for (let x = -14.2; x <= 16.5 + PA; x += 0.81) {
      if (DOORS.some((dd) => Math.abs(dd - x) < 1.1)) continue;
      for (const dz of zs) {
        const z = dz * Math.min(1, half(FLOOR + 0.6, x) / 2.75);
        seatY.push(box([x, FLOOR + 0.44, z], [0.46, 0.1, 0.44]));
        seatY.push(box([x + 0.24, FLOOR + 0.78, z], [0.09, 0.62, 0.44], [0, 0, -0.14]));
        heads.push(box([x + 0.285, FLOOR + 1.03, z], [0.1, 0.17, 0.445], [0, 0, -0.14]));
      }
    }
    // schowki nad głowami i kuchnie/toalety przy drzwiach
    const bins: THREE.Matrix4[] = [];
    for (let x = -24.4 - PF; x <= 17 + PA; x += 1.72) {
      bins.push(box([x, 1.2, 2.2], [1.64, 0.42, 0.62], [0.35, 0, 0]));
      bins.push(box([x, 1.2, -2.2], [1.64, 0.42, 0.62], [-0.35, 0, 0]));
      if (x > -16) bins.push(box([x, 1.72, 0], [1.64, 0.4, 1.1]));
    }
    const galleys = DOORS.flatMap((dx) => [box([dx + 1.15, FLOOR + 1.0, 0], [1.0, 2.0, 2.4])]);
    // luk bagażowy: podłoga i kontenery LD3 po dwa obok siebie
    const CARGO = -2.45;
    const ch = half(CARGO + 0.1) + 0.05;
    const holds: [number, number][] = [
      [-22.5 - PF, -8.0],
      // tylny luk kończy się tam, gdzie spód kadłuba zaczyna się podnosić ku ogonowi (dalej kontenery wystawałyby z poszycia)
      [4.6, 9.6 + PA],
    ];
    const cargoFloor = holds.map(([a, b]) => box([(a + b) / 2, CARGO - 0.05, 0], [b - a, 0.1, 2 * ch]));
    const cans: THREE.Matrix4[] = [];
    for (const [a, b] of holds)
      for (let x = a + 0.85; x <= b - 0.8; x += 1.66)
        for (const z of [-0.82, 0.82]) cans.push(box([x, CARGO + 0.55, z * Math.min(1, ch / 1.75)], [1.56, 1.1, 1.55]));
    // centropłat (keson między dźwigarami przy kadłubie) i wnęka podwozia głównego
    const xF = wLE(W_SIDE) + S_FS * (wTE(W_SIDE) - wLE(W_SIDE));
    const xR = wLE(W_SIDE) + S_RS * (wTE(W_SIDE) - wLE(W_SIDE));
    const centre = [box([(xF + xR) / 2, W_Y0 + 0.05, 0], [xR - xF, 1.45, 2 * W_SIDE + 0.3])];
    const bay = [box([1.8, -2.4, 0], [5.2, 1.3, 4.6])];
    // tylna gródź ciśnieniowa – kopuła zamykająca kabinę
    const bulk = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.6);
    bulk.rotateZ(-Math.PI / 2);
    const bs = fusSec(21.2 + PA);
    const bulkM = [box([20.6 + PA, bs.yc, 0], [1.2, bs.h - 0.15, bs.w - 0.15])];
    return { unit, liner, ring, frames, floor, cockpit, pilotSeats, seatJ, seatY, heads, bins, galleys, cargoFloor, cans, centre, bay, bulk, bulkM };
  }), []);
  return (
    <group>
      <mesh geometry={d.liner}>
        <M k="liner" side={THREE.DoubleSide} />
      </mesh>
      <Inst geo={d.ring} mats={d.frames} k="dark" />
      <Inst geo={d.unit} mats={d.floor} k="carpet" />
      <Inst geo={d.unit} mats={d.cockpit} k="dark" />
      <Inst geo={d.unit} mats={d.pilotSeats} k="#20242a" />
      <Inst geo={d.unit} mats={d.seatJ} k="seatJ" />
      <Inst geo={d.unit} mats={d.seatY} k="seatY" />
      <Inst geo={d.unit} mats={d.heads} k="#e5e7eb" />
      <Inst geo={d.unit} mats={d.bins} k="bin" />
      <Inst geo={d.unit} mats={d.galleys} k="#d9d4c8" />
      <Inst geo={d.unit} mats={d.cargoFloor} k="#6b7280" />
      <Inst geo={d.unit} mats={d.cans} k="can" />
      <Inst geo={d.unit} mats={d.centre} k="primer" />
      <Inst geo={d.unit} mats={d.bay} k="#565d66" />
      <Inst geo={d.bulk} mats={d.bulkM} k="primer" side={THREE.DoubleSide} />
      <Lbl pos={[-30.4 - PF, 1.4, 1.4]}>kokpit</Lbl>
      <Lbl pos={[-23.0, 1.0, 1.9]}>klasa biznes</Lbl>
      <Lbl pos={[0.5, 0.6, 2.3]}>klasa ekonomiczna 3-3-3</Lbl>
      <Lbl pos={[9.0, 1.75, 2.6]} sub>
        schowki
      </Lbl>
      <Lbl pos={[-17.0, -2.2, 2.4]}>luk bagażowy (przedni)</Lbl>
      <Lbl pos={[-4.6, -1.0, 2.0]} color="#bef264">
        centropłat
      </Lbl>
      <Lbl pos={[1.8, -3.4, 2.4]}>wnęka podwozia</Lbl>
      <Lbl pos={[11.0, -2.2, 2.4]}>luk bagażowy (tylny)</Lbl>
      <Lbl pos={[20.8 + PA, 0.6, 1.6]} color="#bef264">
        gródź ciśnieniowa
      </Lbl>
      <Lbl pos={[DOORS[1], FLOOR + 2.3, 3.2]} sub>
        drzwi 2
      </Lbl>
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
function Wing({ open, animate, ctlAnim = false, mech, canoes = true, side = 1, surfaces }: { open: boolean; animate: boolean; ctlAnim?: boolean; mech?: Mech; canoes?: boolean; side?: number; surfaces?: { aileron: number; spoiler?: number } }) {
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
    const cutG = grid(ss, rs, (s, r) => sp(WING, r, s, 1), upSkip(true));
    const cut = cutG.getIndex()!.clone();
    cutG.dispose();
    const lower = grid(ss, rs, (s, r) => sp(WING, r, s, -1), loSkip);
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
            const th = -(k / 13) * 0.34;
            const dx = att[0] - piv[0];
            const dy = att[1] - piv[1];
            return new THREE.Vector3(piv[0] + dx * Math.cos(th) - dy * Math.sin(th), piv[1] + dx * Math.sin(th) + dy * Math.cos(th), att[2]);
          });
          return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.045, 6, false);
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
    return { upper, full, cut, lower, tip, coves, fixedNose, movers, canoes, seamUp, seamLo, dis, panels, panelRims, vent, walk, holeEdge, rivets };
  }), []);
  const rod = cached('rod', () => {
    const c = new THREE.CylinderGeometry(1, 0.6, 1, 6);
    c.rotateZ(-Math.PI / 2);
    c.translate(0.5, 0, 0);
    return c;
  });
  // owalna płytka (walec o średnicy i wysokości 1) – włazy rewizyjne i wlot odpowietrzenia
  const disc = cached('disc', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 28));
  const upper = useShared(g.upper, open ? g.cut : g.full);
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
        <mesh geometry={g.lower}>
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
    const apu = podLoft(refine([32.6 + PA, 33.5 + PA], 0.1), () => ({ yc: 1.2, h: 0.34, zc: 0, w: 0.34 }), 2, 24);
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
  vtp: { name: 'statecznik pionowy', desc: 'Stała część usterzenia pionowego, ok. 10 m nad kadłubem. W środku ma keson z dźwigarami i żebrami z kompozytu węglowego. Działa jak lotka strzały: gdy samolot zacznie lecieć bokiem, napływ z boku obraca nos z powrotem w kierunku lotu (stateczność kierunkowa).' },
  rudder: { name: 'ster kierunku', desc: 'Jednoczęściowa powierzchnia na tylnej krawędzi statecznika pionowego. Odchyla nos w lewo lub w prawo – koordynuje zakręty, pomaga przy lądowaniu z bocznym wiatrem i równoważy ciąg, gdy jeden silnik stanie. Komputery sterowania zmniejszają dopuszczalne wychylenie wraz z prędkością, żeby nie przeciążyć statecznika.' },
  rudderAct: { name: 'siłowniki steru kierunku', desc: 'Trzy siłowniki wewnątrz statecznika, przy linii zawiasów (pokazane prześwietlone). Cylinder jest przymocowany do tylnego dźwigara statecznika, a tłoczysko do okucia na sterze. Każdy ma inne źródło zasilania, więc ster działa także po awarii jednego układu.' },
  htp: { name: 'statecznik poziomy (przestawiany)', desc: 'Statecznik poziomy przestawiany w całości – w dokumentacji oznaczany skrótem THS. Obraca się powoli o kilka stopni wokół osi na tylnym dźwigarze – tak samolot jest wyważany przy zmianie prędkości, konfiguracji klap i położenia środka ciężkości. Dzięki temu stery wysokości mogą wrócić do położenia neutralnego. W animacji widać ten wolny ruch.' },
  elevator: { name: 'ster wysokości', desc: 'Po jednym na każdej połówce statecznika poziomego. Służą do szybkich zmian pochylenia: wychylenie w górę dociska ogon i podnosi nos, w dół – odwrotnie. Długotrwałe wyważenie przejmuje przestawny statecznik.' },
  elevAct: { name: 'siłowniki sterów wysokości', desc: 'Po dwa na każdy ster, wewnątrz statecznika poziomego (pokazane prześwietlone). Zasilane z różnych układów: gdy jeden zawiedzie, drugi przejmuje pracę, a pierwszy przechodzi w tryb tłumienia, żeby ster nie trzepotał.' },
  thsPivot: { name: 'oś obrotu statecznika', desc: 'Okucia na tylnym dźwigarze statecznika poziomego, wewnątrz stożka ogonowego. Statecznik obraca się wokół nich jak na zawiasie, a przednią krawędzią porusza śruba trymera.' },
  thsJack: { name: 'śruba trymera statecznika', desc: 'Śruba toczna z nakrętką zamocowaną na przednim dźwigarze statecznika. Napędzają ją silniki przez przekładnię u dołu: obrót śruby podnosi albo opuszcza krawędź natarcia statecznika. Śruba jest samohamowna – bez napędu statecznik zostaje tam, gdzie był.' },
  dis: { name: 'wyładowniki statyczne', desc: 'Cienkie pręciki na krawędziach spływu sterów (i skrzydeł). W locie samolot elektryzuje się od tarcia powietrza, kropel i kryształków lodu – wyładowniki oddają ten ładunek do powietrza po trochu i z dala od anten, żeby wyładowania nie zakłócały łączności radiowej.' },
  dorsal: { name: 'płetwa grzbietowa', desc: 'Opływowe przejście grzbietu kadłuba w krawędź natarcia statecznika pionowego. Poprawia opływ statecznika przy dużym ślizgu (np. po awarii silnika) i łagodnie wprowadza obciążenia z nasady statecznika w kadłub.' },
  aileron: { name: 'lotki', desc: 'Dwie lotki na krawędzi spływu każdego skrzydła, przy końcówce. Działają przeciwsobnie: na jednym skrzydle wychylają się w dół (więcej siły nośnej), na drugim w górę (mniej) – samolot przechyla się wokół osi podłużnej. To trzecia oś sterowania obok steru kierunku i sterów wysokości. W A350 lotki wychylają się też lekko w dół razem z klapami, żeby zwiększyć siłę nośną przy starcie i lądowaniu.' },
  spoiler: { name: 'spojlery (pomoc lotkom)', desc: 'Płyty na górnej powierzchni skrzydła przed klapami. Przy przechylaniu unoszą się tylko na skrzydle, które ma opaść (tam, gdzie lotka idzie w górę): psują tam siłę nośną i dokładają oporu, więc przechylanie jest szybsze, a odchylenie niekorzystne mniejsze. Po wylądowaniu wszystkie podnoszą się naraz jako hamulce aerodynamiczne.' },
  tailLights: { name: 'światła logo', desc: 'Reflektory w górnej powierzchni stateczników poziomych, przy kadłubie. Oświetlają logo linii na stateczniku pionowym – w nocy na postoju oraz przy starcie i lądowaniu, żeby samolot był lepiej widoczny.' },
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
export const PLANE_LEVELS = { ground: GROUND, floor: FLOOR, cargo: -2.45 };

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
 * Kąt obrotu goleni głównej przy chowaniu (do środka kadłuba). Nieco mniej niż 90°: schowany wózek leży trochę niżej,
 * więc górny rząd kół zostaje pod podłogą kabiny.
 */
const MAIN_SWING = (85 * Math.PI) / 180;
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
          {/* reflektory kołowania i startu na goleni */}
          {[0.12, -0.12].map((z) => (
            <group key={z}>
              <mesh position={[nx - 0.17, -3.85, z]}>
                <boxGeometry args={[0.12, 0.16, 0.16]} />
                <M k="dark" />
              </mesh>
              <Lamp p={[nx - 0.235, -3.85, z]} n={[-1, -0.08, 0]} color="#fff6dc" r={0.055} halo={1.6} isOn={() => Boolean(drive?.lights)} sector={SECTOR.taxi} bezel={false} beam={{ len: 30, half: 0.16, dir: [-1, -0.11, 0] }} />
            </group>
          ))}
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
            <mesh geometry={doors.main} position={[0, -doors.mainHingeY, -BAY_MAIN.z0]}>
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
          {/* goleń obraca się do środka kadłuba wokół osi przegubu (wzdłuż kadłuba) */}
          <group ref={(g) => (swing.current[si] = g)} position={[mx, top, mz]}>
            <group position={[-mx, -top, -mz]}>
              {/* czop przegubu wzdłuż osi obrotu goleni (wzdłuż kadłuba) – przy chowaniu obraca się w miejscu */}
              <mesh position={[mx, top - 0.02, mz]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.09, 0.09, 0.56, 16]} />
                <M k={GEAR_GREY} />
              </mesh>
              <Strut a={[mx, top, mz]} b={[mx, MAIN_CYL_END, mz]} r={0.22} k={GEAR_GREY} />
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
                <group ref={(g) => (bogie.current[si] = g)} position={[mx, wy + 0.12, mz]}>
                  <group position={[-mx, -(wy + 0.12), -mz]}>
                    <mesh position={[mx, wy + 0.06, mz]}>
                      <boxGeometry args={[4.3, 0.26, 0.28]} />
                      <M k={GEAR_GREY} />
                    </mesh>
                    {[-1.5, 0].map((dx) => (
                      <Pin key={dx} p={[mx + dx, wy, mz]} r={0.095} len={1.5} />
                    ))}
                    {/* przewody hamulców wzdłuż belki wózka */}
                    <Pipe pts={[[mx + 0.3, wy + 0.2, mz + 0.16], [mx + 1.5, wy + 0.16, mz + 0.2], [mx + 1.5, wy + 0.05, mz + 0.45]]} />
                    <Pipe pts={[[mx - 0.3, wy + 0.2, mz + 0.16], [mx - 1.5, wy + 0.16, mz + 0.2], [mx - 1.5, wy + 0.05, mz + 0.45]]} />
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
  leg: { name: 'goleń z amortyzatorem', group: 'główne', desc: 'Główna kolumna podwozia przymocowana przegubem do konstrukcji skrzydła i kadłuba. W środku jest amortyzator olejowo-gazowy: cylinder z azotem i olejem. Przenosi cały ciężar samolotu na postoju i siłę uderzenia przy przyziemieniu.' },
  piston: { name: 'tłoczysko', group: 'główne', desc: 'Chromowana, wypolerowana rura wsuwająca się w cylinder amortyzatora. Gładka powierzchnia pozwala uszczelkom szczelnie trzymać gaz i olej. W powietrzu tłoczysko jest wysunięte, na postoju schowane w dużej części – po tym, ile go widać, mechanik ocenia napełnienie amortyzatora.' },
  torque: { name: 'nożyce', group: 'główne', desc: 'Dwa ramiona połączone przegubem z przodu goleni. Łączą cylinder z tłoczyskiem tak, żeby tłoczysko mogło się wsuwać i wysuwać, ale nie obracać – inaczej koła mogłyby się skręcić względem goleni.' },
  stay: { name: 'zastrzał boczny z zamkiem', group: 'główne', desc: 'Składane ramię podpierające goleń z boku. Po wypuszczeniu podwozia prostuje się i blokuje zamkiem (dwa krótkie ogniwa ze sprężynami), więc goleń nie może się złożyć pod obciążeniem. Przy chowaniu siłownik odblokowuje zamek, a zastrzał składa się w kolanie.' },
  bogie: { name: 'wózek', group: 'główne', desc: 'Belka z trzema osiami i sześcioma kołami – cecha wersji -1000, cięższej od -900 (ta ma cztery koła na wózku). Więcej kół rozkłada ciężar na większą powierzchnię, więc samolot nie niszczy nawierzchni pasów i dróg kołowania. Wózek jest zawieszony przegubowo na końcu tłoczyska, żeby wszystkie koła stały na nierównej nawierzchni.' },
  pitch: { name: 'siłownik ustawiający wózek', group: 'główne', desc: 'Hydrauliczny siłownik między goleń a wózkiem. W powietrzu trzyma wózek pochylony (przednia oś niżej), żeby przy przyziemieniu koła dotykały pasa po kolei, a przed schowaniem ustawia go tak, by sześć kół zmieściło się we wnęce.' },
  rear: { name: 'tylna oś skrętna', group: 'główne', desc: 'Tylna oś każdego wózka może się lekko skręcać – w przeciwną stronę niż koło przednie. Przy ciasnych zakrętach opony mniej się ścierają, a wózek nie szoruje bokiem po płycie. Steruje nią automatycznie ten sam układ, co kołem przednim.' },
  hyd: { name: 'przewody hydrauliczne', group: 'główne', desc: 'Sztywne rurki i elastyczne węże biegnące wzdłuż goleni i belki wózka. Doprowadzają płyn pod ciśnieniem do hamulców każdego koła i do siłowników. Na złączach ruchomych są węże, które wyginają się przy pracy amortyzatora i przy chowaniu.' },
  doors: { name: 'drzwi wnęk podwozia', group: 'główne', desc: 'Wnęki podwozia głównego są w owiewce centropłata pod kadłubem. Duże drzwi otwierają się tylko na czas chowania i wypuszczania, a potem zamykają – wnęka zostaje zakryta i nie zwiększa oporu. Mniejsza osłona przymocowana do goleni zamyka resztę otworu.' },
  brakes: { name: 'hamulce węglowe', group: 'koła i hamulce', desc: 'W każdym z dwunastu kół głównych jest pakiet tarcz z kompozytu węglowego: na przemian tarcze obracające się z kołem i nieruchome. Hydrauliczne tłoczki ściskają je przy hamowaniu. Węgiel jest lekki i znosi bardzo wysoką temperaturę – po hamowaniu tarcze nagrzewają się do kilkuset stopni.' },
  tyres: { name: 'opony', group: 'koła i hamulce', desc: 'Opony radialne pompowane azotem (nie powietrzem – azot nie podtrzymuje ognia i nie zawiera wilgoci) do ciśnienia ok. 14–15 barów, kilka razy więcej niż w samochodzie. Bieżnik ma tylko rowki wzdłuż obwodu, które odprowadzają wodę spod opony. W feldze są bezpieczniki termiczne: gdy hamulce za mocno ją nagrzeją, wypuszczają gaz, zanim opona mogłaby pęknąć.' },
  nose: { name: 'podwozie przednie', group: 'przednie', desc: 'Goleń z dwoma kołami pod kokpitem. Ma własny amortyzator i nożyce, a zastrzał przed nią blokuje ją po wypuszczeniu. Chowa się do przodu – gdyby zawiodła hydraulika, pęd powietrza pomaga ją wypuścić. Koła przednie nie mają hamulców.' },
  steer: { name: 'sterowanie kołem przednim', group: 'przednie', desc: 'Kołnierz na goleni z siłownikami hydraulicznymi obraca dolną część goleni z kołami. Pilot steruje kołem sterowym (tillerem) do ok. 70°, a pedałami steru kierunku – o kilka stopni przy większej prędkości na pasie. Przy holowaniu sterowanie się odłącza, żeby ciągnik mógł swobodnie skręcać kołem.' },
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

function Engine({ active, throttle, flow, running = false, power }: { active: boolean; throttle: number; flow: boolean; running?: boolean; power?: EnginePower }) {
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
        cut={active}
        fanScale={ENG_FS}
        fanBlades={22}
        flow={active && flow ? 'plain' : false}
        flowSpeed={0.25 + throttle * 1.1}
        labels={active}
        accessories={active}
        detail={active || near}
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
}

const ANCHOR: Record<PlanePart, V3> = {
  fuselage: [-12, 3.8, 0],
  wing: [12, 1.3, 18],
  engine: [-10.2, -2.2, W_ENG],
  // środek ogona: między sterem kierunku a sterami wysokości (podświetla się całe usterzenie z oboma sterami)
  tail: [28.6 + PA, 3.6, 0],
  gear: [1.3, -6.6, 6.2],
  // APU: przy wylocie w końcu stożka ogonowego (nieco niżej, żeby nie nachodzić na podpis usterzenia)
  apu: [34.2 + PA, 0.4, 0],
  // zalążki modułów – podpisy przy miejscu, którego dotyczą
  cockpit: [-34.5, 1.9, 1.3], // szyby kokpitu
  radar: [-37.5, -1.0, 0.5], // owiewka radaru w nosie
  packs: [-5, -4.9, 0], // pakiety klimatyzacji w owiewce przed skrzydłem (pod środkiem brzucha)
  fuel: [-1.2, 0.4, 9], // zbiorniki w skrzydle
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

function AirlinerBody({ focus = null, highlight = null, throttle = 0.6, flow = true, animate = true, layers = {}, clip = null, wingOpen, wingLabels, interactive = true, partLabels = true, wingPick, mech, linksFrom = null, links = true, inFlight = false, landingLights = false, surfaces, gear, gearPick, enginePower, hilite = null, morph = null }: AirlinerProps) {
  // dodatkowy wznios względem modelu: połówka skrzydła (z silnikiem) obraca się wokół osi kadłuba
  const wingTilt = morph ? morph.dihedral * (Math.PI / 180) - W_DIH : 0;
  const wingLift = morph ? morph.wingY : 0;
  const nav = useTopicNav();
  const show = (k: keyof NonNullable<AirlinerProps['layers']>) => layers[k] !== false;
  const root = useRef<THREE.Group>(null);
  // uniformy przycinania tworzone raz (shadery ich używają); zmiana zakresu – płynny dojazd, bez przebudowy
  const clipU = useMemo<ClipUniforms | null>(() => (clip ? { uInv: { value: new THREE.Matrix4() }, uClip: { value: new THREE.Vector3(clip.z0, clip.z1, clip.amp ?? 0.8) } } : null), [Boolean(clip)]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const k = 1 - Math.exp(-dt * 2.2);
    const u = clipU.uClip.value;
    u.x += (c.z0 - u.x) * k;
    u.y += (c.z1 - u.y) * k;
    u.z += ((c.amp ?? 0.8) - u.z) * k;
  });
  const [hover, setHover] = useState<PlanePart | null>(null);
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
  return (
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
      {show('fuselage') && part('fuselage', <Fuselage open={focus === 'fuselage'} apu={focus === 'apu'} />)}
      {show('tail') && part('tail', <Tail animate={focus === 'tail' && animate} surfaces={surfaces} open={focus === 'tail'} fin={morph ? morph.fin : 1} />)}
      {/* światła logo: w górnej powierzchni statecznika poziomego przy kadłubie, świecą na statecznik pionowy */}
      {show('tail') &&
        [1, -1].map((sg) => {
          const p = sp(HTP, 1.9, 0.32, 1);
          return <Lamp key={sg} p={[p[0], p[1], p[2] * sg]} n={[0.15, 1, -0.75 * sg]} color="#fff6dc" r={0.07} halo={1.4} on={inFlight} />;
        })}
      {/* podwozie zawsze: w locie (bez sterowania ze sceny) schowane we wnękach, z zamkniętymi drzwiami */}
      {/* na wycinkach skrzydła (plaster profilu, kawałek wokół silnika) podwozie nic nie wnosi – a tarcze hamulców mają
          własny materiał, który nie podlega przycinaniu, więc schowane koła prześwitywałyby przez plaster. Szeroki
          „wycinek” całego samolotu (z = ±60 m) obejmuje podwozie, więc wtedy jest rysowane */}
      {show('gear') && !(clip && (clip.z0 > -6 || clip.z1 < 6)) && part('gear', <GearCtx.Provider value={gear ?? (inFlight ? GEAR_STOWED : null)}><Gear /></GearCtx.Provider>)}
      {[1, -1].filter((sz) => sz > 0 || show('rightSide')).map((sz) => (
        <group key={sz} scale={[1, 1, sz]}>
          <group position={[0, W_Y0 + wingLift, 0]} rotation={[-wingTilt, 0, 0]}>
          <group position={[0, -W_Y0, 0]}>
          {part('wing', <Wing open={(focus === 'wing' || Boolean(wingOpen)) && sz > 0} animate={focus === 'wing' && animate} ctlAnim={focus === 'tail' && animate} mech={mech} canoes={show('canoes')} side={sz} surfaces={surfaces} />)}
          {(sz < 0 || show('leftEngine')) && part('engine', <Engine active={focus === 'engine' && sz > 0} throttle={throttle} flow={flow} running={inFlight} power={enginePower} />)}
          {/*
            Światła jak w A350, wbudowane w poszycie pod przezroczystymi osłonami:
            – w krawędzi natarcia końcówki, tuż przed wingletem: pozycyjne (czerwone po lewej, zielone po prawej) i strobo,
            – na krawędzi spływu końcówki: białe pozycyjne (tylne) i drugie strobo,
            – w krawędzi natarcia przy nasadzie skrzydła: dwa reflektory lądowania (świecą w locie),
            – na burcie przed skrzydłem: reflektor oświetlający krawędź natarcia i gondolę (kontrola oblodzenia).
          */}
          <Lamp p={mid(WING, LAMP_R, 0.004)} n={LAMP.navN} color={sz > 0 ? '#ff3b2f' : '#22e06b'} r={0.075} rx={1.9} halo={1.9} sector={SECTOR.nav} />
          <Lamp p={LAMP.strobeF} n={LAMP.navN} color="#ffffff" r={0.05} halo={4.2} blink="strobe" sector={SECTOR.strobeF} />
          <Lamp p={mid(WING, LAMP_R, 0.996)} n={LAMP.aftN} color="#ffffff" r={0.06} rx={1.5} halo={1.7} sector={SECTOR.tailNav} />
          <Lamp p={LAMP.strobeA} n={LAMP.aftN} color="#ffffff" r={0.045} halo={4} blink="strobe" sector={SECTOR.strobeA} />
          {/* reflektory lądowania: dwa reflektory w krawędzi natarcia przy kadłubie, pod przezroczystą osłoną w kształcie krawędzi */}
          <mesh geometry={landingCover()} renderOrder={2}>
            <M k="glass" side={THREE.DoubleSide} opacity={0.55} />
          </mesh>
          {LAMP.land.map((l, i) => (
            <Lamp key={i} p={l.p} n={l.n} color="#fff6dc" r={0.07} halo={3.2} on={landingLights} sector={SECTOR.landing} bezel={false} beam={landingLights ? { len: 45, half: 0.06, dir: [-1, -0.05, 0.07] } : undefined} />
          ))}
          <Lamp p={LAMP.scan.p} n={LAMP.scan.n} color="#fff6dc" r={0.07} halo={1.6} on={inFlight} sector={SECTOR.scan} />
          </group>
          </group>
        </group>
      ))}
      {(focus === 'wing' || wingLabels) && <WingLabels range={clip} />}
      {focus === 'tail' && <TailLabels />}
      {focus === 'gear' && show('gear') && !inFlight && !gear && <GearLabels pick={gearPick} />}
      {/* widok ogólny: tylko nazwy podzespołów (klikalne); szczegółowe podpisy dopiero w module podzespołu */}
      {interactive && partLabels && !focus &&
        (Object.keys(ANCHOR) as PlanePart[]).map((p) => (
          <Lbl
            key={p}
            occlude
            pos={ANCHOR[p]}
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
              pos={ANCHOR[p]}
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
    </HiliteCtx.Provider>
    </PickCtx.Provider>
    </ClipCtx.Provider>
    </GearCtx.Provider>
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
