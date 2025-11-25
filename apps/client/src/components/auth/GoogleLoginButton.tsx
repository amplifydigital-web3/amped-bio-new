import { Button } from "../ui/Button";
import { FaGoogle } from "react-icons/fa6";

interface GoogleLoginButtonProps {
  onClick: () => void;
}

export function GoogleLoginButton({ onClick }: GoogleLoginButtonProps) {
  return (
    <Button
      variant="outline"
      className="w-full flex items-center justify-center gap-2"
      onClick={onClick}
    >
      <FaGoogle className="w-5 h-5" />
      <span>Continue with Google</span>
    </Button>
  );
}
