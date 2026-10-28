// js/network-peer.js - PeerJS 1v1 Arena Mode Protocol (Lazy Loaded)

function generateLobbyID() {
    return 'VFACT-' + Math.random().toString(36).substr(2, 4).toUpperCase();
}

let peer = null;
let isPeerInitialized = false;

function initPeerJSNetwork() {
    if (isPeerInitialized) return;
    isPeerInitialized = true;

    document.getElementById('status').innerText = 'Connecting to Server...'; 
    document.getElementById('status').style.color = '#ffb020';

    try {
        peer = new Peer(generateLobbyID(), {
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
                    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
                ]
            }
        });
    } catch (error) {
        console.error("PeerJS blocked by browser.", error);
    }

    if (peer) {
        peer.on('open', (id) => { 
            if(document.getElementById('playerId')) document.getElementById('playerId').innerText = id; 
            document.getElementById('status').innerText = 'Online'; document.getElementById('status').style.color = '#8dff5a';
        });

        peer.on('connection', (conn) => {
            if (gameMode !== 'DUEL') { conn.close(); return; }
            isHost = true; 
            if (conn.label === 'unreliable') { connUnreliable = conn; } 
            else {
                connection = conn; 
                document.getElementById('status').innerText = 'Connected';
                document.getElementById('lobby').style.display = 'none'; 
                document.getElementById('skeletonUI').style.display = 'block';
            }
            setupChannel(conn);
        });
    }
}

document.getElementById('btnPrimaryMulti').addEventListener('click', initPeerJSNetwork);
document.getElementById('btnDuel').addEventListener('click', initPeerJSNetwork);

document.getElementById('connectBtn').addEventListener('click', () => {
    if (gameMode !== 'DUEL') return; 
    if (!peer) { alert("Multiplayer is blocked. Please play Solo."); return; }
    
    const targetId = document.getElementById('joinId').value.trim();
    if (targetId) {
        document.getElementById('status').innerText = 'Authenticating...'; 
        document.getElementById('lobby').style.display = 'none'; 
        document.getElementById('skeletonUI').style.display = 'block';
        
        connection = peer.connect(targetId, { reliable: true, label: 'reliable' }); 
        connUnreliable = peer.connect(targetId, { reliable: false, label: 'unreliable' }); 
        
        setupChannel(connection);
        setupChannel(connUnreliable);

        connectionTimeout = setTimeout(() => {
            if (!connection || !connection.open) {
                alert("Connection Timed Out. A firewall is blocking data.");
                if (typeof resetToHub === "function") resetToHub();
            }
        }, 10000);
    }
});

function updateMatchLobbyUI() {
    if (gameMode !== 'DUEL') return;

    document.getElementById('roomTitle').innerText = "ARENA 1v1";
    document.getElementById('slot3').style.display = 'none';
    document.getElementById('slot4').style.display = 'none';

    document.getElementById('roomHostName').innerText = isHost ? myUsername : peerUsername;
    const peerNameEl = document.getElementById('roomPeerName');
    peerNameEl.innerText = (isHost ? peerUsername : myUsername) + (isPeerReady ? " (READY)" : "");
    peerNameEl.style.color = isPeerReady ? '#8dff5a' : '#ff2d95';
    
    if (peerUsername !== "Waiting...") {
        document.getElementById('networkControls').style.opacity = '0';
        setTimeout(() => document.getElementById('networkControls').style.display = 'none', 300);
    }
    
    hostMatchTime = parseInt(document.getElementById('matchTimeSetting').value) || 60;
    document.getElementById('roomMatchRules').innerText = `ARENA DUEL | ${hostMatchTime} SECONDS`;

    const btnReady = document.getElementById('btnReady'), btnStart = document.getElementById('btnStartMatch');
    const waitingText = document.getElementById('waitingText');

    if (isHost) {
        btnReady.style.display = 'none'; btnStart.style.display = 'block'; waitingText.style.display = 'none';
        if (isPeerReady) { btnStart.style.opacity = '1'; btnStart.style.pointerEvents = 'auto'; } else { btnStart.style.opacity = '0.4'; btnStart.style.pointerEvents = 'none'; }
    } else {
        btnStart.style.display = 'none'; btnReady.style.display = 'block';
        if (isPeerReady) { btnReady.innerText = '[ CANCEL READY ]'; btnReady.style.background = '#ffb020'; waitingText.style.display = 'block'; } else { btnReady.innerText = '[ HOLD TO READY ]'; btnReady.style.background = '#22e0ff'; waitingText.style.display = 'none'; }
    }
}

