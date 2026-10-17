import type { IncomingMessage } from 'http';
import http from 'http';
import https from 'https';
import type { Request, Response } from 'express';

const HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

/**
 * Browser lấy proxy/thumb/render từ BE (`/media/...`), BE kéo file từ AI.
 * Forward Range để tua video không phải tải cả file.
 */
export function mediaGateway(req: Request, res: Response) {
  if (req.url?.includes('..')) {
    res.status(400).end();
    return;
  }

  const base = (process.env.AI_SERVICE_URL || 'http://localhost:8787').replace(/\/$/, '');
  let target: URL;
  try {
    target = new URL(`/media${req.url ?? ''}`, `${base}/`);
  } catch {
    res.status(400).end();
    return;
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || HOP.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join(',') : value;
  }

  const lib = target.protocol === 'https:' ? https : http;
  const up = lib.request(
    target,
    { method: req.method, headers },
    (incoming: IncomingMessage) => {
      const out: Record<string, string | number | string[] | undefined> = {};
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value == null || HOP.has(key.toLowerCase())) continue;
        out[key] = value;
      }
      res.writeHead(incoming.statusCode ?? 502, out);
      incoming.pipe(res);
    },
  );

  up.on('error', () => {
    if (!res.headersSent) res.status(502).end();
    else res.end();
  });
  req.pipe(up);
}

export function attachMediaGateway(server: { use: (path: string, fn: (req: Request, res: Response) => void) => void }) {
  server.use('/media', (req: Request, res: Response) => mediaGateway(req, res));
}
