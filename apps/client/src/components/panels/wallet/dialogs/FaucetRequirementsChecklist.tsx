import { Check, ArrowRight } from "lucide-react";
import { useEditor } from "../../../../contexts/EditorContext";
import type { EditorPanelType } from "../../../../types/editor";

type FaucetRequirements = {
  photo: boolean;
  background: boolean;
  bio: boolean;
  minLinks: boolean;
};

interface Requirement {
  key: keyof FaucetRequirements;
  label: string;
  description: string;
  completed: boolean;
  panel: EditorPanelType;
  actionLabel: string;
}

interface FaucetRequirementsChecklistProps {
  requirements: FaucetRequirements;
  onActionClick?: () => void;
}

const STEPS: Omit<Requirement, "completed">[] = [
  {
    key: "photo",
    label: "Profile Photo",
    description: "Upload a profile picture",
    panel: "profile",
    actionLabel: "Upload Photo",
  },
  {
    key: "background",
    label: "Background",
    description: "Set a background for your page",
    panel: "gallery",
    actionLabel: "Set Background",
  },
  {
    key: "bio",
    label: "Bio / About Text",
    description: "Write a short bio about yourself",
    panel: "profile",
    actionLabel: "Write Bio",
  },
  {
    key: "minLinks",
    label: "At Least 5 Blocks",
    description: "Add 5 or more blocks to your page",
    panel: "blocks",
    actionLabel: "Add Blocks",
  },
];

export function FaucetRequirementsChecklist({
  requirements,
  onActionClick,
}: FaucetRequirementsChecklistProps) {
  const { setActivePanelAndNavigate } = useEditor();

  const steps: Requirement[] = STEPS.map(step => ({
    ...step,
    completed: requirements[step.key] ?? false,
  }));

  const completedCount = steps.filter(s => s.completed).length;

  const handleAction = (panel: EditorPanelType) => {
    setActivePanelAndNavigate(panel);
    onActionClick?.();
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">Profile Completion</h4>
        <span className="text-xs font-medium text-gray-500">
          {completedCount}/{steps.length}
        </span>
      </div>

      <div className="w-full h-1.5 bg-gray-200 rounded-full mb-3">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      <div className="space-y-2">
        {steps.map(step => (
          <div
            key={step.key}
            className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
              step.completed ? "bg-green-50" : "bg-white border border-gray-100"
            }`}
          >
            <div className="flex items-center space-x-3">
              {step.completed ? (
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0" />
              )}
              <div>
                <p
                  className={`text-sm font-medium ${
                    step.completed ? "text-green-800" : "text-gray-700"
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-xs text-gray-500">{step.description}</p>
              </div>
            </div>
            {!step.completed && (
              <button
                type="button"
                onClick={() => handleAction(step.panel)}
                className="flex items-center space-x-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors flex-shrink-0 ml-2"
              >
                <span>{step.actionLabel}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {completedCount < steps.length && (
        <p className="text-xs text-gray-500 mt-3 text-center">
          Complete all steps above to unlock the faucet
        </p>
      )}
    </div>
  );
}
