import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smartlearn";

async function cleanupUsers() {
  try {
    console.log("Connecting to MongoDB:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log("Connected.");

    const db = mongoose.connection.db;
    const collection = db.collection("users");

    // Show all users first
    const allUsers = await collection.find({}).toArray();
    console.log(`Total users: ${allUsers.length}`);
    allUsers.forEach((u, i) => {
      console.log(`  [${i + 1}] uid=${u.uid || "(missing)"} | email=${u.email} | name=${u.name}`);
    });

    // Find documents missing a uid (the corrupted ones)
    const badDocs = await collection.find({ $or: [{ uid: null }, { uid: { $exists: false } }] }).toArray();
    console.log(`Found ${badDocs.length} corrupted document(s) missing 'uid'.`);

    if (badDocs.length > 0) {
      const ids = badDocs.map(d => d._id);
      const result = await collection.deleteMany({ _id: { $in: ids } });
      console.log(`Deleted ${result.deletedCount} corrupted document(s).`);
    } else {
      console.log("No corrupted documents to remove.");
    }

    await mongoose.disconnect();
    console.log("Done. Disconnected.");
    process.exit(0);
  } catch (err) {
    console.error("Error during cleanup:", err);
    process.exit(1);
  }
}

cleanupUsers();
