import React, { memo, useEffect, useState } from "react";

interface FloatingPillsProps {
  names?: string[];
}

export const FloatingPills: React.FC<FloatingPillsProps> = memo(({ names: propNames }) => {
  const [pulsingNames, setPulsingNames] = useState<Set<string>>(new Set());

  const names = propNames || [
    "creator.revo.eth",
    "discovery.revo.eth",
    "pioneer.revo.eth",
    "network.revo.eth",
    "innovator.revo.eth",
    "freedom.revo.eth",
    "influencer.revo.eth",
    "visionary.revo.eth",
    "nexus.revo.eth",
    "future.revo.eth",
    "builder.revo.eth",
    "explorer.revo.eth",
    "revolution.revo.eth",
  ];

  const getNameConfig = () => {
    const configs: {
      [key: string]: {
        left: string;
        top: string;
        animation: string;
        animationDelay: number;
      };
    } = {
      "creator.revo.eth": {
        left: "12%",
        top: "15%",
        animation: "gentle-float",
        animationDelay: 0,
      },
      "network.revo.eth": {
        left: "88%",
        top: "15%",
        animation: "soft-glow",
        animationDelay: 1.5,
      },
      "discovery.revo.eth": {
        left: "5%",
        top: "35%",
        animation: "subtle-fade",
        animationDelay: 2,
      },
      "innovator.revo.eth": {
        left: "95%",
        top: "35%",
        animation: "gentle-sway",
        animationDelay: 3,
      },
      "pioneer.revo.eth": {
        left: "10%",
        top: "50%",
        animation: "breath",
        animationDelay: 1,
      },
      "freedom.revo.eth": {
        left: "90%",
        top: "50%",
        animation: "gentle-float",
        animationDelay: 2.5,
      },
      "influencer.revo.eth": {
        left: "25%",
        top: "70%",
        animation: "zoom-text",
        animationDelay: 1,
      },
      "visionary.revo.eth": {
        left: "75%",
        top: "70%",
        animation: "subtle-fade",
        animationDelay: 3.5,
      },
      "nexus.revo.eth": {
        left: "50%",
        top: "78%",
        animation: "breath",
        animationDelay: 2,
      },
      "future.revo.eth": {
        left: "15%",
        top: "84%",
        animation: "gentle-sway",
        animationDelay: 0.5,
      },
      "builder.revo.eth": {
        left: "38%",
        top: "88%",
        animation: "soft-glow",
        animationDelay: 2.8,
      },
      "explorer.revo.eth": {
        left: "62%",
        top: "88%",
        animation: "gentle-float",
        animationDelay: 4,
      },
      "revolution.revo.eth": {
        left: "85%",
        top: "84%",
        animation: "zoom-text",
        animationDelay: 3,
      },
    };

    return configs;
  };

  const nameConfigs = getNameConfig();

  useEffect(() => {
    const startRandomPulse = () => {
      const numToPulse = Math.floor(Math.random() * 2) + 2;
      const availableNames = names.filter(name => !pulsingNames.has(name));

      if (availableNames.length > 0) {
        const newPulsing = new Set<string>();

        for (let i = 0; i < Math.min(numToPulse, availableNames.length); i++) {
          const randomIndex = Math.floor(Math.random() * availableNames.length);
          newPulsing.add(availableNames[randomIndex]);
          availableNames.splice(randomIndex, 1);
        }

        setPulsingNames(newPulsing);

        setTimeout(() => {
          setPulsingNames(new Set());
        }, 3000);
      }
    };

    const initialTimeout = setTimeout(() => {
      startRandomPulse();
    }, 2000);

    const interval = setInterval(
      () => {
        startRandomPulse();
      },
      8000 + Math.random() * 4000
    );

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names]);

  const getAnimationDuration = (animation: string) => {
    switch (animation) {
      case "gentle-float":
        return "6s";
      case "subtle-fade":
        return "4s";
      case "soft-glow":
        return "5s";
      case "gentle-sway":
        return "8s";
      case "breath":
        return "4.5s";
      case "zoom-text":
        return "15s";
      default:
        return "5s";
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-20 hidden md:block">
      {names.map(name => {
        const config = nameConfigs[name];
        if (!config) return null;

        const animationDuration = getAnimationDuration(config.animation);

        const isPulsing = pulsingNames.has(name);
        const pulseAnimation = isPulsing
          ? `subtle-pulse 3s ease-in-out, ${config.animation} ${animationDuration} ease-in-out ${config.animationDelay}s infinite`
          : `${config.animation} ${animationDuration} ease-in-out ${config.animationDelay}s infinite`;

        return (
          <div
            key={name}
            className="absolute pointer-events-auto select-none"
            style={{
              left: config.left,
              top: config.top,
              transform: "translate(-50%, -50%)",
              transformOrigin: "center",
            }}
          >
            <span
              className={`inline-block text-sm whitespace-nowrap hover:scale-105 hover:text-gray-800 transition-all duration-500 ease-out cursor-default ${
                isPulsing ? "text-gray-700" : "text-gray-500"
              }`}
              style={{
                animation: pulseAnimation,
                opacity: 0.6,
                fontWeight: 400,
                transition: "all 0.4s ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = "0.9";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = "0.6";
              }}
            >
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
});

FloatingPills.displayName = "FloatingPills";
