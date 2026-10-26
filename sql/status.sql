INSERT INTO permissions(name, description) VALUES
 ('booking.update_status', 'ปรับสถานะการจอง (เสร็จสิ้น)');

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'staff' AND p.name = 'booking.update_status';