'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const config = require('./config');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
};

const IDLE_TIMEOUT_MS = 30000;
const MANIFEST_MAX_BYTES = 5 * 1024 * 1024;

function isBlockedHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || h.startsWith('127.');
}

function resolveUrl(ref, baseUrl) {
  try {
    const u = new URL(ref, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function proxPath(abs, headers) {
  let p = '/p?url=' + encodeURIComponent(abs);
  if (headers && headers.ua) p += '&ua=' + encodeURIComponent(headers.ua);
  if (headers && headers.ref) p += '&ref=' + encodeURIComponent(headers.ref);
  return p;
}

function rewriteManifest(text, baseUrl, headers) {
  return text
    .split(/\r?\n/)
    .map(line => {
      const t = line.trim();
      if (!t) return line;
      if (t.charAt(0) === '#') {
        // Подмена URI в тегах #EXT-X-KEY, #EXT-X-MEDIA
        return line.replace(/URI="([^"]+)"/g, (m, val) => {
          const abs = resolveUrl(val, baseUrl);
          return abs ? 'URI="' + proxPath(abs, headers) + '"' : m;
        });
      }
      // Обычная ссылка на сегмент или суб-манифест
      const abs = resolveUrl(t, baseUrl);
      return abs ? proxPath(abs, headers) : line;
    })
    .join('\n');
}

async function handleProxyRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const targetUrl = reqUrl.searchParams.get('url');

  if (!targetUrl) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Не указан параметр url');
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch (e) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Некорректный URL');
  }

  if (isBlockedHost(parsedTarget.hostname)) {
    res.writeHead(403, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Доступ к локальному хосту запрещен');
  }

  const customUa = reqUrl.searchParams.get('ua') || config.DEFAULT_WINK_UA;
  const customRef = reqUrl.searchParams.get('ref') || '';

  const upstreamHeaders = {
    'User-Agent': customUa,
    'Accept': '*/*',
    'Accept-Encoding': 'identity'
  };

  if (customRef) {
    upstreamHeaders['Referer'] = customRef;
  }
  if (req.headers.range) {
    upstreamHeaders['Range'] = req.headers.range;
  }

  const controller = new AbortController();
  let idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
  const resetTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
  };

  req.on('close', () => {
    clearTimeout(idleTimer);
    controller.abort();
  });

  try {
    const upstreamRes = await fetch(parsedTarget.toString(), {
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: controller.signal
    });

    const status = upstreamRes.status;
    const contentType = upstreamRes.headers.get('content-type') || '';
    const isManifest = /\.m3u8?(\?|$)/i.test(targetUrl) || /mpegurl/i.test(contentType);

    const outHeaders = {
      ...CORS_HEADERS,
      'Cache-Control': isManifest ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
    };

    if (upstreamRes.headers.has('content-range')) {
      outHeaders['Content-Range'] = upstreamRes.headers.get('content-range');
    }
    if (upstreamRes.headers.has('accept-ranges')) {
      outHeaders['Accept-Ranges'] = upstreamRes.headers.get('accept-ranges');
    }

    if (isManifest) {
      // Манифест считываем, переписываем ссылки и отдаем клиенту
      const rawText = await upstreamRes.text();
      clearTimeout(idleTimer);

      const modifiedText = rewriteManifest(rawText, upstreamRes.url || targetUrl, { ua: customUa, ref: customRef });
      const bodyBuf = Buffer.from(modifiedText, 'utf8');

      outHeaders['Content-Type'] = 'application/vnd.apple.mpegurl';
      outHeaders['Content-Length'] = bodyBuf.length;

      res.writeHead(status, outHeaders);
      res.end(bodyBuf);
    } else {
      // Бинарный чанк/сегмент стримим потоком
      outHeaders['Content-Type'] = contentType || 'video/MP2T';
      if (upstreamRes.headers.has('content-length')) {
        outHeaders['Content-Length'] = upstreamRes.headers.get('content-length');
      }

      res.writeHead(status, outHeaders);

      if (!upstreamRes.body) {
        clearTimeout(idleTimer);
        return res.end();
      }

      const reader = upstreamRes.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            resetTimer();
            const canContinue = res.write(value);
            if (!canContinue) {
              await new Promise(r => res.once('drain', r));
            }
          }
          clearTimeout(idleTimer);
          res.end();
        } catch (pumpErr) {
          clearTimeout(idleTimer);
          res.destroy();
        }
      };
      pump();
    }
  } catch (err) {
    clearTimeout(idleTimer);
    if (!res.headersSent) {
      res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Ошибка шлюза стриминга: ${err.message}`);
    } else {
      res.destroy();
    }
  }
}

module.exports = {
  handleProxyRequest,
  CORS_HEADERS
};
