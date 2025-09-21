// tickets.js
const express = require('express');
const router = express.Router();
const db = require('./db');

// ดึง ticket ทั้งหมด
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute(`SELECT * FROM ticket ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ค้นหา ticket ตาม number_6 และ round_date (ใช้ params)
router.get('/search/:number_6', async (req, res) => {
    try {
        const { number_6 } = req.params;

        const [rows] = await db.execute(
            `SELECT * FROM ticket WHERE number_6 = ? AND round_date = ? ORDER BY created_at DESC`,
            [number_6, '2025-09-04']
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ค้นหา ticket ตาม status
router.get('/status/:status', async (req, res) => {
    try {
        const { status } = req.params;
        const [rows] = await db.execute(
            `SELECT * FROM ticket WHERE status = ? AND round_date = ?`,
            [status, '2025-09-04']
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});


///------------------------------
router.post('/purchases', async (req, res, next) => {
  const conn = await db.getConnection(); // ใช้ db.getConnection()
  try {
    const { user_id, ticketId } = req.body;

    if (!user_id || !ticketId) {
      return res.status(400).json({ message: 'user_id และ ticketId จำเป็น' });
    }

    await conn.beginTransaction();

    // ล็อคตั๋ว
    const [[ticket]] = await conn.query(
      'SELECT * FROM ticket WHERE id=? FOR UPDATE',
      [ticketId]
    );
    if (!ticket) throw new Error('Ticket not found');
    if (ticket.status !== 'available') throw new Error('Ticket not available');

    // เช็คยอดเงินใน wallet
    const [last] = await conn.query(
      'SELECT balance_after FROM wallet_txn WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 1',
      [user_id]
    );
    const bal = last.length ? Number(last[0].balance_after) : 0;
    if (bal < Number(ticket.price)) throw new Error('Insufficient balance');

    // บันทึกการซื้อ
    const [pr] = await conn.query(
      'INSERT INTO purchase(user_id, ticket_id, round_date, purchase_price) VALUES (?,?,?,?)',
      [user_id, ticket.id, ticket.round_date, ticket.price]
    );

    // อัปเดตสถานะตั๋ว
    await conn.query(
      'UPDATE ticket SET status="sold", updated_at=NOW() WHERE id=?',
      [ticket.id]
    );

    // อัปเดต wallet
    const newBal = bal - Number(ticket.price);
    await conn.query(
      'INSERT INTO wallet_txn(user_id,type,amount,balance_after,purchase_id,note) VALUES (?,?,?,?,?,?)',
      [
        user_id,
        'purchase',
        -Number(ticket.price),
        newBal,
        pr.insertId,
        `Buy ticket ${ticket.number_6}`, // ใช้ backtick
      ]
    );

    await conn.commit();
    res.json({
      ok: true,
      purchase_id: pr.insertId,
      round_date: ticket.round_date,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: e.message || 'Server error' });
  } finally {
    conn.release();
  }
});




//---------------------
router.get('/purchases/:user_id', async (req, res) => {
  const { user_id } = req.params;
  try {
    const [rows] = await db.execute(
      `SELECT p.id AS purchase_id, p.purchase_price, p.purchased_at,
              t.id AS ticket_id, t.number_6, t.price, t.status, t.round_date
       FROM purchase p
       JOIN ticket t ON p.ticket_id = t.id
       WHERE p.user_id = ?
       ORDER BY p.purchased_at DESC`,
      [user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'ยังไม่มีการซื้อตั๋ว' });
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});


//--------------------------
// GET /prize-tiers
/*
router.get("/prize-tiers", async (req, res, next) => {
  try {
    const [rows] = await db.query(
      "SELECT id, tier_rank, name, prize_amount FROM prize_tier ORDER BY tier_rank"
    );
    res.json(rows);
  } catch (e) { 
    console.error(e);
    res.status(500).json({ message: e.message || "Server error" });
  }
}); */


router.get("/prize-tiers", async (req, res, next) => {
  try {
    // ดึง draw ล่าสุด
    const [[latestDraw]] = await db.query(
      "SELECT id FROM draw ORDER BY draw_date DESC LIMIT 1"
    );

    if (!latestDraw) return res.json([]);

    const drawId = latestDraw.id;

    // ดึงรางวัลพร้อมเลขที่ถูกรางวัล
    const [rows] = await db.query(
      `SELECT 
          pt.id,
          pt.tier_rank,
          pt.name,
          pt.prize_amount,
          CASE 
            WHEN po.suffix_len IS NULL THEN po.number_full
            ELSE po.suffix_value
          END AS winning_number
       FROM prize_tier pt
       LEFT JOIN prize_outcome po 
         ON po.prize_tier_id = pt.id AND po.draw_id = ?
       ORDER BY pt.tier_rank`,
      [drawId]
    );

    // ส่งผลลัพธ์
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Server error" });
  }
});



// ตรวจสอบตั๋วผู้ใช้ว่าถูกรางวัล
// ตรวจสอบเลขตั๋วว่าถูกรางวัล (POST)
router.post('/check-ticket-prize', async (req, res) => {
  const { number_6, round_date } = req.body;

  if (!number_6 || !round_date) {
    return res.status(400).json({ error: 'กรุณาส่ง number_6 และ round_date' });
  }

  try {
    // ดึงรางวัลทั้งหมดของรอบนั้น
    const [prizes] = await db.execute(
      `SELECT po.number_full, po.suffix_len, po.suffix_value, pt.name, pt.prize_amount
       FROM prize_outcome po
       JOIN prize_tier pt ON po.prize_tier_id = pt.id
       JOIN draw d ON po.draw_id = d.id
       WHERE d.draw_date = ?`,
      [round_date]
    );

    let wonPrizes = [];

    for (const prize of prizes) {
      // ตรวจเลขเต็ม
      if (prize.number_full && prize.number_full === number_6) {
        wonPrizes.push({
          prize: prize.name,
          amount: prize.prize_amount,
          type: 'full_number'
        });
      }

      // ตรวจเลขท้าย (2 หรือ 3 ตัว)
      if (prize.suffix_len && prize.suffix_value) {
        const lastDigits = number_6.slice(-prize.suffix_len);
        if (lastDigits === prize.suffix_value) {
          wonPrizes.push({
            prize: prize.name,
            amount: prize.prize_amount,
            type: `suffix_${prize.suffix_len}`
          });
        }
      }
    }

    if (wonPrizes.length > 0) {
      return res.json({ won: true, prizes: wonPrizes });
    } else {
      return res.json({ won: false });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});




router.post('/redemptions/claim', async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    let { user_id, purchaseId, drawId } = req.body;

    if (!user_id) throw new Error('user_id จำเป็น');
    if (!purchaseId) throw new Error('purchaseId จำเป็น');
    if (!drawId) throw new Error('drawId จำเป็น');

    // แปลง user_id ให้เป็น number เพื่อเปรียบเทียบกับ db
    user_id = Number(user_id);
    if (isNaN(user_id)) throw new Error('user_id ต้องเป็นตัวเลข');

    await conn.beginTransaction();

    // ตรวจสอบว่าตั๋วเป็นของผู้ใช้
    const [[p]] = await conn.query(
      'SELECT p.id, p.user_id FROM purchase p WHERE p.id=? FOR UPDATE',
      [purchaseId]
    );
    if (!p) throw new Error('Purchase not found');
    if (p.user_id !== user_id) throw new Error('Not your purchase');

    // ตรวจสอบว่าถูก redeem ไปแล้วหรือยัง
    const [red] = await conn.query(
      'SELECT id FROM redemption WHERE purchase_id=? AND draw_id=?',
      [purchaseId, drawId]
    );
    if (red.length) throw new Error('Already redeemed');

    // ตรวจสอบจำนวนเงินรางวัล
    const [[sumRow]] = await conn.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM winning_ticket WHERE purchase_id=? AND draw_id=?',
      [purchaseId, drawId]
    );
    const total = Number(sumRow.total || 0);
    if (total <= 0) throw new Error('No prize for this purchase/draw');

    // บันทึก redemption
    const [r] = await conn.query(
      'INSERT INTO redemption(purchase_id, draw_id, amount_total) VALUES (?,?,?)',
      [purchaseId, drawId, total]
    );

    // อัปเดต wallet
    const [last] = await conn.query(
      'SELECT balance_after FROM wallet_txn WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 1',
      [user_id]
    );
    const bal = last.length ? Number(last[0].balance_after) : 0;
    const newBal = bal + total;

    await conn.query(
      'INSERT INTO wallet_txn(user_id,type,amount,balance_after,redemption_id,draw_id,note) VALUES (?,?,?,?,?,?,?)',
      [user_id, 'prize', total, newBal, r.insertId, drawId, `Prize claim for purchase ${purchaseId}`]
    );

    await conn.commit();

    res.json({ ok: true, redemption_id: r.insertId, amount: total, balance_after: newBal });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: e.message || 'Server error' });
  } finally {
    conn.release();
  }
});




module.exports = router;


