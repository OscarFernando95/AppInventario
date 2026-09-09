/**
 * Tarjeta de las pantallas de autenticación (login y cambio de contraseña).
 * Las dos repetían el mismo fondo oscuro, los mismos halos y el mismo card,
 * con pequeñas divergencias que nadie decidió.
 */
const AuthCard = ({ icon: Icon, title, description, children }) => (
  <div className="min-h-screen bg-dark-900 flex items-center justify-center relative overflow-hidden text-slate-100 p-4">
    <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-brand-600/20 blur-[120px] rounded-full pointer-events-none" />
    <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-brand-900/30 blur-[150px] rounded-full pointer-events-none" />

    <div className="w-full max-w-md bg-dark-800/80 backdrop-blur-xl border border-dark-700 p-6 sm:p-10 rounded-3xl shadow-2xl relative z-10">
      <div className="mb-8 text-center">
        {Icon && (
          <div className="w-16 h-16 bg-gradient-to-tr from-brand-600 to-brand-400 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand-500/30">
            <Icon className="w-8 h-8 text-white stroke-[1.5]" aria-hidden="true" />
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">{title}</h1>
        {description && <p className="text-slate-300 text-sm">{description}</p>}
      </div>
      {children}
    </div>
  </div>
);

/** Banner de estado dentro de una AuthCard. */
export const AuthNotice = ({ tone = 'error', children }) => {
  if (!children) return null;
  const tones = {
    error: 'bg-red-500/10 border-red-500/30 text-red-200',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mb-6 p-4 border rounded-xl text-sm text-center ${tones[tone]}`}
    >
      {children}
    </div>
  );
};

export default AuthCard;
