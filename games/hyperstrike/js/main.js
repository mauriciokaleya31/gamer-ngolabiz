// js/main.js - Global States, Audio, and Hub UI

const canvas = document.getElementById('gameCanvas'); 
const ctx = canvas.getContext('2d');

let myUsername = "Player"; 
let gameMode = 'SOLO'; 
let hostMatchTime = 3600; // 1 Hora (Segurança Arena)
let maxTargetsLimit = 8;
let allowEMPs = true;
let joystickSensitivity = 1.0; // Dynamic Joystick Setting

const WEAPONS = [ 
    { id: '[ PULSE ]', name: '[ PULSE ]', auto: true, rof: 0.1, spread: 0.05, pellets: 1, damage: 10, color: '#22e0ff' }, 
    { id: '[ RAIL ]', name: '[ RAIL ]', auto: false, rof: 1.2, spread: 0.0, pellets: 1, damage: 100, color: '#ff2d95' }, 
    { id: '[ AEGIS ]', name: '[ AEGIS ]', auto: false, rof: 0.8, spread: 0.15, pellets: 6, damage: 20, color: '#ffb020' }, 
    { id: '[ FLUX ]', name: '[ FLUX ]', auto: true, rof: 0.4, spread: 0.04, pellets: 3, damage: 30, color: '#8dff5a' } 
];

let currentWeaponIdx = 0, isTriggerDown = false, lastShotTime = 0, isJammed = false;
let targets = [], flashes = [], hitMarkers = [], screenShake = 0, lastTime = performance.now();
const myAim = { x: 0.5, y: 0.5 }, peerAim = { x: 0.5, y: 0.5 }; 

let trysteroRoom = null;
let isSquadHost = false;
let squadPlayers = {}; 
let squadAims = {};    
let myTeam = 'blue';

let isGameRunning = false, currentMatchTime = 3600, isMatchOver = false, clockInterval, spawnInterval;
let myScore = 0, peerScore = 0, myCombo = 1, peerCombo = 1, myLastHitTime = 0, peerLastHitTime = 0;
let myShotsFired = 0, myShotsHit = 0, peerShotsFired = 0, peerShotsHit = 0, myMaxCombo = 1, peerMaxCombo = 1; 

let shards = [], fct = [], shockwaves = [], railTrails = [], timeScale = 1.0;
let myAccHistory = [0], peerAccHistory = [0], peripheralFlashOpacity = 0;

let aimPointerId = null, shootPointerId = null;
let touchAnchor = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, lastX: 0, lastY: 0, startTime: 0 };
let joystick = { active: false, originX: 0, originY: 0, deltaX: 0, deltaY: 0, radius: 45 };
let autoFireHoverTime = 0, lastAimSendTime = 0;

let connection = null, connUnreliable = null;     
let isHost = false, isPeerReady = false, peerUsername = "Waiting...";
let connectionTimeout = null, heartbeatInterval = null, readyHoldTimer = null;
let pingStart = 0, currentPing = 0;
let peerLastShotTime = 0;

let gyroBase = { beta: null, gamma: null };
let globalParticleThrottle = 1.0, dtHistory = [];
let bgZ = 1.0, streams = [], rgbHue = 0, notifyTimeout = null;
let isTouchDevice = false;

function updatePingUI(ping) {
    const ind = document.getElementById('pingIndicator');
    const val = document.getElementById('pingValue');
    const icon = document.getElementById('wifiSvg');
    
    if(ind) ind.style.display = 'inline-flex';
    if(val) val.innerText = ping + "ms";
    
    if(icon) {
        icon.classList.remove('wifi-green', 'wifi-blue', 'wifi-red');
        if (ping < 80) icon.classList.add('wifi-green');
        else if (ping < 200) icon.classList.add('wifi-blue');
        else icon.classList.add('wifi-red');
    }
}

setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 500); }
    checkLoginStatus(); 
}, 300);

window.addEventListener('touchstart', () => { isTouchDevice = true; }, { passive: true });

// --- SETTINGS GEAR MENU LOGIC ---
const btnSettingsMenu = document.getElementById('btnSettingsMenu');
const settingsDropdown = document.getElementById('settingsDropdown');
const sensSlider = document.getElementById('sensSlider');
const sensValue = document.getElementById('sensValue');
const btnDefaultSettings = document.getElementById('btnDefaultSettings');

