<?php
/**
 * NGOLABIZ ARENA - PAINEL DE GESTÃO ADMINISTRATIVO EXCLUSIVO (ADMIN COMMAND CENTER)
 * Proteção Estrita: Apenas administradores oficiais da plataforma (user_group == 1)
 */
require_once(__DIR__ . '/init.php');

// Bloqueio Total e Rigoroso de Segurança
header("Cache-Control: no-cache, no-store, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");

if (!arena_is_admin()) {
    if (!isset($user) || !$user->_logged_in) {
        header('Location: ' . GAMER_URL . '/auth.php?redirect=' . urlencode(GAMER_URL . '/admin.php'));
        exit;
    } else {
        http_response_code(403);
        die("
        <!DOCTYPE html>
        <html lang='pt'>
        <head><meta charset='UTF-8'><title>Acesso Restrito | NgolaBiz Arena</title></head>
        <body style='background:#0b0e14; color:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;'>
            <div style='text-align:center; max-width:480px; padding:30px; border:1px solid #273142; border-radius:14px; background:#161c26;'>
                <div style='font-size:3rem; color:#ef4444; margin-bottom:12px;'>⚠️</div>
                <h2 style='margin-bottom:8px;'>ACESSO ADMINISTRATIVO RESTRITO</h2>
                <p style='color:#94a3b8; font-size:0.95rem; margin-bottom:20px;'>Apenas administradores gerais da plataforma NgolaBiz têm permissão para acessar este painel de controle de oponentes e auditoria.</p>
                <a href='" . GAMER_URL . "/index.php' style='display:inline-block; background:#ef4444; color:#fff; text-decoration:none; padding:10px 20px; border-radius:8px; font-weight:700;'>Voltar à Arena</a>
            </div>
        </body>
        </html>
        ");
    }
}

$admin_id = (int)$logged_user['user_id'];
$admin_name = $logged_user['fullname'];
$ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
$active_tab = $_GET['tab'] ?? 'overview';

$msg = '';
$err = '';

// Processamento de Ações do Administrador

// Parar personificação se requisitado
if (isset($_GET['action']) && $_GET['action'] === 'stop_impersonating') {
    if (!empty($_SESSION['admin_impersonator_id'])) {
        $_SESSION['arena_uid'] = (int)$_SESSION['admin_impersonator_id'];
        unset($_SESSION['admin_impersonator_id']);
    }
    header('Location: ' . GAMER_URL . '/admin.php?tab=users');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    // 1. ENTRAR NA CONTA DO JOGADOR (IMPERSONATE)
    if ($action === 'impersonate_user') {
        $target_uid = (int)($_POST['target_user_id'] ?? 0);
        if ($target_uid > 0) {
            $_SESSION['admin_impersonator_id'] = $admin_id;
            $_SESSION['arena_uid'] = $target_uid;
            $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'IMPERSONATE_USER', 'Entrou na conta do utilizador #{$target_uid}', '{$ip}')");
            header('Location: ' . GAMER_URL . '/index.php');
            exit;
        }
    }

    // 2. CRIAR CONTA DE UTILIZADOR PELO ADMIN
    if ($action === 'admin_create_user') {
        $user_name = trim($_POST['user_name'] ?? '');
        $fullname = trim($_POST['fullname'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $password = trim($_POST['password'] ?? '');
        $init_balance = max(0, (float)($_POST['initial_balance'] ?? 0));
        $province = trim($_POST['province'] ?? 'Luanda');
        $gamer_tag = trim($_POST['gamer_tag'] ?? $user_name);

        if (empty($user_name) || empty($password) || empty($email)) {
            $err = 'Preencha o nome de utilizador, e-mail e palavra-passe.';
        } else {
            $u_check = $db->query("SELECT user_id FROM users WHERE user_name = '{$db->real_escape_string($user_name)}' OR user_email = '{$db->real_escape_string($email)}' LIMIT 1");
            if ($u_check && $u_check->num_rows > 0) {
                $err = 'Já existe um utilizador com esse Nome de Utilizador ou E-mail.';
            } else {
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $parts = explode(' ', $fullname, 2);
                $fname = $db->real_escape_string($parts[0]);
                $lname = $db->real_escape_string($parts[1] ?? '');
                $uname_esc = $db->real_escape_string($user_name);
                $mail_esc = $db->real_escape_string($email);
                $prov_esc = $db->real_escape_string($province);

                $ins_u = $db->query("INSERT INTO users (user_name, user_email, user_password, user_firstname, user_lastname, user_current_city, user_wallet_balance, user_group, user_verified, user_registered) 
                    VALUES ('{$uname_esc}', '{$mail_esc}', '{$hash}', '{$fname}', '{$lname}', '{$prov_esc}', {$init_balance}, 3, 1, NOW())");
                if ($ins_u) {
                    $new_uid = $db->insert_id;
                    $gtag_esc = $db->real_escape_string($gamer_tag ?: $user_name);
                    $db->query("INSERT INTO arena_profiles (user_id, gamer_tag, gamer_title, province, competitive_points, status) 
                        VALUES ({$new_uid}, '{$gtag_esc}', 'Novato da Arena', '{$prov_esc}', 1000, 'offline')");
                    
                    if ($init_balance > 0) {
                        arena_add_notification($new_uid, 'Depósito de Abertura de Conta', 'A sua conta foi creditada com ' . arena_money($init_balance) . ' pelo Administrador.', 'deposit', GAMER_URL . '/index.php');
                    }
                    $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'CREATE_USER', 'Criou utilizador @{$user_name} (#{$new_uid}) com saldo {$init_balance} AKZ', '{$ip}')");
                    $msg = "Conta de @{$user_name} criada com sucesso!";
                    $active_tab = 'users';
                } else {
                    $err = 'Erro ao criar utilizador: ' . $db->error;
                }
            }
        }
    }

    // 3. EDITAR DADOS DO UTILIZADOR
    if ($action === 'admin_edit_user') {
        $target_uid = (int)($_POST['target_user_id'] ?? 0);
        $fullname = trim($_POST['fullname'] ?? '');
        $gamer_tag = trim($_POST['gamer_tag'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $phone = trim($_POST['phone'] ?? '');
        $province = trim($_POST['province'] ?? 'Luanda');

        if ($target_uid > 0) {
            $parts = explode(' ', $fullname, 2);
            $fname = $db->real_escape_string($parts[0]);
            $lname = $db->real_escape_string($parts[1] ?? '');
            $mail_esc = $db->real_escape_string($email);
            $phone_esc = $db->real_escape_string($phone);
            $prov_esc = $db->real_escape_string($province);
            $tag_esc = $db->real_escape_string($gamer_tag);

            $db->query("UPDATE users SET user_firstname = '{$fname}', user_lastname = '{$lname}', user_email = '{$mail_esc}', user_phone = '{$phone_esc}', user_current_city = '{$prov_esc}' WHERE user_id = {$target_uid}");
            $db->query("UPDATE arena_profiles SET gamer_tag = '{$tag_esc}', province = '{$prov_esc}' WHERE user_id = {$target_uid}");
            $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'EDIT_USER', 'Editou dados do utilizador #{$target_uid}', '{$ip}')");
            $msg = "Dados do utilizador #{$target_uid} atualizados!";
            $active_tab = 'users';
        }
    }

    // 4. REDEFINIR PALAVRA-PASSE
    if ($action === 'admin_reset_password') {
        $target_uid = (int)($_POST['target_user_id'] ?? 0);
        $new_pass = trim($_POST['new_password'] ?? '');
        if ($target_uid > 0 && strlen($new_pass) >= 4) {
            $hash = password_hash($new_pass, PASSWORD_DEFAULT);
            $db->query("UPDATE users SET user_password = '{$hash}' WHERE user_id = {$target_uid}");
            arena_add_notification($target_uid, 'Palavra-passe Redefinida', 'A sua palavra-passe foi redefinida com sucesso pelo Administrador.', 'general');
            $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'RESET_PASSWORD', 'Redefiniu senha do utilizador #{$target_uid}', '{$ip}')");
            $msg = "Palavra-passe do utilizador #{$target_uid} alterada com sucesso!";
            $active_tab = 'users';
        } else {
            $err = 'A nova palavra-passe deve conter pelo menos 4 caracteres.';
        }
    }

    // 5. INJETAR / ADICIONAR SALDO NA CARTEIRA
    if ($action === 'admin_inject_balance') {
        $target_uid = (int)($_POST['target_user_id'] ?? 0);
        $amount = (float)($_POST['amount'] ?? 0);
        $type = $_POST['type'] ?? 'credit';
        $reason = trim($_POST['reason'] ?? 'Ajuste administrativo');

        if ($target_uid > 0 && $amount > 0) {
            if ($type === 'debit') {
                $db->query("UPDATE users SET user_wallet_balance = GREATEST(0, user_wallet_balance - {$amount}) WHERE user_id = {$target_uid}");
                arena_add_notification($target_uid, 'Débito na Carteira', 'Foi debitado da sua conta o valor de ' . arena_money($amount) . ' (Motivo: ' . $reason . ').', 'withdrawal');
                $act_t = "Débito de " . arena_money($amount);
            } else {
                $db->query("UPDATE users SET user_wallet_balance = user_wallet_balance + {$amount} WHERE user_id = {$target_uid}");
                arena_add_notification($target_uid, 'Depósito Recebido', 'O Administrador creditou ' . arena_money($amount) . ' na sua carteira (Motivo: ' . $reason . ').', 'deposit');
                $act_t = "Crédito de " . arena_money($amount);
            }
            $r_esc = $db->real_escape_string($reason);
            $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'INJECT_BALANCE', '{$act_t} para utilizador #{$target_uid} ({$r_esc})', '{$ip}')");
            $msg = "Saldo do utilizador #{$target_uid} ajustado ({$act_t}) com sucesso!";
            $active_tab = 'users';
        } else {
            $err = 'Informe um valor válido maior que zero.';
        }
    }

    // 6. BANIR / DESBANIR
    if ($action === 'admin_toggle_ban') {
        $target_uid = (int)($_POST['target_user_id'] ?? 0);
        $status = (int)($_POST['status'] ?? 0);
        if ($target_uid > 0) {
            $db->query("UPDATE users SET user_banned = {$status} WHERE user_id = {$target_uid}");
            $txt = $status ? 'BANIR_USER' : 'UNBAN_USER';
            $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', '{$txt}', 'Alterou ban do utilizador #{$target_uid} para {$status}', '{$ip}')");
            $msg = $status ? "Utilizador #{$target_uid} BANIDO da Arena!" : "Utilizador #{$target_uid} DESBANIDO!";
            $active_tab = 'users';
        }
    }

    // 7. APROVAR SAQUE
    if ($action === 'approve_withdrawal') {
        $w_id = (int)($_POST['withdrawal_id'] ?? 0);
        $qw = $db->query("SELECT * FROM arena_withdrawals WHERE id = {$w_id} LIMIT 1");
        if ($qw && $qw->num_rows > 0) {
            $w = $qw->fetch_assoc();
            $target_uid = (int)$w['user_id'];
            $db->query("UPDATE arena_withdrawals SET status = 'approved', reviewed_at = NOW(), reviewed_by = {$admin_id} WHERE id = {$w_id}");
            arena_add_notification($target_uid, 'Saque Aprovado & Transferido', 'O seu levantamento de ' . arena_money($w['amount']) . ' para a conta ' . htmlspecialchars($w['bank_name']) . ' (' . htmlspecialchars($w['iban']) . ') foi APROVADO com sucesso!', 'withdrawal', GAMER_URL . '/saque.php');
            $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'APPROVE_WITHDRAWAL', 'Aprovou saque #{$w_id} de {$w['amount']} AKZ do utilizador #{$target_uid}', '{$ip}')");
            $msg = "Pedido de Saque #{$w_id} de " . arena_money($w['amount']) . " foi APROVADO com sucesso!";
            $active_tab = 'withdrawals';
        }
    }

    // 8. REJEITAR SAQUE COM REEMBOLSO IMEDIATO
    if ($action === 'reject_withdrawal') {
        $w_id = (int)($_POST['withdrawal_id'] ?? 0);
        $reason = trim($_POST['reject_reason'] ?? 'Dados bancários divergentes ou IBAN inválido.');
        $qw = $db->query("SELECT * FROM arena_withdrawals WHERE id = {$w_id} LIMIT 1");
        if ($qw && $qw->num_rows > 0) {
            $w = $qw->fetch_assoc();
            $target_uid = (int)$w['user_id'];
            $refund = (float)$w['amount'];
            $r_esc = $db->real_escape_string($reason);

            $db->query("UPDATE users SET user_wallet_balance = user_wallet_balance + {$refund} WHERE user_id = {$target_uid}");
            $db->query("UPDATE arena_withdrawals SET status = 'rejected', admin_notes = '{$r_esc}', reviewed_at = NOW(), reviewed_by = {$admin_id} WHERE id = {$w_id}");
            arena_add_notification($target_uid, 'Saque Recusado — Saldo Reembolsado', 'O seu pedido de levantamento de ' . arena_money($refund) . ' foi recusado (Motivo: "' . htmlspecialchars($reason) . '"). O valor integral foi devolvido ao seu saldo.', 'withdrawal', GAMER_URL . '/saque.php');
            $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'REJECT_WITHDRAWAL', 'Rejeitou saque #{$w_id} ({$refund} AKZ) do utilizador #{$target_uid}. Motivo: {$r_esc}. Saldo estornado.', '{$ip}')");
            $msg = "Pedido de Saque #{$w_id} recusado e saldo de " . arena_money($refund) . " devolvido ao utilizador!";
            $active_tab = 'withdrawals';
        }
    }

    // 9. CONFIGURAR PERFIL DO ATENDENTE DE SUPORTE
    if ($action === 'save_support_profile') {
        $ag_name = trim($_POST['support_agent_name'] ?? 'Paula Sousa — Atendimento VIP Casino56');
        $ag_status = trim($_POST['support_agent_status'] ?? '● Online — Resposta Imediata');
        $ag_avatar = trim($_POST['support_agent_avatar'] ?? '');

        if (!empty($_FILES['support_agent_avatar_file']['name']) && $_FILES['support_agent_avatar_file']['error'] === UPLOAD_ERR_OK) {
            $ext = strtolower(pathinfo($_FILES['support_agent_avatar_file']['name'], PATHINFO_EXTENSION));
            if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'])) {
                $up_dir = __DIR__ . '/uploads/avatars/';
                if (!is_dir($up_dir)) @mkdir($up_dir, 0777, true);
                $fn = 'support_agent_' . time() . '.' . $ext;
                if (move_uploaded_file($_FILES['support_agent_avatar_file']['tmp_name'], $up_dir . $fn)) {
                    $ag_avatar = GAMER_URL . '/uploads/avatars/' . $fn;
                }
            }
        }

        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('support_agent_name', '{$db->real_escape_string($ag_name)}') ON DUPLICATE KEY UPDATE setting_value = '{$db->real_escape_string($ag_name)}'");
        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('support_agent_status', '{$db->real_escape_string($ag_status)}') ON DUPLICATE KEY UPDATE setting_value = '{$db->real_escape_string($ag_status)}'");
        if (!empty($ag_avatar)) {
            $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('support_agent_avatar', '{$db->real_escape_string($ag_avatar)}') ON DUPLICATE KEY UPDATE setting_value = '{$db->real_escape_string($ag_avatar)}'");
        }

        $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'UPDATE_SUPPORT_PROFILE', 'Atualizou nome do atendente ({$ag_name})', '{$ip}')");
        $msg = "Perfil de Atendimento de Suporte salvo com sucesso!";
        $active_tab = 'support';
    }


    // Salvar Jogador Programado (Criar ou Atualizar)
    if ($action === 'save_bot') {
        $bot_id = (int)($_POST['bot_id'] ?? 0);
        $fullname = trim($_POST['fullname'] ?? '');
        $tag = trim($_POST['bot_tag'] ?? '');
        $title = trim($_POST['bot_title'] ?? 'Lenda da Arena');
        $province = trim($_POST['province'] ?? 'Luanda');
        $avatar_url = trim($_POST['avatar_url'] ?? '');
        $diff = $_POST['difficulty'] ?? 'medium';
        $target_wr = max(0, min(100, (int)($_POST['target_winrate'] ?? 70)));
        $accept_delay = max(2, min(50, (int)($_POST['accept_delay_seconds'] ?? 5)));
        $max_bet = max(0, (int)($_POST['max_bet_amount'] ?? 10000));
        $is_active = isset($_POST['is_active']) ? (int)$_POST['is_active'] : 1;
        $style = $_POST['play_style'] ?? 'balanced';
        $min_d = (int)($_POST['min_delay_ms'] ?? 600);
        $max_d = (int)($_POST['max_delay_ms'] ?? 1600);
        $allowed = json_encode(['cardbattle', 'neonfist', 'hyperstrike', 'tictactoe', 'connect4']);

        if (empty($avatar_url)) {
            $avatar_url = 'https://ui-avatars.com/api/?name=' . urlencode($tag ?: $fullname) . '&background=7c3aed&color=fff&size=150';
        }

        if (empty($tag)) {
            $err = 'O Username / Tag do jogador é obrigatório.';
        } else {
            if ($bot_id > 0) {
                // Atualizar Bot Existente
                $upd = $db->query("UPDATE arena_bots SET 
                    fullname = '{$db->real_escape_string($fullname)}',
                    bot_tag = '{$db->real_escape_string($tag)}',
                    bot_title = '{$db->real_escape_string($title)}',
                    avatar_url = '{$db->real_escape_string($avatar_url)}',
                    province = '{$db->real_escape_string($province)}',
                    difficulty = '{$diff}',
                    target_winrate = {$target_wr},
                    accept_delay_seconds = {$accept_delay},
                    max_bet_amount = {$max_bet},
                    is_active = {$is_active},
                    play_style = '{$style}'
                    WHERE id = {$bot_id}");

                if ($upd) {
                    $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'EDIT_BOT', 'Atualizou jogador programado {$tag} (Chance: {$target_wr}%)', '{$ip}')");
                    $msg = "Jogador programado [{$tag}] atualizado com sucesso!";
                } else {
                    $err = 'Erro ao atualizar jogador: ' . $db->error;
                }
            } else {
                // Criar Novo Bot
                $ins = $db->query("INSERT INTO arena_bots 
                    (fullname, bot_tag, bot_title, avatar_url, province, allowed_games, difficulty, target_winrate, max_bet_amount, play_style, accept_delay_seconds, min_delay_ms, max_delay_ms, is_active, allow_training_rooms) 
                    VALUES 
                    ('{$db->real_escape_string($fullname)}', '{$db->real_escape_string($tag)}', '{$db->real_escape_string($title)}', '{$db->real_escape_string($avatar_url)}', '{$db->real_escape_string($province)}', '{$db->real_escape_string($allowed)}', '{$diff}', {$target_wr}, {$max_bet}, '{$style}', {$accept_delay}, {$min_d}, {$max_d}, {$is_active}, 1)");

                if ($ins) {
                    $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'CREATE_BOT', 'Cadastrou jogador programado {$tag} ({$province}, Chance: {$target_wr}%)', '{$ip}')");
                    $msg = "Novo jogador [{$tag}] programado e disponibilizado com sucesso!";
                } else {
                    $err = 'Erro ao cadastrar jogador: ' . $db->error;
                }
            }
        }
    }

    // Excluir Bot
    if ($action === 'delete_bot') {
        $bot_id = (int)$_POST['bot_id'];
        $db->query("DELETE FROM arena_bots WHERE id = {$bot_id}");
        $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'DELETE_BOT', 'Excluiu o jogador bot ID {$bot_id}', '{$ip}')");
        $msg = "Jogador programado removido do sistema!";
    }

    // Alternar Status do Bot (Pausar / Disponibilizar)
    if ($action === 'toggle_bot') {
        $bot_id = (int)$_POST['bot_id'];
        $new_status = (int)$_POST['status'];
        $db->query("UPDATE arena_bots SET is_active = {$new_status} WHERE id = {$bot_id}");
        $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'TOGGLE_BOT', 'Alterou disponibilidade do jogador ID {$bot_id} para {$new_status}', '{$ip}')");
        $msg = "Disponibilidade do oponente na rede atualizada!";
    }

    // Atualizar Configurações Globais & Taxa da Plataforma
    if ($action === 'save_global_settings') {
        $max_bots = (int)($_POST['max_active_bots'] ?? 15);
        $timeout = (int)($_POST['bot_fill_timeout_seconds'] ?? 60);
        $platform_fee = max(0, min(50, (float)($_POST['platform_fee_percent'] ?? 10.0)));

        $base_online = max(0, (int)($_POST['live_metrics_base_online'] ?? 8));
        $base_battles = max(0, (int)($_POST['live_metrics_base_battles'] ?? 3));
        $base_matches = max(0, (int)($_POST['live_metrics_base_matches_today'] ?? 18));
        $base_prizes = max(0, (int)($_POST['live_metrics_base_prizes'] ?? 1340000));
        $fluct_enabled = isset($_POST['live_metrics_fluctuation_enabled']) ? '1' : '0';

        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('max_active_bots', '{$max_bots}') ON DUPLICATE KEY UPDATE setting_value = '{$max_bots}'");
        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('bot_fill_timeout_seconds', '{$timeout}') ON DUPLICATE KEY UPDATE setting_value = '{$timeout}'");
        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('platform_fee_percent', '{$platform_fee}') ON DUPLICATE KEY UPDATE setting_value = '{$platform_fee}'");
        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('live_metrics_base_online', '{$base_online}') ON DUPLICATE KEY UPDATE setting_value = '{$base_online}'");
        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('live_metrics_base_battles', '{$base_battles}') ON DUPLICATE KEY UPDATE setting_value = '{$base_battles}'");
        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('live_metrics_base_matches_today', '{$base_matches}') ON DUPLICATE KEY UPDATE setting_value = '{$base_matches}'");
        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('live_metrics_base_prizes', '{$base_prizes}') ON DUPLICATE KEY UPDATE setting_value = '{$base_prizes}'");
        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('live_metrics_fluctuation_enabled', '{$fluct_enabled}') ON DUPLICATE KEY UPDATE setting_value = '{$fluct_enabled}'");
        
        $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'CONFIG_UPDATE', 'Atualizou Taxa da Plataforma para {$platform_fee}% e Estimativas de Métricas Dinâmicas', '{$ip}')");
        $msg = "Configurações da Arena, Taxa ({$platform_fee}%) e Estimativas de Métricas guardadas com sucesso!";
    }

    // Salvar Capas dos Jogos & Hero Banner com Upload de Imagens
    if ($action === 'save_game_covers') {
        $up_dir = __DIR__ . '/images/covers/';
        if (!is_dir($up_dir)) @mkdir($up_dir, 0777, true);

        $cover_fields = [
            'cover_featured' => 'cover_featured_file',
            'cover_hyperstrike' => 'cover_hyperstrike_file',
            'cover_neon-fist' => 'cover_neon-fist_file',
            'cover_mkjs' => 'cover_mkjs_file',
            'cover_card-duel' => 'cover_card-duel_file',
            'cover_rps-battle' => 'cover_rps-battle_file'
        ];

        foreach ($cover_fields as $s_key => $f_key) {
            $val = trim($_POST[$s_key] ?? '');
            if (!empty($_FILES[$f_key]['name']) && $_FILES[$f_key]['error'] === UPLOAD_ERR_OK) {
                $ext = strtolower(pathinfo($_FILES[$f_key]['name'], PATHINFO_EXTENSION));
                if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'])) {
                    $slug = str_replace(['cover_', '-'], ['', '_'], $s_key);
                    $fn = 'game_' . $slug . '_' . time() . '.' . $ext;
                    if (move_uploaded_file($_FILES[$f_key]['tmp_name'], $up_dir . $fn)) {
                        $val = GAMER_URL . '/images/covers/' . $fn;
                    }
                }
            }
            if (!empty($val)) {
                $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('{$s_key}', '{$db->real_escape_string($val)}') ON DUPLICATE KEY UPDATE setting_value = '{$db->real_escape_string($val)}'");
            }
        }

        $title_feat = trim($_POST['featured_game_title'] ?? 'HYPER-STRIKE');
        $sub_feat = trim($_POST['featured_game_sub'] ?? 'Luta Tática 2D • Torneio de Angola');
        $desc_feat = trim($_POST['featured_game_desc'] ?? '');

        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('featured_game_title', '{$db->real_escape_string($title_feat)}') ON DUPLICATE KEY UPDATE setting_value = '{$db->real_escape_string($title_feat)}'");
        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('featured_game_sub', '{$db->real_escape_string($sub_feat)}') ON DUPLICATE KEY UPDATE setting_value = '{$db->real_escape_string($sub_feat)}'");
        $db->query("INSERT INTO arena_admin_settings (setting_key, setting_value) VALUES ('featured_game_desc', '{$db->real_escape_string($desc_feat)}') ON DUPLICATE KEY UPDATE setting_value = '{$db->real_escape_string($desc_feat)}'");

        $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'UPDATE_COVERS', 'Atualizou capas dos jogos e Hero Banner', '{$ip}')");
        $msg = "Capas dos jogos e Hero Banner atualizados com sucesso!";
        $active_tab = 'covers';
    }

    // APROVAR VERIFICAÇÃO DE IDENTIDADE (KYC)
    if ($action === 'approve_kyc') {
        $kyc_id = (int)($_POST['kyc_id'] ?? 0);
        $q_k = $db->query("SELECT * FROM arena_verifications WHERE id = {$kyc_id} LIMIT 1");
        if ($q_k && $q_k->num_rows > 0) {
            $k_row = $q_k->fetch_assoc();
            $target_uid = (int)$k_row['user_id'];
            $db->query("UPDATE arena_verifications SET status = 'approved', reviewed_at = NOW(), reviewed_by = {$admin_id} WHERE id = {$kyc_id}");
            $db->query("UPDATE users SET user_verified = 1 WHERE user_id = {$target_uid}");
            $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'APPROVE_KYC', 'Aprovou KYC ID #{$kyc_id} de {$k_row['gamer_tag']} (User #{$target_uid})', '{$ip}')");
            $msg = "Verificação de Conta #{$kyc_id} ({$k_row['fullname']} - {$k_row['gamer_tag']}) foi APROVADA com sucesso!";
            $active_tab = 'kyc';
        }
    }

    // REJEITAR VERIFICAÇÃO DE IDENTIDADE (KYC)
    if ($action === 'reject_kyc') {
        $kyc_id = (int)($_POST['kyc_id'] ?? 0);
        $reason = trim($_POST['reject_reason'] ?? 'Documento ilegível, cortado ou com dados divergentes.');
        $q_k = $db->query("SELECT * FROM arena_verifications WHERE id = {$kyc_id} LIMIT 1");
        if ($q_k && $q_k->num_rows > 0) {
            $k_row = $q_k->fetch_assoc();
            $target_uid = (int)$k_row['user_id'];
            $reason_esc = $db->real_escape_string($reason);
            $db->query("UPDATE arena_verifications SET status = 'rejected', admin_notes = '{$reason_esc}', reviewed_at = NOW(), reviewed_by = {$admin_id} WHERE id = {$kyc_id}");
            $db->query("UPDATE users SET user_verified = 0 WHERE user_id = {$target_uid}");
            $db->query("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES ({$admin_id}, '{$db->real_escape_string($admin_name)}', 'REJECT_KYC', 'Recusou KYC ID #{$kyc_id} do utilizador #{$target_uid}: {$reason_esc}', '{$ip}')");
            $msg = "Verificação de Conta #{$kyc_id} foi REJEITADA com o motivo registado.";
            $active_tab = 'kyc';
        }
    }
}

