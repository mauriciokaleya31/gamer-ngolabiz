<?php
/**
 * NgolaBiz World 3D — ponte entre o portal NgolaBiz Gamer (PHP) e o servidor de mundo (Node.js).
 *
 * - Emite tokens de entrada assinados (HMAC-SHA256) para o jogador autenticado no portal.
 *   Formato idêntico ao verificado em world3d/server/src/auth.js.
 * - Faz pedidos administrativos ao servidor de mundo a partir do servidor PHP
 *   (o segredo nunca chega ao navegador).
 *
 * Configuração (por ordem de prioridade):
 *   1. Variáveis de ambiente: WORLD3D_JOIN_SECRET, WORLD3D_PUBLIC_WS_URL, WORLD3D_API_URL
 *   2. Ficheiro world3d/platform/config.local.php (NÃO versionado; ver config.example.php)
 */

if (!function_exists('world3d_config')) {

function world3d_config() {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $local = [];
    $file = __DIR__ . '/config.local.php';
    if (is_file($file)) {
        $loaded = include $file;
        if (is_array($loaded)) $local = $loaded;
    }
    $cfg = [
        'join_secret'   => getenv('WORLD3D_JOIN_SECRET') ?: ($local['join_secret'] ?? ''),
        'public_ws_url' => getenv('WORLD3D_PUBLIC_WS_URL') ?: ($local['public_ws_url'] ?? 'ws://127.0.0.1:8787/ws'),
        'api_url'       => rtrim(getenv('WORLD3D_API_URL') ?: ($local['api_url'] ?? 'http://127.0.0.1:8787'), '/'),
        'token_ttl'     => (int)($local['token_ttl'] ?? 900),
    ];
    return $cfg;
}

function world3d_b64url($bin) {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

/** Assina um payload (compatível com verifyToken do servidor Node). */
function world3d_sign_token(array $payload, $secret) {
    if ($secret === '' || $secret === null) return null;
    $body = world3d_b64url(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $sig = world3d_b64url(hash_hmac('sha256', $body, $secret, true));
    return $body . '.' . $sig;
}

/** Token de jogador para o utilizador autenticado no portal. */
function world3d_issue_player_token($logged_user, $gamer_profile = null) {
    $cfg = world3d_config();
    if (!$logged_user || empty($cfg['join_secret'])) return null;
    $name = $gamer_profile['gamer_tag'] ?? ($logged_user['user_name'] ?? 'Jogador');
    return world3d_sign_token([
        'sub'  => 'u:' . (int)$logged_user['user_id'],
        'name' => mb_substr((string)$name, 0, 24),
        'role' => 'player',
        'exp'  => time() + $cfg['token_ttl'],
    ], $cfg['join_secret']);
}

/** Token de administrador de curta duração (apenas para chamadas servidor→servidor). */
function world3d_admin_token($admin_user) {
    $cfg = world3d_config();
    if (empty($cfg['join_secret'])) return null;
    return world3d_sign_token([
        'sub'  => 'admin:' . (int)$admin_user['user_id'],
        'name' => mb_substr((string)($admin_user['user_name'] ?? 'admin'), 0, 24),
        'role' => 'admin',
        'exp'  => time() + 120,
    ], $cfg['join_secret']);
}

/**
 * Pedido HTTP ao servidor de mundo. Devolve ['ok'=>bool, 'status'=>int, 'data'=>array|null, 'error'=>string|null].
 */
function world3d_api($method, $path, $body = null, $token = null, $timeout = 5) {
    $cfg = world3d_config();
    $url = $cfg['api_url'] . $path;
    if (!function_exists('curl_init')) return ['ok' => false, 'status' => 0, 'data' => null, 'error' => 'cURL indisponível'];
    $ch = curl_init($url);
    $headers = ['Accept: application/json'];
    if ($token) $headers[] = 'Authorization: Bearer ' . $token;
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    $raw = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) return ['ok' => false, 'status' => 0, 'data' => null, 'error' => $err ?: 'sem resposta'];
    $data = json_decode($raw, true);
    return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'data' => $data, 'error' => $status >= 300 ? ($data['error'] ?? ('HTTP ' . $status)) : null];
}

} // function_exists
