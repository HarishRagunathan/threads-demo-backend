import { docSchema } from "../validation/documents.js";
import {
  permitted,
  requirePermission,
  requireAdmin,
} from "../middleware/permissions.js";
import { fail } from "../lib/errors.js";
import { transaction, audit, pool } from "../db.js";
import { calculateLine, money, cents } from "../money.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { allowedDocument, balance } from "../services/documents.js";
import { number, method, text } from "../validation/common.js";

export function register(app) {
  app.post("/api/documents", async (req, res) => {
    const b = docSchema.parse(req.body);
    if (!permitted(req.user, b.kind === "sale" ? "sales" : "purchases"))
      fail("Permission denied", 403);
    const result = await transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        b.idempotency_key,
      ]);
      const existing = (
        await db.query("SELECT id FROM documents WHERE idempotency_key=$1", [
          b.idempotency_key,
        ])
      ).rows[0];
      if (existing) return existing;
      const settings = (await db.query("SELECT data FROM settings WHERE id=1"))
        .rows[0].data;
      if (b.kind === "purchase" && !b.supplier_id) fail("Select a supplier");
      if (
        b.kind === "purchase" &&
        !(
          await db.query(
            "SELECT id FROM suppliers WHERE id=$1 AND active=true",
            [b.supplier_id],
          )
        ).rowCount
      )
        fail("Supplier is inactive or missing");
      if (
        b.customer_id &&
        !(
          await db.query(
            "SELECT id FROM customers WHERE id=$1 AND active=true",
            [b.customer_id],
          )
        ).rowCount
      )
        fail("Customer is inactive or missing");
      const ids = b.items.map((i) => i.product_id);
      if (new Set(ids).size !== ids.length)
        fail("Combine duplicate product lines");
      const products = (
        await db.query(
          "SELECT * FROM products WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE",
          [ids],
        )
      ).rows;
      const lines = b.items.map((i) => {
        const p = products.find((p) => p.id === i.product_id);
        if (!p || !p.active) fail("Product is unavailable");
        if (b.kind === "sale" && p.stock < i.quantity)
          fail("Insufficient stock: " + p.name);
        const base = Number(
          b.kind === "sale" ? p.selling_price : p.purchase_price,
        );
        const price = i.price ?? base;
        if (
          b.kind === "sale" &&
          price !== base &&
          !permitted(req.user, "price_editing")
        )
          fail("Price editing permission required", 403);
        if (i.discount && !permitted(req.user, "discounts"))
          fail("Discount permission required", 403);
        const rate = settings.gst_enabled ? Number(p.gst_rate) : 0;
        return {
          ...i,
          p,
          price,
          rate,
          ...calculateLine(price, i.quantity, i.discount, rate),
        };
      });
      const total = money(lines.reduce((sum, i) => sum + cents(i.total), 0));
      const paid = money(
        b.payments.reduce((sum, p) => sum + cents(p.amount), 0),
      );
      if (paid > total)
        fail(
          "Payments exceed invoice total. Record only the amount collected after change.",
        );
      if (
        b.kind === "sale" &&
        paid < total &&
        (!settings.credit_sales || !b.customer_id)
      )
        fail("Select a customer for credit or partial payment");
      const seq = (await db.query("SELECT nextval('invoice_seq') n")).rows[0].n;
      const doc = (
        await db.query(
          "INSERT INTO documents(number,kind,customer_id,supplier_id,user_id,subtotal,tax,total,tax_mode,reference,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
          [
            `${settings.invoice_prefix}-${b.kind === "sale" ? "S" : "P"}-${String(seq).padStart(5, "0")}`,
            b.kind,
            b.kind === "sale" ? b.customer_id : null,
            b.kind === "purchase" ? b.supplier_id : null,
            req.user.id,
            money(lines.reduce((s, l) => s + cents(l.taxable), 0)),
            money(lines.reduce((s, l) => s + cents(l.tax), 0)),
            total,
            settings.tax_mode,
            b.reference,
            b.idempotency_key,
          ],
        )
      ).rows[0];
      for (const l of lines) {
        await db.query(
          "INSERT INTO document_items(document_id,product_id,product_name,product_code,hsn,quantity,price,cost,discount,gst_rate,taxable,tax,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
          [
            doc.id,
            l.p.id,
            l.p.name,
            l.p.code,
            l.p.hsn,
            l.quantity,
            l.price,
            l.p.purchase_price,
            l.discount,
            l.rate,
            l.taxable,
            l.tax,
            l.total,
          ],
        );
        if (b.kind === "purchase")
          await db.query(
            "UPDATE products SET purchase_price=CASE WHEN stock+$1>0 THEN round((stock*purchase_price+$2)/(stock+$1),2) ELSE purchase_price END,stock=stock+$1 WHERE id=$3",
            [l.quantity, l.taxable, l.p.id],
          );
        else
          await db.query("UPDATE products SET stock=stock-$1 WHERE id=$2", [
            l.quantity,
            l.p.id,
          ]);
        await db.query(
          "INSERT INTO stock_movements(product_id,quantity,reason,document_id,user_id) VALUES($1,$2,$3,$4,$5)",
          [
            l.p.id,
            b.kind === "sale" ? -l.quantity : l.quantity,
            b.kind === "sale" ? "Sale" : "Purchase",
            doc.id,
            req.user.id,
          ],
        );
      }
      for (const p of b.payments)
        await db.query(
          "INSERT INTO payments(document_id,amount,method,reference,idempotency_key,user_id) VALUES($1,$2,$3,$4,$5,$6)",
          [doc.id, p.amount, p.method, p.reference, randomUUID(), req.user.id],
        );
      await audit(db, req.user, "complete", b.kind, doc.id, { total });
      return doc;
    });
    res.json(result);
  });

  app.get("/api/documents", async (req, res) => {
    const kind = z.enum(["sale", "purchase"]).parse(req.query.kind || "sale");
    if (!permitted(req.user, kind === "sale" ? "sales" : "purchases"))
      fail("Permission denied", 403);
    res.json(
      (
        await pool.query(
          "SELECT d.*,COALESCE(c.name,s.name,'Walk-in customer') party,u.name staff,COALESCE((SELECT sum(CASE WHEN is_refund THEN -amount ELSE amount END) FROM payments WHERE document_id=d.id),0) paid,COALESCE((SELECT sum(amount) FROM returns WHERE document_id=d.id),0) returned_amount FROM documents d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN suppliers s ON s.id=d.supplier_id JOIN users u ON u.id=d.user_id WHERE d.kind=$1 AND ($2::boolean OR d.user_id=$3) ORDER BY d.id DESC LIMIT 1000",
          [
            kind,
            req.user.role === "admin" || permitted(req.user, "reports"),
            req.user.id,
          ],
        )
      ).rows,
    );
  });

  app.get("/api/documents/:id", async (req, res) => {
    const doc = await allowedDocument(pool, req.params.id, req.user);
    const [items, payments, returns] = await Promise.all(
      ["document_items", "payments", "returns"].map((t) =>
        pool.query(`SELECT * FROM ${t} WHERE document_id=$1 ORDER BY id`, [
          doc.id,
        ]),
      ),
    );
    res.json({
      ...doc,
      items: items.rows,
      payments: payments.rows,
      returns: returns.rows,
    });
  });

  app.post(
    "/api/documents/:id/print",
    requirePermission("reprint"),
    async (req, res) => {
      await allowedDocument(pool, req.params.id, req.user);
      const previous = (
        await pool.query(
          "SELECT id FROM audit_logs WHERE entity='invoice' AND entity_id=$1 AND action='print'",
          [req.params.id],
        )
      ).rowCount;
      await audit(pool, req.user, "print", "invoice", req.params.id);
      res.json({ duplicate: previous > 0 });
    },
  );

  app.post("/api/documents/:id/payments", async (req, res) => {
    const b = z
      .object({
        amount: number.positive(),
        method,
        reference: text.default(""),
        idempotency_key: z.string().uuid(),
      })
      .parse(req.body);
    await transaction(async (db) => {
      const doc = await allowedDocument(db, req.params.id, req.user);
      await db.query("SELECT id FROM documents WHERE id=$1 FOR UPDATE", [
        doc.id,
      ]);
      if (doc.status !== "completed")
        fail("Cancelled invoices cannot receive payments");
      if (
        (
          await db.query("SELECT id FROM payments WHERE idempotency_key=$1", [
            b.idempotency_key,
          ])
        ).rowCount
      )
        return;
      const bal = await balance(db, doc.id);
      if (cents(b.amount) > cents(bal.net) - cents(bal.paid))
        fail("Payment exceeds outstanding balance");
      await db.query(
        "INSERT INTO payments(document_id,amount,method,reference,idempotency_key,user_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          doc.id,
          b.amount,
          b.method,
          b.reference,
          b.idempotency_key,
          req.user.id,
        ],
      );
      await audit(db, req.user, "payment", "documents", doc.id, b);
    });
    res.json({ ok: true });
  });

  app.post("/api/documents/:id/cancel", requireAdmin, async (req, res) => {
    const b = z.object({ reason: text.min(3), method }).parse(req.body);
    await transaction(async (db) => {
      const doc = (
        await db.query("SELECT * FROM documents WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!doc) fail("Invoice not found", 404);
      if (doc.status === "cancelled") return;
      const items = (
        await db.query(
          "SELECT * FROM document_items WHERE document_id=$1 ORDER BY product_id",
          [doc.id],
        )
      ).rows;
      if (items.some((i) => i.returned > 0))
        fail("Invoices with returns cannot be cancelled");
      for (const i of items) {
        const p = (
          await db.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [
            i.product_id,
          ])
        ).rows[0];
        const qty = doc.kind === "sale" ? i.quantity : -i.quantity;
        if (p.stock + qty < 0) fail("Not enough stock to cancel purchase");
        if (doc.kind === "purchase" && p.stock + qty > 0) {
          const remaining =
            cents(p.purchase_price) * p.stock - cents(i.taxable);
          if (remaining < 0)
            fail(
              "Purchase cancellation would invalidate inventory cost; use a purchase return",
            );
          await db.query("UPDATE products SET purchase_price=$1 WHERE id=$2", [
            money(Math.round(remaining / (p.stock + qty))),
            p.id,
          ]);
        }
        await db.query("UPDATE products SET stock=stock+$1 WHERE id=$2", [
          qty,
          p.id,
        ]);
        await db.query(
          "INSERT INTO stock_movements(product_id,quantity,reason,document_id,user_id) VALUES($1,$2,$3,$4,$5)",
          [p.id, qty, "Cancellation: " + b.reason, doc.id, req.user.id],
        );
      }
      const bal = await balance(db, doc.id);
      if (Number(bal.paid) > 0)
        await db.query(
          "INSERT INTO payments(document_id,amount,method,reference,is_refund,idempotency_key,user_id) VALUES($1,$2,$3,$4,true,$5,$6)",
          [
            doc.id,
            bal.paid,
            b.method,
            "Cancellation refund (demo)",
            randomUUID(),
            req.user.id,
          ],
        );
      await db.query("UPDATE documents SET status='cancelled' WHERE id=$1", [
        doc.id,
      ]);
      await audit(db, req.user, "cancel", "documents", doc.id, b);
    });
    res.json({ ok: true });
  });

  app.post("/api/documents/:id/returns", async (req, res) => {
    const b = z
      .object({
        item_id: number.int().positive(),
        quantity: number.int().positive(),
        reason: text.min(3),
        condition: z.enum(["sellable", "damaged"]),
        method,
        idempotency_key: z.string().uuid(),
      })
      .parse(req.body);
    await transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        b.idempotency_key,
      ]);
      if (
        (
          await db.query("SELECT id FROM returns WHERE idempotency_key=$1", [
            b.idempotency_key,
          ])
        ).rowCount
      )
        return;
      const doc = (
        await db.query("SELECT * FROM documents WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!doc || doc.status !== "completed")
        fail("A completed original invoice is required");
      if (!permitted(req.user, doc.kind === "sale" ? "returns" : "purchases"))
        fail("Return permission required", 403);
      const i = (
        await db.query(
          "SELECT * FROM document_items WHERE id=$1 AND document_id=$2",
          [b.item_id, doc.id],
        )
      ).rows[0];
      if (!i || i.returned + b.quantity > i.quantity)
        fail("Return quantity exceeds available quantity");
      const p = (
        await db.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [
          i.product_id,
        ])
      ).rows[0];
      const qty =
        doc.kind === "purchase"
          ? -b.quantity
          : b.condition === "sellable"
            ? b.quantity
            : 0;
      if (p.stock + qty < 0) fail("Insufficient stock for purchase return");
      const amount = money(
        Math.round((cents(i.total) * (i.returned + b.quantity)) / i.quantity) -
          Math.round((cents(i.total) * i.returned) / i.quantity),
      );
      await db.query(
        "INSERT INTO returns(document_id,item_id,quantity,amount,reason,condition,user_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          doc.id,
          i.id,
          b.quantity,
          amount,
          b.reason,
          b.condition,
          req.user.id,
          b.idempotency_key,
        ],
      );
      await db.query(
        "UPDATE document_items SET returned=returned+$1 WHERE id=$2",
        [b.quantity, i.id],
      );
      if (qty) {
        await db.query("UPDATE products SET stock=stock+$1 WHERE id=$2", [
          qty,
          p.id,
        ]);
        await db.query(
          "INSERT INTO stock_movements(product_id,quantity,reason,document_id,user_id) VALUES($1,$2,$3,$4,$5)",
          [p.id, qty, doc.kind + " return: " + b.reason, doc.id, req.user.id],
        );
      }
      const bal = await balance(db, doc.id);
      const refund = cents(bal.paid) - cents(bal.net);
      if (refund > 0) {
        if (!permitted(req.user, "refunds"))
          fail("Refund permission required", 403);
        await db.query(
          "INSERT INTO payments(document_id,amount,method,reference,is_refund,idempotency_key,user_id) VALUES($1,$2,$3,$4,true,$5,$6)",
          [
            doc.id,
            money(refund),
            b.method,
            "Return refund (demo)",
            randomUUID(),
            req.user.id,
          ],
        );
      }
      await audit(db, req.user, "return", "documents", doc.id, b);
    });
    res.json({ ok: true });
  });
}
