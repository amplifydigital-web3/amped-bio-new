import type { AppRouter } from "../../../../server/src/trpc";
import { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

/**
 * Infer input types from the AppRouter
 * Use this for type-safe input parameters to TRPC procedures
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Infer output types from the AppRouter
 * Use this for type-safe return values from TRPC procedures
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * Create a type for a specific TRPC procedure input
 * @example
 * type LoginInput = RouterInput<'auth', 'login'>; 
 */
export type RouterInput<TRouter extends keyof RouterInputs, TProcedure extends keyof RouterInputs[TRouter]> = 
  RouterInputs[TRouter][TProcedure];

/**
 * Create a type for a specific TRPC procedure output
 * @example
 * type LoginOutput = RouterOutput<'auth', 'login'>;
 */
export type RouterOutput<TRouter extends keyof RouterOutputs, TProcedure extends keyof RouterOutputs[TRouter]> = 
  RouterOutputs[TRouter][TProcedure];
