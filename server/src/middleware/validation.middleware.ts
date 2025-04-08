import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { env } from '../env';

// Extend the Express Request interface to include the validatedData property
export interface ValidatedRequest<T> extends Request {
  validatedData: T;
}

export enum ValidationTarget {
  Body = 'body',
  Query = 'query',
  Params = 'params',
}

// Configuration interface for the validate middleware
interface ValidateOptions {
  enableLogs?: boolean;
}

// Default options based on environment
const defaultOptions: ValidateOptions = {
  enableLogs: env.isProd === false,
};

export const validate =
  <T extends AnyZodObject>(
    schema: T,
    target: ValidationTarget = ValidationTarget.Body,
    options: ValidateOptions = defaultOptions
  ) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const { enableLogs = defaultOptions.enableLogs } = options;

    if (enableLogs)
      console.log(`[Validation] Starting validation for ${target} data on path: ${req.path}`);
    if (enableLogs) console.log(`[Validation] Request method: ${req.method}`);

    try {
      const data = target === ValidationTarget.Body ? req.body : req[target];
      if (enableLogs) console.log('[Validation] Data to validate:', JSON.stringify(data, null, 2));
      if (enableLogs)
        console.log('[Validation] Using schema:', schema.description || schema.constructor.name);

      const validatedData = await schema.parseAsync(data);

      if (enableLogs) console.log(`[Validation] Validation successful for ${target}`);
      if (enableLogs)
        console.log('[Validation] Validated data:', JSON.stringify(validatedData, null, 2));

      // Add the validated data to the request
      (req as ValidatedRequest<any>).validatedData = validatedData;

      if (enableLogs) console.log('[Validation] Added validated data to request.validatedData');
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        if (enableLogs) {
          console.error(
            `[Validation] Validation failed for ${target} with ${error.errors.length} errors`
          );
          error.errors.forEach((err, index) => {
            console.error(
              `[Validation] Error ${index + 1}: Path: ${err.path.join('.')}, Message: ${err.message}`
            );
          });
        }

        return res.status(400).json({
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      if (enableLogs) console.error('[Validation] Unexpected error during validation:', error);
      return res.status(500).json({
        message: 'Internal server error during validation',
      });
    }
  };
