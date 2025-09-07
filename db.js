// db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: '202.28.34.203',
    user: 'mb68_65011212167',
    password: 'TwJQjouQomE3',
    database: 'mb68_65011212167',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
