/**
 * Geração determinística da população de NPCs (identidade, aparência, personalidade,
 * função, casa, local de trabalho e rotina). A mesma semente gera sempre os mesmos
 * habitantes, o que permite aumentar/reduzir a população sem "baralhar" os existentes:
 * o NPC n.º k é sempre o mesmo para uma dada semente.
 */
import { makeRng, hashString } from '../../../shared/rng.js';
import { POIS } from '../../../shared/zone.js';
import { ARCHETYPES, DEFAULT_ARCHETYPE_WEIGHTS, ARCHETYPE_MINIMUMS } from './archetypes.js';

const NAMES = {
  m: ['António', 'Manuel', 'João', 'Domingos', 'Mateus', 'Paulo', 'Francisco', 'Adilson', 'Edson', 'Hélder', 'Nelson', 'Valdemar', 'Kiluanji', 'Zeca', 'Delfim', 'Augusto', 'Bartolomeu', 'Osvaldo', 'Celestino', 'Mbinda', 'Lucas', 'Arlindo', 'Ngunza', 'Faustino', 'Moisés', 'Agostinho', 'Cristóvão', 'Isaías', 'Benvindo', 'Gaspar'],
  f: ['Maria', 'Ana', 'Teresa', 'Esperança', 'Luzia', 'Nzinga', 'Isabel', 'Joana', 'Celeste', 'Djamila', 'Yola', 'Rosa', 'Graça', 'Madalena', 'Feliciana', 'Neusa', 'Edna', 'Kiesse', 'Marisa', 'Domingas', 'Fátima', 'Helena', 'Wanda', 'Laurinda', 'Josefa', 'Conceição', 'Ndalu', 'Paulina', 'Ermelinda', 'Telma'],
};
const SURNAMES = ['Santos', 'Kiala', 'Neto', 'Bento', 'Lopes', 'Mateus', 'Domingos', 'Kalunga', 'Mbala', 'Cassule', 'Camuto', 'Vunge', 'Muteka', 'Sapalo', 'Chissola', 'Lumbo', 'Sebastião', 'Fernandes', 'Gomes', 'Tchipa', 'Kapinga', 'Ndombele', 'Cassoma', 'Miguel', 'Quitumba', 'Bumba', 'Njinga', 'Pascoal'];

const SKIN_TONES = ['#3b2219', '#4a2c20', '#5a3825', '#6b4430', '#7a4f37', '#8d5d3f', '#a06a48', '#b97b54', '#c98e66', '#e0ac85'];
const HAIR = {
  m: ['curto', 'rapado', 'afro', 'dreads', 'careca', 'trancas_curtas', 'degradê'],
  f: ['trancas', 'afro', 'coque', 'liso_comprido', 'curto', 'lenco', 'rabo_cavalo'],
};
const HAIR_COLORS = ['#0d0b0a', '#1b1410', '#2b1d16', '#3a2618'];
const AGE_GROUPS = [['jovem_adulto', 4], ['adulto', 4], ['meia_idade', 2], ['senior', 1]];
const TOPS = { m: ['t-shirt', 'camisa', 'polo', 'casaco_leve', 'camisa_capulana'], f: ['t-shirt', 'blusa', 'vestido', 'camisa_capulana', 'casaco_leve'] };
const BOTTOMS = { m: ['calca_ganga', 'calca', 'calcoes'], f: ['calca_ganga', 'saia', 'calca', 'saia_capulana'] };
const CLOTH_COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00897b', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#f5f5f5', '#212121', '#6d4c41', '#90a4ae', '#ffb300', '#26c6da'];
const BOTTOM_COLORS = ['#1c2a48', '#263238', '#3e2723', '#455a64', '#c5b38a', '#1a1a1a', '#5d4037', '#283593'];
const ACCESSORIES = [['nenhum', 6], ['oculos', 2], ['bone', 2], ['chapeu', 1], ['auscultadores', 1], ['fio', 1], ['lenco_cabeca', 1]];

function rangePick(rng, [a, b]) { return Math.round(rng.range(a, b) * 100) / 100; }

/** Distribui `count` NPCs pelos arquétipos respeitando mínimos e pesos configurados. */
export function planArchetypes(count, weights = DEFAULT_ARCHETYPE_WEIGHTS, minimums = ARCHETYPE_MINIMUMS, seed = 'kianda') {
  const rng = makeRng(`${seed}:archetypes`);
  const plan = [];
  for (const [a, n] of Object.entries(minimums)) {
    if ((weights[a] ?? 0) <= 0) continue;
    for (let i = 0; i < n && plan.length < count; i++) plan.push(a);
  }
  const entries = Object.entries(weights).filter(([a, w]) => ARCHETYPES[a] && w > 0);
  while (plan.length < count) plan.push(rng.weighted(entries));
  return plan;
}

