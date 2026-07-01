import { env } from "@cipher-atlas/env/server";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// neon-serverless (WebSocket pool) is required over neon-http here because apps/server
// runs as a persistent process and the scan worker needs transactions, which neon-http
// (designed for stateless edge/serverless calls) does not support.
neonConfig.webSocketConstructor = ws;

export function createDb() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  return drizzle(pool, { schema });
}

export const db = createDb();
