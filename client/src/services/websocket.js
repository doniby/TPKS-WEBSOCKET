import { io } from 'socket.io-client';

let socket = null;

export const connectWebSocket = (token) => {
  if (socket && socket.connected) {
    return socket;
  }

  socket = io('http://localhost:3000', {
    auth: {
      token: token,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('WebSocket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('WebSocket disconnected:', reason);
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  return socket;
};

export const disconnectWebSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;

export default {
  connect: connectWebSocket,
  disconnect: disconnectWebSocket,
  getSocket,
};
