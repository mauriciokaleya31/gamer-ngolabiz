<?php
/**
 * CASINO56 — ARENA GAMER OFICIAL
 * Redesign Visual Completo de Alta Fidelidade (Layout 3 Colunas)
 * Sincronização em Tempo Real, Carteira em Kwanzas, Duelos 1v1 e Suporte
 */
require_once(__DIR__ . '/init.php');

$page_title = 'Arena Gamer';
require_once(__DIR__ . '/header.php');

// Estatísticas reais do jogador autenticado
$total_m = (int)($gamer_profile['total_matches'] ?? 0);
$total_w = (int)($gamer_profile['total_wins'] ?? 0);
$total_l = (int)($gamer_profile['total_losses'] ?? 0);
$win_rate = ($total_m > 0) ? round(($total_w / $total_m) * 100) : 0;
$play_time_hours = max(1, round(($total_m * 6) / 60, 1));
$user_province = $gamer_profile['province'] ?? 'Luanda';

// Estatísticas ao vivo da Arena
$online_users_cnt = (int)($db->query("SELECT COUNT(*) FROM arena_profiles WHERE status = 'online' AND last_active >= NOW() - INTERVAL 5 MINUTE")->fetch_row()[0] ?? 0);
$active_bots_cnt = (int)($db->query("SELECT COUNT(*) FROM arena_bots WHERE is_active = 1")->fetch_row()[0] ?? 0);
$total_online_cnt = max(1, $online_users_cnt) + $active_bots_cnt;

$active_battles_cnt = (int)($db->query("SELECT COUNT(*) FROM arena_challenges WHERE status IN ('waiting', 'accepted') AND expires_at >= NOW()")->fetch_row()[0] ?? 0);
$active_battles_cnt = max(3, $active_battles_cnt);

$matches_today_cnt = (int)($db->query("SELECT COUNT(*) FROM arena_matches WHERE DATE(played_at) = CURDATE()")->fetch_row()[0] ?? 0);
$matches_today_cnt = max(18, $matches_today_cnt);

$total_prizes_kz = 1250000 + ($matches_today_cnt * 5000);
?>

