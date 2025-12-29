import { trimmedDomainName } from "@/utils/rns";
import { useRNSNavigation } from "@/contexts/RNSNavigationContext";

interface ProfileCardProps {
  name: string;
  addressFull: string;
  addressFormatted: string;
  expiry: string;
  registrant?: string;
}

const TagBox = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-gray-50 rounded-xl p-3 flex items-center">
    <span className="text-gray-500 font-semibold mr-3">{label}</span>
    <span className="font-normal text-gray-800">{value}</span>
  </div>
);

export const ProfileCard = ({ name, addressFormatted, expiry }: ProfileCardProps) => {
  const { navigateToProfileOwnership } = useRNSNavigation();

  return (
    <main className="w-full max-w-4xl mx-auto sm:px-6 lg:px-8">
      {/* Profile Header Card */}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
        <div className="h-28 sm:h-36 bg-gradient-to-r from-indigo-400 via-indigo-400 to-blue-400 relative"></div>

        <div className="px-6 pb-6 relative pt-16">
          <div className="absolute left-6 sm:left-8 -top-16">
            <div className="w-32 h-32 rounded-full ring-8 ring-white bg-gradient-to-br from-green-300 to-green-100"></div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mt-4">
            <h2 className="text-xl sm:text-3xl font-bold text-gray-900 mb-1 truncate">
              {trimmedDomainName(name)}
            </h2>
          </div>
        </div>
      </div>

      {/* Content Card */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-bold text-gray-400 mb-4">Addresses</h2>

        <div className="bg-gray-50 rounded-lg p-3 sm:p-4 mb-8 inline-flex items-center w-auto">
          <svg
            className="w-5 h-5 mr-2 text-gray-600"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M11.944 17.97L4.58 13.62L11.943 24L19.313 13.62L11.944 17.97Z"
              fill="#343434"
            />
            <path d="M11.943 0L4.58 12.223L11.943 16.573L19.313 12.223L11.943 0Z" fill="#8C8C8C" />
          </svg>
          <span className="font-mono text-md mr-2">{addressFormatted}</span>
          <button className="text-gray-400"></button>
        </div>

        <div className="flex items-center mb-4">
          <h2 className="font-bold text-gray-400">Ownership</h2>
          <span className="text-blue-500 mx-2">→</span>
          <button
            onClick={() => navigateToProfileOwnership(name)}
            className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-medium text-sm"
          >
            View
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <TagBox label="manager" value={addressFormatted} />

          <TagBox label="owner" value={addressFormatted} />

          <TagBox label="expiry" value={expiry} />

          <TagBox label="parent" value="eth" />
        </div>
      </div>
    </main>
  );
};
