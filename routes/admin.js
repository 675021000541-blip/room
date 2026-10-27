const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requirePermission } = require('../middleware');
const { esc, wrap } = require('../helpers');
const { queryLogs } = require('../logger');

const router = express.Router();
const msg = (res, status, text, to) => res.status(status).send(`${esc(text)} <a href="${to}">กลับ</a>`);


router.get('/', requirePermission('user.manage', 'role.manage', 'permission.manage', 'acl.manage', 'log.read'), (req, res) => {
  res.render('admin_index');
});

async function noOtherAdmin(userId) {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.is_admin AND u.is_active AND u.id <> $1`, [userId]);
  return r.rows[0].n === 0;
}

router.get('/users', requirePermission('user.manage'), wrap(async (req, res) => {
  const users = (await pool.query(
    'SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id')).rows;
  const roles = (await pool.query('SELECT id, name FROM roles ORDER BY id')).rows;
  const opts = sel => roles.map(x =>
    `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const rows = users.map(u => `<tr>
    <td>${esc(u.username)}</td><td>${esc(u.full_name)}</td>
    <td>
      <form method="post" action="/admin/users/${u.id}">
        <select name="role_id">${opts(u.role_id)}</select>
        <label><input type="checkbox" name="is_active" ${u.is_active ? 'checked' : ''}> ใช้งาน</label>
        <input type="password" name="password" placeholder="รหัสผ่านใหม่ (ถ้าเปลี่ยน)" minlength="8">
        <button>บันทึก</button>
      </form>
      <form method="post" action="/admin/users/${u.id}/delete" onsubmit="return confirm('ลบผู้ใช้?')">
        <button>ลบ</button>
      </form>
    </td></tr>`).join('');
  res.send(`<h2>จัดการผู้ใช้</h2>
    <form method="post" action="/admin/users">
      <b>เพิ่มผู้ใช้</b>
      <p>ชื่อผู้ใช้: <input name="username" required pattern="[A-Za-z0-9_.\\-]{3,50}"></p>
      <p>ชื่อ-สกุล: <input name="full_name" required maxlength="100"></p>
      <p>รหัสผ่าน: <input type="password" name="password" required minlength="8"></p>
      <p>Role: <select name="role_id">${opts(0)}</select></p>
      <button>เพิ่ม</button>
    </form>
    <table border="1" cellpadding="6"><tr><th>Username</th><th>ชื่อ</th><th>Role / สถานะ / รหัสผ่าน</th></tr>${rows}</table>
    <p><a href="/admin">กลับ</a></p>`);
}));

router.post('/users', requirePermission('user.manage'), wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const fullName = String(req.body.full_name || '').trim();
  const password = String(req.body.password || '');
  const roleId = parseInt(req.body.role_id, 10);
  if (!/^[A-Za-z0-9_.\-]{3,50}$/.test(username) || !fullName || fullName.length > 100 || password.length < 8) {
    return msg(res, 400, 'ข้อมูลไม่ถูกต้อง (ชื่อผู้ใช้ 3-50 ตัวอักษรอังกฤษ/ตัวเลข, รหัสผ่านอย่างน้อย 8 ตัว)', '/admin/users');
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users(username, full_name, password_hash, role_id) VALUES($1,$2,$3,$4)',
      [username, fullName, hash, roleId]);
    res.redirect('/admin/users');
  } catch (e) {
    if (e.code === '23505') return msg(res, 409, 'ชื่อผู้ใช้นี้มีอยู่แล้ว', '/admin/users');
    if (e.code === '23503') return msg(res, 400, 'ไม่พบ Role ที่เลือก', '/admin/users');
    throw e;
  }
}));

router.post('/users/:id/', requirePermission('user.manage'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const active = req.body.is_active === 'on';
  const t = (await pool.query(
    'SELECT u.is_active, r.is_admin FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1', [id])).rows[0];
  const nr = (await pool.query('SELECT id, is_admin FROM roles WHERE id = $1', [parseInt(req.body.role_id, 10)])).rows[0];
  if (!t || !nr) return msg(res, 404, 'ไม่พบผู้ใช้หรือ Role', '/admin/users');
  if (t.is_admin && t.is_active && !(nr.is_admin && active) && await noOtherAdmin(id)) {
    return msg(res, 400, 'ทำไม่ได้ เพราะจะไม่มี Admin ที่ใช้งานได้เหลืออยู่', '/admin/users');
  }
  const password = String(req.body.password || '');
  if (password && password.length < 8) return msg(res, 400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว', '/admin/users');
  await pool.query('UPDATE users SET role_id = $1, is_active = $2 WHERE id = $3', [nr.id, active, id]);
  if (password) {
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(password, 10), id]);
  }
  res.redirect('/admin/users');
}));

