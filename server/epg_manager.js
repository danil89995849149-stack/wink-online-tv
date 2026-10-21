'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const config = require('./config');

function normalizeName(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(\b4k\b|\buhd\b|\bfhd\b|\bhd\b|50fps|60fps|\+\d|\s*\(\s*[+-]?\d+\s*\))/gi, '')
    .replace(/[^a-zа-я0-9]/gi, '')
    .trim();
}

function parseXmltvDate(dtStr) {
  if (!dtStr) return 0;
  // Формат: "20261020183000 +0300" или "20261020183000"
  const m = dtStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!m) return 0;
  const tz = m[7] || '+0000';
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz.slice(0, 3)}:${tz.slice(3)}`;
  const t = Date.parse(iso);
  return isNaN(t) ? 0 : Math.floor(t / 1000);
}

function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

class EpgManager {
  constructor() {
    this.lastUpdated = null;
    this.isUpdating = false;
    this.updateError = null;
    this.totalPrograms = 0;
    this.totalChannels = 0;
    this.timer = null;

    // Индексы
    // byId: chId -> Array<[start, stop, title, desc]>
    this.byId = new Map();
    // byName: normalizedName -> chId
    this.byName = new Map();
    // displayNameById: chId -> string
    this.namesById = new Map();
  }

  init() {
    // 1. Попытка загрузить из кэша
    this.loadFromCache();

    // 2. Фоновое обновление при старте
    this.refresh().catch(err => {
      console.warn('[EpgManager] Начальное сетевое обновление EPG не удалось, используется кэш:', err.message);
    });

    // 3. Периодическое обновление
    this.timer = setInterval(() => {
      this.refresh().catch(err => console.error('[EpgManager] Ошибка фонового обновления:', err.message));
    }, config.EPG_REFRESH_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getCacheFilePath() {
    return path.join(config.CACHE_DIR, 'epg_cache.xml.gz');
  }

  async loadFromCache() {
    const cacheFile = this.getCacheFilePath();
    if (fs.existsSync(cacheFile)) {
      try {
        const stat = fs.statSync(cacheFile);
        console.log(`[EpgManager] Загрузка EPG из локального кэша (${(stat.size / 1024 / 1024).toFixed(1)} МБ)...`);
        const readStream = fs.createReadStream(cacheFile);
        await this.parseStream(readStream);
        this.lastUpdated = stat.mtimeMs;
        console.log(`[EpgManager] Загружен кэш EPG: ${this.totalPrograms} передач для ${this.totalChannels} каналов`);
        return true;
      } catch (e) {
        console.error('[EpgManager] Ошибка парсинга кэша EPG:', e.message);
      }
    }
    return false;
  }

  parseStream(stream) {
    return new Promise((resolve, reject) => {
      const gunzip = zlib.createGunzip();
      let buffer = '';
      let progCount = 0;
      let chanCount = 0;

      const newById = new Map();
      const newByName = new Map();
      const newNamesById = new Map();

      const nowSec = Math.floor(Date.now() / 1000);
      const keepFrom = nowSec - 72 * 3600; // 3 суток назад
      const keepTo = nowSec + 72 * 3600;   // 3 суток вперед

      const flush = () => {
        let pIdx;
        while ((pIdx = buffer.indexOf('</programme>')) !== -1) {
          const block = buffer.slice(0, pIdx);
          buffer = buffer.slice(pIdx + 12);

          const chMatch = block.match(/channel=["']([^"']+)["']/i);
          const startMatch = block.match(/start=["']([^"']+)["']/i);
          const stopMatch = block.match(/stop=["']([^"']+)["']/i);
          const titleMatch = block.match(/<title[^>]*>([^<]+)<\/title>/i);
          const descMatch = block.match(/<desc[^>]*>([^<]+)<\/desc>/i);

          if (chMatch && startMatch && stopMatch && titleMatch) {
            const chId = chMatch[1];
            const startSec = parseXmltvDate(startMatch[1]);
            const stopSec = parseXmltvDate(stopMatch[1]);

            if (startSec && stopSec && stopSec > startSec) {
              if (stopSec >= keepFrom && startSec <= keepTo) {
                const title = decodeXmlEntities(titleMatch[1].trim());
                const desc = descMatch
                  ? decodeXmlEntities(descMatch[1].trim()).slice(0, 300)
                  : '';

                if (!newById.has(chId)) newById.set(chId, []);
                newById.get(chId).push([startSec, stopSec, title, desc]);
                progCount++;
              }
            }
          }
        }

        // Парсинг тегов <channel id="...">
        let cIdx;
        while ((cIdx = buffer.indexOf('</channel>')) !== -1) {
          const block = buffer.slice(0, cIdx);
          buffer = buffer.slice(cIdx + 10);

          const idMatch = block.match(/<channel[^>]+id=["']([^"']+)["']/i);
          const nameMatches = block.matchAll(/<display-name[^>]*>([^<]+)<\/display-name>/gi);

          if (idMatch) {
            const chId = idMatch[1];
            chanCount++;
            for (const nm of nameMatches) {
              const nameText = decodeXmlEntities(nm[1].trim());
              const norm = normalizeName(nameText);
              if (norm && !newByName.has(norm)) {
                newByName.set(norm, chId);
              }
              if (!newNamesById.has(chId)) {
                newNamesById.set(chId, nameText);
              }
            }
          }
        }
      };

      gunzip.on('data', chunk => {
        buffer += chunk.toString('utf8');
        if (buffer.length > 512 * 1024) {
          flush();
        }
      });

      gunzip.on('end', () => {
        flush();

        // Сортируем программы по времени старта
        for (const [id, progs] of newById.entries()) {
          progs.sort((a, b) => a[0] - b[0]);
        }

        this.byId = newById;
        this.byName = newByName;
        this.namesById = newNamesById;
        this.totalPrograms = progCount;
        this.totalChannels = chanCount;
        resolve();
      });

      gunzip.on('error', err => reject(err));
      stream.on('error', err => reject(err));
      stream.pipe(gunzip);
    });
  }

  async refresh() {
    if (this.isUpdating) return;
    this.isUpdating = true;
    this.updateError = null;

    let success = false;
    for (const sourceUrl of config.EPG_REMOTE_SOURCES) {
      console.log(`[EpgManager] Попытка загрузки EPG из ${sourceUrl}...`);
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const res = await fetch(sourceUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal
        });
        clearTimeout(tid);

        if (!res.ok) {
          console.warn(`[EpgManager] Источник ${sourceUrl} ответил ${res.status}`);
          continue;
        }

        // Сохраняем в кэш файл
        const cacheFile = this.getCacheFilePath();
        if (!fs.existsSync(config.CACHE_DIR)) {
          fs.mkdirSync(config.CACHE_DIR, { recursive: true });
        }

        const buffer = await res.arrayBuffer();
        fs.writeFileSync(cacheFile, Buffer.from(buffer));
        console.log(`[EpgManager] EPG успешно скачан (${(buffer.byteLength / 1024 / 1024).toFixed(1)} МБ), парсинг...`);

        // Парсим сохраненный файл
        const stream = fs.createReadStream(cacheFile);
        await this.parseStream(stream);

        this.lastUpdated = Date.now();
        success = true;
        console.log(`[EpgManager] EPG обновлено: ${this.totalPrograms} передач для ${this.totalChannels} каналов`);
        break;
      } catch (err) {
        console.warn(`[EpgManager] Ошибка загрузки с ${sourceUrl}:`, err.message);
      }
    }

    this.isUpdating = false;
    if (!success && this.totalPrograms === 0) {
      this.updateError = 'Не удалось загрузить EPG ни с одного источника';
      console.error('[EpgManager]', this.updateError);
    }
  }

  findChannelEpgId(tvgId, channelName) {
    if (tvgId && this.byId.has(tvgId)) return tvgId;
    
    // Поиск по нормализованному названию
    const norm = normalizeName(channelName || tvgId);
    if (norm && this.byName.has(norm)) {
      return this.byName.get(norm);
    }

    // Нечеткий поиск
    for (const [nKey, id] of this.byName.entries()) {
      if (norm && (nKey.includes(norm) || norm.includes(nKey))) {
        return id;
      }
    }
    return null;
  }

  getPrograms(tvgId, channelName, dateStr = null, tzOffsetHours = null) {
    const epgId = this.findChannelEpgId(tvgId, channelName);
    if (!epgId || !this.byId.has(epgId)) {
      return [];
    }

    const allProgs = this.byId.get(epgId);
    const nowSec = Math.floor(Date.now() / 1000);

    let startFilterSec = 0;
    let endFilterSec = Infinity;

    if (dateStr) {
      // dateStr: "YYYY-MM-DD"
      const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
        const offsetSec = (typeof tzOffsetHours === 'number') ? tzOffsetHours * 3600 : ((-new Date().getTimezoneOffset()) * 60);
        // Вычисляем полночь и конец дня в локальном часовом поясе клиента
        const utcMidnight = Math.floor(Date.UTC(y, mo - 1, d, 0, 0, 0) / 1000);
        startFilterSec = utcMidnight - offsetSec;
        endFilterSec = startFilterSec + 86400;
      }
    }

    const result = [];
    for (const [startSec, stopSec, title, desc] of allProgs) {
      if (stopSec >= startFilterSec && startSec <= endFilterSec) {
        const isLive = startSec <= nowSec && stopSec > nowSec;
        const isArchive = stopSec <= nowSec;
        const isUpcoming = startSec > nowSec;
        const duration = stopSec - startSec;
        const progress = isLive ? Math.min(100, Math.max(0, Math.round(((nowSec - startSec) / duration) * 100))) : (isArchive ? 100 : 0);

        result.push({
          id: `${epgId}_${startSec}`,
          start: startSec,
          stop: stopSec,
          title,
          desc,
          duration,
          isLive,
          isArchive,
          isUpcoming,
          progress
        });
      }
    }

    return result;
  }

  getCurrentPrograms(channelsList) {
    const nowSec = Math.floor(Date.now() / 1000);
    const map = {};

    for (const ch of channelsList) {
      const epgId = this.findChannelEpgId(ch.tvgId, ch.baseName);
      if (epgId && this.byId.has(epgId)) {
        const progs = this.byId.get(epgId);
        // Бинарный поиск или поиск текущей
        for (const [startSec, stopSec, title, desc] of progs) {
          if (startSec <= nowSec && stopSec > nowSec) {
            const duration = stopSec - startSec;
            const progress = Math.min(100, Math.max(0, Math.round(((nowSec - startSec) / duration) * 100)));
            map[ch.id] = {
              title,
              start: startSec,
              stop: stopSec,
              progress,
              duration
            };
            break;
          }
        }
      }
    }
    return map;
  }

  getStatus() {
    return {
      lastUpdated: this.lastUpdated,
      totalPrograms: this.totalPrograms,
      totalChannels: this.totalChannels,
      isUpdating: this.isUpdating,
      updateError: this.updateError
    };
  }
}

module.exports = new EpgManager();
