import {
  checkDraftParticipation,
  checkDraftCommissioner,
  checkRosterOwnershipInDraft,
} from "../services/authorizationService";

/**
 * Check if a user is a participant in a draft
 * @param userId - The user's ID
 * @param draftId - The draft ID
 * @returns true if user is a participant, false otherwise
 */
export async function isUserDraftParticipant(
  userId: number,
  draftId: number
): Promise<boolean> {
  return checkDraftParticipation(userId, draftId);
}

/**
 * Check if a user is the commissioner of the league that owns a draft
 * @param userId - The user's ID
 * @param draftId - The draft ID
 * @returns true if user is the commissioner, false otherwise
 */
export async function isUserDraftCommissioner(
  userId: number,
  draftId: number
): Promise<boolean> {
  return checkDraftCommissioner(userId, draftId);
}

/**
 * Check if a user owns a specific roster in a draft
 * @param userId - The user's ID
 * @param rosterId - The roster ID
 * @param draftId - The draft ID
 * @returns true if user owns the roster, false otherwise
 */
export async function doesUserOwnRoster(
  userId: number,
  rosterId: number,
  draftId: number
): Promise<boolean> {
  return checkRosterOwnershipInDraft(userId, rosterId, draftId);
}

