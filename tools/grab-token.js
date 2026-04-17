#!/usr/bin/env node
/**
 * Anixart Token Grabber
 *
 * Перехватывает токен из Anixart на телефоне через WiFi-прокси.
 *
 * Инструкция:
 * 1. Запусти: node grab-token.js
 * 2. На телефоне: Настройки → WiFi → твоя сеть → Прокси → Вручную
 *    - Хост: IP этого компьютера (показан ниже)
 *    - Порт: 8888
 * 3. Открой Anixart на телефоне
 * 4. Токен появится здесь автоматически
 * 5. ВАЖНО: после получения токена верни настройки прокси обратно!
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PROXY_PORT = 8888;
let foundToken = null;

// Get local IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIP = getLocalIP();

// Create HTTP proxy
const proxy = http.createServer((req, res) => {
  try {
    const url = new URL(req.url);

    // Check for Anixart token in URL
    const token = url.searchParams.get('token');
    if (token && (url.hostname.includes('anixart') || url.hostname.includes('anixsekai') || url.hostname.includes('anixmirai'))) {
      if (!foundToken) {
        foundToken = token;
        console.log('\n========================================');
        console.log('  ТОКЕН НАЙДЕН!');
        console.log('========================================');
        console.log(`\n  ${token}\n`);
        console.log('========================================');
        console.log('Токен скопирован в файл token.txt');
        console.log('Вставь его на сайте в поле "Войти по токену"');
        console.log('\n!!! Не забудь убрать прокси на телефоне !!!\n');

        // Save token to file
        const tokenPath = path.join(__dirname, '..', 'token.txt');
        fs.writeFileSync(tokenPath, token, 'utf8');

        // Also try to auto-register on the site
        autoRegister(token);
      }
    }

    // Forward the request
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: req.method,
      headers: req.headers,
    };

    delete options.headers['proxy-connection'];
    options.headers.host = url.hostname;

    const protocol = url.protocol === 'https:' ? https : http;
    const proxyReq = protocol.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502);
      res.end('Proxy error');
    });

    req.pipe(proxyReq);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad request');
  }
});

// Handle CONNECT for HTTPS
proxy.on('connect', (req, clientSocket, head) => {
  const [hostname, port] = req.url.split(':');

  const serverSocket = require('net').connect(port || 443, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', () => {
    clientSocket.end();
  });
});

async function autoRegister(token) {
  try {
    const res = await fetch(`http://localhost:3000/auth/anixart/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (data.code === 0) {
      console.log(`Автоматически вошли как: ${data.profile?.login}`);
    }
  } catch (e) {
    // Site might not be running, that's ok
  }
}

proxy.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('===========================================');
  console.log('   Anixart Token Grabber');
  console.log('===========================================');
  console.log('');
  console.log('  Настрой прокси на телефоне:');
  console.log(`  Хост: ${localIP}`);
  console.log(`  Порт: ${PROXY_PORT}`);
  console.log('');
  console.log('  Затем открой Anixart на телефоне.');
  console.log('  Токен будет перехвачен автоматически.');
  console.log('');
  console.log('  Ожидание...');
});
