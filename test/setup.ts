import { beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setDBClient, connectDB, disconnectDB } from '../src/database.js';

// Keep mongod binaries inside the repo regardless of what MONGOMS_DOWNLOAD_DIR
// the .env sets (dotenv is loaded transitively via src/config.ts)
process.env.MONGOMS_DOWNLOAD_DIR = fileURLToPath(new URL('../.mongodb-binaries', import.meta.url));

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({
    instance: { thisInstance: true },
  });
  const uri = mongod.getUri();
  setDBClient(uri);
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
  if (mongod) {
    await mongod.stop();
  }
});
