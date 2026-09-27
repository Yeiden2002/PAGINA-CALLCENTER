import mongoose from 'mongoose';
const operationSchema=new mongoose.Schema({tipo:String,versionNueva:String,archivoNuevo:String,versionAnterior:String,archivoAnterior:String},{_id:false});
const schema=new mongoose.Schema({
 nombreArchivoOriginal:{type:String,required:true,maxlength:200},nombreArchivoAlmacenado:{type:String,default:null},
 fechaDatos:{type:String,required:true,match:/^\d{4}-\d{2}-\d{2}$/,unique:true},hashArchivo:{type:String,required:true,unique:true},
 tipoArchivo:{type:String,enum:['csv','xlsx','xls'],required:true},tamanoArchivo:{type:Number,required:true},
 registrosEncontrados:{type:Number,default:0},registrosProcesados:{type:Number,default:0},registrosCorrectos:{type:Number,default:0},registrosConError:{type:Number,default:0},asesoresNoIdentificados:{type:Number,default:0},
 estado:{type:String,enum:['Preparando','Procesado','Con observaciones','Eliminando'],default:'Preparando'},
 versionActiva:{type:String,default:null},operacion:{type:operationSchema,default:null},
 advertencias:[String],
 incidencias:[{_id:false,fila:Number,nombre:String,motivo:String}],
 creadoPor:{type:mongoose.Schema.Types.ObjectId,ref:'Usuario'},
},{timestamps:true,strict:'throw'});
schema.index({createdAt:-1,_id:-1});
export default mongoose.model('ImportacionTiempos',schema);
