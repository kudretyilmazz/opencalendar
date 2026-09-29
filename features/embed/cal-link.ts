/**
 * The calLink shapes the loader accepts (public/embed.js `buildUrl`), shared by the snippet
 * generator, the embed targets and the preview route so all three agree with the loader:
 * "erin", "erin/intro", "erin+olga/intro", "team/robin", "team/robin/discovery", "forms/<id>".
 */
const CAL_LINK = /^(team\/[\w-]+(\/[\w-]+)?|forms\/[\w-]+|[\w-]+(\+[\w-]+)*(\/[\w-]+)?)$/;
const MAX_CAL_LINK_LENGTH = 300;

export function isValidCalLink(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_CAL_LINK_LENGTH && CAL_LINK.test(value);
}
