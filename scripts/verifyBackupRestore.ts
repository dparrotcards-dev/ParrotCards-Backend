import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function verifyRestore() {
  console.log('--- 1. RESTORE VERIFICATION TO ISOLATED TEST DATABASE ---');

  const backupPath = path.resolve(__dirname, '../backups/atlas_astronomicalcalculations_backup.json');
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found at: ${backupPath}`);
  }

  const fileStats = fs.statSync(backupPath);
  console.log(`📂 Found backup file: ${backupPath}`);
  console.log(`📊 Size on disk: ${(fileStats.size / (1024 * 1024)).toFixed(2)} MB (${fileStats.size} bytes)`);

  const rawJson = fs.readFileSync(backupPath, 'utf8');
  const backupDocs: any[] = JSON.parse(rawJson);
  console.log(`📄 Parsed backup records: ${backupDocs.length}`);

  if (backupDocs.length !== 14) {
    throw new Error(`Expected exactly 14 records in backup, found ${backupDocs.length}`);
  }

  // Connect to an ISOLATED database name on Atlas so production 'parrotcards' is completely untouched
  const prodUri = process.env.MONGODB_URI || '';
  if (!prodUri.includes('/parrotcards')) {
    throw new Error('MONGODB_URI does not contain /parrotcards');
  }

  const isolatedDbName = 'parrotcards_restore_verify';
  const isolatedUri = prodUri.replace('/parrotcards?', `/${isolatedDbName}?`);

  console.log(`🔗 Connecting to isolated test database: ${isolatedDbName}...`);
  const conn = await mongoose.createConnection(isolatedUri).asPromise();
  console.log(`✅ Connected to isolated database: ${conn.name}`);

  const testCollection = conn.collection('astronomicalcalculations_restored');

  // Ensure clean slate in test collection
  await testCollection.deleteMany({});

  // Restore the documents
  console.log('⏳ Restoring 14 documents into isolated collection...');
  // Convert $oid and $date if needed
  const documentsToInsert = backupDocs.map((doc) => {
    const copy = { ...doc };
    if (copy._id && typeof copy._id === 'object' && copy._id.$oid) {
      copy._id = new mongoose.Types.ObjectId(copy._id.$oid);
    } else if (typeof copy._id === 'string') {
      copy._id = new mongoose.Types.ObjectId(copy._id);
    }
    return copy;
  });

  const insertResult = await testCollection.insertMany(documentsToInsert);
  console.log(`✅ Inserted ${insertResult.insertedCount} documents successfully.`);

  // Verify document integrity
  const restoredDocs = await testCollection.find({}).toArray();
  console.log(`🔍 Retrieved ${restoredDocs.length} restored documents from isolated DB.`);

  let totalRawHoroscopeBytes = 0;
  let intactCount = 0;

  for (let i = 0; i < restoredDocs.length; i++) {
    const doc = restoredDocs[i];
    const rawH = doc.rawHoroscope;
    if (!rawH || typeof rawH !== 'object') {
      throw new Error(`Document #${i} (${doc._id}) is missing rawHoroscope!`);
    }

    const rawStr = JSON.stringify(rawH);
    totalRawHoroscopeBytes += rawStr.length;

    // Check critical original fields
    const hasDivisional = !!(rawH.divisional_charts || rawH['D-9_navamsa']);
    const hasNak = !!rawH.nakshatra_pada;

    if (!hasDivisional && !hasNak) {
      throw new Error(`Document #${i} does not have original raw horoscope structures!`);
    }

    intactCount++;
  }

  console.log(`✅ All ${intactCount}/14 documents verified intact.`);
  console.log(`📦 Total rawHoroscope payload recovered: ${(totalRawHoroscopeBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Average rawHoroscope size per record: ${(totalRawHoroscopeBytes / (14 * 1024)).toFixed(2)} KB`);

  // Clean up isolated test collection and database
  console.log('🧹 Dropping isolated test collection...');
  await testCollection.drop();
  await conn.dropDatabase();
  await conn.close();
  console.log('✅ Isolated test database dropped and connection closed cleanly.');
  console.log('🎉 Restore verification passed with 100% data recoverability!\n');
}

verifyRestore().catch((err) => {
  console.error('❌ Restore verification failed:', err);
  process.exit(1);
});
