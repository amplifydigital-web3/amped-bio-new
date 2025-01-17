import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';

interface TokenUser {
  id: number;
  email: string;
}

export const generateToken = (user: TokenUser): string => {
  return jwt.sign(
    { id: user.id, email: user.email },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresIn }
  );
};