import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { SceneProps, Topic } from '../../lib/types';
import { Marked } from './marked';

/* ======================= Krok 1: budowa rozprawki ======================= */

type Block = 'thesis' | 'a1' | 'a2' | 'a3' | 'counter' | 'end';

const BLOCK_META: Record<Block, { label: string; color: string; part: string }> = {
  thesis: { label: 'wstęp', color: '#3d8bff', part: 'wstęp' },
  a1: { label: 'argument 1 + przykład', color: '#22b07d', part: 'rozwinięcie' },
  a2: { label: 'argument 2 + przykład', color: '#22b07d', part: 'rozwinięcie' },
  a3: { label: 'argument 3 + przykład', color: '#22b07d', part: 'rozwinięcie' },
  counter: { label: 'kontrargument i jego odparcie', color: '#e0913a', part: 'rozwinięcie' },
  end: { label: 'zakończenie', color: '#a855f7', part: 'zakończenie' },
};

const ESSAY: Record<'ded' | 'ind', Record<Block, string>> = {
  ded: {
    thesis: 'Uważam, że [warto] poświęcać się dla innych, ponieważ nadaje to sens ludzkiemu życiu.',
    a1: '[Po pierwsze,] poświęcenie bywa wyrazem wierności wartościom. Antygona z tragedii Sofoklesa ryzykuje życie, by pochować brata – prawo boskie i miłość siostrzana są dla niej ważniejsze niż rozkaz Kreona.',
    a2: '[Ponadto] działanie dla innych daje poczucie sensu nawet wtedy, gdy zwycięstwo jest niepewne. Doktor Rieux z „Dżumy” Camusa leczy chorych, choć wie, że zaraza może wrócić.',
    a3: '[Co więcej,] poświęcenie umacnia wspólnotę. Bohaterowie „Kamieni na szaniec” ryzykują życie, by odbić z rąk gestapo przyjaciela – Rudego.',
    counter: '[Ktoś mógłby zarzucić,] że poświęcenie bywa niszczące – Wokulski z „Lalki” traci siły i majątek dla Izabeli. [Jednak] dowodzi to raczej, że warto poświęcać się dla prawdziwych wartości, a nie dla złudzeń.',
    end: '[Podsumowując,] poświęcenie dla innych – mądre i świadome – nadaje życiu sens. Potwierdza to literatura od antyku po XX wiek.',
  },
  ind: {
    thesis: 'Czy [warto] poświęcać się dla innych? Rozważę argumenty, które przemawiają za i przeciw, aby odpowiedzieć na to pytanie.',
    a1: '[Za poświęceniem przemawia] wierność wartościom. Antygona ryzykuje życie, by pochować brata – miłość i prawo boskie są dla niej ważniejsze niż rozkaz władcy.',
    a2: '[Również] doktor Rieux z „Dżumy” pokazuje, że praca dla innych nadaje sens życiu, nawet gdy zwycięstwo jest niepewne.',
    a3: '[Podobnie] bohaterowie „Kamieni na szaniec” narażają się, by ratować przyjaciela – poświęcenie buduje wspólnotę.',
    counter: '[Z drugiej strony] historia Wokulskiego pokazuje, że ślepe poświęcenie dla złudzeń może zniszczyć człowieka.',
    end: '[Rozważywszy te argumenty, stwierdzam,] że warto poświęcać się dla innych, jeśli służy to prawdziwym wartościom. Teza pojawia się dopiero na końcu – jako wniosek.',
  },
};

const ORDER: Record<'ded' | 'ind', Block[]> = {
  ded: ['thesis', 'a1', 'a2', 'a3', 'counter', 'end'],
  ind: ['thesis', 'counter', 'a1', 'a2', 'a3', 'end'],
};

