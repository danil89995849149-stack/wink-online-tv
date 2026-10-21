'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const epgManager = require('./server/epg_manager');

function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\b(hd|fhd|4k|sd|hevc|50fps|v2|резерв|эфир|wink)\b/gi, '')
    .replace(/[\[\(].*?[\]\)]/g, '')
    .replace(/[+]\d+/g, '')
    .replace(/[^a-zа-я0-9]/gi, '')
    .trim();
}

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

function getChannelLcnWeight(name) {
  const n = normalizeName(name);

  // 1-й Мультиплекс РФ (LCN 1-10)
  if (n === 'первыйканал' || n === '1канал' || n === 'первый') return 1;
  if (n === 'россия1') return 2;
  if (n === 'матчтв' || n === 'матч') return 3;
  if (n === 'нтв') return 4;
  if (n === 'пятыйканал' || n === '5канал' || n === 'пятый') return 5;
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
  if (n === 'суббота') return 27;

  // Федеральные информационные, деловые и столичные каналы (30-39)
  if (n === 'рбк') return 30;
  if (n === 'москва24') return 31;
  if (n === 'санктпетербург') return 32;
  if (n === '78канал' || n === '78') return 33;
  if (n === 'москвадоверие' || n === 'доверие') return 34;
  if (n === 'краснаялиния') return 35;
  if (n === 'вместе-рф' || n === 'вместерф') return 36;
  if (n === 'победа') return 37;

  // Крупнейшие региональные каналы 24/7
  if (n.endsWith('24')) return 50;

  return 100;
}

// Красная зона (Категорический запрет)
const RED_ZONE_PATTERNS = [
  /матч[\s\-_]*(премьер|футбол|арена|игра|боец|страна)/i,
  /кхл[\s\-_]*prime/i,
  /eurosport/i,
  /setanta/i,
  /ufc/i,
  /viju/i,
  /кинопремьера/i,
  /кинохит/i,
  /киносемья/i,
  /кинострашное/i,
  /киносвидание/i,
  /киномикс/i,
  /amedia/i,
  /start[\s\-_]*(air|world)?/i,
  /кинопоиск/i,
  /red[\s\-_]*media/i,
  /adult|18\+|xxx|эротика|brazzers|playboy|шалун|русская[\s\-_]*ночь|candy|blue[\s\-_]*hustler|penthouse|dorcel|redlight|barely|passion|ню|секс|порно|babes/i,
  /vip[\s\-_]*(premiere|megahit|comedy|serial)/i,
  /discovery|animal[\s\-_]*planet|national[\s\-_]*geographic|nat[\s\-_]*geo|tlc|investigation[\s\-_]*discovery/i,
  /hbo|cinemax|cctv|al[\s\-_]*jazeera|bbc|cnn/i
];

function isRedZone(name, group) {
  const full = `${name} ${group}`.toLowerCase();
  for (const pat of RED_ZONE_PATTERNS) {
    if (pat.test(full)) return true;
  }
  return false;
}

// Зеленая и Желтая зоны
const GREEN_YELLOW_KEYWORDS = [
  'общероссийские', 'федеральные', 'региональные', 'новости', 'детские', 'музыка',
  'познавательные', 'образовательные', 'развлекательные', 'культура', 'спорт открытый',
  '24', 'тв', 'телеканал', 'губерния', 'область', 'край', 'город', 'вести',
  'первый', 'россия', 'нтв', 'тнт', 'стс', 'рен', 'пятница', 'спас', 'звезда', 'мир',
  'муз', 'отр', 'твц', 'карусель', 'домашний', 'че', 'ю', 'солнце', 'суббота', '2х2'
];

function isGreenOrYellow(name, group) {
  const full = `${name} ${group}`.toLowerCase();
  for (const kw of GREEN_YELLOW_KEYWORDS) {
    if (full.includes(kw)) return true;
  }
  if (/москва|питер|петербург|казань|уфа|самара|ростов|краснодар|сочи|крым|екатеринбург|сибирь|урал|волга|кавказ/i.test(full)) {
    return true;
  }
  return false;
}

