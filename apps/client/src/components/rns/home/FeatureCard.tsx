import { useIntersectionObserver } from "@/hooks/rns/useInteractionObserver";

interface FeatureCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  delay: number;
}

const FeatureCard = ({ icon: Icon, title, description, delay }: FeatureCardProps) => {
  const { ref, isVisible } = useIntersectionObserver();

  return (
    <div
      ref={ref}
      className={`group relative bg-white/80 backdrop-blur-md rounded-2xl sm:rounded-3xl p-5 sm:p-6 md:p-8 border border-gray-100
        hover:border-blue-200 transition-all duration-500 hover:shadow-2xl hover:-translate-y-2
        cursor-pointer overflow-hidden
        ${isVisible ? "animate-fadeInUp" : "opacity-0"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative z-10 flex flex-row sm:flex-col items-start gap-4 sm:gap-0">
        <div className="shrink-0 w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center sm:mb-6 group-hover:scale-110 transition-transform duration-300">
          <Icon className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
        </div>
        <div>
          <h3 className="text-base sm:text-lg md:text-xl font-semibold mb-1 sm:mb-3 text-gray-900 leading-snug">
            {title}
          </h3>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-gradient-to-br from-blue-400/10 to-indigo-400/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
    </div>
  );
};

export default FeatureCard;
