/**
 * ====================================================================
 * SERVICE A - ORDER SERVICE
 * ====================================================================
 *
 * Đây là service chính, gọi đến Product Service (Service B).
 * Tích hợp đầy đủ 4 patterns Fault Tolerance:
 *
 * 1. RETRY - Tự động thử lại khi gặp lỗi tạm thời
 * 2. CIRCUIT BREAKER - Ngắt mạch khi service liên tục lỗi
 * 3. RATE LIMITER - Giới hạn số request từ client
 * 4. BULKHEAD - Cô lập tài nguyên giữa các operation
 *
 * Giải thích cho thầy:
 * - Order Service là consumer, Product Service là provider
 * - Các patterns bảo vệ Order Service khỏi lỗi từ Product Service
 */

const express = require("express");
const axios = require("axios");

// Import các Fault Tolerance Patterns
const RetryPattern = require("../patterns/retry");
const CircuitBreaker = require("../patterns/circuitBreaker");
const { RateLimiter } = require("../patterns/rateLimiter");
const { Bulkhead, BulkheadManager } = require("../patterns/bulkhead");

const app = express();
const PORT = 3000;
const PRODUCT_SERVICE_URL = "http://localhost:3001";

// ============ KHỞI TẠO CÁC PATTERNS ============

// 1. RETRY: Thử lại tối đa 3 lần, delay tăng dần
const retry = new RetryPattern({
  maxRetries: 3,
  delay: 1000, // Bắt đầu với 1 giây
  backoffMultiplier: 2, // Mỗi lần x2: 1s → 2s → 4s
  maxDelay: 10000,
});

// 2. CIRCUIT BREAKER: Mở sau 5 lỗi, reset sau 30 giây
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5, // 5 lỗi liên tiếp
  resetTimeout: 30000, // Thử lại sau 30 giây
  halfOpenRequests: 3, // 3 request test thành công để đóng
});

// 3. RATE LIMITER: Tối đa 10 request mỗi phút
const rateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000, // 1 phút
});

// 4. BULKHEAD: Cô lập tài nguyên cho từng loại operation
const bulkheadManager = new BulkheadManager();

// Bulkhead cho Product Service: max 5 concurrent calls
const productBulkhead = bulkheadManager.getBulkhead("product-service", {
  maxConcurrent: 5,
  maxWait: 3000,
  queueSize: 10,
});

// Bulkhead cho Payment (demo): max 3 concurrent calls
const paymentBulkhead = bulkheadManager.getBulkhead("payment-service", {
  maxConcurrent: 3,
  maxWait: 5000,
  queueSize: 5,
});

// ============ MIDDLEWARE ============
app.use(express.json());

// Rate Limiter Middleware - Áp dụng cho tất cả requests
app.use((req, res, next) => {
  // Bỏ qua health check và stats
  if (req.path === "/health" || req.path.startsWith("/stats")) {
    return next();
  }

  const remaining = rateLimiter.getRemainingRequests();
  res.set("X-RateLimit-Remaining", remaining);
  res.set("X-RateLimit-Limit", rateLimiter.maxRequests);

  if (!rateLimiter.tryAcquire()) {
    const retryAfter = Math.ceil(rateLimiter.getRetryAfter() / 1000);
    res.set("Retry-After", retryAfter);
    return res.status(429).json({
      error: "Too Many Requests",
      message: `Rate limit exceeded. Max ${rateLimiter.maxRequests} requests per minute.`,
      retryAfter: `${retryAfter} seconds`,
    });
  }

  next();
});

// ============ HELPER FUNCTION ============

/**
 * Gọi Product Service với đầy đủ Fault Tolerance patterns
 * Luồng: Rate Limiter → Bulkhead → Circuit Breaker → Retry → HTTP Call
 */
async function callProductService(productId) {
  const operationName = `GetProduct-${productId}`;

  // Layer 1: Bulkhead - Cô lập concurrent calls
  return await productBulkhead.execute(async () => {
    // Layer 2: Circuit Breaker - Ngắt mạch nếu service down
    return await circuitBreaker.execute(async () => {
      // Layer 3: Retry - Thử lại nếu lỗi tạm thời
      return await retry.execute(async () => {
        // Layer 4: HTTP Call thực sự
        const response = await axios.get(
          `${PRODUCT_SERVICE_URL}/api/products/${productId}`,
          { timeout: 5000 },
        );
        return response.data;
      }, operationName);
    }, operationName);
  }, operationName);
}

// ============ API ENDPOINTS ============

/**
 * API Tạo đơn hàng - Demo đầy đủ các patterns
 */
