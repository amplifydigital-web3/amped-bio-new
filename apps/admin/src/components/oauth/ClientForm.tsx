import { useEffect, useId, useState } from "react";
import { AlertCircle, Check, ChevronDown, Globe, Plus, Smartphone, Trash2 } from "lucide-react";
import { Button, Checkbox, DialogFooter, Input, Notice, cn } from "@repo/ui";
import { canSkipConsent } from "@repo/constants";
import { Eyebrow, FieldError } from "../../kit/parts";

// Screen Review 094 I05, I06, I14 (D1). The client form shared by Create and
// Edit: Name, Redirect URIs as a list of wells with Remove and Add redirect
// URI, Application type tiles, Advanced (auth method, create only), and the
// two trusted client checkboxes. Skip the consent screen is enabled only when
// every redirect URI is on an Amped.Bio host; the server enforces the same.

export type AuthMethod = "client_secret_basic" | "client_secret_post" | "none" | "private_key_jwt";
export type AppType = "web" | "native";

export interface ClientFormValues {
  name: string;
  redirectUris: string[];
  applicationType: AppType;
  authMethod: AuthMethod;
  skipConsent: boolean;
  endSession: boolean;
}

export const AUTH_METHOD_LABELS: Record<AuthMethod, string> = {
  client_secret_basic: "Client secret (basic)",
  client_secret_post: "Client secret (post)",
  none: "Public, no secret",
  private_key_jwt: "Private key JWT",
};

const NAME_ERROR = "Give the client a name.";
const URI_ERROR = "Add at least one redirect URI.";
const URI_FORMAT = "Use a full address, for example https://example.com/callback.";

function validUri(value: string) {
  return /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(value.trim());
}

function Tile({
  selected,
  onSelect,
  icon,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "prism-focus flex min-h-commit flex-1 items-center gap-3 rounded-prism-13 px-4 text-left text-prism-label font-semibold text-prism-ink",
        selected ? "prism-lens-thumb" : "prism-chip"
      )}
    >
      {selected ? <Check aria-hidden className="h-5 w-5 text-prism-nav" /> : icon}
      {children}
    </button>
  );
}

