import { useIntersectionObserver } from "@/hooks/rns/useInteractionObserver";
import { ChevronDown } from "lucide-react";

interface FAQItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onClick: () => void;
  delay: number;
}

const FAQItem = ({ question, answer, isOpen, onClick, delay }: FAQItemProps) => {
  const { ref, isVisible } = useIntersectionObserver();

  return (
    <div
      ref={ref}
      className={`border-b border-gray-100 last:border-none ${isVisible ? " animate-fadeInUp" : "opacity-0"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <button
        onClick={onClick}
        className="w-full py-6 flex items-center justify-between text-left hover:text-blue-600 transition-colors duration-300 group"
      >
        <span className="text-lg font-medium pr-8">{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-all duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-500 ease-in-out ${
          isOpen ? "max-h-96 pb-6" : "max-h-0"
        }`}
      >
        <p className="text-gray-600 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
};

export default FAQItem;