// Consultas de Configurações Atuais
$arena_settings = [];
$res_st = $db->query("SELECT setting_key, setting_value FROM arena_admin_settings");
if ($res_st) {
    while ($st_r = $res_st->fetch_assoc()) {
        $arena_settings[$st_r['setting_key']] = $st_r['setting_value'];
    }
}
$current_platform_fee = isset($arena_settings['platform_fee_percent']) ? (float)$arena_settings['platform_fee_percent'] : 10.0;
$current_max_bots = isset($arena_settings['max_active_bots']) ? (int)$arena_settings['max_active_bots'] : 15;
$current_bot_timeout = isset($arena_settings['bot_fill_timeout_seconds']) ? (int)$arena_settings['bot_fill_timeout_seconds'] : 60;
$current_base_online = isset($arena_settings['live_metrics_base_online']) ? (int)$arena_settings['live_metrics_base_online'] : 8;
$current_base_battles = isset($arena_settings['live_metrics_base_battles']) ? (int)$arena_settings['live_metrics_base_battles'] : 3;
$current_base_matches = isset($arena_settings['live_metrics_base_matches_today']) ? (int)$arena_settings['live_metrics_base_matches_today'] : 18;
$current_base_prizes = isset($arena_settings['live_metrics_base_prizes']) ? (int)$arena_settings['live_metrics_base_prizes'] : 1340000;
$current_fluct_enabled = !isset($arena_settings['live_metrics_fluctuation_enabled']) || $arena_settings['live_metrics_fluctuation_enabled'] == '1';


// Perfil de Suporte
$support_agent_name = $arena_settings['support_agent_name'] ?? 'Paula Sousa — Atendimento VIP Casino56';
$support_agent_status = $arena_settings['support_agent_status'] ?? '● Online — Resposta Imediata';
$support_agent_avatar = $arena_settings['support_agent_avatar'] ?? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80';

// Utilizadores reais online (ativos nos últimos 15 min)
$kpi_real_online = (int)($db->query("SELECT COUNT(*) FROM users WHERE user_last_seen >= NOW() - INTERVAL 15 MINUTE")->fetch_row()[0] ?? 0);
if ($kpi_real_online < 1) $kpi_real_online = 1;

// Bots a batalhar ao vivo entre si
$kpi_bots_battling = (int)($db->query("SELECT COUNT(*) FROM arena_challenges WHERE status = 'accepted' AND is_bot = 1")->fetch_row()[0] ?? 0);

// Duelos totais ao vivo em andamento
$kpi_live_battles = (int)($db->query("SELECT COUNT(*) FROM arena_challenges WHERE status = 'accepted'")->fetch_row()[0] ?? 0);

// Saques Pendentes
$kpi_pending_withdrawals = (int)($db->query("SELECT COUNT(*) FROM arena_withdrawals WHERE status = 'pending'")->fetch_row()[0] ?? 0);
$kpi_pending_withdrawals_sum = (float)($db->query("SELECT SUM(amount) FROM arena_withdrawals WHERE status = 'pending'")->fetch_row()[0] ?? 0.0);

// Consultas de KPIs Gerais
$kpi_bots = $db->query("SELECT COUNT(*) FROM arena_bots WHERE is_active = 1")->fetch_row()[0] ?? 0;
$kpi_players = $db->query("SELECT COUNT(*) FROM arena_profiles")->fetch_row()[0] ?? 0;
$kpi_matches = $db->query("SELECT COUNT(*) FROM arena_matches")->fetch_row()[0] ?? 0;
$kpi_rooms = $db->query("SELECT COUNT(*) FROM arena_rooms WHERE status = 'waiting'")->fetch_row()[0] ?? 0;

// Consultas Financeiras da Plataforma
$fin_total_volume = (float)($db->query("SELECT SUM(bet_amount * 2) FROM arena_challenges WHERE status = 'completed'")->fetch_row()[0] ?? 0.0);
$fin_admin_profit = (float)($db->query("SELECT SUM(amount) FROM wallet_transactions WHERE user_id = 1 AND node_type = 'arena_platform_fee'")->fetch_row()[0] ?? 0.0);
if ($fin_admin_profit <= 0 && $fin_total_volume > 0) {
    $fin_admin_profit = round($fin_total_volume * 0.10, 2);
}

// 1. Ganhos da Casa (Taxas Retidas da Plataforma)
$fin_admin_rake = (float)($db->query("SELECT SUM(platform_fee_amount) FROM arena_challenges WHERE status = 'completed' AND bet_amount > 0")->fetch_row()[0] ?? 0.0);
if ($fin_admin_rake <= 0 && $fin_admin_profit > 0) {
    $fin_admin_rake = $fin_admin_profit;
}

