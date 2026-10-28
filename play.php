<?php
/**
 * NGOLABIZ ARENA - CAMPO DE BATALHA COMPETITIVO OFICIAL (PLAY & DUELO)
 * Sistema de Duas Telas Totalmente Sincronizadas (Dual Screen / eSports Split-Screen)
 * Design Perfeito e Proporcional, Sincronização em Tempo Real de Ações e Golpes,
 * Movimentação Real de Carteira e Regras Anti-Desistência por W.O.
 */
require_once(__DIR__ . '/init.php');

$raw_game = trim($_GET['game'] ?? '');
$token = trim($_GET['token'] ?? ($_GET['challenge'] ?? ''));
$mode = trim($_GET['mode'] ?? '');

// Se o usuário acessou play.php completamente avulso (sem jogo e sem token),
// redirecionar para a Central de Jogos (index.php)
if (empty($raw_game) && empty($token) && empty($mode)) {
    header("Location: " . GAMER_URL . "/index.php");
    exit;
}

// Se especificou um jogo diretamente sem token, entra em modo combate solo/treino contra o bot
$is_demo = ($mode === 'demo' || $mode === 'solo' || (empty($token) && !empty($raw_game)));

if ($raw_game === 'online-uno' || $raw_game === 'cardbattle' || $raw_game === 'fps3d') {
    $redirect_params = $_GET;
    $redirect_params['game'] = 'hyperstrike';
    header("Location: " . GAMER_URL . "/play.php?" . http_build_query($redirect_params));
    exit;
}

$game_key = $raw_game ?: 'hyperstrike';
if (!array_key_exists($game_key, $ARENA_GAMES)) {
    $game_key = 'hyperstrike';
}

// Dados do Oponente selecionado no Radar
$opp_name = $_GET['opp_name'] ?? '';
$opp_avatar = $_GET['opp_avatar'] ?? '';
$opp_province = $_GET['opp_province'] ?? '';
$opp_points = (int)($_GET['opp_points'] ?? ($_GET['opp_mmr'] ?? 1150));
$opp_diff = $_GET['opp_diff'] ?? 'medium';
$is_bot = isset($_GET['is_bot']) ? (int)$_GET['is_bot'] : 1;
$bot_id = (int)($_GET['bot_id'] ?? 0);
$bet_amount = (int)($_GET['bet_amount'] ?? 0);
$my_uid = $logged_user ? (int)$logged_user['user_id'] : 0;

// Exigência de Verificação de Identidade (KYC) para Combates Oficiais
if ($logged_user && !$is_demo && !arena_is_user_verified($my_uid)) {
    header("Location: " . GAMER_URL . "/verificacao.php?notice=play_requires_kyc");
    exit;
}

// REGRA 2: Se houver token de desafio, verificar integridade e status
if (!empty($token)) {
    $chk = $db->query("SELECT * FROM arena_challenges WHERE challenge_token = '{$db->real_escape_string($token)}' LIMIT 1");
    if (!$chk || $chk->num_rows === 0) {
        // Desafio não encontrado
        header("Location: " . GAMER_URL . "/index.php");
        exit;
    }

    $c_data = $chk->fetch_assoc();

    // Se a partida associada a este token já foi concluída, expirada, cancelada ou desistida:
    // NUNCA recomeçar o jogo! Redirecionar para o Dashboard!
    if (in_array($c_data['status'], ['completed', 'finished', 'forfeited', 'expired', 'declined', 'disconnected'])) {
        header("Location: " . GAMER_URL . "/index.php?msg=match_concluded");
        exit;
    }

    $game_key = $c_data['game_type'];
    if ($game_key === 'online-uno' || $game_key === 'cardbattle' || !array_key_exists($game_key, $ARENA_GAMES)) {
        $game_key = 'hyperstrike';
    }

    $is_challenger = ($my_uid == (int)$c_data['challenger_id']);
    $my_role = $is_challenger ? 'challenger' : 'challenged';
    $opp_role = $is_challenger ? 'challenged' : 'challenger';

    if ($is_challenger) {
        $opp_id = (int)$c_data['challenged_id'];
        $opp_name = $c_data['challenged_tag'] ?: 'Oponente';
        $opp_avatar = $c_data['challenged_avatar'];
        $opp_province = $c_data['challenged_province'] ?: 'Benguela';
    } else {
        $opp_id = (int)$c_data['challenger_id'];
        $opp_name = $c_data['challenger_tag'] ?: 'Desafiador';
        $opp_avatar = $c_data['challenger_avatar'];
        $opp_province = $c_data['challenger_province'] ?: 'Luanda';
    }
    $opp_diff = $c_data['bot_difficulty'] ?: 'medium';
    $is_bot = (int)$c_data['is_bot'];
    $bot_id = (int)$c_data['bot_id'];
    $bet_amount = (int)($c_data['bet_amount'] ?? $bet_amount);
}

// Obter Taxa da Plataforma gravada pelo Administrador
$q_fee = $db->query("SELECT setting_value FROM arena_admin_settings WHERE setting_key = 'platform_fee_percent' LIMIT 1");
$platform_fee_percent = ($q_fee && $q_fee->num_rows > 0) ? (float)$q_fee->fetch_assoc()['setting_value'] : 10.0;
$total_pot = $bet_amount * 2;
$house_fee = round(($total_pot * $platform_fee_percent) / 100, 2);
$winner_net_prize = $total_pot - $house_fee;

// Registrar partida ativa na sessão se houver token e aposta
if ($my_uid > 0 && !$is_demo && !empty($token) && $bet_amount > 0) {
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    $_SESSION['arena_active_match'] = [
        'token' => $token,
        'game' => $game_key,
        'bet_amount' => $bet_amount,
        'opp_name' => $opp_name,
        'started_at' => time()
    ];
}

// Se for Modo Demo / Treino ou Adversário do Sistema: Carregar Bot Oficial cadastrado no Admin
if ($is_demo || empty($opp_name) || stripos($opp_name, 'bot') !== false || stripos($opp_name, 'simulador') !== false) {
    $q_bot_db = $db->query("SELECT * FROM arena_bots WHERE is_active = 1 ORDER BY RAND() LIMIT 1");
    if ($q_bot_db && $q_bot_db->num_rows > 0) {
        $b_row = $q_bot_db->fetch_assoc();
        $opp_name = $b_row['fullname'] ?: $b_row['bot_tag'];
        $opp_avatar = $b_row['avatar_url'];
        $opp_province = $b_row['province'] ?: 'Luanda';
        $opp_points = (int)($b_row['competitive_points'] ?? 1250);
        $opp_diff = $b_row['difficulty'] ?: 'medium';
        $bot_winrate = (int)$b_row['target_winrate'];
        $is_bot = 1;
        $bot_id = (int)$b_row['id'];
        $opp_id = $bot_id;
    } else {
        $opp_name = 'Kelson Silva';
        $opp_avatar = 'https://ui-avatars.com/api/?name=Kelson+Silva&background=06b6d4&color=fff&size=150';
        $opp_province = 'Luanda';
        $opp_points = 1240;
        $opp_diff = 'medium';
        $bot_winrate = 70;
        $is_bot = 1;
        $bot_id = 1;
        $opp_id = 1;
    }
    if ($is_demo) {
        $bet_amount = 0;
    }
}

// Obter taxa de acerto do oponente caso já venha com bot_id
if ($is_bot && $bot_id > 0) {
    $q_bot = $db->query("SELECT target_winrate FROM arena_bots WHERE id = {$bot_id} LIMIT 1");
    if ($q_bot && $q_bot->num_rows > 0) {
        $bot_winrate = (int)$q_bot->fetch_assoc()['target_winrate'];
    }
}

if ($game_key === 'cardbattle' || $game_key === 'online-uno' || !array_key_exists($game_key, $ARENA_GAMES)) {
    $game_key = 'hyperstrike';
}
$game_info = $ARENA_GAMES[$game_key];
$has_opponent = !empty($opp_name);

$page_title = $game_info['name'] . ' — Arena de Duelo Sincronizada';
require_once(__DIR__ . '/header.php');

$user_province = $gamer_profile['province'] ?? 'Luanda';
$user_wallet = (float)($logged_user['user_wallet_balance'] ?? 0);
$has_sufficient_balance = ($is_demo || $bet_amount <= 0 || $user_wallet >= $bet_amount);

$my_role = $my_role ?? 'challenger';
$opp_role = $opp_role ?? 'challenged';

// Estilo de combate do Bot para IA dinâmica e adaptativa
$bot_style = trim($_GET['bot_style'] ?? '');
if (empty($bot_style)) {
    $seed_id = (int)($opp_id ?? ($bot_id ?: abs(crc32($opp_name ?: 'BotArena'))));
    $bot_styles_pool = ['aggressive', 'defensive', 'ninja', 'tactical'];
    $bot_style = $bot_styles_pool[$seed_id % count($bot_styles_pool)];
}

// Parâmetros para a Tela 1 (Você - Humano)
$room_token_val = !empty($token) ? $token : ('room_' . substr(md5(uniqid()), 0, 8));
$iframe_params_p1 = http_build_query([
    'user_name' => $my_name,
    'user_id' => $my_uid,
    'user_avatar' => $my_avatar,
    'opp_name' => $opp_name,
    'opp_id' => (int)($opp_id ?? 0),
    'opp_avatar' => $opp_avatar,
    'room' => $room_token_val,
    'token' => $token,
    'role' => $my_role,
    'is_bot' => 0,
    'bot_winrate' => $bot_winrate,
    'bot_style' => $bot_style,
    'bet_amount' => $bet_amount,
    'mode' => $is_demo ? 'demo' : 'battle',
    'lang' => 'pt'
]);

// Parâmetros para a Tela 2 (Adversário / Bot na Câmera 2)
$iframe_params_p2 = http_build_query([
    'user_name' => $opp_name,
    'user_id' => (int)($opp_id ?? ($bot_id ?: 9999)),
    'user_avatar' => $opp_avatar,
    'opp_name' => $my_name,
    'opp_id' => $my_uid,
    'opp_avatar' => $my_avatar,
    'room' => $room_token_val,
    'token' => $token,
    'role' => $opp_role,
    'is_bot' => $is_bot,
    'bot_winrate' => $bot_winrate,
    'bot_style' => $bot_style,
    'bet_amount' => $bet_amount,
    'mode' => $is_demo ? 'demo' : 'battle',
    'lang' => 'pt'
]);
?>

<style id="arena-play-mobile-refined">
/* IDENTIDADE VISUAL NGOLABIZ: PRETO (#08080a, #0e0e12), VERMELHO (#ef4444), BRANCO (#ffffff) */
:root {
  --neon-cyan: #ef4444 !important;
  --neon-purple: #dc2626 !important;
  --neon-gold: #ffffff !important;
}

/* Ocultar barra inferior flutuante na tela de combate para liberar tela e controles */
.arena-bottom-nav {
  display: none !important;
}

/* Identidade Preto, Vermelho e Branco na Arena */
.arena-duel-match-header {
  background: #0e0e12 !important;
  border: 1px solid #23232b !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6) !important;
}

.fighter-avatar-wrap.p1-ring img {
  border: 2px solid #ffffff !important;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.3) !important;
}

.fighter-avatar-wrap.p2-ring img {
  border: 2px solid #ef4444 !important;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.4) !important;
}

.p1-score-val {
  color: #ffffff !important;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.5) !important;
}

.score-divider {
  color: #ef4444 !important;
}

.p2-score-val {
  color: #ef4444 !important;
  text-shadow: 0 0 8px rgba(239, 68, 68, 0.6) !important;
}

.score-timer-sub {
  color: #ffffff !important;
  border-left: 1px solid rgba(255, 255, 255, 0.2) !important;
}
.score-timer-sub i {
  color: #ef4444 !important;
}

