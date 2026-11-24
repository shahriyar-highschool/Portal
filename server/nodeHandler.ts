import type { IncomingMessage, ServerResponse } from 'http';
import { handleApiRequest } from './appRouter.ts';
import { getServerKVStore } from './kv/fileKVStore.ts';

export async function nodeApiHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const rawProto = req.headers['x-forwarded-proto'] || 'https';
    const protocol = (Array.isArray(rawProto) ? rawProto[0] : rawProto).split(',')[0].trim() || 'https';
    const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost).split(',')[0].trim() || 'localhost:3000';
    const reqPath = (req as IncomingMessage & { originalUrl?: string }).originalUrl || req.url || '/';
    const fullUrl = reqPath.startsWith('http://') || reqPath.startsWith('https://')
      ? reqPath
      : `${protocol}://${host}${reqPath.startsWith('/') ? '' : '/'}${reqPath}`;

    const method = (req.method || 'GET').toUpperCase();
    let rawBody: Buffer | undefined;

    if (method !== 'GET' && method !== 'HEAD') {
      const maybeParsedBody = (req as IncomingMessage & { body?: unknown }).body;
      if (maybeParsedBody !== undefined && maybeParsedBody !== null && typeof maybeParsedBody !== 'function') {
        if (Buffer.isBuffer(maybeParsedBody)) {
          rawBody = maybeParsedBody;
        } else if (typeof maybeParsedBody === 'string') {
          rawBody = Buffer.from(maybeParsedBody, 'utf-8');
        } else {
          rawBody = Buffer.from(JSON.stringify(maybeParsedBody), 'utf-8');
        }
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        if (chunks.length > 0) {
          rawBody = Buffer.concat(chunks);
        }
      }
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join('; '));
      }
    }

    const webRequest = new Request(fullUrl, {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' && rawBody ? new Uint8Array(rawBody) : undefined,
      signal: abortController.signal,
    });

    const kvStore = getServerKVStore();
    const webResponse = await handleApiRequest(webRequest, {
      SCHOOL_KV: kvStore,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      AI_SERVER_URL: process.env.AI_SERVER_URL,
      AUTH_SERVER_URL: process.env.AUTH_SERVER_URL,
      SESSION_SECRET: process.env.SESSION_SECRET,
      ADMIN_SETUP_KEY: process.env.ADMIN_SETUP_KEY,
      APP_ORIGIN: process.env.APP_ORIGIN,
    });

    res.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const contentType = webResponse.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream') && webResponse.body) {
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      (res as ServerResponse & { flushHeaders?: () => void }).flushHeaders?.();

      const reader = webResponse.body.getReader();
      const closeListener = () => {
        if (!res.writableEnded) {
          reader.cancel().catch(() => {});
        }
      };
      res.on('close', closeListener);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0) {
            res.write(Buffer.from(value));
          }
        }
      } catch {
        // client closed connection or stream aborted
      } finally {
        res.off('close', closeListener);
        if (!res.writableEnded) {
          res.end();
        }
      }
      return;
    }

    const arrayBuf = await webResponse.arrayBuffer();
    res.end(Buffer.from(arrayBuf));
  } catch (error) {
    if (abortController.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    console.error('Node API handler error:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'خطای سرور در پردازش درخواست.' }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}

export default nodeApiHandler;
