const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function verify() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const count = await db.collection('astronomicalcalculations').countDocuments();
  const withRaw = await db.collection('astronomicalcalculations').countDocuments({ 'rawHoroscope.divisional_charts': { $exists: true } });
  const lean = await db.collection('astronomicalcalculations').countDocuments({ 'rawHoroscope.ayanamsa': { $exists: true } });
  const profiles = await db.collection('birthprofiles').countDocuments();
  const decks = await db.collection('personalizeddecks').countDocuments();
  const cards = await db.collection('personalizedcards').countDocuments();
  const orders = await db.collection('paymentorders').countDocuments();
  const passes = await db.collection('deckpasses').countDocuments();

  console.log('--- ATLAS DATABASE VERIFICATION ---');
  console.log('Total Calculations:', count);
  console.log('Original Raw Calculations Preserved:', withRaw);
  console.log('New Lean Calculations:', lean);
  console.log('Birth Profiles Preserved:', profiles);
  console.log('Personalized Decks Preserved:', decks);
  console.log('Cards Preserved:', cards);
  console.log('Payment Orders Preserved:', orders);
  console.log('Deck Passes Preserved:', passes);
  await mongoose.disconnect();
}
verify().catch(console.error);
