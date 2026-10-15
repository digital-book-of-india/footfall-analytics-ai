import mongoose from 'mongoose';
import * as dns from 'node:dns';
import { config } from '../config.js';

try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch {
  // Ignore if custom dns set is not supported in current environment
}

export async function connectDatabase(): Promise<typeof mongoose> {
  try {
    const conn = await mongoose.connect(config.mongoUri);
    console.log(`[Database] MongoDB connected successfully to ${config.mongoUri}`);
    return conn;
  } catch (err) {
    console.error(`[Database] MongoDB connection failed:`, err);
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
