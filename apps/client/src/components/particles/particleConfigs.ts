import { type ISourceOptions } from "@tsparticles/engine";

export const particleConfigs: Record<number, ISourceOptions> = {
  1: {
    particles: {
      number: { value: 80, density: { enable: true } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      opacity: { value: 0.5 },
      size: { value: { min: 3, max: 6 } },
      move: {
        enable: true,
        speed: 1,
        direction: "none",
        random: false,
        straight: false,
        outModes: { default: "out" },
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: "repulse" },
        onClick: { enable: true, mode: "push" },
        resize: { enable: true },
      },
    },
  },
  2: {
    particles: {
      number: { value: 60, density: { enable: true } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      opacity: { value: 0.5 },
      size: { value: { min: 3, max: 6 } },
      links: {
        enable: true,
        distance: 150,
        color: "#ffffff",
        opacity: 0.4,
        width: 1,
      },
      move: {
        enable: true,
        speed: 2,
        direction: "none",
        random: false,
        straight: false,
        outModes: { default: "out" },
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: "grab" },
        onClick: { enable: true, mode: "push" },
        resize: { enable: true },
      },
    },
  },
  3: {
    particles: {
      number: { value: 100, density: { enable: true } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      opacity: { value: 0.7 },
      size: { value: { min: 4, max: 8 } },
      move: {
        enable: true,
        speed: 3,
        direction: "bottom",
        random: false,
        straight: false,
        outModes: { default: "out" },
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: "repulse" },
        onClick: { enable: true, mode: "remove" },
        resize: { enable: true },
      },
    },
  },
  4: {
    particles: {
      number: { value: 50, density: { enable: true } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      opacity: { value: { min: 0.3, max: 0.7 } },
      size: { value: { min: 8, max: 12 } },
      move: {
        enable: true,
        speed: 2,
        direction: "top",
        random: true,
        straight: false,
        outModes: { default: "out" },
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: "bubble" },
        onClick: { enable: true, mode: "repulse" },
        resize: { enable: true },
      },
    },
  },
  5: {
    particles: {
      number: { value: 50, density: { enable: true } },
      color: { value: "#ffff00" },
      shape: { type: "circle" },
      opacity: { value: { min: 0.5, max: 0.8 } },
      size: { value: { min: 3, max: 6 } },
      move: {
        enable: true,
        speed: 1,
        direction: "none",
        random: true,
        straight: false,
        outModes: { default: "out" },
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: "bubble" },
        onClick: { enable: true, mode: "repulse" },
        resize: { enable: true },
      },
    },
  },
  6: {
    fpsLimit: 60,
    particles: {
      number: { value: 80, density: { enable: true } },
      color: { value: "#00ff00" },
      shape: {
        type: "char",
        options: {
          char: {
            0: {
              value: "0",
              font: "Courier New",
              style: "",
              weight: "400",
            },
            1: {
              value: "1",
              font: "Courier New",
              style: "",
              weight: "400",
            },
          },
        },
      },
      opacity: {
        value: { min: 0.4, max: 0.8 },
      },
      size: {
        value: { min: 12, max: 16 },
      },
      move: {
        enable: true,
        speed: 5,
        direction: "bottom",
        random: false,
        straight: true,
        outModes: { default: "out" },
      },
      life: {
        duration: { value: 3, sync: false },
        count: 1,
      },
    },
    interactivity: {
      events: {
        onClick: { enable: true, mode: "push" },
        resize: { enable: true },
      },
    },
  },
  7: {
    particles: {
      number: { value: 100, density: { enable: true } },
      color: {
        value: ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"],
        animation: {
          enable: true,
          speed: 20,
          sync: false,
        },
      },
      shape: {
        type: "polygon",
        options: {
          polygon: {
            sides: 4,
          },
        },
      },
      opacity: { value: { min: 0.5, max: 0.8 } },
      size: { value: { min: 3, max: 6 } },
      move: {
        enable: true,
        speed: 3,
        direction: "bottom",
        random: true,
        straight: false,
        outModes: { default: "out" },
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: "bubble" },
        onClick: { enable: true, mode: "repulse" },
        resize: { enable: true },
      },
    },
  },
  8: {
    particles: {
      number: { value: 100, density: { enable: true } },
      color: { value: "#ffffff" },
      shape: { type: "star" },
      opacity: { value: { min: 0.5, max: 0.8 } },
      size: { value: { min: 3, max: 6 } },
      move: {
        enable: true,
        speed: 0.5,
        direction: "none",
        random: true,
        straight: false,
        outModes: { default: "out" },
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: "bubble" },
        onClick: { enable: true, mode: "push" },
        resize: { enable: true },
      },
    },
  },
  9: {
    particles: {
      number: { value: 30, density: { enable: true } },
      color: { value: "#ffffff" },
      shape: {
        type: "polygon",
        options: {
          polygon: { sides: 6 },
        },
      },
      opacity: { value: { min: 0.3, max: 0.6 } },
      size: { value: { min: 10, max: 16 } },
      links: {
        enable: true,
        distance: 200,
        color: "#ffffff",
        opacity: 0.2,
        width: 1,
      },
      move: {
        enable: true,
        speed: 1,
        direction: "none",
        random: false,
        straight: false,
        outModes: { default: "out" },
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: "grab" },
        onClick: { enable: true, mode: "push" },
        resize: { enable: true },
      },
    },
  },
};
