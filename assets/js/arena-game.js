/**
 * NGOLABIZ ARENA - GAME ENGINE MULTI-JOGOS OFICIAL
 * Suporte Completo:
 * 1. Duelo de Cartas 1v1 (UNO Angola) - Sincronizado, compra, descarte e poderes
 * 2. Neon Fist 2D - Combate de Luta 1v1 em tempo real com HP, socos, chutes e combos
 * 3. Cyber Jogo da Velha (Tic-Tac-Toe)
 * 4. 4 em Linha Gravitacional (Connect 4)
 * 5. Damas Táticas de Angola (Checkers)
 * 6. Batalha Naval Tática (Battleship)
 */

class ArenaPlayController {
  constructor(config) {
    this.game = config.game || 'cardbattle';
    this.mode = config.mode || 'ai';
    this.difficulty = config.difficulty || 'medium';
    this.opponentName = config.opponentName || 'Oponente';
    this.isBot = config.isBot !== undefined ? config.isBot : 1;
    this.botId = config.botId || 0;
    
    this.userScore = 0;
    this.oppScore = 0;
    this.isLocked = false;
    this.gameOver = false;
    this.startTime = Date.now();

    this.container = document.getElementById('arena-game-canvas');
    this.statusBanner = document.getElementById('game-status-label');

    this.setupGame();
  }

  setStatus(msg, isAlert = false) {
    if (this.statusBanner) {
      this.statusBanner.innerHTML = msg;
      if (isAlert) {
        this.statusBanner.style.color = 'var(--neon-gold)';
      } else {
        this.statusBanner.style.color = '#fff';
      }
    }
  }

  setupGame() {
    this.gameOver = false;
    this.isLocked = false;
    this.startTime = Date.now();

    if (this.game === 'cardbattle') {
      this.initCardBattle();
    } else if (this.game === 'neonfist') {
      this.initNeonFist();
    } else if (this.game === 'tictactoe') {
      this.initTicTacToe();
    } else if (this.game === 'connect4') {
      this.initConnect4();
    } else if (this.game === 'checkers') {
      this.initCheckers();
    } else if (this.game === 'battleship') {
      this.initBattleship();
    }
  }

  // ==========================================================================
  // 1. DUELO DE CARTAS 1v1 (UNO ANGOLA)
  // ==========================================================================
  initCardBattle() {
    const colors = ['red', 'blue', 'green', 'yellow'];
    const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+2', 'SKIP'];
    
    // Gerar Baralho
    this.cardDeck = [];
    colors.forEach(c => {
      values.forEach(v => {
        this.cardDeck.push({ color: c, value: v });
        if (v !== '0') this.cardDeck.push({ color: c, value: v });
      });
    });
    // Adicionar Coringas
    for (let i = 0; i < 4; i++) {
      this.cardDeck.push({ color: 'wild', value: '+4' });
      this.cardDeck.push({ color: 'wild', value: 'WILD' });
    }
    this.shuffleCards(this.cardDeck);

    // Mãos Iniciais (7 cartas cada)
    this.playerHand = [];
    this.oppHand = [];
    for (let i = 0; i < 7; i++) {
      this.playerHand.push(this.cardDeck.pop());
      this.oppHand.push(this.cardDeck.pop());
    }

    // Carta Inicial do Monte de Descarte
    let firstCard = this.cardDeck.pop();
    while (firstCard.color === 'wild') {
      this.cardDeck.unshift(firstCard);
      firstCard = this.cardDeck.pop();
    }
    this.discardPile = [firstCard];
    this.activeColor = firstCard.color;

    this.renderCardBattle();
    this.setStatus('<i class="fa-solid fa-play"></i> Sua vez! Jogue uma carta que combine pela cor ou número.');
  }

