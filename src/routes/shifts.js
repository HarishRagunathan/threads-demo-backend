import { requirePermission } from "../middleware/permissions.js";
import { pool, transaction, audit } from "../db.js";
import { z } from "zod";
import { number } from "../validation/common.js";
import { fail } from "../lib/errors.js";

export function register(app) {
  app.get("/api/shifts", requirePermission("sales"), async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT * FROM shifts WHERE user_id=$1 ORDER BY id DESC",
          [req.user.id],
        )
      ).rows,
    ),
  );

  app.post("/api/shifts", requirePermission("sales"), async (req, res) => {
    const b = z
      .object({ amount: number, action: z.enum(["open", "close"]) })
      .parse(req.body);
    await transaction(async (db) => {
      if (b.action === "open")
        await db.query(
          "INSERT INTO shifts(user_id,opening_cash) VALUES($1,$2)",
          [req.user.id, b.amount],
        );
      else {
        const r = await db.query(
          "UPDATE shifts SET closing_cash=$1,closed_at=now() WHERE user_id=$2 AND closed_at IS NULL",
          [b.amount, req.user.id],
        );
        if (!r.rowCount) fail("No open shift");
      }
      await audit(db, req.user, "shift " + b.action, "shifts", req.user.id, b);
    });
    res.json({ ok: true });
  });
}
