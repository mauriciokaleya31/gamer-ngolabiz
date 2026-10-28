<?php
/**
 * Endpoint do portal: devolve um token de entrada no Mundo 3D para o utilizador autenticado.
 * Sem sessão → token nulo (o cliente entra como visitante, só com saldo demo).
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once(__DIR__ . '/../../init.php');
require_once(__DIR__ . '/world3d_bridge.php');

$cfg = world3d_config();
$token = world3d_issue_player_token($logged_user, $gamer_profile);
echo json_encode([
    'token'       => $token,
    'wsUrl'       => $cfg['public_ws_url'],
    'displayName' => $logged_user ? ($gamer_profile['gamer_tag'] ?? $logged_user['user_name']) : null,
    'guest'       => $token === null,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
