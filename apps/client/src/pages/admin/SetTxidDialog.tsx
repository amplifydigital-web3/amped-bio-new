import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { trpc } from "../../utils/trpc/trpc";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

const txidSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid format — must be 0x followed by 64 hex characters");

const formSchema = z.object({
  txid: txidSchema,
});

type FormValues = z.infer<typeof formSchema>;

interface SetTxidDialogProps {
  isOpen: boolean;
  onClose: () => void;
  poolId: number;
  currentTxid: string | null | undefined;
  onSuccess: () => void;
}

export default function SetTxidDialog({
  isOpen,
  onClose,
  poolId,
  currentTxid,
  onSuccess,
}: SetTxidDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { txid: currentTxid || "" },
    mode: "onChange",
  });

  // Reset form when dialog opens with a different txid
  const resetKey = useMemo(() => currentTxid ?? "", [currentTxid]);

  const setTxidMutation = useMutation({
    mutationFn: trpc.admin.pools.setCreationTxid.mutationOptions().mutationFn,
    onSuccess: data => {
      toast.success(data.message);
      onSuccess();
      onClose();
    },
    onError: err => {
      toast.error(`Failed to set txid: ${err.message}`);
    },
  });

  const onSubmit = (data: FormValues) => {
    setTxidMutation.mutate({ poolId, creationTxid: data.txid });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
        else reset({ txid: currentTxid || "" });
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Pool Creation Txid</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" key={resetKey}>
          <div>
            <label htmlFor="txid" className="block text-sm font-medium mb-1">
              Transaction Hash (Txid)
            </label>
            <input
              id="txid"
              type="text"
              placeholder="0x..."
              {...register("txid")}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            {errors.txid && (
              <div className="flex items-center gap-1 mt-1 text-amber-600 dark:text-amber-400 text-xs">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                <span>{errors.txid.message}</span>
              </div>
            )}
            {!errors.txid && (
              <p className="text-xs text-gray-500 mt-1">
                The transaction hash of the pool creation transaction on-chain.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={setTxidMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={setTxidMutation.isPending || !isValid}>
              {setTxidMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
