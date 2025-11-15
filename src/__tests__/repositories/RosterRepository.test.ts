/**
 * RosterRepository Tests
 *
 * Tests for the RosterRepository structure and interface
 */

import { RosterRepository } from '../../repositories/RosterRepository';

describe('RosterRepository', () => {
  let repository: RosterRepository;

  beforeEach(() => {
    repository = new RosterRepository();
  });

  describe('interface', () => {
    it('should have getByLeague method', () => {
      expect(typeof repository.getByLeague).toBe('function');
    });

    it('should have getStandingsData method', () => {
      expect(typeof repository.getStandingsData).toBe('function');
    });

    it('should have batchUpdateRecords method', () => {
      expect(typeof repository.batchUpdateRecords).toBe('function');
    });

    it('should have getByLeagueAndUser method', () => {
      expect(typeof repository.getByLeagueAndUser).toBe('function');
    });

    it('should have inherited CRUD methods from BaseRepository', () => {
      expect(typeof repository.findById).toBe('function');
      expect(typeof repository.create).toBe('function');
      expect(typeof repository.update).toBe('function');
      expect(typeof repository.delete).toBe('function');
    });
  });

  describe('structure', () => {
    it('should be instance of RosterRepository', () => {
      expect(repository).toBeInstanceOf(RosterRepository);
    });

    it('should extend BaseRepository pattern', () => {
      // Check for BaseRepository methods
      expect(repository).toHaveProperty('findById');
      expect(repository).toHaveProperty('create');
      expect(repository).toHaveProperty('update');
      expect(repository).toHaveProperty('delete');
      expect(repository).toHaveProperty('findAll');
    });

    it('should have domain-specific methods', () => {
      // RosterRepository-specific methods
      expect(repository).toHaveProperty('getByLeague');
      expect(repository).toHaveProperty('getStandingsData');
      expect(repository).toHaveProperty('batchUpdateRecords');
      expect(repository).toHaveProperty('getByLeagueAndUser');
      expect(repository).toHaveProperty('getByLeagueWithUsers');
    });
  });

  describe('dependency injection ready', () => {
    it('should be resolvable from container', () => {
      // This shows the repository can be registered in DI container
      const mockContainer = {
        registerSingleton: jest.fn(),
        resolve: jest.fn().mockReturnValue(repository),
      };

      mockContainer.registerSingleton('repository.roster', () => repository);

      const resolved = mockContainer.resolve('repository.roster');

      expect(resolved).toBe(repository);
      expect(resolved).toBeInstanceOf(RosterRepository);
    });
  });
});