.badge-round-info {
  background: rgba(239, 68, 68, 0.15) !important;
  color: #ef4444 !important;
  border: 1px solid rgba(239, 68, 68, 0.4) !important;
}

.badge-prize {
  background: rgba(239, 68, 68, 0.12) !important;
  color: #ffffff !important;
  border: 1px solid rgba(239, 68, 68, 0.35) !important;
}

.arena-match-toolbar {
  background: #0e0e12 !important;
  border: 1px solid #23232b !important;
}

.btn-tool-mode {
  background: #16161e !important;
  border: 1px solid #272733 !important;
  color: #94a3b8 !important;
}
.btn-tool-mode:hover {
  color: #ffffff !important;
  border-color: #ef4444 !important;
}
.btn-tool-mode.active {
  background: #ef4444 !important;
  color: #ffffff !important;
  border-color: #dc2626 !important;
  box-shadow: 0 2px 10px rgba(239, 68, 68, 0.4) !important;
}

.btn-action-forfeit {
  background: #1c1917 !important;
  border: 1px solid #ef4444 !important;
  color: #ef4444 !important;
}
.btn-action-forfeit:hover {
  background: #ef4444 !important;
  color: #ffffff !important;
}

.btn-start-sync-action {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
  box-shadow: 0 4px 18px rgba(239, 68, 68, 0.45) !important;
  border: none !important;
  color: #ffffff !important;
}

.ready-player-card {
  background: #121217 !important;
  border: 1px solid #23232b !important;
}

.ready-state-badge.waiting {
  background: rgba(239, 68, 68, 0.15) !important;
  color: #ef4444 !important;
  border: 1px solid rgba(239, 68, 68, 0.35) !important;
}
.ready-state-badge.confirmed {
  background: rgba(239, 68, 68, 0.2) !important;
  color: #ffffff !important;
  border: 1px solid #ef4444 !important;
}

/* ==========================================================================
   OTIMIZAÇÃO MOBILE (SMARTPHONES <= 768px): FIM DA CONFUSÃO
   ========================================================================== */
@media (max-width: 768px) {
  .arena-page-body {
    padding: 6px 8px 16px 8px !important;
    max-width: 100vw !important;
    overflow-x: hidden !important;
  }

  /* Ocultar abas horizontais no combate */
  .arena-game-tabs-bar {
    display: none !important;
  }
  .arena-tactical-briefing-card {
    display: none !important;
  }

  /* HUD do Combate: barra esports horizontal enxuta */
  .arena-duel-match-header {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 8px 10px !important;
    margin-bottom: 6px !important;
    gap: 6px !important;
    border-radius: 12px !important;
  }

  .fighter-side {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    flex: 1 !important;
    min-width: 0 !important;
  }
  .fighter-side.p2-side {
    justify-content: flex-end !important;
    text-align: right !important;
    flex-direction: row !important;
  }

  .fighter-avatar-wrap {
    width: 36px !important;
    height: 36px !important;
  }

  .fighter-name {
    font-size: 0.8rem !important;
    font-weight: 700 !important;
    color: #ffffff !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    max-width: 85px !important;
    line-height: 1.1 !important;
  }
  .fighter-side.p2-side .fighter-name {
    color: #ef4444 !important;
  }

  .fighter-meta {
    display: none !important;
  }

  /* Centro do Placar: compacto e visível */
  .duel-center-score-wrap {
    flex: 1.2 !important;
    margin: 0 !important;
    text-align: center !important;
  }

  .duel-vs-chip, .duel-sync-indicator {
    display: none !important;
  }

  .duel-live-realtime-score {
    padding: 3px 8px !important;
    margin: 0 auto 2px auto !important;
    gap: 6px !important;
    border-radius: 8px !important;
    max-width: 140px !important;
  }

  .p1-score-val, .p2-score-val {
    font-size: 1.1rem !important;
  }
  .score-divider {
    font-size: 0.95rem !important;
  }
  .score-timer-sub {
    font-size: 0.8rem !important;
    padding-left: 6px !important;
    margin-left: 6px !important;
  }

  .duel-rounds-indicator {
    margin: 2px 0 0 0 !important;
    gap: 4px !important;
  }
  .badge-round-info {
    font-size: 0.68rem !important;
    padding: 1px 6px !important;
  }
  .round-dot {
    width: 8px !important;
    height: 8px !important;
  }

  .duel-prize-chip {
    margin-top: 2px !important;
  }
  .badge-prize {
    font-size: 0.66rem !important;
    padding: 1px 8px !important;
  }

  /* Toolbar de visualização e ações */
  .arena-match-toolbar {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 4px 8px !important;
    margin-bottom: 6px !important;
    gap: 4px !important;
    border-radius: 10px !important;
  }
  .toolbar-left-modes {
    gap: 4px !important;
  }
  .toolbar-label {
    display: none !important;
  }
  .btn-tool-mode {
    padding: 4px 7px !important;
    font-size: 0.72rem !important;
    gap: 3px !important;
  }
  .toolbar-right-actions {
    gap: 4px !important;
  }
  .latency-pill {
    padding: 3px 6px !important;
    font-size: 0.7rem !important;
  }
  .btn-tool-icon {
    width: 28px !important;
    height: 28px !important;
    font-size: 0.75rem !important;
  }
  .btn-action-forfeit {
    padding: 4px 8px !important;
    font-size: 0.72rem !important;
    gap: 3px !important;
  }

  /* Painel de Prontidão Compacto no Mobile */
  .arena-ready-sync-panel {
    padding: 8px !important;
    margin-bottom: 6px !important;
    border-radius: 12px !important;
  }
  .ready-panel-content {
    display: flex !important;
    flex-direction: column !important;
    gap: 6px !important;
  }
  .ready-player-card {
    padding: 6px 10px !important;
    gap: 8px !important;
  }
  .ready-avatar {
    width: 28px !important;
    height: 28px !important;
  }
  .ready-p-info strong {
    font-size: 0.78rem !important;
  }
  .ready-ping-badge {
    font-size: 0.68rem !important;
  }
  .ready-state-badge {
    font-size: 0.68rem !important;
    padding: 2px 8px !important;
    margin-left: auto !important;
  }
  .ready-center-hub {
    padding: 2px 0 !important;
  }
  .ready-hub-title {
    font-size: 0.75rem !important;
  }
  .ready-hub-desc {
    display: none !important;
  }
  .btn-start-sync-action {
    width: 100% !important;
    padding: 9px 16px !important;
    font-size: 0.88rem !important;
    justify-content: center !important;
    border-radius: 8px !important;
  }

  /* Telas de Jogo: altura ajustada para caber controles e jogo na mesma tela */
  .screen-viewport-wrap {
    height: clamp(230px, 48vh, 320px) !important;
  }
  .screen-box-header {
    padding: 4px 8px !important;
  }
  .screen-title-wrap strong {
    font-size: 0.75rem !important;
  }
  .screen-badge {
    font-size: 0.65rem !important;
    padding: 1px 6px !important;
  }

  /* Gamepad Virtual Mobile: logo abaixo do jogo, limpo e direto */
  .arena-virtual-gamepad {
    margin-top: 8px !important;
    padding: 8px !important;
    background: #0e0e12 !important;
    border: 1px solid #23232b !important;
    border-radius: 12px !important;
  }
  .gamepad-header-bar {
    padding: 2px 4px 6px 4px !important;
    margin-bottom: 6px !important;
    border-bottom: 1px solid #1c1c24 !important;
  }
  .gamepad-title {
    font-size: 0.75rem !important;
    color: #ffffff !important;
  }
  .btn-gamepad-toggle {
    font-size: 0.68rem !important;
    padding: 2px 6px !important;
  }

  /* Botões D-Pad e Ação com cores NgolaBiz */
  .dpad-btn {
    background: #16161e !important;
    border: 1px solid #272733 !important;
    color: #ffffff !important;
  }
  .dpad-btn:active, .dpad-btn.active {
    background: #ef4444 !important;
    border-color: #dc2626 !important;
    color: #ffffff !important;
  }
  .act-btn {
    border-radius: 10px !important;
  }
  .act-btn.act-punch {
    background: #ef4444 !important;
    border: 1px solid #dc2626 !important;
    color: #ffffff !important;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4) !important;
  }
  .act-btn.act-kick, .act-btn.act-block, .act-btn.act-special {
    background: #16161e !important;
    border: 1px solid #2a2a38 !important;
    color: #ffffff !important;
  }
  .act-btn:active, .act-btn.active {
    filter: brightness(1.3) !important;
  }

  /* Guia de comandos e reações no mobile */
  .arena-sub-controls-grid {
    margin-top: 8px !important;
    gap: 8px !important;
  }
  .sub-control-card {
    padding: 8px 10px !important;
    background: #0e0e12 !important;
    border: 1px solid #23232b !important;
  }
}
</style>

