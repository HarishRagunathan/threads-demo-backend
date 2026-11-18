import { requirePermission } from "../middleware/permissions.js";
import { pool } from "../db.js";

export function register(app) {
  app.get("/api/payments", requirePermission("reports"), async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT p.*,d.number,d.kind FROM payments p JOIN documents d ON d.id=p.document_id ORDER BY p.id DESC LIMIT 1000",
        )
      ).rows,
    ),
  );
}
