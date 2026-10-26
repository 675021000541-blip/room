const bcrypt = require('bcryptjs');
const pool = require('./db');

const users = [
  ['admin',    'ผู้ดูแลระบบ',        'Admin@1234',   'admin'],
  ['manager1', 'สมชาย ผู้จัดการ',    'Manager@1234', 'manager'],
  ['staff1',   'สมหญิง เจ้าหน้าที่', 'Staff@1234',   'staff'],
  ['user1',    'สมศักดิ์ ผู้ใช้',     'User@1234',    'user'],
];

(async () => {
  for (const [username, fullName, password, roleName] of users) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users(username, full_name, password_hash, role_id)
       SELECT $1, $2, $3, id FROM roles WHERE name = $4
       ON CONFLICT (username) DO NOTHING`,
      [username, fullName, hash, roleName]
    );
  }
  console.log('สร้างผู้ใช้เรียบร้อย');
  await pool.end();
})();