<?php
/**
 * ARENA GAMER - PÁGINA OFICIAL DE LOGIN E REGISTO DE UTILIZADORES
 * Estrutura 100% Independente com Base de Dados Própria de Utilizadores
 */
require_once(__DIR__ . '/init.php');

// Logout
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    arena_logout_user();
    header('Location: ' . GAMER_URL . '/auth.php');
    exit;
}

$redirect = $_GET['redirect'] ?? (GAMER_URL . '/index.php');
if ($logged_user && !isset($_POST['auth_action'])) {
    header('Location: ' . $redirect);
    exit;
}

$active_tab = ($_GET['tab'] ?? 'login') === 'register' ? 'register' : 'login';
$error = '';
$success = '';

$angola_provinces = [
    'Luanda', 'Benguela', 'Huambo', 'Cabinda', 'Huíla', 'Malanje',
    'Cuanza Sul', 'Uíge', 'Namibe', 'Bié', 'Zaire', 'Lunda Norte',
    'Lunda Sul', 'Moxico', 'Cunene', 'Cuando Cubango', 'Bengo', 'Cuanza Norte'
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $auth_action = $_POST['auth_action'] ?? 'login';

    // 1. LOGIN RÁPIDO DE TESTE / ADMIN
    if ($auth_action === 'quick_login' && !empty($_POST['quick_uid'])) {
        $q_uid = (int)$_POST['quick_uid'];
        $res = $db->query("SELECT * FROM users WHERE user_id = {$q_uid} LIMIT 1");
        if ($res && $res->num_rows > 0) {
            arena_login_user($q_uid);
            header('Location: ' . $redirect);
            exit;
        }
    }

    // 2. LOGIN NORMAL COM UTILIZADOR / EMAIL / TELEFONE
    if ($auth_action === 'login') {
        $active_tab = 'login';
        $identifier = trim($_POST['identifier'] ?? '');
        $password = $_POST['password'] ?? '';

        if (empty($identifier) || empty($password)) {
            $error = 'Por favor, preencha o seu utilizador/e-mail e a palavra-passe.';
        } else {
            $id_esc = $db->real_escape_string($identifier);
            $res = $db->query("SELECT * FROM users WHERE user_name = '{$id_esc}' OR user_email = '{$id_esc}' OR user_phone = '{$id_esc}' LIMIT 1");
            if ($res && $res->num_rows > 0) {
                $u = $res->fetch_assoc();
                $valid_pass = false;
                if (password_verify($password, $u['user_password'])) {
                    $valid_pass = true;
                } elseif (md5($password) === $u['user_password'] || $password === $u['user_password']) {
                    $valid_pass = true;
                }

                if ($valid_pass) {
                    arena_login_user((int)$u['user_id']);
                    header('Location: ' . $redirect);
                    exit;
                } else {
                    $error = 'Palavra-passe incorreta. Verifique os seus dados e tente novamente.';
                }
            } else {
                $error = 'Conta não encontrada com esse utilizador, e-mail ou telefone.';
            }
        }
    }

    // 3. REGISTO DE NOVO UTILIZADOR NA NOSSA BASE DE DADOS
    if ($auth_action === 'register') {
        $active_tab = 'register';
        $fullname = trim($_POST['fullname'] ?? '');
        $username = trim($_POST['username'] ?? '');
        $email_phone = trim($_POST['email_phone'] ?? '');
        $province = trim($_POST['province'] ?? 'Luanda');
        $password = $_POST['password'] ?? '';
        $password_confirm = $_POST['password_confirm'] ?? '';

        if (!in_array($province, $angola_provinces)) {
            $province = 'Luanda';
        }

        if (strlen($fullname) < 3) {
            $error = 'Por favor, informe o seu nome completo.';
        } elseif (!preg_match('/^[a-zA-Z0-9_]{3,20}$/', $username)) {
            $error = 'O Nickname Gamer deve ter entre 3 e 20 caracteres (apenas letras, números e _).';
        } elseif (strlen($email_phone) < 5) {
            $error = 'Informe um e-mail ou número de telefone válido.';
        } elseif (strlen($password) < 4) {
            $error = 'A palavra-passe deve ter pelo menos 4 caracteres.';
        } elseif ($password !== $password_confirm) {
            $error = 'As palavras-passe não coincidem.';
        } else {
            $u_esc = $db->real_escape_string($username);
            $ep_esc = $db->real_escape_string($email_phone);

            $chk = $db->query("SELECT user_id FROM users WHERE user_name = '{$u_esc}' OR user_email = '{$ep_esc}' LIMIT 1");
            $chk_tag = $db->query("SELECT id FROM arena_profiles WHERE gamer_tag = '{$u_esc}' LIMIT 1");

            if (($chk && $chk->num_rows > 0) || ($chk_tag && $chk_tag->num_rows > 0)) {
                $error = 'Este Nickname ou E-mail/Telefone já está registado na Arena.';
            } else {
                $parts = preg_split('/\s+/', $fullname, 2);
                $fname = $db->real_escape_string($parts[0] ?? $username);
                $lname = $db->real_escape_string($parts[1] ?? '');
                $prov_esc = $db->real_escape_string($province);
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $hash_esc = $db->real_escape_string($hash);

                $is_email = strpos($email_phone, '@') !== false;
                $email_val = $is_email ? $ep_esc : ($u_esc . '@arena.ao');
                $phone_val = !$is_email ? $ep_esc : '';
                $default_avatar = 'https://ui-avatars.com/api/?name=' . urlencode($fullname) . '&background=ef4444&color=fff&bold=true';
                $av_esc = $db->real_escape_string($default_avatar);

                $ins = $db->query("INSERT INTO users 
                    (user_name, user_email, user_phone, user_firstname, user_lastname, user_password, user_picture, user_current_city, user_wallet_balance, user_group, user_registered) 
                    VALUES 
                    ('{$u_esc}', '{$email_val}', '{$phone_val}', '{$fname}', '{$lname}', '{$hash_esc}', '{$av_esc}', '{$prov_esc}', 0.00, 3, NOW())");

                if ($ins) {
                    $new_uid = (int)$db->insert_id;
                    $db->query("INSERT INTO arena_profiles 
                        (user_id, gamer_tag, gamer_title, province, selected_frame, favorite_game, competitive_points, status) 
                        VALUES 
                        ({$new_uid}, '{$u_esc}', 'Guerreiro da Arena', '{$prov_esc}', 'bronze', 'hyperstrike', 1000, 'online')");

                    arena_login_user($new_uid);
                    header('Location: ' . $redirect);
                    exit;
                } else {
                    $error = 'Erro ao criar conta: ' . $db->error;
                }
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="pt-AO" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title><?php echo ($active_tab === 'register') ? 'Criar Conta' : 'Entrar'; ?> | Arena Gamer</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-dark: #070709;
            --bg-card: #101015;
            --bg-input: #17171f;
            --red-main: #ef4444;
            --red-dark: #b91c1c;
            --border-subtle: rgba(255, 255, 255, 0.1);
            --text-muted: #9ca3af;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            background: radial-gradient(circle at 50% 0%, rgba(239, 68, 68, 0.16), transparent 55%), var(--bg-dark);
            color: #fff;
            font-family: 'Plus Jakarta Sans', sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px 16px;
        }
        .auth-wrapper {
            width: 100%;
            max-width: 470px;
            background: var(--bg-card);
            border: 1px solid rgba(239, 68, 68, 0.35);
            border-radius: 20px;
            padding: 32px 28px;
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85), 0 0 30px rgba(239, 68, 68, 0.1);
        }
        .brand-header {
            text-align: center;
            margin-bottom: 24px;
        }
        .brand-badge {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            font-family: 'Orbitron', sans-serif;
            font-size: 1.55rem;
            font-weight: 900;
            letter-spacing: 1px;
            color: #fff;
            text-decoration: none;
        }
        .brand-badge i {
            color: var(--red-main);
            font-size: 1.7rem;
            filter: drop-shadow(0 0 10px rgba(239,68,68,0.6));
        }
        .brand-sub {
            color: var(--text-muted);
            font-size: 0.88rem;
            margin-top: 6px;
        }
        .auth-tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            background: #0b0b0f;
            padding: 6px;
            border-radius: 12px;
            border: 1px solid var(--border-subtle);
            margin-bottom: 24px;
        }
        .auth-tab-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-family: 'Orbitron', sans-serif;
            font-size: 0.82rem;
            font-weight: 800;
            padding: 11px 10px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .auth-tab-btn.active {
            background: linear-gradient(135deg, var(--red-main), var(--red-dark));
            color: #fff;
            box-shadow: 0 4px 15px rgba(239, 68, 68, 0.35);
        }
        .form-group {
            margin-bottom: 16px;
        }
        .form-label {
            display: block;
            font-size: 0.78rem;
            font-weight: 700;
            text-transform: uppercase;
            color: #d1d5db;
            margin-bottom: 6px;
            letter-spacing: 0.5px;
        }
        .form-input, .form-select {
            width: 100%;
            background: var(--bg-input);
            border: 1px solid var(--border-subtle);
            border-radius: 10px;
            padding: 12px 14px;
            color: #fff;
            font-size: 0.95rem;
            font-family: inherit;
            transition: border-color 0.2s;
        }
        .form-input:focus, .form-select:focus {
            outline: none;
            border-color: var(--red-main);
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
        }
        .btn-submit {
            width: 100%;
            background: linear-gradient(135deg, var(--red-main), var(--red-dark));
            color: #fff;
            border: none;
            border-radius: 10px;
            padding: 14px;
            font-family: 'Orbitron', sans-serif;
            font-size: 0.95rem;
            font-weight: 800;
            cursor: pointer;
            letter-spacing: 0.8px;
            box-shadow: 0 8px 24px rgba(239, 68, 68, 0.35);
            transition: transform 0.15s, opacity 0.15s;
            margin-top: 6px;
        }
        .btn-submit:hover {
            transform: translateY(-1px);
            opacity: 0.96;
        }
        .alert-error {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid var(--red-main);
            color: #fecaca;
            padding: 12px 14px;
            border-radius: 10px;
            font-size: 0.86rem;
            margin-bottom: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .back-link {
            display: block;
            text-align: center;
            margin-top: 20px;
            color: var(--text-muted);
            font-size: 0.85rem;
            text-decoration: none;
        }
        .back-link:hover { color: #fff; }
    </style>
</head>
<body>

<div class="auth-wrapper">
    <div class="brand-header">
        <a href="<?php echo GAMER_URL; ?>/index.php" class="brand-badge">
            <i class="fa-solid fa-gamepad"></i>
            <span>ARENA <span style="color: #ef4444;">GAMER</span></span>
        </a>
        <div class="brand-sub">Plataforma Oficial de Duelos & Apostas 1v1 em Angola</div>
    </div>

    <div class="auth-tabs">
        <button type="button" class="auth-tab-btn <?php echo ($active_tab === 'login') ? 'active' : ''; ?>" onclick="switchAuthTab('login')">
            <i class="fa-solid fa-right-to-bracket"></i> ENTRAR
        </button>
        <button type="button" class="auth-tab-btn <?php echo ($active_tab === 'register') ? 'active' : ''; ?>" onclick="switchAuthTab('register')">
            <i class="fa-solid fa-user-plus"></i> CRIAR CONTA
        </button>
    </div>

    <?php if (!empty($error)): ?>
        <div class="alert-error">
            <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; font-size: 1.1rem;"></i>
            <span><?php echo htmlspecialchars($error); ?></span>
        </div>
    <?php endif; ?>

    <!-- FORMULÁRIO DE LOGIN -->
    <div id="tab-login" style="display: <?php echo ($active_tab === 'login') ? 'block' : 'none'; ?>;">
        <form method="POST" action="">
            <input type="hidden" name="auth_action" value="login">
            <div class="form-group">
                <label class="form-label"><i class="fa-solid fa-user" style="color:#ef4444;"></i> Utilizador, E-mail ou Telefone</label>
                <input type="text" name="identifier" class="form-input" placeholder="Ex: Claudio_Luanda ou 923000000" required>
            </div>
            <div class="form-group">
                <label class="form-label"><i class="fa-solid fa-lock" style="color:#ef4444;"></i> Palavra-passe</label>
                <input type="password" name="password" class="form-input" placeholder="Digite a sua palavra-passe" required>
            </div>
            <button type="submit" class="btn-submit">
                <i class="fa-solid fa-bolt"></i> ENTRAR NA ARENA
            </button>
        </form>
    </div>

    <!-- FORMULÁRIO DE REGISTO -->
    <div id="tab-register" style="display: <?php echo ($active_tab === 'register') ? 'block' : 'none'; ?>;">
        <form method="POST" action="">
            <input type="hidden" name="auth_action" value="register">
            <div class="form-group">
                <label class="form-label"><i class="fa-solid fa-id-card" style="color:#ef4444;"></i> Nome Completo</label>
                <input type="text" name="fullname" class="form-input" placeholder="Ex: Manuel dos Santos" required value="<?php echo htmlspecialchars($_POST['fullname'] ?? ''); ?>">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-user-ninja" style="color:#ef4444;"></i> Nickname Gamer</label>
                    <input type="text" name="username" class="form-input" placeholder="Ex: Manuel_AO" maxlength="20" required value="<?php echo htmlspecialchars($_POST['username'] ?? ''); ?>">
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-location-dot" style="color:#ef4444;"></i> Província</label>
                    <select name="province" class="form-select">
                        <?php foreach ($angola_provinces as $prov): ?>
                            <option value="<?php echo htmlspecialchars($prov); ?>" <?php echo (($prov === ($_POST['province'] ?? 'Luanda')) ? 'selected' : ''); ?>>
                                <?php echo htmlspecialchars($prov); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label"><i class="fa-solid fa-envelope" style="color:#ef4444;"></i> E-mail ou Nº de Telefone</label>
                <input type="text" name="email_phone" class="form-input" placeholder="Ex: 923456789 ou email@exemplo.com" required value="<?php echo htmlspecialchars($_POST['email_phone'] ?? ''); ?>">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-key" style="color:#ef4444;"></i> Palavra-passe</label>
                    <input type="password" name="password" class="form-input" placeholder="Mínimo 4 dígitos" required>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-check-double" style="color:#ef4444;"></i> Confirmar</label>
                    <input type="password" name="password_confirm" class="form-input" placeholder="Repita a senha" required>
                </div>
            </div>
            <button type="submit" class="btn-submit">
                <i class="fa-solid fa-user-check"></i> CRIAR CONTA E JOGAR
            </button>
        </form>
    </div>

    <a href="<?php echo GAMER_URL; ?>/index.php" class="back-link">
        <i class="fa-solid fa-arrow-left"></i> Voltar ao Lobby Principal
    </a>
</div>

<script>
function switchAuthTab(tab) {
    document.getElementById('tab-login').style.display = (tab === 'login') ? 'block' : 'none';
    document.getElementById('tab-register').style.display = (tab === 'register') ? 'block' : 'none';
    const btns = document.querySelectorAll('.auth-tab-btn');
    btns[0].classList.toggle('active', tab === 'login');
    btns[1].classList.toggle('active', tab === 'register');
}
</script>
</body>
</html>
