// backend/db.js or wherever you connect to MongoDB
import { MongoClient } from "mongodb";
const uri = process.env.MONGO_URL; // MongoDB URI from environment variables
const client = new MongoClient(uri);

const dbName = "hotelDB"; // your database

async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");
    const db = client.db(dbName);
    return db;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    throw err;
  }
}

export default connectDB;

