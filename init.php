<?php
/**
 * ARENA GAMER - BOOTSTRAP CENTRAL INDEPENDENTE (STANDALONE)
 * Base de Dados Própria de Utilizadores, Carteira, Depósitos Multicaixa Express e Suporte Ao Vivo
 */

if (!defined('ARENA_APP')) {
    define('ARENA_APP', true);
}

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

// Fuso Horário Oficial de Angola
date_default_timezone_set('Africa/Luanda');

// 1. Detetar Ambiente (Local XAMPP vs Servidor cPanel) e Conectar à Nossa Base de Dados
$is_https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
$http_proto = $is_https ? 'https://' : 'http://';
$current_host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$req_uri = $_SERVER['REQUEST_URI'] ?? ($_SERVER['SCRIPT_NAME'] ?? '');

$is_cpanel = file_exists('/mnt/homer2/cassino56');
$is_local_env = !$is_cpanel && (strpos($current_host, 'localhost') !== false || strpos($current_host, '127.0.0.1') !== false || PHP_OS_FAMILY === 'Windows');

if ($is_local_env) {
    $db_host = '127.0.0.1';
    $db_user = 'root';
    $db_pass = '';
    $db_name = 'u841854856_ngolabiz';
    $db_port = 3306;
} else {
    $db_host = 'localhost';
    $db_user = 'cassino56_ngolabiz';
    $db_pass = 'NgolaBiz2026!Arena';
    $db_name = 'cassino56_ngolabiz';
    $db_port = 3306;
}

$db = new mysqli($db_host, $db_user, $db_pass, $db_name, $db_port);
if ($db->connect_error) {
    die("Erro de conexão à Base de Dados da Arena: " . $db->connect_error);
}
$db->set_charset("utf8mb4");

// 2. Definir URLs Base da Nossa Estrutura Independente
if (strpos($req_uri, '/~cassino56') === 0) {
    $base_root_url = $http_proto . $current_host . '/~cassino56';
    $gamer_base_url = $base_root_url . '/gamer';
} elseif ($is_local_env) {
    $base_root_url = $http_proto . $current_host . '/ngolabiz';
    $gamer_base_url = $base_root_url . '/gamer';
} elseif (strpos($current_host, 'gamer.') === 0) {
    $base_root_url = $http_proto . $current_host;
    $gamer_base_url = $base_root_url;
} else {
    $base_root_url = $http_proto . $current_host;
    $gamer_base_url = $base_root_url . '/gamer';
}

if (!defined('MAIN_URL')) define('MAIN_URL', $gamer_base_url);
if (!defined('GAMER_URL')) define('GAMER_URL', $gamer_base_url);

$system = [
    'system_url' => GAMER_URL,
    'system_title' => 'Arena Gamer',
    'system_currency_symbol' => 'AKZ',
    'theme' => 'arena',
    'games_enabled' => '1'
];

