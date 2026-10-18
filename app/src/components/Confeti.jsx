// Explosión de confeti para festejar una versión nueva: unos 150 papelitos con los colores de Broots
// que salen desde un punto, caen dando vueltas y se desvanecen en menos de tres segundos.
//
// Se dibuja en un solo canvas por encima de todo (sin elementos por papelito ni filtros), así no
// recarga la placa de video. Con «reducir animaciones» de Windows no se muestra.
import { useEffect, useRef } from 'react';

const CANTIDAD = 150;
const DURACION = 2800; // ms
const GRAVEDAD = 1500; // px/s²
const COLORES_FIJOS = ['#dda15e', '#bc6c25', '#606c38', '#a3b18a', '#e9c46a', '#fefae0'];

/** Colores de la paleta (verde y acento del tema actual) más algunos tonos tierra. */
function colores() {
  const estilo = getComputedStyle(document.documentElement);
  const tema = ['--verde', '--acento'].map((v) => estilo.getPropertyValue(v).trim()).filter(Boolean);
  return [...tema, ...tema, ...COLORES_FIJOS];
}

function papelitos(x, y) {
  const paleta = colores();
  return Array.from({ length: CANTIDAD }, () => {
    // Hacia arriba y a los costados, con algo de azar en la fuerza.
    const angulo = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const velocidad = 520 + Math.random() * 760;
    return {
      x,
      y,
      vx: Math.cos(angulo) * velocidad,
      vy: Math.sin(angulo) * velocidad,
      ancho: 7 + Math.random() * 6,
      alto: 11 + Math.random() * 8,
      redondo: Math.random() < 0.22,
      giro: Math.random() * Math.PI * 2,
      velocidadGiro: (Math.random() - 0.5) * 14,
      vuelta: Math.random() * Math.PI * 2, // el papelito se da vuelta: se ve más angosto y vuelve
      velocidadVuelta: 6 + Math.random() * 10,
      color: paleta[Math.floor(Math.random() * paleta.length)],
    };
  });
}

/** desde: { x, y } en pantalla (por defecto, un poco arriba del centro). onTerminar al desvanecerse. */
export function Confeti({ desde, onTerminar }) {
  const lienzo = useRef(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onTerminar?.();
      return;
    }
    const canvas = lienzo.current;
    const ctx = canvas.getContext('2d');
    const escala = window.devicePixelRatio || 1;
    const ajustar = () => {
      canvas.width = window.innerWidth * escala;
      canvas.height = window.innerHeight * escala;
    };
    ajustar();
    window.addEventListener('resize', ajustar);

    const lista = papelitos(desde?.x ?? window.innerWidth / 2, desde?.y ?? window.innerHeight * 0.42);
    const inicio = performance.now();
    let anterior = inicio;
    let cuadro = 0;
    const dibujar = (ahora) => {
      const dt = Math.min(0.05, (ahora - anterior) / 1000);
      anterior = ahora;
      const pasado = ahora - inicio;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Los últimos 700 ms se desvanecen todos juntos.
      ctx.globalAlpha = Math.min(1, Math.max(0, (DURACION - pasado) / 700));
      for (const p of lista) {
        // El aire los frena: suben rápido, se abren y caen despacio, como papel.
        const freno = Math.exp(-2.6 * dt);
        p.vx *= freno;
        p.vy = p.vy * freno + GRAVEDAD * dt * 0.55;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.giro += p.velocidadGiro * dt;
        p.vuelta += p.velocidadVuelta * dt;
        ctx.setTransform(escala, 0, 0, escala, p.x * escala, p.y * escala);
        ctx.rotate(p.giro);
        ctx.scale(1, Math.cos(p.vuelta));
        ctx.fillStyle = p.color;
        if (p.redondo) {
          ctx.beginPath();
          ctx.arc(0, 0, p.ancho / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.ancho / 2, -p.alto / 2, p.ancho, p.alto);
        }
      }
      if (pasado < DURACION) cuadro = requestAnimationFrame(dibujar);
      else onTerminar?.();
    };
    cuadro = requestAnimationFrame(dibujar);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener('resize', ajustar);
    };
  }, []);

  return <canvas ref={lienzo} data-confeti className="pointer-events-none fixed inset-0 z-[96] size-full" />;
}
