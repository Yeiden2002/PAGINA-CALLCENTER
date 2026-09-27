import mongoose from 'mongoose';
import { asesorInput } from '../utils/validation.js';
const schema = new mongoose.Schema({
  campana: { type: String, required: true, trim: true, maxlength: 100 },
  nombreAsesor: { type: String, required: true, trim: true, maxlength: 160 },
  jornada: { type: Number, required: true, min: 0.25, max: 24 },
  tiempoBreak: { type: Number, required: true, min: 0, max: 240, validate: Number.isInteger },
  horario: { type: String, required: true, maxlength: 60, match: /^\d{2}:\d{2} A \d{2}:\d{2}$/ },
  estatus: { type: String, enum: ['Activo', 'Inactivo'], default: 'Activo', required: true },
  campanaNormalizada: { type: String, required: true, select: false },
  nombreNormalizado: { type: String, required: true, select: false },
}, { timestamps: true, strict: 'throw', versionKey: false });
schema.pre('validate', function () {
  const raw = Object.fromEntries(['campana','nombreAsesor','jornada','tiempoBreak','horario','estatus'].map(key => [key,this[key]]));
  Object.assign(this, asesorInput(raw));
});
schema.index({ campanaNormalizada: 1, nombreNormalizado: 1 }, { unique: true, name: 'campana_nombre_unique' });
schema.index({ nombreNormalizado: 1, _id: 1 }, { name: 'nombre_orden' });
schema.index({ estatus: 1, jornada: 1 }, { name: 'estatus_jornada' });
export default mongoose.model('Asesor', schema, 'asesores');