router.get('/users/:id/delete', requirePermission('user.manage'), (req, res) => {
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', requirePermission('user.manage'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) return msg(res, 400, 'ลบบัญชีของตนเองไม่ได้', '/admin/users');
  const t = (await pool.query(
    'SELECT u.is_active, r.is_admin FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1', [id])).rows[0];
  if (!t) return msg(res, 404, 'ไม่พบผู้ใช้', '/admin/users');
  if (t.is_admin && t.is_active && await noOtherAdmin(id)) {
    return msg(res, 400, 'ลบไม่ได้ เพราะจะไม่มี Admin เหลืออยู่', '/admin/users');
  }
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.redirect('/admin/users');
  }  catch (e) {
    if (e.code === '23503' || e.code === '23001') return msg(res, 409, 'ลบไม่ได้ เนื่องจากผู้ใช้นี้มีประวัติข้อมูลการจองหรือไฟล์เชื่อมโยงในระบบ (ปิดการใช้งานบัญชีแทนได้)', '/admin/users');
    throw e;
  }
}));

router.get('/roles', requirePermission('role.manage'), wrap(async (req, res) => {
  const roles = (await pool.query(
    `SELECT r.*, (SELECT count(*) FROM users u WHERE u.role_id = r.id)::int AS n
     FROM roles r ORDER BY r.id`)).rows;
  const rows = roles.map(x => `<tr><td>
    <form method="post" action="/admin/roles/${x.id}">
      <input name="name" value="${esc(x.name)}" required maxlength="50">
      <input name="description" value="${esc(x.description)}" maxlength="200">
      <button>บันทึก</button>
    </form>
    ผู้ใช้ ${x.n} คน ${x.is_admin ? '(Role Admin ลบไม่ได้)' : ''}
    ${x.is_admin ? '' : `<form method="post" action="/admin/roles/${x.id}/delete" onsubmit="return confirm('ลบ Role?')"><button>ลบ</button></form>`}
    </td></tr>`).join('');
  res.send(`<h2>จัดการ Role</h2>
    <form method="post" action="/admin/roles">
      <b>เพิ่ม Role</b>
      <p>ชื่อ: <input name="name" required maxlength="50"></p>
      <p>คำอธิบาย: <input name="description" maxlength="200"></p>
      <button>เพิ่ม</button>
    </form>
    <p>Role ใหม่จะยังไม่มีสิทธิ์ใดๆ จนกว่าจะกำหนดในหน้า ACL</p>
    <table border="1" cellpadding="6">${rows}</table><p><a href="/admin">กลับ</a></p>`);
}));

router.post('/roles', requirePermission('role.manage'), wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name || name.length > 50) return msg(res, 400, 'ชื่อ Role ไม่ถูกต้อง', '/admin/roles');
  try {
    await pool.query('INSERT INTO roles(name, description) VALUES($1,$2)',
      [name, String(req.body.description || '').slice(0, 200)]);
    res.redirect('/admin/roles');
  } catch (e) {
    if (e.code === '23505') return msg(res, 409, 'ชื่อ Role นี้มีอยู่แล้ว', '/admin/roles');
    throw e;
  }
}));

router.post('/roles/:id/', requirePermission('role.manage'), wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name || name.length > 50) return msg(res, 400, 'ชื่อ Role ไม่ถูกต้อง', '/admin/roles');
  try {
    await pool.query('UPDATE roles SET name = $1, description = $2 WHERE id = $3',
      [name, String(req.body.description || '').slice(0, 200), parseInt(req.params.id, 10)]);
    res.redirect('/admin/roles');
  } catch (e) {
    if (e.code === '23505') return msg(res, 409, 'ชื่อ Role นี้มีอยู่แล้ว', '/admin/roles');
    throw e;
  }
}));

