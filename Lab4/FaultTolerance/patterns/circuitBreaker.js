/**
 * ====================================================================
 * CIRCUIT BREAKER PATTERN
 * ====================================================================
 *
 * 📚 KHÁI NIỆM:
 * Circuit Breaker hoạt động như cầu dao điện trong nhà.
 * Khi phát hiện service liên tục lỗi, nó "ngắt mạch" để:
 * - Ngăn cascade failure (lỗi lan truyền)
 * - Cho service thời gian phục hồi
 * - Trả về lỗi ngay lập tức thay vì chờ timeout
 *
 * 🔄 3 TRẠNG THÁI:
 *
 * ┌─────────┐    Lỗi vượt ngưỡng    ┌──────────┐
 * │ CLOSED  │ ───────────────────► │   OPEN   │
 * │(Bình    │                       │(Ngắt     │
 * │thường)  │                       │mạch)     │
 * └─────────┘                       └────┬─────┘
 *      ▲                                 │
 *      │ Thử thành công            Sau timeout
 *      │                                 │
 * ┌────┴─────────────────────────────────▼─────┐
 * │              HALF-OPEN                     │
 * │        (Thử nghiệm phục hồi)               │
 * └────────────────────────────────────────────┘
 *
 * 🎯 KHI NÀO DÙNG:
 * - Gọi external service có thể down
 * - Muốn fail-fast thay vì chờ timeout
 * - Bảo vệ resource (thread pool, connections)
 *
 * ⚙️ CẤU HÌNH QUAN TRỌNG:
 * - failureThreshold: Số lỗi liên tiếp để mở circuit
 * - resetTimeout: Thời gian chờ trước khi thử lại
 * - halfOpenRequests: Số request test khi half-open
 */

class CircuitBreaker {
  // Các trạng thái của Circuit Breaker
  static STATES = {
    CLOSED: "CLOSED", // Bình thường, cho phép request
    OPEN: "OPEN", // Đã ngắt mạch, từ chối request
    HALF_OPEN: "HALF_OPEN", // Đang thử nghiệm phục hồi
  };

  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5; // 5 lỗi liên tiếp
    this.resetTimeout = options.resetTimeout || 30000; // 30 giây
    this.halfOpenRequests = options.halfOpenRequests || 3; // 3 request test

    // Trạng thái hiện tại
    this.state = CircuitBreaker.STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;

    // Thống kê
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0, // Bị từ chối vì circuit OPEN
      stateChanges: [],
    };
  }

  /**
   * Thực thi function với Circuit Breaker protection
   */
  async execute(fn, operationName = "Operation") {
    this.stats.totalRequests++;

    // Kiểm tra và cập nhật trạng thái
    this.evaluateState();

    // Nếu circuit đang OPEN, từ chối ngay
    if (this.state === CircuitBreaker.STATES.OPEN) {
      this.stats.rejectedRequests++;
      const error = new Error(
        `Circuit Breaker OPEN - ${operationName} bị từ chối`,
      );
      error.code = "CIRCUIT_OPEN";
      console.log(
        `[CircuitBreaker] 🚫 ${operationName} - Circuit đang OPEN, từ chối request!`,
      );
      throw error;
    }

    try {
      console.log(
        `[CircuitBreaker] 🔌 ${operationName} - State: ${this.state}`,
      );

      const result = await fn();

      this.onSuccess();
      this.stats.successfulRequests++;
      console.log(`[CircuitBreaker] ✅ ${operationName} - Thành công`);

      return result;
    } catch (error) {
      this.onFailure();
      this.stats.failedRequests++;
      console.log(
        `[CircuitBreaker] ❌ ${operationName} - Thất bại: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Đánh giá và cập nhật trạng thái
   */
  evaluateState() {
    if (this.state === CircuitBreaker.STATES.OPEN) {
      // Kiểm tra xem đã đủ thời gian để thử lại chưa
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;

      if (timeSinceLastFailure >= this.resetTimeout) {
        this.changeState(CircuitBreaker.STATES.HALF_OPEN);
        this.halfOpenAttempts = 0;
        console.log(
          `[CircuitBreaker] 🔄 Chuyển sang HALF-OPEN sau ${this.resetTimeout}ms`,
        );
      }
    }
  }

  /**
   * Xử lý khi request thành công
   */
  onSuccess() {
    if (this.state === CircuitBreaker.STATES.HALF_OPEN) {
      this.successCount++;
      this.halfOpenAttempts++;

      // Nếu đủ số request thành công, đóng circuit
      if (this.successCount >= this.halfOpenRequests) {
        this.changeState(CircuitBreaker.STATES.CLOSED);
        this.resetCounts();
        console.log(`[CircuitBreaker] ✅ Service phục hồi, đóng circuit!`);
      }
    } else {
      this.failureCount = 0; // Reset failure count on success
    }
  }

  /**
   * Xử lý khi request thất bại
   */
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreaker.STATES.HALF_OPEN) {
      // Lỗi trong HALF-OPEN → quay lại OPEN
      this.changeState(CircuitBreaker.STATES.OPEN);
      console.log(`[CircuitBreaker] ❌ Lỗi trong HALF-OPEN, mở lại circuit!`);
    } else if (this.failureCount >= this.failureThreshold) {
      // Vượt ngưỡng lỗi → mở circuit
      this.changeState(CircuitBreaker.STATES.OPEN);
      console.log(
        `[CircuitBreaker] 🔴 Đạt ${this.failureThreshold} lỗi liên tiếp, MỞ circuit!`,
      );
    }
  }

  /**
   * Thay đổi trạng thái và ghi log
   */
  changeState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.stats.stateChanges.push({
      from: oldState,
      to: newState,
      timestamp: new Date().toISOString(),
    });
  }

  resetCounts() {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
  }

  getState() {
    return this.state;
  }

  getStats() {
    return {
      currentState: this.state,
      failureCount: this.failureCount,
      ...this.stats,
    };
  }

  // Force reset circuit (dùng để test)
  reset() {
    this.state = CircuitBreaker.STATES.CLOSED;
    this.resetCounts();
    console.log(`[CircuitBreaker] 🔄 Circuit đã được reset về CLOSED`);
  }
}

module.exports = CircuitBreaker;
