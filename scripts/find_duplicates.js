const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/wink_channels.json', 'utf8'));
const chs = data.channels || [];

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[!?,.:;"'«»()\-—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKeyStrict(name) {
  // Убираем HD / FHD / SD и пунктуацию
  return String(name || '')
    .toLowerCase()
    .replace(/\b(fhd|hd|sd|4k)\b/gi, '')
    .replace(/[!?,.:;"'«»()\-—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

console.log('=== 1. ТОЧНЫЕ СОВПАДЕНИЯ (БЕЗ ЗНАКОВ ПРЕПИНАНИЯ И РЕГИСТРА) ===');
const map1 = new Map();
chs.forEach(c => {
  const k = normalizeName(c.baseName || c.name);
  if (!map1.has(k)) map1.set(k, []);
  map1.get(k).push(c);
});
let exactDupesCount = 0;
for (const [k, list] of map1.entries()) {
  if (list.length > 1) {
    exactDupesCount++;
    console.log(`[ДУБЛЬ] "${k}":`, list.map(c => `[${c.id}] ${c.baseName} (Wink:${c.isWink}, HD:${c.isHd})`).join(' vs '));
  }
}
console.log('Всего точных дубликатов:', exactDupesCount);

console.log('\n=== 2. СОВПАДЕНИЯ С УЧЕТОМ HD/SD ===');
const map2 = new Map();
chs.forEach(c => {
  const k = normalizeKeyStrict(c.baseName || c.name);
  if (!map2.has(k)) map2.set(k, []);
  map2.get(k).push(c);
});
let hdDupesCount = 0;
for (const [k, list] of map2.entries()) {
  if (list.length > 1) {
    hdDupesCount++;
    console.log(`[HD/SD ДУБЛЬ] "${k}":`, list.map(c => `[${c.id}] ${c.baseName}`).join(' vs '));
  }
}
console.log('Всего HD/SD дубликатов:', hdDupesCount);
