/*
 * Dok kokpitu w scenie 3D – zawsze w tych samych miejscach, niezależnie od kamery i zakładki:
 * – wyświetlacze (PFD, ND, ECAM) w prawym górnym rogu sceny, tuż przy panelu bocznym (po zwinięciu panelu – przy
 *   prawej krawędzi); układ stały: u góry PFD po lewej i ND po prawej (gdy jest tylko jeden – sam), ECAM pod nimi
 *   przy prawej krawędzi,
 * – przełączniki (dźwignie, drążek, tiller, panele z przyciskami) w lewym dolnym rogu.
 * Każda wizualizacja wkłada do doku tylko istotne dla siebie elementy, a dok sam rozdziela je na oba miejsca.
 */
import { Children, Fragment, isValidElement, useEffect, useRef, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useSceneHidden } from '../../lib/topicNav';
import { COCKPIT_SCALE, useCockpitSize } from '../ui';
import { Pfd } from './Pfd';
import { Nd } from './Nd';
import { Ecam } from './Ecam';
import { SCREEN_W, ScreenWidth } from './common';

type Slot = 'pfd' | 'nd' | 'ecam' | 'controls';
/**
 * Rodzaj elementu: wyświetlacze po typie komponentu; komponent opakowujący ekran (np. ECAM złożony w scenie) może
 * się oznaczyć statycznym polem `cockpitSlot`. Wszystko inne to przełączniki.
 */
function slotOf(el: ReactElement): Slot {
  const t = el.type as unknown as { cockpitSlot?: Slot };
  if (el.type === Pfd) return 'pfd';
  if (el.type === Nd) return 'nd';
  if (el.type === Ecam) return 'ecam';
  return t?.cockpitSlot ?? 'controls';
}
/** Elementy doku jako płaska lista (fragmenty i tablice rozwinięte, puste pominięte). */
function flatten(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === Fragment) out.push(...flatten((c.props as { children?: ReactNode }).children));
    else out.push(c);
  });
  return out;
}
/** Miejsce zajmowane przez panel boczny po prawej (0, gdy zwinięty albo gdy panel nie leży na scenie – wąski ekran). */
function panelSpace() {
  if (typeof window === 'undefined' || window.innerWidth <= 900) return 0;
  const p = document.querySelector('.player');
  return p ? parseFloat(getComputedStyle(p).getPropertyValue('--panel-space')) || 0 : 0;
}

/**
 * Kotwica doku tuż przed kamerą. Html z drei chowa się, gdy jego punkt w scenie jest za kamerą – a dok i tak stoi
 * w stałym miejscu ekranu, więc jego punkt wiąże się z kamerą: wyświetlacze nie znikają przy żadnym ujęciu.
 */
function CameraAnchor({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const dir = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    const o = g.current;
    if (!o) return;
    camera.getWorldDirection(dir.current);
    const p = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir.current, 1);
    // pozycja w układzie rodzica (dok bywa w grupie przesuniętej albo obracanej)
    o.position.copy(o.parent ? o.parent.worldToLocal(p) : p);
    // priorytet −1: kotwica ustawia się przed Html-ami doku – inaczej przy pierwszej klatce stoją w środku układu, mogą
    // zostać uznane za „za kamerą” i (bo ich położenie na ekranie się nie zmienia) już się nie pokażą
  }, -1);
  return <group ref={g}>{children}</group>;
}

/*
 * Dodatkowy ekran doku (np. ECAM wybrany przez zakładkę, która pożycza scenę z innego modułu): dopina się do doku,
 * który scena już ma – wtedy stoi w jego układzie, pod PFD i ND – a gdy sceny nie mają doku, pokazuje się we własnym.
 * Ekran dodatkowy zastępuje ECAM sceny (dwa ECAM-y naraz byłyby mylące).
 */
const extra = { el: null as ReactElement | null, docks: 0, owners: [] as number[], subs: new Set<() => void>() };
let dockSeq = 0;
const notify = () => extra.subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  extra.subs.add(f);
  return () => extra.subs.delete(f);
};
export function DockExtra({ children }: { children: ReactElement }) {
  useEffect(() => {
    extra.el = children;
    notify();
  }, [children]);
  useEffect(
    () => () => {
      extra.el = null;
      notify();
    },
    [],
  );
  const docks = useSyncExternalStore(subscribe, () => extra.docks);
  return docks === 0 ? <CockpitDock solo>{children}</CockpitDock> : null;
}

export function CockpitDock({ children, solo = false }: { children: ReactNode; solo?: boolean }) {
  const scale = COCKPIT_SCALE[useCockpitSize()];
  const hidden = useSceneHidden();
  const id = useRef(0);
  if (!id.current) id.current = ++dockSeq;
  useEffect(() => {
    if (solo || hidden) return;
    const me = id.current;
    extra.docks++;
    extra.owners.push(me);
    notify();
    return () => {
      extra.docks--;
      extra.owners = extra.owners.filter((o) => o !== me);
      notify();
    };
  }, [solo, hidden]);
  const ex = useSyncExternalStore(subscribe, () => extra.el);
  // dodatkowy ekran dostaje tylko pierwszy dok sceny (gdy scena ma kilka – np. osobno ekrany i przełączniki)
  const owner = useSyncExternalStore(subscribe, () => extra.owners[0] ?? 0);
  if (hidden) return null;
  const items = solo || !ex || owner !== id.current ? children : [...flatten(children).filter((e) => slotOf(e) !== 'ecam'), ex];
  return (
    <CameraAnchor>
      <DockBody scale={scale}>{items}</DockBody>
    </CameraAnchor>
  );
}

function DockBody({ scale, children }: { scale: number; children: ReactNode }) {
  const items = flatten(children);
  const pick = (s: Slot) => items.filter((e) => slotOf(e) === s);
  const pfd = pick('pfd');
  const nd = pick('nd');
  const ecam = pick('ecam');
  const controls = pick('controls');
  const screens = pfd.length + nd.length + ecam.length > 0;
  return (
    <>
      {screens && (
        <Html calculatePosition={(_el, _cam, size) => [size.width - panelSpace() - 14, 64]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ transform: 'translateX(-100%)' }}>
            {/* wielkość z ustawień: skalowanie od prawego górnego rogu – wyświetlacze zostają przypięte w rogu */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, transform: `scale(${scale})`, transformOrigin: 'right top' }}>
              {pfd.length + nd.length > 0 && (
                // PFD i ND zawsze tej samej wielkości – wspólna szerokość dla obu ekranów
                <ScreenWidth.Provider value={SCREEN_W}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    {pfd}
                    {nd}
                  </div>
                </ScreenWidth.Provider>
              )}
              {ecam}
            </div>
          </div>
        </Html>
      )}
      {controls.length > 0 && (
        <Html calculatePosition={(_el, _cam, size) => [18, size.height - 64]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ transform: 'translateY(-100%)' }}>
            <div className="cockpit-pair" style={{ alignItems: 'flex-end', transform: `scale(${scale})`, transformOrigin: 'left bottom' }}>
              {controls}
            </div>
          </div>
        </Html>
      )}
    </>
  );
}
