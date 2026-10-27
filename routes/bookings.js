const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requirePermission } = require('../middleware');

router.get('/export', requirePermission('booking.export'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.id AS booking_id, r.name AS room_name, u.full_name AS user_name,
              b.start_time, b.end_time, b.status
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       JOIN users u ON b.user_id = u.id
       ORDER BY b.id DESC`
    );

    let csv = '\uFEFFID,ชื่อห้อง,ผู้จอง,เวลาเริ่มต้น,เวลาสิ้นสุด,สถานะ\n';
    result.rows.forEach(row => {
      const startTime = new Date(row.start_time).toLocaleString('th-TH');
      const endTime = new Date(row.end_time).toLocaleString('th-TH');

      csv += `"${row.booking_id}","${row.room_name}","${row.user_name}","${startTime}","${endTime}","${row.status}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings-export.csv');

    return res.status(200).send(csv);

  } catch (error) {
    next(error); 
  }
});

router.get('/approved-times/:roomId', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const query = `
      SELECT start_time, end_time 
      FROM bookings 
      WHERE room_id = $1 AND LOWER(status) = 'approved' AND end_time >= NOW()
      ORDER BY start_time ASC
    `;
    const result = await pool.query(query, [roomId]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;