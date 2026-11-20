import type { Subject } from './types';

export const subjectLabels: Record<Subject, string> = {
  matematyka: 'Matematyka',
  fizyka: 'Fizyka',
  chemia: 'Chemia',
  lotnictwo: 'Lotnictwo',
  polski: 'Język polski',
  angielski: 'Język angielski',
};

export const subjectMeta: Record<Subject, { glyph: string; color: string; blurb: string }> = {
  matematyka: { glyph: 'ƒ', color: '#f0535b', blurb: 'Funkcje, trygonometria i analiza – wykresy, które reagują na każdy suwak.' },
  fizyka: { glyph: '⚡', color: '#7b61ff', blurb: 'Symulacje liczone na żywo: rzuty, drgania, orbity, fale i pole elektryczne.' },
  chemia: { glyph: '⚛', color: '#2b8cf0', blurb: 'Wiązania, cząsteczki i orbitale w 3D oraz symulacja cząsteczek: kinetyka i równowaga.' },
  lotnictwo: { glyph: '✈', color: '#0ea5e9', blurb: 'Jak latają samoloty i co dzieje się w ich wnętrzu – od silnika odrzutowego po rewers, krok po kroku.' },
  polski: { glyph: '¶', color: '#e38a1f', blurb: 'Literatura i nauka o języku w ruchu: gatunki, wersyfikacja, epoki, rozprawka, fonetyka, fleksja, składnia i poprawność.' },
  angielski: { glyph: 'Aa', color: '#1fa36a', blurb: 'Czasy, strona bierna, tryby warunkowe i mowa zależna – zdania, które przestawiają się na Twoich oczach.' },
};

export const subjectOrder: Subject[] = ['matematyka', 'fizyka', 'chemia', 'lotnictwo', 'polski', 'angielski'];
