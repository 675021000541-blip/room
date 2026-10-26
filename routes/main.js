const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db');
const { requirePermission } = require('../middleware');
const { esc, wrap } = require('../helpers');
const { logEvent } = require('../logger');

const router = express.Router();

// ---------- ตั้งค่าอัปโหลดไฟล์ ----------
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

// ชนิดไฟล์ที่อนุญาต (ตรวจจาก Magic Bytes)
const TYPES = [
  { mime: 'image/jpeg', ext: '.jpg', sig: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png', ext: '.png', sig: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'application/pdf', ext: '.pdf', sig: [0x25, 0x50, 0x44, 0x46] }
];
const detectType = buf => TYPES.find(t => t.sig.every((b, i) => buf[i] === b));

async function denyOwner(req, res, detail) {
  await logEvent(req, {
    event: 'ACCESS_DENIED', result: 'denied',
    resource: req.method + ' ' + req.originalUrl.split('?')[0], detail
  });
  res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงรายการนี้ (403) <a href="/app">กลับ</a>');
}

// ---------- 1. หน้าหลัก ----------
router.get('/', (req, res) => {
  res.render('home');
});

// ---------- 2. ฟอร์มจองห้อง ----------
router.get('/bookings/new', requirePermission('booking.create'), wrap(async (req, res) => {
  const r = await pool.query('SELECT id, name, capacity FROM rooms WHERE is_active ORDER BY id');
  res.render('booking_new', { rooms: r.rows });
}));

// ---------- 3. บันทึกคำขอจอง ----------
router.post('/bookings', requirePermission('booking.create'), wrap(async (req, res) => {
  const roomId = parseInt(req.body.room_id, 10);
  const purpose = String(req.body.purpose || '').trim();
  const start = new Date(req.body.start);
  const end = new Date(req.body.end);

  const room = await pool.query('SELECT id FROM rooms WHERE id = $1 AND is_active', [roomId]);
  let err = '';
  if (!room.rows[0]) err = 'ไม่พบห้อง';
  else if (!purpose || purpose.length > 500) err = 'กรุณาระบุวัตถุประสงค์ (ไม่เกิน 500 ตัวอักษร)';
  else if (isNaN(start) || isNaN(end)) err = 'วันเวลาไม่ถูกต้อง';
  else if (end <= start) err = 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม';
  else if (start < new Date()) err = 'ต้องจองล่วงหน้า';
  
  if (err) return res.status(400).send(`${esc(err)} <a href="/app/bookings/new">กลับ</a>`);

  await pool.query(
    `INSERT INTO bookings(room_id, user_id, purpose, start_time, end_time)
     VALUES($1,$2,$3,$4,$5)`, [roomId, req.user.id, purpose, start, end]);
  
  res.redirect('/app/bookings');
}));

// ---------- 4. รายการจอง ----------
router.get('/bookings', requirePermission('booking.read.own', 'booking.read.all'), wrap(async (req, res) => {
  const all = req.can('booking.read.all');
  const r = await pool.query(
    `SELECT b.*, rm.name AS room_name, u.full_name AS requester
     FROM bookings b JOIN rooms rm ON rm.id = b.room_id JOIN users u ON u.id = b.user_id
     ${all ? '' : 'WHERE b.user_id = $1'} ORDER BY b.created_at DESC`,
    all ? [] : [req.user.id]);

  const files = r.rows.length
    ? (await pool.query(
        'SELECT id, booking_id, original_name, size_bytes FROM booking_files WHERE booking_id = ANY($1) ORDER BY id',
        [r.rows.map(b => b.id)])).rows
    : [];

  res.render('bookings', { bookings: r.rows, files, all });
}));

// ---------- 5. อนุมัติ / ปฏิเสธ ----------
router.post('/bookings/:id/review', requirePermission('booking.approve'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const decision = req.body.decision;
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).send('ข้อมูลไม่ถูกต้อง');

  const r = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
  const b = r.rows[0];
  if (!b) return res.status(404).send('ไม่พบรายการจอง');
  if (b.status !== 'pending') return res.status(409).send('รายการนี้ถูกพิจารณาแล้ว <a href="/app/bookings">กลับ</a>');

  if (decision === 'approved') {
    const o = await pool.query(
      `SELECT 1 FROM bookings WHERE room_id = $1 AND status = 'approved' AND id <> $2
       AND start_time < $4 AND end_time > $3 LIMIT 1`,
      [b.room_id, b.id, b.start_time, b.end_time]);
    if (o.rows[0]) return res.status(409).send('ช่วงเวลานี้มีการจองที่อนุมัติแล้วทับกัน <a href="/app/bookings">กลับ</a>');
  }
  await pool.query(
    'UPDATE bookings SET status = $1, reviewed_by = $2, review_note = $3 WHERE id = $4',
    [decision, req.user.id, String(req.body.note || '').slice(0, 200) || null, id]);
  res.redirect('/app/bookings');
}));

// ---------- 6. ยกเลิกการจอง ----------
router.post('/bookings/:id/cancel', requirePermission('booking.cancel.own'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
  const b = r.rows[0];
  if (!b) return res.status(404).send('ไม่พบรายการจอง');
  if (b.user_id !== req.user.id) return denyOwner(req, res, 'ยกเลิกการจองของผู้อื่น #' + id);
  if (!['pending', 'approved'].includes(b.status)) return res.status(409).send('ยกเลิกรายการนี้ไม่ได้');
  await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [id]);
  res.redirect('/app/bookings');
}));

