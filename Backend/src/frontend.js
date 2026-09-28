import express from 'express';
import {existsSync} from 'node:fs';
import {join, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const buildDirectory = fileURLToPath(new URL('../../Frontend/dist/', import.meta.url));

export function mountFrontend(app, directory = buildDirectory) {
  const index = join(directory, 'index.html');
  if (!existsSync(index)) throw new Error('Falta compilar Frontend antes de iniciar con SERVE_FRONTEND=true.');
  app.use(express.static(directory, {index: false, redirect: false, dotfiles: 'deny',
    setHeaders(res) { res.set('Cache-Control', 'no-cache'); }
  }));
  app.get('/', (req, res) => res.redirect(302, '/login'));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || extname(req.path) || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-store');
    res.sendFile(index);
  });
}
