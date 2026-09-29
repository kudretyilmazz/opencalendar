export async function register() {
  // Node.js runtime only; the bootstrap pulls in pg, pg-boss and nodemailer.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootstrap } = await import("./lib/bootstrap");
  await bootstrap();
}
