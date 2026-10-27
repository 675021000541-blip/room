const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = d => new Date(d).toLocaleString('th-TH',
  { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' });

const STATUS = {
  pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ',
  cancelled: 'ยกเลิก', completed: 'เสร็จสิ้น'
};

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { esc, fmt, STATUS, wrap };