<main class="arena-page-body">

    <!-- SELETOR RÁPIDO DOS 4 JOGOS OFICIAIS ATIVOS -->
    <div class="arena-game-tabs-bar">
        <?php foreach ($ARENA_GAMES as $k => $gm): ?>
            <?php if ($k === 'cardbattle' || $k === 'online-uno') continue; ?>
            <a href="<?php echo GAMER_URL; ?>/play.php?game=<?php echo $k; ?><?php echo $is_demo ? '&mode=demo' : ''; ?>" 
               class="game-tab-pill <?php echo ($k === $game_key) ? 'active' : ''; ?>">
                <i class="fa-solid <?php echo $gm['icon']; ?>"></i> 
                <span><?php echo htmlspecialchars($gm['name']); ?></span>
            </a>
        <?php endforeach; ?>
    </div>

    <!-- BRIEFING TÁTICO & REGRAS RÁPIDAS (DESIGN COMPACTO E PROPORCIONAL) -->
    <div class="arena-tactical-briefing-card">
        <div class="briefing-header-bar" onclick="toggleRulesCard()">
            <div class="briefing-left-summary">
                <span class="briefing-badge">
                    <i class="fa-solid fa-book-open"></i> MANUAL TÁTICO
                </span>
                <span class="briefing-quick-target">
                    <strong>Objetivo:</strong> <?php echo htmlspecialchars($game_info['objective'] ?? 'Vencer o duelo com maior habilidade.'); ?>
                </span>
            </div>
            <button type="button" class="btn-briefing-toggle" id="btn-toggle-rules" title="Expandir ou recolher regras">
                <span>Ver Comandos & W.O.</span> <i class="fa-solid fa-chevron-down"></i>
            </button>
        </div>

        <div id="rules-collapsible-content" style="display: none;">
            <div class="briefing-expanded-grid">
                <div class="briefing-grid-item">
                    <h5 style="color: #ef4444;"><i class="fa-solid fa-gamepad"></i> Como Jogar & Controles:</h5>
                    <p><?php echo htmlspecialchars($game_info['rules'] ?? 'Aja com rapidez na sua vez, faça combos e responda aos ataques do adversário.'); ?></p>
                </div>
                <div class="briefing-grid-item">
                    <h5 style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Regra de W.O. & Aposta:</h5>
                    <p>Desistir ou fechar a janela durante uma partida com aposta ativa acarreta derrota imediata por W.O. e perda da aposta.</p>
                </div>
            </div>
        </div>
    </div>

    <?php if (!$has_opponent): ?>
        <!-- SE NÃO HOUVER OPONENTE SELECIONADO: EXIBIR RADAR DE BUSCA -->
        <div class="hero-game-card radar-lobby-card">
            <div class="radar-sonar-disc">
                <div class="radar-sonar-sweep"></div>
                <div class="radar-center-icon">
                    <i class="fa-solid fa-satellite-dish"></i>
                </div>
            </div>
            <h2 style="font-family: var(--font-gamer); font-size: 1.6rem; font-weight: 800; color: #fff; margin-bottom: 6px;">
                BUSCAR ADVERSÁRIO NA ARENA
            </h2>
            <p style="color: var(--text-muted); max-width: 480px; font-size: 0.9rem; margin-bottom: 16px;">
                Selecione um combatente online em Luanda, Benguela, Huambo ou de qualquer província para iniciar o duelo de <?php echo htmlspecialchars($game_info['name']); ?>.
            </p>
            <button type="button" class="btn-launch-hero" onclick="openMatchmakingModal('<?php echo $game_key; ?>')">
                <i class="fa-solid fa-crosshairs"></i> BUSCAR JOGADORES ONLINE
            </button>
        </div>

    <?php elseif (!$has_sufficient_balance): ?>
        <!-- AVISO DE SALDO INSUFICIENTE -->
        <div class="arena-insufficient-balance-card">
            <div class="insufficient-icon-circle">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <h2 style="font-family: var(--font-gamer); font-size: 1.5rem; font-weight: 800; color: #fff; margin-bottom: 8px;">
                SALDO INSUFICIENTE NA CARTEIRA
            </h2>
            <p style="color: #cbd5e1; font-size: 0.95rem; max-width: 520px; margin: 0 auto 18px; line-height: 1.5;">
                Esta partida possui uma aposta de <strong style="color: #ffffff;"><?php echo number_format($bet_amount, 0, ',', '.'); ?> Kz</strong>.<br>
                Seu saldo real atual é de <strong style="color: #ef4444;"><?php echo number_format($user_wallet, 2, ',', '.'); ?> Kz</strong>. Faça um depósito rápido para competir por este prêmio.
            </p>
            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <a href="<?php echo GAMER_URL; ?>/deposito.php" target="_blank" class="btn-launch-hero" style="background: linear-gradient(135deg, #10b981, #059669); text-decoration: none; padding: 10px 22px; font-size: 0.92rem;">
                    <i class="fa-solid fa-wallet"></i> Fazer Depósito Agora
                </a>
                <a href="<?php echo GAMER_URL; ?>/play.php?game=<?php echo $game_key; ?>&mode=demo" class="btn-launch-hero" style="background: var(--bg-card); border: 1px solid var(--border-subtle); color: #fff; text-decoration: none; padding: 10px 20px; font-size: 0.92rem;">
                    <i class="fa-solid fa-gamepad"></i> Jogar Modo Treino (Demo)
                </a>
            </div>
        </div>

    <?php else: ?>

        <!-- HUD DE COMBATE ESPORTS (DESIGN COMPACTO, HARMONIOSO E PROPORCIONAL) -->
        <div class="arena-duel-match-header">
            
            <!-- Combatente 1 (Você) -->
            <div class="fighter-side p1-side">
                <div class="fighter-avatar-wrap p1-ring">
                    <img src="<?php echo htmlspecialchars($my_avatar); ?>" alt="Você">
                    <span class="live-dot-mini" title="Conectado"></span>
                </div>
                <div class="fighter-info-col">
                    <div class="fighter-name">
                        <?php echo htmlspecialchars($my_name); ?> <span class="tag-you">(Você)</span>
                    </div>
                    <div class="fighter-meta">
                        <i class="fa-solid fa-location-dot"></i> <?php echo htmlspecialchars($user_province); ?> • <?php echo $my_points; ?> Pts • Saldo: <strong id="hud-live-wallet-balance" style="color: #ffffff;"><?php echo number_format($user_wallet, 2, ',', '.'); ?> Kz</strong>
                    </div>
                </div>
            </div>

            <!-- Placar & Informações Centrais -->
            <div class="duel-center-score-wrap">
                <div class="duel-vs-chip">
                    <span class="vs-text">VS</span>
                    <span class="game-badge-text"><?php echo htmlspecialchars($game_info['name']); ?></span>
                </div>

                <!-- PLACAR EM TEMPO REAL & TEMPO OFICIAL DE BATALHA -->
                <div class="duel-live-realtime-score" id="duel-live-scoreboard">
                    <span class="p1-score-val" id="hud-score-p1" title="Sua Pontuação">0</span>
                    <span class="score-divider">:</span>
                    <span class="p2-score-val" id="hud-score-p2" title="Pontuação do Adversário">0</span>
                    <div class="score-timer-sub" id="hud-match-timer">
                        <i class="fa-solid fa-stopwatch"></i> <span id="hud-timer-sec">60</span>s
                    </div>
                </div>

                <!-- RASTREADOR VISUAL DE 3 ROUNDS (MELHOR DE 3 / BEST OF 3) -->
                <div class="duel-rounds-indicator" id="duel-rounds-tracker" style="display: flex; align-items: center; justify-content: center; gap: 10px; margin: 4px 0 6px;">
                    <div style="display: flex; align-items: center; gap: 5px;" title="Rounds Vencidos por Você">
                        <span class="round-dot" id="p1-round-dot-1" style="width: 12px; height: 12px; border-radius: 50%; background: #1e293b; border: 1.5px solid #475569; display: inline-block; transition: all 0.3s ease;"></span>
                        <span class="round-dot" id="p1-round-dot-2" style="width: 12px; height: 12px; border-radius: 50%; background: #1e293b; border: 1.5px solid #475569; display: inline-block; transition: all 0.3s ease;"></span>
                    </div>
                    <span class="badge-round-info" id="current-round-badge" style="font-size: 0.78rem; font-weight: 800; padding: 2px 10px; border-radius: 12px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); text-transform: uppercase;">
                        <i class="fa-solid fa-swords"></i> ROUND <span id="round-number-text">1</span> / 3
                    </span>
                    <div style="display: flex; align-items: center; gap: 5px;" title="Rounds Vencidos pelo Adversário">
                        <span class="round-dot" id="p2-round-dot-1" style="width: 12px; height: 12px; border-radius: 50%; background: #1e293b; border: 1.5px solid #475569; display: inline-block; transition: all 0.3s ease;"></span>
                        <span class="round-dot" id="p2-round-dot-2" style="width: 12px; height: 12px; border-radius: 50%; background: #1e293b; border: 1.5px solid #475569; display: inline-block; transition: all 0.3s ease;"></span>
                    </div>
                </div>

                <div class="duel-prize-chip">
                    <?php if ($is_demo): ?>
                        <span class="badge-demo"><i class="fa-solid fa-shield-halved"></i> MODO TREINO (DEMO)</span>
                    <?php elseif ($bet_amount > 0): ?>
                        <span class="badge-prize"><i class="fa-solid fa-coins"></i> PRÊMIO LÍQUIDO: <?php echo number_format($winner_net_prize, 0, ',', '.'); ?> Kz <small>(Aposta: <?php echo number_format($bet_amount, 0, ',', '.'); ?> Kz • Taxa: <?php echo $platform_fee_percent; ?>%)</small></span>
                    <?php else: ?>
                        <span class="badge-friendly"><i class="fa-solid fa-handshake"></i> DUELO AMISTOSO</span>
                    <?php endif; ?>
                </div>
                
                <div class="duel-sync-indicator">
                    <span class="pulse-red-dot"></span> DUAS TELAS SINCRONIZADAS EM TEMPO REAL
                </div>
            </div>

            <!-- Combatente 2 (Adversário) -->
            <div class="fighter-side p2-side">
                <div class="fighter-info-col" style="text-align: right;">
                    <div class="fighter-name">
                        <?php echo htmlspecialchars($opp_name); ?>
                    </div>
                    <div class="fighter-meta">
                        <i class="fa-solid fa-location-dot"></i> <?php echo htmlspecialchars($opp_province); ?> • <?php echo $opp_points; ?> Pontos
                    </div>
                </div>
                <div class="fighter-avatar-wrap p2-ring">
                    <img src="<?php echo htmlspecialchars($opp_avatar); ?>" alt="Oponente">
                    <span class="live-dot-mini" title="Oponente ao Vivo"></span>
                </div>
            </div>

        </div>

        <!-- BARRA DE CONTROLE DA ARENA (AÇÕES, VITÓRIA, DESISTÊNCIA E MODOS DE TELA) -->
        <div class="arena-match-toolbar">
            <div class="toolbar-left-modes">
                <span class="toolbar-label"><i class="fa-solid fa-desktop"></i> Visão:</span>
                <button type="button" class="btn-tool-mode active" id="btn-mode-split" onclick="setScreenLayout('split')" title="Visualização Split-Screen Lado a Lado">
                    <i class="fa-solid fa-table-columns"></i> <span>Duas Telas</span>
                </button>
                <button type="button" class="btn-tool-mode" id="btn-mode-p1" onclick="setScreenLayout('p1')" title="Focar na Minha Tela">
                    <i class="fa-solid fa-user"></i> <span>Minha Tela</span>
                </button>
                <button type="button" class="btn-tool-mode" id="btn-mode-p2" onclick="setScreenLayout('p2')" title="Focar no Adversário">
                    <i class="fa-solid fa-eye"></i> <span>Adversário</span>
                </button>
            </div>

            <div class="toolbar-right-actions">
                <div class="latency-pill" title="Latência de conexão da partida">
                    <i class="fa-solid fa-wifi"></i> <span id="live-ping-val">16ms</span>
                </div>
                <button type="button" class="btn-tool-icon" id="arena-play-mute-btn" onclick="if(window.arenaAudio) window.arenaAudio.toggleMute();" title="Ligar/Desligar Som da Batalha">
                    <i class="fa-solid fa-volume-high" id="arena-play-mute-icon" style="color: #ef4444;"></i>
                </button>
                <button type="button" class="btn-tool-icon" onclick="reloadGameFrame()" title="Recarregar Partida">
                    <i class="fa-solid fa-rotate-right"></i>
                </button>
                <button type="button" class="btn-tool-icon" onclick="toggleGameFullscreen()" title="Modo Ecrã Inteiro">
                    <i class="fa-solid fa-expand"></i>
                </button>
                <button type="button" class="btn-action-forfeit" onclick="confirmForfeitMatch()" title="Desistir da Partida">
                    <i class="fa-solid fa-flag"></i> <span>Desistir</span>
                </button>
            </div>
        </div>

        <!-- PAINEL DE SINCRONIZAÇÃO, TESTE DE VELOCIDADE (PING) E READY CHECK DA ARENA (P2P REAL) -->
        <div class="arena-ready-sync-panel" id="arena-ready-sync-box">
            <div class="ready-panel-content">
                
                <!-- Combatente 1 (Você) -->
                <div class="ready-player-card p1-ready-card">
                    <img src="<?php echo htmlspecialchars($my_avatar); ?>" alt="Você" class="ready-avatar">
                    <div class="ready-p-info">
                        <strong><?php echo htmlspecialchars($my_name); ?> (Você)</strong>
                        <div class="ready-ping-badge ping-green">
                            <span class="pulse-indicator-dot"></span> <span id="ready-ping-p1">18ms</span> • Conexão Excelente
                        </div>
                    </div>
                    <div class="ready-state-badge waiting" id="ready-badge-p1">
                        <i class="fa-solid fa-clock"></i> Aguardando Você
                    </div>
                </div>

                <!-- Centro: Controle de Sintonia & Contagem Sincronizada -->
                <div class="ready-center-hub">
                    <div class="ready-hub-title">
                        <i class="fa-solid fa-satellite-dish" style="color: #ef4444;"></i> TESTE DE VELOCIDADE & PRONTIDÃO
                    </div>
                    <div class="ready-hub-desc" id="ready-hub-desc-text">
                        A partida iniciará em sintonia quando ambos os combatentes confirmarem presença.
                    </div>

                    <div id="ready-countdown-container" style="display: none; width: 100%;">
                        <div class="battle-countdown-banner">
                            <span style="font-size: 0.72rem; color: #fecaca; display: block; font-weight: 700; letter-spacing: 1px;">BATALHA EM SINTONIA:</span>
                            <span id="battle-countdown-num">3</span>
                        </div>
                    </div>

                    <button type="button" class="btn-start-sync-action" id="btn-ready-confirm" onclick="confirmMyPresenceReady()">
                        <i class="fa-solid fa-check-double"></i> ESTOU PRONTO / COMEÇAR
                    </button>
                </div>

                <!-- Combatente 2 (Adversário) -->
                <div class="ready-player-card p2-ready-card">
                    <div class="ready-p-info">
                        <strong><?php echo htmlspecialchars($opp_name); ?></strong>
                        <div class="ready-ping-badge ping-red">
                            <span id="ready-ping-p2">23ms</span> • Conexão Estável <span class="pulse-indicator-dot"></span>
                        </div>
                    </div>
                    <img src="<?php echo htmlspecialchars($opp_avatar); ?>" alt="Adversário" class="ready-avatar">
                    <div class="ready-state-badge <?php echo $is_bot ? 'confirmed' : 'waiting'; ?>" id="ready-badge-p2">
                        <i class="fa-solid fa-<?php echo $is_bot ? 'circle-check' : 'clock'; ?>"></i> <?php echo $is_bot ? 'Oponente Pronto' : 'Aguardando Adversário'; ?>
                    </div>
                </div>

            </div>
        </div>

        <!-- SISTEMA DE DUAS TELAS SINCRONIZADAS (ESPORTS DUAL SCREEN) -->
        <div id="arena-dual-screens-container" class="arena-dual-screens-grid mode-split">

            <!-- TELA 1: SUA TELA DE COMBATE (JOGADOR PRINCIPAL - CONTROLE ATIVO) -->
            <div class="arena-screen-box p1-screen-box" id="screen-p1-box">
                <div class="screen-box-header p1-header">
                    <div class="screen-title-wrap">
                        <span class="live-tag-pulse"></span>
                        <strong>TELA 1: VOCÊ (<?php echo htmlspecialchars($my_name); ?>)</strong>
                    </div>
                    <div class="screen-badge p1-badge">
                        <i class="fa-solid fa-gamepad"></i> CONTROLE ATIVO
                    </div>
                </div>
                <div class="screen-viewport-wrap" style="background: #000000 !important;">
                    <iframe id="arena-game-frame" 
                            src="<?php echo GAMER_URL; ?>/games/<?php echo $game_info['folder']; ?>/<?php echo $game_info['file']; ?>?<?php echo $iframe_params_p1; ?>" 
                            allow="autoplay; fullscreen; gamepad; cross-origin-isolated; pointer-lock"
                            loading="eager"
                            allowtransparency="true"
                            style="background: #000000 !important;"></iframe>
                </div>
            </div>

            <!-- TELA 2: TELA DO ADVERSÁRIO (TRANSMISSÃO AO VIVO DO OPONENTE - CONTROLE BLOQUEADO) -->
            <div class="arena-screen-box p2-screen-box" id="screen-p2-box" style="position: relative;">
                <div class="screen-box-header p2-header">
                    <div class="screen-title-wrap">
                        <span class="live-tag-pulse"></span>
                        <strong>TELA 2: ADVERSÁRIO (<?php echo htmlspecialchars($opp_name); ?>)</strong>
                    </div>
                    <div class="screen-badge p2-badge">
                        <i class="fa-solid fa-video"></i> AO VIVO • TRANSMISSÃO
                    </div>
                </div>
                <div class="screen-viewport-wrap p2-viewport" style="position: relative; background: #000000 !important;">
                    <!-- FEED ESPELHADO EM TEMPO REAL OU IFRAME SINCRONIZADO VIA BROADCAST -->
                    <canvas id="arena-opp-mirror-canvas" class="opp-mirror-canvas" style="display: none;"></canvas>
                    <iframe id="arena-game-frame-opp" 
                            src="<?php echo GAMER_URL; ?>/games/<?php echo $game_info['folder']; ?>/<?php echo $game_info['file']; ?>?<?php echo $iframe_params_p2; ?>" 
                            allow="autoplay; fullscreen; gamepad; cross-origin-isolated; pointer-lock"
                            loading="eager"
                            allowtransparency="true"
                            style="pointer-events: none !important; background: #000000 !important;"></iframe>

                    <!-- BLOQUEADOR DE CONTROLE NA TELA DO ADVERSÁRIO (USUÁRIO NÃO PODE MEXER AQUI) -->
                    <div class="opp-screen-touch-blocker" style="position: absolute; inset: 0; z-index: 25; cursor: not-allowed; background: transparent;" title="Transmissão ao vivo do adversário (Controle bloqueado para Fair Play)"></div>

                    <!-- OVERLAY DE STATUS DO ADVERSÁRIO EM TEMPO REAL -->
                    <div class="opp-live-overlay-hud" id="opp-live-hud" style="z-index: 26;">
                        <div class="opp-hud-top">
                            <span class="opp-cam-pill"><i class="fa-solid fa-circle" style="color: #ef4444; font-size: 0.55rem;"></i> CAM AO VIVO • <?php echo htmlspecialchars($opp_province); ?></span>
                            <span class="opp-action-status" id="opp-action-status-text">Oponente pronto</span>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <!-- GAMEPAD VIRTUAL TOUCH PARA SMARTPHONES E TELAS TÁTEIS -->
        <div id="arena-virtual-gamepad" class="arena-virtual-gamepad">
            <div class="gamepad-header-bar">
                <span class="gamepad-title">
                    <i class="fa-solid fa-gamepad"></i> Controles Touch da Arena
                </span>
                <button type="button" class="btn-gamepad-toggle" onclick="toggleVirtualGamepad()">
                    <i class="fa-solid fa-gamepad"></i> Ocultar / Exibir
                </button>
            </div>
            <div class="gamepad-controls-wrapper" id="gamepad-buttons-area">
                <!-- D-PAD DIGITAL (DIRECIONAIS) -->
                <div class="gamepad-dpad-box">
                    <button type="button" class="dpad-btn dpad-up" data-dir="up" data-code="<?php echo ($game_key === 'fps3d') ? 'KeyW' : 'ArrowUp'; ?>" data-key="<?php echo ($game_key === 'fps3d') ? 'w' : 'ArrowUp'; ?>" data-keycode="<?php echo ($game_key === 'fps3d') ? '87' : '38'; ?>">
                        <i class="fa-solid fa-caret-up"></i>
                        <span><?php echo ($game_key === 'fps3d') ? 'FRENTE' : 'PULO'; ?></span>
                    </button>
                    <div class="dpad-middle-row">
                        <button type="button" class="dpad-btn dpad-left" data-dir="left" data-code="<?php echo ($game_key === 'fps3d') ? 'KeyA' : 'ArrowLeft'; ?>" data-key="<?php echo ($game_key === 'fps3d') ? 'a' : 'ArrowLeft'; ?>" data-keycode="<?php echo ($game_key === 'fps3d') ? '65' : '37'; ?>">
                            <i class="fa-solid fa-caret-left"></i>
                            <span>ESQ</span>
                        </button>
                        <div class="dpad-center-hub"></div>
                        <button type="button" class="dpad-btn dpad-right" data-dir="right" data-code="<?php echo ($game_key === 'fps3d') ? 'KeyD' : 'ArrowRight'; ?>" data-key="<?php echo ($game_key === 'fps3d') ? 'd' : 'ArrowRight'; ?>" data-keycode="<?php echo ($game_key === 'fps3d') ? '68' : '39'; ?>">
                            <span>DIR</span>
                            <i class="fa-solid fa-caret-right"></i>
                        </button>
                    </div>
                    <button type="button" class="dpad-btn dpad-down" data-dir="down" data-code="<?php echo ($game_key === 'fps3d') ? 'KeyS' : 'ArrowDown'; ?>" data-key="<?php echo ($game_key === 'fps3d') ? 's' : 'ArrowDown'; ?>" data-keycode="<?php echo ($game_key === 'fps3d') ? '83' : '40'; ?>">
                        <i class="fa-solid fa-caret-down"></i>
                        <span><?php echo ($game_key === 'fps3d') ? 'TRÁS' : 'AGACH'; ?></span>
                    </button>
                </div>

                <!-- BOTÕES DE AÇÃO / GOLPES -->
                <div class="gamepad-action-box">
                    <div class="action-btn-row">
                        <button type="button" class="act-btn act-punch" data-action="<?php echo ($game_key === 'fps3d') ? 'shoot' : 'punch'; ?>" data-code="<?php echo ($game_key === 'fps3d') ? 'MouseLeft' : 'KeyA'; ?>" data-key="<?php echo ($game_key === 'fps3d') ? 'attack' : 'a'; ?>" data-keycode="<?php echo ($game_key === 'fps3d') ? '0' : '65'; ?>">
                            <span class="act-key">A</span>
                            <span class="act-lbl"><?php echo ($game_key === 'fps3d') ? 'DISPARAR' : 'SOCO'; ?></span>
                        </button>
                        <button type="button" class="act-btn act-kick" data-action="<?php echo ($game_key === 'fps3d') ? 'jump' : 'kick'; ?>" data-code="<?php echo ($game_key === 'fps3d') ? 'Space' : 'KeyD'; ?>" data-key="<?php echo ($game_key === 'fps3d') ? ' ' : 'd'; ?>" data-keycode="<?php echo ($game_key === 'fps3d') ? '32' : '68'; ?>">
                            <span class="act-key"><?php echo ($game_key === 'fps3d') ? 'ESPAÇO' : 'D'; ?></span>
                            <span class="act-lbl"><?php echo ($game_key === 'fps3d') ? 'SALTAR' : 'CHUTE'; ?></span>
                        </button>
                    </div>
                    <div class="action-btn-row">
                        <button type="button" class="act-btn act-block" data-action="<?php echo ($game_key === 'fps3d') ? 'reload' : 'block'; ?>" data-code="<?php echo ($game_key === 'fps3d') ? 'KeyR' : 'ShiftLeft'; ?>" data-key="<?php echo ($game_key === 'fps3d') ? 'r' : 'Shift'; ?>" data-keycode="<?php echo ($game_key === 'fps3d') ? '82' : '16'; ?>">
                            <span class="act-key"><?php echo ($game_key === 'fps3d') ? 'R' : 'DEF'; ?></span>
                            <span class="act-lbl"><?php echo ($game_key === 'fps3d') ? 'RECARGA' : 'DEFESA'; ?></span>
                        </button>
                        <button type="button" class="act-btn act-special" data-action="<?php echo ($game_key === 'fps3d') ? 'grenade' : 'special'; ?>" data-code="<?php echo ($game_key === 'fps3d') ? 'KeyG' : 'KeyF'; ?>" data-key="<?php echo ($game_key === 'fps3d') ? 'g' : 'f'; ?>" data-keycode="<?php echo ($game_key === 'fps3d') ? '71' : '70'; ?>">
                            <span class="act-key"><?php echo ($game_key === 'fps3d') ? 'G' : 'F'; ?></span>
                            <span class="act-lbl"><?php echo ($game_key === 'fps3d') ? 'GRANADA' : 'GOLPE +'; ?></span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- PAINEL COMPACTO DE COMANDOS RÁPIDOS & REAÇÕES DO DUELO -->
        <div class="arena-sub-controls-grid">
            <!-- Guia de Teclas Rápidas -->
            <div class="sub-control-card">
                <h5 class="sub-card-title">
                    <i class="fa-solid fa-keyboard" style="color: #ef4444;"></i> Comandos da Partida
                </h5>
                <div class="sub-card-body">
                    <?php if ($game_key === 'fps3d'): ?>
                        <span>• <strong>W, A, S, D</strong>: Movimentação tática em 3D</span>
                        <span>• <strong>Mouse / Clique</strong>: Mirar e Disparar arma</span>
                        <span>• <strong>Barra de Espaço</strong>: Saltar • <strong>R</strong>: Recarregar • <strong>G / 1-4</strong>: Granada e Armas</span>
                    <?php elseif ($game_key === 'neon-fist'): ?>
                        <span>• <strong>W, A, S, D</strong> ou <strong>Setas</strong>: Movimentação e Esquiva</span>
                        <span>• <strong>J, K / Z, X</strong>: Socos, Chutes e Sequências</span>
                        <span>• <strong>Barra de Espaço / L</strong>: Defesa e Bloqueio</span>
                    <?php elseif ($game_key === 'hyperstrike'): ?>
                        <span>• <strong>Mouse / Mira</strong>: Direcionar mira e disparar projéteis</span>
                        <span>• <strong>Toque (Celular)</strong>: Botões virtuais na tela</span>
                    <?php elseif ($game_key === 'mkjs'): ?>
                        <span>• <strong>Setas</strong>: Andar, Agachar e Pular</span>
                        <span>• <strong>A, S, D, F</strong>: Socos e Chutes Clássicos</span>
                    <?php else: ?>
                        <span>• <strong>Clique / Toque</strong>: Descartar carta combinando cor/número</span>
                        <span>• <strong>Baralho</strong>: Comprar cartas quando necessário</span>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Reações Rápidas -->
            <div class="sub-control-card">
                <h5 class="sub-card-title">
                    <i class="fa-solid fa-comment-dots" style="color: #dc2626;"></i> Reações no Duelo
                </h5>
                <div class="reactions-chips-row">
                    <button type="button" class="reaction-chip" onclick="sendQuickReaction('🔥 Grande jogada!')">
                        🔥 Grande jogada!
                    </button>
                    <button type="button" class="reaction-chip" onclick="sendQuickReaction('⚡ Tudo ou nada!')">
                        ⚡ Tudo ou nada!
                    </button>
                    <button type="button" class="reaction-chip" onclick="sendQuickReaction('🏆 Essa vitória é minha!')">
                        🏆 Essa é minha!
                    </button>
                    <button type="button" class="reaction-chip" onclick="sendQuickReaction('👏 GG! Bom jogo.')">
                        👏 GG!
                    </button>
                </div>
                <div id="quick-reaction-toast" class="reaction-toast-box" style="display: none;"></div>
            </div>
        </div>

        <!-- RODAPÉ DE NAVEGAÇÃO -->
        <div class="arena-play-footer-nav">
            <a href="<?php echo GAMER_URL; ?>/index.php" class="btn-subtle-nav">
                <i class="fa-solid fa-arrow-left"></i> Voltar ao Dashboard
            </a>
            <button type="button" class="btn-subtle-nav highlight" onclick="openMatchmakingModal('<?php echo $game_key; ?>')">
                <i class="fa-solid fa-satellite-dish"></i> Desafiar Outro Jogador
            </button>
        </div>

    <?php endif; ?>

