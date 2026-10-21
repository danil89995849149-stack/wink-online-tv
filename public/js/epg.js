/**
 * ЭФИР ТВ — КОНТРОЛЛЕР ТЕЛЕПРОГРАММЫ (EPG) И АРХИВА
 * Высококонтрастный рендеринг телегида, навигация по дням,
 * подсветка текущего эфира и запуск записей из архива.
 */

(function (window) {
  'use strict';

  class EpgController {
    constructor() {
      this.currentChannel = null;
      this.selectedDateStr = null; // YYYY-MM-DD
      this.programs = [];
      this.datesList = [];

      this.container = null;
      this.datesNav = null;
      this.programsList = null;
      this.channelTitleEl = null;

      this.refreshInterval = null;
    }

    init() {
      this.container = document.getElementById('sideEpgPanel');
      this.datesNav = document.getElementById('epgDatesNav');
      this.programsList = document.getElementById('epgProgramsList');
      this.channelTitleEl = document.getElementById('epgChannelTitle');

      this.generateDatesList();
      this.renderDatesNav();

      // Обновление прогресс-баров эфира раз в минуту
      this.refreshInterval = setInterval(() => this.updateLiveProgress(), 60000);
    }

    generateDatesList() {
      this.datesList = [];
      const today = new Date();

      // Глубина архива 3 дня назад + сегодня + 2 дня вперед
      for (let i = -3; i <= 2; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);

        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const iso = `${y}-${m}-${day}`;

        const dayMonth = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        const weekday = d.toLocaleDateString('ru-RU', { weekday: 'short' });

        let label = '';
        if (i === 0) label = `Сегодня, ${dayMonth}`;
        else if (i === -1) label = `Вчера, ${dayMonth}`;
        else if (i === -2) label = `Позавчера, ${dayMonth}`;
        else if (i === 1) label = `Завтра, ${dayMonth}`;
        else {
          label = `${weekday}, ${dayMonth}`;
        }

        this.datesList.push({
          dateStr: iso,
          label: label,
          isToday: i === 0
        });
      }

      this.selectedDateStr = this.datesList.find(d => d.isToday).dateStr;
    }

    renderDatesNav() {
      if (!this.datesNav) return;
      this.datesNav.innerHTML = '';

      for (const item of this.datesList) {
        const btn = document.createElement('button');
        btn.className = `epg-date-btn ${item.dateStr === this.selectedDateStr ? 'active' : ''}`;
        btn.textContent = item.label;
        btn.addEventListener('click', () => {
          this.selectedDateStr = item.dateStr;
          this.renderDatesNav();
          this.loadEpg();
        });
        this.datesNav.appendChild(btn);
      }
    }

    setChannel(channel) {
      this.currentChannel = channel;
      if (this.channelTitleEl && channel) {
        this.channelTitleEl.textContent = `Телепрограмма: ${channel.baseName}`;
      }
      this.loadEpg();
    }

    async loadEpg() {
      if (!this.currentChannel || !this.programsList) return;

      this.programsList.innerHTML = `
        <div class="epg-empty-state">
          <div class="loading-spinner" style="display: block; width: 40px; height: 40px;"></div>
          <span style="color: #cbd5e1; font-weight: 600;">Загрузка программы передач...</span>
        </div>
      `;

      try {
        const tvgId = encodeURIComponent(this.currentChannel.tvgId || '');
        const name = encodeURIComponent(this.currentChannel.baseName || '');
        const date = encodeURIComponent(this.selectedDateStr || '');
        const tzOffsetHours = (window.WinkTimezone ? window.WinkTimezone.currentMskShift + 3 : 3);

        const res = await fetch(`/api/epg?tvgId=${tvgId}&name=${name}&date=${date}&tzOffset=${tzOffsetHours}`);
        if (!res.ok) throw new Error('Ошибка загрузки EPG');

        const data = await res.json();
        this.programs = data.programs || [];
        this.renderPrograms();
      } catch (err) {
        console.warn('Error loading EPG:', err);
        this.programsList.innerHTML = `
          <div class="epg-empty-state">
            <div class="epg-empty-icon">📺</div>
            <span>Программа передач временно недоступна для этого канала</span>
          </div>
        `;
      }
    }

    renderPrograms() {
      if (!this.programsList) return;
      if (this.programs.length === 0) {
        this.programsList.innerHTML = `
          <div class="epg-empty-state">
            <div class="epg-empty-icon">📅</div>
            <span>На этот день нет данных телепрограммы</span>
          </div>
        `;
        return;
      }

      this.programsList.innerHTML = '';
      const nowSec = Math.floor(Date.now() / 1000);

      let liveElement = null;

      for (const prog of this.programs) {
        const item = document.createElement('div');
        const isLive = prog.start <= nowSec && prog.stop > nowSec;
        const isArchive = prog.stop <= nowSec;

        let className = 'epg-item';
        if (isLive) className += ' is-live';
        if (isArchive) className += ' is-archive';

        const startTime = window.WinkTimezone.formatTime(prog.start);
        const stopTime = window.WinkTimezone.formatTime(prog.stop);

        let statusBadgeHtml = '';
        if (isLive) {
          statusBadgeHtml = `<span class="epg-status-tag live-tag">● В эфире</span>`;
        } else if (isArchive) {
          statusBadgeHtml = `<span class="epg-status-tag archive-tag">⏪ Запись</span>`;
        } else {
          statusBadgeHtml = `<span class="epg-status-tag future-tag">⏳ Скоро</span>`;
        }

        let liveBarHtml = '';
        if (isLive) {
          const duration = Math.max(1, prog.stop - prog.start);
          const pct = Math.min(100, Math.max(0, Math.round(((nowSec - prog.start) / duration) * 100)));
          liveBarHtml = `
            <div class="epg-live-bar">
              <div class="epg-live-bar-fill" style="width: ${pct}%"></div>
            </div>
          `;
        }

        item.className = className;
        item.innerHTML = `
          <div class="epg-item-top">
            <span class="epg-time-range">${startTime} — ${stopTime}</span>
            ${statusBadgeHtml}
          </div>
          <div class="epg-item-title">${prog.title || 'Телепередача'}</div>
          ${prog.desc ? `<div class="epg-item-desc">${prog.desc}</div>` : ''}
          ${liveBarHtml}
        `;

        if (isArchive) {
          item.addEventListener('click', () => {
            // Запуск передачи из архива
            if (window.WinkPlayer) {
              window.WinkPlayer.playCatchup(this.currentChannel, prog);
            }
            if (window.WinkApp) {
              window.WinkApp.showToast(`⏪ Запуск записи: ${prog.title}`);
            }
          });
        } else if (isLive) {
          item.addEventListener('click', () => {
            // Запуск прямого эфира
            if (window.WinkPlayer) {
              window.WinkPlayer.playLive(this.currentChannel);
            }
          });
          liveElement = item;
        }

        this.programsList.appendChild(item);
      }

      // Автопрокрутка к текущей передаче в эфире (мягко в верхнюю треть списка)
      if (liveElement && this.programsList) {
        setTimeout(() => {
          const topOffset = liveElement.offsetTop - this.programsList.offsetTop - 12;
          this.programsList.scrollTo({
            top: Math.max(0, topOffset),
            behavior: 'smooth'
          });
        }, 150);
      }
    }

    updateLiveProgress() {
      if (!this.programsList || this.programs.length === 0) return;
      this.renderPrograms();
    }
  }

  window.WinkEpg = new EpgController();
})(window);
