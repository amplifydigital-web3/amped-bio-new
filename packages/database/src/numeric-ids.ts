import { Prisma, PrismaClient } from "./generated/index.js";

// Int columns per model, e.g. { Account: Set { "id", "userId" } }.
const intFieldsByModel = new Map<string, Set<string>>(
  Prisma.dmmf.datamodel.models.map(model => [
    model.name,
    new Set(model.fields.filter(field => field.type === "Int").map(field => field.name)),
  ])
);

const NUMERIC_STRING = /^-?\d+$/;

const toInt = (value: unknown): unknown => {
  if (typeof value === "string" && NUMERIC_STRING.test(value)) return Number(value);
  if (Array.isArray(value)) return value.map(toInt);
  return value;
};

// Coerces a value assigned to an Int field: either a scalar/array or a filter
// object such as { equals, in, notIn, not, lt, gte, ... }.
const coerceIntValue = (value: unknown): unknown => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return toInt(value);
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, coerceIntValue(inner)]));
};

const coerceObject = (value: unknown, intFields: Set<string>): unknown => {
  if (Array.isArray(value)) return value.map(item => coerceObject(item, intFields));
  if (value === null || typeof value !== "object" || value instanceof Date || value instanceof Uint8Array) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => {
      if (intFields.has(key)) return [key, coerceIntValue(inner)];
      if (key === "AND" || key === "OR" || key === "NOT") return [key, coerceObject(inner, intFields)];
      return [key, inner];
    })
  );
};

/**
 * Better Auth serializes every id and id reference as a string unless
 * `generateId` is "serial". Because we use a custom `generateId` (UUID v7 for
 * OAuth tables), lookups such as `account.findMany({ where: { userId: "1" } })`
 * reach Prisma with strings for Int columns. This extension converts numeric
 * strings back to numbers for Int fields in `where` and `data` arguments.
 */
export function withNumericIdCoercion(client: PrismaClient) {
  return client.$extends({
    name: "numeric-id-coercion",
    query: {
      $allModels: {
        async $allOperations({ model, args, query }) {
          const intFields = intFieldsByModel.get(model);
          if (!intFields || intFields.size === 0 || !args || typeof args !== "object") return query(args);

          const nextArgs: Record<string, unknown> = { ...(args as Record<string, unknown>) };
          for (const key of ["where", "data", "create", "update"]) {
            if (key in nextArgs) nextArgs[key] = coerceObject(nextArgs[key], intFields);
          }
          return query(nextArgs as typeof args);
        },
      },
    },
  });
}
