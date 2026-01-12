// consumer.js - Nhận tin nhắn
const amqp = require('amqplib');

async function receiveChat() {
    const queueName = 'mon_kien_truc';

    try {
        // 1. Kết nối
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();

        // 2. Khai báo hàng đợi (phải giống tên bên producer)
        await channel.assertQueue(queueName, { durable: false });

        console.log(`[*] Đang chờ tin nhắn từ hàng đợi: ${queueName}...`);

        // 3. Lắng nghe
        channel.consume(queueName, (msg) => {
            if (msg !== null) {
                console.log(`[<--] Nhận được: ${msg.content.toString()}`);
                // Xác nhận đã xử lý xong (ACK) để RabbitMQ xóa tin khỏi hàng đợi
                channel.ack(msg);
            }
        });
    } catch (error) {
        console.error("Lỗi:", error);
    }
}

receiveChat();