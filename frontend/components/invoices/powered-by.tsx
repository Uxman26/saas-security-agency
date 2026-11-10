/** The ControlOps mark at the foot of every on-screen and printed invoice or statement. */
export function PoweredByControlOps() {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-slate-200 py-3 text-xs font-semibold text-slate-600">
      <img src="/ControlOps-Logos/controlOps-icon.png" alt="" className="size-5 object-contain" />
      Powered by ControlOps
    </div>
  );
}
