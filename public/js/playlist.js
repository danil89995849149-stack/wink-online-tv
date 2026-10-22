/**
 * ЭФИР ТВ — УПРАВЛЕНИЕ КАТАЛОГОМ КАНАЛОВ (ЕДИНАЯ КОЛОНКА)
 * Быстрый выбор колесиком мыши, живой поиск,
 * 100% официальные логотипы, бейджи HD и Архива, индикатор EPG,
 * всплывающий список каналов поверх видео.
 */

(function (window) {
  'use strict';

  class PlaylistController {
    constructor() {
      this.channels = [];
      this.searchQuery = '';
      this.currentEpgMap = {}; // channelId -> { title, start, stop, progress }

      this.listContainer = null;
      this.playerSidebarList = null;
      this.countBadge = null;
      this.searchInput = null;
    }

    init() {
      this.listContainer = document.getElementById('channelListContainer');
      this.playerSidebarList = document.getElementById('playerSidebarList');
      this.countBadge = document.getElementById('channelsCountBadge');
      this.searchInput = document.getElementById('searchInput');

      this.bindSearch();
    }

    bindSearch() {
      if (!this.searchInput) return;
      const clearBtn = document.getElementById('searchClear');

      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = this.searchQuery ? 'block' : 'none';
        this.renderList();
      });

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.searchInput.value = '';
          this.searchQuery = '';
          clearBtn.style.display = 'none';
          this.renderList();
        });
      }

      // Горячая клавиша '/' для мгновенного перехода в поиск
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== this.searchInput) {
          e.preventDefault();
          this.searchInput.focus();
        }
      });
    }

    async loadChannels() {
      try {
        const res = await fetch('/api/channels');
        if (!res.ok) throw new Error('Ошибка загрузки каналов');
        const data = await res.json();
        this.channels = data.channels || [];

        // Привязываем логотипы
        this.enrichLogos();

        this.renderList();
        this.renderPlayerSidebar();

        // Загружаем текущие передачи
        this.fetchCurrentPrograms();
      } catch (err) {
        console.error('Error fetching channels:', err);
      }
    }

    enrichLogos() {
      const openSource = window.OPEN_SOURCE_LOGOS || window.EXTERNAL_LOGOS || {};
      for (const ch of this.channels) {
        if (!ch.logo) {
          const normKey = ch.baseName.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/gi, '');
          const superKey = normKey.replace(/\b(tv|тв|канал)\b/gi, '').replace(/^(tv|тв)/gi, '');
          if (openSource[normKey]) {
            ch.logo = openSource[normKey];
          } else if (openSource[superKey]) {
            ch.logo = openSource[superKey];
          }
        }
      }
    }

    async fetchCurrentPrograms() {
      try {
        const res = await fetch('/api/epg/current');
        if (res.ok) {
          const data = await res.json();
          this.currentEpgMap = data.currentPrograms || {};
          this.updateRowLiveTitles();
        }
      } catch (e) {}
    }

    getFilteredChannels() {
      if (!this.searchQuery) return this.channels;
      return this.channels.filter(ch => {
        const matchName = ch.baseName.toLowerCase().includes(this.searchQuery);
        const epgInfo = this.currentEpgMap[ch.id];
        const matchProg = epgInfo && epgInfo.title.toLowerCase().includes(this.searchQuery);
        return matchName || matchProg;
      });
    }

    renderList() {
      if (!this.listContainer) return;
      this.listContainer.innerHTML = '';

      const list = this.getFilteredChannels();

      if (this.countBadge) {
        this.countBadge.textContent = list.length;
      }

      if (list.length === 0) {
        this.listContainer.innerHTML = `
          <div style="text-align: center; padding: 40px 10px; color: #94a3b8;">
            <div style="font-size: 2.2rem; margin-bottom: 8px; opacity: 0.5;">🔍</div>
            <div style="font-weight: 700; color: #fff;">Каналы не найдены</div>
            <div style="font-size: 0.8rem; margin-top: 4px;">Измените поисковый запрос</div>
          </div>
        `;
        return;
      }

      const activeCh = window.WinkPlayer ? window.WinkPlayer.currentChannel : null;
      const fragment = document.createDocumentFragment();

      for (const ch of list) {
        const row = document.createElement('div');
        const isActive = activeCh && activeCh.id === ch.id;
        row.className = `channel-row ${isActive ? 'active' : ''}`;
        row.id = `ch_row_${ch.id}`;

        const epgData = this.currentEpgMap[ch.id];
        let progTitle = 'Эфирная трансляция';
        if (epgData && epgData.title) {
          progTitle = epgData.title;
        } else if (ch.hasEpg) {
          progTitle = 'Прямой эфир (загрузка программы...)';
        }

        const isHd = ch.isHd || /\bhd\b/i.test(ch.baseName);
        const hdBadge = isHd ? `<span class="badge-hd">HD</span>` : '';
        const archiveBadge = ch.isWink ? `<span class="badge-archive" title="Доступен архив передач за 3 дня">Архив</span>` : '';

        const logoHtml = ch.logo
          ? `<img src="${ch.logo}" alt="${ch.baseName}" loading="lazy" onerror="this.style.opacity='0.2'"><span class="channel-row-fallback" style="display:none;">${ch.baseName.slice(0, 2).toUpperCase()}</span>`
          : `<span class="channel-row-fallback">${ch.baseName.slice(0, 2).toUpperCase()}</span>`;

        row.innerHTML = `
          <div class="channel-row-logo">
            ${logoHtml}
          </div>
          <div class="channel-row-info">
            <div class="channel-row-name" title="${ch.baseName}">
              <span class="channel-row-name-text">${ch.baseName}</span>
              ${hdBadge}
              ${archiveBadge}
            </div>
            <div class="channel-row-prog" id="row_prog_${ch.id}" title="${progTitle}">${progTitle}</div>
          </div>
        `;

        // Клик по строке — включение канала и обновление URL
        row.addEventListener('click', () => {
          if (window.WinkPlayer) {
            window.WinkPlayer.playLive(ch);
          }
          if (window.WinkApp && window.WinkApp.updateBrowserUrl) {
            window.WinkApp.updateBrowserUrl(ch);
          }
          this.highlightActiveRow(ch.id);
        });

        fragment.appendChild(row);
      }

      this.listContainer.appendChild(fragment);
    }

    renderPlayerSidebar() {
      if (!this.playerSidebarList) {
        this.playerSidebarList = document.getElementById('playerSidebarList');
      }
      if (!this.playerSidebarList) return;

      this.playerSidebarList.innerHTML = '';
      const activeCh = window.WinkPlayer ? window.WinkPlayer.currentChannel : null;
      const fragment = document.createDocumentFragment();

      for (let i = 0; i < this.channels.length; i++) {
        const ch = this.channels[i];
        const item = document.createElement('div');
        const isActive = activeCh && activeCh.id === ch.id;
        item.className = `player-sidebar-item ${isActive ? 'active' : ''}`;
        item.id = `pside_row_${ch.id}`;

        const isHd = ch.isHd || /\bhd\b/i.test(ch.baseName);
        const hdBadge = isHd ? `<span class="badge-hd" style="margin-left: auto;">HD</span>` : '';

        const logoSrc = ch.logo || '';
        item.innerHTML = `
          <img class="player-sidebar-logo" src="${logoSrc}" alt="" onerror="this.style.opacity='0.2'">
          <span style="font-size: 0.8rem; font-weight: 800; color: #60a5fa; min-width: 22px;">${i + 1}</span>
          <span class="player-sidebar-name">${ch.baseName}</span>
          ${hdBadge}
        `;

        item.addEventListener('click', () => {
          if (window.WinkPlayer) {
            window.WinkPlayer.playLive(ch);
          }
          if (window.WinkApp && window.WinkApp.updateBrowserUrl) {
            window.WinkApp.updateBrowserUrl(ch);
          }
          this.highlightActiveRow(ch.id);
        });

        fragment.appendChild(item);
      }

      this.playerSidebarList.appendChild(fragment);
    }

    renderGrid() {
      this.renderList();
    }

    highlightActiveRow(channelId) {
      // 1. В основном списке каналов слева
      if (this.listContainer) {
        const allRows = this.listContainer.querySelectorAll('.channel-row');
        allRows.forEach(r => r.classList.remove('active'));

        const activeRow = document.getElementById(`ch_row_${channelId}`);
        if (activeRow) {
          activeRow.classList.add('active');
          const rowTop = activeRow.offsetTop;
          const containerTop = this.listContainer.offsetTop;
          const targetScroll = Math.max(0, rowTop - containerTop - 60);
          this.listContainer.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }
      }

      // 2. Во всплывающем списке внутри плеера (скроллим ТОЛЬКО если сайдбар открыт)
      if (this.playerSidebarList) {
        const allPside = this.playerSidebarList.querySelectorAll('.player-sidebar-item');
        allPside.forEach(r => r.classList.remove('active'));

        const isSidebarOpen = window.WinkPlayer && window.WinkPlayer.ui.playerSidebar && window.WinkPlayer.ui.playerSidebar.classList.contains('open');
        const activePside = document.getElementById(`pside_row_${channelId}`);
        if (activePside) {
          activePside.classList.add('active');
          if (isSidebarOpen) {
            const psideTop = activePside.offsetTop;
            const psideContTop = this.playerSidebarList.offsetTop;
            const targetScroll = Math.max(0, psideTop - psideContTop - 40);
            this.playerSidebarList.scrollTo({ top: targetScroll, behavior: 'smooth' });
          }
        }
      }
    }

    highlightActiveCard(channelId) {
      this.highlightActiveRow(channelId);
    }

    updateRowLiveTitles() {
      for (const [chId, prog] of Object.entries(this.currentEpgMap)) {
        const el = document.getElementById(`row_prog_${chId}`);
        if (el && prog && prog.title) {
          el.textContent = prog.title;
          el.title = prog.title;
        }
      }
    }
  }

  window.WinkPlaylist = new PlaylistController();
})(window);