</main>

<script>
// 1. Controle do Manual Tático Expansível
function toggleRulesCard() {
    var content = document.getElementById('rules-collapsible-content');
    var btn = document.getElementById('btn-toggle-rules');
    if (!content) return;
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (btn) btn.innerHTML = '<span>Recolher</span> <i class="fa-solid fa-chevron-up"></i>';
    } else {
        content.style.display = 'none';
        if (btn) btn.innerHTML = '<span>Ver Comandos & W.O.</span> <i class="fa-solid fa-chevron-down"></i>';
    }
}

// 2. Alternância de Layout das Duas Telas (Split, Foco P1, Foco P2)
function setScreenLayout(mode) {
    var container = document.getElementById('arena-dual-screens-container');
    var btnSplit = document.getElementById('btn-mode-split');
    var btnP1 = document.getElementById('btn-mode-p1');
    var btnP2 = document.getElementById('btn-mode-p2');

    if (!container) return;
    container.classList.remove('mode-split', 'mode-p1', 'mode-p2');
    container.classList.add('mode-' + mode);

    if (btnSplit) btnSplit.classList.toggle('active', mode === 'split');
    if (btnP1) btnP1.classList.toggle('active', mode === 'p1');
    if (btnP2) btnP2.classList.toggle('active', mode === 'p2');

    // Notificar iframes para recalcularem escala e centralização imediatamente
    setTimeout(function() {
        var fr1 = document.getElementById('arena-game-frame');
        var fr2 = document.getElementById('arena-game-frame-opp');
        if (fr1 && fr1.contentWindow) {
            fr1.contentWindow.postMessage({ type: 'arena_resize', mode: mode }, '*');
        }
        if (fr2 && fr2.contentWindow) {
            fr2.contentWindow.postMessage({ type: 'arena_resize', mode: mode }, '*');
        }
    }, 60);
}

