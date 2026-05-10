const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://hirpha@localhost:5432/exam_incident_portal' });
pool.query('SELECT status, priority, created_at, resolved_at FROM incidents').then(res => console.log(res.rows)).catch(console.error).finally(() => pool.end());
