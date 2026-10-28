<?php
/**
 * Copiar para config.local.php (não versionado) e preencher.
 * Em alternativa, definir as variáveis de ambiente equivalentes no servidor.
 */
return [
    // Segredo HMAC partilhado com o servidor de mundo (WORLD3D_JOIN_SECRET). Gerar com: openssl rand -hex 32
    'join_secret'   => '',
    // URL WebSocket público do servidor de mundo (wss:// em produção)
    'public_ws_url' => 'wss://mundo.ngolabiz.it.ao/ws',
    // URL HTTP interno da API do servidor de mundo (para o painel admin, servidor→servidor)
    'api_url'       => 'http://127.0.0.1:8787',
    // Validade do token de entrada em segundos
    'token_ttl'     => 900,
];
