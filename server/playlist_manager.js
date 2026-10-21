'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logoProvider = require('./logo_provider');

function slugify(text) {
  const ru = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  const s = String(text || '')
    .toLowerCase()
    .replace(/[а-яё]/g, char => ru[char] || char)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'channel';
}

class PlaylistManager {
  constructor() {
    this.channels = [];
    this.channelMap = new Map(); // id -> channel
    this.slugMap = new Map();    // slug -> channel
    this.lastUpdated = null;
    this.isUpdating = false;
    this.updateError = null;
    this.timer = null;
  }

  init() {
    // 1. Попытка загрузить из кэша
    this.loadFromCache();

    // 2. Первоначальное обновление в фоне
    this.refresh().catch(err => {
      console.warn('[PlaylistManager] Начальное сетевое обновление не удалось, используется кэш:', err.message);
    });

    // 3. Запуск периодического обновления
    this.timer = setInterval(() => {
      this.refresh().catch(err => console.error('[PlaylistManager] Ошибка фонового обновления:', err.message));
    }, config.PLAYLIST_REFRESH_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  loadFromCache() {
    const cacheFile = path.join(config.CACHE_DIR, 'wink_channels.json');
    const fallbackFile = path.join(config.DATA_DIR, 'wink_channels.json');

    let filePath = null;
    if (fs.existsSync(cacheFile)) {
      filePath = cacheFile;
    } else if (fs.existsSync(fallbackFile)) {
      filePath = fallbackFile;
    }

    if (filePath) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.channels) && data.channels.length > 0) {
          this.setChannels(data.channels, data.updatedAt || Date.now());
          console.log(`[PlaylistManager] Загружено из кэша (${path.basename(filePath)}): ${this.channels.length} каналов Wink`);
          return true;
        }
      } catch (e) {
        console.error('[PlaylistManager] Ошибка чтения кэша:', e.message);
      }
    }
    return false;
  }

  setChannels(list, timestamp) {
    this.channels = list;
    this.lastUpdated = timestamp || Date.now();
    this.channelMap.clear();
    this.slugMap.clear();
    for (const ch of this.channels) {
      if (!ch.slug) {
        let baseSlug = slugify(ch.name || ch.baseName || ch.id);
        let s = baseSlug;
        let counter = 2;
        while (this.slugMap.has(s)) {
          s = `${baseSlug}-${counter++}`;
        }
        ch.slug = s;
      }
      this.channelMap.set(ch.id, ch);
      this.slugMap.set(ch.slug, ch);
    }
  }

  async fetchRemoteText(url, timeoutMs = 25000) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        },
        signal: controller.signal
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      if (!text || !text.includes('#EXTM3U')) {
        throw new Error('Ответ не является валидным M3U плейлистом');
      }
      return text;
    } catch (e) {
      clearTimeout(tid);
      throw e;
    }
  }

  parseM3UContent(content) {
    const lines = content.split(/\r?\n/);
    const parsedRaw = [];
    let curInf = null;
    let curOpt = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        curInf = line;
        curOpt = null;
      } else if (line.startsWith('#EXTVLCOPT:')) {
        curOpt = line;
      } else if (line.startsWith('http://') || line.startsWith('https://')) {
        if (curInf) {
          const isWinkGroup = /group-title="[^"]*wink[^"]*"/i.test(curInf);
          const isWinkUrl = /ngenix\.net|zabava|rt\.ru|wink/i.test(line);
          const hasWinkOpt = curOpt && /wink/i.test(curOpt);

          // Фильтруем строго провайдера Wink
          if (isWinkGroup || isWinkUrl || hasWinkOpt) {
            const nameMatch = curInf.match(/,(.+)$/);
            const name = nameMatch ? nameMatch[1].trim() : 'Безымянный канал';

            // Игнорируем технические заглушки и инфо-баннеры
            if (!/Обновление:|Android TV|Посмотри|INFO/i.test(name)) {
              const groupMatch = curInf.match(/group-title="([^"]+)"/i);
              const originalGroup = groupMatch ? groupMatch[1].trim() : 'Wink';

              const logoMatch = curInf.match(/tvg-logo="([^"]+)"/i);
              const logo = logoMatch ? logoMatch[1].trim() : '';

              const tvgIdMatch = curInf.match(/tvg-id="([^"]+)"/i);
              const tvgId = tvgIdMatch ? tvgIdMatch[1].trim() : '';

              const catchupMatch = curInf.match(/catchup="([^"]+)"/i);
              const catchup = catchupMatch ? catchupMatch[1].trim() : 'append';

              const catchupDaysMatch = curInf.match(/catchup-days="([^"]+)"/i);
              const catchupDays = catchupDaysMatch ? catchupDaysMatch[1].trim() : '3';

              const catchupSrcMatch = curInf.match(/catchup-source="([^"]+)"/i);
              const catchupSource = catchupSrcMatch ? catchupSrcMatch[1].trim() : '?offset=-${offset}&utcstart=${timestamp}';

              let userAgent = config.DEFAULT_WINK_UA;
              if (curOpt && curOpt.includes('http-user-agent=')) {
                userAgent = curOpt.split('http-user-agent=')[1].trim();
              }

              // Вычисление часового сдвига из названия: (+2), (+4), +4, (+7)...
              let tzShift = 0;
              let cleanName = name;

              const tzBracketMatch = name.match(/\(\s*([+-]?\s*\d+)\s*\)/);
              if (tzBracketMatch) {
                tzShift = parseInt(tzBracketMatch[1].replace(/\s+/g, ''), 10);
                cleanName = name.replace(/\s*\(\s*[+-]?\s*\d+\s*\)\s*/g, '').trim();
              } else {
                const tzTailMatch = name.match(/\s+([+-]\d+)\s*$/);
                if (tzTailMatch) {
                  tzShift = parseInt(tzTailMatch[1].replace(/\s+/g, ''), 10);
                  cleanName = name.replace(/\s+([+-]\d+)\s*$/g, '').trim();
                }
              }

              // Очистка от лишних суффиксов
              cleanName = cleanName
                .replace(/\s*!+$/g, '')
                .replace(/\s+HD\b/i, '')
                .replace(/\s+SD\b/i, '')
                .replace(/\s+FHD\b/i, '')
                .trim();

              parsedRaw.push({
                fullName: name,
                baseName: cleanName || name,
                tzShift: isNaN(tzShift) ? 0 : tzShift,
                originalGroup,
                logo,
                tvgId: tvgId || cleanName || name,
                catchup,
                catchupDays: parseInt(catchupDays, 10) || 3,
                catchupSource,
                userAgent,
                url: line
              });
            }
          }
        }
        curInf = null;
        curOpt = null;
      }
    }

    return this.aggregateChannels(parsedRaw);
  }

  detectCategory(name) {
    const n = name.toLowerCase();

    // 1. Федеральные / Общероссийские (первый и второй мультиплексы)
    if (/первый канал|россия 1|россия 24|россия к|культура|матч тв|нтв|пятый канал|россия-кул|карусель|отр|тв центр|твц|рен тв|спас|стс|домашний|тв3|тв-3|пятница|звезда|мир\b|муз-тв|солнце/i.test(n)) {
      return 'Общероссийские';
    }

    // 2. Кино и Сериалы
    if (/кино|film|cinema|movie|сериал|дом кино|мосфильм|tv1000|vip|комеди|detective|иллюзион|роман|хоррор|shot|боевик|триллер|вестерн|star/i.test(n)) {
      return 'Кино и сериалы';
    }

    // 3. Познавательные
    if (/discovery|history|планета|наука|national|geographic|природа|доктор|оружие|живая|охота|рыбалка|животные|авто|travel|история|zoopark|viasat/i.test(n)) {
      return 'Познавательные';
    }

    // 4. Развлекательные
    if (/тнт|тнт4|2x2|стс love|че|че!|суббота|ю\b|квн|сарафан|жара|камеди|юмор|парамаунт|comedy/i.test(n)) {
      return 'Развлекательные';
    }

    // 5. Детские
    if (/мульт|детск|сказк|капитан|рыжий|ani|tiji|nick|гулли|радость|малыш|cartoon|disney/i.test(n)) {
      return 'Детские';
    }

    // 6. Спорт
    if (/спорт|sport|матч|футбол|football|кхл|khl|бокс|ufc|боец|драйв|мотор|старт|хоккей|eurosport/i.test(n)) {
      return 'Спорт';
    }

    // 7. Музыка
    if (/муз|music|bridge|mtv|ru\.tv|europa|шансон|песн|мелодия|хит|clip|клип|ля-минор/i.test(n)) {
      return 'Музыка';
    }

    // 8. Новости / Информационные
    if (/новост|вести|24|рбк|rbc|информ|известия|соловь|rt\b|вместе|дум/i.test(n)) {
      return 'Информационные';
    }

    return 'Региональные';
  }

  normalizeChannelKey(baseName) {
    const clean = (baseName || '').trim();
    if (/^(твц|тв\s*центр)$/i.test(clean)) return 'твцентр';
    if (/^(тв3|тв\s*3|тв-3)$/i.test(clean)) return 'тв3';
    if (/^(муз\s*тв|муз-тв|музтв)$/i.test(clean)) return 'музтв';
    if (/^(россия\s*к|россия-к|россия\s*культура|культура)$/i.test(clean)) return 'россияк';
    if (/^(россия\s*1|россия-1)$/i.test(clean)) return 'россия1';
    if (/^(россия\s*24|россия-24)$/i.test(clean)) return 'россия24';
    if (/^(первый\s*канал|1\s*канал)$/i.test(clean)) return 'первыйканал';
    if (/^(пятый\s*канал|5\s*канал)$/i.test(clean)) return 'пятыйканал';
    if (/^(стс\s*love|стс\s*лав)$/i.test(clean)) return 'стсlove';
    if (/^(тнт\s*4|тнт4)$/i.test(clean)) return 'тнт4';
    if (/^(че!|че)$/i.test(clean)) return 'че';
    return clean.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
  }

  getChannelLcnWeight(name) {
    const n = (name || '').toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
    
    // 1-й Мультиплекс РФ (LCN 1-10) — Федеральный стандарт DVB-T2 / Wink
    if (n === 'первыйканал' || n === '1канал') return 1;
    if (n === 'россия1') return 2;
    if (n === 'матчтв' || n === 'матч') return 3;
    if (n === 'нтв') return 4;
    if (n === 'пятыйканал' || n === '5канал') return 5;
    if (n === 'россияк' || n === 'россиякультура' || n === 'культура') return 6;
    if (n === 'россия24') return 7;
    if (n === 'карусель') return 8;
    if (n === 'отр') return 9;
    if (n === 'твцентр' || n === 'твц') return 10;

    // 2-й Мультиплекс РФ (LCN 11-20)
    if (n === 'рентв' || n === 'рен') return 11;
    if (n === 'спас') return 12;
    if (n === 'стс') return 13;
    if (n === 'домашний') return 14;
    if (n === 'тв3') return 15;
    if (n === 'пятница') return 16;
    if (n === 'звезда') return 17;
    if (n === 'мир') return 18;
    if (n === 'тнт') return 19;
    if (n === 'музтв') return 20;

    // Федеральные развлекательные и семейные (21-29)
    if (n === 'солнце') return 21;
    if (n === 'ю' || n === 'каналю') return 22;
    if (n === 'че') return 23;
    if (n === '2x2' || n === '2х2') return 24;
    if (n === 'тнт4') return 25;
    if (n === 'стсlove' || n === 'стслав') return 26;
    if (n === 'супер') return 27;

    // Федеральные новостные, деловые и столичные каналы (30-39)
    if (n === 'рбк') return 30;
    if (n === 'москва24') return 31;
    if (n === 'санктпетербург') return 32;
    if (n === '78канал' || n === '78') return 33;
    if (n === 'москвадоверие' || n === 'доверие') return 34;
    if (n === 'краснаялиния') return 35;

    // Крупнейшие региональные информационные 24/7 каналы
    if (n.endsWith('24')) return 50;

    return 100; // Остальные региональные телеканалы
  }

  aggregateChannels(rawList) {
    const families = new Map();

    for (const item of rawList) {
      const key = this.normalizeChannelKey(item.baseName);
      if (!families.has(key)) {
        families.set(key, []);
      }
      families.get(key).push(item);
    }

    const aggregated = [];
    let chId = 1;

    for (const [key, feeds] of families.entries()) {
      // Ищем фид с логотипом и tvgId
      const withLogo = feeds.find(f => f.logo) || feeds[0];
      const withTvg = feeds.find(f => f.tvgId) || feeds[0];
      const mainFeed = feeds.find(f => f.tzShift === 0) || feeds[0];

      // Сортировка фидов по часовому поясу: +0, +1, +2, +3, +4, +5, +6, +7, +8, +9
      feeds.sort((a, b) => a.tzShift - b.tzShift);

      // Удаление дубликатов по tzShift
      const uniqueFeeds = [];
      const seenShifts = new Set();
      for (const f of feeds) {
        if (!seenShifts.has(f.tzShift)) {
          seenShifts.add(f.tzShift);
          uniqueFeeds.push({
            fullName: f.fullName,
            tzShift: f.tzShift,
            shiftLabel: f.tzShift >= 0 ? `МСК+${f.tzShift}` : `МСК${f.tzShift}`,
            url: f.url,
            catchupSource: f.catchupSource,
            userAgent: f.userAgent
          });
        }
      }

      let baseName = mainFeed.baseName;
      // Приводим имена к эталонному красивому написанию
      if (/^твц$/i.test(baseName)) baseName = 'ТВ Центр';
      if (/^тв3$/i.test(baseName)) baseName = 'ТВ-3';
      if (/^муз\s*тв$/i.test(baseName)) baseName = 'Муз-ТВ';

      const category = this.detectCategory(baseName);
      const originalLogo = logoProvider.getLogoForChannel(baseName, withLogo.logo);

      aggregated.push({
        id: 'ch_' + chId++,
        baseName: baseName,
        category: category,
        logo: originalLogo,
        tvgId: withTvg.tvgId || baseName,
        hasArchive: true,
        archiveDays: 3,
        feedCount: uniqueFeeds.length,
        feeds: uniqueFeeds
      });
    }

    // Профессиональная сортировка по российскому стандарту LCN
    aggregated.sort((a, b) => {
      const wa = this.getChannelLcnWeight(a.baseName);
      const wb = this.getChannelLcnWeight(b.baseName);
      if (wa !== wb) {
        return wa - wb;
      }
      return a.baseName.localeCompare(b.baseName, 'ru');
    });

    return aggregated;
  }

  async refresh() {
    if (this.isUpdating) return;
    this.isUpdating = true;
    this.updateError = null;

    try {
      console.log(`[PlaylistManager] Загрузка обновленного плейлиста из ${config.PLAYLIST_REMOTE_URL}...`);
      let m3uText = null;

      try {
        m3uText = await this.fetchRemoteText(config.PLAYLIST_REMOTE_URL);
      } catch (netErr) {
        console.warn('[PlaylistManager] Сетевой запрос завершился ошибкой:', netErr.message);
        // Пробуем локальный sample_playlist.m3u как резерв
        const localSample = path.join(__dirname, '..', 'sample_playlist.m3u');
        if (fs.existsSync(localSample)) {
          console.log('[PlaylistManager] Использование локального резервного sample_playlist.m3u');
          m3uText = fs.readFileSync(localSample, 'utf8');
        } else {
          throw netErr;
        }
      }

      const list = this.parseM3UContent(m3uText);
      if (list.length === 0) {
        throw new Error('В плейлисте не найдено подходящих каналов Wink');
      }

      this.setChannels(list, Date.now());

      // Сохраняем в дисковый кэш
      try {
        if (!fs.existsSync(config.CACHE_DIR)) {
          fs.mkdirSync(config.CACHE_DIR, { recursive: true });
        }
        const cacheFile = path.join(config.CACHE_DIR, 'wink_channels.json');
        fs.writeFileSync(cacheFile, JSON.stringify({
          updatedAt: this.lastUpdated,
          source: config.PLAYLIST_REMOTE_URL,
          totalChannels: this.channels.length,
          channels: this.channels
        }, null, 2), 'utf8');
        console.log(`[PlaylistManager] Успешно обновлено и закэшировано ${this.channels.length} агрегированных каналов Wink`);
      } catch (saveErr) {
        console.warn('[PlaylistManager] Ошибка сохранения кэша:', saveErr.message);
      }
    } catch (err) {
      this.updateError = err.message;
      console.error('[PlaylistManager] Ошибка обновления:', err.message);
      throw err;
    } finally {
      this.isUpdating = false;
    }
  }

  getAllChannels() {
    return this.channels;
  }

  getChannelById(id) {
    return this.channelMap.get(id) || null;
  }

  getChannelBySlugOrId(key) {
    if (!key) return null;
    return this.slugMap.get(key) || this.channelMap.get(key) || null;
  }

  getStatus() {
    return {
      lastUpdated: this.lastUpdated,
      totalChannels: this.channels.length,
      isUpdating: this.isUpdating,
      updateError: this.updateError
    };
  }
}

module.exports = new PlaylistManager();
