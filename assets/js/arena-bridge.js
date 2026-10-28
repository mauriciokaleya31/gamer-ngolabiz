/**
 * NGOLABIZ ARENA - UNIVERSAL GAME BRIDGE
 * 1. Auto-Login & Reconhecimento do Jogador Logado da NgolaBiz (Sem pedir login)
 * 2. Tradução Completa de Textos para Português
 * 3. Multiplayer Sincronizado em Tempo Real (Ambos jogam juntos)
 * 4. Inteligência de Bot Conforme Taxa de Acerto Definida pelo Administrador
 * 5. Prevenção de Desistência e Registro de Fim de Jogo
 */
(function() {
    'use strict';

    // 1. Obter Parâmetros da Sessão da Arena
    const urlParams = new URLSearchParams(window.location.search);
    const userName = urlParams.get('user_name') || 'Jogador';
    const userId = parseInt(urlParams.get('user_id')) || 0;
    const oppName = urlParams.get('opp_name') || 'Oponente';
    const oppId = parseInt(urlParams.get('opp_id')) || 0;
    const roomToken = urlParams.get('room') || 'arena_default';
    const role = urlParams.get('role') || 'challenger';
    const isBot = parseInt(urlParams.get('is_bot')) === 1;
    const botWinrate = parseInt(urlParams.get('bot_winrate')) || 70;
    const betAmount = parseInt(urlParams.get('bet_amount')) || 0;
    const gameMode = urlParams.get('mode') || 'battle';

    window.__ARENA_BRIDGE = {
        userName, userId, oppName, oppId, roomToken, role, isBot, botWinrate, betAmount, gameMode,
        lastEventId: 0
    };

    // 2. Dicionário de Tradução Completa para Português (PT/AO)
    const translations = {
        // Geral & Menus
        'practice': 'MODO TREINO',
        'create game': 'CRIAR SALA',
        'join game': 'ENTRAR NA SALA',
        'settings': 'CONFIGURAÇÕES',
        'controls': 'CONTROLOS',
        'play': 'JOGAR',
        'play again': 'JOGAR NOVAMENTE',
        'connect': 'CONECTAR',
        'connecting...': 'A CONECTAR...',
        'connected': 'CONECTADO',
        'status: offline': 'ESTADO: ONLINE NA ARENA',
        'status: online': 'ESTADO: CONECTADO',
        'sound: on': 'SOM: LIGADO',
        'sound: off': 'SOM: DESLIGADO',
        'how to play': 'COMO JOGAR',
        'joystick sensitivity:': 'SENSIBILIDADE:',
        'default settings': 'RESTAURAR PADRÃO',
        'logout': 'SAIR',
        'playing as guest': 'CONECTADO NA NGOLABIZ',
        'log in / sign up': 'AUTENTICADO',
        'enter opponent\\'s id': 'ID DO OPONENTE',
        'your id:': 'SEU ID:',
        'no account?': '',
        'have an account?': '',
        'back': 'VOLTAR',
        'auto': 'AUTOMÁTICO',
        'on': 'LIGADO',
        'off': 'DESLIGADO',
        'loading...': 'A CARREGAR...',
        'instructions': 'INSTRUÇÕES',

        // Resultados & Combate
        'you win': 'VITÓRIA!',
        'you lose': 'DERROTA!',
        'game over': 'FIM DE JOGO',
        'victory': 'VITÓRIA!',
        'defeat': 'DERROTA!',
        'draw': 'EMPATE',
        'winner': 'VENCEDOR',
        'fight': 'LUTE!',
        'fight!': 'LUTE!',
        'round': 'RODADA',
        'time up': 'TEMPO ESGOTADO',
        'ko': 'K.O.',
        'k.o.!': 'K.O.!',
        'ready': 'PRONTO',
        'damage': 'DANO',
        'combo': 'COMBO',
        'points': 'PONTOS',
        'score': 'PONTUAÇÃO',
        'high score': 'RECORDE',
        'time': 'TEMPO',
        'targets': 'ALVOS',

        // Futebol 3D (Soccer FC)
        'quick match': 'PARTIDA RÁPIDA',
        'adjust field / models': 'AJUSTAR CAMPO / MODELOS',
        'paused': 'JOGO EM PAUSA',
        'pause': 'PAUSA',
        'resume': 'CONTINUAR',
        'restart match': 'REINICIAR PARTIDA',
        'quit to menu': 'SAIR PARA O MENU',
        'full time': 'FIM DA PARTIDA',
        'pass power': 'FORÇA DO PASSE',
        'slow motion replay': 'REPETIÇÃO EM CÂMARA LENTA',
        'yellow card': 'CARTÃO AMARELO',
        'foul committed': 'FALTA COMETIDA',
        '1 more = penalty': 'MAIS 1 = PÉNALTI',
        'penalty!': 'PÉNALTI!',
        'you must defend': 'DEFENDA O PÉNALTI',
        'get ready...': 'PREPARE-SE...',
        'a/d move gk · space = they shoot': 'A/D MOVE O GUARDA-REDES · ESPAÇO = REMATAR',
        'aim accuracy — press space to shoot': 'MIRA & PRECISÃO — ESPAÇO PARA REMATAR',
        'corner': 'CANTO',
        'miss': 'FORA',
        'saved!': 'DEFENDIDO!',
        'goal!': 'GOLO!',
        'goal': 'GOLO',
        '⚽ on ball': '⚽ COM A BOLA',
        'on ball': 'COM A BOLA',
        'minimap': 'MINIMAPA',
        'field & model adjust': 'AJUSTES DO CAMPO',
        'pitch position': 'POSIÇÃO DO RELVADO',
        'stadium model': 'MODELO DO ESTÁDIO',
        'player model': 'MODELO DO JOGADOR',
        'goal position': 'POSIÇÃO DA BALIZA',
        'apply': 'APLICAR',
        'close': 'FECHAR',
        '1st half': '1ª PARTE',
        '2nd half': '2ª PARTE',
        'controlled': 'EM CONTROLO',
        'fit': 'ENERGIA',
        'move': 'MOVER',
        'sprint': 'CORRER / SPRINT',
        'hold: pass power': 'SEGURAR: FORÇA DO PASSE',
        'hold: shot power': 'SEGURAR: FORÇA DO REMATE',
        'switch player': 'ALTERNAR JOGADOR',
        'lob shot': 'CHAPÉU',
        'first person': '1ª PESSOA',
        'initializing...': 'A CARREGAR ESTÁDIO...',

        // Duelo FPS 3D
        'start': 'INICIAR',
        'start game': 'INICIAR PARTIDA',
        'lobby': 'SALA DE ESPERA',
        'join': 'ENTRAR',
        'host': 'CRIAR SALA',
        'player': 'JOGADOR',
        'name': 'NOME',
        'touch controls': 'CONTROLOS TÁTEIS',
        'look sensitivity': 'SENSIBILIDADE DA MIRA',
        'crosshair': 'MIRA',
        'keybinds': 'CONTROLOS DE TECLADO',
        'click to play': 'CLIQUE PARA JOGAR',
        'click to shoot': 'CLIQUE PARA DISPARAR',
        'reload': 'RECARREGAR',
        'jump': 'SALTAR',
        'health': 'VIDA',
        'armor': 'ARMADURA',
        'ammo': 'MUNIÇÃO',
        'wave': 'ONDA',
        'wave start': 'INÍCIO DA ONDA',
        'kills': 'ELIMINAÇÕES',
        'deaths': 'MORTES',
        'room code': 'CÓDIGO DA SALA',
        'leave game': 'SAIR DA PARTIDA',

        // MKJS Arcade & Luta
        'sub-zero wins': 'SUB-ZERO VENCEU',
        'kano wins': 'KANO VENCEU',
        'scorpion wins': 'SCORPION VENCEU',
        'fatality': 'FATALITY',
        'flawless victory': 'VITÓRIA PERFEITA',
        'finish him': 'ACABE COM ELE',
        'finish her': 'ACABE COM ELA'
    };

    // Função avançada para traduzir nós de texto
    function translateNode(node) {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
            let orig = node.textContent;
            let txt = orig.trim().toLowerCase();
            if (!txt) return;

            if (translations[txt]) {
                node.textContent = translations[txt];
                return;
            }

            // Padrões dinâmicos (prefixos com números)
            if (txt.startsWith('round ')) {
                node.textContent = 'RODADA ' + txt.slice(6);
                return;
            }
            if (txt.startsWith('wave ')) {
                node.textContent = 'ONDA ' + txt.slice(5);
                return;
            }
            if (txt.startsWith('kills:')) {
                node.textContent = 'ELIMINAÇÕES:' + txt.slice(6);
                return;
            }
            if (txt.startsWith('deaths:')) {
                node.textContent = 'MORTES:' + txt.slice(7);
                return;
            }
            if (txt.startsWith('score:')) {
                node.textContent = 'PONTUAÇÃO:' + txt.slice(6);
                return;
            }
            if (txt.startsWith('high score:')) {
                node.textContent = 'RECORDE:' + txt.slice(11);
                return;
            }

            // Substituição de palavras individuais em frases conhecidas
            for (const [en, pt] of Object.entries(translations)) {
                if (txt === en) {
                    node.textContent = pt;
                    return;
                }
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.placeholder) {
                const p = node.placeholder.trim().toLowerCase();
                if (translations[p]) node.placeholder = translations[p];
            }
            if (node.value && typeof node.value === 'string') {
                const v = node.value.trim().toLowerCase();
                if (translations[v]) node.value = translations[v];
            }
            if (node.title) {
                const t = node.title.trim().toLowerCase();
                if (translations[t]) node.title = translations[t];
            }
            node.childNodes.forEach(translateNode);
        }
    }

    // 3. Auto-Login & Reconhecimento do Utilizador
    function applyAutoLogin() {
        // A. Jogo 1v1 Battle
        const nameInput = document.getElementById('nameInput');
        if (nameInput) {
            nameInput.value = userName;
            localStorage.setItem('ovob_name', userName);
        }
        const accountBar = document.getElementById('accountBar');
        if (accountBar) {
            accountBar.innerHTML = `<span style="color:#10b981;font-weight:700;"><i class="fa fa-user-check"></i> ${userName} (Autenticado na NgolaBiz)</span>`;
        }
        const authModal = document.getElementById('authModal');
        if (authModal) authModal.style.display = 'none';

        // B. Jogo Hyper-Strike
        if (typeof window.myUsername !== 'undefined') {
            window.myUsername = userName;
        }
        const btnLogin = document.getElementById('btnLogin');
        if (btnLogin) {
            btnLogin.innerText = `[ ${userName.toUpperCase()} ]`;
            btnLogin.style.color = '#10b981';
            btnLogin.style.borderColor = '#10b981';
        }
        const statusBox = document.getElementById('status');
        if (statusBox) {
            statusBox.innerText = 'Online na Arena';
            statusBox.style.color = '#10b981';
        }

        // Salvar nos armazenamentos locais
        try {
            localStorage.setItem('arena_user_name', userName);
            localStorage.setItem('arena_opp_name', oppName);
            localStorage.setItem('arena_room_token', roomToken);
        } catch(e) {}
    }

    // 4. Lógica de Sincronização em Tempo Real (Ambos Jogam Juntos)
    window.__ARENA_BRIDGE.sendEvent = function(eventType, payload) {
        if (!roomToken || roomToken === 'arena_default') return;
        fetch('/api.php?action=send_game_event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_token: roomToken,
                event_type: eventType,
                payload: payload
            })
        }).catch(err => console.warn('Sync send err', err));
    };

    window.__ARENA_BRIDGE.startEventPolling = function(callback) {
        if (!roomToken || isBot) return; // Se for bot, a IA local responde imediatamente

        setInterval(() => {
            fetch(`/api.php?action=poll_game_events&room=${encodeURIComponent(roomToken)}&last_id=${window.__ARENA_BRIDGE.lastEventId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'ok' && data.events && data.events.length > 0) {
                        data.events.forEach(ev => {
                            window.__ARENA_BRIDGE.lastEventId = Math.max(window.__ARENA_BRIDGE.lastEventId, ev.id);
                            if (typeof callback === 'function') callback(ev);
                        });
                    }
                })
                .catch(e => {});
        }, 1200);
    };

    // 5. Notificar Fim de Jogo ao Pai (Atualização de Carteira e Pontos)
    window.__ARENA_BRIDGE.finishMatch = function(result) {
        if (window.parent && window.parent.triggerFinishMatch) {
            window.parent.triggerFinishMatch(result);
        } else {
            window.parent.postMessage({ type: 'arena_finish', result: result }, '*');
        }
    };

    // Inicialização ao carregar o DOM
    document.addEventListener('DOMContentLoaded', function() {
        applyAutoLogin();
        applyTranslations();

        // Observar mutações para traduzir elementos dinâmicos
        const observer = new MutationObserver(function(mutations) {
            applyTranslations();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });

    // Se o DOM já estiver pronto
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        applyAutoLogin();
        applyTranslations();
    }

})();
