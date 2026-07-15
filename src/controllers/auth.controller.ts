import { z } from 'zod';
import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import type { AuthRequest } from '../middleware/authenticate.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const authController = {
  async signup(req: Request, res: Response) {
    const result = signupSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }
    try {
      const data = await authService.signup(result.data.email, result.data.password);
      res.status(201).json(data);
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  },

  async signin(req: Request, res: Response) {
    const result = signinSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }
    try {
      const data = await authService.signin(result.data.email, result.data.password);
      res.json(data);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  },

  async refresh(req: Request, res: Response) {
    const result = refreshSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten().fieldErrors });
      return;
    }
    try {
      const data = await authService.refresh(result.data.refreshToken);
      res.json(data);
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  },

  async signout(req: Request, res: Response) {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      await authService.signout(refreshToken);
    }
    res.json({ message: 'Signed out.' });
  },

  me(req: Request, res: Response) {
    const { user } = req as AuthRequest;
    res.json({ user });
  },
};
