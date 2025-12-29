import React from "react";
import { X, AlertTriangle } from "lucide-react";

interface WarningModalProps {
  onClose: () => void;
  onConfirm: () => void;
}

export const WarningModal: React.FC<WarningModalProps> = ({ onClose, onConfirm }) => {
  return (
    <div className="fixed inset-0 bg-black/5 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="text-2xl font-semibold">Sending name</div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center mb-6">
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
          </div>

          <p className="text-lg mb-6">
            Sending this name transfers ownership to the recipient, giving them your control.
          </p>
          <p className="text-lg mb-6">
            You will lose the ability to modify, receive payments, or use it as your primary name.
          </p>
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-3 px-4 bg-blue-500 hover:bg-blue-600 rounded-xl text-white"
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
};
