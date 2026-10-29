<?php
/**
 * NGOLABIZ GAMER — ADMINISTRAÇÃO DO MUNDO 3D
 * População de NPCs (quantidade, profissões, estado, autonomia, níveis de simulação),
 * diálogo IA (activação, modelo, limites de custo/abuso), trânsito, clima, relógio,
 * competições e bots de treino (incl. importação dos bots existentes da Arena),
 * catálogo de recursos e emotes, métricas e auditoria.
 *
 * Acesso: apenas administradores (user_group = 1). Todas as chamadas ao servidor de
 * mundo são feitas pelo PHP com um token de administrador de 2 minutos.
 */
require_once(__DIR__ . '/../../init.php');
require_once(__DIR__ . '/world3d_bridge.php');

if (!arena_is_admin()) {
    http_response_code(403);
    die('Acesso restrito a administradores.');
}

if (empty($_SESSION['w3d_csrf'])) $_SESSION['w3d_csrf'] = bin2hex(random_bytes(16));
$csrf = $_SESSION['w3d_csrf'];
$token = world3d_admin_token($logged_user);
$tab = $_GET['tab'] ?? 'estado';
$msg = '';
$err = '';
$admin_name = $logged_user['user_name'] ?? 'admin';

function w3d_bool($v) { return $v === '1' || $v === 'on' || $v === true; }
function w3d_log_admin($action, $details) {
    global $db, $logged_user;
    $stmt = $db->prepare("INSERT INTO arena_admin_logs (admin_id, admin_name, action, details, ip_address) VALUES (?, ?, ?, ?, ?)");
    if (!$stmt) return;
    $id = (int)$logged_user['user_id'];
    $name = $logged_user['user_name'] ?? 'admin';
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $stmt->bind_param('issss', $id, $name, $action, $details, $ip);
    $stmt->execute();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($csrf, $_POST['csrf'] ?? '')) {
        $err = 'Sessão expirada. Recarrega a página.';
    } elseif (!$token) {
        $err = 'WORLD3D_JOIN_SECRET não configurado no portal.';
    } else {
        $action = $_POST['action'] ?? '';
        $res = null;
        if ($action === 'population') {
            $weights = [];
            foreach (($_POST['weight'] ?? []) as $k => $v) $weights[preg_replace('/[^a-z_]/', '', $k)] = max(0, (int)$v);
            $status = [];
            foreach (($_POST['astatus'] ?? []) as $k => $v) if (in_array($v, ['active', 'inactive', 'maintenance'], true)) $status[preg_replace('/[^a-z_]/', '', $k)] = $v;
            $res = world3d_api('PUT', '/admin/config', [
                'population' => ['count' => (int)$_POST['count'], 'weights' => $weights, 'archetypeStatus' => $status],
                'simulation' => [
                    'autonomy' => $_POST['autonomy'] ?? 'full',
                    'maxActivePerZone' => (int)$_POST['maxActive'],
                    'nearRadius' => (float)$_POST['nearRadius'],
                    'midRadius' => (float)$_POST['midRadius'],
                    'midEvery' => max(1, (int)$_POST['midEvery']),
                    'farEvery' => max(1, (int)$_POST['farEvery']),
                    'interestRadius' => (float)$_POST['interestRadius'],
                    'ambientChatter' => w3d_bool($_POST['ambientChatter'] ?? '0'),
                ],
            ], $token);
        } elseif ($action === 'npc_status') {
            $res = world3d_api('PATCH', '/admin/npcs/' . rawurlencode($_POST['npc_id']), ['status' => $_POST['status']], $token);
        } elseif ($action === 'dialogue') {
            $modes = [];
            foreach (($_POST['dmode'] ?? []) as $k => $v) if (in_array($v, ['livre', 'guiado'], true)) $modes[preg_replace('/[^a-z_]/', '', $k)] = $v;
            $res = world3d_api('PUT', '/admin/config', ['dialogue' => [
                'aiEnabled' => w3d_bool($_POST['aiEnabled'] ?? '0'),
                'model' => substr(trim($_POST['model'] ?? ''), 0, 120),
                'fallbackModel' => substr(trim($_POST['fallbackModel'] ?? ''), 0, 120) ?: null,
                'maxTokens' => max(16, min(400, (int)$_POST['maxTokens'])),
                'timeoutMs' => max(1000, min(15000, (int)$_POST['timeoutMs'])),
                'perPlayerPerMinute' => max(1, (int)$_POST['perPlayerPerMinute']),
                'perPlayerPerDay' => max(1, (int)$_POST['perPlayerPerDay']),
                'globalCallsPerDay' => max(0, (int)$_POST['globalCallsPerDay']),
                'globalTokensPerDay' => max(0, (int)$_POST['globalTokensPerDay']),
                'maxDailyCostUsd' => max(0, (float)$_POST['maxDailyCostUsd']),
                'estCostPer1kTokensUsd' => max(0, (float)$_POST['estCostPer1kTokensUsd']),
                'dialogueModeByArchetype' => $modes,
            ]], $token);
        } elseif ($action === 'environment') {
            $patch = [
                'traffic' => ['enabled' => w3d_bool($_POST['trafficEnabled'] ?? '0'), 'maxCars' => max(0, min(60, (int)$_POST['maxCars'])), 'densityScale' => max(0, min(3, (float)$_POST['densityScale']))],
                'weather' => ['enabled' => w3d_bool($_POST['weatherEnabled'] ?? '0'), 'intensity' => max(0, min(1.5, (float)$_POST['intensity'])), 'minDurationMin' => max(5, (int)$_POST['minDurationMin']), 'maxDurationMin' => max(5, (int)$_POST['maxDurationMin']), 'transitionMin' => max(1, (int)$_POST['transitionMin'])],
                'clock' => ['mode' => ($_POST['clockMode'] ?? 'realtime') === 'accelerated' ? 'accelerated' : 'realtime', 'dayLengthMinutes' => max(2, (int)$_POST['dayLengthMinutes'])],
                'zone' => ['status' => $_POST['zoneStatus'] ?? 'active', 'maintenanceMessage' => substr($_POST['maintenanceMessage'] ?? '', 0, 200)],
            ];
            $res = world3d_api('PUT', '/admin/config', $patch, $token);
            if ($res['ok'] && !empty($_POST['weatherPreset'])) world3d_api('POST', '/admin/weather', ['preset' => $_POST['weatherPreset'], 'holdMinutes' => 30], $token);
        } elseif ($action === 'competitions') {
            $res = world3d_api('PUT', '/admin/config', ['competitions' => [
                'raceEnabled' => w3d_bool($_POST['raceEnabled'] ?? '0'),
                'combatEnabled' => w3d_bool($_POST['combatEnabled'] ?? '0'),
                'shootingEnabled' => w3d_bool($_POST['shootingEnabled'] ?? '0'),
                'survivalEnabled' => w3d_bool($_POST['survivalEnabled'] ?? '0'),
                'stakesEnabled' => w3d_bool($_POST['stakesEnabled'] ?? '0'),
                'feePct' => max(0, min(30, (float)$_POST['feePct'])),
            ]], $token);
        } elseif ($action === 'import_bots') {
            // Reutiliza os bots existentes da Arena como BOTS DE TREINO identificados (só corridas gratuitas).
            $bots = [];
            $diffMap = ['easy' => 'facil', 'medium' => 'medio', 'hard' => 'dificil', 'expert' => 'dificil'];
            $q = $db->query("SELECT id, bot_tag, fullname, difficulty FROM arena_bots WHERE is_active = 1 ORDER BY id ASC LIMIT 20");
            if ($q) while ($b = $q->fetch_assoc()) $bots[] = ['id' => 'arena_' . (int)$b['id'], 'name' => mb_substr($b['bot_tag'] ?: $b['fullname'], 0, 20), 'difficulty' => $diffMap[$b['difficulty']] ?? 'medio', 'vehicle' => ((int)$b['id'] % 3 === 0) ? 'moto' : 'car', 'source' => 'arena_bots'];
            $res = world3d_api('PUT', '/admin/training-bots', ['bots' => $bots], $token);
        } elseif ($action === 'catalog') {
            $cat = [];
            foreach (($_POST['item'] ?? []) as $id => $o) {
                $cat[$id] = ['active' => w3d_bool($o['active'] ?? '0'), 'published' => w3d_bool($o['published'] ?? '0'), 'status' => $o['status'] ?? 'provisorio', 'price' => (int)($o['price'] ?? 0)];
                if (!empty($o['thumbnail'])) $cat[$id]['thumbnail'] = $o['thumbnail'];
            }
            $emo = [];
            foreach (($_POST['emote'] ?? []) as $id => $o) $emo[$id] = ['active' => w3d_bool($o['active'] ?? '0'), 'cooldownMs' => (int)($o['cooldownMs'] ?? 1200)];
            $res = world3d_api('PUT', '/admin/catalog', ['catalog' => $cat, 'emotes' => $emo], $token);
        }
        if ($res) {
            if ($res['ok']) { $msg = 'Configuração do Mundo 3D actualizada.'; w3d_log_admin('WORLD3D_' . strtoupper($action), substr(json_encode($_POST['action']), 0, 200)); }
            else $err = 'Erro do servidor de mundo: ' . ($res['error'] ?? 'desconhecido');
        }
    }
}

