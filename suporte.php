<?php
/**
 * ARENA GAMER - CHAT DE SUPORTE AO VIVO (UTILIZADOR <-> ADMINISTRADOR)
 * Comunicação direta em tempo real entre Jogadores e Administração da Arena
 */
require_once(__DIR__ . '/init.php');

if (!$logged_user) {
    header('Location: ' . GAMER_URL . '/auth.php?redirect=' . urlencode(GAMER_URL . '/suporte.php'));
    exit;
}

$uid = (int)$logged_user['user_id'];
$is_admin = arena_is_admin();

// Configurações do Perfil do Atendente de Suporte
$support_agent_name = !empty($arena_settings['support_agent_name']) ? $arena_settings['support_agent_name'] : 'Paula Sousa — Atendimento VIP Casino56';
$support_agent_status = !empty($arena_settings['support_agent_status']) ? $arena_settings['support_agent_status'] : '● Online — Resposta Imediata';
$support_agent_avatar = !empty($arena_settings['support_agent_avatar']) ? $arena_settings['support_agent_avatar'] : 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80';

$page_title = $is_admin ? 'Central de Suporte (Admin)' : 'Suporte Ao Vivo — Chat Oficial';

require_once(__DIR__ . '/header.php');
?>

<main class="arena-page-body">

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <div>
            <h1 style="font-size: 1.55rem; font-weight: 900; color: #fff; font-family: var(--font-gamer); margin: 0;">
                <i class="fa-solid fa-headset" style="color: #ef4444;"></i>
                <?php echo $is_admin ? 'CENTRAL DE SUPORTE (ADMIN &harr; UTILIZADORES)' : 'SUPORTE AO VIVO — CHAT COM O ADMINISTRADOR'; ?>
            </h1>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin: 4px 0 0 0;">
                <?php echo $is_admin 
                    ? 'Responda em tempo real às mensagens, dúvidas e comprovativos enviados pelos jogadores.' 
                    : 'Fale diretamente com a Administração da Arena para suporte em depósitos, levantamentos ou partidas.'; ?>
            </p>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.35); padding: 8px 14px; border-radius: 99px; font-size: 0.82rem; color: #10b981; font-weight: 700;">
            <span class="live-pulse-dot"></span> Atendimento Online em Tempo Real
        </div>
    </div>

    <?php if ($is_admin): ?>
    <!-- =========================================================================
         MODO ADMINISTRADOR: LISTA DE UTILIZADORES + JANELA DE CHAT
         ========================================================================= -->
    <div style="display: grid; grid-template-columns: 320px 1fr; gap: 20px; min-height: 560px;" class="support-admin-grid">
        <!-- Lista de Conversas de Utilizadores -->
        <div class="arena-card" style="padding: 0; display: flex; flex-direction: column; overflow: hidden;">
            <div style="padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); font-weight: 800; font-family: var(--font-gamer); font-size: 0.9rem; color: #fff; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fa-solid fa-users" style="color:#ef4444;"></i> Conversas de Utilizadores</span>
                <span id="admin-total-threads" style="font-size: 0.75rem; color: var(--text-muted);">0</span>
            </div>
            <div id="admin-support-users-list" style="flex: 1; overflow-y: auto; max-height: 500px; padding: 8px;">
                <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                    A carregar conversas...
                </div>
            </div>
        </div>

        <!-- Janela de Chat do Utilizador Selecionado -->
        <div class="arena-card" style="padding: 0; display: flex; flex-direction: column; overflow: hidden;">
            <div id="admin-chat-header" style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; background: #12141c;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img id="admin-active-user-avatar" src="https://ui-avatars.com/api/?name=User&background=ef4444&color=fff" alt="Avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #ef4444;">
                    <div>
                        <div id="admin-active-user-name" style="font-weight: 800; color: #fff; font-size: 0.98rem;">Selecione um utilizador à esquerda</div>
                        <div id="admin-active-user-meta" style="font-size: 0.76rem; color: var(--text-muted);">Clique numa conversa para responder</div>
                    </div>
                </div>
            </div>

            <div id="support-messages-box" style="flex: 1; height: 400px; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; background: #0a0b0f;">
                <div style="text-align: center; color: var(--text-dim); margin: auto;">
                    <i class="fa-solid fa-comments" style="font-size: 2.2rem; color: #ef4444; margin-bottom: 8px; display: block;"></i>
                    Escolha um jogador na lista para visualizar e responder às mensagens.
                </div>
            </div>

            <form id="support-send-form" onsubmit="sendSupportChatMessage(event)" style="padding: 14px 16px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; gap: 10px; align-items: center; background: #12141c;">
                <input type="hidden" id="support-target-uid" value="0">
                <input type="text" id="support-msg-input" placeholder="Escreva a resposta do Administrador..." required style="flex: 1; background: #181b26; border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; padding: 12px 14px; color: #fff; font-size: 0.92rem;">
                <button type="submit" class="btn-launch-hero" style="padding: 12px 20px; border-radius: 10px;">
                    <i class="fa-solid fa-paper-plane"></i> Enviar
                </button>
            </form>
        </div>
    </div>

    <?php else: ?>
    <!-- =========================================================================
         MODO UTILIZADOR: CHAT DIRETO COM O ADMINISTRADOR
         ========================================================================= -->
    <div style="max-width: 820px; margin: 0 auto;">
        <!-- Botões de Assunto Rápido -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px;">
            <button type="button" onclick="fillQuickSupportMsg('Olá Admin, acabei de enviar um comprovativo de depósito via Multicaixa Express. Pode verificar por favor?')" style="background: #14161f; border: 1px solid rgba(239,68,68,0.35); color: #fff; padding: 7px 13px; border-radius: 99px; font-size: 0.8rem; cursor: pointer; font-weight: 600;">
                💳 Dúvida sobre Depósito
            </button>
            <button type="button" onclick="fillQuickSupportMsg('Olá Admin, gostaria de solicitar um levantamento do meu saldo da carteira.')" style="background: #14161f; border: 1px solid rgba(255,255,255,0.12); color: #fff; padding: 7px 13px; border-radius: 99px; font-size: 0.8rem; cursor: pointer; font-weight: 600;">
                💰 Solicitar Levantamento
            </button>
            <button type="button" onclick="fillQuickSupportMsg('Olá Admin, preciso de ajuda com uma partida na Arena.')" style="background: #14161f; border: 1px solid rgba(255,255,255,0.12); color: #fff; padding: 7px 13px; border-radius: 99px; font-size: 0.8rem; cursor: pointer; font-weight: 600;">
                🎮 Ajuda numa Partida
            </button>
        </div>

        <div class="arena-card" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; border: 1px solid rgba(239,68,68,0.35);">
            <div style="padding: 16px 20px; background: #12141c; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #ef4444, #991b1b); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: #fff;">
                        <i class="fa-solid fa-user-shield"></i>
                    </div>
                    <div>
                        <div style="font-weight: 800; color: #fff; font-size: 1rem;">Administrador da Arena</div>
                        <div style="font-size: 0.78rem; color: #10b981; font-weight: 600;">● Online — Resposta Rápida</div>
                    </div>
                </div>
                <a href="<?php echo GAMER_URL; ?>/deposito.php" style="color: #fbbf24; font-size: 0.82rem; font-weight: 700; text-decoration: none;">
                    <i class="fa-solid fa-wallet"></i> Ir para Depósitos
                </a>
            </div>

            <div id="support-messages-box" style="height: 420px; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; background: #0a0b0f;">
                <div style="text-align: center; color: var(--text-dim); margin: auto;">
                    A carregar histórico do chat...
                </div>
            </div>

            <form id="support-send-form" onsubmit="sendSupportChatMessage(event)" style="padding: 14px 16px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; gap: 10px; align-items: center; background: #12141c;">
                <input type="hidden" id="support-target-uid" value="<?php echo $uid; ?>">
                <input type="text" id="support-msg-input" placeholder="Digite a sua mensagem para o Administrador..." required style="flex: 1; background: #181b26; border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; padding: 12px 14px; color: #fff; font-size: 0.94rem;">
                <button type="submit" class="btn-launch-hero" style="padding: 12px 22px; border-radius: 10px;">
                    <i class="fa-solid fa-paper-plane"></i> Enviar
                </button>
            </form>
        </div>
    </div>
    <?php endif; ?>

