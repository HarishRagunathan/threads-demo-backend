import "dotenv/config";
import pg from "pg";

pg.types.setTypeParser(1082, (value) => value);
const connectionUrl = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL)
  : null;
if (connectionUrl?.searchParams.get("sslmode") === "require")
  connectionUrl.searchParams.set("sslmode", "verify-full");
export const pool = new pg.Pool({
  connectionString: connectionUrl?.toString(),
  max: 10,
  connectionTimeoutMillis: 15000,
});
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function audit(db, user, action, entity, id, detail = {}) {
  await db.query(
    "INSERT INTO audit_logs(user_id,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)",
    [
      user?.id || null,
      action,
      entity,
      String(id ?? ""),
      JSON.stringify(detail),
    ],
  );
}
