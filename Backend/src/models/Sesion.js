import mongoose from 'mongoose';
const schema=new mongoose.Schema({
  tokenHash:{type:String,required:true,unique:true},
  usuarioId:{type:mongoose.Schema.Types.ObjectId,ref:'Usuario',required:true},
  expiresAt:{type:Date,required:true},
},{timestamps:true,strict:'throw'});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export default mongoose.model('Sesion',schema);
