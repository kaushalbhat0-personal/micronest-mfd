import { describe, expect, it } from "vitest";
import { classifyUrl } from "@/lib/native/links";

const WEB = "https://micronestmicrotools.vercel.app";

describe("native URL classification", () => {
  it("keeps same-origin app URLs internal", () => {
    expect(classifyUrl(`${WEB}/workspace/today`, WEB)).toBe("internal");
    expect(classifyUrl(`${WEB}/workspace/clients/abc`, WEB)).toBe("internal");
  });

  it("classifies tel: for the native dialer", () => {
    expect(classifyUrl("tel:+919876543210", WEB)).toBe("tel");
  });

  it("classifies WhatsApp hosts externally", () => {
    expect(classifyUrl("https://wa.me/919876543210?text=hi", WEB)).toBe("whatsapp");
    expect(classifyUrl("https://api.whatsapp.com/send?text=hi", WEB)).toBe("whatsapp");
    expect(classifyUrl("whatsapp://send?text=hi", WEB)).toBe("whatsapp");
  });

  it("rejects unknown external URLs", () => {
    expect(classifyUrl("https://evil.example.com/phish", WEB)).toBe("blocked");
    expect(classifyUrl("https://micronestmicrotools.vercel.app.evil.com/", WEB)).toBe(
      "blocked",
    );
  });

  it("blocks dangerous schemes and arbitrary custom schemes", () => {
    expect(classifyUrl("javascript:alert(1)", WEB)).toBe("blocked");
    expect(classifyUrl("data:text/html,hi", WEB)).toBe("blocked");
    expect(classifyUrl("myapp://auth/callback?code=x", WEB)).toBe("blocked");
  });

  it("routes only the dedicated native scheme to auth processing", () => {
    expect(classifyUrl("micronest://auth/callback?code=x", WEB)).toBe("auth-callback");
  });
});
