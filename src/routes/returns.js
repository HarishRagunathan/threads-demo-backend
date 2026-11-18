import { requirePermission } from "../middleware/permissions.js";
import { pool } from "../db.js";

export function register(app) {
  app.get("/api/returns", requirePermission("returns"), async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT r.*,d.number,d.kind,i.product_name FROM returns r JOIN documents d ON d.id=r.document_id JOIN document_items i ON i.id=r.item_id ORDER BY r.id DESC",
        )
      ).rows,
    ),
  );
}
