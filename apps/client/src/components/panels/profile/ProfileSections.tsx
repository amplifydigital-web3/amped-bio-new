import { useState } from "react";
import { URLPicker } from "./URLPicker";
import { SecurityTabContent } from "./SecurityTabContent";
import { useEditor } from "../../../contexts/EditorContext";
import { useAuth } from "@repo/ui";
import { EmailChangeDialog } from "../../dialogs/EmailChangeDialog";

/** Account Settings content (D04): email, public URL, password and two factor. */
export function AccountSettings() {
  const { profile } = useEditor();
  const { authUser } = useAuth();
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);

  return (
    <>
      {/* Email Section */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-500">Email</p>
          <div className="flex items-center mt-1">
            <p className="text-base font-medium text-gray-900">
              {authUser?.email || profile.email}
            </p>
            <button
              onClick={() => setIsEmailDialogOpen(true)}
              className="ml-3 text-sm text-blue-600 hover:text-blue-800"
            >
              Change
            </button>
          </div>
        </div>
      </div>

      <hr className="my-6 border-gray-200" />

      <URLPicker />

      <hr className="my-6 border-gray-200" />

      <SecurityTabContent />

      {/* Email Change Dialog */}
      <EmailChangeDialog isOpen={isEmailDialogOpen} onClose={() => setIsEmailDialogOpen(false)} />
    </>
  );
}
