// dashboard.js
const ParseDashboard = require('parse-dashboard');
const express = require('express');
const path = require('path');

const app = express();

// อ่าน dashboard config
const dashboardConfig = require('./dashboard-config.json');

console.log('🚀 Starting Parse Dashboard...');
console.log('📊 Apps:', dashboardConfig.apps.map(app => app.appName));

// สร้าง dashboard instance
const dashboard = new ParseDashboard(dashboardConfig, {
  allowInsecureHTTP: true, // อนุญาตให้ใช้ HTTP ใน development
  cookieSessionSecret: 'your-secret-key', // เปลี่ยนเป็น secret key ของคุณ
});

// ใช้ dashboard เป็น middleware
app.use('/', dashboard);

const port = 4040;

app.listen(port, () => {
  console.log('✅ Parse Dashboard is running!');
  console.log(`📍 Dashboard URL: http://localhost:${port}`);
  console.log(`👤 Username: admin`);
  console.log(`🔑 Password: admin123`);
  console.log('');
  console.log('🔧 Make sure Parse Server is running on http://localhost:5000');
  console.log('📝 You can now manage your Parse Server through the web interface!');
});