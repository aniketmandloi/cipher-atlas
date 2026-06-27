import { env } from "@cipher-atlas/env/web";
import { polarClient } from "@polar-sh/better-auth/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_SERVER_URL,
  plugins: [polarClient()],
});
