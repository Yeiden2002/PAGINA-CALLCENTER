import {useEffect,useRef} from 'react';
export default function Modal({title,onClose,children,busy=false,wide=false}) {
  const ref=useRef(null);
  useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>dialog.close();},[]);
  return <dialog ref={ref} className={`modal ${wide?'modal-wide':''}`} aria-labelledby="modal-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <div className="modal-heading"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" aria-label="Cerrar" disabled={busy} onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}
