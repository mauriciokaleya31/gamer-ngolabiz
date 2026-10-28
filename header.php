<?php
/**
 * NGOLABIZ ARENA - CABEÇALHO MASTER (SIDEBAR & TOPBAR FIEL AO MOCKUP)
 * Sincronização Total com NgolaBiz, Saldo AKZ, Sessões e Responsividade Mobile sem sigla MMR
 */
if (!defined('ARENA_APP')) {
    require_once(__DIR__ . '/init.php');
}

$current_page = basename($_SERVER['PHP_SELF'], '.php');
$is_admin = arena_is_admin();

// Logotipo Oficial da Plataforma NgolaBiz
$logo_src = 'https://www.ngolabiz.it.ao/content/uploads/photos/2026/02/sngine_feef7a13bdb6bc6d49a4c41db54991c5.png';

// Dados do Jogador e Patente
$my_name = 'Jogador';
$my_tag = 'Jogador';
$my_avatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
$my_points = 1000;
$my_balance = 0.00;
$my_level = 1;
$my_xp = 0;

if ($logged_user) {
    $my_name = $logged_user['fullname'] ?: $logged_user['user_name'];
    $my_tag = $gamer_profile['gamer_tag'] ?? $my_name;
    $my_avatar = $logged_user['avatar'];
    $my_balance = (float)($logged_user['user_wallet_balance'] ?? 0.00);
    $my_points = (int)($gamer_profile['competitive_points'] ?? 1000);
    
    $total_m = (int)($gamer_profile['total_matches'] ?? 0);
    $total_w = (int)($gamer_profile['total_wins'] ?? 0);
    $my_level = max(1, floor(($total_w * 2 + $total_m) / 5) + 1);
    $my_xp = ($total_w * 150) + ($total_m * 50) + 120;
}

// Título de Patente
$my_rank_title = 'Combatente';
if ($my_points >= 1800) $my_rank_title = 'Lenda';
elseif ($my_points >= 1500) $my_rank_title = 'Mestre';
elseif ($my_points >= 1300) $my_rank_title = 'Diamante';
elseif ($my_points >= 1150) $my_rank_title = 'Platina';
elseif ($my_points >= 1000) $my_rank_title = 'Ouro';

// Notificações e Pendências de Admin
$active_tab = $_GET['tab'] ?? 'overview';
$my_unread_notifications_count = 0;
$my_notifications = [];
$admin_pending_withdrawals_count = 0;
$admin_pending_kyc_count = 0;

if ($logged_user) {
    $uid_n = (int)$logged_user['user_id'];
    $res_n_cnt = @$db->query("SELECT COUNT(*) FROM arena_notifications WHERE user_id = {$uid_n} AND is_read = 0");
    if ($res_n_cnt) {
        $my_unread_notifications_count = (int)$res_n_cnt->fetch_row()[0];
    }
    $res_n_list = @$db->query("SELECT * FROM arena_notifications WHERE user_id = {$uid_n} ORDER BY id DESC LIMIT 10");
    if ($res_n_list) {
        while ($rn = $res_n_list->fetch_assoc()) {
            $my_notifications[] = $rn;
        }
    }
}

