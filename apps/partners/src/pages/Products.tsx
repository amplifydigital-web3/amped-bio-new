import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, ErrorCard, trpc } from "@repo/ui";
import { usdc, useMerchant } from "../merchant";
import { Badge, CodeField, Field, PageTitle, Panel, Table, td, th, tr } from "../parts";

// Board p2: the checks Authbase sells on the Identity tab. The product code matches the check
// Authbase runs (STANDARD, ENHANCED). Owners and Finance edit; the price shows as $N USDC.
type Form = {
  offerId: string;
  code: string;
  title: string;
  description: string;
  features: string;
  tag: string;
  price: string;
  rank: string;
  status: "draft" | "active" | "paused" | "archived";
};
const EMPTY: Form = {
  offerId: "",
  code: "",
  title: "",
  description: "",
  features: "",
  tag: "",
  price: "",
  rank: "0",
  status: "draft",
};

export function Products() {
  const merchant = useMerchant();
  const queryClient = useQueryClient();
  const list = useQuery(trpc.merchant.console.products.queryOptions({ merchantId: merchant.id }));
  const [form, setForm] = useState<Form>(EMPTY);
  const [code, setCode] = useState("");
  const canEdit = merchant.role === "owner" || merchant.role === "finance";
  const save = useMutation({
    ...trpc.merchant.console.saveProduct.mutationOptions(),
    onSuccess: () => {
      toast.success("Product saved.");
      setForm(EMPTY);
      setCode("");
      void queryClient.invalidateQueries({
        queryKey: trpc.merchant.console.products.queryKey({ merchantId: merchant.id }),
      });
    },
    onError: error => toast.error(error.message),
  });
  const units = /^\d+(\.\d{1,2})?$/.test(form.price)
    ? String(Math.round(Number(form.price) * 1_000_000))
    : "";
  if (list.isError)
    return <ErrorCard title="Products did not load" onRetry={() => void list.refetch()} />;

  return (
    <>
      <PageTitle>Products</PageTitle>
      <Table label="Products">
        <thead>
          <tr>
            <th className={th}>Code</th>
            <th className={th}>Title</th>
            <th className={th}>Price</th>
            <th className={th}>Status</th>
            <th className={th}>Sales</th>
            <th className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map(o => (
            <tr key={o.id} className={tr}>
              <td className={`${td} font-mono`}>{o.code}</td>
              <td className={td}>{o.title}</td>
              <td className={td}>{usdc(o.amountUnits)}</td>
              <td className={td}>
                <Badge tone={o.status === "active" ? "done" : "ink"}>
                  {o.status === "active" ? "On sale" : o.status}
                </Badge>
              </td>
              <td className={td}>{o.salesCount}</td>
              <td className={td}>
                {canEdit && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setForm({
                        offerId: o.id,
                        code: o.code ?? "",
                        title: o.title,
                        description: o.description ?? "",
                        features: o.features.join("\n"),
                        tag: o.tag ?? "",
                        price: (Number(o.amountUnits) / 1_000_000).toFixed(2),
                        rank: String(o.rank),
                        status: o.status as Form["status"],
                      })
                    }
                  >
                    Edit
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {canEdit && (
        <Panel title={form.offerId ? "Edit product" : "New product"}>
          <div className="grid gap-[13px] sm:grid-cols-2">
            <Field
              label="Product code"
              value={form.code}
              onChange={code => setForm({ ...form, code })}
              hint="STANDARD or ENHANCED, the check you run"
            />
            <Field
              label="Title"
              value={form.title}
              onChange={title => setForm({ ...form, title })}
            />
            <Field
              label="Short description"
              value={form.description}
              onChange={description => setForm({ ...form, description })}
            />
            <Field
              label="Tag"
              value={form.tag}
              onChange={tag => setForm({ ...form, tag })}
              hint="For fans, For creators"
            />
            <Field
              label="Price in USDC"
              value={form.price}
              inputMode="decimal"
              onChange={price => setForm({ ...form, price })}
              hint="The buyer pays this. It includes the Amped.Bio fee."
            />
            <Field
              label="Order on the page"
              value={form.rank}
              inputMode="numeric"
              onChange={rank => setForm({ ...form, rank })}
            />
            <label className="flex flex-col gap-1 text-prism-label font-semibold sm:col-span-2">
              Feature lines (one per line, up to four)
              <textarea
                rows={4}
                value={form.features}
                onChange={e => setForm({ ...form, features: e.target.value })}
                className="prism-focus rounded-[13px] p-3"
              />
            </label>
            <label className="flex flex-col gap-1 text-prism-label font-semibold">
              Status
              <select
                className="prism-focus h-touch rounded-[13px] px-3"
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value as Form["status"] })}
              >
                <option value="draft">Draft</option>
                <option value="active">On sale</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <CodeField value={code} onChange={setCode} />
          <Button
            disabled={save.isPending || !units || !form.code || !form.title || code.length !== 6}
            onClick={() =>
              save.mutate({
                merchantId: merchant.id,
                ...(form.offerId ? { offerId: form.offerId } : {}),
                code: form.code,
                title: form.title,
                description: form.description || null,
                features: form.features
                  .split("\n")
                  .map(f => f.trim())
                  .filter(Boolean)
                  .slice(0, 4),
                tag: form.tag || null,
                amountUnits: units,
                rank: Number(form.rank) || 0,
                status: form.status,
                code2fa: code,
              })
            }
          >
            Save product
          </Button>
        </Panel>
      )}
    </>
  );
}
