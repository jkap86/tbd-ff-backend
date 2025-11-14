import { logger } from './logger';

/**
 * Calculate which roster should be picking based on current pick number
 * Handles snake, linear, and 3rd round reversal logic
 */
export function calculateCurrentRoster(
  pickNumber: number,
  totalRosters: number,
  draftType: "snake" | "linear" | "auction" | "slow_auction",
  thirdRoundReversal: boolean
): { round: number; pickInRound: number; draftPosition: number } {
  // Auction drafts don't use traditional pick order
  if (draftType === "auction" || draftType === "slow_auction") {
    return { round: 1, pickInRound: 1, draftPosition: 1 };
  }

  const round = Math.ceil(pickNumber / totalRosters);
  const pickInRound = ((pickNumber - 1) % totalRosters) + 1;

  let draftPosition: number;

  if (draftType === "linear") {
    // Linear: same order every round
    draftPosition = pickInRound;
  } else {
    // Snake draft logic
    let isReversed: boolean;

    if (thirdRoundReversal && round === 3) {
      // Round 3 with reversal: goes forward (not reversed)
      isReversed = false;
    } else if (thirdRoundReversal && round > 3) {
      // After round 3 with reversal: adjust the pattern
      // Round 4 should be reversed, Round 5 forward, etc.
      isReversed = round % 2 === 0;
    } else {
      // Normal snake: odd rounds forward, even rounds reversed
      isReversed = round % 2 === 0;
    }

    draftPosition = isReversed ? totalRosters - pickInRound + 1 : pickInRound;
  }

  let isReversedForLog = "N/A";
  if (draftType === "snake") {
    if (thirdRoundReversal && round === 3) {
      isReversedForLog = "false";
    } else if (thirdRoundReversal && round > 3) {
      isReversedForLog = (round % 2 === 0).toString();
    } else {
      isReversedForLog = (round % 2 === 0).toString();
    }
  }

  logger.info('[calculateCurrentRoster] Pick calculation', {
    pickNumber,
    totalRosters,
    draftType,
    thirdRoundReversal,
    round,
    pickInRound,
    isReversed: isReversedForLog,
    draftPosition,
  });

  return { round, pickInRound, draftPosition };
}
