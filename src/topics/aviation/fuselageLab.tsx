/*
 * Moduł kadłuba: zakładki z własną symulacją – ciśnienie w kabinie (lot po „Rozpocznij”: wznoszenie, przelot,
 * zniżanie; kadłub „oddycha”, ECAM CRUISE pokazuje ΔP i wysokość kabiny) oraz załadunek ładowni (kontenery LD3
 * wjeżdżają po kolei). Model kadłuba czyta stan z FUS_LIVE (airliner.tsx), ramka informacji – ze stanu tutaj.
 */
import { Fragment, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Params } from '../../lib/types';
import { InfoPortal, Sparkline } from '../../lib/plot';
import { CockpitDock, Ecam } from '../../components/cockpit';
import { CARGO_DOOR_X, CARGO_SLOTS, CARGO_T0, CARGO_TEND, FUS_LIVE, canPose, cargoDoorOpen, type FusView } from './airliner';
import { AIR_STAGES, airValues } from './airSystem';
import { FIRE_STAGES, SYS_STAGE_T, WATER_STAGES, fireState } from './cabinSystems';
/** Etap drogi powietrza co tyle sekund (zakładka o ciśnieniu i klimatyzacji). */
export const STAGE_T = 7;

/** Ciśnienie atmosfery wzorcowej (psi) na wysokości h (ft). */
const pIsa = (h: number) => 14.696 * Math.pow(1 - 6.8756e-6 * h, 5.2559);
/** Największa różnica ciśnień w kabinie A350 (psi) i wysokość kabiny w przelocie (ft). */
const DP_MAX = 8.6;
const CAB_MAX = 6000;
const CRZ = 41000;
/** Profil lotu (czas sceny, s): wznoszenie, przelot, zniżanie, dobieg. */
const T_CLB = 24;
const T_CRZ = 36;
const T_DES = 60;
const T_END = 66;
/** Kontener co tyle sekund. */
const CAN_T = 1.6;

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function flight(t: number) {
  const alt = t < T_CLB ? CRZ * smooth(clamp01(t / T_CLB)) : t < T_CRZ ? CRZ : CRZ * (1 - smooth(clamp01((t - T_CRZ) / (T_DES - T_CRZ))));
  // wysokość kabiny rośnie razem z samolotem, ale wolniej – do ok. 6000 ft w przelocie
  const cab = Math.min(CAB_MAX, (alt / CRZ) * CAB_MAX);
  const dp = Math.max(0, pIsa(cab) - pIsa(alt));
  return { alt, cab, dp };
}

/*
 * Dekompresja (czas sceny, s): przelot na FL410, nagła utrata ciśnienia, maski, zniżanie awaryjne do 10 000 ft.
 * Zniżanie skrócone pokazowo (w rzeczywistości trwa ok. 4–5 min).
 */
export const D_RUP = 5;
const D_TAU = 0.8;
/** Maski wypadają automatycznie, gdy kabina przekroczy ok. 14 000 ft (z małym opóźnieniem układu). */
const D_MASK_FT = 14000;
const D_MASK = D_RUP + D_TAU * Math.log(1 / (1 - (D_MASK_FT - CAB_MAX) / (CRZ - CAB_MAX))) + 0.3;
const D_DES0 = D_RUP + 6;
const D_DES1 = D_DES0 + 32;
const D_END = D_DES1 + 8;
const D_LOW = 10000;

