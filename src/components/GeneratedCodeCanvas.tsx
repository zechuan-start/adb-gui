import { errorText, useT } from "@/i18n";
import { toAppError, type AppErrorPayload } from "@/i18n/errors";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import type { CodeType } from "@/lib/codeGenerator";
import { cn } from "@/lib/utils";

interface GeneratedCodeCanvasProps {
  codeType: CodeType;
  value: string;
  variant?: "list" | "preview";
}

export function GeneratedCodeCanvas({
  codeType,
  value,
  variant = "list",
}: GeneratedCodeCanvasProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<AppErrorPayload | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let active = true;
    setReady(false);
    setError(null);
    canvas.width = 0;
    canvas.height = 0;

    if (codeType === "qr") {
      const width = variant === "preview" ? 360 : 176;
      void QRCode.toCanvas(canvas, value, {
        width,
        margin: 4,
        errorCorrectionLevel: "M",
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then(() => {
          if (active) {
            setReady(true);
          }
        })
        .catch((generationError: unknown) => {
          if (active) {
            setError(formatGenerationError("qr", generationError));
          }
        });
    } else {
      try {
        let valid = true;
        JsBarcode(canvas, value, {
          format: "CODE128",
          width: variant === "preview" ? 3 : 2,
          height: variant === "preview" ? 112 : 72,
          margin: variant === "preview" ? 16 : 10,
          fontSize: variant === "preview" ? 20 : 14,
          background: "#ffffff",
          lineColor: "#000000",
          displayValue: true,
          valid: (isValid) => {
            valid = isValid;
          },
        });
        if (valid) {
          setReady(true);
        } else {
          setError({ code: "generator_unsupported_code128" });
        }
      } catch (generationError: unknown) {
        setError(formatGenerationError("code128", generationError));
      }
    }

    return () => {
      active = false;
    };
  }, [codeType, value, variant]);

  const isQrCode = codeType === "qr";

  return (
    <div
      className={cn(
        "relative flex w-full items-center bg-white",
        isQrCode
          ? "justify-center overflow-hidden"
          : "justify-start overflow-x-auto overflow-y-hidden",
        variant === "preview"
          ? isQrCode
            ? "h-[min(420px,62vh)] min-h-64"
            : "h-48"
          : isQrCode
            ? "h-44"
            : "h-28",
      )}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={codeType === "qr" ? t.codegen.generatedCodeCanvas.generatedQRCode : t.codegen.generatedCodeCanvas.generatedCode128Barcode}
        className={cn(
          "block shrink-0 bg-white",
          isQrCode && "max-h-full max-w-full",
          (!ready || error) && "invisible",
        )}
      />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-red-700">
          {errorText(error, t)}
        </div>
      )}
    </div>
  );
}

function formatGenerationError(format: CodeType, error: unknown): AppErrorPayload {
  return { code: "generator_render_failed", params: { format }, causes: [toAppError(error)] };
}
