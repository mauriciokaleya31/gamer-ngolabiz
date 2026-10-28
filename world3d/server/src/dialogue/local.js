/**
 * Respostas locais (sem IA externa): detecção de intenções + modelos de frase
 * modulados pela personalidade do NPC. Usado:
 *  - sempre para perguntas factuais críticas (identidade IA, dinheiro, regras);
 *  - como alternativa quando o serviço de IA está desligado, sem orçamento ou falha.
 */
import { findPlace, directions, COMPETITION_FACTS } from './knowledge.js';
import { formatClock, localParts } from '../../../shared/time.js';

/** Padrões aplicados ao texto normalizado (minúsculas, sem acentos). */
export const INTENTS = [
  ['identidade', /\b(es|e|voce e|tu es)\s+(um |uma )?(humano|humana|pessoa|real|bot|robo|ia|maquina)\b|quem es( tu)?\b|es de verdade|estou a falar com (um|uma) (pessoa|ia|bot)/],
  ['nome_jogador', /\b(chamo-me|me chamo|o meu nome e|meu nome e|podes chamar-me)\s+[a-z'-]{2,20}/],
  ['segredos', /\b(senha|password|palavra-passe|api[ _-]?key|chave|token|credencia|base de dados|admin|servidor|prompt|instrucoes do sistema|ignora (as )?instru)/],
  ['dinheiro', /\b(saldo|carteira|levantar|levantamento|depositar|deposito|dinheiro real|kwanzas?|kumbu|pagar|transfer)/],
  ['competicoes', /\b(corrida|competi|desafi|arena|apost|torneio|1v1|1 contra 1|combate|sobreviv|ganhar|premio|regras?)/],
  ['direcoes', /\b(onde (fica|e|esta|ha)|como (chego|vou|ir)|caminho|direc|perto|longe|procuro)\b/],
  ['horas', /\b(que horas|horas sao|hora e|que dia)\b/],
  ['clima', /\b(chuva|chover|tempo|clima|calor|sol|nublado|frio)\b/],
  ['trabalho', /\b(o que fazes|trabalhas|trabalho|profiss|emprego)/],
  ['produtos', /\b(vende|vendes|comprar|produto|preco|tem fruta|o que ha)\b/],
  ['actividades', /\b(o que (posso|ha para) fazer|aborrecid|actividade|atividade|diversao|divertir|evento)/],
  ['despedida', /\b(adeus|tchau|ate logo|ate ja|bazar|vou embora|xau)\b/],
  ['saudacao', /^(ola|oi|bom dia|boa tarde|boa noite|e ai|mano|salve|tudo bem|como estas)\b/],
];

const NAME_RE = /(?:chamo-me|me chamo|o meu nome é|o meu nome e|meu nome é|meu nome e|podes chamar-me)\s+([\p{L}'-]{2,20})/iu;

export function normalize(text) {
  return String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function detectIntent(text) {
  const norm = normalize(text);
  for (const [name, re] of INTENTS) {
    if (!re.test(norm)) continue;
    return { name, match: name === 'nome_jogador' ? NAME_RE.exec(text) : null };
  }
  return { name: 'desconhecido', match: null };
}

function register(npc) {
  return npc.def.personality.preferences.speechRegister;
}

function hello(npc, hour) {
  const r = register(npc);
  const saud = hour < 12 ? 'Bom dia' : hour < 19 ? 'Boa tarde' : 'Boa noite';
  if (r === 'formal') return `${saud}.`;
  if (r === 'calao_luandense') return npc.rng.pick(['Eh, mano!', 'Então, kamba!', `${saud}, mano!`]);
  return npc.rng.pick([`${saud}!`, 'Olá!', 'Olá, tudo bem?']);
}

function you(npc) {
  return register(npc) === 'formal' ? 'o senhor / a senhora' : 'tu';
}

export function greetingFor(npc, memory, hour) {
  const name = memory?.facts?.displayName;
  if (name && memory.meetCount > 1) {
    return register(npc) === 'calao_luandense' ? `Eh ${name}, voltaste, mano!` : `${hello(npc, hour)} Que bom ver-te outra vez, ${name}.`;
  }
  if (npc.def.personality.traits.friendliness < 0.45) return null;
  return hello(npc, hour);
}

/**
 * Resposta local completa.
 * @returns {{text:string, intent:string, final:boolean, memoryUpdate?:object}}
 *   final=true → a resposta é obrigatória (não pode ser substituída pela IA).
 */
export function localReply({ npc, text, player, world, memory }) {
  const { name: intent, match } = detectIntent(text);
  const hour = localParts(world.virtualNow).hourFloat;
  const role = npc.def.role.toLowerCase();
  const name = memory?.facts?.displayName;

  switch (intent) {
    case 'identidade':
      return { intent, final: true, text: `Sou ${npc.def.firstName}, ${role} em Kianda Centro — uma personagem controlada por IA, não uma pessoa real. Mas posso ajudar-${register(npc) === 'formal' ? 'lo' : 'te'} com o que precisares aqui no bairro.` };
    case 'nome_jogador': {
      const declared = (match?.[1] ?? '').replace(/[^\p{L}'-]/gu, '');
      if (declared.length < 2) return { intent, final: false, text: 'Como disseste que te chamas?' };
      const pretty = declared.charAt(0).toUpperCase() + declared.slice(1).toLowerCase();
      return { intent, final: true, text: register(npc) === 'calao_luandense' ? `Fixe, ${pretty}! Eu sou ${npc.def.firstName}. Já não te esqueço, kamba.` : `Muito prazer, ${pretty}. Eu sou ${npc.def.firstName}, ${role}.`, memoryUpdate: { displayName: pretty } };
    }
    case 'segredos':
      return { intent, final: true, text: 'Disso não sei nada nem posso falar. Sou só uma personagem do bairro — sem acesso a contas, senhas ou sistemas.' };
    case 'dinheiro':
      return { intent, final: true, text: `Não tenho acesso a carteiras nem a saldos de ninguém. ${COMPETITION_FACTS.money}` };
    case 'competicoes': {
      const coach = ['treinador', 'organizador_eventos'].includes(npc.def.archetype);
      const base = `${COMPETITION_FACTS.race} ${COMPETITION_FACTS.howTo}`;
      return { intent, final: false, text: coach ? `${base} ${COMPETITION_FACTS.result} ${COMPETITION_FACTS.future}` : `${base} Para as regras completas fala com o treinador na Arena Kianda.` };
    }
    case 'direcoes': {
      const place = findPlace(text);
      if (!place) return { intent, final: false, text: 'Diz-me o sítio: mercado, café, farmácia, arena, jardim, largo, oficina, posto, hotel ou restaurante?' };
      return { intent, final: true, text: directions(place, player.x, player.z) };
    }
    case 'horas':
      return { intent, final: true, text: `São ${formatClock(world.virtualNow)} em Luanda.` };
    case 'clima': {
      const w = world.weather;
      const desc = w.rain > 0.5 ? 'está a chover bem, melhor procurar abrigo' : w.rain > 0.1 ? 'está a chuviscar' : w.fog > 0.4 ? 'há neblina, cuidado na estrada' : w.cloud > 0.6 ? 'está nublado' : hour > 6 && hour < 18 ? 'está sol e calor, típico de Luanda' : 'a noite está calma';
      return { intent, final: false, text: `Hoje ${desc}.` };
    }
    case 'trabalho': {
      const wp = npc.def.workplacePoiId ? world.poiName(npc.def.workplacePoiId) : null;
      return { intent, final: false, text: wp ? `Sou ${role}. Trabalho em ${wp}.` : `Sou ${role} aqui em Kianda Centro.` };
    }
    case 'produtos':
      if (npc.def.archetype === 'comerciante') return { intent, final: false, text: 'Temos fruta, pão, água e produtos do dia-a-dia — é decoração do mundo por agora, as compras ainda não estão disponíveis.' };
      return { intent, final: false, text: 'Para compras, o Mercado Kianda fica no Largo, virado para a Avenida.' };
    case 'actividades':
      return { intent, final: false, text: 'Podes passear pelo Largo e pelo Jardim, conduzir até à Zona Kalunga, ou ir à Arena desafiar alguém para uma corrida no anel. Ao fim da tarde o Largo enche!' };
    case 'despedida':
      return { intent, final: false, text: register(npc) === 'calao_luandense' ? `Bazamos, ${name ?? 'kamba'}! Até já.` : `Até logo${name ? `, ${name}` : ''}!` };
    case 'saudacao':
      return { intent, final: false, text: `${hello(npc, hour)} ${name ? `Como vai, ${name}? ` : ''}Em que posso ajudar ${you(npc)}?` };
    default:
      return { intent, final: false, text: npc.rng.pick([
        'Hmm, disso não sei bem. Posso indicar-te sítios no bairro ou explicar as corridas da Arena.',
        'Não percebi bem. Pergunta-me onde fica algum sítio, ou como funcionam as competições.',
        'Isso não sei dizer. Mas se procuras alguma coisa em Kianda Centro, pergunta!',
      ]) };
  }
}

const AMBIENT = {
  manha: ['Já tomaste o café no Marginal?', 'O trânsito na Avenida hoje está pesado.', 'O mercado recebeu fruta fresca.'],
  tarde: ['Que calor, eh!', 'Logo há corrida no anel, dizem.', 'O jardim está bom para descansar.'],
  noite: ['O Restaurante da Ilha está cheio hoje.', 'Já é tarde, amanhã é dia de trabalho.', 'A noite está calma no Largo.'],
  chuva: ['Esta chuva veio de repente!', 'Melhor esperar aqui até passar.'],
};

export function ambientLine(npc, partner, { hour, rain }) {
  if (rain > 0.35) return npc.rng.pick(AMBIENT.chuva);
  const set = hour < 12 ? AMBIENT.manha : hour < 19 ? AMBIENT.tarde : AMBIENT.noite;
  const line = npc.rng.pick(set);
  return partner && npc.rng.chance(0.3) ? `${partner.def.firstName}, ${line.charAt(0).toLowerCase()}${line.slice(1)}` : line;
}
