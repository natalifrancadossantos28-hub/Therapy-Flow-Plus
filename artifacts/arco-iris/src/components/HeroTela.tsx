import type { ReactNode } from "react";

const src = (n: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/visual/hero-${n}.webp`;

/** Topo das telas com desenho 3D: título e subtítulo sobre a imagem, com brilho neon. */
export function HeroTela({ img, titulo, subtitulo, children }: { img: string; titulo: ReactNode; subtitulo?: ReactNode; children?: ReactNode }) {
  return (
    <section className="hero-tela relative overflow-hidden rounded-[26px] border border-violet-400/40 bg-[#140f38] shadow-[0_0_34px_-12px_rgba(139,92,246,.85)] print:hidden">
      <img src={src(img)} alt="" aria-hidden width={1024} height={683} className="absolute inset-0 w-full h-full object-cover object-[70%_center]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#120d33] via-[#120d33]/80 to-transparent" />
      <div className="relative flex flex-col justify-center gap-2 min-h-[176px] sm:min-h-[220px] p-5 sm:p-8 max-w-[62%] sm:max-w-[55%]">
        <h1 className="font-display font-extrabold text-[30px] sm:text-5xl leading-[1.05] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,.6)]">{titulo}</h1>
        <div className="h-1.5 w-20 rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-sky-400" />
        {subtitulo && <div className="text-base sm:text-xl text-white/90 leading-snug drop-shadow-[0_1px_6px_rgba(0,0,0,.7)]">{subtitulo}</div>}
        {children}
      </div>
    </section>
  );
}
