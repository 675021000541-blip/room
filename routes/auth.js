const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { logEvent } = require('../logger');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().slice(0, 50);
    const password = String(req.body.password || '');
    const result = await pool.query(
      'SELECT id, password_hash, is_active FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    const ok = user && user.is_active && await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await logEvent(req, {
        event: 'LOGIN_FAIL', result: 'fail', resource: 'auth',
        usernameAttempt: username, userId: user ? user.id : null
      });
      return res.status(401).render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    req.session.regenerate(async err => {
      if (err) return res.status(500).send('เกิดข้อผิดพลาด');
      req.session.userId = user.id;
      await logEvent(req, { event: 'LOGIN_SUCCESS', resource: 'auth', usernameAttempt: username, userId: user.id });
      res.redirect('/app');
    });
  } catch (err) {
    res.status(500).send('เกิดข้อผิดพลาด: ' + err.message);
  }
});

router.post('/logout', async (req, res) => {
  if (req.user) await logEvent(req, { event: 'LOGOUT', resource: 'auth' });
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;