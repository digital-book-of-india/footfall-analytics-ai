import mongoose from 'mongoose';
import { config } from '../config.js';

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
