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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let active = true;
    setReady(false);
    setError("");
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
            setError(formatGenerationError("二维码", generationError));
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
          setError("Code 128 不支持该内容");
        }
      } catch (generationError: unknown) {
        setError(formatGenerationError("Code 128", generationError));
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
        aria-label={codeType === "qr" ? "生成的二维码" : "生成的 Code 128 条形码"}
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
          {error}
        </div>
      )}
    </div>
  );
}

function formatGenerationError(label: string, error: unknown): string {
  if (error instanceof Error && error.message) {
    return `${label}生成失败: ${error.message}`;
  }
  return `${label}生成失败`;
}
