import { useEffect } from "react";

interface ExternalRedirectProps {
  to: string;
}

export function ExternalRedirect({ to }: ExternalRedirectProps) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return null;
}
