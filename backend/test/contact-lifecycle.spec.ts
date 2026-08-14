import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, beforeEach } from "vitest";
import { ContactLifecycleService } from "../src/contact/contact-lifecycle.service";

type AnyRecord = Record<string, unknown>;

function matchRecord(record: AnyRecord, where: AnyRecord): boolean {
  for (const [key, value] of Object.entries(where ?? {})) {
    if (value === null) {
      if (record[key] != null) return false;
      continue;
    }
    if (Array.isArray(value)) continue; // OR/arrays tratados fora
    if (record[key] !== value) return false;
  }
  return true;
}

class MockPrisma {
  companies = new Map<string, AnyRecord>();
  messages = new Map<string, AnyRecord>();
  history: AnyRecord[] = [];
  attempts: AnyRecord[] = [];
  events: AnyRecord[] = [];
  suppressions: AnyRecord[] = [];
  private seq = 0;

  private companyWhere(where: AnyRecord): AnyRecord[] {
    const { OR, ...rest } = where ?? {};
    if (OR && Array.isArray(OR)) {
      const matched: AnyRecord[] = [];
      for (const clause of OR) {
        for (const c of this.companies.values()) {
          if (matchRecord(c, clause) && !matched.includes(c)) matched.push(c);
        }
      }
      return matched;
    }
    return [...this.companies.values()].filter((c) => matchRecord(c, rest));
  }

  company = {
    findFirst: async ({ where }: { where: AnyRecord }) =>
      this.companyWhere(where)[0] ?? null,
    findUnique: async ({ where, include }: { where: AnyRecord; include?: { contacts?: unknown } }) => {
      const c = this.companies.get(where.id) ?? null;
      if (c && include?.contacts) c.contacts = c.contactsArr ?? [];
      return c;
    },
    update: async ({ where, data }: { where: AnyRecord; data: AnyRecord }) => {
      const c = this.companies.get(where.id)!;
      Object.assign(c, data);
      return c;
    },
  };

  message = {
    findFirst: async ({ where }: { where: AnyRecord }) =>
      [...this.messages.values()].find((m) => matchRecord(m, where)) ?? null,
    update: async ({ where, data }: { where: AnyRecord; data: AnyRecord }) => {
      const m = this.messages.get(where.id)!;
      Object.assign(m, data);
      return m;
    },
  };

  contactStatusHistory = {
    create: async ({ data }: { data: AnyRecord }) => {
      const h = { id: `h${++this.seq}`, createdAt: new Date(), ...data };
      this.history.push(h);
      return h;
    },
    findMany: async ({ where }: { where: AnyRecord }) =>
      this.history.filter((h) => matchRecord(h, where)),
  };

  contactAttempt = {
    create: async ({ data }: { data: AnyRecord }) => {
      const a = { id: `a${++this.seq}`, createdAt: new Date(), ...data };
      this.attempts.push(a);
      return a;
    },
    findMany: async ({ where }: { where: AnyRecord }) =>
      this.attempts.filter((a) => matchRecord(a, where)),
  };

  activityEvent = {
    create: async ({ data }: { data: AnyRecord }) => {
      const e = { id: `e${++this.seq}`, createdAt: new Date(), ...data };
      this.events.push(e);
      return e;
    },
    findMany: async ({ where }: { where: AnyRecord }) =>
      this.events.filter((e) => matchRecord(e, where)),
  };

  suppressionList = {
    findFirst: async ({ where }: { where: AnyRecord }) => {
      const { OR, ...rest } = where ?? {};
      const candidates = OR && Array.isArray(OR)
        ? this.suppressions.filter((s) => OR.some((clause) => matchRecord(s, clause)))
        : this.suppressions.filter((s) => matchRecord(s, rest));
      return candidates[0] ?? null;
    },
    create: async ({ data }: { data: AnyRecord }) => {
      const s = { id: `s${++this.seq}`, ...data };
      this.suppressions.push(s);
      return s;
    },
  };

  $transaction = async <T>(fn: (tx: MockPrisma) => Promise<T>): Promise<T> => fn(this);

  seedCompany(overrides: AnyRecord = {}) {
    const c = {
      id: "comp-1",
      organizationId: "org-1",
      name: "Clínica Bella Corpo",
      status: "PRONTO_PARA_CONTATO",
      contactStatus: "APPROVED",
      contactedConfirmedAt: null,
      deletedAt: null,
      contactsArr: [{ id: "c1", type: "WHATSAPP", valueNormalized: "+5511999999999", deletedAt: null }],
      contacts: [],
      ...overrides,
    };
    this.companies.set(c.id, c);
    return c;
  }

  seedMessage(overrides: AnyRecord = {}) {
    const m = {
      id: "msg-1",
      organizationId: "org-1",
      companyId: "comp-1",
      channel: "WHATSAPP",
      status: "APPROVED",
      content: "Olá, tudo bem?",
      contentHash: "abc",
      ...overrides,
    };
    this.messages.set(m.id, m);
    return m;
  }
}

function buildService(db: MockPrisma) {
  const prisma = db as unknown as ConstructorParameters<typeof ContactLifecycleService>[0];
  return new ContactLifecycleService(prisma);
}

