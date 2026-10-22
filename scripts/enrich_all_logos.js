'use strict';

const fs = require('fs');
const path = require('path');

// 1. Читаем wink_channels.json
const channelsPath = path.join(__dirname, '..', 'data', 'wink_channels.json');
const channelsData = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));

// 2. Читаем базу open source логотипов
const logosPath = path.join(__dirname, '..', 'public', 'vendor', 'external_logos.js');
let openSourceLogos = {};
if (fs.existsSync(logosPath)) {
  const content = fs.readFileSync(logosPath, 'utf8');
  const m = content.match(/window\.OPEN_SOURCE_LOGOS\s*=\s*(\{[\s\S]*?\});/);
  if (m) {
    try {
      openSourceLogos = JSON.parse(m[1]);
    } catch (e) {
      console.warn('Ошибка парсинга JSON логотипов:', e.message);
    }
  }
}
console.log(`[Logos] Загружено из external_logos.js: ${Object.keys(openSourceLogos).length} логотипов`);

const logoAliases = {
  'первыйканал': 'первый',
  '1канал': 'первый',
  'россия1': 'россия',
  'россия1hd': 'россия',
  'россияhd': 'россия',
  'россияк': 'культура',
  'россиякультура': 'культура',
  'твц': 'твцентр',
  'твцентр': 'твцентр',
  'пятый': 'пятыйканал',
  '5канал': 'пятыйканал',
  'зоопарк': 'zoopark',
  'mtvrus': 'mtvrussia',
  'синема': 'cinema',
  'осетияиристон': 'осетияирыстон',
  'trtsport': 'trtspor',
  'viasatsort': 'viasatsport',
  'extremesortchannel': 'extremesportchannel',
  'мирбаскетболла': 'мирбаскетбола',
  'кхл': 'khl',
  'кхлтв': 'khl',
  'стс': 'ctc',
  'тнт': 'tnt',
  'рен': 'rentv',
  'рентв': 'rentv',
  'спас': 'spas',
  'звезда': 'zvezda',
  'мир': 'mirtv',
  'карусель': 'karusel',
  'музтв': 'muztv',
  'ю': 'u',
  'че': 'che',
  'солнце': 'solnce',
  'суббота': 'subbota',
  '2х2': '2x2',
  'пятница': 'friday',
  'домашний': 'domashniy',
  'тв3': 'tv3'
};

function cleanName(n) {
  let s = (n || '').toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\(\s*\+\s*\d+.*?\)/gi, '')
    .replace(/\+\s*\d+\b/gi, '')
    .replace(/\+/g, 'плюс')
    .replace(/\b(hd|fhd|4k|sd|hevc|50fps|v2|эфир|wink)\b/gi, '')
    .replace(/[^a-zа-я0-9]/gi, '')
    .trim();
  if (logoAliases[s]) s = logoAliases[s];
  return s;
}

function superCleanName(n) {
  const s = cleanName(n);
  const s2 = s.replace(/\b(tv|тв|канал)\b/gi, '').replace(/^(tv|тв)/gi, '').replace(/(tv|тв|канал)$/gi, '');
  if (s2.length >= 3) return s2;
  return s;
}

// 3. Собираем логотипы из sample_playlist.m3u
const playlistLogos = new Map();
const samplePath = path.join(__dirname, '..', 'sample_playlist.m3u');
if (fs.existsSync(samplePath)) {
  const lines = fs.readFileSync(samplePath, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      const nameMatch = line.match(/,(.+)$/);
      if (logoMatch && nameMatch) {
        const logo = logoMatch[1].trim();
        const name = nameMatch[1].trim();
        if (logo && name) {
          playlistLogos.set(name.toLowerCase(), logo);
          const cleanKey = cleanName(name);
          if (cleanKey && !playlistLogos.has(cleanKey)) {
            playlistLogos.set(cleanKey, logo);
          }
        }
      }
    }
  }
  console.log(`[Logos] Собрано из sample_playlist.m3u: ${playlistLogos.size} уникальных пар`);
}


