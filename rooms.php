<?php
/**
 * NGOLABIZ ARENA - SALAS DE JOGO & MATCHMAKING
 * Salas Públicas, Entrada por Código e Treino com Bots
 */
require_once(__DIR__ . '/init.php');

$error = '';
$success = '';

// Criar Sala
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'create_room') {
    if (!$logged_user) {
        header('Location: ' . GAMER_URL . '/auth.php?redirect=' . urlencode(GAMER_URL . '/rooms.php'));
        exit;
    }

    $room_name = trim($_POST['room_name'] ?? '');
    $game_type = trim($_POST['game_type'] ?? 'hyperstrike');
    $match_mode = trim($_POST['match_mode'] ?? 'human');

    if (empty($room_name)) {
        $room_name = 'Sala de ' . ($gamer_profile['gamer_tag'] ?? 'Gamer');
    }
    if (!array_key_exists($game_type, $ARENA_GAMES)) {
        $game_type = 'hyperstrike';
    }

    $room_code = strtoupper(substr(md5(uniqid(rand(), true)), 0, 6));
    $room_id = 'room_' . time() . '_' . rand(1000, 9999);
    $uid = (int)$logged_user['user_id'];
    $u_name = $gamer_profile['gamer_tag'] ?? $logged_user['user_name'];
    $u_avatar = $logged_user['avatar'];
    $u_frame = $gamer_profile['selected_frame'] ?? 'bronze';

    if ($match_mode === 'bot') {
        header("Location: " . GAMER_URL . "/play.php?game={$game_type}&mode=ai");
        exit;
    } else {
        $ins = $db->query("INSERT INTO arena_rooms 
            (room_id, room_code, game_type, room_name, host_user_id, host_name, host_avatar, host_frame, status, is_training) 
            VALUES 
            ('{$room_id}', '{$room_code}', '{$game_type}', '{$db->real_escape_string($room_name)}', {$uid}, '{$db->real_escape_string($u_name)}', '{$db->real_escape_string($u_avatar)}', '{$u_frame}', 'waiting', 0)");

        if ($ins) {
            header("Location: " . GAMER_URL . "/play.php?room={$room_code}&game={$game_type}");
            exit;
        } else {
            $error = 'Erro ao criar sala. Tente novamente.';
        }
    }
}

// Entrar por Código
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'join_by_code') {
    $code = strtoupper(trim($_POST['room_code'] ?? ''));
    $chk = $db->query("SELECT * FROM arena_rooms WHERE room_code = '{$db->real_escape_string($code)}' AND status = 'waiting' LIMIT 1");
    if ($chk && $chk->num_rows > 0) {
        $r = $chk->fetch_assoc();
        header("Location: " . GAMER_URL . "/play.php?room={$r['room_code']}&game={$r['game_type']}");
        exit;
    } else {
        $error = 'Código de sala inválido ou partida já em andamento.';
    }
}

$page_title = 'Salas & Treino';
require_once(__DIR__ . '/header.php');

$rooms = [];
$res = $db->query("SELECT * FROM arena_rooms WHERE status = 'waiting' ORDER BY created_at DESC LIMIT 24");
if ($res) {
    while ($r = $res->fetch_assoc()) {
        $rooms[] = $r;
    }
}
?>

