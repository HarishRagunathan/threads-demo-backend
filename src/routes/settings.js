import { pool, transaction, audit } from "../db.js";
import { requireAdmin } from "../middleware/permissions.js";
import { z } from "zod";
import { text } from "../validation/common.js";

export function register(app) {
  app.get("/api/settings", async (req, res) =>
    res.json(
      (await pool.query("SELECT data FROM settings WHERE id=1")).rows[0].data,
    ),
  );

  app.put("/api/settings", requireAdmin, async (req, res) => {
    const b = z
      .object({
        shop_name: text.min(1),
        address: text,
        mobile: text,
        gstin: text,
        footer: text,
        credit_sales: z.boolean(),
        tax_mode: z.enum(["intra", "inter"]),
        gst_enabled: z.boolean(),
        invoice_prefix: z.string().regex(/^[A-Z0-9-]{1,10}$/),
        paper: z.enum(["A4", "80mm"]),
      })
      .parse(req.body);
    await transaction(async (db) => {
      await db.query("UPDATE settings SET data=$1 WHERE id=1", [b]);
      await audit(db, req.user, "update", "settings", 1, b);
    });
    res.json(b);
  });
}
