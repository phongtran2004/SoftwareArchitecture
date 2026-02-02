/**
 * ====================================================================
 * RATE LIMITER PATTERN
 * ====================================================================
 *
 * 📚 KHÁI NIỆM:
 * Rate Limiter giới hạn số lượng request trong một khoảng thời gian.
 * Bảo vệ service khỏi bị quá tải (overload) và DDoS.
 *
 * 🎯 MỤC ĐÍCH:
 * - Bảo vệ resource của hệ thống
 * - Đảm bảo công bằng giữa các client
 * - Ngăn chặn abuse/spam
 * - Kiểm soát chi phí (với API tính tiền)
 *
 * 📊 CÁC THUẬT TOÁN PHỔ BIẾN:
 *
 * 1. FIXED WINDOW (Cửa sổ cố định):
 *    ┌─────────────┬─────────────┐
 *    │ 0-60s: 100  │ 60-120s: 100│
 *    │   requests  │   requests  │
 *    └─────────────┴─────────────┘
 *    Đơn giản nhưng có vấn đề ở biên cửa sổ
 *
 * 2. SLIDING WINDOW (Cửa sổ trượt) - ĐÃ IMPLEMENT:
 *    Mỗi request được tính trong window trượt
 *    Chính xác hơn Fixed Window
 *
 * 3. TOKEN BUCKET:
 *    Tokens được thêm vào bucket theo thời gian
 *    Mỗi request tiêu thụ 1 token
 *    Cho phép burst traffic ngắn
 *
 * ⚙️ CẤU HÌNH:
 * - maxRequests: Số request tối đa trong window
 * - windowMs: Kích thước window (milliseconds)
 */

class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 10; // 10 requests
    this.windowMs = options.windowMs || 60000; // trong 1 phút

    // Lưu timestamps của các request (Sliding Window)
    this.requests = [];

    // Thống kê
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      rejectedRequests: 0,
    };
  }

  /**
   * Kiểm tra xem request có được phép không
   * @returns {boolean} true nếu được phép, false nếu bị limit
   */
  tryAcquire() {
    const now = Date.now();
    this.stats.totalRequests++;

    // Xóa các request cũ ngoài window
    this.cleanupOldRequests(now);

    // Kiểm tra còn quota không
    if (this.requests.length >= this.maxRequests) {
      this.stats.rejectedRequests++;
      return false;
    }

    // Thêm request mới
    this.requests.push(now);
    this.stats.allowedRequests++;
    return true;
  }

  /**
   * Thực thi function với Rate Limiter protection
   */
  async execute(fn, operationName = "Operation") {
    const allowed = this.tryAcquire();

    if (!allowed) {
      const error = new Error(`Rate limit exceeded - ${operationName}`);
      error.code = "RATE_LIMITED";
      error.retryAfter = this.getRetryAfter();

      console.log(
        `[RateLimiter] 🚫 ${operationName} - Bị từ chối! Đã đạt ${this.maxRequests} requests/${this.windowMs}ms`,
      );
      console.log(`[RateLimiter] ⏳ Retry after: ${error.retryAfter}ms`);

      throw error;
    }

    console.log(
      `[RateLimiter] ✅ ${operationName} - Cho phép (${this.requests.length}/${this.maxRequests})`,
    );
    return await fn();
  }

  /**
   * Xóa các request cũ ngoài window
   */
  cleanupOldRequests(now) {
    const windowStart = now - this.windowMs;
    this.requests = this.requests.filter(
      (timestamp) => timestamp > windowStart,
    );
  }

  /**
   * Tính thời gian còn lại trước khi có thể request tiếp
   */
  getRetryAfter() {
    if (this.requests.length === 0) return 0;

    const oldestRequest = Math.min(...this.requests);
    const retryAfter = oldestRequest + this.windowMs - Date.now();
    return Math.max(0, retryAfter);
  }

  /**
   * Lấy số request còn lại trong window hiện tại
   */
  getRemainingRequests() {
    this.cleanupOldRequests(Date.now());
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  getStats() {
    return {
      ...this.stats,
      currentWindowUsage: this.requests.length,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      remainingRequests: this.getRemainingRequests(),
    };
  }

  // Reset (dùng để test)
  reset() {
    this.requests = [];
    console.log(`[RateLimiter] 🔄 Rate limiter đã được reset`);
  }
}

/**
 * ====================================================================
 * TOKEN BUCKET - Biến thể khác của Rate Limiter
 * ====================================================================
 * Cho phép burst traffic ngắn hạn
 */
class TokenBucket {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 10; // Số token tối đa
    this.refillRate = options.refillRate || 1; // Token được thêm mỗi giây
    this.tokens = this.maxTokens; // Bắt đầu với bucket đầy
    this.lastRefill = Date.now();
  }

  tryAcquire(tokens = 1) {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      console.log(
        `[TokenBucket] ✅ Consumed ${tokens} token(s). Remaining: ${this.tokens.toFixed(2)}`,
      );
      return true;
    }

    console.log(
      `[TokenBucket] 🚫 Not enough tokens. Need: ${tokens}, Have: ${this.tokens.toFixed(2)}`,
    );
    return false;
  }

  refill() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // Giây
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getTokens() {
    this.refill();
    return this.tokens;
  }
}

module.exports = { RateLimiter, TokenBucket };
