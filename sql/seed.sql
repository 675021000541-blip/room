INSERT INTO roles(name, description, is_admin) VALUES
 ('admin',   'ผู้ดูแลระบบ', TRUE),
 ('manager', 'ผู้จัดการ/ผู้อนุมัติ', FALSE),
 ('staff',   'เจ้าหน้าที่ดูแลห้อง', FALSE),
 ('user',    'ผู้ใช้ทั่วไป', FALSE);

INSERT INTO permissions(name, description) VALUES
 ('room.read','ดูรายการห้อง'),
 ('room.create','เพิ่มห้อง'),
 ('room.update','แก้ไขห้อง'),
 ('room.delete','ลบห้อง'),
 ('booking.read.own','ดูการจองของตนเอง'),
 ('booking.read.all','ดูการจองทั้งหมด'),
 ('booking.create','ส่งคำขอจอง'),
 ('booking.cancel.own','ยกเลิกการจองของตนเอง'),
 ('booking.approve','อนุมัติ/ปฏิเสธการจอง'),
 ('user.manage','จัดการผู้ใช้'),
 ('role.manage','จัดการ Role'),
 ('permission.manage','จัดการ Permission'),
 ('acl.manage','กำหนดสิทธิ์ใน ACL'),
 ('log.read','ดู Log');

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
 (r.name='manager' AND p.name IN ('room.read','booking.read.all','booking.approve','log.read'))
 OR (r.name='staff' AND p.name IN ('room.read','room.create','room.update','booking.read.all'))
 OR (r.name='user' AND p.name IN ('room.read','booking.read.own','booking.create','booking.cancel.own'));