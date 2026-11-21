import { createContext, useContext } from 'react';

/** Nawigacja po temacie dostępna ze sceny – np. kliknięcie silnika na modelu samolotu otwiera moduł silnika. */
export interface TopicNav {
  /** Otwiera podzespół (pierwszą albo wskazaną zakładkę). */
  openModule: (id: string, step?: number) => void;
  /** Wraca do widoku całości (pierwszy krok tematu albo wskazany). */
  openOverview: (step?: number) => void;
  /** Aktualnie otwarty podzespół (null – widok całości). */
  module: string | null;
  /**
   * Złota zasada modułów: true w widoku całości i na stronie głównej modułu (zakładka „0”). Tylko wtedy model jest
   * klikalny (przejścia do modułów i zakładek), a części mają podpisy z opisem; w zakładkach > 0 scena tylko pokazuje.
   */
  home: boolean;
}

export const TopicNavContext = createContext<TopicNav | null>(null);
export const useTopicNav = () => useContext(TopicNavContext);
/** Czy jesteśmy na stronie głównej modułu albo w widoku całości (poza tematem z modułami – zawsze true). */
export const useModuleHome = () => useContext(TopicNavContext)?.home ?? true;

/** true – scena jest trzymana w pamięci, ale niewidoczna (jej podpisy HTML i ramki informacji się nie pokazują). */
export const SceneHiddenContext = createContext(false);
export const useSceneHidden = () => useContext(SceneHiddenContext);
