import { expect, type Locator, type Page } from "@playwright/test";
import { env } from "./env";

/**
 * Page helpers for the leads board.
 *
 * The app has no `data-testid` anywhere, so locators lean on two things that do
 * exist and are stable: accessible roles/names (the UI is entirely pt-BR, hence
 * the Portuguese strings), and the `data-rfd-*` attributes that
 * `@hello-pangea/dnd` injects — `data-rfd-draggable-id` is the lead's uuid and
 * `data-rfd-droppable-id` is the column's status. Those two give an exact
 * handle per lead and per column without touching application code.
 */

/** Column status -> the label rendered in its header. */
export const COLUMN_LABELS = {
  NEW: "Novo",
  COPY_PENDING: "Preparar Copy",
  COPY_READY: "Copy Pronta",
  SEND_PENDING: "Enviar Mensagem",
  SENT: "Enviado",
  IN_CONVERSATION: "Em Conversa",
} as const;

export type ColumnStatus = keyof typeof COLUMN_LABELS;

export async function login(page: Page): Promise<void> {
  // The onboarding modal only opens when `onboarding_completed` is false, which
  // it is not for this account — but seeding the dismissal costs nothing and
  // removes a whole class of "a dialog ate my click".
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("onboarding_dismissed", "1");
    } catch {
      /* private mode; the modal guard below still covers it */
    }
  });

  await page.goto(`${env.appUrl}/login`);
  await page.getByLabel("Email").fill(env.appEmail);
  await page.getByLabel("Senha").fill(env.appPassword);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Login has no explicit navigate; the route guard redirects once the session
  // lands. Waiting on the URL rather than a toast avoids racing the toast.
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
  await dismissModals(page);
}

/**
 * Closes whatever modal may be covering the page.
 *
 * `AnnouncementModal` mounts on every shell page and can appear at any
 * navigation, so this runs after each one rather than only after login.
 */
export async function dismissModals(page: Page): Promise<void> {
  for (const name of ["Fechar", "Entendi"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => undefined);
    }
  }
}

export async function gotoBoard(page: Page): Promise<void> {
  await page.goto(`${env.appUrl}/leads/board`);
  await expect(page.getByRole("button", { name: "Buscar Novos Leads" })).toBeVisible({
    timeout: 60_000,
  });

  // Waiting for the shell is not enough. The leads arrive from a separate React
  // Query fetch, and until they do every column is empty — which makes card
  // counts read zero, and makes a column's "Selecionar" button (rendered only
  // when the column is non-empty) missing. Both produce failures that look
  // like the lead is in the wrong place.
  await expect(
    page.locator("[data-rfd-draggable-id]").first(),
    "The board rendered but no lead cards appeared — the account should never have zero leads",
  ).toBeVisible({ timeout: 60_000 });

  await dismissModals(page);
}

export function column(page: Page, status: ColumnStatus): Locator {
  return page.locator(`[data-rfd-droppable-id="${status}"]`);
}

export function card(page: Page, leadId: string): Locator {
  return page.locator(`[data-rfd-draggable-id="${leadId}"]`);
}

/** Matches the selection bar's "N selecionado(s) em <coluna>" label. */
export function bulkBarPattern(status: ColumnStatus): RegExp {
  return new RegExp(`\\d+\\s+selecionados?\\s+em\\s+${COLUMN_LABELS[status]}`);
}


/**
 * Waits for `leadId` to appear inside the column for `status`.
 *
 * Auto-waiting matters here. `gotoBoard` resolves as soon as the page shell is
 * up, but the leads arrive from a separate React Query fetch a moment later, so
 * a point-in-time `isVisible()` reports false for a card that is about to
 * render — a false failure that looks exactly like a real one.
 */
export async function expectCardInColumn(
  page: Page,
  leadId: string,
  status: ColumnStatus,
  timeout = 30_000,
): Promise<void> {
  await expect(
    column(page, status).locator(`[data-rfd-draggable-id="${leadId}"]`),
    `lead ${leadId} should be in "${COLUMN_LABELS[status]}"`,
  ).toBeVisible({ timeout });
}

/**
 * Opens the search dialog and starts a search with the account's saved ICP.
 *
 * The niche, state and city are left exactly as the account has them. Changing
 * a select would make the app persist the new ICP to the operator's profile,
 * which is a write this suite is not authorised to make — and the selects only
 * render their placeholder text while empty, so on a configured account there
 * is nothing stable to click anyway.
 *
 * There is no country field at all: the location picker is Brazil-only by
 * design, so "is the lead in Brazil?" is asserted against the database.
 */
