import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  usuario: {type:String,required:true,unique:true,trim:true,lowercase:true,maxlength:80},
  passwordHash: {type:String,required:true,select:false},
}, {timestamps:true,strict:'throw'});
export default mongoose.model('Usuario',schema);