// 2. Ganhos dos Bots (Prêmios das vitórias dos Bots contra humanos)
$res_bot_wins = $db->query("
    SELECT SUM((c.bet_amount * 2) - c.platform_fee_amount) as total_bot_wins,
           COUNT(*) as bot_wins_count
    FROM arena_challenges c
    LEFT JOIN arena_matches m ON (m.room_id = c.challenge_token OR m.room_id LIKE CONCAT('%', c.challenge_token, '%'))
    WHERE c.bet_amount > 0 AND c.is_bot = 1 AND (m.winner_id = c.bot_id OR c.status = 'forfeited' OR (m.winner_id > 0 AND m.winner_id != c.challenger_id))
");
$row_bot_wins = $res_bot_wins ? $res_bot_wins->fetch_assoc() : null;
$fin_bots_earnings = (float)($row_bot_wins['total_bot_wins'] ?? 0.0);
$fin_bots_wins_count = (int)($row_bot_wins['bot_wins_count'] ?? 0);

// 3. Faturamento Geral do Administrador (Comissão da Casa + Lucro dos Bots)
$fin_admin_grand_total = $fin_admin_rake + $fin_bots_earnings;

$fin_prizes_paid = (float)($db->query("SELECT SUM(amount) FROM wallet_transactions WHERE node_type = 'arena_win'")->fetch_row()[0] ?? 0.0);
if ($fin_prizes_paid <= 0 && $fin_total_volume > 0) {
    $fin_prizes_paid = round($fin_total_volume * 0.90, 2);
}
$fin_total_battles_w_bet = (int)($db->query("SELECT COUNT(*) FROM arena_challenges WHERE status = 'completed' AND bet_amount > 0")->fetch_row()[0] ?? 0);

// Carregar Motor de IA
require_once(__DIR__ . '/includes/ArenaAIEngine.php');
$ai_settings = ArenaAIEngine::getSettings($db);
$ai_recent_thoughts = ArenaAIEngine::getRecentThoughts(25, $db);

// Lista Detalhada das Partidas Financeiras
$financial_matches = [];
$res_fin = $db->query("
    SELECT c.id, c.challenge_token, c.game_type, c.bet_amount, c.platform_fee_amount, c.challenger_tag, c.challenged_tag, c.is_bot, c.bot_id, c.status, c.created_at,
           m.winner_id, m.is_draw, m.duration_seconds, m.played_at
    FROM arena_challenges c
    LEFT JOIN arena_matches m ON (m.room_id = c.challenge_token OR m.room_id LIKE CONCAT('%', c.challenge_token, '%'))
    WHERE c.bet_amount > 0
    ORDER BY c.id DESC LIMIT 40
");
if ($res_fin) {
    while ($rf = $res_fin->fetch_assoc()) {
        $financial_matches[] = $rf;
    }
}

// Lista de Oponentes Programados
$bots = [];
$res_b = $db->query("SELECT * FROM arena_bots ORDER BY id ASC");
if ($res_b) {
    while ($r = $res_b->fetch_assoc()) {
        $bots[] = $r;
    }
}

// Histórico de Partidas
$recent_matches = [];
$res_m = $db->query("SELECT * FROM arena_matches ORDER BY played_at DESC LIMIT 25");
if ($res_m) {
    while ($r = $res_m->fetch_assoc()) {
        $recent_matches[] = $r;
    }
}

// Logs de Auditoria
$logs = [];
$res_l = $db->query("SELECT * FROM arena_admin_logs ORDER BY created_at DESC LIMIT 25");
if ($res_l) {
    while ($r = $res_l->fetch_assoc()) {
        $logs[] = $r;
    }
}

// Verificações de Identidade (KYC)
$kyc_pending_count = (int)($db->query("SELECT COUNT(*) FROM arena_verifications WHERE status = 'pending'")->fetch_row()[0] ?? 0);
$kyc_list = [];
$res_kyc = $db->query("SELECT * FROM arena_verifications ORDER BY FIELD(status, 'pending', 'rejected', 'approved'), id DESC LIMIT 100");
if ($res_kyc) {
    while ($rk = $res_kyc->fetch_assoc()) {
        $kyc_list[] = $rk;
    }
}

$page_title = 'Painel de Gestão da Arena';
require_once(__DIR__ . '/header.php');
?>

<!-- Painel de Gestão Administrativa Oficial da Arena -->
<main class="arena-page-body" style="padding: 20px 24px; max-width: 1400px; margin: 0 auto; width: 100%;">
    
    <!-- Header Executivo da Administração -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; flex-wrap: wrap; gap: 14px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #ef4444, #b91c1c); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.3rem; box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);">
                <i class="fa-solid fa-gauge-high"></i>
            </div>
            <div>
                <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff; font-family: var(--font-gamer); margin: 0;">GESTOR ARENA & OPONENTES</h1>
                <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">Console de Administração NgolaBiz • Angola (GMT+1)</p>
            </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
            <?php if ($active_tab === 'users'): ?>
                <button type="button" onclick="document.getElementById('modal-create-user').classList.add('active')" style="background: linear-gradient(135deg, #22C98B, #10B981); color: #000; font-weight: 800; font-size: 0.84rem; padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-user-plus"></i> Criar Nova Conta
                </button>
            <?php elseif ($active_tab === 'bots'): ?>
                <button type="button" onclick="openCreateBotModal()" style="background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; font-weight: 800; font-size: 0.84rem; padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-plus"></i> Programar Novo Bot
                </button>
            <?php elseif ($active_tab === 'support'): ?>
                <a href="<?php echo GAMER_URL; ?>/suporte.php" style="background: linear-gradient(135deg, #38bdf8, #0284c7); color: #000; font-weight: 800; font-size: 0.84rem; padding: 9px 16px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-comments"></i> Abrir Chat de Suporte
                </a>
            <?php endif; ?>

            <a href="<?php echo GAMER_URL; ?>/index.php" style="background: #171C26; border: 1px solid #282F3D; color: #9AA4B2; padding: 9px 14px; border-radius: 8px; text-decoration: none; font-size: 0.84rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-gamepad"></i> Ir para a Arena
            </a>
        </div>
    </div>



    <?php if (!empty($msg)): ?>
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid var(--neon-green); color: #a7f3d0; padding: 12px 18px; border-radius: 10px; margin-bottom: 20px;">
            <i class="fa-solid fa-circle-check"></i> <?php echo htmlspecialchars($msg); ?>
        </div>
    <?php endif; ?>

    <?php if (!empty($err)): ?>
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid var(--neon-red); color: #fecaca; padding: 12px 18px; border-radius: 10px; margin-bottom: 20px;">
            <i class="fa-solid fa-triangle-exclamation"></i> <?php echo htmlspecialchars($err); ?>
        </div>
    <?php endif; ?>

        
        <!-- ABA: VERIFICAÇÃO DE IDENTIDADE (KYC) -->
        <?php if ($active_tab === 'kyc'): ?>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 14px;">
                <div>
                    <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff; margin: 0;">
                        <i class="fa-solid fa-id-card" style="color: #F0444A; margin-right: 8px;"></i> Auditoria de Identidade & Contas (KYC)
                    </h1>
                    <p style="color: var(--text-muted); font-size: 0.90rem; margin: 4px 0 0 0;">
                        Analise os documentos oficiais enviados pelos jogadores (Bilhete de Identidade, Carta de Condução e Passaporte) para aprovar ou rejeitar o acesso à plataforma.
                    </p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <span style="background: rgba(240,68,74,0.15); border: 1px solid #F0444A; color: #F0444A; padding: 8px 16px; border-radius: 8px; font-weight: 800; font-size: 0.85rem;">
                        <?php echo $kyc_pending_count; ?> Pedidos Pendentes
                    </span>
                </div>
            </div>

            <div class="arena-table-container" style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; overflow-x: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.3);">
                <table style="width: 100%; border-collapse: collapse; min-width: 900px; text-align: left; font-size: 0.88rem;">
                    <thead>
                        <tr style="background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid #282F3D; color: #9AA4B2; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;">
                            <th style="padding: 14px 16px;">ID</th>
                            <th style="padding: 14px 16px;">Jogador</th>
                            <th style="padding: 14px 16px;">Documento</th>
                            <th style="padding: 14px 16px;">Nº Documento</th>
                            <th style="padding: 14px 16px;">Data Envio</th>
                            <th style="padding: 14px 16px; text-align: center;">Fotos (Frente / Verso)</th>
                            <th style="padding: 14px 16px; text-align: center;">Estado</th>
                            <th style="padding: 14px 16px; text-align: right;">Ações de Aprovação</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($kyc_list)): ?>
                            <tr>
                                <td colspan="8" style="text-align: center; padding: 36px; color: #9AA4B2;">
                                    Nenhum pedido de verificação de conta registado até ao momento.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($kyc_list as $kyc): 
                                $front_url = GAMER_URL . '/uploads/kyc/' . htmlspecialchars($kyc['doc_front']);
                                $back_url = !empty($kyc['doc_back']) ? (GAMER_URL . '/uploads/kyc/' . htmlspecialchars($kyc['doc_back'])) : null;
                            ?>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;">
                                    <td style="padding: 14px 16px; font-weight: 800; color: #9AA4B2;">#<?php echo $kyc['id']; ?></td>
                                    <td style="padding: 14px 16px;">
                                        <strong style="color: #fff; display: block; font-size: 0.92rem;"><?php echo htmlspecialchars($kyc['fullname']); ?></strong>
                                        <span style="color: #F0444A; font-size: 0.78rem; font-weight: 700;">@<?php echo htmlspecialchars($kyc['gamer_tag']); ?></span>
                                        <span style="color: #9AA4B2; font-size: 0.72rem; margin-left: 6px;">(User #<?php echo $kyc['user_id']; ?> • <?php echo htmlspecialchars($kyc['province']); ?>)</span>
                                    </td>
                                    <td style="padding: 14px 16px;">
                                        <span class="badge" style="background: rgba(255,255,255,0.08); color: #fff; font-weight: 800; padding: 4px 8px; border-radius: 6px; text-transform: uppercase;">
                                            <?php echo htmlspecialchars($kyc['doc_type']); ?>
                                        </span>
                                    </td>
                                    <td style="padding: 14px 16px; font-family: monospace; font-size: 0.90rem; color: #F59E0B; font-weight: 700;">
                                        <?php echo htmlspecialchars($kyc['doc_number']); ?>
                                    </td>
                                    <td style="padding: 14px 16px; font-size: 0.78rem; color: #9AA4B2;">
                                        <?php echo date('d/m/Y H:i', strtotime($kyc['created_at'])); ?>
                                    </td>
                                    <td style="padding: 14px 16px; text-align: center;">
                                        <div style="display: inline-flex; gap: 8px;">
                                            <a href="<?php echo $front_url; ?>" target="_blank" style="padding: 4px 10px; background: rgba(34,201,139,0.15); border: 1px solid #22C98B; color: #22C98B; border-radius: 6px; text-decoration: none; font-size: 0.75rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">
                                                <i class="fa-solid fa-image"></i> Frente
                                            </a>
                                            <?php if ($back_url): ?>
                                                <a href="<?php echo $back_url; ?>" target="_blank" style="padding: 4px 10px; background: rgba(6,182,212,0.15); border: 1px solid #06b6d4; color: #06b6d4; border-radius: 6px; text-decoration: none; font-size: 0.75rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">
                                                    <i class="fa-solid fa-image"></i> Verso
                                                </a>
                                            <?php else: ?>
                                                <span style="color: #64748b; font-size: 0.75rem; padding: 4px 8px;">Sem verso</span>
                                            <?php endif; ?>
                                        </div>
                                    </td>
                                    <td style="padding: 14px 16px; text-align: center;">
                                        <?php if ($kyc['status'] === 'approved'): ?>
                                            <span style="background: rgba(34,201,139,0.15); border: 1px solid #22C98B; color: #22C98B; font-weight: 800; font-size: 0.75rem; padding: 4px 10px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;">
                                                <i class="fa-solid fa-circle-check"></i> Aprovado
                                            </span>
                                        <?php elseif ($kyc['status'] === 'rejected'): ?>
                                            <span style="background: rgba(240,68,74,0.15); border: 1px solid #F0444A; color: #F0444A; font-weight: 800; font-size: 0.75rem; padding: 4px 10px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;" title="<?php echo htmlspecialchars($kyc['admin_notes']); ?>">
                                                <i class="fa-solid fa-circle-xmark"></i> Rejeitado
                                            </span>
                                        <?php else: ?>
                                            <span style="background: rgba(245,158,11,0.15); border: 1px solid #F59E0B; color: #F59E0B; font-weight: 800; font-size: 0.75rem; padding: 4px 10px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;">
                                                <i class="fa-solid fa-clock"></i> Pendente
                                            </span>
                                        <?php endif; ?>
                                    </td>
                                    <td style="padding: 14px 16px; text-align: right;">
                                        <div style="display: inline-flex; gap: 6px; justify-content: flex-end;">
                                            <?php if ($kyc['status'] !== 'approved'): ?>
                                                <form method="POST" style="display: inline;" onsubmit="return confirm('Deseja realmente APROVAR a verificação deste jogador?');">
                                                    <input type="hidden" name="action" value="approve_kyc">
                                                    <input type="hidden" name="kyc_id" value="<?php echo $kyc['id']; ?>">
                                                    <button type="submit" style="padding: 6px 12px; background: #22C98B; color: #090B10; border: none; border-radius: 6px; font-weight: 800; font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                                                        <i class="fa-solid fa-check"></i> Aprovar
                                                    </button>
                                                </form>
                                            <?php endif; ?>

                                            <?php if ($kyc['status'] !== 'rejected'): ?>
                                                <button type="button" onclick="openRejectKycModal(<?php echo $kyc['id']; ?>, '<?php echo addslashes($kyc['fullname']); ?>')" style="padding: 6px 12px; background: rgba(240,68,74,0.15); border: 1px solid #F0444A; color: #F0444A; border-radius: 6px; font-weight: 800; font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                                                    <i class="fa-solid fa-xmark"></i> Rejeitar
                                                </button>
                                            <?php endif; ?>
                                        </div>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>

            <!-- MODAL DE REJEIÇÃO DE KYC COM MOTIVO -->
            <div id="modal-reject-kyc" class="radar-modal-overlay" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; align-items: center; justify-content: center;">
                <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 16px; padding: 24px; max-width: 480px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                        <h3 style="font-family: var(--font-gamer); font-size: 1.25rem; font-weight: 800; color: #fff; margin: 0;">
                            <i class="fa-solid fa-triangle-exclamation" style="color: #F0444A; margin-right: 6px;"></i> Rejeitar Documento KYC
                        </h3>
                        <button type="button" onclick="document.getElementById('modal-reject-kyc').style.display='none'" style="background: none; border: none; color: #9AA4B2; font-size: 1.2rem; cursor: pointer;">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <form method="POST">
                        <input type="hidden" name="action" value="reject_kyc">
                        <input type="hidden" name="kyc_id" id="reject_kyc_id" value="0">
                        <p style="font-size: 0.85rem; color: #9AA4B2; margin-bottom: 12px;">
                            Indique ao jogador <strong id="reject_kyc_name" style="color: #fff;"></strong> o motivo pelo qual a documentação foi recusada:
                        </p>
                        <textarea name="reject_reason" required rows="3" placeholder="Ex: A foto da frente do BI está cortada e com reflexos. Por favor envie uma foto nítida e com os 4 cantos visíveis." style="width: 100%; background: #10141C; border: 1px solid #282F3D; border-radius: 8px; padding: 10px 12px; color: #fff; font-size: 0.85rem; margin-bottom: 16px;"></textarea>
                        <div style="display: flex; justify-content: flex-end; gap: 10px;">
                            <button type="button" onclick="document.getElementById('modal-reject-kyc').style.display='none'" class="btn-ngola btn-ngola-secondary btn-sm" style="padding: 8px 16px;">Cancelar</button>
                            <button type="submit" class="btn-ngola btn-ngola-primary btn-sm" style="padding: 8px 16px; background: #F0444A; border-color: #F0444A;">Confirmar Rejeição</button>
                        </div>
                    </form>
                </div>
            </div>

            <script>
            function openRejectKycModal(id, name) {
                document.getElementById('reject_kyc_id').value = id;
                document.getElementById('reject_kyc_name').innerText = name;
                document.getElementById('modal-reject-kyc').style.display = 'flex';
            }
            </script>
        <?php endif; ?>

                <!-- ABA: VISÃO GERAL & KPIS EM TEMPO REAL -->
        <?php if ($active_tab === 'overview'): ?>
            <!-- ROW 1: KPIS PRINCIPAIS EM TEMPO REAL -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
                
                <!-- Utilizadores Reais Online -->
                <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; padding: 18px 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #22C98B;"></div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 0.76rem; font-weight: 800; color: #9AA4B2; text-transform: uppercase; letter-spacing: 0.5px;">Utilizadores Reais Online</span>
                        <span class="online-status-indicator" style="background: #22C98B; width: 8px; height: 8px;"></span>
                    </div>
                    <div style="font-size: 1.85rem; font-weight: 900; color: #fff; font-family: var(--font-gamer);">
                        <?php echo $kpi_real_online; ?>
                    </div>
                    <div style="font-size: 0.72rem; color: #22C98B; margin-top: 4px; font-weight: 700;">
                        <i class="fa-solid fa-signal"></i> Conectados em Tempo Real
                    </div>
                </div>

                <!-- Bots a Batalhar Ao Vivo -->
                <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; padding: 18px 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #38bdf8;"></div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 0.76rem; font-weight: 800; color: #9AA4B2; text-transform: uppercase; letter-spacing: 0.5px;">Bots a Batalhar Ao Vivo</span>
                        <i class="fa-solid fa-robot" style="color: #38bdf8;"></i>
                    </div>
                    <div style="font-size: 1.85rem; font-weight: 900; color: #fff; font-family: var(--font-gamer);">
                        <?php echo $kpi_bots_battling; ?> <span style="font-size: 0.95rem; color: #9AA4B2; font-weight: 400;">/ <?php echo $kpi_bots; ?> bots</span>
                    </div>
                    <div style="font-size: 0.72rem; color: #38bdf8; margin-top: 4px; font-weight: 700;">
                        <i class="fa-solid fa-arrows-rotate fa-spin"></i> Partidas Simultâneas
                    </div>
                </div>

                <!-- Total de Duelos em Andamento -->
                <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; padding: 18px 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #F0444A;"></div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 0.76rem; font-weight: 800; color: #9AA4B2; text-transform: uppercase; letter-spacing: 0.5px;">Duelos Totais no Ar</span>
                        <i class="fa-solid fa-swords" style="color: #F0444A;"></i>
                    </div>
                    <div style="font-size: 1.85rem; font-weight: 900; color: #fff; font-family: var(--font-gamer);">
                        <?php echo $kpi_live_battles; ?>
                    </div>
                    <div style="font-size: 0.72rem; color: #F0444A; margin-top: 4px; font-weight: 700;">
                        <i class="fa-solid fa-bolt"></i> 1v1 com Apostas Ativas
                    </div>
                </div>

                <!-- Pedidos de Saque Pendentes -->
                <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; padding: 18px 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #F59E0B;"></div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 0.76rem; font-weight: 800; color: #9AA4B2; text-transform: uppercase; letter-spacing: 0.5px;">Saques Pendentes</span>
                        <i class="fa-solid fa-money-bill-transfer" style="color: #F59E0B;"></i>
                    </div>
                    <div style="font-size: 1.85rem; font-weight: 900; color: #F59E0B; font-family: var(--font-gamer);">
                        <?php echo $kpi_pending_withdrawals; ?>
                    </div>
                    <div style="font-size: 0.72rem; color: #9AA4B2; margin-top: 4px;">
                        Total: <strong style="color: #fff;"><?php echo arena_money($kpi_pending_withdrawals_sum); ?></strong>
                    </div>
                </div>
            </div>

            <!-- ROW 2: GANHOS DA PLATAFORMA & GANHOS DOS BOTS -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-bottom: 24px;">
                
                <!-- Lucro Líquido da Plataforma (Rake) -->
                <div style="background: linear-gradient(145deg, #161c28, #10141d); border: 1.5px solid rgba(34, 201, 139, 0.4); border-radius: 16px; padding: 22px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(34, 201, 139, 0.15); display: flex; align-items: center; justify-content: center; color: #22C98B;">
                                <i class="fa-solid fa-vault" style="font-size: 1.1rem;"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 1.05rem; font-weight: 800; color: #fff; margin: 0;">Lucro Líquido da Plataforma</h3>
                                <span style="font-size: 0.75rem; color: #9AA4B2;">Taxa de Rake (<?php echo $current_platform_fee; ?>%) retida das batalhas</span>
                            </div>
                        </div>
                        <span style="background: rgba(34, 201, 139, 0.2); color: #22C98B; font-size: 0.72rem; font-weight: 900; padding: 3px 8px; border-radius: 999px;">Cofre Oficial</span>
                    </div>
                    <div style="font-size: 2.2rem; font-weight: 900; color: #22C98B; font-family: var(--font-gamer); margin: 10px 0;">
                        <?php echo arena_money($fin_admin_rake); ?>
                    </div>
                    <p style="font-size: 0.78rem; color: #9AA4B2; margin: 0; line-height: 1.4;">
                        Valor acumulado automaticamente em cada duelo de apostas finalizado na Arena Gamer.
                    </p>
                </div>

                <!-- Ganhos Acumulados dos Bots -->
                <div style="background: linear-gradient(145deg, #161c28, #10141d); border: 1.5px solid rgba(56, 189, 248, 0.4); border-radius: 16px; padding: 22px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(56, 189, 248, 0.15); display: flex; align-items: center; justify-content: center; color: #38bdf8;">
                                <i class="fa-solid fa-trophy" style="font-size: 1.1rem;"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 1.05rem; font-weight: 800; color: #fff; margin: 0;">Ganhos dos Oponentes Bots</h3>
                                <span style="font-size: 0.75rem; color: #9AA4B2;"><?php echo $fin_bots_wins_count; ?> vitórias de bots contra desafiantes</span>
                            </div>
                        </div>
                        <span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 0.72rem; font-weight: 900; padding: 3px 8px; border-radius: 999px;">Bots Casino56</span>
                    </div>
                    <div style="font-size: 2.2rem; font-weight: 900; color: #38bdf8; font-family: var(--font-gamer); margin: 10px 0;">
                        <?php echo arena_money($fin_bots_earnings); ?>
                    </div>
                    <p style="font-size: 0.78rem; color: #9AA4B2; margin: 0; line-height: 1.4;">
                        Prémios líquidos das apostas vencidas pelos 20 bots inteligentes da plataforma.
                    </p>
                </div>

                <!-- Faturamento Geral Admin -->
                <div style="background: linear-gradient(145deg, #161c28, #10141d); border: 1.5px solid rgba(245, 158, 11, 0.4); border-radius: 16px; padding: 22px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(245, 158, 11, 0.15); display: flex; align-items: center; justify-content: center; color: #F59E0B;">
                                <i class="fa-solid fa-crown" style="font-size: 1.1rem;"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 1.05rem; font-weight: 800; color: #fff; margin: 0;">Faturamento Global Administrador</h3>
                                <span style="font-size: 0.75rem; color: #9AA4B2;">Rake Total + Retenção dos Bots</span>
                            </div>
                        </div>
                        <span style="background: rgba(245, 158, 11, 0.2); color: #F59E0B; font-size: 0.72rem; font-weight: 900; padding: 3px 8px; border-radius: 999px;">Receita Bruta</span>
                    </div>
                    <div style="font-size: 2.2rem; font-weight: 900; color: #F59E0B; font-family: var(--font-gamer); margin: 10px 0;">
                        <?php echo arena_money($fin_admin_grand_total); ?>
                    </div>
                    <p style="font-size: 0.78rem; color: #9AA4B2; margin: 0; line-height: 1.4;">
                        Saldo total obtido pela operação da plataforma somando comissão e saldo dos bots.
                    </p>
                </div>
            </div>

            <!-- ATALHOS RÁPIDOS DE AUDITORIA -->
            <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <div style="font-weight: 800; color: #fff; font-size: 1rem; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-compass" style="color: #F0444A;"></i> Acesso Rápido às Seções Administrativas
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <a href="?tab=users" style="background: #10141C; border: 1px solid #282F3D; color: #fff; padding: 10px 16px; border-radius: 10px; text-decoration: none; font-size: 0.85rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-users" style="color: #38bdf8;"></i> Gestão de Utilizadores (<?php echo $kpi_players; ?>)
                    </a>
                    <a href="?tab=withdrawals" style="background: #10141C; border: 1px solid #282F3D; color: #fff; padding: 10px 16px; border-radius: 10px; text-decoration: none; font-size: 0.85rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-money-bill-transfer" style="color: #F59E0B;"></i> Pedidos de Saque <?php if ($kpi_pending_withdrawals > 0): ?><span style="background:#F0444A;color:#fff;font-size:10px;padding:1px 6px;border-radius:999px;"><?php echo $kpi_pending_withdrawals; ?></span><?php endif; ?>
                    </a>
                    <a href="?tab=kyc" style="background: #10141C; border: 1px solid #282F3D; color: #fff; padding: 10px 16px; border-radius: 10px; text-decoration: none; font-size: 0.85rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-id-card" style="color: #a855f7;"></i> Verificação KYC <?php if ($kyc_pending_count > 0): ?><span style="background:#F59E0B;color:#000;font-size:10px;padding:1px 6px;border-radius:999px;"><?php echo $kyc_pending_count; ?></span><?php endif; ?>
                    </a>
                    <a href="?tab=covers" style="background: #10141C; border: 1px solid #282F3D; color: #fff; padding: 10px 16px; border-radius: 10px; text-decoration: none; font-size: 0.85rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-image" style="color: #22C98B;"></i> Upload de Capas & Banner
                    </a>
                    <a href="?tab=support" style="background: #10141C; border: 1px solid #282F3D; color: #fff; padding: 10px 16px; border-radius: 10px; text-decoration: none; font-size: 0.85rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-headset" style="color: #ef4444;"></i> Perfil do Atendente
                    </a>
                    <a href="?tab=bots" style="background: #10141C; border: 1px solid #282F3D; color: #fff; padding: 10px 16px; border-radius: 10px; text-decoration: none; font-size: 0.85rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-users-gear" style="color: #c084fc;"></i> Gerir Oponentes Bots (20)
                    </a>
                </div>
            </div>
        

        <!-- ABA: GESTÃO DE UTILIZADORES -->
        <?php elseif ($active_tab === 'users'): ?>
            <?php
            $search_q = trim($_GET['q'] ?? '');
            $where_u = "";
            if (!empty($search_q)) {
                $q_esc = $db->real_escape_string($search_q);
                $where_u = "WHERE u.user_name LIKE '%{$q_esc}%' OR u.user_email LIKE '%{$q_esc}%' OR u.user_firstname LIKE '%{$q_esc}%' OR p.gamer_tag LIKE '%{$q_esc}%' OR u.user_id = '{$q_esc}'";
            }

            $users_list = [];
            $res_users = $db->query("
                SELECT u.user_id, u.user_name, u.user_email, u.user_phone, u.user_firstname, u.user_lastname,
                       u.user_current_city, u.user_wallet_balance, u.user_banned, u.user_verified, u.user_registered, u.user_picture,
                       p.gamer_tag, p.competitive_points
                FROM users u
                LEFT JOIN arena_profiles p ON p.user_id = u.user_id
                {$where_u}
                ORDER BY u.user_id DESC
                LIMIT 150
            ");
            if ($res_users) {
                while ($ru = $res_users->fetch_assoc()) $users_list[] = $ru;
            }
            ?>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 14px;">
                <div>
                    <h2 style="font-size: 1.4rem; font-weight: 800; color: #fff; margin: 0;">
                        <i class="fa-solid fa-users" style="color: #38bdf8; margin-right: 8px;"></i> Controlo Total de Utilizadores
                    </h2>
                    <p style="color: #9AA4B2; font-size: 0.85rem; margin: 4px 0 0 0;">
                        Pesquise, edite, injete saldo na carteira, redefina senhas, bana ou aceda diretamente à conta de qualquer jogador.
                    </p>
                </div>
                
                <form method="GET" style="display: flex; gap: 8px; align-items: center;">
                    <input type="hidden" name="tab" value="users">
                    <input type="text" name="q" value="<?php echo htmlspecialchars($search_q); ?>" placeholder="Pesquisar por nome, tag, e-mail ou ID..." style="background: #121720; border: 1px solid #282F3D; border-radius: 8px; padding: 9px 14px; color: #fff; font-size: 0.88rem; width: 280px;">
                    <button type="submit" style="background: #171C26; border: 1px solid #282F3D; color: #fff; padding: 9px 14px; border-radius: 8px; cursor: pointer;">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </button>
                    <?php if (!empty($search_q)): ?>
                        <a href="?tab=users" style="background: #171C26; border: 1px solid #282F3D; color: #F0444A; padding: 9px 12px; border-radius: 8px; text-decoration: none;" title="Limpar pesquisa">✕</a>
                    <?php endif; ?>
                </form>
            </div>

            <div class="arena-table-container" style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; overflow-x: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.3);">
                <table style="width: 100%; border-collapse: collapse; min-width: 950px; text-align: left; font-size: 0.88rem;">
                    <thead>
                        <tr style="background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid #282F3D; color: #9AA4B2; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;">
                            <th style="padding: 14px 16px;">ID</th>
                            <th style="padding: 14px 16px;">Jogador & Gamer Tag</th>
                            <th style="padding: 14px 16px;">Contacto & E-mail</th>
                            <th style="padding: 14px 16px;">Saldo em Carteira</th>
                            <th style="padding: 14px 16px; text-align: center;">Estado</th>
                            <th style="padding: 14px 16px; text-align: right;">Ações Administrativas</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($users_list)): ?>
                            <tr>
                                <td colspan="6" style="text-align: center; padding: 36px; color: #9AA4B2;">
                                    Nenhum utilizador encontrado para os termos da pesquisa.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($users_list as $u): 
                                $u_fullname = trim(($u['user_firstname'] ?? '') . ' ' . ($u['user_lastname'] ?? '')) ?: $u['user_name'];
                                $u_tag = $u['gamer_tag'] ?: $u['user_name'];
                                $u_pic = (!empty($u['user_picture']) && filter_var($u['user_picture'], FILTER_VALIDATE_URL)) ? $u['user_picture'] : ('https://ui-avatars.com/api/?name=' . urlencode($u_fullname) . '&background=ef4444&color=fff&bold=true');
                                $u_banned = (int)($u['user_banned'] ?? 0);
                                $u_verified = (int)($u['user_verified'] ?? 0);
                            ?>
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s;">
                                <td style="padding: 14px 16px; font-weight: 800; color: #9AA4B2;">#<?php echo $u['user_id']; ?></td>
                                <td style="padding: 14px 16px;">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <img src="<?php echo htmlspecialchars($u_pic); ?>" alt="Avatar" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid #282F3D;">
                                        <div>
                                            <strong style="color: #fff; font-size: 0.92rem; display: block;"><?php echo htmlspecialchars($u_fullname); ?></strong>
                                            <span style="color: #F0444A; font-weight: 700; font-size: 0.78rem;">@<?php echo htmlspecialchars($u_tag); ?></span>
                                            <span style="color: #64748B; font-size: 0.72rem;">• <?php echo htmlspecialchars($u['user_current_city'] ?: 'Luanda'); ?></span>
                                        </div>
                                    </div>
                                </td>
                                <td style="padding: 14px 16px;">
                                    <div style="color: #cbd5e1; font-size: 0.84rem;"><?php echo htmlspecialchars($u['user_email']); ?></div>
                                    <div style="color: #9AA4B2; font-size: 0.75rem;"><?php echo htmlspecialchars($u['user_phone'] ?: 'Sem telemóvel'); ?></div>
                                </td>
                                <td style="padding: 14px 16px;">
                                    <span style="font-family: var(--font-gamer); font-weight: 800; font-size: 0.95rem; color: #22C98B;">
                                        <?php echo arena_money($u['user_wallet_balance']); ?>
                                    </span>
                                </td>
                                <td style="padding: 14px 16px; text-align: center;">
                                    <?php if ($u_banned): ?>
                                        <span style="background: rgba(240,68,74,0.15); border: 1px solid #F0444A; color: #F0444A; font-size: 0.68rem; font-weight: 800; padding: 2px 8px; border-radius: 999px;">
                                            Banido
                                        </span>
                                    <?php else: ?>
                                        <span style="background: rgba(34,201,139,0.15); border: 1px solid #22C98B; color: #22C98B; font-size: 0.68rem; font-weight: 800; padding: 2px 8px; border-radius: 999px;">
                                            Ativo
                                        </span>
                                    <?php endif; ?>
                                    <?php if ($u_verified): ?>
                                        <span title="Conta Verificada (KYC Aprovado)" style="color: #22C98B; margin-left: 4px; font-size: 0.85rem;"><i class="fa-solid fa-circle-check"></i></span>
                                    <?php endif; ?>
                                </td>
                                <td style="padding: 14px 16px; text-align: right;">
                                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                                        
                                        <!-- ENTRAR NA CONTA (IMPERSONATE) -->
                                        <form method="POST" style="display: inline;" onsubmit="return confirm('Deseja realmente entrar e navegar na conta de @<?php echo addslashes($u_tag); ?>?');">
                                            <input type="hidden" name="action" value="impersonate_user">
                                            <input type="hidden" name="target_user_id" value="<?php echo $u['user_id']; ?>">
                                            <button type="submit" style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #38bdf8; padding: 5px 10px; border-radius: 6px; font-size: 0.76rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Entrar na conta deste utilizador">
                                                <i class="fa-solid fa-right-to-bracket"></i> Entrar
                                            </button>
                                        </form>

                                        <!-- INJETAR SALDO -->
                                        <button type="button" onclick="openInjectBalanceModal(<?php echo $u['user_id']; ?>, '<?php echo addslashes($u_tag); ?>', <?php echo (float)$u['user_wallet_balance']; ?>)" style="background: rgba(34, 201, 139, 0.15); border: 1px solid #22C98B; color: #22C98B; padding: 5px 9px; border-radius: 6px; font-size: 0.76rem; font-weight: 800; cursor: pointer;" title="Adicionar ou retirar saldo">
                                            <i class="fa-solid fa-coins"></i> Saldo
                                        </button>

                                        <!-- REDEFINIR SENHA -->
                                        <button type="button" onclick="openResetPasswordModal(<?php echo $u['user_id']; ?>, '<?php echo addslashes($u_tag); ?>')" style="background: rgba(245, 158, 11, 0.15); border: 1px solid #F59E0B; color: #F59E0B; padding: 5px 9px; border-radius: 6px; font-size: 0.76rem; font-weight: 800; cursor: pointer;" title="Redefinir palavra-passe">
                                            <i class="fa-solid fa-key"></i>
                                        </button>

                                        <!-- EDITAR -->
                                        <button type="button" onclick="openEditUserModal(<?php echo htmlspecialchars(json_encode($u)); ?>)" style="background: #1F2736; border: 1px solid #282F3D; color: #cbd5e1; padding: 5px 9px; border-radius: 6px; font-size: 0.76rem; cursor: pointer;" title="Editar dados">
                                            <i class="fa-solid fa-pen"></i>
                                        </button>

                                        <!-- BANIR / DESBANIR -->
                                        <form method="POST" style="display: inline;" onsubmit="return confirm('Tem a certeza desta ação de banimento?');">
                                            <input type="hidden" name="action" value="admin_toggle_ban">
                                            <input type="hidden" name="target_user_id" value="<?php echo $u['user_id']; ?>">
                                            <input type="hidden" name="status" value="<?php echo $u_banned ? 0 : 1; ?>">
                                            <button type="submit" style="background: <?php echo $u_banned ? 'rgba(34,201,139,0.15)' : 'rgba(240,68,74,0.15)'; ?>; border: 1px solid <?php echo $u_banned ? '#22C98B' : '#F0444A'; ?>; color: <?php echo $u_banned ? '#22C98B' : '#F0444A'; ?>; padding: 5px 9px; border-radius: 6px; font-size: 0.76rem; cursor: pointer;" title="<?php echo $u_banned ? 'Desbanir' : 'Banir utilizador'; ?>">
                                                <i class="fa-solid <?php echo $u_banned ? 'fa-user-check' : 'fa-user-slash'; ?>"></i>
                                            </button>
                                        </form>

                                    </div>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>

        <!-- ABA: PEDIDOS DE SAQUE -->
        <?php elseif ($active_tab === 'withdrawals'): ?>
            <?php
            $status_filter = $_GET['status_filter'] ?? 'all';
            $where_w = "";
            if ($status_filter === 'pending') $where_w = "WHERE status = 'pending'";
            elseif ($status_filter === 'approved') $where_w = "WHERE status = 'approved'";
            elseif ($status_filter === 'rejected') $where_w = "WHERE status = 'rejected'";

            $withdrawals_list = [];
            $res_with = $db->query("SELECT * FROM arena_withdrawals {$where_w} ORDER BY FIELD(status, 'pending', 'approved', 'rejected'), id DESC LIMIT 150");
            if ($res_with) {
                while ($rw = $res_with->fetch_assoc()) $withdrawals_list[] = $rw;
            }
            ?>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 14px;">
                <div>
                    <h2 style="font-size: 1.4rem; font-weight: 800; color: #fff; margin: 0;">
                        <i class="fa-solid fa-money-bill-transfer" style="color: #F59E0B; margin-right: 8px;"></i> Pedidos de Saque dos Jogadores
                    </h2>
                    <p style="color: #9AA4B2; font-size: 0.85rem; margin: 4px 0 0 0;">
                        Valide os pagamentos solicitados pelos jogadores para contas bancárias de Angola. Regra de saque mínimo: <strong>1.000 Kz</strong>.
                    </p>
                </div>

                <div style="display: flex; gap: 8px;">
                    <a href="?tab=withdrawals&status_filter=all" style="padding: 6px 12px; border-radius: 8px; text-decoration: none; font-size: 0.78rem; font-weight: 700; background: <?php echo ($status_filter === 'all') ? '#F59E0B; color: #000;' : '#171C26; border: 1px solid #282F3D; color: #9AA4B2;'; ?>">
                        Todos
                    </a>
                    <a href="?tab=withdrawals&status_filter=pending" style="padding: 6px 12px; border-radius: 8px; text-decoration: none; font-size: 0.78rem; font-weight: 700; background: <?php echo ($status_filter === 'pending') ? '#F0444A; color: #fff;' : '#171C26; border: 1px solid #282F3D; color: #9AA4B2;'; ?>">
                        Pendentes (<?php echo $kpi_pending_withdrawals; ?>)
                    </a>
                    <a href="?tab=withdrawals&status_filter=approved" style="padding: 6px 12px; border-radius: 8px; text-decoration: none; font-size: 0.78rem; font-weight: 700; background: <?php echo ($status_filter === 'approved') ? '#22C98B; color: #000;' : '#171C26; border: 1px solid #282F3D; color: #9AA4B2;'; ?>">
                        Aprovados
                    </a>
                    <a href="?tab=withdrawals&status_filter=rejected" style="padding: 6px 12px; border-radius: 8px; text-decoration: none; font-size: 0.78rem; font-weight: 700; background: <?php echo ($status_filter === 'rejected') ? '#64748B; color: #fff;' : '#171C26; border: 1px solid #282F3D; color: #9AA4B2;'; ?>">
                        Recusados
                    </a>
                </div>
            </div>

            <div class="arena-table-container" style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; overflow-x: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.3);">
                <table style="width: 100%; border-collapse: collapse; min-width: 950px; text-align: left; font-size: 0.88rem;">
                    <thead>
                        <tr style="background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid #282F3D; color: #9AA4B2; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;">
                            <th style="padding: 14px 16px;">ID</th>
                            <th style="padding: 14px 16px;">Jogador Solicitante</th>
                            <th style="padding: 14px 16px;">Titular da Conta</th>
                            <th style="padding: 14px 16px;">Banco & IBAN de Angola</th>
                            <th style="padding: 14px 16px;">Valor Solicitado</th>
                            <th style="padding: 14px 16px; text-align: center;">Estado</th>
                            <th style="padding: 14px 16px; text-align: right;">Ações de Pagamento</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($withdrawals_list)): ?>
                            <tr>
                                <td colspan="7" style="text-align: center; padding: 36px; color: #9AA4B2;">
                                    Nenhuma solicitação de saque registada neste estado.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($withdrawals_list as $w): ?>
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s;">
                                <td style="padding: 14px 16px; font-weight: 800; color: #9AA4B2;">#<?php echo $w['id']; ?></td>
                                <td style="padding: 14px 16px;">
                                    <strong style="color: #fff; font-size: 0.92rem; display: block;">@<?php echo htmlspecialchars($w['gamer_tag']); ?></strong>
                                    <span style="color: #9AA4B2; font-size: 0.75rem;">User #<?php echo $w['user_id']; ?> • <?php echo date('d/m/Y H:i', strtotime($w['created_at'])); ?></span>
                                </td>
                                <td style="padding: 14px 16px; font-weight: 700; color: #cbd5e1;">
                                    <?php echo htmlspecialchars($w['holder_name']); ?>
                                </td>
                                <td style="padding: 14px 16px;">
                                    <div style="font-weight: 800; color: #38bdf8; font-size: 0.88rem;"><?php echo htmlspecialchars($w['bank_name']); ?></div>
                                    <code style="font-size: 0.78rem; color: #F59E0B; background: rgba(245,158,11,0.1); padding: 2px 6px; border-radius: 4px;">
                                        <?php echo htmlspecialchars($w['iban']); ?>
                                    </code>
                                </td>
                                <td style="padding: 14px 16px;">
                                    <span style="font-family: var(--font-gamer); font-weight: 900; font-size: 1.05rem; color: #22C98B;">
                                        <?php echo arena_money($w['amount']); ?>
                                    </span>
                                </td>
                                <td style="padding: 14px 16px; text-align: center;">
                                    <?php if ($w['status'] === 'pending'): ?>
                                        <span style="background: rgba(245,158,11,0.15); border: 1px solid #F59E0B; color: #F59E0B; font-size: 0.70rem; font-weight: 800; padding: 3px 8px; border-radius: 999px;">
                                            Pendente
                                        </span>
                                    <?php elseif ($w['status'] === 'approved'): ?>
                                        <span style="background: rgba(34,201,139,0.15); border: 1px solid #22C98B; color: #22C98B; font-size: 0.70rem; font-weight: 800; padding: 3px 8px; border-radius: 999px;">
                                            Aprovado
                                        </span>
                                    <?php else: ?>
                                        <span style="background: rgba(240,68,74,0.15); border: 1px solid #F0444A; color: #F0444A; font-size: 0.70rem; font-weight: 800; padding: 3px 8px; border-radius: 999px;">
                                            Recusado
                                        </span>
                                        <?php if (!empty($w['admin_notes'])): ?>
                                            <div style="font-size: 0.68rem; color: #9AA4B2; margin-top: 3px; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="<?php echo htmlspecialchars($w['admin_notes']); ?>">
                                                <?php echo htmlspecialchars($w['admin_notes']); ?>
                                            </div>
                                        <?php endif; ?>
                                    <?php endif; ?>
                                </td>
                                <td style="padding: 14px 16px; text-align: right;">
                                    <?php if ($w['status'] === 'pending'): ?>
                                        <div style="display: flex; gap: 8px; justify-content: flex-end;">
                                            <form method="POST" onsubmit="return confirm('Confirma a aprovação e transferência deste levantamento bancário de <?php echo arena_money($w['amount']); ?>?');">
                                                <input type="hidden" name="action" value="approve_withdrawal">
                                                <input type="hidden" name="withdrawal_id" value="<?php echo $w['id']; ?>">
                                                <button type="submit" style="background: linear-gradient(135deg, #22C98B, #10B981); color: #000; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 800; font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                                                    <i class="fa-solid fa-check"></i> Aprovar
                                                </button>
                                            </form>

                                            <button type="button" onclick="openRejectWithdrawalModal(<?php echo $w['id']; ?>, '<?php echo addslashes($w['gamer_tag']); ?>', '<?php echo arena_money($w['amount']); ?>')" style="background: rgba(240,68,74,0.15); border: 1px solid #F0444A; color: #F0444A; padding: 6px 10px; border-radius: 6px; font-weight: 800; font-size: 0.78rem; cursor: pointer;">
                                                <i class="fa-solid fa-xmark"></i> Recusar
                                            </button>
                                        </div>
                                    <?php else: ?>
                                        <span style="font-size: 0.74rem; color: #64748B;">
                                            <?php echo !empty($w['reviewed_at']) ? ('Revisto em ' . date('d/m H:i', strtotime($w['reviewed_at']))) : 'Processado'; ?>
                                        </span>
                                    <?php endif; ?>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>

        <!-- ABA: PERFIL DO ATENDENTE DE SUPORTE -->
        <?php elseif ($active_tab === 'support'): ?>
            <div style="margin-bottom: 24px;">
                <h2 style="font-size: 1.4rem; font-weight: 800; color: #fff; margin: 0;">
                    <i class="fa-solid fa-headset" style="color: #38bdf8; margin-right: 8px;"></i> Perfil do Atendente & Chat de Suporte
                </h2>
                <p style="color: #9AA4B2; font-size: 0.85rem; margin: 4px 0 0 0;">
                    Personalize o nome, estado de disponibilidade e fotografia de perfil do atendente de suporte exibido aos jogadores.
                </p>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 24px; align-items: start;">
                <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; padding: 22px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <form method="POST" enctype="multipart/form-data">
                        <input type="hidden" name="action" value="save_support_profile">

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 0.80rem; font-weight: 700; color: #9AA4B2; margin-bottom: 6px; text-transform: uppercase;">
                                Nome Completo do Atendente de Suporte
                            </label>
                            <input type="text" name="support_agent_name" value="<?php echo htmlspecialchars($support_agent_name); ?>" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 0.92rem; font-weight: 700;">
                            <span style="font-size: 0.72rem; color: #64748B; margin-top: 4px; display: block;">Ex: Paula Sousa — Atendimento VIP Casino56, Carlos Mendes, etc.</span>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 0.80rem; font-weight: 700; color: #9AA4B2; margin-bottom: 6px; text-transform: uppercase;">
                                Status / Subtítulo de Disponibilidade
                            </label>
                            <input type="text" name="support_agent_status" value="<?php echo htmlspecialchars($support_agent_status); ?>" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 0.92rem;">
                            <span style="font-size: 0.72rem; color: #64748B; margin-top: 4px; display: block;">Ex: ● Online — Resposta Imediata, ● Atendimento Prioritário em 2 min</span>
                        </div>

                        <div style="margin-bottom: 18px;">
                            <label style="display: block; font-size: 0.80rem; font-weight: 700; color: #9AA4B2; margin-bottom: 6px; text-transform: uppercase;">
                                Carregar Fotografia do Atendente (Upload de Ficheiro)
                            </label>
                            <input type="file" name="support_agent_avatar_file" accept="image/*" style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 8px; padding: 8px 12px; color: #9AA4B2; font-size: 0.82rem;" onchange="previewSupportAgentUpload(this)">
                        </div>

                        <div style="margin-bottom: 22px;">
                            <label style="display: block; font-size: 0.80rem; font-weight: 700; color: #9AA4B2; margin-bottom: 6px; text-transform: uppercase;">
                                Ou URL Direta da Foto de Perfil
                            </label>
                            <input type="url" name="support_agent_avatar" id="field-support-agent-url" value="<?php echo htmlspecialchars($support_agent_avatar); ?>" style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 0.88rem;" oninput="document.getElementById('preview-support-agent-img').src=this.value">
                        </div>

                        <button type="submit" style="background: linear-gradient(135deg, #38bdf8, #0284c7); color: #000; font-weight: 800; font-size: 0.88rem; padding: 12px 24px; border-radius: 8px; border: none; cursor: pointer; width: 100%; box-shadow: 0 4px 14px rgba(56, 189, 248, 0.4);">
                            <i class="fa-solid fa-floppy-disk"></i> Guardar Perfil do Atendente
                        </button>
                    </form>
                </div>

                <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; padding: 22px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <div style="font-weight: 800; font-size: 0.85rem; color: #9AA4B2; text-transform: uppercase; margin-bottom: 14px;">
                        <i class="fa-solid fa-eye" style="color: #22C98B;"></i> Como o Jogador vê no Chat:
                    </div>

                    <div style="background: #10141C; border: 1px solid #282F3D; border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 14px;">
                        <div style="position: relative;">
                            <img id="preview-support-agent-img" src="<?php echo htmlspecialchars($support_agent_avatar); ?>" alt="Atendente" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid #22C98B;">
                            <span class="online-status-indicator" style="background: #22C98B; width: 12px; height: 12px; position: absolute; bottom: 0; right: 0; border: 2px solid #10141C;"></span>
                        </div>
                        <div>
                            <div style="font-weight: 800; color: #fff; font-size: 1.05rem;" id="preview-support-name">
                                <?php echo htmlspecialchars($support_agent_name); ?>
                            </div>
                            <div style="font-size: 0.78rem; color: #22C98B; font-weight: 700;" id="preview-support-status">
                                <?php echo htmlspecialchars($support_agent_status); ?>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 18px; padding: 14px; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 10px; font-size: 0.82rem; color: #9AA4B2; line-height: 1.45;">
                        <strong style="color: #fff; display: block; margin-bottom: 4px;">Atendimento ao Vivo Integrado:</strong>
                        Para responder às mensagens e prestar apoio técnico aos jogadores, utilize a opção "Abrir Chat de Suporte" no topo do painel.
                    </div>
                </div>
            </div>

            <script>
            function previewSupportAgentUpload(input) {
                if (input.files && input.files[0]) {
                    var reader = new FileReader();
                    reader.onload = function(e) {
                        document.getElementById('preview-support-agent-img').src = e.target.result;
                    };
                    reader.readAsDataURL(input.files[0]);
                }
            }
            </script>

