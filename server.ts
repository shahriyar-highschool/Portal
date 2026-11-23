import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getServerKVStore } from './server/kv/fileKVStore.ts';
import { nodeApiHandler } from './server/nodeHandler.ts';
import { attachChatWebSocketServer } from './server/services/chatHub.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const kvStore = getServerKVStore();

  // Bridge Express /api/* requests to the Web-standard handleApiRequest router
  app.use('/api', (req, res) => {
    void nodeApiHandler(req, res);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Shahriar School platform running on http://0.0.0.0:${PORT}`);
  });
  attachChatWebSocketServer(httpServer, kvStore);
}

startServer();
