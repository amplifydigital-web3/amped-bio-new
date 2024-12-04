import type { Theme } from '../types/editor';
import { cn } from './cn';

export function getButtonBaseStyle(style: number): string {
  const styles = {
    0: 'rounded-lg bg-gray-100',
    1: 'rounded-full bg-gray-100',
    2: 'rounded-lg border-2 border-gray-300',
    3: 'rounded-lg bg-gray-100 shadow-lg',
    4: 'rounded-lg bg-white/30 backdrop-blur-sm',
    5: 'rounded-lg bg-gray-100 shadow-[0_0_15px_rgba(0,0,0,0.2)] hover:shadow-[0_0_25px_rgba(0,0,0,0.3)] transition-shadow',
    6: 'rounded-lg bg-gradient-to-r from-blue-500 to-purple-500',
    7: 'rounded-lg bg-gray-100 hover:-translate-y-1 transition-transform shadow-md',
    8: 'rounded-lg bg-gray-100 ring-2 ring-offset-2 ring-blue-500',
    9: 'border-b-2 border-gray-300 hover:border-gray-400 transition-colors rounded-none bg-transparent',
  };

  return styles[style as keyof typeof styles] || styles[0];
}

export function getContainerStyle(style: number): string {
  const styles = {
    0: '',
    1: 'bg-white/70 backdrop-blur-md rounded-2xl shadow-lg',
    2: 'bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.12)] transition-shadow',
    3: 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-[1px] rounded-2xl',
    4: 'bg-white rounded-2xl shadow-[0_0_30px_rgba(59,130,246,0.5)]',
    5: 'bg-white rounded-2xl border-2 border-gray-200 outline outline-2 outline-offset-2 outline-gray-100',
    6: 'bg-white/90 rounded-[2.5rem] shadow-[inset_0_0_30px_rgba(0,0,0,0.05),0_20px_40px_rgba(0,0,0,0.1)]',
    7: 'bg-white/50 backdrop-blur-sm rounded-xl border border-white/20',
    8: 'relative before:absolute before:inset-x-0 before:top-0 before:-translate-y-[calc(100%-2rem)] before:h-24 before:bg-white/90 before:[border-radius:187.5px_187.5px_0_0] before:-z-10 bg-white/90 rounded-3xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.05)] backdrop-blur-sm',
    9: 'bg-white rounded-3xl shadow-[0_35px_60px_-15px_rgba(0,0,0,0.2)]',
  };

  return styles[style as keyof typeof styles] || '';
}

export function getButtonEffectStyle(effect: number): string {
  const effects = {
    0: '',
    1: 'hover:scale-105 transition-transform',
    2: 'hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-shadow',
    3: 'hover:translate-x-2 transition-transform',
    4: 'hover:animate-bounce',
    5: 'hover:animate-pulse',
    6: 'hover:animate-[wiggle_0.3s_ease-in-out]',
    7: 'hover:rotate-3 transition-transform',
    8: 'hover:scale-110 active:scale-95 transition-transform',
    9: 'hover:before:opacity-100 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:opacity-0 before:transition-opacity overflow-hidden relative',
  };

  return effects[effect as keyof typeof effects] || '';
}

export function getHeroEffectStyle(effect: number): string {
  const effects = {
    0: '',
    1: 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-[length:200%_auto] animate-[gradient_3s_linear_infinite] bg-clip-text text-transparent',
    2: 'text-transparent relative before:content-[attr(data-text)] before:absolute before:text-white before:inset-0 before:animate-[glow_2s_ease-in-out_infinite_alternate] before:text-shadow-glow',
    3: 'overflow-hidden whitespace-nowrap border-r-4 border-white/50 pr-1 w-fit animate-[typewriter_3s_steps(40)_1s_forwards,blink_0.5s_step-end_infinite]',
    4: 'opacity-0 animate-[fadeIn_1s_ease-out_forwards]',
    5: 'opacity-0 animate-[slideUp_1s_ease-out_forwards]',
    6: '[&>span]:inline-block [&>span]:animate-[wave_1s_ease-in-out_infinite] [&>span:nth-child(2)]:animation-delay-100 [&>span:nth-child(3)]:animation-delay-200 [&>span:nth-child(4)]:animation-delay-300',
    7: 'text-shadow-neon animate-pulse',
    8: 'animate-[rainbow_3s_linear_infinite]',
    9: 'animate-[glitch_3s_infinite] font-mono',
  };

  return effects[effect as keyof typeof effects] || '';
}