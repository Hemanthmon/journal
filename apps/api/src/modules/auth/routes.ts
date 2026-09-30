import { Router } from 'express';
import { loginSchema, refreshSchema, registerSchema, type ApiSuccess, type AuthResponse } from '@journal/shared';
import { validateBody } from '../../middleware/validate';
import { authIpLimiter, loginEmailLimiter } from '../../middleware/security';
import * as service from './service';

export function authRouter(opts: { rateLimitMax: number }): Router {
  const router = Router();
  router.use(authIpLimiter(opts.rateLimitMax));

  router.post('/register', validateBody(registerSchema), async (req, res) => {
    const body: ApiSuccess<AuthResponse> = { data: await service.register(req.body) };
    res.status(201).json(body);
  });

  router.post('/login', loginEmailLimiter(opts.rateLimitMax), validateBody(loginSchema), async (req, res) => {
    const body: ApiSuccess<AuthResponse> = { data: await service.login(req.body) };
    res.json(body);
  });

  router.post('/refresh', validateBody(refreshSchema), async (req, res) => {
    const body: ApiSuccess<AuthResponse> = { data: await service.refresh(req.body.refreshToken) };
    res.json(body);
  });

  router.post('/logout', validateBody(refreshSchema), async (req, res) => {
    await service.logout(req.body.refreshToken);
    res.status(204).end();
  });

  return router;
}
