const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'app-data.json');
const PORT = Number(process.env.PORT || 8787);
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 25 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readSharedData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { data: null, updatedAt: null };
  }

  const stat = fs.statSync(DATA_FILE);
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return {
    data: raw ? JSON.parse(raw) : null,
    updatedAt: stat.mtimeMs.toString()
  };
}

function writeSharedData(data) {
  ensureDataDir();
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
  return fs.statSync(DATA_FILE).mtimeMs.toString();
}

function isValidAppData(data) {
  return !!(
    data &&
    typeof data === 'object' &&
    data.users &&
    Array.isArray(data.errors) &&
    Array.isArray(data.plans)
  );
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function collectBody(req, res, onDone) {
  let raw = '';
  let size = 0;

  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      sendJson(res, 413, { error: '数据过大，未保存' });
      req.destroy();
      return;
    }
    raw += chunk;
  });

  req.on('end', () => onDone(raw));
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(ROOT, normalizedPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function getLanUrls() {
  const urls = [`http://localhost:${PORT}`];
  const interfaces = os.networkInterfaces();

  Object.values(interfaces).forEach(list => {
    (list || []).forEach(info => {
      if (info.family === 'IPv4' && !info.internal) {
        urls.push(`http://${info.address}:${PORT}`);
      }
    });
  });

  return urls;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/api/data')) {
    try {
      sendJson(res, 200, readSharedData());
    } catch(e) {
      sendJson(res, 500, { error: '读取共享数据失败' });
    }
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/api/data')) {
    collectBody(req, res, raw => {
      try {
        const data = JSON.parse(raw || '{}');
        if (!isValidAppData(data)) {
          sendJson(res, 400, { error: '数据格式不正确' });
          return;
        }

        const updatedAt = writeSharedData(data);
        sendJson(res, 200, { ok: true, updatedAt });
      } catch(e) {
        sendJson(res, 400, { error: '保存共享数据失败' });
      }
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log('考研助手 WiFi 共享服务已启动');
  console.log('同一台电脑打开:');
  console.log(`  http://localhost:${PORT}`);
  console.log('同一 WiFi 下另一台设备打开下面的局域网地址:');
  getLanUrls().slice(1).forEach(url => console.log(`  ${url}`));
  console.log('');
  console.log('保持这个窗口打开，浏览器里的数据会自动保存到 data/app-data.json');
});
