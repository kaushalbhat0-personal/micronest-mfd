import { UploadIcon } from "@/components/ui/icons";

/**
 * Import button icon. Lives in its own tiny module (outside
 * import-dialog) so Client Book action buttons never pull the deferred
 * import UI into the initial JavaScript payload.
 */
export function ImportTriggerIcon() {
  return <UploadIcon aria-hidden="true" className="mr-1.5 h-4 w-4" />;
}
