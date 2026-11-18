import { requireAdmin } from "../middleware/permissions.js";
import { transaction, audit, pool } from "../db.js";

export function register(app) {
  app.get("/api/backup", requireAdmin, async (req, res) => {
    const data = await transaction(async (db) => {
      await db.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const result = {
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
        result.tables[table] = (await db.query(`SELECT * FROM ${table}`)).rows;
      return result;
    });
    await audit(pool, req.user, "export", "backup", "");
    res.attachment("thread-ledger-demo-backup.json").json(data);
  });
}
