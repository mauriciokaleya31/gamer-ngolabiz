<?php
/**
 * CASINO56 ARENA - MOTOR AUTÔNOMO 24 HORAS DE DUELOS ENTRE BOTS INTELIGENTES
 * Simula combates ao vivo entre combatentes de Angola nos 5 jogos oficiais,
 * faz a gestão do ciclo de vida dos bots (available, in_battle, cooldown),
 * mantém batalhas ativas na arena e alimenta o feed oficial de resultados e vitórias.
 */

if (php_sapi_name() !== 'cli' && !defined('ARENA_AUTORUN')) {
    header('Content-Type: application/json; charset=utf-8');
}

require_once(__DIR__ . '/init.php');

date_default_timezone_set('Africa/Luanda');

function run_arena_battle_round($db) {
    global $ARENA_GAMES;

    // 1. Catálogo dos 5 Jogos Oficiais da Arena Casino56
    $games_catalog = [
        'hyperstrike' => ['name' => 'HYPER-STRIKE', 'icon' => 'fa-bolt'],
        'neon-fist'   => ['name' => 'Neon Fist', 'icon' => 'fa-hand-fist'],
        'mkjs'        => ['name' => 'MK.js Kombat', 'icon' => 'fa-skull'],
        'card-duel'   => ['name' => 'Duelo de Cartas 1v1', 'icon' => 'fa-layer-group'],
        'rps-battle'  => ['name' => 'Pedra Papel Tesoura 1v1', 'icon' => 'fa-hand-back-fist']
    ];

    $bet_amounts = [500, 1000, 2000, 2500, 5000, 10000, 15000];

    // 1.1 Liberar bots em cooldown que já aguardaram pelo menos 25 segundos
    $db->query("UPDATE arena_bots SET status = 'available', current_challenge_id = NULL, last_status_change = NOW() 
                WHERE status = 'cooldown' AND last_status_change <= DATE_SUB(NOW(), INTERVAL 25 SECOND)");

    // 1.2 Limpar desafios órfãos ou expirados e liberar seus bots
    $db->query("UPDATE arena_challenges SET status = 'expired' WHERE status IN ('pending', 'waiting') AND expires_at < NOW()");
    $db->query("UPDATE arena_bots b 
                LEFT JOIN arena_challenges c ON b.current_challenge_id = c.id 
                SET b.status = 'available', b.current_challenge_id = NULL 
                WHERE b.status IN ('proposal_pending', 'in_battle') AND (c.id IS NULL OR c.status IN ('completed', 'expired', 'declined'))");

    // 2. Finalizar duelos de bots que já completaram o tempo de combate (45 a 75 segundos)
    $q_finished = $db->query("SELECT * FROM arena_challenges 
        WHERE is_bot = 1 AND status = 'accepted' AND accepted_at <= DATE_SUB(NOW(), INTERVAL 45 SECOND) 
        ORDER BY id ASC LIMIT 5");

    if ($q_finished && $q_finished->num_rows > 0) {
        $platform_fee_pct = function_exists('get_arena_platform_fee_percent') ? get_arena_platform_fee_percent($db) : 10.0;

        while ($match = $q_finished->fetch_assoc()) {
            $m_id = (int)$match['id'];
            $g_type = $match['game_type'];
            $b_amt = max(500, (int)$match['bet_amount']);
            $pot = $b_amt * 2;
            $fee_val = round(($pot * $platform_fee_pct) / 100, 2);
            $prize = (int)($pot - $fee_val);

            // Alternância justa baseada em winrate e sorte
            $winner_is_challenger = (mt_rand(1, 100) > 48);
            if ($winner_is_challenger) {
                $w_id = (int)$match['challenger_id'];
                $w_name = $match['challenger_tag'];
                $w_av = $match['challenger_avatar'];
                $w_prov = $match['challenger_province'];

                $l_id = (int)$match['challenged_id'];
                $l_name = $match['challenged_tag'];
                $l_av = $match['challenged_avatar'];
                $l_prov = $match['challenged_province'];
            } else {
                $w_id = (int)$match['challenged_id'];
                $w_name = $match['challenged_tag'];
                $w_av = $match['challenged_avatar'];
                $w_prov = $match['challenged_province'];

                $l_id = (int)$match['challenger_id'];
                $l_name = $match['challenger_tag'];
                $l_av = $match['challenger_avatar'];
                $l_prov = $match['challenger_province'];
            }

            $is_private = (mt_rand(1, 100) <= 20) ? 1 : 0;
            $game_name_label = $games_catalog[$g_type]['name'] ?? 'Duelo 1v1 Arena';

            // Inserir no histórico de vitórias ao vivo da Arena
            $db->query("INSERT INTO arena_live_wins 
                (winner_id, winner_name, winner_avatar, winner_province, winner_is_bot,
                 loser_id, loser_name, loser_avatar, loser_province, loser_is_bot,
                 is_private, game_type, game_name, bet_amount, prize_won, profit_amount, is_win, created_at)
                VALUES 
                ({$w_id}, '{$db->real_escape_string($w_name)}', '{$db->real_escape_string($w_av)}', '{$db->real_escape_string($w_prov)}', 1,
                 {$l_id}, '{$db->real_escape_string($l_name)}', '{$db->real_escape_string($l_av)}', '{$db->real_escape_string($l_prov)}', 1,
                 {$is_private}, '{$g_type}', '{$db->real_escape_string($game_name_label)}', {$b_amt}, {$prize}, " . ($prize - $b_amt) . ", 1, NOW())");

            // Inserir na tabela oficial de auditoria de partidas da Arena (arena_matches)
            $db->query("INSERT INTO arena_matches 
                (room_id, game_type, player1_id, player1_tag, player1_is_bot, 
                 player2_id, player2_tag, player2_is_bot, winner_id, winner_tag, winner_is_bot, 
                 is_draw, is_ranked, bet_amount, prize_pool, platform_fee, duration_seconds, played_at)
                VALUES 
                ('{$match['challenge_token']}', '{$g_type}', {$match['challenger_id']}, '{$db->real_escape_string($match['challenger_tag'])}', 1,
                 {$match['challenged_id']}, '{$db->real_escape_string($match['challenged_tag'])}', 1, {$w_id}, '{$db->real_escape_string($w_name)}', 1,
                 0, 1, {$b_amt}, {$pot}, {$fee_val}, 55, NOW())");

            // Marcar duelo como concluído
            $db->query("UPDATE arena_challenges SET status = 'completed' WHERE id = {$m_id}");

            // Mudar status dos bots para cooldown (evitando repetição imediata)
            $db->query("UPDATE arena_bots SET status = 'cooldown', current_challenge_id = NULL, last_status_change = NOW(), 
                        total_matches = total_matches + 1, total_wins = total_wins + 1 WHERE id = {$w_id}");
            $db->query("UPDATE arena_bots SET status = 'cooldown', current_challenge_id = NULL, last_status_change = NOW(), 
                        total_matches = total_matches + 1, total_losses = total_losses + 1 WHERE id = {$l_id}");
        }
    }

    // 3. Obter bots disponíveis da tabela arena_bots (status available e is_active = 1)
    $q_bots = $db->query("SELECT * FROM arena_bots WHERE is_active = 1 AND (status = 'available' OR status IS NULL) ORDER BY RAND() LIMIT 20");
    $bots = [];
    if ($q_bots && $q_bots->num_rows >= 2) {
        while ($b = $q_bots->fetch_assoc()) {
            $bots[] = $b;
        }
    }

    // 4. Manter entre 3 a 5 Duelos Ao Vivo Ativos em andamento (status = 'accepted')
    $active_count_q = $db->query("SELECT COUNT(*) FROM arena_challenges WHERE is_bot = 1 AND status = 'accepted' AND accepted_at >= DATE_SUB(NOW(), INTERVAL 90 SECOND)");
    $active_count = (int)($active_count_q ? $active_count_q->fetch_row()[0] : 0);

    if ($active_count < 4 && count($bots) >= 2) {
        $needed = 4 - $active_count;
        shuffle($bots);

        for ($i = 0; $i < $needed; $i++) {
            if (count($bots) < 2) break;
            $bot1 = array_shift($bots);
            $bot2 = array_shift($bots);

            $g_keys = array_keys($games_catalog);
            $c_game = $g_keys[array_rand($g_keys)];
            $c_bet = $bet_amounts[array_rand($bet_amounts)];
            $token = 'bot_vs_' . bin2hex(random_bytes(10));

            $b1_tag = $db->real_escape_string($bot1['fullname'] ?: $bot1['bot_tag']);
            $b1_av = $db->real_escape_string($bot1['avatar_url'] ?: $bot1['avatar']);
            $b1_pr = $db->real_escape_string($bot1['province'] ?: 'Luanda');
            $b1_id = (int)$bot1['id'];

            $b2_tag = $db->real_escape_string($bot2['fullname'] ?: $bot2['bot_tag']);
            $b2_av = $db->real_escape_string($bot2['avatar_url'] ?: $bot2['avatar']);
            $b2_pr = $db->real_escape_string($bot2['province'] ?: 'Benguela');
            $b2_id = (int)$bot2['id'];

            // Inserir combate ativo entre os dois bots com rodadas reais
            $ins = $db->query("INSERT INTO arena_challenges 
                (challenge_token, game_type, challenger_id, challenger_tag, challenger_avatar, challenger_province,
                 challenged_id, challenged_tag, challenged_avatar, challenged_province, is_bot, bot_id, bot_difficulty,
                 bet_amount, current_round, total_rounds, status, created_at, expires_at, accepted_at, challenger_last_ping, challenged_last_ping)
                VALUES 
                ('{$token}', '{$c_game}', {$b1_id}, '{$b1_tag}', '{$b1_av}', '{$b1_pr}',
                 {$b2_id}, '{$b2_tag}', '{$b2_av}', '{$b2_pr}', 1, {$b2_id}, 'hard',
                 {$c_bet}, 1, 3, 'accepted', NOW(), DATE_ADD(NOW(), INTERVAL 5 MINUTE), NOW(), NOW(), NOW())");

            if ($ins) {
                $match_id = $db->insert_id;
                // Marcar ambos os bots em batalha (in_battle) com concurrency lock
                $db->query("UPDATE arena_bots SET status = 'in_battle', current_challenge_id = {$match_id}, last_status_change = NOW() WHERE id IN ({$b1_id}, {$b2_id})");
            }
        }
    }

    return [
        'status' => 'ok',
        'active_bot_matches' => $active_count,
        'available_bots' => count($bots)
    ];
}

$result = run_arena_battle_round($db);

if (php_sapi_name() === 'cli' || defined('ARENA_AUTORUN')) {
    return $result;
} else {
    echo json_encode($result);
    exit;
}
