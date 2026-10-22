'use strict';

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'wink_channels.json');
const raw = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(raw);
const chs = data.channels || [];

console.log(`Исходное количество каналов: ${chs.length}`);

// 1. Определение признака часового пояса
function hasTimeShift(name) {
  return /(?:\s*\+\s*[0-9]+|\s*\(\s*\+[0-9]+\s*\)|\s*мск\s*\+[0-9]+|\s*utc\s*\+[0-9]+)/i.test(name || '');
}

// 2. Нормализация для дедупликации
function getDedupeKey(ch) {
  let name = (ch.baseName || ch.name || '').trim();
  // Если у канала есть часовой сдвиг, сохраняем его в ключе, чтобы не схлопнуть +4 и +7
  const isTz = hasTimeShift(name);
  
  let key = name
    .toLowerCase()
    .replace(/\b(fhd|hd|sd|4k)\b/gi, '')
    .replace(/[!?,.:;"'«»()\-—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (isTz) {
    const tzMatch = name.match(/(?:\+\s*[0-9]+|\(\+[0-9]+\)|мск\s*\+[0-9]+)/i);
    const tz = tzMatch ? tzMatch[0].replace(/\s+/g, '') : '';
    key += '_' + tz;
  }

  return key;
}

// 3. Дедупликация
const uniqueMap = new Map();
let mergedCount = 0;

for (const ch of chs) {
  const key = getDedupeKey(ch);
  if (!uniqueMap.has(key)) {
    uniqueMap.set(key, ch);
  } else {
    // Уже есть канал с таким ключом — объединяем лучший
    const existing = uniqueMap.get(key);
    mergedCount++;

    // Выбираем лучший канал: HD > Wink > EPG > логотип
    let primary = existing;
    let secondary = ch;

    const existingScore = (existing.isHd ? 10 : 0) + (existing.isWink ? 5 : 0) + (existing.hasEpg ? 2 : 0) + (existing.logo ? 1 : 0);
    const newScore = (ch.isHd ? 10 : 0) + (ch.isWink ? 5 : 0) + (ch.hasEpg ? 2 : 0) + (ch.logo ? 1 : 0);

    if (newScore > existingScore) {
      primary = ch;
      secondary = existing;
      uniqueMap.set(key, primary);
    }

    // Сливаем feeds
    const feeds = primary.feeds || [];
    const secFeeds = secondary.feeds || [];
    for (const f of secFeeds) {
      if (!feeds.some(ef => ef.url === f.url)) {
        feeds.push(f);
      }
    }
    primary.feeds = feeds;

    // Сохраняем лучший логотип
    if (!primary.logo && secondary.logo) {
      primary.logo = secondary.logo;
    }
    if (secondary.hasArchive && !primary.hasArchive) {
      primary.hasArchive = true;
    }

    console.log(`Объединен дубликат: "${secondary.baseName}" -> "${primary.baseName}"`);
  }
}

const deduplicated = Array.from(uniqueMap.values());
console.log(`После дедупликации: ${deduplicated.length} каналов (объединено дублей: ${mergedCount})`);

// 4. Разделение на основные каналы и каналы с часовыми поясами
const mainChannels = [];
const tzChannels = [];

for (const ch of deduplicated) {
  if (hasTimeShift(ch.baseName || ch.name)) {
    tzChannels.push(ch);
  } else {
    mainChannels.push(ch);
  }
}

console.log(`Основных каналов: ${mainChannels.length}`);
console.log(`Каналов с часовым поясом (перемещены вниз): ${tzChannels.length}`);
console.log('Список каналов с часовым поясом:', tzChannels.map(c => c.baseName));

// Итоговый отсортированный список: основные каналы сверху, каналы с часовым поясом строго внизу
const finalChannels = [...mainChannels, ...tzChannels];

data.channels = finalChannels;
data.updatedAt = Date.now();

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Файл ${filePath} успешно сохранен. Итого каналов: ${finalChannels.length}`);
