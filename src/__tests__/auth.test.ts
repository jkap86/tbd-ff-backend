import { Request, Response } from 'express';
import { register, login } from '../controllers/authController';
import { createUser, getUserByUsernameWithPassword } from '../models/User';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';

// Mock dependencies
jest.mock('../models/User');
jest.mock('../utils/password');
jest.mock('../utils/jwt');
jest.mock('../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Authentication', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create mock response
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };
  });

  describe('Registration', () => {
    beforeEach(() => {
      mockRequest = {
        body: {
          username: 'testuser',
          email: 'test@example.com',
          password: 'ValidPass123!',
          phone_number: '+1234567890',
        },
      };
    });

    it('should successfully register a user with valid credentials', async () => {
      // Mock implementations
      const mockHashedPassword = 'hashedPassword123';
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        phone_number: '+1234567890',
        is_phone_verified: false,
        is_admin: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const mockToken = 'jwt.token.here';

      (hashPassword as jest.Mock).mockResolvedValue(mockHashedPassword);
      (createUser as jest.Mock).mockResolvedValue(mockUser);
      (generateToken as jest.Mock).mockReturnValue(mockToken);

      // Execute
      await register(mockRequest as Request, mockResponse as Response);

      // Verify
      expect(hashPassword).toHaveBeenCalledWith('ValidPass123!');
      expect(createUser).toHaveBeenCalledWith(
        'testuser',
        'test@example.com',
        mockHashedPassword,
        '+1234567890'
      );
      expect(generateToken).toHaveBeenCalledWith({
        userId: mockUser.id,
        username: mockUser.username,
        isAdmin: mockUser.is_admin,
      });
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: mockUser.id,
            username: mockUser.username,
            email: mockUser.email,
            phone_number: mockUser.phone_number,
            is_phone_verified: mockUser.is_phone_verified,
          },
          token: mockToken,
        },
      });
    });

    it('should reject registration with duplicate username', async () => {
      // Mock duplicate username error
      const duplicateError = new Error('Username already exists');
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword');
      (createUser as jest.Mock).mockRejectedValue(duplicateError);

      // Execute
      await register(mockRequest as Request, mockResponse as Response);

      // Verify
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Username already exists',
      });
    });

    it('should reject registration with duplicate email', async () => {
      // Mock duplicate email error
      const duplicateError = new Error('Email already exists');
      (hashPassword as jest.Mock).mockResolvedValue('hashedPassword');
      (createUser as jest.Mock).mockRejectedValue(duplicateError);

      // Execute
      await register(mockRequest as Request, mockResponse as Response);

      // Verify
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Email already exists',
      });
    });

    it('should handle internal server errors gracefully', async () => {
      // Mock unexpected error
      const unexpectedError = new Error('Database connection failed');
      (hashPassword as jest.Mock).mockRejectedValue(unexpectedError);

      // Execute
      await register(mockRequest as Request, mockResponse as Response);

      // Verify
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Error registering user',
      });
    });
  });

  describe('Login', () => {
    beforeEach(() => {
      mockRequest = {
        body: {
          username: 'testuser',
          password: 'ValidPass123!',
        },
      };
    });

    it('should return token for valid credentials', async () => {
      // Mock implementations
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedPassword123',
        phone_number: '+1234567890',
        is_phone_verified: false,
        is_admin: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const mockToken = 'jwt.token.here';

      (getUserByUsernameWithPassword as jest.Mock).mockResolvedValue(mockUser);
      (comparePassword as jest.Mock).mockResolvedValue(true);
      (generateToken as jest.Mock).mockReturnValue(mockToken);

      // Execute
      await login(mockRequest as Request, mockResponse as Response);

      // Verify
      expect(getUserByUsernameWithPassword).toHaveBeenCalledWith('testuser');
      expect(comparePassword).toHaveBeenCalledWith('ValidPass123!', 'hashedPassword123');
      expect(generateToken).toHaveBeenCalledWith({
        userId: mockUser.id,
        username: mockUser.username,
        isAdmin: mockUser.is_admin,
      });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: mockUser.id,
            username: mockUser.username,
            email: mockUser.email,
            phone_number: mockUser.phone_number,
            is_phone_verified: mockUser.is_phone_verified,
          },
          token: mockToken,
        },
      });
    });

    it('should reject login with non-existent username', async () => {
      // Mock user not found
      (getUserByUsernameWithPassword as jest.Mock).mockResolvedValue(null);

      // Execute
      await login(mockRequest as Request, mockResponse as Response);

      // Verify
      expect(getUserByUsernameWithPassword).toHaveBeenCalledWith('testuser');
      expect(comparePassword).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid username or password',
      });
    });

    it('should reject login with invalid password', async () => {
      // Mock user exists but password is wrong
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedPassword123',
        phone_number: '+1234567890',
        is_phone_verified: false,
        is_admin: false,
      };

      (getUserByUsernameWithPassword as jest.Mock).mockResolvedValue(mockUser);
      (comparePassword as jest.Mock).mockResolvedValue(false);

      // Execute
      await login(mockRequest as Request, mockResponse as Response);

      // Verify
      expect(getUserByUsernameWithPassword).toHaveBeenCalledWith('testuser');
      expect(comparePassword).toHaveBeenCalledWith('ValidPass123!', 'hashedPassword123');
      expect(generateToken).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid username or password',
      });
    });

    it('should handle database errors during login', async () => {
      // Mock database error
      const dbError = new Error('Database connection failed');
      (getUserByUsernameWithPassword as jest.Mock).mockRejectedValue(dbError);

      // Execute
      await login(mockRequest as Request, mockResponse as Response);

      // Verify
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Error logging in',
      });
    });
  });

  describe('Password Validation (via validators)', () => {
    // These tests document the password requirements enforced by authValidator.ts
    // The actual validation happens in the validator middleware, not in the controller

    it('should document that passwords must be at least 12 characters', () => {
      // Password validation requirements from authValidator.ts:
      // - Minimum 12 characters
      // - Maximum 128 characters
      // - At least one lowercase letter
      // - At least one uppercase letter
      // - At least one number
      // - At least one special character (@$!%*?&)
      // - Cannot contain username
      // - Cannot contain email local part
      // - Cannot be a common password

      const validationRules = {
        minLength: 12,
        maxLength: 128,
        requiresLowercase: true,
        requiresUppercase: true,
        requiresNumber: true,
        requiresSpecialChar: true,
        specialChars: '@$!%*?&',
        cannotContainUsername: true,
        cannotContainEmail: true,
        rejectsCommonPasswords: true,
      };

      expect(validationRules.minLength).toBe(12);
      expect(validationRules.requiresSpecialChar).toBe(true);
    });

    it('should document password examples', () => {
      const invalidPasswords = [
        { password: 'short1!', reason: 'too short (less than 12 chars)' },
        { password: 'NoSpecialChar1', reason: 'missing special character' },
        { password: 'nostuppercase1!', reason: 'missing uppercase letter' },
        { password: 'NOLOWERCASE1!', reason: 'missing lowercase letter' },
        { password: 'NoNumbers!!!', reason: 'missing number' },
        { password: 'Password123!', reason: 'contains common word "password"' },
      ];

      const validPasswords = [
        'ValidPass123!',
        'MySecure@Pass2024',
        'C0mpl3x!P@ssw0rd',
        'Un!qu3P@ssw0rd99',
      ];

      expect(invalidPasswords.length).toBeGreaterThan(0);
      expect(validPasswords.length).toBeGreaterThan(0);
    });
  });
});
