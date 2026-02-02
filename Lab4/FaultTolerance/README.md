# Fault Tolerance Demo - Resilience Patterns

## 📚 Giới thiệu

Demo này minh họa 4 patterns Fault Tolerance quan trọng trong kiến trúc Microservices:

1. **Retry Pattern** - Tự động thử lại khi gặp lỗi
2. **Circuit Breaker Pattern** - Ngắt mạch khi service lỗi liên tục
3. **Rate Limiter Pattern** - Giới hạn số request từ client
4. **Bulkhead Pattern** - Cô lập tài nguyên giữa các services

## 🏗️ Kiến trúc

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT                                    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ORDER SERVICE (Port 3000)                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    FAULT TOLERANCE LAYERS                      │ │
│  │                                                                │ │
│  │  ┌─────────────┐  ┌───────────────┐  ┌─────────┐  ┌─────────┐ │ │
│  │  │ Rate Limiter│──│   Bulkhead   │──│ Circuit │──│  Retry  │ │ │
│  │  │  (10/min)   │  │(5 concurrent)│  │ Breaker │  │(3 tries)│ │ │
│  │  └─────────────┘  └───────────────┘  └─────────┘  └─────────┘ │ │
│  └────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   PRODUCT SERVICE (Port 3001)                       │
│                   (Có thể simulate failures)                        │
└─────────────────────────────────────────────────────────────────────┘
```

## 🚀 Cách chạy

### Bước 1: Cài đặt dependencies

```bash
cd FaultTolerance
npm install
```

### Bước 2: Chạy Product Service (Terminal 1)

```bash
npm run start:product
```

### Bước 3: Chạy Order Service (Terminal 2)

```bash
npm run start:order
```

### Bước 4: Chạy Demo Script (Terminal 3)

```bash
npm run demo
```

## 📖 Giải thích chi tiết từng Pattern

---

### 1️⃣ RETRY PATTERN

#### Khái niệm

Tự động thử lại một operation khi nó fail. Dùng cho các lỗi **TẠM THỜI** (transient errors).

#### Khi nào dùng?

- Network timeout
- Service tạm thời quá tải
- Database connection bị ngắt tạm thời

#### Khi nào KHÔNG dùng?

- Lỗi logic (400 Bad Request, 401 Unauthorized)
- Lỗi validation
- Lỗi nghiệp vụ

#### Cấu hình trong code

```javascript
const retry = new RetryPattern({
  maxRetries: 3, // Tối đa 3 lần thử lại
  delay: 1000, // Chờ 1 giây
  backoffMultiplier: 2, // Exponential backoff: 1s → 2s → 4s
  maxDelay: 10000, // Tối đa 10 giây
});
```

#### Exponential Backoff là gì?

```
Lần 1 fail → Chờ 1 giây
Lần 2 fail → Chờ 2 giây  (1 × 2)
Lần 3 fail → Chờ 4 giây  (2 × 2)
Lần 4 fail → BỎ CUỘC
```

**Tại sao dùng Exponential Backoff?**

- Giảm áp lực lên service đang gặp vấn đề
- Cho service thời gian phục hồi
- Tránh "thundering herd" khi nhiều client retry cùng lúc

---

### 2️⃣ CIRCUIT BREAKER PATTERN

#### Khái niệm

Hoạt động như **cầu dao điện**. Khi phát hiện service liên tục lỗi:

- Ngắt mạch (OPEN) để ngăn cascade failure
- Cho service thời gian phục hồi
- Trả về lỗi ngay thay vì chờ timeout

#### 3 Trạng thái

```
┌─────────┐    Lỗi vượt ngưỡng    ┌──────────┐
│ CLOSED  │ ───────────────────► │   OPEN   │
│(Bình    │                       │(Từ chối  │
│thường)  │                       │ request) │
└─────────┘                       └────┬─────┘
      ▲                                 │
      │ Test thành công           Sau timeout
      │                                 │