function enterMatchLobby() {
    if (gameMode !== 'DUEL') return;
    document.getElementById('skeletonUI').style.display = 'none'; 
    document.getElementById('matchLobby').style.display = 'flex'; 
    document.getElementById('statusContainer').style.display = 'none'; 
    updateMatchLobbyUI();
}

document.getElementById('btnLeaveRoom').addEventListener('click', () => {
    if (gameMode !== 'DUEL') return;
    if (connection && connection.open) connection.send({ type: 'peer_left' });
    setTimeout(() => { if (typeof resetToHub === "function") resetToHub(); }, 100); 
});

const btnReady = document.getElementById('btnReady');
btnReady.addEventListener('pointerdown', (e) => {
    if (gameMode !== 'DUEL') return;
    if (isHost) return;
    if (isPeerReady) {
        isPeerReady = false; 
        if (connection && connection.open) connection.send({ type: 'peer_ready', ready: false });
        updateMatchLobbyUI(); return;
    }
    btnReady.style.background = 'linear-gradient(90deg, #8dff5a 0%, #22e0ff 0%)';
    let progress = 0;
    readyHoldTimer = setInterval(() => {
        progress += 4;
        btnReady.style.background = `linear-gradient(90deg, #8dff5a ${progress}%, #22e0ff ${progress}%)`;
        if (progress >= 100) {
            clearInterval(readyHoldTimer);
            isPeerReady = true;
            if (connection && connection.open) connection.send({ type: 'peer_ready', ready: true });
            updateMatchLobbyUI();
        }
    }, 40);
});
const cancelReadyHold = () => { if (gameMode !== 'DUEL') return; clearInterval(readyHoldTimer); if(!isPeerReady && !isHost) btnReady.style.background = '#22e0ff'; };
btnReady.addEventListener('pointerup', cancelReadyHold);
btnReady.addEventListener('pointerleave', cancelReadyHold);

document.getElementById('btnStartMatch').addEventListener('click', () => { 
    if (gameMode !== 'DUEL') return;
    if (!isPeerReady) return; 
    if (connection && connection.open) connection.send({ type: 'start_countdown', time: hostMatchTime }); 
    if (typeof runCountdown === "function") runCountdown(hostMatchTime); 
});

