import { pool } from "../db.js";

export function register(app) {
  app.get("/api/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true, mode: "client-demo" });
  });
}
