import { productSchema } from "../validation/products.js";
import { fail } from "../lib/errors.js";
import { permitted } from "../middleware/permissions.js";
import { randomBytes } from "node:crypto";
import { audit } from "../db.js";

export async function saveProduct(db, input, user, id) {
  const b = productSchema.parse(input);
  const opening = b.opening_stock;
  delete b.opening_stock;
  if (id) {
    const old = (
      await db.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!old) fail("Product not found", 404);
    if (
      !permitted(user, "price_editing") &&
      (Number(old.selling_price) !== b.selling_price ||
        Number(old.purchase_price) !== b.purchase_price)
    )
      fail("Price editing permission required", 403);
    b.code = b.code || old.code;
    b.barcode = b.barcode || old.barcode;
  } else {
    b.code = b.code || "PRD-" + randomBytes(4).toString("hex").toUpperCase();
    b.barcode =
      b.barcode || "TL" + randomBytes(6).toString("hex").toUpperCase();
    b.stock = opening;
  }
  const keys = Object.keys(b),
    values = Object.values(b);
  const r = await db.query(
    id
      ? `UPDATE products SET ${keys.map((k, i) => `${k}=$${i + 1}`)} WHERE id=$${keys.length + 1} RETURNING *`
      : `INSERT INTO products(${keys}) VALUES(${keys.map((_, i) => "$" + (i + 1))}) RETURNING *`,
    id ? [...values, id] : values,
  );
  if (!id && opening)
    await db.query(
      "INSERT INTO stock_movements(product_id,quantity,reason,user_id) VALUES($1,$2,'Opening stock',$3)",
      [r.rows[0].id, opening, user.id],
    );
  await audit(db, user, id ? "update" : "create", "products", r.rows[0].id, b);
  return r.rows[0];
}
