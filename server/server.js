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

function serveRobotsTxt(req, res) {
  const host = req.headers.host || 'localhost:8900';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const robots = `User-agent: *
Allow: /
Allow: /channel/
Disallow: /p
Disallow: /api/

Sitemap: ${protocol}://${host}/sitemap.xml
`;
  res.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=86400'
  });
  res.end(robots);
}

function serveSitemapXml(req, res) {
  const host = req.headers.host || 'localhost:8900';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const channels = playlistManager.getAllChannels();
  const dateStr = new Date().toISOString().split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${protocol}://${host}/</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

  for (const ch of channels) {
    const slug = ch.slug || ch.id;
    xml += `
  <url>
    <loc>${protocol}://${host}/channel/${slug}</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  xml += `\n</urlset>`;

  res.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600'
  });
  res.end(xml);
}

function serveChannelPage(req, res, slug) {
  const channel = playlistManager.getChannelBySlugOrId(slug);
  const indexPath = path.join(config.PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return sendText(res, 404, '404: Not found');
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  if (channel) {
    const host = req.headers.host || 'localhost:8900';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const pageUrl = `${protocol}://${host}/channel/${channel.slug}`;
    const logoUrl = channel.logo ? `${protocol}://${host}/api/logo?file=${encodeURIComponent(channel.logo)}` : `${protocol}://${host}/favicon.ico`;

    const channelName = channel.baseName || channel.name || 'Телеканал';
    const channelTitle = `${channelName} смотреть онлайн прямой эфир бесплатно в хорошем качестве HD — Эфир ТВ`;
    const channelDesc = `Смотрите телеканал ${channelName} онлайн в прямом эфире и в архиве передач до 3 суток. Бесплатный просмотр, актуальная программа передач, умная перемотка.`;

    const schemaJson = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BroadcastEvent",
      "name": `Прямой эфир: ${channelName}`,
      "isLiveBroadcast": true,
      "startDate": new Date().toISOString(),
      "video": {
        "@type": "VideoObject",
        "name": `${channelName} онлайн`,
        "description": channelDesc,
        "thumbnailUrl": logoUrl,
        "uploadDate": new Date().toISOString()
      }
    });

    html = html.replace(/<title>.*?<\/title>/i, `<title>${channelTitle}</title>`);
    html = html.replace(/<meta name="description" content=".*?"\s*\/?>/i, `<meta name="description" content="${channelDesc}">`);

    const extraHead = `
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:title" content="${channelTitle}">
  <meta property="og:description" content="${channelDesc}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:type" content="video.other">
  <meta property="og:image" content="${logoUrl}">
  <script type="application/ld+json">${schemaJson}</script>
  <script>window.INITIAL_CHANNEL_SLUG = "${channel.slug}"; window.INITIAL_CHANNEL_ID = "${channel.id}";</script>
`;
    html = html.replace('</head>', `${extraHead}\n</head>`);
  }

  res.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 0. SEO: robots.txt и sitemap.xml
  if (pathname === '/robots.txt') {
    return serveRobotsTxt(req, res);
  }
  if (pathname === '/sitemap.xml') {
    return serveSitemapXml(req, res);
  }

  // 0.1 SEO Посадочные страницы каналов /channel/:slug
  if (pathname.startsWith('/channel/')) {
    const slug = pathname.replace('/channel/', '').replace(/\/$/, '');
    return serveChannelPage(req, res, slug);
  }

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

server.on('clientError', (err, socket) => {
  if (err.code === 'HPE_INVALID_METHOD' || err.code === 'ECONNRESET' || !socket.writable) {
    if (socket.writable) {
      socket.end('HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<!DOCTYPE html><html><head><meta charset="utf-8"><title>Перенаправление на HTTP</title><meta http-equiv="refresh" content="0; url=http://127.0.0.1:8900/"></head><body style="background:#07090e;color:#fff;font-family:sans-serif;padding:40px;text-align:center;"><h2>Переход на HTTP версию...</h2><p>Пожалуйста, откройте: <a href="http://127.0.0.1:8900/" style="color:#60a5fa;">http://127.0.0.1:8900/</a></p></body></html>');
    }
    return;
  }
  socket.destroy(err);
});

function startServer() {
  playlistManager.init();
  epgManager.init();

  server.listen(config.PORT, config.HOST, () => {
    console.log(`=======================================================`);
    console.log(`   ЭФИР ТВ — ОНЛАЙН ТЕЛЕВИДЕНИЕ С АРХИВОМ ПЕРЕДАЧ      `);
    console.log(`   Сервер запущен: http://127.0.0.1:${config.PORT}       `);
    console.log(`   (или http://localhost:${config.PORT})                  `);
    console.log(`=======================================================`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { server, startServer };
