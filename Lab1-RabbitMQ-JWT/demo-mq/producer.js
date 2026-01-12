// producer.js - Gửi tin nhắn
const amqp = require('amqplib');

async function sendChat() {
    const queueName = 'mon_kien_truc'; // Tên hàng đợi
    const msg = process.argv.slice(2).join(' ') || 'Hello RabbitMQ';

    try {
        // 1. Kết nối đến Server (Port 5672)
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();

        // 2. Tạo hàng đợi (nếu chưa có)
        // durable: false nghĩa là nếu tắt RabbitMQ đi thì mất hàng đợi này (demo cho nhanh)
        await channel.assertQueue(queueName, { durable: false });

        // 3. Gửi tin nhắn
        // RabbitMQ gửi dữ liệu dạng Buffer (Byte)
        channel.sendToQueue(queueName, Buffer.from(msg));
        console.log(`[-->] Đã gửi: '${msg}'`);

        // 4. Đóng kết nối sau 0.5s
        setTimeout(() => {
            connection.close();
            process.exit(0);
        }, 500);
    } catch (error) {
        console.error("Lỗi:", error);
    }
}

sendChat();