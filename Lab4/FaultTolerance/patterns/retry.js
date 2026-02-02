/**
 * ====================================================================
 * RETRY PATTERN
 * ====================================================================
 *
 * 📚 KHÁI NIỆM:
 * Retry Pattern tự động thử lại một operation khi nó fail.
 * Dùng cho các lỗi TẠM THỜI (transient errors) như:
 * - Network timeout
 * - Service tạm thời quá tải
 * - Database connection bị ngắt tạm thời
 *
 * 🎯 KHI NÀO DÙNG:
 * - Lỗi có thể tự khắc phục sau một thời gian ngắn
 * - Không dùng cho lỗi LOGIC (ví dụ: 400 Bad Request)
 *
 * ⚙️ CẤU HÌNH QUAN TRỌNG:
 * - maxRetries: Số lần thử lại tối đa
 * - delay: Thời gian chờ giữa các lần thử
 * - backoffMultiplier: Hệ số tăng delay (Exponential Backoff)
 *
 * 📊 EXPONENTIAL BACKOFF:
 * Lần 1: delay = 1000ms
 * Lần 2: delay = 1000ms * 2 = 2000ms
 * Lần 3: delay = 2000ms * 2 = 4000ms
 * → Giảm áp lực lên service đang gặp vấn đề
 */

class RetryPattern {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.delay = options.delay || 1000; // 1 giây
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.maxDelay = options.maxDelay || 10000; // Tối đa 10 giây

    // Thống kê
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedAfterRetries: 0,
    };
  }

  /**
   * Thực thi function với retry logic
   * @param {Function} fn - Async function cần thực thi
   * @param {string} operationName - Tên operation (để log)
   */
  async execute(fn, operationName = "Operation") {
    let lastError;
    let currentDelay = this.delay;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      this.stats.totalAttempts++;

      try {
        console.log(
          `[Retry] 🔄 ${operationName} - Lần thử ${attempt}/${this.maxRetries + 1}`,
        );

        const result = await fn();

        if (attempt > 1) {
          this.stats.successfulRetries++;
          console.log(
            `[Retry] ✅ ${operationName} - Thành công sau ${attempt} lần thử!`,
          );
        }

        return result;
      } catch (error) {
        lastError = error;
        console.log(
          `[Retry] ❌ ${operationName} - Lần ${attempt} thất bại: ${error.message}`,
        );

        // Nếu đã hết số lần retry
        if (attempt > this.maxRetries) {
          this.stats.failedAfterRetries++;
          console.log(
            `[Retry] 💀 ${operationName} - Đã thử ${this.maxRetries + 1} lần, bỏ cuộc!`,
          );
          throw error;
        }

        // Chờ trước khi retry (Exponential Backoff)
        console.log(`[Retry] ⏳ Chờ ${currentDelay}ms trước khi thử lại...`);
        await this.sleep(currentDelay);

        // Tăng delay cho lần tiếp theo
        currentDelay = Math.min(
          currentDelay * this.backoffMultiplier,
          this.maxDelay,
        );
      }
    }

    throw lastError;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.totalAttempts > 0
          ? (
              ((this.stats.totalAttempts - this.stats.failedAfterRetries) /
                this.stats.totalAttempts) *
              100
            ).toFixed(2) + "%"
          : "N/A",
    };
  }

  resetStats() {
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedAfterRetries: 0,
    };
  }
}

module.exports = RetryPattern;
