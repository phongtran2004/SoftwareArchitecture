/**
 * ====================================================================
 * BULKHEAD PATTERN
 * ====================================================================
 *
 * 📚 KHÁI NIỆM:
 * Tên "Bulkhead" lấy từ các ngăn kín nước trên tàu thủy.
 * Khi một ngăn bị thủng, các ngăn khác vẫn an toàn.
 *
 * Trong phần mềm: Cô lập tài nguyên giữa các service/operation
 * để một service bị lỗi không ảnh hưởng đến service khác.
 *
 * 🎯 MỤC ĐÍCH:
 * - Ngăn chặn một service lỗi "nuốt" hết tài nguyên
 * - Cô lập failure để không lan sang các phần khác
 * - Đảm bảo các operation quan trọng vẫn có resource
 *
 * 📊 CÁC LOẠI BULKHEAD:
 *
 * 1. SEMAPHORE BULKHEAD (Đã implement):
 *    Giới hạn số concurrent calls
 *    ┌─────────────────────────────────┐
 *    │ Max Concurrent: 5               │
 *    │ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐  │
 *    │ │ 1 │ │ 2 │ │ 3 │ │ 4 │ │ 5 │  │ ← Các slot
 *    │ └───┘ └───┘ └───┘ └───┘ └───┘  │
 *    │         Call 6 → 🚫 REJECTED   │
 *    └─────────────────────────────────┘
 *
 * 2. THREAD POOL BULKHEAD:
 *    Mỗi service có thread pool riêng
 *    (Thường dùng trong Java, không phải Node.js)
 *
 * ⚙️ CẤU HÌNH:
 * - maxConcurrent: Số request đồng thời tối đa
 * - maxWait: Thời gian tối đa chờ đợi nếu hết slot
 * - queueSize: Kích thước hàng đợi
 *
 * 🏠 VÍ DỤ THỰC TẾ (E-commerce):
 * - Product Service Bulkhead: max 20 concurrent calls
 * - Payment Service Bulkhead: max 10 concurrent calls
 * - Email Service Bulkhead: max 5 concurrent calls
 * → Nếu Email Service bị chậm, không ảnh hưởng Payment!
 */

