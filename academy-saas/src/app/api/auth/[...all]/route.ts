import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/server/auth';

// Better Auth's endpoints (sign-in, sign-up, verify email, reset password, sign-out…).
export const { GET, POST } = toNextJsHandler(auth);
