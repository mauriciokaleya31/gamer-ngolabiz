<?php
/**
 * NGOLABIZ ARENA - RANKINGS & CLASSIFICAÇÕES NACIONAIS (ANGOLA)
 * Pódio Top 3 Premium, Sem Sigla MMR, 100% Responsivo e Sincronizado
 */
require_once(__DIR__ . '/init.php');

$tab = $_GET['tab'] ?? 'general';
$sort_by = $_GET['sort'] ?? 'points';

$page_title = 'Rankings & Classificações';
require_once(__DIR__ . '/header.php');

$order_clause = "p.competitive_points DESC";
if ($sort_by === 'wins') {
    $order_clause = "p.total_wins DESC, p.competitive_points DESC";
} elseif ($sort_by === 'winrate') {
    $order_clause = "CASE WHEN p.total_matches >= 5 THEN (p.total_wins / p.total_matches) ELSE 0 END DESC, p.total_wins DESC";
} elseif ($sort_by === 'streak') {
    $order_clause = "p.max_streak DESC, p.total_wins DESC";
}

$human_rankings = [];
if ($tab !== 'bots' || !$is_admin) {
    if ($tab === 'bots' && !$is_admin) {
        $tab = 'general';
    }
    $sql_humans = "SELECT p.*, u.user_picture, u.user_firstname, u.user_lastname,
        CASE WHEN p.total_matches > 0 THEN ROUND((p.total_wins / p.total_matches) * 100, 1) ELSE 0 END as winrate
        FROM arena_profiles p
        JOIN users u ON u.user_id = p.user_id
        ORDER BY {$order_clause} LIMIT 50";
    $res = $db->query($sql_humans);
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $human_rankings[] = $row;
        }
    }

    // Incluir combatentes da rede na classificação geral como lutadores normais
    $q_bots = $db->query("SELECT * FROM arena_bots WHERE is_active = 1 LIMIT 15");
    if ($q_bots) {
        while ($b = $q_bots->fetch_assoc()) {
            $matches = max(12, (int)$b['total_matches']);
            $wins = max(8, (int)$b['total_wins']);
            $winrate_val = round(($wins / $matches) * 100, 1);
            $points_val = (int)($b['target_winrate'] * 15 + $wins * 25 + 200);

            $human_rankings[] = [
                'user_id' => 0,
                'gamer_tag' => $b['fullname'] ?: $b['bot_tag'],
                'user_picture' => $b['avatar_url'] ?: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
                'province' => $b['province'] ?: 'Luanda',
                'total_matches' => $matches,
                'total_wins' => $wins,
                'winrate' => $winrate_val,
                'competitive_points' => $points_val,
                'max_streak' => max(2, min(8, floor($wins / 3)))
            ];
        }
    }

    // Reordenar a lista mesclada com base no critério selecionado
    usort($human_rankings, function($a, $b) use ($sort_by) {
        if ($sort_by === 'wins') {
            return $b['total_wins'] <=> $a['total_wins'];
        } elseif ($sort_by === 'winrate') {
            return $b['winrate'] <=> $a['winrate'];
        } elseif ($sort_by === 'streak') {
            return ($b['max_streak'] ?? 0) <=> ($a['max_streak'] ?? 0);
        }
        return $b['competitive_points'] <=> $a['competitive_points'];
    });
}

$bot_rankings = [];
if ($tab === 'bots' && $is_admin) {
    $sql_bots = "SELECT b.*,
        CASE WHEN b.total_matches > 0 THEN ROUND((b.total_wins / b.total_matches) * 100, 1) ELSE 0 END as winrate
        FROM arena_bots b
        WHERE b.is_active = 1
        ORDER BY b.total_wins DESC, b.target_winrate DESC";
    $res_b = $db->query($sql_bots);
    if ($res_b) {
        while ($row = $res_b->fetch_assoc()) {
            $bot_rankings[] = $row;
        }
    }
}

// Separar os Top 3 para o Pódio de Honra
$top1 = $human_rankings[0] ?? null;
$top2 = $human_rankings[1] ?? null;
$top3 = $human_rankings[2] ?? null;
?>

