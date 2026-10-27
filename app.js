require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const pool = require('./db');
const { attachUser, requireLogin } = require('./middleware');
const { activityLogger } = require('./logger');

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const sessionStore = new PgStore({ pool, createTableIfMissing: true });
sessionStore.on('error', (err) => {
  console.error(' Connect-Pg-Simple Session Error:', err.message);
});

pool.on('error', (err) => {
  console.error(' PostgreSQL Pool Error:', err.message);
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    httpOnly: true, 
    maxAge: 2 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use(attachUser);
app.use(activityLogger);

app.get('/', (req, res) => res.redirect('/app'));
app.use(require('./routes/auth'));


app.use('/app', requireLogin, require('./routes/main'));
app.use('/app', requireLogin, require('./routes/manage'));

app.use('/app/bookings', requireLogin, require('./routes/bookings'));
app.use('/admin', requireLogin, require('./routes/admin'));
app.use('/api/admin', requireLogin, require('./routes/apiAdmin'));

app.use('/api/bookings', requireLogin, require('./routes/bookings'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('เกิดข้อผิดพลาดภายในระบบ');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(` เซิร์ฟเวอร์ทำงานที่ http://localhost:${PORT}`));