if (btnSettingsMenu && settingsDropdown) {
    btnSettingsMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsDropdown.style.display = settingsDropdown.style.display === 'flex' ? 'none' : 'flex';
    });
}

document.addEventListener('click', (e) => {
    if (settingsDropdown && !e.target.closest('#settingsContainer')) {
        settingsDropdown.style.display = 'none';
    }
});

if (sensSlider) {
    sensSlider.addEventListener('input', (e) => {
        joystickSensitivity = parseFloat(e.target.value);
        sensValue.innerText = joystickSensitivity.toFixed(1);
    });
}

if (btnDefaultSettings) {
    btnDefaultSettings.addEventListener('click', () => {
        // Reset Sensitivity
        joystickSensitivity = 1.0;
        if(sensSlider) sensSlider.value = "1.0";
        if(sensValue) sensValue.innerText = "1.0";
        
        // Target buttons & actively trigger clicks to reset UI colors & logic if they are OFF
        const btnSnd = document.getElementById('btnGlobalSound');
        if (btnSnd && btnSnd.innerText.includes('OFF')) btnSnd.click();
        
        const btnShk = document.getElementById('btnShakeToggle');
        if (btnShk && btnShk.innerText.includes('OFF')) btnShk.click();
        
        const btnAuto = document.getElementById('btnAutoFireToggle');
        if (btnAuto && btnAuto.innerText.includes('OFF')) btnAuto.click();
    });
}

const audio = (() => {
    let ac = null, master = null, muted = false, analyser = null, dataArray = null;
    let femaleVoice = null;

    function initVoice() {
        if (!window.speechSynthesis) return;
        let voices = window.speechSynthesis.getVoices();
        femaleVoice = voices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman') || v.name.toLowerCase().includes('samantha') || v.name.toLowerCase().includes('zira')) || voices[0];
    }
    if (window.speechSynthesis) { window.speechSynthesis.onvoiceschanged = initVoice; initVoice(); }

    function ensure() {
        if (!ac && !muted) { 
            ac = new (window.AudioContext || window.webkitAudioContext)(); 
            master = ac.createGain(); master.gain.value = 0.4; 
            analyser = ac.createAnalyser(); analyser.fftSize = 64;
            master.connect(analyser); analyser.connect(ac.destination);
            dataArray = new Uint8Array(analyser.frequencyBinCount);
        }
    }
    function tone(f, dur, g, type='sine', slide) {
        if(muted || !ac) return;
        const o = ac.createOscillator(), gg = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, ac.currentTime);
        if(slide) o.frequency.exponentialRampToValueAtTime(slide, ac.currentTime + dur);
        gg.gain.setValueAtTime(0, ac.currentTime); gg.gain.linearRampToValueAtTime(g, ac.currentTime + 0.01);
        gg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur); o.connect(gg).connect(master); o.start(); o.stop(ac.currentTime + dur);
    }
    function noise(dur, f0, f1, g) {
        if(muted || !ac) return;
        const n = ac.sampleRate * dur, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
        for(let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), gg = ac.createGain();
        src.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(f0, ac.currentTime);
        if(f1) f.frequency.exponentialRampToValueAtTime(f1, ac.currentTime + dur);
        gg.gain.value = g; src.connect(f).connect(gg).connect(master); src.start();
    }
    return {
        init: () => { if (!muted && !ac) ensure(); if (ac && ac.state === 'suspended') ac.resume(); },
        toggle: () => { muted = !muted; return muted; },
        shoot: (w) => {
            ensure();
            if(w.id === '[ PULSE ]') tone(900, 0.1, 0.1, 'square', 400); else if(w.id === '[ RAIL ]') { noise(0.4, 3000, 100, 0.8); tone(150, 0.4, 0.5, 'sine', 40); } else if(w.id === '[ AEGIS ]') { noise(0.3, 1500, 200, 0.5); tone(200, 0.3, 0.4, 'sine', 80); } else if(w.id === '[ FLUX ]') tone(1200, 0.15, 0.1, 'triangle', 800);
        },
        hit: (isGold) => { ensure(); tone(isGold ? 1200 : 800, 0.15, 0.2, 'triangle', isGold ? 2000 : 1200); },
        doubleHit: () => { ensure(); tone(1800, 0.1, 0.2, 'square', 2400); setTimeout(()=>tone(2400, 0.1, 0.2, 'square', 3000), 100); },
        perfectHit: () => { ensure(); tone(2000, 0.2, 0.3, 'sine', 3000); noise(0.1, 5000, 1000, 0.2); },
        comboStreak: () => { ensure(); tone(800, 0.3, 0.3, 'sawtooth', 1600); tone(1200, 0.3, 0.3, 'sine', 2400); },
        jam: () => { ensure(); noise(1.0, 500, 100, 0.5); tone(200, 1.0, 0.3, 'sawtooth', 50); },
        gameover: (win) => { ensure(); if(win) { tone(400,0.2,0.2,'sine',600); setTimeout(()=>tone(600,0.4,0.2,'sine',800), 200); } else { tone(300, 0.5, 0.2, 'sawtooth', 100); } },
        getFreq: () => { if(!analyser) return 0; analyser.getByteFrequencyData(dataArray); let sum=0; for(let i=0;i<dataArray.length;i++) sum+=dataArray[i]; return sum/dataArray.length; },
        announce: (text) => {
            if (muted || !window.speechSynthesis) return;
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            if (femaleVoice) u.voice = femaleVoice;
            u.rate = 1.2; u.pitch = 1.3; u.volume = master ? master.gain.value * 2.5 : 1.0;
            window.speechSynthesis.speak(u);
        }
    };
})();

