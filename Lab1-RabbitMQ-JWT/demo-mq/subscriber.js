// subscriber.js
const amqp = require('amqplib');

async function subscribe() {
    const exchangeName = 'thong_bao_chung';

    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();

        // 1. Đảm bảo Exchange tồn tại
        await channel.assertExchange(exchangeName, 'fanout', { durable: false });

        // 2. Tạo một hàng đợi tạm thời ngẫu nhiên (khi tắt code, queue tự hủy)
        // exclusive: true -> Chỉ kết nối này dùng queue này
        const q = await channel.assertQueue('', { exclusive: true });
        
        console.log(`[*] Đã kết nối. Tên Queue riêng của tôi là: ${q.queue}`);
        console.log(" [*] Đang chờ tin nhắn...");

        // 3. Ràng buộc (Binding) hàng đợi này vào Exchange
        // "Nối dây từ loa phường vào nhà tôi"
        await channel.bindQueue(q.queue, exchangeName, '');

        // 4. Lắng nghe
        channel.consume(q.queue, (msg) => {
            if (msg.content) {
                console.log(`[Nhận tin]: ${msg.content.toString()}`);
            }
        }, { noAck: true }); // Pub/Sub thường không cần xác nhận kỹ như Task Queue

    } catch (error) {
        console.error(error);
    }
}

subscribe();