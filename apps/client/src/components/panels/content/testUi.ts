/**
 * Test helper: the real Prism components, imported from their own modules.
 * The @repo/ui index also pulls in better-auth and the tRPC client, so tests
 * mock "@repo/ui" with these plus a fake trpc.
 */
const UI = "../../../../../../packages/ui/src";

export async function prismUi() {
  const modules = await Promise.all([
    import(`${UI}/button`),
    import(`${UI}/prism/chip`),
    import(`${UI}/prism/states`),
    import(`${UI}/skeleton`),
    import(`${UI}/prism/menu`),
    import(`${UI}/dialog`),
    import(`${UI}/input`),
    import(`${UI}/Textarea`),
    import(`${UI}/Switch`),
    import(`${UI}/prism/tabs`),
    import(`${UI}/utils`),
  ]);
  return Object.assign({}, ...modules) as Record<string, unknown>;
}
