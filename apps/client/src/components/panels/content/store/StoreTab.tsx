import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SalesView } from "./SalesView";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Package, Plus } from "lucide-react";
import {
  Button,
  ChipGroup,
  EmptyState,
  Input,
  Notice,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
  queryClient,
  trpc,
  trpcClient,
  useAuth,
} from "@repo/ui";
import {
  GO_LIVE_STEPS,
  STORE_COPY,
  STORE_LIMITS,
  STORE_POLICY_REFUND_DAYS,
  findPolicyLinks,
  requiredConfirmations,
  slugFromTitle,
  usdcDollarsLabel,
  type GoLiveStep,
  type OfferKind,
  type OfferStatus,
  type StorePolicyDraft,
} from "@repo/constants";

/**
 * Content, Store (content PR 9, C9; content spec 3.8, store-catalog.md 2 and 6, store policy
 * 3.1 to 3.5; boards st1, st2, st3, sp1 to sp3, sp7, k1). Sub tabs Storefront, Products,
 * Membership, Sales and Policy. Membership arrives with MB-2; Sales is C10 (SalesView).
 */

const LANDING = import.meta.env.VITE_LANDINGPAGE_URL ?? "";
const SUB_TABS = ["storefront", "products", "membership", "sales", "policy"] as const;
type SubTab = (typeof SUB_TABS)[number];

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Not saved. Check your connection.";
}

/** "1.50" to 1500000. Null for anything but a plain amount with up to 6 decimals. */
export function unitsFromUsdc(text: string): bigint | null {
  const match = /^\s*(\d{1,7})(?:\.(\d{1,6}))?\s*$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0") || "0");
}

