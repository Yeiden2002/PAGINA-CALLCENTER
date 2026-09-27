import '../src/config/env.js';
import mongoose from 'mongoose';
import readline from 'node:readline/promises';
import {Writable} from 'node:stream';
import {hashPassword} from '../src/auth/password.js';
import Usuario from '../src/models/Usuario.js';
import {connectDatabase} from '../src/config/database.js';
let databaseStep=false;
let muted=false;
const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk,encoding);done();}});
const rl=readline.createInterface({input:process.stdin,output,terminal:true});
try{
 if(!process.stdin.isTTY)throw new Error('Ejecuta este comando en una terminal interactiva.');
 const usuario=(await rl.question('Usuario: ')).trim().toLowerCase();
 if(!/^[a-z0-9._-]{3,80}$/.test(usuario))throw new Error('Usuario: 3–80 letras, números, punto, guion o guion bajo.');
 process.stdout.write('Contraseña (12–128 caracteres, oculta): ');muted=true;const password=await rl.question('');muted=false;process.stdout.write('\n');
 process.stdout.write('Repite la contraseña: ');muted=true;const confirmation=await rl.question('');muted=false;process.stdout.write('\n');
 if(password!==confirmation)throw new Error('Las contraseñas no coinciden.');
 const passwordHash=await hashPassword(password);databaseStep=true;await connectDatabase();await Usuario.init();await Usuario.create({usuario,passwordHash});console.log('Usuario creado. Ya puedes iniciar sesión.');
}catch(error){muted=false;console.error(error.code===11000?'Ese usuario ya existe.':databaseStep?'No se pudo crear el usuario. Comprueba conexión, permisos e índices de MongoDB.':error.message);process.exitCode=1;}
finally{rl.close();await mongoose.disconnect();}
