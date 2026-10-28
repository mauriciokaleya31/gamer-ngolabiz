// Configuração do cliente web. Quando servido pelo portal PHP, o token de sessão vem de
// ../platform/token.php (que também indica o URL WebSocket público). Servido pelo
// servidor de mundo em desenvolvimento, o pedido falha e o cliente entra como visitante.
window.WORLD3D_CONFIG = Object.assign({ tokenUrl: '../platform/token.php' }, window.WORLD3D_CONFIG || {});
