<?php
/**
 * NGOLABIZ GAMER — MUNDO 3D (Kianda Centro)
 * Entrada do portal para o mundo aberto 3D. O jogo corre num servidor de mundo próprio
 * (world3d/server); esta página apresenta o estado, explica as regras e lança o cliente.
 */
require_once(__DIR__ . '/init.php');
require_once(__DIR__ . '/world3d/platform/world3d_bridge.php');

$page_title = 'Mundo 3D — Kianda Centro';
$w3d_cfg = world3d_config();
$w3d_health = world3d_api('GET', '/api/health', null, null, 2);
$w3d_time = $w3d_health['ok'] ? world3d_api('GET', '/api/time', null, null, 2) : ['ok' => false];
$w3d_board = $w3d_health['ok'] ? world3d_api('GET', '/api/leaderboard', null, null, 2) : ['ok' => false];
$w3d_online = $w3d_health['ok'] && ($w3d_health['data']['status'] ?? '') === 'active';
$client_url = GAMER_URL . '/world3d/web/index.html';

require_once(__DIR__ . '/header.php');
?>
<main class="arena-page-body">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
        <div>
            <h1 style="font-size:1.8rem;font-weight:800;color:#fff;font-family:var(--font-gamer);">MUNDO 3D · KIANDA CENTRO</h1>
            <p style="color:var(--text-muted);font-size:.92rem;max-width:720px;">Mundo aberto 3D em tempo real com condução de carros e motas, lojas de roupa e veículos, casas, Casa de Apostas, chat com voz e corridas validadas pelo servidor. Hora sincronizada com <strong>Africa/Luanda</strong>.</p>
        </div>
        <div style="text-align:right;">
            <?php if ($w3d_online): ?>
                <span class="badge text-bg-success">SERVIDOR ONLINE</span>
                <div style="color:var(--text-muted);font-size:.85rem;margin-top:4px;"><?php echo (int)($w3d_health['data']['players'] ?? 0); ?> jogador(es) no mundo<?php if ($w3d_time['ok']): ?> · <?php echo sprintf('%02d:%02d', $w3d_time['data']['local']['hour'], $w3d_time['data']['local']['minute']); ?> em Luanda<?php endif; ?></div>
            <?php else: ?>
                <span class="badge text-bg-secondary">SERVIDOR INDISPONÍVEL</span>
                <div style="color:var(--text-muted);font-size:.85rem;margin-top:4px;">O servidor do mundo não respondeu. Tenta mais tarde.</div>
            <?php endif; ?>
        </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
        <div style="background:#161c26;border:1px solid #273142;border-radius:14px;padding:18px;">
            <h3 style="color:#fff;font-size:1.1rem;margin-bottom:8px;">Jogar no navegador</h3>
            <p style="color:var(--text-muted);font-size:.88rem;">Cliente web de pré-visualização (WebGL). Funciona em computador e telemóvel com controlos tácteis; a qualidade gráfica ajusta-se ao dispositivo.</p>
            <a href="<?php echo htmlspecialchars($client_url); ?>" style="display:inline-block;margin-top:8px;background:#F0444A;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:800;" <?php echo $w3d_online ? '' : 'aria-disabled="true"'; ?>>ENTRAR EM KIANDA CENTRO</a>
            <p style="color:var(--text-muted);font-size:.8rem;margin-top:10px;"><?php echo $logged_user ? 'Entras com a tua conta NgolaBiz (o teu progresso, roupa e veículos ficam guardados).' : 'Sem sessão iniciada entras como visitante. <a href="' . GAMER_URL . '/auth.php" style="color:#F0444A;">Entra na conta</a> para guardar o progresso.'; ?></p>
        </div>
        <div style="background:#161c26;border:1px solid #273142;border-radius:14px;padding:18px;">
            <h3 style="color:#fff;font-size:1.1rem;margin-bottom:8px;">Cliente nativo (Unreal Engine 5)</h3>
            <p style="color:var(--text-muted);font-size:.88rem;">Em desenvolvimento. O cliente de produção usa o mesmo servidor de mundo, contas e regras. Ainda não está disponível para descarga.</p>
            <span class="badge text-bg-secondary">BREVEMENTE</span>
        </div>
        <div style="background:#161c26;border:1px solid #273142;border-radius:14px;padding:18px;">
            <h3 style="color:#fff;font-size:1.1rem;margin-bottom:8px;">O que podes fazer em Kianda Centro</h3>
            <ul style="color:var(--text-muted);font-size:.86rem;padding-left:18px;margin:0;">
                <li>Conduzir <strong>carros e motas</strong> estacionados pela cidade ou levantados na Garagem Kalunga Motors.</li>
                <li>Entrar nas <strong>casas, lojas (Moda Muxima, Stand Kalunga, Mercado) e na Casa de Apostas da Arena</strong>.</li>
                <li>Conversar por chat e ouvir <strong>vozes distintas em tempo real</strong> para cada pessoa e jogador.</li>
                <li>Participar em corridas no Circuito do Anel da Kianda com registo verificável pelo servidor.</li>
            </ul>
        </div>
    </div>

    <h2 style="color:#fff;font-size:1.2rem;margin:26px 0 10px;">Classificação de corridas</h2>
    <div style="background:#161c26;border:1px solid #273142;border-radius:14px;padding:10px 14px;">
        <?php $rows = $w3d_board['ok'] ? ($w3d_board['data']['rows'] ?? []) : []; ?>
        <?php if (!$rows): ?>
            <p style="color:var(--text-muted);margin:8px 0;">Ainda sem corridas registadas.</p>
        <?php else: ?>
            <table style="width:100%;color:#dfe5ee;font-size:.9rem;border-collapse:collapse;">
                <tr style="color:var(--text-muted);text-align:left;"><th style="padding:6px;">#</th><th>Jogador</th><th>Vitórias</th><th>Corridas</th><th>Melhor volta</th></tr>
                <?php foreach (array_slice($rows, 0, 15) as $i => $r): ?>
                    <tr style="border-top:1px solid #273142;"><td style="padding:6px;"><?php echo $i + 1; ?></td><td><?php echo htmlspecialchars($r['displayName']); ?></td><td><?php echo (int)$r['wins']; ?></td><td><?php echo (int)$r['races']; ?></td><td><?php echo $r['bestLapMs'] ? number_format($r['bestLapMs'] / 1000, 1, ',', '') . ' s' : '—'; ?></td></tr>
                <?php endforeach; ?>
            </table>
        <?php endif; ?>
    </div>
</main>
<?php require_once(__DIR__ . '/footer.php'); ?>
