import React, { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, Shield, Globe, Zap, Users, Check, ArrowRight } from "lucide-react";
import { useReverseLookup } from "@/hooks/rns/useReverseLookup";
import { useNameAvailability } from "@/hooks/rns/useNameAvailability";
import { normalize } from "viem/ens";
import { trimmedDomainName, isValidRevolutionName } from "@/utils/rns";
import { useRNSNavigation } from "@/contexts/RNSNavigationContext";
import { FloatingPills } from "./FloatingPills";
import { SkeletonSearchResult } from "../ui/SkeletonLoader";
import { DOMAIN_SUFFIX } from "@/config/rns/constants";

interface FeatureCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  delay: number;
}

const FeatureCard = ({ icon: Icon, title, description, delay }: FeatureCardProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className={`group relative bg-white/80 backdrop-blur-md rounded-3xl p-8 border border-gray-100 hover:border-blue-200 transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 cursor-pointer overflow-hidden ${
        isVisible ? "animate-fadeInUp opacity-100" : "opacity-0"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative z-10">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
          <Icon className="w-7 h-7 text-white" />
        </div>
        <h3 className="text-xl font-semibold mb-3 text-gray-900">{title}</h3>
        <p className="text-gray-600 leading-relaxed">{description}</p>
      </div>
      <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-gradient-to-br from-blue-400/10 to-indigo-400/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
    </div>
  );
};

interface FAQItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onClick: () => void;
  delay: number;
}

const FAQItem = ({ question, answer, isOpen, onClick, delay }: FAQItemProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (itemRef.current) {
      observer.observe(itemRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={itemRef}
      className={`border-b border-gray-100 last:border-none ${
        isVisible ? "animate-fadeInUp opacity-100" : "opacity-0"
      }`}
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

export default function NameSearchForm() {
  const [value, setValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");
  const [isAddress, setIsAddress] = useState(false);
  const [isValidName, setIsValidName] = useState(true);
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const { navigateToAddress, navigateToRegister, navigateToProfile } = useRNSNavigation();

  const { name: resolvedName, isLoadingAddr: isLoadingAddr } = useReverseLookup(
    value as `0x${string}`
  );

  const { isAvailable, isLoading: isCheckingAvailability } = useNameAvailability(
    isAddress ? "" : debouncedValue
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isValidName || value === "") {
        setDebouncedValue(value);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [value, isValidName]);

  const checkIfAddress = (input: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/i.test(input);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value.toLowerCase();
    setValue(rawInput);
    setIsAddress(checkIfAddress(rawInput));

    try {
      if (rawInput && !isAddress) {
        if (isValidRevolutionName(rawInput)) {
          normalize(rawInput);
          setIsValidName(true);
        } else {
          setIsValidName(false);
        }
      } else {
        setIsValidName(rawInput !== "");
      }
    } catch {
      setIsValidName(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value) return;

    if (isAddress) {
      if (resolvedName) {
        navigateToAddress(value);
      }
    } else if (!isValidName) {
      console.error("Cannot submit invalid name");
      return;
    } else {
      let cleanName = value;
      if (cleanName.endsWith(".eth")) {
        cleanName = cleanName.substring(0, cleanName.length - 4);
      }

      if (isAvailable) {
        navigateToRegister(cleanName);
      } else {
        navigateToProfile(cleanName);
      }
    }
  };

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

  return (
    <div className="relative bg-gray-50">
      {/* Subtle Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-white to-gray-50/50" />
      </div>

      <main className="relative">
        <div className="relative min-h-screen w-full flex flex-col">
          <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <FloatingPills />
          </div>

          <div className="relative w-full max-w-4xl mx-auto px-4 md:px-6 z-10 pt-20">
            <div className="text-center relative">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-4 relative">
                <span className="block text-black">Secure your</span>
                <span
                  className="block text-transparent bg-clip-text animate-gradient-shift"
                  style={{
                    backgroundSize: "200% 200%",
                    backgroundImage:
                      "linear-gradient(90deg, #2563eb 0%, #3b82f6 20%, #6366f1 40%, #4f46e5 60%, #7c3aed 80%, #9333ea 90%, #2563eb 100%)",
                  }}
                >
                  Revolution name
                </span>
              </h1>
              <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                Search, register, and manage your decentralized identity with the
                <br />
                most trusted name service in Web3
              </p>
            </div>

            <div ref={searchBoxRef} className="relative max-w-2xl mx-auto">
              <form onSubmit={handleSubmit}>
                <div className="relative rounded-2xl overflow-hidden bg-white shadow-lg border border-gray-200">
                  <div className="relative flex items-center gap-3 px-5 md:px-6 py-4">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={value}
                      onChange={handleInputChange}
                      placeholder="Search a name. Claim. Register."
                      className="w-full bg-transparent border-none outline-none text-base text-gray-700 placeholder-gray-400 font-normal"
                    />
                    <button
                      type="submit"
                      className="px-6 py-2 bg-blue-600  text-white rounded-xl font-medium text-base hover:bg-blue-700  transition-all duration-200"
                    >
                      Search
                    </button>
                  </div>
                </div>

                {value && isCheckingAvailability && (
                  <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
                    <SkeletonSearchResult animated={true} />
                  </div>
                )}

                {value && !isCheckingAvailability && (
                  <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
                    <div
                      onClick={handleSubmit}
                      className="px-5 py-4 hover:bg-gray-50 cursor-pointer flex justify-between items-center transition-all duration-200 group"
                    >
                      {isAddress ? (
                        <>
                          <span className="text-gray-800 font-medium">{value}</span>
                          {isLoadingAddr ? (
                            <span className="text-sm text-gray-400 animate-pulse">Loading...</span>
                          ) : (
                            <span className="text-sm text-gray-400">
                              {resolvedName ? resolvedName : ""}
                            </span>
                          )}
                        </>
                      ) : !isValidName ? (
                        <>
                          <span className="text-gray-800 font-medium">
                            {trimmedDomainName(value)}
                          </span>
                          <span className="text-sm text-yellow-500 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></span>
                            Invalid name
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-medium">
                            <span className="text-blue-600">
                              {value.length > 15 ? `${value.slice(0, 15)}...` : value}
                            </span>
                            <span className="text-gray-400">{DOMAIN_SUFFIX}</span>
                          </span>
                          {isAvailable ? (
                            <span className="text-sm text-emerald-500 font-medium flex items-center gap-2">
                              <Check className="w-4 h-4" />
                              Available
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">Registered</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>

        <div className="py-20 px-4 md:px-6 bg-gradient-to-b from-gray-50 via-blue-50/50 to-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-transparent bg-clip-text">
                  Why choose Revolution?
                </span>
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                The most trusted and feature-rich naming service in the decentralized web
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <FeatureCard key={index} {...feature} delay={index * 100} />
              ))}
            </div>
          </div>
        </div>

        <div className="py-20 px-4 md:px-6">
          <div className="max-w-4xl mx-auto w-full">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                <span className="bg-gradient-to-r from-purple-600 to-indigo-600 text-transparent bg-clip-text">
                  Frequently Asked Questions
                </span>
              </h2>
              <p className="text-xl text-gray-600">
                Everything you need to know about Revolution names
              </p>
            </div>
            <div className="bg-white/80 backdrop-blur-md rounded-3xl p-8 md:p-12 border border-gray-100 shadow-xl">
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
        </div>

        <div className="py-20 px-4 md:px-6">
          <div className="max-w-4xl mx-auto text-center w-full">
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl p-12 md:p-16 relative overflow-hidden">
              <div className="absolute inset-0 bg-black/10" />
              <div className="relative z-10">
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                  Ready to claim your identity?
                </h2>
                <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
                  Join thousands of users who have already secured their decentralized identity
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const el = searchBoxRef.current;
                    if (!el) return;
                    // Smoothly scroll the search box into view and focus the input
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    const input = el.querySelector("input") as HTMLInputElement | null;
                    if (input) {
                      input.focus({ preventScroll: true });
                    }
                  }}
                  className="px-8 py-4 bg-white text-blue-600 rounded-2xl font-bold text-lg hover:shadow-2xl transform hover:scale-105 transition-all duration-300 inline-flex items-center gap-3"
                >
                  Get Started Now
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