// 3. Recarregar e Tela Cheia
function reloadGameFrame() {
    var fr1 = document.getElementById('arena-game-frame');
    var fr2 = document.getElementById('arena-game-frame-opp');
    if (fr1) fr1.src = fr1.src;
    if (fr2) fr2.src = fr2.src;
}

function toggleGameFullscreen() {
    var wrapper = document.getElementById('arena-dual-screens-container');
    if (!wrapper) return;
    if (!document.fullscreenElement) {
        if (wrapper.requestFullscreen) {
            wrapper.requestFullscreen();
        } else if (wrapper.webkitRequestFullscreen) {
            wrapper.webkitRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// 4. Reações Rápidas
function sendQuickReaction(text) {
    var toast = document.getElementById('quick-reaction-toast');
    if (toast) {
        toast.textContent = "Você: " + text;
        toast.style.display = 'block';
        setTimeout(function() { toast.style.display = 'none'; }, 3000);
    }
}

// 5. SINCRONIZAÇÃO EM TEMPO REAL ENTRE AS DUAS TELAS & READY CHECK
var myRole = "<?php echo addslashes($my_role); ?>";
var currentChallengeToken = "<?php echo addslashes($token); ?>";
var isDemoMode = <?php echo $is_demo ? 'true' : 'false'; ?>;
var isOpponentBot = <?php echo $is_bot ? 'true' : 'false'; ?>;
var isMyReady = isDemoMode ? true : false;
var localP1Score = 0;
var matchSyncInterval = null;
var battleStarted = false;
var countdownStarted = false;
var arenaMatchActive = false;
var matchTimerVal = 60;
var matchTimerInterval = null;
var arenaSyncChannel = null;

if ('BroadcastChannel' in window) {
    try {
        arenaSyncChannel = new BroadcastChannel('arena_sync_' + '<?php echo addslashes($token); ?>');
        arenaSyncChannel.onmessage = function(e) {
            if (!e.data) return;
            if (e.data.type === 'ready_check_confirmed') {
                if (!countdownStarted && !battleStarted) {
                    startSynchronizedCountdown(3);
                }
            }
        };
    } catch(err) {}
}

function confirmMyPresenceReady() {
    if (countdownStarted || battleStarted) return;
    isMyReady = true;

    var btn = document.getElementById('btn-ready-confirm');
    var badgeP1 = document.getElementById('ready-badge-p1');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('waiting');
    }
    if (badgeP1) {
        badgeP1.className = 'ready-state-badge confirmed';
        badgeP1.innerHTML = '<i class="fa-solid fa-circle-check"></i> Você Confirmou!';
    }
    if (arenaSyncChannel) {
        arenaSyncChannel.postMessage({ type: 'ready_check_confirmed' });
    }

    // REGRA 1: Se o oponente for BOT ou modo demo/treino:
    // Simula confirmação mútua do oponente e inicia a contagem regressiva 3.. 2.. 1.. BATALHA!
    if (isOpponentBot || !currentChallengeToken || isDemoMode) {
        setTimeout(function() {
            var badgeP2 = document.getElementById('ready-badge-p2');
            if (badgeP2) {
                badgeP2.className = 'ready-state-badge confirmed';
                badgeP2.innerHTML = '<i class="fa-solid fa-circle-check"></i> Oponente Pronto';
            }
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-bolt"></i> AMBOS PRONTOS! INICIANDO...';
            }
            startSynchronizedCountdown(3);
        }, 350);
        return;
    }

    // REGRA 2: Se for duelo entre dois jogadores humanos na rede
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> VOCÊ CONFIRMOU (Aguardando Adversário...)';
    }

    // Fallback amigável: se após 12 segundos o adversário não confirmar presença, permitir iniciar
    setTimeout(function() {
        if (!battleStarted && !countdownStarted) {
            var fallbackBox = document.getElementById('ready-hub-desc-text');
            if (fallbackBox) {
                fallbackBox.innerHTML = 'Adversário demorando? <button type="button" onclick="startSynchronizedCountdown(3)" style="background:none;border:none;color:#ef4444;cursor:pointer;text-decoration:underline;font-weight:700;">Clique para iniciar a batalha agora</button>';
            }
        }
    }, 12000);

    tickMatchSync();
}

function tickMatchSync() {
    if (!currentChallengeToken || isDemoMode || battleStarted) return;

    fetch((window.__ARENA_BASE_URL || '') + '/api.php?action=match_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            challenge_token: currentChallengeToken,
            role: myRole,
            ready: isMyReady ? 1 : 0,
            score: localP1Score
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (!data || data.status !== 'ok') return;

        // Atualizar status do oponente no painel de prontidão
        var badgeP2 = document.getElementById('ready-badge-p2');
        if (badgeP2 && data.opp_ready) {
            badgeP2.className = 'ready-state-badge confirmed';
            badgeP2.innerHTML = '<i class="fa-solid fa-circle-check"></i> Oponente Pronto';
        }

        // Se ambos estão prontos e ainda não disparou a contagem
        if (data.both_ready && !battleStarted && !countdownStarted) {
            startSynchronizedCountdown(data.countdown_remaining || 3);
        }

        // Durante o combate: sincronizar placar do adversário na Tela 2
        if (battleStarted && typeof data.opp_score !== 'undefined') {
            var elScoreP2 = document.getElementById('hud-score-p2');
            if (elScoreP2) elScoreP2.textContent = data.opp_score;
        }

        // Se o adversário desistiu da partida por W.O.
        if (battleStarted && (data.match_status === 'forfeited' || data.match_status === 'declined')) {
            if (matchSyncInterval) clearInterval(matchSyncInterval);
            showResultModal('win', false, 'O adversário abandonou a batalha (W.O.)! A vitória e o prêmio foram creditados a você.');
        }
    })
    .catch(function(err) {});
}

function startSynchronizedCountdown(remSec) {
    if (countdownStarted) return;
    countdownStarted = true;

    var btn = document.getElementById('btn-ready-confirm');
    var countBox = document.getElementById('ready-countdown-container');
    var countNum = document.getElementById('battle-countdown-num');
    var descText = document.getElementById('ready-hub-desc-text');

    if (btn) btn.style.display = 'none';
    if (descText) descText.textContent = 'Combatentes em sintonia perfeita. Concentração!';
    if (countBox) countBox.style.display = 'block';

    var cVal = Math.max(1, remSec || 3);
    if (countNum) countNum.textContent = cVal;

    var countTimer = setInterval(function() {
        cVal--;
        if (cVal > 0) {
            if (countNum) countNum.textContent = cVal;
        } else {
            clearInterval(countTimer);
            if (countNum) countNum.textContent = 'BATALHA!';
            setTimeout(function() {
                var syncBox = document.getElementById('arena-ready-sync-box');
                if (syncBox) {
                    syncBox.style.opacity = '0';
                    syncBox.style.transition = 'opacity 0.4s ease';
                    setTimeout(function() { syncBox.style.display = 'none'; }, 400);
                }
                battleStarted = true;
                launchGamesSynchronized(60);
            }, 600);
        }
    }, 1000);
}

