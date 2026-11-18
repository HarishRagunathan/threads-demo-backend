import { z } from "zod";
import { text } from "../validation/common.js";
import { transaction, audit } from "../db.js";
import { fail } from "../lib/errors.js";
import bcrypt from "bcryptjs";

export async function saveUser(req, res) {
  const b = z
    .object({
      name: text.min(1),
      username: z.string().regex(/^[\w.-]{3,50}$/),
      password: z.string().min(10).max(200).optional(),
      mobile: text.default(""),
      permissions: z.array(
        z.enum([
          "sales",
          "products",
          "price_editing",
          "stock",
          "purchases",
          "customers",
          "returns",
          "refunds",
          "discounts",
          "reports",
          "expenses",
          "reprint",
        ]),
      ),
      active: z.boolean().default(true),
    })
    .parse(req.body);
  await transaction(async (db) => {
    let id = req.params.id;
    if (id) {
      const old = (
        await db.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!old) fail("Staff not found", 404);
      if (old.role === "admin")
        fail("Use your profile to change administrator password");
      await db.query(
        "UPDATE users SET name=$1,username=$2,mobile=$3,permissions=$4,active=$5 WHERE id=$6",
        [b.name, b.username, b.mobile, b.permissions, b.active, id],
      );
      if (b.password)
        await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
          await bcrypt.hash(b.password, 12),
          id,
        ]);
      await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    } else {
      if (!b.password) fail("Password required");
      id = (
        await db.query(
          "INSERT INTO users(name,username,password_hash,mobile,permissions,active,role) VALUES($1,$2,$3,$4,$5,$6,'staff') RETURNING id",
          [
            b.name,
            b.username,
            await bcrypt.hash(b.password, 12),
            b.mobile,
            b.permissions,
            b.active,
          ],
        )
      ).rows[0].id;
    }
    await audit(db, req.user, "save", "users", id, {
      name: b.name,
      permissions: b.permissions,
    });
  });
  res.json({ ok: true });
}
