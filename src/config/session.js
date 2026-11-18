export function sessionCookieOptions(env = process.env) {
  const production = env.NODE_ENV === "production";
  const sameSite = env.SESSION_COOKIE_SAME_SITE || (production ? "none" : "strict");
  if (!["strict", "lax", "none"].includes(sameSite)) {
    throw new Error("SESSION_COOKIE_SAME_SITE must be strict, lax, or none");
  }
  return {
    httpOnly: true,
    secure: production || sameSite === "none",
    sameSite,
    path: "/",
  };
}
