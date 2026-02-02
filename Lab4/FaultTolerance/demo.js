/**
 * ====================================================================
 * DEMO SCRIPT - Test tất cả Fault Tolerance Patterns
 * ====================================================================
 *
 * Chạy script này để demo và test các patterns.
 * Đảm bảo đã chạy cả 2 services trước:
 * - npm run start:product (terminal 1)
 * - npm run start:order (terminal 2)
 * - node demo.js (terminal 3)
 */

const axios = require("axios");

const ORDER_SERVICE = "http://localhost:3000";
const PRODUCT_SERVICE = "http://localhost:3001";

// Helper để format output
const log = (msg) =>
  console.log(`\n${"=".repeat(70)}\n${msg}\n${"=".repeat(70)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function demoRetry() {
  log("📌 DEMO 1: RETRY PATTERN");
  console.log(`
    Mục đích: Tự động thử lại khi gặp lỗi tạm thời
    
    Cấu hình:
    - maxRetries: 3 (thử lại tối đa 3 lần)
    - delay: 1000ms (chờ 1 giây)
    - backoffMultiplier: 2 (delay tăng gấp đôi mỗi lần)
    
    Kịch bản: Gọi Product Service với 30% failure rate
    → Một số request sẽ fail lần đầu nhưng thành công sau khi retry
    `);

  // Reset để đảm bảo circuit breaker closed
  await axios.post(`${ORDER_SERVICE}/reset`);

  console.log("\n🔄 Gửi 5 requests liên tiếp...\n");

  for (let i = 1; i <= 5; i++) {
    try {
      console.log(`\n--- Request ${i}/5 ---`);
      const response = await axios.post(`${ORDER_SERVICE}/api/orders`, {
        productId: `PROD-${i}`,
        quantity: 1,
      });
      console.log(`✅ Thành công: Order ${response.data.order.id}`);
    } catch (error) {
      console.log(
        `❌ Thất bại: ${error.response?.data?.message || error.message}`,
      );
    }
    await sleep(500);
  }

  // Hiển thị stats
  const stats = await axios.get(`${ORDER_SERVICE}/stats/retry`);
  console.log("\n📊 Retry Stats:", JSON.stringify(stats.data, null, 2));
}

async function demoCircuitBreaker() {
  log("📌 DEMO 2: CIRCUIT BREAKER PATTERN");
  console.log(`
    Mục đích: Ngắt mạch khi service liên tục lỗi
    
    3 Trạng thái:
    - CLOSED: Bình thường, cho phép requests
    - OPEN: Ngắt mạch, từ chối ngay lập tức
    - HALF-OPEN: Đang thử nghiệm phục hồi
    
    Cấu hình:
    - failureThreshold: 5 (mở sau 5 lỗi liên tiếp)
    - resetTimeout: 30000ms (thử lại sau 30 giây)
    
    Kịch bản: Set Product Service fail 100% → Circuit sẽ mở
    `);

  // Reset services
  await axios.post(`${ORDER_SERVICE}/reset`);

  // Set Product Service fail 100%
  console.log("\n⚙️ Cấu hình Product Service fail 100%...");
  await axios.post(`${PRODUCT_SERVICE}/api/config`, { failureRate: 1.0 });

  console.log("\n🔄 Gửi requests để trigger circuit breaker...\n");

  for (let i = 1; i <= 8; i++) {
    try {
      console.log(`--- Request ${i}/8 ---`);
      await axios.post(
        `${ORDER_SERVICE}/api/orders`,
        {
          productId: `PROD-${i}`,
          quantity: 1,
        },
        { timeout: 30000 },
      );
      console.log("✅ Thành công");
    } catch (error) {
      const data = error.response?.data;
      if (data?.circuitState === "OPEN") {
        console.log(`🚫 Circuit OPEN - Request bị từ chối ngay lập tức!`);
      } else {
        console.log(`❌ Thất bại: ${data?.message || error.message}`);
      }
    }
    await sleep(300);
  }

  // Hiển thị stats
  const stats = await axios.get(`${ORDER_SERVICE}/stats/circuit-breaker`);
  console.log(
    "\n📊 Circuit Breaker Stats:",
    JSON.stringify(stats.data, null, 2),
  );

  // Reset Product Service
  console.log("\n⚙️ Reset Product Service về bình thường...");
  await axios.post(`${PRODUCT_SERVICE}/api/config`, { failureRate: 0.3 });
}

async function demoRateLimiter() {
  log("📌 DEMO 3: RATE LIMITER PATTERN");
  console.log(`
    Mục đích: Giới hạn số lượng request trong một khoảng thời gian
    
    Cấu hình:
    - maxRequests: 10 (tối đa 10 requests)
    - windowMs: 60000ms (trong 1 phút)
    
    Kịch bản: Gửi 15 requests liên tiếp → 5 requests cuối sẽ bị reject
    `);

  // Reset
  await axios.post(`${ORDER_SERVICE}/reset`);
  await axios.post(`${PRODUCT_SERVICE}/api/config`, { failureRate: 0 }); // Tắt failure

  console.log("\n🔄 Gửi 15 requests liên tiếp...\n");

  for (let i = 1; i <= 15; i++) {
    try {
      console.log(`--- Request ${i}/15 ---`);
      const response = await axios.get(`${ORDER_SERVICE}/api/products/PROD-1`);
      const remaining = response.headers["x-ratelimit-remaining"];
      console.log(`✅ Thành công (Remaining: ${remaining})`);
    } catch (error) {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers["retry-after"];
        console.log(`🚫 Rate Limited! Retry after: ${retryAfter}s`);
      } else {
        console.log(`❌ Lỗi: ${error.message}`);
      }
    }
  }

  // Hiển thị stats
  const stats = await axios.get(`${ORDER_SERVICE}/stats/rate-limiter`);
  console.log("\n📊 Rate Limiter Stats:", JSON.stringify(stats.data, null, 2));

  // Reset failure rate
  await axios.post(`${PRODUCT_SERVICE}/api/config`, { failureRate: 0.3 });
}

async function demoBulkhead() {
  log("📌 DEMO 4: BULKHEAD PATTERN");
  console.log(`
    Mục đích: Cô lập tài nguyên giữa các service
    
    Cấu hình:
    - maxConcurrent: 5 (tối đa 5 requests đồng thời)
    - queueSize: 10 (tối đa 10 requests chờ)
    - maxWait: 3000ms (chờ tối đa 3 giây)
    
    Kịch bản: Gửi 10 requests ĐỒNG THỜI
    → 5 requests đầu được xử lý
    → 5 requests sau phải chờ trong queue
    `);

  // Reset
  await axios.post(`${ORDER_SERVICE}/reset`);

  // Set Product Service slow để thấy rõ bulkhead
  console.log("\n⚙️ Cấu hình Product Service slow (100% requests delay 2s)...");
  await axios.post(`${PRODUCT_SERVICE}/api/config`, {
    failureRate: 0,
    slowRate: 1.0, // 100% slow
    slowDelay: 2000, // 2 giây
  });

  console.log("\n🔄 Gửi 10 requests ĐỒNG THỜI...\n");

  const promises = [];
  for (let i = 1; i <= 10; i++) {
    promises.push(
      axios
        .post(
          `${ORDER_SERVICE}/api/orders`,
          {
            productId: `PROD-${i}`,
            quantity: 1,
          },
          { timeout: 20000 },
        )
        .then((res) => console.log(`✅ Request ${i}: Thành công`))
        .catch((err) => {
          if (err.response?.data?.error === "Service Busy") {
            console.log(`🚫 Request ${i}: Bulkhead đầy!`);
          } else {
            console.log(
              `❌ Request ${i}: ${err.response?.data?.message || err.message}`,
            );
          }
        }),
    );
  }

  await Promise.all(promises);

  // Hiển thị stats
  const stats = await axios.get(`${ORDER_SERVICE}/stats/bulkhead`);
  console.log("\n📊 Bulkhead Stats:", JSON.stringify(stats.data, null, 2));

  // Reset Product Service
  await axios.post(`${PRODUCT_SERVICE}/api/config`, {
    failureRate: 0.3,
    slowRate: 0.2,
    slowDelay: 3000,
  });
}

async function showAllStats() {
  log("📊 THỐNG KÊ TỔNG HỢP");

  try {
    const stats = await axios.get(`${ORDER_SERVICE}/stats`);
    console.log(JSON.stringify(stats.data, null, 2));
  } catch (error) {
    console.log("Không thể lấy stats:", error.message);
  }
}

// Main
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                     FAULT TOLERANCE DEMO                                  ║
║                                                                           ║
║  Đảm bảo đã chạy 2 services trước:                                       ║
║  - Terminal 1: npm run start:product                                      ║
║  - Terminal 2: npm run start:order                                        ║
╚═══════════════════════════════════════════════════════════════════════════╝
    `);

  try {
    // Kiểm tra services
    await axios.get(`${PRODUCT_SERVICE}/api/health`);
    await axios.get(`${ORDER_SERVICE}/health`);
    console.log("✅ Cả 2 services đang chạy!\n");
  } catch (error) {
    console.log("❌ Một hoặc cả 2 services chưa chạy!");
    console.log("Vui lòng chạy npm run start:product và npm run start:order");
    process.exit(1);
  }

  // Chạy từng demo
  await demoRetry();
  await sleep(2000);

  await demoCircuitBreaker();
  await sleep(2000);

  await demoRateLimiter();
  await sleep(2000);

  await demoBulkhead();
  await sleep(1000);

  await showAllStats();

  console.log("\n✅ Demo hoàn tất!");
}

main().catch(console.error);
