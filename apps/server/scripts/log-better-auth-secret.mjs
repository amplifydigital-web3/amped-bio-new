// Runs before `build` (wired through the `prebuild` script in package.json) so the
// value Better Auth would receive from the build environment is visible in the
// build log.
//
// Better Auth encrypts TOTP secrets and backup codes with BETTER_AUTH_SECRET, so
// the same value has to be used for the lifetime of the database. This log exists
// to compare the secret used by each environment (for example the old Vercel
// project) before restoring it somewhere else.
//
// Values are printed with JSON.stringify so surrounding whitespace is visible: a
// value pasted with a leading or trailing space is a different secret.
const names = ["BETTER_AUTH_SECRET", "AUTH_SECRET"];

console.log("[prebuild] Better Auth secret in the build environment:");

let found = false;
for (const name of names) {
  const value = process.env[name];
  if (value !== undefined) found = true;

  const state = value === undefined ? "unset" : value === "" ? "empty" : `length ${value.length}`;
  console.log(`[prebuild]   ${name} = ${JSON.stringify(value ?? null)} (${state})`);
}

if (!found) {
  console.log(
    "[prebuild]   neither variable is set, so Better Auth would fall back to its built-in default secret"
  );
}
