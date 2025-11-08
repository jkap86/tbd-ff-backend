/**
 * Secure logging utility that redacts sensitive information
 */
import { logger as winstonLogger } from "../config/logger";

const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "jwt",
  "api_key",
  "apiKey",
  "reset_token",
  "refresh_token",
];

/**
 * Redact sensitive information from objects before logging
 */
function redactSensitiveData(data: any): any {
  if (typeof data !== "object" || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sensitive) =>
      keyLower.includes(sensitive)
    );

    if (isSensitive) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Safe logging functions
 */
export const logger = {
  info: (message: string, data?: any) => {
    winstonLogger.info(message, data ? redactSensitiveData(data) : undefined);
  },

  error: (message: string, error?: any) => {
    winstonLogger.error(message, error ? redactSensitiveData(error) : undefined);
  },

  warn: (message: string, data?: any) => {
    winstonLogger.warn(message, data ? redactSensitiveData(data) : undefined);
  },

  debug: (message: string, data?: any) => {
    winstonLogger.debug(message, data ? redactSensitiveData(data) : undefined);
  },
};
