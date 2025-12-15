import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import PoolDetailContent from "../components/panels/explore/PoolDetailContent";

export function PoolDetailsPage() {
  const { address: poolAddress } = useParams<{ address: string }>();
  const navigate = useNavigate();

  // Handle browser back navigation
  const handleBack = () => {
    navigate(-1); // Go back to previous page
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header section with back button */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <button
            onClick={handleBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Explore</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <PoolDetailContent
        poolAddress={poolAddress || ""}
        onBack={handleBack}
        shareUrl={`${window.location.origin}/i/pools/${poolAddress}`}
      />
    </div>
  );
}