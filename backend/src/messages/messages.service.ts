import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { GuardrailsService } from "../ai/guardrails.service";
import { messageGenerationSchema, type MessageGeneration, type LlmAnalysis } from "../analysis/analysis.schemas";
import { hashContent } from "../leads/normalization.service";
import { ContactLifecycleService } from "../contact/contact-lifecycle.service";
import { FindingsService } from "../analysis/findings.service";
import { config } from "../config/env";
import type { Message, MessageStatus } from "@prisma/client";

/** Constrói o link oficial de clique para conversar (wa.me) com texto pré-preenchido. */
export function buildWaMeUrl(phoneE164: string, text: string): string {
  const phoneDigits = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  GOOGLE: "Google",
  LINKEDIN: "LinkedIn",
};

/** De onde o SDR "encontrou" o lead: perfis sociais públicos ou Google. */
function buildWhereFound(profiles: Array<{ platform: string }>): string {
  const labels = profiles
    .map((p) => PLATFORM_LABELS[p.platform] ?? p.platform)
    .filter(Boolean);
  if (labels.length === 0) return "Google";
  if (labels.length === 1) return `no ${labels[0]}`;
  return `no ${labels.slice(0, -1).join(", ")} e no ${labels[labels.length - 1]}`;
}

function buildSystemPrompt(senderName: string): string {
  return `Você é um SDR especialista em prospecção por WhatsApp. Seu objetivo é gerar a PRIMEIRA mensagem para um lead.

REGRAS:
1. Tom: Profissional, direto, sem parecer spam. 3 a 4 parágrafos curtos, separados por quebra de linha (formato WhatsApp).
2. Começar sempre com "Bom dia/Boa tarde/Boa noite {nome_empresa}!" (escolha o cumprimento pelo horário do Brasil).
3. Mostrar que você pesquisou o negócio dele (use as observações e os fatos verificáveis fornecidos em "DADOS DO LEAD").
4. Oferecer algo gratuito e específico: "montei uma demonstração".
5. Finalizar com pergunta de permissão: "Posso te mandar pra você ver? É bem rápido."
6. Máximo 600 caracteres no total.

Você escreve como ${senderName}, da Aurora Code Tech, mas NUNCA comece a mensagem com o nome da empresa nem com jargão comercial ("Sou da Aurora", "Estamos entrando em contato").

DADOS DO LEAD (enviados no prompt do usuário):
- nome_empresa, ramo, tem_site (SIM|NÃO), url_site, observacoes, onde_encontrou.

TAREFA — siga 1 dos 2 casos:

CASO 1: SE tem_site = SIM
Use algo que você viu no site para personalizar. Ex: produto, serviço, falta de catálogo, site lento.
Estrutura:
Bom dia {nome_empresa}!
Vi o site de vocês e notei que {observacoes}. Trabalho com presença digital para empresas de {ramo} que querem transformar Instagram/Google em orçamento pelo WhatsApp.
Inclusive montei uma demonstração de como um {ramo} pode ter {beneficio_especifico_pelo_site} para trazer mais clientes, aumentar as vendas e o faturamento.
Posso te mandar pra você ver? É bem rápido.

CASO 2: SE tem_site = NÃO
Foque na falta de site e no Instagram/Google.
Estrutura:
Bom dia {nome_empresa}!
Vi vocês no {onde_encontrou} e notei que {observacoes}. Trabalho com presença digital para empresas de {ramo} que querem transformar Instagram/Google em orçamento pelo WhatsApp.
Inclusive montei uma demonstração de como um {ramo} pode ter uma página com catálogo de produtos, solicitação de orçamento e loja virtual para trazer mais clientes, aumentar as vendas e o faturamento.
Posso te mandar pra você ver? É bem rápido.

REGRAS ADICIONAIS:
1. Português brasileiro. Use SOMENTE as observações/evidências fornecidas para personalizar. NUNCA invente fatos, métricas, nomes ou elogios não comprovados.
2. NÃO use frases de urgência ou promessas exageradas ("urgente", "só hoje", "garantido", "resultados garantidos").
3. UMA única pergunta por mensagem (a de permissão no final). Máximo 1 emoji por mensagem, só se natural.
4. Não envie links, arquivos ou imagens no primeiro contato.
5. Se as observações forem insuficientes, retorne status="manual_review" e messages=[].

FORMATO DE SAÍDA (JSON estrito) — retorne EXATAMENTE UMA mensagem no array:
{ "status": "ready|manual_review", "messages": [ { "length": "long", "text": "...", "personalization_evidence": ["..."] } ] }`;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly guardrails: GuardrailsService,
    private readonly lifecycle: ContactLifecycleService,
    private readonly findings: FindingsService,
  ) {}

  /** Gera 1 rascunho de primeira mensagem (SDR) com evidências e grava como DRAFT (nunca envia). */
  async generate(orgId: string, companyId: string): Promise<MessageGeneration> {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, organizationId: orgId, deletedAt: null },
      include: {
        analysisRuns: { orderBy: { createdAt: "desc" }, take: 1 },
        websites: { where: { deletedAt: null }, take: 1 },
        socialProfiles: { where: { deletedAt: null } },
      },
    });
    if (!company) throw new NotFoundException("Lead não encontrado");

    const analysis = company.analysisRuns[0];
    if (!analysis || analysis.status === "FAILED") {
      return { status: "manual_review", messages: [] };
    }

    // Personalização SOMENTE com findings aprovados (filtro de evidências
    // permitidas): fatos/inferências evidenciados e confiáveis do último run.
    const eligible = await this.findings.getEligibleFindings(orgId, companyId);

    const points = eligible.map((f) => {
      const ev = f.evidence[0];
      if (ev?.extractedText) return `${f.claim} — ${ev.extractedText}`;
      if (typeof ev?.metricValue === "number" && ev.metricName) {
        return `${f.claim} — ${ev.metricName}: ${ev.metricValue}`;
      }
      return f.claim;
    });

    const output = analysis.output as unknown as LlmAnalysis;
    const risks = Array.isArray(output.risks) ? output.risks.map((r) => r.claim) : [];

    if (points.length === 0) {
      return { status: "manual_review", messages: [] };
    }

    // Dados do lead para o prompt do SDR (sem PII de telefones/e-mails).
    const website = company.websites[0];
    const payload: Record<string, unknown> = {
      nome_empresa: company.name,
      ramo: company.category ?? "serviços",
      tem_site: website ? "SIM" : "NÃO",
      url_site: website?.url ?? null,
      observacoes: points,
      onde_encontrou: buildWhereFound(company.socialProfiles),
      personalization_points: points,
      risks,
    };

    // Regenerar substitui os rascunhos antigos (nunca mensagens aprovadas).
    await this.prisma.message.deleteMany({
      where: { organizationId: orgId, companyId, status: "DRAFT" },
    });

    // Até MAX_GENERATION_ATTEMPTS tentativas: se a IA exceder os guardrails,
    // repetimos com feedback corretivo. Sempre grava apenas UMA mensagem.
    const MAX_GENERATION_ATTEMPTS = 2;
    let feedbackReasons: string[] = [];

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const attemptPayload: Record<string, unknown> = { ...payload };
      if (feedbackReasons.length > 0) {
        attemptPayload.feedback_previous_attempt = {
          rejected: true,
          reasons: feedbackReasons,
          instruction:
            "A tentativa anterior foi rejeitada. Reescreva a MENSAGEM ÚNICA respeitando exatamente o limite de 600 caracteres e as regras acima.",
        };
      }

      const res = await this.ai.provider.generateStructured({
        systemPrompt: buildSystemPrompt(config.SENDER_NAME),
        userPrompt: JSON.stringify(attemptPayload),
        schema: messageGenerationSchema,
        temperature: 0.5,
      });

      const generation = res.value;

      // Guardrails no código + persistência do DRAFT aprovado (apenas o primeiro).
      const drafts: MessageGeneration = { status: "manual_review", messages: [] };
      feedbackReasons = [];
      const msg = generation.messages[0];
      if (msg) {
        const verdict = this.guardrails.check(
          msg.text,
          msg.length,
          msg.personalization_evidence,
        );
        if (verdict.ok) {
          drafts.status = "ready";
          drafts.messages.push(msg);
          await this.prisma.message.create({
            data: {
              organizationId: orgId,
              companyId,
              channel: "WHATSAPP",
              status: "DRAFT",
              content: msg.text,
              contentHash: hashContent(msg.text),
              providerConfig: { length: msg.length, personalization_evidence: msg.personalization_evidence },
            },
          });
        } else {
          this.logger.warn(`Rascunho rejeitado pelos guardrails: ${verdict.reasons.join("; ")}`);
          feedbackReasons.push(`${msg.length}: ${verdict.reasons.join("; ")}`);
        }
      }

      if (drafts.messages.length > 0) {
        await this.lifecycle.transition(orgId, companyId, "MESSAGE_GENERATED", {
          actorType: "system",
          metadata: { draftCount: drafts.messages.length, generatedBy: "manual" },
        });
        return drafts;
      }
    }

    return { status: "manual_review", messages: [] };
  }

  /** Aprova um DRAFT (Modo A — envio só após aprovação humana). */
  async approve(orgId: string, messageId: string, actorId?: string): Promise<{ status: MessageStatus }> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, organizationId: orgId },
    });
    if (!message) throw new NotFoundException("Mensagem não encontrada");
    if (message.status !== "DRAFT") {
      return { status: message.status };
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { status: "APPROVED", approvedById: actorId ?? null, approvedAt: new Date() },
    });

    await this.lifecycle.transition(orgId, message.companyId, "APPROVED", {
      actorId,
      messageId,
    });

    return { status: updated.status };
  }

  /** Lista as mensagens de um lead (para a fila de revisão/envio manual). */
  async listForCompany(orgId: string, companyId: string): Promise<Message[]> {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, organizationId: orgId, deletedAt: null },
    });
    if (!company) throw new NotFoundException("Lead não encontrado");

    return this.prisma.message.findMany({
      where: { organizationId: orgId, companyId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Link oficial de clique para conversar (wa.me) com a mensagem aprovada
   * pré-preenchida. Envio 100% manual: o operador clica e envia no próprio
   * WhatsApp. Nunca automatiza a sessão do WhatsApp Web.
   */
  async buildChatLink(orgId: string, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, organizationId: orgId },
      include: {
        company: {
          include: { contacts: { where: { deletedAt: null } } },
        },
      },
    });
    if (!message) throw new NotFoundException("Mensagem não encontrada");

    if (message.status !== "APPROVED") {
      throw new NotFoundException(
        `Mensagem precisa estar aprovada (status atual: ${message.status}) para gerar o link de envio manual`,
      );
    }

    const contact =
      message.company.contacts.find((c) => c.type === "WHATSAPP" && c.isValid && c.valueNormalized.startsWith("55")) ??
      message.company.contacts.find((c) => c.type === "PHONE" && c.isValid && c.valueNormalized.startsWith("55")) ??
      message.company.contacts.find((c) => (c.type === "WHATSAPP" || c.type === "PHONE") && c.isValid);

    if (!contact) {
      throw new NotFoundException("Lead sem telefone/WhatsApp válido para envio manual");
    }

    const suppressed = await this.prisma.suppressionList.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { companyId: message.companyId },
          { contact: contact.valueNormalized, channel: "WHATSAPP" },
          { contact: contact.valueNormalized, channel: "PHONE" },
        ],
      },
    });
    if (suppressed) {
      throw new NotFoundException("Contato suprimido (opt-out/oposição) — envio bloqueado");
    }

    const url = buildWaMeUrl(contact.valueNormalized, message.content);

    return {
      url,
      phone: contact.valueNormalized,
      snippet: message.content.slice(0, 80),
      opensNewWindow: true,
      note: "Envio manual: você clica, revisa no WhatsApp e envia. O sistema não automatiza sua sessão.",
    };
  }
}