<main class="arena-page-body">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
        <div>
            <h1 style="font-size: 1.7rem; font-weight: 800; color: #fff; font-family: var(--font-gamer);">SALAS DE JOGO & COMBATE</h1>
            <p style="color: var(--text-muted); font-size: 0.9rem;">Crie uma sala personalizada com código ou enfrente desafiantes online nos jogos oficiais.</p>
        </div>
        <button type="button" class="btn-launch-hero" onclick="document.getElementById('modal-create-room').classList.add('active')">
            <i class="fa-solid fa-plus"></i> Criar Nova Sala
        </button>
    </div>

    <?php if (!empty($error)): ?>
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid var(--neon-red); color: #fecaca; padding: 12px 18px; border-radius: 10px; margin-bottom: 20px;">
            <i class="fa-solid fa-triangle-exclamation"></i> <?php echo htmlspecialchars($error); ?>
        </div>
    <?php endif; ?>

    <!-- Entrada Rápida por Código -->
    <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 20px 24px; margin-bottom: 20px;">
        <form method="POST" style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap;">
            <input type="hidden" name="action" value="join_by_code">
            <div style="flex-grow: 1; min-width: 240px;">
                <input type="text" name="room_code" placeholder="DIGITE O CÓDIGO DA SALA (EX: AB12CD)" maxlength="6" required style="width: 100%; background: #121722; border: 1px solid var(--border-subtle); border-radius: 10px; padding: 12px 16px; color: #fff; text-transform: uppercase; font-family: var(--font-gamer); font-size: 1rem; letter-spacing: 2px;">
            </div>
            <button type="submit" class="btn-launch-hero" style="padding: 12px 22px; background: var(--bg-surface); border: 1px solid var(--border-subtle); color: #fff;">
                <i class="fa-solid fa-arrow-right-to-bracket"></i> Entrar por Código
            </button>
        </form>
    </div>

    <!-- Lista de Salas Abertas na Rede -->
    <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 20px 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle);">
            <div style="font-size: 1.1rem; font-weight: 800; font-family: var(--font-gamer); color: #fff;">
                <i class="fa-solid fa-door-open" style="color: var(--neon-cyan);"></i> Salas Aguardando Desafiante
            </div>
            <span style="font-size: 0.82rem; color: var(--text-dim);"><?php echo count($rooms); ?> salas disponíveis</span>
        </div>

        <?php if (!empty($rooms)): ?>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                <?php foreach ($rooms as $rm): 
                    $g = $ARENA_GAMES[$rm['game_type']] ?? ['name' => 'Jogo', 'icon' => 'fa-gamepad', 'tag_color' => '#06b6d4'];
                ?>
                <div style="background: #121722; border: 1px solid var(--border-subtle); border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center; transition: transform 0.2s, border-color 0.2s;">
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 0.98rem; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid <?php echo $g['icon']; ?>" style="color: <?php echo $g['tag_color'] ?? 'var(--neon-cyan)'; ?>;"></i>
                            <?php echo htmlspecialchars($rm['room_name']); ?>
                        </div>
                        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">
                            Host: <strong style="color: #cbd5e1;"><?php echo htmlspecialchars($rm['host_name']); ?></strong>
                        </div>
                        <div style="font-size: 0.72rem; color: var(--neon-gold); margin-top: 2px;">
                            Código: #<strong><?php echo htmlspecialchars($rm['room_code']); ?></strong>
                        </div>
                    </div>
                    <a href="<?php echo GAMER_URL; ?>/play.php?room=<?php echo urlencode($rm['room_code']); ?>&game=<?php echo urlencode($rm['game_type']); ?>" class="btn-launch-hero" style="padding: 8px 16px; font-size: 0.85rem; text-decoration: none;">
                        Entrar
                    </a>
                </div>
                <?php endforeach; ?>
            </div>
        <?php else: ?>
            <div style="text-align: center; padding: 45px 20px; color: var(--text-muted);">
                <div style="font-size: 2.2rem; color: var(--text-dim); margin-bottom: 10px;">⚔️</div>
                <strong style="color: #fff; font-size: 1rem; display: block; margin-bottom: 4px;">Nenhuma sala aberta no momento</strong>
                Crie sua sala personalizada e convide um amigo ou desafiante para uma partida rápida!
            </div>
        <?php endif; ?>
    </div>
</main>

<!-- Modal Criar Sala -->
<div class="modal-over-overlay" id="modal-create-room">
    <div class="modal-over-card" style="text-align: left; max-width: 480px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
            <h3 style="font-size: 1.25rem; font-weight: 800; color: #fff; font-family: var(--font-gamer);"><i class="fa-solid fa-gamepad" style="color: var(--neon-cyan);"></i> CRIAR NOVA SALA</h3>
            <button onclick="document.getElementById('modal-create-room').classList.remove('active')" style="background: none; border: none; color: var(--text-muted); font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <form method="POST">
            <input type="hidden" name="action" value="create_room">
            <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Nome da Sala</label>
                <input type="text" name="room_name" value="Sala de <?php echo htmlspecialchars($gamer_profile['gamer_tag'] ?? 'Gamer'); ?>" required style="width: 100%; background: #121722; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; color: #fff;">
            </div>
            <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Modalidade de Jogo</label>
                <select name="game_type" style="width: 100%; background: #121722; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; color: #fff;">
                    <?php foreach ($ARENA_GAMES as $k => $gm): ?>
                        <option value="<?php echo $k; ?>" <?php echo ($k === 'hyperstrike') ? 'selected' : ''; ?>>
                            <?php echo htmlspecialchars($gm['name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div style="margin-bottom: 22px;">
                <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Tipo de Desafio</label>
                <select name="match_mode" style="width: 100%; background: #121722; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; color: #fff;">
                    <option value="human">Aguardar Jogador Humano na Rede</option>
                    <option value="bot">Treino Imediato com Oponente Oficial</option>
                </select>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="document.getElementById('modal-create-room').classList.remove('active')">Cancelar</button>
                <button type="submit" class="btn-ngola btn-ngola-primary"><i class="fa-solid fa-check"></i> Criar & Iniciar</button>
            </div>
        </form>
    </div>
</div>

<?php require_once(__DIR__ . '/footer.php'); ?>
