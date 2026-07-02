import { protectedProcedure, publicProcedure, router } from "../index";
import { connectorsRouter } from "./connectors";
import { dashboardRouter } from "./dashboard";
import { findingsRouter } from "./findings";
import { reportsRouter } from "./reports";
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
  dashboard: dashboardRouter,
  findings: findingsRouter,
  reports: reportsRouter,
  scans: scansRouter,
  todo: todoRouter,
});
export type AppRouter = typeof appRouter;