</main>

<style>
@media (max-width: 820px) {
    .support-admin-grid {
        grid-template-columns: 1fr !important;
    }
}
.support-bubble-row {
    display: flex;
    flex-direction: column;
    max-width: 78%;
}
.support-bubble-row.mine {
    align-self: flex-end;
    align-items: flex-end;
}
.support-bubble-row.theirs {
    align-self: flex-start;
    align-items: flex-start;
}
.support-bubble {
    padding: 11px 15px;
    border-radius: 14px;
    font-size: 0.92rem;
    line-height: 1.45;
    word-break: break-word;
}
.support-bubble-row.mine .support-bubble {
    background: linear-gradient(135deg, #ef4444, #b91c1c);
    color: #fff;
    border-bottom-right-radius: 4px;
}
.support-bubble-row.theirs .support-bubble {
    background: #181b26;
    border: 1px solid rgba(255,255,255,0.1);
    color: #f3f4f6;
    border-bottom-left-radius: 4px;
}
.support-time {
    font-size: 0.7rem;
    color: #6b7280;
    margin-top: 4px;
}
.admin-user-thread-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 11px 12px;
    border-radius: 10px;
    cursor: pointer;
    border: 1px solid transparent;
    margin-bottom: 6px;
    background: #12141c;
    transition: all 0.15s;
}
.admin-user-thread-item:hover, .admin-user-thread-item.active {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.12);
}
</style>

<script>
const IS_SUPPORT_ADMIN = <?php echo $is_admin ? 'true' : 'false'; ?>;
let currentTargetUid = <?php echo $is_admin ? 0 : $uid; ?>;
let lastRenderedCount = -1;

function fillQuickSupportMsg(txt) {
    const inp = document.getElementById('support-msg-input');
    if (inp) {
        inp.value = txt;
        inp.focus();
    }
}

