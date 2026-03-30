import { ShieldCheck, Lock, ExternalLink } from "lucide-react";
import { Link } from "react-router";

interface VerificationDetailProps {
  isOwner: boolean;
}

const VerificationDetail = ({ isOwner }: VerificationDetailProps) => {
  return (
    <div className="mt-4 max-w-4xl rounded-xl border border-[#e2e8f0] bg-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#3b82f6]" />
          <h3 className="text-lg font-semibold text-[#020817]">Identity Verification</h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f4f6] border border-[#e2e8f0] px-3 py-1 text-xs font-medium text-[#6b7280]">
          <Lock className="h-3 w-3" />
          Coming soon
        </span>
      </div>
      <div className="rounded-xl border border-[#e2e8f0] bg-[#f7f7f9] px-6 py-12 flex flex-col items-center justify-center text-center">
        <p className="text-md font-semibold mb-1">
          {isOwner
            ? "Your Authbase verification NFT details will appear here."
            : "Authbase verification NFT details will appear here."}
        </p>
        <p className="text-sm text-black/60 max-w-xs">
          {isOwner
            ? "This tab will show your verification status, verified identity attributes, and related NFT metadata once available."
            : "This tab will show public on-chain verification status and related NFT details once available."}
        </p>
        <p className="mt-3 text-md text-black/60 inline-flex items-center gap-1">
          Learn more about{" "}
          <Link
            to={import.meta.env.VITE_AUTHBASE_URL}
            target="_blank"
            className="text-[#3b82f6] hover:underline"
          >
            Authbase <ExternalLink className="h-3 w-3 inline-block" />
          </Link>
        </p>
      </div>
    </div>
  );
};

export default VerificationDetail;
