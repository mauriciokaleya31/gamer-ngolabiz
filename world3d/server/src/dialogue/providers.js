/**
 * Fornecedores de modelos de linguagem (chamados APENAS pelo servidor).
 * A chave de API vem de variáveis de ambiente e nunca é enviada ao cliente,
 * guardada na base de dados do mundo, registada em logs ou incluída em prompts.
 *
 * O NgolaBiz Gamer já usa a OpenRouter (includes/ArenaAIEngine.php); reutilizamos o
 * mesmo fornecedor por omissão. Outros fornecedores podem ser adicionados aqui.
 */

export class ProviderError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export function createOpenRouterProvider({ apiKey = process.env.OPENROUTER_API_KEY, endpoint = 'https://openrouter.ai/api/v1/chat/completions', referer = 'https://gamer.ngolabiz.it.ao', fetchImpl = globalThis.fetch } = {}) {
  return {
    name: 'openrouter',
    available: () => Boolean(apiKey),
    async complete({ model, messages, maxTokens, temperature, timeoutMs }) {
      if (!apiKey) throw new ProviderError('API key não configurada', 'no_key');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': referer,
            'X-Title': 'NgolaBiz World 3D NPC',
          },
          body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
        });
        if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, 'http');
        const json = await res.json();
        const msg = json?.choices?.[0]?.message;
        const text = (msg?.content ?? '').trim();
        if (!text) throw new ProviderError('resposta vazia', 'empty');
        return { text, usage: json.usage ?? null, model: json.model ?? model };
      } catch (e) {
        if (e.name === 'AbortError') throw new ProviderError('tempo esgotado', 'timeout');
        if (e instanceof ProviderError) throw e;
        throw new ProviderError(e.message, 'network');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Fornecedor de teste/demonstração: determinístico e offline. */
export function createMockProvider({ reply = null, delayMs = 0, fail = null } = {}) {
  const calls = [];
  return {
    name: 'mock',
    calls,
    available: () => true,
    async complete(req) {
      calls.push(req);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (fail) throw new ProviderError(fail, fail);
      if (delayMs > req.timeoutMs) throw new ProviderError('tempo esgotado', 'timeout');
      const last = req.messages.at(-1)?.content ?? '';
      return { text: typeof reply === 'function' ? reply(req) : reply ?? `(mock) Recebi: ${last.slice(0, 60)}`, usage: { total_tokens: 50 }, model: 'mock' };
    },
  };
}

export function createDisabledProvider() {
  return { name: 'none', available: () => false, async complete() { throw new ProviderError('IA desligada', 'disabled'); } };
}