function selectAdminThread(uid, tag, avatar, balance) {
    currentTargetUid = uid;
    lastRenderedCount = -1;
    document.getElementById('support-target-uid').value = uid;
    document.getElementById('admin-active-user-name').textContent = tag;
    document.getElementById('admin-active-user-avatar').src = avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(tag);
    document.getElementById('admin-active-user-meta').textContent = 'ID #' + uid + ' • Saldo: ' + balance + ' Kz';
    loadSupportConversation();
}

function loadSupportConversation() {
    const apiBase = window.__ARENA_BASE_URL || '';
    const url = apiBase + '/api.php?action=support_get_messages&target_user_id=' + currentTargetUid + '&t=' + Date.now();
    fetch(url)
        .then(r => r.json())
        .then(data => {
            if (data.status !== 'ok') return;

            if (IS_SUPPORT_ADMIN && Array.isArray(data.conversations)) {
                const listEl = document.getElementById('admin-support-users-list');
                const cntEl = document.getElementById('admin-total-threads');
                if (cntEl) cntEl.textContent = data.conversations.length + ' conversas';

                if (data.conversations.length === 0) {
                    listEl.innerHTML = '<div style="padding:24px;text-align:center;color:#6b7280;font-size:0.84rem;">Nenhuma mensagem de suporte recebida ainda.</div>';
                } else {
                    if (!currentTargetUid && data.conversations[0]) {
                        const first = data.conversations[0];
                        selectAdminThread(first.user_id, first.gamer_tag, first.user_avatar, first.wallet_balance);
                        return;
                    }
                    listEl.innerHTML = data.conversations.map(c => {
                        const activeCls = (parseInt(c.user_id) === parseInt(currentTargetUid)) ? 'active' : '';
                        const badge = (parseInt(c.unread_count) > 0)
                            ? `<span style="background:#ef4444;color:#fff;font-size:0.7rem;font-weight:800;padding:2px 7px;border-radius:99px;">${c.unread_count}</span>`
                            : '';
                        return `
                            <div class="admin-user-thread-item ${activeCls}" onclick="selectAdminThread(${c.user_id}, '${(c.gamer_tag||'').replace(/'/g, "\\'")}', '${(c.user_avatar||'').replace(/'/g, "\\'")}', '${c.wallet_balance}')">
                                <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                                    <img src="${c.user_avatar || 'https://ui-avatars.com/api/?name=U'}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                                    <div style="min-width:0;">
                                        <div style="font-weight:700;color:#fff;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.gamer_tag}</div>
                                        <div style="font-size:0.75rem;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px;">${c.last_message || ''}</div>
                                    </div>
                                </div>
                                ${badge}
                            </div>
                        `;
                    }).join('');
                }
            }

            const box = document.getElementById('support-messages-box');
            if (!box) return;
            const msgs = data.messages || [];
            if (msgs.length === lastRenderedCount) return;
            lastRenderedCount = msgs.length;

            if (msgs.length === 0) {
                box.innerHTML = `
                    <div style="text-align:center;color:#9ca3af;margin:auto;max-width:380px;">
                        <i class="fa-solid fa-comments" style="font-size:2.2rem;color:#ef4444;margin-bottom:10px;display:block;"></i>
                        <strong style="color:#fff;display:block;margin-bottom:4px;">Bem-vindo ao Chat de Suporte!</strong>
                        Envie a sua mensagem abaixo e o Administrador responderá aqui mesmo em tempo real.
                    </div>
                `;
                return;
            }

            box.innerHTML = msgs.map(m => {
                const isMine = IS_SUPPORT_ADMIN ? (m.sender_role === 'admin') : (m.sender_role === 'user');
                const senderLabel = (m.sender_role === 'admin') ? '🛡️ Administrador' : m.gamer_tag;
                return `
                    <div class="support-bubble-row ${isMine ? 'mine' : 'theirs'}">
                        <div class="support-bubble">
                            <div style="font-size:0.7rem;font-weight:800;opacity:0.85;margin-bottom:3px;">${senderLabel}</div>
                            <div>${m.message_html}</div>
                        </div>
                        <div class="support-time">${m.time_formatted}</div>
                    </div>
                `;
            }).join('');
            box.scrollTop = box.scrollHeight;
        })
        .catch(() => {});
}

function sendSupportChatMessage(e) {
    e.preventDefault();
    const inp = document.getElementById('support-msg-input');
    const msg = inp.value.trim();
    if (!msg) return;
    if (IS_SUPPORT_ADMIN && !currentTargetUid) {
        alert('Selecione um utilizador na lista à esquerda para responder.');
        return;
    }

    inp.value = '';
    const apiBase = window.__ARENA_BASE_URL || '';
    const fd = new FormData();
    fd.append('action', 'support_send_message');
    fd.append('target_user_id', currentTargetUid);
    fd.append('message', msg);

    fetch(apiBase + '/api.php', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(res => {
            if (res.status === 'ok') {
                lastRenderedCount = -1;
                loadSupportConversation();
            }
        });
}

loadSupportConversation();
setInterval(loadSupportConversation, 2500);
</script>

<?php require_once(__DIR__ . '/footer.php'); ?>