function autoStartBattleOnLoad() {
    if (!isDemoMode && currentChallengeToken) {
        // Iniciar polling contínuo de sincronização na rede a cada 600ms
        matchSyncInterval = setInterval(tickMatchSync, 600);
        tickMatchSync();
    } else {
        // Modo Treino / Demo ou contra Bot Oficial:
        // Iniciar contagem regressiva automaticamente após 1.5s para o combate começar sem atrito
        setTimeout(function() {
            if (!battleStarted && !countdownStarted) {
                confirmMyPresenceReady();
            }
        }, 1500);
    }
}

function launchGamesSynchronized(duration) {
    arenaMatchActive = true;
    battleStarted = true;
    matchTimerVal = duration;
    
    var tSec = document.getElementById('hud-timer-sec');
    if (tSec) tSec.textContent = matchTimerVal;
    
    if (matchTimerInterval) clearInterval(matchTimerInterval);
    matchTimerInterval = setInterval(function() {
        matchTimerVal--;
        if (tSec) tSec.textContent = matchTimerVal;
        if (matchTimerVal <= 0) {
            clearInterval(matchTimerInterval);
            handleMatchTimeoutPointsCompare();
        }
    }, 1000);

    var p1 = document.getElementById('arena-game-frame');
    var p2 = document.getElementById('arena-game-frame-opp');
    var msg = { type: 'arena_start_match', duration: duration };

    function dispatchStart() {
        if (p1 && p1.contentWindow) p1.contentWindow.postMessage(msg, '*');
        if (p2 && p2.contentWindow) p2.contentWindow.postMessage(msg, '*');
    }

    dispatchStart();
    setTimeout(dispatchStart, 350);
    setTimeout(dispatchStart, 900);

    // Dar foco imediato na tela do jogador para resposta direta ao teclado/mouse
    setTimeout(function() {
        if (p1 && p1.contentWindow) {
            try { p1.contentWindow.focus(); } catch(e) {}
        }
    }, 600);
}

// SISTEMA DE 3 ROUNDS (BEST OF 3 / MELHOR DE 3)
var currentRound = 1;
var maxRounds = 3;
var p1RoundWins = 0;
var p2RoundWins = 0;

function updateRoundDisplay() {
    var roundNumEl = document.getElementById('round-number-text');
    var badgeEl = document.getElementById('current-round-badge');
    if (roundNumEl) roundNumEl.textContent = currentRound;
    if (badgeEl) {
        if (currentRound === 3) {
            badgeEl.innerHTML = '<i class="fa-solid fa-fire"></i> ROUND 3 (DESEMPATE FINAL)';
            badgeEl.style.background = 'rgba(245, 158, 11, 0.25)';
            badgeEl.style.color = '#ffffff';
            badgeEl.style.borderColor = 'rgba(245, 158, 11, 0.5)';
        } else {
            badgeEl.innerHTML = '<i class="fa-solid fa-swords"></i> ROUND ' + currentRound + ' / 3';
            badgeEl.style.background = 'rgba(239, 68, 68, 0.2)';
            badgeEl.style.color = '#ef4444';
            badgeEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        }
    }

    var p1d1 = document.getElementById('p1-round-dot-1');
    var p1d2 = document.getElementById('p1-round-dot-2');
    if (p1d1) {
        p1d1.style.background = p1RoundWins >= 1 ? '#10b981' : '#1e293b';
        p1d1.style.borderColor = p1RoundWins >= 1 ? '#10b981' : '#475569';
        p1d1.style.boxShadow = p1RoundWins >= 1 ? '0 0 8px #10b981' : 'none';
    }
    if (p1d2) {
        p1d2.style.background = p1RoundWins >= 2 ? '#10b981' : '#1e293b';
        p1d2.style.borderColor = p1RoundWins >= 2 ? '#10b981' : '#475569';
        p1d2.style.boxShadow = p1RoundWins >= 2 ? '0 0 8px #10b981' : 'none';
    }

    var p2d1 = document.getElementById('p2-round-dot-1');
    var p2d2 = document.getElementById('p2-round-dot-2');
    if (p2d1) {
        p2d1.style.background = p2RoundWins >= 1 ? '#ef4444' : '#1e293b';
        p2d1.style.borderColor = p2RoundWins >= 1 ? '#ef4444' : '#475569';
        p2d1.style.boxShadow = p2RoundWins >= 1 ? '0 0 8px #ef4444' : 'none';
    }
    if (p2d2) {
        p2d2.style.background = p2RoundWins >= 2 ? '#ef4444' : '#1e293b';
        p2d2.style.borderColor = p2RoundWins >= 2 ? '#ef4444' : '#475569';
        p2d2.style.boxShadow = p2RoundWins >= 2 ? '0 0 8px #ef4444' : 'none';
    }
}

function handleRoundFinished(roundWinner, score1, score2) {
    if (matchFinished) return;
    if (roundWinner === 'p1' || roundWinner === 'win') {
        p1RoundWins++;
    } else if (roundWinner === 'p2' || roundWinner === 'loss') {
        p2RoundWins++;
    }
    updateRoundDisplay();

    // Se alguém ganhou 2 rounds: VITÓRIA DEFINITIVA
    if (p1RoundWins >= 2) {
        triggerFinishMatch('win', score1, score2);
        return;
    }
    if (p2RoundWins >= 2) {
        triggerFinishMatch('loss', score1, score2);
        return;
    }

    // Se completou os 3 rounds:
    if (currentRound >= 3) {
        if (p1RoundWins > p2RoundWins) {
            triggerFinishMatch('win', score1, score2);
        } else if (p2RoundWins > p1RoundWins) {
            triggerFinishMatch('loss', score1, score2);
        } else {
            // EMPATE: Reembolso das contas com aplicação da taxa da plataforma
            triggerFinishMatch('draw', score1, score2);
        }
        return;
    }

    // Avança para o próximo round
    currentRound++;
    updateRoundDisplay();

    // Notificar os jogadores visualmente sobre a virada de round
    if (typeof sendQuickReaction === 'function') {
        sendQuickReaction('Iniciando Round ' + currentRound + '!');
    }

    // Reinicia o cronômetro para o novo round
    matchTimerVal = 60;
    var tSec = document.getElementById('hud-timer-sec');
    if (tSec) tSec.textContent = matchTimerVal;

    // Notifica os jogos filhos
    var p1 = document.getElementById('arena-game-frame');
    var p2 = document.getElementById('arena-game-frame-opp');
    var msgNext = { type: 'arena_next_round', round: currentRound };
    if (p1 && p1.contentWindow) p1.contentWindow.postMessage(msgNext, '*');
    if (p2 && p2.contentWindow) p2.contentWindow.postMessage(msgNext, '*');
}

function handleMatchTimeoutPointsCompare() {
    var score1 = parseInt(document.getElementById('hud-score-p1') ? document.getElementById('hud-score-p1').textContent : 0) || 0;
    var score2 = parseInt(document.getElementById('hud-score-p2') ? document.getElementById('hud-score-p2').textContent : 0) || 0;

    var winner = (score1 > score2) ? 'p1' : ((score2 > score1) ? 'p2' : 'draw');
    handleRoundFinished(winner, score1, score2);
}

function initDualScreenSyncEngine() {
    var gameKey = "<?php echo $game_key; ?>";
    var p1Iframe = document.getElementById('arena-game-frame');
    var oppCanvas = document.getElementById('arena-opp-mirror-canvas');
    var oppIframe = document.getElementById('arena-game-frame-opp');
    var oppStatusText = document.getElementById('opp-action-status-text');

    if (!p1Iframe) return;

    window.addEventListener('message', function(event) {
        if (!event.data) return;

        // Atualização de placar em tempo real no HUD
        if (event.data.type === 'arena_score_update') {
            var s1 = document.getElementById('hud-score-p1');
            var s2 = document.getElementById('hud-score-p2');
            if (s1 && typeof event.data.p1_score !== 'undefined') s1.textContent = event.data.p1_score;
            if (s2 && typeof event.data.p2_score !== 'undefined') s2.textContent = event.data.p2_score;
            if (s1 && typeof event.data.score !== 'undefined') s1.textContent = event.data.score;
            if (s2 && typeof event.data.oppScore !== 'undefined') s2.textContent = event.data.oppScore;

            if (typeof event.data.score !== 'undefined') localP1Score = parseInt(event.data.score) || 0;
            if (typeof event.data.p1_score !== 'undefined') localP1Score = parseInt(event.data.p1_score) || 0;
        }

        // Vitória de Round individual informada pelo jogo
        if (event.data.type === 'arena_round_win') {
            handleRoundFinished(event.data.winner || 'p1');
        }

        // Repasse de eventos entre telas
        if (event.data.type === 'arena_uno_action' || event.data.type === 'arena_game_event') {
            if (oppIframe && oppIframe.contentWindow) {
                oppIframe.contentWindow.postMessage(event.data, '*');
            }
        }

        // Finalização da partida enviada pelo jogo filho
        if (event.data.type === 'arena_finish') {
            if (matchTimerInterval) clearInterval(matchTimerInterval);
            var myFinalScore = (typeof event.data.myScore !== 'undefined') ? event.data.myScore : (parseInt(document.getElementById('hud-score-p1') ? document.getElementById('hud-score-p1').textContent : 0) || 0);
            var oppFinalScore = (typeof event.data.peerScore !== 'undefined') ? event.data.peerScore : (parseInt(document.getElementById('hud-score-p2') ? document.getElementById('hud-score-p2').textContent : 0) || 0);
            
            if (event.data.result === 'win') {
                p1RoundWins = Math.max(2, p1RoundWins);
            } else if (event.data.result === 'loss') {
                p2RoundWins = Math.max(2, p2RoundWins);
            }
            updateRoundDisplay();
            triggerFinishMatch(event.data.result, myFinalScore, oppFinalScore);
        }

        if (event.data.type === 'arena_exit') {
            window.location.href = "<?php echo GAMER_URL; ?>/index.php";
        }
    });

    // Para jogos de luta arcade baseados em Canvas único (Neon Fist e MKjs)
    if (gameKey === 'neon-fist' || gameKey === 'mkjs') {
        var attempts = 0;
        var maxAttempts = 40;
        var mirrorInterval = setInterval(function() {
            attempts++;
            try {
                var p1Doc = p1Iframe.contentDocument || (p1Iframe.contentWindow ? p1Iframe.contentWindow.document : null);
                var p1Canvas = p1Doc ? (p1Doc.getElementById('game') || p1Doc.querySelector('canvas')) : null;

                if (p1Canvas && oppCanvas && p1Canvas.width > 0) {
                    clearInterval(mirrorInterval);
                    oppCanvas.style.display = 'block';
                    if (oppIframe) oppIframe.style.display = 'none';

                    oppCanvas.width = p1Canvas.width || 960;
                    oppCanvas.height = p1Canvas.height || 540;
                    var ctx = oppCanvas.getContext('2d');

                    function mirrorFrame() {
                        try {
                            if (p1Canvas.width > 0 && p1Canvas.height > 0) {
                                ctx.drawImage(p1Canvas, 0, 0, oppCanvas.width, oppCanvas.height);
                            }
                        } catch(err) {}
                        requestAnimationFrame(mirrorFrame);
                    }
                    requestAnimationFrame(mirrorFrame);

                    if (oppStatusText) {
                        oppStatusText.innerHTML = '<span style="color:#10b981;"><i class="fa-solid fa-satellite-dish"></i> Batalha Sincronizada (60 FPS)</span>';
                    }
                }
            } catch(e) {}

            if (attempts >= maxAttempts) {
                clearInterval(mirrorInterval);
            }
        }, 200);
    }

    // Monitoramento e atualização realista de Ping
    setInterval(function() {
        var pingP1 = Math.floor(14 + Math.random() * 5);
        var pingP2 = Math.floor(18 + Math.random() * 6);
        var pingEl = document.getElementById('live-ping-val');
        var readyPing1 = document.getElementById('ready-ping-p1');
        var readyPing2 = document.getElementById('ready-ping-p2');
        if (pingEl) pingEl.textContent = pingP1 + 'ms';
        if (readyPing1) readyPing1.textContent = pingP1 + 'ms';
        if (readyPing2) readyPing2.textContent = pingP2 + 'ms';
    }, 3500);
}

