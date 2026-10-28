<?php
/**
 * NGOLABIZ ARENA - RODAPÉ MASTER, BOTTOM BAR MOBILE & MODAL DE MATCHMAKING
 * Regra Obrigatória: 1 Minuto (60s) de Janela de Aceite / Concentração Mútua
 * e Verificação Ativa de Conexão Entre os Dois Jogadores em Tempo Real
 */
if (!defined('ARENA_APP')) exit;
$current_page = basename($_SERVER['PHP_SELF'], '.php');
?>

    </div> <!-- Fim de .arena-main-content -->
</div> <!-- Fim de .arena-app-container -->

<!-- BARRA DE NAVEGAÇÃO INFERIOR PARA MOBILE (BOTTOM NAV) -->
<nav class="arena-mobile-bottom-nav">
    <a href="<?php echo GAMER_URL; ?>/index.php" class="bottom-nav-link <?php echo ($current_page == 'index') ? 'active' : ''; ?>">
        <i class="fa-solid fa-house"></i>
        <span>Início</span>
    </a>
    <a href="<?php echo MAIN_URL; ?>/wallet" class="bottom-nav-link" title="Carteira">
        <i class="fa-solid fa-wallet"></i>
        <span>Carteira</span>
    </a>
    <a href="<?php echo GAMER_URL; ?>/play.php" class="bottom-nav-link center-play <?php echo ($current_page == 'play') ? 'active' : ''; ?>" title="Jogar Agora">
        <i class="fa-solid fa-gamepad"></i>
    </a>
    <a href="<?php echo GAMER_URL; ?>/rankings.php" class="bottom-nav-link <?php echo ($current_page == 'rankings') ? 'active' : ''; ?>">
        <i class="fa-solid fa-trophy"></i>
        <span>Classificação</span>
    </a>
    <a href="<?php echo $logged_user ? GAMER_URL . '/profile.php' : GAMER_URL . '/auth.php?redirect=' . urlencode(GAMER_URL); ?>" class="bottom-nav-link <?php echo ($current_page == 'profile') ? 'active' : ''; ?>">
        <i class="fa-solid fa-user-ninja"></i>
        <span>Perfil</span>
    </a>
</nav>

