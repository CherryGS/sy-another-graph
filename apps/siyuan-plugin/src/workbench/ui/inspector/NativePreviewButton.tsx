import { useEffect, useRef, type ComponentProps } from "react";
import { Button } from "@/shared/ui/button";
import { bindNativePreview } from "../../../adapters/siyuan/bridge/native-preview";

export function NativePreviewButton({
  nativeId,
  ...props
}: ComponentProps<typeof Button> & { nativeId: string | null }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (nativeId && ref.current)
      return bindNativePreview(
        ref.current.querySelector<HTMLElement>("[data-native-preview-anchor]") ?? ref.current,
        nativeId,
      );
  }, [nativeId]);
  return <Button {...props} ref={ref} data-native-preview-id={nativeId ?? undefined} />;
}