export async function searchLeads(page: Page, opts: { quantity: number }): Promise<void> {
  await page.getByRole("button", { name: "Buscar Novos Leads" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Preencha os filtros abaixo e inicie a busca")).toBeVisible();

  // If the account had no saved niche the dialog would refuse with an inline
  // error, and the failure would look like a product defect rather than a
  // missing precondition. Say so plainly instead.
  const emptyNiche = dialog.getByText("Selecione o nicho principal");
  if (await emptyNiche.isVisible().catch(() => false)) {
    throw new Error(
      "The test account has no Nicho Principal saved in its ICP. Set it once in the " +
        "app (Buscar Novos Leads → Nicho Principal) so the suite can run without " +
        "writing to the profile.",
    );
  }

  await dialog.locator("#search-quantity").fill(String(opts.quantity));
  await dialog.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/**
 * Moves specific leads between columns using the selection bar.
 *
 * Deliberately not drag-and-drop. `@hello-pangea/dnd` drives itself from
 * pointer events rather than the HTML5 drag API, so Playwright's `dragTo()`
 * does nothing and a synthesised mouse drag across a horizontally scrolling
 * 10-column board is a flake generator. `handleBulkMove` and `onDragEnd` funnel
 * into the same `handleCopyRequest` / `handleSendRequest`, so this exercises
 * identical business logic.
 *
 * Selecting explicit ids also avoids the "Preparar Copy de Todos" button, which
 * would fire a generation for every lead sitting in the column — 46 of them on
 * this account, at 3 credits each.
 */
export async function moveLeads(
  page: Page,
  opts: { from: ColumnStatus; to: ColumnStatus; leadIds: string[] },
): Promise<void> {
  // The Droppable wraps the WHOLE column card — header included — so the
  // column's own "Selecionar" button is already inside `column()`. No ancestor
  // walking is needed, and attempting it lands on the wrapper that holds all
  // ten columns, which puts select mode on the wrong one.
  const selectButton = column(page, opts.from).getByRole("button", {
    name: "Selecionar",
    exact: true,
  });
  await expect(
    selectButton,
    `No "Selecionar" button on the "${COLUMN_LABELS[opts.from]}" column. An empty column ` +
      `does not render one, so the lead is probably not where the test expects it.`,
  ).toBeVisible({ timeout: 15_000 });
  await selectButton.click();

  for (const id of opts.leadIds) {
    const checkbox = card(page, id).getByRole("checkbox", { name: "Selecionar lead" });
    await expect(
      checkbox,
      `No selection checkbox on lead ${id}. Either the card is not in ` +
        `"${COLUMN_LABELS[opts.from]}", or select mode was entered on another column.`,
    ).toBeVisible({ timeout: 15_000 });
    await checkbox.click();
  }

  // The bulk bar is a fixed overlay outside the column subtree, and it names the
  // column it is acting on — which is exactly the mistake worth catching here.
  // The label is "1 selecionado em Novo" / "2 selecionados em Novo": singular
  // and plural, not the literal "selecionado(s)".
  await expect(
    page.getByText(bulkBarPattern(opts.from)),
    `The bulk bar is not acting on "${COLUMN_LABELS[opts.from]}" — select mode landed on the wrong column`,
  ).toBeVisible({ timeout: 10_000 });

  await page.getByText("Mover para...").click();
  await page
    .getByRole("option", { name: new RegExp(`^${COLUMN_LABELS[opts.to]}`) })
    .first()
    .click();
  await page.getByRole("button", { name: "Mover", exact: true }).click();
}

/**
 * Asserts that the lead's detail page really shows the copy stored for it.
 *
 * Checks the text rather than scraping a container: the copy sits in a bare
 * `<p>` inside a shadcn `CardContent`, with nothing to anchor on but its
 * position relative to the title, and any xpath walking that structure breaks
 * the next time the card is restyled. Matching the actual stored text is both
 * sturdier and a stronger claim — it proves the UI renders *this lead's* copy,
 * not merely that some paragraph exists.
 */
export async function expectLeadDetailShowsCopy(
  page: Page,
  leadId: string,
  expectedCopy: string,
): Promise<void> {
  await page.goto(`${env.appUrl}/leads/${leadId}`);
  await dismissModals(page);
  await expect(page.getByText("Mensagem de Abordagem")).toBeVisible({ timeout: 30_000 });

  await expect(
    page.getByText("Nenhuma mensagem de abordagem ainda."),
    `Lead ${leadId} has copy in the database but the detail page shows the empty placeholder`,
  ).toBeHidden();

  // A distinctive slice, not the whole string: the paragraph preserves newlines
  // (`whitespace-pre-wrap`) and an exact full-text match is needlessly brittle.
  const excerpt = expectedCopy.trim().split(/\s+/).slice(0, 8).join(" ");
  await expect(
    page.getByText(excerpt, { exact: false }),
    `Detail page does not show the stored copy. Expected to find: "${excerpt}"`,
  ).toBeVisible({ timeout: 15_000 });
}