$cfgRes = $token ? world3d_api('GET', '/admin/config', null, $token) : ['ok' => false, 'error' => 'segredo não configurado'];
$metrics = $token ? world3d_api('GET', '/admin/metrics', null, $token) : ['ok' => false];
$cfg = $cfgRes['data']['config'] ?? null;
$archetypes = $cfgRes['data']['archetypes'] ?? [];
$weatherPresets = $cfgRes['data']['weatherPresets'] ?? [];

$page_title = 'Administração do Mundo 3D';
require_once(__DIR__ . '/../../header.php');
$h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
$inp = 'style="background:#10141C;border:1px solid #282F3D;color:#fff;border-radius:8px;padding:6px 8px;"';
$card = 'style="background:#161c26;border:1px solid #273142;border-radius:14px;padding:16px;margin-bottom:16px;"';
$tabs = ['estado' => 'Estado e métricas', 'npcs' => 'População de NPCs', 'lista' => 'Lista de NPCs', 'dialogo' => 'Diálogo IA', 'ambiente' => 'Trânsito, clima e relógio', 'competicoes' => 'Competições e bots', 'recursos' => 'Recursos e emotes', 'auditoria' => 'Auditoria'];
?>
<main class="arena-page-body">
    <h1 style="font-size:1.6rem;font-weight:800;color:#fff;font-family:var(--font-gamer);">ADMINISTRAÇÃO · MUNDO 3D</h1>
    <p style="color:var(--text-muted);font-size:.88rem;">Servidor: <?php echo $h(world3d_config()['api_url']); ?> · <?php echo $cfgRes['ok'] ? '<span class="badge text-bg-success">ligado</span>' : '<span class="badge text-bg-danger">sem ligação: ' . $h($cfgRes['error'] ?? '') . '</span>'; ?></p>
    <?php if ($msg): ?><div style="background:#0f2e22;border:1px solid #22C98B;color:#7ef0c3;padding:10px;border-radius:10px;margin:10px 0;"><?php echo $h($msg); ?></div><?php endif; ?>
    <?php if ($err): ?><div style="background:#2e0f12;border:1px solid #F0444A;color:#ff9da1;padding:10px;border-radius:10px;margin:10px 0;"><?php echo $h($err); ?></div><?php endif; ?>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:14px 0;">
        <?php foreach ($tabs as $k => $label): ?>
            <a href="?tab=<?php echo $k; ?>" style="padding:7px 12px;border-radius:8px;text-decoration:none;font-size:.85rem;font-weight:700;<?php echo $tab === $k ? 'background:#F0444A;color:#fff;' : 'background:#171C26;border:1px solid #282F3D;color:#9AA4B2;'; ?>"><?php echo $h($label); ?></a>
        <?php endforeach; ?>
    </div>

