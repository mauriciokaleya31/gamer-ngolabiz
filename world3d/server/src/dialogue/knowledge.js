/**
 * Base de conhecimento do mundo: a ÚNICA informação factual que os NPCs podem usar
 * (respostas locais e contexto enviado ao modelo de linguagem). Assim os NPCs não
 * inventam funcionalidades que não existem.
 */
import { POIS, ROADS, RACE_TRACK, trackLength } from '../../../shared/zone.js';

export const PLACES = [
  { key: 'mercado', poi: 'mercado_balcao', name: 'Mercado Kianda', aliases: ['mercado', 'supermercado', 'mercearia', 'compras'] },
  { key: 'cafe', poi: 'cafe_marginal_porta', name: 'Café Marginal', aliases: ['café', 'cafe', 'pastelaria', 'pequeno-almoço', 'pequeno almoço'] },
  { key: 'restaurante', poi: 'restaurante_ilha_porta', name: 'Restaurante da Ilha', aliases: ['restaurante', 'comer', 'jantar', 'almoço', 'almoco', 'comida'] },
  { key: 'farmacia', poi: 'farmacia_porta', name: 'Farmácia Ngola (24h)', aliases: ['farmácia', 'farmacia', 'remédio', 'remedio'] },
  { key: 'hotel', poi: 'hotel_kianda_porta', name: 'Hotel Kianda', aliases: ['hotel', 'dormir'] },
  { key: 'oficina', poi: 'oficina_kalunga_porta', name: 'Oficina Kalunga Motors', aliases: ['oficina', 'mecânico', 'mecanico', 'reparar', 'garagem', 'mota', 'carro'] },
  { key: 'arena', poi: 'arena_centro', name: 'Arena Kianda', aliases: ['arena', 'competição', 'competicao', 'corrida', 'desafio', 'treinador'] },
  { key: 'jardim', poi: 'jardim_centro', name: 'Jardim do Parque', aliases: ['jardim', 'parque', 'árvores', 'arvores', 'quiosque'] },
  { key: 'largo', poi: 'largo_centro', name: 'Largo da Kianda', aliases: ['largo', 'praça', 'praca', 'fonte', 'palco', 'centro'] },
  { key: 'posto', poi: 'posto_loja', name: 'Posto Kwanza Energia', aliases: ['posto', 'gasolina', 'combustível', 'combustivel', 'bomba'] },
  { key: 'ginasio', poi: 'ginasio_porta', name: 'Ginásio Kianda Fit', aliases: ['ginásio', 'ginasio', 'treinar', 'musculação'] },
  { key: 'paragem', poi: 'paragem_av', name: 'Paragem da Avenida', aliases: ['paragem', 'autocarro', 'candongueiro', 'táxi', 'taxi'] },
  { key: 'barbearia', poi: 'barbearia_porta', name: 'Barbearia Estilo', aliases: ['barbearia', 'barbeiro', 'cabelo', 'corte'] },
  { key: 'moda', poi: 'loja_muxima_porta', name: 'Moda Muxima', aliases: ['roupa', 'moda', 'loja de roupa', 'vestir', 'sapatos'] },
  { key: 'estacionamento', poi: 'estacionamento', name: 'Parque de Estacionamento Kalunga', aliases: ['estacionamento', 'estacionar', 'parque de carros'] },
];

const POI_BY_ID = new Map(POIS.map((p) => [p.id, p]));

export function findPlace(text) {
  const t = text.toLowerCase();
  let best = null;
  for (const p of PLACES) {
    for (const a of p.aliases) {
      if (t.includes(a) && (!best || a.length > best.len)) best = { place: p, len: a.length };
    }
  }
  return best?.place ?? null;
}

function cardinal(dx, dz) {
  // Norte = -Z, Este = +X
  const ang = (Math.atan2(dx, -dz) * 180) / Math.PI; // 0 = Norte, 90 = Este
  const dirs = ['Norte', 'Nordeste', 'Este', 'Sudeste', 'Sul', 'Sudoeste', 'Oeste', 'Noroeste'];
  return dirs[Math.round((((ang % 360) + 360) % 360) / 45) % 8];
}

function nearestRoadName(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const r of ROADS) {
    const d = r.axis === 'x'
      ? (x >= r.from && x <= r.to ? Math.abs(z - r.at) : Infinity)
      : (z >= r.from && z <= r.to ? Math.abs(x - r.at) : Infinity);
    if (d < bestD) { bestD = d; best = r; }
  }
  return bestD < 40 ? best.name : null;
}

/** Indicações a partir da posição real do jogador (deterministas, sem IA). */
export function directions(place, fromX, fromZ) {
  const poi = POI_BY_ID.get(place.poi);
  if (!poi) return null;
  const dx = poi.x - fromX;
  const dz = poi.z - fromZ;
  const dist = Math.hypot(dx, dz);
  const road = nearestRoadName(poi.x, poi.z);
  if (dist < 12) return `${place.name} é mesmo aqui ao lado.`;
  const meters = dist < 100 ? Math.round(dist / 5) * 5 : Math.round(dist / 10) * 10;
  return `${place.name} fica a cerca de ${meters} m para ${cardinal(dx, dz)}${road ? `, junto à ${road}` : ''}.`;
}

export const COMPETITION_FACTS = {
  race: `Corrida no ${RACE_TRACK.name}: uma volta de cerca de ${Math.round(trackLength() / 10) * 10} m com ${RACE_TRACK.checkpoints.length} pontos de controlo, de carro ou de mota. A partida é na Rua das Acácias.`,
  howTo: 'Para desafiar alguém: aproxima-te de outro jogador, abre o perfil (tecla P ou clique) e escolhe "Desafiar para corrida". Também podes treinar contra um bot de treino identificado no Quadro de Desafios da Arena.',
  result: 'O resultado é calculado pelo servidor a partir dos pontos de controlo; nenhum NPC decide vencedores.',
  money: 'Nesta fase só existe saldo de demonstração (Kz demo, sem valor real). Não há depósitos nem levantamentos no Mundo 3D. Exemplo: 1.000 Kz demo cada → prémio de 1.800 Kz demo ao vencedor e 200 Kz demo de taxa.',
  future: 'Combate 1 contra 1 e provas de sobrevivência estão planeados mas ainda não estão disponíveis.',
};

export const WORLD_FACTS = [
  'Kianda Centro é uma zona fictícia inspirada em Luanda, Angola, com o Largo da Kianda, a Avenida da Kianda, o Jardim do Parque, a Arena Kianda e a Zona Kalunga.',
  'A hora do mundo segue o fuso Africa/Luanda.',
  'As lojas têm horários: Mercado Kianda 7h–21h, Café Marginal 6h–23h, Farmácia Ngola 24h, Restaurante da Ilha 11h–24h, Oficina Kalunga 7h–19h.',
  'Os jogadores podem andar, correr, saltar, conduzir carros e motas, conversar, adicionar amigos e desafiar outros jogadores para corridas gratuitas ou com saldo demo.',
  'Os habitantes como tu são personagens controladas por IA. Os jogadores humanos aparecem com etiqueta de jogador.',
  COMPETITION_FACTS.race,
  COMPETITION_FACTS.howTo,
  COMPETITION_FACTS.result,
  COMPETITION_FACTS.money,
  COMPETITION_FACTS.future,
];

/** Funcionalidades que existem — usadas pelo filtro anti-alucinação. */
export const EXISTING_FEATURES = ['andar', 'correr', 'saltar', 'conduzir', 'corrida', 'amigos', 'grupo', 'chat', 'perfil', 'classificação', 'histórico', 'saldo demo'];
