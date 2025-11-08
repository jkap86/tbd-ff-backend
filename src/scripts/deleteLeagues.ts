import pool from '../config/database';

async function deleteLeagues() {
  try {
    const result = await pool.query(
      'DELETE FROM leagues WHERE id IN (50, 51) RETURNING id, name'
    );

    console.log('Deleted leagues:', result.rows);
    console.log(`Successfully deleted ${result.rowCount} league(s)`);

    process.exit(0);
  } catch (error) {
    console.error('Error deleting leagues:', error);
    process.exit(1);
  }
}

deleteLeagues();
