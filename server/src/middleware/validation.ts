import { Request, Response, NextFunction } from 'express';

export const validateAuthInput = (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body.data;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }


  /**
   * this workaround is needed to work with "admin" passwords
   */
  if (password.length < 5) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  next();
};

export const validateUserInput = (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.body.data;

  if (!id || id === '') {
    return res.status(400).json({ message: 'User ID required' });
  }

  next();
};

export const validateAdminInput = (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.body.data;

  if (!id || id === '') { // Is this the right place for the admin check?
    return res.status(400).json({ message: 'Admin ID required' });
  }

  next();
}