<!-- MODAL DE RADAR & MATCHMAKING DE ANGOLA (APENAS JOGADORES ONLINE) -->
<div class="radar-modal-overlay" id="radar-matchmaking-modal">
    <div class="radar-modal-box" style="width: 100%; max-width: 580px; margin: auto; box-sizing: border-box; display: flex; flex-direction: column; background: #0f0f13; border: 1px solid rgba(239, 68, 68, 0.45); box-shadow: 0 0 50px rgba(0, 0, 0, 0.9), 0 0 35px rgba(239, 68, 68, 0.25); border: 1px solid rgba(239, 68, 68, 0.35); box-shadow: 0 0 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 22px; position: relative;">
        <div class="radar-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: 12px;">
            <div class="radar-header-title">
                <i class="fa-solid fa-satellite-dish" style="color: #ef4444;"></i>
                <span id="radar-game-title">JOGADORES ONLINE EM ANGOLA</span>
            </div>
            <button type="button" class="action-icon-btn" onclick="closeMatchmakingModal()" style="border-radius: 50%;">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <!-- 0. Seleção do Tipo de Jogo (Fluxo BATALHAR AGORA) -->
        <div id="modal-game-select-view" style="display: none; text-align: center; padding: 10px 0;">
            <div style="font-size: 0.82rem; color: #ef4444; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">
                SELEÇÃO DE COMBATE
            </div>
            <h2 style="font-family: var(--font-gamer); font-size: 1.55rem; font-weight: 800; color: #fff; margin-bottom: 6px;">
                QUAL É O JOGO QUE DESEJA BATALHAR?
            </h2>
            <p style="color: var(--text-dim); font-size: 0.85rem; max-width: 460px; margin: 0 auto 18px auto;">
                Escolha o jogo para prosseguir para a definição do valor da aposta:
            </p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 20px; text-align: left;">
                <!-- Jogo 1: Hyper-Strike -->
                <div class="game-select-tile" onclick="selectGameForBattle('hyperstrike', 'HYPER-STRIKE (Luta 2D Tática)')" style="background: rgba(18,24,36,0.92); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px; cursor: pointer; transition: all 0.25s ease;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #ef4444, #0284c7); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.2rem; flex-shrink: 0;">
                            <i class="fa-solid fa-bolt"></i>
                        </div>
                        <div>
                            <span class="badge" style="background: rgba(6,182,212,0.15); color: #ef4444; font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Luta Tática 2D</span>
                            <h4 style="color: #fff; font-family: var(--font-gamer); font-size: 1.05rem; margin: 2px 0 0 0;">HYPER-STRIKE</h4>
                        </div>
                    </div>
                    <div style="font-size: 0.77rem; color: var(--text-dim); line-height: 1.35; margin-bottom: 12px;">Combate 2D com combos e golpes especiais de Angola.</div>
                    <button type="button" class="btn-ngola btn-ngola-primary btn-sm" style="width: 100%; font-size: 0.8rem; padding: 7px; font-weight: 700;">
                        <i class="fa-solid fa-play"></i> Batalhar neste Jogo
                    </button>
                </div>

                <!-- Jogo 2: Neon Fist -->
                <div class="game-select-tile" onclick="selectGameForBattle('neon-fist', 'NEON FIST (Cyberpunk Beat\'em Up)')" style="background: rgba(18,24,36,0.92); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px; cursor: pointer; transition: all 0.25s ease;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #ec4899, #be185d); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.2rem; flex-shrink: 0;">
                            <i class="fa-solid fa-fist-raised"></i>
                        </div>
                        <div>
                            <span class="badge" style="background: rgba(236,72,153,0.15); color: #ec4899; font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Beat'em Up</span>
                            <h4 style="color: #fff; font-family: var(--font-gamer); font-size: 1.05rem; margin: 2px 0 0 0;">NEON FIST</h4>
                        </div>
                    </div>
                    <div style="font-size: 0.77rem; color: var(--text-dim); line-height: 1.35; margin-bottom: 12px;">Cyberpunk Beat'em Up com golpes rápidos e esquivas.</div>
                    <button type="button" class="btn-ngola btn-ngola-primary btn-sm" style="width: 100%; font-size: 0.8rem; padding: 7px; background: linear-gradient(135deg, #ec4899, #be185d); font-weight: 700;">
                        <i class="fa-solid fa-play"></i> Batalhar neste Jogo
                    </button>
                </div>

                <!-- Jogo 3: Mortal Kombat JS -->
                <div class="game-select-tile" onclick="selectGameForBattle('mkjs', 'MORTAL KOMBAT JS (Torneio Arcade)')" style="background: rgba(18,24,36,0.92); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px; cursor: pointer; transition: all 0.25s ease;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #eab308, #ca8a04); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.2rem; flex-shrink: 0;">
                            <i class="fa-solid fa-dragon"></i>
                        </div>
                        <div>
                            <span class="badge" style="background: rgba(234,179,8,0.15); color: #eab308; font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Arcade Kombat</span>
                            <h4 style="color: #fff; font-family: var(--font-gamer); font-size: 1.05rem; margin: 2px 0 0 0;">MK JS</h4>
                        </div>
                    </div>
                    <div style="font-size: 0.77rem; color: var(--text-dim); line-height: 1.35; margin-bottom: 12px;">Torneio clássico arcade adaptado para disputas 1v1.</div>
                    <button type="button" class="btn-ngola btn-ngola-primary btn-sm" style="width: 100%; font-size: 0.8rem; padding: 7px; background: linear-gradient(135deg, #eab308, #ca8a04); color: #000; font-weight: 800;">
                        <i class="fa-solid fa-play"></i> Batalhar neste Jogo
                    </button>
                </div>

                <!-- Jogo 4: Duelo de Cartas 1v1 -->
                <div class="game-select-tile" onclick="selectGameForBattle('card-duel', 'DUELO DE CARTAS 1v1 (Estratégia & Cartas)')" style="background: rgba(18,24,36,0.92); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px; cursor: pointer; transition: all 0.25s ease;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #a855f7, #7c3aed); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.2rem; flex-shrink: 0;">
                            <i class="fa-solid fa-layer-group"></i>
                        </div>
                        <div>
                            <span class="badge" style="background: rgba(168,85,247,0.15); color: #a855f7; font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Cartas 1v1</span>
                            <h4 style="color: #fff; font-family: var(--font-gamer); font-size: 1.05rem; margin: 2px 0 0 0;">CARTAS 1v1</h4>
                        </div>
                    </div>
                    <div style="font-size: 0.77rem; color: var(--text-dim); line-height: 1.35; margin-bottom: 12px;">Duelo de baralho, ataque, defesa e magia por turnos.</div>
                    <button type="button" class="btn-ngola btn-ngola-primary btn-sm" style="width: 100%; font-size: 0.8rem; padding: 7px; background: linear-gradient(135deg, #a855f7, #7c3aed); color: #fff; font-weight: 800;">
                        <i class="fa-solid fa-play"></i> Batalhar neste Jogo
                    </button>
                </div>

                <!-- Jogo 5: Pedra, Papel e Tesoura 1v1 -->
                <div class="game-select-tile" onclick="selectGameForBattle('rps-battle', 'PEDRA, PAPEL E TESOURA 1v1 (Jokenpô Arena)')" style="background: rgba(18,24,36,0.92); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px; cursor: pointer; transition: all 0.25s ease;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <div style="width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #22c98b, #059669); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.2rem; flex-shrink: 0;">
                            <i class="fa-solid fa-hand-back-fist"></i>
                        </div>
                        <div>
                            <span class="badge" style="background: rgba(34,201,139,0.15); color: #22c98b; font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Jokenpô 1v1</span>
                            <h4 style="color: #fff; font-family: var(--font-gamer); font-size: 1.05rem; margin: 2px 0 0 0;">PEDRA PAPEL TESOURA</h4>
                        </div>
                    </div>
                    <div style="font-size: 0.77rem; color: var(--text-dim); line-height: 1.35; margin-bottom: 12px;">Rodadas de 10 segundos com confronto simultâneo.</div>
                    <button type="button" class="btn-ngola btn-ngola-primary btn-sm" style="width: 100%; font-size: 0.8rem; padding: 7px; background: linear-gradient(135deg, #22c98b, #059669); color: #090B10; font-weight: 900;">
                        <i class="fa-solid fa-play"></i> Batalhar neste Jogo
                    </button>
                </div>
                
            </div>
        </div>

        <!-- 0. Escolha de Modo: Jogar Demo (Treino) ou Jogar com Alguém -->
        <div id="modal-mode-select-view" style="display: none; text-align: center; padding: 10px 0;">
            <div style="font-size: 0.82rem; color: #ef4444; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;" id="mode-select-game-badge">
                SELEÇÃO DE MODO
            </div>
            <h2 style="font-family: var(--font-gamer); font-size: 1.6rem; font-weight: 800; color: #fff; margin-bottom: 16px;" id="mode-select-game-title">
                ESCOLHA COMO DESEJA JOGAR
            </h2>

            <div class="modal-mode-cards-grid">
                <!-- Opção 1: Jogar Demo / Treino -->
                <div class="game-mode-card-btn demo-mode" onclick="startDemoMode()">
                    <div class="mode-card-icon cyan">
                        <i class="fa-solid fa-gamepad"></i>
                    </div>
                    <div class="mode-card-title">JOGAR DEMO</div>
                    <div style="font-size: 0.75rem; color: #ef4444; font-weight: 700; margin-bottom: 6px;">MODO TREINO SOLO</div>
                    <div class="mode-card-desc">
                        Pratique sozinho contra o computador para treinar combos, conhecer as regras e aprimorar técnicas sem risco e sem apostas.
                    </div>
                    <button type="button" class="btn-ngola btn-ngola-secondary btn-sm" style="margin-top: 14px; width: 100%;">
                        <i class="fa-solid fa-play"></i> Praticar Grátis
                    </button>
                </div>

                <!-- Opção 2: Jogar com Alguém / Batalha 1v1 -->
                <div class="game-mode-card-btn" onclick="startMultiplayerFlow()">
                    <div class="mode-card-icon purple">
                        <i class="fa-solid fa-swords"></i>
                    </div>
                    <div class="mode-card-title">JOGAR COM ALGUÉM</div>
                    <div style="font-size: 0.75rem; color: #ffffff; font-weight: 700; margin-bottom: 6px;">DUELO 1V1 COMPETITIVO</div>
                    <div class="mode-card-desc">
                        Desafie outros jogadores reais de Angola em tempo real com aposta em Kwanzas e disputa de pontos na classificação oficial!
                    </div>
                    <button type="button" class="btn-ngola btn-ngola-primary btn-sm" style="margin-top: 14px; width: 100%;">
                        <i class="fa-solid fa-bolt"></i> Definir Aposta & Batalhar
                    </button>
                </div>
            </div>
        </div>

        <!-- 0.1 Definição do Valor a Injetar / Aposta -->
        <div id="modal-bet-select-view" style="display: none; text-align: center; padding: 10px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <button type="button" class="btn-ngola btn-ngola-secondary btn-sm" onclick="backToGameSelect()" style="font-size: 0.78rem; padding: 5px 12px; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-arrow-left"></i> Trocar Jogo
                </button>
                <div style="font-size: 0.78rem; color: #ffffff; letter-spacing: 1px; text-transform: uppercase; font-weight: 700;">
                    VALOR DA BATALHA
                </div>
            </div>
            <h2 style="font-family: var(--font-gamer); font-size: 1.5rem; font-weight: 800; color: #fff; margin-bottom: 4px;">
                QUAL É O VALOR QUE PRETENDE INJETAR?
            </h2>
            <div id="bet-modal-game-name" style="font-size: 0.95rem; font-weight: 800; color: #ef4444; margin-bottom: 6px;">
                HYPER-STRIKE (Luta 2D Tática)
            </div>
            <p style="color: var(--text-muted); font-size: 0.86rem; max-width: 440px; margin: 0 auto 16px auto;">
                Ambos os jogadores apostam o mesmo valor. O vencedor do duelo leva o prêmio líquido com a taxa já deduzida!
            </p>

            <!-- Saldo Disponível Real -->
            <?php 
                $real_balance_display = (float)($logged_user['user_wallet_balance'] ?? 0);
            ?>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 16px; display: inline-flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <i class="fa-solid fa-wallet text-warning" style="font-size: 1.1rem; color: #ffffff;"></i>
                <span style="font-size: 0.85rem; color: var(--text-muted);">Saldo Disponível na Carteira:</span>
                <strong id="modal-real-wallet-display" style="color: #fff; font-family: var(--font-gamer); font-size: 1.15rem; color: #ffffff;">
                    <?php echo number_format($real_balance_display, 2, ',', '.'); ?> Kz
                </strong>
            </div>

            <!-- Alerta Dinâmico de Saldo Insuficiente + Botão de Depósito -->
            <div id="bet-insufficient-funds-alert" style="<?php echo ($real_balance_display <= 0) ? 'display: block;' : 'display: none;'; ?> background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.4); border-radius: 8px; padding: 12px 16px; max-width: 460px; margin: 0 auto 16px auto; text-align: center;">
                <div style="color: #ef4444; font-weight: 800; font-size: 0.92rem; margin-bottom: 4px;">
                    <i class="fa-solid fa-circle-exclamation"></i> Saldo Insuficiente na Carteira!
                </div>
                <div style="font-size: 0.8rem; color: #fecaca; margin-bottom: 10px; line-height: 1.4;" id="bet-funds-msg">
                    Você não possui saldo suficiente para injetar este valor na batalha. Recarregue a sua carteira NgolaBiz para duelar valendo dinheiro.
                </div>
                <a href="<?php echo GAMER_URL; ?>/deposito.php" class="btn-ngola btn-ngola-primary btn-sm" style="background: linear-gradient(135deg, #ef4444, #dc2626); box-shadow: 0 0 15px rgba(239,68,68,0.4); text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-credit-card"></i> Fazer Depósito Agora
                </a>
            </div>

            <!-- Valores Rápidos de Aposta -->
            <div class="bet-pills-row">
                
                <button type="button" class="bet-pill-btn active" onclick="selectQuickBet(500, this)">500 Kz</button>
                <button type="button" class="bet-pill-btn" onclick="selectQuickBet(1000, this)">1.000 Kz</button>
                <button type="button" class="bet-pill-btn" onclick="selectQuickBet(2500, this)">2.500 Kz</button>
                <button type="button" class="bet-pill-btn" onclick="selectQuickBet(5000, this)">5.000 Kz</button>
                <button type="button" class="bet-pill-btn" onclick="selectQuickBet(10000, this)">10.000 Kz</button>
            </div>

            <!-- Inserção de Valor Personalizado -->
            <div style="max-width: 320px; margin: 0 auto 16px auto;">
                <label style="display: block; font-size: 0.8rem; color: var(--text-dim); margin-bottom: 6px;">Ou digite outro valor personalizado (Kz):</label>
                <div style="position: relative;">
                    <input type="number" id="input-custom-bet" value="500" min="500" step="500" class="form-control" style="background: #121722; border: 1px solid var(--border-subtle); color: #ffffff; font-family: var(--font-gamer); font-size: 1.25rem; font-weight: 800; text-align: center; border-radius: var(--radius-sm); padding: 10px;" oninput="onCustomBetInput(this.value)">
                </div>
            </div>

            <!-- Estimativa do Prêmio Total -->
            <div id="bet-prize-calc-box" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 10px 16px; max-width: 380px; margin: 0 auto 20px auto; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.82rem; color: var(--text-dim);">Prêmio do Vencedor:</span>
                <strong id="bet-calculated-prize-txt" style="color: #10b981; font-family: var(--font-gamer); font-size: 1.2rem;">1.000 Kz</strong>
            </div>

            <!-- Botões de Ação -->
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="closeMatchmakingModal()" style="padding: 10px 18px;">
                    <i class="fa-solid fa-xmark"></i> Fechar
                </button>
                <button type="button" id="btn-modal-main-play-action" class="btn-ngola btn-ngola-primary" onclick="handleMainModalPlayClick()" style="background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); padding: 10px 22px; font-size: 0.92rem; font-weight: 800;">
                    <i class="fa-solid fa-bolt"></i> JOGAR AGORA (BUSCAR ADVERSÁRIO)
                </button>
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="launchProposalToMural()" style="border-color: rgba(245, 158, 11, 0.5); color: #fde68a; padding: 10px 18px; font-size: 0.88rem;">
                    <i class="fa-solid fa-paper-plane"></i> Lançar no Mural
                </button>
            </div>
        </div>

        <!-- 0.2 Visão de Espera da Proposta Lançada no Mural (Ciclo Oficial de 1 Minuto) -->
        <div id="radar-open-proposal-view" style="display: none; text-align: center; padding: 10px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 10px 16px; margin-bottom: 16px; font-size: 0.85rem;">
                <div>
                    <span style="color: var(--text-dim);">Jogo:</span> <strong style="color: #fff;" id="mural-wait-game-txt">HYPER-STRIKE</strong>
                </div>
                <div>
                    <span style="color: var(--text-dim);">Aposta:</span> <strong style="color: #ffffff; font-family: var(--font-gamer); font-size: 1.05rem;" id="mural-wait-bet-txt">500 Kz</strong>
                </div>
                <div>
                    <span style="color: var(--text-dim);">Prêmio Líquido:</span> <strong style="color: #10b981; font-family: var(--font-gamer); font-size: 1.05rem;" id="mural-wait-prize-txt">900 Kz</strong>
                </div>
            </div>

            <!-- CRONÔMETRO REGRESSIVO OFICIAL DE 1 MINUTO -->
            <div id="mural-wait-countdown-box" style="margin: 10px 0 16px 0; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 12px;">
                <div style="font-size: 0.75rem; color: #fde68a; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
                    <i class="fa-solid fa-stopwatch"></i> DURAÇÃO DA PROPOSTA NO MURAL: 1 MINUTO
                </div>
                <div id="mural-wait-timer-val" style="font-family: var(--font-gamer); font-size: 2.5rem; font-weight: 900; color: #ffffff; text-shadow: 0 0 15px rgba(245, 158, 11, 0.6); margin: 2px 0;">
                    60s
                </div>
                <div style="font-size: 0.72rem; color: var(--text-dim);">
                    Se nenhum combatente aceitar até zerar, a proposta expira e você poderá lançar outra imediatamente.
                </div>
            </div>

            <div class="radar-sonar-container" id="mural-sonar-active-wrap">
                <div class="radar-sonar-disc">
                    <div class="radar-sonar-sweep"></div>
                    <div class="radar-center-icon">
                        <i class="fa-solid fa-satellite-dish" style="color: #ef4444;"></i>
                    </div>
                </div>
                <div class="radar-status-msg" id="mural-wait-status-text" style="font-size: 1.05rem; font-weight: 800; color: #fff; margin-top: 15px;">
                    Proposta lançada no mural! Aguardando oponente aceitar a batalha...
                </div>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 6px;">
                    Sua proposta está visível publicamente no mural ao vivo para todos os jogadores.
                </div>
            </div>

            <!-- CONTAINER EXIBIDO QUANDO EXPIRAR (1 MINUTO PASSOU) -->
            <div id="mural-proposal-expired-box" style="display: none; padding: 16px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 12px; margin-top: 10px;">
                <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(239, 68, 68, 0.2); color: #ef4444; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; margin: 0 auto 10px auto;">
                    <i class="fa-solid fa-hourglass-end"></i>
                </div>
                <h4 style="color: #fff; font-size: 1.15rem; font-weight: 800; margin: 0 0 6px 0;">PROPOSTA EXPIRADA (1 MINUTO)</h4>
                <p style="font-size: 0.85rem; color: #cbd5e1; margin: 0 0 16px 0; line-height: 1.4;">
                    O prazo de 1 minuto encerrou sem que outro jogador aceitasse o duelo.<br>
                    O saldo da sua carteira permanece 100% intacto. Você pode criar outra proposta agora!
                </p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button type="button" class="btn-launch-hero" onclick="restartCreateProposal()" style="padding: 10px 20px; font-size: 0.9rem; background: linear-gradient(135deg, #ef4444, #0284c7);">
                        <i class="fa-solid fa-plus"></i> CRIAR NOVA PROPOSTA
                    </button>
                    <button type="button" class="btn-ngola btn-ngola-secondary" onclick="closeMatchmakingModal()">
                        <i class="fa-solid fa-xmark"></i> Fechar
                    </button>
                </div>
            </div>

            <!-- COMBATENTES QUE PRETENDEM BATALHAR (ESCOLHA MANUAL RÁPIDA) -->
            <div id="mural-interested-opponents-box" style="margin-top: 18px; text-align: left; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="font-size: 0.8rem; font-weight: 800; color: #ef4444; letter-spacing: 0.5px; text-transform: uppercase;">
                        <i class="fa-solid fa-users-viewfinder"></i> COMBATENTES QUE PRETENDEM BATALHAR:
                    </div>
                    <span style="font-size: 0.72rem; color: var(--text-dim);">Escolha para duelar já</span>
                </div>
                <div id="mural-candidates-list" style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="text-align: center; color: var(--text-dim); font-size: 0.78rem; padding: 10px;">
                        <i class="fa-solid fa-circle-notch fa-spin"></i> Localizando combatentes disponíveis...
                    </div>
                </div>
            </div>

            <div style="margin-top: 24px; display: flex; justify-content: center; gap: 10px;" id="mural-wait-cancel-wrap">
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="cancelMyOpenChallenge()">
                    <i class="fa-solid fa-ban"></i> Cancelar Proposta
                </button>
            </div>
        </div>

        <!-- 1. Visão de Busca no Radar -->
        <div id="radar-search-view" style="display: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 8px 14px; margin-bottom: 14px; font-size: 0.85rem;">
                <div>
                    <span style="color: var(--text-dim);">Jogo:</span> <strong style="color: #fff;" id="radar-current-game-txt">HYPER-STRIKE</strong>
                </div>
                <div>
                    <span style="color: var(--text-dim);">Aposta:</span> <strong style="color: #ffffff; font-family: var(--font-gamer); font-size: 1.05rem;" id="radar-current-bet-txt">500 Kz</strong>
                </div>
                <button type="button" class="btn-ngola btn-ngola-secondary btn-sm" onclick="backToBetSelect()" style="padding: 3px 10px; font-size: 0.75rem;">
                    Alterar Aposta
                </button>
            </div>

            <div class="radar-sonar-container">
                <div class="radar-sonar-disc">
                    <div class="radar-sonar-sweep"></div>
                    <div class="radar-center-icon">
                        <i class="fa-solid fa-location-crosshairs"></i>
                    </div>
                </div>
                <div class="radar-status-msg" id="radar-status-text">Buscando jogadores online na plataforma...</div>
            </div>

            <!-- Filtro de Províncias de Angola -->
            <div class="radar-provinces-filter" id="radar-provinces-filter">
                <button type="button" class="radar-prov-btn active" onclick="filterRadarProvince('')">Todas</button>
                <button type="button" class="radar-prov-btn" onclick="filterRadarProvince('Luanda')">Luanda</button>
                <button type="button" class="radar-prov-btn" onclick="filterRadarProvince('Benguela')">Benguela</button>
                <button type="button" class="radar-prov-btn" onclick="filterRadarProvince('Huambo')">Huambo</button>
                <button type="button" class="radar-prov-btn" onclick="filterRadarProvince('Huíla')">Huíla</button>
                <button type="button" class="radar-prov-btn" onclick="filterRadarProvince('Cabinda')">Cabinda</button>
                <button type="button" class="radar-prov-btn" onclick="filterRadarProvince('Cuanza Sul')">Cuanza Sul</button>
                <button type="button" class="radar-prov-btn" onclick="filterRadarProvince('Malanje')">Malanje</button>
            </div>

            <!-- Grid de Oponentes Encontrados -->
            <div class="opponents-grid" id="radar-opponents-list">
                <!-- Preenchido dinamicamente via JS -->
            </div>
        </div>

        <!-- 2. Tela de Confronto VS (Janela de 1 Minuto & Verificação Mútua) -->
        <div class="vs-battle-screen" id="radar-vs-view" style="display: none; width: 100%; max-width: 100%; box-sizing: border-box; overflow-x: hidden;">
            <div class="vs-avatars-row" style="display: flex; align-items: center; justify-content: center; gap: 16px; width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="vs-player-box" style="display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 160px; min-width: 0;">
                    <img src="<?php echo htmlspecialchars($my_avatar); ?>" alt="Você" class="vs-avatar-lg" style="width: 80px !important; height: 80px !important; min-width: 80px !important; max-width: 80px !important; min-height: 80px !important; max-height: 80px !important; border-radius: 50% !important; object-fit: cover !important; border: 3px solid var(--neon-purple); box-shadow: 0 0 20px rgba(124, 58, 237, 0.45); display: block; margin-bottom: 8px;">
                    <div style="font-family: var(--font-gamer); font-size: 1.15rem; font-weight: 800; color: #fff; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <?php echo htmlspecialchars($my_name); ?>
                    </div>
                    <div style="font-size: 0.78rem; color: #ef4444;">
                        <i class="fa-solid fa-map-pin"></i> <?php echo htmlspecialchars($gamer_profile['province'] ?? 'Luanda'); ?>
                    </div>
                </div>

                <div class="vs-badge-text" style="font-family: var(--font-gamer); font-size: 2.2rem; font-weight: 900; color: #ef4444; text-shadow: 0 0 15px rgba(239, 68, 68, 0.7); flex-shrink: 0; padding: 0 6px;">VS</div>

                <div class="vs-player-box" style="display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 160px; min-width: 0;">
                    <img src="" id="vs-opp-avatar" alt="Oponente" class="vs-avatar-lg" style="width: 80px !important; height: 80px !important; min-width: 80px !important; max-width: 80px !important; min-height: 80px !important; max-height: 80px !important; border-radius: 50% !important; object-fit: cover !important; border: 3px solid #ef4444; box-shadow: 0 0 20px rgba(6, 182, 212, 0.45); display: block; margin-bottom: 8px;">
                    <div style="font-family: var(--font-gamer); font-size: 1.15rem; font-weight: 800; color: #fff; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" id="vs-opp-name">
                        Oponente
                    </div>
                    <div style="font-size: 0.78rem; color: #ffffff;" id="vs-opp-province">
                        <i class="fa-solid fa-map-pin"></i> Angola
                    </div>
                </div>
            </div>

            <!-- Status de Conexão Mútua -->
            <div class="mutual-status-pills">
                <div class="mutual-status-pill online" id="vs-my-conn-status">
                    <i class="fa-solid fa-circle-dot"></i> Você: Conectado
                </div>
                <div class="mutual-status-pill waiting" id="vs-opp-conn-status">
                    <i class="fa-solid fa-circle-notch fa-spin"></i> Adversário: Notificado (Aguardando Aceite)
                </div>
            </div>

            <!-- Contador de 60 Segundos (1 Minuto para Concentração/Aceite) -->
            <div class="vs-countdown-timer-box">
                <div class="vs-countdown-timer-num" id="vs-countdown-num">60s</div>
                <div class="vs-timer-progress-wrap">
                    <div class="vs-timer-progress-fill" id="vs-timer-progress-bar" style="width: 100%;"></div>
                </div>
            </div>

            <div style="color: var(--text-muted); font-size: 0.92rem; margin-bottom: 16px; text-align: center; max-width: 420px; line-height: 1.4;" id="vs-status-desc">
                Desafio enviado! O adversário tem até 1 minuto para se concentrar e aceitar o duelo.
            </div>

            <!-- Ações do Desafio -->
            <div id="vs-actions-wrap" style="display: flex; gap: 10px; justify-content: center; width: 100%;">
                <button type="button" class="btn-ngola btn-ngola-secondary" onclick="cancelActiveChallenge()" id="vs-cancel-btn">
                    <i class="fa-solid fa-ban"></i> Cancelar Desafio
                </button>
                <button type="button" class="btn-ngola btn-ngola-primary" onclick="returnToRadarSearch()" id="vs-retry-btn" style="display: none;">
                    <i class="fa-solid fa-arrow-left"></i> Voltar ao Radar
                </button>
            </div>
        </div>
    </div>