<?php if (!$cfg): ?>
    <div <?php echo $card; ?>><p style="color:#ff9da1;">Não foi possível obter a configuração. Verifica se o servidor de mundo está a correr e se WORLD3D_JOIN_SECRET coincide nos dois lados.</p></div>
<?php elseif ($tab === 'estado'): $m = $metrics['data'] ?? []; ?>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
        <?php foreach ([
            ['Jogadores ligados', $m['players'] ?? 0], ['NPCs (total)', $m['npc']['total'] ?? 0], ['NPCs perto/médio/longe', ($m['npc']['tiers']['near'] ?? 0) . ' / ' . ($m['npc']['tiers']['mid'] ?? 0) . ' / ' . ($m['npc']['tiers']['far'] ?? 0)],
            ['NPCs dormentes', $m['npc']['tiers']['dormant'] ?? 0], ['Tick médio / máx', ($m['tick']['avgMs'] ?? 0) . ' / ' . ($m['tick']['maxMs'] ?? 0) . ' ms'], ['CPU / memória', ($m['process']['cpuPct'] ?? 0) . '% / ' . ($m['process']['rssMb'] ?? 0) . ' MB'],
            ['Carros de trânsito', $m['traffic']['cars'] ?? 0], ['Chamadas IA hoje', $m['dialogue']['budget']['calls'] ?? 0], ['Erros IA / respostas locais', ($m['dialogue']['aiErrors'] ?? 0) . ' / ' . ($m['dialogue']['fallbacks'] ?? 0)],
            ['Hora em Luanda', isset($m['clock']['local']) ? sprintf('%02d:%02d', $m['clock']['local']['hour'], $m['clock']['local']['minute']) . ' (' . $m['clock']['clock']['mode'] . ')' : '—'], ['Clima', $m['weather']['preset'] ?? '—'], ['Falhas de caminho NPC', $m['npc']['pathFailures'] ?? 0],
        ] as [$label, $val]): ?>
            <div <?php echo $card; ?>><div style="color:var(--text-muted);font-size:.78rem;"><?php echo $h($label); ?></div><div style="color:#fff;font-size:1.3rem;font-weight:800;"><?php echo $h($val); ?></div></div>
        <?php endforeach; ?>
    </div>
