import type { Topic } from '../lib/types';
import { airplane } from './aviation/airplane';
import { volcano } from './earth/volcano';
import { windFarm } from './energy/wind';

/**
 * Rejestr gotowych modeli. Aby dodać nowy model:
 * 1. utwórz plik eksportujący obiekt `Topic` (np. src/topics/<dziedzina>/<model>.tsx),
 * 2. dopisz go do tej tablicy,
 * 3. w katalogu (src/lib/catalog.ts) uzupełnij pole `topic` wpisu tego modelu.
 */
export const topics: Topic[] = [airplane, volcano, windFarm];

/**
 * Dawne osobne tematy lotnicze są teraz zakładkami modułów samolotu – stare adresy przekierowują
 * do odpowiedniej zakładki (offset – liczba zakładek dodanych przed dawnymi krokami).
 */
export const legacyTopics: Record<string, { topic: string; module: string; offset: number }> = {
  'silnik-odrzutowy': { topic: 'samolot-pasazerski', module: 'silnik', offset: 0 },
  'skrzydlo-sila-nosna': { topic: 'samolot-pasazerski', module: 'skrzydlo', offset: 2 },
  'sterowanie-statecznosc': { topic: 'samolot-pasazerski', module: 'usterzenie', offset: 1 },
};
