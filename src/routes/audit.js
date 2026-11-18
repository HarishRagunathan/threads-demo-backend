import { requireAdmin } from "../middleware/permissions.js";
import { pool } from "../db.js";

export function register(app) {
  app.get("/api/audit", requireAdmin, async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT a.*,u.name staff FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 1000",
        )
      ).rows,
    ),
  );
}
