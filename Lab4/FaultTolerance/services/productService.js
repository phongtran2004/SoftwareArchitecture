/**
 * ====================================================================
 * SERVICE B - PRODUCT SERVICE
 * ====================================================================
 *
 * Đây là service được gọi bởi Order Service.
 * Service này có thể SIMULATE các lỗi để test Fault Tolerance patterns:
 *
 * - Random failures (lỗi ngẫu nhiên)
 * - Slow responses (phản hồi chậm)
 * - Complete downtime (ngừng hoạt động)
 *
 * Giải thích cho thầy:
 * - Trong thực tế, service có thể gặp lỗi do network, database, overload
 * - Service này simulate các tình huống đó để test các pattern
 */

const express = require("express");
const app = express();
const PORT = 3001;

// ============ CẤU HÌNH SIMULATE LỖI ============
let config = {
  failureRate: 0.3, // 30% request sẽ fail
  slowRate: 0.2, // 20% request sẽ chậm
  slowDelay: 3000, // Delay 3 giây cho slow request
  isDown: false, // Simulate service down hoàn toàn
};

// ============ MIDDLEWARE ============
app.use(express.json());

// ============ ENDPOINTS ============

/**
 * API lấy thông tin sản phẩm
 * Order Service sẽ gọi API này để kiểm tra tồn kho
 */
app.get("/api/products/:id", async (req, res) => {
  const productId = req.params.id;
  console.log(`[Product Service] Nhận request cho product: ${productId}`);

  // Simulate service down
  if (config.isDown) {
    console.log(`[Product Service] ❌ Service đang DOWN!`);
    return res.status(503).json({ error: "Service Unavailable" });
  }

  // Simulate random failure
  if (Math.random() < config.failureRate) {
    console.log(`[Product Service] ❌ Random failure xảy ra!`);
    return res.status(500).json({ error: "Internal Server Error" });
  }

  // Simulate slow response
  if (Math.random() < config.slowRate) {
    console.log(
      `[Product Service] ⏳ Slow response - đợi ${config.slowDelay}ms`,
    );
    await new Promise((resolve) => setTimeout(resolve, config.slowDelay));
  }

  // Success response
  const product = {
    id: productId,
    name: `Áo thun Cotton - Mã ${productId}`,
    price: 250000,
    stock: Math.floor(Math.random() * 100) + 1,
    timestamp: new Date().toISOString(),
  };

  console.log(`[Product Service] ✅ Trả về product thành công`);
  res.json(product);
});

/**
 * API kiểm tra tồn kho
 */
app.get("/api/products/:id/stock", async (req, res) => {
  const productId = req.params.id;

  if (config.isDown) {
    return res.status(503).json({ error: "Service Unavailable" });
  }

  if (Math.random() < config.failureRate) {
    return res.status(500).json({ error: "Database connection failed" });
  }

  res.json({
    productId,
    available: Math.floor(Math.random() * 50) + 1,
    reserved: Math.floor(Math.random() * 10),
  });
});

/**
 * API điều khiển simulate - dùng để test
 */
app.post("/api/config", (req, res) => {
  config = { ...config, ...req.body };
  console.log(`[Product Service] Cấu hình mới:`, config);
  res.json({ message: "Config updated", config });
});

app.get("/api/config", (req, res) => {
  res.json(config);
});

app.get("/api/health", (req, res) => {
  if (config.isDown) {
    return res.status(503).json({ status: "DOWN" });
  }
  res.json({ status: "UP", timestamp: new Date().toISOString() });
});

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           PRODUCT SERVICE (Service B) - Port ${PORT}          ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║  - GET  /api/products/:id       - Lấy thông tin sản phẩm   ║
║  - GET  /api/products/:id/stock - Kiểm tra tồn kho         ║
║  - POST /api/config             - Cấu hình simulate lỗi    ║
║  - GET  /api/health             - Health check             ║
╠════════════════════════════════════════════════════════════╣
║  Simulate Config:                                          ║
║  - failureRate: ${(config.failureRate * 100).toString().padEnd(3)}% requests sẽ fail                  ║
║  - slowRate: ${(config.slowRate * 100).toString().padEnd(3)}% requests sẽ chậm                     ║
║  - slowDelay: ${config.slowDelay}ms                                     ║
╚════════════════════════════════════════════════════════════╝
    `);
});
