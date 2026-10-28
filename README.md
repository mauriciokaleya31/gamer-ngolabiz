# 🎮 CASINO56 — ARENA GAMER NGOLABIZ

Plataforma angolana de eSports, duelos 1v1 competitivos e apostas em Kwanzas (AOA) com sincronização em tempo real, inteligência artificial para matchmaking e sistema financeiro integrado via Multicaixa Express e transferências bancárias.

---

## 🌟 Principais Funcionalidades

### ⚔️ Centro de Duelos & Batalhas
- **Mural de Desafios Abertos**: Propostas públicas em tempo real onde qualquer jogador pode aceitar desafios de outros combatentes de Angola.
- **Batalhas Ao Vivo (Em Curso)**: Monitoramento em tempo real dos combates em andamento na Arena, mostrando rondas, placar e potes de aposta.
- **Matchmaking e Radar de Combatentes**: Varrimento por província (Luanda, Benguela, Huambo, Huíla, Cabinda, etc.) com detecção de latência e compatibilidade.
- **Motor Autônomo de Bots (`cron_arena_battles.php`)**: Gestão de ciclo de vida (`available`, `proposal_pending`, `in_battle`, `cooldown`), garantindo atividade contínua 24/7 sem repetição de combatentes.

### 🕹️ Catálogo dos 5 Jogos Oficiais da Arena
1. **Hyper-Strike**: Combate 2D táctico de ação e reflexos rápidos.
2. **Neon Fist**: Luta arcade urbana com golpes combinados.
3. **MK.js Kombat**: Duelo clássico e nostálgico no estilo Mortal Kombat.
4. **Duelo de Cartas 1v1 (Card Battle)**: Estratégia, contadores de poder e atributos por turnos.
5. **Pedra, Papel e Tesoura 1v1 (RPS Battle)**: Desafio mental em tempo real com melhor de 3 rondas.

### 💰 Sistema Financeiro & Carteira Integrada
- **Apostas Mínimas Reais**: Apostas a partir de 500 Kz com cálculo automático de taxa da plataforma e prêmio líquido.
- **Depósitos Multicaixa Express**: Fluxo de depósito com entidade e referência (Multicaixa Express), upload de comprovativo e validação.
- **Saques Automatizados**: Solicitação com seleção de bancos angolanos (BAI, BFA, BIC, Standard Bank, Millennium Atlântico, etc.), validação de formato IBAN angolano (`AO06...`) e verificação KYC obrigatória.
- **Auditoria de Partidas & Ganhos**: Registros transparentes em `arena_matches` e feed dinâmico no estilo dark casino de `arena_live_wins`.

### 🛡️ Segurança, KYC & Painel Administrativo
- **Verificação KYC**: Envio e aprovação de Bilhete de Identidade (BI) ou Carta de Condução (frente e verso).
- **Painel Administrativo Completo (`admin.php`)**:
  - Menu lateral dedicado com visão geral de KPIs em tempo real.
  - Gestão de utilizadores (saldo, banimento, redefinição de senha e impersonation).
  - Gestão de saques com aprovação/rejeição em 1 clique (reembolso automático em caso de recusa).
  - Configuração de perfil de suporte humanizado (atendentes dinâmicos).
  - Gestão de capas de jogos e hero banner.
  - Auditoria e regras da taxa da casa.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: PHP 8.x com MySQLi / PDO
- **Base de Dados**: MySQL / MariaDB
- **Frontend**: HTML5, CSS3 moderno (Dark Gamer Theme), JavaScript (ES6+ Vanilla)
- **Áudio**: Efeitos sonoros imersivos via Web Audio API
- **Ícones & Estilos**: FontAwesome 6, Google Fonts (Rajdhani, Inter)

---

## 🚀 Instalação e Configuração

1. **Clonar o Repositório**:
   ```bash
   git clone https://github.com/mauriciokaleya31/gamer-ngolabiz.git
   cd gamer-ngolabiz
   ```

2. **Configurar a Base de Dados**:
   - Abra o ficheiro `init.php` e configure as credenciais da base de dados:
     ```php
     define('DB_HOST', 'localhost');
     define('DB_USER', 'seu_usuario');
     define('DB_PASS', 'sua_senha');
     define('DB_NAME', 'nome_da_base');
     ```
   - As tabelas e migrações necessárias (`arena_bots`, `arena_challenges`, `arena_matches`, `arena_live_wins`, `arena_deposits`, `arena_withdrawals`, `arena_verifications`) são criadas automaticamente se não existirem.

3. **Configurar o Motor de Bots (Cron Job)**:
   - Adicione no cPanel ou no crontab do servidor:
     ```bash
     * * * * * php /caminho/para/gamer/cron_arena_battles.php >/dev/null 2>&1
     ```

---

## 📄 Licença
Todos os direitos reservados à Casino56 & NgolaBiz.
