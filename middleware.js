const pool = require('./db');
const { logEvent } = require('./logger');

// โหลดผู้ใช้ + สิทธิ์จากฐานข้อมูลทุก request
async function attachUser(req, res, next) {
  try {
    req.user = null;
    req.perms = new Set();
    if (req.session.userId) {
      const r = await pool.query(
        `SELECT u.id, u.username, u.full_name, u.role_id, u.is_active,
                ro.name AS role_name, ro.is_admin
         FROM users u JOIN roles ro ON ro.id = u.role_id
         WHERE u.id = $1`, [req.session.userId]);
      const u = r.rows[0];
      if (u && u.is_active) {
        req.user = u;
        const p = await pool.query(
          `SELECT p.name FROM role_permissions rp
           JOIN permissions p ON p.id = rp.permission_id
           WHERE rp.role_id = $1`, [u.role_id]);
        p.rows.forEach(x => req.perms.add(x.name));
      }
    }
    // Admin ผ่านทุกสิทธิ์ รวมสิทธิ์ที่เพิ่มภายหลัง
    req.can = name => !!req.user && (req.user.is_admin || req.perms.has(name));

    // ให้ไฟล์ .ejs ใช้ตัวแปร user และฟังก์ชัน can(...) ได้
    res.locals.user = req.user;
    res.locals.can = req.can;
    next();
  } catch (err) {
    next(err);
  }
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'ยังไม่ได้เข้าสู่ระบบ' });
  }
  res.redirect('/login');
}

function requirePermission(...names) {
  return async (req, res, next) => {
    if (names.some(n => req.can(n))) return next();
    // จดการเข้าถึงที่ถูกปฏิเสธ
    await logEvent(req, {
      event: 'ACCESS_DENIED',
      resource: req.method + ' ' + req.originalUrl.split('?')[0],
      result: 'denied',
      detail: 'ต้องมีสิทธิ์: ' + names.join(' หรือ ')
    });
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ใช้งาน' });
    }
    res.status(403).send('คุณไม่มีสิทธิ์ใช้งานส่วนนี้ (403) <a href="/app">กลับ</a>');
  };
}

module.exports = { attachUser, requireLogin, requirePermission };