router.post('/roles/:id/delete', requirePermission('role.manage'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const t = (await pool.query(
    'SELECT is_admin, (SELECT count(*) FROM users WHERE role_id = roles.id)::int AS n FROM roles WHERE id = $1', [id])).rows[0];
  if (!t) return msg(res, 404, 'ไม่พบ Role', '/admin/roles');
  if (t.is_admin) return msg(res, 400, 'ลบ Role Admin ไม่ได้', '/admin/roles');
  if (t.n > 0) return msg(res, 409, `ลบไม่ได้ เพราะยังมีผู้ใช้ ${t.n} คนใช้ Role นี้อยู่`, '/admin/roles');
  await pool.query('DELETE FROM roles WHERE id = $1', [id]);
  res.redirect('/admin/roles');
}));

const PERM_RE = /^[a-z_]+(\.[a-z_]+)+$/;   // รูปแบบ resource.action

router.get('/permissions', requirePermission('permission.manage'), wrap(async (req, res) => {
  const ps = (await pool.query('SELECT * FROM permissions ORDER BY name')).rows;
  const rows = ps.map(p => `<tr><td>
    <form method="post" action="/admin/permissions/${p.id}">
      <input name="name" value="${esc(p.name)}" required maxlength="100">
      <input name="description" value="${esc(p.description)}" maxlength="200">
      <button>บันทึก</button>
    </form>
    <form method="post" action="/admin/permissions/${p.id}/delete" onsubmit="return confirm('ลบ Permission? สิทธิ์ที่กำหนดไว้จะถูกถอนทั้งหมด')">
      <button>ลบ</button>
    </form></td></tr>`).join('');
  res.send(`<h2>จัดการ Permission</h2>
    <form method="post" action="/admin/permissions">
      <b>เพิ่ม Permission</b>
      <p>ชื่อ (รูปแบบ resource.action เช่น booking.export): <input name="name" required maxlength="100"></p>
      <p>คำอธิบาย: <input name="description" maxlength="200"></p>
      <button>เพิ่ม</button>
    </form>
    <p>Permission จะป้องกันของจริงได้ก็ต่อเมื่อมี route ในโค้ดที่ตรวจชื่อนี้</p>
    <table border="1" cellpadding="6">${rows}</table><p><a href="/admin">กลับ</a></p>`);
}));

router.post('/permissions', requirePermission('permission.manage'), wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!PERM_RE.test(name) || name.length > 100) {
    return msg(res, 400, 'ชื่อต้องอยู่ในรูปแบบ resource.action (ตัวอักษร a-z และ _ เท่านั้น)', '/admin/permissions');
  }
  try {
    await pool.query('INSERT INTO permissions(name, description) VALUES($1,$2)',
      [name, String(req.body.description || '').slice(0, 200)]);
    res.redirect('/admin/permissions');
  } catch (e) {
    if (e.code === '23505') return msg(res, 409, 'มี Permission นี้อยู่แล้ว', '/admin/permissions');
    throw e;
  }
}));

router.post('/permissions/:id/', requirePermission('permission.manage'), wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!PERM_RE.test(name)) return msg(res, 400, 'ชื่อ Permission ไม่ถูกต้อง', '/admin/permissions');
  try {
    await pool.query('UPDATE permissions SET name = $1, description = $2 WHERE id = $3',
      [name, String(req.body.description || '').slice(0, 200), parseInt(req.params.id, 10)]);
    res.redirect('/admin/permissions');
  } catch (e) {
    if (e.code === '23505') return msg(res, 409, 'มี Permission ชื่อนี้อยู่แล้ว', '/admin/permissions');
    throw e;
  }
}));

router.post('/permissions/:id/delete', requirePermission('permission.manage'), wrap(async (req, res) => {
  await pool.query('DELETE FROM permissions WHERE id = $1', [parseInt(req.params.id, 10)]);
  res.redirect('/admin/permissions');
}));

