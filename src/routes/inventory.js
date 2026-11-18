import { requirePermission } from "../middleware/permissions.js";
import { z } from "zod";
import { number, text } from "../validation/common.js";
import { transaction, audit, pool } from "../db.js";
import { fail } from "../lib/errors.js";

export function register(app) {
  app.post(
    "/api/stock/adjust",
    requirePermission("stock"),
    async (req, res) => {
      const b = z
        .object({
          product_id: number.int().positive(),
          quantity: z.coerce
            .number()
            .int()
            .min(-100000)
            .max(100000)
            .refine((v) => v !== 0),
          reason: text.min(3),
        })
        .parse(req.body);
      await transaction(async (db) => {
        const p = (
          await db.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [
            b.product_id,
          ])
        ).rows[0];
        if (!p) fail("Product not found", 404);
        if (p.stock + b.quantity < 0)
          fail("Adjustment would create negative stock");
        await db.query("UPDATE products SET stock=stock+$1 WHERE id=$2", [
          b.quantity,
          b.product_id,
        ]);
        await db.query(
          "INSERT INTO stock_movements(product_id,quantity,reason,user_id) VALUES($1,$2,$3,$4)",
          [b.product_id, b.quantity, b.reason, req.user.id],
        );
        await audit(
          db,
          req.user,
          "stock adjustment",
          "products",
          b.product_id,
          b,
        );
      });
      res.json({ ok: true });
    },
  );

  app.get("/api/stock", requirePermission("stock"), async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT m.*,p.name product,p.code,u.name staff FROM stock_movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 1000",
        )
      ).rows,
    ),
  );
}
