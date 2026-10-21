'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');

const config = require('./config');
const playlistManager = require('./playlist_manager');
const epgManager = require('./epg_manager');
const { handleProxyRequest, CORS_HEADERS } = require('./hls_proxy');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, statusCode, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  const body = Buffer.from(String(text), 'utf8');
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  // Защита от выхода за пределы public
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(config.PUBLIC_DIR, safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(config.PUBLIC_DIR, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    return sendText(res, 404, '404: Файл не найден');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  const stream = fs.createReadStream(filePath);
  const acceptEncoding = req.headers['accept-encoding'] || '';

  const headers = {
    ...CORS_HEADERS,
    'Content-Type': mimeType,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  if (/\bgzip\b/.test(acceptEncoding) && (mimeType.startsWith('text/') || mimeType.includes('javascript') || mimeType.includes('json'))) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    stream.pipe(zlib.createGzip()).pipe(res);
  } else {
    res.writeHead(200, headers);
    stream.pipe(res);
  }
}

// Локальный кэш и отдача логотипов
async function serveLogo(req, res, parsedUrl) {
  const fileName = parsedUrl.searchParams.get('file');
  if (!fileName || !/^[a-z0-9\-_.]+\.(png|svg|jpg|webp)$/i.test(fileName)) {
    return sendText(res, 400, 'Invalid logo file name');
  }

  const logosDir = path.join(config.PUBLIC_DIR, 'logos');
  if (!fs.existsSync(logosDir)) {
    fs.mkdirSync(logosDir, { recursive: true });
  }

  const localFile = path.join(logosDir, fileName);
  if (fs.existsSync(localFile)) {
    const stat = fs.statSync(localFile);
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'image/png',
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=604800'
    });
    return fs.createReadStream(localFile).pipe(res);
  }

  // Скачивание с iptvx.one без Referer
  const upstreamUrl = `https://iptvx.one/picons/${fileName}`;
  try {
    const upRes = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (upRes.ok) {
      const arrBuf = await upRes.arrayBuffer();
      const buf = Buffer.from(arrBuf);
      fs.writeFileSync(localFile, buf);
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': 'image/png',
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=604800'
      });
      return res.end(buf);
    }
  } catch (err) {
    console.warn(`[Logo] Ошибка загрузки логотипа ${fileName}:`, err.message);
  }

  return sendText(res, 404, 'Logo not found');
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Стриминговый прокси /p
  if (pathname === '/p') {
    return handleProxyRequest(req, res);
  }

  // 1.1. Локальный прокси логотипов /api/logo
  if (pathname === '/api/logo') {
    return serveLogo(req, res, parsedUrl);
  }

  // 1.2. Прямое скачивание установщика ПК-приложения
  if (pathname === '/download' || pathname === '/downloads/OnlineTV_Yandex_Setup.exe' || pathname === '/OnlineTV_Yandex_Setup.exe') {
    const appFile = path.join(__dirname, '..', 'OnlineTV_Yandex_Setup.exe');
    if (fs.existsSync(appFile)) {
      const stat = fs.statSync(appFile);
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': 'application/vnd.microsoft.portable-executable',
        'Content-Disposition': 'attachment; filename="OnlineTV_Yandex_Setup.exe"',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=86400'
      });
      return fs.createReadStream(appFile).pipe(res);
    } else {
      return sendText(res, 404, 'Файл установщика не найден');
    }
  }

  // 2. API Channels
  if (pathname === '/api/channels') {
    if (req.method === 'GET') {
      const channels = playlistManager.getAllChannels();
      return sendJson(res, 200, {
        success: true,
        updatedAt: playlistManager.lastUpdated,
        totalChannels: channels.length,
        channels: channels
      });
    }
  }

  // 3. API EPG
  if (pathname === '/api/epg') {
    if (req.method === 'GET') {
      const tvgId = parsedUrl.searchParams.get('tvgId') || parsedUrl.searchParams.get('id') || '';
      const name = parsedUrl.searchParams.get('name') || '';
      const date = parsedUrl.searchParams.get('date') || null;
      const tzOffsetStr = parsedUrl.searchParams.get('tzOffset');
      const tzOffset = tzOffsetStr !== null && tzOffsetStr !== undefined ? parseFloat(tzOffsetStr) : null;

      const programs = epgManager.getPrograms(tvgId, name, date, tzOffset);
      return sendJson(res, 200, {
        success: true,
        tvgId,
        channelName: name,
        date,
        totalPrograms: programs.length,
        programs: programs
      });
    }
  }

  // 4. API Current EPG
  if (pathname === '/api/epg/current') {
    if (req.method === 'GET') {
      const channels = playlistManager.getAllChannels();
      const currentMap = epgManager.getCurrentPrograms(channels);
      return sendJson(res, 200, {
        success: true,
        currentPrograms: currentMap
      });
    }
  }

  // 5. API Refresh Playlist
  if (pathname === '/api/playlist/refresh') {
    if (req.method === 'POST' || req.method === 'GET') {
      try {
        await playlistManager.refresh();
        return sendJson(res, 200, {
          success: true,
          message: 'База телеканалов успешно обновлена',
          totalChannels: playlistManager.getAllChannels().length
        });
      } catch (err) {
        return sendJson(res, 500, {
          success: false,
          error: err.message
        });
      }
    }
  }

  // 6. API Refresh EPG
  if (pathname === '/api/epg/refresh') {
    if (req.method === 'POST' || req.method === 'GET') {
      epgManager.refresh().catch(e => console.error(e));
      return sendJson(res, 200, {
        success: true,
        message: 'Фоновое обновление EPG запущено'
      });
    }
  }

  // 7. API Status
  if (pathname === '/api/status') {
    return sendJson(res, 200, {
      playlist: playlistManager.getStatus(),
      epg: epgManager.getStatus(),
      serverUptime: Math.floor(process.uptime()),
      timestamp: Date.now()
    });
  }

  // 8. Раздача статики
  serveStatic(req, res, pathname);
});

function startServer() {
  playlistManager.init();
  epgManager.init();

  server.listen(config.PORT, config.HOST, () => {
    console.log(`=======================================================`);
    console.log(`   ЭФИР ТВ — ОНЛАЙН ТЕЛЕВИДЕНИЕ С АРХИВОМ ПЕРЕДАЧ      `);
    console.log(`   Сервер запущен: http://localhost:${config.PORT}        `);
    console.log(`=======================================================`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { server, startServer };
