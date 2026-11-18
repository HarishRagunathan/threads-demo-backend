import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, transaction } from "./db.js";

try {
  const data = await transaction(async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const backup = {
      format: "thread-ledger-demo-v1",
      created_at: new Date().toISOString(),
      tables: {},
    };
    for (const table of [
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
    ])
      backup.tables[table] = (await db.query(`SELECT * FROM ${table}`)).rows;
    return backup;
  });
  const directory = fileURLToPath(new URL("../backups/", import.meta.url));
  await mkdir(directory, { recursive: true });
  const filename = resolve(
    directory,
    "demo-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json",
  );
  await writeFile(filename, JSON.stringify(data, null, 2), { flag: "wx" });
  console.log("Demo backup saved: " + filename);
} catch (error) {
  console.error("Backup failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
