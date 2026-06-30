'use client';

import { useEffect, useRef, useState } from 'react';

type TurnstileAction = 'admin-login' | 'domain-request' | 'api-access' | 'api-key-request';

interface TurnstileWidgetProps {
  siteKey: string;
  action?: TurnstileAction;
  onVerify?: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const RENDER_TIMEOUT_MS = 10_000;

export function TurnstileWidget({ siteKey, action, onVerify, onExpire, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  }, [onVerify, onExpire, onError]);

  useEffect(() => {
    if (!containerRef.current) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tryRender = () => {
      if (!containerRef.current || !window.turnstile) return false;
      if (widgetIdRef.current) return true;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'dark',
        ...(action ? { action } : {}),
        callback: (token: string) => onVerifyRef.current?.(token),
        'expired-callback': () => onExpireRef.current?.(),
        'error-callback': () => onErrorRef.current?.(),
      });
      return true;
    };

    if (!tryRender()) {
      intervalId = setInterval(() => {
        if (cancelled) return;
        if (tryRender() && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }
      }, 100);

      timeoutId = setTimeout(() => {
        if (cancelled) return;
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        // Only show error if widget never rendered
        if (!widgetIdRef.current) {
          setFailed(true);
        }
      }, RENDER_TIMEOUT_MS);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action]);

  if (failed) {
    return (
      <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
        Could not load bot protection (Turnstile). Check that your ad blocker or network allows scripts from challenges.cloudflare.com, then refresh the page.
      </div>
    );
  }

  return <div ref={containerRef} />;
}
