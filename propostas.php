<?php
/**
 * NGOLABIZ ARENA - CENTRAL DE PROPOSTAS & DUELOS ABERTOS
 * Catálogo Completo de Desafios em Tempo Real com Filtros e Ação Imediata
 */
require_once(__DIR__ . '/header.php');
?>

<main class="arena-main-content" style="max-width: 1300px; margin: 0 auto; padding: 24px 16px 60px 16px;">

    <!-- BREADCRUMB & NAVEGAÇÃO -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-dim);">
            <a href="<?php echo GAMER_URL; ?>/index.php" style="color: var(--text-muted); text-decoration: none;">
                <i class="fa-solid fa-house"></i> Início
            </a>
            <span>/</span>
            <span style="color: var(--neon-cyan); font-weight: 700;">Propostas de Duelos</span>
        </div>
        <a href="<?php echo GAMER_URL; ?>/index.php" class="btn-ngola btn-ngola-secondary btn-sm" style="text-decoration: none;">
            <i class="fa-solid fa-arrow-left"></i> Voltar à Arena
        </a>
    </div>

    <!-- HERO HEADER DA PÁGINA DE PROPOSTAS -->
    <div class="arena-card" style="background: linear-gradient(135deg, rgba(16,21,30,0.95), rgba(8,11,16,0.98)); border: 1px solid rgba(239, 68, 68,0.25); border-radius: 16px; padding: 24px 28px; margin-bottom: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); position: relative; overflow: hidden;">
        <div style="position: absolute; right: -20px; bottom: -20px; font-size: 10rem; color: rgba(239, 68, 68,0.03); pointer-events: none;">
            <i class="fa-solid fa-swords"></i>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; position: relative; z-index: 2;">
            <div style="max-width: 680px;">
                <span class="badge" style="background: rgba(239, 68, 68,0.12); border: 1px solid var(--neon-cyan); color: var(--neon-cyan); font-size: 0.75rem; font-weight: 800; letter-spacing: 1px; padding: 5px 12px; border-radius: 999px; text-transform: uppercase; margin-bottom: 10px; display: inline-block;">
                    <i class="fa-solid fa-bolt"></i> MERCADO DE DUELOS AO VIVO
                </span>
                <h1 style="font-family: var(--font-gamer); font-size: clamp(1.8rem, 4vw, 2.4rem); font-weight: 900; color: #fff; margin: 4px 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">
                    Mural Completo de Duelos & Desafios
                </h1>
                <p style="color: var(--text-dim); font-size: 0.92rem; line-height: 1.5; margin: 0;">
                    Participe em duelos competitivos 1 vs 1 na Arena NgolaBiz. Escolha a sua aposta, enfrente combatentes reais ou aceite os desafios abertos abaixo para disputar prémios imediatos na sua carteira.
                </p>
            </div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <button type="button" class="btn-ngola btn-ngola-primary" onclick="openMatchmakingModal('hyperstrike')" style="padding: 14px 26px; font-size: 0.95rem; font-weight: 800; text-transform: uppercase; border-radius: 10px; box-shadow: 0 4px 20px rgba(239, 68, 68,0.35);">
                    <i class="fa-solid fa-plus-circle"></i> Criar Nova Proposta
                </button>
            </div>
        </div>
    </div>

    <!-- BARRA DE FILTROS RÁPIDOS -->
    <div style="background: rgba(16,21,30,0.7); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
            
            <!-- FILTRO POR JOGO -->
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 0.80rem; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px;">
                    <i class="fa-solid fa-gamepad"></i> Jogo:
                </span>
                <button type="button" class="filter-pill active" onclick="filterProposals('all', this)">
                    Todos
                </button>
                <button type="button" class="filter-pill" onclick="filterProposals('hyperstrike', this)">
                    ⚡ HYPER-STRIKE
                </button>
                <button type="button" class="filter-pill" onclick="filterProposals('neon-fist', this)">
                    🥊 Neon Fist
                </button>
                <button type="button" class="filter-pill" onclick="filterProposals('mkjs', this)">
                    🥋 MK.js
                </button>
            </div>

            <!-- FILTRO POR VALOR -->
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 0.80rem; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px;">
                    <i class="fa-solid fa-coins"></i> Aposta:
                </span>
                <button type="button" class="filter-pill active" onclick="filterBet('all', this)">
                    Todas
                </button>

                <button type="button" class="filter-pill" onclick="filterBet('low', this)">
                    500 - 1.000 Kz
                </button>
                <button type="button" class="filter-pill" onclick="filterBet('mid', this)">
                    2.500 - 5.000 Kz
                </button>
                <button type="button" class="filter-pill" onclick="filterBet('high', this)">
                    10.000 Kz+
                </button>
            </div>

        </div>
    </div>

    <!-- BANNER DE COMBATE ACEITO AO VIVO -->
    <div id="arena-live-duel-feed" style="display: none; margin-bottom: 20px;"></div>

    <!-- MURAL COMPLETO DE PROPOSTAS -->
    <div class="arena-section-wrap" style="margin-top: 0;">
        <div class="panel-header-wrap">
            <div>
                <h2 class="panel-title" style="font-size: 1.25rem;">
                    <i class="fa-solid fa-swords" style="color: #ef4444;"></i> DESAFIOS DISPONÍVEIS AGORA
                </h2>
                <div style="font-size: 0.85rem; color: var(--text-dim); margin-top: 2px;">
                    Clique em qualquer proposta aberta para aceitar e entrar imediatamente na batalha.
                </div>
            </div>
            <button type="button" class="btn-ngola btn-ngola-secondary btn-sm" onclick="loadOpenChallenges(true)" title="Recarregar Propostas">
                <i class="fa-solid fa-rotate"></i> Atualizar Lista
            </button>
        </div>

        <div id="arena-open-challenges-grid" class="open-challenges-grid">
            <div class="challenges-loading-box">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.6rem; color: var(--neon-cyan);"></i>
                <span style="margin-left: 10px; color: var(--text-muted);">Sincronizando propostas abertas no mural...</span>
            </div>
        </div>
    </div>

    <!-- SEÇÃO DE RESULTADOS & GANHOS AO VIVO -->
    <div class="arena-section-wrap" id="arena-live-wins-section" style="margin-top: 50px;">
        <div class="panel-header-wrap">
            <div>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap;">
                    <h2 class="panel-title" style="margin: 0; font-size: 1.25rem;">
                        <i class="fa-solid fa-trophy" style="color: var(--neon-gold);"></i> RESULTADOS DOS GANHOS AO VIVO
                    </h2>
                    <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 800; color: #10b981; letter-spacing: 1px; text-transform: uppercase; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.35); padding: 3px 10px; border-radius: 999px;">
                        <span style="width: 7px; height: 7px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; display: inline-block;"></span>
                        PAGAMENTOS EM TEMPO REAL
                    </span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-dim);">
                    Combatentes reais e bots que acabaram de vencer duelos e faturar prémios líquidos na carteira.
                </div>
            </div>
            <button type="button" class="btn-ngola btn-ngola-secondary btn-sm" onclick="loadLivePayouts(true)" title="Recarregar Feed de Ganhos">
                <i class="fa-solid fa-rotate"></i> Atualizar Feed
            </button>
        </div>

        <div id="arena-live-payouts-grid" class="live-payouts-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 16px; margin-top: 16px;">
            <div class="challenges-loading-box" style="grid-column: 1 / -1; text-align: center; padding: 30px 15px; color: var(--text-muted); background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.08);">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.6rem; color: var(--neon-gold);"></i>
                <span style="margin-left: 10px;">Sincronizando ganhos e vitórias ao vivo...</span>
            </div>
        </div>
    </div>

