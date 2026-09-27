import {Readable} from 'node:stream';
export function fakeR2() {
  const objects = new Map();
  const state = {fail:null, objects, async send(command) {
    const {Key, Body, Metadata, IfNoneMatch} = command.input;
    const type = command.constructor.name;
    if (state.fail === type) throw new Error('Private provider detail must never reach API');
    if (type === 'PutObjectCommand') {
      if (objects.has(Key) && IfNoneMatch === '*') throw Object.assign(new Error(), {name:'PreconditionFailed'});
      objects.set(Key, {bytes:Buffer.from(Body), metadata:Metadata});
      if (state.fail === 'put-after-save') throw new Error('Network response lost');
      return {};
    }
    if (type === 'DeleteObjectCommand') { objects.delete(Key); return {}; }
    const object = objects.get(Key);
    if (!object) throw Object.assign(new Error(), {name:'NoSuchKey'});
    return {ContentLength:object.bytes.length, Metadata:object.metadata, ...(type === 'GetObjectCommand' ? {Body:Readable.from([object.bytes])} : {})};
  }};
  return state;
}
