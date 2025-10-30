/**
 * Secure logging utility that redacts sensitive information
 */

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
    console.log(`[INFO] ${message}`, data ? redactSensitiveData(data) : "");
  },

  error: (message: string, error?: any) => {
    console.error(
      `[ERROR] ${message}`,
      error ? redactSensitiveData(error) : ""
    );
  },

  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data ? redactSensitiveData(data) : "");
  },

  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(
        `[DEBUG] ${message}`,
        data ? redactSensitiveData(data) : ""
      );
    }
  },
};
