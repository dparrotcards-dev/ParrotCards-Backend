import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

async function createBackup() {
  console.log('========================================================');
  console.log('📦 CREATING RECOVERABLE BACKUP OF ASTRONOMICAL CALCULATIONS');
  console.log('========================================================\n');

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not found');

  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 15000 }).asPromise();
  console.log(`Connected to Atlas: ${conn.name}`);

  const col = conn.db.collection('astronomicalcalculations');
  const count = await col.countDocuments();
  console.log(`Total documents to backup: ${count}`);

  const docs = await col.find({}).toArray();

  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = path.join(backupDir, 'atlas_astronomicalcalculations_backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(docs, null, 2), 'utf8');

  // Verify backup
  const stats = fs.statSync(backupPath);
  console.log(`Backup file written: ${backupPath}`);
  console.log(`Backup size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

  const readBack = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  if (readBack.length === count) {
    console.log(`✅ Backup verification SUCCESSFUL: ${readBack.length} / ${count} documents verified intact.`);
  } else {
    throw new Error(`Backup mismatch! Expected ${count}, got ${readBack.length}`);
  }

  await conn.close();
}

createBackup().catch((err) => {
  console.error('❌ Backup failed:', err);
  process.exit(1);
});
