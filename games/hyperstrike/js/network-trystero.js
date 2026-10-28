// js/network-trystero.js - Trystero MQTT 2v2 Squad Mode Protocol (Mesh Network)

let sendAim, sendShoot, sendSpawn, sendClaimHit, sendConfirmHit, sendEmp, sendState;

function initTrysteroNetwork(targetRoomId) {
    if (trysteroRoom) trysteroRoom.leave();
    
    // Connect to MQTT Broker (Bypasses ISP Torrent Blocks)
    const config = { appId: 'vfactor-hyper-strike' };
    trysteroRoom = Trystero.joinRoom(config, targetRoomId);
    
    document.getElementById('status').innerText = 'Connected to Mesh';
    document.getElementById('status').style.color = '#8dff5a';
    
    // Define WebRTC Data Channels
    const [sendA, getA] = trysteroRoom.makeAction('aim');
    const [sendSh, getSh] = trysteroRoom.makeAction('shoot');
    const [sendSp, getSp] = trysteroRoom.makeAction('spawn');
    const [sendCH, getCH] = trysteroRoom.makeAction('claim_hit');
    const [sendCoH, getCoH] = trysteroRoom.makeAction('confirm_hit');
    const [sendE, getE] = trysteroRoom.makeAction('emp');
    const [sendSt, getSt] = trysteroRoom.makeAction('state');
    
    window.trysteroSendAim = sendA;
    window.trysteroSendShoot = sendSh;
    window.trysteroSendSpawn = sendSp;
    window.trysteroSendHit = sendCH;
    window.trysteroSendEmp = sendE;
    window.trysteroSendState = sendSt;
    
    trysteroRoom.onPeerJoin(peerId => {
        if (gameMode !== 'SQUAD') return;
        squadPlayers[peerId] = { id: peerId, name: "Peer_" + peerId.substring(0,4), team: 'red', score: 0, combo: 1, isReady: false };
        squadAims[peerId] = { x: 0.5, y: 0.5, team: 'red' };
        
        // Auto-assign host logic based on lowest ID
        const allIds = [trysteroRoom.selfId, ...Object.keys(squadPlayers)].sort();
        isSquadHost = (allIds[0] === trysteroRoom.selfId);
        
        if (typeof updateSquadLobbyUI === "function") updateSquadLobbyUI();
    });
    
    trysteroRoom.onPeerLeave(peerId => {
        if (gameMode !== 'SQUAD') return;
        delete squadPlayers[peerId];
        delete squadAims[peerId];
        
        const allIds = [trysteroRoom.selfId, ...Object.keys(squadPlayers)].sort();
        isSquadHost = (allIds[0] === trysteroRoom.selfId);
        
        if (typeof updateSquadLobbyUI === "function") updateSquadLobbyUI();
    });
    
    getA((data, peerId) => {
        if (gameMode !== 'SQUAD') return;
        if (squadAims[peerId]) { squadAims[peerId].x = data.x; squadAims[peerId].y = data.y; }
    });
    
    getSh((data, peerId) => {
        if (gameMode !== 'SQUAD') return;
        const w = WEAPONS.find(w => w.id === data.weaponId);
        if (!w) return;
        audio.shoot(w);
        if(w.id === '[ RAIL ]') { railTrails.push({x: data.x, y: data.y, life: 1.5}); screenShake = 10; }
        if(w.id === '[ AEGIS ]') shockwaves.push({x: data.x, y: data.y, life: 1, maxR: 0.15});
        for(let i = 0; i < w.pellets; i++) { flashes.push({ x: data.x + (Math.random() - 0.5) * w.spread, y: data.y + (Math.random() - 0.5) * w.spread, color: w.color, age: 0, poly: w.id!=='[ PULSE ]' }); }
    });
    
    getSp((data, peerId) => {
        if (gameMode !== 'SQUAD') return;
        targets.push(data);
    });
    
    getCH((data, peerId) => {
        if (gameMode !== 'SQUAD') return;
        if (isSquadHost) {
            const t = targets.find(t => t.id === data.targetId);
            if (t && t.active) {
                executeHit(t, peerId, data.damage);
                sendCoH({ target: t, shooter: peerId, damage: data.damage, shotX: data.shotX, shotY: data.shotY });
            }
        }
    });
    
    getCoH((data, peerId) => {
        if (gameMode !== 'SQUAD') return;
        executeHit(data.target, data.shooter, data.damage);
        if (data.shooter !== trysteroRoom.selfId) hitMarkers.push({ x: data.shotX, y: data.shotY, age: 0 });
    });
    
    getE((data, peerId) => {
        if (gameMode !== 'SQUAD') return;
        if (typeof triggerJam === "function") triggerJam();
    });
    
    getSt((data, peerId) => {
        if (gameMode !== 'SQUAD') return;
        if (data.type === 'peer_ready') {
            if(squadPlayers[peerId]) squadPlayers[peerId].isReady = data.ready;
            if (typeof updateSquadLobbyUI === "function") updateSquadLobbyUI();
        } else if (data.type === 'start_countdown') {
            if (typeof runCountdown === "function") runCountdown(data.time);
        } 
        // FIX: Re-mapped the mesh network reset command to the secure soft-reset function
        else if (data.type === 'reset_lobby') {
            if (typeof softResetToMatchLobby === "function") softResetToMatchLobby();
        }
    });
}

window.updateSquadLobbyUI = function() {
    if (gameMode !== 'SQUAD') return;
    document.getElementById('roomTitle').innerText = "2v2 SQUAD";
    document.getElementById('slot1').innerHTML = `P1 (Blue): <strong>${myUsername} ${isSquadHost ? '(HOST)' : ''}</strong>`;
    
    const peers = Object.values(squadPlayers);
    const s2 = document.getElementById('slot2'), s3 = document.getElementById('slot3'), s4 = document.getElementById('slot4');
    
    s2.style.display = 'block';
    s2.innerHTML = `P2 (Red): <strong>${peers[0] ? peers[0].name + (peers[0].isReady ? ' (READY)' : '') : 'Waiting...'}</strong>`;
    
    s3.style.display = 'block';
    s3.innerHTML = `P3 (Blue): <strong>${peers[1] ? peers[1].name + (peers[1].isReady ? ' (READY)' : '') : 'Waiting...'}</strong>`;
    
    s4.style.display = 'block';
    s4.innerHTML = `P4 (Red): <strong>${peers[2] ? peers[2].name + (peers[2].isReady ? ' (READY)' : '') : 'Waiting...'}</strong>`;
    
    const btnReady = document.getElementById('btnReady'), btnStart = document.getElementById('btnStartMatch');
    const waitingText = document.getElementById('waitingText');

    if (isSquadHost) {
        btnReady.style.display = 'none'; btnStart.style.display = 'block'; waitingText.style.display = 'none';
        const allReady = peers.length > 0 && peers.every(p => p.isReady);
        if (allReady) { btnStart.style.opacity = '1'; btnStart.style.pointerEvents = 'auto'; } 
        else { btnStart.style.opacity = '0.4'; btnStart.style.pointerEvents = 'none'; }
    } else {
        btnStart.style.display = 'none'; btnReady.style.display = 'block';
        if (isPeerReady) { btnReady.innerText = '[ CANCEL READY ]'; btnReady.style.background = '#ffb020'; waitingText.style.display = 'block'; } 
        else { btnReady.innerText = '[ HOLD TO READY ]'; btnReady.style.background = '#22e0ff'; waitingText.style.display = 'none'; }
    }
};
