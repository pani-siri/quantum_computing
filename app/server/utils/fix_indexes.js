import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smartlearn";

async function fixIndexes() {
  try {
    console.log("Connecting to MongoDB:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log("Connected.");

    const db = mongoose.connection.db;
    const collection = db.collection("users");

    console.log("Checking indexes for 'users' collection...");
    const indexes = await collection.indexes();
    console.log("Current indexes:", JSON.stringify(indexes, null, 2));

    const findUserIdIndex = indexes.find(idx => idx.name === "user_id_1" || (idx.key && idx.key.user_id));

    if (findUserIdIndex) {
      console.log(`Dropping index '${findUserIdIndex.name}'...`);
      await collection.dropIndex(findUserIdIndex.name);
      console.log("Index dropped successfully.");
    } else {
      console.log("No 'user_id' index found. Nothing to drop.");
    }

    // Also check for any 'user_id: null' documents and log them
    const nullUsers = await collection.find({ user_id: null }).toArray();
    if (nullUsers.length > 0) {
      console.log(`Found ${nullUsers.length} documents with 'user_id: null'.`);
      // We don't necessarily need to delete them if we drop the unique index,
      // but if they are broken/incomplete, it might be better to clean up.
      // For now, just dropping the index should fix the E11000 error.
    }

    await mongoose.disconnect();
    console.log("Disconnected.");
    process.exit(0);
  } catch (err) {
    console.error("Error fixing indexes:", err);
    process.exit(1);
  }
}

fixIndexes();
