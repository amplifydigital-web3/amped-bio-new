import { useEffect, useRef, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { AlertCircle, Info } from "lucide-react";
import { Button } from "@repo/ui";
import type { Address } from "viem";
import { parseScannedAddress } from "./model";

type CameraState = "scanning" | "denied" | "failed";

// 063 I01: the Scan QR button renders only when the device has a camera
export function useHasCamera() {
  const [hasCamera, setHasCamera] = useState(false);
  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then(devices => active && setHasCamera(devices.some(device => device.kind === "videoinput")))
      .catch(() => active && setHasCamera(false));
    return () => {
      active = false;
    };
  }, []);
  return hasCamera;
}

/**
 * Screen Review 063 I02 to I04: the camera viewport inside the Send panel. A
 * valid scan selects the recipient and never skips ahead. An invalid code
 * keeps the camera running with an inline message.
 */
export function ScanQr({
  onScan,
  onCancel,
  onPaste,
}: {
  onScan: (address: Address) => void;
  onCancel: () => void;
  onPaste: () => void;
}) {
  const [state, setState] = useState<CameraState>("scanning");
  const [invalid, setInvalid] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="space-y-[13px] font-prism"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      {state === "scanning" ? (
        <>
          <div className="relative mx-auto aspect-square w-full max-w-[440px] overflow-hidden rounded-prism-21 bg-prism-ink">
            <Scanner
              key={attempt}
              formats={["qr_code"]}
              components={{ finder: false }}
              styles={{
                container: { width: "100%", height: "100%" },
                video: { objectFit: "cover" },
              }}
              onScan={codes => {
                const address = parseScannedAddress(codes.at(0)?.rawValue ?? "");
                if (address) onScan(address);
                else setInvalid(true);
              }}
              onError={error => {
                const name = (error as { name?: string } | null)?.name;
                setState(
                  name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed"
                );
              }}
            />
            {/* Corner markers only, in create light; no animated scan line */}
            <div aria-hidden className="pointer-events-none absolute inset-[13%]">
              <span className="absolute left-0 top-0 h-[34px] w-[34px] rounded-tl-prism-5 border-l-[3px] border-t-[3px] border-prism-create-light" />
              <span className="absolute right-0 top-0 h-[34px] w-[34px] rounded-tr-prism-5 border-r-[3px] border-t-[3px] border-prism-create-light" />
              <span className="absolute bottom-0 left-0 h-[34px] w-[34px] rounded-bl-prism-5 border-b-[3px] border-l-[3px] border-prism-create-light" />
              <span className="absolute bottom-0 right-0 h-[34px] w-[34px] rounded-br-prism-5 border-b-[3px] border-r-[3px] border-prism-create-light" />
            </div>
          </div>
          {invalid && (
            <p
              role="alert"
              className="prism-slab flex items-start gap-2 !rounded-prism-13 px-3 py-2 text-prism-meta text-prism-danger"
            >
              <AlertCircle aria-hidden className="mt-px h-[21px] w-[21px] shrink-0" />
              That code is not a wallet address. Scan another code or paste the address.
            </p>
          )}
          <p className="text-center text-prism-body text-prism-ink">
            Point your camera at a wallet QR code.
          </p>
        </>
      ) : (
        <div
          role="note"
          className="prism-glass-clear flex items-start gap-3 !rounded-prism-13 p-[13px]"
        >
          <Info aria-hidden className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-nav" />
          <div className="min-w-0 flex-1 text-prism-body text-prism-ink">
            <p>
              {state === "denied"
                ? "Camera access is off. Allow it in your browser settings, or paste the address."
                : "The camera did not start."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {state === "failed" && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAttempt(value => value + 1);
                    setState("scanning");
                  }}
                >
                  Retry
                </Button>
              )}
              <Button type="button" variant="ghost" className="-ml-3" onClick={onPaste}>
                Paste address
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-center">
        <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
