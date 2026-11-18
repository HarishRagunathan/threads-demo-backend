import { readFile } from "node:fs/promises";
import pg from "pg";
import "dotenv/config";

const file = process.argv[2];
if (!file || !process.env.RESTORE_DATABASE_URL)
  throw new Error(
    "Usage: set RESTORE_DATABASE_URL to an empty database, then node src/restore.js backup.json",
  );
const backup = JSON.parse(await readFile(file, "utf8"));
const tables = [
  "users",
  "categories",
  "brands",
  "products",
  "customers",
  "suppliers",
  "documents",
  "document_items",
  "payments",
  "returns",
  "stock_movements",
  "expenses",
  "held_bills",
  "shifts",
  "audit_logs",
  "settings",
];
if (
  backup.format !== "thread-ledger-demo-v1" ||
  tables.some((t) => !Array.isArray(backup.tables?.[t]))
)
  throw new Error("Unsupported or incomplete backup");
const pool = new pg.Pool({
  connectionString: process.env.RESTORE_DATABASE_URL,
});
const db = await pool.connect();
try {
  await db.query("BEGIN");
  await db.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  for (const table of tables) {
    if ((await db.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)
      throw new Error("Restore refused: target database is not empty");
  }
  for (const table of tables) {
    const valid = (
      await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
        [table],
      )
    ).rows.map((r) => r.column_name);
    for (const row of backup.tables[table]) {
      const keys = Object.keys(row);
      if (keys.some((k) => !valid.includes(k)))
        throw new Error("Unknown backup column");
      const values = keys.map((k) =>
        ["data", "detail"].includes(k) ? JSON.stringify(row[k]) : row[k],
      );
      await db.query(
        `INSERT INTO ${table}(${keys.map((k) => '"' + k + '"')}) VALUES(${keys.map((_, i) => "$" + (i + 1))})`,
        values,
      );
    }
    if (table !== "settings")
      await db.query(
        `SELECT setval(pg_get_serial_sequence($1,'id'),COALESCE((SELECT max(id) FROM ${table}),1),(SELECT count(*)>0 FROM ${table}))`,
        [table],
      );
  }
  await db.query(
    "SELECT setval('invoice_seq',GREATEST(COALESCE((SELECT max(substring(number from '[0-9]+$')::bigint) FROM documents),0)+1,1),false)",
  );
  await db.query("COMMIT");
  console.log(
    "Backup restored to empty database. Sessions were not restored; sign in again.",
  );
} catch (error) {
  await db.query("ROLLBACK");
  console.error("Restore failed:", error.message);
  process.exitCode = 1;
} finally {
  db.release();
  await pool.end();
}
