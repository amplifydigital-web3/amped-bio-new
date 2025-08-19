import { Button } from "@/components/ui/Button";
import { CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowUpRight, DollarSign, User, Wallet } from "lucide-react";

interface ProfileOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ProfileOptionsDialog({ open, onOpenChange }: ProfileOptionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-full mx-4 rounded-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] duration-300">
        <div className="flex items-center justify-between">
          <CardTitle>Profile Options</CardTitle>
        </div>

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          <User className="w-4 h-4 mr-2" />
          Edit Profile
        </Button>

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          <DollarSign className="w-4 h-4 mr-2" />
          Account Settings
        </Button>

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          <Wallet className="w-4 h-4 mr-2" />
          Wallet Settings
        </Button>

        <Button
          variant="outline"
          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          <ArrowUpRight className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default ProfileOptionsDialog;