<?php elseif ($tab === 'npcs'): $pop = $cfg['population']; $sim = $cfg['simulation']; ?>
    <form method="post" <?php echo $card; ?>>
        <input type="hidden" name="csrf" value="<?php echo $h($csrf); ?>"><input type="hidden" name="action" value="population">
        <h3 style="color:#fff;font-size:1.05rem;">População e níveis de simulação</h3>
        <p style="color:var(--text-muted);font-size:.82rem;">Aumentar/reduzir a quantidade não altera os NPCs existentes (geração determinística). Os NPCs longe dos jogadores são actualizados com menor frequência.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;color:#dfe5ee;font-size:.86rem;">
            <label>NPCs na zona<br><input type="number" name="count" min="0" max="400" value="<?php echo (int)$pop['count']; ?>" <?php echo $inp; ?>></label>
            <label>Máx. visíveis por zona<br><input type="number" name="maxActive" min="0" max="400" value="<?php echo (int)$sim['maxActivePerZone']; ?>" <?php echo $inp; ?>></label>
            <label>Autonomia<br><select name="autonomy" <?php echo $inp; ?>><?php foreach (['full' => 'Completa (rotinas, reacções, eventos)', 'routine_only' => 'Só rotinas', 'static' => 'Estática (manutenção)'] as $k => $l): ?><option value="<?php echo $k; ?>" <?php echo $sim['autonomy'] === $k ? 'selected' : ''; ?>><?php echo $l; ?></option><?php endforeach; ?></select></label>
            <label>Raio "perto" (m)<br><input type="number" name="nearRadius" value="<?php echo (float)$sim['nearRadius']; ?>" <?php echo $inp; ?>></label>
            <label>Raio "médio" (m)<br><input type="number" name="midRadius" value="<?php echo (float)$sim['midRadius']; ?>" <?php echo $inp; ?>></label>
            <label>Médio: 1 em cada N ticks<br><input type="number" name="midEvery" value="<?php echo (int)$sim['midEvery']; ?>" <?php echo $inp; ?>></label>
            <label>Longe: 1 em cada N ticks<br><input type="number" name="farEvery" value="<?php echo (int)$sim['farEvery']; ?>" <?php echo $inp; ?>></label>
            <label>Raio de replicação (m)<br><input type="number" name="interestRadius" value="<?php echo (float)$sim['interestRadius']; ?>" <?php echo $inp; ?>></label>
            <label><input type="checkbox" name="ambientChatter" value="1" <?php echo $sim['ambientChatter'] ? 'checked' : ''; ?>> Conversas ambiente entre NPCs</label>
        </div>
        <h4 style="color:#fff;font-size:.95rem;margin-top:14px;">Profissões (peso relativo e estado)</h4>
        <table style="width:100%;color:#dfe5ee;font-size:.85rem;">
            <?php foreach ($archetypes as $k => $a): ?>
                <tr><td style="padding:4px;"><?php echo $h($a['label']); ?></td>
                    <td><input type="number" name="weight[<?php echo $h($k); ?>]" min="0" value="<?php echo (int)($pop['weights'][$k] ?? 0); ?>" <?php echo $inp; ?>></td>
                    <td><select name="astatus[<?php echo $h($k); ?>]" <?php echo $inp; ?>><?php foreach (['active' => 'Activo', 'inactive' => 'Inactivo', 'maintenance' => 'Manutenção'] as $sk => $sl): ?><option value="<?php echo $sk; ?>" <?php echo ($pop['archetypeStatus'][$k] ?? 'active') === $sk ? 'selected' : ''; ?>><?php echo $sl; ?></option><?php endforeach; ?></select></td></tr>
            <?php endforeach; ?>
        </table>
        <button style="margin-top:12px;background:#F0444A;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:800;">Guardar população</button>
    </form>
<?php elseif ($tab === 'lista'): $npcs = $token ? (world3d_api('GET', '/admin/npcs', null, $token)['data']['npcs'] ?? []) : []; ?>
    <div <?php echo $card; ?>>
        <table style="width:100%;color:#dfe5ee;font-size:.82rem;border-collapse:collapse;">
            <tr style="color:var(--text-muted);text-align:left;"><th>ID</th><th>Nome</th><th>Profissão</th><th>Modo</th><th>Nível</th><th>Posição</th><th>Estado</th><th></th></tr>
            <?php foreach ($npcs as $n): ?>
                <tr style="border-top:1px solid #273142;"><td style="padding:4px;"><?php echo $h($n['id']); ?></td><td><?php echo $h($n['name']); ?></td><td><?php echo $h($n['archetype']); ?></td><td><?php echo $h($n['mode']); ?> / <?php echo $h($n['anim']); ?></td><td><?php echo $h($n['tier']); ?></td><td><?php echo (int)$n['x']; ?>, <?php echo (int)$n['z']; ?></td><td><?php echo $h($n['status']); ?></td>
                    <td><form method="post" style="display:flex;gap:4px;"><input type="hidden" name="csrf" value="<?php echo $h($csrf); ?>"><input type="hidden" name="action" value="npc_status"><input type="hidden" name="npc_id" value="<?php echo $h($n['id']); ?>"><select name="status" <?php echo $inp; ?>><option value="active">activo</option><option value="inactive">inactivo</option><option value="maintenance">manutenção</option></select><button style="background:#273142;color:#fff;border:0;border-radius:6px;padding:4px 8px;">OK</button></form></td></tr>
            <?php endforeach; ?>
        </table>
    </div>