if ($is_admin) {
    $res_w_cnt = @$db->query("SELECT COUNT(*) FROM arena_withdrawals WHERE status = 'pending'");
    if ($res_w_cnt) $admin_pending_withdrawals_count = (int)$res_w_cnt->fetch_row()[0];
    $res_k_cnt = @$db->query("SELECT COUNT(*) FROM arena_verifications WHERE status = 'pending'");
    if ($res_k_cnt) $admin_pending_kyc_count = (int)$res_k_cnt->fetch_row()[0];
}
?>
<!DOCTYPE html>
<html lang="pt-AO" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title><?php echo isset($page_title) ? htmlspecialchars($page_title) . ' | NgolaBiz Arena' : 'NgolaBiz Arena — O Universo Gamer de Angola'; ?></title>
    
    <link rel="icon" type="image/x-icon" href="<?php echo MAIN_URL; ?>/content/themes/<?php echo $system['theme'] ?? 'ngolabizz'; ?>/images/favicon.png">
    <meta name="theme-color" content="#090b10">

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="<?php echo GAMER_URL; ?>/assets/css/arena.css?v=<?php echo time(); ?>">

    <script>
        window.__ARENA_BASE_URL = "<?php echo GAMER_URL; ?>";
        if (window.location.origin && window.__ARENA_BASE_URL.indexOf(window.location.origin) === -1) {
            var p = window.location.pathname;
            window.__ARENA_BASE_URL = window.location.origin + (p.indexOf('/gamer') === 0 ? '/gamer' : '');
        }
        window.__MAIN_URL = "<?php echo MAIN_URL; ?>";
        window.__ARENA_LOGGED_USER = <?php echo $logged_user ? 'true' : 'false'; ?>;
        window.__ARENA_USER_ID = <?php echo $logged_user ? (int)$logged_user['user_id'] : 0; ?>;
        window.__ARENA_USER_VERIFIED = <?php echo ($logged_user && arena_is_user_verified($logged_user['user_id'])) ? 'true' : 'false'; ?>;
        window.__ARENA_GAMER_TAG = "<?php echo addslashes($my_tag); ?>";
        window.__ARENA_USER_AVATAR = "<?php echo addslashes($my_avatar); ?>";

        // Proteção Anti-DevTools: Bloqueio de Inspeção e Exibição de Código-Fonte
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            return false;
        });
        document.addEventListener('keydown', function(e) {
            if (e.keyCode === 123) { // F12
                e.preventDefault(); e.stopPropagation(); return false;
            }
            if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) { // Ctrl+Shift+I / J / C
                e.preventDefault(); e.stopPropagation(); return false;
            }
            if (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83)) { // Ctrl+U / Ctrl+S
                e.preventDefault(); e.stopPropagation(); return false;
            }
            if (e.metaKey && e.altKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
                e.preventDefault(); e.stopPropagation(); return false;
            }
            if (e.metaKey && (e.keyCode === 85 || e.keyCode === 83)) {
                e.preventDefault(); e.stopPropagation(); return false;
            }
        }, true);
    </script>
    <style>
        @media (max-width: 768px) {
            .arena-topbar {
                padding: 0 8px !important;
                gap: 6px !important;
                height: 52px !important;
            }
            .topbar-left {
                gap: 6px !important;
                min-width: 0 !important;
                flex: 1 1 auto !important;
                overflow: hidden !important;
            }
            .topbar-welcome-sub {
                display: none !important;
            }
            .topbar-user-headline {
                gap: 4px !important;
            }
            .topbar-user-name {
                font-size: 0.82rem !important;
                max-width: 80px !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }
            .rank-badge-pill {
                font-size: 0.62rem !important;
                padding: 1px 5px !important;
            }
            .topbar-actions-wrap {
                gap: 5px !important;
                flex-shrink: 0 !important;
            }
            .topbar-wallet-pill {
                padding: 0 7px !important;
                height: 32px !important;
                font-size: 0.74rem !important;
                gap: 4px !important;
                border-radius: 8px !important;
                max-width: 115px !important;
            }
            .topbar-wallet-pill span {
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }
            #arena-sound-toggle-btn {
                width: 32px !important;
                height: 32px !important;
            }
            .topbar-avatar-img {
                width: 32px !important;
                height: 32px !important;
            }
        }

        /* ESTILOS DOS BADGES ONLINE E ABAS DE DUELOS CASINO56 */
        .arena-game-online-badge {
            position: absolute;
            bottom: 8px;
            right: 8px;
            background: rgba(9, 11, 16, 0.85);
            border: 1px solid rgba(34, 201, 139, 0.4);
            color: #22C98B;
            font-size: 0.68rem;
            font-weight: 800;
            padding: 3px 8px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            backdrop-filter: blur(4px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        }
        .online-pulse-point {
            width: 6px;
            height: 6px;
            background: #22C98B;
            border-radius: 50%;
            box-shadow: 0 0 6px #22C98B;
            animation: pulseDot 1.4s infinite alternate;
        }
        @keyframes pulseDot {
            from { transform: scale(0.9); opacity: 0.7; }
            to { transform: scale(1.3); opacity: 1; }
        }

        .duels-tab-nav-btn:hover {
            border-color: #F0444A !important;
            color: #fff !important;
            transform: translateY(-1px);
        }

        .live-battle-card {
            background: linear-gradient(145deg, #161c28, #10141d);
            border: 1.5px solid #282F3D;
            border-radius: 14px;
            padding: 16px;
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 12px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.4);
            transition: all 0.25s ease;
        }
        .live-battle-card:hover {
            border-color: rgba(34, 201, 139, 0.5);
            box-shadow: 0 10px 25px rgba(0,0,0,0.6), 0 0 15px rgba(34, 201, 139, 0.15);
            transform: translateY(-2px);
        }
        .live-battle-card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; height: 3px;
            background: linear-gradient(90deg, #F0444A, #22C98B);
        }
    </style>
</head>
<body>

<svg style="width:0;height:0;position:absolute;" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="purple-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>
    <linearGradient id="cyan-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>
  </defs>
</svg>

<div class="arena-app-container">

    <?php if ($current_page === 'admin'): ?>
    <!-- =========================================================================
         SIDEBAR EXCLUSIVO DO ADMINISTRADOR (LEFT SIDEBAR DE COMANDO DA ARENA)
         ========================================================================= -->
    <aside class="arena-sidebar" id="arena-sidebar" style="background: #0D111A; border-right: 1.5px solid #282F3D; display: flex; flex-direction: column;">
        <div>
            <div class="sidebar-header" style="border-bottom: 1px solid #1F2736; padding-bottom: 14px;">
                <a href="<?php echo GAMER_URL; ?>/admin.php" class="sidebar-logo" style="display: flex; align-items: center; gap: 10px; text-decoration: none;">
                    <div style="width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #ef4444, #b91c1c); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px rgba(239, 68, 68, 0.45); flex-shrink: 0;">
                        <i class="fa-solid fa-gauge-high" style="color: #fff; font-size: 1.15rem;"></i>
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-family: var(--font-gamer); font-weight: 900; font-size: 1.15rem; color: #fff; letter-spacing: 1px; line-height: 1;">CASINO<span style="color: #ef4444;">56</span></span>
                        <span style="font-size: 0.65rem; font-weight: 800; color: #ef4444; letter-spacing: 1.5px; text-transform: uppercase;">ADMIN CONSOLE</span>
                    </div>
                </a>
                <button type="button" class="sidebar-close-btn" onclick="toggleArenaSidebar(false)">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div style="padding: 10px 14px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.22); border-radius: 10px; margin: 12px 0 16px 0; display: flex; align-items: center; gap: 10px;">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: #22C98B; box-shadow: 0 0 8px #22C98B; flex-shrink: 0;"></div>
                <div style="font-size: 0.78rem; font-weight: 700; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <?php echo htmlspecialchars($my_name); ?> <span style="color: #9AA4B2; font-weight: 400;">(Admin)</span>
                </div>
            </div>

            <ul class="sidebar-nav">
                <li class="sidebar-nav-item <?php echo ($active_tab === 'overview') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=overview">
                        <i class="fa-solid fa-chart-pie"></i>
                        <span>Visão Geral & KPIs</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'finances') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=finances" style="color: #22C98B;">
                        <i class="fa-solid fa-sack-dollar" style="color: #22C98B;"></i>
                        <span>Finanças & Ganhos</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'users') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=users">
                        <i class="fa-solid fa-users"></i>
                        <span>Gestão de Utilizadores</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'withdrawals') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=withdrawals">
                        <i class="fa-solid fa-money-bill-transfer"></i>
                        <span>Pedidos de Saque</span>
                        <?php if (!empty($admin_pending_withdrawals_count)): ?>
                            <span style="background: #F0444A; color: #fff; font-size: 0.65rem; font-weight: 900; padding: 1px 6px; border-radius: 999px; margin-left: auto;"><?php echo $admin_pending_withdrawals_count; ?></span>
                        <?php endif; ?>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'kyc') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=kyc">
                        <i class="fa-solid fa-id-card"></i>
                        <span>Verificação KYC</span>
                        <?php if (!empty($admin_pending_kyc_count)): ?>
                            <span style="background: #F59E0B; color: #000; font-size: 0.65rem; font-weight: 900; padding: 1px 6px; border-radius: 999px; margin-left: auto;"><?php echo $admin_pending_kyc_count; ?></span>
                        <?php endif; ?>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'support') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=support">
                        <i class="fa-solid fa-headset" style="color: #38bdf8;"></i>
                        <span>Perfil de Atendimento</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'covers') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=covers">
                        <i class="fa-solid fa-image"></i>
                        <span>Capas dos Jogos</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'bots') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=bots">
                        <i class="fa-solid fa-users-gear"></i>
                        <span>Oponentes Bots</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'ai') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=ai">
                        <i class="fa-solid fa-brain" style="color: #a855f7;"></i>
                        <span>IA dos Bots</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'matches') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=matches">
                        <i class="fa-solid fa-shield-halved"></i>
                        <span>Auditoria Batalhas</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'settings') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=settings">
                        <i class="fa-solid fa-sliders"></i>
                        <span>Regras & Taxas</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($active_tab === 'logs') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php?tab=logs">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                        <span>Logs de Auditoria</span>
                    </a>
                </li>
                <li class="sidebar-nav-item" style="margin-top: 14px; border-top: 1px solid #1F2736; padding-top: 12px;">
                    <a href="<?php echo GAMER_URL; ?>/index.php" style="color: #9AA4B2;">
                        <i class="fa-solid fa-gamepad"></i>
                        <span>Voltar à Arena Gamer</span>
                    </a>
                </li>
            </ul>
        </div>
    </aside>

    <?php else: ?>
    <!-- =========================================================================
         SIDEBAR GAMER VERTICAL PADRÃO
         ========================================================================= -->
    <aside class="arena-sidebar" id="arena-sidebar">
        <div>
            <div class="sidebar-header">
                <a href="<?php echo GAMER_URL; ?>/index.php" class="sidebar-logo" style="display: flex; align-items: center; gap: 10px; text-decoration: none;">
                    <div style="width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #F0444A, #C92E38); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px rgba(240, 68, 74, 0.45); flex-shrink: 0;">
                        <i class="fa-solid fa-crown" style="color: #fff; font-size: 1.15rem;"></i>
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-family: var(--font-gamer); font-weight: 900; font-size: 1.25rem; color: #fff; letter-spacing: 1.5px; line-height: 1;">CASINO<span style="color: #F0444A;">56</span></span>
                        <span style="font-size: 0.68rem; font-weight: 700; color: #9AA4B2; letter-spacing: 2px; text-transform: uppercase;">Arena Gamer</span>
                    </div>
                </a>
                <button type="button" class="sidebar-close-btn" onclick="toggleArenaSidebar(false)">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <ul class="sidebar-nav">
                <li class="sidebar-nav-item <?php echo ($current_page == 'index') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/index.php">
                        <i class="fa-solid fa-house"></i>
                        <span>Início</span>
                    </a>
                </li>
                <li class="sidebar-nav-item">
                    <a href="<?php echo GAMER_URL; ?>/index.php#arena-games-section">
                        <i class="fa-solid fa-gamepad"></i>
                        <span>Jogos</span>
                    </a>
                </li>
                <li class="sidebar-nav-item">
                    <a href="<?php echo GAMER_URL; ?>/index.php#arena-mural-section">
                        <i class="fa-solid fa-swords"></i>
                        <span>Duelos</span>
                    </a>
                </li>
                <li class="sidebar-nav-item">
                    <a href="<?php echo GAMER_URL; ?>/index.php#arena-live-wins-section">
                        <i class="fa-solid fa-chart-line"></i>
                        <span>Resultados</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($current_page == 'profile') ? 'active' : ''; ?>">
                    <a href="<?php echo $logged_user ? GAMER_URL . '/profile.php' : GAMER_URL . '/auth.php'; ?>">
                        <i class="fa-solid fa-user-ninja"></i>
                        <span>Perfil</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($current_page == 'saque') ? 'active' : ''; ?>">
                    <a href="<?php echo $logged_user ? GAMER_URL . '/saque.php' : GAMER_URL . '/auth.php'; ?>" style="color: #F59E0B; font-weight: 700;">
                        <i class="fa-solid fa-money-bill-transfer" style="color: #F59E0B;"></i>
                        <span>Solicitar Saque</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($current_page == 'deposito') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/deposito.php" style="color: #22C98B; font-weight: 700;">
                        <i class="fa-solid fa-building-columns" style="color: #22C98B;"></i>
                        <span>Depositar</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($current_page == 'verificacao') ? 'active' : ''; ?>">
                    <a href="<?php echo $logged_user ? GAMER_URL . '/verificacao.php' : GAMER_URL . '/auth.php'; ?>" style="<?php echo ($logged_user && !arena_is_user_verified($logged_user['user_id'])) ? 'color: #F59E0B; font-weight: 700;' : ''; ?>">
                        <i class="fa-solid fa-id-card" style="<?php echo ($logged_user && !arena_is_user_verified($logged_user['user_id'])) ? 'color: #F59E0B;' : ''; ?>"></i>
                        <span>Verificação KYC</span>
                        <?php if ($logged_user): ?>
                            <?php if (arena_is_user_verified($logged_user['user_id'])): ?>
                                <i class="fa-solid fa-circle-check" style="color: #22C98B; font-size: 0.80rem; margin-left: auto;" title="Conta Verificada"></i>
                            <?php else: ?>
                                <span style="background: rgba(245,158,11,0.2); color: #F59E0B; font-size: 0.65rem; font-weight: 900; padding: 1px 6px; border-radius: 999px; margin-left: auto;">Pendente</span>
                            <?php endif; ?>
                        <?php endif; ?>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($current_page == 'rankings') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/rankings.php">
                        <i class="fa-solid fa-trophy"></i>
                        <span>Prémios & Ranking</span>
                    </a>
                </li>
                <li class="sidebar-nav-item <?php echo ($current_page == 'suporte') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/suporte.php">
                        <i class="fa-solid fa-headset" style="color: #F0444A;"></i>
                        <span>Suporte Ao Vivo</span>
                    </a>
                </li>
                <?php if ($logged_user): ?>
                <li class="sidebar-nav-item">
                    <a href="<?php echo GAMER_URL; ?>/auth.php?action=logout" style="color: #9AA4B2;">
                        <i class="fa-solid fa-right-from-bracket"></i>
                        <span>Terminar Sessão</span>
                    </a>
                </li>
                <?php else: ?>
                <li class="sidebar-nav-item <?php echo ($current_page == 'auth') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/auth.php" style="color: #F0444A; font-weight: 700;">
                        <i class="fa-solid fa-right-to-bracket"></i>
                        <span>Entrar / Registar</span>
                    </a>
                </li>
                <?php endif; ?>
                <?php if ($is_admin): ?>
                <li class="sidebar-nav-item <?php echo ($current_page == 'admin') ? 'active' : ''; ?>">
                    <a href="<?php echo GAMER_URL; ?>/admin.php" style="color: #F0444A;">
                        <i class="fa-solid fa-sliders" style="color: #F0444A;"></i>
                        <span>Painel Admin</span>
                    </a>
                </li>
                <?php endif; ?>
            </ul>
        </div>

        <!-- CARD PROMOCIONAL NA SIDEBAR -->
        <div class="sidebar-cta-trophy-card" style="margin-top: auto; padding: 14px; background: linear-gradient(180deg, rgba(23, 28, 38, 0.95), rgba(16, 20, 28, 0.98)); border: 1px solid #282F3D; border-radius: 14px; position: relative; overflow: hidden; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
            <div style="width: 100%; height: 80px; border-radius: 10px; overflow: hidden; margin-bottom: 10px; position: relative;">
                <img src="<?php echo GAMER_URL; ?>/images/banners/trophy_cta.jpg" alt="Troféu" style="width: 100%; height: 100%; object-fit: cover; filter: brightness(0.9);">
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(16, 20, 28, 0.9), transparent);"></div>
            </div>
            <div style="font-family: var(--font-gamer); font-size: 0.92rem; font-weight: 800; color: #fff; letter-spacing: 0.5px; margin-bottom: 2px;">
                JOGA • DESAFIA • GANHA!
            </div>
            <p style="font-size: 0.72rem; color: #9AA4B2; margin-bottom: 10px; line-height: 1.3;">
                Duelos 1v1 com prémios instantâneos em Kwanzas.
            </p>
            <button type="button" onclick="openMatchmakingModal('hyperstrike')" style="width: 100%; padding: 8px 12px; font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; background: linear-gradient(135deg, #F0444A, #C92E38); color: #fff; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 14px rgba(240, 68, 74, 0.35); transition: transform 0.2s;">
                <i class="fa-solid fa-bolt"></i> Participar Agora
            </button>
        </div>

        <?php if ($logged_user): ?>
        <div class="sidebar-footer-level" style="margin-top: 14px;">
            <div class="sidebar-level-info">
                <img src="<?php echo htmlspecialchars($my_avatar); ?>" alt="Avatar" class="sidebar-level-avatar">
                <div>
                    <div class="sidebar-level-name">Nível <?php echo $my_level; ?></div>
                    <div class="sidebar-level-tag"><?php echo $my_rank_title; ?></div>
                </div>
            </div>
            <div class="xp-progress-bar-wrap">
                <div class="xp-progress-bar" style="width: <?php echo min(100, ($my_xp % 1000) / 10); ?>%;"></div>
            </div>
            <div class="xp-label">
                <span>XP <?php echo number_format($my_xp, 0, '', '.'); ?></span>
                <span><?php echo (int)(($my_xp % 1000) / 10); ?>%</span>
            </div>
        </div>
        <?php endif; ?>
    </aside>
    <?php endif; ?>

    <!-- ÁREA DE CONTEÚDO PRINCIPAL -->
    <div class="arena-main-content">

        <?php if (!empty($_SESSION['admin_impersonator_id'])): ?>
        <!-- BANNER DE AVISO DE CONTA IMPERSONADA (ADMIN) -->
        <div style="background: linear-gradient(90deg, #F59E0B, #D97706); color: #000; padding: 10px 18px; font-weight: 800; font-size: 0.85rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; border-bottom: 2px solid #000; box-shadow: 0 4px 15px rgba(0,0,0,0.5); z-index: 99999;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.1rem;"></i>
                <span>MODO ADMINISTRADOR ATIVO: Você está a navegar na conta do jogador <strong>@<?php echo htmlspecialchars($my_tag); ?></strong> (ID #<?php echo (int)$logged_user['user_id']; ?>).</span>
            </div>
            <a href="<?php echo GAMER_URL; ?>/admin.php?action=stop_impersonating" style="background: #000; color: #fff; padding: 6px 14px; border-radius: 6px; text-decoration: none; font-size: 0.80rem; font-weight: 900; display: inline-flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-right-from-bracket"></i> Voltar à Minha Conta Admin
            </a>
        </div>
        <?php endif; ?>

        <!-- TOPBAR OFICIAL -->
        <header class="arena-topbar">
            <div class="topbar-left">
                <button type="button" class="mobile-menu-toggle" onclick="toggleArenaSidebar(true)">
                    <i class="fa-solid fa-bars"></i>
                </button>
                <?php if ($logged_user): ?>
                <div class="topbar-welcome-wrap">
                    <span class="topbar-welcome-sub">BEM-VINDO,</span>
                    <div class="topbar-user-headline">
                        <span class="topbar-user-name"><?php echo htmlspecialchars(explode(' ', $my_name)[0]); ?></span>
                        <span class="rank-badge-pill"><?php echo $my_rank_title; ?></span>
                    </div>
                </div>
                <?php else: ?>
                <div class="topbar-welcome-wrap">
                    <span class="topbar-welcome-sub" style="color: #F0444A; font-weight: 800;">CASINO56</span>
                    <div class="topbar-user-headline">
                        <span class="topbar-user-name" style="font-size: 0.95rem;">ARENA GAMER</span>
                    </div>
                </div>
                <?php endif; ?>
            </div>

            <div class="topbar-search-wrap">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" class="topbar-search-input" placeholder="Pesquisar jogos, duelos ou jogadores..." onkeyup="handleArenaGlobalSearch(this.value)">
            </div>

            <div class="topbar-actions-wrap" style="position: relative;">
                <?php if ($logged_user): ?>
                <!-- SALDO DO UTILIZADOR AUTENTICADO -->
                <div class="topbar-wallet-pill" style="background: #171C26; border: 1px solid #282F3D; border-radius: 10px; padding: 4px 6px 4px 12px; display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-coins" style="color: #F59E0B; font-size: 1rem;"></i>
                    <span style="font-weight: 800; font-size: 0.90rem; color: #F5F7FA;"><?php echo arena_money($my_balance); ?></span>
                    <a href="<?php echo GAMER_URL; ?>/deposito.php" title="Depositar Kwanzas" style="background: #22C98B; color: #000; width: 26px; height: 26px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; font-weight: 900; font-size: 0.82rem; transition: transform 0.2s;">
                        <i class="fa-solid fa-plus"></i>
                    </a>
                </div>

                <!-- NOTIFICAÇÕES INTERATIVAS -->
                <div style="position: relative; display: inline-block;">
                    <button type="button" id="arena-notifications-btn" onclick="toggleArenaNotificationsMenu()" class="action-icon-btn" style="position: relative; background: #171C26; border: 1px solid #282F3D; color: #F5F7FA; width: 38px; height: 38px; border-radius: 10px; cursor: pointer;" title="Notificações">
                        <i class="fa-regular fa-bell"></i>
                        <?php if ($my_unread_notifications_count > 0): ?>
                            <span id="arena-notifications-badge" style="position: absolute; top: -3px; right: -3px; background: #F0444A; color: #fff; font-size: 0.62rem; font-weight: 800; padding: 1px 5px; border-radius: 999px;">
                                <?php echo ($my_unread_notifications_count > 9) ? '9+' : $my_unread_notifications_count; ?>
                            </span>
                        <?php endif; ?>
                    </button>

                    <!-- DROPDOWN FLUTUANTE DE NOTIFICAÇÕES -->
                    <div id="arena-notifications-dropdown" style="display: none; position: absolute; right: 0; top: 48px; width: 340px; background: #171C26; border: 1.5px solid #282F3D; border-radius: 14px; box-shadow: 0 12px 35px rgba(0,0,0,0.7); z-index: 10000; overflow: hidden; animation: fadeInScale 0.2s ease;">
                        <div style="padding: 12px 16px; border-bottom: 1px solid #282F3D; display: flex; justify-content: space-between; align-items: center; background: #10141C;">
                            <div style="font-weight: 800; font-size: 0.88rem; color: #fff; display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-bell" style="color: #F0444A;"></i> Notificações
                            </div>
                            <button type="button" onclick="markAllNotificationsAsRead()" style="background: transparent; border: none; color: #9AA4B2; font-size: 0.72rem; cursor: pointer; text-decoration: underline;">
                                Marcar lidas
                            </button>
                        </div>
                        <div id="arena-notifications-list" style="max-height: 320px; overflow-y: auto;">
                            <?php if (empty($my_notifications)): ?>
                                <div style="padding: 24px 16px; text-align: center; color: #9AA4B2; font-size: 0.82rem;">
                                    <i class="fa-regular fa-bell-slash" style="font-size: 1.5rem; display: block; margin-bottom: 6px; opacity: 0.6;"></i>
                                    Nenhuma notificação recente.
                                </div>
                            <?php else: ?>
                                <?php foreach ($my_notifications as $notif): 
                                    $n_icon = 'fa-bell';
                                    $n_color = '#38bdf8';
                                    if ($notif['type'] === 'deposit') { $n_icon = 'fa-building-columns'; $n_color = '#22C98B'; }
                                    elseif ($notif['type'] === 'withdrawal') { $n_icon = 'fa-money-bill-transfer'; $n_color = '#F59E0B'; }
                                    elseif ($notif['type'] === 'battle') { $n_icon = 'fa-swords'; $n_color = '#F0444A'; }
                                    elseif ($notif['type'] === 'kyc') { $n_icon = 'fa-id-card'; $n_color = '#a855f7'; }
                                ?>
                                <a href="<?php echo !empty($notif['link']) ? htmlspecialchars($notif['link']) : '#'; ?>" style="display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); text-decoration: none; background: <?php echo $notif['is_read'] ? 'transparent' : 'rgba(240, 68, 74, 0.05)'; ?>; transition: background 0.15s;">
                                    <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; color: <?php echo $n_color; ?>; flex-shrink: 0;">
                                        <i class="fa-solid <?php echo $n_icon; ?>" style="font-size: 0.88rem;"></i>
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 700; font-size: 0.82rem; color: #fff; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                            <?php echo htmlspecialchars($notif['title']); ?>
                                        </div>
                                        <div style="font-size: 0.74rem; color: #9AA4B2; line-height: 1.35; margin-bottom: 4px;">
                                            <?php echo htmlspecialchars($notif['message']); ?>
                                        </div>
                                        <div style="font-size: 0.65rem; color: #64748B;">
                                            <?php echo date('d/m H:i', strtotime($notif['created_at'])); ?>
                                        </div>
                                    </div>
                                </a>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </div>
                        <div style="padding: 10px 14px; background: #10141C; border-top: 1px solid #282F3D; text-align: center;">
                            <button type="button" onclick="requestBrowserPushNotifications()" style="width: 100%; background: rgba(240, 68, 74, 0.15); border: 1px solid rgba(240, 68, 74, 0.4); color: #F0444A; font-weight: 800; font-size: 0.76rem; padding: 7px 10px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                                <i class="fa-solid fa-satellite-dish"></i> Ativar Notificações no Telemóvel / PC
                            </button>
                        </div>
                    </div>
                </div>

                <!-- SELO OU ATALHO DE VERIFICAÇÃO KYC -->
                <?php if (arena_is_user_verified($logged_user['user_id'])): ?>
                    <a href="<?php echo GAMER_URL; ?>/verificacao.php" title="Conta Verificada Oficialmente" style="color: #22C98B; font-size: 1.15rem; display: inline-flex; align-items: center; text-decoration: none;">
                        <i class="fa-solid fa-circle-check"></i>
                    </a>
                <?php else: ?>
                    <a href="<?php echo GAMER_URL; ?>/verificacao.php" title="Verificar Conta com BI / Carta" style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #F59E0B; padding: 6px 10px; border-radius: 8px; text-decoration: none; font-size: 0.74rem; font-weight: 800; display: inline-flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-id-card"></i> <span>Verificar</span>
                    </a>
                <?php endif; ?>
                <?php endif; ?>

                <button type="button" class="action-icon-btn" id="arena-sound-toggle-btn" onclick="window.arenaAudio && window.arenaAudio.toggleMute()" title="Áudio da Arena" style="background: #171C26; border: 1px solid #282F3D; color: #F5F7FA; width: 38px; height: 38px; border-radius: 10px;">
                    <i class="fa-solid fa-volume-high" id="arena-sound-icon"></i>
                </button>

                <div class="topbar-avatar-wrap">
                    <?php if ($logged_user): ?>
                        <a href="<?php echo GAMER_URL; ?>/profile.php" style="display: flex; align-items: center; gap: 8px; text-decoration: none;">
                            <img src="<?php echo htmlspecialchars($my_avatar); ?>" alt="<?php echo htmlspecialchars($my_name); ?>" class="topbar-avatar-img" style="border: 2px solid #F0444A;">
                            <span class="online-status-indicator" style="background: #22C98B;"></span>
                        </a>
                    <?php else: ?>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <a href="<?php echo GAMER_URL; ?>/auth.php?tab=login" class="btn-login-topbar" style="background: linear-gradient(135deg, #F0444A, #C92E38); color: #fff; padding: 8px 16px; font-size: 0.82rem; font-weight: 800; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 14px rgba(240, 68, 74, 0.4); display: inline-flex; align-items: center; gap: 6px; letter-spacing: 0.5px;">
                                <i class="fa-solid fa-right-to-bracket"></i> Entrar
                            </a>
                            <a href="<?php echo GAMER_URL; ?>/auth.php?tab=register" class="btn-register-topbar" style="background: transparent; color: #F5F7FA; border: 1px solid #282F3D; padding: 8px 14px; font-size: 0.82rem; font-weight: 700; border-radius: 8px; text-decoration: none; transition: all 0.2s;">
                                Registar
                            </a>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        </header>

        <script>
        function toggleArenaNotificationsMenu() {
            var drop = document.getElementById('arena-notifications-dropdown');
            if (drop) {
                drop.style.display = (drop.style.display === 'none' || drop.style.display === '') ? 'block' : 'none';
            }
        }

        document.addEventListener('click', function(e) {
            var btn = document.getElementById('arena-notifications-btn');
            var drop = document.getElementById('arena-notifications-dropdown');
            if (drop && btn && !btn.contains(e.target) && !drop.contains(e.target)) {
                drop.style.display = 'none';
            }
        });

        function markAllNotificationsAsRead() {
            var apiBase = window.__ARENA_BASE_URL || '';
            var fd = new FormData();
            fd.append('action', 'mark_notifications_read');
            fetch(apiBase + '/api.php', { method: 'POST', body: fd })
                .then(r => r.json())
                .then(res => {
                    var badge = document.getElementById('arena-notifications-badge');
                    if (badge) badge.style.display = 'none';
                    var list = document.getElementById('arena-notifications-list');
                    if (list) {
                        var links = list.querySelectorAll('a');
                        links.forEach(a => { a.style.background = 'transparent'; });
                    }
                });
        }

        function requestBrowserPushNotifications() {
            if (!('Notification' in window)) {
                alert('O seu navegador não suporta notificações Web Push.');
                return;
            }
            Notification.requestPermission().then(function(perm) {
                if (perm === 'granted') {
                    new Notification('Casino56 Arena', {
                        body: 'Notificações ativadas com sucesso! Você receberá alertas em tempo real de saques e desafios.',
                        icon: '<?php echo GAMER_URL; ?>/images/banners/trophy_cta.jpg'
                    });
                    alert('Notificações no Navegador ativadas com sucesso!');
                } else {
                    alert('Permissão de notificações não foi concedida.');
                }
            });
        }
        </script>
