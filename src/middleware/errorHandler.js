import { z } from "zod";

export const errorHandler = (error, req, res, next) => {
  if (error instanceof z.ZodError)
    return res.status(400).json({
      error: error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  if (error.code === "23505")
    return res.status(409).json({
      error:
        "A record with this code, barcode, username, or reference already exists.",
    });
  if (error.code === "23503")
    return res.status(400).json({
      error: "A referenced record does not exist or is still in use.",
    });
  if (error.code === "23514")
    return res.status(400).json({
      error: "The operation violates stock or financial constraints.",
    });
  if (!error.status) console.error("API error:", error.message);
  res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "Unable to complete the request. Check the backend logs and database connection.",
  });
};