<!-- ABA: GESTÃO DE OPONENTES PROGRAMADOS -->
        <?php elseif ($active_tab === 'bots'): ?>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
                <div>
                    <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff;">Jogadores Bots Programados na Rede</h1>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Crie, edite e programe o comportamento dos oponentes IA (taxa de acerto 0%-100%, apostas aceitas e tempo de resposta).</p>
                </div>
                <button type="button" class="btn-ngola btn-ngola-primary" onclick="openCreateBotModal()">
                    <i class="fa-solid fa-user-plus"></i> Programar Novo Jogador
                </button>
            </div>

            <div class="arena-card" style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.92rem; min-width: 800px;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-dim); text-transform: uppercase; font-size: 0.78rem;">
                            <th style="padding: 12px 10px;">Jogador (Nome & Tag)</th>
                            <th style="padding: 12px 10px;">Província</th>
                            <th style="padding: 12px 10px; text-align: center;">Domínio / Chance de Acerto</th>
                            <th style="padding: 12px 10px; text-align: center;">Tempo Aceite</th>
                            <th style="padding: 12px 10px; text-align: center;">Aposta Máx.</th>
                            <th style="padding: 12px 10px; text-align: center;">Status</th>
                            <th style="padding: 12px 10px; text-align: right;">Ações de Gestão</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (!empty($bots)): ?>
                            <?php foreach ($bots as $b): 
                                $act = ($b['is_active'] == 1);
                                $av = !empty($b['avatar_url']) ? $b['avatar_url'] : 'https://ui-avatars.com/api/?name=' . urlencode($b['bot_tag']);
                                $wr = (int)($b['target_winrate'] ?? 70);
                                $max_bet = (int)($b['max_bet_amount'] ?? 10000);
                            ?>
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                                <td style="padding: 12px 10px;">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <img src="<?php echo htmlspecialchars($av); ?>" alt="Avatar" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid <?php echo $act ? 'var(--neon-green)' : '#ef4444'; ?>;">
                                        <div>
                                            <strong style="color: #fff; display: block; font-size: 0.98rem;">
                                                <?php echo htmlspecialchars(!empty($b['fullname']) ? $b['fullname'] : $b['bot_tag']); ?>
                                            </strong>
                                            <span style="font-size: 0.78rem; color: var(--neon-cyan); font-family: var(--font-gamer);">
                                                @<?php echo htmlspecialchars($b['bot_tag']); ?>
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td style="padding: 12px 10px; color: var(--neon-gold); font-weight: 700;">
                                    <i class="fa-solid fa-map-pin"></i> <?php echo htmlspecialchars($b['province'] ?? 'Luanda'); ?>
                                </td>
                                <td style="padding: 12px 10px; text-align: center;">
                                    <div style="display: inline-block; min-width: 120px;">
                                        <span class="badge" style="background: <?php echo ($wr >= 90) ? '#10b981' : (($wr >= 60) ? '#06b6d4' : '#f59e0b'); ?>; color: #000; font-weight: 800; font-size: 0.82rem;">
                                            <?php echo $wr; ?>% de Acerto <?php echo ($wr == 100) ? '🏆' : ''; ?>
                                        </span>
                                        <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.1); border-radius: 3px; margin-top: 4px; overflow: hidden;">
                                            <div style="width: <?php echo $wr; ?>%; height: 100%; background: <?php echo ($wr >= 90) ? '#10b981' : (($wr >= 60) ? '#06b6d4' : '#f59e0b'); ?>;"></div>
                                        </div>
                                    </div>
                                </td>
                                <td style="padding: 12px 10px; text-align: center; color: #fff; font-weight: 700;">
                                    <?php echo (int)($b['accept_delay_seconds'] ?? 5); ?>s
                                </td>
                                <td style="padding: 12px 10px; text-align: center; color: var(--neon-gold); font-family: var(--font-gamer); font-weight: 700;">
                                    <?php echo number_format($max_bet, 0, ',', '.'); ?> Kz
                                </td>
                                <td style="padding: 12px 10px; text-align: center;">
                                    <span class="badge <?php echo $act ? 'text-bg-success' : 'text-bg-danger'; ?>">
                                        <?php echo $act ? '● ONLINE' : 'PAUSADO'; ?>
                                    </span>
                                </td>
                                <td style="padding: 12px 10px; text-align: right; white-space: nowrap;">
                                    <!-- Editar -->
                                    <button type="button" class="btn-ngola btn-ngola-secondary" style="padding: 4px 10px; font-size: 0.78rem; margin-right: 4px;" onclick="openEditBotModal(<?php echo htmlspecialchars(json_encode($b), ENT_QUOTES, 'UTF-8'); ?>)">
                                        <i class="fa-solid fa-pen"></i> Editar
                                    </button>

                                    <!-- Pausar / Disponibilizar -->
                                    <form method="POST" style="display: inline; margin-right: 4px;">
                                        <input type="hidden" name="action" value="toggle_bot">
                                        <input type="hidden" name="bot_id" value="<?php echo $b['id']; ?>">
                                        <input type="hidden" name="status" value="<?php echo $act ? '0' : '1'; ?>">
                                        <button type="submit" class="btn-ngola <?php echo $act ? 'btn-ngola-outline' : 'btn-ngola-primary'; ?>" style="padding: 4px 10px; font-size: 0.78rem;">
                                            <?php echo $act ? 'Pausar' : 'Ativar'; ?>
                                        </button>
                                    </form>

                                    <!-- Excluir -->
                                    <form method="POST" style="display: inline;" onsubmit="return confirm('Deseja realmente remover este jogador programado?');">
                                        <input type="hidden" name="action" value="delete_bot">
                                        <input type="hidden" name="bot_id" value="<?php echo $b['id']; ?>">
                                        <button type="submit" class="btn-ngola btn-ngola-outline" style="padding: 4px 8px; font-size: 0.78rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.4);">
                                            <i class="fa-solid fa-trash"></i>
                                        </button>
                                    </form>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-dim);">Nenhum jogador programado criado ainda. Clique em "Programar Novo Jogador" acima.</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>

        <!-- ABA: AUDITORIA DE BATALHAS -->
        <?php elseif ($active_tab === 'matches'): ?>
            <div style="margin-bottom: 24px;">
                <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff;">Auditoria de Batalhas & Fair Play</h1>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Histórico completo de partidas para validação e transparência financeira da Arena.</p>
            </div>
            <div class="arena-card" style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; min-width: 600px;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-dim); text-transform: uppercase; font-size: 0.78rem;">
                            <th style="padding: 10px;">Data & Hora</th>
                            <th style="padding: 10px;">Jogo</th>
                            <th style="padding: 10px;">Jogador 1</th>
                            <th style="padding: 10px;">Oponente</th>
                            <th style="padding: 10px; text-align: center;">Duração</th>
                            <th style="padding: 10px; text-align: right;">Pontos</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($recent_matches as $m): ?>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                            <td style="padding: 10px; color: var(--text-muted);">
                                <?php echo date('d/m/Y H:i:s', strtotime($m['played_at'])); ?>
                            </td>
                            <td style="padding: 10px; font-weight: 700; color: #fff;">
                                <?php echo strtoupper($m['game_type']); ?>
                            </td>
                            <td style="padding: 10px; color: var(--text-main);">
                                Usuário #<?php echo (int)$m['player1_id']; ?>
                            </td>
                            <td style="padding: 10px;">
                                <?php if ($m['player2_is_bot']): ?>
                                    <span class="badge text-bg-secondary">IA TREINO</span>
                                <?php else: ?>
                                    <span class="badge text-bg-primary">HUMANO #<?php echo (int)$m['player2_id']; ?></span>
                                <?php endif; ?>
                            </td>
                            <td style="padding: 10px; text-align: center; color: var(--text-dim);">
                                <?php echo (int)$m['duration_seconds']; ?>s
                            </td>
                            <td style="padding: 10px; text-align: right; font-weight: 700; color: var(--neon-gold);">
                                +<?php echo (int)$m['points_awarded']; ?> pts
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>

        <!-- ABA: REGRAS, MATCHMAKING & TAXA DA PLATAFORMA -->
        <?php elseif ($active_tab === 'settings'): ?>
            <div style="margin-bottom: 24px;">
                <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff;">Regras do Sistema, Taxa da Plataforma & Matchmaking</h1>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Configurações financeiras globais da Arena e parâmetros de tolerância do sistema.</p>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; align-items: start;">
                <div class="arena-card">
                    <form method="POST">
                        <input type="hidden" name="action" value="save_global_settings">
                        
                        <!-- SEÇÃO: TAXA DA PLATAFORMA -->
                        <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 16px; margin-bottom: 22px;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(245, 158, 11, 0.2); display: flex; align-items: center; justify-content: center; color: var(--neon-gold); font-size: 1.1rem;">
                                    <i class="fa-solid fa-percent"></i>
                                </div>
                                <div>
                                    <h4 style="margin: 0; color: #fff; font-size: 1.05rem; font-weight: 800;">Taxa da Plataforma (Comissão da Casa)</h4>
                                    <span style="font-size: 0.78rem; color: #cbd5e1;">Retida automaticamente sobre o pote total das apostas (1v1)</span>
                                </div>
                            </div>

                            <div style="margin-top: 14px;">
                                <label style="display: block; font-weight: 700; color: #fde68a; margin-bottom: 6px; font-size: 0.85rem; text-transform: uppercase;">
                                    Porcentagem da Taxa da Plataforma (%)
                                </label>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <input type="number" step="0.5" min="0" max="50" name="platform_fee_percent" id="field-platform-fee" value="<?php echo htmlspecialchars($current_platform_fee); ?>" oninput="updateFeeSimulation()" style="width: 100%; background: #0c1017; border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 1.1rem; font-weight: 700;">
                                    <span style="font-size: 1.2rem; font-weight: 800; color: var(--neon-gold); padding-right: 4px;">%</span>
                                </div>
                                <span style="font-size: 0.78rem; color: var(--text-dim); display: block; margin-top: 5px;">Padrão recomendado: <strong>10%</strong> (mínimo 0%, máximo 50%).</span>
                            </div>
                        </div>

                        <!-- SEÇÃO: MATCHMAKING E TOLERÂNCIA -->
                        <div style="margin-bottom: 18px;">
                            <label style="display: block; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; font-size: 0.85rem; text-transform: uppercase;">Máximo de Oponentes Ativos em Simultâneo</label>
                            <input type="number" name="max_active_bots" value="<?php echo htmlspecialchars($current_max_bots); ?>" min="1" max="50" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; color: #fff;">
                        </div>
                        <div style="margin-bottom: 24px;">
                            <label style="display: block; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; font-size: 0.85rem; text-transform: uppercase;">Tempo Limite de Espera por Desafio (Segundos)</label>
                            <input type="number" name="bot_fill_timeout_seconds" value="<?php echo htmlspecialchars($current_bot_timeout); ?>" min="15" max="120" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; color: #fff;" title="Janela de tolerância de emparelhamento">
                        </div>

                        <!-- SEÇÃO: ESTIMATIVAS E MÉTRICAS DINÂMICAS DO CABEÇALHO -->
                        <div style="background: rgba(6, 182, 212, 0.08); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 12px; padding: 16px; margin-bottom: 22px;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                                <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(6, 182, 212, 0.2); display: flex; align-items: center; justify-content: center; color: var(--neon-cyan); font-size: 1.1rem;">
                                    <i class="fa-solid fa-chart-line"></i>
                                </div>
                                <div>
                                    <h4 style="margin: 0; color: #fff; font-size: 1.05rem; font-weight: 800;">Métricas Dinâmicas do Cabeçalho (Mural & Lobby)</h4>
                                    <span style="font-size: 0.78rem; color: var(--text-dim);">Controle das estimativas base exibidas em tempo real para os jogadores</span>
                                </div>
                            </div>

                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
                                <div>
                                    <label style="display: block; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase;">Jogadores Conectados (Base)</label>
                                    <input type="number" name="live_metrics_base_online" value="<?php echo htmlspecialchars($current_base_online); ?>" min="1" max="1000" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 12px; color: #10b981; font-weight: 700;">
                                </div>
                                <div>
                                    <label style="display: block; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase;">Duelos em Andamento (Base)</label>
                                    <input type="number" name="live_metrics_base_battles" value="<?php echo htmlspecialchars($current_base_battles); ?>" min="0" max="500" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 12px; color: #f59e0b; font-weight: 700;">
                                </div>
                                <div>
                                    <label style="display: block; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase;">Batalhas Hoje (Base)</label>
                                    <input type="number" name="live_metrics_base_matches_today" value="<?php echo htmlspecialchars($current_base_matches); ?>" min="0" max="5000" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 12px; color: var(--neon-gold); font-weight: 700;">
                                </div>
                                <div>
                                    <label style="display: block; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase;">Prêmios em Disputa (Kz Base)</label>
                                    <input type="number" name="live_metrics_base_prizes" value="<?php echo htmlspecialchars($current_base_prizes); ?>" min="10000" step="50000" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 12px; color: #06b6d4; font-weight: 700;">
                                </div>
                            </div>

                            <div>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #cbd5e1; font-size: 0.85rem; font-weight: 600;">
                                    <input type="checkbox" name="live_metrics_fluctuation_enabled" value="1" <?php echo $current_fluct_enabled ? 'checked' : ''; ?> style="width: 16px; height: 16px; accent-color: var(--neon-cyan);">
                                    <span>Ativar Flutuação Orgânica em Tempo Real (simula atividade contínua de usuários sem atualizar a página)</span>
                                </label>
                            </div>
                        </div>

                        <button type="submit" class="btn-ngola btn-ngola-primary" style="width: 100%; justify-content: center; padding: 12px; font-size: 0.95rem;">
                            <i class="fa-solid fa-floppy-disk"></i> Salvar Taxa & Configurações da Arena
                        </button>
                    </form>
                </div>

                <!-- SIMULADOR FINANCEIRO EM TEMPO REAL -->
                <div class="arena-card" style="background: linear-gradient(145deg, #131a24, #0f141d); border: 1px solid var(--border-subtle);">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
                        <i class="fa-solid fa-calculator" style="color: var(--neon-cyan); font-size: 1.2rem;"></i>
                        <h4 style="margin: 0; color: #fff; font-size: 1.1rem; font-weight: 800;">Simulador de Rateio & Lucro da Plataforma</h4>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 0.8rem; color: var(--text-muted); font-weight: 700; margin-bottom: 4px; text-transform: uppercase;">Exemplo de Aposta Individual</label>
                        <select id="sim-bet-amount" onchange="updateFeeSimulation()" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; color: #fff; font-weight: 700;">
                            <option value="500">500 Kz (Pote: 1.000 Kz)</option>
                            <option value="1000" selected>1.000 Kz (Pote: 2.000 Kz)</option>
                            <option value="2500">2.500 Kz (Pote: 5.000 Kz)</option>
                            <option value="5000">5.000 Kz (Pote: 10.000 Kz)</option>
                            <option value="10000">10.000 Kz (Pote: 20.000 Kz)</option>
                            <option value="25000">25.000 Kz (Pote: 50.000 Kz)</option>
                        </select>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 12px; background: rgba(0,0,0,0.25); border-radius: 10px; padding: 16px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                            <span style="color: var(--text-muted);">Pote Total da Batalha (2x):</span>
                            <strong style="color: #fff;" id="sim-total-pot">2.000 Kz</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                            <span style="color: var(--neon-gold);"><i class="fa-solid fa-piggy-bank"></i> Lucro da Plataforma NgolaBiz:</span>
                            <strong style="color: var(--neon-gold); font-size: 1.05rem;" id="sim-platform-fee">200 Kz (10%)</strong>
                        </div>
                        <div style="border-top: 1px dashed var(--border-color); padding-top: 10px; display: flex; justify-content: space-between; font-size: 0.95rem;">
                            <span style="color: #10b981;"><i class="fa-solid fa-trophy"></i> Prêmio Líquido do Vencedor:</span>
                            <strong style="color: #10b981; font-size: 1.15rem;" id="sim-winner-prize">1.800 Kz</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                            <span style="color: var(--text-dim);">Lucro Líquido Real do Ganhador:</span>
                            <span style="color: #6ee7b7; font-weight: 700;" id="sim-winner-profit">+800 Kz</span>
                        </div>
                    </div>

                    <div style="margin-top: 16px; font-size: 0.8rem; color: var(--text-dim); line-height: 1.5;">
                        <i class="fa-solid fa-shield-check" style="color: var(--neon-cyan);"></i> Qualquer alteração feita na taxa é aplicada imediatamente em todas as novas batalhas aceitas na rede.
                    </div>
                </div>
            </div>

            <script>
            function updateFeeSimulation() {
                var bet = parseFloat(document.getElementById('sim-bet-amount').value) || 1000;
                var feePct = parseFloat(document.getElementById('field-platform-fee').value) || 10;
                if (feePct < 0) feePct = 0;
                if (feePct > 50) feePct = 50;
                
                var pot = bet * 2;
                var fee = (pot * feePct) / 100;
                var prize = pot - fee;
                var profit = prize - bet;

                document.getElementById('sim-total-pot').textContent = pot.toLocaleString('pt-AO') + ' Kz';
                document.getElementById('sim-platform-fee').textContent = fee.toLocaleString('pt-AO') + ' Kz (' + feePct + '%)';
                document.getElementById('sim-winner-prize').textContent = prize.toLocaleString('pt-AO') + ' Kz';
                document.getElementById('sim-winner-profit').textContent = '+' + profit.toLocaleString('pt-AO') + ' Kz';
            }
            document.addEventListener('DOMContentLoaded', updateFeeSimulation);
            </script>

        <!-- ABA: LOGS DE AUDITORIA -->
        <?php elseif ($active_tab === 'logs'): ?>
            <div style="margin-bottom: 24px;">
                <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff;">Logs de Auditoria Administrativa</h1>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Histórico das decisões administrativas registradas no servidor.</p>
            </div>
            <div class="arena-card">
                <?php if (!empty($logs)): ?>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <?php foreach ($logs as $lg): ?>
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #121720; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.88rem; flex-wrap: wrap; gap: 8px;">
                            <div>
                                <span class="badge text-bg-danger" style="margin-right: 8px;"><?php echo htmlspecialchars($lg['action']); ?></span>
                                <span style="color: #fff;"><?php echo htmlspecialchars($lg['details']); ?></span>
                            </div>
                            <div style="color: var(--text-dim); font-size: 0.78rem;">
                                <?php echo htmlspecialchars($lg['admin_name']); ?> • IP: <?php echo htmlspecialchars($lg['ip_address']); ?> • <?php echo date('d/m H:i', strtotime($lg['created_at'])); ?>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                <?php else: ?>
                    <div style="text-align: center; padding: 25px; color: var(--text-dim);">Nenhum log registrado.</div>
                <?php endif; ?>
            </div>

        <!-- ABA: FINANÇAS & FATURAMENTO DA PLATAFORMA (LUCRO DO ADMIN & MOVIMENTAÇÃO) -->
        <?php elseif ($active_tab === 'finances'): ?>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
                <div>
                    <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff;">Finanças & Faturamento da Arena</h1>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Controle financeiro do ecossistema: volume de apostas movimentado, faturamento retido pelo Admin e prêmios pagos.</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <a href="https://www.ngolabiz.it.ao/wallet" target="_blank" class="btn-launch-hero" style="background: linear-gradient(135deg, #10b981, #059669); font-size: 0.85rem; padding: 8px 16px;">
                        <i class="fa-solid fa-wallet"></i> Ver Minha Carteira Admin
                    </a>
                </div>
            </div>

            <!-- KPIs Financeiros da Arena Especificados (Admin + Bots) -->
            <div class="kpi-metrics-row">
                <div class="kpi-card" style="border-color: rgba(16, 185, 129, 0.5); background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.7));">
                    <div class="kpi-card-label"><i class="fa-solid fa-vault" style="color: #10b981; margin-right: 6px;"></i> GANHOS TOTAIS DO ADMINISTRADOR</div>
                    <div class="kpi-card-value" style="color: #10b981; font-size: 1.85rem; font-weight: 900;"><?php echo number_format($fin_admin_grand_total, 2, ',', '.'); ?> Kz</div>
                    <div style="font-size: 0.8rem; color: #a7f3d0; margin-top: 4px; font-weight: 600;">
                        Taxa da Casa (<?php echo number_format($fin_admin_rake, 2, ',', '.'); ?> Kz) + Prêmios dos Bots (<?php echo number_format($fin_bots_earnings, 2, ',', '.'); ?> Kz)
                    </div>
                </div>
                <div class="kpi-card" style="border-color: rgba(245, 158, 11, 0.45);">
                    <div class="kpi-card-label"><i class="fa-solid fa-robot" style="color: var(--neon-gold); margin-right: 6px;"></i> Ganhos dos Seus Bots (Lucro)</div>
                    <div class="kpi-card-value" style="color: var(--neon-gold); font-size: 1.7rem;"><?php echo number_format($fin_bots_earnings, 2, ',', '.'); ?> Kz</div>
                    <div style="font-size: 0.78rem; color: #fde68a; margin-top: 4px;"><?php echo $fin_bots_wins_count; ?> vitórias de Bots contra humanos (100% retido pelo Admin)</div>
                </div>
                <div class="kpi-card" style="border-color: rgba(6, 182, 212, 0.35);">
                    <div class="kpi-card-label"><i class="fa-solid fa-percentage" style="color: #06b6d4; margin-right: 6px;"></i> Comissão da Casa (Taxa 10%)</div>
                    <div class="kpi-card-value" style="color: #06b6d4; font-size: 1.7rem;"><?php echo number_format($fin_admin_rake, 2, ',', '.'); ?> Kz</div>
                    <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;">Comissão retida em todas as partidas concluídas</div>
                </div>
                <div class="kpi-card" style="border-color: rgba(239, 68, 68, 0.35);">
                    <div class="kpi-card-label"><i class="fa-solid fa-sack-dollar" style="color: #ef4444; margin-right: 6px;"></i> Volume Total Apostado</div>
                    <div class="kpi-card-value" style="color: #ef4444; font-size: 1.7rem;"><?php echo number_format($fin_total_volume, 0, ',', '.'); ?> Kz</div>
                    <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;"><?php echo $fin_total_battles_w_bet; ?> duelos com apostas na plataforma</div>
                </div>
            </div>

            <!-- Painel Explicativo da Especificação de Ganhos -->
            <div class="arena-card" style="margin-bottom: 24px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%); border: 1px solid rgba(16, 185, 129, 0.35);">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #10b981, #059669); display: flex; align-items: center; justify-content: center; font-size: 22px; color: #fff;">
                            <i class="fa-solid fa-coins"></i>
                        </div>
                        <div>
                            <h4 style="margin: 0; color: #fff; font-size: 1.1rem; font-weight: 800;">Especificação Detalhada dos Ganhos do Admin e dos Bots</h4>
                            <p style="margin: 4px 0 0 0; color: var(--text-muted); font-size: 0.85rem;">
                                Na NgolaBiz Arena você acumula receita de 2 fontes: <strong style="color: #10b981;">(1) Taxa da Plataforma (10%)</strong> sobre todos os duelos + <strong style="color: var(--neon-gold);">(2) 100% dos Prêmios Faturados pelos Bots</strong> nas vitórias contra humanos (revertidos integralmente para os cofres do Admin).
                            </p>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.78rem; color: var(--text-dim); display: block;">Retenção Total nos Cofres do Admin:</span>
                        <strong style="font-size: 1.5rem; color: #10b981; font-family: var(--font-gamer);"><?php echo number_format($fin_admin_grand_total, 2, ',', '.'); ?> Kz</strong>
                    </div>
                </div>
            </div>

            <!-- Tabela Detalhada de Batalhas Financeiras -->
            <div class="arena-card">
                <div class="arena-card-header">
                    <div class="arena-card-title"><i class="fa-solid fa-receipt" style="color: #10b981;"></i> Histórico de Batalhas Financeiras (Quem Ganhou, Quem Perdeu e Taxas)</div>
                    <span style="font-size: 0.8rem; color: var(--text-dim);">Exibindo últimas <?php echo count($financial_matches); ?> disputas</span>
                </div>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; min-width: 900px;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-dim); text-transform: uppercase; font-size: 0.78rem;">
                                <th style="padding: 12px 10px;">ID / Partida</th>
                                <th style="padding: 12px 10px;">Jogo</th>
                                <th style="padding: 12px 10px;">Desafiante (P1)</th>
                                <th style="padding: 12px 10px;">Desafiado (P2)</th>
                                <th style="padding: 12px 10px; text-align: right;">Aposta Indiv.</th>
                                <th style="padding: 12px 10px; text-align: right;">Pote (2x)</th>
                                <th style="padding: 12px 10px; text-align: center;">Resultado</th>
                                <th style="padding: 12px 10px; text-align: right; color: #10b981;">Lucro Admin</th>
                                <th style="padding: 12px 10px; text-align: right; color: var(--neon-gold);">Prêmio Vencedor</th>
                                <th style="padding: 12px 10px; text-align: right;">Data/Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (!empty($financial_matches)): ?>
                                <?php foreach ($financial_matches as $fm): 
                                    $bet = (float)$fm['bet_amount'];
                                    $pot = $bet * 2;
                                    $fee = !empty($fm['platform_fee_amount']) ? (float)$fm['platform_fee_amount'] : round(($pot * $current_platform_fee) / 100, 2);
                                    $net = $pot - $fee;
                                    $is_draw = ($fm['is_draw'] == 1);
                                    $w_id = (int)($fm['winner_id'] ?? 0);
                                    
                                    // Vencedor e Perdedor
                                    $winner_str = 'Aguardando';
                                    $loser_str = '-';
                                    if ($is_draw) {
                                        $winner_str = '⚔️ Empate (Reembolsado)';
                                        $loser_str = 'Taxa Retida (5% cada)';
                                    } elseif ($w_id > 0) {
                                        $winner_str = '🏆 ' . htmlspecialchars($fm['challenger_tag']);
                                        $loser_str = '💀 ' . htmlspecialchars($fm['challenged_tag']);
                                    } elseif ($fm['status'] === 'completed') {
                                        $winner_str = '🏆 ' . htmlspecialchars($fm['challenger_tag']);
                                        $loser_str = '💀 ' . htmlspecialchars($fm['challenged_tag']);
                                    }
                                ?>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                                    <td style="padding: 12px 10px; font-family: var(--font-gamer); color: var(--text-dim); font-size: 0.82rem;">
                                        #<?php echo $fm['id']; ?>
                                    </td>
                                    <td style="padding: 12px 10px; font-weight: 700; color: #fff;">
                                        <?php echo strtoupper($fm['game_type']); ?>
                                    </td>
                                    <td style="padding: 12px 10px; color: #60a5fa; font-weight: 600;">
                                        <?php echo htmlspecialchars($fm['challenger_tag'] ?: 'Jogador 1'); ?>
                                    </td>
                                    <td style="padding: 12px 10px; color: #f87171; font-weight: 600;">
                                        <?php echo htmlspecialchars($fm['challenged_tag'] ?: 'Jogador 2'); ?>
                                    </td>
                                    <td style="padding: 12px 10px; text-align: right; color: var(--text-muted); font-weight: 700;">
                                        <?php echo number_format($bet, 0, ',', '.'); ?> Kz
                                    </td>
                                    <td style="padding: 12px 10px; text-align: right; color: #fff; font-weight: 800;">
                                        <?php echo number_format($pot, 0, ',', '.'); ?> Kz
                                    </td>
                                    <td style="padding: 12px 10px; text-align: center;">
                                        <span class="badge" style="background: <?php echo $is_draw ? '#f59e0b' : '#10b981'; ?>; color: #000; font-weight: 800; font-size: 0.78rem;">
                                            <?php echo $winner_str; ?>
                                        </span>
                                    </td>
                                    <td style="padding: 12px 10px; text-align: right; font-weight: 800; color: #10b981;">
                                        +<?php echo number_format($fee, 2, ',', '.'); ?> Kz
                                    </td>
                                    <td style="padding: 12px 10px; text-align: right; font-weight: 800; color: var(--neon-gold);">
                                        +<?php echo number_format($net, 2, ',', '.'); ?> Kz
                                    </td>
                                    <td style="padding: 12px 10px; text-align: right; font-size: 0.78rem; color: var(--text-dim);">
                                        <?php echo !empty($fm['played_at']) ? date('d/m H:i', strtotime($fm['played_at'])) : date('d/m H:i', strtotime($fm['created_at'])); ?>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                            <?php else: ?>
                                <tr><td colspan="10" style="text-align: center; padding: 25px; color: var(--text-dim);">Nenhum duelo financeiro registrado até o momento.</td></tr>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>

        <!-- ABA: CAPAS DOS JOGOS & DESTAQUE (PERSONALIZAÇÃO PELO ADMIN) -->
                <!-- ABA: INTELIGÊNCIA ARTIFICIAL DOS BOTS (OPENROUTER AI) -->
        <?php elseif ($active_tab === 'ai'): ?>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
                <div>
                    <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 10px;">
                        <i class="fa-solid fa-brain" style="color: #c084fc;"></i> Motor de Inteligência Artificial dos Bots
                    </h1>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Controle, auditoria e teste de raciocínio cognitivo via OpenRouter AI para os bots de combate da NgolaBiz Arena.</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button type="button" onclick="runAITester()" class="btn-launch-hero" style="background: linear-gradient(135deg, #8b5cf6, #6d28d9); font-size: 0.88rem; padding: 8px 18px; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-bolt"></i> Testar Inteligência Artificial Agora
                    </button>
                </div>
            </div>

            <!-- KPIs de Status da IA -->
            <div class="kpi-metrics-row">
                <div class="kpi-card" style="border-color: rgba(139, 92, 246, 0.45);">
                    <div class="kpi-card-label"><i class="fa-solid fa-circle-nodes" style="color: #a855f7; margin-right: 6px;"></i> Provedor de IA</div>
                    <div class="kpi-card-value" style="color: #c084fc; font-size: 1.5rem;">OpenRouter AI</div>
                    <div style="font-size: 0.78rem; color: #10b981; margin-top: 4px;"><i class="fa-solid fa-circle-check"></i> Chave sk-or-v1-041... Conectada</div>
                </div>
                <div class="kpi-card" style="border-color: rgba(16, 185, 129, 0.35);">
                    <div class="kpi-card-label"><i class="fa-solid fa-microchip" style="color: #10b981; margin-right: 6px;"></i> Modelo Principal Ativo</div>
                    <div class="kpi-card-value" style="color: #10b981; font-size: 1.15rem; font-family: monospace;"><?php echo htmlspecialchars($ai_settings['ai_model']); ?></div>
                    <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;">Fallback automático: <?php echo htmlspecialchars($ai_settings['ai_fallback_model']); ?></div>
                </div>
                <div class="kpi-card" style="border-color: rgba(6, 182, 212, 0.35);">
                    <div class="kpi-card-label"><i class="fa-solid fa-robot" style="color: #06b6d4; margin-right: 6px;"></i> Bots Cognitivos Conectados</div>
                    <div class="kpi-card-value" style="color: #06b6d4; font-size: 1.7rem;"><?php echo count($bots); ?> Bots</div>
                    <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 4px;">Pensamentos e estratégias gerados em tempo real</div>
                </div>
                <div class="kpi-card" style="border-color: rgba(245, 158, 11, 0.35);">
                    <div class="kpi-card-label"><i class="fa-solid fa-bolt-lightning" style="color: var(--neon-gold); margin-right: 6px;"></i> Estado do Motor</div>
                    <div class="kpi-card-value" style="color: var(--neon-gold); font-size: 1.5rem;">ATIVO & ONLINE</div>
                    <div style="font-size: 0.78rem; color: #a7f3d0; margin-top: 4px;">Raciocínio tático ativado nos jogos</div>
                </div>
            </div>

            <!-- Card de Teste em Tempo Real da IA -->
            <div class="arena-card" id="ai-test-card" style="margin-bottom: 24px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(139, 92, 246, 0.3);">
                <div class="arena-card-header">
                    <div class="arena-card-title"><i class="fa-solid fa-vial" style="color: #c084fc;"></i> Teste em Tempo Real de Raciocínio da IA</div>
                    <span id="ai-test-status-badge" class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981;">Pronto para Disparar</span>
                </div>
                <div style="padding: 16px 20px;">
                    <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 15px;">
                        Clique no botão abaixo para testar a comunicação imediata entre os servidores da NgolaBiz e a API da OpenRouter. O sistema enviará um desafio tático para a IA e medirá a latência de resposta.
                    </p>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                        <button type="button" onclick="runAITester()" class="btn-launch-hero" style="background: linear-gradient(135deg, #10b981, #059669); font-size: 0.88rem; padding: 10px 22px; border: none; cursor: pointer;">
                            <i class="fa-solid fa-play"></i> Executar Teste de Conexão & Raciocínio
                        </button>
                    </div>
                    <div id="ai-test-output-box" style="display: none; margin-top: 15px; padding: 15px; border-radius: 10px; background: #090e17; border: 1px solid rgba(255,255,255,0.1); font-family: monospace; font-size: 0.85rem;">
                        <div id="ai-test-output-content" style="color: #a7f3d0;"></div>
                    </div>
                </div>
            </div>

            <!-- Tabela de Pensamentos e Decisões dos Bots -->
            <div class="arena-card">
                <div class="arena-card-header">
                    <div class="arena-card-title"><i class="fa-solid fa-list-check" style="color: #c084fc;"></i> Feed de Pensamentos & Raciocínios Táticos Recentes da IA</div>
                    <span style="font-size: 0.8rem; color: var(--text-dim);">Registros ao vivo da Arena</span>
                </div>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; min-width: 800px;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-dim); text-transform: uppercase; font-size: 0.78rem;">
                                <th style="padding: 12px 10px;">Data/Hora</th>
                                <th style="padding: 12px 10px;">Bot Combatente</th>
                                <th style="padding: 12px 10px;">Jogo</th>
                                <th style="padding: 12px 10px;">Adversário</th>
                                <th style="padding: 12px 10px;">Pensamento Gerado pela IA</th>
                                <th style="padding: 12px 10px; text-align: center;">Modelo</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php if (!empty($ai_recent_thoughts)): ?>
                                <?php foreach ($ai_recent_thoughts as $at): ?>
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                                    <td style="padding: 12px 10px; font-size: 0.8rem; color: var(--text-dim); white-space: nowrap;">
                                        <?php echo date('d/m H:i:s', strtotime($at['created_at'])); ?>
                                    </td>
                                    <td style="padding: 12px 10px; font-weight: 700; color: #c084fc;">
                                        <i class="fa-solid fa-robot"></i> <?php echo htmlspecialchars($at['bot_tag']); ?>
                                    </td>
                                    <td style="padding: 12px 10px; font-weight: 600; color: #fff;">
                                        <?php echo strtoupper($at['game']); ?>
                                    </td>
                                    <td style="padding: 12px 10px; color: #60a5fa;">
                                        <?php echo htmlspecialchars($at['opponent']); ?>
                                    </td>
                                    <td style="padding: 12px 10px; color: #e2e8f0; font-style: italic;">
                                        "<?php echo htmlspecialchars($at['thought']); ?>"
                                    </td>
                                    <td style="padding: 12px 10px; text-align: center;">
                                        <span class="badge" style="background: rgba(139, 92, 246, 0.2); color: #c084fc; border: 1px solid #8b5cf6; font-size: 0.72rem;">
                                            OpenRouter
                                        </span>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                            <?php else: ?>
                                <tr><td colspan="6" style="text-align: center; padding: 25px; color: var(--text-dim);">Nenhum pensamento recente registrado. Jogue uma partida contra um bot para gerar o primeiro raciocínio!</td></tr>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>


        <?php elseif ($active_tab === 'covers'): ?>
            <div style="margin-bottom: 24px;">
                <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff;">Capas dos Jogos & Hero Banner de Destaque</h1>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Gerencie as imagens oficiais dos jogos nos cards da Arena e configure o jogo em destaque no topo da página principal.</p>
            </div>

            <form method="POST" enctype="multipart/form-data">
                <input type="hidden" name="action" value="save_game_covers">

                <!-- 1. JOGO EM DESTAQUE (HERO BANNER) -->
                <div class="arena-card" style="margin-bottom: 24px; border: 1px solid rgba(0, 240, 255, 0.3);">
                    <div class="arena-card-header">
                        <div class="arena-card-title"><i class="fa-solid fa-fire" style="color: var(--neon-cyan);"></i> Hero Banner: Jogo em Destaque no Topo</div>
                        <span class="badge" style="background: var(--neon-cyan); color: #000; font-weight: 800;">Principal da Página Inicial</span>
                    </div>

                    <?php 
                    $cur_hero_cover = $arena_settings['cover_featured'] ?? ($ARENA_GAMES['hyperstrike']['cover'] ?? (GAMER_URL . '/images/covers/hyperstrike.jpg'));
                    $cur_hero_title = $arena_settings['featured_game_title'] ?? 'HYPER-STRIKE';
                    $cur_hero_sub = $arena_settings['featured_game_sub'] ?? 'Luta Tática 2D • Torneio de Angola';
                    $cur_hero_desc = $arena_settings['featured_game_desc'] ?? 'Desafie lutadores e estrategistas de Luanda, Benguela, Huambo e de todas as províncias. Batalha fluida em tempo real com combos e especiais clássicos dos repositórios oficiais!';
                    ?>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; align-items: start;">
                        <div>
                            <div style="margin-bottom: 14px;">
                                <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Carregar Ficheiro de Capa do Banner (Upload)</label>
                                <input type="file" name="cover_featured_file" accept="image/*" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: #9AA4B2; font-size: 0.82rem;" onchange="previewCoverFile(this, 'preview-hero-cover')">
                            </div>
                            <div style="margin-bottom: 14px;">
                                <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Ou URL da Imagem / Capa do Banner</label>
                                <input type="url" name="cover_featured" id="field-cover-featured" value="<?php echo htmlspecialchars($cur_hero_cover); ?>" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; color: #fff;" oninput="document.getElementById('preview-hero-cover').src=this.value">
                            </div>

                            <div style="margin-bottom: 14px;">
                                <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Título do Jogo em Destaque</label>
                                <input type="text" name="featured_game_title" value="<?php echo htmlspecialchars($cur_hero_title); ?>" required style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; color: #fff; font-family: var(--font-gamer); font-weight: 800;">
                            </div>

                            <div style="margin-bottom: 14px;">
                                <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Subtítulo / Categoria</label>
                                <input type="text" name="featured_game_sub" value="<?php echo htmlspecialchars($cur_hero_sub); ?>" required style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; color: #fff;">
                            </div>

                            <div style="margin-bottom: 14px;">
                                <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Descrição Promocional</label>
                                <textarea name="featured_game_desc" rows="3" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; color: #fff; resize: vertical;"><?php echo htmlspecialchars($cur_hero_desc); ?></textarea>
                            </div>
                        </div>

                        <!-- Preview Visual do Hero Banner -->
                        <div>
                            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase;">Pré-visualização da Capa do Banner:</label>
                            <div style="border-radius: 12px; overflow: hidden; border: 2px solid var(--border-color); box-shadow: 0 4px 20px rgba(0,0,0,0.5); max-height: 240px; position: relative;">
                                <img src="<?php echo htmlspecialchars($cur_hero_cover); ?>" id="preview-hero-cover" alt="Hero Preview" style="width: 100%; height: 240px; object-fit: cover; display: block;" onerror="this.src='<?php echo GAMER_URL; ?>/images/covers/hyperstrike.jpg'">
                                <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, transparent 100%); padding: 16px;">
                                    <span style="background: rgba(239, 68, 68, 0.9); color: #fff; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: 800;">DESTAQUE</span>
                                    <div style="color: #fff; font-family: var(--font-gamer); font-weight: 800; font-size: 1.1rem; margin-top: 4px;"><?php echo htmlspecialchars($cur_hero_title); ?></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2. CAPAS DOS JOGOS DISPONÍVEIS NA ARENA (CARDS) -->
                <div class="arena-card" style="margin-bottom: 24px;">
                    <div class="arena-card-header">
                        <div class="arena-card-title"><i class="fa-solid fa-gamepad" style="color: var(--neon-gold);"></i> Capas Individuais dos Jogos na Lista</div>
                        <span style="font-size: 0.85rem; color: var(--text-dim);">Imagens exibidas nos cards clicáveis do lobby</span>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
                        <!-- HYPER-STRIKE -->
                        <?php 
                        $hs_cover = $arena_settings['cover_hyperstrike'] ?? (GAMER_URL . '/images/covers/hyperstrike.jpg');
                        ?>
                        <div style="background: #121720; border: 1px solid var(--border-color); border-radius: 10px; padding: 16px;">
                            <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px;">
                                <img src="<?php echo htmlspecialchars($hs_cover); ?>" id="preview-cover-hyperstrike" alt="HYPER-STRIKE" style="width: 70px; height: 70px; border-radius: 8px; object-fit: cover; border: 2px solid #F0444A;">
                                <div>
                                    <strong style="color: #fff; display: block; font-size: 1rem;">HYPER-STRIKE</strong>
                                    <span style="color: #F0444A; font-size: 0.8rem; font-weight: 600;">Luta 2D Tática</span>
                                </div>
                            </div>
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Carregar Ficheiro (Upload)</label>
                            <input type="file" name="cover_hyperstrike_file" accept="image/*" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; color: #9AA4B2; font-size: 0.78rem; margin-bottom: 6px;" onchange="previewCoverFile(this, 'preview-cover-hyperstrike')">
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Ou URL da Imagem</label>
                            <input type="url" name="cover_hyperstrike" value="<?php echo htmlspecialchars($hs_cover); ?>" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 0.85rem;" oninput="document.getElementById('preview-cover-hyperstrike').src=this.value">
                        </div>

                        <!-- NEON FIST -->
                        <?php 
                        $nf_cover = $arena_settings['cover_neon-fist'] ?? (GAMER_URL . '/images/covers/neon-fist.jpg');
                        ?>
                        <div style="background: #121720; border: 1px solid var(--border-color); border-radius: 10px; padding: 16px;">
                            <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px;">
                                <img src="<?php echo htmlspecialchars($nf_cover); ?>" id="preview-cover-neon-fist" alt="Neon Fist" style="width: 70px; height: 70px; border-radius: 8px; object-fit: cover; border: 2px solid #06b6d4;">
                                <div>
                                    <strong style="color: #fff; display: block; font-size: 1rem;">Neon Fist</strong>
                                    <span style="color: #06b6d4; font-size: 0.8rem; font-weight: 600;">Cyberpunk Beat'em Up</span>
                                </div>
                            </div>
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Carregar Ficheiro (Upload)</label>
                            <input type="file" name="cover_neon-fist_file" accept="image/*" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; color: #9AA4B2; font-size: 0.78rem; margin-bottom: 6px;" onchange="previewCoverFile(this, 'preview-cover-neon-fist')">
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Ou URL da Imagem</label>
                            <input type="url" name="cover_neon-fist" value="<?php echo htmlspecialchars($nf_cover); ?>" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 0.85rem;" oninput="document.getElementById('preview-cover-neon-fist').src=this.value">
                        </div>

                        <!-- MORTAL KOMBAT ARCADE -->
                        <?php 
                        $mk_cover = $arena_settings['cover_mkjs'] ?? (GAMER_URL . '/images/covers/mkjs.jpg');
                        ?>
                        <div style="background: #121720; border: 1px solid var(--border-color); border-radius: 10px; padding: 16px;">
                            <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px;">
                                <img src="<?php echo htmlspecialchars($mk_cover); ?>" id="preview-cover-mkjs" alt="MK.js Mortal Kombat" style="width: 70px; height: 70px; border-radius: 8px; object-fit: cover; border: 2px solid #ef4444;">
                                <div>
                                    <strong style="color: #fff; display: block; font-size: 1rem;">MK.js Arcade</strong>
                                    <span style="color: #ef4444; font-size: 0.8rem; font-weight: 600;">Mortal Kombat Clássico</span>
                                </div>
                            </div>
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Carregar Ficheiro (Upload)</label>
                            <input type="file" name="cover_mkjs_file" accept="image/*" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; color: #9AA4B2; font-size: 0.78rem; margin-bottom: 6px;" onchange="previewCoverFile(this, 'preview-cover-mkjs')">
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Ou URL da Imagem</label>
                            <input type="url" name="cover_mkjs" value="<?php echo htmlspecialchars($mk_cover); ?>" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 0.85rem;" oninput="document.getElementById('preview-cover-mkjs').src=this.value">
                        </div>

                        <!-- DUELO DE CARTAS 1V1 -->
                        <?php 
                        $card_cover = $arena_settings['cover_card-duel'] ?? (GAMER_URL . '/images/covers/card-duel.jpg');
                        ?>
                        <div style="background: #121720; border: 1px solid var(--border-color); border-radius: 10px; padding: 16px;">
                            <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px;">
                                <img src="<?php echo htmlspecialchars($card_cover); ?>" id="preview-cover-card-duel" alt="Duelo de Cartas 1v1" style="width: 70px; height: 70px; border-radius: 8px; object-fit: cover; border: 2px solid #a855f7;">
                                <div>
                                    <strong style="color: #fff; display: block; font-size: 1rem;">Duelo de Cartas 1v1</strong>
                                    <span style="color: #a855f7; font-size: 0.8rem; font-weight: 600;">Estratégia e Baralho</span>
                                </div>
                            </div>
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Carregar Ficheiro (Upload)</label>
                            <input type="file" name="cover_card-duel_file" accept="image/*" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; color: #9AA4B2; font-size: 0.78rem; margin-bottom: 6px;" onchange="previewCoverFile(this, 'preview-cover-card-duel')">
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Ou URL da Imagem</label>
                            <input type="url" name="cover_card-duel" value="<?php echo htmlspecialchars($card_cover); ?>" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 0.85rem;" oninput="document.getElementById('preview-cover-card-duel').src=this.value">
                        </div>

                        <!-- PEDRA, PAPEL E TESOURA 1V1 -->
                        <?php 
                        $rps_cover = $arena_settings['cover_rps-battle'] ?? (GAMER_URL . '/images/covers/rps-battle.jpg');
                        ?>
                        <div style="background: #121720; border: 1px solid var(--border-color); border-radius: 10px; padding: 16px;">
                            <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px;">
                                <img src="<?php echo htmlspecialchars($rps_cover); ?>" id="preview-cover-rps-battle" alt="Pedra Papel Tesoura" style="width: 70px; height: 70px; border-radius: 8px; object-fit: cover; border: 2px solid #22C98B;">
                                <div>
                                    <strong style="color: #fff; display: block; font-size: 1rem;">Pedra Papel Tesoura</strong>
                                    <span style="color: #22C98B; font-size: 0.8rem; font-weight: 600;">Reflexos e Sorte 1v1</span>
                                </div>
                            </div>
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Carregar Ficheiro (Upload)</label>
                            <input type="file" name="cover_rps-battle_file" accept="image/*" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; color: #9AA4B2; font-size: 0.78rem; margin-bottom: 6px;" onchange="previewCoverFile(this, 'preview-cover-rps-battle')">
                            <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Ou URL da Imagem</label>
                            <input type="url" name="cover_rps-battle" value="<?php echo htmlspecialchars($rps_cover); ?>" style="width: 100%; background: #0c1017; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 0.85rem;" oninput="document.getElementById('preview-cover-rps-battle').src=this.value">
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
                    <button type="submit" class="btn-launch-hero" style="background: linear-gradient(135deg, #06b6d4, #0284c7); padding: 12px 28px; font-size: 1rem;">
                        <i class="fa-solid fa-floppy-disk"></i> Guardar Todas as Capas e Hero Banner
                    </button>
                </div>
            </form>
        <?php endif; ?>
    </main>


