// Utility to generate JWT tokens for WebSocket clients
// Usage: node utils/generateToken.js [userId] [role]

require('dotenv').config();
const { generateToken } = require('../middleware/auth');

const userId = process.argv[2] || 'test-user';
const role = process.argv[3] || 'viewer';
const expiresIn = process.argv[4] || '24h';

const payload = {
  userId: userId,
  role: role,
  createdAt: new Date().toISOString()
};

try {
  const token = generateToken(payload, expiresIn);

  console.log('\n✅ JWT Token Generated Successfully\n');
  console.log('Token Details:');
  console.log('─'.repeat(60));
  console.log('User ID:', userId);
  console.log('Role:', role);
  console.log('Expires In:', expiresIn);
  console.log('─'.repeat(60));
  console.log('\nToken:');
  console.log(token);
  console.log('\n📋 Use this token in your WebSocket client:');
  console.log(`\nconst socket = io('${process.env.SERVER_URL || 'http://localhost:3000'}', {`);
  console.log('  auth: {');
  console.log(`    token: '${token}'`);
  console.log('  }');
  console.log('});\n');

} catch (error) {
  console.error('❌ Error generating token:', error.message);
  process.exit(1);
}
