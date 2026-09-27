import {randomBytes,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(rawScrypt);
export async function hashPassword(password){
  if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
  const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password,stored){
  const [salt,hash]=(stored||'00000000000000000000000000000000:'+ '0'.repeat(128)).split(':');
  const key=await scrypt(password,salt,64);const expected=Buffer.from(hash,'hex');
  return expected.length===key.length&&timingSafeEqual(key,expected);
}
