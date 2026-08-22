import { expect, test } from "@playwright/test";
import { env } from "../fixtures/env";
import { getFaq } from "../fixtures/db";
import {
  AGENT_TOOLS,
  assertsAffirmatively,
  faqOverlap,
  say,
  toolsUsedSince,
} from "../fixtures/conversation";
import { cleanup, resumeAfterHandoff, setupForConversation } from "../fixtures/state";

/**
 * TESTE 4 — the agent answers from the FAQ, refuses to invent, and closes the
 * conversation when the lead does not qualify.
 *
 * Everything here is LLM output, so the rule throughout is: assert a property
 * that must hold, never an exact sentence. Where a behaviour has a tool
 * attached, the tool call is the evidence — it is binary, and it survives the
 * agent rewording itself, which it does constantly.
 */

/** Below this, the overlap is logged as worth a human read. Never fatal. */
const FAQ_OVERLAP_MIN = 0.3;

/**
 * Out of scope on purpose: the agent's prompt names marketplace and graphic
 * design as triggers for handing off to a human.
 */
const OUT_OF_SCOPE =
  "Vocês fazem gestão de marketplace na Amazon e criação de embalagem para os produtos?";

/**
 * All three Bloco 1 answers negative.
 *
 * This has to be all three. The prompt sends a lead with exactly one positive
 * answer into Bloco 2 — four more questions — so a single positive would
 * quietly turn this into a different test that then fails for the wrong reason.
 */
const NEGATIVE_QUALIFICATION = [
  "Não, nunca investi em tráfego pago.",
  "Pra ser sincero meus resultados estão caindo, preciso de uma salvação urgente.",
  "Não sei, no máximo uns 500 reais. Menos de 2 mil com certeza.",
];