function usdcText(units: string | bigint): string {
  const value = typeof units === "bigint" ? units : BigInt(units);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction.padEnd(2, "0")}` : whole.toString();
}

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-[21px]">
      <div className="flex flex-wrap items-center justify-between gap-[8px]">
        <h2 className="text-prism-h3 font-bold text-prism-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-[6px] text-prism-label text-prism-ink">
      <span className="font-bold">{label}</span>
      {children}
      {hint ? <span className="text-prism-caption text-prism-ink/70">{hint}</span> : null}
    </label>
  );
}

export function StoreTab({ onGoToLibrary }: { onGoToLibrary: () => void }) {
  const [sub, setSub] = useState<SubTab>("storefront");
  const t = STORE_COPY.tabs;
  return (
    <Tabs
      value={sub}
      onValueChange={value => setSub(value as SubTab)}
      className="flex flex-col gap-[21px]"
    >
      <TabsList aria-label="Store" className="flex flex-wrap">
        {SUB_TABS.map(tab => (
          <TabsTrigger key={tab} value={tab}>
            {t[tab]}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="storefront" className="mt-0">
        <StorefrontView onOpen={setSub} />
      </TabsContent>
      <TabsContent value="products" className="mt-0">
        <ProductsView onGoToLibrary={onGoToLibrary} />
      </TabsContent>
      <TabsContent value="membership" className="mt-0">
        <EmptyState
          icon={Package}
          title="Memberships come next"
          description="Plans, joins and renewals arrive with memberships. Your store sells products today."
        />
      </TabsContent>
      <TabsContent value="sales" className="mt-0">
        <SalesView />
      </TabsContent>
      <TabsContent value="policy" className="mt-0">
        <PolicyView />
      </TabsContent>
    </Tabs>
  );
}

// ------------------------------------------------------------------------ storefront

const STEP_ACTION: Partial<Record<GoLiveStep, { label: string; href?: string; tab?: SubTab }>> = {
  wallet: { label: "Open Wallet", href: "/wallet" },
  email: { label: "Verify email", href: "/account" },
  product: { label: "Open Products", tab: "products" },
  seller: { label: "Get paid", href: "/wallet?tab=rns" },
  policy: { label: "Open Policy", tab: "policy" },
};

function StorefrontView({ onOpen }: { onOpen: (tab: SubTab) => void }) {
  const { authUser } = useAuth();
  const handle = authUser?.handle ?? "";
  const store = useQuery(trpc.store.settings.get.queryOptions());
  const products = useQuery(trpc.store.products.list.queryOptions());
  const key = trpc.store.settings.get.queryKey();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", tagline: "", about: "", thankYouNote: "" });

  useEffect(() => {
    if (!store.data) return;
    setDraft({
      name: store.data.name ?? "",
      tagline: store.data.tagline ?? "",
      about: store.data.about ?? "",
      thankYouNote: store.data.thankYouNote ?? "",
    });
  }, [store.data]);

  const update = useMutation({
    mutationFn: (input: Parameters<typeof trpcClient.store.settings.update.mutate>[0]) =>
      trpcClient.store.settings.update.mutate(input),
    onSuccess: data => {
      queryClient.setQueryData(key, data);
      setError(null);
    },
    onError: failure => setError(errorText(failure)),
  });
  const acceptTerms = useMutation({
    mutationFn: () => trpcClient.store.acceptTerms.mutate(),
    onSuccess: data => queryClient.setQueryData(key, data),
    onError: failure => setError(errorText(failure)),
  });
  const setLive = useMutation({
    mutationFn: (live: boolean) => trpcClient.store.setLive.mutate({ live }),
    onSuccess: data => {
      queryClient.setQueryData(key, data);
      setError(null);
    },
    onError: failure => setError(errorText(failure)),
  });
  const recheck = useMutation({
    mutationFn: () => trpcClient.identity.recheck.mutate({ kind: "seller" }),
    onSettled: () => void store.refetch(),
  });

  if (store.isLoading)
    return <Loader2 aria-label="Loading" className="h-[24px] w-[24px] animate-spin" />;
  if (!store.data) return <Notice variant="error">{errorText(store.error)}</Notice>;
  const s = store.data;
  const ready = s.checklist.every(row => row.state !== "todo");
  const active = (products.data ?? []).filter(p => p.status === "active");
  const save = (field: keyof typeof draft) => {
    const value = draft[field].trim();
    if ((s[field] ?? "") === value) return;
    update.mutate({ [field]: value || null });
  };

  return (
    <div className="flex flex-col gap-[21px]">
      {!s.salesOn ? <Notice variant="info">{STORE_COPY.previewOnly}</Notice> : null}
      {error ? (
        <Notice variant="error" role="alert">
          {error}
        </Notice>
      ) : null}

      <Section
        title={STORE_COPY.goLive.title}
        aside={
          handle ? (
            <a
              href={`${LANDING}/${handle}/store?preview=1`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-touch items-center gap-[6px] text-prism-label font-bold text-prism-nav"
            >
              View store <ExternalLink aria-hidden className="h-[16px] w-[16px]" />
            </a>
          ) : null
        }
      >
        <ol className="flex flex-col gap-[8px]">
          {GO_LIVE_STEPS.map((step, index) => {
            const row = s.checklist.find(r => r.step === step);
            if (!row || row.state === "not_required") return null;
            const done = row.state === "done";
            const action = STEP_ACTION[step];
            return (
              <li
                key={step}
                className="flex flex-wrap items-center gap-[10px] text-prism-body text-prism-ink"
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-prism-ink text-prism-caption font-bold",
                    done && "bg-prism-ink text-white"
                  )}
                >
                  {done ? <Check className="h-[16px] w-[16px]" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="sr-only">{done ? "Done: " : "To do: "}</span>
                  {STORE_COPY.goLive.steps[step]}
                  {step === "adult" ? (
                    <span className="block text-prism-caption text-prism-ink/70">
                      {STORE_COPY.goLive.adultSub}
                    </span>
                  ) : null}
                </span>
                {!done && step === "terms" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => acceptTerms.mutate()}
                    disabled={acceptTerms.isPending}
                  >
                    Accept seller terms
                  </Button>
                ) : null}
                {!done && step === "seller" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => recheck.mutate()}
                    disabled={recheck.isPending}
                  >
                    Check again
                  </Button>
                ) : null}
                {!done && action ? (
                  action.tab ? (
                    <Button size="sm" variant="secondary" onClick={() => onOpen(action.tab!)}>
                      {action.label}
                    </Button>
                  ) : (
                    <a
                      href={action.href}
                      className="inline-flex min-h-touch items-center text-prism-label font-bold text-prism-nav"
                    >
                      {action.label}
                    </a>
                  )
                ) : null}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-[13px]">
          {s.status === "live" ? (
            <>
              <p className="text-prism-body text-prism-ink">{STORE_COPY.goLive.live}</p>
              <Button
                variant="secondary"
                onClick={() => setLive.mutate(false)}
                disabled={setLive.isPending}
              >
                {STORE_COPY.goLive.pause}
              </Button>
            </>
          ) : (
            <>
              {s.status === "paused" ? (
                <p className="text-prism-body text-prism-ink">{STORE_COPY.goLive.paused}</p>
              ) : null}
              <Button onClick={() => setLive.mutate(true)} disabled={!ready || setLive.isPending}>
                {STORE_COPY.goLive.action}
              </Button>
            </>
          )}
        </div>
      </Section>

      <Section title="Storefront">
        <Field
          label="Store name"
          hint={`Up to ${STORE_LIMITS.name} characters. Empty uses your display name.`}
        >
          <Input
            value={draft.name}
            maxLength={STORE_LIMITS.name}
            onChange={event => setDraft(d => ({ ...d, name: event.target.value }))}
            onBlur={() => save("name")}
          />
        </Field>
        <Field label="Tagline">
          <Input
            value={draft.tagline}
            maxLength={STORE_LIMITS.tagline}
            onChange={event => setDraft(d => ({ ...d, tagline: event.target.value }))}
            onBlur={() => save("tagline")}
          />
        </Field>
        <div className="flex flex-col gap-[6px]">
          <span className="text-prism-label font-bold text-prism-ink">Layout</span>
          <ChipGroup
            label="Layout"
            value={s.layout as "grid" | "list" | "feature"}
            onChange={layout => update.mutate({ layout })}
            options={[
              { value: "grid", label: "Grid" },
              { value: "list", label: "List" },
              { value: "feature", label: "Feature" },
            ]}
          />
        </div>
        <fieldset className="flex flex-col gap-[6px]">
          <legend className="text-prism-label font-bold text-prism-ink">Featured, up to 3</legend>
          {active.length ? (
            active.map(product => {
              const on = s.featuredOfferIds.includes(product.id);
              const full = !on && s.featuredOfferIds.length >= STORE_LIMITS.featured;
              return (
                <label
                  key={product.id}
                  className="flex min-h-touch items-center gap-[10px] text-prism-body text-prism-ink"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={full}
                    onChange={() =>
                      update.mutate({
                        featuredOfferIds: on
                          ? s.featuredOfferIds.filter(id => id !== product.id)
                          : [...s.featuredOfferIds, product.id],
                      })
                    }
                    className="h-[21px] w-[21px]"
                  />
                  {product.title}
                </label>
              );
            })
          ) : (
            <p className="text-prism-caption text-prism-ink/70">Active products show here.</p>
          )}
        </fieldset>
        <Field label="About">
          <Textarea
            value={draft.about}
            maxLength={STORE_LIMITS.about}
            rows={4}
            onChange={event => setDraft(d => ({ ...d, about: event.target.value }))}
            onBlur={() => save("about")}
          />
        </Field>
        <Field label="Thank you note" hint="Shown after a fan pays.">
          <Textarea
            value={draft.thankYouNote}
            maxLength={STORE_LIMITS.thankYouNote}
            rows={2}
            onChange={event => setDraft(d => ({ ...d, thankYouNote: event.target.value }))}
            onBlur={() => save("thankYouNote")}
          />
        </Field>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------------ products

type ProductRow = Awaited<ReturnType<typeof trpcClient.store.products.list.query>>[number];

function ProductsView({ onGoToLibrary }: { onGoToLibrary: () => void }) {
  const list = useQuery(trpc.store.products.list.queryOptions());
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = trpc.store.products.list.queryKey();
  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: OfferStatus }) =>
      trpcClient.store.products.setStatus.mutate(input),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: trpc.store.settings.get.queryKey() });
    },
    onError: failure => setError(errorText(failure)),
  });

  if (editing) {
    return (
      <ProductEditor
        product={editing === "new" ? null : editing}
        onDone={() => {
          setEditing(null);
          void queryClient.invalidateQueries({ queryKey: key });
        }}
      />
    );
  }
  if (list.isLoading)
    return <Loader2 aria-label="Loading" className="h-[24px] w-[24px] animate-spin" />;
  const rows = list.data ?? [];
  const p = STORE_COPY.products;
  return (
    <div className="flex flex-col gap-[13px]">
      {error ? (
        <Notice variant="error" role="alert">
          {error}
        </Notice>
      ) : null}
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden className="h-[18px] w-[18px]" /> {p.newProduct}
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="prism-glass-clear flex flex-col items-center gap-[13px] !rounded-prism-21 p-[34px]">
          <EmptyState icon={Package} title={p.empty} description={p.emptyBody} />
          <Button variant="secondary" onClick={onGoToLibrary}>
            {p.goToLibrary}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-[8px]">
          {rows.map(row => (
            <li
              key={row.id}
              className="prism-glass-clear flex flex-wrap items-center gap-[13px] !rounded-prism-13 p-[13px]"
            >
              {row.cover ? (
                <img
                  src={row.cover.src}
                  alt=""
                  className="h-[55px] w-[55px] rounded-prism-8 object-cover"
                />
              ) : (
                <span aria-hidden className="h-[55px] w-[55px] rounded-prism-8 bg-prism-ink/10" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-prism-body font-bold text-prism-ink">{row.title}</p>
                <p className="text-prism-caption text-prism-ink/70">
                  {p.statuses[row.status]} · {usdcDollarsLabel(row.amountUnits)} ·{" "}
                  {row.kind === "bundle" ? `Bundle, ${row.itemCount} items` : "Single"}
                  {row.needsAttention ? " · An item is not ready" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-[8px]">
                {row.status !== "archived" ? (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
                    Edit
                  </Button>
                ) : null}
                {row.status === "draft" || row.status === "paused" ? (
                  <Button
                    size="sm"
                    onClick={() => setStatus.mutate({ id: row.id, status: "active" })}
                    disabled={setStatus.isPending}
                  >
                    Activate
                  </Button>
                ) : null}
                {row.status === "active" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setStatus.mutate({ id: row.id, status: "paused" })}
                    disabled={setStatus.isPending}
                  >
                    Pause
                  </Button>
                ) : null}
                {row.status !== "archived" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus.mutate({ id: row.id, status: "archived" })}
                    disabled={setStatus.isPending}
                  >
                    Archive
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type LibraryRow = { publicId: string; title: string; kind: string };

function ProductEditor({ product, onDone }: { product: ProductRow | null; onDone: () => void }) {
  const library = useQuery(
    trpc.content.list.queryOptions({ status: "ready", publishState: "published", limit: 100 })
  );
  const fee = useQuery(trpc.store.feePreview.queryOptions());
  const [kind, setKind] = useState<OfferKind>(product?.kind ?? "single");
  const [title, setTitle] = useState(product?.title ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const [description, setDescription] = useState(product?.description ?? "");
  const [amount, setAmount] = useState(product ? usdcText(product.amountUnits) : "");
  const [period, setPeriod] = useState<"forever" | "30" | "365">(
    product?.accessPeriodDays ? (String(product.accessPeriodDays) as "30" | "365") : "forever"
  );
  const [items, setItems] = useState<string[]>(product?.items.map(i => i.publicId) ?? []);
  const [error, setError] = useState<string | null>(null);

  const units = unitsFromUsdc(amount);
  const net = useMemo(() => {
    if (units === null || !fee.data) return null;
    const feeUnits = (units * BigInt(fee.data.feeBps)) / 10_000n;
    return { net: units - feeUnits, percent: `${fee.data.feeBps / 100}%` };
  }, [units, fee.data]);

  const save = useMutation({
    mutationFn: () =>
      trpcClient.store.products.upsert.mutate({
        ...(product ? { id: product.id } : {}),
        kind,
        title: title.trim(),
        slug: slug || slugFromTitle(title),
        description: description.trim() || null,
        amountUnits: (units ?? 0n).toString(),
        accessPeriodDays: period === "forever" ? null : (Number(period) as 30 | 365),
        alsoInMembership: false,
        itemPublicIds: items,
        coverItemPublicId: null,
      }),
    onSuccess: onDone,
    onError: failure => setError(errorText(failure)),
  });

  const libraryItems = (library.data?.items ?? []) as unknown as (LibraryRow & {
    adult: boolean;
  })[];
  const rows: LibraryRow[] = libraryItems.filter(item => !item.adult);
  const toggle = (publicId: string) =>
    setItems(current =>
      kind === "single"
        ? [publicId]
        : current.includes(publicId)
          ? current.filter(id => id !== publicId)
          : current.length >= STORE_LIMITS.bundleItems
            ? current
            : [...current, publicId]
    );
  const canSave =
    title.trim().length > 0 &&
    units !== null &&
    items.length > 0 &&
    (kind === "bundle" || items.length === 1);

  return (
    <Section title={product ? "Edit product" : STORE_COPY.products.newProduct}>
      {error ? (
        <Notice variant="error" role="alert">
          {error}
        </Notice>
      ) : null}
      <div className="flex flex-col gap-[6px]">
        <span className="text-prism-label font-bold text-prism-ink">Kind</span>
        <ChipGroup
          label="Kind"
          value={kind}
          onChange={next => {
            setKind(next);
            if (next === "single") setItems(current => current.slice(0, 1));
          }}
          options={[
            { value: "single", label: "Single item" },
            { value: "bundle", label: "Bundle" },
          ]}
        />
      </div>
      <Field label="Title">
        <Input
          value={title}
          maxLength={STORE_LIMITS.title}
          onChange={event => {
            setTitle(event.target.value);
            if (!slugEdited) setSlug(slugFromTitle(event.target.value));
          }}
        />
      </Field>
      <Field label="Address" hint={`amped.bio/@you/store/${slug || "product"}`}>
        <Input
          value={slug}
          maxLength={STORE_LIMITS.slug}
          onChange={event => {
            setSlugEdited(true);
            setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
          }}
        />
      </Field>
      <Field label="Description">
        <Textarea
          value={description}
          maxLength={STORE_LIMITS.description}
          rows={4}
          onChange={event => setDescription(event.target.value)}
        />
      </Field>
      <Field
        label="Amount in USDC"
        hint={
          net
            ? STORE_COPY.feeLine(usdcDollarsLabel(net.net), net.percent)
            : STORE_COPY.errors.amount_range
        }
      >
        <Input
          inputMode="decimal"
          value={amount}
          placeholder="3.00"
          onChange={event => setAmount(event.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-[6px]">
        <span className="text-prism-label font-bold text-prism-ink">Access</span>
        <ChipGroup
          label="Access"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "forever", label: STORE_COPY.accessLine(null) },
            { value: "30", label: STORE_COPY.accessLine(30) },
            { value: "365", label: STORE_COPY.accessLine(365) },
          ]}
        />
      </div>
      <fieldset className="flex flex-col gap-[6px]">
        <legend className="text-prism-label font-bold text-prism-ink">
          {kind === "single" ? "Item" : `Items (${items.length} of ${STORE_LIMITS.bundleItems})`}
        </legend>
        {library.isLoading ? (
          <Loader2 aria-label="Loading" className="h-[20px] w-[20px] animate-spin" />
        ) : null}
        {!library.isLoading && rows.length === 0 ? (
          <p className="text-prism-caption text-prism-ink/70">
            Publish an item in your Library first.
          </p>
        ) : null}
        <ul className="flex max-h-[320px] flex-col overflow-y-auto">
          {rows.map(row => (
            <li key={row.publicId}>
              <label className="flex min-h-touch items-center gap-[10px] text-prism-body text-prism-ink">
                <input
                  type={kind === "single" ? "radio" : "checkbox"}
                  name="product-items"
                  checked={items.includes(row.publicId)}
                  onChange={() => toggle(row.publicId)}
                  className="h-[21px] w-[21px]"
                />
                <span className="min-w-0 flex-1 truncate">{row.title}</span>
                <span className="text-prism-caption capitalize text-prism-ink/70">{row.kind}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex flex-wrap gap-[13px]">
        <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
          {save.isPending ? (
            <Loader2 aria-hidden className="h-[18px] w-[18px] animate-spin" />
          ) : null}{" "}
          Save
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p className="text-prism-caption text-prism-ink/70">
        A new product saves as a draft. Activate it from Products once you are a verified seller and
        your store policy is published.
      </p>
    </Section>
  );
}

// ------------------------------------------------------------------------ policy

function PolicyView() {
  const policy = useQuery(trpc.store.policy.get.queryOptions());
  const key = trpc.store.policy.get.queryKey();
  const [draft, setDraft] = useState<StorePolicyDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (policy.data && !draft) setDraft(policy.data.draft);
  }, [policy.data, draft]);

  const preview = useQuery({
    ...trpc.store.policy.preview.queryOptions(
      draft ?? policy.data?.draft ?? ({} as StorePolicyDraft)
    ),
    enabled: Boolean(draft),
  });
  const saveDraft = useMutation({
    mutationFn: (next: StorePolicyDraft) => trpcClient.store.policy.saveDraft.mutate(next),
    onSuccess: () => setSaved(true),
    onError: failure => setError(errorText(failure)),
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (draft) await trpcClient.store.policy.saveDraft.mutate(draft);
      return trpcClient.store.policy.publish.mutate();
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: trpc.store.settings.get.queryKey() });
    },
    onError: failure => setError(errorText(failure)),
  });

  if (policy.isLoading || !draft)
    return <Loader2 aria-label="Loading" className="h-[24px] w-[24px] animate-spin" />;
  const change = (next: StorePolicyDraft) => {
    setDraft(next);
    setSaved(false);
  };
  const links = draft.mode === "custom" ? findPolicyLinks(draft.custom.text) : [];
  const required = requiredConfirmations(false);
  const sellerBlank = draft.seller.source === "legal" && !draft.seller.legalName.trim();
  const live = policy.data?.live;
  const pol = STORE_COPY.policy;

  return (
    <div className="flex flex-col gap-[21px]">
      {live ? (
        <Notice variant="success">
          {pol.published(
            live.version,
            new Date(live.publishedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          )}
        </Notice>
      ) : null}
      {error ? (
        <Notice variant="error" role="alert">
          {error}
        </Notice>
      ) : null}

      <Section title="Seller name">
        <ChipGroup
          label="Seller name"
          value={draft.seller.source}
          onChange={source =>
            change({
              ...draft,
              seller:
                source === "legal" ? { source: "legal", legalName: "" } : { source: "display" },
            })
          }
          options={[
            { value: "display", label: "My display name" },
            { value: "legal", label: "A legal or business name" },
          ]}
        />
        {draft.seller.source === "legal" ? (
          <Field
            label="Legal or business name"
            hint={sellerBlank ? STORE_COPY.errors.sellerName : undefined}
          >
            <Input
              value={draft.seller.legalName}
              maxLength={80}
              onChange={event =>
                change({ ...draft, seller: { source: "legal", legalName: event.target.value } })
              }
            />
          </Field>
        ) : null}
      </Section>

      <Section title="Policy">
        <ChipGroup
          label="Policy"
          value={draft.mode}
          onChange={mode => change({ ...draft, mode })}
          options={[
            { value: "standard", label: pol.standard },
            { value: "custom", label: pol.custom },
          ]}
        />
        {draft.mode === "standard" ? (
          <>
            <ChipGroup
              label="Refunds"
              value={
                draft.standard.refund.option === "A" ? "A" : String(draft.standard.refund.days)
              }
              onChange={value =>
                change({
                  ...draft,
                  standard: {
                    ...draft.standard,
                    refund:
                      value === "A"
                        ? { option: "A" }
                        : { option: "B", days: Number(value) as 3 | 7 | 14 },
                  },
                })
              }
              options={[
                { value: "A", label: "Sales are final, fixes within 7 days" },
                ...STORE_POLICY_REFUND_DAYS.map(days => ({
                  value: String(days),
                  label: `Refund within ${days} days`,
                })),
              ]}
            />
            <p className="text-prism-caption text-prism-ink/70">
              Contact: Amped messages, always on.
            </p>
            <Field label="Email (optional)">
              <Input
                type="email"
                value={draft.standard.email ?? ""}
                onChange={event =>
                  change({
                    ...draft,
                    standard: { ...draft.standard, email: event.target.value.trim() || null },
                  })
                }
              />
            </Field>
          </>
        ) : (
          <>
            {links.length ? (
              <Notice variant="warning">{STORE_COPY.errors.policy_link_typing(links[0]!)}</Notice>
            ) : null}
            <Field label="Your store policy">
              <Textarea
                value={draft.custom.text}
                rows={12}
                maxLength={20_000}
                onChange={event =>
                  change({ ...draft, custom: { ...draft.custom, text: event.target.value } })
                }
              />
            </Field>
            <fieldset className="flex flex-col gap-[6px]">
              <legend className="text-prism-label font-bold text-prism-ink">
                Your policy covers
              </legend>
              {required.map(confirmation => (
                <label
                  key={confirmation}
                  className="flex min-h-touch items-start gap-[10px] text-prism-body text-prism-ink"
                >
                  <input
                    type="checkbox"
                    className="mt-[3px] h-[21px] w-[21px]"
                    checked={draft.custom.confirmations.includes(confirmation)}
                    onChange={() => {
                      const has = draft.custom.confirmations.includes(confirmation);
                      change({
                        ...draft,
                        custom: {
                          ...draft.custom,
                          confirmations: has
                            ? draft.custom.confirmations.filter(c => c !== confirmation)
                            : [...draft.custom.confirmations, confirmation],
                        },
                      });
                    }}
                  />
                  {pol.confirmations[confirmation]}
                </label>
              ))}
            </fieldset>
          </>
        )}
      </Section>

      <Section title="Preview">
        {preview.data ? (
          <>
            <div
              className="rounded-prism-13 border-[1.5px] px-[16px] py-[13px] text-[14px] leading-[21px] md:text-[16px] md:leading-[24px]"
              style={{ background: "#FBF1DC", borderColor: "#16152B", color: "#16152B" }}
            >
              {preview.data.notice}
            </div>
            <div className="max-h-[420px] overflow-y-auto whitespace-pre-line text-prism-body text-prism-ink">
              {preview.data.text}
            </div>
          </>
        ) : (
          <Loader2 aria-label="Loading" className="h-[20px] w-[20px] animate-spin" />
        )}
      </Section>

      <div className="flex flex-col gap-[8px]">
        <div className="flex flex-wrap gap-[13px]">
          <Button
            variant="secondary"
            onClick={() => saveDraft.mutate(draft)}
            disabled={saveDraft.isPending}
          >
            {saved ? "Draft saved" : "Save draft"}
          </Button>
          <Button
            onClick={() => publish.mutate()}
            disabled={publish.isPending || sellerBlank || links.length > 0}
          >
            {pol.publish}
          </Button>
        </div>
        <p className="text-prism-caption text-prism-ink/70">{pol.publishFootnote}</p>
      </div>
    </div>
  );
}
