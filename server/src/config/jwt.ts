import { Secret } from 'jsonwebtoken';

export const jwtConfig = {
  secret: process.env.JWT_SECRET as Secret || 'secret',
  expiresIn: '7d',
};