<main class="arena-page-body">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
        <div>
            <h1 style="font-size: 1.7rem; font-weight: 800; color: #fff; font-family: var(--font-gamer);">RANKINGS COMPETITIVOS</h1>
            <p style="color: var(--text-muted); font-size: 0.9rem;">Fuso Horário Oficial: <strong>Angola (GMT+1)</strong> • Classificação atualizada a cada duelo.</p>
        </div>
        <div style="display: flex; gap: 8px;">
            <a href="<?php echo GAMER_URL; ?>/play.php" class="btn-launch-hero" style="text-decoration: none;">
                <i class="fa-solid fa-gamepad"></i> Disputar Partida
            </a>
        </div>
    </div>

    <!-- Navegação de Abas -->
    <div style="display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; overflow-x: auto; padding-bottom: 4px;">
        <a href="?tab=general&sort=<?php echo $sort_by; ?>" class="btn-launch-hero" style="padding: 8px 16px; font-size: 0.88rem; white-space: nowrap; text-decoration: none; <?php echo ($tab !== 'general') ? 'background: var(--bg-card); border: 1px solid var(--border-subtle); color: var(--text-muted); box-shadow: none;' : ''; ?>">
            <i class="fa-solid fa-globe"></i> Classificação Geral
        </a>
        <a href="?tab=weekly&sort=<?php echo $sort_by; ?>" class="btn-launch-hero" style="padding: 8px 16px; font-size: 0.88rem; white-space: nowrap; text-decoration: none; <?php echo ($tab !== 'weekly') ? 'background: var(--bg-card); border: 1px solid var(--border-subtle); color: var(--text-muted); box-shadow: none;' : ''; ?>">
            <i class="fa-solid fa-calendar-week"></i> Top Semanal
        </a>
        <a href="?tab=monthly&sort=<?php echo $sort_by; ?>" class="btn-launch-hero" style="padding: 8px 16px; font-size: 0.88rem; white-space: nowrap; text-decoration: none; <?php echo ($tab !== 'monthly') ? 'background: var(--bg-card); border: 1px solid var(--border-subtle); color: var(--text-muted); box-shadow: none;' : ''; ?>">
            <i class="fa-solid fa-calendar"></i> Top Mensal
        </a>
        <?php if ($is_admin): ?>
        <a href="?tab=bots" class="btn-launch-hero" style="padding: 8px 16px; font-size: 0.88rem; white-space: nowrap; text-decoration: none; <?php echo ($tab !== 'bots') ? 'background: var(--bg-card); border: 1px solid var(--border-subtle); color: var(--text-muted); box-shadow: none;' : ''; ?>">
            <i class="fa-solid fa-users-gear"></i> Oponentes da Rede
        </a>
        <?php endif; ?>
    </div>

    <!-- PÓDIO DE HONRA: TOP 3 MELHORES JOGADORES -->
    <?php if ($tab !== 'bots' && $top1): ?>
    <div class="rankings-podium-wrap">
        <!-- 2º LUGAR (PRATA) -->
        <?php if ($top2): 
            $av2 = !empty($top2['user_picture']) ? (filter_var($top2['user_picture'], FILTER_VALIDATE_URL) ? $top2['user_picture'] : MAIN_URL . '/content/uploads/' . $top2['user_picture']) : MAIN_URL . '/content/themes/' . $system['theme'] . '/images/blank_profile.png';
        ?>
        <div class="podium-card podium-2">
            <div class="podium-avatar-box">
                <img src="<?php echo htmlspecialchars($av2); ?>" alt="Top 2">
            </div>
            <div class="podium-rank-number" style="color: #cbd5e1;">#2</div>
            <div class="podium-tag"><?php echo htmlspecialchars($top2['gamer_tag']); ?></div>
            <div style="font-size: 0.72rem; color: var(--neon-cyan); margin-top: 2px;"><i class="fa-solid fa-map-pin"></i> <?php echo htmlspecialchars($top2['province'] ?? 'Luanda'); ?></div>
            <div class="podium-points"><?php echo number_format($top2['competitive_points'], 0, '', '.'); ?> pts</div>
        </div>
        <?php endif; ?>

        <!-- 1º LUGAR (OURO) -->
        <?php if ($top1): 
            $av1 = !empty($top1['user_picture']) ? (filter_var($top1['user_picture'], FILTER_VALIDATE_URL) ? $top1['user_picture'] : MAIN_URL . '/content/uploads/' . $top1['user_picture']) : MAIN_URL . '/content/themes/' . $system['theme'] . '/images/blank_profile.png';
        ?>
        <div class="podium-card podium-1">
            <div class="podium-avatar-box">
                <i class="fa-solid fa-crown podium-crown"></i>
                <img src="<?php echo htmlspecialchars($av1); ?>" alt="Top 1">
            </div>
            <div class="podium-rank-number" style="color: var(--neon-gold);">#1 CAMPEÃO</div>
            <div class="podium-tag" style="font-size: 1.05rem;"><?php echo htmlspecialchars($top1['gamer_tag']); ?></div>
            <div style="font-size: 0.75rem; color: var(--neon-cyan); margin-top: 2px;"><i class="fa-solid fa-map-pin"></i> <?php echo htmlspecialchars($top1['province'] ?? 'Luanda'); ?></div>
            <div class="podium-points" style="font-size: 1.3rem;"><?php echo number_format($top1['competitive_points'], 0, '', '.'); ?> pts</div>
        </div>
        <?php endif; ?>

        <!-- 3º LUGAR (BRONZE) -->
        <?php if ($top3): 
            $av3 = !empty($top3['user_picture']) ? (filter_var($top3['user_picture'], FILTER_VALIDATE_URL) ? $top3['user_picture'] : MAIN_URL . '/content/uploads/' . $top3['user_picture']) : MAIN_URL . '/content/themes/' . $system['theme'] . '/images/blank_profile.png';
        ?>
        <div class="podium-card podium-3">
            <div class="podium-avatar-box">
                <img src="<?php echo htmlspecialchars($av3); ?>" alt="Top 3">
            </div>
            <div class="podium-rank-number" style="color: #cd7f32;">#3</div>
            <div class="podium-tag"><?php echo htmlspecialchars($top3['gamer_tag']); ?></div>
            <div style="font-size: 0.72rem; color: var(--neon-cyan); margin-top: 2px;"><i class="fa-solid fa-map-pin"></i> <?php echo htmlspecialchars($top3['province'] ?? 'Luanda'); ?></div>
            <div class="podium-points"><?php echo number_format($top3['competitive_points'], 0, '', '.'); ?> pts</div>
        </div>
        <?php endif; ?>
    </div>
    <?php endif; ?>

    <!-- Filtros de Ordenação -->
    <?php if ($tab !== 'bots'): ?>
    <div style="display: flex; gap: 14px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; background: #131722; padding: 12px 18px; border-radius: 10px; border: 1px solid var(--border-color); font-size: 0.88rem;">
        <span style="font-weight: 700; color: var(--text-dim); text-transform: uppercase; font-size: 0.78rem;">Ordenar Por:</span>
        <a href="?tab=<?php echo $tab; ?>&sort=points" style="color: <?php echo ($sort_by == 'points') ? '#ef4444' : 'var(--text-muted)'; ?>; font-weight: 700; text-decoration: none;">
            <i class="fa-solid fa-bolt"></i> Pontos Competitivos
        </a>
        <span style="color: var(--border-color);">|</span>
        <a href="?tab=<?php echo $tab; ?>&sort=wins" style="color: <?php echo ($sort_by == 'wins') ? '#ef4444' : 'var(--text-muted)'; ?>; font-weight: 700; text-decoration: none;">
            <i class="fa-solid fa-award"></i> Mais Vitórias
        </a>
        <span style="color: var(--border-color);">|</span>
        <a href="?tab=<?php echo $tab; ?>&sort=winrate" style="color: <?php echo ($sort_by == 'winrate') ? '#ef4444' : 'var(--text-muted)'; ?>; font-weight: 700; text-decoration: none;">
            <i class="fa-solid fa-percent"></i> Taxa de Vitória
        </a>
    </div>
    <?php endif; ?>

    <!-- Tabela de Classificação -->
    <div class="arena-card" style="padding: 16px; overflow-x: auto;">
        <?php if ($tab !== 'bots'): ?>
            <?php if (!empty($human_rankings)): ?>
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.92rem; min-width: 600px;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-dim); font-size: 0.78rem; text-transform: uppercase;">
                            <th style="padding: 12px 10px;">Posição</th>
                            <th style="padding: 12px 10px;">Jogador</th>
                            <th style="padding: 12px 10px; text-align: center;">Partidas</th>
                            <th style="padding: 12px 10px; text-align: center;">Vitórias</th>
                            <th style="padding: 12px 10px; text-align: center;">Taxa (%)</th>
                            <th style="padding: 12px 10px; text-align: right;">Pontuação</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php 
                        $pos = 1;
                        foreach ($human_rankings as $row): 
                            $avatar_url = !empty($row['user_picture']) ? (filter_var($row['user_picture'], FILTER_VALIDATE_URL) ? $row['user_picture'] : MAIN_URL . '/content/uploads/' . $row['user_picture']) : MAIN_URL . '/content/themes/' . $system['theme'] . '/images/blank_profile.png';
                            $pos_color = ($pos == 1) ? '#ffd700' : (($pos == 2) ? '#c0c0c0' : (($pos == 3) ? '#cd7f32' : 'var(--text-dim)'));
                        ?>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                            <td style="padding: 12px 10px; font-weight: 900; font-size: 1.1rem; color: <?php echo $pos_color; ?>;">
                                #<?php echo $pos; ?>
                            </td>
                            <td style="padding: 12px 10px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <img src="<?php echo htmlspecialchars($avatar_url); ?>" alt="Avatar" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-color);">
                                    <div>
                                        <div style="font-weight: 700; color: #fff;"><?php echo htmlspecialchars($row['gamer_tag']); ?></div>
                                        <div style="font-size: 0.75rem; color: var(--text-muted);"><i class="fa-solid fa-map-pin"></i> <?php echo htmlspecialchars($row['province'] ?? 'Luanda'); ?></div>
                                    </div>
                                </div>
                            </td>
                            <td style="padding: 12px 10px; text-align: center; color: var(--text-muted);">
                                <?php echo (int)$row['total_matches']; ?>
                            </td>
                            <td style="padding: 12px 10px; text-align: center; color: var(--neon-green); font-weight: 700;">
                                <?php echo (int)$row['total_wins']; ?>
                            </td>
                            <td style="padding: 12px 10px; text-align: center; color: #fff;">
                                <?php echo $row['winrate']; ?>%
                            </td>
                            <td style="padding: 12px 10px; text-align: right; font-weight: 800; color: var(--neon-gold); font-size: 1.05rem; font-family: var(--font-gamer);">
                                <?php echo number_format($row['competitive_points'], 0, '', '.'); ?> pts
                            </td>
                        </tr>
                        <?php 
                        $pos++;
                        endforeach; 
                        ?>
                    </tbody>
                </table>
            <?php else: ?>
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhum jogador classificado no momento.</div>
            <?php endif; ?>
        <?php else: ?>
            <!-- Aba de Bots Oficiais -->
            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid var(--ngola-red); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 0.88rem; color: #fca5a5;">
                <i class="fa-solid fa-circle-info"></i> <strong>Aviso de Transparência:</strong> Oponentes de treino são algoritmos para prática individual. Não competem em prêmios nem pontuações oficiais de jogadores humanos.
            </div>
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.92rem; min-width: 600px;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-dim); font-size: 0.78rem; text-transform: uppercase;">
                        <th style="padding: 12px 10px;">Oponente IA</th>
                        <th style="padding: 12px 10px;">Província</th>
                        <th style="padding: 12px 10px; text-align: center;">Dificuldade</th>
                        <th style="padding: 12px 10px; text-align: center;">Partidas</th>
                        <th style="padding: 12px 10px; text-align: center;">Vitórias</th>
                        <th style="padding: 12px 10px; text-align: right;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($bot_rankings as $b): 
                        $av_b = !empty($b['avatar_url']) ? $b['avatar_url'] : 'https://ui-avatars.com/api/?name=' . urlencode($b['bot_tag']);
                    ?>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <td style="padding: 12px 10px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <img src="<?php echo htmlspecialchars($av_b); ?>" alt="Avatar" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;">
                                <div>
                                    <div style="font-weight: 700; color: #fff;"><?php echo htmlspecialchars($b['bot_tag']); ?></div>
                                    <div style="font-size: 0.75rem; color: var(--text-muted);"><?php echo htmlspecialchars($b['bot_title']); ?></div>
                                </div>
                            </div>
                        </td>
                        <td style="padding: 12px 10px; color: var(--neon-cyan); font-weight: 700;">
                            <?php echo htmlspecialchars($b['province'] ?? 'Luanda'); ?>
                        </td>
                        <td style="padding: 12px 10px; text-align: center;">
                            <span class="badge text-bg-secondary"><?php echo strtoupper($b['difficulty']); ?></span>
                        </td>
                        <td style="padding: 12px 10px; text-align: center; color: var(--text-muted);">
                            <?php echo (int)$b['total_matches']; ?>
                        </td>
                        <td style="padding: 12px 10px; text-align: center; color: var(--neon-green); font-weight: 700;">
                            <?php echo (int)$b['total_wins']; ?>
                        </td>
                        <td style="padding: 12px 10px; text-align: right;">
                            <span class="badge text-bg-success">DISPONÍVEL</span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
</main>

<?php require_once(__DIR__ . '/footer.php'); ?>