<?php elseif ($tab === 'dialogo'): $d = $cfg['dialogue']; ?>
    <form method="post" <?php echo $card; ?>>
        <input type="hidden" name="csrf" value="<?php echo $h($csrf); ?>"><input type="hidden" name="action" value="dialogue">
        <h3 style="color:#fff;font-size:1.05rem;">Diálogo com IA (servidor)</h3>
        <p style="color:var(--text-muted);font-size:.82rem;">A chave da IA fica no servidor de mundo (OPENROUTER_API_KEY), nunca nesta página nem no navegador. Sem IA ou sem orçamento, os NPCs respondem com o sistema local e continuam as rotinas. Identidade IA, dinheiro e segredos têm sempre resposta local.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;color:#dfe5ee;font-size:.86rem;">
            <label><input type="checkbox" name="aiEnabled" value="1" <?php echo $d['aiEnabled'] ? 'checked' : ''; ?>> IA generativa activa</label>
            <label>Modelo<br><input name="model" value="<?php echo $h($d['model']); ?>" <?php echo $inp; ?>></label>
            <label>Modelo alternativo<br><input name="fallbackModel" value="<?php echo $h($d['fallbackModel'] ?? ''); ?>" <?php echo $inp; ?>></label>
            <label>Máx. tokens por resposta<br><input type="number" name="maxTokens" value="<?php echo (int)$d['maxTokens']; ?>" <?php echo $inp; ?>></label>
            <label>Tempo limite (ms)<br><input type="number" name="timeoutMs" value="<?php echo (int)$d['timeoutMs']; ?>" <?php echo $inp; ?>></label>
            <label>Mensagens por jogador/min<br><input type="number" name="perPlayerPerMinute" value="<?php echo (int)$d['perPlayerPerMinute']; ?>" <?php echo $inp; ?>></label>
            <label>Mensagens por jogador/dia<br><input type="number" name="perPlayerPerDay" value="<?php echo (int)$d['perPlayerPerDay']; ?>" <?php echo $inp; ?>></label>
            <label>Chamadas IA globais/dia<br><input type="number" name="globalCallsPerDay" value="<?php echo (int)$d['globalCallsPerDay']; ?>" <?php echo $inp; ?>></label>
            <label>Tokens globais/dia<br><input type="number" name="globalTokensPerDay" value="<?php echo (int)$d['globalTokensPerDay']; ?>" <?php echo $inp; ?>></label>
            <label>Custo estimado por 1k tokens (USD)<br><input type="number" step="0.0001" name="estCostPer1kTokensUsd" value="<?php echo (float)$d['estCostPer1kTokensUsd']; ?>" <?php echo $inp; ?>></label>
            <label>Custo máximo diário (USD)<br><input type="number" step="0.01" name="maxDailyCostUsd" value="<?php echo (float)$d['maxDailyCostUsd']; ?>" <?php echo $inp; ?>></label>
        </div>
        <h4 style="color:#fff;font-size:.95rem;margin-top:14px;">Tipo de diálogo por profissão</h4>
        <?php foreach ($archetypes as $k => $a): ?>
            <label style="display:inline-block;margin:4px 10px 4px 0;color:#dfe5ee;font-size:.84rem;"><?php echo $h($a['label']); ?> <select name="dmode[<?php echo $h($k); ?>]" <?php echo $inp; ?>><option value="livre" <?php echo ($d['dialogueModeByArchetype'][$k] ?? 'livre') === 'livre' ? 'selected' : ''; ?>>livre (IA)</option><option value="guiado" <?php echo ($d['dialogueModeByArchetype'][$k] ?? '') === 'guiado' ? 'selected' : ''; ?>>guiado (local)</option></select></label>
        <?php endforeach; ?>
        <div><button style="margin-top:12px;background:#F0444A;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:800;">Guardar diálogo</button></div>
    </form>
<?php elseif ($tab === 'ambiente'): $t = $cfg['traffic']; $w = $cfg['weather']; $c = $cfg['clock']; $z = $cfg['zone']; ?>
    <form method="post" <?php echo $card; ?>>
        <input type="hidden" name="csrf" value="<?php echo $h($csrf); ?>"><input type="hidden" name="action" value="environment">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;color:#dfe5ee;font-size:.86rem;">
            <label><input type="checkbox" name="trafficEnabled" value="1" <?php echo $t['enabled'] ? 'checked' : ''; ?>> Trânsito activo</label>
            <label>Máx. carros<br><input type="number" name="maxCars" value="<?php echo (int)$t['maxCars']; ?>" <?php echo $inp; ?>></label>
            <label>Escala de densidade<br><input type="number" step="0.1" name="densityScale" value="<?php echo (float)$t['densityScale']; ?>" <?php echo $inp; ?>></label>
            <label><input type="checkbox" name="weatherEnabled" value="1" <?php echo $w['enabled'] ? 'checked' : ''; ?>> Clima dinâmico</label>
            <label>Intensidade<br><input type="number" step="0.1" name="intensity" value="<?php echo (float)$w['intensity']; ?>" <?php echo $inp; ?>></label>
            <label>Duração mín./máx. (min)<br><input type="number" name="minDurationMin" value="<?php echo (int)$w['minDurationMin']; ?>" style="width:70px;background:#10141C;border:1px solid #282F3D;color:#fff;border-radius:8px;padding:6px;"> / <input type="number" name="maxDurationMin" value="<?php echo (int)$w['maxDurationMin']; ?>" style="width:70px;background:#10141C;border:1px solid #282F3D;color:#fff;border-radius:8px;padding:6px;"></label>
            <label>Transição (min)<br><input type="number" name="transitionMin" value="<?php echo (int)$w['transitionMin']; ?>" <?php echo $inp; ?>></label>
            <label>Forçar clima (30 min)<br><select name="weatherPreset" <?php echo $inp; ?>><option value="">—</option><?php foreach ($weatherPresets as $p): ?><option><?php echo $h($p); ?></option><?php endforeach; ?></select></label>
            <label>Relógio<br><select name="clockMode" <?php echo $inp; ?>><option value="realtime" <?php echo $c['mode'] === 'realtime' ? 'selected' : ''; ?>>Tempo real de Luanda</option><option value="accelerated" <?php echo $c['mode'] === 'accelerated' ? 'selected' : ''; ?>>Dia acelerado</option></select></label>
            <label>Duração do dia virtual (min reais)<br><input type="number" name="dayLengthMinutes" value="<?php echo (int)$c['dayLengthMinutes']; ?>" <?php echo $inp; ?>></label>
            <label>Estado da zona<br><select name="zoneStatus" <?php echo $inp; ?>><?php foreach (['active' => 'Activa', 'maintenance' => 'Manutenção', 'inactive' => 'Inactiva'] as $k => $l): ?><option value="<?php echo $k; ?>" <?php echo $z['status'] === $k ? 'selected' : ''; ?>><?php echo $l; ?></option><?php endforeach; ?></select></label>
            <label>Mensagem de manutenção<br><input name="maintenanceMessage" value="<?php echo $h($z['maintenanceMessage']); ?>" <?php echo $inp; ?>></label>
        </div>
        <button style="margin-top:12px;background:#F0444A;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:800;">Guardar ambiente</button>
    </form>
