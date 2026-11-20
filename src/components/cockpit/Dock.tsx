/*
 * Dok wyświetlaczy kokpitu w scenie 3D: zawsze w tym samym miejscu – przypięty do lewego dolnego rogu sceny,
 * niezależnie od kamery, żeby nie zasłaniał samolotu i nie skakał między zakładkami. Każda wizualizacja wkłada
 * do niego tylko istotne dla siebie ekrany (PFD, ND, ECAM z wybraną stroną).
 */
import type { ReactNode } from 'react';
import { Html } from '@react-three/drei';
import { useSceneHidden } from '../../lib/topicNav';

export function CockpitDock({ children }: { children: ReactNode }) {
  if (useSceneHidden()) return null;
  return (
    <Html calculatePosition={(_el, _cam, size) => [18, size.height - 64]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div className="cockpit-pair" style={{ transform: 'translateY(-100%)', alignItems: 'flex-end' }}>
        {children}
      </div>
    </Html>
  );
}
