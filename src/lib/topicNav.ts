import { createContext, useContext } from 'react';

/** Nawigacja po temacie dostępna ze sceny – np. kliknięcie silnika na modelu samolotu otwiera moduł silnika. */
export interface TopicNav {
  /** Otwiera podzespół (pierwszą albo wskazaną zakładkę). */
  openModule: (id: string, step?: number) => void;
  /** Wraca do widoku całości (pierwszy krok tematu albo wskazany). */
  openOverview: (step?: number) => void;
  /** Aktualnie otwarty podzespół (null – widok całości). */
  module: string | null;
}

export const TopicNavContext = createContext<TopicNav | null>(null);
export const useTopicNav = () => useContext(TopicNavContext);

/** true – scena jest trzymana w pamięci, ale niewidoczna (jej podpisy HTML i ramki informacji się nie pokazują). */
export const SceneHiddenContext = createContext(false);
export const useSceneHidden = () => useContext(SceneHiddenContext);
