require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');


const app = express();
app.use(express.json()); // Để đọc được JSON từ body request

const PORT = process.env.PORT || 4000;
const SECRET_KEY = process.env.ACCESS_TOKEN_SECRET; // Key dùng để ký tên (Sign) và kiểm tra (Verify)

// 1. API LOGIN: Nhận user -> Trả về Token
app.post('/login', (req, res) => {
    // Giả lập check user/pass (thực tế phải check DB)
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ message: "Vui lòng nhập username" });
    }

    // Payload: Dữ liệu muốn nhét vào trong token
    const payload = { username: username, role: 'admin' };

    // Ký tên tạo Token (hết hạn sau 1 giờ)
    const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1h' });

    res.json({
        message: "Login thành công!",
        token: token
    });
});

// MIDDLEWARE: Ông bảo vệ kiểm soát vé
function authenticateToken(req, res, next) {
    // Lấy token từ header: "Authorization: Bearer <token>"
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Lấy phần token phía sau chữ Bearer

    if (!token) return res.sendStatus(401); // Không có vé -> Cút (Unauthorized)

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403); // Vé giả hoặc hết hạn -> Cấm (Forbidden)
        
        req.user = user; // Lưu thông tin user giải mã được vào request để dùng sau
        next(); // Cho qua
    });
}

// 2. API PROTECTED: Phải có Token mới xem được
app.get('/kientruc', authenticateToken, (req, res) => {
    res.json({
        message: "Đây là dữ liệu mật môn Kiến trúc phần mềm",
        currentUser: req.user // Trả về thông tin user đã lấy được từ token
    });
});

app.listen(PORT, () => {
    console.log(`Auth Server chạy tại: http://localhost:${PORT}`);
});