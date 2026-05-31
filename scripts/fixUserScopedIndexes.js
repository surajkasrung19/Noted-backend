import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const legacyIndexes = [
  ["folders", "parent_1_name_1"],
  ["tags", "name_1"],
  ["tags", "slug_1"],
];

async function dropIndexIfExists(collectionName, indexName) {
  const exists = await mongoose.connection.db
    .listCollections({ name: collectionName })
    .hasNext();

  if (!exists) {
    return { collectionName, indexName, status: "collection_missing" };
  }

  const collection = mongoose.connection.db.collection(collectionName);
  const indexes = await collection.indexes();
  const hasIndex = indexes.some((index) => index.name === indexName);

  if (!hasIndex) {
    return { collectionName, indexName, status: "index_missing" };
  }

  await collection.dropIndex(indexName);
  return { collectionName, indexName, status: "dropped" };
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from backend/.env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const results = [];
  for (const [collectionName, indexName] of legacyIndexes) {
    results.push(await dropIndexIfExists(collectionName, indexName));
  }

  const remainingIndexes = {};
  for (const collectionName of ["folders", "tags"]) {
    const exists = await mongoose.connection.db
      .listCollections({ name: collectionName })
      .hasNext();

    if (exists) {
      remainingIndexes[collectionName] = (
        await mongoose.connection.db.collection(collectionName).indexes()
      ).map((index) => ({
        name: index.name,
        key: index.key,
        unique: Boolean(index.unique),
      }));
    }
  }

  console.log(JSON.stringify({ results, remainingIndexes }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
