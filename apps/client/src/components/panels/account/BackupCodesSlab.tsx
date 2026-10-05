import { Copy, Download } from "lucide-react";
import { Button } from "@repo/ui";
import { toast } from "@/components/ui/toast";

// Screen Review 021 I07. Backup codes on a G2 slab: rows min 44, two columns
// on desktop and one on phones. Each row copies its code. Copy all and
// Download sit under the slab. Used in setup step 4 and after New backup codes.

const FILE_NAME = "amped-bio-backup-codes.txt";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function BackupCodesSlab({ codes }: { codes: string[] }) {
  const copyOne = async (code: string) => {
    if (await copyText(code)) toast.add({ type: "success", title: "Code copied" });
    else toast.add({ type: "error", title: "The code did not copy. Select it and copy it." });
  };

  const copyAll = async () => {
    if (await copyText(codes.join("\n"))) toast.add({ type: "success", title: "Codes copied" });
    else toast.add({ type: "error", title: "The codes did not copy. Use Download instead." });
  };

  const download = () => {
    const blob = new Blob([`Amped.Bio backup codes\n\n${codes.join("\n")}\n`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = FILE_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.add({ type: "success", title: "Codes downloaded" });
  };

  return (
    <div className="space-y-[13px]">
      <ul
        aria-label="Backup codes"
        className="prism-well grid grid-cols-1 overflow-hidden !rounded-prism-21 sm:grid-cols-2"
      >
        {codes.map((code, index) => (
          <li
            key={code}
            // -mb-px tucks the last row's divider under the clipped edge
            className="-mb-px border-b border-prism-line sm:odd:border-r"
          >
            <button
              type="button"
              onClick={() => void copyOne(code)}
              aria-label={`Copy code ${index + 1}`}
              className="prism-focus group flex min-h-touch w-full items-center gap-3 px-4 text-left"
            >
              <span className="w-6 text-prism-meta tabular-nums text-prism-ink-2">
                {index + 1}.
              </span>
              <span className="flex-1 font-mono text-prism-label font-semibold tabular-nums text-prism-ink">
                {code}
              </span>
              <Copy
                aria-hidden
                className="h-[21px] w-[21px] text-prism-ink-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-prism-meta text-prism-ink-2">
        Each code works once. Keep them somewhere safe.
      </p>
      <div className="flex gap-[13px]">
        <Button
          type="button"
          variant="secondary"
          onClick={() => void copyAll()}
          className="flex-1 sm:flex-none"
        >
          <Copy aria-hidden />
          Copy all
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={download}
          className="flex-1 sm:flex-none"
        >
          <Download aria-hidden />
          Download
        </Button>
      </div>
    </div>
  );
}