router.get('/acl', requirePermission('acl.manage'), wrap(async (req, res) => {
  const roles = (await pool.query('SELECT * FROM roles ORDER BY id')).rows;
  const perms = (await pool.query('SELECT * FROM permissions ORDER BY name')).rows;
  const granted = new Set((await pool.query('SELECT role_id, permission_id FROM role_permissions'))
    .rows.map(x => x.role_id + ':' + x.permission_id));

  const head = roles.map(x => `<th>${esc(x.name)}</th>`).join('');
  const body = perms.map(p => `<tr><td>${esc(p.name)}<br><small>${esc(p.description)}</small></td>
    ${roles.map(r => r.is_admin
      ? '<td align="center"><input type="checkbox" checked disabled></td>'
      : `<td align="center"><input type="checkbox" data-role="${r.id}" data-perm="${p.id}"
           ${granted.has(r.id + ':' + p.id) ? 'checked' : ''}></td>`).join('')}</tr>`).join('');

  res.send(`<h2>กำหนดสิทธิ์ (ACL): Role × Permission</h2>
    <p>ติ๊กหรือยกเลิก แล้วบันทึกทันที มีผลกับคำขอถัดไปโดยไม่ต้อง restart (Admin ได้ทุกสิทธิ์ แก้ไม่ได้)</p>
    <table border="1" cellpadding="6"><tr><th>Permission</th>${head}</tr>${body}</table>
    <p id="msg"></p><p><a href="/admin">กลับ</a></p>
    <script>
      document.querySelectorAll('input[data-role]').forEach(cb => {
        cb.addEventListener('change', async () => {
          const res = await fetch('/api/admin/acl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_id: +cb.dataset.role, permission_id: +cb.dataset.perm, granted: cb.checked })
          });
          const m = document.getElementById('msg');
          if (res.ok) { m.textContent = 'บันทึกแล้ว'; }
          else { cb.checked = !cb.checked; m.textContent = 'บันทึกไม่สำเร็จ: ' + (await res.json()).error; }
        });
      });
    </script>`);
}));

router.get('/logs', requirePermission('log.read'), wrap(async (req, res) => {
  const f = {
    from: req.query.from, to: req.query.to,
    user: String(req.query.user || '').slice(0, 50),
    event: req.query.event, result: req.query.result, page: req.query.page
  };
  const { rows, page } = await queryLogs(f);
  const events = (await pool.query('SELECT DISTINCT event_type FROM audit_logs ORDER BY 1')).rows;
  const eventOpts = events.map(e =>
    `<option ${e.event_type === f.event ? 'selected' : ''}>${esc(e.event_type)}</option>`).join('');
  const resultOpts = ['success', 'denied', 'fail'].map(x =>
    `<option ${x === f.result ? 'selected' : ''}>${x}</option>`).join('');

  const tr = rows.map(l => `<tr>
    <td>${new Date(l.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</td>
    <td>${esc(l.username || l.username_attempt || '-')}</td>
    <td>${esc(l.event_type)}</td>
    <td>${esc(l.resource)} ${l.resource_id ? '#' + esc(l.resource_id) : ''}</td>
    <td>${esc(l.result)}</td><td>${esc(l.ip)}</td><td>${esc(l.detail)}</td></tr>`).join('');

  const q = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== 'page')).toString();
  res.send(`<h2>บันทึกการใช้งาน (Log)</h2>
    <form method="get">
      ตั้งแต่ <input type="date" name="from" value="${esc(f.from)}">
      ถึง <input type="date" name="to" value="${esc(f.to)}">
      ผู้ใช้ <input name="user" value="${esc(f.user)}" size="10">
      เหตุการณ์ <select name="event"><option value="">ทั้งหมด</option>${eventOpts}</select>
      ผล <select name="result"><option value="">ทั้งหมด</option>${resultOpts}</select>
      <button>ค้นหา</button> <a href="/admin/logs">ล้าง</a>
    </form>
    <table border="1" cellpadding="6">
      <tr><th>วันเวลา</th><th>ผู้ใช้</th><th>เหตุการณ์</th><th>รายการ</th><th>ผล</th><th>IP</th><th>รายละเอียด</th></tr>
      ${tr || '<tr><td colspan="7">ไม่พบข้อมูล</td></tr>'}
    </table>
    ${page > 1 ? `<a href="?${q}&page=${page - 1}">&larr; ก่อนหน้า</a>` : ''}
    ${rows.length === 100 ? `<a href="?${q}&page=${page + 1}">ถัดไป &rarr;</a>` : ''}
    <p><a href="/admin">กลับ</a></p>`);
}));

module.exports = router;