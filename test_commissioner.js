const pool = require('./dist/config/database').default;

(async () => {
  try {
    const result = await pool.query(`
      SELECT id, settings, settings->>'commissioner_id' as commissioner_id_str
      FROM leagues
      LIMIT 3
    `);
    console.log('Sample leagues:');
    result.rows.forEach(row => {
      console.log('ID:', row.id);
      console.log('Settings:', JSON.stringify(row.settings, null, 2));
      console.log('Commissioner ID (string):', row.commissioner_id_str);
      console.log('---');
    });
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