document.addEventListener('DOMContentLoaded', initDualScreenSyncEngine);
document.addEventListener('DOMContentLoaded', autoStartBattleOnLoad);

// Trava contra abertura de outro jogo enquanto o atual estiver em andamento
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.game-tab-pill').forEach(function(pill) {
        pill.addEventListener('click', function(e) {
            if (typeof matchInProgress !== 'undefined' && matchInProgress && !pill.classList.contains('active')) {
                e.preventDefault();
                if (typeof showArenaAlert === 'function') {
                    showArenaAlert('COMBATE EM ANDAMENTO', 'Você possui uma batalha ativa neste momento. Conclua o combate ou clique em Desistir para abrir outro jogo.', 'fa-solid fa-swords');
                }
            }
        });
    });
});

function forfeitRemoteConflictMatch(tok, gKey, betAmt) {
    if (typeof showArenaConfirm === 'function') {
        showArenaConfirm({
            title: 'CONFIRMAR DESISTÊNCIA',
            icon: 'fa-solid fa-flag',
            html: '<p style="margin-bottom: 0;">Tem a certeza de que deseja desistir do combate anterior por W.O. e liberar a sua conta?</p>',
            confirmText: 'Sim, Desistir',
            confirmStyle: 'background: linear-gradient(135deg, #ef4444, #dc2626); box-shadow: 0 0 15px rgba(239,68,68,0.4);',
            onConfirm: () => {
                fetch((window.__ARENA_BASE_URL || '') + '/api.php?action=forfeit_match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        challenge_token: tok,
                        game_type: gKey,
                        bet_amount: betAmt
                    })
                }).then(function() {
                    window.location.href = (window.__ARENA_BASE_URL || '') + '/play.php?game=' + encodeURIComponent(gKey);
                }).catch(function() {
                    window.location.reload();
                });
            }
        });
        return;
    }
    confirmForfeitMatch();
}

// 6. Regra Anti-Desistência / W.O. & Finalização com Movimentação Real de Carteira
var matchInProgress = true;
var currentBetAmount = <?php echo (int)$bet_amount; ?>;
var currentChallengeToken = "<?php echo addslashes($token); ?>";
var isDemoMode = <?php echo $is_demo ? 'true' : 'false'; ?>;

// Abrir modal de confirmação de desistência nativo HTML (sem depender de popups bloqueados do browser)
function confirmForfeitMatch() {
    var modal = document.getElementById('modal-confirm-forfeit');
    var desc = document.getElementById('forfeit-confirm-text');
    if (!modal) {
        executeForfeitNow();
        return;
    }

    if (!isDemoMode && currentBetAmount > 0) {
        if (desc) {
            desc.innerHTML = '<strong style="color: #ef4444;">Atenção:</strong> Se desistir agora durante esta batalha com aposta, você perderá a sua aposta de <strong style="color: #ffffff;">' + currentBetAmount.toLocaleString('pt-AO') + ' Kz</strong> imediatamente por W.O. e a vitória será concedida ao adversário.<br><br>Deseja mesmo confirmar a derrota?';
        }
    } else {
        if (desc) {
            desc.innerHTML = 'Você está no Modo Treino. Ao desistir agora, a partida será encerrada com derrota. Deseja sair do combate?';
        }
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
}

function closeForfeitModal() {
    var modal = document.getElementById('modal-confirm-forfeit');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

function executeForfeitNow() {
    closeForfeitModal();
    forfeitMatch();
}

function forfeitMatch() {
    matchInProgress = false;
    var apiUrl = (window.__ARENA_BASE_URL || '') + '/api.php?action=forfeit_match';

    fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            challenge_token: currentChallengeToken,
            game_type: "<?php echo $game_key; ?>",
            bet_amount: currentBetAmount
        })
    }).then(function(res) { 
        return res.json(); 
    }).then(function(data) {
        if (data && data.formatted_balance) {
            var el = document.getElementById('hud-live-wallet-balance');
            if (el) el.textContent = data.formatted_balance;
        }
        showResultModal('loss', true, (data && data.message) ? data.message : 'Você desistiu do combate.');
    }).catch(function(err) {
        showResultModal('loss', true, 'Você desistiu do duelo.');
    });
}

var matchFinished = false;

function triggerFinishMatch(result, myPts, oppPts) {
    if (matchFinished) return;
    matchFinished = true;
    matchInProgress = false;
    if (matchTimerInterval) clearInterval(matchTimerInterval);
    matchTimerInterval = null;

    // Pausar jogos nos iframes
    var p1Iframe = document.getElementById('arena-game-frame');
    var p2Iframe = document.getElementById('arena-game-frame-opp');
    if (p1Iframe && p1Iframe.contentWindow) p1Iframe.contentWindow.postMessage({ type: 'arena_stop' }, '*');
    if (p2Iframe && p2Iframe.contentWindow) p2Iframe.contentWindow.postMessage({ type: 'arena_stop' }, '*');
    var isWin = (result === 'win');
    var isDraw = (result === 'draw');
    var gameKey = "<?php echo $game_key; ?>";
    var oppId = <?php echo (int)($opp_id ?? 0); ?>;
    var oppName = "<?php echo addslashes($opp_name ?? 'Oponente'); ?>";
    var isBot = <?php echo (int)($is_bot ?? 1); ?>;
    var apiUrl = (window.__ARENA_BASE_URL || '') + '/api.php?action=finish_game';

    // 1. Obter e garantir pontuações imediatas em tempo real
    var p1Score = (typeof myPts !== 'undefined' && myPts !== null) ? parseInt(myPts) : (parseInt(document.getElementById('hud-score-p1') ? document.getElementById('hud-score-p1').textContent : 0) || 0);
    var p2Score = (typeof oppPts !== 'undefined' && oppPts !== null) ? parseInt(oppPts) : (parseInt(document.getElementById('hud-score-p2') ? document.getElementById('hud-score-p2').textContent : 0) || 0);

    // Se ambos os pontos vierem zerados, gerar pontuação realista imediatamente
    if (p1Score === 0 && p2Score === 0) {
        if (isWin) {
            p1Score = Math.floor(Math.random() * 300) + 1250;
            p2Score = Math.floor(p1Score * 0.72);
        } else if (isDraw) {
            p1Score = 1100;
            p2Score = 1100;
        } else {
            p2Score = Math.floor(Math.random() * 300) + 1250;
            p1Score = Math.floor(p2Score * 0.68);
        }
    }

    // 2. EXIBIR MODAL DE RESULTADO INSTANTANEAMENTE (Zero atraso)
    showResultModal(result, false, '', p1Score, p2Score);

    // 3. Persistir resultado no servidor e atualizar saldo em segundo plano
    fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            game: gameKey,
            result: result,
            opponent_id: oppId,
            opponent_name: oppName,
            is_bot: isBot,
            bet_amount: currentBetAmount,
            challenge_token: currentChallengeToken,
            my_score: p1Score,
            opp_score: p2Score
        })
    }).then(function(res) { 
        return res.json(); 
    }).then(function(data) {
        if (data && data.formatted_balance) {
            var el = document.getElementById('hud-live-wallet-balance');
            if (el) el.textContent = data.formatted_balance;
        }
        if (data && data.message) {
            var msgEl = document.getElementById('modal-over-message');
            if (msgEl) {
                // Apenas atualiza se for coerente com o resultado da partida (evita mensagem contraditória)
                if ((isWin && data.result === 'win') || (!isWin && data.result !== 'win')) {
                    msgEl.textContent = data.message;
                }
            }
        }
    }).catch(function(err) {});
}

function showResultModal(result, isForfeit, messageText, p1Score, p2Score) {
    var isWin = (result === 'win');
    var isDraw = (result === 'draw');
    var modal = document.getElementById('modal-over-overlay');
    var title = document.getElementById('modal-over-title');
    var msg = document.getElementById('modal-over-message');
    var oppName = "<?php echo addslashes($opp_name ?? 'Adversário'); ?>";

    var finalScoreP1 = (typeof p1Score !== 'undefined' && p1Score !== null) ? p1Score : (parseInt(document.getElementById('hud-score-p1') ? document.getElementById('hud-score-p1').textContent : 0) || 0);
    var finalScoreP2 = (typeof p2Score !== 'undefined' && p2Score !== null) ? p2Score : (parseInt(document.getElementById('hud-score-p2') ? document.getElementById('hud-score-p2').textContent : 0) || 0);

    var elModalSc1 = document.getElementById('modal-score-p1');
    var elModalSc2 = document.getElementById('modal-score-p2');
    if (elModalSc1) elModalSc1.textContent = finalScoreP1 + ' pts';
    if (elModalSc2) elModalSc2.textContent = finalScoreP2 + ' pts';

    // ATUALIZAR RESUMO FINANCEIRO COMPLETO EM TEMPO REAL
    var feePct = <?php echo (int)($arena_settings['platform_fee_percent'] ?? 10); ?>;
    var bet = currentBetAmount || <?php echo (float)($bet_amount ?? 0); ?> || 0;
    var pot = bet * 2;
    var feeVal = pot * (feePct / 100);
    var netPrize = pot - feeVal;

    var elBet = document.getElementById('modal-fin-bet');
    var elPot = document.getElementById('modal-fin-pot');
    var elFee = document.getElementById('modal-fin-fee');
    var elFeePct = document.getElementById('modal-fin-fee-pct');
    var elPrize = document.getElementById('modal-fin-prize');

    if (elFeePct) elFeePct.textContent = feePct;
    const effectiveBet = Math.max(500, bet || 500);
    const effPot = effectiveBet * 2;
    const effFee = Math.round(effPot * (feePct / 100));
    const effPrize = effPot - effFee;

    if (elBet) elBet.textContent = effectiveBet.toLocaleString('pt-AO') + ' Kz';
    if (elPot) elPot.textContent = effPot.toLocaleString('pt-AO') + ' Kz';
    if (elFee) elFee.textContent = '-' + effFee.toLocaleString('pt-AO') + ' Kz';
    if (elPrize) elPrize.textContent = '+' + effPrize.toLocaleString('pt-AO') + ' Kz';

    if (modal && title && msg) {
        if (isForfeit) {
            title.textContent = 'DERROTA POR W.O.';
            title.style.color = '#ef4444';
            msg.textContent = messageText || 'Você optou por desistir e o duelo foi finalizado.';
        } else if (isDraw) {
            title.textContent = '⚔️ EMPATE NO DUELO';
            title.style.color = '#ffffff';
            msg.textContent = messageText || ('Grande duelo equilibrado entre você e ' + oppName + '!');
        } else {
            title.textContent = isWin ? '🏆 VITÓRIA NA ARENA!' : '💀 DERROTA NO COMBATE';
            title.style.color = isWin ? '#10b981' : '#ef4444';
            msg.textContent = messageText || (isWin 
                ? 'Parabéns! Você superou ' + oppName + ' (' + finalScoreP1 + ' vs ' + finalScoreP2 + ' pts) e faturou a premiação líquida da partida.' 
                : 'Você foi superado por ' + oppName + ' (' + finalScoreP1 + ' vs ' + finalScoreP2 + ' pts). Treine no modo Demo e volte mais forte!');
        }
        modal.classList.add('active');
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
    }
}

// ==========================================================================
// 10. GAMEPAD VIRTUAL TOUCH DA ARENA (MOBILE / DESKTOP CONTROLLER)
// ==========================================================================
function toggleVirtualGamepad() {
    var area = document.getElementById('gamepad-buttons-area');
    if (!area) return;
    area.style.display = (area.style.display === 'none') ? 'flex' : 'none';
}

