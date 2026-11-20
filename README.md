# Open Learn

Interaktywne lekcje i animowane objaśnienia: matematyka, fizyka, chemia, lotnictwo, język polski i język angielski – nie tylko w zakresie szkolnym.
Każdy temat to kilka animowanych kroków z objaśnieniem i kontrolkami do eksperymentowania.

## Tematy

| Przedmiot | Temat | Rodzaj animacji |
|-----------|-------|-----------------|
| Matematyka – funkcje | Funkcja liniowa · Funkcja kwadratowa · Przekształcenia wykresów · Wielomiany · Funkcja wymierna · Funkcja wykładnicza i logarytm · Okrąg jednostkowy · Wykresy trygonometryczne | wykresy SVG reagujące na suwaki (`src/lib/mathkit.tsx`) |
| Matematyka – analiza | Ciągi liczbowe · Pochodna · Zastosowania pochodnej | wykresy, słupki, puszka w 3D |
| Matematyka – geometria | Pitagoras i trygonometria · Tales i podobieństwo · Kąty w okręgu · Geometria analityczna · Bryły w przestrzeni | konstrukcje SVG, dowód „bez słów”, bryły obrotowe i przekroje w 3D |
| Matematyka – rachunek prawdopodobieństwa | Prawdopodobieństwo · Statystyka opisowa | symulacje na canvasie (deska Galtona, prawo wielkich liczb), histogramy |
| Fizyka – mechanika | Kinematyka · Dynamika (równia, maszyna Atwooda) · Pęd i zderzenia · Energia mechaniczna · Rzut ukośny · Ruch po okręgu · Grawitacja i prędkości kosmiczne · Prawa Keplera · Drgania | sceny 3D (Three.js) i symulacje na canvasie |
| Fizyka – fale, ciepło, elektryczność | Fale i dźwięk · Interferencja · Hydrostatyka · Gaz doskonały · Pole elektryczne · Prąd i obwody · Pole magnetyczne · Indukcja | 3D (cząsteczki gazu, siła Lorentza, prądnica), schematy z płynącymi elektronami |
| Fizyka – optyka i kwanty | Optyka geometryczna · Fotony i atom | konstrukcje promieni, pryzmat, efekt fotoelektryczny, model Bohra |
| Chemia – budowa materii | Budowa atomu i izotopy · Układ okresowy · Wiązania chemiczne · Sieci krystaliczne w 3D · Kształty cząsteczek · Orbitale atomowe · Promieniotwórczość | 3D (powłoki, komórki elementarne, chmury punktów \|ψ\|²), klikalna tablica z mapą cieplną, mapa nuklidów |
| Chemia – reakcje i roztwory | Stany skupienia · Mol i stechiometria · Roztwory · Kwasy, zasady i pH · Redoks i ogniwa · Kinetyka i równowaga | cząsteczki w 3D, krzywa ogrzewania, diagram fazowy, miareczkowanie, ogniwo galwaniczne |
| Chemia organiczna | Związki organiczne w 3D | wspólny silnik cząsteczek (`src/lib/molecule.tsx`) dopełniający wodory i geometrię |
| Lotnictwo | Skrzydło i siła nośna (profil, opływ, ciśnienie, przeciągnięcie, klapy, wiry brzegowe, zakręt) · Sterowanie i stateczność (osie i stery, odchylenie niekorzystne, punkt neutralny, podmuch i fly-by-wire, fugoida, wznios, masa i wyważenie) · Silnik odrzutowy od środka (ciąg, przekrój, sprężarka, komora, wały, bypass, rewers, dopalacz, rozruch) | opływ liczony na żywo (profil Żukowskiego, `src/topics/aviation/wingFlow.ts`), wiry podkowiaste w 3D, samolot ze sterami w 3D, symulacje podmuchu i fugoidy, obwiednia środka ciężkości, interaktywny turbowentylator 3D we wszystkich krokach silnika (klikalne podzespoły, widok rozłożony na moduły i pojedyncze wieńce, `src/topics/aviation/engineModel.tsx`) |
| Język polski – literatura | Rodzaje i gatunki literackie (narrator, kompozycja fabuły) · Wersyfikacja (sylaby, stopy, rymy, sonet) · Środki stylistyczne · Epoki literackie · Argumentacja i rozprawka | animacje tekstu (framer-motion), mapa gatunków, piramida Freytaga, oś czasu, przestawiające się bloki rozprawki |
| Język polski – nauka o języku | Fonetyka (głoski, upodobnienia, akcent) · Części mowy i fleksja · Słowotwórstwo · Składnia (wykresy, równoważniki, przecinki) · Komunikacja, style i poprawność | rozsypujące się zdania, tabele odmiany, rodziny wyrazów, przecinki krok po kroku, karty z błędami |
| Język angielski | Tenses · Passive Voice · Conditionals · Reported Speech | animowane osie czasu, zdania „morfujące” między wersjami (`src/lib/Morph.tsx`) |

## Uruchomienie

```bash
npm install
npm run dev      # serwer deweloperski
npm run build    # wersja produkcyjna w dist/ (działa jako statyczna strona)
```

## Technologie

- **React + TypeScript + Vite**: aplikacja.
- **Three.js przez react-three-fiber + drei**: sceny 3D (cząsteczki, orbity, fale).
- **SVG**: sceny 2D (wykresy, geometria) – wspólne narzędzia w `src/lib/plot.tsx`.
- **framer-motion**: animacje tekstu, przejścia i przestawianie elementów w scenach `page`.
- **React Router (HashRouter)**: adresy `#/temat/<id>/<krok>`, więc działa też na GitHub Pages.

## Jak zbudowany jest temat

Temat (`Topic`) to lista kroków (`Step`). Każdy krok ma:

| pole       | opis                                                                 |
|------------|----------------------------------------------------------------------|
| `title`    | tytuł kroku                                                          |
| `body`     | objaśnienie (JSX), wyświetlane w panelu obok animacji                |
| `kind`     | `'3d'` (scena w `<Canvas>`), `'2d'` (ciemna scena, np. SVG) albo `'page'` (jasna karta z tekstem) |
| `scene`    | komponent sceny, dostaje `params` z wartościami kontrolek            |
| `controls` | suwaki (`slider`), przełączniki (`toggle`), listy (`select`)         |
| `preset`   | stałe parametry kroku (ta sama scena może działać w kilku trybach)   |
| `camera`   | startowa pozycja kamery dla 3D                                       |

Odtwarzacz sam rysuje panel z kontrolkami, nawigację (także strzałkami ← →) i orbitowanie kamerą.

## Dodawanie nowego tematu

1. Utwórz plik `src/topics/<przedmiot>/<temat>.tsx`.
2. Napisz komponent sceny `({ params }: SceneProps) => …`.
   - 3D: elementy react-three-fiber, animacja w `useFrame`.
   - 2D: SVG, animacja przez `useAnimationClock(playing)`.
3. Wyeksportuj obiekt `Topic` i dopisz go do tablicy w `src/topics/index.ts`.

Gotowe wzorce: `math/quadratic.tsx` (wykresy 2D), `chemistry/orbitals.tsx` (3D), `polish/versification.tsx` i `english/conditionals.tsx` (animacje tekstu).