const haptics = {
    vibrate: (pattern) => { if (isTouchDevice && navigator.vibrate) navigator.vibrate(pattern); },
    shoot: (wId) => haptics.vibrate(wId === '[ RAIL ]' ? 50 : 15),
    hit: () => haptics.vibrate([25, 25, 25]),
    jam: () => haptics.vibrate([40, 30, 40, 30, 40])
};

const btnGlobalSound = document.getElementById('btnGlobalSound');
if(btnGlobalSound) {
    btnGlobalSound.addEventListener('click', () => {
        const isMuted = audio.toggle();
        btnGlobalSound.innerText = isMuted ? '[ SOUND: OFF ]' : '[ SOUND: ON ]';
        btnGlobalSound.style.color = isMuted ? '#ff3b3b' : '#22e0ff'; 
    });
}

const btnOpenGuide = document.getElementById('btnOpenGuide');
if (btnOpenGuide) {
    btnOpenGuide.addEventListener('click', () => {
        const gm = document.getElementById('guideModal');
        if (gm) gm.style.display = 'flex';
        if (settingsDropdown) settingsDropdown.style.display = 'none';
    });
}

const btnCloseGuide = document.getElementById('btnCloseGuide');
if (btnCloseGuide) {
    btnCloseGuide.addEventListener('click', () => {
        const gm = document.getElementById('guideModal');
        if (gm) gm.style.display = 'none';
    });
}

const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('vfactor_username');
        sessionStorage.removeItem('vfactor_username');
        myUsername = "Player";
        
        const lobbyEl = document.getElementById('lobby'); if (lobbyEl) lobbyEl.style.display = 'none';
        const loginEl = document.getElementById('loginUI'); if (loginEl) loginEl.style.display = 'flex';
        const statusEl = document.getElementById('statusContainer'); if (statusEl) statusEl.style.display = 'none';
        const setContEl = document.getElementById('settingsContainer'); if (setContEl) setContEl.style.display = 'none';
        
        const regU = document.getElementById('regUsername'); if (regU) regU.value = '';
        const regP = document.getElementById('regPassword'); if (regP) regP.value = '';
        gameMode = 'SOLO';
    });
}

const usernameInput = document.getElementById('regUsername');
const passwordInput = document.getElementById('regPassword');

// Motores de Sincronização da Arena NgolaBiz
let arenaChannel = null;
let isArenaGame = false;
let isBotInstance = false;
let botAIInterval = null;

