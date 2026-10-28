<?php
/**
 * NgolaBiz Gamer Arena - OpenRouter AI Engine
 * Motor de Inteligência Artificial Cognitiva para Bots de Combate
 * Conecta com a API da OpenRouter (Llama 3, Nemotron, Liquid, Gemma, etc.)
 */

class ArenaAIEngine {
    private static $openRouterEndpoint = 'https://openrouter.ai/api/v1/chat/completions';

    /**
     * Obter todas as configurações de IA do banco de dados
     */
    public static function getSettings($db = null) {
        if (!$db) {
            global $db;
        }
        $defaults = [
            'openrouter_api_key' => getenv('OPENROUTER_API_KEY') ?: '',
            'ai_model' => 'liquid/lfm-2.5-2.6b:free',
            'ai_fallback_model' => 'dots-studio/dots-3-note-preview:free',
            'ai_enabled' => 1,
            'ai_temperature' => 0.7,
            'ai_max_tokens' => 60
        ];

        if ($db) {
            $res = $db->query("SELECT setting_key, setting_value FROM arena_admin_settings WHERE setting_key LIKE 'ai_%' OR setting_key = 'openrouter_api_key'");
            if ($res) {
                while ($r = $res->fetch_assoc()) {
                    $defaults[$r['setting_key']] = $r['setting_value'];
                }
            }
        }
        return $defaults;
    }

    /**
     * Testar a conexão com o OpenRouter em tempo real
     */
    public static function testConnection($db = null) {
        $settings = self::getSettings($db);
        $apiKey = $settings['openrouter_api_key'];
        $model = $settings['ai_model'];

        $modelsToTry = array_unique([
            $model,
            $settings['ai_fallback_model'] ?? 'dots-studio/dots-3-note-preview:free',
            'dots-studio/dots-3-note-preview:free',
            'liquid/lfm-2.5-2.6b:free',
            'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'
        ]);

        $lastError = 'Desconhecido';
        foreach ($modelsToTry as $idx => $mTry) {
            $startTime = microtime(true);
            $result = self::callChatCompletion($apiKey, $mTry, [
                ['role' => 'system', 'content' => 'Você é a IA de combate da NgolaBiz Arena.'],
                ['role' => 'user', 'content' => 'Teste de conexão: responda com exatamente 1 palavra: OPERACIONAL']
            ], 80, 0.2, 5);
            $latency = round((microtime(true) - $startTime) * 1000, 2);

            if (!empty($result['success']) && !empty($result['content'])) {
                $status = ($idx === 0) ? 'online' : 'online_fallback';
                return [
                    'status' => $status,
                    'latency_ms' => $latency,
                    'model' => $mTry,
                    'response' => trim($result['content']),
                    'message' => "Conexão com a OpenRouter ativa via {$mTry} ({$latency}ms)"
                ];
            } else {
                $lastError = $result['error'] ?? 'Erro desconhecido';
            }
        }

        return [
            'status' => 'error',
            'latency_ms' => 0,
            'model' => $model,
            'error' => $lastError,
            'message' => "Erro na comunicação com a IA: " . $lastError
        ];
    }

    /**
     * Gerar Pensamento e Decisão Tática do Bot para a partida
     */
    public static function generateBotStrategy($bot, $opponentName = 'Adversário', $gameType = 'mkjs', $betAmount = 0, $db = null) {
        if (!$db) {
            global $db;
        }

        $botTag = $bot['bot_tag'] ?? ($bot['fullname'] ?? 'BOT_MESTRE');
        $style = $bot['play_style'] ?? 'balanced';
        $difficulty = $bot['difficulty'] ?? 'medium';
        $winrate = (int)($bot['target_winrate'] ?? 75);

        $settings = self::getSettings($db);

        // Se a IA estiver desativada, usar gerador tático local
        if (empty($settings['ai_enabled']) || $settings['ai_enabled'] === '0') {
            return self::getLocalTacticalFallback($botTag, $style, $opponentName, $gameType);
        }

        $prompt = "Você é o bot {$botTag} da NgolaBiz Arena.
Estilo: {$style}, Dificuldade: {$difficulty}, Winrate Alvo: {$winrate}%.
Você está na arena contra o jogador {$opponentName} no jogo {$gameType} (Aposta: {$betAmount} Kz).
Em 1 frase curta e firme (máximo 15 palavras), diga seu plano mental tático para vencer esse combate.";

        $messages = [
            ['role' => 'system', 'content' => 'Você é uma IA de jogo competitiva. Responda em português com pensamento estratégico conciso.'],
            ['role' => 'user', 'content' => $prompt]
        ];

        $res = self::callChatCompletion($settings['openrouter_api_key'], $settings['ai_model'], $messages, 50, 0.7, 3);

        $thought = '';
        if ($res['success'] && !empty($res['content'])) {
            $raw = trim($res['content']);
            if (stripos($raw, "thinking process") !== false) {
                if (preg_match('/["“]([^"”]{10,140})["”]/u', $raw, $m)) {
                    $raw = $m[1];
                } elseif (preg_match('/(?:resposta|frase|pensamento|conclusão|estratégia|plano):\s*(.+)$/i', $raw, $m)) {
                    $raw = $m[1];
                } else {
                    $lines = array_filter(explode("\n", $raw));
                    $last = trim(end($lines));
                    if (strlen($last) > 10 && stripos($last, "process") === false) {
                        $raw = $last;
                    }
                }
            }
            $thought = trim(str_replace(['"', "\n", "\r", "*"], ' ', $raw));
            if (empty($thought) || strlen($thought) < 8 || stripos($thought, "thinking process") !== false) {
                $thought = self::getLocalTacticalFallback($botTag, $style, $opponentName, $gameType)['thought'];
            }
        } else {
            // Tenta fallback
            $resFb = self::callChatCompletion($settings['openrouter_api_key'], $settings['ai_fallback_model'], $messages, 50, 0.7, 3);
            if ($resFb['success'] && !empty($resFb['content'])) {
                $raw = trim($resFb['content']);
                $thought = trim(str_replace(['"', "\n", "\r", "*"], ' ', $raw));
            } else {
                $thought = self::getLocalTacticalFallback($botTag, $style, $opponentName, $gameType)['thought'];
            }
        }

        // Salvar em log administrativo para auditoria
        if ($db) {
            $action = "IA_THOUGHT";
            $details = json_encode([
                'bot_tag' => $botTag,
                'opponent' => $opponentName,
                'game' => $gameType,
                'thought' => $thought,
                'style' => $style,
                'model' => $settings['ai_model']
            ], JSON_UNESCAPED_UNICODE);

            $stmt = $db->prepare("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address, created_at) VALUES (1, 'Arena AI Engine', ?, ?, '127.0.0.1', NOW())");
            $stmt->bind_param('ss', $action, $details);
            $stmt->execute();
        }

        return [
            'bot_tag' => $botTag,
            'thought' => $thought,
            'play_style' => $style,
            'difficulty' => $difficulty,
            'game' => $gameType,
            'ai_active' => true,
            'model' => $settings['ai_model'],
            'timestamp' => date('Y-m-d H:i:s')
        ];
    }

