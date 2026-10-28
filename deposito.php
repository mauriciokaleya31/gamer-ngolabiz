<?php
/**
 * ARENA GAMER - PÁGINA OFICIAL DE DEPÓSITO MANUAL (MULTICAIXA EXPRESS)
 * Entidade: 930 | Referência: 929852534
 * Upload de Comprovativo (PDF ou Foto) + Página de Obrigado com Crédito em 5 Segundos
 */
require_once(__DIR__ . '/init.php');

if (!$logged_user) {
    header('Location: ' . GAMER_URL . '/auth.php?redirect=' . urlencode(GAMER_URL . '/deposito.php'));
    exit;
}

$uid = (int)$logged_user['user_id'];

// Exigência de Verificação de Identidade (KYC) para Depósitos
if (!arena_is_user_verified($uid)) {
    header('Location: ' . GAMER_URL . '/verificacao.php?notice=deposit_requires_kyc');
    exit;
}

$my_tag = $gamer_profile['gamer_tag'] ?? ($logged_user['fullname'] ?: $logged_user['user_name']);
$error = '';
$deposit_success = false;
$deposited_amount = 0;
$receipt_url_saved = '';

// Processar envio do comprovativo
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'submit_deposit') {
    $amount = (float)($_POST['amount'] ?? 0);
    if ($amount < 100) {
        $error = 'O valor mínimo de depósito é de 100 Kz.';
    } elseif (!isset($_FILES['comprovativo']) || $_FILES['comprovativo']['error'] !== UPLOAD_ERR_OK) {
        $error = 'Por favor, selecione o ficheiro do comprovativo (PDF ou Foto) para enviar.';
    } else {
        $file = $_FILES['comprovativo'];
        $orig_name = $file['name'];
        $ext = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));
        $allowed_exts = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif'];

        if (!in_array($ext, $allowed_exts)) {
            $error = 'Formato inválido. Envie apenas comprovativo em PDF ou Foto (JPG, PNG, WEBP).';
        } elseif ($file['size'] > 12 * 1024 * 1024) {
            $error = 'O ficheiro é demasiado grande (máximo 12 MB).';
        } else {
            $upload_dir = __DIR__ . '/uploads/comprovativos';
            if (!is_dir($upload_dir)) {
                @mkdir($upload_dir, 0755, true);
            }
            $safe_filename = 'comp_' . $uid . '_' . time() . '_' . rand(100, 999) . '.' . $ext;
            $dest_path = $upload_dir . '/' . $safe_filename;

            if (move_uploaded_file($file['tmp_name'], $dest_path)) {
                $rel_path = 'uploads/comprovativos/' . $safe_filename;
                $receipt_url_saved = GAMER_URL . '/' . $rel_path;
                $tag_esc = $db->real_escape_string($my_tag);
                $rel_esc = $db->real_escape_string($rel_path);

                // Registar o depósito na tabela arena_deposits
                $db->query("INSERT INTO arena_deposits 
                    (user_id, gamer_tag, amount, entity, reference, receipt_file, status, created_at) 
                    VALUES 
                    ({$uid}, '{$tag_esc}', {$amount}, '930', '929852534', '{$rel_esc}', 'approved', NOW())");

                // Creditar o saldo na conta do utilizador
                $db->query("UPDATE users SET user_wallet_balance = user_wallet_balance + {$amount} WHERE user_id = {$uid}");

                // Registar na tabela wallet_transactions se existir
                @$db->query("INSERT INTO wallet_transactions (user_id, node_type, node_id, amount, type, date) 
                             VALUES ({$uid}, 'arena_deposit', 0, {$amount}, 'in', NOW())");

                // Atualizar saldo em memória para exibição
                $logged_user['user_wallet_balance'] = (float)$logged_user['user_wallet_balance'] + $amount;
                $deposited_amount = $amount;
                $deposit_success = true;
            } else {
                $error = 'Não foi possível guardar o comprovativo. Tente novamente.';
            }
        }
    }
}

