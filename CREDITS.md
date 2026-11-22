# Źródła i licencje materiałów zewnętrznych

## Airbus A350 – obrysy szyb kokpitu

- **Skąd:** model `Models/A350XWB-900.ac` z repozytorium [github.com/Sbyx13/A350XWB](https://github.com/Sbyx13/A350XWB) (samolot do symulatora FlightGear).
- **Autorzy:** Sbyx, Christopher Andrews.
- **Licencja:** MIT (wg informacji od właściciela projektu; repozytorium nie zawiera pliku licencji).
- **Co wykorzystano:** wyłącznie obrysy trzech szyb kokpitu po każdej stronie (po 20 punktów: odległość od czubka nosa i odsunięcie od osi), zapisane jako `CK_PANES` w `src/topics/aviation/airliner.tsx`. Cała geometria samolotu (kadłub, szyby, ramki, wnęki) jest budowana w kodzie aplikacji – siatek ani tekstur z modelu nie skopiowano.

## Airbus A350 – maska i szyby kokpitu, czujniki na nosie

- **Skąd:** modele SketchUp „A359F” i „qantas a350-941” z 3D Warehouse, dostarczone przez właściciela projektu.
- **Co wykorzystano:** wyłącznie pomiary – obrys czarnej maski szyb kokpitu (`CK_MASK_REF`, z niego wyznaczone obrysy szyb `CK_PANES`) oraz położenia czujników na nosie (rurki Pitota, łopatki kąta natarcia, panele przy szybach, czujniki nad owiewką radaru) i wycieraczek w `src/topics/aviation/airliner.tsx`. Kształty tych elementów są budowane w kodzie z prostych brył – siatek ani tekstur z modeli nie skopiowano.
- Wcześniejsze obrysy szyb z modelu Sbyx13/A350XWB (sekcja wyżej) nie są już używane.

## Proporcje zmierzone na modelach referencyjnych

Proporcje owiewek prowadnic klap i obrys nosa zostały zmierzone na modelach STL A350-900/-1000 dostarczonych przez właściciela projektu i przepisane na parametry geometrii w kodzie (bez kopiowania siatek).
