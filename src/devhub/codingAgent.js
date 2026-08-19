// ─── Developer Hub: Coding Agent ─────────────────────────────
// Real, scoped feature: four honest modes over code the user actually
// pastes in. No fake "AI writes your whole app" claims — this reads
// real code and gives real, structured help, the way a competent
// senior dev reviewing a PR would.
//
// Each mode builds a deliberately different prompt (not just "explain
// this" with a mode label swapped in) because the actual reasoning
// asked of the model differs: bug-fixing wants root-cause + patch,
// review wants a severity-ranked list, docs wants structure without
// changing behavior.

const MAX_CODE_LENGTH = 20000; // ~a few hundred lines — enough for a real file, not enough to blow past context/cost

function truncate(code) {
  return code.length > MAX_CODE_LENGTH ? code.slice(0, MAX_CODE_LENGTH) + '\n\n// ...truncated (exceeds 20,000 char limit)' : code;
}

function buildPrompt(mode, code, language, extra) {
  const lang = language || 'unspecified — infer it from the code';
  const block = `\`\`\`${language || ''}\n${truncate(code)}\n\`\`\``;

  switch (mode) {
    case 'explain':
      return [
        { role: 'system', content: `You are a senior software engineer explaining code clearly to someone learning. Language: ${lang}. Explain what the code does, how it flows, and call out any non-obvious parts. Be concrete — reference actual variable/function names from the code, not generic descriptions. Keep it structured with short sections, not one long paragraph.` },
        { role: 'user', content: `Explain this code:\n\n${block}` }
      ];

    case 'fix': {
      const errorNote = extra?.errorMessage ? `\n\nThe error/symptom reported is:\n${extra.errorMessage}` : '';
      return [
        { role: 'system', content: `You are a senior software engineer debugging real code. Language: ${lang}. Find the actual root cause — do not guess or hand-wave. Respond in this exact structure:\n1. ROOT CAUSE: one or two sentences, specific to this code\n2. FIX: the corrected code (only the changed portion if the file is long, with enough surrounding context to place it)\n3. WHY THIS WORKS: brief, concrete explanation\nIf you cannot find a definite bug, say so plainly instead of inventing one.` },
        { role: 'user', content: `Find and fix the bug in this code:${errorNote}\n\n${block}` }
      ];
    }

    case 'review':
      return [
        { role: 'system', content: `You are doing a real code review, the way a careful senior engineer reviews a pull request. Language: ${lang}. Find genuine issues only — do not invent problems to seem thorough, and do not just praise the code. For each real issue found, respond as a numbered list with:
- Severity: Critical / Warning / Suggestion
- Location: which function/line/section
- Issue: what's actually wrong
- Fix: concrete suggestion
If the code is genuinely solid, say so plainly and list at most minor suggestions. End with a one-line overall verdict.` },
        { role: 'user', content: `Review this code:\n\n${block}` }
      ];

    case 'refactor': {
      const goal = extra?.goal ? `\n\nSpecific goal for this refactor: ${extra.goal}` : '\n\nGeneral goal: improve readability and maintainability without changing behavior.';
      return [
        { role: 'system', content: `You are refactoring real code. Language: ${lang}. Preserve exact behavior — refactoring must not change what the code does, only how it's written. Return the refactored code, then a short bullet list of what changed and why. If the code is already well-written for the stated goal, say so instead of changing things just to change them.` },
        { role: 'user', content: `Refactor this code:${goal}\n\n${block}` }
      ];
    }

    case 'docs':
      return [
        { role: 'system', content: `You are writing documentation for real code. Language: ${lang}. Generate accurate docstrings/comments matching the language's real convention (e.g. JSDoc for JS, docstrings for Python). Document what parameters/returns/behavior ACTUALLY are based on the code — never invent behavior the code doesn't have. Return the code with documentation added, not a separate description.` },
        { role: 'user', content: `Generate documentation for this code:\n\n${block}` }
      ];

    // NOTE: for 'generate' and 'scaffold', the `code` parameter is
    // repurposed as a natural-language DESCRIPTION, not existing code to
    // read. Kept as the same parameter (rather than adding a separate
    // field) to keep the API surface simple — but this distinction
    // matters, so it's documented here and validated explicitly in
    // runCodingAgent below.
    case 'generate': {
      const langNote = language ? `Language/framework: ${language}.` : 'Infer the most appropriate language from the request; state your choice.';
      return [
        { role: 'system', content: `You are a senior software engineer writing new code from a description. ${langNote} Write complete, working code — not a sketch or pseudocode. Include brief comments only where the logic isn't self-evident. After the code, add a short "Assumptions" section listing anything you had to infer or assume because the request was ambiguous, so the user can correct you rather than silently getting the wrong thing.` },
        { role: 'user', content: `Write code for this request:\n\n${truncate(code)}` }
      ];
    }

    case 'test': {
      const framework = extra?.framework ? ` using ${extra.framework}` : ' using a standard/idiomatic test framework for this language';
      return [
        { role: 'system', content: `You are writing real unit tests for real code. Language: ${lang}. Write tests${framework}. Cover: the normal/expected case, at least one edge case, and at least one failure/error case. Tests must actually exercise the real function names/behavior shown in the code — do not invent functions that aren't there. If the code has an obvious untestable design flaw (e.g. hidden global state, no return value), say so briefly before the tests.` },
        { role: 'user', content: `Write tests for this code:\n\n${block}` }
      ];
    }

    case 'scaffold': {
      const langNote = language ? `Primary language/stack: ${language}.` : 'Choose an appropriate, commonly-used stack and state your choice.';
      return [
        { role: 'system', content: `You are scaffolding the initial structure for a new small project from a description. ${langNote} Output a clear file tree (as a list), then for each file show its starter content in a labeled code block (\`\`\`filename.ext). Keep starter content minimal but genuinely runnable — a real "hello world"-level skeleton, not empty stub files. This is a STARTING POINT for the user to build on, not a finished app — say so explicitly, and do not claim it has features beyond what's actually in the generated files.` },
        { role: 'user', content: `Scaffold a project for this request:\n\n${truncate(code)}` }
      ];
    }

    default:
      throw new Error(`Unknown coding agent mode: ${mode}`);
  }
}

const VALID_MODES = ['explain', 'fix', 'review', 'refactor', 'docs', 'generate', 'test', 'scaffold'];
const DESCRIPTION_MODES = ['generate', 'scaffold']; // modes where `code` is actually a description, not code to read

// getAIReply is passed in (not required directly) to avoid a circular
// import with index.js, same pattern already used for Victus's
// learnFromConversation.
async function runCodingAgent({ mode, code, language, extra }, getAIReply, signal) {
  if (!VALID_MODES.includes(mode)) {
    throw new Error(`mode must be one of: ${VALID_MODES.join(', ')}`);
  }
  if (!code || typeof code !== 'string' || !code.trim()) {
    throw new Error(DESCRIPTION_MODES.includes(mode) ? 'description is required' : 'code is required');
  }

  const messages = buildPrompt(mode, code, language, extra);
  const { reply, provider } = await getAIReply(messages, 'auto', signal);
  return { mode, result: reply, provider };
}

module.exports = { runCodingAgent, VALID_MODES, DESCRIPTION_MODES };