/** Stan dekompresji w chwili t (−1 – przed „Rozpocznij”). */
export function decomp(t: number) {
  const alt = t < D_DES0 ? CRZ : D_LOW + (CRZ - D_LOW) * (1 - smooth(clamp01((t - D_DES0) / (D_DES1 - D_DES0))));
  const u = t - D_RUP;
  // po pęknięciu powietrze ucieka: wysokość kabiny dogania wysokość lotu w ciągu ok. 2–3 s
  const cab = u < 0 ? CAB_MAX : CAB_MAX + (alt - CAB_MAX) * (1 - Math.exp(-u / D_TAU));
  // ΔP ograniczone do maksimum A350 (wzór atmosfery wzorcowej jest tu tylko przybliżeniem ponad 36 000 ft)
  const dp = Math.min(DP_MAX, Math.max(0, pIsa(cab) - pIsa(alt)));
  // mgła: rozprężone powietrze ochładza się poniżej punktu rosy – gęsta przez chwilę, potem się rozwiewa
  const fog = u < 0 ? 0 : smooth(clamp01(u / 0.3)) * (1 - smooth(clamp01((u - 1.5) / 5)));
  const masks = t < D_MASK ? 0 : clamp01((t - D_MASK) / 0.7);
  // prędkość zmiany wysokości kabiny (ft/min); ECAM pokazuje najwyżej 9999 – przy dekompresji wskazanie jest „na końcu skali”
  const vs = u < 0 ? 0 : u < 4 * D_TAU ? ((alt - CAB_MAX) / D_TAU) * Math.exp(-u / D_TAU) * 60 : t > D_DES0 && t < D_DES1 ? -6000 : 0;
  const cabVs = Math.max(-9999, Math.min(9999, vs));
  return { alt, cab, dp, fog, masks, cabVs };
}
/** Czas użytecznej świadomości bez tlenu (s) na wysokości kabiny (ft) – przybliżone wartości z tabel lotniczych. */
export function tuc(cab: number) {
  const tab: [number, number][] = [
    [15000, 1800],
    [18000, 1500],
    [22000, 420],
    [25000, 240],
    [28000, 150],
    [30000, 90],
    [35000, 45],
    [40000, 18],
    [43000, 12],
  ];
  if (cab < tab[0][0]) return Infinity;
  for (let i = 1; i < tab.length; i++)
    if (cab <= tab[i][0]) {
      const [a, ta] = tab[i - 1];
      const [b, tb] = tab[i];
      return ta + ((tb - ta) * (cab - a)) / (b - a);
    }
  return tab[tab.length - 1][1];
}

type FusState = { t: number; alt: number; cab: number; dp: number; hist: { alt: number[]; cab: number[] }; acc: number; key: string; stage: number };

/** Stan zakładek kadłuba: zegar scenariusza po „Rozpocznij”, wyniki lotu i postęp załadunku. */
export function useFusDriver(view: FusView | null, params: Params) {
  const st = useRef<FusState>({ t: 0, alt: 0, cab: 0, dp: 0, hist: { alt: [], cab: [] }, acc: 0, key: '', stage: -1 });
  useFrame((_, dtRaw) => {
    if (!view) return;
    const s = st.current;
    const dt = Math.min(0.05, dtRaw);
    const run = Boolean(params.run);
    const key = `${view}|${run}`;
    if (key !== s.key) Object.assign(s, { key, t: 0, alt: 0, cab: 0, dp: 0, hist: { alt: [], cab: [] }, acc: 0 });
    if (view === 'press') {
      // przelot na FL410: kabina na ok. 6000 ft; scenariusz przechodzi etap po etapie drogę powietrza
      if (run) s.t += dt;
      Object.assign(s, flight(T_CLB + 1));
      s.stage = run ? Math.min(AIR_STAGES.length, Math.floor(s.t / STAGE_T)) : -1;
      // sterownik ciśnienia ciągle lekko porusza zaworem wylotowym, trzymając zadaną wysokość kabiny
      FUS_LIVE.outflow = 0.16 + 0.07 * Math.sin(s.t * 0.9);
      FUS_LIVE.dp = 0;
    } else if (view === 'water' || view === 'fire') {
      // instalacje kabiny w przelocie: scenariusz etap po etapie (ostatni etap – cała instalacja)
      const N = view === 'water' ? WATER_STAGES.length : FIRE_STAGES.length;
      if (run) s.t = Math.min(N * SYS_STAGE_T + 30, s.t + dt);
      Object.assign(s, flight(T_CLB + 1));
      s.stage = run ? Math.min(N, Math.floor(s.t / SYS_STAGE_T)) : -1;
      FUS_LIVE.dp = 0;
      FUS_LIVE.outflow = 0.16;
    } else if (view === 'decomp') {
      if (run) s.t = Math.min(D_END, s.t + dt);
      const d = decomp(run ? s.t : -1);
      Object.assign(s, { alt: d.alt, cab: d.cab, dp: d.dp });
      FUS_LIVE.dp = 0;
      FUS_LIVE.outflow = 0.16;
      FUS_LIVE.fog = d.fog;
      FUS_LIVE.masks = d.masks;
      FUS_LIVE.maskAge = run ? Math.max(0, s.t - D_MASK - 0.7) : 0;
    } else {
      // załadunek trwa dłużej niż lot pokazowy: zegar biegnie do odjazdu ostatniego pociągu wózków
      if (run) s.t = Math.min(view === 'cargo' ? CARGO_TEND + 14 : T_END, s.t + dt);
      FUS_LIVE.dp = 0;
      FUS_LIVE.outflow = 1;
    }
    if (view !== 'decomp') {
      FUS_LIVE.fog = 0;
      FUS_LIVE.masks = 0;
    }
    // załadunek: zegar scenariusza (przed „Rozpocznij” kontenery czekają na wózkach, drzwi zamknięte)
    FUS_LIVE.cargoT = view === 'cargo' ? (run ? s.t : -1) : 1e9;
  });
  return st;
}

