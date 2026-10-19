export const activeKey = "rj-mobile-active-user";
export const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : e && typeof e === "object" && "message" in e
      ? String(e.message)
      : "Não foi possível concluir a operação.";
