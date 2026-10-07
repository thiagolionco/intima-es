import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarSenha } from "../lib/auth/politica-senha.ts";
import type { Usuario } from "../server/auth/model.ts";
import type { NotificacoesDeConta } from "../server/auth/ports.ts";
import { AutenticacaoService, MAX_TENTATIVAS } from "../server/auth/services/autenticacao.ts";
import { CadastroService } from "../server/auth/services/cadastro.ts";
import { ContaService } from "../server/auth/services/conta.ts";
import type { DependenciasAuth } from "../server/auth/services/dependencias.ts";
import { DoisFatoresService } from "../server/auth/services/dois-fatores.ts";
import { RecuperacaoSenhaService } from "../server/auth/services/recuperacao-senha.ts";
import { SessaoService } from "../server/auth/services/sessoes.ts";
import { DIA, HORA, MINUTO } from "../server/core/clock.ts";
import { AppError } from "../server/core/errors.ts";
import { ArmazenamentoEmMemoria } from "../server/infra/armazenamento.ts";
import { HashScrypt } from "../server/infra/hash-scrypt.ts";
import { LimitadorEmMemoria } from "../server/infra/limitador.ts";
import { AuditoriaDocumentos, DesafioRepositoryDocumentos, SessaoRepositoryDocumentos, TokenRepositoryDocumentos, UsuarioRepositoryDocumentos } from "../server/infra/repositorios.ts";
import { base32Decodificar, hotp, Totp } from "../server/infra/totp.ts";
import { EspacoTrabalhoRepositoryDocumentos, EspacoTrabalhoService } from "../server/workspace/espaco-trabalho.ts";

