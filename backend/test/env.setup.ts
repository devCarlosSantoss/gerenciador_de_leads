import "dotenv/config";
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://leads_app:leads_app_dev@localhost:5432/aurora_prospecting?schema=public";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-test-jwt-secret-test";
process.env.LOGIN_RATE_LIMIT = "1000";
process.env.LOGIN_MAX_ATTEMPTS = "5";