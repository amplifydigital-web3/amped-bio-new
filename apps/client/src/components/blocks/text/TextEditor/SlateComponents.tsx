import React, { PropsWithChildren, ReactNode, Ref } from 'react';
import ReactDOM from 'react-dom';

function cx(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ').trim();
}

export function css(styles: Partial<CSSStyleDeclaration>): string {
  return Object.entries(styles)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      // Converte camelCase para kebab-case (ex: backgroundColor -> background-color)
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${cssKey}:${value}`;
    })
    .join(';');
}

interface BaseProps {
  className?: string;
  [key: string]: any;
}

export const Button = React.forwardRef<HTMLSpanElement, PropsWithChildren<{
  active?: boolean;
  reversed?: boolean;
} & BaseProps>>(
  (
    {
      className,
      active = false,
      reversed = false,
      ...props
    },
    ref
  ) => (
    <span
      {...props}
      ref={ref}
      className={cx(
        "inline-flex items-center justify-center p-1 min-w-8",
        active ? "bg-gray-200 rounded" : "",
        className,
        css({
          cursor: 'pointer',
          color: reversed
            ? active
              ? 'white'
              : '#aaa'
            : active
            ? 'black'
            : '#ccc',
        })
      )}
    />
  )
);


export const Instruction = React.forwardRef<HTMLDivElement, PropsWithChildren<BaseProps>>(
  (
    { className, ...props },
    ref
  ) => (
    <div
      {...props}
      ref={ref}
      className={cx(
        className,
        css({
          whiteSpace: 'pre-wrap',
          margin: '0 -20px 10px',
          padding: '10px 20px',
          fontSize: '14px',
          background: '#f8f8e8',
        })
      )}
    />
  )
);

export const Menu = React.forwardRef<HTMLDivElement, PropsWithChildren<BaseProps>>(
  (
    { className, ...props },
    ref
  ) => (
    <div
      {...props}
      data-test-id="menu"
      ref={ref}
      className={cx(
        className,
        "flex flex-row flex-nowrap gap-2 whitespace-nowrap"
      )}
    />
  )
);

export const Portal = ({ children }: { children?: ReactNode }) => {
  return typeof document === 'object' && document.body
    ? ReactDOM.createPortal(children, document.body)
    : null;
};

export const Toolbar = React.forwardRef<HTMLDivElement, PropsWithChildren<BaseProps>>(
  (
    { className, ...props },
    ref
  ) => (
    <Menu
      {...props}
      ref={ref}
      className={cx(
        className,
        css({
          position: 'relative',
          padding: '1px 18px 17px',
          margin: '0 -20px',
          borderBottom: '2px solid #eee',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'nowrap',
          overflowX: 'auto',
        })
      )}
    />
  )
);