function handleArenaChannelMessage(e) {
    if (!e.data) return;
    if (e.data.type === 'opp_aim') {
        peerAim.x = e.data.x;
        peerAim.y = e.data.y;
    } else if (e.data.type === 'opp_shoot') {
        const shotW = WEAPONS[e.data.weaponIdx || 0] || WEAPONS[0];
        flashes.push({ x: e.data.x, y: e.data.y, color: '#ff2d95', age: 0, poly: true });
        if (typeof audio !== 'undefined' && audio.shoot) audio.shoot(shotW);
    } else if (e.data.type === 'opp_score') {
        peerScore = e.data.score || 0;
        peerCombo = e.data.combo || 1;
        const pScoreEl = document.getElementById('peerScore');
        const pComboEl = document.getElementById('peerCombo');
        if (pScoreEl) pScoreEl.innerText = peerScore;
        if (pComboEl) pComboEl.innerText = 'x' + Math.floor(peerCombo);
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'arena_score_update', oppScore: peerScore, p2_score: peerScore }, '*');
        }
    } else if (e.data.type === 'arena_start_match') {
        const duration = e.data.duration || 60;
        hostMatchTime = duration;
        if (!isGameRunning && typeof startGameplay === 'function') {
            startGameplay(duration);
        }
    }
}

// Receptor de comandos do play.php (Pai)
window.addEventListener('message', function(ev) {
    if (!ev.data) return;
    if (ev.data.type === 'arena_start_match') {
        const duration = ev.data.duration || 3600;
        hostMatchTime = duration;
        if (typeof window.startOfficialMatch === 'function') {
            window.startOfficialMatch(duration);
        } else if (typeof startGameplay === 'function') {
            startGameplay(duration);
        }
        const urlParams = new URLSearchParams(window.location.search);
        if (isBotInstance || urlParams.get('is_bot') === '1') {
            initBotBehavior();
        }
    } else if (ev.data.type === 'arena_next_round') {
        if (typeof window.syncArenaRoundFromParent === 'function') {
            window.syncArenaRoundFromParent(ev.data.round);
        }
    } else if (ev.data.type === 'arena_stop') {
        isGameRunning = false;
        isMatchOver = true;
        if (clockInterval) clearInterval(clockInterval);
        if (spawnInterval) clearInterval(spawnInterval);
    } else if (ev.data.type === 'arena_resize') {
        if (typeof resize === 'function') {
            resize();
        }
    } else if (ev.data.type === 'arena_virtual_key') {
        if (ev.data.code === 'KeyJ' || ev.data.key === 'j' || ev.data.code === 'Space') {
            if (ev.data.evType === 'keydown') {
                isTriggerDown = true;
                if (typeof attemptFire === 'function') attemptFire(performance.now() / 1000);
            } else {
                isTriggerDown = false;
            }
        } else if (ev.data.code === 'KeyW' || ev.data.key === 'ArrowUp') {
            myAim.y = Math.max(0.1, myAim.y - 0.12);
        } else if (ev.data.code === 'KeyS' || ev.data.key === 'ArrowDown') {
            myAim.y = Math.min(0.9, myAim.y + 0.12);
        } else if (ev.data.code === 'KeyA' || ev.data.key === 'ArrowLeft') {
            myAim.x = Math.max(0.1, myAim.x - 0.12);
        } else if (ev.data.code === 'KeyD' || ev.data.key === 'ArrowRight') {
            myAim.x = Math.min(0.9, myAim.x + 0.12);
        } else if (ev.data.code === 'KeyU' || ev.data.code === 'KeyK') {
            if (ev.data.evType === 'keydown' && typeof selectWeaponFromMenu === 'function') {
                selectWeaponFromMenu((currentWeaponIdx + 1) % 4);
            }
        }
    }
});