const ctx = { actorId: "user-1" };

describe("ContactLifecycleService — máquina de estados de contato", () => {
  let db: MockPrisma;
  let service: ContactLifecycleService;

  beforeEach(() => {
    db = new MockPrisma();
    service = buildService(db);
  });

  describe("abrir link / copiar NUNCA confirmam envio", () => {
    it("openChatLink registra LINK_OPENED e avança para CHAT_LINK_OPENED sem marcar contato", async () => {
      db.seedCompany();
      db.seedMessage();
      const res = await service.openChatLink("org-1", "comp-1", "msg-1", ctx);

      expect(res.to).toBe("CHAT_LINK_OPENED");
      expect(res.idempotent).toBe(false);
      const company = db.companies.get("comp-1")!;
      expect(company.contactStatus).toBe("CHAT_LINK_OPENED");
      expect(company.status).toBe("PRONTO_PARA_CONTATO");
      expect(company.contactedConfirmedAt).toBeNull();
      const msg = db.messages.get("msg-1")!;
      expect(msg.status).toBe("APPROVED"); // ainda não enviada
      expect(msg.sentAt).toBeUndefined();
      expect(db.attempts.some((a) => a.action === "LINK_OPENED")).toBe(true);
      expect(db.attempts.some((a) => a.action === "SEND_CONFIRMED")).toBe(false);
    });

    it("copyMessage registra MESSAGE_COPIED sem marcar contato", async () => {
      db.seedCompany();
      db.seedMessage();
      const res = await service.copyMessage("org-1", "comp-1", "msg-1", ctx);

      expect(res.to).toBe("MESSAGE_COPIED");
      const company = db.companies.get("comp-1")!;
      expect(company.contactStatus).toBe("MESSAGE_COPIED");
      expect(company.contactedConfirmedAt).toBeNull();
      expect(db.messages.get("msg-1")!.status).toBe("APPROVED");
      expect(db.attempts.some((a) => a.action === "MESSAGE_COPIED")).toBe(true);
    });
  });

  describe("confirmação de envio", () => {
    it("confirmação explícita marca SENT e CONTACTED_CONFIRMED", async () => {
      db.seedCompany();
      db.seedMessage();
      const res = await service.confirmSend("org-1", "comp-1", "msg-1", ctx);

      expect(res.to).toBe("CONTACTED_CONFIRMED");
      expect(res.messageStatus).toBe("SENT");
      expect(res.legacyStatus).toBe("ENVIADO");
      const company = db.companies.get("comp-1")!;
      expect(company.contactStatus).toBe("CONTACTED_CONFIRMED");
      expect(company.status).toBe("ENVIADO");
      expect(company.contactedConfirmedAt).toBeInstanceOf(Date);
      const msg = db.messages.get("msg-1")!;
      expect(msg.status).toBe("SENT");
      expect(msg.sentAt).toBeInstanceOf(Date);
      expect(msg.sentByUserId).toBe("user-1");
      const attempt = db.attempts.find((a) => a.action === "SEND_CONFIRMED")!;
      expect(attempt.confirmedByUserId).toBe("user-1");
      expect(attempt.confirmedAt).toBeInstanceOf(Date);
    });

    it("rejeita confirmação sem mensagem aprovada", async () => {
      db.seedCompany({ contactStatus: "PENDING_APPROVAL" });
      db.seedMessage({ status: "DRAFT" });
      await expect(service.confirmSend("org-1", "comp-1", "msg-1", ctx)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(db.companies.get("comp-1")!.contactStatus).toBe("PENDING_APPROVAL");
    });

    it("rejeita confirmação duplicada sem recontato explícito", async () => {
      db.seedCompany({ contactStatus: "CONTACTED_CONFIRMED", contactedConfirmedAt: new Date() });
      db.seedMessage({ status: "SENT" });
      await expect(service.confirmSend("org-1", "comp-1", "msg-1", ctx)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("bloqueia confirmação quando o lead está na suppression list", async () => {
      db.seedCompany();
      db.seedMessage();
      db.suppressions.push({
        id: "s1",
        organizationId: "org-1",
        companyId: "comp-1",
        channel: "WHATSAPP",
        reason: "oposição",
      });
      await expect(service.confirmSend("org-1", "comp-1", "msg-1", ctx)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(db.companies.get("comp-1")!.contactStatus).toBe("APPROVED");
    });

    it("exige messageId", async () => {
      db.seedCompany();
      await expect(service.confirmSend("org-1", "comp-1", "", ctx)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("transições genéricas", () => {
    it("avança pelo funil após contato: CONTACTED_CONFIRMED → QUALIFIED → MEETING_BOOKED", async () => {
      db.seedCompany({ contactStatus: "CONTACTED_CONFIRMED", contactedConfirmedAt: new Date() });

      await service.transition("org-1", "comp-1", "QUALIFIED", ctx);
      expect(db.companies.get("comp-1")!.contactStatus).toBe("QUALIFIED");
      expect(db.companies.get("comp-1")!.status).toBe("INTERESSADO");

      await service.transition("org-1", "comp-1", "MEETING_BOOKED", ctx);
      expect(db.companies.get("comp-1")!.contactStatus).toBe("MEETING_BOOKED");
      expect(db.companies.get("comp-1")!.status).toBe("REUNIAO_MARCADA");
      expect(db.history.length).toBe(2);
      expect(db.events.some((e) => e.eventType === "contact.status_transition")).toBe(true);
    });

    it("rejeita transição inválida (APPROVED → MEETING_BOOKED)", async () => {
      db.seedCompany();
      await expect(
        service.transition("org-1", "comp-1", "MEETING_BOOKED", ctx),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.companies.get("comp-1")!.contactStatus).toBe("APPROVED");
      expect(db.history.length).toBe(0);
    });

    it("recontato explícito: CONVERTED → NEW limpa contactedConfirmedAt e permite novo ciclo", async () => {
      db.seedCompany({ contactStatus: "CONVERTED", contactedConfirmedAt: new Date() });
      db.seedMessage({ status: "SENT" });

      const res = await service.transition("org-1", "comp-1", "NEW", ctx);
      expect(res.ok).toBe(true);
      const company = db.companies.get("comp-1")!;
      expect(company.contactStatus).toBe("NEW");
      expect(company.contactedConfirmedAt).toBeNull();
      expect(company.status).toBe("NOVO");

      // Reaprova e confirma novo envio — agora permitido
      db.messages.get("msg-1")!.status = "APPROVED";
      const again = await service.confirmSend("org-1", "comp-1", "msg-1", ctx);
      expect(again.to).toBe("CONTACTED_CONFIRMED");
      expect(company.contactedConfirmedAt).toBeInstanceOf(Date);
      expect(db.events.some((e) => e.eventType === "contact.recontacted")).toBe(true);
    });
  });

  describe("resposta e opt-out", () => {
    it("registerReply move para REPLIED e registra tentativa", async () => {
      db.seedCompany({ contactStatus: "CONTACTED_CONFIRMED", contactedConfirmedAt: new Date() });
      const res = await service.registerReply("org-1", "comp-1", { ...ctx, content: "Pode sim!" });

      expect(res.to).toBe("REPLIED");
      expect(db.companies.get("comp-1")!.status).toBe("RESPONDEU");
      const attempt = db.attempts.find((a) => a.action === "REPLY_REGISTERED")!;
      expect(attempt.metadata.content).toBe("Pode sim!");
    });

    it("registerOptOut insere suppression, move para OPT_OUT e registra tentativa", async () => {
      db.seedCompany({ contactStatus: "CONTACTED_CONFIRMED", contactedConfirmedAt: new Date() });
      const res = await service.registerOptOut("org-1", "comp-1", { ...ctx, reason: "não tenho interesse" });

      expect(res.to).toBe("OPT_OUT");
      expect(db.companies.get("comp-1")!.status).toBe("OPT_OUT");
      expect(db.suppressions.some((s) => s.companyId === "comp-1" && s.channel === "WHATSAPP")).toBe(true);
      expect(db.attempts.some((a) => a.action === "OPT_OUT_REGISTERED")).toBe(true);
    });
  });

  describe("compatibilidade legado (contactStatus nulo)", () => {
    it("permite backfill para CONTACTED_CONFIRMED e aplica o mapeamento legado", async () => {
      db.seedCompany({ contactStatus: null, status: "PRONTO_PARA_CONTATO" });
      db.seedMessage();
      const res = await service.confirmSend("org-1", "comp-1", "msg-1", ctx);

      expect(res.to).toBe("CONTACTED_CONFIRMED");
      expect(res.from).toBeNull();
      expect(db.companies.get("comp-1")!.status).toBe("ENVIADO");
      expect(db.history[0].transition).toContain("legacy.backfill");
    });

    it("registra histórico com actorId e messageId", async () => {
      db.seedCompany({ contactStatus: "APPROVED" });
      db.seedMessage();
      await service.openChatLink("org-1", "comp-1", "msg-1", ctx);

      const h = db.history[0];
      expect(h.actorId).toBe("user-1");
      expect(h.messageId).toBe("msg-1");
      expect(h.toStatus).toBe("CHAT_LINK_OPENED");
    });
  });

  describe("getLifecycle", () => {
    it("retorna estado atual, histórico, tentativas e eventos", async () => {
      db.seedCompany({ contactStatus: "APPROVED" });
      db.seedMessage();
      await service.openChatLink("org-1", "comp-1", "msg-1", ctx);
      await service.copyMessage("org-1", "comp-1", "msg-1", ctx);

      const state = await service.getLifecycle("org-1", "comp-1");
      expect(state.contactStatus).toBe("MESSAGE_COPIED");
      expect(state.legacyStatus).toBe("PRONTO_PARA_CONTATO");
      expect(state.history.length).toBe(2);
      expect(state.attempts.length).toBe(2);
      expect(state.events.length).toBe(2);
    });

    it("NotFound para lead de outra organização", async () => {
      db.seedCompany();
      await expect(service.getLifecycle("org-2", "comp-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
