import Asesor from '../models/Asesor.js';
import { asesorInput, listQuery, object, status, HttpError } from '../utils/validation.js';
import { readExcel, exportExcel } from '../services/excelService.js';
const publicFields = '_id campana nombreAsesor jornada tiempoBreak horario estatus createdAt updatedAt';
async function requireAsesor(id) {
  const asesor = await Asesor.findById(id).maxTimeMS(5000);
  if (!asesor) throw new HttpError(404, 'Asesor no encontrado.');
  return asesor;
}
export async function list(req, res) {
  const {page,limit,filter} = listQuery(req.query);
  const [data,total,campaigns,jornadas] = await Promise.all([
    Asesor.find(filter).select(publicFields).sort({nombreNormalizado:1,_id:1}).skip((page-1)*limit).limit(limit).maxTimeMS(5000).lean(),
    Asesor.countDocuments(filter).maxTimeMS(5000),
    Asesor.aggregate([{$group:{_id:'$campanaNormalizada',label:{$min:'$campana'}}},{$sort:{_id:1}},{$limit:1000}]).option({maxTimeMS:5000}),
    Asesor.distinct('jornada').maxTimeMS(5000),
  ]);
  res.json({success:true,data,pagination:{page,limit,total,pages:Math.ceil(total/limit)},filters:{campanas:campaigns.map(x=>x.label),jornadas:jornadas.sort((a,b)=>a-b)}});
}
export async function get(req,res) { res.json({success:true,data:await requireAsesor(req.params.id)}); }
export async function create(req,res) {
  const asesor = await Asesor.create(asesorInput(req.body));
  const data = await Asesor.findById(asesor._id).select(publicFields).lean();
  res.status(201).json({success:true,message:'Asesor registrado correctamente.',data});
}
export async function update(req,res) {
  const data = asesorInput(req.body);
  const asesor = await Asesor.findByIdAndUpdate(req.params.id,{$set:data},{returnDocument:'after',runValidators:true}).select(publicFields);
  if (!asesor) throw new HttpError(404,'Asesor no encontrado.');
  res.json({success:true,message:'Asesor actualizado correctamente.',data:asesor});
}
export async function patchStatus(req,res) {
  object(req.body,['estatus']);
  const asesor = await Asesor.findByIdAndUpdate(req.params.id,{$set:{estatus:status(req.body.estatus)}},{returnDocument:'after',runValidators:true}).select(publicFields);
  if (!asesor) throw new HttpError(404,'Asesor no encontrado.');
  res.json({success:true,message:'Estatus actualizado correctamente.',data:asesor});
}
export async function remove(req,res) {
  const asesor = await Asesor.findByIdAndDelete(req.params.id);
  if (!asesor) throw new HttpError(404,'Asesor no encontrado.');
  res.json({success:true,message:'Asesor eliminado correctamente.'});
}
export async function importFile(req,res) {
  object(req.body,['modo','opciones']);
  if (req.body.modo !== undefined && !['vista-previa','importar'].includes(req.body.modo)) throw new HttpError(400,'Modo de importación inválido.');
  let options = {};
  if (req.body.opciones !== undefined) {
    if (typeof req.body.opciones !== 'string') throw new HttpError(400,'Opciones inválidas.');
    try { options=JSON.parse(req.body.opciones); } catch { throw new HttpError(400,'Opciones de importación inválidas.'); }
  }
  const preview = req.body.modo === 'vista-previa';
  const parsed = await readExcel(req.file,options,preview);
  if (preview) return res.json({success:true,data:parsed});
  let insertados=0,duplicados=0;
  const seen = new Set();
  for (const {data} of parsed.rows) {
    const key=JSON.stringify([data.campanaNormalizada,data.nombreNormalizado]);
    if (seen.has(key)) {duplicados++;continue;}
    seen.add(key);
    try {await Asesor.create(data);insertados++;}
    catch(error) {
      if(error.code===11000) duplicados++;
      else throw new HttpError(503,`La importación se interrumpió después de registrar ${insertados} asesores. Puedes reintentar: los existentes se omitirán.`);
    }
  }
  res.json({success:true,message:'Archivo procesado correctamente.',total:parsed.total,insertados,duplicados,errores:parsed.errors.length,detalles:parsed.errors.slice(0,100),detallesTruncados:parsed.errors.length>100,
    advertencias:parsed.formulaValues ? [`Se usaron ${parsed.formulaValues} resultados de fórmulas guardados en Excel; no se ejecutaron fórmulas ni vínculos externos.`] : []});
}
export async function exportFile(req,res,next) {
  object(req.query,[]);
  const cursor=Asesor.find({}).select(publicFields).sort({campanaNormalizada:1,nombreNormalizado:1}).lean().cursor({batchSize:250});
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename="ASESORES - HORARIOS.xlsx"');
  try {await exportExcel(cursor,res);} catch(error) {if(res.headersSent) res.destroy(); else next(error);}
}
