/**
 * WINK TV REPLAY — TIMEZONE MANAGER
 * Handles client local timezone detection, MSK offset calculation,
 * and automatic feed matching for channels (+0, +2, +4, +7 etc.)
 */

(function (window) {
  'use strict';

  const TIMEZONE_PRESETS = [
    { label: 'Калининград (МСК-1, UTC+2)', mskShift: -1, utcOffset: 2, zone: 'Europe/Kaliningrad' },
    { label: 'Москва, СПб (МСК, UTC+3)', mskShift: 0, utcOffset: 3, zone: 'Europe/Moscow' },
    { label: 'Самара, Саратов (МСК+1, UTC+4)', mskShift: 1, utcOffset: 4, zone: 'Europe/Samara' },
    { label: 'Екатеринбург, Урал (МСК+2, UTC+5)', mskShift: 2, utcOffset: 5, zone: 'Asia/Yekaterinburg' },
    { label: 'Омск (МСК+3, UTC+6)', mskShift: 3, utcOffset: 6, zone: 'Asia/Omsk' },
    { label: 'Красноярск, Новосибирск (МСК+4, UTC+7)', mskShift: 4, utcOffset: 7, zone: 'Asia/Krasnoyarsk' },
    { label: 'Иркутск (МСК+5, UTC+8)', mskShift: 5, utcOffset: 8, zone: 'Asia/Irkutsk' },
    { label: 'Якутск, Забайкалье (МСК+6, UTC+9)', mskShift: 6, utcOffset: 9, zone: 'Asia/Yakutsk' },
    { label: 'Владивосток, Хабаровск (МСК+7, UTC+10)', mskShift: 7, utcOffset: 10, zone: 'Asia/Vladivostok' },
    { label: 'Магадан, Сахалин (МСК+8, UTC+11)', mskShift: 8, utcOffset: 11, zone: 'Asia/Magadan' },
    { label: 'Камчатка, Чукотка (МСК+9, UTC+12)', mskShift: 9, utcOffset: 12, zone: 'Asia/Kamchatka' },
  ];

  class TimezoneManager {
    constructor() {
      this.detectedTzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
      this.detectedUtcOffset = Math.round(-new Date().getTimezoneOffset() / 60);
      this.detectedMskShift = this.detectedUtcOffset - 3; // Базовое московское время UTC+3

      this.isManual = false;
      this.currentMskShift = this.detectedMskShift;
      this.currentTzName = this.detectedTzName;

      this.loadPreference();
    }

    loadPreference() {
      try {
        const saved = localStorage.getItem('wink_tz_shift');
        if (saved !== null && saved !== undefined && saved !== 'auto') {
          const shift = parseInt(saved, 10);
          if (!isNaN(shift)) {
            this.isManual = true;
            this.currentMskShift = shift;
            const preset = TIMEZONE_PRESETS.find(p => p.mskShift === shift);
            if (preset) this.currentTzName = preset.zone;
          }
        } else {
          this.isManual = false;
          this.currentMskShift = this.detectedMskShift;
          this.currentTzName = this.detectedTzName;
        }
      } catch (e) {
        console.warn('Error reading timezone preference:', e);
      }
    }

    setTimezoneShift(shift) {
      if (shift === 'auto') {
        this.isManual = false;
        this.currentMskShift = this.detectedMskShift;
        this.currentTzName = this.detectedTzName;
        try {
          localStorage.removeItem('wink_tz_shift');
        } catch (e) {}
      } else {
        const num = parseInt(shift, 10);
        if (!isNaN(num)) {
          this.isManual = true;
          this.currentMskShift = num;
          const preset = TIMEZONE_PRESETS.find(p => p.mskShift === num);
          if (preset) this.currentTzName = preset.zone;
          try {
            localStorage.setItem('wink_tz_shift', String(num));
          } catch (e) {}
        }
      }
    }

    getLabel() {
      const shift = this.currentMskShift;
      const sign = shift >= 0 ? `+${shift}` : `${shift}`;
      if (!this.isManual) {
        const city = this.detectedTzName.split('/').pop().replace('_', ' ');
        return `Авто: ${city} (МСК${sign})`;
      }
      const preset = TIMEZONE_PRESETS.find(p => p.mskShift === shift);
      return preset ? preset.label : `МСК${sign}`;
    }

    getPresets() {
      return TIMEZONE_PRESETS;
    }

    /**
     * Интеллектуальный выбор подходящего фида канала под часовой пояс пользователя
     */
    getBestFeed(channel) {
      if (!channel || !Array.isArray(channel.feeds) || channel.feeds.length === 0) {
        return null;
      }

      if (channel.feeds.length === 1) {
        return channel.feeds[0];
      }

      const targetShift = this.currentMskShift;

      // 1. Ищем точное совпадение со сдвигом пользователя
      const exactMatch = channel.feeds.find(f => f.tzShift === targetShift);
      if (exactMatch) return exactMatch;

      // 2. Если точного нет, выбираем ближайший доступный
      let bestFeed = channel.feeds[0];
      let minDiff = Math.abs(channel.feeds[0].tzShift - targetShift);

      for (let i = 1; i < channel.feeds.length; i++) {
        const diff = Math.abs(channel.feeds[i].tzShift - targetShift);
        if (diff < minDiff) {
          minDiff = diff;
          bestFeed = channel.feeds[i];
        }
      }

      return bestFeed;
    }

    /**
     * Форматирование времени секунды epoch в локальный вид пользователя (ЧЧ:ММ)
     */
    formatTime(epochSec) {
      if (!epochSec) return '--:--';
      const d = new Date(epochSec * 1000);
      try {
        return d.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: this.currentTzName
        });
      } catch (e) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      }
    }

    /**
     * Форматирование даты в локальный вид (ДД МММ)
     */
    formatDate(epochSec) {
      if (!epochSec) return '';
      const d = new Date(epochSec * 1000);
      try {
        return d.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'short',
          timeZone: this.currentTzName
        });
      } catch (e) {
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      }
    }
  }

  window.WinkTimezone = new TimezoneManager();
})(window);