test("TESTE 4 — FAQ answers, no hallucination, and a clean disqualification", async () => {
  await setupForConversation();

  // Read the FAQ instead of hardcoding it: editing the FAQ in the app should
  // update this test, not break it.
  const faq = await getFaq(env.userId);
  expect(faq.length, "the account needs at least 2 FAQ entries").toBeGreaterThanOrEqual(2);

  const testStart = new Date();

  // --- 1. two questions the FAQ answers ------------------------------------
  //
  // What is asserted is that the agent CONSULTED the knowledge base and
  // answered. What is not asserted is that its wording resembles the FAQ's.
  //
  // Word overlap looked like a reasonable proxy and is not. One entry answers
  // "Podemos fazer com os 2, cabe ao cliente decidir qual ele quer usar" — a
  // sentence with almost no distinctive words. The agent replied "Dá para
  // fazer das duas formas: tanto no WhatsApp Business quanto na API Oficial…",
  // which is correct and arguably clearer, and scored 25% overlap. A threshold
  // there measures vocabulary, not correctness, and would fail good answers
  // until someone padded the FAQ with keywords.
  //
  // Judging whether a paraphrase is faithful is beyond what a deterministic
  // test can do. The overlap is kept as a logged signal for a human.
  let consultedAtLeastOnce = false;
  const answeredWithoutConsulting: string[] = [];

  for (const entry of faq.slice(0, 2)) {
    const turn = await say(entry.pergunta, `faq:${entry.pergunta.slice(0, 30)}`);
    const answer = turn.replies.join(" ");
    const overlap = faqOverlap(answer, entry.resposta);

    const tools = await toolsUsedSince(turn.since);
    const consulted = tools.has(AGENT_TOOLS.knowledgeBase);
    consultedAtLeastOnce ||= consulted;

    expect(
      answer.trim().length,
      `The agent produced no answer to "${entry.pergunta}"`,
    ).toBeGreaterThan(20);

    if (consulted) {
      console.log(
        `[teste4] "${entry.pergunta}" → consulted the FAQ, ${answer.length} chars, ` +
          `${(overlap * 100).toFixed(0)}% word overlap` +
          (overlap < FAQ_OVERLAP_MIN ? " (low — worth a human read)" : ""),
      );
    } else {
      // Not fatal, and the reason is worth stating: the agent carries the last
      // ten messages as memory, so a second question on the same subject can
      // legitimately be answered from what it just learned. What it cannot do
      // is invent, and the log is where that gets caught by a person.
      answeredWithoutConsulting.push(entry.pergunta);
      console.warn(
        `[teste4] WARNING — answered WITHOUT consulting BaseConhecimento.\n` +
          `  Question: ${entry.pergunta}\n` +
          `  FAQ says: ${entry.resposta}\n` +
          `  Agent said: ${answer}\n` +
          `  Read this: anything here beyond the FAQ line is the agent's own invention.`,
      );
    }
  }

  // The binding claim: the knowledge base is reachable and the agent does use
  // it. Requiring a call for EVERY question would fail on correct behaviour —
  // two adjacent questions on one subject only need one lookup.
  expect(
    consultedAtLeastOnce,
    `The agent answered every FAQ question without once calling BaseConhecimento. ` +
      `Either the tool is broken or nothing it said came from the knowledge base.`,
  ).toBe(true);
  if (answeredWithoutConsulting.length) {
    console.log(
      `[teste4] ${answeredWithoutConsulting.length} of ${faq.slice(0, 2).length} FAQ answers ` +
        `came from conversation memory rather than a fresh lookup`,
    );
  }

  // --- 2. a question the FAQ does not answer -------------------------------
  const offTopicSince = new Date();
  const offTopic = await say(OUT_OF_SCOPE, "out-of-scope");
  const offTopicAnswer = offTopic.replies.join(" ");

  // Primary evidence, and the one that decides: did the agent do the right
  // thing? Either it handed off, or it said it would.
  const toolsAfterOffTopic = await toolsUsedSince(offTopicSince);
  const handedOff = toolsAfterOffTopic.has(AGENT_TOOLS.callHuman);
  const saysWillCheck = /equipe|especialista|vou (chamar|passar|verificar)|encaminh/i.test(
    offTopicAnswer,
  );

  expect(
    handedOff || saysWillCheck,
    `Asked something outside its scope, the agent neither handed off to a human nor said it ` +
      `would check. Answer was:\n  ${offTopicAnswer}`,
  ).toBe(true);

  // Secondary, and deliberately NOT fatal. A naive "did it say 'fazemos'?"
  // check flags "não fazemos gestão de marketplace" — the correct answer. The
  // helper skips negated occurrences, but Portuguese negation is messy enough
  // that a false positive here should surface as a warning for a human, never
  // as a red test that pressures someone into rewording the prompt.
  const claimsIt = ["fazemos", "oferecemos", "trabalhamos com", "temos esse serviço"].filter((t) =>
    assertsAffirmatively(offTopicAnswer, t),
  );
  if (claimsIt.length > 0) {
    console.warn(
      `[teste4] WARNING — possible hallucination: the answer affirms ${claimsIt.join(", ")} ` +
        `without negation.\n  ${offTopicAnswer}`,
    );
  } else {
    console.log("[teste4] no affirmative claim about the out-of-scope service");
  }

  // --- 3. disqualify -------------------------------------------------------
  //
  // The hand-off above switches the agent off at the tenant level, and that is
  // the correct product behaviour: once a person is called in, the bot must
  // stop talking. It is also the end of the conversation as far as the agent is
  // concerned, so the qualification phase cannot simply continue — it has to
  // resume the agent on purpose. Asserting the switch happened is worth as much
  // as the hand-off assertion above: it proves the tool did something, not just
  // that it was called.
  if (handedOff) {
    const wasOff = await resumeAfterHandoff();
    expect(
      wasOff,
      "chamar_humano ran but the agent stayed ON — the hand-off did not actually hand off",
    ).toBe(true);
  } else {
    await resumeAfterHandoff();
  }

  const qualificationSince = new Date();
  let lastAnswer = "";
  for (const answer of NEGATIVE_QUALIFICATION) {
    const turn = await say(answer, "qualification-negative");
    lastAnswer = turn.replies.join(" ");
  }

  // The binding assertion. "Did not propose a meeting" means the scheduling
  // tools never ran — a fact, not an interpretation.
  const toolsAfterQualification = await toolsUsedSince(qualificationSince);
  expect(
    toolsAfterQualification.has(AGENT_TOOLS.checkAvailability),
    "VerificarHorarios ran for a lead that answered every qualifying question negatively",
  ).toBe(false);
  expect(
    toolsAfterQualification.has(AGENT_TOOLS.bookMeeting),
    "AgendarReuniao ran for a disqualified lead",
  ).toBe(false);

  // Note what is NOT asserted: the absence of the words "reunião" or "agendar".
  // The prompt tells the agent to be honest when it disqualifies, so "não faz
  // sentido agendar uma reunião agora" is the desired answer and would trip a
  // keyword ban. Vocabulary is not the behaviour under test.
  console.log(`[teste4] closing answer: ${lastAnswer}`);
  expect(lastAnswer.length, "the agent went silent instead of closing the conversation").toBeGreaterThan(0);

  console.log(`[teste4] tools used during the whole test: ${[...(await toolsUsedSince(testStart))].join(", ")}`);
  await cleanup();
});
