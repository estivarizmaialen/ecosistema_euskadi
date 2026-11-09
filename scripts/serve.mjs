#!/usr/bin/env node
// Servidor mínimo para ver la web en local: node scripts/serve.mjs [puerto]
// Además de los archivos de public/, atiende POST /api/actualizar (botón «Actualizar datos»).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = +process.argv[2] || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

let actualizando = false;

function responder(res, status, datos) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(datos));
}

function actualizar(req, res) {
  // Solo la propia web puede lanzar la actualización, no otra página abierta en el navegador
  if (req.headers.origin !== `http://${req.headers.host}`) return responder(res, 403, { ok: false, error: 'Origen no permitido' });
  if (actualizando) return responder(res, 409, { ok: false, error: 'Ya hay una actualización en marcha' });

  actualizando = true;
  let salida = '';
  const proceso = spawn(process.execPath, [join('scripts', 'update.mjs')], { cwd: ROOT });
  const guardar = (trozo) => { salida = (salida + trozo).slice(-4000); process.stdout.write(trozo); };
  proceso.stdout.on('data', guardar);
  proceso.stderr.on('data', guardar);
  proceso.on('error', (err) => {
    actualizando = false;
    responder(res, 500, { ok: false, error: err.message });
  });
  proceso.on('close', (codigo) => {
    actualizando = false;
    if (res.headersSent) return;
    if (codigo === 0) responder(res, 200, { ok: true });
    else responder(res, 500, { ok: false, error: salida.trim().split('\n').pop() || `El proceso terminó con código ${codigo}` });
  });
}

createServer(async (req, res) => {
  const ruta = new URL(req.url, 'http://x').pathname;
  if (ruta === '/api/actualizar') {
    if (req.method === 'POST') return actualizar(req, res);
    return responder(res, 405, { ok: false, error: 'Usa POST' });
  }
  const path = normalize(decodeURIComponent(ruta)).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC, path.endsWith('/') || path.endsWith('\\') ? path + 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(PORT, 'localhost', () => console.log(`Abre http://localhost:${PORT}`));
