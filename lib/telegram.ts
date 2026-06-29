import 'server-only';

import { storage } from '@/lib/storage';
import { TELEGRAM_SETTINGS_KEY } from '@/lib/admin-auth';

type TelegramSettings = {
  enabled: boolean;
  botToken: string;
  chatId: string;
  allowedDomains: string[];
  updatedAt: string;
};

const parseSettings = (value: unknown): TelegramSettings | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as TelegramSettings;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') {
    return value as TelegramSettings;
  }
  return null;
};

export const getTelegramSettings = async (): Promise<TelegramSettings | null> => {
  const raw = await storage.get(TELEGRAM_SETTINGS_KEY);
  return parseSettings(raw);
};

export const isTelegramEnabled = async (): Promise<boolean> => {
  const settings = await getTelegramSettings();
  return Boolean(settings?.enabled && settings.botToken && settings.chatId);
};

export const sendTelegramMessage = async (message: string): Promise<boolean> => {
  const settings = await getTelegramSettings();
  if (!settings?.enabled || !settings.botToken || !settings.chatId) {
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${settings.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.chatId,
          text: message.slice(0, 4000),
          disable_web_page_preview: true,
        }),
      }
    );
    return response.ok;
  } catch (error) {
    console.error('Telegram send failed:', error);
    return false;
  }
};
