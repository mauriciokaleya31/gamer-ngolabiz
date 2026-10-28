<?php
/**
 * CASINO56 ARENA — VERIFICAÇÃO DE IDENTIDADE & CONTA (KYC)
 * Bilhete de Identidade (BI), Carta de Condução e Passaporte
 * Validação Obrigatória para Jogos, Apostas e Depósitos
 */
require_once(__DIR__ . '/init.php');

if (!$logged_user) {
    header("Location: " . GAMER_URL . "/auth.php?redirect=" . urlencode(GAMER_URL . "/verificacao.php"));
    exit;
}

$page_title = 'Verificação de Conta';
$uid = (int)$logged_user['user_id'];
$my_tag = $gamer_profile['gamer_tag'] ?? ($logged_user['user_name'] ?? 'Gamer');
$kyc_record = arena_get_user_kyc($uid);
$is_verified = arena_is_user_verified($uid);

$error_msg = '';
$success_msg = '';

// Processamento de Upload e Submissão de KYC
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action_kyc']) && $_POST['action_kyc'] === 'submit_docs') {
    $doc_type = trim($_POST['doc_type'] ?? 'bi');
    if (!in_array($doc_type, ['bi', 'cnh', 'passaporte'])) $doc_type = 'bi';

    $fullname = trim($_POST['fullname'] ?? '');
    $doc_number = trim($_POST['doc_number'] ?? '');
    $birth_date = trim($_POST['birth_date'] ?? '');
    $province = trim($_POST['province'] ?? 'Luanda');

    if (empty($fullname) || empty($doc_number)) {
        $error_msg = 'Por favor, preencha o seu nome completo e o número do documento.';
    } elseif (empty($_FILES['doc_front']['name'])) {
        $error_msg = 'É obrigatório anexar a fotografia da frente do seu documento.';
    } else {
        $upload_dir = __DIR__ . '/uploads/kyc';
        if (!is_dir($upload_dir)) {
            @mkdir($upload_dir, 0777, true);
        }

        $allowed_exts = ['jpg', 'jpeg', 'png', 'pdf', 'webp'];

        // 1. Upload Frente
        $f_ext = strtolower(pathinfo($_FILES['doc_front']['name'], PATHINFO_EXTENSION));
        if (!in_array($f_ext, $allowed_exts)) {
            $error_msg = 'Formato da imagem da frente inválido. Formatos permitidos: JPG, PNG, WEBP ou PDF.';
        } else {
            $front_name = 'kyc_front_' . $uid . '_' . time() . '_' . rand(100, 999) . '.' . $f_ext;
            $front_dest = $upload_dir . '/' . $front_name;
            $front_saved = move_uploaded_file($_FILES['doc_front']['tmp_name'], $front_dest);

            // 2. Upload Verso (opcional para passaporte, obrigatório/recomendado para BI e Carta)
            $back_name = null;
            if (!empty($_FILES['doc_back']['name'])) {
                $b_ext = strtolower(pathinfo($_FILES['doc_back']['name'], PATHINFO_EXTENSION));
                if (in_array($b_ext, $allowed_exts)) {
                    $b_dest_name = 'kyc_back_' . $uid . '_' . time() . '_' . rand(100, 999) . '.' . $b_ext;
                    $b_dest = $upload_dir . '/' . $b_dest_name;
                    if (move_uploaded_file($_FILES['doc_back']['tmp_name'], $b_dest)) {
                        $back_name = $b_dest_name;
                    }
                }
            }

            if ($front_saved) {
                $fn_esc = $db->real_escape_string($fullname);
                $dn_esc = $db->real_escape_string($doc_number);
                $bd_esc = !empty($birth_date) ? ("'" . $db->real_escape_string($birth_date) . "'") : "NULL";
                $pv_esc = $db->real_escape_string($province);
                $tag_esc = $db->real_escape_string($my_tag);
                $bk_sql = $back_name ? ("'" . $db->real_escape_string($back_name) . "'") : "NULL";

                $db->query("INSERT INTO arena_verifications 
                    (user_id, gamer_tag, fullname, doc_type, doc_number, birth_date, province, doc_front, doc_back, status, created_at)
                    VALUES 
                    ({$uid}, '{$tag_esc}', '{$fn_esc}', '{$doc_type}', '{$dn_esc}', {$bd_esc}, '{$pv_esc}', '{$front_name}', {$bk_sql}, 'pending', NOW())");

                $success_msg = 'Os seus documentos foram submetidos com sucesso e estão agora em análise pela equipa de segurança.';
                $kyc_record = arena_get_user_kyc($uid);
            } else {
                $error_msg = 'Falha ao guardar os ficheiros de documento no servidor. Tente novamente.';
            }
        }
    }
}

