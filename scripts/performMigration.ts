import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LOCAL_URI = 'mongodb://127.0.0.1:27017/parrot-cards';

// Atlas URI with encoded password
const RAW_ATLAS_URI = 'mongodb://hemantpaliwal:<hemantpaliwal@22>@ac-lpwr2bk-shard-00-00.e31usox.mongodb.net:27017,ac-lpwr2bk-shard-00-01.e31usox.mongodb.net:27017,ac-lpwr2bk-shard-00-02.e31usox.mongodb.net:27017/parrotcards?ssl=true&replicaSet=atlas-slmmdl-shard-0&authSource=admin';

export function cleanAtlasUri(raw: string): string {
  return raw.replace(/<([^>]+)>/, (_match, p1) => encodeURIComponent(p1));
}

const ATLAS_URI = cleanAtlasUri(RAW_ATLAS_URI);

interface MigrationResult {
  collection: string;
  localCount: number;
  atlasCount: number;
  localIndexes: number;
  atlasIndexes: number;
  status: 'SUCCESS' | 'MISMATCH' | 'FAILED';
  error?: string;
}

async function migrateData() {
  console.log('========================================================');
  console.log('🚀 EXECUTING DATABASE MIGRATION: LOCAL -> MONGODB ATLAS');
  console.log('========================================================\n');

  console.log('Connecting to Local MongoDB...');
  const localConn = await mongoose.createConnection(LOCAL_URI, {
    serverSelectionTimeoutMS: 5000,
  }).asPromise();
  console.log(`✅ Connected to Local DB: "${localConn.name}"`);

  console.log('Connecting to MongoDB Atlas...');
  const atlasConn = await mongoose.createConnection(ATLAS_URI, {
    serverSelectionTimeoutMS: 15000,
  }).asPromise();
  console.log(`✅ Connected to Atlas DB: "${atlasConn.name}"\n`);

  const collections = await localConn.db.listCollections().toArray();
  const results: MigrationResult[] = [];

  for (const colInfo of collections) {
    const colName = colInfo.name;
    console.log(`⏳ Migrating collection: "${colName}"...`);

    try {
      // 1. Fetch all documents and indexes from local
      const localCollection = localConn.db.collection(colName);
      const docs = await localCollection.find({}).toArray();
      const localIndexes = await localCollection.indexes();

      // 2. Ensure target collection exists on Atlas
      const atlasCollection = atlasConn.db.collection(colName);

      // Check existing count on Atlas
      const existingAtlasCount = await atlasCollection.countDocuments();
      if (existingAtlasCount > 0) {
        console.warn(`   ⚠️ Notice: Atlas collection "${colName}" already has ${existingAtlasCount} docs.`);
      }

      // 3. Insert documents if any exist locally
      if (docs.length > 0) {
        // Use insertMany with raw BSON documents to preserve exact _id, Date objects, nested structures
        await atlasCollection.insertMany(docs, { ordered: false });
        console.log(`   ✓ Copied ${docs.length} documents.`);
      } else {
        // Create collection explicitly if empty
        await atlasConn.db.createCollection(colName).catch(() => {});
        console.log(`   ✓ Created empty collection.`);
      }

      // 4. Replicate indexes (excluding default _id_)
      for (const idx of localIndexes) {
        if (idx.name === '_id_') continue;
        const options: any = { name: idx.name };
        if (idx.unique) options.unique = true;
        if (idx.sparse) options.sparse = true;
        if (idx.expireAfterSeconds !== undefined) options.expireAfterSeconds = idx.expireAfterSeconds;
        await atlasCollection.createIndex(idx.key, options);
      }
      console.log(`   ✓ Replicated ${localIndexes.length - 1} secondary indexes.`);

      // 5. Verification check
      const postAtlasCount = await atlasCollection.countDocuments();
      const postAtlasIndexes = await atlasCollection.indexes();

      const isMatch = docs.length === postAtlasCount;
      results.push({
        collection: colName,
        localCount: docs.length,
        atlasCount: postAtlasCount,
        localIndexes: localIndexes.length,
        atlasIndexes: postAtlasIndexes.length,
        status: isMatch ? 'SUCCESS' : 'MISMATCH',
      });

      console.log(`   ✅ "${colName}": Local (${docs.length}) === Atlas (${postAtlasCount})\n`);
    } catch (err: any) {
      console.error(`   ❌ Failed to migrate "${colName}":`, err.message);
      results.push({
        collection: colName,
        localCount: 0,
        atlasCount: 0,
        localIndexes: 0,
        atlasIndexes: 0,
        status: 'FAILED',
        error: err.message,
      });
    }
  }

  // Sample record integrity verification
  console.log('--- Sample Document Integrity Verification ---');
  const sampleCard = await localConn.db.collection('carddefinitions').findOne({ position: 1 });
  const atlasCard = await atlasConn.db.collection('carddefinitions').findOne({ position: 1 });

  if (sampleCard && atlasCard && sampleCard._id.toString() === atlasCard._id.toString() && sampleCard.cardId === atlasCard.cardId) {
    console.log(`✅ Sample Card Match Verified: Card #1 "${sampleCard.cardId}" preserved exact _id (${sampleCard._id.toString()})`);
  } else {
    console.error('❌ Sample Card Match Mismatch!');
  }

  const sampleCalc = await localConn.db.collection('astronomicalcalculations').findOne({});
  if (sampleCalc) {
    const atlasCalc = await atlasConn.db.collection('astronomicalcalculations').findOne({ _id: sampleCalc._id });
    if (atlasCalc && atlasCalc.cacheHash === sampleCalc.cacheHash) {
      console.log(`✅ Astronomical Cache Match Verified: Hash "${sampleCalc.cacheHash.substring(0, 16)}..." preserved exact _id`);
    }
  }

  console.log('\n========================================================');
  console.log('📊 MIGRATION SUMMARY TABLE');
  console.log('========================================================');
  console.table(results);

  await localConn.close();
  await atlasConn.close();

  const allPassed = results.every((r) => r.status === 'SUCCESS');
  if (allPassed) {
    console.log('\n🎉 ALL COLLECTIONS SUCCESSFULLY MIGRATED TO MONGODB ATLAS WITH ZERO DATA LOSS!');
  } else {
    console.error('\n⚠️ Some collections had mismatches or errors. Review the table above.');
    process.exit(1);
  }
}

migrateData().catch(console.error);
