/**
 * Application Container Setup
 *
 * Registers all application services in the DI container.
 * This file should be imported early in the application lifecycle.
 */

import { Container } from './Container';
import { IContainer } from '../interfaces/IContainer';
import { logger } from '../config/logger';
import pool from '../config/database';
import { defaultDbClient, defaultLogger, defaultEmailService } from '../services/defaults';

// Create singleton container instance
const container: IContainer = new Container();

/**
 * Register Core Infrastructure Services
 */

// Database
container.registerInstance('database.pool', pool);
container.registerInstance('database.client', defaultDbClient);

// Logger
container.registerInstance('logger', defaultLogger);

// Email Service
container.registerInstance('emailService', defaultEmailService);

/**
 * Register Repositories (lazy loaded as singletons)
 */

// Roster Repository
container.registerSingleton('repository.roster', () => {
  const { rosterRepository } = require('../repositories/RosterRepository');
  return rosterRepository;
});

// Matchup Repository
container.registerSingleton('repository.matchup', () => {
  const { matchupRepository } = require('../repositories/MatchupRepository');
  return matchupRepository;
});

// Player Repository
container.registerSingleton('repository.player', () => {
  const { playerRepository } = require('../repositories/PlayerRepository');
  return playerRepository;
});

// Draft Repository
container.registerSingleton('repository.draft', () => {
  const { draftRepository } = require('../repositories/DraftRepository');
  return draftRepository;
});

// League Repository
container.registerSingleton('repository.league', () => {
  const { leagueRepository } = require('../repositories/LeagueRepository');
  return leagueRepository;
});

// User Repository
container.registerSingleton('repository.user', () => {
  const { userRepository } = require('../repositories/UserRepository');
  return userRepository;
});

// Trade Repository
container.registerSingleton('repository.trade', () => {
  const { tradeRepository } = require('../repositories/TradeRepository');
  return tradeRepository;
});

// Waiver Repository
container.registerSingleton('repository.waiver', () => {
  const { waiverRepository } = require('../repositories/WaiverRepository');
  return waiverRepository;
});

// Transaction Repository
container.registerSingleton('repository.transaction', () => {
  const { transactionRepository } = require('../repositories/TransactionRepository');
  return transactionRepository;
});

// Playoff Repository
container.registerSingleton('repository.playoff', () => {
  const { playoffRepository } = require('../repositories/PlayoffRepository');
  return playoffRepository;
});

// Notification Repository
container.registerSingleton('repository.notification', () => {
  const { notificationRepository } = require('../repositories/NotificationRepository');
  return notificationRepository;
});

// Stats Repository
container.registerSingleton('repository.stats', () => {
  const { statsRepository } = require('../repositories/StatsRepository');
  return statsRepository;
});

logger.info('DI Container initialized', {
  registeredServices: container.getRegisteredServices().length,
});

export { container };
export { Container } from './Container';
export { MockContainer } from './MockContainer';
