import { cleanEnv, str, port, url } from 'envalid';

export const env = cleanEnv(process.env, {
  JWT_SECRET: str({
    desc: 'Secret key for JWT token generation and verification',
    default: 'your-default-jwt-secret-for-development',
  }),
  PORT: port({
    desc: 'Port for the server to listen on',
    default: 3000,
  }),
  SMTP2GO_API_KEY: str({
    desc: 'API key for SMTP2GO email service',
    default: '',
    example: 'api-XXXXXXXXXXXXXXXXXXXX',
  }),
  SMTP2GO_EMAIL: str({
    desc: 'Email address used for sending emails via SMTP2GO',
    default: 'noreply@example.com',
    example: 'noreply@yourdomain.com',
  }),
  VERCEL_PROJECT_PRODUCTION_URL: url({
    desc: 'URL for the server in production',
    default: 'http://localhost:3000',
    example: 'https://api.yourdomain.com',
  }),
});