<?php elseif ($tab === 'competicoes'):
    $cp = $cfg['competitions'] ?? [];
    $arenaMatches = $token ? (world3d_api('GET', '/admin/arena-matches?limit=30', null, $token)['data']['rows'] ?? []) : [];
?>
    <form method="post" <?php echo $card; ?>>
        <input type="hidden" name="csrf" value="<?php echo $h($csrf); ?>"><input type="hidden" name="action" value="competitions">
        <h3 style="color:#fff;font-size:1.05rem;">Configuração de Competições & Arenas 1v1</h3>
        <p style="color:var(--text-muted);font-size:.82rem;">O Mundo 3D movimenta <strong>saldo de demonstração (Kz demo)</strong>. O modelo financeiro oficial reparte o pote de apostas em <strong>80% para o vencedor</strong> e <strong>20% de comissão da plataforma</strong> com registo de hash criptográfico SHA-256 autoritativo.</p>
        
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:12px 0;">
            <label style="color:#dfe5ee;"><input type="checkbox" name="raceEnabled" value="1" <?php echo ($cp['raceEnabled'] ?? true) ? 'checked' : ''; ?>> 🏎️ Corridas activas</label>
            <label style="color:#dfe5ee;"><input type="checkbox" name="combatEnabled" value="1" <?php echo ($cp['combatEnabled'] ?? true) ? 'checked' : ''; ?>> 🥊 Combate 1v1 activo</label>
            <label style="color:#dfe5ee;"><input type="checkbox" name="shootingEnabled" value="1" <?php echo ($cp['shootingEnabled'] ?? true) ? 'checked' : ''; ?>> 🎯 Duelo de Tiro 1v1 activo</label>
            <label style="color:#dfe5ee;"><input type="checkbox" name="survivalEnabled" value="1" <?php echo ($cp['survivalEnabled'] ?? true) ? 'checked' : ''; ?>> 🛡️ Sobrevivência activa</label>
            <label style="color:#dfe5ee;"><input type="checkbox" name="stakesEnabled" value="1" <?php echo ($cp['stakesEnabled'] ?? true) ? 'checked' : ''; ?>> 💰 Entradas com saldo demo</label>
            <label style="color:#dfe5ee;">Taxa da plataforma (%) <br><input type="number" step="0.5" name="feePct" value="<?php echo (float)($cp['feePct'] ?? 20); ?>" <?php echo $inp; ?> style="width:120px;"></label>
        </div>
        <div><button style="margin-top:12px;background:#F0444A;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:800;">Guardar regras de competição</button></div>
    </form>

    <div <?php echo $card; ?>>
        <h3 style="color:#fff;font-size:1.05rem;">🏟️ Centros Físicos de Competição no Mapa</h3>
        <p style="color:var(--text-muted);font-size:.82rem;">Espaços dedicados com interiores 3D completos, regras físicas de colisão e modos dedicados.</p>
        <table style="width:100%;color:#dfe5ee;font-size:.85rem;border-collapse:collapse;">
            <tr style="color:var(--text-muted);text-align:left;border-bottom:1px solid #273142;">
                <th style="padding:6px;">Centro</th><th>Bairro</th><th>Coordenadas</th><th>Modos Suportados</th><th>Divisão do Pote</th><th>Estado</th>
            </tr>
            <tr style="border-bottom:1px solid #273142;">
                <td style="padding:8px;font-weight:700;">🥊 Centro de Combate 1v1</td>
                <td>Complexo Talatona Sul</td>
                <td><code>X: 45, Z: 145</code></td>
                <td>Luta corpo a corpo 1v1, Boxe, Golpes e Defesa</td>
                <td><span style="color:#22C98B;font-weight:700;">80% Vencedor</span> / 20% Casa</td>
                <td><span class="badge text-bg-success">Activo</span></td>
            </tr>
            <tr style="border-bottom:1px solid #273142;">
                <td style="padding:8px;font-weight:700;">🎯 Arena de Tiro Táctico</td>
                <td>Complexo Talatona Sul</td>
                <td><code>X: 160, Z: 140</code></td>
                <td>Duelo de Precisão 1v1 & Modo Sobrevivência</td>
                <td><span style="color:#22C98B;font-weight:700;">80% Vencedor</span> / 20% Casa</td>
                <td><span class="badge text-bg-success">Activo</span></td>
            </tr>
            <tr style="border-bottom:1px solid #273142;">
                <td style="padding:8px;font-weight:700;">🏎️ Autódromo & Centro de Corridas</td>
                <td>Zona Desportiva Oeste</td>
                <td><code>X: -150, Z: 135</code></td>
                <td>Circuito do Anel (12 CPs) & Grande Circuito Urbano (24 CPs)</td>
                <td><span style="color:#22C98B;font-weight:700;">80% Vencedor</span> / 20% Casa</td>
                <td><span class="badge text-bg-success">Activo</span></td>
            </tr>
            <tr>
                <td style="padding:8px;font-weight:700;">🏆 Casa de Apostas Kianda</td>
                <td>Kianda Centro</td>
                <td><code>X: 18, Z: 22</code></td>
                <td>Mural de Desafios, Lobbies Abertos e Transmissões ao Vivo</td>
                <td>Configurável por duelo</td>
                <td><span class="badge text-bg-success">Activo</span></td>
            </tr>
        </table>
    </div>

    <div <?php echo $card; ?>>
        <h3 style="color:#fff;font-size:1.05rem;">📜 Auditoria de Batalhas & Duelos Recentes (80/20)</h3>
        <p style="color:var(--text-muted);font-size:.82rem;">Histórico das últimas batalhas resolvidas com prova criptográfica SHA-256 e liquidação financeira.</p>
        <?php if (empty($arenaMatches)): ?>
            <p style="color:var(--text-muted);font-style:italic;">Ainda não há duelos registados nesta sessão.</p>
        <?php else: ?>
            <table style="width:100%;color:#dfe5ee;font-size:.82rem;border-collapse:collapse;">
                <tr style="color:var(--text-muted);text-align:left;border-bottom:1px solid #273142;">
                    <th style="padding:6px;">Data</th><th>ID</th><th>Centro</th><th>Modo</th><th>Aposta</th><th>Prémio (80%)</th><th>Taxa (20%)</th><th>Hash SHA-256</th>
                </tr>
                <?php foreach ($arenaMatches as $m): $rec = $m['record'] ?? []; $split = $rec['split'] ?? ['prizeKz' => 0, 'feeKz' => 0]; ?>
                    <tr style="border-bottom:1px solid #273142;">
                        <td style="padding:6px;white-space:nowrap;"><?php echo date('d/m H:i:s', (int)(($m['createdAt'] ?? 0) / 1000)); ?></td>
                        <td><code><?php echo $h(substr($m['matchId'] ?? '', 0, 14)); ?></code></td>
                        <td><?php echo $h($rec['centerName'] ?? ($m['centerId'] ?? '')); ?></td>
                        <td><span class="badge text-bg-secondary"><?php echo $h($m['mode'] ?? ''); ?></span></td>
                        <td><b><?php echo number_format((float)($m['stakeKz'] ?? 0), 0, ',', '.'); ?> Kz</b></td>
                        <td style="color:#22C98B;font-weight:700;"><?php echo number_format((float)($split['prizeKz'] ?? 0), 0, ',', '.'); ?> Kz</td>
                        <td style="color:var(--text-muted);"><?php echo number_format((float)($split['feeKz'] ?? 0), 0, ',', '.'); ?> Kz</td>
                        <td><code style="font-size:.72rem;"><?php echo $h(substr($m['hash'] ?? '', 0, 18)); ?>…</code></td>
                    </tr>
                <?php endforeach; ?>
            </table>
        <?php endif; ?>
    </div>

    <div <?php echo $card; ?>>
        <h3 style="color:#fff;font-size:1.05rem;">Bots de treino</h3>
        <p style="color:var(--text-muted);font-size:.82rem;">Identificados como bots, só em corridas gratuitas, sem percentagem de vitória programada (conduzem a velocidade fixa por dificuldade; o servidor valida o resultado como para humanos).</p>
        <table style="width:100%;color:#dfe5ee;font-size:.85rem;"><tr style="color:var(--text-muted);text-align:left;"><th>ID</th><th>Nome</th><th>Dificuldade</th><th>Veículo</th><th>Origem</th></tr>
            <?php foreach (($cp['trainingBots'] ?? []) as $b): ?><tr><td><?php echo $h($b['id']); ?></td><td><?php echo $h($b['name']); ?></td><td><?php echo $h($b['difficulty']); ?></td><td><?php echo $h($b['vehicle']); ?></td><td><?php echo $h($b['source'] ?? ''); ?></td></tr><?php endforeach; ?>
        </table>
        <form method="post"><input type="hidden" name="csrf" value="<?php echo $h($csrf); ?>"><input type="hidden" name="action" value="import_bots"><button style="margin-top:10px;background:#273142;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;">Importar bots activos da Arena como bots de treino</button></form>
    </div>
