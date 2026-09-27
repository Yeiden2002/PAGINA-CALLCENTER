import mongoose from 'mongoose';

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI en Backend/.env');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(process.env.MONGODB_URI, {serverSelectionTimeoutMS:10000, connectTimeoutMS:10000, socketTimeoutMS:45000, maxPoolSize:10, minPoolSize:0});
  console.log('MongoDB conectado correctamente');
}
