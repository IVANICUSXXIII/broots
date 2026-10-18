// Íconos simples en SVG (trazo fino, heredan el color del texto).
function Icono({ children, className = 'size-4', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const IconoBuscar = (p) => (
  <Icono {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icono>
);
export const IconoGrilla = (p) => (
  <Icono {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="9" rx="1.5" /><rect x="3" y="15" width="7" height="6" rx="1.5" /><rect x="14" y="15" width="7" height="6" rx="1.5" /></Icono>
);
export const IconoLista = (p) => (
  <Icono {...p}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></Icono>
);
export const IconoRecargar = (p) => (
  <Icono {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Icono>
);
export const IconoCarpeta = (p) => (
  <Icono {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Icono>
);
export const IconoCerrar = (p) => (
  <Icono {...p}><path d="M6 6l12 12M18 6 6 18" /></Icono>
);
export const IconoLibro = (p) => (
  <Icono {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M8 7h7" /></Icono>
);
export const IconoCandado = (p) => (
  <Icono {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icono>
);
export const IconoFlecha = (p) => (
  <Icono {...p}><path d="m6 9 6 6 6-6" /></Icono>
);
export const IconoLibros = (p) => (
  <Icono {...p}><rect x="3" y="4" width="4" height="16" rx="1" /><rect x="8.5" y="4" width="4" height="16" rx="1" /><path d="m15 5.2 3.6-1 3 15.2-3.6 1z" /></Icono>
);
export const IconoColeccion = (p) => (
  <Icono {...p}><path d="M4 7a2 2 0 0 1 2-2h3.5l2 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M8 13h8" /></Icono>
);

export const IconoBarraLateral = (p) => (
  <Icono {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></Icono>
);
export const IconoSol = (p) => (
  <Icono {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></Icono>
);
export const IconoLuna = (p) => (
  <Icono {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Icono>
);
export const IconoAuto = (p) => (
  <Icono {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" /></Icono>
);

export const IconoEditar = (p) => (
  <Icono {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></Icono>
);
export const IconoMas = (p) => (
  <Icono {...p}><path d="M12 5v14M5 12h14" /></Icono>
);
export const IconoDuplicados = (p) => (
  <Icono {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icono>
);

export const IconoKindle = (p) => (
  <Icono {...p}><rect x="5" y="2.5" width="14" height="19" rx="2.5" /><path d="M8.5 7h7M8.5 10h7M8.5 13h4.5" /></Icono>
);
export const IconoEnviar = (p) => (
  <Icono {...p}><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4z" /></Icono>
);
export const IconoCita = (p) => (
  <Icono {...p}><path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6" /></Icono>
);
export const IconoCheck = (p) => (
  <Icono {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icono>
);

/** Logo de Broots: un libro abierto del que crecen raíces (books + roots). */
export const IconoCompartir = (p) => (
  <Icono {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16 14.6a4.4 4.4 0 0 1 5 4.4" /></Icono>
);
export const IconoLeer = (p) => (
  <Icono {...p}><path d="M12 6.5C10 5 7.5 4.5 3 4.5v14c4.5 0 7 .5 9 2 2-1.5 4.5-2 9-2v-14c-4.5 0-7 .5-9 2z" /><path d="M12 6.5v14" /></Icono>
);
export const IconoIndice = (p) => (
  <Icono {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h1M4 12h1M4 18h1" /></Icono>
);
export const IconoTraducir = (p) => (
  <Icono {...p}><path d="M3 5h9M7.5 3v2M10 5c-.8 3.5-3 6.5-6 8M5.5 9c1 1.8 2.6 3.3 4.5 4.2" /><path d="m12 21 4.5-10 4.5 10M13.6 17.5h5.8" /></Icono>
);
export const IconoLlave = (p) => (
  <Icono {...p}><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M18.5 4.5 21 7" /></Icono>
);
export const IconoAnterior = (p) => (
  <Icono {...p}><path d="m15 5-7 7 7 7" /></Icono>
);
export const IconoSiguiente = (p) => (
  <Icono {...p}><path d="m9 5 7 7-7 7" /></Icono>
);

export function LogoBroots({ className = 'size-5' }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 6.5c3.8-1.6 8-1.2 12 1.3 4-2.5 8.2-2.9 12-1.3v12.3c-3.8-1.6-8-1.2-12 1.3-4-2.5-8.2-2.9-12-1.3z" />
      <path d="M16 7.8v12.3" />
      <path d="M16 20.1v4.4M16 22.3c-1.3 1.6-3.4 2.4-5.4 2.6M16 22.3c1.3 1.6 3.4 2.4 5.4 2.6M16 24.5c-.6 1.4-1.4 2.4-2.6 3.1M16 24.5c.6 1.4 1.4 2.4 2.6 3.1" />
    </svg>
  );
}

export const IconoAbrir = (p) => (
  <Icono {...p}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Icono>
);

// Configuración
export const IconoEngranaje = (p) => (
  <Icono {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" /><circle cx="12" cy="12" r="6.8" /></Icono>
);
export const IconoAyuda = (p) => (
  <Icono {...p}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.7M12 17.1v.2" /></Icono>
);
export const IconoInfo = (p) => (
  <Icono {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.2" /></Icono>
);
export const IconoEscudo = (p) => (
  <Icono {...p}><path d="M12 3 5 6v5.5c0 4.4 3 7.8 7 9.5 4-1.7 7-5.1 7-9.5V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></Icono>
);
export const IconoCorazon = (p) => (
  <Icono {...p}><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" /></Icono>
);
export const IconoCafe = (p) => (
  <Icono {...p}><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5" /></Icono>
);

// 1.7: hábito de lectura
export const IconoReloj = (p) => (
  <Icono {...p}><path d="M7 3h10M7 21h10" /><path d="M8 3c0 4 8 5 8 9s-8 5-8 9M16 3c0 4-8 5-8 9s8 5 8 9" /></Icono>
);
export const IconoEnfoque = (p) => (
  <Icono {...p}><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></Icono>
);
export const IconoOjo = (p) => (
  <Icono {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></Icono>
);
export const IconoRacha = (p) => (
  <Icono {...p}><path d="M12 21a6 6 0 0 0 6-6c0-3.5-2.5-5.5-3.5-8.5-1.5 1.5-2 3-2 4.5-1-1-1.5-2.5-1.5-4C8.5 8.5 6 11.5 6 15a6 6 0 0 0 6 6z" /></Icono>
);
export const IconoReleer = (p) => (
  <Icono {...p}><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5" /><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" /></Icono>
);
