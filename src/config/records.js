import { z } from "zod";
import { text, number, method } from "../validation/common.js";

export const definitions = {
  categories: {
    permission: "products",
    schema: z.object({ name: text.min(1), active: z.boolean().default(true) }),
  },
  brands: {
    permission: "products",
    schema: z.object({ name: text.min(1), active: z.boolean().default(true) }),
  },
  customers: {
    permission: "customers",
    schema: z.object({
      name: text.min(1),
      mobile: text.default(""),
      email: z.union([z.string().email(), z.literal("")]).default(""),
      address: text.default(""),
      active: z.boolean().default(true),
    }),
  },
  suppliers: {
    permission: "purchases",
    schema: z.object({
      name: text.min(1),
      contact_person: text.default(""),
      mobile: text.default(""),
      email: z.union([z.string().email(), z.literal("")]).default(""),
      address: text.default(""),
      gstin: text.default(""),
      active: z.boolean().default(true),
    }),
  },
  expenses: {
    permission: "expenses",
    schema: z.object({
      category: z.enum([
        "Rent",
        "Electricity",
        "Salary",
        "Transport",
        "Maintenance",
        "Other Expenses",
      ]),
      description: text.min(1),
      amount: number.positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      method,
      notes: text.default(""),
    }),
  },
};
