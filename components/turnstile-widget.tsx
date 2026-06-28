'use client';

import { useEffect, useRef } from 'react';

interface TurnstileWidgetProps {
  siteKey: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({ siteKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let intervalId: NodeJS.Timeout | null = null;

    const tryRender = () => {
      if (!containerRef.current || !window.turnstile) return false;
      if (widgetIdRef.current) return true;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'dark',
      });
      return true;
    };

    if (!tryRender()) {
      intervalId = setInterval(() => {
        if (tryRender() && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, 100);

      setTimeout(() => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, 10000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  return <div ref={containerRef} />;
}