// Генератор премиального векторного SVG логотипа для редких каналов
function generateSvgLogo(channelName) {
  const cleanTitle = (channelName || 'ТВ')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-zа-я0-9\s]/gi, '')
    .trim();

  const words = cleanTitle.split(/\s+/).filter(Boolean);
  let initials = '';
  if (words.length >= 2) {
    initials = (words[0][0] + words[1][0]).toUpperCase();
  } else if (cleanTitle.length >= 3) {
    initials = cleanTitle.substring(0, 3).toUpperCase();
  } else {
    initials = cleanTitle.toUpperCase();
  }

  // Детерминированный приятный градиент на основе названия
  let hash = 0;
  for (let i = 0; i < cleanTitle.length; i++) {
    hash = cleanTitle.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [210, 260, 280, 330, 160, 190, 30];
  const h1 = hues[Math.abs(hash) % hues.length];
  const h2 = (h1 + 40) % 360;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <linearGradient id="grad_${Math.abs(hash)}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${h1}, 75%, 45%)" />
      <stop offset="100%" stop-color="hsl(${h2}, 85%, 25%)" />
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="24" fill="url(#grad_${Math.abs(hash)})" />
  <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" />
  <text x="50%" y="54%" font-family="system-ui, -apple-system, Roboto, sans-serif" font-size="34" font-weight="900" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${initials}</text>
  <rect x="36" y="86" width="48" height="6" rx="3" fill="rgba(255,255,255,0.4)" />
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

let fromCurrent = 0;
let fromPlaylist = 0;
let fromOpenSource = 0;
let generatedSvg = 0;

for (const ch of channelsData.channels) {
  // 1. Уже был логотип
  if (ch.logo && ch.logo.startsWith('http')) {
    fromCurrent++;
    continue;
  }

  const name = ch.baseName || ch.name || '';
  const rawKey = name.toLowerCase();
  const cKey = cleanName(name);
  const sKey = superCleanName(name);

  // 2. Ищем в плейлисте
  let found = playlistLogos.get(rawKey) || playlistLogos.get(cKey) || playlistLogos.get(sKey);
  if (found) {
    ch.logo = found;
    fromPlaylist++;
    continue;
  }

  // 3. Ищем в базе OPEN_SOURCE_LOGOS
  found = openSourceLogos[cKey] || openSourceLogos[sKey] || openSourceLogos[rawKey];
  if (!found) {
    // Пробуем латинский транслит
    const ruToEn = {
      'первый': 'pervyy', 'россия': 'rossiya', 'канал': 'kanal', 'новости': 'news', 'тв': 'tv'
    };
    let trKey = cKey;
    for (const [r, e] of Object.entries(ruToEn)) {
      trKey = trKey.replace(new RegExp(r, 'g'), e);
    }
    found = openSourceLogos[trKey];
  }

  if (found) {
    ch.logo = found;
    fromOpenSource++;
    continue;
  }

  // 4. Генерируем премиальный SVG логотип для редкого канала
  ch.logo = generateSvgLogo(name);
  generatedSvg++;
}

console.log(`[Logos] Итоги обогащения 730 каналов:`);
console.log(`  - Сохранено существующих логотипов: ${fromCurrent}`);
console.log(`  - Подтянуто из sample_playlist.m3u: ${fromPlaylist}`);
console.log(`  - Найдено в базе OPEN_SOURCE_LOGOS: ${fromOpenSource}`);
console.log(`  - Создано брендовых SVG логотипов: ${generatedSvg}`);

// Сохраняем обновленный файл
channelsData.updatedAt = Date.now();
fs.writeFileSync(channelsPath, JSON.stringify(channelsData, null, 2), 'utf8');
console.log(`[Logos] Обновленный каталог успешно сохранен в ${channelsPath}!`);