export function generateAppearance(rng, gender, archetype, ageGroup) {
  const a = ARCHETYPES[archetype];
  const uniform = a.uniform;
  const senior = ageGroup === 'senior';
  const hairStyle = rng.pick(HAIR[gender]);
  return {
    gender,
    ageGroup,
    height: Math.round((gender === 'm' ? rng.range(1.64, 1.92) : rng.range(1.55, 1.80)) * (senior ? 0.97 : 1) * 100) / 100,
    bodyType: rng.weighted([['magro', 3], ['medio', 5], ['robusto', 2]]),
    skinTone: rng.pick(SKIN_TONES),
    face: { shape: rng.int(0, 3), eyes: rng.int(0, 3), beard: gender === 'm' && rng.chance(0.35) ? rng.pick(['barba_curta', 'bigode', 'pera']) : 'nenhuma' },
    hairStyle,
    hairColor: senior ? rng.pick(['#9e9e9e', '#bdbdbd', '#e0e0e0']) : rng.chance(0.08) ? rng.pick(['#8d2a1a', '#c49a54']) : rng.pick(HAIR_COLORS),
    top: uniform?.top ?? rng.pick(TOPS[gender]),
    topColor: uniform ? rng.pick(uniform.topColors) : rng.pick(CLOTH_COLORS),
    topPattern: (uniform?.top ?? '').includes('capulana') || rng.chance(0.15) ? rng.pick(['capulana', 'riscas', 'liso']) : 'liso',
    bottom: archetype === 'mecanico' ? 'macacao' : rng.pick(BOTTOMS[gender]),
    bottomColor: rng.pick(BOTTOM_COLORS),
    shoes: rng.pick(['#1a1a1a', '#5d4037', '#f5f5f5', '#8d6e63']),
    accessory: uniform?.accessory ?? rng.weighted(ACCESSORIES),
    posture: senior ? 'curvada' : rng.weighted([['normal', 6], ['confiante', 2], ['relaxada', 2]]),
    walkSpeed: Math.round((senior ? rng.range(0.95, 1.15) : rng.range(1.2, 1.55)) * 100) / 100,
  };
}

/**
 * Gera a população.
 * @param {object} opts { count, seed, weights, archetypeStatus }
 */
export function generatePopulation({ count = 60, seed = 'kianda', weights = DEFAULT_ARCHETYPE_WEIGHTS, minimums = ARCHETYPE_MINIMUMS } = {}) {
  const plan = planArchetypes(count, weights, minimums, seed);
  const homes = POIS.filter((p) => p.type === 'home').map((p) => ({ poi: p, free: p.capacity }));
  const workplacesUsed = new Map();
  const npcs = [];

  for (let i = 0; i < plan.length; i++) {
    const archetype = plan[i];
    const def = ARCHETYPES[archetype];
    const rng = makeRng(`${seed}:npc:${i}:${archetype}`);
    const gender = rng.chance(0.5) ? 'm' : 'f';
    const ageGroup = archetype === 'treinador' ? 'adulto' : rng.weighted(AGE_GROUPS);
    const firstName = rng.pick(NAMES[gender]);
    const name = `${firstName} ${rng.pick(SURNAMES)}`;

    // casa: preferir o bairro residencial, respeitando a capacidade
    const freeHomes = homes.filter((h) => h.free > 0);
    const home = freeHomes.length ? freeHomes[Math.floor(rng.next() * freeHomes.length)] : homes[Math.floor(rng.next() * homes.length)];
    if (home.free > 0) home.free -= 1;

    // local de trabalho: POI do tipo certo com menor ocupação
    let workplace = null;
    if (def.workplaceTypes.length) {
      const cands = POIS.filter((p) => def.workplaceTypes.includes(p.type));
      cands.sort((a, b) => (workplacesUsed.get(a.id) ?? 0) / a.capacity - (workplacesUsed.get(b.id) ?? 0) / b.capacity || hashString(`${seed}${i}${a.id}`) - hashString(`${seed}${i}${b.id}`));
      workplace = cands[0] ?? null;
      if (workplace) workplacesUsed.set(workplace.id, (workplacesUsed.get(workplace.id) ?? 0) + 1);
    }

    const shiftIndex = def.shifts ? rng.int(0, def.shifts.length - 1) : 0;
    const routine = (def.shifts ? def.shifts[shiftIndex] : def.routine).slice().sort((x, y) => x.from - y.from);

    const traits = {};
    for (const [t, r] of Object.entries(def.traits)) traits[t] = rangePick(rng, r);
    traits.humor = Math.round(rng.next() * 100) / 100;
    traits.curiosity = Math.round(rng.next() * 100) / 100;
    traits.energy = Math.round(rng.range(ageGroup === 'senior' ? 0.2 : 0.4, 1) * 100) / 100;

    const preferences = {
      favouritePlace: rng.pick(['plaza', 'park', 'cafe', 'restaurant', 'bench', 'arena']),
      likesTalking: traits.talkativeness > 0.55,
      speechRegister: traits.formality > 0.65 ? 'formal' : traits.formality < 0.3 ? 'calao_luandense' : 'neutro',
    };

    npcs.push({
      id: `npc_${seed}_${String(i).padStart(4, '0')}`,
      index: i,
      isAI: true,
      kind: 'npc_habitante',
      name,
      firstName,
      archetype,
      role: def.label,
      appearance: generateAppearance(rng, gender, archetype, ageGroup),
      personality: { traits, preferences, bio: buildBio({ firstName, archetype, def, preferences, traits }) },
      homePoiId: home.poi.id,
      workplacePoiId: workplace?.id ?? null,
      shiftIndex,
      routine,
      scheduleJitterH: Math.round(rng.range(-0.4, 0.4) * 100) / 100,
      dialogueTopics: def.dialogueTopics,
      limits: {
        canDrive: archetype === 'condutor' || archetype === 'mecanico',
        // NPCs NUNCA têm acesso à carteira, resultados ou dados de outros jogadores
        canTouchEconomy: false,
        canAffectCompetitionResults: false,
      },
      status: 'active',
    });
  }
  return npcs;
}

function buildBio({ firstName, archetype, def, preferences }) {
  const place = {
    plaza: 'o Largo da Kianda', park: 'o Jardim do Parque', cafe: 'o Café Marginal',
    restaurant: 'o Restaurante da Ilha', bench: 'os bancos do Largo', arena: 'a Arena Kianda',
  }[preferences.favouritePlace];
  return `${firstName} é ${def.label.toLowerCase()} em Kianda Centro e gosta de passar tempo n${place.startsWith('a ') ? 'a' : 'o'} ${place.slice(2)}.`;
}
