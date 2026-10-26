CREATE TABLE booking_files (
  id SERIAL PRIMARY KEY,
  booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT UNIQUE NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT NOT NULL,
  uploaded_by INT NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO permissions(name, description) VALUES
 ('file.upload', 'อัปโหลดไฟล์แนบการจอง'),
 ('file.read', 'เปิดดู/ดาวน์โหลดไฟล์แนบ'),
 ('file.delete', 'ลบไฟล์แนบ');

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
 (r.name = 'user' AND p.name IN ('file.upload', 'file.read'))
 OR (r.name IN ('manager', 'staff') AND p.name = 'file.read');