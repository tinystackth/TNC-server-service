// server.js
require('dotenv').config(); // โหลดตัวแปรจาก .env ไฟล์

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const { ParseServer } = require('parse-server');
const ParseDashboard = require('parse-dashboard');
const { readdirSync, existsSync } = require('fs');
const mongoose = require('mongoose');

const app = express();

// ตั้งค่ามิดเดิลแวร์พื้นฐาน
app.use(morgan('dev'));
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// แสดงค่า MONGO_URI ว่าโหลดได้ไหม (ไม่แสดงใน production)
if (process.env.NODE_ENV !== 'production') {
  console.log('MONGO_URI:', process.env.MONGO_URI);
}

// ทดสอบการเชื่อมต่อ MongoDB ก่อน
async function testMongoConnection() {
  try {
    console.log('🔄 Testing MongoDB connection...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected successfully');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    return false;
  }
}

// เพิ่ม health check route
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    server: 'Parse Server',
    port: process.env.PORT || 5000
  });
});

// ตั้งค่า port จาก .env หรือใช้ 5000 เป็นค่าเริ่มต้น
const port = process.env.PORT || 5000;

// เริ่ม server พร้อมสร้าง Parse Server แบบใหม่
async function startServer() {
  try {
    // ทดสอบ MongoDB connection ก่อน
    const mongoConnected = await testMongoConnection();
    
    if (!mongoConnected) {
      throw new Error('MongoDB connection failed - cannot start Parse Server');
    }
    
    console.log('⏳ Waiting for MongoDB to be ready...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔧 Creating Parse Server with minimal config...');
    
    // สร้าง Parse Server config ที่เรียบง่าย
    const parseServerConfig = {
      databaseURI: process.env.MONGO_URI,
      appId: process.env.APP_ID || 'myAppId',
      masterKey: process.env.MASTER_KEY || 'myMasterKey',
      serverURL: process.env.SERVER_URL || `http://localhost:${port}/parse`,

      // เพิ่มบรรทัดนี้เพื่อ allow ทุก IP
      masterKeyIps: ['0.0.0.0/0', '::/0'],  // ← เพิ่มบรรทัดนี้
      
      // เพิ่ม config เพื่อลด warnings
      logLevel: 'info',
      encodeParseObjectInCloudFunction: true,
      enableInsecureAuthAdapters: false,
      
      // ปิด deprecated features
      pages: {
        enableRouter: false
      }
    };
    
    console.log('📝 Parse Server config:', JSON.stringify(parseServerConfig, null, 2));
    
    // สร้าง Parse Server instance
    const parseServer = new ParseServer(parseServerConfig);
    
    console.log('✅ Parse Server instance created');
    console.log('⏳ Starting Parse Server...');
    
    // เริ่ม Parse Server และรอให้พร้อม
    try {
      await parseServer.start();
      console.log('🔧 Parse Server started successfully');
    } catch (startError) {
      console.log('⚠️  Parse Server start() not supported, using fallback...');
      // Fallback: รอ 5 วินาที
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('🔧 Using fallback initialization delay');
    }
    
    // เพิ่ม Parse Server middleware
    console.log('🔌 Adding Parse Server middleware to /parse...');
    app.use('/parse', parseServer.app);
    console.log('✅ Parse Server middleware added successfully');
    
    // โหลด API routes หลัง Parse Server
    console.log('🔧 Loading API routes...');
    if (existsSync('./Routes')) {
      try {
        readdirSync('./Routes').forEach((r) => {
          console.log(`Loading route: ${r}`);
          app.use('/api', require('./Routes/' + r));
        });
        console.log('✅ All routes loaded successfully');
      } catch (error) {
        console.error('❌ Error loading routes:', error.message);
        console.error('Full error:', error);
      }
    } else {
      console.log('⚠️  Routes directory not found, skipping route loading');
    }
    
    // เพิ่ม Parse Dashboard
    if (process.env.NODE_ENV !== 'test') {
      console.log('📊 Setting up Parse Dashboard...');
      
      const dashboardConfig = {
        apps: [
          {
            serverURL: process.env.SERVER_URL || `http://localhost:${port}/parse`,
            appId: process.env.APP_ID || 'myAppId',
            masterKey: process.env.MASTER_KEY || 'myMasterKey',
            appName: process.env.NODE_ENV === 'production' ? 'TinyCare Production' : 'TinyCare Development'
          }
        ],
        users: [
          {
            user: process.env.DASHBOARD_USER || 'admin',
            pass: process.env.DASHBOARD_PASS || 'admin123'
          }
        ],
        useEncryptedPasswords: false,
        trustProxy: 1
      };
      
      const dashboard = new ParseDashboard(dashboardConfig, {
        allowInsecureHTTP: process.env.NODE_ENV !== 'production',
        cookieSessionSecret: process.env.COOKIE_SECRET || 'tinycareSecretKey123',
      });
      
      // Mount dashboard ที่ /dashboard path
      app.use('/dashboard', dashboard);
      console.log('✅ Parse Dashboard added successfully');
      console.log(`📊 Dashboard available at: http://localhost:${port}/dashboard`);
    }
    
    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error('🚨 Server Error:', err);
      res.status(500).json({ 
        error: 'Internal Server Error', 
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    });

    // 404 handler (ต้องอยู่สุดท้าย)
    app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Route not found', 
        path: req.originalUrl 
      });
    });
    
    // เริ่ม HTTP server
    const server = app.listen(port, () => {
      console.log(`🚀 Server is Running on port ${port}`);
      console.log(`📍 Server URL: http://localhost:${port}`);
      console.log(`🔧 Parse Server URL: http://localhost:${port}/parse`);
      console.log(`📊 Parse Dashboard URL: http://localhost:${port}/dashboard`);
      console.log(`💚 Health Check: http://localhost:${port}/health`);
      console.log(`🔗 API Base URL: http://localhost:${port}/api`);
      
      if (process.env.NODE_ENV === 'production') {
        console.log('🌐 Production URLs:');
        console.log(`   Parse Server: ${process.env.SERVER_URL || 'Not set'}`);
        console.log(`   Dashboard: ${process.env.SERVER_URL ? process.env.SERVER_URL.replace('/parse', '/dashboard') : 'Not set'}`);
      }
      
      // รอให้ Parse Server พร้อมจริงๆ ก่อนทดสอบ
      setTimeout(async () => {
        const isReady = await waitForParseServer(port);
        if (isReady) {
          await testParseEndpoints(port);
        }
      }, 3000);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🔄 SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('👋 Server closed');
        mongoose.connection.close();
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('💥 Failed to start server:', error.message);
    console.error('🔍 Full error:', error);
    process.exit(1);
  }
}