</div>

<!-- MODAL TOAST: NOTIFICAÇÃO DE DESAFIO RECEBIDO DE OUTRO JOGADOR -->
<div class="modal-over-overlay" id="incoming-challenge-modal">
    <div class="modal-over-card" style="text-align: center; max-width: 420px;">
        <div style="font-size: 2.5rem; color: #ffffff; margin-bottom: 10px;">⚔️</div>
        <h3 style="font-family: var(--font-gamer); font-size: 1.4rem; font-weight: 800; color: #fff; margin-bottom: 4px;">DESAFIO DE BATALHA RECEBIDO!</h3>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 16px;">Um jogador conectou-se e convocou você para duelo.</p>

        <div style="display: flex; align-items: center; justify-content: center; gap: 14px; background: #121722; padding: 12px; border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 16px;">
            <img src="" id="inc-challenger-avatar" alt="Avatar" style="width: 46px; height: 46px; border-radius: 50%; object-fit: cover; border: 2px solid #ef4444;">
            <div style="text-align: left;">
                <strong style="color: #fff; font-size: 1rem; display: block;" id="inc-challenger-name">Jogador</strong>
                <span style="font-size: 0.78rem; color: #ef4444;" id="inc-challenger-prov"><i class="fa-solid fa-map-pin"></i> Angola</span>
            </div>
        </div>

        <div style="font-family: var(--font-gamer); font-size: 1.6rem; font-weight: 800; color: #ffffff; margin-bottom: 16px;" id="inc-countdown-txt">
            59s restantes
        </div>

        <div style="display: flex; gap: 10px; justify-content: center;">
            <button type="button" class="btn-ngola btn-ngola-secondary" onclick="declineIncomingChallenge()">
                <i class="fa-solid fa-xmark"></i> Recusar
            </button>
            <button type="button" class="btn-ngola btn-ngola-primary" onclick="acceptIncomingChallenge()">
                <i class="fa-solid fa-swords"></i> Aceitar Batalha
            </button>
        </div>
    </div>
</div>

<!-- MODAL GAMER PROFISSIONAL DE DIÁLOGO E CONFIRMAÇÃO (SEM POPUPS BRANCOS DO NAVEGADOR) -->
<div class="radar-modal-overlay" id="arena-custom-dialog-modal" style="display: none; z-index: 10000;">
    <div class="radar-modal-box" style="text-align: center; max-width: 440px; border: 2px solid #ef4444; box-shadow: 0 10px 40px rgba(239, 68, 68, 0.25);">
        <div id="arena-dialog-icon-wrap" style="width: 58px; height: 58px; border-radius: 50%; background: rgba(239,68,68,0.15); display: inline-flex; align-items: center; justify-content: center; font-size: 1.6rem; color: #ef4444; margin: 0 auto 12px auto;">
            <i class="fa-solid fa-swords" id="arena-dialog-icon"></i>
        </div>
        <h3 id="arena-dialog-title" style="font-family: var(--font-gamer); font-size: 1.35rem; font-weight: 800; color: #fff; margin-bottom: 8px;">
            CONFIRMAR DUELO
        </h3>
        <div id="arena-dialog-body" style="color: #cbd5e1; font-size: 0.9rem; line-height: 1.5; margin-bottom: 20px;">
        </div>
        <div id="arena-dialog-actions" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js"></script>
<script src="<?php echo GAMER_URL; ?>/assets/js/arena-audio.js?v=<?php echo time(); ?>"></script>

<script>
// Resolução Segura e Dinâmica da URL da API da Arena NgolaBiz
function getArenaApiEndpoint(action, extraParams = '') {
    let base = window.__ARENA_BASE_URL;
    if (!base || base.indexOf(window.location.origin) === -1) {
        let p = window.location.pathname;
        base = window.location.origin + (p.indexOf('/gamer') === 0 ? '/gamer' : '');
    }
    let url = `${base}/api.php?action=${encodeURIComponent(action)}`;
    if (extraParams) url += '&' + extraParams;
    return url;
}

function toggleArenaSidebar(open) {
    const sidebar = document.getElementById('arena-sidebar');
    if (sidebar) {
        if (open) sidebar.classList.add('open');
        else sidebar.classList.remove('open');
    }
}

function handleArenaGlobalSearch(query) {
    if (!query) return;
}

let activeRadarGame = 'hyperstrike';
let activeRadarProvince = '';
let selectedBetAmount = 500;
let currentChallengeToken = null;
let challengePollInterval = null;
let challengeTimerInterval = null;
let remainingSeconds = 60;
let incomingChallengeToken = null;
let incomingPollInterval = null;

const ARENA_GAME_TITLES = {
    'hyperstrike': 'HYPER-STRIKE (Luta 2D Tática)',
    'neon-fist': 'NEON FIST (Cyberpunk Beat\'em Up)',
    'mkjs': 'MORTAL KOMBAT JS (Torneio Arcade)',
    'card-duel': 'DUELO DE CARTAS 1v1 (Estratégia & Cartas)',
    'rps-battle': 'PEDRA, PAPEL E TESOURA 1v1 (Jokenpô Arena)'
};

function openMatchmakingModal(gameKey) {
    if (!window.__ARENA_LOGGED_USER) {
        window.location.href = (window.__ARENA_BASE_URL || '/gamer') + '/auth.php?tab=login&notice=login_to_play';
        return;
    }
    if (!window.__ARENA_USER_VERIFIED) {
        window.location.href = (window.__ARENA_BASE_URL || '/gamer') + '/verificacao.php?notice=play_requires_kyc';
        return;
    }
    const modal = document.getElementById('radar-matchmaking-modal');
    const gameSelectView = document.getElementById('modal-game-select-view');
    const modeSelectView = document.getElementById('modal-mode-select-view');
    const betSelectView = document.getElementById('modal-bet-select-view');
    const searchView = document.getElementById('radar-search-view');
    const vsView = document.getElementById('radar-vs-view');
    const openProposalView = document.getElementById('radar-open-proposal-view');
    
    if (searchView) searchView.style.display = 'none';
    if (vsView) vsView.style.display = 'none';
    if (openProposalView) openProposalView.style.display = 'none';
    if (modeSelectView) modeSelectView.style.display = 'none';
    if (gameSelectView) gameSelectView.style.display = 'none';

    // Determinar o jogo clicado (ex: hyperstrike, neon-fist, mkjs)
    let targetGame = gameKey;
    if (!targetGame || !ARENA_GAME_TITLES[targetGame]) {
        targetGame = (activeRadarGame && ARENA_GAME_TITLES[activeRadarGame]) ? activeRadarGame : 'hyperstrike';
    }

    // Seguir rigorosamente o padrão NgolaBiz: ABRIR SEMPRE DIRETO NA TELA DE APOSTA / VALOR A INJETAR!
    selectGameForBattle(targetGame, ARENA_GAME_TITLES[targetGame]);

    if (modal) modal.classList.add('active');
    if (window.arenaAudio) window.arenaAudio.playEnter();
}

function selectGameForBattle(gameKey, gameTitle) {
    const validGames = Object.keys(ARENA_GAME_TITLES);
    activeRadarGame = (gameKey && validGames.includes(gameKey)) ? gameKey : 'hyperstrike';
    
    const gameSelectView = document.getElementById('modal-game-select-view');
    const betSelectView = document.getElementById('modal-bet-select-view');
    const gameNameEl = document.getElementById('bet-modal-game-name');
    const modalTitleEl = document.getElementById('radar-game-title');
    
    if (gameNameEl && gameTitle) {
        gameNameEl.innerText = gameTitle;
    }
    if (modalTitleEl && gameTitle) {
        modalTitleEl.innerText = `DUELO: ${gameTitle.toUpperCase()}`;
    }

    if (gameSelectView) gameSelectView.style.display = 'none';
    if (betSelectView) betSelectView.style.display = 'block';
    
    refreshMyWalletBalance();
    updatePrizeDisplay();
    if (window.arenaAudio) window.arenaAudio.playClick();
}

function backToGameSelect() {
    const gameSelectView = document.getElementById('modal-game-select-view');
    const betSelectView = document.getElementById('modal-bet-select-view');
    if (betSelectView) betSelectView.style.display = 'none';
    if (gameSelectView) gameSelectView.style.display = 'block';
    if (window.arenaAudio) window.arenaAudio.playClick();
}

function startDemoMode() {
    if (window.arenaAudio) window.arenaAudio.playClick();
    startMultiplayerFlow();
}

let userWalletBalance = <?php echo (float)($logged_user['user_wallet_balance'] ?? 0); ?>;

function refreshMyWalletBalance() {
    fetch(window.__ARENA_BASE_URL + '/api.php?action=get_my_wallet', { credentials: 'include' })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.status === 'ok') {
                userWalletBalance = parseFloat(data.wallet_balance);
                var el = document.getElementById('modal-real-wallet-display');
                if (el) el.textContent = data.formatted;
                checkBetBalanceWarning();
            }
        }).catch(function(e) {});
}

// 2. Modo Jogar com Alguém: Abre a Tela de Definição do Valor a Injetar
function startMultiplayerFlow() {
    refreshMyWalletBalance();
    const modeSelectView = document.getElementById('modal-mode-select-view');
    const betSelectView = document.getElementById('modal-bet-select-view');
    if (modeSelectView) modeSelectView.style.display = 'none';
    if (betSelectView) betSelectView.style.display = 'block';
    updatePrizeDisplay();
    if (window.arenaAudio) window.arenaAudio.playClick();
}

// ==========================================
// SISTEMA DE DIÁLOGOS E CONFIRMAÇÕES DA ARENA (SEM POPUPS NATIVOS DE BROWSER)
// ==========================================
let arenaDialogConfirmCallback = null;