export function ClientForm({
  mode,
  initial,
  busy,
  serverError,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial: ClientFormValues;
  busy: boolean;
  // Plain cause from the last failed submit (094 I10)
  serverError?: string;
  onCancel: () => void;
  onSubmit: (values: ClientFormValues) => void;
}) {
  const id = useId();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<{
    name?: string;
    uris?: string;
    uriRows?: Record<number, string>;
  }>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => setValues(initial), [initial]);

  const uris = values.redirectUris.map(u => u.trim()).filter(Boolean);
  const firstParty = canSkipConsent(uris);
  const skipConsent = values.skipConsent && firstParty;

  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) =>
    setValues(v => ({ ...v, [key]: value }));

  const setUri = (index: number, value: string) =>
    setValues(v => ({
      ...v,
      redirectUris: v.redirectUris.map((u, i) => (i === index ? value : u)),
    }));

  const validate = () => {
    const uriRows: Record<number, string> = {};
    values.redirectUris.forEach((u, i) => {
      if (u.trim() && !validUri(u)) uriRows[i] = URI_FORMAT;
    });
    const next = {
      name: values.name.trim() ? undefined : NAME_ERROR,
      uris: uris.length === 0 ? URI_ERROR : undefined,
      uriRows,
    };
    setErrors(next);
    return !next.name && !next.uris && Object.keys(uriRows).length === 0;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    onSubmit({ ...values, name: values.name.trim(), redirectUris: uris, skipConsent });
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <Input
        label="Name"
        value={values.name}
        maxLength={120}
        onChange={event => set("name", event.target.value)}
        onBlur={() => setErrors(e => ({ ...e, name: values.name.trim() ? undefined : NAME_ERROR }))}
        error={errors.name}
      />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-prism-label font-semibold text-prism-ink">
          Redirect URIs
        </legend>
        {values.redirectUris.map((uri, index) => (
          <div key={index} className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="prism-well flex h-touch min-w-0 flex-1 items-center px-3">
                <input
                  aria-label={`Redirect URI ${index + 1}`}
                  value={uri}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="https://"
                  onChange={event => setUri(index, event.target.value)}
                  onBlur={() =>
                    setErrors(e => {
                      const rows = { ...(e.uriRows ?? {}) };
                      if (uri.trim() && !validUri(uri)) rows[index] = URI_FORMAT;
                      else delete rows[index];
                      return { ...e, uriRows: rows, uris: undefined };
                    })
                  }
                  aria-invalid={errors.uriRows?.[index] ? true : undefined}
                  aria-describedby={errors.uriRows?.[index] ? `${id}-uri-${index}` : undefined}
                  className="h-full min-w-0 flex-1 bg-transparent font-prism-mono text-prism-code text-prism-ink placeholder:text-prism-ink-3 focus:outline-none"
                />
              </div>
              <button
                type="button"
                aria-label={`Remove redirect URI ${index + 1}`}
                disabled={values.redirectUris.length === 1}
                onClick={() =>
                  setValues(v => ({
                    ...v,
                    redirectUris: v.redirectUris.filter((_, i) => i !== index),
                  }))
                }
                className="prism-focus prism-btn-disabled inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint"
              >
                <Trash2 aria-hidden className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <FieldError id={`${id}-uri-${index}`}>{errors.uriRows?.[index]}</FieldError>
          </div>
        ))}
        {errors.uris && (
          <p role="alert" className="flex items-center gap-2 text-prism-meta text-prism-danger">
            <AlertCircle aria-hidden className="h-[21px] w-[21px]" />
            {errors.uris}
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setValues(v => ({ ...v, redirectUris: [...v.redirectUris, ""] }))}
        >
          <Plus aria-hidden />
          Add redirect URI
        </Button>
      </fieldset>

      <div className="space-y-2">
        <p id={`${id}-type`} className="text-prism-label font-semibold text-prism-ink">
          Application type
        </p>
        <div role="radiogroup" aria-labelledby={`${id}-type`} className="flex gap-3">
          <Tile
            selected={values.applicationType === "web"}
            onSelect={() => set("applicationType", "web")}
            icon={<Globe aria-hidden className="h-5 w-5 text-prism-ink-2" />}
          >
            Web app
          </Tile>
          <Tile
            selected={values.applicationType === "native"}
            onSelect={() => set("applicationType", "native")}
            icon={<Smartphone aria-hidden className="h-5 w-5 text-prism-ink-2" />}
          >
            Native app
          </Tile>
        </div>
      </div>

      {mode === "create" ? (
        <div className="border-y border-prism-line">
          <button
            type="button"
            aria-expanded={advancedOpen}
            aria-controls={`${id}-advanced`}
            onClick={() => setAdvancedOpen(o => !o)}
            className="prism-focus flex min-h-commit w-full items-center gap-3 text-left"
          >
            <span className="flex-1 text-prism-label font-semibold text-prism-ink">Advanced</span>
            <span className="text-prism-meta text-prism-ink-2">
              {AUTH_METHOD_LABELS[values.authMethod]}
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "h-5 w-5 text-prism-ink-2 transition-transform",
                advancedOpen && "rotate-180"
              )}
            />
          </button>
          {advancedOpen && (
            <div id={`${id}-advanced`} className="space-y-2 pb-3">
              <p id={`${id}-auth`} className="text-prism-meta text-prism-ink-2">
                Client authentication
              </p>
              <div
                role="radiogroup"
                aria-labelledby={`${id}-auth`}
                className="grid grid-cols-2 gap-2"
              >
                {(Object.keys(AUTH_METHOD_LABELS) as AuthMethod[]).map(method => (
                  <Tile
                    key={method}
                    selected={values.authMethod === method}
                    onSelect={() => set("authMethod", method)}
                  >
                    {AUTH_METHOD_LABELS[method]}
                  </Tile>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-prism-meta text-prism-ink-2">
          Client authentication: {AUTH_METHOD_LABELS[values.authMethod] ?? values.authMethod}. It is
          set when the client is created.
        </p>
      )}

      <div className="space-y-2">
        <Eyebrow as="p">Trusted client settings</Eyebrow>
        <Checkbox
          checked={skipConsent}
          disabled={!firstParty}
          onCheckedChange={checked => set("skipConsent", checked)}
          helper={
            firstParty
              ? "People are not asked to approve this app."
              : "Only Amped.Bio apps can skip consent."
          }
        >
          Skip the consent screen
        </Checkbox>
        {skipConsent && (
          <Notice variant="warning" title="People will not see a consent screen">
            This app gets every permission it asks for without asking the person, including email
            address and wallet address. It still appears in their Connected apps.
          </Notice>
        )}
        <Checkbox
          checked={values.endSession}
          onCheckedChange={checked => set("endSession", checked)}
          helper="The app can end the person's Amped.Bio session."
        >
          Allow sign out from the app
        </Checkbox>
      </div>

      {serverError && (
        <div role="alert" className="prism-slab flex items-start gap-3 px-4 py-3">
          <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-danger" />
          <p className="text-prism-meta text-prism-danger">{serverError}</p>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={busy} aria-busy={busy || undefined}>
          {mode === "create" ? "Create client" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
