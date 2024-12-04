import type { ISourceOptions } from 'tsparticles-engine';

export const particleConfigs: Record<number, ISourceOptions> = {
  1: {
    particles: {
      number: { value: 80, density: { enable: true, value_area: 800 } },
      color: { value: '#ffffff' },
      shape: { type: 'circle' },
      opacity: { value: 0.5, random: false },
      size: { value: 3, random: true },
      move: {
        enable: true,
        speed: 1,
        direction: 'none',
        random: false,
        straight: false,
        outModes: { default: 'out' },
        bounce: false,
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: 'repulse' },
        onClick: { enable: true, mode: 'push' },
        resize: true,
      },
    },
  },
  2: {
    particles: {
      number: { value: 60, density: { enable: true, value_area: 800 } },
      color: { value: '#ffffff' },
      shape: { type: 'circle' },
      opacity: { value: 0.5, random: false },
      size: { value: 3, random: true },
      links: {
        enable: true,
        distance: 150,
        color: '#ffffff',
        opacity: 0.4,
        width: 1,
      },
      move: {
        enable: true,
        speed: 2,
        direction: 'none',
        random: false,
        straight: false,
        outModes: { default: 'out' },
        bounce: false,
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: 'grab' },
        onClick: { enable: true, mode: 'push' },
        resize: true,
      },
    },
  },
  3: {
    particles: {
      number: { value: 100, density: { enable: true, value_area: 800 } },
      color: { value: '#ffffff' },
      shape: { type: 'circle' },
      opacity: { value: 0.7, random: false },
      size: { value: 4, random: true },
      move: {
        enable: true,
        speed: 3,
        direction: 'bottom',
        random: false,
        straight: false,
        outModes: { default: 'out' },
        bounce: false,
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: 'repulse' },
        onClick: { enable: true, mode: 'remove' },
        resize: true,
      },
    },
  },
  4: {
    particles: {
      number: { value: 50, density: { enable: true, value_area: 800 } },
      color: { value: '#ffffff' },
      shape: { type: 'circle' },
      opacity: { value: 0.3, random: true },
      size: { value: 8, random: true },
      move: {
        enable: true,
        speed: 2,
        direction: 'top',
        random: true,
        straight: false,
        outModes: { default: 'out' },
        bounce: false,
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: 'bubble' },
        onClick: { enable: true, mode: 'repulse' },
        resize: true,
      },
    },
  },
  5: {
    particles: {
      number: { value: 50, density: { enable: true, value_area: 800 } },
      color: { value: '#ffff00' },
      shape: { type: 'circle' },
      opacity: { value: 0.6, random: true },
      size: { value: 3, random: true },
      move: {
        enable: true,
        speed: 1,
        direction: 'none',
        random: true,
        straight: false,
        outModes: { default: 'out' },
        bounce: false,
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: 'bubble' },
        onClick: { enable: true, mode: 'repulse' },
        resize: true,
      },
    },
  },
  6: {
    fpsLimit: 60,
    particles: {
      number: { value: 80, density: { enable: true, value_area: 800 } },
      color: { value: '#00ff00' },
      shape: {
        type: 'char',
        character: {
          value: ['0', '1'],
          font: 'Courier New',
          style: '',
          weight: '400',
        },
      },
      opacity: {
        value: 0.8,
        random: { enable: true, minimumValue: 0.4 },
      },
      size: {
        value: 16,
        random: { enable: true, minimumValue: 12 },
      },
      move: {
        enable: true,
        speed: 5,
        direction: 'bottom',
        random: false,
        straight: true,
        outModes: { default: 'out' },
      },
      life: {
        duration: { value: 3, sync: false },
        count: 1,
      },
    },
    interactivity: {
      events: {
        onClick: { enable: true, mode: 'push' },
        resize: true,
      },
    },
  },
  7: {
    particles: {
      number: { value: 100, density: { enable: true, value_area: 800 } },
      color: { 
        value: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'],
        animation: {
          enable: true,
          speed: 20,
          sync: false,
        },
      },
      shape: { type: 'circle' },
      opacity: { value: 0.7, random: true },
      size: { value: 6, random: true },
      move: {
        enable: true,
        speed: 3,
        direction: 'bottom',
        random: true,
        straight: false,
        outModes: { default: 'out' },
        bounce: false,
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: 'bubble' },
        onClick: { enable: true, mode: 'repulse' },
        resize: true,
      },
    },
  },
  8: {
    particles: {
      number: { value: 100, density: { enable: true, value_area: 800 } },
      color: { value: '#ffffff' },
      shape: { type: 'star' },
      opacity: { value: 0.5, random: true },
      size: { value: 3, random: true },
      move: {
        enable: true,
        speed: 0.5,
        direction: 'none',
        random: true,
        straight: false,
        outModes: { default: 'out' },
        bounce: false,
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: 'bubble' },
        onClick: { enable: true, mode: 'push' },
        resize: true,
      },
    },
  },
  9: {
    particles: {
      number: { value: 30, density: { enable: true, value_area: 800 } },
      color: { value: '#ffffff' },
      shape: { 
        type: 'polygon',
        polygon: { nb_sides: 6 },
      },
      opacity: { value: 0.3, random: false },
      size: { value: 10, random: false },
      links: {
        enable: true,
        distance: 200,
        color: '#ffffff',
        opacity: 0.2,
        width: 1,
      },
      move: {
        enable: true,
        speed: 1,
        direction: 'none',
        random: false,
        straight: false,
        outModes: { default: 'out' },
        bounce: false,
      },
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: 'grab' },
        onClick: { enable: true, mode: 'push' },
        resize: true,
      },
    },
  },
};