</main>

<style>
.filter-pill {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--text-muted);
    font-size: 0.80rem;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.filter-pill:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
    color: #fff;
}
.filter-pill.active {
    background: rgba(239, 68, 68, 0.2);
    border-color: var(--neon-cyan);
    color: var(--neon-cyan);
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.3);
}
</style>

<script>
let currentSelectedGame = 'all';
let currentSelectedBet = 'all';

function filterProposals(gameKey, btn) {
    currentSelectedGame = gameKey;
    document.querySelectorAll('.filter-pill').forEach(b => {
        if (b.getAttribute('onclick') && b.getAttribute('onclick').includes('filterProposals')) {
            b.classList.remove('active');
        }
    });
    if (btn) btn.classList.add('active');
    applyCardFilters();
}

function filterBet(betRange, btn) {
    currentSelectedBet = betRange;
    document.querySelectorAll('.filter-pill').forEach(b => {
        if (b.getAttribute('onclick') && b.getAttribute('onclick').includes('filterBet')) {
            b.classList.remove('active');
        }
    });
    if (btn) btn.classList.add('active');
    applyCardFilters();
}

function applyCardFilters() {
    const cards = document.querySelectorAll('.open-challenge-card:not(.card-matched-closing)');
    cards.forEach(c => {
        let matchGame = true;
        let matchBet = true;

        if (currentSelectedGame !== 'all') {
            const cardText = c.textContent.toLowerCase();
            if (currentSelectedGame === 'hyperstrike' && !cardText.includes('hyper')) matchGame = false;
            if (currentSelectedGame === 'neon-fist' && !cardText.includes('neon')) matchGame = false;
            if (currentSelectedGame === 'mkjs' && !cardText.includes('kombat') && !cardText.includes('mk')) matchGame = false;
        }

        if (currentSelectedBet !== 'all') {
            const cardText = c.textContent.replace(/\\./g, '');
            if (currentSelectedBet === 'free' && !cardText.includes('treino') && !cardText.includes('0 kz')) matchBet = false;
            if (currentSelectedBet === 'low' && !cardText.includes('500') && !cardText.includes('1000') && !cardText.includes('1.000')) matchBet = false;
            if (currentSelectedBet === 'mid' && !cardText.includes('2500') && !cardText.includes('2.500') && !cardText.includes('5000') && !cardText.includes('5.000')) matchBet = false;
            if (currentSelectedBet === 'high' && !cardText.includes('10000') && !cardText.includes('10.000')) matchBet = false;
        }

        c.style.display = (matchGame && matchBet) ? 'flex' : 'none';
    });
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof loadOpenChallenges === 'function') {
        loadOpenChallenges();
        setInterval(function() {
            loadOpenChallenges(false);
            setTimeout(applyCardFilters, 250);
        }, 4000);
    }

    if (typeof loadLivePayouts === 'function') {
        loadLivePayouts();
        setInterval(function() {
            loadLivePayouts(false);
        }, 4000);
    }
});
</script>

<?php require_once(__DIR__ . '/footer.php'); ?>
