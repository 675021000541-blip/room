const express = require('express');
const pool = require('../db');
const { requirePermission } = require('../middleware');
const { esc, wrap } = require('../helpers');

const router = express.Router();

// ถ้า :id ไม่ใช่ตัวเลข ให้ตอบ 404 ทันที
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).send('ไม่พบหน้าที่ต้องการ');
  next();
});

// ฟอร์มเพิ่ม/แก้ไขห้อง
function roomForm(room, action, err = '') {
  room = room || {};
  return `${err ? `<p style="color:red">${esc(err)}</p>` : ''}
    <form method="post" action="${action}">
      <p>ชื่อห้อง: <input name="name" required maxlength="100" value="${esc(room.name)}"></p>
      <p>อาคาร/ที่ตั้ง: <input name="building" maxlength="100" value="${esc(room.building)}"></p>
      <p>ความจุ (คน): <input type="number" name="capacity" min="1" max="1000" required value="${esc(room.capacity)}"></p>
      <p>รายละเอียด: <input name="description" maxlength="500" value="${esc(room.description)}"></p>
      <p><label><input type="checkbox" name="is_active" ${room.is_active === false ? '' : 'checked'}> เปิดให้จอง</label></p>
      <button>บันทึก</button> <a href="/app/rooms">ยกเลิก</a>
    </form>`;
}

// ตรวจข้อมูลห้องฝั่ง Server
function readRoom(body) {
  const v = {
    name: String(body.name || '').trim(),
    building: String(body.building || '').slice(0, 100),
    capacity: parseInt(body.capacity, 10),
    description: String(body.description || '').slice(0, 500),
    is_active: body.is_active === 'on'
  };
  let err = '';
  if (!v.name || v.name.length > 100) err = 'กรุณาระบุชื่อห้อง (ไม่เกิน 100 ตัวอักษร)';
  else if (!Number.isInteger(v.capacity) || v.capacity < 1 || v.capacity > 1000) err = 'ความจุต้องเป็นตัวเลข 1-1000';
  return { v, err };
}

// ✅ รายการห้อง (ดึงข้อมูลแล้วส่งให้ views/rooms.ejs แสดงผลอย่างสวยงาม)
router.get('/rooms', requirePermission('room.read'), wrap(async (req, res) => {
  const manage = req.can('room.update') || req.can('room.delete');
  const r = await pool.query(`SELECT * FROM rooms ${manage ? '' : 'WHERE is_active'} ORDER BY id`);
  res.render('rooms', { rooms: r.rows });
}));

router.get('/rooms/new', requirePermission('room.create'), (req, res) => {
  res.send('<h2>เพิ่มห้อง</h2>' + roomForm(null, '/app/rooms'));
});

router.post('/rooms', requirePermission('room.create'), wrap(async (req, res) => {
  const { v, err } = readRoom(req.body);
  if (err) return res.status(400).send('<h2>เพิ่มห้อง</h2>' + roomForm(v, '/app/rooms', err));
  await pool.query(
    'INSERT INTO rooms(name, building, capacity, description, is_active) VALUES($1,$2,$3,$4,$5)',
    [v.name, v.building, v.capacity, v.description, v.is_active]);
  res.redirect('/app/rooms');
}));

router.get('/rooms/:id/edit', requirePermission('room.update'), wrap(async (req, res) => {
  const r = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
  if (!r.rows[0]) return res.status(404).send('ไม่พบห้อง');
  res.send('<h2>แก้ไขห้อง</h2>' + roomForm(r.rows[0], `/app/rooms/${r.rows[0].id}`));
}));

router.post('/rooms/:id', requirePermission('room.update'), wrap(async (req, res) => {
  const { v, err } = readRoom(req.body);
  if (err) return res.status(400).send('<h2>แก้ไขห้อง</h2>' + roomForm(v, `/app/rooms/${req.params.id}`, err));
  const u = await pool.query(
    'UPDATE rooms SET name=$1, building=$2, capacity=$3, description=$4, is_active=$5 WHERE id=$6',
    [v.name, v.building, v.capacity, v.description, v.is_active, req.params.id]);
  if (!u.rowCount) return res.status(404).send('ไม่พบห้อง');
  res.redirect('/app/rooms');
}));

router.post('/rooms/:id/delete', requirePermission('room.delete'), wrap(async (req, res) => {
  try {
    const d = await pool.query('DELETE FROM rooms WHERE id = $1', [req.params.id]);
    if (!d.rowCount) return res.status(404).send('ไม่พบห้อง');
    res.redirect('/app/rooms');
  } catch (e) {
    if (e.code === '23503' || e.code === '23001') {
      return res.status(409).send('ลบไม่ได้ เพราะมีการจองที่อ้างอิงห้องนี้ (ปิดการใช้งานห้องแทนได้) <a href="/app/rooms">กลับ</a>');
    }
    throw e;
  }
}));

// เจ้าหน้าที่ปรับสถานะเป็น "เสร็จสิ้น" (เฉพาะรายการที่อนุมัติแล้ว)
router.post('/bookings/:id/complete', requirePermission('booking.update_status'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await pool.query('SELECT status FROM bookings WHERE id = $1', [id]);
  if (!r.rows[0]) return res.status(404).send('ไม่พบรายการจอง');
  if (r.rows[0].status !== 'approved') {
    return res.status(409).send('เปลี่ยนสถานะได้เฉพาะรายการที่อนุมัติแล้ว <a href="/app/bookings">กลับ</a>');
  }
  await pool.query("UPDATE bookings SET status = 'completed' WHERE id = $1", [id]);
  res.redirect('/app/bookings');
}));

module.exports = router;