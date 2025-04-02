import bcrypt from 'bcrypt';

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePasswords = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {


  /**
   * Workaround for bcryptjs issue with comparing passwords hashed with PHP
   * Source: https://stackoverflow.com/questions/23015043/verify-password-hash-in-nodejs-which-was-generated-in-php
   */
  const parsedHashedPassword = hashedPassword.replace(/^\$2y(.+)$/i, '$2a$1');

  return bcrypt.compare(password, parsedHashedPassword);
};