require_once(__DIR__ . '/header.php');

$angola_provinces = [
    'Luanda', 'Benguela', 'Huambo', 'Cabinda', 'Huíla', 'Malanje',
    'Cuanza Sul', 'Uíge', 'Namibe', 'Bié', 'Zaire', 'Lunda Norte',
    'Lunda Sul', 'Moxico', 'Cunene', 'Cuando Cubango', 'Bengo', 'Cuanza Norte'
];
?>

<main class="arena-page-body" style="padding: 24px; max-width: 960px; margin: 0 auto; width: 100%;">

    <!-- NOTIFICAÇÕES VIA URL -->
    <?php if (isset($_GET['notice'])): ?>
        <?php if ($_GET['notice'] === 'deposit_requires_kyc'): ?>
            <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid #F59E0B; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #F59E0B; font-size: 1.5rem;"></i>
                <div>
                    <strong style="color: #fff; font-size: 0.95rem; display: block;">Verificação Obrigatória para Depósitos</strong>
                    <span style="color: #cbd5e1; font-size: 0.85rem;">Para garantir a conformidade e a segurança financeira de todos os jogadores, conclua a verificação de identidade antes de efetuar depósitos.</span>
                </div>
            </div>
        <?php elseif ($_GET['notice'] === 'play_requires_kyc'): ?>
            <div style="background: rgba(240, 68, 74, 0.12); border: 1px solid #F0444A; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                <i class="fa-solid fa-shield-halved" style="color: #F0444A; font-size: 1.5rem;"></i>
                <div>
                    <strong style="color: #fff; font-size: 0.95rem; display: block;">Verificação de Conta Obrigatória para Jogar e Batalhar</strong>
                    <span style="color: #cbd5e1; font-size: 0.85rem;">Para lançar desafios, apostar em duelos 1v1 e disputar prémios reais em Kwanzas, a sua conta deve estar verificada.</span>
                </div>
            </div>
        <?php endif; ?>
    <?php endif; ?>

    <?php if (!empty($error_msg)): ?>
        <div style="background: rgba(240, 68, 74, 0.15); border: 1px solid #F0444A; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; color: #fff; display: flex; align-items: center; gap: 12px;">
            <i class="fa-solid fa-circle-exclamation" style="color: #F0444A; font-size: 1.4rem;"></i>
            <span><?php echo htmlspecialchars($error_msg); ?></span>
        </div>
    <?php endif; ?>

    <?php if (!empty($success_msg)): ?>
        <div style="background: rgba(34, 201, 139, 0.15); border: 1px solid #22C98B; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; color: #fff; display: flex; align-items: center; gap: 12px;">
            <i class="fa-solid fa-circle-check" style="color: #22C98B; font-size: 1.4rem;"></i>
            <span><?php echo htmlspecialchars($success_msg); ?></span>
        </div>
    <?php endif; ?>

    <!-- CABEÇALHO DA PÁGINA -->
    <div style="margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(240, 68, 74, 0.15); border: 1px solid rgba(240, 68, 74, 0.3); display: flex; align-items: center; justify-content: center; color: #F0444A; font-size: 1.2rem;">
                <i class="fa-solid fa-id-card"></i>
            </div>
            <div>
                <h1 style="font-family: var(--font-gamer); font-size: 1.8rem; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: 1px; margin: 0;">
                    VERIFICAÇÃO DE IDENTIDADE & CONTA
                </h1>
                <p style="font-size: 0.85rem; color: #9AA4B2; margin: 0;">
                    Valide os seus dados oficiais para desbloquear todas as funcionalidades, depósitos, duelos e levantamentos na Casino56 Arena.
                </p>
            </div>
        </div>
    </div>

    <?php if ($is_verified): ?>
    <!-- ESTADO 1: CONTA TOTALMENTE VERIFICADA E APROVADA -->
    <div style="background: #171C26; border: 1.5px solid #22C98B; border-radius: 16px; padding: 32px 24px; text-align: center; box-shadow: 0 8px 30px rgba(34, 201, 139, 0.2);">
        <div style="width: 70px; height: 70px; border-radius: 50%; background: rgba(34, 201, 139, 0.15); border: 2px solid #22C98B; display: inline-flex; align-items: center; justify-content: center; color: #22C98B; font-size: 2.2rem; margin-bottom: 16px; box-shadow: 0 0 25px rgba(34, 201, 139, 0.4);">
            <i class="fa-solid fa-check-double"></i>
        </div>
        <h2 style="font-family: var(--font-gamer); font-size: 1.7rem; font-weight: 900; color: #fff; margin-bottom: 6px; letter-spacing: 0.5px;">
            A TUA CONTA ESTÁ OFICIALMENTE VERIFICADA!
        </h2>
        <p style="color: #9AA4B2; font-size: 0.92rem; max-width: 520px; margin: 0 auto 24px auto; line-height: 1.5;">
            Os teus documentos foram validados com sucesso pela nossa equipa de segurança. Tens acesso ilimitado a depósitos, saques rápidos e duelos 1v1 ao vivo.
        </p>

        <?php if ($kyc_record): ?>
        <div style="background: #10141C; border: 1px solid #282F3D; border-radius: 12px; padding: 16px; max-width: 480px; margin: 0 auto 24px auto; text-align: left; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.85rem;">
            <div>
                <span style="color: #9AA4B2; font-size: 0.72rem; text-transform: uppercase;">Tipo de Documento:</span>
                <strong style="display: block; color: #fff;"><?php echo strtoupper($kyc_record['doc_type']); ?></strong>
            </div>
            <div>
                <span style="color: #9AA4B2; font-size: 0.72rem; text-transform: uppercase;">Número:</span>
                <strong style="display: block; color: #22C98B;"><?php echo htmlspecialchars(substr($kyc_record['doc_number'], 0, 4) . '****' . substr($kyc_record['doc_number'], -3)); ?></strong>
            </div>
            <div>
                <span style="color: #9AA4B2; font-size: 0.72rem; text-transform: uppercase;">Titular:</span>
                <strong style="display: block; color: #fff;"><?php echo htmlspecialchars($kyc_record['fullname']); ?></strong>
            </div>
            <div>
                <span style="color: #9AA4B2; font-size: 0.72rem; text-transform: uppercase;">Província:</span>
                <strong style="display: block; color: #fff;"><?php echo htmlspecialchars($kyc_record['province']); ?></strong>
            </div>
        </div>
        <?php endif; ?>

        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <a href="<?php echo GAMER_URL; ?>/index.php" class="btn-ngola btn-ngola-primary" style="padding: 12px 24px; font-weight: 800; font-size: 0.90rem; text-decoration: none; border-radius: 8px;">
                <i class="fa-solid fa-gamepad"></i> Ir para a Arena
            </a>
            <a href="<?php echo GAMER_URL; ?>/deposito.php" class="btn-ngola btn-ngola-secondary" style="padding: 12px 24px; font-weight: 800; font-size: 0.90rem; text-decoration: none; border-radius: 8px; color: #22C98B; border-color: #22C98B;">
                <i class="fa-solid fa-wallet"></i> Fazer Depósito
            </a>
        </div>
    </div>

    <?php elseif ($kyc_record && $kyc_record['status'] === 'pending'): ?>
    <!-- ESTADO 2: DOCUMENTOS SUBMETIDOS, AGUARDANDO APROVAÇÃO DO ADMINISTRADOR -->
    <div style="background: #171C26; border: 1.5px solid #F59E0B; border-radius: 16px; padding: 32px 24px; text-align: center; box-shadow: 0 8px 30px rgba(245, 158, 11, 0.15);">
        <div style="width: 70px; height: 70px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); border: 2px solid #F59E0B; display: inline-flex; align-items: center; justify-content: center; color: #F59E0B; font-size: 2.2rem; margin-bottom: 16px; animation: pulse 1.5s infinite alternate;">
            <i class="fa-solid fa-hourglass-half"></i>
        </div>
        <h2 style="font-family: var(--font-gamer); font-size: 1.7rem; font-weight: 900; color: #fff; margin-bottom: 6px; letter-spacing: 0.5px;">
            DOCUMENTOS EM ANÁLISE ADMINISTRATIVA
        </h2>
        <p style="color: #cbd5e1; font-size: 0.92rem; max-width: 520px; margin: 0 auto 20px auto; line-height: 1.5;">
            Os teus documentos foram recebidos com sucesso e estão a ser auditados por um dos administradores da Casino56. Este processo costuma demorar apenas alguns minutos.
        </p>

        <div style="background: #10141C; border: 1px solid #282F3D; border-radius: 12px; padding: 14px 20px; max-width: 440px; margin: 0 auto 24px auto; text-align: left; font-size: 0.85rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #9AA4B2;">Documento Submetido:</span>
                <strong style="color: #fff; text-transform: uppercase;"><?php echo htmlspecialchars($kyc_record['doc_type']); ?></strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #9AA4B2;">Nº Documento:</span>
                <strong style="color: #F59E0B;"><?php echo htmlspecialchars($kyc_record['doc_number']); ?></strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span style="color: #9AA4B2;">Data de Envio:</span>
                <strong style="color: #fff;"><?php echo date('d/m/Y H:i', strtotime($kyc_record['created_at'])); ?></strong>
            </div>
        </div>

        <a href="<?php echo GAMER_URL; ?>/suporte.php" style="color: #F0444A; text-decoration: none; font-size: 0.85rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-headset"></i> Precisas de apoio urgente? Fala com o Suporte Ao Vivo
        </a>
    </div>

    <?php else: ?>
    <!-- ESTADO 3: FORMULÁRIO DE ENVIO DE DOCUMENTOS (BI OU CARTA DE CONDUÇÃO) -->
    
    <?php if ($kyc_record && $kyc_record['status'] === 'rejected'): ?>
    <div style="background: rgba(240, 68, 74, 0.15); border: 1.5px solid #F0444A; border-radius: 14px; padding: 18px 20px; margin-bottom: 24px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <i class="fa-solid fa-circle-xmark" style="color: #F0444A; font-size: 1.6rem; margin-top: 2px;"></i>
            <div>
                <strong style="color: #fff; font-size: 1rem; display: block; margin-bottom: 4px;">A tua submissão anterior foi recusada</strong>
                <p style="color: #cbd5e1; font-size: 0.88rem; margin-bottom: 6px; line-height: 1.4;">
                    <strong>Motivo indicado pelo Administrador:</strong> 
                    <span style="color: #ff999d;"><?php echo htmlspecialchars($kyc_record['admin_notes'] ?: 'Documento ilegível, cortado ou dados divergentes. Por favor envie fotos nítidas da frente e do verso.'); ?></span>
                </p>
                <span style="color: #9AA4B2; font-size: 0.80rem;">Podes enviar novamente abaixo com fotografias mais nítidas e legíveis.</span>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <form method="POST" action="<?php echo GAMER_URL; ?>/verificacao.php" enctype="multipart/form-data" style="background: #171C26; border: 1px solid #282F3D; border-radius: 16px; padding: 26px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);">
        <input type="hidden" name="action_kyc" value="submit_docs">

        <!-- ETAPA 1: ESCOLHA DO DOCUMENTO -->
        <div style="margin-bottom: 24px;">
            <label style="display: block; font-size: 0.82rem; font-weight: 800; color: #F0444A; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
                1. Escolha o Tipo de Documento de Identificação *
            </label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                
                <label class="doc-type-radio-label" style="background: #10141C; border: 1.5px solid #282F3D; border-radius: 12px; padding: 14px; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: all 0.2s;">
                    <input type="radio" name="doc_type" value="bi" checked style="accent-color: #F0444A; width: 18px; height: 18px;">
                    <div>
                        <strong style="color: #fff; font-size: 0.90rem; display: block;">Bilhete de Identidade (BI)</strong>
                        <span style="font-size: 0.74rem; color: #9AA4B2;">República de Angola</span>
                    </div>
                </label>

                <label class="doc-type-radio-label" style="background: #10141C; border: 1.5px solid #282F3D; border-radius: 12px; padding: 14px; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: all 0.2s;">
                    <input type="radio" name="doc_type" value="cnh" style="accent-color: #F0444A; width: 18px; height: 18px;">
                    <div>
                        <strong style="color: #fff; font-size: 0.90rem; display: block;">Carta de Condução</strong>
                        <span style="font-size: 0.74rem; color: #9AA4B2;">Documento Oficial de Condução</span>
                    </div>
                </label>

                <label class="doc-type-radio-label" style="background: #10141C; border: 1.5px solid #282F3D; border-radius: 12px; padding: 14px; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: all 0.2s;">
                    <input type="radio" name="doc_type" value="passaporte" style="accent-color: #F0444A; width: 18px; height: 18px;">
                    <div>
                        <strong style="color: #fff; font-size: 0.90rem; display: block;">Passaporte</strong>
                        <span style="font-size: 0.74rem; color: #9AA4B2;">Nacional ou Internacional</span>
                    </div>
                </label>

            </div>
        </div>

        <!-- ETAPA 2: DADOS PESSOAIS -->
        <div style="margin-bottom: 24px;">
            <label style="display: block; font-size: 0.82rem; font-weight: 800; color: #F0444A; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
                2. Informações do Documento & Titular *
            </label>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
                <div>
                    <label style="display: block; font-size: 0.80rem; color: #cbd5e1; font-weight: 700; margin-bottom: 6px;">Nome Completo (como no Documento) *</label>
                    <input type="text" name="fullname" value="<?php echo htmlspecialchars($logged_user['fullname'] ?? ''); ?>" required placeholder="Ex: Manuel António da Silva" style="width: 100%; background: #10141C; border: 1px solid #282F3D; border-radius: 10px; padding: 12px 14px; color: #fff; font-size: 0.90rem;">
                </div>

                <div>
                    <label style="display: block; font-size: 0.80rem; color: #cbd5e1; font-weight: 700; margin-bottom: 6px;">Número do Documento (Nº do BI / Carta) *</label>
                    <input type="text" name="doc_number" required placeholder="Ex: 007293814LA042" style="width: 100%; background: #10141C; border: 1px solid #282F3D; border-radius: 10px; padding: 12px 14px; color: #fff; font-size: 0.90rem; text-transform: uppercase;">
                </div>

                <div>
                    <label style="display: block; font-size: 0.80rem; color: #cbd5e1; font-weight: 700; margin-bottom: 6px;">Data de Nascimento</label>
                    <input type="date" name="birth_date" style="width: 100%; background: #10141C; border: 1px solid #282F3D; border-radius: 10px; padding: 12px 14px; color: #fff; font-size: 0.90rem;">
                </div>

                <div>
                    <label style="display: block; font-size: 0.80rem; color: #cbd5e1; font-weight: 700; margin-bottom: 6px;">Província de Residência *</label>
                    <select name="province" style="width: 100%; background: #10141C; border: 1px solid #282F3D; border-radius: 10px; padding: 12px 14px; color: #fff; font-size: 0.90rem;">
                        <?php foreach ($angola_provinces as $prov): ?>
                            <option value="<?php echo htmlspecialchars($prov); ?>" <?php echo (($logged_user['province'] ?? '') === $prov) ? 'selected' : ''; ?>>
                                <?php echo htmlspecialchars($prov); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
        </div>

        <!-- ETAPA 3: FOTOS DA FRENTE E DO VERSO -->
        <div style="margin-bottom: 28px;">
            <label style="display: block; font-size: 0.82rem; font-weight: 800; color: #F0444A; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
                3. Fotografias do Documento (Frente e Verso) *
            </label>
            <p style="font-size: 0.80rem; color: #9AA4B2; margin-bottom: 14px;">
                Certifique-se de que a foto está nítida, com boa iluminação e que todos os quatro cantos do documento estão visíveis. Formatos aceites: JPG, PNG, WEBP ou PDF (até 10 MB).
            </p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px;">
                
                <!-- FRENTE -->
                <div style="background: #10141C; border: 2px dashed #282F3D; border-radius: 14px; padding: 20px; text-align: center; position: relative;">
                    <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(240, 68, 74, 0.12); color: #F0444A; display: inline-flex; align-items: center; justify-content: center; font-size: 1.3rem; margin-bottom: 10px;">
                        <i class="fa-solid fa-camera"></i>
                    </div>
                    <div style="font-weight: 800; font-size: 0.92rem; color: #fff; margin-bottom: 4px;">Frente do Documento *</div>
                    <div style="font-size: 0.74rem; color: #9AA4B2; margin-bottom: 14px;">Fotografia nítida do lado frontal com a sua foto</div>

                    <input type="file" name="doc_front" id="file_doc_front" required accept="image/*,application/pdf" style="display: none;" onchange="previewKycDoc(this, 'preview_front_wrap', 'preview_front_img')">
                    
                    <button type="button" onclick="document.getElementById('file_doc_front').click()" style="padding: 8px 16px; background: rgba(255,255,255,0.06); border: 1px solid #282F3D; color: #F5F7FA; border-radius: 8px; font-weight: 700; font-size: 0.82rem; cursor: pointer;">
                        <i class="fa-solid fa-upload"></i> Selecionar Imagem
                    </button>

                    <div id="preview_front_wrap" style="display: none; margin-top: 12px;">
                        <img id="preview_front_img" src="" alt="Frente" style="max-height: 140px; border-radius: 8px; border: 1px solid #22C98B;">
                    </div>
                </div>

                <!-- VERSO -->
                <div style="background: #10141C; border: 2px dashed #282F3D; border-radius: 14px; padding: 20px; text-align: center; position: relative;">
                    <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(240, 68, 74, 0.12); color: #F0444A; display: inline-flex; align-items: center; justify-content: center; font-size: 1.3rem; margin-bottom: 10px;">
                        <i class="fa-solid fa-id-card-clip"></i>
                    </div>
                    <div style="font-weight: 800; font-size: 0.92rem; color: #fff; margin-bottom: 4px;">Verso do Documento *</div>
                    <div style="font-size: 0.74rem; color: #9AA4B2; margin-bottom: 14px;">Lado posterior com as informações complementares</div>

                    <input type="file" name="doc_back" id="file_doc_back" accept="image/*,application/pdf" style="display: none;" onchange="previewKycDoc(this, 'preview_back_wrap', 'preview_back_img')">
                    
                    <button type="button" onclick="document.getElementById('file_doc_back').click()" style="padding: 8px 16px; background: rgba(255,255,255,0.06); border: 1px solid #282F3D; color: #F5F7FA; border-radius: 8px; font-weight: 700; font-size: 0.82rem; cursor: pointer;">
                        <i class="fa-solid fa-upload"></i> Selecionar Imagem
                    </button>

                    <div id="preview_back_wrap" style="display: none; margin-top: 12px;">
                        <img id="preview_back_img" src="" alt="Verso" style="max-height: 140px; border-radius: 8px; border: 1px solid #22C98B;">
                    </div>
                </div>

            </div>
        </div>

        <button type="submit" class="btn-ngola btn-ngola-primary" style="width: 100%; padding: 14px; font-size: 0.95rem; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; border-radius: 10px; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 18px rgba(240, 68, 74, 0.45);">
            <i class="fa-solid fa-shield-halved"></i> Submeter Documentos para Verificação
        </button>
    </form>

    <script>
    function previewKycDoc(input, wrapId, imgId) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById(imgId).src = e.target.result;
                    document.getElementById(wrapId).style.display = 'block';
                }
                reader.readAsDataURL(file);
            } else {
                document.getElementById(wrapId).style.display = 'block';
                document.getElementById(wrapId).innerHTML = '<span style="color:#22C98B;font-size:0.80rem;"><i class="fa-solid fa-file-pdf"></i> Ficheiro selecionado: ' + file.name + '</span>';
            }
        }
    }
    </script>
    <?php endif; ?>

</main>

<?php require_once(__DIR__ . '/footer.php'); ?>
