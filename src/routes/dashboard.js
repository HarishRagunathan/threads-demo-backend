import { z } from "zod";
import { permitted } from "../middleware/permissions.js";
import { pool } from "../db.js";

export function register(app) {
  app.get("/api/dashboard", async (req, res) => {
    const day = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(
        req.query.date ||
          new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
      );
    const admin = req.user.role === "admin" || permitted(req.user, "reports");
    const summary = (
      await pool.query(
        "SELECT COALESCE(sum(total) FILTER(WHERE kind='sale'),0) sales,count(*) FILTER(WHERE kind='sale') bills,COALESCE(sum(total) FILTER(WHERE kind='purchase'),0) purchases FROM documents WHERE status='completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=$1 AND ($2 OR user_id=$3)",
        [day, admin, req.user.id],
      )
    ).rows[0];
    const low = (
      await pool.query(
        "SELECT id,name,code,stock,min_stock FROM products WHERE active AND stock<=min_stock ORDER BY stock LIMIT 10",
      )
    ).rows;
    const recent = (
      await pool.query(
        "SELECT d.id,d.number,d.kind,d.total,d.status,d.created_at,COALESCE(c.name,s.name,'Walk-in customer') party FROM documents d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN suppliers s ON s.id=d.supplier_id WHERE ($1 OR d.user_id=$2) ORDER BY d.id DESC LIMIT 7",
        [admin, req.user.id],
      )
    ).rows;
    const chart = (
      await pool.query(
        "SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS \"day\",sum(total) total FROM documents WHERE kind='sale' AND status='completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date-6 AND $1::date AND ($2 OR user_id=$3) GROUP BY 1 ORDER BY 1",
        [day, admin, req.user.id],
      )
    ).rows;
    if (admin) {
      summary.expenses = (
        await pool.query(
          "SELECT COALESCE(sum(amount),0) total FROM expenses WHERE date=$1",
          [day],
        )
      ).rows[0].total;
      summary.stock_value = (
        await pool.query(
          "SELECT COALESCE(sum(stock*purchase_price),0) total FROM products",
        )
      ).rows[0].total;
    } else delete summary.purchases;
    res.json({ summary, low, recent, chart });
  });
}
