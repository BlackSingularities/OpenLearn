import type { Topic } from '../lib/types';
import { unitCircle } from './math/unitCircle';
import { quadratic } from './math/quadratic';
import { derivative } from './math/derivative';
import { linear } from './math/linear';
import { transformations } from './math/transformations';
import { polynomials } from './math/polynomials';
import { rational } from './math/rational';
import { exponential } from './math/exponential';
import { trigGraphs } from './math/trigGraphs';
import { sequences } from './math/sequences';
import { optimization } from './math/optimization';
import { pythagoras } from './math/pythagoras';
import { similarity } from './math/similarity';
import { circleAngles } from './math/circleAngles';
import { analytic } from './math/analytic';
import { solids } from './math/solids';
import { probability } from './math/probability';
import { statistics } from './math/statistics';
import { kepler } from './physics/kepler';
import { oscillations } from './physics/oscillations';
import { projectile } from './physics/projectile';
import { efield } from './physics/efield';
import { kinematics } from './physics/kinematics';
import { dynamics } from './physics/dynamics';
import { momentum } from './physics/momentum';
import { energy } from './physics/energy';
import { circular } from './physics/circular';
import { gravity } from './physics/gravity';
import { fluids } from './physics/fluids';
import { gas } from './physics/gas';
import { circuits } from './physics/circuits';
import { magnetism } from './physics/magnetism';
import { induction } from './physics/induction';
import { optics } from './physics/optics';
import { sound } from './physics/sound';
import { quantum } from './physics/quantum';
import { interference } from './waves/interference';
import { airplane } from './aviation/airplane';
import { molecules } from './chemistry/molecules';
import { orbitals } from './chemistry/orbitals';
import { bonds } from './chemistry/bonds';
import { kinetics } from './chemistry/kinetics';
import { organic } from './chemistry/organic';
import { atom } from './chemistry/atom';
import { periodic } from './chemistry/periodic';
import { radioactivity } from './chemistry/radioactivity';
import { stoichiometry } from './chemistry/stoichiometry';
import { solutions } from './chemistry/solutions';
import { acidbase } from './chemistry/acidbase';
import { electrochem } from './chemistry/electrochem';
import { states } from './chemistry/states';
import { crystals } from './chemistry/crystals';
import { versification } from './polish/versification';
import { figures } from './polish/figures';
import { epochs } from './polish/epochs';
import { syntax } from './polish/syntax';
import { genres } from './polish/genres';
import { morphology } from './polish/morphology';
import { wordformation } from './polish/wordformation';
import { phonetics } from './polish/phonetics';
import { communication } from './polish/communication';
import { rhetoric } from './polish/rhetoric';
import { tenses } from './english/tenses';
import { conditionals } from './english/conditionals';
import { passive } from './english/passive';
import { reported } from './english/reported';

/**
 * Rejestr wszystkich tematów. Aby dodać nowy temat:
 * 1. utwórz plik w src/topics/<przedmiot>/<temat>.tsx eksportujący obiekt `Topic`,
 * 2. dopisz go do tej tablicy.
 * Na stronie głównej tematy są grupowane w sekcje według pola `subject`.
 */
export const topics: Topic[] = [
  linear,
  quadratic,
  transformations,
  polynomials,
  rational,
  exponential,
  unitCircle,
  trigGraphs,
  sequences,
  derivative,
  optimization,
  pythagoras,
  similarity,
  circleAngles,
  analytic,
  solids,
  probability,
  statistics,
  kinematics,
  dynamics,
  momentum,
  energy,
  projectile,
  circular,
  gravity,
  kepler,
  oscillations,
  sound,
  interference,
  fluids,
  gas,
  efield,
  circuits,
  magnetism,
  induction,
  optics,
  quantum,
  atom,
  periodic,
  bonds,
  crystals,
  molecules,
  orbitals,
  kinetics,
  states,
  stoichiometry,
  solutions,
  acidbase,
  electrochem,
  radioactivity,
  organic,
  airplane,
  genres,
  versification,
  figures,
  epochs,
  rhetoric,
  phonetics,
  morphology,
  wordformation,
  syntax,
  communication,
  tenses,
  passive,
  conditionals,
  reported,
];

/**
 * Dawne osobne tematy lotnicze są teraz zakładkami modułów samolotu – stare adresy przekierowują
 * do odpowiedniej zakładki (offset – liczba zakładek dodanych przed dawnymi krokami).
 */
export const legacyTopics: Record<string, { topic: string; module: string; offset: number }> = {
  'silnik-odrzutowy': { topic: 'samolot-pasazerski', module: 'silnik', offset: 0 },
  'skrzydlo-sila-nosna': { topic: 'samolot-pasazerski', module: 'skrzydlo', offset: 2 },
  'sterowanie-statecznosc': { topic: 'samolot-pasazerski', module: 'usterzenie', offset: 1 },
};