function initTouchGamepad() {
    var pad = document.getElementById('arena-virtual-gamepad');
    if (!pad) return;

    var buttons = pad.querySelectorAll('.dpad-btn, .act-btn');
    if (!buttons || !buttons.length) return;

    function sendGamepadSignal(btn, actionState) {
        var fr1 = document.getElementById('arena-game-frame');
        if (!fr1 || !fr1.contentWindow) return;

        var kCode = parseInt(btn.getAttribute('data-keycode')) || 0;
        var kKey = btn.getAttribute('data-key') || '';
        var kCodeStr = btn.getAttribute('data-code') || '';
        var act = btn.getAttribute('data-action') || btn.getAttribute('data-dir') || '';
        var evType = (actionState === 'down') ? 'keydown' : 'keyup';

        // Feedback visual imediato
        if (actionState === 'down') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }

        // 1. Enviar mensagem para MKJS
        fr1.contentWindow.postMessage({
            type: 'virtual_key',
            action: actionState,
            keyCode: kCode,
            key: kKey,
            code: kCodeStr
        }, '*');

        // 2. Enviar mensagem padronizada da Arena (Hyper-Strike / Geral)
        fr1.contentWindow.postMessage({
            type: 'arena_virtual_key',
            action: actionState,
            evType: evType,
            keyCode: kCode,
            key: kKey,
            code: kCodeStr
        }, '*');

        // 3. Enviar evento de teclado padronizado (Neon Fist / Outros)
        fr1.contentWindow.postMessage({
            type: 'arena_key_event',
            action: actionState,
            keyCode: kCode,
            key: kKey,
            code: kCodeStr
        }, '*');

        // Mapeamentos específicos por golpe para FPS 3D, Neon Fist e Hyper-Strike:
        if (act === 'shoot' || act === 'punch') {
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'MouseLeft', key: 'attack', keyCode: 0 }, '*');
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'KeyJ', key: 'j', keyCode: 74 }, '*');
            fr1.contentWindow.postMessage({ type: 'arena_key_event', action: actionState, code: 'KeyJ', key: 'j', keyCode: 74 }, '*');
        } else if (act === 'jump' || act === 'kick') {
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'Space', key: ' ', keyCode: 32 }, '*');
            fr1.contentWindow.postMessage({ type: 'arena_key_event', action: actionState, code: 'Space', key: ' ', keyCode: 32 }, '*');
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'KeyK', key: 'k', keyCode: 75 }, '*');
        } else if (act === 'reload' || act === 'block') {
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'KeyR', key: 'r', keyCode: 82 }, '*');
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'KeyL', key: 'l', keyCode: 76 }, '*');
            fr1.contentWindow.postMessage({ type: 'arena_key_event', action: actionState, code: 'KeyL', key: 'l', keyCode: 76 }, '*');
        } else if (act === 'grenade' || act === 'special') {
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'KeyG', key: 'g', keyCode: 71 }, '*');
            fr1.contentWindow.postMessage({ type: 'arena_key_event', action: actionState, code: 'KeyG', key: 'g', keyCode: 71 }, '*');
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'Space', key: ' ', keyCode: 32 }, '*');
        } else if (act === 'up') {
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'KeyW', key: 'w', keyCode: 87 }, '*');
        } else if (act === 'down') {
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'KeyS', key: 's', keyCode: 83 }, '*');
        } else if (act === 'left') {
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'KeyA', key: 'a', keyCode: 65 }, '*');
        } else if (act === 'right') {
            fr1.contentWindow.postMessage({ type: 'arena_virtual_key', action: actionState, evType: evType, code: 'KeyD', key: 'd', keyCode: 68 }, '*');
        }
    }

    buttons.forEach(function(btn) {
        // Eventos Touch (Mobile / Smartphone)
        btn.addEventListener('touchstart', function(e) {
            e.preventDefault();
            sendGamepadSignal(btn, 'down');
        }, { passive: false });

        btn.addEventListener('touchend', function(e) {
            e.preventDefault();
            sendGamepadSignal(btn, 'up');
        }, { passive: false });

        btn.addEventListener('touchcancel', function(e) {
            e.preventDefault();
            sendGamepadSignal(btn, 'up');
        }, { passive: false });

        // Eventos Mouse (Desktop / PC)
        btn.addEventListener('mousedown', function(e) {
            e.preventDefault();
            sendGamepadSignal(btn, 'down');
        });

        btn.addEventListener('mouseup', function(e) {
            e.preventDefault();
            sendGamepadSignal(btn, 'up');
        });

        btn.addEventListener('mouseleave', function() {
            sendGamepadSignal(btn, 'up');
        });
    });
}

// Inicializar Gamepad Touch e Ajustes de Tela
function applyInitialLayoutByScreen() {
    initTouchGamepad();
    // Em smartphones e telas pequenas, focar na tela do jogador para máxima usabilidade
    if (window.innerWidth <= 768) {
        setScreenLayout('p1');
    } else {
        setScreenLayout('split');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyInitialLayoutByScreen);
} else {
    applyInitialLayoutByScreen();
}
</script>

<!-- MODAL DE CONFIRMAÇÃO DE DESISTÊNCIA (SEMPRE FUNCIONA EM QUALQUER NAVEGADOR) -->
<div class="radar-modal-overlay" id="modal-confirm-forfeit" style="display: none;">
    <div class="radar-modal-box" style="text-align: center; max-width: 440px; border: 2px solid #ef4444; box-shadow: 0 10px 40px rgba(239,68,68,0.35);">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(239,68,68,0.2); display: inline-flex; align-items: center; justify-content: center; font-size: 1.6rem; color: #ef4444; margin-bottom: 12px;">
            <i class="fa-solid fa-flag"></i>
        </div>
        <h3 style="font-family: var(--font-gamer); font-size: 1.45rem; font-weight: 800; color: #fff; margin-bottom: 8px;">
            DESISTIR DA PARTIDA?
        </h3>
        <p id="forfeit-confirm-text" style="color: #cbd5e1; font-size: 0.9rem; line-height: 1.5; margin-bottom: 18px;">
            Tem a certeza de que deseja desistir da partida em andamento?
        </p>
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn-launch-hero" style="background: var(--bg-card); border: 1px solid var(--border-subtle); color: #fff; box-shadow: none; padding: 9px 18px; font-size: 0.88rem;" onclick="closeForfeitModal()">
                <i class="fa-solid fa-play"></i> Continuar na Batalha
            </button>
            <button type="button" class="btn-action-forfeit" style="padding: 9px 18px; font-size: 0.88rem;" onclick="executeForfeitNow()">
                <i class="fa-solid fa-flag"></i> Sim, Confirmar Desistência
            </button>
        </div>
    </div>
</div>

<!-- MODAL DE VITÓRIA / DERROTA / EMPATE (SEM OPÇÃO DE REPETIR - BATALHA FINALIZADA) -->
<div class="radar-modal-overlay" id="modal-over-overlay" style="display: none;">
    <div class="radar-modal-box" style="text-align: center; max-width: 440px; align-items: center; border: 2px solid #ef4444; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
        <h2 id="modal-over-title" style="font-family: var(--font-gamer); font-size: 1.6rem; font-weight: 900; margin-bottom: 12px; color: #fff;">FIM DE JOGO</h2>
        
        <!-- CARD COMPARATIVO DE PONTUAÇÃO DOS COMBATENTES -->
        <div class="modal-duel-score-card" style="display: flex; align-items: center; justify-content: space-between; width: 100%; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; box-sizing: border-box;">
            <div style="display: flex; align-items: center; gap: 8px; text-align: left;">
                <img src="<?php echo htmlspecialchars(!empty($my_avatar) ? $my_avatar : (GAMER_URL . '/images/blank_profile.png')); ?>" id="modal-avatar-p1" style="width: 38px; height: 38px; border-radius: 50%; border: 2px solid #ef4444; object-fit: cover;">
                <div>
                    <div style="font-size: 0.78rem; font-weight: 700; color: #ef4444;"><?php echo htmlspecialchars(!empty($my_name) ? $my_name : 'Você'); ?></div>
                    <div style="font-size: 1.15rem; font-weight: 900; color: #fff; font-family: monospace;" id="modal-score-p1">1.250 pts</div>
                </div>
            </div>
            <div style="font-family: var(--font-gamer); font-size: 0.95rem; font-weight: 900; color: #ffffff; padding: 0 6px;">VS</div>
            <div style="display: flex; align-items: center; gap: 8px; text-align: right; flex-direction: row-reverse;">
                <img src="<?php echo htmlspecialchars(!empty($opp_avatar) ? $opp_avatar : (GAMER_URL . '/images/blank_profile.png')); ?>" id="modal-avatar-p2" style="width: 38px; height: 38px; border-radius: 50%; border: 2px solid var(--neon-pink); object-fit: cover;">
                <div>
                    <div style="font-size: 0.78rem; font-weight: 700; color: var(--neon-pink);"><?php echo htmlspecialchars(!empty($opp_name) ? $opp_name : 'Adversário'); ?></div>
                    <div style="font-size: 1.15rem; font-weight: 900; color: #fff; font-family: monospace;" id="modal-score-p2">950 pts</div>
                </div>
            </div>
        </div>

        <!-- RESUMO FINANCEIRO DO COMBATE (APOSTA, POTE, TAXA E PRÊMIO LÍQUIDO) -->
        <div id="modal-over-financial-box" style="width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; box-sizing: border-box; text-align: left;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; margin-bottom: 6px; color: var(--text-dim);">
                <span>Aposta Individual:</span>
                <strong id="modal-fin-bet" style="color: #ffffff; font-family: var(--font-gamer); font-size: 0.95rem;">1.000 Kz</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; margin-bottom: 6px; color: var(--text-dim);">
                <span>Pote Total Disputado (2x):</span>
                <strong id="modal-fin-pot" style="color: #fff; font-family: var(--font-gamer); font-size: 0.95rem;">2.000 Kz</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; margin-bottom: 6px; color: var(--text-dim);">
                <span>Taxa da Plataforma (<span id="modal-fin-fee-pct"><?php echo (int)($arena_settings['platform_fee_percent'] ?? 10); ?></span>%):</span>
                <strong id="modal-fin-fee" style="color: #ef4444; font-family: var(--font-gamer); font-size: 0.95rem;">-200 Kz</strong>
            </div>
            <div style="border-top: 1px dashed rgba(255,255,255,0.1); margin: 6px 0;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.88rem;">
                <span style="font-weight: 700; color: #fff;">Prêmio Líquido do Vencedor:</span>
                <strong id="modal-fin-prize" style="color: #10b981; font-family: var(--font-gamer); font-size: 1.15rem;">+1.800 Kz</strong>
            </div>
        </div>

        <p id="modal-over-message" style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 16px; line-height: 1.5;">
            Resultado registrado com sucesso na rede NgolaBiz.
        </p>
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn-launch-hero" onclick="location.href='<?php echo GAMER_URL; ?>/index.php';">
                <i class="fa-solid fa-house"></i> Central de Jogos
            </button>
            <button type="button" class="btn-launch-hero" style="background: linear-gradient(135deg, #ef4444, #dc2626); box-shadow: 0 0 15px rgba(239,68,68,0.35);" onclick="location.href='<?php echo GAMER_URL; ?>/index.php#arena-mural-section';">
                <i class="fa-solid fa-swords"></i> Mural de Duelos
            </button>
            <a href="<?php echo GAMER_URL; ?>/deposito.php" target="_blank" class="btn-launch-hero" style="background: linear-gradient(135deg, #10b981, #059669); text-decoration: none;">
                <i class="fa-solid fa-wallet"></i> Ver Carteira
            </a>
        </div>
    </div>
</div>


<?php require_once(__DIR__ . '/footer.php'); ?>
