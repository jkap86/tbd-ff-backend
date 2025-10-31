import { sendPushNotification } from "./pushNotificationService";
import { logger } from "../config/logger";

/**
 * Helper functions to send notifications for specific events
 * These can be called from various parts of the application
 */

/**
 * Notify user it's their turn to draft
 */
export async function notifyDraftTurn(
  userId: number,
  draftId: number,
  pickNumber: number,
  timeLimit?: number
): Promise<void> {
  try {
    const timeLimitText = timeLimit ? ` (${Math.floor(timeLimit / 60)}:${(timeLimit % 60).toString().padStart(2, '0')})` : '';

    await sendPushNotification({
      userIds: [userId],
      type: 'draft_turn',
      payload: {
        title: "Your Turn to Draft!",
        body: `Pick #${pickNumber}${timeLimitText}`,
        data: {
          type: 'draft_turn',
          draftId: draftId.toString(),
          pickNumber: pickNumber.toString(),
          screen: 'DraftRoom'
        }
      }
    });
  } catch (error) {
    logger.error('Error sending draft turn notification:', error);
  }
}

/**
 * Notify league about a draft pick
 */
export async function notifyDraftPick(
  userIds: number[],
  pickingUserId: number,
  playerName: string,
  teamName: string,
  pickNumber: number
): Promise<void> {
  try {
    // Don't notify the person who made the pick
    const notifyUserIds = userIds.filter(id => id !== pickingUserId);

    if (notifyUserIds.length === 0) return;

    await sendPushNotification({
      userIds: notifyUserIds,
      type: 'draft_pick',
      payload: {
        title: `${teamName} picked ${playerName}`,
        body: `Pick #${pickNumber}`,
        data: {
          type: 'draft_pick',
          playerName,
          teamName,
          screen: 'DraftRoom'
        }
      }
    });
  } catch (error) {
    logger.error('Error sending draft pick notification:', error);
  }
}

/**
 * Notify about trade proposal
 */
export async function notifyTradeProposed(
  recipientUserId: number,
  proposerName: string,
  leagueId: number,
  tradeId: number
): Promise<void> {
  try {
    await sendPushNotification({
      userIds: [recipientUserId],
      type: 'trade_proposed',
      payload: {
        title: "New Trade Proposal",
        body: `${proposerName} sent you a trade offer`,
        data: {
          type: 'trade_proposed',
          leagueId: leagueId.toString(),
          tradeId: tradeId.toString(),
          screen: 'TradeDetail'
        }
      }
    });
  } catch (error) {
    logger.error('Error sending trade proposed notification:', error);
  }
}

/**
 * Notify about trade accepted
 */
export async function notifyTradeAccepted(
  proposerUserId: number,
  accepterName: string,
  leagueId: number,
  tradeId: number
): Promise<void> {
  try {
    await sendPushNotification({
      userIds: [proposerUserId],
      type: 'trade_accepted',
      payload: {
        title: "Trade Accepted!",
        body: `${accepterName} accepted your trade`,
        data: {
          type: 'trade_accepted',
          leagueId: leagueId.toString(),
          tradeId: tradeId.toString(),
          screen: 'TradeDetail'
        }
      }
    });
  } catch (error) {
    logger.error('Error sending trade accepted notification:', error);
  }
}

/**
 * Notify about trade declined
 */
export async function notifyTradeDeclined(
  proposerUserId: number,
  declinerName: string
): Promise<void> {
  try {
    await sendPushNotification({
      userIds: [proposerUserId],
      type: 'trade_declined',
      payload: {
        title: "Trade Declined",
        body: `${declinerName} declined your trade offer`,
        data: {
          type: 'trade_declined',
          screen: 'Trades'
        }
      }
    });
  } catch (error) {
    logger.error('Error sending trade declined notification:', error);
  }
}

/**
 * Notify about waiver claim processed
 */
export async function notifyWaiverProcessed(
  userId: number,
  playerName: string,
  success: boolean,
  reason?: string
): Promise<void> {
  try {
    const title = success ? "Waiver Claim Successful!" : "Waiver Claim Failed";
    const body = success
      ? `You claimed ${playerName}`
      : `Failed to claim ${playerName}${reason ? `: ${reason}` : ''}`;

    await sendPushNotification({
      userIds: [userId],
      type: 'waiver_processed',
      payload: {
        title,
        body,
        data: {
          type: 'waiver_processed',
          playerName,
          success: success.toString(),
          screen: 'Roster'
        }
      }
    });
  } catch (error) {
    logger.error('Error sending waiver processed notification:', error);
  }
}

/**
 * Notify about matchup result
 */
export async function notifyMatchupEnded(
  userId: number,
  opponentName: string,
  userScore: number,
  opponentScore: number,
  week: number
): Promise<void> {
  try {
    const won = userScore > opponentScore;
    const tied = userScore === opponentScore;

    let title: string;
    let body: string;

    if (tied) {
      title = "Matchup Tied";
      body = `Week ${week}: ${userScore.toFixed(2)} - ${opponentScore.toFixed(2)} vs ${opponentName}`;
    } else if (won) {
      title = "You Won!";
      body = `Week ${week}: ${userScore.toFixed(2)} - ${opponentScore.toFixed(2)} vs ${opponentName}`;
    } else {
      title = "Matchup Complete";
      body = `Week ${week}: ${userScore.toFixed(2)} - ${opponentScore.toFixed(2)} vs ${opponentName}`;
    }

    await sendPushNotification({
      userIds: [userId],
      type: 'matchup_ended',
      payload: {
        title,
        body,
        data: {
          type: 'matchup_ended',
          week: week.toString(),
          won: won.toString(),
          screen: 'Matchup'
        }
      }
    });
  } catch (error) {
    logger.error('Error sending matchup ended notification:', error);
  }
}

/**
 * Notify about player injury
 */
export async function notifyPlayerInjury(
  userId: number,
  playerName: string,
  injuryStatus: string,
  team: string
): Promise<void> {
  try {
    await sendPushNotification({
      userIds: [userId],
      type: 'player_injury',
      payload: {
        title: "Player Injury Update",
        body: `${playerName} (${team}): ${injuryStatus}`,
        data: {
          type: 'player_injury',
          playerName,
          injuryStatus,
          screen: 'Roster'
        }
      }
    });
  } catch (error) {
    logger.error('Error sending player injury notification:', error);
  }
}

/**
 * Notify about league invite
 */
export async function notifyLeagueInvite(
  userId: number,
  leagueName: string,
  inviterName: string,
  leagueId: number,
  inviteId: number
): Promise<void> {
  try {
    await sendPushNotification({
      userIds: [userId],
      type: 'league_invite',
      payload: {
        title: "League Invitation",
        body: `${inviterName} invited you to join ${leagueName}`,
        data: {
          type: 'league_invite',
          leagueId: leagueId.toString(),
          inviteId: inviteId.toString(),
          screen: 'LeagueInvite'
        }
      }
    });
  } catch (error) {
    logger.error('Error sending league invite notification:', error);
  }
}
