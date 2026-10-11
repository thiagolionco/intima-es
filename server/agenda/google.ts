/**
 * O mínimo da API do Google usado pelo Clepsa: OAuth (consentimento do usuário) e a Agenda.
 * Pedimos só o escopo `calendar.app.created`: o Clepsa cria uma agenda própria ("Prazos · Clepsa")
 * e só enxerga e altera o que está nela, nunca os outros compromissos do usuário.
 */
export const ESCOPO_AGENDA = "https://www.googleapis.com/auth/calendar.app.created";

export interface EventoAgenda {
  titulo: string;
  descricao: string;
  /** Dia do prazo, AAAA-MM-DD (evento de dia inteiro). */
  data: string;
}

export interface ClienteGoogle {
  urlConsentimento(op: { redirectUri: string; state: string }): string;
  /** Troca o código do retorno pelo token de renovação (refresh token). */
  trocarCodigo(codigo: string, redirectUri: string): Promise<{ refreshToken: string }>;
  /** Token de acesso de curta duração a partir do de renovação. */
  acessar(refreshToken: string): Promise<string>;
  revogar(refreshToken: string): Promise<void>;
  criarAgenda(acesso: string, nome: string): Promise<string>;
  criarEvento(acesso: string, agendaId: string, e: EventoAgenda): Promise<string>;
  atualizarEvento(acesso: string, agendaId: string, eventoId: string, e: EventoAgenda): Promise<void>;
  apagarEvento(acesso: string, agendaId: string, eventoId: string): Promise<void>;
}

/** Erro da API do Google, com o status HTTP para decidir o que fazer (404/410 = sumiu, 401 = acesso revogado). */
export class ErroGoogle extends Error {
  readonly status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroGoogle";
    this.status = status;
  }
}

const OAUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOGAR = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

function somarUmDia(data: string): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function corpoEvento(e: EventoAgenda) {
  return {
    summary: e.titulo,
    description: e.descricao,
    start: { date: e.data },
    end: { date: somarUmDia(e.data) },
    transparency: "transparent",
    // Lembrete às 9h do dia anterior, além do padrão da agenda.
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 15 * 60 }] },
  };
}

export class ClienteGoogleHttp implements ClienteGoogle {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly timeoutMs: number;

  constructor(op: { clientId: string; clientSecret: string; timeoutMs?: number }) {
    this.clientId = op.clientId;
    this.clientSecret = op.clientSecret;
    this.timeoutMs = op.timeoutMs ?? 20_000;
  }

  private async pedir<T>(url: string, init: RequestInit): Promise<T> {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!r.ok) {
      let msg = `Google respondeu ${r.status}`;
      try {
        const j = (await r.json()) as { error?: { message?: string } | string; error_description?: string };
        msg = typeof j.error === "string" ? `${j.error}${j.error_description ? `: ${j.error_description}` : ""}` : (j.error?.message ?? msg);
      } catch {}
      throw new ErroGoogle(r.status, msg);
    }
    return (r.status === 204 ? undefined : await r.json()) as T;
  }

  urlConsentimento({ redirectUri, state }: { redirectUri: string; state: string }) {
    const p = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: ESCOPO_AGENDA,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state,
    });
    return `${OAUTH}?${p}`;
  }

  async trocarCodigo(codigo: string, redirectUri: string) {
    const r = await this.pedir<{ refresh_token?: string; scope?: string }>(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: codigo, client_id: this.clientId, client_secret: this.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    if (!r.refresh_token) throw new ErroGoogle(400, "O Google não devolveu o acesso permanente. Tente conectar de novo.");
    if (!r.scope?.split(" ").includes(ESCOPO_AGENDA)) throw new ErroGoogle(403, "A permissão para criar a agenda do Clepsa não foi concedida.");
    return { refreshToken: r.refresh_token };
  }

  async acessar(refreshToken: string) {
    const r = await this.pedir<{ access_token: string }>(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: this.clientId, client_secret: this.clientSecret, grant_type: "refresh_token" }),
    });
    return r.access_token;
  }

  async revogar(refreshToken: string) {
    await this.pedir(REVOGAR, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refreshToken }) }).catch(() => undefined);
  }

  private json(acesso: string, metodo: string, corpo?: unknown): RequestInit {
    return { method: metodo, headers: { Authorization: `Bearer ${acesso}`, ...(corpo ? { "Content-Type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined };
  }

  async criarAgenda(acesso: string, nome: string) {
    const r = await this.pedir<{ id: string }>(`${API}/calendars`, this.json(acesso, "POST", { summary: nome, timeZone: "America/Sao_Paulo" }));
    return r.id;
  }

  async criarEvento(acesso: string, agendaId: string, e: EventoAgenda) {
    const r = await this.pedir<{ id: string }>(`${API}/calendars/${encodeURIComponent(agendaId)}/events`, this.json(acesso, "POST", corpoEvento(e)));
    return r.id;
  }

  async atualizarEvento(acesso: string, agendaId: string, eventoId: string, e: EventoAgenda) {
    await this.pedir(`${API}/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(eventoId)}`, this.json(acesso, "PUT", corpoEvento(e)));
  }

  async apagarEvento(acesso: string, agendaId: string, eventoId: string) {
    await this.pedir(`${API}/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(eventoId)}`, this.json(acesso, "DELETE"));
  }
}
