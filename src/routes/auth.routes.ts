import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.post('/signup', (req, res) => authController.signup(req, res));
router.post('/signin', (req, res) => authController.signin(req, res));
router.post('/refresh', (req, res) => authController.refresh(req, res));
router.post('/signout', (req, res) => authController.signout(req, res));
router.get('/me', authenticate, (req, res) => authController.me(req, res));

export default router;