function showArenaConfirm(options) {
    const modal = document.getElementById('arena-custom-dialog-modal');
    const titleEl = document.getElementById('arena-dialog-title');
    const bodyEl = document.getElementById('arena-dialog-body');
    const iconEl = document.getElementById('arena-dialog-icon');
    const actionsEl = document.getElementById('arena-dialog-actions');
    if (!modal) return;

    if (titleEl) titleEl.innerText = options.title || 'CONFIRMAR DUELO';
    if (bodyEl) bodyEl.innerHTML = options.html || '';
    if (iconEl) iconEl.className = options.icon || 'fa-solid fa-swords';

    arenaDialogConfirmCallback = options.onConfirm || null;

    actionsEl.innerHTML = `
        <button type="button" class="btn-ngola btn-ngola-secondary" onclick="closeArenaDialog()" style="padding: 10px 18px;">
            <i class="fa-solid fa-xmark"></i> ${options.cancelText || 'Cancelar'}
        </button>
        <button type="button" class="btn-ngola btn-ngola-primary" onclick="confirmArenaDialog()" style="${options.confirmStyle || 'background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 0 15px rgba(16,185,129,0.35);'} padding: 10px 22px; font-weight: 800;">
            <i class="fa-solid fa-check"></i> ${options.confirmText || 'Confirmar'}
        </button>
    `;

    modal.style.display = 'flex';
    modal.classList.add('active');
}

function showArenaAlert(title, message, icon = 'fa-solid fa-circle-exclamation', btnText = 'Entendido') {
    const modal = document.getElementById('arena-custom-dialog-modal');
    const titleEl = document.getElementById('arena-dialog-title');
    const bodyEl = document.getElementById('arena-dialog-body');
    const iconEl = document.getElementById('arena-dialog-icon');
    const actionsEl = document.getElementById('arena-dialog-actions');
    if (!modal) return;

    if (titleEl) titleEl.innerText = title;
    if (bodyEl) bodyEl.innerHTML = message;
    if (iconEl) iconEl.className = icon;

    actionsEl.innerHTML = `
        <button type="button" class="btn-ngola btn-ngola-primary" onclick="closeArenaDialog()" style="padding: 10px 24px;">
            <i class="fa-solid fa-check"></i> ${btnText}
        </button>
    `;

    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeArenaDialog() {
    const modal = document.getElementById('arena-custom-dialog-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    arenaDialogConfirmCallback = null;
}

function confirmArenaDialog() {
    if (typeof arenaDialogConfirmCallback === 'function') {
        const cb = arenaDialogConfirmCallback;
        closeArenaDialog();
        cb();
    } else {
        closeArenaDialog();
    }
}

function backToModeSelect() {
    const modeSelectView = document.getElementById('modal-mode-select-view');
    const betSelectView = document.getElementById('modal-bet-select-view');
    if (betSelectView) betSelectView.style.display = 'none';
    if (modeSelectView) modeSelectView.style.display = 'block';
    if (window.arenaAudio) window.arenaAudio.playClick();
}

function checkBetBalanceWarning() {
    const alertBox = document.getElementById('bet-insufficient-funds-alert');
    const msgBox = document.getElementById('bet-funds-msg');
    if (!alertBox) return;

    if (selectedBetAmount > 0 && selectedBetAmount > userWalletBalance) {
        if (msgBox) {
            msgBox.innerHTML = `O seu saldo disponível é de <strong>${userWalletBalance.toLocaleString('pt-AO')} Kz</strong>, insuficiente para a aposta de <strong>${selectedBetAmount.toLocaleString('pt-AO')} Kz</strong>. Faça um depósito na sua carteira para continuar.`;
        }
        alertBox.style.display = 'block';
        return false;
    } else {
        if (userWalletBalance <= 0 && selectedBetAmount > 0) {
            alertBox.style.display = 'block';
            return false;
        } else {
            alertBox.style.display = 'none';
            return true;
        }
    }
}

window.__ARENA_FEE_PERCENT = <?php echo (float)($arena_settings['platform_fee_percent'] ?? 10); ?>;

function updatePrizeDisplay() {
    const prizeEl = document.getElementById('bet-calculated-prize-txt');
    const mainActionBtn = document.getElementById('btn-modal-main-play-action');
    const feePct = window.__ARENA_FEE_PERCENT || 10;
    if (selectedBetAmount > 0) {
        const pot = selectedBetAmount * 2;
        const feeVal = pot * (feePct / 100);
        const netPrize = pot - feeVal;
        if (prizeEl) prizeEl.innerHTML = `<span style="color: #10b981; font-weight: 800; font-size: 1.15rem;">+${Math.floor(netPrize).toLocaleString('pt-AO')} Kz</span> <span style="font-size: 0.72rem; color: var(--text-dim); font-weight: normal; margin-left: 6px;">(Líquido após taxa de ${feePct}%)</span>`;
        if (mainActionBtn) {
            mainActionBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> JOGAR AGORA (BUSCAR ADVERSÁRIO)';
            mainActionBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        }
    } else {
        if (prizeEl) prizeEl.innerHTML = `<span style="color: #22c98b; font-weight: 800; font-size: 1.15rem;">0 Kz (Duelo Amistoso Grátis)</span>`;
        if (mainActionBtn) {
            mainActionBtn.innerHTML = '<i class="fa-solid fa-swords"></i> JOGAR AMISTOSO AGORA';
            mainActionBtn.style.background = 'linear-gradient(135deg, #22c98b, #059669)';
        }
    }
}

function handleMainModalPlayClick() {
    confirmBetAndSearchOpponents();
}

function selectQuickBet(amount, btn) {
    selectedBetAmount = parseInt(amount) || 0;
    const input = document.getElementById('input-custom-bet');
    if (input) input.value = selectedBetAmount;

    const btns = document.querySelectorAll('.bet-pill-btn');
    btns.forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (window.arenaAudio) window.arenaAudio.playClick();

    updatePrizeDisplay();
    checkBetBalanceWarning();
}

function onCustomBetInput(val) {
    selectedBetAmount = Math.max(0, parseInt(val) || 0);
    const btns = document.querySelectorAll('.bet-pill-btn');
    btns.forEach(b => {
        const textVal = parseInt(b.innerText.replace(/[^0-9]/g, '')) || 0;
        if (textVal === selectedBetAmount) b.classList.add('active');
        else b.classList.remove('active');
    });

    updatePrizeDisplay();
    checkBetBalanceWarning();
}

function backToBetSelect() {
    const betSelectView = document.getElementById('modal-bet-select-view');
    const searchView = document.getElementById('radar-search-view');
    if (searchView) searchView.style.display = 'none';
    if (betSelectView) betSelectView.style.display = 'block';
    if (window.arenaAudio) window.arenaAudio.playClick();
}

// 3. Confirmou o Valor: Iniciar Pesquisa de Jogadores Online no Radar
function confirmBetAndSearchOpponents() {
    // Validar se o jogador tem saldo suficiente para a aposta
    if (selectedBetAmount > 0 && selectedBetAmount > userWalletBalance) {
        checkBetBalanceWarning();
        const alertBox = document.getElementById('bet-insufficient-funds-alert');
        if (alertBox) {
            alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alertBox.style.animation = 'none';
            setTimeout(() => alertBox.style.animation = 'pulse 0.5s', 10);
        }
        return;
    }

    const betSelectView = document.getElementById('modal-bet-select-view');
    const searchView = document.getElementById('radar-search-view');
    const gameTxt = document.getElementById('radar-current-game-txt');
    const betTxt = document.getElementById('radar-current-bet-txt');

    if (gameTxt) gameTxt.innerText = activeRadarGame.toUpperCase();
    if (betTxt) {
        betTxt.innerText = selectedBetAmount > 0 
            ? `${selectedBetAmount.toLocaleString('pt-AO')} Kz` 
            : '0 Kz (Amistoso)';
    }

    if (betSelectView) betSelectView.style.display = 'none';
    if (searchView) searchView.style.display = 'block';

    if (window.arenaAudio) window.arenaAudio.playClick();
    fetchRadarOpponents();
}

function closeMatchmakingModal() {
    clearActiveChallengeTimers();
    const modal = document.getElementById('radar-matchmaking-modal');
    if (modal) modal.classList.remove('active');
}

function filterRadarProvince(prov) {
    activeRadarProvince = prov;
    const btns = document.querySelectorAll('.radar-prov-btn');
    btns.forEach(b => b.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    fetchRadarOpponents();
}

function fetchRadarOpponents() {
    const list = document.getElementById('radar-opponents-list');
    const statusTxt = document.getElementById('radar-status-text');
    if (!list) return;

    list.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 24px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><br><span style="margin-top: 8px; display:inline-block;">Buscando jogadores online em Angola...</span></div>';
    if (statusTxt) statusTxt.innerText = 'Buscando jogadores conectados online em Angola...';

    const url = `${window.__ARENA_BASE_URL}/api.php?action=search_opponents&game=${activeRadarGame}&province=${encodeURIComponent(activeRadarProvince)}`;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'ok' && data.opponents && data.opponents.length > 0) {
                if (statusTxt) statusTxt.innerText = `${data.opponents.length} oponentes online encontrados`;
                list.innerHTML = '';
                
                data.opponents.forEach(opp => {
                    const card = document.createElement('div');
                    card.className = 'opponent-card';
                    card.innerHTML = `
                        <div class="opp-left-profile">
                            <img src="${opp.avatar}" alt="${opp.tag}" class="opp-avatar">
                            <div>
                                <div class="opp-name">${opp.tag}</div>
                                <div class="opp-province"><i class="fa-solid fa-map-pin"></i> ${opp.province}</div>
                                <div style="font-size: 0.72rem; color: var(--text-dim);">
                                    <i class="fa-solid fa-bolt" style="color: #ffffff;"></i> ${opp.points} Pontos • 
                                    <span style="color: var(--neon-green); font-weight:700;">● Online</span>
                                </div>
                            </div>
                        </div>
                        <button type="button" class="btn-challenge-opp" onclick="challengeOpponent(${JSON.stringify(opp).replace(/"/g, '&quot;')})">
                            <i class="fa-solid fa-bolt"></i> Desafiar
                        </button>
                    `;
                    list.appendChild(card);
                });
            } else {
                if (statusTxt) statusTxt.innerText = 'Nenhum outro jogador online agora (Modo Produção Real)';
                list.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 28px 16px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md);">
                        <div style="font-size: 2rem; color: #ffffff; margin-bottom: 8px;"><i class="fa-solid fa-radar fa-beat"></i></div>
                        <div style="font-family: var(--font-gamer); font-size: 1.15rem; font-weight: 800; color: #fff; margin-bottom: 4px;">NENHUM OUTRO JOGADOR ONLINE NESTE SEGUNDO</div>
                        <p style="color: var(--text-dim); font-size: 0.85rem; max-width: 380px; margin: 0 auto 16px auto;">
                            O radar buscou utilizadores reais em Angola mas não há outro conectado neste instante. O sistema está em modo de produção estrito (sem bots falsos simulados).
                        </p>
                        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                            <button type="button" class="btn-ngola btn-ngola-secondary btn-sm" onclick="fetchRadarOpponents()">
                                <i class="fa-solid fa-rotate-right"></i> Varrer Novamente
                            </button>
                            <a href="${window.__ARENA_BASE_URL}/play.php?game=${activeRadarGame}&mode=solo" class="btn-ngola btn-ngola-primary btn-sm">
                                <i class="fa-solid fa-gamepad"></i> Praticar Solo / Treino
                            </a>
                        </div>
                    </div>
                `;
            }
        })
        .catch(err => {
            list.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #ef4444; padding: 20px;">Falha ao comunicar com o radar. Tente novamente.</div>';
        });
}

function clearActiveChallengeTimers() {
    if (challengePollInterval) {
        clearInterval(challengePollInterval);
        challengePollInterval = null;
    }
    if (challengeTimerInterval) {
        clearInterval(challengeTimerInterval);
        challengeTimerInterval = null;
    }
}

// INICIAR DESAFIO COM REGRA DE 1 MINUTO & VERIFICAÇÃO MÚTUA
function challengeOpponent(opp) {
    clearActiveChallengeTimers();

    const searchView = document.getElementById('radar-search-view');
    const vsView = document.getElementById('radar-vs-view');
    const statusDesc = document.getElementById('vs-status-desc');
    const oppAvatar = document.getElementById('vs-opp-avatar');
    const oppName = document.getElementById('vs-opp-name');
    const oppProvince = document.getElementById('vs-opp-province');
    const countdownNum = document.getElementById('vs-countdown-num');
    const progressBar = document.getElementById('vs-timer-progress-bar');
    const myConnStatus = document.getElementById('vs-my-conn-status');
    const oppConnStatus = document.getElementById('vs-opp-conn-status');
    const cancelBtn = document.getElementById('vs-cancel-btn');
    const retryBtn = document.getElementById('vs-retry-btn');

    if (searchView) searchView.style.display = 'none';
    if (vsView) vsView.style.display = 'flex';

    if (oppAvatar) oppAvatar.src = opp.avatar;
    if (oppName) oppName.innerText = opp.tag;
    if (oppProvince) oppProvince.innerHTML = `<i class="fa-solid fa-map-pin"></i> ${opp.province}`;

    if (myConnStatus) {
        myConnStatus.className = 'mutual-status-pill online';
        myConnStatus.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Você: Conectado';
    }
    if (oppConnStatus) {
        oppConnStatus.className = 'mutual-status-pill waiting';
        oppConnStatus.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Adversário: Notificado (Aguardando Aceite)';
    }

    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (retryBtn) retryBtn.style.display = 'none';

    remainingSeconds = 60;
    if (countdownNum) countdownNum.innerText = '60s';
    if (progressBar) progressBar.style.width = '100%';
    if (statusDesc) statusDesc.innerText = `Desafio enviado para ${opp.tag}! O adversário tem 1 minuto de prazo para se concentrar e aceitar o duelo.`;

    if (window.arenaAudio) window.arenaAudio.playClick();

    // 1. Registrar o Desafio no Servidor com Expiração em 60 Segundos
    fetch(`${window.__ARENA_BASE_URL}/api.php?action=create_challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game: activeRadarGame,
            opp_id: opp.id,
            opp_tag: opp.tag,
            opp_avatar: opp.avatar,
            opp_province: opp.province,
            opp_diff: opp.difficulty || 'medium',
            is_bot: opp.is_bot ? 1 : 0,
            bot_id: opp.id,
            bet_amount: selectedBetAmount
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'ok') {
            currentChallengeToken = data.challenge_token;

            // Iniciar Relógio Local de 60s
            challengeTimerInterval = setInterval(() => {
                remainingSeconds--;
                if (countdownNum) countdownNum.innerText = `${remainingSeconds}s`;
                if (progressBar) {
                    const pct = Math.max(0, (remainingSeconds / 60) * 100);
                    progressBar.style.width = `${pct}%`;
                }

                if (remainingSeconds <= 0) {
                    clearActiveChallengeTimers();
                    handleChallengeFailure('Tempo limite de 1 minuto esgotado! O adversário não respondeu a tempo.');
                }
            }, 1000);

            // Iniciar Verificação Mútua de Conexão a cada 2 segundos
            pollChallengeStatus(opp);
            challengePollInterval = setInterval(() => {
                pollChallengeStatus(opp);
            }, 2000);

        } else {
            handleChallengeFailure('Erro ao enviar desafio: ' + (data.message || 'Tente novamente.'));
        }
    })
    .catch(err => {
        handleChallengeFailure('Falha de conexão com o servidor da Arena.');
    });
}