<!-- =========================================================================
     MODAIS INTERATIVOS DE GESTÃO ADMINISTRATIVA
     ========================================================================= -->

<!-- Modal: Criar Nova Conta de Utilizador -->
<div class="modal-over-overlay" id="modal-create-user">
    <div class="modal-over-card" style="text-align: left; max-width: 520px; width: 95%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid #282F3D; padding-bottom: 10px;">
            <h3 style="font-size: 1.2rem; font-weight: 800; color: #fff;">
                <i class="fa-solid fa-user-plus" style="color: #22C98B;"></i> Criar Nova Conta de Jogador
            </h3>
            <button onclick="document.getElementById('modal-create-user').classList.remove('active')" style="background: none; border: none; color: #9AA4B2; font-size: 1.3rem; cursor: pointer;">✕</button>
        </div>
        <form method="POST">
            <input type="hidden" name="action" value="admin_create_user">

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Nome Completo</label>
                    <input type="text" name="fullname" placeholder="ex: António da Silva" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Username (Login) *</label>
                    <input type="text" name="user_name" placeholder="ex: silva_gamer" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">E-mail Oficial *</label>
                    <input type="email" name="email" placeholder="ex: silva@gmail.com" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Palavra-passe *</label>
                    <input type="password" name="password" placeholder="Mínimo 4 caracteres" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px;">
                <div>
                    <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Saldo Inicial (AKZ)</label>
                    <input type="number" name="initial_balance" value="0" min="0" step="100" style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #22C98B; font-weight: 700;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Província de Angola</label>
                    <select name="province" style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
                        <option value="Luanda" selected>Luanda</option>
                        <option value="Benguela">Benguela</option>
                        <option value="Huambo">Huambo</option>
                        <option value="Huíla">Huíla</option>
                        <option value="Cabinda">Cabinda</option>
                        <option value="Cuanza Sul">Cuanza Sul</option>
                        <option value="Malanje">Malanje</option>
                    </select>
                </div>
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="document.getElementById('modal-create-user').classList.remove('active')">Cancelar</button>
                <button type="submit" class="btn-ngola btn-ngola-primary" style="background: linear-gradient(135deg, #22C98B, #10B981); color: #000;">
                    <i class="fa-solid fa-check"></i> Criar Conta
                </button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: Injetar / Alterar Saldo -->
