import mongoose from 'mongoose';

export function getHealth(req, res) {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    success: connected,
    message: connected ? 'API funcionando' : 'MongoDB no está disponible',
    database: connected ? 'connected' : 'disconnected',
  });
}
