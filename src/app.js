import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorHandler } from "./middleware/errorHandler.js";
import { register as health } from "./routes/health.js";
import { register as auth } from "./routes/auth.js";
import { register as settings } from "./routes/settings.js";
import { register as records } from "./routes/records.js";
import { register as products } from "./routes/products.js";
import { register as inventory } from "./routes/inventory.js";
import { register as documents } from "./routes/documents.js";
import { register as returns } from "./routes/returns.js";
import { register as payments } from "./routes/payments.js";
import { register as heldBills } from "./routes/heldBills.js";
import { register as shifts } from "./routes/shifts.js";
import { register as users } from "./routes/users.js";
import { register as audit } from "./routes/audit.js";
import { register as dashboard } from "./routes/dashboard.js";
import { register as reports } from "./routes/reports.js";
import { register as backup } from "./routes/backup.js";

export const app = express();
const origin = new URL(process.env.FRONTEND_URL || "http://127.0.0.1:5173").origin;
app.use(helmet());
app.use(cors({ origin, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== origin
  )
    return res.status(403).json({ error: "Origin not allowed" });
  next();
});
// Public endpoints first; auth registers the session guard before protected routes.
health(app);
auth(app);
settings(app);
records(app);
products(app);
inventory(app);
documents(app);
returns(app);
payments(app);
heldBills(app);
shifts(app);
users(app);
audit(app);
dashboard(app);
reports(app);
backup(app);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint not found" }),
);
app.use(errorHandler);