// Polling de Estado do Desafio & Verificação Mútua
function pollChallengeStatus(opp) {
    if (!currentChallengeToken) return;

    fetch(`${window.__ARENA_BASE_URL}/api.php?action=poll_challenge&token=${currentChallengeToken}&role=challenger`)
        .then(res => res.json())
        .then(data => {
            const statusDesc = document.getElementById('vs-status-desc');
            const countdownNum = document.getElementById('vs-countdown-num');
            const oppConnStatus = document.getElementById('vs-opp-conn-status');

            if (data.status === 'accepted') {
                // Ambos conectados e desafio aceito!
                clearActiveChallengeTimers();

                if (oppConnStatus) {
                    oppConnStatus.className = 'mutual-status-pill online';
                    oppConnStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> Adversário: Conectado & Pronto!';
                }
                if (statusDesc) statusDesc.innerHTML = `<span style="color: var(--neon-green); font-weight:800;">✓ Desafio aceito por ${opp.tag}! Ambos jogadores sincronizados.</span>`;
                if (window.arenaAudio) window.arenaAudio.playMatchFound();

                // Contagem final rápida de 3 segundos para início sincronizado
                let startCount = 3;
                if (countdownNum) countdownNum.innerText = startCount;

                const startTimer = setInterval(() => {
                    startCount--;
                    if (startCount > 0) {
                        if (countdownNum) countdownNum.innerText = startCount;
                        if (window.arenaAudio) window.arenaAudio.playClick();
                    } else {
                        clearInterval(startTimer);
                        if (countdownNum) countdownNum.innerText = 'COMEÇAR!';
                        setTimeout(() => {
                            window.location.href = `${window.__ARENA_BASE_URL}/play.php?game=${activeRadarGame}&room=battle_${currentChallengeToken}&opp_name=${encodeURIComponent(opp.tag)}&opp_avatar=${encodeURIComponent(opp.avatar)}&opp_province=${encodeURIComponent(opp.province)}&opp_points=${opp.points}&opp_diff=${opp.difficulty || 'medium'}&is_bot=${opp.is_bot}&bot_id=${opp.id}&token=${currentChallengeToken}&bet_amount=${selectedBetAmount}`;
                        }, 400);
                    }
                }, 800);

            } else if (data.status === 'expired') {
                clearActiveChallengeTimers();
                handleChallengeFailure('Prazo de 1 minuto encerrado: o oponente não aceitou a tempo.');
            } else if (data.status === 'declined') {
                clearActiveChallengeTimers();
                handleChallengeFailure('O oponente recusou o desafio no momento.');
            } else if (data.status === 'disconnected') {
                clearActiveChallengeTimers();
                handleChallengeFailure('Conexão perdida: o oponente desconectou-se da Arena.');
            } else {
                // Continua aguardando aceite dentro do prazo de 60s
                if (typeof data.remaining_seconds === 'number' && data.remaining_seconds < remainingSeconds) {
                    remainingSeconds = data.remaining_seconds;
                }
            }
        })
        .catch(err => {
            console.warn('Ping de verificação falhou momentaneamente:', err);
        });
}

function handleChallengeFailure(msg) {
    const statusDesc = document.getElementById('vs-status-desc');
    const countdownNum = document.getElementById('vs-countdown-num');
    const cancelBtn = document.getElementById('vs-cancel-btn');
    const retryBtn = document.getElementById('vs-retry-btn');
    const oppConnStatus = document.getElementById('vs-opp-conn-status');

    if (statusDesc) statusDesc.innerHTML = `<span style="color: #ef4444; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> ${msg}</span>`;
    if (countdownNum) countdownNum.innerText = '✕';
    if (oppConnStatus) {
        oppConnStatus.className = 'mutual-status-pill';
        oppConnStatus.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color: #ef4444;"></i> Sem Resposta / Desconectado';
    }
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (retryBtn) retryBtn.style.display = 'inline-flex';
}

function cancelActiveChallenge() {
    if (currentChallengeToken) {
        fetch(`${window.__ARENA_BASE_URL}/api.php?action=cancel_challenge&token=${currentChallengeToken}`);
    }
    clearActiveChallengeTimers();
    returnToRadarSearch();
}

function returnToRadarSearch() {
    clearActiveChallengeTimers();
    const searchView = document.getElementById('radar-search-view');
    const vsView = document.getElementById('radar-vs-view');
    if (searchView) searchView.style.display = 'block';
    if (vsView) vsView.style.display = 'none';
    fetchRadarOpponents();
}

// 3. Monitoramento em Segundo Plano de Desafios Recebidos para Este Usuário
function checkIncomingChallenges() {
    if (!window.__ARENA_LOGGED_USER) return;

    fetch(`${window.__ARENA_BASE_URL}/api.php?action=check_incoming_challenges`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'ok' && data.incoming) {
                const inc = data.incoming;
                incomingChallengeToken = inc.challenge_token;

                const modal = document.getElementById('incoming-challenge-modal');
                const nameEl = document.getElementById('inc-challenger-name');
                const provEl = document.getElementById('inc-challenger-prov');
                const avEl = document.getElementById('inc-challenger-avatar');
                const countEl = document.getElementById('inc-countdown-txt');

                if (nameEl) nameEl.innerText = inc.challenger_tag;
                if (provEl) provEl.innerHTML = `<i class="fa-solid fa-map-pin"></i> ${inc.challenger_province || 'Luanda'}`;
                if (avEl) avEl.src = inc.challenger_avatar;
                if (countEl) countEl.innerText = `${data.remaining_seconds}s restantes`;

                if (modal && !modal.classList.contains('active')) {
                    modal.classList.add('active');
                    if (window.arenaAudio) window.arenaAudio.playMatchFound();
                }
            }
        })
        .catch(err => {});
}

function acceptIncomingChallenge() {
    if (!incomingChallengeToken) return;
    fetch(`${window.__ARENA_BASE_URL}/api.php?action=accept_challenge&token=${incomingChallengeToken}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'ok') {
                const modal = document.getElementById('incoming-challenge-modal');
                if (modal) modal.classList.remove('active');
                window.location.href = `${window.__ARENA_BASE_URL}/play.php?token=${incomingChallengeToken}`;
            }
        });
}

function declineIncomingChallenge() {
    if (incomingChallengeToken) {
        fetch(`${window.__ARENA_BASE_URL}/api.php?action=decline_challenge&token=${incomingChallengeToken}`);
    }
    const modal = document.getElementById('incoming-challenge-modal');
    if (modal) modal.classList.remove('active');
}

// Iniciar verificação de convites a cada 5 segundos se logado
if (window.__ARENA_LOGGED_USER) {
    incomingPollInterval = setInterval(checkIncomingChallenges, 5000);
}

// ==========================================
// ==========================================
// MURAL DE DUELOS & PROPOSTAS ABERTAS (CICLO DE 1 MINUTO)
// ==========================================
let myOpenProposalToken = null;
let pollMyOpenProposalInterval = null;
let myOpenProposalCountdownInterval = null;
let myOpenProposalSecondsLeft = 60;

function launchProposalToMural() {
    if (!window.__ARENA_LOGGED_USER) {
        window.location.href = `${window.__ARENA_BASE_URL}/login.php`;
        return;
    }

    if (selectedBetAmount > userWalletBalance) {
        const alertBox = document.getElementById('bet-insufficient-funds-alert');
        if (alertBox) {
            alertBox.style.display = 'block';
            alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    const betSelectView = document.getElementById('modal-bet-select-view');
    const openProposalView = document.getElementById('radar-open-proposal-view');
    const muralGameTxt = document.getElementById('mural-wait-game-txt');
    const muralBetTxt = document.getElementById('mural-wait-bet-txt');
    const muralPrizeTxt = document.getElementById('mural-wait-prize-txt');
    const muralStatusTxt = document.getElementById('mural-wait-status-text');
    const timerVal = document.getElementById('mural-wait-timer-val');
    const expiredBox = document.getElementById('mural-proposal-expired-box');
    const sonarWrap = document.getElementById('mural-sonar-active-wrap');
    const countdownBox = document.getElementById('mural-wait-countdown-box');
    const cancelWrap = document.getElementById('mural-wait-cancel-wrap');

    if (muralGameTxt) muralGameTxt.innerText = (activeRadarGame || 'hyperstrike').toUpperCase();
    if (muralBetTxt) muralBetTxt.innerText = selectedBetAmount > 0 ? `${selectedBetAmount.toLocaleString('pt-AO')} Kz` : '0 Kz (Treino)';
    
    const feePct = window.__ARENA_FEE_PERCENT || 10;
    const netMuralPrize = selectedBetAmount > 0 ? (selectedBetAmount * 2 * (1 - feePct / 100)) : 0;
    if (muralPrizeTxt) muralPrizeTxt.innerText = selectedBetAmount > 0 ? `+${Math.floor(netMuralPrize).toLocaleString('pt-AO')} Kz (Líquido)` : '0 Kz';

    if (expiredBox) expiredBox.style.display = 'none';
    if (sonarWrap) sonarWrap.style.display = 'block';
    if (countdownBox) countdownBox.style.display = 'block';
    if (cancelWrap) cancelWrap.style.display = 'flex';
    myOpenProposalSecondsLeft = 60;
    if (timerVal) timerVal.innerText = '60s';

    if (betSelectView) betSelectView.style.display = 'none';
    if (openProposalView) openProposalView.style.display = 'block';
    if (muralStatusTxt) muralStatusTxt.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Lançando proposta no mural da Arena...';

    const postUrl = `${window.__ARENA_BASE_URL || ''}/api.php?action=create_open_challenge`;
    fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            game: activeRadarGame,
            bet_amount: selectedBetAmount
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'ok') {
            myOpenProposalToken = data.token || data.challenge_token;
            myOpenProposalSecondsLeft = parseInt(data.expires_in) || 60;
            if (timerVal) timerVal.innerText = `${myOpenProposalSecondsLeft}s`;

            if (muralStatusTxt) {
                muralStatusTxt.innerHTML = '<span style="color: #ef4444; font-weight:800;">✓ PROPOSTA NO AR!</span> Aguardando adversário aceitar e cobrir o valor...';
            }
            if (window.arenaAudio) window.arenaAudio.playClick();

            // Iniciar contagem regressiva visual local de 60 segundos
            if (myOpenProposalCountdownInterval) clearInterval(myOpenProposalCountdownInterval);
            myOpenProposalCountdownInterval = setInterval(() => {
                myOpenProposalSecondsLeft--;
                if (timerVal) timerVal.innerText = `${Math.max(0, myOpenProposalSecondsLeft)}s`;
                if (myOpenProposalSecondsLeft <= 0) {
                    handleOpenProposalExpired();
                }
            }, 1000);

            // Iniciar polling de aceitação da proposta aberta a cada 2s
            if (pollMyOpenProposalInterval) clearInterval(pollMyOpenProposalInterval);
            pollMyOpenProposalInterval = setInterval(pollMyOpenProposalStatus, 2000);

            // Carregar combatentes interessados para escolha imediata
            loadInterestedCandidates();

            // Atualiza mural público imediatamente se visível
            loadOpenChallenges();
        } else {
            showArenaAlert('FALHA NA PROPOSTA', data.message || 'Não foi possível lançar a proposta no mural.', 'fa-solid fa-circle-exclamation');
            if (openProposalView) openProposalView.style.display = 'none';
            if (betSelectView) betSelectView.style.display = 'block';
        }
    })
    .catch(err => {
        showArenaAlert('ERRO DE CONEXÃO', 'Erro de conexão com o servidor da Arena. Verifique a internet e tente novamente.', 'fa-solid fa-wifi');
        if (openProposalView) openProposalView.style.display = 'none';
        if (betSelectView) betSelectView.style.display = 'block';
    });
}

let candidatesStreamTimeouts = [];

function loadInterestedCandidates() {
    const list = document.getElementById('mural-candidates-list');
    if (!list) return;

    // Limpar timeouts anteriores de streaming progressivo
    candidatesStreamTimeouts.forEach(t => clearTimeout(t));
    candidatesStreamTimeouts = [];

    list.innerHTML = `
        <div id="candidates-scanner" style="text-align: center; padding: 16px 8px; color: #ef4444; font-size: 0.82rem; font-weight: 700; background: rgba(239, 68, 68, 0.04); border: 1px dashed rgba(239, 68, 68, 0.25); border-radius: 10px; margin-bottom: 8px;">
            <i class="fa-solid fa-satellite-dish fa-spin"></i> Radar Conectando Combatentes na Rede Angola...
        </div>
    `;

    fetch(`${window.__ARENA_BASE_URL || ''}/api.php?action=get_interested_candidates`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            const scanner = document.getElementById('candidates-scanner');
            if (!data.candidates || data.candidates.length === 0) {
                if (scanner) {
                    scanner.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> Aguardando novos desafiantes na rede...';
                }
                return;
            }

            // Remove o scanner e adiciona os combatentes UM A UM com intervalo de 1.8 segundos
            if (scanner) scanner.remove();

            data.candidates.forEach((c, idx) => {
                const delayMs = idx * 1800; // 0s, 1.8s, 3.6s, 5.4s
                const timeoutId = setTimeout(() => {
                    const card = document.createElement('div');
                    card.id = `candidate-card-${c.id}`;
                    card.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(18,24,36,0.95); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 10px 12px; gap: 10px; margin-bottom: 8px; opacity: 0; transform: translateY(-8px); transition: all 0.45s cubic-bezier(0.4, 0, 0.2, 1);';

                    card.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; overflow: hidden;">
                            <img src="${c.avatar}" style="width: 44px; height: 44px; min-width: 44px; max-width: 44px; min-height: 44px; max-height: 44px; flex-shrink: 0; aspect-ratio: 1/1; border-radius: 50%; border: 2px solid #ef4444; object-fit: cover; box-shadow: 0 0 8px rgba(239,68,68,0.3);">
                            <div style="min-width: 0; flex: 1; overflow: hidden;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-weight: 800; font-size: 0.92rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;" title="${c.name}">${c.name}</span>
                                </div>
                                <div style="font-size: 0.76rem; color: var(--text-dim); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <i class="fa-solid fa-map-pin" style="color: #ef4444;"></i> ${c.province} • <span style="color: #10b981; font-weight: 700;">${c.winrate}</span>
                                </div>
                            </div>
                        </div>
                        <button type="button" class="btn-ngola btn-ngola-primary btn-sm" style="flex-shrink: 0; font-size: 0.78rem; padding: 7px 12px; font-weight: 800; background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 0 10px rgba(16,185,129,0.35); white-space: nowrap;" onclick="chooseCandidateForBattle(${c.id}, '${c.name.replace(/'/g, "\\'")}', '${(c.avatar || '').replace(/'/g, "\\'")}', '${(c.province || '').replace(/'/g, "\\'")}')">
                            <i class="fa-solid fa-swords"></i> Batalhar
                        </button>
                    `;

                    list.appendChild(card);

                    // Efeito sonoro suave de radar
                    if (window.arenaAudio && typeof window.arenaAudio.playRadarBeep === 'function') {
                        try { window.arenaAudio.playRadarBeep(); } catch(e) {}
                    }

                    // Animar entrada suave
                    requestAnimationFrame(() => {
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                    });
                }, delayMs);

                candidatesStreamTimeouts.push(timeoutId);
            });
        }).catch(() => {});
}

