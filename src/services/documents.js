import { fail } from "../lib/errors.js";
import { permitted } from "../middleware/permissions.js";

export async function balance(db, id) {
  return (
    await db.query(
      "SELECT d.total-COALESCE((SELECT sum(amount) FROM returns WHERE document_id=d.id),0) net,COALESCE((SELECT sum(CASE WHEN is_refund THEN -amount ELSE amount END) FROM payments WHERE document_id=d.id),0) paid FROM documents d WHERE d.id=$1",
      [id],
    )
  ).rows[0];
}

export async function allowedDocument(db, id, user) {
  const doc = (
    await db.query(
      "SELECT d.*, COALESCE(c.name,s.name,'Walk-in customer') party, u.name staff FROM documents d LEFT JOIN customers c ON c.id=d.customer_id LEFT JOIN suppliers s ON s.id=d.supplier_id JOIN users u ON u.id=d.user_id WHERE d.id=$1",
      [id],
    )
  ).rows[0];
  if (!doc) fail("Invoice not found", 404);
  if (!permitted(user, doc.kind === "sale" ? "sales" : "purchases"))
    fail("Permission denied", 403);
  if (
    user.role !== "admin" &&
    !permitted(user, "reports") &&
    doc.user_id !== user.id
  )
    fail("Permission denied", 403);
  return doc;
}
