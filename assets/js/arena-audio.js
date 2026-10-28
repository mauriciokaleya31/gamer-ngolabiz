/**
 * NGOLABIZ ARENA - SISTEMA DE ÁUDIO CENTRALIZADO
 * Sintetizador Web Audio API de Alta Fidelidade (Zero dependências externas quebradas)
 * Suporte a BGM (Música Ambiente Procedural), SFX, Sliders de Volume e Mute Global.
 * Sincronização em tempo real com todos os jogos filhos (iframes).
 */

class ArenaAudioEngine {
  constructor() {
    this.ctx = null;
    this.isUnlocked = false;
    this.bgmPlaying = false;
    this.bgmTimer = null;

    // Carregar preferências persistidas
    this.muted = localStorage.getItem('arena_audio_muted') === 'true';
    this.bgmVolume = parseFloat(localStorage.getItem('arena_bgm_vol') || '0.35');
    this.sfxVolume = parseFloat(localStorage.getItem('arena_sfx_vol') || '0.80');

    this.initEventListeners();
    
    // Atualiza a UI imediatamente e quando o DOM carregar
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.updateUI());
    } else {
      setTimeout(() => this.updateUI(), 50);
    }
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended' && !this.muted) {
      this.ctx.resume();
    }
    this.isUnlocked = true;
  }

  initEventListeners() {
    const unlock = () => {
      this.initContext();
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  setMuted(muted) {
    this.muted = !!muted;
    localStorage.setItem('arena_audio_muted', this.muted);

    if (this.ctx) {
      if (this.muted && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      } else if (!this.muted && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    if (this.muted && this.bgmPlaying) {
      this.stopBGM();
    } else if (!this.muted && !this.bgmPlaying && localStorage.getItem('arena_bgm_active') === 'true') {
      this.startBGM();
    }

    // Silenciar ou reativar todos os elementos nativos de áudio/vídeo da página
    document.querySelectorAll('audio, video').forEach(el => {
      try {
        el.muted = this.muted;
        if (this.muted) el.pause();
      } catch(e) {}
    });

    // Propagar o comando de mute para TODOS os iframes da página (jogos filhos)
    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage({
            type: 'arena_mute',
            muted: this.muted
          }, '*');
        }
      } catch(e) {}
    });

    this.updateUI();
    this.syncProfile();
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setBGMVolume(vol) {
    this.bgmVolume = Math.max(0, Math.min(1, parseFloat(vol)));
    localStorage.setItem('arena_bgm_vol', this.bgmVolume);
    this.updateUI();
    this.syncProfile();
  }

  setSFXVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, parseFloat(vol)));
    localStorage.setItem('arena_sfx_vol', this.sfxVolume);
    this.updateUI();
    this.syncProfile();
  }

  updateUI() {
    // 1. Atualizar todos os botões de controle de mute do header, footer e play
    const muteBtns = document.querySelectorAll('.audio-ctrl-btn, #btn-global-mute, #arena-sound-toggle-btn, #arena-play-mute-btn');
    muteBtns.forEach(btn => {
      if (this.muted) {
        btn.classList.add('muted');
        btn.style.opacity = '0.7';
        btn.style.borderColor = '#ef4444';
        btn.setAttribute('title', 'Som Desligado (Clique para Ligar)');
      } else {
        btn.classList.remove('muted');
        btn.style.opacity = '1';
        btn.style.borderColor = '';
        btn.setAttribute('title', 'Som Ligado (Clique para Desligar)');
      }
    });

    // 2. Atualizar ícones específicos
    const iconHeader = document.getElementById('arena-sound-icon');
    if (iconHeader) {
      iconHeader.className = this.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
      iconHeader.style.color = this.muted ? '#ef4444' : 'var(--neon-cyan)';
    }

    const iconPlay = document.getElementById('arena-play-mute-icon');
    const txtPlay = document.getElementById('arena-play-mute-txt');
    if (iconPlay) {
      iconPlay.className = this.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
      iconPlay.style.color = this.muted ? '#ef4444' : '#fff';
    }
    if (txtPlay) {
      txtPlay.textContent = this.muted ? 'Mudo' : 'Som';
      txtPlay.style.color = this.muted ? '#ef4444' : '#fff';
    }

    const bgmSlider = document.getElementById('audio-bgm-slider');
    if (bgmSlider) bgmSlider.value = Math.round(this.bgmVolume * 100);

    const sfxSlider = document.getElementById('audio-sfx-slider');
    if (sfxSlider) sfxSlider.value = Math.round(this.sfxVolume * 100);
  }

  syncProfile() {
    if (window.__ARENA_LOGGED_USER) {
      fetch((window.__ARENA_BASE_URL || '') + '/api.php?action=save_audio_settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bgm_vol: Math.round(this.bgmVolume * 100),
          sfx_vol: Math.round(this.sfxVolume * 100),
          muted: this.muted ? 1 : 0
        })
      }).catch(() => {});
    }
  }

  // Helper para sintetizar tons com osciladores e envelopes suaves
  playTone(freq, duration, type = 'sine', gainMultiplier = 1, delay = 0) {
    if (this.muted || this.sfxVolume <= 0) return;
    this.initContext();
    if (!this.ctx) return;

    setTimeout(() => {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        const peak = Math.max(0.001, this.sfxVolume * gainMultiplier * 0.15);
        gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(peak, this.ctx.currentTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime);
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {}
    }, delay * 1000);
  }

  // ================= EFEITOS SONOROS (SFX) =================
  playClick() {
    this.playTone(880, 0.04, 'triangle', 0.5);
  }

  playEnter() {
    this.playTone(523.25, 0.08, 'sine', 0.7);
    this.playTone(659.25, 0.12, 'sine', 0.8, 0.06);
  }

  playMatchFound() {
    this.playTone(440, 0.08, 'sine', 0.9, 0.00);
    this.playTone(554.37, 0.08, 'sine', 0.9, 0.08);
    this.playTone(659.25, 0.12, 'triangle', 1.0, 0.16);
    this.playTone(880, 0.25, 'sine', 1.2, 0.24);
  }

  playRadarBeep() {
    this.playTone(1760, 0.04, 'sine', 0.35);
  }

  playBetSelect() {
    this.playTone(784, 0.06, 'triangle', 0.8);
    this.playTone(1046.5, 0.09, 'sine', 0.9, 0.04);
  }

  playWin() {
    this.playTone(523.25, 0.12, 'triangle', 1.0, 0.00);
    this.playTone(659.25, 0.12, 'triangle', 1.0, 0.10);
    this.playTone(783.99, 0.14, 'triangle', 1.1, 0.20);
    this.playTone(1046.50, 0.35, 'sine', 1.3, 0.30);
  }

  playLoss() {
    this.playTone(330, 0.14, 'sawtooth', 0.7, 0.00);
    this.playTone(293.66, 0.16, 'sawtooth', 0.7, 0.12);
    this.playTone(261.63, 0.28, 'sawtooth', 0.8, 0.26);
  }

  // Música ambiente procedural (Synthwave cyber suave)
  startBGM() {
    if (this.muted || this.bgmVolume <= 0 || this.bgmPlaying) return;
    this.initContext();
    if (!this.ctx) return;

    this.bgmPlaying = true;
    localStorage.setItem('arena_bgm_active', 'true');

    const chords = [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [196, 246.94, 293.66],
      [164.81, 196, 246.94]
    ];
    let step = 0;

    const playBar = () => {
      if (!this.bgmPlaying || this.muted) return;
      const notes = chords[step % chords.length];
      step++;

      notes.forEach((f, i) => {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, this.ctx.currentTime);

          const peak = Math.max(0.001, this.bgmVolume * 0.035);
          gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
          gain.gain.linearRampToValueAtTime(peak, this.ctx.currentTime + 0.3);
          gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.8);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(this.ctx.currentTime + (i * 0.08));
          osc.stop(this.ctx.currentTime + 2.0);
        } catch (e) {}
      });

      this.bgmTimer = setTimeout(playBar, 1900);
    };

    playBar();
    this.updateUI();
  }

  stopBGM() {
    this.bgmPlaying = false;
    localStorage.setItem('arena_bgm_active', 'false');
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.updateUI();
  }

  toggleBGM() {
    if (this.bgmPlaying) {
      this.stopBGM();
    } else {
      this.startBGM();
    }
    return this.bgmPlaying;
  }
}

// Instanciar motor globalmente
window.arenaAudio = new ArenaAudioEngine();
