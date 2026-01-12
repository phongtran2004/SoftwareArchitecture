// publisher.js
const amqp = require('amqplib');

async function broadcast() {
    const exchangeName = 'thong_bao_chung'; // Tên kênh phát thanh
    const msg = process.argv.slice(2).join(' ') || 'Thông báo khẩn cấp!';

    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();

        // 1. Tạo Exchange loại 'fanout' (Phát tán)
        await channel.assertExchange(exchangeName, 'fanout', { durable: false });

        // 2. Gửi tin vào Exchange (Tham số thứ 2 là routing key, fanout không cần nên để rỗng)
        channel.publish(exchangeName, '', Buffer.from(msg));
        
        console.log(`[Loa Phường] Đã phát tin: '${msg}'`);

        setTimeout(() => {
            connection.close();
            process.exit(0);
        }, 500);
    } catch (error) {
        console.error(error);
    }
}

broadcast();