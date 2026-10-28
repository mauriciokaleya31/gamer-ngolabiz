<?php
/**
 * NGOLABIZ ARENA - PERFIL GAMER & PERSONALIZAÇÃO
 */
require_once(__DIR__ . '/init.php');

if (!$logged_user) {
    header('Location: ' . GAMER_URL . '/auth.php?redirect=' . urlencode(GAMER_URL . '/profile.php'));
    exit;
}

$error = '';
$success = '';
$uid = (int)$logged_user['user_id'];

// Atualizar Perfil
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'update_profile') {
    $new_tag = trim($_POST['gamer_tag'] ?? '');
    $new_title = trim($_POST['gamer_title'] ?? 'Iniciante da Arena');
    $new_fav = trim($_POST['favorite_game'] ?? 'hyperstrike');
    $new_fullname = trim($_POST['fullname'] ?? '');
    $new_province = trim($_POST['province'] ?? 'Luanda');
    $new_avatar_url = trim($_POST['avatar_url'] ?? '');

    // Processamento de Upload Real da Foto de Perfil
    $uploaded_avatar_path = '';
    if (!empty($_FILES['avatar_file']['name']) && $_FILES['avatar_file']['error'] === UPLOAD_ERR_OK) {
        $allowed_exts = ['jpg', 'jpeg', 'png', 'webp'];
        $file_name = $_FILES['avatar_file']['name'];
        $file_size = $_FILES['avatar_file']['size'];
        $file_tmp  = $_FILES['avatar_file']['tmp_name'];
        $ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));

        if (!in_array($ext, $allowed_exts)) {
            $error = 'Formato de imagem inválido. Escolha um arquivo JPG, PNG ou WEBP.';
        } elseif ($file_size > 5 * 1024 * 1024) {
            $error = 'O tamanho da foto de perfil não pode exceder 5MB.';
        } else {
            $avatars_dir = __DIR__ . '/uploads/avatars';
            if (!is_dir($avatars_dir)) {
                @mkdir($avatars_dir, 0755, true);
            }
            $target_filename = 'avatar_' . $uid . '_' . time() . '.' . $ext;
            $target_filepath = $avatars_dir . '/' . $target_filename;

            if (move_uploaded_file($file_tmp, $target_filepath)) {
                $uploaded_avatar_path = GAMER_URL . '/uploads/avatars/' . $target_filename;
            } else {
                $error = 'Falha ao gravar a imagem de perfil no servidor.';
            }
        }
    }

    if (empty($error)) {
        if (strlen($new_tag) < 3 || strlen($new_tag) > 20 || !preg_match('/^[a-zA-Z0-9_]+$/', $new_tag)) {
            $error = 'O Nickname Gamer deve ter entre 3 e 20 caracteres (apenas letras, números e sublinhado).';
        } else {
            $chk = $db->query("SELECT id FROM arena_profiles WHERE gamer_tag = '{$db->real_escape_string($new_tag)}' AND user_id != {$uid} LIMIT 1");
            if ($chk && $chk->num_rows > 0) {
                $error = 'Este Nickname já está em uso por outro guerreiro.';
            } else {
                // Atualizar dados de perfil na arena
                $db->query("UPDATE arena_profiles SET 
                    gamer_tag = '{$db->real_escape_string($new_tag)}',
                    gamer_title = '{$db->real_escape_string($new_title)}',
                    favorite_game = '{$db->real_escape_string($new_fav)}',
                    province = '{$db->real_escape_string($new_province)}',
                    updated_at = NOW()
                    WHERE user_id = {$uid}");

                // Se enviou nova foto por upload ou link
                $avatar_to_save = $uploaded_avatar_path ?: ($new_avatar_url ?: '');
                if (!empty($avatar_to_save)) {
                    $av_esc = $db->real_escape_string($avatar_to_save);
                    $db->query("UPDATE users SET user_picture = '{$av_esc}' WHERE user_id = {$uid}");
                    $logged_user['avatar'] = $avatar_to_save;
                    $logged_user['user_picture'] = $avatar_to_save;
                }

                if (!empty($new_fullname)) {
                    $fn_esc = $db->real_escape_string($new_fullname);
                    $db->query("UPDATE users SET user_firstname = '{$fn_esc}' WHERE user_id = {$uid}");
                    $logged_user['fullname'] = $new_fullname;
                }

                $success = 'Perfil e foto atualizados com sucesso!';
                $gamer_profile = $db->query("SELECT * FROM arena_profiles WHERE user_id = {$uid} LIMIT 1")->fetch_assoc();
            }
        }
    }
}