    /**
     * Chamada HTTP cURL ao endpoint de Chat da OpenRouter
     */
    private static function callChatCompletion($apiKey, $model, $messages, $maxTokens = 60, $temperature = 0.7, $timeoutSeconds = 4) {
        if (empty($apiKey)) {
            return ['success' => false, 'error' => 'API Key não configurada'];
        }

        $payload = json_encode([
            'model' => $model,
            'messages' => $messages,
            'max_tokens' => $maxTokens,
            'temperature' => $temperature
        ]);

        $ch = curl_init(self::$openRouterEndpoint);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeoutSeconds);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
            'HTTP-Referer: https://gamer.ngolabiz.it.ao',
            'X-Title: NgolaBiz Arena AI Combat'
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['success' => false, 'error' => 'cURL Error: ' . $curlError];
        }

        if ($httpCode !== 200) {
            return ['success' => false, 'error' => "HTTP {$httpCode}: " . substr($response, 0, 150)];
        }

        $json = json_decode($response, true);
        if (!$json || !isset($json['choices'][0]['message'])) {
            return ['success' => false, 'error' => 'Resposta inválida do OpenRouter'];
        }

        $choice = $json['choices'][0]['message'];
        $text = !empty($choice['content']) ? $choice['content'] : (!empty($choice['reasoning']) ? $choice['reasoning'] : '');

        return [
            'success' => true,
            'content' => $text,
            'model' => $json['model'] ?? $model
        ];
    }

    /**
     * Fallback tático local de alta velocidade caso a API fique sem rede
     */
    private static function getLocalTacticalFallback($botTag, $style, $opponentName, $gameType) {
        $tactics = [
            'aggressive' => [
                "Vou pressionar {$opponentName} desde o primeiro segundo com combos contínuos e voadoras.",
                "Estratégia rushdown: fechar a distância imediatamente e não dar espaço para respiro.",
                "Ataque total em curto alcance para quebrar a guarda do adversário."
            ],
            'defensive' => [
                "Vou manter a guarda alta, esquivar dos ataques e punir os erros com contra-ataques pesados.",
                "Controle de distância: aguardar o avanço de {$opponentName} e desferir o golpe certeiro.",
                "Estratégia paciente: absorver a investida e devolver com gancho preciso."
            ],
            'chaotic' => [
                "Alternar entre saltos e rasteiras imprevisíveis para desestabilizar {$opponentName}.",
                "Movimentação tática errática para confundir os reflexos do adversário.",
                "Golpes inesperados no ar e fintas constantes para dominar a arena."
            ],
            'balanced' => [
                "Leitura de padrão de {$opponentName} nos primeiros segundos para explorar suas brechas.",
                "Equilíbrio tático: defender ataques arriscados e atacar com combos rápidos.",
                "Foco no timing perfeito para garantir os pontos de vitória neste combate."
            ]
        ];

        $list = $tactics[$style] ?? $tactics['balanced'];
        $chosen = $list[array_rand($list)];

        return [
            'bot_tag' => $botTag,
            'thought' => $chosen,
            'play_style' => $style,
            'difficulty' => 'hard',
            'game' => $gameType,
            'ai_active' => true,
            'model' => 'local_tactical_engine',
            'timestamp' => date('Y-m-d H:i:s')
        ];
    }

    /**
     * Obter pensamentos recentes gravados para exibição
     */
    public static function getRecentThoughts($limit = 15, $db = null) {
        if (!$db) {
            global $db;
        }
        $logs = [];
        if (!$db) return $logs;

        $res = $db->query("SELECT * FROM arena_admin_logs WHERE action = 'IA_THOUGHT' ORDER BY id DESC LIMIT " . (int)$limit);
        if ($res) {
            while ($row = $res->fetch_assoc()) {
                $parsed = json_decode($row['details'], true);
                if ($parsed) {
                    $row['bot_tag'] = $parsed['bot_tag'] ?? 'Bot';
                    $row['thought'] = $parsed['thought'] ?? '';
                    $row['game'] = $parsed['game'] ?? '';
                    $row['opponent'] = $parsed['opponent'] ?? '';
                    $row['model'] = $parsed['model'] ?? '';
                }
                $logs[] = $row;
            }
        }
        return $logs;
    }
}
