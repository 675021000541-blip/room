CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  building VARCHAR(100),
  capacity INT NOT NULL CHECK (capacity > 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  room_id INT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled','completed')),
  reviewed_by INT REFERENCES users(id),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

INSERT INTO rooms(name, building, capacity, description) VALUES
 ('ห้องประชุม A', 'อาคาร 1 ชั้น 2', 20, 'ห้องประชุมเล็ก มีโปรเจกเตอร์'),
 ('ห้องประชุม B', 'อาคาร 1 ชั้น 3', 50, 'ห้องประชุมใหญ่ มีระบบเสียง'),
 ('ห้องสัมมนา', 'อาคาร 2 ชั้น 1', 120, 'ห้องสัมมนาจุได้มาก');