function setupChannel(conn) {
    if (gameMode !== 'DUEL') return;
    conn.on('open', () => { 
        if (conn.label === 'reliable') {
            if (connectionTimeout) clearTimeout(connectionTimeout);
            document.getElementById('status').innerText = 'Connected'; 
            if (!isHost) conn.send({ type: 'auth_request', requestedName: myUsername }); 
            
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => { 
                if(conn.open) {
                    pingStart = performance.now();
                    conn.send({ type: 'ping' }); 
                }
            }, 3000);
        }
    });

    conn.on('data', (data) => {
        if (gameMode !== 'DUEL') return;
        
        if (data.type === 'ping') { if (conn.open) conn.send({ type: 'pong' }); return; }
        if (data.type === 'pong') { 
            currentPing = Math.round(performance.now() - pingStart);
            if (typeof updatePingUI === "function") updatePingUI(currentPing);
            return; 
        }

        if (data.type === 'auth_request' && isHost) {
            if (data.requestedName.toLowerCase() === myUsername.toLowerCase()) {
                conn.send({ type: 'auth_reject', suggestedName: data.requestedName + (Math.random() > 0.5 ? "_Neon" : "_Flux") }); setTimeout(() => conn.close(), 500);
            } else { peerUsername = data.requestedName; conn.send({ type: 'auth_accept', hostName: myUsername, time: hostMatchTime }); enterMatchLobby(); }
        } 
        else if (data.type === 'auth_reject' && !isHost) { alert(`Username taken! Try using: ${data.suggestedName}`); if (typeof resetToHub === "function") resetToHub(); } 
        else if (data.type === 'auth_accept' && !isHost) { peerUsername = data.hostName; hostMatchTime = data.time; enterMatchLobby(); } 
        else if (data.type === 'peer_ready') { isPeerReady = data.ready; updateMatchLobbyUI(); } 
        else if (data.type === 'update_time') { hostMatchTime = data.time; updateMatchLobbyUI(); } 
        
        else if (data.type === 'start_countdown') { 
            if (!isHost && !isPeerReady) return; 
            if (typeof runCountdown === "function") runCountdown(data.time); 
        } 
        
        else if (data.type === 'peer_left') { alert("The other player left the room."); if (typeof resetToHub === "function") resetToHub(); }
        
        else if (data.type === 'reset_lobby') { 
            if (typeof softResetToMatchLobby === "function") softResetToMatchLobby(); 
        }
        
        else if (data.type === 'aim') { peerAim.x = data.x; peerAim.y = data.y; } 
        else if (data.type === 'spawn') { targets.push(data.target); } 
        
        else if (data.type === 'shoot_anim') {
            const w = WEAPONS.find(w => w.id === data.weaponId); 
            if (!w) return;
            
            const nowInSeconds = performance.now() / 1000;
            if (nowInSeconds - peerLastShotTime < w.rof - 0.05) { return; }
            peerLastShotTime = nowInSeconds;
            
            peerShotsFired += w.pellets; audio.shoot(w);
            if(w.id === '[ RAIL ]') { railTrails.push({x: data.x, y: data.y, life: 1.5}); screenShake = 10; }
            if(w.id === '[ AEGIS ]') shockwaves.push({x: data.x, y: data.y, life: 1, maxR: 0.15});
            for(let i = 0; i < w.pellets; i++) { flashes.push({ x: data.x + (Math.random() - 0.5) * w.spread, y: data.y + (Math.random() - 0.5) * w.spread, color: w.color, age: 0, poly: w.id!=='[ PULSE ]' }); }
        } 
        
        else if (data.type === 'claim_hit') {
            if (isHost) {
                const t = targets.find(t => t.id === data.targetId);
                const w = WEAPONS.find(weap => weap.id === data.weaponId);
                
                if (t && t.active && w) { 
                    let expectedDamage = w.damage;
                    if (t.anomaly === 'gold') expectedDamage *= 3;
                    
                    if (data.damage > expectedDamage) return; 

                    executeHit(t, data.shooter, w.damage); 
                    if (connection && connection.open) connection.send({ type: 'confirm_hit', target: t, shooter: data.shooter, damage: w.damage, shotX: data.shotX, shotY: data.shotY }); 
                }
            }
        } else if (data.type === 'confirm_hit') {
            executeHit(data.target, data.shooter, data.damage);
            if (data.shooter !== (isHost ? 'Host' : 'Peer')) hitMarkers.push({ x: data.shotX, y: data.shotY, age: 0 });
        } else if (data.type === 'emp_attack') { if (typeof triggerJam === "function") triggerJam(); }
    });
    
    conn.on('error', (err) => { console.error(err); alert("Network Error: " + err.type); if (typeof resetToHub === "function") resetToHub(); });
    conn.on('close', () => { 
        if(conn.label === 'reliable') { alert("Connection lost."); if (typeof resetToHub === "function") resetToHub(); }
    });
}