<div class="modal-over-overlay" id="modal-inject-balance">
    <div class="modal-over-card" style="text-align: left; max-width: 440px; width: 95%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #282F3D; padding-bottom: 10px;">
            <h3 style="font-size: 1.15rem; font-weight: 800; color: #fff;">
                <i class="fa-solid fa-coins" style="color: #22C98B;"></i> Injetar Saldo na Carteira
            </h3>
            <button onclick="document.getElementById('modal-inject-balance').classList.remove('active')" style="background: none; border: none; color: #9AA4B2; font-size: 1.3rem; cursor: pointer;">✕</button>
        </div>
        <form method="POST">
            <input type="hidden" name="action" value="admin_inject_balance">
            <input type="hidden" name="target_user_id" id="inject-target-uid" value="0">

            <div style="padding: 10px 14px; background: #121720; border-radius: 8px; margin-bottom: 14px; display: flex; justify-content: space-between;">
                <span style="color: #9AA4B2; font-size: 0.82rem;">Jogador: <strong style="color: #fff;" id="inject-user-tag"></strong></span>
                <span style="color: #9AA4B2; font-size: 0.82rem;">Saldo Atual: <strong style="color: #22C98B;" id="inject-user-balance"></strong></span>
            </div>

            <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Tipo de Operação</label>
                <select name="type" style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff; font-weight: 700;">
                    <option value="credit">➕ Creditar / Depositar Saldo</option>
                    <option value="debit">➖ Debitar / Remover Saldo</option>
                </select>
            </div>

            <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Valor da Operação (AKZ)</label>
                <input type="number" name="amount" min="100" step="100" placeholder="ex: 5000" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #22C98B; font-size: 1.1rem; font-weight: 800;">
            </div>

            <div style="margin-bottom: 18px;">
                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Motivo / Justificativa</label>
                <input type="text" name="reason" placeholder="ex: Bónus de torneio, Ajuste de recarga" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="document.getElementById('modal-inject-balance').classList.remove('active')">Cancelar</button>
                <button type="submit" class="btn-ngola btn-ngola-primary" style="background: linear-gradient(135deg, #22C98B, #10B981); color: #000;">Confirmar Ajuste</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: Redefinir Palavra-passe -->
