import { AlertTriangle } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui";
import { useEditor } from "../../../contexts/EditorContext";
import { useRNSNavigation } from "@/contexts/RNSNavigationContext";

// Moved unchanged from the retired Profile panel: tells the creator their
// RevoName expired or was registered by someone else.
export function RevoNameIssueDialog() {
  const { expiredRevoName, lostRevoName, dismissRevoName } = useEditor();
  const { navigateToMyNames } = useRNSNavigation();
  const isExpired = !!expiredRevoName;
  const affectedRevoName = expiredRevoName || lostRevoName;
  if (!affectedRevoName) return null;

  return (
    <Dialog open onOpenChange={open => !open && dismissRevoName()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              {isExpired ? "RevoName Expired" : "RevoName No Longer Yours"}
            </DialogTitle>
          </div>
        </DialogHeader>
        <DialogDescription className="text-sm text-gray-600 mt-2">
          Your RevoName{" "}
          <span className="font-semibold text-gray-900 break-all">{affectedRevoName}</span>{" "}
          {isExpired
            ? "has expired and is no longer displayed on your profile. Please register the name again to continue using it or select any other RevoName from your profile."
            : "has been registered by another user and is no longer displayed on your profile. You can register a new name or select a different one from your names."}
        </DialogDescription>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={dismissRevoName}>
            Dismiss
          </Button>
          <Button
            onClick={() => {
              dismissRevoName();
              navigateToMyNames();
            }}
          >
            Manage
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
