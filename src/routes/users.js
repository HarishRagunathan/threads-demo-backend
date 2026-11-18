import { requireAdmin } from "../middleware/permissions.js";
import { pool } from "../db.js";
import { publicUser } from "../lib/auth.js";
import { saveUser } from "../services/users.js";

export function register(app) {
  app.get("/api/users", requireAdmin, async (req, res) =>
    res.json(
      (await pool.query("SELECT * FROM users ORDER BY id")).rows.map(
        publicUser,
      ),
    ),
  );

  app.post("/api/users", requireAdmin, saveUser);

  app.put("/api/users/:id", requireAdmin, saveUser);
}
