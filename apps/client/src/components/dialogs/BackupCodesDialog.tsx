import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface BackupCodesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  backupCodes: string[];
  onRegenerate?: () => void;
}

export function BackupCodesDialog({
  isOpen,
  onClose,
  backupCodes,
  onRegenerate,
}: BackupCodesDialogProps) {
  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      toast.success("Backup codes copied to clipboard");
    } catch {
      toast.error("Failed to copy backup codes");
    }
  };

  const handleDownload = () => {
    const content = backupCodes.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "amped-bio-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Backup codes downloaded");
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Backup Codes</DialogTitle>
          <DialogDescription>
            Store these codes in a safe place. Each code can only be used once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="grid grid-cols-1 gap-2">
              {backupCodes.map((code, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-1.5 bg-white rounded border border-gray-100"
                >
                  <span className="text-sm font-mono text-gray-900">
                    {index + 1}. {code}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCopyAll}
              className="flex-1"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy All
            </Button>
            <Button
              variant="outline"
              onClick={handleDownload}
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>

          {onRegenerate && (
            <div className="text-center">
              <button
                type="button"
                onClick={onRegenerate}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Generate new backup codes
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