<div class="modal-over-overlay" id="modal-reset-password">
    <div class="modal-over-card" style="text-align: left; max-width: 420px; width: 95%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #282F3D; padding-bottom: 10px;">
            <h3 style="font-size: 1.15rem; font-weight: 800; color: #fff;">
                <i class="fa-solid fa-key" style="color: #F59E0B;"></i> Redefinir Palavra-passe
            </h3>
            <button onclick="document.getElementById('modal-reset-password').classList.remove('active')" style="background: none; border: none; color: #9AA4B2; font-size: 1.3rem; cursor: pointer;">✕</button>
        </div>
        <form method="POST">
            <input type="hidden" name="action" value="admin_reset_password">
            <input type="hidden" name="target_user_id" id="reset-target-uid" value="0">

            <p style="font-size: 0.85rem; color: #9AA4B2; margin-bottom: 14px;">
                Definir uma nova palavra-passe para o jogador <strong id="reset-user-tag" style="color: #fff;"></strong>:
            </p>

            <div style="margin-bottom: 18px;">
                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Nova Palavra-passe</label>
                <input type="password" name="new_password" placeholder="Mínimo 4 caracteres" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 10px 12px; color: #fff;">
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="document.getElementById('modal-reset-password').classList.remove('active')">Cancelar</button>
                <button type="submit" class="btn-ngola btn-ngola-primary" style="background: linear-gradient(135deg, #F59E0B, #D97706); color: #000;">Redefinir Agora</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: Editar Dados do Utilizador -->