async function run() {
  console.log('[Rebuild] Загрузка EPG кэша...');
  await epgManager.loadFromCache();

  function hasProgramGuide(tvgId, name) {
    if (!epgManager.byId) return false;
    if (tvgId && epgManager.byId.has(tvgId)) return true;
    const norm = normalizeName(name);
    if (epgManager.byName && epgManager.byName.has(norm)) {
      const targetId = epgManager.byName.get(norm);
      if (epgManager.byId.has(targetId)) return true;
    }
    return false;
  }

  // 1. Извлекаем оригинальные 203 канала Wink из git
  console.log('[Rebuild] Извлечение оригинального каталога Wink (203 канала)...');
  const gitRaw = execSync('git show HEAD~1:data/wink_channels.json', { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });
  const gitData = JSON.parse(gitRaw);
  const rawWinkChannels = gitData.channels || [];
  console.log(`[Rebuild] Получено базовых каналов Wink: ${rawWinkChannels.length}`);

  const masterList = [];
  const seenKeys = new Map(); // normalizedKey -> channelObject
  const seenSlugs = new Set();

  // Добавляем Wink-каналы (они ВСЕГДА СВЕРХУ)
  for (const ch of rawWinkChannels) {
    const norm = normalizeName(ch.baseName || ch.name);
    if (!norm) continue;

    // Фильтруем фиды от 127.0.0.1
    if (Array.isArray(ch.feeds)) {
      ch.feeds = ch.feeds.filter(f => f.url && !f.url.includes('127.0.0.1') && !f.url.includes('localhost'));
    }
    if (!ch.feeds || ch.feeds.length === 0) continue;

    // Проверяем статус EPG
    ch.hasEpg = hasProgramGuide(ch.tvgId, ch.baseName);
    ch.isWink = true;
    ch.hasArchive = true;
    ch.archiveDays = 3;
    ch.sourceType = 'wink';

    // Проверяем HD
    const isHd = ch.isHd || /\bhd\b/i.test(ch.baseName) || ch.feeds.some(f => f.isHd || /\bhd\b/i.test(f.fullName || f.name || ''));
    ch.isHd = isHd;

    let baseSlug = slugify(ch.baseName || ch.name);
    let s = baseSlug;
    let counter = 2;
    while (seenSlugs.has(s)) {
      s = `${baseSlug}-${counter++}`;
    }
    ch.slug = s;
    seenSlugs.add(s);

    masterList.push(ch);
    seenKeys.set(norm, ch);
  }

  console.log(`[Rebuild] Проверенных чистых каналов Wink: ${masterList.length}`);

  // 2. Читаем внешний плейлист (sample_playlist.m3u)
  const samplePath = path.join(__dirname, 'sample_playlist.m3u');
  let addedExternal = 0;
  let skippedRed = 0;
  let skippedAce = 0;
  let skippedUnsure = 0;
  let skippedDuplicate = 0;

  if (fs.existsSync(samplePath)) {
    console.log('[Rebuild] Анализ 3000+ каналов из sample_playlist.m3u...');
    const content = fs.readFileSync(samplePath, 'utf8');
    const lines = content.split(/\r?\n/);

    let curInf = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        curInf = line;
      } else if (line.startsWith('http://') || line.startsWith('https://')) {
        const url = line;
        if (!curInf) continue;

        // Фильтр нерабочих локальных AceStream потоков
        if (url.includes('127.0.0.1') || url.includes('localhost')) {
          skippedAce++;
          continue;
        }

        const nameMatch = curInf.match(/,(.+)$/);
        const name = nameMatch ? nameMatch[1].trim() : '';
        if (!name || /Обновление:|Android TV|Посмотри|INFO|TEST/i.test(name)) continue;

        // Игнорируем технические каналы, начинающиеся на точку
        if (name.startsWith('.')) continue;

        const groupMatch = curInf.match(/group-title="([^"]+)"/i);
        const group = groupMatch ? groupMatch[1].trim() : '';

        // 1. Проверка Красной зоны
        if (isRedZone(name, group)) {
          skippedRed++;
          continue;
        }

        // 2. Проверка уверенности: Зеленая и Желтая зоны
        if (!isGreenOrYellow(name, group)) {
          skippedUnsure++;
          continue;
        }

        const logoMatch = curInf.match(/tvg-logo="([^"]+)"/i);
        const logo = logoMatch ? logoMatch[1].trim() : '';

        const tvgIdMatch = curInf.match(/tvg-id="([^"]+)"/i);
        const tvgId = tvgIdMatch ? tvgIdMatch[1].trim() : '';

        const isHd = /\b(hd|fhd|4k)\b/i.test(name);
        const norm = normalizeName(name);
        if (!norm) continue;

        // Дедупликация
        if (seenKeys.has(norm)) {
          const existing = seenKeys.get(norm);
          if (isHd && existing && Array.isArray(existing.feeds)) {
            const hasHdFeed = existing.feeds.some(f => f.isHd);
            if (!hasHdFeed) {
              existing.feeds.push({
                name: `${existing.baseName || existing.name} HD`,
                url: url,
                timezoneShift: 0,
                isHd: true,
                isExternal: true
              });
              existing.isHd = true;
            }
          }
          skippedDuplicate++;
          continue;
        }

        const hasEpg = hasProgramGuide(tvgId, name);

        let baseSlug = slugify(name);
        let s = baseSlug;
        let counter = 2;
        while (seenSlugs.has(s)) {
          s = `${baseSlug}-${counter++}`;
        }
        seenSlugs.add(s);

        const newChan = {
          id: `ext_${masterList.length + 1}`,
          baseName: name,
          name: name,
          group: group || 'Эфирные',
          logo: logo || '',
          tvgId: tvgId || name,
          slug: s,
          hasArchive: false,
          archiveDays: 0,
          isWink: false,
          sourceType: 'open_stream',
          hasEpg: hasEpg,
          isHd: isHd,
          feeds: [
            {
              name: name,
              url: url,
              timezoneShift: 0,
              isHd: isHd
            }
          ]
        };

        masterList.push(newChan);
        seenKeys.set(norm, newChan);
        addedExternal++;
      }
    }
  }

  console.log(`[Rebuild] Статистика фильтрации:`);
  console.log(`  - Отклонено каналов Красной зоны: ${skippedRed}`);
  console.log(`  - Отклонено нерабочих AceStream потоков (127.0.0.1): ${skippedAce}`);
  console.log(`  - Отклонено неуверенных/сомнительных: ${skippedUnsure}`);
  console.log(`  - Пропущено дубликатов: ${skippedDuplicate}`);
  console.log(`  - Добавлено уникальных чистых каналов: ${addedExternal}`);

  // 3. СОРТИРОВКА
  // Приоритет 1: Wink каналы строго СВЕРХУ.
  //   Внутри Wink: LCN вес (Первый канал, Россия 1, Матч, НТВ, Пятый, Культура, Россия 24, Карусель, ОТР, ТВЦ...), затем по алфавиту.
  // Приоритет 2: Внешние каналы С ПРОГРАММОЙ ПЕРЕДАЧ (hasEpg = true).
  // Приоритет 3: Внешние каналы БЕЗ программы передач (в самом низу).
  masterList.sort((a, b) => {
    // Wink всегда выше внешних
    if (a.isWink && !b.isWink) return -1;
    if (!a.isWink && b.isWink) return 1;

    if (a.isWink && b.isWink) {
      const wa = getChannelLcnWeight(a.baseName || a.name);
      const wb = getChannelLcnWeight(b.baseName || b.name);
      if (wa !== wb) return wa - wb;
      return (a.baseName || a.name).localeCompare(b.baseName || b.name, 'ru');
    }

    // Внешние: Сначала с EPG
    if (a.hasEpg && !b.hasEpg) return -1;
    if (!a.hasEpg && b.hasEpg) return 1;

    // Внутри группы: LCN вес или алфавит
    const wa = getChannelLcnWeight(a.baseName || a.name);
    const wb = getChannelLcnWeight(b.baseName || b.name);
    if (wa !== wb) return wa - wb;

    return (a.baseName || a.name).localeCompare(b.baseName || b.name, 'ru');
  });

  console.log(`[Rebuild] Итого в каталоге: ${masterList.length} каналов.`);
  console.log(`  - Wink с архивом (сверху): ${masterList.filter(c => c.isWink).length}`);
  console.log(`  - С программой передач (EPG): ${masterList.filter(c => c.hasEpg).length}`);
  console.log(`  - Без телепрограммы (внизу): ${masterList.filter(c => !c.hasEpg).length}`);
  console.log(`  - С HD качеством: ${masterList.filter(c => c.isHd).length}`);

  // Выведем первые 10 каналов для контроля
  console.log('[Rebuild] Топ-10 каналов в каталоге:');
  masterList.slice(0, 10).forEach((c, idx) => {
    console.log(`  ${idx + 1}. ${c.baseName} [${c.isWink ? 'Wink' : 'Open'}] [EPG: ${c.hasEpg}] [HD: ${c.isHd}]`);
  });

  const targetFile = path.join(__dirname, 'data', 'wink_channels.json');
  fs.writeFileSync(targetFile, JSON.stringify({
    totalChannels: masterList.length,
    updatedAt: Date.now(),
    channels: masterList
  }, null, 2), 'utf8');

  console.log(`[Rebuild] Файл ${targetFile} успешно записан!`);
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
