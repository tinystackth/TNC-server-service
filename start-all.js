// start-all.js - รัน Parse Server และ Dashboard พร้อมกัน
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting TinyCare Parse Server + Dashboard');
console.log('===========================================');

// สร้าง process สำหรับ Parse Server
const parseServer = spawn('node', ['server.js'], {
  stdio: ['inherit', 'inherit', 'inherit'],
  cwd: __dirname
});

// รอ Parse Server เริ่มก่อน (5 วินาที)
setTimeout(() => {
  console.log('\n📊 Starting Parse Dashboard...\n');
  
  // สร้าง process สำหรับ Dashboard
  const dashboard = spawn('node', ['dashboard.js'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    cwd: __dirname
  });

  // Handle dashboard exit
  dashboard.on('close', (code) => {
    console.log(`📊 Dashboard exited with code ${code}`);
  });

}, 5000);

// Handle parse server exit
parseServer.on('close', (code) => {
  console.log(`🔧 Parse Server exited with code ${code}`);
  process.exit(code);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Parse Server and Dashboard...');
  parseServer.kill('SIGINT');
  process.exit(0);
});

console.log('✅ Parse Server starting...');
console.log('⏳ Dashboard will start in 5 seconds...');
console.log('');
console.log('🔧 Parse Server: http://localhost:5000');
console.log('📊 Dashboard: http://localhost:4040 (after 5 seconds)');
console.log('👤 Dashboard Login: admin / admin123');
console.log('');
console.log('Press Ctrl+C to stop both servers');