┌─────┴─────────────────────────────────▼─────┐
│               HALF-OPEN                      │
│      (Cho phép vài request để test)          │
└──────────────────────────────────────────────┘
```

#### Cấu hình trong code

```javascript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5, // Mở circuit sau 5 lỗi liên tiếp
  resetTimeout: 30000, // Thử lại sau 30 giây
  halfOpenRequests: 3, // 3 request test thành công để đóng
});
```

#### Ví dụ thực tế

```
Request 1: ❌ Fail (count: 1)
Request 2: ❌ Fail (count: 2)
Request 3: ❌ Fail (count: 3)
Request 4: ❌ Fail (count: 4)
Request 5: ❌ Fail (count: 5) → 🔴 CIRCUIT OPEN!

Request 6: 🚫 REJECTED (không gọi service, fail ngay)
Request 7: 🚫 REJECTED
...
(Sau 30 giây)

Request N: 🟡 HALF-OPEN → Gọi service để test
  ├─ Thành công → 🟢 CLOSED (hoạt động bình thường)
  └─ Thất bại   → 🔴 OPEN (tiếp tục đợi)
```

---

### 3️⃣ RATE LIMITER PATTERN

#### Khái niệm

Giới hạn số lượng request trong một khoảng thời gian. Bảo vệ hệ thống khỏi:

- Quá tải (overload)
- DDoS attacks
- Abuse/spam từ client

#### Các thuật toán

| Thuật toán     | Mô tả                            | Ưu điểm        | Nhược điểm          |
| -------------- | -------------------------------- | -------------- | ------------------- |
| Fixed Window   | Đếm request trong window cố định | Đơn giản       | Spike ở biên window |
| Sliding Window | Window trượt theo thời gian      | Chính xác      | Tốn bộ nhớ hơn      |
| Token Bucket   | Tokens được thêm theo thời gian  | Cho phép burst | Phức tạp hơn        |

#### Cấu hình trong code (Sliding Window)

```javascript
const rateLimiter = new RateLimiter({
  maxRequests: 10, // Tối đa 10 requests
  windowMs: 60000, // trong 1 phút
});
```

#### HTTP Headers

```
X-RateLimit-Limit: 10        // Giới hạn
X-RateLimit-Remaining: 7     // Còn lại
Retry-After: 45              // Thử lại sau X giây (khi bị limit)
```

---

### 4️⃣ BULKHEAD PATTERN

#### Khái niệm

Tên lấy từ **các ngăn kín nước trên tàu thủy**. Khi một ngăn bị thủng, các ngăn khác vẫn an toàn.

**Trong phần mềm:** Cô lập tài nguyên giữa các service để một service lỗi không ảnh hưởng service khác.

#### Minh họa

```
                    KHÔNG CÓ BULKHEAD
┌─────────────────────────────────────────────┐
│           Shared Thread Pool (20)           │
│  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐ │
│  │ P │ P │ P │ P │ P │ P │ P │ P │ P │ P │ │ ← Product Service chậm
│  └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘ │   chiếm hết threads!
│  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐ │
│  │ P │ P │ P │ P │ P │ P │ P │ P │ P │ P │ │
│  └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘ │
│  Payment Service: 🚫 KHÔNG CÒN THREAD!      │
└─────────────────────────────────────────────┘

                    CÓ BULKHEAD
┌─────────────────────────────────────────────┐
│  Product Service Bulkhead (10)              │
│  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐ │
│  │ P │ P │ P │ P │ P │ P │ P │ P │ P │ P │ │ ← Tối đa 10
│  └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘ │
├─────────────────────────────────────────────┤
│  Payment Service Bulkhead (5)               │
│  ┌───┬───┬───┬───┬───┐                     │
│  │ $ │ $ │ $ │ $ │ $ │ ← Vẫn có 5 slots!   │
│  └───┴───┴───┴───┴───┘                     │
└─────────────────────────────────────────────┘
```

#### Cấu hình trong code

```javascript
const productBulkhead = new Bulkhead({
  name: "product-service",
  maxConcurrent: 5, // Tối đa 5 requests đồng thời
  maxWait: 3000, // Chờ tối đa 3 giây
  queueSize: 10, // Queue tối đa 10 requests
});
```

---

## 🔄 Thứ tự áp dụng các Patterns

Khi gọi từ Order Service → Product Service:

```
Client Request
      │
      ▼
