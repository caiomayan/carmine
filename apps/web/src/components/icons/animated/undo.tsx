'use client';

import { cubicBezier, m, useAnimation } from 'framer-motion';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface UndoIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface UndoIconProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
}

const CUSTOM_EASING = cubicBezier(0.25, 0.1, 0.25, 1);

const UndoIcon = forwardRef<UndoIconHandle, UndoIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => controls.start('animate'),
        stopAnimation: () => controls.start('normal'),
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start('animate');
        }
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start('normal');
        }
      },
      [controls, onMouseLeave],
    );
    return (
      <span
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          aria-hidden="true"
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <m.path
            animate={controls}
            d="M3 7v6h6"
            transition={{
              duration: 0.6,
              ease: CUSTOM_EASING,
            }}
            variants={{
              normal: { translateX: 0, translateY: 0, rotate: 0 },
              animate: {
                translateX: [0, 2.1, 0],
                translateY: [0, -1.4, 0],
                rotate: [0, 12, 0],
              },
            }}
          />
          <m.path
            animate={controls}
            d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
            transition={{
              duration: 0.6,
              ease: CUSTOM_EASING,
            }}
            variants={{
              normal: { pathLength: 1 },
              animate: { pathLength: [1, 0.8, 1] },
            }}
          />
        </svg>
      </span>
    );
  },
);

UndoIcon.displayName = 'UndoIcon';

export { UndoIcon };
