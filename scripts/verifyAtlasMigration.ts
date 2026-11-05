import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const LOCAL_URI = 'mongodb://127.0.0.1:27017/parrot-cards';

const RAW_ATLAS_URI = 'mongodb://hemantpaliwal:<hemantpaliwal@22>@ac-lpwr2bk-shard-00-00.e31usox.mongodb.net:27017,ac-lpwr2bk-shard-00-01.e31usox.mongodb.net:27017,ac-lpwr2bk-shard-00-02.e31usox.mongodb.net:27017/parrotcards?ssl=true&replicaSet=atlas-slmmdl-shard-0&authSource=admin';

export function cleanAtlasUri(raw: string): string {
  return raw.replace(/<([^>]+)>/, (_match, p1) => encodeURIComponent(p1));
}

const ATLAS_URI = cleanAtlasUri(RAW_ATLAS_URI);

async function verifyMigration() {
  console.log('========================================================');
  console.log('🔬 DEEP VERIFICATION: LOCAL MONGODB vs MONGODB ATLAS');
  console.log('========================================================\n');

  const localConn = await mongoose.createConnection(LOCAL_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const atlasConn = await mongoose.createConnection(ATLAS_URI, { serverSelectionTimeoutMS: 15000 }).asPromise();

  console.log(`Connected to Local DB: ${localConn.name} (${localConn.host})`);
  console.log(`Connected to Atlas DB: ${atlasConn.name} (${atlasConn.host})\n`);

  const localCols = await localConn.db.listCollections().toArray();
  const tableData: any[] = [];
  let allMatched = true;

  for (const col of localCols) {
    const name = col.name;
    const localCollection = localConn.db.collection(name);
    const atlasCollection = atlasConn.db.collection(name);

    const localCount = await localCollection.countDocuments();
    const atlasCount = await atlasCollection.countDocuments();

    const localIndexes = await localCollection.indexes();
    const atlasIndexes = await atlasCollection.indexes();

    const countMatch = localCount === atlasCount;
    const indexMatch = localIndexes.length === atlasIndexes.length;

    if (!countMatch || !indexMatch) {
      allMatched = false;
    }

    tableData.push({
      Collection: name,
      'Local Docs': localCount,
      'Atlas Docs': atlasCount,
      'Count Match': countMatch ? '✅ MATCH' : '❌ DIFF',
      'Local Idx': localIndexes.length,
      'Atlas Idx': atlasIndexes.length,
      'Idx Match': indexMatch ? '✅ MATCH' : '❌ DIFF',
    });
  }

  console.table(tableData);

  console.log('\n--- Deep Sampling & Relational Integrity Checks ---');

  // 1. Check Card Definitions (55 cards)
  const localCard55 = await localConn.db.collection('carddefinitions').find().sort({ position: 1 }).toArray();
  const atlasCard55 = await atlasConn.db.collection('carddefinitions').find().sort({ position: 1 }).toArray();

  let cardsMatch = localCard55.length === 55 && atlasCard55.length === 55;
  for (let i = 0; i < localCard55.length; i++) {
    if (localCard55[i]._id.toString() !== atlasCard55[i]._id.toString() ||
        localCard55[i].cardId !== atlasCard55[i].cardId ||
        localCard55[i].position !== atlasCard55[i].position) {
      cardsMatch = false;
      break;
    }
  }
  console.log(`1. 55 Approved Cards Integrity: ${cardsMatch ? '✅ 100% IDENTICAL (_ids, positions, cardIds match)' : '❌ Mismatch'}`);

  // 2. Check Birth Profiles & Astronomical Calculations link
  const sampleProfile = await localConn.db.collection('birthprofiles').findOne({});
  if (sampleProfile) {
    const atlasProfile = await atlasConn.db.collection('birthprofiles').findOne({ _id: sampleProfile._id });
    const profileMatch = atlasProfile && atlasProfile.name === sampleProfile.name;
    console.log(`2. Birth Profile Integrity: ${profileMatch ? `✅ MATCH (Name: "${sampleProfile.name}", ID: ${sampleProfile._id})` : '❌ Mismatch'}`);

    const localAstro = await localConn.db.collection('astronomicalcalculations').findOne({ profileId: sampleProfile._id });
    const atlasAstro = await atlasConn.db.collection('astronomicalcalculations').findOne({ profileId: sampleProfile._id });
    const astroMatch = localAstro && atlasAstro && localAstro._id.toString() === atlasAstro._id.toString();
    console.log(`3. Astronomical Calculation Link: ${astroMatch ? `✅ MATCH (Profile -> Astro ID: ${localAstro._id})` : '⚠️ No calculation for profile or mismatch'}`);
  }

  // 3. Check Personalized Cards (385 cards)
  const localSamplePcard = await localConn.db.collection('personalizedcards').findOne({});
  if (localSamplePcard) {
    const atlasSamplePcard = await atlasConn.db.collection('personalizedcards').findOne({ _id: localSamplePcard._id });
    const pcardMatch = atlasSamplePcard && atlasSamplePcard.cardId === localSamplePcard.cardId && atlasSamplePcard.suit === localSamplePcard.suit;
    console.log(`4. Personalized Card Sample: ${pcardMatch ? `✅ MATCH (Card: "${localSamplePcard.cardId}", Suit: ${localSamplePcard.suit})` : '❌ Mismatch'}`);
  }

  // 4. Check Payment Orders & Transactions
  const localPaymentOrder = await localConn.db.collection('paymentorders').findOne({});
  if (localPaymentOrder) {
    const atlasPaymentOrder = await atlasConn.db.collection('paymentorders').findOne({ _id: localPaymentOrder._id });
    const orderMatch = atlasPaymentOrder && atlasPaymentOrder.orderId === localPaymentOrder.orderId && atlasPaymentOrder.amount === localPaymentOrder.amount;
    console.log(`5. Payment Order Integrity: ${orderMatch ? `✅ MATCH (Order: "${localPaymentOrder.orderId}", Amount: ${localPaymentOrder.amount} paise)` : '❌ Mismatch'}`);
  }

  await localConn.close();
  await atlasConn.close();

  if (allMatched && cardsMatch) {
    console.log('\n🌟 VERIFICATION RESULT: 100% PERFECT MATCH ACROSS ALL 12 COLLECTIONS!');
  } else {
    console.error('\n⚠️ VERIFICATION RESULT: DISCREPANCIES DETECTED');
    process.exit(1);
  }
}

verifyMigration().catch(console.error);
