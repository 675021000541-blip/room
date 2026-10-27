const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requirePermission } = require('../middleware');

// GET /api/bookings/export
router.get('/export', requirePermission('booking.export'), async (req, res, next) => {
  try {
    // 1. Query แบบ JOIN ตารางเพื่อดึงชื่อห้องและชื่อผู้ใช้ตาม Schema จริง
    const result = await pool.query(
      `SELECT b.id AS booking_id, r.name AS room_name, u.full_name AS user_name, 
              b.start_time, b.end_time, b.status
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       JOIN users u ON b.user_id = u.id
       ORDER BY b.id DESC`
    );

    // 2. สร้าง CSV String พร้อม BOM (\uFEFF) ป้องกันภาษาไทยต่างด้าว
    let csv = '\uFEFFID,ชื่อห้อง,ผู้จอง,เวลาเริ่มต้น,เวลาสิ้นสุด,สถานะ\n';
    result.rows.forEach(row => {
      // จัดรูปแบบวันที่ให้ดูง่ายขึ้น
      const startTime = new Date(row.start_time).toLocaleString('th-TH');
      const endTime = new Date(row.end_time).toLocaleString('th-TH');

      csv += `"${row.booking_id}","${row.room_name}","${row.user_name}","${startTime}","${endTime}","${row.status}"\n`;
    });

    // 3. กำหนด Header ให้ดาวน์โหลดไฟล์ CSV
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings-export.csv');

    return res.status(200).send(csv);

  } catch (error) {
    next(error); // ส่งไป Error Handler
  }
});

module.exports = router;