import { Request, Response, NextFunction } from 'express';

export const validateAuthInput = (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body.data;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  next();
};

export const validateAdminInput = (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.body.data;

  if (!id || id === '') {
    // Is this the right place for the admin check?
    return res.status(400).json({ message: 'Admin ID required' });
  }

  next();
};
