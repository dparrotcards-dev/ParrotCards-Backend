import mongoose from 'mongoose';
import { ENV } from './env';

export async function connectDB(uri?: string): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  try {
    mongoose.set('strictQuery', true);
    const isTest = process.env.NODE_ENV === 'test' || ENV.NODE_ENV === 'test';
    const targetUri = uri || (isTest ? (process.env.MONGODB_TEST_URI || ENV.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/parrotcards_test_isolated') : ENV.MONGODB_URI);
    const conn = await mongoose.connect(targetUri, {
      serverSelectionTimeoutMS: 15000,
      autoIndex: true,
    });
    const isAtlas = conn.connection.host.includes('mongodb.net');
    console.log(`🌌 Connected to MongoDB ${isAtlas ? 'Atlas (Cloud)' : 'Isolated Test / Local'}: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    if (ENV.NODE_ENV !== 'test' && !process.env.VERCEL) {
      process.exit(1);
    }
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
