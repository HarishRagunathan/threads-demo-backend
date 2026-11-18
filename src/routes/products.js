import { pool, transaction } from "../db.js";
import { requirePermission } from "../middleware/permissions.js";
import { saveProduct } from "../services/products.js";
import { z } from "zod";
import { productSchema } from "../validation/products.js";

export function register(app) {
  app.get("/api/products", async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT p.*,c.name category,b.name brand FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id ORDER BY p.id DESC",
        )
      ).rows,
    ),
  );

  app.post("/api/products", requirePermission("products"), async (req, res) =>
    res.json(await transaction((db) => saveProduct(db, req.body, req.user))),
  );

  app.put(
    "/api/products/:id",
    requirePermission("products"),
    async (req, res) =>
      res.json(
        await transaction((db) =>
          saveProduct(db, req.body, req.user, req.params.id),
        ),
      ),
  );

  app.post(
    "/api/products/import",
    requirePermission("products"),
    async (req, res) => {
      const items = z.array(productSchema).min(1).max(500).parse(req.body);
      const result = await transaction(async (db) => {
        const rows = [];
        for (const item of items)
          rows.push(await saveProduct(db, item, req.user));
        return rows;
      });
      res.json({ imported: result.length });
    },
  );
}