// 3. Garantir Tabelas de Utilizadores, Depósitos Multicaixa Express e Chat de Suporte
@$db->query("CREATE TABLE IF NOT EXISTS `arena_deposits` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `gamer_tag` VARCHAR(64) NOT NULL,
    `amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `entity` VARCHAR(32) NOT NULL DEFAULT '930',
    `reference` VARCHAR(64) NOT NULL DEFAULT '929852534',
    `receipt_file` VARCHAR(255) NOT NULL,
    `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

@$db->query("CREATE TABLE IF NOT EXISTS `arena_support_messages` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `gamer_tag` VARCHAR(64) NOT NULL,
    `user_avatar` VARCHAR(255) DEFAULT '',
    `sender_role` ENUM('user','admin') NOT NULL DEFAULT 'user',
    `message` TEXT NOT NULL,
    `attachment` VARCHAR(255) DEFAULT NULL,
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

// Tabela de Verificação de Identidade (KYC: BI, Carta de Condução, Passaporte)
@$db->query("CREATE TABLE IF NOT EXISTS `arena_verifications` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `gamer_tag` VARCHAR(64) NOT NULL,
    `fullname` VARCHAR(128) NOT NULL,
    `doc_type` ENUM('bi', 'cnh', 'passaporte') NOT NULL DEFAULT 'bi',
    `doc_number` VARCHAR(64) NOT NULL,
    `birth_date` DATE DEFAULT NULL,
    `province` VARCHAR(64) DEFAULT 'Luanda',
    `doc_front` VARCHAR(255) NOT NULL,
    `doc_back` VARCHAR(255) DEFAULT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `admin_notes` TEXT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `reviewed_at` DATETIME DEFAULT NULL,
    `reviewed_by` INT UNSIGNED DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_user_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

// Tabela de Solicitações de Saque (Withdrawals)
@$db->query("CREATE TABLE IF NOT EXISTS `arena_withdrawals` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `gamer_tag` VARCHAR(64) NOT NULL,
    `holder_name` VARCHAR(128) NOT NULL,
    `bank_name` VARCHAR(64) NOT NULL,
    `iban` VARCHAR(64) NOT NULL,
    `amount` DECIMAL(12,2) NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `admin_notes` TEXT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `reviewed_at` DATETIME DEFAULT NULL,
    `reviewed_by` INT UNSIGNED DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_user_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

// Tabela de Notificações do Utilizador
@$db->query("CREATE TABLE IF NOT EXISTS `arena_notifications` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `type` VARCHAR(32) NOT NULL DEFAULT 'general',
    `title` VARCHAR(128) NOT NULL,
    `message` TEXT NOT NULL,
    `link` VARCHAR(255) DEFAULT '',
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_user_read` (`user_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

function arena_add_notification($uid, $title, $message, $type = 'general', $link = '') {
    global $db;
    $uid = (int)$uid;
    if ($uid <= 0) return false;
    $t_esc = $db->real_escape_string($title);
    $m_esc = $db->real_escape_string($message);
    $type_esc = $db->real_escape_string($type);
    $l_esc = $db->real_escape_string($link);
    return $db->query("INSERT INTO arena_notifications (user_id, type, title, message, link, is_read, created_at) VALUES ({$uid}, '{$type_esc}', '{$t_esc}', '{$m_esc}', '{$l_esc}', 0, NOW())");
}

function arena_get_user_kyc($uid) {
    global $db;
    $uid = (int)$uid;
    if ($uid <= 0) return null;
    $q = $db->query("SELECT * FROM arena_verifications WHERE user_id = {$uid} ORDER BY id DESC LIMIT 1");
    return ($q && $q->num_rows > 0) ? $q->fetch_assoc() : null;
}

function arena_is_user_verified($uid) {
    global $db, $logged_user;
    $uid = (int)$uid;
    if ($uid <= 0) return false;
    
    // Admins são sempre verificados
    if (arena_is_admin()) return true;

    // Verificar se flag user_verified está ativa no perfil
    $q_u = $db->query("SELECT user_verified FROM users WHERE user_id = {$uid} LIMIT 1");
    if ($q_u && $q_u->num_rows > 0) {
        $u = $q_u->fetch_assoc();
        if ((int)$u['user_verified'] === 1) return true;
    }

    // Verificar se tem registro aprovado em arena_verifications
    $q_k = $db->query("SELECT id FROM arena_verifications WHERE user_id = {$uid} AND status = 'approved' LIMIT 1");
    return ($q_k && $q_k->num_rows > 0);
}

// 4. Funções de Sessão e Autenticação Próprias da Arena
function arena_login_user($uid) {
    $uid = (int)$uid;
    $_SESSION['arena_uid'] = $uid;
    $_SESSION['ngola_uid'] = $uid;
    @setcookie('arena_uid', (string)$uid, time() + 86400 * 30, '/');
    @setcookie('c_user', (string)$uid, time() + 86400 * 30, '/');
}

function arena_logout_user() {
    unset($_SESSION['arena_uid'], $_SESSION['ngola_uid']);
    @session_destroy();
    @setcookie('arena_uid', '', time() - 3600, '/');
    @setcookie('c_user', '', time() - 3600, '/');
}

class StandaloneArenaUser {
    public $_logged_in = false;
    public $_data = [];

    public function __construct($db) {
        $uid = 0;
        if (!empty($_SESSION['arena_uid'])) {
            $uid = (int)$_SESSION['arena_uid'];
        } elseif (!empty($_SESSION['ngola_uid'])) {
            $uid = (int)$_SESSION['ngola_uid'];
        } elseif (!empty($_COOKIE['arena_uid'])) {
            $uid = (int)$_COOKIE['arena_uid'];
        } elseif (!empty($_COOKIE['c_user'])) {
            $uid = (int)$_COOKIE['c_user'];
        }
        if ($uid > 0) {
            $res = @$db->query("SELECT * FROM users WHERE user_id = {$uid} LIMIT 1");
            if ($res && $res->num_rows > 0) {
                $this->_logged_in = true;
                $this->_data = $res->fetch_assoc();
            }
        }
    }
}

$user = new StandaloneArenaUser($db);

function arena_db() {
    global $db;
    return $db;
}

function arena_escape($val) {
    global $db;
    return $db->real_escape_string(trim($val));
}

function arena_is_admin() {
    global $user;
    if (!isset($user) || !is_object($user) || !$user->_logged_in) return false;
    return (int)($user->_data['user_group'] ?? 3) === 1;
}

function arena_money($amount) {
    return number_format((float)$amount, 2, ',', '.') . ' AKZ';
}

// 5. Carregar Perfil Gamer do Utilizador Autenticado
$logged_user = null;
$gamer_profile = null;

if ($user->_logged_in) {
    $logged_user = $user->_data;
    $uid = (int)$logged_user['user_id'];

    $q_wallet = $db->query("SELECT user_wallet_balance FROM users WHERE user_id = {$uid} LIMIT 1");
    if ($q_wallet && $q_wallet->num_rows > 0) {
        $logged_user['user_wallet_balance'] = (float)$q_wallet->fetch_assoc()['user_wallet_balance'];
    } else {
        $logged_user['user_wallet_balance'] = (float)($logged_user['user_wallet_balance'] ?? 0);
    }

    $logged_user['fullname'] = trim(($logged_user['user_firstname'] ?? '') . ' ' . ($logged_user['user_lastname'] ?? ''));
    if (empty($logged_user['fullname'])) {
        $logged_user['fullname'] = $logged_user['user_name'];
    }
    $logged_user['province'] = !empty($logged_user['user_current_city']) ? $logged_user['user_current_city'] : 'Luanda';
    $pic = $logged_user['user_picture'] ?? '';
    if (!empty($pic)) {
        if (filter_var($pic, FILTER_VALIDATE_URL)) {
            $logged_user['avatar'] = $pic;
        } else {
            $logged_user['avatar'] = GAMER_URL . '/' . ltrim($pic, '/');
        }
    } else {
        $logged_user['avatar'] = 'https://ui-avatars.com/api/?name=' . urlencode($logged_user['fullname']) . '&background=ef4444&color=fff&bold=true';
    }

    $check_profile = $db->query("SELECT * FROM arena_profiles WHERE user_id = {$uid} LIMIT 1");
    if ($check_profile && $check_profile->num_rows > 0) {
        $gamer_profile = $check_profile->fetch_assoc();
    } else {
        $base_tag = preg_replace('/[^a-zA-Z0-9_]/', '', $logged_user['user_name']);
        if (strlen($base_tag) < 3) $base_tag = 'Gamer_' . $uid;
        $gamer_tag = $base_tag;

        $tag_check = $db->query("SELECT id FROM arena_profiles WHERE gamer_tag = '{$db->real_escape_string($gamer_tag)}' LIMIT 1");
        if ($tag_check && $tag_check->num_rows > 0) {
            $gamer_tag = $base_tag . '_' . rand(100, 999);
        }

        $prov_esc = $db->real_escape_string($logged_user['province']);
        $db->query("INSERT INTO arena_profiles 
            (user_id, gamer_tag, gamer_title, selected_frame, competitive_points, province, status) 
            VALUES 
            ({$uid}, '{$db->real_escape_string($gamer_tag)}', 'Guerreiro da Arena', 'bronze', 1000, '{$prov_esc}', 'online')");

        $check_profile = $db->query("SELECT * FROM arena_profiles WHERE user_id = {$uid} LIMIT 1");
        $gamer_profile = $check_profile ? $check_profile->fetch_assoc() : null;
    }

    if ($gamer_profile) {
        $gamer_profile['wallet_balance'] = $logged_user['user_wallet_balance'];
        $db->query("UPDATE arena_profiles SET status = 'online', last_active = NOW() WHERE user_id = {$uid}");
    }
}

// 6. Configurações Administrativas
$arena_settings = [];
$settings_query = $db->query("SELECT setting_key, setting_value FROM arena_admin_settings");
if ($settings_query) {
    while ($row = $settings_query->fetch_assoc()) {
        $arena_settings[$row['setting_key']] = $row['setting_value'];
    }
}

// 7. Catálogo dos 3 Jogos Oficiais da Arena
$ARENA_GAMES = [
    'hyperstrike' => [
        'id'          => 'hyperstrike',
        'name'        => 'HYPER-STRIKE (Luta 2D Tática)',
        'subtitle'    => 'Combate marcial veloz com combos devastadores, esquivas e especiais em tempo real.',
        'folder'      => 'hyperstrike',
        'file'        => 'index.html',
        'icon'        => 'fa-bolt-lightning',
        'badge'       => 'Luta & Ação',
        'tag_color'   => '#3b82f6',
        'cover'       => GAMER_URL . '/images/covers/hyperstrike.jpg',
        'xp_reward'   => 95,
        'rules'       => 'Mire com precisão nos alvos e no adversário utilizando seu arsenal rápido e contra-ataques táticos.',
        'objective'   => 'Vencer 2 de 3 rondas alcançando 600 pontos antes do oponente.'
    ],
    'neon-fist' => [
        'id'          => 'neon-fist',
        'name'        => 'Neon Fist (Cyberpunk Beat\'em Up)',
        'subtitle'    => 'Combate mano a mano em arena cyberpunk neon com socos, chutes rápidos e golpes especiais.',
        'folder'      => 'neon-fist',
        'file'        => 'index.html',
        'icon'        => 'fa-burst',
        'badge'       => 'Cyberpunk Luta',
        'tag_color'   => '#06b6d4',
        'cover'       => GAMER_URL . '/images/covers/neon-fist.jpg',
        'xp_reward'   => 90,
        'rules'       => 'Use W, A, S, D ou setas para movimentação e teclas de ataque para acertar combos e esquivar de golpes.',
        'objective'   => 'Vencer 2 de 3 rondas zerando a barra de vida do lutador adversário.'
    ],
    'mkjs' => [
        'id'          => 'mkjs',
        'name'        => 'MK.js (Mortal Kombat Arcade)',
        'subtitle'    => 'Combate clássico lendário arcade com Sub-Zero, Kano, golpes especiais e fatalities épicos.',
        'folder'      => 'mkjs',
        'file'        => 'index.html',
        'icon'        => 'fa-skull',
        'badge'       => 'Kombat Arcade',
        'tag_color'   => '#ef4444',
        'cover'       => GAMER_URL . '/images/covers/mkjs.jpg',
        'xp_reward'   => 100,
        'rules'       => 'Duelo em Melhor de 3 Rondas. Desfira socos altos, rasteiras, ganchos e poderes mágicos no oponente.',
        'objective'   => 'Vencer 2 de 3 rondas eliminando a energia do oponente com K.O.'
    ],
    'card-duel' => [
        'id'          => 'card-duel',
        'name'        => 'Duelo de Cartas 1v1',
        'subtitle'    => 'Batalha tática de cartas e poderes em tempo real com baralho exclusivo de combate.',
        'folder'      => 'card-duel',
        'file'        => 'index.html',
        'icon'        => 'fa-layer-group',
        'badge'       => 'Cartas & Estratégia',
        'tag_color'   => '#a855f7',
        'cover'       => GAMER_URL . '/images/covers/card_duel.jpg',
        'xp_reward'   => 110,
        'rules'       => 'Selecione e lance sua melhor carta por turno. O jogador com maior ataque vence a rodada!',
        'objective'   => 'Vencer 2 de 3 rondas superando a mão do adversário.'
    ],
    'rps-battle' => [
        'id'          => 'rps-battle',
        'name'        => 'Pedra, Papel e Tesoura 1v1',
        'subtitle'    => 'Jokenpô frenético 1v1 ao vivo com contagem de 10 segundos e apostas instantâneas.',
        'folder'      => 'rps-battle',
        'file'        => 'index.html',
        'icon'        => 'fa-hand-back-fist',
        'badge'       => 'Duelo Relâmpago',
        'tag_color'   => '#22c98b',
        'cover'       => GAMER_URL . '/images/covers/rps_battle.jpg',
        'xp_reward'   => 75,
        'rules'       => 'Pedra vence Tesoura, Tesoura corta Papel, Papel embrulha Pedra. Escolha rápida!',
        'objective'   => 'Conquistar 2 vitórias antes do oponente para faturar o prémio da aposta.'
    ]
];

foreach ($ARENA_GAMES as $game_k => &$game_data) {
    if (!empty($arena_settings['cover_' . $game_k])) {
        $game_data['cover'] = $arena_settings['cover_' . $game_k];
    }
}
unset($game_data);
