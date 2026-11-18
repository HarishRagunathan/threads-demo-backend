import { definitions } from "../config/records.js";
import { permitted, requirePermission } from "../middleware/permissions.js";
import { fail } from "../lib/errors.js";
import { pool, transaction, audit } from "../db.js";

export function register(app) {
  for (const [table, def] of Object.entries(definitions)) {
    app.get("/api/" + table, async (req, res) => {
      if (
        !["categories", "brands"].includes(table) &&
        !permitted(req.user, def.permission)
      )
        fail("Permission denied", 403);
      res.json(
        (await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`)).rows,
      );
    });
    const save = async (req, res) => {
      const b = def.schema.parse(req.body);
      if (table === "expenses") b.user_id = req.user.id;
      const keys = Object.keys(b),
        values = Object.values(b);
      const result = await transaction(async (db) => {
        const q = req.params.id
          ? `UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")} WHERE id=$${keys.length + 1} RETURNING *`
          : `INSERT INTO ${table}(${keys}) VALUES(${keys.map((_, i) => "$" + (i + 1))}) RETURNING *`;
        const r = await db.query(
          q,
          req.params.id ? [...values, req.params.id] : values,
        );
        if (!r.rowCount) fail("Record not found", 404);
        await audit(
          db,
          req.user,
          req.params.id ? "update" : "create",
          table,
          r.rows[0].id,
          b,
        );
        return r.rows[0];
      });
      res.json(result);
    };
    app.post("/api/" + table, requirePermission(def.permission), save);
    app.put("/api/" + table + "/:id", requirePermission(def.permission), save);
    app.delete(
      "/api/" + table + "/:id",
      requirePermission(def.permission),
      async (req, res) => {
        await transaction(async (db) => {
          const previous = (
            await db.query(`SELECT * FROM ${table} WHERE id=$1`, [
              req.params.id,
            ])
          ).rows[0];
          if (!previous) fail("Record not found", 404);
          await db.query(
            table === "expenses"
              ? `DELETE FROM ${table} WHERE id=$1`
              : `UPDATE ${table} SET active=false WHERE id=$1`,
            [req.params.id],
          );
          await audit(
            db,
            req.user,
            table === "expenses" ? "delete" : "deactivate",
            table,
            req.params.id,
            previous,
          );
        });
        res.json({ ok: true });
      },
    );
  }
}
