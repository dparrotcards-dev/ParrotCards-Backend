import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LOCAL_URI = 'mongodb://127.0.0.1:27017/parrot-cards';

// Atlas URI from user input with URL-encoded password
const RAW_ATLAS_URI = 'mongodb://hemantpaliwal:<hemantpaliwal@22>@ac-lpwr2bk-shard-00-00.e31usox.mongodb.net:27017,ac-lpwr2bk-shard-00-01.e31usox.mongodb.net:27017,ac-lpwr2bk-shard-00-02.e31usox.mongodb.net:27017/parrotcards?ssl=true&replicaSet=atlas-slmmdl-shard-0&authSource=admin';

export function cleanAtlasUri(raw: string): string {
  return raw.replace(/<([^>]+)>/, (_match, p1) => encodeURIComponent(p1));
}

const ATLAS_URI = cleanAtlasUri(RAW_ATLAS_URI);

async function runAudit() {
  console.log('========================================================');
  console.log('🌌 PARROT CARDS: LOCAL DB AUDIT & ATLAS CONNECTIVITY TEST');
  console.log('========================================================\n');

  console.log('🔍 Step 1: Connecting to Local MongoDB...');
  const localConn = await mongoose.createConnection(LOCAL_URI, {
    serverSelectionTimeoutMS: 5000,
  }).asPromise();

  console.log(`✅ Connected to Local DB: "${localConn.name}" on ${localConn.host}:${localConn.port}\n`);

  const collections = await localConn.db.listCollections().toArray();
  console.log(`Found ${collections.length} collections in local database:`);

  const localReport: Record<string, { count: number; indexes: any[] }> = {};

  for (const col of collections) {
    const count = await localConn.db.collection(col.name).countDocuments();
    const indexes = await localConn.db.collection(col.name).indexes();
    localReport[col.name] = {
      count,
      indexes: indexes.map((idx) => ({ name: idx.name, key: idx.key, unique: idx.unique })),
    };
    console.log(`  - ${col.name.padEnd(26)} : ${count.toString().padStart(4)} docs | ${indexes.length} indexes`);
  }

  await localConn.close();

  console.log('\n🔍 Step 2: Testing Connection to MongoDB Atlas...');
  try {
    const atlasConn = await mongoose.createConnection(ATLAS_URI, {
      serverSelectionTimeoutMS: 15000,
    }).asPromise();

    console.log(`✅ Successfully connected to MongoDB Atlas!`);
    console.log(`   Host: ${atlasConn.host}`);
    console.log(`   Database Name: ${atlasConn.name}`);

    const atlasCols = await atlasConn.db.listCollections().toArray();
    console.log(`   Existing collections on Atlas (${atlasCols.length}):`, atlasCols.map((c) => c.name));

    await atlasConn.close();
  } catch (err: any) {
    console.error(`❌ Atlas Connection Failed:`, err.message);
  }

  console.log('\nAudit complete.');
}

runAudit().catch(console.error);
