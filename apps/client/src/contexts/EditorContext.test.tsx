import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { EditorProvider, useEditor, type EditorContextType } from "./EditorContext";

const mocks = vi.hoisted(() => ({
  authUser: { id: 1 },
  trpcClient: {
    handle: { getHandle: { query: vi.fn() } },
    rns: { getMyPageIdentity: { query: vi.fn() } },
    theme: { editTheme: { mutate: vi.fn() } },
    blocks: {
      addBlock: { mutate: vi.fn() },
      deleteBlock: { mutate: vi.fn() },
      editBlocks: { mutate: vi.fn() },
    },
    user: { edit: { mutate: vi.fn() }, setRnsName: { mutate: vi.fn() } },
  },
  navigate: vi.fn(),
  location: { pathname: "/", search: "" },
  toastError: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@repo/ui", () => ({
  useAuth: () => ({ authUser: mocks.authUser }),
  formatHandle: (handle: string) => handle,
  normalizeHandle: (handle: string) => handle,
  trpcClient: mocks.trpcClient,
  queryClient: { invalidateQueries: mocks.invalidateQueries, fetchQuery: vi.fn() },
  exportThemeConfigAsJson: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  default: { error: mocks.toastError, success: vi.fn() },
}));
vi.mock("react-router", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.location,
}));
vi.mock("@/utils/mergeTheme", () => ({
  mergeTheme: (current: Record<string, unknown>, theme: Record<string, unknown>) => ({
    ...current,
    ...theme,
  }),
}));
vi.mock("@/components/panels/page/rns/useMyPageIdentity", () => ({
  MY_PAGE_IDENTITY_KEY: ["my-page-identity"],
}));

let editor: EditorContextType;
function Probe() {
  editor = useEditor();
  return null;
}

function renderEditor() {
  return render(
    <EditorProvider>
      <Probe />
    </EditorProvider>
  );
}

function setOwnerProfile() {
  act(() => {
    editor.setProfile({
      id: 1,
      name: "Alice",
      handle: "alice",
      handleFormatted: "alice",
      email: "ada@example.com",
      bio: "bio",
      photoUrl: "",
      revoName: "",
    });
  });
}

describe("EditorContext autosave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser = { id: 1 };
    mocks.trpcClient.blocks.editBlocks.mutate.mockResolvedValue(true);
    mocks.trpcClient.user.edit.mutate.mockResolvedValue(true);
    mocks.trpcClient.theme.editTheme.mutate.mockResolvedValue({ id: 500 });
  });

  it("flushes a profile edit and reports saved once stored", async () => {
    renderEditor();
    setOwnerProfile();
    expect(editor.hasUnsavedChanges).toBe(true);

    await act(async () => {
      expect(await editor.flushSave()).toBe(true);
    });

    expect(editor.saveStatus).toBe("saved");
    expect(editor.hasUnsavedChanges).toBe(false);
    expect(mocks.trpcClient.blocks.editBlocks.mutate).toHaveBeenCalledWith({
      blocks: expect.any(Array),
    });
    expect(mocks.trpcClient.user.edit.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Alice", theme: expect.any(Number) })
    );
    // No theme change happened, so the theme stays untouched
    expect(mocks.trpcClient.theme.editTheme.mutate).not.toHaveBeenCalled();
  });

  it("creates a theme copy through theme.editTheme and stores the returned id", async () => {
    renderEditor();
    setOwnerProfile();
    act(() => {
      editor.replaceThemeConfig({ buttonColor: "#123456" } as never);
    });

    await act(async () => {
      expect(await editor.flushSave()).toBe(true);
    });

    expect(mocks.trpcClient.theme.editTheme.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(Number) })
    );
    expect(mocks.trpcClient.user.edit.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 500 })
    );
    await waitFor(() => expect(editor.theme.id).toBe(500));
  });

  it("a failed block save leaves the edits unsaved and sets the error status", async () => {
    mocks.trpcClient.blocks.editBlocks.mutate.mockResolvedValue(false);
    renderEditor();
    setOwnerProfile();

    await act(async () => {
      expect(await editor.flushSave()).toBe(false);
    });

    expect(editor.saveStatus).toBe("error");
    expect(editor.hasUnsavedChanges).toBe(true);
  });

  it("does not save when the session user does not own the profile", async () => {
    mocks.authUser = { id: 2 };
    renderEditor();
    setOwnerProfile();

    await act(async () => {
      expect(await editor.flushSave()).toBe(false);
    });

    expect(mocks.toastError).toHaveBeenCalledWith("Authentication error");
    expect(mocks.trpcClient.blocks.editBlocks.mutate).not.toHaveBeenCalled();
  });

  it("keepUnsavedEdits stashes edits only for an owner with unsaved changes", async () => {
    renderEditor();
    expect(editor.keepUnsavedEdits()).toBe(false);

    setOwnerProfile();
    expect(editor.keepUnsavedEdits()).toBe(true);

    // A full save clears the stash condition
    await act(async () => {
      await editor.flushSave();
    });
    expect(editor.keepUnsavedEdits()).toBe(false);
  });
});