<?php elseif ($tab === 'recursos'): $cat = $token ? world3d_api('GET', '/admin/catalog', null, $token)['data'] ?? [] : []; ?>
    <form method="post" <?php echo $card; ?>>
        <input type="hidden" name="csrf" value="<?php echo $h($csrf); ?>"><input type="hidden" name="action" value="catalog">
        <h3 style="color:#fff;font-size:1.05rem;">Catálogo de recursos (roupa, acessórios, veículos)</h3>
        <p style="color:var(--text-muted);font-size:.82rem;">Estado: <b>pronto</b> (recurso final integrado), <b>provisório</b> (integrado, gerado por código), <b>indisponível</b> (anunciado, não seleccionável). Preços em Kz demo.</p>
        <table style="width:100%;color:#dfe5ee;font-size:.82rem;border-collapse:collapse;">
            <tr style="color:var(--text-muted);text-align:left;"><th>ID</th><th>Nome</th><th>Tipo</th><th>Estado</th><th>Preço</th><th>Activo</th><th>Publicado</th><th>Miniatura (URL)</th></tr>
            <?php foreach (($cat['catalog'] ?? []) as $i): ?>
                <tr style="border-top:1px solid #273142;"><td style="padding:4px;"><?php echo $h($i['id']); ?></td><td><?php echo $h($i['name']); ?></td><td><?php echo $h($i['kind'] . '/' . $i['slot']); ?></td>
                    <td><select name="item[<?php echo $h($i['id']); ?>][status]" <?php echo $inp; ?>><?php foreach (['pronto', 'provisorio', 'indisponivel'] as $s): ?><option <?php echo $i['status'] === $s ? 'selected' : ''; ?>><?php echo $s; ?></option><?php endforeach; ?></select></td>
                    <td><input type="number" name="item[<?php echo $h($i['id']); ?>][price]" value="<?php echo (int)$i['price']; ?>" style="width:90px;background:#10141C;border:1px solid #282F3D;color:#fff;border-radius:6px;padding:4px;"></td>
                    <td><input type="checkbox" name="item[<?php echo $h($i['id']); ?>][active]" value="1" <?php echo $i['active'] ? 'checked' : ''; ?>></td>
                    <td><input type="checkbox" name="item[<?php echo $h($i['id']); ?>][published]" value="1" <?php echo $i['published'] ? 'checked' : ''; ?>></td>
                    <td><input name="item[<?php echo $h($i['id']); ?>][thumbnail]" value="<?php echo $h($i['thumbnail'] ?? ''); ?>" placeholder="https://… ou assets/…" style="width:180px;background:#10141C;border:1px solid #282F3D;color:#fff;border-radius:6px;padding:4px;"></td></tr>
            <?php endforeach; ?>
        </table>
        <h3 style="color:#fff;font-size:1.05rem;margin-top:16px;">Emotes</h3>
        <table style="width:100%;color:#dfe5ee;font-size:.82rem;"><tr style="color:var(--text-muted);text-align:left;"><th></th><th>ID</th><th>Nome</th><th>Categoria</th><th>Duração</th><th>Cooldown (ms)</th><th>Activo</th></tr>
            <?php foreach (($cat['emotes'] ?? []) as $e): ?>
                <tr><td><?php echo $h($e['icon']); ?></td><td><?php echo $h($e['id']); ?></td><td><?php echo $h($e['name']); ?></td><td><?php echo $h($e['category']); ?></td><td><?php echo (int)$e['durationMs']; ?> ms<?php echo $e['loop'] ? ' (contínuo)' : ''; ?></td>
                    <td><input type="number" name="emote[<?php echo $h($e['id']); ?>][cooldownMs]" value="<?php echo (int)$e['rules']['cooldownMs']; ?>" style="width:90px;background:#10141C;border:1px solid #282F3D;color:#fff;border-radius:6px;padding:4px;"></td>
                    <td><input type="checkbox" name="emote[<?php echo $h($e['id']); ?>][active]" value="1" <?php echo $e['active'] ? 'checked' : ''; ?>></td></tr>
            <?php endforeach; ?>
        </table>
        <button style="margin-top:12px;background:#F0444A;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:800;">Guardar recursos</button>
    </form>
