/**
 * WINK TV REPLAY — MAIN APPLICATION CORE
 * Orchestrates player, channels catalog, timezone selection,
 * real-time clock, toast notifications, and initial boot.
 */

(function (window) {
  'use strict';

  class WinkApp {
    constructor() {
      this.toastContainer = null;
    }

    init() {
      console.log('[WinkApp] Initializing Wink TV Replay Application...');

      // 1. Создаем контейнер тостов
      this.initToastContainer();

      // 2. Инициализируем подсистемы
      if (window.WinkTimezone) {
        this.initTimezoneUI();
      }
      if (window.WinkPlayer) {
        window.WinkPlayer.init();
      }
      if (window.WinkEpg) {
        window.WinkEpg.init();
      }
      if (window.WinkPlaylist) {
        window.WinkPlaylist.init();
        window.WinkPlaylist.loadChannels().then(() => {
          this.autoPlayInitialChannel();
        });
      }

      // 3. Запуск часов реального времени
      this.startClock();

      // 4. Кнопка принудительного обновления плейлиста
      const refreshBtn = document.getElementById('refreshPlaylistBtn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.triggerPlaylistRefresh());
      }
    }

    initToastContainer() {
      this.toastContainer = document.getElementById('toastContainer');
      if (!this.toastContainer) {
        this.toastContainer = document.createElement('div');
        this.toastContainer.id = 'toastContainer';
        this.toastContainer.className = 'toast-container';
        document.body.appendChild(this.toastContainer);
      }
    }

    showToast(message, duration = 3000) {
      if (!this.toastContainer) return;
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `<span>${message}</span>`;
      this.toastContainer.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    initTimezoneUI() {
      const tzBtn = document.getElementById('tzSelectorBtn');
      const tzDropdown = document.getElementById('tzDropdown');
      const tzLabel = document.getElementById('tzCurrentLabel');

      if (!tzBtn || !tzDropdown || !tzLabel) return;

      const updateLabel = () => {
        tzLabel.textContent = window.WinkTimezone.getLabel();
      };
      updateLabel();

      // Заполняем выпадающий список
      tzDropdown.innerHTML = `<div class="tz-dropdown-title">Выберите часовой пояс:</div>`;

      // Пункт "Авто"
      const autoOpt = document.createElement('div');
      autoOpt.className = `tz-option ${!window.WinkTimezone.isManual ? 'selected' : ''}`;
      autoOpt.innerHTML = `<span>📍 Автоматически (по браузеру)</span> ${!window.WinkTimezone.isManual ? '✓' : ''}`;
      autoOpt.addEventListener('click', (e) => {
        e.stopPropagation();
        window.WinkTimezone.setTimezoneShift('auto');
        updateLabel();
        tzDropdown.classList.remove('active');
        this.onTimezoneChanged();
      });
      tzDropdown.appendChild(autoOpt);

      // Пресеты
      const presets = window.WinkTimezone.getPresets();
      for (const p of presets) {
        const opt = document.createElement('div');
        const isSelected = window.WinkTimezone.isManual && window.WinkTimezone.currentMskShift === p.mskShift;
        opt.className = `tz-option ${isSelected ? 'selected' : ''}`;
        opt.innerHTML = `<span>${p.label}</span> ${isSelected ? '✓' : ''}`;
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          window.WinkTimezone.setTimezoneShift(p.mskShift);
          updateLabel();
          tzDropdown.classList.remove('active');
          this.onTimezoneChanged();
        });
        tzDropdown.appendChild(opt);
      }

      tzBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        tzDropdown.classList.toggle('active');
      });

      document.addEventListener('click', () => {
        tzDropdown.classList.remove('active');
      });
    }

    onTimezoneChanged() {
      this.showToast(`Часовой пояс изменен: ${window.WinkTimezone.getLabel()}`);

      // 1. Перерисовываем каталог каналов с новыми бейджами
      if (window.WinkPlaylist) {
        window.WinkPlaylist.renderGrid();
      }

      // 2. Если сейчас играет канал — переключаем на оптимальный фид для нового пояса
      if (window.WinkPlayer && window.WinkPlayer.currentChannel) {
        const bestFeed = window.WinkTimezone.getBestFeed(window.WinkPlayer.currentChannel);
        if (window.WinkPlayer.mode === 'live') {
          window.WinkPlayer.playLive(window.WinkPlayer.currentChannel, bestFeed);
        }
      }

      // 3. Обновляем EPG
      if (window.WinkEpg) {
        window.WinkEpg.loadEpg();
      }
    }

    onChannelChanged(channel, feed) {
      // Обновляем программу передач справа от плеера
      if (window.WinkEpg) {
        window.WinkEpg.setChannel(channel);
      }
      // Подсвечиваем карточку в каталоге
      if (window.WinkPlaylist) {
        window.WinkPlaylist.highlightActiveCard(channel.id);
      }
      // Обновляем ЧПУ URL в адресной строке браузера для SEO
      if (channel && channel.slug && window.history && window.history.pushState) {
        const targetUrl = '/channel/' + encodeURIComponent(channel.slug);
        if (window.location.pathname !== targetUrl) {
          window.history.pushState({ channelId: channel.id, slug: channel.slug }, '', targetUrl);
        }
        document.title = `${channel.name} смотреть онлайн прямой эфир бесплатно в хорошем качестве HD — Эфир ТВ`;
      }
      // Сохраняем последний канал
      try {
        localStorage.setItem('wink_last_channel_id', channel.id);
      } catch (e) {}
    }

    autoPlayInitialChannel() {
      if (!window.WinkPlaylist || window.WinkPlaylist.channels.length === 0) return;

      let targetCh = null;

      // 1. Проверяем, зашел ли пользователь по прямой ссылке канала (/channel/:slug)
      if (window.INITIAL_CHANNEL_ID || window.INITIAL_CHANNEL_SLUG) {
        targetCh = window.WinkPlaylist.channels.find(c =>
          (window.INITIAL_CHANNEL_ID && c.id === window.INITIAL_CHANNEL_ID) ||
          (window.INITIAL_CHANNEL_SLUG && c.slug === window.INITIAL_CHANNEL_SLUG)
        );
      }

      if (!targetCh && window.location.pathname.startsWith('/channel/')) {
        const pathSlug = decodeURIComponent(window.location.pathname.replace('/channel/', '').replace(/\/$/, ''));
        targetCh = window.WinkPlaylist.channels.find(c => c.slug === pathSlug || c.id === pathSlug);
      }

      // 2. Пробуем восстановить последний канал из localStorage
      if (!targetCh) {
        try {
          const lastId = localStorage.getItem('wink_last_channel_id');
          if (lastId) {
            targetCh = window.WinkPlaylist.channels.find(c => c.id === lastId);
          }
        } catch (e) {}
      }

      // 3. Если не найден — берем Первый канал или самый первый по списку
      if (!targetCh) {
        targetCh = window.WinkPlaylist.channels.find(c => /первый канал/i.test(c.baseName)) || window.WinkPlaylist.channels[0];
      }

      if (targetCh && window.WinkPlayer) {
        window.WinkPlayer.playLive(targetCh);
      }

      // 4. Обработчик навигации назад/вперед в браузере (popstate)
      window.addEventListener('popstate', (e) => {
        if (e.state && e.state.channelId) {
          const ch = window.WinkPlaylist.channels.find(c => c.id === e.state.channelId);
          if (ch && window.WinkPlayer) {
            window.WinkPlayer.playLive(ch);
          }
        }
      });
    }

    startClock() {
      const clockEl = document.getElementById('liveClock');
      if (!clockEl) return;

      const tick = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
      };
      tick();
      setInterval(tick, 1000);
    }

    async triggerPlaylistRefresh() {
      this.showToast('🔄 Обновление базы каналов...');
      try {
        const res = await fetch('/api/playlist/refresh', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          this.showToast(`✓ База обновлена: ${data.totalChannels} каналов`);
          if (window.WinkPlaylist) {
            window.WinkPlaylist.loadChannels();
          }
        } else {
          this.showToast(`Ошибка: ${data.error || 'сбой обновления'}`);
        }
      } catch (e) {
        this.showToast('Ошибка сетевого запроса обновления');
      }
    }
  }

  window.WinkApp = new WinkApp();

  document.addEventListener('DOMContentLoaded', () => {
    window.WinkApp.init();
  });
})(window);
