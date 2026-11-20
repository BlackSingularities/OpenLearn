# Źródła i licencje materiałów zewnętrznych

## Airbus A350 – obrysy szyb kokpitu

- **Skąd:** model `Models/A350XWB-900.ac` z repozytorium [github.com/Sbyx13/A350XWB](https://github.com/Sbyx13/A350XWB) (samolot do symulatora FlightGear).
- **Autorzy:** Sbyx, Christopher Andrews.
- **Licencja:** MIT (wg informacji od właściciela projektu; repozytorium nie zawiera pliku licencji).
- **Co wykorzystano:** wyłącznie obrysy trzech szyb kokpitu po każdej stronie (po 20 punktów: odległość od czubka nosa i odsunięcie od osi), zapisane jako `CK_PANES` w `src/topics/aviation/airliner.tsx`. Cała geometria samolotu (kadłub, szyby, ramki, wnęki) jest budowana w kodzie aplikacji – siatek ani tekstur z modelu nie skopiowano.

## Proporcje zmierzone na modelach referencyjnych

Proporcje owiewek prowadnic klap i obrys nosa zostały zmierzone na modelach STL A350-900/-1000 dostarczonych przez właściciela projektu i przepisane na parametry geometrii w kodzie (bez kopiowania siatek).
