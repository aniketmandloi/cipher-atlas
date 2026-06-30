import { protectedProcedure, publicProcedure, router } from "../index";
import { connectorsRouter } from "./connectors";
import { findingsRouter } from "./findings";
import { scansRouter } from "./scans";
import { todoRouter } from "./todo";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  connectors: connectorsRouter,
  findings: findingsRouter,
  scans: scansRouter,
  todo: todoRouter,
});
export type AppRouter = typeof appRouter;
