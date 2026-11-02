/*
 * Fundo do topo da página inicial: um tribunal ateniense (dikastérion) desenhado em luz.
 *
 * Uma colunata dórica em perspectiva emoldura o texto, com arquitrave e friso de grega
 * (meandro). Ao fundo, a fachada com frontão. Pelo ar flutuam as psêphoi, as fichas de
 * bronze com eixo que os jurados atenienses usavam para votar. As colunas sobem do chão
 * ao carregar; depois a cena acompanha o mouse (ou balança devagar sozinha, no celular)
 * e as fichas se afastam do cursor e do dedo.
 *
 * Canvas 2D puro: roda em qualquer aparelho, sem WebGL.
 */

type Ponto = { x: number; y: number };
type Ficha = { x: number; y: number; z: number; vx: number; vy: number; giro: number; vgiro: number; incl: number };

export type OpcoesCena = {
  /** true: desenha a cena pronta e parada (pessoas que pedem menos movimento). */
  parado?: boolean;
  /** Quando devolve true, a animação espera (aba escondida ou topo fora da tela). */
  pausado?: () => boolean;
};

// Profundidades das colunas (cada lado), da mais perto para a mais longe.
const PROFUNDIDADES = [1.18, 1.62, 2.24, 3.1, 4.3, 5.95, 8.25];
const FUNDO = 11.5; // onde fica a fachada do fundo
const PISO = 0.8; // altura do chão (positivo = para baixo)
const TOPO_FUSTE = -0.6; // onde termina o fuste e começa o capitel
const ABACO = -0.665;
const ARQUITRAVE = -0.75;
const FRISO = -0.88;
const CORNIJA = -0.93;
const RAIO = 0.075; // raio do fuste, em unidades do mundo

const DURACAO_ENTRADA = 2400; // ms

const suave = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const entre = (a: number, b: number, t: number) => a + (b - a) * t;

