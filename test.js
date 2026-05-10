const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://hirpha@localhost:5432/exam_incident_portal' });
pool.query('SELECT * FROM exam_periods').then(res => console.log(res.rows)).catch(console.error).finally(() => pool.end());
