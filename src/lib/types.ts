import type { ComponentType, ReactNode } from 'react';

/** Wartości parametrów sterujących sceną (suwaki, przełączniki, listy). */
export type ParamValue = number | boolean | string;
export type Params = Record<string, ParamValue>;

export type Control =
  | {
      type: 'slider';
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      default: number;
      unit?: string;
      /** Ile miejsc po przecinku pokazać (domyślnie zależnie od `step`). */
      decimals?: number;
    }
  | { type: 'toggle'; key: string; label: string; default: boolean }
  /** Duży przycisk przełączający (np. „Rozłóż silnik” / „Złóż silnik”). */
  | { type: 'button'; key: string; label: string; labelOn: string; default: boolean }
  | {
      type: 'select';
      key: string;
      label: string;
      default: string;
      options: { value: string; label: string }[];
    };

export interface SceneProps {
  params: Params;
}

export interface Step {
  title: string;
  /** Tekst objaśnienia wyświetlany obok animacji. */
  body: ReactNode;
  /**
   * `3d` – scena w <Canvas> (react-three-fiber),
   * `2d` – komponent na ciemnej scenie (SVG / Canvas 2D),
   * `page` – komponent na jasnym tle (tekst, oś czasu, ćwiczenia językowe).
   */
  kind: '2d' | '3d' | 'page';
  scene: ComponentType<SceneProps>;
  /** Stałe parametry kroku, przekazywane do sceny razem z wartościami kontrolek. */
  preset?: Params;
  controls?: Control[];
  /** Pozycja kamery dla scen 3D. */
  camera?: [number, number, number];
  /** Punkt, na który patrzy kamera (domyślnie środek układu). */
  target?: [number, number, number];
  /** Ujęcie zależne od kontrolek (np. „większy wycinek” odsuwa kamerę); brak – camera/target. */
  view?: (p: Params) => { camera: [number, number, number]; target: [number, number, number] } | undefined;
  /**
   * Kroki o tym samym kluczu dzielą jedną scenę 3D: przy przejściu między nimi scena się nie przeładowuje,
   * a kamera płynnie przelatuje do nowego ujęcia (np. cały samolot → zbliżenie na silnik).
   */
  stageKey?: string;
  /**
   * Umieszczenie sceny we wspólnym układzie tematu (np. silnik w swoich jednostkach → w miejscu silnika na
   * samolocie). Dzięki temu kamera przelatuje płynnie między krokami o różnych scenach.
   */
  frame?: { position: [number, number, number]; scale: number };
  /**
   * Punkt na modelu (w układzie kroku), w którym pojawia się numer tej zakładki. Gdy mają go wszystkie
   * zakładki modułu, nawigacja odbywa się klikaniem numerów na modelu zamiast paska u góry.
   */
  spot?: [number, number, number];
  /** Bieżące przesunięcie punktu `spot` (np. część odjeżdżająca w widoku rozłożonym) – numer jedzie razem z nią. */
  spotFollow?: () => [number, number, number] | undefined;
  /** Znak zamiast numeru w punkcie na modelu (np. „★” dla zakładki dodatkowej). */
  spotLabel?: string;
}

/** Podzespół tematu (np. silnik samolotu) z własnymi zakładkami; otwiera się po kliknięciu go na scenie. */
export interface PartModule {
  id: string;
  title: string;
  /** Krótki opis na liście podzespołów. */
  summary: string;
  steps: Step[];
}

export type Subject = 'matematyka' | 'fizyka' | 'chemia' | 'lotnictwo' | 'polski' | 'angielski';

export interface Topic {
  id: string;
  title: string;
  subject: Subject;
  summary: string;
  /** Kolor akcentu tematu (CSS). */
  accent: string;
  /** Emoji albo krótki znak na karcie tematu. */
  glyph: string;
  steps: Step[];
  /** Podzespoły z własnymi zakładkami (adres: /temat/<id>/<moduł>/<krok>). */
  modules?: PartModule[];
}

/** Wszystkie kroki tematu razem z krokami podzespołów (do statystyk w katalogu). */
export const allSteps = (t: Topic): Step[] => [...t.steps, ...(t.modules ?? []).flatMap((m) => m.steps)];
