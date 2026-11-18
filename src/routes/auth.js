import rateLimit from "express-rate-limit";
import { z } from "zod";
import { text } from "../validation/common.js";
import { pool, audit, transaction } from "../db.js";
import bcrypt from "bcryptjs";
import { fail } from "../lib/errors.js";
import { randomBytes } from "node:crypto";
import { hash, publicUser } from "../lib/auth.js";

export function register(app) {
  app.post(
    "/api/auth/login",
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }),
    async (req, res) => {
      const input = z
        .object({ username: text.min(1), password: z.string().max(200) })
        .parse(req.body);
      const user = (
        await pool.query(
          "SELECT * FROM users WHERE username=$1 AND active=true",
          [input.username],
        )
      ).rows[0];
      if (!user || !(await bcrypt.compare(input.password, user.password_hash)))
        fail("Incorrect username or password", 401);
      const token = randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')",
        [hash(token), user.id],
      );
      await audit(pool, user, "login", "users", user.id);
      res
        .cookie("session", token, {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          maxAge: 43200000,
        })
        .json(publicUser(user));
    },
  );

  app.use("/api", async (req, res, next) => {
    if (!req.cookies.session)
      return res.status(401).json({ error: "Please sign in" });
    const result = await pool.query(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true",
      [hash(req.cookies.session)],
    );
    if (!result.rowCount)
      return res.status(401).json({ error: "Your session has expired" });
    req.user = result.rows[0];
    next();
  });

  app.get("/api/auth/me", (req, res) => res.json(publicUser(req.user)));

  app.post("/api/auth/logout", async (req, res) => {
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      hash(req.cookies.session),
    ]);
    res.clearCookie("session").json({ ok: true });
  });

  app.post("/api/auth/password", async (req, res) => {
    const b = z
      .object({ current: z.string(), password: z.string().min(10).max(200) })
      .parse(req.body);
    if (!(await bcrypt.compare(b.current, req.user.password_hash)))
      fail("Current password is incorrect");
    await transaction(async (db) => {
      await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        await bcrypt.hash(b.password, 12),
        req.user.id,
      ]);
      await db.query("DELETE FROM sessions WHERE user_id=$1", [req.user.id]);
      await audit(db, req.user, "password changed", "users", req.user.id);
    });
    res.clearCookie("session").json({ ok: true });
  });
}
