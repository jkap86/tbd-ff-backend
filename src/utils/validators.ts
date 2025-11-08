/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

/**
 * Validates and parses an ID parameter
 * @param id ID value to validate (string or number)
 * @param fieldName Name of the field for error messages (default: "ID")
 * @returns Parsed integer ID
 * @throws ValidationError if ID is invalid
 *
 * @example
 * const userId = validateId(req.params.userId, "User ID");
 * const leagueId = validateId(req.body.leagueId, "League ID");
 */
export const validateId = (
  id: string | number | undefined,
  fieldName: string = "ID"
): number => {
  if (id === undefined || id === null) {
    throw new ValidationError(`${fieldName} is required`);
  }

  const parsed = typeof id === "string" ? parseInt(id, 10) : id;

  if (isNaN(parsed) || parsed <= 0) {
    throw new ValidationError(`Invalid ${fieldName}`);
  }

  return parsed;
};

/**
 * Validates a required string parameter
 * @param value String value to validate
 * @param fieldName Name of the field for error messages
 * @returns Trimmed string value
 * @throws ValidationError if value is invalid
 */
export const validateRequiredString = (
  value: string | undefined,
  fieldName: string
): string => {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required`);
  }

  return value.trim();
};

/**
 * Validates an email address
 * @param email Email address to validate
 * @returns Trimmed lowercase email
 * @throws ValidationError if email is invalid
 */
export const validateEmail = (email: string | undefined): string => {
  const trimmed = validateRequiredString(email, "Email");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(trimmed)) {
    throw new ValidationError("Invalid email address");
  }

  return trimmed.toLowerCase();
};

/**
 * Validates a season year
 * @param season Season year to validate
 * @returns Validated season year string
 * @throws ValidationError if season is invalid
 */
export const validateSeason = (season: string | undefined): string => {
  const trimmed = validateRequiredString(season, "Season");
  const seasonRegex = /^\d{4}$/;

  if (!seasonRegex.test(trimmed)) {
    throw new ValidationError("Invalid season format. Must be a 4-digit year");
  }

  const year = parseInt(trimmed, 10);
  const currentYear = new Date().getFullYear();

  if (year < 2020 || year > currentYear + 1) {
    throw new ValidationError(
      `Season must be between 2020 and ${currentYear + 1}`
    );
  }

  return trimmed;
};