┌─────────────┐
│ Rate Limiter│ → Bị reject nếu vượt 10 req/min
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Bulkhead   │ → Bị reject nếu đã có 5 concurrent calls
└──────┬──────┘
       │
       ▼
┌─────────────┐
│Circuit      │ → Bị reject ngay nếu circuit đang OPEN
│Breaker      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Retry     │ → Tự động retry nếu fail (tối đa 3 lần)
└──────┬──────┘
       │
       ▼
  HTTP Call
  to Product
  Service
```

---

## 🧪 Test thủ công với cURL

### Test Retry + Circuit Breaker

```bash
# Bật 100% failure
curl -X POST http://localhost:3001/api/config -H "Content-Type: application/json" -d "{\"failureRate\": 1.0}"

# Gửi request (sẽ thấy retry rồi circuit open)
curl -X POST http://localhost:3000/api/orders -H "Content-Type: application/json" -d "{\"productId\": \"P1\", \"quantity\": 1}"
```

### Test Rate Limiter

```bash
# Gửi 15 requests liên tiếp
for i in {1..15}; do curl -s http://localhost:3000/api/products/1 | head -c 50; echo; done
```

### Xem thống kê

```bash
curl http://localhost:3000/stats | jq
```

---

## 📊 So sánh với Resilience4J (Java)

| Feature         | Demo này (Node.js)       | Resilience4J (Java)        |
| --------------- | ------------------------ | -------------------------- |
| Retry           | ✅ Custom implementation | ✅ @Retry annotation       |
| Circuit Breaker | ✅ Custom implementation | ✅ @CircuitBreaker         |
| Rate Limiter    | ✅ Sliding Window        | ✅ Multiple algorithms     |
| Bulkhead        | ✅ Semaphore-based       | ✅ Thread Pool + Semaphore |
| Metrics         | ✅ Basic stats           | ✅ Micrometer integration  |
| Config          | ✅ Code-based            | ✅ YAML + Code             |

---

## 🎓 Giải thích cho thầy

### Tại sao cần Fault Tolerance?

Trong kiến trúc Microservices:

- Services phụ thuộc lẫn nhau qua network
- Network không đáng tin cậy (unreliable)
- Services có thể fail bất cứ lúc nào

**Không có Fault Tolerance:**

```
Order Service → Product Service (down)
      ↓
   TIMEOUT (30 giây)
      ↓
   User chờ rất lâu
      ↓
   Cascade failure (Order Service cũng hết resource)
```

**Có Fault Tolerance:**

```
Order Service → Product Service (down)
      ↓
   Circuit Breaker: OPEN
      ↓
   Fail ngay lập tức (<1 giây)
      ↓
   User nhận thông báo lỗi
      ↓
   Order Service vẫn khỏe mạnh
```

### 4 Patterns bổ trợ nhau như thế nào?

| Pattern         | Bảo vệ khỏi                        | Phối hợp với    |
| --------------- | ---------------------------------- | --------------- |
| Retry           | Lỗi tạm thời                       | Circuit Breaker |
| Circuit Breaker | Service down liên tục              | Retry, Bulkhead |
| Rate Limiter    | Quá tải từ client                  | Tất cả          |
| Bulkhead        | Một service ảnh hưởng service khác | Circuit Breaker |

---

## 📁 Cấu trúc thư mục

```
FaultTolerance/
├── package.json
├── README.md
├── demo.js                    # Script demo tất cả patterns
├── patterns/
│   ├── retry.js              # Retry Pattern implementation
│   ├── circuitBreaker.js     # Circuit Breaker implementation
│   ├── rateLimiter.js        # Rate Limiter implementation
│   └── bulkhead.js           # Bulkhead implementation
└── services/
    ├── orderService.js       # Service A - Consumer
    └── productService.js     # Service B - Provider (có thể simulate failure)
```
