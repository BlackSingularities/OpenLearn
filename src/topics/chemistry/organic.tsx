import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneProps, Topic } from '../../lib/types';
import { InfoPortal } from '../../lib/plot';
import { Lights } from '../../lib/three';
import { MolBuilder, MoleculeModel, formula, type Mol } from '../../lib/molecule';

const PREFIX = ['', 'met', 'et', 'prop', 'but', 'pent', 'heks', 'hept', 'okt'];
const BP_ALKANE = [0, -162, -89, -42, -0.5, 36, 69, 98, 126];

function chain(n: number, first: 1 | 2 | 3 = 1) {
  const b = new MolBuilder();
  let prev = b.add('C');
  for (let k = 1; k < n; k++) prev = b.add('C', prev, k === 1 ? first : 1);
  return b;
}

function Spinner({ children, spin }: { children: React.ReactNode; spin: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin && g.current) g.current.rotation.y += dt * 0.35;
  });
  return <group ref={g}>{children}</group>;
}

/* ---------- Krok 1: szereg homologiczny ---------- */
function SeriesScene({ params }: SceneProps) {
  const type = String(params.type);
  const n = Math.max(type === 'alkan' ? 1 : 2, Number(params.n));
  const mol = useMemo(() => chain(n, type === 'alken' ? 2 : type === 'alkin' ? 3 : 1).fillH(), [n, type]);
  const name = type === 'alkan' ? `${PREFIX[n]}an` : type === 'alken' ? (n === 2 ? 'eten' : n === 3 ? 'propen' : `${PREFIX[n]}-1-en`) : n === 2 ? 'etyn' : n === 3 ? 'propyn' : `${PREFIX[n]}-1-yn`;
  const general = type === 'alkan' ? 'CₙH₂ₙ₊₂' : type === 'alken' ? 'CₙH₂ₙ' : 'CₙH₂ₙ₋₂';
  return (
    <group>
      <Lights />
      <Spinner spin={Boolean(params.spin)}>
        <MoleculeModel mol={mol} labels={Boolean(params.labels)} spacefill={Boolean(params.fill)} />
      </Spinner>
      <InfoPortal>
        <div style={{ color: '#ffd166', fontWeight: 600, fontSize: 16 }}>{name}</div>
        <div>
          wzór sumaryczny: <b>{formula(mol)}</b> (ogólny {general})
        </div>
        <div>{type === 'alkan' ? 'tylko wiązania pojedyncze – węglowodór nasycony' : type === 'alken' ? 'jedno wiązanie podwójne C=C – nienasycony' : 'jedno wiązanie potrójne C≡C – nienasycony'}</div>
        {type === 'alkan' && <div className="muted-line">temperatura wrzenia: {BP_ALKANE[n]} °C</div>}
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 2: izomeria ---------- */
const ISOMERS: Record<string, { name: string; build: () => Mol; bp: number; note: string }> = {
  butan: { name: 'butan', build: () => chain(4).fillH(), bp: -0.5, note: 'łańcuch prosty' },
  izobutan: {
    name: '2-metylopropan (izobutan)',
    build: () => {
      const b = new MolBuilder();
      const c1 = b.add('C');
      const c2 = b.add('C', c1);
      b.add('C', c2);
      b.add('C', c2);
      return b.fillH();
    },
    bp: -12,
    note: 'łańcuch rozgałęziony',
  },
  pentan: { name: 'pentan', build: () => chain(5).fillH(), bp: 36, note: 'łańcuch prosty' },
  metylobutan: {
    name: '2-metylobutan',
    build: () => {
      const b = new MolBuilder();
      const c1 = b.add('C');
      const c2 = b.add('C', c1);
      const c3 = b.add('C', c2);
      b.add('C', c3);
      b.add('C', c2);
      return b.fillH();
    },
    bp: 28,
    note: 'jedno rozgałęzienie',
  },
  neopentan: {
    name: '2,2-dimetylopropan',
    build: () => {
      const b = new MolBuilder();
      const c = b.add('C');
      for (let k = 0; k < 4; k++) b.add('C', c);
      return b.fillH();
    },
    bp: 9.5,
    note: 'cząsteczka prawie kulista',
  },
};
function IsomerScene({ params }: SceneProps) {
  const key = String(params.iso);
  const I = ISOMERS[key] ?? ISOMERS.pentan;
  const mol = useMemo(() => I.build(), [I]);
  return (
    <group>
      <Lights />
      <Spinner spin={Boolean(params.spin)}>
        <MoleculeModel mol={mol} labels spacefill={Boolean(params.fill)} />
      </Spinner>
      <InfoPortal>
        <div style={{ color: '#ffd166', fontWeight: 600, fontSize: 16 }}>{I.name}</div>
        <div>
          wzór sumaryczny: <b>{formula(mol)}</b> – {I.note}
        </div>
        <div style={{ color: '#4fc3ff' }}>temperatura wrzenia: {I.bp} °C</div>
        <div className="muted-line">ten sam wzór, inna budowa – inne właściwości</div>
      </InfoPortal>
    </group>
  );
}

/* ---------- Krok 3: grupy funkcyjne ---------- */
interface Group {
  name: string;
  cls: string;
  group: string;
  build: () => { mol: Mol; hl: number[] };
  note: string;
}
const GROUPS: Record<string, Group> = {
  etanol: {
    name: 'etanol',
    cls: 'alkohole',
    group: 'hydroksylowa –OH',
    note: 'wiązania wodorowe → wysoka temperatura wrzenia (78 °C), miesza się z wodą',
    build: () => {
      const b = new MolBuilder();
      const c1 = b.add('C');
      const c2 = b.add('C', c1);
      const o = b.add('O', c2);
      return { mol: b.fillH(), hl: [o] };
    },
  },
  etanal: {
    name: 'etanal (aldehyd octowy)',
    cls: 'aldehydy',
    group: 'aldehydowa –CHO',
    note: 'daje próbę Tollensa (lustro srebrne) i Trommera',
    build: () => {
      const b = new MolBuilder();
      const c1 = b.add('C');
      const c2 = b.add('C', c1);
      const o = b.add('O', c2, 2);
      return { mol: b.fillH(), hl: [c2, o] };
    },
  },
  propanon: {
    name: 'propanon (aceton)',
    cls: 'ketony',
    group: 'karbonylowa C=O w środku łańcucha',
    note: 'nie daje próby Tollensa – to odróżnia go od aldehydów',
    build: () => {
      const b = new MolBuilder();
      const c1 = b.add('C');
      const c2 = b.add('C', c1);
      const o = b.add('O', c2, 2);
      b.add('C', c2);
      return { mol: b.fillH(), hl: [c2, o] };
    },
  },
  kwas: {
    name: 'kwas etanowy (octowy)',
    cls: 'kwasy karboksylowe',
    group: 'karboksylowa –COOH',
    note: 'odszczepia H⁺ z grupy –OH – roztwór ma odczyn kwasowy',
    build: () => {
      const b = new MolBuilder();
      const c1 = b.add('C');
      const c2 = b.add('C', c1);
      const o1 = b.add('O', c2, 2);
      const o2 = b.add('O', c2);
      return { mol: b.fillH(), hl: [c2, o1, o2] };
    },
  },
  ester: {
    name: 'octan etylu',
    cls: 'estry',
    group: 'estrowa –COO–',
    note: 'powstaje z kwasu i alkoholu; estry pachną owocami',
    build: () => {
      const b = new MolBuilder();
      const c1 = b.add('C');
      const c2 = b.add('C', c1);
      const o1 = b.add('O', c2, 2);
      const o2 = b.add('O', c2);
      const c3 = b.add('C', o2);
      b.add('C', c3);
      return { mol: b.fillH(), hl: [c2, o1, o2] };
    },
  },
  amina: {
    name: 'etyloamina',
    cls: 'aminy',
    group: 'aminowa –NH₂',
    note: 'wolna para na azocie przyłącza H⁺ – odczyn zasadowy',
    build: () => {
      const b = new MolBuilder();
      const c1 = b.add('C');
      const c2 = b.add('C', c1);
      const n = b.add('N', c2);
      return { mol: b.fillH(), hl: [n] };
    },
  },
  chloro: {
    name: 'chlorometan',
    cls: 'fluorowcopochodne',
    group: 'atom chloru –Cl',
    note: 'polarne wiązanie C–Cl, łatwo ulega podstawieniu',
    build: () => {
      const b = new MolBuilder();
      const c = b.add('C');
      const cl = b.add('Cl', c);
      return { mol: b.fillH(), hl: [cl] };
    },
  },
  benzen: {
    name: 'benzen',
    cls: 'areny (węglowodory aromatyczne)',
    group: 'pierścień aromatyczny',
    note: 'sześć elektronów π rozmytych nad całym pierścieniem – wszystkie wiązania C–C są równe',
    build: () => {
      const b = new MolBuilder();
      const R = 1.38;
      for (let k = 0; k < 6; k++) b.atoms.push({ el: 'C', pos: new THREE.Vector3(R * Math.cos((k * Math.PI) / 3), R * Math.sin((k * Math.PI) / 3), 0) });
      for (let k = 0; k < 6; k++) b.bonds.push({ a: k, b: (k + 1) % 6, order: k % 2 ? 1 : 2 });
      return { mol: b.fillH(), hl: [0, 1, 2, 3, 4, 5] };
    },
  },
};
function GroupScene({ params }: SceneProps) {
  const G = GROUPS[String(params.g)] ?? GROUPS.etanol;
  const { mol, hl } = useMemo(() => G.build(), [G]);
  return (
    <group>
      <Lights />
      <Spinner spin={Boolean(params.spin)}>
        <MoleculeModel mol={mol} labels highlight={params.hl ? hl : []} />
      </Spinner>
      <InfoPortal>
        <div style={{ color: '#ffd166', fontWeight: 600, fontSize: 16 }}>{G.name}</div>
        <div>
          {G.cls} · wzór {formula(mol)}
        </div>
        <div style={{ color: '#4ade80' }}>grupa funkcyjna: {G.group}</div>
        <div className="muted-line">{G.note}</div>
      </InfoPortal>
    </group>
  );
}

const view = [
  { type: 'toggle' as const, key: 'fill', label: 'Model czaszowy', default: false },
  { type: 'toggle' as const, key: 'spin', label: 'Obracaj', default: true },
];

export const organic: Topic = {
  id: 'chemia-organiczna',
  title: 'Związki organiczne w 3D',
  subject: 'chemia',
  summary: 'Szereg homologiczny alkanów, alkenów i alkinów, izomery o tym samym wzorze i różnych temperaturach wrzenia oraz najważniejsze grupy funkcyjne.',
  accent: '#10b981',
  glyph: 'C',
  steps: [
    {
      title: 'Szereg homologiczny',
      kind: '3d',
      scene: SeriesScene,
      camera: [0, 1.5, 9],
      controls: [
        {
          type: 'select',
          key: 'type',
          label: 'Rodzaj',
          default: 'alkan',
          options: [
            { value: 'alkan', label: 'alkany' },
            { value: 'alken', label: 'alkeny' },
            { value: 'alkin', label: 'alkiny' },
          ],
        },
        { type: 'slider', key: 'n', label: 'Liczba atomów węgla', min: 1, max: 8, step: 1, default: 4 },
        { type: 'toggle', key: 'labels', label: 'Symbole pierwiastków', default: true },
        ...view,
      ],
      body: (
        <>
          <div className="formula">alkany CₙH₂ₙ₊₂ · alkeny CₙH₂ₙ · alkiny CₙH₂ₙ₋₂</div>
          <p>
            Kolejne związki <strong>szeregu homologicznego</strong> różnią się o grupę –CH₂–. Łańcuch węglowy układa się
            w zygzak, bo każdy atom węgla w alkanie ma wiązania skierowane do narożników tetraedru (109,5°).
          </p>
          <p>
            Wiązanie podwójne spłaszcza otoczenie węgla (120°), a potrójne prostuje je w linię (180°). Każde wiązanie
            wielokrotne „zabiera” dwa atomy wodoru. Zobacz, jak z długością łańcucha rośnie temperatura wrzenia.
          </p>
        </>
      ),
    },
    {
      title: 'Izomeria łańcuchowa',
      kind: '3d',
      scene: IsomerScene,
      camera: [0, 1.5, 8],
      controls: [
        {
          type: 'select',
          key: 'iso',
          label: 'Izomer',
          default: 'pentan',
          options: [
            { value: 'butan', label: 'butan' },
            { value: 'izobutan', label: 'izobutan' },
            { value: 'pentan', label: 'pentan' },
            { value: 'metylobutan', label: '2-metylobutan' },
            { value: 'neopentan', label: 'dimetylopropan' },
          ],
        },
        ...view,
      ],
      body: (
        <>
          <p>
            <strong>Izomery</strong> mają ten sam wzór sumaryczny, ale inną budowę. C₅H₁₂ to aż trzy różne związki.
          </p>
          <p>
            Im bardziej rozgałęziona cząsteczka, tym bardziej przypomina kulkę i tym mniejszą powierzchnią styka się z
            sąsiadami. Siły międzycząsteczkowe słabną, więc <strong>temperatura wrzenia spada</strong> – z 36 °C dla
            pentanu do 9,5 °C dla 2,2-dimetylopropanu. Włącz model czaszowy, żeby to zobaczyć.
          </p>
        </>
      ),
    },
    {
      title: 'Grupy funkcyjne',
      kind: '3d',
      scene: GroupScene,
      camera: [0, 1.5, 8],
      controls: [
        {
          type: 'select',
          key: 'g',
          label: 'Związek',
          default: 'etanol',
          options: Object.entries(GROUPS).map(([value, g]) => ({ value, label: g.cls.split(' ')[0] })),
        },
        { type: 'toggle', key: 'hl', label: 'Podświetl grupę funkcyjną', default: true },
        { type: 'toggle', key: 'spin', label: 'Obracaj', default: true },
      ],
      body: (
        <>
          <p>
            <strong>Grupa funkcyjna</strong> to fragment cząsteczki, który decyduje o jej właściwościach chemicznych.
            Reszta – łańcuch węglowy – jest dość obojętna.
          </p>
          <p>
            Ten sam szkielet etylowy z grupą –OH to alkohol, z –CHO aldehyd, z –COOH kwas, a z –NH₂ amina. Kwas i
            alkohol łączą się w ester, oddając cząsteczkę wody. Podświetlone atomy tworzą grupę funkcyjną.
          </p>
        </>
      ),
    },
  ],
};