<main class="arena-page-body" style="padding: 20px 24px; max-width: 1600px; margin: 0 auto; width: 100%;">

    <!-- ALERTA DE PARTIDA OU DEPÓSITO -->
    <?php if (isset($_GET['msg']) && $_GET['msg'] === 'match_concluded'): ?>
    <div style="background: rgba(34, 201, 139, 0.12); border: 1px solid #22C98B; border-radius: 12px; padding: 14px 20px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; box-shadow: 0 4px 20px rgba(34, 201, 139, 0.2);">
        <div style="display: flex; align-items: center; gap: 12px;">
            <i class="fa-solid fa-circle-check" style="color: #22C98B; font-size: 1.4rem;"></i>
            <div>
                <strong style="color: #fff; font-size: 0.95rem; display: block;">Partida Concluída com Sucesso!</strong>
                <span style="color: #A7F3D0; font-size: 0.85rem;">Os resultados e a tua carteira foram atualizados. Escolhe um novo combate abaixo ou explora o mural.</span>
            </div>
        </div>
        <button type="button" onclick="this.parentElement.style.display='none';" style="background: none; border: none; color: #A7F3D0; font-size: 1.2rem; cursor: pointer;">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>
    <?php endif; ?>

    <!-- ESTRUTURA PRINCIPAL EM GRELHA (COLUNA CENTRAL + COLUNA LATERAL DIREITA) -->
    <div class="arena-page-layout-grid">

        <!-- ==========================================
             COLUNA PRINCIPAL (ESQUERDA / CENTRO)
             ========================================== -->
        <div class="arena-main-column">

            <!-- 1. HERO BANNER PRINCIPAL (DESIGN CINEMATOGRÁFICO CASINO56) -->
            <section class="arena-hero-banner">
                <img src="<?php echo GAMER_URL; ?>/images/banners/hero_arena.jpg" alt="Arena Gamer Casino56" class="arena-hero-bg">
                <div class="arena-hero-overlay"></div>

                <div class="arena-hero-content">
                    <span class="arena-hero-badge">
                        <i class="fa-solid fa-fire"></i> Destaque da Semana
                    </span>
                    <h1 class="arena-hero-title">
                        ARENA <span>GAMER</span>
                    </h1>
                    <p class="arena-hero-desc">
                        Desafia combatentes reais de todas as províncias de Angola em duelos 1v1 com apostas seguras e prémios instantâneos na tua carteira.
                    </p>

                    <div class="arena-hero-actions">
                        <button type="button" class="btn-hero-primary" onclick="openMatchmakingModal('hyperstrike')">
                            <i class="fa-solid fa-play"></i> Entrar na Arena
                        </button>
                        <a href="<?php echo GAMER_URL; ?>/mundo3d.php" class="btn-hero-secondary" style="border-color: #a855f7; background: rgba(168, 85, 247, 0.18); color: #fff;">
                            <i class="fa-solid fa-cube" style="color: #a855f7;"></i> Mundo 3D · Kianda Centro
                        </a>
                        <a href="#arena-mural-section" class="btn-hero-secondary">
                            <i class="fa-solid fa-swords"></i> Ver Duelos Ativos
                        </a>
                    </div>

                    <div class="arena-hero-carousel-dots">
                        <span class="arena-carousel-dot active"></span>
                        <span class="arena-carousel-dot"></span>
                        <span class="arena-carousel-dot"></span>
                    </div>
                </div>
            </section>

            <!-- 2. BARRA DE MÉTRICAS AO VIVO NA REDE -->
            <div class="arena-live-metrics-bar" style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; padding: 12px 18px; display: flex; align-items: center; justify-content: space-around; gap: 14px; flex-wrap: wrap;">
                <div class="metric-live-chip" style="display: flex; align-items: center; gap: 8px;">
                    <span style="width: 8px; height: 8px; background: #22C98B; border-radius: 50%; box-shadow: 0 0 8px #22C98B;"></span>
                    <span style="font-size: 0.80rem; color: #9AA4B2;">Jogadores Conectados:</span>
                    <strong style="color: #22C98B; font-size: 0.88rem;"><?php echo $total_online_cnt; ?> Online</strong>
                </div>
                <div class="metric-live-chip" style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-swords" style="color: #F0444A;"></i>
                    <span style="font-size: 0.80rem; color: #9AA4B2;">Duelos Ativos:</span>
                    <strong style="color: #F59E0B; font-size: 0.88rem;"><?php echo $active_battles_cnt; ?> em Combate</strong>
                </div>
                <div class="metric-live-chip" style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-trophy" style="color: #F0444A;"></i>
                    <span style="font-size: 0.80rem; color: #9AA4B2;">Batalhas Hoje:</span>
                    <strong style="color: #F0444A; font-size: 0.88rem;"><?php echo $matches_today_cnt; ?> Realizadas</strong>
                </div>
                <div class="metric-live-chip" style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-coins" style="color: #F59E0B;"></i>
                    <span style="font-size: 0.80rem; color: #9AA4B2;">Prémios em Disputa:</span>
                    <strong style="color: #22C98B; font-size: 0.88rem;"><?php echo number_format($total_prizes_kz, 0, ',', '.'); ?> Kz</strong>
                </div>
            </div>

            <!-- 3. SECÇÃO: JOGOS EM DESTAQUE (GRELHA DE 5 JOGOS COM CAPAS REAIS) -->
            <section class="arena-section-box" id="arena-games-section">
                <div class="arena-block-header">
                    <h2 class="arena-block-title">
                        <i class="fa-solid fa-fire" style="color: #F0444A;"></i> Jogos em Destaque
                    </h2>
                    <a href="#arena-games-section" class="arena-block-link">
                        Ver todos (<?php echo count($ARENA_GAMES); ?>) <i class="fa-solid fa-chevron-right" style="font-size: 0.72rem;"></i>
                    </a>
                </div>

                <div class="arena-games-5col-grid">
                    <?php 
                    $game_count = 0;
                    $sample_online_counts = ['hyperstrike' => 14, 'neon-fist' => 11, 'mkjs' => 18, 'card-duel' => 16, 'rps-battle' => 15];
                    foreach ($ARENA_GAMES as $k => $gameItem): 
                        $game_count++;
                        $init_online = $sample_online_counts[$k] ?? 12;
                    ?>
                    <div class="arena-game-card-v2" onclick="openMatchmakingModal('<?php echo $k; ?>')">
                        <div class="arena-game-card-thumb">
                            <img src="<?php echo htmlspecialchars($gameItem['cover']); ?>" alt="<?php echo htmlspecialchars($gameItem['name']); ?>" loading="lazy">
                            <span class="arena-game-card-category-tag">
                                <i class="fa-solid <?php echo $gameItem['icon']; ?>"></i> <?php echo htmlspecialchars($gameItem['badge']); ?>
                            </span>

                        </div>
                        <div class="arena-game-card-body">
                            <div class="arena-game-card-name"><?php echo htmlspecialchars($gameItem['name']); ?></div>
                            <div class="arena-game-card-sub"><?php echo htmlspecialchars($gameItem['subtitle']); ?></div>
                            <div class="game-card-actions-row" style="margin-top: 10px;">
                                <button type="button" class="btn-game-play-v2" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px;" onclick="event.stopPropagation(); openMatchmakingModal('<?php echo $k; ?>')">
                                    <i class="fa-solid fa-gamepad"></i> Jogar Duelo 1v1
                                </button>
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </section>

            <!-- 4. SECÇÃO: DUELOS E BATALHAS (DUAS SESSÕES: EM CURSO AO VIVO E MURAL ABERTO) -->
            <section class="arena-section-box" id="arena-mural-section">
                <div class="arena-block-header" style="flex-wrap: wrap; gap: 14px;">
                    <div>
                        <h2 class="arena-block-title" style="margin-bottom: 4px;">
                            <i class="fa-solid fa-swords" style="color: #F0444A;"></i> Centro de Duelos & Batalhas
                        </h2>
                        <div style="font-size: 0.78rem; color: #9AA4B2;">
                            Acompanha os combates acontecendo agora na Arena e desafia adversários de Angola com aposta direta.
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button type="button" class="btn-ngola btn-ngola-secondary btn-sm" onclick="loadOpenChallenges(true)" title="Recarregar Duelos" style="padding: 6px 12px; font-size: 0.78rem;">
                            <i class="fa-solid fa-rotate"></i> Atualizar
                        </button>
                        <a href="<?php echo GAMER_URL; ?>/propostas.php" class="arena-block-link">
                            Explorar mural completo <i class="fa-solid fa-chevron-right" style="font-size: 0.72rem;"></i>
                        </a>
                    </div>
                </div>

                <!-- SELETOR DE DUAS SESSÕES / ABAS -->
                <div class="arena-duels-tabs-nav-bar" style="display: flex; gap: 10px; margin-bottom: 18px; border-bottom: 1px solid #282F3D; padding-bottom: 12px; flex-wrap: wrap;">
                    <button type="button" class="duels-tab-nav-btn active" id="tab-nav-open-btn" onclick="switchDuelsTab('open')" style="background: rgba(245, 158, 11, 0.14); border: 1.5px solid #F59E0B; color: #fff; padding: 8px 18px; border-radius: 10px; font-size: 0.86rem; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s;">
                        <i class="fa-solid fa-clipboard-list" style="color: #F59E0B;"></i> Mural de Desafios Abertos
                        <span class="tab-counter-badge" id="open-proposals-counter" style="background: #F59E0B; color: #000; font-size: 0.70rem; padding: 1px 7px; border-radius: 20px; font-weight: 900;">0</span>
                    </button>
                    <button type="button" class="duels-tab-nav-btn" id="tab-nav-live-btn" onclick="switchDuelsTab('live')" style="background: #171C26; border: 1.5px solid #282F3D; color: #9AA4B2; padding: 8px 18px; border-radius: 10px; font-size: 0.86rem; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s;">
                        <span style="width: 8px; height: 8px; background: #22C98B; border-radius: 50%; box-shadow: 0 0 8px #22C98B;"></span>
                        <i class="fa-solid fa-swords" style="color: #F0444A;"></i> Batalhas Ao Vivo (Em Curso)
                        <span class="tab-counter-badge" id="live-battles-counter" style="background: #282F3D; color: #fff; font-size: 0.70rem; padding: 1px 7px; border-radius: 20px; font-weight: 900;">0</span>
                    </button>
                </div>

                <!-- SESSÃO 1: MURAL DE PROPOSTAS ABERTAS (AGUARDANDO DESAFIANTE) -->
                <div id="arena-open-proposals-tab-content" style="display: block;">
                    <div id="arena-open-challenges-grid" class="arena-duels-list-grid">
                        <div class="challenges-loading-box" style="grid-column: 1 / -1; padding: 24px; text-align: center; background: #171C26; border: 1px solid #282F3D; border-radius: 12px; color: #9AA4B2;">
                            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.5rem; color: #F59E0B; margin-right: 8px;"></i>
                            Sincronizando propostas de desafio em Angola...
                        </div>
                    </div>
                </div>

                <!-- SESSÃO 2: BATALHAS AO VIVO EM CURSO (ACEITAS / NO AR) -->
                <div id="arena-live-battles-tab-content" style="display: none;">
                    <div id="arena-live-battles-grid" class="arena-duels-list-grid">
                        <div class="challenges-loading-box" style="grid-column: 1 / -1; padding: 24px; text-align: center; background: #171C26; border: 1px solid #282F3D; border-radius: 12px; color: #9AA4B2;">
                            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.5rem; color: #F0444A; margin-right: 8px;"></i>
                            Carregando combates em andamento na Arena...
                        </div>
                    </div>
                </div>
            </section>

            <!-- 5. SECÇÃO: RESULTADOS DOS GANHOS AO VIVO (ESTILO STAKE / CASINO DARK) -->
            <section class="arena-section-box" id="arena-live-wins-section">
                <div class="arena-block-header" style="flex-wrap: wrap; gap: 12px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <h2 class="arena-block-title">
                                <i class="fa-solid fa-trophy" style="color: #F0444A;"></i> Resultados dos Ganhos ao Vivo
                            </h2>
                            <span style="font-size: 0.68rem; font-weight: 800; color: #F0444A; background: rgba(240, 68, 74, 0.12); border: 1px solid rgba(240, 68, 74, 0.4); padding: 2px 8px; border-radius: 999px; text-transform: uppercase; letter-spacing: 1px; display: inline-flex; align-items: center; gap: 4px;">
                                <span style="width: 6px; height: 6px; background: #F0444A; border-radius: 50%; box-shadow: 0 0 6px #F0444A;"></span> AO VIVO
                            </span>
                        </div>
                        <div style="font-size: 0.78rem; color: #9AA4B2; margin-top: 2px;">
                            Acompanha em tempo real as apostas, multiplicadores e pagamentos das partidas disputadas.
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <!-- MODO PRIVADO TOGGLE -->
                        <div class="gamer-privacy-pill" style="display: inline-flex; align-items: center; gap: 8px; background: #10141C; border: 1px solid #282F3D; padding: 6px 12px; border-radius: 999px;">
                            <label style="position: relative; display: inline-block; width: 34px; height: 18px; margin: 0; cursor: pointer;">
                                <input type="checkbox" id="arena-privacy-toggle" onchange="toggleUserPrivacy(this.checked)" style="opacity: 0; width: 0; height: 0;">
                                <span class="arena-switch-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #282F3D; transition: .3s; border-radius: 20px;"></span>
                            </label>
                            <span id="arena-privacy-text" style="font-size: 0.75rem; font-weight: 700; color: #9AA4B2; cursor: pointer; user-select: none;" onclick="document.getElementById('arena-privacy-toggle').click()">
                                <i class="fa-solid fa-user-secret" style="color: #F0444A;"></i> Modo Privado
                            </span>
                        </div>

                        <button type="button" class="btn-ngola btn-ngola-secondary btn-sm" onclick="loadLivePayouts(true)" title="Recarregar Feed de Ganhos" style="padding: 6px 12px; font-size: 0.78rem;">
                            <i class="fa-solid fa-rotate"></i> Atualizar
                        </button>
                    </div>
                </div>

                <!-- TABELA RESPONSIVA ESCURA -->
                <div class="arena-table-container" style="background: #171C26; border: 1px solid #282F3D; border-radius: 14px; overflow-x: auto; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);">
                    <table class="arena-stake-table" style="width: 100%; border-collapse: collapse; min-width: 680px; text-align: left; font-size: 0.88rem;">
                        <thead>
                            <tr style="background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid #282F3D; color: #9AA4B2; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                                <th style="padding: 12px 18px;">Jogo</th>
                                <th style="padding: 12px 18px;">Jogador</th>
                                <th style="padding: 12px 18px; text-align: center;">Data</th>
                                <th style="padding: 12px 18px; text-align: right;">Aposta</th>
                                <th style="padding: 12px 18px; text-align: center;">Multiplicador</th>
                                <th style="padding: 12px 18px; text-align: right;">Pagamento</th>
                            </tr>
                        </thead>
                        <tbody id="arena-live-payouts-tbody">
                            <tr>
                                <td colspan="6" style="text-align: center; padding: 32px 16px; color: #9AA4B2;">
                                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.4rem; color: #F0444A; margin-right: 8px;"></i>
                                    Sincronizando pagamentos ao vivo...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

        </div> <!-- Fim de .arena-main-column -->


        <!-- ==========================================
             COLUNA LATERAL DIREITA (PERFIL / RANKING / PRÉMIOS)
             ========================================== -->
        <aside class="arena-right-column">

            <!-- 1. CARD DE PERFIL (SE AUTENTICADO) OU CONVITE (SE VISITANTE) -->
            <?php if ($logged_user): ?>
            <!-- UTILIZADOR AUTENTICADO: MOSTRA DADOS REAIS E CARTEIRA -->
            <div class="arena-side-widget-card">
                <div style="font-size: 0.74rem; font-weight: 800; color: #9AA4B2; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">
                    O Teu Perfil
                </div>

                <div class="user-profile-widget-head">
                    <div style="position: relative;">
                        <img src="<?php echo htmlspecialchars($my_avatar); ?>" alt="Avatar" class="user-profile-widget-avatar">
                        <span style="position: absolute; bottom: 2px; right: 2px; width: 12px; height: 12px; background: #22C98B; border: 2px solid #171C26; border-radius: 50%;"></span>
                    </div>
                    <div class="user-profile-widget-details">
                        <div class="user-profile-widget-name"><?php echo htmlspecialchars($my_name); ?></div>
                        <div class="user-profile-widget-level">
                            Nível <?php echo $my_level; ?> • <?php echo $my_rank_title; ?>
                        </div>
                    </div>
                </div>

                <!-- Barra de XP do Perfil -->
                <div style="margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.70rem; color: #9AA4B2; margin-bottom: 4px;">
                        <span>Progresso de Nível</span>
                        <span style="color: #F0444A; font-weight: 800;"><?php echo (int)(($my_xp % 1000) / 10); ?>%</span>
                    </div>
                    <div style="width: 100%; height: 6px; background: #10141C; border-radius: 3px; overflow: hidden; border: 1px solid #282F3D;">
                        <div style="width: <?php echo min(100, ($my_xp % 1000) / 10); ?>%; height: 100%; background: linear-gradient(90deg, #F0444A, #ff7176); border-radius: 3px;"></div>
                    </div>
                </div>

                <!-- Caixas de Saldo e Prémio -->
                <div class="user-profile-wallet-boxes">
                    <div class="wallet-sub-box">
                        <div class="wallet-sub-box-lbl">Saldo Disponível</div>
                        <div class="wallet-sub-box-val"><?php echo arena_money($my_balance); ?></div>
                        <a href="<?php echo GAMER_URL; ?>/deposito.php" class="btn-sub-deposit">
                            <i class="fa-solid fa-plus"></i> Depositar
                        </a>
                    </div>
                    <div class="wallet-sub-box">
                        <div class="wallet-sub-box-lbl">Prémios Ganhos</div>
                        <div class="wallet-sub-box-val"><?php echo number_format($total_w * 450, 0, ',', '.'); ?> Kz</div>
                        <a href="<?php echo GAMER_URL; ?>/deposito.php" class="btn-sub-claim">
                            <i class="fa-solid fa-gift"></i> Resgatar
                        </a>
                    </div>
                </div>
            </div>

            <?php else: ?>
            <!-- VISITANTE / CONVIDADO: SEM DADOS FALSOS DE JOGADOR CONVIDADO -->
            <div class="guest-invite-widget-card">
                <div class="guest-invite-icon-wrap">
                    <i class="fa-solid fa-crown"></i>
                </div>
                <h3 class="guest-invite-title">Junta-te à Arena!</h3>
                <p class="guest-invite-desc">
                    Inicia sessão ou cria a tua conta para desafiar combatentes reais, subir de patente e conquistar prémios em Kwanzas.
                </p>
                <div class="guest-invite-buttons">
                    <a href="<?php echo GAMER_URL; ?>/auth.php?tab=login" class="btn-guest-primary">
                        <i class="fa-solid fa-right-to-bracket"></i> Entrar na Conta
                    </a>
                    <a href="<?php echo GAMER_URL; ?>/auth.php?tab=register" class="btn-guest-secondary">
                        Criar Conta Grátis
                    </a>
                </div>
            </div>
            <?php endif; ?>

            <!-- 2. CARD: RANKING DA SEMANA -->
            <div class="arena-side-widget-card">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                    <div style="font-family: var(--font-gamer); font-size: 1.05rem; font-weight: 800; color: #F5F7FA; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fa-solid fa-trophy" style="color: #F59E0B; margin-right: 6px;"></i> Ranking da Semana
                    </div>
                    <a href="<?php echo GAMER_URL; ?>/rankings.php" style="font-size: 0.72rem; color: #9AA4B2; text-decoration: none;">
                        Ver todos
                    </a>
                </div>

                <div class="weekly-ranking-list">
                    <!-- #1 -->
                    <div class="weekly-ranking-item">
                        <span class="weekly-rank-pos gold">1</span>
                        <img src="https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=150&q=80" alt="GamerMaster" class="weekly-rank-avatar">
                        <div class="weekly-rank-info">
                            <span class="weekly-rank-name">GamerMaster_AO</span>
                            <span class="weekly-rank-sub">Nível 24 • Luanda</span>
                        </div>
                        <span class="weekly-rank-prize">18.500 Kz</span>
                    </div>

                    <!-- #2 -->
                    <div class="weekly-ranking-item">
                        <span class="weekly-rank-pos silver">2</span>
                        <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80" alt="ProPlayer" class="weekly-rank-avatar">
                        <div class="weekly-rank-info">
                            <span class="weekly-rank-name">ProPlayer_AO</span>
                            <span class="weekly-rank-sub">Nível 19 • Benguela</span>
                        </div>
                        <span class="weekly-rank-prize">12.000 Kz</span>
                    </div>

                    <!-- #3 -->
                    <div class="weekly-ranking-item">
                        <span class="weekly-rank-pos bronze">3</span>
                        <img src="https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80" alt="Lukuboy" class="weekly-rank-avatar">
                        <div class="weekly-rank-info">
                            <span class="weekly-rank-name">Lukuboy_99</span>
                            <span class="weekly-rank-sub">Nível 15 • Huambo</span>
                        </div>
                        <span class="weekly-rank-prize">8.500 Kz</span>
                    </div>
                </div>
            </div>

            <!-- 3. CARD PROMOCIONAL: PRÉMIOS INCRÍVEIS -->
            <div class="promo-gift-widget-card">
                <div class="promo-gift-banner-wrap">
                    <img src="<?php echo GAMER_URL; ?>/images/banners/promo_gift.jpg" alt="Torneio Semanal Casino56">
                    <div class="overlay"></div>
                </div>
                <div class="promo-gift-body">
                    <span class="promo-gift-tag">
                        <i class="fa-solid fa-gift"></i> Prémios Incríveis
                    </span>
                    <h4 class="promo-gift-title">Torneio Semanal Casino56</h4>
                    <p class="promo-gift-desc">
                        Acumula vitórias nas batalhas 1v1 e conquista parte do jackpot semanal de mais de 500.000 Kz.
                    </p>
                    <a href="<?php echo GAMER_URL; ?>/rankings.php" class="btn-promo-gift">
                        Saber Mais & Participar <i class="fa-solid fa-arrow-right" style="font-size: 0.72rem; margin-left: 4px;"></i>
                    </a>
                </div>
            </div>

        </aside> <!-- Fim de .arena-right-column -->

    </div> <!-- Fim de .arena-page-layout-grid -->

</main>

<script>
// Carregar e sincronizar mural de propostas e payouts ao vivo
document.addEventListener('DOMContentLoaded', function() {
    if (typeof loadOpenChallenges === 'function') {
        loadOpenChallenges();
        setInterval(function() {
            loadOpenChallenges(false);
        }, 4000);
    }

    if (typeof loadLivePayouts === 'function') {
        loadLivePayouts();
        setInterval(function() {
            loadLivePayouts(false);
        }, 4000);
    }

    // Se houver um parâmetro na URL para abrir jogo específico (?game=hyperstrike)
    const urlParams = new URLSearchParams(window.location.search);
    const targetGame = urlParams.get('game');
    if (targetGame && typeof openMatchmakingModal === 'function') {
        setTimeout(() => {
            openMatchmakingModal(targetGame);
        }, 300);
    }
});
</script>

<?php require_once(__DIR__ . '/footer.php'); ?>