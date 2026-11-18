import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { pool, transaction } from "./db.js";

try {
  await pool.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(917420)");
    if ((await db.query("SELECT id FROM users LIMIT 1")).rowCount) return;
    if (!process.env.DEMO_ADMIN_PASSWORD || !process.env.DEMO_STAFF_PASSWORD)
      throw new Error("Set demo passwords in backend/.env");
    await db.query(
      "INSERT INTO users(name,username,password_hash,role,permissions) VALUES($1,$2,$3,'admin','{}'),($4,$5,$6,'staff',$7)",
      [
        "Demo Administrator",
        process.env.DEMO_ADMIN_USERNAME || "admin",
        await bcrypt.hash(process.env.DEMO_ADMIN_PASSWORD, 12),
        "Priya · Billing",
        "billing",
        await bcrypt.hash(process.env.DEMO_STAFF_PASSWORD, 12),
        ["sales", "customers", "discounts", "reprint"],
      ],
    );
    await db.query(
      "INSERT INTO categories(name) VALUES('Everyday essentials'),('Ethnic wear'),('Formal wear'),('Denim'),('Accessories')",
    );
    await db.query(
      "INSERT INTO brands(name) VALUES('Thread Studio'),('Urban Loom'),('Heritage'),('Everyday Co.')",
    );
    const products = [
      ["Oxford Cotton Shirt", 1, 1, 550, 999, 48],
      ["Linen Blend Kurta", 2, 3, 650, 1299, 32],
      ["Classic Straight Jeans", 4, 2, 850, 1599, 24],
      ["Everyday Cotton Tee", 1, 4, 220, 449, 65],
      ["Tailored Formal Trousers", 3, 1, 750, 1499, 18],
      ["Printed Cotton Saree", 2, 3, 950, 1899, 12],
      ["Woven Leather Belt", 5, 2, 250, 599, 7],
      ["Textured Polo Shirt", 1, 2, 400, 799, 4],
      ["Festive Embroidered Kurta", 2, 3, 1100, 2199, 5],
      ["Lightweight Overshirt", 1, 1, 700, 1399, 22],
      ["Classic Chinos", 3, 4, 600, 1199, 30],
      ["Cotton Handkerchief Set", 5, 4, 80, 199, 3],
    ];
    for (let i = 0; i < products.length; i++) {
      const [name, cat, brand, cost, price, stock] = products[i];
      const p = await db.query(
        "INSERT INTO products(name,code,barcode,category_id,brand_id,purchase_price,selling_price,stock,gst_rate,hsn,min_stock,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,5,'DEMO',8,'Fictional product for client demonstration') RETURNING id",
        [
          name,
          `PRD-${String(i + 1).padStart(4, "0")}`,
          `890100000${String(i + 1).padStart(3, "0")}`,
          cat,
          brand,
          cost,
          price,
          stock,
        ],
      );
      await db.query(
        "INSERT INTO stock_movements(product_id,quantity,reason,user_id) VALUES($1,$2,'Demo opening stock',1)",
        [p.rows[0].id, stock],
      );
    }
    await db.query(
      "INSERT INTO customers(name,mobile,address) VALUES('Ananya Sharma','9000000001','Demo address · Chennai'),('Rahul Mehta','9000000002','Demo address · Chennai'),('Meera Patel','9000000003','Demo address · Chennai')",
    );
    await db.query(
      "INSERT INTO suppliers(name,contact_person,mobile,address) VALUES('Loomline Distributors','Arun','9000000011','Demo supplier · Chennai'),('Heritage Textile Co.','Kavya','9000000012','Demo supplier · Surat')",
    );
    await db.query("INSERT INTO settings(id,data) VALUES(1,$1)", [
      JSON.stringify({
        shop_name: "Thread & Ledger",
        address: "24, Cotton Street, Chennai · Fictional demo shop",
        mobile: "9000000000",
        gstin: "DEMO — NOT A TAX INVOICE",
        footer: "Thank you for shopping with us. Client demonstration only.",
        credit_sales: true,
        tax_mode: "intra",
        gst_enabled: true,
        invoice_prefix: "TL",
        paper: "A4",
      }),
    ]);
  });
  console.log(
    "Database schema ready. Fictional demo data seeded only when no users exist.",
  );
} catch (error) {
  console.error("Setup failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
