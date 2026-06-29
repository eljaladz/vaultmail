const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const verifyTurnstileToken = async (
  token: string,
  options?: { expectedAction?: string }
): Promise<boolean> => {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return true;
  }

  const tokenValue = token?.trim();
  if (!tokenValue) {
    return false;
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: tokenValue
      })
    });
    if (!response.ok) {
      return false;
    }
    const data = (await response.json()) as {
      success?: boolean;
      action?: string;
    };
    if (!data?.success) return false;
    if (options?.expectedAction && data.action !== options.expectedAction) {
      return false;
    }
    return true;
  } catch (error) {
    console.error('Turnstile verification failed:', error);
    return false;
  }
};
