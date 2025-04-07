import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

// Extend the Express Request interface to include the validatedData property
export interface ValidatedRequest<T> extends Request {
  validatedData: T;
}

export enum ValidationTarget {
  Body = 'body',
  Query = 'query',
  Params = 'params',
}

export const validate =
  <T extends AnyZodObject>(schema: T, target: ValidationTarget = ValidationTarget.Body) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = target === ValidationTarget.Body ? req.body.data : req[target];

      const validatedData = await schema.parseAsync(data);

      // Add the validated data to the request
      (req as ValidatedRequest<any>).validatedData = validatedData;

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      return res.status(500).json({
        message: 'Internal server error during validation',
      });
    }
  };