function initBotBehavior() {
    if (botAIInterval) clearInterval(botAIInterval);
    const urlParams = new URLSearchParams(window.location.search);
    const winrateSetting = parseInt(urlParams.get('bot_winrate')) || 75;

    isGameRunning = true;
    isMatchOver = false;

    const gUI = document.getElementById('gameUI');
    if (gUI) gUI.style.display = 'block';
    if (canvas) canvas.style.display = 'block';

    if (targets.length === 0 && typeof spawnTarget === 'function') {
        for (let i = 0; i < 5; i++) spawnTarget();
    }
    if (!spawnInterval && typeof spawnTarget === 'function') {
        spawnInterval = setInterval(spawnTarget, 900);
    }

    let lastFireTime = 0;
    let targetIdx = 0;

    botAIInterval = setInterval(function() {
        if (!isGameRunning || isMatchOver) return;

        let activeTargets = targets.filter(t => t.active);
        if (activeTargets.length < 3 && typeof spawnTarget === 'function') {
            spawnTarget();
            activeTargets = targets.filter(t => t.active);
        }

        if (activeTargets.length > 0) {
            const target = activeTargets[targetIdx % activeTargets.length];
            if (!target) return;

            // Movimentação suave e realista da mira do Bot em direção ao drone
            myAim.x += (target.x - myAim.x) * 0.35;
            myAim.y += (target.y - myAim.y) * 0.35;

            if (arenaChannel) {
                arenaChannel.postMessage({ type: 'opp_aim', x: myAim.x, y: myAim.y });
            }

            const dist = Math.hypot(myAim.x - target.x, myAim.y - target.y);
            const nowSec = performance.now() / 1000;

            // Cadência de tiro do Bot (a cada 450ms a 750ms)
            if ((nowSec - lastFireTime) >= 0.45) {
                lastFireTime = nowSec;

                // Executa disparo de laser visual
                isTriggerDown = true;
                if (typeof attemptFire === 'function') {
                    attemptFire(nowSec);
                }
                isTriggerDown = false;

                const shouldHit = (Math.random() * 100) <= winrateSetting;
                if (shouldHit || dist < 0.22) {
                    myAim.x = target.x;
                    myAim.y = target.y;
                    if (typeof executeHit === 'function') {
                        const shotW = WEAPONS[currentWeaponIdx] || WEAPONS[0];
                        executeHit(target, 'Me', shotW.damage);
                    }
                    targetIdx++;
                }

                if (arenaChannel) {
                    arenaChannel.postMessage({ type: 'opp_shoot', x: myAim.x, y: myAim.y, weaponIdx: currentWeaponIdx });
                    arenaChannel.postMessage({ type: 'opp_score', score: myScore, combo: myCombo });
                }
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'arena_score_update', oppScore: myScore, p2_score: myScore }, '*');
                }
            }
        } else {
            myAim.x += (Math.random() - 0.5) * 0.05;
            myAim.y += (Math.random() - 0.5) * 0.05;
            myAim.x = Math.max(0.15, Math.min(0.85, myAim.x));
            myAim.y = Math.max(0.15, Math.min(0.85, myAim.y));
            if (arenaChannel) {
                arenaChannel.postMessage({ type: 'opp_aim', x: myAim.x, y: myAim.y });
            }
        }
    }, 55);
}

function checkLoginStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const arenaUser = urlParams.get('user_name');
    if (arenaUser) {
        isArenaGame = true;
        myUsername = arenaUser;
        peerUsername = urlParams.get('opp_name') || 'Adversário';
        isBotInstance = (urlParams.get('is_bot') === '1');
        isHost = (urlParams.get('role') === 'challenger');
        gameMode = 'DUEL';
        hostMatchTime = 3600;

        localStorage.setItem('vfactor_username', arenaUser);
        sessionStorage.setItem('vfactor_username', arenaUser);

        const roomKey = urlParams.get('room') || 'arena_duel';
        if ('BroadcastChannel' in window) {
            try {
                arenaChannel = new BroadcastChannel('arena_hyperstrike_' + roomKey);
                arenaChannel.onmessage = handleArenaChannelMessage;
            } catch(e) {}
        }

        // Esconder telas de login e lobby imediatamente
        const splashEl = document.getElementById('splash');
        if (splashEl) splashEl.style.display = 'none';
        const loginEl = document.getElementById('loginUI');
        if (loginEl) loginEl.style.display = 'none';
        const lobbyEl = document.getElementById('lobby');
        if (lobbyEl) lobbyEl.style.display = 'none';
        const mLobby = document.getElementById('matchLobby');
        if (mLobby) mLobby.style.display = 'none';
        const setCont = document.getElementById('settingsContainer');
        if (setCont) setCont.style.display = 'none';
        const statusCont = document.getElementById('statusContainer');
        if (statusCont) statusCont.style.display = 'none';

        if (isBotInstance) {
            // TELA 2: Bot aguarda em standby com tela e alvos renderizados
            let attempts = 0;
            const startBotLoop = setInterval(() => {
                attempts++;
                if (typeof prepareGameStandby === 'function') {
                    clearInterval(startBotLoop);
                    prepareGameStandby();
                } else if (typeof startGameplay === 'function') {
                    clearInterval(startBotLoop);
                    startGameplay(3600);
                } else if (attempts > 20) {
                    clearInterval(startBotLoop);
                    isGameRunning = true;
                }
            }, 80);
        } else {
            // TELA 1: Jogador humano entra em STANDBY aguardando confirmação no Ready Check!
            let attempts = 0;
            const startP1Loop = setInterval(() => {
                attempts++;
                if (typeof prepareGameStandby === 'function') {
                    clearInterval(startP1Loop);
                    prepareGameStandby();
                } else if (attempts > 20) {
                    clearInterval(startP1Loop);
                }
            }, 80);
        }
        return;
    }

    // Se aberto de forma independente ou sem parâmetros de Arena, iniciar imediatamente modo solo
    isArenaGame = true;
    myUsername = "Combatente";
    gameMode = 'SOLO';
    hostMatchTime = 3600;
    
    const splashEl = document.getElementById('splash');
    if (splashEl) splashEl.style.display = 'none';
    const loginEl = document.getElementById('loginUI');
    if (loginEl) loginEl.style.display = 'none';
    const lobbyEl = document.getElementById('lobby');
    if (lobbyEl) lobbyEl.style.display = 'none';

    let attempts = 0;
    const startDirectLoop = setInterval(() => {
        attempts++;
        // Se estiver embutido no iframe do play.php, NUNCA auto-iniciar! Aguardar mensagem 'arena_start_match'
        if (window.parent && window.parent !== window) {
            if (typeof prepareGameStandby === 'function') {
                clearInterval(startDirectLoop);
                prepareGameStandby();
            } else if (attempts > 20) {
                clearInterval(startDirectLoop);
            }
            return;
        }
        // Se aberto diretamente fora do sistema (standalone avulso)
        if (typeof window.startOfficialMatch === 'function') {
            clearInterval(startDirectLoop);
            window.startOfficialMatch(3600);
        } else if (attempts > 20) {
            clearInterval(startDirectLoop);
            isGameRunning = true;
        }
    }, 80);
}


const safeBind = (id, event, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
};

safeBind('btnLogin', 'click', () => {
    const user = usernameInput ? usernameInput.value.trim() : 'Gamer';
    const pass = passwordInput ? passwordInput.value : '123';
    const lowerUser = user.toLowerCase();
    if (user === "") { alert("Please enter a username."); return; }
    myUsername = user;
    localStorage.setItem('vfactor_username', user);
    sessionStorage.setItem('vfactor_username', user);
    enterHub();
});

function enterHub() {
    const loginUI = document.getElementById('loginUI');
    const lobby = document.getElementById('lobby');
    if (loginUI) loginUI.style.display = 'none'; 
    if (lobby) lobby.style.display = 'flex'; 
    const disp = document.getElementById('hubUsernameDisplay');
    if (disp) disp.innerText = myUsername;
}

safeBind('btnPrimarySolo', 'click', (e) => {
    gameMode = 'SOLO'; e.target.classList.add('active');
    const pMulti = document.getElementById('btnPrimaryMulti');
    if (pMulti) pMulti.classList.remove('active');
});

safeBind('btnPrimaryMulti', 'click', (e) => {
    gameMode = 'DUEL'; e.target.classList.add('active');
    const pSolo = document.getElementById('btnPrimarySolo');
    if (pSolo) pSolo.classList.remove('active');
});

safeBind('launchSoloBtn', 'click', () => {
    isHost = true; hostMatchTime = 3600; 
    if (typeof startGameplay === "function") startGameplay(hostMatchTime);
});
