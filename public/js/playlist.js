/**
 * ЭФИР ТВ — УПРАВЛЕНИЕ КАТАЛОГОМ КАНАЛОВ (ЛЕВАЯ КОЛОНКА)
 * Быстрый выбор колесиком мыши, живой поиск,
 * официальные логотипы, текущий эфир EPG и избранное.
 */

(function (window) {
  'use strict';

  class PlaylistController {
    constructor() {
      this.channels = [];
      this.searchQuery = '';
      this.favorites = new Set();
      this.currentEpgMap = {}; // channelId -> { title, start, stop, progress }

      this.listContainer = null;
      this.countBadge = null;
      this.searchInput = null;

      this.loadFavorites();
    }

    init() {
      this.listContainer = document.getElementById('channelListContainer');
      this.countBadge = document.getElementById('channelsCountBadge');
      this.searchInput = document.getElementById('searchInput');

      this.bindSearch();
    }

    loadFavorites() {
      try {
        const saved = localStorage.getItem('tv_favorites');
        if (saved) {
          const list = JSON.parse(saved);
          this.favorites = new Set(list);
        }
      } catch (e) {}
    }

    saveFavorites() {
      try {
        localStorage.setItem('tv_favorites', JSON.stringify([...this.favorites]));
      } catch (e) {}
    }

    toggleFavorite(channelId, e) {
      if (e) e.stopPropagation();
      if (this.favorites.has(channelId)) {
        this.favorites.delete(channelId);
        if (window.WinkApp) window.WinkApp.showToast('Удалено из избранного');
      } else {
        this.favorites.add(channelId);
        if (window.WinkApp) window.WinkApp.showToast('⭐ Добавлено в избранное');
      }
      this.saveFavorites();
      this.renderList();
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
      return this.channels.filter(ch => {
        // Фильтр по поисковому запросу
        if (this.searchQuery) {
          const matchName = ch.baseName.toLowerCase().includes(this.searchQuery);
          const epgInfo = this.currentEpgMap[ch.id];
          const matchProg = epgInfo && epgInfo.title.toLowerCase().includes(this.searchQuery);
          if (!matchName && !matchProg) return false;
        }
        return true;
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

      for (const ch of list) {
        const row = document.createElement('div');
        const isActive = activeCh && activeCh.id === ch.id;
        row.className = `channel-row ${isActive ? 'active' : ''}`;
        row.id = `ch_row_${ch.id}`;

        const isFav = this.favorites.has(ch.id);
        const epgData = this.currentEpgMap[ch.id];
        const progTitle = epgData ? epgData.title : 'Прямой эфир телеканала';

        const logoHtml = ch.logo
          ? `<img src="${ch.logo}" alt="${ch.baseName}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="channel-row-fallback" style="display:none;">${ch.baseName.slice(0, 2).toUpperCase()}</span>`
          : `<span class="channel-row-fallback">${ch.baseName.slice(0, 2).toUpperCase()}</span>`;

        row.innerHTML = `
          <div class="channel-row-logo">
            ${logoHtml}
          </div>
          <div class="channel-row-info">
            <div class="channel-row-name" title="${ch.baseName}">${ch.baseName}</div>
            <div class="channel-row-prog" id="row_prog_${ch.id}" title="${progTitle}">${progTitle}</div>
          </div>
          <button class="channel-row-fav ${isFav ? 'active' : ''}" title="${isFav ? 'В избранном' : 'Добавить в избранное'}">
            ${isFav ? '★' : '☆'}
          </button>
        `;

        // Клик по строке — включение канала
        row.addEventListener('click', () => {
          if (window.WinkPlayer) {
            window.WinkPlayer.playLive(ch);
          }
          this.highlightActiveRow(ch.id);
        });

        // Клик по звездочке избранного
        const starBtn = row.querySelector('.channel-row-fav');
        if (starBtn) {
          starBtn.addEventListener('click', (e) => this.toggleFavorite(ch.id, e));
        }

        this.listContainer.appendChild(row);
      }
    }

    highlightActiveRow(channelId) {
      if (!this.listContainer) return;
      const allRows = this.listContainer.querySelectorAll('.channel-row');
      allRows.forEach(r => r.classList.remove('active'));

      const activeRow = document.getElementById(`ch_row_${channelId}`);
      if (activeRow) {
        activeRow.classList.add('active');
        activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
