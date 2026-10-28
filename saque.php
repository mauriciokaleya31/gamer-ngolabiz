<?php
/**
 * CASINO56 ARENA - SOLICITAÇÃO DE LEVANTAMENTO / SAQUE BANCÁRIO
 * Regra Obrigatória: Saque Mínimo de 1.000 Kz
 * Requer Nome do Titular, Nome do Banco e IBAN de Angola
 */
require_once(__DIR__ . '/init.php');

if (!$logged_user) {
    header('Location: ' . GAMER_URL . '/auth.php?redirect=' . urlencode(GAMER_URL . '/saque.php'));
    exit;
}

$my_uid = (int)$logged_user['user_id'];
$is_verified = arena_is_user_verified($my_uid);

$error = '';
$success = '';

// Buscar saldo real diretamente da base de dados
$q_bal = $db->query("SELECT user_wallet_balance FROM users WHERE user_id = {$my_uid} LIMIT 1");
$current_balance = $q_bal ? (float)$q_bal->fetch_assoc()['user_wallet_balance'] : 0.0;

// Processar pedido de levantamento
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'request_withdrawal') {
    if (!$is_verified) {
        $error = 'Para solicitar levantamentos de saldo, a sua conta precisa de estar verificada com o seu Bilhete de Identidade ou Carta de Condução.';
    } else {
        $holder_name = trim($_POST['holder_name'] ?? '');
        $bank_name = trim($_POST['bank_name'] ?? '');
        $iban = strtoupper(trim(preg_replace('/[^A-Za-z0-9]/', '', $_POST['iban'] ?? '')));
        $amount = (float)($_POST['amount'] ?? 0);

        if (empty($holder_name) || strlen($holder_name) < 4) {
            $error = 'Por favor, informe o nome completo do titular da conta bancária.';
        } elseif (empty($bank_name)) {
            $error = 'Por favor, selecione o seu banco de Angola.';
        } elseif (empty($iban) || strlen($iban) < 21) {
            $error = 'O IBAN informado é inválido. Certifique-se de preencher o IBAN angolano completo (começando por AO06).';
        } elseif ($amount < 1000) {
            $error = 'O valor mínimo obrigatório para levantamento é de 1.000 Kz.';
        } elseif ($amount > $current_balance) {
            $error = 'Saldo insuficiente na sua carteira. O seu saldo disponível é de ' . number_format($current_balance, 2, ',', '.') . ' Kz.';
        } else {
            // Deduzir o saldo da carteira do jogador imediatamente
            $db->begin_transaction();
            try {
                $deduct = $db->query("UPDATE users SET user_wallet_balance = user_wallet_balance - {$amount} WHERE user_id = {$my_uid} AND user_wallet_balance >= {$amount}");
                if ($db->affected_rows > 0) {
                    $holder_esc = $db->real_escape_string($holder_name);
                    $bank_esc = $db->real_escape_string($bank_name);
                    $iban_esc = $db->real_escape_string($iban);
                    $tag_esc = $db->real_escape_string($gamer_profile['gamer_tag'] ?? $logged_user['fullname']);

                    $db->query("INSERT INTO arena_withdrawals 
                        (user_id, gamer_tag, holder_name, bank_name, iban, amount, status, created_at)
                        VALUES 
                        ({$my_uid}, '{$tag_esc}', '{$holder_esc}', '{$bank_esc}', '{$iban_esc}', {$amount}, 'pending', NOW())");

                    $w_id = $db->insert_id;

                    // Adicionar notificação no sistema
                    arena_add_notification(
                        $my_uid, 
                        'Levantamento Solicitado', 
                        'O seu pedido de levantamento de ' . number_format($amount, 2, ',', '.') . ' Kz foi registado e está em análise pela administração.',
                        'withdrawal',
                        GAMER_URL . '/saque.php'
                    );

                    $db->commit();
                    $success = 'O seu pedido de levantamento de ' . number_format($amount, 2, ',', '.') . ' Kz foi submetido com sucesso! O pagamento será processado via transferência bancária em breve.';
                    $current_balance -= $amount;
                } else {
                    $db->rollback();
                    $error = 'Erro ao processar saldo. Tente novamente.';
                }
            } catch (Exception $e) {
                $db->rollback();
                $error = 'Falha no processamento: ' . $e->getMessage();
            }
        }
    }
}

// Histórico de saques do jogador
$my_withdrawals = [];
$q_w = $db->query("SELECT * FROM arena_withdrawals WHERE user_id = {$my_uid} ORDER BY id DESC LIMIT 20");
if ($q_w) {
    while ($rw = $q_w->fetch_assoc()) {
        $my_withdrawals[] = $rw;
    }
}

$page_title = 'Solicitar Levantamento de Saldo';
require_once(__DIR__ . '/header.php');
?>

<main class="arena-page-body" style="padding: 24px; max-width: 1000px; margin: 0 auto; width: 100%;">

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 14px;">
        <div>
            <h1 style="font-size: 1.6rem; font-weight: 800; color: #fff; margin: 0;">
                <i class="fa-solid fa-money-bill-transfer" style="color: #22C98B; margin-right: 8px;"></i> Solicitar Levantamento (Saque)
            </h1>
            <p style="color: var(--text-muted); font-size: 0.90rem; margin: 4px 0 0 0;">
                Transfira os seus ganhos da Arena diretamente para a sua conta bancária em Angola via IBAN.
            </p>
        </div>
        <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 12px; padding: 10px 18px; display: inline-flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-wallet" style="color: #F59E0B; font-size: 1.2rem;"></i>
            <div>
                <div style="font-size: 0.72rem; color: #9AA4B2; text-transform: uppercase;">Saldo Disponível</div>
                <strong style="color: #22C98B; font-size: 1.15rem; font-family: var(--font-gamer);">
                    <?php echo number_format($current_balance, 2, ',', '.'); ?> Kz
                </strong>
            </div>
        </div>
    </div>

    <?php if (!$is_verified): ?>
    <div style="background: rgba(245, 158, 11, 0.12); border: 1.5px solid #F59E0B; border-radius: 14px; padding: 18px 22px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(245, 158, 11, 0.2); display: flex; align-items: center; justify-content: center; color: #F59E0B; font-size: 1.3rem;">
                <i class="fa-solid fa-id-card"></i>
            </div>
            <div>
                <strong style="color: #fff; font-size: 0.95rem; display: block;">Verificação de Conta Obrigatória</strong>
                <span style="color: #fde68a; font-size: 0.84rem;">Para poder levantar os seus ganhos em conformidade com as regras financeiras de Angola, envie os dados do seu BI ou Carta.</span>
            </div>
        </div>
        <a href="<?php echo GAMER_URL; ?>/verificacao.php" class="btn-ngola btn-ngola-primary btn-sm" style="background: linear-gradient(135deg, #F59E0B, #d97706); text-decoration: none; padding: 10px 18px; font-weight: 800;">
            <i class="fa-solid fa-arrow-right"></i> Verificar Conta Agora
        </a>
    </div>
    <?php endif; ?>

    <?php if (!empty($error)): ?>
        <div style="background: rgba(240, 68, 74, 0.15); border: 1px solid #F0444A; color: #fecaca; padding: 14px 18px; border-radius: 12px; margin-bottom: 22px;">
            <i class="fa-solid fa-circle-exclamation"></i> <?php echo htmlspecialchars($error); ?>
        </div>
    <?php endif; ?>

    <?php if (!empty($success)): ?>
        <div style="background: rgba(34, 201, 139, 0.15); border: 1px solid #22C98B; color: #a7f3d0; padding: 14px 18px; border-radius: 12px; margin-bottom: 22px;">
            <i class="fa-solid fa-circle-check"></i> <?php echo htmlspecialchars($success); ?>
        </div>
    <?php endif; ?>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; margin-bottom: 32px;">
        
        <!-- FORMULÁRIO DE LEVANTAMENTO -->
        <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 16px; padding: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);">
            <h3 style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-building-columns" style="color: #22C98B;"></i> Dados Bancários para Transferência
            </h3>

            <form method="POST">
                <input type="hidden" name="action" value="request_withdrawal">

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 0.80rem; font-weight: 700; color: #9AA4B2; margin-bottom: 6px; text-transform: uppercase;">
                        Nome Completo do Titular da Conta
                    </label>
                    <input type="text" name="holder_name" value="<?php echo htmlspecialchars($logged_user['fullname'] ?? ''); ?>" required placeholder="Ex: António Manuel Silva" style="width: 100%; background: #10141C; border: 1px solid #282F3D; border-radius: 8px; padding: 11px 14px; color: #fff; font-size: 0.90rem;">
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 0.80rem; font-weight: 700; color: #9AA4B2; margin-bottom: 6px; text-transform: uppercase;">
                        Banco de Angola
                    </label>
                    <select name="bank_name" required style="width: 100%; background: #10141C; border: 1px solid #282F3D; border-radius: 8px; padding: 11px 14px; color: #fff; font-size: 0.90rem;">
                        <option value="">Selecione o seu banco...</option>
                        <option value="BAI - Banco Angolano de Investimentos">BAI - Banco Angolano de Investimentos</option>
                        <option value="BFA - Banco de Fomento Angola">BFA - Banco de Fomento Angola</option>
                        <option value="Banco BIC Angola">Banco BIC Angola</option>
                        <option value="Banco SOL">Banco SOL</option>
                        <option value="Banco Millenium Atlântico">Banco Millenium Atlântico</option>
                        <option value="Standard Bank Angola">Standard Bank Angola</option>
                        <option value="BPC - Banco de Poupança e Crédito">BPC - Banco de Poupança e Crédito</option>
                        <option value="Banco Keve">Banco Keve</option>
                        <option value="Banco Económico">Banco Económico</option>
                        <option value="Outro Banco de Angola">Outro Banco de Angola</option>
                    </select>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 0.80rem; font-weight: 700; color: #9AA4B2; margin-bottom: 6px; text-transform: uppercase;">
                        Número de IBAN (Angola)
                    </label>
                    <input type="text" name="iban" required placeholder="AO06.0000.0000.0000.0000.0" style="width: 100%; background: #10141C; border: 1px solid #282F3D; border-radius: 8px; padding: 11px 14px; color: #fff; font-family: monospace; font-size: 0.95rem; font-weight: 700; letter-spacing: 0.5px;">
                    <span style="font-size: 0.72rem; color: #9AA4B2; display: block; margin-top: 4px;">Certifique-se de que o IBAN pertence ao mesmo titular da conta.</span>
                </div>

                <div style="margin-bottom: 22px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <label style="font-size: 0.80rem; font-weight: 700; color: #9AA4B2; text-transform: uppercase;">
                            Valor a Sacar (AKZ)
                        </label>
                        <span style="font-size: 0.72rem; color: #F59E0B; font-weight: 800;">Mínimo: 1.000 Kz</span>
                    </div>
                    <div style="position: relative;">
                        <input type="number" name="amount" min="1000" max="<?php echo (int)$current_balance; ?>" step="100" value="<?php echo max(1000, min(5000, (int)$current_balance)); ?>" required style="width: 100%; background: #10141C; border: 1.5px solid #22C98B; border-radius: 8px; padding: 12px 14px; color: #22C98B; font-family: var(--font-gamer); font-size: 1.25rem; font-weight: 900;">
                    </div>
                </div>

                <button type="submit" class="btn-ngola btn-ngola-primary" style="width: 100%; padding: 12px; font-weight: 800; font-size: 0.95rem; background: linear-gradient(135deg, #22C98B, #10b981);" <?php echo (!$is_verified || $current_balance < 1000) ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''; ?>>
                    <i class="fa-solid fa-paper-plane"></i> Confirmar Pedido de Levantamento
                </button>
            </form>
        </div>

        <!-- REGRAS E INFORMAÇÕES DE LEVANTAMENTO -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 16px; padding: 20px;">
                <h4 style="color: #fff; font-size: 0.95rem; font-weight: 800; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-shield-halved" style="color: #F0444A;"></i> Regras de Levantamento
                </h4>
                <ul style="color: #9AA4B2; font-size: 0.84rem; line-height: 1.6; margin-left: 18px; padding: 0;">
                    <li><strong>Valor Mínimo:</strong> 1.000 Kz por transação.</li>
                    <li><strong>Prazos de Transferência:</strong> Em dias úteis, o processamento ocorre habitualmente entre 15 minutos a 2 horas após aprovação administrativa.</li>
                    <li><strong>Segurança:</strong> O IBAN deve corresponder aos dados de identidade verificados do jogador.</li>
                    <li><strong>Taxa:</strong> Sem cobrança de taxa de levantamento pela plataforma da Arena.</li>
                </ul>
            </div>

            <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 16px; padding: 20px;">
                <h4 style="color: #fff; font-size: 0.95rem; font-weight: 800; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-headset" style="color: #22C98B;"></i> Precisa de Ajuda com o Saque?
                </h4>
                <p style="color: #9AA4B2; font-size: 0.82rem; margin-bottom: 14px;">
                    Em caso de dúvidas sobre transferências ou prazos, entre em contato direto com os nossos atendentes no chat oficial.
                </p>
                <a href="<?php echo GAMER_URL; ?>/suporte.php" class="btn-ngola btn-ngola-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none;">
                    <i class="fa-solid fa-comments"></i> Abrir Chat de Suporte
                </a>
            </div>
        </div>

    </div>

    <!-- HISTÓRICO DE PEDIDOS DE LEVANTAMENTO -->
    <div style="background: #171C26; border: 1px solid #282F3D; border-radius: 16px; padding: 22px;">
        <h3 style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-clock-rotate-left" style="color: #F59E0B;"></i> Histórico de Levantamentos
        </h3>

        <?php if (empty($my_withdrawals)): ?>
            <div style="text-align: center; padding: 32px 16px; color: #9AA4B2; font-size: 0.88rem;">
                <i class="fa-solid fa-receipt" style="font-size: 2rem; color: #282F3D; display: block; margin-bottom: 8px;"></i>
                Ainda não solicitou nenhum levantamento de saldo.
            </div>
        <?php else: ?>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; min-width: 600px; text-align: left; font-size: 0.85rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid #282F3D; color: #9AA4B2; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">
                            <th style="padding: 10px 14px;">Data</th>
                            <th style="padding: 10px 14px;">Banco & IBAN</th>
                            <th style="padding: 10px 14px;">Titular</th>
                            <th style="padding: 10px 14px; text-align: right;">Valor</th>
                            <th style="padding: 10px 14px; text-align: center;">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($my_withdrawals as $w): 
                            $status_badge = '<span style="background: rgba(245,158,11,0.15); border: 1px solid #F59E0B; color: #F59E0B; padding: 2px 8px; border-radius: 6px; font-weight: 800; font-size: 0.72rem;">Pendente</span>';
                            if ($w['status'] === 'approved') {
                                $status_badge = '<span style="background: rgba(34,201,139,0.15); border: 1px solid #22C98B; color: #22C98B; padding: 2px 8px; border-radius: 6px; font-weight: 800; font-size: 0.72rem;">Pago / Aprovado</span>';
                            } elseif ($w['status'] === 'rejected') {
                                $status_badge = '<span style="background: rgba(240,68,74,0.15); border: 1px solid #F0444A; color: #F0444A; padding: 2px 8px; border-radius: 6px; font-weight: 800; font-size: 0.72rem;" title="' . htmlspecialchars($w['admin_notes'] ?? '') . '">Recusado</span>';
                            }
                        ?>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                            <td style="padding: 12px 14px; color: #9AA4B2;"><?php echo date('d/m/Y H:i', strtotime($w['created_at'])); ?></td>
                            <td style="padding: 12px 14px; color: #fff;">
                                <strong><?php echo htmlspecialchars($w['bank_name']); ?></strong>
                                <div style="font-family: monospace; font-size: 0.75rem; color: #9AA4B2;"><?php echo htmlspecialchars($w['iban']); ?></div>
                            </td>
                            <td style="padding: 12px 14px; color: #9AA4B2;"><?php echo htmlspecialchars($w['holder_name']); ?></td>
                            <td style="padding: 12px 14px; text-align: right; color: #22C98B; font-weight: 800; font-family: var(--font-gamer);">
                                <?php echo number_format((float)$w['amount'], 2, ',', '.'); ?> Kz
                            </td>
                            <td style="padding: 12px 14px; text-align: center;">
                                <?php echo $status_badge; ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </div>

</main>

<?php require_once(__DIR__ . '/footer.php'); ?>