function EssayScene({ params }: SceneProps) {
  const mode = (String(params.mode ?? 'ded') === 'ind' ? 'ind' : 'ded') as 'ded' | 'ind';
  const full = Boolean(params.full);
  return (
    <div className="poem essay">
      <div className="poem-source">Temat: Czy warto poświęcać się dla innych? · {mode === 'ded' ? 'teza – układ dedukcyjny' : 'hipoteza – układ indukcyjny'}</div>
      <LayoutGroup>
        <div className="essay-blocks">
          {ORDER[mode].map((b, i) => {
            const m = BLOCK_META[b];
            const label = b === 'thesis' ? (mode === 'ded' ? 'wstęp: teza' : 'wstęp: hipoteza (pytanie)') : b === 'end' ? (mode === 'ded' ? 'zakończenie: potwierdzenie tezy' : 'zakończenie: teza jako wniosek') : m.label;
            return (
              <motion.div key={b} layout className="essay-block" style={{ '--bc': m.color } as React.CSSProperties} transition={{ type: 'spring', stiffness: 220, damping: 26 }}>
                <span className="essay-n">{i + 1}</span>
                <div>
                  <b>{label}</b>
                  <AnimatePresence initial={false}>
                    {full && (
                      <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <Marked text={ESSAY[mode][b]} />
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      </LayoutGroup>
      <p className="poem-info">
        {mode === 'ded'
          ? 'Dedukcja: najpierw stanowisko (teza), potem dowody. Kontrargument z odparciem wzmacnia tekst – pokazuje, że znasz drugą stronę.'
          : 'Indukcja: zaczynasz od pytania (hipotezy), ważysz racje za i przeciw, a stanowisko formułujesz dopiero w zakończeniu.'}{' '}
        Wyróżnione wyrażenia to <b>spójniki tekstowe</b> – prowadzą czytelnika przez wywód.
      </p>
    </div>
  );
}

/* ======================= Krok 2: rodzaje argumentów ======================= */

const ARGS: Record<string, { name: string; ex: string; note: string; color: string }> = {
  rzeczowy: { name: 'rzeczowy (logiczny)', ex: 'Czytanie poszerza słownictwo – kto zna więcej słów, precyzyjniej wyraża myśli i lepiej rozumie innych.', note: 'Opiera się na faktach, danych i logicznym wynikaniu. Najsilniejszy w rozprawce.', color: '#3d8bff' },
  autorytet: { name: 'odwołujący się do autorytetu', ex: 'Wisława Szymborska nazywała czytanie najpiękniejszą zabawą, jaką wymyśliła ludzkość – a noblistka wiedziała, o czym mówi.', note: 'Powołuje się na zdanie uznanego eksperta lub postaci. Autorytet musi być kompetentny w danej dziedzinie!', color: '#a855f7' },
  przyklad: { name: 'przykład literacki', ex: 'Skawiński z „Latarnika” odnajduje w lekturze „Pana Tadeusza” utraconą ojczyznę – książka zmienia jego życie.', note: 'Ilustruje tezę losem bohatera. Na maturze wymagany – przykład trzeba zinterpretować, nie tylko streścić.', color: '#22b07d' },
  doswiadczenie: { name: 'odwołujący się do doświadczenia', ex: 'Każdy, kto przeczytał wciągającą powieść, wie, że przez chwilę żył cudzym życiem i lepiej zrozumiał innych.', note: 'Odwołuje się do przeżyć wspólnych dla nadawcy i odbiorcy.', color: '#e0913a' },
  emocje: { name: 'odwołujący się do emocji', ex: 'Wyobraź sobie świat, w którym nikt nie zna już baśni czytanych w dzieciństwie przez babcię…', note: 'Porusza uczucia odbiorcy. Skuteczny w przemówieniu, ale w rozprawce – tylko jako uzupełnienie.', color: '#ec4899' },
  wartosci: { name: 'odwołujący się do wartości', ex: 'Czytanie uczy empatii – a umiejętność wczucia się w drugiego człowieka to podstawa życia we wspólnocie.', note: 'Powołuje się na normy moralne i wartości powszechnie uznawane.', color: '#14b8a6' },
};

function ArgsScene({ params }: SceneProps) {
  const id = String(params.arg ?? 'rzeczowy');
  const a = ARGS[id];
  return (
    <div className="poem args">
      <div className="arg-thesis">
        <small>teza</small>
        Czytanie książek rozwija młodych ludzi.
      </div>
      <svg className="arg-link" viewBox="0 0 40 50" aria-hidden>
        <motion.path key={id} d="M20,48 L20,6 M12,14 L20,4 L28,14" fill="none" stroke={a.color} strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} />
      </svg>
      <AnimatePresence mode="wait">
        <motion.div key={id} className="arg-card" style={{ '--bc': a.color } as React.CSSProperties} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
          <small>argument {a.name}</small>
          <p>{a.ex}</p>
        </motion.div>
      </AnimatePresence>
      <p className="poem-info">{a.note}</p>
    </div>
  );
}

/* ======================= Krok 3: erystyka i błędy w rozumowaniu ======================= */

const ERISTIC: Record<string, { name: string; ex: string; why: string; fix: string }> = {
  personam: { name: 'argument ad personam', ex: '„Nie słuchajcie go – przecież on nawet nie zdał matury.”', why: 'Atakuje osobę, a nie to, co mówi. Wykształcenie mówcy nie przesądza, czy jego racja jest prawdziwa.', fix: 'Odpowiedz na treść: „Sprawdźmy, czy jego wyliczenia się zgadzają”.' },
  populum: { name: 'argument z liczby (ad populum)', ex: '„Wszyscy w klasie już mają ten telefon, więc to najlepszy model.”', why: 'Popularność nie dowodzi jakości ani prawdziwości – większość też może się mylić.', fix: 'Porównaj parametry, testy, opinie ekspertów.' },
  alternatywa: { name: 'fałszywa alternatywa', ex: '„Albo jesteś z nami, albo przeciwko nam.”', why: 'Przedstawia tylko dwie możliwości, choć istnieje wiele innych – np. częściowa zgoda albo neutralność.', fix: 'Wskaż trzecią (i kolejne) możliwość.' },
  rownia: { name: 'równia pochyła', ex: '„Jeśli pozwolimy na telefony na przerwach, uczniowie zaczną grać na lekcjach, przestaną się uczyć i nie zdadzą matury.”', why: 'Łańcuch coraz gorszych skutków, z których żaden nie jest uzasadniony – każdy krok tylko „wydaje się” prawdopodobny.', fix: 'Zapytaj o dowód dla każdego ogniwa łańcucha.' },
  uogolnienie: { name: 'nadmierne uogólnienie', ex: '„Mój sąsiad palił całe życie i dożył dziewięćdziesiątki, więc palenie nie szkodzi.”', why: 'Jeden przypadek nie uzasadnia ogólnego wniosku. O zależnościach mówią badania na wielu osobach.', fix: 'Odwołaj się do danych z dużej próby.' },
  autorytet: { name: 'autorytet niekompetentny', ex: '„Ten krem jest skuteczny – poleca go znany piłkarz.”', why: 'Autorytet działa tylko w swojej dziedzinie. Piłkarz nie jest ekspertem od dermatologii.', fix: 'Powołaj się na specjalistę lub badania kliniczne.' },
  posthoc: { name: 'post hoc (fałszywa przyczyna)', ex: '„Odkąd w szkole pojawił się nowy dyrektor, nasza drużyna przegrywa. To jego wina.”', why: '„Po tym, więc wskutek tego” – to, że coś stało się później, nie oznacza, że zostało tym spowodowane.', fix: 'Szukaj mechanizmu i innych możliwych przyczyn.' },
  slomiany: { name: 'chochoł (słomiany człowiek)', ex: '– Szkoła powinna kończyć się później rano. – Czyli chcesz, żeby uczniowie w ogóle się nie uczyli?', why: 'Przekręca stanowisko rozmówcy na skrajne i łatwe do obalenia, a potem z nim walczy.', fix: 'Przytocz dokładnie, co powiedział rozmówca.' },
};

function EristicScene({ params }: SceneProps) {
  const id = String(params.trick ?? 'personam');
  const e = ERISTIC[id];
  return (
    <div className="poem args">
      <AnimatePresence mode="wait">
        <motion.div key={id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <div className="arg-card" style={{ '--bc': '#f87171' } as React.CSSProperties}>
            <small>{e.name}</small>
            <p>{e.ex}</p>
          </div>
          <dl className="kind-facts">
            <div>
              <dt>dlaczego to nie jest argument</dt>
              <dd>{e.why}</dd>
            </div>
            <div>
              <dt>jak odpowiedzieć</dt>
              <dd>{e.fix}</dd>
            </div>
          </dl>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export const rhetoric: Topic = {
  id: 'argumentacja',
  title: 'Argumentacja i rozprawka',
  subject: 'polski',
  summary: 'Zobacz, jak przestawiają się części rozprawki w układzie dedukcyjnym i indukcyjnym, poznaj rodzaje argumentów i zdemaskuj chwyty erystyczne.',
  accent: '#9a3412',
  glyph: '⚖',
  steps: [
    {
      title: 'Budowa rozprawki',
      kind: 'page',
      scene: EssayScene,
      controls: [
        {
          type: 'select',
          key: 'mode',
          label: 'Układ',
          default: 'ded',
          options: [
            { value: 'ded', label: 'dedukcyjny (teza)' },
            { value: 'ind', label: 'indukcyjny (hipoteza)' },
          ],
        },
        { type: 'toggle', key: 'full', label: 'Pokaż przykładowy tekst', default: false },
      ],
      body: (
        <>
          <p>
            <strong>Rozprawka</strong> ma trójdzielną budowę: wstęp, rozwinięcie, zakończenie. Jej sercem jest{' '}
            <strong>stanowisko</strong> poparte argumentami i przykładami.
          </p>
          <p>
            W układzie <strong>dedukcyjnym</strong> stawiasz tezę na początku i jej dowodzisz. W <strong>indukcyjnym</strong>{' '}
            zaczynasz od hipotezy (pytania), a tezę formułujesz w zakończeniu. Przełącz układ i patrz, jak przestawiają się
            bloki.
          </p>
          <p>
            Każdy akapit rozwinięcia = jeden argument + przykład (najlepiej z lektury) + krótki wniosek, jak przykład
            potwierdza tezę.
          </p>
        </>
      ),
    },
    {
      title: 'Rodzaje argumentów',
      kind: 'page',
      scene: ArgsScene,
      controls: [
        {
          type: 'select',
          key: 'arg',
          label: 'Argument',
          default: 'rzeczowy',
          options: Object.entries(ARGS).map(([value, a]) => ({ value, label: a.name })),
        },
      ],
      body: (
        <>
          <p>
            <strong>Argument</strong> to uzasadnienie tezy. Ta sama teza może być poparta na wiele sposobów – przełączaj
            rodzaje i porównuj.
          </p>
          <p>
            W rozprawce najwyżej cenione są argumenty <strong>rzeczowe</strong> i <strong>przykłady literackie</strong>.
            Odwołanie do emocji lepiej sprawdza się w przemówieniu.
          </p>
          <p>Pamiętaj: argument to nie przykład. Najpierw twierdzenie ogólne, potem ilustracja.</p>
        </>
      ),
    },
    {
      title: 'Erystyka i błędy w rozumowaniu',
      kind: 'page',
      scene: EristicScene,
      controls: [
        {
          type: 'select',
          key: 'trick',
          label: 'Chwyt',
          default: 'personam',
          options: Object.entries(ERISTIC).map(([value, e]) => ({ value, label: e.name })),
        },
      ],
      body: (
        <>
          <p>
            <strong>Erystyka</strong> to sztuka wygrywania sporów bez względu na prawdę – za pomocą chwytów, które tylko
            udają argumenty.
          </p>
          <p>
            Warto je rozpoznawać w reklamie, polityce i mediach społecznościowych – i unikać ich we własnych tekstach. Przełączaj chwyty: przy każdym zobaczysz, czemu tylko udaje argument i jak na niego rzeczowo odpowiedzieć.
          </p>
        </>
      ),
    },
  ],
};
