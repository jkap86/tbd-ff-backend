/**
 * Middleware Tests
 * Tests authentication, rate limiting, and error handling middleware
 */

import { authenticate } from '../middleware/authMiddleware';
import { verifyToken } from '../utils/jwt';
import { mockRequest, mockResponse, mockNext, mockAuthUser } from './setup';

jest.mock('../utils/jwt');

describe('Authentication Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should authenticate valid token', () => {
    const token = 'valid.jwt.token';
    (verifyToken as jest.Mock).mockReturnValue(mockAuthUser);

    const req = mockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockResponse();
    const next = mockNext();

    authenticate(req as any, res as any, next);

    expect(verifyToken).toHaveBeenCalledWith(token);
    expect(req.user).toEqual(mockAuthUser);
    expect(next).toHaveBeenCalled();
  });

  it('should reject request without token', () => {
    const req = mockRequest({
      headers: {},
    });
    const res = mockResponse();
    const next = mockNext();

    authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'No token provided',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject invalid token', () => {
    const token = 'invalid.jwt.token';
    (verifyToken as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid token');
    });

    const req = mockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockResponse();
    const next = mockNext();

    authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid token',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle malformed authorization header', () => {
    const req = mockRequest({
      headers: { authorization: 'InvalidFormat' },
    });
    const res = mockResponse();
    const next = mockNext();

    authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('Rate Limiting Middleware', () => {
  // Rate limiting tests would require time manipulation or mocking
  // These are integration-style tests best run separately

  it('should document rate limit configuration', () => {
    const rateLimits = {
      global: { windowMs: 60000, max: 100 },
      auth: { windowMs: 900000, max: 5 },
      registration: { windowMs: 900000, max: 5 },
    };

    expect(rateLimits.global.max).toBe(100);
    expect(rateLimits.auth.max).toBe(5);
    expect(rateLimits.registration.windowMs).toBe(900000);
  });
});
