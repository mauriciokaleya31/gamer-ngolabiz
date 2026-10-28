<?php
/**
 * NGOLABIZ ARENA - API CENTRAL JSON
 * Matchmaking de Angola (Apenas Online), Regra de 1 Minuto de Concentração/Aceite,
 * Verificação Mútua de Conexão em Tempo Real, Desafios, Áudio e Registro de Partidas
 */
header('Content-Type: application/json; charset=utf-8');

// Suporte CORS completo com Credenciais para o ecossistema NgolaBiz
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!empty($origin)) {
    if (preg_match('/^https?:\/\/(www\.)?(gamer\.)?ngolabiz\.it\.ao(:\d+)?$/i', $origin) || preg_match('/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i', $origin)) {
        header("Access-Control-Allow-Origin: {$origin}");
        header("Access-Control-Allow-Credentials: true");
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
        header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
    }
} else {
    header("Access-Control-Allow-Origin: *");
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

require_once(__DIR__ . '/init.php');

// NGOLABIZ ARENA - AUTO-RUNNER DE BATALHAS 24H ENTRE BOTS
// Se a última batalha em arena_live_wins tiver mais de 25 segundos, executa uma rodada imediatamente
if (in_array($action ?? '', ['get_live_payouts', 'get_open_challenges', 'check_incoming_challenges', ''])) {
    $last_battle_time = 0;
    $q_last = $db->query("SELECT UNIX_TIMESTAMP(created_at) as ts FROM arena_live_wins ORDER BY id DESC LIMIT 1");
    if ($q_last && $q_last->num_rows > 0) {
        $last_battle_time = (int)$q_last->fetch_assoc()['ts'];
    }
    if ((time() - $last_battle_time) >= 25) {
        if (file_exists(__DIR__ . '/cron_arena_battles.php')) {
            if (!defined('ARENA_AUTORUN')) define('ARENA_AUTORUN', true);
            @require_once(__DIR__ . '/cron_arena_battles.php');
            if (function_exists('run_arena_battle_round')) {
                @run_arena_battle_round($db);
            }
        }
    }
}


$action = $_GET['action'] ?? '';

// Função Helper: Obter Porcentagem da Taxa da Plataforma Gravada pelo Administrador
function get_arena_platform_fee_percent($db) {
    $q = $db->query("SELECT setting_value FROM arena_admin_settings WHERE setting_key = 'platform_fee_percent' LIMIT 1");
    if ($q && $q->num_rows > 0) {
        $val = (float)$q->fetch_assoc()['setting_value'];
        return max(0, min(50, $val));
    }
    return 10.0; // Padrão: 10%
}

// 0. Rota de Métricas Dinâmicas ao Vivo para o Dashboard
if ($action === 'get_live_metrics') {
    // 1. Jogadores online reais (últimos 5 minutos) + bots ativos no ecossistema
    $real_human_online = (int)($db->query("SELECT COUNT(*) FROM arena_profiles WHERE status = 'online' AND last_active >= NOW() - INTERVAL 5 MINUTE")->fetch_row()[0] ?? 0);
    $active_bots = (int)($db->query("SELECT COUNT(*) FROM arena_bots WHERE is_active = 1")->fetch_row()[0] ?? 0);
    $final_online = max(1, $real_human_online + $active_bots);

    // 2. Batalhas ao vivo em andamento (status = 'accepted' nos últimos 90s)
    $active_battles = (int)($db->query("SELECT COUNT(*) FROM arena_challenges WHERE status = 'accepted' AND accepted_at >= DATE_SUB(NOW(), INTERVAL 90 SECOND)")->fetch_row()[0] ?? 0);

    // 3. Propostas abertas no mural agora
    $open_challenges = (int)($db->query("SELECT COUNT(*) FROM arena_challenges WHERE status = 'waiting' AND expires_at >= NOW()")->fetch_row()[0] ?? 0);

    // 4. Batalhas concluídas hoje
    $matches_today = (int)($db->query("SELECT COUNT(*) FROM arena_matches WHERE DATE(played_at) = CURDATE()")->fetch_row()[0] ?? 0);

    // 5. Total de prêmios disputados e distribuídos hoje
    $prizes_sum = (float)($db->query("SELECT COALESCE(SUM(prize_pool), 0) FROM arena_matches WHERE DATE(played_at) = CURDATE()")->fetch_row()[0] ?? 0);
    if ($prizes_sum <= 0) {
        $prizes_sum = (float)($db->query("SELECT COALESCE(SUM(prize_won), 0) FROM arena_live_wins WHERE DATE(created_at) = CURDATE()")->fetch_row()[0] ?? 0);
    }
    if ($prizes_sum < 50000) {
        $prizes_sum = 50000 + ($matches_today * 2500);
    }

    // 6. Saldo real do utilizador autenticado
    $my_balance = 0.00;
    if ($logged_user) {
        $my_balance = (float)($gamer_profile['balance_ao'] ?? ($logged_user['user_wallet_balance'] ?? 0));
    }

    echo json_encode([
        'status' => 'ok',
        'online' => $final_online,
        'online_players' => $final_online,
        'real_humans_online' => $real_human_online,
        'active_bots' => $active_bots,
        'battles' => $active_battles,
        'active_battles' => $active_battles,
        'open_challenges' => $open_challenges,
        'matches_today' => $matches_today,
        'prizes' => $prizes_sum,
        'prizes_formatted' => number_format($prizes_sum, 0, ',', '.') . ' Kz',
        'prizes_disputed_formatted' => number_format($prizes_sum, 0, ',', '.') . ' Kz',
        'user_balance' => $my_balance,
        'user_balance_formatted' => number_format($my_balance, 2, ',', '.') . ' Kz'
    ]);
    exit;
}

// 1. Rota de Ping / Latência e Atualização de Presença
if ($action === 'ping') {
    if ($logged_user) {
        $uid = (int)$logged_user['user_id'];
        $db->query("UPDATE arena_profiles SET status = 'online', last_active = NOW() WHERE user_id = {$uid}");
    }
    echo json_encode(['status' => 'ok', 'time' => microtime(true), 'tz' => 'Africa/Luanda']);
    exit;
}

// 2. Salvar Configurações de Áudio
if ($action === 'save_audio_settings') {
    if (!$logged_user) {
        echo json_encode(['status' => 'error', 'message' => 'Não autenticado']);
        exit;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    if ($input) {
        $bgm = (int)($input['bgm_vol'] ?? 40);
        $sfx = (int)($input['sfx_vol'] ?? 80);
        $muted = (int)($input['muted'] ?? 0);
        $uid = (int)$logged_user['user_id'];

        $db->query("UPDATE arena_profiles SET audio_bgm_vol = {$bgm}, audio_sfx_vol = {$sfx}, audio_muted = {$muted} WHERE user_id = {$uid}");
        echo json_encode(['status' => 'ok']);
        exit;
    }
}

// 3. RADAR DE MATCHMAKING: Jogadores Humanos Online Agora + Bots Oficiais Programados pelo Admin
if ($action === 'search_opponents') {
    $game_key = trim($_GET['game'] ?? 'hyperstrike');
    $filter_prov = trim($_GET['province'] ?? '');
    
    // Atualizar inativos para offline imediatamente (Heartbeat estrito de 45 segundos)
    $db->query("UPDATE arena_profiles SET status = 'offline' WHERE last_active < NOW() - INTERVAL 45 SECOND");
    
    $my_uid = $logged_user ? (int)$logged_user['user_id'] : 0;
    if ($my_uid > 0) {
        $db->query("UPDATE arena_profiles SET status = 'online', last_active = NOW() WHERE user_id = {$my_uid}");
    }

    $opponents = [];

    // 1. Buscar utilizadores humanos reais que estão com a página da Arena aberta AGORA
    $sql_real = "SELECT p.user_id, p.gamer_tag, p.competitive_points, p.province, p.total_matches, p.total_wins, u.user_picture, u.user_firstname, u.user_lastname 
                 FROM arena_profiles p
                 JOIN users u ON u.user_id = p.user_id
                 WHERE p.user_id != {$my_uid} 
                   AND p.user_id > 0 
                   AND p.status = 'online'
                   AND p.last_active >= NOW() - INTERVAL 45 SECOND";
    if (!empty($filter_prov)) {
        $sql_real .= " AND p.province = '" . $db->real_escape_string($filter_prov) . "'";
    }
    $sql_real .= " ORDER BY p.last_active DESC LIMIT 10";
    
    $res_real = $db->query($sql_real);
    if ($res_real && $res_real->num_rows > 0) {
        while ($r = $res_real->fetch_assoc()) {
            $total_m = (int)$r['total_matches'];
            $total_w = (int)$r['total_wins'];
            $wr = ($total_m > 0) ? round(($total_w / $total_m) * 100) : 50;

            $pic = $r['user_picture'] ? (filter_var($r['user_picture'], FILTER_VALIDATE_URL) ? $r['user_picture'] : MAIN_URL . '/content/uploads/' . $r['user_picture']) : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
            $fullname = trim($r['user_firstname'] . ' ' . $r['user_lastname']);
            $prov = !empty($r['province']) ? $r['province'] : 'Luanda';

            $opponents[] = [
                'id' => (int)$r['user_id'],
                'tag' => $r['gamer_tag'] ?: $fullname,
                'title' => 'Jogador Online',
                'avatar' => $pic,
                'province' => $prov,
                'difficulty' => 'medium',
                'accept_delay' => 6,
                'max_bet_amount' => 50000,
                'points' => (int)$r['competitive_points'],
                'win_rate' => $wr . '%',
                'matches' => $total_m,
                'status' => 'Online Agora',
                'is_bot' => 0
            ];
        }
    }

    // 2. Incluir os Jogadores Bots Oficiais criados e ativados pelo Administrador
    // CONCURRENCY LOCK: Apenas bots livres (status = 'available' ou nulo) e que NÃO estejam em combate
    $sql_bots = "SELECT id, bot_tag, fullname, bot_title, avatar_url, province, difficulty, accept_delay_seconds, target_winrate, max_bet_amount, total_matches, total_wins 
                 FROM arena_bots 
                 WHERE is_active = 1 
                   AND (status = 'available' OR status IS NULL)
                   AND id NOT IN (
                       SELECT bot_id FROM arena_challenges 
                       WHERE is_bot = 1 AND status IN ('waiting', 'accepted') AND expires_at > NOW()
                   )";
    if (!empty($filter_prov)) {
        $sql_bots .= " AND province = '" . $db->real_escape_string($filter_prov) . "'";
    }
    $sql_bots .= " ORDER BY RAND() LIMIT 8";

    $res_bots = $db->query($sql_bots);
    if ($res_bots && $res_bots->num_rows > 0) {
        while ($b = $res_bots->fetch_assoc()) {
            $total_m = (int)$b['total_matches'];
            $total_w = (int)$b['total_wins'];
            $wr = (int)($b['target_winrate'] ?: 70);
            $av = !empty($b['avatar_url']) ? $b['avatar_url'] : 'https://ui-avatars.com/api/?name=' . urlencode($b['bot_tag']) . '&background=7c3aed&color=fff&size=150';
            $display_tag = !empty($b['fullname']) ? $b['fullname'] : $b['bot_tag'];

            $opponents[] = [
                'id' => (int)$b['id'],
                'tag' => $b['bot_tag'],
                'title' => !empty($b['fullname']) ? $b['fullname'] : 'Gamer de Angola',
                'avatar' => $av,
                'province' => $b['province'] ?: 'Luanda',
                'difficulty' => $b['difficulty'] ?: 'medium',
                'accept_delay' => (int)($b['accept_delay_seconds'] ?: 5),
                'max_bet_amount' => (int)($b['max_bet_amount'] ?? 10000),
                'points' => 1100 + ($total_w * 4),
                'win_rate' => $wr . '%',
                'matches' => $total_m,
                'status' => 'Online na Arena',
                'is_bot' => 1
            ];
        }
    }

    echo json_encode([
        'status' => 'ok',
        'game' => $game_key,
        'total_found' => count($opponents),
        'opponents' => $opponents
    ]);
    exit;
}

// 3.1 Rota Específica para Modo Treino Solo com IA da Arena (Se solicitado explicitamente)
if ($action === 'get_training_bots') {
    $bots = [];
    $res_bots = $db->query("SELECT id, bot_tag, fullname, bot_title, avatar_url, province, difficulty, accept_delay_seconds, total_matches, total_wins, target_winrate FROM arena_bots WHERE is_active = 1 ORDER BY RAND() LIMIT 8");
    if ($res_bots) {
        while ($b = $res_bots->fetch_assoc()) {
            $total_m = (int)$b['total_matches'];
            $total_w = (int)$b['total_wins'];
            $wr = (int)($b['target_winrate'] ?: 70);
            $avatar = !empty($b['avatar_url']) ? $b['avatar_url'] : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
            $acc_delay = (int)($b['accept_delay_seconds'] ?: 5);

            $bots[] = [
                'id' => (int)$b['id'],
                'tag' => $b['bot_tag'],
                'title' => !empty($b['fullname']) ? $b['fullname'] : ($b['bot_title'] ?: 'Oponente de Treino'),
                'avatar' => $avatar,
                'province' => $b['province'] ?: 'Luanda',
                'difficulty' => $b['difficulty'],
                'accept_delay' => $acc_delay,
                'points' => 1100 + ($total_w * 3),
                'win_rate' => $wr . '%',
                'matches' => $total_m,
                'status' => 'IA de Treino',
                'is_bot' => 1
            ];
        }
    }
    echo json_encode(['status' => 'ok', 'bots' => $bots]);
    exit;
}

// 3.2. Rota para Buscar Combatentes Interessados na Batalha (Para o jogador escolher se não quiser esperar)
if ($action === 'get_interested_candidates') {
    // Rotação Disjunta: Bots que aceitam NÃO são os mesmos que lançam no mural!
    // A cada 5 minutos os papéis se alternam perfeitamente
    $rotation_cycle = floor(time() / 300);
    $accept_parity = ($rotation_cycle % 2 == 0) ? 0 : 1; // Grupo oposto ao do mural

    // Bots em cooldown: quem entrou em duelo nos últimos 3 minutos fica temporariamente fora da lista
    $cooldown_bot_ids = [];
    $q_cd = $db->query("SELECT DISTINCT bot_id FROM arena_challenges WHERE is_bot = 1 AND status = 'accepted' AND accepted_at >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)");
    if ($q_cd) {
        while ($rcd = $q_cd->fetch_assoc()) {
            if (!empty($rcd['bot_id'])) $cooldown_bot_ids[] = (int)$rcd['bot_id'];
        }
    }
    $exclude_sql = !empty($cooldown_bot_ids) ? (" AND id NOT IN (" . implode(',', $cooldown_bot_ids) . ")") : "";

    $res_bots = $db->query("SELECT id, bot_tag, fullname, bot_title, avatar_url, province, difficulty, target_winrate, total_wins, total_matches 
        FROM arena_bots 
        WHERE is_active = 1 
          AND (id % 2 = {$accept_parity}) 
          {$exclude_sql}
        ORDER BY RAND() LIMIT 4");

    // Fallback de segurança se todos do grupo estiverem em cooldown
    if (!$res_bots || $res_bots->num_rows === 0) {
        $res_bots = $db->query("SELECT id, bot_tag, fullname, bot_title, avatar_url, province, difficulty, target_winrate, total_wins, total_matches 
            FROM arena_bots 
            WHERE is_active = 1 
            ORDER BY RAND() LIMIT 4");
    }

    $candidates = [];
    $styles_presets = [
        0 => ['tag' => 'Agressivo (Rushdown)', 'icon' => 'fa-fire', 'desc' => 'Pressão constante, combos e ataques aéreos', 'code' => 'aggressive', 'color' => '#ef4444'],
        1 => ['tag' => 'Tático (Contra-Ataque)', 'icon' => 'fa-shield-halved', 'desc' => 'Defesa sólida e contra-ataques cirúrgicos', 'code' => 'defensive', 'color' => '#3b82f6'],
        2 => ['tag' => 'Ninja Veloz', 'icon' => 'fa-bolt', 'desc' => 'Alta mobilidade, esquiva e chutes rápidos', 'code' => 'ninja', 'color' => '#eab308'],
        3 => ['tag' => 'Demolidor Arcade', 'icon' => 'fa-hand-fist', 'desc' => 'Rasteiras pesadas, gancho e dano explosivo', 'code' => 'tactical', 'color' => '#10b981']
    ];

    if ($res_bots) {
        while ($b = $res_bots->fetch_assoc()) {
            $c_name = !empty($b['fullname']) ? $b['fullname'] : $b['bot_tag'];
            $c_avatar = !empty($b['avatar_url']) ? $b['avatar_url'] : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
            $c_winrate = (int)($b['target_winrate'] ?: 72);
            $preset = $styles_presets[$b['id'] % 4];

            $candidates[] = [
                'id' => (int)$b['id'],
                'name' => $c_name,
                'avatar' => $c_avatar,
                'province' => $b['province'] ?: 'Luanda',
                'winrate' => $c_winrate . '% vitórias',
                'title' => $b['bot_title'] ?: 'Lutador Ativo',
                'combat_style' => $preset['tag'],
                'combat_style_icon' => $preset['icon'],
                'combat_style_desc' => $preset['desc'],
                'combat_style_code' => $preset['code'],
                'combat_style_color' => $preset['color']
            ];
        }
    }
    echo json_encode(['status' => 'ok', 'candidates' => $candidates]);
    exit;
}

// 3.3. Rota para Aceitar Batalha Imediata com o Combatente Selecionado pelo Jogador
if ($action === 'match_with_candidate') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) $input = $_POST;
    $token = trim($input['token'] ?? '');
    $bot_id = (int)($input['bot_id'] ?? 0);

    if (empty($token)) {
        echo json_encode(['status' => 'error', 'message' => 'Token não informado']);
        exit;
    }

    $q = $db->query("SELECT * FROM arena_challenges WHERE challenge_token = '{$db->real_escape_string($token)}' AND status = 'waiting' LIMIT 1");
    if (!$q || $q->num_rows === 0) {
        echo json_encode(['status' => 'error', 'message' => 'Proposta não encontrada, cancelada ou expirada']);
        exit;
    }
    $c = $q->fetch_assoc();

    $qb = ($bot_id > 0) ? $db->query("SELECT * FROM arena_bots WHERE id = {$bot_id} LIMIT 1") : $db->query("SELECT * FROM arena_bots WHERE is_active = 1 ORDER BY RAND() LIMIT 1");
    $bot = ($qb && $qb->num_rows > 0) ? $qb->fetch_assoc() : null;
    if (!$bot) {
        echo json_encode(['status' => 'error', 'message' => 'Combatente não encontrado']);
        exit;
    }

    $bot_name = $db->real_escape_string($bot['fullname'] ?: $bot['bot_tag']);
    $bot_avatar = $db->real_escape_string($bot['avatar_url'] ?: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80');
    $bot_prov = $db->real_escape_string($bot['province'] ?: 'Luanda');
    $bot_diff = $db->real_escape_string($bot['difficulty'] ?: 'medium');
    $bot_id = (int)$bot['id'];

    $upd = $db->query("UPDATE arena_challenges SET 
        status = 'accepted', 
        is_bot = 1, 
        bot_id = {$bot_id}, 
        bot_difficulty = '{$bot_diff}',
        challenged_id = {$bot_id}, 
        challenged_tag = '{$bot_name}', 
        challenged_avatar = '{$bot_avatar}', 
        challenged_province = '{$bot_prov}',
        accepted_at = NOW(), 
        challenged_last_ping = NOW() 
        WHERE id = {$c['id']}");

    if (!$upd) {
        echo json_encode(['status' => 'error', 'message' => 'Erro ao vincular combate no servidor: ' . $db->error]);
        exit;
    }

    $bot_styles = ['aggressive', 'defensive', 'ninja', 'tactical'];
    $style_code = $bot_styles[$bot_id % 4];

    echo json_encode([
        'status' => 'ok',
        'message' => "Desafio iniciado com {$bot_name}!",
        'game' => $c['game_type'],
        'bet_amount' => (int)$c['bet_amount'],
        'token' => $token,
        'opp_name' => $bot_name,
        'opp_avatar' => $bot_avatar,
        'opp_province' => $bot_prov,
        'bot_style' => $style_code,
        'redirect_url' => GAMER_URL . "/play.php?token={$token}&game={$c['game_type']}&bet_amount={$c['bet_amount']}&bot_style={$style_code}"
    ]);
    exit;
}

// 4. CRIAR DESAFIO COM PRAZO DE 1 MINUTO (60 SEGUNDOS) E VALOR DE APOSTA
if ($action === 'create_challenge') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        echo json_encode(['status' => 'error', 'message' => 'Parâmetros inválidos']);
        exit;
    }

    $game_type = trim($input['game'] ?? 'cardbattle');
    $opp_id = (int)($input['opp_id'] ?? 0);
    $opp_tag = trim($input['opp_tag'] ?? 'Oponente');
    $opp_avatar = trim($input['opp_avatar'] ?? '');
    $opp_province = trim($input['opp_province'] ?? 'Luanda');
    $opp_diff = trim($input['opp_diff'] ?? 'medium');
    $is_bot = !empty($input['is_bot']) ? 1 : 0;
    $bot_id = (int)($input['bot_id'] ?? ($is_bot ? $opp_id : 0));
    $bet_amount = max(500, (int)($input['bet_amount'] ?? 500));

    $my_uid = $logged_user ? (int)$logged_user['user_id'] : 0;
    if ($my_uid <= 0) {
        echo json_encode(['status' => 'error', 'message' => 'Faça login para criar um desafio.']);
        exit;
    }

    // Validação de saldo no servidor
    $user_cur_bal = (float)($gamer_profile['balance_ao'] ?? ($logged_user['user_wallet_balance'] ?? 0));
    if ($user_cur_bal < $bet_amount) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Saldo insuficiente na sua carteira (' . number_format($user_cur_bal, 2, ',', '.') . ' Kz). Recarregue a conta para apostar ' . number_format($bet_amount, 0, ',', '.') . ' Kz.'
        ]);
        exit;
    }

    // CONCURRENCY LOCK NO BOT: Bloquear oponente imediatamente se for bot
    if ($is_bot && $bot_id > 0) {
        $lock_q = $db->query("UPDATE arena_bots SET status = 'proposal_pending', last_status_change = NOW() 
                              WHERE id = {$bot_id} AND is_active = 1 AND (status = 'available' OR status IS NULL)");
        if ($db->affected_rows === 0) {
            echo json_encode([
                'status' => 'error',
                'message' => 'Este combatente acabou de aceitar outro duelo ou está ocupado. Por favor, escolha outro oponente.'
            ]);
            exit;
        }
    }
    $my_tag = $gamer_profile['gamer_tag'] ?? ($logged_user['fullname'] ?? 'Gamer');
    $my_avatar = $logged_user['avatar'] ?? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
    $my_prov = $gamer_profile['province'] ?? 'Luanda';

    $token = bin2hex(random_bytes(16));

    // Desafio expira estritamente em 60 segundos (1 minuto)
    $ins = $db->query("INSERT INTO arena_challenges 
        (challenge_token, game_type, challenger_id, challenger_tag, challenger_avatar, challenger_province,
         challenged_id, challenged_tag, challenged_avatar, challenged_province, is_bot, bot_id, bot_difficulty,
         bet_amount, status, created_at, expires_at, challenger_last_ping, challenged_last_ping)
        VALUES 
        ('{$db->real_escape_string($token)}', '{$db->real_escape_string($game_type)}', {$my_uid}, '{$db->real_escape_string($my_tag)}', '{$db->real_escape_string($my_avatar)}', '{$db->real_escape_string($my_prov)}',
         {$opp_id}, '{$db->real_escape_string($opp_tag)}', '{$db->real_escape_string($opp_avatar)}', '{$db->real_escape_string($opp_province)}', {$is_bot}, {$bot_id}, '{$db->real_escape_string($opp_diff)}',
         {$bet_amount}, 'waiting', NOW(), DATE_ADD(NOW(), INTERVAL 60 SECOND), NOW(), NOW())");

    if ($ins) {
        echo json_encode([
            'status' => 'ok',
            'challenge_token' => $token,
            'expires_in' => 60,
            'game' => $game_type,
            'opp_tag' => $opp_tag,
            'is_bot' => $is_bot,
            'bet_amount' => $bet_amount
        ]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Falha ao registrar desafio: ' . $db->error]);
    }
    exit;
}

// 4.1. CRIAR PROPOSTA DE BATALHA ABERTA NO MURAL
if ($action === 'create_open_challenge') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) $input = $_POST;

    if (!$logged_user) {
        echo json_encode(['status' => 'error', 'message' => 'Faça login na plataforma para lançar um desafio.']);
        exit;
    }

    $my_uid = (int)$logged_user['user_id'];
    $game_type = trim($input['game'] ?? 'hyperstrike');
    if (!array_key_exists($game_type, $ARENA_GAMES)) {
        $game_type = 'hyperstrike';
    }
    $bet_amount = max(0, (int)($input['bet_amount'] ?? 0));

    // Obter saldo real e rigoroso direto do banco
    $q_w = $db->query("SELECT user_wallet_balance FROM users WHERE user_id = {$my_uid} LIMIT 1");
    $real_balance = $q_w ? (float)$q_w->fetch_assoc()['user_wallet_balance'] : 0.0;

    if ($bet_amount > 0 && $real_balance < $bet_amount) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Saldo insuficiente na sua carteira (Saldo: ' . number_format($real_balance, 2, ',', '.') . ' Kz). Recarregue a sua carteira para injetar este valor.'
        ]);
        exit;
    }

    $my_tag = $gamer_profile['gamer_tag'] ?? ($logged_user['fullname'] ?? 'Gamer_' . $my_uid);
    $my_avatar = $logged_user['avatar'] ?? '';
    $my_prov = $gamer_profile['province'] ?? 'Luanda';
    $token = bin2hex(random_bytes(16));

    // Cancelar propostas anteriores do mesmo usuário que ainda estavam abertas
    $db->query("UPDATE arena_challenges SET status = 'declined' WHERE challenger_id = {$my_uid} AND challenged_id = 0 AND status = 'waiting'");

    $ins = $db->query("INSERT INTO arena_challenges 
        (challenge_token, game_type, challenger_id, challenger_tag, challenger_avatar, challenger_province,
         challenged_id, challenged_tag, challenged_avatar, challenged_province, is_bot, bot_id, bot_difficulty,
         bet_amount, status, created_at, expires_at, challenger_last_ping, challenged_last_ping)
        VALUES 
        ('{$db->real_escape_string($token)}', '{$db->real_escape_string($game_type)}', {$my_uid}, '{$db->real_escape_string($my_tag)}', '{$db->real_escape_string($my_avatar)}', '{$db->real_escape_string($my_prov)}',
         0, 'Aguardando Desafiante...', '', 'Angola', 0, 0, 'medium',
         {$bet_amount}, 'waiting', NOW(), DATE_ADD(NOW(), INTERVAL 60 SECOND), NOW(), NOW())");

    if ($ins) {
        echo json_encode([
            'status' => 'ok',
            'token' => $token,
            'challenge_token' => $token,
            'game' => $game_type,
            'bet_amount' => $bet_amount,
            'balance' => $real_balance,
            'expires_in' => 60
        ]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Falha ao registrar proposta: ' . $db->error]);
    }
    exit;
}

// 4.2. MURAL DE DESAFIOS E PROPOSTAS ABERTAS (LOBBY AO VIVO - CICLO DE 1 MINUTO)
if ($action === 'get_open_challenges') {
    $my_uid = $logged_user ? (int)$logged_user['user_id'] : 0;
    
    // Marcar expirados (passou de 60 segundos)
    $db->query("UPDATE arena_challenges SET status = 'expired' WHERE status = 'waiting' AND expires_at < NOW()");

    $challenges = [];
    $q = $db->query("SELECT *, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds_remaining FROM arena_challenges 
                     WHERE challenged_id = 0 
                       AND status = 'waiting' 
                       AND expires_at > NOW() 
                     ORDER BY id DESC LIMIT 100");
                     
    $platform_fee_pct = get_arena_platform_fee_percent($db);

    if ($q) {
        while ($r = $q->fetch_assoc()) {
            $g_info = $ARENA_GAMES[$r['game_type']] ?? $ARENA_GAMES['hyperstrike'];
            $bet = (int)$r['bet_amount'];
            $total_pot = $bet * 2;
            $fee_amt = round(($total_pot * $platform_fee_pct) / 100, 2);
            $net_prize = $total_pot - $fee_amt;
            $sec_rem = max(1, (int)($r['seconds_remaining'] ?? 60));

            $challenges[] = [
                'id' => (int)$r['id'],
                'token' => $r['challenge_token'],
                'game_type' => $r['game_type'],
                'game_name' => $g_info['name'],
                'game_icon' => $g_info['icon'],
                'game_badge' => $g_info['badge'],
                'game_cover' => $g_info['cover'] ?? (GAMER_URL . '/images/covers/' . $r['game_type'] . '.jpg'),
                'game_color' => $g_info['tag_color'],
                'challenger_id' => (int)$r['challenger_id'],
                'challenger_name' => $r['challenger_tag'],
                'challenger_avatar' => $r['challenger_avatar'] ?: (GAMER_URL . '/content/themes/default/images/blank_profile.png'),
                'challenger_province' => $r['challenger_province'] ?: 'Luanda',
                'bet_amount' => $bet,
                'total_pot' => $total_pot,
                'fee_percent' => $platform_fee_pct,
                'fee_amount' => $fee_amt,
                'prize_pool' => $net_prize,
                'seconds_remaining' => $sec_rem,
                'formatted_bet' => number_format($bet, 0, ',', '.') . ' Kz',
                'formatted_prize' => number_format($net_prize, 0, ',', '.') . ' Kz',
                'formatted_pot' => number_format($total_pot, 0, ',', '.') . ' Kz',
                'formatted_fee' => number_format($fee_amt, 0, ',', '.') . ' Kz',
                'is_mine' => ($my_uid > 0 && (int)$r['challenger_id'] === $my_uid),
                'created_at' => $r['created_at']
            ];
        }
    }

    // Se houver menos de 8 propostas abertas no mural, preencher com desafios rotativos de 1 minuto da rede
    if (count($challenges) < 8) {
        $minute_seed = floor(time() / 60);
        $bot_seconds_left = max(1, 60 - (time() % 60));

        // Buscar bots reais cadastrados no Admin para dar dinamismo no Mural
        // Rotação Disjunta: Bots do mural NUNCA colidem com bots de aceitação!
        $rotation_cycle = floor(time() / 300);
        $mural_parity = ($rotation_cycle % 2 == 0) ? 1 : 0; // Grupo oposto ao de aceitação

        // Bots em cooldown: quem participou de duelo nos últimos 3 minutos fica fora do mural
        $cooldown_mural_ids = [];
        $q_cd_m = $db->query("SELECT DISTINCT bot_id FROM arena_challenges WHERE is_bot = 1 AND status = 'accepted' AND accepted_at >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)");
        if ($q_cd_m) {
            while ($rmc = $q_cd_m->fetch_assoc()) {
                if (!empty($rmc['bot_id'])) $cooldown_mural_ids[] = (int)$rmc['bot_id'];
            }
        }
        $exclude_mural_sql = !empty($cooldown_mural_ids) ? (" AND id NOT IN (" . implode(',', $cooldown_mural_ids) . ")") : "";

        $q_admin_bots = $db->query("SELECT * FROM arena_bots WHERE is_active = 1 AND (id % 2 = {$mural_parity}) {$exclude_mural_sql} ORDER BY id ASC");
        $pool_bots = [];
        if ($q_admin_bots && $q_admin_bots->num_rows > 0) {
            while ($ab = $q_admin_bots->fetch_assoc()) {
                $pool_bots[] = [
                    'tag' => $ab['fullname'] ?: $ab['bot_tag'],
                    'prov' => $ab['province'] ?: 'Luanda',
                    'avatar' => $ab['avatar_url'] ?: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
                    'bot_id' => (int)$ab['id']
                ];
            }
        }
        if (empty($pool_bots)) {
            $q_all_bots = $db->query("SELECT * FROM arena_bots WHERE is_active = 1 {$exclude_mural_sql} ORDER BY id ASC");
            if ($q_all_bots && $q_all_bots->num_rows > 0) {
                while ($ab = $q_all_bots->fetch_assoc()) {
                    $pool_bots[] = [
                        'tag' => $ab['fullname'] ?: $ab['bot_tag'],
                        'prov' => $ab['province'] ?: 'Luanda',
                        'avatar' => $ab['avatar_url'] ?: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
                        'bot_id' => (int)$ab['id']
                    ];
                }
            }
        }
        if (empty($pool_bots)) {
            $pool_bots = [
                ['tag' => 'Cláudio Manuel', 'prov' => 'Benguela', 'avatar' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80', 'bot_id' => 1],
                ['tag' => 'Tânia dos Santos', 'prov' => 'Huambo', 'avatar' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80', 'bot_id' => 2],
                ['tag' => 'Edgar Bumba', 'prov' => 'Cabinda', 'avatar' => 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80', 'bot_id' => 3],
                ['tag' => 'Vanessa Tchissola', 'prov' => 'Huíla', 'avatar' => 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80', 'bot_id' => 4],
                ['tag' => 'Mateus Silva Bernardo', 'prov' => 'Luanda', 'avatar' => 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80', 'bot_id' => 5],
                ['tag' => 'Esperança Ndala', 'prov' => 'Cuanza Sul', 'avatar' => 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80', 'bot_id' => 6],
                ['tag' => 'Geraldo Catumbela', 'prov' => 'Malanje', 'avatar' => 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80', 'bot_id' => 7],
                ['tag' => 'Lurdes Sambango', 'prov' => 'Uíge', 'avatar' => 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=150&q=80', 'bot_id' => 8]
            ];
        }

        // Catálogo oficial dos 3 jogos da Arena
        $sample_games = ['hyperstrike', 'neon-fist', 'mkjs', 'card-duel', 'rps-battle'];
        $sample_bets = [500, 1000, 2000, 2500, 5000, 10000];

        // CICLO DINÂMICO DE COMBATE ENTRE BOTS:
        // A cada ciclo de 25 segundos, pares de bots entram em batalha ativa.
        // BOTS QUE ESTÃO EM BATALHA NÃO FICAM NO MURAL DE PROPOSTAS ABERTAS!
        $battle_cycle = floor(time() / 25);
        $battling_bot_indices = [];
        $bot_count_total = count($pool_bots);
        if ($bot_count_total >= 4) {
            $b_idx1 = ($battle_cycle * 3) % $bot_count_total;
            $b_idx2 = ($battle_cycle * 7 + 1) % $bot_count_total;
            $b_idx3 = ($battle_cycle * 5 + 2) % $bot_count_total;
            $b_idx4 = ($battle_cycle * 11 + 3) % $bot_count_total;
            $battling_bot_indices = array_unique([$b_idx1, $b_idx2, $b_idx3, $b_idx4]);
        }

        // Registrar vitória da batalha do ciclo anterior em arena_live_wins
        $prev_cycle = $battle_cycle - 1;
        $sim_win_marker = "cycle_win_" . $prev_cycle;
        $chk_prev_win = $db->query("SELECT id FROM arena_live_wins WHERE loser_name LIKE '%{$sim_win_marker}%' LIMIT 1");
        if ((!$chk_prev_win || $chk_prev_win->num_rows === 0) && $bot_count_total >= 2) {
            $w_idx = ($prev_cycle * 3) % $bot_count_total;
            $l_idx = ($prev_cycle * 7 + 1) % $bot_count_total;
            if ($w_idx === $l_idx) $l_idx = ($w_idx + 1) % $bot_count_total;
            $w_b = $pool_bots[$w_idx];
            $l_b = $pool_bots[$l_idx];
            $g_sim = $sample_games[$prev_cycle % count($sample_games)];
            $b_sim = $sample_bets[$prev_cycle % count($sample_bets)];
            $pot_sim = $b_sim * 2;
            $pz_sim = (int)($pot_sim - round(($pot_sim * $platform_fee_pct) / 100, 2));

            $is_sim_private = (mt_rand(1, 100) <= 35) ? 1 : 0;
            $db->query("INSERT INTO arena_live_wins 
                (winner_id, winner_name, winner_avatar, winner_province, winner_is_bot,
                 is_private, loser_id, loser_name, loser_avatar, loser_province, loser_is_bot,
                 game_type, bet_amount, prize_won, created_at)
                VALUES 
                ({$w_b['bot_id']}, '{$db->real_escape_string($w_b['tag'])}', '{$db->real_escape_string($w_b['avatar'])}', '{$db->real_escape_string($w_b['prov'])}', 1,
                 {$is_sim_private}, {$l_b['bot_id']}, '{$db->real_escape_string($l_b['tag'])} ({$sim_win_marker})', '{$db->real_escape_string($l_b['avatar'])}', '{$db->real_escape_string($l_b['prov'])}', 1,
                 '{$g_sim}', {$b_sim}, {$pz_sim}, DATE_SUB(NOW(), INTERVAL 3 SECOND))");
        }

        // Filtra os bots disponíveis (excluindo os que foram batalhar)
        $available_bots = [];
        foreach ($pool_bots as $b_idx => $b_data) {
            if (!in_array($b_idx, $battling_bot_indices)) {
                $available_bots[] = $b_data;
            }
        }
        if (empty($available_bots)) $available_bots = $pool_bots;

        // O total de propostas no mural flutua realisticamente (entre 4 e 7)
        $max_mural_cards = 4 + (($minute_seed + floor(time() / 15)) % 4);
        $target_count = min($max_mural_cards, count($available_bots));

        for ($i = 0; $i < $target_count; $i++) {
            if (count($challenges) >= 12) break;
            $g_key = $sample_games[($minute_seed + $i) % count($sample_games)];
            $bot_idx = ($minute_seed + $i) % count($available_bots);
            $bot_data = $available_bots[$bot_idx];
            $bet = $sample_bets[($minute_seed + $i) % count($sample_bets)];

            $g_info = $ARENA_GAMES[$g_key] ?? $ARENA_GAMES['hyperstrike'];
            $total_pot = $bet * 2;
            $fee_amt = round(($total_pot * $platform_fee_pct) / 100, 2);
            $net_prize = $total_pot - $fee_amt;

            // Tempos variados e dinâmicos para cada proposta (não ficam todos em 60s)
            $time_offset = (($minute_seed * 19) + ($i * 13)) % 45;
            $individual_secs = max(8, ($bot_seconds_left + $time_offset) % 52 + 7);

            $challenges[] = [
                'id' => 999000 + $i,
                'token' => 'open_bot_' . $g_key . '_' . $bet,
                'game_type' => $g_key,
                'game_name' => $g_info['name'],
                'game_icon' => $g_info['icon'],
                'game_badge' => $g_info['badge'],
                'game_cover' => $g_info['cover'] ?? (GAMER_URL . '/images/covers/' . $g_key . '.jpg'),
                'game_color' => $g_info['tag_color'],
                'challenger_id' => 0,
                'challenger_name' => $bot_data['tag'],
                'challenger_avatar' => $bot_data['avatar'],
                'challenger_province' => $bot_data['prov'],
                'bet_amount' => $bet,
                'total_pot' => $total_pot,
                'fee_percent' => $platform_fee_pct,
                'fee_amount' => $fee_amt,
                'prize_pool' => $net_prize,
                'seconds_remaining' => $individual_secs,
                'formatted_bet' => number_format($bet, 0, ',', '.') . ' Kz',
                'formatted_prize' => number_format($net_prize, 0, ',', '.') . ' Kz',
                'formatted_pot' => number_format($total_pot, 0, ',', '.') . ' Kz',
                'formatted_fee' => number_format($fee_amt, 0, ',', '.') . ' Kz',
                'is_mine' => false,
                'status' => 'waiting',
                'created_at' => date('Y-m-d H:i:s')
            ];
        }
    }

    // Buscar propostas reais que foram aceitas recentemente ou gerar confrontos dinâmicos da rede
    $recent_matched = [];
    $q_mat = $db->query("SELECT * FROM arena_challenges 
        WHERE status = 'accepted' 
          AND accepted_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) 
        ORDER BY accepted_at DESC LIMIT 2");
    if ($q_mat && $q_mat->num_rows > 0) {
        while ($rm = $q_mat->fetch_assoc()) {
            $g_info = $ARENA_GAMES[$rm['game_type']] ?? $ARENA_GAMES['hyperstrike'];
            $recent_matched[] = [
                'id' => (int)$rm['id'],
                'token' => $rm['challenge_token'],
                'game_type' => $rm['game_type'],
                'game_name' => $g_info['name'],
                'challenger_name' => $rm['challenger_tag'] ?: 'Combatente 1',
                'challenger_avatar' => $rm['challenger_avatar'] ?: (GAMER_URL . '/content/themes/default/images/blank_profile.png'),
                'opponent_name' => $rm['challenged_tag'] ?: 'Combatente 2',
                'opponent_avatar' => $rm['challenged_avatar'] ?: (GAMER_URL . '/content/themes/default/images/blank_profile.png'),
                'bet_amount' => (int)$rm['bet_amount'],
                'formatted_bet' => number_format((int)$rm['bet_amount'], 0, ',', '.') . ' Kz',
                'status' => 'closed',
                'matched' => true
            ];
        }
    }

    // Buscar batalhas ao vivo em curso (status = 'accepted' nos últimos 90 segundos)
    $live_battles = [];
    $q_live = $db->query("SELECT *, TIMESTAMPDIFF(SECOND, accepted_at, NOW()) AS elapsed_secs 
        FROM arena_challenges 
        WHERE status = 'accepted' 
          AND accepted_at >= DATE_SUB(NOW(), INTERVAL 90 SECOND) 
        ORDER BY accepted_at DESC LIMIT 8");
    if ($q_live && $q_live->num_rows > 0) {
        while ($lb = $q_live->fetch_assoc()) {
            $g_info = $ARENA_GAMES[$lb['game_type']] ?? $ARENA_GAMES['hyperstrike'];
            $bet = (int)$lb['bet_amount'];
            $pot = $bet * 2;
            $prize = $pot - round(($pot * $platform_fee_pct) / 100, 2);
            $el = max(0, (int)$lb['elapsed_secs']);
            $round = ($el < 25) ? 1 : (($el < 50) ? 2 : 3);

            $live_battles[] = [
                'id' => (int)$lb['id'],
                'token' => $lb['challenge_token'],
                'game_type' => $lb['game_type'],
                'game_name' => $g_info['name'],
                'game_icon' => $g_info['icon'],
                'game_badge' => $g_info['badge'],
                'challenger_name' => $lb['challenger_tag'] ?: 'Combatente 1',
                'challenger_avatar' => $lb['challenger_avatar'] ?: (GAMER_URL . '/content/themes/default/images/blank_profile.png'),
                'challenger_province' => $lb['challenger_province'] ?: 'Luanda',
                'opponent_name' => $lb['challenged_tag'] ?: 'Combatente 2',
                'opponent_avatar' => $lb['challenged_avatar'] ?: (GAMER_URL . '/content/themes/default/images/blank_profile.png'),
                'opponent_province' => $lb['challenged_province'] ?: 'Benguela',
                'bet_amount' => $bet,
                'prize_pool' => $prize,
                'formatted_bet' => number_format($bet, 0, ',', '.') . ' Kz',
                'formatted_prize' => number_format($prize, 0, ',', '.') . ' Kz',
                'current_round' => $round,
                'elapsed_seconds' => $el,
                'is_bot' => (int)$lb['is_bot'],
                'status' => 'accepted'
            ];
        }
    }

    echo json_encode([
        'status' => 'ok', 
        'challenges' => $challenges, 
        'live_battles' => $live_battles,
        'recent_matched' => $recent_matched,
        'platform_fee_percent' => $platform_fee_pct
    ]);
    exit;
}

// 4.3. ACEITAR PROPOSTA ABERTA DO MURAL (AMBOS APOSTAM O MESMO VALOR)
if ($action === 'accept_open_challenge') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) $input = $_POST;

    if (!$logged_user) {
        echo json_encode(['status' => 'error', 'message' => 'Faça login para aceitar o desafio.']);
        exit;
    }

    $my_uid = (int)$logged_user['user_id'];
    $token = trim($input['challenge_token'] ?? ($input['token'] ?? ($_GET['token'] ?? '')));

    if (empty($token)) {
        echo json_encode(['status' => 'error', 'message' => 'Token do desafio não informado.']);
        exit;
    }

    // Se for desafio de demonstração/bot da rede no mural
    if (strpos($token, 'open_bot_') === 0) {
        $parts = explode('_', $token);
        $game_key = $parts[2] ?? 'hyperstrike';
        $bet = (int)($parts[3] ?? 0);

        $q_w = $db->query("SELECT user_wallet_balance FROM users WHERE user_id = {$my_uid} LIMIT 1");
        $real_balance = $q_w ? (float)$q_w->fetch_assoc()['user_wallet_balance'] : 0.0;

        if ($bet > 0 && $real_balance < $bet) {
            echo json_encode([
                'status' => 'error',
                'message' => 'Saldo insuficiente na sua carteira (Saldo: ' . number_format($real_balance, 2, ',', '.') . ' Kz). É necessário ' . number_format($bet, 0, ',', '.') . ' Kz para aceitar este duelo.'
            ]);
            exit;
        }

        $q_bot = $db->query("SELECT * FROM arena_bots WHERE is_active = 1 ORDER BY RAND() LIMIT 1");
        $b = ($q_bot && $q_bot->num_rows > 0) ? $q_bot->fetch_assoc() : null;
        $bot_name = $b ? ($b['fullname'] ?: $b['bot_tag']) : 'Cláudio Manuel';
        $bot_avatar = $b ? $b['avatar_url'] : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80';
        $bot_prov = $b ? ($b['province'] ?: 'Benguela') : 'Benguela';
        $bot_diff = $b ? ($b['difficulty'] ?: 'medium') : 'medium';
        $bot_id = $b ? (int)$b['id'] : 1;

        $my_tag = $gamer_profile['gamer_tag'] ?? ($logged_user['fullname'] ?? 'Gamer');
        $my_avatar = $logged_user['avatar'] ?? '';
        $my_prov = $gamer_profile['province'] ?? 'Luanda';

        $new_token = bin2hex(random_bytes(16));
        $db->query("INSERT INTO arena_challenges 
            (challenge_token, game_type, challenger_id, challenger_tag, challenger_avatar, challenger_province,
             challenged_id, challenged_tag, challenged_avatar, challenged_province, is_bot, bot_id, bot_difficulty,
             bet_amount, status, created_at, expires_at, accepted_at, challenger_last_ping, challenged_last_ping)
            VALUES 
            ('{$new_token}', '{$game_key}', {$bot_id}, '{$db->real_escape_string($bot_name)}', '{$db->real_escape_string($bot_avatar)}', '{$db->real_escape_string($bot_prov)}',
             {$my_uid}, '{$db->real_escape_string($my_tag)}', '{$db->real_escape_string($my_avatar)}', '{$db->real_escape_string($my_prov)}', 1, {$bot_id}, '{$bot_diff}',
             {$bet}, 'accepted', NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW(), NOW(), NOW())");

        $bot_styles = ['aggressive', 'defensive', 'ninja', 'tactical'];
        $style_code = $bot_styles[$bot_id % 4];

        echo json_encode([
            'status' => 'ok',
            'challenge_token' => $new_token,
            'token' => $new_token,
            'game' => $game_key,
            'bet_amount' => $bet,
            'bot_style' => $style_code,
            'redirect_url' => GAMER_URL . '/play.php?token=' . $new_token . '&game=' . $game_key . '&bet_amount=' . $bet . '&bot_style=' . $style_code
        ]);
        exit;
    }

    // Proposta real no banco
    $q = $db->query("SELECT * FROM arena_challenges WHERE challenge_token = '{$db->real_escape_string($token)}' AND status = 'waiting' AND expires_at > NOW() LIMIT 1");
    if (!$q || $q->num_rows === 0) {
        echo json_encode(['status' => 'error', 'message' => 'Esta proposta já foi aceita por outro jogador ou expirou.']);
        exit;
    }

    $c = $q->fetch_assoc();
    if ((int)$c['challenger_id'] === $my_uid) {
        echo json_encode(['status' => 'error', 'message' => 'Você não pode aceitar a sua própria proposta. Aguarde um adversário aceitá-la ou cancele-a.']);
        exit;
    }

    $bet = (int)$c['bet_amount'];
    $q_w = $db->query("SELECT user_wallet_balance FROM users WHERE user_id = {$my_uid} LIMIT 1");
    $real_balance = $q_w ? (float)$q_w->fetch_assoc()['user_wallet_balance'] : 0.0;

    if ($bet > 0 && $real_balance < $bet) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Saldo insuficiente para cobrir a aposta de ' . number_format($bet, 0, ',', '.') . ' Kz. (Seu saldo: ' . number_format($real_balance, 2, ',', '.') . ' Kz).'
        ]);
        exit;
    }

    $my_tag = $gamer_profile['gamer_tag'] ?? ($logged_user['fullname'] ?? 'Gamer');
    $my_avatar = $logged_user['avatar'] ?? '';
    $my_prov = $gamer_profile['province'] ?? 'Luanda';

    $upd = $db->query("UPDATE arena_challenges SET 
        challenged_id = {$my_uid}, 
        challenged_tag = '{$db->real_escape_string($my_tag)}', 
        challenged_avatar = '{$db->real_escape_string($my_avatar)}', 
        challenged_province = '{$db->real_escape_string($my_prov)}', 
        status = 'accepted', 
        accepted_at = NOW(), 
        challenged_last_ping = NOW() 
        WHERE challenge_token = '{$db->real_escape_string($token)}' AND status = 'waiting'");

    if ($db->affected_rows > 0) {
        echo json_encode([
            'status' => 'ok',
            'challenge_token' => $token,
            'game' => $c['game_type'],
            'bet_amount' => $bet,
            'redirect_url' => GAMER_URL . '/play.php?game=' . $c['game_type'] . '&challenge=' . $token . '&bet=' . $bet
        ]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Esta proposta acabou de ser aceita por outro jogador.']);
    }
    exit;
}

// 4.4. CANCELAR PROPOSTA ABERTA DO MURAL
if ($action === 'cancel_open_challenge') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) $input = $_POST;

    $token = trim($input['challenge_token'] ?? ($_GET['token'] ?? ''));
    $my_uid = $logged_user ? (int)$logged_user['user_id'] : 0;

    if (!empty($token) && $my_uid > 0) {
        $db->query("UPDATE arena_challenges SET status = 'declined' WHERE challenge_token = '{$db->real_escape_string($token)}' AND challenger_id = {$my_uid} AND status = 'waiting'");
    }
    echo json_encode(['status' => 'ok']);
    exit;
}

// 5. MONITORAMENTO EM TEMPO REAL: VERIFICAÇÃO MÚTUA DE CONEXÃO & ACEITE
if ($action === 'poll_challenge') {
    $token = trim($_GET['token'] ?? '');
    $role = trim($_GET['role'] ?? 'challenger');

    if (empty($token)) {
        echo json_encode(['status' => 'error', 'message' => 'Token não informado']);
        exit;
    }

    $q = $db->query("SELECT *, 
        TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed_seconds,
        TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS remaining_seconds,
        TIMESTAMPDIFF(SECOND, challenger_last_ping, NOW()) AS challenger_idle,
        TIMESTAMPDIFF(SECOND, challenged_last_ping, NOW()) AS challenged_idle
        FROM arena_challenges 
        WHERE challenge_token = '{$db->real_escape_string($token)}' LIMIT 1");

    if (!$q || $q->num_rows === 0) {
        echo json_encode(['status' => 'error', 'message' => 'Desafio não encontrado']);
        exit;
    }

    $c = $q->fetch_assoc();
    $current_status = $c['status'];
    $remaining = max(0, (int)$c['remaining_seconds']);
    $elapsed = (int)$c['elapsed_seconds'];

    // 1. Atualizar ping de presença de quem está consultando
    if ($role === 'challenger') {
        $db->query("UPDATE arena_challenges SET challenger_last_ping = NOW() WHERE id = {$c['id']}");
        if ($logged_user) {
            $my_uid = (int)$logged_user['user_id'];
            $db->query("UPDATE arena_profiles SET last_active = NOW(), status = 'online' WHERE user_id = {$my_uid}");
        }
    } else {
        $db->query("UPDATE arena_challenges SET challenged_last_ping = NOW() WHERE id = {$c['id']}");
        if ($logged_user) {
            $my_uid = (int)$logged_user['user_id'];
            $db->query("UPDATE arena_profiles SET last_active = NOW(), status = 'online' WHERE user_id = {$my_uid}");
        }
    }

    // 2. Se o status já for finalizado, retorna de imediato
    if (in_array($current_status, ['accepted', 'declined', 'expired', 'disconnected'])) {
        $opp_tag = ($role === 'challenger') ? ($c['challenged_tag'] ?: 'Oponente') : ($c['challenger_tag'] ?: 'Desafiante');
        $opp_av = ($role === 'challenger') ? ($c['challenged_avatar'] ?: '') : ($c['challenger_avatar'] ?: '');
        $opp_pr = ($role === 'challenger') ? ($c['challenged_province'] ?: 'Luanda') : ($c['challenger_province'] ?: 'Luanda');
        echo json_encode([
            'status' => $current_status,
            'remaining_seconds' => $remaining,
            'challenge' => $c,
            'game' => $c['game_type'],
            'bet_amount' => (int)$c['bet_amount'],
            'opp_name' => $opp_tag,
            'opp_avatar' => $opp_av,
            'opp_province' => $opp_pr
        ]);
        exit;
    }

    // 3. Regra de Expiração do 1 Minuto (60s)
    if ($remaining <= 0) {
        $db->query("UPDATE arena_challenges SET status = 'expired' WHERE id = {$c['id']}");
        echo json_encode([
            'status' => 'expired',
            'message' => 'O prazo de 1 minuto expirou e o adversário não respondeu a tempo.',
            'remaining_seconds' => 0
        ]);
        exit;
    }

    // 4. Detecção de Desconexão: Se o desafiante ficou mais de 10s sem dar ping
    if ((int)$c['challenger_idle'] > 12) {
        $db->query("UPDATE arena_challenges SET status = 'disconnected' WHERE id = {$c['id']}");
        echo json_encode([
            'status' => 'disconnected',
            'message' => 'O desafiante perdeu a conexão com o servidor.',
            'remaining_seconds' => $remaining
        ]);
        exit;
    }

    // 4.5. Proposta Aberta no Mural (challenged_id == 0):
    // Prioridade máxima para jogadores humanos!
    // Mantém a proposta aberta por pelo menos 28 segundos para permitir que pessoas reais aceitem.
    // Só após este intervalo um combatente do sistema aceita para não deixar o jogador desacompanhado.
    if ((int)$c['challenged_id'] === 0) {
        if ($elapsed >= 28 && $c['status'] === 'waiting') {
            $bet_val = (float)$c['bet_amount'];
            $rotation_cycle = floor(time() / 300);
            $accept_parity = ($rotation_cycle % 2 == 0) ? 0 : 1; // Grupo oposto ao de quem lança no mural

            $qb = $db->query("SELECT * FROM arena_bots WHERE is_active = 1 AND (id % 2 = {$accept_parity}) AND max_bet_amount >= {$bet_val} ORDER BY RAND() LIMIT 1");
            if (!$qb || $qb->num_rows === 0) {
                $qb = $db->query("SELECT * FROM arena_bots WHERE is_active = 1 AND (id % 2 = {$accept_parity}) ORDER BY RAND() LIMIT 1");
            }
            if (!$qb || $qb->num_rows === 0) {
                $qb = $db->query("SELECT * FROM arena_bots WHERE is_active = 1 ORDER BY RAND() LIMIT 1");
            }
            $bot = ($qb && $qb->num_rows > 0) ? $qb->fetch_assoc() : null;
            if ($bot) {
                $bot_name = $db->real_escape_string($bot['fullname'] ?: $bot['bot_tag']);
                $bot_avatar = $db->real_escape_string($bot['avatar_url']);
                $bot_prov = $db->real_escape_string($bot['province']);
                $bot_diff = $db->real_escape_string($bot['difficulty'] ?: 'medium');
                $bot_id = (int)$bot['id'];

                $db->query("UPDATE arena_challenges SET 
                    status = 'accepted', 
                    is_bot = 1, 
                    bot_id = {$bot_id}, 
                    bot_difficulty = '{$bot_diff}',
                    challenged_id = {$bot_id},
                    challenged_tag = '{$bot_name}', 
                    challenged_avatar = '{$bot_avatar}', 
                    challenged_province = '{$bot_prov}',
                    accepted_at = NOW(), 
                    challenged_last_ping = NOW() 
                    WHERE id = {$c['id']}");

                $c['status'] = 'accepted';
                $c['is_bot'] = 1;
                $c['bot_id'] = $bot_id;
                $c['challenged_tag'] = $bot_name;
                $c['challenged_avatar'] = $bot_avatar;
                $c['challenged_province'] = $bot_prov;

                echo json_encode([
                    'status' => 'accepted',
                    'message' => "⚡ {$bot_name} se interessou pela aposta e aceitou o duelo!",
                    'remaining_seconds' => $remaining,
                    'challenge' => $c,
                    'opponent_name' => $bot_name,
                    'opp_name' => $bot_name,
                    'opp_avatar' => $bot_avatar,
                    'opp_province' => $bot_prov,
                    'game' => $c['game_type'],
                    'bet_amount' => $c['bet_amount']
                ]);
                exit;
            }
        }

        if ($remaining <= 0) {
            $db->query("UPDATE arena_challenges SET status = 'expired' WHERE id = {$c['id']}");
            echo json_encode([
                'status' => 'expired',
                'message' => 'O prazo de 1 minuto expirou e nenhum adversário aceitou a sua proposta no mural. Você pode criar outra agora!',
                'remaining_seconds' => 0
            ]);
            exit;
        }
    }

    // 5. Se o oponente for IA/Bot programado pelo Admin:
    if ($c['is_bot'] == 1) {
        // Obter delay de concentração programado para o bot
        $target_delay = 6;
        if (!empty($c['bot_id'])) {
            $qb = $db->query("SELECT accept_delay_seconds FROM arena_bots WHERE id = {$c['bot_id']} LIMIT 1");
            if ($qb && $qb->num_rows > 0) {
                $target_delay = (int)($qb->fetch_assoc()['accept_delay_seconds'] ?? 6);
            }
        }
        if ($target_delay < 3) $target_delay = 5;
        if ($target_delay > 45) $target_delay = 30;

        // O bot analisa a proposta e aceita após seu tempo de concentração programado
        if ($elapsed >= $target_delay) {
            $db->query("UPDATE arena_challenges SET status = 'accepted', accepted_at = NOW(), challenged_last_ping = NOW() WHERE id = {$c['id']}");
            $c['status'] = 'accepted';
            echo json_encode([
                'status' => 'accepted',
                'message' => 'Desafio aceito! Ambos jogadores sincronizados.',
                'remaining_seconds' => $remaining,
                'challenge' => $c
            ]);
            exit;
        }
    } else {
        // Se for jogador humano: verificar se o jogador desafiado continua online
        // Se o desafiado não deu ping há mais de 20s e não aceitou, pode ter fechado a janela
        if ((int)$c['challenged_idle'] > 25 && $elapsed > 20) {
            $db->query("UPDATE arena_challenges SET status = 'disconnected' WHERE id = {$c['id']}");
            echo json_encode([
                'status' => 'disconnected',
                'message' => 'O oponente desafiado desconectou-se da Arena.',
                'remaining_seconds' => $remaining
            ]);
            exit;
        }
    }

    echo json_encode([
        'status' => 'waiting',
        'elapsed_seconds' => $elapsed,
        'remaining_seconds' => $remaining,
        'challenge' => $c
    ]);
    exit;
}

// 6. JOGADOR ACEITA O DESAFIO
if ($action === 'accept_challenge') {
    $token = trim($_GET['token'] ?? '');
    if (!$logged_user) {
        echo json_encode(['status' => 'error', 'message' => 'Faça login para aceitar']);
        exit;
    }
    $my_uid = (int)$logged_user['user_id'];
    $upd = $db->query("UPDATE arena_challenges 
                       SET status = 'accepted', accepted_at = NOW(), challenged_last_ping = NOW() 
                       WHERE challenge_token = '{$db->real_escape_string($token)}' 
                         AND challenged_id = {$my_uid} 
                         AND status = 'waiting' 
                         AND expires_at > NOW()");
    if ($db->affected_rows > 0) {
        echo json_encode(['status' => 'ok']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Desafio expirado ou não encontrado']);
    }
    exit;
}

// 7. JOGADOR RECUSA OU CANCELA O DESAFIO
if ($action === 'decline_challenge' || $action === 'cancel_challenge') {
    $token = trim($_GET['token'] ?? '');
    $db->query("UPDATE arena_challenges SET status = 'declined' WHERE challenge_token = '{$db->real_escape_string($token)}'");
    echo json_encode(['status' => 'ok']);
    exit;
}

// 8. VERIFICAR SE HÁ DESAFIOS RECEBIDOS PARA MIM
if ($action === 'check_incoming_challenges') {
    if (!$logged_user) {
        echo json_encode(['status' => 'ok', 'challenges' => []]);
        exit;
    }
    $my_uid = (int)$logged_user['user_id'];
    $db->query("UPDATE arena_profiles SET status = 'online', last_active = NOW() WHERE user_id = {$my_uid}");

    $q = $db->query("SELECT *, 
        TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS remaining_seconds 
        FROM arena_challenges 
        WHERE challenged_id = {$my_uid} 
          AND status = 'waiting' 
          AND expires_at > NOW() 
        ORDER BY id DESC LIMIT 1");

    if ($q && $q->num_rows > 0) {
        $c = $q->fetch_assoc();
        echo json_encode([
            'status' => 'ok',
            'incoming' => $c,
            'remaining_seconds' => max(0, (int)$c['remaining_seconds'])
        ]);
    } else {
        echo json_encode(['status' => 'ok', 'incoming' => null]);
    }
    exit;
}

// 8.5. RESULTADOS & GANHOS EM TEMPO REAL (FEED ESTILO STAKE / CASINO DARK)
if ($action === 'get_live_payouts') {
    $q_wins = $db->query("SELECT *, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS secs_ago 
                           FROM arena_live_wins 
                           ORDER BY id DESC LIMIT 12");
    $payouts = [];
    $games_map = [
        'hyperstrike' => ['name' => 'HYPER-STRIKE', 'icon' => 'fa-bolt'],
        'neon-fist'   => ['name' => 'Neon Fist', 'icon' => 'fa-hand-fist'],
        'mkjs'        => ['name' => 'MK.js Kombat', 'icon' => 'fa-skull'],
        'card-duel'   => ['name' => 'Duelo de Cartas 1v1', 'icon' => 'fa-layer-group'],
        'rps-battle'  => ['name' => 'Pedra Papel Tesoura 1v1', 'icon' => 'fa-hand-back-fist']
    ];

    if ($q_wins) {
        while ($w = $q_wins->fetch_assoc()) {
            $g_key = $w['game_type'];
            $g_info = $games_map[$g_key] ?? ($games_map['hyperstrike']);

            $is_private = !empty($w['is_private']) ? 1 : 0;
            $raw_winner_name = $w['winner_name'];
            $clean_winner_name = preg_replace('/\s*\(cycle_win_[^)]+\)/', '', $raw_winner_name);

            // Se privado, nome vira "Privado"
            $user_display_name = $is_private ? 'Privado' : $clean_winner_name;

            // Formatação de data / hora HH:mm exata como na foto (ex: 11:42)
            $time_formatted = date('H:i', strtotime($w['created_at']));

            $bet_amt = (float)$w['bet_amount'];
            $prize_amt = (float)$w['prize_won'];
            $is_win = isset($w['is_win']) ? (int)$w['is_win'] : 1;

            // Multiplicador calculado (ex: 1,80x para vitórias com 10% de taxa)
            $multiplier_val = ($bet_amt > 0 && $is_win) ? round($prize_amt / $bet_amt, 2) : 0.00;
            $multiplier_formatted = number_format($multiplier_val, 2, ',', '.') . '×';

            $bet_formatted = number_format($bet_amt, 2, ',', '.') . ' Kz 🇦🇴';
            $payout_formatted = ($is_win ? '+' : '-') . number_format($prize_amt > 0 ? $prize_amt : $bet_amt, 2, ',', '.') . ' Kz 🇦🇴';

            $payouts[] = [
                'id' => (int)$w['id'],
                'game_type' => $g_key,
                'game_name' => $g_info['name'],
                'game_icon' => $g_info['icon'],
                'is_private' => $is_private,
                'user_name' => $user_display_name,
                'user_avatar' => $is_private ? '' : ($w['winner_avatar'] ?: (GAMER_URL . '/content/themes/default/images/blank_profile.png')),
                'time_formatted' => $time_formatted,
                'bet_amount' => $bet_amt,
                'bet_amount_formatted' => $bet_formatted,
                'multiplier' => $multiplier_formatted,
                'prize_won' => $prize_amt,
                'payout_formatted' => $payout_formatted,
                'is_win' => $is_win,
                'created_at' => $w['created_at']
            ];
        }
    }
    echo json_encode(['status' => 'ok', 'payouts' => $payouts]);
    exit;
}

// 8.6. CONFIGURAÇÕES DE PRIVACIDADE DO USUÁRIO (MODO PRIVADO / INCÓGNITO)
if ($action === 'save_privacy_settings') {
    $input = json_decode(file_get_contents('php://input'), true);
    $is_private = !empty($input['is_private']) ? 1 : 0;
    
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    $_SESSION['gamer_incognito_mode'] = $is_private;

    if ($logged_user && !empty($logged_user['user_id'])) {
        $uid = (int)$logged_user['user_id'];
        $db->query("UPDATE arena_profiles SET is_private_profile = {$is_private} WHERE user_id = {$uid}");
    }

    echo json_encode(['status' => 'ok', 'is_private' => $is_private]);
    exit;
}


// 9. FINALIZAR PARTIDA & ATUALIZAR PONTOS
if ($action === 'finish_match') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        echo json_encode(['status' => 'error', 'message' => 'Dados inválidos']);
        exit;
    }

    $game_type = trim($input['game_type'] ?? 'cardbattle');
    $result = trim($input['result'] ?? 'win');
    $duration = (int)($input['duration'] ?? 30);
    $is_bot = !empty($input['is_bot']) ? 1 : 0;
    $bot_id = (int)($input['bot_id'] ?? 0);
    $room_code = trim($input['room_code'] ?? '');

    $uid = $logged_user ? (int)$logged_user['user_id'] : 0;

    if ($uid > 0) {
        $is_win = ($result === 'win') ? 1 : 0;
        $is_loss = ($result === 'lose') ? 1 : 0;
        $is_draw = ($result === 'draw') ? 1 : 0;

        $points_delta = 0;
        $bet_amount = max(0, (int)($input['bet_amount'] ?? 0));

        if ($is_win) {
            $points_delta = 25;
            $prize_won = $bet_amount > 0 ? $bet_amount : 0;
            $db->query("UPDATE arena_profiles SET 
                total_matches = total_matches + 1,
                total_wins = total_wins + 1,
                competitive_points = competitive_points + {$points_delta},
                wallet_balance = wallet_balance + {$prize_won},
                current_streak = current_streak + 1,
                max_streak = GREATEST(max_streak, current_streak + 1),
                last_active = NOW()
                WHERE user_id = {$uid}");
        } elseif ($is_loss) {
            $points_delta = -10;
            $loss_amount = $bet_amount > 0 ? $bet_amount : 0;
            $db->query("UPDATE arena_profiles SET 
                total_matches = total_matches + 1,
                total_losses = total_losses + 1,
                competitive_points = GREATEST(100, competitive_points + {$points_delta}),
                wallet_balance = GREATEST(0, wallet_balance - {$loss_amount}),
                current_streak = 0,
                last_active = NOW()
                WHERE user_id = {$uid}");
        } else {
            $points_delta = 5;
            $db->query("UPDATE arena_profiles SET 
                total_matches = total_matches + 1,
                total_draws = total_draws + 1,
                competitive_points = competitive_points + {$points_delta},
                last_active = NOW()
                WHERE user_id = {$uid}");
        }

        if ($is_bot) {
            $where_bot = ($bot_id > 0) ? "id = {$bot_id}" : "is_active = 1 LIMIT 1";
            if ($is_win) {
                $db->query("UPDATE arena_bots SET total_matches = total_matches + 1, total_losses = total_losses + 1 WHERE {$where_bot}");
            } elseif ($is_loss) {
                $db->query("UPDATE arena_bots SET total_matches = total_matches + 1, total_wins = total_wins + 1 WHERE {$where_bot}");
            } else {
                $db->query("UPDATE arena_bots SET total_matches = total_matches + 1, total_draws = total_draws + 1 WHERE {$where_bot}");
            }
        }

        $winner_id = $is_win ? $uid : ($is_loss ? 0 : null);
        $db->query("INSERT INTO arena_matches 
            (room_id, game_type, player1_id, player1_is_bot, player2_id, player2_is_bot, winner_id, is_draw, duration_seconds, is_ranked, points_awarded) 
            VALUES 
            ('{$room_code}', '{$game_type}', {$uid}, 0, " . ($bot_id ?: 0) . ", {$is_bot}, " . ($winner_id !== null ? $winner_id : "NULL") . ", {$is_draw}, {$duration}, 1, {$points_delta})");

        // Registrar no Feed Oficial de Ganhos ao Vivo (arena_live_wins)
        $my_tag_win = $gamer_profile['gamer_tag'] ?? ($logged_user['fullname'] ?? 'Gamer');
        $my_avatar_win = $logged_user['avatar'] ?? '';
        $my_prov_win = $gamer_profile['province'] ?? 'Luanda';

        // Buscar dados do oponente/bot
        $opp_tag_win = 'Oponente';
        $opp_avatar_win = '';
        $opp_prov_win = 'Angola';
        if ($is_bot && $bot_id > 0) {
            $q_bot_info = $db->query("SELECT * FROM arena_bots WHERE id = {$bot_id} LIMIT 1");
            if ($q_bot_info && $q_bot_info->num_rows > 0) {
                $b_row = $q_bot_info->fetch_assoc();
                $opp_tag_win = $b_row['fullname'] ?: $b_row['bot_tag'];
                $opp_avatar_win = $b_row['avatar_url'];
                $opp_prov_win = $b_row['province'] ?: 'Benguela';
            }
        }

        $platform_fee_pct_val = get_arena_platform_fee_percent($db);
        $live_prize_val = $bet_amount > 0 ? (int)(($bet_amount * 2) - round((($bet_amount * 2) * $platform_fee_pct_val) / 100, 2)) : 0;
        $is_user_private = !empty($input['is_private']) ? 1 : 0;
        if (!empty($_SESSION['gamer_incognito_mode'])) {
            $is_user_private = 1;
        }

        if ($is_win) {
            // Humano Vencedor!
            $db->query("INSERT INTO arena_live_wins 
                (winner_id, winner_name, winner_avatar, winner_province, winner_is_bot,
                 is_private, loser_id, loser_name, loser_avatar, loser_province, loser_is_bot,
                 game_type, bet_amount, prize_won, created_at)
                VALUES 
                ({$uid}, '{$db->real_escape_string($my_tag_win)}', '{$db->real_escape_string($my_avatar_win)}', '{$db->real_escape_string($my_prov_win)}', 0,
                 {$is_user_private},
                 {$bot_id}, '{$db->real_escape_string($opp_tag_win)}', '{$db->real_escape_string($opp_avatar_win)}', '{$db->real_escape_string($opp_prov_win)}', {$is_bot},
                 '{$game_type}', {$bet_amount}, {$live_prize_val}, NOW())");
        } elseif ($is_loss && $bet_amount > 0) {
            // Adversário/Bot Vencedor
            $is_opp_private = (mt_rand(1, 100) <= 35) ? 1 : 0;
            $db->query("INSERT INTO arena_live_wins 
                (winner_id, winner_name, winner_avatar, winner_province, winner_is_bot,
                 is_private, loser_id, loser_name, loser_avatar, loser_province, loser_is_bot,
                 game_type, bet_amount, prize_won, created_at)
                VALUES 
                ({$bot_id}, '{$db->real_escape_string($opp_tag_win)}', '{$db->real_escape_string($opp_avatar_win)}', '{$db->real_escape_string($opp_prov_win)}', {$is_bot},
                 {$is_opp_private}, {$uid}, '{$db->real_escape_string($my_tag_win)}', '{$db->real_escape_string($my_avatar_win)}', '{$db->real_escape_string($my_prov_win)}', 0,
                 '{$game_type}', {$bet_amount}, {$live_prize_val}, NOW())");
        }
    }

    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    unset($_SESSION['arena_active_match']);

    $ch_token = trim($input['challenge_token'] ?? '');
    if (!empty($ch_token)) {
        $db->query("UPDATE arena_challenges SET status = 'completed' WHERE challenge_token = '{$db->real_escape_string($ch_token)}'");
    }

    echo json_encode(['status' => 'ok', 'result' => $result]);
    exit;
}

// 10. SINCRONIZAÇÃO EM TEMPO REAL: ENVIAR EVENTO DE JOGO
if ($action === 'send_game_event') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        echo json_encode(['status' => 'error', 'message' => 'Dados inválidos']);
        exit;
    }

    $room_token = trim($input['room_token'] ?? '');
    $event_type = trim($input['event_type'] ?? 'move');
    $payload_str = is_array($input['payload']) ? json_encode($input['payload']) : (string)($input['payload'] ?? '{}');
    $uid = $logged_user ? (int)$logged_user['user_id'] : 0;
    $tag = $gamer_profile['gamer_tag'] ?? ($logged_user['fullname'] ?? 'Gamer');

    if (empty($room_token)) {
        echo json_encode(['status' => 'error', 'message' => 'Token da sala obrigatório']);
        exit;
    }

    $ins = $db->query("INSERT INTO arena_game_events (room_token, player_id, player_tag, event_type, payload) VALUES (
        '{$db->real_escape_string($room_token)}',
        {$uid},
        '{$db->real_escape_string($tag)}',
        '{$db->real_escape_string($event_type)}',
        '{$db->real_escape_string($payload_str)}'
    )");

    if ($ins) {
        echo json_encode(['status' => 'ok', 'event_id' => $db->insert_id]);
    } else {
        echo json_encode(['status' => 'error', 'message' => $db->error]);
    }
    exit;
}

// 11. SINCRONIZAÇÃO EM TEMPO REAL: CONSULTAR EVENTOS DO OPONENTE
if ($action === 'poll_game_events') {
    $room_token = trim($_GET['room'] ?? '');
    $last_id = (int)($_GET['last_id'] ?? 0);
    $my_uid = $logged_user ? (int)$logged_user['user_id'] : 0;

    if (empty($room_token)) {
        echo json_encode(['status' => 'error', 'message' => 'Sala não informada']);
        exit;
    }

    $events = [];
    $q = $db->query("SELECT id, player_id, player_tag, event_type, payload, created_at 
                     FROM arena_game_events 
                     WHERE room_token = '{$db->real_escape_string($room_token)}' 
                       AND id > {$last_id} 
                       AND player_id != {$my_uid} 
                     ORDER BY id ASC LIMIT 50");

    if ($q && $q->num_rows > 0) {
        while ($row = $q->fetch_assoc()) {
            $events[] = [
                'id' => (int)$row['id'],
                'player_id' => (int)$row['player_id'],
                'player_tag' => $row['player_tag'],
                'event_type' => $row['event_type'],
                'payload' => json_decode($row['payload'], true) ?: $row['payload'],
                'time' => $row['created_at']
            ];
        }
    }

    echo json_encode([
        'status' => 'ok',
        'events' => $events,
        'count' => count($events)
    ]);
    exit;
}

// 12. CONSULTAR SALDO REAL DA CARTEIRA DO UTILIZADOR
if ($action === 'get_my_wallet') {
    $uid = $logged_user ? (int)$logged_user['user_id'] : 0;
    $balance = 0.0;
    if ($uid > 0) {
        $q = $db->query("SELECT user_wallet_balance FROM users WHERE user_id = {$uid} LIMIT 1");
        if ($q && $q->num_rows > 0) {
            $balance = (float)$q->fetch_assoc()['user_wallet_balance'];
        }
    }
    echo json_encode([
        'status' => 'ok',
        'user_id' => $uid,
        'wallet_balance' => $balance,
        'formatted' => number_format($balance, 2, ',', '.') . ' Kz'
    ]);
    exit;
}

// 13. REGISTRAR RESULTADO DE PARTIDA (VITÓRIA, DERROTA OU EMPATE COM MOVIMENTAÇÃO REAL DE CARTEIRA)
if ($action === 'finish_game') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $uid = $logged_user ? (int)$logged_user['user_id'] : 0;
    $game_key = trim($input['game'] ?? 'hyperstrike');
    $result = trim($input['result'] ?? 'win'); // 'win', 'loss', 'draw'

    if ($uid <= 0) {
        // Modo Demo / Convidado: permitir finalizar sem movimentar carteira real
        echo json_encode([
            'status' => 'ok',
            'is_demo' => true,
            'result' => $result,
            'points_awarded' => ($result === 'win' ? 25 : -15),
            'bet_amount' => 0,
            'new_balance' => 0,
            'formatted_balance' => '0,00 Kz',
            'message' => ($result === 'win' ? 'Vitória conquistada no Modo Treino!' : 'Combate finalizado no Modo Treino.')
        ]);
        exit;
    }

    $game_key = trim($input['game'] ?? 'hyperstrike');
    $result = trim($input['result'] ?? 'win'); // 'win', 'loss', 'draw'
    $opp_id = (int)($input['opponent_id'] ?? 0);
    $opp_name = trim($input['opponent_name'] ?? 'Adversário');
    $is_bot = (int)($input['is_bot'] ?? 1);
    $is_forfeit = (int)($input['is_forfeit'] ?? 0);
    $bet_amount = max(0, (float)($input['bet_amount'] ?? 0));
    $token = trim($input['challenge_token'] ?? ($input['token'] ?? ''));

    // Se houver token de desafio na tabela arena_challenges, pegar o bet_amount oficial gravado lá
    if (!empty($token)) {
        $chk_c = $db->query("SELECT bet_amount, challenger_id, challenged_id, is_bot FROM arena_challenges WHERE challenge_token = '{$db->real_escape_string($token)}' LIMIT 1");
        if ($chk_c && $chk_c->num_rows > 0) {
            $c_row = $chk_c->fetch_assoc();
            $bet_amount = (float)$c_row['bet_amount'];
            if ($opp_id <= 0) {
                $opp_id = ($uid == (int)$c_row['challenger_id']) ? (int)$c_row['challenged_id'] : (int)$c_row['challenger_id'];
            }
            $is_bot = (int)$c_row['is_bot'];
        }
    }

    $is_win = ($result === 'win');
    $is_loss = ($result === 'loss');
    $is_draw = ($result === 'draw');

    $platform_fee_pct = get_arena_platform_fee_percent($db);
    $total_pot = $bet_amount * 2;
    $house_fee = round(($total_pot * $platform_fee_pct) / 100, 2);
    $winner_net_prize = $total_pot - $house_fee;
    $net_win_profit = $winner_net_prize - $bet_amount;

    // 1. Processar Carteira Real no Banco de Dados (tabela users e wallet_transactions)
    if ($bet_amount > 0) {
        if ($is_win) {
            // O jogador venceu: Credita o lucro líquido na carteira real (já descontada a comissão da casa)
            $db->query("UPDATE users SET user_wallet_balance = user_wallet_balance + {$net_win_profit} WHERE user_id = {$uid}");
            $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES ({$uid}, 'arena_win', 0, '{$net_win_profit}', 'in', NOW())");

            // Registrar taxa da plataforma na tabela wallet_transactions
            if ($house_fee > 0) {
                $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES (1, 'arena_platform_fee', 0, '{$house_fee}', 'in', NOW())");
            }

            // Se o adversário for humano real, debita a aposta dele
            if (!$is_bot && $opp_id > 0) {
                $db->query("UPDATE users SET user_wallet_balance = GREATEST(0, user_wallet_balance - {$bet_amount}) WHERE user_id = {$opp_id}");
                $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES ({$opp_id}, 'arena_bet', 0, '{$bet_amount}', 'out', NOW())");
            }
        } elseif ($is_loss) {
            // O jogador perdeu: Debita a aposta na carteira real
            $db->query("UPDATE users SET user_wallet_balance = GREATEST(0, user_wallet_balance - {$bet_amount}) WHERE user_id = {$uid}");
            $tx_type_node = $is_forfeit ? 'arena_forfeit' : 'arena_bet';
            $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES ({$uid}, '{$tx_type_node}', 0, '{$bet_amount}', 'out', NOW())");

            // Se o adversário for humano real, credita a vitória com a taxa retida
            if (!$is_bot && $opp_id > 0) {
                $db->query("UPDATE users SET user_wallet_balance = user_wallet_balance + {$net_win_profit} WHERE user_id = {$opp_id}");
                $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES ({$opp_id}, 'arena_win', 0, '{$net_win_profit}', 'in', NOW())");
                if ($house_fee > 0) {
                    $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES (1, 'arena_platform_fee', 0, '{$house_fee}', 'in', NOW())");
                }
            }
        } elseif ($is_draw) {
            // Regra Oficial de Empate: O dinheiro apostado é reembolsado, mas a taxa da plataforma (10%) é cobrada e retida sempre (5% de cada combatente).
            $half_fee = round($house_fee / 2, 2);
            $db->query("UPDATE users SET user_wallet_balance = GREATEST(0, user_wallet_balance - {$half_fee}) WHERE user_id = {$uid}");
            $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES ({$uid}, 'arena_draw_fee', 0, '{$half_fee}', 'out', NOW())");

            if (!$is_bot && $opp_id > 0) {
                $db->query("UPDATE users SET user_wallet_balance = GREATEST(0, user_wallet_balance - {$half_fee}) WHERE user_id = {$opp_id}");
                $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES ({$opp_id}, 'arena_draw_fee', 0, '{$half_fee}', 'out', NOW())");
            }

            if ($house_fee > 0) {
                $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES (1, 'arena_platform_fee', 0, '{$house_fee}', 'in', NOW())");
            }
        }
    } else {
        // Partida oficial classificada da Arena (premiação oficial de vitória e registro de combate)
        if ($is_win) {
            $win_bonus = 200.0; // 200 Kz de bônus oficial de vitória na Arena
            $db->query("UPDATE users SET user_wallet_balance = user_wallet_balance + {$win_bonus} WHERE user_id = {$uid}");
            $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES ({$uid}, 'arena_win', 0, '{$win_bonus}', 'in', NOW())");
        } elseif ($is_loss && $is_forfeit) {
            $forfeit_penalty = 100.0;
            $db->query("UPDATE users SET user_wallet_balance = GREATEST(0, user_wallet_balance - {$forfeit_penalty}) WHERE user_id = {$uid}");
            $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES ({$uid}, 'arena_forfeit', 0, '{$forfeit_penalty}', 'out', NOW())");
        }
    }

    // 2. Atualizar Perfil Competitivo na Arena (Pontos, Vitórias, Sequência)
    if ($is_win) {
        $db->query("UPDATE arena_profiles SET 
            total_matches = total_matches + 1,
            total_wins = total_wins + 1,
            competitive_points = competitive_points + 25,
            current_streak = current_streak + 1,
            max_streak = GREATEST(max_streak, current_streak),
            last_active = NOW()
            WHERE user_id = {$uid}");
    } elseif ($is_loss) {
        $db->query("UPDATE arena_profiles SET 
            total_matches = total_matches + 1,
            total_losses = total_losses + 1,
            competitive_points = GREATEST(100, competitive_points - 15),
            current_streak = 0,
            last_active = NOW()
            WHERE user_id = {$uid}");
    } else {
        $db->query("UPDATE arena_profiles SET 
            total_matches = total_matches + 1,
            total_draws = total_draws + 1,
            competitive_points = competitive_points + 5,
            last_active = NOW()
            WHERE user_id = {$uid}");
    }

    // 3. Registrar Partida na Tabela arena_matches
    $winner_id = $is_win ? $uid : ($is_loss ? $opp_id : 0);
    $pts = $is_win ? 25 : ($is_loss ? -15 : 5);
    $match_room = !empty($token) ? $token : ('room_' . substr(md5(uniqid()), 0, 8));
    $db->query("INSERT INTO arena_matches 
        (room_id, game_type, player1_id, player1_is_bot, player2_id, player2_is_bot, winner_id, is_draw, duration_seconds, is_ranked, points_awarded) 
        VALUES 
        ('{$db->real_escape_string($match_room)}', '{$db->real_escape_string($game_key)}', {$uid}, 0, {$opp_id}, {$is_bot}, {$winner_id}, " . ($is_draw ? 1 : 0) . ", 60, 1, {$pts})");

    if (!empty($token)) {
        $db->query("UPDATE arena_challenges SET status = 'completed', platform_fee_amount = {$house_fee} WHERE challenge_token = '{$db->real_escape_string($token)}'");
    }
    // Liberar trava de partida ativa na sessão
    unset($_SESSION['arena_active_match']);

    // 4. Obter Novo Saldo Atualizado
    $new_balance = 0.0;
    $q_new = $db->query("SELECT user_wallet_balance FROM users WHERE user_id = {$uid} LIMIT 1");
    if ($q_new && $q_new->num_rows > 0) {
        $new_balance = (float)$q_new->fetch_assoc()['user_wallet_balance'];
    }

    echo json_encode([
        'status' => 'ok',
        'result' => $result,
        'points_awarded' => $pts,
        'bet_amount' => $bet_amount,
        'total_pot' => $total_pot,
        'platform_fee_percent' => $platform_fee_pct,
        'platform_fee_amount' => $house_fee,
        'winner_net_prize' => $winner_net_prize,
        'net_win_profit' => $net_win_profit,
        'new_balance' => $new_balance,
        'message' => $is_win 
            ? 'Vitória confirmada! ' . ($bet_amount > 0 ? '+' . number_format($net_win_profit, 0, ',', '.') . ' Kz líquidos creditados na sua carteira (Taxa da plataforma de ' . $platform_fee_pct . '% descontada).' : '') 
            : ($is_draw 
                ? 'Empate no duelo! O valor da sua aposta foi reembolsado com sucesso (apenas a taxa de serviço de ' . ($platform_fee_pct / 2) . '% foi aplicada).'
                : ($is_forfeit ? 'Derrota por W.O. computada.' : 'Combate finalizado.'))
    ]);
    exit;
}

// 14. REGRA DE DESISTÊNCIA / W.O. (PERDA IMEDIATA DO DINHEIRO E DERROTA COMPUTADA)
if ($action === 'forfeit_match') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $token = trim($input['challenge_token'] ?? ($input['token'] ?? ($_GET['token'] ?? '')));
    $bet_amount = max(0, (float)($input['bet_amount'] ?? ($_GET['bet_amount'] ?? 0)));
    $uid = $logged_user ? (int)$logged_user['user_id'] : (int)($input['user_id'] ?? 0);
    $game_key = trim($input['game_type'] ?? ($input['game'] ?? 'hyperstrike'));

    if ($uid <= 0) {
        unset($_SESSION['arena_active_match']);
        // Modo Demo / Convidado: permitir desistir com sucesso imediato sem erro
        echo json_encode([
            'status' => 'ok',
            'is_demo' => true,
            'forfeited' => true,
            'bet_lost' => 0,
            'new_balance' => 0,
            'formatted_balance' => '0,00 Kz',
            'message' => 'Você desistiu do combate no Modo Treino.'
        ]);
        exit;
    }

    $opponent_id = 0;
    $is_opponent_bot = 1;

    // Buscar dados do desafio se houver token
    if (!empty($token)) {
        $chk = $db->query("SELECT * FROM arena_challenges WHERE challenge_token = '{$db->real_escape_string($token)}' LIMIT 1");
        if ($chk && $chk->num_rows > 0) {
            $c = $chk->fetch_assoc();
            $bet_amount = (float)($c['bet_amount'] ?: $bet_amount);
            $is_challenger = ($uid == (int)$c['challenger_id']);
            $opponent_id = $is_challenger ? (int)$c['challenged_id'] : (int)$c['challenger_id'];
            $is_opponent_bot = (int)$c['is_bot'];
            $game_key = $c['game_type'];
        }
    }

    $platform_fee_pct = get_arena_platform_fee_percent($db);
    $total_pot = $bet_amount * 2;
    $house_fee = round(($total_pot * $platform_fee_pct) / 100, 2);
    $net_win_profit = ($total_pot - $house_fee) - $bet_amount;

    // 1. Debitar carteira real do jogador desistente (tabela users e wallet_transactions)
    if ($bet_amount > 0) {
        $db->query("UPDATE users SET user_wallet_balance = GREATEST(0, user_wallet_balance - {$bet_amount}) WHERE user_id = {$uid}");
        $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES ({$uid}, 'arena_forfeit', 0, '{$bet_amount}', 'out', NOW())");

        // Beneficiar oponente se for humano real
        if ($opponent_id > 0 && !$is_opponent_bot) {
            $db->query("UPDATE users SET user_wallet_balance = user_wallet_balance + {$net_win_profit} WHERE user_id = {$opponent_id}");
            $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES ({$opponent_id}, 'arena_win', 0, '{$net_win_profit}', 'in', NOW())");
            if ($house_fee > 0) {
                $db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) VALUES (1, 'arena_platform_fee', 0, '{$house_fee}', 'in', NOW())");
            }
        }
    }

    // 2. Penalizar perfil competitivo por W.O.
    $db->query("UPDATE arena_profiles SET 
        total_matches = total_matches + 1,
        total_losses = total_losses + 1,
        competitive_points = GREATEST(100, competitive_points - 15),
        current_streak = 0,
        last_active = NOW()
        WHERE user_id = {$uid}");

    if ($opponent_id > 0 && !$is_opponent_bot) {
        $db->query("UPDATE arena_profiles SET 
            total_matches = total_matches + 1,
            total_wins = total_wins + 1,
            competitive_points = competitive_points + 25,
            current_streak = current_streak + 1,
            last_active = NOW()
            WHERE user_id = {$opponent_id}");
    }

    // 3. Registrar partida finalizada por W.O.
    $match_room = !empty($token) ? $token : ('room_' . substr(md5(uniqid()), 0, 8));
    $db->query("INSERT INTO arena_matches 
        (room_id, game_type, player1_id, player1_is_bot, player2_id, player2_is_bot, winner_id, is_draw, duration_seconds, is_ranked, points_awarded) 
        VALUES 
        ('{$db->real_escape_string($match_room)}', '{$db->real_escape_string($game_key)}', {$uid}, 0, {$opponent_id}, {$is_opponent_bot}, {$opponent_id}, 0, 10, 1, -15)");

    if (!empty($token)) {
        $db->query("UPDATE arena_challenges SET status = 'forfeited', platform_fee_amount = {$house_fee} WHERE challenge_token = '{$db->real_escape_string($token)}'");
    }
    // Liberar trava de partida ativa na sessão
    unset($_SESSION['arena_active_match']);

    // Obter saldo final
    $new_balance = 0.0;
    $q_new = $db->query("SELECT user_wallet_balance FROM users WHERE user_id = {$uid} LIMIT 1");
    if ($q_new && $q_new->num_rows > 0) {
        $new_balance = (float)$q_new->fetch_assoc()['user_wallet_balance'];
    }

    echo json_encode([
        'status' => 'ok',
        'forfeited' => true,
        'bet_lost' => $bet_amount,
        'platform_fee_amount' => $house_fee,
        'new_balance' => $new_balance,
        'formatted_balance' => number_format($new_balance, 2, ',', '.') . ' Kz',
        'message' => 'Desistência registrada por W.O.! ' . ($bet_amount > 0 ? 'O valor de ' . number_format($bet_amount, 0, ',', '.') . ' Kz foi debitado da sua carteira.' : '')
    ]);
    exit;
}

// 15. SINCRONIZAÇÃO EM TEMPO REAL ENTRE DISPOSITIVOS (P2P REAL / MULTI-DEVICE ARBITRATION)
if ($action === 'match_sync') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) $input = $_POST;

    $token = trim($input['challenge_token'] ?? ($input['token'] ?? ($_GET['token'] ?? '')));
    $role = trim($input['role'] ?? ($_GET['role'] ?? 'challenger'));
    $my_score = isset($input['score']) ? (int)$input['score'] : -1;
    $my_ready = isset($input['ready']) ? (int)$input['ready'] : 0;
    $uid = $logged_user ? (int)$logged_user['user_id'] : 0;

    if (empty($token)) {
        echo json_encode(['status' => 'error', 'message' => 'Token do duelo não informado']);
        exit;
    }

    $q = $db->query("SELECT * FROM arena_challenges WHERE challenge_token = '{$db->real_escape_string($token)}' LIMIT 1");
    if (!$q || $q->num_rows === 0) {
        echo json_encode(['status' => 'error', 'message' => 'Duelo não encontrado']);
        exit;
    }

    $c = $q->fetch_assoc();

    // Se o adversário for Bot do sistema, ele já entra automaticamente marcado como pronto
    if ((int)$c['is_bot'] === 1 && (int)$c['challenged_ready'] === 0) {
        $db->query("UPDATE arena_challenges SET challenged_ready = 1, challenged_last_ping = NOW() WHERE challenge_token = '{$db->real_escape_string($token)}'");
        $c['challenged_ready'] = 1;
    }

    // Atualizar status e placar de quem chamou a sincronização
    if ($role === 'challenger') {
        $updates = ["challenger_last_ping = NOW()"];
        if ($my_ready > 0) {
            $updates[] = "challenger_ready = 1";
            $c['challenger_ready'] = 1;
        }
        if ($my_score >= 0) {
            $updates[] = "challenger_score = {$my_score}";
            $c['challenger_score'] = $my_score;
        }
        $db->query("UPDATE arena_challenges SET " . implode(', ', $updates) . " WHERE challenge_token = '{$db->real_escape_string($token)}'");
        $opp_ready = (int)$c['challenged_ready'];
        $opp_score = (int)$c['challenged_score'];
        $opp_ping = $c['challenged_last_ping'];
    } else {
        $updates = ["challenged_last_ping = NOW()"];
        if ($my_ready > 0) {
            $updates[] = "challenged_ready = 1";
            $c['challenged_ready'] = 1;
        }
        if ($my_score >= 0) {
            $updates[] = "challenged_score = {$my_score}";
            $c['challenged_score'] = $my_score;
        }
        $db->query("UPDATE arena_challenges SET " . implode(', ', $updates) . " WHERE challenge_token = '{$db->real_escape_string($token)}'");
        $opp_ready = (int)$c['challenger_ready'];
        $opp_score = (int)$c['challenger_score'];
        $opp_ping = $c['challenger_last_ping'];
    }

    // Quando ambos estão prontos, definir match_start_time se ainda não definido
    $start_time = (int)$c['match_start_time'];
    $both_ready = ((int)$c['challenger_ready'] === 1 && (int)$c['challenged_ready'] === 1);

    if ($both_ready && $start_time <= 0) {
        $start_time = time() + 3; // 3 segundos para contagem sincronizada 3..2..1..GO
        $db->query("UPDATE arena_challenges SET match_start_time = {$start_time} WHERE challenge_token = '{$db->real_escape_string($token)}'");
    }

    $opp_idle = $opp_ping ? max(0, time() - strtotime($opp_ping)) : 0;
    $server_now = time();
    $countdown_rem = max(0, $start_time - $server_now);

    echo json_encode([
        'status' => 'ok',
        'match_status' => $c['status'],
        'role' => $role,
        'both_ready' => $both_ready,
        'my_ready' => ($role === 'challenger' ? (int)$c['challenger_ready'] : (int)$c['challenged_ready']),
        'opp_ready' => $opp_ready,
        'my_score' => ($role === 'challenger' ? (int)$c['challenger_score'] : (int)$c['challenged_score']),
        'opp_score' => $opp_score,
        'match_start_time' => $start_time,
        'server_time' => $server_now,
        'countdown_remaining' => $countdown_rem,
        'opp_idle_seconds' => $opp_idle
    ]);
    exit;
}

// ==========================================
// AÇÕES DO MOTOR DE INTELIGÊNCIA ARTIFICIAL (OPENROUTER AI)
// ==========================================
require_once(__DIR__ . '/includes/ArenaAIEngine.php');

if ($action === 'ai_test_connection') {
    $res = ArenaAIEngine::testConnection($db);
    echo json_encode($res, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'get_bot_thought') {
    $bot_id = (int)($_REQUEST['bot_id'] ?? 0);
    $opp_name = trim($_REQUEST['opp_name'] ?? 'Adversário');
    $game_type = trim($_REQUEST['game'] ?? 'mkjs');
    $bet_amount = (float)($_REQUEST['bet_amount'] ?? 0);

    $bot = null;
    if ($bot_id > 0) {
        $q = $db->query("SELECT * FROM arena_bots WHERE id = {$bot_id} LIMIT 1");
        if ($q && $q->num_rows > 0) {
            $bot = $q->fetch_assoc();
        }
    }
    if (!$bot) {
        $bot = [
            'id' => 1,
            'bot_tag' => 'BOT_ARENA_MESTRE',
            'play_style' => 'balanced',
            'difficulty' => 'hard',
            'target_winrate' => 75
        ];
    }

    $strategy = ArenaAIEngine::generateBotStrategy($bot, $opp_name, $game_type, $bet_amount, $db);
    echo json_encode([
        'status' => 'success',
        'data' => $strategy
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'ai_get_recent_thoughts') {
    $limit = min(50, max(1, (int)($_GET['limit'] ?? 15)));
    $thoughts = ArenaAIEngine::getRecentThoughts($limit, $db);
    echo json_encode([
        'status' => 'success',
        'thoughts' => $thoughts
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}


// ==========================================
// AÇÕES DO CHAT DE SUPORTE AO VIVO (UTILIZADOR <-> ADMIN)
// ==========================================
if ($action === 'support_get_messages') {
    if (!$logged_user) {
        echo json_encode(['status' => 'error', 'message' => 'Não autenticado']);
        exit;
    }
    $my_uid = (int)$logged_user['user_id'];
    $is_adm = arena_is_admin();
    $target_uid = $is_adm ? (int)($_GET['target_user_id'] ?? 0) : $my_uid;

    $conversations = [];
    if ($is_adm) {
        $q_conv = $db->query("
            SELECT m.user_id,
                   MAX(m.gamer_tag) AS gamer_tag,
                   MAX(m.user_avatar) AS user_avatar,
                   MAX(m.created_at) AS last_time,
                   SUM(CASE WHEN m.sender_role = 'user' AND m.is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
                   (SELECT message FROM arena_support_messages m2 WHERE m2.user_id = m.user_id ORDER BY m2.id DESC LIMIT 1) AS last_message,
                   u.user_wallet_balance
            FROM arena_support_messages m
            LEFT JOIN users u ON u.user_id = m.user_id
            GROUP BY m.user_id
            ORDER BY last_time DESC
            LIMIT 50
        ");
        if ($q_conv) {
            while ($rc = $q_conv->fetch_assoc()) {
                $rc['wallet_balance'] = number_format((float)($rc['user_wallet_balance'] ?? 0), 0, ',', '.');
                $conversations[] = $rc;
            }
        }
    }

    $messages = [];
    if ($target_uid > 0) {
        // Marcar como lidas as mensagens da outra parte
        if ($is_adm) {
            $db->query("UPDATE arena_support_messages SET is_read = 1 WHERE user_id = {$target_uid} AND sender_role = 'user'");
        } else {
            $db->query("UPDATE arena_support_messages SET is_read = 1 WHERE user_id = {$my_uid} AND sender_role = 'admin'");
        }

        $q_m = $db->query("SELECT * FROM arena_support_messages WHERE user_id = {$target_uid} ORDER BY id ASC LIMIT 120");
        if ($q_m) {
            while ($rm = $q_m->fetch_assoc()) {
                $rm['message_html'] = nl2br(htmlspecialchars($rm['message']));
                $rm['time_formatted'] = date('d/m H:i', strtotime($rm['created_at']));
                $messages[] = $rm;
            }
        }
    }

    echo json_encode([
        'status' => 'ok',
        'messages' => $messages,
        'conversations' => $conversations
    ]);
    exit;
}

if ($action === 'support_send_message') {
    if (!$logged_user) {
        echo json_encode(['status' => 'error', 'message' => 'Inicie sessão para usar o suporte.']);
        exit;
    }
    $my_uid = (int)$logged_user['user_id'];
    $is_adm = arena_is_admin();
    $msg = trim($_POST['message'] ?? '');
    if ($msg === '') {
        echo json_encode(['status' => 'error', 'message' => 'Mensagem vazia.']);
        exit;
    }

    $target_uid = $is_adm ? (int)($_POST['target_user_id'] ?? 0) : $my_uid;
    if ($target_uid <= 0) {
        $target_uid = $my_uid;
    }

    $role = $is_adm ? 'admin' : 'user';
    // Buscar dados do utilizador dono da conversa
    $u_tag = $gamer_profile['gamer_tag'] ?? ($logged_user['fullname'] ?: $logged_user['user_name']);
    $u_av = $logged_user['avatar'] ?? '';
    if ($is_adm && $target_uid !== $my_uid) {
        $qu = $db->query("SELECT p.gamer_tag, u.user_name, u.user_picture FROM users u LEFT JOIN arena_profiles p ON p.user_id = u.user_id WHERE u.user_id = {$target_uid} LIMIT 1");
        if ($qu && $qu->num_rows > 0) {
            $ru = $qu->fetch_assoc();
            $u_tag = $ru['gamer_tag'] ?: $ru['user_name'];
            $u_av = $ru['user_picture'] ?: '';
        }
    }

    $tag_esc = $db->real_escape_string($u_tag);
    $av_esc = $db->real_escape_string($u_av);
    $msg_esc = $db->real_escape_string($msg);

    // Verificar se é a 1ª mensagem do utilizador para enviar confirmação automática imediata
    $chk_first = 0;
    if ($role === 'user') {
        $qf = $db->query("SELECT COUNT(*) FROM arena_support_messages WHERE user_id = {$target_uid}");
        $chk_first = $qf ? (int)$qf->fetch_row()[0] : 0;
    }

    $db->query("INSERT INTO arena_support_messages (user_id, gamer_tag, user_avatar, sender_role, message, is_read, created_at) 
                VALUES ({$target_uid}, '{$tag_esc}', '{$av_esc}', '{$role}', '{$msg_esc}', 0, NOW())");

    if ($role === 'user' && $chk_first === 0) {
        $welcome_msg = $db->real_escape_string("Olá {$u_tag}! Recebemos a sua mensagem no Suporte da Arena. O Administrador já foi notificado e responderá aqui mesmo no chat em instantes.");
        $db->query("INSERT INTO arena_support_messages (user_id, gamer_tag, user_avatar, sender_role, message, is_read, created_at) 
                    VALUES ({$target_uid}, '{$tag_esc}', '{$av_esc}', 'admin', '{$welcome_msg}', 0, NOW())");
    }

    echo json_encode(['status' => 'ok']);
    exit;
}

// Marcar Notificações do Utilizador como Lidas
if ($action === 'mark_notifications_read') {
    if (!$logged_user) {
        echo json_encode(['status' => 'error', 'message' => 'Não autenticado']);
        exit;
    }
    $my_uid = (int)$logged_user['user_id'];
    $db->query("UPDATE arena_notifications SET is_read = 1 WHERE user_id = {$my_uid}");
    echo json_encode(['status' => 'ok']);
    exit;
}

echo json_encode(['status' => 'error', 'message' => 'Ação não reconhecida']);
exit;


