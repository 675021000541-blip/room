const pool = require('./db');

async function logEvent(req, { event, resource = null, resourceId = null, result = 'success', detail = null, userId, usernameAttempt = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs(user_id, username_attempt, event_type, resource, resource_id, result, ip, detail)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId !== undefined ? userId : (req.user ? req.user.id : null), usernameAttempt, event,
       resource ? String(resource).slice(0, 200) : null, resourceId, result, req.ip,
       detail ? String(detail).slice(0, 500) : null]);
  } catch (err) {
    console.error('บันทึก Log ไม่สำเร็จ:', err.message);
  }
}

const EVENTS = [
  ['POST', /^\/admin\/users$/, 'USER_CREATE'],
  ['POST', /^\/admin\/users\/\d+$/, 'USER_UPDATE'],
  ['POST', /^\/admin\/users\/\d+\/delete$/, 'USER_DELETE'],
  ['POST', /^\/admin\/roles$/, 'ROLE_CREATE'],
  ['POST', /^\/admin\/roles\/\d+$/, 'ROLE_UPDATE'],
  ['POST', /^\/admin\/roles\/\d+\/delete$/, 'ROLE_DELETE'],
  ['POST', /^\/admin\/permissions$/, 'PERMISSION_CREATE'],
  ['POST', /^\/admin\/permissions\/\d+$/, 'PERMISSION_UPDATE'],
  ['POST', /^\/admin\/permissions\/\d+\/delete$/, 'PERMISSION_DELETE'],
  ['POST', /^\/api\/admin\/acl$/, 'ACL_CHANGE'],
  ['POST', /^\/app\/bookings$/, 'BOOKING_CREATE'],
  ['POST', /^\/app\/bookings\/\d+\/review$/, 'BOOKING_REVIEW'],
  ['POST', /^\/app\/bookings\/\d+\/cancel$/, 'BOOKING_CANCEL'],
  ['POST', /^\/app\/rooms$/, 'ROOM_CREATE'],
  ['POST', /^\/app\/rooms\/\d+$/, 'ROOM_UPDATE'],
  ['POST', /^\/app\/rooms\/\d+\/delete$/, 'ROOM_DELETE'],
  ['POST', /^\/app\/bookings\/\d+\/complete$/, 'BOOKING_COMPLETE'],
  ['GET', /^\/app\/bookings\/export\.csv$/, 'BOOKING_EXPORT'],
];

function activityLogger(req, res, next) {
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    console.log('FINISH', req.method, path, res.statusCode);
    const hit = EVENTS.find(([m, re]) => m === req.method && re.test(path));
    if (!hit || res.statusCode === 401 || res.statusCode === 403) return;
    const id = (path.match(/\/(\d+)(\/|$)/) || [])[1] || null;
    let detail = 'HTTP ' + res.statusCode;
    if (hit[2] === 'ACL_CHANGE') {
      detail += ` role_id=${Number(req.body.role_id)} permission_id=${Number(req.body.permission_id)} granted=${req.body.granted === true}`;
    }
    logEvent(req, { event: hit[2], resource: path, resourceId: id, result: res.statusCode < 400 ? 'success' : 'fail', detail });
  });
  next();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
async function queryLogs(f) {
  const where = [], p = [];
  if (DATE_RE.test(f.from || '')) { p.push(f.from); where.push(`l.created_at >= $${p.length}::date`); }
  if (DATE_RE.test(f.to || '')) { p.push(f.to); where.push(`l.created_at < ($${p.length}::date + 1)`); }
  if (f.user) { p.push('%' + f.user + '%'); where.push(`(u.username ILIKE $${p.length} OR l.username_attempt ILIKE $${p.length})`); }
  if (f.event) { p.push(f.event); where.push(`l.event_type = $${p.length}`); }
  if (f.result) { p.push(f.result); where.push(`l.result = $${p.length}`); }
  const page = Math.max(parseInt(f.page, 10) || 1, 1);
  p.push((page - 1) * 100);
  const r = await pool.query(
    `SELECT l.*, u.username FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY l.id DESC LIMIT 100 OFFSET $${p.length}`, p);
  return { rows: r.rows, page };
}

module.exports = { logEvent, activityLogger, queryLogs };