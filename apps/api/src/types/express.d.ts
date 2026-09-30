declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      userId?: string;
      /** Set by `requireDashboard` for read-only dashboard requests. */
      dashboard?: import('../modules/dashboard/auth').DashboardContext;
    }
  }
}

export {};
