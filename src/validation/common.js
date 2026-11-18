import { z } from "zod";

export const number = z.coerce.number().finite().min(0).max(10000000);

export const text = z.string().trim().max(500);

export const method = z.enum(["Cash", "UPI", "Card", "Demo gateway"]);