const f0 = (v: number) => Math.round(v).toLocaleString('pl-PL');
const f1 = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Ramka informacji i ekrany zakładek kadłuba. */
export function FuselageLab({ view, sim, params }: { view: FusView; sim: ReturnType<typeof useFusDriver>; params: Params }) {
  const [, set] = useState(0);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 0.125) {
      acc.current = 0;
      set((n) => (n + 1) % 1e6);
    }
  });
  const s = sim.current;
  const run = Boolean(params.run);
  if (view === 'press') {
    const v = airValues();
    const st = s.stage;
    const cur = st >= 0 && st < AIR_STAGES.length ? AIR_STAGES[st] : null;
    const row = (label: string, value: string, color?: string) => (
      <Fragment key={label}>
        <span>{label}</span>
        <b style={{ color }}>{value}</b>
      </Fragment>
    );
    const values: Record<number, JSX.Element> = {
      0: (
        <>
          {row('upust IP (zwykle)', 'ok. 300 °C', '#f59e0b')}
          {row('upust HP (mały ciąg)', 'do ok. 500 °C', '#ef4444')}
          {row('za zaworem PRSOV', `ok. ${v.bleedP} psi`)}
          {row('powietrze z wentylatora (FAV)', 'ok. 0 °C', '#7cc7ff')}
          {row('za chłodnicą wstępną', `ok. ${v.bleedT} °C`, '#ff5a1f')}
        </>
      ),
      1: (
        <>
          {row('powietrze z zewnątrz', '−56 °C (FL410)')}
          {row('za pakietem', `ok. ${v.packOut} °C, suche`, '#38bdf8')}
        </>
      ),
      2: (
        <>
          {row('udział recyrkulacji', `ok. ${v.recirc} %`, '#a78bfa')}
          {row('za mieszalnikiem', `ok. ${v.mix} °C`, '#22d3ee')}
        </>
      ),
      3: (
        <>
          {v.zones.map((z) => row(`strefa: ${z.name}`, `${f1(z.target)} °C · trim ${z.trim} %`, '#fb923c'))}
        </>
      ),
      4: (
        <>
          {row('wymiana powietrza', `co ok. ${f1(v.change)} min`)}
          {row('przepływ', 'z góry w dół, w poprzek kabiny')}
        </>
      ),
      5: (
        <>
          {row('zawór wylotowy', `${f0(FUS_LIVE.outflow * 100)} % otwarty`)}
          {row('wysokość kabiny', `${f0(s.cab)} ft`)}
          {row('różnica ciśnień ΔP', `${f1(s.dp)} psi`)}
        </>
      ),
    };
    return (
      <>
        <CockpitDock>
          <Ecam
            thrMode={null}
            n1={[78, 78]}
            egt={[700, 702]}
            page="CRUISE"
            cruise={{ ff: [2400, 2410], fu: [8200, 8240], deltaP: s.dp, cabAlt: s.cab, cabVs: 0 }}
            footer={{ tat: -30, sat: -56, isa: 0, flt: '05:12', time: '09:41:02', gw: 280000, gwcg: 29.5, fob: 72000 }}
            width={260}
          />
        </CockpitDock>
        <InfoPortal>
          {cur ? (
            <>
              <div style={{ fontWeight: 700, color: cur.color }}>
                {st + 1}/{AIR_STAGES.length} · {cur.title}
              </div>
              <div style={{ fontSize: 13 }}>{cur.text}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px', fontSize: 13 }}>{values[st]}</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, color: '#7dd3fc' }}>{st < 0 ? 'Droga powietrza w samolocie' : 'Cały obieg powietrza'}</div>
              {st < 0 && <div style={{ fontSize: 12, color: '#facc15' }}>Naciśnij „Rozpocznij” – etap po etapie zobaczysz, skąd się bierze powietrze w kabinie i dokąd płynie.</div>}
            </>
          )}
          <div style={{ display: 'grid', gap: 2, fontSize: 12 }}>
            {AIR_STAGES.map((a, i) => (
              <div key={a.title} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: st < 0 || i <= st ? 1 : 0.4, fontWeight: i === st ? 700 : 400 }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: a.color, flex: 'none' }} />
                {i + 1}. {a.title}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Strugi mają kolory etapów, a strzałki pokazują kierunek przepływu. Wykładzina kabiny jest półprzezroczysta – widać piony nawiewu w burtach.</div>
        </InfoPortal>
      </>
    );
  }
  if (view === 'water' || view === 'fire') {
    const stages = view === 'water' ? WATER_STAGES : FIRE_STAGES;
    const st = s.stage;
    const cur = st >= 0 && st < stages.length ? stages[st] : null;
    const t = run ? s.t : -1;
    const f = fireState(t);
    const row = (label: string, value: string, color?: string) => (
      <Fragment key={label}>
        <span>{label}</span>
        <b style={{ color }}>{value}</b>
      </Fragment>
    );
    // wartości: woda – ilość w zbiornikach i ciśnienie; pożar – stan czujników, wentylacji, butli i stężenie środka
    const waterRows = [
      // w etapie napełniania ilość rośnie, potem woda powoli ubywa (kuchnie, umywalki)
      row('woda pitna', `${f0(t < 0 ? 1100 : t < SYS_STAGE_T ? 400 + (700 * t) / SYS_STAGE_T : Math.max(0, 1100 - (t - SYS_STAGE_T) * 4))} l z ok. 1100 l`, '#38bdf8'),
      row('ciśnienie w zbiornikach', 'ok. 2,5 bar (powietrze)'),
      row('ścieki w zbiornikach', `${f0(Math.min(700, 120 + Math.max(0, t) * 3))} l`, '#a8a29e'),
      row('spłukanie', 'ok. 0,2 l wody, ok. 1 s'),
      row('podciśnienie', 'w locie – różnica ciśnień; nisko – generator'),
    ];
    const fireRows = [
      row('czujniki dymu', f.detect ? 'DYM WYKRYTY' : 'w normie', f.detect ? '#ef4444' : '#22c55e'),
      row('wentylacja ładowni', f.isolated ? 'odcięta' : 'pracuje', f.isolated ? '#f59e0b' : undefined),
      row('butla 1 (szybka)', f.agent1 ? 'wyładowana' : 'pełna', f.agent1 ? '#f59e0b' : undefined),
      row('butla 2 (dozowana)', f.agent2 ? 'dozuje' : 'pełna', f.agent2 ? '#a5b4fc' : undefined),
      row('stężenie środka', f.conc > 0 ? `${f1(f.conc)} %` : '–', f.conc >= 3 ? '#22c55e' : undefined),
    ];
    return (
      <>
        {view === 'fire' && (
          <CockpitDock>
            <Ecam
              thrMode={null}
              n1={[78, 78]}
              egt={[700, 702]}
              page="CRUISE"
              warning={
                f.detect
                  ? {
                      title: 'SMOKE FWD CARGO SMOKE',
                      master: !f.agent1,
                      lines: [f.isolated ? 'FWD ISOL VALVE......CLOSED' : 'FWD ISOL VALVE.......CLOSE', f.agent1 ? 'CARGO AGENT 1........DISCH' : 'CARGO AGENT..........DISCH', 'LAND ASAP'],
                    }
                  : null
              }
              cruise={{ ff: [2400, 2410], fu: [8200, 8240], deltaP: s.dp, cabAlt: s.cab, cabVs: 0 }}
              footer={{ tat: -30, sat: -56, isa: 0, flt: '05:12', time: '09:41:02', gw: 280000, gwcg: 29.5, fob: 72000 }}
              width={260}
            />
          </CockpitDock>
        )}
        <InfoPortal>
          {cur ? (
            <>
              <div style={{ fontWeight: 700, color: cur.color }}>
                {st + 1}/{stages.length} · {cur.title}
              </div>
              <div style={{ fontSize: 13 }}>{cur.text}</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, color: '#7dd3fc' }}>{view === 'water' ? (st < 0 ? 'Woda i ścieki w samolocie' : 'Cała instalacja') : st < 0 ? 'Ochrona ładowni przed pożarem' : 'Cała instalacja gaśnicza'}</div>
              {st < 0 && <div style={{ fontSize: 12, color: '#facc15' }}>Naciśnij „Rozpocznij” – etap po etapie zobaczysz, co się dzieje.</div>}
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px', fontSize: 13 }}>{view === 'water' ? waterRows : fireRows}</div>
          <div style={{ display: 'grid', gap: 2, fontSize: 12 }}>
            {stages.map((a, i) => (
              <div key={a.title} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: st < 0 || i <= st ? 1 : 0.4, fontWeight: i === st ? 700 : 400 }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: a.color, flex: 'none' }} />
                {i + 1}. {a.title}
              </div>
            ))}
          </div>
        </InfoPortal>
      </>
    );
  }
  if (view === 'decomp') {
    const t = run ? s.t : -1;
    const d = decomp(t);
    const before = t < D_RUP;
    const phase = before
      ? { c: '#7dd3fc', h: 'przelot na 12,5 km – w kabinie jak na 1800 m', x: 'Kadłub jest napompowany: w środku ciśnienie jak na ok. 1800 m, na zewnątrz – jak na 12,5 km.' }
      : t < D_MASK
        ? { c: '#ef4444', h: 'nagła dekompresja!', x: 'Powietrze ucieka w ułamku sekundy. Rozprężając się, gwałtownie się ochładza – para wodna skrapla się w mgłę. Robi się zimno, uszy „trzaskają”.' }
        : t < D_DES0
          ? { c: '#f59e0b', h: 'maski tlenowe wypadły', x: 'Pociągnij maskę do siebie – to uruchamia generator tlenu – i załóż ją na nos i usta. Najpierw sobie, potem dziecku lub sąsiadowi: bez tlenu na tej wysokości zostaje kilkanaście sekund świadomości.' }
          : t < D_DES1
            ? { c: '#facc15', h: 'zniżanie awaryjne', x: 'Piloci w maskach od razu sprowadzają samolot na ok. 3 km, gdzie da się oddychać bez maski. Zniżanie jest strome (ok. 30 m na sekundę), ale pod pełną kontrolą. Tlen z generatora wystarcza na ok. 12–15 min.' }
            : { c: '#22c55e', h: 'na 3 km – bezpiecznie', x: 'Na tej wysokości można oddychać bez maski. Samolot leci do najbliższego lotniska.' };
    const tu = tuc(d.cab);
    const tuTxt = !isFinite(tu) ? 'bez ograniczeń' : tu >= 120 ? `ok. ${f0(tu / 60)} min` : `ok. ${f0(tu)} s`;
    const warn = !before && d.cab > 9550;
    return (
      <>
        <CockpitDock>
          <Ecam
            thrMode={null}
            n1={t > D_DES0 && t < D_DES1 ? [24, 24] : [78, 78]}
            egt={t > D_DES0 && t < D_DES1 ? [420, 422] : [700, 702]}
            page="CRUISE"
            warning={
              warn
                ? { title: 'CAB PR EXCESS CAB ALT', master: true, lines: ['CREW OXY MASKS.......USE', 'SIGNS..................ON', 'EMER DESCENT....INITIATE', 'PAX OXY MASKS.....MAN ON'] }
                : null
            }
            cruise={{ ff: t > D_DES0 && t < D_DES1 ? [600, 610] : [2400, 2410], fu: [8200, 8240], deltaP: d.dp, cabAlt: d.cab, cabVs: Math.round(d.cabVs / 50) * 50 }}
            footer={{ tat: -30, sat: -56, isa: 0, flt: '05:12', time: '09:41:02', gw: 280000, gwcg: 29.5, fob: 72000 }}
            width={260}
          />
        </CockpitDock>
        <InfoPortal>
          <div style={{ fontWeight: 700, color: phase.c }}>{phase.h}</div>
          {!run && <div style={{ fontSize: 12, color: '#facc15' }}>Naciśnij „Rozpocznij” – siedzisz w fotelu pasażera w czasie przelotu.</div>}
          <div style={{ fontSize: 13 }}>{phase.x}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px', fontSize: 13 }}>
            <span>wysokość lotu</span>
            <b>{f0(d.alt)} ft</b>
            <span>wysokość kabiny</span>
            <b style={{ color: d.cab > 14000 ? '#ef4444' : d.cab > 9550 ? '#f59e0b' : undefined }}>{f0(d.cab)} ft</b>
            <span>różnica ciśnień ΔP</span>
            <b>{f1(d.dp)} psi</b>
            <span>świadomość bez tlenu</span>
            <b style={{ color: isFinite(tu) && tu < 60 ? '#ef4444' : undefined }}>{tuTxt}</b>
            <span>maski tlenowe</span>
            <b>{d.masks > 0 ? 'wypadły' : 'w panelach nad fotelami'}</b>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Maski wypadają same, gdy wysokość kabiny przekroczy ok. 14 000 ft. „Czas użytecznej świadomości” to czas, przez który bez tlenu człowiek jeszcze rozsądnie działa – na wysokości przelotu to kilkanaście sekund.
          </div>
        </InfoPortal>
      </>
    );
  }
  if (view === 'cargo') {
    const t = FUS_LIVE.cargoT;
    // masy kontenerów (ok. 0,6–1,6 t – bagaż i poczta), stałe dla danego miejsca
    const mass = (i: number) => 0.6 + ((i * 37) % 11) / 10;
    const done = CARGO_SLOTS.map((sl, i) => ({ sl, i, in: canPose(sl, t).u >= 1 }));
    const fwd = done.filter((d) => d.in && d.sl.hold === 0);
    const aft = done.filter((d) => d.in && d.sl.hold === 1);
    const nAll = CARGO_SLOTS.length;
    const nIn = fwd.length + aft.length;
    const mF = fwd.reduce((a, d) => a + mass(d.i), 0);
    const mA = aft.reduce((a, d) => a + mass(d.i), 0);
    const door = cargoDoorOpen(t);
    const phase =
      t < 0
        ? 'samolot na stanowisku, pierwsze pociągi wózków czekają przy podnośnikach – drzwi ładowni zamknięte'
        : t < CARGO_T0
          ? 'drzwi ładowni otwierają się, podnośniki podjeżdżają do progu'
          : nIn < nAll
            ? 'załadunek: kontener zsuwa się z wózka na platformę, podnośnik unosi go do progu, a on jedzie po rolkach na miejsce'
            : door > 0.02
              ? 'załadunek skończony – drzwi ładowni się zamykają'
              : 'ładownie pełne, drzwi zamknięte i zaryglowane';
    return (
      <InfoPortal>
        <div style={{ fontWeight: 700, color: '#fdba74' }}>{phase}</div>
        {t < 0 && <div style={{ fontSize: 12, color: '#facc15' }}>Naciśnij „Rozpocznij”.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 14px', fontSize: 13 }}>
          <span>drzwi ładowni</span>
          <b>{door < 0.02 ? 'zamknięte' : door > 0.98 ? 'otwarte' : `${f0(door * 100)} %`}</b>
          <span>ładownia przednia</span>
          <b>
            {fwd.length} / {CARGO_SLOTS.filter((x) => x.hold === 0).length} LD3 · {f1(mF)} t
          </b>
          <span>ładownia tylna</span>
          <b>
            {aft.length} / {CARGO_SLOTS.filter((x) => x.hold === 1).length} LD3 · {f1(mA)} t
          </b>
          <span>ładunek razem</span>
          <b>{f1(mF + mA)} t</b>
          <span>przód : tył</span>
          <b>{mF + mA > 0 ? `${f0((mF / (mF + mA)) * 100)} : ${f0((mA / (mF + mA)) * 100)}` : '–'}</b>
        </div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Każdy kontener ma swoje miejsce z planu załadunku, przygotowanego tak, żeby środek ciężkości samolotu był w dopuszczalnym zakresie. Do ładowni wjeżdżają od końca: najpierw miejsca najdalej od drzwi ({CARGO_DOOR_X.length} drzwi w prawej burcie), w rzędzie najpierw dalszy pas.
        </div>
      </InfoPortal>
    );
  }
  return null;
}