// Buscar histórico de depósitos do utilizador
$my_deposits = [];
$res_dep = $db->query("SELECT * FROM arena_deposits WHERE user_id = {$uid} ORDER BY id DESC LIMIT 15");
if ($res_dep) {
    while ($r = $res_dep->fetch_assoc()) {
        $my_deposits[] = $r;
    }
}

// Se for Admin, buscar também os últimos depósitos gerais de todos os utilizadores
$all_deposits_admin = [];
if (arena_is_admin()) {
    $res_all = $db->query("SELECT * FROM arena_deposits ORDER BY id DESC LIMIT 30");
    if ($res_all) {
        while ($ra = $res_all->fetch_assoc()) {
            $all_deposits_admin[] = $ra;
        }
    }
}

$page_title = 'Fazer Depósito — Multicaixa Express';
require_once(__DIR__ . '/header.php');
?>

<main class="arena-page-body">

    <?php if ($deposit_success): ?>
    <!-- =========================================================================
         ECRÃ / PÁGINA DE OBRIGADO COM CONTAGEM DE 5 SEGUNDOS
         ========================================================================= -->
    <div style="max-width: 580px; margin: 20px auto 40px auto;">
        <div class="arena-card" style="text-align: center; padding: 40px 28px; border: 2px solid #10b981; box-shadow: 0 20px 60px rgba(16, 185, 129, 0.2);">
            <div id="thankyou-icon-wrap" style="width: 86px; height: 86px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; font-size: 2.5rem; color: #10b981;">
                <i class="fa-solid fa-circle-check fa-bounce"></i>
            </div>

            <h1 style="font-family: var(--font-gamer); font-size: 1.65rem; font-weight: 900; color: #fff; margin-bottom: 10px;">
                OBRIGADO PELO SEU DEPÓSITO!
            </h1>

            <p style="font-size: 1.02rem; color: #d1d5db; max-width: 460px; margin: 0 auto 24px auto; line-height: 1.6;">
                Recebemos o seu comprovativo de <strong style="color: #10b981;"><?php echo number_format($deposited_amount, 0, ',', '.'); ?> Kz</strong> com sucesso.<br>
                <span id="thankyou-status-text" style="color: #fbbf24; font-weight: 700;">
                    O seu pagamento cairá na sua conta em <span id="deposit-countdown-num" style="font-size: 1.35rem; color: #fff; font-family: var(--font-gamer);">5</span> segundos...
                </span>
            </p>

            <!-- Barra de Progresso de 5 Segundos -->
            <div style="width: 100%; max-width: 400px; height: 12px; background: #161822; border-radius: 99px; overflow: hidden; margin: 0 auto 24px auto; border: 1px solid rgba(255,255,255,0.1);">
                <div id="deposit-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ef4444, #10b981); transition: width 1s linear;"></div>
            </div>

            <!-- Caixa de Confirmação Final (aparece após os 5 segundos) -->
            <div id="deposit-confirmed-box" style="display: none; background: rgba(16, 185, 129, 0.12); border: 1px solid #10b981; border-radius: 14px; padding: 18px; margin-bottom: 24px;">
                <div style="font-size: 0.82rem; color: #a7f3d0; text-transform: uppercase; font-weight: 800; letter-spacing: 1px;">
                    <i class="fa-solid fa-bolt"></i> PAGAMENTO CREDITADO NA CONTA!
                </div>
                <div style="font-size: 1.65rem; font-weight: 900; color: #fff; font-family: var(--font-gamer); margin-top: 6px;">
                    Novo Saldo: <?php echo number_format($logged_user['user_wallet_balance'], 2, ',', '.'); ?> Kz
                </div>
            </div>

            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <a href="<?php echo GAMER_URL; ?>/index.php" class="btn-launch-hero" style="text-decoration: none; padding: 13px 26px; font-size: 0.95rem;">
                    <i class="fa-solid fa-gamepad"></i> IR PARA A ARENA JOGAR
                </a>
                <a href="<?php echo GAMER_URL; ?>/deposito.php" class="btn-ngola btn-ngola-secondary" style="text-decoration: none; padding: 13px 20px;">
                    <i class="fa-solid fa-plus"></i> Novo Depósito
                </a>
            </div>
        </div>
    </div>

    <script>
    (function() {
        let secs = 5;
        const numEl = document.getElementById('deposit-countdown-num');
        const statusEl = document.getElementById('thankyou-status-text');
        const barEl = document.getElementById('deposit-progress-bar');
        const confirmedBox = document.getElementById('deposit-confirmed-box');

        setTimeout(() => { if (barEl) barEl.style.width = '20%'; }, 50);

        const timer = setInterval(() => {
            secs--;
            const pct = Math.min(100, ((5 - secs) / 5) * 100);
            if (barEl) barEl.style.width = pct + '%';

            if (secs > 0) {
                if (numEl) numEl.textContent = secs;
            } else {
                clearInterval(timer);
                if (statusEl) {
                    statusEl.innerHTML = '<span style="color: #10b981; font-size: 1.1rem;"><i class="fa-solid fa-check-double"></i> Pagamento confirmado e creditado com sucesso!</span>';
                }
                if (confirmedBox) {
                    confirmedBox.style.display = 'block';
                }
            }
        }, 1000);
    })();
    </script>
    <?php else: ?>

    <!-- =========================================================================
         SECÇÃO PRINCIPAL DE DEPÓSITO VIA MULTICAIXA EXPRESS
         ========================================================================= -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
        <div>
            <h1 style="font-size: 1.65rem; font-weight: 900; color: #fff; font-family: var(--font-gamer); margin: 0;">
                <i class="fa-solid fa-building-columns" style="color: #ef4444;"></i> FAZER DEPÓSITO NA CARTEIRA
            </h1>
            <p style="color: var(--text-muted); font-size: 0.92rem; margin: 4px 0 0 0;">
                Carregue a sua conta via <strong>Multicaixa Express</strong> e envie o comprovativo para crédito imediato.
            </p>
        </div>
        <div style="background: #12131a; border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 10px 18px; display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-wallet" style="color: var(--neon-gold); font-size: 1.3rem;"></i>
            <div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Saldo Disponível</div>
                <div style="font-size: 1.15rem; font-weight: 900; color: var(--neon-gold); font-family: var(--font-gamer);">
                    <?php echo number_format((float)$logged_user['user_wallet_balance'], 2, ',', '.'); ?> Kz
                </div>
            </div>
        </div>
    </div>

    <?php if (!empty($error)): ?>
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #fecaca; padding: 14px 18px; border-radius: 12px; margin-bottom: 22px; font-weight: 600;">
            <i class="fa-solid fa-circle-exclamation"></i> <?php echo htmlspecialchars($error); ?>
        </div>
    <?php endif; ?>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; margin-bottom: 32px;">

        <!-- PASSO 1: DADOS DE PAGAMENTO MULTICAIXA EXPRESS -->
        <div class="arena-card" style="border: 1px solid rgba(239, 68, 68, 0.4); background: linear-gradient(180deg, rgba(239, 68, 68, 0.06) 0%, #0d0e12 100%);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                <span style="background: #ef4444; color: #fff; font-weight: 900; font-family: var(--font-gamer); width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.9rem;">1</span>
                <div>
                    <div style="font-size: 1.05rem; font-weight: 800; color: #fff; font-family: var(--font-gamer);">DADOS DE PAGAMENTO</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">Pagamento Manual via Multicaixa Express</div>
                </div>
            </div>

            <div style="background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.15); border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; font-size: 0.9rem; color: #e5e7eb; line-height: 1.55;">
                <i class="fa-solid fa-mobile-screen-button" style="color: #ef4444; margin-right: 6px;"></i>
                Abra o aplicativo <strong>Multicaixa Express</strong>, aceda a <strong>Pagamentos &rarr; Pagamento por Referência</strong> e copie os seguintes dados abaixo:
            </div>

            <!-- ENTIDADE: 930 -->
            <div style="background: #14161f; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                <div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.6px;">Entidade</div>
                    <div style="font-size: 1.5rem; font-weight: 900; color: #fff; font-family: var(--font-gamer); letter-spacing: 2px; margin-top: 2px;" id="val-entidade">930</div>
                </div>
                <button type="button" onclick="copyPaymentData('930', this)" class="btn-launch-hero" style="padding: 9px 16px; font-size: 0.82rem; border-radius: 8px;">
                    <i class="fa-regular fa-copy"></i> Copiar
                </button>
            </div>

            <!-- REFERÊNCIA: 929852534 -->
            <div style="background: #14161f; border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 12px; padding: 14px 16px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                <div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.6px;">Referência</div>
                    <div style="font-size: 1.5rem; font-weight: 900; color: #ef4444; font-family: var(--font-gamer); letter-spacing: 2px; margin-top: 2px;" id="val-referencia">929852534</div>
                </div>
                <button type="button" onclick="copyPaymentData('929852534', this)" class="btn-launch-hero" style="padding: 9px 16px; font-size: 0.82rem; border-radius: 8px;">
                    <i class="fa-regular fa-copy"></i> Copiar
                </button>
            </div>

            <div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; padding: 12px 14px; border-radius: 8px; font-size: 0.84rem; color: #d1fae5;">
                <i class="fa-solid fa-bolt" style="color: #10b981;"></i>
                <strong>Crédito Rápido:</strong> Após efetuar o pagamento no Multicaixa Express, envie o comprovativo ao lado (PDF ou Foto) e o seu saldo cairá em <strong>5 segundos</strong>!
            </div>
        </div>

        <!-- PASSO 2: ENVIAR COMPROVATIVO (PDF OU FOTO) -->
        <div class="arena-card">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                <span style="background: #ef4444; color: #fff; font-weight: 900; font-family: var(--font-gamer); width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.9rem;">2</span>
                <div>
                    <div style="font-size: 1.05rem; font-weight: 800; color: #fff; font-family: var(--font-gamer);">ENVIAR COMPROVATIVO</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">Envie aqui o comprovativo em PDF ou Foto</div>
                </div>
            </div>

            <form method="POST" enctype="multipart/form-data" id="form-deposit">
                <input type="hidden" name="action" value="submit_deposit">

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #d1d5db; text-transform: uppercase; margin-bottom: 8px;">
                        1. Escolha ou Digite o Valor Pago (Kz)
                    </label>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px;">
                        <?php foreach ([500, 1000, 2000, 5000, 10000, 25000] as $preset): ?>
                        <button type="button" onclick="selectPresetAmount(<?php echo $preset; ?>, this)" class="preset-amt-btn" style="background: #151720; border: 1px solid rgba(255,255,255,0.12); color: #fff; border-radius: 8px; padding: 9px 6px; font-weight: 800; font-family: var(--font-gamer); font-size: 0.82rem; cursor: pointer;">
                            <?php echo number_format($preset, 0, ',', '.'); ?> Kz
                        </button>
                        <?php endforeach; ?>
                    </div>
                    <input type="number" name="amount" id="deposit-amount-input" min="100" step="50" value="1000" required placeholder="Digite o valor em Kwanzas (Ex: 2000)" style="width: 100%; background: #14161f; border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; padding: 12px 14px; color: #fff; font-size: 1.05rem; font-weight: 800;">
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #d1d5db; text-transform: uppercase; margin-bottom: 8px;">
                        2. Carregar Comprovativo (PDF ou Foto)
                    </label>
                    <label for="comprovativo-input" style="display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2px dashed rgba(239, 68, 68, 0.5); border-radius: 14px; padding: 24px 16px; background: rgba(239, 68, 68, 0.04); cursor: pointer; text-align: center; transition: all 0.2s;">
                        <i class="fa-solid fa-cloud-arrow-up" style="font-size: 2.2rem; color: #ef4444; margin-bottom: 10px;"></i>
                        <span id="file-chosen-label" style="font-weight: 700; color: #fff; font-size: 0.92rem;">
                            Clique aqui para anexar o Comprovativo (PDF ou Foto)
                        </span>
                        <span style="font-size: 0.76rem; color: var(--text-muted); margin-top: 4px;">
                            Formatos aceites: PDF, JPG, PNG, WEBP (Máx. 12MB)
                        </span>
                    </label>
                    <input type="file" name="comprovativo" id="comprovativo-input" accept=".pdf,image/*" required style="display: none;" onchange="handleReceiptPreview(this)">
                </div>

                <button type="submit" class="btn-launch-hero" style="width: 100%; padding: 14px; font-size: 0.98rem; justify-content: center;">
                    <i class="fa-solid fa-paper-plane"></i> ENVIAR COMPROVATIVO E RECEBER SALDO
                </button>
            </form>
        </div>

    </div>
    <?php endif; ?>

    <!-- HISTÓRICO DE DEPÓSITOS DO UTILIZADOR -->
    <div class="arena-card" style="margin-bottom: 28px;">
        <div class="arena-card-header">
            <div class="arena-card-title">
                <i class="fa-solid fa-receipt" style="color: #ef4444;"></i> Meus Depósitos Recentes
            </div>
            <span style="font-size: 0.8rem; color: var(--text-dim);"><?php echo count($my_deposits); ?> registos</span>
        </div>
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); color: var(--text-dim); font-size: 0.76rem; text-transform: uppercase;">
                        <th style="padding: 10px;">ID</th>
                        <th style="padding: 10px;">Entidade / Ref</th>
                        <th style="padding: 10px;">Valor</th>
                        <th style="padding: 10px;">Comprovativo</th>
                        <th style="padding: 10px;">Estado</th>
                        <th style="padding: 10px; text-align: right;">Data</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (!empty($my_deposits)): ?>
                        <?php foreach ($my_deposits as $dep): ?>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                            <td style="padding: 10px; font-weight: 700; color: var(--text-muted);">#<?php echo (int)$dep['id']; ?></td>
                            <td style="padding: 10px; color: #fff;">Ent: <strong><?php echo htmlspecialchars($dep['entity']); ?></strong> • Ref: <strong><?php echo htmlspecialchars($dep['reference']); ?></strong></td>
                            <td style="padding: 10px; font-weight: 800; color: #10b981;">+<?php echo number_format((float)$dep['amount'], 0, ',', '.'); ?> Kz</td>
                            <td style="padding: 10px;">
                                <a href="<?php echo GAMER_URL . '/' . htmlspecialchars($dep['receipt_file']); ?>" target="_blank" style="color: #ef4444; text-decoration: none; font-weight: 700; font-size: 0.82rem;">
                                    <i class="fa-solid fa-file-arrow-down"></i> Ver Comprovativo
                                </a>
                            </td>
                            <td style="padding: 10px;">
                                <span class="badge" style="background: rgba(16,185,129,0.18); color: #10b981; border: 1px solid #10b981; padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 800;">
                                    CREDITADO
                                </span>
                            </td>
                            <td style="padding: 10px; text-align: right; color: var(--text-dim); font-size: 0.8rem;">
                                <?php echo date('d/m/Y H:i', strtotime($dep['created_at'])); ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    <?php else: ?>
                        <tr>
                            <td colspan="6" style="padding: 24px; text-align: center; color: var(--text-dim);">
                                Ainda não realizou nenhum depósito. Copie a Entidade <strong>930</strong> e Referência <strong>929852534</strong> acima para carregar a sua carteira.
                            </td>
                        </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

</main>

<script>
function copyPaymentData(val, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val);
    } else {
        const temp = document.createElement('input');
        temp.value = val;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
    }
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
    btn.style.background = '#10b981';
    setTimeout(() => {
        btn.innerHTML = oldHtml;
        btn.style.background = '';
    }, 2000);
}

function selectPresetAmount(val, btn) {
    document.getElementById('deposit-amount-input').value = val;
    document.querySelectorAll('.preset-amt-btn').forEach(b => {
        b.style.borderColor = 'rgba(255,255,255,0.12)';
        b.style.background = '#151720';
    });
    btn.style.borderColor = '#ef4444';
    btn.style.background = 'rgba(239, 68, 68, 0.18)';
}

function handleReceiptPreview(input) {
    const label = document.getElementById('file-chosen-label');
    if (input.files && input.files[0]) {
        const f = input.files[0];
        label.innerHTML = '<span style="color:#10b981;"><i class="fa-solid fa-circle-check"></i> Ficheiro selecionado: ' + f.name + '</span>';
    }
}
</script>

<?php require_once(__DIR__ . '/footer.php'); ?>
