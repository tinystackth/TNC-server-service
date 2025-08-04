require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            ssl: true,
            tlsInsecure: true // ช่วย Bypass TLS error ที่คุณเจอ
        });
        console.log('✅ Cloud DB Connected');
    } catch (err) {
        console.error('❌ Database connection error:', err);
    }
};

module.exports = connectDB;
