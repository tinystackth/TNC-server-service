// start-all.js - รัน Parse Server เดียว (มี Dashboard รวมอยู่แล้ว)
const { spawn } = require('child_process');

console.log('🚀 Starting TinyCare Parse Server + Dashboard');
console.log('===========================================');

// สร้าง process สำหรับ Parse Server เดียว (มี Dashboard รวม)
const parseServer = spawn('node', ['server.js'], {
  stdio: ['inherit', 'inherit', 'inherit'],
  cwd: __dirname
});

// Handle parse server exit
parseServer.on('close', (code) => {
  console.log(`🔧 Parse Server exited with code ${code}`);
  process.exit(code);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Parse Server...');
  parseServer.kill('SIGINT');
  process.exit(0);
});

console.log('✅ Parse Server starting...');
console.log('');
console.log('🔧 Parse Server + Dashboard: http://localhost:5000');
console.log('📊 Parse Dashboard: http://localhost:5000/dashboard');
console.log('🔗 API Base: http://localhost:5000/api');
console.log('💚 Health Check: http://localhost:5000/health');
console.log('👤 Dashboard Login: admin / admin123');
console.log('');
console.log('Press Ctrl+C to stop server');