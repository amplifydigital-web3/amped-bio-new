import { useNavigate, useParams } from "react-router";
import PoolDetailContent from "../components/panels/explore/PoolDetailContent";

export function PoolDetailsPage() {
  const { address: poolAddress } = useParams<{ address: string }>();
  const navigate = useNavigate();

  // Navigate to the public pools page instead of using browser history
  const handleBack = () => {
    navigate("/i/pools"); // Navigate to public pools page
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main content */}
      <PoolDetailContent
        poolAddress={poolAddress || ""}
        onBack={handleBack}
        shareUrl={`${window.location.origin}/i/pools/${poolAddress}`}
      />
    </div>
  );
}