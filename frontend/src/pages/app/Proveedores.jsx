import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { Truck, Plus, Edit, Phone, Mail, UserCircle, MapPin } from 'lucide-react';

const Proveedores = () => {
  const [proveedores, setProveedores] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '' });
  const [editId, setEditId] = useState(null);

  const fetchProveedores = async () => {
    try {
      const res = await api.get('/proveedores');
      setProveedores(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchProveedores(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/proveedores/${editId}`, formData);
      } else {
        await api.post('/proveedores', formData);
      }
      setShowModal(false);
      setEditId(null);
      setFormData({ nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '' });
      fetchProveedores();
    } catch (err) { alert('Error al guardar proveedor'); }
  };

  const startEdit = (p) => {
    setEditId(p.id);
    setFormData({ nombre: p.nombre, nit: p.nit, contacto: p.contacto, telefono: p.telefono, email: p.email, direccion: p.direccion });
    setShowModal(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Directorio Proveedores</h2>
          <p className="text-slate-500 mt-1">Registra a quienes te suministran inventario físico.</p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={() => { setEditId(null); setFormData({ nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '' }); setShowModal(true); }}>
          <Plus className="w-5 h-5" /> Nuevo Proveedor
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        {proveedores.length === 0 ? (
          <div className="col-span-full bg-white rounded-[2rem] p-12 text-center border border-slate-200">
            <Truck className="w-16 h-16 mx-auto text-slate-300 mb-4" />
            <span className="text-lg font-bold text-slate-500">Ningún proveedor registrado aún.</span>
          </div>
        ) : proveedores.map(p => (
          <div key={p.id} className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm relative group hover:shadow-md transition-shadow flex items-start gap-5">
            <button onClick={() => startEdit(p)} className="absolute top-6 right-6 p-2 bg-slate-50 text-slate-400 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:text-brand-600 hover:bg-brand-50">
              <Edit className="w-4 h-4" />
            </button>
            <div className="w-16 h-16 shrink-0 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-2xl shadow-inner mt-1">
              {p.nombre.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h4 className="font-black text-xl text-slate-800 leading-tight mb-1">{p.nombre}</h4>
              <div className="inline-block px-3 py-1 bg-slate-100 font-bold text-xs text-slate-600 rounded-lg mb-4">NIT: {p.nit}</div>
              
              <div className="space-y-2 mt-1 text-sm text-slate-600 font-medium bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><UserCircle className="w-4 h-4 opacity-50 text-slate-500" /> <span className="text-slate-700 font-bold">{p.contacto || 'Sin contacto'}</span></div>
                  <div className="flex items-center gap-2"><Phone className="w-4 h-4 opacity-50 text-slate-500" /> {p.telefono}</div>
                </div>
                <hr className="border-slate-200/60 my-2" />
                <div className="flex items-center gap-2 text-xs"><Mail className="w-3.5 h-3.5 opacity-50" /> {p.email || 'N/A'}</div>
                <div className="flex items-center gap-2 text-xs"><MapPin className="w-3.5 h-3.5 opacity-50" /> {p.direccion || 'N/A'}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in p-4 overflow-y-auto">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-xl shadow-xl relative my-auto">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 border-b border-slate-100 pb-4">{editId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Razón Social</label><input required className="input-field rounded-xl" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})}/></div>
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">NIT</label><input required className="input-field rounded-xl" value={formData.nit} onChange={e => setFormData({...formData, nit: e.target.value})}/></div>
              </div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre Contacto</label><input required className="input-field rounded-xl" value={formData.contacto} onChange={e => setFormData({...formData, contacto: e.target.value})}/></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Teléfono Directo</label><input className="input-field rounded-xl" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})}/></div>
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Correo</label><input type="email" className="input-field rounded-xl" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}/></div>
              </div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Sede Principal Físcia</label><input className="input-field rounded-xl" value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})}/></div>
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                <button type="button" className="btn-secondary rounded-xl" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary rounded-xl px-6">{editId ? 'Actualizar' : 'Agregar'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Proveedores;