<?php elseif ($tab === 'auditoria'): $rows = $token ? (world3d_api('GET', '/admin/audit?limit=80', null, $token)['data']['rows'] ?? []) : []; $ver = $token ? world3d_api('GET', '/admin/ledger/verify', null, $token)['data'] ?? [] : []; ?>
    <div <?php echo $card; ?>>
        <h3 style="color:#fff;font-size:1.05rem;">Razão demo</h3>
        <p style="color:#dfe5ee;">Verificação: <?php echo !empty($ver['ok']) ? '<span class="badge text-bg-success">íntegro</span>' : '<span class="badge text-bg-danger">problemas</span>'; ?> · <?php echo (int)($ver['transactions'] ?? 0); ?> transacções · cabeça <code><?php echo $h(substr($ver['headHash'] ?? '', 0, 16)); ?>…</code></p>
        <?php foreach (($ver['problems'] ?? []) as $p): ?><div style="color:#ff9da1;"><?php echo $h($p); ?></div><?php endforeach; ?>
    </div>
    <div <?php echo $card; ?>>
        <table style="width:100%;color:#dfe5ee;font-size:.8rem;"><tr style="color:var(--text-muted);text-align:left;"><th>Data</th><th>Tipo</th><th>Dados</th></tr>
            <?php foreach ($rows as $r): ?><tr style="border-top:1px solid #273142;"><td style="padding:4px;white-space:nowrap;"><?php echo date('d/m H:i:s', (int)($r['createdAt'] / 1000)); ?></td><td><?php echo $h($r['type']); ?></td><td><code style="font-size:.75rem;"><?php echo $h(substr(json_encode($r['data'], JSON_UNESCAPED_UNICODE), 0, 220)); ?></code></td></tr><?php endforeach; ?>
        </table>
    </div>
<?php endif; ?>
</main>
<?php require_once(__DIR__ . '/../../footer.php'); ?>
