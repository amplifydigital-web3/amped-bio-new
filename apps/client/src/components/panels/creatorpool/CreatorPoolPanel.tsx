import { useState } from "react";
import { CreatePoolForm } from "./CreatePoolForm";
import { PoolList } from "./PoolList";

// todo delete it
export function CreatorPoolPanel() {
  const [activeView, setActiveView] = useState<"list" | "create">("list");

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Creator Pool</h2>
        <p className="text-sm text-gray-500">
          Create and manage your staking pools to reward your supporters
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setActiveView(activeView === "list" ? "create" : "list")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {activeView === "list" ? "Create New Pool" : "View Pools"}
        </button>
      </div>

      {activeView === "list" ? (
        <PoolList />
      ) : (
        <CreatePoolForm onComplete={() => setActiveView("list")} />
      )}
    </div>
  );
}
