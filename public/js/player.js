/**
 * WINK TV REPLAY — STUDIO VIDEO PLAYER CONTROLLER
 * High-performance HLS.js streaming, Catch-up / Timeshift playback,
 * Commercials skip, timeline scrubbing, and keyboard controls.
 */

(function (window) {
  'use strict';

  class WinkPlayer {
    constructor() {
      this.video = null;
      this.hls = null;
      this.currentChannel = null;
      this.currentFeed = null;
      this.currentProgram = null;

      // Режим воспроизведения: 'live' или 'catchup'
      this.mode = 'live';
      this.catchupStartSec = 0;
      this.catchupStopSec = 0;
      this.catchupDuration = 0;

      this.isPlaying = false;
      this.isScrubbing = false;
      this.idleTimer = null;
      this.posSaveInterval = null;

      this.ui = {};
    }

    init() {
      this.video = document.getElementById('tvPlayer');
      if (!this.video) return;

      this.initDOMElements();
      this.bindEvents();
      this.initHls();
      this.startIdleDetector();
      this.restoreVolume();

      // Автосохранение позиции воспроизведения в архиве каждые 5 сек
      this.posSaveInterval = setInterval(() => this.saveArchivePosition(), 5000);
    }

    initDOMElements() {
      this.ui.wrapper = document.getElementById('videoWrapper');
      this.ui.channelName = document.getElementById('playerChannelName');
      this.ui.programTitle = document.getElementById('playerProgramTitle');
      this.ui.channelLogo = document.getElementById('playerChannelLogo');
      this.ui.statusBadge = document.getElementById('playerStatusBadge');
      this.ui.statusText = document.getElementById('playerStatusText');
      this.ui.feedSelectorBtn = document.getElementById('playerFeedBtn');
      this.ui.feedDropdown = document.getElementById('playerFeedDropdown');

      this.ui.playBtn = document.getElementById('ctrlPlayBtn');
      this.ui.playIcon = document.getElementById('ctrlPlayIcon');
      this.ui.muteBtn = document.getElementById('ctrlMuteBtn');
      this.ui.volumeSlider = document.getElementById('ctrlVolumeSlider');
      this.ui.skipAdBtn = document.getElementById('ctrlSkipAdBtn');
      this.ui.jumpLiveBtn = document.getElementById('ctrlJumpLiveBtn');
      this.ui.speedSelect = document.getElementById('ctrlSpeedSelect');
      this.ui.fullscreenBtn = document.getElementById('ctrlFullscreenBtn');
      this.ui.pipBtn = document.getElementById('ctrlPipBtn');

      this.ui.timelineTrackWrap = document.getElementById('timelineTrackWrap');
      this.ui.timelineProgress = document.getElementById('timelineProgress');
      this.ui.timelineBuffer = document.getElementById('timelineBuffer');
      this.ui.timelineThumb = document.getElementById('timelineThumb');
      this.ui.timeCurrent = document.getElementById('timeCurrent');
      this.ui.timeTotal = document.getElementById('timeTotal');

      this.ui.loadingSpinner = document.getElementById('playerLoadingSpinner');
    }

    initHls() {
      if (window.Hls && window.Hls.isSupported()) {
        this.hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 30 * 1024 * 1024,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 6,
          manifestLoadingTimeOut: 15000,
          levelLoadingTimeOut: 15000,
          fragLoadingTimeOut: 20000,
        });

        this.hls.attachMedia(this.video);

        this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          this.hideSpinner();
          this.video.play().catch(() => {
            console.log('Autoplay blocked, waiting for user click');
          });
        });

        this.hls.on(window.Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.warn('[Hls Error Fatal]:', data.type, data.details);
            switch (data.type) {
              case window.Hls.ErrorTypes.NETWORK_ERROR:
                this.hls.startLoad();
                break;
              case window.Hls.ErrorTypes.MEDIA_ERROR:
                this.hls.recoverMediaError();
                break;
              default:
                this.showSpinner();
                setTimeout(() => this.reloadStream(), 2000);
                break;
            }
          }
        });

        this.hls.on(window.Hls.Events.BUFFER_APPENDED, () => {
          this.updateBufferBar();
        });
      } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        console.log('Using native Safari HLS');
      }
    }

    bindEvents() {
      // Клик по видео — пауза/пуск
      this.video.addEventListener('click', () => this.togglePlay());
      this.video.addEventListener('play', () => {
        this.isPlaying = true;
        this.updatePlayBtn();
        if (window.PromoApp) window.PromoApp.hidePauseAd();
      });
      this.video.addEventListener('pause', () => {
        this.isPlaying = false;
        this.updatePlayBtn();
        if (window.PromoApp) window.PromoApp.showPauseAd();
      });
      this.video.addEventListener('waiting', () => this.showSpinner());
      this.video.addEventListener('playing', () => {
        this.hideSpinner();
        if (window.PromoApp) window.PromoApp.hidePauseAd();
      });
      this.video.addEventListener('timeupdate', () => this.onTimeUpdate());

      // Управление контролами
      if (this.ui.playBtn) this.ui.playBtn.addEventListener('click', () => this.togglePlay());
      if (this.ui.muteBtn) this.ui.muteBtn.addEventListener('click', () => this.toggleMute());
      if (this.ui.volumeSlider) {
        this.ui.volumeSlider.addEventListener('input', (e) => this.setVolume(parseFloat(e.target.value)));
      }

      // Перемотка назад/вперед
      const btnRev10 = document.getElementById('ctrlRev10');
      const btnFwd10 = document.getElementById('ctrlFwd10');
      const btnRev30 = document.getElementById('ctrlRev30');
      const btnFwd30 = document.getElementById('ctrlFwd30');

      if (btnRev10) btnRev10.addEventListener('click', () => this.seekRelative(-10));
      if (btnFwd10) btnFwd10.addEventListener('click', () => this.seekRelative(10));
      if (btnRev30) btnRev30.addEventListener('click', () => this.seekRelative(-30));
      if (btnFwd30) btnFwd30.addEventListener('click', () => this.seekRelative(30));

      // Кнопка пропуска рекламы (+90 секунд)
      if (this.ui.skipAdBtn) {
        this.ui.skipAdBtn.addEventListener('click', () => {
          this.seekRelative(90);
          if (window.WinkApp) window.WinkApp.showToast('⏩ Реклама пропущена (+90с)');
        });
      }

      // Кнопка «К прямому эфиру»
      if (this.ui.jumpLiveBtn) {
        this.ui.jumpLiveBtn.addEventListener('click', () => this.playLive(this.currentChannel, this.currentFeed));
      }

      // Скорость воспроизведения
      if (this.ui.speedSelect) {
        this.ui.speedSelect.addEventListener('change', (e) => {
          this.video.playbackRate = parseFloat(e.target.value);
        });
      }

      // Fullscreen & PiP
      if (this.ui.fullscreenBtn) this.ui.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
      if (this.ui.pipBtn) this.ui.pipBtn.addEventListener('click', () => this.togglePiP());

      // Скраббер таймлайна
      if (this.ui.timelineTrackWrap) {
        this.ui.timelineTrackWrap.addEventListener('click', (e) => this.onTimelineClick(e));
      }

      // Селектор фидов канала в плеере
      if (this.ui.feedSelectorBtn) {
        this.ui.feedSelectorBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.ui.feedDropdown.classList.toggle('active');
        });
      }
      document.addEventListener('click', () => {
        if (this.ui.feedDropdown) this.ui.feedDropdown.classList.remove('active');
      });

      // Глобальные горячие клавиши
      document.addEventListener('keydown', (e) => this.handleHotkeys(e));
    }

    startIdleDetector() {
      const showControls = () => {
        if (this.ui.wrapper) this.ui.wrapper.classList.remove('idle');
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
          if (this.isPlaying && this.ui.wrapper) {
            this.ui.wrapper.classList.add('idle');
          }
        }, 3500);
      };

      if (this.ui.wrapper) {
        this.ui.wrapper.addEventListener('mousemove', showControls);
        this.ui.wrapper.addEventListener('click', showControls);
      }
    }

    showSpinner() {
      if (this.ui.loadingSpinner) this.ui.loadingSpinner.style.display = 'block';
    }

    hideSpinner() {
      if (this.ui.loadingSpinner) this.ui.loadingSpinner.style.display = 'none';
    }

    togglePlay() {
      if (!this.video) return;
      if (this.video.paused) {
        this.video.play().catch(e => console.warn(e));
      } else {
        this.video.pause();
      }
    }

    updatePlayBtn() {
      if (!this.ui.playIcon) return;
      if (this.isPlaying) {
        this.ui.playIcon.innerHTML = '❚❚';
      } else {
        this.ui.playIcon.innerHTML = '▶';
      }
    }

    toggleMute() {
      if (!this.video) return;
      this.video.muted = !this.video.muted;
      this.updateVolumeUI();
    }

    setVolume(val) {
      if (!this.video) return;
      this.video.volume = Math.max(0, Math.min(1, val));
      this.video.muted = this.video.volume === 0;
      this.updateVolumeUI();
      try {
        localStorage.setItem('wink_player_volume', String(this.video.volume));
      } catch (e) {}
    }

    restoreVolume() {
      try {
        const saved = localStorage.getItem('wink_player_volume');
        if (saved !== null) {
          const val = parseFloat(saved);
          if (!isNaN(val) && this.video) {
            this.video.volume = val;
            this.updateVolumeUI();
          }
        }
      } catch (e) {}
    }

    updateVolumeUI() {
      if (!this.ui.volumeSlider || !this.video) return;
      this.ui.volumeSlider.value = this.video.muted ? 0 : this.video.volume;
      if (this.ui.muteBtn) {
        this.ui.muteBtn.innerHTML = this.video.muted || this.video.volume === 0 ? '🔇' : (this.video.volume > 0.5 ? '🔊' : '🔉');
      }
    }

    toggleFullscreen() {
      const wrap = this.ui.wrapper || document.documentElement;
      if (!document.fullscreenElement) {
        wrap.requestFullscreen().catch(e => console.warn(e));
      } else {
        document.exitFullscreen().catch(e => console.warn(e));
      }
    }

    togglePiP() {
      if (!this.video) return;
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(e => console.warn(e));
      } else if (this.video.requestPictureInPicture) {
        this.video.requestPictureInPicture().catch(e => console.warn(e));
      }
    }

    /**
     * Построение ссылки на прокси поток Wink
     */
    buildStreamUrl(rawUrl, userAgent = null) {
      const ua = userAgent || (this.currentFeed ? this.currentFeed.userAgent : null);
      let p = '/p?url=' + encodeURIComponent(rawUrl);
      if (ua) p += '&ua=' + encodeURIComponent(ua);
      return p;
    }

    /**
     * Формирование ссылки на архивную запись Wink (Catch-up)
     */
    buildCatchupUrl(channel, feed, startSec, stopSec) {
      const targetUrl = feed ? feed.url : channel.url;
      const nowSec = Math.floor(Date.now() / 1000);
      const endSec = (stopSec && stopSec > startSec) ? Math.min(stopSec, nowSec) : nowSec;
      const duration = Math.max(0, endSec - startSec);
      const backSeconds = Math.max(0, nowSec - startSec);
      const sep = targetUrl.includes('?') ? '&' : '?';

      const catchupSource = (feed && feed.catchupSource) ? feed.catchupSource : channel.catchupSource;

      if (catchupSource) {
        const values = {
          offset: backSeconds,
          duration: duration || backSeconds,
          timestamp: startSec,
          utcstart: startSec,
          start: startSec,
          utc: startSec,
          utcend: endSec,
          end: endSec,
          lutc: endSec
        };
        const pick = (k) => (values[k] !== undefined ? String(values[k]) : '');
        let tail = catchupSource
          .replace(/\$\{(offset|duration|timestamp|utcstart|start|utc|utcend|end|lutc)\}/gi, (m, k) => pick(k.toLowerCase()))
          .replace(/\{(offset|duration|timestamp|utcstart|start|utc|utcend|end|lutc)\}/gi, (m, k) => pick(k.toLowerCase()));
        tail = tail.trim();
        if (tail.charAt(0) === '?') tail = (sep === '?' ? '?' : '&') + tail.slice(1);
        else if (tail.charAt(0) !== '&') tail = sep + tail;
        return targetUrl + tail;
      }

      return `${targetUrl}${sep}offset=-${backSeconds}&utcstart=${startSec}`;
    }

    /**
     * Воспроизведение прямого эфира
     */
    playLive(channel, specificFeed = null) {
      if (!channel) return;
      this.currentChannel = channel;

      // Выбираем оптимальный фид по часовому поясу
      this.currentFeed = specificFeed || window.WinkTimezone.getBestFeed(channel);
      this.mode = 'live';
      this.currentProgram = null;

      this.updateHeaderUI();
      this.renderFeedDropdown();

      const proxiedUrl = this.buildStreamUrl(this.currentFeed.url, this.currentFeed.userAgent);
      this.loadUrlIntoPlayer(proxiedUrl);

      if (window.WinkApp) {
        window.WinkApp.onChannelChanged(channel, this.currentFeed);
      }
    }

    /**
     * Воспроизведение прошедшей программы из архива (Catch-up / Replay TV)
     */
    playCatchup(channel, program, specificFeed = null) {
      if (!channel || !program) return;
      this.currentChannel = channel;
      this.currentFeed = specificFeed || window.WinkTimezone.getBestFeed(channel);
      this.currentProgram = program;
      this.mode = 'catchup';

      this.catchupStartSec = program.start;
      this.catchupStopSec = program.stop;
      this.catchupDuration = Math.max(1, program.stop - program.start);

      this.updateHeaderUI();
      this.renderFeedDropdown();

      const rawArchiveUrl = this.buildCatchupUrl(channel, this.currentFeed, program.start, program.stop);
      const proxiedUrl = this.buildStreamUrl(rawArchiveUrl, this.currentFeed.userAgent);

      // Проверяем сохраненную позицию просмотра в архиве
      const savedPos = this.getSavedArchivePosition(channel.id, program.start);

      this.loadUrlIntoPlayer(proxiedUrl, savedPos);

      if (savedPos > 30 && window.WinkApp) {
        window.WinkApp.showToast(`⏪ Возобновлено с ${this.formatDuration(savedPos)}`);
      }
    }

    loadUrlIntoPlayer(url, seekSeconds = 0) {
      this.showSpinner();
      if (this.hls) {
        this.hls.stopLoad();
        this.hls.loadSource(url);
        if (seekSeconds > 0) {
          const onMediaAttached = () => {
            this.video.currentTime = seekSeconds;
            this.video.removeEventListener('loadedmetadata', onMediaAttached);
          };
          this.video.addEventListener('loadedmetadata', onMediaAttached);
        }
      } else if (this.video) {
        this.video.src = url;
        if (seekSeconds > 0) {
          this.video.currentTime = seekSeconds;
        }
        this.video.play().catch(e => console.warn(e));
      }
    }

    reloadStream() {
      if (this.mode === 'catchup' && this.currentProgram) {
        this.playCatchup(this.currentChannel, this.currentProgram, this.currentFeed);
      } else if (this.currentChannel) {
        this.playLive(this.currentChannel, this.currentFeed);
      }
    }

    seekRelative(seconds) {
      if (!this.video) return;
      const target = Math.max(0, this.video.currentTime + seconds);
      this.video.currentTime = target;
      if (window.WinkApp) {
        const sign = seconds > 0 ? `+${seconds}с` : `${seconds}с`;
        window.WinkApp.showToast(`⏩ Перемотка ${sign}`);
      }
    }

    onTimelineClick(e) {
      if (!this.video || !this.ui.timelineTrackWrap) return;
      const rect = this.ui.timelineTrackWrap.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));

      if (this.mode === 'catchup') {
        const targetTime = ratio * this.video.duration;
        if (!isNaN(targetTime)) {
          this.video.currentTime = targetTime;
        }
      } else {
        // Live timeshift scrubbing
        if (this.video.duration && isFinite(this.video.duration)) {
          this.video.currentTime = ratio * this.video.duration;
        }
      }
    }

    onTimeUpdate() {
      if (!this.video || this.isScrubbing) return;
      const cur = this.video.currentTime;
      const dur = this.video.duration;

      if (this.mode === 'catchup') {
        const progressPercent = dur > 0 ? (cur / dur) * 100 : 0;
        if (this.ui.timelineProgress) this.ui.timelineProgress.style.width = `${progressPercent}%`;
        if (this.ui.timelineThumb) this.ui.timelineThumb.style.left = `${progressPercent}%`;
        if (this.ui.timeCurrent) this.ui.timeCurrent.textContent = this.formatDuration(cur);
        if (this.ui.timeTotal) this.ui.timeTotal.textContent = this.formatDuration(dur);
      } else {
        // Live: показываем локальное астрономическое время
        const now = Math.floor(Date.now() / 1000);
        if (this.ui.timeCurrent) this.ui.timeCurrent.textContent = window.WinkTimezone.formatTime(now);
        if (this.ui.timeTotal) this.ui.timeTotal.textContent = 'ПРЯМОЙ ЭФИР';
        if (this.ui.timelineProgress) this.ui.timelineProgress.style.width = '100%';
        if (this.ui.timelineThumb) this.ui.timelineThumb.style.left = '100%';
      }
    }

    updateBufferBar() {
      if (!this.video || !this.ui.timelineBuffer) return;
      const b = this.video.buffered;
      const dur = this.video.duration;
      if (b.length > 0 && dur > 0) {
        const end = b.end(b.length - 1);
        const percent = Math.min(100, (end / dur) * 100);
        this.ui.timelineBuffer.style.width = `${percent}%`;
      }
    }

    updateHeaderUI() {
      if (!this.currentChannel) return;

      if (this.ui.channelName) this.ui.channelName.textContent = this.currentChannel.baseName;
      if (this.ui.channelLogo) {
        this.ui.channelLogo.src = this.currentChannel.logo || (window.EXTERNAL_LOGOS && window.EXTERNAL_LOGOS[this.currentChannel.baseName.toLowerCase().replace(/[^a-zа-я0-9]/gi, '')]) || '';
        this.ui.channelLogo.alt = this.currentChannel.baseName;
      }

      if (this.mode === 'catchup' && this.currentProgram) {
        if (this.ui.programTitle) {
          const timeSpan = `${window.WinkTimezone.formatTime(this.currentProgram.start)} — ${window.WinkTimezone.formatTime(this.currentProgram.stop)}`;
          this.ui.programTitle.textContent = `${this.currentProgram.title} (${timeSpan})`;
        }
        if (this.ui.statusBadge) {
          this.ui.statusBadge.className = 'stream-status-badge catchup';
        }
        if (this.ui.statusText) {
          this.ui.statusText.textContent = '⏪ АРХИВ (ЗАПИСЬ)';
        }
        if (this.ui.jumpLiveBtn) this.ui.jumpLiveBtn.style.display = 'flex';
        if (this.ui.skipAdBtn) this.ui.skipAdBtn.style.display = 'flex';
      } else {
        if (this.ui.programTitle) this.ui.programTitle.textContent = 'Прямая трансляция эфира';
        if (this.ui.statusBadge) {
          this.ui.statusBadge.className = 'stream-status-badge live';
        }
        if (this.ui.statusText) {
          this.ui.statusText.textContent = '🔴 ПРЯМОЙ ЭФИР';
        }
        if (this.ui.jumpLiveBtn) this.ui.jumpLiveBtn.style.display = 'none';
        if (this.ui.skipAdBtn) this.ui.skipAdBtn.style.display = 'none';
      }

      // Индикатор сдвига фида
      if (this.ui.feedSelectorBtn && this.currentFeed) {
        this.ui.feedSelectorBtn.innerHTML = `<span>📍 ${this.currentFeed.shiftLabel || 'МСК'}</span> ▾`;
      }
    }

    renderFeedDropdown() {
      if (!this.ui.feedDropdown || !this.currentChannel || !this.currentChannel.feeds) return;
      this.ui.feedDropdown.innerHTML = '';

      const feeds = this.currentChannel.feeds;
      if (feeds.length <= 1) {
        const item = document.createElement('div');
        item.className = 'feed-option active';
        item.textContent = 'Основной фид (МСК+0)';
        this.ui.feedDropdown.appendChild(item);
        return;
      }

      for (const feed of feeds) {
        const opt = document.createElement('div');
        const isActive = this.currentFeed && this.currentFeed.tzShift === feed.tzShift;
        opt.className = `feed-option ${isActive ? 'active' : ''}`;
        opt.innerHTML = `<span>${feed.shiftLabel} (${feed.fullName})</span> ${isActive ? '✓' : ''}`;
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          this.ui.feedDropdown.classList.remove('active');
          if (this.mode === 'catchup' && this.currentProgram) {
            this.playCatchup(this.currentChannel, this.currentProgram, feed);
          } else {
            this.playLive(this.currentChannel, feed);
          }
          if (window.WinkApp) {
            window.WinkApp.showToast(`Смена фида: ${feed.shiftLabel}`);
          }
        });
        this.ui.feedDropdown.appendChild(opt);
      }
    }

    saveArchivePosition() {
      if (this.mode !== 'catchup' || !this.currentChannel || !this.catchupStartSec || !this.video) return;
      if (this.video.currentTime > 10) {
        const key = `wink_pos_${this.currentChannel.id}_${this.catchupStartSec}`;
        try {
          localStorage.setItem(key, String(Math.floor(this.video.currentTime)));
        } catch (e) {}
      }
    }

    getSavedArchivePosition(channelId, startSec) {
      try {
        const key = `wink_pos_${channelId}_${startSec}`;
        const val = localStorage.getItem(key);
        return val ? parseInt(val, 10) : 0;
      } catch (e) {
        return 0;
      }
    }

    formatDuration(seconds) {
      if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
      const s = Math.floor(seconds);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const mm = m < 10 ? '0' + m : m;
      const ss = sec < 10 ? '0' + sec : sec;
      return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    }

    handleHotkeys(e) {
      // Игнорируем ввод в поле поиска
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.seekRelative(e.shiftKey ? -30 : -10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.seekRelative(e.shiftKey ? 30 : 10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.setVolume(this.video.volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.setVolume(this.video.volume - 0.05);
          break;
        case 'KeyM':
          e.preventDefault();
          this.toggleMute();
          break;
        case 'KeyF':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'KeyP':
          e.preventDefault();
          this.togglePiP();
          break;
      }
    }
  }

  window.WinkPlayer = new WinkPlayer();
})(window);
