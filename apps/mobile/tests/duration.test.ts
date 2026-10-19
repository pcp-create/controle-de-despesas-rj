import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/components/TripDuration";

describe("duração da viagem", () => {
  const start = "2026-09-10T10:00:00.000Z";
  it("recupera o tempo decorrido mesmo depois de ficar fora do app", () => {
    expect(formatDuration(start, Date.parse(start) + 3661000)).toBe("01:01:01");
  });
  it("não reinicia a contagem após 24 horas", () => {
    expect(formatDuration(start, Date.parse(start) + 90000000)).toBe(
      "25:00:00",
    );
  });
  it("não exibe duração negativa se o relógio retroceder", () => {
    expect(formatDuration(start, Date.parse(start) - 1000)).toBe("00:00:00");
  });
});