<div class="modal-over-overlay" id="modal-edit-user">
    <div class="modal-over-card" style="text-align: left; max-width: 500px; width: 95%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #282F3D; padding-bottom: 10px;">
            <h3 style="font-size: 1.15rem; font-weight: 800; color: #fff;">
                <i class="fa-solid fa-pen" style="color: #38bdf8;"></i> Editar Dados do Utilizador
            </h3>
            <button onclick="document.getElementById('modal-edit-user').classList.remove('active')" style="background: none; border: none; color: #9AA4B2; font-size: 1.3rem; cursor: pointer;">✕</button>
        </div>
        <form method="POST">
            <input type="hidden" name="action" value="admin_edit_user">
            <input type="hidden" name="target_user_id" id="edit-user-id" value="0">

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Nome Completo</label>
                    <input type="text" name="fullname" id="edit-user-fullname" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Gamer Tag</label>
                    <input type="text" name="gamer_tag" id="edit-user-gamertag" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">E-mail</label>
                    <input type="email" name="email" id="edit-user-email" required style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Telemóvel</label>
                    <input type="text" name="phone" id="edit-user-phone" style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
            </div>

            <div style="margin-bottom: 18px;">
                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 4px; text-transform: uppercase;">Província</label>
                <select name="province" id="edit-user-province" style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff;">
                    <option value="Luanda">Luanda</option>
                    <option value="Benguela">Benguela</option>
                    <option value="Huambo">Huambo</option>
                    <option value="Huíla">Huíla</option>
                    <option value="Cabinda">Cabinda</option>
                    <option value="Cuanza Sul">Cuanza Sul</option>
                    <option value="Malanje">Malanje</option>
                </select>
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="document.getElementById('modal-edit-user').classList.remove('active')">Cancelar</button>
                <button type="submit" class="btn-ngola btn-ngola-primary">Salvar Alterações</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: Recusar Saque -->
<div class="modal-over-overlay" id="modal-reject-withdrawal">
    <div class="modal-over-card" style="text-align: left; max-width: 440px; width: 95%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #282F3D; padding-bottom: 10px;">
            <h3 style="font-size: 1.15rem; font-weight: 800; color: #F0444A;">
                <i class="fa-solid fa-ban"></i> Recusar Pedido de Saque
            </h3>
            <button onclick="document.getElementById('modal-reject-withdrawal').classList.remove('active')" style="background: none; border: none; color: #9AA4B2; font-size: 1.3rem; cursor: pointer;">✕</button>
        </div>
        <form method="POST">
            <input type="hidden" name="action" value="reject_withdrawal">
            <input type="hidden" name="withdrawal_id" id="reject-withdrawal-id" value="0">

            <div style="padding: 10px 14px; background: rgba(240,68,74,0.1); border: 1px solid rgba(240,68,74,0.3); border-radius: 8px; margin-bottom: 14px;">
                <p style="margin: 0; font-size: 0.82rem; color: #fca5a5;">
                    O valor de <strong id="reject-withdrawal-val" style="color: #fff;"></strong> será <strong>reembolsado imediatamente</strong> à carteira do jogador <strong id="reject-withdrawal-user"></strong>.
                </p>
            </div>

            <div style="margin-bottom: 18px;">
                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #9AA4B2; margin-bottom: 6px; text-transform: uppercase;">Motivo da Recusa (Notificado ao Jogador)</label>
                <select name="reject_reason" style="width: 100%; background: #121720; border: 1px solid #282F3D; border-radius: 6px; padding: 9px 12px; color: #fff; margin-bottom: 8px;">
                    <option value="IBAN inválido ou divergente do titular">IBAN inválido ou divergente do titular</option>
                    <option value="Dados bancários incompletos ou inexistentes">Dados bancários incompletos ou inexistentes</option>
                    <option value="Conta bancária suspensa pelo operador">Conta bancária suspensa pelo operador</option>
                    <option value="Suspeita de irregularidade cadastral">Suspeita de irregularidade cadastral</option>
                </select>
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="document.getElementById('modal-reject-withdrawal').classList.remove('active')">Cancelar</button>
                <button type="submit" class="btn-ngola btn-ngola-primary" style="background: linear-gradient(135deg, #F0444A, #C92E38);">Confirmar Recusa & Reembolso</button>
            </div>
        </form>
    </div>
</div>

<script>
function openInjectBalanceModal(uid, tag, balance) {
    document.getElementById('inject-target-uid').value = uid;
    document.getElementById('inject-user-tag').textContent = '@' + tag;
    document.getElementById('inject-user-balance').textContent = balance.toLocaleString('pt-AO') + ' AKZ';
    document.getElementById('modal-inject-balance').classList.add('active');
}

function openResetPasswordModal(uid, tag) {
    document.getElementById('reset-target-uid').value = uid;
    document.getElementById('reset-user-tag').textContent = '@' + tag;
    document.getElementById('modal-reset-password').classList.add('active');
}

function openEditUserModal(u) {
    document.getElementById('edit-user-id').value = u.user_id;
    document.getElementById('edit-user-fullname').value = (u.user_firstname + ' ' + (u.user_lastname || '')).trim() || u.user_name;
    document.getElementById('edit-user-gamertag').value = u.gamer_tag || u.user_name;
    document.getElementById('edit-user-email').value = u.user_email || '';
    document.getElementById('edit-user-phone').value = u.user_phone || '';
    document.getElementById('edit-user-province').value = u.user_current_city || 'Luanda';
    document.getElementById('modal-edit-user').classList.add('active');
}

function openRejectWithdrawalModal(id, tag, val) {
    document.getElementById('reject-withdrawal-id').value = id;
    document.getElementById('reject-withdrawal-user').textContent = '@' + tag;
    document.getElementById('reject-withdrawal-val').textContent = val;
    document.getElementById('modal-reject-withdrawal').classList.add('active');
}
</script>

<script>
function previewCoverFile(input, targetImgId) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var el = document.getElementById(targetImgId);
            if (el) el.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}
</script>

<!-- Modal de Cadastro / Edição de Jogador Bot Programado -->
<div class="modal-over-overlay" id="modal-admin-bot">
    <div class="modal-over-card" style="text-align: left; max-width: 580px; width: 95%;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
            <h3 style="font-size: 1.25rem; font-weight: 800; color: #fff;" id="modal-bot-title">
                <i class="fa-solid fa-robot" style="color: var(--neon-purple);"></i> Programar Jogador IA Oficial
            </h3>
            <button onclick="document.getElementById('modal-admin-bot').classList.remove('active')" style="background: none; border: none; color: var(--text-muted); font-size: 1.3rem; cursor: pointer;">✕</button>
        </div>
        <form method="POST" id="form-manage-bot">
            <input type="hidden" name="action" value="save_bot">
            <input type="hidden" name="bot_id" id="field-bot-id" value="0">

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Nome Completo</label>
                    <input type="text" name="fullname" id="field-bot-fullname" placeholder="ex: Tiago Bernardo dos Santos" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Username / Gamer Tag *</label>
                    <input type="text" name="bot_tag" id="field-bot-tag" placeholder="ex: Tiago_Pro, LendaLuanda" required style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Província de Angola</label>
                    <select name="province" id="field-bot-province" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 9px 12px; color: #fff;">
                        <option value="Luanda" selected>Luanda</option>
                        <option value="Benguela">Benguela</option>
                        <option value="Huambo">Huambo</option>
                        <option value="Huíla">Huíla</option>
                        <option value="Cabinda">Cabinda</option>
                        <option value="Cuanza Sul">Cuanza Sul</option>
                        <option value="Cuanza Norte">Cuanza Norte</option>
                        <option value="Uíge">Uíge</option>
                        <option value="Malanje">Malanje</option>
                        <option value="Namibe">Namibe</option>
                    </select>
                </div>
                <div>
                    <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Tempo p/ Aceitar (Segundos)</label>
                    <input type="number" name="accept_delay_seconds" id="field-bot-delay" value="5" min="2" max="45" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 9px 12px; color: #fff;" title="Tempo de resposta antes de aceitar o duelo">
                </div>
            </div>

            <!-- FOTO DE PERFIL / AVATAR COM PRÉ-VISUALIZAÇÃO -->
            <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">URL da Foto de Perfil / Avatar</label>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80" id="bot-avatar-preview" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--neon-cyan); flex-shrink: 0;">
                    <input type="text" name="avatar_url" id="field-bot-avatar" placeholder="https://..." oninput="document.getElementById('bot-avatar-preview').src = this.value || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'" style="flex: 1; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 9px 12px; color: #fff;">
                </div>
            </div>

            <!-- PROGRAMAÇÃO CENTRAL: TAXA / CHANCE DE ACERTO (0% A 100%) -->
            <div style="background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: 8px; padding: 12px 16px; margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <label style="font-size: 0.84rem; font-weight: 800; color: #fff; text-transform: uppercase; margin: 0;">
                        Domínio & Chance de Acerto do Bot:
                    </label>
                    <span id="winrate-label-display" style="font-family: var(--font-gamer); font-size: 1.15rem; font-weight: 900; color: var(--neon-green);">
                        70% de Acerto
                    </span>
                </div>
                <input type="range" name="target_winrate" id="field-bot-winrate" min="0" max="100" value="70" style="width: 100%; accent-color: var(--neon-green); cursor: pointer;" oninput="updateWinrateDisplay(this.value)">
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim); margin-top: 4px;">
                    <span>0% (Sempre Erra)</span>
                    <span>50% (Equilibrado)</span>
                    <span style="color: var(--neon-green); font-weight: 800;">100% (Domínio Absoluto / Imbatível)</span>
                </div>
            </div>

            <!-- APOSTA MÁXIMA & STATUS -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px;">
                <div>
                    <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Aposta Máxima Aceita (Kz)</label>
                    <input type="number" name="max_bet_amount" id="field-bot-maxbet" value="10000" min="0" step="500" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 9px 12px; color: var(--neon-gold); font-family: var(--font-gamer); font-weight: 700;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Disponibilidade na Rede</label>
                    <select name="is_active" id="field-bot-active" style="width: 100%; background: #121720; border: 1px solid var(--border-color); border-radius: 6px; padding: 9px 12px; color: #fff;">
                        <option value="1" selected>🟢 Ativo (Online na Arena)</option>
                        <option value="0">🔴 Pausado (Oculto)</option>
                    </select>
                </div>
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="document.getElementById('modal-admin-bot').classList.remove('active')">Cancelar</button>
                <button type="submit" class="btn-ngola btn-ngola-primary" id="btn-submit-bot">
                    <i class="fa-solid fa-check"></i> Salvar Programação
                </button>
            </div>
        </form>
    </div>
</div>

<script>
function updateWinrateDisplay(val) {
    const display = document.getElementById('winrate-label-display');
    if (!display) return;
    const num = parseInt(val) || 0;
    if (num >= 95) {
        display.innerHTML = `<span style="color: #10b981;">${num}% (Domínio Absoluto 🏆)</span>`;
    } else if (num >= 70) {
        display.innerHTML = `<span style="color: #06b6d4;">${num}% (Alto Desempenho)</span>`;
    } else if (num >= 45) {
        display.innerHTML = `<span style="color: #f59e0b;">${num}% (Equilibrado)</span>`;
    } else {
        display.innerHTML = `<span style="color: #ef4444;">${num}% (Fácil)</span>`;
    }
}

function openCreateBotModal() {
    document.getElementById('modal-bot-title').innerHTML = '<i class="fa-solid fa-robot" style="color: var(--neon-purple);"></i> Programar Novo Jogador Bot';
    document.getElementById('field-bot-id').value = '0';
    document.getElementById('field-bot-fullname').value = '';
    document.getElementById('field-bot-tag').value = '';
    document.getElementById('field-bot-province').value = 'Luanda';
    document.getElementById('field-bot-avatar').value = '';
    document.getElementById('bot-avatar-preview').src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
    document.getElementById('field-bot-winrate').value = '70';
    document.getElementById('field-bot-delay').value = '5';
    document.getElementById('field-bot-maxbet').value = '10000';
    document.getElementById('field-bot-active').value = '1';
    updateWinrateDisplay(70);
    document.getElementById('modal-admin-bot').classList.add('active');
}

function openEditBotModal(bot) {
    document.getElementById('modal-bot-title').innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: var(--neon-cyan);"></i> Editar Programação: ' + (bot.bot_tag || '');
    document.getElementById('field-bot-id').value = bot.id;
    document.getElementById('field-bot-fullname').value = bot.fullname || '';
    document.getElementById('field-bot-tag').value = bot.bot_tag || '';
    document.getElementById('field-bot-province').value = bot.province || 'Luanda';
    document.getElementById('field-bot-avatar').value = bot.avatar_url || '';
    document.getElementById('bot-avatar-preview').src = bot.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
    const wr = parseInt(bot.target_winrate) || 70;
    document.getElementById('field-bot-winrate').value = wr;
    document.getElementById('field-bot-delay').value = bot.accept_delay_seconds || 5;
    document.getElementById('field-bot-maxbet').value = bot.max_bet_amount || 10000;
    document.getElementById('field-bot-active').value = bot.is_active || 1;
    updateWinrateDisplay(wr);
    document.getElementById('modal-admin-bot').classList.add('active');
}
</script>


<script>
function runAITester() {
    var outBox = document.getElementById('ai-test-output-box');
    var outContent = document.getElementById('ai-test-output-content');
    var badge = document.getElementById('ai-test-status-badge');
    
    if (outBox && outContent) {
        outBox.style.display = 'block';
        outContent.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando à OpenRouter AI e avaliando latência...';
        if (badge) {
            badge.style.background = 'rgba(245, 158, 11, 0.2)';
            badge.style.color = '#f59e0b';
            badge.textContent = 'Processando...';
        }
    }

    fetch('api.php?action=ai_test_connection')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.status === 'online') {
                outContent.innerHTML = '<strong style="color:#10b981;"><i class="fa-solid fa-circle-check"></i> SUCESSO! A IA ESTÁ OPERACIONAL.</strong><br>' +
                    '• <strong>Latência:</strong> ' + data.latency_ms + ' ms<br>' +
                    '• <strong>Modelo Ativo:</strong> ' + data.model + '<br>' +
                    '• <strong>Mensagem:</strong> ' + data.message;
                if (badge) {
                    badge.style.background = 'rgba(16, 185, 129, 0.2)';
                    badge.style.color = '#10b981';
                    badge.textContent = 'Online (' + data.latency_ms + 'ms)';
                }
            } else {
                outContent.innerHTML = '<strong style="color:#ef4444;"><i class="fa-solid fa-circle-xmark"></i> Erro ou Fallback:</strong> ' + (data.message || data.error);
            }
        })
        .catch(function(err) {
            outContent.innerHTML = '<strong style="color:#ef4444;">Erro de conexão:</strong> ' + err.message;
        });
}
</script>

<?php require_once(__DIR__ . '/footer.php'); ?>