const SENHA = "Tribunal#Seguro2026";
const CTX = { ip: "10.0.0.1", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0" };

/** Monta o sistema inteiro em memória, com relógio controlável e notificações capturadas. */
function montar() {
  let agora = new Date("2026-10-07T12:00:00Z").getTime();
  const clock = { agora: () => new Date(agora) };
  const avancar = (ms: number) => (agora += ms);
  const db = new ArmazenamentoEmMemoria();
  const enviados: { tipo: string; para: string; link?: string }[] = [];
  const notificacoes: NotificacoesDeConta = {
    confirmarEmail: async (u, link) => void enviados.push({ tipo: "confirmar", para: u.email, link }),
    redefinirSenha: async (u, link) => void enviados.push({ tipo: "redefinir", para: u.email, link }),
    contaJaExiste: async (u) => void enviados.push({ tipo: "ja_existe", para: u.email }),
    senhaAlterada: async (u) => void enviados.push({ tipo: "senha_alterada", para: u.email }),
    novoAcesso: async (u) => void enviados.push({ tipo: "novo_acesso", para: u.email }),
    doisFatoresAlterado: async (u, ativo) => void enviados.push({ tipo: ativo ? "2fa_on" : "2fa_off", para: u.email }),
    contaBloqueada: async (u) => void enviados.push({ tipo: "bloqueada", para: u.email }),
  };
  const totp = new Totp(clock);
  const deps: DependenciasAuth = {
    usuarios: new UsuarioRepositoryDocumentos(db),
    sessoes: new SessaoRepositoryDocumentos(db, clock),
    tokens: new TokenRepositoryDocumentos(db, clock),
    desafios: new DesafioRepositoryDocumentos(db, clock),
    auditoria: new AuditoriaDocumentos(db, clock),
    hash: new HashScrypt(2 ** 10),
    limitador: new LimitadorEmMemoria(clock),
    segundoFator: totp,
    notificacoes,
    clock,
    links: {
      entrar: () => "http://app/entrar",
      esqueciSenha: () => "http://app/esqueci-a-senha",
      confirmarEmail: (t) => `http://app/confirmar-email#token=${t}`,
      redefinirSenha: (t) => `http://app/redefinir-senha#token=${t}`,
    },
    politicaSessao: { curtaInatividade: 8 * HORA, curtaAbsoluta: DIA, longaInatividade: 30 * DIA, longaAbsoluta: 90 * DIA },
    emissor2fa: "Teste",
  };
  const espacosRepo = new EspacoTrabalhoRepositoryDocumentos(db, clock);
  const sessoes = new SessaoService(deps);
  return {
    deps,
    totp,
    avancar,
    enviados,
    token: (tipo: string) => enviados.filter((e) => e.tipo === tipo).at(-1)!.link!.split("token=")[1],
    sessoes,
    cadastro: new CadastroService(deps),
    auth: new AutenticacaoService(deps, sessoes),
    recuperacao: new RecuperacaoSenhaService(deps),
    doisFatores: new DoisFatoresService(deps),
    conta: new ContaService(deps, espacosRepo),
    espacos: new EspacoTrabalhoService(espacosRepo),
  };
}

async function contaConfirmada(s: ReturnType<typeof montar>, email = "ana@escritorio.com.br", nome = "Ana Souza") {
  await s.cadastro.cadastrar({ nome, email, senha: SENHA, aceitouTermos: true }, CTX);
  await s.cadastro.confirmarEmail(s.token("confirmar"), CTX);
  return (await s.deps.usuarios.porEmail(email)) as Usuario;
}

async function rejeita(p: Promise<unknown>, codigo: string) {
  await assert.rejects(p, (e: unknown) => e instanceof AppError && e.codigo === codigo);
}

test("política de senha exige tamanho, variedade e nada pessoal", () => {
  assert.equal(avaliarSenha("curta1A").valida, false);
  assert.equal(avaliarSenha("somenteminusculas").valida, false);
  assert.equal(avaliarSenha("AnaSouza2026!x", { nome: "Ana Souza" }).valida, false);
  assert.equal(avaliarSenha("Senha12345678").valida, false, "senhas comuns são recusadas");
  assert.equal(avaliarSenha(SENHA).valida, true);
  assert.ok(avaliarSenha(SENHA).pontuacao >= 3);
});

test("hash scrypt verifica a senha certa e recusa a errada", async () => {
  const h = new HashScrypt(2 ** 10);
  const hash = await h.gerar(SENHA);
  assert.match(hash, /^scrypt\$1024\$8\$1\$/);
  assert.equal(await h.verificar(SENHA, hash), true);
  assert.equal(await h.verificar(SENHA + "x", hash), false);
  assert.notEqual(await h.gerar(SENHA), hash, "sal aleatório");
});

test("cadastro → confirmação de e-mail → login", async () => {
  const s = montar();
  await s.cadastro.cadastrar({ nome: "Ana Souza", email: " Ana@Escritorio.com.br ", senha: SENHA, aceitouTermos: true }, CTX);
  assert.equal(s.enviados[0].tipo, "confirmar");
  assert.equal(s.enviados[0].para, "ana@escritorio.com.br");

  await rejeita(s.auth.entrar({ email: "ana@escritorio.com.br", senha: SENHA }, CTX), "email_nao_confirmado");
  await s.cadastro.confirmarEmail(s.token("confirmar"), CTX);
  const r = await s.auth.entrar({ email: "ANA@escritorio.com.br", senha: SENHA }, CTX);
  assert.equal(r.tipo, "sessao");
  if (r.tipo !== "sessao") return;
  assert.notEqual(r.sessao.id, r.token, "guardamos só o hash do token");
  const valida = await s.sessoes.validar(r.token);
  assert.equal(valida?.usuario.email, "ana@escritorio.com.br");
});

test("link de confirmação é de uso único e expira em 24 h", async () => {
  const s = montar();
  await s.cadastro.cadastrar({ nome: "Ana Souza", email: "ana@x.com.br", senha: SENHA, aceitouTermos: true }, CTX);
  const token = s.token("confirmar");
  s.avancar(DIA + MINUTO);
  await rejeita(s.cadastro.confirmarEmail(token, CTX), "token_invalido");

  await s.cadastro.reenviarConfirmacao("ana@x.com.br", CTX);
  const novo = s.token("confirmar");
  await s.cadastro.confirmarEmail(novo, CTX);
  await rejeita(s.cadastro.confirmarEmail(novo, CTX), "token_invalido");
});

test("cadastro com e-mail existente não revela a conta e avisa o titular", async () => {
  const s = montar();
  await contaConfirmada(s);
  const r = await s.cadastro.cadastrar({ nome: "Invasor Teste", email: "ana@escritorio.com.br", senha: "Outra#Chave2026x", aceitouTermos: true }, CTX);
  assert.deepEqual(r, { email: "ana@escritorio.com.br" });
  assert.equal(s.enviados.at(-1)?.tipo, "ja_existe");
  const ok = await s.auth.entrar({ email: "ana@escritorio.com.br", senha: SENHA }, CTX);
  assert.equal(ok.tipo, "sessao", "a senha original continua valendo");
});

test("mesma mensagem para e-mail inexistente e senha errada", async () => {
  const s = montar();
  await contaConfirmada(s);
  const msgs: string[] = [];
  for (const email of ["nao@existe.com", "ana@escritorio.com.br"]) {
    try {
      await s.auth.entrar({ email, senha: "Errada#123456" }, CTX);
    } catch (e) {
      msgs.push((e as AppError).codigo + (e as AppError).message);
    }
  }
  assert.equal(msgs[0], msgs[1]);
});

test(`bloqueio após ${MAX_TENTATIVAS} senhas erradas, com aviso por e-mail`, async () => {
  const s = montar();
  await contaConfirmada(s);
  for (let i = 0; i < MAX_TENTATIVAS; i++) await rejeita(s.auth.entrar({ email: "ana@escritorio.com.br", senha: "Errada#123456" }, CTX), "credenciais_invalidas");
  await rejeita(s.auth.entrar({ email: "ana@escritorio.com.br", senha: SENHA }, CTX), "conta_bloqueada");
  assert.equal(s.enviados.at(-1)?.tipo, "bloqueada");
  s.avancar(16 * MINUTO);
  assert.equal((await s.auth.entrar({ email: "ana@escritorio.com.br", senha: SENHA }, CTX)).tipo, "sessao");
});

test("limitador de taxa barra rajadas por IP", async () => {
  const s = montar();
  const outro = { ...CTX, ip: "203.0.113.9" };
  for (let i = 0; i < 30; i++) await s.auth.entrar({ email: `x${i}@y.com`, senha: "Qualquer#123456" }, outro).catch(() => undefined);
  await rejeita(s.auth.entrar({ email: "z@y.com", senha: "Qualquer#123456" }, outro), "muitas_tentativas");
});

test("sessão expira por inatividade e respeita 'manter conectado'", async () => {
  const s = montar();
  await contaConfirmada(s);
  const curta = await s.auth.entrar({ email: "ana@escritorio.com.br", senha: SENHA }, CTX);
  const longa = await s.auth.entrar({ email: "ana@escritorio.com.br", senha: SENHA, lembrar: true }, CTX);
  assert.ok(curta.tipo === "sessao" && longa.tipo === "sessao");
  s.avancar(9 * HORA);
  assert.equal(await s.sessoes.validar(curta.token), null);
  assert.ok(await s.sessoes.validar(longa.token));
});

test("encerrar outras sessões mantém só a atual", async () => {
  const s = montar();
  const u = await contaConfirmada(s);
  const a = await s.auth.entrar({ email: u.email, senha: SENHA }, CTX);
  const b = await s.auth.entrar({ email: u.email, senha: SENHA }, { ...CTX, userAgent: "iPhone Safari" });
  assert.ok(a.tipo === "sessao" && b.tipo === "sessao");
  assert.equal(s.enviados.filter((e) => e.tipo === "novo_acesso").length, 1, "alerta de novo dispositivo");
  const lista = await s.sessoes.listar(u.id, a.sessao.id);
  assert.equal(lista.length, 2);
  assert.ok(lista[0].atual);
  assert.equal(await s.sessoes.encerrarOutras(u.id, a.sessao.id, CTX), 1);
  assert.ok(await s.sessoes.validar(a.token));
  assert.equal(await s.sessoes.validar(b.token), null);
});

test("2FA: ativação, login com código, bloqueio de reutilização e código de recuperação", async () => {
  const s = montar();
  const u = await contaConfirmada(s);
  const { segredo, uri } = await s.doisFatores.iniciar(u.id);
  assert.match(uri, /^otpauth:\/\/totp\/Teste:ana%40escritorio\.com\.br\?secret=/);
  await rejeita(s.doisFatores.ativar(u.id, "000000", CTX), "codigo_invalido");
  const { codigosRecuperacao } = await s.doisFatores.ativar(u.id, s.totp.codigoAtual(segredo), CTX);
  assert.equal(codigosRecuperacao.length, 10);

  s.avancar(31_000);
  const r = await s.auth.entrar({ email: u.email, senha: SENHA }, CTX);
  assert.equal(r.tipo, "segundo_fator");
  if (r.tipo !== "segundo_fator") return;
  await rejeita(s.auth.confirmarSegundoFator({ desafio: r.desafio, codigo: "123456" }, CTX), "codigo_invalido");
  const codigo = s.totp.codigoAtual(segredo);
  const ok = await s.auth.confirmarSegundoFator({ desafio: r.desafio, codigo }, CTX);
  assert.ok(await s.sessoes.validar(ok.token));

  // O mesmo código não pode ser usado de novo (proteção contra replay).
  const r2 = await s.auth.entrar({ email: u.email, senha: SENHA }, CTX);
  assert.ok(r2.tipo === "segundo_fator");
  if (r2.tipo !== "segundo_fator") return;
  await rejeita(s.auth.confirmarSegundoFator({ desafio: r2.desafio, codigo }, CTX), "codigo_invalido");

  // Código de recuperação vale uma única vez.
  const rec = codigosRecuperacao[0].toLowerCase().replace("-", " ");
  await s.auth.confirmarSegundoFator({ desafio: r2.desafio, codigo: rec, recuperacao: true }, CTX);
  const r3 = await s.auth.entrar({ email: u.email, senha: SENHA }, CTX);
  assert.ok(r3.tipo === "segundo_fator");
  if (r3.tipo !== "segundo_fator") return;
  await rejeita(s.auth.confirmarSegundoFator({ desafio: r3.desafio, codigo: codigosRecuperacao[0], recuperacao: true }, CTX), "codigo_invalido");
  assert.equal((await s.deps.usuarios.porId(u.id))?.codigosRecuperacao.length, 9);
});

test("TOTP segue o vetor de teste da RFC 6238", () => {
  // Segredo "12345678901234567890" em base32; T = 59 s → 94287082 (8 dígitos) → 287082 (6).
  const segredo = base32Decodificar("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(hotp(segredo, 1, 8), "94287082");
  assert.equal(hotp(segredo, 1), "287082");
});

test("redefinição de senha: token de uso único, encerra sessões e desbloqueia", async () => {
  const s = montar();
  const u = await contaConfirmada(s);
  const sessao = await s.auth.entrar({ email: u.email, senha: SENHA }, CTX);
  assert.ok(sessao.tipo === "sessao");

  await s.recuperacao.solicitar("nao@existe.com", CTX); // silencioso
  await s.recuperacao.solicitar(u.email, CTX);
  const token = s.token("redefinir");
  assert.deepEqual(await s.recuperacao.verificarToken(token), { email: u.email });
  await rejeita(s.recuperacao.redefinir(token, "fraca", CTX), "senha_fraca");
  assert.ok(await s.recuperacao.verificarToken(token), "senha fraca não consome o link");

  const NOVA = "Prazo&Processual2027";
  await s.recuperacao.redefinir(token, NOVA, CTX);
  await rejeita(s.recuperacao.redefinir(token, NOVA, CTX), "token_invalido");
  assert.equal(await s.sessoes.validar(sessao.token), null, "sessões antigas encerradas");
  await rejeita(s.auth.entrar({ email: u.email, senha: SENHA }, CTX), "credenciais_invalidas");
  assert.equal((await s.auth.entrar({ email: u.email, senha: NOVA }, CTX)).tipo, "sessao");
});

test("alterar senha exige a atual e encerra as outras sessões", async () => {
  const s = montar();
  const u = await contaConfirmada(s);
  const a = await s.auth.entrar({ email: u.email, senha: SENHA }, CTX);
  const b = await s.auth.entrar({ email: u.email, senha: SENHA }, CTX);
  assert.ok(a.tipo === "sessao" && b.tipo === "sessao");
  await rejeita(s.conta.alterarSenha(a.sessao, "errada", "Nova#Chave2026xy", CTX), "senha_atual_incorreta");
  const r = await s.conta.alterarSenha(a.sessao, SENHA, "Nova#Chave2026xy", CTX);
  assert.equal(r.sessoesEncerradas, 1);
  assert.ok(await s.sessoes.validar(a.token));
  assert.equal(await s.sessoes.validar(b.token), null);
});

test("cada usuário tem seu próprio espaço de trabalho", async () => {
  const s = montar();
  const ana = await contaConfirmada(s);
  const beto = await contaConfirmada(s, "beto@outro.com.br", "Beto Lima");
  const intimacao = { id: "i1", cliente: "Construtora Alfa" };
  await s.espacos.salvar(ana.id, { intimacoes: [intimacao], termos: [], revisao: 0 });
  assert.equal((await s.espacos.carregar(ana.id)).intimacoes.length, 1);
  assert.equal((await s.espacos.carregar(beto.id)).intimacoes.length, 0, "Beto não enxerga os dados da Ana");

  // Concorrência: gravar sobre uma revisão antiga é recusado.
  await rejeita(s.espacos.salvar(ana.id, { intimacoes: [], termos: [], revisao: 0 }), "conflito");
  await rejeita(s.espacos.salvar(ana.id, { intimacoes: [{ semId: true }], termos: [], revisao: 1 }), "dados_invalidos");
});

test("exportação LGPD não inclui segredos e exclusão apaga tudo", async () => {
  const s = montar();
  const u = await contaConfirmada(s);
  await s.espacos.salvar(u.id, { intimacoes: [{ id: "i1" }], termos: [], revisao: 0 });
  const dados = await s.conta.exportar(u.id, CTX);
  const json = JSON.stringify(dados);
  assert.ok(!json.includes("scrypt$"), "sem hash de senha");
  assert.equal(dados.intimacoes.length, 1);

  await rejeita(s.conta.excluir(u.id, SENHA, "outro@email.com"), "dados_invalidos");
  await s.conta.excluir(u.id, SENHA, u.email);
  assert.equal(await s.deps.usuarios.porId(u.id), null);
  assert.equal((await s.espacos.carregar(u.id)).intimacoes.length, 0);
  assert.equal((await s.deps.auditoria.doUsuario(u.id)).length, 0);
});
