/**
 * Table and column names for Better Auth (snake_case, uuid ids). Shared by the running app and by
 * scripts/generate-auth-sql.mts, which turns it into the SQL migration — they can never drift apart.
 */
export const authSchemaOptions = {
  advanced: { database: { generateId: 'uuid' as const } },
  user: {
    modelName: 'auth_user',
    fields: { emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' },
    additionalFields: { locale: { type: 'string' as const, required: false, defaultValue: 'en', input: true } },
  },
  session: {
    modelName: 'auth_session',
    fields: { userId: 'user_id', expiresAt: 'expires_at', ipAddress: 'ip_address', userAgent: 'user_agent', createdAt: 'created_at', updatedAt: 'updated_at' },
    expiresIn: 60 * 60 * 24 * 7,        // 7 days
    updateAge: 60 * 60 * 24,            // refreshed daily while in use
  },
  account: {
    modelName: 'auth_account',
    fields: {
      userId: 'user_id', accountId: 'account_id', providerId: 'provider_id', accessToken: 'access_token', refreshToken: 'refresh_token',
      idToken: 'id_token', accessTokenExpiresAt: 'access_token_expires_at', refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at', updatedAt: 'updated_at',
    },
  },
  verification: {
    modelName: 'auth_verification',
    fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
  },
  rateLimit: { storage: 'database' as const, modelName: 'auth_rate_limit' },
};
