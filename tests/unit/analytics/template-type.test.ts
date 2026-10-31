import { describe, expect, it, vi } from "vitest";
import { parsePerfBeacon } from "@/lib/perf/schema";
import { trackTemplateDownload } from "@/lib/analytics";
import { reportValidation } from "@/lib/perf/report";

vi.mock("@/lib/perf/report", () => ({
  reportValidation: vi.fn(),
}));

const mockedReport = vi.mocked(reportValidation);

/**
 * Phase 2.7: template downloads may carry the generic/mfd family as a
 * closed allow-listed variant. No arbitrary strings, no PII, no new keys.
 */
describe("templateType analytics", () => {
  it("accepts the generic and mfd variants on template_download", () => {
    expect(
      parsePerfBeacon({ op: "validation.event", event: "template_download", templateType: "generic" }),
    ).toEqual({
      op: "validation.event",
      event: "template_download",
      templateType: "generic",
    });
    expect(
      parsePerfBeacon({ op: "validation.event", event: "template_download", templateType: "mfd" }),
    ).toEqual({
      op: "validation.event",
      event: "template_download",
      templateType: "mfd",
    });
  });

  it("stays backward compatible without a variant", () => {
    expect(parsePerfBeacon({ op: "validation.event", event: "template_download" })).toEqual({
      op: "validation.event",
      event: "template_download",
    });
  });

  it("rejects arbitrary variants, filenames, and PII-shaped keys", () => {
    expect(
      parsePerfBeacon({ op: "validation.event", event: "template_download", templateType: "wills" }),
    ).toBeNull();
    expect(
      parsePerfBeacon({
        op: "validation.event",
        event: "template_download",
        templateType: "micronest-mfd-client-template.csv",
      }),
    ).toBeNull();
    expect(
      parsePerfBeacon({ op: "validation.event", event: "template_download", clientName: "Asha" }),
    ).toBeNull();
    expect(
      parsePerfBeacon({ op: "validation.event", event: "template_download", phone: "+15551234567" }),
    ).toBeNull();
    expect(
      parsePerfBeacon({ op: "validation.event", event: "template_download", note: "hello" }),
    ).toBeNull();
  });

  it("emits only the allow-listed variant from the tracker", () => {
    mockedReport.mockClear();
    trackTemplateDownload("generic");
    trackTemplateDownload("mfd");
    trackTemplateDownload();
    expect(mockedReport).toHaveBeenCalledTimes(3);
    expect(mockedReport).toHaveBeenNthCalledWith(1, {
      op: "validation.event",
      event: "template_download",
      templateType: "generic",
    });
    expect(mockedReport).toHaveBeenNthCalledWith(2, {
      op: "validation.event",
      event: "template_download",
      templateType: "mfd",
    });
    expect(mockedReport).toHaveBeenNthCalledWith(3, {
      op: "validation.event",
      event: "template_download",
    });
  });

  it("degrades an unexpected tracker argument to the untyped event", () => {
    mockedReport.mockClear();
    trackTemplateDownload("micronest-mfd-client-template.csv" as "mfd");
    expect(mockedReport).toHaveBeenCalledTimes(1);
    expect(mockedReport).toHaveBeenCalledWith({
      op: "validation.event",
      event: "template_download",
    });
  });
});
