import { readFileSync } from "node:fs";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = readFileSync(process.argv[2], "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  console.log("OK");
} finally {
  await client.end();
}