// ---------- 7. ส่งออก CSV ----------
router.get('/bookings/export.csv', requirePermission('booking.export'), wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT b.id, rm.name AS room, u.username, b.start_time, b.end_time, b.status
     FROM bookings b JOIN rooms rm ON rm.id = b.room_id JOIN users u ON u.id = b.user_id ORDER BY b.id`);
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [['id', 'room', 'user', 'start', 'end', 'status'].join(',')].concat(
    r.rows.map(x => [x.id, x.room, x.username, x.start_time.toISOString(), x.end_time.toISOString(), x.status].map(q).join(',')));
  res.type('text/csv').attachment('bookings.csv').send('\uFEFF' + lines.join('\r\n'));
}));

// ---------- 8. อัปโหลดไฟล์แนบ ----------
router.post('/bookings/:id/files',
  requirePermission('file.upload'),
  wrap(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    const b = (await pool.query('SELECT * FROM bookings WHERE id = $1', [id])).rows[0];
    if (!b) return res.status(404).send('ไม่พบรายการจอง');
    if (b.user_id !== req.user.id && !req.can('booking.read.all')) {
      return denyOwner(req, res, 'อัปโหลดไฟล์ให้รายการของผู้อื่น #' + id);
    }
    req.booking = b;
    next();
  }),
  (req, res, next) => {
    upload.single('file')(req, res, async err => {
      if (!err) return next();
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      await logEvent(req, {
        event: 'FILE_UPLOAD', result: 'fail', resource: 'bookings', resourceId: req.params.id,
        detail: tooBig ? 'ไฟล์เกินขนาด' : 'อัปโหลดล้มเหลว'
      });
      res.status(tooBig ? 413 : 400)
        .send((tooBig ? 'ไฟล์ใหญ่เกิน 2 MB' : 'อัปโหลดไม่สำเร็จ') + ' <a href="/app/bookings">กลับ</a>');
    });
  },
  wrap(async (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).send('กรุณาเลือกไฟล์ <a href="/app/bookings">กลับ</a>');
    const type = detectType(f.buffer);
    if (!type) {
      await logEvent(req, {
        event: 'FILE_UPLOAD', result: 'fail', resource: 'bookings', resourceId: req.booking.id,
        detail: 'ชนิดไฟล์ไม่อนุญาต'
      });
      return res.status(415).send('อนุญาตเฉพาะไฟล์ JPG, PNG หรือ PDF เท่านั้น <a href="/app/bookings">กลับ</a>');
    }
    const stored = crypto.randomUUID() + type.ext;
    await fs.promises.writeFile(path.join(UPLOAD_DIR, stored), f.buffer);
    const original = path.basename(String(f.originalname || 'file'))
      .replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').slice(0, 150);
    const r = await pool.query(
      `INSERT INTO booking_files(booking_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [req.booking.id, original, stored, type.mime, f.size, req.user.id]);
    await logEvent(req, {
      event: 'FILE_UPLOAD', resource: 'booking_files', resourceId: r.rows[0].id,
      detail: `booking #${req.booking.id} ${original}`
    });
    res.redirect('/app/bookings');
  })
);

// ---------- 9. ดาวน์โหลดไฟล์ ----------
router.get('/files/:id', requirePermission('file.read'), wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT f.*, b.user_id AS owner_id FROM booking_files f
     JOIN bookings b ON b.id = f.booking_id WHERE f.id = $1`, [parseInt(req.params.id, 10)]);
  const f = r.rows[0];
  if (!f) return res.status(404).send('ไม่พบไฟล์');
  if (f.owner_id !== req.user.id && !req.can('booking.read.all')) {
    return denyOwner(req, res, 'เข้าถึงไฟล์ #' + f.id + ' ของผู้อื่น');
  }
  await logEvent(req, { event: 'FILE_DOWNLOAD', resource: 'booking_files', resourceId: f.id, detail: f.original_name });
  res.sendFile(path.join(UPLOAD_DIR, f.stored_name), {
    headers: {
      'Content-Type': f.mime_type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`
    }
  });
}));

// ---------- 10. ลบไฟล์ ----------
router.post('/files/:id/delete', requirePermission('file.delete'), wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT f.*, b.user_id AS owner_id FROM booking_files f
     JOIN bookings b ON b.id = f.booking_id WHERE f.id = $1`, [parseInt(req.params.id, 10)]);
  const f = r.rows[0];
  if (!f) return res.status(404).send('ไม่พบไฟล์');
  if (f.owner_id !== req.user.id && !req.can('booking.read.all')) {
    return denyOwner(req, res, 'ลบไฟล์ #' + f.id + ' ของผู้อื่น');
  }
  await pool.query('DELETE FROM booking_files WHERE id = $1', [f.id]);
  await fs.promises.unlink(path.join(UPLOAD_DIR, f.stored_name)).catch(() => {});
  await logEvent(req, { event: 'FILE_DELETE', resource: 'booking_files', resourceId: f.id, detail: f.original_name });
  res.redirect('/app/bookings');
}));

module.exports = router;