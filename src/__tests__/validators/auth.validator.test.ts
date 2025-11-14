import { Request } from 'express';
import { validationResult } from 'express-validator';
import {
  registerValidator,
  loginValidator,
  resetRequestValidator,
  resetPasswordValidator,
} from '../../validators/authValidator';

// Mock request
const mockRequest = (body: any = {}): Partial<Request> => ({
  body,
});

// Helper to run validators and get errors
const runValidators = async (validators: any[], req: any) => {
  for (const validator of validators) {
    await validator.run(req);
  }
  return validationResult(req);
};

describe('Auth Validators', () => {
  describe('registerValidator', () => {
    it('should pass with valid registration data', async () => {
      const req = mockRequest({
        username: 'testuser123',
        email: 'test@example.com',
        password: 'ValidPass123!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with username too short', async () => {
      const req = mockRequest({
        username: 'ab',
        email: 'test@example.com',
        password: 'ValidPass123!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: expect.stringContaining('3 and 20 characters'),
          }),
        ])
      );
    });

    it('should fail with username too long', async () => {
      const req = mockRequest({
        username: 'a'.repeat(21),
        email: 'test@example.com',
        password: 'ValidPass123!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with invalid username characters', async () => {
      const req = mockRequest({
        username: 'test@user',
        email: 'test@example.com',
        password: 'ValidPass123!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with reserved username', async () => {
      const req = mockRequest({
        username: 'admin',
        email: 'test@example.com',
        password: 'ValidPass123!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'This username is reserved',
          }),
        ])
      );
    });

    it('should fail with invalid email', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'invalid-email',
        password: 'ValidPass123!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with weak password (no uppercase)', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'test@example.com',
        password: 'validpass123!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with weak password (no lowercase)', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'test@example.com',
        password: 'VALIDPASS123!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with weak password (no number)', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'test@example.com',
        password: 'ValidPass!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with weak password (no special char)', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'test@example.com',
        password: 'ValidPass123',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with password too short', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Val1!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail when password contains username', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Testuser123!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Password must not contain your username',
          }),
        ])
      );
    });

    it('should fail when password contains email local part', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'myemail@example.com',
        password: 'Myemail123!',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Password must not contain your email',
          }),
        ])
      );
    });

    it('should pass with valid optional fields', async () => {
      const req = mockRequest({
        username: 'testuser',
        email: 'test@example.com',
        password: 'ValidPass123!',
        phone_number: '+12345678901',
        first_name: 'John',
        last_name: 'Doe',
      });

      const errors = await runValidators(registerValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('loginValidator', () => {
    it('should pass with valid login data', async () => {
      const req = mockRequest({
        username: 'testuser',
        password: 'password123',
      });

      const errors = await runValidators(loginValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with missing username', async () => {
      const req = mockRequest({
        password: 'password123',
      });

      const errors = await runValidators(loginValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing password', async () => {
      const req = mockRequest({
        username: 'testuser',
      });

      const errors = await runValidators(loginValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('resetRequestValidator', () => {
    it('should pass with valid email', async () => {
      const req = mockRequest({
        email: 'test@example.com',
      });

      const errors = await runValidators(resetRequestValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with invalid email', async () => {
      const req = mockRequest({
        email: 'invalid-email',
      });

      const errors = await runValidators(resetRequestValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing email', async () => {
      const req = mockRequest({});

      const errors = await runValidators(resetRequestValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('resetPasswordValidator', () => {
    it('should pass with valid token and password', async () => {
      const req = mockRequest({
        token: 'a'.repeat(32),
        newPassword: 'NewValidPass123!',
      });

      const errors = await runValidators(resetPasswordValidator, req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should fail with token too short', async () => {
      const req = mockRequest({
        token: 'short',
        newPassword: 'NewValidPass123!',
      });

      const errors = await runValidators(resetPasswordValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with weak new password', async () => {
      const req = mockRequest({
        token: 'a'.repeat(32),
        newPassword: 'weak',
      });

      const errors = await runValidators(resetPasswordValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing token', async () => {
      const req = mockRequest({
        newPassword: 'NewValidPass123!',
      });

      const errors = await runValidators(resetPasswordValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should fail with missing password', async () => {
      const req = mockRequest({
        token: 'a'.repeat(32),
      });

      const errors = await runValidators(resetPasswordValidator, req);
      expect(errors.isEmpty()).toBe(false);
    });
  });
});
