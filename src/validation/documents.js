import { z } from "zod";
import { number, text, method } from "./common.js";

export const docSchema = z.object({
  kind: z.enum(["sale", "purchase"]),
  customer_id: number.int().positive().nullable().default(null),
  supplier_id: number.int().positive().nullable().default(null),
  reference: text.default(""),
  idempotency_key: z.string().uuid(),
  items: z
    .array(
      z.object({
        product_id: number.int().positive(),
        quantity: number.int().positive().max(100000),
        price: number.optional(),
        discount: number.default(0),
      }),
    )
    .min(1)
    .max(200),
  payments: z
    .array(
      z.object({
        amount: number.positive(),
        method,
        reference: text.default(""),
      }),
    )
    .max(10)
    .default([]),
});
