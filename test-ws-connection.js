const io = require('socket.io-client');

// Your JWT token
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYWRtaW4iLCJ1c2VybmFtZSI6ImFkbWluIiwidHlwZSI6ImFkbWluLXVpIiwiaWF0IjoxNzc3MDIyMjQ0LCJleHAiOjE3NzcxMDg2NDR9.stCTbJYVzQNVpJ81JHO8KC-Vyd8RgIag7c1CDOHytA0';

const socket = io('http://localhost:3000', {
  auth: {
    token: TOKEN,
  },
});

socket.on('connect', () => {
  console.log('✅ Connected! Socket ID:', socket.id);

  // Request initial state
  socket.emit('REQUEST_INITIAL_STATE', {
    eventNames: ['Vessel Alongside'],
  });
});

socket.on('VESSELALONGSIDE', (data) => {
  console.log('📨 Received VESSELALONGSIDE:', data);
});

socket.on('error', (error) => {
  console.error('❌ Connection error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connect error:', error.message);
});
