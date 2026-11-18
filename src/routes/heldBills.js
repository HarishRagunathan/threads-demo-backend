import { requirePermission } from "../middleware/permissions.js";
import { pool } from "../db.js";
import { z } from "zod";
import { text, number } from "../validation/common.js";
import { docSchema } from "../validation/documents.js";

export function register(app) {
  app.get("/api/held", requirePermission("sales"), async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT * FROM held_bills WHERE user_id=$1 ORDER BY id DESC",
          [req.user.id],
        )
      ).rows,
    ),
  );

  app.post("/api/held", requirePermission("sales"), async (req, res) => {
    const b = z
      .object({
        label: text.min(1),
        data: z.object({
          items: docSchema.shape.items,
          customer_id: number.nullable().optional(),
        }),
      })
      .parse(req.body);
    res.json(
      (
        await pool.query(
          "INSERT INTO held_bills(user_id,label,data) VALUES($1,$2,$3) RETURNING *",
          [req.user.id, b.label, b.data],
        )
      ).rows[0],
    );
  });

  app.delete("/api/held/:id", requirePermission("sales"), async (req, res) => {
    await pool.query("DELETE FROM held_bills WHERE id=$1 AND user_id=$2", [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  });
}
