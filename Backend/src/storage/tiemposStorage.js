import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import {S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand} from '@aws-sdk/client-s3';
import {HttpError} from '../utils/validation.js';

export const storageRoot = path.resolve(process.env.TIEMPOS_STORAGE_DIR || fileURLToPath(new URL('../../storage/tiempos/', import.meta.url)));
const MAX_BYTES = 5 * 1024 * 1024;
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
function validateName(name) {
  if (typeof name !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.(csv|xlsx|xls)$/.test(name)) throw new HttpError(400, 'Referencia de archivo inválida.');
  return name;
}
function validateBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_BYTES) throw new HttpError(413, 'Archivo inválido o mayor de 5 MB.');
}
export function storedName(extension) { return validateName(`${randomUUID()}.${extension}`); }
export function filePath(name) { return path.join(storageRoot, validateName(name)); }
export function createLocalStorage(root = storageRoot) {
  const location = name => path.join(root, validateName(name));
  async function originalPath(name) {
    const p = location(name);
    let stat;
    try { stat = await fs.lstat(p); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!stat?.isFile() || stat.isSymbolicLink()) throw new HttpError(404, 'El archivo original no está disponible.');
    return p;
  }
  return {
    originalPath,
    async save(name, buffer) {
      validateName(name); validateBuffer(buffer);
      await fs.mkdir(root, {recursive:true, mode:0o700});
      const handle = await fs.open(location(name), 'wx', 0o600);
      try { await handle.writeFile(buffer); await handle.sync(); } finally { await handle.close(); }
    },
    async read(name) { return fs.readFile(await originalPath(name)); },
    async exists(name) { try { await originalPath(name); return true; } catch (error) { if (error.status === 404) return false; throw error; } },
    async delete(name) { if (!name) return; try { await fs.unlink(location(name)); } catch (error) { if (error.code !== 'ENOENT') throw error; } },
  };
}
// Client injection keeps tests offline; application services only use this provider interface.
export function createR2Storage({client, bucket}) {
  const missing = error => ['NoSuchKey', 'NotFound'].includes(error.name);
  async function send(Command, name, extra = {}) {
    validateName(name);
    try { return await client.send(new Command({Bucket:bucket, Key:name, ...extra}), {abortSignal:AbortSignal.timeout(30000)}); }
    catch (error) {
      if (missing(error)) throw new HttpError(404, 'El archivo original no está disponible.');
      throw new HttpError(503, 'El almacenamiento no está disponible. Intenta nuevamente.');
    }
  }
  return {
    async save(name, buffer) {
      validateBuffer(buffer);
      await send(PutObjectCommand, name, {Body:buffer, ContentLength:buffer.length, ContentType:'application/octet-stream', IfNoneMatch:'*', Metadata:{sha256:sha256(buffer)}});
    },
    async read(name) {
      const result = await send(GetObjectCommand, name);
      const chunks = []; let size = 0;
      try {
        for await (const chunk of result.Body) {
          size += chunk.length;
          if (size > MAX_BYTES) throw new Error('size');
          chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks);
        if (result.ContentLength !== undefined && bytes.length !== result.ContentLength) throw new Error('length');
        if (result.Metadata?.sha256 && sha256(bytes) !== result.Metadata.sha256) throw new Error('checksum');
        return bytes;
      } catch { throw new HttpError(503, 'No fue posible leer el archivo original completo.'); }
      finally { result.Body?.destroy?.(); }
    },
    async exists(name) { try { await send(HeadObjectCommand, name); return true; } catch (error) { if (error.status === 404) return false; throw error; } },
    async delete(name) { if (!name) return; try { await send(DeleteObjectCommand, name); } catch (error) { if (error.status !== 404) throw error; } },
  };
}
export function configuredStorage(env = process.env) {
  const provider = env.STORAGE_PROVIDER || 'local';
  if (env.NODE_ENV === 'production' && provider !== 'r2') throw new Error('Producción requiere STORAGE_PROVIDER=r2.');
  if (provider === 'local') return createLocalStorage();
  if (provider !== 'r2') throw new Error('STORAGE_PROVIDER inválido.');
  for (const key of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET']) if (!env[key]) throw new Error(`Falta ${key}.`);
  if (!/^[a-f\d]{32}$/i.test(env.R2_ACCOUNT_ID)) throw new Error('R2_ACCOUNT_ID inválido.');
  const endpoint = env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  if (!new RegExp(`^https://${env.R2_ACCOUNT_ID}\\.r2\\.cloudflarestorage\\.com/?$`).test(endpoint)) throw new Error('R2_ENDPOINT debe ser el endpoint S3 de la cuenta.');
  const client = new S3Client({region:'auto', endpoint, maxAttempts:2, requestChecksumCalculation:'WHEN_REQUIRED', responseChecksumValidation:'WHEN_REQUIRED', credentials:{accessKeyId:env.R2_ACCESS_KEY_ID, secretAccessKey:env.R2_SECRET_ACCESS_KEY}});
  return createR2Storage({client, bucket:env.R2_BUCKET});
}
let provider;
export function initializeStorage() { return provider ||= configuredStorage(); }
export const saveOriginal = (name, buffer) => initializeStorage().save(name, buffer);
export const readOriginal = name => initializeStorage().read(name);
export const existsOriginal = name => initializeStorage().exists(name);
export const deleteOriginal = name => initializeStorage().delete(name);
export const originalPath = name => {
  const local = initializeStorage();
  if (!local.originalPath) throw new Error('R2 no tiene rutas locales.');
  return local.originalPath(name);
};
