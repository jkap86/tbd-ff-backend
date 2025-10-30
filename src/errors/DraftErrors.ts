export class DraftError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.name = 'DraftError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class DraftNotFoundError extends DraftError {
  constructor(draftId: number) {
    super(`Draft ${draftId} not found`, 'DRAFT_NOT_FOUND', 404);
    this.name = 'DraftNotFoundError';
  }
}

export class InvalidDraftStateError extends DraftError {
  constructor(message: string) {
    super(message, 'INVALID_DRAFT_STATE', 400);
    this.name = 'InvalidDraftStateError';
  }
}

export class NotYourTurnError extends DraftError {
  constructor(rosterId: number) {
    super(`Not roster ${rosterId}'s turn to pick`, 'NOT_YOUR_TURN', 403);
    this.name = 'NotYourTurnError';
  }
}

export class PlayerAlreadyDraftedError extends DraftError {
  constructor(playerId: number) {
    super(`Player ${playerId} already drafted`, 'PLAYER_ALREADY_DRAFTED', 400);
    this.name = 'PlayerAlreadyDraftedError';
  }
}

export class InsufficientBudgetError extends DraftError {
  constructor(available: number, required: number) {
    super(
      `Insufficient budget: $${available} available, $${required} required`,
      'INSUFFICIENT_BUDGET',
      400
    );
    this.name = 'InsufficientBudgetError';
  }
}

export class AutoPickFailedError extends DraftError {
  constructor(draftId: number, reason: string) {
    super(
      `Auto-pick failed for draft ${draftId}: ${reason}`,
      'AUTO_PICK_FAILED',
      500
    );
    this.name = 'AutoPickFailedError';
  }
}
