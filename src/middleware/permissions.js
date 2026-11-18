export const permitted = (user, p) =>
  user.role === "admin" || user.permissions.includes(p);

export const requirePermission = (p) => (req, res, next) => {
  if (!permitted(req.user, p))
    return res
      .status(403)
      .json({ error: "This action requires " + p + " permission" });
  next();
};

export const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Administrator access required" });
  next();
};
