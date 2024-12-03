export const particleConfigs = {
  1: {
    particles: {
      number: { value: 80, density: { enable: true, value_area: 800 } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      opacity: { value: 0.5, random: false },
      size: { value: 3, random: true },
      move: {
        enable: true,
        speed: 1,
        direction: "none",
        random: false,
        straight: false,
        out_mode: "out",
        bounce: false,
      },
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: true, mode: "repulse" },
        onclick: { enable: true, mode: "push" },
        resize: true,
      },
    },
    retina_detect: true,
  },
  2: {
    particles: {
      number: { value: 60, density: { enable: true, value_area: 800 } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      opacity: { value: 0.5, random: false },
      size: { value: 3, random: true },
      line_linked: {
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
        out_mode: "out",
        bounce: false,
      },
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: true, mode: "grab" },
        onclick: { enable: true, mode: "push" },
        resize: true,
      },
    },
    retina_detect: true,
  },
  3: {
    particles: {
      number: { value: 100, density: { enable: true, value_area: 800 } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      opacity: { value: 0.7, random: false },
      size: { value: 4, random: true },
      move: {
        enable: true,
        speed: 3,
        direction: "bottom",
        random: false,
        straight: false,
        out_mode: "out",
        bounce: false,
      },
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: true, mode: "repulse" },
        onclick: { enable: true, mode: "remove" },
        resize: true,
      },
    },
    retina_detect: true,
  },
  4: {
    particles: {
      number: { value: 50, density: { enable: true, value_area: 800 } },
      color: { value: "#ffffff" },
      shape: { type: "circle" },
      opacity: { value: 0.3, random: true },
      size: { value: 8, random: true },
      move: {
        enable: true,
        speed: 2,
        direction: "top",
        random: true,
        straight: false,
        out_mode: "out",
        bounce: false,
      },
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: true, mode: "bubble" },
        onclick: { enable: true, mode: "repulse" },
        resize: true,
      },
    },
    retina_detect: true,
  },
  5: {
    particles: {
      number: { value: 50, density: { enable: true, value_area: 800 } },
      color: { value: "#ffff00" },
      shape: { type: "circle" },
      opacity: { value: 0.6, random: true },
      size: { value: 3, random: true },
      move: {
        enable: true,
        speed: 1,
        direction: "none",
        random: true,
        straight: false,
        out_mode: "out",
        bounce: false,
      },
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: true, mode: "bubble" },
        onclick: { enable: true, mode: "repulse" },
        resize: true,
      },
    },
    retina_detect: true,
  },
  6: {
    fpsLimit: 60,
    particles: {
      number: {
        value: 120,
        density: {
          enable: true,
          value_area: 800
        }
      },
      color: {
        value: ["#00ff00", "#0fff0f", "#90EE90", "#98FB98"],
        animation: {
          enable: true,
          speed: 20,
          sync: false
        }
      },
      shape: {
        type: "char",
        character: {
          value: ["0", "1", "ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ", "マ", "ミ", "ム", "メ", "モ", "ヤ", "ユ", "ヨ", "ラ", "リ", "ル", "レ", "ロ", "ワ", "ヲ", "ン"],
          font: "Courier New",
          style: "",
          weight: "400"
        }
      },
      opacity: {
        value: 0.8,
        random: {
          enable: true,
          minimumValue: 0.4
        },
        animation: {
          enable: true,
          speed: 1,
          minimumValue: 0.1,
          sync: false
        }
      },
      size: {
        value: 16,
        random: {
          enable: true,
          minimumValue: 12
        }
      },
      move: {
        enable: true,
        speed: 5,
        direction: "bottom",
        random: false,
        straight: true,
        outModes: {
          default: "out"
        }
      },
      life: {
        duration: {
          sync: false,
          value: 3
        },
        count: 1
      }
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: {
          enable: true,
          mode: "trail"
        },
        onclick: {
          enable: true,
          mode: "push"
        },
        resize: true
      },
      modes: {
        trail: {
          delay: 0.005,
          quantity: 5,
          particles: {
            color: {
              value: "#00ff00",
              animation: {
                enable: false
              }
            },
            size: {
              value: 18,
              random: {
                enable: true,
                minimumValue: 14
              }
            },
            move: {
              speed: 8
            }
          }
        },
        push: {
          quantity: 4
        }
      }
    },
    background: {
      opacity: 0
    },
    retina_detect: true
  },
  7: {
    particles: {
      number: { value: 100, density: { enable: true, value_area: 800 } },
      color: { value: ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"] },
      shape: { type: "circle" },
      opacity: { value: 0.7, random: true },
      size: { value: 6, random: true },
      move: {
        enable: true,
        speed: 3,
        direction: "bottom",
        random: true,
        straight: false,
        out_mode: "out",
        bounce: false,
      },
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: true, mode: "bubble" },
        onclick: { enable: true, mode: "repulse" },
        resize: true,
      },
    },
    retina_detect: true,
  },
  8: {
    particles: {
      number: { value: 100, density: { enable: true, value_area: 800 } },
      color: { value: "#ffffff" },
      shape: { type: "star" },
      opacity: { value: 0.5, random: true },
      size: { value: 3, random: true },
      twinkle: {
        particles: {
          enable: true,
          frequency: 0.05,
          opacity: 1,
        },
      },
      move: {
        enable: true,
        speed: 0.5,
        direction: "none",
        random: true,
        straight: false,
        out_mode: "out",
        bounce: false,
      },
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: true, mode: "bubble" },
        onclick: { enable: true, mode: "push" },
        resize: true,
      },
    },
    retina_detect: true,
  },
  9: {
    particles: {
      number: { value: 30, density: { enable: true, value_area: 800 } },
      color: { value: "#ffffff" },
      shape: { type: "polygon", polygon: { nb_sides: 6 } },
      opacity: { value: 0.3, random: false },
      size: { value: 10, random: false },
      line_linked: {
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
        out_mode: "out",
        bounce: false,
      },
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: true, mode: "grab" },
        onclick: { enable: true, mode: "push" },
        resize: true,
      },
    },
    retina_detect: true,
  },
};