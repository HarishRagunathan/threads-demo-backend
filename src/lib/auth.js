import { createHash } from "node:crypto";

export const hash = (value) => createHash("sha256").update(value).digest("hex");

export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
  permissions: u.permissions,
  active: u.active,
  mobile: u.mobile,
});
