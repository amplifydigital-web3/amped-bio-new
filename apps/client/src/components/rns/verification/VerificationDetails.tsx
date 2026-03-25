import { ShieldCheck, Lock } from "lucide-react";

const VerificationDetail = () => {
  return (
    <main className="w-full max-w-4xl mx-auto sm:px-6 lg:px-8">
      <div className="mt-4 rounded-xl border border-[#e2e8f0] bg-white p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#3b82f6]" />
            <h3 className="text-lg font-semibold text-[#020817]">Identity Verification</h3>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-medium text-[#6b7280]">
            <Lock className="h-3 w-3" />
            Coming soon
          </span>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-dashed border-[#e2e8f0] bg-[f3f4f6]/50 p-8">
          {/* Decorative blur accent */}
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-[#3b82f6]/10 blur-2xl" />
          <div className="absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-[#3b82f6]/5 blur-xl" />

          <div className="relative flex flex-col items-center text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#3b82f6]/10">
              <ShieldCheck className="h-6 w-6 text-[#3b82f6]" />
            </div>
            <div>
              <p className="text-lg font-medium text-[#020817]">
                Verification details will appear here
              </p>
              <p className="mt-1 text-sm text-[#64748b] max-w-xs mx-auto">
                We're working on bringing identity verification. Stay tuned for updates.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default VerificationDetail;
