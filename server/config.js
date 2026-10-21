'use strict';

const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 8900;
const HOST = process.env.HOST || '0.0.0.0';

const PLAYLIST_REMOTE_URL = process.env.PLAYLIST_URL || 'https://raw.githubusercontent.com/Dimonovich/TV/Dimonovich/FREE/TV';
const PLAYLIST_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // раз в сутки (24 часа)

const EPG_REMOTE_SOURCES = [
  'https://iptvx.one/EPG',
  'http://epg.iptvx.one/epg.xml.gz',
  'https://epg.it999.ru/edem.xml.gz'
];
const EPG_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // каждые 6 часов

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const DEFAULT_WINK_UA = 'WINK/1.130.1 (AndroidTV/9) HlsWinkPlayer';

module.exports = {
  PORT,
  HOST,
  PLAYLIST_REMOTE_URL,
  PLAYLIST_REFRESH_INTERVAL_MS,
  EPG_REMOTE_SOURCES,
  EPG_REFRESH_INTERVAL_MS,
  DATA_DIR,
  CACHE_DIR,
  PUBLIC_DIR,
  DEFAULT_WINK_UA
};