// ฟังก์ชันรอให้ Parse Server พร้อม
async function waitForParseServer(port, maxAttempts = 20) {
  console.log('🔍 Waiting for Parse Server to be ready...');
  
  const axios = require('axios');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(`http://localhost:${port}/parse/serverInfo`, {
        headers: {
          'X-Parse-Application-Id': process.env.APP_ID || 'myAppId',
          'X-Parse-Master-Key': process.env.MASTER_KEY || 'myMasterKey'
        },
        timeout: 3000,
        validateStatus: () => true
      });
      
      if (response.status === 200) {
        console.log(`✅ Parse Server is ready! (attempt ${attempt}/${maxAttempts})`);
        return true;
      } else if (response.status === 500 && response.data.error?.includes('initialized')) {
        console.log(`⏳ Parse Server still initializing... (attempt ${attempt}/${maxAttempts})`);
      } else {
        console.log(`⚠️  Unexpected response: ${response.status} (attempt ${attempt}/${maxAttempts})`);
      }
    } catch (error) {
      console.log(`🔄 Connection attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
    }
    
    // รอ 2 วินาทีก่อนลองใหม่
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('❌ Parse Server did not become ready within expected time');
  return false;
}

async function testParseEndpoints(port) {
  try {
    console.log('\n🧪 Testing Parse Server endpoints...');
    
    const axios = require('axios');
    const baseURL = `http://localhost:${port}`;
    
    // Test 1: Basic Parse endpoint
    console.log('1️⃣ Testing basic Parse endpoint...');
    const parseResponse = await axios.get(`${baseURL}/parse`, {
      validateStatus: () => true,
      timeout: 5000
    });
    console.log(`   Parse endpoint: ${parseResponse.status}`);
    
  } catch (error) {
    console.error('🚨 Parse endpoint testing failed:', error.message);
  }
}

// เริ่มต้น server
startServer();