$page_title = 'Meu Perfil Gamer';
require_once(__DIR__ . '/header.php');

$winrate = ($gamer_profile['total_matches'] > 0) 
    ? round(($gamer_profile['total_wins'] / $gamer_profile['total_matches']) * 100, 1) 
    : 0;

// Consultas Financeiras Pessoais do Usuário na Arena
$user_wallet_balance = (float)($logged_user['user_wallet_balance'] ?? 0.0);
$user_total_won = (float)($db->query("SELECT SUM(amount) FROM wallet_transactions WHERE user_id = {$uid} AND node_type = 'arena_win'")->fetch_row()[0] ?? 0.0);
$user_total_lost = (float)($db->query("SELECT SUM(amount) FROM wallet_transactions WHERE user_id = {$uid} AND node_type IN ('arena_bet', 'arena_forfeit', 'arena_draw_fee')")->fetch_row()[0] ?? 0.0);
$user_net_profit = $user_total_won - $user_total_lost;

// Histórico de Batalhas e Apostas do Usuário
$user_matches = [];
$res_um = $db->query("
    SELECT c.id, c.game_type, c.bet_amount, c.challenger_id, c.challenged_id, c.challenger_tag, c.challenged_tag, c.status, c.created_at,
           m.winner_id, m.is_draw, m.duration_seconds, m.played_at
    FROM arena_challenges c
    LEFT JOIN arena_matches m ON (m.room_id = c.challenge_token OR m.room_id LIKE CONCAT('%', c.challenge_token, '%'))
    WHERE (c.challenger_id = {$uid} OR c.challenged_id = {$uid})
    ORDER BY c.id DESC LIMIT 20
");
if ($res_um) {
    while ($um = $res_um->fetch_assoc()) {
        $user_matches[] = $um;
    }
}
?>

<main class="container-arena">
    <div style="margin-bottom: 24px;">
        <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff;">Meu Perfil Gamer & Finanças</h1>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Configure sua identidade, consulte o histórico de partidas e acompanhe seus ganhos e saldo na Arena.</p>
    </div>

    <?php if (!empty($error)): ?>
        <div style="background: rgba(246, 0, 0, 0.15); border: 1px solid var(--ngola-red); color: #fecaca; padding: 12px 18px; border-radius: 10px; margin-bottom: 20px;">
            <i class="fa-solid fa-circle-exclamation"></i> <?php echo htmlspecialchars($error); ?>
        </div>
    <?php endif; ?>

    <?php if (!empty($success)): ?>
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid var(--neon-green); color: #a7f3d0; padding: 12px 18px; border-radius: 10px; margin-bottom: 20px;">
            <i class="fa-solid fa-circle-check"></i> <?php echo htmlspecialchars($success); ?>
        </div>
    <?php endif; ?>

    <!-- SEÇÃO 1: CARDS DE IDENTIDADE & CONFIGURAÇÃO -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-bottom: 30px;">
        <!-- Card de Apresentação -->
        <div class="arena-card" style="text-align: center; padding: 32px 20px;">
            <img src="<?php echo htmlspecialchars($logged_user['avatar']); ?>" alt="Avatar" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 3px solid var(--ngola-red); margin-bottom: 16px;">
            <h2 style="font-size: 1.5rem; font-weight: 800; color: #fff; margin-bottom: 4px;"><?php echo htmlspecialchars($gamer_profile['gamer_tag']); ?></h2>
            <div style="color: var(--ngola-red); font-weight: 700; font-size: 0.95rem; margin-bottom: 20px;"><?php echo htmlspecialchars($gamer_profile['gamer_title']); ?></div>

            <div style="display: flex; justify-content: center; gap: 20px; border-top: 1px solid var(--border-color); padding-top: 18px;">
                <div>
                    <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Classificação</div>
                    <div style="font-size: 1.3rem; font-weight: 800; color: var(--neon-gold);"><?php echo (int)$gamer_profile['competitive_points']; ?> Pontos</div>
                </div>
                <div style="border-left: 1px solid var(--border-color); padding-left: 20px;">
                    <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Taxa Vitórias</div>
                    <div style="font-size: 1.3rem; font-weight: 800; color: var(--neon-green);"><?php echo $winrate; ?>%</div>
                </div>
            </div>
        </div>

        <!-- Formulário de Personalização -->
        <div class="arena-card">
            <div class="arena-card-header">
                <div class="arena-card-title"><i class="fa-solid fa-gear" style="color: var(--ngola-red);"></i> Configurar Identidade & Foto</div>
            </div>
            <form method="POST" enctype="multipart/form-data">
                <input type="hidden" name="action" value="update_profile">

                <!-- UPLOAD REAL DE FOTO DE PERFIL -->
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">
                        <i class="fa-solid fa-camera" style="color: #ef4444; margin-right: 4px;"></i> Foto de Perfil (Carregar Ficheiro ou Foto)
                    </label>
                    <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 8px;">
                        <img src="<?php echo htmlspecialchars($logged_user['avatar']); ?>" id="avatar-preview-img" alt="Avatar Preview" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 2px solid #ef4444; box-shadow: 0 0 10px rgba(239,68,68,0.3);">
                        <div style="flex: 1;">
                            <input type="file" name="avatar_file" id="avatar_file_input" accept="image/png, image/jpeg, image/jpg, image/webp" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; color: #fff; font-size: 0.82rem;" onchange="previewAvatarUpload(this)">
                        </div>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-dim);">Carregue uma foto sua direta do computador ou telemóvel (JPG, PNG ou WEBP até 5MB).</div>
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Nome Completo</label>
                    <input type="text" name="fullname" value="<?php echo htmlspecialchars($logged_user['fullname'] ?? ''); ?>" required maxlength="50" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; color: #fff;">
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Nickname Gamer Único</label>
                    <input type="text" name="gamer_tag" value="<?php echo htmlspecialchars($gamer_profile['gamer_tag']); ?>" required maxlength="20" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; color: #fff;">
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Província de Residência</label>
                    <select name="province" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; color: #fff;">
                        <?php 
                        $provincias = ['Luanda', 'Benguela', 'Huambo', 'Huíla', 'Cabinda', 'Cuanza Sul', 'Cuanza Norte', 'Malanje', 'Namibe', 'Uíge', 'Zaire', 'Bié', 'Bengo', 'Lunda Norte', 'Lunda Sul', 'Moxico', 'Cunene', 'Cuando Cubango'];
                        $cur_prov = $gamer_profile['province'] ?? 'Luanda';
                        foreach ($provincias as $pv): ?>
                            <option value="<?php echo $pv; ?>" <?php echo ($cur_prov === $pv) ? 'selected' : ''; ?>><?php echo $pv; ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div style="margin-bottom: 14px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Título de Combate</label>
                    <select name="gamer_title" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; color: #fff;">
                        <option value="Iniciante da Arena" <?php echo ($gamer_profile['gamer_title'] == 'Iniciante da Arena') ? 'selected' : ''; ?>>Iniciante da Arena</option>
                        <option value="Guerreiro da Arena" <?php echo ($gamer_profile['gamer_title'] == 'Guerreiro da Arena') ? 'selected' : ''; ?>>Guerreiro da Arena</option>
                        <option value="Estrategista Tático" <?php echo ($gamer_profile['gamer_title'] == 'Estrategista Tático') ? 'selected' : ''; ?>>Estrategista Tático</option>
                        <option value="Mestre do Tabuleiro" <?php echo ($gamer_profile['gamer_title'] == 'Mestre do Tabuleiro') ? 'selected' : ''; ?>>Mestre do Tabuleiro</option>
                        <option value="Lenda Viva de Luanda" <?php echo ($gamer_profile['gamer_title'] == 'Lenda Viva de Luanda') ? 'selected' : ''; ?>>Lenda Viva de Luanda</option>
                    </select>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Jogo Favorito</label>
                    <select name="favorite_game" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; color: #fff;">
                        <?php foreach ($ARENA_GAMES as $gk => $gm): ?>
                            <option value="<?php echo $gk; ?>" <?php echo ($gamer_profile['favorite_game'] == $gk) ? 'selected' : ''; ?>><?php echo htmlspecialchars($gm['name']); ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <button type="submit" class="btn-ngola btn-ngola-primary" style="width: 100%;">
                    <i class="fa-solid fa-floppy-disk"></i> Guardar Alterações
                </button>
            </form>
        </div>
    </div>

    <script>
    function previewAvatarUpload(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const prev = document.getElementById('avatar-preview-img');
                if (prev) prev.src = e.target.result;
            };
            reader.readAsDataURL(input.files[0]);
        }
    }
    </script>

    <!-- SEÇÃO 2: EXTRATO FINANCEIRO PESSOAL & BALANÇO DE APOSTAS -->
    <div style="margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
            <div>
                <h2 style="font-size: 1.35rem; font-weight: 800; color: #fff; margin: 0;">
                    <i class="fa-solid fa-wallet" style="color: var(--neon-gold);"></i> Extrato de Apostas & Saldo
                </h2>
                <span style="font-size: 0.85rem; color: var(--text-muted);">Movimentações reais da sua carteira em duelos e torneios da Arena.</span>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <a href="<?php echo GAMER_URL; ?>/saque.php" class="btn-launch-hero" style="background: linear-gradient(135deg, #22C98B, #10b981); font-size: 0.85rem; padding: 8px 16px; text-decoration: none;">
                    <i class="fa-solid fa-money-bill-transfer"></i> Solicitar Saque
                </a>
                <a href="<?php echo GAMER_URL; ?>/deposito.php" class="btn-launch-hero" style="background: linear-gradient(135deg, #F0444A, #C92E38); font-size: 0.85rem; padding: 8px 16px; text-decoration: none;">
                    <i class="fa-solid fa-plus"></i> Depositar Saldo
                </a>
            </div>
        </div>

        <div class="kpi-metrics-row" style="margin-bottom: 20px;">
            <!-- Saldo Atual -->
            <div class="kpi-card" style="border-color: rgba(245, 158, 11, 0.35);">
                <div class="kpi-card-label"><i class="fa-solid fa-coins" style="color: var(--neon-gold); margin-right: 6px;"></i> Saldo Atual na Carteira</div>
                <div class="kpi-card-value" style="color: var(--neon-gold); font-size: 1.6rem;"><?php echo number_format($user_wallet_balance, 2, ',', '.'); ?> Kz</div>
                <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;">Disponível para apostar e sacar</div>
            </div>
            <!-- Ganhos Totais -->
            <div class="kpi-card" style="border-color: rgba(16, 185, 129, 0.35);">
                <div class="kpi-card-label"><i class="fa-solid fa-arrow-trend-up" style="color: #10b981; margin-right: 6px;"></i> Total Ganho em Vitórias</div>
                <div class="kpi-card-value" style="color: #10b981; font-size: 1.6rem;">+<?php echo number_format($user_total_won, 2, ',', '.'); ?> Kz</div>
                <div style="font-size: 0.78rem; color: #a7f3d0; margin-top: 4px;">Prêmios creditados após taxas</div>
            </div>
            <!-- Perdas Totais -->
            <div class="kpi-card" style="border-color: rgba(239, 68, 68, 0.35);">
                <div class="kpi-card-label"><i class="fa-solid fa-arrow-trend-down" style="color: #ef4444; margin-right: 6px;"></i> Total Perdido em Duelos</div>
                <div class="kpi-card-value" style="color: #ef4444; font-size: 1.6rem;">-<?php echo number_format($user_total_lost, 2, ',', '.'); ?> Kz</div>
                <div style="font-size: 0.78rem; color: #fca5a5; margin-top: 4px;">Apostas debitadas em derrotas</div>
            </div>
            <!-- Balanço Líquido -->
            <div class="kpi-card" style="border-color: <?php echo ($user_net_profit >= 0) ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'; ?>;">
                <div class="kpi-card-label"><i class="fa-solid fa-scale-balanced" style="color: <?php echo ($user_net_profit >= 0) ? '#10b981' : '#ef4444'; ?>; margin-right: 6px;"></i> Lucro Líquido Acumulado</div>
                <div class="kpi-card-value" style="color: <?php echo ($user_net_profit >= 0) ? '#10b981' : '#ef4444'; ?>; font-size: 1.6rem;">
                    <?php echo ($user_net_profit >= 0 ? '+' : '') . number_format($user_net_profit, 2, ',', '.'); ?> Kz
                </div>
                <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;">Diferença entre vitórias e derrotas</div>
            </div>
        </div>

        <!-- Tabela com Histórico de Partidas Pessoais -->
        <div class="arena-card">
            <div class="arena-card-header">
                <div class="arena-card-title"><i class="fa-solid fa-clock-rotate-left" style="color: var(--neon-cyan);"></i> Histórico de Batalhas & Resultados</div>
                <span style="font-size: 0.8rem; color: var(--text-dim);"><?php echo count($user_matches); ?> partidas registradas</span>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; min-width: 650px;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-dim); text-transform: uppercase; font-size: 0.78rem;">
                            <th style="padding: 10px;">Jogo</th>
                            <th style="padding: 10px;">Adversário</th>
                            <th style="padding: 10px; text-align: right;">Sua Aposta</th>
                            <th style="padding: 10px; text-align: center;">Resultado</th>
                            <th style="padding: 10px; text-align: right;">Impacto Financeiro</th>
                            <th style="padding: 10px; text-align: right;">Data</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (!empty($user_matches)): ?>
                            <?php foreach ($user_matches as $m): 
                                $is_challenger = ($m['challenger_id'] == $uid);
                                $opp_tag = $is_challenger ? ($m['challenged_tag'] ?: 'Oponente') : ($m['challenger_tag'] ?: 'Oponente');
                                $bet = (float)$m['bet_amount'];
                                $is_draw = ($m['is_draw'] == 1);
                                $winner_id = (int)($m['winner_id'] ?? 0);
                                
                                $status_badge = '';
                                $impact_str = '0 Kz';
                                $impact_color = 'var(--text-dim)';
                                
                                if ($is_draw) {
                                    $status_badge = '<span class="badge" style="background: #f59e0b; color: #000; font-weight: 800;">EMPATE</span>';
                                    $fee = round(($bet * 2 * 0.10) / 2, 2);
                                    $impact_str = '-' . number_format($fee, 0, ',', '.') . ' Kz (Taxa)';
                                    $impact_color = '#f59e0b';
                                } elseif ($winner_id === $uid) {
                                    $status_badge = '<span class="badge" style="background: #10b981; color: #000; font-weight: 800;">VITÓRIA</span>';
                                    $profit = ($bet > 0) ? (($bet * 2 * 0.90) - $bet) : 200;
                                    $impact_str = '+' . number_format($profit, 0, ',', '.') . ' Kz';
                                    $impact_color = '#10b981';
                                } elseif ($winner_id > 0) {
                                    $status_badge = '<span class="badge" style="background: #ef4444; color: #fff; font-weight: 800;">DERROTA</span>';
                                    $impact_str = '-' . number_format($bet, 0, ',', '.') . ' Kz';
                                    $impact_color = '#ef4444';
                                } else {
                                    $status_badge = '<span class="badge" style="background: #374151; color: #fff;">FINALIZADA</span>';
                                }
                            ?>
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                                <td style="padding: 10px; font-weight: 700; color: #fff;">
                                    <?php echo strtoupper($m['game_type']); ?>
                                </td>
                                <td style="padding: 10px; color: var(--text-main);">
                                    <?php echo htmlspecialchars($opp_tag); ?>
                                </td>
                                <td style="padding: 10px; text-align: right; color: var(--text-muted); font-weight: 700;">
                                    <?php echo number_format($bet, 0, ',', '.'); ?> Kz
                                </td>
                                <td style="padding: 10px; text-align: center;">
                                    <?php echo $status_badge; ?>
                                </td>
                                <td style="padding: 10px; text-align: right; font-weight: 800; color: <?php echo $impact_color; ?>;">
                                    <?php echo $impact_str; ?>
                                </td>
                                <td style="padding: 10px; text-align: right; font-size: 0.78rem; color: var(--text-dim);">
                                    <?php echo !empty($m['played_at']) ? date('d/m H:i', strtotime($m['played_at'])) : date('d/m H:i', strtotime($m['created_at'])); ?>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <tr><td colspan="6" style="text-align: center; padding: 25px; color: var(--text-dim);">Nenhuma partida realizada ainda. Desafie combatentes no lobby!</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</main>

<?php require_once(__DIR__ . '/footer.php'); ?>