function chooseCandidateForBattle(botId, botName, botAvatar, botProvince) {
    if (!myOpenProposalToken) return;

    // Consentimento Mútuo / Confirmação do Jogador
    showArenaConfirm({
        title: 'CONFIRMAR COMBATE',
        icon: 'fa-solid fa-handshake',
        html: `
            <div style="text-align:center; padding: 8px 0;">
                <img src="${botAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}" style="width: 60px; height: 60px; border-radius: 50%; border: 2px solid #ef4444; margin-bottom: 8px; object-fit: cover;">
                <div style="font-size: 1.15rem; font-weight: 800; color: #fff;">${botName}</div>
                <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 12px;">${botProvince || 'Angola'} • Aposta: <strong style="color: #ffffff;">${selectedBetAmount.toLocaleString('pt-AO')} Kz</strong></div>
                <p style="color: #cbd5e1; font-size: 0.92rem; margin: 0;">Você selecionou este combatente para a sua proposta.<br><strong>Pretende confirmar o início da batalha ou continuar aguardando?</strong></p>
            </div>
        `,
        confirmText: '<i class="fa-solid fa-play"></i> Sim, Batalhar Agora',
        cancelText: '<i class="fa-solid fa-xmark"></i> Continuar Aguardando',
        confirmStyle: 'background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 0 15px rgba(16,185,129,0.4);',
        onConfirm: function() {
            executeMatchWithCandidate(botId, botName);
        }
    });
}

function executeMatchWithCandidate(botId, botName) {
    if (!myOpenProposalToken) return;
    const muralStatusTxt = document.getElementById('mural-wait-status-text');
    if (muralStatusTxt) {
        muralStatusTxt.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Conectando com ${botName}...`;
    }

    fetch(`${window.__ARENA_BASE_URL || ''}/api.php?action=match_with_candidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            token: myOpenProposalToken,
            bot_id: botId
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'ok') {
            if (window.arenaAudio) window.arenaAudio.playMatchFound();
            window.location.href = data.redirect_url;
        } else {
            showArenaAlert('COMBATE', data.message || 'Não foi possível iniciar o combate com este combatente.', 'fa-solid fa-circle-exclamation');
        }
    })
    .catch(() => {
        showArenaAlert('ERRO DE CONEXÃO', 'Falha ao conectar com o combatente. Verifique a internet e tente novamente.', 'fa-solid fa-wifi');
    });
}

function pollMyOpenProposalStatus() {
    if (!myOpenProposalToken) return;

    fetch(`${window.__ARENA_BASE_URL}/api.php?action=poll_challenge&token=${myOpenProposalToken}&role=challenger`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'accepted') {
                if (pollMyOpenProposalInterval) {
                    clearInterval(pollMyOpenProposalInterval);
                    pollMyOpenProposalInterval = null;
                }
                if (myOpenProposalCountdownInterval) {
                    clearInterval(myOpenProposalCountdownInterval);
                    myOpenProposalCountdownInterval = null;
                }

                closeMatchmakingModal();
                if (window.arenaAudio) window.arenaAudio.playMatchFound();

                const oppName = data.opp_name || 'Um Combatente';
                const oppAv = data.opp_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
                const oppProv = data.opp_province || 'Luanda';
                const betVal = data.bet_amount || selectedBetAmount;

                // Consentimento Mútuo do Jogador: outro combatente cobriu a aposta
                showArenaConfirm({
                    title: 'OPONENTE CONECTADO!',
                    icon: 'fa-solid fa-swords',
                    html: `
                        <div style="text-align:center; padding: 8px 0;">
                            <img src="${oppAv}" style="width: 60px; height: 60px; border-radius: 50%; border: 2px solid #ef4444; margin-bottom: 8px; object-fit: cover;">
                            <div style="font-size: 1.15rem; font-weight: 800; color: #fff;">${oppName}</div>
                            <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 12px;">${oppProv} • Aposta: <strong style="color: #ffffff;">${betVal.toLocaleString('pt-AO')} Kz</strong></div>
                            <p style="color: #cbd5e1; font-size: 0.92rem; margin: 0;">Este combatente aceitou cobrir a sua aposta no mural!<br><strong>Pretende confirmar e entrar no combate ou anular o desafio?</strong></p>
                        </div>
                    `,
                    confirmText: '<i class="fa-solid fa-bolt"></i> Confirmar & Batalhar',
                    cancelText: '<i class="fa-solid fa-ban"></i> Anular Desafio',
                    confirmStyle: 'background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 0 15px rgba(16,185,129,0.4);',
                    onConfirm: function() {
                        window.location.href = `${window.__ARENA_BASE_URL}/play.php?token=${myOpenProposalToken}&game=${encodeURIComponent(data.game || activeRadarGame)}&bet_amount=${betVal}`;
                    },
                    onCancel: function() {
                        cancelMyOpenChallenge();
                    }
                });
            } else if (data.status === 'expired') {
                handleOpenProposalExpired();
            }
        })
        .catch(err => {});
}

function handleOpenProposalExpired() {
    if (pollMyOpenProposalInterval) {
        clearInterval(pollMyOpenProposalInterval);
        pollMyOpenProposalInterval = null;
    }
    if (myOpenProposalCountdownInterval) {
        clearInterval(myOpenProposalCountdownInterval);
        myOpenProposalCountdownInterval = null;
    }

    const currentExpiredTok = myOpenProposalToken;
    myOpenProposalToken = null;

    // Cancela no servidor para sumir imediatamente do mural público
    if (currentExpiredTok) {
        fetch(`${window.__ARENA_BASE_URL}/api.php?action=cancel_open_challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: currentExpiredTok })
        }).catch(() => {});
    }

    // Fecha o modal imediatamente
    closeMatchmakingModal();

    // Limpa a lista de combatentes que estavam abaixo aguardando
    const list = document.getElementById('mural-candidates-list');
    if (list) list.innerHTML = '';

    // Reseta as views internas do modal
    const openProposalView = document.getElementById('radar-open-proposal-view');
    const betSelectView = document.getElementById('modal-bet-select-view');
    const expiredBox = document.getElementById('mural-proposal-expired-box');
    if (openProposalView) openProposalView.style.display = 'none';
    if (betSelectView) betSelectView.style.display = 'block';
    if (expiredBox) expiredBox.style.display = 'none';

    if (window.arenaAudio) window.arenaAudio.playClick();

    // Alerta informativo claro para o usuário
    showArenaAlert('PROPOSTA EXPIRADA', 'O tempo limite de 1 minuto da sua proposta terminou e ela foi removida do mural. Você pode lançar um novo desafio agora!', 'fa-solid fa-hourglass-end');

    // Atualiza mural público imediatamente
    loadOpenChallenges();
}

function restartCreateProposal() {
    myOpenProposalToken = null;
    if (pollMyOpenProposalInterval) {
        clearInterval(pollMyOpenProposalInterval);
        pollMyOpenProposalInterval = null;
    }
    if (myOpenProposalCountdownInterval) {
        clearInterval(myOpenProposalCountdownInterval);
        myOpenProposalCountdownInterval = null;
    }
    const openProposalView = document.getElementById('radar-open-proposal-view');
    const betSelectView = document.getElementById('modal-bet-select-view');
    const expiredBox = document.getElementById('mural-proposal-expired-box');
    const sonarWrap = document.getElementById('mural-sonar-active-wrap');
    const countdownBox = document.getElementById('mural-wait-countdown-box');
    const cancelWrap = document.getElementById('mural-wait-cancel-wrap');
    const list = document.getElementById('mural-candidates-list');
    if (list) list.innerHTML = '';

    if (expiredBox) expiredBox.style.display = 'none';
    if (sonarWrap) sonarWrap.style.display = 'block';
    if (countdownBox) countdownBox.style.display = 'block';
    if (cancelWrap) cancelWrap.style.display = 'flex';
    if (openProposalView) openProposalView.style.display = 'none';
    if (betSelectView) betSelectView.style.display = 'block';
}

function cancelMyOpenChallenge() {
    if (pollMyOpenProposalInterval) {
        clearInterval(pollMyOpenProposalInterval);
        pollMyOpenProposalInterval = null;
    }
    if (myOpenProposalCountdownInterval) {
        clearInterval(myOpenProposalCountdownInterval);
        myOpenProposalCountdownInterval = null;
    }

    if (myOpenProposalToken) {
        fetch(`${window.__ARENA_BASE_URL}/api.php?action=cancel_open_challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: myOpenProposalToken })
        }).then(() => {
            myOpenProposalToken = null;
            loadOpenChallenges();
        }).catch(() => {});
    }

    const openProposalView = document.getElementById('radar-open-proposal-view');
    const betSelectView = document.getElementById('modal-bet-select-view');
    const list = document.getElementById('mural-candidates-list');
    if (list) list.innerHTML = '';
    if (openProposalView) openProposalView.style.display = 'none';
    if (betSelectView) betSelectView.style.display = 'block';
    closeMatchmakingModal();
}

// Rastreamento persistente em memória dos confrontos fechados já exibidos (impede repetição/loop)
const seenClosedMatches = new Set();

let currentDuelsActiveTab = 'open';

function switchDuelsTab(tab) {
    currentDuelsActiveTab = tab;
    const liveBtn = document.getElementById('tab-nav-live-btn');
    const openBtn = document.getElementById('tab-nav-open-btn');
    const liveContent = document.getElementById('arena-live-battles-tab-content');
    const openContent = document.getElementById('arena-open-proposals-tab-content');

    if (tab === 'live') {
        if (liveBtn) {
            liveBtn.classList.add('active');
            liveBtn.style.background = 'rgba(240, 68, 74, 0.14)';
            liveBtn.style.borderColor = '#F0444A';
            liveBtn.style.color = '#fff';
        }
        if (openBtn) {
            openBtn.classList.remove('active');
            openBtn.style.background = '#171C26';
            openBtn.style.borderColor = '#282F3D';
            openBtn.style.color = '#9AA4B2';
        }
        if (liveContent) liveContent.style.display = 'block';
        if (openContent) openContent.style.display = 'none';
    } else {
        if (openBtn) {
            openBtn.classList.add('active');
            openBtn.style.background = 'rgba(245, 158, 11, 0.14)';
            openBtn.style.borderColor = '#F59E0B';
            openBtn.style.color = '#fff';
        }
        if (liveBtn) {
            liveBtn.classList.remove('active');
            liveBtn.style.background = '#171C26';
            liveBtn.style.borderColor = '#282F3D';
            liveBtn.style.color = '#9AA4B2';
        }
        if (liveContent) liveContent.style.display = 'none';
        if (openContent) openContent.style.display = 'block';
    }
}