export function desenharTribunal(canvas: HTMLCanvasElement, opcoes: OpcoesCena = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");

  let L = 0; // largura em px CSS
  let A = 0; // altura em px CSS
  let dpr = 1;
  const inicio = performance.now();
  let quadro = 0;
  let destruido = false;

  // Paralaxe: alvo vem do mouse; o valor atual corre atrás dele.
  const alvo = { x: 0, y: 0 };
  const atual = { x: 0, y: 0 };
  let ultimoMovimento = -Infinity;
  const cursor = { x: -9999, y: -9999 };

  const fichas: Ficha[] = Array.from({ length: 18 }, () => novaFicha(true));

  function novaFicha(espalhar: boolean): Ficha {
    return {
      x: Math.random(),
      y: espalhar ? Math.random() : 1.08,
      z: 0.45 + Math.random() * 0.75,
      vx: (Math.random() - 0.5) * 0.00006,
      vy: -(0.00004 + Math.random() * 0.00007),
      giro: Math.random() * Math.PI * 2,
      vgiro: (Math.random() - 0.5) * 0.0016,
      incl: Math.random() * Math.PI,
    };
  }

  function medir() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    L = Math.max(1, r.width);
    A = Math.max(1, r.height);
    canvas.width = Math.round(L * dpr);
    canvas.height = Math.round(A * dpr);
  }

  // Projeção: mundo (x lateral, y vertical, z profundidade) -> tela.
  function projetor() {
    const retrato = A > L;
    const kx = L * (retrato ? 0.56 : 0.47);
    const ky = A * (retrato ? 0.5 : 0.6);
    const fx = L / 2 + atual.x * L * 0.035;
    const fy = A * 0.44 + atual.y * A * 0.025;
    return (x: number, y: number, z: number): Ponto => ({ x: fx + (x * kx) / z, y: fy + (y * ky) / z });
  }

  function gradiente() {
    const g = ctx!.createLinearGradient(0, 0, L, A * 0.3);
    g.addColorStop(0, "#67e8f9");
    g.addColorStop(0.5, "#818cf8");
    g.addColorStop(1, "#f0abfc");
    return g;
  }

  // Cada traço sai duas vezes: largo e fraco (brilho) e fino e forte (linha).
  function tracar(caminho: () => void, largura: number, alfa: number) {
    if (alfa <= 0.003) return;
    ctx!.beginPath();
    caminho();
    ctx!.globalAlpha = alfa * 0.18;
    ctx!.lineWidth = largura * 4;
    ctx!.stroke();
    ctx!.globalAlpha = alfa;
    ctx!.lineWidth = largura;
    ctx!.stroke();
  }

  function linha(pts: Ponto[]) {
    return () => {
      ctx!.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx!.lineTo(pts[i].x, pts[i].y);
    };
  }

  function coluna(P: ReturnType<typeof projetor>, lado: number, z: number, subida: number, alfa: number) {
    if (subida <= 0) return;
    const x = lado;
    const larg = Math.max(0.6, 2.1 / z);
    const topo = entre(PISO, TOPO_FUSTE, subida);
    const rTopo = RAIO * 0.8;
    const rAt = (y: number) => entre(RAIO, rTopo, (PISO - y) / (PISO - TOPO_FUSTE));
    // Fuste: contorno + caneluras.
    for (const f of [-1, -0.45, 0.1, 0.62, 1]) {
      const borda = Math.abs(f) === 1;
      tracar(linha([P(x + f * RAIO, PISO, z), P(x + f * rAt(topo), topo, z)]), borda ? larg : larg * 0.55, alfa * (borda ? 1 : 0.45));
    }
    if (subida < 1) return;
    // Capitel: équino (curva) e ábaco (bloco).
    const eq0 = P(x - rTopo, TOPO_FUSTE, z);
    const eq1 = P(x + rTopo, TOPO_FUSTE, z);
    const ab = [P(x - RAIO * 1.35, -0.635, z), P(x + RAIO * 1.35, -0.635, z), P(x + RAIO * 1.35, ABACO, z), P(x - RAIO * 1.35, ABACO, z)];
    tracar(
      () => {
        ctx!.moveTo(eq0.x, eq0.y);
        const c0 = P(x - RAIO * 1.3, TOPO_FUSTE - 0.01, z);
        ctx!.quadraticCurveTo(c0.x, c0.y, ab[0].x, ab[0].y);
        ctx!.lineTo(ab[1].x, ab[1].y);
        const c1 = P(x + RAIO * 1.3, TOPO_FUSTE - 0.01, z);
        ctx!.quadraticCurveTo(c1.x, c1.y, eq1.x, eq1.y);
        ctx!.moveTo(eq0.x, eq0.y);
        ctx!.lineTo(eq1.x, eq1.y);
      },
      larg,
      alfa,
    );
    tracar(linha([...ab, ab[0]]), larg, alfa);
  }

  // Friso de grega no plano lateral (x = lado), entre z0 e z1.
  function grega(P: ReturnType<typeof projetor>, lado: number, z0: number, z1: number, alfa: number) {
    const passo = 0.24; // largura de um módulo, em unidades de profundidade
    const topo = ARQUITRAVE - 0.02;
    const base = FRISO + 0.02;
    const h = topo - base;
    const pts: Ponto[][] = [];
    for (let z = z0; z + passo <= z1; z += passo) {
      // Gancho: sobe da linha de baixo, vira e se enrola para dentro.
      const m = (u: number, v: number) => P(lado, topo - h * v, z + passo * u);
      pts.push([m(0, 0), m(0, 0.85), m(0.75, 0.85), m(0.75, 0.25), m(0.3, 0.25), m(0.3, 0.55), m(0.52, 0.55)]);
    }
    for (const p of pts) {
      const tam = Math.abs(p[0].y - p[1].y);
      if (tam < 1.5) break;
      tracar(linha(p), Math.max(0.5, tam / 14), alfa * 0.75);
    }
    tracar(linha([P(lado, topo, z0), P(lado, topo, z1)]), 1, alfa * 0.6);
    tracar(linha([P(lado, base, z0), P(lado, base, z1)]), 1, alfa * 0.6);
  }

  function ficha(f: Ficha, tempo: number, alfa: number) {
    const cx = f.x * L;
    const cy = f.y * A;
    const r = Math.min(L, A) * 0.022 * f.z;
    const achatar = Math.abs(Math.cos(f.giro));
    ctx!.save();
    ctx!.translate(cx, cy);
    ctx!.rotate(f.incl + Math.sin(tempo * 0.0003 + f.incl) * 0.2);
    const a = alfa * (0.35 + f.z * 0.4);
    tracar(() => ctx!.ellipse(0, 0, r, Math.max(r * achatar, 0.6), 0, 0, Math.PI * 2), Math.max(0.6, f.z * 1.1), a);
    // Eixo que atravessa a ficha (cheio = absolvição, furado = condenação; aqui só o eixo).
    tracar(linha([{ x: 0, y: -r * 0.55 - r * 0.5 }, { x: 0, y: r * 0.55 + r * 0.5 }].map((p) => ({ x: p.x, y: p.y * Math.max(achatar, 0.25) }))), Math.max(0.6, f.z * 1.1), a * 0.9);
    ctx!.restore();
  }

  function desenhar(agora: number) {
    const tempo = agora - inicio;
    const p = opcoes.parado ? 1 : Math.min(tempo / DURACAO_ENTRADA, 1);

    // Paralaxe: segue o mouse; sem mouse há 3 s, balança sozinha.
    if (!opcoes.parado) {
      if (agora - ultimoMovimento > 3000) {
        alvo.x = Math.sin(tempo * 0.00018) * 0.8;
        alvo.y = Math.sin(tempo * 0.00011) * 0.5;
      }
      atual.x += (alvo.x - atual.x) * 0.04;
      atual.y += (alvo.y - atual.y) * 0.04;
    }

    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.globalCompositeOperation = "source-over";
    ctx!.globalAlpha = 1;
    ctx!.fillStyle = "#04050c";
    ctx!.fillRect(0, 0, L, A);
    ctx!.globalCompositeOperation = "lighter";
    ctx!.strokeStyle = gradiente();
    ctx!.lineCap = "round";
    ctx!.lineJoin = "round";

    const P = projetor();
    const fundo = suave((p - 0.35) / 0.5);

    // Chão: degraus do estilóbato e linhas de fuga.
    for (const [i, y] of [PISO, PISO + 0.05, PISO + 0.1].entries()) {
      for (const lado of [-1, 1]) tracar(linha([P(lado * (1 + RAIO * 2 + i * 0.06), y, 0.9), P(lado * (1 + RAIO * 2 + i * 0.06), y, FUNDO)]), 1, 0.3 * suave(p * 1.6));
    }
    for (const x of [-0.6, -0.25, 0.25, 0.6]) tracar(linha([P(x, PISO, 0.9), P(x, PISO, FUNDO)]), 0.8, 0.14 * suave(p * 1.6));

    // Fachada do fundo com frontão.
    const fw = 0.95;
    tracar(linha([P(-fw, PISO, FUNDO), P(-fw, CORNIJA, FUNDO), P(fw, CORNIJA, FUNDO), P(fw, PISO, FUNDO)]), 0.8, 0.35 * fundo);
    tracar(linha([P(-fw * 1.08, CORNIJA, FUNDO), P(0, CORNIJA - 0.42, FUNDO), P(fw * 1.08, CORNIJA, FUNDO), P(-fw * 1.08, CORNIJA, FUNDO)]), 0.9, 0.45 * fundo);
    for (let i = -3; i <= 3; i++) {
      const x = (i / 3.4) * fw;
      tracar(linha([P(x, PISO, FUNDO), P(x, TOPO_FUSTE, FUNDO)]), 0.7, 0.28 * fundo);
    }

    // Colunas: sobem do chão, da mais perto para a mais longe.
    PROFUNDIDADES.forEach((z, i) => {
      const subida = suave((p - i * 0.06) / 0.5);
      const alfa = 0.95 / Math.pow(z, 0.55);
      for (const lado of [-1, 1]) coluna(P, lado, z, subida, alfa);
    });

    // Arquitrave, friso de grega e cornija sobre as colunas.
    const viga = suave((p - 0.55) / 0.4);
    if (viga > 0) {
      const zFim = PROFUNDIDADES[0] + (FUNDO - PROFUNDIDADES[0]) * viga;
      for (const lado of [-1, 1]) {
        const ext = lado * (1 + RAIO * 1.35);
        for (const y of [ABACO, ARQUITRAVE, FRISO, CORNIJA]) tracar(linha([P(ext, y, 1.05), P(ext, y, zFim)]), 1.1, 0.7 * viga);
        grega(P, ext, 1.05, Math.min(zFim, 6.5), viga);
      }
    }

    // Fichas de voto flutuando.
    const aFichas = suave((p - 0.4) / 0.6);
    for (const f of fichas) {
      if (!opcoes.parado) {
        // Afasta do cursor ou do dedo.
        const dx = f.x * L - cursor.x;
        const dy = f.y * A - cursor.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 140 * 140 && d2 > 1) {
          const forca = (1 - Math.sqrt(d2) / 140) * 0.0009;
          f.vx += (dx / Math.sqrt(d2)) * forca;
          f.vy += (dy / Math.sqrt(d2)) * forca;
          f.vgiro += 0.0006;
        }
        f.vx *= 0.97;
        f.vy = f.vy * 0.97 + -(0.00004 + f.z * 0.00004) * 0.03;
        f.x += f.vx;
        f.y += f.vy;
        f.giro += f.vgiro * 16;
        f.vgiro = f.vgiro * 0.995 + (Math.sign(f.vgiro) || 1) * 0.000004;
        if (f.y < -0.08 || f.x < -0.1 || f.x > 1.1) Object.assign(f, novaFicha(false));
      }
      ficha(f, tempo, aFichas);
    }
  }

  function laco(agora: number) {
    if (destruido) return;
    if (!(opcoes.pausado && opcoes.pausado())) desenhar(agora);
    quadro = requestAnimationFrame(laco);
  }

  const aoRedimensionar = () => {
    medir();
    if (opcoes.parado) desenhar(performance.now());
  };
  const aoMover = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    cursor.x = x - r.left;
    cursor.y = y - r.top;
    alvo.x = (cursor.x / L) * 2 - 1;
    alvo.y = (cursor.y / A) * 2 - 1;
    ultimoMovimento = performance.now();
  };
  const aoMouse = (e: MouseEvent) => aoMover(e.clientX, e.clientY);
  const aoToque = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t) aoMover(t.clientX, t.clientY);
  };

  medir();
  window.addEventListener("resize", aoRedimensionar);
  if (opcoes.parado) {
    desenhar(performance.now());
  } else {
    window.addEventListener("mousemove", aoMouse, { passive: true });
    window.addEventListener("touchstart", aoToque, { passive: true });
    window.addEventListener("touchmove", aoToque, { passive: true });
    quadro = requestAnimationFrame(laco);
  }

  return function destruir() {
    destruido = true;
    cancelAnimationFrame(quadro);
    window.removeEventListener("resize", aoRedimensionar);
    window.removeEventListener("mousemove", aoMouse);
    window.removeEventListener("touchstart", aoToque);
    window.removeEventListener("touchmove", aoToque);
  };
}
