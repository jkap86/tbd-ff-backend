/**
 * DraftRepository Tests
 *
 * Tests for draft repository structure and interface
 */

import { DraftRepository } from '../../repositories/DraftRepository';

describe('DraftRepository', () => {
  let repository: DraftRepository;

  beforeEach(() => {
    repository = new DraftRepository();
  });

  describe('interface', () => {
    it('should have getByLeagueId method', () => {
      expect(typeof repository.getByLeagueId).toBe('function');
    });

    it('should have updateStatus method', () => {
      expect(typeof repository.updateStatus).toBe('function');
    });

    it('should have markAsStarted method', () => {
      expect(typeof repository.markAsStarted).toBe('function');
    });

    it('should have markAsCompleted method', () => {
      expect(typeof repository.markAsCompleted).toBe('function');
    });

    it('should have advancePick method', () => {
      expect(typeof repository.advancePick).toBe('function');
    });

    it('should have getScheduledDraftsToStart method', () => {
      expect(typeof repository.getScheduledDraftsToStart).toBe('function');
    });

    it('should have hasActiveDraft method', () => {
      expect(typeof repository.hasActiveDraft).toBe('function');
    });

    it('should have reset method', () => {
      expect(typeof repository.reset).toBe('function');
    });
  });

  describe('structure', () => {
    it('should be instance of DraftRepository', () => {
      expect(repository).toBeInstanceOf(DraftRepository);
    });

    it('should extend BaseRepository pattern', () => {
      expect(repository).toHaveProperty('findById');
      expect(repository).toHaveProperty('create');
      expect(repository).toHaveProperty('update');
      expect(repository).toHaveProperty('delete');
    });

    it('should have draft lifecycle methods', () => {
      expect(repository).toHaveProperty('markAsStarted');
      expect(repository).toHaveProperty('markAsCompleted');
      expect(repository).toHaveProperty('advancePick');
      expect(repository).toHaveProperty('reset');
    });

    it('should have draft query methods', () => {
      expect(repository).toHaveProperty('getByLeagueId');
      expect(repository).toHaveProperty('getScheduledDraftsToStart');
      expect(repository).toHaveProperty('hasActiveDraft');
    });
  });
});