function loadOpenChallenges() {
    const grid = document.getElementById('arena-open-challenges-grid');
    const liveGrid = document.getElementById('arena-live-battles-grid');
    if (!grid && !liveGrid) return;

    function doFetchOpen(apiUrl, isRetry) {
        fetch(apiUrl, { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                if (data.status === 'ok') {
                    const challenges = data.challenges || [];
                    const liveBattles = data.live_battles || [];

                    // Atualizar contadores das abas
                    const liveCountEl = document.getElementById('live-battles-counter');
                    const openCountEl = document.getElementById('open-proposals-counter');
                    if (liveCountEl) liveCountEl.innerText = liveBattles.length;
                    if (openCountEl) openCountEl.innerText = challenges.length;

                    // 1. RENDERIZAR SESSÃO: BATALHAS AO VIVO EM CURSO (ACEITAS / NO AR)
                    if (liveGrid) {
                        if (liveBattles.length === 0) {
                            liveGrid.innerHTML = `
                                <div style="grid-column: 1 / -1; text-align: center; padding: 36px 16px; background: #171C26; border: 1px dashed #282F3D; border-radius: 14px;">
                                    <div style="font-size: 2rem; color: #F0444A; margin-bottom: 8px;"><i class="fa-solid fa-swords"></i></div>
                                    <div style="font-family: var(--font-gamer); font-size: 1.15rem; font-weight: 800; color: #fff; margin-bottom: 6px;">NENHUM DUELO EM COMBATE AGORA</div>
                                    <p style="color: #9AA4B2; font-size: 0.85rem; max-width: 440px; margin: 0 auto 16px auto;">
                                        Os combatentes estão nos preparativos. Aceite uma proposta no mural ou lance o seu próprio desafio para entrar na arena!
                                    </p>
                                    <button type="button" class="btn-ngola btn-ngola-primary btn-sm" onclick="switchDuelsTab('open')">
                                        <i class="fa-solid fa-clipboard-list"></i> Ver Propostas no Mural
                                    </button>
                                </div>
                            `;
                        } else {
                            liveGrid.innerHTML = liveBattles.map(m => {
                                return `
                                    <div class="live-battle-card">
                                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                            <span class="badge" style="background: rgba(34,201,139,0.15); border: 1px solid #22C98B; color: #22C98B; font-size: 0.72rem; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 5px;">
                                                <span class="online-pulse-point" style="width: 5px; height: 5px;"></span> AO VIVO • RONDA ${m.current_round} / 3
                                            </span>
                                            <span style="font-size: 0.72rem; color: #9AA4B2; font-weight: 700; background: rgba(255,255,255,0.04); padding: 3px 8px; border-radius: 6px;">
                                                ${m.game_name}
                                            </span>
                                        </div>

                                        <!-- Combatentes Frente a Frente (P1 vs P2) -->
                                        <div style="display: flex; align-items: center; justify-content: space-around; background: rgba(0,0,0,0.4); border-radius: 12px; padding: 12px 10px; border: 1px solid #282F3D;">
                                            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 42%; text-align: center; min-width: 0;">
                                                <img src="${m.challenger_avatar}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid #F0444A; box-shadow: 0 0 10px rgba(240,68,74,0.4);">
                                                <div style="font-weight: 800; font-size: 0.82rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;" title="${m.challenger_name}">${m.challenger_name}</div>
                                                <span style="font-size: 0.68rem; color: #9AA4B2;"><i class="fa-solid fa-map-pin" style="color: #F0444A;"></i> ${m.challenger_province}</span>
                                            </div>

                                            <div style="font-family: var(--font-gamer); font-size: 1.25rem; font-weight: 900; color: #F59E0B; text-shadow: 0 0 10px rgba(245,158,11,0.6); flex-shrink: 0; padding: 0 8px;">
                                                VS
                                            </div>

                                            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 42%; text-align: center; min-width: 0;">
                                                <img src="${m.opponent_avatar}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid #22C98B; box-shadow: 0 0 10px rgba(34,201,139,0.4);">
                                                <div style="font-weight: 800; font-size: 0.82rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;" title="${m.opponent_name}">${m.opponent_name}</div>
                                                <span style="font-size: 0.68rem; color: #9AA4B2;"><i class="fa-solid fa-map-pin" style="color: #22C98B;"></i> ${m.opponent_province}</span>
                                            </div>
                                        </div>

                                        <!-- Detalhes de Aposta e Prêmio em Disputa -->
                                        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); border-radius: 8px; padding: 8px 12px; font-size: 0.78rem;">
                                            <div>
                                                <span style="color: #9AA4B2;">Aposta:</span> <strong style="color: #fff;">${m.formatted_bet}</strong>
                                            </div>
                                            <div>
                                                <span style="color: #9AA4B2;">Prêmio:</span> <strong style="color: #22C98B; font-family: var(--font-gamer); font-size: 0.95rem;">${m.formatted_prize}</strong>
                                            </div>
                                        </div>

                                        <button type="button" class="btn-ngola btn-ngola-secondary btn-sm" style="width: 100%; font-size: 0.80rem; padding: 7px; border-color: rgba(34,201,139,0.4); color: #22C98B;" onclick="openMatchmakingModal('${m.game_type}')">
                                            <i class="fa-solid fa-bolt"></i> Desafiar neste Jogo
                                        </button>
                                    </div>
                                `;
                            }).join('');
                        }
                    }

                    // 2. RENDERIZAR SESSÃO: MURAL DE DESAFIOS ABERTOS (AGUARDANDO DESAFIANTE)
                    if (grid) {
                        if (challenges.length === 0) {
                            grid.innerHTML = `
                                <div style="grid-column: 1 / -1; text-align: center; padding: 36px 16px; background: #171C26; border: 1px dashed #282F3D; border-radius: 14px;">
                                    <div style="font-size: 2rem; color: #ffffff; margin-bottom: 8px;"><i class="fa-solid fa-bullhorn"></i></div>
                                    <div style="font-family: var(--font-gamer); font-size: 1.15rem; font-weight: 800; color: #fff; margin-bottom: 6px;">NENHUM DESAFIO ABERTO NO MOMENTO</div>
                                    <p style="color: #9AA4B2; font-size: 0.85rem; max-width: 420px; margin: 0 auto 16px auto;">
                                        Seja o primeiro a lançar um duelo! Escolha um dos jogos em destaque acima, defina o valor e a sua proposta aparecerá aqui.
                                    </p>
                                </div>
                            `;
                        } else {
                            grid.innerHTML = challenges.map(ch => {
                                const myUid = window.__ARENA_USER_ID || window.__ARENA_CURRENT_USER_ID || 0;
                                const isMyChallenge = myUid > 0 && Number(myUid) === Number(ch.challenger_id);
                                const chName = ch.challenger_name || ch.challenger_tag || 'Combatente';
                                const chGame = ch.game_name || ch.game_title || (ch.game_type || 'HYPER-STRIKE');
                                const chBadge = ch.game_badge || 'COMBATE';
                                const betNum = parseInt(ch.bet_amount) || 0;
                                const feePct = ch.fee_percent || (data.platform_fee_percent || 10);
                                const netPrize = ch.prize_pool || (betNum > 0 ? (betNum * 2 * (1 - feePct / 100)) : 0);
                                const betTxt = `${Math.max(500, betNum).toLocaleString('pt-AO')} Kz`;
                                const prizeTxt = betNum > 0 ? `${netPrize.toLocaleString('pt-AO')} Kz` : '0 Kz';
                                const secsRemaining = Math.max(1, parseInt(ch.seconds_remaining) || 60);

                                return `
                                    <div class="open-challenge-card" id="challenge-card-${ch.id}" data-card-id="${ch.id}" style="background: rgba(16,21,30,0.85); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 18px; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.3s ease; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 10px;">
                                            <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; overflow: hidden;">
                                                <img src="${ch.challenger_avatar || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150'}" style="width: 46px; height: 46px; min-width: 46px; max-width: 46px; min-height: 46px; max-height: 46px; flex-shrink: 0; aspect-ratio: 1/1; border-radius: 50%; object-fit: cover; border: 2px solid #ef4444; box-shadow: 0 0 10px rgba(239,68,68,0.3);">
                                                <div style="min-width: 0; flex: 1; overflow: hidden;">
                                                    <div style="font-family: var(--font-gamer); font-size: 1.02rem; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${chName}">${chName}</div>
                                                    <div style="font-size: 0.75rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><i class="fa-solid fa-map-pin" style="color: #ef4444;"></i> ${ch.challenger_province || 'Angola'}</div>
                                                </div>
                                            </div>
                                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0;">
                                                <span class="badge" style="background: rgba(239,68,68,0.1); border: 1px solid #ef4444; color: #ef4444; font-size: 0.72rem; text-transform: uppercase; font-weight: 800; padding: 4px 8px; border-radius: 6px; white-space: nowrap;">
                                                    ${chBadge}
                                                </span>
                                                <span class="badge" style="background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.4); color: #f59e0b; font-size: 0.70rem; font-weight: 700; padding: 3px 7px; border-radius: 6px; white-space: nowrap;">
                                                    <i class="fa-solid fa-stopwatch"></i> <span class="mural-card-timer" data-secs="${secsRemaining}">${secsRemaining}s</span>
                                                </span>
                                            </div>
                                        </div>

                                        <div style="margin-bottom: 12px; font-size: 0.88rem; color: var(--text-muted);">
                                            <span style="color: var(--text-dim);">Jogo:</span> <strong style="color: #ef4444; font-family: var(--font-gamer);">${chGame}</strong>
                                        </div>

                                        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px; margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align: center;">
                                            <div>
                                                <span style="font-size: 0.72rem; color: var(--text-dim); display: block;">Aposta Individual:</span>
                                                <strong style="color: #ffffff; font-family: var(--font-gamer); font-size: 1.1rem;">${betTxt}</strong>
                                            </div>
                                            <div>
                                                <span style="font-size: 0.72rem; color: var(--text-dim); display: block;">Prêmio Líquido:</span>
                                                <strong style="color: #10b981; font-family: var(--font-gamer); font-size: 1.1rem;">${prizeTxt}</strong>
                                                <span style="font-size: 0.65rem; color: var(--text-dim); display: block;">Taxa de ${feePct}% já deduzida</span>
                                            </div>
                                        </div>

                                        <div>
                                            ${isMyChallenge ? `
                                                <button type="button" class="btn-ngola btn-ngola-secondary" style="width: 100%; font-size: 0.85rem; padding: 8px;" onclick="cancelOpenChallengeByToken('${ch.token}')">
                                                    <i class="fa-solid fa-ban"></i> Cancelar Minha Proposta
                                                </button>
                                            ` : `
                                                <button type="button" class="btn-ngola btn-ngola-primary" style="width: 100%; font-size: 0.9rem; padding: 11px; background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 0 15px rgba(16,185,129,0.35); font-weight: 800;" onclick="promptAcceptOpenChallenge('${ch.token}', ${betNum}, '${chGame.replace(/'/g, "\\'")}', '${chName.replace(/'/g, "\\'")}', ${netPrize}, ${feePct}, ${ch.id})">
                                                    <i class="fa-solid fa-swords"></i> ACEITAR DUELO (${betTxt})
                                                </button>
                                            `}
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        }
                    }
                }
            })
            .catch(err => {
                if (!isRetry) {
                    doFetchOpen('api.php?action=get_open_challenges', true);
                } else {
                    console.error('Erro ao sincronizar mural de propostas:', err);
                }
            });
    }

    doFetchOpen(getArenaApiEndpoint('get_open_challenges'), false);
}

function promptAcceptOpenChallenge(token, betAmount, gameName, challengerName, netPrize, feePct) {
    if (!window.__ARENA_LOGGED_USER) {
        showArenaConfirm({
            title: 'AUTENTICAÇÃO NECESSÁRIA',
            icon: 'fa-solid fa-user-lock',
            html: '<p style="margin-bottom: 0;">Inicie sessão na sua conta NgolaBiz para entrar em duelos competitivos com apostas.</p>',
            confirmText: 'Fazer Login',
            onConfirm: () => {
                window.location.href = `${window.__ARENA_BASE_URL}/login.php`;
            }
        });
        return;
    }

    if (betAmount > userWalletBalance) {
        showArenaConfirm({
            title: 'SALDO INSUFICIENTE NA CARTEIRA',
            icon: 'fa-solid fa-wallet',
            html: `
                <p>O seu saldo disponível é de <strong style="color: #ffffff;">${userWalletBalance.toLocaleString('pt-AO')} Kz</strong>, insuficiente para a aposta de <strong style="color: #ef4444;">${betAmount.toLocaleString('pt-AO')} Kz</strong>.</p>
                <p style="font-size: 0.82rem; color: var(--text-dim); margin-bottom: 0;">Faça um depósito rápido na sua carteira para entrar neste combate.</p>
            `,
            confirmText: 'Fazer Depósito',
            onConfirm: () => {
                window.open(`${window.__ARENA_MAIN_URL || 'https://ngolabiz.it.ao'}/wallet`, '_blank');
            }
        });
        return;
    }

    const feePercent = feePct || 10;
    const prizeCalculated = netPrize || (betAmount * 2 * (1 - feePercent / 100));

    showArenaConfirm({
        title: 'CONFIRMAR ENTRADA NO DUELO',
        icon: 'fa-solid fa-swords',
        html: `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 14px; margin-bottom: 14px; text-align: left;">
                <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 5px;">Oponente: <strong style="color: #fff;">${challengerName}</strong></div>
                <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 5px;">Jogo: <strong style="color: #ef4444;">${gameName}</strong></div>
                <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 5px;">Sua Aposta: <strong style="color: #ffffff;">${betAmount.toLocaleString('pt-AO')} Kz</strong></div>
                <div style="font-size: 0.85rem; color: var(--text-dim);">Prêmio Líquido do Vencedor: <strong style="color: #10b981; font-size: 1.1rem;">${prizeCalculated.toLocaleString('pt-AO')} Kz</strong></div>
                <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 4px;">Taxa da plataforma da casa: ${feePercent}% já deduzida.</div>
            </div>
            <p style="font-size: 0.86rem; color: #cbd5e1; margin-bottom: 0;">
                Ambos apostam o mesmo valor. Se você vencer o confronto, fatura o prêmio líquido total diretamente na sua carteira!
            </p>
        `,
        confirmText: `ACEITAR & BATALHAR (${betAmount.toLocaleString('pt-AO')} Kz)`,
        confirmStyle: 'background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 0 20px rgba(16,185,129,0.45);',
        onConfirm: () => {
            executeAcceptOpenChallenge(token, betAmount);
        }
    });
}

function executeAcceptOpenChallenge(token, betAmount) {
    if (window.arenaAudio) window.arenaAudio.playClick();
    
    // Feedback visual imediato: transformar o card no mural para estado fechado
    const cardEl = document.querySelector(`[onclick*="${token}"]`) ? document.querySelector(`[onclick*="${token}"]`).closest('.open-challenge-card') : null;
    if (cardEl) {
        cardEl.style.border = '2px solid #10b981';
        cardEl.style.boxShadow = '0 0 25px rgba(16,185,129,0.5)';
        const btn = cardEl.querySelector('button');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CONECTANDO AO DUELO...';
            btn.style.background = '#10b981';
        }
    }

    fetch(`${window.__ARENA_BASE_URL}/api.php?action=accept_open_challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_token: token, token: token })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'ok') {
            if (window.arenaAudio) window.arenaAudio.playMatchFound();
            if (cardEl) {
                cardEl.innerHTML = `
                    <div style="text-align: center; padding: 20px 10px; color: #10b981;">
                        <div style="font-size: 1.8rem; margin-bottom: 8px;"><i class="fa-solid fa-swords fa-beat"></i></div>
                        <div style="font-family: var(--font-gamer); font-size: 1.15rem; font-weight: 900; color: #fff;">PROPOSTA FECHADA COM SUCESSO!</div>
                        <div style="font-size: 0.85rem; color: #34d399; margin-top: 4px;">Entrando na arena de combate...</div>
                    </div>
                `;
            }
            const destUrl = data.redirect_url || `${window.__ARENA_BASE_URL}/play.php?token=${data.challenge_token || token}&bet_amount=${betAmount}&game=${data.game || activeRadarGame}`;
            setTimeout(() => {
                window.location.href = destUrl;
            }, 1000);
        } else {
            showArenaAlert('DUELO INDISPONÍVEL', data.message || 'Não foi possível aceitar este duelo. Talvez já tenha sido aceito por outro jogador.', 'fa-solid fa-circle-exclamation');
            loadOpenChallenges();
        }
    })
    .catch(err => {
        showArenaAlert('ERRO DE COMUNICAÇÃO', 'Falha ao conectar com o servidor da Arena. Tente novamente.', 'fa-solid fa-wifi');
    });
}

function cancelOpenChallengeByToken(token) {
    showArenaConfirm({
        title: 'CANCELAR PROPOSTA',
        icon: 'fa-solid fa-ban',
        html: '<p style="margin-bottom: 0;">Tem a certeza de que deseja cancelar esta proposta aberta no mural?</p>',
        confirmText: 'Sim, Cancelar',
        confirmStyle: 'background: linear-gradient(135deg, #ef4444, #dc2626); box-shadow: 0 0 15px rgba(239,68,68,0.4);',
        onConfirm: () => {
            fetch(`${window.__ARENA_BASE_URL}/api.php?action=cancel_open_challenge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challenge_token: token, token: token })
            })
            .then(res => res.json())
            .then(data => {
                loadOpenChallenges();
            })
            .catch(err => {});
        }
    });
}

// ==========================================
// FEED DE RESULTADOS DOS GANHOS AO VIVO (PAGAMENTOS EM TEMPO REAL)
// ==========================================
let lastSeenPayoutIds = new Set();

function loadLivePayouts(forceReload = false) {
    const tbody = document.getElementById('arena-live-payouts-tbody');
    const legacyGrid = document.getElementById('arena-live-payouts-grid');
    if (!tbody && !legacyGrid) return;

    function doFetchPayouts(apiUrl, isRetry) {
        fetch(apiUrl, { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                if (data.status === 'ok') {
                    const payouts = data.payouts || [];
                    if (payouts.length === 0) {
                        if (tbody) {
                            tbody.innerHTML = `
                                <tr>
                                    <td colspan="6" style="text-align: center; padding: 36px 16px; color: var(--text-muted); background: rgba(255,255,255,0.01);">
                                        <div style="font-size: 1.6rem; color: #ffffff; margin-bottom: 6px;"><i class="fa-solid fa-trophy"></i></div>
                                        <div style="font-family: var(--font-gamer); font-size: 0.95rem; font-weight: 800; color: #fff;">COMPUTANDO RESULTADOS AO VIVO</div>
                                        <p style="color: var(--text-dim); font-size: 0.80rem; margin: 4px 0 0 0;">Os duelos terminados aparecerão nesta tabela em tempo real.</p>
                                    </td>
                                </tr>
                            `;
                        }
                        return;
                    }

                    // Renderizar linhas da tabela estilo Stake / Casino Dark
                    if (tbody) {
                        tbody.innerHTML = payouts.map((p, idx) => {
                            const isNew = !lastSeenPayoutIds.has(p.id);
                            lastSeenPayoutIds.add(p.id);

                            const rowBg = idx % 2 === 0 ? 'background: rgba(255,255,255,0.01);' : 'background: transparent;';
                            const isWin = (p.is_win !== 0);
                            const payoutColor = isWin ? '#10b981' : '#94a3b8';
                            const multiplierColor = isWin ? '#cbd5e1' : '#64748b';

                            const userCol = p.is_private
                                ? `<span style="color: #94a3b8; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
                                       <i class="fa-solid fa-user-secret" style="color: #94a3b8; font-size: 0.95rem;"></i>
                                       <span>Privado</span>
                                   </span>`
                                : `<span style="color: #fff; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                                       <i class="fa-solid fa-shield-halved" style="color: #ef4444; font-size: 0.88rem;"></i>
                                       <span style="max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.user_name}">${p.user_name}</span>
                                   </span>`;

                            const gameIcon = p.game_icon || 'fa-crosshairs';

                            return `
                                <tr class="stake-row" style="${rowBg} border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.2s ease; ${isNew ? 'animation: rowFlash 1.6s ease;' : ''}" onmouseover="this.style.background='rgba(239,68,68,0.04)'" onmouseout="this.style.background='${idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'}'">
                                    <td style="padding: 13px 20px; font-weight: 700; color: #fff;">
                                        <div style="display: flex; align-items: center; gap: 10px;">
                                            <span style="width: 26px; height: 26px; border-radius: 6px; background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; font-size: 0.85rem; color: #94a3b8;">
                                                <i class="fa-solid ${gameIcon}"></i>
                                            </span>
                                            <span style="font-size: 0.88rem;">${p.game_name}</span>
                                        </div>
                                    </td>
                                    <td style="padding: 13px 20px;">
                                        ${userCol}
                                    </td>
                                    <td style="padding: 13px 20px; text-align: center; color: #94a3b8; font-family: monospace; font-size: 0.86rem;">
                                        ${p.time_formatted}
                                    </td>
                                    <td style="padding: 13px 20px; text-align: right; color: #f1f5f9; font-weight: 600; font-size: 0.88rem;">
                                        ${p.bet_amount_formatted}
                                    </td>
                                    <td style="padding: 13px 20px; text-align: center; color: ${multiplierColor}; font-weight: 700; font-size: 0.88rem;">
                                        ${p.multiplier}
                                    </td>
                                    <td style="padding: 13px 20px; text-align: right; font-weight: 800; font-size: 0.92rem; color: ${payoutColor}; text-shadow: ${isWin ? '0 0 10px rgba(16,185,129,0.35)' : 'none'};">
                                        ${p.payout_formatted}
                                    </td>
                                </tr>
                            `;
                        }).join('');
                    }
                }
            })
            .catch(err => {
                if (!isRetry) {
                    doFetchPayouts('api.php?action=get_live_payouts', true);
                } else {
                    console.error('Erro ao sincronizar ganhos ao vivo:', err);
                }
            });
    }

    doFetchPayouts(getArenaApiEndpoint('get_live_payouts'), false);
}

// GESTÃO DE MODO PRIVADO (INCOGNITO) NA ARENA
function toggleUserPrivacy(enabled) {
    localStorage.setItem('gamer_incognito_mode', enabled ? '1' : '0');
    
    const label = document.getElementById('arena-privacy-text');
    const toggle = document.getElementById('arena-privacy-toggle');
    const slider = document.querySelector('.arena-switch-slider');

    if (toggle) toggle.checked = enabled;
    if (slider) {
        slider.style.backgroundColor = enabled ? '#ef4444' : '#334155';
    }
    if (label) {
        if (enabled) {
            label.innerHTML = '<i class="fa-solid fa-user-secret" style="color: #ef4444;"></i> <strong style="color: #ef4444;">Modo Privado Ativo:</strong> Identidade Oculta 🕶️';
        } else {
            label.innerHTML = '<i class="fa-solid fa-user-secret" style="color: #ef4444;"></i> Modo Privado: Ocultar Minha Identidade no Feed';
        }
    }

    // Sincronizar com a API
    fetch(getArenaApiEndpoint('save_privacy_settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_private: enabled ? 1 : 0 })
    }).catch(() => {});

    // Toast discreto
    if (typeof showArenaToast === 'function') {
        if (enabled) {
            showArenaToast('🕶️ Modo Privado ativado! O seu nome e foto aparecerão como "Privado" nos feeds de ganhos.', 'info');
        } else {
            showArenaToast('Modo Público ativado! O seu nome de jogador aparecerá nos feeds oficiais.', 'success');
        }
    }
}

// Inicializar estado do Modo Privado
document.addEventListener('DOMContentLoaded', function() {
    const isPrivateSaved = localStorage.getItem('gamer_incognito_mode') === '1';
    const toggle = document.getElementById('arena-privacy-toggle');
    if (toggle) {
        toggle.checked = isPrivateSaved;
        const slider = document.querySelector('.arena-switch-slider');
        const label = document.getElementById('arena-privacy-text');
        if (slider) slider.style.backgroundColor = isPrivateSaved ? '#ef4444' : '#334155';
        if (label && isPrivateSaved) {
            label.innerHTML = '<i class="fa-solid fa-user-secret" style="color: #ef4444;"></i> <strong style="color: #ef4444;">Modo Privado Ativo:</strong> Identidade Oculta 🕶️';
        }
    }
});

// Atualizar mural e decrementar cronômetros dos cards a cada 1 segundo em tempo real
if (document.getElementById('arena-open-challenges-grid')) {
    loadOpenChallenges();
    setInterval(loadOpenChallenges, 5000);
}

if (document.getElementById('arena-live-payouts-grid')) {
    loadLivePayouts();
    setInterval(loadLivePayouts, 4000);
}

setInterval(() => {
    let hasExpiredCard = false;
    document.querySelectorAll('.mural-card-timer').forEach(el => {
        let secs = parseInt(el.getAttribute('data-secs')) || 0;
        secs = Math.max(0, secs - 1);
        el.setAttribute('data-secs', secs);
        el.innerText = `${secs}s`;
        if (secs <= 0) {
            hasExpiredCard = true;
        }
    });
    if (hasExpiredCard) {
        loadOpenChallenges();
    }
}, 1000);
</script>

<style>
/* MODAL MATCHMAKING CENTRALIZADO E HARMONIOSO */
.radar-modal-overlay {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: rgba(4, 7, 12, 0.88) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    display: none;
    align-items: center !important;
    justify-content: center !important;
    z-index: 99999 !important;
    padding: 16px !important;
    box-sizing: border-box !important;
}
.radar-modal-overlay.active {
    display: flex !important;
}
.radar-modal-box {
    width: 100% !important;
    max-width: 580px !important;
    margin: auto !important;
    box-sizing: border-box !important;
    display: flex !important;
    flex-direction: column !important;
    max-height: 90vh !important;
    overflow-y: auto !important;
}
</style>

<?php if (basename($_SERVER['PHP_SELF']) !== 'play.php' && basename($_SERVER['PHP_SELF']) !== 'suporte.php'): ?>
<!-- BOTÃO FLUTUANTE DE SUPORTE AO VIVO (CHAT COM ADMIN) -->
<a href="<?php echo GAMER_URL; ?>/suporte.php" title="Chat de Suporte com Administrador" style="position: fixed; bottom: 22px; right: 22px; z-index: 9990; background: linear-gradient(135deg, #ef4444, #b91c1c); color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 99px; font-family: var(--font-gamer); font-size: 0.82rem; font-weight: 800; display: flex; align-items: center; gap: 9px; box-shadow: 0 10px 30px rgba(239, 68, 68, 0.45); border: 1px solid rgba(255,255,255,0.22);">
    <i class="fa-solid fa-headset" style="font-size: 1.1rem;"></i>
    <span>SUPORTE</span>
</a>
<?php endif; ?>
</body>
</html>
