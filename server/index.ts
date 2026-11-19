import dotenv from 'dotenv';
import { app } from './app';
import { initDb } from './db';

dotenv.config();

const PORT = process.env.PORT || 3001;

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Neon PostgreSQL API Server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
