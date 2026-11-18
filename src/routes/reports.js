import { requirePermission } from "../middleware/permissions.js";
import { z } from "zod";
import { fail } from "../lib/errors.js";
import { pool } from "../db.js";

export function register(app) {
  app.get("/api/reports", requirePermission("reports"), async (req, res) => {
    const from = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(req.query.from),
      to = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(req.query.to);
    if (from > to) fail("Invalid date range");
    const docs = (
      await pool.query(
        "SELECT d.*,COALESCE(c.name,s.name,'Walk-in customer') party,u.name staff FROM documents d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN suppliers s ON s.id=d.supplier_id JOIN users u ON u.id=d.user_id WHERE (d.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2 ORDER BY d.id DESC",
        [from, to],
      )
    ).rows;
    const items = (
      await pool.query(
        "SELECT i.*,d.kind,d.number,d.created_at,u.name staff,COALESCE(c.name,s.name,'Walk-in customer') party FROM document_items i JOIN documents d ON d.id=i.document_id JOIN users u ON u.id=d.user_id LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN suppliers s ON s.id=d.supplier_id WHERE d.status='completed' AND (d.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2",
        [from, to],
      )
    ).rows;
    const returns = (
      await pool.query(
        "SELECT r.*,d.kind,d.number,i.product_name,i.taxable,i.tax,i.quantity original_quantity,i.cost FROM returns r JOIN documents d ON d.id=r.document_id JOIN document_items i ON i.id=r.item_id WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2",
        [from, to],
      )
    ).rows;
    const expenses = (
      await pool.query(
        "SELECT * FROM expenses WHERE date BETWEEN $1 AND $2 ORDER BY date DESC",
        [from, to],
      )
    ).rows;
    const payments = (
      await pool.query(
        "SELECT p.*,d.number,d.kind FROM payments p JOIN documents d ON d.id=p.document_id WHERE (p.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2 ORDER BY p.id DESC",
        [from, to],
      )
    ).rows;
    const movements = (
      await pool.query(
        "SELECT m.*,p.name product FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE (m.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2 ORDER BY m.id DESC",
        [from, to],
      )
    ).rows;
    const sales = items.filter((i) => i.kind === "sale"),
      sr = returns.filter((r) => r.kind === "sale");
    const revenue =
      sales.reduce((s, i) => s + Number(i.taxable), 0) -
      sr.reduce(
        (s, r) => s + (Number(r.taxable) * r.quantity) / r.original_quantity,
        0,
      );
    const cogs =
      sales.reduce((s, i) => s + Number(i.cost) * i.quantity, 0) -
      sr
        .filter((r) => r.condition === "sellable")
        .reduce((s, r) => s + Number(r.cost) * r.quantity, 0);
    const expense = expenses.reduce((s, e) => s + Number(e.amount), 0);
    res.json({
      docs,
      items,
      returns,
      expenses,
      payments,
      movements,
      profit: {
        revenue,
        cogs,
        expenses: expense,
        profit: revenue - cogs - expense,
        method:
          "Weighted-average cost captured at sale; return-date revenue reversal; sellable returns reverse COGS; damaged returns retain COGS. GST excluded. Current cancellations excluded.",
      },
    });
  });
}