  shuffleCards(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  renderCardBattle() {
    const topCard = this.discardPile[this.discardPile.length - 1];
    
    let html = `
      <div class="card-battle-arena">
        <!-- Mão do Oponente (Cartas ocultas) -->
        <div class="opp-cards-zone">
          <div class="opp-info-tag">
            <i class="fa-solid fa-user"></i> ${this.opponentName} • Restam <strong>${this.oppHand.length} cartas</strong>
          </div>
          <div class="opp-cards-row">
            ${this.oppHand.map(() => '<div class="uno-card-back"><i class="fa-solid fa-fire"></i></div>').join('')}
          </div>
        </div>

        <!-- Mesa Central: Monte de Compra e Monte de Descarte -->
        <div class="table-center-zone">
          <div class="draw-pile-btn" onclick="window.arenaActiveGame.playerDrawCard()" title="Comprar Carta">
            <div class="uno-card-back draw-deck">
              <i class="fa-solid fa-layer-group"></i>
              <span>COMPRAR</span>
            </div>
          </div>

          <div class="discard-pile-display">
            <div class="uno-card card-${topCard.color}">
              <div class="card-corner top-left">${topCard.value}</div>
              <div class="card-center-val">${topCard.value}</div>
              <div class="card-corner bottom-right">${topCard.value}</div>
            </div>
            <div class="active-color-badge color-${this.activeColor}">
              Cor Ativa: <span>${this.getColorName(this.activeColor)}</span>
            </div>
          </div>
        </div>

        <!-- Mão do Jogador (Você) -->
        <div class="player-cards-zone">
          <div class="player-cards-title">SUAS CARTAS (Toque para jogar):</div>
          <div class="player-cards-row">
            ${this.playerHand.map((c, idx) => `
              <div class="uno-card card-${c.color} ${this.canPlayCard(c) ? 'can-play' : 'cant-play'}" onclick="window.arenaActiveGame.playerPlayCard(${idx})">
                <div class="card-corner top-left">${c.value}</div>
                <div class="card-center-val">${c.value}</div>
                <div class="card-corner bottom-right">${c.value}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }

  getColorName(c) {
    if (c === 'red') return 'Vermelho';
    if (c === 'blue') return 'Azul';
    if (c === 'green') return 'Verde';
    if (c === 'yellow') return 'Amarelo';
    return 'Qualquer';
  }

  canPlayCard(card) {
    const top = this.discardPile[this.discardPile.length - 1];
    if (card.color === 'wild') return true;
    if (card.color === this.activeColor) return true;
    if (card.value === top.value) return true;
    return false;
  }

  playerPlayCard(idx) {
    if (this.isLocked || this.gameOver) return;

    const card = this.playerHand[idx];
    if (!this.canPlayCard(card)) {
      this.setStatus('Esta carta não combina! Jogue pela cor ou número, ou compre uma carta.', true);
      return;
    }

    // Remover da mão do jogador
    this.playerHand.splice(idx, 1);
    this.discardPile.push(card);
    if (window.ArenaAudio) window.ArenaAudio.playMove();

    // Ajustar cor
    if (card.color === 'wild') {
      const colors = ['red', 'blue', 'green', 'yellow'];
      this.activeColor = colors[Math.floor(Math.random() * colors.length)];
    } else {
      this.activeColor = card.color;
    }

    // Verificar Vitória
    if (this.playerHand.length === 0) {
      this.finishGame('win', 'BATIDA PERFEITA! Você zerou todas as suas cartas e venceu o duelo!');
      return;
    }

    // Ações Especiais
    let skipOpp = false;
    if (card.value === '+2') {
      this.oppHand.push(this.drawFromDeck());
      this.oppHand.push(this.drawFromDeck());
      skipOpp = true;
      this.setStatus(`Você jogou +2! ${this.opponentName} comprou 2 cartas e perdeu a vez.`);
    } else if (card.value === '+4') {
      for (let i = 0; i < 4; i++) this.oppHand.push(this.drawFromDeck());
      skipOpp = true;
      this.setStatus(`CORINGA +4! ${this.opponentName} comprou 4 cartas e perdeu o turno.`);
    } else if (card.value === 'SKIP') {
      skipOpp = true;
      this.setStatus(`BLOQUEIO! ${this.opponentName} foi pulado e você joga novamente!`);
    }

    this.renderCardBattle();

    if (!skipOpp) {
      this.isLocked = true;
      this.setStatus(`<i class="fa-solid fa-hourglass-half"></i> Vez de ${this.opponentName}...`);
      setTimeout(() => this.oppTurnCardBattle(), 1200);
    }
  }

  playerDrawCard() {
    if (this.isLocked || this.gameOver) return;

    const newCard = this.drawFromDeck();
    this.playerHand.push(newCard);
    if (window.ArenaAudio) window.ArenaAudio.playClick();
    this.renderCardBattle();

    this.isLocked = true;
    this.setStatus(`Você comprou uma carta. Vez de ${this.opponentName}...`);
    setTimeout(() => this.oppTurnCardBattle(), 1100);
  }

  drawFromDeck() {
    if (this.cardDeck.length === 0) {
      const top = this.discardPile.pop();
      this.cardDeck = [...this.discardPile];
      this.shuffleCards(this.cardDeck);
      this.discardPile = [top];
    }
    return this.cardDeck.pop() || { color: 'red', value: '1' };
  }

  oppTurnCardBattle() {
    if (this.gameOver) return;

    // Encontrar carta jogável na mão do oponente
    let playableIdx = -1;
    for (let i = 0; i < this.oppHand.length; i++) {
      if (this.canPlayCard(this.oppHand[i])) {
        playableIdx = i;
        break;
      }
    }

    if (playableIdx !== -1) {
      const playedCard = this.oppHand.splice(playableIdx, 1)[0];
      this.discardPile.push(playedCard);
      if (window.ArenaAudio) window.ArenaAudio.playMove();

      if (playedCard.color === 'wild') {
        const colors = ['red', 'blue', 'green', 'yellow'];
        this.activeColor = colors[Math.floor(Math.random() * colors.length)];
      } else {
        this.activeColor = playedCard.color;
      }

      // Checar Vitória do Oponente
      if (this.oppHand.length === 0) {
        this.finishGame('lose', `${this.opponentName} descartou todas as cartas e venceu a rodada.`);
        return;
      }

      let skipPlayer = false;
      if (playedCard.value === '+2') {
        this.playerHand.push(this.drawFromDeck());
        this.playerHand.push(this.drawFromDeck());
        skipPlayer = true;
        this.setStatus(`${this.opponentName} jogou +2! Você comprou 2 cartas e perdeu o turno.`, true);
      } else if (playedCard.value === '+4') {
        for (let i = 0; i < 4; i++) this.playerHand.push(this.drawFromDeck());
        skipPlayer = true;
        this.setStatus(`${this.opponentName} jogou CORINGA +4! Você comprou 4 cartas.`, true);
      } else if (playedCard.value === 'SKIP') {
        skipPlayer = true;
        this.setStatus(`${this.opponentName} jogou BLOQUEIO! Você perdeu o turno.`, true);
      }

      this.renderCardBattle();

      if (skipPlayer) {
        setTimeout(() => this.oppTurnCardBattle(), 1200);
      } else {
        this.isLocked = false;
        this.setStatus(`<i class="fa-solid fa-play"></i> Sua vez! Jogue uma carta ou compre do monte.`);
      }
    } else {
      // Oponente compra carta
      this.oppHand.push(this.drawFromDeck());
      this.renderCardBattle();
      this.isLocked = false;
      this.setStatus(`${this.opponentName} não tinha carta compatível e comprou uma. Sua vez!`);
    }
  }

  // ==========================================================================
  // 2. NEON FIST 2D (LUTA 1v1 EM TEMPO REAL)
  // ==========================================================================
  initNeonFist() {
    this.playerHP = 100;
    this.oppHP = 100;
    this.playerEnergy = 50;

    let html = `
      <div class="neon-fist-arena">
        <!-- Barras de Vida (HP) Sincronizadas no Topo -->
        <div class="nf-hud-bars">
          <div class="nf-bar-wrap">
            <div class="nf-bar-label">VOCÊ <span id="nf-player-hp-num">100%</span></div>
            <div class="nf-hp-bg"><div class="nf-hp-fill" id="nf-player-hp-bar" style="width: 100%;"></div></div>
          </div>
          <div class="nf-vs-badge">VS</div>
          <div class="nf-bar-wrap text-end">
            <div class="nf-bar-label">${this.opponentName} <span id="nf-opp-hp-num">100%</span></div>
            <div class="nf-hp-bg"><div class="nf-hp-fill opp" id="nf-opp-hp-bar" style="width: 100%;"></div></div>
          </div>
        </div>

        <!-- Palco do Combate com Lutadores em Canvas/CSS -->
        <div class="nf-stage-scene">
          <div class="nf-fighter fighter-left" id="nf-fighter-player">
            <div class="fighter-sprite p1-idle"><i class="fa-solid fa-person-running"></i></div>
            <div class="fighter-shadow"></div>
          </div>
          <div class="nf-fighter fighter-right" id="nf-fighter-opp">
            <div class="fighter-sprite opp-idle"><i class="fa-solid fa-person-military-pointing"></i></div>
            <div class="fighter-shadow"></div>
          </div>
          <div class="nf-hit-fx" id="nf-hit-fx">POW!</div>
        </div>

        <!-- Controles de Combate Táteis e Rápidos -->
        <div class="nf-controls-panel">
          <button type="button" class="btn-fight-action btn-punch" onclick="window.arenaActiveGame.nfAction('punch')">
            <i class="fa-solid fa-hand-back-fist"></i> SOCO
          </button>
          <button type="button" class="btn-fight-action btn-kick" onclick="window.arenaActiveGame.nfAction('kick')">
            <i class="fa-solid fa-socks"></i> CHUTE
          </button>
          <button type="button" class="btn-fight-action btn-block" onclick="window.arenaActiveGame.nfAction('block')">
            <i class="fa-solid fa-shield"></i> DEFESA
          </button>
          <button type="button" class="btn-fight-action btn-special" onclick="window.arenaActiveGame.nfAction('special')">
            <i class="fa-solid fa-bolt"></i> ESPECIAL NEON
          </button>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.setStatus('<i class="fa-solid fa-bolt"></i> LUTA INICIADA! Golpeie o oponente antes que ele contra-ataque!');
  }

  nfAction(type) {
    if (this.isLocked || this.gameOver) return;

    let damage = 0;
    let fxText = 'POW!';
    const fPlayer = document.getElementById('nf-fighter-player');
    const fOpp = document.getElementById('nf-fighter-opp');
    const hitFx = document.getElementById('nf-hit-fx');

    if (type === 'punch') {
      damage = 12;
      fxText = 'SOCO!';
      if (fPlayer) fPlayer.classList.add('anim-punch');
    } else if (type === 'kick') {
      damage = 18;
      fxText = 'CHUTE!';
      if (fPlayer) fPlayer.classList.add('anim-kick');
    } else if (type === 'special') {
      damage = 28;
      fxText = 'COMBO NEON!';
      if (fPlayer) fPlayer.classList.add('anim-special');
    } else if (type === 'block') {
      this.setStatus('Defesa armada! Dano do próximo golpe reduzido.');
      setTimeout(() => this.nfOppAttack(true), 600);
      return;
    }

    if (hitFx) {
      hitFx.innerText = fxText;
      hitFx.classList.add('active');
      setTimeout(() => hitFx.classList.remove('active'), 400);
    }
    if (window.ArenaAudio) window.ArenaAudio.playHit();

    // Aplicar Dano no Oponente
    this.oppHP = Math.max(0, this.oppHP - damage);
    this.updateNFHUD();

    setTimeout(() => {
      if (fPlayer) fPlayer.className = 'nf-fighter fighter-left';
    }, 300);

    if (this.oppHP <= 0) {
      this.finishGame('win', `K.O.! Você derrotou ${this.opponentName} com golpes devastadores!`);
      return;
    }

    // Contra-ataque do Oponente
    this.isLocked = true;
    setTimeout(() => this.nfOppAttack(false), 550);
  }

  nfOppAttack(isPlayerBlocked) {
    if (this.gameOver) return;

    const fOpp = document.getElementById('nf-fighter-opp');
    const hitFx = document.getElementById('nf-hit-fx');

    const attacks = ['punch', 'kick', 'combo'];
    const chosen = attacks[Math.floor(Math.random() * attacks.length)];
    let oppDamage = (chosen === 'punch') ? 10 : (chosen === 'kick' ? 15 : 20);

    if (isPlayerBlocked) {
      oppDamage = Math.round(oppDamage * 0.25);
    }

    if (fOpp) fOpp.classList.add('anim-attack');
    if (hitFx) {
      hitFx.innerText = isPlayerBlocked ? 'BLOQUEADO!' : 'GOLPE!';
      hitFx.classList.add('active');
      setTimeout(() => hitFx.classList.remove('active'), 400);
    }
    if (window.ArenaAudio) window.ArenaAudio.playMove();

    this.playerHP = Math.max(0, this.playerHP - oppDamage);
    this.updateNFHUD();

    setTimeout(() => {
      if (fOpp) fOpp.className = 'nf-fighter fighter-right';
      this.isLocked = false;
    }, 300);

    if (this.playerHP <= 0) {
      this.finishGame('lose', `K.O.! ${this.opponentName} acertou um golpe decisivo.`);
      return;
    }

    this.setStatus(`<i class="fa-solid fa-play"></i> Sua vez! Ataque ou defenda-se.`);
  }

  updateNFHUD() {
    const pBar = document.getElementById('nf-player-hp-bar');
    const pNum = document.getElementById('nf-player-hp-num');
    const oBar = document.getElementById('nf-opp-hp-bar');
    const oNum = document.getElementById('nf-opp-hp-num');

    if (pBar) pBar.style.width = this.playerHP + '%';
    if (pNum) pNum.innerText = this.playerHP + '%';
    if (oBar) oBar.style.width = this.oppHP + '%';
    if (oNum) oNum.innerText = this.oppHP + '%';
  }

  // ==========================================================================
  // 3. JOGO DA VELHA (TIC-TAC-TOE)
  // ==========================================================================
  initTicTacToe() {
    this.tttBoard = Array(9).fill('');
    this.currentTurn = 'X';

    let html = '<div class="board-ttt-wrapper" id="ttt-cells">';
    for (let i = 0; i < 9; i++) {
      html += `<div class="ttt-cell-box" data-idx="${i}" onclick="window.arenaActiveGame.clickTTT(${i})"></div>`;
    }
    html += '</div>';

    this.container.innerHTML = html;
    this.setStatus('<i class="fa-solid fa-play"></i> Sua vez de jogar!');
  }

  clickTTT(idx) {
    if (this.isLocked || this.gameOver || this.tttBoard[idx] !== '') return;

    this.tttBoard[idx] = 'X';
    const cell = document.querySelector(`.ttt-cell-box[data-idx="${idx}"]`);
    if (cell) {
      cell.classList.add('x', 'taken');
      cell.innerText = 'X';
    }
    if (window.ArenaAudio) window.ArenaAudio.playMove();

    const winner = this.checkTTTWin(this.tttBoard);
    if (winner === 'X') {
      this.finishGame('win', 'Vitória espetacular! Você alinhou 3 símbolos!');
      return;
    }
    if (this.tttBoard.every(c => c !== '')) {
      this.finishGame('draw', 'Empate! Todas as casas foram preenchidas.');
      return;
    }

    if (this.mode === 'ai') {
      this.isLocked = true;
      this.setStatus(`<i class="fa-solid fa-hourglass-half"></i> Vez de ${this.opponentName}... calculando jogada`);
      setTimeout(() => this.botPlayTTT(), 450);
    }
  }

  botPlayTTT() {
    if (this.gameOver) return;

    const empties = this.tttBoard.map((v, i) => v === '' ? i : null).filter(v => v !== null);
    if (empties.length === 0) return;

    let chosen = -1;
    if (this.difficulty !== 'easy') {
      for (const i of empties) {
        const copy = [...this.tttBoard];
        copy[i] = 'O';
        if (this.checkTTTWin(copy) === 'O') { chosen = i; break; }
      }
      if (chosen === -1) {
        for (const i of empties) {
          const copy = [...this.tttBoard];
          copy[i] = 'X';
          if (this.checkTTTWin(copy) === 'X') { chosen = i; break; }
        }
      }
    }

    if (chosen === -1) {
      if (this.tttBoard[4] === '' && Math.random() > 0.3) chosen = 4;
      else chosen = empties[Math.floor(Math.random() * empties.length)];
    }

    this.tttBoard[chosen] = 'O';
    const cell = document.querySelector(`.ttt-cell-box[data-idx="${chosen}"]`);
    if (cell) {
      cell.classList.add('o', 'taken');
      cell.innerText = 'O';
    }
    if (window.ArenaAudio) window.ArenaAudio.playMove();

    const winner = this.checkTTTWin(this.tttBoard);
    if (winner === 'O') {
      this.finishGame('lose', `${this.opponentName} conseguiu alinhar 3 e venceu o duelo!`);
      return;
    }
    if (this.tttBoard.every(c => c !== '')) {
      this.finishGame('draw', 'Empate! Todas as casas foram preenchidas.');
      return;
    }

    this.isLocked = false;
    this.setStatus('<i class="fa-solid fa-play"></i> Sua vez de jogar!');
  }

  checkTTTWin(b) {
    const lines = [
      [0,1,2], [3,4,5], [6,7,8],
      [0,3,6], [1,4,7], [2,5,8],
      [0,4,8], [2,4,6]
    ];
    for (const [x,y,z] of lines) {
      if (b[x] && b[x] === b[y] && b[x] === b[z]) return b[x];
    }
    return null;
  }

  // ==========================================================================
  // 4. 4 EM LINHA (CONNECT 4)
  // ==========================================================================
  initConnect4() {
    this.c4Cols = 7;
    this.c4Rows = 6;
    this.c4Grid = Array(6).fill(null).map(() => Array(7).fill(0));

    let html = '<div class="c4-wrapper">';
    html += '<div class="c4-action-row">';
    for (let c = 0; c < 7; c++) {
      html += `<button class="c4-drop-btn" onclick="window.arenaActiveGame.dropC4(${c})">⬇</button>`;
    }
    html += '</div>';

    html += '<div class="c4-grid-frame">';
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        html += `<div class="c4-slot" data-r="${r}" data-c="${c}"></div>`;
      }
    }
    html += '</div></div>';

    this.container.innerHTML = html;
    this.setStatus('<i class="fa-solid fa-play"></i> Escolha uma coluna para soltar o seu disco vermelho!');
  }

  dropC4(col) {
    if (this.isLocked || this.gameOver) return;

    let targetRow = this.getLowestC4Row(col);
    if (targetRow === -1) {
      this.setStatus('Esta coluna já está cheia! Escolha outra.', true);
      return;
    }

    this.c4Grid[targetRow][col] = 1;
    const slot = document.querySelector(`.c4-slot[data-r="${targetRow}"][data-c="${col}"]`);
    if (slot) slot.classList.add('red');
    if (window.ArenaAudio) window.ArenaAudio.playMove();

    if (this.checkC4Winner(1)) {
      this.finishGame('win', 'Vitória espetacular! Você conectou 4 em linha!');
      return;
    }
    if (this.c4Grid[0].every(v => v !== 0)) {
      this.finishGame('draw', 'O tabuleiro do 4 em linha ficou completo sem vencedor!');
      return;
    }

    this.isLocked = true;
    this.setStatus(`<i class="fa-solid fa-hourglass-half"></i> Vez de ${this.opponentName}... soltando disco`);
    setTimeout(() => this.botPlayC4(), 500);
  }

  botPlayC4() {
    if (this.gameOver) return;

    const availableCols = [];
    for (let c = 0; c < 7; c++) {
      if (this.c4Grid[0][c] === 0) availableCols.push(c);
    }
    if (availableCols.length === 0) return;

    let chosenCol = -1;
    for (const c of availableCols) {
      let r = this.getLowestC4Row(c);
      this.c4Grid[r][c] = 2;
      if (this.checkC4Winner(2)) { chosenCol = c; this.c4Grid[r][c] = 0; break; }
      this.c4Grid[r][c] = 0;
    }
    if (chosenCol === -1) {
      for (const c of availableCols) {
        let r = this.getLowestC4Row(c);
        this.c4Grid[r][c] = 1;
        if (this.checkC4Winner(1)) { chosenCol = c; this.c4Grid[r][c] = 0; break; }
        this.c4Grid[r][c] = 0;
      }
    }
    if (chosenCol === -1) {
      chosenCol = availableCols[Math.floor(Math.random() * availableCols.length)];
    }

    const r = this.getLowestC4Row(chosenCol);
    this.c4Grid[r][chosenCol] = 2;
    const slot = document.querySelector(`.c4-slot[data-r="${r}"][data-c="${chosenCol}"]`);
    if (slot) slot.classList.add('yellow');
    if (window.ArenaAudio) window.ArenaAudio.playMove();

    if (this.checkC4Winner(2)) {
      this.finishGame('lose', `${this.opponentName} conseguiu conectar 4 discos!`);
      return;
    }
    if (this.c4Grid[0].every(v => v !== 0)) {
      this.finishGame('draw', 'Empate! Tabuleiro sem posições livres.');
      return;
    }

    this.isLocked = false;
    this.setStatus('<i class="fa-solid fa-play"></i> Sua vez de jogar!');
  }

  getLowestC4Row(col) {
    for (let r = 5; r >= 0; r--) {
      if (this.c4Grid[r][col] === 0) return r;
    }
    return -1;
  }

  checkC4Winner(p) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.c4Grid[r][c] === p && this.c4Grid[r][c+1] === p && this.c4Grid[r][c+2] === p && this.c4Grid[r][c+3] === p) return true;
      }
    }
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 7; c++) {
        if (this.c4Grid[r][c] === p && this.c4Grid[r+1][c] === p && this.c4Grid[r+2][c] === p && this.c4Grid[r+3][c] === p) return true;
      }
    }
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.c4Grid[r][c] === p && this.c4Grid[r+1][c+1] === p && this.c4Grid[r+2][c+2] === p && this.c4Grid[r+3][c+3] === p) return true;
      }
    }
    for (let r = 3; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.c4Grid[r][c] === p && this.c4Grid[r-1][c+1] === p && this.c4Grid[r-2][c+2] === p && this.c4Grid[r-3][c+3] === p) return true;
      }
    }
    return false;
  }

  // ==========================================================================
  // 5. DAMAS ANGOLANAS (CHECKERS)
  // ==========================================================================
  initCheckers() {
    this.chkGrid = Array(8).fill(null).map(() => Array(8).fill(0));
    this.selectedPiece = null;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) this.chkGrid[r][c] = 2;
      }
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) this.chkGrid[r][c] = 1;
      }
    }

    this.renderCheckersBoard();
    this.setStatus('<i class="fa-solid fa-play"></i> Clique numa peça vermelha para mover ou capturar!');
  }

  renderCheckersBoard() {
    let html = '<div class="checkers-board-wrapper">';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isDark = (r + c) % 2 === 1;
        const val = this.chkGrid[r][c];
        const isSel = this.selectedPiece && this.selectedPiece.r === r && this.selectedPiece.c === c;

        html += `<div class="chk-square ${isDark ? 'dark' : 'light'} ${isSel ? 'selected' : ''}" onclick="window.arenaActiveGame.clickCheckerSquare(${r}, ${c})">`;
        if (val === 1) html += '<div class="chk-piece p1"></div>';
        else if (val === 2) html += '<div class="chk-piece p2"></div>';
        html += '</div>';
      }
    }
    html += '</div>';
    this.container.innerHTML = html;
  }

  clickCheckerSquare(r, c) {
    if (this.isLocked || this.gameOver) return;

    const val = this.chkGrid[r][c];
    if (val === 1) {
      this.selectedPiece = { r, c };
      this.renderCheckersBoard();
      return;
    }

    if (this.selectedPiece && val === 0 && (r + c) % 2 === 1) {
      const fromR = this.selectedPiece.r;
      const fromC = this.selectedPiece.c;
      const dr = r - fromR;
      const dc = c - fromC;

      if (dr === -1 && Math.abs(dc) === 1) {
        this.chkGrid[r][c] = 1;
        this.chkGrid[fromR][fromC] = 0;
        this.selectedPiece = null;
        this.renderCheckersBoard();
        if (window.ArenaAudio) window.ArenaAudio.playMove();
        this.checkCheckersState();
        return;
      }

      if (dr === -2 && Math.abs(dc) === 2) {
        const midR = (r + fromR) / 2;
        const midC = (c + fromC) / 2;
        if (this.chkGrid[midR][midC] === 2) {
          this.chkGrid[r][c] = 1;
          this.chkGrid[fromR][fromC] = 0;
          this.chkGrid[midR][midC] = 0;
          this.selectedPiece = null;
          this.renderCheckersBoard();
          if (window.ArenaAudio) window.ArenaAudio.playHit();
          this.checkCheckersState();
          return;
        }
      }
    }
  }

  checkCheckersState() {
    let p1 = 0, p2 = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.chkGrid[r][c] === 1) p1++;
        if (this.chkGrid[r][c] === 2) p2++;
      }
    }

    if (p2 === 0) {
      this.finishGame('win', 'Você capturou todas as peças do oponente e venceu nas Damas!');
      return;
    }
    if (p1 === 0) {
      this.finishGame('lose', `${this.opponentName} capturou as suas peças e venceu a rodada.`);
      return;
    }

    this.isLocked = true;
    this.setStatus(`<i class="fa-solid fa-hourglass-half"></i> Vez de ${this.opponentName}...`);
    setTimeout(() => this.botPlayCheckers(), 500);
  }

  botPlayCheckers() {
    if (this.gameOver) return;

    let captures = [];
    let moves = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.chkGrid[r][c] === 2) {
          for (const dc of [-2, 2]) {
            let tr = r + 2, tc = c + dc;
            if (tr < 8 && tc >= 0 && tc < 8 && this.chkGrid[tr][tc] === 0) {
              let mr = r + 1, mc = c + (dc / 2);
              if (this.chkGrid[mr][mc] === 1) {
                captures.push({ fromR: r, fromC: c, toR: tr, toC: tc, midR: mr, midC: mc });
              }
            }
          }
          for (const dc of [-1, 1]) {
            let tr = r + 1, tc = c + dc;
            if (tr < 8 && tc >= 0 && tc < 8 && this.chkGrid[tr][tc] === 0) {
              moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
            }
          }
        }
      }
    }

    if (captures.length > 0) {
      const act = captures[0];
      this.chkGrid[act.toR][act.toC] = 2;
      this.chkGrid[act.fromR][act.fromC] = 0;
      this.chkGrid[act.midR][act.midC] = 0;
      if (window.ArenaAudio) window.ArenaAudio.playHit();
    } else if (moves.length > 0) {
      const act = moves[Math.floor(Math.random() * moves.length)];
      this.chkGrid[act.toR][act.toC] = 2;
      this.chkGrid[act.fromR][act.fromC] = 0;
      if (window.ArenaAudio) window.ArenaAudio.playMove();
    } else {
      this.finishGame('win', `${this.opponentName} ficou sem movimentos válidos. Vitória sua!`);
      return;
    }

    this.renderCheckersBoard();
    this.isLocked = false;
    this.setStatus('<i class="fa-solid fa-play"></i> Sua vez de jogar!');
  }

  // ==========================================================================
  // 6. BATALHA NAVAL (BATTLESHIP)
  // ==========================================================================
  initBattleship() {
    this.enemyShips = Array(8).fill(null).map(() => Array(8).fill(0));
    this.enemyShots = Array(8).fill(null).map(() => Array(8).fill(0));
    this.shipsRemaining = 6;

    let placed = 0;
    while (placed < 6) {
      let r = Math.floor(Math.random() * 8);
      let c = Math.floor(Math.random() * 8);
      if (this.enemyShips[r][c] === 0) {
        this.enemyShips[r][c] = 1;
        placed++;
      }
    }

    let html = '<div class="nav-battle-container">';
    html += '<div style="text-align: center;">';
    html += `<div style="margin-bottom: 10px; font-weight:700;"><i class="fa-solid fa-crosshairs" style="color:var(--neon-purple-light);"></i> RADAR NAVAL DE ${this.opponentName.toUpperCase()}</div>`;
    html += '<div class="naval-grid" id="nav-enemy-radar">';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        html += `<div class="nav-tile" data-r="${r}" data-c="${c}" onclick="window.arenaActiveGame.fireNaval(${r}, ${c})">·</div>`;
      }
    }
    html += '</div></div></div>';

    this.container.innerHTML = html;
    this.setStatus(`<i class="fa-solid fa-crosshairs"></i> Dispare nas coordenadas! Restam ${this.shipsRemaining} navios inimigos.`);
  }

  fireNaval(r, c) {
    if (this.isLocked || this.gameOver || this.enemyShots[r][c] !== 0) return;

    const tile = document.querySelector(`.nav-tile[data-r="${r}"][data-c="${c}"]`);
    if (this.enemyShips[r][c] === 1) {
      this.enemyShots[r][c] = 2;
      this.shipsRemaining--;
      if (tile) {
        tile.classList.add('hit');
        tile.innerHTML = '🔥';
      }
      if (window.ArenaAudio) window.ArenaAudio.playHit();
      this.setStatus(`FOGO! Embarcação de ${this.opponentName} atingida! Restam ${this.shipsRemaining}.`, true);
    } else {
      this.enemyShots[r][c] = 1;
      if (tile) {
        tile.classList.add('miss');
        tile.innerHTML = '🌊';
      }
      if (window.ArenaAudio) window.ArenaAudio.playMiss();
      this.setStatus(`ÁGUA! Tiro sem efeito nas coordenadas (${r+1}, ${c+1}).`);
    }

    if (this.shipsRemaining === 0) {
      this.finishGame('win', `FROTA DE ${this.opponentName.toUpperCase()} DESTRUÍDA! Você dominou os mares!`);
    }
  }

  // ==========================================================================
  // FINALIZAR PARTIDA & REGISTRO NO BACKEND
  // ==========================================================================
  finishGame(result, message) {
    this.gameOver = true;
    const duration = Math.round((Date.now() - this.startTime) / 1000);

    const overlay = document.getElementById('modal-over-overlay');
    const title = document.getElementById('modal-over-title');
    const msg = document.getElementById('modal-over-message');
    const scoreElem = document.getElementById('modal-over-score');

    if (result === 'win') {
      this.userScore++;
      title.innerHTML = '<i class="fa-solid fa-trophy" style="color:var(--neon-gold);"></i> VITÓRIA!';
      title.style.color = 'var(--neon-gold)';
      if (window.ArenaAudio) window.ArenaAudio.playVictory();
      if (typeof confetti === 'function') {
        confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      }
    } else if (result === 'lose') {
      this.oppScore++;
      title.innerHTML = '<i class="fa-solid fa-skull" style="color:var(--neon-red);"></i> DERROTA!';
      title.style.color = 'var(--neon-red)';
      if (window.ArenaAudio) window.ArenaAudio.playDefeat();
    } else {
      title.innerHTML = '<i class="fa-solid fa-handshake"></i> EMPATE!';
      title.style.color = '#fff';
      if (window.ArenaAudio) window.ArenaAudio.playDraw();
    }

    if (msg) msg.innerText = message;
    if (scoreElem) scoreElem.innerText = `Placar: Você ${this.userScore} x ${this.oppScore} ${this.opponentName}`;
    if (overlay) overlay.classList.add('active');

    // Gravar no servidor NgolaBiz
    fetch(`${window.__ARENA_BASE_URL}/api.php?action=finish_match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_type: this.game,
        result: result,
        duration: duration,
        is_bot: this.isBot,
        bot_id: this.botId
      })
    }).catch(() => {});
  }
}

window.ArenaPlayController = ArenaPlayController;
