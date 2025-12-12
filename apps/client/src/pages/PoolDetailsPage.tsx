import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ExplorePoolDetailsModal from "../components/panels/explore/ExplorePoolDetailsModal";

export function PoolDetailsPage() {
  const { address } = useParams<{ address: string }>();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Delay the opening of the modal slightly to ensure the component is mounted
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    // Redirect to the pools page after closing the modal
    setTimeout(() => {
      navigate("/i/pools");
    }, 300);
  };

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-8">
          <h1 className="text-3xl font-bold text-center">Loading Pool...</h1>
          <p className="text-center text-muted-foreground mt-2">
            Please wait while we load the pool details
          </p>
        </div>
      </div>
      {address && (
        <ExplorePoolDetailsModal isOpen={isOpen} onClose={handleClose} poolAddress={address} />
      )}
    </>
  );
}