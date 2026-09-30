declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      userId?: string;
    }
  }
}

export {};
