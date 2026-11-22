/**
 * Lista modeli na stronie głównej – tylko gotowe. Każdy model to jedna rzecz z prawdziwego świata,
 * na której przykładzie wyjaśniamy, jak działa – od środka, krok po kroku.
 * Żeby dodać nowy model: zarejestruj go w src/topics/index.ts i dopisz tutaj z jego identyfikatorem `topic`.
 */

export interface CatalogModel {
  id: string;
  title: string;
  /** Jedno–dwa zdania: co pokażemy na tym modelu. */
  summary: string;
  /** Identyfikator modelu w rejestrze (src/topics/index.ts). */
  topic: string;
  /** Kolor akcentu karty. */
  color: string;
  /** Rysunek na okładce karty. */
  cover: 'samolot' | 'wulkan' | 'wiatrak' | 'wegiel';
}

export const catalog: CatalogModel[] = [
  {
    id: 'samolot-pasazerski',
    title: 'Samolot pasażerski',
    summary: 'Airbus A350-1000 w 3D: kadłub, skrzydła, silniki, usterzenie, podwozie i kokpit – każdy podzespół otwiera się od środka.',
    topic: 'samolot-pasazerski',
    color: '#0ea5e9',
    cover: 'samolot',
  },
  {
    id: 'wulkan',
    title: 'Wulkan',
    summary: 'Wulkan w przekroju 3D: komora magmowa i erupcja, rodzaje wulkanów i erupcji, lawa, popiół, bomby i chmury żaru, płyty tektoniczne i obserwacja wulkanów.',
    topic: 'wulkan',
    color: '#e0662b',
    cover: 'wulkan',
  },
  {
    id: 'elektrownia-wiatrowa',
    title: 'Elektrownia wiatrowa',
    summary: 'Turbina 4,5 MW w 3D: wiatr i jego energia, łopaty jak skrzydła, wnętrze gondoli z przekładnią i generatorem, sterowanie, wieża i fundamenty, droga prądu do sieci, farmy na lądzie i na morzu.',
    topic: 'elektrownia-wiatrowa',
    color: '#0d9488',
    cover: 'wiatrak',
  },
  {
    id: 'elektrownia-weglowa',
    title: 'Elektrownia węglowa',
    summary: 'Blok 900 MW w 3D: skład węgla i młyny, kocioł z wirującym płomieniem, turbina i generator, chłodnia kominowa, oczyszczanie spalin, CO₂ i droga prądu do sieci.',
    topic: 'elektrownia-weglowa',
    color: '#b45309',
    cover: 'wegiel',
  },
];