app.post("/api/orders", async (req, res) => {
  const { productId, quantity } = req.body;

  console.log("\n" + "=".repeat(60));
  console.log(
    `[Order Service] 📦 Nhận yêu cầu đặt hàng: Product ${productId}, SL: ${quantity}`,
  );
  console.log("=".repeat(60));

  try {
    // Bước 1: Lấy thông tin sản phẩm từ Product Service
    console.log("\n[Order Service] 🔍 Bước 1: Kiểm tra sản phẩm...");
    const product = await callProductService(productId);

    // Bước 2: Kiểm tra tồn kho
    console.log(
      `[Order Service] 📊 Bước 2: Kiểm tra tồn kho (có ${product.stock} sản phẩm)`,
    );
    if (product.stock < quantity) {
      return res.status(400).json({
        error: "Insufficient Stock",
        message: `Chỉ còn ${product.stock} sản phẩm trong kho`,
      });
    }

    // Bước 3: Tạo đơn hàng
    const order = {
      id: `ORD-${Date.now()}`,
      productId,
      productName: product.name,
      quantity,
      unitPrice: product.price,
      totalAmount: product.price * quantity,
      status: "CREATED",
      createdAt: new Date().toISOString(),
    };

    console.log(`[Order Service] ✅ Bước 3: Tạo đơn hàng thành công!`);
    console.log("=".repeat(60) + "\n");

    res.status(201).json({
      message: "Order created successfully",
      order,
      faultToleranceStats: {
        retry: retry.getStats(),
        circuitBreaker: circuitBreaker.getStats(),
        bulkhead: productBulkhead.getStats(),
      },
    });
  } catch (error) {
    console.log(`[Order Service] ❌ Lỗi: ${error.message}`);
    console.log("=".repeat(60) + "\n");

    // Xử lý các loại lỗi khác nhau
    if (error.code === "CIRCUIT_OPEN") {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Product Service đang không khả dụng. Vui lòng thử lại sau.",
        circuitState: circuitBreaker.getState(),
      });
    }

    if (error.code === "BULKHEAD_FULL" || error.code === "BULKHEAD_TIMEOUT") {
      return res.status(503).json({
        error: "Service Busy",
        message: "Hệ thống đang quá tải. Vui lòng thử lại sau.",
        bulkheadStats: productBulkhead.getStats(),
      });
    }

    res.status(500).json({
      error: "Internal Server Error",
      message: error.message,
    });
  }
});

/**
 * API lấy thông tin sản phẩm đơn giản
 */
app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await callProductService(req.params.id);
    res.json(product);
  } catch (error) {
    res.status(error.code === "CIRCUIT_OPEN" ? 503 : 500).json({
      error: error.message,
    });
  }
});

// ============ STATS & MONITORING ENDPOINTS ============

/**
 * Xem thống kê tất cả patterns
 */
app.get("/stats", (req, res) => {
  res.json({
    retry: retry.getStats(),
    circuitBreaker: circuitBreaker.getStats(),
    rateLimiter: rateLimiter.getStats(),
    bulkheads: bulkheadManager.getAllStats(),
  });
});

app.get("/stats/retry", (req, res) => res.json(retry.getStats()));
app.get("/stats/circuit-breaker", (req, res) =>
  res.json(circuitBreaker.getStats()),
);
app.get("/stats/rate-limiter", (req, res) => res.json(rateLimiter.getStats()));
app.get("/stats/bulkhead", (req, res) =>
  res.json(bulkheadManager.getAllStats()),
);

/**
 * Reset tất cả patterns (dùng để test)
 */
app.post("/reset", (req, res) => {
  retry.resetStats();
  circuitBreaker.reset();
  rateLimiter.reset();
  productBulkhead.reset();
  paymentBulkhead.reset();
  res.json({ message: "All patterns reset successfully" });
});

app.get("/health", (req, res) => {
  res.json({
    status: "UP",
    circuitBreaker: circuitBreaker.getState(),
    timestamp: new Date().toISOString(),
  });
});

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║              ORDER SERVICE (Service A) - Port ${PORT}                      ║
╠════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  🛡️  FAULT TOLERANCE PATTERNS ENABLED:                                ║
║                                                                        ║
║  1. RETRY          - Max 3 retries, Exponential Backoff               ║
║  2. CIRCUIT BREAKER - Opens after 5 failures, 30s reset               ║
║  3. RATE LIMITER   - Max 10 requests/minute                           ║
║  4. BULKHEAD       - Max 5 concurrent calls to Product Service        ║
║                                                                        ║
╠════════════════════════════════════════════════════════════════════════╣
║  Endpoints:                                                            ║
║  - POST /api/orders         - Tạo đơn hàng (demo tất cả patterns)      ║
║  - GET  /api/products/:id   - Lấy thông tin sản phẩm                   ║
║  - GET  /stats              - Xem thống kê tất cả patterns             ║
║  - POST /reset              - Reset tất cả patterns                    ║
╚════════════════════════════════════════════════════════════════════════╝
    `);
});
