import { useRef, useState } from "react";

import { ArrowRight, ChevronDown, Globe, Shield, Users, Zap } from "lucide-react";
import { smoothScrollTo } from "@/utils/rns";
import { FloatingPills } from "@/components/rns/name-search/FloatingPills";
import NameSearchForm from "@/components/rns/name-search/NameSearchForm";
import FeatureCard from "@/components/rns/home/FeatureCard";
import FAQItem from "@/components/rns/home/FAQSection";

const features = [
  {
    icon: Shield,
    title: "Secure & Decentralized",
    description: "Your identity secured on the blockchain with complete ownership and control",
  },
  {
    icon: Globe,
    title: "Universal Identity",
    description: "One name across all Web3 applications and services worldwide",
  },
  {
    icon: Zap,
    title: "Instant Resolution",
    description: "Lightning-fast name resolution with optimized smart contracts",
  },
  {
    icon: Users,
    title: "Community Driven",
    description: "Join thousands of users building the future of decentralized identity",
  },
];

const faqs = [
  {
    question: "What is a Revolution name?",
    answer:
      "A Revolution name is your decentralized identity on the blockchain. It's like a username that you own forever, which can be used across all Web3 applications and services. It makes sending crypto as easy as sending an email.",
  },
  {
    question: "How do I register a name?",
    answer:
      "Simply search for your desired name using the search bar above. If it's available, you can register it instantly by connecting your wallet and paying the registration fee. The process takes less than a minute.",
  },
  {
    question: "What are the costs involved?",
    answer:
      "Registration costs vary based on the length of the name. Shorter names (3-4 characters) have higher fees, while longer names are more affordable. You'll also pay a small gas fee for the blockchain transaction.",
  },
  {
    question: "Can I transfer my name to someone else?",
    answer:
      "Yes! Revolution names are NFTs, which means you have complete ownership. You can transfer, sell, or gift your name to anyone at any time through your wallet or NFT marketplaces.",
  },
  {
    question: "How long does registration last?",
    answer:
      "Names are registered for a minimum period of one year. You can extend your registration at any time before it expires. We'll send you reminders so you never lose your name.",
  },
];
export default function Home() {
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const getContainer = () => document.getElementById("rns-scroll-container") as HTMLElement | null;

  const scrollToFeatures = () => {
    const container = getContainer();
    if (!container || !featuresRef.current) return;
    const target =
      container.scrollTop +
      featuresRef.current.getBoundingClientRect().top -
      container.getBoundingClientRect().top;
    smoothScrollTo(target, 500, container);
  };

  const scrollToTop = () => {
    const container = getContainer();
    if (!container) return;
    smoothScrollTo(0, 500, container);
  };

  return (
    <div ref={topRef} className="relative">
      {/* Subtle Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-white to-gray-50/50" />
      </div>

      <main>
        <section className="relative min-h-[calc(100vh-88px)] w-full flex flex-col justify-center pb-20">
          <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <FloatingPills />
          </div>

          <NameSearchForm />
          <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2 z-10">
            <span className="text-xs font-semibold tracking-widest uppercase text-blue-500/70 animate-pulse">
              Explore
            </span>
            <button
              onClick={scrollToFeatures}
              aria-label="Scroll to features"
              className="flex flex-col items-center gap-2 group"
            >
              <div className="relative flex items-center justify-center">
                {/* Outer glow rings */}
                <span className="absolute inline-flex h-16 w-16 rounded-full bg-blue-400/20 animate-ping" />
                <span
                  className="absolute inline-flex h-16 w-16 rounded-full bg-indigo-400/15 animate-ping"
                  style={{ animationDelay: "0.4s" }}
                />
                <span
                  className="absolute inline-flex h-16 w-16 rounded-full bg-blue-300/10 animate-ping"
                  style={{ animationDelay: "0.8s" }}
                />
                {/* Button */}
                <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/40 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-blue-500/60">
                  <ChevronDown className="w-6 h-6 text-white transition-transform duration-300 group-hover:translate-y-0.5" />
                </div>
              </div>
            </button>
          </div>
        </section>

        <section
          ref={featuresRef}
          className="relative py-16 md:py-20 px-4 md:px-6 bg-gradient-to-b from-gray-50 via-blue-50/50 to-white"
        >
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 md:mb-6">
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-transparent bg-clip-text">
                  Why choose Revolution?
                </span>
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-gray-700 max-w-2xl mx-auto">
                The most trusted and feature-rich naming service in the decentralized web
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
              {features.map((feature, index) => (
                <FeatureCard key={index} {...feature} delay={index * 100} />
              ))}
            </div>
          </div>
        </section>

        <section className="relative py-16 md:py-20 px-4 md:px-6">
          <div className="max-w-4xl mx-auto w-full">
            <div className="text-center mb-10 md:mb-12">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 md:mb-6">
                <span className="bg-gradient-to-r from-purple-600 to-indigo-600 text-transparent bg-clip-text">
                  Frequently Asked Questions
                </span>
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-gray-700">
                Everything you need to know about Revolution names
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur-md rounded-2xl md:rounded-3xl p-5 sm:p-8 md:p-12 border border-gray-100 shadow-xl">
              {faqs.map((faq, index) => (
                <FAQItem
                  key={index}
                  {...faq}
                  isOpen={openFAQ === index}
                  onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                  delay={index * 100}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20 px-4 md:px-6">
          <div className="max-w-4xl mx-auto text-center w-full">
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl md:rounded-3xl p-8 sm:p-12 md:p-16 relative overflow-hidden">
              <div className="absolute inset-0 bg-black/10" />
              <div className="relative z-10">
                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 md:mb-6">
                  Ready to claim your identity?
                </h2>
                <p className="text-sm sm:text-base md:text-xl text-white/90 mb-6 md:mb-8 max-w-2xl mx-auto">
                  Join thousands of users who have already secured their decentralized identity
                </p>
                <button
                  onClick={scrollToTop}
                  className="px-6 sm:px-8 py-3 sm:py-4 bg-white text-blue-600 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base md:text-lg hover:shadow-2xl transform hover:scale-105 transition-all duration-300 inline-flex items-center gap-2 sm:gap-3"
                >
                  Get Started Now
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
