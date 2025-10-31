/**
 * Input validation utilities for controllers
 * Provides consistent error handling and validation across the application
 */

/**
 * Validates and parses a positive integer from a string parameter
 * @param value - The string value to parse
 * @param fieldName - The name of the field (for error messages)
 * @returns The parsed integer value
 * @throws Error if validation fails
 */
export function validatePositiveInteger(value: string | undefined, fieldName: string): number {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${fieldName} is required`);
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (parsed < 1) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

/**
 * Validates and parses an ID (positive integer) from a string parameter
 * This is an alias for validatePositiveInteger with more semantic naming
 * @param value - The string value to parse
 * @param fieldName - The name of the field (for error messages)
 * @returns The parsed ID value
 * @throws Error if validation fails
 */
export function validateId(value: string | undefined, fieldName: string): number {
  return validatePositiveInteger(value, fieldName);
}

/**
 * Validates and parses a non-negative integer (0 or positive)
 * @param value - The string value to parse
 * @param fieldName - The name of the field (for error messages)
 * @returns The parsed integer value
 * @throws Error if validation fails
 */
export function validateNonNegativeInteger(value: string | undefined, fieldName: string): number {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${fieldName} is required`);
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return parsed;
}

/**
 * Validates and parses an optional positive integer from a string parameter
 * @param value - The string value to parse
 * @param fieldName - The name of the field (for error messages)
 * @returns The parsed integer value or null if not provided
 * @throws Error if validation fails
 */
export function validateOptionalPositiveInteger(
  value: string | undefined,
  fieldName: string
): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (parsed < 1) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

/**
 * Validates an integer is within a specific range
 * @param value - The integer value to validate
 * @param fieldName - The name of the field (for error messages)
 * @param min - Minimum allowed value (inclusive)
 * @param max - Maximum allowed value (inclusive)
 * @returns The validated value
 * @throws Error if validation fails
 */
export function validateIntegerRange(
  value: number,
  fieldName: string,
  min: number,
  max: number
): number {
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return value;
}

/**
 * Validates that a value is one of the allowed enum values
 * @param value - The value to validate
 * @param fieldName - The name of the field (for error messages)
 * @param allowedValues - Array of allowed values
 * @returns The validated value
 * @throws Error if validation fails
 */
export function validateEnum<T>(
  value: T | undefined,
  fieldName: string,
  allowedValues: T[]
): T {
  if (value === undefined || value === null) {
    throw new Error(`${fieldName} is required`);
  }

  if (!allowedValues.includes(value)) {
    throw new Error(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`
    );
  }

  return value;
}

/**
 * Validates that a value is an array
 * @param value - The value to validate
 * @param fieldName - The name of the field (for error messages)
 * @returns The validated array
 * @throws Error if validation fails
 */
export function validateArray(
  value: any,
  fieldName: string
): any[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  return value;
}

/**
 * Validates that an array is not empty
 * @param value - The array to validate
 * @param fieldName - The name of the field (for error messages)
 * @returns The validated array
 * @throws Error if validation fails
 */
export function validateNonEmptyArray(
  value: any[],
  fieldName: string
): any[] {
  if (value.length === 0) {
    throw new Error(`${fieldName} must not be empty`);
  }
  return value;
}

/**
 * Validates that a string is not empty
 * @param value - The string to validate
 * @param fieldName - The name of the field (for error messages)
 * @returns The validated string
 * @throws Error if validation fails
 */
export function validateNonEmptyString(
  value: string | undefined,
  fieldName: string
): string {
  if (!value || value.trim() === '') {
    throw new Error(`${fieldName} is required and cannot be empty`);
  }
  return value;
}

/**
 * Validates a string length
 * @param value - The string to validate
 * @param fieldName - The name of the field (for error messages)
 * @param minLength - Minimum length (inclusive)
 * @param maxLength - Maximum length (inclusive)
 * @returns The validated string
 * @throws Error if validation fails
 */
export function validateStringLength(
  value: string,
  fieldName: string,
  minLength: number,
  maxLength: number
): string {
  if (value.length < minLength || value.length > maxLength) {
    throw new Error(
      `${fieldName} must be between ${minLength} and ${maxLength} characters`
    );
  }
  return value;
}

/**
 * Validation error class for consistent error handling
 */
export class ValidationError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}
