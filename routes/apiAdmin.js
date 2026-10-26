const express = require('express');
const pool = require('../db');
const { requirePermission } = require('../middleware');
const { wrap } = require('../helpers');

const router = express.Router();

router.get('/users', requirePermission('user.manage'), wrap(async (req, res) => {
  const r = await pool.query('SELECT id, username, full_name FROM users ORDER BY id');
  res.json(r.rows);
}));

// เพิ่ม/ถอน Permission ของ Role   body: { role_id, permission_id, granted }
router.post('/acl', requirePermission('acl.manage'), wrap(async (req, res) => {
  const roleId = parseInt(req.body.role_id, 10);
  const permId = parseInt(req.body.permission_id, 10);
  const granted = req.body.granted === true;
  if (!Number.isInteger(roleId) || !Number.isInteger(permId)) {
    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
  }
  const role = (await pool.query('SELECT is_admin FROM roles WHERE id = $1', [roleId])).rows[0];
  const perm = (await pool.query('SELECT id FROM permissions WHERE id = $1', [permId])).rows[0];
  if (!role || !perm) return res.status(404).json({ error: 'ไม่พบ Role หรือ Permission' });
  if (role.is_admin) return res.status(400).json({ error: 'Role Admin ได้ทุกสิทธิ์อยู่แล้ว แก้ไม่ได้' });

  if (granted) {
    await pool.query(
      'INSERT INTO role_permissions(role_id, permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [roleId, permId]);
  } else {
    await pool.query('DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2', [roleId, permId]);
  }
  res.json({ ok: true });
}));

module.exports = router;