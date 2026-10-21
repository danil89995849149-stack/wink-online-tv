'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let openSourceLogos = {};

try {
  const logosPath = path.join(__dirname, '..', 'public', 'vendor', 'external_logos.js');
  if (fs.existsSync(logosPath)) {
    const code = fs.readFileSync(logosPath, 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    openSourceLogos = sandbox.window.OPEN_SOURCE_LOGOS || {};
    console.log(`[LogoProvider] Загружена база логотипов open source: ${Object.keys(openSourceLogos).length} лого`);
  }
} catch (e) {
  console.warn('[LogoProvider] Ошибка загрузки external_logos.js:', e.message);
}

// Прямой проверенный словарь официальных качественных логотипов для ведущих телеканалов РФ
const OFFICIAL_LOGOS = {
  'первыйканал': 'https://iptvx.one/picons/pervy.png',
  'первый': 'https://iptvx.one/picons/pervy.png',
  '1tv': 'https://iptvx.one/picons/pervy.png',
  
  'россия1': 'https://iptvx.one/picons/rossia1.png',
  'россия': 'https://iptvx.one/picons/rossia1.png',
  'russia1': 'https://iptvx.one/picons/rossia1.png',
  
  'россия24': 'https://iptvx.one/picons/rossia-24.png',
  'вести24': 'https://iptvx.one/picons/rossia-24.png',
  
  'россияк': 'https://iptvx.one/picons/kultura.png',
  'россиякультура': 'https://iptvx.one/picons/kultura.png',
  'культура': 'https://iptvx.one/picons/kultura.png',
  
  'матчтв': 'https://iptvx.one/picons/match-tv.png',
  'матч': 'https://iptvx.one/picons/match-tv.png',
  'match': 'https://iptvx.one/picons/match-tv.png',
  
  'нтв': 'https://iptvx.one/picons/ntv.png',
  'ntv': 'https://iptvx.one/picons/ntv.png',
  
  'пятыйканал': 'https://iptvx.one/picons/5kanal-ru.png',
  'пятый': 'https://iptvx.one/picons/5kanal-ru.png',
  '5канал': 'https://iptvx.one/picons/5kanal-ru.png',
  
  'отр': 'https://iptvx.one/picons/otr.png',
  'общественноетелевидениероссии': 'https://iptvx.one/picons/otr.png',
  
  'твцентр': 'https://iptvx.one/picons/tvc-ru.png',
  'твц': 'https://iptvx.one/picons/tvc-ru.png',
  
  'рентв': 'https://iptvx.one/picons/rentv.png',
  'рен': 'https://iptvx.one/picons/rentv.png',
  
  'спас': 'https://iptvx.one/picons/spas.png',
  
  'стс': 'https://iptvx.one/picons/sts.png',
  'sts': 'https://iptvx.one/picons/sts.png',
  
  'стсlove': 'https://iptvx.one/picons/sts-love.png',
  
  'домашний': 'https://iptvx.one/picons/domashny.png',
  'домашнийтв': 'https://iptvx.one/picons/domashny.png',
  
  'тв3': 'https://iptvx.one/picons/tv3-ru.png',
  'тв-3': 'https://iptvx.one/picons/tv3-ru.png',
  
  'пятница': 'https://iptvx.one/picons/piatnica.png',
  'пятница!': 'https://iptvx.one/picons/piatnica.png',
  
  'звезда': 'https://iptvx.one/picons/zvezda.png',
  
  'мир': 'https://iptvx.one/picons/mir.png',
  'мир24': 'https://iptvx.one/picons/mir-24.png',
  
  'тнт': 'https://iptvx.one/picons/tnt.png',
  'tnt': 'https://iptvx.one/picons/tnt.png',
  
  'тнт4': 'https://iptvx.one/picons/tnt4.png',
  
  'музтв': 'https://iptvx.one/picons/muztv.png',
  'муз': 'https://iptvx.one/picons/muztv.png',
  
  'карусель': 'https://iptvx.one/picons/karusel.png',
  
  'солнце': 'https://iptvx.one/picons/solnce.png',
  '2x2': 'https://iptvx.one/picons/2x2.png',
  'че': 'https://iptvx.one/picons/che.png',
  'че!': 'https://iptvx.one/picons/che.png',
  'суббота': 'https://iptvx.one/picons/subbota.png',
  'ю': 'https://iptvx.one/picons/u-tv.png',
  'ютв': 'https://iptvx.one/picons/u-tv.png',
  
  'рбк': 'https://iptvx.one/picons/rbc.png',
  'москва24': 'https://iptvx.one/picons/moskva24.png',
  '360': 'https://iptvx.one/picons/360-podmoskove.png',
  'известия': 'https://iptvx.one/picons/izvestia.png',
  
  'кинотв': 'https://iptvx.one/picons/kino-tv.png',
  'киномикс': 'https://iptvx.one/picons/kinomiks.png',
  'домкино': 'https://iptvx.one/picons/dom-kino.png',
  'мосфильм': 'https://iptvx.one/picons/mosfilm.png',
  'кинокомедия': 'https://iptvx.one/picons/kinokomediya.png',
  'киносемья': 'https://iptvx.one/picons/kinosemya.png',
  'кинохит': 'https://iptvx.one/picons/kinohit.png',
  'кинопремьера': 'https://iptvx.one/picons/kinopremiera.png',
  'киносвидание': 'https://iptvx.one/picons/kinosvidanie.png',
  'русскийиллюзион': 'https://iptvx.one/picons/rus-illusion.png',
  'иллюзионплюс': 'https://iptvx.one/picons/illusion-plus.png',
  'русскийроман': 'https://iptvx.one/picons/russkiy-roman.png',
  'русскийдетектив': 'https://iptvx.one/picons/russkiy-detektiv.png',
  
  'мульт': 'https://iptvx.one/picons/mult.png',
  'мультимузыка': 'https://iptvx.one/picons/multimusic.png',
  'детскиймир': 'https://iptvx.one/picons/detskiy-mir.png',
  'вгостяхусказки': 'https://iptvx.one/picons/v-gostyah-u-skazki.png',
  'капитанфантастика': 'https://iptvx.one/picons/captain-fantastic.png',
  'о': 'https://iptvx.one/picons/o.png',
  'рыжий': 'https://iptvx.one/picons/ryzhiy.png',
  
  'мояпланета': 'https://iptvx.one/picons/moya-planeta.png',
  'живаяпланета': 'https://iptvx.one/picons/zhivaya-planeta.png',
  'наука': 'https://iptvx.one/picons/nauka.png',
  'история': 'https://iptvx.one/picons/istoriya.png',
  'доктор': 'https://iptvx.one/picons/doktor.png',
  'оружие': 'https://iptvx.one/picons/oruzhie.png',
  'охотаирыбалка': 'https://iptvx.one/picons/ohota-i-rybalka.png',
  'т24': 'https://iptvx.one/picons/t24.png',
  'поехали': 'https://iptvx.one/picons/poehali.png',
  'бобер': 'https://iptvx.one/picons/bober.png',
  
  'кхлтв': 'https://iptvx.one/picons/khl.png',
  'кхл': 'https://iptvx.one/picons/khl.png',
  'матчпремьер': 'https://iptvx.one/picons/match-premier.png',
  'матчфутбол1': 'https://iptvx.one/picons/match-futbol1.png',
  'матчфутбол2': 'https://iptvx.one/picons/match-futbol2.png',
  'матчфутбол3': 'https://iptvx.one/picons/match-futbol3.png',
  'матчбоец': 'https://iptvx.one/picons/match-boec.png',
  'старт': 'https://iptvx.one/picons/start-tv.png',
  
  'europa-plus-tv': 'https://iptvx.one/picons/europa-plus-tv.png',
  'европаплюств': 'https://iptvx.one/picons/europa-plus-tv.png',
  'рутв': 'https://iptvx.one/picons/rutv.png',
  'rutv': 'https://iptvx.one/picons/rutv.png',
  'bridgetv': 'https://iptvx.one/picons/bridge-tv.png',
  'бриджтв': 'https://iptvx.one/picons/bridge-tv.png',
  'шансонтв': 'https://iptvx.one/picons/shanson-tv.png',
  'жаратв': 'https://iptvx.one/picons/zhara.png',
  'ля-минор': 'https://iptvx.one/picons/la-minor.png',
  
  'краснаялиния': 'https://iptvx.one/picons/krasnaya-liniya.png',
  'каминтв': 'https://iptvx.one/picons/kamin-tv.png',
  'губерния': 'https://iptvx.one/picons/guberniya.png',
  'репортер73': 'https://iptvx.one/picons/reporter73.png'
};

function normalizeNameForLogo(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\(\s*[+-]?\s*\d+[^)]*\)/gi, '')
    .replace(/[+-]\s*\d+\b/gi, '')
    .replace(/\b(hd|fhd|4k|uhd|sd)\b/gi, '')
    .replace(/[^a-zа-я0-9]/gi, '')
    .trim();
}

function wrapLogoUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const match = url.match(/picons\/([^/?#]+\.(?:png|svg|jpg|webp))/i);
  if (match) {
    return `/api/logo?file=${encodeURIComponent(match[1])}`;
  }
  return url;
}

function getLogoForChannel(channelName, existingLogo = null) {
  // 1. Если уже есть рабочий логотип в плейлисте (не заглушка)
  if (existingLogo && typeof existingLogo === 'string' && existingLogo.trim().startsWith('http')) {
    return wrapLogoUrl(existingLogo.trim());
  }

  const norm = normalizeNameForLogo(channelName);
  if (!norm) return '';

  // 2. Проверяем точный словарь официальных логотипов
  if (OFFICIAL_LOGOS[norm]) {
    return wrapLogoUrl(OFFICIAL_LOGOS[norm]);
  }

  // 3. Проверяем без "тв" / "канал"
  const superNorm = norm.replace(/\b(tv|тв|канал)\b/gi, '').replace(/^(tv|тв)/gi, '').replace(/(tv|тв|канал)$/gi, '');
  if (superNorm && OFFICIAL_LOGOS[superNorm]) {
    return wrapLogoUrl(OFFICIAL_LOGOS[superNorm]);
  }

  // 4. Проверяем открытую базу openSourceLogos
  if (openSourceLogos[norm]) {
    return wrapLogoUrl(openSourceLogos[norm]);
  }
  if (superNorm && openSourceLogos[superNorm]) {
    return wrapLogoUrl(openSourceLogos[superNorm]);
  }

  // 5. Нечеткий поиск по базе
  for (const [k, url] of Object.entries(openSourceLogos)) {
    if (k.length >= 4 && (norm.startsWith(k) || k.startsWith(norm))) {
      return wrapLogoUrl(url);
    }
  }

  return '';
}

module.exports = {
  getLogoForChannel,
  OFFICIAL_LOGOS
};