class Bulkhead {
  constructor(options = {}) {
    this.name = options.name || "default";
    this.maxConcurrent = options.maxConcurrent || 10; // Số request đồng thời
    this.maxWait = options.maxWait || 5000; // Thời gian chờ tối đa
    this.queueSize = options.queueSize || 20; // Kích thước queue

    // Trạng thái hiện tại
    this.currentConcurrent = 0;
    this.queue = [];

    // Thống kê
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      rejectedRequests: 0,
      queuedRequests: 0,
      maxConcurrentReached: 0,
    };
  }

  /**
   * Thực thi function với Bulkhead protection
   */
  async execute(fn, operationName = "Operation") {
    this.stats.totalRequests++;

    console.log(
      `[Bulkhead:${this.name}] 📊 ${operationName} - Current: ${this.currentConcurrent}/${this.maxConcurrent}`,
    );

    // Nếu còn slot trống, thực thi ngay
    if (this.currentConcurrent < this.maxConcurrent) {
      return await this.executeWithSlot(fn, operationName);
    }

    // Nếu hết slot, kiểm tra queue
    if (this.queue.length >= this.queueSize) {
      this.stats.rejectedRequests++;
      const error = new Error(
        `Bulkhead '${this.name}' full - ${operationName} rejected`,
      );
      error.code = "BULKHEAD_FULL";
      console.log(
        `[Bulkhead:${this.name}] 🚫 ${operationName} - Hết slot VÀ queue đầy, từ chối!`,
      );
      throw error;
    }

    // Thêm vào queue và chờ
    console.log(
      `[Bulkhead:${this.name}] ⏳ ${operationName} - Hết slot, thêm vào queue (${this.queue.length + 1}/${this.queueSize})`,
    );
    return await this.waitForSlot(fn, operationName);
  }

  /**
   * Thực thi với một slot
   */
  async executeWithSlot(fn, operationName) {
    this.currentConcurrent++;

    if (this.currentConcurrent === this.maxConcurrent) {
      this.stats.maxConcurrentReached++;
      console.log(`[Bulkhead:${this.name}] ⚠️ Đạt max concurrent!`);
    }

    try {
      console.log(
        `[Bulkhead:${this.name}] 🔧 ${operationName} - Đang thực thi (slot ${this.currentConcurrent}/${this.maxConcurrent})`,
      );
      const result = await fn();
      this.stats.successfulRequests++;
      return result;
    } finally {
      this.currentConcurrent--;
      this.releaseSlot();
      console.log(
        `[Bulkhead:${this.name}] 🔓 ${operationName} - Trả slot (còn ${this.currentConcurrent}/${this.maxConcurrent})`,
      );
    }
  }

  /**
   * Chờ đợi slot trống
   */
  async waitForSlot(fn, operationName) {
    return new Promise((resolve, reject) => {
      const request = {
        fn,
        operationName,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      this.queue.push(request);
      this.stats.queuedRequests++;

      // Timeout nếu chờ quá lâu
      const timeout = setTimeout(() => {
        const index = this.queue.indexOf(request);
        if (index > -1) {
          this.queue.splice(index, 1);
          this.stats.rejectedRequests++;
          const error = new Error(
            `Bulkhead '${this.name}' timeout - ${operationName}`,
          );
          error.code = "BULKHEAD_TIMEOUT";
          console.log(
            `[Bulkhead:${this.name}] ⏰ ${operationName} - Timeout sau ${this.maxWait}ms`,
          );
          reject(error);
        }
      }, this.maxWait);

      // Lưu timeout để có thể cancel
      request.timeout = timeout;
    });
  }

  /**
   * Giải phóng slot và xử lý request trong queue
   */
  releaseSlot() {
    if (this.queue.length > 0 && this.currentConcurrent < this.maxConcurrent) {
      const request = this.queue.shift();
      clearTimeout(request.timeout);

      console.log(
        `[Bulkhead:${this.name}] 📤 Lấy request từ queue: ${request.operationName}`,
      );

      this.executeWithSlot(request.fn, request.operationName)
        .then(request.resolve)
        .catch(request.reject);
    }
  }

  getStats() {
    return {
      name: this.name,
      maxConcurrent: this.maxConcurrent,
      currentConcurrent: this.currentConcurrent,
      queueLength: this.queue.length,
      queueSize: this.queueSize,
      ...this.stats,
    };
  }

  // Reset (dùng để test)
  reset() {
    this.currentConcurrent = 0;
    this.queue.forEach((req) => clearTimeout(req.timeout));
    this.queue = [];
    console.log(`[Bulkhead:${this.name}] 🔄 Bulkhead đã được reset`);
  }
}

/**
 * ====================================================================
 * BULKHEAD MANAGER - Quản lý nhiều Bulkhead
 * ====================================================================
 * Tạo và quản lý bulkhead cho từng service riêng biệt
 */
class BulkheadManager {
  constructor() {
    this.bulkheads = new Map();
  }

  /**
   * Lấy hoặc tạo bulkhead cho service
   */
  getBulkhead(name, options = {}) {
    if (!this.bulkheads.has(name)) {
      this.bulkheads.set(name, new Bulkhead({ name, ...options }));
      console.log(`[BulkheadManager] ✨ Tạo bulkhead mới: ${name}`);
    }
    return this.bulkheads.get(name);
  }

  getAllStats() {
    const stats = {};
    this.bulkheads.forEach((bulkhead, name) => {
      stats[name] = bulkhead.getStats();
    });
    return stats;
  }
}

module.exports = { Bulkhead, BulkheadManager };
