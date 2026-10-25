import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UserModel } from '../models/User.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { 
  RegisterRequest, 
  LoginRequest, 
  AuthResponseData, 
  SafeUser 
} from '@dbi/shared-types';

export const authRouter = Router();

function generateToken(userId: string, role: string, email: string): string {
  return jwt.sign(
    { userId, role, email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}

/**
 * POST /api/v1/auth/register
 */
authRouter.post('/register', authRateLimiter, async (req, res: Response) => {
  try {
    const { name, email, password, role } = req.body as RegisterRequest;

    if (!name || !email || !password) {
      sendError(res, 400, 'BAD_REQUEST', 'Name, email, and password are required');
      return;
    }

    if (password.length < 6) {
      sendError(res, 400, 'BAD_REQUEST', 'Password must be at least 6 characters long');
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await UserModel.findOne({ email: normalizedEmail });
    if (existing) {
      sendError(res, 409, 'CONFLICT', `User with email '${normalizedEmail}' already exists`);
      return;
    }

    // Role assignment (only allow SUPER_ADMIN if explicitly in dev or default to SHOP_OWNER)
    const assignedRole = role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'SHOP_OWNER';

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await UserModel.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: assignedRole,
      status: 'ACTIVE',
    });

    const token = generateToken(user._id.toString(), user.role, user.email);
    const safeUser = user.toSafeObject();

    sendSuccess<AuthResponseData>(res, { user: safeUser as any, token }, 201);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Registration failed');
  }
});

/**
 * POST /api/v1/auth/login
 */
authRouter.post('/login', authRateLimiter, async (req, res: Response) => {
  try {
    const { email, password } = req.body as LoginRequest;

    if (!email || !password) {
      sendError(res, 400, 'BAD_REQUEST', 'Email and password are required');
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await UserModel.findOne({ email: normalizedEmail });

    if (!user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Invalid email or password');
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      sendError(res, 401, 'UNAUTHORIZED', 'Invalid email or password');
      return;
    }

    if (user.status === 'SUSPENDED') {
      sendError(res, 403, 'FORBIDDEN', 'User account is suspended');
      return;
    }

    const token = generateToken(user._id.toString(), user.role, user.email);
    const safeUser = user.toSafeObject();

    sendSuccess<AuthResponseData>(res, { user: safeUser as any, token });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Login failed');
  }
});

/**
 * GET /api/v1/auth/me
 */
authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  sendSuccess<SafeUser>(res, req.user.toSafeObject());
});
