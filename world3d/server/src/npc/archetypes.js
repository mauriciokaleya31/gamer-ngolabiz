/**
 * Arquétipos (profissões/funções) dos NPCs habitantes do mundo aberto.
 *
 * IMPORTANTE: NPCs habitantes ≠ bots de treino ≠ jogadores humanos.
 * Todos os NPCs são marcados como personagens de IA (isAI = true) e
 * identificam-se como tal quando questionados.
 *
 * Rotinas: blocos horários (hora virtual de Luanda). Cada bloco tem um modo:
 *  - sleep       : em casa (não replicado, simulação dormente)
 *  - work        : no posto de trabalho atribuído (workplace)
 *  - patrol      : percorre uma ronda (seguranças)
 *  - drive       : conduz um veículo de trânsito
 *  - roam        : escolhe destinos de lazer ponderados, com tempo de permanência
 *  - home        : regressa a casa (fica dentro, mas acordado)
 */

export const ARCHETYPES = {
  comerciante: {
    label: 'Comerciante',
    workplaceTypes: ['shop_counter', 'kiosk', 'shop'],
    uniform: { top: 'avental', topColors: ['#2e7d32', '#1565c0', '#8d6e63'] },
    dialogueTopics: ['produtos', 'direcoes', 'mundo', 'horarios'],
    traits: { friendliness: [0.6, 0.95], talkativeness: [0.5, 0.9], formality: [0.4, 0.8] },
    routine: [
      { from: 0, to: 6.2, mode: 'sleep' },
      { from: 6.2, to: 7, mode: 'roam', options: [['cafe', 3], ['plaza', 1]] },
      { from: 7, to: 19, mode: 'work' },
      { from: 19, to: 21, mode: 'roam', options: [['restaurant', 2], ['plaza', 2], ['bench', 1]] },
      { from: 21, to: 24, mode: 'sleep' },
    ],
  },
  empregado_cafe: {
    label: 'Empregado de Café',
    workplaceTypes: ['cafe', 'restaurant'],
    uniform: { top: 'camisa_avental', topColors: ['#212121', '#4e342e'] },
    dialogueTopics: ['comida', 'direcoes', 'mundo'],
    traits: { friendliness: [0.6, 1], talkativeness: [0.5, 1], formality: [0.3, 0.7] },
    shifts: [
      [{ from: 0, to: 5.5, mode: 'sleep' }, { from: 5.5, to: 15, mode: 'work' }, { from: 15, to: 19, mode: 'roam', options: [['park', 2], ['bench', 2], ['plaza', 1]] }, { from: 19, to: 24, mode: 'sleep' }],
      [{ from: 0, to: 1, mode: 'work' }, { from: 1, to: 10, mode: 'sleep' }, { from: 10, to: 14.5, mode: 'roam', options: [['park', 1], ['plaza', 1], ['shop_floor', 1]] }, { from: 14.5, to: 24, mode: 'work' }],
    ],
  },
  habitante: {
    label: 'Habitante',
    workplaceTypes: [],
    dialogueTopics: ['mundo', 'direcoes', 'bairro', 'actividades'],
    traits: { friendliness: [0.3, 0.95], talkativeness: [0.2, 0.95], formality: [0.1, 0.7] },
    routine: [
      { from: 0, to: 6.5, mode: 'sleep' },
      { from: 6.5, to: 8, mode: 'roam', options: [['cafe', 3], ['bus_stop', 2], ['home', 1]] },
      { from: 8, to: 12, mode: 'roam', options: [['plaza', 3], ['park', 3], ['bench', 2], ['shop_floor', 2], ['shop', 1], ['bus_stop', 1]] },
      { from: 12, to: 13.5, mode: 'roam', options: [['cafe', 2], ['restaurant', 2], ['kiosk', 1]] },
      { from: 13.5, to: 17, mode: 'roam', options: [['park', 3], ['plaza', 2], ['bench', 2], ['arena', 1], ['shop', 1]] },
      { from: 17, to: 19.5, mode: 'roam', options: [['plaza', 3], ['arena', 2], ['bench', 2], ['cafe', 1]] },
      { from: 19.5, to: 22, mode: 'roam', options: [['restaurant', 3], ['plaza', 2], ['home', 2]] },
      { from: 22, to: 24, mode: 'sleep' },
    ],
  },
  condutor: {
    label: 'Condutor',
    workplaceTypes: [],
    uniform: { top: 'camisa', topColors: ['#fbc02d', '#0277bd', '#37474f'] },
    dialogueTopics: ['transito', 'direcoes', 'mundo'],
    traits: { friendliness: [0.4, 0.9], talkativeness: [0.3, 0.9], formality: [0.2, 0.6] },
    shifts: [
      [{ from: 0, to: 5.5, mode: 'sleep' }, { from: 5.5, to: 14, mode: 'drive' }, { from: 14, to: 18, mode: 'roam', options: [['cafe', 2], ['plaza', 1]] }, { from: 18, to: 24, mode: 'sleep' }],
      [{ from: 0, to: 9, mode: 'sleep' }, { from: 9, to: 13, mode: 'roam', options: [['park', 1], ['cafe', 1]] }, { from: 13, to: 22.5, mode: 'drive' }, { from: 22.5, to: 24, mode: 'sleep' }],
      [{ from: 0, to: 3, mode: 'drive' }, { from: 3, to: 12, mode: 'sleep' }, { from: 12, to: 18, mode: 'roam', options: [['restaurant', 1], ['plaza', 1]] }, { from: 18, to: 24, mode: 'drive' }],
    ],
  },
  seguranca: {
    label: 'Segurança',
    workplaceTypes: ['guard_post'],
    uniform: { top: 'uniforme_seguranca', topColors: ['#1a237e', '#263238'], accessory: 'bone' },
    dialogueTopics: ['seguranca', 'direcoes', 'regras'],
    traits: { friendliness: [0.3, 0.7], talkativeness: [0.1, 0.5], formality: [0.7, 1] },
    shifts: [
      [{ from: 0, to: 6, mode: 'sleep' }, { from: 6.5, to: 19, mode: 'patrol' }, { from: 19, to: 22, mode: 'home' }, { from: 22, to: 24, mode: 'sleep' }, { from: 6, to: 6.5, mode: 'roam', options: [['cafe', 1]] }],
      [{ from: 0, to: 7, mode: 'patrol' }, { from: 7, to: 15, mode: 'sleep' }, { from: 15, to: 18.5, mode: 'home' }, { from: 18.5, to: 24, mode: 'patrol' }],
    ],
  },
  treinador: {
    label: 'Treinador da Arena',
    workplaceTypes: ['arena', 'challenge_board'],
    uniform: { top: 'fato_treino', topColors: ['#c62828', '#00838f'] },
    dialogueTopics: ['competicoes', 'regras', 'corridas', 'direcoes'],
    traits: { friendliness: [0.6, 0.95], talkativeness: [0.6, 1], formality: [0.3, 0.7] },
    routine: [
      { from: 0, to: 7, mode: 'sleep' },
      { from: 7, to: 9, mode: 'roam', options: [['park', 2], ['cafe', 1]] },
      { from: 9, to: 20.5, mode: 'work' },
      { from: 20.5, to: 22.5, mode: 'roam', options: [['restaurant', 1], ['plaza', 1]] },
      { from: 22.5, to: 24, mode: 'sleep' },
    ],
  },
  mecanico: {
    label: 'Mecânico',
    workplaceTypes: ['workshop'],
    uniform: { top: 'macacao', topColors: ['#ef6c00', '#1565c0'] },
    dialogueTopics: ['veiculos', 'oficina', 'direcoes'],
    traits: { friendliness: [0.4, 0.9], talkativeness: [0.3, 0.8], formality: [0.1, 0.5] },
    routine: [
      { from: 0, to: 6, mode: 'sleep' },
      { from: 6, to: 7, mode: 'roam', options: [['cafe', 2], ['kiosk', 1]] },
      { from: 7, to: 18.5, mode: 'work' },
      { from: 18.5, to: 21, mode: 'roam', options: [['restaurant', 2], ['plaza', 1]] },
      { from: 21, to: 24, mode: 'sleep' },
    ],
  },
  animador_social: {
    label: 'Animador Social',
    workplaceTypes: ['plaza', 'park'],
    uniform: { top: 'camisa_capulana', topColors: ['#d84315', '#6a1b9a', '#00897b'] },
    dialogueTopics: ['actividades', 'eventos', 'mundo', 'direcoes'],
    traits: { friendliness: [0.8, 1], talkativeness: [0.8, 1], formality: [0, 0.4] },
    routine: [
      { from: 0, to: 8, mode: 'sleep' },
      { from: 8, to: 10, mode: 'roam', options: [['cafe', 1], ['park', 1]] },
      { from: 10, to: 22, mode: 'work' },
      { from: 22, to: 24, mode: 'sleep' },
    ],
  },
  organizador_eventos: {
    label: 'Organizador de Eventos',
    workplaceTypes: ['event_stage', 'challenge_board'],
    uniform: { top: 'blazer', topColors: ['#4a148c', '#b71c1c', '#004d40'] },
    dialogueTopics: ['eventos', 'competicoes', 'regras', 'direcoes'],
    traits: { friendliness: [0.7, 1], talkativeness: [0.7, 1], formality: [0.4, 0.8] },
    routine: [
      { from: 0, to: 9, mode: 'sleep' },
      { from: 9, to: 15, mode: 'roam', options: [['cafe', 1], ['plaza', 2], ['arena', 2]] },
      { from: 15, to: 23, mode: 'work' },
      { from: 23, to: 24, mode: 'sleep' },
    ],
  },
  trabalhador_nocturno: {
    label: 'Trabalhador Nocturno',
    workplaceTypes: ['hotel', 'restaurant', 'fuel_station'],
    uniform: { top: 'camisa', topColors: ['#263238', '#3e2723'] },
    dialogueTopics: ['noite', 'direcoes', 'mundo'],
    traits: { friendliness: [0.4, 0.8], talkativeness: [0.3, 0.7], formality: [0.4, 0.8] },
    routine: [
      { from: 0, to: 6, mode: 'work' },
      { from: 6, to: 14, mode: 'sleep' },
      { from: 14, to: 17.5, mode: 'roam', options: [['park', 1], ['plaza', 1], ['bench', 1]] },
      { from: 17.5, to: 24, mode: 'work' },
    ],
  },
};

export const DEFAULT_ARCHETYPE_WEIGHTS = {
  habitante: 42,
  comerciante: 9,
  empregado_cafe: 6,
  condutor: 12,
  seguranca: 5,
  treinador: 2,
  mecanico: 3,
  animador_social: 3,
  organizador_eventos: 2,
  trabalhador_nocturno: 4,
};

/** Quantidade mínima garantida por arquétipo (papéis essenciais da zona). */
export const ARCHETYPE_MINIMUMS = {
  comerciante: 3, seguranca: 3, treinador: 1, mecanico: 1, animador_social: 1, organizador_eventos: 1, empregado_cafe: 2, trabalhador_nocturno: 2,
};
