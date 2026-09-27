import mongoose from 'mongoose';
const duration={type:Number,default:null,min:0,max:86400,validate:v=>v===null||Number.isInteger(v)};
const schema=new mongoose.Schema({
 asesorId:{type:mongoose.Schema.Types.ObjectId,ref:'Asesor',default:null},importacionId:{type:mongoose.Schema.Types.ObjectId,ref:'ImportacionTiempos',required:true},
 version:{type:String,required:true},fecha:{type:String,required:true},nombreAsesor:{type:String,required:true},campana:{type:String,default:''},
 conexion:duration,pausa:duration,pausaRetro:duration,adeudoBreak:duration,adeudoBano:duration,totalAdeudo:{...duration,max:259200},
 inicioJornada:{type:String,default:null},finJornada:{type:String,default:null},archivoOrigen:{type:String,required:true},
 calculoAnterior:{type:mongoose.Schema.Types.Mixed,default:null},calculoVersion:Number,horarioAsignado:{type:String,default:null},totalTrabajado:duration,breakConsumido:duration,banoConsumido:duration,excesoRetro:duration,retardo:duration,adeudoJornada:duration,tiempoAFavor:duration,diferenciaBruta:{type:Number,default:null},diferenciaNeta:{type:Number,default:null},diagnosticos:[String],
 jornadaSegundos:Number,breakPermitidoSegundos:Number,banoPermitidoSegundos:{type:Number,default:null},
 estado:{type:String,enum:['Identificado','No identificado','Sin registro'],required:true},
 datosOrigen:{type:mongoose.Schema.Types.Mixed,default:{}},reglasPendientes:[String],
 modificadoManualmente:{type:Boolean,default:false},fechaModificacionManual:Date,
 modificadoPor:{type:mongoose.Schema.Types.ObjectId,ref:'Usuario'},valoresOriginales:{type:mongoose.Schema.Types.Mixed,default:null},
},{timestamps:true,strict:'throw'});
schema.index({importacionId:1,version:1});schema.index({asesorId:1,fecha:1});
export default mongoose.model('TiempoDiario',schema);
