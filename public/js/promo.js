/**
 * =========================================================================
 * ПРОФЕССИОНАЛЬНАЯ СИСТЕМА ПРОМО И РЕКЛАМЫ ПРИЛОЖЕНИЯ ДЛЯ ПК
 * =========================================================================
 * 
 * Владелец сайта может легко указать свою прямую ссылку на скачивание
 * установщика (.exe), изменить текст или включить/выключить любой вариант
 * отображения промо в блоке конфигурации ниже.
 */

(function (window) {
  'use strict';

  // ==================== НАСТРОЙКИ ДЛЯ ВЛАДЕЛЬЦА САЙТА ====================
  const APP_PROMO_CONFIG = {
    // 1. ВСТАВЬТЕ СЮДА ВАШУ ССЫЛКУ НА СКАЧИВАНИЕ ИЛИ СТРАНИЦУ ПРИЛОЖЕНИЯ:
    // По умолчанию настроена прямая раздача файла прямо с вашего сервера:
    downloadUrl: '/download',

    // 2. Название и тексты приложения:
    appName: 'ЭФИР ТВ для Windows',
    versionBadge: 'Версия для ПК',
    tagline: 'Смотрите любимые телеканалы без браузера, в 4K и с поддержкой пульта ДУ',
    buttonText: 'Скачать для ПК',

    // 3. Преимущества приложения для показа в модальном окне:
    features: [
      {
        icon: '🚀',
        title: 'Мгновенный запуск и аппаратное ускорение',
        desc: 'Прямая работа с видеокартой (DirectX / GPU) без ограничений браузера и зависаний.'
      },
      {
        icon: '🎮',
        title: 'Управление пультом ДУ и клавиатурой',
        desc: 'Идеально для медиацентров, мониторов и телевизоров, подключенных к ПК.'
      },
      {
        icon: '📌',
        title: 'Режим поверх всех окон и трей',
        desc: 'Смотрите передачи в компактном окне во время работы, учебы или игр.'
      },
      {
        icon: '⚡',
        title: 'Стабильный эфир и умный буфер',
        desc: 'Никаких разрывов и сбоев видеопотока даже при нестабильном интернете.'
      }
    ],

    // 4. Включение / выключение вариантов отображения промо:
    variants: {
      headerButton: true,      // Вариант 1: Аккуратная кнопка в шапке сайта
      sidebarBanner: true,     // Вариант 2: Карточка в левой колонке над каналами (сворачиваемая)
      pauseScreenAd: true,     // Вариант 3: Smart Pause — ненавязчивая плашка при паузе плеера
      modalDetails: true       // Вариант 4: Презентационное окно с описанием и кнопкой скачивания
    }
  };

  // Экспортируем глобально, чтобы владелец мог менять параметры на лету при необходимости
  window.APP_PROMO_CONFIG = APP_PROMO_CONFIG;

  class PromoManager {
    constructor() {
      this.config = APP_PROMO_CONFIG;
      this.isDismissedSidebar = false;
      this.loadStorageState();
    }

    loadStorageState() {
      try {
        this.isDismissedSidebar = localStorage.getItem('tv_promo_sidebar_dismissed') === 'true';
      } catch (e) {
        this.isDismissedSidebar = false;
      }
    }

    dismissSidebar() {
      this.isDismissedSidebar = true;
      try {
        localStorage.setItem('tv_promo_sidebar_dismissed', 'true');
      } catch (e) {}
      const banner = document.getElementById('promoSidebarBanner');
      if (banner) {
        banner.style.transition = 'all 0.25s ease';
        banner.style.opacity = '0';
        banner.style.height = '0';
        banner.style.margin = '0';
        banner.style.padding = '0';
        setTimeout(() => banner.remove(), 250);
      }
    }

    init() {
      // 1. Инициализация кнопки в шапке
      if (this.config.variants.headerButton) {
        this.renderHeaderButton();
      }

      // 2. Инициализация промо-карточки в левой колонке над каналами
      if (this.config.variants.sidebarBanner && !this.isDismissedSidebar) {
        this.renderSidebarBanner();
      }

      // 3. Инициализация Smart Pause в плеере
      if (this.config.variants.pauseScreenAd) {
        this.renderPauseAd();
      }

      // 4. Инициализация модального окна
      if (this.config.variants.modalDetails) {
        this.renderPromoModal();
      }
    }

    /**
     * ВАРИАНТ 1: Премиальная компактная кнопка в шапке сайта
     */
    renderHeaderButton() {
      const headerActions = document.querySelector('.header-actions');
      if (!headerActions) return;

      const btn = document.createElement('button');
      btn.className = 'header-promo-btn';
      btn.id = 'headerPromoBtn';
      btn.title = `${this.config.appName} — Нажмите, чтобы скачать`;
      btn.innerHTML = `
        <span class="promo-win-icon">🪟</span>
        <span class="promo-btn-text">${this.config.buttonText}</span>
        <span class="promo-btn-arrow">↓</span>
      `;

      btn.addEventListener('click', () => {
        if (this.config.variants.modalDetails) {
          this.openModal();
        } else {
          window.open(this.config.downloadUrl, '_blank');
        }
      });

      // Вставляем перед кнопкой помощи клавиатуры
      const helpBtn = document.getElementById('helpModalBtn');
      if (helpBtn) {
        headerActions.insertBefore(btn, helpBtn);
      } else {
        headerActions.appendChild(btn);
      }
    }

    /**
     * ВАРИАНТ 2: Ненавязчивая промо-карточка в левой колонке над списком каналов
     */
    renderSidebarBanner() {
      const channelsSidebar = document.getElementById('channelsSidebar');
      const listContainer = document.getElementById('channelListContainer');
      if (!channelsSidebar || !listContainer) return;

      const card = document.createElement('div');
      card.className = 'promo-sidebar-card';
      card.id = 'promoSidebarBanner';
      card.innerHTML = `
        <div class="promo-card-icon">🪟</div>
        <div class="promo-card-body">
          <div class="promo-card-title">${this.config.appName}</div>
          <div class="promo-card-desc">Без браузера, в 4K и с пультом</div>
        </div>
        <button class="promo-card-action" title="Скачать приложение для Windows">
          <span>Скачать</span>
        </button>
        <button class="promo-card-close" id="promoSidebarClose" title="Скрыть">✕</button>
      `;

      // Клик по кнопке "Скачать"
      const actionBtn = card.querySelector('.promo-card-action');
      if (actionBtn) {
        actionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.config.variants.modalDetails) {
            this.openModal();
          } else {
            window.open(this.config.downloadUrl, '_blank');
          }
        });
      }

      // Клик по всей карточке открывает модалку
      card.addEventListener('click', () => {
        if (this.config.variants.modalDetails) {
          this.openModal();
        }
      });

      // Закрытие карточки
      const closeBtn = card.querySelector('#promoSidebarClose');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.dismissSidebar();
        });
      }

      // Вставляем прямо над списком каналов
      channelsSidebar.insertBefore(card, listContainer);
    }

    /**
     * ВАРИАНТ 3: Smart Pause Ad в плеере (показывается ТОЛЬКО когда видео на паузе)
     */
    renderPauseAd() {
      const videoWrapper = document.getElementById('videoWrapper');
      if (!videoWrapper) return;

      let pauseBanner = document.getElementById('playerPauseAd');
      if (!pauseBanner) {
        pauseBanner = document.createElement('div');
        pauseBanner.className = 'player-pause-ad';
        pauseBanner.id = 'playerPauseAd';
        pauseBanner.innerHTML = `
          <div class="pause-ad-content">
            <div class="pause-ad-badge">💻 ПРИЛОЖЕНИЕ ДЛЯ ПК</div>
            <div class="pause-ad-title">Смотрите ТВ в максимальном качестве 4K в приложении для Windows</div>
            <div class="pause-ad-desc">Аппаратное ускорение, мгновенный запуск каналов и управление пультом ДУ без ограничений браузера.</div>
          </div>
          <div class="pause-ad-actions">
            <button class="pause-ad-btn" id="pauseAdDownloadBtn">
              <span>🪟 Скачать бесплатно</span>
            </button>
          </div>
        `;

        const btn = pauseBanner.querySelector('#pauseAdDownloadBtn');
        if (btn) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.config.variants.modalDetails) {
              this.openModal();
            } else {
              window.open(this.config.downloadUrl, '_blank');
            }
          });
        }

        // Вставляем в видео-обертку
        videoWrapper.appendChild(pauseBanner);
      }
    }

    showPauseAd() {
      const ad = document.getElementById('playerPauseAd');
      if (ad && this.config.variants.pauseScreenAd) {
        ad.classList.add('visible');
      }
    }

    hidePauseAd() {
      const ad = document.getElementById('playerPauseAd');
      if (ad) {
        ad.classList.remove('visible');
      }
    }

    /**
     * ВАРИАНТ 4: Модальное окно презентации приложения
     */
    renderPromoModal() {
      let modal = document.getElementById('promoModal');
      if (modal) return;

      modal = document.createElement('div');
      modal.className = 'promo-modal-backdrop';
      modal.id = 'promoModal';
      modal.style.display = 'none';

      const featuresHtml = this.config.features.map(f => `
        <div class="promo-feature-item">
          <div class="promo-feature-icon">${f.icon}</div>
          <div class="promo-feature-text">
            <div class="promo-feature-title">${f.title}</div>
            <div class="promo-feature-desc">${f.desc}</div>
          </div>
        </div>
      `).join('');

      modal.innerHTML = `
        <div class="promo-modal-window">
          <button class="promo-modal-close" id="promoModalClose">✕</button>
          
          <div class="promo-modal-header">
            <div class="promo-modal-badge">${this.config.versionBadge}</div>
            <h2 class="promo-modal-title">
              <span>${this.config.appName}</span>
            </h2>
            <p class="promo-modal-subtitle">${this.config.tagline}</p>
          </div>

          <div class="promo-features-grid">
            ${featuresHtml}
          </div>

          <div class="promo-modal-cta">
            <a href="${this.config.downloadUrl}" target="_blank" class="promo-download-main-btn" id="promoDownloadMainBtn">
              <span class="cta-win-logo">🪟</span>
              <span class="cta-label-group">
                <span class="cta-label-main">${this.config.buttonText}</span>
                <span class="cta-label-sub">Официальный установщик • Windows 10 / 11 (x64)</span>
              </span>
              <span class="cta-arrow">⬇</span>
            </a>
            <div class="promo-cta-footnote">Бесплатно • Без вирусов • Быстрая установка за 10 секунд</div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeBtn = modal.querySelector('#promoModalClose');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeModal());
      }

      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
          this.closeModal();
        }
      });
    }

    openModal() {
      const modal = document.getElementById('promoModal');
      if (modal) {
        modal.style.display = 'flex';
      }
    }

    closeModal() {
      const modal = document.getElementById('promoModal');
      if (modal) {
        modal.style.display = 'none';
      }
    }
  }

  window.PromoApp = new PromoManager();

  // Автоинициализация при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.PromoApp.init());
  } else {
    window.PromoApp.init();
  }

})(window);
