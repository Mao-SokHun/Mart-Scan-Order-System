import { app } from '../server/app';
import { initDb } from '../server/db';

let isDbInitialized = false;

export default async function handler(req: any, res: any) {
  if (!isDbInitialized) {
    try {
      await initDb();
      isDbInitialized = true;
    } catch (err) {
      console.error('Error initializing DB in serverless function:', err);
    }
  }
  return app(req, res);
}
