// ป้องกัน XSS: แปลงอักขระพิเศษก่อนแสดงข้อมูลจากผู้ใช้บนหน้าเว็บ
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = d => new Date(d).toLocaleString('th-TH',
  { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' });

const STATUS = {
  pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ',
  cancelled: 'ยกเลิก', completed: 'เสร็จสิ้น'
};

// ให้ async handler ส่ง error ไปที่ error handler ของ Express
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { esc, fmt, STATUS, wrap };