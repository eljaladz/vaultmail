import { MongoClient } from 'mongodb';

async function createIndexes() {
  const uri = process.env.MONGODB_URI?.trim();
  const dbName = process.env.MONGODB_DB || 'vaultmail';

  if (!uri) {
    console.error('Error: MONGODB_URI environment variable is not set.');
    process.exit(1);
  }

  let client;
  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    await client.connect();
    const db = client.db(dbName);
    const listItems = db.collection('list_items');

    console.log(`Connected to MongoDB. Creating index on collection "list_items"...`);
    const indexName = await listItems.createIndex(
      { key: 1, createdAt: -1, _id: -1 },
      { name: 'key_1_createdAt_-1__id_-1' }
    );
    console.log(`Successfully created index: ${indexName}`);
  } catch (error) {
    console.error('Error creating database indexes:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

createIndexes();
