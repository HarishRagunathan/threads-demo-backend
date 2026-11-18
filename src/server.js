import "dotenv/config";
import { app } from "./app.js";

const port = process.env.PORT || 4000;
app.listen(port, "127.0.0.1", () =>
  console.log("Textile retail demo API listening on port " + port),
);
