// users.js
const express = require('express');
const router = express.Router();
const db = require('./db');
const bcrypt = require('bcrypt');

// REGISTER + initial transaction
router.post('/register', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { username, password, full_name, phone, user_type, url, address, initial_amount } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

        const password_hash = await bcrypt.hash(password, 10);

        // Insert user
        const [userResult] = await connection.execute(
            `INSERT INTO app_user (username, password_hash, full_name, phone, user_type, url, address) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [username, password_hash, full_name || null, phone || null, user_type || 'MEMBER', url || null, address || null]
        );

        const user_id = userResult.insertId;

        // Insert initial transaction
        const amount = parseFloat(initial_amount) || 0;
        await connection.execute(
            `INSERT INTO wallet_txn (user_id, type, amount, balance_after, note)
             VALUES (?, 'initial', ?, ?, 'Initial balance')`,
            [user_id, amount, amount]
        );

        await connection.commit();
        res.status(201).json({ message: 'User registered with initial transaction', user_id });

    } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Username already exists' });
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    } finally {
        connection.release();
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

        const [rows] = await db.execute(`SELECT * FROM app_user WHERE username = ?`, [username]);
        const user = rows[0];
        if (!user) return res.status(401).json({ message: 'Invalid username or password' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ message: 'Invalid username or password' });

        if (!user.is_active) return res.status(403).json({ message: 'User is inactive' });

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                phone: user.phone,
                user_type: user.user_type,
                url: user.url,
                address: user.address
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
