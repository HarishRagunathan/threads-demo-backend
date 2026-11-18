import { z } from "zod";
import { text, number } from "./common.js";

export const productSchema = z.object({
  name: text.min(1),
  code: z.string().trim().max(80).optional(),
  barcode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]*$/)
    .max(80)
    .optional(),
  category_id: z.coerce.number().int().positive().nullable().default(null),
  brand_id: z.coerce.number().int().positive().nullable().default(null),
  purchase_price: number,
  selling_price: number,
  gst_rate: number.max(100).default(5),
  hsn: text.default(""),
  min_stock: number.int().default(5),
  description: text.default(""),
  image: z.union([z.string().url(), z.literal("")]).default(""),
  active: z.boolean().default(true),
  opening_stock: number.int().default(0),
});
